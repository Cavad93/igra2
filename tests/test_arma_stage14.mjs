// Тесты Шага 14 (arma.md) — Poisson Disk Sampling для размещения деревьев
// Запуск: node tests/test_arma_stage14.mjs
//
// Чеклист из arma.md Шаг 14:
//   [1] poissonDisk(mask, w, h, minDist, maxPoints, seed) → Array<{x,y}>.
//   [2] Все точки внутри маски: mask[y*w+x] === 1.
//   [3] Минимальное расстояние между любыми двумя точками ≥ minDist.
//   [4] Точки распределены равномерно (нет пустых зон и скоплений).
//   [5] Алгоритм Bridson: start + activeList + k=30 кандидатов в кольце
//       [minDist, 2*minDist].
//   [6] Spatial grid (cell = r/sqrt(2)) для O(1) поиска соседей.
//   [7] Параметры по умолчанию для деревьев: minDist=12, maxPoints=500.
//   [8] Детерминированность: один seed + одна mask → идентичный результат.
//   [9] Защиты: null/empty mask, невалидные размеры, минимальная карта.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const noisePath   = resolve(__dirname, '..', 'engine', 'noise.js');
const forestsPath = resolve(__dirname, '..', 'engine', 'forests.js');

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
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// 1. engine/noise.js
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;
ctx.mulberry32        = noiseExports.mulberry32;
ctx.getHeight         = noiseExports.getHeight;
ctx.PerlinNoise       = noiseExports.PerlinNoise;
ctx.fbm               = noiseExports.fbm;
ctx.domainWarp        = noiseExports.domainWarp;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// 2. engine/forests.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(forestsPath, 'utf8'), ctx, { filename: forestsPath });
const forestsExports = ctx.module.exports;

const {
  poissonDisk,
  generateForestMask,
  DEFAULT_TREE_MIN_DIST,
  DEFAULT_TREE_MAX_POINTS,
} = forestsExports;
const { generateHeightmap } = noiseExports;

// ──────────────────────────────────────────────────────────
// Test runner
// ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ──────────────────────────────────────────────────────────
// Утилиты
// ──────────────────────────────────────────────────────────
function makeFullMask(W, H) {
  const m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = 1;
  return m;
}
function makeRectMask(W, H, x0, y0, x1, y1) {
  const m = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      m[y * W + x] = 1;
  return m;
}
function minPairDist(points) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

