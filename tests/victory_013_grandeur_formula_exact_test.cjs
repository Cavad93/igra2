'use strict';
// ── VICTORY 013: Grandeur Formula Exact Tests ──────────────────────
// Математически точная проверка формулы calcGrandeur (Сессия 2).
// Проверяем каждую компоненту отдельно и в комбинации.
// 25 тестов.
// Запуск: node tests/victory_013_grandeur_formula_exact_test.cjs

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

function makeCtx(overrides = {}) {
  const GS = {
    turn: 1,
    player_nation: 'nation1',
    nations: {
      nation1: {
        _id: 'nation1',
        name: 'Тест',
        economy:    { treasury: 0, income_per_turn: 0 },
        military:   { infantry: 0, cavalry: 0, at_war_with: [] },
        population: { total: 0, happiness: 0 },
        government: { type: 'monarchy', stability: 0, legitimacy: 50, ruler: { name: 'X', age: 30 } },
        regions:    [],
        relations:  {},
        active_laws: [],
        _turns_in_power: 0,
        _ruler_start_turn: 0,
      },
    },
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    player_vows:  [],
    chronicle_log: [],
    active_crisis: null,
    testament:    null,
    player_manifest: null,
    dynamic_goals:   {},
    ...overrides,
  };
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const src1 = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const src2 = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(src1, ctx);
  vm.runInContext(src2, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 1: Нулевые данные → grandeur = 0
// ════════════════════════════════════════════════════════════════════
section('БЛОК 1: Нулевые данные');

{
  const ctx = makeCtx();
  const g = ctx.calcGrandeur('nation1');
  ok('grandeur = 0 при всех нулевых данных', g === 0);
  ok('тип возвращаемого значения — number', typeof g === 'number');
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 2: Компонента territory (max 200)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 2: Компонента territory = regions.length * 10, max 200');

{
  // 5 регионов → 50
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.nation1.regions = ['r1','r2','r3','r4','r5'];
  ok('5 регионов → territory = 50', ctx.calcGrandeur('nation1') === 50);

  // 20 регионов → 200
  ctx.GAME_STATE.nations.nation1.regions = Array.from({ length: 20 }, (_,i) => `r${i}`);
  ok('20 регионов → territory = 200 (max)', ctx.calcGrandeur('nation1') === 200);

  // 30 регионов → cap at 200
  ctx.GAME_STATE.nations.nation1.regions = Array.from({ length: 30 }, (_,i) => `r${i}`);
  ok('30 регионов → territory = 200 (cap)', ctx.calcGrandeur('nation1') === 200);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 3: Компонента wealth (treasury / 1000, max 150)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 3: Компонента wealth = treasury/1000, max 150');

{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.nation1.economy.treasury = 50000;
  // wealth = min(150, 50000/1000) = 50
  ok('treasury=50000 → wealth=50 → grandeur=50', ctx.calcGrandeur('nation1') === 50);

  ctx.GAME_STATE.nations.nation1.economy.treasury = 150000;
  // wealth = min(150, 150) = 150
  ok('treasury=150000 → grandeur=150', ctx.calcGrandeur('nation1') === 150);

  ctx.GAME_STATE.nations.nation1.economy.treasury = 200000;
  // wealth capped at 150
  ok('treasury=200000 → grandeur=150 (cap)', ctx.calcGrandeur('nation1') === 150);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 4: Компонента army (infantry + cavalry*3) / 100, max 100
// ════════════════════════════════════════════════════════════════════
section('БЛОК 4: Компонента army = (inf + cav*3)/100, max 100');

{
  const ctx = makeCtx();
  const n = ctx.GAME_STATE.nations.nation1;

  // 5000 пехоты, 0 кавалерии → army = min(100, 50) = 50
  n.military.infantry = 5000;
  n.military.cavalry  = 0;
  ok('5000 infantry → army=50 → grandeur=50', ctx.calcGrandeur('nation1') === 50);

  // 10000 пехоты → army = min(100, 100) = 100
  n.military.infantry = 10000;
  ok('10000 infantry → army=100 → grandeur=100', ctx.calcGrandeur('nation1') === 100);

  // 5000 кавалерии → army = min(100, 15000/100) = 100
  n.military.infantry = 0;
  n.military.cavalry  = 5000;
  ok('5000 cavalry → army=100 → grandeur=100', ctx.calcGrandeur('nation1') === 100);

  // Смешанная армия: 3000 inf + 1000 cav → (3000+3000)/100 = 60
  n.military.infantry = 3000;
  n.military.cavalry  = 1000;
  ok('3000 inf + 1000 cav → army=60 → grandeur=60', ctx.calcGrandeur('nation1') === 60);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 5: Компонента happiness (max 100)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 5: Компонента happiness = min(100, happiness)');

{
  const ctx = makeCtx();
  const n = ctx.GAME_STATE.nations.nation1;

  n.population.happiness = 75;
  ok('happiness=75 → grandeur=75', ctx.calcGrandeur('nation1') === 75);

  n.population.happiness = 100;
  ok('happiness=100 → grandeur=100', ctx.calcGrandeur('nation1') === 100);

  n.population.happiness = 150; // выше максимума — должен кэпнуться
  ok('happiness=150 → grandeur=100 (cap)', ctx.calcGrandeur('nation1') === 100);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 6: Компонента stability (max 100)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 6: Компонента stability = min(100, gov.stability)');

{
  const ctx = makeCtx();
  const n = ctx.GAME_STATE.nations.nation1;

  n.government.stability = 80;
  ok('stability=80 → grandeur=80', ctx.calcGrandeur('nation1') === 80);

  n.government.stability = 110; // cap
  ok('stability=110 → grandeur=100 (cap)', ctx.calcGrandeur('nation1') === 100);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 7: Компонента diplomacy (0 во время войны)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 7: Компонента diplomacy = 0 во время войны');

{
  const ctx = makeCtx();
  const GS = ctx.GAME_STATE;
  const n = GS.nations.nation1;

  GS.diplomacy.treaties = [
    { status: 'active', type: 'alliance', parties: ['nation1', 'nation2'] },
    { status: 'active', type: 'alliance', parties: ['nation1', 'nation3'] },
  ];

  // В мире: 2 союза * 20 = 40
  ok('2 союза в мире → diplomacy=40 → grandeur=40', ctx.calcGrandeur('nation1') === 40);

  // Во время войны: diplomacy = 0
  n.military.at_war_with = ['nation4'];
  ok('во время войны diplomacy=0 → grandeur=0', ctx.calcGrandeur('nation1') === 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 8: Компонента legacy (achievements * 10, max 100)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 8: Компонента legacy = achievements*10, max 100');

{
  const ctx = makeCtx();
  const GS = ctx.GAME_STATE;
  const n  = GS.nations.nation1;

  // Разблокируем достижения напрямую
  GS.achievements['nation1'] = {};
  for (let i = 0; i < 5; i++) {
    GS.achievements['nation1'][`ach_${i}`] = { turn: 1, name: `Ach${i}`, icon: '🏆' };
  }
  // 5 достижений * 10 = 50
  ok('5 достижений → legacy=50 → grandeur=50', ctx.calcGrandeur('nation1') === 50);

  // 10 достижений → legacy=100
  for (let i = 5; i < 10; i++) {
    GS.achievements['nation1'][`ach_${i}`] = { turn: 1, name: `Ach${i}`, icon: '🏆' };
  }
  ok('10 достижений → legacy=100 → grandeur=100', ctx.calcGrandeur('nation1') === 100);

  // 15 достижений → legacy=100 (cap)
  for (let i = 10; i < 15; i++) {
    GS.achievements['nation1'][`ach_${i}`] = { turn: 1, name: `Ach${i}`, icon: '🏆' };
  }
  ok('15 достижений → legacy=100 (cap) → grandeur=100', ctx.calcGrandeur('nation1') === 100);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 9: Максимально возможный grandeur
// ════════════════════════════════════════════════════════════════════
section('БЛОК 9: Теоретический максимум grandeur = 1000');

{
  const ctx = makeCtx();
  const GS = ctx.GAME_STATE;
  const n  = GS.nations.nation1;

  // territory: 20 регионов → 200
  n.regions = Array.from({ length: 20 }, (_,i) => `r${i}`);
  // wealth: 150000 → 150
  n.economy.treasury = 150000;
  // army: 10000 inf → 100
  n.military.infantry = 10000;
  n.military.at_war_with = [];
  // happiness: 100
  n.population.happiness = 100;
  // trade: 45000 income → 150
  n.economy.income_per_turn = 45000;
  // stability: 100
  n.government.stability = 100;
  // diplomacy: 5 alliances = 100
  GS.diplomacy.treaties = Array.from({ length: 5 }, (_,i) => ({
    status: 'active', type: 'alliance', parties: ['nation1', `n${i}`]
  }));
  // legacy: 10 achievements = 100
  GS.achievements['nation1'] = {};
  for (let i = 0; i < 10; i++) {
    GS.achievements['nation1'][`ach_${i}`] = { turn: 1, name: `Ach${i}`, icon: '🏆' };
  }

  const g = ctx.calcGrandeur('nation1');
  ok('максимальный grandeur ≤ 1000', g <= 1000);
  ok('максимальный grandeur ≥ 900 при максимальных данных', g >= 900);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 10: Отрицательные и бесконечные значения
// ════════════════════════════════════════════════════════════════════
section('БЛОК 10: Устойчивость к экстремальным числам');

{
  const ctx = makeCtx();
  const n  = ctx.GAME_STATE.nations.nation1;

  n.economy.treasury = -100000;
  ok('отрицательная казна → grandeur ≥ 0', ctx.calcGrandeur('nation1') >= 0);

  n.economy.treasury = Infinity;
  ok('Infinity treasury → grandeur ≤ 1000', ctx.calcGrandeur('nation1') <= 1000);

  n.economy.treasury = NaN;
  ok('NaN treasury → grandeur не NaN', !isNaN(ctx.calcGrandeur('nation1')));

  n.military.cavalry = -500;
  ok('отрицательная кавалерия → grandeur ≥ 0', ctx.calcGrandeur('nation1') >= 0);
}

// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
