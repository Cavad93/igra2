// Тесты Шага 55 (arma.md) — Культурная карта наций (10 групп) + маппинг портретов
// Запуск: node tests/test_arma_stage55.mjs
//
// Чеклист из arma.md Шаг 55:
//   [1] data/culture_groups.js существует, парсится как JS
//   [2] Объявлены 10 ожидаемых групп (greek, roman, carthaginian, egyptian,
//       persian, celtic, indian, east_asian, nomadic, generic)
//   [3] Каждая группа имеет поля: label, nations, portrait_pool, texture,
//       panel_tint, border, icon, splash_bg
//   [4] Функция getCultureGroup(nationId) возвращает корректный groupId
//       (syracuse→greek, rome→roman, xiongnu→nomadic, unknown→generic)
//   [5] Функция getPortraitForCharacter возвращает строку вида
//       'assets/portraits/<group>/<file>.jpg'; для {id:'char_001'} в Афинах
//       результат — 'assets/portraits/greek/woman_red.jpg'
//   [6] Детерминированность: один и тот же char.id всегда даёт один и тот же файл
//   [7] index.html подключает data/culture_groups.js
//   [8] Помощник hashCode не зависит от Math.random / Date — чистая функция

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cgPath = resolve(root, 'data', 'culture_groups.js');
const htmlPath = resolve(root, 'index.html');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ═══════════════════════════════════════════════════════════════
section('[1] data/culture_groups.js существует и парсится');
// ═══════════════════════════════════════════════════════════════

check(existsSync(cgPath), '[1a] data/culture_groups.js существует');
const cgSrc = existsSync(cgPath) ? readFileSync(cgPath, 'utf8') : '';
check(cgSrc.length > 0, '[1b] файл непустой');

// Загружаем модуль через new Function, экспортируя нужные символы
let mod = null;
let loadErr = null;
try {
  // Удаляем CommonJS-экспорт, чтобы он не падал в sandbox
  const wrapped = cgSrc + `
;return {
  NATION_CULTURE_GROUPS: typeof NATION_CULTURE_GROUPS !== 'undefined' ? NATION_CULTURE_GROUPS : null,
  getCultureGroup: typeof getCultureGroup !== 'undefined' ? getCultureGroup : null,
  getPortraitForCharacter: typeof getPortraitForCharacter !== 'undefined' ? getPortraitForCharacter : null,
  hashCode: typeof hashCode !== 'undefined' ? hashCode : null,
};`;
  // Подсовываем фейковый module/exports, чтобы CommonJS-блок в файле не упал
  const fn = new Function('module', 'exports', wrapped);
  mod = fn({ exports: {} }, {});
} catch (e) {
  loadErr = e;
}
check(loadErr === null, '[1c] модуль загружается без исключений' + (loadErr ? ': ' + loadErr.message : ''));
check(mod && mod.NATION_CULTURE_GROUPS, '[1d] NATION_CULTURE_GROUPS определён');
check(mod && typeof mod.getCultureGroup === 'function', '[1e] getCultureGroup — функция');
check(mod && typeof mod.getPortraitForCharacter === 'function', '[1f] getPortraitForCharacter — функция');
check(mod && typeof mod.hashCode === 'function', '[1g] hashCode — функция');

const G = mod && mod.NATION_CULTURE_GROUPS ? mod.NATION_CULTURE_GROUPS : {};

// ═══════════════════════════════════════════════════════════════
section('[2] 10 ожидаемых культурных групп');
// ═══════════════════════════════════════════════════════════════

const expectedGroups = [
  'greek', 'roman', 'carthaginian', 'egyptian', 'persian',
  'celtic', 'indian', 'east_asian', 'nomadic', 'generic',
];
for (const g of expectedGroups) {
  check(!!G[g], `[2a] группа "${g}" объявлена`);
}
check(Object.keys(G).length >= 10, '[2b] объявлено не менее 10 групп');

// ═══════════════════════════════════════════════════════════════
section('[3] Поля каждой группы');
// ═══════════════════════════════════════════════════════════════

const requiredFields = [
  'label', 'nations', 'portrait_pool',
  'texture', 'panel_tint', 'border', 'icon', 'splash_bg',
];
for (const g of expectedGroups) {
  if (!G[g]) continue;
  for (const f of requiredFields) {
    check(G[g][f] != null, `[3.${g}] поле "${f}"`);
  }
  check(Array.isArray(G[g].nations), `[3.${g}] nations — массив`);
  check(Array.isArray(G[g].portrait_pool) && G[g].portrait_pool.length > 0,
    `[3.${g}] portrait_pool — непустой массив`);
}

// ═══════════════════════════════════════════════════════════════
section('[4] getCultureGroup — поведение');
// ═══════════════════════════════════════════════════════════════

