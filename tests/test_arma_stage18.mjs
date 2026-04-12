// Тесты Шага 18 (arma.md) — Interaction: selection & movement
// Запуск: node tests/test_arma_stage18.mjs
//
// Чеклист из arma.md Шаг 18:
//   [1]  container.interactive === true после renderUnit.
//   [2]  container.eventMode === 'static' после renderUnit.
//   [3]  attachBattleMapInteractions вешает pointerdown на каждый контейнер.
//   [4]  Клик по контейнеру юнита → selectBattalion(id) → isSelected=true.
//   [5]  Повторный клик по другому юниту → выделение переходит,
//        у предыдущего isSelected=false.
//   [6]  Выделение добавляет жёлтый stroke-контур (Graphics с color=0xffcc00).
//   [7]  Снятие выделения удаляет контур из children.
//   [8]  onMapClick без выбранного юнита → null.
//   [9]  onMapClick при выбранном юните → state.moves[id] с targetX/targetY.
//   [10] stepBattleMapAnimations делает lerp container.x/y → target.
//   [11] При завершении (t>=1) move удаляется из state.moves.
//   [12] container.zIndex обновляется после движения (== container.y).
//   [13] Множественные клики по карте заменяют прежний target.
//   [14] redrawUnit(battalion, container) обновляет HP-бар по battalion.health.
//   [15] redrawUnit с app/hmW/hmH обновляет позицию контейнера.
//   [16] selectBattalion с несуществующим id — no-op (без краша).
//   [17] deselectAll очищает selectedId и убирает контур.
//   [18] Пульсация контура: после stepBattleMapAnimations меняется alpha.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const noisePath     = resolve(__dirname, '..', 'engine', 'noise.js');
const battalionPath = resolve(__dirname, '..', 'engine', 'battalion.js');
const pixiPath      = resolve(__dirname, '..', 'ui', 'battle_map_pixi.js');

// ──────────────────────────────────────────────────────────
// Моки PIXI: Container + Graphics (+ event emitter .on())
// ──────────────────────────────────────────────────────────
class FakeEmitter {
  constructor() { this._listeners = {}; }
  on(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn);
    return this;
  }
  emit(evt, data) {
    const arr = this._listeners[evt] || [];
    for (const fn of arr) fn(data);
  }
}

class FakePIXIContainer extends FakeEmitter {
  constructor() {
    super();
    this.children = [];
    this.sortableChildren = false;
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
    this.interactive = false;
    this.eventMode = null;
  }
  addChild(child) { this.children.push(child); return child; }
}

class FakePIXIGraphics extends FakeEmitter {
  constructor() {
    super();
    this.ops = [];
    this._fills = [];
    this._strokes = [];
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
    this.alpha = 1;
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
  clear() {
    this.ops.length = 0;
    this._fills.length = 0;
    this._strokes.length = 0;
    return this;
  }
  circle(x, y, r) { this.ops.push({ type: 'circle', x, y, r }); return this; }
  ellipse(x, y, rx, ry) { this.ops.push({ type: 'ellipse', x, y, rx, ry }); return this; }
  rect(x, y, w, h) { this.ops.push({ type: 'rect', x, y, w, h }); return this; }
  destroy() { this._destroyed = true; }
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

vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });

ctx.module = { exports: {} };
vm.runInContext(readFileSync(battalionPath, 'utf8'), ctx, { filename: battalionPath });
const battalionExports = ctx.module.exports;
const { Battalion, createTestBattalions } = battalionExports;

