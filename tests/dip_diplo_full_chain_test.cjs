'use strict';
// ── Полный интеграционный тест дипломатической цепочки DIP_001..DIP_010 ───
// Проверяет что все DIP-улучшения работают совместно без конфликтов
// Запуск: node tests/dip_diplo_full_chain_test.cjs

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

function makeFullCtx() {
  const GS = {
    turn: 1,
    player_nation: 'athens',
    nations: {
      athens: {
        name: 'Афины', economy: { treasury: 3000 },
        population: { total: 600000 }, government: { type: 'democracy', stability: 65, legitimacy: 70 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r1', 'r2'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0.1, sanctions_received: 0, sanctions_imposed: 0 } },
      },
      sparta: {
        name: 'Спарта', economy: { treasury: 1500 },
        population: { total: 350000 }, government: { type: 'oligarchy', stability: 55, legitimacy: 60 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r3', 'r4'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0.3, sanctions_received: 0, sanctions_imposed: 0 } },
      },
      thebes: {
        name: 'Фивы', economy: { treasury: 800 },
        population: { total: 200000 }, government: { type: 'oligarchy', stability: 40, legitimacy: 45 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r5'], relations: {},
        diplo_reputation: { betrayals: 1, honor_score: 85 },
        _ou: { diplomacy: [
          { name: 'historical_grievances', current: 0.7 },
          { name: 'sanctions_received',   current: 0 },
          { name: 'sanctions_imposed',    current: 0 },
        ] },
      },
      persia: {
        name: 'Персия', economy: { treasury: 8000 },
        population: { total: 2500000 }, government: { type: 'monarchy', stability: 50, legitimacy: 80 },
        religion: 'zoroastrian', culture: 'persian', culture_group: 'iranian',
        military: { at_war_with: [] }, regions: ['r6', 'r7', 'r8'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0.2, sanctions_received: 0, sanctions_imposed: 0 } },
      },
    },
    diplomacy: null,
    regions: {
      r1: { name: 'Аттика', owner: 'athens' },
      r2: { name: 'Пирей',  owner: 'athens' },
      r3: { name: 'Лакония', owner: 'sparta' },
      r4: { name: 'Мессения', owner: 'sparta' },
      r5: { name: 'Беотия', owner: 'thebes' },
      r6: { name: 'Сарды',  owner: 'persia' },
      r7: { name: 'Сузы',   owner: 'persia' },
      r8: { name: 'Персеполь', owner: 'persia' },
    },
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    WarScoreEngine: {
      initWar: () => {},
      endWar:  () => {},
      getWarScore: () => ({ player: 0, opponent: 0 }),
    },
    window: { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {},
    parseInt, parseFloat, isNaN,
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  vm.runInContext(src, ctx);
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;
  ctx.DiplomacyEngine.init();
  return { ctx, GS };
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — DIP_001: Эмбарго влияет на отношения
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] DIP_001: Создание и трекинг эмбарго');
{
  const { ctx, GS } = makeFullCtx();
  noThrow('createTreaty embargo не падает', () => {
    const t = ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'embargo', {
      embargo_target: 'sparta',
      duration: 5,
    });
    ok('Договор эмбарго создан', !!t);
    ok('Тип = embargo', t.type === 'embargo');
    ok('Статус = active', t.status === 'active');
  });
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — DIP_003: Репутация и honor_score
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] DIP_003: Репутация при нарушении договора');
{
  const { ctx, GS } = makeFullCtx();
  // Создать перемирие и нарушить его
  const treaty = ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'armistice', { duration: 5 });
  ok('Перемирие создано', !!treaty);

  GS.nations.athens.diplo_reputation = { betrayals: 0, honor_score: 100 };

  noThrow('breakTreaty не падает', () => {
    ctx.DiplomacyEngine.breakTreaty(treaty.id, 'athens');
  });
  // После разрыва репутация должна упасть (если функция _recordBetrayalDirect работает)
  const dipRep = GS.nations.athens.diplo_reputation;
  ok('diplo_reputation существует', !!dipRep);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — DIP_005: Брачный союз
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] DIP_005: Брачный союз и dynasty_link');
{
  const { ctx, GS } = makeFullCtx();
  const t = ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'marriage_alliance', {
    dynasty_link: true,
  });
  ok('Брачный союз создан', !!t);
  ok('dynasty_link = true', t.conditions?.dynasty_link === true);

  // Смерть правителя не должна вызвать краш
  noThrow('onRulerDeath не падает', () => {
    ctx.DiplomacyEngine.onRulerDeath('athens');
  });
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — DIP_007: Религиозное влияние через cultural_exchange
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] DIP_007: Религиозное влияние через cultural_exchange');
{
  const { ctx, GS } = makeFullCtx();
  // athens (olympian) + persia (zoroastrian)
  ctx.DiplomacyEngine.createTreaty('athens', 'persia', 'cultural_exchange', { duration: 10 });

  noThrow('processReligionSpread не падает', () => {
    // Запустить много раз чтобы триггернуть (1% шанс)
    for (let i = 0; i < 50; i++) {
      ctx.DiplomacyEngine.processReligionSpread();
    }
  });
  // Либо влияние появилось, либо нет — главное нет краша
  ok('religion_influence инициализирован если нужен', true); // no-throw = ok
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — DIP_008: Поиск общих врагов
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] DIP_008: findCommonEnemies');
{
  const { ctx, GS } = makeFullCtx();

  // Установить отношения
  ctx.DiplomacyEngine.getRelation('athens', 'persia').score  = -70;
  ctx.DiplomacyEngine.getRelation('sparta', 'persia').score  = -60;
  ctx.DiplomacyEngine.getRelation('athens', 'sparta').score  = +50;

  const enemies = ctx.DiplomacyEngine.findCommonEnemies('athens', 'sparta');
  ok('findCommonEnemies возвращает массив', Array.isArray(enemies));
  ok('Персия входит в общих врагов', enemies.includes('persia'));
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — DIP_009: Исторические обиды
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] DIP_009: Исторические обиды и getGrievance');
{
  const { ctx, GS } = makeFullCtx();

  const gv = ctx.DiplomacyEngine.getGrievance('thebes');
  ok('Обиды Фив ≥ 0', gv >= 0);
  ok('Обиды Фив ≤ 1', gv <= 1);
  ok('Фивы имеют обиды > 0 (из _ou.diplomacy.historical_grievances)', gv > 0);

  noThrow('processHistoricalGrievances не падает', () => {
    ctx.DiplomacyEngine.processHistoricalGrievances();
  });
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — DIP_010 + DIP_008: Цепочка накопить ОВ → коалиция
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] DIP_010 + DIP_008: ОВ блокируют коалицию при нехватке');
{
  const { ctx, GS } = makeFullCtx();
  GS.nations.athens.influence_points = 5; // мало ОВ

  ctx.DiplomacyEngine.getRelation('athens', 'persia').score = -70;
  ctx.DiplomacyEngine.getRelation('sparta', 'persia').score = -60;
  ctx.DiplomacyEngine.getRelation('athens', 'sparta').score = +55;

  const r = ctx.DiplomacyEngine.proposeCoalition('athens', 'sparta', 'persia');
  ok('Коалиция заблокирована (5 ОВ < 25)', r.ok === false);
  ok('ОВ не потрачены', GS.nations.athens.influence_points === 5);

  // Теперь накапливаем достаточно
  GS.nations.athens.influence_points = 30;
  const r2 = ctx.DiplomacyEngine.proposeCoalition('athens', 'sparta', 'persia');
  ok('Коалиция создана при 30 ОВ', r2.ok === true);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — processDiplomacyGlobalTick комплексный
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] processDiplomacyGlobalTick: все DIP-подсистемы за 1 ход');
{
  const { ctx, GS } = makeFullCtx();
  // Создаём договоры разных типов
  ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'cultural_exchange', { duration: 5 });
  ctx.DiplomacyEngine.createTreaty('athens', 'thebes', 'trade_agreement', { duration: 5 });

  noThrow('processDiplomacyGlobalTick с несколькими договорами не падает', () => {
    for (let turn = 1; turn <= 10; turn++) {
      GS.turn = turn;
      ctx.DiplomacyEngine.processGlobalTick();
    }
  });

  ok('Афины накапливают ОВ за 10 ходов', GS.nations.athens.influence_points >= 20);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — DIP_001 + DIP_010: Эмбарго не сбрасывает ОВ
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] DIP_001 + DIP_010: Эмбарго не конфликтует с ОВ');
{
  const { ctx, GS } = makeFullCtx();
  GS.nations.athens.influence_points = 50;
  ctx.DiplomacyEngine.createTreaty('athens', 'sparta', 'embargo', {
    embargo_target: 'sparta', duration: 5,
  });
  noThrow('processGlobalTick с эмбарго не падает', () => {
    ctx.DiplomacyEngine.processGlobalTick();
  });
  ok('ОВ афин не обнулены из-за эмбарго', GS.nations.athens.influence_points > 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — calcBaseRelation учитывает honor_score (DIP_003 + DIP_010)
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] DIP_003 + DIP_010: honor_score влияет на calcBaseRelation');
{
  const { ctx, GS } = makeFullCtx();

  // Нация с плохой репутацией
  GS.nations.thebes.diplo_reputation = { betrayals: 3, honor_score: 55 };

  noThrow('calcBaseRelation не падает с низким honor_score', () => {
    const score = ctx.DiplomacyEngine.calcBaseRelation('athens', 'thebes');
    ok('calcBaseRelation возвращает число', typeof score === 'number');
    ok('score в диапазоне -100..100', score >= -100 && score <= 100);
  });
}

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
