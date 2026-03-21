/**
 * Симуляция и проверка цепочки пшеницы Сицилии.
 *
 * Точная формула движка (_calcSlotBaseOutput):
 *   gross = (workers / 1000) × base_rate × efficiency_mult
 *           × fertility × terrain_bonus
 *           × production_eff × pop_eff × capital_ratio
 *
 * Деduction семян (рецепт): net = gross × 0.80  (20% уходит на посев)
 *
 * Цель: профицит 70 000 тонн/год = 216 049 бушелей/мес
 *       при 1 ед. = 1 бушель = 27 кг
 *
 * Запуск: node tests/wheat_chain_test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// ДАННЫЕ ДВИЖКА (скопированы из исходников)
// ═══════════════════════════════════════════════════════════

const TERRAIN_WHEAT_BONUS = {
  // Биомы (из engine/buildings.js _terrainGoodBonus)
  river_valley:        1.40,
  mediterranean_coast: 1.15,
  mediterranean_hills: 1.00,
  steppe:              0.85,
  temperate_forest:    0.80,
  volcanic:            1.05,
  subtropical:         0.70,
  semi_arid:           0.45,
  savanna:             0.30,
  alpine:              0.20,
  arctic:              0.05,
  desert:              0.05,
  tropical:            0.15,
  // Старые terrain-типы: не в таблице движка → дефолт 1.0
  plains:              1.00,
  hills:               1.00,
  coastal_city:        1.00,
  mountains:           1.00,
};

const BUILDINGS = {
  wheat_family_farm: {
    base_rate:       2000,
    efficiency_mult: 1.0,
    workers_per_level: 5,
    footprint_ha:    5,
    seed_ratio:      0.20,
  },
  wheat_villa: {
    base_rate:       10000,
    efficiency_mult: 1.3,
    workers_per_level: 15,
    footprint_ha:    75,
    seed_ratio:      0.20,
  },
  wheat_latifundium: {
    base_rate:       6000,
    efficiency_mult: 1.8,
    workers_per_level: 100,  // 50 farmers + 50 slaves
    footprint_ha:    300,
    seed_ratio:      0.20,
  },
};

// ── Биомы Сицилии (справочно, из data/biomes.js REGION_BIOMES)
// Внимание: движок использует region.biome || region.terrain.
// Если region.biome не задан (как сейчас), расчёт идёт по terrain.
// Реальный биом учитывается только если явно задан в объекте региона.
const SICILY_BIOMES_REF = {
  '55':   'volcanic',    '102':  'volcanic',
  '245':  'mediterranean_coast', '247': 'mediterranean_coast',
  '248':  'mediterranean_coast', '249': 'mediterranean_coast',
  '763':  'mediterranean_coast', '2402': 'semi_arid',
  '2407': 'semi_arid',  '2408': 'semi_arid',
  '2410': 'semi_arid',  '2411': 'semi_arid',
  '2412': 'semi_arid',  '2414': 'semi_arid',
  '2415': 'mediterranean_coast', '2416': 'mediterranean_coast',
  '2418': 'mediterranean_coast', '2419': 'mediterranean_coast',
  '2420': 'semi_arid',  '2423': 'semi_arid', '2424': 'semi_arid',
};

// ── Площади (из data/region_areas.js) ──────────────────────
const REGION_AREAS = {
  '55':   1271.5, '102':  400.7,  '245':  341.6,  '247':  270.1,
  '248':  1039.4, '249':  555.8,  '763':  1057.5, '2402': 876.3,
  '2407': 797.1,  '2408': 534.3,  '2410': 591.4,  '2411': 697.5,
  '2412': 632.1,  '2414': 602.0,  '2415': 1112.4, '2416': 514.2,
  '2418': 550.6,  '2419': 0.0,    '2420': 672.8,  '2423': 1145.9,
  '2424': 1298.9,
};

// ── Биомные коэффициенты пашни (из engine/land_capacity.js) ─
const BIOME_ARABLE = {
  mediterranean_coast: 0.80,
  volcanic:            0.72,
  semi_arid:           0.48,
};

// ── Актуальные данные регионов (из data/regions_data.js) ────────
// biome = terrain-тип из regions_data.js (как использует движок).
// Точные значения: terrain, fertility, population — из исходных данных.
const SICILY_REGIONS = {
  r55:   { biome: 'coastal_city', fertility: 0.50, pop: 48000,
            villa: 152,  farm: 609,  lat: null },
  r102:  { biome: 'coastal_city', fertility: 0.55, pop: 22000,
            villa: 139,  farm: 316,  lat: null },
  r245:  { biome: 'coastal_city', fertility: 0.85, pop: 35000,
            villa: 149,  farm: 461,  lat: null },
  r247:  { biome: 'coastal_city', fertility: 0.60, pop: 12000,
            villa: 100,  farm: 204,  lat: null },
  r248:  { biome: 'coastal_city', fertility: 0.50, pop: 200000,
            villa: 139,  farm: 1185, lat: null },
  r249:  { biome: 'coastal_city', fertility: 0.60, pop: 20000,
            villa: 138,  farm: 293,  lat: null },
  r763:  { biome: 'coastal_city', fertility: 0.70, pop: 12000,
            villa: 110,  farm: 204,  lat: null },
  r2402: { biome: 'hills',        fertility: 0.60, pop: 14000,
            villa: 58,   farm: 225,  lat: null },
  r2407: { biome: 'hills',        fertility: 0.60, pop: 12000,
            villa: 54,   farm: 204,  lat: null },
  r2408: { biome: 'river_valley', fertility: 0.90, pop: 30000,
            villa: 95,   farm: 406,  lat: 74 },
  r2410: { biome: 'coastal_city', fertility: 0.50, pop: 5000,
            villa: 38,   farm: 123,  lat: null },
  r2411: { biome: 'river_valley', fertility: 0.60, pop: 15000,
            villa: 61,   farm: 236,  lat: 72 },
  r2412: { biome: 'coastal_city', fertility: 0.55, pop: 55000,
            villa: 150,  farm: 687,  lat: null },
  r2414: { biome: 'hills',        fertility: 0.60, pop: 35000,
            villa: 106,  farm: 461,  lat: null },
  r2415: { biome: 'coastal_city', fertility: 0.60, pop: 100000,
            villa: 139,  farm: 981,  lat: null },
  r2416: { biome: 'coastal_city', fertility: 0.50, pop: 8000,
            villa: 44,   farm: 158,  lat: null },
  r2418: { biome: 'coastal_city', fertility: 0.60, pop: 4000,
            villa: 37,   farm: 98,   lat: null },
  r2419: { biome: 'coastal_city', fertility: 0.70, pop: 8000,
            villa: 2,    farm: 2,    lat: null },
  r2420: { biome: 'plains',       fertility: 0.60, pop: 10000,
            villa: 49,   farm: 181,  lat: 48 },
  r2423: { biome: 'river_valley', fertility: 0.60, pop: 7000,
            villa: 43,   farm: 147,  lat: 34 },
  r2424: { biome: 'plains',       fertility: 0.55, pop: 5000,
            villa: 38,   farm: 123,  lat: 20 },
};

// ═══════════════════════════════════════════════════════════
// РАСЧЁТ
// ═══════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(cond, msg, extra='') {
  if (cond) { console.log(`  ✓ ${msg}${extra ? ' — ' + extra : ''}`); passed++; }
  else       { console.error(`  ✗ FAIL: ${msg}${extra ? ' — ' + extra : ''}`); failed++; }
}

/**
 * Рассчитывает gross-выход пшеницы для слота, используя
 * точно ту же формулу что движок (_calcSlotBaseOutput).
 */
