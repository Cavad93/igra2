'use strict';
// ── VICTORY 020: Crisis full lifecycle tests ──────────────────────────
// Полный цикл каждого из 4 кризисов: PLAGUE, INVASION, FAMINE, DEBT_CRISIS.
// Для каждого: запуск → тики → разрешение (success и failure).
// Запуск: node tests/victory_020_crisis_full_cycle_test.cjs

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
  getElementById: id => id === 'legacy-modal' ? null : null,
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
    name: 'Рим',
    economy: { treasury: 10000, income_per_turn: 5000, tax_rate: 0.1, stockpile: { wheat: 10000 } },
    military: { infantry: 5000, cavalry: 500, ships: 10, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
    population: { total: 200000, happiness: 70, by_profession: {} },
    government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 40 } },
    regions: Array.from({ length: 5 }, (_, i) => `r${i}`),
    capital_region: 'r0',
    relations: {},
    active_laws: [],
    buildings: [],
    _bankruptcies: 0,
    _crisis_survived: 0,
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

// ────────────────────────────────────────────────────────
section('БЛОК 1: PLAGUE — запуск и тик');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  const ctx = loadBoth(GS);

  // processCrisisVeha должна выбрать PLAGUE (population > 100000)
  // Принудительно запустим PLAGUE
  ctx.GAME_STATE.nations.rome._crisis_plague_turns = undefined;
  ctx.processCrisisVeha('rome');

  ok('PLAGUE: active_crisis создан', ctx.GAME_STATE.active_crisis !== null);
  const crisis = ctx.GAME_STATE.active_crisis;
  ok('PLAGUE: тип корректен', crisis?.type === 'PLAGUE');
  ok('PLAGUE: resolved=false', crisis?.resolved === false);
  ok('PLAGUE: start_turn=600', crisis?.start_turn === 600);
}
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  // Форсируем PLAGUE через active_crisis
  GS.active_crisis = {
    type: 'PLAGUE',
    start_turn: 600,
    check_at: 615,
    resolved: false,
    success: false,
    goal_text: 'Сохранить население > 300 000',
    nation_id: 'rome',
  };
  GS.nations.rome._crisis_plague_turns = 0;
  const ctx = loadBoth(GS);

  const popBefore = ctx.GAME_STATE.nations.rome.population.total;

  // Тик 1
  ctx.GAME_STATE.turn = 601;
  ctx.checkVictoryConditions();
  const popAfter1 = ctx.GAME_STATE.nations.rome.population.total;
  ok('PLAGUE tick1: население уменьшилось', popAfter1 < popBefore);

  // 5 тиков
  for (let t = 602; t <= 605; t++) {
    ctx.GAME_STATE.turn = t;
    ctx.checkVictoryConditions();
  }
  const popAfter5 = ctx.GAME_STATE.nations.rome.population.total;
  ok('PLAGUE 5 тиков: население < начального', popAfter5 < popBefore);
  ok('PLAGUE: _crisis_plague_turns остановился на 5', ctx.GAME_STATE.nations.rome._crisis_plague_turns >= 5);
}

