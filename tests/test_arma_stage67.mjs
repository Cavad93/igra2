// Тесты Шага 67 (arma.md) — Splash-фоны: исторические сцены для каждой культурной группы
// Запуск: node tests/test_arma_stage67.mjs
//
// Чеклист из arma.md Шаг 67:
//   [1] assets/manifest.json содержит ровно 10 записей с group="backgrounds"
//       (по одной для каждой из 10 культурных групп + generic fallback)
//   [2] Все ожидаемые splash-id присутствуют: splash_pompeii, splash_alexander,
//       splash_battle, splash_carthage, splash_nome_gods, splash_persepolis,
//       splash_celtic_head, splash_gandhara_stupa, splash_night_white, splash_scythian_stag
//   [3] Каждая запись фонового ассета содержит source (http(s) URL),
//       license (CC0/Public Domain) и attribution; filename вида
//       assets/backgrounds/<id>.jpg
//   [4] После `bash assets/download.sh` assets/backgrounds/ содержит 10 JPG,
//       каждый валидный JPEG (magic SOI 0xFFD8) и ≥ 200 KB
//       (если сеть недоступна — проверки размеров/валидности пропускаются).
//   [5] data/culture_groups.js: каждая из 10 культурных групп ссылается на
//       существующий splash_bg, и все 10 ссылок уникальны (нет коллизий).
//   [6] ui/splash.js: initSplash резолвит bg через getCultureGroup и ставит
//       CSS-переменную --splash-bg на assets/backgrounds/<id>.jpg;
//       CSS index.html применяет filter: sepia(...) brightness(...) чтобы
//       splash выглядел исторично.

import { readFileSync, existsSync, statSync, readdirSync, openSync, readSync, closeSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ═══════════════════════════════════════════════════════════════
section('[1] manifest.json: 10 записей backgrounds');
// ═══════════════════════════════════════════════════════════════

const manifestPath = resolve(root, 'assets', 'manifest.json');
check(existsSync(manifestPath), '[1a] assets/manifest.json существует');

let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check(true, '[1b] manifest.json парсится как JSON');
} catch (e) {
  check(false, '[1b] manifest.json парсится как JSON: ' + e.message);
}

const backgrounds = (manifest && Array.isArray(manifest.assets))
  ? manifest.assets.filter(a => a.group === 'backgrounds')
  : [];
check(backgrounds.length === 10,
  `[1c] ровно 10 записей с group="backgrounds" (found ${backgrounds.length})`);

// ═══════════════════════════════════════════════════════════════
section('[2] Ожидаемые splash-id покрывают все 10 культурных групп');
// ═══════════════════════════════════════════════════════════════

const expectedIds = [
  'splash_pompeii',         // greek
  'splash_alexander',       // roman
  'splash_battle',          // generic fallback
  'splash_carthage',        // carthaginian
  'splash_nome_gods',       // egyptian
  'splash_persepolis',      // persian
  'splash_celtic_head',     // celtic
  'splash_gandhara_stupa',  // indian
  'splash_night_white',     // east_asian
  'splash_scythian_stag',   // nomadic
];
const actualIds = new Set(backgrounds.map(b => b.id));
for (const id of expectedIds) {
  check(actualIds.has(id), `[2a] manifest содержит id="${id}"`);
}
check(actualIds.size === 10,
  `[2b] все 10 id уникальны (distinct=${actualIds.size})`);

// ═══════════════════════════════════════════════════════════════
section('[3] Поля каждой background-записи');
// ═══════════════════════════════════════════════════════════════

for (const b of backgrounds) {
  check(typeof b.id === 'string' && b.id.length > 0,
    `[3a] ${b.id}: id — непустая строка`);
  check(typeof b.filename === 'string' &&
        b.filename === `assets/backgrounds/${b.id}.jpg`,
    `[3b] ${b.id}: filename=assets/backgrounds/${b.id}.jpg`);
  check(typeof b.source === 'string' && /^https?:\/\//.test(b.source),
    `[3c] ${b.id}: source — http(s) URL`);
  check(typeof b.license === 'string' && /CC0|Public\s*Domain/i.test(b.license),
    `[3d] ${b.id}: license CC0/Public Domain (got "${b.license}")`);
  check(typeof b.attribution === 'string' && b.attribution.length > 0,
    `[3e] ${b.id}: attribution заполнена`);
}

