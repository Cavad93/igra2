'use strict';
// ── VICTORY 005: Unit tests — testament system ────────────────────────
// Запуск: node tests/victory_005_testament_test.cjs

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
    return null;
  },
  createElement: () => ({ style: {}, innerHTML: '', remove: () => {} }),
  body: { appendChild: () => {} },
};

function makeCtx(gsOverrides = {}) {
  const GS = {
    turn: 60,
    player_nation: 'carthage',
    nations: {
      carthage: {
        name: 'Карфаген',
        economy:    { treasury: 25000, income_per_turn: 2000, stockpile: { wheat: 5000 } },
        military:   { infantry: 6000, cavalry: 2000, ships: 80, at_war_with: [], morale: 85, loyalty: 80 },
        population: { total: 200000, happiness: 72 },
        government: { type: 'oligarchy', stability: 70, legitimacy: 80,
                      ruler: { name: 'Ганнон', age: 62 }, ruler_changed: false },
        regions:    Array.from({length: 10}, (_, i) => `r${i}`),
        relations:  {},
        active_laws: [],
        _wars_total: 1,
        _ruler_start_turn: 20,
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
    ...gsOverrides,
  };

  const logs = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => logs.push({ msg, type }),
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    _logs: logs,
  });

  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8'), ctx
  );
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8'), ctx
  );
  return ctx;
}

// ─── TEST 1: addTestamentGoal добавляет цель ──────────────────────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  ok('завещание создано', ctx.GAME_STATE.testament !== null);
  ok('цель добавлена', ctx.GAME_STATE.testament.goals.length === 1);
  ok('цель имеет id', ctx.GAME_STATE.testament.goals[0].id === 'treasury_20k');
}

// ─── TEST 2: не более 3 целей в завещании ────────────────────────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  ctx.addTestamentGoal('peace');
  ctx.addTestamentGoal('no_debt'); // 4-я — должна быть отклонена
  ok('не более 3 целей', ctx.GAME_STATE.testament.goals.length === 3);
}

// ─── TEST 3: повторная цель не добавляется ────────────────────────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('treasury_20k');
  ok('цель не дублируется', ctx.GAME_STATE.testament.goals.length === 1);
}

// ─── TEST 4: removeTestamentGoal убирает цель ────────────────────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  ctx.removeTestamentGoal('treasury_20k');
  ok('цель удалена', ctx.GAME_STATE.testament.goals.length === 1);
  ok('осталась правильная цель', ctx.GAME_STATE.testament.goals[0].id === 'army_5k');
}

// ─── TEST 5: _evaluateTestament null при отсутствии завещания ─────────
{
  const ctx = makeCtx();
  const result = ctx._evaluateTestament('carthage');
  ok('_evaluateTestament null без завещания', result === null);
}

// ─── TEST 6: _evaluateTestament treasury_20k — успех ─────────────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  // казна уже 25000 > 20000
  const result = ctx._evaluateTestament('carthage');
  ok('treasury_20k выполнена', result?.goals[0].ok === true);
  ok('done = 1', result?.done === 1);
  ok('total = 1', result?.total === 1);
  ok('all_ok = true', result?.all_ok === true);
}

// ─── TEST 7: _evaluateTestament army_5k — успех (6000 + 2000 = 8000 > 5000) ──
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('army_5k');
  const result = ctx._evaluateTestament('carthage');
  ok('army_5k выполнена', result?.goals[0].ok === true);
}

// ─── TEST 8: _evaluateTestament peace — провал (идёт война) ──────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.carthage.military.at_war_with = ['rome'];
  ctx.addTestamentGoal('peace');
  const result = ctx._evaluateTestament('carthage');
  ok('peace провалена при войне', result?.goals[0].ok === false);
}

// ─── TEST 9: _evaluateTestament no_debt — успех при нет займов ────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('no_debt');
  const result = ctx._evaluateTestament('carthage');
  ok('no_debt выполнена без займов', result?.goals[0].ok === true);
}

