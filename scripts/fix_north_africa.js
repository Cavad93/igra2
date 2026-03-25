#!/usr/bin/env node
// Исправляет карту Северной Африки согласно исторической карте 304 BC:
// MAURETANIA, MASAESYLI, GAETULIA, AUTOLALAE, PHUTITAE, CHELMI, CAPARIENSA,
// MAKAE (исправление — был неверно указан в Омане), OYAT, PHAZANIA, PSYLLIA
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

// ── Исторические данные 304 BC ─────────────────────────────────────
// Источник: стандартная историческая карта Северной Африки 304 BC
const NORTH_AFRICA_GEO = {
  // ── МАРОККО и западный Алжир ──────────────────────────────────
  // Мавретания — большое берберское царство, Марокко
  mauretania: {
    bbox: { latMin: 29.0, latMax: 35.9, lonMin: -8.5, lonMax: -1.0 },
    priority: 4,
    capital: { lat: 35.77, lon: -5.80 },  // Тингис (Танжер)
    notes: 'Мавретания — берберское царство Марокко 304 BC',
  },
  // Автолалы — берберские племена Атласских гор
  autolalae: {
    bbox: { latMin: 29.0, latMax: 34.0, lonMin: -8.0, lonMax: -2.0 },
    priority: 3,
    capital: { lat: 31.5, lon: -5.0 },  // центральные Атласские горы
    notes: 'Автолалы — берберские племена Атласских гор',
  },
  // Футиты — SW Марокко / Сахара
  phutitae: {
    bbox: { latMin: 26.0, latMax: 30.5, lonMin: -14.0, lonMax: -7.5 },
    priority: 4,
    capital: { lat: 28.0, lon: -11.0 },
    notes: 'Футиты — берберские племена юго-западного Марокко',
  },
  // Хелми — северное побережье Марокко
  chelmi: {
    bbox: { latMin: 34.0, latMax: 36.0, lonMin: -6.5, lonMax: -3.0 },
    priority: 3,
    capital: { lat: 35.1, lon: -4.5 },
    notes: 'Хелми — племена северного Марокко',
  },
  // ── АЛЖИР ─────────────────────────────────────────────────────
  // Масесилы — западные нумидийцы (западный Алжир)
  masaesyli: {
    bbox: { latMin: 33.0, latMax: 37.0, lonMin: -2.5, lonMax: 5.0 },
    priority: 4,
    capital: { lat: 35.7, lon: 1.3 },  // Сига (Айн-Темушент)
    notes: 'Масесилы — западные нумидийские племена 304 BC',
  },
  // Капариенса — прибрежная зона западного Алжира
  capariensa: {
    bbox: { latMin: 34.0, latMax: 36.5, lonMin: -1.5, lonMax: 4.0 },
    priority: 3,
    capital: { lat: 35.7, lon: 2.0 },
    notes: 'Капариенса — прибрежное племя западного Алжира',
  },
  // Гетулы — обширная область, юг Нумидии (внутренний Алжир/Тунис)
  gaetulia: {
    bbox: { latMin: 28.0, latMax: 34.0, lonMin: -3.0, lonMax: 12.0 },
    priority: 5,
    capital: { lat: 30.5, lon: 4.0 },
    notes: 'Гетулия — обширная страна берберских кочевников, юг Нумидии',
  },
  // ── ЛИВИЯ ─────────────────────────────────────────────────────
  // Маки — племена Триполитании (исправление: было неверно в Омане!)
  makae: {
    bbox: { latMin: 29.0, latMax: 33.5, lonMin: 12.0, lonMax: 20.0 },
    priority: 4,
    capital: { lat: 32.1, lon: 15.0 },  // Лептис-Магна/Триполи
    notes: 'Маки — ливийские племена Триполитании 304 BC',
  },
  // Фазания — Феццан (центральная Ливия)
  phazania: {
    bbox: { latMin: 24.0, latMax: 29.0, lonMin: 11.5, lonMax: 18.0 },
    priority: 4,
    capital: { lat: 26.5, lon: 14.5 },  // Гарама (Джерма)
    notes: 'Фазания — страна Феццан, центральная Ливия',
  },
  // Оиаты — восточная Ливия
  oyat: {
    bbox: { latMin: 29.0, latMax: 33.0, lonMin: 18.0, lonMax: 24.0 },
    priority: 4,
    capital: { lat: 31.0, lon: 21.0 },
    notes: 'Оиаты — восточноливийские племена 304 BC',
  },
  // Псиллы — прибрежное ливийское племя (близ Кирены)
  psyllia: {
    bbox: { latMin: 30.0, latMax: 33.0, lonMin: 22.0, lonMax: 26.5 },
    priority: 3,
    capital: { lat: 31.5, lon: 24.0 },
    notes: 'Псиллы — прибрежное ливийское племя близ Кирены',
  },
};

// ── Применяем геопозиции ──────────────────────────────────────────
let updated = 0;
for (const [id, geo] of Object.entries(NORTH_AFRICA_GEO)) {
  const old = NATION_GEO[id];
  NATION_GEO[id] = geo;
  updated++;
  if (old) {
    console.log(`  FIX  ${id} (bbox изменён)`);
  } else {
    console.log(`  ADD  ${id}`);
  }
}

// ── Добавляем нации если не существуют ───────────────────────────
const NORTH_AFRICA_NATIONS = {
  mauretania:  { name: 'Mauretania',  color: '#C06060', regions: [] },
  masaesyli:   { name: 'Masaesyli',   color: '#5A9EA0', regions: [] },
  gaetulia:    { name: 'Gaetulia',    color: '#C8956A', regions: [] },
  autolalae:   { name: 'Autolalae',   color: '#A0876A', regions: [] },
  phutitae:    { name: 'Phutitae',    color: '#B8A080', regions: [] },
  chelmi:      { name: 'Chelmi',      color: '#C89060', regions: [] },
  capariensa:  { name: 'Capariensa',  color: '#6A9080', regions: [] },
  oyat:        { name: 'Oyat',        color: '#B09060', regions: [] },
  phazania:    { name: 'Phazania',    color: '#A08040', regions: [] },
  psyllia:     { name: 'Psyllia',     color: '#809070', regions: [] },
};

let addedNations = 0;
for (const [id, data] of Object.entries(NORTH_AFRICA_NATIONS)) {
  if (!NATIONS[id]) {
    NATIONS[id] = data;
    addedNations++;
    console.log(`  ADD  nation ${id}`);
  }
}
// MAKAE уже есть в nations.js (просто исправлен geo)
console.log('\nmakae geo исправлен (был неверно в Омане → теперь Триполитания)');

// ── Сохранение nation_geo.js ──────────────────────────────────────
const geoEntries = Object.entries(NATION_GEO)
  .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
  .join(',\n');
fs.writeFileSync(nGeoPath,
  `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${geoEntries}\n};\n`
);
console.log(`\n✓ nation_geo.js обновлён (${updated} наций Северной Африки)`);

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
