// Тесты Шага 57 (arma.md) — CC0-портреты персонажей
// Запуск: node tests/test_arma_stage57.mjs
//
// Чеклист из arma.md Шаг 57:
//   [1] Существует ui/portrait.js с утилитой renderPortrait(char, nationId, sizePx)
//   [2] renderPortrait использует getPortraitForCharacter (Шаг 55)
//   [3] renderPortrait выставляет onerror → placeholder.svg (graceful fallback)
//   [4] renderPortraitHTML возвращает строку с <img> и inline onerror-фоллбэком
//   [5] index.html подключает ui/portrait.js перед ui/panels.js
//   [6] ui/panels.js в renderCharacterCard вызывает renderPortraitHTML
//   [7] ui/panels.js в showCharacterDetail (char-detail) вызывает renderPortraitHTML
//   [8] ui/panels.js в renderCourtSlot/положения-слоте вызывает renderPortraitHTML
//   [9] ui/panels.js в renderAdvisorChip вызывает renderPortraitHTML
//  [10] CSS-классы для портретов определены (char-card__portrait,
//       char-detail__portrait, position-slot__portrait, advisor-chip__portrait)
//  [11] Классы используют object-fit:cover, object-position и border-radius
//  [12] Функциональный тест: renderPortraitHTML детерминирован
//       (один и тот же char.id даёт тот же src)
//  [13] Функциональный тест: разные персонажи могут получать разные src
//  [14] Функциональный тест: renderPortraitHTML безопасно экранирует имя
//       (XSS в char.name не попадает в alt без экранирования)
//  [15] Функциональный тест: fallback src — placeholder.svg — присутствует
//       в inline-onerror атрибуте

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root         = resolve(__dirname, '..');
const portraitPath = resolve(root, 'ui', 'portrait.js');
const panelsPath   = resolve(root, 'ui', 'panels.js');
const htmlPath     = resolve(root, 'index.html');
const cgPath       = resolve(root, 'data', 'culture_groups.js');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

check(existsSync(portraitPath), '[0] ui/portrait.js существует');
if (!existsSync(portraitPath)) {
  console.log('\nFAIL: ui/portrait.js не найден');
  process.exit(1);
}

const portraitSrc = readFileSync(portraitPath, 'utf8');
const panelsSrc   = readFileSync(panelsPath,   'utf8');
const html        = readFileSync(htmlPath,     'utf8');
const cgSrc       = readFileSync(cgPath,       'utf8');

// ═══════════════════════════════════════════════════════════════
section('[1] ui/portrait.js — утилита renderPortrait');
// ═══════════════════════════════════════════════════════════════

