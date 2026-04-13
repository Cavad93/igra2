'use strict';
// ════════════════════════════════════════════════════
// ШАГ 42 — Анимированные торговые маршруты (unit test)
// Проверяет:
//   - категоризация груза по избыткам (grain/metal/luxury/general);
//   - формула ширины линии weight = 1 + volume/500 (капнутая);
//   - renderTradeRouteLines создаёт polyline с className,
//     dashArray="6 8", svg-рендерером и корректным цветом-классом;
//   - при _hasWorldMarketAccess добавляется линия world;
//   - clearTradeRouteLines удаляет все линии;
//   - CSS-стили анимации присутствуют в index.html.
// ════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

let passed = 0, failed = 0;
const fail = (name, detail) => { console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); failed++; };
const ok   = (name)         => { console.log (`  ✓ ${name}`); passed++; };
const assert = (cond, name, detail) => cond ? ok(name) : fail(name, detail);

// ─── 1. index.html содержит CSS Шага 42 ────────────
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
assert(/\.trade-route-path\s*\{/.test(html), 'CSS .trade-route-path объявлен');
assert(/@keyframes\s+tradeFlow/.test(html),  'CSS @keyframes tradeFlow объявлен');
assert(/stroke-dashoffset\s*:\s*-14/.test(html), 'Анимация смещения stroke-dashoffset до -14');
assert(/\.trade-route-path\.grain\s*\{[^}]*#a5d6a7/.test(html), 'Цвет grain = #a5d6a7');
assert(/\.trade-route-path\.metal\s*\{[^}]*#b0bec5/.test(html), 'Цвет metal = #b0bec5');
assert(/\.trade-route-path\.luxury\s*\{[^}]*#ce93d8/.test(html),'Цвет luxury = #ce93d8');
assert(/\.trade-route-path\.general\s*\{[^}]*#d4a853/.test(html),'Цвет general = #d4a853');
assert(/prefers-reduced-motion/.test(html), 'Учёт prefers-reduced-motion');

// ─── 2. map.js содержит svgTradeRenderer и логику ───
const mapPath = path.join(__dirname, '..', 'ui', 'map.js');
const mapSrc  = fs.readFileSync(mapPath, 'utf8');
assert(/svgTradeRenderer\s*=\s*L\.svg/.test(mapSrc),               'svgTradeRenderer = L.svg()');
assert(/_classifyTradeRoute/.test(mapSrc),                         'Функция _classifyTradeRoute есть');
assert(/className:\s*`trade-route-path/.test(mapSrc),              'className задаётся на polyline');
assert(/dashArray:\s*'6 8'/.test(mapSrc),                          'dashArray = "6 8"');
assert(/renderer:\s*svgTradeRenderer/.test(mapSrc),                'Polyline использует svgTradeRenderer');
assert(/1\s*\+\s*volume\s*\/\s*500/.test(mapSrc),                  'Формула weight = 1 + volume/500 (Шаг 42)');

// ─── 3. Логический тест: sandbox с минимальным L ───
// Извлекаем и выполняем только нужные функции в изолированном окружении.
const extract = (name) => {
  const re = new RegExp(`function ${name}\\s*\\([^]*?\\n\\}`, 'm');
  const m = mapSrc.match(re);
  return m ? m[0] : null;
};
const src = [
  'const _TRADE_CATEGORY = ' +
    mapSrc.match(/const _TRADE_CATEGORY = \{[^]*?\};/m)[0].replace(/^const _TRADE_CATEGORY = /, ''),
  ';',
  extract('_classifyTradeRoute'),
  extract('_getRegionGroupCenter'),
  extract('_estimateRouteIncome'),
  extract('_buildRouteTooltip'),
  extract('_hasWorldMarketAccess'),
  extract('renderTradeRouteLines'),
  extract('clearTradeRouteLines'),
].join('\n');

// Минимальный мок Leaflet
const captured = [];
const mockL = {
  svg:    () => ({ kind: 'svg' }),
  canvas: () => ({ kind: 'canvas' }),
  polyline: (latlngs, opts) => {
    const layer = {
      latlngs, opts,
      bindTooltip() { return this; },
      addTo(map) { map._layers.push(this); return this; },
    };
    captured.push(layer);
    return layer;
  },
};
const sandbox = {
  L: mockL,
  leafletMap: { _layers: [], hasLayer: (l) => sandbox.leafletMap._layers.includes(l),
                removeLayer: (l) => { const i = sandbox.leafletMap._layers.indexOf(l); if (i>=0) sandbox.leafletMap._layers.splice(i,1); } },
  MAP_REGIONS: {
    'r1': { center: [40, 14], terrain: 'coastal_city' },
    'r2': { center: [38, 12], terrain: 'plain'        },
    'r3': { center: [36, 20], terrain: 'plain'        },
  },
  svgTradeRenderer: { kind: 'svg' },
  tradeRouteLines: [],
  getRelationScore: undefined,
  GAME_STATE: null,
  window: {},
  console,
};
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox);
} catch (e) {
  fail('Извлечение + sandbox-компиляция функций', e.message);
}

// Сценарий 1: player с избытком зерна → категория grain, ширина по volume
sandbox.window.GAME_STATE = sandbox.GAME_STATE = {
  player_nation: 'p',
  nations: {
    p: {
      id: 'p', name: 'Player', regions: ['r1'],
      economy: { stockpile: { wheat: 600, iron: 200, wine: 120 }, trade_routes: ['q'], treasury: 1000 },
      relations: {},
    },
    q: { id: 'q', name: 'Partner', regions: ['r2'], economy: { stockpile: {}, trade_routes: [] }, relations: {} },
  },
  market: {},
};
sandbox.tradeRouteLines.length = 0;
sandbox.leafletMap._layers.length = 0;
captured.length = 0;
sandbox.window.GAME_STATE = sandbox.GAME_STATE;
vm.runInContext('renderTradeRouteLines();', sandbox);

const partnerLines = captured.filter(c => c.opts.className && !/world/.test(c.opts.className));
assert(partnerLines.length === 1, 'Одна линия к партнёру создана', `got=${partnerLines.length}`);
if (partnerLines.length === 1) {
  const l = partnerLines[0];
  assert(l.opts.className.includes('trade-route-path'), 'className содержит trade-route-path');
  assert(l.opts.className.includes('grain'),            'className grain (wheat=600)');
  assert(l.opts.dashArray === '6 8',                    'dashArray=6 8');
  assert(l.opts.renderer?.kind === 'svg',               'renderer = svg');
  // volume = 600+200+120 = 920 → weight = 1 + 920/500 = 2.84
  const expected = 1 + 920/500;
  assert(Math.abs(l.opts.weight - expected) < 0.01,     'weight = 1 + volume/500', `got=${l.opts.weight} exp=${expected}`);
}
// player на coastal_city + наличие trade_routes → должна быть world-линия
const worldLine = captured.find(c => /world/.test(c.opts.className || ''));
assert(!!worldLine, 'World-market линия создана (coastal + trade_routes)');

// Сценарий 2: избыток iron → metal
sandbox.GAME_STATE.nations.p.economy.stockpile = { iron: 800, tools: 200 };
sandbox.tradeRouteLines.length = 0;
sandbox.leafletMap._layers.length = 0;
captured.length = 0;
sandbox.window.GAME_STATE = sandbox.GAME_STATE;
vm.runInContext('renderTradeRouteLines();', sandbox);
const metalLine = captured.find(c => /metal/.test(c.opts.className || ''));
assert(!!metalLine, 'iron → категория metal');

// Сценарий 3: избыток wine → luxury
sandbox.GAME_STATE.nations.p.economy.stockpile = { wine: 500, pottery: 150 };
sandbox.tradeRouteLines.length = 0;
sandbox.leafletMap._layers.length = 0;
captured.length = 0;
sandbox.window.GAME_STATE = sandbox.GAME_STATE;
vm.runInContext('renderTradeRouteLines();', sandbox);
const luxLine = captured.find(c => /luxury/.test(c.opts.className || ''));
assert(!!luxLine, 'wine → категория luxury');

// Сценарий 4: пустой stockpile → general + минимальная ширина
sandbox.GAME_STATE.nations.p.economy.stockpile = {};
sandbox.tradeRouteLines.length = 0;
sandbox.leafletMap._layers.length = 0;
captured.length = 0;
sandbox.window.GAME_STATE = sandbox.GAME_STATE;
vm.runInContext('renderTradeRouteLines();', sandbox);
const genLine = captured.find(c => /general/.test(c.opts.className || '') && !/world/.test(c.opts.className));
assert(!!genLine, 'Пустой stockpile → категория general');
if (genLine) {
  assert(genLine.opts.weight >= 1.0 && genLine.opts.weight <= 6.0, 'weight в диапазоне [1, 6]', `got=${genLine.opts.weight}`);
}

// Сценарий 5: ширина капнута (объём > 2500)
sandbox.GAME_STATE.nations.p.economy.stockpile = { wheat: 5000, barley: 3000, salt: 2000 };
sandbox.tradeRouteLines.length = 0;
sandbox.leafletMap._layers.length = 0;
captured.length = 0;
sandbox.window.GAME_STATE = sandbox.GAME_STATE;
vm.runInContext('renderTradeRouteLines();', sandbox);
const fatLine = captured.find(c => /trade-route-path/.test(c.opts.className || '') && !/world/.test(c.opts.className));
assert(fatLine && fatLine.opts.weight === 6, 'weight капнуто на 6 для большого объёма', `got=${fatLine?.opts.weight}`);

// Сценарий 6: clearTradeRouteLines очищает
vm.runInContext('clearTradeRouteLines();', sandbox);
assert(sandbox.tradeRouteLines.length === 0, 'clearTradeRouteLines() очищает список');

// ─── Итог ───────────────────────────────────────────
console.log(`\n──────────── ИТОГО: ${passed} passed, ${failed} failed ────────────`);
if (failed > 0) process.exit(1);
