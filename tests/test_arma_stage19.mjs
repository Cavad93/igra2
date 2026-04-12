// Тесты Шага 19 (arma.md) — Укрепления и эффекты атаки
// Запуск: node tests/test_arma_stage19.mjs
//
// Чеклист из arma.md Шаг 19:
//   [1]  generateFortifications(keyPoints, seed) → массив fort'ов,
//        по одному на keyPoint.
//   [2]  Каждый fort содержит center.x/y == keyPoint.x/y и points[3..5].
//   [3]  Все точки fort лежат в кольце ~0.8..1.2 * FORT_RADIUS вокруг центра.
//   [4]  Детерминированность: один и тот же seed → одинаковые точки.
//   [5]  Разные seed → разные точки (хотя бы одно отличие).
//   [6]  renderFortifications добавляет по одному PIXI.Graphics на fort
//        в layers.roads (под деревьями, над terrain).
//   [7]  Stroke ломаной линии — color=0x8a0000, width=2, alpha≈0.9.
//   [8]  Шипы добавлены (fill color=0x8a0000) — их количество > 0.
//   [9]  Шипы направлены наружу от center (проверка: треугольник
//        имеет вершину, удалённую от center дальше, чем основание).
//   [10] emitDamageNumber создаёт PIXI.Text в layers.fx с fill=0xff4444.
//   [11] Анимация: stepBattleMapAnimations двигает text.y вверх и
//        уменьшает alpha, удаляет при alpha ≤ 0.
//   [12] drawAimLine создаёт пунктирную линию (stroke color=0xff8800) в fx.
//   [13] aim-line содержит несколько moveTo/lineTo пар (пунктир).
//   [14] removeAimLine удаляет graphics из layers.fx.children.
//   [15] emitDamageNumber без layers.fx → throw.
//   [16] drawAimLine без units → throw.
//   [17] renderFortifications пропускает fort с points.length < 2.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname        = dirname(fileURLToPath(import.meta.url));
const noisePath        = resolve(__dirname, '..', 'engine', 'noise.js');
const fortificationsPath = resolve(__dirname, '..', 'engine', 'fortifications.js');
const pixiPath         = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Container + Graphics + Text
// ──────────────────────────────────────────────────────────
class FakeEmitter {
  constructor() { this._listeners = {}; }
  on(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); return this; }
  emit(evt, data) { (this._listeners[evt] || []).forEach(fn => fn(data)); }
}

class FakePIXIContainer extends FakeEmitter {
  constructor() {
    super();
    this.children = [];
    this.sortableChildren = false;
    this.x = 0; this.y = 0; this.zIndex = 0;
    this.interactive = false;
    this.eventMode = null;
    this.alpha = 1;
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    if (child.parent === this) child.parent = null;
    return child;
  }
}

class FakePIXIGraphics extends FakeEmitter {
  constructor() {
    super();
    this.ops = [];
    this._fills = [];
    this._strokes = [];
    this.x = 0; this.y = 0; this.zIndex = 0;
    this.alpha = 1;
    this.parent = null;
  }
  moveTo(x, y)  { this.ops.push({ type: 'moveTo', x, y }); return this; }
  lineTo(x, y)  { this.ops.push({ type: 'lineTo', x, y }); return this; }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.ops.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    return this;
  }
  stroke(style) { this.ops.push({ type: 'stroke', style }); this._strokes.push(style); return this; }
  fill(style)   { this.ops.push({ type: 'fill', style });   this._fills.push(style);   return this; }
  clear() { this.ops.length = 0; this._fills.length = 0; this._strokes.length = 0; return this; }
  circle(x, y, r) { this.ops.push({ type: 'circle', x, y, r }); return this; }
  ellipse(x, y, rx, ry) { this.ops.push({ type: 'ellipse', x, y, rx, ry }); return this; }
  rect(x, y, w, h) { this.ops.push({ type: 'rect', x, y, w, h }); return this; }
  destroy() { this._destroyed = true; }
}

class FakePIXIText {
  constructor(opts) {
    this.text  = opts && opts.text;
    this.style = opts && opts.style;
    this.x = 0; this.y = 0; this.alpha = 1;
    this.parent = null;
    this._destroyed = false;
  }
  destroy() { this._destroyed = true; }
}

class FakePIXISprite {
  constructor(texture) { this.texture = texture; this.width = 0; this.height = 0; }
}
const FakePIXITexture = { from(source) { return { _source: source }; } };

const fakePIXI = {
  Container: FakePIXIContainer,
  Graphics:  FakePIXIGraphics,
  Text:      FakePIXIText,
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

// noise (для mulberry32)
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });

