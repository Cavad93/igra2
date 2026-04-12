// Тесты Шага 10 (arma.md) — Roads: generateKeyPoints
// Запуск: node tests/test_arma_stage10.mjs
//
// Чеклист из arma.md Шаг 10:
//   [1] generateKeyPoints(heightmap, 5, 42) → массив 3–5 точек.
//   [2] Все точки лежат на равнинных биомах (h в [0.35, 0.60]).
//   [3] Расстояние между любыми двумя точками > width/4.
//   [4] Детерминированность по seed (равные результаты).
//   [5] Код защиты: пустой heightmap, count=0, нет равнин и т.п.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const roadsPath = resolve(__dirname, '..', 'engine', 'roads.js');

// ──────────────────────────────────────────────────────────
// VM-контекст
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  require: undefined, // отключаем require чтобы roads.js взял зависимости из root
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

// Публикуем в root
ctx.mulberry32        = noiseExports.mulberry32;
ctx.getHeight         = noiseExports.getHeight;
ctx.PerlinNoise       = noiseExports.PerlinNoise;
ctx.fbm               = noiseExports.fbm;
ctx.domainWarp        = noiseExports.domainWarp;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// Load engine/roads.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(roadsPath, 'utf8'), ctx, { filename: roadsPath });
const roadsExports = ctx.module.exports;

const { generateKeyPoints, PLAIN_MIN, PLAIN_MAX } = roadsExports;
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
// Утилиты: искусственные heightmaps
// ──────────────────────────────────────────────────────────
function makeFlatHeightmap(W, H, v) {
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = v;
  return { data, width: W, height: H };
}

function makeNoPlainHeightmap(W, H) {
  // Всё вода (h=0.1) — ниже PLAIN_MIN
  return makeFlatHeightmap(W, H, 0.1);
}

// ──────────────────────────────────────────────────────────
// Тесты
// ──────────────────────────────────────────────────────────
console.log('═══ Шаг 10 (arma.md) — Roads: generateKeyPoints ═══');

console.log('\n[API surface]');

test('generateKeyPoints is a function', () => {
  assert(typeof generateKeyPoints === 'function');
});

test('PLAIN_MIN === 0.35 (spec)', () => {
  assert(Math.abs(PLAIN_MIN - 0.35) < 1e-12, 'got ' + PLAIN_MIN);
});

test('PLAIN_MAX === 0.60 (spec)', () => {
  assert(Math.abs(PLAIN_MAX - 0.60) < 1e-12, 'got ' + PLAIN_MAX);
});

// ── Базовая генерация на реальном heightmap ──────────────
console.log('\n[generateKeyPoints — реальный heightmap через domainWarp]');

test('возвращает массив 3–5 точек для count=5 на 256×256', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  assert(Array.isArray(pts), 'not array');
  assert(pts.length >= 3, 'too few: ' + pts.length);
  assert(pts.length <= 5, 'too many: ' + pts.length);
});

test('каждая точка — { x, y, name:"city_N" }', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    assert(Number.isFinite(p.x), 'no x');
    assert(Number.isFinite(p.y), 'no y');
    assert(typeof p.name === 'string', 'no name');
    assert(p.name === 'city_' + (i + 1),
           `name mismatch: ${p.name} vs city_${i + 1}`);
  }
});

test('все точки лежат в равнинной зоне (0.35 ≤ h ≤ 0.60)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  for (const p of pts) {
    const h = getHeight(hm, p.x, p.y);
    assert(h >= 0.35 - 1e-9 && h <= 0.60 + 1e-9,
           `point (${p.x},${p.y}) h=${h} not in plain range`);
  }
});

test('все точки в пределах карты', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  for (const p of pts) {
    assert(p.x >= 0 && p.x < hm.width,  'x out of bounds: ' + p.x);
    assert(p.y >= 0 && p.y < hm.height, 'y out of bounds: ' + p.y);
  }
});

test('попарное расстояние > width/4', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  const minDist = hm.width / 4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      assert(d >= minDist,
        `pair (${i},${j}) dist=${d.toFixed(2)} < minDist=${minDist}`);
    }
  }
});