ctx.module = { exports: {} };
vm.runInContext(readFileSync(pixiPath, 'utf8'), ctx, { filename: pixiPath });
const pixiExports = ctx.module.exports;
const {
  renderUnit,
  renderAllUnits,
  createBattleMapState,
  attachBattleMapInteractions,
  selectBattalion,
  deselectAll,
  onMapClick,
  redrawUnit,
  stepBattleMapAnimations,
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

// Собирает сцену c N юнитами (по умолчанию 4 тестовых).
function buildScene(battalions) {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const list = battalions || createTestBattalions();
  const containers = [];
  for (const b of list) {
    containers.push(renderUnit(b, app, layers, 200, 200));
  }
  const state = createBattleMapState({
    app, layers, battalions: list, containers, hmW: 200, hmH: 200
  });
  attachBattleMapInteractions(state);
  return { app, layers, list, containers, state };
}

console.log('═══ Шаг 18 (arma.md) — Interaction: selection & movement ═══');

// ── API surface ────────────────────────────────────────
console.log('\n[API surface]');

test('createBattleMapState is a function', () => {
  assert(typeof createBattleMapState === 'function');
});
test('attachBattleMapInteractions is a function', () => {
  assert(typeof attachBattleMapInteractions === 'function');
});
test('selectBattalion is a function', () => {
  assert(typeof selectBattalion === 'function');
});
test('deselectAll is a function', () => {
  assert(typeof deselectAll === 'function');
});
test('onMapClick is a function', () => {
  assert(typeof onMapClick === 'function');
});
test('redrawUnit is a function', () => {
  assert(typeof redrawUnit === 'function');
});
test('stepBattleMapAnimations is a function', () => {
  assert(typeof stepBattleMapAnimations === 'function');
});

// ── Интерактивность контейнеров ───────────────────────
console.log('\n[Интерактивность]');

test('renderUnit → container.interactive === true', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const b = createTestBattalions()[0];
  const c = renderUnit(b, app, layers, 200, 200);
  assert(c.interactive === true);
});

test('renderUnit → container.eventMode === "static"', () => {
  const app = makeFakeApp(800, 600);
  const layers = makeFakeLayers();
  const b = createTestBattalions()[0];
  const c = renderUnit(b, app, layers, 200, 200);
  assert(c.eventMode === 'static');
});

test('attachBattleMapInteractions регистрирует pointerdown на каждом юните', () => {
  const { containers } = buildScene();
  for (const c of containers) {
    assert(Array.isArray(c._listeners.pointerdown) && c._listeners.pointerdown.length === 1,
      'expected 1 pointerdown listener per container');
  }
});

test('attachBattleMapInteractions регистрирует pointerdown на app.stage', () => {
  const { app } = buildScene();
  assert(Array.isArray(app.stage._listeners.pointerdown) && app.stage.eventMode === 'static');
});

// ── Selection ─────────────────────────────────────────
console.log('\n[Selection]');

test('selectBattalion ставит isSelected=true', () => {
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  assert(list[0].isSelected === true);
  assert(state.selectedId === list[0].id);
});

test('selectBattalion переносит выделение с одного юнита на другого', () => {
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  selectBattalion(list[1].id, state);
  assert(list[0].isSelected === false, 'previous must be deselected');
  assert(list[1].isSelected === true,  'new must be selected');
  assert(state.selectedId === list[1].id);
});

test('selectBattalion добавляет жёлтый stroke-контур в container.children', () => {
  const { state, list, containers } = buildScene();
  // precondition — 3 child
  assert(containers[0].children.length === 3);
  selectBattalion(list[0].id, state);
  assert(containers[0].children.length === 4, 'selection outline added as 4th child');
  const outline = containers[0]._selectionG;
  assert(outline, 'container._selectionG set');
  // should have yellow stroke
  const yellowStroke = outline._strokes.find(s => s && s.color === 0xffcc00);
  assert(yellowStroke, 'yellow stroke not found in outline');
});

test('селект другого юнита убирает контур у предыдущего', () => {
  const { state, list, containers } = buildScene();
  selectBattalion(list[0].id, state);
  selectBattalion(list[1].id, state);
  assert(containers[0].children.length === 3,
    'first container should lose outline, got ' + containers[0].children.length);
  assert(containers[0]._selectionG == null);
  assert(containers[1].children.length === 4);
});

test('selectBattalion с несуществующим id — no-op', () => {
  const { state, list } = buildScene();
  selectBattalion('nope', state);
  assert(state.selectedId == null);
  for (const b of list) assert(b.isSelected === false);
});

test('pointerdown на контейнере вызывает selectBattalion', () => {
  const { state, list, containers } = buildScene();
  // эмулируем событие
  containers[0].emit('pointerdown', {});
  assert(state.selectedId === list[0].id);
  assert(list[0].isSelected === true);
});

test('pointerdown на другом контейнере переключает выделение', () => {
  const { state, list, containers } = buildScene();
  containers[0].emit('pointerdown', {});
  containers[1].emit('pointerdown', {});
  assert(state.selectedId === list[1].id);
  assert(list[0].isSelected === false);
  assert(list[1].isSelected === true);
});