// fortifications
ctx.module = { exports: {} };
vm.runInContext(readFileSync(fortificationsPath, 'utf8'), ctx, { filename: fortificationsPath });
const fortExports = ctx.module.exports;
const { generateFortifications, FORT_RADIUS } = fortExports;

// battle_map_pixi
ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;
const {
  renderFortifications,
  emitDamageNumber,
  drawAimLine,
  removeAimLine,
  stepBattleMapAnimations
} = pixiExports;

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
  const stage = new FakePIXIContainer();
  return { screen: { width: w, height: h }, stage };
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

console.log('═══ Шаг 19 (arma.md) — Укрепления и эффекты атаки ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('generateFortifications is a function', () => {
  assert(typeof generateFortifications === 'function');
});
test('renderFortifications is a function', () => {
  assert(typeof renderFortifications === 'function');
});
test('emitDamageNumber is a function', () => {
  assert(typeof emitDamageNumber === 'function');
});
test('drawAimLine is a function', () => {
  assert(typeof drawAimLine === 'function');
});
test('removeAimLine is a function', () => {
  assert(typeof removeAimLine === 'function');
});
test('FORT_RADIUS exported from fortifications', () => {
  assert(typeof FORT_RADIUS === 'number' && FORT_RADIUS > 0);
});

// ── generateFortifications ─────────────────────────────
console.log('\n[generateFortifications]');

const kp = [
  { x: 100, y: 100, name: 'city_1' },
  { x: 150, y: 80,  name: 'city_2' },
  { x: 50,  y: 160, name: 'city_3' }
];

test('возвращает массив такой же длины, как keyPoints', () => {
  const forts = generateFortifications(kp, 42);
  assert(Array.isArray(forts), 'must be array');
  assert(forts.length === kp.length, 'length=' + forts.length);
});

test('каждый fort имеет center == keyPoint и points.length ∈ [3,5]', () => {
  const forts = generateFortifications(kp, 42);
  for (let i = 0; i < forts.length; i++) {
    const f = forts[i];
    assert(f.center.x === kp[i].x && f.center.y === kp[i].y,
      'center mismatch at ' + i);
    assert(Array.isArray(f.points), 'points array at ' + i);
    assert(f.points.length >= 3 && f.points.length <= 5,
      'fort ' + i + ' has ' + f.points.length + ' points (expected 3..5)');
  }
});

test('все точки fort лежат в радиусе ~0.8..1.2 * FORT_RADIUS вокруг center', () => {
  const forts = generateFortifications(kp, 42);
  const rMin = FORT_RADIUS * 0.79;
  const rMax = FORT_RADIUS * 1.21;
  for (const f of forts) {
    for (const p of f.points) {
      const dx = p.x - f.center.x;
      const dy = p.y - f.center.y;
      const r = Math.sqrt(dx*dx + dy*dy);
      assert(r >= rMin && r <= rMax,
        'point at r=' + r.toFixed(2) + ' outside [' + rMin + ',' + rMax + ']');
    }
  }
});

test('детерминированность: один seed → идентичный результат', () => {
  const a = generateFortifications(kp, 42);
  const b = generateFortifications(kp, 42);
  assert(a.length === b.length);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].points.length === b[i].points.length,
      'length mismatch at ' + i);
    for (let k = 0; k < a[i].points.length; k++) {
      assert(Math.abs(a[i].points[k].x - b[i].points[k].x) < 1e-9);
      assert(Math.abs(a[i].points[k].y - b[i].points[k].y) < 1e-9);
    }
  }
});

test('разные seed → различающиеся точки', () => {
  const a = generateFortifications(kp, 42);
  const b = generateFortifications(kp, 999);
  let diff = false;
  outer:
  for (let i = 0; i < a.length; i++) {
    if (a[i].points.length !== b[i].points.length) { diff = true; break; }
    for (let k = 0; k < a[i].points.length; k++) {
      if (Math.abs(a[i].points[k].x - b[i].points[k].x) > 1e-6 ||
          Math.abs(a[i].points[k].y - b[i].points[k].y) > 1e-6) {
        diff = true; break outer;
      }
    }
  }
  assert(diff, 'results should differ for different seeds');
});

test('пустой keyPoints → пустой массив', () => {
  const forts = generateFortifications([], 1);
  assert(Array.isArray(forts) && forts.length === 0);
});

test('невалидные точки пропускаются', () => {
  const forts = generateFortifications([
    { x: 100, y: 100 },
    null,
    { x: 'a', y: 1 },
    { x: 200, y: 200 }
  ], 1);
  assert(forts.length === 2, 'expected 2 forts, got ' + forts.length);
});

// ── renderFortifications ───────────────────────────────
console.log('\n[renderFortifications]');

