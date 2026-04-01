'use strict';
// ── VICTORY 022: Crash & Fuzzing tests ───────────────────────────────
// Агрессивные краш-тесты: повреждённый state, null/undefined поля,
// NaN/Infinity значения, отрицательные числа, пустые объекты,
// вложенные undefined, одновременные кризисы, переполнение.
// Запуск: node tests/victory_022_crash_fuzzing_test.cjs

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

function safeLoad(GS, extra = {}) {
  const ctx = vm.createContext({
    GAME_STATE: GS ?? {},
    addEventLog: () => {},
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    showLegacyModal: () => {},
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    ...extra,
  });
  const root = path.join(__dirname, '..');
  try {
    vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  } catch (e) {
    console.error('[load error]', e.message);
  }
  return ctx;
}

function noThrow(label, fn) {
  try {
    fn();
    ok(label, true);
  } catch (e) {
    console.error(`  ❌ THROW: ${label} — ${e.message}`);
    failed++;
  }
}

// ────────────────────────────────────────────────────────
section('БЛОК 1: GAME_STATE повреждён / null');
// ────────────────────────────────────────────────────────
noThrow('checkAchievements с GS=null', () => {
  const ctx = safeLoad(null);
  ctx.GAME_STATE = null;
  ctx.checkAchievements('rome');
});
noThrow('checkAchievements с GS={}', () => {
  const ctx = safeLoad({});
  ctx.checkAchievements('rome');
});
noThrow('calcGrandeur с GS={}', () => {
  const ctx = safeLoad({});
  const g = ctx.calcGrandeur('rome');
  ok('calcGrandeur {} → 0', g === 0);
});
noThrow('checkVictoryConditions с GS=null', () => {
  const ctx = safeLoad({});
  ctx.GAME_STATE = null;
  ctx.checkVictoryConditions();
});
noThrow('processCrisisVeha с пустым GS', () => {
  const ctx = safeLoad({});
  ctx.processCrisisVeha('rome');
});

// ────────────────────────────────────────────────────────
section('БЛОК 2: nations[id] отсутствует');
// ────────────────────────────────────────────────────────
noThrow('checkAchievements без nations', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: {} });
  ctx.checkAchievements('rome');
});
noThrow('calcGrandeur без нации', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: {} });
  const g = ctx.calcGrandeur('rome');
  ok('calcGrandeur без нации → 0', g === 0);
});
noThrow('generateRulerLegacy без нации', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: {} });
  ctx.generateRulerLegacy('rome', 'ruler_death');
});
noThrow('checkVowViolations без нации', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: {}, player_vows: [] });
  ctx.checkVowViolations('rome');
});
noThrow('processCrisisVeha без нации', () => {
  const ctx = safeLoad({ turn: 600, player_nation: 'rome', nations: {} });
  ctx.processCrisisVeha('rome');
});

// ────────────────────────────────────────────────────────
section('БЛОК 3: Частично сломанная нация (null-поля)');
// ────────────────────────────────────────────────────────
noThrow('checkAchievements: economy=null', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: null, military: null, population: null, government: null, regions: null } },
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  ctx.checkAchievements('rome');
});
noThrow('calcGrandeur: все поля null', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: null, military: null, population: null, government: null, regions: null } },
    achievements: {}, diplomacy: null, loans: [],
  });
  const g = ctx.calcGrandeur('rome');
  ok('все null → grandeur=0', g === 0);
});
noThrow('checkVowViolations: нация без government', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', military: { at_war_with: [] }, economy: { treasury: 0 } } },
    player_vows: [{ id: 'no_first_strike', taken_turn: 1, broken: false }],
    loans: [],
  });
  ctx.checkVowViolations('rome');
});
noThrow('generateRulerLegacy: government=undefined', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', name: 'Рим' } },
    achievements: {}, loans: [],
  });
  ctx.generateRulerLegacy('rome', 'ruler_death');
});
noThrow('addTestamentGoal: GAME_STATE без testament', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', name: 'Рим', economy: {}, military: { at_war_with: [] }, regions: [] } },
    achievements: {}, loans: [],
  });
  ctx.addTestamentGoal('treasury_20k');
  ok('testament создан автоматически', ctx.GAME_STATE.testament !== null && ctx.GAME_STATE.testament !== undefined);
});

