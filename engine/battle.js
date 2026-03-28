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

  // Совместная атака: союзники по военному союзу добавляют часть силы
  const { bonus: jointBonus, allies: jointAllies } =
    _calcJointAttackBonus(attackerNationId, defenderNationId, terrain, battleType);
  const totalAtkBase = atkBase + jointBonus;

  // Бросок с разбросом ±30%
  const atkRoll = totalAtkBase * (0.7 + Math.random() * 0.6);
  const defRoll = defBase       * (0.7 + Math.random() * 0.6);
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
    jointAllies,   // [] или [{ id, name, contribution }]
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
 * Считает бонус к силе атакующего от союзников по совместному договору.
 * Охватывает два типа:
 *   military_alliance  — 40% силы союзника (постоянный союз, союзник уже воюет с врагом)
 *   joint_campaign     — 60% силы союзника (целевой поход, максимальная координация)
 *
 * Союзник несёт потери 1–3% пехоты за участие.
 * @returns {{ bonus: number, allies: Array<{id, name, contribution, treatyType}> }}
 */
function _calcJointAttackBonus(attackerNationId, defenderNationId, terrain, battleType) {
  const allies = [];
  let bonus = 0;
  if (typeof DiplomacyEngine === 'undefined') return { bonus, allies };

  const treaties = GAME_STATE.diplomacy?.treaties ?? [];

  for (const treaty of treaties) {
    if (treaty.status !== 'active') continue;
    if (!['military_alliance', 'joint_campaign'].includes(treaty.type)) continue;
    if (!treaty.parties.includes(attackerNationId)) continue;

    const allyId = treaty.parties.find(p => p !== attackerNationId);
    if (!allyId || allyId === defenderNationId) continue;

    const ally = GAME_STATE.nations[allyId];
    if (!ally) continue;

    if (treaty.type === 'military_alliance') {
      // Союзник должен сам воевать с этим врагом
      const allyDefRel = DiplomacyEngine.getRelation(allyId, defenderNationId);
      if (!allyDefRel?.war) continue;
    }
    // joint_campaign: союзник участвует всегда — это суть совместного похода;
    // если цель кампании указана в conditions.target_id — сверяем
    if (treaty.type === 'joint_campaign') {
      const targetId = treaty.conditions?.target_id;
      if (targetId && targetId !== defenderNationId) continue;
    }

    const allyStr = calculateMilitaryStrength(ally, {
      terrain, isDefender: false, type: battleType, nationId: allyId,
    });

    // joint_campaign — сильнее скоординированы (60%), military_alliance — 40%
    const contributionPct = treaty.type === 'joint_campaign' ? 0.60 : 0.40;
    const contribution = Math.round(allyStr * contributionPct);
    bonus += contribution;

    // Союзник несёт потери 1–3% пехоты
    const allyLoss = Math.round((ally.military.infantry ?? 0) * (0.01 + Math.random() * 0.02));
    ally.military.infantry = Math.max(0, (ally.military.infantry ?? 0) - allyLoss);

    allies.push({ id: allyId, name: ally.name ?? allyId, contribution, loss: allyLoss, treatyType: treaty.type });
  }

  return { bonus, allies };
}

/**
 * Делит добычу с захваченного региона между атакующим и союзниками по совместному походу.
 * joint_campaign.conditions.shared_loot = 0.5 → 50% добычи уходит союзнику.
 */
