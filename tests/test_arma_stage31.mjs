// Тесты Шага 31 (arma.md) — Индикатор прогресса хода
// Запуск: node tests/test_arma_stage31.mjs
//
// Чеклист из arma.md Шаг 31:
//   [1] В #top-bar между #resource-bar и #end-turn-btn вставлен
//       <div id="turn-progress" title="Прогресс хода">
//         <div class="tp-dots" id="tp-dots"></div>
//         <span id="tp-label">0/0</span>
//       </div>
//   [2] CSS #turn-progress: display:flex; align-items:center; gap:6px;
//       font-size:11px; color:var(--text-dim)
//   [3] CSS .tp-dots: display:flex; gap:3px
//   [4] CSS .tp-dot: width:8px; height:8px; border-radius:50%;
//       background:rgba(107,79,26,0.3); border:1px solid var(--border-gold);
//       transition: background 0.2s
//   [5] CSS .tp-dot.done: background: var(--border-gold)
//   [6] JS: TURN_ACTIONS — массив из 5 действий (taxes, orders, diplo, build, events)
//   [7] JS: function markTurnAction(id) — помечает действие выполненным
//   [8] JS: function resetTurnProgress() — сбрасывает все действия
//   [9] processTurn() вызывает resetTurnProgress() при нажатии кнопки
//   [10] handleCommand() (ui/input.js) вызывает markTurnAction('orders')
//   [11] Поведение: 5 точек, при mark — заполняется, счётчик 0/5 → 1/5,
//        reset → счётчик и точки сбрасываются.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const turnSrc   = readFileSync(resolve(__dirname, '..', 'engine', 'turn.js'), 'utf8');
const inputSrc  = readFileSync(resolve(__dirname, '..', 'ui', 'input.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('HTML — #turn-progress в #top-bar');
// ─────────────────────────────────────────────────────────────

check(/<div[^>]*id="turn-progress"[^>]*>/.test(indexHtml),
  '[1a] <div id="turn-progress"> присутствует');

check(/<div[^>]*id="turn-progress"[^>]*title="Прогресс хода"/.test(indexHtml),
  '[1b] <div id="turn-progress"> имеет title="Прогресс хода"');

check(/<div[^>]*id="turn-progress"[\s\S]*?<div[^>]*class="tp-dots"[^>]*id="tp-dots"[^>]*>/.test(indexHtml),
  '[1c] внутри #turn-progress есть <div class="tp-dots" id="tp-dots">');

check(/<div[^>]*id="turn-progress"[\s\S]{0,400}?<span[^>]*id="tp-label"[^>]*>0\/0<\/span>/.test(indexHtml),
  '[1d] внутри #turn-progress есть <span id="tp-label">0/0</span>');

// Между #resource-bar и #end-turn-btn
const topBar = indexHtml.match(/<header\s+id="top-bar"[\s\S]*?<\/header>/);
check(!!topBar, '[pre] <header id="top-bar"> найден');
if (topBar) {
  const tb = topBar[0];
  const iRes = tb.indexOf('id="resource-bar"');
  const iTp  = tb.indexOf('id="turn-progress"');
  const iEnd = tb.indexOf('id="end-turn-btn"');
  check(iRes >= 0 && iTp > iRes && iEnd > iTp,
    '[1e] #turn-progress расположен между #resource-bar и #end-turn-btn');
}

// ─────────────────────────────────────────────────────────────
section('CSS — #turn-progress / .tp-dots / .tp-dot / .tp-dot.done');
// ─────────────────────────────────────────────────────────────

const tpCssMatch = indexHtml.match(/#turn-progress\s*\{[^}]+\}/);
check(!!tpCssMatch, '[pre] CSS блок #turn-progress найден');
const tpCss = tpCssMatch ? tpCssMatch[0] : '';
check(/display:\s*flex/.test(tpCss),                          '[2a] #turn-progress display:flex');
check(/align-items:\s*center/.test(tpCss),                    '[2b] #turn-progress align-items:center');
check(/gap:\s*6px/.test(tpCss),                               '[2c] #turn-progress gap:6px');
check(/font-size:\s*11px/.test(tpCss),                        '[2d] #turn-progress font-size:11px');
check(/color:\s*var\(--text-dim\)/.test(tpCss),               '[2e] #turn-progress color:var(--text-dim)');

const dotsCssMatch = indexHtml.match(/#turn-progress\s+\.tp-dots\s*\{[^}]+\}/);
check(!!dotsCssMatch, '[pre] CSS блок .tp-dots найден');
const dotsCss = dotsCssMatch ? dotsCssMatch[0] : '';
check(/display:\s*flex/.test(dotsCss),                        '[3a] .tp-dots display:flex');
check(/gap:\s*3px/.test(dotsCss),                             '[3b] .tp-dots gap:3px');

const dotCssMatch = indexHtml.match(/#turn-progress\s+\.tp-dot\s*\{[^}]+\}/);
check(!!dotCssMatch, '[pre] CSS блок .tp-dot найден');
const dotCss = dotCssMatch ? dotCssMatch[0] : '';
check(/width:\s*8px/.test(dotCss),                            '[4a] .tp-dot width:8px');
check(/height:\s*8px/.test(dotCss),                           '[4b] .tp-dot height:8px');
check(/border-radius:\s*50%/.test(dotCss),                    '[4c] .tp-dot border-radius:50%');
check(/background:\s*rgba\(107\s*,\s*79\s*,\s*26\s*,\s*0\.3\)/.test(dotCss),
  '[4d] .tp-dot background:rgba(107,79,26,0.3)');
check(/border:\s*1px\s+solid\s+var\(--border-gold\)/.test(dotCss),
  '[4e] .tp-dot border:1px solid var(--border-gold)');
check(/transition:\s*background\s+0\.2s/.test(dotCss),
  '[4f] .tp-dot transition: background 0.2s');

const doneCssMatch = indexHtml.match(/#turn-progress\s+\.tp-dot\.done\s*\{[^}]+\}/);
check(!!doneCssMatch, '[pre] CSS блок .tp-dot.done найден');
const doneCss = doneCssMatch ? doneCssMatch[0] : '';
check(/background:\s*var\(--border-gold\)/.test(doneCss),
  '[5a] .tp-dot.done background:var(--border-gold)');

// ─────────────────────────────────────────────────────────────
section('JS — TURN_ACTIONS, markTurnAction, resetTurnProgress');
// ─────────────────────────────────────────────────────────────

check(/(const|let|var)\s+TURN_ACTIONS\s*=\s*\[/.test(indexHtml),
  '[6a] TURN_ACTIONS объявлен как массив');

for (const id of ['taxes', 'orders', 'diplo', 'build', 'events']) {
  check(new RegExp(`id:\\s*['"]${id}['"]`).test(indexHtml),
    `[6b:${id}] TURN_ACTIONS содержит id="${id}"`);
}

check(/function\s+markTurnAction\s*\(\s*id\s*\)/.test(indexHtml),
  '[7a] function markTurnAction(id) объявлена');
check(/function\s+resetTurnProgress\s*\(\s*\)/.test(indexHtml),
  '[8a] function resetTurnProgress() объявлена');
check(/window\.markTurnAction\s*=\s*markTurnAction/.test(indexHtml),
  '[7b] window.markTurnAction экспортирован');
check(/window\.resetTurnProgress\s*=\s*resetTurnProgress/.test(indexHtml),
  '[8b] window.resetTurnProgress экспортирован');

// ─────────────────────────────────────────────────────────────
section('Интеграция — processTurn() → resetTurnProgress(), handleCommand() → markTurnAction("orders")');
// ─────────────────────────────────────────────────────────────

check(/resetTurnProgress\s*\(/.test(turnSrc),
  '[9a] engine/turn.js вызывает resetTurnProgress()');
check(/markTurnAction\s*\(\s*['"]orders['"]\s*\)/.test(inputSrc),
  '[10a] ui/input.js вызывает markTurnAction("orders")');

// ─────────────────────────────────────────────────────────────
section('Поведение — sandbox: dots, counter, mark, reset');
// ─────────────────────────────────────────────────────────────

function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let j = src.indexOf('{', i);
  if (j < 0) return null;
  let depth = 1;
  let k = j + 1;
  while (k < src.length && depth > 0) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    k++;
  }
  return src.slice(i, k);
}

const fnRender = extractFn(indexHtml, 'function renderTurnProgress(');
const fnMark   = extractFn(indexHtml, 'function markTurnAction(');
const fnReset  = extractFn(indexHtml, 'function resetTurnProgress(');

check(!!fnRender && !!fnMark && !!fnReset,
  '[B0] renderTurnProgress / markTurnAction / resetTurnProgress извлечены');

// Извлечь определение TURN_ACTIONS
const actionsMatch = indexHtml.match(/(?:const|let|var)\s+TURN_ACTIONS\s*=\s*(\[[\s\S]*?\])\s*;/);
check(!!actionsMatch, '[B1] TURN_ACTIONS literal извлечён');

if (fnRender && fnMark && fnReset && actionsMatch) {
  // Mock DOM
  function makeEl(tag = 'div') {
    return {
      tagName: tag.toUpperCase(),
      className: '',
      style: {},
      attrs: {},
      children: [],
      _text: '',
      title: '',
      textContent: '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c) { this.children.push(c); return c; },
      set innerHTML(v) { this._text = v; this.children = []; },
      get innerHTML() { return this._text; },
    };
  }

  const dotsEl  = makeEl('div');
  const labelEl = makeEl('span');
  const wrapEl  = makeEl('div');
  const fakeDoc = {
    getElementById(id) {
      if (id === 'tp-dots') return dotsEl;
      if (id === 'tp-label') return labelEl;
      if (id === 'turn-progress') return wrapEl;
      return null;
    },
    createElement(tag) { return makeEl(tag); },
    addEventListener() {},
    readyState: 'complete',
  };

  const factory = new Function(
    'document',
    `
    ${actionsMatch[0]}
    const _turnDone = new Set();
    ${fnRender}
    ${fnMark}
    ${fnReset}
    return { TURN_ACTIONS, renderTurnProgress, markTurnAction, resetTurnProgress, _turnDone };
    `
  );
  const api = factory(fakeDoc);

  check(Array.isArray(api.TURN_ACTIONS) && api.TURN_ACTIONS.length === 5,
    '[B2] TURN_ACTIONS содержит ровно 5 элементов');

  api.renderTurnProgress();
  check(dotsEl.children.length === 5,
    '[11a] после renderTurnProgress() — 5 .tp-dot в DOM');
  check(labelEl.textContent === '0/5',
    '[11b] счётчик показывает 0/5 в начале');
  const allEmpty = dotsEl.children.every(d => !/done/.test(d.className));
  check(allEmpty, '[11c] изначально ни одна точка не имеет класса done');

  api.markTurnAction('orders');
  check(labelEl.textContent === '1/5',
    '[11d] после markTurnAction("orders") счётчик 1/5');
  const ordersDot = dotsEl.children.find(d => d.attrs['data-tp-id'] === 'orders');
  check(ordersDot && /done/.test(ordersDot.className),
    '[11e] точка orders получает класс done');

  // Идемпотентность: повторный вызов не увеличивает счётчик
  api.markTurnAction('orders');
  check(labelEl.textContent === '1/5',
    '[11f] повторный markTurnAction("orders") не увеличивает счётчик');

  // Неизвестный id игнорируется
  api.markTurnAction('unknown');
  check(labelEl.textContent === '1/5',
    '[11g] markTurnAction(неизвестный id) игнорируется');

  // Ещё одно действие
  api.markTurnAction('build');
  check(labelEl.textContent === '2/5',
    '[11h] markTurnAction("build") → счётчик 2/5');

  // Reset
  api.resetTurnProgress();
  check(labelEl.textContent === '0/5',
    '[11i] resetTurnProgress() → счётчик 0/5');
  const noneDone = dotsEl.children.every(d => !/done/.test(d.className));
  check(noneDone, '[11j] resetTurnProgress() → все точки сброшены');

  // Тултип контейнера
  check(typeof wrapEl.title === 'string' && wrapEl.title.length > 0,
    '[11k] tooltip на #turn-progress непустой после render');
}

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
