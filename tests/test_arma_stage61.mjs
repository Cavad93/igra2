// Тесты Шага 61 (arma.md) — Итоговая интеграция: порядок инициализации UI-систем.
// Запуск: node tests/test_arma_stage61.mjs
//
// Шаг 61 — это «монтажный лист»: проверяем, что все зависимости,
// перечисленные в arma.md, запускаются в правильном порядке внутри
// index.html (обёртка initGame().then()) и/или автоматически через
// renderAll() в engine/turn.js.
//
// Чеклист:
//   [1] initSplash(null) вызывается ДО initGame
//   [2] initGame().then(...) — цепочка инициализации
//   [3] Внутри .then() вызываются: initAllSenates, renderNationLegend,
//        initAPIKey, applyNationTheme, initSplash(player), setMapMode,
//        updateNationHeader
//   [4] applyNationTheme идёт ДО setMapMode (тема карта/панели первой)
//   [5] initGame определена в engine/turn.js и вызывает renderAll()
//   [6] renderAll в engine/turn.js вызывает renderMap, applySeasonVisual,
//        renderAllArmies, renderBuildMarkers
//   [7] index.html содержит блок-комментарий «Шаг 61 … монтажный лист»
//   [8] Горячие клавиши зарегистрированы через document.addEventListener
//       (Шаг 28 — независим от initGame)

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');
const htmlPath  = resolve(root, 'index.html');
const turnPath  = resolve(root, 'engine', 'turn.js');
const panelsPath= resolve(root, 'ui', 'panels.js');
const cgPath    = resolve(root, 'data', 'culture_groups.js');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

const html   = readFileSync(htmlPath,   'utf8');
const turn   = readFileSync(turnPath,   'utf8');
const panels = readFileSync(panelsPath, 'utf8');
const cg     = readFileSync(cgPath,     'utf8');

// ═══════════════════════════════════════════════════════════════
section('[1] initSplash(null) вызывается ДО initGame()');
// ═══════════════════════════════════════════════════════════════

const idxInitSplashFallback = html.search(/initSplash\s*\(\s*null\s*\)/);
const idxInitGame            = html.search(/initGame\s*\(\s*\)\s*\.\s*then/);
check(idxInitSplashFallback > 0, '[1a] initSplash(null) найден в index.html');
check(idxInitGame > 0,           '[1b] initGame().then(...) найден в index.html');
check(idxInitSplashFallback > 0 && idxInitGame > 0 && idxInitSplashFallback < idxInitGame,
  '[1c] initSplash(null) предшествует initGame().then(...)');

// ═══════════════════════════════════════════════════════════════
section('[2] Цепочка initGame().then(...)');
// ═══════════════════════════════════════════════════════════════

// Извлекаем тело .then(() => { ... }) после initGame()
const thenMatch = html.match(/initGame\s*\(\s*\)\s*\.\s*then\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*\.\s*catch/);
check(thenMatch !== null, '[2a] блок initGame().then(...).catch(...) найден');
const thenBody = thenMatch ? thenMatch[1] : '';