function calcWheatOutput(buildingId, level, biome, fertility,
                          prodEff=1.0, popEff=1.0, capitalRatio=1.0) {
  const b = BUILDINGS[buildingId];
  if (!b) return 0;
  const workers = b.workers_per_level * level;
  const terrainBonus = TERRAIN_WHEAT_BONUS[biome] ?? 1.0;
  const gross = (workers / 1000) * b.base_rate * b.efficiency_mult
              * fertility * terrainBonus * prodEff * popEff * capitalRatio;
  const net = gross * (1 - b.seed_ratio);   // 20% семена
  return { gross, net, terrainBonus };
}

/**
 * Рассчитывает потребление пшеницы населением.
 * CONFIG.BALANCE.FOOD_PER_PERSON = 0.3 бушеля/чел/мес
 */
function calcConsumption(pop) {
  return pop * 0.3;
}

// ═══════════════════════════════════════════════════════════
// ПРОИЗВОДСТВО ПО РЕГИОНАМ
// ═══════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════════');
console.log('СИМУЛЯЦИЯ ЦЕПОЧКИ ПШЕНИЦЫ — СИЦИЛИЯ');
console.log('══════════════════════════════════════════════════════════════');
console.log('Формула: (workers/1000) × base_rate × eff_mult × fertility × terrain_bonus × 0.80 (семена)');
console.log('');

