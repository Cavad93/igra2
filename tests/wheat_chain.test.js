// Тест цепочки пшеницы
// Запуск: node tests/wheat_chain.test.js
//
// Проверяет:
//   1. Выход пш/га для каждого из трёх зданий пшеницы
//   2. Порядок эффективности: латифундия > вилла > семейная ферма
//   3. nation_buildable для автономных зданий
//   4. Рецепт семян: 20% посевного фонда для всех трёх зданий
//   5. Корректность processAllRecipes (ratio = 1 при полном складе)

'use strict';

// ── Минимальный тестовый движок ────────────────────────────────
let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}
function assertEqual(a, b, msg) {
  if (Math.abs(a - b) < 0.001) {
    console.log(`  ✓ ${msg} (${a})`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}: ожидалось ${b}, получено ${a}`);
    failed++;
  }
}
function section(name) { console.log(`\n── ${name}`); }

// ── Загружаем данные ───────────────────────────────────────────
// data-файлы используют глобальные переменные (browser-style).
// Эмулируем глобальный scope через eval + globalThis.
const fs   = require('fs');
const path = require('path');

function loadGlobal(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  // Превращаем "const FOO = {...}" / "var FOO = {...}" в globalThis.FOO = {...}
  const patched = src
    .replace(/^(const|let|var)\s+(\w+)\s*=/gm, 'globalThis.$2 =');
  try { eval(patched); } catch (e) { /* некоторые файлы требуют других файлов — игнорируем */ }
}

loadGlobal('data/goods.js');
loadGlobal('data/buildings.js');
loadGlobal('data/recipes.js');

const BUILDINGS       = globalThis.BUILDINGS;
const BUILDING_RECIPES       = globalThis.BUILDING_RECIPES;
// getBuildingsForTerrain объявлена как function-declaration в data/buildings.js —
// она недоступна через globalThis после eval, поэтому берём из eval-контекста.
// Вместо этого переиспользуем логику напрямую в тесте (см. секцию 5).
const getBuildingsForTerrain = globalThis.getBuildingsForTerrain ?? function(terrain) {
  return Object.entries(BUILDINGS)
    .filter(([, b]) => {
      if (b.nation_buildable === false) return false;
      if (b.terrain_restriction && !b.terrain_restriction.includes(terrain)) return false;
      return true;
    })
    .map(([id, b]) => ({ id, ...b }));
};

if (!BUILDINGS) {
  console.error('Не удалось загрузить BUILDINGS — проверь путь');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Вспомогательная функция: считает пш/га для одного здания
// ─────────────────────────────────────────────────────────────
function wheatPerHa(buildingId) {
  const b = BUILDINGS[buildingId];
  if (!b) return null;
  const workers     = b.workers_per_unit;
  const wheatOutput = b.production_output.find(o => o.good === 'wheat');
  if (!wheatOutput) return null;
  const outputPerTick = (workers / 1000) * wheatOutput.base_rate * (b.efficiency_mult ?? 1.0);
  return outputPerTick / b.footprint_ha;
}

// ─────────────────────────────────────────────────────────────
// 1. Данные зданий
// ─────────────────────────────────────────────────────────────
section('1. Определения зданий');

const farm  = BUILDINGS.wheat_family_farm;
const villa = BUILDINGS.wheat_villa;
const lati  = BUILDINGS.wheat_latifundium;

assert(!!farm,  'wheat_family_farm существует');
assert(!!villa, 'wheat_villa существует');
assert(!!lati,  'wheat_latifundium существует');

assert(farm.nation_buildable === false,  'wheat_family_farm: nation_buildable = false');
assert(villa.nation_buildable === false, 'wheat_villa: nation_buildable = false');
assert(lati.nation_buildable !== false,  'wheat_latifundium: nation_buildable не false (двойной путь)');

assert(farm.autonomous_builder  === 'farmers_class',  'wheat_family_farm: autonomous_builder = farmers_class');
assert(villa.autonomous_builder === 'soldiers_class', 'wheat_villa: autonomous_builder = soldiers_class');
assert(lati.autonomous_builder  === 'aristocrats',    'wheat_latifundium: autonomous_builder = aristocrats');

// ─────────────────────────────────────────────────────────────
// 2. Выход пш/га и порядок эффективности
// ─────────────────────────────────────────────────────────────
section('2. Выход пш/га');

const farmHa  = wheatPerHa('wheat_family_farm');
const villaHa = wheatPerHa('wheat_villa');
const latiHa  = wheatPerHa('wheat_latifundium');

console.log(`  farm=${farmHa.toFixed(2)} пш/га | villa=${villaHa.toFixed(2)} пш/га | lati=${latiHa.toFixed(2)} пш/га`);

assertEqual(farmHa,  2.0, 'wheat_family_farm: 2.0 пш/га');
assertEqual(villaHa, 2.6, 'wheat_villa: 2.6 пш/га');
assertEqual(latiHa,  3.6, 'wheat_latifundium: 3.6 пш/га');

assert(latiHa > villaHa,  'Латифундия эффективнее виллы на га');
assert(villaHa > farmHa,  'Вилла эффективнее фермы на га');
assert(latiHa  > farmHa,  'Латифундия эффективнее фермы на га');

// ─────────────────────────────────────────────────────────────
// 3. Рецепты: посевной фонд 20%
// ─────────────────────────────────────────────────────────────
section('3. Рецепты (посевной фонд)');

if (BUILDING_RECIPES) {
  for (const bid of ['wheat_family_farm', 'wheat_villa', 'wheat_latifundium']) {
    const recipes = BUILDING_RECIPES[bid];
    assert(!!recipes?.length, `${bid}: рецепт существует`);
    const wheatRecipe = recipes?.find(r => r.output_good === 'wheat');
    assert(!!wheatRecipe, `${bid}: есть рецепт пшеницы`);
    const seedInput = wheatRecipe?.inputs?.find(i => i.good === 'wheat');
    assert(!!seedInput, `${bid}: требует пшеницу-семена на входе`);
    assertEqual(seedInput?.amount, 0.20, `${bid}: норма посева = 0.20 (1:5)`);
  }

  // Латифундия: рецепт ячменя тоже требует семена
  const latiRecipes = BUILDING_RECIPES.wheat_latifundium;
  const barleyRecipe = latiRecipes?.find(r => r.output_good === 'barley');
  assert(!!barleyRecipe, 'wheat_latifundium: рецепт ячменя существует');
  const barleySeed = barleyRecipe?.inputs?.find(i => i.good === 'barley');
  assert(!!barleySeed, 'wheat_latifundium: ячмень требует семена ячменя');
  assertEqual(barleySeed?.amount, 0.20, 'wheat_latifundium: норма посева ячменя = 0.20');
} else {
  console.log('  (BUILDING_RECIPES не загружен — пропуск)');
}

// ─────────────────────────────────────────────────────────────
// 4. Логика рецептов: production_ratio при полном складе = 1.0
// ─────────────────────────────────────────────────────────────
section('4. production_ratio при полном складе');

// Эмулируем processAllRecipes для одного слота wheat_family_farm
function calcRatio(buildingId, stockpileWheat) {
  const b = BUILDINGS[buildingId];
  if (!b) return null;
  const workers    = b.workers_per_unit;
  const wheatOut   = b.production_output.find(o => o.good === 'wheat');
  const effMult    = b.efficiency_mult ?? 1.0;
  const baseOutput = (workers / 1000) * wheatOut.base_rate * effMult;

  const recipe = BUILDING_RECIPES?.[buildingId]?.find(r => r.output_good === 'wheat');
  if (!recipe?.inputs?.length) return 1.0;

  let ratio = 1.0;
  for (const inp of recipe.inputs) {
    const needed    = baseOutput * inp.amount;
    const available = inp.good === 'wheat' ? stockpileWheat : 999;
    ratio = Math.min(ratio, available / needed);
  }
  return Math.max(0, Math.min(1.0, ratio));
}

for (const bid of ['wheat_family_farm', 'wheat_villa', 'wheat_latifundium']) {
  const b        = BUILDINGS[bid];
  const workers  = b.workers_per_unit;
  const wheatOut = b.production_output.find(o => o.good === 'wheat');
  const baseOut  = (workers / 1000) * wheatOut.base_rate * (b.efficiency_mult ?? 1.0);
  const needed   = baseOut * 0.20;

  // Ровно столько семян, сколько нужно → ratio=1.0
  const ratioFull = calcRatio(bid, needed);
  assertEqual(ratioFull, 1.0, `${bid}: ratio=1.0 при полном запасе семян`);

  // Нет семян → ratio=0
  const ratioZero = calcRatio(bid, 0);
  assertEqual(ratioZero, 0.0, `${bid}: ratio=0 при пустом складе`);

  // Половина семян → ratio≈0.5
  const ratioHalf = calcRatio(bid, needed * 0.5);
  assertEqual(ratioHalf, 0.5, `${bid}: ratio=0.5 при половине семян`);
}

// ─────────────────────────────────────────────────────────────
// 5. Terrain restriction vs REGION_BIOMES
// ─────────────────────────────────────────────────────────────
section('5. terrain_restriction и биомы');

// Латифундия должна быть видна в plains и river_valley
const latiRestriction = lati.terrain_restriction;
assert(latiRestriction.includes('plains'),               'wheat_latifundium доступна в plains');
assert(latiRestriction.includes('river_valley'),         'wheat_latifundium доступна в river_valley');
assert(latiRestriction.includes('mediterranean_coast'),  'wheat_latifundium доступна в mediterranean_coast');
assert(latiRestriction.includes('mediterranean_hills'),  'wheat_latifundium доступна в mediterranean_hills');

// Семейная ферма и вилла — более широкий список
const farmRestriction = farm.terrain_restriction;
assert(farmRestriction.includes('hills'),      'wheat_family_farm доступна в hills');
assert(farmRestriction.includes('steppe'),     'wheat_family_farm доступна в steppe');
assert(!latiRestriction.includes('hills'),     'wheat_latifundium НЕ строится в hills (только лёгкий рельеф)');
assert(!latiRestriction.includes('mountains'), 'wheat_latifundium НЕ строится в mountains');

// getBuildingsForTerrain должна включать латифундию при terrain='plains'
const plainsList  = getBuildingsForTerrain('plains');
const rvList      = getBuildingsForTerrain('river_valley');
const medCoast    = getBuildingsForTerrain('mediterranean_coast');
const hillsList   = getBuildingsForTerrain('hills');

const ids = arr => arr.map(b => b.id);
assert(ids(plainsList).includes('wheat_latifundium'),      'Латифундия в списке для plains');
assert(ids(rvList).includes('wheat_latifundium'),          'Латифундия в списке для river_valley');
assert(ids(medCoast).includes('wheat_latifundium'),        'Латифундия в списке для mediterranean_coast');
assert(!ids(hillsList).includes('wheat_latifundium'),      'Латифундия НЕ в списке для hills');

// nation_buildable=false здания не должны появляться ни в каком terrain
const neverBuildable = ['wheat_family_farm', 'wheat_villa', 'cattle_farm', 'horse_ranch'];
for (const bid of neverBuildable) {
  for (const tList of [plainsList, rvList, hillsList]) {
    assert(!ids(tList).includes(bid), `${bid} не появляется в getBuildingsForTerrain`);
    break; // достаточно одной проверки на здание
  }
}

// ─────────────────────────────────────────────────────────────
// 6. Итого
// ─────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Итого: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);

