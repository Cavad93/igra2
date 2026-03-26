// ══════════════════════════════════════════════════════════════════════
// SIEGE ENGINE — механика осады крепостей
//
// Крепости (fortress_level 1-5) требуют осады.
// Без крепости — захват после победы в полевом бою.
//
// Прогресс осады (0-100%):
//   base_progress = SIEGE_BASE + artillery_bonus + strength_bonus + commander_bonus
//   actual_progress = base_progress × (1 − fortress_resistance/200)
//
// Капитуляция: progress≥100 | garrison=0 | garrison_morale=0
// Штурм: возможен при progress≥50 | garrison_morale≤30 (риск: +20% потерь)
// ══════════════════════════════════════════════════════════════════════

const SIEGE_CFG = {
  // Сопротивление крепости по уровню (уменьшает прогресс)
  FORTRESS_RESIST: { 1: 20, 2: 40, 3: 55, 4: 70, 5: 85 },

  SIEGE_BASE:         5,   // % прогресса в ход без бонусов
  ARTILLERY_BONUS:   15,   // доп. % за каждые 100 единиц арт.
  STRENGTH_BONUS_MAX: 5,   // макс. бонус от численного превосходства
  CMD_SIEGE_BONUS:    2,   // % за ед. навыка осады командира

  GARRISON_SUPPLY_DROP: 8,  // убыль снабжения гарнизона в ход
  STARVATION_LOSS:   0.03,  // 3%/ход гарнизона при нулевом снабжении
  GARRISON_MORALE_DROP: 2,  // мораль гарнизона −2/ход

  ATTRITION_ATTACKER: 0.01, // 1%/ход для атакующего при осаде

  STORM_MIN_PROGRESS: 50,   // мин. прогресс для штурма
  STORM_CASUALTY:    0.20,  // 20% потерь при штурме
  STORM_PROGRESS_MULT: 3.0, // прогресс × N при штурме

  // Сколько War Score даёт взятый город
  WAR_SCORE_SIEGE: 15,
};

// ── Начало осады ─────────────────────────────────────────────────────

/**
 * @param {Object} attackerArmy - армия осаждающих
 * @param {string} regionId
 * @param {number} fortressLevel - 1-5
 * @param {number} garrison - начальный гарнизон
 */
function beginSiege(attackerArmy, regionId, fortressLevel, garrison) {
  if (!GAME_STATE.sieges) GAME_STATE.sieges = [];

  // Уже осаждается?
  const existing = GAME_STATE.sieges.find(s => s.region_id === regionId && s.status === 'active');
  if (existing) {
    if (!existing.attacker_army_ids.includes(attackerArmy.id))
      existing.attacker_army_ids.push(attackerArmy.id);
    attackerArmy.state    = 'sieging';
    attackerArmy.siege_id = existing.id;
    return existing;
  }

  const region = _getRegionData(regionId);
  const id     = `siege_${regionId}_t${GAME_STATE.turn ?? 1}`;

  const siege = {
    id,
    region_id:         regionId,
    region_name:       region?.name ?? regionId,
    attacker_army_ids: [attackerArmy.id],
    attacker_nation:   attackerArmy.nation,
    defender_nation:   region?.nation ?? 'unknown',

    fortress_level:  fortressLevel,
    resistance:      SIEGE_CFG.FORTRESS_RESIST[fortressLevel] ?? 50,

    garrison,
    garrison_morale:  80,
    garrison_supply: 100,

    progress:      0,
    starvation:    0,

    started_turn:  GAME_STATE.turn ?? 1,
    turns_elapsed: 0,
    status:       'active', // 'active' | 'captured' | 'lifted' | 'relieved'

    storm_possible: false,
  };

  GAME_STATE.sieges.push(siege);
  attackerArmy.state    = 'sieging';
  attackerArmy.siege_id = id;

  const attName = GAME_STATE.nations[attackerArmy.nation]?.name ?? attackerArmy.nation;
  const defName = GAME_STATE.nations[region?.nation]?.name ?? region?.nation ?? '?';
  if (typeof addEventLog === 'function')
    addEventLog(
      `🏰 ${attName} начинает осаду ${siege.region_name} `
      + `(уровень крепости: ${fortressLevel}). Гарнизон: ${garrison}.`,
      'military'
    );

  return siege;
}

// ── Ход осады ─────────────────────────────────────────────────────────

