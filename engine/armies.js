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

  // Снабжение (в ход) — базовые дельты до учёта ёмкости региона
  SUPPLY_HOME:      12,   // дома: ускоренное пополнение
  SUPPLY_FRIENDLY:   4,
  SUPPLY_NEUTRAL:   -5,
  SUPPLY_ENEMY:    -10,

  ATTRITION_RATE: 0.02, // 2%/ход при supply < 30

  // ── Ёмкость провианта по типу местности (макс. солдат без штрафа) ──
  // Превышение → расход провианта пропорционально перегрузке
  TERRAIN_SUPPLY_CAPACITY: {
    plains:       6000,   // широкие поля, лёгкий фуражир
    river_valley: 7000,   // вода и плодородие
    coastal_city: 9000,   // морской подвоз, рыба, торговля
    hills:        3500,   // пересечённая местность, мало еды
    mountains:    1500,   // почти нет ресурсов
    strait:       5000,   // узкий пролив, ограничен подвоз
    ocean:           0,   // нельзя стоять
  },

  // Бонус к ёмкости за порт в регионе
  PORT_CAPACITY_BONUS:    2500,
  MIL_PORT_CAPACITY_BONUS: 1000,

  // При перегрузке > 100% — дополнительный расход провианта за ход
  OVERCAP_SUPPLY_DRAIN: 15,   // за каждые 100% сверх нормы
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
  // Умение swift_marcher: +20% скорость
  const swiftBonus = (cmd?.commander_skills ?? []).includes('swift_marcher') ? 1.20 : 1.0;

  const region      = _getRegionData(army.position);
  const terrainCost = ARMY_MOVE.TERRAIN_COST[region?.terrain] ?? 1.0;

  return (base * logBonus * fatPen * swiftBonus) / terrainCost;
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

// ── Линия крепостей — блокировка прохода ─────────────────────────────
//
// Регион считается заблокированным для армии нации N если:
//   он имеет ≥2 соседних регионов с активными крепостями (fortress_level≥1,
//   garrison>0) принадлежащих нации M, с которой N находится в состоянии войны.
// Исключение: если целевой регион сам является крепостью (осада обязательна).

function _isFortressLineBlocked(regionId, movingNationId) {
  if (!movingNationId) return false;
  const region = _getRegionData(regionId);
  if (!region) return false;

  // Если в самом регионе есть крепость врага — это цель осады, не блокировка
  if ((region.fortress_level ?? 0) > 0 && region.nation !== movingNationId) return false;

  let hostileFortCount = 0;
  for (const adjId of (region.connections ?? [])) {
    const adj = _getRegionData(adjId);
    if (!adj) continue;
    if ((adj.fortress_level ?? 0) === 0) continue;       // нет крепости
    if ((adj.garrison ?? 0) <= 0) continue;              // пустая крепость не блокирует
    if (!adj.nation || adj.nation === movingNationId) continue; // своя или нейтральная
    if (!_armiesAtWar(movingNationId, adj.nation)) continue;    // не в войне
    hostileFortCount++;
    if (hostileFortCount >= 2) return true;
  }
  return false;
}

/**
 * Проверяет, находятся ли две нации в состоянии войны.
 * Проверяет оба источника: military.at_war_with И DiplomacyEngine/getRelation.
 * Это предотвращает рассинхронизацию между старыми сохранениями и новым кодом.
 */
function _armiesAtWar(nationA, nationB) {
  if (!nationA || !nationB || nationA === nationB) return false;
  const na = GAME_STATE.nations?.[nationA];
  const nb = GAME_STATE.nations?.[nationB];
  // Проверяем military.at_war_with (новый формат)
  if (na?.military?.at_war_with?.includes(nationB)) return true;
  if (nb?.military?.at_war_with?.includes(nationA)) return true;
  // Проверяем DiplomacyEngine (основной источник правды)
  if (typeof DiplomacyEngine !== 'undefined') {
    const rel = DiplomacyEngine.getRelation?.(nationA, nationB);
    if (rel?.war === true) return true;
  }
  // Проверяем устаревший формат nation.relations
  if (na?.relations?.[nationB]?.at_war === true) return true;
  if (nb?.relations?.[nationA]?.at_war === true) return true;
  return false;
}

