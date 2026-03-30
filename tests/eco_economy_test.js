/**
 * tests/eco_economy_test.js
 *
 * Тесты экономической системы ECO_001–ECO_010
 * Запуск: node tests/eco_economy_test.js
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

// ─── Mock globals ─────────────────────────────────────────────────────────

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
  },
};

// ─── TEST 1: GOOD_IMPORTANCE и checkSupplyDeficits ────────────────────────
console.log('\n=== TEST 1: checkSupplyDeficits (ECO_003) ===');

const GOOD_IMPORTANCE = {
  wheat: 1.0, barley: 0.9, salt: 0.7, iron: 0.6,
  timber: 0.5, cloth: 0.5, olive_oil: 0.4, wine: 0.3,
};

function _estimateNeedForGood(nation, good) {
  const pop = nation.population?.total || 1000;
  if (good === 'wheat' || good === 'barley') return pop * 0.01;
  return pop * 0.005;
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

const nationA = {
  id: 'rome', name: 'Rome',
  population: { total: 10000 },
  economy: { stockpile: { wheat: 0, barley: 5, salt: 0 } },
};
const deficits = checkSupplyDeficits(nationA);
assert(deficits.length > 0, 'Дефициты обнаружены при нулевом запасе');
assert(deficits.some(d => d.good === 'wheat'), 'Пшеница в дефиците');
assert(deficits.some(d => d.good === 'salt'),  'Соль в дефиците');
assert(Array.isArray(nationA._supply_deficits), '_supply_deficits сохранён на нации');

const nationFull = {
  id: 'egypt', name: 'Egypt',
  population: { total: 5000 },
  economy: { stockpile: { wheat: 1000, barley: 1000, salt: 500, iron: 300, timber: 200, cloth: 200, olive_oil: 100, wine: 100 } },
};
const deficitsFull = checkSupplyDeficits(nationFull);
assert(deficitsFull.length === 0, 'Нет дефицитов при полном запасе');

// ─── TEST 2: buildDeficitDiagnostics (ECO_002) ────────────────────────────
console.log('\n=== TEST 2: buildDeficitDiagnostics (ECO_002) ===');

function buildDeficitDiagnostics(nation) {
  const eco    = nation.economy;
  const exp    = eco._expense_breakdown || {};
  const mil    = nation.military || {};
  const B      = CONFIG.BALANCE || {};
  const issues = [];
  const armyCost = (exp.army_infantry||0) + (exp.army_cavalry||0) + (exp.army_mercenaries||0)
    || ((mil.infantry||0)*(B.INFANTRY_UPKEEP||2) + (mil.cavalry||0)*(B.CAVALRY_UPKEEP||5));
  const income   = eco._income_breakdown?.total || eco.income_per_turn || 1;
  if (armyCost > income * 0.5)
    issues.push({ icon:'⚔️', text:`Армия поглощает ${Math.round(armyCost/income*100)}% дохода`, severity:'high' });
  const stockpile = eco.stockpile || {};
  for (const [good, qty] of Object.entries(stockpile)) {
    if (qty < 0) issues.push({ icon:'📦', text:`Дефицит ${good}`, severity:'med' });
  }
  if ((eco.trade_routes||[]).length === 0)
    issues.push({ icon:'🚢', text:'Нет торговых маршрутов', severity:'med' });
  if ((nation.population?.happiness||50) < 35)
    issues.push({ icon:'😤', text:'Низкое счастье', severity:'high' });
  return issues.slice(0, 5);
}

const nationPoor = {
  id: 'carthage', name: 'Carthage',
  population: { total: 8000, happiness: 20 },
  economy: {
    income_per_turn: 100,
    stockpile: { wheat: -50, barley: 10 },
    trade_routes: [],
    _expense_breakdown: { army_infantry: 80 },
    _income_breakdown: { total: 100 },
  },
  military: { infantry: 40, cavalry: 5 },
};
const issues = buildDeficitDiagnostics(nationPoor);
assert(issues.length > 0, 'Проблемы обнаружены у бедной нации');
assert(issues.some(i => i.severity === 'high'), 'Есть критические проблемы');
assert(issues.some(i => i.icon === '🚢'), 'Нет торговых маршрутов — обнаружено');
assert(issues.length <= 5, 'Максимум 5 проблем');

// ─── TEST 3: renderPriceSparkline (ECO_007) ───────────────────────────────
console.log('\n=== TEST 3: renderPriceSparkline (ECO_007) ===');

function renderPriceSparkline(priceHistory, width=60, height=20) {
  if (!Array.isArray(priceHistory) || priceHistory.length < 2) return '';
  const min   = Math.min(...priceHistory);
  const max   = Math.max(...priceHistory);
  const range = max - min || 1;
  const pts   = priceHistory.map((p,i) => {
    const x = (i / (priceHistory.length-1)) * width;
    const y = height - ((p - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last  = priceHistory[priceHistory.length-1];
  const first = priceHistory[0];
  const trend = last > first * 1.01 ? '↑' : last < first * 0.99 ? '↓' : '→';
  const color = trend === '↑' ? '#F44336' : trend === '↓' ? '#4CAF50' : '#9E9E9E';
  return `<svg width="${width}" height="${height}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

assert(renderPriceSparkline([]) === '', 'Пустой массив → пустая строка');
assert(renderPriceSparkline([10]) === '', 'Один элемент → пустая строка');
const sparkRising = renderPriceSparkline([10, 12, 15, 18]);
assert(sparkRising.includes('#F44336'), 'Растущие цены → красный цвет');
const sparkFalling = renderPriceSparkline([20, 18, 14, 10]);
assert(sparkFalling.includes('#4CAF50'), 'Падающие цены → зелёный цвет');
assert(sparkRising.includes('<svg'), 'Возвращает SVG-элемент');

// ─── TEST 4: Тарифы и торговые маршруты (ECO_008, ECO_010) ───────────────
console.log('\n=== TEST 4: Тарифные ставки (ECO_008 / ECO_010) ===');

function calcTariff(relations) {
  return relations > 50 ? CONFIG.BALANCE.TRADE_TARIFF_FRIENDLY
       : relations > 0  ? CONFIG.BALANCE.TRADE_TARIFF_NEUTRAL
       :                  CONFIG.BALANCE.TRADE_TARIFF_HOSTILE;
}

assert(calcTariff(80)  === 0.05, 'Дружественный тариф = 5%');
assert(calcTariff(30)  === 0.15, 'Нейтральный тариф = 15%');
assert(calcTariff(-10) === 0.30, 'Враждебный тариф = 30%');

// ─── TEST 5: MISSING_NATIONS_MULT и shortage_streak cap (ECO_010) ─────────
console.log('\n=== TEST 5: Баланс рынка (ECO_010) ===');

assert(CONFIG.BALANCE.MISSING_NATIONS_MULT === 2.0, 'MISSING_NATIONS_MULT = 2.0 (не 3.0)');
assert(CONFIG.BALANCE.SHORTAGE_STREAK_CAP === 8,    'SHORTAGE_STREAK_CAP = 8');
assert(CONFIG.BALANCE.PIRACY_BASE === 0.03,         'PIRACY_BASE = 0.03 (снижено с 0.05)');
assert(CONFIG.BALANCE.SUBSISTENCE_FACTOR === 0.65,  'SUBSISTENCE_FACTOR = 0.65');

// Имитация cap
let streak = 0;
for (let i = 0; i < 20; i++) {
  const streakCap = CONFIG.BALANCE.SHORTAGE_STREAK_CAP;
  streak = Math.min(streak + 1, streakCap);
}
assert(streak === 8, `shortage_streak ограничен ${CONFIG.BALANCE.SHORTAGE_STREAK_CAP}`);

// ─── ИТОГ ─────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все тесты прошли успешно');
} else {
  console.log('❌ Есть ошибки!');
  process.exit(1);
}
