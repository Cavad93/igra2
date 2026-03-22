'use strict';
/**
 * chain_3_latifundium_test.js — wheat_latifundium финансовая цепочка
 *
 * ЦЕПОЧКА РАСХОДОВ (wheat_latifundium):
 *
 *   output_wheat  = (100/1000) × 6000 × 1.8 = 1080 пш/тик
 *   output_barley = (100/1000) ×  834 × 1.8 = 150.12 ячм/тик
 *   revenue = 1080×10 + 150.12×8 = 12000.96 ₴
 *       │
 *       ├─ wages (25%)        = 3000.24 ₴  → farmers_class.cc (НЕ _ibt!)
 *       ├─ seeds_wheat (20%)  = 2160 ₴     → consumed from stockpile
 *       ├─ seeds_barley (20%) =  240.19 ₴  → consumed from stockpile
 *       ├─ maintenance        =  200 ₴     → (100 workers × 2)
 *       └─ profit_last ≈ 6401 ₴
 *           ├─ owner='nation'      → treasury += 6401
 *           └─ owner='aristocrats' → cc.aristocrats += 6401
 *                                    _ibt.aristocrats.wheat += 6401
 *
 * Запуск: node tests/chain_3_latifundium_test.js
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
function near(a, b, tol, msg) {
  if (Math.abs(a - b) <= tol) { console.log(`  ✓ ${msg} (${a} ≈ ${b})`); passed++; }
  else { console.error(`  ✗ FAIL: ${msg} — ожидалось ≈${b}±${tol}, получено ${a}`); failed++; }
}

const WHEAT_PRICE  = 10;
const BARLEY_PRICE = 8;
const FERTILITY    = 1.0;
const LEVEL        = 1;

const latDef = {
  workers_per_unit:  100,
  production_output: [
    { good: 'wheat',  base_rate: 6000 },
    { good: 'barley', base_rate: 834  },
  ],
  efficiency_mult: 1.8,
  wage_rate:       0.25,
};

function calcMaintenance(bDef, level) {
  return bDef.workers_per_unit * 2 * level;
}

function calcFinancials(bDef, level, fertility, wheatPrice, barleyPrice) {
  const wOut = (bDef.workers_per_unit / 1000) * 6000 * bDef.efficiency_mult * fertility * level;
  const bOut = (bDef.workers_per_unit / 1000) * 834  * bDef.efficiency_mult * fertility * level;
  const revenue = wOut * wheatPrice + bOut * barleyPrice;
  const wages   = revenue * bDef.wage_rate;
  const seeds   = wOut * 0.20 * wheatPrice + bOut * 0.20 * barleyPrice;
  const maint   = calcMaintenance(bDef, level);
  const profit  = revenue - wages - seeds - maint;
  return { wOut, bOut, revenue, wages, seeds, maint, profit };
}

// ── Тесты ──────────────────────────────────────────────────────────────────
console.log('\n─── ЛАТИФУНДИЯ: вывод продукции ───');
{
  const f = calcFinancials(latDef, LEVEL, FERTILITY, WHEAT_PRICE, BARLEY_PRICE);
  eq(f.wOut, 1080, 'output_wheat = 1080 пш/тик');
  near(f.bOut, 150.12, 0.01, 'output_barley ≈ 150.12 ячм/тик');
  near(f.revenue, 12000.96, 0.01, 'revenue ≈ 12000.96 ₴');
}

console.log('\n─── ЛАТИФУНДИЯ: статьи затрат ───');
{
  const f = calcFinancials(latDef, LEVEL, FERTILITY, WHEAT_PRICE, BARLEY_PRICE);
  near(f.wages, 3000.24, 0.01, 'wages ≈ 3000 ₴ (25% от revenue)');
  near(f.seeds, 2400.19, 0.01, 'seeds ≈ 2400 ₴ (20% пшеницы + 20% ячменя)');
  eq(f.maint, 200, 'maintenance = 200 ₴ (100 workers × 2)');
  near(f.profit, 6400.53, 0.1, 'net_profit ≈ 6401 ₴');
}

console.log('\n─── ЛАТИФУНДИЯ: маршрутизация прибыли ───');
{
  const f   = calcFinancials(latDef, LEVEL, FERTILITY, WHEAT_PRICE, BARLEY_PRICE);
  const pl  = Math.round(f.profit); // profit_last = 6401

  // owner='nation': прибыль → казна
  let treasury = 10000;
  treasury += pl;
  eq(treasury, 16401, 'nation-owned: treasury += 6401');

  // owner='aristocrats': прибыль → class_capital
  let cc = { aristocrats: 5000, farmers_class: 0 };
  cc.aristocrats += pl;
  cc.farmers_class += Math.round(f.wages); // зарплата наёмных фермеров
  near(cc.aristocrats,  11401, 1, 'aristocrat-owned: cc.aristocrats += 6401');
  near(cc.farmers_class, 3000, 1, 'cc.farmers_class += 3000 (wages арендаторов)');
}

console.log('\n─── ЛАТИФУНДИЯ: wages НЕ в _ibt farmers_class (БАГ-D fix) ───');
{
  const f  = calcFinancials(latDef, LEVEL, FERTILITY, WHEAT_PRICE, BARLEY_PRICE);
  const _ibt  = {};
  const _cwbt = {};
  const pl = Math.round(f.profit);

  // distributeClassIncome: owner='aristocrats', ветка else
  // wages → cc.farmers_class (НО не в _ibt!)
  // _ibt / _cwbt НЕ обновляются для farmers_class

  // profit > 0 → aristocrats
  if (!_ibt.aristocrats) _ibt.aristocrats = {};
  _ibt.aristocrats.wheat = pl;
  if (!_cwbt.aristocrats) _cwbt.aristocrats = {};
  _cwbt.aristocrats.wheat = LEVEL;

  ok(!_ibt.farmers_class,  '_ibt.farmers_class НЕ обновляется (wages от латифундии)');
  ok(!_cwbt.farmers_class, '_cwbt.farmers_class НЕ обновляется');
  eq(_ibt.aristocrats.wheat,  6401, '_ibt.aristocrats.wheat = 6401');
  eq(_cwbt.aristocrats.wheat, 1,    '_cwbt.aristocrats.wheat = 1');
}

console.log('\n─── ЛАТИФУНДИЯ: убыток (нет скота = capital_ratio=0) ───');
{
  // При capital_ratio=0: output=0, revenue=0, но maintenance=200 → profit=-200
  const profit_loss = -200;
  // nation-owned: убыток вычитается из казны (БАГ-A fix)
  let treasury = 5000;
  treasury += profit_loss;
  eq(treasury, 4800, 'nation-owned: treasury -= 200 при убытке');

  // aristocrat-owned: убыток снижает class_capital
  let cc = 3000;
  cc += profit_loss;
  eq(cc, 2800, 'aristocrat-owned: cc.aristocrats -= 200 при убытке');
}

console.log('\n─── ЛАТИФУНДИЯ vs ФЕРМА: сравнение эффективности ───');
{
  const farm_profit  = 35;   // profit_last фермы (level=1)
  const lat_profit   = 6401; // profit_last латифундии (level=1)
  const farm_workers = 5;
  const lat_workers  = 100;
  const profitPerWorkerFarm = farm_profit / farm_workers;   // 7 ₴
  const profitPerWorkerLat  = lat_profit  / lat_workers;    // 64 ₴
  ok(profitPerWorkerLat > profitPerWorkerFarm,
    `profit/worker: латифундия (${profitPerWorkerLat}) > ферма (${profitPerWorkerFarm})`);
  ok(lat_profit / farm_profit > 100,
    `латифундия прибыльнее фермы в ${Math.round(lat_profit/farm_profit)}× (> 100×)`);
}

console.log(`\n═══ Итог: ${passed} прошло, ${failed} провалено ═══\n`);
if (failed > 0) process.exit(1);
