'use strict';
// ── VICTORY 003: Unit tests — vows + chronicle ────────────────────────
// Запуск: node tests/victory_003_vows_chronicle_test.cjs

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
  createElement: () => ({ style: {}, innerHTML: '', remove: () => {} }),
  body: { appendChild: () => {} },
};

function makeCtx(gsOverrides = {}) {
  const GS = {
    turn: 5,
    player_nation: 'thebes',
    nations: {
      thebes: {
        name: 'Фивы',
        economy:    { treasury: 3000, income_per_turn: 500, tax_rate: 0.10, stockpile: { wheat: 2000 } },
        military:   { infantry: 1200, cavalry: 200, ships: 3, at_war_with: [], mercenaries: 0, morale: 70, loyalty: 70 },
        population: { total: 60000, happiness: 65, by_profession: { slaves: 0 } },
        government: { type: 'oligarchy', stability: 60, legitimacy: 70, ruler: { name: 'Эпаминонд', age: 50 } },
        regions:    ['r1'],
        relations:  {},
        active_laws: [],
      },
    },
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    player_vows:  [],
    player_manifest: null,
    chronicle_log:   [],
    ...gsOverrides,
  };

  const logs = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => logs.push({ msg, type }),
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
    _logs: logs,
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx;
}

// ─── TEST 1: takeVow добавляет клятву ────────────────────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_loans');
  ok('takeVow добавляет клятву', ctx.GAME_STATE.player_vows.length === 1);
  ok('клятва имеет id', ctx.GAME_STATE.player_vows[0].id === 'no_loans');
  ok('клятва не нарушена', ctx.GAME_STATE.player_vows[0].broken === false);
}

// ─── TEST 2: повторное takeVow не дублирует ───────────────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_loans');
  ctx.takeVow('no_loans');
  ok('клятва не дублируется', ctx.GAME_STATE.player_vows.length === 1);
}

// ─── TEST 3: no_loans нарушается при займе ────────────────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_loans');
  ctx.GAME_STATE.nations.thebes._loans_taken_this_turn = 1;
  ctx.checkVowViolations('thebes');
  ok('no_loans нарушена', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─── TEST 4: нарушение клятвы снижает легитимность ───────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_loans');
  const origLeg = ctx.GAME_STATE.nations.thebes.government.legitimacy;
  ctx.GAME_STATE.nations.thebes._loans_taken_this_turn = 1;
  ctx.checkVowViolations('thebes');
  ok('легитимность снизилась при нарушении',
    ctx.GAME_STATE.nations.thebes.government.legitimacy < origLeg);
}

// ─── TEST 5: no_taxes нарушается при tax_rate > 0.12 ─────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_taxes');
  ctx.GAME_STATE.nations.thebes.economy.tax_rate = 0.15;
  ctx.checkVowViolations('thebes');
  ok('no_taxes нарушена при tax_rate=0.15', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─── TEST 6: no_mercs нарушается при наёмниках > 0 ───────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_mercs');
  ctx.GAME_STATE.nations.thebes.military.mercenaries = 500;
  ctx.checkVowViolations('thebes');
  ok('no_mercs нарушена', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─── TEST 7: уже нарушенная клятва не проверяется повторно ───────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: true }];
  let logsBefore = 0;
  ctx.addEventLog = (msg, type) => { if (type === 'danger') logsBefore++; };
  ctx.checkVowViolations('thebes');
  ok('уже сломанная клятва не перепроверяется', logsBefore === 0);
}

// ─── TEST 8: соблюдение 100 ходов → достижение man_of_word ───────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 105;
  ctx.GAME_STATE.player_vows = [{ id: 'no_loans', taken_turn: 1, broken: false }];
  ctx.checkVowViolations('thebes');
  ok('_vow_kept_turns >= 100', (ctx.GAME_STATE.nations.thebes._vow_kept_turns ?? 0) >= 100);
}

// ─── TEST 9: _tickChronicle не добавляет запись на не-кратных 25 ─────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 13;
  ctx._tickChronicle('thebes');
  ok('хроника не обновляется на ходу 13', ctx.GAME_STATE.chronicle_log.length === 0);
}

