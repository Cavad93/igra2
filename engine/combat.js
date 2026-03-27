// ══════════════════════════════════════════════════════════════════════
// COMBAT ENGINE — расширенная боевая система для армейских стеков
//
// Формула эффективной силы:
//   E = baseStrength
//     × moraleMultiplier (×0.25 – ×1.5)
//     × disciplineMultiplier (×0.7 – ×1.3)
//     × fatigueMultiplier (×0.6 – ×1.0)
//     × techMultiplier (×1.0 – ×1.3)
//     × commanderMultiplier (×0.9 – ×1.4)
//     × terrainMultiplier (×0.6 – ×1.2)
//     × formationMultiplier (×0.75 – ×1.3)
//     × compositionBonus (×1.0 – ×1.1)
//
// Бой трёхфазный: Скирмиш → Ближний бой → Преследование
// ══════════════════════════════════════════════════════════════════════

const COMBAT = {
  // Порог морали: бегство
  ROUT_THRESHOLD:  15,
  PANIC_THRESHOLD: 30,   // штраф к силе

  // Изменения морали
  MORALE_WIN:     +12,
  MORALE_LOSE:    -22,
  MORALE_DEF_WIN: +8,
  MORALE_DEF_LOSE:-18,

  // Изменения дисциплины
  DISC_WIN:  +3,
  DISC_LOSE: -5,

  // Технологии: +6% силы за уровень (0-5)
  TECH_BONUS: 0.06,

  // Местность — множитель атаки
  TERRAIN_ATK: {
    plains:       1.00,
    river_valley: 0.90,
    coastal_city: 0.80,
    hills:        0.75,
    mountains:    0.60,
  },

  // Местность — кавалерия
  TERRAIN_CAV: {
    plains:       1.30,
    river_valley: 1.10,
    coastal_city: 0.50,
    hills:        0.65,
    mountains:    0.35,
  },

  // Формации
  FORMATIONS: {
    standard:   { atk: 1.00, def: 1.00 },
    aggressive: { atk: 1.25, def: 0.75, cav_bonus: 0.0  },
    defensive:  { atk: 0.80, def: 1.30, cav_bonus: -0.1 },
    flanking:   { atk: 1.10, def: 0.90, cav_bonus: 0.15 },
  },

  // Черты командира: бонусы к полям силы
  TRAITS: {
    aggressive:   { atk:  0.20, def: -0.10, pursuit:  0.30 },
    defensive:    { atk: -0.10, def:  0.25, pursuit: -0.10 },
    tactician:    { atk:  0.10, def:  0.10, pursuit:  0.10 },
    inspiring:    { morale: 0.15 },
    siege_master: { siege_speed: 0.30 },
    navigator:    { naval: 0.20 },
    logistician:  { supply_bonus: 1.0 },
  },

  // Потери по фазам боя
  SKIRMISH_LOSS:  0.025, // скирмиш — 2.5%
  MELEE_LOSS:     0.075, // ближний бой — 7.5%
  PURSUIT_LOSS:   0.040, // преследование — 4%

  // Бонус структуры армии (сбалансированный состав)
  COMPOSITION_BONUS: 1.10,
};

// ── Главная функция боя ───────────────────────────────────────────────

/**
 * Разрешить бой между двумя армейскими стеками.
 * @param {Object} atkArmy - атакующая армия
 * @param {Object} defArmy - обороняющаяся армия
 * @param {string} regionId - регион боя
 * @returns {Object} результат боя
 */
