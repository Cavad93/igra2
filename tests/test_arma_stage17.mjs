// Тесты Шага 17 (arma.md) — Unit token rendering
// Запуск: node tests/test_arma_stage17.mjs
//
// Чеклист из arma.md Шаг 17:
//   [1]  renderUnit(battalion, app, layers, hmW, hmH) — функция.
//   [2]  Создаётся PIXI.Container, добавляется в layers.units.
//   [3]  Три грани блока (top/left/right), размер ромба w=40, h=20.
//   [4]  Top face — ромб, fill-цвет стороны (чуть светлее базы).
//   [5]  Left face — темнее base на 30%.
//   [6]  Right face — темнее base на 20%.
//   [7]  Базы: ally=0x3a6a2a, enemy=0x6a2a2a.
//   [8]  Иконка типа войск нарисована поверх ромба (Graphics children).
//   [9]  HP-бар: чёрный фон rect(-18,-22,36,4) + цветная полоса
//        пропорциональной ширины.
//   [10] Цвет HP: green >50%, yellow >25%, red ≤25%.
//   [11] container.x == screenX, container.y == screenY
//        (screenX = battalion.x * screenW/hmW).
//   [12] container.zIndex == screenY (Painter's algorithm).
//   [13] renderAllUnits итерирует массив батальонов и вызывает renderUnit.
//   [14] layers.units.sortableChildren === true после renderAllUnits.
//   [15] Защитные случаи: пустой массив, null, невалидные размеры.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const noisePath     = resolve(__dirname, '..', 'engine', 'noise.js');
const battalionPath = resolve(__dirname, '..', 'engine', 'battalion.js');
const pixiPath      = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Container + Graphics
// ──────────────────────────────────────────────────────────
class FakePIXIContainer {
  constructor() {
    this.children = [];
    this.sortableChildren = false;
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
  }
  addChild(child) { this.children.push(child); return child; }
}

class FakePIXIGraphics {
  constructor() {
    this.ops = [];
    this._fills = [];
    this._strokes = [];
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
  }
  moveTo(x, y)  { this.ops.push({ type: 'moveTo', x, y }); return this; }
  lineTo(x, y)  { this.ops.push({ type: 'lineTo', x, y }); return this; }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.ops.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    return this;
  }
  stroke(style) {
    this.ops.push({ type: 'stroke', style });
    this._strokes.push(style);
    return this;
  }
  fill(style)  {
    this.ops.push({ type: 'fill', style });
    this._fills.push(style);
    return this;
  }
  clear()      { this.ops.length = 0; this._fills.length = 0; this._strokes.length = 0; return this; }
  circle(x, y, r) { this.ops.push({ type: 'circle', x, y, r }); return this; }
  ellipse(x, y, rx, ry) { this.ops.push({ type: 'ellipse', x, y, rx, ry }); return this; }
  rect(x, y, w, h) { this.ops.push({ type: 'rect', x, y, w, h }); return this; }
}

class FakePIXISprite {
  constructor(texture) { this.texture = texture; this.width = 0; this.height = 0; }
}
const FakePIXITexture = { from(source) { return { _source: source }; } };

const fakePIXI = {
  Container: FakePIXIContainer,
  Graphics:  FakePIXIGraphics,
  Sprite:    FakePIXISprite,
  Texture:   FakePIXITexture
};

const fakeDocument = {
  createElement() { return { width: 0, height: 0, getContext: () => null }; }
};

// ──────────────────────────────────────────────────────────
// VM-контекст
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  require: undefined,
  console,
  Number, Math, Float32Array, Float64Array,
  Uint8Array, Uint8ClampedArray, Int32Array,
  Array, Object, Error, Infinity, isFinite, parseInt,
  document: fakeDocument,
  PIXI:     fakePIXI
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// 1. noise.js — для совместимости (battle_map_pixi.js не зависит напрямую,
//    но в других шагах мы его уже подгружали).
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });

// 2. battalion.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(battalionPath, 'utf8'), ctx, { filename: battalionPath });
const battalionExports = ctx.module.exports;
const { Battalion, createTestBattalions } = battalionExports;

// 3. battle_map_pixi.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;
const { renderUnit, renderAllUnits } = pixiExports;

