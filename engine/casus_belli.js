// engine/casus_belli.js — Этап CB-1: модель Casus Belli
//
// Casus Belli (CB) — правовой/политический повод для объявления войны.
// Без CB война считается «несправедливой» (unjust war) и накладывает
// штрафы на репутацию, стабильность, Aggressive Expansion.
//
// CB хранятся в GAME_STATE.casus_belli[] как записи:
//   {
//     id:           'cb_<holder>_<target>_t<turn>_<type>',
//     holder_id:    'syracuse',     // у кого CB
//     target_id:    'carthage',     // против кого
//     type:         'territorial_claim',
//     region_id:    'sicily_east',  // для territorial_claim/reconquest; null иначе
//     turn_created: 42,
//     turn_expires: 90,            // null = бессрочный
//     source:       'fabricated'|'automatic'|'event'|'mission'|'inherited',
//     notes:        'Fabricate via spy (syracuse)',
//   }
//
// Модуль предоставляет:
//   • CASUS_BELLI_TYPES     — каталог типов с модификаторами WS/AE/prestige и
//                              разрешёнными мирными требованиями
//   • registerCB(...)       — создание CB
//   • findCB(holder,target) — поиск активного CB (с учётом expiry)
//   • removeCB(id)          — явное удаление
//   • tickCbExpiry()        — ход-тик для expiring CB
//   • hasCB(...)            — удобный boolean-хелпер
//
// Зависит только от GAME_STATE.

'use strict';

// ──────────────────────────────────────────────────────────────
// Каталог CB-типов
// ──────────────────────────────────────────────────────────────
//
// Для каждого типа задано:
//   • label, description — человекочитаемые поля (UI)
//   • ae_mult            — множитель к AE при объявлении войны (1.0 = базовый +20 AE)
//   • ws_cost_mult       — множитель warscore-стоимости требований
//   • prestige_mult      — множитель престижа за победу
//   • allowed_demands[]  — какие требования доступны при подписании мира
//   • default_duration   — ходов до expiry (null = бессрочный)

