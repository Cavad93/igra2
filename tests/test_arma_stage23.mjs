// Тесты Шага 23 (arma.md) — Иконки-вкладки в левой панели
// Запуск: node tests/test_arma_stage23.mjs
//
// Чеклист из arma.md Шаг 23:
//   [1]  В #left-panel присутствует <nav id="left-nav"> с 5 кнопками .lnav-btn
//        и data-tab="overview|army|economy|diplomacy|laws".
//   [2]  Первая кнопка (overview) по умолчанию имеет класс .active.
//   [3]  В #left-panel присутствует контейнер #left-panel-content.
//   [4]  Каждая .lnav-btn имеет title и onclick="renderLeftPanelTab('<tab>')".
//   [5]  CSS #left-panel: display:flex и flex-direction:row.
//   [6]  CSS #left-nav: width 40px, flex-direction:column, border-right,
//        flex-shrink:0.
//   [7]  CSS .lnav-btn: фиксированные размеры ~34px, background:none, border:none,
//        color:var(--text-dim), font-size:16px, cursor:pointer, transition.
//   [8]  CSS .lnav-btn:hover — меняется фон/цвет.
//   [9]  CSS .lnav-btn.active — подсветка (box-shadow или фон, цвет gold).
//   [10] CSS #left-panel-content: flex:1, overflow-y:auto, padding.
//   [11] В ui/panels.js объявлена function renderLeftPanelTab(tabName).
//   [12] Функция экспортирована как window.renderLeftPanelTab.
//   [13] renderLeftPanel не падает при новой HTML-структуре и пишет контент в
//        #left-panel-content, а не в #left-panel (чтобы icon-bar оставался на месте).
//   [14] Поведение renderLeftPanelTab: переключает active у кнопок в #left-nav
//        (убирает у всех, ставит на кликнутую) и заменяет innerHTML #left-panel-content.
//   [15] onResourceBarClick('troops') вызывает renderLeftPanelTab('army').

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const panelsSrc = readFileSync(resolve(__dirname, '..', 'ui', 'panels.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ═══════════════════════════════════════════════════════════════
section('HTML — структура #left-panel / #left-nav');
// ═══════════════════════════════════════════════════════════════

const leftPanelMatch = indexHtml.match(/<div\s+id="left-panel"[\s\S]*?<\/div>\s*<\/div>/);
check(!!leftPanelMatch, '[pre] Найден блок <div id="left-panel"> ... </div>');

const lpHtml = leftPanelMatch ? leftPanelMatch[0] : '';

// [1]
check(/<nav\s+id="left-nav"[\s\S]*?<\/nav>/.test(lpHtml),
  '[1a] Внутри #left-panel есть <nav id="left-nav">');

const navMatch = lpHtml.match(/<nav\s+id="left-nav"[\s\S]*?<\/nav>/);
const navHtml = navMatch ? navMatch[0] : '';

for (const t of ['overview', 'army', 'economy', 'diplomacy', 'laws']) {
  const re = new RegExp(`<button[^>]*class="lnav-btn[^"]*"[^>]*data-tab="${t}"`);
  check(re.test(navHtml), `[1b] Кнопка .lnav-btn data-tab="${t}" присутствует`);
}

// [2]
check(/<button[^>]*class="lnav-btn\s+active"[^>]*data-tab="overview"/.test(navHtml),
  '[2] По умолчанию активна кнопка overview (.lnav-btn.active)');

// [3]
check(/<div\s+id="left-panel-content"[\s\S]*?<\/div>/.test(lpHtml),
  '[3] Внутри #left-panel есть <div id="left-panel-content">');

// [4]
for (const t of ['overview', 'army', 'economy', 'diplomacy', 'laws']) {
  const re = new RegExp(`data-tab="${t}"[^>]*title="[^"]+"[^>]*onclick="renderLeftPanelTab\\('${t}'\\)"`);
  check(re.test(navHtml),
    `[4-${t}] Кнопка "${t}" имеет title и onclick="renderLeftPanelTab('${t}')"`);
}

// ═══════════════════════════════════════════════════════════════
section('CSS — #left-panel / #left-nav / .lnav-btn / #left-panel-content');
// ═══════════════════════════════════════════════════════════════

// [5]
check(
  /#left-panel\s*{[^}]*display:\s*flex[^}]*flex-direction:\s*row/s.test(indexHtml),
  '[5] CSS #left-panel: display:flex; flex-direction:row'
);

// [6]
check(
  /#left-nav\s*{[^}]*width:\s*40px[^}]*flex-direction:\s*column[^}]*border-right[^}]*flex-shrink:\s*0/s.test(indexHtml),
  '[6] CSS #left-nav: width:40px; flex-direction:column; border-right; flex-shrink:0'
);

// [7]
check(
  /\.lnav-btn\s*{[^}]*width:\s*34px[^}]*height:\s*34px[^}]*background:\s*none[^}]*border:\s*none[^}]*cursor:\s*pointer[^}]*font-size:\s*16px[^}]*color:\s*var\(--text-dim\)[^}]*transition/s.test(indexHtml),
  '[7] CSS .lnav-btn: 34x34, background:none, border:none, cursor:pointer, color:var(--text-dim), transition'
);

