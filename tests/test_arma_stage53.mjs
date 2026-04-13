// Тесты Шага 53 (arma.md) — Режим сравнения регионов
// Запуск: node tests/test_arma_stage53.mjs
//
// Чеклист из arma.md Шаг 53:
//   [1] Кнопка "⚖ Сравнить" в .ri-footer popup региона
//   [2] pinRegionForCompare(regionId) — закрепляет regionId, меняет текст на "⚖ Сравнивается..." (мигает)
//   [3] DOM #compare-panel в index.html (.hidden) с .cp-header, #cp-left, #cp-right, .cp-divider
//   [4] CSS: width 580px, два столбца по 50%, центр экрана
//   [5] ui/region_compare.js экспортирует pinRegionForCompare / closeCompare /
//       renderComparePanel / handleRegionClickForCompare / getPinnedRegionId
//   [6] renderComparePanel — заполняет оба столбца одинаковым набором метрик,
//       подсвечивает лучшее значение .cp-winner, худшее .cp-loser, со стрелками ↑↓
//   [7] Кнопка "Сбросить" / "✕" закрывает панель и сбрасывает pinnedRegionId
//   [8] Перехват клика на второй регион: handleRegionClickForCompare возвращает true
//   [9] index.html подключает ui/region_compare.js

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlSrc   = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const rcSrc     = readFileSync(resolve(__dirname, '..', 'ui', 'region_compare.js'), 'utf8');
const mapSrc    = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ═══════════════════════════════════════════════════════════════
section('[1] Подключение модуля и DOM в index.html');
// ═══════════════════════════════════════════════════════════════

