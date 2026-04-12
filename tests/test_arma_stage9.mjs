// Тесты Шага 9 (arma.md) — River polish: двойная линия + sparkle анимация
// Запуск: node tests/test_arma_stage9.mjs
//
// Чеклист из arma.md Шаг 9:
//   [1] Реки имеют визуальную глубину — двойная линия:
//         outer: width+2, 0x1a3a5a, α=0.9  (тень)
//         inner: width,   0x4a8abf, α=0.7  (цвет воды)
//   [2] Анимация бликов движется во времени: sparkle.x/y меняется
//       при разных t.
//   [3] Sparkle-graphics использует ticker, общее число бликов
//       bounded (<= 200 по умолчанию, FPS-budget).
//   [4] renderRiversPolished добавляет по 1 группе-Container на реку,
//       в каждой — ровно 2 Graphics (outer, inner).
//   [5] Пустые/короткие реки — без краша.
//   [6] Ширина клэмпится в [1, 3].
//   [7] startRiverSparkleTicker возвращает stop(), снимающий handler.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const riversPath = resolve(__dirname, '..', 'engine', 'rivers.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI
// ──────────────────────────────────────────────────────────
class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
    this.parent = null;
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) { this.children.splice(i, 1); child.parent = null; }
    return child;
  }
}

class FakePIXIGraphics {
  constructor() {
    this.parent = null;
    this.ops = [];        // moveTo / lineTo / bezierCurveTo / circle / fill / stroke / clear
    this._strokes = [];
    this._fills   = [];
    this._circles = [];
  }
  moveTo(x, y)  { this.ops.push({ type: 'moveTo', x, y });  return this; }
  lineTo(x, y)  { this.ops.push({ type: 'lineTo', x, y });  return this; }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.ops.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    return this;
  }
  stroke(style) { this.ops.push({ type: 'stroke', style }); this._strokes.push(style); return this; }
  circle(x, y, r) { this.ops.push({ type: 'circle', x, y, r }); this._circles.push({ x, y, r }); return this; }
  fill(style) { this.ops.push({ type: 'fill', style }); this._fills.push(style); return this; }
  clear() {
    this.ops.push({ type: 'clear' });
    this._strokes = []; this._fills = []; this._circles = [];
    return this;
  }
}

class FakePIXISprite { constructor(texture) { this.texture = texture; this.width = 0; this.height = 0; } }
const FakePIXITexture = { from(src) { return { _source: src }; } };

// Минимальный fake ticker (для тестов handler'а)
class FakeTicker {
  constructor() { this.handlers = []; }
  add(fn) { this.handlers.push(fn); return this; }
  remove(fn) {
    const i = this.handlers.indexOf(fn);
    if (i >= 0) this.handlers.splice(i, 1);
    return this;
  }
  tick(dtMs) {
    const fake = { deltaMS: dtMs };
    for (const h of this.handlers) h(fake);
  }
}

const fakePIXI = {
  Container: FakePIXIContainer,
  Graphics:  FakePIXIGraphics,
  Sprite:    FakePIXISprite,
  Texture:   FakePIXITexture
};

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
  Array, Object, Error, Infinity, parseInt, isNaN, isFinite,
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
  renderRiversPolished,
  buildRiverSparkles,
  sampleSparklePosition,
  drawRiverSparkles,
  startRiverSparkleTicker
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

function makeApp(w, h) {
  return { screen: { width: w, height: h }, ticker: new FakeTicker() };
}
function makeLayers() {
  return { rivers: new FakePIXIContainer() };
}

console.log('═══ Шаг 9 (arma.md) — River polish (double line + sparkles) ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');
test('renderRiversPolished is a function',   () => assert(typeof renderRiversPolished === 'function'));
test('buildRiverSparkles is a function',     () => assert(typeof buildRiverSparkles === 'function'));
test('sampleSparklePosition is a function',  () => assert(typeof sampleSparklePosition === 'function'));
test('drawRiverSparkles is a function',      () => assert(typeof drawRiverSparkles === 'function'));
test('startRiverSparkleTicker is a function',() => assert(typeof startRiverSparkleTicker === 'function'));

