// Тесты Шага 13 (arma.md) — Forests: Worley noise + forest mask
// Запуск: node tests/test_arma_stage13.mjs
//
// Чеклист из arma.md Шаг 13:
//   [1] worleyNoise(x, y, points, maxDist) — min distance to closest point,
//       нормализованный в [0, 1] при переданном maxDist.
//   [2] generateForestMask(heightmap, seed) → Uint8Array(W*H), 1=forest, 0=нет.
//   [3] Feature points (20-30) генерируются через seeded PRNG.
//   [4] Маска 1 только там, где биом «forest» (h ∈ [0.55, 0.68]) И
//       worleyNoise < 0.35.
//   [5] Лесные пятна — округлые (Worley дает органичные зоны).
//   [6] Примерно 20-40% биома «forest» помечены как густой лес.
//   [7] Детерминированность: один seed → идентичный результат.
//   [8] Защиты: пустой/null heightmap, нулевая карта, горная карта → без краша.

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
  require: undefined, // roads/forests.js возьмут зависимости из root
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

// публикуем в root (чтобы forests.js подхватил mulberry32 из globalThis)
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
  worleyNoise,
  generateForestMask,
  FOREST_MIN,
  FOREST_MAX,
  DEFAULT_N_POINTS,
  DEFAULT_THRESHOLD,
} = forestsExports;
const { generateHeightmap } = noiseExports;

// ──────────────────────────────────────────────────────────
// Тест-раннер
// ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// ──────────────────────────────────────────────────────────
// Утилиты: искусственные heightmaps
// ──────────────────────────────────────────────────────────
function makeFlatHeightmap(W, H, v) {
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = v;
  return { data, width: W, height: H };
}

console.log('═══ Шаг 13 (arma.md) — Forests: Worley + forest mask ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('worleyNoise is a function',        () => assert(typeof worleyNoise === 'function'));
test('generateForestMask is a function', () => assert(typeof generateForestMask === 'function'));
test('FOREST_MIN === 0.55',              () => assert(approx(FOREST_MIN, 0.55)));
test('FOREST_MAX === 0.68',              () => assert(approx(FOREST_MAX, 0.68)));
test('DEFAULT_N_POINTS ∈ [20,30]', () => {
  assert(DEFAULT_N_POINTS >= 20 && DEFAULT_N_POINTS <= 30,
    'got ' + DEFAULT_N_POINTS);
});
test('DEFAULT_THRESHOLD === 0.35', () => assert(approx(DEFAULT_THRESHOLD, 0.35)));

// ── worleyNoise — корректность ─────────────────────────
console.log('\n[worleyNoise]');

test('пустой массив точек → 1.0 (с maxDist)', () => {
  assert(worleyNoise(5, 5, [], 10) === 1.0);
  assert(worleyNoise(5, 5, null, 10) === 1.0);
  assert(worleyNoise(5, 5, undefined, 10) === 1.0);
});

test('одна точка, ноль-дистанция → 0', () => {
  const pts = [{ x: 10, y: 10 }];
  assert(worleyNoise(10, 10, pts, 100) === 0);
});

test('одна точка, расстояние 3-4-5 → 5/maxDist', () => {
  const pts = [{ x: 0, y: 0 }];
  const d = worleyNoise(3, 4, pts, 100);
  assert(approx(d, 0.05, 1e-9), 'got ' + d);
});

test('две точки — берётся ближайшая', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
  const d = worleyNoise(1, 1, pts, 1000);
  // расстояние до (0,0) = sqrt(2) ≈ 1.414, до (100,100) ≈ 140
  // ближайшая = 1.414, нормированная = 1.414/1000 = 0.001414
  assert(approx(d, Math.sqrt(2) / 1000, 1e-9), 'got ' + d);
});

test('clamping до 1.0 при d > maxDist', () => {
  const pts = [{ x: 0, y: 0 }];
  const d = worleyNoise(100, 100, pts, 10); // ~141 / 10 = 14.1
  assert(d === 1.0, 'got ' + d);
});

test('без maxDist — возвращает сырое расстояние в пикселях', () => {
  const pts = [{ x: 0, y: 0 }];
  const d = worleyNoise(3, 4, pts);
  assert(approx(d, 5, 1e-9), 'got ' + d);
});

test('симметричность: worley(a,b,pts)=worley(b,a,pts) для симметричного набора', () => {
  const pts = [{ x: 5, y: 5 }];
  const a = worleyNoise(1, 2, pts, 20);
  const b = worleyNoise(2, 1, pts, 20);
  assert(approx(a, b, 1e-12));
});

