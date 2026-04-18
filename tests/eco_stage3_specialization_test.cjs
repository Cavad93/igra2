/**
 * tests/eco_stage3_specialization_test.cjs
 *
 * Этап 3 (docs/economic2.md) — специализация региона.
 * Node-stub тест: подгружает engine/economy_ext.js в контекст с минимальным
 * GAME_STATE, проверяет updateRegionSpecialization() и getRegionSpecBonus().
 *
 * Запуск: node tests/eco_stage3_specialization_test.cjs
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
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }

// ── Подготовить минимальное окружение и загрузить economy_ext.js ──────
// Файл — ES-модуль (import/export). vm не поддерживает ESM, поэтому
// стрипаем их так же, как tests/audit/ai_*_test.cjs делает с engine/ai/*.
const srcRaw = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy_ext.js'),
  'utf8',
);
const src = srcRaw
  .replace(/^import\s+[^;]*;?\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?/gm, '')
  // `export const X = …` → `var X = …` чтобы биндинг попал на глобал vm-контекста.
  // `const` на top-level vm.runInContext не виден через sandbox, `var` — виден.
  .replace(/^export\s+const\s+/gm, 'var ')
  .replace(/^export\s+(default\s+)?/gm, '');

const sandbox = {
  console,
  GAME_STATE: null,
  STRATEGIC_GOODS: ['iron', 'horses', 'salt', 'timber'],
  // addEventLog stub — чтобы addEconomicEvent не падал.
  addEventLog: () => {},
  // Stubs для ESM-импортов (CONFIG, GOODS) — их imports стрипнулись выше.
  CONFIG: {},
  GOODS:  {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'engine/economy_ext.js' });

const {
  initEconomyExt,
  updateRegionSpecialization,
  getRegionSpecBonus,
  SPEC_STREAK_WINDOW,
  SPEC_STEP_BONUS,
  SPEC_MAX_BONUS,
} = sandbox;

// ── Helpers ───────────────────────────────────────────────────────────
function freshState() {
  sandbox.GAME_STATE = {
    turn: 0,
    nations: {},
    regions: {
      r1: { _production_last_tick: {} },
      r2: { _production_last_tick: {} },
    },
    market: {},
  };
  initEconomyExt();
}

function tick(rid, prodMap) {
  sandbox.GAME_STATE.regions[rid]._production_last_tick = Object.assign({}, prodMap);
}

function runN(n, rid, prodMap) {
  for (let i = 0; i < n; i++) {
    tick(rid, prodMap);
    updateRegionSpecialization();
  }
}

// ═════ TEST 1: init ═════
console.log('\n=== TEST 1: initEconomyExt создаёт region_specialization ===');
freshState();
assert(
  typeof sandbox.GAME_STATE.economy_ext.region_specialization === 'object' &&
    sandbox.GAME_STATE.economy_ext.region_specialization !== null,
  'region_specialization — объект',
);
assert(
  Object.keys(sandbox.GAME_STATE.economy_ext.region_specialization).length === 0,
  'region_specialization пуст при инициализации',
);

// ═════ TEST 2: первый тик создаёт запись со streak=1, bonus=1.0 ═════
console.log('\n=== TEST 2: первый тик создаёт запись специализации ===');
freshState();
tick('r1', { wheat: 100, barley: 20 });
updateRegionSpecialization();
const e2 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e2 && e2.good === 'wheat', 'топ-товар определён (wheat)');
assert(e2.streak === 1, 'streak=1 после первого тика');
assert(approx(e2.bonus, 1.0), 'bonus=1.0 в начале streak');

// ═════ TEST 3: после 10 ходов bonus = 1.05 ═════
console.log('\n=== TEST 3: streak=10 → bonus=1.05 ===');
freshState();
runN(10, 'r1', { wheat: 100, barley: 20 });
const e3 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e3.streak === 10, 'streak=10');
assert(approx(e3.bonus, 1.05, 1e-9), 'bonus=1.05');

// ═════ TEST 4: после 20 ходов bonus = 1.10 ═════
console.log('\n=== TEST 4: streak=20 → bonus=1.10 ===');
freshState();
runN(20, 'r1', { wheat: 100 });
const e4 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e4.streak === 20, 'streak=20');
assert(approx(e4.bonus, 1.10, 1e-9), 'bonus=1.10');

// ═════ TEST 5: 50 ходов → bonus capped at 1.25 ═════
console.log('\n=== TEST 5: streak=50 → bonus=1.25 (потолок) ===');
freshState();
runN(50, 'r1', { wheat: 100 });
const e5 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e5.streak === 50, 'streak=50');
assert(approx(e5.bonus, 1.25, 1e-9), 'bonus=1.25 (макс)');

// ═════ TEST 6: 100 ходов → bonus всё ещё 1.25 ═════
console.log('\n=== TEST 6: streak=100 → bonus=1.25 (не превышает потолок) ===');
freshState();
runN(100, 'r1', { wheat: 100 });
const e6 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e6.streak === 100, 'streak=100');
assert(approx(e6.bonus, 1.25, 1e-9), 'bonus не превышает SPEC_MAX_BONUS');

// ═════ TEST 7: смена топ-товара → streak сбрасывается, bonus → 1.0 ═════
console.log('\n=== TEST 7: смена топ-товара сбрасывает streak ===');
freshState();
runN(25, 'r1', { wheat: 100 }); // streak=25, bonus=1.10
const before7 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(approx(before7.bonus, 1.10, 1e-9), 'перед сменой bonus=1.10');
tick('r1', { iron: 200, wheat: 50 });
updateRegionSpecialization();
const e7 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e7.good === 'iron', 'новый топ — iron');
assert(e7.streak === 1, 'streak сброшен в 1');
assert(approx(e7.bonus, 1.0), 'bonus=1.0 после смены');

// ═════ TEST 8: дефицит (нет производства) → запись удаляется ═════
console.log('\n=== TEST 8: дефицит удаляет запись специализации ===');
freshState();
runN(15, 'r1', { wheat: 100 }); // streak=15, bonus=1.05
assert(
  sandbox.GAME_STATE.economy_ext.region_specialization.r1 !== undefined,
  'запись существует до дефицита',
);
tick('r1', {}); // пустая продукция = дефицит
updateRegionSpecialization();
assert(
  sandbox.GAME_STATE.economy_ext.region_specialization.r1 === undefined,
  'запись удалена после дефицита',
);

// ═════ TEST 9: дефицит с численным шумом (< EPS) тоже сбрасывает ═════
console.log('\n=== TEST 9: производство < EPS считается дефицитом ===');
freshState();
runN(12, 'r1', { wheat: 100 });
tick('r1', { wheat: 0.001 }); // ниже SPEC_EPS=0.01
updateRegionSpecialization();
assert(
  sandbox.GAME_STATE.economy_ext.region_specialization.r1 === undefined,
  'шумовое производство не поддерживает streak',
);

// ═════ TEST 10: getRegionSpecBonus() ═════
console.log('\n=== TEST 10: getRegionSpecBonus возвращает правильные значения ===');
freshState();
runN(30, 'r1', { wheat: 100 });
assert(
  approx(getRegionSpecBonus('r1', 'wheat'), 1.15, 1e-9),
  'bonus для специализированного товара = 1.15',
);
assert(
  getRegionSpecBonus('r1', 'iron') === 1.0,
  'bonus для неспециализированного товара = 1.0',
);
assert(
  getRegionSpecBonus('unknown', 'wheat') === 1.0,
  'bonus для несуществующего региона = 1.0',
);

// ═════ TEST 11: несколько регионов независимы ═════
console.log('\n=== TEST 11: регионы независимы ===');
freshState();
for (let i = 0; i < 10; i++) {
  tick('r1', { wheat: 100 });
  tick('r2', { iron:  50  });
  updateRegionSpecialization();
}
const r1e = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
const r2e = sandbox.GAME_STATE.economy_ext.region_specialization.r2;
assert(r1e.good === 'wheat' && approx(r1e.bonus, 1.05), 'r1 → wheat +5%');
assert(r2e.good === 'iron'  && approx(r2e.bonus, 1.05), 'r2 → iron  +5%');

// ═════ TEST 12: восстановление после дефицита начинается заново ═════
console.log('\n=== TEST 12: восстановление после дефицита начинается с streak=1 ===');
freshState();
runN(20, 'r1', { wheat: 100 });  // bonus=1.10
tick('r1', {});                   // дефицит — запись удалена
updateRegionSpecialization();
tick('r1', { wheat: 100 });       // возобновление
updateRegionSpecialization();
const e12 = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(e12 && e12.streak === 1 && approx(e12.bonus, 1.0), 'streak начинается с 1');

// ═════ TEST 13: константы и функции экспортированы ═════
console.log('\n=== TEST 13: экспорт в window ===');
assert(typeof sandbox.updateRegionSpecialization === 'function', 'updateRegionSpecialization в window');
assert(typeof sandbox.getRegionSpecBonus === 'function', 'getRegionSpecBonus в window');
assert(sandbox.SPEC_STREAK_WINDOW === 10, 'SPEC_STREAK_WINDOW = 10');
assert(approx(sandbox.SPEC_STEP_BONUS, 0.05), 'SPEC_STEP_BONUS = 0.05');
assert(approx(sandbox.SPEC_MAX_BONUS, 0.25), 'SPEC_MAX_BONUS = 0.25');

// ═════ TEST 14: runEconomyExtTick() не падает и вызывает spec update ═════
console.log('\n=== TEST 14: runEconomyExtTick выполняет updateRegionSpecialization ===');
freshState();
sandbox.GAME_STATE.regions.r1._production_last_tick = { wheat: 100 };
sandbox.GAME_STATE.regions.r2._production_last_tick = { iron: 50 };
let crashed = false;
try { sandbox.runEconomyExtTick(); } catch (e) { crashed = true; console.error(e); }
assert(!crashed, 'runEconomyExtTick() не упал');
assert(
  sandbox.GAME_STATE.economy_ext.region_specialization.r1?.good === 'wheat',
  'после runEconomyExtTick() спец r1 заполнена',
);

// ─── Итог ────────────────────────────────────────────────────────────
console.log(`\n──── Итог: ${passed} passed, ${failed} failed ────`);
if (failed > 0) process.exit(1);
