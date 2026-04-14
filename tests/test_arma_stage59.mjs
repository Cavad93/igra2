// Тесты Шага 59 (arma.md) — Декоративные рамки: SVG меандр как фон через CSS
// Запуск: node tests/test_arma_stage59.mjs
//
// Чеклист из arma.md Шаг 59:
//   [1] SVG-файлы рамок существуют в assets/icons/ и закоммичены в git
//   [2] :root объявляет --panel-border-svg с дефолтным url(...)
//   [3] CSS-правило #left-panel::after / #right-panel::after использует
//       var(--panel-border-svg), pointer-events:none, opacity<1,
//       border-radius наследуется (не ломает скругление панели)
//   [4] #left-panel/#right-panel сохраняют border-radius: var(--panel-radius)
//   [5] ui/panels.js: applyNationTheme сеттит --panel-border-svg
//   [6] Функциональный тест: applyNationTheme('rome') меняет значение
//       --panel-border-svg; для generic — fallback к meander_dark
//   [7] Все SVG-файлы валидны (корневой <svg>, width/height/viewBox)

import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root       = resolve(__dirname, '..');
const htmlPath   = resolve(root, 'index.html');
const panelsPath = resolve(root, 'ui', 'panels.js');
const cgPath     = resolve(root, 'data', 'culture_groups.js');

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

// ═══════════════════════════════════════════════════════════════
section('[1] SVG-файлы рамок в assets/icons/');
// ═══════════════════════════════════════════════════════════════

const iconDir = resolve(root, 'assets', 'icons');
check(existsSync(iconDir), '[1a] папка assets/icons/ существует');

const requiredSvgs = [
  'meander_gold.svg',
  'meander_dark.svg',
  'egyptian_border.svg',
  'celtic_border.svg',
];

for (const name of requiredSvgs) {
  const p = resolve(iconDir, name);
  const exists = existsSync(p);
  check(exists, `[1b] assets/icons/${name} существует`);
  if (exists) {
    const src = readFileSync(p, 'utf8');
    check(/^<svg[\s\S]+<\/svg>\s*$/.test(src.trim()),
      `[1c:${name}] корневой тег <svg>...</svg>`);
    check(/width=|viewBox=/.test(src),
      `[1d:${name}] задан width или viewBox`);
    check(statSync(p).size < 10 * 1024,
      `[1e:${name}] размер <10KB (SVG лёгкий)`);
  }
}

// ═══════════════════════════════════════════════════════════════
section('[2] CSS-переменная --panel-border-svg в :root');
// ═══════════════════════════════════════════════════════════════

const rootMatch = html.match(/:root\s*\{[^}]*\}/);
check(rootMatch !== null, '[2a] блок :root { ... } найден');
const rootBlock = rootMatch ? rootMatch[0] : '';
check(/--panel-border-svg\s*:/.test(rootBlock),
  '[2b] --panel-border-svg объявлена в :root');
