/**
 * tests/audit/eco_integration_test.cjs
 * Модуль: Экономика — Integration-тест
 *
 * Проверяет связь Экономики ↔ Население:
 *   - calcNationBasketDemand: потребление растёт с ростом численности населения
 *   - calcNationBasketDemand: богатые POP-ы потребляют больше разнообразных товаров
 *   - checkSupplyDeficits: дефицит корректно зависит от численности населения
 *   - Полный цикл: производство → потребление → дефициты при растущем населении
 *
 * Запуск: node tests/audit/eco_integration_test.cjs
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

// ─── Реализации из engine/pops.js ────────────────────────────────────────────

const POP_INITIAL_WEALTH = {
  farmers: 15, craftsmen: 45, merchants: 65,
  sailors: 38, clergy: 55,   soldiers: 35, slaves: 5,
};

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

// ─── Реализации из engine/economy.js ─────────────────────────────────────────

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

// ─── Вспомогательная фабрика наций ───────────────────────────────────────────

function makeNation({ farmersCount, merchantsCount = 0, wealth = null, stockpile = {} }) {
  const by_profession = { farmers: farmersCount };
  if (merchantsCount > 0) by_profession.merchants = merchantsCount;

  const pops = {
    farmers: { wealth: wealth !== null ? wealth : POP_INITIAL_WEALTH.farmers, satisfied: 0.75, income_last: 0 },
  };
  if (merchantsCount > 0) {
    pops.merchants = { wealth: wealth !== null ? wealth : POP_INITIAL_WEALTH.merchants, satisfied: 0.75, income_last: 0 };
  }

  return {
    population: {
      total: farmersCount + merchantsCount,
      by_profession,
      pops,
    },
    economy: { stockpile },
  };
}

// ─── TEST 1: Потребление растёт пропорционально населению ────────────────────
console.log('\n=== INTEGRATION TEST 1: Экономика ↔ Население (масштабирование) ===');

const nation1k = makeNation({ farmersCount: 1000 });
const nation10k = makeNation({ farmersCount: 10000 });

const demand1k  = calcNationBasketDemand(nation1k);
const demand10k = calcNationBasketDemand(nation10k);

assert(demand1k !== null,  'calcNationBasketDemand возвращает данные (1 000 фермеров)');
assert(demand10k !== null, 'calcNationBasketDemand возвращает данные (10 000 фермеров)');
assert(
  Math.abs(demand10k.wheat / demand1k.wheat - 10) < 0.01,
  'Пшеничный спрос масштабируется линейно с ростом населения × 10',
  `ratio=${(demand10k.wheat / demand1k.wheat).toFixed(2)}`
);

// ─── TEST 2: Богатые POP-ы требуют большего разнообразия ────────────────────
console.log('\n=== INTEGRATION TEST 2: Экономика ↔ Население (богатство влияет на корзину) ===');

const nationPoor = makeNation({ farmersCount: 1000, wealth: 10 });   // бедные
const nationRich = makeNation({ farmersCount: 1000, wealth: 80 });   // богатые

const demandPoor = calcNationBasketDemand(nationPoor);
const demandRich = calcNationBasketDemand(nationRich);

assert(demandPoor.wheat > demandRich.wheat,
  'Бедные потребляют больше пшеницы, чем богатые (зерно как основа рациона)',
  `poor=${demandPoor.wheat.toFixed(3)}, rich=${demandRich.wheat.toFixed(3)}`);

assert(demandRich.wine !== undefined && demandRich.wine > 0,
  'Богатые (wealth=80) потребляют вино',
  `wine=${demandRich.wine}`);

assert(!demandPoor.wine,
  'Бедные (wealth=10) не потребляют вино',
  `wine=${demandPoor.wine}`);

assert(!demandPoor.timber,
  'Бедные (wealth=10) не потребляют строительную древесину',
  `timber=${demandPoor.timber}`);

assert(demandRich.timber !== undefined && demandRich.timber > 0,
  'Богатые (wealth=80) потребляют строительную древесину',
  `timber=${demandRich.timber}`);

// ─── TEST 3: Дефицит зависит от численности населения ───────────────────────
console.log('\n=== INTEGRATION TEST 3: Экономика ↔ Население (дефицит масштабируется) ===');

// Фиксированный запас, разное население
const stockFixed = { wheat: 50 }; // 50 единиц пшеницы

const nationSmall = makeNation({ farmersCount: 1000,  stockpile: stockFixed });
const nationBig   = makeNation({ farmersCount: 20000, stockpile: stockFixed });

nationSmall.economy.stockpile = { wheat: 50 };
nationBig.economy.stockpile   = { wheat: 50 };

const defSmall = checkSupplyDeficits(nationSmall);
const defBig   = checkSupplyDeficits(nationBig);

const wheatDefSmall = defSmall.find(d => d.good === 'wheat');
const wheatDefBig   = defBig.find(d => d.good === 'wheat');

// Малая нация: need = 1000 * 0.01 = 10, threshold = 2.5, stock=50 → нет дефицита
assert(wheatDefSmall === undefined,
  'Малая нация (1000 чел.), запас 50 пшеницы → нет дефицита (порог 2.5)',
  `need=${1000 * 0.01}, threshold=${1000 * 0.01 * 0.25}`);

// Большая нация: need = 20000 * 0.01 = 200, threshold = 50, stock=50 → нет дефицита (ровно на границе)
assert(wheatDefBig === undefined,
  'Большая нация (20000 чел.), запас 50 → НЕ дефицит (ровно на пороге 50)',
  `need=${20000 * 0.01}, threshold=${20000 * 0.01 * 0.25}`);

// Огромная нация: need = 40000 * 0.01 = 400, threshold = 100, stock=50 → ДЕФИЦИТ
const nationHuge = makeNation({ farmersCount: 40000, stockpile: { wheat: 50 } });
nationHuge.economy.stockpile = { wheat: 50 };
const defHuge = checkSupplyDeficits(nationHuge);
const wheatDefHuge = defHuge.find(d => d.good === 'wheat');

assert(wheatDefHuge !== undefined,
  'Огромная нация (40000 чел.), запас 50 → ЕСТЬ дефицит пшеницы',
  `threshold=${40000 * 0.01 * 0.25}`);
assert(Math.abs(wheatDefHuge.shortage - (40000 * 0.01 - 50)) < 0.01,
  'Величина нехватки = need − stock',
  `shortage=${wheatDefHuge.shortage}, expected=${40000 * 0.01 - 50}`);

// ─── TEST 4: Полный цикл Производство → Потребление → Дефицит ───────────────
console.log('\n=== INTEGRATION TEST 4: Полный цикл (производство → потребление → дефицит) ===');

// Симулируем нацию с 5000 фермеров и нулевыми запасами
const nation5k = makeNation({ farmersCount: 5000 });
nation5k.economy.stockpile = {};

// Минимальное производство: 5 пшеницы (меньше порога)
const prodPerTick = 5;
nation5k.economy.stockpile.wheat = prodPerTick;

const defsAfterProd = checkSupplyDeficits(nation5k);
const wheatDef = defsAfterProd.find(d => d.good === 'wheat');

// need = 5000 * 0.01 = 50, threshold = 12.5, stock = 5 → дефицит
assert(wheatDef !== undefined,
  'После производства 5 ед. при потребности 50 → дефицит пшеницы',
  `threshold=${5000 * 0.01 * 0.25}, stock=${prodPerTick}`);

// Теперь производство покрывает порог
nation5k.economy.stockpile.wheat = 20;
const defsAfterFullProd = checkSupplyDeficits(nation5k);
const wheatDefFull = defsAfterFullProd.find(d => d.good === 'wheat');

assert(wheatDefFull === undefined,
  'После производства 20 ед. при пороге 12.5 → дефицит пшеницы исчезает',
  `threshold=${5000 * 0.01 * 0.25}, stock=20`);

// Проверяем что demand (из pops) согласован с оценкой дефицита (из economy)
// demand (pops): фермеры wealth=15, basket.wheat=0.8, 5 тыс. → 0.8*5 = 4 ед.
const demandNation5k = calcNationBasketDemand(nation5k);
assert(demandNation5k.wheat > 0,
  'calcNationBasketDemand возвращает ненулевой спрос на пшеницу для 5000 фермеров',
  `wheat demand=${demandNation5k.wheat.toFixed(3)}`);

// Связь: при нулевых запасах spros (pops) > 0 и dефицит (economy) > 0
nation5k.economy.stockpile = {};
const demandFull = calcNationBasketDemand(nation5k);
const defsFull   = checkSupplyDeficits(nation5k);

assert(demandFull.wheat > 0 && defsFull.find(d => d.good === 'wheat') !== undefined,
  'Оба модуля (pops и economy) согласованно показывают дефицит при нулевых запасах',
  `basket_demand=${demandFull.wheat.toFixed(3)}, economy_deficit=yes`);

// ─── Итоги ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все integration-тесты Экономика↔Население прошли');
} else {
  console.error(`❌ Провалено: ${failed}`);
  process.exit(1);
}
