#!/usr/bin/env node
// Извлекает географические области из map.js → data/map_areas.json
// Каждая область: имя + bbox (latMin/latMax/lonMin/lonMax) + центр + количество регионов

const fs  = require('fs');
const vm  = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'data', 'map.js'), 'utf8')
  .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ctx = vm.createContext({ console });
vm.runInContext(code, ctx);
const regions = ctx.MAP_REGIONS;

// Сгруппировать регионы по префиксу имени (например "Африка 3" → "Африка")
const areaMap = {};
for (const [id, r] of Object.entries(regions)) {
  if (!r.name || !r.center) continue;
  const match = r.name.match(/^([А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z_\s]*?)\s+\d+$/);
  if (!match) continue;
  const area = match[1].trim().replace(/_/g, ' ');

  // Пропускаем шумные/неинформативные названия
  if (['Регион', 'Region'].includes(area)) continue;

  if (!areaMap[area]) areaMap[area] = { centers: [], ids: [] };
  areaMap[area].centers.push(r.center); // [lat, lon]
  areaMap[area].ids.push(id);
}

// Вычислить bbox и центроид для каждой области
const result = {};
for (const [area, data] of Object.entries(areaMap)) {
  const lats = data.centers.map(c => c[0]);
  const lons = data.centers.map(c => c[1]);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

  result[area] = {
    latMin: +latMin.toFixed(2),
    latMax: +latMax.toFixed(2),
    lonMin: +lonMin.toFixed(2),
    lonMax: +lonMax.toFixed(2),
    centerLat: +centerLat.toFixed(2),
    centerLon: +centerLon.toFixed(2),
    count: data.centers.length,
  };
}

// Сортируем по количеству регионов
const sorted = Object.fromEntries(
  Object.entries(result).sort((a, b) => b[1].count - a[1].count)
);

const outPath = path.join(ROOT, 'data', 'map_areas.json');
fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2));
console.log(`✓ Сохранено ${Object.keys(sorted).length} областей → data/map_areas.json`);
Object.entries(sorted).slice(0, 15).forEach(([name, v]) =>
  console.log(`  ${name} (${v.count}): lat[${v.latMin}..${v.latMax}] lon[${v.lonMin}..${v.lonMax}]`)
);
