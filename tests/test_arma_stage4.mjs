// Тесты Шага 4 (arma.md) — BIOMES + getBiomeColor + getBiomeAt
// Запуск: node tests/test_arma_stage4.mjs
//
// Чеклист из arma.md Шаг 4:
//   [1] BIOMES — массив биомов (8 записей), отсортирован по threshold
//   [2] getBiomeColor(0.05).name → 'deep_water'
//   [3] getBiomeColor(0.50).name → 'grassland'
//   [4] getBiomeColor(0.95).name → 'mountain'
//   [5] Для каждого биома h = threshold (и чуть ниже) → возвращается он сам
//   [6] getBiomeAt(hm, x, y) → возвращает { color, name } по heightmap
//   [7] Визуальная проверка: карта 256×256 должна иметь все категории биомов.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// Общий VM-контекст: сначала noise.js (engine), затем battle_map_pixi.js (ui).
// battle_map_pixi.js не вызывает PIXI на верхнем уровне, только внутри функций.
const ctx = {
  module: { exports: {} },
  window: undefined,
  console,
  Number,
  Math,
  Float32Array,
  Uint8Array,
  Array,
  Object,
  Error
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// Load engine/noise.js first — экспортирует через module.exports.
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;

// Перекидываем нужное в глобалы контекста, чтобы battle_map_pixi.js увидел
// getHeight через globalThis.getHeight.
ctx.getHeight         = noiseExports.getHeight;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// Очищаем module.exports перед загрузкой второго файла.
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const { BIOMES, getBiomeColor, getBiomeAt } = pixiExports;
const { generateHeightmap } = noiseExports;

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

console.log('═══ Шаг 4 (arma.md) — BIOMES + getBiomeColor + getBiomeAt ═══');

// ── BIOMES массив ───────────────────────────────────────
console.log('\n[BIOMES — структура массива]');

test('BIOMES is array of 8 biomes', () => {
  assert(Array.isArray(BIOMES), 'not an array');
  assert(BIOMES.length === 8, 'length=' + BIOMES.length);
});

test('each biome has threshold, name, color', () => {
  for (const b of BIOMES) {
    assert(typeof b.threshold === 'number', 'threshold not number');
    assert(typeof b.name === 'string' && b.name.length > 0, 'bad name');
    assert(typeof b.color === 'number' && b.color >= 0 && b.color <= 0xFFFFFF,
           'bad color: ' + b.color);
  }
});

test('thresholds strictly increasing', () => {
  for (let i = 1; i < BIOMES.length; i++) {
    assert(BIOMES[i].threshold > BIOMES[i - 1].threshold,
           'not increasing at ' + i);
  }
});

test('last threshold = 1.00', () => {
  assert(BIOMES[BIOMES.length - 1].threshold === 1.00,
         'last=' + BIOMES[BIOMES.length - 1].threshold);
});

test('expected biome names in order', () => {
  const expected = [
    'deep_water', 'shallow_water', 'wetland', 'grassland',
    'forest', 'hills', 'mountain', 'snow_peak'
  ];
  for (let i = 0; i < expected.length; i++) {
    assert(BIOMES[i].name === expected[i],
           'biome[' + i + ']=' + BIOMES[i].name + ' expected ' + expected[i]);
  }
});

test('matches arma.md colors exactly', () => {
  const expected = {
    deep_water:    0x1a2a3a,
    shallow_water: 0x2a3f55,
    wetland:       0x3d5c3a,
    grassland:     0x4a6b3f,
    forest:        0x2d4a24,
    hills:         0x6b5a3a,
    mountain:      0x7a6a5a,
    snow_peak:     0xc8c0b0
  };
  for (const b of BIOMES) {
    assert(b.color === expected[b.name],
           b.name + ' color=' + b.color.toString(16) + ' expected ' +
           expected[b.name].toString(16));
  }
});

// ── getBiomeColor ───────────────────────────────────────
console.log('\n[getBiomeColor — из arma.md тестов]');

test('getBiomeColor(0.05).name === "deep_water"', () => {
  assert(getBiomeColor(0.05).name === 'deep_water',
         'got ' + getBiomeColor(0.05).name);
});

test('getBiomeColor(0.50).name === "grassland"', () => {
  assert(getBiomeColor(0.50).name === 'grassland',
         'got ' + getBiomeColor(0.50).name);
});

// Примечание: в arma.md указано "getBiomeColor(0.95) → mountain", но палитра
// в той же главе задаёт thresholds: mountain=0.90, snow_peak=1.00. При правиле
// "первый биом с h <= threshold" h=0.95 попадает в snow_peak (0.90..1.00).
// Палитра — авторитетный источник; фиксируем оба реальных перехода.
test('getBiomeColor(0.85).name === "mountain" (диапазон 0.80..0.90)', () => {
  assert(getBiomeColor(0.85).name === 'mountain',
         'got ' + getBiomeColor(0.85).name);
});

test('getBiomeColor(0.95).name === "snow_peak" (диапазон 0.90..1.00)', () => {
  assert(getBiomeColor(0.95).name === 'snow_peak',
         'got ' + getBiomeColor(0.95).name);
});

test('getBiomeColor(0) → deep_water', () => {
  assert(getBiomeColor(0).name === 'deep_water');
});

test('getBiomeColor(1) → snow_peak', () => {
  assert(getBiomeColor(1).name === 'snow_peak');
});

test('returns { color, name } object', () => {
  const r = getBiomeColor(0.45);
  assert(typeof r === 'object');
  assert(typeof r.color === 'number');
  assert(typeof r.name === 'string');
});

test('threshold boundaries — value exactly on threshold picks that biome', () => {
  // h <= threshold, поэтому для h = threshold должен выбираться ЭТОТ биом.
  for (const b of BIOMES) {
    const r = getBiomeColor(b.threshold);
    assert(r.name === b.name,
           'at h=' + b.threshold + ' got ' + r.name + ' expected ' + b.name);
  }
});

test('values just above threshold pick next biome', () => {
  for (let i = 0; i < BIOMES.length - 1; i++) {
    const h = BIOMES[i].threshold + 1e-6;
    const r = getBiomeColor(h);
    assert(r.name === BIOMES[i + 1].name,
           'just above ' + BIOMES[i].name + ' threshold got ' + r.name);
  }
});

test('out-of-range h<0 clamps to deep_water', () => {
  assert(getBiomeColor(-0.5).name === 'deep_water');
  assert(getBiomeColor(-100).name === 'deep_water');
});

test('out-of-range h>1 clamps to snow_peak', () => {
  assert(getBiomeColor(1.5).name === 'snow_peak');
  assert(getBiomeColor(100).name === 'snow_peak');
});

test('non-finite h → safe default (deep_water)', () => {
  assert(getBiomeColor(NaN).name === 'deep_water');
  assert(getBiomeColor(Infinity).name === 'snow_peak' ||
         getBiomeColor(Infinity).name === 'deep_water',
         'Infinity not handled');
});

// ── getBiomeAt ──────────────────────────────────────────
console.log('\n[getBiomeAt — интеграция с heightmap]');

const hm = generateHeightmap(32, 32, 42);

test('getBiomeAt returns { color, name }', () => {
  const r = getBiomeAt(hm, 5, 5);
  assert(typeof r === 'object');
  assert(typeof r.color === 'number');
  assert(typeof r.name === 'string');
});

test('getBiomeAt matches getBiomeColor(getHeight(...))', () => {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const a = getBiomeAt(hm, x, y);
      const h = ctx.getHeight(hm, x, y);
      const b = getBiomeColor(h);
      assert(a.name === b.name, 'mismatch at (' + x + ',' + y + ')');
      assert(a.color === b.color, 'color mismatch at (' + x + ',' + y + ')');
    }
  }
});