function resolveArmyBattle(atkArmy, defArmy, regionId) {
  const region    = _getRegionData(regionId);
  const terrain   = region?.terrain ?? 'plains';
  const atkNation = GAME_STATE.nations[atkArmy.nation];
  const defNation = GAME_STATE.nations[defArmy.nation];

  // ── Эффективная сила ─────────────────────────────────────────────
  const atkEff = calcArmyCombatStrength(atkArmy, terrain, false);
  const defEff = calcArmyCombatStrength(defArmy, terrain, true);

  // Технологии
  const atkTech  = (atkNation?.technology?.military ?? 0) * COMBAT.TECH_BONUS;
  const defTech  = (defNation?.technology?.military ?? 0) * COMBAT.TECH_BONUS;

  // ── Фаза 1: Скирмиш ──────────────────────────────────────────────
  const skirmish = _resolveSkirmish(atkArmy, defArmy, terrain);

  // ── Фаза 2: Ближний бой ──────────────────────────────────────────
  const atkRoll = atkEff * (1 + atkTech) * (0.70 + Math.random() * 0.60);
  const defRoll = defEff * (1 + defTech) * (0.70 + Math.random() * 0.60);
  const atkWins = atkRoll > defRoll;
  const margin  = atkWins ? atkRoll / defRoll : defRoll / atkRoll; // 1.0+

  // ── Потери ───────────────────────────────────────────────────────
  const atkLossRate = (atkWins ? 0.6 : 1.0) * COMBAT.MELEE_LOSS + skirmish.atkLoss;
  const defLossRate = (atkWins ? 1.0 : 0.6) * COMBAT.MELEE_LOSS + skirmish.defLoss;

  const atkTotal = _landTotal(atkArmy.units);
  const defTotal = _landTotal(defArmy.units);

  const atkCas = Math.round(atkTotal * atkLossRate);
  const defCas = Math.round(defTotal * defLossRate);

  _applyLoss(atkArmy, atkCas);
  _applyLoss(defArmy, defCas);

  // ── Фаза 3: Преследование ─────────────────────────────────────────
  let pursuitCas = 0;
  const loser    = atkWins ? defArmy : atkArmy;
  const winner   = atkWins ? atkArmy : defArmy;
  const loserMoraleAfter = loser.morale - (atkWins ? COMBAT.MORALE_LOSE : COMBAT.MORALE_DEF_LOSE);

  if (loserMoraleAfter < COMBAT.ROUT_THRESHOLD + 5 || margin > 1.5) {
    // Командир победителя усиливает преследование
    const cmd       = getArmyCommander(winner);
    const pursuitM  = 1 + _traitSum(cmd, 'pursuit');
    pursuitCas      = Math.round(_landTotal(loser.units) * COMBAT.PURSUIT_LOSS * pursuitM);
    _applyLoss(loser, pursuitCas);
  }

  // ── Мораль и дисциплина ──────────────────────────────────────────
  atkArmy.morale     = Math.max(0, Math.min(100, atkArmy.morale + (atkWins ? COMBAT.MORALE_WIN     : COMBAT.MORALE_LOSE)));
  defArmy.morale     = Math.max(0, Math.min(100, defArmy.morale + (atkWins ? COMBAT.MORALE_DEF_LOSE: COMBAT.MORALE_DEF_WIN)));
  atkArmy.discipline = Math.max(0, Math.min(100, atkArmy.discipline + (atkWins ? COMBAT.DISC_WIN  : COMBAT.DISC_LOSE)));
  defArmy.discipline = Math.max(0, Math.min(100, defArmy.discipline + (atkWins ? COMBAT.DISC_LOSE : COMBAT.DISC_WIN)));

  // ── Отступление разгромленного ───────────────────────────────────
  if (loser.morale <= COMBAT.ROUT_THRESHOLD) {
    loser.state = 'routing';
    _setRetreatPath(loser);
  } else {
    loser.state = 'routing'; // организованное отступление
    _setRetreatPath(loser);
  }

  // ── Захват региона ─────────────────────────────────────────────
  let capturedRegionId = null;
  const fortress       = region?.fortress_level ?? 0;

  if (atkWins) {
    if (fortress > 0) {
      if (typeof beginSiege === 'function')
        beginSiege(atkArmy, regionId, fortress, region?.garrison ?? 0);
    } else {
      capturedRegionId = regionId;
      if (typeof captureRegion === 'function')
        captureRegion(atkArmy.nation, regionId, defArmy.nation);
    }
  }

  // ── Статистика ───────────────────────────────────────────────────
  atkArmy.battles_won  += atkWins ? 1 : 0;
  atkArmy.battles_lost += atkWins ? 0 : 1;
  defArmy.battles_won  += atkWins ? 0 : 1;
  defArmy.battles_lost += atkWins ? 1 : 0;

  // XP командующим: победитель +10..25, проигравший +3..8 (за храбрость)
  _awardCommanderXP(atkWins ? atkArmy : defArmy, 10 + Math.round((defCas + atkCas) / 400));
  _awardCommanderXP(atkWins ? defArmy : atkArmy, 3  + Math.round((defCas + atkCas) / 800));

  const wsGain = Math.round(5 + (atkTotal + defTotal) / 500);
  if (atkWins) atkArmy.war_score_earned += wsGain + (capturedRegionId ? 10 : 0);
  else         defArmy.war_score_earned += wsGain;
  // Нация-уровневый war score (для мирных переговоров)
  if (typeof WarScoreEngine !== 'undefined') {
    if (atkWins) WarScoreEngine.onBattleResult(atkArmy.nation, defArmy.nation, defCas + pursuitCas, capturedRegionId);
    else         WarScoreEngine.onBattleResult(defArmy.nation, atkArmy.nation, atkCas, null);
  }

  // ── Дипломатия ───────────────────────────────────────────────────
  if (typeof DiplomacyEngine !== 'undefined') {
    const _rel = DiplomacyEngine.getRelation(atkArmy.nation, defArmy.nation);
    if (_rel) _rel.war = true;
  }

  // ── Синхронизировать потери в nation.military ───────────────────
  _syncArmyToNation(atkArmy);
  _syncArmyToNation(defArmy);

  // ── Лог ──────────────────────────────────────────────────────────
  const atkName = atkNation?.name ?? atkArmy.nation;
  const defName = defNation?.name ?? defArmy.nation;
  const winName = atkWins ? atkName : defName;
  const TERRAIN_LABELS = {
    plains: 'равнина', river_valley: 'долина', hills: 'холмы',
    mountains: 'горы', coastal_city: 'прибрежный город',
  };

  if (typeof addEventLog === 'function') {
    addEventLog(
      `⚔️ Сражение (${TERRAIN_LABELS[terrain] ?? terrain}): `
      + `${atkArmy.name} vs ${defArmy.name}. Победитель: ${winName}. `
      + `Потери: ${atkName} −${atkCas}, ${defName} −${defCas + pursuitCas}.`,
      'military'
    );
    if (capturedRegionId)
      addEventLog(`🏴 ${atkName} захватывает ${region?.name ?? regionId}!`, 'military');
  }

  // Записываем сражение в долгосрочную память обеих сторон
  if (typeof addMemoryEvent === 'function') {
    const battleText = `Сражение у ${region?.name ?? regionId} (${TERRAIN_LABELS[terrain] ?? terrain}): `
      + `${winName} победил. ${atkName} потери: ${atkCas}, ${defName} потери: ${defCas + pursuitCas}.`
      + (capturedRegionId ? ` Регион захвачен.` : '');
    addMemoryEvent(atkArmy.nation, 'military', battleText, [defArmy.nation]);
  }

  return {
    attackerWins: atkWins,
    winner:  atkWins ? atkArmy.nation : defArmy.nation,
    loser:   atkWins ? defArmy.nation : atkArmy.nation,
    atkCasualties: atkCas,
    defCasualties: defCas + pursuitCas,
    capturedRegionId,
    terrain,
    battleType: 'field',
    atkEffective: Math.round(atkEff),
    defEffective: Math.round(defEff),
    margin:       Math.round(margin * 100) / 100,
  };
}

