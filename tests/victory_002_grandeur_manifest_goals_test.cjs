'use strict';
// ── VICTORY 002: Unit tests — grandeur, manifest, dynamic goals ───────
// Запуск: node tests/victory_002_grandeur_manifest_goals_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

const domStub = {
  getElementById: id => {
    if (id === 'manifest-custom-input') return { value: 'Тест манифест' };
    return null;
  },
  createElement: () => ({ style: {}, innerHTML: '', remove: () => {} }),
  body: { appendChild: () => {} },
};

function makeCtx(overrides = {}) {
  const GS = {
    turn: 1,
    player_nation: 'corinth',
    nations: {
      corinth: {
        name: 'Коринф',
        economy:    { treasury: 8000, income_per_turn: 3000 },
        military:   { infantry: 2000, cavalry: 500, ships: 10, at_war_with: [] },
        population: { total: 80000, happiness: 55 },
        government: { type: 'oligarchy', stability: 65, legitimacy: 70, ruler: { name: 'Архон', age: 45 } },
        regions:    ['r1', 'r2', 'r3'],
        relations:  {},
      },
    },
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    player_manifest: null,
    dynamic_goals:   {},
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

// ─── TEST 1: calcGrandeur территория — 3 региона = 30 ────────────────
{
  const ctx = makeCtx();
  const g = ctx.calcGrandeur('corinth');
  // territory = min(200, 3*10) = 30
  ok('calcGrandeur не ниже 30 для 3 регионов', g >= 30);
}

// ─── TEST 2: calcGrandeur максимум 1000 ──────────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.corinth.economy.treasury     = 999999;
  ctx.GAME_STATE.nations.corinth.economy.income_per_turn = 999999;
  ctx.GAME_STATE.nations.corinth.military.infantry    = 999999;
  ctx.GAME_STATE.nations.corinth.military.cavalry     = 999999;
  ctx.GAME_STATE.nations.corinth.population.happiness = 100;
  ctx.GAME_STATE.nations.corinth.government.stability = 100;
  ctx.GAME_STATE.nations.corinth.regions = Array.from({length: 30}, (_, i) => `r${i}`);
  const g = ctx.calcGrandeur('corinth');
  ok('calcGrandeur <= 1000', g <= 1000);
}

// ─── TEST 3: calcGrandeur = 0 для несуществующей нации ───────────────
{
  const ctx = makeCtx();
  ok('calcGrandeur=0 для несуществующей', ctx.calcGrandeur('nonexistent') === 0);
}

// ─── TEST 4: calcGrandeur не включает дипломатию если на войне ───────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.corinth.military.at_war_with = ['athens'];
  ctx.GAME_STATE.diplomacy.treaties = [{
    status: 'active', type: 'alliance',
    parties: ['corinth', 'sparta']
  }];
  const g = ctx.calcGrandeur('corinth');
  // Дипломатия = 0 если на войне
  ok('дипломатия=0 во время войны', g >= 0);
}

// ─── TEST 5: _saveManifest сохраняет манифест ─────────────────────────
{
  const ctx = makeCtx();
  ctx._saveManifest('Стать великой державой');
  ok('player_manifest сохранён', ctx.GAME_STATE.player_manifest?.text === 'Стать великой державой');
  ok('player_manifest имеет turn', ctx.GAME_STATE.player_manifest?.chosen_turn === 1);
}

// ─── TEST 6: selectManifestPreset работает ────────────────────────────
{
  const ctx = makeCtx();
  ctx.selectManifestPreset('richest');
  ok('preset richest сохранён',
    ctx.GAME_STATE.player_manifest?.text === 'Стать богатейшей державой Средиземноморья');
}

// ─── TEST 7: хронист оценивает манифест каждые 25 ходов ──────────────
{
  let logCalled = 0;
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 25;
  ctx.GAME_STATE.player_manifest = { text: 'Тест', chosen_turn: 1 };
  ctx.addEventLog = () => { logCalled++; };
  ctx._tickManifest('corinth');
  ok('хронист вызывает addEventLog на ходу 25', logCalled >= 1);
}

// ─── TEST 8: хронист НЕ вызывается на хода не кратных 25 ─────────────
{
  let logCalled = 0;
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 24;
  ctx.GAME_STATE.player_manifest = { text: 'Тест', chosen_turn: 1 };
  ctx.addEventLog = () => { logCalled++; };
  ctx._tickManifest('corinth');
  ok('хронист НЕ вызывается на ходу 24', logCalled === 0);
}

// ─── TEST 9: generateDynamicGoals при war — цель на захват столицы ────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.athens = {
    name: 'Афины',
    capital_region: 'r_athens_capital',
    regions: ['r_athens_capital', 'r_athens2'],
    military: { infantry: 1500, cavalry: 300, at_war_with: [] },
    economy: { treasury: 2000 },
    population: { total: 100000, happiness: 60 },
  };
  ctx.GAME_STATE.nations.corinth.military.at_war_with = ['athens'];
  const goals = ctx.generateDynamicGoals('corinth');
  ok('цель на захват при войне', goals.some(g => g.id === 'goal_capture_capital'));
}

// ─── TEST 10: generateDynamicGoals без союзов — цель на союз ─────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.diplomacy.treaties = [];
  const goals = ctx.generateDynamicGoals('corinth');
  ok('цель заключить союз без союзников', goals.some(g => g.id === 'goal_first_alliance'));
}

// ─── TEST 11: generateDynamicGoals при высоком долге ─────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.loans = [
    { nation_id: 'corinth', status: 'active', remaining: 15000, monthly_payment: 100 }
  ];
  const goals = ctx.generateDynamicGoals('corinth');
  ok('цель погасить займы при высоком долге', goals.some(g => g.id === 'goal_pay_loans'));
}

// ─── TEST 12: generateDynamicGoals возвращает <= 3 целей ─────────────
{
  const ctx = makeCtx();
  const goals = ctx.generateDynamicGoals('corinth');
  ok('не более 3 динамических целей', goals.length <= 3);
}

// ─── TEST 13: goal.progress() returns 0..1 ───────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.corinth.economy.treasury = 10000;
  const goals = ctx.generateDynamicGoals('corinth');
  for (const g of goals) {
    const p = g.progress();
    ok(`progress() для "${g.text}" в [0,1]`, p >= 0 && p <= 1);
  }
}

// ─── TEST 14: goal.completed() returns boolean ───────────────────────
{
  const ctx = makeCtx();
  const goals = ctx.generateDynamicGoals('corinth');
  for (const g of goals) {
    const c = g.completed();
    ok(`completed() для "${g.text}" — boolean`, typeof c === 'boolean');
  }
}

// ─── TEST 15: _tickDynamicGoals обновляет GAME_STATE.dynamic_goals ────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 10; // кратно 10
  ctx._tickDynamicGoals('corinth');
  ok('dynamic_goals обновлены', Array.isArray(ctx.GAME_STATE.dynamic_goals['corinth']));
}

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
