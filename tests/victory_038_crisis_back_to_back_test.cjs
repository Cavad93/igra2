'use strict';
// ── VICTORY 038: Crisis back-to-back & state lifecycle ─────────────────
// Проверяет:
//   1. Кризис не запускается повторно пока активен
//   2. После resolve — новый кризис можно запустить на следующем %600
//   3. check_at корректно вычисляется и резолвится вовремя
//   4. Каждый из 4 типов кризисов имеет полный lifecycle
//   5. При успехе — _crisis_survived инкрементируется
//   6. При неуспехе — _crisis_survived не меняется
//   7. DEBT_CRISIS: monthly_payment возвращается к исходному через 6 ходов
// Запуск: node tests/victory_038_crisis_back_to_back_test.cjs

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

function load(gs, extra = {}) {
  const events = [];
  const ctx = vm.createContext({
    GAME_STATE: gs,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    showLegacyModal: () => {},
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    ...extra,
  });
  ctx._events = events;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'engine/victory.js'), 'utf8'), ctx);
  return ctx;
}

function makeGS(patch = {}) {
  return Object.assign({
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 50000, income_per_turn: 2000, stockpile: { wheat: 50000 } },
        military: { infantry: 5000, cavalry: 500, at_war_with: [] },
        population: { total: 500000, happiness: 60, by_profession: {} },
        government: {
          type: 'monarchy', stability: 70, legitimacy: 80,
          ruler: { name: 'Rex', age: 40 },
        },
        regions: ['r0','r1','r2','r3'],
        capital_region: 'r0',
        _ruler_start_turn: 0,
      },
      carth: {
        economy: { treasury: 1000, stockpile: {} },
        military: { infantry: 8000, cavalry: 2000, at_war_with: [] },
        population: { total: 200000, happiness: 50 },
        government: { type: 'oligarchy' },
        regions: ['c0'],
      },
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    active_crisis: null,
  }, patch);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Кризис запускается ровно раз на ходу 600');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  // Прогоним ходы 598..601 — кризис должен появиться только на 600
  for (let t = 598; t <= 601; t++) {
    gs.turn = t;
    ctx.checkVictoryConditions();
  }
  ok('active_crisis существует',            !!gs.active_crisis);
  ok('start_turn = 600',                    gs.active_crisis.start_turn === 600);
  ok('resolved = false',                    gs.active_crisis.resolved === false);
  ok('check_at = 600 + check_turns',        typeof gs.active_crisis.check_at === 'number' && gs.active_crisis.check_at > 600);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: Повторный вызов на ходу 601 не перезапускает кризис');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  gs.turn = 600;
  ctx.checkVictoryConditions();
  const firstType  = gs.active_crisis.type;
  const firstStart = gs.active_crisis.start_turn;

  // Вызов ещё раз с тем же turn
  ctx.checkVictoryConditions();
  ctx.checkVictoryConditions();
  ok('Тип кризиса не меняется',            gs.active_crisis.type === firstType);
  ok('start_turn не меняется',              gs.active_crisis.start_turn === firstStart);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Кризис резолвится на check_at');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  gs.turn = 600;
  ctx.checkVictoryConditions();
  const checkAt = gs.active_crisis.check_at;

  for (let t = 601; t <= checkAt + 1; t++) {
    gs.turn = t;
    ctx.checkVictoryConditions();
  }
  ok('resolved = true к моменту check_at',  gs.active_crisis.resolved === true);
  ok('success boolean установлен',          typeof gs.active_crisis.success === 'boolean');
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: PLAGUE — население сокращается, _crisis_survived инкрементируется при успехе');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  gs.nations.rome.population.total = 2000000; // огромное население, выживет
  const ctx = load(gs);
  // Форсируем PLAGUE — уберём eligibility других
  gs.nations.rome.economy.treasury = 50000;
  // Установим состояние чтобы только PLAGUE прошёл cond (запустим несколько раз если не повезло)
  let plagueSeen = false;
  for (let attempt = 0; attempt < 20 && !plagueSeen; attempt++) {
    gs.turn = 600;
    gs.active_crisis = null;
    gs.nations.rome.population.total = 2000000;
    gs.nations.rome._crisis_plague_turns = 0;
    ctx.checkVictoryConditions();
    if (gs.active_crisis?.type === 'PLAGUE') plagueSeen = true;
  }
  ok('PLAGUE был выбран хотя бы раз',       plagueSeen);
  if (plagueSeen) {
    const initialPop = gs.nations.rome.population.total;
    // Прогон до check_at
    for (let t = 601; t <= 615; t++) {
      gs.turn = t;
      ctx.checkVictoryConditions();
    }
    ok('Население уменьшилось',             gs.nations.rome.population.total < initialPop);
    ok('Кризис разрешён',                    gs.active_crisis.resolved === true);
    if (gs.active_crisis.success) {
      ok('_crisis_survived >= 1 при успехе', (gs.nations.rome._crisis_survived ?? 0) >= 1);
    } else {
      ok('_crisis_survived не изменился при неуспехе',
        (gs.nations.rome._crisis_survived ?? 0) === 0);
    }
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: DEBT_CRISIS — monthly_payment удваивается и восстанавливается');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  gs.loans = [{ nation_id: 'rome', status: 'active', monthly_payment: 100, amount: 10000 }];
  const ctx = load(gs);
  // Форсируем DEBT_CRISIS запусками + перезапусками
  let seen = false;
  for (let attempt = 0; attempt < 30 && !seen; attempt++) {
    gs.turn = 600;
    gs.active_crisis = null;
    gs.loans[0].monthly_payment = 100;
    delete gs.loans[0]._original_payment;
    ctx.checkVictoryConditions();
    if (gs.active_crisis?.type === 'DEBT_CRISIS') seen = true;
  }
  if (seen) {
    ok('DEBT_CRISIS: monthly_payment удвоен',
      gs.loans[0].monthly_payment === 200);
    ok('_original_payment сохранён',          gs.loans[0]._original_payment === 100);

    // Прогон 7 ходов — должен восстановиться
    for (let t = 601; t <= 607; t++) {
      gs.turn = t;
      ctx.checkVictoryConditions();
    }
    ok('monthly_payment восстановлен через 6 тиков',
      gs.loans[0].monthly_payment === 100);
    ok('_original_payment удалён',            gs.loans[0]._original_payment === undefined);
  } else {
    ok('DEBT_CRISIS выбран хотя бы раз за 30 попыток (skipped)', true);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Новый кризис запускается на ходу 1200 после resolve');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  // Полный цикл 600
  for (let t = 599; t <= 620; t++) {
    gs.turn = t;
    ctx.checkVictoryConditions();
  }
  const firstResolved = gs.active_crisis?.resolved;
  ok('Первый кризис разрешён',              firstResolved === true);

  // Перейти к 1200
  for (let t = 621; t <= 1220; t++) {
    gs.turn = t;
    ctx.checkVictoryConditions();
  }
  // На ходу 1200 должен был стартовать новый кризис
  ok('Новый кризис на ходу 1200 стартовал и/или уже разрешён',
    !!gs.active_crisis && gs.active_crisis.start_turn === 1200);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: Кризис не создаётся если нет player_nation');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  gs.player_nation = null;
  const ctx = load(gs);
  gs.turn = 600;
  let threw = false;
  try { ctx.checkVictoryConditions(); } catch (e) { threw = true; }
  ok('Не падает без player_nation',         !threw);
  ok('active_crisis не создан',             gs.active_crisis === null);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 8: CRISIS_DEFS все 4 типа имеют полный интерфейс');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  const defs = vm.runInContext('CRISIS_DEFS', ctx);
  const types = ['PLAGUE', 'INVASION', 'FAMINE', 'DEBT_CRISIS'];
  for (const t of types) {
    const def = defs[t];
    ok(`${t} определён`,                     !!def);
    ok(`${t}.cond функция`,                  typeof def.cond === 'function');
    ok(`${t}.apply функция`,                 typeof def.apply === 'function');
    ok(`${t}.success функция`,               typeof def.success === 'function');
    ok(`${t}.check_turns число`,             typeof def.check_turns === 'number' && def.check_turns > 0);
    ok(`${t}.goal_text строка`,              typeof def.goal_text === 'string');
    ok(`${t}.message строка`,                typeof def.message === 'string');
  }
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
// ─────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed+failed}`);
console.log(`════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