// ──────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function makeFakeApp(w, h) {
  return { screen: { width: w, height: h } };
}
function makeFakeLayers() {
  return {
    bg:      new FakePIXIContainer(),
    rivers:  new FakePIXIContainer(),
    roads:   new FakePIXIContainer(),
    forests: new FakePIXIContainer(),
    units:   new FakePIXIContainer(),
    fx:      new FakePIXIContainer(),
  };
}
function makeBattalion(overrides) {
  return new Battalion(Object.assign({
    id:        'ally_1',
    x:         10,
    y:         20,
    side:      'ally',
    unitType:  'infantry',
    health:    100,
    maxHealth: 100,
    formation: 'line'
  }, overrides || {}));
}

// Shade helper (дублирует внутреннюю _shadeColor) — для верификации цветов.
function shade(color, factor) {
  let r = (color >> 16) & 0xff;
  let g = (color >>  8) & 0xff;
  let b =  color        & 0xff;
  r = Math.round(r * factor); if (r > 255) r = 255; if (r < 0) r = 0;
  g = Math.round(g * factor); if (g > 255) g = 255; if (g < 0) g = 0;
  b = Math.round(b * factor); if (b > 255) b = 255; if (b < 0) b = 0;
  return (r << 16) | (g << 8) | b;
}

console.log('═══ Шаг 17 (arma.md) — renderUnit / renderAllUnits ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('renderUnit is a function', () => {
  assert(typeof renderUnit === 'function');
});

test('renderAllUnits is a function', () => {
  assert(typeof renderAllUnits === 'function');
});

// ── Базовая корректность ───────────────────────────────
console.log('\n[Базовая корректность]');

test('один юнит → один Container в layers.units', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const b = makeBattalion({ x: 50, y: 50 });
  const c = renderUnit(b, app, layers, 100, 100);
  assert(c instanceof FakePIXIContainer);
  assert(layers.units.children.length === 1);
  assert(layers.units.children[0] === c);
});

test('container имеет ровно 3 child Graphics (блок, иконка, HP)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion(), app, layers, 100, 100);
  assert(c.children.length === 3, 'expected 3, got ' + c.children.length);
  for (const g of c.children) {
    assert(g instanceof FakePIXIGraphics, 'child must be Graphics');
  }
});

test('renderUnit с пустым battalion → throw', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  let threw = false;
  try { renderUnit(null, app, layers, 100, 100); }
  catch (e) { threw = true; }
  assert(threw);
});

test('throws если layers.units отсутствует', () => {
  let threw = false;
  try { renderUnit(makeBattalion(), makeFakeApp(800, 600), {}, 100, 100); }
  catch (e) { threw = true; }
  assert(threw);
});

test('throws на невалидные размеры heightmap', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  let threw = false;
  try { renderUnit(makeBattalion(), app, layers, 0, 100); }
  catch (e) { threw = true; }
  assert(threw);
});

// ── Позиция и zIndex ───────────────────────────────────
console.log('\n[Позиция и zIndex]');

test('container.x == screenX, container.y == screenY', () => {
  // hm 100×100, screen 800×600 → sx=8, sy=6
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ x: 25, y: 50 }), app, layers, 100, 100);
  assert(c.x === 25 * 8, 'c.x=' + c.x);
  assert(c.y === 50 * 6, 'c.y=' + c.y);
});

test('container.zIndex == screenY (Painter\'s algorithm)', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ x: 10, y: 30 }), app, layers, 100, 100);
  // sy = 4, screenY = 120
  assert(c.zIndex === 120, 'zIndex=' + c.zIndex);
  assert(c.zIndex === c.y);
});

test('hm 200×100, screen 400×400 — sx=2, sy=4', () => {
  const app = makeFakeApp(400, 400);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ x: 50, y: 25 }), app, layers, 200, 100);
  assert(c.x === 100 && c.y === 100,
    `expected (100,100), got (${c.x},${c.y})`);
});

// ── Блок: 3 грани и цвета сторон ───────────────────────
console.log('\n[Блок — 3 грани]');

