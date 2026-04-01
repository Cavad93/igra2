'use strict';
// ── VICTORY 030: Crisis priority selection tests ─────────────────────
// Проверяет что кризисы выбираются по приоритету, а не случайно.
// PLAGUE (priority 3) > INVASION (2) = DEBT_CRISIS (2) > FAMINE (1)
// Запуск: node tests/victory_030_crisis_priority_test.cjs

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

function loadBoth(GS) {
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
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  return ctx;
}

function makeGS(nationPatch = {}, gsPatch = {}) {
  const nation = Object.assign({
    _id: 'rome',
    economy: { treasury: 10000, income_per_turn: 5000, tax_rate: 0.1, stockpile: { wheat: 10000 } },
    military: { infantry: 5000, cavalry: 500, ships: 10, morale: 70, at_war_with: [], mercenaries: 0 },
    population: { total: 200000, happiness: 70, by_profession: {} },
    government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 40 } },
    regions: ['r0', 'r1', 'r2'],
    capital_region: 'r0',
    _bankruptcies: 0,
  }, nationPatch);

  return Object.assign({
    turn: 600,
    player_nation: 'rome',
    nations: { rome: nation },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
    active_crisis: null,
  }, gsPatch);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: PLAGUE приоритет над FAMINE');
// ─────────────────────────────────────────────────────────────
{
  // Только rome — INVASION не применимо. PLAGUE (pop>100k) > FAMINE (всегда)
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  const ctx = loadBoth(GS);
  // Запускаем 10 раз — должен всегда выбрать PLAGUE
  let plaguePicked = 0;
  for (let i = 0; i < 10; i++) {
    ctx.GAME_STATE.active_crisis = null;
    ctx.processCrisisVeha('rome');
    if (ctx.GAME_STATE.active_crisis?.type === 'PLAGUE') plaguePicked++;
    ctx.GAME_STATE.active_crisis = null;
  }
  ok('PLAGUE выбирается 10/10 раз при pop=500k (приоритет 3 > FAMINE 1)', plaguePicked === 10);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: FAMINE — единственный кандидат (мало населения)');
// ─────────────────────────────────────────────────────────────
{
  // Маленькое население → PLAGUE не применимо; INVASION не применимо (1 нация)
  const GS = makeGS({ population: { total: 50000, happiness: 70, by_profession: {} } });
  const ctx = loadBoth(GS);
  ctx.processCrisisVeha('rome');
  ok('Кризис создан при pop=50k', ctx.GAME_STATE.active_crisis !== null);
  ok('Тип FAMINE (единственный кандидат)', ctx.GAME_STATE.active_crisis?.type === 'FAMINE');
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: DEBT_CRISIS при наличии займов (приоритет 2)');
// ─────────────────────────────────────────────────────────────
{
  // Маленькое население (PLAGUE off) + есть займ → DEBT_CRISIS (2) > FAMINE (1)
  const GS = makeGS(
    { population: { total: 50000, happiness: 70, by_profession: {} } },
    { loans: [{ nation_id: 'rome', status: 'active', monthly_payment: 100, amount: 5000 }] }
  );
  const ctx = loadBoth(GS);
  let debtPicked = 0;
  for (let i = 0; i < 10; i++) {
    ctx.GAME_STATE.active_crisis = null;
    ctx.processCrisisVeha('rome');
    if (ctx.GAME_STATE.active_crisis?.type === 'DEBT_CRISIS') debtPicked++;
    ctx.GAME_STATE.active_crisis = null;
  }
  ok('DEBT_CRISIS выбирается 10/10 при активных займах и pop<100k', debtPicked === 10);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: INVASION при двух нациях (приоритет 2) без займов');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(
    { population: { total: 50000, happiness: 70, by_profession: {} } },
    {
      nations: {
        rome: {
          _id: 'rome',
          economy: { treasury: 10000, income_per_turn: 5000, stockpile: { wheat: 10000 } },
          military: { infantry: 5000, cavalry: 500, at_war_with: [], mercenaries: 0 },
          population: { total: 50000, happiness: 70, by_profession: {} },
          government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 40 } },
          regions: ['r0'], capital_region: 'r0', _bankruptcies: 0,
        },
        carthage: {
          _id: 'carthage',
          military: { infantry: 8000, cavalry: 1000, at_war_with: [], mercenaries: 0 },
          population: { total: 80000 },
          economy: {},
        },
      },
    }
  );
  const ctx = loadBoth(GS);
  let invasionPicked = 0;
  for (let i = 0; i < 10; i++) {
    ctx.GAME_STATE.active_crisis = null;
    ctx.processCrisisVeha('rome');
    const t = ctx.GAME_STATE.active_crisis?.type;
    if (t === 'INVASION') invasionPicked++;
    ctx.GAME_STATE.active_crisis = null;
  }
  ok('INVASION выбирается 10/10 при 2 нациях и pop<100k', invasionPicked === 10);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: PLAGUE priority above INVASION (3 > 2) при обоих условиях');
// ─────────────────────────────────────────────────────────────
{
  // Большое население (PLAGUE) + 2 нации (INVASION) → PLAGUE должен победить
  const GS = makeGS(
    { population: { total: 500000, happiness: 70, by_profession: {} } },
    {
      nations: {
        rome: {
          _id: 'rome',
          economy: { treasury: 10000, income_per_turn: 5000, stockpile: { wheat: 10000 } },
          military: { infantry: 5000, cavalry: 500, at_war_with: [], mercenaries: 0 },
          population: { total: 500000, happiness: 70, by_profession: {} },
          government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 40 } },
          regions: ['r0'], capital_region: 'r0', _bankruptcies: 0,
        },
        carthage: {
          _id: 'carthage',
          military: { infantry: 8000, cavalry: 1000, at_war_with: [], mercenaries: 0 },
          population: { total: 80000 },
          economy: {},
        },
      },
    }
  );
  const ctx = loadBoth(GS);
  let plaguePicked = 0;
  for (let i = 0; i < 10; i++) {
    ctx.GAME_STATE.active_crisis = null;
    ctx.processCrisisVeha('rome');
    if (ctx.GAME_STATE.active_crisis?.type === 'PLAGUE') plaguePicked++;
    ctx.GAME_STATE.active_crisis = null;
  }
  ok('PLAGUE побеждает INVASION при pop=500k (приоритет 3 > 2)', plaguePicked === 10);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Кризис не запускается повторно при активном');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = { type: 'FAMINE', start_turn: 600, resolved: false };
  const ctx = loadBoth(GS);
  ctx.processCrisisVeha('rome');
  ok('Повторный вызов не перезаписывает активный кризис', ctx.GAME_STATE.active_crisis?.type === 'FAMINE');
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: check_at устанавливается корректно');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.turn = 600;
  const ctx = loadBoth(GS);
  ctx.processCrisisVeha('rome');
  const crisis = ctx.GAME_STATE.active_crisis;
  ok('check_at = start_turn + check_turns', crisis?.check_at === crisis?.start_turn + 10);
  ok('start_turn = 600', crisis?.start_turn === 600);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 8: Кризис разрешается при resolve');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = {
    type: 'PLAGUE', start_turn: 600, check_at: 610,
    resolved: false, success: false, goal_text: 'test', nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  // Симулируем ход 610
  ctx.GAME_STATE.turn = 610;
  ctx.checkVictoryConditions();
  ok('active_crisis.resolved = true после check_at', ctx.GAME_STATE.active_crisis?.resolved === true);
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
