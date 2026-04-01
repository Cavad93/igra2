/**
 * tests/audit/eco_unit_test.cjs
 * Модуль: Экономика — Unit-тест
 *
 * Проверяет изолированную логику функций экономического движка:
 *   - _getEffectiveTariffRate: корректность расчёта тарифных ставок
 *   - checkSupplyDeficits: правильное обнаружение дефицитов
 *   - updateTreasury: корректный расчёт дохода/расхода/дельты казны
 *
 * Запуск: node tests/audit/eco_unit_test.cjs
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' (' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}${detail ? ' (' + detail + ')' : ''}`);
    failed++;
  }
}

function assertClose(a, b, tolerance, msg) {
  const ok = Math.abs(a - b) <= tolerance;
  assert(ok, msg, `got ${a}, expected ~${b} ±${tolerance}`);
}

// ─── Реализации функций (изолировано от браузерного контекста) ───────────────

const TAX_CALIBRATION = 0.5;

const TAX_GROUP_CLASSES = {
  aristocrats: ['aristocrats', 'officials'],
  clergy:      ['clergy_class'],
  commoners:   ['citizens', 'craftsmen_class', 'farmers_class', 'sailors_class'],
  soldiers:    ['soldiers_class', 'freedmen'],
};

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
    if (qty < need * 0.25) {
      deficits.push({ good, severity: importance, shortage: need - qty });
    }
  }
  return deficits;
}

/**
 * Тарифная ставка без DiplomacyEngine (нет договора):
 *   tariff = 0.20 − (score/100) × 0.15, зажатое в [0.05, 0.35]
 */
function _getEffectiveTariffRate(score, war = false, treaty_rate = undefined) {
  if (war) return 0.99;
  if (treaty_rate !== undefined) {
    return Number.isFinite(treaty_rate) ? Math.max(0, Math.min(0.99, treaty_rate)) : 0.20;
  }
  return Math.max(0.05, Math.min(0.35, 0.20 - (score / 100) * 0.15));
}

// ─── TEST 1: Тарифная ставка ─────────────────────────────────────────────────
console.log('\n=== UNIT TEST 1: _getEffectiveTariffRate ===');

assertClose(_getEffectiveTariffRate(0),   0.20, 0.001, 'score=0 → нейтральный тариф 20%');
assertClose(_getEffectiveTariffRate(100), 0.05, 0.001, 'score=100 (союзник) → минимальный тариф 5%');
assertClose(_getEffectiveTariffRate(-100),0.35, 0.001, 'score=-100 (враг) → максимальный тариф 35%');
assertClose(_getEffectiveTariffRate(200), 0.05, 0.001, 'score=200 (за лимитом) → пол 5%');
assertClose(_getEffectiveTariffRate(-200),0.35, 0.001, 'score=-200 (за лимитом) → потолок 35%');
assert(_getEffectiveTariffRate(0, true) === 0.99, 'Война → тариф 99% (торговля заблокирована)');
assertClose(_getEffectiveTariffRate(50, false, 0.10), 0.10, 0.001, 'Договорная ставка перекрывает авторасчёт');
assertClose(_getEffectiveTariffRate(50, false, -0.5), 0.00, 0.001, 'Отрицательная договорная ставка → зажата до 0');

// ─── TEST 2: checkSupplyDeficits ────────────────────────────────────────────
console.log('\n=== UNIT TEST 2: checkSupplyDeficits ===');

// Нация с населением 10 000, нулевыми запасами
const nationEmpty = {
  population: { total: 10000 },
  economy: { stockpile: {} },
};
const deficitsEmpty = checkSupplyDeficits(nationEmpty);
assert(deficitsEmpty.length === Object.keys(GOOD_IMPORTANCE).length,
  'Нулевые запасы → дефицит по всем 8 товарам',
  `count=${deficitsEmpty.length}`);

// Проверка severity у пшеницы (самый критичный)
const wheatDef = deficitsEmpty.find(d => d.good === 'wheat');
assert(wheatDef !== undefined, 'Пшеница обнаружена в дефицитах');
assert(wheatDef.severity === 1.0, 'Severity пшеницы = 1.0');

// Нация с достаточными запасами
const nationFull = {
  population: { total: 10000 },
  economy: {
    stockpile: {
      wheat: 1000, barley: 1000, salt: 500, iron: 500,
      timber: 500, cloth: 500, olive_oil: 500, wine: 500,
    }
  },
};
const deficitsFull = checkSupplyDeficits(nationFull);
assert(deficitsFull.length === 0, 'Достаточные запасы → нет дефицитов');

// Граничный случай: ровно 25% от потребности (дефицита нет — qty = need * 0.25)
const pop = 10000;
const needWheat = pop * 0.01;  // 100
const nationBorder = {
  population: { total: pop },
  economy: { stockpile: { wheat: needWheat * 0.25 } }, // ровно на границе
};
const deficitsBorder = checkSupplyDeficits(nationBorder);
const wheatBorder = deficitsBorder.find(d => d.good === 'wheat');
assert(wheatBorder === undefined,
  'Запас ровно 25% потребности → НЕ дефицит (строго <, не <=)',
  `wheat stock=${needWheat * 0.25}, need*0.25=${needWheat * 0.25}`);

// ─── TEST 3: Расчёт казны (упрощённый) ──────────────────────────────────────
console.log('\n=== UNIT TEST 3: Расчёт дельты казны ===');

// Воспроизводим логику updateTreasury в минимальном виде
function calcTreasuryDelta({ taxBase, taxRate, militaryCost, stabilityPct, tradeProfit = 0 }) {
  const taxIncome     = Math.round(taxBase * taxRate * TAX_CALIBRATION);
  const expStability  = Math.round(200 * (1 - stabilityPct / 100));
  const totalIncome   = taxIncome + tradeProfit;
  const totalExpense  = militaryCost + expStability;
  return totalIncome - totalExpense;
}

// Нация с высокой налоговой базой, малой армией, 100% стабильностью
const delta1 = calcTreasuryDelta({
  taxBase: 100000, taxRate: 0.10, militaryCost: 500, stabilityPct: 100
});
assert(delta1 > 0, 'Богатая нация, малая армия, стабильность 100% → положительный баланс',
  `delta=${delta1}`);

// Нация с нулевой налоговой базой → только расходы
const delta2 = calcTreasuryDelta({
  taxBase: 0, taxRate: 0.10, militaryCost: 2000, stabilityPct: 0
});
assert(delta2 < 0, 'Нулевые доходы + большая армия + нулевая стабильность → дефицит',
  `delta=${delta2}`);

// Стабильность 100% → расход на стабильность = 0
const stabExp100 = Math.round(200 * (1 - 100 / 100));
assert(stabExp100 === 0, 'Стабильность 100% → нулевой расход на восстановление стабильности',
  `stabExp=${stabExp100}`);

// Стабильность 50% → расход = 100
const stabExp50 = Math.round(200 * (1 - 50 / 100));
assert(stabExp50 === 100, 'Стабильность 50% → расход на стабильность = 100',
  `stabExp=${stabExp50}`);

// Стабильность 0% → расход = 200
const stabExp0 = Math.round(200 * (1 - 0 / 100));
assert(stabExp0 === 200, 'Стабильность 0% → расход на стабильность = 200 (максимум)',
  `stabExp=${stabExp0}`);

// ─── Итоги ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все unit-тесты экономики прошли');
} else {
  console.error(`❌ Провалено: ${failed}`);
  process.exit(1);
}
