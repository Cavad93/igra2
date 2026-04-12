// Тесты Шага 5 (arma.md) — renderTerrain через Canvas 2D → PIXI.Texture → Sprite
// Запуск: node tests/test_arma_stage5.mjs
//
// Чеклист из arma.md Шаг 5:
//   [1] initBattleMap() + renderTerrain() — без ошибок.
//   [2] На экране должна появиться цветная карта биомов.
//   [3] layers.bg.children.length должен быть ≥ 1.
//   [4] FPS не падает (производительность — невозможно в Node,
//       но оцениваем сложность O(w*h) и отсутствие лишних аллокаций).
//
// В Node у нас нет DOM и нет реального PIXI — поэтому тесты либо работают
// с чистой функцией fillTerrainPixels (без DOM), либо подставляют
// мок-реализации document/canvas/PIXI в VM-контекст.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки для Node-окружения: минимальный document + Canvas + PIXI
// ──────────────────────────────────────────────────────────

function makeFakeCanvas() {
  const canvas = { width: 0, height: 0, _ctx: null };
  canvas.getContext = function(kind) {
    if (kind !== '2d') return null;
    if (canvas._ctx) return canvas._ctx;
    const w = canvas.width;
    const h = canvas.height;
    const buffer = new Uint8ClampedArray(w * h * 4);
    const ctx = {
      _canvas: canvas,
      _lastImageData: null,
      createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      },
      putImageData(imageData, dx, dy) {
        // Копируем RGBA-буфер в canvas-буфер (простая проверка dx=0, dy=0).
        if (dx !== 0 || dy !== 0) {
          throw new Error('fake putImageData: only (0,0) supported');
        }
        if (imageData.width !== canvas.width || imageData.height !== canvas.height) {
          throw new Error('fake putImageData: size mismatch');
        }
        buffer.set(imageData.data);
        ctx._lastImageData = imageData;
      },
      getBuffer() { return buffer; }
    };
    canvas._ctx = ctx;
    return ctx;
  };
  return canvas;
}

const fakeDocument = {
  createElement(tag) {
    if (tag !== 'canvas') {
      throw new Error('fake document supports only <canvas>');
    }
    return makeFakeCanvas();
  }
};

// Мок PIXI: Texture.from + Sprite + Container + Application.
// Container достаточно умный, чтобы addChild работал и children собирались.
class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
  }
  addChild(child) {
    this.children.push(child);
    return child;
  }
}

class FakePIXISprite {
  constructor(texture) {
    this.texture = texture;
    this.width   = 0;
    this.height  = 0;
  }
}

const FakePIXITexture = {
  from(source) {
    return { _source: source, _id: Math.random() };
  }
};

const fakePIXI = {
  Container: FakePIXIContainer,
  Sprite:    FakePIXISprite,
  Texture:   FakePIXITexture
};

// ──────────────────────────────────────────────────────────
// Общий VM-контекст
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  window: undefined,
  console,
  Number,
  Math,
  Float32Array,
  Uint8Array,
  Uint8ClampedArray,
  Array,
  Object,
  Error,
  document: fakeDocument,
  PIXI:     fakePIXI
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// Load engine/noise.js
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;

ctx.getHeight         = noiseExports.getHeight;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// Load ui/battle_map_pixi.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const {
  BIOMES, getBiomeColor,
  fillTerrainPixels, buildTerrainCanvas, renderTerrain
} = pixiExports;
const { generateHeightmap } = noiseExports;

// ──────────────────────────────────────────────────────────
// Тесты
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

console.log('═══ Шаг 5 (arma.md) — renderTerrain ═══');

// ── fillTerrainPixels (чистая функция) ─────────────────
console.log('\n[fillTerrainPixels — RGBA из биомов]');

test('fillTerrainPixels is a function', () => {
  assert(typeof fillTerrainPixels === 'function');
});

test('returns Uint8ClampedArray длиной w*h*4', () => {
  const hm = generateHeightmap(16, 16, 42);
  const px = fillTerrainPixels(hm);
  assert(px instanceof Uint8ClampedArray, 'not Uint8ClampedArray');
  assert(px.length === 16 * 16 * 4, 'length=' + px.length);
});

test('альфа-канал всегда 255', () => {
  const hm = generateHeightmap(8, 8, 1);
  const px = fillTerrainPixels(hm);
  for (let i = 3; i < px.length; i += 4) {
    assert(px[i] === 255, 'alpha[' + i + ']=' + px[i]);
  }
});

test('цвет каждого пикселя === getBiomeColor(height)', () => {
  const hm = generateHeightmap(8, 8, 7);
  const px = fillTerrainPixels(hm);
  for (let y = 0; y < hm.height; y++) {
    for (let x = 0; x < hm.width; x++) {
      const h = hm.data[y * hm.width + x];
      const expected = getBiomeColor(h).color;
      const i = (y * hm.width + x) * 4;
      const got = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      assert(got === expected,
             'pixel(' + x + ',' + y + ') got=' + got.toString(16) +
             ' expected=' + expected.toString(16));
    }
  }
});

test('все 8 биомов могут быть представлены (256×256 seed=42)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const px = fillTerrainPixels(hm);
  // Собираем уникальные цвета
  const colors = new Set();
  for (let i = 0; i < px.length; i += 4) {
    colors.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  }
  assert(colors.size >= 4,
         'only ' + colors.size + ' unique biome colors');
  // Все цвета должны быть из палитры BIOMES
  const palette = new Set(BIOMES.map(b => b.color));
  for (const c of colors) {
    assert(palette.has(c), 'foreign color ' + c.toString(16));
  }
});

