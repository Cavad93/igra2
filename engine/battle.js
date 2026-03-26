// ══════════════════════════════════════════════════════════════════════
// BATTLE ENGINE — разрешение военных столкновений
//
// Типы боёв:
//   - field:  полевое сражение (по умолчанию)
//   - siege:  осада города/крепости
//   - naval:  морской бой
//
// Формула силы (полевой бой):
//   strength = infantry×INF_MULT + cavalry×CAV_MULT + mercenaries×MERC_MULT
//            + morale×MORALE_MULT + personal_power×PP_MULT
//            + garrison×GARRISON_MULT (для защитника)
//
// Местность влияет на множители атакующего.
// Защитник получает бонус (DEFENDER_BONUS).
// Исход определяется броском с разбросом ±30%.
// Захват региона — если победитель превзошёл в 1.3× и у проигравшего > 1 региона.
// ══════════════════════════════════════════════════════════════════════

// ── Константы баланса боя ────────────────────────────────────────────

const BATTLE = {
  // Множители типов войск
  INF_MULT:       1,
  CAV_MULT:       3,
  SHIP_MULT:      2,
  MERC_MULT:      1.5,
  GARRISON_MULT:  0.8,

  // Бонусы
  MORALE_MULT:    0.5,
  PP_MULT:        0.2,
  DEFENDER_BONUS: 1.2,

  // Потери
  CASUALTY_MIN:   0.05,   // 5%
  CASUALTY_MAX:   0.15,   // 15%
  INF_CASUALTY_SHARE: 0.7,
  CAV_CASUALTY_SHARE: 0.3,

  // Мораль от победы/поражения
  WINNER_MORALE_GAIN:  8,
  LOSER_MORALE_LOSS:  15,
  LOSER_STABILITY_LOSS: 15,
  FAILED_ATK_MORALE_LOSS: 12,
  FAILED_ATK_STABILITY_LOSS: 10,

  // Захват региона — порог превосходства
  CAPTURE_THRESHOLD: 1.3,

  // Отношения
  WAR_RELATION_DROP: 30,

  // Бонусы местности для АТАКУЮЩЕГО
  // < 1.0 = местность мешает, > 1.0 = помогает
  TERRAIN_ATTACK_MULT: {
    plains:       1.0,
    river_valley: 0.95,
    coastal_city: 0.85,  // стены города
    hills:        0.80,
    mountains:    0.65,  // горы сильно мешают атаке
  },

  // Бонусы кавалерии по местности
  TERRAIN_CAVALRY_MULT: {
    plains:       1.3,   // кавалерия сильна на равнине
    river_valley: 1.1,
    coastal_city: 0.6,   // кавалерия бесполезна в городе
    hills:        0.7,
    mountains:    0.4,   // кавалерия не может маневрировать
  },

  // Осада
  SIEGE_WALL_BONUS:      1.8,   // стены удваивают защиту
  SIEGE_GARRISON_MULT:   2.0,   // гарнизон вдвое эффективнее при осаде
  SIEGE_ATTRITION:       0.02,  // 2% потери атакующего за ход осады
  SIEGE_STARVATION:      0.01,  // 1% потери защитника от голода за ход

  // Морской бой
  NAVAL_SHIP_MULT:       5,     // корабли — главная сила
  NAVAL_SAILOR_MULT:     0.3,   // моряки вносят вклад
  NAVAL_RAM_BONUS:       1.2,   // таранный бонус для тяжёлых кораблей
};

// ── Расчёт силы ──────────────────────────────────────────────────────

function calculateMilitaryStrength(nation, opts = {}) {
  const mil = nation.military;
  const pp  = nation.government?.ruler?.personal_power ?? 50;
  const terrain = opts.terrain || 'plains';
  const isDefender = opts.isDefender || false;
  const isSiege = opts.type === 'siege';

  const terrainAtkMult = isDefender ? 1.0 : (BATTLE.TERRAIN_ATTACK_MULT[terrain] ?? 1.0);
  const terrainCavMult = BATTLE.TERRAIN_CAVALRY_MULT[terrain] ?? 1.0;

  let strength =
    (mil.infantry    ?? 0) * BATTLE.INF_MULT +
    (mil.cavalry     ?? 0) * BATTLE.CAV_MULT * terrainCavMult +
    (mil.mercenaries ?? 0) * BATTLE.MERC_MULT +
    (mil.morale      ?? 50) * BATTLE.MORALE_MULT +
    pp * BATTLE.PP_MULT;

  // Гарнизон защитника
  if (isDefender && opts.garrison > 0) {
    const garrisonMult = isSiege ? BATTLE.SIEGE_GARRISON_MULT : BATTLE.GARRISON_MULT;
    strength += opts.garrison * garrisonMult;
  }

  // Стены при осаде
  if (isDefender && isSiege) {
    strength *= BATTLE.SIEGE_WALL_BONUS;
  }

  // Множитель местности для атакующего
  strength *= terrainAtkMult;

  // Бонус защитника
  if (isDefender) {
    strength *= BATTLE.DEFENDER_BONUS;
  }

  // Культурные бонусы
  if (typeof getCultureBonus === 'function') {
    const nationId = opts.nationId;
    if (nationId) {
      const atkBonus = getCultureBonus(nationId, 'army_strength') || 0;
      strength *= (1 + atkBonus);
    }
  }

  return Math.max(1, strength);
}