export const CASUS_BELLI_TYPES = {

  // 1. Территориальная претензия — fabricate через шпиона
  territorial_claim: {
    label:       'Территориальная претензия',
    description: 'Шпионская кампания подготовила правовое обоснование на конкретный регион.',
    ae_mult:         1.00,
    ws_cost_mult:    1.00,
    prestige_mult:   1.00,
    allowed_demands: ['cede_region', 'reparations_5y', 'humiliate', 'armistice'],
    default_duration: 60,   // ходов (5 лет)
    requires_region:  true,
  },

  // 2. Реконкиста — автоматически если target держит бывший core
  reconquest: {
    label:       'Реконкиста',
    description: 'Возврат исконных земель, бывших нашим core-регионом.',
    ae_mult:         0.25,  // –75% AE
    ws_cost_mult:    0.75,  // –25% WS cost
    prestige_mult:   2.00,
    allowed_demands: ['cede_region', 'reparations_5y', 'armistice'],
    default_duration: null, // бессрочный (пока target держит core)
    requires_region:  true,
  },

  // 3. Династическая претензия — брак/наследство
  dynastic_claim: {
    label:       'Династическая претензия',
    description: 'Право престолонаследия через брак или родственные связи.',
    ae_mult:         1.00,
    ws_cost_mult:    1.40,
    prestige_mult:   2.00,
    allowed_demands: ['vassalize', 'force_tributary', 'reparations_10y', 'humiliate', 'armistice'],
    default_duration: 240,  // 20 лет
    requires_region:  false,
  },

  // 4. Установление гегемонии — event/rivalry
  hegemony: {
    label:       'Гегемония',
    description: 'Принудительное подчинение сферы влияния.',
    ae_mult:         1.25,
    ws_cost_mult:    1.00,
    prestige_mult:   1.50,
    allowed_demands: ['vassalize', 'force_tributary', 'reparations_10y', 'cancel_alliances', 'humiliate', 'armistice'],
    default_duration: 120,
    requires_region:  false,
  },

  // 5. Религиозная — разные религии
  religious: {
    label:       'Религиозное очищение',
    description: 'Война по религиозным мотивам против иноверцев.',
    ae_mult:         0.75,
    ws_cost_mult:    1.00,
    prestige_mult:   2.00,
    allowed_demands: ['cede_region', 'force_religion', 'reparations_5y', 'plunder_treasury', 'armistice'],
    default_duration: null,
    requires_region:  false,
  },

  // 6. Месть за оскорбление — event
  humiliation: {
    label:       'Месть за оскорбление',
    description: 'Посол унижён, договор дерзко нарушен, национальная честь требует сатисфакции.',
    ae_mult:         1.00,
    ws_cost_mult:    0.75,
    prestige_mult:   2.00,
    allowed_demands: ['reparations_5y', 'reparations_10y', 'plunder_treasury', 'humiliate', 'cancel_alliances', 'armistice'],
    default_duration: 36,   // 3 года
    requires_region:  false,
  },

  // 7. Торговый конфликт — эмбарго
  trade_dispute: {
    label:       'Торговый конфликт',
    description: 'Эмбарго или блокада торговых путей нашего народа.',
    ae_mult:         1.00,
    ws_cost_mult:    1.00,
    prestige_mult:   1.00,
    allowed_demands: ['reparations_5y', 'reparations_10y', 'plunder_treasury', 'cancel_alliances', 'armistice'],
    default_duration: 36,
    requires_region:  false,
  },

  // 8. Карательный — нарушение договора
  punitive: {
    label:       'Карательный',
    description: 'Противник нарушил договор (перемирие, пакт о ненападении, клятву вассала).',
    ae_mult:         0.00,  // без штрафа AE — справедливая война
    ws_cost_mult:    0.75,
    prestige_mult:   1.50,
    allowed_demands: ['cede_region', 'vassalize', 'force_tributary', 'reparations_10y', 'plunder_treasury', 'cancel_alliances', 'humiliate', 'armistice'],
    default_duration: 24,   // 2 года после breach
    requires_region:  false,
  },

  // 9. Набег — только tribal/nomadic personality
  tribal_raid: {
    label:       'Набег',
    description: 'Племенной набег за добычей — без цессии земель.',
    ae_mult:         0.50,
    ws_cost_mult:    0.50,
    prestige_mult:   0.50,
    allowed_demands: ['plunder_treasury', 'armistice'],
    default_duration: 12,
    requires_region:  false,
  },
};

// ──────────────────────────────────────────────────────────────
// Стоимость мирных требований в WarScore
// ──────────────────────────────────────────────────────────────

export const PEACE_DEMAND_COSTS = {
  cede_region: {
    label: 'Цессия региона',
    // Базовая стоимость + зависимость от населения (рассчитывается динамически)
    base: 8,
    per_10k_pop: 1,
    max: 22,
  },
  vassalize: {
    label: 'Вассализация',
    base: 30,
    max:  30,
  },
  force_tributary: {
    label: 'Данничество',
    base: 20,
    max:  20,
  },
  reparations_5y: {
    label: 'Репарации (5 лет)',
    base: 10,
    max:  10,
  },
  reparations_10y: {
    label: 'Репарации (10 лет)',
    base: 18,
    max:  18,
  },
  force_religion: {
    label: 'Смена религии',
    base: 25,
    max:  25,
  },
  plunder_treasury: {
    label: 'Разовая контрибуция (25% казны)',
    base: 10,
    max:  10,
  },
  cancel_alliances: {
    label: 'Расторжение альянсов',
    base: 10,
    max:  10,
  },
  humiliate: {
    label: 'Унижение',
    base: 5,
    max:  5,
  },
  armistice: {
    label: 'Перемирие',
    base: 0,
    max:  0,
  },
};

// ──────────────────────────────────────────────────────────────
// Инициализация
// ──────────────────────────────────────────────────────────────

