/**
 * tests/eco_stage4_inflation_test.cjs
 *
 * Этап 4 (docs/economic2.md) — инфляция от переполненной казны.
 * Node-stub: подгружает engine/economy_ext.js в vm-контекст с минимальным
 * GAME_STATE и проверяет updateInflation() + getInflationMult().
 *
 * Запуск: node tests/eco_stage4_inflation_test.cjs
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
  updateInflation,
  getInflationMult,
  TREASURY_HOARD_RATIO,
  TREASURY_CRITICAL_RATIO,
  INFLATION_STEP,
  INFLATION_STEP_FAST,
  INFLATION_MAX,
} = sandbox;

function freshState(treasury, income) {
  sandbox.GAME_STATE = {
    turn: 0,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: {
          treasury: treasury,
          income_per_turn: income,
          _income_breakdown: { total: income },
        },
      },
      egypt: {
        economy: {
          treasury: 100,
          income_per_turn: 500,
          _income_breakdown: { total: 500 },
        },
      },
    },
    regions: {},
    market: {},
  };
  initEconomyExt();
}

// ══════════════════════════════════════════════════════════════
// TEST 1: init + константы
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: init + constants ===');
freshState(1000, 500);
assert(
  typeof sandbox.GAME_STATE.economy_ext.inflation === 'object' &&
  sandbox.GAME_STATE.economy_ext.inflation !== null,
  'initEconomyExt() создаёт inflation как объект',
);
assert(TREASURY_HOARD_RATIO === 3,  'TREASURY_HOARD_RATIO = 3');
assert(TREASURY_CRITICAL_RATIO === 6, 'TREASURY_CRITICAL_RATIO = 6');
assert(approx(INFLATION_STEP, 0.01),   'INFLATION_STEP = 0.01 (+1%/ход)');
assert(approx(INFLATION_STEP_FAST, 0.02), 'INFLATION_STEP_FAST = 0.02 (+2%/ход при ratio ≥ 6)');
assert(approx(INFLATION_MAX, 0.25),    'INFLATION_MAX = 0.25 (+25%)');
assert(typeof updateInflation === 'function', 'updateInflation() экспортирована');
assert(typeof getInflationMult === 'function', 'getInflationMult() экспортирована');

// ══════════════════════════════════════════════════════════════
// TEST 2: казна в норме → инфляция = 0
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: ratio < 3 — инфляция не растёт ===');
freshState(1000, 500);       // ratio = 2 < 3
for (let i = 0; i < 5; i++) updateInflation();
const infl2 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(infl2 === 0, 'инфляция = 0 при ratio 2 (≤ 3)');
assert(getInflationMult('rome') === 1.0, 'множитель = 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 3: переполненная казна → инфляция растёт +1%/ход
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: ratio = 4 (HOARD) — +1% за ход ===');
freshState(2000, 500);       // ratio = 4
updateInflation();
let infl3 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl3, 0.01), `после 1 тика инфляция = 0.01 (получено ${infl3})`);
updateInflation();
infl3 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl3, 0.02), `после 2 тиков инфляция = 0.02 (получено ${infl3})`);
assert(approx(getInflationMult('rome'), 1.02), 'множитель = 1.02');

// ══════════════════════════════════════════════════════════════
// TEST 4: критическая казна → +2%/ход
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: ratio ≥ 6 — ускоренная инфляция +2%/ход ===');
freshState(5000, 500);       // ratio = 10 >> 6
updateInflation();
let infl4 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl4, 0.02), `после 1 тика инфляция = 0.02 (получено ${infl4})`);
updateInflation();
infl4 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl4, 0.04), `после 2 тиков инфляция = 0.04 (получено ${infl4})`);

// ══════════════════════════════════════════════════════════════
// TEST 5: потолок INFLATION_MAX = 0.25
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: инфляция не превышает INFLATION_MAX ===');
freshState(100000, 500);     // ratio = 200 → fast path
for (let i = 0; i < 50; i++) updateInflation();
const infl5 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl5, INFLATION_MAX), `инфляция = ${INFLATION_MAX} (получено ${infl5})`);
assert(approx(getInflationMult('rome'), 1.25), 'множитель = 1.25');

// ══════════════════════════════════════════════════════════════
// TEST 6: рассасывание при нормализации казны
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: рассасывание инфляции при ratio < 3 ===');
freshState(2000, 500);       // ratio = 4 → инфляция растёт
for (let i = 0; i < 10; i++) updateInflation();
let infl6 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl6, 0.10), `после 10 тиков инфляция = 0.10 (получено ${infl6})`);

// Теперь казна нормализуется
sandbox.GAME_STATE.nations.rome.economy.treasury = 500;  // ratio = 1
for (let i = 0; i < 5; i++) updateInflation();
infl6 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl6, 0.05), `после 5 тиков снижения = 0.05 (получено ${infl6})`);

// До полного нуля — ещё 5 тиков.
for (let i = 0; i < 10; i++) updateInflation();
infl6 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(infl6 === 0, `после 15 тиков снижения = 0 (получено ${infl6})`);
assert(
  !('rome' in sandbox.GAME_STATE.economy_ext.inflation),
  'запись rome удалена из inflation когда достигнут ноль',
);

// ══════════════════════════════════════════════════════════════
// TEST 7: getInflationMult для нации без инфляции
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: getInflationMult для нетронутой нации ===');
freshState(100, 500);
updateInflation();
assert(getInflationMult('egypt') === 1.0, 'egypt без инфляции → множитель 1.0');
assert(getInflationMult('unknown') === 1.0, 'неизвестная нация → 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 8: independent inflation per nation
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: инфляции наций независимы ===');
freshState(2000, 500);       // rome: hoarding
sandbox.GAME_STATE.nations.egypt.economy.treasury = 10000;
sandbox.GAME_STATE.nations.egypt.economy.income_per_turn = 500;
sandbox.GAME_STATE.nations.egypt.economy._income_breakdown = { total: 500 };
for (let i = 0; i < 5; i++) updateInflation();
const inflRome  = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
const inflEgypt = sandbox.GAME_STATE.economy_ext.inflation.egypt || 0;
assert(approx(inflRome, 0.05),  `rome = 0.05 (slow path, получено ${inflRome})`);
assert(approx(inflEgypt, 0.10), `egypt = 0.10 (fast path, получено ${inflEgypt})`);

// ══════════════════════════════════════════════════════════════
// TEST 9: zero income не ломает расчёт
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: income_per_turn = 0 не ломает расчёт ===');
freshState(1000, 0);         // income = 0
// Начальная инфляция выставим руками, чтобы проверить рассасывание.
sandbox.GAME_STATE.economy_ext.inflation.rome = 0.10;
for (let i = 0; i < 3; i++) updateInflation();
const infl9 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
assert(approx(infl9, 0.07), `рассасывание даже при income=0 (получено ${infl9})`);

// ══════════════════════════════════════════════════════════════
// TEST 10: runEconomyExtTick вызывает updateInflation
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: runEconomyExtTick интегрирует updateInflation ===');
freshState(2000, 500);
// убеждаемся, что runEconomyExtTick не падает и поднимает инфляцию
try {
  sandbox.runEconomyExtTick();
  const infl10 = sandbox.GAME_STATE.economy_ext.inflation.rome || 0;
  assert(approx(infl10, 0.01), `runEconomyExtTick поднял инфляцию на +1% (получено ${infl10})`);
} catch (e) {
  assert(false, 'runEconomyExtTick упал: ' + e.message);
}

// ══════════════════════════════════════════════════════════════
console.log(`\n═════════════════════════════════════`);
console.log(`  Стап 4: ${passed} passed / ${failed} failed`);
console.log(`═════════════════════════════════════`);
process.exit(failed > 0 ? 1 : 0);