test('deselectAll очищает selectedId и убирает контур', () => {
  const { state, list, containers } = buildScene();
  selectBattalion(list[0].id, state);
  assert(containers[0].children.length === 4);
  deselectAll(state);
  assert(state.selectedId == null);
  assert(list[0].isSelected === false);
  assert(containers[0].children.length === 3);
});

// ── onMapClick / движение ─────────────────────────────
console.log('\n[onMapClick / движение]');

test('onMapClick без выделения → null', () => {
  const { state } = buildScene();
  const r = onMapClick({ x: 100, y: 100 }, state);
  assert(r === null);
});

test('onMapClick с выделением → state.moves[id] содержит target', () => {
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  const r = onMapClick({ x: 400, y: 300 }, state);
  assert(r !== null, 'move object must be returned');
  const m = state.moves[list[0].id];
  assert(m, 'move must be stored in state.moves');
  assert(m.targetX === 400 && m.targetY === 300);
  assert(typeof m.startX === 'number' && typeof m.startY === 'number');
  assert(m.t === 0);
});

test('onMapClick переводит screen coords → battalion.x/y в heightmap', () => {
  // hmW=hmH=200, screenW=800, screenH=600, sx=4, sy=3
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  onMapClick({ x: 400, y: 300 }, state);
  assert(list[0].x === 100, 'x=' + list[0].x);
  assert(list[0].y === 100, 'y=' + list[0].y);
});

test('повторный клик заменяет предыдущий target', () => {
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  onMapClick({ x: 100, y: 100 }, state);
  onMapClick({ x: 500, y: 400 }, state);
  const m = state.moves[list[0].id];
  assert(m.targetX === 500 && m.targetY === 400);
});

test('stepBattleMapAnimations: lerp container.x к target', () => {
  const { state, list, containers } = buildScene();
  const b = list[0];
  selectBattalion(b.id, state);
  const c = containers[0];
  const startX = c.x;
  const startY = c.y;
  onMapClick({ x: startX + 100, y: startY + 100 }, state);
  // шаг = delta=1 → t=0.05, container.x ≈ startX+5
  stepBattleMapAnimations(state, 1);
  const dx = c.x - startX;
  const dy = c.y - startY;
  assert(Math.abs(dx - 5) < 1e-6, 'dx=' + dx);
  assert(Math.abs(dy - 5) < 1e-6, 'dy=' + dy);
  // move ещё не завершён
  assert(state.moves[b.id], 'move still active');
});

test('многократные шаги доводят до target и удаляют move', () => {
  const { state, list, containers } = buildScene();
  const b = list[0];
  selectBattalion(b.id, state);
  const c = containers[0];
  const startX = c.x;
  const startY = c.y;
  onMapClick({ x: startX + 100, y: startY + 60 }, state);
  // 0.05 * delta; чтобы достичь t=1 нужно delta_total=20.
  for (let i = 0; i < 25; i++) stepBattleMapAnimations(state, 1);
  assert(Math.abs(c.x - (startX + 100)) < 1e-6, 'final x=' + c.x);
  assert(Math.abs(c.y - (startY + 60))  < 1e-6, 'final y=' + c.y);
  assert(!state.moves[b.id], 'move should be deleted after completion');
});

test('container.zIndex обновляется на каждом шаге (== c.y)', () => {
  const { state, list, containers } = buildScene();
  const b = list[0];
  selectBattalion(b.id, state);
  const c = containers[0];
  onMapClick({ x: c.x + 200, y: c.y + 50 }, state);
  stepBattleMapAnimations(state, 5);
  assert(c.zIndex === c.y, 'zIndex=' + c.zIndex + ' y=' + c.y);
});

test('t клампится в [0,1], не даёт overshoot', () => {
  const { state, list, containers } = buildScene();
  const b = list[0];
  selectBattalion(b.id, state);
  const c = containers[0];
  const startX = c.x;
  onMapClick({ x: startX + 10, y: c.y }, state);
  // гигантский delta — должен сразу достичь target без перелёта
  stepBattleMapAnimations(state, 1000);
  assert(Math.abs(c.x - (startX + 10)) < 1e-6, 'x=' + c.x);
  assert(!state.moves[b.id]);
});

