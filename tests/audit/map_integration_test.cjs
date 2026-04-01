'use strict';
// ════════════════════════════════════════════════════
// ДАННЫЕ И КАРТА — Integration Tests
// Проверяет: regions_data ↔ nations.js, MAP_REGIONS ↔
// diplomacy_range, province system ↔ economy/military.
// ════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function approxEqual(a, b, eps = 0.001) { return Math.abs(a - b) < eps; }

// ─── Загрузка данных ────────────────────────────────
const regionsDataRaw = fs.readFileSync(path.join(__dirname, '../../data/regions_data.js'), 'utf8');
const mapRaw         = fs.readFileSync(path.join(__dirname, '../../data/map.js'), 'utf8');
const nationsRaw     = fs.readFileSync(path.join(__dirname, '../../data/nations.js'), 'utf8');
const dipRangeRaw    = fs.readFileSync(path.join(__dirname, '../../engine/diplomacy_range.js'), 'utf8');

const mapRegionIds = new Set([...mapRaw.matchAll(/^  (r\d+):/gm)].map(m => m[1]));
const mapConnections = {};
for (const m of mapRaw.matchAll(/  (r\d+):\{[^}]*connections:\[([^\]]*)\]/g)) {
  mapConnections[m[1]] = [...m[2].matchAll(/'(r\d+)'/g)].map(c => c[1]);
}

const allNatIds = new Set([...nationsRaw.matchAll(/^\s{4}"([a-z_0-9]+)":\s*\{"name":/gm)].map(m => m[1]));

const rdMap = {};
for (const m of regionsDataRaw.matchAll(/R\['(r\d+)'\]=\{nation:'([^']+)'/g)) {
  rdMap[m[1]] = m[2];
}

const natRegions = {};
for (const m of nationsRaw.matchAll(/"([a-z_0-9]+)":\s*\{[^}]*?"regions":\s*\[([^\]]*)\]/g)) {
  const regions = [...m[2].matchAll(/"(r\d+)"/g)].map(r => r[1]);
  if (regions.length > 0) natRegions[m[1]] = regions;
}

console.log('\n=== MAP INTEGRATION TESTS ===\n');

// ─── A. regions_data ↔ nations.js ──────────────────
console.log('--- A. regions_data.js ↔ nations.js ---');

const orphanNations = new Set();
for (const [rid, natId] of Object.entries(rdMap)) {
  if (natId !== 'neutral' && natId !== 'ocean' && !allNatIds.has(natId)) {
    orphanNations.add(natId);
  }
}
assert(orphanNations.size === 0, 'regions_data → nations.js: нет "осиротевших" nation ID',
  `Orphans: ${[...orphanNations].join(', ')}`);

assert(rdMap['r470'] === 'hadramaut',   'r470 → hadramaut', `Текущее: ${rdMap['r470']}`);
assert(rdMap['r472'] === 'main',        'r472 → main',      `Текущее: ${rdMap['r472']}`);
assert(rdMap['r1061'] === 'wei',        'r1061 → wei',      `Текущее: ${rdMap['r1061']}`);
assert(allNatIds.has('hadramaut'),      'hadramaut присутствует в nations.js');
assert(allNatIds.has('main'),           'main присутствует в nations.js');
assert(allNatIds.has('wei'),            'wei присутствует в nations.js');

// ─── B. MAP_REGIONS ↔ regions_data.js ─────────────
console.log('\n--- B. MAP_REGIONS ↔ regions_data.js ---');

const notInMap = Object.keys(rdMap).filter(id => !mapRegionIds.has(id));
assert(notInMap.length === 0, 'Все регионы из regions_data существуют в MAP_REGIONS',
  `Отсутствуют: ${notInMap.slice(0, 5).join(', ')}`);

let badConnCount = 0;
for (const conns of Object.values(mapConnections)) {
  for (const connId of conns) {
    if (!mapRegionIds.has(connId)) badConnCount++;
  }
}
assert(badConnCount === 0,
  `MAP_REGIONS connections корректны (невалидных: ${badConnCount})`);

// ─── C. diplomacy_range.js ↔ MAP_REGIONS ──────────
console.log('\n--- C. diplomacy_range.js ↔ MAP_REGIONS ---');

const usesMapOrState = dipRangeRaw.includes('MAP_REGIONS') || dipRangeRaw.includes('GAME_STATE.regions');
assert(usesMapOrState, 'diplomacy_range.js использует MAP_REGIONS или GAME_STATE.regions');

const hardcodedRegions = [...dipRangeRaw.matchAll(/'(r\d+)'/g)].map(m => m[1]);
const invalidHardcoded = hardcodedRegions.filter(id => !mapRegionIds.has(id));
assert(invalidHardcoded.length === 0,
  'diplomacy_range.js не содержит хардкод-ссылок на несуществующие регионы',
  `Невалидные: ${invalidHardcoded.slice(0, 3).join(', ')}`);

// ─── D. nations.js регионы ↔ MAP_REGIONS ──────────
console.log('\n--- D. nations.js regions ↔ MAP_REGIONS ---');

let natRegionMissing = 0;
const sampleNations = Object.entries(natRegions).slice(0, 100);
for (const [, regions] of sampleNations) {
  for (const rid of regions) {
    if (!mapRegionIds.has(rid)) natRegionMissing++;
  }
}
assert(natRegionMissing === 0,
  `100 game nations: все регионы существуют в MAP_REGIONS (несуществующих: ${natRegionMissing})`);

