// engine/ai_scoring.js — OU-процесс и AI-скоринг (вынесено из turn.js, этап 48)

import { BUILDINGS } from '../data/buildings.js';

// ══════════════════════════════════════════════════════════════════════
// OU (Ornstein-Uhlenbeck) — стохастические "настроения" нации
// Каждое настроение дрейфует случайно, но возвращается к своему μ.
// Формула: x(t+1) = x(t) + θ·(μ−x(t)) + σ·N(0,1)
//
// Измерения:
//   aggression    [-1..+1]  склонность к войне и рекрутингу
//   expansion     [-1..+1]  склонность к захвату территорий
//   diplomacy     [-1..+1]  склонность к союзам и торговле
//   economy_focus [-1..+1]  склонность к строительству и налогам
//   caution       [-1..+1]  склонность к миру и осторожности
// ══════════════════════════════════════════════════════════════════════

export const _OU_THETA = 0.12; // скорость возврата к среднему
export const _OU_SIGMA = 0.07; // амплитуда шума

export function _ouNaturalMu(nation) {
  const treasury  = nation.economy?.treasury ?? 0;
  const military  = nation.military          ?? {};
  const pop       = nation.population        ?? {};
  const gov       = nation.government        ?? {};
  const atWar     = (military.at_war_with ?? []).length > 0;
  const armyStr   = (military.infantry ?? 0) + (military.cavalry ?? 0) * 3;
  const armyRatio = armyStr / Math.max(1, pop.total ?? 1);
  const happiness = pop.happiness ?? 50;
  const stability = gov.stability ?? 50;

  return {
    aggression:     atWar ? 0.45 : (armyRatio > 0.05 ? 0.15 : -0.10),
    expansion:      treasury > 5000 ? 0.25 : (treasury > 1000 ? 0.0 : -0.20),
    diplomacy:      atWar ? -0.35 : (treasury > 2000 ? 0.30 : 0.0),
    economy_focus:  atWar ? -0.20 : (treasury > 3000 ? 0.35 : (treasury > 800 ? 0.10 : -0.30)),
    caution:        (happiness < 30 || stability < 30) ? 0.50
                    : (atWar && armyRatio < 0.02 ? 0.40 : 0.0),
  };
}

export function _ouStep(x, mu) {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-1, Math.min(1, x + _OU_THETA * (mu - x) + _OU_SIGMA * normal));
}

export function _tickOU(nationId, nation) {
  const mu = _ouNaturalMu(nation);
  // Если Super-OU уже инициализировал _ou с массивами — не изменять их скалярами.
  // Возвращаем отдельный скалярный снимок для fallback-скоринга.
  if (nation._ou && Array.isArray(nation._ou.economy)) {
    return {
      aggression:    Math.max(-1, Math.min(1, mu.aggression    + (Math.random() - 0.5) * _OU_SIGMA)),
      expansion:     Math.max(-1, Math.min(1, mu.expansion     + (Math.random() - 0.5) * _OU_SIGMA)),
      diplomacy:     Math.max(-1, Math.min(1, mu.diplomacy     + (Math.random() - 0.5) * _OU_SIGMA)),
      economy_focus: Math.max(-1, Math.min(1, mu.economy_focus + (Math.random() - 0.5) * _OU_SIGMA)),
      caution:       Math.max(-1, Math.min(1, mu.caution       + (Math.random() - 0.5) * _OU_SIGMA)),
    };
  }
  if (!nation._ou) {
    nation._ou = {
      aggression:    mu.aggression    + (Math.random() - 0.5) * 0.2,
      expansion:     mu.expansion     + (Math.random() - 0.5) * 0.2,
      diplomacy:     mu.diplomacy     + (Math.random() - 0.5) * 0.2,
      economy_focus: mu.economy_focus + (Math.random() - 0.5) * 0.2,
      caution:       mu.caution       + (Math.random() - 0.5) * 0.2,
    };
  }
  const ou = nation._ou;
  // Инициализировать новые измерения у старых наций
  if (ou.economy_focus === undefined) ou.economy_focus = mu.economy_focus + (Math.random() - 0.5) * 0.2;
  if (ou.caution       === undefined) ou.caution       = mu.caution       + (Math.random() - 0.5) * 0.2;

  ou.aggression    = _ouStep(ou.aggression,    mu.aggression);
  ou.expansion     = _ouStep(ou.expansion,     mu.expansion);
  ou.diplomacy     = _ouStep(ou.diplomacy,     mu.diplomacy);
  ou.economy_focus = _ouStep(ou.economy_focus, mu.economy_focus);
  ou.caution       = _ouStep(ou.caution,       mu.caution);
  return ou;
}

