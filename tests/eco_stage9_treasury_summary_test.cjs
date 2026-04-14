/**
 * tests/eco_stage9_treasury_summary_test.cjs
 *
 * Этап 9 (docs/economic2.md) — единый итоговый блок экономики в казне.
 * Node-stub: извлекает из ui/treasury-panel.js функцию
 * _tpRenderEconomyExtSummary() и подгружает её в vm-контексте вместе с
 * engine/economy_ext.js, затем проверяет все комбинации
 * предупреждений/бонусов.
 *
 * Запуск: node tests/eco_stage9_treasury_summary_test.cjs
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

// ── 1. Загружаем engine/economy_ext.js ──────────────────────────
const extSrc = fs.readFileSync(
  path.join(__dirname, '..', 'engine', 'economy_ext.js'),
  'utf8',
);

const sandbox = {
  console,
  GAME_STATE: null,
  STRATEGIC_GOODS: ['iron', 'horses', 'salt', 'timber', 'silk'],
  GOODS: {
    wheat:  { name: 'Пшеница' },
    iron:   { name: 'Железо'  },
    silk:   { name: 'Шёлк'    },
    horses: { name: 'Лошади'  },
  },
  CONFIG: { BALANCE: {} },
  addEventLog: () => {},
  addLog: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(extSrc, sandbox, { filename: 'engine/economy_ext.js' });

// ── 2. Извлекаем функцию _tpRenderEconomyExtSummary из treasury-panel.js ─
const tpSrc = fs.readFileSync(
  path.join(__dirname, '..', 'ui', 'treasury-panel.js'),
  'utf8',
);

// Регуляркой извлекаем тело _tpRenderEconomyExtSummary и сопутствующую
// регистрацию в window. Ищем от "function _tpRenderEconomyExtSummary" до
// закрывающей скобки блока регистрации окна.
const startIdx = tpSrc.indexOf('function _tpRenderEconomyExtSummary');
if (startIdx < 0) {
  console.error('ERROR: _tpRenderEconomyExtSummary не найдена в ui/treasury-panel.js');
  process.exit(1);
}
// Найдём закрывающую скобку тела функции — простым сканированием.
let depth = 0;
let funcEnd = -1;
for (let i = startIdx; i < tpSrc.length; i++) {
  const ch = tpSrc[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { funcEnd = i + 1; break; }
  }
}
if (funcEnd < 0) {
  console.error('ERROR: не найдена закрывающая скобка _tpRenderEconomyExtSummary');
  process.exit(1);
}
const fnSource = tpSrc.slice(startIdx, funcEnd);

// Инжектим функцию в тот же sandbox, что и economy_ext.
vm.runInContext(fnSource + '\nthis._tpRenderEconomyExtSummary = _tpRenderEconomyExtSummary;',
  sandbox, { filename: 'ui/treasury-panel.js (stub)' });

const { _tpRenderEconomyExtSummary, initEconomyExt } = sandbox;

function freshState({
  inflation = 0,
  monopolies = {},
  cycle = 'normal',
  armyRatio = 1.0,
} = {}) {
  sandbox.GAME_STATE = {
    turn: 10,
    player_nation: 'rome',
    nations: {
      rome: {
        regions: ['r1'],
        economy: {
          treasury: 1000,
          income_per_turn: 200,
          _income_breakdown: {},
          _expense_breakdown: { army_base: 100, army_infantry: 100 * armyRatio },
          expense_levels: { army: 1.0 },
        },
        armies: {},
      },
      egypt: {
        regions: ['r2'],
        economy: { treasury: 0, _income_breakdown: {}, _expense_breakdown: {} },
        armies: {},
      },
    },
    regions: {
      r1: { id: 'r1', owner: 'rome', building_slots: [], _production_last_tick: {} },
      r2: { id: 'r2', owner: 'egypt', building_slots: [], _production_last_tick: {} },
    },
    market: {},
  };
  initEconomyExt();
  const ext = sandbox.GAME_STATE.economy_ext;
  ext.inflation.rome = inflation;
  ext.monopolies = { ...monopolies };
  ext.economic_cycle.current = cycle;
  ext.economic_cycle.turns_left = (cycle === 'normal') ? 0 : 8;
}

// ══════════════════════════════════════════════════════════════
// TEST 1: экспорт функции
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 1: экспорт _tpRenderEconomyExtSummary ===');
assert(typeof _tpRenderEconomyExtSummary === 'function',
  '_tpRenderEconomyExtSummary извлекается из treasury-panel.js как функция');

// ══════════════════════════════════════════════════════════════
// TEST 2: пустое состояние — пустая строка
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: нормальное состояние — лишних блоков нет ===');
freshState();
const emptyHtml = _tpRenderEconomyExtSummary();
assert(emptyHtml === '',
  'при отсутствии предупреждений возвращается пустая строка');

// ══════════════════════════════════════════════════════════════
// TEST 3: только инфляция
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: инфляция → блок tp-eco-warn ===');
freshState({ inflation: 0.12 });
const inflHtml = _tpRenderEconomyExtSummary();
assert(inflHtml.includes('tp-eco-summary'),
  'выводится обёртка tp-eco-summary');
assert(inflHtml.includes('tp-eco-warn'),
  'присутствует класс tp-eco-warn для инфляции');
assert(inflHtml.includes('Инфляция'),
  'текст «Инфляция» в блоке');
assert(inflHtml.includes('+12%'),
  'процент инфляции округлён до целого (+12%)');

// Инфляция < 1% — блок НЕ появляется
console.log('\n=== TEST 3b: инфляция < 1% не выводится ===');
freshState({ inflation: 0.004 });
assert(_tpRenderEconomyExtSummary() === '',
  'инфляция 0.4% не попадает в сводку (порог 1%)');

// ══════════════════════════════════════════════════════════════
// TEST 4: только монополии
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: монополии → блок tp-eco-bonus ===');
freshState({ monopolies: { iron: 'rome', silk: 'rome', horses: 'egypt' } });
const monoHtml = _tpRenderEconomyExtSummary();
assert(monoHtml.includes('tp-eco-bonus'),
  'присутствует класс tp-eco-bonus');
assert(monoHtml.includes('Монополии'),
  'текст «Монополии» в блоке');
assert(monoHtml.includes('Железо') && monoHtml.includes('Шёлк'),
  'выведены локализованные имена товаров (Железо, Шёлк)');
assert(!monoHtml.includes('Лошади'),
  'чужая монополия (horses→egypt) НЕ в блоке игрока');

// Монополия только у соперника — блок не появляется
console.log('\n=== TEST 4b: монополия у чужака не выводится ===');
freshState({ monopolies: { iron: 'egypt' } });
assert(_tpRenderEconomyExtSummary() === '',
  'монополия соперника не добавляет блок в сводку игрока');

// ══════════════════════════════════════════════════════════════
// TEST 5: только экономический цикл
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: активный цикл → блок tp-eco-cycle ===');
freshState({ cycle: 'boom' });
const boomHtml = _tpRenderEconomyExtSummary();
assert(boomHtml.includes('tp-eco-cycle'),
  'присутствует класс tp-eco-cycle для boom');
assert(boomHtml.includes('ещё 8 ходов'),
  'число оставшихся ходов выведено');

freshState({ cycle: 'recession' });
const recHtml = _tpRenderEconomyExtSummary();
assert(recHtml.includes('tp-eco-cycle'),
  'recession также использует tp-eco-cycle');

// Нормальный цикл — блок отсутствует
freshState({ cycle: 'normal' });
assert(_tpRenderEconomyExtSummary() === '',
  'normal цикл не добавляет блок');

// ══════════════════════════════════════════════════════════════
// TEST 6: только армия недофинансирована
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 6: армия недофинансирована → блок tp-eco-warn ===');
freshState({ armyRatio: 0.40 });
const armyHtml = _tpRenderEconomyExtSummary();
assert(armyHtml.includes('tp-eco-warn'),
  'блок армии использует класс tp-eco-warn');
assert(armyHtml.includes('Армия') && armyHtml.includes('финансирования'),
  'текст про финансирование армии');
assert(armyHtml.includes('в бою'),
  'упоминание штрафа в бою');
assert(armyHtml.includes('40%'),
  'процент финансирования (40%) выведен');

// Армия полностью финансируется — блок отсутствует
freshState({ armyRatio: 1.0 });
assert(_tpRenderEconomyExtSummary() === '',
  'armyRatio=1.0 — блока нет');

// Граница 80% — штрафа нет
freshState({ armyRatio: 0.80 });
assert(_tpRenderEconomyExtSummary() === '',
  'armyRatio=0.80 — на пороге штрафа нет');

// ══════════════════════════════════════════════════════════════
// TEST 7: всё сразу
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 7: все предупреждения одновременно ===');
freshState({
  inflation: 0.22,
  monopolies: { iron: 'rome', silk: 'rome' },
  cycle: 'recession',
  armyRatio: 0.30,
});
const allHtml = _tpRenderEconomyExtSummary();
assert(allHtml.includes('Инфляция'),          'инфляция в сводке');
assert(allHtml.includes('Монополии'),         'монополии в сводке');
assert(allHtml.includes('Армия'),             'армия в сводке');
assert(allHtml.includes('tp-eco-cycle'),      'цикл в сводке');
// Подсчёт блоков: 2×tp-eco-warn + 1×tp-eco-bonus + 1×tp-eco-cycle = 4
const warnCount  = (allHtml.match(/tp-eco-warn/g)  || []).length;
const bonusCount = (allHtml.match(/tp-eco-bonus/g) || []).length;
const cycleCount = (allHtml.match(/tp-eco-cycle/g) || []).length;
assert(warnCount  === 2, `две tp-eco-warn карточки (inflation + army), факт: ${warnCount}`);
assert(bonusCount === 1, `одна tp-eco-bonus карточка (монополии), факт: ${bonusCount}`);
assert(cycleCount === 1, `одна tp-eco-cycle карточка, факт: ${cycleCount}`);

// ══════════════════════════════════════════════════════════════
// TEST 8: устойчивость к мусорным входам
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 8: защита от мусора ===');
sandbox.GAME_STATE = null;
assert(_tpRenderEconomyExtSummary() === '',
  'GAME_STATE=null — пустая строка');
sandbox.GAME_STATE = { player_nation: null };
assert(_tpRenderEconomyExtSummary() === '',
  'player_nation=null — пустая строка');
sandbox.GAME_STATE = { player_nation: 'rome', economy_ext: null };
assert(_tpRenderEconomyExtSummary() === '',
  'economy_ext=null — пустая строка');

// ══════════════════════════════════════════════════════════════
// TEST 9: CSS-классы не конфликтуют со старыми
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 9: CSS-классы не конфликтуют со старыми ===');
// Новые классы .tp-eco-warn/.tp-eco-bonus/.tp-eco-cycle должны
// отличаться от старых .tp-trade-mono/.tp-trade-infl/.tp-trade-cycle.
freshState({ inflation: 0.05 });
const onlyInfl = _tpRenderEconomyExtSummary();
assert(!onlyInfl.includes('tp-trade-infl'),
  'новый блок НЕ использует старый класс tp-trade-infl');
assert(!onlyInfl.includes('tp-trade-cycle'),
  'новый блок НЕ использует старый класс tp-trade-cycle');
freshState({ monopolies: { iron: 'rome' } });
const onlyMono = _tpRenderEconomyExtSummary();
assert(!onlyMono.includes('tp-trade-mono'),
  'новый блок монополий НЕ использует старый класс tp-trade-mono');

// ══════════════════════════════════════════════════════════════
// TEST 10: CSS-классы определены в index.html
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 10: CSS-стили в index.html ===');
const indexSrc = fs.readFileSync(
  path.join(__dirname, '..', 'index.html'),
  'utf8',
);
assert(indexSrc.includes('.tp-eco-summary'),
  '.tp-eco-summary определён в index.html');
assert(indexSrc.includes('.tp-eco-warn'),
  '.tp-eco-warn определён в index.html');
assert(indexSrc.includes('.tp-eco-bonus'),
  '.tp-eco-bonus определён в index.html');
assert(indexSrc.includes('.tp-eco-cycle'),
  '.tp-eco-cycle определён в index.html');

// ══════════════════════════════════════════════════════════════
// TEST 11: _tpRender() вызывает _tpRenderEconomyExtSummary
// ══════════════════════════════════════════════════════════════
console.log('\n=== TEST 11: _tpRender() интегрирует сводку ===');
assert(tpSrc.includes('_tpRenderEconomyExtSummary()'),
  '_tpRender или другой метод вызывает _tpRenderEconomyExtSummary()');

// ══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════');
console.log(`  ИТОГО: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════════════════════════\n');
process.exit(failed === 0 ? 0 : 1);
