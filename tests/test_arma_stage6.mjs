// Тесты Шага 6 (arma.md) — Parchment overlay + Vignette
// Запуск: node tests/test_arma_stage6.mjs
//
// Чеклист из arma.md Шаг 6:
//   [1] Карта должна выглядеть "старинной" — тёплый бежевый оттенок
//       поверх биомов.
//   [2] Углы и края должны быть темнее центра (виньет).
//   [3] layers.bg.children.length должен быть 3 (terrain + parchment + vignette).
//   [4] Без ошибок 404 в сети — текстура должна иметь fallback.
//
// В Node у нас нет DOM и нет реального PIXI — поэтому подставляем
// мок-реализации document/canvas/PIXI в VM-контекст.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const noisePath  = resolve(__dirname, '..', 'engine', 'noise.js');
const pixiPath   = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки для Node-окружения
// ──────────────────────────────────────────────────────────

function makeFakeCanvas() {
  const canvas = { width: 0, height: 0, _ctx: null };
  canvas.getContext = function(kind) {
    if (kind !== '2d') return null;
    if (canvas._ctx) return canvas._ctx;

    const getBuffer = () => {
      if (!canvas._buf) {
        canvas._buf = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      }
      return canvas._buf;
    };

    const ctx = {
      _canvas: canvas,
      fillStyle: '#000',
      _lastGradient: null,
      createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      },
      getImageData(x, y, w, h) {
        const buf = getBuffer();
        // В моке возвращаем копию всего канваса (игнорируем суб-регион)
        return { width: w, height: h, data: new Uint8ClampedArray(buf) };
      },
      putImageData(imageData, dx, dy) {
        if (dx !== 0 || dy !== 0) {
          throw new Error('fake putImageData: only (0,0) supported');
        }
        const buf = getBuffer();
        buf.set(imageData.data);
      },
      fillRect(x, y, w, h) {
        // Минимальная реализация: заливает всё указанной fillStyle
        // (парсим hex "#rrggbb" или считаем нулём).
        const buf = getBuffer();
        let r = 0, g = 0, b = 0, a = 255;
        if (typeof this.fillStyle === 'string' && this.fillStyle[0] === '#' && this.fillStyle.length === 7) {
          r = parseInt(this.fillStyle.slice(1, 3), 16);
          g = parseInt(this.fillStyle.slice(3, 5), 16);
          b = parseInt(this.fillStyle.slice(5, 7), 16);
        }
        // Градиенты/rgba строки: просто пишем маркер "был вызов"
        const W = canvas.width;
        const H = canvas.height;
        const x0 = Math.max(0, x | 0);
        const y0 = Math.max(0, y | 0);
        const x1 = Math.min(W, (x + w) | 0);
        const y1 = Math.min(H, (y + h) | 0);
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * W + xx) * 4;
            buf[i    ] = r;
            buf[i + 1] = g;
            buf[i + 2] = b;
            buf[i + 3] = a;
          }
        }
      },
      createRadialGradient(x0, y0, r0, x1, y1, r1) {
        const g = {
          _type: 'radial',
          _params: { x0, y0, r0, x1, y1, r1 },
          _stops: [],
          addColorStop(pos, color) { this._stops.push({ pos, color }); }
        };
        ctx._lastGradient = g;
        return g;
      },
      getBuffer
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

// ──────────────────────────────────────────────────────────
// Мок PIXI
// ──────────────────────────────────────────────────────────

class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
  }
  addChild(child) { this.children.push(child); return child; }
}

class FakePIXISprite {
  constructor(texture) {
    this.texture = texture;
    this.width   = 0;
    this.height  = 0;
    this.alpha   = 1;
    this.blendMode = 'normal';
  }
}

class FakePIXITilingSprite {
  constructor(opts) {
    this.texture = opts.texture;
    this.width   = opts.width;
    this.height  = opts.height;
    this.alpha   = 1;
    this.blendMode = 'normal';
  }
}

const FakePIXITexture = {
  from(source) {
    return { _source: source, _id: Math.random() };
  }
};

// Флаг "онлайн" — меняется тестами, чтобы проверять оба пути.
let FAKE_ASSETS_ONLINE = true;

const FakePIXIAssets = {
  _calls: [],
  _shouldFail: false,
  async load(url) {
    FakePIXIAssets._calls.push(url);
    if (FakePIXIAssets._shouldFail || !FAKE_ASSETS_ONLINE) {
      throw new Error('fake Assets.load: offline (404)');
    }
    return { _source: { _remote: url }, _id: Math.random(), _fromAssets: true };
  }
};

