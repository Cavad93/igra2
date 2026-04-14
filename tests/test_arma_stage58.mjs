// Тесты Шага 58 (arma.md) — Фон splash-экрана: историческая фреска
// Запуск: node tests/test_arma_stage58.mjs
//
// Чеклист из arma.md Шаг 58:
//   [1]  Существует ui/splash.js с initSplash(nationId)
//   [2]  initSplash резолвит splash_bg через getCultureGroup (Шаг 55)
//   [3]  initSplash устанавливает CSS-переменную --splash-bg на documentElement
//   [4]  ui/splash.js экспортирует hideSplashWithAnimation (button → splashFade)
//   [5]  index.html подключает ui/splash.js (после culture_groups.js)
//   [6]  HTML #splash-screen имеет класс splash + .splash__bg + .splash__vignette
//   [7]  В разметке есть кнопка #splash-start-btn с классом splash__btn
//   [8]  CSS .splash, .splash__bg, .splash__vignette, .splash__title, .splash__btn
//        определены в index.html
//   [9]  CSS .splash__bg использует background-image: var(--splash-bg) и cover
//  [10]  CSS .splash--hiding + @keyframes splashFade определены
//  [11]  CSS .splash__title использует clamp() (адаптация для мобильных)
//  [12]  В :root объявлена --splash-bg со значением url(...)
//  [13]  index.html вызывает initSplash(...) после initGame().then(...)
//  [14]  Функциональный тест: initSplash('athens') ставит --splash-bg
//        с splash_pompeii (греческая группа)
//  [15]  Функциональный тест: initSplash(null) даёт fallback splash_pompeii
//  [16]  Функциональный тест: hideSplashWithAnimation добавляет класс
//        splash--hiding на #splash-screen
//  [17]  В assets/manifest.json присутствуют записи для splash_pompeii,
//        splash_alexander, splash_battle (Шаг 54)

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root         = resolve(__dirname, '..');
const splashPath   = resolve(root, 'ui', 'splash.js');
const htmlPath     = resolve(root, 'index.html');
const cgPath       = resolve(root, 'data', 'culture_groups.js');
const manifestPath = resolve(root, 'assets', 'manifest.json');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

check(existsSync(splashPath), '[0] ui/splash.js существует');
if (!existsSync(splashPath)) {
  console.log('\nFAIL: ui/splash.js не найден');
  process.exit(1);
}

const splashSrc = readFileSync(splashPath, 'utf8');
const html      = readFileSync(htmlPath,   'utf8');
const cgSrc     = readFileSync(cgPath,     'utf8');

// ═══════════════════════════════════════════════════════════════
section('[1] ui/splash.js — initSplash и API');
// ═══════════════════════════════════════════════════════════════

