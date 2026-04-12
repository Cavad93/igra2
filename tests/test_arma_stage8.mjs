// Тесты Шага 8 (arma.md) — River rendering: Chaikin + Bezier-кривые в Pixi.js
// Запуск: node tests/test_arma_stage8.mjs
//
// Чеклист из arma.md Шаг 8:
//   [1] renderRivers добавляет по одному Graphics на реку в layers.rivers.
//   [2] layers.rivers.children.length === количеству рек (валидных).
//   [3] Маппинг heightmap → экран корректен: (hm_x/hmW)*screenW и т.д.
//   [4] Chaikin сглаживает путь (>= 3 итерации), крайние точки сохранены.
//   [5] Catmull-Rom → Bezier: первый moveTo == первая точка, последняя
//       bezierCurveTo оканчивается в последней точке.
//   [6] Ширина линии в stroke() клэмпится в [1, 3] px.
//   [7] Пустой список / короткие пути — без краша.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const riversPath = resolve(__dirname, '..', 'engine', 'rivers.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Container + Graphics (с записью операций) + Sprite
// ──────────────────────────────────────────────────────────
class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
  }
  addChild(child) { this.children.push(child); return child; }
}

class FakePIXIGraphics {
  constructor() {
    this.ops = [];            // { type: 'moveTo'|'lineTo'|'bezierCurveTo'|'stroke', ... }
    this._strokes = [];
  }
  moveTo(x, y)  { this.ops.push({ type: 'moveTo', x, y }); return this; }
  lineTo(x, y)  { this.ops.push({ type: 'lineTo', x, y }); return this; }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.ops.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    return this;
  }
  stroke(style) {
    this.ops.push({ type: 'stroke', style });
    this._strokes.push(style);
    return this;
  }
}

class FakePIXISprite {
  constructor(texture) { this.texture = texture; this.width = 0; this.height = 0; }
}

const FakePIXITexture = { from(source) { return { _source: source }; } };

const fakePIXI = {
  Container: FakePIXIContainer,
  Graphics:  FakePIXIGraphics,
  Sprite:    FakePIXISprite,
  Texture:   FakePIXITexture
};

// ──────────────────────────────────────────────────────────
// Минимальный fake document (для buildTerrainCanvas и т.п.)
// ──────────────────────────────────────────────────────────
const fakeDocument = {
  createElement() { return { width: 0, height: 0, getContext: () => null }; }
};

// ──────────────────────────────────────────────────────────
// VM-контекст
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  require: undefined,
  console,
  Number, Math, Float32Array, Uint8Array, Uint8ClampedArray, Int32Array,
  Array, Object, Error, Infinity, parseInt,
  document: fakeDocument,
  PIXI:     fakePIXI
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// 1. noise.js
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;
ctx.mulberry32        = noiseExports.mulberry32;
ctx.getHeight         = noiseExports.getHeight;
ctx.PerlinNoise       = noiseExports.PerlinNoise;
ctx.fbm               = noiseExports.fbm;
ctx.domainWarp        = noiseExports.domainWarp;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// 2. rivers.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(riversPath, 'utf8'), ctx, { filename: riversPath });
const riversExports = ctx.module.exports;
ctx.traceRiver     = riversExports.traceRiver;
ctx.generateRivers = riversExports.generateRivers;

// 3. battle_map_pixi.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const {
  chaikinSmooth,
  mapRiverPathToScreen,
  drawCatmullRomBezier,
  renderRivers
} = pixiExports;
const { generateHeightmap } = noiseExports;
const { generateRivers }    = riversExports;

// ──────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

console.log('═══ Шаг 8 (arma.md) — renderRivers ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('chaikinSmooth is a function',         () => assert(typeof chaikinSmooth === 'function'));
test('mapRiverPathToScreen is a function',  () => assert(typeof mapRiverPathToScreen === 'function'));
test('drawCatmullRomBezier is a function',  () => assert(typeof drawCatmullRomBezier === 'function'));
test('renderRivers is a function',          () => assert(typeof renderRivers === 'function'));

// ── mapRiverPathToScreen ───────────────────────────────
console.log('\n[mapRiverPathToScreen]');

test('пропорция heightmap → экран корректна', () => {
  const path = [{ x: 0, y: 0 }, { x: 128, y: 64 }, { x: 256, y: 128 }];
  const mapped = mapRiverPathToScreen(path, 256, 128, 800, 600);
  assert(mapped.length === 3);
  assert(approx(mapped[0].x, 0)   && approx(mapped[0].y, 0));
  assert(approx(mapped[1].x, 400) && approx(mapped[1].y, 300));
  assert(approx(mapped[2].x, 800) && approx(mapped[2].y, 600));
});

test('пустой path → []', () => {
  assert(mapRiverPathToScreen([], 10, 10, 100, 100).length === 0);
});

test('hmW / hmH == 0 → []', () => {
  assert(mapRiverPathToScreen([{x:1,y:1}], 0, 10, 100, 100).length === 0);
  assert(mapRiverPathToScreen([{x:1,y:1}], 10, 0, 100, 100).length === 0);
});

// ── chaikinSmooth ──────────────────────────────────────
console.log('\n[chaikinSmooth]');

test('сохраняет крайние точки после 3 итераций', () => {
  const path = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }
  ];
  const s = chaikinSmooth(path, 3);
  assert(s[0].x === 0 && s[0].y === 0, 'first lost');
  const last = s[s.length - 1];
  assert(last.x === 30 && last.y === 10, 'last lost');
});

