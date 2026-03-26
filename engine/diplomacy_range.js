// ══════════════════════════════════════════════════════════════════════
// DIPLOMACY RANGE — дипломатический охват и анти-сноуболл
//
// Зоны (BFS от регионов игрока):
//   Tier 1 (≤ RANGE_NEAR хопов) — полная дипломатия, Claude Sonnet
//   Tier 2 (≤ RANGE_MID  хопов) — ограниченная дипломатия, Claude Haiku
//   Tier 3 (>  RANGE_MID хопов) — только FallbackAI, игрок не может взаимодействовать
//
// Послы (+3 хопа) и торговые маршруты (+1 хоп) расширяют диапазон.
// Кэш BFS пересчитывается каждые 12 ходов или при force-refresh.
//
// Анти-сноуболл (3 механизма):
//   1. Усталость от завоеваний — штраф стабильности и риск восстания
//   2. Коалиционный рефлекс  — соседи агрессора сближаются между собой
//   3. Логистический предел  — снабжение армий падает вдали от дома
// ══════════════════════════════════════════════════════════════════════

const DIPLO_CFG = {
  // ── Зоны охвата ──────────────────────────────────────────────────
  RANGE_NEAR: 4,          // ≤ 4 хопов  → Tier 1 (Sonnet + полная дипломатия)
  RANGE_MID:  8,          // ≤ 8 хопов  → Tier 2 (Haiku + ограниченная)
                          // > 8 хопов  → Tier 3 (Fallback, недоступна игроку)

  AMBASSADOR_BONUS: 3,    // посол к нации: диапазон -3 хопа
  TRADE_BONUS:      1,    // активный торговый маршрут: -1 хоп

  CACHE_INTERVAL:   12,   // ходов между пересчётами BFS

  // ── Усталость от завоеваний ──────────────────────────────────────
  FATIGUE_MULT:         1.5, // порог = base_regions × FATIGUE_MULT
  FATIGUE_STABILITY:    2,   // -N стабильности/ход за каждый лишний регион
  FATIGUE_REVOLT_BASE:  4,   // % шанс восстания за каждый лишний регион
  FATIGUE_REVOLT_WINDOW: 24, // восстание только в регионах, захваченных ≤N ходов назад

  // ── Коалиционный рефлекс ─────────────────────────────────────────
  COALITION_THRESHOLD:   3,  // захватить за 12 ходов → триггер
  COALITION_REL_HIT:   -30,  // штраф к отношениям соседей с агрессором
  COALITION_ALLY_BONUS:  20, // бонус к отношениям между соседями-жертвами
  COALITION_ALLY_CHANCE: 0.4,// вероятность появления оборонительного союза

  // ── Логистический предел ─────────────────────────────────────────
  LOGISTICS_FREE:      5,  // ходов вдали от домашней территории без штрафа
  LOGISTICS_PEN_RATE:  5,  // % снабжения за каждый ход сверх лимита
  LOGISTICS_MAX_PEN:  30,  // максимальный штраф % за ход
};

// ── Кэш расстояний ────────────────────────────────────────────────────

let _regionDistCache = {};  // regionId → хопов от ближайшего региона игрока
let _nationDistCache  = {};  // nationId → минимальное расстояние
let _cacheComputedAt  = -999;

// ══════════════════════════════════════════════════════════════════════
// BFS — расстояния от территории игрока
// ══════════════════════════════════════════════════════════════════════

/**
 * Пересчитать кэш расстояний (BFS от всех регионов игрока).
 * Вызывается автоматически при обращении к getDiploDistance().
 */
function refreshDiploDistances(forceRefresh) {
  const turn = GAME_STATE.turn ?? 1;
  if (!forceRefresh && turn - _cacheComputedAt < DIPLO_CFG.CACHE_INTERVAL) return;

  _regionDistCache = _bfsFromNationRegions(GAME_STATE.player_nation);

  _nationDistCache = {};
  for (const [nId, nation] of Object.entries(GAME_STATE.nations ?? {})) {
    if (nId === GAME_STATE.player_nation) { _nationDistCache[nId] = 0; continue; }
    const regions = nation.regions ?? [];
    let minDist = Infinity;
    for (const rId of regions) {
      const d = _regionDistCache[rId];
      if (d !== undefined && d < minDist) minDist = d;
    }
    _nationDistCache[nId] = isFinite(minDist) ? minDist : 999;
  }

  _cacheComputedAt = turn;
}

