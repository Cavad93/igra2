// Тесты Шага 20 (arma.md) — Полировка: HiDPI, Ticker, offscreen terrain cache,
//                             интеграция с основной игрой.
// Запуск: node tests/test_arma_stage20.mjs
//
// Чеклист из arma.md Шаг 20:
//   [1]  window.devicePixelRatio пробрасывается в app.init как resolution.
//   [2]  autoDensity: true в app.init.
//   [3]  Значение dpr сохраняется в BattleMap.dpr.
//   [4]  initBattleMap/destroyBattleMap — идемпотентны при двойном вызове
//        (double-init пишет warn, double-destroy — noop).
//   [5]  В initBattleMap один add() в app.ticker (мастер-tick).
//   [6]  addBattleMapTicker регистрирует handler, removeBattleMapTicker
//        снимает.
//   [7]  Мастер-tick вызывает каждый из BattleMap.tickerHandlers с delta.
//   [8]  pauseBattleMap() → ticker.stop(); resumeBattleMap() → ticker.start().
//   [9]  renderTerrainCached: первый вызов строит PIXI.Texture,
//        второй вызов с тем же cacheKey — переиспользует эту же текстуру.
//   [10] renderTerrainCached: смена cacheKey → старая текстура
//        уничтожается (destroy() на предыдущей), создаётся новая.
//   [11] destroyBattleMap снимает master-tick из app.ticker.remove()
//        и сбрасывает offscreen terrain cache (TERRAIN_TEXTURE_CACHE).
//   [12] После destroyBattleMap можно заново initBattleMap без ошибок.
//   [13] addBattleMapTicker до init → возвращает null (safe noop).
//   [14] Тот же handler нельзя подписать дважды (дедупликация).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const pixiPath  = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Application + Ticker + Container + Texture + Sprite
// ──────────────────────────────────────────────────────────
class FakeTicker {
  constructor() {
    this.handlers = [];
    this._running = false;
    this.deltaTime = 1;
  }
  add(fn)    { this.handlers.push(fn); return this; }
  remove(fn) {
    const i = this.handlers.indexOf(fn);
    if (i >= 0) this.handlers.splice(i, 1);
    return this;
  }
  start()    { this._running = true; }
  stop()     { this._running = false; }
  /** Ручной progon одного "кадра" с заданной delta. */
  tick(delta) {
    this.deltaTime = (typeof delta === 'number') ? delta : 1;
    const snap = this.handlers.slice();
    for (const h of snap) h(this);
  }
}

class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
    this.x = 0; this.y = 0;
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }
}

let _textureIdCounter = 0;
class FakePIXITexture {
  constructor(source) {
    this._source = source;
    this._id = ++_textureIdCounter;
    this._destroyed = false;
  }
  destroy(destroyBase) {
    this._destroyed = true;
  }
  static from(source) { return new FakePIXITexture(source); }
}

class FakePIXISprite {
  constructor(texture) {
    this.texture = texture;
    this.width   = 0;
    this.height  = 0;
  }
}

class FakePIXIApplication {
  constructor() {
    this._initArgs = null;
    this._destroyed = false;
    this.ticker = new FakeTicker();
    this.stage  = new FakePIXIContainer();
    this.canvas = { style: {}, width: 0, height: 0 };
    this.screen = { width: 0, height: 0 };
    // Will be filled by init().
  }
  async init(opts) {
    this._initArgs = Object.assign({}, opts);
    this.screen.width  = opts.width  || 0;
    this.screen.height = opts.height || 0;
    this.canvas.width  = (opts.width  || 0) * (opts.resolution || 1);
    this.canvas.height = (opts.height || 0) * (opts.resolution || 1);
    if (opts.autoDensity) {
      this.canvas.style.width  = (opts.width  || 0) + 'px';
      this.canvas.style.height = (opts.height || 0) + 'px';
    }
  }
  destroy(removeView, opts) {
    this._destroyed = true;
    this.stage.children = [];
  }
}

const fakePIXI = {
  Application: FakePIXIApplication,
  Container:   FakePIXIContainer,
  Sprite:      FakePIXISprite,
  Texture:     FakePIXITexture
};