test('создаёт по одному Graphics на каждый fort в layers.roads', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = generateFortifications(kp, 42);
  const hmW = 200, hmH = 200;
  const created = renderFortifications(app, layers, forts, hmW, hmH);
  assert(created.length === forts.length,
    'created ' + created.length + ' vs forts ' + forts.length);
  assert(layers.roads.children.length === forts.length,
    'roads has ' + layers.roads.children.length + ' children');
});

test('stroke красной линии обороны — color 0x8a0000, width 2', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = generateFortifications(kp, 42);
  const [g] = renderFortifications(app, layers, forts, 200, 200);
  const redStroke = g._strokes.find(s => s && s.color === 0x8a0000 && s.width === 2);
  assert(redStroke, 'red stroke 0x8a0000 width=2 not found in graphics ops');
});

test('шипы заполнены красным цветом 0x8a0000 (fill ops > 0)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = generateFortifications(kp, 42);
  const [g] = renderFortifications(app, layers, forts, 200, 200);
  const redFills = g._fills.filter(f => f && f.color === 0x8a0000);
  assert(redFills.length > 0, 'expected red fill spikes, got ' + redFills.length);
});

test('каждый шип — треугольник (moveTo, 3×lineTo, fill)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = generateFortifications(kp, 42);
  const [g] = renderFortifications(app, layers, forts, 200, 200);
  // После первой stroke (линии обороны) идут пары: moveTo + 3 lineTo + fill
  // Подсчёт fill-ops даёт число шипов.
  const fillCount = g._fills.filter(f => f && f.color === 0x8a0000).length;
  assert(fillCount >= 3, 'spikes count too small: ' + fillCount);
});

test('renderFortifications возвращает [] при пустом входе', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const created = renderFortifications(app, layers, [], 200, 200);
  assert(Array.isArray(created) && created.length === 0);
  assert(layers.roads.children.length === 0);
});

test('fort с <2 точками пропускается', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = [
    { center: { x: 100, y: 100 }, points: [{ x: 110, y: 100 }] }, // only 1 pt
    { center: { x: 100, y: 100 }, points: [{ x: 110, y: 100 }, { x: 100, y: 110 }, { x: 90, y: 100 }] }
  ];
  const created = renderFortifications(app, layers, forts, 200, 200);
  assert(created.length === 1, 'expected 1 drawn, got ' + created.length);
});

test('без app/layers → throw', () => {
  let threw = false;
  try { renderFortifications(null, makeFakeLayers(), [], 200, 200); } catch (_) { threw = true; }
  assert(threw);
  threw = false;
  try { renderFortifications(makeFakeApp(800, 600), null, [], 200, 200); } catch (_) { threw = true; }
  assert(threw);
});

test('Graphics укрепления добавлен в layers.roads (не forests и не fx)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = generateFortifications(kp, 42);
  renderFortifications(app, layers, forts, 200, 200);
  assert(layers.roads.children.length > 0, 'roads should have children');
  assert(layers.forests.children.length === 0, 'forests should be empty');
  assert(layers.fx.children.length === 0, 'fx should be empty');
});

// ── emitDamageNumber ─────────────────────────────────
console.log('\n[emitDamageNumber]');

test('создаёт PIXI.Text в layers.fx с fill 0xff4444', () => {
  const layers = makeFakeLayers();
  const text = emitDamageNumber(layers, 100, 200, 42);
  assert(text instanceof FakePIXIText, 'must return PIXI.Text');
  assert(text.text === '42', 'text=' + text.text);
  assert(text.style && text.style.fill === 0xff4444, 'fill color wrong');
  assert(layers.fx.children.includes(text), 'not added to fx layer');
  assert(text.x === 100 && text.y === 200);
  assert(text.alpha === 1);
});

test('без layers.fx → throw', () => {
  let threw = false;
  try { emitDamageNumber(null, 0, 0, 10); } catch (_) { threw = true; }
  assert(threw);
  threw = false;
  try { emitDamageNumber({}, 0, 0, 10); } catch (_) { threw = true; }
  assert(threw);
});

test('невалидные координаты → throw', () => {
  const layers = makeFakeLayers();
  let threw = false;
  try { emitDamageNumber(layers, 'a', 0, 10); } catch (_) { threw = true; }
  assert(threw);
});

test('opts.state — текст регистрируется в state.damageNumbers', () => {
  const layers = makeFakeLayers();
  const state = { damageNumbers: [] };
  const t = emitDamageNumber(layers, 50, 50, 7, { state });
  assert(state.damageNumbers.length === 1);
  assert(state.damageNumbers[0] === t);
});

