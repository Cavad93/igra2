/**
 * tests/audit/eco_pops_integration_test.cjs
 *
 * Модуль: Экономика ↔ Население (Pops)
 * Тип: Integration-тест
 * Цель: проверка цепочки
 *   pop.wealth → getConsumptionBasket → calcNationBasketDemand
 *               → updatePopSatisfied → pop.satisfied
 *
 * Дополняет eco_integration_test.js (займы↔казна).
 *
 * Запуск: node tests/audit/eco_pops_integration_test.cjs
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function assertClose(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, msg, `got=${a.toFixed(5)}, expected≈${b.toFixed(5)}`);
}

// ─── Логика из engine/pops.js ─────────────────────────────────────────────────

function getConsumptionBasket(wealth) {
  const w = Math.max(0, Math.min(100, wealth));
  let grain;
  if (w <= 30)      grain = 0.8;
  else if (w <= 60) grain = 0.8 + (w - 30) / 30 * (0.6 - 0.8);
  else              grain = 0.6 + (w - 60) / 40 * (0.4 - 0.6);
  const basket = { wheat: Math.round(grain * 1000) / 1000 };
  if (w > 30) {
    basket.timber = Math.min(0.10, (w - 30) / 30 * 0.10);
    basket.timber = Math.round(basket.timber * 1000) / 1000;
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

function updatePopSatisfied(nation, demanded, actualConsumed) {
  const pops = nation.population.pops;
  const goodRatio = {};
  for (const [good, dem] of Object.entries(demanded)) {
    const actual    = actualConsumed[good] ?? 0;
    goodRatio[good] = dem > 0 ? Math.min(1.0, actual / dem) : 1.0;
  }
  for (const [prof, pop] of Object.entries(pops)) {
    const basket    = getConsumptionBasket(pop.wealth);
    let weightedSum = 0;
    let weightTotal = 0;
    for (const [good, amt] of Object.entries(basket)) {
      const ratio  = goodRatio[good] ?? 1.0;
      weightedSum += ratio * amt;
      weightTotal += amt;
    }
    pop.satisfied = weightTotal > 0
      ? Math.max(0, Math.min(1, weightedSum / weightTotal))
      : 1.0;
  }
}

// ─── TEST 1: бедная нация — только wheat ─────────────────────────────────────
console.log('\n=== TEST 1: Бедная нация (wealth≤30) → только wheat ===');
{
  const nation = {
    population: {
      by_profession: { farmers: 5000 },
      pops: { farmers: { wealth: 15, satisfied: 0.75, income_last: 0 } },
    },
  };
  const demand = calcNationBasketDemand(nation);
  assert(demand !== null,        'calcNationBasketDemand возвращает объект');
  assert('wheat' in demand,      'бедные требуют wheat');
  assert(!('wine' in demand),    'бедные НЕ требуют wine');
  assert(!('timber' in demand),  'бедные НЕ требуют timber');
  assertClose(demand.wheat, 4.0, 0.01, 'demand.wheat = 5000/1000 × 0.8 = 4.0');
}

// ─── TEST 2: богатая нация — полная корзина ───────────────────────────────────
console.log('\n=== TEST 2: Богатая нация (wealth=100) → полная корзина ===');
{
  const nation = {
    population: {
      by_profession: { merchants: 2000 },
      pops: { merchants: { wealth: 100, satisfied: 0.9, income_last: 0 } },
    },
  };
  const demand = calcNationBasketDemand(nation);
  assert('wheat'  in demand, 'богатые требуют wheat');
  assert('timber' in demand, 'богатые требуют timber');
  assert('tools'  in demand, 'богатые требуют tools');
  assert('wine'   in demand, 'богатые требуют wine');
  assertClose(demand.wheat, 0.8,  0.01, 'demand.wheat = 2×0.4 = 0.8');
  assertClose(demand.wine,  0.40, 0.01, 'demand.wine = 2×0.20 = 0.40');
}

// ─── TEST 3: updatePopSatisfied — полное удовлетворение ──────────────────────
console.log('\n=== TEST 3: updatePopSatisfied — полное удовлетворение ===');
{
  const nation = {
    population: {
      by_profession: { farmers: 10000 },
      pops: { farmers: { wealth: 15, satisfied: 0.5, income_last: 0 } },
    },
  };
  updatePopSatisfied(nation, { wheat: 8.0 }, { wheat: 8.0 });
  assertClose(nation.population.pops.farmers.satisfied, 1.0, 0.001,
    'при полном потреблении satisfied=1.0');
}

// ─── TEST 4: updatePopSatisfied — 50% потребление ────────────────────────────
console.log('\n=== TEST 4: updatePopSatisfied — частичное удовлетворение ===');
{
  const nation = {
    population: {
      by_profession: { farmers: 10000 },
      pops: { farmers: { wealth: 15, satisfied: 1.0, income_last: 0 } },
    },
  };
  updatePopSatisfied(nation, { wheat: 8.0 }, { wheat: 4.0 });
  assertClose(nation.population.pops.farmers.satisfied, 0.5, 0.001,
    '50% потребление wheat → satisfied=0.5');
}

// ─── TEST 5: updatePopSatisfied — полный дефицит ─────────────────────────────
console.log('\n=== TEST 5: updatePopSatisfied — полный дефицит ===');
{
  const nation = {
    population: {
      by_profession: { farmers: 10000 },
      pops: { farmers: { wealth: 15, satisfied: 0.8, income_last: 0 } },
    },
  };
  updatePopSatisfied(nation, { wheat: 8.0 }, { wheat: 0 });
  assertClose(nation.population.pops.farmers.satisfied, 0.0, 0.001,
    'нулевое потребление → satisfied=0.0');
}

// ─── TEST 6: бедные тратят больше wheat, чем богатые ─────────────────────────
console.log('\n=== TEST 6: wealth → спрос: богатые тратят меньше wheat ===');
{
  const poor = calcNationBasketDemand({
    population: {
      by_profession: { farmers: 10000 },
      pops: { farmers: { wealth: 10, satisfied: 0.75, income_last: 0 } },
    },
  });
  const rich = calcNationBasketDemand({
    population: {
      by_profession: { merchants: 10000 },
      pops: { merchants: { wealth: 90, satisfied: 0.9, income_last: 0 } },
    },
  });
  assert(poor.wheat > rich.wheat,
    'бедная нация потребляет больше wheat чем богатая',
    `poor=${poor.wheat.toFixed(3)}, rich=${rich.wheat.toFixed(3)}`);
  assert(!poor.wine && rich.wine > 0, 'только богатые требуют wine');
}

// ─── TEST 7: агрегация по профессиям ─────────────────────────────────────────
console.log('\n=== TEST 7: агрегация спроса по нескольким профессиям ===');
{
  const nation = {
    population: {
      by_profession: { farmers: 5000, merchants: 5000 },
      pops: {
        farmers:   { wealth: 15,  satisfied: 0.75, income_last: 0 },
        merchants: { wealth: 100, satisfied: 0.9,  income_last: 0 },
      },
    },
  };
  const demand = calcNationBasketDemand(nation);
  // farmers: 5×0.8=4.0; merchants: 5×0.4=2.0 → 6.0
  assertClose(demand.wheat, 6.0, 0.01, 'wheat: 4.0 + 2.0 = 6.0');
  // wine только merchants: 5×0.20=1.0
  assertClose(demand.wine, 1.0, 0.01, 'wine только merchants: 5×0.20=1.0');
}

// ─── Итог ────────────────────────────────────────────────────────────────────
console.log(`\n─── Итог: ${passed} passed, ${failed} failed ───`);
if (failed > 0) process.exit(1);
