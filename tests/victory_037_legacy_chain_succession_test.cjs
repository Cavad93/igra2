'use strict';
// ── VICTORY 037: Legacy chain across multiple successions ─────────────
// Проверяет что:
//   1. _ruler_start_turn корректно обновляется после каждой смены
//   2. turns_ruled считается с последнего начала, не с нуля
//   3. Серия смертей в разные ходы даёт разные legacy
//   4. Republic: каждые 12 ходов генерирует итог
//   5. Oligarchy: каждые 24 хода генерирует итог
//   6. Последовательные смены не теряют хронику
// Запуск: node tests/victory_037_legacy_chain_succession_test.cjs

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

function load(gs) {
  const events = [];
  const legacyModals = [];
  const ctx = vm.createContext({
    GAME_STATE: gs,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    showLegacyModal: (text, data, testament) => legacyModals.push({ text, data, testament }),
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._events = events;
  ctx._legacyModals = legacyModals;
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  // Перезаписать showLegacyModal в контексте
  vm.runInContext('showLegacyModal = (text, data, testament) => _legacyModals.push({ text, data, testament });', Object.assign(ctx, { _legacyModals: legacyModals }));
  return ctx;
}

function makeMonarchy(turn) {
  return {
    turn,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 10000, income_per_turn: 500, stockpile: {} },
        military: { infantry: 1000, cavalry: 100, at_war_with: [] },
        population: { total: 100000, happiness: 60 },
        government: {
          type: 'monarchy',
          stability: 60, legitimacy: 70,
          ruler: { name: 'Ruler-1', age: 50 },
          ruler_changed: false,
        },
        regions: ['r0','r1','r2'],
        capital_region: 'r0',
        _ruler_start_turn: 0,
        _wars_total: 2,
      },
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Серия смен монарха — _ruler_start_turn обновляется');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeMonarchy(1);
  const ctx = load(gs);
  const n = gs.nations.rome;

  // Правитель 1 правит с хода 0 → умирает на ходу 30
  gs.turn = 30;
  n.government.ruler.name = 'Ruler-1';
  n.government.ruler_changed = true;
  ctx.checkVictoryConditions();
  ok('Модал 1 показан',                    ctx._legacyModals.length === 1);
  ok('turns_ruled первого = 30',           ctx._legacyModals[0].data.turns_ruled === 30);
  ok('_ruler_start_turn обновился до 30',  n._ruler_start_turn === 30);
  ok('ruler_changed сброшен',              n.government.ruler_changed === false);

  // Правитель 2 правит с хода 30 → умирает на ходу 75
  gs.turn = 75;
  n.government.ruler.name = 'Ruler-2';
  n.government.ruler_changed = true;
  ctx.checkVictoryConditions();
  ok('Модал 2 показан',                    ctx._legacyModals.length === 2);
  ok('turns_ruled второго = 45',           ctx._legacyModals[1].data.turns_ruled === 45);
  ok('_ruler_start_turn обновился до 75',  n._ruler_start_turn === 75);

  // Правитель 3 правит всего 1 ход (edge case)
  gs.turn = 76;
  n.government.ruler.name = 'Ruler-3';
  n.government.ruler_changed = true;
  ctx.checkVictoryConditions();
  ok('turns_ruled >= 1 даже при коротком правлении', ctx._legacyModals[2].data.turns_ruled >= 1);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: Хроника сохраняет все legacy записи по порядку');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeMonarchy(1);
  const ctx = load(gs);
  const n = gs.nations.rome;

  for (let i = 1; i <= 5; i++) {
    gs.turn = i * 20;
    n.government.ruler.name = 'R' + i;
    n.government.ruler_changed = true;
    ctx.checkVictoryConditions();
  }
  const legacyEntries = (gs.chronicle_log ?? []).filter(e => e.type === 'legacy');
  ok('5 записей в хронике',                legacyEntries.length === 5);
  ok('Имена правителей в правильном порядке',
    legacyEntries.map(e => e.ruler).join(',') === 'R1,R2,R3,R4,R5');
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Республика — итог каждые 12 ходов');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeMonarchy(0);
  gs.nations.rome.government.type = 'republic';
  gs.nations.rome._ruler_start_turn = 0;
  const ctx = load(gs);

  let legacyCount = 0;
  // Прогоним 60 ходов; итог ожидается на 12, 24, 36, 48, 60 → 5 штук
  for (let turn = 1; turn <= 60; turn++) {
    gs.turn = turn;
    ctx.checkVictoryConditions();
  }
  legacyCount = ctx._legacyModals.length;
  ok('Республика: 5 итогов за 60 ходов',   legacyCount === 5);

  const reasons = ctx._legacyModals.map(m => m.data.reason);
  ok('Все reason = consul_change',          reasons.every(r => r === 'consul_change'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Олигархия — итог каждые 24 хода');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeMonarchy(0);
  gs.nations.rome.government.type = 'oligarchy';
  gs.nations.rome._ruler_start_turn = 0;
  const ctx = load(gs);

  for (let turn = 1; turn <= 72; turn++) {
    gs.turn = turn;
    ctx.checkVictoryConditions();
  }
  ok('Олигархия: 3 итога за 72 хода',      ctx._legacyModals.length === 3);
  const reasons = ctx._legacyModals.map(m => m.data.reason);
  ok('Все reason = council_change',         reasons.every(r => r === 'council_change'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: Republic на ходу 600 не генерирует двойной итог');
// ─────────────────────────────────────────────────────────────
{
  // 600 кратно и 12 и 600 — должен быть ровно 1 legacy + 1 кризис
  const gs = makeMonarchy(0);
  gs.nations.rome.government.type = 'republic';
  gs.nations.rome.population.total = 150000;
  const ctx = load(gs);

  // Прыжок прямо на 600
  gs.turn = 600;
  ctx.checkVictoryConditions();

  ok('Ровно 1 legacy modal',                ctx._legacyModals.length === 1);
  ok('active_crisis создан на ходу 600',    gs.active_crisis?.start_turn === 600);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Tribal/chiefdom тоже работает через ruler_changed');
// ─────────────────────────────────────────────────────────────
{
  for (const type of ['tyranny', 'chiefdom', 'tribal']) {
    const gs = makeMonarchy(50);
    gs.nations.rome.government.type = type;
    gs.nations.rome.government.ruler_changed = true;
    const ctx = load(gs);
    ctx.checkVictoryConditions();
    ok(`${type}: legacy сгенерирован`,       ctx._legacyModals.length === 1);
    ok(`${type}: ruler_changed сброшен`,     gs.nations.rome.government.ruler_changed === false);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: _buildLegacyText не ломается на пустых данных');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeMonarchy(1);
  const ctx = load(gs);
  const txt1 = ctx._buildLegacyText({});
  ok('Пустой объект → непустая строка',    typeof txt1 === 'string' && txt1.length > 0);
  const txt2 = ctx._buildLegacyText({ reason: 'consul_change', turns_ruled: 12, treasury: 50000, ruler_name: 'X', grandeur: 600, achievements: ['Миротворец'] });
  ok('Консульский итог упоминает имя',      txt2.includes('X'));
  ok('Консульский итог упоминает 12',       txt2.includes('12'));
  const txt3 = ctx._buildLegacyText({ reason: 'council_change', ruler_name: 'Y', grandeur: 500, treasury: 30000, turns_ruled: 24 });
  ok('Совет: упоминает Y',                  txt3.includes('Y'));
  const txt4 = ctx._buildLegacyText({ reason: 'ruler_death', ruler_name: 'Z', wars: 10, achievements: ['a','b','c','d','e','f'], turns_ruled: 100, grandeur: 500 });
  ok('Монарх: wars>5 → войны',              txt4.toLowerCase().includes('войн'));
  const txt5 = ctx._buildLegacyText({ reason: 'ruler_death', wars: 0, turns_ruled: 10, achievements: [], grandeur: 0 });
  ok('Монарх: wars=0 → мир',                txt5.toLowerCase().includes('мир'));
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
// ─────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed+failed}`);
console.log(`════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
