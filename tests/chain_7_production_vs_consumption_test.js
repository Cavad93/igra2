'use strict';
/**
 * chain_7_production_vs_consumption_test.js
 *
 * Проверяет, что производство зерна зданиями (ферма, вилла, латифундия)
 * корректно рассчитывается и сравнивается с потреблением классов населения.
 *
 * Формулы из исходников:
 *   Производство: (workers/1000) × base_rate × efficiency_mult × fertility × level
 *   Потребление:  (population / 100) × per_100 / 12
 *
 * Запуск: node tests/chain_7_production_vs_consumption_test.js
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
  if (Math.abs(a - b) <= tol) { console.log(`  ✓ ${msg} (${a.toFixed(2)} ≈ ${b})`); passed++; }
  else { console.error(`  ✗ FAIL: ${msg} — ожидалось ≈${b}±${tol}, получено ${a.toFixed(2)}`); failed++; }
}

// ══════════════════════════════════════════════════════════════════════════════
// ДАННЫЕ ЗДАНИЙ (из data/buildings.js)
// ══════════════════════════════════════════════════════════════════════════════
const BUILDINGS = {
  wheat_family_farm: {
    name: 'Семейная ферма',
    workers_per_unit: 5,
    efficiency_mult: 1.0,
    production_output: [{ good: 'wheat', base_rate: 2000 }],
  },
  wheat_villa: {
    name: 'Средняя вилла',
    workers_per_unit: 15,
    efficiency_mult: 1.3,
    production_output: [{ good: 'wheat', base_rate: 10000 }],
  },
  wheat_latifundium: {
    name: 'Латифундия',
    workers_per_unit: 100,
    efficiency_mult: 1.8,
    production_output: [
      { good: 'wheat',  base_rate: 6000 },
      { good: 'barley', base_rate: 834  },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// ДАННЫЕ КЛАССОВ (из data/social_classes.js)
// per_100 = единиц товара на 100 чел. в год. Делим на 12 для месячного тика.
// ══════════════════════════════════════════════════════════════════════════════
const WHEAT_NEEDS_PER_100_YEAR = {
  aristocrats:     450,
  officials:       630,
  clergy_class:    660,
  citizens:        540,
  craftsmen_class: 480,
  farmers_class:   180,
  sailors_class:   360,
  soldiers_class:  1080,
  freedmen:        240,
  slaves_class:    240,
};

// Матрица класс ← профессия (из data/social_classes.js)
const CLASS_FROM_PROFESSION = {
  aristocrats:     { merchants: 0.12, craftsmen: 0.02 },
  officials:       { merchants: 0.20, clergy: 0.10 },
  clergy_class:    { clergy: 0.80 },
  citizens:        { merchants: 0.50, craftsmen: 0.22 },
  craftsmen_class: { craftsmen: 0.58, sailors: 0.06 },
  farmers_class:   { farmers: 0.82 },
  sailors_class:   { sailors: 0.74 },
  soldiers_class:  { soldiers: 0.85 },
  freedmen:        { slaves: 0.08, farmers: 0.05, craftsmen: 0.10 },
  slaves_class:    { slaves: 0.90 },
};

// ──────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ──────────────────────────────────────────────────────────────────────────────

/** Производство здания за один тик */
function calcProduction(bDef, level, fertility) {
  const result = {};
  for (const po of bDef.production_output) {
    result[po.good] = (bDef.workers_per_unit / 1000) * po.base_rate
                    * bDef.efficiency_mult * fertility * level;
  }
  return result;
}

/** Население каждого класса из профессий */
function calcClassPops(by_profession) {
  const result = {};
  for (const [classId, profShares] of Object.entries(CLASS_FROM_PROFESSION)) {
    let count = 0;
    for (const [prof, share] of Object.entries(profShares)) {
      count += (by_profession[prof] || 0) * share;
    }
    result[classId] = Math.round(count);
  }
  return result;
}

