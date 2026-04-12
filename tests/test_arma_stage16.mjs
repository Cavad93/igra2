// Тесты Шага 16 (arma.md) — Battalion class
// Запуск: node tests/test_arma_stage16.mjs
//
// Чеклист из arma.md Шаг 16:
//   [1] class Battalion с полями:
//       id, x, y, side, unitType, health, maxHealth, formation, isSelected.
//   [2] isAlive() — метод, вернуть health > 0.
//   [3] takeDamage(amount) — уменьшить health, не ниже 0.
//   [4] side ∈ {'ally','enemy'}.
//   [5] unitType ∈ {'infantry','cavalry','archers','cannon'}.
//   [6] formation ∈ {'line','square','skirmish'}.
//   [7] createTestBattalions() → ровно 4 батальона:
//         2 ally + 2 enemy, разных типов и позиций.
//   [8] Класс без UI-зависимостей (нет PIXI, document, window).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const battalionPath = resolve(__dirname, '..', 'engine', 'battalion.js');

// ──────────────────────────────────────────────────────────
// VM-контекст — БЕЗ PIXI, BEZ document, BEZ window.
// Это гарантирует, что battalion.js не использует UI-зависимости.
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  require: undefined,
  console,
  Number, Math, Array, Object, Error, Infinity, isFinite, parseInt,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(battalionPath, 'utf8'), ctx, { filename: battalionPath });
const api = ctx.module.exports;

const {
  Battalion,
  createTestBattalions,
  BATTALION_SIDES,
  BATTALION_UNIT_TYPES,
  BATTALION_FORMATIONS
} = api;

// ──────────────────────────────────────────────────────────
// Test runner
// ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function makeValid(overrides) {
  const base = {
    id:        'ally_1',
    x:         10,
    y:         20,
    side:      'ally',
    unitType:  'infantry',
    health:    100,
    maxHealth: 100,
    formation: 'line'
  };
  return Object.assign(base, overrides || {});
}

console.log('═══ Шаг 16 (arma.md) — Battalion class ═══');

// ── API surface ───────────────────────────────────────────
console.log('\n[API surface]');

test('Battalion — функция/конструктор', () => {
  assert(typeof Battalion === 'function');
});

test('createTestBattalions — функция', () => {
  assert(typeof createTestBattalions === 'function');
});

test('константы сторон/типов/формаций экспортируются', () => {
  assert(Array.isArray(BATTALION_SIDES) && BATTALION_SIDES.length === 2);
  assert(BATTALION_SIDES.indexOf('ally') >= 0);
  assert(BATTALION_SIDES.indexOf('enemy') >= 0);
  assert(Array.isArray(BATTALION_UNIT_TYPES) && BATTALION_UNIT_TYPES.length === 4);
  assert(['infantry','cavalry','archers','cannon']
    .every(t => BATTALION_UNIT_TYPES.indexOf(t) >= 0));
  assert(Array.isArray(BATTALION_FORMATIONS) && BATTALION_FORMATIONS.length === 3);
  assert(['line','square','skirmish']
    .every(f => BATTALION_FORMATIONS.indexOf(f) >= 0));
});

// ── Поля ──────────────────────────────────────────────────
console.log('\n[Поля]');

test('все обязательные поля присутствуют после конструктора', () => {
  const b = new Battalion(makeValid());
  assert(b.id === 'ally_1');
  assert(b.x === 10);
  assert(b.y === 20);
  assert(b.side === 'ally');
  assert(b.unitType === 'infantry');
  assert(b.health === 100);
  assert(b.maxHealth === 100);
  assert(b.formation === 'line');
  assert(b.isSelected === false, 'isSelected must default to false');
});

test('instanceof Battalion', () => {
  const b = new Battalion(makeValid());
  assert(b instanceof Battalion);
});

test('isSelected можно установить вручную', () => {
  const b = new Battalion(makeValid());
  b.isSelected = true;
  assert(b.isSelected === true);
});

// ── isAlive() ─────────────────────────────────────────────
console.log('\n[isAlive()]');

test('isAlive() → true при health > 0', () => {
  const b = new Battalion(makeValid({ health: 50 }));
  assert(b.isAlive() === true);
});

test('isAlive() → true при health = 1', () => {
  const b = new Battalion(makeValid({ health: 1 }));
  assert(b.isAlive() === true);
});

test('isAlive() → false при health = 0', () => {
  const b = new Battalion(makeValid({ health: 0 }));
  assert(b.isAlive() === false);
});

test('isAlive() → false после смертельного урона', () => {
  const b = new Battalion(makeValid({ health: 30 }));
  b.takeDamage(30);
  assert(b.isAlive() === false);
});

// ── takeDamage() ──────────────────────────────────────────
console.log('\n[takeDamage()]');

