// Тесты Шага 15 (arma.md) — renderForests: Painter's algorithm
// Запуск: node tests/test_arma_stage15.mjs
//
// Чеклист из arma.md Шаг 15:
//   [1] renderForests(app, layers, treePositions, hmW, hmH) — функция.
//   [2] Для каждой точки создаётся одно дерево как PIXI.Graphics:
//        a. Тень — ellipse(0, +6), rgba(0,0,0,0.25), rx=7, ry=3
//        b. Крона — circle(0, 0), 0x1a3a14, r=8
//        c. Блик кроны — circle(-3, -3), 0x2d5a24, r=4, alpha=0.6
//        d. Ствол — rect(-1.5, +5), 3×5, 0x4a2800
//   [3] tree.x / tree.y устанавливаются (screenX, screenY).
//   [4] tree.zIndex == screenY (для Painter's algorithm).
//   [5] layers.forests.sortableChildren === true после вызова.
//   [6] Деревья отсортированы по возрастанию y перед добавлением
//       в контейнер (ближние перекрывают дальних).
//   [7] layers.forests.children.length == количество valid треевых позиций.
//   [8] Координаты heightmap → screen через пропорцию screenW/hmW.
//   [9] Защитные случаи: пустой массив / null / невалидные размеры.
//   [10] Интеграция: poissonDisk → renderForests без ошибок,
//        и нет «провалов» в перекрытиях.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const forestsPath = resolve(__dirname, '..', 'engine', 'forests.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Container + Graphics
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
    this.ops = [];
    this._fills = [];
    this._strokes = [];
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
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
  fill(style)  {
    this.ops.push({ type: 'fill', style });
    this._fills.push(style);
    return this;
  }
  clear()      { this.ops.length = 0; this._fills.length = 0; this._strokes.length = 0; return this; }
  circle(x, y, r) { this.ops.push({ type: 'circle', x, y, r }); return this; }
  ellipse(x, y, rx, ry) { this.ops.push({ type: 'ellipse', x, y, rx, ry }); return this; }
  rect(x, y, w, h) { this.ops.push({ type: 'rect', x, y, w, h }); return this; }
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

// 2. forests.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(forestsPath, 'utf8'), ctx, { filename: forestsPath });
const forestsExports = ctx.module.exports;
ctx.generateForestMask = forestsExports.generateForestMask;
ctx.poissonDisk        = forestsExports.poissonDisk;

// 3. battle_map_pixi.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const { renderForests } = pixiExports;
const { generateHeightmap } = noiseExports;
const { generateForestMask, poissonDisk, DEFAULT_TREE_MIN_DIST,
        DEFAULT_TREE_MAX_POINTS } = forestsExports;

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

console.log('═══ Шаг 15 (arma.md) — renderForests ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('renderForests is a function', () => {
  assert(typeof renderForests === 'function');
});

// ── Базовая корректность ───────────────────────────────
console.log('\n[Базовая корректность]');

test('пустой массив → пустой результат, без детей', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const out = renderForests(app, layers, [], 100, 100);
  assert(Array.isArray(out) && out.length === 0);
  assert(layers.forests.children.length === 0);
});

test('null / undefined treePositions — без краша', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  assert(renderForests(app, layers, null, 100, 100).length === 0);
  assert(renderForests(app, layers, undefined, 100, 100).length === 0);
});

test('одно дерево → один Graphics в layers.forests', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const trees = [{ x: 50, y: 50 }];
  const out = renderForests(app, layers, trees, 100, 100);
  assert(out.length === 1, 'expected 1 Graphics, got ' + out.length);
  assert(layers.forests.children.length === 1);
  assert(layers.forests.children[0] === out[0], 'Graphics ref mismatch');
});

test('N деревьев → N Graphics в layers.forests', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const trees = [];
  for (let i = 0; i < 50; i++) trees.push({ x: i * 2, y: i * 2 });
  const out = renderForests(app, layers, trees, 100, 100);
  assert(out.length === 50);
  assert(layers.forests.children.length === 50);
});