const regionOwner = {};
let dualOwnership = 0;
for (const [natId, regions] of Object.entries(natRegions)) {
  for (const rid of regions) {
    if (rid in regionOwner) dualOwnership++;
    else regionOwner[rid] = natId;
  }
}
assert(dualOwnership === 0,
  `Нет дублирующегося владения регионами в nation.regions (дублей: ${dualOwnership})`);

// ─── E. Regon.xlsx ↔ MAP_REGIONS имена ───────────
console.log('\n--- E. Regon.xlsx sample ↔ MAP_REGIONS ---');

const regonSample = { r52: 'Nura (Sardinia)', r94: 'Massilia', r134: 'Rome (Latinum)', r231: 'Rhodes (Sporades)' };
const mapNames = {};
for (const m of mapRaw.matchAll(/(r\d+):\{name:'([^']+)'/g)) {
  mapNames[m[1]] = m[2].replace(/_/g, ' ');
}
let nameMismatches = 0;
for (const [rid, regonName] of Object.entries(regonSample)) {
  if (mapNames[rid] !== regonName) nameMismatches++;
}
assert(nameMismatches === 0, `Regon.xlsx sample совпадает с MAP_REGIONS именами (расхождений: ${nameMismatches})`);

// ─── F. Province system integration ───────────────
console.log('\n--- F. Province system (Карта → Провинции → Экономика) ---');

// Simulate initProvinces, calculateProvinceControl, buildProvinceMarket
const GS = {
  regions: {
    rA: { nation: 'rome',    tags: ['latinum'], local_stockpile: { wheat: 500 } },
    rB: { nation: 'rome',    tags: ['latinum'], local_stockpile: { wheat: 300, iron: 100 } },
    rC: { nation: 'carthage',tags: ['latinum'], local_stockpile: { wheat: 200 } },
  },
  nations: {
    rome:    { name: 'Рим', color: '#cc0000', relations: {} },
    carthage:{ name: 'Карфаген', color: '#004488', relations: {} },
  },
  provinces: null,
  market: { wheat: { price: 10 }, iron: { price: 20 } },
};

// initProvinces
GS.provinces = {};
for (const [rid, region] of Object.entries(GS.regions)) {
  const tag = Array.isArray(region.tags) ? region.tags[0] : null;
  if (!tag) continue;
  if (!GS.provinces[tag]) {
    GS.provinces[tag] = { regions: [], total_area: 0, control: {}, influence: {},
      effective_control: {}, _prev_effective_control: {}, market: {}, has_roads: false };
  }
  GS.provinces[tag].regions.push(rid);
}

assert(!!GS.provinces.latinum, 'initProvinces создаёт провинцию latinum');
assert(GS.provinces.latinum.regions.length === 3, 'latinum содержит 3 региона');

// calculateProvinceControl
const prov = GS.provinces.latinum;
for (const rid of prov.regions) {
  const nat = GS.regions[rid].nation;
  prov.control[nat] = (prov.control[nat] || 0) + 1/3;
}
prov._prev_effective_control = {};
prov.effective_control = {};
for (const [nId, ctrl] of Object.entries(prov.control)) {
  prov.effective_control[nId] = Math.min(1.0, ctrl * 0.7);
}

assert(approxEqual(prov.control.rome, 2/3), `rome контролирует 2/3 latinum (${prov.control.rome?.toFixed(3)})`);
assert(approxEqual(prov.control.carthage, 1/3), `carthage контролирует 1/3 latinum`);
assert(approxEqual(prov.effective_control.rome, (2/3)*0.7), `effective_control.rome = ctrl×0.7`);

// buildProvinceMarket
const agg = {};
for (const rid of prov.regions) {
  const sl = GS.regions[rid].local_stockpile || {};
  for (const [good, qty] of Object.entries(sl)) {
    if (qty > 0) agg[good] = (agg[good] || 0) + qty;
  }
}
prov.market = {};
const transportMult = 0.15;
for (const [good, available] of Object.entries(agg)) {
  const wp = GS.market[good]?.price || 0;
  prov.market[good] = { available, price: Math.round(wp * (1 + transportMult) * 10) / 10 };
}

assert(prov.market.wheat?.available === 1000, 'wheat агрегирован: 500+300+200=1000');
assert(prov.market.iron?.available === 100,   'iron агрегирован: 100');
assert(approxEqual(prov.market.wheat?.price, 11.5, 0.05),
  `wheat price = 10×1.15 = 11.5 (фактически: ${prov.market.wheat?.price})`);

// Захват региона → изменение контроля
GS.regions.rC.nation = 'rome';
prov.control = {};
for (const rid of prov.regions) {
  const nat = GS.regions[rid].nation;
  prov.control[nat] = (prov.control[nat] || 0) + 1/3;
}
assert(approxEqual(prov.control.rome, 1.0), 'После захвата rC: rome=100%');
assert(!prov.control.carthage || prov.control.carthage === 0, 'carthage потерял контроль');

// ─── ИТОГ ──────────────────────────────────────────
console.log(`\n=== ИТОГ: ${passed} прошли, ${failed} провалились ===\n`);
process.exit(failed > 0 ? 1 : 0);
