/**
 * tests/eco_stage8_production_tooltips_test.cjs
 *
 * Этап 8 (docs/economic2.md) — тултипы эффективности производства.
 * Node-stub: подгружает engine/economy_ext.js в vm-контексте и
 * проверяет hasRegionBuildings() / renderRegionProductionEfficiency()
 * во всех комбинациях бонусов и штрафов.
 *
 * Запуск: node tests/eco_stage8_production_tooltips_test.cjs
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

const src = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy_ext.js'),
  'utf8',
);

const sandbox = {
  console,
  GAME_STATE: null,
  STRATEGIC_GOODS: ['iron', 'horses', 'salt', 'timber'],
  GOODS: {
    wheat:  { name: 'Пшеница' },
    iron:   { name: 'Железо'  },
    olives: { name: 'Оливки'  },
  },
  addEventLog: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'engine/economy_ext.js' });

const {
  initEconomyExt,
  hasRegionBuildings,
  renderRegionProductionEfficiency,
  UNORGANIZED_PENALTY,
  updateTechDrift,
} = sandbox;

function freshState(turn = 0) {
  sandbox.GAME_STATE = {
    turn,
    player_nation: 'rome',
    nations: { rome: { regions: ['r1'], economy: { treasury: 0, _income_breakdown: {}, _expense_breakdown: {} } } },
    regions: {
      r1: { id: 'r1', building_slots: [], _production_last_tick: {} },
    },
    market: {},
  };
  initEconomyExt();
}

// ══════════════════════════════════════════════════════════════
// TEST 1: экспорты и константы
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: экспорты и константы ===');
assert(typeof hasRegionBuildings === 'function',
  'hasRegionBuildings экспортирована');
assert(typeof renderRegionProductionEfficiency === 'function',
  'renderRegionProductionEfficiency экспортирована');
assert(Math.abs(UNORGANIZED_PENALTY - 0.35) < 1e-9,
  'UNORGANIZED_PENALTY = 0.35 (1 − SUBSISTENCE_FACTOR)');

// ══════════════════════════════════════════════════════════════
// TEST 2: hasRegionBuildings — пустые/null/undefined slots
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: hasRegionBuildings (пустой регион) ===');
assert(hasRegionBuildings(null) === false, 'null → false');
assert(hasRegionBuildings(undefined) === false, 'undefined → false');
assert(hasRegionBuildings({}) === false, 'пустой объект → false');
assert(hasRegionBuildings({ building_slots: null }) === false, 'slots=null → false');
assert(hasRegionBuildings({ building_slots: [] }) === false, 'пустой массив → false');
assert(
  hasRegionBuildings({ building_slots: [{ status: 'construction' }] }) === false,
  'только строящиеся слоты → false',
);

// ══════════════════════════════════════════════════════════════
// TEST 3: hasRegionBuildings — активные здания
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: hasRegionBuildings (активные здания) ===');
assert(
  hasRegionBuildings({ building_slots: [{ status: 'active', building_id: 'farm' }] }) === true,
  'один активный слот → true',
);
assert(
  hasRegionBuildings({
    building_slots: [
      { status: 'construction' },
      { status: 'active', building_id: 'mine' },
    ],
  }) === true,
  'смешанные слоты, есть один активный → true',
);
// Обратная совместимость со спецификацией (slot.type без status)
assert(
  hasRegionBuildings({ building_slots: [{ type: 'farm' }] }) === true,
  'legacy slot.type без status → true',
);

// ══════════════════════════════════════════════════════════════
// TEST 4: renderRegionProductionEfficiency — регион без зданий
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: регион без зданий показывает штраф ===');
freshState(0);
const html1 = renderRegionProductionEfficiency('r1');
assert(html1.includes('Неорганизованное производство'),
  'выводится строка «Неорганизованное производство»');
assert(html1.includes('−35%') || html1.includes('-35%'),
  'штраф указан как −35%');
assert(html1.includes('eco-eff-warn'),
  'используется CSS-класс eco-eff-warn');
assert(html1.includes('eco-eff-block'),
  'оборачивается в eco-eff-block');
assert(html1.includes('eco-eff-hint'),
  'есть подсказка «Постройте здания»');

// ══════════════════════════════════════════════════════════════
// TEST 5: регион с активным зданием НЕ показывает штраф
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: регион с активным зданием без штрафа ===');
freshState(0);
sandbox.GAME_STATE.regions.r1.building_slots = [
  { status: 'active', building_id: 'farm' },
];
const html2 = renderRegionProductionEfficiency('r1');
assert(!html2.includes('Неорганизованное производство'),
  'нет строки о неорганизованном производстве');
// В этом тесте нет ни spec-бонуса, ни tech-дрейфа, ни цикла —
// значит функция возвращает пустую строку.
assert(html2 === '',
  'пустой результат при отсутствии активных бонусов/штрафов');

// ══════════════════════════════════════════════════════════════
// TEST 6: специализация региона отображается при streak ≥ 10
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: специализация региона в тултипе ===');
freshState(0);
sandbox.GAME_STATE.regions.r1.building_slots = [
  { status: 'active', building_id: 'farm' },
];
sandbox.GAME_STATE.economy_ext.region_specialization.r1 = {
  good: 'wheat', streak: 12, bonus: 1.05,
};
const html3 = renderRegionProductionEfficiency('r1');
assert(html3.includes('Специализация'),
  'строка «Специализация» присутствует');
assert(html3.includes('Пшеница'),
  'используется человекочитаемое название товара');
assert(html3.includes('12 ходов'),
  'указан streak в ходах');
assert(html3.includes('+5%'),
  'указан бонус +5%');
assert(html3.includes('eco-eff-pos'),
  'используется CSS-класс eco-eff-pos');

// bonus = 1.0 → строка специализации не выводится
sandbox.GAME_STATE.economy_ext.region_specialization.r1 = {
  good: 'wheat', streak: 3, bonus: 1.0,
};
const html3b = renderRegionProductionEfficiency('r1');
assert(!html3b.includes('Специализация'),
  'при bonus=1.0 строка специализации не выводится');

// ══════════════════════════════════════════════════════════════
// TEST 7: технологический дрейф в тултипе
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: Уровень ремёсел в тултипе ===');
freshState(0);
sandbox.GAME_STATE.regions.r1.building_slots = [
  { status: 'active', building_id: 'farm' },
];
// Ручное выставление bonus
sandbox.GAME_STATE.economy_ext.tech_drift = { bonus: 0.08, last_tick: 480 };
const html4 = renderRegionProductionEfficiency('r1');
assert(html4.includes('Уровень ремёсел'),
  'строка «Уровень ремёсел» присутствует');
assert(html4.includes('+8%'),
  'указан тек. бонус +8%');

// bonus = 0 → строка не выводится
sandbox.GAME_STATE.economy_ext.tech_drift = { bonus: 0, last_tick: 0 };
const html4b = renderRegionProductionEfficiency('r1');
assert(!html4b.includes('Уровень ремёсел'),
  'при bonus=0 строка уровня ремёсел не выводится');

// ══════════════════════════════════════════════════════════════
// TEST 8: экономический цикл в тултипе
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: Экономический цикл в тултипе ===');
freshState(0);
sandbox.GAME_STATE.regions.r1.building_slots = [
  { status: 'active', building_id: 'farm' },
];
sandbox.GAME_STATE.economy_ext.economic_cycle = {
  current: 'boom', turns_left: 8, next_check_turn: 60,
};
const html5 = renderRegionProductionEfficiency('r1');
assert(html5.includes('Экономический цикл'),
  'строка «Экономический цикл» присутствует');
assert(html5.includes('+15%'),
  'указан бонус +15% для boom');
assert(html5.includes('🌾'),
  'используется эмоджи 🌾 для boom');
assert(html5.includes('eco-eff-pos'),
  'boom использует класс eco-eff-pos');

sandbox.GAME_STATE.economy_ext.economic_cycle = {
  current: 'recession', turns_left: 6, next_check_turn: 60,
};
const html5b = renderRegionProductionEfficiency('r1');
assert(html5b.includes('−18%') || html5b.includes('-18%'),
  'указан штраф −18% для recession');
assert(html5b.includes('🌧'),
  'используется эмоджи 🌧 для recession');
assert(html5b.includes('eco-eff-neg'),
  'recession использует класс eco-eff-neg');

// current=normal → цикл не выводится
sandbox.GAME_STATE.economy_ext.economic_cycle = {
  current: 'normal', turns_left: 0, next_check_turn: 60,
};
const html5c = renderRegionProductionEfficiency('r1');
assert(!html5c.includes('Экономический цикл'),
  'при current=normal цикл не выводится');

// ══════════════════════════════════════════════════════════════
// TEST 9: комбинация нескольких бонусов в одном блоке
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: комбинация бонусов ===');
freshState(0);
// Регион без зданий + спец-бонус + tech-дрейф + boom-цикл
sandbox.GAME_STATE.regions.r1.building_slots = [];
sandbox.GAME_STATE.economy_ext.region_specialization.r1 = {
  good: 'olives', streak: 20, bonus: 1.10,
};
sandbox.GAME_STATE.economy_ext.tech_drift = { bonus: 0.04, last_tick: 240 };
sandbox.GAME_STATE.economy_ext.economic_cycle = {
  current: 'boom', turns_left: 5, next_check_turn: 100,
};
const html6 = renderRegionProductionEfficiency('r1');
const rowCount = (html6.match(/class="eco-eff-row/g) || []).length;
assert(rowCount === 4,
  `четыре строки в тултипе (штраф + spec + tech + cycle), факт: ${rowCount}`);
assert(html6.includes('Неорганизованное') && html6.includes('Оливки') &&
       html6.includes('Уровень ремёсел') && html6.includes('Экономический цикл'),
  'все четыре блока присутствуют одновременно');

// ══════════════════════════════════════════════════════════════
// TEST 10: нулевые бонусы — возвращается пустая строка
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: без активных бонусов — пустая строка ===');
freshState(0);
sandbox.GAME_STATE.regions.r1.building_slots = [
  { status: 'active', building_id: 'farm' },
];
// Никаких экстра-бонусов
const html7 = renderRegionProductionEfficiency('r1');
assert(html7 === '',
  'функция возвращает пустую строку при отсутствии бонусов');

// Неизвестный регион тоже возвращает пустую строку
const html8 = renderRegionProductionEfficiency('unknown_region');
assert(html8 === '',
  'неизвестный регион → пустая строка');

// Отсутствующий GAME_STATE
sandbox.GAME_STATE = null;
const html9 = renderRegionProductionEfficiency('r1');
assert(html9 === '',
  'GAME_STATE = null → пустая строка (нет падений)');

// ══════════════════════════════════════════════════════════════
// TEST 11: тултип не показывает нулевые бонусы (чеклист строки 5)
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 11: нулевые значения не попадают в тултип ===');
freshState(0);
sandbox.GAME_STATE.regions.r1.building_slots = [
  { status: 'active', building_id: 'farm' },
];
// spec.bonus = 1.00 и tech.bonus = 0 и cycle=normal
sandbox.GAME_STATE.economy_ext.region_specialization.r1 = {
  good: 'iron', streak: 2, bonus: 1.00,
};
sandbox.GAME_STATE.economy_ext.tech_drift = { bonus: 0, last_tick: 0 };
sandbox.GAME_STATE.economy_ext.economic_cycle = {
  current: 'normal', turns_left: 0, next_check_turn: 60,
};
const html10 = renderRegionProductionEfficiency('r1');
assert(html10 === '',
  'все бонусы на нулевом/базовом уровне → пустая строка');

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log(`  ИТОГО: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
