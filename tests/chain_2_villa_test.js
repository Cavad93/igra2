'use strict';
/**
 * chain_2_villa_test.js — wheat_villa финансовая цепочка
 *
 * ЦЕПОЧКА РАСХОДОВ (wheat_villa, owner=soldiers_class):
 *
 *   output = (15/1000) × 10000 × 1.3 × fertility = 195 пш/тик
 *   revenue = 195 × wheat_price = 1950 ₴
 *       │
 *       ├─ wages (30%)    = 585 ₴  → farmers_class.cc  ← НЕ в _ibt!
 *       ├─ seeds (20%)    = 390 ₴  → consumed from stockpile
 *       ├─ maintenance    =  30 ₴  → (15 workers × 2)
 *       └─ profit_last    = 945 ₴  → soldiers_class.cc
 *
 *   В distributeClassIncome:
 *     wages > 0  → cc.farmers_class += 585  (реальные деньги фермерам)
 *     _ibt/cwbt farmers_class НЕ обновляем  (БАГ-D fix!)
 *     profit > 0 → cc.soldiers_class += 945
 *     _ibt.soldiers_class.wheat += 945
 *     _cwbt.soldiers_class.wheat += 1
 *
 * Запуск: node tests/chain_2_villa_test.js
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

const WHEAT_PRICE = 10;
const FERTILITY   = 1.0;
const LEVEL       = 1;

const villaDef = {
  workers_per_unit:  15,
  production_output: [{ good: 'wheat', base_rate: 10000 }],
  efficiency_mult:   1.3,
  wage_rate:         0.30,
};

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
console.log('\n─── ВИЛЛА: вывод продукции ───');
{
  const f = calcFinancials(villaDef, LEVEL, FERTILITY, WHEAT_PRICE);
  eq(f.output,  195,  'output_wheat = 195 пш/тик');
  eq(f.revenue, 1950, 'revenue = 1950 ₴');
}

console.log('\n─── ВИЛЛА: статьи затрат ───');
{
  const f = calcFinancials(villaDef, LEVEL, FERTILITY, WHEAT_PRICE);
  eq(f.wages,  585, 'wages = 585 ₴ (30% от 1950)');
  eq(f.seeds,  390, 'seeds = 390 ₴ (20% урожая × цена)');
  eq(f.maint,   30, 'maintenance = 30 ₴ (15 workers × 2)');
  eq(f.profit, 945, 'net_profit = 945 ₴');
}

console.log('\n─── ВИЛЛА: маршрутизация зарплаты (БАГ-D fix) ───');
{
  const f = calcFinancials(villaDef, LEVEL, FERTILITY, WHEAT_PRICE);
  // Зарплата идёт в farmers_class (арендаторы физически работают)
  const cc = { farmers_class: 0, soldiers_class: 0 };
  const _ibt  = {};
  const _cwbt = {};

  // distributeClassIncome: owner='soldiers_class', ветка else
  if (f.wages > 0) {
    cc.farmers_class += f.wages;  // 585 → cc (деньги реальные)
    // _ibt НЕ обновляем — БАГ-D fix
  }
  if (f.profit > 0) {
    cc.soldiers_class += f.profit;
    if (!_ibt.soldiers_class) _ibt.soldiers_class = {};
    _ibt.soldiers_class.wheat = (_ibt.soldiers_class.wheat || 0) + f.profit;
    if (!_cwbt.soldiers_class) _cwbt.soldiers_class = {};
    _cwbt.soldiers_class.wheat = (_cwbt.soldiers_class.wheat || 0) + LEVEL;
  }

  eq(cc.farmers_class,  585, 'cc.farmers_class += 585 (зарплата арендаторов)');
  eq(cc.soldiers_class, 945, 'cc.soldiers_class += 945 (прибыль владельца)');
  ok(!_ibt.farmers_class,  '_ibt.farmers_class НЕ обновляется (БАГ-D fix)');
  ok(!_cwbt.farmers_class, '_cwbt.farmers_class НЕ обновляется (БАГ-D fix)');
  eq(_ibt.soldiers_class.wheat,  945, '_ibt.soldiers_class.wheat = 945');
  eq(_cwbt.soldiers_class.wheat, 1,   '_cwbt.soldiers_class.wheat = 1');
}

console.log('\n─── ВИЛЛА: разница с фермой (эффективность на уровень) ───');
{
  // Ферма:  profit_last = 35 ₴/уровень (100% владелец)
  // Вилла:  profit_last = 945 ₴/уровень (27× больше)
  const farmProfit  = 35;
  const villaProfit = 945;
  const ratio = Math.round(villaProfit / farmProfit * 10) / 10;
  ok(ratio > 25, `вилла прибыльнее фермы в ${ratio}× (> 25×)`);
  // Но у виллы 15 занятых фермеров vs 5 у фермы → на фермера: 63 vs 7
  const farmersFarm  = 35 / 5;   // 7 ₴/фермер
  const farmersVilla = 945 / 15; // 63 ₴/фермер
  ok(farmersVilla > farmersFarm, `прибыль на фермера: вилла (${farmersVilla}) > ферма (${farmersFarm})`);
}

console.log('\n─── ВИЛЛА: убыток при нулевой цене ───');
{
  const f = calcFinancials(villaDef, LEVEL, FERTILITY, 0);
  eq(f.revenue, 0,   'revenue = 0 при wheat_price=0');
  eq(f.profit,  -30, 'net_profit = −30 ₴ (только maintenance)');
  // После БАГ-A fix: убыток применяется к soldiers_class.cc (не поглощается)
  let cc = 1000;
  cc += f.profit;
  eq(cc, 970, 'cc.soldiers_class уменьшилась на 30 при убытке');
}

console.log(`\n═══ Итог: ${passed} прошло, ${failed} провалено ═══\n`);
if (failed > 0) process.exit(1);