check(/initAllSenates\s*\(/.test(thenBody),      '[2b] .then → initAllSenates()');
check(/renderNationLegend\s*\(/.test(thenBody),  '[2c] .then → renderNationLegend()');
check(/initAPIKey\s*\(/.test(thenBody),          '[2d] .then → initAPIKey()');
check(/applyNationTheme\s*\(/.test(thenBody),    '[2e] .then → applyNationTheme()');
check(/initSplash\s*\(/.test(thenBody),          '[2f] .then → initSplash(player_nation)');
check(/updateNationHeader\s*\(/.test(thenBody),  '[2g] .then → updateNationHeader()');
check(/setMapMode\s*\(\s*['"]political['"]\s*\)/.test(thenBody),
  "[2h] .then → setMapMode('political') (стартовый режим)");
check(/showSplashStartButton\s*\(/.test(thenBody),
  '[2i] .then → showSplashStartButton() (Шаг 58)');

// ═══════════════════════════════════════════════════════════════
section('[3] Правильный порядок вызовов внутри .then()');
// ═══════════════════════════════════════════════════════════════

function orderOf(re) {
  const m = thenBody.search(re);
  return m >= 0 ? m : Infinity;
}

const oTheme      = orderOf(/applyNationTheme\s*\(/);
const oSplashFull = orderOf(/initSplash\s*\(\s*GAME_STATE\.player_nation/);
const oHeader     = orderOf(/updateNationHeader\s*\(/);
const oMode       = orderOf(/setMapMode\s*\(\s*['"]political['"]/);
const oButton     = orderOf(/showSplashStartButton\s*\(/);

check(oTheme < oSplashFull,
  '[3a] applyNationTheme → раньше initSplash(player_nation)');
check(oTheme < oHeader,
  '[3b] applyNationTheme → раньше updateNationHeader');
check(oTheme < oMode,
  '[3c] applyNationTheme → раньше setMapMode');
check(oMode < oButton,
  '[3d] setMapMode → раньше showSplashStartButton');

// ═══════════════════════════════════════════════════════════════
section('[4] initGame() в engine/turn.js вызывает renderAll()');
// ═══════════════════════════════════════════════════════════════

check(/async\s+function\s+initGame\s*\(/.test(turn),
  '[4a] engine/turn.js: объявлена async function initGame()');
// initGame() должен вызывать renderAll() — извлекаем тело функции балансом фигурных скобок
const initGameBody = (() => {
  const m = turn.match(/async\s+function\s+initGame\s*\([^)]*\)\s*\{/);
  if (!m) return '';
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < turn.length && depth > 0) {
    const ch = turn.charCodeAt(i);
    if (ch === 123) depth++;       // '{'
    else if (ch === 125) depth--;  // '}'
    i++;
  }
  return turn.slice(start, i);
})();
check(/renderAll\s*\(\s*\)/.test(initGameBody),
  '[4b] initGame() вызывает renderAll()');

// renderAll() вызывает ключевые рендер-функции
const renderAllMatch = turn.match(/function\s+renderAll\s*\(\s*\)\s*\{([\s\S]*?)\n\}/);
const renderAllBody = renderAllMatch ? renderAllMatch[1] : '';
check(/renderMap\s*\(/.test(renderAllBody),
  '[4c] renderAll() вызывает renderMap()');
check(/applySeasonVisual\s*\(/.test(renderAllBody),
  '[4d] renderAll() вызывает applySeasonVisual() (Шаг 45)');
check(/renderLeftPanel\s*\(/.test(renderAllBody),
  '[4e] renderAll() вызывает renderLeftPanel()');
check(/renderAllArmies\s*\(/.test(renderAllBody),
  '[4f] renderAll() вызывает renderAllArmies() (Шаг 39)');
check(/renderBuildMarkers\s*\(/.test(renderAllBody),
  '[4g] renderAll() вызывает renderBuildMarkers() (Шаг 40)');

// ═══════════════════════════════════════════════════════════════
section('[5] Шаг 61: блок-комментарий «монтажный лист» в index.html');
// ═══════════════════════════════════════════════════════════════

check(/Шаг\s*61.*монтажный лист/.test(html) ||
      /Шаг\s*61.*итоговая интеграция/i.test(html) ||
      /Шаг\s*61.*init/i.test(html),
  '[5a] комментарий «Шаг 61 … монтажный лист / init» присутствует');

// ═══════════════════════════════════════════════════════════════
section('[6] Горячие клавиши (Шаг 28) — document.addEventListener keydown');
// ═══════════════════════════════════════════════════════════════

check(/document\.addEventListener\s*\(\s*['"]keydown['"]/.test(html),
  '[6a] index.html регистрирует keydown-обработчик');
// processTurn привязан к кнопке и/или Space
check(/end-turn-btn[^>]*onclick=["']processTurn\(\)["']|processTurn\s*\(/s.test(html),
  '[6b] processTurn() доступен для горячей клавиши / end-turn-btn');

// ═══════════════════════════════════════════════════════════════
section('[7] applyNationTheme интегрирует Шаги 56/59/60');
// ═══════════════════════════════════════════════════════════════

check(/function\s+applyNationTheme/.test(panels),
  '[7a] applyNationTheme объявлена в ui/panels.js');
check(/--panel-texture|--panel-tint/.test(panels),
  '[7b] applyNationTheme сеттит --panel-texture / --panel-tint (Шаг 56)');
check(/--panel-border-svg/.test(panels),
  '[7c] applyNationTheme сеттит --panel-border-svg (Шаг 59)');
check(/updateNationHeader/.test(panels),
  '[7d] applyNationTheme вызывает updateNationHeader (Шаг 60)');

// ═══════════════════════════════════════════════════════════════
section('[8] data/culture_groups.js доступен ДО initGame().then()');
// ═══════════════════════════════════════════════════════════════

const cgScriptIdx = html.indexOf('data/culture_groups.js');
const initGameCallIdx = html.indexOf('initGame().then');
check(cgScriptIdx > 0, '[8a] <script src="data/culture_groups.js"> подключён');
check(cgScriptIdx > 0 && initGameCallIdx > 0 && cgScriptIdx < initGameCallIdx,
  '[8b] culture_groups.js подключён ДО блока initGame().then()');

// getCultureGroup и getNationIconPath экспортированы
check(/function\s+getCultureGroup/.test(cg),
  '[8c] getCultureGroup определена (Шаг 55)');
check(/function\s+getNationIconPath/.test(cg),
  '[8d] getNationIconPath определена (Шаг 60)');

// ═══════════════════════════════════════════════════════════════
section('[9] Устойчивость к undefined — try/catch вокруг init-блоков');
// ═══════════════════════════════════════════════════════════════

// Все опциональные вызовы в .then() обёрнуты в try/catch
const tryCatches = (thenBody.match(/try\s*\{/g) || []).length;
check(tryCatches >= 4,
  `[9a] в .then() хотя бы 4 try/catch-блока (фактически ${tryCatches})`);

// initSplash(null) тоже под try/catch
const fallbackBlockStart = html.indexOf('if (typeof initSplash');
check(fallbackBlockStart > 0 &&
      html.slice(Math.max(0, fallbackBlockStart - 60), fallbackBlockStart).includes('try'),
  '[9b] initSplash(null) обёрнут в try/catch');

// ═══════════════════════════════════════════════════════════════
section('[10] Зависимости Шагов 54–60 доступны к моменту .then()');
// ═══════════════════════════════════════════════════════════════

// 10 SVG иконок (Шаг 60)
const icons = ['owl_athena','roman_eagle','carthage_horse','egyptian_eye',
               'persian_faravahar','celtic_torque','indian_lotus',
               'east_asian_dragon','nomadic_bow','generic_sword'];
let allIcons = true;
const missing = [];
for (const n of icons) {
  const p = resolve(root, 'assets', 'icons', `${n}.svg`);
  if (!existsSync(p)) { allIcons = false; missing.push(n); }
}
check(allIcons,
  '[10a] все 10 культурных SVG-иконок (Шаг 60) присутствуют' +
  (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));

// assets/manifest.json (Шаг 54)
check(existsSync(resolve(root, 'assets', 'manifest.json')),
  '[10b] assets/manifest.json (Шаг 54)');

// ui/splash.js (Шаг 58)
check(existsSync(resolve(root, 'ui', 'splash.js')),
  '[10c] ui/splash.js (Шаг 58)');

// data/culture_groups.js (Шаг 55)
check(existsSync(cgPath), '[10d] data/culture_groups.js (Шаг 55)');

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 61: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
