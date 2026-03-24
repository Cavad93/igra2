#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ПОЛНОЕ ПЕРЕНАЗНАЧЕНИЕ РЕГИОНОВ
//
// 1. Назначает регионы нациям из nation_geo.js (по bbox)
// 2. Убирает с карты нации, которых нет в nation_geo.js
//    (кроме игрока и neutral)
// 3. Обновляет regions_data.js и nations.js
//
// Запуск: node scripts/reassign_all.js [--dry-run]
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('DRY-RUN: изменения не сохраняются\n');

// ── Загрузка nation_geo.js ────────────────────────────────────────
console.log('Загрузка data/nation_geo.js...');
const gCode = fs.readFileSync(path.join(ROOT, 'data', 'nation_geo.js'), 'utf8');
const gs = vm.createContext({ console });
vm.runInContext(gCode, gs);
const NATION_GEO = gs.NATION_GEO;
console.log(`  Наций с геоданными: ${Object.keys(NATION_GEO).length}`);

// ── Загрузка region_centroids.js ──────────────────────────────────
console.log('Загрузка data/region_centroids.js...');
const cCode = fs.readFileSync(path.join(ROOT, 'data', 'region_centroids.js'), 'utf8');
const cs = vm.createContext({ console });
vm.runInContext(cCode, cs);
const REGION_CENTROIDS = cs.REGION_CENTROIDS;
console.log(`  Регионов: ${Object.keys(REGION_CENTROIDS).length}`);

// ── Загрузка nations.js ───────────────────────────────────────────
console.log('Загрузка data/nations.js...');
const nationsPath = path.join(ROOT, 'data', 'nations.js');
const nationsText = fs.readFileSync(nationsPath, 'utf8');
const nc = nationsText.replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ns = vm.createContext({ console });
try { vm.runInContext(nc, ns); } catch(e) {}
const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};
console.log(`  Наций: ${Object.keys(NATIONS).length}`);

// ── Нации-игроки (не трогаем) ─────────────────────────────────────
const PLAYER_NATIONS = new Set(
  Object.entries(NATIONS).filter(([, n]) => n.is_player).map(([id]) => id)
);
console.log(`  Игроки (защищены): ${[...PLAYER_NATIONS].join(', ')}`);

// ── Нации не в geo (будут сброшены) ──────────────────────────────
const NOT_IN_GEO = Object.keys(NATIONS).filter(id =>
  id !== 'neutral' && !PLAYER_NATIONS.has(id) && !NATION_GEO[id]
);
console.log(`\nНаций НЕТ в nation_geo.js (будут убраны с карты): ${NOT_IN_GEO.length}`);
if (NOT_IN_GEO.length > 0) console.log(' ', NOT_IN_GEO.join(', '));

// ═══════════════════════════════════════════════════════════════════
// ЭТАП 1: Назначение регионов по bbox (логика stage3)
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('ЭТАП 1: Назначение регионов по bbox...');

function inBbox(lat, lon, bbox) {
  return lat >= bbox.latMin && lat <= bbox.latMax &&
         lon >= bbox.lonMin && lon <= bbox.lonMax;
}

function findCandidates(lat, lon) {
  const candidates = [];
  for (const [nationId, geo] of Object.entries(NATION_GEO)) {
    if (!geo?.bbox) continue;
    let matches = inBbox(lat, lon, geo.bbox);
    if (!matches && geo.polygons?.length) {
      for (const poly of geo.polygons) {
        if (inBbox(lat, lon, poly)) { matches = true; break; }
      }
    }
    if (matches) candidates.push({ nationId, priority: geo.priority ?? 5 });
  }
  return candidates;
}

const assignments = {};
const nationCounts = {};
let assigned = 0, neutral_count = 0;

