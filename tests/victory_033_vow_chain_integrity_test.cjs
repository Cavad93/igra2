'use strict';
// ── VICTORY 033: Vow system chain integrity test ─────────────────────
// Проверяет: взятие клятвы → нарушение → штраф → событие в хронике.
// Все 5 типов клятв, граничные случаи, двойное нарушение.
// Запуск: node tests/victory_033_vow_chain_integrity_test.cjs

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
  const memories = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: (nid, cat, text) => memories.push({ nid, cat, text }),
    document: { getElementById: () => null, createElement: () => ({ style:{} }), body: { appendChild(){} } },
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  ctx._events   = events;
  ctx._memories = memories;
  return ctx;
}

function makeGS(patch = {}) {
  const n = Object.assign({
    economy: { treasury: 5000, income_per_turn: 1000, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 1000, cavalry: 100, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 60, by_profession: { slaves: 0 } },
    government: { type: 'monarchy', stability: 50, legitimacy: 60, ruler: { name: 'Rex', age: 30 } },
    regions: ['r0'], capital_region: 'r0', _bankruptcies: 0,
    _turns_in_power: 0, _last_war_turn: 0, _wars_declared: 0,
    _loans_taken_this_turn: 0, _wars_declared_this_turn: 0,
  }, patch);
  return {
    turn: 10,
    player_nation: 'rome',
    nations: { rome: n },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
    player_vows: [],
    active_crisis: null,
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Клятва no_loans — нарушение при взятии займа (_loans_taken_this_turn)');
// ─────────────────────────────────────────────────────────────
{
  // no_loans проверяет _loans_taken_this_turn > 0
  const GS = makeGS({ _loans_taken_this_turn: 1 });
  GS.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: false }];
  const ctx = loadCtx(GS);
  const legBefore = ctx.GAME_STATE.nations.rome.government.legitimacy;
  ctx.checkVowViolations('rome');
  const vow = ctx.GAME_STATE.player_vows[0];
  ok('no_loans нарушена при _loans_taken_this_turn=1', vow.broken === true);
  ok('Легитимность снизилась на 10', ctx.GAME_STATE.nations.rome.government.legitimacy === legBefore - 10);
  ok('Событие о нарушении добавлено', ctx._events.some(e => e.type === 'danger' && e.msg?.includes('Клятва нарушена')));
  ok('Память о клятвопреступлении добавлена', ctx._memories.some(m => m.cat === 'politics'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: Клятва no_loans — НЕ нарушается без новых займов');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ _loans_taken_this_turn: 0 });
  GS.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: false }];
  GS.loans = []; // даже если займов нет — no_loans смотрит на _loans_taken_this_turn
  const ctx = loadCtx(GS);
  ctx.checkVowViolations('rome');
  ok('no_loans не нарушена без новых займов', ctx.GAME_STATE.player_vows[0].broken === false);
  ok('Нет события нарушения', !ctx._events.some(e => e.type === 'danger'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Клятва no_first_strike — нарушение при _wars_declared_this_turn');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ _wars_declared_this_turn: 1 });
  GS.player_vows = [{ id: 'no_first_strike', taken_turn: 1, broken: false }];
  const ctx = loadCtx(GS);
  ctx.checkVowViolations('rome');
  ok('no_first_strike нарушена при _wars_declared_this_turn=1', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Клятва no_mercs — нарушение при наёмниках');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ military: { infantry: 1000, cavalry: 100, at_war_with: [], mercenaries: 500 } });
  GS.player_vows = [{ id: 'no_mercs', taken_turn: 1, broken: false }];
  const ctx = loadCtx(GS);
  ctx.checkVowViolations('rome');
  ok('no_mercs нарушена при mercenaries=500', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: Сломанная клятва не штрафует повторно');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ _loans_taken_this_turn: 1 });
  GS.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: true }]; // уже сломана
  const ctx = loadCtx(GS);
  const legBefore = ctx.GAME_STATE.nations.rome.government.legitimacy;
  ctx.checkVowViolations('rome');
  ok('Повторный штраф не начисляется', ctx.GAME_STATE.nations.rome.government.legitimacy === legBefore);
  ok('Повторное событие не добавляется', ctx._events.length === 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Несколько клятв — нарушение только нарушенных');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({
    _loans_taken_this_turn: 1, // no_loans нарушена
    military: { infantry: 1000, cavalry: 100, at_war_with: [], mercenaries: 0 }, // no_mercs OK
  });
  GS.player_vows = [
    { id: 'no_loans', taken_turn: 1, broken: false },
    { id: 'no_mercs', taken_turn: 1, broken: false },
  ];
  const ctx = loadCtx(GS);
  ctx.checkVowViolations('rome');
  ok('no_loans нарушена', ctx.GAME_STATE.player_vows.find(v => v.id === 'no_loans')?.broken === true);
  ok('no_mercs не нарушена', ctx.GAME_STATE.player_vows.find(v => v.id === 'no_mercs')?.broken === false);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: checkVowViolations не падает при пустом player_vows');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.player_vows = [];
  const ctx = loadCtx(GS);
  let threw = false;
  try { ctx.checkVowViolations('rome'); } catch (e) { threw = true; }
  ok('checkVowViolations без клятв не падает', !threw);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 8: checkVowViolations не падает при null player_vows');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS();
  GS.player_vows = null;
  const ctx = loadCtx(GS);
  let threw = false;
  try { ctx.checkVowViolations('rome'); } catch (e) { threw = true; }
  ok('checkVowViolations при null не падает', !threw);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 9: no_slavery нарушается при рабах');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({
    population: { total: 100000, happiness: 60, by_profession: { slaves: 1000 } },
  });
  GS.player_vows = [{ id: 'no_slavery', taken_turn: 1, broken: false }];
  const ctx = loadCtx(GS);
  ctx.checkVowViolations('rome');
  ok('no_slavery нарушена при slaves=1000', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 10: no_taxes нарушается при высоком налоге');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({
    economy: { treasury: 5000, income_per_turn: 1000, tax_rate: 0.15, stockpile: { wheat: 1000 } },
  });
  GS.player_vows = [{ id: 'no_taxes', taken_turn: 1, broken: false }];
  const ctx = loadCtx(GS);
  ctx.checkVowViolations('rome');
  ok('no_taxes нарушена при tax_rate=0.15', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