check(/function\s+renderPortrait\s*\(/.test(portraitSrc),
  '[1a] объявлена function renderPortrait(...)');
check(/function\s+renderPortraitHTML\s*\(/.test(portraitSrc),
  '[1b] объявлена function renderPortraitHTML(...)');
check(/window\.renderPortrait\s*=\s*renderPortrait/.test(portraitSrc),
  '[1c] renderPortrait экспортирован в window');
check(/window\.renderPortraitHTML\s*=\s*renderPortraitHTML/.test(portraitSrc),
  '[1d] renderPortraitHTML экспортирован в window');

// ═══════════════════════════════════════════════════════════════
section('[2] Используется getPortraitForCharacter (Шаг 55)');
// ═══════════════════════════════════════════════════════════════

check(/getPortraitForCharacter\s*\(/.test(portraitSrc),
  '[2a] portrait.js вызывает getPortraitForCharacter');

// ═══════════════════════════════════════════════════════════════
section('[3] Graceful fallback на placeholder.svg');
// ═══════════════════════════════════════════════════════════════

check(/placeholder\.svg/.test(portraitSrc),
  '[3a] portrait.js содержит путь к placeholder.svg');
check(/onerror/.test(portraitSrc),
  '[3b] portrait.js использует onerror');

// ═══════════════════════════════════════════════════════════════
section('[4] renderPortraitHTML возвращает строку с <img>');
// ═══════════════════════════════════════════════════════════════

const htmlFnMatch = portraitSrc.match(
  /function\s+renderPortraitHTML\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/
);
const htmlFnBody = htmlFnMatch ? htmlFnMatch[1] : '';
check(/<img/.test(htmlFnBody),
  '[4a] renderPortraitHTML возвращает <img>');
check(/onerror=/.test(htmlFnBody),
  '[4b] inline onerror присутствует в HTML');
check(/placeholder\.svg/.test(htmlFnBody) || /FALLBACK/.test(htmlFnBody),
  '[4c] inline onerror падает на placeholder.svg (через FALLBACK константу)');

// ═══════════════════════════════════════════════════════════════
section('[5] index.html подключает ui/portrait.js перед ui/panels.js');
// ═══════════════════════════════════════════════════════════════

check(/<script src="ui\/portrait\.js"><\/script>/.test(html),
  '[5a] index.html содержит <script src="ui/portrait.js">');

const portraitIdx = html.indexOf('ui/portrait.js');
const panelsIdx   = html.indexOf('ui/panels.js');
check(portraitIdx > 0 && panelsIdx > 0 && portraitIdx < panelsIdx,
  '[5b] ui/portrait.js подключён до ui/panels.js');

// portrait.js должен идти ПОСЛЕ data/culture_groups.js
// (т.к. использует getPortraitForCharacter)
const cgIdx = html.indexOf('data/culture_groups.js');
check(cgIdx > 0 && portraitIdx > cgIdx,
  '[5c] ui/portrait.js подключён после data/culture_groups.js');

// ═══════════════════════════════════════════════════════════════
section('[6] renderCharacterCard использует renderPortraitHTML');
// ═══════════════════════════════════════════════════════════════

// Извлекаем тело renderCharacterCard
const cardFnMatch = panelsSrc.match(
  /function\s+renderCharacterCard\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
check(cardFnMatch !== null, '[6a] тело renderCharacterCard извлечено');
const cardBody = cardFnMatch ? cardFnMatch[1] : '';
check(/renderPortraitHTML\s*\(/.test(cardBody),
  '[6b] renderCharacterCard вызывает renderPortraitHTML');
check(/char-card__portrait/.test(cardBody),
  '[6c] renderCharacterCard использует класс char-card__portrait');

// ═══════════════════════════════════════════════════════════════
section('[7] showCharacterDetail использует renderPortraitHTML');
// ═══════════════════════════════════════════════════════════════

const detailFnMatch = panelsSrc.match(
  /function\s+showCharacterDetail\s*\([^)]*\)\s*\{([\s\S]*?)\nfunction/
);
check(detailFnMatch !== null, '[7a] тело showCharacterDetail извлечено');
const detailBody = detailFnMatch ? detailFnMatch[1] : '';
check(/renderPortraitHTML\s*\(/.test(detailBody),
  '[7b] showCharacterDetail вызывает renderPortraitHTML');
check(/char-detail__portrait/.test(detailBody),
  '[7c] showCharacterDetail использует класс char-detail__portrait');
check(/\b96\b/.test(detailBody),
  '[7d] showCharacterDetail запрашивает размер 96px');

// ═══════════════════════════════════════════════════════════════
section('[8] Слот должности использует renderPortraitHTML');
// ═══════════════════════════════════════════════════════════════

// Ищем блок где генерируется slotsHtml
const slotsRegionMatch = panelsSrc.match(
  /const\s+slotsHtml\s*=\s*COURT_POSITIONS[\s\S]*?\.join\('\s*'\s*\)/
);
check(slotsRegionMatch !== null, '[8a] блок slotsHtml найден');
const slotsRegion = slotsRegionMatch ? slotsRegionMatch[0] : '';
check(/renderPortraitHTML\s*\(/.test(slotsRegion),
  '[8b] position-slot рендерится через renderPortraitHTML');
check(/position-slot__portrait/.test(slotsRegion),
  '[8c] position-slot использует класс position-slot__portrait');
check(/\b56\b/.test(slotsRegion),
  '[8d] position-slot запрашивает размер 56px');

// ═══════════════════════════════════════════════════════════════
section('[9] renderAdvisorChip использует renderPortraitHTML');
// ═══════════════════════════════════════════════════════════════

const chipFnMatch = panelsSrc.match(
  /function\s+renderAdvisorChip\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
);
check(chipFnMatch !== null, '[9a] тело renderAdvisorChip извлечено');
const chipBody = chipFnMatch ? chipFnMatch[1] : '';
check(/renderPortraitHTML\s*\(/.test(chipBody),
  '[9b] renderAdvisorChip вызывает renderPortraitHTML');
check(/advisor-chip__portrait/.test(chipBody),
  '[9c] renderAdvisorChip использует класс advisor-chip__portrait');
check(/\b32\b/.test(chipBody),
  '[9d] renderAdvisorChip запрашивает размер 32px');

// ═══════════════════════════════════════════════════════════════
section('[10] CSS-классы портретов определены в index.html');
// ═══════════════════════════════════════════════════════════════

check(/\.char-card__portrait/.test(html),
  '[10a] CSS .char-card__portrait определён');
check(/\.char-detail__portrait/.test(html),
  '[10b] CSS .char-detail__portrait определён');
check(/\.position-slot__portrait/.test(html),
  '[10c] CSS .position-slot__portrait определён');
check(/\.advisor-chip__portrait/.test(html),
  '[10d] CSS .advisor-chip__portrait определён');

// ═══════════════════════════════════════════════════════════════
section('[11] CSS использует object-fit/object-position/border-radius');
// ═══════════════════════════════════════════════════════════════

// Выделяем блок CSS c любым из портретных классов + ~200 символов после
function cssBlock(className) {
  const re = new RegExp('\\.' + className + '\\s*\\{([^}]*)\\}');
  const m = html.match(re);
  return m ? m[1] : '';
}

const cardCss   = cssBlock('char-card__portrait');
const detailCss = cssBlock('char-detail__portrait');
const slotCss   = cssBlock('position-slot__portrait');
const chipCss   = cssBlock('advisor-chip__portrait');

check(/object-fit\s*:\s*cover/.test(cardCss),   '[11a] card CSS object-fit:cover');
check(/object-position/.test(cardCss),          '[11b] card CSS object-position');
check(/border-radius\s*:\s*50%/.test(cardCss),  '[11c] card CSS border-radius:50%');
check(/48px/.test(cardCss),                     '[11d] card CSS размер 48px');

check(/object-fit\s*:\s*cover/.test(detailCss), '[11e] detail CSS object-fit:cover');
check(/96px/.test(detailCss),                   '[11f] detail CSS размер 96px');

check(/object-fit\s*:\s*cover/.test(slotCss),   '[11g] slot CSS object-fit:cover');
check(/56px/.test(slotCss),                     '[11h] slot CSS размер 56px');

check(/object-fit\s*:\s*cover/.test(chipCss),   '[11i] chip CSS object-fit:cover');
check(/32px/.test(chipCss),                     '[11j] chip CSS размер 32px');

// ═══════════════════════════════════════════════════════════════
section('[12] Функциональный тест: renderPortraitHTML детерминирован');
// ═══════════════════════════════════════════════════════════════

// Загружаем culture_groups.js и portrait.js в sandbox.
// portrait.js написан как IIFE с window-экспортом, поэтому оборачиваем
// его в эмулятор window/document.

let cg = null;
try {
  const wrapped = cgSrc + `
;return {
  getCultureGroup: typeof getCultureGroup !== 'undefined' ? getCultureGroup : null,
  getPortraitForCharacter: typeof getPortraitForCharacter !== 'undefined' ? getPortraitForCharacter : null,
};`;
  const fn = new Function('module', 'exports', wrapped);
  cg = fn({ exports: {} }, {});
} catch (e) {
  check(false, '[12a] culture_groups.js загрузился: ' + e.message);
}
check(cg && typeof cg.getPortraitForCharacter === 'function',
  '[12a] getPortraitForCharacter доступна');

// Загружаем portrait.js. IIFE использует только document / window — создаём
// заглушки. renderPortrait требует document.createElement, его мы не
// вызываем в тесте — тестируем только renderPortraitHTML.
let portraitMod = null;
try {
  const sandbox = {
    window: {},
    document: {
      createElement: () => ({
        set onerror(_) {},
        set src(_) {},
        set className(_) {},
        set width(_) {},
        set height(_) {},
        set alt(_) {},
        set loading(_) {},
        set draggable(_) {},
      }),
    },
    getPortraitForCharacter: cg.getPortraitForCharacter,
    module: { exports: {} },
    exports: {},
  };
  const fn2 = new Function(
    'window', 'document', 'getPortraitForCharacter', 'module', 'exports',
    portraitSrc + '\n;return module.exports;'
  );
  portraitMod = fn2(
    sandbox.window, sandbox.document, sandbox.getPortraitForCharacter,
    sandbox.module, sandbox.exports
  );
} catch (e) {
  check(false, '[12b] portrait.js загрузился: ' + e.message);
}

check(portraitMod && typeof portraitMod.renderPortraitHTML === 'function',
  '[12b] portrait.js экспортирует renderPortraitHTML');

if (portraitMod && portraitMod.renderPortraitHTML) {
  const rh = portraitMod.renderPortraitHTML;

  // Детерминированность: один и тот же char.id даёт один src
  const html1 = rh({ id: 'char_001', name: 'Alpha' }, 'athens', 48);
  const html2 = rh({ id: 'char_001', name: 'Alpha' }, 'athens', 48);
  check(html1 === html2, '[12c] один char.id → одинаковый HTML');

  // Разные char.id могут дать разные src (в пуле ≥ 2 файлов — greek pool=4)
  const srcA = rh({ id: 'char_001', name: 'A' }, 'athens', 48);
  const srcB = rh({ id: 'char_888', name: 'B' }, 'athens', 48);
  // Не требуем обязательной разницы (hash % pool может совпасть),
  // но требуем, что метод не падает и возвращает src с assets/portraits/
  check(/assets\/portraits\//.test(srcA) && /assets\/portraits\//.test(srcB),
    '[12d] оба результата содержат путь assets/portraits/');

  // Содержит class="char-portrait ..." и нужный размер
  check(/class="char-portrait/.test(html1),
    '[12e] HTML содержит class="char-portrait ..."');
  check(/width="48"/.test(html1) && /height="48"/.test(html1),
    '[12f] HTML содержит указанный размер');

  // [13] Разные персонажи — разные результаты (XOR с детерминированностью)
  // Пробуем больше персонажей, чтобы гарантировать попадание в другой пул-слот.
  const srcs = new Set();
  for (let i = 0; i < 20; i++) {
    const m = rh({ id: 'char_' + i, name: 'n' + i }, 'athens', 48).match(/src="([^"]+)"/);
    if (m) srcs.add(m[1]);
  }
  check(srcs.size >= 2,
    '[13a] 20 разных char.id дают как минимум 2 разных src (пул ≥ 2)');

  // [14] XSS: имя с <script> должно быть экранировано
  const xssHtml = rh({ id: 'x1', name: '<script>a</script>' }, 'athens', 48);
  check(!/<script>/.test(xssHtml),
    '[14a] renderPortraitHTML экранирует имя (нет сырого <script>)');
  check(/&lt;script&gt;/.test(xssHtml),
    '[14b] alt содержит экранированное &lt;script&gt;');

  // [15] Inline onerror падает на placeholder.svg
  check(/onerror="[^"]*placeholder\.svg/.test(html1),
    '[15a] inline onerror содержит placeholder.svg');
  check(/onerror="this\.onerror=null/.test(html1),
    '[15b] inline onerror обнуляет себя (нет цикла)');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Шаг 57: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