/** Месячное потребление пшеницы всеми классами */
function calcWheatConsumption(by_profession) {
  const classPops = calcClassPops(by_profession);
  let total = 0;
  const breakdown = {};
  for (const [classId, pop] of Object.entries(classPops)) {
    const perMonth = (pop / 100) * (WHEAT_NEEDS_PER_100_YEAR[classId] || 0) / 12;
    breakdown[classId] = { pop, perMonth };
    total += perMonth;
  }
  return { total, breakdown };
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 1: Производство — формулы зданий
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ БЛОК 1: Производство зданий (fertility=1.0, level=1) ══');
{
  const farmProd = calcProduction(BUILDINGS.wheat_family_farm, 1, 1.0);
  eq(farmProd.wheat, 10, 'Ферма: 10 пш/тик');

  const villaProd = calcProduction(BUILDINGS.wheat_villa, 1, 1.0);
  eq(villaProd.wheat, 195, 'Вилла: 195 пш/тик');

  const latProd = calcProduction(BUILDINGS.wheat_latifundium, 1, 1.0);
  eq(latProd.wheat, 1080, 'Латифундия: 1080 пш/тик (пшеница)');
  near(latProd.barley, 150.12, 0.01, 'Латифундия: 150.12 ячм/тик (ячмень)');
}

console.log('\n── Производство при fertility=0.8 (Средиземноморье) ──');
{
  const farmProd = calcProduction(BUILDINGS.wheat_family_farm, 1, 0.8);
  near(farmProd.wheat, 8.0, 0.01, 'Ферма fertility=0.8: 8.0 пш/тик');

  const villaProd = calcProduction(BUILDINGS.wheat_villa, 1, 0.8);
  near(villaProd.wheat, 156.0, 0.01, 'Вилла fertility=0.8: 156 пш/тик');

  const latProd = calcProduction(BUILDINGS.wheat_latifundium, 1, 0.8);
  near(latProd.wheat, 864.0, 0.01, 'Латифундия fertility=0.8: 864 пш/тик');
}

console.log('\n── Масштаб уровнями (villa level=5) ──');
{
  const v5 = calcProduction(BUILDINGS.wheat_villa, 5, 1.0);
  eq(v5.wheat, 975, 'Вилла level=5: 975 пш/тик (195×5)');

  const lat3 = calcProduction(BUILDINGS.wheat_latifundium, 3, 1.0);
  eq(lat3.wheat, 3240, 'Латифундия level=3: 3240 пш/тик (1080×3)');
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 2: Потребление — проверка формул классов
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ БЛОК 2: Потребление классов (месячная норма на 100 чел.) ══');
{
  // Формула: (100/100) × per_100 / 12  →  per_100 / 12
  // per_100 — единиц товара на 100 чел. в ГОД; делим на 12 = в ТИК
  const cases = [
    ['aristocrats',     450,  37.5],
    ['officials',       630,  52.5],
    ['clergy_class',    660,  55.0],
    ['citizens',        540,  45.0],
    ['craftsmen_class', 480,  40.0],
    ['farmers_class',   180,  15.0],
    ['sailors_class',   360,  30.0],
    ['soldiers_class',  1080, 90.0],
    ['freedmen',        240,  20.0],
    ['slaves_class',    240,  20.0],
  ];
  for (const [cls, per100year, expectedPerMonth] of cases) {
    const actual = (100 / 100) * per100year / 12;
    near(actual, expectedPerMonth, 0.001,
      `${cls}: ${per100year}/год ÷ 12 = ${expectedPerMonth} пш/тик на 100 чел.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 3: Матрица классов — проверка расчёта населения из профессий
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ БЛОК 3: Матрица класс ← профессия ══');
{
  const by_profession = { merchants: 1000 };
  const pops = calcClassPops(by_profession);
  eq(pops.aristocrats, 120, 'aristocrats = merchants×0.12 = 120');
  eq(pops.officials,   200, 'officials = merchants×0.20 = 200');
  eq(pops.citizens,    500, 'citizens = merchants×0.50 = 500');

  const by_prof2 = { farmers: 10000 };
  const pops2 = calcClassPops(by_prof2);
  eq(pops2.farmers_class, 8200, 'farmers_class = farmers×0.82 = 8200');
  eq(pops2.freedmen,       500, 'freedmen += farmers×0.05 = 500');
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 4: Сценарий — малый регион (5 000 жителей)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ БЛОК 4: Симуляция — малый регион (5 000 жителей) ══');
{
  // Профессиональный состав небольшого сицилийского региона
  const by_profession = {
    farmers:    3000,
    craftsmen:   500,
    merchants:   300,
    sailors:     200,
    soldiers:    400,
    clergy:       50,
    slaves:      550,
  };
  const totalPop = Object.values(by_profession).reduce((s, v) => s + v, 0);
  console.log(`  Население по профессиям: ${totalPop} чел.`);

  const classPops = calcClassPops(by_profession);
  let classPopTotal = 0;
  for (const [cls, pop] of Object.entries(classPops)) {
    if (pop > 0) {
      console.log(`    ${cls.padEnd(20)} ${pop} чел.`);
      classPopTotal += pop;
    }
  }
  console.log(`  Итого по классам: ${classPopTotal} чел.`);
  ok(classPopTotal < totalPop * 1.05 && classPopTotal > totalPop * 0.60,
     'Сумма населения классов в разумных пределах (60–105% от общего)');

  const { total: totalWheatCons, breakdown } = calcWheatConsumption(by_profession);
  console.log(`\n  Потребление пшеницы по классам (пш/тик):`);
  for (const [cls, { pop, perMonth }] of Object.entries(breakdown)) {
    if (perMonth > 0.01) {
      console.log(`    ${cls.padEnd(20)} ${pop.toString().padStart(6)} чел. → ${perMonth.toFixed(1)} пш/тик`);
    }
  }
  console.log(`  ── ИТОГО потребление: ${totalWheatCons.toFixed(1)} пш/тик`);

  // Ожидаемое потребление (вручную):
  // farmers_class = round(3000×0.82 + 550×0.08×0 ... wait, actually:
  //   farmers_class: farmers×0.82 = 2460
  //   freedmen: slaves×0.08 + farmers×0.05 + craftsmen×0.10 = 44+150+50=244
  //   slaves_class: slaves×0.90 = 495
  //   ... etc.
  // Проверяем что общее потребление пшеницы > 0 и реалистично
  ok(totalWheatCons > 100, 'Потребление пшеницы > 100 пш/тик');
  ok(totalWheatCons < 5000, 'Потребление пшеницы < 5000 пш/тик (реалистично для 5000 чел.)');

  // ── Сценарий A: Только фермы
  const numFarms = 50;  // 50 семейных ферм
  const farmProd = calcProduction(BUILDINGS.wheat_family_farm, 1, 1.0);
  const totalFarmsProd = farmProd.wheat * numFarms;
  const balanceA = totalFarmsProd - totalWheatCons;
  console.log(`\n  ── Сценарий A: ${numFarms} ферм ──`);
  console.log(`     Производство: ${totalFarmsProd.toFixed(1)} пш/тик`);
  console.log(`     Потребление:  ${totalWheatCons.toFixed(1)} пш/тик`);
  console.log(`     БАЛАНС:       ${balanceA > 0 ? '+' : ''}${balanceA.toFixed(1)} пш/тик`);

  // ── Сценарий B: 10 вилл
  const numVillas = 10;
  const villaProd = calcProduction(BUILDINGS.wheat_villa, 1, 1.0);
  const totalVillasProd = villaProd.wheat * numVillas;
  const balanceB = totalVillasProd - totalWheatCons;
  console.log(`\n  ── Сценарий B: ${numVillas} вилл ──`);
  console.log(`     Производство: ${totalVillasProd.toFixed(1)} пш/тик`);
  console.log(`     Потребление:  ${totalWheatCons.toFixed(1)} пш/тик`);
  console.log(`     БАЛАНС:       ${balanceB > 0 ? '+' : ''}${balanceB.toFixed(1)} пш/тик`);

  // ── Сценарий C: 1 латифундия
  const latProd = calcProduction(BUILDINGS.wheat_latifundium, 1, 1.0);
  const balanceC = latProd.wheat - totalWheatCons;
  console.log(`\n  ── Сценарий C: 1 латифундия ──`);
  console.log(`     Производство пшеницы: ${latProd.wheat.toFixed(1)} пш/тик`);
  console.log(`     Производство ячменя:  ${latProd.barley.toFixed(2)} ячм/тик`);
  console.log(`     Потребление пшеницы:  ${totalWheatCons.toFixed(1)} пш/тик`);
  console.log(`     БАЛАНС пшеницы:       ${balanceC > 0 ? '+' : ''}${balanceC.toFixed(1)} пш/тик`);
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 5: Сценарий — Сиракузы (крупный регион, 432 000 жителей)
// Приближение к реальным данным игры (Ход 2, скриншот)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ БЛОК 5: Симуляция — Сиракузы / Сицилия (432 255 жителей) ══');
{
  // Приближённый профессиональный состав для 432 255 чел.
  // Сицилия — аграрный регион, много фермеров и рабов
  const by_profession = {
    farmers:    200000,
    craftsmen:   60000,
    merchants:   30000,
    sailors:     25000,
    soldiers:    40000,
    clergy:       7000,
    slaves:      70255,
  };
  const totalPop = Object.values(by_profession).reduce((s, v) => s + v, 0);
  console.log(`  Всего: ${totalPop} чел.`);

  const { total: totalWheatCons } = calcWheatConsumption(by_profession);
  console.log(`  Потребление пшеницы: ${totalWheatCons.toFixed(0)} пш/тик`);

  // Sicily на скриншоте имеет 203.8K пшеницы и 26 регионов
  // +19.8% цены намекает что производство ~ 1.2× потребления
  // Проверим сколько надо зданий чтобы покрыть потребление

  const farmOutput = calcProduction(BUILDINGS.wheat_family_farm, 1, 1.0).wheat;
  const villaOutput = calcProduction(BUILDINGS.wheat_villa, 1, 1.0).wheat;
  const latOutput = calcProduction(BUILDINGS.wheat_latifundium, 1, 1.0).wheat;

  const farmsNeeded = Math.ceil(totalWheatCons / farmOutput);
  const villasNeeded = Math.ceil(totalWheatCons / villaOutput);
  const latNeeded = Math.ceil(totalWheatCons / latOutput);

  console.log(`\n  Чтобы покрыть потребление одним типом здания:`);
  console.log(`    Ферм нужно:        ${farmsNeeded} (по 10 пш/тик каждая)`);
  console.log(`    Вилл нужно:        ${villasNeeded} (по 195 пш/тик каждая)`);
  console.log(`    Латифундий нужно:  ${latNeeded} (по 1080 пш/тик каждая)`);

  // Проверка: запас Sicily (203.8K) — это примерно N тиков потребления
  const sicilySurplus = 203800;
  const ticksOfSupply = sicilySurplus / totalWheatCons;
  console.log(`\n  Запас пшеницы в Sicily (203.8K) = ${ticksOfSupply.toFixed(1)} тиков потребления`);
  ok(ticksOfSupply > 1 && ticksOfSupply < 200, 'Запас Sicily — реалистичный запас (1–200 тиков)');

  // Проверка реализма: 1 латифундия кормит сколько людей?
  // Норма солдата: 1080/год на 100 чел. → 90/тик на 100 чел. → 0.9/тик на 1 чел.
  const soldierWheatPerPersonPerTick = WHEAT_NEEDS_PER_100_YEAR['soldiers_class'] / 12 / 100;
  const peopleFedByLat = latOutput / soldierWheatPerPersonPerTick;
  console.log(`\n  1 латифундия (1080 пш/тик) ≈ кормит ${peopleFedByLat.toFixed(0)} солдат`);
  console.log(`  (норма солдата = ${soldierWheatPerPersonPerTick.toFixed(2)} пш/тик/чел.)`);
  ok(peopleFedByLat > 500 && peopleFedByLat < 10000,
     '1 латифундия кормит 500–10 000 солдат — реалистично');

  // Общий баланс для смешанного хозяйства: 500 ферм + 100 вилл + 20 латифундий
  const totalProd =
      500 * farmOutput +
      100 * villaOutput +
       20 * latOutput;
  const balance = totalProd - totalWheatCons;
  console.log(`\n  ── Смешанное хозяйство: 500 ферм + 100 вилл + 20 латифундий ──`);
  console.log(`     Производство: ${totalProd.toFixed(0)} пш/тик`);
  console.log(`     Потребление:  ${totalWheatCons.toFixed(0)} пш/тик`);
  console.log(`     БАЛАНС:       ${balance > 0 ? '+' : ''}${balance.toFixed(0)} пш/тик`);
  ok(totalProd > 0, 'Смешанное производство > 0');
}

// ══════════════════════════════════════════════════════════════════════════════
// ИТОГ
// ══════════════════════════════════════════════════════════════════════════════
console.log(`\n═══ Итог: ${passed} прошло, ${failed} провалено ═══\n`);
if (failed > 0) process.exit(1);
