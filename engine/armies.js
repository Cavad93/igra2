// ══════════════════════════════════════════════════════════════════════
// ARMIES ENGINE — армейские стеки на карте
//
// Структура армии:
//   { id, nation, type('land'|'naval'), name, position(regionId),
//     target, path[], move_progress,
//     units:{infantry,cavalry,mercenaries,artillery},
//     ships:{triremes,quinqueremes,light_ships},
//     morale, discipline, fatigue, supply,
//     commander_id, state, formation, siege_id, ... }
//
// 1 ход = 1 месяц. Скорость зависит от состава, местности, усталости.
// ══════════════════════════════════════════════════════════════════════

// ── Константы движения ───────────────────────────────────────────────

const ARMY_MOVE = {
  // Стоимость местности (ходов на регион)
  TERRAIN_COST: {
    plains:       1.0,
    river_valley: 1.2,
    hills:        1.6,
    coastal_city: 1.3,
    mountains:    2.5,
    ocean:        Infinity,
    strait:       1.5,
  },

  // Базовая скорость по составу (регионов/ход)
  SPEED_CAVALRY:  3.0,   // > 70% конница
  SPEED_MIXED:    2.0,   // 30-70% конница
  SPEED_INFANTRY: 1.0,   // < 30% конница
  SPEED_SIEGE:    0.5,   // есть осадные орудия

  // Скорость флота
  SHIP_SPEEDS: { triremes: 2.5, quinqueremes: 1.5, light_ships: 3.0 },

  // Усталость
  FATIGUE_MARCH:        12,   // за каждый пройденный регион
  FATIGUE_REST_FRIENDLY: -15, // за ход отдыха на дружественной территории
  FATIGUE_REST_ENEMY:    -5,  // за ход отдыха на вражеской

  // Снабжение (в ход)
  SUPPLY_HOME:      8,
  SUPPLY_FRIENDLY:  3,
  SUPPLY_NEUTRAL:  -5,
  SUPPLY_ENEMY:   -10,

  ATTRITION_RATE: 0.02, // 2%/ход при supply < 30
};

// ── Создание армии ───────────────────────────────────────────────────

/**
 * Создать армейский стек из резервов нации.
 * @param {string} nationId
 * @param {string} regionId - исходный регион
 * @param {Object} units - { infantry, cavalry, mercenaries, artillery }
 * @param {Object} opts  - { name, type, commander_id, morale, discipline }
 */
function createArmy(nationId, regionId, units, opts = {}) {
  if (!GAME_STATE.armies) GAME_STATE.armies = [];

  const nation = GAME_STATE.nations[nationId];
  const id = `army_${nationId}_${GAME_STATE.turn ?? 1}_${Math.floor(Math.random() * 9999)}`;

  const army = {
    id,
    nation:        nationId,
    type:          opts.type ?? 'land',
    name:          opts.name ?? `Армия ${nation?.name ?? nationId}`,
    position:      regionId,
    target:        null,
    path:          [],
    move_progress: 0,

    units: {
      infantry:    Math.max(0, units.infantry    ?? 0),
      cavalry:     Math.max(0, units.cavalry     ?? 0),
      mercenaries: Math.max(0, units.mercenaries ?? 0),
      artillery:   Math.max(0, units.artillery   ?? 0),
    },

    ships: opts.type === 'naval' ? {
      triremes:     Math.max(0, units.triremes     ?? 0),
      quinqueremes: Math.max(0, units.quinqueremes ?? 0),
      light_ships:  Math.max(0, units.light_ships  ?? 0),
    } : null,

    morale:      opts.morale      ?? (nation?.military?.morale ?? 65),
    discipline:  opts.discipline  ?? 45,
    fatigue:     0,
    supply:      100,

    commander_id: opts.commander_id ?? null,
    formation:    'standard',  // standard | aggressive | defensive | flanking
    state:        'stationed', // stationed | moving | sieging | resting | routing | disbanded | embarked

    siege_id:        null,
    war_score_earned: 0,
    battles_won:     0,
    battles_lost:    0,
    created_turn:    GAME_STATE.turn ?? 1,
  };

  GAME_STATE.armies.push(army);
  return army;
}

// ── Скорость движения ────────────────────────────────────────────────

