// engine/fog_of_war.js — Этап C плана docs/fog_of_war.md
//
// Fog of War + Active Intelligence.
//
// Модель знаний (per-nation): nation._known_to[observerId] = level
//   0 — terra incognita (только цвет + контур границ, без цифр/названия)
//   1 — known            (название, «большая армия», без точных цифр)
//   2 — full intel       (всё)
//
// Автоматическое обновление через _updateKnownNations(observerId) — раз
// в 3 хода. Активные механики (купец/шпион/слух) — повышают уровень.
//
// Интеграция с существующим getIntelLevel(regionId) в ui/map.js:
//   getIntelLevel возвращает уровень для ОДНОГО региона (по соседству и
//   дипломатии). Здесь мы вводим НАЦИОНАЛЬНЫЙ уровень — применяется к
//   меткам армий/строительства (скрываются, если наблюдатель не знает
//   детали нации-владельца региона).

import { MAP_REGIONS as _IMPORTED_MAP_REGIONS } from '../data/map.js';
import { mutateTreasury } from './economy.js';

// Разрешаем unit-тестам подменить MAP_REGIONS через globalThis.MAP_REGIONS,
// сохраняя работу в браузере (там window.MAP_REGIONS = импорт).
function _getMapRegions() {
  if (typeof globalThis !== 'undefined' && globalThis.MAP_REGIONS
      && globalThis.MAP_REGIONS !== _IMPORTED_MAP_REGIONS) {
    return globalThis.MAP_REGIONS;
  }
  return _IMPORTED_MAP_REGIONS;
}

// ──────────────────────────────────────────────────────────────
// Параметры механики
// ──────────────────────────────────────────────────────────────

export const FOG_CONFIG = {
  // Частота автоматического пересчёта уровня знаний.
  UPDATE_PERIOD:              3,

  // Купеческая экспедиция
  MERCHANT_COST:               500,
  MERCHANT_BASE_DURATION:       12,   // ходов
  MERCHANT_DURATION_PER_5REGS:   1,   // +1 ход за каждые 5 регионов расстояния
  MERCHANT_FAIL_PROB:          0.10,  // шанс провала (пираты, бандиты)

  // Шпион
  SPY_COST:                   2000,
  SPY_ACTIVATION_TURNS:          3,   // подготовка перед активацией
  SPY_ACTIVE_DURATION:          24,   // full intel на ~2 года
  SPY_FAIL_PROB:              0.30,
  SPY_FAIL_RELATION_PENALTY:   -10,
  SPY_MAX_ACTIVE:                3,   // одновременных активных шпионов

  // BFS расстояние для known-статуса
  KNOWN_DISTANCE_THRESHOLD:      3,   // свои + соседи ≤3 переходов
  KNOWN_DISTANCE_SEARCH_CAP:    10,   // BFS не дальше этого (для перф)

  // Fabricate claim — шпионская кампания для получения territorial_claim CB
  FABRICATE_COST:             1500,
  FABRICATE_DURATION:            8,   // ходов
  FABRICATE_FAIL_PROB:        0.25,   // шанс раскрытия
  FABRICATE_DETECT_REL_PEN:    -15,   // штраф к отношениям при раскрытии
  FABRICATE_DETECT_AE:          10,   // +AE при раскрытии (наказание агрессора)
};

// ──────────────────────────────────────────────────────────────
// Инициализация GAME_STATE
// ──────────────────────────────────────────────────────────────

export function initFogOfWar() {
  if (typeof GAME_STATE === 'undefined' || !GAME_STATE) return;
  if (!Array.isArray(GAME_STATE.expeditions)) GAME_STATE.expeditions = [];
  if (!Array.isArray(GAME_STATE.rumors))      GAME_STATE.rumors      = [];
  // На каждой нации _known_to инициализируется лениво при первом обращении,
  // чтобы не создавать 900×900 записей при старте игры.

  // Первичный расчёт уровней знаний для игрока — чтобы соседи Сиракуз
  // были видны сразу, до первого хода. Без этого `_tickFogIntel`
  // сработает только на ходу 3 (каждые UPDATE_PERIOD=3).
  if (GAME_STATE.player_nation && !GAME_STATE._fog_initial_done) {
    try {
      _updateKnownNations(GAME_STATE.player_nation);
      GAME_STATE._fog_initial_done = true;
    } catch (_) {}
  }
}

// ──────────────────────────────────────────────────────────────
// Базовый доступ: уровень знания observerId о targetId
// ──────────────────────────────────────────────────────────────

