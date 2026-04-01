/**
 * AUDIT: Данные и карта — Integration тест
 * Проверяет связи: regions_data ↔ nations.js, MAP_REGIONS ↔ diplomacy_range, Regon.xlsx ↔ map.js
 * Запуск: node tests/audit/map_integration_test.cjs
 */

'use strict';

const fs = require('fs');
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

// ─── Загрузка данных ────────────────────────────────────────────────────────
const regionsDataRaw = fs.readFileSync(path.join(__dirname, '../../data/regions_data.js'), 'utf8');
const mapRaw         = fs.readFileSync(path.join(__dirname, '../../data/map.js'), 'utf8');
const nationsRaw     = fs.readFileSync(path.join(__dirname, '../../data/nations.js'), 'utf8');
const dipRangeRaw    = fs.readFileSync(path.join(__dirname, '../../engine/diplomacy_range.js'), 'utf8');

// Парсим MAP_REGIONS: id → {name, nation, connections}
// Используем простой надёжный паттерн для извлечения ID
const mapRegionIds = new Set([...mapRaw.matchAll(/^  (r\d+):/gm)].map(m => m[1]));

// Извлекаем connections через отдельный паттерн
const mapConnections = {};
for (const m of mapRaw.matchAll(/  (r\d+):\{[^}]*connections:\[([^\]]*)\]/g)) {
  const connIds = [...m[2].matchAll(/'(r\d+)'/g)].map(c => c[1]);
  mapConnections[m[1]] = connIds;
}

// Парсим nation ID из nations.js (только top-level ключи в секции nations)
const allNatIds = new Set([...nationsRaw.matchAll(/^\s{4}"([a-z_0-9]+)":\s*\{"name":/gm)].map(m => m[1]));

// Парсим region → nation из regions_data.js
const rdMap = {};
for (const m of regionsDataRaw.matchAll(/R\['(r\d+)'\]=\{nation:'([^']+)'/g)) {
  rdMap[m[1]] = m[2];
}

// Парсим nations.js: game nation → regions[]
const natRegions = {};
for (const m of nationsRaw.matchAll(/"([a-z_0-9]+)":\s*\{[^}]*?"regions":\s*\[([^\]]*)\]/g)) {
  const regions = [...m[2].matchAll(/"(r\d+)"/g)].map(r => r[1]);
  if (regions.length > 0) {
    natRegions[m[1]] = regions;
  }
}

// ─── Тесты ─────────────────────────────────────────────────────────────────
console.log('\n=== MAP INTEGRATION TESTS ===\n');

// ─── A. regions_data ↔ nations.js ──────────────────────────────────────────
console.log('--- A. regions_data.js ↔ nations.js ---');

// Все region.nation в regions_data должны существовать в nations.js
const orphanNations = new Set();
for (const [rid, natId] of Object.entries(rdMap)) {
  if (natId !== 'neutral' && natId !== 'ocean' && !allNatIds.has(natId)) {
    orphanNations.add(natId);
  }
}
assert(orphanNations.size === 0,
  'regions_data → nations.js: нет "осиротевших" nation ID',
  `Orphans: ${[...orphanNations].join(', ')}`);

// Конкретная проверка: исправленные регионы
assert(rdMap['r470'] === 'hadramaut',
  'r470 → hadramaut существует в nations.js',
  `Текущее: ${rdMap['r470']}`);
assert(rdMap['r472'] === 'main',
  'r472 → main (Ма\'ин) существует в nations.js',
  `Текущее: ${rdMap['r472']}`);
assert(rdMap['r1061'] === 'wei',
  'r1061 → wei существует в nations.js',
  `Текущее: ${rdMap['r1061']}`);

// hadramaut, main, wei должны быть в nations.js
assert(allNatIds.has('hadramaut'), 'hadramaut присутствует в nations.js');
assert(allNatIds.has('main'), 'main (Kingdom of Ma\'in) присутствует в nations.js');
assert(allNatIds.has('wei'), 'wei (Царство Вэй) присутствует в nations.js');

// ─── B. MAP_REGIONS ↔ regions_data.js ─────────────────────────────────────
console.log('\n--- B. MAP_REGIONS ↔ regions_data.js ---');

