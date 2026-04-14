// Тесты Шага 56 (arma.md) — Фон панелей: культурная текстура через CSS-переменные
// Запуск: node tests/test_arma_stage56.mjs
//
// Чеклист из arma.md Шаг 56:
//   [1] В :root объявлены --panel-texture, --panel-tint, --panel-radius
//   [2] CSS-правила ::before для #left-panel и #right-panel существуют
//       и используют var(--panel-texture), inset:0, opacity~0.07,
//       pointer-events:none, z-index:0
//   [3] Дочерние элементы панелей получают position:relative + z-index:1
//   [4] #left-panel/#right-panel имеют position:relative и background
//       через var(--panel-tint)
//   [5] ui/panels.js определяет applyNationTheme(nationId)
//   [6] applyNationTheme использует getCultureGroup и сеттит
//       --panel-texture и --panel-tint на documentElement
//   [7] ui/panels.js определяет preloadTexture(path) и добавляет
//       <link rel="preload" as="image">
//   [8] initGame().then(...) вызывает applyNationTheme с player_nation
//   [9] applyNationTheme('rome') меняет CSS-переменные на римские
//  [10] Fallback: если файл текстуры не найден, CSS деградирует за счёт
//       background-color: var(--panel-tint) — JS fallback не требуется,
//       проверяем что background-color установлен

import { readFileSync, existsSync } from 'fs';
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
section('[1] CSS-переменные в :root');
// ═══════════════════════════════════════════════════════════════

// Найти блок :root { ... } в index.html
const rootMatch = html.match(/:root\s*\{[^}]*\}/);
check(rootMatch !== null, '[1a] блок :root { ... } найден в index.html');
const rootBlock = rootMatch ? rootMatch[0] : '';
check(/--panel-texture\s*:/.test(rootBlock),
  '[1b] --panel-texture объявлена в :root');
check(/--panel-tint\s*:/.test(rootBlock),
  '[1c] --panel-tint объявлена в :root');
check(/--panel-radius\s*:/.test(rootBlock),
  '[1d] --panel-radius объявлена в :root');