// ── renderRiversPolished: двойная линия ────────────────
console.log('\n[renderRiversPolished — двойная линия]');

const sampleRivers = [
  { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20},{x:30,y:30}], width: 2 },
  { path: [{x:5,y:0},{x:15,y:5},{x:25,y:10},{x:35,y:15},{x:45,y:20}], width: 1.5 }
];

test('добавляет по 1 группе-Container на реку в layers.rivers', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  assert(groups.length === 2, 'groups=' + groups.length);
  assert(layers.rivers.children.length === 2);
  assert(groups[0] instanceof FakePIXIContainer, 'not Container');
});

test('каждая группа содержит ровно 2 Graphics (outer + inner)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  for (const g of groups) {
    assert(g.children.length === 2, 'children=' + g.children.length);
    assert(g.children[0] instanceof FakePIXIGraphics);
    assert(g.children[1] instanceof FakePIXIGraphics);
  }
});

test('outer = dark тень (width+2, 0x1a3a5a, α=0.9)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const g0outer = groups[0].children[0];
  const s = g0outer._strokes[0];
  assert(s.color === 0x1a3a5a, 'color=' + s.color.toString(16));
  assert(Math.abs(s.alpha - 0.9) < 1e-9, 'alpha=' + s.alpha);
  // river.width=2 → clamped 2 → outer = 4
  assert(s.width === 4, 'outer width=' + s.width);
});

test('inner = light вода (width, 0x4a8abf, α=0.7)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const g0inner = groups[0].children[1];
  const s = g0inner._strokes[0];
  assert(s.color === 0x4a8abf, 'color=' + s.color.toString(16));
  assert(Math.abs(s.alpha - 0.7) < 1e-9, 'alpha=' + s.alpha);
  assert(s.width === 2, 'inner width=' + s.width);
});

test('outer всегда шире inner (визуальная глубина)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  for (const g of groups) {
    const wOuter = g.children[0]._strokes[0].width;
    const wInner = g.children[1]._strokes[0].width;
    assert(wOuter > wInner, `outer=${wOuter} inner=${wInner}`);
  }
});

test('ширина inner клэмпится в [1, 3]', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const rivers = [
    { path: [{x:0,y:0},{x:5,y:5},{x:10,y:10}], width: 0.4 },  // → 1
    { path: [{x:0,y:0},{x:5,y:5},{x:10,y:10}], width: 2.3 },  // → 2.3
    { path: [{x:0,y:0},{x:5,y:5},{x:10,y:10}], width: 7.8 }   // → 3
  ];
  const groups = renderRiversPolished(app, layers, rivers, 100, 100);
  const inners = groups.map(g => g.children[1]._strokes[0].width);
  assert(inners[0] === 1);
  assert(Math.abs(inners[1] - 2.3) < 1e-9);
  assert(inners[2] === 3);
});

test('group._smoothed сохранён (для sparkle-анимации)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  for (const g of groups) {
    assert(Array.isArray(g._smoothed), 'no _smoothed');
    assert(g._smoothed.length >= 2, '_smoothed len=' + g._smoothed.length);
    assert(typeof g._baseWidth === 'number');
  }
});

test('пропускает реки с <2 точек, не крашит на пустом списке', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  assert(renderRiversPolished(app, layers, [], 100, 100).length === 0);
  const g2 = renderRiversPolished(app, layers, [
    { path: [], width: 1 },
    { path: [{x:1,y:1}], width: 1 },
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:20}], width: 1 }
  ], 100, 100);
  assert(g2.length === 1, 'got ' + g2.length);
});

test('валидация: throw если layers.rivers отсутствует', () => {
  let threw = false;
  try { renderRiversPolished({ screen:{width:1,height:1} }, {}, [], 10, 10); }
  catch (e) { threw = true; }
  assert(threw);
});

// ── sampleSparklePosition ──────────────────────────────
console.log('\n[sampleSparklePosition]');