test('onMapClick с невалидным globalPos → null', () => {
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  assert(onMapClick(null, state) === null);
  assert(onMapClick({}, state) === null);
});

// ── redrawUnit ─────────────────────────────────────────
console.log('\n[redrawUnit]');

test('redrawUnit пересоздаёт HP-бар по battalion.health', () => {
  const { list, containers } = buildScene();
  const b = list[0];
  const c = containers[0];
  // стартовый HP = 100/100 → зелёный
  assert(c._hpG._fills.find(f => f && f.color === 0x00cc00), 'green at start');

  b.health = 20; // ≤25% → красный
  redrawUnit(b, c);
  // после clear() + перерисовки только новые fills
  assert(c._hpG._fills.find(f => f && f.color === 0xcc0000), 'red after redraw');
  assert(!c._hpG._fills.find(f => f && f.color === 0x00cc00), 'green cleared');
});

test('redrawUnit без app не меняет координаты контейнера', () => {
  const { list, containers } = buildScene();
  const b = list[0];
  const c = containers[0];
  const oldX = c.x, oldY = c.y;
  b.x = 999; // данные поменялись, но позицию без app не двигаем
  redrawUnit(b, c);
  assert(c.x === oldX && c.y === oldY);
});

test('redrawUnit с app/hmW/hmH обновляет container.x/y и zIndex', () => {
  const { app, list, containers } = buildScene();
  const b = list[0];
  const c = containers[0];
  b.x = 50;
  b.y = 40;
  redrawUnit(b, c, app, 200, 200);
  // sx=4, sy=3
  assert(c.x === 200, 'x=' + c.x);
  assert(c.y === 120, 'y=' + c.y);
  assert(c.zIndex === c.y);
});

test('redrawUnit без battalion → throw', () => {
  const { containers } = buildScene();
  let threw = false;
  try { redrawUnit(null, containers[0]); } catch (_) { threw = true; }
  assert(threw);
});

test('redrawUnit без container → throw', () => {
  const { list } = buildScene();
  let threw = false;
  try { redrawUnit(list[0], null); } catch (_) { threw = true; }
  assert(threw);
});

// ── Пульсация выделения ───────────────────────────────
console.log('\n[Пульсация]');

test('stepBattleMapAnimations меняет alpha контура выделения', () => {
  const { state, list, containers } = buildScene();
  selectBattalion(list[0].id, state);
  const outline = containers[0]._selectionG;
  const alpha0 = outline.alpha;
  // продвигаем несколько шагов
  stepBattleMapAnimations(state, 4);
  const alpha1 = outline.alpha;
  stepBattleMapAnimations(state, 4);
  const alpha2 = outline.alpha;
  assert(alpha0 !== alpha1 || alpha1 !== alpha2,
    'pulse alpha should vary over steps');
  // alpha в [0,1]
  assert(alpha1 >= 0 && alpha1 <= 1, 'alpha1=' + alpha1);
});

test('пульсация продолжается даже без движения', () => {
  const { state, list } = buildScene();
  selectBattalion(list[0].id, state);
  const phase0 = state.pulse.phase;
  stepBattleMapAnimations(state, 2);
  assert(state.pulse.phase !== phase0, 'phase changed');
});

// ── Stage click → onMapClick интеграция ──────────────
console.log('\n[Stage click → onMapClick]');

test('клик по stage при выделении двигает выбранного юнита', () => {
  const { state, list, containers, app } = buildScene();
  selectBattalion(list[0].id, state);
  const c = containers[0];
  const sx0 = c.x;
  app.stage.emit('pointerdown', { global: { x: sx0 + 50, y: c.y + 50 } });
  const m = state.moves[list[0].id];
  assert(m, 'stage click should create move');
  assert(m.targetX === sx0 + 50);
});

test('unit click не запускает onMapClick (e._unitHandled)', () => {
  const { state, list, containers, app } = buildScene();
  // первый клик — по юниту, устанавливает _unitHandled и вызывает select
  // затем тот же объект ивента попадает на stage
  const evt = { global: { x: 999, y: 999 } };
  containers[0].emit('pointerdown', evt);
  app.stage.emit('pointerdown', evt); // симулируем bubble
  assert(state.selectedId === list[0].id);
  assert(!state.moves[list[0].id], 'no move expected, got ' + JSON.stringify(state.moves));
});

// ── Итог ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