for (const [regionId, region] of Object.entries(REGION_CENTROIDS)) {
  if (!region.in_historical_world) {
    assignments[regionId] = 'neutral';
    neutral_count++;
    continue;
  }

  const candidates = findCandidates(region.lat, region.lon);
  if (candidates.length === 0) {
    assignments[regionId] = 'neutral';
    neutral_count++;
    continue;
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const winner = candidates[0].nationId;
  assignments[regionId] = winner;
  nationCounts[winner] = (nationCounts[winner] ?? 0) + 1;
  assigned++;
}

console.log(`  Назначено нациям: ${assigned}`);
console.log(`  Neutral: ${neutral_count}`);

// ── Fallback: нации с 0 регионов → ближайший нейтральный ─────────
console.log('Fallback для наций с 0 регионов...');
const fallbackClaimed = new Set();
const nationsWithZero = Object.keys(NATION_GEO).filter(id => !(nationCounts[id] > 0));

for (const nationId of nationsWithZero) {
  const geo = NATION_GEO[nationId];
  if (!geo?.capital) continue;
  const { lat: cLat, lon: cLon } = geo.capital;

  let bestRegion = null, bestDist = Infinity;
  for (const [regionId, region] of Object.entries(REGION_CENTROIDS)) {
    if (!region.in_historical_world) continue;
    if (fallbackClaimed.has(regionId)) continue;
    const dist = Math.sqrt((region.lat - cLat) ** 2 + (region.lon - cLon) ** 2);
    if (dist > 8) continue;
    const currentPriority = assignments[regionId] !== 'neutral'
      ? (NATION_GEO[assignments[regionId]]?.priority ?? 10) : 10;
    if (dist < bestDist && (assignments[regionId] === 'neutral' || geo.priority < currentPriority)) {
      bestDist = dist; bestRegion = regionId;
    }
  }

  if (bestRegion) {
    assignments[bestRegion] = nationId;
    fallbackClaimed.add(bestRegion);
    nationCounts[nationId] = 1;
  }
}

// Второй проход
const stillZero = Object.keys(NATION_GEO).filter(id => !(nationCounts[id] > 0));
if (stillZero.length > 0) {
  console.log(`  Второй проход: ${stillZero.length} наций`);
  for (const nationId of stillZero) {
    const geo = NATION_GEO[nationId];
    if (!geo?.capital) continue;
    const { lat: cLat, lon: cLon } = geo.capital;
    let bestRegion = null, bestDist = Infinity;
    for (const [regionId, region] of Object.entries(REGION_CENTROIDS)) {
      if (!region.in_historical_world || fallbackClaimed.has(regionId)) continue;
      const dist = Math.sqrt((region.lat - cLat) ** 2 + (region.lon - cLon) ** 2);
      if (dist < bestDist) { bestDist = dist; bestRegion = regionId; }
    }
    if (bestRegion) {
      assignments[bestRegion] = nationId;
      fallbackClaimed.add(bestRegion);
      nationCounts[nationId] = 1;
    }
  }
}

// Сохранить region_assignments.js
const assignPath = path.join(ROOT, 'data', 'region_assignments.js');
if (!DRY_RUN) {
  fs.writeFileSync(assignPath,
    `// AUTO-GENERATED by scripts/reassign_all.js\nvar REGION_ASSIGNMENTS = ${JSON.stringify(assignments, null, 2)};\n`,
    'utf8');
  console.log('  ✓ data/region_assignments.js сохранён');
}

// ═══════════════════════════════════════════════════════════════════
// ЭТАП 2: Обновление regions_data.js
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('ЭТАП 2: Обновление data/regions_data.js...');

const regionsPath = path.join(ROOT, 'data', 'regions_data.js');
let regionsText = fs.readFileSync(regionsPath, 'utf8');

// Backup
const backupDir = path.join(ROOT, 'data', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
if (!DRY_RUN) {
  fs.copyFileSync(regionsPath, path.join(backupDir, `regions_data_${ts}.js`));
  fs.copyFileSync(nationsPath, path.join(backupDir, `nations_${ts}.js`));
}

let regChanged = 0, regSkipped = 0;
for (const [regionId, newNation] of Object.entries(assignments)) {
  const regionKey = regionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(R\\['${regionKey}'\\]\\s*=\\s*\\{[^}]{0,30}?nation\\s*:\\s*')([^']*)(')`, 'g'
  );
  regionsText = regionsText.replace(pattern, (m, pre, oldNation, post) => {
    if (oldNation === newNation) { regSkipped++; return m; }
    regChanged++;
    return `${pre}${newNation}${post}`;
  });
}

console.log(`  Изменено: ${regChanged} регионов, без изменений: ${regSkipped}`);
if (!DRY_RUN) {
  fs.writeFileSync(regionsPath, regionsText, 'utf8');
  console.log('  ✓ data/regions_data.js сохранён');
}

// ═══════════════════════════════════════════════════════════════════
// ЭТАП 3: Обновление nations.js
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('ЭТАП 3: Обновление data/nations.js...');

// Обратный индекс: nation → [r-IDs]
const nationToRegions = {};
for (const [regionId, nationId] of Object.entries(assignments)) {
  if (nationId === 'neutral') continue;
  if (!regionId.match(/^r\d+$/)) continue;
  if (!nationToRegions[nationId]) nationToRegions[nationId] = [];
  nationToRegions[nationId].push(regionId);
}
for (const arr of Object.values(nationToRegions)) {
  arr.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
}

let nationsLines = nationsText.split('\n');
let natChanged = 0, natCleared = 0;

// Вспомогательная функция: найти и обновить regions в блоке нации
function patchNationRegions(lines, nationId, newRegions) {
  const esc = nationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nationKeyRe = new RegExp(`^ {2,4}${esc}\\s*:\\s*\\{\\s*$`);
  const lineIdx = lines.findIndex(l => nationKeyRe.test(l));
  if (lineIdx === -1) return false;

  const regionsRe = /^(\s*regions\s*:\s*)\[([^\]]*)\]/;
  const searchEnd = Math.min(lineIdx + 200, lines.length);
  for (let i = lineIdx + 1; i < searchEnd; i++) {
    const m = regionsRe.exec(lines[i]);
    if (m) {
      lines[i] = `${m[1]}${JSON.stringify(newRegions)}`;
      return true;
    }
  }
  return false;
}