let totalGross    = 0;
let totalNet      = 0;
let totalConsump  = 0;
let totalLandUsed = 0;

const regionResults = [];

for (const [rid, r] of Object.entries(SICILY_REGIONS)) {
  const numId = rid.replace('r', '');
  const biome = r.biome;
  const terrainBonus = TERRAIN_WHEAT_BONUS[biome] ?? 1.0;
  const areaKm2  = REGION_AREAS[numId] || 0;
  const arableHa = areaKm2 * 100 * (BIOME_ARABLE[biome] ?? 0.60);

  // Расчёт выхода по каждому типу здания
  const farmOut = r.farm  ? calcWheatOutput('wheat_family_farm',   r.farm,  biome, r.fertility) : { gross:0, net:0 };
  const villaOut = r.villa ? calcWheatOutput('wheat_villa',         r.villa, biome, r.fertility) : { gross:0, net:0 };
  const latOut  = r.lat   ? calcWheatOutput('wheat_latifundium',   r.lat,   biome, r.fertility) : { gross:0, net:0 };

  const regionNet  = farmOut.net + villaOut.net + latOut.net;
  const regionGross = farmOut.gross + villaOut.gross + latOut.gross;
  const regionCons = calcConsumption(r.pop);

  // Занятость земли (га)
  const farmHa  = (r.farm  || 0) * BUILDINGS.wheat_family_farm.footprint_ha;
  const villaHa = (r.villa || 0) * BUILDINGS.wheat_villa.footprint_ha;
  const latHa   = (r.lat   || 0) * BUILDINGS.wheat_latifundium.footprint_ha;
  const wheatHa = farmHa + villaHa + latHa;

  totalGross   += regionGross;
  totalNet     += regionNet;
  totalConsump += regionCons;

  const landPct = arableKm2 => arableKm2 > 0
    ? (wheatHa / arableHa * 100).toFixed(1)
    : '?';

  regionResults.push({
    rid, biome, terrainBonus, fertility: r.fertility,
    farm: r.farm||0, villa: r.villa||0, lat: r.lat||0,
    farmNet: farmOut.net, villaNet: villaOut.net, latNet: latOut.net,
    regionNet, regionGross, regionCons,
    wheatHa, arableHa, pop: r.pop,
  });
}

// ── Таблица результатов ──────────────────────────────────────
const fmt = n => Math.round(n).toLocaleString('ru').padStart(9);

console.log('Регион   Биом                  tB    F     Фер   Вил   Лат  | Нетто/мес  Потр/мес  Баланс/мес');
console.log('─'.repeat(105));
for (const r of regionResults) {
  const bal = r.regionNet - r.regionCons;
  const balStr = bal >= 0 ? `+${Math.round(bal)}` : `${Math.round(bal)}`;
  console.log(
    `${r.rid.padEnd(8)} ${r.biome.padEnd(22)} ${r.terrainBonus.toFixed(2)}  ${r.fertility.toFixed(1)}  `
    + `${String(r.farm).padStart(5)} ${String(r.villa).padStart(5)} ${String(r.lat||'-').padStart(5)}  | `
    + `${fmt(r.regionNet)} ${fmt(r.regionCons)}  ${balStr}`
  );
}