test('детерминированность: два вызова с одним seed → идентичный результат', () => {
  const hm = generateHeightmap(256, 256, 42);
  const a = generateKeyPoints(hm, 5, 1234);
  const b = generateKeyPoints(hm, 5, 1234);
  assert(a.length === b.length, `len mismatch: ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].x === b[i].x && a[i].y === b[i].y,
      `point ${i} differs: (${a[i].x},${a[i].y}) vs (${b[i].x},${b[i].y})`);
    assert(a[i].name === b[i].name, `name ${i} differs`);
  }
});

test('разные seed → (как правило) разные точки', () => {
  const hm = generateHeightmap(256, 256, 42);
  const a = generateKeyPoints(hm, 5, 1);
  const b = generateKeyPoints(hm, 5, 999);
  if (a.length > 0 && b.length > 0) {
    const sa = a.map(p => p.x + ',' + p.y).sort().join('|');
    const sb = b.map(p => p.x + ',' + p.y).sort().join('|');
    assert(sa !== sb, 'same points across seeds');
  }
});

// ── Защита / граничные случаи ────────────────────────────
console.log('\n[Граничные случаи]');

test('count=0 → пустой массив', () => {
  const hm = generateHeightmap(64, 64, 42);
  const pts = generateKeyPoints(hm, 0, 42);
  assert(Array.isArray(pts) && pts.length === 0);
});

test('отрицательный count → пустой массив', () => {
  const hm = generateHeightmap(64, 64, 42);
  const pts = generateKeyPoints(hm, -3, 42);
  assert(Array.isArray(pts) && pts.length === 0);
});

test('пустой heightmap → пустой массив, без краша', () => {
  assert(generateKeyPoints(null, 5, 1).length === 0);
  assert(generateKeyPoints(undefined, 5, 1).length === 0);
  assert(generateKeyPoints({ data: new Float32Array(0), width: 0, height: 0 }, 5, 1).length === 0);
});

test('нет равнинных пикселей (h=0.1) → пустой массив', () => {
  const hm = makeNoPlainHeightmap(64, 64);
  const pts = generateKeyPoints(hm, 5, 42);
  assert(pts.length === 0, 'got ' + pts.length);
});

test('нет равнин (h=0.9, горы) → пустой массив', () => {
  const hm = makeFlatHeightmap(64, 64, 0.9);
  const pts = generateKeyPoints(hm, 5, 42);
  assert(pts.length === 0, 'got ' + pts.length);
});

test('однородная равнина (h=0.45) → выдаёт точки с minDist', () => {
  const hm = makeFlatHeightmap(200, 200, 0.45);
  const pts = generateKeyPoints(hm, 5, 42);
  // На 200×200 minDist=50 — теоретически умещается 3–5 точек в случайной расстановке.
  assert(pts.length >= 1, 'expected some points');
  assert(pts.length <= 5, 'too many: ' + pts.length);

  const minDist = 200 / 4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      assert(d >= minDist,
        `pair (${i},${j}) dist=${d.toFixed(2)} < minDist=${minDist}`);
    }
  }
});

test('маленькая карта (width < 4) — не крашит', () => {
  const hm = makeFlatHeightmap(3, 3, 0.45);
  const pts = generateKeyPoints(hm, 5, 42);
  assert(Array.isArray(pts));
});

test('count очень большой — жадно набирает столько, сколько умещается', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 100, 42);
  // Не может быть больше, чем геометрия разрешает при minDist=64.
  // Не проверяем точное число (зависит от шума), но не > 100 и > 0.
  assert(Array.isArray(pts));
  assert(pts.length >= 1, 'expected at least one');
  assert(pts.length <= 100);
  // minDist должен всё ещё выполняться
  const minDist = hm.width / 4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      assert(d >= minDist, `pair dist ${d} < ${minDist}`);
    }
  }
});

test('имена city_1, city_2, ... идут по порядку', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  for (let i = 0; i < pts.length; i++) {
    assert(pts[i].name === 'city_' + (i + 1), 'bad name: ' + pts[i].name);
  }
});

// ── Итог ─────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
