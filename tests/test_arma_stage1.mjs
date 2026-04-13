// Тесты Шага 1 (arma.md) — Pixi.js v8: initBattleMap + 6 слоёв-контейнеров
// Запуск: node tests/test_arma_stage1.mjs
//
// Чеклист из arma.md Шаг 1:
//   [1] В index.html подключён CDN Pixi.js v8 + engine/noise.js + ui/battle_map_pixi.js
//   [2] initBattleMap(containerId, width, height) — async, возвращает BattleMap
//   [3] Использует new PIXI.Application() + await app.init({width, height, antialias, backgroundColor})
//   [4] backgroundColor = 0x2d4a1e (dark green) по умолчанию
//   [5] app.canvas добавлен в DOM-элемент containerId
//   [6] Создано 6 контейнеров в порядке bg, rivers, roads, forests, units, fx
//   [7] BattleMap.layers.{bg,rivers,roads,forests,units,fx} — все PIXI.Container instances
//   [8] BattleMap.layers.fx должен быть экземпляром PIXI.Container (arma.md п.45)
//   [9] Порядок z-order в stage: bg(0) < rivers(1) < roads(2) < forests(3) < units(4) < fx(5)
//  [10] Повторный initBattleMap() без destroy — warning, не крашит
//  [11] destroyBattleMap() — очищает BattleMap, после — повторный init работает
//  [12] Отсутствующий containerId → бросает информативную ошибку
//  [13] HiDPI: app передаёт resolution = window.devicePixelRatio (если есть)
//       и autoDensity: true (arma.md Шаг 20, но реализовано сразу в initBattleMap)

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const pixiPath  = resolve(__dirname, '..', 'ui',     'battle_map_pixi.js');
const htmlPath  = resolve(__dirname, '..', 'index.html');

// ──────────────────────────────────────────────────────────
// Мок Pixi.js v8: Application с async init(), Container, Texture, Sprite, Graphics
// ──────────────────────────────────────────────────────────

class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
    this._destroyed = false;
  }
  addChild(child) {
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
  }
  destroy() { this._destroyed = true; this.children = []; }
}

class FakePIXISprite extends FakePIXIContainer {
  constructor(texture) {
    super();
    this.texture = texture || null;
    this.width   = 0;
    this.height  = 0;
    this.alpha   = 1;
    this.blendMode = 'normal';
  }
}

class FakePIXIGraphics extends FakePIXIContainer {
  constructor() { super(); this._ops = []; }
  clear()      { this._ops.push(['clear']); return this; }
  moveTo()     { return this; }
  lineTo()     { return this; }
  bezierCurveTo() { return this; }
  stroke()     { return this; }
  fill()       { return this; }
  circle()     { return this; }
  rect()       { return this; }
}

class FakePIXITicker {
  constructor() { this.handlers = []; this.deltaTime = 1; }
  add(fn)    { this.handlers.push(fn); }
  remove(fn) { const i = this.handlers.indexOf(fn); if (i >= 0) this.handlers.splice(i, 1); }
  start()    {}
  stop()     {}
}

class FakePIXIApplication {
  constructor() {
    this.stage = new FakePIXIContainer();
    this.canvas = { tagName: 'CANVAS', _w: 0, _h: 0, style: {} };
    this.ticker = new FakePIXITicker();
    this._initCalled = false;
    this._initOpts = null;
    this._destroyed = false;
    this.screen = { width: 0, height: 0 };
  }
  async init(opts) {
    this._initCalled = true;
    this._initOpts = opts || {};
    this.canvas._w = opts.width;
    this.canvas._h = opts.height;
    this.screen.width  = opts.width;
    this.screen.height = opts.height;
    // Async-контракт: return Promise
    return Promise.resolve();
  }
  destroy(removeView, options) {
    this._destroyed = true;
    this._destroyRemoveView = removeView;
    this._destroyOptions = options;
    // noop на canvas, чтобы не ломать ссылки
  }
}

const FakePIXITexture = {
  from(src) { return { _src: src, _id: Math.random() }; },
  WHITE:   { _src: 'white' }
};

class FakePIXITilingSprite extends FakePIXIContainer {
  constructor(opts) {
    super();
    this.texture = (opts && opts.texture) || null;
    this.width   = (opts && opts.width)   || 0;
    this.height  = (opts && opts.height)  || 0;
    this.alpha   = 1;
    this.blendMode = 'normal';
  }
}

const FakeAssets = {
  async load(src) {
    // Имитируем оффлайн: бросаем ошибку, чтобы сработал procedural fallback.
    throw new Error('fake Assets.load: offline test (' + src + ')');
  }
};

const fakePIXI = {
  Application:   FakePIXIApplication,
  Container:     FakePIXIContainer,
  Sprite:        FakePIXISprite,
  TilingSprite:  FakePIXITilingSprite,
  Graphics:      FakePIXIGraphics,
  Texture:       FakePIXITexture,
  Ticker:        FakePIXITicker,
  Assets:        FakeAssets
};

// ──────────────────────────────────────────────────────────
// Мок document c getElementById и createElement('canvas')
// ──────────────────────────────────────────────────────────

