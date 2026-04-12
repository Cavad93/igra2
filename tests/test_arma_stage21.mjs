// Тесты Шага 21 (arma.md) — Ресурс-бар в топ-баре
// Запуск: node tests/test_arma_stage21.mjs
//
// Чеклист из arma.md Шаг 21:
//   [1]  В index.html присутствует <div id="resource-bar"> внутри #top-bar.
//   [2]  #resource-bar содержит 4 .res-item с id res-gold / res-troops / res-food / res-pop.
//   [3]  Каждый .res-item имеет title и onclick="onResourceBarClick(...)".
//   [4]  В CSS определён селектор #resource-bar и .res-item (hover, цвета).
//   [5]  updateResourceBar / onResourceBarClick определены в ui/panels.js и
//        экспортируются в window.
//   [6]  updateResourceBar читает значения из state.nations[playerNation]:
//        economy.treasury, military (infantry+cavalry+ships+mercenaries),
//        economy.stockpile (wheat+fish+meat+...), population.total.
//   [7]  После вызова updateResourceBar числовые <span> содержат
//        форматированные значения (не "—").
//   [8]  Повторный вызов на том же ходу (state.turn не меняется)
//        — дельта НЕ перезаписывается (нет мерцания).
//   [9]  Смена state.turn (следующий ход) приводит к появлению
//        дельта-бейджа в .res-delta: положительная → .positive,
//        отрицательная → .negative, ноль → текст пуст.
//   [10] Первый вызов (prev=null) не показывает дельту (baseline init).
//   [11] renderLeftPanel вызывает updateResourceBar в конце функции.
//   [12] onResourceBarClick('gold')   вызывает showTreasuryOverlay().
//        onResourceBarClick('food')   вызывает showEconomyOverlay().
//        onResourceBarClick('pop')    вызывает showPopulationOverlay().
//   [13] Форматирование: 10'000 → "10К", 1'500'000 → "1.5М", <10000 → toLocaleString.
//   [14] .res-delta:empty скрывается (css: display:none).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const indexHtml  = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const panelsSrc  = readFileSync(resolve(__dirname, '..', 'ui', 'panels.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ═══════════════════════════════════════════════════════════════
// ТЕСТЫ HTML и CSS
// ═══════════════════════════════════════════════════════════════
section('HTML / CSS (index.html)');

// [1]
check(/<header\s+id="top-bar"[\s\S]*?<div\s+id="resource-bar"[\s\S]*?<\/header>/.test(indexHtml),
  '[1] <div id="resource-bar"> внутри <header id="top-bar">');

// [2]
check(/id="res-gold"/.test(indexHtml)
   && /id="res-troops"/.test(indexHtml)
   && /id="res-food"/.test(indexHtml)
   && /id="res-pop"/.test(indexHtml),
  '[2] Четыре .res-item: res-gold / res-troops / res-food / res-pop');

// [3]
check(/id="res-gold"[^>]*title=/.test(indexHtml)
   && /onResourceBarClick\('gold'\)/.test(indexHtml)
   && /onResourceBarClick\('troops'\)/.test(indexHtml)
   && /onResourceBarClick\('food'\)/.test(indexHtml)
   && /onResourceBarClick\('pop'\)/.test(indexHtml),
  '[3] У каждого .res-item есть title и onclick="onResourceBarClick(...)"');

// [4]
check(/#resource-bar\s*{[^}]*display:\s*flex/.test(indexHtml)
   && /\.res-item/.test(indexHtml)
   && /\.res-item:hover/.test(indexHtml),
  '[4] CSS #resource-bar (display:flex) и .res-item (+hover) присутствуют');

// [14]
check(/\.res-delta:empty\s*{[^}]*display:\s*none/.test(indexHtml),
  '[14] .res-delta:empty { display: none } в CSS');

// ═══════════════════════════════════════════════════════════════
// ФЕЙКОВЫЙ DOM + sandbox
// ═══════════════════════════════════════════════════════════════
section('Минимальный DOM для updateResourceBar');