function _applySharedLoot(attackerNationId, defenderNationId, capturedRegionId, jointAllies) {
  if (!capturedRegionId || !jointAllies?.length) return;

  const region   = GAME_STATE.regions?.[capturedRegionId];
  const attacker = GAME_STATE.nations[attackerNationId];
  if (!region || !attacker) return;

  // Базовая стоимость добычи: от численности населения региона
  const regionPop  = region.population ?? 5000;
  const baseLoot   = Math.round(regionPop * 0.05);  // 5% населения → монеты
  if (baseLoot <= 0) return;

  const treaties = GAME_STATE.diplomacy?.treaties ?? [];

  for (const ally of jointAllies) {
    if (ally.treatyType !== 'joint_campaign') continue;

    // Ищем соответствующий договор для получения shared_loot коэффициента
    const treaty = treaties.find(t =>
      t.status === 'active' && t.type === 'joint_campaign' &&
      t.parties.includes(attackerNationId) && t.parties.includes(ally.id)
    );
    const lootShare = treaty?.conditions?.shared_loot ?? treaty?.effects?.shared_loot ?? 0.5;
    const allyShare = Math.round(baseLoot * lootShare);

    const allyNation = GAME_STATE.nations[ally.id];
    if (!allyNation?.economy) continue;

    // Вычитаем у атакующего, зачисляем союзнику
    attacker.economy.treasury  = Math.max(0, (attacker.economy.treasury ?? 0) - allyShare);
    allyNation.economy.treasury = (allyNation.economy.treasury ?? 0) + allyShare;

    const isPlayerInvolved = attackerNationId === GAME_STATE.player_nation
                          || ally.id          === GAME_STATE.player_nation;
    if (isPlayerInvolved) {
      addEventLog(
        `💰 Добыча из ${region.name ?? capturedRegionId} разделена: ${ally.name} получает ${allyShare} монет по условиям совместного похода.`,
        'good'
      );
    }
  }
}

/**
 * Активные военные союзы: AI союзники сами атакуют общих врагов каждые 3 хода.
 * Вызывается из turn.js один раз за ход.
 */
function processAllianceWars() {
  if (typeof DiplomacyEngine === 'undefined') return;

  // Только каждые 3 хода и не каждый раз (30% шанс на пару)
  if (GAME_STATE.turn % 3 !== 0) return;

  let allianceBattles = 0;
  const MAX_ALLIANCE_BATTLES = 4;

  const treaties = GAME_STATE.diplomacy?.treaties ?? [];

  for (const treaty of treaties) {
    if (treaty.status !== 'active') continue;
    if (!['military_alliance', 'joint_campaign'].includes(treaty.type)) continue;

    const [natA, natB] = treaty.parties;
    const isJointCampaign = treaty.type === 'joint_campaign';
    // joint_campaign: цель может быть зафиксирована в conditions
    const fixedTarget = isJointCampaign ? (treaty.conditions?.target_id ?? null) : null;

    // Шанс атаки за ход: joint_campaign активнее (50%), military_alliance (30%)
    const attackChance = isJointCampaign ? 0.50 : 0.30;

    for (const [side, other] of [[natA, natB], [natB, natA]]) {
      if (side === GAME_STATE.player_nation) continue; // игрок решает сам
      const sideNat = GAME_STATE.nations[side];
      if (!sideNat) continue;

      // Цели для атаки: зафиксированный враг или все общие враги
      const enemies = fixedTarget
        ? [fixedTarget]
        : (sideNat.military.at_war_with ?? []);

      for (const enemyId of enemies) {
        if (enemyId === other) continue;

        // Для military_alliance — оба должны воевать с врагом
        if (!isJointCampaign) {
          const otherRelEnemy = DiplomacyEngine.getRelation(other, enemyId);
          if (!otherRelEnemy?.war) continue;
        }

        if (allianceBattles >= MAX_ALLIANCE_BATTLES) break;
        if (Math.random() > attackChance) continue;

        const enemy = GAME_STATE.nations[enemyId];
        if (!enemy || !enemy.regions?.length) continue;

        processAttackAction(side, enemyId, { skipDefensiveAlliances: true });
        allianceBattles++;
      }
    }
  }
}

/**
 * Срабатывает оборонный/военный союз: все союзники defenderNationId
 * автоматически вступают в войну против attackerNationId.
 *
 * defensive_alliance → 85% шанс вступления.
 * military_alliance  → всегда вступает.
 *
 * @returns {string[]} список ID наций, вступивших в войну
 */
