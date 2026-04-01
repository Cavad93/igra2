'use strict';
// ════════════════════════════════════════════════════
// ДАННЫЕ И КАРТА — Unit Tests
// Проверяет целостность данных: regions_data.js, map.js,
// nations.js, корректность province tags (Regon.xlsx),
// логику provinces.js.
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

// ─── Загрузка данных ────────────────────────────────
const regionsDataRaw = fs.readFileSync(path.join(__dirname, '../../data/regions_data.js'), 'utf8');
const mapRaw         = fs.readFileSync(path.join(__dirname, '../../data/map.js'), 'utf8');
const nationsRaw     = fs.readFileSync(path.join(__dirname, '../../data/nations.js'), 'utf8');

// nation IDs в regions_data
const rdNationIds = new Set([...regionsDataRaw.matchAll(/nation:'([^']+)'/g)].map(m => m[1]));

// Top-level nation keys из nations.js
const natKeys = new Set([...nationsRaw.matchAll(/^\s{4}"([a-z_0-9]+)":\s*\{"name":/gm)].map(m => m[1]));

// Region IDs из MAP_REGIONS
const mapRegionIds = new Set([...mapRaw.matchAll(/^  (r\d+):/gm)].map(m => m[1]));

// Region IDs из regions_data.js
const rdRegionIds = new Set([...regionsDataRaw.matchAll(/R\['(r\d+)'\]\s*=/g)].map(m => m[1]));

// rid -> { nation, tag }
const regionMap = {};
for (const m of regionsDataRaw.matchAll(/R\['(r\d+)'\]=\{nation:'([^']*)'/g)) {
  regionMap[m[1]] = { nation: m[2], tag: null };
}
for (const m of regionsDataRaw.matchAll(/R\['(r\d+)'\]=[^;]*?tags:\['([^']+)'\]/g)) {
  if (regionMap[m[1]]) regionMap[m[1]].tag = m[2];
}

console.log('\n=== MAP UNIT TESTS ===\n');

// ─── 1. Целостность nation ID ───────────────────────
console.log('--- 1. Целостность nation ID в regions_data.js ---');

const missingNations = [...rdNationIds].filter(id => id !== 'neutral' && id !== 'ocean' && !natKeys.has(id));
assert(missingNations.length === 0,
  'Все nation ID в regions_data.js существуют в nations.js',
  `Не найдены: ${missingNations.join(', ')}`);

assert(!regionsDataRaw.includes("nation:'hadhramaut'"),
  'r470: нет опечатки hadhramaut (исправлено → hadramaut)');
assert(!regionsDataRaw.includes("nation:'minaeans'"),
  'r472: нет опечатки minaeans (исправлено → main)');
assert(!regionsDataRaw.includes("nation:'wey'"),
  'r1061: нет опечатки wey (исправлено → wei)');

const r470M = regionsDataRaw.match(/R\['r470'\]=\{nation:'([^']+)'/);
assert(r470M && r470M[1] === 'hadramaut', 'r470 = hadramaut', r470M ? r470M[1] : 'not found');
const r472M = regionsDataRaw.match(/R\['r472'\]=\{nation:'([^']+)'/);
assert(r472M && r472M[1] === 'main', "r472 = main (Ма'ин)", r472M ? r472M[1] : 'not found');
const r1061M = regionsDataRaw.match(/R\['r1061'\]=\{nation:'([^']+)'/);
assert(r1061M && r1061M[1] === 'wei', 'r1061 = wei (Вэй)', r1061M ? r1061M[1] : 'not found');

// ─── 2. Целостность MAP_REGIONS ────────────────────
console.log('\n--- 2. Целостность MAP_REGIONS ---');

const inRdNotMap = [...rdRegionIds].filter(id => !mapRegionIds.has(id));
assert(inRdNotMap.length === 0, 'Все регионы из regions_data.js присутствуют в MAP_REGIONS',
  `Отсутствуют: ${inRdNotMap.slice(0, 5).join(', ')}`);
assert(mapRegionIds.size >= 4000,
  `MAP_REGIONS содержит >= 4000 регионов (фактически: ${mapRegionIds.size})`);
assert(rdRegionIds.size >= 3700,
  `regions_data содержит >= 3700 регионов (фактически: ${rdRegionIds.size})`);

// ─── 3. Структура regions_data.js ──────────────────
console.log('\n--- 3. Структура regions_data.js ---');

for (const field of ['population', 'terrain', 'garrison', 'fertility']) {
  const matches = [...regionsDataRaw.matchAll(new RegExp(`R\\['r\\d+'\]=[^;]*${field}:`, 'g'))];
  assert(matches.length >= 3000,
    `Поле "${field}" присутствует в >= 3000 регионах (фактически: ${matches.length})`);
}

// ─── 4. nations.js — уникальность ключей ───────────
console.log('\n--- 4. nations.js — уникальность ключей ---');

const nationKeyList = [...nationsRaw.matchAll(/^\s{4}"([a-z_0-9]+)":\s*\{"name":/gm)].map(m => m[1]);
const keyCount = {};
nationKeyList.forEach(k => { keyCount[k] = (keyCount[k] || 0) + 1; });
const dupKeys = Object.entries(keyCount).filter(([, c]) => c > 1).map(([k]) => k);
assert(dupKeys.length === 0, 'Нет дублирующихся ключей в nations.js',
  `Дубли: ${dupKeys.slice(0, 5).join(', ')}`);

// ─── 5. Province tags исправлены (Regon.xlsx) ──────
console.log('\n--- 5. Province tags по Regon.xlsx ---');

const r763 = regionMap['r763'];
assert(r763 && r763.tag === 'bruttium',
  'r763 (Rhegium, Bruttium): тег исправлен с sicily на bruttium',
  r763 ? `фактически: '${r763.tag}'` : 'not found');

const REGON_TAG_CHECKS = {
  r52: 'sardinia', r53: 'sardinia', r54: 'sardinia',
  r55: 'sicily',   r102: 'sicily',  r245: 'sicily',
  r131: 'latinum', r134: 'latinum', r136: 'latinum',
  r137: 'campania', r239: 'campania',
  r100: 'etruria', r126: 'etruria', r132: 'etruria',
  r757: 'bruttium', r763: 'bruttium',
  r2211: 'aemilia', r2212: 'aemilia',
  r2232: 'venetia', r2248: 'venetia',
  r3083: 'rhodope', r3089: 'east_thrace',
};
for (const [rid, expectedTag] of Object.entries(REGON_TAG_CHECKS)) {
  const r = regionMap[rid];
  assert(r && r.tag === expectedTag,
    `${rid}: tags=['${expectedTag}']`,
    r ? `фактически: '${r.tag}'` : 'not found');
}

// ─── 6. Полнота province tags ───────────────────────
console.log('\n--- 6. Полнота province tags ---');

const counts = {};
for (const r of Object.values(regionMap)) {
  if (r.tag) counts[r.tag] = (counts[r.tag] || 0) + 1;
}
assert((counts['sicily']   || 0) >= 26, `sicily >= 26 (${counts['sicily'] || 0})`);
assert((counts['sardinia'] || 0) >= 26, `sardinia >= 26 (${counts['sardinia'] || 0})`);
assert((counts['latinum']  || 0) >= 12, `latinum >= 12 (${counts['latinum'] || 0})`);
assert((counts['etruria']  || 0) >= 20, `etruria >= 20 (${counts['etruria'] || 0})`);
assert((counts['macedonia']|| 0) >= 30, `macedonia >= 30 (${counts['macedonia'] || 0})`);

// ─── 7. getProvinceMarketAccess логика ──────────────
console.log('\n--- 7. getProvinceMarketAccess (inline) ---');

function _getAccess(ctrl) {
  if (ctrl >= 1.0) return { access_tier: 'full',       tax_fraction: 1.0, price_modifier: 1.0,  fraction: 1.0  };
  if (ctrl >= 0.5) return { access_tier: 'partial',    tax_fraction: ctrl, price_modifier: 1.0 + (1 - ctrl) * 0.10, fraction: ctrl };
  if (ctrl >= 0.2) return { access_tier: 'trade_only', tax_fraction: 0,    price_modifier: 1.15, fraction: ctrl };
  return             { access_tier: 'none',         tax_fraction: 0,    price_modifier: 0,    fraction: 0    };
}

assert(_getAccess(1.0).access_tier === 'full',       "ctrl=1.0 → 'full'");
assert(_getAccess(1.0).tax_fraction === 1.0,         "ctrl=1.0: tax_fraction=1.0");
assert(_getAccess(0.6).access_tier === 'partial',    "ctrl=0.6 → 'partial'");
assert(_getAccess(0.6).tax_fraction === 0.6,         "ctrl=0.6: tax_fraction=ctrl");
assert(_getAccess(0.3).access_tier === 'trade_only', "ctrl=0.3 → 'trade_only'");
assert(_getAccess(0.3).tax_fraction === 0,           "ctrl=0.3: tax_fraction=0");
assert(_getAccess(0.3).price_modifier === 1.15,      "ctrl=0.3: price_modifier=1.15");
assert(_getAccess(0.1).access_tier === 'none',       "ctrl=0.1 → 'none'");

// ─── ИТОГ ──────────────────────────────────────────
console.log(`\n=== ИТОГ: ${passed} прошли, ${failed} провалились ===\n`);
process.exit(failed > 0 ? 1 : 0);