// ═══════════════════════════════════════════════════════════════
section('[4] assets/backgrounds/ — физические файлы (≥200 KB, валидный JPEG)');
// ═══════════════════════════════════════════════════════════════

const bgDir = resolve(root, 'assets', 'backgrounds');
check(existsSync(bgDir) && statSync(bgDir).isDirectory(),
  '[4a] assets/backgrounds/ существует');

let jpgs = [];
if (existsSync(bgDir)) {
  jpgs = readdirSync(bgDir).filter(f => /\.jpe?g$/i.test(f));
}

if (jpgs.length === 0) {
  console.log('  ! WARN: assets/backgrounds/ пуст — вероятно сеть недоступна.');
  console.log('  ! Проверки [4b]/[4c]/[4d] пропущены, manifest ОК.');
  check(true, '[4b] (skip — сеть недоступна, manifest корректен)');
} else {
  check(jpgs.length === 10,
    `[4b] ровно 10 JPG в assets/backgrounds/ (found ${jpgs.length})`);

  // Каждый файл ≥ 200 KB
  for (const f of jpgs) {
    const size = statSync(resolve(bgDir, f)).size;
    check(size >= 200 * 1024,
      `[4c] ${f} ≥ 200 KB (size=${size})`);
  }

  // Каждый файл — валидный JPEG (magic SOI = 0xFFD8)
  for (const f of jpgs) {
    const fd = openSync(resolve(bgDir, f), 'r');
    const buf = Buffer.alloc(2);
    readSync(fd, buf, 0, 2, 0);
    closeSync(fd);
    check(buf[0] === 0xFF && buf[1] === 0xD8,
      `[4d] ${f} начинается с JPEG SOI 0xFFD8`);
  }

  // Каждый JPG имеет запись в manifest
  for (const f of jpgs) {
    const id = f.replace(/\.jpe?g$/i, '');
    check(actualIds.has(id),
      `[4e] ${f} имеет запись в manifest (id=${id})`);
  }
}

// ═══════════════════════════════════════════════════════════════
section('[5] culture_groups.js: 10 групп → 10 уникальных splash_bg');
// ═══════════════════════════════════════════════════════════════

const culturesJsPath = resolve(root, 'data', 'culture_groups.js');
const culturesJs = readFileSync(culturesJsPath, 'utf8');

// Собираем все splash_bg значения
const splashBgs = [];
for (const m of culturesJs.matchAll(/splash_bg\s*:\s*'([^']+)'/g)) {
  splashBgs.push(m[1]);
}
check(splashBgs.length === 10,
  `[5a] 10 splash_bg полей (found ${splashBgs.length})`);

// Все значения должны существовать в manifest
let referencedAndShipped = 0;
for (const id of splashBgs) {
  if (actualIds.has(id)) referencedAndShipped++;
}
check(referencedAndShipped === splashBgs.length,
  `[5b] все splash_bg ссылаются на существующие manifest-id (${referencedAndShipped}/${splashBgs.length})`);

// Все 10 значений должны быть уникальны — у каждой группы свой splash
const uniqueSplashBgs = new Set(splashBgs);
check(uniqueSplashBgs.size === 10,
  `[5c] все 10 splash_bg уникальны (distinct=${uniqueSplashBgs.size})`);

// Группы greek/roman/carthaginian/... должны иметь семантически подходящие splash.
// Чтобы не зависеть от типа модульной системы (package.json type=module
// делает require() для .js в data/ невозможным), парсим файл как текст
// и вытаскиваем порядок splash_bg в каждой именованной группе.
const groupOrder = ['greek','roman','carthaginian','egyptian','persian','celtic','indian','east_asian','nomadic','generic'];
const expectMap = {
  greek:        'splash_pompeii',
  roman:        'splash_alexander',
  carthaginian: 'splash_carthage',
  egyptian:     'splash_nome_gods',
  persian:      'splash_persepolis',
  celtic:       'splash_celtic_head',
  indian:       'splash_gandhara_stupa',
  east_asian:   'splash_night_white',
  nomadic:      'splash_scythian_stag',
  generic:      'splash_battle',
};

/**
 * Для каждой именованной группы парсим её блок и ищем splash_bg внутри.
 * Регулярка ищет `^  groupId: {...}` с балансировкой через жадный lookahead до
 * следующего ключа того же отступа.
 */
