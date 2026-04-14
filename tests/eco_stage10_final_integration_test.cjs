/**
 * tests/eco_stage10_final_integration_test.cjs
 *
 * Этап 10 (docs/economic2.md) — финальное тестирование.
 * Проверяет, что все 8 улучшений economy_ext работают вместе и не
 * ломают друг друга, а также удовлетворяют чеклист этапа 10:
 *   • все глобальные функции экспортированы;
 *   • 5 тиков runEconomyExtTick() проходят без TypeError/ReferenceError;
 *   • trade_history содержит записи после тиков;
 *   • inflation — число от 0 до 0.25 для каждой нации;
 *   • economic_cycle.current — одна из допустимых строк;
 *   • tech_drift.bonus — число от 0 до 0.20;
 *   • сохранение/загрузка (JSON round-trip) сохраняет economy_ext;
 *   • trade_history ограничен и не растёт бесконечно;
 *   • _tpRenderEconomyExtSummary() не падает для реальных состояний.
 *
 * Запуск: node tests/eco_stage10_final_integration_test.cjs
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else      { console.error('  ✗ ' + msg); failed++; }
}

// ── 1. Загружаем engine/economy_ext.js в изолированный sandbox ──────
const extSrc = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy_ext.js'),
  'utf8',
);

const logs = [];
const sandbox = {
  console: {
    log:   (...a) => logs.push(['log',  ...a]),
    warn:  (...a) => logs.push(['warn', ...a]),
    error: (...a) => logs.push(['err',  ...a]),
  },
  GAME_STATE: null,
  STRATEGIC_GOODS: ['iron', 'horses', 'salt', 'timber', 'silk'],
  GOODS: {
    wheat:  { name: 'Пшеница' },
    iron:   { name: 'Железо'  },
    silk:   { name: 'Шёлк'    },
    horses: { name: 'Лошади'  },
    barley: { name: 'Ячмень'  },
  },
  CONFIG: { BALANCE: {
    INFANTRY_UPKEEP: 2, CAVALRY_UPKEEP: 4, MERCENARY_UPKEEP: 3,
  } },
  addEventLog: () => {},
  addLog:      () => {},
  getWorldMarketTransportCost: () => 0.25,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(extSrc, sandbox, { filename: 'engine/economy_ext.js' });

// ── 2. Извлекаем _tpRenderEconomyExtSummary() из treasury-panel.js ──
const tpSrc = fs.readFileSync(
  path.join(__dirname, '..', 'ui', 'treasury-panel.js'),
  'utf8',
);
const tpStart = tpSrc.indexOf('function _tpRenderEconomyExtSummary');
if (tpStart < 0) {
  console.error('ERROR: _tpRenderEconomyExtSummary не найдена в treasury-panel.js');
  process.exit(1);
}
let depth = 0, tpEnd = -1;
for (let i = tpStart; i < tpSrc.length; i++) {
  const ch = tpSrc[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { tpEnd = i + 1; break; } }
}
vm.runInContext(
  tpSrc.slice(tpStart, tpEnd) +
  '\nthis._tpRenderEconomyExtSummary = _tpRenderEconomyExtSummary;',
  sandbox, { filename: 'ui/treasury-panel.js (stub)' },
);

// Глобалы берём из sandbox (не из require).
const W = sandbox;

// ══════════════════════════════════════════════════════════════════
// Утилита: сборка «реалистичного» GAME_STATE с двумя нациями.
// ══════════════════════════════════════════════════════════════════
function freshWorld() {
  sandbox.GAME_STATE = {
    turn: 0,
    player_nation: 'rome',
    nations: {
      rome: {
        regions: ['r1', 'r2'],
        armies: {
          a1: { infantry: 100, cavalry: 20, mercenaries: 0 },
        },
        economy: {
          treasury: 1000,
          income_per_turn: 200,
          _income_breakdown: {
            total: 200, trade_profit: 50, port_duties: 5, tariff_income: 0,
          },
          _expense_breakdown: {
            army_base: 180,
            army_infantry: 150,
            army_cavalry:   30,
            army_mercenaries: 0,
          },
          expense_levels: { army: 1.0 },
          stockpile: { wheat: 0, iron: 0 },
        },
      },
      egypt: {
        regions: ['r3'],
        armies: {},
        economy: {
          treasury: 500,
          income_per_turn: 100,
          _income_breakdown: { total: 100, trade_profit: 0 },
          _expense_breakdown: {},
          expense_levels: { army: 1.0 },
          stockpile: {},
        },
      },
    },
    regions: {
      r1: {
        id: 'r1', owner: 'rome',
        building_slots: [{ status: 'active' }],
        _production_last_tick: { wheat: 100, iron: 20 },
        local_stockpile: {},
      },
      r2: {
        id: 'r2', owner: 'rome',
        building_slots: [],
        _production_last_tick: { barley: 40 },
        local_stockpile: {},
      },
      r3: {
        id: 'r3', owner: 'egypt',
        building_slots: [{ status: 'active' }],
        _production_last_tick: { horses: 10 },
        local_stockpile: {},
      },
    },
    market: {
      wheat:  { price: 10, _world_bought_tick: {} },
      iron:   { price: 40, _world_bought_tick: { rome: 2 } },
      horses: { price: 80, _world_bought_tick: {} },
      silk:   { price: 60, _world_bought_tick: {} },
    },
    diplomacy: { relations: {} },
  };
  W.initEconomyExt();
}

// ══════════════════════════════════════════════════════════════════
// TEST 1: Все 8+ функций экспортированы.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: экспорт всех функций расширения ===');
const expectedFns = [
  'initEconomyExt', 'runEconomyExtTick', 'calcTradeBalance',
  'detectMonopolies', 'getMonopolyPriceMult',
  'updateRegionSpecialization', 'getRegionSpecBonus',
  'updateInflation', 'getInflationMult',
  'updateEconomicCycle', 'getCycleMult', 'getEconomicCycleBanner',
  'calcNormalArmyExpense', 'getArmyFundingRatio', 'getArmyCombatMult',
  'updateArmyFunding',
  'updateTechDrift', 'getTechDriftMult', 'renderTechDrift',
  'hasRegionBuildings', 'renderRegionProductionEfficiency',
];
for (const fn of expectedFns) {
  assert(typeof W[fn] === 'function', `${fn} экспортирована в window`);
}

// Минимальный набор по чеклисту этапа 10.
const stage10Fns = [
  'calcTradeBalance', 'detectMonopolies', 'updateInflation',
  'getInflationMult', 'getCycleMult', 'getArmyCombatMult',
  'getTechDriftMult', 'getArmyFundingRatio',
];
for (const fn of stage10Fns) {
  assert(typeof W[fn] === 'function',
    `чеклист этапа 10: ${fn} доступна глобально`);
}

// ══════════════════════════════════════════════════════════════════
// TEST 2: 5 тиков runEconomyExtTick() проходят без исключений.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: 5 тиков runEconomyExtTick() без ошибок ===');
freshWorld();
let tickErr = null;
try {
  for (let i = 0; i < 5; i++) {
    sandbox.GAME_STATE.turn = i + 1;
    W.runEconomyExtTick();
  }
} catch (e) { tickErr = e; }
assert(tickErr === null, `5 тиков выполнены без исключений (err=${tickErr})`);

// Проверяем, что не было TypeError / ReferenceError в warn-логах.
const hasTypeErr = logs.some(l =>
  String(l[1] ?? '').match(/TypeError|ReferenceError/),
);
assert(!hasTypeErr, 'в warn-логах нет TypeError/ReferenceError');

// ══════════════════════════════════════════════════════════════════
// TEST 3: economy_ext проинициализирован и содержит все поля.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: структура economy_ext после тиков ===');
const ext = sandbox.GAME_STATE.economy_ext;
assert(ext && typeof ext === 'object', 'economy_ext — объект');
assert(typeof ext.region_specialization === 'object',
  'economy_ext.region_specialization — объект');
assert(typeof ext.inflation === 'object',
  'economy_ext.inflation — объект');
assert(ext.economic_cycle && typeof ext.economic_cycle === 'object',
  'economy_ext.economic_cycle — объект');
assert(typeof ext.monopolies === 'object',
  'economy_ext.monopolies — объект');
assert(Array.isArray(ext.trade_history),
  'economy_ext.trade_history — массив');
assert(ext.tech_drift && typeof ext.tech_drift === 'object',
  'economy_ext.tech_drift — объект (ленивая инициализация)');

// ══════════════════════════════════════════════════════════════════
// TEST 4: trade_history заполнен и ограничен по длине.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: trade_history заполняется и ограничен ===');
assert(ext.trade_history.length === 5,
  `trade_history содержит 5 записей после 5 тиков (факт: ${ext.trade_history.length})`);
assert(ext.trade_history[0].balance_by_nation.rome !== undefined,
  'запись trade_history содержит balance_by_nation.rome');
assert(typeof ext.trade_history[0].balance_by_nation.rome.net === 'number',
  'net — число');

// Прогоняем ещё 30 тиков и проверяем, что длина не растёт бесконечно.
for (let i = 0; i < 30; i++) {
  sandbox.GAME_STATE.turn++;
  W.runEconomyExtTick();
}
assert(ext.trade_history.length <= 24,
  `trade_history ограничен (≤24): факт ${ext.trade_history.length}`);
assert(ext.trade_history.length >= 1,
  'trade_history не очищается полностью');

// ══════════════════════════════════════════════════════════════════
// TEST 5: inflation для каждой нации — число от 0 до 0.25.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: inflation в диапазоне [0, 0.25] ===');
// Создадим ситуацию с переполненной казной для rome.
freshWorld();
sandbox.GAME_STATE.nations.rome.economy.treasury = 10000; // 50× дохода
sandbox.GAME_STATE.nations.rome.economy._income_breakdown.total = 200;
for (let i = 0; i < 40; i++) {
  sandbox.GAME_STATE.turn = i + 1;
  W.runEconomyExtTick();
}
const infl = sandbox.GAME_STATE.economy_ext.inflation;
for (const [nId, v] of Object.entries(infl)) {
  assert(typeof v === 'number' && v >= 0 && v <= 0.25 + 1e-9,
    `inflation.${nId} = ${v} ∈ [0, 0.25]`);
}
// После 40 тиков при ratio=50× инфляция должна упереться в потолок.
assert(infl.rome >= 0.20,
  `rome при переполнении казны достигла высокой инфляции (${infl.rome})`);
assert(W.getInflationMult('rome') <= 1.25 + 1e-9,
  `getInflationMult(rome) ≤ 1.25 (факт ${W.getInflationMult('rome')})`);

// ══════════════════════════════════════════════════════════════════
// TEST 6: economic_cycle.current — одна из допустимых строк.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: economic_cycle.current валидна ===');
const allowedCycles = ['normal', 'boom', 'recession'];
assert(allowedCycles.includes(ext.economic_cycle.current),
  `cycle.current ∈ {normal,boom,recession}: ${ext.economic_cycle.current}`);
assert(typeof ext.economic_cycle.turns_left === 'number',
  'cycle.turns_left — число');
assert(typeof ext.economic_cycle.next_check_turn === 'number',
  'cycle.next_check_turn — число');
// getCycleMult для не-food возвращает 1.0 вне зависимости от цикла.
assert(W.getCycleMult('iron') === 1.0,
  'getCycleMult(iron) = 1.0 (не-food)');

// ══════════════════════════════════════════════════════════════════
// TEST 7: tech_drift.bonus в диапазоне [0, 0.20].
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: tech_drift.bonus ∈ [0, 0.20] ===');
freshWorld();
// Прогоняем игру до turn=2000 — должны упереться в потолок.
for (let t = 1; t <= 2000; t += 10) {
  sandbox.GAME_STATE.turn = t;
  W.updateTechDrift();
}
const td = sandbox.GAME_STATE.economy_ext.tech_drift;
assert(typeof td.bonus === 'number',
  'tech_drift.bonus — число');
assert(td.bonus >= 0 && td.bonus <= 0.20 + 1e-9,
  `tech_drift.bonus = ${td.bonus} ∈ [0, 0.20]`);
assert(Math.abs(td.bonus - 0.20) < 1e-9,
  `за 2000 ходов tech_drift достиг потолка 0.20 (факт ${td.bonus})`);
assert(W.getTechDriftMult() <= 1.20 + 1e-9,
  `getTechDriftMult() ≤ 1.20 (факт ${W.getTechDriftMult()})`);

// В начале игры (turn=0) tech_drift = 1.0.
freshWorld();
sandbox.GAME_STATE.turn = 0;
W.updateTechDrift();
assert(W.getTechDriftMult() === 1.0,
  'getTechDriftMult() = 1.0 в начале игры');

// После 5 циклов (turn=600) — 1.10.
freshWorld();
sandbox.GAME_STATE.turn = 600;
W.updateTechDrift();
assert(Math.abs(W.getTechDriftMult() - 1.10) < 1e-9,
  `getTechDriftMult() = 1.10 после 5 циклов (факт ${W.getTechDriftMult()})`);

// ══════════════════════════════════════════════════════════════════
// TEST 8: Save / Load — JSON round-trip сохраняет economy_ext.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: save/load сохраняет economy_ext ===');
freshWorld();
// Наполним состояние реальными данными — прогон 10 тиков, затем
// руками добавим монополии, спец и инфляцию.
for (let i = 0; i < 10; i++) {
  sandbox.GAME_STATE.turn = i + 1;
  W.runEconomyExtTick();
}
const e = sandbox.GAME_STATE.economy_ext;
e.monopolies = { iron: 'rome' };
e.region_specialization.r1 = { good: 'wheat', streak: 12, bonus: 1.05 };
e.inflation.rome = 0.08;
e.tech_drift = { bonus: 0.06, last_tick: 360 };

const serialized = JSON.stringify(sandbox.GAME_STATE);
assert(typeof serialized === 'string' && serialized.length > 0,
  'GAME_STATE сериализуется в JSON');

const restored = JSON.parse(serialized);
sandbox.GAME_STATE = restored;
// После восстановления initEconomyExt() должен быть идемпотентным.
W.initEconomyExt();
const r = sandbox.GAME_STATE.economy_ext;
assert(r.monopolies.iron === 'rome',
  'после round-trip monopolies.iron = rome');
assert(r.region_specialization.r1?.good === 'wheat' &&
       r.region_specialization.r1?.streak === 12,
  'region_specialization сохранена');
assert(Math.abs(r.inflation.rome - 0.08) < 1e-9,
  'inflation.rome сохранена (0.08)');
assert(r.tech_drift.bonus === 0.06 && r.tech_drift.last_tick === 360,
  'tech_drift сохранён (bonus=0.06, last_tick=360)');
assert(Array.isArray(r.trade_history),
  'trade_history сохранён как массив');

// Геттеры корректно читают восстановленное состояние.
assert(Math.abs(W.getInflationMult('rome') - 1.08) < 1e-9,
  `getInflationMult(rome) после load = 1.08 (факт ${W.getInflationMult('rome')})`);
assert(Math.abs(W.getTechDriftMult() - 1.06) < 1e-9,
  `getTechDriftMult() после load = 1.06 (факт ${W.getTechDriftMult()})`);
assert(W.getMonopolyPriceMult('rome', 'iron') === 1.20,
  'getMonopolyPriceMult(rome,iron) = 1.20 после load');
assert(W.getRegionSpecBonus('r1', 'wheat') === 1.05,
  'getRegionSpecBonus(r1, wheat) = 1.05 после load');

// Ещё тик после load — ничего не должно упасть.
let postLoadErr = null;
try {
  sandbox.GAME_STATE.turn++;
  W.runEconomyExtTick();
} catch (ex) { postLoadErr = ex; }
assert(postLoadErr === null,
  `тик после save/load не падает (err=${postLoadErr})`);

// ══════════════════════════════════════════════════════════════════
// TEST 9: _tpRenderEconomyExtSummary() не кидает ошибок.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: панель казны не падает на реальных состояниях ===');
freshWorld();
let panelErr = null;
let html = '';
try { html = W._tpRenderEconomyExtSummary(); } catch (ex) { panelErr = ex; }
assert(panelErr === null, 'чистое состояние — панель не падает');
assert(html === '', 'чистое состояние — пустая строка');

// Ситуация с максимумом нагрузок.
freshWorld();
sandbox.GAME_STATE.economy_ext.inflation.rome = 0.18;
sandbox.GAME_STATE.economy_ext.monopolies = { iron: 'rome', silk: 'rome' };
sandbox.GAME_STATE.economy_ext.economic_cycle.current    = 'boom';
sandbox.GAME_STATE.economy_ext.economic_cycle.turns_left = 10;
// Понизим финансирование армии: фактические выплаты < 80% нормы.
sandbox.GAME_STATE.nations.rome.economy._expense_breakdown.army_infantry = 50;
sandbox.GAME_STATE.nations.rome.economy._expense_breakdown.army_cavalry  = 0;
let panelErr2 = null;
let html2 = '';
try { html2 = W._tpRenderEconomyExtSummary(); } catch (ex) { panelErr2 = ex; }
assert(panelErr2 === null, 'максимум нагрузок — панель не падает');
assert(html2.includes('tp-eco-summary'),
  'максимум нагрузок: блок tp-eco-summary присутствует');
assert(html2.includes('Инфляция') && html2.includes('Монополии'),
  'в сводке одновременно инфляция + монополии');

// ══════════════════════════════════════════════════════════════════
// TEST 10: Кросс-взаимодействие. detectMonopolies → монополия rome
// на iron → +20% к цене.
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: кросс-связи между улучшениями ===');
freshWorld();
// Только rome производит iron (r1 уже производит iron=20, egypt не произв.)
W.detectMonopolies();
assert(sandbox.GAME_STATE.economy_ext.monopolies.iron === 'rome',
  'detectMonopolies обнаружил монополию rome на iron');
assert(W.getMonopolyPriceMult('rome', 'iron') === 1.20,
  'монополист получает +20% к цене продажи');
assert(W.getMonopolyPriceMult('egypt', 'iron') === 1.0,
  'немонополист получает 1.0');

// Спец-бонус: продлим стрик на r1/wheat на 11 тиков.
freshWorld();
for (let i = 0; i < 11; i++) {
  sandbox.GAME_STATE.regions.r1._production_last_tick = { wheat: 100 };
  sandbox.GAME_STATE.regions.r2._production_last_tick = {};
  sandbox.GAME_STATE.regions.r3._production_last_tick = {};
  W.updateRegionSpecialization();
}
const spec = sandbox.GAME_STATE.economy_ext.region_specialization.r1;
assert(spec && spec.good === 'wheat',
  'r1 специализирован на wheat');
assert(spec.streak >= 10, `streak ≥ 10 (факт ${spec.streak})`);
assert(spec.bonus >= 1.05,
  `bonus ≥ 1.05 после 10+ тиков (факт ${spec.bonus})`);
assert(W.getRegionSpecBonus('r1', 'wheat') >= 1.05,
  'getRegionSpecBonus(r1, wheat) ≥ 1.05');
assert(W.getRegionSpecBonus('r1', 'iron') === 1.0,
  'getRegionSpecBonus(r1, iron) = 1.0 (не спец-товар)');

// Штраф за недофинансирование.
freshWorld();
sandbox.GAME_STATE.nations.rome.economy._expense_breakdown.army_infantry = 0;
sandbox.GAME_STATE.nations.rome.economy._expense_breakdown.army_cavalry  = 0;
W.updateArmyFunding();
const fund = sandbox.GAME_STATE.nations.rome.economy._army_funding;
assert(fund && typeof fund.ratio === 'number',
  '_army_funding кэширован в economy');
assert(fund.ratio < 0.80,
  `ratio < 0.80 при нулевых выплатах (факт ${fund.ratio})`);
assert(Math.abs(W.getArmyCombatMult('rome') - 0.85) < 1e-9,
  `combat mult = 0.85 при ratio=0 (факт ${W.getArmyCombatMult('rome')})`);

// ══════════════════════════════════════════════════════════════════
// TEST 11: Базовые поля (чеклист этапа 10, последние пункты).
// ══════════════════════════════════════════════════════════════════
console.log('\n=== TEST 11: валидация базовых полей после тика ===');
freshWorld();
sandbox.GAME_STATE.turn = 1;
W.runEconomyExtTick();

// trade_history содержит хотя бы одну запись (чеклист).
assert(sandbox.GAME_STATE.economy_ext.trade_history.length >= 1,
  'после тика trade_history содержит записи');

// economic_cycle.current — строка.
const curCycle = sandbox.GAME_STATE.economy_ext.economic_cycle.current;
assert(typeof curCycle === 'string',
  'economic_cycle.current — строка');
assert(['normal', 'boom', 'recession'].includes(curCycle),
  `допустимое значение: ${curCycle}`);

// tech_drift.bonus — число от 0 до 0.20.
const tdB = sandbox.GAME_STATE.economy_ext.tech_drift?.bonus ?? 0;
assert(typeof tdB === 'number' && tdB >= 0 && tdB <= 0.20 + 1e-9,
  `tech_drift.bonus = ${tdB} ∈ [0, 0.20]`);

// ── ИТОГ ──
console.log('\n════════════════════════════════════════════════════════════');
console.log(`  ИТОГО: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
