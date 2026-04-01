'use strict';
// ── VICTORY 006: Full integration chain tests ─────────────────────────
// Тестирует полную цепочку: достижения → величие → манифест → цели →
//   клятвы → хроника → итог правления → кризис → завещание
// Запуск: node tests/victory_006_integration_chain_test.cjs

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
    if (id === 'testament-modal') return { style: { display: 'none' } };
    if (id === 'testament-modal-content') return { innerHTML: '' };
    if (id === 'manifest-custom-input') return { value: 'Завоевать весь мир' };
    return null;
  },
  createElement: tag => ({
    id: '', className: '', innerHTML: '', style: {},
    remove() {}, appendChild() {},
  }),
  body: { appendChild() {} },
};

function makeFullCtx() {
  const GS = {
    turn: 1,
    player_nation: 'syracuse',
    date: { year: -310 },
    nations: {
      syracuse: {
        name: 'Сиракузы',
        economy:    { treasury: 3000, income_per_turn: 500, tax_rate: 0.10, stockpile: { wheat: 10000 } },
        military:   { infantry: 2000, cavalry: 300, ships: 20, at_war_with: [], morale: 75, loyalty: 70, mercenaries: 0 },
        population: { total: 80000, happiness: 60, by_profession: { slaves: 0 } },
        government: { type: 'tyranny', stability: 55, legitimacy: 65, ruler: { name: 'Агафокл', age: 40 },
                      ruler_changed: false },
        regions:    ['r1', 'r2', 'r3'],
        relations:  {},
        active_laws: [],
        _wars_total: 0,
        _ruler_start_turn: 0,
        _battles_won: 0,
      },
      carthage: {
        name: 'Карфаген',
        economy: { treasury: 8000 },
        military: { infantry: 10000, cavalry: 2000, at_war_with: [] },
        population: { total: 300000, happiness: 65 },
        regions: ['c1', 'c2', 'c3', 'c4'],
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
  };

  const eventLog = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => eventLog.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: (a, b) => {
      GS.nations[a]?.military?.at_war_with?.push(b);
      GS.nations[b]?.military?.at_war_with?.push(a);
    },
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    _eventLog: eventLog,
  });

  vm.runInContext(fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8'), ctx);
  return ctx;
}

// ─── CHAIN 1: Манифест → Достижения → Величие → 100 ходов ────────────
{
  console.log('\n  === Цепочка 1: манифест → достижения → величие ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;

  // Ход 1: установить манифест
  ctx._saveManifest('Объединить Сицилию');
  ok('манифест установлен', GS.player_manifest?.text === 'Объединить Сицилию');

  // Ход 1: checkAchievements
  ctx.checkAchievements('syracuse');
  const g0 = ctx.calcGrandeur('syracuse');
  ok('величие >= 0', g0 >= 0);

  // Ход 100: разблокировать centurion
  GS.turn = 100;
  ctx.checkAchievements('syracuse');
  ok('centurion на ходу 100', !!GS.achievements.syracuse?.centurion);

  // Ход 25: проверить хронист (через _tickManifest)
  GS.turn = 25;
  let manifestLogCount = 0;
  ctx.addEventLog = (msg, type) => { if (type === 'info' && msg.includes('Летописец')) manifestLogCount++; };
  ctx._tickManifest('syracuse');
  ok('хронист оценивает манифест на ходу 25', manifestLogCount >= 1);
}

// ─── CHAIN 2: Клятвы → Нарушение → Штраф ─────────────────────────────
{
  console.log('\n  === Цепочка 2: клятвы → нарушение → легитимность ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;

  ctx.takeVow('no_first_strike');
  ctx.takeVow('no_loans');
  ok('2 клятвы взяты', GS.player_vows.length === 2);

  const origLeg = GS.nations.syracuse.government.legitimacy;
  GS.nations.syracuse._wars_declared_this_turn = 1; // первый удар
  ctx.checkVowViolations('syracuse');
  ok('no_first_strike нарушена', GS.player_vows.find(v => v.id === 'no_first_strike')?.broken === true);
  ok('легитимность снизилась', GS.nations.syracuse.government.legitimacy < origLeg);

  // no_loans ещё не нарушена
  ok('no_loans ещё цела', GS.player_vows.find(v => v.id === 'no_loans')?.broken === false);
}

// ─── CHAIN 3: Кризис → Разрешение → Достижение ───────────────────────
{
  console.log('\n  === Цепочка 3: кризис → разрешение → survivor ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;

  GS.turn = 600;
  GS.nations.syracuse.population.total = 200000;

  ctx.processCrisisVeha('syracuse');
  ok('кризис запущен на ходу 600', GS.active_crisis !== null);

  // Симулировать успех (население достаточно)
  GS.nations.syracuse.population.total = 400000;
  GS.turn = GS.active_crisis.check_at;

  let successLogged = false;
  ctx.addEventLog = (msg, type) => { if (type === 'success') successLogged = true; };
  ctx._resolveCrisis('syracuse', GS.active_crisis);
  ok('кризис разрешён успешно', GS.active_crisis.resolved === true);
  ok('successLog при успехе', successLogged);
  ok('_crisis_survived увеличен', GS.nations.syracuse._crisis_survived >= 1);
}

// ─── CHAIN 4: Итог правления → Завещание ──────────────────────────────
{
  console.log('\n  === Цепочка 4: итог правления + завещание ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;

  // Установить возраст правителя >= 60 и взять завещание
  GS.nations.syracuse.government.ruler.age = 65;
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');

  GS.nations.syracuse.economy.treasury = 25000;
  GS.nations.syracuse.military.infantry = 6000;
  GS.nations.syracuse.military.cavalry = 1000;

  // Триггер итога правления
  GS.nations.syracuse.government.ruler_changed = true;
  GS.nations.syracuse.government.type = 'monarchy';
  let legacyShown = false;
  const origShowLegacy = ctx.showLegacyModal;
  ctx.showLegacyModal = (text, data, testament) => {
    legacyShown = true;
    ok('текст итога — строка', typeof text === 'string' && text.length > 0);
    ok('завещание в итоге', testament !== null);
    ok('завещание выполнено', testament?.all_ok === true);
  };

  ctx.checkVictoryConditions();
  ok('итог правления показан (ruler_changed)', legacyShown);
}

// ─── CHAIN 5: 50 достижений (проверяем через максимальное разблокирование)
{
  console.log('\n  === Цепочка 5: все достижения доступны ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;
  const n = GS.nations.syracuse;

  // Установить все условия для максимального разблокирования
  n.economy.treasury         = 999999;
  n.economy.income_per_turn  = 999999;
  n.military.infantry        = 999999;
  n.military.cavalry         = 999999;
  n.military.ships           = 300;
  n.population.total         = 1500000;
  n.population.happiness     = 95;
  n.government.stability     = 91;
  n.government.legitimacy    = 91;
  n.regions                  = Array.from({length: 35}, (_, i) => `r${i}`);
  n._battles_won             = 25;
  n._wars_declared           = 6;
  n._invasions_repelled      = 4;
  n._bankruptcies            = 1;
  n._buildings_built         = 25;
  n._laws_enacted            = 6;
  n._total_loans_taken       = 60000;
  n._crisis_survived         = 3;
  n._phoenix_comeback        = true;
  n._turns_high_stability    = 15;
  n._testament_completed     = true;
  n._vow_kept_turns          = 105;
  GS.turn                    = 350;
  GS.loans                   = []; // no active loans

  ctx.checkAchievements('syracuse');
  ctx.checkAchievements('syracuse'); // second pass for 'legend'
  ctx.checkAchievements('syracuse'); // third for 'perfect_ruler'

  const count = ctx.getAchievementCount('syracuse');
  ok('разблокировано более 20 достижений', count >= 20);
  ok('getAchievements возвращает массив с id', ctx.getAchievements('syracuse').every(a => a.id));
}

// ─── CHAIN 6: Олигархия — итог каждые 24 хода ─────────────────────────
{
  console.log('\n  === Цепочка 6: олигархия → итог каждые 24 хода ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;
  GS.nations.syracuse.government.type = 'oligarchy';
  GS.turn = 24;
  let legacyCalled = 0;
  ctx.generateRulerLegacy = () => { legacyCalled++; };
  ctx.checkVictoryConditions();
  ok('для олигархии итог на ходу 24', legacyCalled === 1);
}

// ─── CHAIN 7: Динамические цели → прогресс ────────────────────────────
{
  console.log('\n  === Цепочка 7: динамические цели → прогресс обновляется ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;

  GS.turn = 10;
  GS.nations.syracuse.economy.treasury = 10000;
  ctx._tickDynamicGoals('syracuse');

  const goals = GS.dynamic_goals['syracuse'];
  ok('dynamic_goals сохранены', Array.isArray(goals));
  ok('прогресс — число', goals.every(g => typeof g.progress === 'number'));
  ok('completed — boolean', goals.every(g => typeof g.completed === 'boolean'));
}

// ─── CHAIN 8: Хроника накапливается за 100 ходов ──────────────────────
{
  console.log('\n  === Цепочка 8: хроника за 4 периода ===');
  const ctx = makeFullCtx();
  const GS = ctx.GAME_STATE;

  for (const turn of [25, 50, 75, 100]) {
    GS.turn = turn;
    ctx._tickChronicle('syracuse');
  }
  ok('4 записи в летописи', GS.chronicle_log.length === 4);
  ok('все записи имеют turn', GS.chronicle_log.every(e => typeof e.turn === 'number'));
  ok('все записи имеют text', GS.chronicle_log.every(e => typeof e.text === 'string'));
}

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