// Каждый регион из regions_data должен существовать в MAP_REGIONS
const rdIds = Object.keys(rdMap);
const notInMap = rdIds.filter(id => !mapRegionIds.has(id));
assert(notInMap.length === 0,
  'Все регионы из regions_data существуют в MAP_REGIONS',
  `Отсутствуют: ${notInMap.slice(0, 5).join(', ')}`);

// MAP_REGIONS connections: все указанные регионы должны существовать
let badConnCount = 0;
for (const [rid, conns] of Object.entries(mapConnections)) {
  for (const connId of conns) {
    if (!mapRegionIds.has(connId)) {
      badConnCount++;
    }
  }
}
assert(badConnCount === 0,
  `MAP_REGIONS: все connections указывают на существующие регионы (найдено невалидных: ${badConnCount})`);

// ─── C. diplomacy_range.js ↔ MAP_REGIONS ──────────────────────────────────
console.log('\n--- C. diplomacy_range.js ↔ MAP_REGIONS ---');

// diplomacy_range должен использовать MAP_REGIONS или GAME_STATE.regions
// (не прямое обращение по несуществующим регионам)
const usesMapOrState = dipRangeRaw.includes('MAP_REGIONS') || dipRangeRaw.includes('GAME_STATE.regions');
assert(usesMapOrState,
  'diplomacy_range.js использует MAP_REGIONS или GAME_STATE.regions для обхода карты');

// Проверяем, что нет жёстко закодированных несуществующих ID регионов
const hardcodedRegions = [...dipRangeRaw.matchAll(/'(r\d+)'/g)].map(m => m[1]);
const invalidHardcoded = hardcodedRegions.filter(id => !mapRegionIds.has(id));
assert(invalidHardcoded.length === 0,
  'diplomacy_range.js не содержит хардкод-ссылок на несуществующие регионы',
  `Невалидные: ${invalidHardcoded.slice(0, 3).join(', ')}`);

// ─── D. nations.js — регионы game nations ──────────────────────────────────
console.log('\n--- D. nations.js — регионы game nations ↔ MAP_REGIONS ---');

// Для game nations: все регионы в nation.regions должны существовать в MAP_REGIONS
let natRegionMissing = 0;
const sampleNations = Object.entries(natRegions).slice(0, 100);
for (const [natId, regions] of sampleNations) {
  for (const rid of regions) {
    if (!mapRegionIds.has(rid)) natRegionMissing++;
  }
}
assert(natRegionMissing === 0,
  `Первые 100 game nations: все регионы существуют в MAP_REGIONS (несуществующих: ${natRegionMissing})`);

// Проверка: регион не принадлежит двум game nations одновременно в regions_data
// (один регион должен быть у одной нации)
const regionOwner = {};
let dualOwnership = 0;
for (const [natId, regions] of Object.entries(natRegions)) {
  for (const rid of regions) {
    if (rid in regionOwner) {
      dualOwnership++;
    } else {
      regionOwner[rid] = natId;
    }
  }
}
assert(dualOwnership === 0,
  `Нет дублирующегося владения регионами в nation.regions (дублей: ${dualOwnership})`);

// ─── E. Regon.xlsx регионы ↔ MAP_REGIONS имена ────────────────────────────
console.log('\n--- E. Regon.xlsx sample ↔ MAP_REGIONS ---');

// Regon.xlsx регионы, для которых у нас есть данные из предыдущего анализа
// Проверяем несколько ключевых регионов напрямую
const regonSample = {
  'r52': 'Nura (Sardinia)',
  'r94': 'Massilia',
  'r134': 'Rome (Latinum)',
  'r231': 'Rhodes (Sporades)',
};

const mapNames = {};
for (const m of mapRaw.matchAll(/(r\d+):\{name:'([^']+)'/g)) {
  mapNames[m[1]] = m[2];
}

let regonMismatch = 0;
for (const [rid, expectedName] of Object.entries(regonSample)) {
  const mapName = mapNames[rid];
  if (mapName !== expectedName) {
    regonMismatch++;
    console.error(`    ! ${rid}: Regon="${expectedName}" vs map.js="${mapName}"`);
  }
}
assert(regonMismatch === 0,
  `Regon.xlsx sample совпадает с MAP_REGIONS именами (расхождений: ${regonMismatch})`);

// ─── Итог ───────────────────────────────────────────────────────────────────
console.log(`\n=== ИТОГ: ${passed} прошли, ${failed} провалились ===\n`);
process.exit(failed > 0 ? 1 : 0);
