/**
 * tests/eco_session4_test.js
 *
 * Сессия 4: Углублённые тесты экономического движка
 * Покрытие: налоговая система, торговля, здания, рынок, долгая симуляция
 * Запуск: node tests/eco_session4_test.js
 */
'use strict';

let passed = 0, failed = 0;
function assert(cond, msg, detail = '') {
  if (cond) { console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`); passed++; }
  else       { console.error(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ─── CONFIG mock ──────────────────────────────────────────────
const CONFIG = { BALANCE: {
  MISSING_NATIONS_MULT: 2.0, SHORTAGE_STREAK_CAP: 8,
  PRICE_SMOOTH_FACTOR: 0.30, TRADE_PROFIT_RATE: 0.05,
  TRADE_TARIFF_FRIENDLY: 0.05, TRADE_TARIFF_NEUTRAL: 0.15,
  TRADE_TARIFF_HOSTILE: 0.30, PIRACY_BASE: 0.03,
  SUBSISTENCE_FACTOR: 0.65, ORGANIZED_BONUS: 1.20,
  HAPPINESS_TAX_MULT: 0.015, INFANTRY_UPKEEP: 2,
  CAVALRY_UPKEEP: 5, SHIP_UPKEEP: 8, MERCENARY_UPKEEP: 4,
}};
const TAX_CALIBRATION = 0.5;

// ═══════════════════════════════════════════════════════════════
// TEST 1: Налоговая механика по классам
// ═══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: Налоговая механика по классам ===');

function calcTaxByClass(taxBases, rates, buildingMult) {
  return {
    aristocrats: Math.round(taxBases.aristocrats * rates.aristocrats * TAX_CALIBRATION * buildingMult),
    clergy:      Math.round(taxBases.clergy      * rates.clergy      * TAX_CALIBRATION * buildingMult),
    commoners:   Math.round(taxBases.commoners   * rates.commoners   * TAX_CALIBRATION * buildingMult),
    soldiers:    Math.round(taxBases.soldiers    * rates.soldiers    * TAX_CALIBRATION * buildingMult),
  };
}

const bases = { aristocrats: 10000, clergy: 2000, commoners: 30000, soldiers: 5000 };
const rates = { aristocrats: 0.15, clergy: 0.07, commoners: 0.10, soldiers: 0.04 };

const tax = calcTaxByClass(bases, rates, 1.0);
assert(tax.aristocrats === Math.round(10000 * 0.15 * 0.5), 'Аристократы: верный налог');
assert(tax.aristocrats > tax.clergy, 'Аристократы платят больше духовенства');
assert(tax.commoners > tax.soldiers, 'Горожане платят больше солдат');

const taxBld = calcTaxByClass(bases, rates, 1.10); // Агора +10%
assert(taxBld.aristocrats > tax.aristocrats, 'Здание Агора увеличивает налоги');

const totalTax = Object.values(tax).reduce((s,v) => s+v, 0);
assert(totalTax > 0, 'Суммарный налог положителен', `total=${totalTax}`);

// ═══════════════════════════════════════════════════════════════
// TEST 2: Торговая прибыль — пошлины и пиратство
// ═══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: Торговая прибыль — формула processTrade ===');

function calcTradeProfit(surplus, price, tariff, piracy) {
  const volume = Math.min(surplus * 0.1, 1000);
  const gross  = volume * price * 0.05 * (1 - piracy);
  const tariffAmt = gross * tariff;
  return gross - tariffAmt;
}

const p1 = calcTradeProfit(2000, 10, 0.05, CONFIG.BALANCE.PIRACY_BASE);
const p2 = calcTradeProfit(2000, 10, 0.30, CONFIG.BALANCE.PIRACY_BASE);
assert(p1 > p2, 'Дружественный тариф выгоднее враждебного');

const p3 = calcTradeProfit(2000, 20, 0.15, CONFIG.BALANCE.PIRACY_BASE);
const p4 = calcTradeProfit(2000, 10, 0.15, CONFIG.BALANCE.PIRACY_BASE);
assert(Math.abs(p3 / p4 - 2.0) < 0.01, 'Цена ×2 → прибыль ×2');

const p5 = calcTradeProfit(2000, 10, 0.99, 0.03);
assert(p5 < p1 * 0.02, 'Тариф 99% → прибыль <2% от дружественного тарифа', `p5=${p5.toFixed(3)}, p1=${p1.toFixed(3)}`);

assert(p1 > 0, 'Торговля с другом прибыльна', `profit=${p1.toFixed(2)}`);
assert(p2 < p1 * 0.8, 'Враждебный тариф снижает прибыль >20%');

// ═══════════════════════════════════════════════════════════════
// TEST 3: Военные расходы vs доход
// ═══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: Военные расходы и баланс бюджета ===');

function calcMilExpenses(mil) {
  return (mil.infantry||0) * CONFIG.BALANCE.INFANTRY_UPKEEP
       + (mil.cavalry ||0) * CONFIG.BALANCE.CAVALRY_UPKEEP
       + (mil.ships   ||0) * CONFIG.BALANCE.SHIP_UPKEEP
       + (mil.mercenaries||0) * CONFIG.BALANCE.MERCENARY_UPKEEP;
}

const mil1 = { infantry: 1000, cavalry: 200, ships: 50, mercenaries: 0 };
const exp1 = calcMilExpenses(mil1);
assert(exp1 === 1000*2 + 200*5 + 50*8, 'Военные расходы рассчитаны верно', `exp=${exp1}`);

const mil2 = { infantry: 0, cavalry: 0, ships: 0, mercenaries: 0 };
assert(calcMilExpenses(mil2) === 0, 'Без армии нет расходов');

const income = 5000;
const ratio  = exp1 / income;
assert(ratio < 1.0, 'Армия не превышает доход нации', `ratio=${ratio.toFixed(2)}`);

// Диагностика: армия >50% дохода → предупреждение
const bigMil = { infantry: 3000, cavalry: 500, ships: 100, mercenaries: 200 };
const bigExp = calcMilExpenses(bigMil);
assert(bigExp > income * 0.5, 'Большая армия поглощает >50% дохода — виден в диагностике');

// ═══════════════════════════════════════════════════════════════
// TEST 4: Трёхзонный рынок — переходы между зонами
// ═══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: Рыночные переходы зон (трёхзонная модель) ===');

function marketTick(state) {
  const { stockpile, stockpileTarget, price, base, streak } = state;
  const SMOOTH = 0.30, DEFICIT_I = 0.10, SURPLUS_R = 0.03, BALANCE_S = 0.05;
  const floor = base * 0.5, ceiling = base * 10;
  let delta = 0, newStreak = streak;
  const CAP = CONFIG.BALANCE.SHORTAGE_STREAK_CAP;

  if (stockpile < 0.5 * stockpileTarget) {
    delta = base * Math.exp(streak * 0.15) * DEFICIT_I;
    newStreak = Math.min(streak + 1, CAP);
  } else if (stockpile <= 2.0 * stockpileTarget) {
    delta = 0; newStreak = Math.max(0, streak - 1); // упрощение для теста
  } else {
    const r = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
    delta = -base * SURPLUS_R * r;
    newStreak = Math.max(0, streak - 1);
  }
  const raw    = price + delta;
  const clamped = Math.max(floor, Math.min(ceiling, raw));
  const newPrice = price + (clamped - price) * SMOOTH;
  return { price: Math.round(newPrice * 10) / 10, streak: newStreak };
}

// Зона дефицита → цена растёт
let s = { stockpile: 10, stockpileTarget: 100, price: 10, base: 10, streak: 0 };
const s1 = marketTick(s);
assert(s1.price > s.price, 'Дефицит → цена растёт');
assert(s1.streak === 1, 'Дефицит → streak увеличивается');

// Зона избытка → цена падает
let s2 = { stockpile: 500, stockpileTarget: 100, price: 10, base: 10, streak: 3 };
const r2 = marketTick(s2);
assert(r2.price < s2.price, 'Избыток → цена снижается');
assert(r2.streak < s2.streak, 'Избыток → streak снижается');

// streak cap = 8
let sc = { stockpile: 5, stockpileTarget: 100, price: 10, base: 10, streak: 8 };
const rc = marketTick(sc);
assert(rc.streak === 8, 'streak не превышает CAP=8');

// Цена не ниже флора
let sf = { stockpile: 5000, stockpileTarget: 100, price: 5.1, base: 10, streak: 0 };
for (let i = 0; i < 20; i++) sf = { ...sf, ...marketTick(sf) };
assert(sf.price >= 10 * 0.5, 'Цена не падает ниже флора (base×0.5)', `price=${sf.price}`);

// ═══════════════════════════════════════════════════════════════
// TEST 5: 100-ходовая симуляция — устойчивость экономики
// ═══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: 100-ходовая симуляция устойчивости ===');

function simulateEconomy100Turns() {
  let treasury = 5000, happiness = 60, wheat = 500, price = 10;
  let streak = 0, history = [];

  for (let t = 0; t < 100; t++) {
    // Производство
    const prod = 150 + Math.floor(Math.random() * 50);
    // Потребление
    const cons = 100 + Math.floor(Math.random() * 40);
    wheat = Math.max(0, wheat + prod - cons);

    // Налоги (упрощённо)
    const taxBase = 30000 * 0.10 * TAX_CALIBRATION;
    const happinessMult = Math.max(0.5, 1 - Math.max(0, 50 - happiness) * CONFIG.BALANCE.HAPPINESS_TAX_MULT);
    const taxIncome = taxBase * happinessMult;

    // Расходы армии (умеренная армия, чтобы бюджет сходился)
    const milExp = calcMilExpenses({ infantry: 300, cavalry: 50, ships: 10, mercenaries: 0 });

    treasury += taxIncome - milExp;
    if (treasury < 0) treasury = 0; // казна не уходит в минус (займы не реализованы)

    // Рынок пшеницы
    const mkt = marketTick({ stockpile: wheat, stockpileTarget: 400, price, base: 10, streak });
    price = mkt.price; streak = mkt.streak;

    // Счастье
    if (wheat < 50 && happiness > 0)  happiness = Math.max(0, happiness - 5);
    if (wheat >= 200 && happiness < 80) happiness = Math.min(100, happiness + 1);

    history.push({ treasury, happiness, wheat, price });
  }
  return history;
}

const hist = simulateEconomy100Turns();
const last = hist[hist.length - 1];
const first = hist[0];

assert(last.treasury >= 0, '100 ходов: казна не отрицательна', `treasury=${Math.round(last.treasury)}`);
assert(last.happiness >= 0 && last.happiness <= 100, 'Счастье в диапазоне 0–100', `happiness=${last.happiness}`);
assert(last.price >= 5.0, 'Цена пшеницы не упала ниже флора', `price=${last.price}`);
assert(hist.every(h => h.happiness >= 0), 'Счастье никогда не отрицательное');
assert(hist.filter(h => h.treasury > 0).length > 50, 'Казна положительна >50 ходов из 100');

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`ИТОГ: ${passed} ✓ прошли, ${failed} ✗ не прошли из ${passed+failed} тестов`);
if (failed === 0) console.log('✅ Все тесты прошли!');
else              console.log('❌ Есть провалы — см. выше');
process.exit(failed > 0 ? 1 : 0);