// ── Полевое/осадное сражение ─────────────────────────────────────────

function resolveBattle(attackerNationId, defenderNationId, opts = {}) {
  const attacker = GAME_STATE.nations[attackerNationId];
  const defender = GAME_STATE.nations[defenderNationId];
  if (!attacker || !defender) return null;

  // Определяем регион боя (для местности и гарнизона)
  const targetRegionId = opts.targetRegionId
    || (defender.regions?.length > 0 ? defender.regions[defender.regions.length - 1] : null);
  if (!targetRegionId) {
    console.warn('[battle] defender has no regions, battle aborted');
    return null;
  }
  const regionData = GAME_STATE.regions[targetRegionId];
  const terrain = regionData?.terrain || 'plains';
  const garrison = regionData?.garrison || 0;
  const battleType = opts.type || (terrain === 'coastal_city' ? 'siege' : 'field');

  const atkBase = calculateMilitaryStrength(attacker, {
    terrain, isDefender: false, type: battleType, nationId: attackerNationId,
  });
  const defBase = calculateMilitaryStrength(defender, {
    terrain, isDefender: true, type: battleType, garrison, nationId: defenderNationId,
  });

  // Бросок с разбросом ±30%
  const atkRoll = atkBase * (0.7 + Math.random() * 0.6);
  const defRoll = defBase * (0.7 + Math.random() * 0.6);
  const attackerWins = atkRoll > defRoll;

  // Потери: 5-15% от пехоты+конницы каждой стороны
  const casualtyRate = () => BATTLE.CASUALTY_MIN + Math.random() * (BATTLE.CASUALTY_MAX - BATTLE.CASUALTY_MIN);

  const atkForce = (attacker.military.infantry ?? 0) + (attacker.military.cavalry ?? 0) * BATTLE.CAV_MULT;
  const defForce = (defender.military.infantry ?? 0) + (defender.military.cavalry ?? 0) * BATTLE.CAV_MULT;

  // Проигравший теряет больше
  const atkRate = attackerWins ? casualtyRate() * 0.7 : casualtyRate();
  const defRate = attackerWins ? casualtyRate() : casualtyRate() * 0.7;

  const atkCasualties = Math.round(atkForce * atkRate);
  const defCasualties = Math.round(defForce * defRate);

  // Распределяем потери: 70% пехота, 30% кавалерия
  attacker.military.infantry = Math.max(0,
    (attacker.military.infantry ?? 0) - Math.round(atkCasualties * BATTLE.INF_CASUALTY_SHARE));
  attacker.military.cavalry = Math.max(0,
    (attacker.military.cavalry ?? 0) - Math.round(atkCasualties * BATTLE.CAV_CASUALTY_SHARE / BATTLE.CAV_MULT));
  defender.military.infantry = Math.max(0,
    (defender.military.infantry ?? 0) - Math.round(defCasualties * BATTLE.INF_CASUALTY_SHARE));
  defender.military.cavalry = Math.max(0,
    (defender.military.cavalry ?? 0) - Math.round(defCasualties * BATTLE.CAV_CASUALTY_SHARE / BATTLE.CAV_MULT));

  // Потери гарнизона при осаде
  if (battleType === 'siege' && regionData) {
    const garrisonLoss = Math.round((garrison || 0) * (attackerWins ? 0.4 : 0.1));
    regionData.garrison = Math.max(0, (regionData.garrison || 0) - garrisonLoss);
  }

  // Мораль и стабильность
  if (attackerWins) {
    attacker.military.morale = Math.min(100, (attacker.military.morale ?? 50) + BATTLE.WINNER_MORALE_GAIN);
    defender.military.morale = Math.max(0,   (defender.military.morale ?? 50) - BATTLE.LOSER_MORALE_LOSS);
    defender.government.stability = Math.max(0, (defender.government.stability ?? 50) - BATTLE.LOSER_STABILITY_LOSS);
  } else {
    defender.military.morale = Math.min(100, (defender.military.morale ?? 50) + BATTLE.WINNER_MORALE_GAIN);
    attacker.military.morale = Math.max(0,   (attacker.military.morale ?? 50) - BATTLE.FAILED_ATK_MORALE_LOSS);
    attacker.government.stability = Math.max(0, (attacker.government.stability ?? 50) - BATTLE.FAILED_ATK_STABILITY_LOSS);
  }

  // Захват региона при убедительной победе
  let capturedRegionId = null;
  if (attackerWins && atkRoll > defRoll * BATTLE.CAPTURE_THRESHOLD && defender.regions.length > 1) {
    capturedRegionId = targetRegionId;
    const idx = defender.regions.indexOf(capturedRegionId);
    if (idx !== -1) {
      defender.regions.splice(idx, 1);
      attacker.regions.push(capturedRegionId);
      // Обновляем владельца региона
      if (regionData) regionData.nation = attackerNationId;
    }
  }

  // Отношения
  _ensureRelation(attacker, defenderNationId);
  _ensureRelation(defender, attackerNationId);
  attacker.relations[defenderNationId].at_war = true;
  defender.relations[attackerNationId].at_war = true;
  attacker.relations[defenderNationId].score = Math.max(-100,
    (attacker.relations[defenderNationId].score ?? 0) - BATTLE.WAR_RELATION_DROP);
  defender.relations[attackerNationId].score = Math.max(-100,
    (defender.relations[attackerNationId].score ?? 0) - BATTLE.WAR_RELATION_DROP);
  // Sync war status to DiplomacyEngine (canonical diplomacy storage)
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.getRelation(attackerNationId, defenderNationId).war = true;
  }

  return {
    attackerWins,
    winner: attackerWins ? attackerNationId : defenderNationId,
    loser: attackerWins ? defenderNationId : attackerNationId,
    capturedRegionId, atkCasualties, defCasualties,
    battleType, terrain,
  };
}

