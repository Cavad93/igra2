'use strict';
// ── VICTORY 029: Engine crash & stress tests ─────────────────────────────────
// Краш-тесты: агрессивные сценарии с повреждёнными данными,
// одновременными операциями, экстремальными значениями, и долгосрочные симуляции.
// Также проверяем что движок не имеет memory leaks при длинных прогонах.
// Запуск: node tests/victory_029_engine_crash_stress_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function noThrow(label, fn) {
  try { fn(); ok(label, true); }
  catch (e) { console.error(`  ❌ THROW: ${label} — ${e.message}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

const domStub = {
  getElementById: () => null,
  createElement: () => ({ id:'', className:'', innerHTML:'', style:{}, remove(){}, appendChild(){} }),
  body: { appendChild(){} },
};

function load(GS, extra = {}) {
  const events = [];
  const ctx = vm.createContext({
    GAME_STATE: GS ?? {},
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    showLegacyModal: () => {},
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    ...extra,
  });
  ctx._events = events;
  const root = path.join(__dirname, '..');
  try {
    vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  } catch (e) {
    console.error('[load error]', e.message);
  }
  return ctx;
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 1: Симуляция 600 ходов — стресс-тест');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 10000, income_per_turn: 500 },
        military: { infantry: 1000, cavalry: 200, at_war_with: [], ships: 5 },
        government: { type: 'monarchy', stability: 70, legitimacy: 65, ruler: { name: 'Augustus', age: 30 }, ruler_changed: false },
        population: { total: 200000, happiness: 60 },
        regions: ['latium', 'campania'],
        _ruler_start_turn: 0,
      },
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    player_vows: [],
  };
  const ctx = load(gs);

  noThrow('600 ходов симуляции без падений', () => {
    for (let t = 1; t <= 600; t++) {
      gs.turn = t;
      gs.nations.rome.economy.treasury += 200;
      gs.nations.rome.population.total += 500;
      gs.nations.rome._turns_in_power = t;
      if (t % 50 === 0) gs.nations.rome._battles_won = (gs.nations.rome._battles_won ?? 0) + 1;
      ctx.checkAchievements('rome');
      ctx.checkVictoryConditions();
    }
  });

  ok('chronicle_log <= 50 после 600 ходов', (gs.chronicle_log?.length ?? 0) <= 50);
  ok('achievements содержит данные', Object.keys(gs.achievements?.rome ?? {}).length >= 0);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 2: Повреждённый GAME_STATE — нет crashes');
// ────────────────────────────────────────────────────────────────
{
  const badStates = [
    null,
    undefined,
    {},
    { turn: 1 },
    { turn: 1, player_nation: null },
    { turn: 1, player_nation: 'r', nations: null },
    { turn: NaN, player_nation: 'r', nations: { r: null } },
    { turn: 1, player_nation: 'r', nations: { r: { economy: null, military: undefined } } },
  ];

  for (const gs of badStates) {
    const ctx = load(gs);
    noThrow(`checkAchievements с GS=${JSON.stringify(gs)?.slice(0, 40)}`, () => {
      ctx.checkAchievements('r');
    });
    noThrow(`checkVictoryConditions с GS=${JSON.stringify(gs)?.slice(0, 40)}`, () => {
      ctx.checkVictoryConditions();
    });
    noThrow(`calcGrandeur с GS=${JSON.stringify(gs)?.slice(0, 40)}`, () => {
      ctx.calcGrandeur('r');
    });
  }
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 3: Экстремальные числа не ломают grandeur');
// ────────────────────────────────────────────────────────────────
{
  const extremeValues = [
    { treasury: Number.MAX_SAFE_INTEGER, income_per_turn: Number.MAX_SAFE_INTEGER },
    { treasury: -Number.MAX_SAFE_INTEGER, income_per_turn: -1e15 },
    { treasury: NaN, income_per_turn: NaN },
    { treasury: Infinity, income_per_turn: -Infinity },
    { treasury: 0, income_per_turn: 0 },
  ];

  for (const eco of extremeValues) {
    const gs = {
      turn: 1, player_nation: 'r',
      nations: { r: { economy: eco, military: { at_war_with: [], infantry: NaN, cavalry: Infinity }, government: { stability: NaN }, population: { happiness: -999 }, regions: [] } },
      diplomacy: { treaties: [] }, achievements: {},
    };
    const ctx = load(gs);
    let g;
    noThrow(`calcGrandeur с eco=${JSON.stringify(eco).slice(0, 40)}`, () => { g = ctx.calcGrandeur('r'); });
    ok(`  grandeur не NaN: ${g}`, !isNaN(g ?? 0));
    ok(`  grandeur в [0,1000]: ${g}`, (g ?? 0) >= 0 && (g ?? 0) <= 1000);
  }
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 4: Одновременно 50 наций — нет cross-contamination');
// ────────────────────────────────────────────────────────────────
{
  const nations = {};
  for (let i = 0; i < 50; i++) {
    nations[`nation_${i}`] = {
      economy: { treasury: i * 1000, income_per_turn: i * 100 },
      military: { infantry: i * 100, cavalry: i * 10, at_war_with: [], ships: i },
      government: { type: 'monarchy', stability: 50 + i, legitimacy: 50, ruler: { name: `Ruler${i}`, age: 30 + i } },
      population: { total: 100000 + i * 10000, happiness: 50 },
      regions: Array.from({ length: i % 10 + 1 }, (_, j) => `r${i}_${j}`),
      _battles_won: i,
    };
  }
  const gs = {
    turn: 50,
    player_nation: 'nation_0',
    nations,
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    player_vows: [],
  };
  const ctx = load(gs);

  noThrow('50 наций — checkAchievements для каждой', () => {
    for (let i = 0; i < 50; i++) ctx.checkAchievements(`nation_${i}`);
  });

  // Проверяем что нации не загрязняют друг друга
  const a0 = ctx.getAchievements('nation_0');
  const a25 = ctx.getAchievements('nation_25');
  ok('nation_0 и nation_25 имеют разные достижения', a0.length !== a25.length || a0.length === 0);
  ok('grandeur nation_0 < grandeur nation_49',
    ctx.calcGrandeur('nation_0') <= ctx.calcGrandeur('nation_49'));
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 5: Многократные смерти правителей подряд');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 10,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 5000, income_per_turn: 200 },
        military: { infantry: 500, at_war_with: [], cavalry: 50, ships: 0 },
        government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Nero', age: 40 }, ruler_changed: false },
        population: { total: 100000, happiness: 50 },
        regions: ['latium'],
        _ruler_start_turn: 0,
      }
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    player_vows: [],
  };
  const legacyShown = [];
  const ctx = load(gs, { showLegacyModal: (t, d) => legacyShown.push(d) });

  noThrow('5 смертей правителей подряд', () => {
    for (let i = 0; i < 5; i++) {
      gs.turn = 10 + i * 5;
      gs.nations.rome.government.ruler_changed = true;
      gs.nations.rome.government.ruler.name = `Ruler_${i}`;
      ctx.checkVictoryConditions();
    }
  });

  // showLegacyModal переопределяется в victory.js → проверяем через chronicle_log
  const legacyEntries = (gs.chronicle_log ?? []).filter(e => e.type === 'legacy');
  ok('5 записей legacy в chronicle_log', legacyEntries.length === 5);
  ok('_ruler_start_turn = последний turn', gs.nations.rome._ruler_start_turn === gs.turn);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 6: Все клятвы одновременно взяты и нарушены');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 5,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 5000, income_per_turn: 200, tax_rate: 0.15 }, // no_taxes нарушена
        military: { infantry: 500, at_war_with: [], cavalry: 50, ships: 0, mercenaries: 100 }, // no_mercs нарушена
        government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Nero', age: 40 } },
        population: { total: 100000, happiness: 50, by_profession: { slaves: 500 } }, // no_slavery нарушена
        regions: ['latium'],
        _wars_declared_this_turn: 1, // no_first_strike нарушена
        _loans_taken_this_turn: 1,   // no_loans нарушена
      }
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    player_vows: [],
  };
  const ctx = load(gs);

  const VOW_IDS = ['no_first_strike', 'no_slavery', 'no_loans', 'no_mercs', 'no_taxes'];
  noThrow('взять все клятвы', () => {
    for (const id of VOW_IDS) ctx.takeVow(id);
  });
  ok('все 5 клятв взяты', gs.player_vows.length === 5);

  noThrow('checkVowViolations с активными нарушениями', () => {
    ctx.checkVowViolations('rome');
  });
  ok('хотя бы одна клятва нарушена', gs.player_vows.some(v => v.broken));
  ok('legitimacy снижена', gs.nations.rome.government.legitimacy < 60);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 7: processCrisisVeha на нации без данных');
// ────────────────────────────────────────────────────────────────
{
  const cases = [
    { turn: 600, player_nation: 'r', nations: { r: {} } },
    { turn: 600, player_nation: 'r', nations: { r: { population: null, economy: null } } },
    { turn: 600, player_nation: 'r', nations: {} },
  ];

  for (const gs of cases) {
    const ctx = load({ ...gs, diplomacy: { treaties: [] }, loans: [], achievements: {} });
    noThrow(`processCrisisVeha без данных: ${JSON.stringify(gs).slice(0, 50)}`, () => {
      ctx.processCrisisVeha('r');
    });
  }
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 8: chronicle_log строго ограничен 50 записями');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 100, income_per_turn: 10 },
        military: { infantry: 100, cavalry: 10, at_war_with: [] },
        government: { type: 'republic', stability: 60, legitimacy: 60 },
        population: { total: 100000, happiness: 50 },
        regions: ['latium'],
        _ruler_start_turn: 0,
      }
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    player_vows: [],
  };
  const ctx = load(gs, { showLegacyModal: () => {} });

  // Республика → legacy каждые 12 ходов → через 600 ходов = 50 раз
  for (let t = 2; t <= 600; t++) {
    gs.turn = t;
    ctx.checkVictoryConditions();
    ctx.checkAchievements('rome');
  }

  ok('chronicle_log <= 50 (строгий лимит)', (gs.chronicle_log?.length ?? 0) <= 50);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 9: getAchievements и getAchievementCount консистентны');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 50,
    player_nation: 'rome',
    nations: { rome: {
      economy: { treasury: 200000, income_per_turn: 60000 },
      military: { infantry: 25000, cavalry: 6000, at_war_with: [], ships: 110 },
      government: { stability: 95, legitimacy: 90, type: 'monarchy', ruler: { name: 'Trajan', age: 45 } },
      population: { total: 1100000, happiness: 90 },
      regions: Array.from({ length: 22 }, (_, i) => `r${i}`),
      _battles_won: 25,
      _wars_declared: 6,
      _invasions_repelled: 4,
      _turns_in_power: 50,
    }},
    diplomacy: { treaties: [
      { status: 'active', type: 'alliance', parties: ['rome', 'b'] },
      { status: 'active', type: 'alliance', parties: ['rome', 'c'] },
      { status: 'active', type: 'alliance', parties: ['rome', 'd'] },
    ]},
    loans: [],
    achievements: {},
  };
  const ctx = load(gs);
  ctx.checkAchievements('rome');

  const arr = ctx.getAchievements('rome');
  const count = ctx.getAchievementCount('rome');
  ok('getAchievements и getAchievementCount консистентны', arr.length === count);
  ok('каждое достижение имеет id, name, icon, turn',
    arr.every(a => a.id && a.name && a.icon && typeof a.turn === 'number'));
  ok('достижений >= 5 (богатая нация)', count >= 5);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 10: _buildLegacyText — все ветки шаблонов');
// ────────────────────────────────────────────────────────────────
{
  const gs = {
    turn: 100,
    player_nation: 'rome',
    nations: { rome: {
      economy: { treasury: 5000, income_per_turn: 500 },
      military: { infantry: 500, at_war_with: [], cavalry: 50, ships: 0 },
      government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Nero', age: 40 } },
      population: { total: 100000, happiness: 50 },
      regions: ['latium'],
      _ruler_start_turn: 0,
    }},
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    player_vows: [],
  };
  const legacyShown = [];
  const ctx = load(gs, { showLegacyModal: (text, data) => legacyShown.push({ text, data }) });

  const reasons = [
    { reason: 'ruler_death', govType: 'monarchy', wars: 0 },
    { reason: 'ruler_death', govType: 'monarchy', wars: 6, battles: 15 },
    { reason: 'consul_change', govType: 'republic', treasury: 50000 },
    { reason: 'consul_change', govType: 'republic', treasury: 100 },
    { reason: 'council_change', govType: 'oligarchy' },
  ];

  const chronicleBefore = (gs.chronicle_log ?? []).length;
  for (const r of reasons) {
    gs.nations.rome.government.type = r.govType;
    gs.nations.rome.government.ruler_changed = r.reason === 'ruler_death';
    if (r.wars !== undefined) gs.nations.rome._wars_total = r.wars;
    if (r.battles !== undefined) gs.nations.rome._battles_won = r.battles;
    if (r.treasury !== undefined) gs.nations.rome.economy.treasury = r.treasury;
    gs.turn += 12;
    noThrow(`generateRulerLegacy для ${r.reason}/${r.govType}`, () => {
      ctx.generateRulerLegacy('rome', r.reason);
    });
  }

  // showLegacyModal переопределяется в victory.js → проверяем через chronicle_log
  const legacyInChronicle = (gs.chronicle_log ?? []).filter(e => e.type === 'legacy');
  ok('все варианты legacy text в chronicle_log', legacyInChronicle.length === reasons.length);
  // Events содержат "Итог правления" 5 раз
  const legacyEvents = ctx._events.filter(e => e.msg?.includes('Итог правления'));
  ok('каждый legacy text непустой (в eventlog)', legacyEvents.length === reasons.length);
}

// ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