test('takeDamage уменьшает health', () => {
  const b = new Battalion(makeValid({ health: 100 }));
  b.takeDamage(25);
  assert(b.health === 75);
});

test('takeDamage(200) на 100 HP → health == 0, не отрицательное', () => {
  const b = new Battalion(makeValid({ health: 100 }));
  b.takeDamage(200);
  assert(b.health === 0, 'health=' + b.health);
  assert(b.health >= 0);
});

test('takeDamage не делает health отрицательным при повторных ударах', () => {
  const b = new Battalion(makeValid({ health: 100 }));
  b.takeDamage(60);
  b.takeDamage(60);
  b.takeDamage(60);
  assert(b.health === 0);
});

test('takeDamage с нулём не меняет health', () => {
  const b = new Battalion(makeValid({ health: 80 }));
  b.takeDamage(0);
  assert(b.health === 80);
});

// ── Валидация входа ───────────────────────────────────────
console.log('\n[Валидация входа]');

test('side должен быть ally или enemy (строка "blue" → throw)', () => {
  let threw = false;
  try { new Battalion(makeValid({ side: 'blue' })); }
  catch (e) { threw = true; }
  assert(threw);
});

test('side === "ally" — ok', () => {
  const b = new Battalion(makeValid({ side: 'ally' }));
  assert(b.side === 'ally');
});

test('side === "enemy" — ok', () => {
  const b = new Battalion(makeValid({ side: 'enemy', id: 'enemy_1' }));
  assert(b.side === 'enemy');
});

test('невалидный unitType → throw', () => {
  let threw = false;
  try { new Battalion(makeValid({ unitType: 'wizard' })); }
  catch (e) { threw = true; }
  assert(threw);
});

test('невалидный formation → throw', () => {
  let threw = false;
  try { new Battalion(makeValid({ formation: 'chaos' })); }
  catch (e) { threw = true; }
  assert(threw);
});

test('maxHealth ≤ 0 → throw', () => {
  let threw = false;
  try { new Battalion(makeValid({ maxHealth: 0 })); }
  catch (e) { threw = true; }
  assert(threw);
});

test('пустой id → throw', () => {
  let threw = false;
  try { new Battalion(makeValid({ id: '' })); }
  catch (e) { threw = true; }
  assert(threw);
});

test('health > maxHealth клампится до maxHealth', () => {
  const b = new Battalion(makeValid({ health: 500, maxHealth: 100 }));
  assert(b.health === 100);
});

test('health < 0 клампится до 0', () => {
  const b = new Battalion(makeValid({ health: -10 }));
  assert(b.health === 0);
  assert(b.isAlive() === false);
});

// ── createTestBattalions() ────────────────────────────────
console.log('\n[createTestBattalions()]');

test('возвращает массив из 4 батальонов', () => {
  const list = createTestBattalions();
  assert(Array.isArray(list));
  assert(list.length === 4, 'expected 4, got ' + list.length);
});

test('все элементы — instanceof Battalion', () => {
  const list = createTestBattalions();
  for (const b of list) assert(b instanceof Battalion);
});

test('2 ally + 2 enemy', () => {
  const list = createTestBattalions();
  const allies  = list.filter(b => b.side === 'ally').length;
  const enemies = list.filter(b => b.side === 'enemy').length;
  assert(allies === 2, 'allies=' + allies);
  assert(enemies === 2, 'enemies=' + enemies);
});

test('id уникальны', () => {
  const list = createTestBattalions();
  const ids = new Set(list.map(b => b.id));
  assert(ids.size === list.length);
});

test('разные unitType (хотя бы 2 различных)', () => {
  const list = createTestBattalions();
  const types = new Set(list.map(b => b.unitType));
  assert(types.size >= 2, 'expected >=2 unique types, got ' + types.size);
});

test('разные позиции', () => {
  const list = createTestBattalions();
  const positions = new Set(list.map(b => b.x + ',' + b.y));
  assert(positions.size === list.length, 'positions must be unique');
});

test('все тестовые батальоны isAlive() → true', () => {
  const list = createTestBattalions();
  for (const b of list) assert(b.isAlive());
});

// ── Без UI-зависимостей ───────────────────────────────────
console.log('\n[UI-independent]');

test('модуль загружается в vm без PIXI / document / window', () => {
  // Если бы engine/battalion.js использовал PIXI/document/window — vm выбросил бы
  // ReferenceError ещё на шаге runInContext выше. Сам факт дохода до этого теста
  // означает, что модуль чистый. Но дополнительно проверим, что Battalion не
  // цепляет никаких внешних рендер-контекстов.
  const b = new Battalion(makeValid());
  // никаких скрытых свойств рендера
  assert(!('_pixi' in b));
  assert(!('_sprite' in b));
  assert(!('_texture' in b));
});

// ── Итог ───────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
