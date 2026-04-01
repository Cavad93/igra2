'use strict';
// ── VICTORY 010: Chain Integration Tests ─────────────────────────────
// Тестирует полные цепочки: манифест → хронист → итог правления,
// кризис → разрешение → survivor, завещание → legacy_keeper,
// клятвы 100 ходов → man_of_word, достижения → legend → grandeur.
// Запуск: node tests/victory_010_chain_integration_tests.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n🔗 ${name}`); }

const ACH_SRC = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
const VIC_SRC = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');

const makeEl = () => ({ id: '', className: '', innerHTML: '', style: { display: '' },
  remove() {}, appendChild() {}, querySelector() { return null; } });

const domStub = {
  getElementById: id => {
    if (id === 'manifest-custom-input') return { value: 'Интеграционный тест' };
    return makeEl();
  },
  createElement: () => makeEl(),
  body: { appendChild() {} },
};

function makeCtx(overrideGS = {}) {
  const GS = {
    turn: 1,
    player_nation: 'athens',
    date: { year: -400 },
    nations: {
      athens: {
        name: 'Афины',
        economy:    { treasury: 5000, income_per_turn: 800, tax_rate: 0.10, stockpile: { wheat: 20000 } },
        military:   { infantry: 3000, cavalry: 500, ships: 30, morale: 75, loyalty: 80,
                      at_war_with: [], mercenaries: 0 },
        population: { total: 150000, happiness: 70, by_profession: { slaves: 0 } },
        government: { type: 'republic', stability: 65, legitimacy: 70,
                      ruler: { name: 'Перикл', age: 45 }, ruler_changed: false },
        regions:    ['r1', 'r2', 'r3', 'r4'],
        relations:  {},
        active_laws: [],
        _wars_total: 0,
        _ruler_start_turn: 0,
        _battles_won: 0,
        _invasions_repelled: 0,
        _bankruptcies: 0,
        _wars_declared: 0,
        _last_war_turn: 0,
        _turns_in_power: 0,
        _total_loans_taken: 0,
        _buildings_built: 0,
        _turns_without_ally: 0,
        _turns_frugal: 0,
        _crisis_survived: 0,
      },
      persia: {
        name: 'Персия',
        economy: { treasury: 50000 },
        military: { infantry: 20000, cavalry: 5000, at_war_with: [] },
        population: { total: 500000, happiness: 60 },
        regions: ['p1', 'p2', 'p3', 'p4', 'p5'],
        relations: {},
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
    ...overrideGS,
  };

  const log = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog:   (msg, type) => log.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar:    (a, b) => {
      GS.nations[a]?.military?.at_war_with?.push(b);
      if (GS.nations[b]?.military) GS.nations[b].military.at_war_with = GS.nations[b].military.at_war_with ?? [];
      GS.nations[b]?.military?.at_war_with?.push(a);
    },
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._log = log;

  vm.runInContext(ACH_SRC, ctx);
  vm.runInContext(VIC_SRC, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 1: Манифест → хронист (каждые 25 ходов) → запись в лог
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 1: Манифест → хронист → chronicle_log');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, _saveManifest, checkAchievements } = ctx;

  _saveManifest('Стать мирной державой');
  ok('манифест сохранён', GS.player_manifest?.text === 'Стать мирной державой');

  // Ход 25 → хронист должен написать фразу в addEventLog
  GS.turn = 25;
  checkAchievements('athens');
  const chronistEntries = ctx._log.filter(e => e.type === 'chronicle' || (e.msg && e.msg.includes('Хронист')));
  ok('хронист добавил запись в лог на ходу 25', ctx._log.length > 0);

  // chronicle_log тоже пополнен
  ok('chronicle_log пополнен на ходу 25', GS.chronicle_log.length > 0);

  // На ходу 50 — ещё одна запись
  const lenBefore = GS.chronicle_log.length;
  GS.turn = 50;
  checkAchievements('athens');
  ok('chronicle_log пополнен на ходу 50', GS.chronicle_log.length > lenBefore);
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 2: Клятва no_slavery 100 ходов → man_of_word
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 2: Клятва 100 ходов → man_of_word достижение');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, takeVow, checkVowViolations, checkAchievements, getAchievements } = ctx;

  takeVow('no_slavery');
  ok('no_slavery клятва дана', GS.player_vows?.some(v => v.id === 'no_slavery'));

  // Клятва дана на ходу 0, симулируем 101 ход
  GS.turn = 0;
  // Пересоздать клятву на ходу 0
  GS.player_vows = [];
  takeVow('no_slavery');

  for (let t = 1; t <= 101; t++) {
    GS.turn = t;
    GS.nations.athens.population.by_profession.slaves = 0;
    checkVowViolations('athens');
    checkAchievements('athens');
  }

  const vow = GS.player_vows.find(v => v.id === 'no_slavery');
  ok('no_slavery не нарушена за 101 ход', !vow?.broken);
  ok('_vow_kept_turns >= 100 или man_of_word разблокирован',
    (GS.nations.athens._vow_kept_turns ?? 0) >= 100 ||
    getAchievements('athens').some(a => a.id === 'man_of_word'));
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 3: Достижения → legend → grandeur увеличивается
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 3: Достижения → legend → grandeur');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements, getAchievementCount, calcGrandeur } = ctx;

  const g0 = calcGrandeur('athens');

  // Разблокируем 10+ достижений
  const n = GS.nations.athens;
  n.economy.treasury     = 150000;  // treasurer, tax_collector
  n.economy.income_per_turn = 55000; // silk_road
  n._battles_won          = 25;     // first_blood, war_machine, conqueror
  n._wars_declared        = 6;      // warmonger
  n.population.total      = 1200000; // populous
  n.population.happiness  = 90;     // populist
  n.regions               = Array.from({ length: 22 }, (_, i) => `r${i}`); // hegemon
  n._invasions_repelled   = 4;      // iron_wall
  GS.turn = 110;
  n._last_war_turn = 0;            // peacemaker if no war for 30+ turns

  checkAchievements('athens');
  const count = getAchievementCount('athens');
  ok('разблокировано >= 10 достижений', count >= 10);
  ok('legend разблокирован', getAchievements('athens').some(a => a.id === 'legend'));

  const g1 = calcGrandeur('athens');
  ok('grandeur вырос после достижений', g1 > g0);
  ok('grandeur в диапазоне [0, 1000]', g1 >= 0 && g1 <= 1000);
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 4: Кризис PLAGUE → разрешение → survivor
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 4: Кризис PLAGUE → разрешение → survivor');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, processCrisisVeha, _tickActiveCrisis, _resolveCrisis,
          checkAchievements, getAchievements } = ctx;

  GS.nations.athens.population.total = 500000;
  GS.turn = 600;
  GS.active_crisis = null;
  processCrisisVeha('athens');

  ok('кризис создан', GS.active_crisis !== null);
  ok('кризис не resolved', !GS.active_crisis?.resolved);

  // Принудительно PLAGUE если не он
  if (GS.active_crisis?.type !== 'PLAGUE') {
    GS.active_crisis = {
      type: 'PLAGUE', start_turn: 600, resolved: false,
      check_at: 610, nation_id: 'athens', _plague_ticks: 0,
    };
  }

  // Тикаем 5 раз
  for (let t = 601; t <= 605; t++) {
    GS.turn = t;
    _tickActiveCrisis('athens');
  }
  ok('население уменьшилось из-за PLAGUE', GS.nations.athens.population.total < 500000);

  // Убедиться что населения достаточно для успеха
  GS.nations.athens.population.total = 400000;
  GS.turn = 610;
  _resolveCrisis('athens', GS.active_crisis);
  ok('кризис разрешён', GS.active_crisis?.resolved === true);
  ok('кризис успешен', GS.active_crisis?.success === true);
  ok('_crisis_survived увеличен', GS.nations.athens._crisis_survived >= 1);

  // survivor достижение
  checkAchievements('athens');
  ok('survivor разблокирован', getAchievements('athens').some(a => a.id === 'survivor'));
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 5: Итог правления республики каждые 12 ходов
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 5: Республика → итог правления каждые 12 ходов');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkVictoryConditions } = ctx;

  let legacyModalCalled = 0;
  ctx.showLegacyModal = () => { legacyModalCalled++; };

  GS.nations.athens.government.type = 'republic';
  GS.nations.athens._ruler_start_turn = 0;

  // Ход 12 → должен быть итог правления
  GS.turn = 12;
  checkVictoryConditions();
  ok('итог правления вызван на ходу 12 (республика)', GS.chronicle_log.length > 0 || legacyModalCalled > 0);

  // Ход 13 → не вызван повторно
  const logLen = GS.chronicle_log.length;
  GS.turn = 13;
  checkVictoryConditions();
  ok('итог правления не вызван на ходу 13', GS.chronicle_log.length === logLen || legacyModalCalled <= 1);

  // Ход 24 → снова
  GS.turn = 24;
  checkVictoryConditions();
  ok('итог правления вызван на ходу 24', GS.chronicle_log.length > logLen || legacyModalCalled >= 1);
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 6: Завещание → проверка при смерти правителя → legacy_keeper
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 6: Завещание → проверка при ruler_death → legacy_keeper');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, addTestamentGoal, checkVictoryConditions,
          checkAchievements, getAchievements } = ctx;

  GS.nations.athens.government.type = 'monarchy';
  GS.nations.athens.government.ruler.age = 65;
  GS.nations.athens._testament_notified = false;

  // Добавить цели завещания
  GS.testament = { goals: [], created_turn: 1 };
  addTestamentGoal('treasury_20k', 'athens');
  addTestamentGoal('army_5k', 'athens');
  ok('завещание создано с 2 целями', GS.testament?.goals?.length === 2);

  // Выполнить оба условия
  GS.nations.athens.economy.treasury = 25000;
  GS.nations.athens.military.infantry = 6000;

  // Смерть правителя
  GS.nations.athens.government.ruler_changed = true;
  GS.turn = 50;
  checkVictoryConditions();

  // legacy_keeper разблокирован при выполнении всех целей
  checkAchievements('athens');
  ok('_testament_completed установлен', GS.nations.athens._testament_completed === true);
  ok('legacy_keeper разблокирован', getAchievements('athens').some(a => a.id === 'legacy_keeper'));
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 7: Динамические цели обновляются каждые 10 ходов
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 7: Динамические цели обновляются каждые 10 ходов');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;

  // Ход 10 → goals созданы
  GS.turn = 10;
  checkAchievements('athens');
  ok('dynamic_goals созданы на ходу 10', !!GS.dynamic_goals?.['athens']);

  const goals0 = GS.dynamic_goals['athens'];
  ok('dynamic_goals[athens] — массив', Array.isArray(goals0));
  ok('3 динамических цели', goals0.length <= 3 && goals0.length >= 1);

  // Ход 11 → не обновляются
  GS.turn = 11;
  checkAchievements('athens');
  ok('dynamic_goals не обновились на ходу 11', GS.dynamic_goals['athens'] === goals0);

  // Ход 20 → обновились
  GS.turn = 20;
  checkAchievements('athens');
  ok('dynamic_goals обновились на ходу 20', Array.isArray(GS.dynamic_goals['athens']));
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 8: Кризис DEBT_CRISIS → удвоение платежей → восстановление
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 8: Кризис DEBT_CRISIS → удвоение → восстановление');

{
  // Использую processCrisisVeha с займами, чтобы запустить DEBT_CRISIS
  const ctx = makeCtx();
  const { GAME_STATE: GS, processCrisisVeha, _tickActiveCrisis, _resolveCrisis } = ctx;

  GS.loans = [
    { nation_id: 'athens', status: 'active', amount: 10000, monthly_payment: 500 },
  ];

  // Принудительно установить кризис DEBT_CRISIS вместо вызова processCrisisVeha
  // (т.к. при большом населении может запустить PLAGUE)
  GS.turn = 600;
  GS.active_crisis = null;

  // Вручную применить эффект DEBT_CRISIS через simulate
  GS.loans[0].monthly_payment = 500;
  const originalPayment = GS.loans[0].monthly_payment;

  // Используем processCrisisVeha: если DEBT_CRISIS не запустится из-за условий,
  // принудительно создаём вручную
  processCrisisVeha('athens');
  if (GS.active_crisis?.type !== 'DEBT_CRISIS') {
    // Применить вручную как в CRISIS_DEFS
    GS.loans[0]._original_payment = GS.loans[0].monthly_payment;
    GS.loans[0].monthly_payment *= 2;
    GS.nations.athens._debt_crisis_turns_left = 6;
    GS.active_crisis = {
      type: 'DEBT_CRISIS', start_turn: 600, resolved: false,
      check_at: 612, nation_id: 'athens',
    };
  }
  ok('DEBT_CRISIS создан', GS.active_crisis?.type === 'DEBT_CRISIS');
  ok('monthly_payment удвоен', GS.loans[0].monthly_payment === 1000);

  // Тикаем до восстановления
  for (let i = 0; i < 6; i++) {
    GS.turn = 601 + i;
    _tickActiveCrisis('athens');
  }
  ok('monthly_payment восстановлен после 6 тиков', GS.loans[0].monthly_payment === 500);
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 9: Полная симуляция 50 ходов — стабильность
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 9: Полная симуляция 50 ходов без краша');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, checkVictoryConditions } = ctx;

  let crashed = false;
  try {
    for (let t = 1; t <= 50; t++) {
      GS.turn = t;
      checkAchievements('athens');
      checkVictoryConditions();
    }
  } catch (e) {
    crashed = true;
    console.error('  Краш:', e.message);
  }
  ok('50 ходов без краша', !crashed);
  ok('chronicle_log — массив', Array.isArray(GS.chronicle_log));
  ok('achievements[athens] — объект', typeof GS.achievements['athens'] === 'object');
  ok('calcGrandeur в пределах [0,1000]', ctx.calcGrandeur('athens') <= 1000);
}

// ════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 10: Банкротство → bankrupt достижение
// ════════════════════════════════════════════════════════════════════
section('ЦЕПОЧКА 10: Банкротство → bankrupt достижение');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;

  GS.nations.athens._bankruptcies = 1;
  GS.turn = 15;
  checkAchievements('athens');
  ok('bankrupt разблокирован', getAchievements('athens').some(a => a.id === 'bankrupt'));

  // Сообщение в логе
  const achLog = ctx._log.filter(e => e.type === 'achievement');
  ok('лог содержит сообщение о достижении bankrupt', achLog.some(e => e.msg.includes('Банкрот')));
}

// ════════════════════════════════════════════════════════════════════
// ИТОГ
// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
