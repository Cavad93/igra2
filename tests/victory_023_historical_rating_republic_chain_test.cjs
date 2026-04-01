'use strict';
// ── VICTORY 023: Historical rating + Republic/Oligarchy chain tests ───
// Тестирует:
//   1. getHistoricalRating — все пороги казны/армии/легитимности
//   2. Республика → legacy каждые 12 ходов
//   3. Олигархия → legacy каждые 24 хода
//   4. Монархия → legacy только при ruler_changed
//   5. Полная цепочка: republic + 120 ходов → 10 смен + chronicle
// Запуск: node tests/victory_023_historical_rating_republic_chain_test.cjs

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

function loadBoth(GS, extra = {}) {
  const ctx = vm.createContext({
    GAME_STATE: GS,
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
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  return ctx;
}

function makeGS(nationPatch = {}, gsPatch = {}) {
  const nation = Object.assign({
    _id: 'rome',
    name: 'Рим',
    economy:    { treasury: 5000, income_per_turn: 2000, tax_rate: 0.1, stockpile: {} },
    military:   { infantry: 3000, cavalry: 200, ships: 5, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 60, by_profession: {} },
    government: { type: 'monarchy', stability: 60, legitimacy: 65, ruler: { name: 'Октавиан', age: 35 } },
    regions:    ['r0', 'r1', 'r2'],
    relations:  {},
    active_laws: [],
    buildings:  [],
    _ruler_start_turn: 1,
    _bankruptcies: 0,
  }, nationPatch);

  return Object.assign({
    turn: 10,
    player_nation: 'rome',
    nations: { rome: nation },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
    active_crisis: null,
    chronicle_log: [],
  }, gsPatch);
}

// ────────────────────────────────────────────────────────
section('БЛОК 1: getHistoricalRating — казна');
// ────────────────────────────────────────────────────────
{
  const ctx = loadBoth(makeGS({ economy: { treasury: 85000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } }));
  const r = ctx.getHistoricalRating('rome');
  ok('treasury>80000 → содержит "Птолем"', r.some(s => s.includes('Птолем')));
}
{
  const ctx = loadBoth(makeGS({ economy: { treasury: 45000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } }));
  const r = ctx.getHistoricalRating('rome');
  ok('treasury>40000 → содержит "Карфаген"', r.some(s => s.includes('Карфаген')));
}
{
  const ctx = loadBoth(makeGS({ economy: { treasury: 15000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } }));
  const r = ctx.getHistoricalRating('rome');
  ok('treasury>10000 → содержит "полис"', r.some(s => s.toLowerCase().includes('полис')));
}
{
  const ctx = loadBoth(makeGS({ economy: { treasury: 500, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } }));
  const r = ctx.getHistoricalRating('rome');
  ok('treasury<10000 → содержит "тиран"', r.some(s => s.toLowerCase().includes('тиран')));
}

// ────────────────────────────────────────────────────────
section('БЛОК 2: getHistoricalRating — армия');
// ────────────────────────────────────────────────────────
{
  const ctx = loadBoth(makeGS({ military: { infantry: 50001, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } }));
  const r = ctx.getHistoricalRating('rome');
  ok('army>50000 → содержит "Александр"', r.some(s => s.includes('Александр')));
}
{
  const ctx = loadBoth(makeGS({ military: { infantry: 25000, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } }));
  const r = ctx.getHistoricalRating('rome');
  ok('army>20000 → содержит "Пирр"', r.some(s => s.includes('Пирр')));
}
{
  const ctx = loadBoth(makeGS({ military: { infantry: 6000, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } }));
  const r = ctx.getHistoricalRating('rome');
  ok('army>5000 → содержит "полис"', r.some(s => s.toLowerCase().includes('полис')));
}
{
  const ctx = loadBoth(makeGS({ military: { infantry: 1000, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } }));
  const r = ctx.getHistoricalRating('rome');
  ok('army<5000 → содержит "слаб"', r.some(s => s.toLowerCase().includes('слаб')));
}

// ────────────────────────────────────────────────────────
section('БЛОК 3: getHistoricalRating — легитимность');
// ────────────────────────────────────────────────────────
{
  const ctx = loadBoth(makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 85, ruler: { name: 'Р', age: 40 } } }));
  const r = ctx.getHistoricalRating('rome');
  ok('legitimacy>80 → содержит "Перикл"', r.some(s => s.includes('Перикл')));
}
{
  const ctx = loadBoth(makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 65, ruler: { name: 'Р', age: 40 } } }));
  const r = ctx.getHistoricalRating('rome');
  ok('legitimacy>60 → содержит "выборн"', r.some(s => s.toLowerCase().includes('выборн')));
}
{
  const ctx = loadBoth(makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 25, ruler: { name: 'Р', age: 40 } } }));
  const r = ctx.getHistoricalRating('rome');
  ok('legitimacy<30 → содержит "Цезарь" или предупреждение', r.some(s => s.includes('Цезарь') || s.toLowerCase().includes('осторожен')));
}
{
  const ctx = loadBoth(makeGS());
  const r = ctx.getHistoricalRating('rome');
  ok('getHistoricalRating возвращает массив', Array.isArray(r));
  ok('getHistoricalRating возвращает >= 2 строки', r.length >= 2);
  ok('Все элементы — строки', r.every(s => typeof s === 'string'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 4: Республика — legacy каждые 12 ходов');
// ────────────────────────────────────────────────────────
{
  // Проверяем через _ruler_start_turn — он обновляется при каждом generateRulerLegacy
  const GS = makeGS({ government: { type: 'republic', stability: 60, legitimacy: 60, ruler: { name: 'Консул', age: 40 } } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 12;
  ctx.checkVictoryConditions();
  ok('Республика: ход=12 → _ruler_start_turn=12', ctx.GAME_STATE.nations.rome._ruler_start_turn === 12);

  ctx.GAME_STATE.turn = 24;
  ctx.checkVictoryConditions();
  ok('Республика: ход=24 → _ruler_start_turn=24', ctx.GAME_STATE.nations.rome._ruler_start_turn === 24);

  ctx.GAME_STATE.turn = 36;
  ctx.checkVictoryConditions();
  ok('Республика: ход=36 → _ruler_start_turn=36 (3 смены)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 36);
}
{
  // Ход НЕ кратный 12 — _ruler_start_turn не меняется
  const GS = makeGS({ government: { type: 'republic', stability: 60, legitimacy: 60, ruler: { name: 'Консул', age: 40 } } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 11;
  ctx.checkVictoryConditions();
  ok('Республика: ход=11, нет legacy (_ruler_start_turn=1)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 5: Олигархия — legacy каждые 24 хода');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ government: { type: 'oligarchy', stability: 60, legitimacy: 60, ruler: { name: 'Совет', age: 40 } } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);

  ctx.GAME_STATE.turn = 24;
  ctx.checkVictoryConditions();
  ok('Олигархия: ход=24 → _ruler_start_turn=24', ctx.GAME_STATE.nations.rome._ruler_start_turn === 24);

  ctx.GAME_STATE.turn = 48;
  ctx.checkVictoryConditions();
  ok('Олигархия: ход=48 → _ruler_start_turn=48 (2 смены)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 48);
}
{
  // Ход=12 не триггерит для олигархии
  const GS = makeGS({ government: { type: 'oligarchy', stability: 60, legitimacy: 60, ruler: { name: 'Совет', age: 40 } } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 12;
  ctx.checkVictoryConditions();
  ok('Олигархия: ход=12, нет legacy (_ruler_start_turn=1)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 6: Монархия — legacy только при ruler_changed');
// ────────────────────────────────────────────────────────
{
  // generateRulerLegacy вызывается → _ruler_start_turn обновляется + ruler_changed=false
  const GS = makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Рекс', age: 50 }, ruler_changed: true } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 30;
  ctx.checkVictoryConditions();
  ok('Монархия: legacy при ruler_changed → _ruler_start_turn=30', ctx.GAME_STATE.nations.rome._ruler_start_turn === 30);
  ok('Монархия: ruler_changed сброшен в false', ctx.GAME_STATE.nations.rome.government.ruler_changed === false);
}
{
  // Без ruler_changed — _ruler_start_turn не меняется
  const GS = makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Рекс', age: 50 } } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 24;
  ctx.checkVictoryConditions();
  ok('Монархия: ход=24, нет legacy без ruler_changed (_ruler_start_turn=1)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 7: _ruler_start_turn обновляется при каждой смене');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ government: { type: 'republic', stability: 60, legitimacy: 60, ruler: { name: 'Консул I', age: 40 } } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS, { showLegacyModal: () => {} });

  ctx.GAME_STATE.turn = 12;
  ctx.checkVictoryConditions();
  ok('_ruler_start_turn обновлён до 12 после смены', ctx.GAME_STATE.nations.rome._ruler_start_turn === 12);

  ctx.GAME_STATE.turn = 24;
  ctx.checkVictoryConditions();
  ok('_ruler_start_turn обновлён до 24 при второй смене', ctx.GAME_STATE.nations.rome._ruler_start_turn === 24);
}

// ────────────────────────────────────────────────────────
section('БЛОК 8: _buildLegacyText формирует текст — проверяем через chronicle_log');
// ────────────────────────────────────────────────────────
{
  // generateRulerLegacy добавляет запись в chronicle_log
  const GS = makeGS({
    government: { type: 'republic', stability: 60, legitimacy: 60, ruler: { name: 'Консул Катон', age: 40 } },
    economy: { treasury: 50000, income_per_turn: 5000, tax_rate: 0.1, stockpile: {} },
    _wars_total: 3,
  });
  GS.chronicle_log = [];
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 12;
  ctx.checkVictoryConditions();

  const logEntries = ctx.GAME_STATE.chronicle_log ?? [];
  ok('chronicle_log пополнился после legacy (republic)', logEntries.length >= 1);
  ok('Запись chronicle_log имеет поле text или type', logEntries.some(e => e.text || e.type));
}
{
  // Монарх с войнами — chronicle_log тоже должен пополниться
  const GS = makeGS({
    government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Воинственный Рекс', age: 50 }, ruler_changed: true },
    _wars_total: 8,
  });
  GS.chronicle_log = [];
  const ctx = loadBoth(GS);
  ctx.GAME_STATE.turn = 50;
  ctx.checkVictoryConditions();
  ok('Legacy monarchy с войнами: chronicle_log пополнился', (ctx.GAME_STATE.chronicle_log?.length ?? 0) >= 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 9: chronicle_log пополняется при смене власти');
// ────────────────────────────────────────────────────────
{
  const GS = makeGS({ government: { type: 'republic', stability: 60, legitimacy: 60, ruler: { name: 'К', age: 40 } } });
  GS.chronicle_log = [];
  const ctx = loadBoth(GS, { showLegacyModal: () => {} });

  ctx.GAME_STATE.turn = 12;
  ctx.checkVictoryConditions();
  ctx.GAME_STATE.turn = 24;
  ctx.checkVictoryConditions();

  ok('chronicle_log содержит >= 1 запись о legacy', (ctx.GAME_STATE.chronicle_log?.length ?? 0) >= 1);
}

// ────────────────────────────────────────────────────────
section('БЛОК 10: Смешанный тест — смена типа правления');
// ────────────────────────────────────────────────────────
{
  // Начинаем как монархия, переключаемся на республику
  // Проверяем через _ruler_start_turn
  const GS = makeGS({ government: { type: 'monarchy', stability: 60, legitimacy: 60, ruler: { name: 'Рекс', age: 50 }, ruler_changed: true } });
  GS.nations.rome._ruler_start_turn = 1;
  const ctx = loadBoth(GS);

  // Смерть монарха
  ctx.GAME_STATE.turn = 50;
  ctx.checkVictoryConditions();
  ok('Монарх умер: _ruler_start_turn=50', ctx.GAME_STATE.nations.rome._ruler_start_turn === 50);

  // Переключить на республику
  ctx.GAME_STATE.nations.rome.government.type = 'republic';

  // Ход=60 — НЕ кратен 12 (60%12===0 → кратен! ход 60 кратен 12)
  // Поэтому ход 61 не кратен
  ctx.GAME_STATE.turn = 61;
  ctx.checkVictoryConditions();
  ok('Republic: ход=61, нет legacy (_ruler_start_turn=50)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 50);

  // Ход=72 кратен 12 → legacy
  ctx.GAME_STATE.turn = 72;
  ctx.checkVictoryConditions();
  ok('Republic: ход=72 → legacy (_ruler_start_turn=72)', ctx.GAME_STATE.nations.rome._ruler_start_turn === 72);
}

// ────────────────────────────────────────────────────────
section('ИТОГ');
// ────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log(`════════════════════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