function calcArmySpeed(army) {
  if (army.type === 'naval') return _calcFleetSpeed(army);

  const u     = army.units;
  const total = _armyLandTotal(u);
  if (total === 0) return 0;

  let base;
  if (u.artillery > 0) {
    base = ARMY_MOVE.SPEED_SIEGE;
  } else {
    const cavRatio = u.cavalry / total;
    base = cavRatio >= 0.70 ? ARMY_MOVE.SPEED_CAVALRY
         : cavRatio >= 0.30 ? ARMY_MOVE.SPEED_MIXED
         :                    ARMY_MOVE.SPEED_INFANTRY;
  }

  const cmd      = getArmyCommander(army);
  const logBonus = 1 + (cmd?.skills?.logistics ?? 0) * 0.05;
  const fatPen   = 1 - (army.fatigue / 200); // max −50%

  const region      = _getRegionData(army.position);
  const terrainCost = ARMY_MOVE.TERRAIN_COST[region?.terrain] ?? 1.0;

  return (base * logBonus * fatPen) / terrainCost;
}

function _calcFleetSpeed(army) {
  const s = army.ships;
  if (!s) return 0;

  let total = 0, weighted = 0;
  for (const [type, cnt] of Object.entries(s)) {
    if (cnt > 0) {
      weighted += (ARMY_MOVE.SHIP_SPEEDS[type] ?? 2.0) * cnt;
      total    += cnt;
    }
  }
  if (total === 0) return 0;

  const admiral     = getArmyCommander(army);
  const navBonus    = 1 + (admiral?.skills?.navigation ?? 0) * 0.03;
  const fatPen      = 1 - (army.fatigue / 200);
  return (weighted / total) * navBonus * fatPen;
}

// ── Поиск пути (BFS по connections) ─────────────────────────────────

function findArmyPath(fromId, toId, type = 'land') {
  if (fromId === toId) return [fromId];

  const visited = new Set([fromId]);
  const queue   = [[fromId, [fromId]]];

  while (queue.length > 0) {
    const [cur, path] = queue.shift();
    const reg         = _getRegionData(cur);
    if (!reg) continue;

    for (const next of (reg.connections ?? [])) {
      if (visited.has(next)) continue;
      const nr = _getRegionData(next);
      if (!nr) continue;

      // Проходимость по типу
      if (type === 'land'  && nr.mapType === 'Ocean') continue;
      if (type === 'naval' && nr.mapType === 'Land')  continue;

      visited.add(next);
      const newPath = [...path, next];
      if (next === toId) return newPath;
      queue.push([next, newPath]);
    }
  }
  return null;
}

// ── Отдать приказ о движении ─────────────────────────────────────────

function orderArmyMove(armyId, targetRegionId) {
  const army = getArmy(armyId);
  if (!army)                      return false;
  if (army.state === 'sieging')   return false;
  if (army.state === 'disbanded') return false;

  const path = findArmyPath(army.position, targetRegionId, army.type);
  if (!path || path.length < 2) return false;

  army.target        = targetRegionId;
  army.path          = path.slice(1); // без текущей позиции
  army.move_progress = 0;
  army.state         = 'moving';

  return path;
}

// ── Обработка движения за ход ────────────────────────────────────────

function processArmyMovement() {
  const armies = GAME_STATE.armies ?? [];

  for (const army of armies) {
    if (army.state === 'disbanded') continue;

    // Снабжение и атрошн
    _processSupply(army);

    // Маршрутизирующие войска отступают
    if (army.state === 'routing') {
      _processRout(army);
      continue;
    }

    // Усталость: восстановление когда стоит
    if (army.state !== 'moving') {
      const friendly = _isFriendlyTerritory(army.position, army.nation);
      army.fatigue = Math.max(0,
        army.fatigue + (friendly ? ARMY_MOVE.FATIGUE_REST_FRIENDLY : ARMY_MOVE.FATIGUE_REST_ENEMY)
      );
      continue;
    }

    if (army.path.length === 0) {
      army.state = 'stationed';
      continue;
    }

    // Движение
    const speed = calcArmySpeed(army);
    if (speed <= 0) continue;

    army.move_progress += speed;

    while (army.move_progress >= 1.0 && army.path.length > 0) {
      army.move_progress -= 1.0;
      const nextRegion    = army.path.shift();
      army.position       = nextRegion;
      army.fatigue        = Math.min(100, army.fatigue + ARMY_MOVE.FATIGUE_MARCH);

      _onArmyEnterRegion(army, nextRegion);
      if (army.state !== 'moving') break; // бой или осада остановили
    }

    if (army.path.length === 0 && army.state === 'moving') {
      army.state         = 'stationed';
      army.move_progress = 0;
      _checkSiegeOnArrival(army);
    }
  }

  // Обрабатываем осады
  if (typeof processSiegeTicks === 'function') processSiegeTicks();
}

// ── Внутренние методы ────────────────────────────────────────────────

