// Тесты Шага 2 (arma.md) — Perlin noise + fBm + Domain Warping
// Запуск: node tests/test_arma_stage2.mjs
//
// Чеклист из arma.md Шаг 2:
//   [1] Файл engine/noise.js существует (чистый модуль, без зависимостей)
//   [2] Экспортирует mulberry32, PerlinNoise, fbm, domainWarp
//   [3] mulberry32(seed) — seeded 32-bit PRNG, значения в [0, 1), детерминирован
//   [4] class PerlinNoise:
//         - конструктор принимает seed (число)
//         - permutation table длины 512 (256 дважды), заполнена через seeded shuffle
//         - метод noise2d(x, y) → число в [-1, 1] (fade 6t⁵-15t⁴+10t³, bilinear lerp)
//   [5] fbm(noise, x, y, octaves, persistence, lacunarity) → число в [0, 1]
//         - persistence default 0.5, lacunarity default 2.0
//         - суммирует octaves слоёв, нормализует в [0, 1]
//   [6] domainWarp(noise, x, y, octaves, warpStrength) → число в [0, 1]
//         - первый проход qx = fbm(x, y), qy = fbm(x+5.2, y+1.3)
//         - второй проход rx = fbm(x + warp*qx, y + warp*qy)
//   [7] Тест из arma.md: fbm(noise, 0.3, 0.7, 6, 0.5, 2.0) → число в [0, 1]
//   [8] Тест из arma.md: domainWarp(noise, 0.3, 0.7, 6, 1.2) → число в [0, 1]
//   [9] Детерминированность: тот же seed — идентичный результат
//  [10] Органичность: нет прямых линий, значения варьируются по всей карте 200×200

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const src = readFileSync(noisePath, 'utf8');

// engine/noise.js — classical script; run in isolated VM context
// (package.json has "type": "module", so require for .js doesn't work).
const ctx = { module: { exports: {} }, window: undefined };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: noisePath });

const { mulberry32, PerlinNoise, fbm, domainWarp } = ctx.module.exports;

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

console.log('═══ Шаг 2 (arma.md) — Perlin + fBm + Domain Warping ═══');

// ── Экспорт модуля ────────────────────────────────────
console.log('\n[engine/noise.js — экспорт]');

test('exports mulberry32 (function)', () => {
  assert(typeof mulberry32 === 'function', 'mulberry32 missing');
});

test('exports PerlinNoise (constructor)', () => {
  assert(typeof PerlinNoise === 'function', 'PerlinNoise missing');
});

test('exports fbm (function)', () => {
  assert(typeof fbm === 'function', 'fbm missing');
});

test('exports domainWarp (function)', () => {
  assert(typeof domainWarp === 'function', 'domainWarp missing');
});

// ── mulberry32: seeded PRNG ───────────────────────────
console.log('\n[mulberry32 — seeded PRNG]');

test('returns a function', () => {
  const rng = mulberry32(42);
  assert(typeof rng === 'function', 'not a function');
});

test('output is in [0, 1)', () => {
  const rng = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert(v >= 0 && v < 1, 'out of range: ' + v);
  }
});

test('deterministic — same seed yields same sequence', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    assert(a() === b(), 'diverged at i=' + i);
  }
});

test('different seeds yield different sequences', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let diffs = 0;
  for (let i = 0; i < 100; i++) {
    if (a() !== b()) diffs++;
  }
  assert(diffs > 90, 'only ' + diffs + '/100 differ');
});

test('statistical distribution — mean ~0.5', () => {
  const rng = mulberry32(42);
  let sum = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) sum += rng();
  const mean = sum / N;
  assert(Math.abs(mean - 0.5) < 0.02,
         'mean off: ' + mean + ' (expected ~0.5)');
});

// ── PerlinNoise: construction + permutation ───────────
console.log('\n[PerlinNoise — construction]');

test('constructible with seed', () => {
  const n = new PerlinNoise(42);
  assert(n && typeof n === 'object', 'not an object');
});

