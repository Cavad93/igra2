#!/usr/bin/env node
// Переименование регионов карты по данным Pleiades (исторические названия 300 BC)
//
// Для каждого региона ищет ближайший населённый пункт / регион из Pleiades
// в радиусе MAX_DIST градусов и берёт его название.
//
// Запуск: node scripts/rename_regions_pleiades.js
//         node scripts/rename_regions_pleiades.js --dry-run

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('DRY-RUN: изменения не сохраняются\n');

// ── Параметры ─────────────────────────────────────────────────────
const MAX_DIST  = 1.2;   // градусов (~130 км) — радиус поиска
const PREF_DIST = 0.5;   // градусов (~55 км) — предпочтительный радиус (settlement > region)

// Приоритет типов (ниже = лучше)
const TYPE_PRIORITY = {
  'settlement': 1,
  'region':     2,
  'port':       3,
  'fort':       4,
  'sanctuary':  5,
  'mine':       6,
  'island':     7,
  'mountain':   8,
  'river':      9,
  'unknown':    10,
};
function typePriority(types) {
  const parts = types.split(',').map(t => t.trim());
  return Math.min(...parts.map(t => TYPE_PRIORITY[t] ?? 11));
}

// ── Загрузка Pleiades ─────────────────────────────────────────────
console.log('Загрузка Pleiades data...');
const pleiades = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'pleiades_300bc.json'), 'utf8')
);
// Берём только места с координатами
const places = pleiades.filter(p => p.lat && p.lon && p.title);
console.log(`  Мест в Pleiades: ${places.length}`);

// ── Загрузка region_centroids ─────────────────────────────────────
console.log('Загрузка region_centroids.js...');
const cCode = fs.readFileSync(path.join(ROOT, 'data', 'region_centroids.js'), 'utf8')
  .replace(/^var /mg, 'var ');
const cs = vm.createContext({ console });
vm.runInContext(cCode, cs);
const CENTROIDS = cs.REGION_CENTROIDS;
console.log(`  Регионов: ${Object.keys(CENTROIDS).length}`);

// ── Загрузка map.js ───────────────────────────────────────────────
console.log('Загрузка data/map.js...');
const mapPath = path.join(ROOT, 'data', 'map.js');
let mapSrc = fs.readFileSync(mapPath, 'utf8');

// ── Поиск ближайшего Pleiades места ──────────────────────────────
function findNearest(lat, lon) {
  let best = null;
  let bestScore = Infinity;

  for (const p of places) {
    const dlat = p.lat - lat;
    const dlon = p.lon - lon;
    const dist = Math.sqrt(dlat * dlat + dlon * dlon);
    if (dist > MAX_DIST) continue;

    // Score: расстояние + штраф за тип
    const typePen = typePriority(p.types) * (dist < PREF_DIST ? 0.1 : 0.4);
    const score   = dist + typePen;

    if (score < bestScore) {
      bestScore = score;
      best = { ...p, dist };
    }
  }
  return best;
}

// ── Очистка названия Pleiades ─────────────────────────────────────
function cleanTitle(title) {
  // "Roma|Rome" → "Roma"  (берём первый вариант)
  // "Neapolis/Naples" → "Neapolis"
  return title
    .split(/[|/\\]/)
    .map(t => t.trim())
    .filter(t => t.length > 0)[0] ?? title;
}

// ── Основной проход ───────────────────────────────────────────────
console.log('\nПереименование регионов...');

let renamed   = 0;
let kept      = 0;
let noMatch   = 0;
const changes = [];  // { id, oldName, newName, place, dist }

for (const [regionId, region] of Object.entries(CENTROIDS)) {
  if (!region.lat || !region.lon) continue;
  // Пропускаем океан/нейтраль
  if (region.mapType === 'Ocean' || region.mapType === 'Strait') continue;

  const match = findNearest(region.lat, region.lon);
  if (!match) { noMatch++; continue; }

  const newName = cleanTitle(match.title);
  const oldName = region.name ?? regionId;

  // Не переименовываем если название уже хорошее (не шаблонное)
  // Шаблонные названия: "Слово 123" или "Слово_Слово 123"
  const isGeneric = /^[\w\u0400-\u04FF_]+[\s_]+\d+$/.test(oldName.trim());

  if (newName === oldName) { kept++; continue; }
  if (!isGeneric) { kept++; continue; }  // уже переименован — не трогаем

  changes.push({ id: regionId, oldName, newName, place: match, dist: match.dist });
  renamed++;
}

console.log(`  Можно переименовать: ${renamed}`);
console.log(`  Уже хорошее название: ${kept}`);
console.log(`  Нет совпадений Pleiades: ${noMatch}`);

// ── Применяем изменения в map.js ─────────────────────────────────
if (!DRY_RUN && changes.length > 0) {
  console.log('\nПрименяем изменения в data/map.js...');

  // Бэкап
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(ROOT, 'data', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(mapPath, path.join(backupDir, `map_${ts}.js`));
  console.log(`  Бэкап: data/backups/map_${ts}.js`);

  let applied = 0;
  for (const ch of changes) {
    // Паттерн: rXXXX:{name:'старое название'
    const escapedOld = ch.oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(${ch.id}:\\{[^}]{0,10}name:\\s*')[^']*(')`
    );
    const newSrc = mapSrc.replace(pattern, `$1${ch.newName}$2`);
    if (newSrc !== mapSrc) {
      mapSrc = newSrc;
      applied++;
    }
  }

  fs.writeFileSync(mapPath, mapSrc, 'utf8');
  console.log(`  Применено: ${applied} переименований`);
}

// ── Примеры переименований ────────────────────────────────────────
console.log('\nПримеры переименований (первые 40):');
const byRegion = [
  { name: 'Италия',      lat: [36,47],  lon: [6,19]  },
  { name: 'Сев.Африка',  lat: [28,38],  lon: [-8,25] },
  { name: 'Греция/Балк.',lat: [36,45],  lon: [19,30] },
  { name: 'Ближ.Восток', lat: [28,40],  lon: [30,55] },
  { name: 'Индия',       lat: [15,38],  lon: [60,90] },
];

let shown = 0;
for (const zone of byRegion) {
  const zoneChanges = changes.filter(ch => {
    const c = CENTROIDS[ch.id];
    return c && c.lat >= zone.lat[0] && c.lat <= zone.lat[1]
             && c.lon >= zone.lon[0] && c.lon <= zone.lon[1];
  }).slice(0, 8);
  if (!zoneChanges.length) continue;
  console.log(`\n  [${zone.name}]`);
  for (const ch of zoneChanges) {
    const distKm = (ch.dist * 111).toFixed(0);
    console.log(`    ${ch.id.padEnd(6)} "${ch.oldName}" → "${ch.newName}"  (${distKm}км, ${ch.place.types})`);
    if (++shown >= 40) break;
  }
  if (shown >= 40) break;
}

console.log(`\n✓ Готово. Переименовано ${renamed} регионов из ${Object.keys(CENTROIDS).length}`);
if (DRY_RUN) console.log('Запусти без --dry-run для применения.');
