#!/usr/bin/env node
// Исправляет nations.js: удаляет 245 не-Pleiades наций, добавляет 627 Pleiades наций
// Использует уже корректный nation_geo.js (1240 записей)
import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Загрузка ──────────────────────────────────────────────────────
const backupNations = path.join(ROOT, 'data', 'backups', 'nations_2026-03-25T05\u221252\u221231.js');
const src = fs.readFileSync(backupNations, 'utf8')
  .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ctx = vm.createContext({ console });
vm.runInContext(src, ctx);
const NATIONS = ctx.INITIAL_GAME_STATE.nations;
console.log('Загружено наций (оригинал):', Object.keys(NATIONS).length);

const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'validation_report.json')));

const geoSrc = fs.readFileSync(path.join(ROOT, 'data', 'nation_geo.js'), 'utf8').replace(/^var /mg, 'var ');
const gctx = vm.createContext({ console });
vm.runInContext(geoSrc, gctx);
const NATION_GEO = gctx.NATION_GEO;

// ── Восточноазиатский фильтр ──────────────────────────────────────
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

console.log('К удалению:', toDelete.length);
for (const nid of toDelete) delete NATIONS[nid];
console.log('После удаления:', Object.keys(NATIONS).length);

// ── Добавление Pleiades наций из nation_geo.js ────────────────────
const pleiades300 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pleiades_300bc.json')));
const pidMap = {};
for (const p of pleiades300) pidMap[p.pid] = p;

const pleiadesEntries = Object.entries(NATION_GEO).filter(([k, v]) =>
  v.source && v.source.startsWith('pleiades:')
);
console.log('Pleiades наций в geo:', pleiadesEntries.length);

let added = 0;
for (const [id, geo] of pleiadesEntries) {
  if (NATIONS[id]) continue;
  const pid = geo.source.replace('pleiades:', '');
  const p = pidMap[pid];
  NATIONS[id] = {
    name: geo.notes.split(' — ')[0],
    color: '#888888',
    regions: [],
    pleiades_pid: pid,
    pleiades_title: p ? p.title : geo.notes.split(' — ')[0],
  };
  added++;
}
console.log('Добавлено:', added);
console.log('Итого наций:', Object.keys(NATIONS).length);

// ── Сохранение nations.js ─────────────────────────────────────────
const nEntries = Object.entries(NATIONS)
  .map(([k, v]) => `    "${k}": ${JSON.stringify(v)}`)
  .join(',\n');

const nationsPath = path.join(ROOT, 'data', 'nations.js');
let nationsSrc = fs.readFileSync(backupNations, 'utf8')
  .replace(/^const /mg, 'const ').replace(/^let /mg, 'let ');

// Находим блок nations: { через подсчёт скобок
const nStartRe = /nations\s*:\s*\{/;
const nStartMatch = nStartRe.exec(nationsSrc);
if (!nStartMatch) throw new Error('Не найден блок nations: {');
const blockStart = nStartMatch.index + nStartMatch[0].length;

let depth = 1;
let pos = blockStart;
while (pos < nationsSrc.length && depth > 0) {
  const ch = nationsSrc[pos];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
  pos++;
}
const blockEnd = pos - 1;

nationsSrc = nationsSrc.slice(0, blockStart) + '\n' + nEntries + '\n  ' + nationsSrc.slice(blockEnd);

// Бэкап
const backupDir = path.join(ROOT, 'data', 'backups');
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.copyFileSync(nationsPath, path.join(backupDir, `nations_${ts}.js`));

fs.writeFileSync(nationsPath, nationsSrc, 'utf8');
console.log('\n✓ nations.js сохранён');

// ── Обновляем regions_data.js: удалённые нации → neutral ─────────
let rdText = fs.readFileSync(path.join(ROOT, 'data', 'regions_data.js'), 'utf8');
let replacedCount = 0;
for (const nid of toDelete) {
  const esc = nid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(nation\\s*:\\s*['"])${esc}(['"])`, 'g');
  rdText = rdText.replace(re, (m, pre, post) => { replacedCount++; return `${pre}neutral${post}`; });
}
fs.copyFileSync(path.join(ROOT, 'data', 'regions_data.js'), path.join(backupDir, `regions_data_${ts}.js`));
fs.writeFileSync(path.join(ROOT, 'data', 'regions_data.js'), rdText, 'utf8');
console.log(`✓ regions_data.js: ${replacedCount} регионов → neutral`);

console.log('\n════════════════════════════════════════════');
console.log(`✓ Удалено наций:   ${toDelete.length}`);
console.log(`✓ Добавлено наций: ${added}`);
console.log(`✓ Итого наций:     ${Object.keys(NATIONS).length}`);
