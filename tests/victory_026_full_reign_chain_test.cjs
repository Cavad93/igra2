'use strict';
// ── VICTORY 026: Full reign chain — achievements → grandeur → legacy → chronicle
// Комплексный тест: симулируем полное правление монарха от хода 1 до смерти,
// проверяем что все системы корректно взаимодействуют.
// Цепочка: checkAchievements → calcGrandeur → generateRulerLegacy → chronicle
// Запуск: node tests/victory_026_full_reign_chain_test.cjs

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
  createElement: () => ({ id:'', className:'', innerHTML:'', style:{}, remove(){} , appendChild(){} }),
  body: { appendChild(){} },
};

function load(GS) {
  const legacyShown = [];
  const events = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    showLegacyModal: (text, data) => legacyShown.push({ text, data }),
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  ctx._legacyShown = legacyShown;
  ctx._events = events;
  return ctx;
}

function makeGS(turn = 1) {
  return {
    turn,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 5000, income_per_turn: 300 },
        military: { infantry: 500, cavalry: 100, ships: 10, at_war_with: [] },
        government: {
          type: 'monarchy',
          stability: 70,
          legitimacy: 65,
          ruler: { name: 'Augustus', age: 35 },
          ruler_changed: false,
        },
        population: { total: 300000, happiness: 60 },
        regions: ['latium', 'campania', 'sicilia'],
        _ruler_start_turn: 0,
        _battles_won: 0,
        _wars_declared: 0,
        _invasions_repelled: 0,
        _turns_in_power: 0,
      }
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
  };
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 1: Симуляция 50 ходов правления');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(1);
  const ctx = load(gs);

  for (let t = 1; t <= 50; t++) {
    gs.turn = t;
    // Симулируем прогресс нации
    gs.nations.rome.economy.treasury += 500;
    gs.nations.rome._battles_won = Math.floor(t / 5);
    gs.nations.rome._turns_in_power = t;
    ctx.checkAchievements('rome');
    ctx.checkVictoryConditions();
  }

  const achievCount = ctx.getAchievementCount('rome');
  ok(`после 50 ходов: разблокированы достижения (>= 2)`, achievCount >= 2);

  const g = ctx.calcGrandeur('rome');
  ok('grandeur > 0 после роста казны', g > 0);
  ok('grandeur в диапазоне [0, 1000]', g >= 0 && g <= 1000);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 2: Смерть правителя триггерит generateRulerLegacy');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(40);
  const ctx = load(gs);

  gs.nations.rome._ruler_start_turn = 10;
  gs.nations.rome._battles_won = 5;
  gs.nations.rome.economy.treasury = 20000;
  ctx.checkAchievements('rome');

  // Триггер смерти правителя
  gs.nations.rome.government.ruler_changed = true;
  ctx.checkVictoryConditions();

  // Проверяем через chronicle_log (showLegacyModal переопределяется в victory.js)
  const legacyEntry = (gs.chronicle_log ?? []).find(e => e.type === 'legacy');
  ok('chronicle_log содержит запись legacy', !!legacyEntry);
  ok('ruler_changed сброшен в false', gs.nations.rome.government.ruler_changed === false);
  ok('_ruler_start_turn обновлён до 40', gs.nations.rome._ruler_start_turn === 40);
  ok('chronicle_log не пуст', (gs.chronicle_log ?? []).length >= 1);
  ok('событие "Итог правления" в eventlog', ctx._events.some(e => e.msg?.includes('Итог правления')));
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 3: Legacy записывается в chronicle_log');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(25);
  const ctx = load(gs);

  gs.nations.rome.government.ruler_changed = true;
  ctx.checkVictoryConditions();

  ok('chronicle_log не пуст после legacy', (gs.chronicle_log?.length ?? 0) >= 1);
  const entry = (gs.chronicle_log ?? []).find(e => e.type === 'legacy');
  ok('запись chronicle с type=legacy есть', !!entry);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 4: Республика — legacy каждые 12 ходов');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(12);
  gs.nations.rome.government.type = 'republic';
  const ctx = load(gs);

  ctx.checkVictoryConditions();
  // showLegacyModal переопределяется в victory.js → проверяем через chronicle_log и eventlog
  ok('ход 12 republic → chronicle_log содержит legacy', (gs.chronicle_log ?? []).some(e => e.type === 'legacy'));
  ok('ход 12 republic → событие Итог правления', ctx._events.some(e => e.msg?.includes('Итог правления')));

  const gs2 = makeGS(11);
  gs2.nations.rome.government.type = 'republic';
  const ctx2 = load(gs2);
  ctx2.checkVictoryConditions();
  ok('ход 11 republic → legacy НЕ создан', !(gs2.chronicle_log ?? []).some(e => e.type === 'legacy'));
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 5: Олигархия — legacy каждые 24 хода');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(24);
  gs.nations.rome.government.type = 'oligarchy';
  const ctx = load(gs);

  ctx.checkVictoryConditions();
  ok('ход 24 oligarchy → chronicle_log содержит legacy', (gs.chronicle_log ?? []).some(e => e.type === 'legacy'));
  ok('ход 24 oligarchy → событие Итог правления', ctx._events.some(e => e.msg?.includes('Итог правления')));

  const gs2 = makeGS(23);
  gs2.nations.rome.government.type = 'oligarchy';
  const ctx2 = load(gs2);
  ctx2.checkVictoryConditions();
  ok('ход 23 oligarchy → legacy НЕ создан', !(gs2.chronicle_log ?? []).some(e => e.type === 'legacy'));
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 6: Хроника пополняется каждые 25 ходов');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(1);
  const ctx = load(gs);

  // Симуляция до хода 50
  for (let t = 1; t <= 50; t++) {
    gs.turn = t;
    ctx.checkAchievements('rome');
  }

  ok('chronicle_log содержит записи от ходов 25 и 50',
    (gs.chronicle_log?.length ?? 0) >= 2);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 7: Манифест каждые 25 ходов пишет хроникальный лог');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(25);
  gs.player_manifest = { text: 'Объединить все регионы', chosen_turn: 1 };
  const ctx = load(gs);

  const eventsBefore = ctx._events.length;
  ctx.checkAchievements('rome');

  const manifestEvents = ctx._events.filter(e =>
    e.msg && (e.msg.includes('Объединить') || e.msg.includes('Хронист'))
  );
  ok('манифест генерирует событие хрониста на ходу 25', manifestEvents.length >= 1);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 8: Полная цепочка — достижение → grandeur растёт');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(1);
  const ctx = load(gs);

  const g0 = ctx.calcGrandeur('rome');

  // Разблокировать 5 достижений
  gs.achievements.rome = {};
  for (let i = 0; i < 5; i++) {
    gs.achievements.rome[`a${i}`] = { turn: 1, name: `A${i}`, icon: '⭐' };
  }

  const g1 = ctx.calcGrandeur('rome');
  ok('5 достижений увеличивают grandeur', g1 > g0);
  ok('прирост = 50 (5 * 10)', (g1 - g0) === 50);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 9: Legacy text содержит имя правителя');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(30);
  gs.nations.rome.government.ruler.name = 'Тиберий';
  const ctx = load(gs);

  gs.nations.rome.government.ruler_changed = true;
  ctx.checkVictoryConditions();

  // showLegacyModal переопределяется в victory.js, проверяем через eventlog
  const legacyEvent = ctx._events.find(e => e.msg?.includes('Итог правления'));
  ok('legacy событие создано', !!legacyEvent);
  ok('legacy eventlog содержит имя правителя', legacyEvent?.msg?.includes('Тиберий') ?? false);
}

// ────────────────────────────────────────────────────────────────
section('БЛОК 10: chronicle_log не превышает 50 записей');
// ────────────────────────────────────────────────────────────────
{
  const gs = makeGS(1);
  const ctx = load(gs);

  // Добавим 60 записей напрямую
  for (let i = 0; i < 60; i++) {
    gs.turn = i + 1;
    gs.nations.rome.government.ruler_changed = true;
    ctx.checkVictoryConditions();
    gs.nations.rome.government.ruler_changed = false;
  }

  ok('chronicle_log не превышает 50', (gs.chronicle_log?.length ?? 0) <= 50);
}

// ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
