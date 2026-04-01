'use strict';
// ── VICTORY 028: Dynamic goals & historical rating unit tests ────────────────
// Юнит-тесты для generateDynamicGoals и getHistoricalRating:
// проверяем правильный выбор целей, progress/completed функции,
// и корректность исторических сравнений.
// Запуск: node tests/victory_028_dynamic_goals_historical_rating_test.cjs

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

function makeGS(overrides = {}) {
  return {
    turn: 10,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 0, income_per_turn: 0 },
        military: { infantry: 0, cavalry: 0, ships: 0, at_war_with: [] },
        government: { type: 'monarchy', stability: 50, legitimacy: 60, ruler: { name: 'Caesar', age: 35 } },
        population: { total: 100000, happiness: 50 },
        regions: ['latium'],
        ...overrides,
      }
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    ...overrides._gs,
  };
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 1: generateDynamicGoals возвращает массив <= 3 элементов');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  const goals = ctx.generateDynamicGoals('rome');

  ok('goals — массив', Array.isArray(goals));
  ok('goals.length <= 3', goals.length <= 3);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 2: Цель "накопи 50 000" при казне > 5000');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ economy: { treasury: 10000, income_per_turn: 1000 } });
  const ctx = load(gs);
  const goals = ctx.generateDynamicGoals('rome');

  const treasuryGoal = goals.find(g => g.id === 'goal_treasury_50k');
  ok('цель treasury_50k присутствует', !!treasuryGoal);
  ok('progress = 10000/50000 = 0.2', Math.abs(treasuryGoal.progress() - 0.2) < 0.01);
  ok('completed = false при 10000', !treasuryGoal.completed());
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 3: Цель захвата столицы при войне');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 10,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 100, income_per_turn: 10 },
        military: { infantry: 2000, cavalry: 500, at_war_with: ['carthage'] },
        government: { stability: 50, legitimacy: 60 },
        population: { total: 100000, happiness: 50 },
        regions: ['latium'],
      },
      carthage: {
        economy: { treasury: 5000 },
        military: { infantry: 1000, cavalry: 200, at_war_with: ['rome'] },
        regions: ['africa', 'numidia'],
        capital_region: 'africa',
      },
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
  };
  const ctx = load(gs);
  const goals = ctx.generateDynamicGoals('rome');

  const captureGoal = goals.find(g => g.id === 'goal_capture_capital');
  ok('цель захвата столицы присутствует при войне', !!captureGoal);
  ok('progress = 0 (столица не захвачена)', captureGoal.progress() === 0);
  ok('completed = false (столица не захвачена)', !captureGoal.completed());

  // Захватываем столицу
  gs.nations.rome.regions.push('africa');
  const goals2 = ctx.generateDynamicGoals('rome');
  const captureGoal2 = goals2.find(g => g.id === 'goal_capture_capital');
  ok('после захвата: completed = true', captureGoal2?.completed() === true);
  ok('после захвата: progress = 1', captureGoal2?.progress() === 1);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 4: Цель роста населения при pop > 300K');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ population: { total: 400000, happiness: 60 } });
  const ctx = load(gs);
  const goals = ctx.generateDynamicGoals('rome');

  const popGoal = goals.find(g => g.id === 'goal_million_pop');
  ok('цель million_pop при pop=400000', !!popGoal);
  ok('progress = 0.4', Math.abs(popGoal.progress() - 0.4) < 0.01);
  ok('completed = false', !popGoal.completed());
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 5: Цель союза при отсутствии союзников');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  gs.diplomacy = { treaties: [] };
  const ctx = load(gs);
  const goals = ctx.generateDynamicGoals('rome');

  const allyGoal = goals.find(g => g.id === 'goal_first_alliance');
  ok('цель союза присутствует при отсутствии союзников', !!allyGoal);
  ok('progress = 0 без союзов', allyGoal.progress() === 0);
  ok('completed = false без союзов', !allyGoal.completed());
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 6: Цель погашения долга при debt > 10000');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  gs.loans = [{ nation_id: 'rome', status: 'active', remaining: 15000, monthly_payment: 500 }];
  const ctx = load(gs);
  const goals = ctx.generateDynamicGoals('rome');

  const debtGoal = goals.find(g => g.id === 'goal_pay_loans');
  ok('цель погашения долга при debt=15000', !!debtGoal);
  ok('completed = false при активных займах', !debtGoal.completed());
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 7: getHistoricalRating — казна > 80000 = Птолемеи');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ economy: { treasury: 90000, income_per_turn: 0 } });
  const ctx = load(gs);
  const rating = ctx.getHistoricalRating('rome');

  ok('getHistoricalRating возвращает массив', Array.isArray(rating));
  ok('массив не пустой', rating.length > 0);
  const ptolemyLine = rating.find(r => r.includes('Птолемее') || r.includes('птолемее'));
  ok('казна 90000 → сравнение с Птолемеями', !!ptolemyLine);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 8: getHistoricalRating — казна 40-80k = Карфаген');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ economy: { treasury: 50000, income_per_turn: 0 } });
  const ctx = load(gs);
  const rating = ctx.getHistoricalRating('rome');

  const carthageLine = rating.find(r => r.includes('Карфаген'));
  ok('казна 50000 → сравнение с Карфагеном', !!carthageLine);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 9: getHistoricalRating — армия > 50000 = Александр');
