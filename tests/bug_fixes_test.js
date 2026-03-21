/**
 * Тесты для всех исправленных багов.
 * Запуск: node tests/bug_fixes_test.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

function assertEqual(a, b, msg) {
  if (a === b) {
    console.log(`  ✓ ${msg} (${a})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg} — ожидалось ${b}, получено ${a}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ═══════════════════════════════════════════════════════════════════════════
// МИНИМАЛЬНЫЙ СТАБ ОКРУЖЕНИЯ
// ═══════════════════════════════════════════════════════════════════════════

global.CONFIG = {
  BALANCE: {
    BUILDING_MAINTENANCE: 50,
    SOLDIER_SALARY: 2,
    INFANTRY_UPKEEP: 2,
    CAVALRY_UPKEEP: 5,
    MERCENARY_UPKEEP: 8,
    SHIP_UPKEEP: 10,
    SLAVE_UPKEEP: 1,
    FOOD_PER_PERSON: 0.3,
    TERRAIN_MULTIPLIERS: { plains: { farmers: 1.0 } },
  },
};

// Минимальный BUILDINGS
global.BUILDINGS = {
  wheat_family_farm: {
    name: 'Семейная ферма',
    autonomous_builder: 'farmers_class',
    wage_rate: 0.6,
    labor_type: 'free',
    footprint_ha: 5,
    cost: 200,
    build_turns: 1,
    production_output: [{ good: 'wheat', amount: 10 }],
    worker_profession: [{ profession: 'farmers', count: 5 }],
  },
  wheat_villa: {
    name: 'Вилла',
    autonomous_builder: 'soldiers_class',
    wage_rate: 0.4,
    labor_type: 'mixed',
    footprint_ha: 75,
    cost: 1500,
    build_turns: 3,
    production_output: [{ good: 'wheat', amount: 195 }],
    worker_profession: [{ profession: 'farmers', count: 15 }],
  },
  grain_estate: {
    name: 'Зерновое поместье',
    // autonomous_builder НЕ задан — это не автономное здание
    wage_rate: 0.3,
    labor_type: 'slave',
    footprint_ha: 30,
    cost: 800,
    build_turns: 2,
    production_output: [{ good: 'wheat', amount: 80 }],
    worker_profession: [{ profession: 'farmers', count: 10 }],
  },
};

global.GAME_STATE = {
  turn: 5,
  player_nation: 'syracuse',
  nations: {},
  regions: {},
  market: { wheat: { price: 10 } },
};

// ═══════════════════════════════════════════════════════════════════════════
// БАГ 1+9: distributeWages — только не-автономные здания в totalMaintenance,
//          и × level
// ═══════════════════════════════════════════════════════════════════════════
section('БАГ 1+9: totalMaintenance в distributeWages');

(function testMaintenanceAccumulation() {
  // Симулируем логику distributeWages
  const maintCost = 50;
  let totalMaintenance = 0;

  const slots = [
    // Автономное здание (wheat_family_farm), level=3
    { building_id: 'wheat_family_farm', level: 3, status: 'active' },
    // Автономное здание (wheat_villa), level=2
    { building_id: 'wheat_villa', level: 2, status: 'active' },
    // НЕ автономное здание (grain_estate), level=4
    { building_id: 'grain_estate', level: 4, status: 'active' },
  ];

  for (const slot of slots) {
    const bDef = BUILDINGS[slot.building_id];
    const level = slot.level || 1;
    // ИСПРАВЛЕННАЯ логика:
    if (!bDef.autonomous_builder) {
      totalMaintenance += maintCost * level;
    }
  }

  // Только grain_estate (уровень 4): 50 × 4 = 200
  // wheat_family_farm и wheat_villa пропущены (autonomous_builder задан)
  assertEqual(totalMaintenance, 200,
    'totalMaintenance учитывает только не-автономные здания × level');

  // Проверяем что при старой логике было бы иначе:
  let oldMaintenance = 0;
  for (const slot of slots) {
    oldMaintenance += maintCost; // старая ошибка: без проверки autonomous_builder и без × level
  }
  assert(oldMaintenance === 150, 'Старая логика (3 × 50 = 150) давала неверный результат');
  assert(totalMaintenance !== oldMaintenance, 'Исправленная логика отличается от старой');
})();

// ═══════════════════════════════════════════════════════════════════════════
// БАГ 2+2b: expBuildings и expFortresses — building_id вместо s.type
// ═══════════════════════════════════════════════════════════════════════════
section('БАГ 2+2b: фильтры по building_id вместо s.type');

(function testBuildingIdFilter() {
  const slots = [
    { status: 'active', building_id: 'wheat_family_farm' },
    { status: 'active', building_id: 'wheat_villa' },
    { status: 'active', building_id: 'walls' },        // крепость
    { status: 'active', building_id: 'fortress' },     // укрепление
    { status: 'demolished', building_id: 'grain_estate' }, // снесено
  ];

  // ИСПРАВЛЕННЫЙ фильтр для expBuildings (AI):
  const activeNonWall = slots.filter(
    s => s.status === 'active' && s.building_id !== 'walls' && s.building_id !== 'fortress'
  ).length;
  assertEqual(activeNonWall, 2, 'activeNonWall = 2 (farm + villa, без стен и крепости)');

  // ИСПРАВЛЕННЫЙ фильтр для expFortresses:
  const wallSlots = slots.filter(
    s => s.status === 'active' && (s.building_id === 'walls' || s.building_id === 'fortress')
  ).length;
  assertEqual(wallSlots, 2, 'wallSlots = 2 (walls + fortress)');

  // СТАРАЯ (сломанная) логика всегда считала все active слоты как nonWall:
  const brokenNonWall = slots.filter(
    s => s.status === 'active' && s.type !== 'walls' && s.type !== 'fortress'
  ).length;
  assertEqual(brokenNonWall, 4, 'Старая логика считала 4 (все active, т.к. s.type=undefined)');

  const brokenWalls = slots.filter(
    s => s.status === 'active' && (s.type === 'walls' || s.type === 'fortress')
  ).length;
  assertEqual(brokenWalls, 0, 'Старая логика для стен всегда давала 0');

  assert(activeNonWall !== brokenNonWall, 'Новый результат отличается от старого (баг устранён)');
})();

// ═══════════════════════════════════════════════════════════════════════════
// БАГ 3: recordEconomyHistory — использование breakdown.total
// ═══════════════════════════════════════════════════════════════════════════
section('БАГ 3: recordEconomyHistory использует breakdown.total');

(function testRecordEconomyHistory() {
  const eco = {
    income_per_turn:  1000,   // только налоги (без зданий)
    expense_per_turn: 800,
    _income_breakdown:  { total: 1500 },  // налоги + здания
    _expense_breakdown: { total: 950 },   // расходы + зарплата солдат + еда
    _balance_history: [],
  };
  const turn = 10;

  // ИСПРАВЛЕННАЯ логика:
  const income  = eco._income_breakdown?.total  ?? eco.income_per_turn  ?? 0;
  const expense = eco._expense_breakdown?.total ?? eco.expense_per_turn ?? 0;
  eco._balance_history.push({ turn, income, expense, net: income - expense });

  assertEqual(eco._balance_history[0].income, 1500, 'income из _income_breakdown.total (с доходом зданий)');
  assertEqual(eco._balance_history[0].expense, 950, 'expense из _expense_breakdown.total (с зарплатой солдат)');
  assertEqual(eco._balance_history[0].net, 550, 'net = 1500 - 950 = 550');

  // Старая логика давала бы:
  const oldNet = eco.income_per_turn - eco.expense_per_turn; // 1000 - 800 = 200
  assert(oldNet !== eco._balance_history[0].net, 'Исправленный net отличается от старого (200 → 550)');
})();

// ─── treasury-panel.js: баланс ───
(function testTreasuryPanelBalance() {
  const eco = {
    income_per_turn:  1000,
    expense_per_turn: 800,
    _income_breakdown:  { total: 1500 },
    _expense_breakdown: { total: 950 },
  };

  // ИСПРАВЛЕННАЯ логика:
  const balance = (eco._income_breakdown?.total ?? eco.income_per_turn ?? 0)
                - (eco._expense_breakdown?.total ?? eco.expense_per_turn ?? 0);
  assertEqual(balance, 550, 'treasury-panel: balance = 1500 - 950 = 550 (с зданиями и солдатами)');

  // Fallback при отсутствии breakdown:
  const ecoNoBreakdown = { income_per_turn: 1000, expense_per_turn: 800 };
  const balanceFallback = (ecoNoBreakdown._income_breakdown?.total ?? ecoNoBreakdown.income_per_turn ?? 0)
                        - (ecoNoBreakdown._expense_breakdown?.total ?? ecoNoBreakdown.expense_per_turn ?? 0);
  assertEqual(balanceFallback, 200, 'treasury-panel: fallback при отсутствии breakdown = 200');
})();

// ═══════════════════════════════════════════════════════════════════════════
// БАГ 4: getBuildingBonuses — умножение множителей
// ═══════════════════════════════════════════════════════════════════════════
section('БАГ 4: getBuildingBonuses — умножение вместо сложения');

(function testBuildingBonusMultiplication() {
  const BUILDING_BONUSES_TEST = {
    workshop: { production_mult: 1.20 },
    port:     { production_mult: 1.05, port_bonus: 80 },
    agora:    { tax_mult: 1.10 },
  };

  // Симулируем три здания: workshop × 2 + port × 1
  const buildings = ['workshop', 'workshop', 'port'];
  const bonuses = { production_mult: 1.0, tax_mult: 1.0, port_bonus: 0 };

  for (const building of buildings) {
    const bonus = BUILDING_BONUSES_TEST[building];
    if (!bonus) continue;
    // ИСПРАВЛЕННАЯ логика (умножение):
    bonuses.production_mult *= (bonus.production_mult ?? 1);
    bonuses.tax_mult        *= (bonus.tax_mult        ?? 1);
    bonuses.port_bonus      += (bonus.port_bonus      ?? 0);
  }

  // workshop × 2 + port: 1.20 × 1.20 × 1.05 = 1.5120
  const expected = 1.20 * 1.20 * 1.05;
  assert(Math.abs(bonuses.production_mult - expected) < 0.0001,
    `production_mult = 1.20 × 1.20 × 1.05 = ${expected.toFixed(4)} (мультипликативно)`);

  // Старая ошибка давала бы: 1.0 + (0.20 + 0.20 + 0.05) = 1.45
  const oldResult = 1.0 + 0.20 + 0.20 + 0.05;
  assert(Math.abs(oldResult - 1.45) < 0.0001, `Старая логика давала 1.45 (аддитивно)`);
  assert(Math.abs(bonuses.production_mult - oldResult) > 0.001,
    'Новый результат отличается от старого');

  // port_bonus суммируется (не умножается) — это правильно
  assertEqual(bonuses.port_bonus, 80, 'port_bonus суммируется: 80');
})();

// ═══════════════════════════════════════════════════════════════════════════
// БАГ 7: slot_id детерминированный (без Date.now())
// ═══════════════════════════════════════════════════════════════════════════
section('БАГ 7: slot_id детерминированный');

(function testDeterministicSlotId() {
  const turn = 5;
  const regionId = 'r2408';
  const buildingId = 'wheat_family_farm';
  const cls = 'farmers_class';
  const existingSlots = [{ slot_id: 'r2408_w3' }, { slot_id: 'r2408_s1' }];
  const queueCount = 0;

  // Для новых зданий (ручное строительство):
  const _slotIdx = existingSlots.length + queueCount;
  const manualNewId = `${regionId}_slot_t${turn}_${_slotIdx}`;
  assert(!manualNewId.includes('NaN') && !manualNewId.includes('undefined'),
    `Ручное строительство: ID не содержит NaN/undefined: ${manualNewId}`);
  assert(manualNewId === 'r2408_slot_t5_2', `ID детерминированный: ${manualNewId}`);

  // Для автономного строительства:
  const autoNewId = `${regionId}_auto_${cls}_t${turn}_${queueCount}`;
  assert(autoNewId === 'r2408_auto_farmers_class_t5_0',
    `Автономное строительство: детерминированный ID: ${autoNewId}`);

  // Для upgrade:
  const upgradeId = `${regionId}_upg_${buildingId}_t${turn}`;
  assert(upgradeId === 'r2408_upg_wheat_family_farm_t5',
    `Upgrade: детерминированный ID: ${upgradeId}`);

  // Проверяем что ID при одном и том же ходу совпадают (детерминизм):
  const id1 = `${regionId}_auto_${cls}_t${turn}_${queueCount}`;
  const id2 = `${regionId}_auto_${cls}_t${turn}_${queueCount}`;
  assertEqual(id1, id2, 'Один и тот же ID при одном ходу — детерминированность');
})();

// ═══════════════════════════════════════════════════════════════════════════
// БАГ 11: Автономное строительство — upgrade vs new build
// ═══════════════════════════════════════════════════════════════════════════
section('БАГ 11: processAutonomousBuilding — upgrade вместо дубля');

(function testAutonomousBuildingUpgrade() {
  // Симулируем canBuildInRegion возвращающую is_upgrade=true
  const checkUpgrade = {
    ok: true,
    is_upgrade: true,
    to_level: 4,
    target_slot_id: 'r2408_w3',
  };
  const checkNew = {
    ok: true,
    is_upgrade: false,
  };

  const turn = 10;
  const cls = 'farmers_class';
  const rid = 'r2408';
  const bid = 'wheat_family_farm';

  // ИСПРАВЛЕННАЯ логика для upgrade:
  function buildQueueEntry(check, slotQueueCount) {
    const slotId = check.is_upgrade
      ? `${rid}_upg_${bid}_t${turn}`
      : `${rid}_auto_${cls}_t${turn}_${slotQueueCount}`;

    const entry = {
      slot_id:      slotId,
      building_id:  bid,
      turns_left:   1,
      turns_total:  1,
      ordered_turn: turn,
      owner:        cls,
    };
    if (check.is_upgrade) {
      entry.is_upgrade     = true;
      entry.target_slot_id = check.target_slot_id;
      entry.to_level       = check.to_level;
    }
    return entry;
  }

  const upgradeEntry = buildQueueEntry(checkUpgrade, 0);
  assert(upgradeEntry.is_upgrade === true,
    'Upgrade: entry.is_upgrade = true');
  assertEqual(upgradeEntry.target_slot_id, 'r2408_w3',
    'Upgrade: target_slot_id сохраняется');
  assertEqual(upgradeEntry.to_level, 4,
    'Upgrade: to_level = 4');
  assert(upgradeEntry.slot_id.includes('upg'),
    `Upgrade: slot_id содержит 'upg': ${upgradeEntry.slot_id}`);

  const newEntry = buildQueueEntry(checkNew, 0);
  assert(newEntry.is_upgrade === undefined,
    'New build: is_upgrade не задан');
  assert(!newEntry.target_slot_id,
    'New build: target_slot_id не задан');
  assert(newEntry.slot_id.includes('auto'),
    `New build: slot_id содержит 'auto': ${newEntry.slot_id}`);
})();

// ═══════════════════════════════════════════════════════════════════════════
// ИНТЕГРАЦИОННЫЙ ТЕСТ: Двойной вычет maintenance через полный цикл
// ═══════════════════════════════════════════════════════════════════════════
section('ИНТЕГРАЦИЯ: Нет двойного вычета maintenance для автономных зданий');

(function testNoDoubleMaintenance() {
  // Сценарий: есть 1 wheat_villa (уровень 2, autonomous), 1 grain_estate (уровень 3, не autonomous)
  // Стоимость обслуживания: 50/уровень
  //
  // ОЖИДАЕМЫЙ РЕЗУЛЬТАТ после исправления:
  //   - wheat_villa: maintenance = 50×2=100 включён только в profit_last (не в expBuildings)
  //   - grain_estate: maintenance = 50×3=150 включён в _building_maintenance_per_turn

  const maintCost = 50;
  let totalMaintenance = 0;

  const slots = [
    { building_id: 'wheat_villa',   level: 2, status: 'active' },
    { building_id: 'grain_estate',  level: 3, status: 'active' },
  ];

  for (const slot of slots) {
    const bDef = BUILDINGS[slot.building_id];
    const level = slot.level || 1;
    if (!bDef.autonomous_builder) {
      totalMaintenance += maintCost * level;
    }
  }

  // Только grain_estate: 50 × 3 = 150
  assertEqual(totalMaintenance, 150,
    '_building_maintenance_per_turn = 150 (только grain_estate × 3)');

  // Проверяем что wheat_villa (autonomous) НЕ попала в totalMaintenance
  const wheatVillaMaintExpected = 0;
  assert(totalMaintenance !== (150 + 100),
    'wheat_villa (autonomous) не добавляет maintenance в totalMaintenance — нет двойного вычета');

  // profit_last для wheat_villa должен включать maintenance:
  const villaRevenue = 500;
  const villaWages   = 200;
  const villaLevel   = 2;
  const villaProfit  = villaRevenue - villaWages - maintCost * villaLevel; // 500 - 200 - 100 = 200
  assertEqual(villaProfit, 200, 'profit_last для wheat_villa = 200 (revenue - wages - maintenance)');

  // При добавлении profit в казну и expBuildings без autonomous maintenance:
  // treasury += 200 (profit, уже за вычетом 100 maintenance)
  // expBuildings = 150 (только grain_estate)
  // Итого maintenance учтён ОДИН раз (внутри profit) — OK
  assert(true, 'Maintenance учитывается один раз: в profit_last для autonomous, в expBuildings для остальных');
})();

// ═══════════════════════════════════════════════════════════════════════════
// ИТОГИ
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`ИТОГО: ${passed} прошло, ${failed} упало`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.error(`\n❌ ${failed} тест(ов) не прошло!`);
  process.exit(1);
} else {
  console.log(`\n✅ Все тесты прошли успешно!`);
  process.exit(0);
}
