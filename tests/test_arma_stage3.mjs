// Тесты Шага 3 (arma.md) — generateHeightmap + getHeight
// Запуск: node tests/test_arma_stage3.mjs
//
// Чеклист из arma.md Шаг 3:
//   [1] generateHeightmap(256, 256, 42) возвращает { data, width, height }
//   [2] data — Float32Array длины width*height
//   [3] min(data) ≈ 0, max(data) ≈ 1 (строгая min/max нормализация)
//   [4] Детерминированность: два вызова с одним seed — идентичные массивы
//   [5] Разные seed → разные карты
//   [6] getHeight clamp-ит координаты (не выходит за границы)
//   [7] Распределение значений (низкие/средние/высокие — узнаваемые зоны).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const src = readFileSync(noisePath, 'utf8');

// engine/noise.js — классический скрипт; запускаем в изолированном VM-контексте
// (package.json имеет "type": "module", поэтому require не работает для .js).
const ctx = { module: { exports: {} }, window: undefined };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: noisePath });

const { generateHeightmap, getHeight } = ctx.module.exports;

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

function minMax(arr) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
}

console.log('═══ Шаг 3 (arma.md) — generateHeightmap + getHeight ═══');

// ── generateHeightmap: базовый контракт ────────────────
console.log('\n[generateHeightmap — контракт]');

test('returns { data, width, height }', () => {
  const hm = generateHeightmap(64, 64, 42);
  assert(hm && typeof hm === 'object', 'not an object');
  // VM-context has its own realm; compare by constructor name, not instanceof.
  assert(hm.data && hm.data.constructor && hm.data.constructor.name === 'Float32Array',
         'data not Float32Array, got ' + (hm.data && hm.data.constructor && hm.data.constructor.name));
  assert(hm.data.BYTES_PER_ELEMENT === 4, 'not 4 bytes per element');
  assert(hm.width === 64, 'width mismatch: ' + hm.width);
  assert(hm.height === 64, 'height mismatch: ' + hm.height);
});

test('data length = width * height', () => {
  const hm = generateHeightmap(128, 64, 7);
  assert(hm.data.length === 128 * 64, 'length=' + hm.data.length);
});

test('non-square dimensions work', () => {
  const hm = generateHeightmap(100, 50, 1);
  assert(hm.width === 100 && hm.height === 50);
  assert(hm.data.length === 100 * 50);
});

// ── generateHeightmap: нормализация в [0, 1] ──────────
console.log('\n[generateHeightmap — нормализация]');

test('min ≈ 0, max ≈ 1 at 256×256 seed=42', () => {
  const hm = generateHeightmap(256, 256, 42);
  const { min, max } = minMax(hm.data);
  assert(Math.abs(min) < 1e-5, 'min too far from 0: ' + min);
  assert(Math.abs(max - 1) < 1e-5, 'max too far from 1: ' + max);
});

test('all values in [0, 1]', () => {
  const hm = generateHeightmap(128, 128, 123);
  for (let i = 0; i < hm.data.length; i++) {
    const v = hm.data[i];
    assert(v >= 0 && v <= 1, 'value out of range at i=' + i + ': ' + v);
  }
});

test('values are finite', () => {
  const hm = generateHeightmap(64, 64, 999);
  for (let i = 0; i < hm.data.length; i++) {
    assert(Number.isFinite(hm.data[i]), 'non-finite at i=' + i);
  }
});

test('distribution covers full range (low/mid/high)', () => {
  // На 256×256 с normalized [0,1] должны быть зоны всех высот:
  // "вода/низины" (<0.3), "равнины" (0.3..0.7), "горы" (>0.7).
  const hm = generateHeightmap(256, 256, 42);
  let low = 0, mid = 0, high = 0;
  for (let i = 0; i < hm.data.length; i++) {
    const v = hm.data[i];
    if (v < 0.3) low++;
    else if (v > 0.7) high++;
    else mid++;
  }
  assert(low  > 0, 'no low-value pixels');
  assert(mid  > 0, 'no mid-value pixels');
  assert(high > 0, 'no high-value pixels');
});