function triggerDefensiveAlliances(attackerNationId, defenderNationId) {
  if (typeof DiplomacyEngine === 'undefined') return [];
  const treaties = GAME_STATE.diplomacy?.treaties ?? [];
  const triggered = [];

  for (const treaty of treaties) {
    if (treaty.status !== 'active') continue;
    if (!['defensive_alliance', 'military_alliance'].includes(treaty.type)) continue;
    if (!treaty.parties.includes(defenderNationId)) continue;

    const allyId = treaty.parties.find(p => p !== defenderNationId);
    if (!allyId || allyId === attackerNationId) continue;

    // Уже воюют с агрессором — не нужно повторно втягивать
    const allyAtkRel = DiplomacyEngine.getRelation(allyId, attackerNationId);
    if (allyAtkRel?.war) continue;

    // Союзник воюет с самим защитником — нейтралитет
    const allyDefRel = DiplomacyEngine.getRelation(allyId, defenderNationId);
    if (allyDefRel?.war) continue;

    const allyNation     = GAME_STATE.nations[allyId];
    const attackerNation = GAME_STATE.nations[attackerNationId];
    const defenderNation = GAME_STATE.nations[defenderNationId];
    if (!allyNation || !attackerNation) continue;

    const joinChance = treaty.type === 'military_alliance' ? 1.0 : 0.85;
    if (Math.random() > joinChance) {
      // Не вступил — трусость / нейтралитет, штраф к отношениям с защитником
      const allyDefRelObj = DiplomacyEngine.getRelation(allyId, defenderNationId);
      if (allyDefRelObj) allyDefRelObj.score = Math.max(-100, (allyDefRelObj.score ?? 0) - 15);
      addEventLog(
        `⚠️ ${allyNation.name} уклонился от исполнения союзного долга перед ${defenderNation?.name ?? defenderNationId}.`,
        'warning'
      );
      continue;
    }

    // === Союзник вступает в войну ===

    // DiplomacyEngine (канонический источник)
    DiplomacyEngine.getRelation(allyId, attackerNationId).war = true;

    // Старый формат relations (совместимость)
    _ensureRelation(allyNation, attackerNationId);
    _ensureRelation(attackerNation, allyId);
    allyNation.relations[attackerNationId].at_war = true;
    attackerNation.relations[allyId].at_war       = true;

    // at_war_with массивы
    allyNation.military.at_war_with     = allyNation.military.at_war_with     ?? [];
    attackerNation.military.at_war_with = attackerNation.military.at_war_with ?? [];
    if (!allyNation.military.at_war_with.includes(attackerNationId))
      allyNation.military.at_war_with.push(attackerNationId);
    if (!attackerNation.military.at_war_with.includes(allyId))
      attackerNation.military.at_war_with.push(allyId);

    const treatyLabel = treaty.type === 'military_alliance' ? 'Военный союз' : 'Оборонный союз';

    if (attackerNationId === GAME_STATE.player_nation) {
      addEventLog(
        `🛡 ${allyNation.name} вступил в войну ПРОТИВ ВАС, защищая ${defenderNation?.name ?? defenderNationId} (${treatyLabel})!`,
        'danger'
      );
    } else if (allyId === GAME_STATE.player_nation) {
      addEventLog(
        `🛡 ${treatyLabel} с ${defenderNation?.name ?? defenderNationId} обязывает вас вступить в войну против ${attackerNation.name}!`,
        'danger'
      );
    } else {
      addEventLog(
        `🛡 ${allyNation.name} вступил в войну на стороне ${defenderNation?.name ?? defenderNationId} против ${attackerNation.name} (${treatyLabel}).`,
        'info'
      );
    }

    triggered.push(allyId);
  }

  return triggered;
}

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

  // Оборонные союзы: союзники защитника автоматически вступают в войну
  if (!opts.skipDefensiveAlliances) {
    triggerDefensiveAlliances(attackerNationId, defenderNationId);
  }

  // Раздел добычи с союзниками по совместному походу
  if (result.capturedRegionId && result.jointAllies?.length) {
    _applySharedLoot(attackerNationId, defenderNationId, result.capturedRegionId, result.jointAllies);
  }

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
    if (result.jointAllies?.length) {
      const allyNames = result.jointAllies.map(a => a.name).join(', ');
      msg += ` ⚔ Совместная атака: ${allyNames}.`;
    }
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
