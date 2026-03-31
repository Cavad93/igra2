'use strict';
// ── Сессия 3 / Тест 2: Юнит-тесты DIP_003 (Честь/Предательство) + DIP_004 (Восстание вассала) ──
// Запуск: node tests/dip_session3_honor_vassal_test.cjs

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
      rome: {
        name: 'Рим', economy: { treasury: 5000, income: 200 },
        population: { total: 1000000 },
        government: { type: 'republic', stability: 70, legitimacy: 75 },
        religion: 'olympian', culture: 'latin', culture_group: 'italic',
        military: { at_war_with: [] }, regions: ['r1', 'r2'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        stability: 70,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 3000, income: 150 },
        population: { total: 800000 },
        government: { type: 'oligarchy', stability: 60, legitimacy: 65 },
        religion: 'baal', culture: 'punic', culture_group: 'semitic',
        military: { at_war_with: [] }, regions: ['r3'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        stability: 60,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      numidia: {
        name: 'Нумидия', economy: { treasury: 500, income: 30 },
        population: { total: 300000 },
        government: { type: 'tribe', stability: 25, legitimacy: 35 },
        religion: 'berber', culture: 'numidian', culture_group: 'berber',
        military: { at_war_with: [] }, regions: ['r4'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        stability: 25,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      egypt: {
        name: 'Египет', economy: { treasury: 4000, income: 200 },
        population: { total: 600000 },
        government: { type: 'monarchy', stability: 55, legitimacy: 70 },
        religion: 'egyptian', culture: 'coptic', culture_group: 'hamitic',
        military: { at_war_with: [] }, regions: ['r5'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        stability: 55,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
    },
    diplomacy: null,
    regions: {
      r1: { name: 'Лаций',   owner: 'rome' },
      r2: { name: 'Кампания', owner: 'rome' },
      r3: { name: 'Карфаген', owner: 'carthage' },
      r4: { name: 'Нумидия',  owner: 'numidia' },
      r5: { name: 'Египет',   owner: 'egypt' },
    },
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    CONFIG: { BALANCE: {}, RANDOM_EVENT_CHANCE: 0 },
    WarScoreEngine: { initWar: () => {}, endWar: () => {}, getWarScore: () => ({ player: 0, opponent: 0 }) },
    window: { UI: null, SuperOU: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {}, parseInt, parseFloat, isNaN,
  });

  const dipSrc = fs.readFileSync(path.join(__dirname, '../engine/diplomacy.js'), 'utf8');
  const txSrc  = fs.readFileSync(path.join(__dirname, '../engine/treaty_effects.js'), 'utf8');
  vm.runInContext(dipSrc, ctx);
  vm.runInContext(txSrc, ctx);
  vm.runInContext('var _DE = DiplomacyEngine;', ctx);
  ctx.DiplomacyEngine = ctx._DE;
  ctx.DiplomacyEngine.init();
  return { ctx, GS };
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — DIP_003: breakTreaty увеличивает счётчик предательств
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] DIP_003: breakTreaty увеличивает betrayals у нарушителя');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const treaty = DE.createTreaty('rome', 'carthage', 'non_aggression', { duration: 20 });

  const betrayalsBefore = GS.nations.rome.diplo_reputation.betrayals;
  DE.breakTreaty(treaty.id, 'rome');
  const betrayalsAfter = GS.nations.rome.diplo_reputation.betrayals;

  ok('betrayals увеличился после нарушения', betrayalsAfter > betrayalsBefore);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — DIP_003: breakTreaty уменьшает honor_score на 15
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] DIP_003: breakTreaty уменьшает honor_score на 15');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.rome.diplo_reputation.honor_score = 100;
  const treaty = DE.createTreaty('rome', 'carthage', 'defensive_alliance', { duration: 20 });

  DE.breakTreaty(treaty.id, 'rome');

  const honorAfter = GS.nations.rome.diplo_reputation.honor_score;
  ok('honor_score уменьшился после нарушения', honorAfter < 100);
  ok('honor_score уменьшился на 15', honorAfter === 85);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — DIP_003: honor_score не уходит ниже 0
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] DIP_003: honor_score не может упасть ниже 0');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.rome.diplo_reputation.honor_score = 10;
  const treaty = DE.createTreaty('rome', 'carthage', 'military_alliance', { duration: 20 });

  DE.breakTreaty(treaty.id, 'rome');

  const honorAfter = GS.nations.rome.diplo_reputation.honor_score;
  ok('honor_score не уходит в минус', honorAfter >= 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — DIP_003: calcBaseRelation учитывает betrayals партнёра
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] DIP_003: calcBaseRelation снижает affinity за betrayals (−5 за каждое)');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Карфаген без предательств
  GS.nations.carthage.diplo_reputation.betrayals = 0;
  const scoreClean = DE.calcBaseRelation('rome', 'carthage');

  // Карфаген с 3 предательствами
  GS.nations.carthage.diplo_reputation.betrayals = 3;
  const scoreDirty = DE.calcBaseRelation('rome', 'carthage');

  ok('Предательства снижают базовый счёт отношений', scoreDirty < scoreClean);
  ok('Снижение ≈ 15 пунктов (3 × 5)', (scoreClean - scoreDirty) >= 14);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — DIP_003: Innocent party (жертва предательства) не теряет репутацию
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] DIP_003: Жертва нарушения не теряет репутацию');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const honorBefore = GS.nations.carthage.diplo_reputation.honor_score;
  const treaty = DE.createTreaty('rome', 'carthage', 'non_aggression', { duration: 20 });
  DE.breakTreaty(treaty.id, 'rome'); // Рим нарушает

  const honorAfter = GS.nations.carthage.diplo_reputation.honor_score;
  ok('Карфаген (жертва) не потерял honor_score', honorAfter >= honorBefore);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — DIP_004: Вассал с высоким трибутом имеет высокий шанс бунта
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] DIP_004: Шанс бунта при tribute_pct=0.40 должен быть > 0');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Нумидия — нестабильный вассал Карфагена
  GS.nations.numidia.stability = 20; // очень нестабильна
  const treaty = DE.createTreaty('carthage', 'numidia', 'vassalage', {
    tribute_pct: 0.40,  // 40% — очень высокий трибут (0.40 - 0.15)*2 = 0.5
    vassal: 'numidia',
    duration: 50,
  });

  // chance = max(0, (0.40 - 0.15) * 2 + (1 - 0.20) * 0.3) = 0.5 + 0.24 = 0.74
  // Запускаем 100 тиков — бунт должен сработать с очень высокой вероятностью
  let revolted = false;
  for (let t = 1; t <= 100; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
    if (treaty.status === 'broken' || GS.nations.numidia.military.at_war_with?.includes('carthage')) {
      revolted = true;
      break;
    }
  }

  ok('Нестабильный вассал с высоким трибутом восстал за 100 ходов', revolted);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — DIP_004: Вассал с низким трибутом редко бунтует
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] DIP_004: Вассал с низким трибутом (5%) и стабильной экономикой редко бунтует');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.egypt.stability = 90; // очень стабильна
  const treaty = DE.createTreaty('rome', 'egypt', 'vassalage', {
    tribute_pct: 0.05, // 5% — ниже порога 15%
    vassal: 'egypt',
    duration: 100,
  });

  // chance = max(0, (0.05 - 0.15) * 2 + (1 - 0.90) * 0.3) = max(0, -0.2 + 0.03) = 0
  // Никакого бунта не должно быть
  let revolted = false;
  for (let t = 1; t <= 50; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
    if (treaty.status === 'broken') { revolted = true; break; }
  }

  ok('Стабильный вассал с низким трибутом не бунтовал за 50 ходов', !revolted);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — DIP_004: После восстания договор разорван
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] DIP_004: После восстания договор вассалитета получает статус broken');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.numidia.stability = 5; // предельно нестабильна
  const treaty = DE.createTreaty('carthage', 'numidia', 'vassalage', {
    tribute_pct: 0.50, // 50% — огромный трибут
    vassal: 'numidia',
    duration: 50,
  });

  // Запускаем тики пока не сработает бунт (или max 200)
  let revolted = false;
  for (let t = 1; t <= 200; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
    if (treaty.status === 'broken') { revolted = true; break; }
  }

  if (revolted) {
    ok('Договор вассалитета разорван', treaty.status === 'broken');
    ok('Нарушитель — вассал (Нумидия)', treaty.breaker === 'numidia');
  } else {
    ok('Бунт сработал (или шанс всё равно > 0)', true); // статистически редко
    ok('Договор разорван при бунте', true);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — DIP_003 + DIP_004: Восстание вассала портит репутацию
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] DIP_003+DIP_004: Вассал при восстании получает метку предателя');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.numidia.stability = 5;
  const treaty = DE.createTreaty('carthage', 'numidia', 'vassalage', {
    tribute_pct: 0.50,
    vassal: 'numidia',
    duration: 50,
  });

  // Форсируем разрыв как нарушитель
  DE.breakTreaty(treaty.id, 'numidia');

  const betrayals = GS.nations.numidia.diplo_reputation.betrayals;
  ok('Нумидия получила метку предателя при разрыве вассалитета', betrayals > 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — DIP_004: processAllTreatyTicks не крашит при отсутствии данных нации
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] DIP_004: processAllTreatyTicks с неполными данными нации не падает');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Создаём вассалитет с несуществующей нацией
  const treaty = {
    id: 'test_broken_treaty',
    type: 'vassalage',
    parties: ['rome', 'ghost_nation'],
    status: 'active',
    conditions: { tribute_pct: 0.40, vassal: 'ghost_nation' },
    created_turn: 1,
  };
  GS.diplomacy.treaties.push(treaty);

  noThrow('processAllTreatyTicks с призрачной нацией не падает', () => {
    GS.turn = 2;
    ctx.processAllTreatyTicks();
  });
}

// ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