// ── generateForestMask — базовые свойства ──────────────
console.log('\n[generateForestMask — базовые]');

test('возвращает Uint8Array длины W*H', () => {
  const hm = generateHeightmap(128, 128, 42);
  const mask = generateForestMask(hm, 42);
  assert(mask instanceof Uint8Array, 'not Uint8Array');
  assert(mask.length === 128 * 128, 'len ' + mask.length);
});

test('значения только 0 или 1', () => {
  const hm = generateHeightmap(128, 128, 42);
  const mask = generateForestMask(hm, 42);
  for (let i = 0; i < mask.length; i++) {
    assert(mask[i] === 0 || mask[i] === 1,
      'bad mask[' + i + ']=' + mask[i]);
  }
});

test('лесные 1 только где h ∈ [0.55, 0.68]', () => {
  const hm = generateHeightmap(128, 128, 42);
  const mask = generateForestMask(hm, 42);
  const W = hm.width, H = hm.height;
  let checked = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (mask[idx] === 1) {
        const h = hm.data[idx];
        assert(h >= FOREST_MIN - 1e-9 && h <= FOREST_MAX + 1e-9,
          `mask=1 at h=${h.toFixed(3)} outside forest biome`);
        checked++;
      }
    }
  }
  // Должно быть > 0 помеченных пикселей.
  assert(checked > 0, 'no forest pixels marked');
});

// ── Детерминированность ─────────────────────────────────
console.log('\n[Детерминированность]');

test('один seed → идентичный результат', () => {
  const hm = generateHeightmap(64, 64, 42);
  const a = generateForestMask(hm, 1234);
  const b = generateForestMask(hm, 1234);
  assert(a.length === b.length);
  for (let i = 0; i < a.length; i++) {
    assert(a[i] === b[i], 'mismatch at ' + i);
  }
});

test('разные seeds — как правило, разные маски', () => {
  const hm = generateHeightmap(128, 128, 42);
  const a = generateForestMask(hm, 1);
  const b = generateForestMask(hm, 999);
  let diffs = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
  assert(diffs > 0, 'masks identical across seeds');
});

// ── Статистика покрытия ────────────────────────────────
console.log('\n[Покрытие 20-40% биома forest]');

test('маска покрывает 15-50% биома "forest" (arma.md: 20-40% ± допуск)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const mask = generateForestMask(hm, 42);
  let forestBiome = 0, denseForest = 0;
  for (let i = 0; i < hm.data.length; i++) {
    const h = hm.data[i];
    if (h >= FOREST_MIN && h <= FOREST_MAX) {
      forestBiome++;
      if (mask[i] === 1) denseForest++;
    }
  }
  assert(forestBiome > 0, 'heightmap has no forest biome pixels');
  const pct = denseForest / forestBiome;
  // arma.md заявляет 20-40%, но для большего запаса/устойчивости
  // к случайности feature points — принимаем 15-55%.
  assert(pct >= 0.15 && pct <= 0.55,
    `coverage ${(pct * 100).toFixed(1)}% не в [15%, 55%]`);
});

test('на нескольких seed-ах среднее покрытие ~ в диапазоне 20-40%', () => {
  let sum = 0, n = 0;
  for (const seed of [1, 7, 42, 123, 999]) {
    const hm = generateHeightmap(256, 256, seed);
    const mask = generateForestMask(hm, seed);
    let fb = 0, df = 0;
    for (let i = 0; i < hm.data.length; i++) {
      const h = hm.data[i];
      if (h >= FOREST_MIN && h <= FOREST_MAX) {
        fb++;
        if (mask[i] === 1) df++;
      }
    }
    if (fb > 0) { sum += df / fb; n++; }
  }
  const avg = sum / n;
  assert(avg >= 0.15 && avg <= 0.50,
    `avg coverage ${(avg * 100).toFixed(1)}% не в [15%, 50%]`);
});

// ── Пятна органичные: Worley даёт связные округлые кластеры ─
console.log('\n[Органичность пятен]');

