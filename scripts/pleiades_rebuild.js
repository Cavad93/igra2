#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// REBUILD: удаляет нации не найденные в Pleiades (не восточноазиатские),
//          затем добавляет Pleiades-settlements как новые нации
//
// Шаг 1: удалить 245 наций → их регионы → neutral
// Шаг 2: найти Pleiades settlements без совпадения → добавить как нации
// Шаг 3: обновить nation_geo.js для новых наций
// ═══════════════════════════════════════════════════════════════════
import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Загрузка ──────────────────────────────────────────────────────
const rep = JSON.parse(fs.readFileSync(path.join(ROOT,'data','validation_report.json')));
const pleiadesAll = JSON.parse(fs.readFileSync(path.join(ROOT,'data','pleiades_300bc.json')));

const gtSrc = fs.readFileSync(path.join(ROOT,'data','nation_geo.js'),'utf8').replace(/^var /mg,'var ');
const gs = vm.createContext({console});
vm.runInContext(gtSrc, gs);
const NATION_GEO = gs.NATION_GEO;

const ntSrc = fs.readFileSync(path.join(ROOT,'data','nations.js'),'utf8')
  .replace(/^const /mg,'var ').replace(/^let /mg,'var ');
const ns = vm.createContext({console});
vm.runInContext(ntSrc, ns);
const NATIONS = ns.INITIAL_GAME_STATE.nations;

const rdSrc = fs.readFileSync(path.join(ROOT,'data','regions_data.js'),'utf8');
const rs = vm.createContext({INITIAL_GAME_STATE: ns.INITIAL_GAME_STATE, console});
vm.runInContext(rdSrc, rs);
const REGIONS = rs.INITIAL_GAME_STATE.regions;

// ── Восточноазиатский фильтр ───────────────────────────────────────
function isEastAsian(nid) {
  const g = NATION_GEO[nid];
  if (!g?.bbox) return false;
  const clon = (g.bbox.lonMin + g.bbox.lonMax) / 2;
  const clat = (g.bbox.latMin + g.bbox.latMax) / 2;
  return clon > 60 || (clon > 45 && clat < 32);
}

const toDelete = rep.no_match
  .filter(n => n.reason === 'not_in_pleiades')
  .map(n => n.id)
  .filter(nid => !isEastAsian(nid));

console.log(`Наций к удалению: ${toDelete.length}`);

// ── ШАГ 1: Удаление наций ─────────────────────────────────────────
let freedRegions = 0;
const deletedSet = new Set(toDelete);

// Освобождаем регионы → neutral
for (const [rid, reg] of Object.entries(REGIONS)) {
  if (deletedSet.has(reg.nation)) {
    reg.nation = 'neutral';
    freedRegions++;
  }
}
console.log(`  Регионов освобождено → neutral: ${freedRegions}`);

// Удаляем из NATIONS
for (const nid of toDelete) {
  delete NATIONS[nid];
}
// Очищаем из nation_geo
for (const nid of toDelete) {
  delete NATION_GEO[nid];
}
console.log(`  Наций удалено: ${toDelete.length}`);

// ── ШАГ 2: Нахождение Pleiades без совпадения ─────────────────────
console.log('\nПоиск Pleiades-settlements без совпадения...');

// Собираем все bbox оставшихся наций
const remainingGeo = Object.entries(NATION_GEO);

// Для каждого Pleiades settlement: проверяем, покрыт ли он существующей нацией
const matchedPids = new Set();
// Pids уже матченных (из validation_report)
for (const e of [...rep.ok, ...rep.warn]) {
  if (e.pleiades_title) matchedPids.add(e.pleiades_title);
}

// Только settlements + regions с координатами
const pleiadesSettlements = pleiadesAll.filter(p =>
  p.types === 'settlement' &&
  p.lat && p.lon &&
  !matchedPids.has(p.title)
);
console.log(`  Pleiades settlements не совпавших: ${pleiadesSettlements.length}`);

// Для каждого — есть ли нация которая его "покрывает" (capital < 1° от settlement)
function isCoveredByExisting(p) {
  for (const [nid, g] of remainingGeo) {
    if (!g.capital) continue;
    const d = Math.sqrt((g.capital.lat - p.lat)**2 + (g.capital.lon - p.lon)**2);
    if (d < 1.5) return true;  // уже есть нация с столицей близко
  }
  return false;
}

const newCandidates = pleiadesSettlements.filter(p => !isCoveredByExisting(p));
console.log(`  Не покрытых существующими нациями: ${newCandidates.length}`);

// ── ШАГ 3: Добавление новых наций из Pleiades ─────────────────────
console.log('\nДобавление новых наций...');