test('has permutation table of length 512', () => {
  const n = new PerlinNoise(42);
  assert(n.perm && n.perm.length === 512,
         'perm length=' + (n.perm && n.perm.length));
});

test('permutation table second half mirrors first', () => {
  const n = new PerlinNoise(42);
  for (let i = 0; i < 256; i++) {
    assert(n.perm[i] === n.perm[i + 256], 'mirror broken at i=' + i);
  }
});

test('permutation table first 256 is a bijection 0..255', () => {
  const n = new PerlinNoise(42);
  const seen = new Uint8Array(256);
  for (let i = 0; i < 256; i++) seen[n.perm[i]] = 1;
  for (let i = 0; i < 256; i++) assert(seen[i] === 1, 'missing value ' + i);
});

test('same seed → same permutation table', () => {
  const a = new PerlinNoise(42);
  const b = new PerlinNoise(42);
  for (let i = 0; i < 512; i++) {
    assert(a.perm[i] === b.perm[i], 'diverged at i=' + i);
  }
});

test('different seeds → different permutation tables', () => {
  const a = new PerlinNoise(1);
  const b = new PerlinNoise(2);
  let diffs = 0;
  for (let i = 0; i < 256; i++) {
    if (a.perm[i] !== b.perm[i]) diffs++;
  }
  assert(diffs > 200, 'tables too similar: ' + diffs + '/256');
});

// ── noise2d: диапазон и детерминированность ───────────
console.log('\n[noise2d — диапазон и детерминированность]');

test('noise2d returns a finite number', () => {
  const n = new PerlinNoise(42);
  const v = n.noise2d(0.3, 0.7);
  assert(Number.isFinite(v), 'not finite: ' + v);
});

test('noise2d output approximately in [-1, 1]', () => {
  const n = new PerlinNoise(42);
  let mn = Infinity, mx = -Infinity;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const v = n.noise2d(x * 0.1, y * 0.1);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  // Ken Perlin 2D improved noise: theoretical range ≈ [-sqrt(2)/2, sqrt(2)/2] ≈ [-0.707, 0.707]
  // but implementations with 8-direction gradients stay well within [-1, 1].
  assert(mn >= -1.001 && mx <= 1.001,
         'noise2d out of [-1, 1]: min=' + mn + ' max=' + mx);
  assert(mx - mn > 0.3, 'noise too flat: range=' + (mx - mn));
});

test('noise2d at integer lattice points ≈ 0', () => {
  // In Ken Perlin noise, gradient dot products vanish at integer grid corners.
  const n = new PerlinNoise(42);
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const v = n.noise2d(x, y);
      assert(Math.abs(v) < 1e-9, 'non-zero at integer ('+x+','+y+'): '+v);
    }
  }
});

test('noise2d is continuous (small step → small change)', () => {
  const n = new PerlinNoise(42);
  const a = n.noise2d(1.234, 5.678);
  const b = n.noise2d(1.234 + 1e-4, 5.678);
  assert(Math.abs(a - b) < 0.01, 'discontinuous: ' + Math.abs(a - b));
});

test('noise2d deterministic — same seed, same (x,y) → same value', () => {
  const a = new PerlinNoise(42);
  const b = new PerlinNoise(42);
  for (let i = 0; i < 20; i++) {
    const x = i * 0.37, y = i * 0.91;
    assert(a.noise2d(x, y) === b.noise2d(x, y),
           'diverged at (' + x + ',' + y + ')');
  }
});

// ── fbm: интеграция октав, диапазон, чеклист arma.md ──
console.log('\n[fbm — fractal brownian motion]');

test('fbm(noise, 0.3, 0.7, 6, 0.5, 2.0) in [0, 1]', () => {
  // Прямой чеклист arma.md Шаг 2.
  const n = new PerlinNoise(42);
  const v = fbm(n, 0.3, 0.7, 6, 0.5, 2.0);
  assert(Number.isFinite(v), 'not finite');
  assert(v >= 0 && v <= 1, 'out of [0,1]: ' + v);
});