test('детерминированность: два вызова с одним heightmap → идентичные буферы', () => {
  const hm = generateHeightmap(32, 32, 123);
  const a = fillTerrainPixels(hm);
  const b = fillTerrainPixels(hm);
  assert(a.length === b.length);
  for (let i = 0; i < a.length; i++) {
    assert(a[i] === b[i], 'diff at ' + i);
  }
});

// ── buildTerrainCanvas (с фейковым document) ───────────
console.log('\n[buildTerrainCanvas — Canvas 2D размерами heightmap]');

test('buildTerrainCanvas is a function', () => {
  assert(typeof buildTerrainCanvas === 'function');
});

test('canvas.width / canvas.height соответствуют heightmap', () => {
  const hm = generateHeightmap(64, 48, 42);
  const canvas = buildTerrainCanvas(hm);
  assert(canvas.width === 64, 'width=' + canvas.width);
  assert(canvas.height === 48, 'height=' + canvas.height);
});

test('putImageData вызван, буфер совпадает с fillTerrainPixels', () => {
  const hm = generateHeightmap(16, 16, 99);
  const canvas = buildTerrainCanvas(hm);
  const ctxCanvas = canvas.getContext('2d');
  const buf = ctxCanvas.getBuffer();
  const expected = fillTerrainPixels(hm);
  assert(buf.length === expected.length);
  for (let i = 0; i < buf.length; i++) {
    assert(buf[i] === expected[i], 'diff at ' + i);
  }
});

// ── renderTerrain + fake PIXI ──────────────────────────
console.log('\n[renderTerrain — Sprite добавлен в layers.bg]');

test('renderTerrain is a function', () => {
  assert(typeof renderTerrain === 'function');
});

test('добавляет ровно один Sprite в layers.bg (children.length ≥ 1)', () => {
  const hm = generateHeightmap(32, 32, 42);
  const app = { screen: { width: 800, height: 600 } };
  const layers = { bg: new fakePIXI.Container() };
  renderTerrain(app, layers, hm);
  assert(layers.bg.children.length >= 1,
         'children.length=' + layers.bg.children.length);
  assert(layers.bg.children.length === 1, 'expected exactly 1 child');
});

test('добавленный объект — экземпляр PIXI.Sprite', () => {
  const hm = generateHeightmap(16, 16, 42);
  const app = { screen: { width: 400, height: 300 } };
  const layers = { bg: new fakePIXI.Container() };
  const sprite = renderTerrain(app, layers, hm);
  assert(sprite instanceof fakePIXI.Sprite, 'not a Sprite');
  assert(layers.bg.children[0] === sprite, 'sprite not in children');
});

test('sprite масштабирован под размер app.screen', () => {
  const hm = generateHeightmap(16, 16, 42);
  const app = { screen: { width: 800, height: 600 } };
  const layers = { bg: new fakePIXI.Container() };
  const sprite = renderTerrain(app, layers, hm);
  assert(sprite.width === 800, 'width=' + sprite.width);
  assert(sprite.height === 600, 'height=' + sprite.height);
});

test('sprite.texture создан через PIXI.Texture.from(canvas)', () => {
  const hm = generateHeightmap(16, 16, 42);
  const app = { screen: { width: 200, height: 200 } };
  const layers = { bg: new fakePIXI.Container() };
  const sprite = renderTerrain(app, layers, hm);
  assert(sprite.texture && sprite.texture._source,
         'texture has no _source');
  const src = sprite.texture._source;
  // Source должен быть canvas-like — width/height присутствуют
  assert(typeof src.width === 'number' && typeof src.height === 'number',
         'source is not canvas-like');
  assert(src.width === hm.width && src.height === hm.height,
         'source size mismatch: ' + src.width + 'x' + src.height);
});

test('несколько вызовов подряд добавляют несколько Sprite-ов', () => {
  const hm = generateHeightmap(8, 8, 1);
  const app = { screen: { width: 100, height: 100 } };
  const layers = { bg: new fakePIXI.Container() };
  renderTerrain(app, layers, hm);
  renderTerrain(app, layers, hm);
  renderTerrain(app, layers, hm);
  assert(layers.bg.children.length === 3,
         'children.length=' + layers.bg.children.length);
});

test('корректно выбрасывает ошибку при отсутствии layers.bg', () => {
  let thrown = false;
  try {
    renderTerrain({}, {}, generateHeightmap(4, 4, 1));
  } catch (e) {
    thrown = true;
  }
  assert(thrown, 'no error thrown');
});

test('корректно выбрасывает ошибку при невалидном heightmap', () => {
  let thrown = false;
  try {
    const layers = { bg: new fakePIXI.Container() };
    renderTerrain({ screen: { width: 10, height: 10 } }, layers, null);
  } catch (e) {
    thrown = true;
  }
  assert(thrown, 'no error thrown');
});

// ── Производительность: O(w*h) без лишних аллокаций ────
console.log('\n[производительность — base sanity]');

test('256×256 обрабатывается быстро (< 500ms)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const t0 = Date.now();
  const px = fillTerrainPixels(hm);
  const dt = Date.now() - t0;
  assert(px.length === 256 * 256 * 4);
  assert(dt < 500, 'too slow: ' + dt + 'ms');
});

// ── Итог ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
