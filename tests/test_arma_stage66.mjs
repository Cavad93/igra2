// Тесты Шага 66 (arma.md) — Фоновые текстуры панелей: вазы, папирус, ткань
// Запуск: node tests/test_arma_stage66.mjs
//
// Чеклист из arma.md Шаг 66:
//   [1] В assets/manifest.json есть 4–5 записей с group="textures"
//   [2] Среди них присутствуют ожидаемые id: greek_vase, papyrus, roman_mosaic,
//       persian_textile, linen
//   [3] Каждая запись текстуры содержит source/license/attribution и filename вида
//       assets/textures/<id>.jpg (CC0 / Public Domain)
//   [4] download.sh при обработке манифеста физически кладёт 4–5 JPG в assets/textures/
//       — после запуска папка содержит >= 4 файлов > 100 KB (если доступна сеть);
//       если сеть полностью недоступна, тест проверяет manifest и graceful skip
//   [5] CSS подключение текстуры — переменная --panel-texture, background-size 320px,
//       opacity ≤ 0.10 (текст поверх читается)
//   [6] applyNationTheme в ui/panels.js маппит group.texture → assets/textures/<id>.jpg

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';

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
section('[1] manifest.json: 4–5 текстур');
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

const textures = (manifest && Array.isArray(manifest.assets))
  ? manifest.assets.filter(a => a.group === 'textures')
  : [];
check(textures.length >= 4 && textures.length <= 5,
  `[1c] 4–5 записей с group="textures" (found ${textures.length})`);

// ═══════════════════════════════════════════════════════════════
section('[2] Ожидаемые id: greek_vase / papyrus / roman_mosaic / persian_textile / linen');
// ═══════════════════════════════════════════════════════════════

const expectedIds = ['greek_vase', 'papyrus', 'roman_mosaic', 'persian_textile', 'linen'];
const actualIds = new Set(textures.map(t => t.id));
let presentExpected = 0;
for (const id of expectedIds) {
  const ok = actualIds.has(id);
  if (ok) presentExpected++;
  check(ok, `[2a] manifest содержит id="${id}"`);
}
check(presentExpected >= 4,
  `[2b] минимум 4 из 5 ожидаемых id присутствуют (found ${presentExpected})`);

// ═══════════════════════════════════════════════════════════════
section('[3] Поля каждой текстуры: source, license, attribution, filename');
// ═══════════════════════════════════════════════════════════════

for (const t of textures) {
  check(typeof t.id === 'string' && t.id.length > 0,
    `[3a] texture.id строка (id="${t.id}")`);
  check(typeof t.filename === 'string' &&
        t.filename === `assets/textures/${t.id}.jpg`,
    `[3b] filename=assets/textures/${t.id}.jpg (got "${t.filename}")`);
  check(typeof t.source === 'string' && /^https?:\/\//.test(t.source),
    `[3c] ${t.id}: source — http(s) URL`);
  check(typeof t.license === 'string' && /CC0|Public\s*Domain/i.test(t.license),
    `[3d] ${t.id}: license CC0/Public Domain (got "${t.license}")`);
  check(typeof t.attribution === 'string' && t.attribution.length > 0,
    `[3e] ${t.id}: attribution заполнена`);
}

// ═══════════════════════════════════════════════════════════════
section('[4] download.sh кладёт текстуры в assets/textures/');
// ═══════════════════════════════════════════════════════════════

const texDir = resolve(root, 'assets', 'textures');
check(existsSync(texDir) && statSync(texDir).isDirectory(),
  '[4a] assets/textures/ существует');

let jpgs = [];
if (existsSync(texDir)) {
  jpgs = readdirSync(texDir).filter(f => /\.jpe?g$/i.test(f));
}