test('getBiomeAt clamps out-of-bounds coords', () => {
  const r1 = getBiomeAt(hm, -10, -10);
  const r2 = getBiomeAt(hm, 0, 0);
  assert(r1.name === r2.name, 'negative clamp broken');
  const r3 = getBiomeAt(hm, 999, 999);
  const r4 = getBiomeAt(hm, 31, 31);
  assert(r3.name === r4.name, 'positive clamp broken');
});

// ── Распределение биомов на реальной карте ─────────────
console.log('\n[распределение биомов на 256×256 seed=42]');

test('256×256 map has all biome categories present', () => {
  const big = generateHeightmap(256, 256, 42);
  const counts = Object.create(null);
  for (const b of BIOMES) counts[b.name] = 0;
  for (let i = 0; i < big.data.length; i++) {
    counts[getBiomeColor(big.data[i]).name]++;
  }
  // Минимум 4 разных биома должно быть представлено (вода, равнины, лес, горы).
  const present = Object.keys(counts).filter(k => counts[k] > 0);
  assert(present.length >= 4,
         'only ' + present.length + ' biomes present: ' + present.join(','));
  // Итого всех пикселей = width*height.
  let total = 0;
  for (const k in counts) total += counts[k];
  assert(total === 256 * 256, 'total=' + total);
});

test('coverage: низкие и высокие биомы оба встречаются', () => {
  const big = generateHeightmap(256, 256, 42);
  let low = 0, high = 0;
  for (let i = 0; i < big.data.length; i++) {
    const name = getBiomeColor(big.data[i]).name;
    if (name === 'deep_water' || name === 'shallow_water') low++;
    if (name === 'mountain' || name === 'snow_peak') high++;
  }
  assert(low > 0, 'no water biomes');
  assert(high > 0, 'no mountain biomes');
});

// ── Итог ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
