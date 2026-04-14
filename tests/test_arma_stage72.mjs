// Тесты Шага 72 (arma.md) — CSS-вариации умножают пул портретов в 8 раз.
// Запуск: node tests/test_arma_stage72.mjs
//
// Чеклист из arma.md Шаг 72:
//   [T1] Два персонажа одной нации с разными id получают разные filter или src.
//   [T2] Один и тот же персонаж всегда получает один и тот же портрет
//        (детерминированность — тот же src И тот же filter).
//   [T3] PORTRAIT_FILTERS[0] === '' — оригинал без изменений.
//   [T4] При удалённом JPG onerror показывает placeholder.svg без фильтра.
//
// Дополнительно (спецификация Шага 72):
//   [T5] PORTRAIT_FILTERS содержит ровно 8 элементов.
//   [T6] getPortraitInfoForCharacter возвращает объект {src, filter}.
//   [T7] Индекс фильтра независим от индекса src (используется hashCode(id+'_filter')).
//   [T8] Все 8 фильтров встречаются в выборке 200 персонажей.
//   [T9] Пулы культурных групп расширены (≥6 записей в каждой из 10 групп).
//  [T10] data/portrait_filters.js подключается в index.html до ui/portrait.js.
//  [T11] renderPortrait / renderPortraitHTML применяют filter inline.

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ─────────────────────────────────────────────────────────────────────────
// Загружаем в sandbox data/portrait_filters.js и data/culture_groups.js
// ─────────────────────────────────────────────────────────────────────────
const filtersPath = join(root, 'data/portrait_filters.js');
const cgPath      = join(root, 'data/culture_groups.js');
const htmlPath    = join(root, 'index.html');
const portraitJs  = join(root, 'ui/portrait.js');

check(existsSync(filtersPath), '[file] data/portrait_filters.js существует');
check(existsSync(cgPath),      '[file] data/culture_groups.js существует');
check(existsSync(portraitJs),  '[file] ui/portrait.js существует');

const filtersSrc = readFileSync(filtersPath, 'utf8');
const cgSrc      = readFileSync(cgPath,      'utf8');
const portraitSrc= readFileSync(portraitJs,  'utf8');
const htmlSrc    = readFileSync(htmlPath,    'utf8');

// Sandbox для вычисления кода.
const sandbox = {
  window: {}, document: {}, module: { exports: {} }, exports: {},
};
sandbox.module.exports = sandbox.exports;
vm.createContext(sandbox);
vm.runInContext(filtersSrc, sandbox);
vm.runInContext(cgSrc, sandbox);

const PORTRAIT_FILTERS = sandbox.PORTRAIT_FILTERS ?? sandbox.window.PORTRAIT_FILTERS;
const getPortraitInfoForCharacter = sandbox.getPortraitInfoForCharacter
  ?? sandbox.window.getPortraitInfoForCharacter
  ?? (sandbox.module.exports && sandbox.module.exports.getPortraitInfoForCharacter);
const getPortraitForCharacter = sandbox.getPortraitForCharacter
  ?? (sandbox.module.exports && sandbox.module.exports.getPortraitForCharacter);
const NATION_CULTURE_GROUPS = sandbox.NATION_CULTURE_GROUPS
  ?? (sandbox.module.exports && sandbox.module.exports.NATION_CULTURE_GROUPS);
const hashCode = sandbox.hashCode
  ?? (sandbox.module.exports && sandbox.module.exports.hashCode);

// ═══════════════════════════════════════════════════════════════
section('[T5] PORTRAIT_FILTERS — 8 элементов');
// ═══════════════════════════════════════════════════════════════
check(Array.isArray(PORTRAIT_FILTERS), '[T5a] PORTRAIT_FILTERS — массив');
check(PORTRAIT_FILTERS && PORTRAIT_FILTERS.length === 8,
  `[T5b] PORTRAIT_FILTERS.length === 8 (фактически ${PORTRAIT_FILTERS?.length})`);

// ═══════════════════════════════════════════════════════════════
section('[T3] PORTRAIT_FILTERS[0] === \'\' (оригинал)');
// ═══════════════════════════════════════════════════════════════
check(PORTRAIT_FILTERS && PORTRAIT_FILTERS[0] === '',
  `[T3a] PORTRAIT_FILTERS[0] — пустая строка (факт: "${PORTRAIT_FILTERS?.[0]}")`);