export function getNationKnownLevel(observerId, targetId) {
  if (!observerId || !targetId) return 2;
  if (observerId === targetId) return 2;            // сам о себе
  const target = GAME_STATE?.nations?.[targetId];
  if (!target) return 0;
  const map = target._known_to;
  if (!map) return 0;
  const lvl = map[observerId];
  return Number.isFinite(lvl) ? lvl : 0;
}

// Установить уровень, только если он выше текущего
// (активный шпион может временно поднять до 2, потом revert вернёт к 1).
export function setNationKnownLevel(observerId, targetId, level, opts = {}) {
  if (!observerId || !targetId || observerId === targetId) return;
  const target = GAME_STATE?.nations?.[targetId];
  if (!target) return;
  if (!target._known_to) target._known_to = {};
  const prev = target._known_to[observerId] ?? 0;
  if (opts.force || level > prev) {
    target._known_to[observerId] = level;
  }
}

// ──────────────────────────────────────────────────────────────
// BFS: дистанция между нациями по connections
// ──────────────────────────────────────────────────────────────

// Возвращает минимум прыжков от регионов observerId до любого региона targetId,
// или Infinity если не достижимо в пределах SEARCH_CAP.
export function _bfsNationDistance(observerId, targetId) {
  const CAP = FOG_CONFIG.KNOWN_DISTANCE_SEARCH_CAP;
  const MAP_REGIONS = _getMapRegions();
  if (!GAME_STATE?.regions || !MAP_REGIONS) return Infinity;

  const targetRegions = new Set();
  const frontier      = new Set();

  for (const [rid, gr] of Object.entries(GAME_STATE.regions)) {
    if (gr?.nation === observerId) frontier.add(rid);
    if (gr?.nation === targetId)   targetRegions.add(rid);
  }
  if (frontier.size === 0 || targetRegions.size === 0) return Infinity;

  const visited = new Set(frontier);
  let depth = 0;
  let current = [...frontier];

  while (current.length && depth < CAP) {
    const next = [];
    for (const rid of current) {
      if (targetRegions.has(rid)) return depth;
      const md = MAP_REGIONS[rid];
      if (!md?.connections) continue;
      for (const nid of md.connections) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        next.push(nid);
      }
    }
    current = next;
    depth++;
  }
  return Infinity;
}

// ──────────────────────────────────────────────────────────────
// Автоматическое обновление уровня знаний
// ──────────────────────────────────────────────────────────────

export function _updateKnownNations(observerId) {
  if (!observerId) return;
  const observer = GAME_STATE?.nations?.[observerId];
  if (!observer) return;

  const nationIds = Object.keys(GAME_STATE.nations);

  // Быстрые индексы дипломатии.
  const alliesSet = new Set();
  const tradeSet  = new Set();
  const atWarSet  = new Set(observer.military?.at_war_with || []);

  const treaties = GAME_STATE.diplomacy?.treaties || [];
  for (const t of treaties) {
    if (t.status !== 'active') continue;
    if (!Array.isArray(t.parties) || !t.parties.includes(observerId)) continue;
    const other = t.parties.find(p => p !== observerId);
    if (!other) continue;
    if (t.type === 'defensive_alliance' || t.type === 'military_alliance'
     || t.type === 'marriage_alliance'  || t.type === 'vassalage') {
      alliesSet.add(other);
    }
    if (t.type === 'trade_agreement' || t.type === 'trade_pact'
     || t.type === 'commerce_treaty') {
      tradeSet.add(other);
    }
  }

  // Активные шпионы observer'а → targetId → временный level 2.
  const spiesByTarget = new Map();
  for (const exp of (GAME_STATE.expeditions || [])) {
    if (exp.type !== 'spy' || exp.observerId !== observerId) continue;
    if (exp.status === 'active') {
      spiesByTarget.set(exp.targetId, true);
    }
  }

  const THRESH = FOG_CONFIG.KNOWN_DISTANCE_THRESHOLD;

  for (const targetId of nationIds) {
    if (targetId === observerId) continue;

    // Уровень 2 — явные источники.
    if (alliesSet.has(targetId) || atWarSet.has(targetId) || spiesByTarget.has(targetId)) {
      setNationKnownLevel(observerId, targetId, 2);
      continue;
    }

    // Уровень 1 — торговля / близкое соседство.
    const distance = _bfsNationDistance(observerId, targetId);
    if (tradeSet.has(targetId) || distance <= THRESH) {
      setNationKnownLevel(observerId, targetId, 1);
      continue;
    }

    // Иначе — не понижаем уровень (знание накапливается). Явная «забывчивость»
    // происходит только через revert шпиона.
  }
}

