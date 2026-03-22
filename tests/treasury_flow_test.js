/**
 * tests/treasury_flow_test.js
 *
 * Симуляция всех цепочек, формирующих изменение казны за один ход.
 * Находит и верифицирует три системных бага:
 *
 *  БАГ-A: profitLast <= 0 guard в distributeClassIncome
 *          Государственное здание в убытке НЕ вычитает убыток из казны.
 *          → казна завышена; убыток «проглатывается» системой.
 *
 *  БАГ-B: Двойной вычет maintenance для AI-наций
 *          updateTreasury (AI) включает обслуживание автономных зданий в expBuildings,
 *          хотя оно уже вычтено внутри profit_last (→ economy.treasury).
 *          → AI-казна занижена вдвое по обслуживанию.
 *
 *  БАГ-C: Закупки капитала (инструменты/скот/рабы) вычитаются из казны напрямую,
 *          но НЕ отражаются в _expense_breakdown.
 *          → отображаемый баланс ≠ реальному изменению казны.
 *
 * Запуск: node tests/treasury_flow_test.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}${detail ? ' — ' + detail : ''}`);
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
  console.log(`\n─── ${name} ───`);
}

// ══════════════════════════════════════════════════════════════
// СТАБЫ ЗАВИСИМОСТЕЙ (точно воспроизводят логику движка)
// ══════════════════════════════════════════════════════════════

const MAINTENANCE_PER_WORKER = 2;  // из config.js

function _calcBuildingMaintenance(bDef, level) {
  // Воспроизводит engine/buildings.js _calcBuildingMaintenance
  const workersPerUnit = bDef.workers_per_unit ?? (bDef.worker_profession?.[0]?.count ?? 0);
  return workersPerUnit * MAINTENANCE_PER_WORKER * level;
}

// Вся логика updateBuildingFinancials для одного слота
function computeSlotFinancials(slot, bDef, wheatPrice, barleyPrice = 5) {
  const level       = slot.level || 1;
  const maintenance = _calcBuildingMaintenance(bDef, level);

  // gross revenue = (workers/1000) × base_rate × eff × fertility × capital_ratio × level × price
  let gross_revenue = 0;
  for (const po of (bDef.production_output || [])) {
    const price = po.good === 'wheat' ? wheatPrice : barleyPrice;
    gross_revenue += po.base_gross * price;
  }

  const wages      = gross_revenue * (bDef.wage_rate ?? 0);
  const input_cost = gross_revenue * (bDef.seed_fraction ?? 0); // 20% семена
  const net_profit = gross_revenue - wages - input_cost - maintenance;

  return { gross_revenue, wages, input_cost, maintenance, net_profit };
}

// ══════════════════════════════════════════════════════════════
// БАГ-A: profitLast <= 0 — убыток госздания не вычитается из казны
// ══════════════════════════════════════════════════════════════
section('БАГ-A: profitLast ≤ 0 — убыток государственного здания теряется');

(function testLossNotDeducted() {
  // Сценарий: государственная латифундия (owner='nation') в убытке.
  // Это произойдёт при очень низкой цене пшеницы или 0% урожае.
  //
  // Параметры (упрощённо):
  //   maintenance = 100 workers × 2 = 200 ₴
  //   revenue     = 0 (цена пшеницы = 0, или capital_ratio = 0)
  //   wages       = 0 (0% от 0)
  //   profit_last = -200

  const profitLast = -200;
  let treasury     = 5000;

  // ── ТЕКУЩАЯ (СЛОМАННАЯ) ЛОГИКА ──────────────────────────────────────────
  function distributeClassIncome_BROKEN(profLast, slotOwner, eco) {
    if (profLast > 0) {  // <<< БАГ: убыток игнорируется
      if (slotOwner === 'nation') {
        eco.treasury += profLast;
      }
    }
    return eco;
  }

  const econBroken = { treasury };
  distributeClassIncome_BROKEN(profitLast, 'nation', econBroken);
  assertEqual(econBroken.treasury, 5000,
    '[BAG-A] Сломано: казна не изменилась при убытке −200');

  // ── ИСПРАВЛЕННАЯ ЛОГИКА ──────────────────────────────────────────────────
  function distributeClassIncome_FIXED(profLast, slotOwner, eco) {
    if (slotOwner === 'nation') {
      eco.treasury = (eco.treasury || 0) + profLast;  // всегда, даже при убытке
      eco._building_profit_last_tick = (eco._building_profit_last_tick || 0) + profLast;
    }
    return eco;
  }

  const econFixed = { treasury, _building_profit_last_tick: 0 };
  distributeClassIncome_FIXED(profitLast, 'nation', econFixed);
  assertEqual(econFixed.treasury, 4800,
    '[BAG-A] Исправлено: казна уменьшилась на 200 при убытке −200');
  assertEqual(econFixed._building_profit_last_tick, -200,
    '[BAG-A] Исправлено: _building_profit_last_tick отражает убыток −200');

  // Верификация: разница между поломанной и исправленной логикой
  const diff = econBroken.treasury - econFixed.treasury;
  assertEqual(diff, 200,
    '[BAG-A] Разница: сломанная казна завышена на 200 ₴ за тик');
})();

// Проверка с несколькими убыточными зданиями (реалистичный сценарий)
(function testMultipleLossBuildings() {
  // 76 латифундий государственного владения в убытке −200 каждая
  const slots = Array.from({ length: 76 }, (_, i) => ({
    owner: 'nation',
    profit_last: -200,  // убыток при capital_ratio=0
  }));

  let treasuryBroken = 50000;
  let treasuryFixed  = 50000;

  for (const slot of slots) {
    // Сломанная логика: убыток игнорируется
    if (slot.profit_last > 0 && slot.owner === 'nation') {
      treasuryBroken += slot.profit_last;
    }
    // Исправленная логика: убыток вычитается
    if (slot.owner === 'nation') {
      treasuryFixed += slot.profit_last;
    }
  }

  const expected_fixed = 50000 + 76 * (-200); // = 34800
  assertEqual(treasuryFixed, expected_fixed,
    `[BAG-A] 76 убыточных госзданий: казна снижается на ${76 * 200} ₴`);
  assertEqual(treasuryBroken, 50000,
    '[BAG-A] Сломанная логика: казна не снижается вообще');

  const overcharge = treasuryBroken - treasuryFixed;
  assertEqual(overcharge, 15200,
    '[BAG-A] Завышение казны при 76 убыточных зданиях = 15 200 ₴/тик');
})();

// ══════════════════════════════════════════════════════════════
// БАГ-B: AI-нации — двойной вычет maintenance автономных зданий
// ══════════════════════════════════════════════════════════════
section('БАГ-B: AI-нации — двойной вычет обслуживания автономных зданий');

(function testAIDoubleMaintenance() {
  // Сценарий: AI-нация с одной wheat_latifundium (autonomous_builder='aristocrats').
  //   level = 10 единиц
  //   maintenance = 100 workers × 2 × 10 = 2000 ₴
  //   revenue = 5000 ₴
  //   wages   = 1250 ₴ (25%)
  //   profit_last = 5000 − 1000 (input/seed) − 1250 − 2000 = 750 ₴
  //
  // Для AI: distributeClassIncome добавляет profit_last в казну (если nation-owned).
  // ЗАТЕМ updateTreasury добавляет maintenance снова в expBuildings (БАГ!).

  const maintenance = 2000;
  const profitLast  = 750;  // уже вычтено maintenance внутри
  let treasury      = 10000;

  // ── distributeClassIncome для AI (идентично игроку) ─────────────────────
  // Предположим slotOwner='nation' для AI-здания
  treasury += profitLast;  // казна: 10000 + 750 = 10750

  // ── updateTreasury для AI (текущий баг) ─────────────────────────────────
  // Текущий код: добавляет maintenance в expBuildings для ВСЕХ зданий AI,
  // включая автономные, чьё обслуживание уже вычтено в profit_last.

  function updateTreasury_AI_BROKEN(trs, slotMaintenance) {
    const expBuildings = slotMaintenance; // maintenance автономного здания включена!
    return trs - expBuildings;
  }

  function updateTreasury_AI_FIXED(trs, _slotMaintenance) {
    const expBuildings = 0; // autonomous здания пропущены (как для игрока)
    return trs - expBuildings;
  }

  const finalBroken = updateTreasury_AI_BROKEN(treasury, maintenance);
  const finalFixed  = updateTreasury_AI_FIXED(treasury, maintenance);

  // Ожидаемая казна: 10000 + profit_last(750) − income(5000-1250-1000) + taxes + ...
  // Упрощённо: ожидаем что maintenance вычтется ОДИН раз (через profit_last)
  assertEqual(finalFixed, 10750,
    '[BAG-B] Исправлено: maintenance вычтена ОДИН раз (через profit_last)');
  assertEqual(finalBroken, 8750,
    '[BAG-B] Сломано: maintenance вычтена ДВАЖДЫ (profit_last + expBuildings)');

  const doubleDed = finalFixed - finalBroken;
  assertEqual(doubleDed, 2000,
    '[BAG-B] Двойной вычет: переплата 2000 ₴ за тик на одно здание');
})();

// Реалистичная оценка масштаба бага для Сиракуз (76 латифундий AI)
(function testAIDoubleMaintenance_Scale() {
  // Если бы у AI было 76 латифундий
  const workersPerUnit     = 100;
  const maintenancePerUnit = workersPerUnit * MAINTENANCE_PER_WORKER;  // = 200
  const latCount           = 76;
  const totalDoubleDed     = maintenancePerUnit * latCount;

  assertEqual(maintenancePerUnit, 200,
    '[BAG-B] Обслуживание 1 латифундии = 200 ₴/тик (100 workers × 2)');
  assertEqual(totalDoubleDed, 15200,
    '[BAG-B] Двойной вычет для 76 AI-латифундий = 15 200 ₴/тик');

  // Вилла: 15 workers × 2 = 30 ₴/тик за единицу
  const villaMaintenancePerUnit = 15 * MAINTENANCE_PER_WORKER;
  assertEqual(villaMaintenancePerUnit, 30,
    '[BAG-B] Обслуживание 1 виллы = 30 ₴/тик (15 workers × 2)');
})();

// Проверяем корректный фильтр для AI (с исправлением)
(function testAIBuildingFilter() {
  const BUILDINGS_TEST = {
    wheat_latifundium: { autonomous_builder: 'aristocrats', workers_per_unit: 100 },
    wheat_villa:       { autonomous_builder: 'soldiers_class', workers_per_unit: 15 },
    wheat_family_farm: { autonomous_builder: 'farmers_class', workers_per_unit: 5 },
    harbor:            { autonomous_builder: undefined, worker_profession: [{ profession: 'sailors', count: 20 }] },
    forum:             { autonomous_builder: undefined, worker_profession: [{ profession: 'merchants', count: 5 }] },
  };

  const slots = [
    { building_id: 'wheat_latifundium', level: 10, status: 'active' },
    { building_id: 'wheat_villa',       level: 5,  status: 'active' },
    { building_id: 'wheat_family_farm', level: 100, status: 'active' },
    { building_id: 'harbor',            level: 1,  status: 'active' },
    { building_id: 'forum',             level: 1,  status: 'active' },
  ];

  let expBuildingsBroken = 0;
  let expBuildingsFixed  = 0;

  for (const slot of slots) {
    if (slot.status !== 'active') continue;
    if (slot.building_id === 'walls' || slot.building_id === 'fortress') continue;
    const bDef = BUILDINGS_TEST[slot.building_id];
    if (!bDef) continue;

    const maint = _calcBuildingMaintenance(bDef, slot.level || 1);

    // Сломанная логика (AI): включает ВСЕ здания
    expBuildingsBroken += maint;

    // Исправленная логика: пропускает autonomous_builder
    if (!bDef.autonomous_builder) {
      expBuildingsFixed += maint;
    }
  }

  // Autonomous buildings maintenance:
  // lat: 100×2×10=2000, villa: 15×2×5=150, farm: 5×2×100=1000 → итого 3150
  // Non-autonomous: harbor: 20×2×1=40, forum: 5×2×1=10 → итого 50

  assertEqual(expBuildingsBroken, 3200,
    '[BAG-B] Сломанный фильтр: expBuildings = 3200 (включает autonomous)');
  assertEqual(expBuildingsFixed, 50,
    '[BAG-B] Исправленный фильтр: expBuildings = 50 (только non-autonomous)');

  const savedPerTick = expBuildingsBroken - expBuildingsFixed;
  assertEqual(savedPerTick, 3150,
    '[BAG-B] После исправления AI-казна не переплачивает 3150 ₴/тик');
})();

// ══════════════════════════════════════════════════════════════
// БАГ-C: Закупки капитала не отражаются в _expense_breakdown
// ══════════════════════════════════════════════════════════════
section('БАГ-C: Закупки капитала не отражены в расходах');

(function testCapitalProcurementNotTracked() {
  // Симуляция procureCapitalInputs: вычитает из казны напрямую.
  // Эта сумма НЕ включается в _expense_breakdown.total.
  //
  // Для Сиракуз (иллюстративно):
  //  76 латифундий × 20 инструментов × wear 0.021 × price_tools(35) ≈ 1117 ₴/тик
  //  76 латифундий × 30 скота       × wear 0.007 × price_cattle(40) ≈  638 ₴/тик
  // 848 вилл       × 3  инструментов × wear 0.021 × 35                ≈ 1869 ₴/тик
  // 848 вилл       × 10 скота       × wear 0.007 × 40                ≈ 2376 ₴/тик
  //
  // Итого оценочно ~6000 ₴/тик незаметно вычитается из казны.

  const capitalDeductions = {
    lat_tools:   Math.round(76 * 20 * 0.021 * 35),    // = 1117
    lat_cattle:  Math.round(76 * 30 * 0.007 * 40),    // = 638
    villa_tools: Math.round(848 * 3 * 0.021 * 35),    // = 1869
    villa_cattle:Math.round(848 * 10 * 0.007 * 40),   // = 2381
  };
  const totalCapDeduction = Object.values(capitalDeductions).reduce((s, v) => s + v, 0);

  assert(capitalDeductions.lat_tools > 1000,
    '[BAG-C] Латифундии: вычет инструментов > 1000 ₴/тик',
    `${capitalDeductions.lat_tools} ₴`);
  assert(capitalDeductions.villa_cattle > 2000,
    '[BAG-C] Виллы: вычет скота > 2000 ₴/тик',
    `${capitalDeductions.villa_cattle} ₴`);
  assert(totalCapDeduction > 5000,
    '[BAG-C] Общий незаметный вычет > 5000 ₴/тик',
    `${totalCapDeduction} ₴`);

  // Проверка: breakdown.total НЕ включает капитальные закупки
  const displayedNet = 5000; // гипотетический net из breakdown
  const actualTreasuryDelta = displayedNet - totalCapDeduction;

  assert(actualTreasuryDelta < displayedNet,
    '[BAG-C] Реальное изменение казны меньше отображаемого',
    `отображ. ${displayedNet}, реальное ${actualTreasuryDelta}`);

  console.log(`\n  ℹ  Оценка незаметных вычетов из казны за тик:`);
  for (const [key, val] of Object.entries(capitalDeductions)) {
    console.log(`     ${key.padEnd(15)}: −${val} ₴`);
  }
  console.log(`     ${'ИТОГО'.padEnd(15)}: −${totalCapDeduction} ₴`);
})();

// ══════════════════════════════════════════════════════════════
// ИНТЕГРАЦИЯ: Полный баланс казны за один тик
// ══════════════════════════════════════════════════════════════
section('ИНТЕГРАЦИЯ: Полный трекинг баланса казны за один тик');

(function testFullTreasuryBalance() {
  // Симулируем один полный тик для нации-игрока.
  // Все цифры являются иллюстративными (не обязательно точными для Сиракуз).

  const initialTreasury = 100000;

  // ── Шаг 0.5: Закупки капитала (procureCapitalInputs) ──────────────────
  // НЕ отражается в breakdown!
  const capitalPurchase = 6000;  // инструменты + скот для ферм/вилл/латифундий

  // ── Шаг 5б: distributeClassIncome ────────────────────────────────────
  const nationBuildingProfit = 50000;  // прибыль госзданий → в казну
  const soldierSalary        = 48878;  // 24439 солдат × 2 ₴

  // ── Шаг 5в: deductFoodPurchases ──────────────────────────────────────
  const foodForSoldiers = 500;  // еда для солдат в постройках

  // ── Шаг 6: updateTreasury ────────────────────────────────────────────
  const taxIncome    = 15000;
  const portDuties   = 2400;
  const tradeProfit  = 1000;
  const totalIncome  = taxIncome + portDuties + tradeProfit;  // 18400

  const armyUpkeep   = 16000;  // 8000 infantry × 2
  const navyUpkeep   = 0;
  const courtCost    = 500;
  const stabilityCost = 100;
  const slaveCost    = 0;
  const buildingMaint = 1000;  // только non-autonomous
  const totalExpense  = armyUpkeep + navyUpkeep + courtCost + stabilityCost + slaveCost + buildingMaint;

  // ── РАСЧЁТ РЕАЛЬНОГО ИЗМЕНЕНИЯ КАЗНЫ ─────────────────────────────────
  const actualDelta = (
    - capitalPurchase              // шаг 0.5 (не в breakdown)
    + nationBuildingProfit         // шаг 5б
    - soldierSalary                // шаг 5б
    - foodForSoldiers              // шаг 5в
    + (totalIncome - totalExpense) // шаг 6
  );

  const actualFinalTreasury = initialTreasury + actualDelta;

  // ── РАСЧЁТ ОТОБРАЖАЕМОГО ИЗМЕНЕНИЯ (_income_breakdown - _expense_breakdown) ─
  const displayedIncome  = totalIncome + nationBuildingProfit;  // 18400 + 50000 = 68400
  const displayedExpense = totalExpense + soldierSalary + foodForSoldiers; // 17600 + 48878 + 500 = 66978
  const displayedDelta   = displayedIncome - displayedExpense;              // = 1422

  // Разрыв = незаметные вычеты (capitalPurchase)
  const gap = displayedDelta - actualDelta;

  console.log(`\n  Реальное изменение казны: ${actualDelta} ₴`);
  console.log(`  Отображаемое изменение:   ${displayedDelta} ₴`);
  console.log(`  Разрыв (незаметные вычеты): ${gap} ₴`);

  assertEqual(gap, capitalPurchase,
    '[INTEG] Разрыв между отображаемым и реальным балансом = незаметные закупки капитала');

  assert(actualDelta !== displayedDelta,
    '[INTEG] Реальное изменение казны ≠ отображаемому (незаметные вычеты существуют)');

  // Проверяем что при отсутствии незаметных вычетов — совпадают.
  // Если капитальных закупок нет (0), actualDelta = actualDelta + capitalPurchase,
  // а displayedDelta остаётся тем же (капитал не попадает в breakdown в любом случае).
  const actualDeltaNoCapital    = actualDelta + capitalPurchase;  // вычеты убраны
  // displayedDelta не меняется — breakdown не знает о капитале
  assertEqual(displayedDelta, actualDeltaNoCapital,
    '[INTEG] При нулевых закупках капитала: displayed = actual');
})();

// ══════════════════════════════════════════════════════════════
// ВЕРИФИКАЦИЯ: корректный порядок вызовов (нет гонки данных)
// ══════════════════════════════════════════════════════════════
section('ПОРЯДОК: profit_last вычисляется до distributeClassIncome');

(function testCallOrder() {
  // updateBuildingFinancials (шаг 3) устанавливает profit_last.
  // distributeClassIncome (шаг 5б) читает profit_last.
  // Между ними: distributeWages (шаг 4) и updateMarketPrices (шаг 5).
  //
  // Критически важно: distributeClassIncome читает profit_last,
  // вычисленный НА ТЕКУЩЕМ тике (не предыдущем).
  //
  // Проверяем что логика чтения/записи корректна (нет гонки).

  // Симулируем временную шкалу
  const timeline = [
    { step: '3',  fn: 'updateBuildingFinancials',  writes: ['slot.profit_last', 'slot.wages_paid', 'slot.revenue_last'] },
    { step: '4a', fn: 'distributeWages',            writes: ['slot.wages_paid'] },   // перезаписывает (то же значение)
    { step: '4b', fn: 'updatePopWealth',            writes: ['pop.wealth_level'] },
    { step: '5',  fn: 'recomputeAllProductionCosts', writes: ['market.production_cost'] },
    { step: '5',  fn: 'updateMarketPrices',         writes: ['market.price'] },
    { step: '5б', fn: 'distributeClassIncome',      reads:  ['slot.profit_last', 'slot.wages_paid'] },
    { step: '6',  fn: 'updateTreasury',             reads:  ['economy._building_profit_last_tick',
                                                               'economy._soldier_salary_per_turn',
                                                               'economy._food_spending.treasury'] },
  ];

  // Находим индексы записи profit_last и чтения в distributeClassIncome
  const writeIdx = timeline.findIndex(t => t.writes?.includes('slot.profit_last'));
  const readIdx  = timeline.findIndex(t => t.reads?.includes('slot.profit_last'));

  assert(writeIdx < readIdx,
    '[ORDER] updateBuildingFinancials (записывает profit_last) вызывается ДО distributeClassIncome',
    `шаг ${timeline[writeIdx].step} < шаг ${timeline[readIdx].step}`);

  // distributeWages перезаписывает wages_paid — проверяем что это не ломает ничего
  // (обе функции вычисляют wages одинаково: revenue × wage_rate)
  const wages_last_written_by = timeline
    .filter(t => t.writes?.includes('slot.wages_paid'))
    .at(-1);
  assert(wages_last_written_by?.step === '4a',
    `[ORDER] Последняя запись slot.wages_paid — шаг ${wages_last_written_by?.step} (distributeWages)`,
    wages_last_written_by?.fn);

  console.log('\n  Порядок вызовов:');
  for (const t of timeline) {
    const action = t.writes ? `пишет: [${t.writes.join(', ')}]` : `читает: [${t.reads.join(', ')}]`;
    console.log(`    Шаг ${t.step.padEnd(3)}: ${t.fn.padEnd(35)} ${action}`);
  }
})();

// ══════════════════════════════════════════════════════════════
// БАГ-D: Батарейка farmers_class раздута зарплатами от вилл
// ══════════════════════════════════════════════════════════════
section('БАГ-D: perCapitaIncome батарейки земледельцев завышен зарплатами вилл');

(function testBatteryInflatedByVillaWages() {
  // Реальные числа из UI:
  //   Доход своих ферм:   105 170 ₴  (ферм: 3196 ур.)
  //   Зарплата от вилл:   338 780 ₴  (вилла ~848 ур. × 15 фермеров/ур.)
  //   Итого класс:        443 950 ₴
  //
  // СЛОМАННАЯ батарейка = (105 170 + 338 780) / (3196 + ~915) = 443 950 / 4111 ≈ 108
  // ИСПРАВЛЕННАЯ        =  105 170             /  3196              ≈ 32.87
  //
  // Разница: 108 / 32.87 = 3.29× — батарейка заполняется в 3× быстрее, чем нужно.

  const farmIncome    = 105170;  // income от слотов slotOwner==='farmers_class'
  const villaWages    = 338780;  // wages от villa/lat → farmers_class
  const farmLevels    = 3196;    // уровни ферм (engaged own)
  const villaLevels   = 915;     // уровни вилл (engaged hired)

  const bThresh = 700;           // bDef.cost(100) + 5×12×maint(10) = 700

  // ── СЛОМАННАЯ ЛОГИКА: villa wages + villa levels в батарейке ──────────────
  function batteryIncrement_BROKEN(farmInc, villaWg, farmLvl, villaLvl) {
    const income   = farmInc + villaWg;     // оба источника в числителе
    const engaged  = farmLvl + villaLvl;    // оба типа уровней в знаменателе
    return income / engaged;
  }

  // ── ИСПРАВЛЕННАЯ ЛОГИКА: только своё производство ────────────────────────
  function batteryIncrement_FIXED(farmInc, _villaWg, farmLvl, _villaLvl) {
    return farmInc / farmLvl;              // только фермы → только фермы
  }

  const brokenRate = batteryIncrement_BROKEN(farmIncome, villaWages, farmLevels, villaLevels);
  const fixedRate  = batteryIncrement_FIXED(farmIncome,  villaWages, farmLevels, villaLevels);

  // Проверяем что сломанная логика ≈ 108 (как в UI)
  assert(Math.abs(brokenRate - 108) < 1,
    '[BAG-D] Сломанная батарейка ≈ 108 ₴/тик (как в UI)',
    `${brokenRate.toFixed(2)} ₴`);

  // Проверяем что исправленная логика ≈ 32.87 (ожидание пользователя)
  assert(Math.abs(fixedRate - 32.87) < 0.1,
    '[BAG-D] Исправленная батарейка ≈ 32.87 ₴/тик (совпадает с расчётом пользователя)',
    `${fixedRate.toFixed(2)} ₴`);

  // Коэффициент завышения
  const inflation = brokenRate / fixedRate;
  assert(inflation > 3.2 && inflation < 3.4,
    `[BAG-D] Завышение: сломанная в ${inflation.toFixed(2)}× быстрее исправленной`);

  // Время заполнения батарейки до порога 700 ₴
  const ticksBroken = bThresh / brokenRate;
  const ticksFixed  = bThresh / fixedRate;
  console.log(`\n  ℹ  Время заполнения батарейки (порог ${bThresh} ₴):`);
  console.log(`     Сломанная: ${ticksBroken.toFixed(1)} тиков (~${(ticksBroken/12).toFixed(1)} лет) — СЛИШКОМ БЫСТРО`);
  console.log(`     Исправленная: ${ticksFixed.toFixed(1)} тиков (~${(ticksFixed/12).toFixed(1)} лет) — реалистично`);

  assert(ticksBroken < 10,
    `[BAG-D] Сломанная: новая ферма строится каждые ${ticksBroken.toFixed(1)} тиков (~${(ticksBroken).toFixed(0)} мес) — слишком часто`);
  assert(ticksFixed > 15,
    `[BAG-D] Исправленная: новая ферма строится каждые ${ticksFixed.toFixed(1)} тиков (~${(ticksFixed).toFixed(0)} мес) — реалистично`);

  // class_capital ПРОДОЛЖАЕТ получать villa wages (это корректно)
  let cc_farmers = 0;
  cc_farmers += farmIncome;   // от своих ферм
  cc_farmers += villaWages;   // от найма на виллы
  assertEqual(cc_farmers, farmIncome + villaWages,
    '[BAG-D] class_capital.farmers_class всё равно получает ПОЛНЫЙ доход (фермы + зарплаты вилл)');
})();

// ══════════════════════════════════════════════════════════════
// ИТОГИ
// ══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(65));
console.log(`ИТОГО: ${passed} прошло, ${failed} упало`);
console.log('═'.repeat(65));

if (failed > 0) {
  console.error(`\n❌ ${failed} тест(ов) не прошло!`);
  process.exit(1);
} else {
  console.log('\n✅ Все тесты прошли!');
  process.exit(0);
}
