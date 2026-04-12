// Тесты Шага 7 (arma.md) — Rivers: traceRiver + generateRivers
// Запуск: node tests/test_arma_stage7.mjs
//
// Чеклист из arma.md Шаг 7:
//   [1] generateRivers(heightmap, 5, 42) возвращает массив 1–5 рек
//       (некоторые могут быть отфильтрованы как слишком короткие).
//   [2] Каждый path идёт от высоких h к низким h — first.h >= last.h.
//   [3] Детерминированность по seed.
//   [4] traceRiver выдаёт путь, spill-точка (конец) находится в зоне воды
//       или на "озере" (плато).
//   [5] Коды защиты: пустой heightmap, count=0, нет гор и т.п.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const riversPath = resolve(__dirname, '..', 'engine', 'rivers.js');

// ──────────────────────────────────────────────────────────
// VM-контекст
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  require: undefined, // отключаем require чтобы rivers.js взял зависимости из root
  console,
  Number,
  Math,
  Float32Array,
  Uint8Array,
  Uint8ClampedArray,
  Int32Array,
  Array,
  Object,
  Error,
  Infinity,
  parseInt,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// Load engine/noise.js
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;

// Публикуем ключевые символы в root, чтобы rivers.js их подхватил
ctx.mulberry32        = noiseExports.mulberry32;
ctx.getHeight         = noiseExports.getHeight;
ctx.PerlinNoise       = noiseExports.PerlinNoise;
ctx.fbm               = noiseExports.fbm;
ctx.domainWarp        = noiseExports.domainWarp;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// Load engine/rivers.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(riversPath, 'utf8'), ctx, { filename: riversPath });
const riversExports = ctx.module.exports;

const { traceRiver, generateRivers, MOUNTAIN_H, WATER_H, MIN_RIVER_LEN } = riversExports;
const { generateHeightmap, getHeight } = noiseExports;

// ──────────────────────────────────────────────────────────
// Тест-раннер
// ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name + ' — ' + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ──────────────────────────────────────────────────────────
// Утилита: искусственный heightmap с гарантированной горой и озером
// ──────────────────────────────────────────────────────────
function makeRampedHeightmap(W, H) {
  // Гора слева (h ≈ 1.0) → вода справа (h ≈ 0.0).
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      data[y * W + x] = 1 - x / (W - 1);
    }
  }
  return { data, width: W, height: H };
}

// Искусственный heightmap — плато без гор (h ≈ 0.5 повсюду).
function makeFlatHeightmap(W, H, v) {
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = v;
  return { data, width: W, height: H };
}

// ──────────────────────────────────────────────────────────
// Тесты
// ──────────────────────────────────────────────────────────
console.log('═══ Шаг 7 (arma.md) — Rivers: trace + generate ═══');

console.log('\n[API surface]');

test('traceRiver is a function', () => {
  assert(typeof traceRiver === 'function');
});

test('generateRivers is a function', () => {
  assert(typeof generateRivers === 'function');
});

test('MOUNTAIN_H === 0.78 (spec)', () => {
  assert(Math.abs(MOUNTAIN_H - 0.78) < 1e-12, 'got ' + MOUNTAIN_H);
});

test('WATER_H === 0.20 (spec)', () => {
  assert(Math.abs(WATER_H - 0.20) < 1e-12, 'got ' + WATER_H);
});

test('MIN_RIVER_LEN === 20 (spec)', () => {
  assert(MIN_RIVER_LEN === 20, 'got ' + MIN_RIVER_LEN);
});

// ── traceRiver: базовая трассировка ──────────────────────
console.log('\n[traceRiver — рампа гора→вода]');

test('идёт от горы к воде и завершается при h < 0.20', () => {
  const hm = makeRampedHeightmap(100, 20);
  // Стартуем слева (h≈1)
  const path = traceRiver(hm, 0, 10, 10000);
  assert(path.length > 1, 'path len=' + path.length);

  const first = path[0];
  const last  = path[path.length - 1];
  const hFirst = getHeight(hm, first.x, first.y);
  const hLast  = getHeight(hm, last.x,  last.y);

  assert(hFirst > hLast, `first=${hFirst} <= last=${hLast}`);
  assert(hLast  < 0.20 + 1e-9, 'last h=' + hLast + ' not in water');
});

test('путь монотонно убывает по высоте', () => {
  const hm = makeRampedHeightmap(80, 10);
  const path = traceRiver(hm, 0, 5, 10000);
  for (let i = 1; i < path.length; i++) {
    const a = getHeight(hm, path[i - 1].x, path[i - 1].y);
    const b = getHeight(hm, path[i].x, path[i].y);
    assert(b < a, `step ${i}: ${a} → ${b} (not strictly descending)`);
  }
});

test('maxSteps ограничивает длину пути', () => {
  const hm = makeRampedHeightmap(200, 10);
  const path = traceRiver(hm, 0, 5, 5);
  assert(path.length === 5, 'len=' + path.length);
});

test('плато: не падает и ограничен maxSteps/visited', () => {
  // На идеально плоской карте (h=0.5) смягчённый алгоритм разрешает
  // боковой ход (равные сглаженные высоты). Гарантии:
  //   - путь не крашит;
  //   - ограничен maxSteps и числом уникальных клеток (visited);
  //   - первая точка = старт.
  const hm = makeFlatHeightmap(30, 30, 0.5);
  const path = traceRiver(hm, 15, 15, 100);
  assert(path.length >= 1 && path.length <= 100, 'len=' + path.length);
  assert(path[0].x === 15 && path[0].y === 15);
  // Уникальность клеток (visited гарантирует)
  const seen = new Set();
  for (const p of path) {
    const key = p.x + ',' + p.y;
    assert(!seen.has(key), 'dup cell ' + key);
    seen.add(key);
  }
});

