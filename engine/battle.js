// ══════════════════════════════════════════════════════════════════════
// BATTLE ENGINE — разрешение военных столкновений
//
// Формула силы:
//   strength = infantry + cavalry×3 + ships×2 + morale×0.5 + personal_power×0.2
//
// Защитник получает бонус ×1.2 (оборонительная позиция).
// Исход определяется броском с разбросом ±30%.
// Захват региона — если победитель превзошёл в 1.3× и у проигравшего > 1 региона.
// ══════════════════════════════════════════════════════════════════════

function calculateMilitaryStrength(nation) {
  const mil = nation.military;
  const pp  = nation.government?.ruler?.personal_power ?? 50;
  return Math.max(1,
    (mil.infantry    ?? 0)       +
    (mil.cavalry     ?? 0) * 3   +
    (mil.ships       ?? 0) * 2   +
    (mil.morale      ?? 50) * 0.5 +
    pp * 0.2
  );
}

function resolveBattle(attackerNationId, defenderNationId) {
  const attacker = GAME_STATE.nations[attackerNationId];
  const defender = GAME_STATE.nations[defenderNationId];
  if (!attacker || !defender) return null;

  const atkBase = calculateMilitaryStrength(attacker);
  const defBase = calculateMilitaryStrength(defender) * 1.2; // defender bonus

  const atkRoll = atkBase * (0.7 + Math.random() * 0.6);
  const defRoll = defBase * (0.7 + Math.random() * 0.6);
  const attackerWins = atkRoll > defRoll;

  // Потери: 5-15% от пехоты+конницы каждой стороны
  const atkForce = (attacker.military.infantry ?? 0) + (attacker.military.cavalry ?? 0) * 3;
  const defForce = (defender.military.infantry ?? 0) + (defender.military.cavalry ?? 0) * 3;
  const atkCasualties = Math.round(atkForce * (0.05 + Math.random() * 0.10));
  const defCasualties = Math.round(defForce * (0.05 + Math.random() * 0.10));

  attacker.military.infantry = Math.max(0, (attacker.military.infantry ?? 0) - Math.round(atkCasualties * 0.7));
  defender.military.infantry = Math.max(0, (defender.military.infantry ?? 0) - Math.round(defCasualties * 0.7));

  // Мораль и стабильность
  if (attackerWins) {
    attacker.military.morale = Math.min(100, (attacker.military.morale ?? 50) + 8);
    defender.military.morale = Math.max(0,   (defender.military.morale ?? 50) - 15);
    defender.government.stability = Math.max(0, (defender.government.stability ?? 50) - 15);
  } else {
    defender.military.morale = Math.min(100, (defender.military.morale ?? 50) + 5);
    attacker.military.morale = Math.max(0,   (attacker.military.morale ?? 50) - 12);
    attacker.government.stability = Math.max(0, (attacker.government.stability ?? 50) - 10);
  }

  // Захват региона при убедительной победе
  let capturedRegionId = null;
  if (attackerWins && atkRoll > defRoll * 1.3 && defender.regions.length > 1) {
    capturedRegionId = defender.regions[defender.regions.length - 1];
    defender.regions.splice(defender.regions.indexOf(capturedRegionId), 1);
    attacker.regions.push(capturedRegionId);
    // Передаём здания вместе с регионом — регион уже в GAME_STATE.regions, просто меняем владельца
  }

  // Отношения
  const _ensureRel = (nation, targetId) => {
    if (!nation.relations) nation.relations = {};
    if (!nation.relations[targetId]) nation.relations[targetId] = { score: 0, treaties: [], at_war: false };
  };
  _ensureRel(attacker, defenderNationId);
  _ensureRel(defender, attackerNationId);
  attacker.relations[defenderNationId].at_war = true;
  defender.relations[attackerNationId].at_war = true;
  attacker.relations[defenderNationId].score = Math.max(-100, (attacker.relations[defenderNationId].score ?? 0) - 30);
  defender.relations[attackerNationId].score = Math.max(-100, (defender.relations[attackerNationId].score ?? 0) - 30);

  return { attackerWins, winner: attackerWins ? attackerNationId : defenderNationId,
           loser: attackerWins ? defenderNationId : attackerNationId,
           capturedRegionId, atkCasualties, defCasualties };
}

// Вызывается из AI-движка когда нация решает атаковать
function processAttackAction(attackerNationId, defenderNationId) {
  const result = resolveBattle(attackerNationId, defenderNationId);
  if (!result) return;

  const attName = GAME_STATE.nations[attackerNationId]?.name ?? attackerNationId;
  const defName = GAME_STATE.nations[defenderNationId]?.name ?? defenderNationId;
  const winName = GAME_STATE.nations[result.winner]?.name ?? result.winner;
  const isPlayerInvolved = attackerNationId === GAME_STATE.player_nation
                        || defenderNationId === GAME_STATE.player_nation;

  let msg = `⚔️ ${attName} атакует ${defName}. Победитель: ${winName}. `
          + `Потери: нападающий −${result.atkCasualties} воинов, защитник −${result.defCasualties}.`;

  if (result.capturedRegionId) {
    const rName = MAP_REGIONS?.[result.capturedRegionId]?.name ?? result.capturedRegionId;
    msg += ` Захвачен регион: ${rName}!`;
  }

  addEventLog(msg, isPlayerInvolved ? 'danger' : 'info');

  // Если игрок проиграл регион — дополнительное предупреждение
  if (defenderNationId === GAME_STATE.player_nation && result.capturedRegionId) {
    const rName = MAP_REGIONS?.[result.capturedRegionId]?.name ?? result.capturedRegionId;
    addEventLog(`🚨 Потерян регион ${rName}! Укрепите оборону.`, 'danger');
  }
}
