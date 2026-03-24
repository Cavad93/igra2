#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ЭТАП 1: Генерация центроидов всех регионов из map.js
//
// Вход:  data/map.js
// Выход: data/region_centroids.js
//
// Для каждого региона вычисляем:
//   - centroid (среднее арифметическое всех вершин полигона)
//   - текущий nation в map.js
//   - terrain, mapType, name
//   - площадь (bbox-приближение в градусах)
//
// Запуск: node scripts/stage1_gen_centroids.js
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Загрузка map.js ───────────────────────────────────────────────
console.log('Загрузка data/map.js...');
const code = fs.readFileSync(path.join(ROOT, 'data', 'map.js'), 'utf8')
  .replace(/^const /mg, 'var ')
  .replace(/^let /mg,   'var ');

const sandbox = vm.createContext({ console });
vm.runInContext(code, sandbox);
const MAP_REGIONS = sandbox.MAP_REGIONS;

if (!MAP_REGIONS) {
  console.error('MAP_REGIONS не найден в data/map.js');
  process.exit(1);
}

const total = Object.keys(MAP_REGIONS).length;
console.log(`Всего регионов: ${total}`);

// ── Вычисление центроида и bbox ───────────────────────────────────
function centroid(coords) {
  if (!coords || coords.length === 0) return { lat: null, lon: null };
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lon = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
}

function bbox(coords) {
  if (!coords || coords.length === 0) return null;
  const lats = coords.map(c => c[0]);
  const lons = coords.map(c => c[1]);
  return {
    latMin: +Math.min(...lats).toFixed(4),
    latMax: +Math.max(...lats).toFixed(4),
    lonMin: +Math.min(...lons).toFixed(4),
    lonMax: +Math.max(...lons).toFixed(4),
  };
}

// ── Классификация по историческому миру (304 BC) ─────────────────
// Регионы за пределами известного мира 304 BC — остаются нейтральными
const HISTORICAL_BOUNDS = {
  latMin: -35,   // Южная Африка
  latMax: 62,    // Скандинавия / Балтика
  lonMin: -10,   // Западная Иберия
  lonMax: 145,   // Япония / Корея
};

function isInHistoricalWorld(lat, lon) {
  if (lat == null || lon == null) return false;
  return lat >= HISTORICAL_BOUNDS.latMin &&
         lat <= HISTORICAL_BOUNDS.latMax &&
         lon >= HISTORICAL_BOUNDS.lonMin &&
         lon <= HISTORICAL_BOUNDS.lonMax;
}

// ── Обработка ─────────────────────────────────────────────────────
const SKIP_TYPES = new Set(['Ocean', 'Strait']);
const SKIP_TERRAINS = new Set(['ocean']);
const SKIP_NATIONS = new Set(['ocean', 'impassible']);

const centroids = {};
let skipped = 0;
let outOfWorld = 0;

for (const [id, r] of Object.entries(MAP_REGIONS)) {
  // Пропускаем океан и непроходимое
  if (SKIP_TYPES.has(r.mapType) || SKIP_TERRAINS.has(r.terrain) || SKIP_NATIONS.has(r.nation)) {
    skipped++;
    continue;
  }

  const { lat, lon } = centroid(r.coords);
  const bb = bbox(r.coords);
  const inWorld = isInHistoricalWorld(lat, lon);

  if (!inWorld) outOfWorld++;

  centroids[id] = {
    id,
    name:      r.name    ?? '',
    nation:    r.nation  ?? 'neutral',
    terrain:   r.terrain ?? 'unknown',
    mapType:   r.mapType ?? 'Land',
    lat,
    lon,
    bbox:      bb,
    in_historical_world: inWorld,
    connections: r.connections ?? [],
  };
}

// ── Статистика ────────────────────────────────────────────────────
const all     = Object.values(centroids);
const neutral = all.filter(r => r.nation === 'neutral');
const owned   = all.filter(r => r.nation !== 'neutral');
const inWorld = all.filter(r => r.in_historical_world);
const neutralInWorld = neutral.filter(r => r.in_historical_world);

console.log(`\n=== СТАТИСТИКА ===`);
console.log(`Всего обработано:           ${all.length}`);
console.log(`Пропущено (океан/impass):   ${skipped}`);
console.log(`Имеют нацию:                ${owned.length}`);
console.log(`Нейтральные:                ${neutral.length}`);
console.log(`В историческом мире:        ${inWorld.length}`);
console.log(`Нейтральных в ист. мире:    ${neutralInWorld.length}`);
console.log(`Вне ист. мира (Americas..): ${outOfWorld}`);

// Распределение нейтральных по зонам lat
const latBands = [
  [-35, 0,  'Тропическая Африка/ЮА'],
  [0,   15, 'Экватор. Африка/Аравия'],
  [15,  30, 'Сев. Африка/Ближний Восток'],
  [30,  40, 'Средиземноморье/Персия'],
  [40,  50, 'Причерноморье/Ср.Азия/Китай'],
  [50,  62, 'Скифия/Галлия/ДВ'],
];
console.log('\nНейтральных в ист. мире по широтам:');
for (const [min, max, label] of latBands) {
  const c = neutralInWorld.filter(r => r.lat >= min && r.lat < max).length;
  console.log(`  ${label}: ${c}`);
}

// ── Запись ────────────────────────────────────────────────────────
const outPath = path.join(ROOT, 'data', 'region_centroids.js');
const content = `// AUTO-GENERATED by scripts/stage1_gen_centroids.js
// Центроиды всех наземных регионов из data/map.js
//
// Поля:
//   id, name, nation (текущая), terrain, lat, lon, bbox,
//   in_historical_world (304 BC), connections
//
// Используется: scripts/stage3_assign_regions.js

var REGION_CENTROIDS = ${JSON.stringify(centroids, null, 2)};
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log(`\n✓ Записано в data/region_centroids.js`);
console.log(`  Регионов: ${Object.keys(centroids).length}`);
console.log(`  Размер: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB`);
console.log('\nЭтап 1 завершён. Следующий: node scripts/stage2_gen_nation_geo.js');