// ────────────────────────────────────────────────────────
section('БЛОК 4: NaN / Infinity / Отрицательные значения');
// ────────────────────────────────────────────────────────
noThrow('calcGrandeur: treasury=NaN', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: { treasury: NaN, income_per_turn: NaN }, military: {}, population: {}, government: {}, regions: [] } },
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  const g = ctx.calcGrandeur('rome');
  ok('treasury=NaN → grandeur не NaN', !isNaN(g));
  ok('treasury=NaN → grandeur не Infinity', isFinite(g));
  ok('treasury=NaN → grandeur >= 0', g >= 0);
});
noThrow('calcGrandeur: всё Infinity', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: {
      _id: 'rome',
      economy: { treasury: Infinity, income_per_turn: Infinity },
      military: { infantry: Infinity, cavalry: Infinity, at_war_with: [] },
      population: { total: Infinity, happiness: Infinity },
      government: { stability: Infinity, legitimacy: Infinity },
      regions: Array.from({ length: 100 }, (_, i) => `r${i}`),
    }},
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  const g = ctx.calcGrandeur('rome');
  ok('Infinity inputs → grandeur <= 1000', g <= 1000);
  ok('Infinity inputs → grandeur не NaN', !isNaN(g));
});
noThrow('calcGrandeur: всё -Infinity', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: {
      _id: 'rome',
      economy: { treasury: -Infinity, income_per_turn: -Infinity },
      military: { infantry: -1000, cavalry: -500, at_war_with: [] },
      population: { total: -1000, happiness: -50 },
      government: { stability: -100, legitimacy: -100 },
      regions: [],
    }},
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  const g = ctx.calcGrandeur('rome');
  ok('-Infinity inputs → grandeur >= 0', g >= 0);
});
noThrow('checkAchievements: turn=NaN', () => {
  const ctx = safeLoad({
    turn: NaN, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: {}, military: { at_war_with: [] }, population: {}, government: {}, regions: [] } },
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  ctx.checkAchievements('rome');
});
noThrow('checkAchievements: turn=-1', () => {
  const ctx = safeLoad({
    turn: -1, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: {}, military: { at_war_with: [] }, population: {}, government: {}, regions: [] } },
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  ctx.checkAchievements('rome');
});

// ────────────────────────────────────────────────────────
section('БЛОК 5: Пустые массивы и коллекции');
// ────────────────────────────────────────────────────────
noThrow('getAchievements: пустая нация', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: { rome: { _id: 'rome' } }, achievements: {} });
  const r = ctx.getAchievements('rome');
  ok('getAchievements пустая нация → []', Array.isArray(r) && r.length === 0);
});
noThrow('getHistoricalRating: пустая нация', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: { rome: { _id: 'rome' } }, achievements: {} });
  const r = ctx.getHistoricalRating('rome');
  ok('getHistoricalRating → array', Array.isArray(r));
});
noThrow('generateDynamicGoals: пустая нация', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: { rome: { _id: 'rome' } }, achievements: {} });
  const g = ctx.generateDynamicGoals('rome');
  ok('generateDynamicGoals → array', Array.isArray(g));
});
noThrow('renderVowsPanel: нет GS.player_vows', () => {
  const ctx = safeLoad({ turn: 1, player_nation: 'rome', nations: { rome: { _id: 'rome' } }, achievements: {} });
  const html = ctx.renderVowsPanel();
  ok('renderVowsPanel → string', typeof html === 'string');
});
noThrow('getTestamentGoalDefs: базовый вызов', () => {
  const ctx = safeLoad({ turn: 1 });
  const defs = ctx.getTestamentGoalDefs();
  ok('getTestamentGoalDefs → array', Array.isArray(defs));
  ok('getTestamentGoalDefs → не пустой', defs.length > 0);
});

// ────────────────────────────────────────────────────────
section('БЛОК 6: diplomacy=null и treaties=null');
// ────────────────────────────────────────────────────────
noThrow('calcGrandeur: diplomacy=null', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: {}, military: { at_war_with: [] }, population: {}, government: {}, regions: [] } },
    achievements: {}, diplomacy: null, loans: [],
  });
  const g = ctx.calcGrandeur('rome');
  ok('diplomacy=null → grandeur >= 0', g >= 0);
  ok('diplomacy=null → grandeur не NaN', !isNaN(g));
});
noThrow('checkAchievements: diplomacy.treaties=null', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: {}, military: { at_war_with: [] }, population: {}, government: {}, regions: [] } },
    achievements: {}, diplomacy: { treaties: null }, loans: [],
  });
  ctx.checkAchievements('rome');
});
noThrow('checkVictoryConditions: player_nation=null', () => {
  const ctx = safeLoad({ turn: 1, player_nation: null, nations: { rome: {} }, achievements: {} });
  ctx.checkVictoryConditions();
});
noThrow('processCrisisVeha: turn не кратен 600 — нет кризиса', () => {
  const ctx = safeLoad({
    turn: 100, player_nation: 'rome',
    nations: { rome: { _id: 'rome', population: { total: 500000 }, economy: {}, military: { at_war_with: [] }, government: {}, regions: [] } },
    achievements: {}, loans: [], active_crisis: null,
  });
  // Прямой вызов (не через checkVictoryConditions) — кризис может начаться
  ctx.processCrisisVeha('rome');
  // Не должно выброситься
});
noThrow('_tickActiveCrisis: active_crisis=null', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', population: { total: 100000 }, economy: { stockpile: {} }, military: { at_war_with: [] }, government: {}, regions: [] } },
    achievements: {}, loans: [], active_crisis: null,
  });
  ctx.checkVictoryConditions();
});