// ─── TEST 10: _tickChronicle добавляет запись на ходу 25 ─────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.turn = 25;
  ctx._tickChronicle('thebes');
  ok('хроника обновляется на ходу 25', ctx.GAME_STATE.chronicle_log.length === 1);
}

// ─── TEST 11: chronicle_log не превышает 50 записей ─────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.chronicle_log = Array.from({length: 50}, (_, i) => ({
    turn: i * 25, text: 'test', grandeur: 100, achievements: [], wars: 0, treasury: 0,
  }));
  ctx.GAME_STATE.turn = 1275; // 51-я запись
  ctx._addChronicleEntry({ turn: 1275, text: 'new', grandeur: 100, achievements: [] });
  ok('chronicle_log <= 50 записей', ctx.GAME_STATE.chronicle_log.length <= 50);
}

// ─── TEST 12: _buildChronicleText возвращает строку ──────────────────
{
  const ctx = makeCtx();
  const text = ctx._buildChronicleText({
    grandeur: 400, achievements: ['Казначей'], manifest: 'Тест', wars: 2, treasury: 5000, turn: 25
  });
  ok('_buildChronicleText возвращает строку', typeof text === 'string' && text.length > 0);
}

// ─── TEST 13: chronicle текст с войнами > 5 содержит "войн" ─────────
{
  const ctx = makeCtx();
  const text = ctx._buildChronicleText({
    grandeur: 200, achievements: [], manifest: '', wars: 6, treasury: 1000, turn: 50
  });
  ok('хроника упоминает войны при wars>5', text.toLowerCase().includes('войн') || text.toLowerCase().includes('кампани'));
}

// ─── TEST 14: chronicle текст при wars=0 содержит "Мир" ─────────────
{
  const ctx = makeCtx();
  const text = ctx._buildChronicleText({
    grandeur: 200, achievements: [], manifest: '', wars: 0, treasury: 1000, turn: 50
  });
  ok('хроника упоминает мир при wars=0', text.toLowerCase().includes('мир'));
}

// ─── TEST 15: getHistoricalRating возвращает массив строк ────────────
{
  const ctx = makeCtx();
  const rating = ctx.getHistoricalRating('thebes');
  ok('getHistoricalRating[] — массив', Array.isArray(rating));
  ok('getHistoricalRating содержит строки', rating.every(r => typeof r === 'string'));
  ok('getHistoricalRating возвращает 3 строки', rating.length === 3);
}

// ─── TEST 16: богатый правитель — сравнение с Птолемеями ─────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.thebes.economy.treasury = 90000;
  const rating = ctx.getHistoricalRating('thebes');
  ok('казна > 80К → Птолемеи', rating.some(r => r.includes('Птолемеев')));
}

// ─── TEST 17: большая армия — сравнение с Александром ────────────────
{
  const ctx = makeCtx();
  ctx.GAME_STATE.nations.thebes.military.infantry = 40000;
  ctx.GAME_STATE.nations.thebes.military.cavalry  = 5000;
  const rating = ctx.getHistoricalRating('thebes');
  ok('мощная армия → Александр', rating.some(r => r.includes('Александра')));
}

// ─── TEST 18: checkVowViolations не падает при отсутствующей нации ────
{
  const ctx = makeCtx();
  let threw = false;
  try { ctx.checkVowViolations('nonexistent'); } catch (e) { threw = true; }
  ok('checkVowViolations не падает при несуществующей нации', !threw);
}

// ─── TEST 19: no_slavery нарушается при рабах > 0 ────────────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_slavery');
  ctx.GAME_STATE.nations.thebes.population.by_profession.slaves = 100;
  ctx.checkVowViolations('thebes');
  ok('no_slavery нарушена при рабах > 0', ctx.GAME_STATE.player_vows[0].broken === true);
}

// ─── TEST 20: no_taxes НЕ нарушается при tax_rate = 0.10 ─────────────
{
  const ctx = makeCtx();
  ctx.takeVow('no_taxes');
  ctx.GAME_STATE.nations.thebes.economy.tax_rate = 0.10;
  ctx.checkVowViolations('thebes');
  ok('no_taxes не нарушена при tax_rate=0.10', ctx.GAME_STATE.player_vows[0].broken === false);
}

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