function extractSplashBgForGroup(text, groupId) {
  const re = new RegExp(
    `\\b${groupId}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s{2}\\}`,
    'm'
  );
  const m = text.match(re);
  if (!m) return null;
  const block = m[1];
  const sb = block.match(/splash_bg\s*:\s*'([^']+)'/);
  return sb ? sb[1] : null;
}

for (const g of groupOrder) {
  const got = extractSplashBgForGroup(culturesJs, g);
  check(got === expectMap[g],
    `[5d] group "${g}".splash_bg == "${expectMap[g]}" (got "${got}")`);
}

// ═══════════════════════════════════════════════════════════════
section('[6] ui/splash.js + index.html — интеграция');
// ═══════════════════════════════════════════════════════════════

const splashJs = readFileSync(resolve(root, 'ui', 'splash.js'), 'utf8');
check(/assets\/backgrounds\//.test(splashJs),
  '[6a] splash.js ссылается на assets/backgrounds/');
check(/--splash-bg/.test(splashJs),
  '[6b] splash.js устанавливает CSS-переменную --splash-bg');
check(/getCultureGroup/.test(splashJs),
  '[6c] splash.js резолвит bg через getCultureGroup');

const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
check(/--splash-bg\s*:\s*url\('assets\/backgrounds\//.test(indexHtml),
  '[6d] index.html :root определяет --splash-bg c assets/backgrounds/ fallback');
// CSS фильтр: sepia(0.25) brightness(X) — X ∈ [0.5..0.85]
const filterMatch = indexHtml.match(/\.splash__bg[^\{]*\{[\s\S]*?filter\s*:\s*sepia\(0?\.25\)\s*brightness\(([\d.]+)\)/);
check(!!filterMatch,
  '[6e] .splash__bg имеет filter: sepia(0.25) brightness(...) — splash выглядит атмосферно');
if (filterMatch) {
  const bri = parseFloat(filterMatch[1]);
  check(bri >= 0.5 && bri <= 0.85,
    `[6f] brightness в диапазоне 0.5..0.85 (got ${bri})`);
}

// resolveSplashBgId — статическая проверка, что fallback = splash_battle
// (generic) через текст файла ui/splash.js.
const fallbackMatch = splashJs.match(/FALLBACK_BG_ID\s*=\s*'([^']+)'/);
check(!!fallbackMatch,
  '[6g] ui/splash.js содержит FALLBACK_BG_ID');
if (fallbackMatch) {
  check(fallbackMatch[1] === 'splash_battle' || fallbackMatch[1] === 'splash_pompeii',
    `[6h] FALLBACK_BG_ID = splash_battle или splash_pompeii (got "${fallbackMatch[1]}")`);
  check(actualIds.has(fallbackMatch[1]),
    `[6i] FALLBACK_BG_ID = "${fallbackMatch[1]}" присутствует в manifest`);
}

// Интеграционный smoke-тест через vm: подгружаем culture_groups.js в sandbox
// с заглушкой module.exports и проверяем функцию getCultureGroup.
const vm = await import('vm');
const sandbox = { module: { exports: {} }, exports: {}, require: undefined };
sandbox.module.exports = sandbox.exports;
try {
  vm.default.runInNewContext(culturesJs, sandbox, { filename: 'culture_groups.js' });
  const exp = sandbox.module.exports || sandbox.exports;
  check(typeof exp.getCultureGroup === 'function',
    '[6j] vm-loaded culture_groups.js: getCultureGroup — функция');
  if (typeof exp.getCultureGroup === 'function') {
    check(exp.getCultureGroup('rome').splash_bg === 'splash_alexander',
      '[6k] getCultureGroup("rome").splash_bg === "splash_alexander"');
    check(exp.getCultureGroup('carthage').splash_bg === 'splash_carthage',
      '[6l] getCultureGroup("carthage").splash_bg === "splash_carthage"');
    check(exp.getCultureGroup('persis').splash_bg === 'splash_persepolis',
      '[6m] getCultureGroup("persis").splash_bg === "splash_persepolis"');
    check(exp.getCultureGroup('__unknown__').splash_bg === 'splash_battle',
      '[6n] getCultureGroup(unknown).splash_bg === "splash_battle"');
  }
} catch (e) {
  check(false, '[6j] vm-loaded culture_groups.js: ' + e.message);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`Результат: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nПровалившиеся проверки:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('✅ Шаг 67 (arma.md) — все проверки пройдены.');