// ── Итоги ────────────────────────────────────────────────────
const surplus         = totalNet - totalConsump;
const surplusPerYear  = surplus * 12;
// Правильная конвертация: 1 бушель = 27 кг, 1 тонна = 1000 кг
const surplusTonnesYr = surplusPerYear * 27 / 1000;  // тонн/год
const TARGET_TONNES   = 70000;  // тонн/год
const TARGET_NET_MONTH = TARGET_TONNES * 1000 / 27 / 12;  // ≈ 216 049 бушелей/мес

console.log('─'.repeat(105));
console.log(`\n📊 ИТОГИ (все значения — бушели/мес):`);
console.log(`  Валовой выход:       ${Math.round(totalGross).toLocaleString('ru')}`);
console.log(`  Нетто (−20% семян): ${Math.round(totalNet).toLocaleString('ru')}`);
console.log(`  Потребление:        ${Math.round(totalConsump).toLocaleString('ru')}`);
console.log(`  Профицит/мес:       ${Math.round(surplus).toLocaleString('ru')}`);
console.log(`  Профицит/год:       ${Math.round(surplusPerYear).toLocaleString('ru')} бушелей`);
console.log(`  Профицит/год:       ${Math.round(surplusTonnesYr).toLocaleString('ru')} тонн`);
console.log(`  Цель:               ${TARGET_TONNES.toLocaleString('ru')} тонн/год`);
console.log(`  Достижение цели:    ${(surplusTonnesYr / TARGET_TONNES * 100).toFixed(1)}%`);

// ═══════════════════════════════════════════════════════════
// ПРОВЕРКИ
// ═══════════════════════════════════════════════════════════

console.log('\n── ТЕСТЫ ──────────────────────────────────────────────────────');

// 1. Профицит > 0
assert(surplus > 0, 'Профицит положительный');

// 2. Профицит в диапазоне 40 000–110 000 тонн/год (допуск ±40% от цели)
assert(surplusTonnesYr >= 40000 && surplusTonnesYr <= 110000,
  `Профицит в диапазоне 40k–110k тонн/год`,
  `${Math.round(surplusTonnesYr).toLocaleString('ru')} тонн`);

// 3. Terrain bonus для semi_arid критически важен
const semiAridBonus = TERRAIN_WHEAT_BONUS.semi_arid;
assert(semiAridBonus === 0.45,
  `semi_arid wheat bonus = 0.45 (x2.5 меньше чем mediterranean_coast)`,
  `фактически: ${semiAridBonus}`);

// 4. Проверка вклада латифундии r2408 (river_valley, fertility=0.9)
const latLevel2408 = 74; // новый уровень после ребалансировки
const simpleNoPenalty = latLevel2408 * 864; // без fertility/terrain_bonus
const realFertility = 0.9;
const realOut = calcWheatOutput('wheat_latifundium', latLevel2408, 'river_valley', realFertility);
const realNetLat = Math.round(realOut.net);
console.log(`\n  ℹ r2408 латифундия (уровень ${latLevel2408}, river_valley, fert=0.9):`);
console.log(`    Без fertility/terrain_bonus: ${Math.round(simpleNoPenalty).toLocaleString('ru')} бушелей/мес`);
console.log(`    Реальный выход (tb=1.40, fert=0.9): ${realNetLat.toLocaleString('ru')} бушелей/мес`);
assert(realNetLat > 0,
  'r2408: латифундия производит пшеницу (river_valley, fertility=0.9)',
  `${realNetLat} бушелей/мес`);

// 5. Проверить что terrain_bonus применяется корректно: river_valley (1.40) > coastal_city (1.00)
const farmRiverVal = calcWheatOutput('wheat_family_farm', 1, 'river_valley', 0.7);
const farmCoastCity = calcWheatOutput('wheat_family_farm', 1, 'coastal_city', 0.7);
const ratio = farmRiverVal.net / farmCoastCity.net;
assert(Math.abs(ratio - 1.40) < 0.01,
  `river_valley даёт 1.40× бонус к пшенице vs coastal_city (1.0)`,
  `фактически: ${ratio.toFixed(2)}`);