/**
 * BFS от всех регионов нации.
 * @returns {Object} regionId → хопов
 */
function _bfsFromNationRegions(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return {};

  const dist  = {};
  const queue = [];

  for (const rId of (nation.regions ?? [])) {
    if (GAME_STATE.regions?.[rId]) {
      dist[rId] = 0;
      queue.push(rId);
    }
  }

  for (let i = 0; i < queue.length; i++) {
    const rId  = queue[i];
    const d    = dist[rId];
    const conn = GAME_STATE.regions?.[rId]?.connections;
    if (!conn) continue;
    for (const nb of conn) {
      if (dist[nb] === undefined) {
        dist[nb] = d + 1;
        queue.push(nb);
      }
    }
  }

  return dist;
}

// ══════════════════════════════════════════════════════════════════════
// ПУБЛИЧНЫЙ API
// ══════════════════════════════════════════════════════════════════════

/**
 * Расстояние от территории игрока до ближайшего региона нации (хопов).
 * Учитывает бонусы от послов и торговых маршрутов.
 */
function getDiploDistance(nationId) {
  if (nationId === GAME_STATE.player_nation) return 0;
  refreshDiploDistances();

  let dist = _nationDistCache[nationId] ?? 999;

  // Бонус посла
  const playerNation = GAME_STATE.nations?.[GAME_STATE.player_nation];
  const hasAmbassador = (playerNation?.characters ?? []).some(
    c => c.alive !== false && c.role === 'ambassador' && c.target_nation === nationId
  );
  if (hasAmbassador) dist -= DIPLO_CFG.AMBASSADOR_BONUS;

  // Бонус торгового маршрута
  const tradePartners = playerNation?.economy?.trade_partners ?? [];
  if (tradePartners.includes(nationId)) dist -= DIPLO_CFG.TRADE_BONUS;

  return Math.max(0, dist);
}

/**
 * Уровень дипломатического доступа к нации.
 * 1 = полный (Sonnet), 2 = частичный (Haiku), 3 = нет (только fallback)
 */
function getNationTier(nationId) {
  const d = getDiploDistance(nationId);
  if (d <= DIPLO_CFG.RANGE_NEAR) return 1;
  if (d <= DIPLO_CFG.RANGE_MID)  return 2;
  return 3;
}

/**
 * Может ли игрок взаимодействовать с нацией (Tier 1 или 2)?
 */
function canPlayerInteract(nationId) {
  return getNationTier(nationId) <= 2;
}

/**
 * Полная дипломатия (Tier 1 — предложения, союзы, войны)?
 */
function canPlayerDiplomate(nationId) {
  return getNationTier(nationId) === 1;
}

// ══════════════════════════════════════════════════════════════════════
// АНТИ-СНОУБОЛЛ — 1. УСТАЛОСТЬ ОТ ЗАВОЕВАНИЙ
// ══════════════════════════════════════════════════════════════════════

/**
 * Вызывается каждый ход из processTurn().
 * Применяет штрафы к нациям, захватившим слишком много регионов.
 */
function processConquestFatigue() {
  const turn = GAME_STATE.turn ?? 1;

  for (const [nId, nation] of Object.entries(GAME_STATE.nations ?? {})) {
    if (nation.is_player) continue;

    const currentRegions = (nation.regions ?? []).length;

    // Инициализируем базу при первом вызове
    if (nation._base_regions == null) {
      nation._base_regions = currentRegions;
      continue;
    }

    const threshold = Math.ceil(nation._base_regions * DIPLO_CFG.FATIGUE_MULT);
    const excess    = Math.max(0, currentRegions - threshold);
    nation._conquest_fatigue = excess;

    if (excess <= 0) {
      nation._fatigue_upkeep_mult = 1.0;
      continue;
    }

    // Штраф стабильности
    if (nation.government?.stability !== undefined) {
      nation.government.stability = Math.max(
        0,
        nation.government.stability - DIPLO_CFG.FATIGUE_STABILITY * excess
      );
    }

    // Мультипликатор стоимости содержания армии (читается в economy.js)
    nation._fatigue_upkeep_mult = 1.0 + excess * 0.12;

    // Шанс восстания в недавно захваченных провинциях
    _tryConquestRevolt(nId, nation, excess, turn);
  }
}

