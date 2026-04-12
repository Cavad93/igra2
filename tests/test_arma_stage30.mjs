// Тесты Шага 30 (arma.md) — Контекстное меню правой кнопкой мыши
// Запуск: node tests/test_arma_stage30.mjs
//
// Чеклист из arma.md Шаг 30:
//   [1] <div id="ctx-menu"></div> присутствует в body.
//   [2] CSS #ctx-menu:
//         position:fixed; z-index:8000; min-width:160px;
//         background:rgba(13,10,5,0.97); border:1px solid var(--border-gold);
//         border-radius:3px; box-shadow:0 4px 16px rgba(0,0,0,0.6);
//         display:none; backdrop-filter:blur(4px);
//   [3] CSS .ctx-item с padding, font-size, color, cursor, display:flex,
//       align-items:center, gap, border-bottom, transition.
//       .ctx-item:hover { background; color } .ctx-item:last-child { border-bottom:none }
//       .ctx-separator { height:1px; background; margin }
//   [4] В ui/map.js polygon.on('contextmenu', ...) вызывает window.showContextMenu
//       с preventDefault на originalEvent.
//   [5] В index.html объявлены window.showContextMenu и window.closeCtxMenu,
//       функции showContextMenu(x,y,regionOrId) и closeCtxMenu() — определены.
//   [6] Пункты меню зависят от состояния региона:
//         - Всегда: 📜 Подробности
//         - Чужой регион + есть живая армия игрока рядом: ⚔ Атаковать
//         - Чужой регион + нет войны: 🤝 Предложить союз
//         - Свой регион: 🏗 Построить, 📦 Управление
//   [7] Меню не выходит за viewport (правый нижний угол → сдвиг внутрь).
//   [8] Клик по пункту меню закрывает меню.
//   [9] Клик вне меню / Esc / document contextmenu → closeCtxMenu().
//   [10] Leaflet listener вызывается c originalEvent.preventDefault().

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const mapSrc    = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('HTML — <div id="ctx-menu"> присутствует');
// ─────────────────────────────────────────────────────────────

check(/<div[^>]*id="ctx-menu"[^>]*>\s*<\/div>/.test(indexHtml),
  '[1] <div id="ctx-menu"></div> присутствует в body');

// ─────────────────────────────────────────────────────────────
section('CSS — #ctx-menu');
// ─────────────────────────────────────────────────────────────

const ctxCssMatch = indexHtml.match(/#ctx-menu\s*\{[^}]+\}/);
check(!!ctxCssMatch, '[pre] CSS блок #ctx-menu найден');
const ctxCss = ctxCssMatch ? ctxCssMatch[0] : '';

check(/position:\s*fixed/.test(ctxCss),                      '[2a] position:fixed');
check(/z-index:\s*8000/.test(ctxCss),                        '[2b] z-index:8000');
check(/min-width:\s*160px/.test(ctxCss),                     '[2c] min-width:160px');
check(/background:\s*rgba\(13\s*,\s*10\s*,\s*5\s*,\s*0\.97\)/.test(ctxCss),
  '[2d] background:rgba(13,10,5,0.97)');
check(/border:\s*1px\s+solid\s+var\(--border-gold\)/.test(ctxCss),
  '[2e] border:1px solid var(--border-gold)');
check(/border-radius:\s*3px/.test(ctxCss),                   '[2f] border-radius:3px');
check(/box-shadow:\s*0\s+4px\s+16px\s+rgba\(0\s*,\s*0\s*,\s*0\s*,\s*0\.6\)/.test(ctxCss),
  '[2g] box-shadow:0 4px 16px rgba(0,0,0,0.6)');
check(/display:\s*none/.test(ctxCss),                        '[2h] display:none');
check(/backdrop-filter:\s*blur\(4px\)/.test(ctxCss),         '[2i] backdrop-filter:blur(4px)');

// ─────────────────────────────────────────────────────────────
section('CSS — .ctx-item, .ctx-item:hover, .ctx-item:last-child, .ctx-separator');
// ─────────────────────────────────────────────────────────────

const itemCssMatch = indexHtml.match(/\.ctx-item\s*\{[^}]+\}/);
check(!!itemCssMatch, '[pre] CSS блок .ctx-item найден');
const itemCss = itemCssMatch ? itemCssMatch[0] : '';
check(/padding:\s*7px\s+14px/.test(itemCss),                 '[3a] .ctx-item padding:7px 14px');
check(/font-size:\s*12px/.test(itemCss),                     '[3b] .ctx-item font-size:12px');
check(/color:\s*var\(--text-light\)/.test(itemCss),          '[3c] .ctx-item color:var(--text-light)');
check(/cursor:\s*pointer/.test(itemCss),                     '[3d] .ctx-item cursor:pointer');
check(/display:\s*flex/.test(itemCss),                       '[3e] .ctx-item display:flex');
check(/align-items:\s*center/.test(itemCss),                 '[3f] .ctx-item align-items:center');
check(/gap:\s*8px/.test(itemCss),                            '[3g] .ctx-item gap:8px');
check(/border-bottom:\s*1px\s+solid\s+rgba\(107\s*,\s*79\s*,\s*26\s*,\s*0\.15\)/.test(itemCss),
  '[3h] .ctx-item border-bottom:1px solid rgba(107,79,26,0.15)');
