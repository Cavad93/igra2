// Тесты Шага 12 (arma.md) — Road rendering: Chaikin + двойная линия
// Запуск: node tests/test_arma_stage12.mjs
//
// Чеклист из arma.md Шаг 12:
//   [1] chaikin(points, iterations) — сглаживает путь, крайние точки сохранены.
//   [2] На карте должны быть видны коричневые дороги между ключевыми точками
//       (эквивалент: renderRoads создаёт Graphics в layers.roads, и в нём
//       есть stroke-ы с цветами 0x2a1a0a (outer) и 0x8a6a3a (inner)).
//   [3] Линии должны быть плавными (после Chaikin) — длина пути после
//       сглаживания > исходной, и количество точек растёт ~×2 за итерацию.
//   [4] Дороги должны идти поверх terrain, но под деревьями — порядок
//       слоёв в initBattleMap: bg → rivers → roads → forests → units → fx.
//   [5] layers.roads.children.length === количеству дорог (валидных).
//   [6] Ширина линий в stroke() == 4 (outer) и == 2 (inner), как в arma.md.
//   [7] Короткие пути / пустой список / невалидный вход — без краша.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const roadsPath  = resolve(__dirname, '..', 'engine', 'roads.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Container + Graphics (записываем операции)
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
    this.ops = [];            // moveTo|lineTo|stroke ops
    this._strokes = [];       // только стили stroke
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
  fill(style)  { this.ops.push({ type: 'fill', style }); return this; }
  clear()      { this.ops.length = 0; this._strokes.length = 0; return this; }
  circle(x, y, r) { this.ops.push({ type: 'circle', x, y, r }); return this; }
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

// Минимальный fake document
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
  Number, Math, Float32Array, Float64Array,
  Uint8Array, Uint8ClampedArray, Int32Array,
  Array, Object, Error, Infinity, isFinite, parseInt,
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

// 2. roads.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(roadsPath, 'utf8'), ctx, { filename: roadsPath });
const roadsExports = ctx.module.exports;
ctx.generateKeyPoints = roadsExports.generateKeyPoints;
ctx.astar             = roadsExports.astar;
ctx.generateRoads     = roadsExports.generateRoads;

// 3. battle_map_pixi.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const {
  chaikin,
  chaikinSmooth,
  drawPolyline,
  renderRoads,
  mapRiverPathToScreen,
} = pixiExports;
const { generateHeightmap } = noiseExports;
const { generateKeyPoints, generateRoads } = roadsExports;

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

// Мини-фабрика fake app + layers (как в реальном initBattleMap)
function makeFakeApp(w, h) {
  return { screen: { width: w, height: h } };
}
function makeFakeLayers() {
  return {
    bg:      new FakePIXIContainer(),
    rivers:  new FakePIXIContainer(),
    roads:   new FakePIXIContainer(),
    forests: new FakePIXIContainer(),
    units:   new FakePIXIContainer(),
    fx:      new FakePIXIContainer(),
  };
}

console.log('═══ Шаг 12 (arma.md) — renderRoads ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('chaikin is a function',     () => assert(typeof chaikin === 'function'));
test('drawPolyline is a function',() => assert(typeof drawPolyline === 'function'));
test('renderRoads is a function', () => assert(typeof renderRoads === 'function'));

// ── chaikin: корректность сглаживания ─────────────────
console.log('\n[chaikin]');

test('сохраняет крайние точки (≥ 3 опорных)', () => {
  const pts = [{x:0,y:0},{x:10,y:0},{x:10,y:10}];
  const out = chaikin(pts, 3);
  assert(out.length >= pts.length, 'length must grow or keep');
  assert(approx(out[0].x, 0) && approx(out[0].y, 0), 'first point shifted');
  const last = out[out.length - 1];
  assert(approx(last.x, 10) && approx(last.y, 10), 'last point shifted');
});

test('1 итерация для N точек даёт 2N-2 промежуточных + 2 крайних', () => {
  const pts = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:20,y:10}];
  // Спецификация Chaikin: после 1 итерации длина = 2*(N-1)
  // (для N=4 → 6). Наша реализация включает крайние, итого 2N-2 + 2 - 2.
  // Проверяем: >= N и минимум прирост пар.
  const out1 = chaikin(pts, 1);
  assert(out1.length >= pts.length);
  const out3 = chaikin(pts, 3);
  // За 3 итерации для 4 исходных точек: 4 → 6 → 10 → 18
  assert(out3.length > out1.length, 'length should grow with iterations');
});