function makeFakeCanvas() {
  const canvas = { width: 0, height: 0, _ctx: null };
  canvas.getContext = function(kind) {
    if (kind !== '2d') return null;
    if (canvas._ctx) return canvas._ctx;
    const w = canvas.width;
    const h = canvas.height;
    const buffer = new Uint8ClampedArray(Math.max(1, w * h * 4));
    const ctx = {
      _canvas: canvas,
      fillStyle: '#000',
      globalAlpha: 1,
      createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      },
      putImageData(imageData) {
        buffer.set(imageData.data);
      },
      fillRect() {},
      clearRect() {},
      createRadialGradient() {
        return { addColorStop() {} };
      },
      beginPath() {},
      arc() {},
      fill() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      getBuffer() { return buffer; }
    };
    canvas._ctx = ctx;
    return ctx;
  };
  return canvas;
}

const containers = new Map();
function makeFakeContainerElement(id) {
  const el = {
    id,
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
    }
  };
  containers.set(id, el);
  return el;
}

// Предрегистрируем тестовый контейнер
makeFakeContainerElement('pixi-battle-map');

const fakeDocument = {
  createElement(tag) {
    if (tag === 'canvas') return makeFakeCanvas();
    throw new Error('fake document supports only <canvas>, got <' + tag + '>');
  },
  getElementById(id) {
    return containers.get(id) || null;
  }
};

const fakeWindow = {
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {}
};

// ──────────────────────────────────────────────────────────
// VM-контекст с моками
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  console,
  Number, Math, Float32Array, Uint8Array, Uint8ClampedArray, Array,
  Object, Error, Promise, Set, Map, Symbol,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: fakeDocument,
  window:   fakeWindow,
  PIXI:     fakePIXI
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// engine/noise.js — зависимость battle_map_pixi.js
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;
ctx.getHeight         = noiseExports.getHeight;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// ui/battle_map_pixi.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const { initBattleMap, destroyBattleMap } = pixiExports;