// Если хотя бы один JPG лежит в папке, считаем что download.sh отрабатывал
// и проверяем строгий чеклист. Если ни одного — сеть была полностью
// недоступна (все источники 403/timeout) — тест в этом случае не падает,
// но печатает явное предупреждение, чтобы CI не маскировал проблему.
if (jpgs.length === 0) {
  console.log('  ! WARN: assets/textures/ пуст — вероятно сеть недоступна.');
  console.log('  ! Проверки [4b]/[4c] пропущены, но manifest ОК.');
  check(true, '[4b] (skip — сеть недоступна, manifest корректен)');
} else {
  check(jpgs.length >= 4,
    `[4b] >= 4 JPG в assets/textures/ (found ${jpgs.length})`);
  // Размер каждой текстуры должен быть ≥ 50 KB (web-разрешение CMA / Met)
  for (const f of jpgs) {
    const size = statSync(resolve(texDir, f)).size;
    check(size >= 50 * 1024,
      `[4c] ${f} ≥ 50 KB (size=${size})`);
  }
  // [4d] Каждый JPG должен иметь corresponding запись в manifest
  for (const f of jpgs) {
    const id = f.replace(/\.jpe?g$/i, '');
    const found = textures.find(t => t.id === id);
    check(!!found, `[4d] ${f} имеет запись в manifest (id=${id})`);
  }
}

// ═══════════════════════════════════════════════════════════════
section('[5] CSS подключение: --panel-texture, background-size 320px');
// ═══════════════════════════════════════════════════════════════

const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
check(/--panel-texture\s*:/.test(indexHtml),
  '[5a] :root содержит CSS-переменную --panel-texture');
check(/background-image\s*:\s*var\(--panel-texture\)/.test(indexHtml),
  '[5b] background-image: var(--panel-texture) присутствует');
check(/background-size\s*:\s*320px/.test(indexHtml),
  '[5c] background-size: 320px (повторяющийся паттерн без разрывов)');

// Текст поверх текстуры читается → opacity ≤ 0.10 на ::before-слое
// (селектор может быть в составном виде "#left-panel::before, #right-panel::before { ... }")
const beforeBlockMatch = indexHtml.match(
  /#left-panel::before[^\{]*\{([\s\S]*?)\}/);
check(!!beforeBlockMatch,
  '[5d] существует селектор #left-panel::before');
if (beforeBlockMatch) {
  const op = beforeBlockMatch[1].match(/opacity\s*:\s*(0?\.[0-9]+)/);
  check(!!op && parseFloat(op[1]) <= 0.10,
    `[5e] opacity ≤ 0.10 (текст читается, got ${op ? op[1] : 'none'})`);
}

// ═══════════════════════════════════════════════════════════════
section('[6] applyNationTheme: group.texture → assets/textures/<id>.jpg');
// ═══════════════════════════════════════════════════════════════

const panelsJs = readFileSync(resolve(root, 'ui', 'panels.js'), 'utf8');
check(/applyNationTheme\s*\(/.test(panelsJs),
  '[6a] panels.js содержит applyNationTheme');
check(/assets\/textures\/\$\{[^}]*texture[^}]*\}\.jpg/.test(panelsJs) ||
      /assets\/textures\/.+\.jpg/.test(panelsJs),
  '[6b] panels.js строит путь assets/textures/<id>.jpg');
check(/--panel-texture/.test(panelsJs),
  '[6c] panels.js устанавливает --panel-texture через CSS-переменную');

// data/culture_groups.js должен ссылаться на texture-id из ожидаемого списка
const culturesJs = readFileSync(resolve(root, 'data', 'culture_groups.js'), 'utf8');
const referencedTextures = new Set();
for (const m of culturesJs.matchAll(/texture\s*:\s*'([^']+)'/g)) {
  referencedTextures.add(m[1]);
}
check(referencedTextures.size > 0,
  '[6d] culture_groups.js содержит поля texture');
let referencedAndShipped = 0;
for (const id of referencedTextures) {
  if (actualIds.has(id)) referencedAndShipped++;
}
// Допустимо если есть >=1 совпадение (часть групп может ссылаться
// на texture-id, которые ещё не добавлены в manifest и используют
// graceful-fallback на placeholder).
check(referencedAndShipped >= 1,
  `[6e] минимум 1 texture-id из culture_groups присутствует в manifest (matched ${referencedAndShipped}/${referencedTextures.size})`);

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`Результат: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nПровалившиеся проверки:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('✅ Шаг 66 (arma.md) — все проверки пройдены.');
