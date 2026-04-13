// Тесты Шага 52 (arma.md) — Визуальная карточка итога хода
// Запуск: node tests/test_arma_stage52.mjs
//
// Чеклист из arma.md Шаг 52:
//   [1] #turn-summary-card присутствует в index.html (.hidden по умолчанию)
//   [2] CSS #turn-summary-card + @keyframes tsc-appear + tsc-countdown
//   [3] ui/turn_summary_card.js экспортирует showTurnSummaryCard / closeTurnSummaryCard / snapshotNationState
//   [4] Карточка заполняет дельты: казна / население / армия
//   [5] Авто-закрытие через 5 сек (setTimeout + clearTimeout)
//   [6] В engine/turn.js снимок ДО обработки + вызов showTurnSummaryCard после _recordTurnSummary
//   [7] index.html подключает ui/turn_summary_card.js

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlSrc = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const tscSrc  = readFileSync(resolve(__dirname, '..', 'ui', 'turn_summary_card.js'), 'utf8');
const turnSrc = readFileSync(resolve(__dirname, '..', 'engine', 'turn.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ═══════════════════════════════════════════════════════════════
section('[1] DOM-узел #turn-summary-card в index.html');
// ═══════════════════════════════════════════════════════════════

check(/id=["']turn-summary-card["']/.test(htmlSrc),
  '[1a] #turn-summary-card присутствует');

check(/id=["']turn-summary-card["'][^>]*class=["'][^"']*\bhidden\b/.test(htmlSrc),
  '[1b] стартовый класс .hidden');

check(/id=["']tsc-turn["']/.test(htmlSrc),       '[1c] #tsc-turn');
check(/id=["']tsc-date["']/.test(htmlSrc),       '[1d] #tsc-date');
check(/id=["']tsc-season["']/.test(htmlSrc),     '[1e] #tsc-season');
check(/id=["']tsc-deltas["']/.test(htmlSrc),     '[1f] #tsc-deltas');
check(/id=["']tsc-alerts["']/.test(htmlSrc),     '[1g] #tsc-alerts');
check(/class=["']tsc-header["']/.test(htmlSrc),  '[1h] .tsc-header');
check(/class=["']tsc-footer["']/.test(htmlSrc),  '[1i] .tsc-footer');
check(/class=["']tsc-progress["']/.test(htmlSrc), '[1j] .tsc-progress');
check(/onclick=["']closeTurnSummaryCard\(\)["']/.test(htmlSrc),
  '[1k] кнопка "Продолжить →" вызывает closeTurnSummaryCard()');
check(/Продолжить\s*→/.test(htmlSrc),
  '[1l] текст кнопки "Продолжить →"');

// ═══════════════════════════════════════════════════════════════
section('[2] CSS карточки в index.html');
// ═══════════════════════════════════════════════════════════════

check(/#turn-summary-card\s*\{[\s\S]*?position\s*:\s*fixed/.test(htmlSrc),
  '[2a] position: fixed');
check(/#turn-summary-card\s*\{[\s\S]*?width\s*:\s*340px/.test(htmlSrc),
  '[2b] width: 340px');
check(/#turn-summary-card\s*\{[\s\S]*?z-index\s*:\s*8500/.test(htmlSrc),
  '[2c] z-index: 8500');
check(/#turn-summary-card\s*\{[\s\S]*?transform\s*:\s*translate\(-50%,\s*-50%\)/.test(htmlSrc),
  '[2d] centered via translate(-50%, -50%)');
check(/#turn-summary-card\s*\{[\s\S]*?border\s*:\s*1px\s+solid\s+var\(--border-gold\)/.test(htmlSrc),
  '[2e] border: 1px solid var(--border-gold)');
check(/#turn-summary-card\s*\{[\s\S]*?backdrop-filter\s*:\s*blur\(12px\)/.test(htmlSrc),
  '[2f] backdrop-filter: blur(12px)');
check(/#turn-summary-card\.hidden\s*\{[\s\S]*?display\s*:\s*none/.test(htmlSrc),
  '[2g] .hidden → display: none');

check(/@keyframes\s+tsc-appear\s*\{/.test(htmlSrc),
  '[2h] @keyframes tsc-appear определён');
const tscAppearMatch = htmlSrc.match(/@keyframes\s+tsc-appear\s*\{([\s\S]*?)\n\s*\}/);
const tscAppearBody = tscAppearMatch ? tscAppearMatch[1] : '';
check(/opacity\s*:\s*0/.test(tscAppearBody),
  '[2i] tsc-appear: opacity 0 → 1');
check(/from[\s\S]*translate\(-50%,\s*calc\(-50%\s*\+\s*20px\)\)/.test(tscAppearBody),
  '[2j] tsc-appear: слайд снизу (calc(-50% + 20px))');

check(/@keyframes\s+tsc-countdown\s*\{/.test(htmlSrc),
  '[2k] @keyframes tsc-countdown определён');
const countdownMatch = htmlSrc.match(/@keyframes\s+tsc-countdown\s*\{([\s\S]*?)\n\s*\}/);
const countdownBody = countdownMatch ? countdownMatch[1] : '';
check(/from\s*\{\s*width\s*:\s*100%/.test(countdownBody),
  '[2l] tsc-countdown: from width 100%');
check(/to\s*\{\s*width\s*:\s*0%/.test(countdownBody),
  '[2m] tsc-countdown: to width 0%');

check(/\.tsc-progress\s*\{[\s\S]*?animation\s*:\s*tsc-countdown\s+5s/.test(htmlSrc),
  '[2n] .tsc-progress анимируется tsc-countdown 5s');

check(/\.tsc-delta-row/.test(htmlSrc),     '[2o] .tsc-delta-row');
check(/\.tsc-delta-pos[\s\S]*?color\s*:\s*#4caf50/.test(htmlSrc),
  '[2p] .tsc-delta-pos → #4caf50');
check(/\.tsc-delta-neg[\s\S]*?color\s*:\s*#f44336/.test(htmlSrc),
  '[2q] .tsc-delta-neg → #f44336');

// ═══════════════════════════════════════════════════════════════
section('[3] ui/turn_summary_card.js — публичный API и логика');
// ═══════════════════════════════════════════════════════════════

check(/window\.showTurnSummaryCard\s*=\s*showTurnSummaryCard/.test(tscSrc),
  '[3a] window.showTurnSummaryCard');
check(/window\.closeTurnSummaryCard\s*=\s*closeTurnSummaryCard/.test(tscSrc),
  '[3b] window.closeTurnSummaryCard');
check(/window\.snapshotNationState\s*=\s*snapshotNationState/.test(tscSrc),
  '[3c] window.snapshotNationState');

check(/function\s+showTurnSummaryCard\s*\(\s*prevState\s*,\s*newState\s*\)/.test(tscSrc),
  '[3d] function showTurnSummaryCard(prevState, newState)');
check(/function\s+closeTurnSummaryCard\s*\(/.test(tscSrc),
  '[3e] function closeTurnSummaryCard');
check(/function\s+snapshotNationState\s*\(\s*nation\s*\)/.test(tscSrc),
  '[3f] function snapshotNationState(nation)');

// дельты из arma.md: казна / население / армия (общие войска)
check(/💰\s*Казна/.test(tscSrc),     '[3g] дельта "💰 Казна"');
check(/👥\s*Население/.test(tscSrc), '[3h] дельта "👥 Население"');
check(/⚔\s*Армия/.test(tscSrc),      '[3i] дельта "⚔ Армия"');

// Поле total_troops в snapshotNationState
check(/total_troops/.test(tscSrc),    '[3j] snapshotNationState → total_troops');
check(/treasury[\s\S]*?population[\s\S]*?total_troops/.test(tscSrc),
  '[3k] snapshot содержит treasury + population + total_troops');

// Вычисление дельт (next - prev)
check(/next\.treasury[\s\S]*?-\s*\([^)]*prev\.treasury/.test(tscSrc),
  '[3l] delta treasury = next - prev');
check(/next\.population[\s\S]*?-\s*\([^)]*prev\.population/.test(tscSrc),
  '[3m] delta population = next - prev');
check(/next\.total_troops[\s\S]*?-\s*\([^)]*prev\.total_troops/.test(tscSrc),
  '[3n] delta total_troops = next - prev');

// Автозакрытие через 5 сек
check(/setTimeout\s*\(\s*closeTurnSummaryCard\s*,\s*(?:AUTO_CLOSE_MS|5000)/.test(tscSrc),
  '[3o] setTimeout(closeTurnSummaryCard, 5000)');
check(/AUTO_CLOSE_MS\s*=\s*5000/.test(tscSrc),
  '[3p] AUTO_CLOSE_MS = 5000');
check(/clearTimeout\s*\(\s*_autoCloseTimer\s*\)/.test(tscSrc),
  '[3q] clearTimeout перед повторным показом / закрытием');

// Показ и скрытие через класс .hidden
check(/classList\.remove\(\s*['"]hidden['"]/.test(tscSrc),
  '[3r] показ карточки: classList.remove("hidden")');
check(/classList\.add\(\s*['"]hidden['"]/.test(tscSrc),
  '[3s] скрытие карточки: classList.add("hidden")');

// Цветные классы для дельт
check(/tsc-delta-pos/.test(tscSrc), '[3t] использует tsc-delta-pos');
check(/tsc-delta-neg/.test(tscSrc), '[3u] использует tsc-delta-neg');

// После закрытия — фокус возвращается на карту
check(/getElementById\(\s*['"]map['"][\s\S]*?\.focus\(/.test(tscSrc),
  '[3v] closeTurnSummaryCard возвращает фокус на #map');

// Прогресс-бар перезапускается при повторном показе (сбрасываем animation)
check(/progressEl\.style\.animation\s*=\s*['"]none['"]/.test(tscSrc),
  '[3w] сброс animation для перезапуска прогресс-бара');

// ═══════════════════════════════════════════════════════════════
section('[4] Интеграция в engine/turn.js');
// ═══════════════════════════════════════════════════════════════

check(/_tscPrevSnapshot/.test(turnSrc),
  '[4a] переменная _tscPrevSnapshot для снимка ДО хода');
check(/snapshotNationState\s*\(\s*_playerNation\s*\)/.test(turnSrc),
  '[4b] processTurn вызывает snapshotNationState(_playerNation)');
check(/showTurnSummaryCard\s*\(\s*_tscPrevSnapshot\s*,\s*_next\s*\)/.test(turnSrc),
  '[4c] showTurnSummaryCard(_tscPrevSnapshot, _next) после _recordTurnSummary');
// Гарантируем, что вызов идёт ПОСЛЕ _recordTurnSummary
const idxRecord = turnSrc.indexOf('_recordTurnSummary()');
const idxShow   = turnSrc.indexOf('showTurnSummaryCard(_tscPrevSnapshot');
check(idxRecord > -1 && idxShow > -1 && idxShow > idxRecord,
  '[4d] showTurnSummaryCard вызывается ПОСЛЕ _recordTurnSummary');

// Снимок ДО — должен быть в начале processTurn (до вызовов экономики)
const idxSnap = turnSrc.indexOf('_tscPrevSnapshot = snapshotNationState');
const idxEcon = turnSrc.indexOf("_setStep('Экономика...')");
check(idxSnap > -1 && idxEcon > -1 && idxSnap < idxEcon,
  '[4e] снимок _tscPrevSnapshot берётся ДО запуска экономики');

// ═══════════════════════════════════════════════════════════════
section('[5] index.html подключает модуль');
// ═══════════════════════════════════════════════════════════════

check(/<script\s+src=["']ui\/turn_summary_card\.js["']\s*>/.test(htmlSrc),
  '[5a] <script src="ui/turn_summary_card.js">');

// ═══════════════════════════════════════════════════════════════
section('[6] Функциональный тест в JSDOM-подобной среде');
// ═══════════════════════════════════════════════════════════════

// Минимальный стаб DOM для исполнения модуля
function makeElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
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
    set innerHTML(v) { this._html = v; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    querySelector(sel) {
      // поддержка #id / .class / тегов — поиск рекурсивный
      return _query(this, sel);
    },
    querySelectorAll() { return []; },
    setAttribute(k, v) { this._attrs[k] = v; },
    offsetWidth: 1,
    focus() {},
  };
  return el;
}

function _query(root, sel) {
  const match = (n) => {
    if (!n) return false;
    if (sel.startsWith('#')) return n.id === sel.slice(1);
    if (sel.startsWith('.')) return n.classList._set.has(sel.slice(1));
    return n.tagName === sel.toUpperCase();
  };
  const stack = [...root.children];
  while (stack.length) {
    const n = stack.shift();
    if (match(n)) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

const doc = {
  _byId: new Map(),
  body: makeElement('body'),
  createElement(tag) { return makeElement(tag); },
  getElementById(id) {
    // сначала явный реестр, иначе поиск в body
    if (this._byId.has(id)) return this._byId.get(id);
    return _query(this.body, '#' + id);
  },
};
// Расширяем appendChild у body, чтобы регистрировать id
const origAppend = doc.body.appendChild.bind(doc.body);
doc.body.appendChild = (c) => { origAppend(c); if (c.id) doc._byId.set(c.id, c); return c; };

// querySelector у root элементов нам нужен для innerHTML-потомков — т.к.
// модуль использует card.querySelector('#tsc-turn') сразу после innerHTML = ...,
// а мы innerHTML не парсим, подложим дочерние узлы вручную через карту.
function wireCard(card) {
  // эмулируем innerHTML как детей
  const ids = ['tsc-turn','tsc-date','tsc-season','tsc-deltas','tsc-alerts','tsc-continue-btn'];
  for (const id of ids) {
    const child = makeElement('div');
    child.id = id;
    card.appendChild(child);
  }
  const progress = makeElement('div');
  progress.classList.add('tsc-progress');
  card.appendChild(progress);
}

// Патчим createElement: возвращаем узел с авто-wireCard при innerHTML-сеттере
const origCreate = doc.createElement.bind(doc);
doc.createElement = (tag) => {
  const el = origCreate(tag);
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = v; if (el.id === 'turn-summary-card' || v.includes('tsc-header')) wireCard(el); },
  });
  return el;
};

// Глобальное окружение
const timers = [];
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; };
globalThis.clearTimeout = (id) => { if (id && timers[id - 1]) timers[id - 1].cleared = true; };
globalThis.GAME_STATE = { turn: 7, date: { year: -301, month: 7 }, player_nation: 'syracuse', nations: {} };
globalThis.MONTH_NAMES = [
  '', 'Гамелион', 'Анфестерион', 'Элафеболион', 'Мунихион',
  'Таргелион', 'Скирофорион', 'Гекатомбеон', 'Метагитнион',
  'Боэдромион', 'Пианопсион', 'Маймактерион', 'Посейдеон',
];
globalThis.getCurrentSeason = () => 1; // Лето

// Импортируем модуль через eval (он использует IIFE + window.*)
try {
  // eslint-disable-next-line no-new-func
  new Function(tscSrc)();
} catch (e) {
  console.log('Ошибка выполнения модуля:', e.message);
}

check(typeof globalThis.showTurnSummaryCard === 'function',
  '[6a] showTurnSummaryCard экспортирован в window');
check(typeof globalThis.closeTurnSummaryCard === 'function',
  '[6b] closeTurnSummaryCard экспортирован в window');
check(typeof globalThis.snapshotNationState === 'function',
  '[6c] snapshotNationState экспортирован в window');

// Снимок нации: делаем фиктивный объект
const nation = {
  economy:    { treasury: 1000 },
  population: { total: 50000, happiness: 55 },
  military:   { infantry: 800, cavalry: 100, ships: 20 },
  government: { legitimacy: 70 },
};
const snap1 = globalThis.snapshotNationState(nation);
check(snap1.treasury === 1000,     '[6d] snapshot.treasury = 1000');
check(snap1.population === 50000,  '[6e] snapshot.population = 50000');
check(snap1.total_troops === 920,  '[6f] snapshot.total_troops = 800 + 100 + 20 = 920');

// Вызов карточки: показывает + создаёт DOM
const prev = { treasury: 1000, population: 50000, total_troops: 920, happiness: 55, legitimacy: 70 };
const next = { treasury: 1200, population: 49950, total_troops: 940, happiness: 58, legitimacy: 72 };
globalThis.showTurnSummaryCard(prev, next);

const card = doc.getElementById('turn-summary-card');
check(card != null, '[6g] showTurnSummaryCard создаёт #turn-summary-card');
check(card && !card.classList.contains('hidden'),
  '[6h] после показа карточка НЕ .hidden');

const turnEl = doc.getElementById('tsc-turn');
check(turnEl && /Ход\s+7/.test(turnEl.textContent),
  '[6i] #tsc-turn отображает "Ход 7"');

const dateEl = doc.getElementById('tsc-date');
check(dateEl && /BC/.test(dateEl.textContent),
  '[6j] #tsc-date содержит "BC" для year<0');

const deltasEl = doc.getElementById('tsc-deltas');
check(deltasEl && /\+200/.test(deltasEl.innerHTML),
  '[6k] казна +200 рендерится с плюсом');
check(deltasEl && /-50/.test(deltasEl.innerHTML),
  '[6l] население -50 рендерится с минусом');
check(deltasEl && /\+20/.test(deltasEl.innerHTML),
  '[6m] армия +20 рендерится с плюсом');
check(deltasEl && /tsc-delta-pos/.test(deltasEl.innerHTML),
  '[6n] использует tsc-delta-pos для положительных');
check(deltasEl && /tsc-delta-neg/.test(deltasEl.innerHTML),
  '[6o] использует tsc-delta-neg для отрицательных');

// Автозакрытие: setTimeout зарегистрирован
const autoCloseTimer = timers.find(t => !t.cleared && t.ms === 5000);
check(autoCloseTimer != null,
  '[6p] setTimeout(..., 5000) для авто-закрытия');

// closeTurnSummaryCard: прячет карточку
globalThis.closeTurnSummaryCard();
check(card && card.classList.contains('hidden'),
  '[6q] closeTurnSummaryCard скрывает карточку');

// Повторный показ перезапускает прогресс-бар и таймер
globalThis.showTurnSummaryCard(prev, next);
check(card && !card.classList.contains('hidden'),
  '[6r] повторный показ возвращает карточку');

const activeTimers = timers.filter(t => !t.cleared && t.ms === 5000);
check(activeTimers.length === 1,
  '[6s] предыдущий таймер очищен при повторном показе (один активный)');

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
console.log('\n✅ Все тесты Шага 52 пройдены');