export function initCasusBelli() {
  if (typeof GAME_STATE === 'undefined') return;
  if (!Array.isArray(GAME_STATE.casus_belli)) GAME_STATE.casus_belli = [];
}

// ──────────────────────────────────────────────────────────────
// API
// ──────────────────────────────────────────────────────────────

/**
 * Создать новый CB.
 * @returns новый объект CB или null если CB невалиден.
 */
export function registerCB({ holder_id, target_id, type, region_id = null, source = 'automatic', notes = '', duration_override = undefined }) {
  initCasusBelli();
  const tDef = CASUS_BELLI_TYPES[type];
  if (!tDef) return null;
  if (!holder_id || !target_id || holder_id === target_id) return null;
  if (tDef.requires_region && !region_id) return null;

  const turn = GAME_STATE.turn ?? 1;
  const duration = (duration_override !== undefined) ? duration_override : tDef.default_duration;
  const turn_expires = duration ? turn + duration : null;

  // Дедупликация: если уже есть активный CB того же типа с той же регион-целью — обновить expiry.
  const existing = GAME_STATE.casus_belli.find(cb =>
    cb.holder_id === holder_id && cb.target_id === target_id &&
    cb.type === type && cb.region_id === region_id && !cb.consumed
  );
  if (existing) {
    existing.turn_expires = turn_expires;
    existing.source       = source;
    existing.notes        = notes || existing.notes;
    return existing;
  }

  const cb = {
    id: `cb_${holder_id}_${target_id}_t${turn}_${type}${region_id ? '_' + region_id : ''}`,
    holder_id, target_id, type, region_id,
    turn_created: turn,
    turn_expires,
    source,
    notes,
    consumed: false,   // true после использования в declareWar
  };
  GAME_STATE.casus_belli.push(cb);
  return cb;
}

/**
 * Найти активный (неистёкший, не-consumed) CB, принадлежащий holder против target.
 * Если typeFilter указан — только этого типа. Возвращает самый свежий.
 */
export function findCB(holder_id, target_id, typeFilter = null) {
  initCasusBelli();
  const turn = GAME_STATE.turn ?? 1;
  const candidates = GAME_STATE.casus_belli.filter(cb =>
    cb.holder_id === holder_id &&
    cb.target_id === target_id &&
    !cb.consumed &&
    (cb.turn_expires === null || cb.turn_expires > turn) &&
    (!typeFilter || cb.type === typeFilter)
  );
  // Выбираем с наиболее выгодными модификаторами (минимальный ae_mult)
  candidates.sort((a, b) => {
    const aAe = CASUS_BELLI_TYPES[a.type]?.ae_mult ?? 1;
    const bAe = CASUS_BELLI_TYPES[b.type]?.ae_mult ?? 1;
    if (aAe !== bAe) return aAe - bAe;
    return (b.turn_created ?? 0) - (a.turn_created ?? 0);
  });
  return candidates[0] ?? null;
}

/** Есть ли у holder хотя бы один активный CB против target? */
export function hasCB(holder_id, target_id) {
  return findCB(holder_id, target_id) !== null;
}

/** Пометить CB как использованный (consumed) — он больше не отображается в findCB. */
export function consumeCB(cbId) {
  initCasusBelli();
  const cb = GAME_STATE.casus_belli.find(x => x.id === cbId);
  if (cb) cb.consumed = true;
  return cb;
}

/** Удалить CB явно. */
export function removeCB(cbId) {
  initCasusBelli();
  const idx = GAME_STATE.casus_belli.findIndex(x => x.id === cbId);
  if (idx >= 0) GAME_STATE.casus_belli.splice(idx, 1);
}

/**
 * Ход-тик: удаляем истёкшие и consumed CB старше 50 ходов (чистка GAME_STATE).
 * Вызывается из processTurn.
 */