// ── Расчёт боевой силы ────────────────────────────────────────────────

/**
 * Полный расчёт эффективной боевой силы армии.
 */
function calcArmyCombatStrength(army, terrain, isDefender) {
  const u        = army.units;
  const terrAtk  = isDefender ? 1.0 : (COMBAT.TERRAIN_ATK[terrain] ?? 1.0);
  const terrCav  = COMBAT.TERRAIN_CAV[terrain] ?? 1.0;

  // Базовая сила
  let base = (u.infantry    ?? 0) * 1.0
           + (u.cavalry     ?? 0) * 3.0 * terrCav
           + (u.mercenaries ?? 0) * 1.5
           + (u.artillery   ?? 0) * 0.5; // в поле слабее

  if (isDefender) base *= 1.20;      // бонус защитника
  base *= terrAtk;                   // местность

  // Мораль: 0→×0.25 … 100→×1.50
  const moraleMult = 0.25 + (army.morale / 100) * 1.25;

  // Паника
  if (army.morale < COMBAT.PANIC_THRESHOLD) base *= 0.80;

  // Дисциплина: 0→×0.70 … 100→×1.30
  const discMult = 0.70 + (army.discipline / 100) * 0.60;

  // Усталость: 0→×1.0 … 100→×0.60
  const fatMult = 1.0 - (army.fatigue / 100) * 0.40;

  // Формация
  const fmt       = COMBAT.FORMATIONS[army.formation ?? 'standard'];
  const fmtMult   = isDefender ? fmt.def : fmt.atk;
  const fmtCavMod = fmt.cav_bonus ?? 0;
  if (fmtCavMod !== 0) {
    // Корректируем вклад кавалерии
    base += (u.cavalry ?? 0) * 3.0 * terrCav * fmtCavMod;
  }

  // Командир
  const cmd     = getArmyCommander(army);
  let cmdMult   = 1.0;
  if (cmd) {
    const tactics = cmd.skills?.tactics ?? cmd.skills?.military ?? 0;
    cmdMult += tactics * 0.02;
    cmdMult += isDefender ? _traitSum(cmd, 'def') : _traitSum(cmd, 'atk');
    if ((cmd.traits_list ?? cmd.traits ?? []).includes('inspiring'))
      cmdMult += COMBAT.TRAITS.inspiring.morale;

    // Умения командира (commander_skills)
    const cSkills = cmd.commander_skills ?? [];
    if (!isDefender && cSkills.includes('fierce_aggressor')) cmdMult += 0.20;
    if (isDefender  && cSkills.includes('fierce_aggressor')) cmdMult -= 0.10;
    if (cSkills.includes('master_tactician'))  cmdMult += 0.15;
    if (isDefender && cSkills.includes('defensive_genius')) {
      const defTerrains = ['hills', 'mountains', 'coastal_city'];
      if (defTerrains.includes(terrain)) cmdMult += 0.25;
    }
    if (cSkills.includes('legendary')) cmdMult += 0.10;
  }

  // Умение cavalry_expert: +30% вклад кавалерии
  if (cmd && (cmd.commander_skills ?? []).includes('cavalry_expert')) {
    base += (u.cavalry ?? 0) * 3.0 * terrCav * 0.30;
  }

  // Структура: 20-50% конница = сбалансированная
  const total = _landTotal(u);
  let compMult = 1.0;
  if (total > 0) {
    const cr = (u.cavalry ?? 0) / total;
    if (cr >= 0.20 && cr <= 0.50) compMult = COMBAT.COMPOSITION_BONUS;
  }

  return Math.max(1,
    base * moraleMult * discMult * fatMult * fmtMult * cmdMult * compMult
  );
}