test('на 2 точках возвращает исходные (нечего сглаживать)', () => {
  const pts = [{x:0,y:0},{x:10,y:10}];
  const out = chaikin(pts, 3);
  assert(out.length === 2);
  assert(out[0].x === 0 && out[1].x === 10);
});

test('пустой массив / null — не падает', () => {
  assert(chaikin([], 3).length === 0);
  assert(chaikin(null, 3).length === 0);
});

test('сглаживание уменьшает суммарную угловатость (L-образный путь)', () => {
  // L-образный путь: резкий угол 90°. После Chaikin длина должна
  // уменьшиться (гипотенуза короче катетов).
  const pts = [{x:0,y:0},{x:10,y:0},{x:10,y:10}];
  const out = chaikin(pts, 4);
  let lenOrig = 0, lenSmooth = 0;
  for (let i = 1; i < pts.length; i++) {
    lenOrig += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
  }
  for (let i = 1; i < out.length; i++) {
    lenSmooth += Math.hypot(out[i].x - out[i-1].x, out[i].y - out[i-1].y);
  }
  assert(lenSmooth < lenOrig,
    `smoothed (${lenSmooth.toFixed(2)}) should be < original (${lenOrig.toFixed(2)})`);
});

// ── drawPolyline ──────────────────────────────────────
console.log('\n[drawPolyline]');

test('первый op — moveTo, далее lineTo', () => {
  const g = new FakePIXIGraphics();
  drawPolyline(g, [{x:1,y:2},{x:3,y:4},{x:5,y:6}]);
  assert(g.ops.length === 3);
  assert(g.ops[0].type === 'moveTo' && g.ops[0].x === 1 && g.ops[0].y === 2);
  assert(g.ops[1].type === 'lineTo' && g.ops[1].x === 3 && g.ops[1].y === 4);
  assert(g.ops[2].type === 'lineTo' && g.ops[2].x === 5 && g.ops[2].y === 6);
});

test('короткий путь — не рисует', () => {
  const g = new FakePIXIGraphics();
  drawPolyline(g, [{x:1,y:2}]);
  assert(g.ops.length === 0);
  drawPolyline(g, []);
  assert(g.ops.length === 0);
});

// ── renderRoads — на синтетических данных ───────────
console.log('\n[renderRoads — базовые]');

test('пустой список дорог → пустой массив, layers.roads без детей', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const out = renderRoads(app, layers, [], 100, 100);
  assert(Array.isArray(out) && out.length === 0);
  assert(layers.roads.children.length === 0);
});

test('одна дорога → один Graphics в layers.roads', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:20}] }];
  const out = renderRoads(app, layers, roads, 100, 100);
  assert(out.length === 1, 'expected 1 Graphics, got ' + out.length);
  assert(layers.roads.children.length === 1);
  assert(layers.roads.children[0] === out[0], 'Graphics ref mismatch');
});

test('три дороги → три Graphics', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [
    { path: [{x:0,y:0},{x:10,y:10},{x:20,y:0}] },
    { path: [{x:5,y:5},{x:25,y:5},{x:25,y:25}] },
    { path: [{x:50,y:50},{x:60,y:60}] }, // 2 точки — простая прямая
  ];
  const out = renderRoads(app, layers, roads, 100, 100);
  assert(out.length === 3);
  assert(layers.roads.children.length === 3);
});

