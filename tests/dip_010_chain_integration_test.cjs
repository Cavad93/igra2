'use strict';
// ── DIP_010 Integration Tests: Полная цепочка ОВ + дипломатические действия ─
// Запуск: node tests/dip_010_chain_integration_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

function makeCtx() {
  const GS = {
    turn: 1,
    player_nation: 'athens',
    nations: {
      athens: {
        name: 'Афины', economy: { treasury: 2000 },
        population: { total: 500000 }, government: { type: 'democracy', stability: 60 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r1'], relations: {},
      },
      sparta: {
        name: 'Спарта', economy: { treasury: 1200 },
        population: { total: 300000 }, government: { type: 'oligarchy', stability: 50 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r2'], relations: {},
      },
      thebes: {
        name: 'Фивы', economy: { treasury: 700 },
        population: { total: 200000 }, government: { type: 'oligarchy', stability: 40 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r3'], relations: {},
      },
      persia: {
        name: 'Персия', economy: { treasury: 10000 },
        population: { total: 3000000 }, government: { type: 'monarchy', stability: 55 },
        religion: 'zoroastrian', culture: 'persian', culture_group: 'iranian',
        military: { at_war_with: [] }, regions: ['r4', 'r5'], relations: {},
      },
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
// TEST 1 — Цепочка: накопить ОВ за несколько ходов
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] Накопление ОВ за 5 ходов без договоров');
{
  const { ctx, GS } = makeCtx();
  for (const n of Object.values(GS.nations)) n.influence_points = 0;

  for (let i = 0; i < 5; i++) {
    GS.turn = i + 1;
    ctx.DiplomacyEngine.processGlobalTick();
  }

  ok('После 5 ходов Афины имеют ≥ 10 ОВ', GS.nations.athens.influence_points >= 10);
  ok('После 5 ходов Спарта имеет ≥ 10 ОВ', GS.nations.sparta.influence_points >= 10);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — Цепочка: посол → союз → коалиция
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] Цепочка: торговый договор → накопить на союз → предложить коалицию');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 0;
  GS.nations.sparta.influence_points = 0;

  // Шаг 1: создаём торговый договор (бесплатно на уровне createTreaty, это AI-инициатива)
  ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'trade_agreement', { duration: 5 });

  // Шаг 2: накапливаем ОВ (с посольством: +2+1+0.5=3.5/ход)
  for (let i = 0; i < 10; i++) {
    GS.turn = i + 1;
    ctx.DiplomacyEngine.processGlobalTick();
  }

  const ipAfter10Turns = GS.nations.athens.influence_points;
  ok('После 10 ходов с торговлей: ≥ 35 ОВ', ipAfter10Turns >= 35);

  // Шаг 3: устанавливаем вражду с Персией
  ctx.DiplomacyEngine.getRelation('athens', 'persia').score = -60;
  ctx.DiplomacyEngine.getRelation('sparta', 'persia').score = -60;
  ctx.DiplomacyEngine.getRelation('athens', 'sparta').score = +50;

  const ipBefore = GS.nations.athens.influence_points;
  const coalResult = ctx.DiplomacyEngine.proposeCoalition('athens', 'sparta', 'persia');

  ok('Коалиция создана', coalResult.ok === true);
  ok('ОВ уменьшились на 25', GS.nations.athens.influence_points === ipBefore - 25);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — Посольства влияют на доход ОВ пропорционально
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] Несколько посольств увеличивают доход ОВ');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 0;

  // 2 торговых договора с разными нациями
  ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'trade_agreement', { duration: 5 });
  ctx.DiplomacyEngine.createTreaty('athens', 'thebes', 'trade_agreement', { duration: 5 });

  ctx.DiplomacyEngine.processGlobalTick();

  // Ожидаемо: +2 + 2 посольства + 2 торговых = 2+2+1 = 5
  ok('Два посольства дают +5 ОВ за ход', GS.nations.athens.influence_points >= 5);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — Подкуп улучшает отношения и позволяет получить союз
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] Подкуп улучшает отношения (дипломатическая цепочка)');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 100;
  GS.nations.athens.economy.treasury = 5000;

  // Начальные холодные отношения
  ctx.DiplomacyEngine.getRelation('athens', 'sparta').score = 0;

  const scoresBefore = [];
  // Три подкупа
  for (let i = 0; i < 3; i++) {
    scoresBefore.push(ctx.DiplomacyEngine.getRelationScore('athens', 'sparta'));
    const r = ctx.DiplomacyEngine.bribeNation('athens', 'sparta', 300);
    ok(`Подкуп ${i+1} успешен`, r.ok === true);
  }

  const finalScore = ctx.DiplomacyEngine.getRelationScore('athens', 'sparta');
  ok('Отношения стали значительно лучше после 3 подкупов', finalScore > 20);
  ok('ОВ уменьшились на 60 (3 × 20)', GS.nations.athens.influence_points === 40);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — getInfluencePoints возвращает 0 для несуществующей нации
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] getInfluencePoints для несуществующей нации = 0');
{
  const { ctx } = makeCtx();
  const ip = ctx.DiplomacyEngine.getInfluencePoints('nonexistent_nation_xyz');
  ok('Несуществующая нация → 0 ОВ', ip === 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — Несколько ходов с несколькими нациями независимы
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] Начисление ОВ независимо для каждой нации');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 0;
  GS.nations.sparta.influence_points = 0;
  GS.nations.persia.influence_points = 0;

  // У Афин есть торговый договор, у Спарты нет
  ctx.DiplomacyEngine.createTreaty('athens', 'thebes', 'trade_agreement', { duration: 5 });

  ctx.DiplomacyEngine.processGlobalTick();

  const athensIp  = GS.nations.athens.influence_points;
  const spartaIp  = GS.nations.sparta.influence_points;

  ok('Афины получили больше ОВ чем Спарта (есть договор)', athensIp > spartaIp);
  ok('Спарта получила ровно 2 ОВ (нет договоров)', spartaIp === 2);
}

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
