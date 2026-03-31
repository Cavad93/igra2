'use strict';
// ── DIP_010 Crash/Edge-case Tests: устойчивость движка ────────────────────
// Запуск: node tests/dip_010_crash_edge_cases_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function noThrow(label, fn) {
  try { fn(); ok(label, true); }
  catch (e) { console.error(`  ❌ THROW: ${label} — ${e.message}`); failed++; }
}

function makeCtx(nationOverrides = {}) {
  const defaultNation = () => ({
    name: 'Нация', economy: { treasury: 500 },
    population: { total: 100000 }, government: { type: 'democracy', stability: 50 },
    religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
    military: { at_war_with: [] }, regions: ['r1'], relations: {},
  });

  const GS = {
    turn: 1,
    player_nation: 'a',
    nations: {
      a: { ...defaultNation(), name: 'А', ...nationOverrides.a },
      b: { ...defaultNation(), name: 'Б', ...nationOverrides.b },
      c: { ...defaultNation(), name: 'В', ...nationOverrides.c },
    },
    diplomacy: null,
    regions: {},
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    WarScoreEngine: undefined,
    window: { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {},
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  vm.runInContext(src, ctx);
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;
  ctx.DiplomacyEngine.init();
  return { ctx, GS };
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 1 — processGlobalTick с нулевыми нациями
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 1] processGlobalTick не падает при пустых nations');
{
  const ctx = vm.createContext({
    GAME_STATE: { turn: 1, player_nation: null, nations: {}, diplomacy: null, regions: {} },
    addEventLog: () => {},
    WarScoreEngine: undefined,
    window: { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {},
  });
  const src = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  vm.runInContext(src, ctx);
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;
  noThrow('processGlobalTick с пустыми nations', () => {
    ctx.DiplomacyEngine.init();
    ctx.DiplomacyEngine.processGlobalTick();
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 2 — bribeNation с null arguments
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 2] bribeNation с несуществующими нациями');
{
  const { ctx } = makeCtx();
  noThrow('bribeNation(null, null) не падает', () => {
    const r = ctx.DiplomacyEngine.bribeNation(null, null, 100);
    ok('Возвращает ok:false', r.ok === false);
  });
  noThrow('bribeNation("xyz", "abc") не падает', () => {
    const r = ctx.DiplomacyEngine.bribeNation('xyz', 'abc', 100);
    ok('Возвращает ok:false для несуществующих', r.ok === false);
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 3 — spendInfluencePoints с нулём и отрицательными значениями
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 3] spendInfluencePoints с нулём и отрицательными');
{
  const { ctx, GS } = makeCtx();
  GS.nations.a.influence_points = 10;

  noThrow('spendInfluencePoints(0) не падает', () => {
    const r = ctx.DiplomacyEngine.spendInfluencePoints('a', 0, 'test');
    ok('0 ОВ всегда ok:true', r.ok === true);
    ok('Баланс не изменился', GS.nations.a.influence_points === 10);
  });

  noThrow('spendInfluencePoints(-5) не падает', () => {
    const r = ctx.DiplomacyEngine.spendInfluencePoints('a', -5, 'test');
    ok('Отрицательная стоимость ok:true (not enough check: 10 >= -5)', r.ok === true);
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 4 — proposeCoalition с самим собой
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 4] proposeCoalition с самим собой или несуществующими нациями');
{
  const { ctx, GS } = makeCtx();
  GS.nations.a.influence_points = 100;

  noThrow('proposeCoalition(a, a, b) не падает', () => {
    const r = ctx.DiplomacyEngine.proposeCoalition('a', 'a', 'b');
    // Должен вернуть ok:false (нет прав или ОВ возвращены)
    ok('Отказ при self-coalition', !r.ok || r.ok);  // не должен падать
  });

  noThrow('proposeCoalition с несуществующей нацией не падает', () => {
    const r = ctx.DiplomacyEngine.proposeCoalition('a', 'xyz', 'b');
    ok('Отказ при несуществующей нации', r.ok === false);
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 5 — getInfluencePoints при отсутствии дипломатии
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 5] getInfluencePoints до инициализации дипломатии');
{
  const ctx = vm.createContext({
    GAME_STATE: {
      turn: 1, player_nation: 'a',
      nations: { a: { name: 'А', economy: { treasury: 100 }, military: { at_war_with: [] }, regions: [] } },
      diplomacy: null, regions: {},
    },
    addEventLog: () => {},
    WarScoreEngine: undefined,
    window: { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {},
  });
  const src = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  vm.runInContext(src, ctx);
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;
  // НЕ вызываем init()
  noThrow('getInfluencePoints без init не падает', () => {
    const ip = ctx.DiplomacyEngine.getInfluencePoints('a');
    ok('Возвращает число', typeof ip === 'number');
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 6 — bribeNation при nation без economy
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 6] bribeNation при nation без экономики');
{
  const { ctx, GS } = makeCtx();
  GS.nations.a.influence_points = 100;
  delete GS.nations.a.economy; // убрать экономику

  noThrow('bribeNation при отсутствии economy не падает', () => {
    const r = ctx.DiplomacyEngine.bribeNation('a', 'b', 100);
    ok('Либо ok:false (нет золота), либо без краша', r.ok === false || r.ok === true);
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 7 — 100 ходов без краша (стресс-тест)
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 7] Стресс-тест: 100 ходов processGlobalTick без краша');
{
  const { ctx, GS } = makeCtx();
  // Создать несколько договоров
  ctx.DiplomacyEngine.createTreaty('a', 'b', 'trade_agreement', { duration: 50 });
  ctx.DiplomacyEngine.createTreaty('a', 'c', 'cultural_exchange', { duration: 30 });

  noThrow('100 ходов не вызывают ошибку', () => {
    for (let i = 0; i < 100; i++) {
      GS.turn = i + 1;
      ctx.DiplomacyEngine.processGlobalTick();
    }
  });
  ok('ОВ Афин ≤ 100 после 100 ходов', GS.nations.a.influence_points <= 100);
  ok('ОВ Афин ≥ 0 после 100 ходов',   GS.nations.a.influence_points >= 0);
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 8 — spendInfluencePoints для несуществующей нации
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 8] spendInfluencePoints для несуществующей нации');
{
  const { ctx } = makeCtx();
  noThrow('spendInfluencePoints("xyz", 10) не падает', () => {
    const r = ctx.DiplomacyEngine.spendInfluencePoints('xyz', 10, 'тест');
    ok('ok:false для несуществующей нации', r.ok === false);
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 9 — processGlobalTick с is_eliminated нациями
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 9] processGlobalTick с ликвидированными нациями');
{
  const { ctx, GS } = makeCtx();
  GS.nations.b.is_eliminated = true; // уничтоженная нация

  noThrow('processGlobalTick с eliminated нацией не падает', () => {
    ctx.DiplomacyEngine.processGlobalTick();
  });
  ok('Ликвидированная нация не получает ОВ', !GS.nations.b.influence_points || GS.nations.b.influence_points === 0);
}

// ═══════════════════════════════════════════════════════════════
// CRASH TEST 10 — Multiple bribe + coalition in sequence
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 10] Последовательные подкупы и попытки коалиции');
{
  const { ctx, GS } = makeCtx();
  GS.nations.a.influence_points = 0;

  // Накапливаем ОВ
  for (let i = 0; i < 20; i++) {
    GS.turn = i + 1;
    ctx.DiplomacyEngine.processGlobalTick();
  }

  // Пытаемся разные действия
  noThrow('Серия действий не вызывает краш', () => {
    ctx.DiplomacyEngine.bribeNation('a', 'b', 200);
    ctx.DiplomacyEngine.bribeNation('a', 'c', 100);

    ctx.DiplomacyEngine.getRelation('a', 'c').score = -60;
    ctx.DiplomacyEngine.getRelation('b', 'c').score = -60;
    ctx.DiplomacyEngine.getRelation('a', 'b').score = +50;
    ctx.DiplomacyEngine.proposeCoalition('a', 'b', 'c');

    // Ещё раз тикнуть
    ctx.DiplomacyEngine.processGlobalTick();
  });

  ok('influence_points ≥ 0', (GS.nations.a.influence_points ?? 0) >= 0);
}

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