// Остальные 7 фильтров должны быть непустыми CSS-строками
let nonEmpty = 0;
for (let i = 1; i < 8; i++) {
  if (typeof PORTRAIT_FILTERS?.[i] === 'string' && PORTRAIT_FILTERS[i].length > 0) nonEmpty++;
}
check(nonEmpty === 7, `[T3b] Фильтры 1–7 непустые (${nonEmpty}/7)`);

// ═══════════════════════════════════════════════════════════════
section('[T6] getPortraitInfoForCharacter → {src, filter}');
// ═══════════════════════════════════════════════════════════════
check(typeof getPortraitInfoForCharacter === 'function',
  '[T6a] getPortraitInfoForCharacter — функция');

if (typeof getPortraitInfoForCharacter === 'function') {
  const info = getPortraitInfoForCharacter({ id: 'char_001' }, 'athens');
  check(info && typeof info === 'object', '[T6b] возвращает объект');
  check(typeof info?.src === 'string', '[T6c] info.src — строка');
  check(info?.src?.startsWith('assets/portraits/') && info.src.endsWith('.jpg'),
    '[T6d] info.src указывает на JPG в assets/portraits/');
  check(typeof info?.filter === 'string', '[T6e] info.filter — строка');
  check(PORTRAIT_FILTERS.includes(info.filter),
    '[T6f] info.filter принадлежит PORTRAIT_FILTERS');
}

// ═══════════════════════════════════════════════════════════════
section('[T2] Детерминированность');
// ═══════════════════════════════════════════════════════════════
if (typeof getPortraitInfoForCharacter === 'function') {
  const a = getPortraitInfoForCharacter({ id: 'char_042' }, 'athens');
  const b = getPortraitInfoForCharacter({ id: 'char_042' }, 'athens');
  const c = getPortraitInfoForCharacter({ id: 'char_042' }, 'athens');
  check(a.src === b.src && b.src === c.src, '[T2a] повтор src одинаков');
  check(a.filter === b.filter && b.filter === c.filter, '[T2b] повтор filter одинаков');
}

// ═══════════════════════════════════════════════════════════════
section('[T1] Разные id → разные filter ИЛИ разные src');
// ═══════════════════════════════════════════════════════════════
if (typeof getPortraitInfoForCharacter === 'function') {
  let diffCount = 0, pairs = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const x = getPortraitInfoForCharacter({ id: 'char_' + i }, 'athens');
      const y = getPortraitInfoForCharacter({ id: 'char_' + j }, 'athens');
      if (x.src !== y.src || x.filter !== y.filter) diffCount++;
      pairs++;
      if (pairs >= 200) break;
    }
    if (pairs >= 200) break;
  }
  // Из 200 пар подавляющее большинство должны различаться.
  check(diffCount >= 190,
    `[T1a] ≥190/200 пар различаются (фактически ${diffCount}/${pairs})`);
}

// ═══════════════════════════════════════════════════════════════
section('[T7] Индекс фильтра независим от индекса src');
// ═══════════════════════════════════════════════════════════════
if (typeof getPortraitInfoForCharacter === 'function') {
  // В коде culture_groups должно быть использование отдельного hashCode
  // с суффиксом '_filter' (или эквивалента).
  check(/_filter/.test(cgSrc),
    '[T7a] В data/culture_groups.js используется суффикс _filter для второго хэша');

  // Эмпирическая проверка: разные персонажи, получившие один и тот же src,
  // должны иметь распределение по всем ≥4 фильтрам.
  const filtersBySrc = new Map();
  for (let i = 0; i < 500; i++) {
    const info = getPortraitInfoForCharacter({ id: 'char_' + i }, 'athens');
    if (!filtersBySrc.has(info.src)) filtersBySrc.set(info.src, new Set());
    filtersBySrc.get(info.src).add(info.filter);
  }
  let rich = 0;
  for (const set of filtersBySrc.values()) if (set.size >= 2) rich++;
  check(rich >= 10,
    `[T7b] ≥10 разных src ассоциированы с ≥2 разными фильтрами (${rich})`);
}

// ═══════════════════════════════════════════════════════════════
section('[T8] Все 8 фильтров встречаются в выборке 200 персонажей');
// ═══════════════════════════════════════════════════════════════
if (typeof getPortraitInfoForCharacter === 'function') {
  const seenFilters = new Set();
  for (let i = 0; i < 200; i++) {
    seenFilters.add(getPortraitInfoForCharacter({ id: 'char_' + i }, 'athens').filter);
  }
  check(seenFilters.size === 8,
    `[T8a] все 8 фильтров встречаются (факт: ${seenFilters.size})`);
}

