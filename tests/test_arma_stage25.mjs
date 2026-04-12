// Тесты Шага 25 (arma.md) — Строка ввода команды — всегда видна
// Запуск: node tests/test_arma_stage25.mjs
//
// Чеклист из arma.md Шаг 25:
//   [1] #bottom-area: display:flex; flex-direction:row; height:32px; flex-shrink:0
//   [2] В #bottom-area элементы: [#event-log flex:1] | [#input-row width:420px] | [#orders-mini width:160px]
//   [3] #input-row всегда виден (прямой ребёнок #bottom-area, не скрыт по умолчанию)
//   [4] #command-input: flex:1; height:30px; background:var(--bg-section); border 1px gold;
//                       color text-light; padding:0 10px; font-family inherit; font-size:12px
//   [5] #send-btn: height:30px; padding:0 14px; white-space:nowrap
//   [6] #orders-panel свёрнут в #orders-mini-btn → "📋 N приказов", клик разворачивает ВВЕРХ
//   [7] placeholder поля укорочен: "Ваш приказ... (напр. «набрать 500 пехотинцев»)"
//   [8] window.toggleOrdersMini и window.updateOrdersMiniCount экспортированы

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const govSrc    = readFileSync(resolve(__dirname, '..', 'ui', 'government_tab.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ───────────────────────────────────────────────────────
section('CSS — #bottom-area row 32px');
// ───────────────────────────────────────────────────────

// [1] #bottom-area
const bottomArea = indexHtml.match(/#bottom-area\s*\{[^}]+\}/);
check(!!bottomArea, '[pre] CSS блок #bottom-area найден');
const ba = bottomArea ? bottomArea[0] : '';
check(/display:\s*flex/.test(ba),                  '[1a] #bottom-area display:flex');
check(/flex-direction:\s*row/.test(ba),            '[1b] #bottom-area flex-direction:row');
check(/height:\s*32px/.test(ba),                   '[1c] #bottom-area height:32px');
check(/flex-shrink:\s*0/.test(ba),                 '[1d] #bottom-area flex-shrink:0');

// ───────────────────────────────────────────────────────
section('CSS — #input-row / #command-input / #send-btn');
// ───────────────────────────────────────────────────────

// [4] #command-input
const ci = indexHtml.match(/#command-input\s*\{[^}]+\}/);
check(!!ci, '[pre] CSS блок #command-input найден');
const cs = ci ? ci[0] : '';
check(/flex:\s*1/.test(cs),                        '[4a] #command-input flex:1');
check(/height:\s*30px/.test(cs),                   '[4b] #command-input height:30px');
check(/background:\s*var\(--bg-section\)/.test(cs),'[4c] #command-input background:var(--bg-section)');
check(/border:\s*1px\s+solid\s+var\(--border-gold\)/.test(cs),
                                                   '[4d] #command-input border:1px solid var(--border-gold)');
check(/color:\s*var\(--text-light\)/.test(cs),     '[4e] #command-input color:var(--text-light)');
check(/padding:\s*0\s+10px/.test(cs),              '[4f] #command-input padding:0 10px');
check(/font-family:\s*inherit/.test(cs),           '[4g] #command-input font-family:inherit');
check(/font-size:\s*12px/.test(cs),                '[4h] #command-input font-size:12px');

// [5] #send-btn
const sb = indexHtml.match(/#send-btn\s*\{[^}]+\}/);
check(!!sb, '[pre] CSS блок #send-btn найден');
const ss = sb ? sb[0] : '';
check(/height:\s*30px/.test(ss),                   '[5a] #send-btn height:30px');
check(/padding:\s*0\s+14px/.test(ss),              '[5b] #send-btn padding:0 14px');
check(/white-space:\s*nowrap/.test(ss),            '[5c] #send-btn white-space:nowrap');

// [2] #input-row width 420px (главный блок, не @media-override)
const irBlocks = [...indexHtml.matchAll(/#input-row\s*\{[^}]+\}/g)].map(m => m[0]);
check(irBlocks.length > 0, '[pre] CSS блок #input-row найден');
check(irBlocks.some(b => /width:\s*420px/.test(b)),
                                                   '[2a] #input-row width:420px');

// #orders-mini width 160px (главный блок, не @media и не #orders-mini-btn)
const omBlocks = [...indexHtml.matchAll(/#orders-mini\s*\{[^}]+\}/g)].map(m => m[0]);
check(omBlocks.length > 0, '[pre] CSS блок #orders-mini найден');
check(omBlocks.some(b => /width:\s*160px/.test(b)),
                                                   '[2b] #orders-mini width:160px');

// ───────────────────────────────────────────────────────
section('HTML — структура #bottom-area: лог | input-row | orders-mini');
// ───────────────────────────────────────────────────────

const baMatch = indexHtml.match(/<footer\s+id="bottom-area">[\s\S]*?<\/footer>/);
check(!!baMatch, '[pre] <footer id="bottom-area"> найден');
const baHtml = baMatch ? baMatch[0] : '';

// #input-row — прямой ребёнок (с input-ом и кнопкой)
check(/<div\s+id="input-row">[\s\S]*?<input[\s\S]*?id="command-input"[\s\S]*?<button\s+id="send-btn"/.test(baHtml),
  '[3a] #input-row содержит #command-input и #send-btn (всегда виден)');

// Порядок элементов: event-log → input-row → orders-mini
const idxLog    = baHtml.indexOf('id="event-log"');
const idxInput  = baHtml.indexOf('id="input-row"');
const idxMini   = baHtml.indexOf('id="orders-mini"');
check(idxLog >= 0 && idxInput > idxLog && idxMini > idxInput,
  '[2c] Порядок элементов в bottom-area: event-log → input-row → orders-mini');

// #orders-mini-btn = "📋 <span id="orders-mini-count">N</span> приказов"
check(/<button\s+id="orders-mini-btn"[^>]*onclick="toggleOrdersMini\(\)"/.test(baHtml),
  '[6a] #orders-mini-btn с onclick="toggleOrdersMini()"');
check(/📋[\s\S]*?<span\s+id="orders-mini-count">[\s\S]*?<\/span>[\s\S]*?приказов/.test(baHtml),
  '[6b] #orders-mini-btn содержит "📋 <span id=orders-mini-count>…</span> приказов"');

// #orders-panel в HTML присутствует с класcом "closed" по умолчанию
check(/<div\s+id="orders-panel"\s+class="closed">/.test(baHtml),
  '[6c] #orders-panel имеет класс "closed" по умолчанию (popup скрыт)');

// CSS popup для orders-panel
const opCss = indexHtml.match(/#orders-panel\s*\{[\s\S]*?\}/);
const opStr = opCss ? opCss[0] : '';
check(/position:\s*absolute/.test(opStr),          '[6d] #orders-panel position:absolute');
check(/bottom:\s*32px/.test(opStr),                '[6e] #orders-panel bottom:32px (выезжает ВВЕРХ из bottom-area)');

// CSS .closed / .open
check(/#orders-panel\.closed\s*\{[^}]*opacity:\s*0/.test(indexHtml),
  '[6f] CSS #orders-panel.closed { opacity:0; ... }');
check(/#orders-panel\.open\s*\{[^}]*opacity:\s*1/.test(indexHtml),
  '[6g] CSS #orders-panel.open { opacity:1; ... }');

// ───────────────────────────────────────────────────────
section('Placeholder');
// ───────────────────────────────────────────────────────

// [7] placeholder короткий
check(/placeholder="Ваш приказ\.\.\. \(напр\. «набрать 500 пехотинцев»\)"/.test(baHtml),
  '[7] placeholder = "Ваш приказ... (напр. «набрать 500 пехотинцев»)"');

// ───────────────────────────────────────────────────────
section('JS — toggleOrdersMini / updateOrdersMiniCount');
// ───────────────────────────────────────────────────────

// [8] функции объявлены и экспортированы
check(/function\s+toggleOrdersMini\s*\(/.test(govSrc),
  '[8a] function toggleOrdersMini() объявлена');
check(/function\s+updateOrdersMiniCount\s*\(/.test(govSrc),
  '[8b] function updateOrdersMiniCount() объявлена');
check(/window\.toggleOrdersMini\s*=\s*toggleOrdersMini/.test(govSrc),
  '[8c] window.toggleOrdersMini экспортирована');
check(/window\.updateOrdersMiniCount\s*=\s*updateOrdersMiniCount/.test(govSrc),
  '[8d] window.updateOrdersMiniCount экспортирована');

// ───────────────────────────────────────────────────────
section('Поведение — toggleOrdersMini / updateOrdersMiniCount в песочнице');
// ───────────────────────────────────────────────────────

// Минимальный DOM
function makeClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, on) => { if (on) s.add(c); else s.delete(c); },
  };
}
function makeEl(id) {
  return { _id: id, classList: makeClassList(), textContent: '' };
}

const ordersPanel = makeEl('orders-panel'); ordersPanel.classList.add('closed');
const miniBtn     = makeEl('orders-mini-btn');
const miniCount   = makeEl('orders-mini-count');
const ordersMain  = makeEl('orders-main-list');

const byId = {
  'orders-panel':      ordersPanel,
  'orders-mini-btn':   miniBtn,
  'orders-mini-count': miniCount,
  'orders-main-list':  ordersMain,
};

const fakeDoc = { getElementById(id) { return byId[id] ?? null; } };
const fakeWindow = {};

// Подготовим getActiveOrders, который вернёт 3 фейковых приказа
const fakeGameState = {
  player_nation: 'P',
  nations: { P: { characters: [] } },
  orders: [
    { id: 1, status: 'active' },
    { id: 2, status: 'active' },
    { id: 3, status: 'active' },
  ],
};

// Изолируем проблемные функции — нам нужны только updateOrdersMiniCount и toggleOrdersMini
// Извлечём их из govSrc вместо исполнения всего файла (он опирается на множество глобалов).
const reUpdate = /function\s+updateOrdersMiniCount\s*\([\s\S]*?^\}/m;
const reToggle = /function\s+toggleOrdersMini\s*\([\s\S]*?^\}/m;

const updateSrc = govSrc.match(reUpdate);
const toggleSrc = govSrc.match(reToggle);
check(!!updateSrc, '[B0a] исходник updateOrdersMiniCount извлечён');
check(!!toggleSrc, '[B0b] исходник toggleOrdersMini извлечён');

if (updateSrc && toggleSrc) {
  const factory = new Function(
    'document', 'window', 'getActiveOrders', 'renderOrdersPanel',
    `
    ${updateSrc[0]}
    ${toggleSrc[0]}
    return { updateOrdersMiniCount, toggleOrdersMini };
    `
  );

  const getActiveOrders = () => fakeGameState.orders.filter(o => o.status === 'active');
  let renderCalls = 0;
  const renderOrdersPanel = () => { renderCalls++; };

  const api = factory(fakeDoc, fakeWindow, getActiveOrders, renderOrdersPanel);

  // updateOrdersMiniCount
  api.updateOrdersMiniCount();
  check(miniCount.textContent === '3',
    '[8e] updateOrdersMiniCount() записал "3" в #orders-mini-count');

  // toggleOrdersMini: closed → open
  check(ordersPanel.classList.contains('closed') && !ordersPanel.classList.contains('open'),
    '[B1] orders-panel изначально .closed');
  api.toggleOrdersMini();
  check(ordersPanel.classList.contains('open') && !ordersPanel.classList.contains('closed'),
    '[6h] toggleOrdersMini(): closed → open');
  check(miniBtn.classList.contains('open'),
    '[6i] toggleOrdersMini(): #orders-mini-btn получает класс .open');
  check(renderCalls >= 1,
    '[6j] toggleOrdersMini() при открытии вызывает renderOrdersPanel()');

  // toggleOrdersMini: open → closed
  api.toggleOrdersMini();
  check(ordersPanel.classList.contains('closed') && !ordersPanel.classList.contains('open'),
    '[6k] toggleOrdersMini() второй раз: open → closed');
  check(!miniBtn.classList.contains('open'),
    '[6l] toggleOrdersMini() второй раз: класс .open снят');
}

// ───────────────────────────────────────────────────────
section('Совместимость — тест Шага 24 не сломан (классы коллапса/раскрытия)');
// ───────────────────────────────────────────────────────

check(/#event-log\.collapsed\s*\{[^}]*height:\s*32px[^}]*overflow:\s*hidden/s.test(indexHtml),
  '[Compat 24-1] CSS #event-log.collapsed { height:32px; overflow:hidden }');
check(/#event-log\.expanded\s*\{[^}]*height:\s*180px[^}]*transition:\s*height\s+0\.2s\s+ease/s.test(indexHtml),
  '[Compat 24-2] CSS #event-log.expanded { height:180px; transition:height 0.2s ease }');

console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