// ── Фазы боя ─────────────────────────────────────────────────────────

function _resolveSkirmish(atkArmy, defArmy, terrain) {
  // Кавалерия ведёт перестрелку перед боем на открытой местности
  const open = terrain === 'plains' || terrain === 'river_valley';
  const factor = open ? 1.0 : 0.4;

  const atkCav = (atkArmy.units.cavalry ?? 0) * (COMBAT.TERRAIN_CAV[terrain] ?? 1.0) * factor;
  const defCav = (defArmy.units.cavalry ?? 0) * factor;

  const atkLoss = defCav > atkCav ? COMBAT.SKIRMISH_LOSS : COMBAT.SKIRMISH_LOSS * 0.5;
  const defLoss = atkCav > defCav ? COMBAT.SKIRMISH_LOSS : COMBAT.SKIRMISH_LOSS * 0.5;

  return { atkLoss, defLoss };
}

// ── Применение потерь ─────────────────────────────────────────────────

function _applyLoss(army, total) {
  const u    = army.units;
  const cur  = _landTotal(u);
  if (cur === 0 || total <= 0) return;

  const rate = Math.min(0.95, total / cur);
  // Пехота: 60%, конница: 25%, наёмники: 15%
  u.infantry    = Math.max(0, Math.round(u.infantry    * (1 - rate * 0.60)));
  u.cavalry     = Math.max(0, Math.round(u.cavalry     * (1 - rate * 0.25)));
  u.mercenaries = Math.max(0, Math.round(u.mercenaries * (1 - rate * 0.15)));
}