function _onArmyEnterRegion(army, regionId) {
  const region = _getRegionData(regionId);
  if (!region) return;

  const owner = region.nation;
  if (!owner || owner === army.nation || owner === 'neutral' || owner === 'ocean') return;
  if (!_isAtWarWith(army.nation, owner)) return;

  // Проверяем вражеские армии в этом регионе
  const enemies = (GAME_STATE.armies ?? []).filter(
    a => a.nation === owner && a.position === regionId && a.state !== 'disbanded'
  );

  if (enemies.length > 0) {
    if (typeof resolveArmyBattle === 'function') {
      resolveArmyBattle(army, enemies[0], regionId);
    }
  }
}

function _checkSiegeOnArrival(army) {
  const region = _getRegionData(army.position);
  if (!region) return;

  const owner = region.nation;
  if (!owner || owner === army.nation || owner === 'neutral' || owner === 'ocean') return;
  if (!_isAtWarWith(army.nation, owner)) return;

  const defArmies = (GAME_STATE.armies ?? []).filter(
    a => a.nation === owner && a.position === army.position && a.state !== 'disbanded'
  );
  if (defArmies.length > 0) return; // есть защитники — сначала полевой бой

  const fortressLevel = region.fortress_level ?? 0;
  if (fortressLevel > 0) {
    if (typeof beginSiege === 'function') {
      beginSiege(army, army.position, fortressLevel, region.garrison ?? 0);
    }
  } else {
    captureRegion(army.nation, army.position, owner);
  }
}

function _processSupply(army) {
  const region = _getRegionData(army.position);
  if (!region) return;

  const owner = region.nation;
  let delta;
  if (owner === army.nation)                         delta = ARMY_MOVE.SUPPLY_HOME;
  else if (_isFriendlyTerritory(army.position, army.nation)) delta = ARMY_MOVE.SUPPLY_FRIENDLY;
  else if (owner === 'neutral' || owner === 'ocean') delta = ARMY_MOVE.SUPPLY_NEUTRAL;
  else                                               delta = ARMY_MOVE.SUPPLY_ENEMY;

  // Логистика командира снижает потери снабжения
  const cmd   = getArmyCommander(army);
  const log   = (cmd?.skills?.logistics ?? 0) * 0.5;
  if (delta < 0) delta = Math.min(0, delta + log);

  army.supply = Math.max(0, Math.min(100, army.supply + delta));

  if (army.supply < 30) {
    const rate = ARMY_MOVE.ATTRITION_RATE * (1 - army.supply / 30);
    army.units.infantry    = Math.max(0, Math.round(army.units.infantry    * (1 - rate * 0.6)));
    army.units.cavalry     = Math.max(0, Math.round(army.units.cavalry     * (1 - rate * 0.3)));
    army.units.mercenaries = Math.max(0, Math.round(army.units.mercenaries * (1 - rate * 0.6)));

    if (army.nation === GAME_STATE.player_nation && army.supply < 10 && GAME_STATE.turn % 3 === 0) {
      if (typeof addEventLog === 'function')
        addEventLog(`⚠️ ${army.name}: критическая нехватка снабжения! Потери от истощения.`, 'warning');
    }
  }
}

function _processRout(army) {
  if (army.path.length > 0) {
    army.position = army.path.shift();
    if (army.path.length === 0) army.state = 'stationed';
    return;
  }

  const ownRegions = _getOwnRegions(army.nation);
  if (ownRegions.length === 0) { army.state = 'disbanded'; return; }

  const region  = _getRegionData(army.position);
  const adj     = (region?.connections ?? []).find(id => _getRegionData(id)?.nation === army.nation);
  if (adj) {
    army.position = adj;
    army.state    = 'stationed';
    army.fatigue  = Math.min(100, army.fatigue + 20);
  } else {
    const path = findArmyPath(army.position, ownRegions[0], army.type);
    if (path && path.length > 1) {
      army.position = path[1];
      army.path     = path.slice(2, 4); // следующие 2 шага
    } else {
      army.state = 'disbanded';
      if (typeof addEventLog === 'function')
        addEventLog(`💀 ${army.name} окружена и капитулировала!`, 'danger');
    }
  }
}

// ── Слияние и разделение ─────────────────────────────────────────────

function mergeArmies(armyId1, armyId2) {
  const a1 = getArmy(armyId1);
  const a2 = getArmy(armyId2);
  if (!a1 || !a2 || a1.nation !== a2.nation || a1.position !== a2.position) return null;

  const t1 = _armyLandTotal(a1.units);
  const t2 = _armyLandTotal(a2.units);
  const tt = t1 + t2 || 1;

  // Взвешенное среднее морали/дисциплины
  a1.morale     = Math.round((a1.morale     * t1 + a2.morale     * t2) / tt);
  a1.discipline = Math.round((a1.discipline * t1 + a2.discipline * t2) / tt);
  a1.fatigue    = Math.round((a1.fatigue    * t1 + a2.fatigue    * t2) / tt);
  a1.supply     = Math.round((a1.supply     * t1 + a2.supply     * t2) / tt);

  for (const k of ['infantry', 'cavalry', 'mercenaries', 'artillery']) {
    a1.units[k] = (a1.units[k] ?? 0) + (a2.units[k] ?? 0);
  }

  a1.battles_won  += a2.battles_won;
  a1.battles_lost += a2.battles_lost;
  a2.state = 'disbanded';
  return a1;
}

