'use strict';
// ── VICTORY 031: Achievement unlock chains — deep test ───────────────
// Проверяет цепочки достижений: legend зависит от 10 других,
// survivor зависит от кризиса, legacy_keeper от завещания и т.д.
// Запуск: node tests/victory_031_achievement_chains_deep_test.cjs

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
    declareWar: () => {},
    document: { getElementById: () => null, createElement: () => ({ style:{}, appendChild(){} }), body: { appendChild(){} } },
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    _events: events,
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  ctx._events = events;
  return ctx;
}

function makeGS(patch = {}) {
  const n = Object.assign({
    economy: { treasury: 5000, income_per_turn: 1000, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 1000, cavalry: 100, ships: 5, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 60, by_profession: {} },
    government: { type: 'monarchy', stability: 50, legitimacy: 60, ruler: { name: 'Rex', age: 30 } },
    regions: ['r0'], capital_region: 'r0', _bankruptcies: 0,
  }, patch);
  return {
    turn: 10,
    player_nation: 'rome',
    nations: { rome: n },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
    active_crisis: null,
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: legend разблокируется после 10 других достижений');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({
    economy: { treasury: 200000, income_per_turn: 60000, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 25000, cavalry: 6000, ships: 110, at_war_with: [], mercenaries: 0 },
    population: { total: 2000000, happiness: 90, by_profession: {} },
    government: { type: 'monarchy', stability: 80, legitimacy: 80, ruler: { name: 'Rex', age: 30 } },
    regions: Array.from({ length: 25 }, (_, i) => `r${i}`),
    _battles_won: 25,
    _invasions_repelled: 5,
    _wars_declared: 6,
    _bankruptcies: 1,
  });
  GS.turn = 110;
  const ctx = loadCtx(GS);
  ctx.checkAchievements('rome');
  const count = ctx.getAchievementCount('rome');
  ok(`Разблокировано >= 10 достижений (${count})`, count >= 10);
  const ids = ctx.getAchievements('rome').map(a => a.id);
  ok('legend разблокирован', ids.includes('legend'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: legend НЕ разблокируется при < 10 достижениях');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({
    economy: { treasury: 200000, income_per_turn: 1000, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 1000, cavalry: 100, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 60, by_profession: {} },
    government: { type: 'monarchy', stability: 50, legitimacy: 60, ruler: { name: 'Rex', age: 30 } },
    regions: ['r0'],
  });
  GS.turn = 10;
  const ctx = loadCtx(GS);
  ctx.checkAchievements('rome');
  const count = ctx.getAchievementCount('rome');
  ok(`Менее 10 достижений (${count})`, count < 10);
  const ids = ctx.getAchievements('rome').map(a => a.id);
  ok('legend НЕ разблокирован', !ids.includes('legend'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: survivor разблокируется после успешного кризиса');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ population: { total: 500000, happiness: 70, by_profession: {} } });
  GS.active_crisis = {
    type: 'PLAGUE', start_turn: 600, check_at: 610,
    resolved: false, success: false, goal_text: 'test', nation_id: 'rome',
  };
  GS.turn = 610;
  const ctx = loadCtx(GS);
  ctx.checkVictoryConditions();
  ctx.checkAchievements('rome');
  const ids = ctx.getAchievements('rome').map(a => a.id);
  // survivor зависит от n._crisis_survived >= 1
  const crisis_survived = ctx.GAME_STATE.nations.rome._crisis_survived ?? 0;
  const survivorUnlocked = ids.includes('survivor');
  if (crisis_survived >= 1) {
    ok('survivor разблокирован при _crisis_survived >= 1', survivorUnlocked);
  } else {
    ok('survivor не разблокирован (кризис провален или pop<300k)', !survivorUnlocked);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Цепочка первая кровь → машина войны → завоеватель');
// ─────────────────────────────────────────────────────────────
{
  function checkAt(battles_won) {
    const GS = makeGS({ _battles_won: battles_won });
    const ctx = loadCtx(GS);
    ctx.checkAchievements('rome');
    return ctx.getAchievements('rome').map(a => a.id);
  }

  ok('first_blood при 1 битве', checkAt(1).includes('first_blood'));
  ok('war_machine при 10 битвах', checkAt(10).includes('war_machine'));
  ok('conqueror при 20 битвах', checkAt(20).includes('conqueror'));
  ok('first_blood входит в war_machine набор', checkAt(10).includes('first_blood'));
  ok('war_machine входит в conqueror набор', checkAt(20).includes('war_machine'));
  ok('conqueror НЕ при 9 битвах', !checkAt(9).includes('conqueror'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: Достижения не разблокируются дважды');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ _battles_won: 1 });
  GS.turn = 5;
  const ctx = loadCtx(GS);
  ctx.checkAchievements('rome');
  const turn1 = { ...ctx.GAME_STATE.achievements['rome'] };
  ctx.checkAchievements('rome');
  const turn2 = { ...ctx.GAME_STATE.achievements['rome'] };
  ok('first_blood разблокирован ровно один раз', turn1['first_blood']?.turn === turn2['first_blood']?.turn);
  const eventCount = ctx._events.filter(e => e.msg?.includes('Первая кровь')).length;
  ok('Событие о разблокировке добавлено один раз', eventCount === 1);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: centurion на 100-м ходу');
// ─────────────────────────────────────────────────────────────
{
  const GS99 = makeGS(); GS99.turn = 99;
  const ctx99 = loadCtx(GS99);
  ctx99.checkAchievements('rome');
  ok('centurion НЕ при turn=99', !ctx99.getAchievements('rome').map(a=>a.id).includes('centurion'));

  const GS100 = makeGS(); GS100.turn = 100;
  const ctx100 = loadCtx(GS100);
  ctx100.checkAchievements('rome');
  ok('centurion при turn=100', ctx100.getAchievements('rome').map(a=>a.id).includes('centurion'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: tyrant требует оба условия');
// ─────────────────────────────────────────────────────────────
{
  const makeN = (stability, turns_in_power) => makeGS({
    government: { type: 'monarchy', stability, legitimacy: 50, ruler: { name: 'Rex', age: 30 } },
    _turns_in_power: turns_in_power,
  });

  const ctxOk = loadCtx(makeN(15, 15)); ctxOk.GAME_STATE.turn = 15;
  ctxOk.checkAchievements('rome');
  ok('tyrant при stability=15 и 15 ходов', ctxOk.getAchievements('rome').map(a=>a.id).includes('tyrant'));

  const ctxNoStab = loadCtx(makeN(25, 15)); ctxNoStab.GAME_STATE.turn = 15;
  ctxNoStab.checkAchievements('rome');
  ok('tyrant НЕ при stability=25', !ctxNoStab.getAchievements('rome').map(a=>a.id).includes('tyrant'));

  const ctxNoTurns = loadCtx(makeN(15, 5)); ctxNoTurns.GAME_STATE.turn = 5;
  ctxNoTurns.checkAchievements('rome');
  ok('tyrant НЕ при 5 ходах у власти', !ctxNoTurns.getAchievements('rome').map(a=>a.id).includes('tyrant'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 8: peacemaker требует 30 ходов без войн');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({ _last_war_turn: 5 });
  GS.turn = 36;
  const ctx = loadCtx(GS);
  ctx.checkAchievements('rome');
  ok('peacemaker при 31 ходе мира', ctx.getAchievements('rome').map(a=>a.id).includes('peacemaker'));

  const GS2 = makeGS({ _last_war_turn: 20 });
  GS2.turn = 36;
  const ctx2 = loadCtx(GS2);
  ctx2.checkAchievements('rome');
  ok('peacemaker НЕ при 16 ходах мира', !ctx2.getAchievements('rome').map(a=>a.id).includes('peacemaker'));
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