// Обновление раз в UPDATE_PERIOD ходов. Вызывается из turn.js.
// Всегда обновляет для игрока; для AI-наций — опционально (пока отключено,
// чтобы не замедлять ход × 900 BFS).
export function _tickFogIntel() {
  const gs = GAME_STATE;
  if (!gs) return;
  if ((gs.turn ?? 0) % FOG_CONFIG.UPDATE_PERIOD !== 0) return;
  if (gs.player_nation) {
    try { _updateKnownNations(gs.player_nation); } catch (e) { console.warn('[fog]', e); }
  }
}

// ──────────────────────────────────────────────────────────────
// Купеческая экспедиция
// ──────────────────────────────────────────────────────────────

export function sendMerchantExpedition(observerId, targetId) {
  const gs = GAME_STATE;
  const observer = gs?.nations?.[observerId];
  const target   = gs?.nations?.[targetId];
  if (!observer || !target) return { ok: false, reason: 'no_nation' };
  if (observerId === targetId) return { ok: false, reason: 'self' };

  const cost = FOG_CONFIG.MERCHANT_COST;
  if ((observer.economy?.treasury ?? 0) < cost) {
    return { ok: false, reason: 'no_gold', needed: cost };
  }

  const dist = _bfsNationDistance(observerId, targetId);
  const duration = FOG_CONFIG.MERCHANT_BASE_DURATION
    + (Number.isFinite(dist) ? Math.floor(dist / 5) * FOG_CONFIG.MERCHANT_DURATION_PER_5REGS : 6);

  mutateTreasury(observer, -cost, 'merchant_expedition');

  if (!Array.isArray(gs.expeditions)) gs.expeditions = [];
  const exp = {
    id:          `exp_${observerId}_${targetId}_t${gs.turn ?? 0}`,
    type:        'merchant',
    observerId,
    targetId,
    started_turn: gs.turn ?? 0,
    turns_left:   duration,
    status:       'travelling',
    cost,
  };
  gs.expeditions.push(exp);

  if (typeof addEventLog === 'function') {
    addEventLog(
      `🧭 Купеческая экспедиция отправлена к ${target.name ?? targetId} (${duration} ходов, ${cost} монет).`,
      'diplomacy',
    );
  }
  return { ok: true, expedition: exp };
}

// ──────────────────────────────────────────────────────────────
// Шпион
// ──────────────────────────────────────────────────────────────

export function sendSpy(observerId, targetId) {
  const gs = GAME_STATE;
  const observer = gs?.nations?.[observerId];
  const target   = gs?.nations?.[targetId];
  if (!observer || !target) return { ok: false, reason: 'no_nation' };
  if (observerId === targetId) return { ok: false, reason: 'self' };

  // Лимит одновременных активных/подготавливающихся шпионов.
  const myActiveSpies = (gs.expeditions || [])
    .filter(e => e.type === 'spy' && e.observerId === observerId
              && (e.status === 'preparing' || e.status === 'active'))
    .length;
  if (myActiveSpies >= FOG_CONFIG.SPY_MAX_ACTIVE) {
    return { ok: false, reason: 'max_spies', limit: FOG_CONFIG.SPY_MAX_ACTIVE };
  }

  const cost = FOG_CONFIG.SPY_COST;
  if ((observer.economy?.treasury ?? 0) < cost) {
    return { ok: false, reason: 'no_gold', needed: cost };
  }

  mutateTreasury(observer, -cost, 'spy_sent');

  if (!Array.isArray(gs.expeditions)) gs.expeditions = [];
  const exp = {
    id:          `spy_${observerId}_${targetId}_t${gs.turn ?? 0}`,
    type:        'spy',
    observerId,
    targetId,
    started_turn: gs.turn ?? 0,
    turns_left:   FOG_CONFIG.SPY_ACTIVATION_TURNS,
    status:       'preparing',
    active_turns_left: FOG_CONFIG.SPY_ACTIVE_DURATION,
    cost,
  };
  gs.expeditions.push(exp);

  if (typeof addEventLog === 'function') {
    addEventLog(
      `🕵 Шпион отправлен к ${target.name ?? targetId} (${FOG_CONFIG.SPY_ACTIVATION_TURNS} ходов подготовки, ${cost} монет).`,
      'diplomacy',
    );
  }
  return { ok: true, expedition: exp };
}

// ──────────────────────────────────────────────────────────────
// Fabricate claim — шпионская кампания для создания CB
// ──────────────────────────────────────────────────────────────

/**
 * Начать кампанию по фабрикации претензии на конкретный регион цели.
 * При успехе через FABRICATE_DURATION ходов регистрируется CB типа
 * 'territorial_claim' на region_id. При раскрытии — штраф к отношениям и AE.
 *
 * @param {string} observerId — кто фабрикует
 * @param {string} targetId   — против кого
 * @param {string} regionId   — конкретный регион претензии (должен принадлежать targetId)
 */
