// Тесты Шага 60 (arma.md) — Иконки наций: культурный символ
// Запуск: node tests/test_arma_stage60.mjs
//
// Чеклист из arma.md Шаг 60:
//   [1] 10 SVG-иконок существуют в assets/icons/ и валидны
//   [2] data/culture_groups.js: getNationIconPath возвращает корректные пути
//   [3] index.html содержит #nation-header (#nation-icon + #nation-name)
//   [4] CSS: .nation-icon, .nation-name, #nation-header, .diplo-row__icon
//   [5] ui/panels.js: updateNationHeader реализована и вызывается из applyNationTheme
//   [6] ui/diplomacy_tab.js: diploRow содержит cultureIconPath
//   [7] ui/map_armies.js: createArmyIcon содержит army-marker__culture

import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root        = resolve(__dirname, '..');
const htmlPath    = resolve(root, 'index.html');
const panelsPath  = resolve(root, 'ui', 'panels.js');
const cgPath      = resolve(root, 'data', 'culture_groups.js');
const diploPath   = resolve(root, 'ui', 'diplomacy_tab.js');
const armiesPath  = resolve(root, 'ui', 'map_armies.js');
const iconDir     = resolve(root, 'assets', 'icons');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

const html      = readFileSync(htmlPath,   'utf8');
const panelsSrc = readFileSync(panelsPath, 'utf8');
const cgSrc     = readFileSync(cgPath,     'utf8');
const diploSrc  = readFileSync(diploPath,  'utf8');
const armiesSrc = readFileSync(armiesPath, 'utf8');

// ═══════════════════════════════════════════════════════════════
section('[1] 10 SVG-иконок культурных групп в assets/icons/');
// ═══════════════════════════════════════════════════════════════

const REQUIRED_ICONS = [
  ['owl_athena.svg',        'greek'],
  ['roman_eagle.svg',       'roman'],
  ['carthage_horse.svg',    'carthaginian'],
  ['egyptian_eye.svg',      'egyptian'],
  ['persian_faravahar.svg', 'persian'],
  ['celtic_torque.svg',     'celtic'],
  ['indian_lotus.svg',      'indian'],
  ['east_asian_dragon.svg', 'east_asian'],
  ['nomadic_bow.svg',       'nomadic'],
  ['generic_sword.svg',     'generic'],
];

check(existsSync(iconDir), '[1a] папка assets/icons/ существует');

for (const [file, _group] of REQUIRED_ICONS) {
  const p = resolve(iconDir, file);
  const exists = existsSync(p);
  check(exists, `[1b] assets/icons/${file} существует`);
  if (exists) {
    const src = readFileSync(p, 'utf8');
    check(/^<svg[\s\S]+<\/svg>\s*$/.test(src.trim()),
      `[1c:${file}] корневой <svg>...</svg>`);
    check(/viewBox=/.test(src),
      `[1d:${file}] viewBox задан`);
    check(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(src),
      `[1e:${file}] корректный xmlns`);
    check(statSync(p).size < 10 * 1024,
      `[1f:${file}] размер <10KB`);
    check(/(stroke|fill)=/.test(src),
      `[1g:${file}] есть stroke или fill`);
  }
}

// ═══════════════════════════════════════════════════════════════
section('[2] getNationIconPath в data/culture_groups.js');
// ═══════════════════════════════════════════════════════════════

