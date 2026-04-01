'use strict';
// ── VICTORY 034: Testament + Legacy Modal chain test ─────────────────
// Полная цепочка: завещание при age>=60 → цели → смерть правителя
// → проверка целей → модал итога с результатом завещания.
// API: addTestamentGoal(goalId), removeTestamentGoal(goalId) — без nationId!
// Запуск: node tests/victory_034_testament_legacy_chain_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

function loadCtx(GS) {
  const events = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    document: {
      getElementById: id => null,
      createElement: tag => {
        const el = { tagName: tag, id:'', className:'', innerHTML:'', style:{}, children:[] };
        el.appendChild = c => el.children.push(c);
        el.querySelector = () => null;
        return el;
      },
      body: { appendChild(el) {} },
    },
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  ctx._events = events;
  return ctx;
}

function makeGS(rulerAge = 40, nationPatch = {}) {
  const n = Object.assign({
    economy: { treasury: 5000, income_per_turn: 1000, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 6000, cavalry: 500, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 60, by_profession: {} },
    government: {
      type: 'monarchy', stability: 50, legitimacy: 60,
      ruler: { name: 'Старый король', age: rulerAge },
      ruler_changed: false,
    },
    regions: ['r0', 'r1'], capital_region: 'r0',
    _bankruptcies: 0, _wars_total: 0, _ruler_start_turn: 0,
  }, nationPatch);
  return {
    turn: 50,
    player_nation: 'rome',
    nations: { rome: n },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
    player_vows: [],
    active_crisis: null,
    testament: null,
    chronicle_log: [],
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Уведомление при age=60 появляется один раз');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(60);
  const ctx = loadCtx(GS);
  ctx.checkVictoryConditions();
  ok('_testament_notified установлен при age=60', ctx.GAME_STATE.nations.rome._testament_notified === true);
  const before = ctx._events.length;
  ctx.checkVictoryConditions();
  ok('Уведомление не дублируется при повторном вызове', ctx._events.length === before);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: addTestamentGoal — максимум 3 цели (API без nationId)');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(65);
  const ctx = loadCtx(GS);
  // API: addTestamentGoal(goalId) — nationId берётся из GAME_STATE.player_nation
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  ctx.addTestamentGoal('no_loans');
  ctx.addTestamentGoal('peace_all_wars'); // 4-я — должна игнорироваться
  const goals = ctx.GAME_STATE.testament?.goals ?? [];
  ok('Не более 3 целей в завещании', goals.length <= 3);
  ok('treasury_20k добавлена', goals.some(g => g.id === 'treasury_20k'));
  ok('army_5k добавлена', goals.some(g => g.id === 'army_5k'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Цель army_5k выполнена при infantry >= 5000');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(65, { military: { infantry: 6000, cavalry: 0, at_war_with: [], mercenaries: 0 } });
  const ctx = loadCtx(GS);
  ctx.addTestamentGoal('army_5k');
  const result = ctx._evaluateTestament('rome');
  ok('_evaluateTestament не null', result !== null);
  const done = result?.done ?? 0;
  ok('army_5k выполнена (done >= 1) при infantry=6000', done >= 1);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Цель treasury_20k НЕ выполнена при treasury=5000');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(65); // treasury=5000 < 20000
  const ctx = loadCtx(GS);
  ctx.addTestamentGoal('treasury_20k');
  const result = ctx._evaluateTestament('rome');
  ok('_evaluateTestament не null', result !== null);
  ok('treasury_20k НЕ выполнена (done=0) при treasury=5000', (result?.done ?? 0) === 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: Смерть правителя → chronicle_log обновляется');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(70, { military: { infantry: 6000, cavalry: 0, at_war_with: [], mercenaries: 0 } });
  const ctx = loadCtx(GS);
  ctx.addTestamentGoal('army_5k');
  ctx.GAME_STATE.nations.rome.government.ruler_changed = true;
  ctx.checkVictoryConditions();
  ok('chronicle_log обновлён после смерти правителя', (ctx.GAME_STATE.chronicle_log?.length ?? 0) > 0);
  ok('ruler_changed сброшен', ctx.GAME_STATE.nations.rome.government.ruler_changed === false);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Для республики итог каждые 12 ходов');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(40);
  GS.nations.rome.government.type = 'republic';
  GS.turn = 12;
  const ctx = loadCtx(GS);
  ctx.checkVictoryConditions();
  ok('Итог генерируется на 12-м ходу для республики', (ctx.GAME_STATE.chronicle_log?.length ?? 0) > 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: Для монархии итог НЕ генерируется без ruler_changed');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(40);
  GS.nations.rome.government.ruler_changed = false;
  GS.turn = 50;
  const ctx = loadCtx(GS);
  ctx.checkVictoryConditions();
  ok('chronicle_log пуст без смерти монарха', (ctx.GAME_STATE.chronicle_log?.length ?? 0) === 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 8: removeTestamentGoal удаляет цель (API без nationId)');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(65);
  const ctx = loadCtx(GS);
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('army_5k');
  // removeTestamentGoal(goalId) — без nationId
  ctx.removeTestamentGoal('treasury_20k');
  const goals = ctx.GAME_STATE.testament?.goals ?? [];
  ok('treasury_20k удалена', !goals.some(g => g.id === 'treasury_20k'));
  ok('army_5k осталась', goals.some(g => g.id === 'army_5k'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 9: Уведомление НЕ появляется при age < 60');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS(45);
  const ctx = loadCtx(GS);
  ctx.checkVictoryConditions();
  ok('_testament_notified НЕ установлен при age=45', !ctx.GAME_STATE.nations.rome._testament_notified);
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
