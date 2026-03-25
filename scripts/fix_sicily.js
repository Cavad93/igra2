#!/usr/bin/env node
// Исправляет карту Сицилии согласно исторической карте 304 BC:
// SYRACUSE, CARTHAGE, SICANI, ACRAGAS, GELA, SICELS, CALACTEA, TYNDARIA,
// ELYMIA, SELINOUS, RHEGIUM
import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Загрузка ──────────────────────────────────────────────────────
const nGeoPath = path.join(ROOT, 'data', 'nation_geo.js');
const gSrc = fs.readFileSync(nGeoPath, 'utf8').replace(/^var /mg, 'var ');
const gCtx = vm.createContext({ console });
vm.runInContext(gSrc, gCtx);
const NATION_GEO = gCtx.NATION_GEO;

const nationsPath = path.join(ROOT, 'data', 'nations.js');
let nationsSrc = fs.readFileSync(nationsPath, 'utf8');
const nCode = nationsSrc.replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const nCtx = vm.createContext({ console });
vm.runInContext(nCode, nCtx);
const NATIONS = nCtx.INITIAL_GAME_STATE.nations;

// ── Исправленные bbox Сицилийских наций ───────────────────────────
// Основано на исторической карте 304 BC
// Приоритет 2 = самые специфичные (город-государство)
const SICILY_GEO = {
  // Сиракузы — восточная Сицилия (крупнейшее государство)
  syracuse: {
    bbox: { latMin: 36.6, latMax: 38.3, lonMin: 14.7, lonMax: 15.65 },
    priority: 3,
    capital: { lat: 37.07, lon: 15.28 },
    notes: 'Сиракузы — восточная Сицилия под властью Агафокла 304 BC',
  },
  // Тиндарида — маленький регион на северо-востоке
  tyndaria: {
    bbox: { latMin: 37.9, latMax: 38.3, lonMin: 14.8, lonMax: 15.2 },
    priority: 2,
    capital: { lat: 38.14, lon: 15.03 },
    notes: 'Тиндарида — греческий город-государство северо-восточной Сицилии',
  },
  // Калактея — северное побережье центральной Сицилии
  calactea: {
    bbox: { latMin: 37.8, latMax: 38.25, lonMin: 13.7, lonMax: 14.9 },
    priority: 2,
    capital: { lat: 38.07, lon: 14.51 },
    notes: 'Калактея — греческое поселение на северном побережье Сицилии',
  },
  // Сицелы — центральная Сицилия
  sicels: {
    bbox: { latMin: 37.15, latMax: 38.0, lonMin: 14.2, lonMax: 15.1 },
    priority: 3,
    capital: { lat: 37.50, lon: 14.80 },
    notes: 'Сицелы — коренной народ центральной Сицилии',
  },
  // Сикани — центрально-западная Сицилия, большое племя
  sicani: {
    bbox: { latMin: 37.3, latMax: 38.1, lonMin: 12.9, lonMax: 14.3 },
    priority: 3,
    capital: { lat: 37.75, lon: 13.50 },
    notes: 'Сикани — древнейший народ центральной Сицилии',
  },
  // Элимия — западная оконечность острова
  elymia: {
    bbox: { latMin: 37.6, latMax: 38.15, lonMin: 12.3, lonMax: 13.0 },
    priority: 2,
    capital: { lat: 37.97, lon: 12.67 },
    notes: 'Элимия — западная оконечность Сицилии',
  },
  // Карфагенские владения в Сицилии — через polygon (основной bbox в Тунисе)
  // Добавляем polygon для северо-западной Сицилии к Карфагену
  // Селинунт — узкая полоса южного побережья
  selinous: {
    bbox: { latMin: 37.4, latMax: 37.85, lonMin: 12.6, lonMax: 13.2 },
    priority: 2,
    capital: { lat: 37.58, lon: 12.83 },
    notes: 'Селинунт — греческий город-государство юго-западной Сицилии',
  },
  // Акрагант — юго-западная Сицилия
  acragas: {
    bbox: { latMin: 36.9, latMax: 37.6, lonMin: 13.0, lonMax: 14.0 },
    priority: 2,
    capital: { lat: 37.30, lon: 13.59 },
    notes: 'Акрагант — греческий город-государство юго-западной Сицилии',
  },
  // Гела — южное побережье
  gela: {
    bbox: { latMin: 36.75, latMax: 37.4, lonMin: 13.9, lonMax: 14.7 },
    priority: 2,
    capital: { lat: 37.06, lon: 14.25 },
    notes: 'Гела — греческий город-государство южного побережья Сицилии',
  },
  // Регий — на материке, Калабрия
  rhegium: {
    bbox: { latMin: 37.85, latMax: 38.4, lonMin: 15.55, lonMax: 16.2 },
    priority: 2,
    capital: { lat: 38.11, lon: 15.66 },
    notes: 'Регий — греческий город на побережье Калабрии',
  },
};

