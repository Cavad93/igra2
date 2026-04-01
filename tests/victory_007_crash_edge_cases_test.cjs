'use strict';
// ── VICTORY 007: Crash tests + edge cases ────────────────────────────
// Запуск: node tests/victory_007_crash_edge_cases_test.cjs

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
  getElementById: () => null,
  createElement: () => ({ style: {}, innerHTML: '', remove: () => {}, appendChild: () => {} }),
  body: { appendChild: () => {} },
};

function makeMinimalCtx(gsOverrides = {}) {
  const GS = { turn: 1, player_nation: 'test', nations: {}, achievements: {}, ...gsOverrides };
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8'), ctx);
  return ctx;
}

function doesNotThrow(label, fn) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; console.error(`  ❌ THREW: ${label}`, e.message); }
  ok(label, !threw);
}

// ─── CRASH: checkAchievements с null GS ──────────────────────────────
doesNotThrow('checkAchievements(null GS)', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE = null;
  ctx.checkAchievements('test');
});

// ─── CRASH: checkAchievements с undefined nationId ───────────────────
doesNotThrow('checkAchievements(undefined nationId)', () => {
  const ctx = makeMinimalCtx();
  ctx.checkAchievements(undefined);
});

// ─── CRASH: calcGrandeur с null GS ───────────────────────────────────
doesNotThrow('calcGrandeur(null GS)', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE = null;
  ctx.calcGrandeur('test');
});

// ─── CRASH: calcGrandeur с несуществующей нацией ─────────────────────
doesNotThrow('calcGrandeur(missing nation)', () => {
  const ctx = makeMinimalCtx();
  const r = ctx.calcGrandeur('nonexistent');
  ok('calcGrandeur возвращает 0 для несуществующей', r === 0);
});

// ─── CRASH: generateDynamicGoals при нет нации ───────────────────────
doesNotThrow('generateDynamicGoals(missing nation)', () => {
  const ctx = makeMinimalCtx();
  const goals = ctx.generateDynamicGoals('nonexistent');
  ok('generateDynamicGoals [] при нет нации', Array.isArray(goals) && goals.length === 0);
});

// ─── CRASH: checkVowViolations без player_vows ────────────────────────
doesNotThrow('checkVowViolations без player_vows', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.player_vows = undefined;
  ctx.GAME_STATE.nations.test = {
    economy: {}, military: { at_war_with: [] }, government: {},
    population: { by_profession: {} },
  };
  ctx.checkVowViolations('test');
});

// ─── CRASH: checkVictoryConditions при пустом GS ─────────────────────
doesNotThrow('checkVictoryConditions при пустом GS', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE = { turn: 1, player_nation: null, nations: {} };
  ctx.checkVictoryConditions();
});

// ─── CRASH: generateRulerLegacy при нет нации ────────────────────────
doesNotThrow('generateRulerLegacy при нет нации', () => {
  const ctx = makeMinimalCtx();
  ctx.generateRulerLegacy('nonexistent', 'ruler_death');
});

// ─── CRASH: processCrisisVeha при нет нации ──────────────────────────
doesNotThrow('processCrisisVeha при нет нации', () => {
  const ctx = makeMinimalCtx();
  ctx.processCrisisVeha('nonexistent');
});

// ─── CRASH: _tickActiveCrisis без active_crisis ───────────────────────
doesNotThrow('_tickActiveCrisis без active_crisis', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.active_crisis = null;
  ctx._tickActiveCrisis('test');
});

// ─── CRASH: _evaluateTestament без testament ─────────────────────────
doesNotThrow('_evaluateTestament без testament', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.testament = null;
  const r = ctx._evaluateTestament('test');
  ok('_evaluateTestament возвращает null', r === null);
});

// ─── CRASH: addTestamentGoal с неизвестным id ───────────────────────
doesNotThrow('addTestamentGoal с неизвестным id', () => {
  const ctx = makeMinimalCtx();
  ctx.addTestamentGoal('completely_unknown_goal_id');
});

// ─── CRASH: getAchievements с null GS ───────────────────────────────
doesNotThrow('getAchievements с null GS', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE = null;
  const r = ctx.getAchievements('test');
  ok('getAchievements[] при null GS', Array.isArray(r) && r.length === 0);
});