test('ally: блок содержит 3 fill — top (lighter), left (*0.7), right (*0.8)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ side: 'ally' }), app, layers, 100, 100);
  const blockG = c.children[0];
  assert(blockG._fills.length === 3,
    'expected 3 block fills, got ' + blockG._fills.length);

  const base = 0x3a6a2a;
  const expectTop   = shade(base, 1.10);
  const expectLeft  = shade(base, 0.70);
  const expectRight = shade(base, 0.80);

  const colors = blockG._fills.map(f => f && f.color);
  assert(colors.indexOf(expectTop)   >= 0, 'top color missing: 0x' + expectTop.toString(16));
  assert(colors.indexOf(expectLeft)  >= 0, 'left color missing: 0x' + expectLeft.toString(16));
  assert(colors.indexOf(expectRight) >= 0, 'right color missing: 0x' + expectRight.toString(16));
});

test('enemy: база 0x6a2a2a, корректные оттенки', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(
    makeBattalion({ id: 'enemy_1', side: 'enemy' }),
    app, layers, 100, 100);
  const blockG = c.children[0];
  const base = 0x6a2a2a;
  const colors = blockG._fills.map(f => f && f.color);
  assert(colors.indexOf(shade(base, 1.10)) >= 0, 'enemy top missing');
  assert(colors.indexOf(shade(base, 0.70)) >= 0, 'enemy left missing');
  assert(colors.indexOf(shade(base, 0.80)) >= 0, 'enemy right missing');
});

test('размер ромба w=40, h=20 (max координата вершин)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion(), app, layers, 100, 100);
  const blockG = c.children[0];
  // Соберём все (x, y) из ops где есть x/y
  const xs = blockG.ops.filter(o => typeof o.x === 'number').map(o => o.x);
  const ys = blockG.ops.filter(o => typeof o.y === 'number').map(o => o.y);
  const maxX = Math.max(...xs);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  // Top vertex (0, -10), bottom (0, +10 или с глубиной +18), left (-20,0), right (20,0)
  assert(maxX === 20 && minX === -20,
    `diamond width: minX=${minX}, maxX=${maxX}`);
  assert(minY === -10, `top y should be -10, got ${minY}`);
  // maxY может быть 18 (bottom + depth) из-за боковых граней
  assert(maxY >= 10, `bottom y should be ≥ 10, got ${maxY}`);
});

// ── Иконка типа войск ──────────────────────────────────
console.log('\n[Иконка типа войск]');

test('infantry: иконка имеет ≥ 1 fill', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ unitType: 'infantry' }), app, layers, 100, 100);
  const iconG = c.children[1];
  assert(iconG._fills.length >= 1);
});

test('cavalry / archers / cannon — иконка рисуется без ошибок', () => {
  const types = ['cavalry', 'archers', 'cannon'];
  for (const t of types) {
    const app = makeFakeApp(800, 600);
    const layers = makeFakeLayers();
    const c = renderUnit(
      makeBattalion({ id: 'x_'+t, unitType: t, side: 'ally' }),
      app, layers, 100, 100);
    const iconG = c.children[1];
    assert(iconG._fills.length >= 1, t + ': no icon fills');
  }
});

// ── HP-бар ─────────────────────────────────────────────
console.log('\n[HP-бар]');

test('HP-бар: чёрный фон rect(-18,-22,36,4) + цветная полоса', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ health: 100, maxHealth: 100 }), app, layers, 100, 100);
  const hpG = c.children[2];
  const rects = hpG.ops.filter(o => o.type === 'rect');
  assert(rects.length === 2, 'expected 2 rects (bg + bar), got ' + rects.length);
  // фон
  const bg = rects.find(r => r.x === -18 && r.y === -22 && r.w === 36 && r.h === 4);
  assert(bg, 'HP background rect(-18,-22,36,4) not found');
  // чёрный fill
  const blackFill = hpG._fills.find(f => f && f.color === 0x000000);
  assert(blackFill, 'HP black bg fill not found');
});

test('HP 100% → ширина полосы = 36, цвет зелёный', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ health: 100, maxHealth: 100 }), app, layers, 100, 100);
  const hpG = c.children[2];
  const rects = hpG.ops.filter(o => o.type === 'rect');
  const bar = rects.find(r => r.x === -18 && r.y === -22 && r.w === 36 && r !== rects[0]);
  // Могут оказаться оба rect с w=36 (bg + bar) — возьмём второй
  const bars = rects.filter(r => r.x === -18 && r.y === -22 && r.w === 36);
  assert(bars.length === 2, 'bg+bar at full HP should both have w=36');
  // зелёный fill
  const greenFill = hpG._fills.find(f => f && f.color === 0x00cc00);
  assert(greenFill, 'green HP fill not found');
});