test('u=0 → первая точка, u=1 → эффективно первая (mod 1)', () => {
  const pts = [{x:0,y:0},{x:10,y:10},{x:20,y:20}];
  const a = sampleSparklePosition(pts, 0);
  assert(a.x === 0 && a.y === 0);
  const b = sampleSparklePosition(pts, 1);
  // u=1 → mod → 0 → (0,0)
  assert(b.x === 0 && b.y === 0);
});

test('u=0.5 → середина пути', () => {
  const pts = [{x:0,y:0},{x:10,y:10},{x:20,y:20}];
  const m = sampleSparklePosition(pts, 0.5);
  assert(m.x === 10 && m.y === 10, `m=${m.x},${m.y}`);
});

test('null на пустом/коротком', () => {
  assert(sampleSparklePosition([], 0.5) === null);
  assert(sampleSparklePosition([{x:0,y:0}], 0.5) === null);
});

// ── buildRiverSparkles ────────────────────────────────
console.log('\n[buildRiverSparkles]');

test('возвращает массив sparkle объектов для групп рек', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const sparkles = buildRiverSparkles(groups, { seed: 42 });
  assert(Array.isArray(sparkles));
  assert(sparkles.length >= 4, 'sparkles=' + sparkles.length);
  for (const sp of sparkles) {
    assert(typeof sp.groupIndex === 'number');
    assert(sp.phase >= 0 && sp.phase < 1);
    assert(sp.speed > 0);
    assert(sp.radius > 0);
  }
});

test('детерминированность при одном seed', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const a = buildRiverSparkles(groups, { seed: 99 });
  const b = buildRiverSparkles(groups, { seed: 99 });
  assert(a.length === b.length);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].phase === b[i].phase);
    assert(a[i].speed === b[i].speed);
  }
});

test('общее число бликов ограничено maxTotal', () => {
  // Имитируем 50 групп
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const manyRivers = [];
  for (let i = 0; i < 50; i++) {
    manyRivers.push({
      path: Array.from({length: 50}, (_, j) => ({ x: j, y: j + i })),
      width: 2
    });
  }
  const groups = renderRiversPolished(app, layers, manyRivers, 100, 100);
  const sparkles = buildRiverSparkles(groups, { seed: 7, maxTotal: 200 });
  assert(sparkles.length <= 200, 'sparkles=' + sparkles.length);
});

test('пустые / некорректные group → []', () => {
  assert(buildRiverSparkles([]).length === 0);
  assert(buildRiverSparkles(null).length === 0);
});

// ── drawRiverSparkles + анимация ──────────────────────
console.log('\n[drawRiverSparkles — анимация]');

test('clear + circle ops соответствуют числу sparkles', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const sparkles = buildRiverSparkles(groups, { seed: 1 });
  const g = new FakePIXIGraphics();
  drawRiverSparkles(g, sparkles, groups, 0);
  const clears  = g.ops.filter(o => o.type === 'clear').length;
  const circles = g.ops.filter(o => o.type === 'circle').length;
  assert(clears === 1, 'clears=' + clears);
  assert(circles === sparkles.length, `circles=${circles} sparkles=${sparkles.length}`);
});

test('позиции sparkles меняются при разных t (анимация идёт)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const sparkles = buildRiverSparkles(groups, { seed: 5 });
  const gA = new FakePIXIGraphics();
  const gB = new FakePIXIGraphics();
  drawRiverSparkles(gA, sparkles, groups, 0);
  drawRiverSparkles(gB, sparkles, groups, 5000);
  // Сравним первые N circles — хотя бы один должен отличаться
  const cA = gA._circles, cB = gB._circles;
  assert(cA.length === cB.length && cA.length > 0, 'no circles');
  let moved = 0;
  for (let i = 0; i < cA.length; i++) {
    if (Math.abs(cA[i].x - cB[i].x) > 1e-9 || Math.abs(cA[i].y - cB[i].y) > 1e-9) moved++;
  }
  assert(moved > 0, 'sparkles did not move between t=0 and t=5000');
});

