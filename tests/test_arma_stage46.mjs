// Тесты Шага 46 (arma.md) — Спарклайны трендов в ресурс-баре
// Запуск: node tests/test_arma_stage46.mjs
//
// Чеклист из arma.md Шаг 46:
//   [1]  В каждом .res-item (res-gold / res-troops / res-food / res-pop)
//        присутствует <canvas class="res-sparkline" width="44" height="14">.
//   [2]  В CSS есть селектор #resource-bar .res-sparkline с зафиксированной
//        шириной/высотой (44×14), pointer-events:none.
//   [3]  В ui/panels.js определены функции drawSparkline(canvas, values, color)
//        и _pushResourceHistory(state), обе экспортированы в window.
//   [4]  GAME_STATE.history.{treasury,army_size,population,food} — массивы,
//        создаются автоматически, если отсутствуют.
//   [5]  _pushResourceHistory пушит значения игрока и обрезает массивы до 10.
//   [6]  updateResourceBar вызывает рендер спарклайнов (drawSparkline) для
//        каждого ключа ресурса.
//   [7]  drawSparkline на canvas с < 2 точек — очищает и выходит (ничего не рисует).
//   [8]  drawSparkline с несколькими точками вызывает clearRect, beginPath,
//        moveTo, lineTo, stroke и рисует маркер (arc) для последней точки.
//   [9]  engine/turn.js вызывает _pushResourceHistory(GAME_STATE) после
//        _recordTurnSummary (раз за ход).
//  [10]  _applyResourceDelta добавляет стрелку тренда (↗ / ↘) рядом с числом.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const indexHtml  = readFileSync(resolve(__dirname, '..', 'index.html'),              'utf8');
const panelsSrc  = readFileSync(resolve(__dirname, '..', 'ui', 'panels.js'),         'utf8');
const turnSrc    = readFileSync(resolve(__dirname, '..', 'engine', 'turn.js'),       'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ════════════════════════════════════════════════════════════════
section('[1] HTML — canvas.res-sparkline в каждом .res-item');
// ════════════════════════════════════════════════════════════════
const reCanvas = /<canvas\s+class="res-sparkline"\s+width="44"\s+height="14">\s*<\/canvas>/g;
const canvases = indexHtml.match(reCanvas) || [];
check(canvases.length === 4,
  `[1a] ровно 4 canvas.res-sparkline (width=44, height=14) найдено: ${canvases.length}`);

// Проверяем, что каждый canvas находится внутри соответствующего res-item
for (const key of ['gold', 'troops', 'food', 'pop']) {
  const rx = new RegExp(`id="res-${key}"[^>]*>[\\s\\S]*?<canvas\\s+class="res-sparkline"`);
  check(rx.test(indexHtml), `[1b] canvas.res-sparkline внутри #res-${key}`);
}

// ════════════════════════════════════════════════════════════════
section('[2] CSS — #resource-bar .res-sparkline');
// ════════════════════════════════════════════════════════════════
const cssMatch = indexHtml.match(/#resource-bar\s+\.res-sparkline\s*\{[^}]*\}/);
check(!!cssMatch, '[2a] блок #resource-bar .res-sparkline найден');
const cssBlock = cssMatch ? cssMatch[0] : '';
check(/width\s*:\s*44px/.test(cssBlock),           '[2b] width: 44px');
check(/height\s*:\s*14px/.test(cssBlock),          '[2c] height: 14px');
check(/pointer-events\s*:\s*none/.test(cssBlock),  '[2d] pointer-events: none');

// ════════════════════════════════════════════════════════════════
section('[3] panels.js — drawSparkline / _pushResourceHistory');
// ════════════════════════════════════════════════════════════════
check(/function\s+drawSparkline\s*\(\s*canvas\s*,\s*values\s*,\s*color\s*\)/.test(panelsSrc),
  '[3a] function drawSparkline(canvas, values, color) определена');
check(/function\s+_pushResourceHistory\s*\(\s*state\s*\)/.test(panelsSrc),
  '[3b] function _pushResourceHistory(state) определена');
check(/window\.drawSparkline\s*=\s*drawSparkline/.test(panelsSrc),
  '[3c] drawSparkline экспортирован в window');
check(/window\._pushResourceHistory\s*=\s*_pushResourceHistory/.test(panelsSrc),
  '[3d] _pushResourceHistory экспортирован в window');

// ════════════════════════════════════════════════════════════════
section('[6] updateResourceBar вызывает рендер спарклайнов');
// ════════════════════════════════════════════════════════════════
check(/_renderResourceSparklines\s*\(/.test(panelsSrc),
  '[6a] updateResourceBar содержит вызов _renderResourceSparklines(...)');
check(/function\s+_renderResourceSparklines\s*\(/.test(panelsSrc),
  '[6b] _renderResourceSparklines определена');
check(/drawSparkline\s*\(/.test(panelsSrc.replace(/function\s+drawSparkline[\s\S]*?^\}/m, '')),
  '[6c] drawSparkline вызывается где-то в panels.js (кроме определения)');

// ════════════════════════════════════════════════════════════════
section('[9] engine/turn.js — _pushResourceHistory после _recordTurnSummary');
// ════════════════════════════════════════════════════════════════
check(/_recordTurnSummary\(\)[\s\S]{0,1500}_pushResourceHistory/.test(turnSrc)
   || /_pushResourceHistory[\s\S]{0,100}GAME_STATE/.test(turnSrc),
  '[9a] engine/turn.js вызывает _pushResourceHistory(GAME_STATE)');

// ════════════════════════════════════════════════════════════════
section('[10] _applyResourceDelta — стрелка тренда');
// ════════════════════════════════════════════════════════════════
const applyDelta = panelsSrc.match(/function\s+_applyResourceDelta[\s\S]*?^\}/m);
check(!!applyDelta, '[10a] блок _applyResourceDelta найден');
if (applyDelta) {
  const body = applyDelta[0];
  check(/↗/.test(body) && /↘/.test(body),
    '[10b] _applyResourceDelta использует символы ↗ / ↘');
}

// ════════════════════════════════════════════════════════════════
// Runtime — sandbox, извлекаем весь блок Шагов 21/46 и проверяем поведение
// ════════════════════════════════════════════════════════════════
section('Runtime — sandbox');

// Мини-fake Canvas 2D: считает вызовы методов.
function makeFakeCanvas(w = 44, h = 14) {
  const calls = { clearRect: 0, beginPath: 0, moveTo: 0, lineTo: 0, stroke: 0, arc: 0, fill: 0 };
  const ctx = {
    lineWidth: 0, strokeStyle: '', fillStyle: '', lineJoin: '', lineCap: '',
    clearRect(){ calls.clearRect++; },
    beginPath(){ calls.beginPath++; },
    moveTo(){ calls.moveTo++; },
    lineTo(){ calls.lineTo++; },
    stroke(){ calls.stroke++; },
    arc(){ calls.arc++; },
    fill(){ calls.fill++; },
  };
  return {
    width: w, height: h, calls,
    getContext(kind){ return kind === '2d' ? ctx : null; },
  };
}

// Простой FakeEl (достаточный для querySelector вида "#id > span:first-of-type"
// и "#id .className")
class FakeEl {
  constructor(tag = 'div') {
    this.tag = tag.toLowerCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.textContent = '';
    this.classList = {
      _set: new Set(),
      add:(c)=>this.classList._set.add(c),
      remove:(...cs)=>cs.forEach(c=>this.classList._set.delete(c)),
      toggle:(c,on)=>{ if(on)this.classList._set.add(c); else this.classList._set.delete(c); },
      contains:(c)=>this.classList._set.has(c),
    };
  }
  appendChild(c){ this.children.push(c); c.parentNode = this; return c; }
  _find(id){
    if (this.id === id) return this;
    for (const c of this.children) {
      const r = c._find?.(id);
      if (r) return r;
    }
    return null;
  }
  _findByClass(cls){
    if ((this.className||'').split(' ').includes(cls)) return this;
    for (const c of this.children) {
      const r = c._findByClass?.(cls);
      if (r) return r;
    }
    return null;
  }
  querySelector(sel){
    const firstSpan = sel.match(/^#([\w-]+)\s*>\s*span:first-of-type$/);
    const descMatch = sel.match(/^#([\w-]+)\s+\.([\w-]+)$/);
    const idMatch   = sel.match(/^#([\w-]+)$/);
    if (firstSpan) {
      const root = this._find(firstSpan[1]);
      if (!root) return null;
      return root.children.find(c => c.tag === 'span') || null;
    }
    if (descMatch) {
      const root = this._find(descMatch[1]);
      if (!root) return null;
      // Поиск ребёнка с нужным className (в т.ч. по поддереву)
      return root._findByClass(descMatch[2]);
    }
    if (idMatch) return this._find(idMatch[1]);
    return null;
  }
}

function buildFakeDoc() {
  const doc = new FakeEl('document');
  const bar = new FakeEl('div'); bar.id = 'resource-bar';
  for (const key of ['gold','troops','food','pop']) {
    const item = new FakeEl('div');
    item.id = `res-${key}`;
    item.className = 'res-item';
    const val = new FakeEl('span');
    const delta = new FakeEl('span'); delta.className = 'res-delta';
    const canvas = makeFakeCanvas(44, 14);
    canvas.tag = 'canvas';
    canvas.className = 'res-sparkline';
    canvas.children = [];
    canvas._find = function(){ return null; };
    canvas._findByClass = function(cls){
      return (this.className||'').split(' ').includes(cls) ? this : null;
    };
    item.appendChild(val);
    item.appendChild(delta);
    item.appendChild(canvas);
    bar.appendChild(item);
  }
  doc.appendChild(bar);
  doc.getElementById = (id) => doc._find(id);
  return doc;
}

// Извлекаем блок Шаг 21 + Шаг 46 целиком и выполняем в sandbox
const startIdx = panelsSrc.indexOf('Шаг 21 — РЕСУРС-БАР');
const anchor1  = panelsSrc.indexOf('const _resourceBarPrev', startIdx);
// Конец — начало следующего блока (Шаг 26 или любой другой)
let endIdx = panelsSrc.indexOf('// Шаг 26 —', anchor1);
if (endIdx < 0) endIdx = panelsSrc.indexOf('function renderPopMiniWidget', anchor1);
const snippet = panelsSrc.slice(anchor1, endIdx);

const doc = buildFakeDoc();
const sandbox = {
  document: doc,
  console,
  window: {},
  showTreasuryOverlay:  () => {},
  showEconomyOverlay:   () => {},
  showPopulationOverlay:() => {},
  renderLeftPanelTab:   () => {},
};
sandbox.window.document = doc;

try {
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
} catch (e) {
  console.error('sandbox error:', e);
}

const drawSparkline        = sandbox.drawSparkline        || sandbox.window.drawSparkline;
const _pushResourceHistory = sandbox._pushResourceHistory || sandbox.window._pushResourceHistory;
const updateResourceBar    = sandbox.updateResourceBar    || sandbox.window.updateResourceBar;

check(typeof drawSparkline === 'function',         '[R1] drawSparkline извлечён и доступен');
check(typeof _pushResourceHistory === 'function',  '[R2] _pushResourceHistory извлечён и доступен');
check(typeof updateResourceBar === 'function',     '[R3] updateResourceBar извлечён и доступен');

// ── [7] drawSparkline на малом количестве точек очищает и ничего не рисует
section('[7] drawSparkline: < 2 точек → очистка без рисования');
{
  const c = makeFakeCanvas();
  drawSparkline(c, [], '#888');
  check(c.calls.clearRect === 1 && c.calls.stroke === 0 && c.calls.arc === 0,
    '[7a] values=[] → clearRect=1, stroke=0, arc=0');

  const c2 = makeFakeCanvas();
  drawSparkline(c2, [42], '#888');
  check(c2.calls.clearRect === 1 && c2.calls.stroke === 0,
    '[7b] values=[42] → clearRect=1, stroke=0');
}

// ── [8] drawSparkline с нормальной серией — рисует полилинию и маркер
section('[8] drawSparkline: нормальная серия → polyline + marker');
{
  const c = makeFakeCanvas();
  drawSparkline(c, [1, 2, 3, 4, 5], '#4CAF50');
  check(c.calls.clearRect === 1, '[8a] clearRect вызывается');
  check(c.calls.beginPath >= 2,  '[8b] beginPath вызывается ≥ 2 (линия + круг)');
  check(c.calls.moveTo === 1,    '[8c] moveTo вызывается ровно 1 раз');
  check(c.calls.lineTo === 4,    '[8d] lineTo вызывается (n-1)=4 раза');
  check(c.calls.stroke === 1,    '[8e] stroke для полилинии');
  check(c.calls.arc === 1,       '[8f] arc для маркера последней точки');
  check(c.calls.fill === 1,      '[8g] fill для маркера');
}

// ── [4][5] _pushResourceHistory создаёт state.history и обрезает до 10
section('[4][5] _pushResourceHistory — history и обрезание');
{
  const state = {
    turn: 0, player_nation: 'ATH',
    nations: {
      ATH: {
        economy:    { treasury: 1000, stockpile: { wheat: 100 } },
        military:   { infantry: 500, cavalry: 0, ships: 0, mercenaries: 0 },
        population: { total: 20000 },
      },
    },
  };

  check(!state.history, '[4-pre] до вызова state.history отсутствует');
  _pushResourceHistory(state);
  check(!!state.history, '[4a] state.history создан');
  check(Array.isArray(state.history.treasury)
     && Array.isArray(state.history.army_size)
     && Array.isArray(state.history.population)
     && Array.isArray(state.history.food),
    '[4b] history.{treasury,army_size,population,food} — массивы');
  check(state.history.treasury.length   === 1
     && state.history.army_size.length  === 1
     && state.history.population.length === 1
     && state.history.food.length       === 1,
    '[5a] после 1 push каждый массив имеет длину 1');

  // Прогоняем 12 дополнительных ходов, меняя значения
  for (let i = 0; i < 12; i++) {
    state.nations.ATH.economy.treasury += 10;
    state.nations.ATH.military.infantry += 5;
    _pushResourceHistory(state);
  }
  check(state.history.treasury.length === 10,
    '[5b] после 13 push-ей treasury.length == 10 (обрезан)');
  check(state.history.army_size.length === 10,
    '[5c] army_size тоже обрезан до 10');
  check(state.history.treasury[9] > state.history.treasury[0],
    '[5d] первым значением оказывается более старое, последним — более новое');
}

// ── [R] updateResourceBar после _pushResourceHistory → рисует спарклайны
section('[R] updateResourceBar рисует спарклайны (интеграция)');
{
  const state = {
    turn: 1, player_nation: 'ATH',
    nations: {
      ATH: {
        economy:    { treasury: 1500, stockpile: { wheat: 200, fish: 50 } },
        military:   { infantry: 500, cavalry: 100, ships: 10, mercenaries: 0 },
        population: { total: 25000 },
      },
    },
  };
  // Наполняем историю несколькими ходами
  for (let i = 0; i < 5; i++) {
    state.nations.ATH.economy.treasury += 100;
    state.nations.ATH.military.infantry += 10;
    state.nations.ATH.population.total  += 200;
    _pushResourceHistory(state);
  }

  // Снимаем счётчики всех 4-х канвасов ДО updateResourceBar, проверяем дельту.
  const canvases = ['gold','troops','food','pop'].map(k => doc._find(`res-${k}`).children[2]);
  const before = canvases.map(c => ({...c.calls}));

  updateResourceBar(state);

  const after = canvases.map(c => c.calls);
  const drewAll = after.every((a, i) => a.clearRect > before[i].clearRect
                                    &&  a.stroke    > before[i].stroke);
  check(drewAll, '[R4] updateResourceBar → drawSparkline вызван для всех 4 канвасов');
}

// ── [10] Стрелка тренда в дельте после смены хода
section('[10] Стрелка тренда в _applyResourceDelta');
{
  // Используем большие номера ходов, чтобы смена хода сдвинула baseline
  // поверх значений, оставшихся в _resourceBarPrev от предыдущих секций.
  const state1 = {
    turn: 100, player_nation: 'ATH',
    nations: {
      ATH: {
        economy:    { treasury: 1500, stockpile: { wheat: 200 } },
        military:   { infantry: 500, cavalry: 0, ships: 0, mercenaries: 0 },
        population: { total: 20000 },
      },
    },
  };
  updateResourceBar(state1);               // при смене хода сдвигает baseline к state1
  const state2 = JSON.parse(JSON.stringify(state1));
  state2.turn = 101;
  state2.nations.ATH.economy.treasury = 1800;   // +300 → ↗
  state2.nations.ATH.military.infantry = 480;   // -20  → ↘
  updateResourceBar(state2);

  const goldDelta   = doc._find('res-gold').children[1];
  const troopsDelta = doc._find('res-troops').children[1];
  check(/↗/.test(goldDelta.textContent),   '[10c] treasury вырос → текст содержит ↗');
  check(/↘/.test(troopsDelta.textContent), '[10d] troops упал → текст содержит ↘');
  // Совместимость с Шагом 21: знак в начале
  check(/^\+/.test(goldDelta.textContent),   '[10e] текст gold начинается с "+" (совместимость Шаг 21)');
  check(/^-/.test(troopsDelta.textContent),  '[10f] текст troops начинается с "-" (совместимость Шаг 21)');
}

// ════════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
