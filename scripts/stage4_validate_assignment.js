#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ЭТАП 4: Валидация назначений регионов
//
// Вход:  data/region_assignments.js, data/region_centroids.js,
//        data/nation_geo.js, data/nations.js
// Выход: отчёт в консоль + data/assignment_report.json
//
// Проверки:
//   - Нации с 0 регионами (но есть в nation_geo.js)
//   - Нации с подозрительно малым числом регионов (<2)
//   - Регионы назначенные нации чей bbox не содержит их центроид
//   - Географический смысл: столица нации попадает в её регионы?
//   - Статистика по terrain для каждой нации
//
// Запуск: node scripts/stage4_validate_assignment.js
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadVm(filePath, varName) {
  const code = fs.readFileSync(filePath, 'utf8').replace(/^var /mg, 'var ');
  const s = vm.createContext({ console });
  vm.runInContext(code, s);
  return s[varName];
}

// ── Загрузка данных ───────────────────────────────────────────────
console.log('Загрузка данных...');

const REGION_CENTROIDS  = loadVm(path.join(ROOT, 'data', 'region_centroids.js'),  'REGION_CENTROIDS');
const REGION_ASSIGNMENTS = loadVm(path.join(ROOT, 'data', 'region_assignments.js'), 'REGION_ASSIGNMENTS');
const NATION_GEO        = loadVm(path.join(ROOT, 'data', 'nation_geo.js'),         'NATION_GEO');

// Загрузка nations.js (INITIAL_GAME_STATE)
const nCode = fs.readFileSync(path.join(ROOT, 'data', 'nations.js'), 'utf8')
  .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ns = vm.createContext({ console });
vm.runInContext(nCode, ns);
const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};

console.log(`  Регионы в centroids:   ${Object.keys(REGION_CENTROIDS).length}`);
console.log(`  Назначений:            ${Object.keys(REGION_ASSIGNMENTS).length}`);
console.log(`  Наций в nation_geo:    ${Object.keys(NATION_GEO).length}`);
console.log(`  Наций в nations.js:    ${Object.keys(NATIONS).length}`);

// ── Построение обратной карты: nation → [regionId] ────────────────
const nationRegions = {};
for (const [regionId, nationId] of Object.entries(REGION_ASSIGNMENTS)) {
  if (nationId === 'neutral') continue;
  if (!nationRegions[nationId]) nationRegions[nationId] = [];
  nationRegions[nationId].push(regionId);
}

// ── Вспомогательная: bbox содержит точку ─────────────────────────
function inBbox(lat, lon, bbox) {
  return lat >= bbox.latMin && lat <= bbox.latMax &&
         lon >= bbox.lonMin && lon <= bbox.lonMax;
}

function inGeo(lat, lon, geo) {
  if (!geo?.bbox) return false;
  if (inBbox(lat, lon, geo.bbox)) return true;
  if (geo.polygons?.length) {
    return geo.polygons.some(p => inBbox(lat, lon, p));
  }
  return false;
}

// ── Проблемы ─────────────────────────────────────────────────────
const issues = [];
function warn(type, nationId, msg, extra = {}) {
  issues.push({ type, nationId, msg, ...extra });
}

// ── Проверка 1: нации с 0 регионами ──────────────────────────────
console.log('\n[1] Нации без регионов...');
let noRegionCount = 0;
for (const nationId of Object.keys(NATION_GEO)) {
  if (!(nationRegions[nationId]?.length > 0)) {
    noRegionCount++;
    warn('NO_REGIONS', nationId, `Нация "${nationId}" получила 0 регионов`);
  }
}
console.log(`  Нации с 0 регионами: ${noRegionCount}`);

// ── Проверка 2: нации с очень малым числом регионов ──────────────
console.log('[2] Нации с малым числом регионов (<3)...');
let fewRegionCount = 0;
for (const [nationId, regions] of Object.entries(nationRegions)) {
  if (regions.length < 3 && NATION_GEO[nationId]) {
    const geo = NATION_GEO[nationId];
    if ((geo.priority ?? 5) >= 3) {  // Для малых городов (priority=1-2) это нормально
      fewRegionCount++;
      warn('FEW_REGIONS', nationId, `Нация "${nationId}" получила только ${regions.length} регион(а), priority=${geo.priority}`);
    }
  }
}
console.log(`  Наций с мало регионами: ${fewRegionCount}`);

// ── Проверка 3: регионы вне bbox нации ───────────────────────────
console.log('[3] Регионы вне bbox нации...');
let outOfBboxCount = 0;
const outOfBboxByNation = {};
for (const [nationId, regions] of Object.entries(nationRegions)) {
  const geo = NATION_GEO[nationId];
  if (!geo) continue;

  for (const regionId of regions) {
    const c = REGION_CENTROIDS[regionId];
    if (!c) continue;
    if (!inGeo(c.lat, c.lon, geo)) {
      outOfBboxCount++;
      outOfBboxByNation[nationId] = (outOfBboxByNation[nationId] ?? 0) + 1;
    }
  }
}
if (outOfBboxCount > 0) {
  warn('OUT_OF_BBOX_TOTAL', null, `${outOfBboxCount} регионов назначены нации, чей bbox их не содержит`);
  const top = Object.entries(outOfBboxByNation).sort((a,b)=>b[1]-a[1]).slice(0, 10);
  for (const [n, c] of top) {
    warn('OUT_OF_BBOX', n, `${c} регионов вне bbox`, { count: c });
  }
}
console.log(`  Регионов вне bbox нации: ${outOfBboxCount}`);

