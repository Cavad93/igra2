/**
 * tests/eco_crash_and_chain_test_3.js
 *
 * Пакет тестов #3: краш-тесты, цепочки, граничные случаи
 * Запуск: node tests/eco_crash_and_chain_test_3.js
 *
 * TEST 1: Краш-тесты (null/undefined/пустые данные)
 * TEST 2: Тарифная цепочка (getEffectiveTariffRate)
 * TEST 3: Цепочка производство → маршрутизация → stockpile
 * TEST 4: Рыночный цикл (трёхзонная модель, 20 ходов)
 * TEST 5: Голод и смертность (famine chain)
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

// ──────────────────────────────────────────────────────────────
// Минимальные моки
// ──────────────────────────────────────────────────────────────
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
    ORGANIZED_BONUS:       1.20,
    HAPPINESS_TAX_MULT:    0.015,
    FAMINE_MORTALITY:      0.10,
    HAPPINESS_FROM_FAMINE: -15,
    FOOD_PER_PERSON:       0.01,
    SALT_PER_PERSON:       0.005,
    CLOTH_PER_PERSON:      0.003,
    TOOLS_PER_CRAFTSMAN:   0.02,
    TERRAIN_MULTIPLIERS:   { plains: { wheat: 1.0, barley: 0.8 } },
  },
};

const GOOD_IMPORTANCE = {
  wheat: 1.0, barley: 0.9, salt: 0.7, iron: 0.6,
  timber: 0.5, cloth: 0.5, olive_oil: 0.4, wine: 0.3,
};

function _estimateNeedForGood(nation, good) {
  const pop = nation.population?.total || 1000;
  return (good === 'wheat' || good === 'barley') ? pop * 0.01 : pop * 0.005;
}

function checkSupplyDeficits(nation) {
  const deficits = [];
  const stockpile = nation.economy?.stockpile || {};
  for (const [good, importance] of Object.entries(GOOD_IMPORTANCE)) {
    const qty  = stockpile[good] ?? 0;
    const need = _estimateNeedForGood(nation, good);
    if (qty < need * 0.25) {
      deficits.push({ good, severity: importance, shortage: need - qty });
    }
  }
  nation._supply_deficits = deficits;
  return deficits;
}

// Тарифная функция (из economy.js)
function _getEffectiveTariffRate(relations, relScore) {
  if (relations?.war) return 0.99;
  if (relations?.flags?.tariff_rate !== undefined) return relations.flags.tariff_rate;
  const score = relScore ?? 0;
  return Math.max(0.05, Math.min(0.35, 0.20 - (score / 100) * 0.15));
}

// Рыночный тик (упрощённая версия updateMarketPrices из market.js)
function marketTick(market, supply, demand) {
  const _MISSING = CONFIG.BALANCE.MISSING_NATIONS_MULT;
  const _SMOOTHING = 0.30;
  const streakCap = CONFIG.BALANCE.SHORTAGE_STREAK_CAP;
  const effectiveDemand = demand * _MISSING;
  market.world_stockpile = Math.max(0, (market.world_stockpile || 0) + supply - effectiveDemand);
  const stockpileTarget = Math.max(1, effectiveDemand * 4);
  const base = market.base;
  const floor = base * 0.5;
  const ceiling = base * 10;
  const streak = market.shortage_streak || 0;
  const stockpile = market.world_stockpile;
  let price_delta = 0;

  if (stockpile < 0.5 * stockpileTarget) {
    price_delta = base * Math.exp(streak * 0.15) * 0.10;
    market.shortage_streak = Math.min(streak + 1, streakCap);
  } else if (stockpile <= 2.0 * stockpileTarget) {
    price_delta = (demand - supply) / Math.max(supply, 1) * 0.05 * market.price;
    market.shortage_streak = Math.max(0, streak - 1);
  } else {
    const surplus_ratio = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
    price_delta = -base * 0.03 * surplus_ratio;
    market.shortage_streak = Math.max(0, streak - 1);
  }

  const rawNew = market.price + price_delta;
  const clamped = Math.max(floor, Math.min(ceiling, rawNew));
  market.price = Math.round((market.price + (clamped - market.price) * _SMOOTHING) * 10) / 10;

  if (!Array.isArray(market.price_history)) market.price_history = [];
  market.price_history.push(market.price);
  if (market.price_history.length > 24) market.price_history.shift();
}

// ──────────────────────────────────────────────────────────────
// TEST 1: Краш-тесты (null/undefined/пустые данные)
// ──────────────────────────────────────────────────────────────
console.log('\n=== TEST 1: Краш-тесты (null/undefined) ===');

// 1a. checkSupplyDeficits с null economy
try {
  const nation = { name: 'Null', id: 'n0', population: { total: 1000 }, economy: null };
  checkSupplyDeficits(nation);
  assert(true, 'checkSupplyDeficits с null economy — без краша');
} catch(e) {
  assert(false, 'checkSupplyDeficits с null economy — КРАШ', e.message);
}

// 1b. checkSupplyDeficits с пустым stockpile
try {
  const nation = { name: 'Empty', id: 'e0', population: { total: 5000 }, economy: { stockpile: {} } };
  const d = checkSupplyDeficits(nation);
  assert(d.length === Object.keys(GOOD_IMPORTANCE).length, 'Все товары в дефиците при пустом stockpile', `count=${d.length}`);
} catch(e) {
  assert(false, 'checkSupplyDeficits с пустым stockpile — КРАШ', e.message);
}

// 1c. marketTick с нулевым supply и demand
try {
  const m = { base: 10, price: 10, world_stockpile: null, shortage_streak: 0 };
  marketTick(m, 0, 0);
  assert(m.price >= m.base * 0.5, 'Цена не упала ниже флора при нулевом supply/demand', `price=${m.price}`);
} catch(e) {
  assert(false, 'marketTick нулевой supply/demand — КРАШ', e.message);
}

// 1d. _getEffectiveTariffRate с null relations
try {
  const rate = _getEffectiveTariffRate(null, undefined);
  assert(rate >= 0.05 && rate <= 0.35, 'Тариф в допустимом диапазоне при null', `rate=${rate}`);
} catch(e) {
  assert(false, '_getEffectiveTariffRate null — КРАШ', e.message);
}

// 1e. _getEffectiveTariffRate война
try {
  const rate = _getEffectiveTariffRate({ war: true }, 80);
  assert(rate === 0.99, 'Война → тариф 0.99 (блокировка торговли)');
} catch(e) {
  assert(false, '_getEffectiveTariffRate war — КРАШ', e.message);
}

// ──────────────────────────────────────────────────────────────
// TEST 2: Тарифная цепочка
// ──────────────────────────────────────────────────────────────
console.log('\n=== TEST 2: Тарифная цепочка ===');

const scenarii = [
  { score: 80,  war: false, expected: 0.08 },
  { score: 0,   war: false, expected: 0.20 },
  { score: -60, war: false, expected: 0.29 },
];

for (const s of scenarii) {
  const rate = _getEffectiveTariffRate({ war: s.war }, s.score);
  assert(Math.abs(rate - s.expected) < 0.02, `score=${s.score} → тариф ~${s.expected}`, `actual=${rate.toFixed(2)}`);
}

// Явный тариф по договору (treaty_rate)
const treatyRate = _getEffectiveTariffRate({ flags: { tariff_rate: 0.03 } }, 100);
assert(treatyRate === 0.03, 'Treaty tariff_rate=0.03 применён напрямую');

// Цепочка: дружественный < нейтральный < враждебный
const r1 = _getEffectiveTariffRate({}, 80);
const r2 = _getEffectiveTariffRate({}, 0);
const r3 = _getEffectiveTariffRate({}, -80);
assert(r1 < r2 && r2 < r3, 'Цепочка тарифов: дружественный < нейтральный < враждебный', `${r1.toFixed(2)} < ${r2.toFixed(2)} < ${r3.toFixed(2)}`);

// ──────────────────────────────────────────────────────────────
// TEST 3: Цепочка производство → organized/unorg → stockpile
// ──────────────────────────────────────────────────────────────
console.log('\n=== TEST 3: Цепочка производство → stockpile ===');

function simulateProductionChain(orgAmount, unorgAmount) {
  const SUBSISTENCE = CONFIG.BALANCE.SUBSISTENCE_FACTOR;  // 0.65
  const ORG_BONUS   = CONFIG.BALANCE.ORGANIZED_BONUS;     // 1.20
  const orgEff   = orgAmount   * ORG_BONUS;
  const unorgEff = unorgAmount * SUBSISTENCE;
  const total    = orgEff + unorgEff;
  const orgPct   = Math.round(orgEff / (total + 0.001) * 100);
  return { orgEff, unorgEff, total, orgPct };
}

const r100org  = simulateProductionChain(1000, 0);
const r100unorg= simulateProductionChain(0, 1000);
const r50_50   = simulateProductionChain(500, 500);

assert(r100org.orgPct === 100, 'Только organized → orgPct=100%');
assert(r100unorg.orgPct === 0, 'Только unorg → orgPct=0%');
assert(r50_50.orgPct > 55, '50/50 split → organized занимает больше % (выше эффективность)', `orgPct=${r50_50.orgPct}%`);
assert(r100org.total > r100unorg.total, 'Organized производительнее subsistence', `org=${r100org.total}, unorg=${r100unorg.total}`);

// Stockpile накапливается при избыточном производстве
let stockpile = 0;
const weeklyProd = 50;
const weeklyConsume = 30;
for (let i = 0; i < 10; i++) stockpile += weeklyProd - weeklyConsume;
assert(stockpile === 200, 'Stockpile накапливается: 10 ходов × (50-30) = 200', `stockpile=${stockpile}`);

// ──────────────────────────────────────────────────────────────
// TEST 4: Рыночный цикл (трёхзонная модель)
// ──────────────────────────────────────────────────────────────
console.log('\n=== TEST 4: Рыночный цикл (20 ходов) ===');

// 4a. Дефицит → цена растёт → streak ограничен
const mktDeficit = { base: 10, price: 10, world_stockpile: 0, shortage_streak: 0, price_history: [] };
for (let i = 0; i < 20; i++) marketTick(mktDeficit, 5, 50);
assert(mktDeficit.price > 10, 'Дефицит 20 ходов → цена выросла', `price=${mktDeficit.price}`);
assert(mktDeficit.shortage_streak <= CONFIG.BALANCE.SHORTAGE_STREAK_CAP, 'shortage_streak ≤ CAP=8', `streak=${mktDeficit.shortage_streak}`);
assert(mktDeficit.price >= mktDeficit.base * 0.5, 'Цена не упала ниже флора');

// 4b. Избыток → цена снижается до флора
const mktSurplus = { base: 10, price: 15, world_stockpile: 100000, shortage_streak: 0, price_history: [] };
for (let i = 0; i < 20; i++) marketTick(mktSurplus, 500, 10);
assert(mktSurplus.price <= 15, 'Избыток 20 ходов → цена снизилась', `price=${mktSurplus.price}`);
assert(mktSurplus.price >= mktSurplus.base * 0.5, 'Цена не упала ниже флора при избытке', `floor=${mktSurplus.base * 0.5}, price=${mktSurplus.price}`);

// 4c. Баланс → цена стабильна (supply=effectiveDemand, т.е. supply=demand*MISSING_MULT=200)
// effectiveDemand = demand(100) × MISSING(2.0) = 200; supply=200 → нет накопления/убыли
const mktBalance = { base: 10, price: 10, world_stockpile: 800, shortage_streak: 0, price_history: [] };
for (let i = 0; i < 20; i++) marketTick(mktBalance, 200, 100); // supply=200 == effectiveDemand
assert(Math.abs(mktBalance.price - 10) < 3, 'Баланс 20 ходов → цена стабильна ±30%', `price=${mktBalance.price}`);

// 4d. История цен не превышает 24 элемента
assert(mktDeficit.price_history.length <= 24, 'price_history ≤ 24 элементов', `len=${mktDeficit.price_history.length}`);

// ──────────────────────────────────────────────────────────────
// TEST 5: Голод и смертность (famine chain)
// ──────────────────────────────────────────────────────────────
console.log('\n=== TEST 5: Голод и смертность ===');

function simulateFamine(nation, wheatDeficit) {
  const FAMINE_MORT = CONFIG.BALANCE.FAMINE_MORTALITY;
  const HAP_HIT     = CONFIG.BALANCE.HAPPINESS_FROM_FAMINE;

  if (wheatDeficit > 0 && nation.economy.stockpile.wheat !== undefined) {
    const famineMortality = Math.min(
      wheatDeficit * FAMINE_MORT,
      nation.population.total * 0.05,
    );
    nation.population.total    = nation.population.total - Math.round(famineMortality);
    nation.population.happiness = Math.max(0, nation.population.happiness + HAP_HIT);
    nation.economy.stockpile.wheat = 0;
    return { famineMortality, newPop: nation.population.total };
  }
  return { famineMortality: 0, newPop: nation.population.total };
}

const nationFamine = {
  id: 'rome', name: 'Rome',
  population: { total: 100000, happiness: 60 },
  economy: { stockpile: { wheat: 0 } },
};

const demanded = 1000;  // нужно 1000 бушелей
const available = 0;    // нет запасов
const deficit = demanded - available;

const result = simulateFamine(nationFamine, deficit);
assert(result.famineMortality > 0, 'Голод вызывает смертность', `mortality=${Math.round(result.famineMortality)}`);
assert(result.famineMortality <= 100000 * 0.05, 'Смертность ограничена 5% от населения', `mort=${Math.round(result.famineMortality)}, 5%=${100000*0.05}`);
assert(nationFamine.population.happiness < 60, 'Голод снижает счастье', `hap=${nationFamine.population.happiness}`);
assert(nationFamine.population.happiness >= 0, 'Счастье не уходит в минус');
assert(nationFamine.economy.stockpile.wheat === 0, 'Запас пшеницы = 0 после голода');

// Нет голода при достаточных запасах
const nationHealthy = {
  id: 'egypt', name: 'Egypt',
  population: { total: 50000, happiness: 70 },
  economy: { stockpile: { wheat: 5000 } },
};
const r2famine = simulateFamine(nationHealthy, 0);  // deficit=0
assert(r2famine.famineMortality === 0, 'Нет голода при достаточном запасе');
assert(nationHealthy.population.happiness === 70, 'Счастье не меняется без голода');

// ──────────────────────────────────────────────────────────────
// Итог
// ──────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все тесты прошли успешно');
} else {
  console.error(`❌ ${failed} тест(а/ов) провалились!`);
  process.exit(1);
}
