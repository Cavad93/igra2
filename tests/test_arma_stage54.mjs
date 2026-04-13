// Тесты Шага 54 (arma.md) — Asset pipeline: структура папок, манифест, скрипт загрузки
// Запуск: node tests/test_arma_stage54.mjs
//
// Чеклист из arma.md Шаг 54:
//   [1] Структура папок assets/portraits/{greek,roman,celtic,persian,egyptian,indian,
//       east_asian,nomadic,iberian,african}, assets/textures, assets/backgrounds,
//       assets/borders, assets/icons
//   [2] assets/manifest.json присутствует и является валидным JSON
//       (`node -e "require('./assets/manifest.json')"`)
//   [3] assets/download.sh существует, исполняемый, использует bash,
//       содержит curl/wget и mkdir-команды, идемпотентен (skip при наличии файла)
//   [4] assets/portraits/placeholder.svg — SVG-fallback аватар
//   [5] .gitignore содержит правила для тяжёлых JPG
//       (assets/portraits/**/*.jpg, assets/textures/*.jpg, assets/backgrounds/*.jpg)
//   [6] В git НЕТ ни одного tracked *.jpg внутри assets/
//   [7] assets/README.md присутствует с упоминанием лицензий CC0/Public Domain

import { readFileSync, existsSync, statSync } from 'fs';
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
section('[1] Структура папок assets/');
// ═══════════════════════════════════════════════════════════════

const portraitGroups = [
  'greek', 'roman', 'celtic', 'persian', 'egyptian',
  'indian', 'east_asian', 'nomadic', 'iberian', 'african'
];
for (const g of portraitGroups) {
  const p = resolve(root, 'assets', 'portraits', g);
  check(existsSync(p) && statSync(p).isDirectory(),
    `[1a] assets/portraits/${g}/ существует`);
}
for (const sub of ['textures', 'backgrounds', 'borders', 'icons']) {
  const p = resolve(root, 'assets', sub);
  check(existsSync(p) && statSync(p).isDirectory(),
    `[1b] assets/${sub}/ существует`);
}

// ═══════════════════════════════════════════════════════════════
section('[2] assets/manifest.json — валидный JSON');
// ═══════════════════════════════════════════════════════════════

const manifestPath = resolve(root, 'assets', 'manifest.json');
check(existsSync(manifestPath), '[2a] assets/manifest.json существует');
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check(true, '[2b] manifest.json парсится как JSON');
} catch (e) {
  check(false, '[2b] manifest.json парсится как JSON: ' + e.message);
}
check(manifest && typeof manifest === 'object', '[2c] manifest — объект');
check(manifest && Array.isArray(manifest.assets) && manifest.assets.length > 0,
  '[2d] manifest.assets — непустой массив');
if (manifest && Array.isArray(manifest.assets)) {
  const first = manifest.assets[0];
  check(first && (first.source || first.source_url),
    '[2e] записи содержат поле source/source_url');
  check(first && first.license,
    '[2f] записи содержат поле license');
}

// ═══════════════════════════════════════════════════════════════
section('[3] assets/download.sh');
// ═══════════════════════════════════════════════════════════════

const dlPath = resolve(root, 'assets', 'download.sh');
check(existsSync(dlPath), '[3a] assets/download.sh существует');
let dlSrc = '';
if (existsSync(dlPath)) {
  dlSrc = readFileSync(dlPath, 'utf8');
  const st = statSync(dlPath);
  check((st.mode & 0o111) !== 0, '[3b] download.sh исполняемый');
}
check(/^#!\/(usr\/)?bin\/(env\s+)?bash/.test(dlSrc),
  '[3c] shebang bash');
check(/\bmkdir\s+-p\s+assets\/portraits/.test(dlSrc),
  '[3d] создаёт папки portraits через mkdir -p');
check(/\b(curl|wget)\b/.test(dlSrc),
  '[3e] использует curl или wget');
check(/metmuseum\.org/.test(dlSrc),
  '[3f] скачивает с metmuseum.org (Фаюмские CC0)');
check(/\[skip\]|already|if\s*\[\s*-s\s/.test(dlSrc),
  '[3g] содержит проверку идемпотентности (-s или skip)');

// ═══════════════════════════════════════════════════════════════
section('[4] placeholder.svg fallback');
// ═══════════════════════════════════════════════════════════════

const plPath = resolve(root, 'assets', 'portraits', 'placeholder.svg');
check(existsSync(plPath), '[4a] assets/portraits/placeholder.svg существует');
if (existsSync(plPath)) {
  const svg = readFileSync(plPath, 'utf8');
  check(/<svg\b/i.test(svg), '[4b] валидный SVG (тег <svg>)');
  check(/viewBox/i.test(svg), '[4c] присутствует viewBox');
}

// ═══════════════════════════════════════════════════════════════
section('[5] .gitignore — правила для JPG');
// ═══════════════════════════════════════════════════════════════

const gi = readFileSync(resolve(root, '.gitignore'), 'utf8');
check(/assets\/portraits\/\*\*\/\*\.jpg/.test(gi),
  '[5a] .gitignore игнорирует assets/portraits/**/*.jpg');
check(/assets\/textures\/\*\.jpg/.test(gi),
  '[5b] .gitignore игнорирует assets/textures/*.jpg');
check(/assets\/backgrounds\/\*\.jpg/.test(gi),
  '[5c] .gitignore игнорирует assets/backgrounds/*.jpg');

// ═══════════════════════════════════════════════════════════════
section('[6] В git НЕТ tracked *.jpg в assets/');
// ═══════════════════════════════════════════════════════════════

try {
  const tracked = execSync('git ls-files assets/', { cwd: root, encoding: 'utf8' });
  const jpgs = tracked.split('\n').filter(l => /\.jpe?g$/i.test(l));
  check(jpgs.length === 0,
    `[6a] git не отслеживает JPG в assets/ (found ${jpgs.length})`);
} catch (e) {
  check(false, '[6a] git ls-files вернул ошибку: ' + e.message);
}

// ═══════════════════════════════════════════════════════════════
section('[7] assets/README.md с лицензиями');
// ═══════════════════════════════════════════════════════════════

const readmePath = resolve(root, 'assets', 'README.md');
check(existsSync(readmePath), '[7a] assets/README.md существует');
if (existsSync(readmePath)) {
  const rd = readFileSync(readmePath, 'utf8');
  check(/CC0|Public\s*Domain/i.test(rd),
    '[7b] README упоминает CC0 или Public Domain');
  check(/manifest\.json/.test(rd),
    '[7c] README ссылается на manifest.json');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`Результат: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nПровалившиеся проверки:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('✅ Шаг 54 (arma.md) — все проверки пройдены.');
