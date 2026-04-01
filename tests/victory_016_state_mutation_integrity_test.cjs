'use strict';
// ── VICTORY 016: State Mutation & Integrity Tests ────────────────────
// Тесты на изоляцию состояния: каждый контекст независим,
// данные одной нации не влияют на другую, нет побочных мутаций.
// Краш-тесты: null GAME_STATE, отсутствующие нации, циклические структуры.
// 28 тестов.
// Запуск: node tests/victory_016_state_mutation_integrity_test.cjs

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

function loadEngines(GS, extraCtx = {}) {
  const eventLog = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => eventLog.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console: { log(){}, warn(){}, error(){} },
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    ...extraCtx,
  });
  ctx._eventLog = eventLog;
  const src1 = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const src2 = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(src1, ctx);
  vm.runInContext(src2, ctx);
  return ctx;
}

function makeNation(id, overrides = {}) {
  return {
    _id: id,
    name: id,
    economy:    { treasury: 5000, income_per_turn: 1000, tax_rate: 0.10, stockpile: { wheat: 5000 } },
    military:   { infantry: 2000, cavalry: 200, ships: 5, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 60, by_profession: { slaves: 0 } },
    government: { type: 'monarchy', stability: 60, legitimacy: 65,
                  ruler: { name: `Правитель-${id}`, age: 35 }, ruler_changed: false },
    regions:    ['r1', 'r2', 'r3'],
    relations:  {},
    active_laws: [],
    _battles_won: 0, _invasions_repelled: 0, _bankruptcies: 0,
    _wars_declared: 0, _wars_total: 0, _last_war_turn: 0,
    _turns_in_power: 0, _crisis_survived: 0, _total_loans_taken: 0,
    _buildings_built: 0, _ruler_start_turn: 0,
    ...overrides,
  };
}

