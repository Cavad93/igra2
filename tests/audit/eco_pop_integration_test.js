/**
 * tests/audit/eco_pop_integration_test.js
 *
 * INTEGRATION-тест — Экономика ↔ Население (Pops)
 *
 * Проверяет цепочку взаимодействий:
 *   1. Население генерирует спрос через getConsumptionBasket (pops.js)
 *   2. Экономика удовлетворяет спрос из stockpile (economy.js)
 *   3. Нехватка товаров снижает satisfied → влияет на счастье
 *   4. Счастье снижает налоговый доход (HAPPINESS_TAX_MULT)
 *
 * Запуск: node tests/audit/eco_pop_integration_test.js
 */
'use strict';

let passed = 0, failed = 0;
function assert(cond, msg, detail = '') {
  if (cond) { console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`); passed++; }
  else       { console.error(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ─── CONFIG mock ──────────────────────────────────────────────
const CONFIG = {
  BALANCE: {
    HAPPINESS_TAX_MULT:    0.015,
    SHORTAGE_STREAK_CAP:   8,
    PIRACY_BASE:           0.03,
    TRADE_TARIFF_FRIENDLY: 0.05,
    INFANTRY_UPKEEP:       2,
    CAVALRY_UPKEEP:        5,
  },
};
const TAX_CALIBRATION = 0.5;

// ─── Логика из pops.js (inline для изоляции) ──────────────────

const POP_INITIAL_WEALTH = {
  farmers: 15, craftsmen: 45, merchants: 65,
  sailors: 38, clergy: 55, soldiers: 35, slaves: 5,
};
const POP_WEALTH_INERTIA = 20;

function getConsumptionBasket(wealth) {
  const w = Math.max(0, Math.min(100, wealth));
  let grain;
  if (w <= 30)      grain = 0.8;
  else if (w <= 60) grain = 0.8 + (w - 30) / 30 * (0.6 - 0.8);
  else              grain = 0.6 + (w - 60) / 40 * (0.4 - 0.6);

  const basket = { wheat: Math.round(grain * 1000) / 1000 };
  if (w > 30) {
    basket.timber = Math.round(Math.min(0.10, (w - 30) / 30 * 0.10) * 1000) / 1000;
    if (basket.timber < 0.001) delete basket.timber;
  }
  if (w > 30) {
    const tMid  = Math.min(0.05, (w - 30) / 30 * 0.05);
    const tRich = w > 60 ? (w - 60) / 40 * 0.05 : 0;
    basket.tools = Math.round((tMid + tRich) * 1000) / 1000;
    if (basket.tools < 0.001) delete basket.tools;
  }
  if (w > 60) {
    basket.wine = Math.round((w - 60) / 40 * 0.20 * 1000) / 1000;
    if (basket.wine < 0.001) delete basket.wine;
  }
  return basket;
}

function calcNationBasketDemand(nation) {
  const pops = nation.population?.pops;
  if (!pops) return null;
  const result = {};
  for (const [prof, pop] of Object.entries(pops)) {
    const size   = (nation.population.by_profession[prof] || 0) / 1000;
    const basket = getConsumptionBasket(pop.wealth);
    for (const [good, amt] of Object.entries(basket)) {
      result[good] = (result[good] || 0) + amt * size;
    }
  }
  return result;
}

function updatePopSatisfied(pops, byProf, demanded, actualConsumed) {
  const goodRatio = {};
  for (const [good, dem] of Object.entries(demanded)) {
    const actual    = actualConsumed[good] ?? 0;
    goodRatio[good] = dem > 0 ? Math.min(1.0, actual / dem) : 1.0;
  }
  for (const [prof, pop] of Object.entries(pops)) {
    const basket    = getConsumptionBasket(pop.wealth);
    let wSum = 0, wTotal = 0;
    for (const [good, amt] of Object.entries(basket)) {
      wSum   += (goodRatio[good] ?? 1.0) * amt;
      wTotal += amt;
    }
    pop.satisfied = wTotal > 0 ? Math.max(0, Math.min(1, wSum / wTotal)) : 1.0;
  }
}

function updatePopWealth(pops, byProf) {
  for (const [prof, pop] of Object.entries(pops)) {
    const delta = (pop.satisfied - 0.5) * 10;  // упрощение
    pop.wealth = Math.max(0, Math.min(100, pop.wealth + delta / POP_WEALTH_INERTIA));
  }
}

// ─── Логика из economy.js (inline) ────────────────────────────

function calcHappinessMult(happiness) {
  return Math.max(0.5, 1 - Math.max(0, 50 - happiness) * CONFIG.BALANCE.HAPPINESS_TAX_MULT);
}

function calcTaxIncome(taxBase, happiness, buildingMult = 1.0) {
  return taxBase * TAX_CALIBRATION * calcHappinessMult(happiness) * buildingMult;
}

// ═══════════════════════════════════════════════════════════════
// INT_01: Корзина потребления — структура и диапазоны
// ═══════════════════════════════════════════════════════════════
console.log('\n=== INT_01: Корзина потребления — структура ===');

const basketPoor    = getConsumptionBasket(0);
const basketMiddle  = getConsumptionBasket(45);
const basketRich    = getConsumptionBasket(80);

assert('wheat' in basketPoor,   'Бедные потребляют пшеницу');
assert(!('wine' in basketPoor), 'Бедные не потребляют вино');
assert('timber' in basketMiddle,'Средние потребляют дерево');
assert('wine' in basketRich,    'Богатые потребляют вино');

// Монотонность: wheat убывает с ростом богатства
assert(basketPoor.wheat > basketMiddle.wheat, 'Пшеница: бедные > средние');
assert(basketMiddle.wheat > basketRich.wheat,  'Пшеница: средние > богатые');

// Wine растёт с ростом богатства (только 61+)
const b70 = getConsumptionBasket(70);
const b90 = getConsumptionBasket(90);
assert(b90.wine > b70.wine, 'Вино растёт с богатством');

// ═══════════════════════════════════════════════════════════════
// INT_02: Удовлетворённость ↔ нехватка товаров в запасе
// ═══════════════════════════════════════════════════════════════
console.log('\n=== INT_02: Удовлетворённость при нехватке ===');

// Создаём нацию с фермерами
const nation = {
  population: {
    total: 10000,
    happiness: 60,
    by_profession: { farmers: 8000, craftsmen: 2000 },
    pops: {
      farmers:   { wealth: POP_INITIAL_WEALTH.farmers,   satisfied: 0.75, income_last: 0 },
      craftsmen: { wealth: POP_INITIAL_WEALTH.craftsmen, satisfied: 0.75, income_last: 0 },
    },
  },
  economy: { stockpile: { wheat: 5000, timber: 200 } },
};

// Спрос
const demanded = calcNationBasketDemand(nation);
assert(demanded !== null, 'Спрос вычислен');
assert(demanded.wheat > 0, 'Есть спрос на пшеницу', `demand=${demanded.wheat?.toFixed(2)}`);

// Сценарий A: полные запасы → satisfied = 1.0
const fullConsumed = { ...demanded };
updatePopSatisfied(nation.population.pops, nation.population.by_profession, demanded, fullConsumed);
assert(nation.population.pops.farmers.satisfied === 1.0, 'Полные запасы → satisfied = 1.0');
assert(nation.population.pops.craftsmen.satisfied === 1.0, 'Полные запасы → craftsmen satisfied = 1.0');

// Сценарий B: нулевые запасы → satisfied = 0.0
const zeroConsumed = {};
updatePopSatisfied(nation.population.pops, nation.population.by_profession, demanded, zeroConsumed);
assert(nation.population.pops.farmers.satisfied < 0.1,
  'Нулевые запасы → satisfied близко к 0', `sat=${nation.population.pops.farmers.satisfied}`);

// ═══════════════════════════════════════════════════════════════
// INT_03: satisfied → wealth → изменение корзины
// ═══════════════════════════════════════════════════════════════
console.log('\n=== INT_03: satisfied → wealth → корзина ===');

// Восстанавливаем satisfied до 1.0 для теста богатства
updatePopSatisfied(nation.population.pops, nation.population.by_profession, demanded, fullConsumed);

const wealthBefore = nation.population.pops.farmers.wealth;
updatePopWealth(nation.population.pops, nation.population.by_profession);
const wealthAfter = nation.population.pops.farmers.wealth;

assert(wealthAfter >= wealthBefore, 'Высокий satisfied → богатство растёт или стабильно',
  `before=${wealthBefore.toFixed(2)}, after=${wealthAfter.toFixed(2)}`);

// При низком satisfied богатство снижается
nation.population.pops.craftsmen.satisfied = 0.0;
const craftWBefore = nation.population.pops.craftsmen.wealth;
updatePopWealth(nation.population.pops, nation.population.by_profession);
assert(nation.population.pops.craftsmen.wealth < craftWBefore,
  'Низкий satisfied (0) → богатство снижается');

// Богатство ограничено [0, 100]
nation.population.pops.craftsmen.wealth = 0;
nation.population.pops.craftsmen.satisfied = 0.0;
updatePopWealth(nation.population.pops, nation.population.by_profession);
assert(nation.population.pops.craftsmen.wealth >= 0, 'Богатство не опускается ниже 0');

// ═══════════════════════════════════════════════════════════════
// INT_04: Happiness → налоговый множитель (Economy ↔ Population)
// ═══════════════════════════════════════════════════════════════
console.log('\n=== INT_04: Счастье → налоговый доход ===');

const taxBase = 100000; // произвольная база

const taxH100 = calcTaxIncome(taxBase, 100);
const taxH50  = calcTaxIncome(taxBase, 50);
const taxH0   = calcTaxIncome(taxBase, 0);

assert(taxH100 === taxH50, 'Счастье ≥50 → множитель = 1.0 (нет штрафа)', `h100=${taxH100}, h50=${taxH50}`);
assert(taxH0   < taxH50,  'Счастье 0 → налоговый доход ниже', `h0=${taxH0.toFixed(0)}, h50=${taxH50}`);
assert(taxH0   >= taxH50 * 0.5, 'Налоговый доход не ниже 50% от нормы (MIN_MULT=0.5)',
  `h0=${taxH0.toFixed(0)}, h50=${taxH50}`);

// Монотонность: рост счастья → рост налогов
const taxH10  = calcTaxIncome(taxBase, 10);
const taxH30  = calcTaxIncome(taxBase, 30);
assert(taxH10 < taxH30, 'Счастье 10 < 30 → налог(10) < налог(30)');
assert(taxH30 < taxH50, 'Счастье 30 < 50 → налог(30) < налог(50)');

// ═══════════════════════════════════════════════════════════════
// INT_05: Полная цепочка — дефицит зерна → unhappy → налог падает
// ═══════════════════════════════════════════════════════════════
console.log('\n=== INT_05: Полная цепочка — дефицит → unhappy → налог ===');

function simulateFoodCrisis(turns) {
  const state = {
    happiness: 60,
    pops: {
      farmers: { wealth: POP_INITIAL_WEALTH.farmers, satisfied: 0.75, income_last: 0 },
    },
    byProf: { farmers: 10000 },
    stockpile: { wheat: 0 },  // нет зерна
    taxBase: 50000,
  };

  let taxHistory = [];
  for (let t = 0; t < turns; t++) {
    const dem = calcNationBasketDemand({
      population: { pops: state.pops, by_profession: state.byProf },
    });
    // Нет зерна → satisfied падает
    updatePopSatisfied(state.pops, state.byProf, dem, state.stockpile);
    updatePopWealth(state.pops, state.byProf);

    // Счастье зависит от satisfied (упрощённо)
    const avgSat = state.pops.farmers.satisfied;
    state.happiness = Math.max(0, state.happiness - (1 - avgSat) * 3);

    const tax = calcTaxIncome(state.taxBase, state.happiness);
    taxHistory.push(tax);
  }
  return taxHistory;
}

const crisisHistory = simulateFoodCrisis(10);
const firstTax = crisisHistory[0];
const lastTax  = crisisHistory[crisisHistory.length - 1];
assert(lastTax < firstTax, 'Продовольственный кризис → налог падает',
  `first=${firstTax.toFixed(0)}, last=${lastTax.toFixed(0)}`);
assert(lastTax > 0, 'Налог не обнуляется полностью (min mult=0.5)', `last=${lastTax.toFixed(0)}`);

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`ИТОГ: ${passed} ✓ прошли, ${failed} ✗ не прошли из ${passed + failed} тестов`);
if (failed === 0) { console.log('✅ Все тесты прошли!'); process.exit(0); }
else              { console.log('❌ Есть провалы — см. выше'); process.exit(1); }
