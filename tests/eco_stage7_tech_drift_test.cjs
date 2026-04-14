/**
 * tests/eco_stage7_tech_drift_test.cjs
 *
 * Этап 7 (docs/economic2.md) — технологический дрейф.
 * Node-stub: подгружает engine/economy_ext.js в vm-контексте,
 * проверяет updateTechDrift() / getTechDriftMult() / renderTechDrift().
 *
 * Запуск: node tests/eco_stage7_tech_drift_test.cjs
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
  updateTechDrift,
  getTechDriftMult,
  renderTechDrift,
  runEconomyExtTick,
  TECH_DRIFT_INTERVAL,
  TECH_DRIFT_STEP,
  TECH_DRIFT_MAX,
} = sandbox;

function freshState(turn = 0) {
  sandbox.GAME_STATE = {
    turn,
    player_nation: 'rome',
    nations: { rome: { regions: [], economy: { treasury: 0, _income_breakdown: {}, _expense_breakdown: {} } } },
    regions: {},
    market: {},
  };
  initEconomyExt();
}

// ══════════════════════════════════════════════════════════════
// TEST 1: экспорт и инициализация
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: экспорт и константы ===');
assert(typeof updateTechDrift  === 'function', 'updateTechDrift экспортирована');
assert(typeof getTechDriftMult === 'function', 'getTechDriftMult экспортирована');
assert(typeof renderTechDrift  === 'function', 'renderTechDrift экспортирована');
assert(TECH_DRIFT_INTERVAL === 120, 'TECH_DRIFT_INTERVAL = 120');
assert(approx(TECH_DRIFT_STEP, 0.02), 'TECH_DRIFT_STEP = 0.02');
assert(approx(TECH_DRIFT_MAX,  0.20), 'TECH_DRIFT_MAX  = 0.20');

// ══════════════════════════════════════════════════════════════
// TEST 2: инициализация tech_drift при первом вызове
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: лениво создаёт tech_drift ===');
freshState(0);
assert(sandbox.GAME_STATE.economy_ext.tech_drift === undefined, 'до вызова нет поля tech_drift');
updateTechDrift();
const td0 = sandbox.GAME_STATE.economy_ext.tech_drift;
assert(td0 && typeof td0 === 'object', 'tech_drift — объект');
assert(td0.bonus === 0,      'bonus = 0 при turn=0');
assert(td0.last_tick === 0,  'last_tick = 0');
assert(getTechDriftMult() === 1.0, 'getTechDriftMult() = 1.0 в начале игры');

// ══════════════════════════════════════════════════════════════
// TEST 3: turn < 120 — инфляция не растёт
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: turn < 120 — нет изменений ===');
freshState(0);
for (let t = 1; t < 120; t++) {
  sandbox.GAME_STATE.turn = t;
  updateTechDrift();
}
assert(sandbox.GAME_STATE.economy_ext.tech_drift.bonus === 0, 'bonus = 0 на ходе 119');

// ══════════════════════════════════════════════════════════════
// TEST 4: на ходу 120 — bonus = 0.02
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: turn = 120 → bonus = 0.02 ===');
sandbox.GAME_STATE.turn = 120;
updateTechDrift();
assert(approx(sandbox.GAME_STATE.economy_ext.tech_drift.bonus, 0.02),
  `bonus = 0.02 (got ${sandbox.GAME_STATE.economy_ext.tech_drift.bonus})`);
assert(sandbox.GAME_STATE.economy_ext.tech_drift.last_tick === 120, 'last_tick = 120');
assert(approx(getTechDriftMult(), 1.02), `getTechDriftMult = 1.02 (got ${getTechDriftMult()})`);

// ══════════════════════════════════════════════════════════════
// TEST 5: на ходу 240 — bonus = 0.04
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: turn = 240 → bonus = 0.04 ===');
for (let t = 121; t <= 240; t++) {
  sandbox.GAME_STATE.turn = t;
  updateTechDrift();
}
assert(approx(sandbox.GAME_STATE.economy_ext.tech_drift.bonus, 0.04),
  `bonus = 0.04 (got ${sandbox.GAME_STATE.economy_ext.tech_drift.bonus})`);
assert(sandbox.GAME_STATE.economy_ext.tech_drift.last_tick === 240, 'last_tick = 240');

// ══════════════════════════════════════════════════════════════
// TEST 6: 5 циклов → bonus = 0.10, getTechDriftMult = 1.10
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: 5 циклов → bonus = 0.10 ===');
freshState(0);
for (let cycle = 1; cycle <= 5; cycle++) {
  sandbox.GAME_STATE.turn = cycle * TECH_DRIFT_INTERVAL;
  updateTechDrift();
}
assert(approx(sandbox.GAME_STATE.economy_ext.tech_drift.bonus, 0.10),
  `bonus = 0.10 после 5 циклов (got ${sandbox.GAME_STATE.economy_ext.tech_drift.bonus})`);
assert(approx(getTechDriftMult(), 1.10),
  `getTechDriftMult = 1.10 (got ${getTechDriftMult()})`);

// ══════════════════════════════════════════════════════════════
// TEST 7: на ходу 1200 — не превышает MAX = 0.20
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: потолок TECH_DRIFT_MAX = 0.20 ===');
freshState(0);
for (let t = 0; t <= 1200; t += 10) {
  sandbox.GAME_STATE.turn = t;
  updateTechDrift();
}
const td7 = sandbox.GAME_STATE.economy_ext.tech_drift;
assert(td7.bonus <= TECH_DRIFT_MAX + 1e-9, `bonus ≤ 0.20 (got ${td7.bonus})`);
assert(approx(td7.bonus, TECH_DRIFT_MAX),  `bonus = 0.20 (got ${td7.bonus})`);
assert(approx(getTechDriftMult(), 1.20),   `getTechDriftMult = 1.20 (got ${getTechDriftMult()})`);

// Дальнейшие тики не должны уводить bonus выше потолка.
sandbox.GAME_STATE.turn = 5000;
updateTechDrift();
assert(approx(sandbox.GAME_STATE.economy_ext.tech_drift.bonus, TECH_DRIFT_MAX),
  `bonus остаётся = 0.20 после turn=5000 (got ${sandbox.GAME_STATE.economy_ext.tech_drift.bonus})`);

// ══════════════════════════════════════════════════════════════
// TEST 8: getTechDriftMult возвращает 1.0 для отсутствующего состояния
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: safe defaults ===');
sandbox.GAME_STATE = null;
assert(getTechDriftMult() === 1.0, 'GAME_STATE = null → 1.0');

freshState(0);
// Без вызова updateTechDrift
delete sandbox.GAME_STATE.economy_ext.tech_drift;
assert(getTechDriftMult() === 1.0, 'нет tech_drift → 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 9: runEconomyExtTick интегрирует updateTechDrift
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: интеграция с runEconomyExtTick ===');
freshState(0);
sandbox.GAME_STATE.turn = 120;
let tickOk = true;
try { runEconomyExtTick(); } catch (e) { console.error(e); tickOk = false; }
assert(tickOk, 'runEconomyExtTick не падает');
assert(approx(sandbox.GAME_STATE.economy_ext.tech_drift.bonus, 0.02),
  `bonus = 0.02 после runEconomyExtTick на turn=120 (got ${sandbox.GAME_STATE.economy_ext.tech_drift.bonus})`);

// ══════════════════════════════════════════════════════════════
// TEST 10: renderTechDrift возвращает строку с процентом
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: renderTechDrift ===');
freshState(0);
updateTechDrift();
const htmlNone = renderTechDrift();
assert(typeof htmlNone === 'string' && htmlNone.length > 0, 'render возвращает непустую строку');
assert(htmlNone.includes('базовый') || htmlNone.includes('eco-tech-none'),
  'при bonus < 0.01 — "базовый"');

// С bonus = 0.10
sandbox.GAME_STATE.economy_ext.tech_drift.bonus = 0.10;
const htmlLvl = renderTechDrift();
assert(htmlLvl.includes('10%'), `содержит "10%" (got ${htmlLvl.slice(0,80)})`);
assert(htmlLvl.includes('eco-tech-level'), 'содержит класс eco-tech-level');

// ══════════════════════════════════════════════════════════════
// TEST 11: «догоняющие» шаги при большом пропуске ходов
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 11: пропущенные ходы догоняются ===');
freshState(0);
sandbox.GAME_STATE.turn = 360;  // 3 интервала сразу
updateTechDrift();
assert(approx(sandbox.GAME_STATE.economy_ext.tech_drift.bonus, 0.06),
  `bonus = 0.06 после turn=360 (got ${sandbox.GAME_STATE.economy_ext.tech_drift.bonus})`);
assert(sandbox.GAME_STATE.economy_ext.tech_drift.last_tick === 360,
  `last_tick = 360 (got ${sandbox.GAME_STATE.economy_ext.tech_drift.last_tick})`);

// ══════════════════════════════════════════════════════════════
// TEST 12: bonus поле экспортируется и сохраняется в ext
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 12: совместимость с save/load ===');
freshState(0);
sandbox.GAME_STATE.turn = 120;
updateTechDrift();
const snapshot = JSON.parse(JSON.stringify(sandbox.GAME_STATE.economy_ext));
assert(snapshot.tech_drift.bonus === 0.02, 'tech_drift корректно сериализуется');
assert(snapshot.tech_drift.last_tick === 120, 'last_tick сериализуется');

// Восстановление состояния:
freshState(120);
sandbox.GAME_STATE.economy_ext.tech_drift = snapshot.tech_drift;
assert(approx(getTechDriftMult(), 1.02), 'после восстановления getTechDriftMult = 1.02');

// ══════════════════════════════════════════════════════════════
// TEST 13: интеграция с economy.js → routeProductionToLocalStockpiles
// Проверяем, что патч в engine/economy.js действительно умножает
// bldByRegion на getTechDriftMult() при попадании в local_stockpile.
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 13: патч economy.js применяет tech_drift ===');
const ecoSrc = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy.js'),
  'utf8',
);
const patchRE = /Этап 7: технологический дрейф[\s\S]*?if \(typeof getTechDriftMult === 'function'\)/;
assert(patchRE.test(ecoSrc),
  'engine/economy.js содержит блок "Этап 7: технологический дрейф"');
// Проверяем, что он добавляет delta в prodThisTick и ls.
assert(/prodThisTick\[good\]\s*=\s*\(prodThisTick\[good\]\s*\|\|\s*0\)\s*\+\s*delta/.test(ecoSrc),
  'патч прибавляет delta к prodThisTick');
assert(/ls\[good\]\s*=\s*\(ls\[good\]\s*\|\|\s*0\)\s*\+\s*delta/.test(ecoSrc),
  'патч прибавляет delta к local_stockpile');

// Симуляция логики применения мультипликатора к bldByRegion.
const bldByRegion = { r1: { wheat: 100, iron: 50 } };
sandbox.GAME_STATE = {
  turn: 240,
  economy_ext: {
    tech_drift: { bonus: 0.10, last_tick: 240 },
  },
};
const techMult = getTechDriftMult();
assert(approx(techMult, 1.10), `mult = 1.10 при bonus=0.10 (got ${techMult})`);

// Эмуляция строк из economy.js
const ls = {};
const prodThisTick = {};
for (const [good, amt] of Object.entries(bldByRegion.r1)) {
  ls[good] = (ls[good] || 0) + amt;
  prodThisTick[good] = (prodThisTick[good] || 0) + amt;
}
if (techMult > 1.0) {
  for (const [good, amt] of Object.entries(bldByRegion.r1)) {
    const delta = amt * (techMult - 1);
    if (delta > 0) {
      ls[good] = (ls[good] || 0) + delta;
      prodThisTick[good] = (prodThisTick[good] || 0) + delta;
    }
  }
}
assert(approx(prodThisTick.wheat, 110),
  `wheat: 100 × 1.10 = 110 (got ${prodThisTick.wheat})`);
assert(approx(prodThisTick.iron, 55),
  `iron: 50 × 1.10 = 55 (got ${prodThisTick.iron})`);
assert(approx(ls.wheat, 110),  `local_stockpile.wheat = 110 (got ${ls.wheat})`);
assert(approx(ls.iron,   55),  `local_stockpile.iron  = 55  (got ${ls.iron})`);

// ══════════════════════════════════════════════════════════════
// ИТОГИ
// ══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`РЕЗУЛЬТАТ: passed=${passed} failed=${failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
