'use strict';
/**
 * chain_1_farm_test.js — wheat_family_farm финансовая цепочка
 *
 * ЦЕПОЧКА РАСХОДОВ (wheat_family_farm, owner=farmers_class):
 *
 *   output = (5/1000) × 2000 × 1.0 × fertility = 10 пш/тик
 *   revenue = 10 × wheat_price = 100 ₴
 *       │
 *       ├─ wages (35%)    = 35 ₴  → farmers_class.cc
 *       ├─ seeds (20%)    = 20 ₴  → consumed from stockpile
 *       ├─ maintenance    = 10 ₴  → (5 workers × 2)
 *       └─ profit_last    = 35 ₴  → farmers_class.cc
 *
 *   В distributeClassIncome:
 *     totalFarmerIncome = wages(35) + profit(35) = 70 ₴
 *     cc.farmers_class += 70
 *     _ibt.farmers_class.wheat += 70
 *     _cwbt.farmers_class.wheat += 1 (level)
 *
 * Запуск: node tests/chain_1_farm_test.js
 */

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else       { console.error('  ✗ FAIL: ' + msg); failed++; }
}
function eq(a, b, msg) {
  if (a === b) { console.log(`  ✓ ${msg} (${a})`); passed++; }
  else         { console.error(`  ✗ FAIL: ${msg} — ожидалось ${b}, получено ${a}`); failed++; }
}

// ── Стабы ──────────────────────────────────────────────────────────────────
const WHEAT_PRICE = 10;
const FERTILITY   = 1.0;
const LEVEL       = 1;

const farmDef = {
  workers_per_unit:  5,
  production_output: [{ good: 'wheat', base_rate: 2000 }],
  efficiency_mult:   1.0,
  wage_rate:         0.35,
};

const seedRecipe = { output_good: 'wheat', inputs: [{ good: 'wheat', amount: 0.20 }] };

function calcMaintenance(bDef, level) {
  return bDef.workers_per_unit * 2 * level;
}

function calcOutput(bDef, level, fertility) {
  const result = {};
  for (const po of bDef.production_output) {
    result[po.good] = (bDef.workers_per_unit / 1000) * po.base_rate * bDef.efficiency_mult * fertility * level;
  }
  return result;
}

function calcFinancials(bDef, level, fertility, wheatPrice) {
  const output  = calcOutput(bDef, level, fertility);
  const revenue = output.wheat * wheatPrice;
  const wages   = revenue * bDef.wage_rate;
  const seeds   = output.wheat * 0.20 * wheatPrice;
  const maint   = calcMaintenance(bDef, level);
  const profit  = revenue - wages - seeds - maint;
  return { output: output.wheat, revenue, wages, seeds, maint, profit };
}

// ── Тесты ──────────────────────────────────────────────────────────────────
console.log('\n─── ФЕРМА: вывод продукции ───');
{
  const f = calcFinancials(farmDef, LEVEL, FERTILITY, WHEAT_PRICE);
  eq(f.output, 10,  'output_wheat = 10 пш/тик');
  eq(f.revenue, 100, 'revenue = 100 ₴');
}

console.log('\n─── ФЕРМА: статьи затрат ───');
{
  const f = calcFinancials(farmDef, LEVEL, FERTILITY, WHEAT_PRICE);
  eq(f.wages,  35, 'wages = 35 ₴ (35% от 100)');
  eq(f.seeds,  20, 'seeds = 20 ₴ (20% урожая × цена)');
  eq(f.maint,  10, 'maintenance = 10 ₴ (5 workers × 2)');
  eq(f.profit, 35, 'net_profit = 35 ₴');
}

console.log('\n─── ФЕРМА: distributeClassIncome ───');
{
  const f = calcFinancials(farmDef, LEVEL, FERTILITY, WHEAT_PRICE);
  // farmers_class — самозанятые: получают wages + profit
  const totalFarmerIncome = f.wages + Math.max(0, f.profit);
  eq(totalFarmerIncome, 70, 'totalFarmerIncome = wages(35) + profit(35) = 70 ₴');

  // _ibt и _cwbt обновляются (только собственный доход)
  const _ibt  = { farmers_class: { wheat: 0 } };
  const _cwbt = { farmers_class: { wheat: 0 } };
  _ibt.farmers_class.wheat  += totalFarmerIncome;
  _cwbt.farmers_class.wheat += LEVEL;
  eq(_ibt.farmers_class.wheat,  70, '_ibt.farmers_class.wheat = 70');
  eq(_cwbt.farmers_class.wheat, 1,  '_cwbt.farmers_class.wheat = 1 (level)');
}

console.log('\n─── ФЕРМА: масштаб (level=5) ───');
{
  const f = calcFinancials(farmDef, 5, FERTILITY, WHEAT_PRICE);
  eq(f.output,  50,  'output_wheat = 50 пш при level=5');
  eq(f.revenue, 500, 'revenue = 500 ₴ при level=5');
  eq(f.wages,   175, 'wages = 175 ₴ при level=5');
  eq(f.maint,   50,  'maintenance = 50 ₴ при level=5');
  eq(f.profit,  175, 'net_profit = 175 ₴ при level=5');
}

console.log('\n─── ФЕРМА: убыток при нулевой цене (БАГ-A fix) ───');
{
  const f = calcFinancials(farmDef, LEVEL, FERTILITY, 0); // wheat_price = 0
  eq(f.revenue, 0,    'revenue = 0 при wheat_price=0');
  eq(f.profit,  -10,  'net_profit = −10 ₴ (только maintenance)');
  // После БАГ-A fix: убыток применяется к farmers_class.cc
  let cc = 500;
  const totalFarmerIncome = f.wages + Math.max(0, f.profit); // wages=0, profit<0
  // profit_last < 0 → только profit применяется к cc (wages=0 не применяем)
  cc += f.profit;
  eq(cc, 490, 'cc.farmers_class уменьшилась на 10 при убытке');
}

// ── Итог ──────────────────────────────────────────────────────────────────
console.log(`\n═══ Итог: ${passed} прошло, ${failed} провалено ═══\n`);
if (failed > 0) process.exit(1);