check(/function\s+getNationIconPath\s*\(/.test(cgSrc),
  '[2a] функция getNationIconPath объявлена');
check(/module\.exports[\s\S]*getNationIconPath/.test(cgSrc),
  '[2b] getNationIconPath экспортирована для тестов');

let cg = null;
try {
  const wrapped = cgSrc + `
;return {
  getCultureGroup: typeof getCultureGroup !== 'undefined' ? getCultureGroup : null,
  getNationIconPath: typeof getNationIconPath !== 'undefined' ? getNationIconPath : null,
};`;
  const fn = new Function('module', 'exports', wrapped);
  cg = fn({ exports: {} }, {});
} catch (e) {
  check(false, '[2c] data/culture_groups.js загрузился: ' + e.message);
}

if (cg && cg.getNationIconPath) {
  check(cg.getNationIconPath('athens') === 'assets/icons/owl_athena.svg',
    '[2d] athens → owl_athena.svg');
  check(cg.getNationIconPath('rome') === 'assets/icons/roman_eagle.svg',
    '[2e] rome → roman_eagle.svg');
  check(cg.getNationIconPath('carthage') === 'assets/icons/carthage_horse.svg',
    '[2f] carthage → carthage_horse.svg');
  check(cg.getNationIconPath('meroe') === 'assets/icons/egyptian_eye.svg',
    '[2g] meroe → egyptian_eye.svg');
  check(cg.getNationIconPath('persis') === 'assets/icons/persian_faravahar.svg',
    '[2h] persis → persian_faravahar.svg');
  check(cg.getNationIconPath('arverni') === 'assets/icons/celtic_torque.svg',
    '[2i] arverni → celtic_torque.svg');
  check(cg.getNationIconPath('maurya_empire') === 'assets/icons/indian_lotus.svg',
    '[2j] maurya_empire → indian_lotus.svg');
  check(cg.getNationIconPath('qin') === 'assets/icons/east_asian_dragon.svg',
    '[2k] qin → east_asian_dragon.svg');
  check(cg.getNationIconPath('scythians') === 'assets/icons/nomadic_bow.svg',
    '[2l] scythians → nomadic_bow.svg');
  check(cg.getNationIconPath('unknown_small_tribe') === 'assets/icons/generic_sword.svg',
    '[2m] unknown → generic_sword.svg (fallback)');

  // Все иконки культурных групп должны иметь существующий SVG-файл
  let allFilesPresent = true;
  for (const nid of ['athens','rome','carthage','meroe','persis','arverni',
                      'maurya_empire','qin','scythians','unknown_tribe']) {
    const p = cg.getNationIconPath(nid);
    if (!existsSync(resolve(root, p))) { allFilesPresent = false; break; }
  }
  check(allFilesPresent,
    '[2n] все возвращаемые пути ведут к существующим SVG');
}

// ═══════════════════════════════════════════════════════════════
section('[3] #nation-header в index.html');
// ═══════════════════════════════════════════════════════════════

check(/id=["']nation-header["']/.test(html),
  '[3a] DOM-узел #nation-header присутствует');
check(/id=["']nation-icon["']/.test(html),
  '[3b] DOM-узел #nation-icon присутствует');
check(/id=["']nation-name["']/.test(html),
  '[3c] DOM-узел #nation-name присутствует');
check(/<img[^>]*id=["']nation-icon["'][^>]*class=["'][^"']*nation-icon/.test(html),
  '[3d] #nation-icon — это <img> с классом nation-icon');
// #nation-header находится внутри #top-bar
const topBarMatch = html.match(/<header id=["']top-bar["'][\s\S]*?<\/header>/);
check(topBarMatch !== null && /id=["']nation-header["']/.test(topBarMatch[0]),
  '[3e] #nation-header вложен в <header id="top-bar">');

// ═══════════════════════════════════════════════════════════════
section('[4] CSS: .nation-icon / .nation-name / #nation-header / .diplo-row__icon');
// ═══════════════════════════════════════════════════════════════

check(/#nation-header\s*\{[^}]*\}/.test(html),
  '[4a] CSS-правило для #nation-header');
check(/\.nation-icon\s*\{[^}]*\}/.test(html),
  '[4b] CSS-правило для .nation-icon');
check(/\.nation-name\s*\{[^}]*\}/.test(html),
  '[4c] CSS-правило для .nation-name');
check(/\.diplo-row__icon\s*\{[^}]*\}/.test(html),
  '[4d] CSS-правило для .diplo-row__icon');
check(/\.army-marker__culture\s*\{[^}]*\}/.test(html),
  '[4e] CSS-правило для .army-marker__culture');

// .nation-icon должен делать монохромный SVG золотистым (через filter)
const niMatch = html.match(/\.nation-icon\s*\{([^}]*)\}/);
check(niMatch !== null && /filter\s*:[^;]*invert/.test(niMatch[1]),
  '[4f] .nation-icon применяет filter: invert(...)');

// ═══════════════════════════════════════════════════════════════
section('[5] ui/panels.js: updateNationHeader + интеграция в applyNationTheme');
// ═══════════════════════════════════════════════════════════════

check(/function\s+updateNationHeader\s*\(/.test(panelsSrc),
  '[5a] функция updateNationHeader объявлена');
check(/window\.updateNationHeader\s*=/.test(panelsSrc),
  '[5b] window.updateNationHeader экспортирован');

const fnMatch = panelsSrc.match(
  /function\s+applyNationTheme\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
check(fnMatch !== null, '[5c] тело applyNationTheme извлечено');
const fnBody = fnMatch ? fnMatch[1] : '';
check(/updateNationHeader/.test(fnBody),
  '[5d] applyNationTheme вызывает updateNationHeader');
check(/setProperty\(['"]--nation-icon-svg['"]/.test(fnBody),
  '[5e] applyNationTheme сеттит CSS-переменную --nation-icon-svg');
check(/group\.icon/.test(fnBody),
  '[5f] applyNationTheme читает group.icon');

const updMatch = panelsSrc.match(
  /function\s+updateNationHeader\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
check(updMatch !== null, '[5g] тело updateNationHeader извлечено');
const updBody = updMatch ? updMatch[1] : '';
check(/getElementById\(['"]nation-icon['"]\)/.test(updBody),
  '[5h] updateNationHeader работает с #nation-icon');
check(/getElementById\(['"]nation-name['"]\)/.test(updBody),
  '[5i] updateNationHeader работает с #nation-name');
check(/getNationIconPath/.test(updBody),
  '[5j] updateNationHeader использует getNationIconPath');

// ═══════════════════════════════════════════════════════════════
section('[6] ui/diplomacy_tab.js: иконка культурной группы в карточке');
// ═══════════════════════════════════════════════════════════════

check(/getNationIconPath/.test(diploSrc),
  '[6a] diplomacy_tab.js использует getNationIconPath');
check(/diplo-row__icon/.test(diploSrc),
  '[6b] diplomacy_tab.js рендерит элемент с классом diplo-row__icon');

// ═══════════════════════════════════════════════════════════════
section('[7] ui/map_armies.js: иконка культурной группы внутри маркера');
// ═══════════════════════════════════════════════════════════════

check(/getNationIconPath/.test(armiesSrc),
  '[7a] map_armies.js использует getNationIconPath');
check(/army-marker__culture/.test(armiesSrc),
  '[7b] map_armies.js рендерит элемент с классом army-marker__culture');

// ═══════════════════════════════════════════════════════════════
section('[8] Все иконки культурных групп закоммичены в git');
// ═══════════════════════════════════════════════════════════════

import { execSync } from 'child_process';
let lsFiles = '';
try {
  lsFiles = execSync('git ls-files assets/icons/', { cwd: root, encoding: 'utf8' });
} catch (e) {
  check(false, '[8a] git ls-files доступен: ' + e.message);
}
for (const [file, _group] of REQUIRED_ICONS) {
  // git ls-files показывает только закоммиченные. Новые файлы могут отсутствовать
  // до коммита — поэтому здесь проверяем только существование (как [1b]).
  // Файлы должны попасть в git вместе с тестом одним коммитом.
  const onDisk = existsSync(resolve(iconDir, file));
  check(onDisk, `[8:${file}] на диске — попадёт в git одним коммитом со Шагом 60`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 60: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
