/**
 * tests/eco_stage5_cycles_test.cjs
 *
 * Этап 5 (docs/economic2.md) — экономические циклы (бум / спад).
 * Node-stub: подгружает engine/economy_ext.js в vm-контексте,
 * проверяет updateEconomicCycle() / getCycleMult() / поведение
 * относительно длительности и периодичности проверок.
 *
 * Запуск: node tests/eco_stage5_cycles_test.cjs
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else      { console.error('  ✗ ' + msg); failed++; }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) < eps; }

const src = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy_ext.js'),
  'utf8',
);

const sandbox = {
  console,
  GAME_STATE: null,
  STRATEGIC_GOODS: ['iron', 'horses', 'salt', 'timber'],
  addEventLog: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'engine/economy_ext.js' });

const {
  initEconomyExt,
  updateEconomicCycle,
  getCycleMult,
  getEconomicCycleBanner,
  CYCLE_GOODS,
  CYCLE_TYPES,
} = sandbox;

function freshState(turn = 0) {
  sandbox.GAME_STATE = {
    turn,
    player_nation: 'rome',
    nations: { rome: { economy: { treasury: 0 } } },
    regions: {},
    market: {},
  };
  initEconomyExt();
}

// Утилита: подмена Math.random на заданную последовательность.
// vm-контекст имеет собственный Math, поэтому подмену делаем внутри
// sandbox.Math напрямую.
const sandboxMath = vm.runInContext('Math', sandbox);
function withRandom(values, fn) {
  const orig = sandboxMath.random;
  let i = 0;
  sandboxMath.random = () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
  try { fn(); } finally { sandboxMath.random = orig; }
}

// ══════════════════════════════════════════════════════════════
// TEST 1: init + экспорт
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: инициализация economic_cycle ===');
freshState();
const cycle = sandbox.GAME_STATE.economy_ext.economic_cycle;
assert(typeof cycle === 'object' && cycle !== null,
  'economic_cycle создан как объект');
assert(cycle.current === 'normal', 'current = normal');
assert(cycle.turns_left === 0, 'turns_left = 0');
assert(cycle.next_check_turn === 48, 'next_check_turn = 48');
assert(typeof updateEconomicCycle === 'function', 'updateEconomicCycle экспортирована');
assert(typeof getCycleMult === 'function',         'getCycleMult экспортирована');
assert(typeof getEconomicCycleBanner === 'function', 'getEconomicCycleBanner экспортирована');
assert(Array.isArray(CYCLE_GOODS) && CYCLE_GOODS.includes('wheat'),
  'CYCLE_GOODS содержит wheat');
assert(CYCLE_TYPES && approx(CYCLE_TYPES.boom.mult, 1.15),
  'CYCLE_TYPES.boom.mult = 1.15');
assert(CYCLE_TYPES && approx(CYCLE_TYPES.recession.mult, 0.82),
  'CYCLE_TYPES.recession.mult = 0.82');

// ══════════════════════════════════════════════════════════════
// TEST 2: До next_check_turn ничего не происходит
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: пока turn < next_check_turn — ничего не меняется ===');
freshState(0);
withRandom([0.0], () => {
  for (let t = 0; t < 47; t++) {
    sandbox.GAME_STATE.turn = t;
    updateEconomicCycle();
  }
});
assert(sandbox.GAME_STATE.economy_ext.economic_cycle.current === 'normal',
  'current = normal все 47 ходов');
assert(getCycleMult('wheat') === 1.0, 'getCycleMult(wheat) = 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 3: При достижении 48 хода с нужным rolls активируется boom
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: boom активируется на 48 ходу ===');
freshState(48);
// Порядок Math.random:
//   1) next_check_turn — 0.0
//   2) roll → < 0.20 → boom (даём 0.05)
//   3) длительность → 0.5 (длина = 6 + floor(0.5*7) = 9)
withRandom([0.0, 0.05, 0.5], () => {
  updateEconomicCycle();
});
const c3 = sandbox.GAME_STATE.economy_ext.economic_cycle;
assert(c3.current === 'boom', 'current = boom');
assert(c3.turns_left >= 6 && c3.turns_left <= 12,
  `turns_left в [6,12] (получено ${c3.turns_left})`);
assert(approx(getCycleMult('wheat'), 1.15), 'getCycleMult(wheat) = 1.15');
assert(approx(getCycleMult('barley'), 1.15), 'getCycleMult(barley) = 1.15');
assert(approx(getCycleMult('fish'), 1.15), 'getCycleMult(fish) = 1.15');

// ══════════════════════════════════════════════════════════════
// TEST 4: getCycleMult для не-food возвращает 1.0
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: getCycleMult для не-food ===');
assert(getCycleMult('iron') === 1.0, 'iron → 1.0');
assert(getCycleMult('timber') === 1.0, 'timber → 1.0');
assert(getCycleMult('horses') === 1.0, 'horses → 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 5: turns_left уменьшается каждый ход
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: отсчёт turns_left ===');
freshState(48);
// next_check=0.0, roll=0.05 (boom), length=0.0 (= 6+0 = 6)
withRandom([0.0, 0.05, 0.0], () => {
  updateEconomicCycle();
});
const startLen = sandbox.GAME_STATE.economy_ext.economic_cycle.turns_left;
assert(startLen === 6, `длина 6 (получено ${startLen})`);

// Прокручиваем цикл — каждый тик turns_left уменьшается на 1.
withRandom([0.5], () => {
  for (let i = 1; i <= 5; i++) {
    sandbox.GAME_STATE.turn = 48 + i;
    updateEconomicCycle();
    const tl = sandbox.GAME_STATE.economy_ext.economic_cycle.turns_left;
    assert(tl === startLen - i, `после ${i} тика turns_left=${startLen-i} (получено ${tl})`);
  }
});

// 6-й тик — обнуление и возврат к 'normal'
withRandom([0.5], () => {
  sandbox.GAME_STATE.turn = 48 + 6;
  updateEconomicCycle();
});
const cAfter = sandbox.GAME_STATE.economy_ext.economic_cycle;
assert(cAfter.current === 'normal', 'после обнуления current = normal');
assert(cAfter.turns_left === 0, 'turns_left = 0');
assert(cAfter.next_check_turn > 48 + 6,
  `next_check_turn перенесён вперёд (получено ${cAfter.next_check_turn})`);
assert(getCycleMult('wheat') === 1.0, 'wheat снова без бонуса');

// ══════════════════════════════════════════════════════════════
// TEST 6: recession (roll в [0.20; 0.40))
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: recession при roll = 0.30 ===');
freshState(48);
// next_check=0.0, roll=0.30 (recession ∈ [0.20;0.40)), length=0.0
withRandom([0.0, 0.30, 0.0], () => {
  updateEconomicCycle();
});
const c6 = sandbox.GAME_STATE.economy_ext.economic_cycle;
assert(c6.current === 'recession', `current = recession (получено ${c6.current})`);
assert(approx(getCycleMult('wheat'), 0.82),
  `getCycleMult(wheat) = 0.82 (получено ${getCycleMult('wheat')})`);
assert(approx(getCycleMult('olives'), 0.82), 'olives тоже 0.82');

// ══════════════════════════════════════════════════════════════
// TEST 7: roll ≥ 0.40 → normal (цикл не активируется)
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: roll = 0.5 → остаёмся в normal, next_check_turn сдвигается ===');
freshState(48);
const prevCheck = sandbox.GAME_STATE.economy_ext.economic_cycle.next_check_turn;
// next_check=0.999 (max сдвиг), roll=0.5 → normal
withRandom([0.999, 0.5], () => {
  updateEconomicCycle();
});
const c7 = sandbox.GAME_STATE.economy_ext.economic_cycle;
assert(c7.current === 'normal', 'current = normal');
assert(c7.turns_left === 0, 'turns_left = 0');
assert(c7.next_check_turn > prevCheck,
  `next_check_turn сдвинут вперёд (было ${prevCheck}, стало ${c7.next_check_turn})`);
assert(c7.next_check_turn >= 48 + 48 && c7.next_check_turn < 48 + 48 + 24,
  `next_check_turn в окне [96; 120) (получено ${c7.next_check_turn})`);

// ══════════════════════════════════════════════════════════════
// TEST 8: getEconomicCycleBanner возвращает HTML только при активном цикле
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: HTML-баннер активного цикла ===');
freshState(48);
assert(getEconomicCycleBanner() === '', 'normal → пустая строка');

withRandom([0.0, 0.05, 0.0 /* len=6 */], () => {
  updateEconomicCycle();
});
const html = getEconomicCycleBanner();
assert(typeof html === 'string' && html.length > 0,
  'boom → непустая HTML-строка');