const fakePIXI = {
  Container:    FakePIXIContainer,
  Sprite:       FakePIXISprite,
  TilingSprite: FakePIXITilingSprite,
  Texture:      FakePIXITexture,
  Assets:       FakePIXIAssets
};

// ──────────────────────────────────────────────────────────
// VM-контекст
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
  parseInt,
  document: fakeDocument,
  PIXI:     fakePIXI,
  Promise,
  setTimeout
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
  renderTerrain,
  buildProceduralParchmentCanvas,
  loadParchmentTexture,
  renderParchmentOverlay,
  buildVignetteCanvas,
  renderVignette,
  renderTerrainOverlays
} = pixiExports;
const { generateHeightmap } = noiseExports;

// ──────────────────────────────────────────────────────────
// Тест-раннер
// ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { console.log('  ✓ ' + name); passed++; },
        (e) => { console.log('  ✗ ' + name + ' — ' + e.message); failed++; }
      );
    }
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

(async () => {
  console.log('═══ Шаг 6 (arma.md) — Parchment overlay + Vignette ═══');

  // ── Procedural parchment ──────────────────────────────
  console.log('\n[buildProceduralParchmentCanvas — fallback пергамент]');

  test('is a function', () => {
    assert(typeof buildProceduralParchmentCanvas === 'function');
  });

  test('возвращает canvas с width === height === size', () => {
    const c = buildProceduralParchmentCanvas(128, 42);
    assert(c.width === 128 && c.height === 128, `${c.width}x${c.height}`);
  });

  test('детерминированность по seed: буферы совпадают', () => {
    const a = buildProceduralParchmentCanvas(64, 7).getContext('2d').getBuffer();
    const b = buildProceduralParchmentCanvas(64, 7).getContext('2d').getBuffer();
    assert(a.length === b.length, 'size mismatch');
    for (let i = 0; i < a.length; i++) {
      assert(a[i] === b[i], 'diff at ' + i);
    }
  });

  test('разные seed → разные буферы', () => {
    const a = buildProceduralParchmentCanvas(64, 1).getContext('2d').getBuffer();
    const b = buildProceduralParchmentCanvas(64, 2).getContext('2d').getBuffer();
    let diffs = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
    assert(diffs > 0, 'buffers identical across seeds');
  });

  test('альфа-канал всегда 255 (непрозрачный)', () => {
    const buf = buildProceduralParchmentCanvas(32, 9).getContext('2d').getBuffer();
    for (let i = 3; i < buf.length; i += 4) {
      assert(buf[i] === 255, 'alpha[' + i + ']=' + buf[i]);
    }
  });

  // ── loadParchmentTexture ──────────────────────────────
  console.log('\n[loadParchmentTexture — Assets.load с fallback]');

  await test('успешный путь: PIXI.Assets.load → Texture', async () => {
    FAKE_ASSETS_ONLINE = true;
    FakePIXIAssets._shouldFail = false;
    FakePIXIAssets._calls.length = 0;
    const tex = await loadParchmentTexture();
    assert(tex && tex._fromAssets === true, 'texture not from Assets');
    assert(FakePIXIAssets._calls.length === 1, 'Assets.load not called');
  });

  await test('кастомный URL передаётся в Assets.load', async () => {
    FAKE_ASSETS_ONLINE = true;
    FakePIXIAssets._shouldFail = false;
    FakePIXIAssets._calls.length = 0;
    await loadParchmentTexture('./custom/path.jpg');
    assert(FakePIXIAssets._calls[0] === './custom/path.jpg',
           'wrong url: ' + FakePIXIAssets._calls[0]);
  });

  await test('fallback: при неудаче Assets.load строит процедурную текстуру', async () => {
    FAKE_ASSETS_ONLINE = false;
    FakePIXIAssets._shouldFail = true;
    const tex = await loadParchmentTexture();
    assert(tex && tex._source, 'no texture');
    assert(!tex._fromAssets, 'should not be from Assets');
    // Источник — canvas-like (width/height)
    assert(typeof tex._source.width === 'number', 'source is not canvas');
    assert(typeof tex._source.height === 'number', 'source is not canvas');
  });

  // ── renderParchmentOverlay ─────────────────────────────
  console.log('\n[renderParchmentOverlay — TilingSprite, multiply, α=0.22]');

  test('is a function', () => {
    assert(typeof renderParchmentOverlay === 'function');
  });

  test('добавляет TilingSprite в layers.bg', () => {
    const app = { screen: { width: 800, height: 600 } };
    const layers = { bg: new fakePIXI.Container() };
    const tex = { _source: { width: 256, height: 256 } };
    const sprite = renderParchmentOverlay(app, layers, tex);
    assert(sprite instanceof fakePIXI.TilingSprite, 'not TilingSprite');
    assert(layers.bg.children.length === 1, 'children=' + layers.bg.children.length);
    assert(layers.bg.children[0] === sprite);
  });

  test('размер TilingSprite совпадает с app.screen', () => {
    const app = { screen: { width: 1024, height: 768 } };
    const layers = { bg: new fakePIXI.Container() };
    const sprite = renderParchmentOverlay(app, layers, { _id: 1 });
    assert(sprite.width === 1024, 'width=' + sprite.width);
    assert(sprite.height === 768, 'height=' + sprite.height);
  });

  test('blendMode === "multiply"', () => {
    const app = { screen: { width: 100, height: 100 } };
    const layers = { bg: new fakePIXI.Container() };
    const sprite = renderParchmentOverlay(app, layers, { _id: 2 });
    assert(sprite.blendMode === 'multiply', 'blendMode=' + sprite.blendMode);
  });

  test('alpha === 0.22', () => {
    const app = { screen: { width: 100, height: 100 } };
    const layers = { bg: new fakePIXI.Container() };
    const sprite = renderParchmentOverlay(app, layers, { _id: 3 });
    assert(Math.abs(sprite.alpha - 0.22) < 1e-9, 'alpha=' + sprite.alpha);
  });

  test('выбрасывает ошибку при отсутствии texture', () => {
    let thrown = false;
    try {
      renderParchmentOverlay(
        { screen: { width: 10, height: 10 } },
        { bg: new fakePIXI.Container() },
        null
      );
    } catch (e) { thrown = true; }
    assert(thrown, 'no error');
  });

  test('выбрасывает ошибку при отсутствии layers.bg', () => {
    let thrown = false;
    try {
      renderParchmentOverlay(
        { screen: { width: 10, height: 10 } },
        {},
        { _id: 1 }
      );
    } catch (e) { thrown = true; }
    assert(thrown, 'no error');
  });

  // ── buildVignetteCanvas ───────────────────────────────
  console.log('\n[buildVignetteCanvas — радиальный градиент]');

  test('is a function', () => {
    assert(typeof buildVignetteCanvas === 'function');
  });

  test('canvas.width / height соответствуют параметрам', () => {
    const c = buildVignetteCanvas(640, 480);
    assert(c.width === 640, 'width=' + c.width);
    assert(c.height === 480, 'height=' + c.height);
  });

  test('создаётся радиальный градиент с корректными stops', () => {
    const c = buildVignetteCanvas(200, 150);
    const g = c.getContext('2d')._lastGradient;
    assert(g, 'no gradient created');
    assert(g._type === 'radial', 'not radial');
    // Stops: хотя бы два — прозрачный центр и тёмные края.
    assert(g._stops.length >= 2, 'stops=' + g._stops.length);
    // Первый stop — полностью прозрачный.
    assert(g._stops[0].pos === 0, 'first stop not at 0');
    assert(g._stops[0].color.indexOf('0)') >= 0,
           'first stop not fully transparent: ' + g._stops[0].color);
    // Последний stop — затемнение 0.55.
    const last = g._stops[g._stops.length - 1];
    assert(last.pos === 1, 'last stop not at 1');
    assert(last.color.indexOf('0.55') >= 0,
           'last stop alpha != 0.55: ' + last.color);
  });

  test('центр градиента — в центре canvas (cx, cy)', () => {
    const c = buildVignetteCanvas(200, 100);
    const g = c.getContext('2d')._lastGradient;
    assert(g._params.x0 === 100, 'x0=' + g._params.x0);
    assert(g._params.y0 === 50,  'y0=' + g._params.y0);
    assert(g._params.x1 === 100, 'x1=' + g._params.x1);
    assert(g._params.y1 === 50,  'y1=' + g._params.y1);
  });

  test('внешний радиус градиента покрывает углы', () => {
    const w = 300, h = 200;
    const c = buildVignetteCanvas(w, h);
    const g = c.getContext('2d')._lastGradient;
    const diagHalf = Math.sqrt((w / 2) * (w / 2) + (h / 2) * (h / 2));
    assert(g._params.r1 >= diagHalf - 1,
           'r1=' + g._params.r1 + ' < diagHalf=' + diagHalf);
  });

  // ── renderVignette ────────────────────────────────────
  console.log('\n[renderVignette — Sprite добавлен в layers.bg]');

  test('is a function', () => {
    assert(typeof renderVignette === 'function');
  });

  test('добавляет PIXI.Sprite в layers.bg с правильным размером', () => {
    const app = { screen: { width: 640, height: 480 } };
    const layers = { bg: new fakePIXI.Container() };
    const sprite = renderVignette(app, layers);
    assert(sprite instanceof fakePIXI.Sprite, 'not Sprite');
    assert(sprite.width === 640);
    assert(sprite.height === 480);
    assert(layers.bg.children.length === 1);
    assert(layers.bg.children[0] === sprite);
  });

  test('sprite.texture создан через PIXI.Texture.from(canvas)', () => {
    const app = { screen: { width: 200, height: 200 } };
    const layers = { bg: new fakePIXI.Container() };
    const sprite = renderVignette(app, layers);
    assert(sprite.texture && sprite.texture._source, 'no texture');
    assert(sprite.texture._source.width === 200, 'source w');
    assert(sprite.texture._source.height === 200, 'source h');
  });

  test('выбрасывает ошибку при отсутствии layers.bg', () => {
    let thrown = false;
    try {
      renderVignette({ screen: { width: 10, height: 10 } }, {});
    } catch (e) { thrown = true; }
    assert(thrown);
  });

  // ── renderTerrainOverlays — интеграция ───────────────
  console.log('\n[renderTerrainOverlays — parchment + vignette одним вызовом]');

  await test('добавляет 2 ребёнка (parchment + vignette) в layers.bg', async () => {
    FAKE_ASSETS_ONLINE = true;
    FakePIXIAssets._shouldFail = false;
    const app = { screen: { width: 400, height: 300 } };
    const layers = { bg: new fakePIXI.Container() };
    const { parchment, vignette } = await renderTerrainOverlays(app, layers);
    assert(parchment instanceof fakePIXI.TilingSprite);
    assert(vignette instanceof fakePIXI.Sprite);
    assert(layers.bg.children.length === 2, 'children=' + layers.bg.children.length);
  });

  await test('порядок: parchment ДО vignette (vignette последний = сверху)', async () => {
    FAKE_ASSETS_ONLINE = true;
    const app = { screen: { width: 400, height: 300 } };
    const layers = { bg: new fakePIXI.Container() };
    const { parchment, vignette } = await renderTerrainOverlays(app, layers);
    assert(layers.bg.children[0] === parchment, 'parchment not first');
    assert(layers.bg.children[1] === vignette, 'vignette not last');
  });

  // ── Полный чеклист Шага 6 ────────────────────────────
  console.log('\n[чеклист Шага 6 — terrain + parchment + vignette = 3 детей]');

  await test('layers.bg.children.length === 3 после renderTerrain + overlays', async () => {
    FAKE_ASSETS_ONLINE = true;
    FakePIXIAssets._shouldFail = false;
    const app = { screen: { width: 400, height: 300 } };
    const layers = { bg: new fakePIXI.Container() };
    const hm = generateHeightmap(32, 32, 42);
    renderTerrain(app, layers, hm);
    await renderTerrainOverlays(app, layers);
    assert(layers.bg.children.length === 3,
           'expected 3 children (terrain+parchment+vignette), got ' + layers.bg.children.length);
    // Проверим порядок: [terrain, parchment, vignette]
    assert(layers.bg.children[0] instanceof fakePIXI.Sprite &&
           !(layers.bg.children[0] instanceof fakePIXI.TilingSprite),
           'child[0] not terrain Sprite');
    assert(layers.bg.children[1] instanceof fakePIXI.TilingSprite,
           'child[1] not parchment TilingSprite');
    assert(layers.bg.children[2] instanceof fakePIXI.Sprite,
           'child[2] not vignette Sprite');
  });

  await test('fallback путь: оффлайн → карта всё равно собирается из 3 слоёв', async () => {
    FAKE_ASSETS_ONLINE = false;
    FakePIXIAssets._shouldFail = true;
    const app = { screen: { width: 200, height: 200 } };
    const layers = { bg: new fakePIXI.Container() };
    const hm = generateHeightmap(16, 16, 1);
    renderTerrain(app, layers, hm);
    await renderTerrainOverlays(app, layers);
    assert(layers.bg.children.length === 3,
           'offline build: expected 3 children, got ' + layers.bg.children.length);
    const parchment = layers.bg.children[1];
    assert(parchment.blendMode === 'multiply', 'parchment blendMode');
    assert(Math.abs(parchment.alpha - 0.22) < 1e-9, 'parchment alpha');
  });

  // ── Итог ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('Passed: ' + passed + ' | Failed: ' + failed);
  if (failed > 0) process.exit(1);
})();
