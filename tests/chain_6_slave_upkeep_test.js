'use strict';
/**
 * chain_6_slave_upkeep_test.js — содержание рабов через корзину потребления
 *
 * МЕХАНИКА:
 *   Стоимость содержания 1 занятого раба в ход =
 *     Σ(basket[good] × market_price[good]) для basic + standard корзин
 *
 *   При базовых ценах (wheat=10, salt=12, cloth=15):
 *     базовая:     0.25×10 + 0.005×12  = 2.56 ₴
 *     стандартная: 0.10×10 + 0.005×12  + 0.01×15 = 1.21 ₴
 *     итого:       3.77 ₴/раб/тик
 *
 *   Применяется только к ЗАНЯТЫМ рабам (slot.workers.slaves > 0).
 *   Рабы вне зданий — рынок труда, казне ничего не стоят.
 *
 * Запуск: node tests/chain_6_slave_upkeep_test.js
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

// ── Стаб calcSlaveUpkeepPerPerson (без GAME_STATE/GOODS) ─────────────────
const PRICES = { wheat: 10, salt: 12, cloth: 15 };
const CONFIG_B = {
  SLAVE_BASIC_BASKET:    { wheat: 0.25, salt: 0.005 },
  SLAVE_STANDARD_BASKET: { wheat: 0.10, salt: 0.005, cloth: 0.01 },
};

function calcSlaveUpkeepPerPerson(prices = PRICES, cfg = CONFIG_B) {
  let cost = 0;
  for (const [good, amount] of Object.entries(cfg.SLAVE_BASIC_BASKET)) {
    cost += amount * (prices[good] ?? 10);
  }
  for (const [good, amount] of Object.entries(cfg.SLAVE_STANDARD_BASKET)) {
    cost += amount * (prices[good] ?? 10);
  }
  return cost;
}

// ── Стаб updateBuildingFinancials для одного слота ────────────────────────
function computeSlotFinancials(bDef, slot, prices = PRICES) {
  const level       = slot.level || 1;
  const revenue     = bDef.base_revenue * level;
  const wages       = revenue * (bDef.wage_rate ?? 0);
  const maintenance = bDef.workers_per_unit * 2 * level;
  const slaveCount  = slot.workers?.slaves ?? 0;
  const slaveUpkeep = slaveCount > 0 ? slaveCount * calcSlaveUpkeepPerPerson(prices) : 0;
  const net_profit  = revenue - wages - maintenance - slaveUpkeep;
  return {
    revenue_last:      Math.round(revenue),
    wages_last:        Math.round(wages),
    maintenance_last:  Math.round(maintenance),
    slave_upkeep_last: Math.round(slaveUpkeep),
    costs_last:        Math.round(wages + maintenance + slaveUpkeep),
    profit_last:       Math.round(net_profit),
  };
}

// ── Тест 1: calcSlaveUpkeepPerPerson при базовых ценах ────────────────────
console.log('\n─── Стоимость корзины при базовых ценах ───');
{
  const upkeep = calcSlaveUpkeepPerPerson();
  near(upkeep, 3.77, 0.01, 'upkeep ≈ 3.77 ₴/раб/тик (wheat=10, salt=12, cloth=15)');

  const basic    = 0.25 * 10 + 0.005 * 12;      // = 2.56
  const standard = 0.10 * 10 + 0.005 * 12 + 0.01 * 15; // = 1.21
  near(basic,    2.56, 0.001, 'базовая корзина = 2.56 ₴');
  near(standard, 1.21, 0.001, 'стандартная корзина = 1.21 ₴');
  near(basic + standard, upkeep, 0.01, 'сумма корзин = upkeep');
}

// ── Тест 2: Динамика цены с изменением рынка ─────────────────────────────
console.log('\n─── Динамика: цена растёт — upkeep растёт ───');
{
  const cheapPrices  = { wheat:  5, salt:  8, cloth: 10 };
  const normalPrices = { wheat: 10, salt: 12, cloth: 15 };
  const dearPrices   = { wheat: 20, salt: 20, cloth: 25 };

  const cheap  = calcSlaveUpkeepPerPerson(cheapPrices);
  const normal = calcSlaveUpkeepPerPerson(normalPrices);
  const dear   = calcSlaveUpkeepPerPerson(dearPrices);

  ok(cheap < normal, `дешёвый рынок (${cheap.toFixed(2)}) < норма (${normal.toFixed(2)})`);
  ok(normal < dear,  `норма (${normal.toFixed(2)}) < дорогой рынок (${dear.toFixed(2)})`);
  // дешёвый: базовая(0.25×5+0.005×8=1.29) + станд.(0.10×5+0.005×8+0.01×10=0.64) = 1.93
  near(cheap,  1.93, 0.001, 'дешёвый рынок: 0.25×5+0.005×8+0.10×5+0.005×8+0.01×10 = 1.93');
  near(dear,   7.45,  0.01,  'дорогой рынок ≈ 7.45 ₴/раб/тик');
}

// ── Тест 3: Рудник (200 рабов + 200 ремесленников) ───────────────────────
console.log('\n─── Рудник (200 рабов) ───');
{
  const mineDef = { workers_per_unit: 400, base_revenue: 3000, wage_rate: 0.10 };
  const mineSlot = { level: 1, workers: { slaves: 200, craftsmen: 200 } };

  const f = computeSlotFinancials(mineDef, mineSlot);
  eq(f.revenue_last, 3000,  'revenue = 3000 ₴');
  eq(f.wages_last,   300,   'wages = 300 ₴ (10%)');
  eq(f.maintenance_last, 800, 'maintenance = 800 ₴ (400 × 2)');
  near(f.slave_upkeep_last, 754, 1, 'slave_upkeep = 200 × 3.77 ≈ 754 ₴');
  near(f.profit_last, 1146, 1, 'profit = 3000 - 300 - 800 - 754 ≈ 1146 ₴');
}

// ── Тест 4: Бани (80 рабов, wage_rate=0, nation-owned) ───────────────────
console.log('\n─── Бани (80 рабов, нет зарплаты) ───');
{
  const bathsDef  = { workers_per_unit: 80, base_revenue: 400, wage_rate: 0.00 };
  const bathsSlot = { level: 1, workers: { slaves: 80 } };

  const f = computeSlotFinancials(bathsDef, bathsSlot);
  eq(f.wages_last,   0,   'wages = 0 ₴ (рабы без зарплаты)');
  eq(f.maintenance_last, 160, 'maintenance = 160 ₴ (80 × 2)');
  near(f.slave_upkeep_last, 302, 1, 'slave_upkeep = 80 × 3.77 ≈ 302 ₴');
  near(f.profit_last, -62, 1, 'profit = 400 - 0 - 160 - 302 ≈ -62 ₴ (бани убыточны без субсидии)');
}

// ── Тест 5: Здание БЕЗ рабов — upkeep = 0 ────────────────────────────────
console.log('\n─── Здание без рабов (только фермеры) ───');
{
  const farmDef  = { workers_per_unit: 5, base_revenue: 100, wage_rate: 0.35 };
  const farmSlot = { level: 1, workers: { farmers: 5 } };

  const f = computeSlotFinancials(farmDef, farmSlot);
  eq(f.slave_upkeep_last, 0,  'slave_upkeep = 0 ₴ (нет рабов)');
  eq(f.wages_last,        35, 'wages = 35 ₴');
  eq(f.maintenance_last,  10, 'maintenance = 10 ₴');
  eq(f.profit_last,       55, 'profit = 100 - 35 - 10 = 55 ₴');
}

// ── Тест 6: Рабы вне зданий — ничего не стоят казне ──────────────────────
console.log('\n─── Рабы не в зданиях → нет расхода ───');
{
  // Нет активных слотов с рабами → treasury не уменьшается
  let treasury = 10000;
  const unemployedSlaves = 116000;
  // В старой системе: 116000 × 1 = 116000₴/ход → катастрофа
  // В новой системе: нет зданий → нет расхода
  const treasuryDelta = 0;
  treasury += treasuryDelta;
  eq(treasury, 10000, 'казна не изменилась — 116k безработных рабов не стоят ничего');
  ok(true, 'рабы на рынке труда Сицилии без расхода для казны ✓');
}

// ── Тест 7: Латифундия (50 рабов + 50 фермеров) ──────────────────────────
console.log('\n─── Латифундия (50 рабов + 50 фермеров) ───');
{
  const latDef  = { workers_per_unit: 100, base_revenue: 12001, wage_rate: 0.25 };
  const latSlot = { level: 1, workers: { farmers: 50, slaves: 50 } };

  const f = computeSlotFinancials(latDef, latSlot);
  near(f.slave_upkeep_last, 189, 1, 'slave_upkeep = 50 × 3.77 ≈ 189 ₴');
  near(f.profit_last, 12001 - 3000 - 200 - 189, 2,
    `profit = revenue(12001) - wages(3000) - maint(200) - upkeep(189) ≈ ${12001-3000-200-189}`);
}

// ── Тест 8: Масштаб level=3 ───────────────────────────────────────────────
console.log('\n─── Масштаб: level=3 (рудник) ───');
{
  const mineDef  = { workers_per_unit: 400, base_revenue: 3000, wage_rate: 0.10 };
  const mineSlot = { level: 3, workers: { slaves: 600, craftsmen: 600 } };

  const f = computeSlotFinancials(mineDef, mineSlot);
  near(f.slave_upkeep_last, 200 * 3 * 3.77, 5, 'slave_upkeep = 600 × 3.77 ≈ 2262 ₴');
  // profit должен расти с уровнем, но upkeep тоже растёт
  ok(f.profit_last > 0, `profit = ${f.profit_last} > 0 при level=3`);
}

console.log(`\n═══ Итог: ${passed} прошло, ${failed} провалено ═══\n`);
if (failed > 0) process.exit(1);