assert(html.includes('Урожайный год'), 'содержит название цикла');
assert(html.includes('ходов'), 'содержит число оставшихся ходов');
assert(html.includes('eco-cycle-banner'), 'содержит css-класс баннера');

// ══════════════════════════════════════════════════════════════
// TEST 9: runEconomyExtTick интегрирует updateEconomicCycle
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: runEconomyExtTick вызывает updateEconomicCycle ===');
freshState(48);
withRandom([0.0, 0.05, 0.0], () => {
  try {
    sandbox.runEconomyExtTick();
    const c = sandbox.GAME_STATE.economy_ext.economic_cycle;
    assert(c.current === 'boom', `runEconomyExtTick активировал boom (получено ${c.current})`);
  } catch (e) {
    assert(false, 'runEconomyExtTick упал: ' + e.message);
  }
});

// ══════════════════════════════════════════════════════════════
// TEST 10: длительность всегда в [6,12]
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: длительность boom в диапазоне [6,12] ===');
for (let r = 0; r < 7; r++) {
  freshState(48);
  // roll=0.05 → boom, length-random=r/7 → 6 + floor(r/7 * 7) = 6+r
  withRandom([0.0, 0.05, r / 7], () => updateEconomicCycle());
  const tl = sandbox.GAME_STATE.economy_ext.economic_cycle.turns_left;
  assert(tl >= 6 && tl <= 12, `длительность ${tl} в [6,12]`);
}