// ──────────────────────────────────────────────────────────
// Тестовый раннер
// ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const ret = fn();
    if (ret && typeof ret.then === 'function') {
      return ret.then(
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

function getBM() {
  // Синглтон BattleMap живёт в модуле (var BattleMap). Достаём через геттер
  // (battle_map_pixi.js не экспортирует саму переменную, только функции).
  // initBattleMap() возвращает ссылку — используем её.
  return ctx.BattleMap || null;
}

console.log('═══ Шаг 1 (arma.md) — Pixi.js v8: initBattleMap + 6 слоёв ═══');

// ── Статика: подключения в index.html ─────────────────────
console.log('\n[index.html — подключения]');

const html = readFileSync(htmlPath, 'utf8');

test('index.html: <script src="https://cdn.jsdelivr.net/npm/pixi.js@8">', () => {
  assert(/cdn\.jsdelivr\.net\/npm\/pixi\.js@8/.test(html),
         'Pixi.js v8 CDN не найден');
});

test('index.html: <script src="engine/noise.js">', () => {
  assert(/<script[^>]+src=["']engine\/noise\.js["']/.test(html),
         'engine/noise.js не подключён');
});

test('index.html: <script src="ui/battle_map_pixi.js">', () => {
  assert(/<script[^>]+src=["']ui\/battle_map_pixi\.js["']/.test(html),
         'ui/battle_map_pixi.js не подключён');
});

// ── initBattleMap: контракт функции ────────────────────────
console.log('\n[initBattleMap — контракт]');

test('initBattleMap is a function', () => {
  assert(typeof initBattleMap === 'function', 'not a function');
});

test('initBattleMap возвращает Promise (async)', () => {
  // Без side-эффектов: проверяем через Function.prototype.toString / constructor.
  const p = initBattleMap('pixi-battle-map', 64, 48);
  assert(p && typeof p.then === 'function', 'not a Promise');
  // Не ждём resolve здесь — это произойдёт в следующем тесте.
  return p.then(() => destroyBattleMap());
});

test('destroyBattleMap is a function', () => {
  assert(typeof destroyBattleMap === 'function');
});

// ── Резолвится в BattleMap singleton ───────────────────────
console.log('\n[initBattleMap — resolve + singleton]');

let bm1 = null;

await test('await initBattleMap(...) — без ошибок', async () => {
  bm1 = await initBattleMap('pixi-battle-map', 800, 600);
  assert(bm1 && typeof bm1 === 'object', 'returned non-object');
});

test('resolved value has .app + .layers', () => {
  assert(bm1.app, 'no .app');
  assert(bm1.layers && typeof bm1.layers === 'object', 'no .layers');
});

test('bm.app instanceof PIXI.Application', () => {
  assert(bm1.app instanceof FakePIXIApplication,
         'app не из fake PIXI.Application');
});

test('app.init() вызван (v8 async pattern)', () => {
  assert(bm1.app._initCalled === true, 'app.init не вызывался');
});

test('app.init получил width/height переданные в initBattleMap', () => {
  assert(bm1.app._initOpts.width  === 800, 'width=' + bm1.app._initOpts.width);
  assert(bm1.app._initOpts.height === 600, 'height=' + bm1.app._initOpts.height);
});

test('backgroundColor по умолчанию = 0x2d4a1e (dark green, arma.md)', () => {
  assert(bm1.app._initOpts.backgroundColor === 0x2d4a1e,
         'backgroundColor=' + bm1.app._initOpts.backgroundColor);
});

test('antialias: true по умолчанию', () => {
  assert(bm1.app._initOpts.antialias === true,
         'antialias=' + bm1.app._initOpts.antialias);
});

test('HiDPI: resolution = window.devicePixelRatio (2 в моке)', () => {
  assert(bm1.app._initOpts.resolution === 2,
         'resolution=' + bm1.app._initOpts.resolution);
});

test('HiDPI: autoDensity = true (Pixi v8)', () => {
  assert(bm1.app._initOpts.autoDensity === true,
         'autoDensity=' + bm1.app._initOpts.autoDensity);
});

// ── 6 слоёв-контейнеров ────────────────────────────────────
console.log('\n[6 слоёв: bg, rivers, roads, forests, units, fx]');

const LAYER_NAMES = ['bg', 'rivers', 'roads', 'forests', 'units', 'fx'];

for (const name of LAYER_NAMES) {
  test('layers.' + name + ' — PIXI.Container instance', () => {
    const l = bm1.layers[name];
    assert(l, 'no layer ' + name);
    assert(l instanceof FakePIXIContainer,
           'layers.' + name + ' not a PIXI.Container');
  });
}

test('Object.keys(layers) содержит все 6 имён', () => {
  const keys = Object.keys(bm1.layers);
  for (const n of LAYER_NAMES) {
    assert(keys.includes(n), 'missing key ' + n);
  }
});

test('layers.fx — отдельный контейнер (не === bg)', () => {
  assert(bm1.layers.fx !== bm1.layers.bg, 'fx === bg (одинаковые ссылки)');
});

// ── Порядок слоёв в stage ───────────────────────────────────
console.log('\n[порядок слоёв в app.stage]');

test('app.stage.children.length >= 6 (все слои добавлены)', () => {
  assert(bm1.app.stage.children.length >= 6,
         'stage children=' + bm1.app.stage.children.length);
});

test('порядок: bg(0) < rivers(1) < roads(2) < forests(3) < units(4) < fx(5)', () => {
  const s = bm1.app.stage.children;
  // Берём первые 6 добавленных — именно они добавляются initBattleMap.
  assert(s[0] === bm1.layers.bg,      'stage[0] != bg');
  assert(s[1] === bm1.layers.rivers,  'stage[1] != rivers');
  assert(s[2] === bm1.layers.roads,   'stage[2] != roads');
  assert(s[3] === bm1.layers.forests, 'stage[3] != forests');
  assert(s[4] === bm1.layers.units,   'stage[4] != units');
  assert(s[5] === bm1.layers.fx,      'stage[5] != fx');
});

// ── Canvas добавлен в DOM-контейнер ────────────────────────
console.log('\n[DOM: canvas добавлен в #pixi-battle-map]');

test('container #pixi-battle-map содержит app.canvas', () => {
  const container = containers.get('pixi-battle-map');
  assert(container, 'контейнер не найден');
  assert(container.children.includes(bm1.app.canvas),
         'canvas не найден в контейнере');
});

// ── Повторный init без destroy — warning, без краша ────────
console.log('\n[guard: повторный init без destroy]');

await test('повторный initBattleMap() — возвращает ту же ссылку (или прежнюю)', async () => {
  const bm2 = await initBattleMap('pixi-battle-map', 800, 600);
  // Допустимы два контракта: вернуть текущий BattleMap или тот же singleton.
  assert(bm2 && bm2.layers, 'повторный init сломался');
});

// ── destroyBattleMap + re-init ─────────────────────────────
console.log('\n[destroyBattleMap + повторный init]');

test('destroyBattleMap() — без исключений', () => {
  destroyBattleMap();
});

await test('re-init после destroy — новый app/layers', async () => {
  const bm3 = await initBattleMap('pixi-battle-map', 400, 300);
  assert(bm3 && bm3.app && bm3.layers, 'новый BattleMap не создан');
  assert(bm3.app !== bm1.app, 'app не пересоздан');
  assert(bm3.layers.fx instanceof FakePIXIContainer, 'fx не Container');
  assert(bm3.app._initOpts.width === 400, 'width не 400');
  destroyBattleMap();
});

// ── Неизвестный containerId → информативная ошибка ─────────
console.log('\n[ошибки: несуществующий containerId]');

await test('initBattleMap("no-such-id") → rejected с понятным сообщением', async () => {
  let err = null;
  try {
    await initBattleMap('no-such-container-xyz', 100, 100);
  } catch (e) {
    err = e;
  }
  assert(err, 'ожидалась ошибка');
  assert(/not found|не найден|container/i.test(err.message),
         'невнятное сообщение: ' + err.message);
  // cleanup на случай частичной инициализации
  try { destroyBattleMap(); } catch (_) {}
});

// ── Финал ──────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
console.log('═══════════════════════════════════════════════');

if (failed > 0) {
  process.exit(1);
}