test('throws на невалидные размеры heightmap', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const trees = [{ x: 1, y: 1 }];
  let threw = false;
  try { renderForests(app, layers, trees, 0, 100); }
  catch (e) { threw = true; }
  assert(threw, 'should throw on hmW=0');
});

test('throws если layers.forests отсутствует', () => {
  let threw = false;
  try { renderForests(makeFakeApp(800, 600), {}, [{x:1,y:1}], 100, 100); }
  catch (e) { threw = true; }
  assert(threw);
});

// ── Структура примитивов одного дерева ────────────────
console.log('\n[Структура примитивов]');

test('Graphics содержит 4 fill (тень + крона + блик + ствол)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 50, y: 50 }], 100, 100);
  const g = layers.forests.children[0];
  assert(g._fills.length === 4,
    'expected 4 fills, got ' + g._fills.length);
});

test('Тень: ellipse(0, 6, 7, 3) с alpha=0.25', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 50, y: 50 }], 100, 100);
  const g = layers.forests.children[0];
  const ellipses = g.ops.filter(o => o.type === 'ellipse');
  assert(ellipses.length === 1, 'expected 1 ellipse');
  const e = ellipses[0];
  assert(e.x === 0 && e.y === 6, `ellipse pos = (${e.x},${e.y})`);
  assert(e.rx === 7 && e.ry === 3, `ellipse radii = (${e.rx},${e.ry})`);
  // shadow fill — должен иметь alpha 0.25
  const shadowFill = g._fills.find(f =>
    f && f.color === 0x000000 && approx(f.alpha, 0.25, 1e-6));
  assert(shadowFill, 'shadow fill (black, α=0.25) not found');
});

test('Крона: circle(0, 0, 8) с цветом 0x1a3a14', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 50, y: 50 }], 100, 100);
  const g = layers.forests.children[0];
  const circles = g.ops.filter(o => o.type === 'circle');
  assert(circles.length === 2, 'expected 2 circles, got ' + circles.length);
  // первый — крона
  const crown = circles.find(c => c.x === 0 && c.y === 0 && c.r === 8);
  assert(crown, 'crown circle (0,0,8) not found');
  const crownFill = g._fills.find(f => f && f.color === 0x1a3a14);
  assert(crownFill, 'crown fill 0x1a3a14 not found');
});

test('Блик: circle(-3, -3, 4) с цветом 0x2d5a24, alpha=0.6', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 50, y: 50 }], 100, 100);
  const g = layers.forests.children[0];
  const highlight = g.ops.find(o =>
    o.type === 'circle' && o.x === -3 && o.y === -3 && o.r === 4);
  assert(highlight, 'highlight circle (-3,-3,4) not found');
  const hlFill = g._fills.find(f =>
    f && f.color === 0x2d5a24 && approx(f.alpha, 0.6, 1e-6));
  assert(hlFill, 'highlight fill 0x2d5a24 α=0.6 not found');
});

test('Ствол: rect(-1.5, 5, 3, 5) с цветом 0x4a2800', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 50, y: 50 }], 100, 100);
  const g = layers.forests.children[0];
  const rects = g.ops.filter(o => o.type === 'rect');
  assert(rects.length === 1, 'expected 1 rect, got ' + rects.length);
  const r = rects[0];
  assert(approx(r.x, -1.5) && r.y === 5, `rect pos = (${r.x},${r.y})`);
  assert(r.w === 3 && r.h === 5, `rect size = (${r.w},${r.h})`);
  const trunkFill = g._fills.find(f => f && f.color === 0x4a2800);
  assert(trunkFill, 'trunk fill 0x4a2800 not found');
});

// ── Позиция и Painter's algorithm ──────────────────────
console.log('\n[Позиция и Painter\'s algorithm]');