// Минимальный DOM: getElementById возвращает фиктивный контейнер.
const fakeContainerEl = {
  _children: [],
  appendChild(c) { this._children.push(c); }
};
const fakeDocument = {
  _byId: { 'pixi-battle-map': fakeContainerEl },
  getElementById(id) { return this._byId[id] || null; },
  createElement() {
    // Нужен для buildTerrainCanvas → getImageData. Упростим: вернём
    // минимальный mock с работающим getContext('2d').
    const c = { width: 0, height: 0 };
    c.getContext = function(kind) {
      if (kind !== '2d') return null;
      return {
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w*h*4) }; },
        putImageData() { /* noop */ },
        getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w*h*4) }; }
      };
    };
    return c;
  }
};

// Фиктивный window с devicePixelRatio=2.
const fakeWindow = { devicePixelRatio: 2 };

// ──────────────────────────────────────────────────────────
// VM-контекст
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  console,
  Number, Math, Float32Array, Uint8Array, Uint8ClampedArray,
  Array, Object, Error, String, Infinity, isFinite, parseInt,
  Promise, setTimeout, clearTimeout,
  document: fakeDocument,
  window:   fakeWindow,
  PIXI:     fakePIXI
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// noise (для generateHeightmap)
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;
ctx.getHeight         = noiseExports.getHeight;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// battle_map_pixi
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;

const {
  initBattleMap,
  destroyBattleMap,
  renderTerrainCached,
  clearTerrainCache,
  addBattleMapTicker,
  removeBattleMapTicker,
  pauseBattleMap,
  resumeBattleMap
} = pixiExports;

// ──────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message || e)); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function reinit() {
  // Safely reset singleton between tests.
  if (ctx.BattleMap && ctx.BattleMap.app) {
    try { vm.runInContext('destroyBattleMap()', ctx); } catch (_) { /* noop */ }
  }
  // Full reset of globals just in case.
  vm.runInContext('BattleMap = null;', ctx);
  return vm.runInContext('initBattleMap("pixi-battle-map", 800, 600)', ctx);
}

console.log('═══ Шаг 20 (arma.md) — Полировка: HiDPI + Ticker + Terrain cache ═══');

// ── API surface ──────────────────────────────────────────
console.log('\n[API surface]');

await test('initBattleMap экспортирован', () => {
  assert(typeof initBattleMap === 'function');
});
await test('destroyBattleMap экспортирован', () => {
  assert(typeof destroyBattleMap === 'function');
});
await test('renderTerrainCached экспортирован', () => {
  assert(typeof renderTerrainCached === 'function');
});
await test('clearTerrainCache экспортирован', () => {
  assert(typeof clearTerrainCache === 'function');
});
await test('addBattleMapTicker экспортирован', () => {
  assert(typeof addBattleMapTicker === 'function');
});
await test('removeBattleMapTicker экспортирован', () => {
  assert(typeof removeBattleMapTicker === 'function');
});
await test('pauseBattleMap экспортирован', () => {
  assert(typeof pauseBattleMap === 'function');
});
await test('resumeBattleMap экспортирован', () => {
  assert(typeof resumeBattleMap === 'function');
});

// ── HiDPI ──────────────────────────────────────────────────
console.log('\n[HiDPI]');

await test('initBattleMap прокидывает window.devicePixelRatio=2 в init как resolution', async () => {
  await reinit();
  const bm = ctx.BattleMap;
  assert(bm, 'BattleMap not set');
  assert(bm.app._initArgs.resolution === 2,
    'expected resolution=2, got ' + bm.app._initArgs.resolution);
});

await test('initBattleMap ставит autoDensity: true', async () => {
  await reinit();
  assert(ctx.BattleMap.app._initArgs.autoDensity === true);
});

await test('BattleMap.dpr = 2 при dpr=2', async () => {
  await reinit();
  assert(ctx.BattleMap.dpr === 2, 'dpr=' + ctx.BattleMap.dpr);
});

await test('opts.resolution переопределяет devicePixelRatio', async () => {
  vm.runInContext('BattleMap = null;', ctx);
  await vm.runInContext(
    'initBattleMap("pixi-battle-map", 800, 600, { resolution: 3 })', ctx);
  assert(ctx.BattleMap.dpr === 3, 'dpr=' + ctx.BattleMap.dpr);
  assert(ctx.BattleMap.app._initArgs.resolution === 3);
});

await test('логический размер canvas в CSS-пикселях (autoDensity)', async () => {
  await reinit();
  const c = ctx.BattleMap.app.canvas;
  assert(c.style.width  === '800px', 'css w=' + c.style.width);
  assert(c.style.height === '600px', 'css h=' + c.style.height);
});

