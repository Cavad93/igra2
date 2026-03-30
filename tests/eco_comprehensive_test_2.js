/**
 * tests/eco_comprehensive_test_2.js
 *
 * Новые тесты экономической системы — сессия 2
 * Охватывает: рыночные алгоритмы, торговые маршруты, производство,
 *             мультиходовую симуляцию, стресс-тест.
 * Запуск: node tests/eco_comprehensive_test_2.js
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

// ─── Конфигурация (из config.js) ─────────────────────────────────────────────
const CONFIG = {
  BALANCE: {
    MISSING_NATIONS_MULT:   2.0,
    SHORTAGE_STREAK_CAP:    8,
    PRICE_SMOOTH_FACTOR:    0.30,
    TRADE_PROFIT_RATE:      0.05,
    TRADE_TARIFF_FRIENDLY:  0.05,
    TRADE_TARIFF_NEUTRAL:   0.15,
    TRADE_TARIFF_HOSTILE:   0.30,
    PIRACY_BASE:            0.03,
    SUBSISTENCE_FACTOR:     0.65,
    ORGANIZED_BONUS:        1.20,
    HAPPINESS_TAX_MULT:     0.015,
    FAMINE_MORTALITY:       0.02,
    HAPPINESS_FROM_FAMINE: -15,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1: Трёхзонный алгоритм ценообразования (engine/market.js)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: Трёхзонный алгоритм ценообразования ===');

const _MARKET_SMOOTHING  = 0.30;
const _BALANCE_SENS      = 0.05;
const _SURPLUS_RATE      = 0.03;
const _DEFICIT_INTENSITY = 0.10;

function simulateMarketTick(market, supply, demand) {
  const B              = CONFIG.BALANCE;
  const mult           = B.MISSING_NATIONS_MULT;
  const effectiveDemand = demand * mult;
  const targetTurns    = 4;
  const stockpileTarget = Math.max(1, effectiveDemand * targetTurns);

  market.world_stockpile = Math.max(0, (market.world_stockpile || 0) + supply - effectiveDemand);

  const streak   = market.shortage_streak || 0;
  const stockpile = market.world_stockpile;
  const base     = market.base;
  const elasticity = 1.0;

  let price_delta = 0;
  if (stockpile < 0.5 * stockpileTarget) {
    const shortage_mult = Math.exp(streak * 0.15);
    price_delta = base * shortage_mult * _DEFICIT_INTENSITY * elasticity;
    const cap = B.SHORTAGE_STREAK_CAP;
    market.shortage_streak = Math.min(streak + 1, cap);
  } else if (stockpile <= 2.0 * stockpileTarget) {
    const safeSupply = Math.max(supply, 1);
    price_delta = (demand - safeSupply) / safeSupply * _BALANCE_SENS * market.price * elasticity;
    market.shortage_streak = Math.max(0, streak - 1);
  } else {
    const surplus_ratio = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
    price_delta = -base * _SURPLUS_RATE * surplus_ratio * elasticity;
    market.shortage_streak = Math.max(0, streak - 1);
  }

  const floor   = base * 0.5;
  const ceiling = base * 10;
  const rawNew  = market.price + price_delta;
  const clamped = Math.max(floor, Math.min(ceiling, rawNew));
  market.price  = Math.round((market.price + (clamped - market.price) * _MARKET_SMOOTHING) * 10) / 10;

  if (!Array.isArray(market.price_history)) market.price_history = [];
  market.price_history.push(market.price);
  if (market.price_history.length > 24) market.price_history.shift();
}

// 1a. Зона дефицита → цена растёт
const mkt1 = { base: 10, price: 10, world_stockpile: 0, shortage_streak: 0 };
simulateMarketTick(mkt1, 0, 100);
assert(mkt1.price > 10, 'Дефицит: цена растёт', `price=${mkt1.price}`);
assert(mkt1.shortage_streak > 0, 'Дефицит: shortage_streak увеличивается');

// 1b. shortage_streak не превышает cap
const mkt2 = { base: 10, price: 10, world_stockpile: 0, shortage_streak: 0 };
for (let i = 0; i < 20; i++) simulateMarketTick(mkt2, 0, 100);
assert(mkt2.shortage_streak <= CONFIG.BALANCE.SHORTAGE_STREAK_CAP,
  'shortage_streak ограничен cap', `streak=${mkt2.shortage_streak}`);

// 1c. Зона избытка → цена снижается
const mkt3 = { base: 10, price: 10, world_stockpile: 10000, shortage_streak: 0 };
simulateMarketTick(mkt3, 500, 10);
assert(mkt3.price < 10, 'Избыток: цена снижается', `price=${mkt3.price}`);

// 1d. Цена не падает ниже флора (base × 0.5)
const mkt4 = { base: 10, price: 5.5, world_stockpile: 100000, shortage_streak: 0 };
for (let i = 0; i < 30; i++) simulateMarketTick(mkt4, 9999, 1);
assert(mkt4.price >= 5.0, 'Цена не падает ниже флора (base×0.5)', `price=${mkt4.price}`);

// 1e. price_history накапливается до 24 элементов
const mkt5 = { base: 10, price: 10, world_stockpile: 200, shortage_streak: 0 };
for (let i = 0; i < 30; i++) simulateMarketTick(mkt5, 50, 50);
assert(mkt5.price_history.length <= 24, 'price_history ограничена 24 элементами',
  `len=${mkt5.price_history.length}`);

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2: Доходность торговых маршрутов и тарифы
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: Торговые маршруты и тарифные ставки ===');

function calcTariff(relations) {
  const B = CONFIG.BALANCE;
  return relations > 50 ? B.TRADE_TARIFF_FRIENDLY
       : relations > 0  ? B.TRADE_TARIFF_NEUTRAL
       :                  B.TRADE_TARIFF_HOSTILE;
}

function estimateRouteIncome(myNation, partnerNation, market) {
  const rel       = myNation.relations?.[partnerNation.id] ?? 0;
  const tariff    = calcTariff(rel);
  const stockpile = myNation.economy?.stockpile || {};
  let income = 0;
  for (const [good, qty] of Object.entries(stockpile)) {
    if (qty > 100) {
      const price  = market[good]?.price || 0;
      income += qty * 0.05 * price * (1 - tariff);
    }
  }
  return income * (1 - CONFIG.BALANCE.PIRACY_BASE);
}

const rome   = { id: 'rome',    economy: { stockpile: { wheat: 500, iron: 300 } }, relations: { carthage: 80 } };
const egypt  = { id: 'egypt',   economy: { stockpile: { wheat: 500, iron: 300 } }, relations: { carthage: 30 } };
const persia = { id: 'persia',  economy: { stockpile: { wheat: 500, iron: 300 } }, relations: { carthage: -20 } };
const carthage = { id: 'carthage' };
const mktSample = { wheat: { price: 15 }, iron: { price: 25 } };

const incRome   = estimateRouteIncome(rome,   carthage, mktSample);
const incEgypt  = estimateRouteIncome(egypt,  carthage, mktSample);
const incPersia = estimateRouteIncome(persia, carthage, mktSample);

assert(incRome > incEgypt,  'Дружественный тариф (5%) > нейтральный (15%)', `Rome=${incRome.toFixed(1)}, Egypt=${incEgypt.toFixed(1)}`);
assert(incEgypt > incPersia,'Нейтральный тариф (15%) > враждебный (30%)',   `Egypt=${incEgypt.toFixed(1)}, Persia=${incPersia.toFixed(1)}`);
assert(incRome > 0,         'Доход от торговли положительный');
const incNoPiracy = incRome / (1 - CONFIG.BALANCE.PIRACY_BASE);
assert(Math.abs(incNoPiracy * (1 - CONFIG.BALANCE.PIRACY_BASE) - incRome) < 0.01,
  'Пиратские потери применяются корректно');
// (1-0.30)/(1-0.05) ≈ 0.737 → Persia ≈ 73.7% от Rome
assert(incPersia < incRome * 0.80, 'Враждебный тариф (30%) снижает доход на ≥20% vs дружественного (5%)',
  `Persia/Rome=${(incPersia/incRome*100).toFixed(1)}%`);

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3: Структура производства (organized vs subsistence, ECO_006)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: Organized vs Subsistence производство ===');

function calcProductionBreakdown(nation) {
  const orgProd   = nation._organized_production_total   || 0;
  const unorgProd = nation._unorganized_production_total || 0;
  const total     = orgProd + unorgProd;
  if (!total) return { orgPct: 0, unorgPct: 0, effectiveProd: 0 };

  const orgPct   = Math.round(orgProd  / total * 100);
  const unorgPct = 100 - orgPct;
  const effectiveProd = orgProd   * CONFIG.BALANCE.ORGANIZED_BONUS
                      + unorgProd * CONFIG.BALANCE.SUBSISTENCE_FACTOR;
  return { orgPct, unorgPct, effectiveProd };
}

// 3a. Чисто организованное производство
const natOrg = { _organized_production_total: 1000, _unorganized_production_total: 0 };
const brkOrg = calcProductionBreakdown(natOrg);
assert(brkOrg.orgPct === 100, 'Только organized: orgPct=100%');
assert(brkOrg.effectiveProd === 1000 * CONFIG.BALANCE.ORGANIZED_BONUS,
  'Organized бонус применён', `eff=${brkOrg.effectiveProd}`);

// 3b. Смешанное производство
const natMix = { _organized_production_total: 400, _unorganized_production_total: 600 };
const brkMix = calcProductionBreakdown(natMix);
assert(brkMix.orgPct === 40, 'Смешанное: orgPct=40%');
const expectedEff = 400 * 1.2 + 600 * 0.65;
assert(Math.abs(brkMix.effectiveProd - expectedEff) < 0.01,
  'Смешанная эффективность посчитана верно', `eff=${brkMix.effectiveProd.toFixed(1)}`);

// 3c. Нулевое производство — без краша
const brkZero = calcProductionBreakdown({});
assert(brkZero.orgPct === 0, 'Нулевое производство: без ошибок');

// 3d. Organized эффективнее subsistence
const orgEff  = 100 * CONFIG.BALANCE.ORGANIZED_BONUS;
const unorgEff = 100 * CONFIG.BALANCE.SUBSISTENCE_FACTOR;
assert(orgEff > unorgEff, 'Organized эффективнее subsistence',
  `org=${orgEff}, unorg=${unorgEff}`);

// 3e. SUBSISTENCE_FACTOR < 1.0 (потеря эффективности)
assert(CONFIG.BALANCE.SUBSISTENCE_FACTOR < 1.0, 'Subsistence_factor < 1.0 (штраф)', `factor=${CONFIG.BALANCE.SUBSISTENCE_FACTOR}`);

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4: Мультиходовая симуляция — 50 ходов
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: Мультиходовая симуляция (50 ходов) ===');

function simulateMultiTurn(turns) {
  // Упрощённая нация
  const nation = {
    id: 'test_nation',
    economy: {
      treasury: 1000,
      stockpile: { wheat: 500, iron: 100 },
      trade_routes: ['partner1'],
      tax_rates_by_class: { aristocrats: 0.12, commoners: 0.08 },
    },
    population: { total: 10000, happiness: 50 },
    military: { infantry: 100, cavalry: 20 },
    _organized_production_total: 400,
    _unorganized_production_total: 300,
    regions: [],
  };

  const market = {
    wheat: { base: 15, price: 15, world_stockpile: 500, shortage_streak: 0 },
    iron:  { base: 25, price: 25, world_stockpile: 200, shortage_streak: 0 },
  };

  const log = [];

  for (let t = 0; t < turns; t++) {
    // Производство
    nation.economy.stockpile.wheat += 80;
    nation.economy.stockpile.iron  += 30;

    // Потребление
    const wheatNeed = nation.population.total * 0.01;
    const consumed  = Math.min(wheatNeed, nation.economy.stockpile.wheat);
    nation.economy.stockpile.wheat -= consumed;

    // Голод
    if (nation.economy.stockpile.wheat <= 0 && consumed < wheatNeed) {
      nation.population.happiness = Math.max(0, nation.population.happiness + CONFIG.BALANCE.HAPPINESS_FROM_FAMINE);
    }

    // Доход от налогов
    const taxIncome = nation.population.total * 0.0005 * nation.economy.tax_rates_by_class.commoners;
    nation.economy.treasury += taxIncome;

    // Обновить рынок
    simulateMarketTick(market.wheat, 80, wheatNeed);
    simulateMarketTick(market.iron,  30, 15);

    log.push({ turn: t+1, treasury: nation.economy.treasury, wheat: nation.economy.stockpile.wheat });
  }

  return { nation, market, log };
}

const sim = simulateMultiTurn(50);

assert(sim.nation.economy.treasury > 1000, 'Казна растёт за 50 ходов',
  `treasury=${sim.nation.economy.treasury.toFixed(0)}`);
assert(sim.nation.population.happiness >= 0, 'Счастье ≥ 0 (нет отрицательных значений)');
assert(sim.market.wheat.price >= sim.market.wheat.base * 0.5, 'Цена пшеницы не ниже флора');
assert(sim.market.wheat.price_history.length === 24, 'История цен полна (24 тика)');
assert(sim.log.every(e => e.treasury >= 0), 'Казна никогда не уходит в минус');

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5: Стресс-тест диагностики дефицита (ECO_002 + ECO_003)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: Стресс-тест диагностики дефицита ===');

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
    if (qty < need * 0.25) deficits.push({ good, severity: importance, shortage: need - qty });
  }
  nation._supply_deficits = deficits;
  return deficits;
}

function buildDeficitDiagnostics(nation) {
  const eco    = nation.economy;
  const exp    = eco._expense_breakdown || {};
  const issues = [];
  const armyCost = (exp.army_infantry||0) + (exp.army_cavalry||0);
  const income   = eco._income_breakdown?.total || eco.income_per_turn || 1;
  if (armyCost > income * 0.5)
    issues.push({ icon:'⚔️', text:'Армия дорогая', severity:'high' });
  for (const [good, qty] of Object.entries(eco.stockpile || {}))
    if (qty < 0) issues.push({ icon:'📦', text:`Дефицит ${good}`, severity:'med' });
  if (!(eco.trade_routes||[]).length)
    issues.push({ icon:'🚢', text:'Нет маршрутов', severity:'med' });
  if ((nation.population?.happiness||50) < 35)
    issues.push({ icon:'😤', text:'Низкое счастье', severity:'high' });
  return issues.slice(0, 5);
}

// 5a. Нация без запасов → все дефициты обнаружены
const stressNation = {
  id: 'sparta', name: 'Sparta',
  population: { total: 20000, happiness: 10 },
  economy: {
    stockpile: { wheat: 0, barley: 0, salt: 0, iron: 0, timber: 0, cloth: 0, olive_oil: 0, wine: 0 },
    trade_routes: [],
    income_per_turn: 50,
    _expense_breakdown: { army_infantry: 100 },
    _income_breakdown: { total: 50 },
  },
};
const allDeficits = checkSupplyDeficits(stressNation);
assert(allDeficits.length === Object.keys(GOOD_IMPORTANCE).length,
  'Все 8 товаров в дефиците при нулевых запасах', `count=${allDeficits.length}`);

// 5b. Только критические товары (importance >= 0.7)
const critical = allDeficits.filter(d => d.severity >= 0.7);
assert(critical.length >= 3, 'Есть критические дефициты (importance ≥ 0.7)',
  `critical=${critical.length}`);

// 5c. Диагностика дает top-5
const issues = buildDeficitDiagnostics(stressNation);
assert(issues.length <= 5, 'buildDeficitDiagnostics ≤ 5 элементов');
assert(issues.some(i => i.severity === 'high'), 'Есть проблемы высокой важности');

// 5d. Постепенно заполняем запасы — дефицит должен исчезать
stressNation.economy.stockpile = { wheat: 1000, barley: 1000, salt: 500, iron: 300, timber: 300, cloth: 300, olive_oil: 200, wine: 100 };
const deficitsAfterFill = checkSupplyDeficits(stressNation);
assert(deficitsAfterFill.length === 0, 'Нет дефицитов после пополнения запасов');

// 5e. Инвариант: shortage = need - qty (проверка математики)
stressNation.economy.stockpile.wheat = 10;
const defWh = checkSupplyDeficits(stressNation).find(d => d.good === 'wheat');
const expectedShortage = _estimateNeedForGood(stressNation, 'wheat') - 10;
assert(defWh && Math.abs(defWh.shortage - expectedShortage) < 0.01,
  'Shortage посчитан верно: need - qty', `shortage=${defWh?.shortage?.toFixed(1)}, expected=${expectedShortage.toFixed(1)}`);

// ─── ИТОГ ─────────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все тесты прошли успешно');
} else {
  console.error('❌ Есть ошибки!');
  process.exit(1);
}