test('fbm output always in [0, 1] over grid', () => {
  const n = new PerlinNoise(42);
  let mn = Infinity, mx = -Infinity;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const v = fbm(n, x * 0.1, y * 0.1, 6, 0.5, 2.0);
      assert(v >= 0 && v <= 1, 'out of range: ' + v);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  // В гранулированном fBm должна быть реальная вариация.
  assert(mx - mn > 0.3, 'fbm too flat: range=' + (mx - mn));
});

test('fbm defaults: octaves=6, persistence=0.5, lacunarity=2.0', () => {
  const n = new PerlinNoise(42);
  const a = fbm(n, 0.3, 0.7);
  const b = fbm(n, 0.3, 0.7, 6, 0.5, 2.0);
  assert(a === b, 'defaults mismatch: ' + a + ' vs ' + b);
});

test('fbm deterministic — same inputs give same output', () => {
  const n = new PerlinNoise(42);
  const a = fbm(n, 0.3, 0.7, 6, 0.5, 2.0);
  const b = fbm(n, 0.3, 0.7, 6, 0.5, 2.0);
  assert(a === b, 'non-deterministic: ' + a + ' vs ' + b);
});

test('fbm with more octaves → more detail (differs from fewer octaves)', () => {
  const n = new PerlinNoise(42);
  let diffs = 0;
  for (let i = 0; i < 50; i++) {
    const x = i * 0.13, y = i * 0.17;
    const low  = fbm(n, x, y, 2, 0.5, 2.0);
    const high = fbm(n, x, y, 8, 0.5, 2.0);
    if (Math.abs(low - high) > 1e-6) diffs++;
  }
  assert(diffs > 40, 'octaves had no effect: ' + diffs + '/50');
});

test('fbm uses persistence parameter', () => {
  const n = new PerlinNoise(42);
  let diffs = 0;
  for (let i = 0; i < 50; i++) {
    const x = i * 0.13, y = i * 0.17;
    const a = fbm(n, x, y, 6, 0.25, 2.0);
    const b = fbm(n, x, y, 6, 0.75, 2.0);
    if (Math.abs(a - b) > 1e-6) diffs++;
  }
  assert(diffs > 40, 'persistence had no effect: ' + diffs + '/50');
});

test('fbm uses lacunarity parameter', () => {
  const n = new PerlinNoise(42);
  let diffs = 0;
  for (let i = 0; i < 50; i++) {
    const x = i * 0.13, y = i * 0.17;
    const a = fbm(n, x, y, 6, 0.5, 1.5);
    const b = fbm(n, x, y, 6, 0.5, 3.0);
    if (Math.abs(a - b) > 1e-6) diffs++;
  }
  assert(diffs > 40, 'lacunarity had no effect: ' + diffs + '/50');
});

// ── domainWarp: двойной проход fBm ────────────────────
console.log('\n[domainWarp — двойной проход fBm]');

test('domainWarp(noise, 0.3, 0.7, 6, 1.2) in [0, 1]', () => {
  // Прямой чеклист arma.md Шаг 2.
  const n = new PerlinNoise(42);
  const v = domainWarp(n, 0.3, 0.7, 6, 1.2);
  assert(Number.isFinite(v), 'not finite');
  assert(v >= 0 && v <= 1, 'out of [0,1]: ' + v);
});

test('domainWarp output always in [0, 1] over grid', () => {
  const n = new PerlinNoise(42);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const v = domainWarp(n, x * 0.1, y * 0.1, 6, 1.2);
      assert(v >= 0 && v <= 1, 'out of range: ' + v);
    }
  }
});

test('domainWarp defaults: octaves=6, warpStrength=1.2', () => {
  const n = new PerlinNoise(42);
  const a = domainWarp(n, 0.3, 0.7);
  const b = domainWarp(n, 0.3, 0.7, 6, 1.2);
  assert(a === b, 'defaults mismatch: ' + a + ' vs ' + b);
});

test('domainWarp deterministic — same inputs give same output', () => {
  const n = new PerlinNoise(42);
  const a = domainWarp(n, 0.3, 0.7, 6, 1.2);
  const b = domainWarp(n, 0.3, 0.7, 6, 1.2);
  assert(a === b, 'non-deterministic: ' + a + ' vs ' + b);
});