// ────────────────────────────────────────────────────────────────
{
  // armyPower = infantry + cavalry*3. Условие строгое: > 50000
  const gs = makeGS({ military: { infantry: 50001, cavalry: 0, at_war_with: [], ships: 0 } });
  const ctx = load(gs);
  const rating = ctx.getHistoricalRating('rome');

  const alexanderLine = rating.find(r => r.includes('Александр'));
  ok('армия 50001 → сравнение с Александром', !!alexanderLine);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 10: getHistoricalRating — легитимность > 80 = Перикл');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 85, ruler: { name: 'Caesar', age: 35 } } });
  const ctx = load(gs);
  const rating = ctx.getHistoricalRating('rome');

  const periclesLine = rating.find(r => r.includes('Перикл'));
  ok('легитимность 85 → сравнение с Периклом', !!periclesLine);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 11: getHistoricalRating — легитимность < 30 = Цезарь/Рубикон');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ government: { type: 'monarchy', stability: 50, legitimacy: 25, ruler: { name: 'Caesar', age: 35 } } });
  const ctx = load(gs);
  const rating = ctx.getHistoricalRating('rome');

  const rubicLine = rating.find(r => r.includes('Рубикон') || r.includes('Цезар'));
  ok('легитимность 25 → предупреждение о Рубиконе', !!rubicLine);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 12: generateDynamicGoals без данных не падает');
// ────────────────────────────────────────────────────────────────
{
  const gs = { turn: 1, player_nation: 'r', nations: { r: {} }, diplomacy: {}, loans: [], achievements: {} };
  const ctx = load(gs);
  let result, error;
  try {
    result = ctx.generateDynamicGoals('r');
  } catch (e) {
    error = e;
  }
  ok('не падает при пустой нации', !error);
  ok('возвращает массив', Array.isArray(result));
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 13: _tickDynamicGoals обновляет каждые 10 ходов');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS({ economy: { treasury: 10000, income_per_turn: 1000 } });
  const ctx = load(gs);

  gs.turn = 9;
  ctx.checkAchievements('rome'); // вызовет _tickDynamicGoals
  const goalsAt9 = gs.dynamic_goals?.rome;

  gs.turn = 10;
  ctx.checkAchievements('rome');
  const goalsAt10 = gs.dynamic_goals?.rome;

  ok('dynamic_goals создаются на ходу 10 (или 0)', goalsAt10 !== undefined || goalsAt9 !== undefined);
}

// ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