test('увеличивает число точек за каждую итерацию', () => {
  const path = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }
  ];
  const s0 = chaikinSmooth(path, 0);
  const s1 = chaikinSmooth(path, 1);
  const s2 = chaikinSmooth(path, 2);
  const s3 = chaikinSmooth(path, 3);
  assert(s0.length === path.length, 's0=' + s0.length);
  assert(s1.length > s0.length,      's1=' + s1.length);
  assert(s2.length > s1.length,      's2=' + s2.length);
  assert(s3.length > s2.length,      's3=' + s3.length);
});

test('сглаживает зигзаг: max |Δy| после 3 итераций меньше исходного', () => {
  const raw = [];
  for (let i = 0; i < 20; i++) {
    raw.push({ x: i, y: i % 2 ? 10 : 0 });   // пила 0/10
  }
  const s = chaikinSmooth(raw, 3);
  let rawMaxDy = 0, sMaxDy = 0;
  for (let i = 1; i < raw.length; i++) rawMaxDy = Math.max(rawMaxDy, Math.abs(raw[i].y - raw[i-1].y));
  for (let i = 1; i < s.length;  i++) sMaxDy   = Math.max(sMaxDy,   Math.abs(s[i].y   - s[i-1].y));
  assert(sMaxDy < rawMaxDy, `smoothed maxDy=${sMaxDy} not less than raw=${rawMaxDy}`);
});

test('пустой / короткий вход не крашит', () => {
  assert(chaikinSmooth([], 3).length === 0);
  assert(chaikinSmooth([{x:1,y:1}], 3).length === 1);
  assert(chaikinSmooth([{x:1,y:1},{x:2,y:2}], 3).length === 2);
});

// ── drawCatmullRomBezier ──────────────────────────────
console.log('\n[drawCatmullRomBezier]');

test('первый op === moveTo(p[0])', () => {
  const g = new FakePIXIGraphics();
  const pts = [{x:0,y:0},{x:10,y:5},{x:20,y:0},{x:30,y:5}];
  drawCatmullRomBezier(g, pts);
  assert(g.ops[0].type === 'moveTo', 'first op=' + g.ops[0].type);
  assert(g.ops[0].x === 0 && g.ops[0].y === 0);
});

test('число bezierCurveTo === n - 1 (кроме n=2)', () => {
  const g = new FakePIXIGraphics();
  const pts = [{x:0,y:0},{x:10,y:5},{x:20,y:0},{x:30,y:5},{x:40,y:10}];
  drawCatmullRomBezier(g, pts);
  const bezOps = g.ops.filter(o => o.type === 'bezierCurveTo');
  assert(bezOps.length === pts.length - 1, 'bezier count=' + bezOps.length);
});

test('последний bezierCurveTo заканчивается в последней точке', () => {
  const g = new FakePIXIGraphics();
  const pts = [{x:0,y:0},{x:10,y:5},{x:20,y:0},{x:30,y:5}];
  drawCatmullRomBezier(g, pts);
  const last = g.ops[g.ops.length - 1];
  assert(last.type === 'bezierCurveTo');
  assert(last.x === 30 && last.y === 5, `end=${last.x},${last.y}`);
});

test('n === 2 → moveTo + lineTo', () => {
  const g = new FakePIXIGraphics();
  drawCatmullRomBezier(g, [{x:1,y:2},{x:5,y:6}]);
  assert(g.ops.length === 2);
  assert(g.ops[0].type === 'moveTo' && g.ops[1].type === 'lineTo');
  assert(g.ops[1].x === 5 && g.ops[1].y === 6);
});

test('n < 2 → ничего не рисует', () => {
  const g = new FakePIXIGraphics();
  drawCatmullRomBezier(g, []);
  drawCatmullRomBezier(g, [{x:0,y:0}]);
  assert(g.ops.length === 0);
});

// ── renderRivers ──────────────────────────────────────
console.log('\n[renderRivers]');

function makeApp(w, h) { return { screen: { width: w, height: h } }; }
function makeLayers()  { return { rivers: new FakePIXIContainer() }; }

test('добавляет по одному Graphics на реку в layers.rivers', () => {
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const rivers = [
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20},{x:30,y:30}], width: 2 },
    { path: [{x:5,y:0},{x:15,y:5},{x:25,y:10},{x:35,y:15},{x:45,y:20}], width: 1.5 }
  ];
  const gs = renderRivers(app, layers, rivers, 256, 256);
  assert(gs.length === 2, 'returned=' + gs.length);
  assert(layers.rivers.children.length === 2, 'children=' + layers.rivers.children.length);
  assert(gs[0] instanceof FakePIXIGraphics, 'not Graphics');
  assert(layers.rivers.children[0] === gs[0]);
});