function splitArmy(armyId, splitUnits) {
  const army = getArmy(armyId);
  if (!army) return null;

  for (const [type, cnt] of Object.entries(splitUnits)) {
    if ((army.units[type] ?? 0) < cnt) return null;
  }
  for (const [type, cnt] of Object.entries(splitUnits)) {
    army.units[type] -= cnt;
  }
  return createArmy(army.nation, army.position, splitUnits, {
    morale:     army.morale,
    discipline: army.discipline,
    type:       army.type,
    name:       army.name + ' II',
  });
}

// ── Захват региона ────────────────────────────────────────────────────

function captureRegion(captorId, regionId, prevOwnerId) {
  const region   = GAME_STATE.regions?.[regionId];
  if (!region) return;

  region.nation = captorId;

  const captor   = GAME_STATE.nations[captorId];
  const prev     = GAME_STATE.nations[prevOwnerId];

  if (captor?.regions && !captor.regions.includes(regionId)) captor.regions.push(regionId);
  if (prev?.regions) {
    const idx = prev.regions.indexOf(regionId);
    if (idx !== -1) prev.regions.splice(idx, 1);
  }

  if (typeof addEventLog === 'function')
    addEventLog(`🏴 ${captor?.name ?? captorId} захватывает ${region.name ?? regionId}!`, 'military');
}

// ── Вспомогательные геттеры ───────────────────────────────────────────

function getArmy(id) {
  return (GAME_STATE.armies ?? []).find(a => a.id === id) ?? null;
}

function getNationArmies(nationId) {
  return (GAME_STATE.armies ?? []).filter(a => a.nation === nationId && a.state !== 'disbanded');
}

/** Командир армии (персонаж нации) */
function getArmyCommander(army) {
  if (!army?.commander_id) return null;
  const nation = GAME_STATE.nations?.[army.nation];
  return (nation?.characters ?? []).find(c => c.id === army.commander_id) ?? null;
}

function _armyLandTotal(u) {
  return (u.infantry ?? 0) + (u.cavalry ?? 0) + (u.mercenaries ?? 0) + (u.artillery ?? 0);
}

function _getRegionData(regionId) {
  return GAME_STATE.regions?.[regionId] ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[regionId] : null);
}

function _getOwnRegions(nationId) {
  return Object.entries(GAME_STATE.regions ?? {})
    .filter(([, r]) => r.nation === nationId)
    .map(([id]) => id);
}

function _isFriendlyTerritory(regionId, nationId) {
  const region = _getRegionData(regionId);
  if (!region) return false;
  if (region.nation === nationId) return true;
  if (typeof DiplomacyEngine !== 'undefined') {
    return DiplomacyEngine.getRelationScore(nationId, region.nation) >= 30;
  }
  return false;
}

function _isAtWarWith(a, b) {
  if (typeof DiplomacyEngine !== 'undefined') {
    return DiplomacyEngine.getRelation(a, b)?.war === true;
  }
  return GAME_STATE.nations[a]?.relations?.[b]?.at_war === true;
}

/** Общее кол-во войск всех армий нации (для совместимости с существующей системой) */
function getArmyTotalUnits(nationId) {
  return getNationArmies(nationId).reduce((acc, a) => ({
    infantry:    acc.infantry    + (a.units.infantry    ?? 0),
    cavalry:     acc.cavalry     + (a.units.cavalry     ?? 0),
    mercenaries: acc.mercenaries + (a.units.mercenaries ?? 0),
  }), { infantry: 0, cavalry: 0, mercenaries: 0 });
}

/** Взять войска из резерва нации в армию */
function recruitToArmy(armyId, addUnits) {
  const army   = getArmy(armyId);
  const nation = army ? GAME_STATE.nations[army.nation] : null;
  if (!army || !nation) return false;

  for (const [type, count] of Object.entries(addUnits)) {
    const available = nation.military?.[type] ?? 0;
    const take      = Math.min(count, available);
    if (take <= 0) continue;
    army.units[type]         = (army.units[type] ?? 0) + take;
    nation.military[type]    = available - take;
  }
  return true;
}