// ── Поиск пути (BFS по connections) ─────────────────────────────────
//
// nationId — нация армии (опционально). Если передан, учитывается
// блокировка линиями крепостей.

function findArmyPath(fromId, toId, type = 'land', nationId = null) {
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

      // Блокировка линиями крепостей (только для наземных армий)
      if (type === 'land' && nationId && next !== toId) {
        if (_isFortressLineBlocked(next, nationId)) continue;
      }

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
  if (army.state === 'sieging')   return 'sieging';
  if (army.state === 'disbanded') return false;

  const path = findArmyPath(army.position, targetRegionId, army.type, army.nation);
  if (!path || path.length < 2) return false;

  army.target        = targetRegionId;
  army.path          = path.slice(1); // без текущей позиции
  army.move_progress = 0;
  army.state         = 'moving';

  return path;
}

// ── Обработка движения за ход ────────────────────────────────────────

/**
 * Тактический ИИ для армий с командиром но без активного приказа.
 * Командир действует автономно: анализирует обстановку и принимает решения.
 * Вызывается из turn.js после processAllOrders().
 */
function processCommanderAI() {
  if (typeof getCommanderDecisionNow !== 'function') return;

  const playerNation = GAME_STATE.player_nation;
  const armies = GAME_STATE.armies ?? [];

  for (const army of armies) {
    if (army.state === 'disbanded') continue;

    const isPlayer = army.nation === playerNation;

    if (isPlayer) {
      // ── Игрок: только армии с назначенным командиром (не правитель) ──
      if (!army.commander_id || army.commander_id === 'ruler') continue;

      // Пропускаем если уже управляется активным приказом
      const hasOrder = (GAME_STATE.orders ?? []).some(
        o => o.status === 'active' && o.army_id === army.id && o.type === 'military_campaign'
      );
      if (hasOrder) continue;
    } else {
      // ── AI нация: двигаем армию если ведём войну ────────────────────
      const nation = GAME_STATE.nations?.[army.nation];
      if (!nation || nation.is_eliminated) continue;

      const atWar = nation.military?.at_war_with ?? [];
      if (atWar.length === 0) continue; // не в войне — не двигаемся

      // Не трогаем осаждающие и бегущие армии
      if (army.state === 'sieging' || army.state === 'routing') continue;
    }

    // Создаём фиктивный "приказ" из текущей военной обстановки
    const enemiesAtWar = army.nation
      ? (GAME_STATE.nations?.[army.nation]?.military?.at_war_with ?? [])
      : [];
    const fakeOrder = {
      target_id:    enemiesAtWar[0] ?? null,
      target_label: enemiesAtWar[0]
        ? (GAME_STATE.nations?.[enemiesAtWar[0]]?.name ?? enemiesAtWar[0])
        : 'патрулировать территорию',
    };

    const decision = getCommanderDecisionNow(army, fakeOrder);
    if (decision) {
      if (typeof _applyCommanderDecision === 'function') _applyCommanderDecision(army, decision);
    }
  }
}

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

// Возвращает максимальную ёмкость провианта для региона (с учётом построек).
function _getRegionSupplyCapacity(region) {
  if (!region) return 0;
  const terrain = region.terrain ?? 'plains';
  let capacity = ARMY_MOVE.TERRAIN_SUPPLY_CAPACITY[terrain] ?? 3000;

  // Бонусы от построек порта
  const slots = region.building_slots ?? [];
  for (const slot of slots) {
    if (slot.status === 'paused' || !slot.building_id) continue;
    if (slot.building_id === 'port')          capacity += ARMY_MOVE.PORT_CAPACITY_BONUS     * (slot.level ?? 1);
    if (slot.building_id === 'military_port') capacity += ARMY_MOVE.MIL_PORT_CAPACITY_BONUS * (slot.level ?? 1);
  }
  return capacity;
}

// Суммарное число войск всех армий в регионе (исключая расформированные).
function _getTotalTroopsInRegion(regionId) {
  const armies = GAME_STATE.armies ?? [];
  let total = 0;
  for (const a of armies) {
    if (a.state === 'disbanded' || a.position !== regionId) continue;
    total += (a.units?.infantry    ?? 0)
           + (a.units?.cavalry     ?? 0)
           + (a.units?.mercenaries ?? 0)
           + (a.units?.artillery   ?? 0);
  }
  return total;
}

