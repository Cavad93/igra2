/**
 * tests/eco_stage6_army_funding_test.cjs
 *
 * Этап 6 (docs/economic2.md) — усталость армии от недофинансирования.
 * Node-stub: подгружает engine/economy_ext.js в vm-контексте,
 * проверяет calcNormalArmyExpense / getArmyFundingRatio /
 * getArmyCombatMult / updateArmyFunding и интеграцию с
 * engine/battle.js → calculateMilitaryStrength.
 *
 * Запуск: node tests/eco_stage6_army_funding_test.cjs
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
function approx(a, b, eps = 1e-3) { return Math.abs(a - b) < eps; }

const srcExt = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy_ext.js'),
  'utf8',
);

const CONFIG = {
  BALANCE: {
    INFANTRY_UPKEEP:  2,
    CAVALRY_UPKEEP:   4,
    MERCENARY_UPKEEP: 3,
  },
};

const sandbox = {
  console,
  GAME_STATE: null,
  STRATEGIC_GOODS: ['iron', 'horses', 'salt', 'timber'],
  CONFIG,
  addEventLog: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(srcExt, sandbox, { filename: 'engine/economy_ext.js' });

const {
  initEconomyExt,
  calcNormalArmyExpense,
  getArmyFundingRatio,
  getArmyCombatMult,
  updateArmyFunding,
  runEconomyExtTick,
  ARMY_UNDERFUND_THRESHOLD,
  ARMY_UNDERFUND_PENALTY,
} = sandbox;

// Сборка GAME_STATE с одной нацией и заданным составом армии.
function freshState({
  infantry = 1000,
  cavalry  = 200,
  mercenaries = 100,
  armyLvl  = 1.0,           // expense_levels.army
  fillBreakdown = true,     // имитировать updateTreasury()
  actualPaidMult = null,    // если != null, подменяет фактические выплаты
} = {}) {
  const infUp  = CONFIG.BALANCE.INFANTRY_UPKEEP;
  const cavUp  = CONFIG.BALANCE.CAVALRY_UPKEEP;
  const mercUp = CONFIG.BALANCE.MERCENARY_UPKEEP;
  const base =
    infantry    * infUp +
    cavalry     * cavUp +
    mercenaries * mercUp;

  const mult = actualPaidMult != null ? actualPaidMult : armyLvl;
  const effInf  = Math.round(infantry    * infUp  * mult);
  const effCav  = Math.round(cavalry     * cavUp  * mult);
  const effMerc = Math.round(mercenaries * mercUp * mult);

  sandbox.GAME_STATE = {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        regions: [],
        military: { infantry, cavalry, mercenaries, morale: 50, ships: 0 },
        government: { ruler: { personal_power: 50 } },
        economy: {
          treasury: 10000,
          income_per_turn: 1000,
          expense_levels: { army: armyLvl },
          _expense_breakdown: fillBreakdown ? {
            army_infantry:    effInf,
            army_cavalry:     effCav,
            army_mercenaries: effMerc,
            army_base:        base,
            army_level:       armyLvl,
          } : {},
        },
      },
    },
    regions: {},
    market: {},
  };
  initEconomyExt();
}

// ══════════════════════════════════════════════════════════════
// TEST 1: init + экспорт + константы
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: инициализация и экспорт ===');
freshState();
assert(typeof calcNormalArmyExpense === 'function', 'calcNormalArmyExpense экспортирован');
assert(typeof getArmyFundingRatio === 'function',   'getArmyFundingRatio экспортирован');
assert(typeof getArmyCombatMult === 'function',     'getArmyCombatMult экспортирован');
assert(typeof updateArmyFunding === 'function',     'updateArmyFunding экспортирован');
assert(ARMY_UNDERFUND_THRESHOLD === 0.80, 'ARMY_UNDERFUND_THRESHOLD === 0.80');
assert(ARMY_UNDERFUND_PENALTY === 0.85,   'ARMY_UNDERFUND_PENALTY === 0.85');

// ══════════════════════════════════════════════════════════════
// TEST 2: calcNormalArmyExpense из breakdown и fallback
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: calcNormalArmyExpense ===');
freshState({ infantry: 1000, cavalry: 200, mercenaries: 100 });
// 1000*2 + 200*4 + 100*3 = 2000 + 800 + 300 = 3100
assert(calcNormalArmyExpense('rome') === 3100, 'из breakdown (1000/200/100) = 3100');

freshState({ infantry: 500, cavalry: 0, mercenaries: 0, fillBreakdown: false });
assert(calcNormalArmyExpense('rome') === 1000, 'fallback без breakdown (500 inf) = 1000');

assert(calcNormalArmyExpense('unknown') === 0, 'для неизвестной нации — 0');

// ══════════════════════════════════════════════════════════════
// TEST 3: ratio = 1.0 при полном финансировании
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: полное финансирование ===');
freshState({ armyLvl: 1.0 });
const r1 = getArmyFundingRatio('rome');
assert(approx(r1, 1.0), `ratio при lvl=1.0 ≈ 1.0 (got ${r1})`);
assert(getArmyCombatMult('rome') === 1.0, 'mult при ratio=1.0 === 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 4: частичное финансирование — ratio = lvl
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: expense_levels.army = 0.5 ===');
freshState({ armyLvl: 0.5 });
const r05 = getArmyFundingRatio('rome');
// Допускаем погрешность округления (Math.round в eff*).
assert(approx(r05, 0.5, 0.01), `ratio при lvl=0.5 ≈ 0.5 (got ${r05})`);
assert(r05 < ARMY_UNDERFUND_THRESHOLD, 'ratio < 0.80 → штраф активен');
const m05 = getArmyCombatMult('rome');
// При ratio=0.5, t=0.5/0.8=0.625, mult=0.85+0.15*0.625=0.94375
assert(approx(m05, 0.94375, 0.01), `mult при ratio=0.5 ≈ 0.944 (got ${m05})`);

// ══════════════════════════════════════════════════════════════
// TEST 5: ratio = 0 → максимальный штраф
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: финансирование полностью снято (ratio=0) ===');
freshState({ armyLvl: 1.0, actualPaidMult: 0 });
const r0 = getArmyFundingRatio('rome');
assert(approx(r0, 0, 0.001), `ratio ≈ 0 (got ${r0})`);
const m0 = getArmyCombatMult('rome');
assert(approx(m0, ARMY_UNDERFUND_PENALTY, 0.001), `mult ≈ 0.85 (got ${m0})`);

// ══════════════════════════════════════════════════════════════
// TEST 6: ratio = 0.80 (точно порог) — штрафа нет
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: порог 0.80 ===');
freshState({ armyLvl: 0.80 });
const r08 = getArmyFundingRatio('rome');
assert(approx(r08, 0.80, 0.01), `ratio ≈ 0.80 (got ${r08})`);
assert(getArmyCombatMult('rome') === 1.0, 'на пороге 0.80 mult === 1.0');

// ══════════════════════════════════════════════════════════════
// TEST 7: ratio > 0.80 (0.90) — штрафа нет
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: финансирование выше нормы (lvl=1.20) ===');
freshState({ armyLvl: 1.20 });
const r12 = getArmyFundingRatio('rome');
assert(approx(r12, 1.0, 0.001), `ratio capped в 1.0 (got ${r12})`);
assert(getArmyCombatMult('rome') === 1.0, 'mult === 1.0 при overspend');

// ══════════════════════════════════════════════════════════════
// TEST 8: нация без армии — ratio = 1.0, нет штрафа
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: нет армии ===');
freshState({ infantry: 0, cavalry: 0, mercenaries: 0, fillBreakdown: false });
assert(getArmyFundingRatio('rome') === 1.0, 'ratio=1.0 без армии');
assert(getArmyCombatMult('rome') === 1.0, 'mult=1.0 без армии');

// ══════════════════════════════════════════════════════════════
// TEST 9: неизвестная нация
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: неизвестная нация ===');
freshState();
assert(getArmyFundingRatio('unknown_nation') === 1.0, 'ratio=1.0 для unknown');
assert(getArmyCombatMult('unknown_nation') === 1.0,   'mult=1.0 для unknown');

// ══════════════════════════════════════════════════════════════
// TEST 10: updateArmyFunding кеширует в _army_funding
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: updateArmyFunding() кеш ===');
freshState({ armyLvl: 0.5 });
updateArmyFunding();
const cache = sandbox.GAME_STATE.nations.rome.economy._army_funding;
assert(cache && typeof cache === 'object', '_army_funding создан');
assert(approx(cache.ratio, 0.5, 0.01), `cache.ratio ≈ 0.5 (got ${cache?.ratio})`);
assert(approx(cache.mult, 0.94375, 0.01), `cache.mult ≈ 0.944 (got ${cache?.mult})`);

freshState({ armyLvl: 1.0 });
updateArmyFunding();
const cacheFull = sandbox.GAME_STATE.nations.rome.economy._army_funding;
assert(approx(cacheFull.ratio, 1.0, 0.01), 'cache.ratio ≈ 1.0 при полном финансировании');
assert(cacheFull.mult === 1.0, 'cache.mult === 1.0 при полном финансировании');

// ══════════════════════════════════════════════════════════════
// TEST 11: runEconomyExtTick() не падает и вызывает updateArmyFunding
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 11: интеграция в runEconomyExtTick ===');
freshState({ armyLvl: 0.3 });
let threw = false;
try { runEconomyExtTick(); } catch (e) { threw = true; console.error(e); }
assert(!threw, 'runEconomyExtTick() не падает');
const afterTick = sandbox.GAME_STATE.nations.rome.economy._army_funding;
assert(afterTick && afterTick.ratio < 0.80, 'после тика _army_funding.ratio обновлён');

// ══════════════════════════════════════════════════════════════
// TEST 12: интеграция с calculateMilitaryStrength()
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 12: calculateMilitaryStrength использует штраф ===');
// Загружаем battle.js в тот же sandbox со стабами.
sandbox.BATTLE = {
  INF_MULT: 1, CAV_MULT: 2, MERC_MULT: 1.5,
  MORALE_MULT: 0, PP_MULT: 0,
  GARRISON_MULT: 0, SIEGE_GARRISON_MULT: 0,
  SIEGE_WALL_BONUS: 1, DEFENDER_BONUS: 1,
  TERRAIN_ATTACK_MULT: { plains: 1 },
  TERRAIN_CAVALRY_MULT: { plains: 1 },
  CASUALTY_MIN: 0, CASUALTY_MAX: 0,
  INF_CASUALTY_SHARE: 0, CAV_CASUALTY_SHARE: 0,
  CAPTURE_THRESHOLD: 10,
  WINNER_MORALE_GAIN: 0, LOSER_MORALE_LOSS: 0,
  LOSER_STABILITY_LOSS: 0, FAILED_ATK_MORALE_LOSS: 0, FAILED_ATK_STABILITY_LOSS: 0,
  WAR_RELATION_DROP: 0,
};
sandbox.getCultureBonus = () => 0;

// Выдёргиваем только calculateMilitaryStrength из battle.js:
const battleSrc = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'battle.js'),
  'utf8',
);
// Ищем границы функции и исполняем в sandbox.
const fnStart = battleSrc.indexOf('function calculateMilitaryStrength');
const fnEndMarker = '\n}\n';
const fnEnd = battleSrc.indexOf(fnEndMarker, fnStart);
const fnSrc = battleSrc.slice(fnStart, fnEnd + fnEndMarker.length);
vm.runInContext(fnSrc, sandbox, { filename: 'engine/battle.js#calculateMilitaryStrength' });

freshState({ armyLvl: 1.0 });
const nationFull = sandbox.GAME_STATE.nations.rome;
const strFull = sandbox.calculateMilitaryStrength(nationFull, { nationId: 'rome', terrain: 'plains' });

freshState({ armyLvl: 0 });
const nationZero = sandbox.GAME_STATE.nations.rome;
const strZero = sandbox.calculateMilitaryStrength(nationZero, { nationId: 'rome', terrain: 'plains' });

// Состав армии одинаковый, отличается только ratio → strZero = strFull * 0.85
assert(strFull > strZero, `полное финансирование даёт больше силы (${strFull.toFixed(1)} > ${strZero.toFixed(1)})`);
const expectedRatio = 0.85;
const actualRatio = strZero / strFull;
assert(approx(actualRatio, expectedRatio, 0.01),
  `ratio силы при ratio=0 ≈ 0.85 (got ${actualRatio.toFixed(3)})`);

// ══════════════════════════════════════════════════════════════
console.log(`\n=== РЕЗУЛЬТАТ: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