check(/<script\s+src=["']ui\/region_compare\.js["']\s*>/.test(htmlSrc),
  '[1a] index.html подключает ui/region_compare.js');

check(/id=["']compare-panel["']/.test(htmlSrc),
  '[1b] #compare-panel присутствует');

check(/id=["']compare-panel["'][^>]*class=["'][^"']*\bhidden\b/.test(htmlSrc),
  '[1c] #compare-panel стартует .hidden');

check(/id=["']cp-left["']/.test(htmlSrc),    '[1d] #cp-left');
check(/id=["']cp-right["']/.test(htmlSrc),   '[1e] #cp-right');
check(/class=["']cp-header["']/.test(htmlSrc),  '[1f] .cp-header');
check(/class=["']cp-body["']/.test(htmlSrc),    '[1g] .cp-body');
check(/class=["']cp-divider["']/.test(htmlSrc), '[1h] .cp-divider');
check(/class=["']cp-col["']/.test(htmlSrc),     '[1i] .cp-col (минимум один)');
check(/onclick=["']closeCompare\(\)["']/.test(htmlSrc),
  '[1j] кнопка закрытия вызывает closeCompare()');
check(/⚖\s*Сравнение регионов/.test(htmlSrc),
  '[1k] заголовок "⚖ Сравнение регионов"');
check(/Сбросить/.test(htmlSrc),
  '[1l] кнопка "Сбросить"');

// ═══════════════════════════════════════════════════════════════
section('[2] CSS #compare-panel');
// ═══════════════════════════════════════════════════════════════

check(/#compare-panel\s*\{[\s\S]*?position\s*:\s*fixed/.test(htmlSrc),
  '[2a] position: fixed');
check(/#compare-panel\s*\{[\s\S]*?width\s*:\s*580px/.test(htmlSrc),
  '[2b] width: 580px');
check(/#compare-panel\s*\{[\s\S]*?transform\s*:\s*translate\(-50%,\s*-50%\)/.test(htmlSrc),
  '[2c] центр экрана через translate(-50%, -50%)');
check(/#compare-panel\.hidden\s*\{[\s\S]*?display\s*:\s*none/.test(htmlSrc),
  '[2d] .hidden → display: none');
check(/#compare-panel\s+\.cp-body\s*\{[\s\S]*?display\s*:\s*flex/.test(htmlSrc),
  '[2e] .cp-body → display: flex');
check(/#compare-panel\s+\.cp-col\s*\{[\s\S]*?(flex\s*:\s*1|width\s*:\s*50%)/.test(htmlSrc),
  '[2f] .cp-col занимает половину ширины');
check(/#compare-panel\s+\.cp-row\.cp-winner/.test(htmlSrc),
  '[2g] .cp-row.cp-winner подсвечивает лучшее');
check(/cp-winner[\s\S]*?#4caf50/.test(htmlSrc),
  '[2h] cp-winner использует зелёный #4caf50');
check(/@keyframes\s+ri-compare-pulse\s*\{/.test(htmlSrc),
  '[2i] @keyframes ri-compare-pulse (мигание кнопки)');
check(/\.ri-compare-btn\.ri-compare-active[\s\S]*?animation\s*:\s*ri-compare-pulse/.test(htmlSrc),
  '[2j] .ri-compare-active → animation: ri-compare-pulse');

// ═══════════════════════════════════════════════════════════════
section('[3] ui/region_compare.js — публичный API');
// ═══════════════════════════════════════════════════════════════

check(/window\.pinRegionForCompare\s*=\s*pinRegionForCompare/.test(rcSrc),
  '[3a] window.pinRegionForCompare');
check(/window\.closeCompare\s*=\s*closeCompare/.test(rcSrc),
  '[3b] window.closeCompare');
check(/window\.renderComparePanel\s*=\s*renderComparePanel/.test(rcSrc),
  '[3c] window.renderComparePanel');
check(/window\.handleRegionClickForCompare\s*=\s*handleRegionClickForCompare/.test(rcSrc),
  '[3d] window.handleRegionClickForCompare');
check(/window\.getPinnedRegionId\s*=\s*getPinnedRegionId/.test(rcSrc),
  '[3e] window.getPinnedRegionId');

check(/function\s+pinRegionForCompare\s*\(\s*regionId\s*\)/.test(rcSrc),
  '[3f] function pinRegionForCompare(regionId)');
check(/function\s+closeCompare\s*\(/.test(rcSrc),
  '[3g] function closeCompare');
check(/function\s+renderComparePanel\s*\(\s*regionA\s*,\s*regionB\s*\)/.test(rcSrc),
  '[3h] function renderComparePanel(regionA, regionB)');
check(/function\s+handleRegionClickForCompare\s*\(\s*regionId\s*\)/.test(rcSrc),
  '[3i] function handleRegionClickForCompare(regionId)');

// Набор метрик из arma.md: population, garrison, fertility, wealth, buildings_count
check(/['"]population['"]/.test(rcSrc),       '[3j] метрика population');
check(/['"]garrison['"]/.test(rcSrc),         '[3k] метрика garrison');
check(/['"]fertility['"]/.test(rcSrc),        '[3l] метрика fertility');
check(/['"]wealth['"]/.test(rcSrc),           '[3m] метрика wealth');
check(/['"]buildings_count['"]/.test(rcSrc),  '[3n] метрика buildings_count');

// Показ / скрытие через .hidden
check(/classList\.remove\(\s*['"]hidden['"]/.test(rcSrc),
  '[3o] показ: classList.remove("hidden")');
check(/classList\.add\(\s*['"]hidden['"]/.test(rcSrc),
  '[3p] скрытие: classList.add("hidden")');

// cp-winner в рендере
check(/cp-winner/.test(rcSrc), '[3q] использует cp-winner');

// Стрелки ↑↓
check(/['"`]↑['"`]/.test(rcSrc) && /['"`]↓['"`]/.test(rcSrc),
  '[3r] стрелки ↑ и ↓ используются');

// Сброс pinnedRegionId в closeCompare
check(/closeCompare[\s\S]*?_pinnedRegionId\s*=\s*null/.test(rcSrc),
  '[3s] closeCompare сбрасывает _pinnedRegionId = null');

// ═══════════════════════════════════════════════════════════════
section('[4] Интеграция в ui/map.js');
// ═══════════════════════════════════════════════════════════════

check(/ri-compare-btn/.test(mapSrc),
  '[4a] .ri-compare-btn в popup региона');
check(/pinRegionForCompare\(/.test(mapSrc),
  '[4b] кнопка вызывает pinRegionForCompare()');
check(/handleRegionClickForCompare/.test(mapSrc),
  '[4c] onRegionClick перехватывает через handleRegionClickForCompare');
check(/data-region-id=/.test(mapSrc),
  '[4d] кнопка содержит data-region-id');

// Порядок: перехват компаре — ПОСЛЕ handleRegionClickForArmy, ДО showRegionInfo
const idxArmy    = mapSrc.indexOf('handleRegionClickForArmy');
const idxCompare = mapSrc.indexOf('handleRegionClickForCompare');
const idxShow    = mapSrc.indexOf('showRegionInfo(regionId)');
check(idxArmy > -1 && idxCompare > -1 && idxShow > -1 &&
      idxArmy < idxCompare && idxCompare < idxShow,
  '[4e] handleRegionClickForCompare после army-handler и до showRegionInfo');

// ═══════════════════════════════════════════════════════════════
section('[5] Функциональный тест в JSDOM-подобной среде');
// ═══════════════════════════════════════════════════════════════

// Минимальный стаб DOM
function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: '',
    className: '',
    children: [],
    _text: '',
    _html: '',
    _attrs: {},
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); el.className = Array.from(this._set).join(' '); },
      remove(c) { this._set.delete(c); el.className = Array.from(this._set).join(' '); },
      contains(c) { return this._set.has(c); },
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; _parseInner(el, v); },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) {
      if (ev === 'click') { this._onClick = fn; }
    },
    dispatchClick() { if (this._onClick) this._onClick(); },
    querySelector(sel) { return _query(this, sel); },
    querySelectorAll(sel) { return _queryAll(this, sel); },
    getAttribute(k) { return this._attrs[k]; },
    setAttribute(k, v) { this._attrs[k] = v; },
    focus() {},
  };
  return el;
}

function _parseInner(root, html) {
  // Извлекаем элементы по id (#xxx) и создаём узлы, чтобы querySelector работал
  const ids = html.match(/id=["']([^"']+)["']/g) || [];
  for (const match of ids) {
    const id = match.replace(/id=["']|["']/g, '');
    if (_query(root, '#' + id)) continue;
    const child = makeElement('div');
    child.id = id;
    root.appendChild(child);
  }
}

function _query(root, sel) {
  const match = (n) => {
    if (!n) return false;
    if (sel.startsWith('#')) return n.id === sel.slice(1);
    if (sel.startsWith('.')) return n.classList._set.has(sel.slice(1));
    return n.tagName === sel.toUpperCase();
  };
  const stack = [...(root.children || [])];
  while (stack.length) {
    const n = stack.shift();
    if (match(n)) return n;
    if (n && n.children) stack.push(...n.children);
  }
  return null;
}

function _queryAll(root, sel) {
  const out = [];
  const match = (n) => {
    if (!n) return false;
    if (sel.startsWith('.')) return n.classList._set.has(sel.slice(1));
    if (sel.startsWith('#')) return n.id === sel.slice(1);
    return n.tagName === sel.toUpperCase();
  };
  const stack = [...(root.children || [])];
  while (stack.length) {
    const n = stack.shift();
    if (match(n)) out.push(n);
    if (n && n.children) stack.push(...n.children);
  }
  return out;
}

const doc = {
  _byId: new Map(),
  body: makeElement('body'),
  createElement(tag) { return makeElement(tag); },
  getElementById(id) {
    if (this._byId.has(id)) return this._byId.get(id);
    return _query(this.body, '#' + id);
  },
  querySelector(sel)    { return _query(this.body, sel); },
  querySelectorAll(sel) { return _queryAll(this.body, sel); },
};
const origAppend = doc.body.appendChild.bind(doc.body);
doc.body.appendChild = (c) => {
  origAppend(c);
  if (c.id) doc._byId.set(c.id, c);
  return c;
};

// Глобальное окружение
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.setTimeout = (fn, ms) => 1;
globalThis.clearTimeout = () => {};

// Фиктивные данные двух регионов
globalThis.MAP_REGIONS = {
  R1: { name: 'Сиракузы',  nation: 'syracuse' },
  R2: { name: 'Карфаген',  nation: 'carthage' },
};
globalThis.GAME_STATE = {
  player_nation: 'syracuse',
  nations: {
    syracuse: { name: 'Сиракузы',  color: '#8B4513', economy: { tax_rate: 0.12 } },
    carthage: { name: 'Карфаген',  color: '#5D4037', economy: { tax_rate: 0.10 } },
  },
  regions: {
    R1: {
      nation: 'syracuse',
      population: 12000,
      garrison:   800,
      fertility:  0.75,
      buildings:  ['walls','granary','forum'],  // 3 постройки
    },
    R2: {
      nation: 'carthage',
      population: 18000,
      garrison:   500,
      fertility:  0.55,
      buildings:  ['walls','port','market','academy','temple'], // 5 построек
    },
  },
};

// Загружаем модуль
try {
  // eslint-disable-next-line no-new-func
  new Function(rcSrc)();
} catch (e) {
  console.log('Ошибка выполнения модуля:', e.message);
}

check(typeof globalThis.pinRegionForCompare === 'function',
  '[5a] pinRegionForCompare экспортирован');
check(typeof globalThis.closeCompare === 'function',
  '[5b] closeCompare экспортирован');
check(typeof globalThis.renderComparePanel === 'function',
  '[5c] renderComparePanel экспортирован');
check(typeof globalThis.handleRegionClickForCompare === 'function',
  '[5d] handleRegionClickForCompare экспортирован');
check(typeof globalThis.getPinnedRegionId === 'function',
  '[5e] getPinnedRegionId экспортирован');

// Поведение pin: первое нажатие закрепляет
globalThis.pinRegionForCompare('R1');
check(globalThis.getPinnedRegionId() === 'R1',
  '[5f] pinRegionForCompare("R1") → pinnedRegionId = R1');

// Повторное нажатие на тот же — снимает
globalThis.pinRegionForCompare('R1');
check(globalThis.getPinnedRegionId() === null,
  '[5g] повторное pinRegionForCompare("R1") снимает закрепление');

// Закрепляем снова
globalThis.pinRegionForCompare('R1');

// handleRegionClickForCompare на второй регион → true и открывается панель
const handled = globalThis.handleRegionClickForCompare('R2');
check(handled === true,
  '[5h] handleRegionClickForCompare("R2") возвращает true');

const panel = doc.getElementById('compare-panel');
check(panel && !panel.classList.contains('hidden'),
  '[5i] #compare-panel НЕ .hidden после сравнения');

const leftEl = doc.getElementById('cp-left');
const rightEl = doc.getElementById('cp-right');
check(leftEl && leftEl.innerHTML.length > 0,
  '[5j] #cp-left заполнен контентом');
check(rightEl && rightEl.innerHTML.length > 0,
  '[5k] #cp-right заполнен контентом');

// Лучшие значения подсвечены: население у R2 больше → winner right
// Гарнизон у R1 больше → winner left
// Плодородие у R1 больше → winner left
// Постройки у R2 больше → winner right
// Проверяем по innerHTML
check(/cp-winner/.test(leftEl.innerHTML),
  '[5l] левый столбец содержит .cp-winner (гарнизон/плодородие)');
check(/cp-winner/.test(rightEl.innerHTML),
  '[5m] правый столбец содержит .cp-winner (население/постройки)');
check(/cp-loser/.test(leftEl.innerHTML) || /cp-loser/.test(rightEl.innerHTML),
  '[5n] подсветка проигравших .cp-loser');

// Стрелки ↑↓ присутствуют
check(/↑/.test(leftEl.innerHTML) && /↓/.test(leftEl.innerHTML),
  '[5o] стрелки ↑ и ↓ в левом столбце');
check(/↑/.test(rightEl.innerHTML) && /↓/.test(rightEl.innerHTML),
  '[5p] стрелки ↑ и ↓ в правом столбце');

// Формат значений: население в запятых, постройки числом
check(/12[,.\u00A0 ]?000/.test(leftEl.innerHTML),
  '[5q] население 12 000 рендерится в левом столбце');
check(/18[,.\u00A0 ]?000/.test(rightEl.innerHTML),
  '[5r] население 18 000 рендерится в правом столбце');
check(/3/.test(leftEl.innerHTML) && /5/.test(rightEl.innerHTML),
  '[5s] количество построек: 3 слева, 5 справа');

// closeCompare сбрасывает panel.hidden и pinnedRegionId
globalThis.closeCompare();
check(panel.classList.contains('hidden'),
  '[5t] closeCompare скрывает панель');
check(globalThis.getPinnedRegionId() === null,
  '[5u] closeCompare сбрасывает pinnedRegionId');

// Клик на тот же регион, что закреплён → false (не сравнивать)
globalThis.pinRegionForCompare('R1');
const sameClick = globalThis.handleRegionClickForCompare('R1');
check(sameClick === false,
  '[5v] клик на закреплённый регион не запускает сравнение');

// Без закрепления handleRegionClickForCompare возвращает false
globalThis.closeCompare();
const noPin = globalThis.handleRegionClickForCompare('R2');
check(noPin === false,
  '[5w] без pinnedRegionId handleRegionClickForCompare → false');

// renderComparePanel вручную
const okRender = globalThis.renderComparePanel('R1', 'R2');
check(okRender === true,
  '[5x] renderComparePanel возвращает true для валидных регионов');
check(panel && !panel.classList.contains('hidden'),
  '[5y] renderComparePanel показывает панель');

// ═══════════════════════════════════════════════════════════════
section('ИТОГО');
// ═══════════════════════════════════════════════════════════════

console.log(`\nПройдено: ${pass}`);
console.log(`Провалено: ${fail}`);
if (failures.length) {
  console.log('\nПроваленные тесты:');
  for (const f of failures) console.log('  · ' + f);
  process.exit(1);
}
console.log('\n✅ Все тесты Шага 53 пройдены');
