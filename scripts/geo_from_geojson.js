#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Извлекает bboxes из GeoJSON 300 BC → дополняет nation_geo.js
// ═══════════════════════════════════════════════════════════════════
import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point }             from '@turf/helpers';
import { fileURLToPath }     from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Маппинг: ключ нации → название в GeoJSON ──────────────────────
const GEOJSON_MAP = {
  rome:              'Roman Republic',
  carthage:          'Carthaginian Empire',
  egypt:             'Ptolemaic Kingdom',
  macedon:           'Kingdom of Kassander',
  seleucid:          'Seleucid Kingdom',
  antigonus:         'Kingdom of Antigonus',
  lysimachus:        'Kingdom of Lysimachus',
  bithynia:          'Bithynia',
  cappadocia:        'Cappadocia',
  armenia:           'Armenia',
  atropatene:        'Atropatene',
  nabataea:          'Nabatean Kingdom',
  bosporan:          'Bosporan Kingdom',
  colchis:           'Colchis',
  meroe:             'Meroe',
  maurya:            'Mauryan Empire',
  qin:               'Qin',
  yue:               'Yue',
  zhangzhung:        'Zhangzhung Kingdom',
  greek_states:      'Greek city-states',
  celts:             'Celts',
  // Sicilian cities — внутри greek_states или carthage, уточним по капиталам
  syracuse:          'Greek city-states',
  gela:              'Greek city-states',
  acragas:           'Greek city-states',
  selinous:          'Greek city-states',
  herakleia_minoa:   'Carthaginian Empire',
  // Celtic/Germanic
  dumnonia:          'Celts',
  ivernia:           'Celts',
  suionia:           'Bell-shaped burials culture',
  // East Asian
  dong_zhou:         'Zhow states',
  jin_confederacy:   'Zhow states',
  sui:               'Qin',
};

// Столицы для наций-городов (точнее чем bbox всего polygon)
const CITY_CAPITALS = {
  rome:            { lat: 41.89,  lon: 12.49 },
  syracuse:        { lat: 37.07,  lon: 15.28 },
  gela:            { lat: 37.06,  lon: 14.25 },
  acragas:         { lat: 37.30,  lon: 13.59 },
  selinous:        { lat: 37.58,  lon: 12.83 },
  herakleia_minoa: { lat: 37.39,  lon: 13.28 },
  elymia:          { lat: 37.97,  lon: 12.67 },
  sicels:          { lat: 37.50,  lon: 14.80 },
  sicani:          { lat: 37.75,  lon: 13.50 },
  calactea:        { lat: 38.07,  lon: 14.51 },
  tyndaria:        { lat: 38.14,  lon: 15.03 },
  drangiana:       { lat: 31.50,  lon: 63.00 },
  parni:           { lat: 37.50,  lon: 57.00 },
  paurava:         { lat: 31.50,  lon: 72.50 },
  tagaung:         { lat: 23.50,  lon: 95.90 },
  pegu:            { lat: 17.33,  lon: 96.47 },
  taungthaman:     { lat: 21.95,  lon: 96.03 },
  dumnonia:        { lat: 50.40,  lon: -4.20 },
  ivernia:         { lat: 53.30,  lon: -8.00 },
  taexalia:        { lat: 57.50,  lon: -3.50 },
  suionia:         { lat: 59.00,  lon: 17.00 },
  dong_zhou:       { lat: 34.75,  lon: 112.45 },
  baekje:          { lat: 36.50,  lon: 127.00 },
  ito:             { lat: 33.50,  lon: 130.40 },
};

const CITY_RADIUS = 1.2; // degrees — радиус bbox вокруг города

// ── Загрузка GeoJSON ──────────────────────────────────────────────
console.log('Загрузка world_bc300.geojson...');
const geoPath = path.join(ROOT, 'data', 'world_bc300.geojson');
if (!fs.existsSync(geoPath)) {
  // Try /tmp
  const tmpPath = '/tmp/world_bc300.geojson';
  if (fs.existsSync(tmpPath)) fs.copyFileSync(tmpPath, geoPath);
  else {
    console.error('Не найден world_bc300.geojson. Скачай: curl -sL https://... -o data/world_bc300.geojson');
    process.exit(1);
  }
}
const geo300 = JSON.parse(fs.readFileSync(geoPath, 'utf8'));

