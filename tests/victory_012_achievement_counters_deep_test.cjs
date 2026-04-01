'use strict';
// ── VICTORY 012: Achievement Counters Deep Tests ─────────────────────
// Глубокое тестирование _updateAchievementCounters, счётчиков и пограничных
// условий разблокировки достижений. 30 тестов.
// Запуск: node tests/victory_012_achievement_counters_deep_test.cjs

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
    player_nation: 'rome',
    nations: {
      rome: {
        _id: 'rome',
        name: 'Рим',
        economy:    { treasury: 5000, income_per_turn: 2000, tax_rate: 0.10, stockpile: { wheat: 10000 } },
        military:   { infantry: 3000, cavalry: 500, ships: 5, morale: 70, loyalty: 70, at_war_with: [], mercenaries: 0 },
        population: { total: 200000, happiness: 60, by_profession: { slaves: 0 } },
        government: { type: 'republic', stability: 60, legitimacy: 70,
                      ruler: { name: 'Цезарь', age: 35 }, ruler_changed: false },
        regions:    ['r1', 'r2', 'r3', 'r4', 'r5'],
        relations:  {},
        active_laws: [],
        _battles_won: 0,
        _invasions_repelled: 0,
        _bankruptcies: 0,
        _wars_declared: 0,
        _wars_total: 0,
        _last_war_turn: 0,
        _turns_in_power: 0,
        _crisis_survived: 0,
        _total_loans_taken: 0,
        _buildings_built: 0,
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
  const eventLog = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => eventLog.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._eventLog = eventLog;

  const src1 = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const src2 = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(src1, ctx);
  vm.runInContext(src2, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 1: _updateAchievementCounters — накопление за несколько ходов
// ════════════════════════════════════════════════════════════════════
section('БЛОК 1: Счётчики _turns_in_power и _last_war_turn');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;
  const n = GS.nations.rome;

  // Симулируем 5 ходов без войны
  for (let t = 1; t <= 5; t++) {
    GS.turn = t;
    checkAchievements('rome');
  }
  ok('_turns_in_power = 5 после 5 ходов', n._turns_in_power === 5);
  ok('_last_war_turn не изменился без войны', (n._last_war_turn ?? 0) === 0);

  // Ход 6: объявляем войну
  GS.turn = 6;
  n.military.at_war_with = ['carthage'];
  checkAchievements('rome');
  ok('_last_war_turn = 6 после начала войны', n._last_war_turn === 6);

  // Ход 7: война продолжается
  GS.turn = 7;
  checkAchievements('rome');
  ok('_last_war_turn = 7 пока идёт война', n._last_war_turn === 7);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 2: Счётчик _turns_without_ally
// ════════════════════════════════════════════════════════════════════
section('БЛОК 2: Счётчик _turns_without_ally и lone_wolf');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;
  const n = GS.nations.rome;

  // 50 ходов без союзников
  for (let t = 1; t <= 50; t++) {
    GS.turn = t;
    checkAchievements('rome');
  }
  ok('_turns_without_ally = 50 после 50 ходов', n._turns_without_ally >= 50);
  ok('lone_wolf разблокирован', getAchievements('rome').some(a => a.id === 'lone_wolf'));

  // Добавляем союз — счётчик сбрасывается
  GS.diplomacy.treaties.push({ status: 'active', type: 'alliance', parties: ['rome', 'sparta'] });
  GS.turn = 51;
  checkAchievements('rome');
  ok('_turns_without_ally сброшен при появлении союза', n._turns_without_ally === 0);

  // Убираем союз снова
  GS.diplomacy.treaties = [];
  GS.turn = 52;
  checkAchievements('rome');
  ok('_turns_without_ally начал накапливаться снова', n._turns_without_ally === 1);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 3: Счётчик _turns_frugal и достижение frugal
// ════════════════════════════════════════════════════════════════════
section('БЛОК 3: Счётчик frugal — казна < 1000, нет займов');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;
  const n = GS.nations.rome;

  // Условие: казна < 1000, нет займов
  n.economy.treasury = 500;

  for (let t = 1; t <= 20; t++) {
    GS.turn = t;
    checkAchievements('rome');
  }
  ok('_turns_frugal = 20', n._turns_frugal >= 20);
  ok('frugal разблокирован', getAchievements('rome').some(a => a.id === 'frugal'));

  // Теперь берём заём → счётчик сбрасывается
  GS.loans.push({ nation_id: 'rome', status: 'active', monthly_payment: 100, remaining: 5000 });
  GS.turn = 21;
  checkAchievements('rome');
  ok('_turns_frugal = 0 при появлении займа', n._turns_frugal === 0);

  // Казна поднимается выше 1000 — тоже сброс
  GS.loans = [];
  n.economy.treasury = 2000;
  GS.turn = 22;
  checkAchievements('rome');
  ok('_turns_frugal = 0 при казне >= 1000', n._turns_frugal === 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 4: Феникс — казна упала ниже 100, потом выросла выше 10000
// ════════════════════════════════════════════════════════════════════
section('БЛОК 4: Достижение phoenix — comeback из банкротства');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;
  const n = GS.nations.rome;

  // Казна упала ниже 100
  n.economy.treasury = 50;
  GS.turn = 1;
  checkAchievements('rome');
  ok('_phoenix_low установлен при treasury < 100', n._phoenix_low === true);
  ok('_phoenix_comeback ещё не установлен', !n._phoenix_comeback);

  // Казна выросла выше 10000
  n.economy.treasury = 15000;
  GS.turn = 2;
  checkAchievements('rome');
  ok('_phoenix_comeback установлен при treasury > 10000', n._phoenix_comeback === true);
  ok('comeback (Феникс) разблокирован', getAchievements('rome').some(a => a.id === 'comeback'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 5: Достижение tyrant — стабильность < 20, > 10 ходов у власти
// ════════════════════════════════════════════════════════════════════
section('БЛОК 5: Достижение tyrant');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;
  const n = GS.nations.rome;

  n.government.stability = 15;
  n._turns_in_power = 11; // уже проставляем — или через ходы

  // Нужно 11 ходов + stability < 20
  n._turns_in_power = 0;
  for (let t = 1; t <= 11; t++) {
    GS.turn = t;
    checkAchievements('rome');
  }
  ok('_turns_in_power >= 11', n._turns_in_power >= 11);
  ok('tyrant разблокирован при stability=15', getAchievements('rome').some(a => a.id === 'tyrant'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 6: Достижение peacemaker — 30 ходов без войны
// ════════════════════════════════════════════════════════════════════
section('БЛОК 6: Достижение peacemaker');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;
  const n = GS.nations.rome;

  // 31 ход без войны → _last_war_turn=0, turn=31, 0 < (31-30)=1 ✓
  for (let t = 1; t <= 31; t++) {
    GS.turn = t;
    checkAchievements('rome');
  }
  ok('peacemaker разблокирован после 31 хода без войны',
     getAchievements('rome').some(a => a.id === 'peacemaker'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 7: centurion — ход >= 100
// ════════════════════════════════════════════════════════════════════
section('БЛОК 7: centurion и veteran achievements');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;

  GS.turn = 100;
  checkAchievements('rome');
  ok('centurion разблокирован на ходу 100', getAchievements('rome').some(a => a.id === 'centurion'));

  GS.turn = 99;
  const ctx2 = makeCtx();
  const { GAME_STATE: GS2, checkAchievements: ca2, getAchievements: ga2 } = ctx2;
  GS2.turn = 99;
  ca2('rome');
  ok('centurion НЕ разблокирован на ходу 99', !ga2('rome').some(a => a.id === 'centurion'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 8: Достижение legend — 10 других достижений
// ════════════════════════════════════════════════════════════════════
section('БЛОК 8: Достижение legend (цепочка)');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements, getAchievementCount } = ctx;
  const n = GS.nations.rome;

  // Разблокируем 10 достижений разом
  n._battles_won      = 25;   // first_blood + war_machine + conqueror
  n._invasions_repelled = 3;  // iron_wall
  n._wars_declared    = 5;    // warmonger
  n.economy.treasury  = 200000; // treasurer + tax_collector
  n.population.happiness = 90; // populist
  n.regions = Array.from({ length: 25 }, (_,i) => `r${i}`); // hegemon
  GS.turn = 100;              // centurion

  checkAchievements('rome');
  const count = getAchievementCount('rome');
  ok(`разблокировано >= 10 достижений (получено ${count})`, count >= 10);
  ok('legend разблокирован', getAchievements('rome').some(a => a.id === 'legend'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 9: addEventLog вызывается при каждом новом достижении
// ════════════════════════════════════════════════════════════════════
section('БЛОК 9: eventLog при разблокировке достижений');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;
  const n = GS.nations.rome;

  n._battles_won = 1;
  GS.turn = 1;
  checkAchievements('rome');

  const achievLogs = ctx._eventLog.filter(e => e.type === 'achievement');
  ok('achievement-лог не пустой после разблокировки', achievLogs.length >= 1);
  ok('текст лога содержит иконку достижения', achievLogs.some(e => e.msg.includes('⚔️')));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 10: Достижения не дублируются при повторных вызовах
// ════════════════════════════════════════════════════════════════════
section('БЛОК 10: Идемпотентность checkAchievements');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievementCount } = ctx;
  const n = GS.nations.rome;

  n._battles_won = 1;
  checkAchievements('rome');
  const count1 = getAchievementCount('rome');
  checkAchievements('rome');
  checkAchievements('rome');
  const count2 = getAchievementCount('rome');
  ok('достижения не дублируются при повторных вызовах', count1 === count2);

  // Проверяем структуру данных достижения
  const achiev = GS.achievements['rome']['first_blood'];
  ok('достижение содержит поле turn', typeof achiev?.turn === 'number');
  ok('достижение содержит поле name', typeof achiev?.name === 'string');
  ok('достижение содержит поле icon', typeof achiev?.icon === 'string');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