// ═══════════════════════════════════════════════════════════════
section('[T9] portrait_pool расширены (≥6 записей) во всех 10 группах');
// ═══════════════════════════════════════════════════════════════
if (NATION_CULTURE_GROUPS) {
  const GROUPS = [
    'greek','roman','egyptian','persian','celtic',
    'indian','east_asian','nomadic','carthaginian','generic',
  ];
  for (const g of GROUPS) {
    const pool = NATION_CULTURE_GROUPS[g]?.portrait_pool;
    check(Array.isArray(pool) && pool.length >= 6,
      `[T9:${g}] portrait_pool.length=${pool?.length} ≥ 6`);
  }

  // Греческий пул должен быть особенно большим (≥ 20): база Шагов 69, 70.
  const greekLen = NATION_CULTURE_GROUPS.greek?.portrait_pool?.length ?? 0;
  check(greekLen >= 20, `[T9:greek-large] greek.portrait_pool ≥20 (${greekLen})`);

  // Сумма всех портретов × 8 должна давать ≥ 800 вариантов.
  let total = 0;
  for (const g of GROUPS) total += (NATION_CULTURE_GROUPS[g]?.portrait_pool?.length ?? 0);
  check(total * 8 >= 800, `[T9:total] ~${total * 8} комбинаций (${total}×8) ≥ 800`);
}

// ═══════════════════════════════════════════════════════════════
section('[T10] index.html подключает data/portrait_filters.js до ui/portrait.js');
// ═══════════════════════════════════════════════════════════════
const filtersIdx = htmlSrc.indexOf('data/portrait_filters.js');
const cgIdx      = htmlSrc.indexOf('data/culture_groups.js');
const portIdx    = htmlSrc.indexOf('ui/portrait.js');
check(filtersIdx > 0, '[T10a] <script src="data/portrait_filters.js"> присутствует');
check(filtersIdx > 0 && cgIdx > 0 && filtersIdx < cgIdx,
  '[T10b] portrait_filters.js подключён до culture_groups.js');
check(filtersIdx > 0 && portIdx > 0 && filtersIdx < portIdx,
  '[T10c] portrait_filters.js подключён до ui/portrait.js');

// ═══════════════════════════════════════════════════════════════
section('[T11] ui/portrait.js применяет filter inline');
// ═══════════════════════════════════════════════════════════════
check(/getPortraitInfoForCharacter/.test(portraitSrc),
  '[T11a] ui/portrait.js вызывает getPortraitInfoForCharacter');
check(/style\.filter\s*=/.test(portraitSrc) || /style="filter:/.test(portraitSrc),
  '[T11b] ui/portrait.js устанавливает style.filter');
check(/onerror[\s\S]*filter\s*=\s*''/.test(portraitSrc) ||
      /this\.style\.filter=''/.test(portraitSrc),
  '[T11c] onerror сбрасывает style.filter до placeholder.svg');

// ═══════════════════════════════════════════════════════════════
section('[T4] Fallback к placeholder.svg без фильтра');
// ═══════════════════════════════════════════════════════════════
check(/placeholder\.svg/.test(portraitSrc),
  '[T4a] ui/portrait.js ссылается на placeholder.svg');
// Визуальная проверка: после onerror и src=placeholder, filter должен быть ''.
check(/img\.src\s*=\s*FALLBACK[\s\S]*img\.style\.filter\s*=\s*''/.test(portraitSrc)
      || /this\.src='[^']*placeholder\.svg'[^>]*this\.style\.filter=''/.test(portraitSrc)
      || (/FALLBACK[\s\S]*filter\s*=\s*''/.test(portraitSrc)),
  '[T4b] после fallback CSS-фильтр очищается');

// ═══════════════════════════════════════════════════════════════
// Доп. sanity: не сломали Шаг 55 — getPortraitForCharacter всё ещё возвращает строку
// ═══════════════════════════════════════════════════════════════
section('[sanity] Шаг 55: getPortraitForCharacter всё ещё возвращает строку');
if (typeof getPortraitForCharacter === 'function') {
  const p = getPortraitForCharacter({ id: 'char_001' }, 'athens');
  check(typeof p === 'string', '[sanity-a] возвращает строку');
  check(p === 'assets/portraits/greek/woman_red.jpg',
    `[sanity-b] {char_001} → greek/woman_red.jpg (факт: ${p})`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────');
console.log(`Шаг 72: passed ${pass}, failed ${fail}`);
if (fail > 0) {
  console.log('Провалы:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