export function fabricateClaim(observerId, targetId, regionId) {
  const gs = GAME_STATE;
  const observer = gs?.nations?.[observerId];
  const target   = gs?.nations?.[targetId];
  if (!observer || !target) return { ok: false, reason: 'no_nation' };
  if (observerId === targetId) return { ok: false, reason: 'self' };
  if (!regionId)              return { ok: false, reason: 'no_region' };
  // Проверяем, что регион принадлежит цели.
  const region = gs.regions?.[regionId];
  if (!region) return { ok: false, reason: 'unknown_region' };
  if (region.nation !== targetId) return { ok: false, reason: 'not_target_region' };

  // Не дублируем: один активный fabricate на одну и ту же пару/регион.
  const exists = (gs.expeditions || []).some(e =>
    e.type === 'fabricate' && e.observerId === observerId
    && e.targetId === targetId && e.regionId === regionId
    && (e.status === 'in_progress'));
  if (exists) return { ok: false, reason: 'already_fabricating' };

  const cost = FOG_CONFIG.FABRICATE_COST;
  if ((observer.economy?.treasury ?? 0) < cost) {
    return { ok: false, reason: 'no_gold', needed: cost };
  }

  mutateTreasury(observer, -cost, 'fabricate_claim');

  if (!Array.isArray(gs.expeditions)) gs.expeditions = [];
  const exp = {
    id:          `fab_${observerId}_${targetId}_${regionId}_t${gs.turn ?? 0}`,
    type:        'fabricate',
    observerId,
    targetId,
    regionId,
    started_turn: gs.turn ?? 0,
    turns_left:   FOG_CONFIG.FABRICATE_DURATION,
    status:       'in_progress',
    cost,
  };
  gs.expeditions.push(exp);

  if (typeof addEventLog === 'function') {
    addEventLog(
      `📜 Шпионская кампания по фабрикации претензии на «${region.name ?? regionId}» (${target.name ?? targetId}) начата — ${FOG_CONFIG.FABRICATE_DURATION} ходов, ${cost} монет.`,
      'diplomacy',
    );
  }
  return { ok: true, expedition: exp };
}

// ──────────────────────────────────────────────────────────────
// Обработка экспедиций / шпионов каждый ход
// ──────────────────────────────────────────────────────────────