// Обновляем нации с геоданными (всегда, даже если уже есть r-IDs)
for (const [nationId, newRegions] of Object.entries(nationToRegions)) {
  if (PLAYER_NATIONS.has(nationId)) continue; // Игрока не трогаем
  if (patchNationRegions(nationsLines, nationId, newRegions)) natChanged++;
}

// Убираем регионы у наций не в geo файлах (кроме игрока и neutral)
for (const nationId of NOT_IN_GEO) {
  if (patchNationRegions(nationsLines, nationId, [])) natCleared++;
}

console.log(`  Обновлено наций с гео: ${natChanged}`);
console.log(`  Очищено наций не в гео: ${natCleared}`);

if (!DRY_RUN) {
  fs.writeFileSync(nationsPath, nationsLines.join('\n'), 'utf8');
  console.log('  ✓ data/nations.js сохранён');
}

// ═══════════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('ИТОГ');
console.log('═'.repeat(60));

const sorted = Object.entries(nationCounts)
  .sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('Топ-20 наций по регионам:');
for (const [n, c] of sorted) {
  console.log(`  ${n.padEnd(22)} ${String(c).padStart(4)}`);
}

const geoNationsAssigned = Object.keys(NATION_GEO).filter(id => nationCounts[id] > 0).length;
console.log(`\nНаций из nation_geo.js с регионами: ${geoNationsAssigned}/${Object.keys(NATION_GEO).length}`);
console.log(`Игроки (сохранены): ${[...PLAYER_NATIONS].join(', ')}`);
console.log(`Убрано с карты: ${NOT_IN_GEO.length} наций`);

if (DRY_RUN) {
  console.log('\nDRY-RUN завершён. Убери --dry-run для применения.');
} else {
  console.log('\n✓ ПЕРЕНАЗНАЧЕНИЕ ЗАВЕРШЕНО');
  console.log('  data/region_assignments.js обновлён');
  console.log('  data/regions_data.js обновлён');
  console.log('  data/nations.js обновлён');
}