function processSiegeTicks() {
  const sieges = GAME_STATE.sieges ?? [];

  for (const siege of sieges) {
    if (siege.status !== 'active') continue;
    siege.turns_elapsed++;

    // Текущие армии осаждающих
    const armies = (GAME_STATE.armies ?? []).filter(
      a => siege.attacker_army_ids.includes(a.id) && a.state !== 'disbanded'
    );

    if (armies.length === 0) {
      siege.status = 'lifted';
      if (typeof addEventLog === 'function')
        addEventLog(`🛡 Осада ${siege.region_name} снята — осаждающие покинули позиции.`, 'military');
      continue;
    }

    // ── Прогресс осады ────────────────────────────────────────────
    const totalTroops   = armies.reduce((s, a) => s + _landTotal(a.units), 0);
    const totalArtil    = armies.reduce((s, a) => s + (a.units.artillery ?? 0), 0);
    const leadArmy      = armies[0];
    const cmd           = typeof getArmyCommander === 'function' ? getArmyCommander(leadArmy) : null;
    const siegeSkill    = cmd?.skills?.siege ?? 0;
    const cmdBonus      = siegeSkill * SIEGE_CFG.CMD_SIEGE_BONUS;

    // Черта siege_master
    const hasSiegeMaster = (cmd?.traits_list ?? cmd?.traits ?? []).includes('siege_master');
    const traitBonus     = hasSiegeMaster ? (COMBAT?.TRAITS?.siege_master?.siege_speed ?? 0.30) * SIEGE_CFG.SIEGE_BASE : 0;

    const artBonus     = (totalArtil / 100) * SIEGE_CFG.ARTILLERY_BONUS;
    const ratio        = Math.min(3, totalTroops / Math.max(1, siege.garrison));
    const strBonus     = (ratio - 1) * (SIEGE_CFG.STRENGTH_BONUS_MAX / 2);

    const rawProgress  = SIEGE_CFG.SIEGE_BASE + artBonus + strBonus + cmdBonus + traitBonus;
    const resFactor    = 1 - (siege.resistance / 200); // 0.575 – 0.90

    siege.progress = Math.min(100, siege.progress + Math.max(0.3, rawProgress * resFactor));

    // ── Снабжение гарнизона ───────────────────────────────────────
    siege.garrison_supply = Math.max(0, siege.garrison_supply - SIEGE_CFG.GARRISON_SUPPLY_DROP);

    if (siege.garrison_supply <= 0) {
      const lossCount = Math.max(1, Math.round(siege.garrison * SIEGE_CFG.STARVATION_LOSS));
      siege.garrison  = Math.max(0, siege.garrison - lossCount);
      siege.garrison_morale = Math.max(0, siege.garrison_morale - 8);
      siege.starvation++;

      if (siege.turns_elapsed % 3 === 0 && typeof addEventLog === 'function') {
        const dName = GAME_STATE.nations[siege.defender_nation]?.name ?? siege.defender_nation;
        addEventLog(
          `🍞 Гарнизон ${siege.region_name} голодает! Потери: ${lossCount}. `
          + `Мораль: ${siege.garrison_morale}.`,
          'military'
        );
      }
    } else {
      siege.garrison_morale = Math.max(0, siege.garrison_morale - SIEGE_CFG.GARRISON_MORALE_DROP);
    }

    // ── Атрошн атакующих ─────────────────────────────────────────
    for (const army of armies) {
      army.units.infantry = Math.max(0,
        Math.round(army.units.infantry * (1 - SIEGE_CFG.ATTRITION_ATTACKER))
      );
      army.fatigue = Math.min(100, army.fatigue + 3);
    }

    // ── Возможность штурма ────────────────────────────────────────
    siege.storm_possible = siege.progress >= SIEGE_CFG.STORM_MIN_PROGRESS
      || siege.garrison_morale <= 30;

    // ── Капитуляция ───────────────────────────────────────────────
    if (siege.progress >= 100 || siege.garrison <= 0 || siege.garrison_morale <= 0) {
      _completeSiege(siege, armies[0], 'surrender');
      continue;
    }

    // ── Уведомление игрока ────────────────────────────────────────
    const playerInvolved = siege.attacker_nation === GAME_STATE.player_nation
      || siege.defender_nation === GAME_STATE.player_nation;

    if (playerInvolved && siege.turns_elapsed % 3 === 0 && typeof addEventLog === 'function') {
      const stormHint = siege.storm_possible ? ' [Штурм доступен!]' : '';
      addEventLog(
        `🏰 Осада ${siege.region_name}: прогресс ${Math.round(siege.progress)}%${stormHint}. `
        + `Гарнизон: ${siege.garrison} (мораль ${siege.garrison_morale}).`,
        'military'
      );
    }
  }
}

// ── Штурм ─────────────────────────────────────────────────────────────

/**
 * Немедленный штурм крепости — рискованно, но быстро.
 * @returns {Object|null} результат штурма
 */