// ── Проверка 4: столица нации в регионах нации ───────────────────
console.log('[4] Проверка столиц...');
let capitalMissCount = 0;
for (const [nationId, geo] of Object.entries(NATION_GEO)) {
  if (!geo.capital) continue;
  const { lat, lon } = geo.capital;
  if (!lat || !lon) continue;

  // Ищем ближайший регион нации к столице
  const myRegions = nationRegions[nationId] ?? [];
  if (myRegions.length === 0) continue;

  // Столица должна быть внутри bbox хоть одного из регионов нации
  let capitalCovered = false;
  let minDist = Infinity;
  for (const rId of myRegions) {
    const c = REGION_CENTROIDS[rId];
    if (!c) continue;
    const dist = Math.sqrt((c.lat - lat)**2 + (c.lon - lon)**2);
    if (dist < minDist) minDist = dist;
    if (dist < 2.0) { capitalCovered = true; break; }  // ~200км
  }

  if (!capitalCovered && minDist > 5.0) {  // >~500км — подозрительно
    capitalMissCount++;
    warn('CAPITAL_DISTANT', nationId,
      `Столица [${lat},${lon}] далеко от ближайшего региона нации (dist=${minDist.toFixed(1)}°)`,
      { dist: minDist.toFixed(1) }
    );
  }
}
console.log(`  Наций с далёкой столицей: ${capitalMissCount}`);

// ── Статистика terrain по нациям ─────────────────────────────────
const nationTerrainStats = {};
for (const [nationId, regions] of Object.entries(nationRegions)) {
  const terrains = {};
  for (const rId of regions) {
    const c = REGION_CENTROIDS[rId];
    if (!c) continue;
    const t = c.terrain ?? 'unknown';
    terrains[t] = (terrains[t] ?? 0) + 1;
  }
  nationTerrainStats[nationId] = terrains;
}

// ── Итоговые счётчики ─────────────────────────────────────────────
const neutralCount = Object.values(REGION_ASSIGNMENTS).filter(v => v === 'neutral').length;
const assignedCount = Object.values(REGION_ASSIGNMENTS).filter(v => v !== 'neutral').length;
const uniqueNations = new Set(Object.values(REGION_ASSIGNMENTS).filter(v => v !== 'neutral')).size;

// ── Отчёт в консоль ───────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('ОТЧЁТ О КАЧЕСТВЕ НАЗНАЧЕНИЯ');
console.log('═'.repeat(60));
console.log(`Назначено нациям:  ${assignedCount} регионов (${uniqueNations} уникальных наций)`);
console.log(`Осталось neutral:  ${neutralCount} регионов`);
console.log(`Всего проблем:     ${issues.length}`);

const byType = {};
for (const i of issues) byType[i.type] = (byType[i.type] ?? 0) + 1;
for (const [t, c] of Object.entries(byType).sort()) {
  console.log(`  ${t.padEnd(25)} ${c}`);
}

// Топ-30 наций по регионам
console.log('\nТоп-30 наций по регионам:');
const sorted = Object.entries(nationRegions).sort((a, b) => b[1].length - a[1].length).slice(0, 30);
for (const [nationId, regions] of sorted) {
  const geo = NATION_GEO[nationId];
  const p = geo?.priority ?? '?';
  const terrain = nationTerrainStats[nationId] ?? {};
  const terrainStr = Object.entries(terrain).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([t,c]) => `${t}:${c}`).join(' ');
  console.log(`  ${nationId.padEnd(22)} ${String(regions.length).padStart(4)} регионов  p=${p}  [${terrainStr}]`);
}

// Нации из nation_geo без регионов (первые 40)
const missing = Object.keys(NATION_GEO).filter(id => !(nationRegions[id]?.length > 0));
if (missing.length > 0) {
  console.log(`\nНации без регионов (${missing.length}):`);
  for (let i = 0; i < Math.min(40, missing.length); i++) {
    const geo = NATION_GEO[missing[i]];
    const bbox = geo?.bbox;
    const bboxStr = bbox ? `lat[${bbox.latMin}..${bbox.latMax}] lon[${bbox.lonMin}..${bbox.lonMax}]` : 'нет bbox';
    console.log(`  ${missing[i].padEnd(22)} p=${geo?.priority ?? '?'}  ${bboxStr}`);
  }
  if (missing.length > 40) console.log(`  ... и ещё ${missing.length - 40}`);
}

// ── Сохранение JSON-отчёта ────────────────────────────────────────
const report = {
  generated: new Date().toISOString(),
  summary: {
    total_regions: Object.keys(REGION_ASSIGNMENTS).length,
    assigned: assignedCount,
    neutral: neutralCount,
    unique_nations: uniqueNations,
    issues_count: issues.length,
  },
  issues,
  nation_stats: Object.fromEntries(
    Object.entries(nationRegions).map(([id, regs]) => [
      id,
      { count: regs.length, terrain: nationTerrainStats[id] ?? {} }
    ])
  ),
  missing_nations: missing,
};

const reportPath = path.join(ROOT, 'data', 'assignment_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`\n✓ Отчёт сохранён: data/assignment_report.json`);
console.log('\nСледующий: node scripts/stage5_apply_assignment.js');