test('HP 60% → ширина полосы ≈ 21.6, цвет зелёный (>50%)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ health: 60, maxHealth: 100 }), app, layers, 100, 100);
  const hpG = c.children[2];
  const bar = hpG.ops.filter(o => o.type === 'rect').find(r => r.x === -18 && r.y === -22 && Math.abs(r.w - 36 * 0.6) < 1e-6);
  assert(bar, 'HP bar 60% not found');
  const greenFill = hpG._fills.find(f => f && f.color === 0x00cc00);
  assert(greenFill, 'green HP fill not found');
});

test('HP 30% → цвет жёлтый (>25%, ≤50%)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ health: 30, maxHealth: 100 }), app, layers, 100, 100);
  const hpG = c.children[2];
  const yellowFill = hpG._fills.find(f => f && f.color === 0xffcc00);
  assert(yellowFill, 'yellow HP fill not found');
  const greenFill = hpG._fills.find(f => f && f.color === 0x00cc00);
  assert(!greenFill, 'green HP fill should NOT be present');
});

test('HP 20% → цвет красный (≤25%)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ health: 20, maxHealth: 100 }), app, layers, 100, 100);
  const hpG = c.children[2];
  const redFill = hpG._fills.find(f => f && f.color === 0xcc0000);
  assert(redFill, 'red HP fill not found');
});

test('HP 0 → только чёрный фон, без цветной полосы', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const c = renderUnit(makeBattalion({ health: 0, maxHealth: 100 }), app, layers, 100, 100);
  const hpG = c.children[2];
  const rects = hpG.ops.filter(o => o.type === 'rect');
  assert(rects.length === 1, 'expected only bg rect, got ' + rects.length);
  // только один fill (чёрный)
  assert(hpG._fills.length === 1, 'expected 1 fill at 0 HP');
  assert(hpG._fills[0].color === 0x000000);
});

// ── renderAllUnits ─────────────────────────────────────
console.log('\n[renderAllUnits]');

test('пустой массив → пустой результат', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const out = renderAllUnits([], app, layers, 100, 100);
  assert(Array.isArray(out) && out.length === 0);
  assert(layers.units.children.length === 0);
});

test('null → пустой результат без краша', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  assert(renderAllUnits(null, app, layers, 100, 100).length === 0);
});

test('createTestBattalions() → 4 контейнера в layers.units', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const list = createTestBattalions();
  const out = renderAllUnits(list, app, layers, 200, 200);
  assert(out.length === 4, 'expected 4, got ' + out.length);
  assert(layers.units.children.length === 4);
});

test('renderAllUnits → layers.units.sortableChildren === true', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  assert(layers.units.sortableChildren === false, 'precondition');
  renderAllUnits(createTestBattalions(), app, layers, 200, 200);
  assert(layers.units.sortableChildren === true);
});

test('zIndex совпадает с y у всех отрендеренных юнитов', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const out = renderAllUnits(createTestBattalions(), app, layers, 200, 200);
  for (const c of out) {
    assert(c.zIndex === c.y, 'zIndex != y for ' + c.battalionId);
  }
});

test('ally и enemy имеют разные цвета блока (sanity-чек)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const list = createTestBattalions();
  const out = renderAllUnits(list, app, layers, 200, 200);

  const allyContainer  = out.find((_, i) => list[i].side === 'ally');
  const enemyContainer = out.find((_, i) => list[i].side === 'enemy');
  const allyColors = new Set(allyContainer.children[0]._fills.map(f => f && f.color));
  const enemyColors = new Set(enemyContainer.children[0]._fills.map(f => f && f.color));
  // Ни один цвет ally не должен встречаться в enemy.
  for (const cc of allyColors) {
    assert(!enemyColors.has(cc), 'ally/enemy color clash: 0x' + cc.toString(16));
  }
});

// ── Итог ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
