'use strict';
// ── VICTORY 021: Vow + Testament full chain tests ─────────────────────
// Тестирует цепочку:
//   клятва взята → нарушена → legitimacy падает → legacy text отражает факт
//   завещание создано → цели выполнены/не выполнены → оценивается в legacy
// Запуск: node tests/victory_021_vow_testament_chain_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

function makeEl() {
  return { textContent: '', style: { display: '' }, innerHTML: '', id: '', className: '', remove() {}, appendChild() {} };
}
const domStub = {
  getElementById: () => makeEl(),
  createElement: () => makeEl(),
  body: { appendChild() {} },
};

function loadBoth(GS, extraVars = {}) {
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    ...extraVars,
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
    economy: { treasury: 10000, income_per_turn: 5000, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 5000, cavalry: 500, ships: 10, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
    population: { total: 200000, happiness: 70, by_profession: {} },
    government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 40 } },
    regions: Array.from({ length: 5 }, (_, i) => `r${i}`),
    relations: {},
    active_laws: [],
    buildings: [],
    _bankruptcies: 0,
    _ruler_start_turn: 1,
    _turns_in_power: 50,
  }, nationPatch);

  return Object.assign({
    turn: 50,
    player_nation: 'rome',
    nations: { rome: nation },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
    player_vows: [],
    active_crisis: null,
  }, gsPatch);
}

// ────────────────────────────────────────────────────────
section('БЛОК 1: Взять клятву — базовые тесты');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS();
  const ctx = loadBoth(GS);
  ctx.takeVow('no_loans');
  ok('Клятва no_loans добавлена', ctx.GAME_STATE.player_vows.some(v => v.id === 'no_loans'));
  ok('Клятва не нарушена после взятия', ctx.GAME_STATE.player_vows.find(v => v.id === 'no_loans')?.broken === false);
}
{
  // Повторное взятие той же клятвы не дублирует
  const GS = makeGS();
  const ctx = loadBoth(GS);
  ctx.takeVow('no_loans');
  ctx.takeVow('no_loans');
  ok('Клятва не дублируется', ctx.GAME_STATE.player_vows.filter(v => v.id === 'no_loans').length === 1);
}
{
  // Несуществующая клятва не добавляется
  const GS = makeGS();
  const ctx = loadBoth(GS);
  ctx.takeVow('nonexistent_vow');
  ok('Несуществующая клятва не добавлена', ctx.GAME_STATE.player_vows.length === 0);
}

// ────────────────────────────────────────────────────────
section('БЛОК 2: Нарушение клятвы no_loans — падение легитимности');
// ────────────────────────────────────────────────────────
{
  // no_loans проверяет _loans_taken_this_turn > 0
  const GS = makeGS({ _loans_taken_this_turn: 1 });
  GS.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: false }];
  const ctx = loadBoth(GS);

  const legitBefore = ctx.GAME_STATE.nations.rome.government.legitimacy;
  ctx.checkVowViolations('rome');

  const vow = ctx.GAME_STATE.player_vows.find(v => v.id === 'no_loans');
  ok('no_loans нарушена при _loans_taken_this_turn=1', vow?.broken === true);
  ok('Легитимность упала на 10', ctx.GAME_STATE.nations.rome.government.legitimacy === legitBefore - 10);
}
{
  // Нарушенная клятва не вызывает повторный штраф
  const GS = makeGS({ _loans_taken_this_turn: 1 });
  GS.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: true }];
  const ctx = loadBoth(GS);

  const legitBefore = ctx.GAME_STATE.nations.rome.government.legitimacy;
  ctx.checkVowViolations('rome');
  ok('Уже нарушенная клятва не снижает легитимность повторно', ctx.GAME_STATE.nations.rome.government.legitimacy === legitBefore);
}

// ────────────────────────────────────────────────────────
section('БЛОК 3: Нарушение клятвы no_first_strike');
// ────────────────────────────────────────────────────────
{
  // no_first_strike проверяет _wars_declared_this_turn > 0
  const GS = makeGS({ _wars_declared_this_turn: 1 });
  GS.player_vows = [{ id: 'no_first_strike', taken_turn: 1, broken: false }];
  const ctx = loadBoth(GS);

  ctx.checkVowViolations('rome');
  const vow = ctx.GAME_STATE.player_vows.find(v => v.id === 'no_first_strike');
  ok('no_first_strike нарушена при _wars_declared_this_turn=1', vow?.broken === true);
}

