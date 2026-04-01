/**
 * AUDIT: Данные и карта — Unit тест
 * Проверяет целостность данных: regions_data.js, map.js, nations.js
 * Запуск: node tests/audit/map_unit_test.cjs
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
const mapRaw = fs.readFileSync(path.join(__dirname, '../../data/map.js'), 'utf8');
const nationsRaw = fs.readFileSync(path.join(__dirname, '../../data/nations.js'), 'utf8');

// Извлекаем все nation ID, используемые в regions_data.js
const rdNationIds = new Set([...regionsDataRaw.matchAll(/nation:'([^']+)'/g)].map(m => m[1]));

// Извлекаем только top-level ключи из INITIAL_GAME_STATE.nations (не вложенные name/ruler/etc)
// Паттерн: пробел+4пробела+"id": { — характерно для верхнего уровня словаря nations
const natKeys = new Set([...nationsRaw.matchAll(/^\s{4}"([a-z_0-9]+)":\s*\{"name":/gm)].map(m => m[1]));

// Извлекаем регионы из MAP_REGIONS
const mapRegionIds = new Set([...mapRaw.matchAll(/^  (r\d+):/gm)].map(m => m[1]));

// Извлекаем регионы из regions_data.js
const rdRegionIds = new Set([...regionsDataRaw.matchAll(/R\['(r\d+)'\]\s*=/g)].map(m => m[1]));

// ─── Тесты ─────────────────────────────────────────────────────────────────
console.log('\n=== MAP UNIT TESTS ===\n');

console.log('--- 1. Целостность nation ID в regions_data.js ---');

// Все nation ID в regions_data должны существовать в nations.js
const missingNations = [...rdNationIds].filter(id => id !== 'neutral' && id !== 'ocean' && !natKeys.has(id));
assert(missingNations.length === 0,
  'Все nation ID в regions_data.js существуют в nations.js',
  `Не найдены: ${missingNations.join(', ')}`);

// Конкретные ранее сломанные регионы
assert(!regionsDataRaw.includes("nation:'hadhramaut'"),
  'r470: нет опечатки hadhramaut (исправлено → hadramaut)');
assert(!regionsDataRaw.includes("nation:'minaeans'"),
  'r472: нет опечатки minaeans (исправлено → main)');
assert(!regionsDataRaw.includes("nation:'wey'"),
  'r1061: нет опечатки wey (исправлено → wei)');

// Правильные ID проставлены
const r470Match = regionsDataRaw.match(/R\['r470'\]=\{nation:'([^']+)'/);
assert(r470Match && r470Match[1] === 'hadramaut',
  'r470 присвоен nation hadramaut', r470Match ? r470Match[1] : 'not found');

const r472Match = regionsDataRaw.match(/R\['r472'\]=\{nation:'([^']+)'/);
assert(r472Match && r472Match[1] === 'main',
  'r472 присвоен nation main (Царство Ма\'ин)', r472Match ? r472Match[1] : 'not found');

const r1061Match = regionsDataRaw.match(/R\['r1061'\]=\{nation:'([^']+)'/);
assert(r1061Match && r1061Match[1] === 'wei',
  'r1061 присвоен nation wei (Царство Вэй)', r1061Match ? r1061Match[1] : 'not found');

console.log('\n--- 2. Целостность MAP_REGIONS ---');

// Все регионы в regions_data должны существовать в MAP_REGIONS
const inRdNotMap = [...rdRegionIds].filter(id => !mapRegionIds.has(id));
assert(inRdNotMap.length === 0,
  'Все регионы из regions_data.js присутствуют в MAP_REGIONS',
  `Отсутствуют в map.js: ${inRdNotMap.slice(0, 5).join(', ')}`);

// MAP_REGIONS содержит >= 4000 регионов (исторический минимум)
assert(mapRegionIds.size >= 4000,
  `MAP_REGIONS содержит ≥ 4000 регионов (фактически: ${mapRegionIds.size})`);

// regions_data содержит >= 3700 активных регионов
assert(rdRegionIds.size >= 3700,
  `regions_data содержит ≥ 3700 регионов (фактически: ${rdRegionIds.size})`);

console.log('\n--- 3. Структура regions_data.js ---');

// Каждый регион должен иметь обязательные поля
const requiredFields = ['population', 'terrain', 'garrison', 'fertility'];
for (const field of requiredFields) {
  // Sample check: first 50 regions
  const sampleMatches = [...regionsDataRaw.matchAll(new RegExp(`R\\['r\\d+'\]=[^;]*${field}:`, 'g'))];
  // At least 3000 regions should have each field
  assert(sampleMatches.length >= 3000,
    `Поле "${field}" присутствует в ≥ 3000 регионах (фактически: ${sampleMatches.length})`);
}

console.log('\n--- 4. nations.js — уникальность ключей ---');

// Проверяем, что ключ nations.js не дублируется как game nation
// ('antigonus' и 'antigonid_kingdom' — разные ключи, это допустимо)
const nationKeyList = [...nationsRaw.matchAll(/^\s{4}"([a-z_0-9]+)":\s*\{"name":/gm)].map(m => m[1]);
const keyCount = {};
nationKeyList.forEach(k => { keyCount[k] = (keyCount[k] || 0) + 1; });
const dupKeys = Object.entries(keyCount).filter(([, c]) => c > 1).map(([k]) => k);
assert(dupKeys.length === 0,
  'Нет дублирующихся ключей в nations.js',
  `Дубли: ${dupKeys.slice(0, 5).join(', ')}`);

// ─── Итог ───────────────────────────────────────────────────────────────────
console.log(`\n=== ИТОГ: ${passed} прошли, ${failed} провалились ===\n`);
process.exit(failed > 0 ? 1 : 0);
