'use strict';
// ── VICTORY 025: Grandeur formula edge cases & boundary values ──────────────
// Юнит-тесты для calcGrandeur: граничные значения каждого компонента,
// переполнение (Infinity/NaN), отрицательные числа, верхние колпаки (caps).
// Запуск: node tests/victory_025_grandeur_edge_cases_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

const domStub = {
  getElementById: () => null,
  createElement: () => ({ id:'', className:'', innerHTML:'', style:{}, remove(){}, appendChild(){} }),
  body: { appendChild(){} },
};

function load(GS) {
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  return ctx;
}

function makeNation(overrides = {}) {
  return {
    economy: { treasury: 0, income_per_turn: 0 },
    military: { infantry: 0, cavalry: 0, ships: 0, at_war_with: [] },
    government: { stability: 0, legitimacy: 50 },
    population: { total: 100000, happiness: 0 },
    regions: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 1: Нулевое состояние');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'rome', nations: { rome: makeNation() }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  const g = ctx.calcGrandeur('rome');
  ok('нулевое состояние → grandeur >= 0', g >= 0);
  ok('нулевое состояние → grandeur <= 1000', g <= 1000);
  ok('нулевое состояние → grandeur === 0', g === 0);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 2: territory cap = 200 (20 регионов = 200, 21 = 200)');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ regions: Array.from({ length: 20 }, (_, i) => `r${i}`) }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  ok('20 регионов → territory=200', ctx.calcGrandeur('r') === 200);

  gs.nations.r.regions = Array.from({ length: 50 }, (_, i) => `r${i}`);
  ok('50 регионов → территория всё ещё capped 200',
    ctx.calcGrandeur('r') === 200);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 3: wealth cap = 150 (казна 150000 = 150)');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ economy: { treasury: 150000, income_per_turn: 0 } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  const g = ctx.calcGrandeur('r');
  ok('treasury=150000 → wealth вклад = 150', g === 150);

  gs.nations.r.economy.treasury = 9999999;
  ok('treasury=9999999 → wealth capped 150', ctx.calcGrandeur('r') === 150);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 4: army cap = 100');
// ────────────────────────────────────────────────────────────────
{
  // infantry 10000 → 10000/100 = 100, capped 100
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ military: { infantry: 10000, cavalry: 0, at_war_with: [] } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  ok('infantry=10000 → army вклад = 100', ctx.calcGrandeur('r') === 100);

  gs.nations.r.military.infantry = 1000000;
  ok('infantry=1000000 → army capped 100', ctx.calcGrandeur('r') === 100);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 5: happiness cap = 100');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ population: { total: 100000, happiness: 100 } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  ok('happiness=100 → happiness вклад = 100', ctx.calcGrandeur('r') === 100);

  gs.nations.r.population.happiness = 999;
  ok('happiness=999 → happiness capped 100', ctx.calcGrandeur('r') === 100);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 6: trade cap = 150');
// ────────────────────────────────────────────────────────────────
{
  // income 45000 → 45000/300 = 150, capped
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ economy: { treasury: 0, income_per_turn: 45000 } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  ok('income=45000 → trade вклад = 150', ctx.calcGrandeur('r') === 150);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 7: stability cap = 100');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ government: { stability: 100, legitimacy: 50 } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  ok('stability=100 → stability вклад = 100', ctx.calcGrandeur('r') === 100);

  gs.nations.r.government.stability = 500;
  ok('stability=500 → capped 100', ctx.calcGrandeur('r') === 100);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 8: diplomacy cap = 100, ноль при войне');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 1, player_nation: 'r',
    nations: { r: makeNation({ military: { infantry: 0, cavalry: 0, at_war_with: [] } }) },
    diplomacy: { treaties: [
      { status: 'active', type: 'alliance', parties: ['r', 'b'] },
      { status: 'active', type: 'alliance', parties: ['r', 'c'] },
      { status: 'active', type: 'alliance', parties: ['r', 'd'] },
      { status: 'active', type: 'alliance', parties: ['r', 'e'] },
      { status: 'active', type: 'alliance', parties: ['r', 'f'] },
      { status: 'active', type: 'alliance', parties: ['r', 'g'] },
    ]},
    achievements: {},
  };
  const ctx = load(gs);
  // 6 allies * 20 = 120, but cap = 100
  const g = ctx.calcGrandeur('r');
  ok('6 союзов → diplomacy capped 100', g === 100);

  // В войне → diplomacy = 0
  gs.nations.r.military.at_war_with = ['enemy'];
  ok('в войне → diplomacy = 0', ctx.calcGrandeur('r') === 0);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 9: legacy cap = 100 (10 достижений)');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation() }, diplomacy: { treaties: [] }, achievements: { r: {} } };
  const ctx = load(gs);

  for (let i = 0; i < 10; i++) gs.achievements.r[`a${i}`] = { turn: 1, name: `A${i}`, icon: '⭐' };
  ok('10 достижений → legacy вклад = 100', ctx.calcGrandeur('r') === 100);

  // 15 достижений → capped
  for (let i = 10; i < 15; i++) gs.achievements.r[`a${i}`] = { turn: 1, name: `A${i}`, icon: '⭐' };
  ok('15 достижений → legacy capped 100', ctx.calcGrandeur('r') === 100);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 10: NaN и Infinity не ломают grandeur');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ economy: { treasury: Infinity, income_per_turn: NaN } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  const g = ctx.calcGrandeur('r');
  ok('Infinity/NaN → grandeur не NaN', !isNaN(g));
  ok('Infinity/NaN → grandeur не Infinity', isFinite(g));
  ok('Infinity/NaN → grandeur в [0,1000]', g >= 0 && g <= 1000);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 11: отрицательные значения → grandeur >= 0');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: makeNation({ economy: { treasury: -999999, income_per_turn: -99999 }, government: { stability: -100 }, population: { total: 0, happiness: -50 } }) }, diplomacy: { treaties: [] }, achievements: {} };
  const ctx = load(gs);
  const g = ctx.calcGrandeur('r');
  ok('отрицательные значения → grandeur >= 0', g >= 0);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 12: максимальный grandeur = 1000');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 1, player_nation: 'r',
    nations: { r: {
      regions: Array.from({ length: 20 }, (_, i) => `r${i}`),
      economy: { treasury: 150000, income_per_turn: 45000 },
      military: { infantry: 10000, cavalry: 0, at_war_with: [] },
      government: { stability: 100, legitimacy: 100 },
      population: { total: 2000000, happiness: 100 },
    }},
    diplomacy: { treaties: Array.from({ length: 5 }, (_, i) => ({ status: 'active', type: 'alliance', parties: ['r', `n${i}`] })) },
    achievements: { r: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`a${i}`, { turn: 1, name: `A${i}`, icon: '⭐' }])) },
  };
  const ctx = load(gs);
  const g = ctx.calcGrandeur('r');
  ok(`max grandeur = ${g}, ожидалось 1000`, g === 1000);
}

// ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