test('stepBattleMapAnimations двигает text вверх и уменьшает alpha', () => {
  const layers = makeFakeLayers();
  const state = { damageNumbers: [], pulse: { phase: 0, alpha: 1 }, moves: {}, units: {} };
  const t = emitDamageNumber(layers, 100, 100, 25, { state });
  const y0 = t.y, a0 = t.alpha;
  stepBattleMapAnimations(state, 1);
  assert(t.y < y0, 'text.y should decrease (up). was ' + y0 + ' now ' + t.y);
  assert(t.alpha < a0, 'alpha should decrease');
  // конкретные значения: y = y0 - 1.5, alpha = 1 - 0.03
  assert(Math.abs(t.y - (y0 - 1.5)) < 1e-6);
  assert(Math.abs(t.alpha - (a0 - 0.03)) < 1e-6);
});

test('text удаляется из fx когда alpha ≤ 0', () => {
  const layers = makeFakeLayers();
  const state = { damageNumbers: [], pulse: { phase: 0, alpha: 1 }, moves: {}, units: {} };
  const t = emitDamageNumber(layers, 100, 100, 25, { state });
  assert(layers.fx.children.length === 1);
  // 40 шагов δ=1: alpha 1 - 40*0.03 < 0
  for (let i = 0; i < 40; i++) stepBattleMapAnimations(state, 1);
  assert(state.damageNumbers.length === 0, 'state.damageNumbers not cleared');
  assert(layers.fx.children.length === 0, 'fx.children not cleared');
});

// ── drawAimLine / removeAimLine ───────────────────────
console.log('\n[drawAimLine / removeAimLine]');

test('создаёт Graphics в layers.fx с оранжевым stroke 0xff8800', () => {
  const layers = makeFakeLayers();
  const fromUnit = { container: { x: 100, y: 100 } };
  const toUnit   = { container: { x: 300, y: 180 } };
  const g = drawAimLine(layers, fromUnit, toUnit);
  assert(g instanceof FakePIXIGraphics, 'must be Graphics');
  assert(layers.fx.children.includes(g), 'not in fx');
  const orange = g._strokes.find(s => s && s.color === 0xff8800);
  assert(orange, 'orange stroke not found');
  assert(g._isAimLine === true, '_isAimLine marker missing');
});

test('пунктир: несколько пар moveTo/lineTo', () => {
  const layers = makeFakeLayers();
  // Расстояние 100 px, dash=6 → ~16 "ячеек", ~8 рисуется.
  const g = drawAimLine(layers, { x: 0, y: 0 }, { x: 100, y: 0 });
  const moves = g.ops.filter(o => o.type === 'moveTo').length;
  const lines = g.ops.filter(o => o.type === 'lineTo').length;
  assert(moves >= 3 && lines >= 3, 'dashed pattern: ' + moves + ' moveTo, ' + lines + ' lineTo');
  assert(moves === lines, 'each moveTo should have matching lineTo');
});

test('принимает raw-units без container (по .x/.y)', () => {
  const layers = makeFakeLayers();
  const g = drawAimLine(layers, { x: 10, y: 10 }, { x: 50, y: 10 });
  assert(g._strokes.length >= 1);
});

test('без fromUnit/toUnit → throw', () => {
  const layers = makeFakeLayers();
  let threw = false;
  try { drawAimLine(layers, null, { x: 1, y: 1 }); } catch (_) { threw = true; }
  assert(threw);
  threw = false;
  try { drawAimLine(layers, { x: 1, y: 1 }, null); } catch (_) { threw = true; }
  assert(threw);
});

test('без layers.fx → throw', () => {
  let threw = false;
  try { drawAimLine(null, { x: 0, y: 0 }, { x: 10, y: 10 }); } catch (_) { threw = true; }
  assert(threw);
});

test('removeAimLine удаляет graphics из fx.children', () => {
  const layers = makeFakeLayers();
  const g = drawAimLine(layers, { x: 0, y: 0 }, { x: 100, y: 100 });
  assert(layers.fx.children.length === 1);
  removeAimLine(layers, g);
  assert(layers.fx.children.length === 0, 'aim line not removed');
});

test('removeAimLine с невалидными аргументами — no-op', () => {
  const layers = makeFakeLayers();
  removeAimLine(null, null);          // no throw
  removeAimLine(layers, null);        // no throw
  assert(layers.fx.children.length === 0);
});

// ── Интеграция: порядок слоёв (fortifications в roads, под forests) ─
console.log('\n[Порядок слоёв]');

test('fortifications попадают в layers.roads (под forests, над bg)', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const forts = generateFortifications([{ x: 100, y: 100 }], 1);
  renderFortifications(app, layers, forts, 200, 200);
  assert(layers.roads.children.length === 1);
  assert(layers.bg.children.length === 0);
  assert(layers.forests.children.length === 0);
  assert(layers.units.children.length === 0);
  assert(layers.fx.children.length === 0);
});

// ── Итог ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