if (mod && mod.getCultureGroup) {
  const f = mod.getCultureGroup;
  check(f('syracuse').groupId === 'greek',           '[4a] syracuse → greek');
  check(f('athens').groupId === 'greek',             '[4b] athens → greek');
  check(f('rome').groupId === 'roman',               '[4c] rome → roman');
  check(f('carthage').groupId === 'carthaginian',    '[4d] carthage → carthaginian');
  check(f('meroe').groupId === 'egyptian',           '[4e] meroe → egyptian');
  check(f('parthia').groupId === 'persian',          '[4f] parthia → persian');
  check(f('arverni').groupId === 'celtic',           '[4g] arverni → celtic');
  check(f('maurya_empire').groupId === 'indian',     '[4h] maurya_empire → indian');
  check(f('han').groupId === 'east_asian',           '[4i] han → east_asian');
  check(f('xiongnu').groupId === 'nomadic',          '[4j] xiongnu → nomadic');
  check(f('unknown_small_tribe').groupId === 'generic', '[4k] unknown → generic');
  check(f(null).groupId === 'generic',               '[4l] null → generic');
  check(f(undefined).groupId === 'generic',          '[4m] undefined → generic');
  // Возвращает обогащённый объект, а не только id
  const g = f('syracuse');
  check(typeof g.label === 'string' && g.label.length > 0,
    '[4n] возвращаемый объект содержит label');
  check(Array.isArray(g.portrait_pool),
    '[4o] возвращаемый объект содержит portrait_pool');
}

// ═══════════════════════════════════════════════════════════════
section('[5] getPortraitForCharacter — возвращает корректный путь');
// ═══════════════════════════════════════════════════════════════

if (mod && mod.getPortraitForCharacter) {
  const p = mod.getPortraitForCharacter({ id: 'char_001' }, 'athens');
  check(typeof p === 'string', '[5a] возвращает строку');
  check(p.startsWith('assets/portraits/'), '[5b] начинается с assets/portraits/');
  check(p.endsWith('.jpg'), '[5c] заканчивается на .jpg');
  check(p === 'assets/portraits/greek/woman_red.jpg',
    '[5d] {id:char_001} в Афинах → greek/woman_red.jpg (фактически: ' + p + ')');

  // Файл всегда из portrait_pool своей группы
  const greekPool = G.greek.portrait_pool.map(x => `assets/portraits/${x}.jpg`);
  for (let i = 0; i < 20; i++) {
    const id = 'char_' + i.toString().padStart(3, '0');
    const path = mod.getPortraitForCharacter({ id }, 'athens');
    if (!greekPool.includes(path)) {
      check(false, `[5e] портрет "${path}" должен быть из greek portrait_pool`);
      break;
    }
  }
  check(true, '[5e] все портреты из greek portrait_pool');

  // Для неизвестной нации — generic pool
  const genericPool = G.generic.portrait_pool.map(x => `assets/portraits/${x}.jpg`);
  const unkPath = mod.getPortraitForCharacter({ id: 'char_001' }, 'unknown_tribe');
  check(genericPool.includes(unkPath),
    '[5f] неизвестная нация → портрет из generic pool');
}

// ═══════════════════════════════════════════════════════════════
section('[6] Детерминированность');
// ═══════════════════════════════════════════════════════════════

if (mod && mod.getPortraitForCharacter) {
  const a = mod.getPortraitForCharacter({ id: 'char_042' }, 'athens');
  const b = mod.getPortraitForCharacter({ id: 'char_042' }, 'athens');
  const c = mod.getPortraitForCharacter({ id: 'char_042' }, 'athens');
  check(a === b && b === c, '[6a] один и тот же char.id даёт один и тот же файл');

  // Разные id могут давать разные результаты (но не обязаны).
  // Проверим, что хотя бы 2 разных значения встречаются на 50 разных id.
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    seen.add(mod.getPortraitForCharacter({ id: 'char_' + i }, 'athens'));
  }
  check(seen.size >= 2, '[6b] разные id дают разные портреты (распределение по pool)');
}

// ═══════════════════════════════════════════════════════════════
section('[7] index.html подключает data/culture_groups.js');
// ═══════════════════════════════════════════════════════════════

const htmlSrc = readFileSync(htmlPath, 'utf8');
check(/<script[^>]+src=["']data\/culture_groups\.js["']/.test(htmlSrc),
  '[7a] <script src="data/culture_groups.js"> присутствует');

// ═══════════════════════════════════════════════════════════════
section('[8] hashCode — чистая функция');
// ═══════════════════════════════════════════════════════════════

if (mod && mod.hashCode) {
  check(mod.hashCode('abc') === mod.hashCode('abc'),
    '[8a] hashCode детерминирован');
  check(typeof mod.hashCode('abc') === 'number',
    '[8b] hashCode возвращает число');
  check(mod.hashCode('abc') >= 0,
    '[8c] hashCode возвращает неотрицательное число');
  check(!/Math\.random|Date\.now/.test(cgSrc.match(/function\s+hashCode[\s\S]*?\n\}/)?.[0] || ''),
    '[8d] реализация hashCode не использует Math.random / Date.now');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 55: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