// ────────────────────────────────────────────────────────
section('БЛОК 7: Стресс — 1000 вызовов checkAchievements');
// ────────────────────────────────────────────────────────
noThrow('1000 вызовов checkAchievements не падает', () => {
  const ctx = safeLoad({
    turn: 50, player_nation: 'rome',
    nations: { rome: {
      _id: 'rome',
      economy: { treasury: 1000, income_per_turn: 500 },
      military: { infantry: 1000, cavalry: 100, at_war_with: [] },
      population: { total: 50000, happiness: 60 },
      government: { stability: 50, legitimacy: 60, type: 'monarchy' },
      regions: ['r1'],
    }},
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  for (let i = 0; i < 1000; i++) {
    ctx.checkAchievements('rome');
  }
  ok('После 1000 вызовов — нет дублей', Object.keys(ctx.GAME_STATE.achievements?.rome ?? {}).length <= 50);
});

// ────────────────────────────────────────────────────────
section('БЛОК 8: Переполнение chronicle_log');
// ────────────────────────────────────────────────────────
noThrow('chronicle_log не превышает 50 записей', () => {
  const ctx = safeLoad({
    turn: 50, player_nation: 'rome',
    nations: { rome: {
      _id: 'rome',
      economy: { treasury: 0, income_per_turn: 0 },
      military: { infantry: 0, cavalry: 0, at_war_with: [] },
      population: { total: 0, happiness: 0 },
      government: { stability: 0, legitimacy: 0, type: 'republic' },
      regions: ['r1'],
      _ruler_start_turn: 0,
    }},
    achievements: {}, diplomacy: { treaties: [] }, loans: [], chronicle_log: [],
  });

  // Republic генерирует legacy каждые 12 ходов → вызовем много раз
  for (let t = 12; t <= 1200; t += 12) {
    ctx.GAME_STATE.turn = t;
    try { ctx.checkVictoryConditions(); } catch (e) {}
  }
  const len = ctx.GAME_STATE.chronicle_log?.length ?? 0;
  ok(`chronicle_log не превышает 50 (len=${len})`, len <= 50);
});

// ────────────────────────────────────────────────────────
section('БЛОК 9: dynamic goals с повреждёнными данными');
// ────────────────────────────────────────────────────────
noThrow('generateDynamicGoals: economy=undefined', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome' } },
    achievements: {},
  });
  const goals = ctx.generateDynamicGoals('rome');
  ok('generateDynamicGoals с undefined economy → массив', Array.isArray(goals));
});
noThrow('generateDynamicGoals: military.at_war_with=null', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', military: { at_war_with: null }, economy: { treasury: 10000 } } },
    achievements: {},
  });
  const goals = ctx.generateDynamicGoals('rome');
  ok('generateDynamicGoals with at_war_with=null → массив', Array.isArray(goals));
});
noThrow('progress() в dynamic goals не падает при NaN', () => {
  const ctx = safeLoad({
    turn: 10, player_nation: 'rome',
    nations: { rome: { _id: 'rome', economy: { treasury: NaN, income_per_turn: NaN }, military: { at_war_with: [] }, population: { total: NaN } } },
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  const goals = ctx.generateDynamicGoals('rome');
  for (const g of goals) {
    let p;
    noThrow(`progress() для цели "${g.text?.slice(0, 30)}"`, () => {
      p = g.progress();
    });
    ok(`progress() для "${g.text?.slice(0, 20)}" → число или 0`, typeof p === 'number' || p === undefined);
  }
});

// ────────────────────────────────────────────────────────
section('БЛОК 10: Изолированность — нации не влияют друг на друга');
// ────────────────────────────────────────────────────────
noThrow('checkAchievements двух наций изолированы', () => {
  const ctx = safeLoad({
    turn: 100, player_nation: 'rome',
    nations: {
      rome: {
        _id: 'rome',
        economy: { treasury: 100000, income_per_turn: 0 },
        military: { infantry: 0, cavalry: 0, at_war_with: [] },
        population: { total: 0, happiness: 0 },
        government: { stability: 0, legitimacy: 0, type: 'monarchy' },
        regions: ['r1'],
      },
      carthage: {
        _id: 'carthage',
        economy: { treasury: 0, income_per_turn: 0 },
        military: { infantry: 0, cavalry: 0, at_war_with: [] },
        population: { total: 0, happiness: 0 },
        government: { stability: 0, legitimacy: 0, type: 'monarchy' },
        regions: [],
      },
    },
    achievements: {}, diplomacy: { treaties: [] }, loans: [],
  });
  ctx.checkAchievements('rome');
  ctx.checkAchievements('carthage');
  const romeAchs = Object.keys(ctx.GAME_STATE.achievements?.rome ?? {});
  const carthAchs = Object.keys(ctx.GAME_STATE.achievements?.carthage ?? {});
  ok('rome: treasurer разблокирован', romeAchs.includes('treasurer'));
  ok('rome: centurion разблокирован при turn=100', romeAchs.includes('centurion'));
  ok('carthage: treasurer НЕ разблокирован (treasury=0)', !carthAchs.includes('treasurer'));
  ok('Достижения rome и carthage независимы', romeAchs.length !== carthAchs.length || romeAchs.join(',') !== carthAchs.join(','));
});

// ────────────────────────────────────────────────────────
section('ИТОГ');
// ────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log(`════════════════════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