// ─── TEST 10: _evaluateTestament no_debt — провал с займами ──────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.loans = [
    { nation_id: 'carthage', status: 'active', remaining: 5000, monthly_payment: 100 }
  ];
  ctx.addTestamentGoal('no_debt');
  const result = ctx._evaluateTestament('carthage');
  ok('no_debt провалена с займами', result?.goals[0].ok === false);
}

// ─── TEST 11: выполнение всех целей → _testament_completed = true ────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  const result = ctx._evaluateTestament('carthage');
  ok('все цели выполнены', result?.all_ok === true);
  ok('_testament_completed установлен', ctx.GAME_STATE.nations.carthage._testament_completed === true);
}

// ─── TEST 12: getTestamentGoalDefs возвращает массив ─────────────────
{
  const ctx = makeCtx();
  const defs = ctx.getTestamentGoalDefs();
  ok('getTestamentGoalDefs[] — массив', Array.isArray(defs));
  ok('getTestamentGoalDefs длина >= 5', defs.length >= 5);
}

// ─── TEST 13: _checkTestamentAge уведомляет при >= 60 ────────────────
{
  const ctx = makeCtx();
  let notified = 0;
  ctx.addEventLog = () => { notified++; };
  ctx._checkTestamentAge('carthage'); // возраст 62
  ok('уведомление при возрасте >= 60', notified >= 1);
  ok('_testament_notified установлен', ctx.GAME_STATE.nations.carthage._testament_notified === true);
}

// ─── TEST 14: _checkTestamentAge не уведомляет дважды ────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.carthage._testament_notified = true;
  let notified = 0;
  ctx.addEventLog = () => { notified++; };
  ctx._checkTestamentAge('carthage');
  ok('повторное уведомление не происходит', notified === 0);
}

// ─── TEST 15: _checkTestamentAge НЕ уведомляет если возраст < 60 ─────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.carthage.government.ruler.age = 45;
  let notified = 0;
  ctx.addEventLog = () => { notified++; };
  ctx._checkTestamentAge('carthage');
  ok('нет уведомления при возрасте < 60', notified === 0);
}

// ─── TEST 16: alliance цель в завещании ──────────────────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.diplomacy.treaties = [{
    status: 'active', type: 'alliance', parties: ['carthage', 'numidia'],
  }];
  ctx.addTestamentGoal('alliance');
  const result = ctx._evaluateTestament('carthage');
  ok('alliance цель выполнена', result?.goals[0].ok === true);
}

// ─── TEST 17: expand_10 цель выполнена при 10 регионах ───────────────
{
  const ctx = makeCtx();
  ctx.addTestamentGoal('expand_10');
  // уже 10 регионов
  const result = ctx._evaluateTestament('carthage');
  ok('expand_10 выполнена при 10 регионах', result?.goals[0].ok === true);
}

// ─── TEST 18: expand_10 не выполнена при 5 регионах ──────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.carthage.regions = ['r1', 'r2', 'r3', 'r4', 'r5'];
  ctx.addTestamentGoal('expand_10');
  const result = ctx._evaluateTestament('carthage');
  ok('expand_10 не выполнена при 5 регионах', result?.goals[0].ok === false);
}

// ─── TEST 19: renderTestamentBlock не рендерит при возрасте < 60 ─────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.carthage.government.ruler.age = 45;
  const html = ctx.renderTestamentBlock(ctx.GAME_STATE.nations.carthage);
  ok('renderTestamentBlock возвращает пусто при возрасте < 60', html === '');
}

// ─── TEST 20: renderTestamentBlock рендерит при возрасте >= 60 ────────
{
  const ctx = makeCtx();
  const html = ctx.renderTestamentBlock(ctx.GAME_STATE.nations.carthage);
  ok('renderTestamentBlock возвращает HTML при возрасте >= 60',
    typeof html === 'string' && html.includes('Завещание'));
}

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