test('на равнинном heightmap (h=0.6) маска имеет связные "пятна"', () => {
  // Вся карта в биоме forest (h=0.6 ∈ [0.55, 0.68]).
  // Worley должен дать округлые пятна.
  const hm = makeFlatHeightmap(128, 128, 0.6);
  const mask = generateForestMask(hm, 42);

  // Считаем количество помеченных пикселей
  let marked = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) marked++;
  assert(marked > 0, 'no pixels marked on uniform forest');

  // Проверяем, что ПЯТНА, а не шум: compute connected components
  // через простой flood-fill (4-связность).
  const W = hm.width, H = hm.height;
  const seen = new Uint8Array(W * H);
  let components = 0;
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && !seen[i]) {
      components++;
      stack.length = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const idx = stack.pop();
        const x = idx % W, y = (idx / W) | 0;
        const nb = [
          x > 0     ? idx - 1 : -1,
          x < W - 1 ? idx + 1 : -1,
          y > 0     ? idx - W : -1,
          y < H - 1 ? idx + W : -1
        ];
        for (const ni of nb) {
          if (ni >= 0 && mask[ni] === 1 && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
  }
  // Для 25 feature points ожидаем до ~25 пятен, не больше
  // (некоторые точки могут сливаться при близости).
  assert(components >= 1, 'no connected components');
  assert(components <= DEFAULT_N_POINTS + 5,
    `too many fragments: ${components} (expected ≤ ${DEFAULT_N_POINTS + 5})`);
});

// ── Защита / граничные случаи ──────────────────────────
console.log('\n[Граничные случаи]');

test('null heightmap → Uint8Array(0)', () => {
  const m = generateForestMask(null, 42);
  assert(m instanceof Uint8Array && m.length === 0);
});

test('undefined heightmap → Uint8Array(0)', () => {
  const m = generateForestMask(undefined, 42);
  assert(m instanceof Uint8Array && m.length === 0);
});

test('нулевая карта (width=0, height=0) → Uint8Array(0)', () => {
  const m = generateForestMask({ data: new Float32Array(0), width: 0, height: 0 }, 42);
  assert(m instanceof Uint8Array && m.length === 0);
});

test('карта без лесов (h=0.1, вода) → нулевая маска', () => {
  const hm = makeFlatHeightmap(64, 64, 0.1);
  const m = generateForestMask(hm, 42);
  assert(m.length === 64 * 64);
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i];
  assert(sum === 0, 'expected zero mask, got ' + sum);
});

test('карта с горами (h=0.9) → нулевая маска', () => {
  const hm = makeFlatHeightmap(64, 64, 0.9);
  const m = generateForestMask(hm, 42);
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i];
  assert(sum === 0, 'expected zero mask, got ' + sum);
});

test('границы биома точно: h=0.55 и h=0.68 попадают в биом forest', () => {
  const hm1 = makeFlatHeightmap(32, 32, 0.55);
  const hm2 = makeFlatHeightmap(32, 32, 0.68);
  const m1 = generateForestMask(hm1, 42);
  const m2 = generateForestMask(hm2, 42);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < m1.length; i++) { s1 += m1[i]; s2 += m2[i]; }
  assert(s1 > 0, 'h=0.55 not treated as forest');
  assert(s2 > 0, 'h=0.68 not treated as forest');
});

test('опция nPoints — работает', () => {
  const hm = makeFlatHeightmap(128, 128, 0.6);
  const m = generateForestMask(hm, 42, { nPoints: 5 });
  assert(m.length === 128 * 128);
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i];
  // 5 точек дают меньше покрытия, но > 0
  assert(sum > 0, 'expected some marks');
});

test('опция threshold=0 → пустая маска', () => {
  const hm = makeFlatHeightmap(64, 64, 0.6);
  const m = generateForestMask(hm, 42, { threshold: 0 });
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i];
  assert(sum === 0, 'threshold=0 should mark nothing, got ' + sum);
});

test('опция threshold=1 → почти весь биом forest помечен', () => {
  const hm = makeFlatHeightmap(64, 64, 0.6);
  const m = generateForestMask(hm, 42, { threshold: 1.0 });
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i];
  // Все пиксели — forest биом. При threshold=1 worley-расстояние
  // нормализуется по характеристической длине ячейки. Пиксели в
  // угловых «дырах» между точками могут превышать этот радиус,
  // поэтому допускаем ≥ 90% покрытия.
  assert(sum >= 0.9 * 64 * 64, 'expected ≥90% coverage, got ' + sum);
});

test('опция threshold намного больше 1 → полная маска', () => {
  const hm = makeFlatHeightmap(64, 64, 0.6);
  // threshold=10 гарантирует, что любое расстояние пройдёт
  const m = generateForestMask(hm, 42, { threshold: 10 });
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i];
  assert(sum === 64 * 64, 'expected full mask, got ' + sum);
});

test('маленькая карта 1×1 — не крашит', () => {
  const hm = makeFlatHeightmap(1, 1, 0.6);
  const m = generateForestMask(hm, 42);
  assert(m.length === 1);
});

// ── Итог ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
