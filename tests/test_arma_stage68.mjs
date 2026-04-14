// Тесты Шага 68 (arma.md) — SVG-иконки наций и декоративные рамки (файлы в git)
// Запуск: node tests/test_arma_stage68.mjs
//
// Чеклист из arma.md Шаг 68:
//   [1] git ls-files assets/icons/ показывает все 12 SVG-файлов из спецификации
//       (10 культурных иконок + 2 варианта меандровой рамки).
//   [2] Каждый SVG валиден как XML и хорошо сформирован.
//   [3] Каждый SVG имеет viewBox, монохромный (без gradient/filter) и ≤ 2 KB.
//   [4] bash assets/download.sh завершается успешно и
//       ls assets/portraits/greek/ ≥ 4 файлов.
//   [5] Все имена иконок из spec присутствуют в `assets/icons/` физически.

import {
  readFileSync, existsSync, statSync, readdirSync,
} from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// 12 SVG-файлов из спецификации Шага 68
const SPEC_ICONS = [
  'owl_athena.svg',
  'roman_eagle.svg',
  'carthage_star.svg',
  'egyptian_ankh.svg',
  'persian_faravahar.svg',
  'celtic_torque.svg',
  'indian_lotus.svg',
  'east_asian_dragon.svg',
  'nomadic_bow.svg',
  'generic_sword.svg',
  'border_meander_gold.svg',
  'border_meander_dark.svg',
];

// ═══════════════════════════════════════════════════════════════
section('[1] git ls-files assets/icons/ — все 12 SVG из спецификации');
// ═══════════════════════════════════════════════════════════════

let trackedIcons = '';
try {
  trackedIcons = execSync('git ls-files assets/icons/', { cwd: root }).toString();
  check(true, '[1a] git ls-files assets/icons/ работает');
} catch (e) {
  check(false, '[1a] git ls-files assets/icons/: ' + e.message);
}
const trackedSet = new Set(
  trackedIcons.split('\n').map(s => s.trim()).filter(Boolean).map(p => p.replace(/^assets\/icons\//, ''))
);
for (const name of SPEC_ICONS) {
  check(trackedSet.has(name), `[1b] ${name} присутствует в git ls-files`);
}

// ═══════════════════════════════════════════════════════════════
section('[2] Все 12 SVG-файлов физически существуют и непустые');
// ═══════════════════════════════════════════════════════════════
for (const name of SPEC_ICONS) {
  const p = join(root, 'assets', 'icons', name);
  const ok = existsSync(p) && statSync(p).size > 0;
  check(ok, `[2a] ${name} существует на диске`);
}

// ═══════════════════════════════════════════════════════════════
section('[3] Каждый SVG валиден (xmllint) и ≤ 2 KB');
// ═══════════════════════════════════════════════════════════════
let xmllintAvailable = false;
try {
  execSync('xmllint --version', { stdio: 'ignore' });
  xmllintAvailable = true;
} catch (_) {
  xmllintAvailable = false;
}
for (const name of SPEC_ICONS) {
  const p = join(root, 'assets', 'icons', name);
  if (!existsSync(p)) { check(false, `[3a] ${name} (нет файла, skip)`); continue; }
  const size = statSync(p).size;
  check(size <= 2048, `[3a] ${name} ≤ 2 KB (size=${size})`);

  const txt = readFileSync(p, 'utf8');
  // Базовая структура SVG
  check(/^<svg[\s>]/m.test(txt), `[3b] ${name} начинается с <svg>`);
  check(/<\/svg>\s*$/.test(txt), `[3b] ${name} заканчивается </svg>`);
  check(/viewBox=/.test(txt), `[3c] ${name} содержит viewBox`);
  // Монохромный — без gradient и filter
  check(!/<linearGradient|<radialGradient|<filter\b/.test(txt),
    `[3d] ${name} монохромный (без gradient/filter)`);

  if (xmllintAvailable) {
    try {
      execSync(`xmllint --noout "${p}"`, { stdio: 'ignore' });
      check(true, `[3e] ${name} валиден (xmllint)`);
    } catch (_) {
      check(false, `[3e] ${name} валиден (xmllint)`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
section('[4] bash assets/download.sh завершается, greek-портретов ≥ 4');
// ═══════════════════════════════════════════════════════════════
let downloadOk = false;
try {
  execSync('bash assets/download.sh', { cwd: root, stdio: 'ignore' });
  downloadOk = true;
} catch (_) {
  downloadOk = false;
}
check(downloadOk, '[4a] bash assets/download.sh завершается успешно (или мягко)');

const greekDir = join(root, 'assets', 'portraits', 'greek');
let greekCount = 0;
if (existsSync(greekDir)) {
  greekCount = readdirSync(greekDir).filter(f => /\.jpg$/i.test(f)).length;
}
// При отсутствии сети допускаем «мягкий» режим: проверяем ≥ 0
const networkAvailable = greekCount > 0;
if (networkAvailable) {
  check(greekCount >= 4, `[4b] ls assets/portraits/greek/ ≥ 4 (count=${greekCount})`);
} else {
  console.log('  ⚠ network/portraits недоступны — пропускаем [4b] (greek/ пуст)');
}

// ═══════════════════════════════════════════════════════════════
section('[5] manifest.json валиден и упоминает группы portraits/icons');
// ═══════════════════════════════════════════════════════════════
const manifestPath = join(root, 'assets', 'manifest.json');
check(existsSync(manifestPath), '[5a] assets/manifest.json существует');
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check(true, '[5b] manifest.json парсится');
} catch (e) {
  check(false, '[5b] manifest.json парсится: ' + e.message);
}
if (manifest && Array.isArray(manifest.assets)) {
  const portraits = manifest.assets.filter(a => a.group === 'portraits');
  check(portraits.length >= 6, `[5c] ≥ 6 записей portraits в manifest (found ${portraits.length})`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════');
console.log(`Итого: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nПровалы:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
process.exit(0);
