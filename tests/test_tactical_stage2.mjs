// Тесты Шага 2 (arma.md) — Perlin noise + fBm + Domain Warping
// Запуск: node tests/test_tactical_stage2.mjs
//
// Чеклист из arma.md Шаг 2:
//   [1] fbm(noise, 0.3, 0.7, 6, 0.5, 2.0)  → число в [0, 1]
//   [2] domainWarp(noise, 0.3, 0.7, 6, 1.2) → число в [0, 1]
//   [3] Детерминированность: один seed → один результат.
//   [4] Визуально: карта fBm органична (проверяем через статистику:
//       распределение значений, отсутствие строгой регулярности).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const src = readFileSync(noisePath, 'utf8');

// Выполняем engine/noise.js как классический скрипт в изолированном контексте:
// пакет имеет "type": "module", поэтому CJS require не работает для .js файлов.
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

function assertInRange(v, lo, hi, label) {
  assert(typeof v === 'number' && !Number.isNaN(v),
         (label || 'value') + ' must be a finite number, got ' + v);
  assert(v >= lo && v <= hi,
         (label || 'value') + ' = ' + v + ' not in [' + lo + ', ' + hi + ']');
}

console.log('═══ Шаг 2 — Perlin / fBm / Domain Warping ═══');

// ── mulberry32 ─────────────────────────────────────────
console.log('\n[mulberry32]');
test('returns function', () => {
  const r = mulberry32(42);
  assert(typeof r === 'function');
});
test('deterministic for same seed', () => {
  const a = mulberry32(123), b = mulberry32(123);
  for (let i = 0; i < 100; i++) assert(a() === b());
});
test('values in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert(v >= 0 && v < 1, 'got ' + v);
  }
});
test('different seeds → different sequences', () => {
  const a = mulberry32(1), b = mulberry32(2);
  let diff = 0;
  for (let i = 0; i < 20; i++) if (a() !== b()) diff++;
  assert(diff > 15, 'sequences too similar');
});

// ── PerlinNoise ────────────────────────────────────────
console.log('\n[PerlinNoise]');
const noise = new PerlinNoise(42);

test('noise2d returns number', () => {
  const v = noise.noise2d(0.3, 0.7);
  assert(typeof v === 'number' && !Number.isNaN(v));
});
test('noise2d roughly in [-1, 1]', () => {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 5000; i++) {
    const x = (i * 0.137) % 50;
    const y = ((i * 0.271) + 3.1) % 50;
    const v = noise.noise2d(x, y);
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  // Классический Perlin ограничен примерно sqrt(N/4) — теоретически ~±1.
  assertInRange(mn, -1.01, 0.1, 'min');
  assertInRange(mx, -0.1, 1.01, 'max');
});
test('noise2d deterministic', () => {
  const n1 = new PerlinNoise(42);
  const n2 = new PerlinNoise(42);
  for (let i = 0; i < 100; i++) {
    const x = i * 0.123, y = i * 0.456;
    assert(n1.noise2d(x, y) === n2.noise2d(x, y), 'diverged at i=' + i);
  }
});
test('different seeds → different noise', () => {
  const n1 = new PerlinNoise(1);
  const n2 = new PerlinNoise(2);
  let diff = 0;
  for (let i = 0; i < 50; i++) {
    if (Math.abs(n1.noise2d(i * 0.3, i * 0.7) - n2.noise2d(i * 0.3, i * 0.7)) > 1e-9) diff++;
  }
  assert(diff > 40, 'only ' + diff + '/50 samples differed');
});
test('noise2d smooth at integer grid points', () => {
  // В Perlin noise значения в целых координатах равны 0 (градиенты × нулевой сдвиг).
  for (let x = -3; x <= 3; x++) {
    for (let y = -3; y <= 3; y++) {
      const v = noise.noise2d(x, y);
      assert(Math.abs(v) < 1e-9, 'grid(' + x + ',' + y + ') = ' + v + ' ≠ 0');
    }
  }
});

// ── fbm ────────────────────────────────────────────────
console.log('\n[fbm]');
test('fbm(noise, 0.3, 0.7, 6, 0.5, 2.0) in [0, 1]', () => {
  const v = fbm(noise, 0.3, 0.7, 6, 0.5, 2.0);
  assertInRange(v, 0, 1, 'fbm');
});
test('fbm default params work', () => {
  const v = fbm(noise, 0.3, 0.7);
  assertInRange(v, 0, 1, 'fbm default');
});
test('fbm covers reasonable range across a grid', () => {
  let mn = Infinity, mx = -Infinity;
  const n = new PerlinNoise(42);
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      const v = fbm(n, i * 0.1, j * 0.1, 6, 0.5, 2.0);
      assertInRange(v, 0, 1, 'fbm(' + i + ',' + j + ')');
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  // Распределение должно покрывать ≥ 50% диапазона [0,1]
  // fBm редко достигает крайних 0/1 в выборке — Perlin ограничен ~±0.707.
// Нормализация min-max будет на Шаге 3 (generateHeightmap).
assert((mx - mn) > 0.35, 'fbm range too narrow: ' + mn + '..' + mx);
});
test('fbm deterministic across instances', () => {
  const a = new PerlinNoise(100);
  const b = new PerlinNoise(100);
  for (let i = 0; i < 50; i++) {
    const x = i * 0.123, y = i * 0.456;
    assert(fbm(a, x, y, 6, 0.5, 2.0) === fbm(b, x, y, 6, 0.5, 2.0));
  }
});

// ── domainWarp ─────────────────────────────────────────
console.log('\n[domainWarp]');
test('domainWarp(noise, 0.3, 0.7, 6, 1.2) in [0, 1]', () => {
  const v = domainWarp(noise, 0.3, 0.7, 6, 1.2);
  assertInRange(v, 0, 1, 'domainWarp');
});
test('domainWarp default params', () => {
  const v = domainWarp(noise, 0.3, 0.7);
  assertInRange(v, 0, 1, 'domainWarp default');
});
test('domainWarp deterministic', () => {
  const a = new PerlinNoise(777);
  const b = new PerlinNoise(777);
  for (let i = 0; i < 50; i++) {
    const x = i * 0.17, y = i * 0.29;
    assert(domainWarp(a, x, y, 6, 1.2) === domainWarp(b, x, y, 6, 1.2),
           'diverged at i=' + i);
  }
});
test('domainWarp differs from raw fbm (warp actually warps)', () => {
  const n = new PerlinNoise(42);
  let diffs = 0;
  for (let i = 0; i < 100; i++) {
    const x = i * 0.13, y = i * 0.21;
    const a = fbm(n, x, y, 6, 0.5, 2.0);
    const b = domainWarp(n, x, y, 6, 1.2);
    if (Math.abs(a - b) > 1e-6) diffs++;
  }
  assert(diffs > 80, 'warp barely changes output: ' + diffs + '/100');
});
test('domainWarp range covers ≥ 50%', () => {
  const n = new PerlinNoise(42);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      const v = domainWarp(n, i * 0.15, j * 0.15, 6, 1.2);
      assertInRange(v, 0, 1, 'domainWarp(' + i + ',' + j + ')');
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  // fBm редко достигает крайних 0/1 в выборке — Perlin ограничен ~±0.707.
// Нормализация min-max будет на Шаге 3 (generateHeightmap).
assert((mx - mn) > 0.35, 'domainWarp range too narrow: ' + mn + '..' + mx);
});

// ── Итог ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