function _tryConquestRevolt(nationId, nation, excess, turn) {
  const recent = (nation.regions ?? []).filter(rId => {
    const r = GAME_STATE.regions?.[rId];
    return r?._conquest_turn && (turn - r._conquest_turn) <= DIPLO_CFG.FATIGUE_REVOLT_WINDOW;
  });
  if (recent.length === 0) return;

  const revoltChance = (DIPLO_CFG.FATIGUE_REVOLT_BASE * excess) / 100;
  if (Math.random() >= revoltChance) return;

  // Выбираем случайный недавно захваченный регион
  const rId    = recent[Math.floor(Math.random() * recent.length)];
  const region = GAME_STATE.regions[rId];
  if (!region) return;

  // Регион становится нейтральным (восстание)
  const prevNation = region.nation;
  region.nation = 'neutral';
  nation.regions = (nation.regions ?? []).filter(r => r !== rId);
  delete region._conquest_turn;

  if (typeof addEventLog === 'function') {
    addEventLog(
      `🔥 Восстание в ${region.name ?? rId}! Регион отпал от ${nation.name}. `
      + `(Усталость от завоеваний: +${excess} лишних провинций)`,
      'military'
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// АНТИ-СНОУБОЛЛ — 2. КОАЛИЦИОННЫЙ РЕФЛЕКС
// ══════════════════════════════════════════════════════════════════════

/**
 * Вызывается каждый ход из processTurn().
 * Если нация слишком быстро расширялась — соседи сближаются.
 */
function checkCoalitionReflex() {
  const turn = GAME_STATE.turn ?? 1;

  for (const [nId, nation] of Object.entries(GAME_STATE.nations ?? {})) {
    if (nation.is_player) continue;

    // Сброс счётчика каждые 12 ходов
    if (
      nation._expansion_window_start == null ||
      (turn - nation._expansion_window_start) >= 12
    ) {
      nation._expansion_window_start  = turn;
      nation._expansion_this_window   = 0;
      continue;
    }

    const expanded = nation._expansion_this_window ?? 0;
    if (expanded < DIPLO_CFG.COALITION_THRESHOLD) continue;

    // Тригер: нация захватила COALITION_THRESHOLD+ регионов за окно
    _triggerCoalition(nId, nation);
    // Сбрасываем счётчик чтобы не спамить
    nation._expansion_this_window = 0;
  }
}

function _triggerCoalition(aggressorId, aggressor) {
  const neighbors = _getNeighborNations(aggressorId);
  if (neighbors.length === 0) return;

  let allianceFormed = false;

  for (const nId of neighbors) {
    const nation = GAME_STATE.nations?.[nId];
    if (!nation || nation.is_player) continue;

    // Штраф к отношениям с агрессором
    _adjustRelation(nId, aggressorId, DIPLO_CFG.COALITION_REL_HIT);

    // Шанс сблизиться с другим соседом
    if (!allianceFormed && Math.random() < DIPLO_CFG.COALITION_ALLY_CHANCE) {
      const ally = neighbors.find(n => n !== nId && GAME_STATE.nations?.[n] && !GAME_STATE.nations[n].is_player);
      if (ally) {
        _adjustRelation(nId, ally, DIPLO_CFG.COALITION_ALLY_BONUS);
        _adjustRelation(ally, nId, DIPLO_CFG.COALITION_ALLY_BONUS);
        allianceFormed = true;

        if (typeof addEventLog === 'function') {
          const n1 = GAME_STATE.nations[nId]?.name   ?? nId;
          const n2 = GAME_STATE.nations[ally]?.name  ?? ally;
          const ag = aggressor.name ?? aggressorId;
          addEventLog(
            `🤝 ${n1} и ${n2} сближаются перед угрозой экспансии ${ag}.`,
            'diplomacy'
          );
        }
      }
    }
  }

  if (typeof addEventLog === 'function') {
    addEventLog(
      `⚠️ Коалиционный рефлекс: соседи ${aggressor.name ?? aggressorId} `
      + `недовольны быстрой экспансией (захвачено ${GAME_STATE.nations[aggressorId]?._expansion_this_window ?? '?'} регионов).`,
      'diplomacy'
    );
  }
}

// ── Вспомогательные ──────────────────────────────────────────────────

function _getNeighborNations(nationId) {
  const nation  = GAME_STATE.nations?.[nationId];
  const result  = new Set();

  for (const rId of (nation?.regions ?? [])) {
    const conn = GAME_STATE.regions?.[rId]?.connections ?? [];
    for (const nb of conn) {
      const owner = GAME_STATE.regions?.[nb]?.nation;
      if (owner && owner !== nationId && owner !== 'neutral' && owner !== 'ocean') {
        result.add(owner);
      }
    }
  }
  return Array.from(result);
}

function _adjustRelation(fromId, toId, delta) {
  // Обновляем DiplomacyEngine если доступен
  if (typeof DiplomacyEngine !== 'undefined') {
    try {
      const current = DiplomacyEngine.getRelationScore(fromId, toId);
      DiplomacyEngine._store?.set?.(`${fromId}:${toId}`, Math.max(-100, Math.min(100, current + delta)));
    } catch (_) {}
  }

  // Синхронизируем legacy relations
  const nation = GAME_STATE.nations?.[fromId];
  if (!nation) return;
  if (!nation.relations)         nation.relations         = {};
  if (!nation.relations[toId])   nation.relations[toId]   = { score: 0, at_war: false };
  nation.relations[toId].score = Math.max(-100, Math.min(100,
    (nation.relations[toId].score ?? 0) + delta
  ));
}

// ══════════════════════════════════════════════════════════════════════
// АНТИ-СНОУБОЛЛ — 3. ЛОГИСТИЧЕСКИЙ ПРЕДЕЛ
// ══════════════════════════════════════════════════════════════════════

/**
 * Обновить таймер нахождения армии вдали от дома.
 * Вызывается из _processSupply() в armies.js.
 */
function updateArmyLogisticTimer(army) {
  const region = GAME_STATE.regions?.[army.position];
  const isHome = region?.nation === army.nation;

  if (isHome) {
    army._turns_away_from_home = 0;
  } else {
    army._turns_away_from_home = (army._turns_away_from_home ?? 0) + 1;
  }
}

/**
 * Рассчитать штраф снабжения за дальность от родной территории (% за ход).
 */
function calcLogisticPenalty(army) {
  // Не применяем к флоту и стоящим дома
  if (army.type === 'naval') return 0;
  const away  = army._turns_away_from_home ?? 0;
  const excess = Math.max(0, away - DIPLO_CFG.LOGISTICS_FREE);
  return Math.min(DIPLO_CFG.LOGISTICS_MAX_PEN, excess * DIPLO_CFG.LOGISTICS_PEN_RATE);
}

// ══════════════════════════════════════════════════════════════════════
// СВОДКА (для UI)
// ══════════════════════════════════════════════════════════════════════

/**
 * Вернуть объект с информацией о зоне нации для отображения в UI.
 * { tier, distance, label, canInteract, canDiplomate }
 */
function getDiploRangeInfo(nationId) {
  const d    = getDiploDistance(nationId);
  const tier = getNationTier(nationId);
  const labels = {
    1: 'В зоне охвата',
    2: 'Дальние связи',
    3: 'За горизонтом',
  };
  return {
    tier,
    distance:    d,
    label:       labels[tier] ?? '?',
    canInteract: tier <= 2,
    canDiplomate: tier === 1,
  };
}