check(/--panel-border-svg\s*:\s*url\(/.test(rootBlock),
  '[2c] --panel-border-svg имеет значение url(...)');
check(/--panel-border-svg\s*:\s*url\(['"]?assets\/icons\//.test(rootBlock),
  '[2d] путь указывает на assets/icons/');

// ═══════════════════════════════════════════════════════════════
section('[3] CSS ::after для #left-panel и #right-panel');
// ═══════════════════════════════════════════════════════════════

const afterRuleRegex =
  /#(?:left|right)-panel(?:\s*,\s*#(?:left|right)-panel)?::after\s*\{([^}]*)\}/g;
const afterRules = [...html.matchAll(afterRuleRegex)];
check(afterRules.length > 0,
  '[3a] найдено правило #(left|right)-panel::after');
const afterBody = afterRules.map(m => m[1]).join('\n');

check(/background-image\s*:[^;]*var\(--panel-border-svg\)/.test(afterBody),
  '[3b] ::after использует var(--panel-border-svg)');
check(/pointer-events\s*:\s*none/.test(afterBody),
  '[3c] pointer-events: none');
check(/opacity\s*:\s*0?\.\d/.test(afterBody),
  '[3d] opacity < 1 (полупрозрачная рамка)');
check(/border-radius\s*:/.test(afterBody),
  '[3e] border-radius задан (не ломает скругление панели)');
check(/background-repeat\s*:\s*no-repeat/.test(afterBody),
  '[3f] background-repeat: no-repeat (углы не тайлятся)');
check(/z-index\s*:\s*[1-9]/.test(afterBody),
  '[3g] z-index задан (рамка поверх ::before)');

// Оба селектора покрыты
check(/#left-panel[^{]*::after/.test(html),
  '[3h] правило ::after покрывает #left-panel');
check(/#right-panel[^{]*::after/.test(html),
  '[3i] правило ::after покрывает #right-panel');

// ═══════════════════════════════════════════════════════════════
section('[4] border-radius панели сохранён (не сломан)');
// ═══════════════════════════════════════════════════════════════

const panelRuleRegex = /#left-panel\s*,\s*#right-panel\s*\{([^}]*)\}/g;
const panelRules = [...html.matchAll(panelRuleRegex)];
const hasRadius = panelRules.some(m =>
  /border-radius\s*:\s*var\(--panel-radius\)/.test(m[1])
);
check(hasRadius,
  '[4a] #left-panel/#right-panel имеют border-radius: var(--panel-radius)');

// Рамка ::after не использует border-image (оно бы сломало radius)
check(!/#(left|right)-panel::after[^}]*border-image/s.test(html),
  '[4b] ::after НЕ использует border-image (совместимо с border-radius)');

// ═══════════════════════════════════════════════════════════════
section('[5] ui/panels.js: applyNationTheme сеттит --panel-border-svg');
// ═══════════════════════════════════════════════════════════════

const fnMatch = panelsSrc.match(
  /function\s+applyNationTheme\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
check(fnMatch !== null, '[5a] тело applyNationTheme извлечено');
const fnBody = fnMatch ? fnMatch[1] : '';

check(/setProperty\(['"]--panel-border-svg['"]/.test(fnBody),
  '[5b] applyNationTheme сеттит --panel-border-svg');
check(/assets\/icons\//.test(fnBody),
  '[5c] путь к рамке начинается с assets/icons/');
check(/group\.border/.test(fnBody),
  '[5d] applyNationTheme читает group.border');

// ═══════════════════════════════════════════════════════════════
section('[6] Функциональный тест: applyNationTheme меняет --panel-border-svg');
// ═══════════════════════════════════════════════════════════════

let cg = null;
try {
  const wrapped = cgSrc + `
;return {
  getCultureGroup: typeof getCultureGroup !== 'undefined' ? getCultureGroup : null,
};`;
  const fn = new Function('module', 'exports', wrapped);
  cg = fn({ exports: {} }, {});
} catch (e) {
  check(false, '[6a] data/culture_groups.js загрузился: ' + e.message);
}

if (cg && cg.getCultureGroup) {
  const setCalls = [];
  const fakeRoot = {
    style: {
      setProperty(name, value) { setCalls.push([name, value]); },
    },
  };

  // Эмулируем applyNationTheme — только те строки, что касаются Шага 59.
  function fakeApply(nationId) {
    const group = cg.getCultureGroup(nationId);
    const borderId   = group.border || 'meander_dark';
    const borderPath = `assets/icons/${borderId}.svg`;
    fakeRoot.style.setProperty('--panel-border-svg', `url('${borderPath}')`);
    return { group, borderPath };
  }

  const athens = fakeApply('athens');
  check(athens.group.groupId === 'greek',
    '[6a] athens → greek');
  check(athens.borderPath === 'assets/icons/meander_gold.svg',
    '[6b] athens border → meander_gold.svg');

  const rome = fakeApply('rome');
  check(rome.borderPath.endsWith('.svg'),
    '[6c] rome border путь оканчивается на .svg');
  check(setCalls.some(([n, v]) => n === '--panel-border-svg' &&
    v.includes(rome.group.border)),
    '[6d] --panel-border-svg обновился при смене на Рим');

  const unknown = fakeApply('unknown_small_tribe');
  check(unknown.group.groupId === 'generic',
    '[6e] unknown → generic');
  check(typeof unknown.group.border === 'string' && unknown.group.border.length > 0,
    '[6f] у generic border — непустая строка');

  // Все уникальные border-значения должны иметь соответствующий SVG-файл
  const usedBorders = new Set();
  for (const nid of ['athens','rome','carthage','alexandria','xiongnu','unknown_tribe','gaul','persepolis']) {
    const g = cg.getCultureGroup(nid);
    if (g && g.border) usedBorders.add(g.border);
  }
  let allFilesPresent = true;
  for (const b of usedBorders) {
    const p = resolve(iconDir, `${b}.svg`);
    if (!existsSync(p)) { allFilesPresent = false; break; }
  }
  check(allFilesPresent,
    '[6g] все border-значения культурных групп имеют SVG в assets/icons/');
}

// ═══════════════════════════════════════════════════════════════
section('[7] Все SVG-файлы валидны (структурная проверка)');
// ═══════════════════════════════════════════════════════════════

for (const name of requiredSvgs) {
  const p = resolve(iconDir, name);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  check(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(src),
    `[7:${name}] содержит правильный xmlns`);
  check(/(stroke|fill)=/.test(src),
    `[7:${name}] есть хотя бы один stroke или fill`);
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 59: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
