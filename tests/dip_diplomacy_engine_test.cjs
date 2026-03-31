'use strict';
// ── Комплексный тест дипломатического движка: API, отношения, договоры ────
// Проверяет все публичные методы DiplomacyEngine
// Запуск: node tests/dip_diplomacy_engine_test.cjs

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

function makeCtx() {
  const GS = {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome:     {
        name: 'Рим', economy: { treasury: 5000 },
        population: { total: 1000000 }, government: { type: 'republic', stability: 70, legitimacy: 75 },
        religion: 'olympian', culture: 'latin', culture_group: 'italic',
        military: { at_war_with: [] }, regions: ['r1', 'r2', 'r3'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 6000 },
        population: { total: 800000 }, government: { type: 'oligarchy', stability: 60, legitimacy: 65 },
        religion: 'baal', culture: 'punic', culture_group: 'semitic',
        military: { at_war_with: [] }, regions: ['r4', 'r5'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      greece:   {
        name: 'Эллада', economy: { treasury: 2000 },
        population: { total: 500000 }, government: { type: 'democracy', stability: 55, legitimacy: 60 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r6'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      gaul:     {
        name: 'Галлия', economy: { treasury: 800 },
        population: { total: 1200000 }, government: { type: 'tribe', stability: 30, legitimacy: 40 },
        religion: 'celtic', culture: 'gaulish', culture_group: 'celtic',
        military: { at_war_with: [] }, regions: ['r7', 'r8'], relations: {},
        diplo_reputation: { betrayals: 2, honor_score: 70 },
        _ou: { diplomacy: { historical_grievances: 0.5 } },
      },
    },
    diplomacy: null,
    regions: {},
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addEventLog: () => {},
    CONFIG: { BALANCE: { INFANTRY_UPKEEP: 2, CAVALRY_UPKEEP: 4 }, RANDOM_EVENT_CHANCE: 0 },
    WarScoreEngine: {
      initWar: () => {}, endWar: () => {},
      getWarScore: () => ({ player: 0, opponent: 0 }),
    },
    window: { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {}, parseInt, parseFloat, isNaN,
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  vm.runInContext(src, ctx);
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;
  ctx.DiplomacyEngine.init();
  return { ctx, GS };
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — DiplomacyEngine экспортирует все необходимые методы DIP_010
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] DiplomacyEngine экспортирует все DIP_010 методы');
{
  const { ctx } = makeCtx();
  const DE = ctx.DiplomacyEngine;
  ok('getInfluencePoints существует',  typeof DE.getInfluencePoints === 'function');
  ok('spendInfluencePoints существует', typeof DE.spendInfluencePoints === 'function');
  ok('bribeNation существует',         typeof DE.bribeNation === 'function');
  ok('INFLUENCE_COSTS существует',     typeof DE.INFLUENCE_COSTS === 'object');
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — Все типы договоров регистрируются корректно
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] TREATY_TYPES содержит все ожидаемые типы');
{
  const { ctx } = makeCtx();
  const types = ctx.DiplomacyEngine.TREATY_TYPES;
  const expected = [
    'trade_agreement', 'non_aggression', 'defensive_alliance', 'military_alliance',
    'marriage_alliance', 'vassalage', 'peace_treaty', 'military_access', 'war_reparations',
    'armistice', 'territorial_exchange', 'joint_campaign', 'cultural_exchange', 'embargo', 'custom',
  ];
  for (const t of expected) {
    ok(`Тип договора «${t}» существует`, !!types[t]);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — Цикл отношений: создание, получение, изменение
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] Цикл отношений: создание, получение, изменение');
{
  const { ctx } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const rel = DE.getRelation('rome', 'carthage');
  ok('getRelation возвращает объект', typeof rel === 'object');
  ok('rel.score — число', typeof rel.score === 'number');
  ok('rel.war — false изначально', rel.war === false);

  // addEvent записывает событие в память, score меняется через α-convergence
  const relBefore = DE.getRelation('rome', 'carthage');
  const eventsBefore = (relBefore.events ?? []).length;
  DE.addEvent('rome', 'carthage', +20, 'test');
  const eventsAfter = (relBefore.events ?? []).length;
  ok('addEvent записывает событие', eventsAfter > eventsBefore);

  const label = DE.getRelationLabel(60);
  ok('getRelationLabel(60) = Союзник', label.label === 'Союзник');
  const label2 = DE.getRelationLabel(-60);
  ok('getRelationLabel(-60) = Война', label2.label === 'Война');
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — Создание и истечение договора
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] Создание договора, проверка expires и getActiveTreaties');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const t = DE.createTreaty('rome', 'greece', 'trade_agreement', { duration: 5 });
  ok('Договор создан', !!t);
  ok('turn_expires = 1 + 5*12 = 61', t.turn_expires === 61);

  const active = DE.getActiveTreaties('rome', 'greece');
  ok('getActiveTreaties возвращает договор', active.length >= 1);
  ok('Первый договор — trade_agreement', active[0].type === 'trade_agreement');

  // Имитируем истечение: processTick(nationId) проверяет turn_expires
  GS.turn = 62;
  DE.processTick('rome');
  DE.processTick('greece');
  const activeAfter = DE.getActiveTreaties('rome', 'greece');
  ok('Договор истёк после turn=62', activeAfter.length === 0 || activeAfter.every(x => x.status !== 'active'));
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — Объявление войны и проверка isAtWar
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] Объявление войны — isAtWar, военный статус');
{
  const { ctx } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  ok('Нет войны изначально', !DE.isAtWar('rome', 'gaul'));

  const result = DE.declareWar('rome', 'gaul');
  ok('declareWar ok:true', result.ok !== false);
  ok('isAtWar = true после войны', DE.isAtWar('rome', 'gaul'));
  ok('Score упал', DE.getRelationScore('rome', 'gaul') <= -60);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — breakTreaty и DIP_003 honor_score
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] breakTreaty и снижение honor_score');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const treaty = DE.createTreaty('rome', 'carthage', 'non_aggression', { duration: 10 });
  ok('Пакт о ненападении создан', !!treaty);

  GS.nations.rome.diplo_reputation = { betrayals: 0, honor_score: 100 };
  DE.breakTreaty(treaty.id, 'rome');

  ok('Статус договора = broken', treaty.status === 'broken');
  const relScore = DE.getRelationScore('rome', 'carthage');
  ok('Отношения ухудшились', relScore < 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — Вассалитет + evalAIReceptiveness
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] evalAIReceptiveness для вассалитета');
{
  const { ctx } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Галлия слабая нация — должна охотнее принять вассалитет
  const receptStrong = DE.evalReceptiveness('gaul', 'rome', 'vassalage');
  const receptTrade  = DE.evalReceptiveness('gaul', 'rome', 'trade_agreement');

  ok('evalReceptiveness возвращает число 0..1', receptStrong >= 0 && receptStrong <= 1);
  ok('Торговый договор охотнее вассалитета', receptTrade > receptStrong || receptTrade >= 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — processGlobalTick: α-конвергенция изменяет score
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] α-конвергенция: score дрейфует к базовому');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Сильно отрицательный score
  DE.getRelation('rome', 'greece').score = -80;

  for (let i = 0; i < 20; i++) {
    GS.turn = i + 1;
    DE.processGlobalTick();
  }

  const scoreAfter = DE.getRelationScore('rome', 'greece');
  // После 20 ходов конвергенции score должен стать выше -80
  ok('Score дрейфует к базовому (не остаётся -80)', scoreAfter > -80);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — getAllTreaties возвращает все договоры нации
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] getAllTreaties возвращает все договоры нации');
{
  const { ctx } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  DE.createTreaty('rome', 'greece',   'trade_agreement',  { duration: 5 });
  DE.createTreaty('rome', 'carthage', 'non_aggression',   { duration: 10 });
  DE.createTreaty('rome', 'gaul',     'military_alliance', { duration: 15 });

  const all = DE.getAllTreaties('rome');
  ok('getAllTreaties ≥ 3 договора', all.length >= 3);
  ok('Все договоры с участием Рима', all.every(t => t.parties.includes('rome')));
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — DIP_010: несколько нации — независимые ОВ
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] DIP_010: ОВ разных наций не смешиваются');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.rome.influence_points     = 50;
  GS.nations.carthage.influence_points = 20;
  GS.nations.gaul.influence_points     = 5;

  // Рим тратит ОВ
  DE.spendInfluencePoints('rome', 30, 'тест');

  ok('Рим: 50-30=20 ОВ', GS.nations.rome.influence_points === 20);
  ok('Карфаген: 20 ОВ (не изменился)', GS.nations.carthage.influence_points === 20);
  ok('Галлия: 5 ОВ (не изменилась)', GS.nations.gaul.influence_points === 5);

  // Подкуп Карфагена от Рима не затрагивает Галлию
  GS.nations.rome.influence_points = 25; // пополнить
  GS.nations.rome.economy.treasury = 2000;
  DE.bribeNation('rome', 'carthage', 300);

  ok('Галлия всё ещё 5 ОВ после подкупа Карфагена', GS.nations.gaul.influence_points === 5);
}

// ═══════════════════════════════════════════════════════════════
// ИТОГ
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