// ── Синхронизация потерь с nation.military ───────────────────────────

function _syncArmyToNation(army) {
  const nat = GAME_STATE.nations[army.nation]?.military;
  if (!nat) return;

  // Суммируем все армии нации
  const total = getNationArmies(army.nation).reduce((acc, a) => {
    acc.infantry    += a.units.infantry    ?? 0;
    acc.cavalry     += a.units.cavalry     ?? 0;
    acc.mercenaries += a.units.mercenaries ?? 0;
    return acc;
  }, { infantry: 0, cavalry: 0, mercenaries: 0 });

  // Только уменьшаем (не увеличиваем из армий — резерв отдельно)
  nat.infantry    = Math.max(nat.infantry    ?? 0, total.infantry);
  nat.cavalry     = Math.max(nat.cavalry     ?? 0, total.cavalry);
  nat.mercenaries = Math.max(nat.mercenaries ?? 0, total.mercenaries);
  nat.morale      = Math.round(
    (getNationArmies(army.nation).reduce((s, a) => s + a.morale, 0) /
     Math.max(1, getNationArmies(army.nation).length))
  );
}

// ── Отступление ───────────────────────────────────────────────────────

function _setRetreatPath(army) {
  const ownRegions = Object.entries(GAME_STATE.regions ?? {})
    .filter(([, r]) => r.nation === army.nation).map(([id]) => id);
  if (ownRegions.length === 0) { army.state = 'disbanded'; return; }

  const region = _getRegionData(army.position);
  const adj    = (region?.connections ?? []).find(
    id => _getRegionData(id)?.nation === army.nation
  );

  if (adj) {
    army.path = [adj];
  } else {
    const path = typeof findArmyPath === 'function'
      ? findArmyPath(army.position, ownRegions[0], army.type)
      : null;
    if (path && path.length > 1) army.path = path.slice(1, 3);
    else army.state = 'disbanded';
  }
}

// ── Морской бой ───────────────────────────────────────────────────────