// ── Морской бой ──────────────────────────────────────────────────────

function resolveNavalBattle(attackerNationId, defenderNationId) {
  const attacker = GAME_STATE.nations[attackerNationId];
  const defender = GAME_STATE.nations[defenderNationId];
  if (!attacker || !defender) return null;

  const atkNaval = (attacker.military.ships ?? 0) * BATTLE.NAVAL_SHIP_MULT
                 + (attacker.military.morale ?? 50) * BATTLE.MORALE_MULT;
  const defNaval = (defender.military.ships ?? 0) * BATTLE.NAVAL_SHIP_MULT
                 + (defender.military.morale ?? 50) * BATTLE.MORALE_MULT;

  // Культурные бонусы флота
  let atkBonus = 1, defBonus = 1;
  if (typeof getCultureBonus === 'function') {
    atkBonus += getCultureBonus(attackerNationId, 'naval_strength') || 0;
    defBonus += getCultureBonus(defenderNationId, 'naval_strength') || 0;
  }

  const atkRoll = atkNaval * atkBonus * (0.7 + Math.random() * 0.6);
  const defRoll = defNaval * defBonus * (0.7 + Math.random() * 0.6);
  const attackerWins = atkRoll > defRoll;

  // Потери кораблей: 10-25%
  const atkShipLoss = Math.round((attacker.military.ships ?? 0) * (0.1 + Math.random() * 0.15));
  const defShipLoss = Math.round((defender.military.ships ?? 0) * (0.1 + Math.random() * 0.15));
  attacker.military.ships = Math.max(0, (attacker.military.ships ?? 0) - atkShipLoss);
  defender.military.ships = Math.max(0, (defender.military.ships ?? 0) - defShipLoss);

  if (attackerWins) {
    attacker.military.morale = Math.min(100, (attacker.military.morale ?? 50) + 5);
    defender.military.morale = Math.max(0,   (defender.military.morale ?? 50) - 10);
  } else {
    defender.military.morale = Math.min(100, (defender.military.morale ?? 50) + 5);
    attacker.military.morale = Math.max(0,   (attacker.military.morale ?? 50) - 10);
  }

  _ensureRelation(attacker, defenderNationId);
  _ensureRelation(defender, attackerNationId);
  attacker.relations[defenderNationId].at_war = true;
  defender.relations[attackerNationId].at_war = true;
  // Sync war status to DiplomacyEngine (canonical diplomacy storage)
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.getRelation(attackerNationId, defenderNationId).war = true;
  }

  return {
    attackerWins,
    winner: attackerWins ? attackerNationId : defenderNationId,
    loser: attackerWins ? defenderNationId : attackerNationId,
    atkShipLoss, defShipLoss, battleType: 'naval',
  };
}

