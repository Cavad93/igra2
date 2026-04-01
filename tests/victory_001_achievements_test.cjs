'use strict';
// ── VICTORY 001: Unit tests — achievements engine ─────────────────────
// Запуск: node tests/victory_001_achievements_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ─── Stub DOM (no browser) ───────────────────────────────────────────
const domStub = {
  getElementById: () => null,
  createElement:  () => ({ style: {}, innerHTML: '', remove: () => {}, appendChild: () => {} }),
  body: { appendChild: () => {} },
};

function makeCtx(overrides = {}) {
  const GS = {
    turn: 5,
    player_nation: 'sparta',
    nations: {
      sparta: {
        _id: 'sparta',
        name: 'Спарта',
        economy:    { treasury: 500, income_per_turn: 200, tax_rate: 0.10, stockpile: {} },
        military:   { infantry: 1000, cavalry: 100, ships: 5, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
        population: { total: 50000, happiness: 60, by_profession: {} },
        government: { type: 'tyranny', stability: 50, legitimacy: 60, ruler: { name: 'Леонид', age: 40 } },
        regions:    ['r1', 'r2'],
        relations:  {},
        active_laws: [],
        buildings:  [],
      },
    },
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    ...overrides,
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx;
}

// ─── TEST 1: checkAchievements инициализирует storage ───────────────
{
  const ctx = makeCtx();
  ctx.checkAchievements('sparta');
  ok('achievements[sparta] создан', typeof ctx.GAME_STATE.achievements.sparta === 'object');
}

// ─── TEST 2: getAchievements возвращает пустой массив в начале ───────
{
  const ctx = makeCtx();
  const res = ctx.getAchievements('sparta');
  ok('getAchievements() возвращает массив', Array.isArray(res));
}

// ─── TEST 3: getAchievementCount = 0 в начале ────────────────────────
{
  const ctx = makeCtx();
  ctx.checkAchievements('sparta');
  ok('getAchievementCount = 0 в начале', ctx.getAchievementCount('sparta') === 0);
}

// ─── TEST 4: treasurer разблокируется при казне >= 100 000 ───────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta.economy.treasury = 100000;
  ctx.checkAchievements('sparta');
  const a = ctx.GAME_STATE.achievements.sparta;
  ok('treasurer разблокирован', !!a.treasurer);
}

// ─── TEST 5: first_blood при n._battles_won >= 1 ─────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta._battles_won = 1;
  ctx.checkAchievements('sparta');
  ok('first_blood разблокирован', !!ctx.GAME_STATE.achievements.sparta.first_blood);
}

// ─── TEST 6: war_machine при 10 битвах ───────────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta._battles_won = 10;
  ctx.checkAchievements('sparta');
  ok('war_machine разблокирован', !!ctx.GAME_STATE.achievements.sparta.war_machine);
}

// ─── TEST 7: centurion при turn >= 100 ───────────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 100;
  ctx.checkAchievements('sparta');
  ok('centurion разблокирован при turn=100', !!ctx.GAME_STATE.achievements.sparta.centurion);
}

// ─── TEST 8: hegemon при regions.length >= 20 ────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta.regions = Array.from({length: 20}, (_, i) => `r${i}`);
  ctx.checkAchievements('sparta');
  ok('hegemon разблокирован при 20 регионах', !!ctx.GAME_STATE.achievements.sparta.hegemon);
}

// ─── TEST 9: populist при happiness >= 85 ───────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta.population.happiness = 85;
  ctx.checkAchievements('sparta');
  ok('populist при happiness=85', !!ctx.GAME_STATE.achievements.sparta.populist);
}

// ─── TEST 10: peacemaker при 30+ ходов без войн ─────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 50;
  ctx.GAME_STATE.nations.sparta._last_war_turn = 0;
  ctx.checkAchievements('sparta');
  ok('peacemaker при 30+ ходов без войн', !!ctx.GAME_STATE.achievements.sparta.peacemaker);
}

// ─── TEST 11: tyrant при stability < 20 и power > 10 ────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta.government.stability = 15;
  ctx.GAME_STATE.nations.sparta._turns_in_power = 15;
  ctx.checkAchievements('sparta');
  ok('tyrant при stability<20 + 15 ходов', !!ctx.GAME_STATE.achievements.sparta.tyrant);
}

// ─── TEST 12: bankrupt при _bankruptcies >= 1 ────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta._bankruptcies = 1;
  ctx.checkAchievements('sparta');
  ok('bankrupt разблокирован', !!ctx.GAME_STATE.achievements.sparta.bankrupt);
}

// ─── TEST 13: populous при population.total >= 1 000 000 ─────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta.population.total = 1000000;
  ctx.checkAchievements('sparta');
  ok('populous при 1М населения', !!ctx.GAME_STATE.achievements.sparta.populous);
}

// ─── TEST 14: legend при 10+ достижениях ─────────────────────────────
{
  const ctx = makeCtx();
  const n = ctx.GAME_STATE.nations.sparta;
  n.economy.treasury       = 100000;
  n._battles_won           = 10;
  n._bankruptcies          = 1;
  n.regions                = Array.from({length: 20}, (_, i) => `r${i}`);
  n.population.happiness   = 85;
  n.population.total       = 1000000;
  n.government.stability   = 15;
  n._turns_in_power        = 15;
  n._last_war_turn         = 0;
  ctx.GAME_STATE.turn      = 200;
  ctx.checkAchievements('sparta');
  ctx.checkAchievements('sparta'); // второй проход для legend
  ok('legend при 10+ достижениях', !!ctx.GAME_STATE.achievements.sparta.legend);
}

// ─── TEST 15: достижение не дублируется ──────────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta.economy.treasury = 100000;
  ctx.checkAchievements('sparta');
  ctx.checkAchievements('sparta');
  const count = Object.keys(ctx.GAME_STATE.achievements.sparta).length;
  ok('достижение не добавляется дважды', count === ctx.getAchievementCount('sparta'));
}

// ─── TEST 16: calcGrandeur возвращает число 0-1000 ────────────────────
{
  const ctx = makeCtx();
  const g = ctx.calcGrandeur('sparta');
  ok('calcGrandeur возвращает число', typeof g === 'number');
  ok('calcGrandeur в диапазоне [0, 1000]', g >= 0 && g <= 1000);
}

// ─── TEST 17: calcGrandeur возрастает с богатством ────────────────────
{
  const ctx1 = makeCtx();
  const ctx2 = makeCtx();
  ctx2.GAME_STATE.nations.sparta.economy.treasury = 100000;
  ok('calcGrandeur растёт с казной',
    ctx2.calcGrandeur('sparta') > ctx1.calcGrandeur('sparta'));
}

// ─── TEST 18: checkAchievements не падает на пустом state ────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE = null;
  let threw = false;
  try { ctx.checkAchievements('sparta'); } catch (e) { threw = true; }
  ok('checkAchievements не падает при GS=null', !threw);
}

// ─── TEST 19: getAchievements на несуществующей нации ─────────────────
{
  const ctx = makeCtx();
  const res = ctx.getAchievements('nonexistent');
  ok('getAchievements([]) на несуществующей нации', Array.isArray(res) && res.length === 0);
}

// ─── TEST 20: iron_wall при _invasions_repelled >= 3 ─────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.sparta._invasions_repelled = 3;
  ctx.checkAchievements('sparta');
  ok('iron_wall при 3 отражённых вторжениях', !!ctx.GAME_STATE.achievements.sparta.iron_wall);
}

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
