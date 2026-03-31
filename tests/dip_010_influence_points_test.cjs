'use strict';
// ── DIP_010 Unit Tests: Очки дипломатического влияния ─────────────────────
// Запуск: node tests/dip_010_influence_points_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── Вспомогательная функция для создания контекста ─────────────────────────
function makeCtx(overrides = {}) {
  const GS = {
    turn: 1,
    player_nation: 'athens',
    nations: {
      athens:  {
        name: 'Афины', flag_emoji: '🏛', economy: { treasury: 1000 },
        population: { total: 500000 }, government: { type: 'democracy', stability: 60 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r1', 'r2'], relations: {},
      },
      sparta:  {
        name: 'Спарта', flag_emoji: '⚔', economy: { treasury: 800 },
        population: { total: 300000 }, government: { type: 'oligarchy', stability: 50 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r3'], relations: {},
      },
      persia:  {
        name: 'Персия', flag_emoji: '🦁', economy: { treasury: 5000 },
        population: { total: 2000000 }, government: { type: 'monarchy', stability: 45 },
        religion: 'zoroastrian', culture: 'persian', culture_group: 'iranian',
        military: { at_war_with: [] }, regions: ['r4', 'r5', 'r6'], relations: {},
      },
    },
    diplomacy: null,
    regions: {},
    ...overrides,
  };

  const ctx = vm.createContext({
    GAME_STATE:     GS,
    addEventLog:    () => {},
    WarScoreEngine: undefined,
    window:         { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout:     () => {},
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  vm.runInContext(src, ctx);
  // DiplomacyEngine is a const — expose via var so ctx can access it
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;

  ctx.DiplomacyEngine.init();
  return { ctx, GS };
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — Инициализация influence_points
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] Инициализация influence_points при первом getInfluencePoints');
{
  const { ctx, GS } = makeCtx();
  const ip = ctx.DiplomacyEngine.getInfluencePoints('athens');
  ok('influence_points инициализировано (0)', ip === 0);
  ok('influence_points поле создано в объекте нации', GS.nations.athens.influence_points != null);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — Базовое начисление +2 ОВ за ход без договоров
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] Базовое начисление +2 ОВ за ход');
{
  const { ctx, GS } = makeCtx();
  // Инициализируем influence_points
  GS.nations.athens.influence_points = 0;
  GS.nations.sparta.influence_points = 0;
  GS.nations.persia.influence_points = 0;

  ctx.DiplomacyEngine.processGlobalTick();

  ok('Афины получили ≥ 2 ОВ', GS.nations.athens.influence_points >= 2);
  ok('Спарта получила ≥ 2 ОВ', GS.nations.sparta.influence_points >= 2);
  ok('Персия получила ≥ 2 ОВ', GS.nations.persia.influence_points >= 2);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — Начисление +1 ОВ за посольство (активный договор)
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] +1 ОВ за посольство (активный trade_agreement)');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 0;

  // Создаём торговый договор между Афинами и Спартой
  ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'trade_agreement', { duration: 10 });

  // Запустить тик — у афин теперь 1 посольство и 1 торговый договор
  ctx.DiplomacyEngine.processGlobalTick();

  // Ожидаем: +2 (базово) + 1 (посольство Спарты) + 0.5 (trade_agreement) = 3.5
  ok('Афины получили > 2 ОВ (посольство+торговля)', GS.nations.athens.influence_points > 2);
  ok('Афины получили ≥ 3.5 ОВ', GS.nations.athens.influence_points >= 3.5);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — Списание ОВ (spendInfluencePoints)
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] Списание Очков Влияния');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 30;

  const r1 = ctx.DiplomacyEngine.spendInfluencePoints('athens', 15, 'Тест');
  ok('Успешное списание 15 ОВ', r1.ok === true);
  ok('Остаток = 15 ОВ', GS.nations.athens.influence_points === 15);

  const r2 = ctx.DiplomacyEngine.spendInfluencePoints('athens', 20, 'Тест2');
  ok('Отказ при нехватке ОВ', r2.ok === false);
  ok('Причина содержит «Недостаточно»', r2.reason && r2.reason.includes('Недостаточно'));
  ok('ОВ не изменились при отказе', GS.nations.athens.influence_points === 15);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — INFLUENCE_COSTS экспортированы корректно
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] INFLUENCE_COSTS экспортированы и содержат все действия');
{
  const { ctx } = makeCtx();
  const costs = ctx.DiplomacyEngine.INFLUENCE_COSTS;
  ok('INFLUENCE_COSTS существует', !!costs);
  ok('send_ambassador = 5',     costs?.send_ambassador  === 5);
  ok('propose_alliance = 15',   costs?.propose_alliance === 15);
  ok('bribe = 20',              costs?.bribe            === 20);
  ok('propose_coalition = 25',  costs?.propose_coalition === 25);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — Подкуп (bribeNation): успешный и с нехваткой ОВ
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] bribeNation: успешный подкуп и отказ при нехватке ОВ');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 25;
  const relBefore = ctx.DiplomacyEngine.getRelationScore('athens', 'sparta');

  const r = ctx.DiplomacyEngine.bribeNation('athens', 'sparta', 200);
  ok('Подкуп успешен', r.ok === true);
  ok('Возвращает delta > 0', typeof r.delta === 'number' && r.delta > 0);
  ok('Отношения улучшились', ctx.DiplomacyEngine.getRelationScore('athens', 'sparta') > relBefore);
  ok('ОВ списано (25 − 20 = 5)', GS.nations.athens.influence_points === 5);
  ok('Золото списано', GS.nations.athens.economy.treasury < 1000);

  // Теперь ОВ только 5, не хватит
  const r2 = ctx.DiplomacyEngine.bribeNation('athens', 'persia', 100);
  ok('Отказ при нехватке ОВ (5 < 20)', r2.ok === false);
  ok('ОВ не изменились после отказа', GS.nations.athens.influence_points === 5);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — Коалиция: списание 25 ОВ и возврат при ошибке
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] proposeCoalition: списание ОВ и возврат при провале');
{
  const { ctx, GS } = makeCtx();
  // Устанавливаем нужные отношения: Афины враждебны к Персии, Спарта тоже
  ctx.DiplomacyEngine.getRelation('athens', 'persia').score  = -60; // враги
  ctx.DiplomacyEngine.getRelation('sparta', 'persia').score  = -60; // враги
  ctx.DiplomacyEngine.getRelation('athens', 'sparta').score  = +50; // союзники

  GS.nations.athens.influence_points = 30;

  const result = ctx.DiplomacyEngine.proposeCoalition('athens', 'sparta', 'persia');
  ok('Коалиция создана успешно', result.ok === true);
  ok('ОВ списано (30 − 25 = 5)', GS.nations.athens.influence_points === 5);

  // Попытка ещё одной коалиции при нехватке ОВ
  GS.nations.athens.influence_points = 10;
  const result2 = ctx.DiplomacyEngine.proposeCoalition('athens', 'sparta', 'persia');
  ok('Отказ при нехватке ОВ (10 < 25)', result2.ok === false);
  ok('ОВ не изменились после отказа', GS.nations.athens.influence_points === 10);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — Коалиция: возврат ОВ при провале условий
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] proposeCoalition: возврат ОВ при провале дипломатической проверки');
{
  const { ctx, GS } = makeCtx();
  // Афины хотят коалицию, но у Спарты хорошие отношения с Персией
  ctx.DiplomacyEngine.getRelation('athens', 'persia').score  = -60;
  ctx.DiplomacyEngine.getRelation('sparta', 'persia').score  = +40; // Спарта не враг Персии!
  ctx.DiplomacyEngine.getRelation('athens', 'sparta').score  = +50;

  GS.nations.athens.influence_points = 30;

  const result = ctx.DiplomacyEngine.proposeCoalition('athens', 'sparta', 'persia');
  ok('Коалиция отклонена (Спарта не враг Персии)', result.ok === false);
  // ОВ должны вернуться
  ok('ОВ возвращены (30)', GS.nations.athens.influence_points === 30);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — Ограничение ОВ: не превышает 100
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] Ограничение influence_points ≤ 100');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 98;
  GS.nations.sparta.influence_points = 99;
  GS.nations.persia.influence_points = 99;

  // Создать несколько договоров чтобы увеличить доход
  ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'trade_agreement', { duration: 5 });

  // Тик должен поднять до 100, но не выше
  ctx.DiplomacyEngine.processGlobalTick();
  ok('influence_points ≤ 100 после переполнения', GS.nations.athens.influence_points <= 100);
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — bribeNation: недостаточно золота
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] bribeNation: возврат ОВ при нехватке золота');
{
  const { ctx, GS } = makeCtx();
  GS.nations.athens.influence_points = 50;
  GS.nations.athens.economy.treasury = 50; // мало золота

  const r = ctx.DiplomacyEngine.bribeNation('athens', 'sparta', 500); // нужно 500, есть 50
  ok('Отказ при нехватке золота', r.ok === false);
  ok('ОВ возвращены после отказа', GS.nations.athens.influence_points === 50);
}

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