// [8]
check(
  /\.lnav-btn:hover\s*{[^}]*color:\s*var\(--text-gold\)/s.test(indexHtml),
  '[8] CSS .lnav-btn:hover: color:var(--text-gold)'
);

// [9]
check(
  /\.lnav-btn\.active\s*{[^}]*color:\s*var\(--text-gold\)[^}]*box-shadow:\s*inset\s+2px\s+0\s+0\s+var\(--border-gold\)/s.test(indexHtml),
  '[9] CSS .lnav-btn.active: color:var(--text-gold) + box-shadow inset var(--border-gold)'
);

// [10]
check(
  /#left-panel-content\s*{[^}]*flex:\s*1[^}]*overflow-y:\s*auto[^}]*padding:\s*8px/s.test(indexHtml),
  '[10] CSS #left-panel-content: flex:1; overflow-y:auto; padding:8px'
);

// ═══════════════════════════════════════════════════════════════
section('JS — renderLeftPanelTab объявлена и экспортирована');
// ═══════════════════════════════════════════════════════════════

// [11]
check(/function\s+renderLeftPanelTab\s*\(\s*tabName\s*\)/.test(panelsSrc),
  '[11] function renderLeftPanelTab(tabName) объявлена в ui/panels.js');

// [12]
check(/window\.renderLeftPanelTab\s*=\s*renderLeftPanelTab/.test(panelsSrc),
  '[12] window.renderLeftPanelTab = renderLeftPanelTab');

// [13]
// Ищем, что renderLeftPanel вызывает хелпер, который пишет в left-panel-content
check(
  /_renderLeftPanelContent\s*\(\s*\)/.test(panelsSrc)
  && /document\.getElementById\(\s*['"]left-panel-content['"]\s*\)/.test(panelsSrc),
  '[13] renderLeftPanel использует _renderLeftPanelContent() и пишет в #left-panel-content'
);

// [15]
check(
  /case\s+['"]troops['"][\s\S]*?renderLeftPanelTab\s*\(\s*['"]army['"]\s*\)/.test(panelsSrc),
  '[15] onResourceBarClick("troops") вызывает renderLeftPanelTab("army")'
);

// ═══════════════════════════════════════════════════════════════
section('Поведение — имитация DOM и вызов renderLeftPanelTab');
// ═══════════════════════════════════════════════════════════════

// Сконструируем фейковый DOM: #left-nav с 5 кнопками и #left-panel-content.
function makeClassList() {
  const s = new Set();
  return {
    _set: s,
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, on) => { if (on) s.add(c); else s.delete(c); },
  };
}
function makeEl(tag, id) {
  return {
    tag, id,
    _attrs: {},
    classList: makeClassList(),
    children: [],
    innerHTML: '',
    getAttribute(k) { return this._attrs[k] ?? null; },
    setAttribute(k, v) { this._attrs[k] = v; },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, '');
      const out = [];
      const walk = (n) => {
        if (n.classList && n.classList._set && n.classList._set.has(cls)) out.push(n);
        (n.children || []).forEach(walk);
      };
      walk(this);
      return out;
    },
  };
}

const nav = makeEl('nav', 'left-nav');
const content = makeEl('div', 'left-panel-content');
const tabs = ['overview', 'army', 'economy', 'diplomacy', 'laws'];
for (const t of tabs) {
  const btn = makeEl('button', 'btn-' + t);
  btn._attrs['data-tab'] = t;
  btn.classList.add('lnav-btn');
  if (t === 'overview') btn.classList.add('active');
  nav.children.push(btn);
}

const leftPanelEl = makeEl('div', 'left-panel');
leftPanelEl.children.push(nav, content);

