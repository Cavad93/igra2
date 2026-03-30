/**
 * chronicle.js — Система Хронист
 * Каждые 50 ходов анализирует мир и генерирует живые события через Sonnet.
 */

// ── Вспомогательные функции ───────────────────────────────────────────────────

function _detectEra(year) {
  if (year > -280) return 'hellenistic';
  if (year > -220) return 'punic_wars';
  if (year > -130) return 'roman_expansion';
  if (year > -27)  return 'late_republic';
  if (year > 200)  return 'imperial';
  return 'late_empire';
}

function _getVal(ou, cat, name) {
  return ou?.[cat]?.find?.(v => v.name === name)?.current ?? 0;
}

function _armySize(nation) {
  const m = nation.military ?? {};
  return (m.infantry ?? 0) + (m.cavalry ?? 0) + (m.archers ?? 0);
}

function _playerReputation(playerNation, nations) {
  if (!playerNation?._ou) return 'ignored';
  const fear = _getVal(playerNation._ou, 'diplomacy', 'military_deterrence');
  const rep  = _getVal(playerNation._ou, 'diplomacy', 'global_reputation');
  const resentments = Object.values(nations)
    .filter(n => n.id !== playerNation.id)
    .reduce((sum, n) => sum + (n._player_relation?.resentment ?? 0), 0);
  if (fear > 0.6 || resentments > 2) return 'feared';
  if (rep > 0.55) return 'respected';
  if (resentments > 1) return 'hated';
  return 'ignored';
}

// ── Основной объект ───────────────────────────────────────────────────────────

export const ChronicleSystem = {
  INTERVAL:      50,
  MAX_EVENTS:    5,
  MAX_TOKENS:    600,
  EFFECT_RADIUS: 6,

  collectSnapshot(gameState) {
    const nations  = gameState.nations ?? {};
    const natList  = Object.values(nations);
    const turn     = gameState.turn ?? 0;
    const year     = gameState.date?.year ?? -301;
    const playerId = gameState.player_nation;
    const player   = nations[playerId] ?? natList[0];

    // Топ нации по регионам
    const byRegions = [...natList].sort((a,b) =>
      (b.regions?.length ?? 0) - (a.regions?.length ?? 0));
    const strongest = byRegions[0] ?? player;
    const weakest   = byRegions[byRegions.length - 1] ?? player;
    const richest   = [...natList].sort((a,b) =>
      (b.economy?.treasury ?? 0) - (a.economy?.treasury ?? 0))[0] ?? player;

    // Войны (парный список без дублей)
    const warPairs = new Map();
    for (const n of natList) {
      for (const enemyId of (n.military?.at_war_with ?? [])) {
        const key = [n.id, enemyId].sort().join('|');
        if (!warPairs.has(key)) {
          const dur = (turn - (n._war_start?.[enemyId] ?? turn - 1));
          warPairs.set(key, { attacker: n.name ?? n.id, defender: nations[enemyId]?.name ?? enemyId, duration_turns: Math.max(1, dur) });
        }
      }
    }
    const active_wars = [...warPairs.values()].slice(0, 5);

    // Недавние завоевания (из events_log)
    const recent_conquests = (gameState.events_log ?? [])
      .filter(e => e?.type === 'conquest' && (turn - (e.turn ?? 0)) <= 50)
      .slice(-5)
      .map(e => ({ winner: e.winner ?? '?', loser: e.loser ?? '?', region: e.region ?? '?' }));

    // Кризисы из Super-OU
    const crisis_nations = natList
      .filter(n => n._ou)
      .map(n => {
        const ou = n._ou;
        const regStab  = _getVal(ou, 'politics', 'regime_stability');
        const foodSec  = _getVal(ou, 'economy',  'food_security');
        const treasury = _getVal(ou, 'economy',  'gold_reserves');
        let crisis_type = null;
        let severity = 0;
        if (regStab < 0.3)  { crisis_type = 'political_crisis'; severity = Math.round((0.3 - regStab) * 200); }
        if (foodSec < 0.25) { crisis_type = 'famine';           severity = Math.max(severity, Math.round((0.25 - foodSec) * 200)); }
        if (treasury < 0.1) { crisis_type = 'bankruptcy';       severity = Math.max(severity, Math.round((0.1 - treasury) * 500)); }
        return severity > 60 ? { name: n.name ?? n.id, crisis_type, severity } : null;
      })
      .filter(Boolean);

    // Торговля, голод, банкротства
    let total_trade_routes = 0;
    const famines_active    = [];
    const bankruptcies_recent = [];
    for (const n of natList) {
      total_trade_routes += (n.economy?.trade_routes?.length ?? 0);
      if (n._ou && _getVal(n._ou, 'economy', 'food_security') < 0.2) famines_active.push(n.name ?? n.id);
      if ((n.economy?.treasury ?? 0) < 0) bankruptcies_recent.push(n.name ?? n.id);
    }

    // Крупнейшая коалиция против игрока
    const coalition_members = natList
      .filter(n => n.id !== playerId && (n.military?.at_war_with ?? []).includes(playerId))
      .map(n => n.name ?? n.id);
    const largest_coalition = { members: coalition_members, target: coalition_members.length ? (player?.name ?? playerId) : null };

    const totalRegions = natList.reduce((s, n) => s + (n.regions?.length ?? 0), 0) || 1;

    return {
      year, turn,
      strongest_nation: { name: strongest.name ?? strongest.id, regions: strongest.regions?.length ?? 0, army: _armySize(strongest) },
      weakest_nation:   { name: weakest.name   ?? weakest.id,   regions: weakest.regions?.length   ?? 0, army: _armySize(weakest) },
      richest_nation:   { name: richest.name   ?? richest.id,   treasury: richest.economy?.treasury ?? 0 },
      player:           { name: player?.name   ?? playerId,     regions: player?.regions?.length ?? 0, army: _armySize(player ?? {}), treasury: player?.economy?.treasury ?? 0 },
      active_wars,
      recent_conquests,
      crisis_nations,
      total_trade_routes,
      famines_active,
      bankruptcies_recent,
      largest_coalition,
      player_share_regions: (player?.regions?.length ?? 0) / totalRegions,
      player_at_war:     (player?.military?.at_war_with?.length ?? 0) > 0,
      player_reputation: _playerReputation(player, nations),
      era: _detectEra(year),
    };
  },

  buildPrompt(snapshot) {},
  parseEvents(raw, gameState) {},
  applyEffects(events, gameState) {},
  async generate(gameState) {},
};

export default ChronicleSystem;

if (typeof window !== 'undefined') {
  window.ChronicleSystem = ChronicleSystem;
}