export function _softmax(scoreMap, temp = 1.2) {
  const entries = Object.entries(scoreMap);
  const exps    = entries.map(([k, v]) => [k, Math.exp(v / temp)]);
  const sum     = exps.reduce((s, [, e]) => s + e, 0);
  return Object.fromEntries(exps.map(([k, e]) => [k, e / sum]));
}

export function _weightedPick(probMap) {
  const r = Math.random();
  let cum = 0;
  for (const [key, p] of Object.entries(probMap)) {
    cum += p;
    if (r <= cum) return key;
  }
  return Object.keys(probMap).at(-1);
}

// ── Найти враждебного соседа для объявления войны (max 20 отношений) ───
export function _findWarTarget(nationId, nation) {
  const military = nation.military ?? {};
  if ((military.at_war_with ?? []).length >= 2) return null;
  const ownStr = (military.infantry ?? 0) + (military.cavalry ?? 0) * 3;
  let best = null, bestScore = -Infinity;
  const entries = Object.entries(nation.relations || {}).slice(0, 20);
  for (const [otherId, rel] of entries) {
    if (rel.at_war) continue;
    if ((rel.treaties ?? []).some(t => ['non_aggression','defensive_alliance','military_alliance','vassalage'].includes(t))) continue;
    if (typeof getArmistice === 'function' && getArmistice(nationId, otherId)) continue;
    const other = GAME_STATE.nations?.[otherId];
    if (!other || other.is_defeated) continue;
    const enemyStr = (other.military?.infantry ?? 0) + (other.military?.cavalry ?? 0) * 3;
    const relScore = rel.score ?? 0;
    const attractiveness = -relScore * 0.03
      + (ownStr > enemyStr * 1.5 ? 1.5 : 0)
      + (ownStr > enemyStr * 2.0 ? 1.0 : 0);
    if (relScore < -20 && attractiveness > bestScore) {
      bestScore = attractiveness;
      best = otherId;
    }
  }
  return best;
}

// ── Найти дружественного партнёра для союза/торговли ───────────────────
export function _findDiplomacyPartner(nationId, nation, minScore = 20, excludeTreaty = null) {
  let best = null, bestScore = -Infinity;
  const entries = Object.entries(nation.relations || {}).slice(0, 20);
  for (const [otherId, rel] of entries) {
    if (rel.at_war) continue;
    const score = rel.score ?? 0;
    if (score < minScore) continue;
    if (excludeTreaty && (rel.treaties ?? []).includes(excludeTreaty)) continue;
    const other = GAME_STATE.nations?.[otherId];
    if (!other || other.is_defeated) continue;
    if (score > bestScore) { bestScore = score; best = otherId; }
  }
  return best;
}

// ── Подобрать здание для строительства (max 10 регионов) ───────────────
export const _FALLBACK_BUILD_PRIORITY = [
  'barracks', 'granary', 'market', 'road', 'warehouse',
  'temple', 'forum', 'stables', 'workshop', 'farm',
];
export function _findBuildTarget(nationId, nation) {
  const regions = (nation.regions ?? []).slice(0, 10);
  for (const regionId of regions) {
    const region = GAME_STATE.regions?.[regionId];
    if (!region) continue;
    if ((region.construction_queue ?? []).length >= 2) continue;
    const existingIds = (region.building_slots ?? []).map(s => s.building_id);
    for (const bid of _FALLBACK_BUILD_PRIORITY) {
      if (existingIds.includes(bid)) continue;
      if (typeof BUILDINGS !== 'undefined' && BUILDINGS[bid]?.nation_buildable === false) continue;
      return { regionId, buildingId: bid };
    }
  }
  return null;
}

// ── Маппинг SuperOU actions → turn.js scores ─────────────────────────────────
export const _SUPER_OU_ACTION_MAP = {
  build_farm:        'build',
  build_barracks:    'recruit',
  build_market:      'build',
  recruit_infantry:  'recruit',
  recruit_cavalry:   'recruit',
  seek_alliance:     'form_alliance',
  mobilize:          'raise_army',
  demobilize:        'seek_peace',
  buy_food:          'trade',
  sell_goods:        'trade',
  pass:              'wait',
  request_loan:      'take_loan',
  debt_reduction:    'wait',
};


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