check(/function\s+initSplash\s*\(/.test(splashSrc),
  '[1a] объявлена function initSplash(...)');
check(/window\.initSplash\s*=\s*initSplash/.test(splashSrc),
  '[1b] initSplash экспортирован в window');
check(/function\s+hideSplashWithAnimation\s*\(/.test(splashSrc),
  '[1c] объявлена function hideSplashWithAnimation(...)');
check(/window\.hideSplashWithAnimation\s*=\s*hideSplashWithAnimation/.test(splashSrc),
  '[1d] hideSplashWithAnimation экспортирован в window');

// ═══════════════════════════════════════════════════════════════
section('[2] initSplash использует getCultureGroup (Шаг 55)');
// ═══════════════════════════════════════════════════════════════

check(/getCultureGroup\s*\(/.test(splashSrc),
  '[2a] splash.js вызывает getCultureGroup');
check(/splash_bg/.test(splashSrc),
  '[2b] splash.js обращается к полю splash_bg группы');

// ═══════════════════════════════════════════════════════════════
section('[3] CSS-переменная --splash-bg устанавливается на documentElement');
// ═══════════════════════════════════════════════════════════════

check(/documentElement\.style\.setProperty\s*\(\s*['"]--splash-bg['"]/.test(splashSrc),
  '[3a] splash.js вызывает setProperty(--splash-bg, ...)');
check(/assets\/backgrounds\//.test(splashSrc),
  '[3b] splash.js строит путь в assets/backgrounds/');

// ═══════════════════════════════════════════════════════════════
section('[4] hideSplashWithAnimation использует splash--hiding');
// ═══════════════════════════════════════════════════════════════

check(/splash--hiding/.test(splashSrc),
  '[4a] splash.js добавляет класс splash--hiding');
check(/animationend/.test(splashSrc),
  '[4b] splash.js слушает animationend');

// ═══════════════════════════════════════════════════════════════
section('[5] index.html подключает ui/splash.js');
// ═══════════════════════════════════════════════════════════════

check(/<script src="ui\/splash\.js"><\/script>/.test(html),
  '[5a] index.html содержит <script src="ui/splash.js">');

const splashIdx = html.indexOf('ui/splash.js');
const cgIdx     = html.indexOf('data/culture_groups.js');
check(cgIdx > 0 && splashIdx > cgIdx,
  '[5b] ui/splash.js подключён после data/culture_groups.js');

// ═══════════════════════════════════════════════════════════════
section('[6] HTML #splash-screen имеет .splash + bg + vignette');
// ═══════════════════════════════════════════════════════════════

check(/<div\s+id="splash-screen"\s+class="splash"/.test(html),
  '[6a] #splash-screen имеет class="splash"');
check(/<div\s+class="splash__bg"/.test(html),
  '[6b] разметка содержит <div class="splash__bg">');
check(/<div\s+class="splash__vignette"/.test(html),
  '[6c] разметка содержит <div class="splash__vignette">');

// ═══════════════════════════════════════════════════════════════
section('[7] Кнопка «Начать игру»');
// ═══════════════════════════════════════════════════════════════

check(/id="splash-start-btn"/.test(html),
  '[7a] разметка содержит кнопку #splash-start-btn');
check(/class="splash__btn"/.test(html),
  '[7b] кнопка имеет class="splash__btn"');
check(/Начать игру/.test(html),
  '[7c] текст кнопки — «Начать игру»');

// ═══════════════════════════════════════════════════════════════
section('[8] CSS-классы splash в index.html');
// ═══════════════════════════════════════════════════════════════

check(/\.splash\s*\{|\.splash,/.test(html) || /\.splash[\s,{]/.test(html),
  '[8a] CSS-правило для .splash объявлено');
check(/\.splash__bg\b/.test(html),
  '[8b] CSS .splash__bg объявлен');
check(/\.splash__vignette\b/.test(html),
  '[8c] CSS .splash__vignette объявлен');
check(/\.splash__title\b/.test(html),
  '[8d] CSS .splash__title объявлен');
check(/\.splash__btn\b/.test(html),
  '[8e] CSS .splash__btn объявлен');
check(/\.splash__content\b/.test(html),
  '[8f] CSS .splash__content объявлен');

// ═══════════════════════════════════════════════════════════════
section('[9] .splash__bg использует --splash-bg и cover');
// ═══════════════════════════════════════════════════════════════

// Извлекаем блок CSS правила .splash__bg { ... }
const bgBlockMatch = html.match(/\.splash__bg\s*\{([^}]*)\}/);
check(bgBlockMatch !== null, '[9a] блок .splash__bg найден');
const bgBlock = bgBlockMatch ? bgBlockMatch[1] : '';
check(/background-image\s*:\s*var\(--splash-bg\)/.test(bgBlock),
  '[9b] .splash__bg использует background-image: var(--splash-bg)');
check(/background-size\s*:\s*cover/.test(bgBlock),
  '[9c] .splash__bg имеет background-size: cover');
check(/position\s*:\s*absolute/.test(bgBlock),
  '[9d] .splash__bg position:absolute');
check(/inset\s*:\s*0/.test(bgBlock),
  '[9e] .splash__bg inset:0');

// ═══════════════════════════════════════════════════════════════
section('[10] .splash--hiding + @keyframes splashFade');
// ═══════════════════════════════════════════════════════════════

check(/\.splash--hiding\s*\{[^}]*animation\s*:\s*splashFade/.test(html),
  '[10a] .splash--hiding запускает анимацию splashFade');
check(/@keyframes\s+splashFade\s*\{[^}]*opacity\s*:\s*0/.test(html),
  '[10b] @keyframes splashFade определён с opacity:0');
// Длительность 0.6s
check(/animation\s*:\s*splashFade\s+0?\.6s/.test(html),
  '[10c] длительность анимации splashFade = 0.6s');

// ═══════════════════════════════════════════════════════════════
section('[11] .splash__title использует clamp() для мобильных');
// ═══════════════════════════════════════════════════════════════

const titleBlockMatch = html.match(/\.splash__title\s*\{([^}]*)\}/);
const titleBlock = titleBlockMatch ? titleBlockMatch[1] : '';
check(/clamp\s*\(/.test(titleBlock),
  '[11a] .splash__title font-size использует clamp()');

// ═══════════════════════════════════════════════════════════════
section('[12] :root объявляет --splash-bg');
// ═══════════════════════════════════════════════════════════════

const rootMatch = html.match(/:root\s*\{[\s\S]*?\}/);
const rootBlock = rootMatch ? rootMatch[0] : '';
check(/--splash-bg\s*:\s*url\(/.test(rootBlock) || /--splash-bg\s*:\s*url\(/.test(html),
  '[12a] --splash-bg объявлен (url(...))');

// ═══════════════════════════════════════════════════════════════
section('[13] index.html вызывает initSplash после initGame');
// ═══════════════════════════════════════════════════════════════

check(/initSplash\s*\(/.test(html),
  '[13a] index.html вызывает initSplash(...)');
// initSplash должен фигурировать в then-блоке initGame
const initGameBlock = html.match(/initGame\(\)\.then\(\(\)\s*=>\s*\{[\s\S]*?\}\)/);
check(initGameBlock !== null, '[13b] блок initGame().then(() => {...}) найден');
if (initGameBlock) {
  check(/initSplash\s*\(/.test(initGameBlock[0]),
    '[13c] initSplash вызывается внутри then(initGame)');
}

// ═══════════════════════════════════════════════════════════════
section('[14-15] Функциональный тест: initSplash резолвит фон');
// ═══════════════════════════════════════════════════════════════

// Загружаем culture_groups.js в sandbox
let cg = null;
try {
  const wrapped = cgSrc + `
;return {
  getCultureGroup: typeof getCultureGroup !== 'undefined' ? getCultureGroup : null,
};`;
  const fn = new Function('module', 'exports', wrapped);
  cg = fn({ exports: {} }, {});
} catch (e) {
  check(false, '[14a] culture_groups.js загрузился: ' + e.message);
}
check(cg && typeof cg.getCultureGroup === 'function',
  '[14a] getCultureGroup доступна для теста');

// Загружаем splash.js в sandbox с эмулированным document
let splashMod = null;
let _props = {};
let _docEl = {
  style: {
    setProperty: (k, v) => { _props[k] = v; },
  },
};
let _splashEl = {
  classList: {
    _set: new Set(),
    add(c) { this._set.add(c); },
    contains(c) { return this._set.has(c); },
    remove(c) { this._set.delete(c); },
  },
  parentNode: null,
  style: {},
  addEventListener() {},
  removeEventListener() {},
};
let _btnEl = {
  _splashBound: false,
  style: {},
  addEventListener() { this._addedListener = true; },
};
const sandboxDocument = {
  documentElement: _docEl,
  getElementById(id) {
    if (id === 'splash-screen') return _splashEl;
    if (id === 'splash-start-btn') return _btnEl;
    return null;
  },
};
try {
  const fn2 = new Function(
    'window', 'document', 'getCultureGroup', 'setTimeout', 'module', 'exports',
    splashSrc + '\n;return module.exports;'
  );
  splashMod = fn2(
    {}, sandboxDocument,
    cg ? cg.getCultureGroup : null,
    () => 0,
    { exports: {} }, {}
  );
} catch (e) {
  check(false, '[14b] splash.js загрузился: ' + e.message);
}
check(splashMod && typeof splashMod.initSplash === 'function',
  '[14b] splash.js экспортирует initSplash');

if (splashMod && splashMod.initSplash) {
  // [14] athens → греческая → splash_pompeii
  _props = {};
  splashMod.initSplash('athens');
  const bgAthens = _props['--splash-bg'] || '';
  check(/splash_pompeii/.test(bgAthens),
    '[14c] initSplash("athens") → --splash-bg содержит splash_pompeii');
  check(/assets\/backgrounds\//.test(bgAthens),
    '[14d] --splash-bg содержит путь assets/backgrounds/');

  // [15] null → группа "generic" → splash_battle (Шаг 67: каждая группа имеет
  //       уникальный splash, generic теперь splash_battle).
  _props = {};
  splashMod.initSplash(null);
  const bgNull = _props['--splash-bg'] || '';
  check(/splash_battle/.test(bgNull),
    '[15a] initSplash(null) → generic → splash_battle (обновлено Шагом 67)');

  // Проверка: римская группа → splash_alexander (обновлено в Шаге 67 — уникальный
  // splash для каждой из 10 культурных групп)
  _props = {};
  splashMod.initSplash('rome');
  const bgRome = _props['--splash-bg'] || '';
  check(/splash_alexander/.test(bgRome),
    '[15b] initSplash("rome") → splash_alexander (обновлено Шагом 67)');

  // Проверка: персидская группа → splash_persepolis (Шаг 67)
  _props = {};
  splashMod.initSplash('persis');
  const bgPersis = _props['--splash-bg'] || '';
  check(/splash_persepolis/.test(bgPersis),
    '[15c] initSplash("persis") → splash_persepolis (обновлено Шагом 67)');
}

// ═══════════════════════════════════════════════════════════════
section('[16] hideSplashWithAnimation добавляет класс splash--hiding');
// ═══════════════════════════════════════════════════════════════

if (splashMod && splashMod.hideSplashWithAnimation) {
  _splashEl.classList._set = new Set();
  splashMod.hideSplashWithAnimation();
  check(_splashEl.classList._set.has('splash--hiding'),
    '[16a] hideSplashWithAnimation добавил splash--hiding на #splash-screen');
} else {
  check(false, '[16a] hideSplashWithAnimation не доступен');
}

// ═══════════════════════════════════════════════════════════════
section('[17] manifest.json содержит splash-фоны');
// ═══════════════════════════════════════════════════════════════

let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  check(false, '[17a] manifest.json парсится: ' + e.message);
}

if (manifest && Array.isArray(manifest.assets)) {
  const ids = manifest.assets.map(a => a.id);
  check(ids.includes('splash_pompeii'),
    '[17a] manifest содержит splash_pompeii');
  check(ids.includes('splash_alexander'),
    '[17b] manifest содержит splash_alexander');
  check(ids.includes('splash_battle'),
    '[17c] manifest содержит splash_battle');
  // Группа должна быть backgrounds
  const bgs = manifest.assets.filter(a => a.group === 'backgrounds');
  check(bgs.length >= 3,
    '[17d] хотя бы 3 ассета группы backgrounds в manifest');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 58: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