// ── Double-init / double-destroy ─────────────────────────
console.log('\n[Double init / destroy]');

await test('второй initBattleMap без destroy → возвращает тот же singleton', async () => {
  await reinit();
  const a = ctx.BattleMap;
  const b = await vm.runInContext('initBattleMap("pixi-battle-map", 800, 600)', ctx);
  assert(b === a, 'должен вернуть тот же singleton');
});

await test('destroyBattleMap — идемпотентен (noop без init)', () => {
  vm.runInContext('destroyBattleMap(); destroyBattleMap();', ctx);
  assert(ctx.BattleMap === null);
});

await test('после destroy можно снова init', async () => {
  await reinit();
  vm.runInContext('destroyBattleMap();', ctx);
  assert(ctx.BattleMap === null, 'destroy не занулил singleton');
  await vm.runInContext('initBattleMap("pixi-battle-map", 800, 600)', ctx);
  assert(ctx.BattleMap && ctx.BattleMap.app, 're-init не сработал');
});

// ── Ticker handlers ──────────────────────────────────────
console.log('\n[Ticker]');

await test('в app.ticker.handlers появляется ровно один master-tick', async () => {
  await reinit();
  const t = ctx.BattleMap.app.ticker;
  assert(t.handlers.length === 1,
    'expected 1 master handler, got ' + t.handlers.length);
});

await test('addBattleMapTicker регистрирует handler в BattleMap.tickerHandlers', async () => {
  await reinit();
  const fn = () => {};
  ctx.__fn = fn;
  vm.runInContext('addBattleMapTicker(__fn);', ctx);
  assert(ctx.BattleMap.tickerHandlers.indexOf(fn) >= 0,
    'handler не зарегистрирован');
});

await test('addBattleMapTicker дедуплицирует повторную регистрацию', async () => {
  await reinit();
  const fn = () => {};
  ctx.__fn = fn;
  vm.runInContext('addBattleMapTicker(__fn); addBattleMapTicker(__fn);', ctx);
  assert(ctx.BattleMap.tickerHandlers.length === 1,
    'handlers=' + ctx.BattleMap.tickerHandlers.length);
});

await test('removeBattleMapTicker снимает handler', async () => {
  await reinit();
  let calls = 0;
  const fn = () => { calls++; };
  ctx.__fn = fn;
  vm.runInContext('addBattleMapTicker(__fn);', ctx);
  const removed = vm.runInContext('removeBattleMapTicker(__fn);', ctx);
  assert(removed === true);
  assert(ctx.BattleMap.tickerHandlers.length === 0,
    'handler не удалён');
});

await test('master-tick вызывает каждый handler с delta', async () => {
  await reinit();
  let captured = null;
  const fn = (delta) => { captured = delta; };
  ctx.__fn = fn;
  vm.runInContext('addBattleMapTicker(__fn);', ctx);
  // Ручной tick через fake ticker.
  ctx.BattleMap.app.ticker.tick(2.5);
  assert(captured === 2.5, 'delta=' + captured);
});

await test('master-tick продолжает работать, если один handler бросает', async () => {
  await reinit();
  let called = 0;
  const bad  = () => { throw new Error('boom'); };
  const good = () => { called++; };
  ctx.__bad = bad; ctx.__good = good;
  vm.runInContext('addBattleMapTicker(__bad); addBattleMapTicker(__good);', ctx);
  ctx.BattleMap.app.ticker.tick(1);
  assert(called === 1, 'good handler не вызвался, called=' + called);
});

await test('addBattleMapTicker до init → null', () => {
  vm.runInContext('destroyBattleMap();', ctx);
  assert(ctx.BattleMap === null);
  const r = vm.runInContext('addBattleMapTicker(()=>{})', ctx);
  assert(r === null, 'expected null, got ' + r);
});

// ── Pause / Resume ───────────────────────────────────────
console.log('\n[Pause / Resume]');

await test('pauseBattleMap вызывает ticker.stop()', async () => {
  await reinit();
  ctx.BattleMap.app.ticker.start();
  assert(ctx.BattleMap.app.ticker._running === true);
  vm.runInContext('pauseBattleMap();', ctx);
  assert(ctx.BattleMap.app.ticker._running === false, 'ticker not stopped');
});