export function tickCbExpiry() {
  initCasusBelli();
  const turn = GAME_STATE.turn ?? 1;
  GAME_STATE.casus_belli = GAME_STATE.casus_belli.filter(cb => {
    // Истёкший бессрочный — не удалять (null = бессрочный)
    if (cb.turn_expires !== null && cb.turn_expires <= turn) {
      // Держим ещё 3 хода для UI-логов, потом выкидываем
      if (cb.turn_expires + 3 <= turn) return false;
    }
    // Consumed — держим 30 ходов для истории
    if (cb.consumed && cb.turn_created + 30 <= turn) return false;
    return true;
  });
}

/** Все активные CB holder'а (для UI). */
export function listCBsOf(holder_id) {
  initCasusBelli();
  const turn = GAME_STATE.turn ?? 1;
  return GAME_STATE.casus_belli.filter(cb =>
    cb.holder_id === holder_id &&
    !cb.consumed &&
    (cb.turn_expires === null || cb.turn_expires > turn)
  );
}

/**
 * Разрешено ли конкретное требование для данного CB-типа?
 * Возвращает true, если demand входит в allowed_demands CB.
 */
export function isDemandAllowed(cbType, demandKey) {
  const tDef = CASUS_BELLI_TYPES[cbType];
  if (!tDef) return false;
  return tDef.allowed_demands.includes(demandKey);
}

// ──────────────────────────────────────────────────────────────
// Aggressive Expansion (AE) — индикатор «страха соседей»
// ──────────────────────────────────────────────────────────────
//
// nation._ae_score ∈ [0, 100].
//   +0…+30 при war-actions (объявление войны, аннексия, вассализация)
//   decay ≈ 0.3/ход (10 в год)
//
// Пороги:
//   50 → соседи получают coalition_cb против нации
//   80 → союзники могут выходить из альянсов
//
// Тип CB даёт множитель: reconquest ×0.25, punitive ×0.0, humiliation ×1.0,
// tribal_raid ×0.5, без CB ×1.5 (т.е. unjust war — самый дорогой).

export const AE_CONFIG = {
  DECAY_PER_TURN:       0.3,
  MAX:                  100,
  DECLARE_WAR_BASE:     20,    // базовое начисление при объявлении войны
  UNJUST_WAR_BASE:      30,    // если без CB
  DECLARE_WAR_MULT_NOCB: 1.5,
  CEDE_REGION_BASE:     10,    // +10 AE при аннексии региона
  VASSALIZE_BASE:       15,
  FABRICATE_DETECTED:   10,
  COALITION_THRESHOLD:  50,
  ALLIANCE_BREAK_THRESHOLD: 80,
};

/** Получить текущее значение AE. */
export function getAeScore(nationId) {
  const n = GAME_STATE?.nations?.[nationId];
  return Math.max(0, Math.min(AE_CONFIG.MAX, n?._ae_score ?? 0));
}

/** Начислить AE с лимитом и логом. */
export function addAeScore(nationId, amount, reason = 'unknown') {
  if (!nationId || !amount) return 0;
  const n = GAME_STATE?.nations?.[nationId];
  if (!n) return 0;
  const before = n._ae_score ?? 0;
  const after = Math.max(0, Math.min(AE_CONFIG.MAX, before + amount));
  n._ae_score = after;
  // Трекер причин — для отладки/UI
  if (!Array.isArray(n._ae_log)) n._ae_log = [];
  n._ae_log.push({ turn: GAME_STATE.turn ?? 0, delta: amount, reason, score_after: after });
  if (n._ae_log.length > 50) n._ae_log.shift();
  return after;
}

/**
 * Ход-тик: decay AE у всех наций.
 */
export function tickAeDecay() {
  if (!GAME_STATE?.nations) return;
  const decay = AE_CONFIG.DECAY_PER_TURN;
  for (const nId in GAME_STATE.nations) {
    const n = GAME_STATE.nations[nId];
    if (!n) continue;
    if (typeof n._ae_score === 'number' && n._ae_score > 0) {
      n._ae_score = Math.max(0, n._ae_score - decay);
    }
  }
}

