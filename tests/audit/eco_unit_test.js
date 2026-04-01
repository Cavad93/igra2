/**
 * tests/audit/eco_unit_test.js
 *
 * UNIT-тест — Модуль: Экономика
 * Покрытие: изолированная логика без зависимостей от GAME_STATE.
 * Запуск: node tests/audit/eco_unit_test.js
 */
'use strict';

let passed = 0, failed = 0;
function assert(cond, msg, detail = '') {
  if (cond) { console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`); passed++; }
  else       { console.error(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ─── Конфиг (mock, совпадает с engine/config.js) ──────────────────────────
const CONFIG = {
  BALANCE: {
    MISSING_NATIONS_MULT:  2.0,
    SHORTAGE_STREAK_CAP:   8,
    PRICE_SMOOTH_FACTOR:   0.30,
    TRADE_PROFIT_RATE:     0.05,
    TRADE_TARIFF_FRIENDLY: 0.05,
    TRADE_TARIFF_NEUTRAL:  0.15,
    TRADE_TARIFF_HOSTILE:  0.30,
    PIRACY_BASE:           0.03,
    SUBSISTENCE_FACTOR:    0.65,
    HAPPINESS_TAX_MULT:    0.015,
    INFANTRY_UPKEEP:       2,
    CAVALRY_UPKEEP:        5,
    SHIP_UPKEEP:           8,
    MERCENARY_UPKEEP:      4,
  },
};
const TAX_CALIBRATION = 0.5;

// ═══════════════════════════════════════════════════════════════
// ECO_UNIT_01 — Трёхзонная рыночная модель (marketTick)
// ═══════════════════════════════════════════════════════════════
console.log('\n=== ECO_UNIT_01: Трёхзонная рыночная модель ===');

function marketTick(state) {
  const { stockpile, stockpileTarget, price, base, streak } = state;
  const SMOOTH = 0.30, DEFICIT_I = 0.10, SURPLUS_R = 0.03;
  const floor = base * 0.5, ceiling = base * 10;
  let delta = 0, newStreak = streak;
  const CAP = CONFIG.BALANCE.SHORTAGE_STREAK_CAP;

  if (stockpile < 0.5 * stockpileTarget) {
    delta = base * Math.exp(streak * 0.15) * DEFICIT_I;
    newStreak = Math.min(streak + 1, CAP);
  } else if (stockpile <= 2.0 * stockpileTarget) {
    delta = 0;
    newStreak = Math.max(0, streak - 1);
  } else {
    const r = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
    delta = -base * SURPLUS_R * r;
    newStreak = Math.max(0, streak - 1);
  }
  const raw     = price + delta;
  const clamped = Math.max(floor, Math.min(ceiling, raw));
  const newPrice = price + (clamped - price) * SMOOTH;
  return { price: Math.round(newPrice * 10) / 10, streak: newStreak };
}

// Проверяем потолок цены: даже при streak=8 цена не уходит выше base*10
let sHigh = { stockpile: 0, stockpileTarget: 1000, price: 9.9 * 10, base: 10, streak: 8 };
for (let i = 0; i < 5; i++) sHigh = { ...sHigh, ...marketTick(sHigh) };
assert(sHigh.price <= 10 * 10, 'Цена не превышает потолок (base×10)', `price=${sHigh.price}`);

// Баланс-зона: цена стабильна (50% < stockpile < 200% target)
let sBal = { stockpile: 100, stockpileTarget: 100, price: 10, base: 10, streak: 3 };
const rBal = marketTick(sBal);
assert(rBal.price === sBal.price, 'Балансовая зона: цена не меняется');
assert(rBal.streak < sBal.streak, 'Балансовая зона: streak снижается');

// Пол цены: при глубоком избытке цена не падает ниже base*0.5
let sFloor = { stockpile: 10000, stockpileTarget: 100, price: 5.1, base: 10, streak: 0 };
for (let i = 0; i < 30; i++) sFloor = { ...sFloor, ...marketTick(sFloor) };
assert(sFloor.price >= 10 * 0.5, 'Пол цены: не падает ниже base×0.5', `price=${sFloor.price}`);

// Экспоненциальный рост при длинной нехватке: streak=7 должен давать больший delta чем streak=0
const ds0 = marketTick({ stockpile: 0, stockpileTarget: 100, price: 10, base: 10, streak: 0 });
const ds7 = marketTick({ stockpile: 0, stockpileTarget: 100, price: 10, base: 10, streak: 7 });
assert(ds7.price > ds0.price, 'Долгий дефицит (streak=7) даёт сильнее рост цены чем streak=0',
  `ds0=${ds0.price}, ds7=${ds7.price}`);

// ═══════════════════════════════════════════════════════════════
// ECO_UNIT_02 — Тарифная ставка calcTariff
// ═══════════════════════════════════════════════════════════════
console.log('\n=== ECO_UNIT_02: Тарифные ставки ===');

function calcTariff(relations) {
  return relations > 50 ? CONFIG.BALANCE.TRADE_TARIFF_FRIENDLY
       : relations > 0  ? CONFIG.BALANCE.TRADE_TARIFF_NEUTRAL
       :                  CONFIG.BALANCE.TRADE_TARIFF_HOSTILE;
}

assert(calcTariff(100) === 0.05,  'Максимальная дружба → минимальный тариф 5%');
assert(calcTariff(51)  === 0.05,  'Дружество (51) → дружественный тариф');
assert(calcTariff(50)  === 0.15,  'Граница 50 → нейтральный (не дружественный)');
assert(calcTariff(1)   === 0.15,  'Минимальный нейтральный (1) → 15%');
assert(calcTariff(0)   === 0.30,  'Ноль отношений → враждебный тариф');
assert(calcTariff(-1)  === 0.30,  'Враждебность → 30%');
assert(calcTariff(-100)=== 0.30,  'Максимальная враждебность → 30%');

// ═══════════════════════════════════════════════════════════════
// ECO_UNIT_03 — Военные расходы calcMilExpenses
// ═══════════════════════════════════════════════════════════════
console.log('\n=== ECO_UNIT_03: Военные расходы ===');

function calcMilExpenses(mil) {
  return (mil.infantry     || 0) * CONFIG.BALANCE.INFANTRY_UPKEEP
       + (mil.cavalry      || 0) * CONFIG.BALANCE.CAVALRY_UPKEEP
       + (mil.ships        || 0) * CONFIG.BALANCE.SHIP_UPKEEP
       + (mil.mercenaries  || 0) * CONFIG.BALANCE.MERCENARY_UPKEEP;
}

assert(calcMilExpenses({ infantry: 500 })        === 1000, 'Только пехота');
assert(calcMilExpenses({ cavalry: 100 })         === 500,  'Только кавалерия');
assert(calcMilExpenses({ ships: 10 })            === 80,   'Только флот');
assert(calcMilExpenses({ mercenaries: 50 })      === 200,  'Только наёмники');
assert(calcMilExpenses({})                        === 0,    'Пустая армия = 0');

const combined = calcMilExpenses({ infantry: 1000, cavalry: 200, ships: 50, mercenaries: 0 });
assert(combined === 1000*2 + 200*5 + 50*8, 'Комбинированная армия', `exp=${combined}`);

// Пропорциональность: удвоение войск удваивает расходы
const single   = calcMilExpenses({ infantry: 100, cavalry: 50 });
const doubled  = calcMilExpenses({ infantry: 200, cavalry: 100 });
assert(doubled === single * 2, 'Расходы линейно масштабируются');

// ═══════════════════════════════════════════════════════════════
// ECO_UNIT_04 — Дефицит запасов (checkSupplyDeficits)
// ═══════════════════════════════════════════════════════════════
console.log('\n=== ECO_UNIT_04: Дефициты запасов ===');

const GOOD_IMPORTANCE = {
  wheat: 1.0, barley: 0.9, salt: 0.7, iron: 0.6,
  timber: 0.5, cloth: 0.5, olive_oil: 0.4, wine: 0.3,
};

function estimateNeed(nation, good) {
  const pop = nation.population?.total || 1000;
  return (good === 'wheat' || good === 'barley') ? pop * 0.01 : pop * 0.005;
}

function checkSupplyDeficits(nation) {
  const deficits = [];
  const stockpile = nation.economy?.stockpile || {};
  for (const [good, importance] of Object.entries(GOOD_IMPORTANCE)) {
    const qty  = stockpile[good] ?? 0;
    const need = estimateNeed(nation, good);
    if (qty < need * 0.25) deficits.push({ good, severity: importance, shortage: need - qty });
  }
  nation._supply_deficits = deficits;
  return deficits;
}

// Граничный случай: порог именно 25% нужды
const pop = 4000;
const need_wheat = pop * 0.01;  // 40
const borderNation = {
  population: { total: pop },
  economy: { stockpile: { wheat: need_wheat * 0.25 } }, // ровно 25%
};
const borderDeficits = checkSupplyDeficits(borderNation);
// qty < need*0.25 → строго меньше, 25% точно НЕ в дефиците
assert(!borderDeficits.some(d => d.good === 'wheat'),
  'Пшеница ровно на 25% порога — НЕ дефицит (строго <)');

// Один ниже порога
const belowNation = {
  population: { total: pop },
  economy: { stockpile: { wheat: need_wheat * 0.24 } },
};
assert(checkSupplyDeficits(belowNation).some(d => d.good === 'wheat'),
  'Пшеница 24% нужды — дефицит');

// Пустые запасы: все товары в дефиците
const emptyNation = { population: { total: 10000 }, economy: { stockpile: {} } };
const all = checkSupplyDeficits(emptyNation);
assert(all.length === Object.keys(GOOD_IMPORTANCE).length,
  'Пустой склад: все товары в дефиците', `count=${all.length}`);

// Severity отсортирована правильно (пшеница > вино)
const wheatDef = all.find(d => d.good === 'wheat');
const wineDef  = all.find(d => d.good === 'wine');
assert(wheatDef.severity > wineDef.severity, 'Пшеница важнее вина');

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(55)}`);
console.log(`ИТОГ: ${passed} ✓ прошли, ${failed} ✗ не прошли из ${passed + failed} тестов`);
if (failed === 0) { console.log('✅ Все тесты прошли!'); process.exit(0); }
else              { console.log('❌ Есть провалы — см. выше'); process.exit(1); }