test('stroke() вызван ровно 1 раз на реку', () => {
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const rivers = [
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20},{x:30,y:30}], width: 2 }
  ];
  const [g] = renderRivers(app, layers, rivers, 100, 100);
  const strokes = g.ops.filter(o => o.type === 'stroke');
  assert(strokes.length === 1, 'strokes=' + strokes.length);
  const s = strokes[0].style;
  assert(s.color === 0x2a5a8a, 'color=' + s.color.toString(16));
  assert(s.alpha === 1.0,      'alpha=' + s.alpha);
});

test('width клэмпится в [1, 3] px', () => {
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const rivers = [
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20}], width: 0.4 },   // → 1
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20}], width: 2.3 },   // → 2.3
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20}], width: 7.8 }    // → 3
  ];
  const gs = renderRivers(app, layers, rivers, 100, 100);
  const widths = gs.map(g => g._strokes[0].width);
  assert(widths[0] === 1,   'w0=' + widths[0]);
  assert(Math.abs(widths[1] - 2.3) < 1e-9, 'w1=' + widths[1]);
  assert(widths[2] === 3,   'w2=' + widths[2]);
});

test('маппинг применяется: ops содержат экранные координаты', () => {
  const app    = makeApp(1000, 500);
  const layers = makeLayers();
  const rivers = [
    { path: [{x:0,y:0},{x:50,y:25},{x:100,y:50}], width: 1.5 }
  ];
  const [g] = renderRivers(app, layers, rivers, 100, 50);
  // screen: x∈[0,1000], y∈[0,500]; первый moveTo в (0,0), после
  // Chaikin крайние точки сохраняются, значит moveTo(0,0).
  const mv = g.ops.find(o => o.type === 'moveTo');
  assert(mv.x === 0 && mv.y === 0, `moveTo=${mv.x},${mv.y}`);
  // Самая дальняя x-координата в ops должна быть ≤ 1000 и достигать его
  let maxX = -Infinity, maxY = -Infinity;
  for (const o of g.ops) {
    if (o.type === 'bezierCurveTo' || o.type === 'moveTo' || o.type === 'lineTo') {
      maxX = Math.max(maxX, o.x);
      maxY = Math.max(maxY, o.y);
    }
  }
  assert(Math.abs(maxX - 1000) < 1e-6, 'maxX=' + maxX);
  assert(Math.abs(maxY - 500)  < 1e-6, 'maxY=' + maxY);
});

test('пустой rivers → 0 детей, без краша', () => {
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const gs = renderRivers(app, layers, [], 100, 100);
  assert(gs.length === 0 && layers.rivers.children.length === 0);
});

test('пропускает реки с <2 точек', () => {
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const rivers = [
    { path: [], width: 1 },
    { path: [{x:1,y:1}], width: 1 },
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20}], width: 1 }
  ];
  const gs = renderRivers(app, layers, rivers, 100, 100);
  assert(gs.length === 1, 'got ' + gs.length);
});

test('валидация: throw если layers.rivers отсутствует', () => {
  let threw = false;
  try { renderRivers({ screen: { width: 1, height: 1 } }, {}, [], 10, 10); }
  catch (e) { threw = true; }
  assert(threw, 'no throw');
});

test('валидация: throw при нулевых hmW/hmH', () => {
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  let threw = false;
  try { renderRivers(app, layers, [{path:[{x:0,y:0},{x:1,y:1}], width:1}], 0, 10); }
  catch (e) { threw = true; }
  assert(threw, 'no throw on hmW=0');
});

// ── Интеграция: generateRivers → renderRivers ─────────
console.log('\n[integration generateRivers → renderRivers]');

test('heightmap 256×256: layers.rivers.children.length == rivers.length', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  assert(rivers.length >= 1, 'no rivers');
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  renderRivers(app, layers, rivers, hm.width, hm.height);
  assert(layers.rivers.children.length === rivers.length,
    `children=${layers.rivers.children.length} rivers=${rivers.length}`);
});

test('все Graphics содержат stroke() и хотя бы один bezierCurveTo', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const gs = renderRivers(app, layers, rivers, hm.width, hm.height);
  for (const g of gs) {
    const hasStroke = g.ops.some(o => o.type === 'stroke');
    const hasBez    = g.ops.some(o => o.type === 'bezierCurveTo');
    assert(hasStroke, 'no stroke');
    assert(hasBez,    'no bezierCurveTo');
  }
});

test('ширина stroke всех рек ∈ [1, 3]', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  const app    = makeApp(800, 600);
  const layers = makeLayers();
  const gs = renderRivers(app, layers, rivers, hm.width, hm.height);
  for (const g of gs) {
    const w = g._strokes[0].width;
    assert(w >= 1 && w <= 3, 'w=' + w);
  }
});

// ── Итог ──────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