// Добавляем polygon Карфагена для северо-западной Сицилии
if (NATION_GEO['carthage']) {
  NATION_GEO['carthage'].polygons = NATION_GEO['carthage'].polygons || [];
  // Проверяем, нет ли уже сицилийского polygon
  const hasSicily = NATION_GEO['carthage'].polygons.some(p => p.lonMin < 14 && p.lonMax < 14);
  if (!hasSicily) {
    NATION_GEO['carthage'].polygons.push({
      latMin: 37.85, latMax: 38.3, lonMin: 12.3, lonMax: 13.5,
    });
    console.log('Добавлен polygon Карфагена для северо-западной Сицилии');
  }
}

// Применяем исправления к nation_geo
let updated = 0;
for (const [id, geo] of Object.entries(SICILY_GEO)) {
  NATION_GEO[id] = geo;
  updated++;
  console.log(`  GEO  ${id}`);
}

// Добавляем нации если не существуют
const SICILY_NATIONS = {
  sicani:   { name: 'Sicani',   color: '#E8A0A0', regions: [] },
  sicels:   { name: 'Sicels',   color: '#E8B870', regions: [] },
  calactea: { name: 'Calactea', color: '#E8956A', regions: [] },
  tyndaria: { name: 'Tyndaria', color: '#8080C8', regions: [] },
  elymia:   { name: 'Elymia',   color: '#E8B8C8', regions: [] },
};

let addedNations = 0;
for (const [id, data] of Object.entries(SICILY_NATIONS)) {
  if (!NATIONS[id]) {
    NATIONS[id] = data;
    addedNations++;
    console.log(`  ADD  nation ${id}`);
  }
}

// ── Сохранение nation_geo.js ──────────────────────────────────────
const geoEntries = Object.entries(NATION_GEO)
  .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
  .join(',\n');
fs.writeFileSync(nGeoPath,
  `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${geoEntries}\n};\n`
);
console.log(`\n✓ nation_geo.js обновлён (${updated} сицилийских наций исправлено)`);

// ── Сохранение nations.js ─────────────────────────────────────────
if (addedNations > 0) {
  const nEntries = Object.entries(NATIONS)
    .map(([k, v]) => `    "${k}": ${JSON.stringify(v)}`)
    .join(',\n');
  const nStartRe = /nations\s*:\s*\{/;
  const m = nStartRe.exec(nationsSrc);
  const blockStart = m.index + m[0].length;
  let depth = 1, pos = blockStart;
  while (pos < nationsSrc.length && depth > 0) {
    if (nationsSrc[pos] === '{') depth++;
    else if (nationsSrc[pos] === '}') depth--;
    pos++;
  }
  nationsSrc = nationsSrc.slice(0, blockStart) + '\n' + nEntries + '\n  ' + nationsSrc.slice(pos - 1);
  fs.writeFileSync(nationsPath, nationsSrc, 'utf8');
  console.log(`✓ nations.js: добавлено ${addedNations} новых наций`);
}

console.log('\nЗапусти: node scripts/stage3_assign_regions.js && node scripts/stage5_apply_assignment.js');