check(/transition:\s*background\s+0\.1s/.test(itemCss),      '[3i] .ctx-item transition:background 0.1s');

const hoverCssMatch = indexHtml.match(/\.ctx-item:hover\s*\{[^}]+\}/);
check(!!hoverCssMatch, '[pre] CSS блок .ctx-item:hover найден');
const hoverCss = hoverCssMatch ? hoverCssMatch[0] : '';
check(/background:\s*rgba\(212\s*,\s*168\s*,\s*83\s*,\s*0\.1\)/.test(hoverCss),
  '[3j] .ctx-item:hover background:rgba(212,168,83,0.1)');
check(/color:\s*var\(--text-gold\)/.test(hoverCss),
  '[3k] .ctx-item:hover color:var(--text-gold)');

const lastCssMatch = indexHtml.match(/\.ctx-item:last-child\s*\{[^}]+\}/);
check(!!lastCssMatch, '[3l] CSS блок .ctx-item:last-child { border-bottom:none }');
if (lastCssMatch) {
  check(/border-bottom:\s*none/.test(lastCssMatch[0]),
    '[3l-v] .ctx-item:last-child border-bottom:none');
}

const sepCssMatch = indexHtml.match(/\.ctx-separator\s*\{[^}]+\}/);
check(!!sepCssMatch, '[pre] CSS блок .ctx-separator найден');
const sepCss = sepCssMatch ? sepCssMatch[0] : '';
check(/height:\s*1px/.test(sepCss),                          '[3m] .ctx-separator height:1px');
check(/background:\s*rgba\(107\s*,\s*79\s*,\s*26\s*,\s*0\.25\)/.test(sepCss),
  '[3n] .ctx-separator background:rgba(107,79,26,0.25)');
check(/margin:\s*2px\s+0/.test(sepCss),                      '[3o] .ctx-separator margin:2px 0');

// ─────────────────────────────────────────────────────────────
section('ui/map.js — polygon.on(contextmenu) + preventDefault + showContextMenu');
// ─────────────────────────────────────────────────────────────