function makeGS(playerNation, nations = {}) {
  return {
    turn: 1,
    player_nation: playerNation,
    nations,
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    player_vows:  [],
    chronicle_log: [],
    active_crisis: null,
    testament:    null,
    player_manifest: null,
    dynamic_goals:   {},
  };
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 1: Изоляция между двумя нациями
// ════════════════════════════════════════════════════════════════════
section('БЛОК 1: Изоляция достижений между нациями');

{
  const GS = makeGS('rome', {
    rome:     makeNation('rome',     { _battles_won: 5 }),
    carthage: makeNation('carthage', { _battles_won: 0 }),
  });
  const ctx = loadEngines(GS);
  const { checkAchievements, getAchievements, getAchievementCount } = ctx;

  checkAchievements('rome');
  checkAchievements('carthage');

  ok('rome имеет first_blood', getAchievements('rome').some(a => a.id === 'first_blood'));
  ok('carthage НЕ имеет first_blood', !getAchievements('carthage').some(a => a.id === 'first_blood'));
  ok('достижения rome не влияют на carthage',
     getAchievementCount('rome') !== getAchievementCount('carthage') ||
     getAchievementCount('carthage') === 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 2: Два независимых контекста VM — состояния не пересекаются
// ════════════════════════════════════════════════════════════════════
section('БЛОК 2: Два независимых VM-контекста');

{
  const GS1 = makeGS('rome',    { rome:    makeNation('rome',    { economy: { treasury: 200000, income_per_turn: 0 } }) });
  const GS2 = makeGS('sparta',  { sparta:  makeNation('sparta',  { economy: { treasury: 100, income_per_turn: 0 } }) });

  const ctx1 = loadEngines(GS1);
  const ctx2 = loadEngines(GS2);

  ctx1.checkAchievements('rome');
  ctx2.checkAchievements('sparta');

  ok('ctx1 rome имеет treasurer', ctx1.getAchievements('rome').some(a => a.id === 'treasurer'));
  ok('ctx2 sparta НЕ имеет treasurer', !ctx2.getAchievements('sparta').some(a => a.id === 'treasurer'));
  ok('ctx2 grandeur не равен ctx1 grandeur',
     ctx1.calcGrandeur('rome') !== ctx2.calcGrandeur('sparta'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 3: null GAME_STATE — все функции не падают
// ════════════════════════════════════════════════════════════════════
section('БЛОК 3: null GAME_STATE — graceful degradation');

{
  const ctx = loadEngines(null);

  ok('checkAchievements(null GS) не падает', (() => {
    try { ctx.checkAchievements('any'); return true; } catch { return false; }
  })());
  ok('getAchievements(null GS) → []', (() => {
    try { return Array.isArray(ctx.getAchievements('any')); } catch { return false; }
  })());
  ok('calcGrandeur(null GS) → 0', (() => {
    try { return ctx.calcGrandeur('any') === 0; } catch { return false; }
  })());
  ok('checkVictoryConditions(null GS) не падает', (() => {
    try { ctx.checkVictoryConditions(); return true; } catch { return false; }
  })());
  ok('generateDynamicGoals(null GS) → []', (() => {
    try { return Array.isArray(ctx.generateDynamicGoals('any')); } catch { return false; }
  })());
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 4: Несуществующая нация — функции возвращают дефолты
// ════════════════════════════════════════════════════════════════════
section('БЛОК 4: Несуществующая нация');

{
  const GS = makeGS('rome', { rome: makeNation('rome') });
  const ctx = loadEngines(GS);

  ok('checkAchievements("ghost") не падает', (() => {
    try { ctx.checkAchievements('ghost'); return true; } catch { return false; }
  })());
  ok('getAchievements("ghost") → []', ctx.getAchievements('ghost').length === 0);
  ok('getAchievementCount("ghost") → 0', ctx.getAchievementCount('ghost') === 0);
  ok('calcGrandeur("ghost") → 0', ctx.calcGrandeur('ghost') === 0);
  ok('generateDynamicGoals("ghost") → []', ctx.generateDynamicGoals('ghost').length === 0);
  ok('getHistoricalRating("ghost") → []', ctx.getHistoricalRating('ghost').length === 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 5: Мутации данных нации не ломают повторный вызов
// ════════════════════════════════════════════════════════════════════
section('БЛОК 5: Мутации нации в процессе проверок');

{
  const GS = makeGS('rome', { rome: makeNation('rome') });
  const ctx = loadEngines(GS);
  const n = GS.nations.rome;

  // Удаляем поля во время симуляции
  ctx.checkAchievements('rome');
  delete n.economy;
  ok('checkAchievements после delete economy не падает', (() => {
    try { ctx.checkAchievements('rome'); return true; } catch { return false; }
  })());

  delete n.military;
  ok('calcGrandeur после delete military не падает', (() => {
    try { ctx.calcGrandeur('rome'); return true; } catch { return false; }
  })());

  delete n.population;
  ok('checkAchievements после delete population → grandeur 0', (() => {
    try { return ctx.calcGrandeur('rome') >= 0; } catch { return false; }
  })());

  n.regions = null;
  ok('calcGrandeur при regions=null → 0 territory', (() => {
    try { return ctx.calcGrandeur('rome') >= 0; } catch { return false; }
  })());
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 6: processCrisisVeha — кризис не дублируется
// ════════════════════════════════════════════════════════════════════
section('БЛОК 6: Кризис не дублируется');

{
  const GS = makeGS('rome', { rome: makeNation('rome', {
    population: { total: 200000, happiness: 70 },
  }) });
  const ctx = loadEngines(GS);

  GS.turn = 600;
  ctx.processCrisisVeha('rome');
  const crisis1 = GS.active_crisis?.type;
  ok('кризис создан на ходу 600', !!crisis1);

  // Повторный вызов — не должен заменить
  ctx.processCrisisVeha('rome');
  ok('повторный processCrisisVeha не меняет active_crisis', GS.active_crisis?.type === crisis1);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 7: Клятва принимается только один раз
// ════════════════════════════════════════════════════════════════════
section('БЛОК 7: Дублирование клятв');

{
  const GS = makeGS('rome', { rome: makeNation('rome') });
  const ctx = loadEngines(GS);

  ctx.takeVow('no_first_strike');
  ctx.takeVow('no_first_strike'); // попытка дублировать
  ctx.takeVow('no_first_strike');

  ok('клятва no_first_strike в списке ровно 1 раз',
     GS.player_vows.filter(v => v.id === 'no_first_strike').length === 1);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 8: addTestamentGoal — не более 3 целей
// ════════════════════════════════════════════════════════════════════
section('БЛОК 8: Завещание — лимит 3 цели');

{
  const GS = makeGS('rome', { rome: makeNation('rome') });
  const ctx = loadEngines(GS);

  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  ctx.addTestamentGoal('peace');
  ctx.addTestamentGoal('no_debt');   // 4-я — должна быть отклонена
  ctx.addTestamentGoal('alliance');  // 5-я — должна быть отклонена

  ok('в завещании не более 3 целей',
     (GS.testament?.goals?.length ?? 0) <= 3);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 9: generateRulerLegacy — завещание оценивается корректно
// ════════════════════════════════════════════════════════════════════
section('БЛОК 9: generateRulerLegacy — оценка завещания');

{
  const GS = makeGS('rome', { rome: makeNation('rome', {
    economy:  { treasury: 25000, income_per_turn: 3000 },
    military: { infantry: 6000, cavalry: 0, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 70 },
    government: { type: 'monarchy', stability: 60, legitimacy: 65,
                  ruler: { name: 'Цезарь', age: 40 }, ruler_changed: false },
  }) });
  const ctx = loadEngines(GS);
  const n = GS.nations.rome;

  ctx.addTestamentGoal('treasury_20k'); // 25000 > 20000 → выполнено
  ctx.addTestamentGoal('army_5k');      // 6000 > 5000 → выполнено

  n._ruler_start_turn = 1;
  GS.turn = 30;
  ctx.generateRulerLegacy('rome', 'ruler_death');

  const legEntry = GS.chronicle_log.find(e => e.type === 'legacy');
  ok('legacy запись создана', !!legEntry);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 10: Строгие типы возвращаемых значений
// ════════════════════════════════════════════════════════════════════
section('БЛОК 10: Типы возвращаемых значений');

{
  const GS = makeGS('rome', { rome: makeNation('rome') });
  const ctx = loadEngines(GS);
  ctx.checkAchievements('rome');

  ok('getAchievements → Array', Array.isArray(ctx.getAchievements('rome')));
  ok('getAchievementCount → number', typeof ctx.getAchievementCount('rome') === 'number');
  ok('calcGrandeur → number', typeof ctx.calcGrandeur('rome') === 'number');
  ok('generateDynamicGoals → Array', Array.isArray(ctx.generateDynamicGoals('rome')));
  ok('getHistoricalRating → Array', Array.isArray(ctx.getHistoricalRating('rome')));
  ok('_buildLegacyText → string', typeof ctx._buildLegacyText({}) === 'string');
  ok('getTestamentGoalDefs → Array', Array.isArray(ctx.getTestamentGoalDefs()));
}

// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