function resolveNavalArmyBattle(atkFleet, defFleet, regionId) {
  const region    = _getRegionData(regionId);
  const atkNation = GAME_STATE.nations[atkFleet.nation];
  const defNation = GAME_STATE.nations[defFleet.nation];

  const _shipStr = (fleet) => {
    const s = fleet.ships ?? {};
    const total = (s.triremes ?? 0) * 5 + (s.quinqueremes ?? 0) * 8 + (s.light_ships ?? 0) * 3;
    const cmd   = getArmyCommander(fleet);
    const nav   = 1 + (cmd?.skills?.navigation ?? 0) * 0.03 + _traitSum(cmd, 'naval');
    const mor   = 0.5 + (fleet.morale / 100);
    return total * nav * mor * (0.70 + Math.random() * 0.60);
  };

  const atkRoll = _shipStr(atkFleet);
  const defRoll = _shipStr(defFleet);
  const atkWins = atkRoll > defRoll;

  const lossRate = 0.10;
  const _applyNavalLoss = (fleet, rate) => {
    const s = fleet.ships;
    if (!s) return 0;
    let total = 0;
    for (const k of Object.keys(s)) {
      const loss = Math.round((s[k] ?? 0) * rate);
      s[k] = Math.max(0, (s[k] ?? 0) - loss);
      total += loss;
    }
    return total;
  };

  const atkShipLoss = _applyNavalLoss(atkFleet, atkWins ? lossRate * 0.6 : lossRate);
  const defShipLoss = _applyNavalLoss(defFleet, atkWins ? lossRate       : lossRate * 0.6);

  atkFleet.morale = Math.max(0, Math.min(100, atkFleet.morale + (atkWins ? 10 : -18)));
  defFleet.morale = Math.max(0, Math.min(100, defFleet.morale + (atkWins ? -18 : 10)));

  const loser = atkWins ? defFleet : atkFleet;
  loser.state = 'routing';
  _setRetreatPath(loser);

  if (typeof addEventLog === 'function') {
    const atkName = atkNation?.name ?? atkFleet.nation;
    const defName = defNation?.name ?? defFleet.nation;
    addEventLog(
      `⚓ Морское сражение: ${atkFleet.name} vs ${defFleet.name}. ` +
      `Победитель: ${atkWins ? atkName : defName}. ` +
      `Потери кораблей: ${atkName} −${atkShipLoss}, ${defName} −${defShipLoss}.`,
      'military'
    );
  }

  // War score за морской бой
  if (typeof WarScoreEngine !== 'undefined') {
    if (atkWins) WarScoreEngine.onNavalBattle(atkFleet.nation, defFleet.nation, defShipLoss);
    else         WarScoreEngine.onNavalBattle(defFleet.nation, atkFleet.nation, atkShipLoss);
  }

  return { attackerWins: atkWins, atkShipLoss, defShipLoss };
}

// ── Утилиты ───────────────────────────────────────────────────────────

function _landTotal(u) {
  return (u.infantry ?? 0) + (u.cavalry ?? 0) + (u.mercenaries ?? 0) + (u.artillery ?? 0);
}

function _getRegionData(regionId) {
  return GAME_STATE.regions?.[regionId]
    ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[regionId] : null);
}

/** Начисляет XP командующему армии и разблокирует новые умения при достижении порогов */
function _awardCommanderXP(army, xpGain) {
  if (!army?.commander_id) return;
  const nation = GAME_STATE.nations?.[army.nation];
  const char = (nation?.characters ?? []).find(c => c.id === army.commander_id);
  if (!char) return;
  const prevXp = char.commander_xp ?? 0;
  char.commander_xp = prevXp + xpGain;
  // Проверяем разблокировку умений на каждом пороге
  if (typeof COMMANDER_XP_LEVELS !== 'undefined' && typeof grantCommanderSkill === 'function') {
    for (const threshold of COMMANDER_XP_LEVELS) {
      if (threshold > 0 && prevXp < threshold && char.commander_xp >= threshold) {
        const newSkill = grantCommanderSkill(char);
        if (newSkill && typeof COMMANDER_SKILLS_DEF !== 'undefined') {
          const def = COMMANDER_SKILLS_DEF[newSkill];
          if (def && typeof addEventLog === 'function') {
            addEventLog(`${def.icon} ${char.name} получает умение «${def.name}»!`, 'character');
          }
        }
      }
    }
  }
}

/** Суммарный бонус черты командира по полю (atk/def/pursuit/naval) */
function _traitSum(cmd, field) {
  if (!cmd) return 0;
  const traits = cmd.traits_list ?? (typeof cmd.traits === 'object' ? Object.keys(cmd.traits) : []);
  return traits.reduce((sum, t) => {
    return sum + (COMBAT.TRAITS[t]?.[field] ?? 0);
  }, 0);
}