export function processIntelligenceTick() {
  const gs = GAME_STATE;
  if (!gs || !Array.isArray(gs.expeditions)) return;

  const keep = [];
  for (const exp of gs.expeditions) {
    if (!exp) continue;

    if (exp.type === 'merchant') {
      exp.turns_left = (exp.turns_left || 0) - 1;
      if (exp.turns_left <= 0) {
        // Резолюция: успех или провал.
        if (Math.random() < FOG_CONFIG.MERCHANT_FAIL_PROB) {
          if (typeof addEventLog === 'function') {
            const target = gs.nations?.[exp.targetId];
            addEventLog(
              `⚠ Купеческая экспедиция к ${target?.name ?? exp.targetId} не вернулась — пираты/бандиты.`,
              'warning',
            );
          }
        } else {
          setNationKnownLevel(exp.observerId, exp.targetId, 1);
          if (typeof addEventLog === 'function') {
            const target = gs.nations?.[exp.targetId];
            addEventLog(
              `🧭 Купцы вернулись из ${target?.name ?? exp.targetId}. Известны название и ориентировочная сила.`,
              'good',
            );
          }
        }
        continue;   // не копим
      }
      keep.push(exp);
      continue;
    }

    if (exp.type === 'fabricate') {
      exp.turns_left = (exp.turns_left || 0) - 1;
      if (exp.turns_left <= 0) {
        const target = gs.nations?.[exp.targetId];
        const region = gs.regions?.[exp.regionId];
        if (Math.random() < FOG_CONFIG.FABRICATE_FAIL_PROB) {
          // Раскрытие: штраф к отношениям и +AE атакующему.
          _applyRelationPenalty(exp.observerId, exp.targetId, FOG_CONFIG.FABRICATE_DETECT_REL_PEN);
          if (typeof addAeScore === 'function') {
            addAeScore(exp.observerId, FOG_CONFIG.FABRICATE_DETECT_AE, 'fabricate_claim_detected');
          }
          if (typeof addEventLog === 'function') {
            addEventLog(
              `💀 Фабрикация претензии на «${region?.name ?? exp.regionId}» раскрыта! Репутация страдает: ${FOG_CONFIG.FABRICATE_DETECT_REL_PEN}, AE +${FOG_CONFIG.FABRICATE_DETECT_AE}.`,
              'danger',
            );
          }
        } else {
          // Успех — регистрируем CB.
          if (typeof registerCB === 'function') {
            registerCB({
              holder_id: exp.observerId,
              target_id: exp.targetId,
              type:      'territorial_claim',
              region_id: exp.regionId,
              source:    'fabricated',
              notes:     `Fabricated via spy turn ${gs.turn}`,
            });
          }
          if (typeof addEventLog === 'function') {
            addEventLog(
              `📜 Претензия на «${region?.name ?? exp.regionId}» (${target?.name ?? exp.targetId}) сфабрикована успешно — теперь это законный повод для войны.`,
              'good',
            );
          }
        }
        continue;
      }
      keep.push(exp);
      continue;
    }

    if (exp.type === 'spy') {
      if (exp.status === 'preparing') {
        exp.turns_left = (exp.turns_left || 0) - 1;
        if (exp.turns_left <= 0) {
          if (Math.random() < FOG_CONFIG.SPY_FAIL_PROB) {
            // Провал — штраф к отношениям + событие.
            _applyRelationPenalty(exp.observerId, exp.targetId, FOG_CONFIG.SPY_FAIL_RELATION_PENALTY);
            if (typeof addEventLog === 'function') {
              const target = gs.nations?.[exp.targetId];
              addEventLog(
                `💀 Шпион в ${target?.name ?? exp.targetId} раскрыт! Казнён, отношения ${FOG_CONFIG.SPY_FAIL_RELATION_PENALTY}.`,
                'danger',
              );
            }
            continue;
          }
          // Успех — активация.
          exp.status = 'active';
          exp.turns_left = exp.active_turns_left || FOG_CONFIG.SPY_ACTIVE_DURATION;
          setNationKnownLevel(exp.observerId, exp.targetId, 2);
          if (typeof addEventLog === 'function') {
            const target = gs.nations?.[exp.targetId];
            addEventLog(
              `🕵 Шпион в ${target?.name ?? exp.targetId} активирован — полные данные о казне и армии.`,
              'good',
            );
          }
          keep.push(exp);
          continue;
        }
        keep.push(exp);
        continue;
      }
      if (exp.status === 'active') {
        exp.turns_left = (exp.turns_left || 0) - 1;
        if (exp.turns_left <= 0) {
          // Возврат к уровню 1 (страна теперь «known», но не full intel).
          setNationKnownLevel(exp.observerId, exp.targetId, 1, { force: true });
          if (typeof addEventLog === 'function') {
            const target = gs.nations?.[exp.targetId];
            addEventLog(
              `🕵 Шпион в ${target?.name ?? exp.targetId} завершил миссию. Полные данные устарели.`,
              'info',
            );
          }
          continue;
        }
        keep.push(exp);
        continue;
      }
    }

    keep.push(exp);
  }

  gs.expeditions = keep;
}

function _applyRelationPenalty(a, b, delta) {
  const rel = GAME_STATE?.diplomacy?.relations;
  if (!rel) return;
  const key = [a, b].sort().join('_');
  const r = rel[key];
  if (r) r.score = Math.max(-100, Math.min(100, (r.score ?? 0) + delta));
}

// ──────────────────────────────────────────────────────────────
// Helper'ы для UI рендера
// ──────────────────────────────────────────────────────────────

// Какой уровень знания ИГРОК имеет о владельце данного региона.
export function _getRegionOwnerKnownLevel(regionId) {
  try {
    const gs = GAME_STATE;
    const playerId = gs?.player_nation;
    if (!playerId) return 2;                    // pre-init — всё видно
    const region = gs?.regions?.[regionId];
    const ownerId = region?.nation
                 || _getMapRegions()?.[regionId]?.nation;
    if (!ownerId || ownerId === 'neutral') return 2;
    return getNationKnownLevel(playerId, ownerId);
  } catch (_) { return 2; }
}

// Должен ли игрок видеть армию — только если он знает нацию-владельца до level ≥2,
// ИЛИ если армия на своей/союзной территории.
export function shouldShowArmy(army) {
  try {
    if (!army) return false;
    const gs = GAME_STATE;
    const playerId = gs?.player_nation;
    if (!playerId) return true;
    if (army.nation === playerId) return true;    // своя
    const level = getNationKnownLevel(playerId, army.nation);
    return level >= 2;
  } catch (_) { return true; }
}

// Должен ли игрок видеть прогресс строительства региона.
export function shouldShowBuildMarker(regionId) {
  return _getRegionOwnerKnownLevel(regionId) >= 2;
}