// Значение по умолчанию для --panel-texture — url(...)
check(/--panel-texture\s*:\s*url\(/.test(rootBlock),
  '[1e] --panel-texture имеет значение url(...)');
// Тинт по умолчанию — rgba(...) (полупрозрачный)
check(/--panel-tint\s*:\s*rgba\(/.test(rootBlock),
  '[1f] --panel-tint имеет значение rgba(...)');

// ═══════════════════════════════════════════════════════════════
section('[2] CSS ::before для #left-panel и #right-panel');
// ═══════════════════════════════════════════════════════════════

// Находим правило с селектором, включающим "#left-panel::before"
// или "#right-panel::before". Берём содержимое фигурных скобок сразу
// после селектора.
const beforeRuleRegex =
  /#(?:left|right)-panel(?:\s*,\s*#(?:left|right)-panel)?::before\s*\{([^}]*)\}/g;
const beforeRules = [...html.matchAll(beforeRuleRegex)];
check(beforeRules.length > 0,
  '[2a] найдено хотя бы одно правило #(left|right)-panel::before');

// Объединённый декларационный блок всех ::before правил
const beforeBody = beforeRules.map(m => m[1]).join('\n');
check(/background-image\s*:\s*var\(--panel-texture\)/.test(beforeBody),
  '[2b] ::before использует background-image: var(--panel-texture)');
check(/inset\s*:\s*0/.test(beforeBody),
  '[2c] ::before использует inset: 0');
check(/pointer-events\s*:\s*none/.test(beforeBody),
  '[2d] ::before использует pointer-events: none');
check(/opacity\s*:\s*0?\.0[5-9]/.test(beforeBody) ||
      /opacity\s*:\s*0?\.1\b/.test(beforeBody),
  '[2e] ::before использует тонкую opacity (0.05…0.10)');
check(/z-index\s*:\s*0/.test(beforeBody),
  '[2f] ::before имеет z-index: 0');
check(/background-repeat\s*:\s*repeat/.test(beforeBody),
  '[2g] ::before имеет background-repeat: repeat');

// Проверяем, что оба панельных селектора (left+right) покрыты
const leftBeforeCovered  = /#left-panel[^{]*::before/.test(html);
const rightBeforeCovered = /#right-panel[^{]*::before/.test(html);
check(leftBeforeCovered,  '[2h] правило ::before покрывает #left-panel');
check(rightBeforeCovered, '[2i] правило ::before покрывает #right-panel');

// ═══════════════════════════════════════════════════════════════
section('[3] Дочерние элементы панелей поверх ::before');
// ═══════════════════════════════════════════════════════════════

// Ищем правило вида "#left-panel > *, #right-panel > * { ... }"
const childRuleMatch = html.match(
  /#(?:left|right)-panel\s*>\s*\*\s*(?:,\s*#(?:left|right)-panel\s*>\s*\*)?\s*\{([^}]*)\}/
);
check(childRuleMatch !== null,
  '[3a] найдено правило #(left|right)-panel > * { ... }');
if (childRuleMatch) {
  const body = childRuleMatch[1];
  check(/position\s*:\s*relative/.test(body),
    '[3b] дочерние элементы получают position: relative');
  check(/z-index\s*:\s*1/.test(body),
    '[3c] дочерние элементы получают z-index: 1');
}

// ═══════════════════════════════════════════════════════════════
section('[4] Сами панели позиционированы и тинтованы');
// ═══════════════════════════════════════════════════════════════

// Ищем правило "#left-panel, #right-panel { ... position:relative ... }"
// которое должно появиться ПОСЛЕ исходного (Шаг 56 добавляет поверх).
const panelRuleRegex =
  /#left-panel\s*,\s*#right-panel\s*\{([^}]*)\}/g;
const panelRules = [...html.matchAll(panelRuleRegex)];
check(panelRules.length >= 1,
  '[4a] правило #left-panel, #right-panel { ... } существует');
// Проверяем, что хотя бы одно из правил содержит position:relative
const anyRelative = panelRules.some(m => /position\s*:\s*relative/.test(m[1]));
check(anyRelative,
  '[4b] #left-panel/#right-panel имеют position: relative');
// Любое правило содержит background-color/background: var(--panel-tint)
const anyTint = panelRules.some(m =>
  /background(?:-color)?\s*:\s*var\(--panel-tint\)/.test(m[1])
);
check(anyTint,
  '[4c] #left-panel/#right-panel используют var(--panel-tint) как фон');
const anyRadius = panelRules.some(m =>
  /border-radius\s*:\s*var\(--panel-radius\)/.test(m[1])
);
check(anyRadius,
  '[4d] #left-panel/#right-panel используют var(--panel-radius)');

// ═══════════════════════════════════════════════════════════════
section('[5] ui/panels.js: applyNationTheme — функция');
// ═══════════════════════════════════════════════════════════════

check(/function\s+applyNationTheme\s*\(/.test(panelsSrc),
  '[5a] объявлена function applyNationTheme(...)');
check(/window\.applyNationTheme\s*=\s*applyNationTheme/.test(panelsSrc),
  '[5b] applyNationTheme экспортирован в window');

// ═══════════════════════════════════════════════════════════════
section('[6] applyNationTheme использует getCultureGroup и CSS-переменные');
// ═══════════════════════════════════════════════════════════════

// Берём тело функции applyNationTheme
const fnMatch = panelsSrc.match(
  /function\s+applyNationTheme\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
check(fnMatch !== null, '[6a] тело applyNationTheme извлечено');
const fnBody = fnMatch ? fnMatch[1] : '';
check(/getCultureGroup\s*\(/.test(fnBody),
  '[6b] applyNationTheme вызывает getCultureGroup');
check(/setProperty\(['"]--panel-texture['"]/.test(fnBody),
  '[6c] applyNationTheme сеттит --panel-texture');
check(/setProperty\(['"]--panel-tint['"]/.test(fnBody),
  '[6d] applyNationTheme сеттит --panel-tint');
check(/assets\/textures\//.test(fnBody),
  '[6e] путь к текстуре начинается с assets/textures/');

// ═══════════════════════════════════════════════════════════════
section('[7] preloadTexture — функция и <link rel="preload">');
// ═══════════════════════════════════════════════════════════════

check(/function\s+preloadTexture\s*\(/.test(panelsSrc),
  '[7a] объявлена function preloadTexture(...)');
const preMatch = panelsSrc.match(
  /function\s+preloadTexture\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
const preBody = preMatch ? preMatch[1] : '';
check(/createElement\(['"]link['"]\)/.test(preBody),
  '[7b] preloadTexture создаёт элемент link');
check(/\.rel\s*=\s*['"]preload['"]/.test(preBody),
  '[7c] link.rel = "preload"');
check(/\.as\s*=\s*['"]image['"]/.test(preBody),
  '[7d] link.as = "image"');
check(/appendChild/.test(preBody),
  '[7e] link добавляется в head');

// ═══════════════════════════════════════════════════════════════
section('[8] index.html вызывает applyNationTheme при старте игры');
// ═══════════════════════════════════════════════════════════════

// applyNationTheme должен вызываться в блоке после initGame().then(...)
// с GAME_STATE.player_nation
check(/applyNationTheme\s*\(\s*GAME_STATE\.player_nation\s*\)/.test(html) ||
      /applyNationTheme\s*\(\s*[A-Za-z_$][\w$]*\.player_nation\s*\)/.test(html),
  '[8a] index.html вызывает applyNationTheme(GAME_STATE.player_nation)');

// Более мягко: проверяем, что вызов находится в callback initGame
const initBlock = html.match(/initGame\(\)\.then\([\s\S]*?\}\)\.catch/);
check(initBlock !== null, '[8b] найден initGame().then(...).catch(...)');
if (initBlock) {
  check(/applyNationTheme/.test(initBlock[0]),
    '[8c] applyNationTheme вызывается внутри initGame().then(...)');
}

// ═══════════════════════════════════════════════════════════════
section('[9] Функциональный тест: applyNationTheme меняет переменные');
// ═══════════════════════════════════════════════════════════════

// Подгружаем culture_groups.js в sandbox и эмулируем applyNationTheme
// напрямую — убеждаемся, что для разных наций оно возвращает разные
// панель-тинты и текстуры из data/culture_groups.js.
let cg = null;
try {
  const wrapped = cgSrc + `
;return {
  getCultureGroup: typeof getCultureGroup !== 'undefined' ? getCultureGroup : null,
};`;
  const fn = new Function('module', 'exports', wrapped);
  cg = fn({ exports: {} }, {});
} catch (e) {
  check(false, '[9a] data/culture_groups.js загрузился: ' + e.message);
}

if (cg && cg.getCultureGroup) {
  // Эмулируем applyNationTheme в чистом Node — без DOM.
  const setCalls = [];
  const fakeRoot = {
    style: {
      setProperty(name, value) { setCalls.push([name, value]); },
    },
  };

  function fakeApply(nationId) {
    const group = cg.getCultureGroup(nationId);
    const texturePath = `assets/textures/${group.texture}.jpg`;
    fakeRoot.style.setProperty('--panel-texture', `url('${texturePath}')`);
    fakeRoot.style.setProperty('--panel-tint', group.panel_tint);
    return { group, texturePath };
  }

  const athens = fakeApply('athens');
  check(athens.group.groupId === 'greek',
    '[9a] athens → greek');
  check(athens.texturePath === 'assets/textures/greek_vase.jpg',
    '[9b] athens texture → greek_vase.jpg');

  setCalls.length = 0;
  const rome = fakeApply('rome');
  check(rome.group.groupId === 'roman',
    '[9c] rome → roman');
  check(rome.texturePath === `assets/textures/${rome.group.texture}.jpg`,
    '[9d] rome texture из roman.texture');
  check(setCalls.some(([n, v]) => n === '--panel-tint' && v === rome.group.panel_tint),
    '[9e] --panel-tint обновился на римский');
  check(setCalls.some(([n, v]) => n === '--panel-texture' &&
    v.includes(rome.group.texture)),
    '[9f] --panel-texture обновился на римский');

  // Разные нации — разные тинты (generic должен отличаться от roman)
  setCalls.length = 0;
  const other = fakeApply('rome');
  const unknown = fakeApply('unknown_tribe');
  check(unknown.group.groupId === 'generic',
    '[9g] unknown → generic');
  check(other.group.panel_tint !== '' && typeof other.group.panel_tint === 'string',
    '[9h] у roman panel_tint — непустая строка');
}

// ═══════════════════════════════════════════════════════════════
section('[10] Fallback: если JPG отсутствует, background-color вытягивает');
// ═══════════════════════════════════════════════════════════════

// Проверка в CSS — что сам background-color панели связан с --panel-tint,
// а ::before использует только background-image. Тогда при отсутствии JPG
// браузер просто не нарисует изображение, но тинт останется.
check(anyTint,
  '[10a] background-color панели берётся из var(--panel-tint) — CSS-fallback');
check(/background-image\s*:\s*var\(--panel-texture\)/.test(beforeBody) &&
      !/background-color\s*:/.test(beforeBody),
  '[10b] ::before задаёт только background-image, а не background-color');
// На случай отсутствия JS-fallback — проверим, что applyNationTheme
// не пытается читать файл с диска или валидировать его наличие
check(!/existsSync|fetch\(|XMLHttpRequest/.test(fnBody),
  '[10c] applyNationTheme не валидирует наличие файла (pure CSS-fallback)');

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 56: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