test('fill({color:0xffffff, alpha~0.3}) применён', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const sparkles = buildRiverSparkles(groups, { seed: 1 });
  const g = new FakePIXIGraphics();
  drawRiverSparkles(g, sparkles, groups, 0);
  assert(g._fills.length === 1, 'fills=' + g._fills.length);
  const f = g._fills[0];
  assert(f.color === 0xffffff, 'color=' + f.color.toString(16));
  assert(Math.abs(f.alpha - 0.3) < 1e-9, 'alpha=' + f.alpha);
});

test('пустые sparkles → только clear, без circles/fill', () => {
  const g = new FakePIXIGraphics();
  drawRiverSparkles(g, [], [], 0);
  assert(g.ops.length === 1 && g.ops[0].type === 'clear');
});

// ── startRiverSparkleTicker ────────────────────────────
console.log('\n[startRiverSparkleTicker]');

test('регистрирует handler в app.ticker и создаёт Graphics в layers.rivers', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const before = layers.rivers.children.length;
  const ctl = startRiverSparkleTicker(app, layers, groups, { sparkleOpts: { seed: 3 } });
  assert(app.ticker.handlers.length === 1, 'handlers=' + app.ticker.handlers.length);
  assert(layers.rivers.children.length === before + 1, 'no sparkle Graphics in layer');
  assert(ctl.graphics instanceof FakePIXIGraphics);
  assert(Array.isArray(ctl.sparkles) && ctl.sparkles.length > 0);
});

test('ticker tick перерисовывает sparkles (clear → circles)', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const ctl = startRiverSparkleTicker(app, layers, groups, {
    stepMs: 33,
    sparkleOpts: { seed: 11 }
  });
  // очистим ops после первичной отрисовки
  ctl.graphics.ops = []; ctl.graphics._strokes = []; ctl.graphics._fills = []; ctl.graphics._circles = [];
  // один маленький тик не должен перерисовать (accum < stepMs)
  app.ticker.tick(10);
  const afterSmall = ctl.graphics.ops.length;
  assert(afterSmall === 0, 'unexpected redraw after 10ms');
  // большой тик — должен
  app.ticker.tick(40);
  assert(ctl.graphics.ops.some(o => o.type === 'clear'));
  assert(ctl.graphics.ops.some(o => o.type === 'circle'));
});

test('stop() снимает handler и удаляет Graphics из layers', () => {
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, sampleRivers, 100, 100);
  const ctl = startRiverSparkleTicker(app, layers, groups, { sparkleOpts: { seed: 2 } });
  const childBefore = layers.rivers.children.length;
  ctl.stop();
  assert(app.ticker.handlers.length === 0, 'handler not removed');
  assert(layers.rivers.children.length === childBefore - 1, 'graphics not removed');
});

// ── Интеграция: generateRivers → renderRiversPolished ─
console.log('\n[integration]');

test('heightmap 256×256: rivers.length группы добавляются', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  assert(rivers.length >= 1, 'no rivers from generator');
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, rivers, hm.width, hm.height);
  assert(groups.length === rivers.length, `groups=${groups.length} rivers=${rivers.length}`);
  // Все группы имеют по 2 Graphics
  for (const g of groups) assert(g.children.length === 2);
});

test('full flow: renderRiversPolished + startRiverSparkleTicker ≤ 200 sparkles', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  const app = makeApp(800, 600);
  const layers = makeLayers();
  const groups = renderRiversPolished(app, layers, rivers, hm.width, hm.height);
  const ctl = startRiverSparkleTicker(app, layers, groups);
  assert(ctl.sparkles.length <= 200, 'sparkles=' + ctl.sparkles.length);
  assert(ctl.sparkles.length > 0, 'zero sparkles');
  // Проверим, что sparkles реально двигаются
  app.ticker.tick(100);
  app.ticker.tick(100);
  const c1 = ctl.graphics._circles.map(c => ({x:c.x, y:c.y}));
  app.ticker.tick(5000);
  const c2 = ctl.graphics._circles.map(c => ({x:c.x, y:c.y}));
  let moved = 0;
  for (let i = 0; i < Math.min(c1.length, c2.length); i++) {
    if (c1[i].x !== c2[i].x || c1[i].y !== c2[i].y) moved++;
  }
  assert(moved > 0, 'no movement after 5s of ticks');
  ctl.stop();
});

// ── Итог ──────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