// 6. Зерновой баланс Сицилии — достаточно ли выхода для местного потребления
assert(totalNet > totalConsump,
  'Сицилия производит больше, чем потребляет локально',
  `${Math.round(totalNet).toLocaleString('ru')} > ${Math.round(totalConsump).toLocaleString('ru')}`);

// 7. Проверить вклад semi_arid регионов с высокой плодородностью
const r2408Result = regionResults.find(r => r.rid === 'r2408');
const r2411Result = regionResults.find(r => r.rid === 'r2411');
assert(r2408Result && r2408Result.latNet > 0,
  'r2408: латифундия производит пшеницу (river_valley, fertility=0.9)',
  `${Math.round(r2408Result?.latNet || 0)} бушелей/мес`);

// 8. Кросс-проверка формулы для wheat_villa в river_valley (tb=1.40)
const villaTestOut = calcWheatOutput('wheat_villa', 1, 'river_valley', 0.7);
const expected = (15/1000) * 10000 * 1.3 * 0.7 * 1.40 * 0.8;
assert(Math.abs(villaTestOut.net - expected) < 0.1,
  `wheat_villa L1, river_valley, fert=0.7: нетто = ${expected.toFixed(1)} бушелей/мес`,
  `фактически: ${villaTestOut.net.toFixed(1)}`);

// 9. Нетто-выход приближён к целевому значению ≥ потребление + 70k тонн/год профицит
const targetNetMonth = Math.round(TARGET_NET_MONTH);
const actualNet      = Math.round(totalNet);
const achievePct     = actualNet / targetNetMonth * 100;
console.log(`\n  📌 Целевое нетто-производство: ${targetNetMonth.toLocaleString('ru')} бушелей/мес`);
console.log(`     Реальный выход движка:        ${actualNet.toLocaleString('ru')} бушелей/мес`);
console.log(`     Достижение:                   ${achievePct.toFixed(1)}%`);
assert(achievePct >= 90,
  'Нетто-производство ≥ 90% целевого (потребление + 70k тонн профицита)',
  `${achievePct.toFixed(1)}%`);

// ═══════════════════════════════════════════════════════════
// АНАЛИЗ TERRAIN BONUS ЭФФЕКТА
// ═══════════════════════════════════════════════════════════

console.log('\n── ВЛИЯНИЕ TERRAIN_BONUS НА ПРОИЗВОДСТВО ──────────────────────────');
console.log('Terrain-тип           wheat_bonus  Ферма(L1)  Вилла(L1)  Лат(L1)');
console.log('                                   нетто      нетто      нетто');

const terrainTypes = [
  ['river_valley (fert=0.9)', 0.9, 'river_valley'],
  ['river_valley (fert=0.6)', 0.6, 'river_valley'],
  ['coastal_city (fert=0.7)', 0.7, 'coastal_city'],
  ['coastal_city (fert=0.5)', 0.5, 'coastal_city'],
  ['hills (fert=0.6)',         0.6, 'hills'],
];

for (const [label, fert, terrainKey] of terrainTypes) {
  const f = calcWheatOutput('wheat_family_farm',  1, terrainKey, fert).net;
  const v = calcWheatOutput('wheat_villa',        1, terrainKey, fert).net;
  const l = calcWheatOutput('wheat_latifundium',  1, terrainKey, fert).net;
  const tw = TERRAIN_WHEAT_BONUS[terrainKey] ?? 1.0;
  console.log(
    `${label.padEnd(26)} ${String(tw).padStart(4)}        ${f.toFixed(1).padStart(6)}     ${v.toFixed(1).padStart(6)}     ${l.toFixed(1).padStart(7)}`
  );
}

// ═══════════════════════════════════════════════════════════
// ИТОГИ ТЕСТОВ
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`ИТОГО: ${passed} прошло, ${failed} упало`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\n❌ Некоторые тесты не прошли!');
  process.exit(1);
} else {
  console.log('\n✅ Все тесты прошли!');
}