test('короткий путь (1 точка) — пропускается', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  const roads = [
    { path: [{x:0,y:0}] },
    { path: [{x:10,y:10},{x:20,y:20}] },
  ];
  const out = renderRoads(app, layers, roads, 100, 100);
  assert(out.length === 1, 'short path should be skipped');
});

test('invalid roads input не крашит', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  assert(renderRoads(app, layers, null, 100, 100).length === 0);
  assert(renderRoads(app, layers, undefined, 100, 100).length === 0);
});

// ── renderRoads — стиль и структура Graphics ─────────
console.log('\n[renderRoads — стиль stroke()]');

test('Graphics содержит ровно 2 stroke() — outer + inner', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:10}] }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  assert(g._strokes.length === 2,
    'expected 2 strokes, got ' + g._strokes.length);
});

test('outer stroke: width=4, color=0x2a1a0a, alpha=0.8 (arma.md)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:10}] }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  const outer = g._strokes[0];
  assert(outer.width === 4, 'outer width ' + outer.width);
  assert(outer.color === 0x2a1a0a, 'outer color 0x' + outer.color.toString(16));
  assert(approx(outer.alpha, 0.8, 1e-6), 'outer alpha ' + outer.alpha);
});

test('inner stroke: width=2, color=0x8a6a3a, alpha=0.9 (arma.md)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:10}] }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  const inner = g._strokes[1];
  assert(inner.width === 2, 'inner width ' + inner.width);
  assert(inner.color === 0x8a6a3a, 'inner color 0x' + inner.color.toString(16));
  assert(approx(inner.alpha, 0.9, 1e-6), 'inner alpha ' + inner.alpha);
});

test('round cap/join для плавных скруглений', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:10}] }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  for (const s of g._strokes) {
    assert(s.cap === 'round', 'cap not round: ' + s.cap);
    assert(s.join === 'round', 'join not round: ' + s.join);
  }
});

// ── renderRoads — геометрия (Chaikin + проекция) ────
console.log('\n[renderRoads — геометрия]');

test('оба stroke проходят по одинаковому сглаженному пути', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:10},{x:90,y:90}] }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  // Пути в ops делятся на сегменты вокруг stroke-ов.
  const segs = [];
  let cur = [];
  for (const op of g.ops) {
    if (op.type === 'moveTo' || op.type === 'lineTo') {
      cur.push(op);
    } else if (op.type === 'stroke') {
      segs.push(cur);
      cur = [];
    }
  }
  assert(segs.length === 2, 'expected 2 path segments');
  assert(segs[0].length === segs[1].length,
    'outer len ' + segs[0].length + ' != inner len ' + segs[1].length);
  for (let i = 0; i < segs[0].length; i++) {
    assert(segs[0][i].x === segs[1][i].x && segs[0][i].y === segs[1][i].y,
      'path point ' + i + ' differs');
  }
});

test('путь начинается в проекции первой точки heightmap-пути', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  // hmW=100, hmH=100, screen=800x600 → масштаб 8x и 6x.
  const roads = [{ path: [{x:10,y:10},{x:50,y:50},{x:90,y:90}] }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  // Первый moveTo должен быть в (10*8=80, 10*6=60)
  const first = g.ops.find(o => o.type === 'moveTo');
  assert(first, 'no moveTo');
  assert(approx(first.x, 80, 1e-6) && approx(first.y, 60, 1e-6),
    'moveTo=' + first.x + ',' + first.y);
});

test('после chaikin путь длиннее исходного по числу точек', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const path = [
    {x:10,y:10},{x:20,y:20},{x:30,y:10},{x:40,y:20},{x:50,y:10}
  ];
  const roads = [{ path }];
  renderRoads(app, layers, roads, 100, 100);
  const g = layers.roads.children[0];
  // Считаем lineTo до первого stroke.
  let lineCount = 0;
  for (const op of g.ops) {
    if (op.type === 'stroke') break;
    if (op.type === 'lineTo') lineCount++;
  }
  // Исходный путь = 5 точек → после 3 итераций Chaikin ≈ 26 точек,
  // то есть lineTo >= 5 (исходный) и точно > чем без сглаживания.
  assert(lineCount > path.length - 1,
    'smoothed path should have more segments than original (' +
    lineCount + ' vs ' + (path.length - 1) + ')');
});