// ─── CRASH: checkAchievements при сломанных данных нации ─────────────
// (проверяем что engine не падает при нестандартных структурах)
doesNotThrow('checkAchievements с частично сломанными данными нации', () => {
  const ctx = makeMinimalCtx();
  // Намеренно сломанные данные: вложенные null
  ctx.GAME_STATE.nations.test = {
    economy: null,
    military: null,
    population: null,
    government: null,
    regions: null,
    active_laws: null,
  };
  ctx.checkAchievements('test');
});

// ─── EDGE: calcGrandeur при нулевых значениях ────────────────────────
{
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.nations.test = {
    economy: { treasury: 0, income_per_turn: 0 },
    military: { infantry: 0, cavalry: 0, at_war_with: [] },
    population: { total: 0, happiness: 0 },
    government: { stability: 0 },
    regions: [],
  };
  const g = ctx.calcGrandeur('test');
  ok('calcGrandeur = 0 при нулевых данных', g === 0);
}

// ─── EDGE: getAchievementCount при пустых достижениях ────────────────
{
  const ctx = makeMinimalCtx();
  const count = ctx.getAchievementCount('test');
  ok('getAchievementCount = 0 по умолчанию', count === 0);
}

// ─── EDGE: checkVictoryConditions не создаёт дублирующий кризис ──────
{
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.nations.test = {
    economy: { treasury: 5000, stockpile: { wheat: 10000 } },
    military: { infantry: 1000, cavalry: 200, at_war_with: [] },
    population: { total: 200000, happiness: 60 },
    government: { type: 'monarchy', stability: 60, legitimacy: 65, ruler: { name: 'Тест' } },
    regions: ['r1'],
    active_laws: [],
  };
  ctx.GAME_STATE.turn = 600;
  ctx.GAME_STATE.active_crisis = null;
  ctx.checkVictoryConditions();
  const firstType = ctx.GAME_STATE.active_crisis?.type;
  ctx.checkVictoryConditions(); // повторно
  ok('тип кризиса не изменился', ctx.GAME_STATE.active_crisis?.type === firstType);
}

// ─── EDGE: chronicle_log удаляет старые записи ────────────────────────
{
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.chronicle_log = Array.from({length: 50}, (_, i) => ({ turn: i, text: `entry${i}` }));
  ctx._addChronicleEntry({ text: 'new_entry' });
  ok('первая запись удалена', !ctx.GAME_STATE.chronicle_log.find(e => e.text === 'entry0'));
  ok('новая запись добавлена', !!ctx.GAME_STATE.chronicle_log.find(e => e.text === 'new_entry'));
  ok('размер <= 50', ctx.GAME_STATE.chronicle_log.length <= 50);
}

// ─── EDGE: _buildLegacyText с минимальными данными ────────────────────
doesNotThrow('_buildLegacyText с минимальными данными', () => {
  const ctx = makeMinimalCtx();
  const text = ctx._buildLegacyText({
    ruler_name: '', turns_ruled: 0, grandeur: 0,
    achievements: [], wars: 0, treasury: 0, reason: 'ruler_death',
  });
  ok('_buildLegacyText возвращает строку', typeof text === 'string');
});

// ─── EDGE: 100 ходов симуляции без краша ─────────────────────────────
doesNotThrow('100 ходов симуляции без краша', () => {
  const ctx = makeMinimalCtx();
  ctx.GAME_STATE.nations.test = {
    economy: { treasury: 5000, income_per_turn: 200, tax_rate: 0.10, stockpile: { wheat: 5000 } },
    military: { infantry: 1000, cavalry: 100, ships: 5, at_war_with: [], morale: 70, loyalty: 70, mercenaries: 0 },
    population: { total: 100000, happiness: 65, by_profession: { slaves: 0 } },
    government: { type: 'oligarchy', stability: 60, legitimacy: 70, ruler: { name: 'Тест', age: 30 },
                  ruler_changed: false },
    regions: ['r1', 'r2'],
    active_laws: [],
    _ruler_start_turn: 0,
  };

  for (let turn = 1; turn <= 100; turn++) {
    ctx.GAME_STATE.turn = turn;
    ctx.checkAchievements('test');
    ctx.checkVictoryConditions();
    if (typeof ctx._tickActiveCrisis === 'function') ctx._tickActiveCrisis('test');
  }
  ok('100 ходов пройдено без ошибок', true);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
