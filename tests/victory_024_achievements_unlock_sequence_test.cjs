'use strict';
// ── VICTORY 024: Achievement unlock sequence & counter progression ──────────
// Юнит-тесты: проверяем точную последовательность разблокировки достижений,
// нарастание счётчиков (_battles_won, _invasions_repelled, _wars_declared и т.д.)
// и правильность хранения { turn, name, icon } при разблокировке.
// Запуск: node tests/victory_024_achievements_unlock_sequence_test.cjs

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

function makeGS(overrides = {}) {
  return {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 0, income_per_turn: 0 },
        military: { infantry: 0, cavalry: 0, ships: 0, at_war_with: [] },
        government: { stability: 50, legitimacy: 60, type: 'monarchy', ruler: { name: 'Caesar', age: 35 } },
        population: { total: 100000, happiness: 50 },
        regions: ['latium'],
      }
    },
    diplomacy: { treaties: [] },
    loans: [],
    battles: [],
    achievements: {},
    ...overrides,
  };
}

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

// ────────────────────────────────────────────────────────────────
section('БЛОК 1: Первое достижение first_blood');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);

  ctx.checkAchievements('rome');
  ok('до победы — first_blood не разблокировано',
    !gs.achievements?.rome?.first_blood);

  // Симулируем победу в бою
  gs.nations.rome._battles_won = 1;
  gs.turn = 2;
  ctx.checkAchievements('rome');
  ok('после _battles_won=1 — first_blood разблокировано',
    !!gs.achievements?.rome?.first_blood);
  ok('first_blood хранит turn',
    typeof gs.achievements.rome.first_blood.turn === 'number');
  ok('first_blood хранит name',
    typeof gs.achievements.rome.first_blood.name === 'string');
  ok('first_blood хранит icon',
    typeof gs.achievements.rome.first_blood.icon === 'string');
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 2: Последовательность военных достижений');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 5 });
  const ctx = load(gs);

  // 1 победа → first_blood, не war_machine
  gs.nations.rome._battles_won = 1;
  ctx.checkAchievements('rome');
  ok('_battles_won=1: first_blood есть', !!gs.achievements.rome?.first_blood);
  ok('_battles_won=1: war_machine нет', !gs.achievements.rome?.war_machine);

  // 10 побед → war_machine, conqueror нет
  gs.nations.rome._battles_won = 10;
  ctx.checkAchievements('rome');
  ok('_battles_won=10: war_machine есть', !!gs.achievements.rome?.war_machine);
  ok('_battles_won=10: conqueror нет', !gs.achievements.rome?.conqueror);

  // 20 побед → conqueror
  gs.nations.rome._battles_won = 20;
  ctx.checkAchievements('rome');
  ok('_battles_won=20: conqueror есть', !!gs.achievements.rome?.conqueror);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 3: Достижение iron_wall (_invasions_repelled)');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 10 });
  const ctx = load(gs);

  gs.nations.rome._invasions_repelled = 2;
  ctx.checkAchievements('rome');
  ok('2 отражения: iron_wall нет', !gs.achievements.rome?.iron_wall);

  gs.nations.rome._invasions_repelled = 3;
  ctx.checkAchievements('rome');
  ok('3 отражения: iron_wall есть', !!gs.achievements.rome?.iron_wall);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 4: Экономические достижения');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 20 });
  const ctx = load(gs);

  // treasurer: казна >= 100000
  gs.nations.rome.economy.treasury = 99999;
  ctx.checkAchievements('rome');
  ok('treasury=99999: treasurer нет', !gs.achievements.rome?.treasurer);

  gs.nations.rome.economy.treasury = 100000;
  ctx.checkAchievements('rome');
  ok('treasury=100000: treasurer есть', !!gs.achievements.rome?.treasurer);

  // silk_road: income >= 50000
  gs.nations.rome.economy.income_per_turn = 49999;
  ctx.checkAchievements('rome');
  ok('income=49999: silk_road нет', !gs.achievements.rome?.silk_road);

  gs.nations.rome.economy.income_per_turn = 50000;
  ctx.checkAchievements('rome');
  ok('income=50000: silk_road есть', !!gs.achievements.rome?.silk_road);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 5: Достижение не разблокируется дважды');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 5 });
  const ctx = load(gs);
  const events = [];
  ctx.addEventLog = (msg) => events.push(msg);

  gs.nations.rome._battles_won = 1;
  ctx.checkAchievements('rome');
  const count1 = events.length;

  ctx.checkAchievements('rome');
  ctx.checkAchievements('rome');
  ok('повторные вызовы не дублируют события', events.length === count1);
  ok('в хранилище одна запись first_blood',
    Object.keys(gs.achievements.rome).filter(k => k === 'first_blood').length === 1);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 6: centurion — turn >= 100');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 99 });
  const ctx = load(gs);

  ctx.checkAchievements('rome');
  ok('turn=99: centurion нет', !gs.achievements.rome?.centurion);

  gs.turn = 100;
  ctx.checkAchievements('rome');
  ok('turn=100: centurion есть', !!gs.achievements.rome?.centurion);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 7: hegemon — регионов >= 20');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 50 });
  const ctx = load(gs);

  gs.nations.rome.regions = Array.from({ length: 19 }, (_, i) => `region_${i}`);
  ctx.checkAchievements('rome');
  ok('19 регионов: hegemon нет', !gs.achievements.rome?.hegemon);

  gs.nations.rome.regions = Array.from({ length: 20 }, (_, i) => `region_${i}`);
  ctx.checkAchievements('rome');
  ok('20 регионов: hegemon есть', !!gs.achievements.rome?.hegemon);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 8: populous — население >= 1 000 000');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 50 });
  const ctx = load(gs);

  gs.nations.rome.population.total = 999999;
  ctx.checkAchievements('rome');
  ok('pop=999999: populous нет', !gs.achievements.rome?.populous);

  gs.nations.rome.population.total = 1000000;
  ctx.checkAchievements('rome');
  ok('pop=1000000: populous есть', !!gs.achievements.rome?.populous);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 9: legend — 10 достижений');
// ────────────────────────────────────────────────────────────────
{
  // turn=5 чтобы centurion (turn>=100) не триггерился автоматически
  const gs = makeGS({ turn: 5 });
  const ctx = load(gs);

  // Разблокируем 9 достижений вручную
  gs.achievements.rome = {};
  for (let i = 0; i < 9; i++) {
    gs.achievements.rome[`fake_${i}`] = { turn: 1, name: `Fake ${i}`, icon: '⭐' };
  }
  ctx.checkAchievements('rome');
  ok('9 достижений: legend нет', !gs.achievements.rome?.legend);

  gs.achievements.rome['fake_9'] = { turn: 1, name: 'Fake 9', icon: '⭐' };
  ctx.checkAchievements('rome');
  ok('10 достижений: legend есть', !!gs.achievements.rome?.legend);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 10: warmonger — 5 объявленных войн');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ turn: 30 });
  const ctx = load(gs);

  gs.nations.rome._wars_declared = 4;
  ctx.checkAchievements('rome');
  ok('_wars_declared=4: warmonger нет', !gs.achievements.rome?.warmonger);

  gs.nations.rome._wars_declared = 5;
  ctx.checkAchievements('rome');
  ok('_wars_declared=5: warmonger есть', !!gs.achievements.rome?.warmonger);
}

// ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