test('tree.x / tree.y равны screen-координатам (через scale)', () => {
  // hm 100×100, screen 800×600 → sx=8, sy=6
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 25, y: 50 }], 100, 100);
  const g = layers.forests.children[0];
  assert(g.x === 25 * 8, `g.x=${g.x}, expected 200`);
  assert(g.y === 50 * 6, `g.y=${g.y}, expected 300`);
});

test('tree.zIndex == screenY', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 10, y: 30 }], 100, 100);
  const g = layers.forests.children[0];
  // sy = 4, screenY = 120
  assert(g.zIndex === 120, 'zIndex=' + g.zIndex);
  assert(g.zIndex === g.y, 'zIndex must equal y for Painter\'s');
});

test('layers.forests.sortableChildren === true после вызова', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  assert(layers.forests.sortableChildren === false, 'precondition');
  renderForests(app, layers, [{ x: 1, y: 1 }], 100, 100);
  assert(layers.forests.sortableChildren === true);
});

test('дети layers.forests отсортированы по возрастанию y', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  // Передаём в произвольном порядке
  const trees = [
    { x: 10, y: 80 },
    { x: 20, y: 10 },
    { x: 30, y: 50 },
    { x: 40, y: 30 },
    { x: 50, y: 70 },
  ];
  renderForests(app, layers, trees, 100, 100);
  const ys = layers.forests.children.map(c => c.y);
  for (let i = 1; i < ys.length; i++) {
    assert(ys[i] >= ys[i - 1],
      `not sorted at ${i}: ${ys[i-1]} → ${ys[i]}`);
  }
});

test('сортировка не мутирует входной массив treePositions', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const trees = [
    { x: 10, y: 80 },
    { x: 20, y: 10 },
  ];
  const snapshot = trees.map(p => ({ x: p.x, y: p.y }));
  renderForests(app, layers, trees, 100, 100);
  for (let i = 0; i < trees.length; i++) {
    assert(trees[i].x === snapshot[i].x && trees[i].y === snapshot[i].y,
      'input array mutated at ' + i);
  }
});

// ── Маппинг heightmap → screen ─────────────────────────
console.log('\n[Маппинг heightmap → screen]');

test('hm 200×100, screen 400×400 — sx=2, sy=4', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  renderForests(app, layers, [{ x: 50, y: 25 }], 200, 100);
  const g = layers.forests.children[0];
  assert(g.x === 100 && g.y === 100,
    `expected (100,100), got (${g.x},${g.y})`);
});

// ── Интеграция с poissonDisk + forest mask ─────────────
console.log('\n[Интеграция с poissonDisk]');

test('poissonDisk → renderForests без ошибок', () => {
  const hm = generateHeightmap(128, 128, 42);
  const mask = generateForestMask(hm, 42);
  const trees = poissonDisk(mask, 128, 128, DEFAULT_TREE_MIN_DIST, DEFAULT_TREE_MAX_POINTS, 42);
  assert(trees.length > 0, 'no trees on real forest mask');

  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const out = renderForests(app, layers, trees, 128, 128);
  assert(out.length === trees.length,
    `expected ${trees.length} graphics, got ${out.length}`);
  assert(layers.forests.children.length === trees.length);
  // Проверим, что все дети имеют корректный zIndex == y
  for (const c of layers.forests.children) {
    assert(c.zIndex === c.y, 'zIndex != y for tree');
  }
});

test('300 деревьев — корректное число Graphics, sortableChildren=true', () => {
  // Симулируем стресс: 300 случайных позиций
  const trees = [];
  let rng = 12345;
  function nextRng() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }
  for (let i = 0; i < 300; i++) {
    trees.push({ x: nextRng() * 200, y: nextRng() * 200 });
  }
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const out = renderForests(app, layers, trees, 200, 200);
  assert(out.length === 300);
  assert(layers.forests.children.length === 300);
  assert(layers.forests.sortableChildren === true);
  // Painter's: проверка отсортированности по y
  const ys = layers.forests.children.map(c => c.y);
  for (let i = 1; i < ys.length; i++) {
    assert(ys[i] >= ys[i - 1], `not sorted at ${i}`);
  }
});

// ── Итог ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