// ══════════════════════════════════════════════════════════════
// TEST 11: Полный жизненный цикл — boom → normal → recession
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 11: жизненный цикл boom→normal→recession ===');
freshState(48);
// Шаг 1: активация boom (длина 6)
withRandom([0.0, 0.05, 0.0], () => updateEconomicCycle());
assert(sandbox.GAME_STATE.economy_ext.economic_cycle.current === 'boom',
  'boom активирован');
// Шаг 2: 6 тиков отсчёта → normal
for (let i = 1; i <= 6; i++) {
  sandbox.GAME_STATE.turn = 48 + i;
  withRandom([0.0], () => updateEconomicCycle());
}
assert(sandbox.GAME_STATE.economy_ext.economic_cycle.current === 'normal',
  'после 6 тиков → normal');
// Шаг 3: ставим turn на next_check_turn и активируем recession
const nextCheck = sandbox.GAME_STATE.economy_ext.economic_cycle.next_check_turn;
sandbox.GAME_STATE.turn = nextCheck;
withRandom([0.0, 0.30, 0.0], () => updateEconomicCycle());
assert(sandbox.GAME_STATE.economy_ext.economic_cycle.current === 'recession',
  'recession активирован после возврата в normal');

// ══════════════════════════════════════════════════════════════
console.log(`\n═════════════════════════════════════`);
console.log(`  Этап 5: ${passed} passed / ${failed} failed`);
console.log(`═════════════════════════════════════`);
process.exit(failed > 0 ? 1 : 0);