check(/polygon\.on\(\s*['"]contextmenu['"]/.test(mapSrc),
  '[4a] polygon.on("contextmenu", ...) зарегистрирован');
check(/preventDefault\s*\(/.test(mapSrc) && /contextmenu[\s\S]{0,400}preventDefault/.test(mapSrc),
  '[4b] вызывается originalEvent.preventDefault() в обработчике contextmenu');
check(/window\.showContextMenu\s*\(/.test(mapSrc) &&
      /clientX/.test(mapSrc) && /clientY/.test(mapSrc),
  '[4c] вызывается window.showContextMenu(...) с clientX/clientY из originalEvent');

// ─────────────────────────────────────────────────────────────
section('index.html — showContextMenu / closeCtxMenu — объявлены и экспортированы');
// ─────────────────────────────────────────────────────────────

check(/function\s+showContextMenu\s*\(\s*x\s*,\s*y\s*,/.test(indexHtml),
  '[5a] function showContextMenu(x, y, ...) объявлена');
check(/function\s+closeCtxMenu\s*\(\s*\)/.test(indexHtml),
  '[5b] function closeCtxMenu() объявлена');
check(/window\.showContextMenu\s*=\s*showContextMenu/.test(indexHtml),
  '[5c] window.showContextMenu = showContextMenu');
check(/window\.closeCtxMenu\s*=\s*closeCtxMenu/.test(indexHtml),
  '[5d] window.closeCtxMenu = closeCtxMenu');

// ─────────────────────────────────────────────────────────────
section('index.html — закрытие меню по click / Esc / contextmenu');
// ─────────────────────────────────────────────────────────────

check(/document\.addEventListener\(\s*['"]click['"][\s\S]{0,600}closeCtxMenu\s*\(/.test(indexHtml),
  '[9a] document click-listener вызывает closeCtxMenu()');
check(/document\.addEventListener\(\s*['"]keydown['"][\s\S]{0,300}Escape[\s\S]{0,200}closeCtxMenu\s*\(/.test(indexHtml),
  '[9b] keydown Escape вызывает closeCtxMenu()');
check(/document\.addEventListener\(\s*['"]contextmenu['"][\s\S]{0,400}closeCtxMenu\s*\(/.test(indexHtml),
  '[9c] document contextmenu-listener вызывает closeCtxMenu()');

// ─────────────────────────────────────────────────────────────
section('Поведение — JSDOM-подобный моделинг: пункты меню и позиционирование');
// ─────────────────────────────────────────────────────────────

// Извлекаем тело _buildCtxMenuItems/showContextMenu/closeCtxMenu как строки
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  // найти первый { после header и парсить со скобочным балансом
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

const fnBuild = extractFn(indexHtml, 'function _buildCtxMenuItems(');
const fnShow  = extractFn(indexHtml, 'function showContextMenu(');
const fnClose = extractFn(indexHtml, 'function closeCtxMenu(');

check(!!fnBuild && !!fnShow && !!fnClose,
  '[B0] _buildCtxMenuItems / showContextMenu / closeCtxMenu извлечены');

if (fnBuild && fnShow && fnClose) {
  // ── Мини-DOM mock ──
  function makeEl(tag = 'div') {
    const el = {
      tagName:   tag.toUpperCase(),
      className: '',
      style:     {},
      attrs:     {},
      children:  [],
      _text:     '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c)     { this.children.push(c); c.parentNode = this; return c; },
      addEventListener(ev, fn) { (this._listeners ||= {})[ev] = fn; },
      getBoundingClientRect() { return { width: 170, height: this._hLen(), left: 0, top: 0 }; },
      contains(other)    { if (other === this) return true; for (const c of this.children) if (c.contains && c.contains(other)) return true; return false; },
      _hLen() {
        // грубая высота по количеству детей
        let h = 0;
        for (const c of this.children) h += (c.className === 'ctx-separator' ? 5 : 30);
        return h || 30;
      },
      set innerHTML(v) {
        this._text = v;
        this.children = [];
      },
      get innerHTML() { return this._text; },
    };
    return el;
  }
  const ctxEl = makeEl('div');
  ctxEl.className = 'ctx-menu';
  const fakeDoc = {
    getElementById(id) { return id === 'ctx-menu' ? ctxEl : null; },
    createElement(tag) { return makeEl(tag); },
    addEventListener() {},
  };
  const fakeWindow = {
    innerWidth:  1000,
    innerHeight: 800,
  };

  // ── Игровое состояние для разных кейсов ──
  const baseState = {
    player_nation: 'P',
    nations: {
      P: { id: 'P', name: 'Player', color: '#0f0', military: { at_war_with: [] } },
      Q: { id: 'Q', name: 'Foe',    color: '#f00', military: { at_war_with: [] } },
      W: { id: 'W', name: 'EnemyAtWar', color: '#f0f', military: { at_war_with: [] } },
    },
    regions: {
      own:     { nation: 'P', neighbors: ['foe'] },
      foe:     { nation: 'Q', neighbors: ['own'] },
      far:     { nation: 'Q', neighbors: [] },
      hostile: { nation: 'W', neighbors: [] },
    },
    armies: [
      { id: 'A1', nation: 'P', state: 'idle', position: 'own' },
    ],
  };
  const MAP_REG = {
    own:     { nation: 'P', neighbors: ['foe'] },
    foe:     { nation: 'Q', neighbors: ['own'] },
    far:     { nation: 'Q', neighbors: [] },
    hostile: { nation: 'W', neighbors: [] },
  };
  baseState.nations.P.military.at_war_with = ['W'];

  // Sandbox-функции из index.html
  const factory = new Function(
    'GAME_STATE', 'MAP_REGIONS', 'document', 'window',
    'onRegionClick', 'showRegionInfo', 'switchLeftTab', 'switchRegionTab', 'showToast',
    `
    ${fnBuild}
    ${fnShow}
    ${fnClose}
    return { _buildCtxMenuItems, showContextMenu, closeCtxMenu };
    `
  );

  const onRegionClickCalls = [];
  const toastCalls = [];
  const switchLeftTabCalls = [];
  const api = factory(
    baseState, MAP_REG, fakeDoc, fakeWindow,
    (id) => { onRegionClickCalls.push(id); },
    (id) => { onRegionClickCalls.push('info:' + id); },
    (tab) => { switchLeftTabCalls.push(tab); },
    (tab) => {},
    (msg, type) => { toastCalls.push([msg, type]); }
  );

  // ─── Пункты меню: свой регион ───
  const itemsOwn = api._buildCtxMenuItems('own');
  const ownLabels = itemsOwn.filter(i => !i.sep).map(i => i.label);
  check(ownLabels.includes('Подробности'),
    '[6a] свой регион: пункт "Подробности" присутствует всегда');
  check(ownLabels.includes('Построить'),
    '[6b] свой регион: пункт "Построить" присутствует');
  check(ownLabels.includes('Управление'),
    '[6c] свой регион: пункт "Управление" присутствует');
  check(!ownLabels.includes('Атаковать'),
    '[6d] свой регион: пункт "Атаковать" отсутствует');
  check(!ownLabels.includes('Предложить союз'),
    '[6e] свой регион: пункт "Предложить союз" отсутствует');

  // ─── Пункты меню: чужой регион с армией рядом, не в войне ───
  const itemsFoe = api._buildCtxMenuItems('foe');
  const foeLabels = itemsFoe.filter(i => !i.sep).map(i => i.label);
  check(foeLabels.includes('Подробности'),
    '[6f] чужой регион: "Подробности" всегда');
  check(foeLabels.includes('Атаковать'),
    '[6g] чужой регион + есть армия рядом → "Атаковать"');
  check(foeLabels.includes('Предложить союз'),
    '[6h] чужой регион + мир → "Предложить союз"');
  check(!foeLabels.includes('Построить'),
    '[6i] чужой регион: "Построить" отсутствует');

  // ─── Пункты меню: чужой далёкий регион, армии нет рядом ───
  const itemsFar = api._buildCtxMenuItems('far');
  const farLabels = itemsFar.filter(i => !i.sep).map(i => i.label);
  check(!farLabels.includes('Атаковать'),
    '[6j] чужой регион без армии рядом: "Атаковать" отсутствует');
  check(farLabels.includes('Предложить союз'),
    '[6k] чужой регион без войны: "Предложить союз" присутствует');

  // ─── Пункты меню: враг (в состоянии войны) ───
  const itemsWar = api._buildCtxMenuItems('hostile');
  const warLabels = itemsWar.filter(i => !i.sep).map(i => i.label);
  check(!warLabels.includes('Предложить союз'),
    '[6l] регион нации в войне: "Предложить союз" отсутствует');

  // ─── Позиционирование меню: правый нижний угол → сдвиг внутрь ───
  api.showContextMenu(990, 790, 'own');
  const leftPx = parseInt(ctxEl.style.left, 10);
  const topPx  = parseInt(ctxEl.style.top, 10);
  check(ctxEl.style.display === 'block',
    '[7a] showContextMenu: меню отображается (display:block)');
  check(Number.isFinite(leftPx) && leftPx + 170 <= 1000,
    '[7b] меню не выходит за правый край viewport');
  check(Number.isFinite(topPx) && topPx + ctxEl._hLen() <= 800,
    '[7c] меню не выходит за нижний край viewport');

  // ─── Клик по пункту меню вызывает action и закрывает меню ───
  const first = ctxEl.children.find(c => c.className === 'ctx-item');
  check(!!first, '[pre] первый .ctx-item найден в DOM-моке');
  if (first && first._listeners && first._listeners.click) {
    first._listeners.click({ stopPropagation() {} });
    check(ctxEl.style.display === 'none',
      '[8a] клик по пункту меню → закрывает меню');
    check(onRegionClickCalls.length >= 1,
      '[8b] клик по "Подробности" вызывает onRegionClick(regionId)');
  }

  // ─── closeCtxMenu() скрывает меню ───
  ctxEl.style.display = 'block';
  api.closeCtxMenu();
  check(ctxEl.style.display === 'none',
    '[8c] closeCtxMenu() устанавливает display:none');

  // ─── Неизвестный regionId → безопасно игнорируется ───
  ctxEl.style.display = 'none';
  try {
    api.showContextMenu(10, 10, null);
    check(ctxEl.style.display === 'none',
      '[8d] showContextMenu(null) безопасно игнорируется');
  } catch (e) {
    check(false, '[8d] showContextMenu(null) не должна падать: ' + e.message);
  }
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