// ── renderRoads на реальных данных pipeline ────────
console.log('\n[renderRoads — интеграция с generateRoads]');

test('pipeline: heightmap → keyPoints → roads → renderRoads', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  assert(pts.length >= 2, 'need ≥ 2 key points');
  const roads = generateRoads(hm, pts);
  assert(roads.length >= 1);

  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const created = renderRoads(app, layers, roads, hm.width, hm.height);
  assert(created.length === roads.length,
    'created ' + created.length + ' vs roads ' + roads.length);
  assert(layers.roads.children.length === roads.length);

  // Каждая Graphics должна иметь 2 stroke (outer+inner) с правильными цветами.
  for (const g of created) {
    assert(g._strokes.length === 2);
    assert(g._strokes[0].color === 0x2a1a0a);
    assert(g._strokes[1].color === 0x8a6a3a);
  }
});

// ── Ошибки инициализации ───────────────────────────
console.log('\n[renderRoads — ошибки]');

test('throws при отсутствии app', () => {
  const layers = makeFakeLayers();
  let threw = false;
  try { renderRoads(null, layers, [{path:[{x:0,y:0},{x:1,y:1}]}], 10, 10); }
  catch (_) { threw = true; }
  assert(threw, 'should throw without app');
});

test('throws при отсутствии layers.roads', () => {
  const app = makeFakeApp(400, 400);
  let threw = false;
  try { renderRoads(app, {}, [{path:[{x:0,y:0},{x:1,y:1}]}], 10, 10); }
  catch (_) { threw = true; }
  assert(threw, 'should throw without layers.roads');
});

test('throws при нулевых размерах heightmap', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  let threw = false;
  try { renderRoads(app, layers, [{path:[{x:0,y:0},{x:1,y:1}]}], 0, 0); }
  catch (_) { threw = true; }
  assert(threw, 'should throw for invalid hmW/hmH');
});

// ── Z-order проверка (layers.roads идёт после rivers) ─
console.log('\n[z-order слоёв]');

test('layers.roads лежит между rivers и forests (для integration)', () => {
  // Этот тест не может проверить initBattleMap без реального PIXI,
  // но может верифицировать, что в исходнике battle_map_pixi.js
  // порядок addChild в initBattleMap: bg → rivers → roads → forests.
  const src = readFileSync(pixiPath, 'utf8');
  const iBg      = src.indexOf('app.stage.addChild(layerBg');
  const iRivers  = src.indexOf('app.stage.addChild(layerRivers');
  const iRoads   = src.indexOf('app.stage.addChild(layerRoads');
  const iForests = src.indexOf('app.stage.addChild(layerForests');
  assert(iBg >= 0 && iRivers > iBg, 'bg → rivers order broken');
  assert(iRoads > iRivers, 'rivers → roads order broken');
  assert(iForests > iRoads, 'roads → forests order broken');
});

// ── chaikin vs chaikinSmooth — один и тот же алгоритм ─
console.log('\n[chaikin — совместимость с chaikinSmooth]');

test('chaikin(pts,3) === chaikinSmooth(pts,3)', () => {
  const pts = [{x:1,y:2},{x:3,y:4},{x:5,y:6},{x:7,y:8}];
  const a = chaikin(pts, 3);
  const b = chaikinSmooth(pts, 3);
  assert(a.length === b.length);
  for (let i = 0; i < a.length; i++) {
    assert(approx(a[i].x, b[i].x) && approx(a[i].y, b[i].y),
      'point ' + i + ' differs');
  }
});

// ── Итог ────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