// ────────────────────────────────────────────────────────
section('БЛОК 2: PLAGUE — успешное разрешение (population > 300k)');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = {
    type: 'PLAGUE',
    start_turn: 600,
    check_at: 610,
    resolved: false,
    success: false,
    goal_text: 'Сохранить население > 300 000',
    nation_id: 'rome',
  };
  GS.nations.rome._crisis_plague_turns = 5; // Уже прошли 5 тиков
  const ctx = loadBoth(GS);
  // Устанавливаем население > 300k для успеха
  ctx.GAME_STATE.nations.rome.population.total = 400000;
  ctx.GAME_STATE.turn = 610;
  ctx.checkVictoryConditions();

  ok('PLAGUE success: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('PLAGUE success: success=true', ctx.GAME_STATE.active_crisis?.success === true);
  ok('PLAGUE success: _crisis_survived увеличен', ctx.GAME_STATE.nations.rome._crisis_survived >= 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 3: PLAGUE — провал (population <= 300k)');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = {
    type: 'PLAGUE',
    start_turn: 600,
    check_at: 610,
    resolved: false,
    success: false,
    goal_text: 'Сохранить население > 300 000',
    nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.nations.rome.population.total = 200000; // Население упало
  ctx.GAME_STATE.nations.rome._crisis_plague_turns = 5;
  ctx.GAME_STATE.turn = 610;
  ctx.checkVictoryConditions();

  ok('PLAGUE failure: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('PLAGUE failure: success=false', ctx.GAME_STATE.active_crisis?.success === false);
  ok('PLAGUE failure: _crisis_survived НЕ увеличен', ctx.GAME_STATE.nations.rome._crisis_survived === 0);
}

// ────────────────────────────────────────────────────────
section('БЛОК 4: FAMINE — запуск и тик');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.active_crisis = {
    type: 'FAMINE',
    start_turn: 600,
    check_at: 610,
    resolved: false,
    success: false,
    goal_text: 'Не допустить счастья < 20',
    nation_id: 'rome',
  };
  GS.nations.rome._famine_turns_left = 3;
  const ctx = loadBoth(GS);

  const happyBefore = ctx.GAME_STATE.nations.rome.population.happiness;
  ctx.GAME_STATE.turn = 601;
  ctx.checkVictoryConditions();

  ok('FAMINE tick: wheat=0', ctx.GAME_STATE.nations.rome.economy.stockpile.wheat === 0);
  ok('FAMINE tick: happiness упало', ctx.GAME_STATE.nations.rome.population.happiness < happyBefore);
  ok('FAMINE tick: _famine_turns_left уменьшился', ctx.GAME_STATE.nations.rome._famine_turns_left === 2);
}
{
  // FAMINE success: happiness >= 20
  const GS = makeGS({ population: { total: 200000, happiness: 50, by_profession: {} } });
  GS.active_crisis = {
    type: 'FAMINE',
    start_turn: 600,
    check_at: 610,
    resolved: false,
    success: false,
    goal_text: 'Не допустить счастья < 20',
    nation_id: 'rome',
  };
  GS.nations.rome._famine_turns_left = 0;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 610;
  ctx.checkVictoryConditions();

  ok('FAMINE success: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('FAMINE success: success=true', ctx.GAME_STATE.active_crisis?.success === true);
}
{
  // FAMINE failure: happiness < 20
  const GS = makeGS({ population: { total: 200000, happiness: 10, by_profession: {} } });
  GS.active_crisis = {
    type: 'FAMINE',
    start_turn: 600,
    check_at: 610,
    resolved: false,
    success: false,
    goal_text: 'Не допустить счастья < 20',
    nation_id: 'rome',
  };
  GS.nations.rome._famine_turns_left = 0;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 610;
  ctx.checkVictoryConditions();

  ok('FAMINE failure: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('FAMINE failure: success=false', ctx.GAME_STATE.active_crisis?.success === false);
}

// ────────────────────────────────────────────────────────
section('БЛОК 5: DEBT_CRISIS — тик и восстановление платежей');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.loans = [
    { nation_id: 'rome', status: 'active', monthly_payment: 1000, _original_payment: undefined },
  ];
  GS.active_crisis = {
    type: 'DEBT_CRISIS',
    start_turn: 600,
    check_at: 612,
    resolved: false,
    success: false,
    goal_text: 'Не объявлять банкротство за 12 ходов',
    nation_id: 'rome',
  };
  GS.nations.rome._debt_crisis_turns_left = 6;
  const ctx = loadBoth(GS);

  // Тик 1 (turn=601)
  ctx.GAME_STATE.turn = 601;
  ctx.checkVictoryConditions();
  ok('DEBT_CRISIS tick: _debt_crisis_turns_left уменьшился', ctx.GAME_STATE.nations.rome._debt_crisis_turns_left === 5);

  // Симулировать до конца (turn=606 → turns_left=0)
  for (let t = 602; t <= 606; t++) {
    ctx.GAME_STATE.turn = t;
    ctx.checkVictoryConditions();
  }
  ok('DEBT_CRISIS: turns_left=0 после 6 тиков', ctx.GAME_STATE.nations.rome._debt_crisis_turns_left === 0);
  // После обнуления _original_payment должен был восстановиться
  ok('DEBT_CRISIS: monthly_payment восстановлен (1000)', ctx.GAME_STATE.loans[0].monthly_payment === 1000);
}
{
  // DEBT_CRISIS success: нет новых банкротств
  const GS = makeGS();
  GS.nations.rome._bankruptcies = 0;
  GS.nations.rome._pre_crisis_bankruptcies = 0;
  GS.active_crisis = {
    type: 'DEBT_CRISIS',
    start_turn: 600,
    check_at: 612,
    resolved: false,
    success: false,
    goal_text: 'Не объявлять банкротство за 12 ходов',
    nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 612;
  ctx.checkVictoryConditions();

  ok('DEBT_CRISIS success: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('DEBT_CRISIS success: success=true (нет банкротства)', ctx.GAME_STATE.active_crisis?.success === true);
}
{
  // DEBT_CRISIS failure: было банкротство
  const GS = makeGS();
  GS.nations.rome._bankruptcies = 1;
  GS.nations.rome._pre_crisis_bankruptcies = 0;
  GS.active_crisis = {
    type: 'DEBT_CRISIS',
    start_turn: 600,
    check_at: 612,
    resolved: false,
    success: false,
    goal_text: 'Не объявлять банкротство за 12 ходов',
    nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 612;
  ctx.checkVictoryConditions();

  ok('DEBT_CRISIS failure: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('DEBT_CRISIS failure: success=false', ctx.GAME_STATE.active_crisis?.success === false);
}

// ────────────────────────────────────────────────────────
section('БЛОК 6: INVASION — запуск');
// ────────────────────────────────────────────────────────
{
  // INVASION требует наличие соседних наций
  const GS = makeGS({}, {
    nations: {
      rome: {
        _id: 'rome',
        name: 'Рим',
        economy: { treasury: 10000, income_per_turn: 5000, tax_rate: 0.1, stockpile: { wheat: 10000 } },
        military: { infantry: 5000, cavalry: 500, ships: 10, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
        population: { total: 200000, happiness: 70, by_profession: {} },
        government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 40 } },
        regions: ['r0', 'r1'],
        capital_region: 'r0',
        relations: {},
        active_laws: [],
        buildings: [],
        _bankruptcies: 0,
        _crisis_survived: 0,
      },
      carthage: {
        _id: 'carthage',
        name: 'Карфаген',
        military: { infantry: 10000, cavalry: 2000, at_war_with: [] },
        regions: ['c0', 'c1'],
      },
    },
  });
  const ctx = loadBoth(GS);
  ctx.processCrisisVeha('rome');

  ok('Кризис при наличии соседей создан', ctx.GAME_STATE.active_crisis !== null);
  // Тип может быть любым из eligible, не только INVASION
  ok('active_crisis: resolved=false', ctx.GAME_STATE.active_crisis?.resolved === false);
}
{
  // INVASION success: столица на месте
  const GS = makeGS();
  GS.active_crisis = {
    type: 'INVASION',
    start_turn: 600,
    check_at: 615,
    resolved: false,
    success: false,
    goal_text: 'Не потерять столицу за 15 ходов',
    nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.nations.rome.capital_region = 'r0';
  ctx.GAME_STATE.nations.rome.regions = ['r0', 'r1', 'r2'];
  ctx.GAME_STATE.turn = 615;
  ctx.checkVictoryConditions();

  ok('INVASION success: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('INVASION success: success=true', ctx.GAME_STATE.active_crisis?.success === true);
}
{
  // INVASION failure: потеряна столица
  const GS = makeGS();
  GS.active_crisis = {
    type: 'INVASION',
    start_turn: 600,
    check_at: 615,
    resolved: false,
    success: false,
    goal_text: 'Не потерять столицу за 15 ходов',
    nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.nations.rome.capital_region = 'r0';
  ctx.GAME_STATE.nations.rome.regions = ['r1', 'r2']; // r0 потеряна!
  ctx.GAME_STATE.turn = 615;
  ctx.checkVictoryConditions();

  ok('INVASION failure: resolved=true', ctx.GAME_STATE.active_crisis?.resolved === true);
  ok('INVASION failure: success=false', ctx.GAME_STATE.active_crisis?.success === false);
}

// ────────────────────────────────────────────────────────
section('БЛОК 7: Повторный кризис блокируется пока первый не завершён');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = {
    type: 'PLAGUE',
    start_turn: 600,
    check_at: 615,
    resolved: false,
    success: false,
    nation_id: 'rome',
  };
  const ctx = loadBoth(GS);
  ctx.processCrisisVeha('rome');
  ok('Новый кризис не запускается пока старый активен', ctx.GAME_STATE.active_crisis?.type === 'PLAGUE');
}

// ────────────────────────────────────────────────────────
section('БЛОК 8: survivor achievement после успешного кризиса');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = {
    type: 'PLAGUE',
    start_turn: 600,
    check_at: 610,
    resolved: false,
    success: false,
    nation_id: 'rome',
  };
  GS.nations.rome._crisis_plague_turns = 5;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.nations.rome.population.total = 400000; // > 300k → успех
  ctx.GAME_STATE.turn = 610;
  ctx.checkVictoryConditions();
  ctx.checkAchievements('rome'); // проверить достижение

  ok('survivor разблокирован после успешного кризиса', ctx.GAME_STATE.achievements?.rome?.survivor !== undefined);
}

// ────────────────────────────────────────────────────────
section('ИТОГ');
// ────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log(`════════════════════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