/** Рассчитать стоимость объявления войны в AE с учётом CB-типа. */
export function computeWarDeclarationAeCost(cbType) {
  const tDef = CASUS_BELLI_TYPES[cbType];
  if (!tDef) {
    // Без CB — unjust war
    return Math.round(AE_CONFIG.UNJUST_WAR_BASE * AE_CONFIG.DECLARE_WAR_MULT_NOCB);
  }
  return Math.round(AE_CONFIG.DECLARE_WAR_BASE * (tDef.ae_mult ?? 1.0));
}

// ──────────────────────────────────────────────────────────────
// Автоматические триггеры CB
// ──────────────────────────────────────────────────────────────

/**
 * Тик каждые 3 хода: проверяем все нации на наличие оснований для
 * автоматических CB (reconquest, trade_dispute). Punitive триггерится
 * inline при нарушении договора в diplomacy.js.
 */
export function tickAutomaticCB() {
  if (typeof GAME_STATE === 'undefined') return;
  if (!GAME_STATE.nations) return;

  const turn = GAME_STATE.turn ?? 1;
  if (turn % 3 !== 0) return;   // reduce perf cost — каждые 3 хода

  const nationIds = Object.keys(GAME_STATE.nations);

  // ── reconquest: target держит бывший core observerа ─────────
  for (const regionId in (GAME_STATE.regions ?? {})) {
    const region = GAME_STATE.regions[regionId];
    if (!region) continue;
    const coreOf = region._core_of;
    if (!coreOf) continue;
    const currentOwner = region.nation;
    if (!currentOwner || currentOwner === coreOf) continue;
    // core-страна всё ещё существует?
    const coreNation = GAME_STATE.nations[coreOf];
    if (!coreNation || !coreNation.regions || coreNation.regions.length === 0) continue;
    // Регистрируем reconquest CB (бессрочный, пока target держит core)
    registerCB({
      holder_id:  coreOf,
      target_id:  currentOwner,
      type:       'reconquest',
      region_id:  regionId,
      source:     'automatic',
      notes:      `Бывший core-регион, ныне у ${currentOwner}`,
    });
  }

  // ── trade_dispute: target ведёт эмбарго против observerа ────
  for (const nId of nationIds) {
    const nation = GAME_STATE.nations[nId];
    const embargoes = nation?._embargoes_active;
    if (!Array.isArray(embargoes)) continue;
    for (const targetId of embargoes) {
      if (!GAME_STATE.nations[targetId]) continue;
      // observer = тот, против кого эмбарго; holder CB — observer.
      registerCB({
        holder_id: targetId,
        target_id: nId,
        type:      'trade_dispute',
        source:    'automatic',
        notes:     `Эмбарго со стороны ${nId}`,
      });
    }
  }
}

/**
 * Вызывается из breakTreaty() при нарушении договора.
 * Жертве нарушения даётся 'punitive' CB против нарушителя на 24 хода.
 */
export function grantPunitiveCB(breakerNationId, victimNationId, treatyType) {
  return registerCB({
    holder_id: victimNationId,
    target_id: breakerNationId,
    type:      'punitive',
    source:    'automatic',
    notes:     `Нарушение договора: ${treatyType}`,
  });
}

// ──────────────────────────────────────────────────────────────
// Coalition system (CB-12)
// ──────────────────────────────────────────────────────────────
//
// При высоком AE (≥50) соседи жертвы получают шанс автоматически
// присоединиться к обороне через coalition-CB. При ≥80 союзники
// агрессора могут выйти из альянсов.
//
// Вызов: tickCoalitionCheck() — каждые 6 ходов, после tickAutomaticCB.