const fakeDoc = {
  getElementById(id) {
    if (id === 'left-nav')           return nav;
    if (id === 'left-panel-content') return content;
    if (id === 'left-panel')         return leftPanelEl;
    return null;
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};

// Поддельный GAME_STATE с минимально необходимой структурой
const fakeNation = {
  name: 'Римская держава',
  economy: {
    treasury: 1234,
    income_per_turn: 100,
    expense_per_turn: 50,
    _income_breakdown: { total: 100 },
    _expense_breakdown: { total: 50 },
    stockpile: { wheat: 500 },
  },
  military: { infantry: 1000, cavalry: 200, ships: 10, mercenaries: 0, morale: 70, loyalty: 80 },
  population: { total: 50000, happiness: 60, by_profession: {} },
  government: { ruler: { name: 'Цезарь', age: 45 }, type: 'republic', legitimacy: 80 },
  relations: {},
  active_laws: [],
  regions: [],
};
const fakeGameState = {
  turn: 1,
  player_nation: 'rome',
  nations: { rome: fakeNation },
};

// Заглушки для вспомогательных функций, которые вызывает renderLeftPanel.
const stubs = {
  getGovernmentName: () => 'Республика',
  calcGrandeur: () => 42,
  renderPopMiniWidget: () => '<div>POP</div>',
  renderCulturePanel: () => '<div>CULT</div>',
  renderReligionPanel: () => '<div>REL</div>',
  renderRelations: () => '<div>REL</div>',
  renderLaws: () => '<div>LAWS</div>',
  openCultureWindow: () => {},
  openReligionWindow: () => {},
  updateResourceBar: () => {},
};

// Загружаем ui/panels.js в песочницу с подменённым document/window.
const sandbox = {
  document: fakeDoc,
  window: {},
  GAME_STATE: fakeGameState,
  console,
  ...stubs,
};

// Оборачиваем исходник в функцию, чтобы переменные не утекали и при этом
// имели доступ к sandbox. `let _currentLeftTab` на верхнем уровне панели будет
// локальным для функции.
const factoryKeys = Object.keys(sandbox);
const factory = new Function(...factoryKeys, `
  ${panelsSrc}
  return {
    renderLeftPanel: typeof renderLeftPanel === 'function' ? renderLeftPanel : null,
    renderLeftPanelTab: typeof renderLeftPanelTab === 'function' ? renderLeftPanelTab : null,
  };
`);

let api;
let runError = null;
try {
  api = factory(...factoryKeys.map(k => sandbox[k]));
} catch (e) {
  runError = e;
}
check(!runError, '[B0] ui/panels.js исполняется без ошибок в песочнице' +
  (runError ? ' (' + runError.message + ')' : ''));

if (api && api.renderLeftPanel) {
  // renderLeftPanel должен заполнить #left-panel-content — не упасть.
  let err = null;
  try { api.renderLeftPanel(); } catch (e) { err = e; }
  check(!err, '[B1] renderLeftPanel() выполняется без ошибок' + (err ? ' (' + err.message + ')' : ''));

  // После первого рендера (текущая вкладка — overview) контент должен быть не пустым.
  check(content.innerHTML && content.innerHTML.length > 0,
    '[B2] renderLeftPanel() записал контент в #left-panel-content');

  // В overview должны быть разделы "Правитель" и НЕ должен быть раздел "Армия".
  check(/Легитимность/.test(content.innerHTML),
    '[B3] overview содержит блок правителя (Легитимность)');
  check(!/Боевой дух/.test(content.innerHTML),
    '[B4] overview НЕ содержит блок армии (Боевой дух)');

  // Переключаемся на army
  api.renderLeftPanelTab('army');
  check(/Боевой дух/.test(content.innerHTML) && !/Легитимность/.test(content.innerHTML),
    '[B5] renderLeftPanelTab("army") показывает блок армии и скрывает overview');

  // Проверяем active-класс у кнопок
  const armyBtn    = nav.children.find(b => b._attrs['data-tab'] === 'army');
  const overviewBtn = nav.children.find(b => b._attrs['data-tab'] === 'overview');
  check(armyBtn.classList.contains('active')
     && !overviewBtn.classList.contains('active'),
    '[B6] После renderLeftPanelTab("army") активна только army-кнопка');

  // Переключаемся на economy → должно быть что-то "Казна" или "Доход"
  api.renderLeftPanelTab('economy');
  check(/Казна|Монет|Доход/.test(content.innerHTML),
    '[B7] renderLeftPanelTab("economy") показывает блок казны');

  // diplomacy и laws — базовая проверка, что рендер не падает
  let dipErr = null;
  try { api.renderLeftPanelTab('diplomacy'); } catch (e) { dipErr = e; }
  check(!dipErr, '[B8] renderLeftPanelTab("diplomacy") не падает');

  let lawErr = null;
  try { api.renderLeftPanelTab('laws'); } catch (e) { lawErr = e; }
  check(!lawErr, '[B9] renderLeftPanelTab("laws") не падает');
}

console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