// ── Вспомогательные ──────────────────────────────────────────────────

/**
 * Возвращает true и блокирует атаку, если между нациями действует пакт о ненападении.
 * AI-атаки отклоняются молча. Если атакует игрок — он обязан сначала объявить войну
 * через declareWar() (там будет своя проверка с предупреждением).
 */
function _isBlockedByNonAggression(attackerNationId, defenderNationId) {
  if (typeof DiplomacyEngine === 'undefined') return false;
  const rel = DiplomacyEngine.getRelation(attackerNationId, defenderNationId);
  if (!rel?.flags?.no_attack) return false;

  // AI пытается атаковать через пакт — блокируем
  if (attackerNationId !== GAME_STATE.player_nation) {
    console.info(`[battle] ${attackerNationId} blocked by non-aggression pact with ${defenderNationId}`);
    return true;
  }

  // Игрок атакует без объявления войны напрямую (минуя declareWar) — тоже блокируем,
  // но объявление войны через UI должно идти через declareWar().
  return true;
}

function _ensureRelation(nation, targetId) {
  if (!nation.relations) nation.relations = {};
  if (!nation.relations[targetId]) {
    nation.relations[targetId] = { score: 0, treaties: [], at_war: false };
  }
}

// ── Внешний API ──────────────────────────────────────────────────────

function processAttackAction(attackerNationId, defenderNationId, opts = {}) {
  // Проверка пакта о ненападении
  if (_isBlockedByNonAggression(attackerNationId, defenderNationId)) return null;

  const result = opts.type === 'naval'
    ? resolveNavalBattle(attackerNationId, defenderNationId)
    : resolveBattle(attackerNationId, defenderNationId, opts);
  if (!result) return;

  const attName = GAME_STATE.nations[attackerNationId]?.name ?? attackerNationId;
  const defName = GAME_STATE.nations[defenderNationId]?.name ?? defenderNationId;
  const winName = GAME_STATE.nations[result.winner]?.name ?? result.winner;
  const isPlayerInvolved = attackerNationId === GAME_STATE.player_nation
                        || defenderNationId === GAME_STATE.player_nation;

  const typeLabel = result.battleType === 'naval' ? 'Морской бой'
                  : result.battleType === 'siege' ? 'Осада'
                  : 'Сражение';
  const terrainLabel = result.terrain ? ` (${getTerrainName(result.terrain)})` : '';

  let msg;
  if (result.battleType === 'naval') {
    msg = `⚓ ${typeLabel}: ${attName} vs ${defName}. Победитель: ${winName}. `
        + `Потери кораблей: ${attName} −${result.atkShipLoss}, ${defName} −${result.defShipLoss}.`;
  } else {
    msg = `⚔️ ${typeLabel}${terrainLabel}: ${attName} атакует ${defName}. Победитель: ${winName}. `
        + `Потери: нападающий −${result.atkCasualties} воинов, защитник −${result.defCasualties}.`;
  }

  if (result.capturedRegionId) {
    const rName = MAP_REGIONS?.[result.capturedRegionId]?.name ?? result.capturedRegionId;
    msg += ` Захвачен регион: ${rName}!`;
  }

  addEventLog(msg, isPlayerInvolved ? 'danger' : 'info');

  if (defenderNationId === GAME_STATE.player_nation && result.capturedRegionId) {
    const rName = MAP_REGIONS?.[result.capturedRegionId]?.name ?? result.capturedRegionId;
    addEventLog(`Потерян регион ${rName}! Укрепите оборону.`, 'danger');
  }

  return result;
}

// Вспомогательная: название местности (если getTerrainName не определена глобально)
if (typeof getTerrainName === 'undefined') {
  function getTerrainName(t) {
    const names = {
      plains: 'Равнина', hills: 'Холмы', mountains: 'Горы',
      coastal_city: 'Прибрежный город', river_valley: 'Речная долина',
    };
    return names[t] || t;
  }
}