console.log('═══ Шаг 14 (arma.md) — Poisson Disk Sampling ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('poissonDisk is a function', () => assert(typeof poissonDisk === 'function'));
test('DEFAULT_TREE_MIN_DIST === 12', () => assert(DEFAULT_TREE_MIN_DIST === 12));
test('DEFAULT_TREE_MAX_POINTS === 500', () => assert(DEFAULT_TREE_MAX_POINTS === 500));

// ── Базовая корректность ────────────────────────────────
console.log('\n[Базовая корректность]');

test('возвращает массив объектов {x, y}', () => {
  const mask = makeFullMask(128, 128);
  const pts = poissonDisk(mask, 128, 128, 12, 500, 42);
  assert(Array.isArray(pts), 'not an array');
  assert(pts.length > 0, 'empty result');
  for (const p of pts) {
    assert(typeof p.x === 'number' && typeof p.y === 'number',
      'bad point shape: ' + JSON.stringify(p));
  }
});

test('все точки внутри прямоугольника [0, W) × [0, H)', () => {
  const W = 128, H = 96;
  const mask = makeFullMask(W, H);
  const pts = poissonDisk(mask, W, H, 12, 500, 7);
  for (const p of pts) {
    assert(p.x >= 0 && p.x < W, 'x OOB: ' + p.x);
    assert(p.y >= 0 && p.y < H, 'y OOB: ' + p.y);
  }
});

test('все точки внутри маски (mask[y*W+x] === 1)', () => {
  const W = 128, H = 128;
  const mask = makeRectMask(W, H, 20, 20, 100, 100);
  const pts = poissonDisk(mask, W, H, 10, 200, 3);
  assert(pts.length > 0, 'empty result');
  for (const p of pts) {
    const ix = p.x | 0, iy = p.y | 0;
    assert(mask[iy * W + ix] === 1,
      `point (${p.x.toFixed(2)},${p.y.toFixed(2)}) outside mask`);
  }
});

// ── Минимальное расстояние ──────────────────────────────
console.log('\n[Минимальное расстояние ≥ minDist]');

test('в равномерной маске любое расстояние ≥ minDist', () => {
  const W = 256, H = 256;
  const mask = makeFullMask(W, H);
  const pts = poissonDisk(mask, W, H, 12, 500, 42);
  assert(pts.length > 10, 'too few points: ' + pts.length);
  const d = minPairDist(pts);
  assert(d >= 12 - 1e-9, 'min dist ' + d.toFixed(4) + ' < 12');
});

test('minDist=20 даёт расстояние ≥ 20', () => {
  const W = 256, H = 256;
  const mask = makeFullMask(W, H);
  const pts = poissonDisk(mask, W, H, 20, 300, 123);
  assert(pts.length > 5, 'too few points: ' + pts.length);
  const d = minPairDist(pts);
  assert(d >= 20 - 1e-9, 'min dist ' + d.toFixed(4) + ' < 20');
});

test('minDist=8 на маленькой карте — тоже соблюдает', () => {
  const W = 64, H = 64;
  const mask = makeFullMask(W, H);
  const pts = poissonDisk(mask, W, H, 8, 500, 9);
  const d = minPairDist(pts);
  assert(d >= 8 - 1e-9, 'min dist ' + d.toFixed(4) + ' < 8');
});

// ── maxPoints лимит ─────────────────────────────────────
console.log('\n[maxPoints лимит]');

test('result.length ≤ maxPoints', () => {
  const W = 512, H = 512;
  const mask = makeFullMask(W, H);
  const pts = poissonDisk(mask, W, H, 6, 300, 42);
  assert(pts.length <= 300, 'exceeded: ' + pts.length);
});

test('maxPoints=1 → 1 точка', () => {
  const mask = makeFullMask(64, 64);
  const pts = poissonDisk(mask, 64, 64, 12, 1, 42);
  assert(pts.length === 1, 'got ' + pts.length);
});

// ── Равномерность распределения ─────────────────────────
console.log('\n[Равномерность распределения]');

test('на полной 256×256 заполняется достаточно плотно (>100 точек при minDist=12, maxPoints=500)', () => {
  const mask = makeFullMask(256, 256);
  const pts = poissonDisk(mask, 256, 256, 12, 500, 42);
  // Теоретический предел для Bridson в 256×256 при r=12 ≈ 500+ точек.
  assert(pts.length >= 100, 'too sparse: ' + pts.length);
});

test('нет крупных пустых зон: каждая клетка 48×48 содержит точку (на 256×256, minDist=12)', () => {
  const W = 256, H = 256;
  const mask = makeFullMask(W, H);
  const pts = poissonDisk(mask, W, H, 12, 500, 42);
  // На 256×256 разбиваем на 48×48 клетки = ~5×5 = 25 клеток
  const GRID = 48;
  const cols = Math.ceil(W / GRID);
  const rows = Math.ceil(H / GRID);
  const grid = new Uint8Array(cols * rows);
  for (const p of pts) {
    const gx = Math.min(cols - 1, (p.x / GRID) | 0);
    const gy = Math.min(rows - 1, (p.y / GRID) | 0);
    grid[gy * cols + gx] = 1;
  }
  // Допускаем, что ≤ 2 клетки из всех могут остаться пустыми.
  let empty = 0;
  for (let i = 0; i < grid.length; i++) if (!grid[i]) empty++;
  assert(empty <= 2, `${empty} empty 48×48 cells out of ${grid.length}`);
});

// ── Детерминированность ─────────────────────────────────
console.log('\n[Детерминированность]');

test('один seed + одна mask → идентичный результат', () => {
  const W = 128, H = 128;
  const mask = makeFullMask(W, H);
  const a = poissonDisk(mask, W, H, 12, 200, 42);
  const b = poissonDisk(mask, W, H, 12, 200, 42);
  assert(a.length === b.length, `lengths differ: ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].x === b[i].x && a[i].y === b[i].y,
      `mismatch at ${i}`);
  }
});

test('разные seeds → как правило разные результаты', () => {
  const mask = makeFullMask(128, 128);
  const a = poissonDisk(mask, 128, 128, 12, 200, 1);
  const b = poissonDisk(mask, 128, 128, 12, 200, 999);
  let diff = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) diff++;
  }
  assert(diff > 0, 'identical across seeds');
});

// ── Интеграция с forest mask ────────────────────────────
console.log('\n[Интеграция с forest mask]');

test('poissonDisk(forestMask, ...) — все точки в реальной лесной маске', () => {
  const hm = generateHeightmap(256, 256, 42);
  const forestMask = generateForestMask(hm, 42);
  const pts = poissonDisk(forestMask, 256, 256, 12, 500, 42);
  assert(pts.length > 0, 'empty on real forest mask');
  for (const p of pts) {
    const ix = p.x | 0, iy = p.y | 0;
    assert(forestMask[iy * 256 + ix] === 1,
      `tree at (${p.x.toFixed(1)},${p.y.toFixed(1)}) outside forest`);
  }
  const d = minPairDist(pts);
  assert(d >= 12 - 1e-9, 'min dist ' + d.toFixed(4) + ' < 12');
});

test('с дефолтными параметрами (minDist=12, maxPoints=500) на forest mask', () => {
  const hm = generateHeightmap(256, 256, 7);
  const forestMask = generateForestMask(hm, 7);
  const pts = poissonDisk(forestMask, 256, 256,
    DEFAULT_TREE_MIN_DIST, DEFAULT_TREE_MAX_POINTS, 7);
  assert(pts.length > 0, 'no trees on forest mask');
  assert(pts.length <= DEFAULT_TREE_MAX_POINTS,
    'exceeded maxPoints: ' + pts.length);
});

// ── Защита / граничные случаи ──────────────────────────
console.log('\n[Граничные случаи]');

test('null mask → []', () => {
  const pts = poissonDisk(null, 64, 64, 12, 500, 42);
  assert(Array.isArray(pts) && pts.length === 0);
});

test('mask.length != W*H → []', () => {
  const mask = new Uint8Array(10);
  const pts = poissonDisk(mask, 64, 64, 12, 500, 42);
  assert(Array.isArray(pts) && pts.length === 0);
});

test('W=0 или H=0 → []', () => {
  assert(poissonDisk(new Uint8Array(0), 0, 0, 12, 500, 42).length === 0);
  assert(poissonDisk(new Uint8Array(0), 0, 64, 12, 500, 42).length === 0);
});

test('minDist ≤ 0 → []', () => {
  const mask = makeFullMask(64, 64);
  assert(poissonDisk(mask, 64, 64, 0, 500, 42).length === 0);
  assert(poissonDisk(mask, 64, 64, -5, 500, 42).length === 0);
});

test('maxPoints ≤ 0 → []', () => {
  const mask = makeFullMask(64, 64);
  assert(poissonDisk(mask, 64, 64, 12, 0, 42).length === 0);
  assert(poissonDisk(mask, 64, 64, 12, -1, 42).length === 0);
});

test('полностью пустая маска (все нули) → []', () => {
  const mask = new Uint8Array(64 * 64); // все 0
  const pts = poissonDisk(mask, 64, 64, 12, 500, 42);
  assert(pts.length === 0);
});

test('маска из одной клетки → одна точка', () => {
  const mask = new Uint8Array(64 * 64);
  mask[32 * 64 + 32] = 1;
  const pts = poissonDisk(mask, 64, 64, 12, 500, 42);
  assert(pts.length === 1, 'expected 1 point, got ' + pts.length);
  const p = pts[0];
  assert((p.x | 0) === 32 && (p.y | 0) === 32,
    `point at (${p.x}, ${p.y}) not at (32, 32)`);
});

test('маленькая карта 1×1 с одной клеткой — не крашит', () => {
  const mask = new Uint8Array([1]);
  const pts = poissonDisk(mask, 1, 1, 2, 10, 42);
  assert(pts.length === 1);
});

test('узкая прямоугольная маска (коридор) — точки внутри', () => {
  const W = 128, H = 128;
  const mask = makeRectMask(W, H, 0, 60, 128, 68); // 8px высота
  const pts = poissonDisk(mask, W, H, 6, 200, 42);
  assert(pts.length > 0, 'no points in corridor');
  for (const p of pts) {
    assert(p.y >= 60 && p.y < 68,
      `point y=${p.y} outside corridor [60,68)`);
  }
  const d = minPairDist(pts);
  assert(d >= 6 - 1e-9, 'min dist ' + d.toFixed(4) + ' < 6');
});

// ── Итог ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