export function tickCoalitionCheck() {
  if (!GAME_STATE?.nations) return;
  const turn = GAME_STATE.turn ?? 1;
  if (turn % 6 !== 0) return;

  for (const aggId in GAME_STATE.nations) {
    const agg = GAME_STATE.nations[aggId];
    const ae = getAeScore(aggId);

    // Порог 50 — соседи жертвы хотят коалицию.
    if (ae >= AE_CONFIG.COALITION_THRESHOLD) {
      // Находим активные войны, где agg = атакующий.
      const wars = (GAME_STATE.wars ?? []).filter(w =>
        w.status === 'active' && w.attacker === aggId
      );
      for (const war of wars) {
        const victimId = war.defender;
        const victim = GAME_STATE.nations[victimId];
        if (!victim?.regions?.length) continue;
        // Соседи жертвы, которые не союзники агрессора.
        const victimRegions = victim.regions;
        if (!victimRegions.length) continue;
        // Простой способ — соседние нации по MAP_REGIONS.
        const neighbors = new Set();
        if (typeof MAP_REGIONS !== 'undefined') {
          for (const rId of victimRegions) {
            const m = MAP_REGIONS[rId];
            if (!m?.connections) continue;
            for (const nId of m.connections) {
              const r = GAME_STATE.regions?.[nId];
              if (!r?.nation) continue;
              if (r.nation === aggId || r.nation === victimId) continue;
              neighbors.add(r.nation);
            }
          }
        }
        // Каждый сосед с плохим отношением к агрессору → coalition CB
        // (hegemony-типа, используется против агрессора)
        for (const neighborId of neighbors) {
          const neighbor = GAME_STATE.nations[neighborId];
          const rel = neighbor?.relations?.[aggId]?.score ?? 0;
          // Шанс вступления = ae/100 × (1 − own_ae/100) × agression_threshold
          const ownAe = getAeScore(neighborId);
          const chance = (ae / 100) * Math.max(0.1, 1 - ownAe / 100) * (rel < -20 ? 1.0 : 0.3);
          if (Math.random() < chance) {
            registerCB({
              holder_id: neighborId,
              target_id: aggId,
              type:      'hegemony',
              source:    'automatic',
              notes:     `Coalition against ${aggId} (AE=${Math.round(ae)})`,
            });
          }
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Long-term stabilizers (CB-13)
// ──────────────────────────────────────────────────────────────
//
// Проверки, предотвращающие «всех сожрать» в долгосрочных прогонах.

/**
 * Проверить, может ли attacker вассализировать loser.
 * Правило: pop(attacker) не должен быть > 50× pop(loser) — иначе
 * вассализация запрещена (антиблоббинг).
 */
export function canVassalize(attackerId, loserId) {
  const a = GAME_STATE?.nations?.[attackerId];
  const l = GAME_STATE?.nations?.[loserId];
  if (!a || !l) return false;
  const popA = a.population?.total ?? 0;
  const popL = l.population?.total ?? 0;
  if (popL <= 0) return false;
  return popA / popL < 50;
}

/**
 * Проверить war_exhaustion hardcap: если у нации > 80, она не может
 * объявить новую войну на 24 хода.
 */
export function isWarExhausted(nationId) {
  const n = GAME_STATE?.nations?.[nationId];
  if (!n) return false;
  const we = n.military?.war_exhaustion ?? 0;
  if (we > 80) return true;
  // Трек defeats за последние 100 ходов
  const turn = GAME_STATE?.turn ?? 0;
  const recentDefeats = (n._defeat_history ?? []).filter(d => (turn - d) < 100);
  if (recentDefeats.length >= 5) {
    const last = recentDefeats[recentDefeats.length - 1];
    if ((turn - last) < 24) return true;
  }
  return false;
}

/** Базовая стоимость требования в WS (с учётом региона для cede_region). */
export function getDemandWsCost(demandKey, context = {}) {
  const d = PEACE_DEMAND_COSTS[demandKey];
  if (!d) return 0;
  if (demandKey === 'cede_region') {
    const regionId = context.region_id;
    const region = (typeof GAME_STATE !== 'undefined') ? GAME_STATE.regions?.[regionId] : null;
    const pop = region?.population?.total ?? region?.population ?? 0;
    return Math.min(d.max, d.base + Math.floor(pop / 10000) * d.per_10k_pop);
  }
  return d.base;
}