// ────────────────────────────────────────────────────────
section('БЛОК 4: Соблюдение клятвы 100 ходов → man_of_word');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.player_vows = [{ id: 'no_loans', taken_turn: 0, broken: false }];
  GS.loans = []; // нет займов → клятва не нарушена
  GS.turn = 101;
  const ctx = loadBoth(GS);

  ctx.checkVowViolations('rome');
  ok('_vow_kept_turns >= 100 при turn=101', ctx.GAME_STATE.nations.rome._vow_kept_turns >= 100);

  ctx.checkAchievements('rome');
  ok('man_of_word разблокирован после 100 ходов соблюдения', ctx.GAME_STATE.achievements?.rome?.man_of_word !== undefined);
}

// ────────────────────────────────────────────────────────
section('БЛОК 5: Клятва no_mercs');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({
    military: { infantry: 5000, cavalry: 500, ships: 10, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 500 },
  });
  GS.player_vows = [{ id: 'no_mercs', taken_turn: 1, broken: false }];
  const ctx = loadBoth(GS);

  ctx.checkVowViolations('rome');
  const vow = ctx.GAME_STATE.player_vows.find(v => v.id === 'no_mercs');
  ok('no_mercs нарушена при mercenaries > 0', vow?.broken === true);
}
{
  const GS = makeGS({
    military: { infantry: 5000, cavalry: 500, ships: 10, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
  });
  GS.player_vows = [{ id: 'no_mercs', taken_turn: 1, broken: false }];
  const ctx = loadBoth(GS);

  ctx.checkVowViolations('rome');
  const vow = ctx.GAME_STATE.player_vows.find(v => v.id === 'no_mercs');
  ok('no_mercs НЕ нарушена при mercenaries=0', vow?.broken === false);
}

// ────────────────────────────────────────────────────────
section('БЛОК 6: Завещание — создание и добавление целей');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.testament = null;
  const ctx = loadBoth(GS);

  ctx.addTestamentGoal('treasury_20k');
  ok('Цель завещания добавлена', ctx.GAME_STATE.testament?.goals?.length === 1);
  ok('Цель = treasury_20k', ctx.GAME_STATE.testament.goals[0].id === 'treasury_20k');
}
{
  // Не более 3 целей
  const GS = makeGS();
  GS.testament = null;
  const ctx = loadBoth(GS);

  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  ctx.addTestamentGoal('peace');
  ctx.addTestamentGoal('expand_10'); // 4-я — не должна добавиться
  ok('Максимум 3 цели в завещании', ctx.GAME_STATE.testament.goals.length === 3);
}
{
  // Дублирование не добавляется
  const GS = makeGS();
  GS.testament = null;
  const ctx = loadBoth(GS);

  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('treasury_20k');
  ok('Цель не дублируется', ctx.GAME_STATE.testament.goals.filter(g => g.id === 'treasury_20k').length === 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 7: Завещание — удаление цели');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.testament = { goals: [{ id: 'treasury_20k', text: 'test' }], created_turn: 1 };
  const ctx = loadBoth(GS);

  ctx.removeTestamentGoal('treasury_20k');
  ok('Цель удалена из завещания', ctx.GAME_STATE.testament.goals.length === 0);
}

// ────────────────────────────────────────────────────────
section('БЛОК 8: Завещание — оценка при generateRulerLegacy');
// ────────────────────────────────────────────────────────
{
  // Все цели выполнены → _testament_completed=true и _ruler_start_turn обновляется
  const GS = makeGS({
    economy: { treasury: 25000, income_per_turn: 5000, tax_rate: 0.1, stockpile: {} },
    military: { infantry: 6000, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
  });
  GS.testament = {
    goals: [
      { id: 'treasury_20k', text: '💰 Оставить казну > 20 000' },
      { id: 'army_5k',      text: '⚔️ Оставить армию > 5 000' },
    ],
    created_turn: 1,
  };
  GS.nations.rome.government.ruler_changed = true;
  GS.nations.rome.government.type = 'monarchy';
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 50;
  ctx.checkVictoryConditions();

  // generateRulerLegacy обновляет _ruler_start_turn до текущего хода
  ok('generateRulerLegacy вызван: _ruler_start_turn обновлён', ctx.GAME_STATE.nations.rome._ruler_start_turn === 50);
  ok('_testament_completed=true при всех выполненных целях', ctx.GAME_STATE.nations.rome._testament_completed === true);
}
{
  // Не все цели выполнены → legacy_keeper не должен быть
  const GS = makeGS({
    economy: { treasury: 5000, income_per_turn: 5000, tax_rate: 0.1, stockpile: {} }, // treasury < 20k
    military: { infantry: 6000, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
  });
  GS.testament = {
    goals: [
      { id: 'treasury_20k', text: '💰 Оставить казну > 20 000' }, // НЕ выполнена (5k < 20k)
      { id: 'army_5k',      text: '⚔️ Оставить армию > 5 000' },  // выполнена
    ],
    created_turn: 1,
  };
  GS.nations.rome.government.ruler_changed = true;
  GS.nations.rome.government.type = 'monarchy';
  const ctx = loadBoth(GS, { showLegacyModal: () => {} });
  ctx.checkVictoryConditions();
  ok('_testament_completed=false при невыполненных целях', ctx.GAME_STATE.nations.rome._testament_completed !== true);
}

// ────────────────────────────────────────────────────────
section('БЛОК 9: _checkTestamentAge — уведомление при возрасте >= 60');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({
    government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 60 } },
  });
  const events = [];
  const ctx = loadBoth(GS, { addEventLog: (msg) => events.push(msg) });
  ctx.checkVictoryConditions();
  ok('Уведомление при возрасте=60', events.some(e => e.includes('60')));
  ok('_testament_notified=true', ctx.GAME_STATE.nations.rome._testament_notified === true);
}
{
  // Уведомление только один раз
  const GS = makeGS({
    government: { type: 'monarchy', stability: 60, legitimacy: 70, ruler: { name: 'Цезарь', age: 65 } },
  });
  GS.nations.rome._testament_notified = true;
  const events = [];
  const ctx = loadBoth(GS, { addEventLog: (msg) => events.push(msg) });
  ctx.checkVictoryConditions();
  ok('Уведомление о завещании НЕ повторяется', !events.some(e => e.includes('60') || e.includes('Завещание')));
}