// ── generateHeightmap: детерминированность ─────────────
console.log('\n[generateHeightmap — детерминированность]');

test('same seed → identical arrays', () => {
  const a = generateHeightmap(64, 64, 42);
  const b = generateHeightmap(64, 64, 42);
  assert(a.data.length === b.data.length);
  for (let i = 0; i < a.data.length; i++) {
    assert(a.data[i] === b.data[i], 'diverged at i=' + i);
  }
});

test('different seeds → different arrays', () => {
  const a = generateHeightmap(64, 64, 1);
  const b = generateHeightmap(64, 64, 2);
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (Math.abs(a.data[i] - b.data[i]) > 1e-9) diff++;
  }
  assert(diff > a.data.length * 0.8,
         'only ' + diff + '/' + a.data.length + ' differ');
});

// ── options ───────────────────────────────────────────
console.log('\n[generateHeightmap — options]');

test('custom octaves preserve normalization', () => {
  const hm = generateHeightmap(64, 64, 42, { octaves: 4 });
  const { min, max } = minMax(hm.data);
  assert(Math.abs(min) < 1e-5 && Math.abs(max - 1) < 1e-5,
         'normalization broken: ' + min + '..' + max);
});

test('custom warpStrength changes output', () => {
  const a = generateHeightmap(64, 64, 42, { warpStrength: 0.5 });
  const b = generateHeightmap(64, 64, 42, { warpStrength: 2.0 });
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (Math.abs(a.data[i] - b.data[i]) > 1e-6) diff++;
  }
  assert(diff > a.data.length * 0.5,
         'warpStrength barely changes output: ' + diff);
});

test('default options match Шаг 3 spec', () => {
  const a = generateHeightmap(64, 64, 42);
  const b = generateHeightmap(64, 64, 42, {
    octaves: 6, persistence: 0.5, lacunarity: 2.0, warpStrength: 1.2
  });
  for (let i = 0; i < a.data.length; i++) {
    assert(a.data[i] === b.data[i], 'default mismatch at ' + i);
  }
});

// ── getHeight ─────────────────────────────────────────
console.log('\n[getHeight]');

const hm32 = generateHeightmap(32, 32, 42);

test('returns values in [0, 1]', () => {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = getHeight(hm32, x, y);
      assert(v >= 0 && v <= 1, 'out of range at (' + x + ',' + y + '): ' + v);
    }
  }
});

test('matches raw data access', () => {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      assert(getHeight(hm32, x, y) === hm32.data[y * 32 + x],
             'mismatch at (' + x + ',' + y + ')');
    }
  }
});

test('clamps negative coords to 0', () => {
  assert(getHeight(hm32, -10, -10) === hm32.data[0], 'neg clamp');
  assert(getHeight(hm32, -5,   0)  === hm32.data[0], 'neg x clamp');
  assert(getHeight(hm32,  0,  -3)  === hm32.data[0], 'neg y clamp');
});

test('clamps out-of-bounds coords to edge', () => {
  const last = hm32.data[31 * 32 + 31];
  assert(getHeight(hm32, 999, 999) === last, 'max clamp');
  assert(getHeight(hm32,  31, 999) === last, 'max y clamp');
  assert(getHeight(hm32, 999,  31) === last, 'max x clamp');
});

test('truncates fractional coords (integer indexing)', () => {
  const v = getHeight(hm32, 1.7, 2.3);
  assert(v === hm32.data[2 * 32 + 1], 'fractional coord handling');
});

// ── Перформанс ─────────────────────────────────────────
console.log('\n[performance]');

test('256×256 generation finishes under 5s', () => {
  const t0 = Date.now();
  const hmBig = generateHeightmap(256, 256, 42);
  const dt = Date.now() - t0;
  assert(hmBig.data.length === 256 * 256);
  assert(dt < 5000, 'took ' + dt + 'ms');
});

// ── Итог ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
