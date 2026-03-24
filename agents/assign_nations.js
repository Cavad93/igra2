// agents/assign_nations.js
// Автоматически привязывает нации из nations.js к нейтральным регионам на карте.
//
// Алгоритм:
//   1. Находим все нации без регионов (regions: [])
//   2. Находим все нейтральные регионы (nation: 'neutral')
//   3. Группируем нейтральные регионы в кластеры по близости ID
//      (соседние числовые ID скорее всего географически близки)
//   4. Назначаем каждой нации кластер соответствующий её размеру (population)
//   5. Обновляем regions_data.js (nation: 'neutral' → nation: 'X')
//      и nations.js (regions: [] → regions: ['rXXX', ...])
//
// Запуск:
//   node agents/assign_nations.js              — полный запуск
//   node agents/assign_nations.js --dry-run    — только статистика, не пишет файлы
//   node agents/assign_nations.js --stats      — только показать текущее состояние

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');
const STATS   = process.argv.includes('--stats');

// ─────────────────────────────────────────────────────────────────────────────
// 1. ЗАГРУЗКА ДАННЫХ
// ─────────────────────────────────────────────────────────────────────────────

function loadVM(relPath, seed = {}) {
  let code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  code = code.replace(/^(const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm, 'var $2 =');
  const ctx = { console, ...seed };
  vm.createContext(ctx);
  try { vm.runInContext(code, ctx); } catch (e) { /* silent */ }
  return ctx;
}

console.log('Загрузка данных...');

// regions_data.js ожидает INITIAL_GAME_STATE.regions как объект для записи
const regCtx = loadVM('data/regions_data.js', {
  INITIAL_GAME_STATE: { regions: {} },
});

// nations.js сам объявляет INITIAL_GAME_STATE = { nations: {...} }
const natCtx = loadVM('data/nations.js');

const REGIONS = regCtx.INITIAL_GAME_STATE?.regions || {};
const NATIONS = natCtx.INITIAL_GAME_STATE?.nations || {};

// ─────────────────────────────────────────────────────────────────────────────
// 2. АНАЛИЗ ТЕКУЩЕГО СОСТОЯНИЯ
// ─────────────────────────────────────────────────────────────────────────────

// Нейтральные регионы (nation === 'neutral')
const neutralRegions = Object.entries(REGIONS)
  .filter(([, r]) => r.nation === 'neutral')
  .map(([rid, r]) => ({ rid, num: parseInt(rid.slice(1)), pop: r.population || 0, r }))
  .sort((a, b) => a.num - b.num);

// Нации без регионов
const unassignedNations = Object.entries(NATIONS)
  .filter(([, n]) => !Array.isArray(n.regions) || n.regions.length === 0)
  // Пропускаем служебные ключи
  .filter(([id]) => !['date', 'nations', 'world_market'].includes(id))
  .map(([id, n]) => ({ id, pop: n.population?.total || 30000, n }))
  .sort((a, b) => b.pop - a.pop);  // крупные нации первыми

console.log(`\nНейтральных регионов: ${neutralRegions.length}`);
console.log(`Наций без регионов:   ${unassignedNations.length}`);
console.log(`Наций на карте:       ${Object.values(NATIONS).filter(n => n.regions?.length > 0).length}`);

if (STATS) process.exit(0);

if (unassignedNations.length === 0) {
  console.log('\nВсе нации уже назначены на регионы.');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. РЕЖИМ СИНХРОНИЗАЦИИ
// Если нейтральных регионов нет — возможно regions_data.js уже обновлён,
// но nations.js — нет. Синхронизируем: читаем назначения из regions_data.js
// и обновляем nations.js.
// ─────────────────────────────────────────────────────────────────────────────

if (neutralRegions.length === 0) {
  console.log('\nНейтральных регионов нет.');
  console.log('Режим синхронизации: обновляем nations.js из текущего regions_data.js...');

  // Строим индекс: nationId → [rid, ...]
  const regionsByNation = new Map();
  for (const [rid, r] of Object.entries(REGIONS)) {
    if (!r.nation || r.nation === 'neutral') continue;
    if (!regionsByNation.has(r.nation)) regionsByNation.set(r.nation, []);
    regionsByNation.get(r.nation).push(rid);
  }

  // Находим нации которые имеют регионы в regions_data.js но regions:[] в nations.js
  const toSync = [];
  for (const [nationId, n] of Object.entries(NATIONS)) {
    if (['date','nations','world_market'].includes(nationId)) continue;
    const inRegions = regionsByNation.get(nationId) || [];
    const inNations = n.regions || [];
    if (inRegions.length > 0 && inNations.length === 0) {
      toSync.push({ id: nationId, rids: inRegions });
    }
  }

  console.log(`Наций для синхронизации: ${toSync.length}`);
  if (DRY_RUN || toSync.length === 0) {
    if (DRY_RUN) console.log('[DRY-RUN] Файлы НЕ изменены.');
    process.exit(0);
  }

  // Обновляем nations.js
  let nationsSrc = fs.readFileSync(path.join(ROOT, 'data', 'nations.js'), 'utf8');
  let patched = 0;
  for (const { id, rids } of toSync) {
    const ridsStr = rids.map(r => `'${r}'`).join(', ');
    const newRegions = `[${ridsStr}]`;
    const nationPattern = new RegExp(`(\\n[ \\t]+${id}\\s*:\\s*\\{[\\s\\S]*?)regions:\\s*\\[\\]`);
    const replaced = nationsSrc.replace(nationPattern, `$1regions: ${newRegions}`);
    if (replaced !== nationsSrc) { nationsSrc = replaced; patched++; }
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'nations.js'), nationsSrc, 'utf8');
  console.log(`Обновлено наций в nations.js: ${patched}`);
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. АЛГОРИТМ НАЗНАЧЕНИЯ (нейтральные регионы существуют)
// ─────────────────────────────────────────────────────────────────────────────
//
// Идея: кластеризуем нейтральные регионы по группам с близкими ID.
// Пробел > GAP_THRESHOLD между ID = граница кластера (другой географический район).
// Затем назначаем кластеры нациям по принципу:
//   - крупные нации получают несколько кластеров
//   - маленькие нации получают 1 кластер или часть кластера

const GAP_THRESHOLD = 20;  // пробел между ID ≥ этого значения = новый кластер

function clusterByIdGap(regions, gapThreshold) {
  const clusters = [];
  let current = [];
  for (let i = 0; i < regions.length; i++) {
    if (i > 0 && regions[i].num - regions[i - 1].num >= gapThreshold) {
      clusters.push(current);
      current = [];
    }
    current.push(regions[i]);
  }
  if (current.length) clusters.push(current);
  return clusters;
}

const clusters = clusterByIdGap(neutralRegions, GAP_THRESHOLD);
console.log(`\nКластеров (групп смежных регионов): ${clusters.length}`);

// Суммарное население нейтральных регионов
const totalNeutralPop = neutralRegions.reduce((s, r) => s + r.pop, 0);
const totalNationPop  = unassignedNations.reduce((s, n) => s + n.pop, 0);
const popRatio        = totalNeutralPop / Math.max(totalNationPop, 1);

console.log(`Население нейтральных регионов: ${totalNeutralPop.toLocaleString()}`);
console.log(`Население назначаемых наций:    ${totalNationPop.toLocaleString()}`);
console.log(`Масштаб: ${popRatio.toFixed(3)} (регион/нация)`);

// ── Шаг 1: определяем сколько регионов нужно каждой нации ──────────────────
// Используем взвешенное распределение по населению.
// Минимум 1 регион на нацию.

function calcTargetRegionCount(nationPop, totalNationPop, totalNeutralRegions) {
  const share = nationPop / totalNationPop;
  return Math.max(1, Math.round(share * totalNeutralRegions));
}

// Рассчитываем квоты
let quotas = unassignedNations.map(n => ({
  ...n,
  quota: calcTargetRegionCount(n.pop, totalNationPop, neutralRegions.length),
}));

// Корректируем чтобы сумма квот = кол-во нейтральных регионов
let totalQuota = quotas.reduce((s, q) => s + q.quota, 0);
const diff = neutralRegions.length - totalQuota;

if (diff > 0) {
  // Нужно добавить регионы — даём крупным нациям
  for (let i = 0; i < diff; i++) {
    quotas[i % quotas.length].quota++;
  }
} else if (diff < 0) {
  // Нужно убрать регионы — убираем у крупных (но минимум 1)
  let toRemove = -diff;
  for (let i = 0; i < quotas.length && toRemove > 0; i++) {
    if (quotas[i].quota > 1) {
      quotas[i].quota--;
      toRemove--;
    }
  }
}

// ── Шаг 2: назначаем регионы по квотам (последовательно по ID) ──────────────
// Сортируем нации по квоте desc чтобы крупные получали непрерывные блоки
quotas.sort((a, b) => b.quota - a.quota);

const assignment = new Map();  // nationId → [rid, ...]
let regionPool = [...neutralRegions];

for (const { id, quota } of quotas) {
  const assigned = regionPool.splice(0, quota);
  assignment.set(id, assigned.map(r => r.rid));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. СТАТИСТИКА
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== РАСПРЕДЕЛЕНИЕ (топ 20) ===');
const sortedAssign = [...assignment.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [id, rids] of sortedAssign.slice(0, 20)) {
  const n = NATIONS[id];
  const name = n?.name || id;
  console.log(`  ${id.padEnd(28)} ${String(rids.length).padStart(4)} рег.  (${name})`);
}
if (sortedAssign.length > 20) {
  console.log(`  ... и ещё ${sortedAssign.length - 20} наций`);
}

console.log(`\nИтого: ${assignment.size} наций получат регионы`);
console.log(`Итого: ${[...assignment.values()].reduce((s, v) => s + v.length, 0)} регионов будет назначено`);

if (DRY_RUN) {
  console.log('\n[DRY-RUN] Файлы НЕ изменены.');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ЗАПИСЬ — regions_data.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nОбновляем regions_data.js...');
const regionsFile = path.join(ROOT, 'data', 'regions_data.js');
const regionsSrc  = fs.readFileSync(regionsFile, 'utf8');
const regLines    = regionsSrc.split('\n');

// Строим обратный индекс: rid → nationId
const ridToNation = new Map();
for (const [nationId, rids] of assignment) {
  for (const rid of rids) ridToNation.set(rid, nationId);
}

let patchedRegions = 0;
for (let i = 0; i < regLines.length; i++) {
  const m = regLines[i].match(/^\s*R\['(r\d+)'\]=/);
  if (!m) continue;
  const rid = m[1];
  const newNation = ridToNation.get(rid);
  if (!newNation) continue;
  // Заменяем nation:'neutral' на nation:'newNation'
  const newLine = regLines[i].replace(/nation:'neutral'/, `nation:'${newNation}'`);
  if (newLine !== regLines[i]) {
    regLines[i] = newLine;
    patchedRegions++;
  }
}

fs.writeFileSync(regionsFile, regLines.join('\n'), 'utf8');
console.log(`  Обновлено строк: ${patchedRegions}`);

// ─────────────────────────────────────────────────────────────────────────────
// 6. ЗАПИСЬ — nations.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('Обновляем nations.js...');
const nationsFile = path.join(ROOT, 'data', 'nations.js');
let nationsSrc    = fs.readFileSync(nationsFile, 'utf8');

let patchedNations = 0;
for (const [nationId, rids] of assignment) {
  if (rids.length === 0) continue;
  const ridsStr = rids.map(r => `'${r}'`).join(', ');
  const newRegions = `[${ridsStr}]`;

  // Ищем строку: "      regions: []," или "      regions: []" для этой нации
  // Стратегия: найти блок нации и заменить в нём regions: []
  // Паттерн: ищем ровно "regions: []" ПОСЛЕ определения нации
  // Используем позиционный подход: найти ключ нации, затем найти regions: [] после него
  // Ищем ключ нации с любым количеством отступов
  const nationPattern = new RegExp(`\\n([ \\t]+)${nationId}\\s*:`);
  const nationMatch = nationPattern.exec(nationsSrc);
  if (!nationMatch) continue;

  const nationKeyIdx = nationMatch.index;
  const indent = nationMatch[1];

  // Ищем регион между ключом нации и закрывающей скобкой нации
  // Находим закрывающую } на том же уровне
  const blockStart = nationsSrc.indexOf('{', nationKeyIdx + nationMatch[0].length);
  if (blockStart === -1) continue;

  let depth = 0, blockEnd = -1;
  for (let j = blockStart; j < Math.min(nationsSrc.length, blockStart + 50000); j++) {
    if (nationsSrc[j] === '{') depth++;
    else if (nationsSrc[j] === '}') { depth--; if (depth === 0) { blockEnd = j; break; } }
  }
  if (blockEnd === -1) continue;

  const block = nationsSrc.slice(blockStart, blockEnd + 1);
  const replaced = block.replace(/regions:\s*\[\]/, `regions: ${newRegions}`);
  if (replaced !== block) {
    nationsSrc = nationsSrc.slice(0, blockStart) + replaced + nationsSrc.slice(blockEnd + 1);
    patchedNations++;
  }
}

fs.writeFileSync(nationsFile, nationsSrc, 'utf8');
console.log(`  Обновлено наций: ${patchedNations}`);

// ─────────────────────────────────────────────────────────────────────────────
// 7. ИТОГ
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== ГОТОВО ===');
console.log(`Наций добавлено на карту: ${patchedNations}`);
console.log(`Регионов переназначено:   ${patchedRegions}`);
console.log('\nФайлы обновлены:');
console.log('  data/regions_data.js');
console.log('  data/nations.js');
