'use strict';
// ── VICTORY 014: Legacy Text & Historical Rating Tests ───────────────
// Исчерпывающие тесты _buildLegacyText (все 3 варианта: монарх/консул/совет),
// getHistoricalRating (все пороги казны, армии, легитимности), плюс
// generateRulerLegacy интеграция с хроникой.
// 30 тестов.
// Запуск: node tests/victory_014_legacy_text_variants_test.cjs

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
  createElement: () => ({
    id:'', className:'', innerHTML:'', style:{},
    remove(){}, appendChild(){},
    querySelectorAll: () => [],
  }),
  body: { appendChild(){} },
};

function makeCtx(overrides = {}) {
  const GS = {
    turn: 50,
    player_nation: 'athens',
    nations: {
      athens: {
        _id: 'athens',
        name: 'Афины',
        economy:    { treasury: 8000, income_per_turn: 2000, stockpile: { wheat: 5000 } },
        military:   { infantry: 4000, cavalry: 300, ships: 15, at_war_with: [], mercenaries: 0 },
        population: { total: 150000, happiness: 65, by_profession: { slaves: 0 } },
        government: { type: 'monarchy', stability: 65, legitimacy: 70,
                      ruler: { name: 'Перикл', age: 45 }, ruler_changed: false },
        regions:    ['r1', 'r2', 'r3', 'r4', 'r5'],
        relations:  {},
        active_laws: [],
        _battles_won: 0,
        _wars_declared: 0,
        _wars_total: 0,
        _invasions_repelled: 0,
        _bankruptcies: 0,
        _turns_in_power: 0,
        _ruler_start_turn: 0,
        _crisis_survived: 0,
        _total_loans_taken: 0,
        _buildings_built: 0,
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
    ...overrides,
  };
  const eventLog = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => eventLog.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._eventLog = eventLog;
  const src1 = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const src2 = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(src1, ctx);
  vm.runInContext(src2, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 1: _buildLegacyText — монарх-вариант
// ════════════════════════════════════════════════════════════════════
section('БЛОК 1: _buildLegacyText — монарх (ruler_death)');

{
  const ctx = makeCtx();
  const { _buildLegacyText } = ctx;

  // Мирный монарх, без достижений
  const t1 = _buildLegacyText({
    ruler_name: 'Александр', turns_ruled: 30, grandeur: 200,
    achievements: [], wars: 0, treasury: 5000, reason: 'ruler_death',
  });
  ok('монарх без войн — текст не пустой', t1.length > 10);
  ok('упоминание имени в тексте', t1.includes('Александр'));
  ok('упоминание числа ходов', t1.includes('30'));
  ok('мирный монарх — без упоминания войн', t1.includes('мир') || t1.includes('хранил'));

  // Воинственный монарх
  const t2 = _buildLegacyText({
    ruler_name: 'Ганнибал', turns_ruled: 25, grandeur: 400,
    achievements: ['А','Б','В','Г','Д','Е'], wars: 7, treasury: 15000,
    reason: 'ruler_death',
  });
  ok('воинственный монарх — упоминание войн', t2.includes('войн'));
  ok('>5 достижений — позитивная оценка', t2.includes('помнить') || t2.includes('долго'));

  // Мало достижений
  const t3 = _buildLegacyText({
    ruler_name: 'Неизвестный', turns_ruled: 5, grandeur: 50,
    achievements: ['А'], wars: 2, treasury: 100,
    reason: 'ruler_death',
  });
  ok('мало достижений — скромная оценка', t3.includes('скромно') || t3.includes('оценит'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 2: _buildLegacyText — консул (consul_change)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 2: _buildLegacyText — консул (consul_change)');

{
  const ctx = makeCtx();
  const { _buildLegacyText } = ctx;

  // Богатый консул
  const t1 = _buildLegacyText({
    ruler_name: 'Цицерон', turns_ruled: 12, grandeur: 300,
    achievements: ['Миротворец'], wars: 0, treasury: 20000,
    reason: 'consul_change',
  });
  ok('консул — текст не пустой', t1.length > 10);
  ok('консул — упоминание "Консулат"', t1.includes('Консулат'));
  ok('казна процветала при >10000', t1.includes('процветала'));
  ok('Миротворец в достижениях — упоминание торговли', t1.includes('торговл'));

  // Бедный консул
  const t2 = _buildLegacyText({
    ruler_name: 'Катон', turns_ruled: 12, grandeur: 100,
    achievements: [], wars: 4, treasury: 500,
    reason: 'consul_change',
  });
  ok('бедный консул — казна испытывала трудности', t2.includes('трудности'));
  ok('3+ войны — упоминание истощения', t2.includes('кампании') || t2.includes('истощ'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 3: _buildLegacyText — совет (council_change)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 3: _buildLegacyText — совет (council_change)');

{
  const ctx = makeCtx();
  const { _buildLegacyText } = ctx;

  const t1 = _buildLegacyText({
    ruler_name: 'Совет Рима', turns_ruled: 24, grandeur: 500,
    achievements: [], wars: 1, treasury: 30000,
    reason: 'council_change',
  });
  ok('совет с высоким grandeur — сохранил влияние', t1.includes('сохранил'));
  ok('большая казна — торговля процветала', t1.includes('процветала'));

  const t2 = _buildLegacyText({
    ruler_name: 'Слабый совет', turns_ruled: 24, grandeur: 200,
    achievements: [], wars: 0, treasury: 1000,
    reason: 'council_change',
  });
  ok('совет с низким grandeur — утратил часть власти', t2.includes('утратил'));
  ok('малая казна — требовала внимания', t2.includes('внимания'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 4: _buildLegacyText — защита от null/undefined
// ════════════════════════════════════════════════════════════════════
section('БЛОК 4: _buildLegacyText — null и пустые данные');

{
  const ctx = makeCtx();
  const { _buildLegacyText } = ctx;

  ok('null → пустая строка', _buildLegacyText(null) === '');
  ok('undefined → пустая строка', _buildLegacyText(undefined) === '');
  ok('{} → строка без краша', typeof _buildLegacyText({}) === 'string');
  ok('нет полей → возвращает строку', _buildLegacyText({
    ruler_name: null, turns_ruled: undefined, achievements: null, wars: null
  }).length >= 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 5: getHistoricalRating — пороги казны
// ════════════════════════════════════════════════════════════════════
section('БЛОК 5: getHistoricalRating — пороги казны');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, getHistoricalRating } = ctx;
  const n = GS.nations.athens;

  // > 80000 → «Птолемеев»
  n.economy.treasury = 90000;
  let rating = getHistoricalRating('athens');
  ok('treasury>80000 → упоминание Птолемеев', rating.some(r => r.includes('Птолемеев') || r.includes('птолемее')));

  // > 40000 → «Карфагеном»
  n.economy.treasury = 50000;
  rating = getHistoricalRating('athens');
  ok('treasury>40000 → упоминание Карфагена', rating.some(r => r.includes('Карфаген') || r.includes('карфаге')));

  // > 10000 → «полиса»
  n.economy.treasury = 15000;
  rating = getHistoricalRating('athens');
  ok('treasury>10000 → упоминание полиса', rating.some(r => r.includes('полис') || r.includes('полиса')));

  // < 10000 → «скромнее»
  n.economy.treasury = 5000;
  rating = getHistoricalRating('athens');
  ok('treasury<10000 → скромная оценка', rating.some(r => r.includes('Скромнее') || r.includes('скромн') || r.includes('тиран')));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 6: getHistoricalRating — пороги армии
// ════════════════════════════════════════════════════════════════════
section('БЛОК 6: getHistoricalRating — пороги армии');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, getHistoricalRating } = ctx;
  const n = GS.nations.athens;
  n.economy.treasury = 0; // изолируем

  // > 50000 → «Александра»
  n.military.infantry = 55000;
  n.military.cavalry  = 0;
  let rating = getHistoricalRating('athens');
  ok('армия>50000 → упоминание Александра', rating.some(r => r.includes('Александр') || r.includes('александр')));

  // > 20000 → «Пирром»
  n.military.infantry = 25000;
  rating = getHistoricalRating('athens');
  ok('армия>20000 → упоминание Пирра', rating.some(r => r.includes('Пирр') || r.includes('пирр')));

  // > 5000 → «полиса»
  n.military.infantry = 6000;
  rating = getHistoricalRating('athens');
  ok('армия>5000 → упоминание полиса', rating.some(r => r.includes('полиса') || r.includes('Стандарт')));

  // < 5000 → «слабее»
  n.military.infantry = 1000;
  n.military.cavalry  = 0;
  rating = getHistoricalRating('athens');
  ok('армия<5000 → слабее соседей', rating.some(r => r.includes('лабее') || r.includes('сосед')));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 7: getHistoricalRating — пороги легитимности
// ════════════════════════════════════════════════════════════════════
section('БЛОК 7: getHistoricalRating — пороги легитимности');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, getHistoricalRating } = ctx;
  const n = GS.nations.athens;
  n.economy.treasury  = 0;
  n.military.infantry = 0;
  n.military.cavalry  = 0;

  // > 80 → «Перикл»
  n.government.legitimacy = 85;
  let rating = getHistoricalRating('athens');
  ok('legitimacy>80 → упоминание Перикла', rating.some(r => r.includes('Перикл') || r.includes('перикл')));

  // > 60 → «Средний»
  n.government.legitimacy = 65;
  rating = getHistoricalRating('athens');
  ok('legitimacy>60 → средний уровень', rating.some(r => r.includes('редний') || r.includes('выборн')));

  // < 30 → «Цезаря»
  n.government.legitimacy = 25;
  rating = getHistoricalRating('athens');
  ok('legitimacy<30 → упоминание Цезаря', rating.some(r => r.includes('Цезарь') || r.includes('цезар') || r.includes('Рубик')));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 8: generateRulerLegacy — запись в chronicle_log
// ════════════════════════════════════════════════════════════════════
section('БЛОК 8: generateRulerLegacy — хроника и eventLog');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, generateRulerLegacy } = ctx;

  GS.nations.athens._ruler_start_turn = 10;
  GS.turn = 40;
  generateRulerLegacy('athens', 'ruler_death');

  ok('chronicle_log не пуст после generateRulerLegacy', GS.chronicle_log.length >= 1);
  const entry = GS.chronicle_log.find(e => e.type === 'legacy');
  ok('запись типа legacy в хронике', !!entry);
  ok('запись содержит grandeur', typeof entry?.grandeur === 'number');
  ok('запись содержит ruler', typeof entry?.ruler === 'string');

  const logEntry = ctx._eventLog.find(e => e.msg.includes('Итог правления'));
  ok('eventLog содержит "Итог правления"', !!logEntry);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 9: Консульская ротация каждые 12 ходов
// ════════════════════════════════════════════════════════════════════
section('БЛОК 9: Консульская ротация (republic, каждые 12 ходов)');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkVictoryConditions } = ctx;
  const n = GS.nations.athens;
  n.government.type = 'republic';

  // Ход 12 → должен триггерить generateRulerLegacy
  GS.turn = 12;
  checkVictoryConditions();
  ok('chronicle_log пополнен на ходу 12 для republic', GS.chronicle_log.length >= 1);

  // Ход 24 → ещё один итог
  GS.turn = 24;
  checkVictoryConditions();
  ok('chronicle_log пополнен на ходу 24 для republic', GS.chronicle_log.length >= 2);

  // Ход 13 → НЕ должен триггерить
  const ctx2 = makeCtx();
  ctx2.GAME_STATE.nations.athens.government.type = 'republic';
  ctx2.GAME_STATE.turn = 13;
  ctx2.checkVictoryConditions();
  ok('chronicle_log НЕ пополнен на ходу 13 для republic', ctx2.GAME_STATE.chronicle_log.length === 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 10: Олигархическая ротация каждые 24 хода
// ════════════════════════════════════════════════════════════════════
section('БЛОК 10: Олигархическая ротация (oligarchy, каждые 24 хода)');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkVictoryConditions } = ctx;
  GS.nations.athens.government.type = 'oligarchy';

  GS.turn = 24;
  checkVictoryConditions();
  ok('chronicle_log пополнен на ходу 24 для oligarchy', GS.chronicle_log.length >= 1);

  const ctx2 = makeCtx();
  ctx2.GAME_STATE.nations.athens.government.type = 'oligarchy';
  ctx2.GAME_STATE.turn = 12;
  ctx2.checkVictoryConditions();
  ok('chronicle_log НЕ пополнен на ходу 12 для oligarchy', ctx2.GAME_STATE.chronicle_log.length === 0);
}

// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