await test('resumeBattleMap вызывает ticker.start()', async () => {
  await reinit();
  ctx.BattleMap.app.ticker.stop();
  vm.runInContext('resumeBattleMap();', ctx);
  assert(ctx.BattleMap.app.ticker._running === true, 'ticker not started');
});

await test('pause/resume — noop если BattleMap не инициализирован', () => {
  vm.runInContext('destroyBattleMap();', ctx);
  vm.runInContext('pauseBattleMap(); resumeBattleMap();', ctx);
  assert(ctx.BattleMap === null);
});

// ── Offscreen terrain cache ──────────────────────────────
console.log('\n[Offscreen terrain cache]');

function makeFakeHM(w, h) {
  return { data: new Float32Array(w*h), width: w, height: h };
}

await test('renderTerrainCached: первый вызов создаёт Sprite в layers.bg', async () => {
  await reinit();
  const hm = makeFakeHM(4, 4);
  ctx.__hm = hm;
  const sprite = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
    ctx);
  assert(sprite, 'no sprite');
  assert(ctx.BattleMap.layers.bg.children.length === 1,
    'bg children=' + ctx.BattleMap.layers.bg.children.length);
});

await test('renderTerrainCached: второй вызов с тем же cacheKey → та же PIXI.Texture', async () => {
  await reinit();
  const hm = makeFakeHM(4, 4);
  ctx.__hm = hm;
  const s1 = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
    ctx);
  const s2 = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
    ctx);
  assert(s1 !== s2, 'sprites должны быть разные (новый Sprite каждый раз)');
  assert(s1.texture === s2.texture,
    'texture должна быть та же, кеш не переиспользовался');
});

await test('renderTerrainCached: смена cacheKey → новая текстура, старая destroy()', async () => {
  await reinit();
  const hm = makeFakeHM(4, 4);
  ctx.__hm = hm;
  const s1 = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
    ctx);
  const oldTex = s1.texture;
  const s2 = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-2")',
    ctx);
  assert(s1.texture !== s2.texture, 'текстура не обновилась');
  assert(oldTex._destroyed === true, 'старая текстура не была destroy()');
});

await test('clearTerrainCache уничтожает текущую текстуру', async () => {
  await reinit();
  const hm = makeFakeHM(4, 4);
  ctx.__hm = hm;
  const s1 = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
    ctx);
  vm.runInContext('clearTerrainCache();', ctx);
  assert(s1.texture._destroyed === true, 'texture not destroyed after clear');
});

await test('destroyBattleMap очищает terrain cache', async () => {
  await reinit();
  const hm = makeFakeHM(4, 4);
  ctx.__hm = hm;
  const s1 = vm.runInContext(
    'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
    ctx);
  vm.runInContext('destroyBattleMap();', ctx);
  assert(s1.texture._destroyed === true,
    'texture должна быть destroyed после destroyBattleMap');
});

// ── Master-tick cleanup ──────────────────────────────────
console.log('\n[Cleanup]');

await test('destroyBattleMap снимает master-tick из ticker', async () => {
  await reinit();
  const tickerBefore = ctx.BattleMap.app.ticker;
  assert(tickerBefore.handlers.length === 1);
  // Сохраняем ссылку на app — после destroy BattleMap занулится, но
  // локальная ссылка на app останется.
  const appRef = ctx.BattleMap.app;
  vm.runInContext('destroyBattleMap();', ctx);
  // После destroy: handlers в старом ticker должны быть пусты.
  assert(appRef.ticker.handlers.length === 0,
    'master-tick не снят, handlers=' + appRef.ticker.handlers.length);
});

await test('re-open: 3 цикла init/destroy — нет утечек handlers', async () => {
  for (let i = 0; i < 3; i++) {
    await reinit();
    const hm = makeFakeHM(4, 4);
    ctx.__hm = hm;
    vm.runInContext(
      'renderTerrainCached(BattleMap.app, BattleMap.layers, __hm, "seed-1")',
      ctx);
    vm.runInContext('destroyBattleMap();', ctx);
  }
  assert(ctx.BattleMap === null, 'BattleMap не занулён после цикла');
});

// ──────────────────────────────────────────────────────────
console.log('\n═══ Итого: ' + passed + ' passed, ' + failed + ' failed ═══');
process.exit(failed > 0 ? 1 : 0);