function _processSupply(army) {
  const region = _getRegionData(army.position);
  if (!region) return;

  const owner = region.nation;
  let delta;
  if (owner === army.nation)                                     delta = ARMY_MOVE.SUPPLY_HOME;
  else if (_isFriendlyTerritory(army.position, army.nation))    delta = ARMY_MOVE.SUPPLY_FRIENDLY;
  else if (owner === 'neutral' || owner === 'ocean')             delta = ARMY_MOVE.SUPPLY_NEUTRAL;
  else                                                           delta = ARMY_MOVE.SUPPLY_ENEMY;

  // Логистика командира снижает потери снабжения
  const cmd = getArmyCommander(army);
  const log = (cmd?.skills?.logistics ?? 0) * 0.5;
  if (delta < 0) delta = Math.min(0, delta + log);
  // Умение supply_master: -40% потерь снабжения
  if (delta < 0 && (cmd?.commander_skills ?? []).includes('supply_master'))
    delta = delta * 0.60;

  // ── Штраф за перегрузку региона ─────────────────────────────────────
  const capacity    = _getRegionSupplyCapacity(region);
  const totalTroops = _getTotalTroopsInRegion(army.position); // всегда считаем
  const overloadRatio = capacity > 0 ? totalTroops / capacity : (totalTroops > 0 ? Infinity : 0);

  if (capacity === 0 && totalTroops > 0) {
    // Непроходимый тип (океан) — максимальный штраф
    delta -= ARMY_MOVE.OVERCAP_SUPPLY_DRAIN * 5;
  } else if (overloadRatio > 1.0) {
    // Перегрузка: каждые 100% сверх нормы = -OVERCAP_SUPPLY_DRAIN за ход
    delta -= ARMY_MOVE.OVERCAP_SUPPLY_DRAIN * (overloadRatio - 1.0);
  } else if (overloadRatio > 0.8) {
    // Приближение к пределу: небольшой линейный штраф
    delta -= ARMY_MOVE.OVERCAP_SUPPLY_DRAIN * 0.3 * ((overloadRatio - 0.8) / 0.2);
  }

  // Сохраняем диагностику для UI
  army._supply_capacity     = capacity;
  army._supply_region_load  = totalTroops;
  army._supply_overload     = overloadRatio;

  army.supply = Math.max(0, Math.min(100, army.supply + delta));

  // Логистический предел: штраф за долгое нахождение вдали от дома
  if (typeof updateArmyLogisticTimer === 'function') updateArmyLogisticTimer(army);
  if (typeof calcLogisticPenalty === 'function') {
    const logPen = calcLogisticPenalty(army);
    if (logPen > 0) army.supply = Math.max(0, army.supply - logPen);
  }

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

  // Предупреждение о перегрузке для игрока
  if (army.nation === GAME_STATE.player_nation && overloadRatio > 1.2 && GAME_STATE.turn % 4 === 0) {
    if (typeof addEventLog === 'function') {
      const regionName = region.name ?? army.position;
      addEventLog(`⚠️ ${army.name}: перегрузка региона ${regionName} (${Math.round(overloadRatio * 100)}% от ёмкости). Потери снабжения ускорены.`, 'warning');
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
    const path = findArmyPath(army.position, ownRegions[0], army.type, army.nation);
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

  const prevNation = prevOwnerId ?? region.nation;

  // Если регион захватывается во время войны — помечаем оккупацию.
  // Визуально показывается штриховка цветом захватчика поверх цвета владельца.
  const duringWar = prevNation && prevNation !== captorId
    && typeof _armiesAtWar === 'function' && _armiesAtWar(captorId, prevNation);

  if (duringWar) {
    region.occupied_by      = captorId;
    region.original_nation  = prevNation;
  } else {
    // Мирный захват (нет войны) — сразу окончательный, без штриховки
    region.occupied_by     = null;
    region.original_nation = null;
  }

  region.nation         = captorId;
  region._conquest_turn = GAME_STATE.turn ?? 1;

  const captor = GAME_STATE.nations[captorId];
  const prev   = GAME_STATE.nations[prevNation];

  if (captor && !captor.is_player) {
    captor._expansion_this_window = (captor._expansion_this_window ?? 0) + 1;
  }

  if (captor?.regions && !captor.regions.includes(regionId)) captor.regions.push(regionId);
  if (prev?.regions) {
    const idx = prev.regions.indexOf(regionId);
    if (idx !== -1) prev.regions.splice(idx, 1);
  }

  if (typeof addEventLog === 'function')
    addEventLog(`🏴 ${captor?.name ?? captorId} захватывает ${region.name ?? regionId}!`, 'military');

  // Проверяем елиминацию: если у нации не осталось регионов — она уничтожена
  if (duringWar) checkNationElimination(prevNation, captorId);
}

/**
 * Проверяет, осталась ли нация без регионов.
 * Если да — помечает её как уничтоженную, завершает войну и очищает оккупацию.
 * @param {string} nationId - нация которая могла лишиться последнего региона
 * @param {string} [captorId] - захватчик (для очистки оккупационных маркеров)
 */
function checkNationElimination(nationId, captorId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation || nation.is_eliminated) return;

  // Считаем оставшиеся регионы
  const remaining = Object.values(GAME_STATE.regions ?? {}).filter(r => r.nation === nationId);
  if (remaining.length > 0) return;

  // Нация уничтожена
  nation.is_eliminated = true;
  nation.eliminated_turn = GAME_STATE.turn ?? 1;

  // Снимаем войну со ВСЕМИ нациями, а не только с captorId
  const warEnemies = [...(nation.military?.at_war_with ?? [])];
  if (nation.military?.at_war_with) nation.military.at_war_with = [];

  for (const enemyId of warEnemies) {
    const enemy = GAME_STATE.nations[enemyId];
    if (enemy?.military?.at_war_with) {
      enemy.military.at_war_with = enemy.military.at_war_with.filter(id => id !== nationId);
    }
    if (typeof getRelation === 'function') {
      const rel = getRelation(enemyId, nationId);
      if (rel) rel.war = false;
    }
    // Очищаем оккупационные метки на регионах этого врага
    for (const r of Object.values(GAME_STATE.regions ?? {})) {
      if (r.original_nation === nationId) {
        r.occupied_by     = null;
        r.original_nation = null;
      }
    }
  }

  // Если captorId не был в at_war_with (захват без явной войны) — всё равно чистим
  if (captorId && !warEnemies.includes(captorId)) {
    const captor = GAME_STATE.nations[captorId];
    if (captor?.military?.at_war_with) {
      captor.military.at_war_with = captor.military.at_war_with.filter(id => id !== nationId);
    }
    if (typeof getRelation === 'function') {
      const rel = getRelation(captorId, nationId);
      if (rel) rel.war = false;
    }
  }

  // Расформировываем армии уничтоженной нации
  for (const army of (GAME_STATE.armies ?? [])) {
    if (army.nation === nationId && army.state !== 'disbanded') {
      army.state = 'disbanded';
    }
  }

  if (typeof addEventLog === 'function') {
    const captorName = GAME_STATE.nations[captorId]?.name ?? captorId;
    addEventLog(
      `💀 ${nation.name} уничтожена! ${captorName} завоевал все её территории. `
      + `Нация исчезает с карты.`,
      'danger'
    );
  }
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

// ── Система уровней командующих ──────────────────────────────────────

const COMMANDER_XP_LEVELS = [0, 10, 40, 100, 250, 500]; // XP для звёзд 0-5

const COMMANDER_SKILLS_DEF = {
  siege_master:     { name: 'Мастер осады',      icon: '🏰', desc: '+25% скорость осады' },
  fierce_aggressor: { name: 'Неистовый агрессор', icon: '⚔️', desc: '+20% атака, −10% защита' },
  iron_discipline:  { name: 'Железная воля',      icon: '🛡', desc: 'Дисциплина ≥ 40 в бою' },
  swift_marcher:    { name: 'Быстрый марш',       icon: '🏃', desc: '+20% скорость движения' },
  defensive_genius: { name: 'Гений обороны',      icon: '🏔', desc: '+25% защита в горах/городах' },
  supply_master:    { name: 'Мастер снабжения',   icon: '📦', desc: '−40% потери снабжения' },
  master_tactician: { name: 'Тактик',             icon: '🎯', desc: '+15% боевая эффективность' },
  cavalry_expert:   { name: 'Мастер конницы',     icon: '🐴', desc: '+30% эффективность кавалерии' },
  legendary:        { name: 'Легендарный',        icon: '👑', desc: 'Все боевые бонусы +10%' },
};

function getCommanderLevel(char) {
  const xp = char?.commander_xp ?? 0;
  let level = 0;
  for (let i = COMMANDER_XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= COMMANDER_XP_LEVELS[i]) { level = i; break; }
  }
  return level;
}

function grantCommanderSkill(char) {
  if (!char) return;
  if (!char.commander_skills) char.commander_skills = [];
  const existing = new Set(char.commander_skills);
  const t = char.traits ?? {};
  // Кандидаты зависят от черт персонажа
  const candidates = [];
  if (!existing.has('siege_master')     && (t.caution    ?? 50) > 55) candidates.push('siege_master');
  if (!existing.has('fierce_aggressor') && (t.ambition   ?? 50) > 65) candidates.push('fierce_aggressor');
  if (!existing.has('iron_discipline')  && (t.loyalty    ?? 50) > 60) candidates.push('iron_discipline');
  if (!existing.has('swift_marcher'))                                  candidates.push('swift_marcher');
  if (!existing.has('defensive_genius') && (t.caution    ?? 50) > 50) candidates.push('defensive_genius');
  if (!existing.has('supply_master'))                                  candidates.push('supply_master');
  if (!existing.has('master_tactician'))                               candidates.push('master_tactician');
  if (!existing.has('cavalry_expert')   && (t.ambition   ?? 50) > 45) candidates.push('cavalry_expert');
  if (!existing.has('legendary') && (char.commander_xp ?? 0) >= 500)  candidates.push('legendary');
  if (!candidates.length) return;
  const skill = candidates[Math.floor(Math.random() * candidates.length)];
  char.commander_skills.push(skill);
  return skill; // возвращаем для лога
}

function _armyLandTotal(u) {
  return (u.infantry ?? 0) + (u.cavalry ?? 0) + (u.mercenaries ?? 0) + (u.artillery ?? 0);
}

function _getRegionData(regionId) {
  const gs = GAME_STATE.regions?.[regionId];
  const mr = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[regionId] : null;
  if (!gs) return mr ?? null;
  // GAME_STATE.regions хранит игровые данные но не geo-поля — дополняем из MAP_REGIONS
  if (mr) {
    if (!gs.connections || gs.connections.length === 0) gs.connections = mr.connections;
    if (!gs.mapType) gs.mapType = mr.mapType;
  }
  return gs;
}

// Предварительное заполнение geo-данных для всех игровых регионов.
// Вызывается после initGame/loadGame чтобы гарантировать наличие connections и mapType.
function initRegionGeoData() {
  if (typeof MAP_REGIONS === 'undefined') return;
  const regions = GAME_STATE.regions;
  if (!regions) return;
  for (const [rid, gs] of Object.entries(regions)) {
    const mr = MAP_REGIONS[rid];
    if (!mr) continue;
    if (!gs.connections || gs.connections.length === 0) gs.connections = mr.connections;
    if (!gs.mapType) gs.mapType = mr.mapType;
  }
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

// ──────────────────────────────────────────────────────────────────────────────
// РЕКРУТИНГ ИЗ ЗДАНИЙ (вызывается каждый ход из turn.js)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Обрабатывает производство воинских единиц из зданий:
 *   казармы    → infantry   (из крестьян)
 *   конюшни    → cavalry    (из крестьян, дороже)
 *   воен. порт → light_ships (из моряков)
 *
 * Шаги для каждого здания с recruit_output:
 *   1. Проверяет recruit_inputs — доступность ресурсов в stockpile.
 *      required:true  → без ресурса производство × 0.5 за каждый дефицит
 *      required:false → штраф −30% за каждый отсутствующий ресурс
 *   2. Вычитает пропорциональное кол-во ресурсов из stockpile.
 *   3. Ограничивает по населению (≤2% региона, мин. 500 после).
 *   4. Прибавляет к nation.military[unit_type].
 */
function processRecruitment() {
  const nationId  = GAME_STATE.player_nation;
  const nation    = GAME_STATE.nations[nationId];
  if (!nation) return;

  const stockpile = nation.economy?.stockpile ?? {};
  let   totalByType = {};

  for (const regionId of (nation.regions ?? [])) {
    const region = GAME_STATE.regions[regionId];
    if (!region) continue;

    for (const slot of (region.building_slots ?? [])) {
      if (slot.status !== 'active') continue;

      const bDef = typeof BUILDINGS !== 'undefined' ? BUILDINGS[slot.building_id] : null;
      const ro   = bDef?.recruit_output;
      if (!ro) continue;

      const level  = slot.level ?? 1;
      const wanted = level * ro.per_level_per_turn;

      // ── 1. Коэффициент ресурсного обеспечения ──────────────────────────
      let resourceRatio = 1.0;
      const inputs = bDef.recruit_inputs ?? [];
      const deficitGoods = [];

      for (const inp of inputs) {
        const needed    = inp.amount_per_level * level;
        const available = stockpile[inp.good] ?? 0;

        if (available < needed) {
          if (inp.required) {
            // Критический ресурс: пропорциональный штраф (вплоть до 0)
            resourceRatio *= available > 0 ? (available / needed) * 0.5 : 0.0;
          } else {
            // Вспомогательный: фиксированный штраф −30%
            resourceRatio *= 0.70;
          }
          deficitGoods.push(inp.good);
        }
      }

      // Если ресурсов совсем нет — пропускаем здание
      if (resourceRatio <= 0.01) {
        slot._recruited_last_turn = 0;
        slot._recruit_deficit     = deficitGoods;
        continue;
      }

      // ── 2. Ограничение по населению ────────────────────────────────────
      const pop       = region.population ?? 0;
      const maxDraw   = Math.max(0, Math.floor(pop * 0.02));
      const wantedAdj = Math.round(wanted * resourceRatio);
      const popNeeded = wantedAdj * ro.pop_cost_per_unit;
      const popCost   = Math.min(popNeeded, maxDraw);
      const actual    = Math.floor(popCost / ro.pop_cost_per_unit);

      if (actual <= 0 || pop - actual * ro.pop_cost_per_unit < 500) {
        slot._recruited_last_turn = 0;
        slot._recruit_deficit     = deficitGoods;
        continue;
      }

      // ── 3. Списываем ресурсы из stockpile ─────────────────────────────
      const ratio = actual / wanted;   // реальная доля от максимума
      for (const inp of inputs) {
        const consume = Math.floor(inp.amount_per_level * level * ratio);
        if (consume > 0 && stockpile[inp.good]) {
          stockpile[inp.good] = Math.max(0, (stockpile[inp.good] ?? 0) - consume);
        }
      }

      // ── 4. Списываем население и добавляем в резерв ────────────────────
      region.population = pop - actual * ro.pop_cost_per_unit;

      const ut = ro.unit_type;
      totalByType[ut] = (totalByType[ut] ?? 0) + actual;

      slot._recruited_last_turn = actual;
      slot._recruited_unit_type = ut;
      slot._recruit_deficit     = deficitGoods.length > 0 ? deficitGoods : null;
    }
  }

  // Зачисляем в резерв
  const mil = nation.military;
  for (const [ut, n] of Object.entries(totalByType)) {
    if (ut === 'light_ships') {
      mil.ships      = (mil.ships      ?? 0) + n;
      mil.light_ships = (mil.light_ships ?? 0) + n;
    } else {
      mil[ut] = (mil[ut] ?? 0) + n;
    }
  }

  // Уведомление при ненулевом рекрутинге
  if (Object.keys(totalByType).length > 0 && typeof addEventLog === 'function') {
    const parts = [];
    if (totalByType.infantry)    parts.push(`пехота +${totalByType.infantry}`);
    if (totalByType.cavalry)     parts.push(`конница +${totalByType.cavalry}`);
    if (totalByType.light_ships) parts.push(`корабли +${totalByType.light_ships}`);
    addEventLog(`🪖 Рекрутинг: ${parts.join(', ')}`, 'info');
  }
}