// Генерация ID из названия Pleiades
function makeId(title) {
  return title.split('|')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
}

// Убираем дубли ID
const usedIds = new Set(Object.keys(NATIONS));
let addedCount = 0;

for (const p of newCandidates) {
  let baseId = makeId(p.title);
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = baseId + '_' + (suffix++);
  usedIds.add(id);

  // Определяем bbox: ±1° вокруг точки (маленький city-state)
  const R = 0.8;
  const bbox = {
    latMin: +(p.lat - R).toFixed(4),
    latMax: +(p.lat + R).toFixed(4),
    lonMin: +(p.lon - R).toFixed(4),
    lonMax: +(p.lon + R).toFixed(4),
  };

  // Добавляем в NATIONS
  NATIONS[id] = {
    name: p.title.split('|')[0],
    color: '#888888',
    regions: [],
    pleiades_pid: p.pid,
    pleiades_title: p.title,
  };

  // Добавляем в NATION_GEO
  NATION_GEO[id] = {
    bbox,
    priority: 2,
    capital: { lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) },
    source: `pleiades:${p.pid}`,
    notes: `${p.title.split('|')[0]} — из Pleiades 300 BC (${p.minDate}..${p.maxDate})`,
  };

  addedCount++;
}
console.log(`  Добавлено новых наций: ${addedCount}`);

// ── Сохранение ────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g,'−').slice(0,19);
const backupDir = path.join(ROOT,'data','backups');

// Бэкап
fs.copyFileSync(
  path.join(ROOT,'data','nations.js'),
  path.join(backupDir,`nations_${ts}.js`)
);
fs.copyFileSync(
  path.join(ROOT,'data','regions_data.js'),
  path.join(backupDir,`regions_data_${ts}.js`)
);

// Сохраняем nations.js (пересборка)
function serializeNation(n) {
  return JSON.stringify(n);
}
const nEntries = Object.entries(NATIONS)
  .map(([k,v]) => `    "${k}": ${serializeNation(v)}`)
  .join(',\n');

// Читаем оригинальный файл и заменяем блок nations
let nationsSrc = fs.readFileSync(path.join(ROOT,'data','nations.js'),'utf8');

// Находим начало блока nations: { (с/без кавычек)
const nStartRe = /nations\s*:\s*\{/;
const nStartMatch = nStartRe.exec(nationsSrc);
if (!nStartMatch) throw new Error('Не найден блок nations: { в nations.js');
const blockStart = nStartMatch.index + nStartMatch[0].length; // позиция после открывающей {

// Находим matching закрывающую } через подсчёт скобок
let depth = 1;
let pos = blockStart;
while (pos < nationsSrc.length && depth > 0) {
  const ch = nationsSrc[pos];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
  pos++;
}
const blockEnd = pos - 1; // позиция самой закрывающей }

// Заменяем содержимое блока
nationsSrc = nationsSrc.slice(0, blockStart) + '\n' + nEntries + '\n  ' + nationsSrc.slice(blockEnd);
fs.writeFileSync(path.join(ROOT,'data','nations.js'), nationsSrc, 'utf8');
console.log('\n✓ nations.js сохранён');

// Сохраняем regions_data.js — меняем nation:'xxx' → 'neutral' для удалённых
let rdText = fs.readFileSync(path.join(ROOT,'data','regions_data.js'),'utf8');
let replacedCount = 0;
for (const nid of toDelete) {
  const esc = nid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(nation\\s*:\\s*['"])${esc}(['"])`, 'g');
  rdText = rdText.replace(re, (m, pre, post) => { replacedCount++; return `${pre}neutral${post}`; });
}
fs.writeFileSync(path.join(ROOT,'data','regions_data.js'), rdText, 'utf8');
console.log(`✓ regions_data.js: ${replacedCount} регионов → neutral`);

// Сохраняем nation_geo.js
const geoEntries = Object.entries(NATION_GEO)
  .map(([k,v]) => `  "${k}": ${JSON.stringify(v)}`)
  .join(',\n');
fs.writeFileSync(
  path.join(ROOT,'data','nation_geo.js'),
  `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${geoEntries}\n};\n`
);
console.log(`✓ nation_geo.js сохранён (${Object.keys(NATION_GEO).length} наций)`);

console.log(`\n════════════════════════════════════════════`);
console.log(`✓ Удалено наций:   ${toDelete.length}`);
console.log(`✓ Добавлено наций: ${addedCount}`);
console.log(`✓ Итого наций:     ${Object.keys(NATIONS).length}`);
console.log(`✓ Регионов → neutral: ${freedRegions}`);
console.log(`\nСледующий: node scripts/stage3_assign_regions.js`);