// Примитивный Element с нужными методами
class FakeEl {
  constructor(tag = 'div') {
    this.tag = tag.toLowerCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.textContent = '';
    this._attrs = {};
    this.classList = {
      _set: new Set(),
      add:    (c) => this.classList._set.add(c),
      remove: (...cs) => cs.forEach(c => this.classList._set.delete(c)),
      toggle: (c, on) => {
        if (on) this.classList._set.add(c);
        else    this.classList._set.delete(c);
      },
      contains: (c) => this.classList._set.has(c),
    };
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  setAttribute(k, v) { this._attrs[k] = v; }
  querySelectorAll(sel) {
    // Поддержка только `.className`
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const out = [];
      const walk = (n) => {
        if ((n.className || '').split(' ').includes(cls)) out.push(n);
        (n.children || []).forEach(walk);
      };
      walk(this);
      return out;
    }
    return [];
  }
  querySelector(sel) {
    // Поддерживаем только те селекторы, которые реально используются
    const idMatch = sel.match(/^#([\w-]+)(?:\s+(.*))?$/);
    const descMatch = sel.match(/^#([\w-]+)\s+\.([\w-]+)$/);
    const firstSpan = sel.match(/^#([\w-]+)\s*>\s*span:first-of-type$/);
    if (firstSpan) {
      const root = this._find(firstSpan[1]);
      if (!root) return null;
      return root.children.find(c => c.tag === 'span') || null;
    }
    if (descMatch) {
      const root = this._find(descMatch[1]);
      if (!root) return null;
      return root.children.find(c => (c.className || '').split(' ').includes(descMatch[2])) || null;
    }
    if (idMatch) return this._find(idMatch[1]);
    return null;
  }
  _find(id) {
    if (this.id === id) return this;
    for (const c of this.children) {
      const r = c._find?.(id);
      if (r) return r;
    }
    return null;
  }
}

function buildFakeDocument() {
  const doc = new FakeEl('document');
  // #resource-bar с 4-мя .res-item, у каждого два span: значение + res-delta
  const bar = new FakeEl('div'); bar.id = 'resource-bar';
  for (const key of ['gold', 'troops', 'food', 'pop']) {
    const item = new FakeEl('div');
    item.id = `res-${key}`;
    item.className = 'res-item';
    const valSpan = new FakeEl('span');
    const deltaSpan = new FakeEl('span');
    deltaSpan.className = 'res-delta';
    item.appendChild(valSpan);
    item.appendChild(deltaSpan);
    bar.appendChild(item);
  }
  doc.appendChild(bar);
  // Левая панель с заголовком секции "Армия"
  const leftPanel = new FakeEl('div'); leftPanel.id = 'left-panel';
  const armyTitle = new FakeEl('div');
  armyTitle.className = 'section-title';
  armyTitle.textContent = '⚔️ Армия';
  armyTitle._scrolled = false;
  armyTitle.scrollIntoView = function (opts) { this._scrolled = true; this._scrollOpts = opts; };
  leftPanel.appendChild(armyTitle);
  doc.appendChild(leftPanel);
  // document.getElementById и document.querySelector
  doc.getElementById = (id) => doc._find(id);
  doc.querySelectorAll = (sel) => {
    // используется только panel.querySelectorAll('.section-title')
    if (sel === '.section-title') {
      const out = [];
      const walk = (n) => {
        if ((n.className || '').split(' ').includes('section-title')) out.push(n);
        (n.children || []).forEach(walk);
      };
      walk(doc);
      return out;
    }
    return [];
  };
  return doc;
}

// ═══════════════════════════════════════════════════════════════
// Извлекаем блок Шаг 21 из panels.js и выполняем его в sandbox
// ═══════════════════════════════════════════════════════════════

// Грубо: берём весь код от объявления _resourceBarPrev и до следующей
// функции renderPopMiniWidget (уже после всех экспортов Шага 21).
const commentIdx = panelsSrc.indexOf('Шаг 21 — РЕСУРС-БАР');
check(commentIdx > 0, '[5a] В panels.js есть блок "Шаг 21 — РЕСУРС-БАР"');
const markerIdx  = panelsSrc.indexOf('const _resourceBarPrev', commentIdx);
const endMarker  = panelsSrc.indexOf('function renderPopMiniWidget', markerIdx);
const snippet    = panelsSrc.slice(markerIdx, endMarker);

check(/function\s+updateResourceBar\s*\(/.test(snippet),
  '[5b] updateResourceBar определена в блоке Шага 21');
check(/function\s+onResourceBarClick\s*\(/.test(snippet),
  '[5c] onResourceBarClick определена в блоке Шага 21');
check(/window\.updateResourceBar\s*=\s*updateResourceBar/.test(snippet),
  '[5d] updateResourceBar экспортирована в window');
check(/window\.onResourceBarClick\s*=\s*onResourceBarClick/.test(snippet),
  '[5e] onResourceBarClick экспортирована в window');

// [6] — чтение нужных полей state
check(/economy\.treasury/.test(snippet),            '[6a] читает economy.treasury');
check(/military\.infantry/.test(snippet),           '[6b] читает military.infantry');
check(/military\.cavalry/.test(snippet),            '[6c] читает military.cavalry');
check(/economy\.stockpile/.test(snippet) || /_sumFoodStockpile/.test(snippet),
  '[6d] читает economy.stockpile (через helper)');
check(/population\.total|pop\.total/.test(snippet.replace(/pop\s*:/g, '')) || /pop\.total/.test(snippet),
  '[6e] читает population.total');

// [11]
check(/updateResourceBar\(GAME_STATE\)/.test(panelsSrc),
  '[11] renderLeftPanel вызывает updateResourceBar(GAME_STATE) в конце функции');

// ═══════════════════════════════════════════════════════════════
// Выполняем извлечённый код в sandbox
// ═══════════════════════════════════════════════════════════════
section('Выполнение updateResourceBar в sandbox');

const doc = buildFakeDocument();
let treasuryCalled = 0, economyCalled = 0, populationCalled = 0;
let renderTabArg = null;

const sandbox = {
  document:  doc,
  console,
  window:    {},
  showTreasuryOverlay:   () => { treasuryCalled++; },
  showEconomyOverlay:    () => { economyCalled++; },
  showPopulationOverlay: () => { populationCalled++; },
  // Шаг 23: onResourceBarClick("troops") вызывает renderLeftPanelTab("army")
  renderLeftPanelTab:    (name) => { renderTabArg = name; },
};
// Уходим от `window.* = ` наружу
sandbox.window.document = doc;

try {
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
} catch (e) {
  console.error('Ошибка sandbox:', e);
}

check(typeof sandbox.updateResourceBar === 'function'
   || typeof sandbox.window.updateResourceBar === 'function',
  '[5f] updateResourceBar доступна после выполнения');
check(typeof sandbox.onResourceBarClick === 'function'
   || typeof sandbox.window.onResourceBarClick === 'function',
  '[5g] onResourceBarClick доступна после выполнения');

const updateResourceBar  = sandbox.updateResourceBar  || sandbox.window.updateResourceBar;
const onResourceBarClick = sandbox.onResourceBarClick || sandbox.window.onResourceBarClick;

// Состояние первого хода
const state1 = {
  turn: 1,
  player_nation: 'ATH',
  nations: {
    ATH: {
      economy: {
        treasury: 1500,
        stockpile: { wheat: 200, fish: 50, meat: 30 },
      },
      military: { infantry: 500, cavalry: 100, ships: 10, mercenaries: 0 },
      population: { total: 25000 },
    },
  },
};

updateResourceBar(state1);

const goldSpan   = doc._find('res-gold').children[0];
const troopsSpan = doc._find('res-troops').children[0];
const foodSpan   = doc._find('res-food').children[0];
const popSpan    = doc._find('res-pop').children[0];
const goldDelta   = doc._find('res-gold').children[1];
const troopsDelta = doc._find('res-troops').children[1];

check(goldSpan.textContent   !== '—' && goldSpan.textContent.length > 0,
  '[7a] После updateResourceBar значение gold заполнено');
check(troopsSpan.textContent !== '—' && troopsSpan.textContent.length > 0,
  '[7b] После updateResourceBar значение troops заполнено');
check(foodSpan.textContent   !== '—' && foodSpan.textContent.length > 0,
  '[7c] После updateResourceBar значение food заполнено');
check(popSpan.textContent    !== '—' && popSpan.textContent.length > 0,
  '[7d] После updateResourceBar значение pop заполнено');

// [10] Первый вызов не показывает дельту
check(goldDelta.textContent === '' && troopsDelta.textContent === '',
  '[10] При первом вызове (prev=null) .res-delta пустой — baseline init');

// [13] Форматирование — проверяем формат чисел
// 1500 золота → точно не должно содержать "К" / "М"
check(!/[КМ]/.test(goldSpan.textContent),
  '[13a] gold=1500 форматируется без суффиксов К/М');
// troops = 610 → тоже без суффикса
check(!/[КМ]/.test(troopsSpan.textContent),
  '[13b] troops=610 форматируется без суффиксов К/М');

// Второй вызов в ТОМ ЖЕ ходу — дельта не должна появиться
const state1b = JSON.parse(JSON.stringify(state1));
state1b.nations.ATH.economy.treasury = 1800;   // даже если значение выросло,
                                                 // мы в одном ходу — дельта не показывается
updateResourceBar(state1b);
check(goldDelta.textContent === '',
  '[8] При повторном вызове в ТОМ ЖЕ ходу дельта не записывается');

// Третий вызов — новый ход, треасури упал на 200
const state2 = JSON.parse(JSON.stringify(state1));
state2.turn = 2;
state2.nations.ATH.economy.treasury = 1300;  // относительно baseline 1500 → -200
state2.nations.ATH.military.infantry = 520;   // +20 → troops +20
updateResourceBar(state2);

check(/^-/.test(goldDelta.textContent) && goldDelta.classList.contains('negative'),
  '[9a] Смена хода, treasury упал → .res-delta с "-" и классом negative');
check(/^\+/.test(troopsDelta.textContent) && troopsDelta.classList.contains('positive'),
  '[9b] Смена хода, troops вырос → .res-delta с "+" и классом positive');

// Четвёртый вызов — ещё ход, но без изменений
const state3 = JSON.parse(JSON.stringify(state2));
state3.turn = 3;
updateResourceBar(state3);
check(goldDelta.textContent === '',
  '[9c] Смена хода без изменений → .res-delta пусто (дельта 0)');

// [12] Проверяем onResourceBarClick — что вызываются соответствующие оверлеи
onResourceBarClick('gold');
check(treasuryCalled === 1, '[12a] click gold → showTreasuryOverlay()');
onResourceBarClick('food');
check(economyCalled === 1,  '[12b] click food → showEconomyOverlay()');
onResourceBarClick('pop');
check(populationCalled === 1, '[12c] click pop → showPopulationOverlay()');

// troops → переключает вкладку левой панели на "Армия" (Шаг 23).
// До Шага 23 вместо этого происходил scrollIntoView по .section-title.
onResourceBarClick('troops');
check(renderTabArg === 'army',
  '[12d] click troops → renderLeftPanelTab("army") (Шаг 23)');

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