test('старт в воде: стоп сразу (h < 0.20)', () => {
  const hm = makeFlatHeightmap(20, 20, 0.1);
  const path = traceRiver(hm, 10, 10, 100);
  assert(path.length === 1, 'len=' + path.length);
});

test('пустой heightmap → []', () => {
  const path = traceRiver(null, 0, 0, 10);
  assert(Array.isArray(path) && path.length === 0);
});

test('старт вне границ (clamp) не крашит', () => {
  const hm = makeRampedHeightmap(50, 20);
  const path = traceRiver(hm, -5, -5, 100);
  assert(Array.isArray(path));
  assert(path.length >= 1);
  // первый элемент — после clamp — должен быть в пределах
  assert(path[0].x >= 0 && path[0].y >= 0);
});

test('нет бесконечных циклов на синтетических картах', () => {
  // Проверка visited: максимум W*H шагов.
  const hm = makeRampedHeightmap(40, 40);
  const path = traceRiver(hm, 0, 20, 100000);
  assert(path.length <= 40 * 40, 'path too long: ' + path.length);
});

// ── generateRivers: детерминированность и фильтрация ──────
console.log('\n[generateRivers — реальный heightmap через domainWarp]');

test('возвращает массив; на случайном heightmap есть хотя бы одна река', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 10, 42);
  assert(Array.isArray(rivers));
  // На 256×256 у domainWarp почти гарантированно есть длинные спуски гор→вода.
  assert(rivers.length >= 1, 'no rivers generated');
  // Не больше стартов
  assert(rivers.length <= 10, 'too many: ' + rivers.length);
});

test('каждая река — { path, width }, width = 1 + len/80', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 10, 42);
  for (const r of rivers) {
    assert(Array.isArray(r.path), 'no path');
    assert(r.path.length >= MIN_RIVER_LEN, 'short river: ' + r.path.length);
    const expectedW = 1 + r.path.length / 80;
    assert(Math.abs(r.width - expectedW) < 1e-9,
           `width=${r.width} vs ${expectedW}`);
  }
});

test('первый элемент каждой реки — в горном биоме (h > 0.78)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  for (const r of rivers) {
    const h0 = getHeight(hm, r.path[0].x, r.path[0].y);
    assert(h0 > MOUNTAIN_H - 1e-9,
           'start not in mountain: h=' + h0);
  }
});

test('последний элемент реки — ниже первого', () => {
  const hm = generateHeightmap(256, 256, 42);
  const rivers = generateRivers(hm, 8, 42);
  for (const r of rivers) {
    const h0 = getHeight(hm, r.path[0].x, r.path[0].y);
    const h1 = getHeight(hm, r.path[r.path.length - 1].x, r.path[r.path.length - 1].y);
    assert(h1 < h0, `h0=${h0} last=${h1}`);
  }
});

test('детерминированность: два вызова с одним seed дают идентичные реки', () => {
  const hm = generateHeightmap(256, 256, 42);
  const a = generateRivers(hm, 8, 1234);
  const b = generateRivers(hm, 8, 1234);
  assert(a.length === b.length, `len mismatch: ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].path.length === b[i].path.length, 'path len mismatch #' + i);
    for (let j = 0; j < a[i].path.length; j++) {
      assert(a[i].path[j].x === b[i].path[j].x &&
             a[i].path[j].y === b[i].path[j].y,
             'point mismatch ' + i + '/' + j);
    }
  }
});

test('разные seed → разные стартовые точки (скорее всего)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const a = generateRivers(hm, 6, 1);
  const b = generateRivers(hm, 6, 999);
  if (a.length > 0 && b.length > 0) {
    const sa = a.map(r => r.path[0].x + ',' + r.path[0].y).sort().join('|');
    const sb = b.map(r => r.path[0].x + ',' + r.path[0].y).sort().join('|');
    assert(sa !== sb, 'same starts across seeds');
  }
});

test('count=0 → пустой массив', () => {
  const hm = generateHeightmap(64, 64, 42);
  const rivers = generateRivers(hm, 0, 42);
  assert(rivers.length === 0);
});

test('без гор (плоская карта) → пустой массив', () => {
  const hm = makeFlatHeightmap(50, 50, 0.5);
  const rivers = generateRivers(hm, 5, 42);
  assert(rivers.length === 0, 'got ' + rivers.length);
});

test('пустой heightmap → пустой массив, без краша', () => {
  assert(generateRivers(null, 5, 1).length === 0);
  assert(generateRivers({ data: new Float32Array(0), width: 0, height: 0 }, 5, 1).length === 0);
});

test('count больше числа гор → не бросает, берёт сколько есть', () => {
  // Маленькая карта с единственной "горой" в одном пикселе.
  const W = 20, H = 20;
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = 0.1;
  data[0] = 0.95;             // одна гора
  // создаём ступеньку для трассировки
  for (let x = 0; x < W; x++) data[x] = Math.max(0.1, 0.95 - x * 0.1);
  const hm = { data, width: W, height: H };
  const rivers = generateRivers(hm, 99, 7); // просим 99 стартов
  assert(Array.isArray(rivers));
});

test('фильтрация: реки короче MIN_RIVER_LEN выкидываются', () => {
  // Крохотная рампа → путь длиной ровно 5 точек (меньше 20).
  const hm = makeRampedHeightmap(5, 3);
  // Поднимем один пиксель до "горы":
  hm.data[0] = 0.95;
  hm.data[1] = 0.85;  // h>0.78 — ещё одна "гора"
  const rivers = generateRivers(hm, 5, 1);
  assert(rivers.length === 0, 'short rivers should be filtered: ' + rivers.length);
});

// ── Итог ─────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