// ────────────────────────────────────────────────────────
section('БЛОК 10: Полная цепочка vow + testament + legacy');
// ────────────────────────────────────────────────────────
{
  // Цепочка: взять клятву → нарушить → упала легитимность → смена правителя
  // → testament оценивается → _testament_completed корректен
  const GS = makeGS();
  GS.player_vows = [];
  GS.testament = { goals: [{ id: 'peace', text: '🕊 Закончить все войны' }], created_turn: 1 };
  GS.nations.rome.military.at_war_with = []; // Войн нет → peace выполнена
  GS.nations.rome.government.ruler_changed = true;
  GS.nations.rome._ruler_start_turn = 1;
  GS.nations.rome.government.legitimacy = 70;

  const ctx = loadBoth(GS);

  // Взять клятву и нарушить
  ctx.takeVow('no_loans');
  ctx.GAME_STATE.nations.rome._loans_taken_this_turn = 1;
  ctx.checkVowViolations('rome');

  const legitAfterViolation = ctx.GAME_STATE.nations.rome.government.legitimacy;
  ok('Легитимность упала после нарушения клятвы', legitAfterViolation < 70);

  // Смена правителя
  ctx.GAME_STATE.turn = 50;
  ctx.checkVictoryConditions();

  // _ruler_start_turn должен обновиться → подтверждает вызов generateRulerLegacy
  ok('generateRulerLegacy вызван: _ruler_start_turn=50', ctx.GAME_STATE.nations.rome._ruler_start_turn === 50);
  // peace цель: нет войн → должна быть выполнена
  ok('peace цель в завещании выполнена (_testament_completed=true)', ctx.GAME_STATE.nations.rome._testament_completed === true);
  ok('Легитимность упала до <= 60', ctx.GAME_STATE.nations.rome.government.legitimacy <= 60);
}

// ────────────────────────────────────────────────────────
section('ИТОГ');
// ────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log(`════════════════════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