// Индекс: name → feature
const geoIndex = {};
for (const f of geo300.features) {
  if (f.properties.NAME) {
    const n = f.properties.NAME;
    if (!geoIndex[n]) geoIndex[n] = [];
    geoIndex[n].push(f);
  }
}
console.log('GeoJSON наций:', Object.keys(geoIndex).length);

// ── Функция: bbox из GeoJSON feature ─────────────────────────────
function bboxFromFeature(feature) {
  let latMin=90, latMax=-90, lonMin=180, lonMax=-180;
  function walk(coords) {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
    } else coords.forEach(walk);
  }
  walk(feature.geometry.coordinates);
  return { latMin: +latMin.toFixed(4), latMax: +latMax.toFixed(4),
           lonMin: +lonMin.toFixed(4), lonMax: +lonMax.toFixed(4) };
}

function bboxFromFeatures(features) {
  let latMin=90, latMax=-90, lonMin=180, lonMax=-180;
  for (const f of features) {
    const b = bboxFromFeature(f);
    if (b.latMin < latMin) latMin = b.latMin;
    if (b.latMax > latMax) latMax = b.latMax;
    if (b.lonMin < lonMin) lonMin = b.lonMin;
    if (b.lonMax > lonMax) lonMax = b.lonMax;
  }
  return { latMin, latMax, lonMin, lonMax };
}

// ── Загрузка nation_geo.js ────────────────────────────────────────
console.log('Загрузка nation_geo.js...');
const nGeoPath = path.join(ROOT, 'data', 'nation_geo.js');
const gCode = fs.readFileSync(nGeoPath, 'utf8').replace(/^var /mg, 'var ');
const gs = vm.createContext({ console });
vm.runInContext(gCode, gs);
const NATION_GEO = gs.NATION_GEO ?? {};
console.log('Уже есть геоданных:', Object.keys(NATION_GEO).length);

// ── Загрузка nations.js для имён ──────────────────────────────────
const nCode = fs.readFileSync(path.join(ROOT, 'data', 'nations.js'), 'utf8')
  .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ns = vm.createContext({ console });
vm.runInContext(nCode, ns);
const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};

// ── Генерация новых записей ───────────────────────────────────────
const added = [];

for (const [nationId, geoName] of Object.entries(GEOJSON_MAP)) {
  if (NATION_GEO[nationId]) {
    console.log(`  SKIP ${nationId} — уже есть`);
    continue;
  }
  if (!NATIONS[nationId]) {
    console.log(`  SKIP ${nationId} — не найден в nations.js`);
    continue;
  }

  const features = geoIndex[geoName];
  if (!features || features.length === 0) {
    console.log(`  MISS ${nationId} → "${geoName}" не найден в GeoJSON`);
    continue;
  }

  const capital = CITY_CAPITALS[nationId];

  let bbox;
  if (capital) {
    // Для городов-государств: маленький bbox вокруг столицы
    bbox = {
      latMin: +(capital.lat - CITY_RADIUS).toFixed(4),
      latMax: +(capital.lat + CITY_RADIUS).toFixed(4),
      lonMin: +(capital.lon - CITY_RADIUS).toFixed(4),
      lonMax: +(capital.lon + CITY_RADIUS).toFixed(4),
    };
  } else {
    // Для крупных держав: полный bbox из GeoJSON polygon
    bbox = bboxFromFeatures(features);
  }

  NATION_GEO[nationId] = {
    bbox,
    priority: capital ? 2 : 4,
    capital: capital ?? {
      lat: +((bbox.latMin + bbox.latMax) / 2).toFixed(4),
      lon: +((bbox.lonMin + bbox.lonMax) / 2).toFixed(4),
    },
    source: 'aourednik/historical-basemaps 300 BC',
    notes: `${NATIONS[nationId].name} — извлечено из GeoJSON "${geoName}"`,
  };

  added.push(nationId);
  console.log(`  ADD  ${nationId} (${NATIONS[nationId].name}) → bbox ${JSON.stringify(bbox)}`);
}

// ── Сохранение ────────────────────────────────────────────────────
if (added.length === 0) {
  console.log('\nНичего нового не добавлено.');
} else {
  const entries = Object.entries(NATION_GEO)
    .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
    .join(',\n');
  const output = `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${entries}\n};\n`;
  fs.writeFileSync(nGeoPath, output, 'utf8');
  console.log(`\nДобавлено ${added.length} новых записей → nation_geo.js`);
  console.log('Добавленные:', added.join(', '));
}