test('domainWarp differs from plain fbm (warping changes result)', () => {
  const n = new PerlinNoise(42);
  let diffs = 0;
  for (let i = 0; i < 50; i++) {
    const x = i * 0.13, y = i * 0.17;
    const plain   = fbm(n, x, y, 6, 0.5, 2.0);
    const warped  = domainWarp(n, x, y, 6, 1.2);
    if (Math.abs(plain - warped) > 1e-6) diffs++;
  }
  assert(diffs > 40, 'warp had no effect: ' + diffs + '/50');
});

test('domainWarp with warpStrength=0 ≈ plain fbm', () => {
  // With zero displacement, second-pass fbm is evaluated at original (x,y)
  // so result should equal plain fbm(x, y).
  const n = new PerlinNoise(42);
  for (let i = 0; i < 10; i++) {
    const x = i * 0.3, y = i * 0.5;
    const warp  = domainWarp(n, x, y, 6, 0);
    const plain = fbm(n, x, y, 6, 0.5, 2.0);
    assert(Math.abs(warp - plain) < 1e-9,
           'diverged at i=' + i + ': ' + warp + ' vs ' + plain);
  }
});

test('domainWarp uses warpStrength (different strengths differ)', () => {
  const n = new PerlinNoise(42);
  let diffs = 0;
  for (let i = 0; i < 50; i++) {
    const x = i * 0.13, y = i * 0.17;
    const a = domainWarp(n, x, y, 6, 0.5);
    const b = domainWarp(n, x, y, 6, 2.0);
    if (Math.abs(a - b) > 1e-6) diffs++;
  }
  assert(diffs > 40, 'warpStrength had no effect: ' + diffs + '/50');
});

// ── Органичность: 200×200 карта, нет плоских зон ──────
console.log('\n[визуальная проверка — 200×200]');

test('200×200 domainWarp map has full value range', () => {
  // Чеклист arma.md: "нарисовать 200×200 пикселей grayscale — должна быть
  // органичная карта высот без прямых линий". Не рисуем canvas в Node, но
  // проверяем статистические свойства карты.
  const n = new PerlinNoise(42);
  let mn = Infinity, mx = -Infinity;
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const v = domainWarp(n, x / 200 * 3, y / 200 * 3, 6, 1.2);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  assert(mx - mn > 0.3, 'map too flat: range=' + (mx - mn));
  assert(mn >= 0 && mx <= 1, 'map out of [0,1]: ' + mn + '..' + mx);
});

test('200×200 map has no flat horizontal/vertical bands', () => {
  // Если бы рельеф повторялся строкой/столбцом — это "прямые линии".
  // Проверяем: в каждой строке и столбце значения варьируются.
  const n = new PerlinNoise(42);
  const W = 100, H = 100;
  const map = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      map[y * W + x] = domainWarp(n, x / W * 3, y / H * 3, 6, 1.2);
    }
  }
  // Каждая строка должна иметь вариацию.
  for (let y = 0; y < H; y++) {
    let mn = Infinity, mx = -Infinity;
    for (let x = 0; x < W; x++) {
      const v = map[y * W + x];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    assert(mx - mn > 0.01, 'row ' + y + ' too flat: range=' + (mx - mn));
  }
  // Каждый столбец должен иметь вариацию.
  for (let x = 0; x < W; x++) {
    let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < H; y++) {
      const v = map[y * W + x];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    assert(mx - mn > 0.01, 'col ' + x + ' too flat: range=' + (mx - mn));
  }
});

test('200×200 map deterministic with same seed', () => {
  const n1 = new PerlinNoise(42);
  const n2 = new PerlinNoise(42);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const a = domainWarp(n1, x / 50 * 3, y / 50 * 3, 6, 1.2);
      const b = domainWarp(n2, x / 50 * 3, y / 50 * 3, 6, 1.2);
      assert(a === b, 'mismatch at (' + x + ',' + y + ')');
    }
  }
});

// ── Итог ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