function stormAssault(armyId, siegeId) {
  const army  = typeof getArmy === 'function' ? getArmy(armyId) : null;
  const siege = (GAME_STATE.sieges ?? []).find(s => s.id === siegeId);

  if (!army || !siege || siege.status !== 'active') return null;
  if (!siege.storm_possible) {
    if (typeof addEventLog === 'function')
      addEventLog(`❌ Штурм ${siege.region_name} невозможен — прогресс осады слишком мал.`, 'warning');
    return null;
  }

  // Тяжёлые потери атакующих
  const stormCas = Math.round(_landTotal(army.units) * SIEGE_CFG.STORM_CASUALTY);
  if (typeof _applyLoss === 'function') _applyLoss(army, stormCas);
  else {
    army.units.infantry = Math.max(0, Math.round(army.units.infantry * 0.80));
  }

  army.morale     = Math.max(20, army.morale - 15);
  army.discipline = Math.max(0,  army.discipline - 3);

  siege.progress = Math.min(100, siege.progress * SIEGE_CFG.STORM_PROGRESS_MULT);

  if (typeof addEventLog === 'function')
    addEventLog(
      `⚔️ Штурм ${siege.region_name}! Потери: ${stormCas}. Прогресс: ${Math.round(siege.progress)}%.`,
      'military'
    );

  if (siege.progress >= 100) {
    _completeSiege(siege, army, 'storm');
  }

  return { stormCas, progress: siege.progress };
}

// ── Снятие осады ─────────────────────────────────────────────────────

function liftSiege(armyId) {
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army || !army.siege_id) return;

  const siege = (GAME_STATE.sieges ?? []).find(s => s.id === army.siege_id);
  if (siege) {
    siege.attacker_army_ids = siege.attacker_army_ids.filter(id => id !== armyId);
    if (siege.attacker_army_ids.length === 0) siege.status = 'lifted';
  }

  army.siege_id = null;
  army.state    = 'stationed';
}

// ── Оценка длительности осады ─────────────────────────────────────────

/**
 * Рассчитать ожидаемое число ходов до капитуляции.
 */
function estimateSiegeDuration(armyId, regionId) {
  const army   = typeof getArmy === 'function' ? getArmy(armyId) : null;
  const region = _getRegionData(regionId);
  if (!army || !region) return null;

  const fl = region.fortress_level ?? 0;
  if (fl === 0) return 0;

  const totalArtil = army.units.artillery ?? 0;
  const totalTroops = _landTotal(army.units);
  const garrison   = region.garrison ?? 500;
  const cmd        = typeof getArmyCommander === 'function' ? getArmyCommander(army) : null;
  const siegeSkill = cmd?.skills?.siege ?? 0;

  const artBonus  = (totalArtil / 100) * SIEGE_CFG.ARTILLERY_BONUS;
  const ratio     = Math.min(3, totalTroops / Math.max(1, garrison));
  const strBonus  = (ratio - 1) * (SIEGE_CFG.STRENGTH_BONUS_MAX / 2);
  const cmdBonus  = siegeSkill * SIEGE_CFG.CMD_SIEGE_BONUS;

  const resFactor  = 1 - ((SIEGE_CFG.FORTRESS_RESIST[fl] ?? 50) / 200);
  const perTurn    = Math.max(0.3, (SIEGE_CFG.SIEGE_BASE + artBonus + strBonus + cmdBonus) * resFactor);

  return Math.ceil(100 / perTurn);
}

// ── Завершение осады ──────────────────────────────────────────────────

function _completeSiege(siege, winArmy, cause) {
  siege.status = 'captured';
  if (winArmy) {
    winArmy.state    = 'stationed';
    winArmy.siege_id = null;
  }

  if (typeof captureRegion === 'function')
    captureRegion(siege.attacker_nation, siege.region_id, siege.defender_nation);

  // War score
  if (winArmy) winArmy.war_score_earned += SIEGE_CFG.WAR_SCORE_SIEGE;

  const causeLabel = { storm: 'штурмом', surrender: 'капитуляцией', starvation: 'голодом' }[cause] ?? 'осадой';
  const attName = GAME_STATE.nations[siege.attacker_nation]?.name ?? siege.attacker_nation;

  if (typeof addEventLog === 'function')
    addEventLog(
      `🏰✅ ${attName} берёт ${siege.region_name} ${causeLabel}! `
      + `Осада длилась ${siege.turns_elapsed} ходов.`,
      'military'
    );

  // Небольшой гарнизон захватчика в регионе
  const gr = GAME_STATE.regions?.[siege.region_id];
  if (gr) gr.garrison = Math.max(100, Math.round((siege.garrison ?? 0) * 0.1));
}

function _getRegionData(regionId) {
  return GAME_STATE.regions?.[regionId]
    ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[regionId] : null);
}

function _landTotal(u) {
  return (u.infantry ?? 0) + (u.cavalry ?? 0) + (u.mercenaries ?? 0) + (u.artillery ?? 0);
}
