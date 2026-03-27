// ══════════════════════════════════════════════════════════════════════
// ТАКТИЧЕСКИЙ ИИ КОМАНДУЮЩЕГО — commander_ai.js
//
// Делегирует решения в Utility AI (utility_ai.js).
// Utility AI: детерминированный, работает офлайн, ~микросекунды/решение.
//
// Архитектура:
//   getCommanderDecisionNow(army, order) → {action, target_id, reasoning}
//   → utilityAIDecide(army, order)
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ
// Возвращает решение немедленно через Utility AI.
// ─────────────────────────────────────────────────────────────────────
function getCommanderDecisionNow(army, order) {
  if (typeof utilityAIDecide === 'function') {
    try {
      return utilityAIDecide(army, order);
    } catch (e) {
      console.warn('[commander_ai] utilityAIDecide error:', e.message);
    }
  }
  return _heuristicDecision(army, order);
}

// ─────────────────────────────────────────────────────────────────────
// ЭВРИСТИКА — fallback если utility_ai.js не загружен
// ─────────────────────────────────────────────────────────────────────
function _heuristicDecision(army, order) {
  if (army.supply < 20 || army.morale < 20) {
    const fr = _nearestFriendlyRegion(army);
    if (fr) return { action: 'retreat', target_id: fr, reasoning: 'Критически низкое снабжение или мораль — отступление.' };
    return { action: 'hold', target_id: null, reasoning: 'Держать позицию — восстановить армию.' };
  }

  if (army.fatigue > 78) {
    return { action: 'hold', target_id: null, reasoning: 'Армия измотана — необходим отдых.' };
  }

  if (army.siege_id) {
    const siege = (GAME_STATE.sieges ?? []).find(s => s.id === army.siege_id);
    if (siege?.storm_possible) return { action: 'storm', target_id: null, reasoning: 'Крепость готова к штурму.' };
    return { action: 'siege', target_id: null, reasoning: 'Продолжать осаду.' };
  }

  const enemies = _cmdEnemyNations(army.nation);
  const nearby  = _cmdNearbyRegions(army.position, 3);

  let bestId = null, bestScore = -Infinity;
  for (const [rid, r] of Object.entries(nearby)) {
    if (rid === army.position) continue;
    if (!enemies.includes(r.nation)) continue;
    const score = 100 - r.fortress * 25 - r.garrison / 50;
    if (score > bestScore) { bestScore = score; bestId = rid; }
  }

  if (bestId) {
    return { action: 'move', target_id: bestId, reasoning: `Атаковать "${nearby[bestId].name}".` };
  }

  return { action: 'hold', target_id: null, reasoning: 'Нет ближайших целей — ждать.' };
}

// ─────────────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ
// ─────────────────────────────────────────────────────────────────────
function _cmdEnemyNations(nationId) {
  return GAME_STATE.nations?.[nationId]?.military?.at_war_with ?? [];
}

function _cmdNearbyRegions(startId, depth) {
  const result  = {};
  const queue   = [[startId, 0]];
  const visited = new Set([startId]);
  const MAX     = 14;

  while (queue.length && Object.keys(result).length < MAX) {
    const [rid, d] = queue.shift();
    const gs = GAME_STATE.regions?.[rid];
    const mr = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[rid] : null;
    const nation = gs?.nation ?? mr?.nation ?? 'neutral';

    result[rid] = {
      id: rid,
      name: gs?.name ?? mr?.name ?? rid,
      nation,
      fortress: gs?.fortress_level ?? 0,
      garrison: gs?.garrison ?? 0,
    };

    if (d < depth) {
      const conns = gs?.connections ?? mr?.connections ?? [];
      for (const next of conns) {
        if (visited.has(next)) continue;
        visited.add(next);
        const nr = GAME_STATE.regions?.[next] ?? MAP_REGIONS?.[next];
        if (nr?.mapType !== 'Ocean') queue.push([next, d + 1]);
      }
    }
  }
  return result;
}

function _nearestFriendlyRegion(army) {
  const nearby = _cmdNearbyRegions(army.position, 4);
  for (const [rid, r] of Object.entries(nearby)) {
    if (rid !== army.position && r.nation === army.nation) return rid;
  }
  return null;
}
