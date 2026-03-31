'use strict';
// ── Сессия 3 / Тест 4: Полный сценарий эскалации войны ───────────────────────
// Цепочка: Эмбарго → Инциденты → Шпион пойман → Война → Восстание вассала
// Проверяет, что все DIP-системы корректно взаимодействуют
// Запуск: node tests/dip_session3_war_escalation_chain_test.cjs

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
        name: 'Рим', economy: { treasury: 8000, income: 300 },
        population: { total: 1000000 },
        government: { type: 'republic', stability: 75, legitimacy: 80, ruler: 'Scipio' },
        religion: 'olympian', culture: 'latin', culture_group: 'italic',
        military: { at_war_with: [] }, regions: ['r1', 'r2', 'r3'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        stability: 75,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 6000, income: 250 },
        population: { total: 800000 },
        government: { type: 'oligarchy', stability: 55, legitimacy: 60, ruler: 'Hamilcar' },
        religion: 'baal', culture: 'punic', culture_group: 'semitic',
        military: { at_war_with: [] }, regions: ['r4', 'r5'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        stability: 55,
        _ou: { diplomacy: [{ name: 'historical_grievances', current: 0.7 }] }, // высокие обиды!
      },
      numidia: {
        name: 'Нумидия', economy: { treasury: 800, income: 40 },
        population: { total: 300000 },
        government: { type: 'tribe', stability: 20, legitimacy: 30, ruler: 'Jugurtha' },
        religion: 'berber', culture: 'numidian', culture_group: 'berber',
        military: { at_war_with: [] }, regions: ['r6'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        stability: 20,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      greece: {
        name: 'Эллада', economy: { treasury: 3000, income: 120 },
        population: { total: 500000 },
        government: { type: 'democracy', stability: 60, legitimacy: 65, ruler: 'Lysander' },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r7', 'r8'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        stability: 60,
        _ou: { diplomacy: { historical_grievances: 0.2 } },
      },
    },
    diplomacy: null,
    regions: {
      r1: { name: 'Лаций',    owner: 'rome' },
      r2: { name: 'Кампания', owner: 'rome' },
      r3: { name: 'Сицилия',  owner: 'rome' },
      r4: { name: 'Карфаген', owner: 'carthage' },
      r5: { name: 'Нумидия',  owner: 'carthage' },
      r6: { name: 'Гетулия',  owner: 'numidia' },
      r7: { name: 'Аттика',   owner: 'greece' },
      r8: { name: 'Беотия',   owner: 'greece' },
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
// TEST 1 — ЦЕПОЧКА: Шаг 1 — Рим вводит эмбарго на Карфаген
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] Цепочка Шаг 1: Рим вводит эмбарго на Карфаген');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Рим даёт Карфагену достаточно ОВ для тестирования
  GS.nations.rome.influence_points = 50;

  const treasuryBefore = GS.nations.carthage.economy.treasury;

  const embargoTreaty = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 20,
  });

  // Применяем 5 ходов
  for (let t = 1; t <= 5; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
  }

  const treasuryAfter = GS.nations.carthage.economy.treasury;
  ok('Эмбарго создано успешно', embargoTreaty.status === 'active');
  ok('Казна Карфагена уменьшилась за 5 ходов', treasuryAfter < treasuryBefore);
  console.log(`    💰 Казна: ${treasuryBefore} → ${treasuryAfter} (−${treasuryBefore - treasuryAfter})`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — ЦЕПОЧКА: Шаг 2 — Шпион Рима пойман в Карфагене
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] Цепочка Шаг 2: Шпион Рима пойман → отношения ухудшились на -20');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const relBefore = DE.getRelationScore('rome', 'carthage');

  // Шпион пойман
  DE.addEvent('rome', 'carthage', -20, 'spy_caught');

  // Добавляем casus_belli
  const rel = DE.getRelation('rome', 'carthage');
  if (!rel.casus_belli) rel.casus_belli = [];
  rel.casus_belli.push({
    type: 'spy_caught',
    holder: 'rome',
    against: 'carthage',
    turn: 1,
    expires: 30,
  });

  const cb = DE.getCasusBelli('rome', 'carthage');
  const events = (rel.events || []).filter(e => e.type === 'spy_caught');

  ok('Событие spy_caught зафиксировано', events.length > 0);
  ok('casus_belli сгенерирован', cb.length > 0);
  console.log(`    🕵️ Casus Belli: ${cb.length} штук`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — ЦЕПОЧКА: Шаг 3 — Объявление войны
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] Цепочка Шаг 3: Рим объявляет войну Карфагену');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Сначала ухудшаем отношения
  DE.addEvent('rome', 'carthage', -30, 'spy_caught');

  const result = DE.declareWar('rome', 'carthage');

  ok('Война объявлена (ok или state изменился)', result?.ok !== false);
  ok('Рим в состоянии войны с Карфагеном', DE.isAtWar('rome', 'carthage'));

  const rel = DE.getRelation('rome', 'carthage');
  ok('Отношения значительно ухудшились', rel.score <= -50);
  console.log(`    ⚔️ Статус войны: isAtWar = ${DE.isAtWar('rome', 'carthage')}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — ЦЕПОЧКА: Шаг 4 — Вассал поднимает восстание во время войны
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] Цепочка Шаг 4: Вассал Карфагена восстаёт пока Карфаген воюет');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Сначала объявляем войну
  DE.declareWar('rome', 'carthage');

  // Нумидия — вассал Карфагена с высоким трибутом и нестабильностью
  GS.nations.numidia.stability = 10;
  const vassalTreaty = DE.createTreaty('carthage', 'numidia', 'vassalage', {
    tribute_pct: 0.45,
    vassal: 'numidia',
    duration: 50,
  });

  // Запускаем тики в ожидании бунта
  let revolted = false;
  for (let t = 1; t <= 200; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
    if (vassalTreaty.status === 'broken' ||
        GS.nations.numidia.military.at_war_with?.includes('carthage')) {
      revolted = true;
      console.log(`    ⚔️ Восстание случилось на ходу ${t}`);
      break;
    }
  }

  ok('Вассал восстал (шанс высокий с нестабильностью 10)', revolted);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — ЦЕПОЧКА: Шаг 5 — Исторические обиды Карфагена активируются
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] Цепочка Шаг 5: Карфаген (grievances=0.7) требует репараций');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Карфаген имеет grievances = 0.7, Рим — потенциальная цель
  // Устанавливаем Риму худшие отношения с Карфагеном
  const rel = DE.getRelation('carthage', 'rome');
  rel.score = -60; // Рим — наихудший враг

  // Запускаем 100 тиков — с 5% шансом за ход grievances > 0.6 должны сработать
  let reparationsDemanded = false;
  for (let t = 1; t <= 100; t++) {
    GS.turn = t;
    GS.player_nation = 'greece'; // Рим — ИИ, чтобы сработал триггер
    DE.processHistoricalGrievances();
    const relRomeCarthage = DE.getRelation('rome', 'carthage');
    const demandEvents = (relRomeCarthage.events || []).filter(e => e.type === 'demand_reparations');
    if (demandEvents.length > 0) {
      reparationsDemanded = true;
      console.log(`    📜 Требования репараций появились на ходу ${t}`);
      break;
    }
  }

  ok('Карфаген потребовал репараций за 100 ходов (grievances 0.7, 5% шанс)', reparationsDemanded);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — ЦЕПОЧКА: Шаг 6 — Рим предлагает коалицию против Карфагена
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] Цепочка Шаг 6: Рим предлагает Греции коалицию против Карфагена');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Устанавливаем нужные отношения
  const relRomeGreece = DE.getRelation('rome', 'greece');
  relRomeGreece.score = 50; // Рим и Греция дружат

  const relGreeceCarth = DE.getRelation('greece', 'carthage');
  relGreeceCarth.score = -50; // Греция враждебна к Карфагену

  const relRomeCarth = DE.getRelation('rome', 'carthage');
  relRomeCarth.score = -50; // Рим враждебен к Карфагену

  // Даём Риму ОВ
  GS.nations.rome.influence_points = 50;

  const result = DE.proposeCoalition('rome', 'greece', 'carthage');

  ok('Коалиция сформирована', result.ok === true);
  ok('ОВ потрачены (50 - 25 = 25)', GS.nations.rome.influence_points === 25);

  const coalitionTreaty = GS.diplomacy.treaties.find(t =>
    t.type === 'joint_campaign' &&
    t.parties.includes('rome') &&
    t.parties.includes('greece')
  );
  ok('Договор joint_campaign создан', !!coalitionTreaty);
  ok('Цель коалиции = Карфаген', coalitionTreaty?.conditions?.coalition_enemy === 'carthage');
  console.log(`    ⚡ Коалиция: ${JSON.stringify(result)}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — ЦЕПОЧКА: DIP_001+DIP_003 — Эмбарго + нарушение перемирия
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] Цепочка: Эмбарго + нарушение перемирия → двойной штраф');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Создаём перемирие
  const armistice = DE.createTreaty('rome', 'carthage', 'armistice', { duration: 30 });

  // Создаём эмбарго пока перемирие активно
  const embargo = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 10,
  });

  // Рим нарушает перемирие
  DE.breakTreaty(armistice.id, 'rome');

  ok('Перемирие нарушено', armistice.status === 'broken');
  ok('Эмбарго всё ещё активно', embargo.status === 'active');

  // honor_score упал у Рима
  const honorRome = GS.nations.rome.diplo_reputation.honor_score;
  ok('honor_score Рима уменьшился', honorRome < 100);
  console.log(`    💀 honor_score Рима: ${honorRome}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — ПОЛНАЯ ЦЕПОЧКА: 10 ходов с несколькими активными DIP-подсистемами
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] Полная цепочка: 10 ходов с эмбарго + вассалом + договорами одновременно');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Рим держит эмбарго на Карфаген
  DE.createTreaty('rome', 'carthage', 'embargo', { embargo_target: 'carthage', duration: 20 });

  // Нумидия — стабильный вассал Карфагена (низкий трибут)
  GS.nations.numidia.stability = 60;
  DE.createTreaty('carthage', 'numidia', 'vassalage', {
    tribute_pct: 0.10, // 10% — ниже порога
    vassal: 'numidia',
    duration: 50,
  });

  // Рим + Греция — торговые партнёры
  DE.createTreaty('rome', 'greece', 'trade_agreement', { duration: 30 });

  const romeIPBefore = DE.getInfluencePoints('rome');
  const carthTreasuryBefore = GS.nations.carthage.economy.treasury;

  noThrow('10 ходов с множеством активных договоров не падает', () => {
    for (let t = 1; t <= 10; t++) {
      GS.turn = t;
      ctx.processAllTreatyTicks();
      DE.processGlobalTick();
    }
  });

  const romeIPAfter = DE.getInfluencePoints('rome');
  const carthTreasuryAfter = GS.nations.carthage.economy.treasury;

  ok('Рим накопил ОВ за 10 ходов', romeIPAfter > romeIPBefore);
  ok('Казна Карфагена снизилась от эмбарго', carthTreasuryAfter < carthTreasuryBefore);
  console.log(`    📊 ОВ Рима: ${romeIPBefore} → ${romeIPAfter}`);
  console.log(`    💰 Казна Карфагена: ${carthTreasuryBefore} → ${carthTreasuryAfter}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — ЦЕПОЧКА: onRulerDeath во время войны
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] Цепочка: Смерть правителя во время войны не ломает систему');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.turn = 5;
  // Брачный союз
  DE.createTreaty('rome', 'greece', 'marriage_alliance', { duration: 50 });
  // Война с Карфагеном
  DE.declareWar('rome', 'carthage');

  noThrow('onRulerDeath во время войны не крашит', () => DE.onRulerDeath('rome'));
  noThrow('processGlobalTick после смерти правителя не крашит', () => {
    GS.turn = 6;
    DE.processGlobalTick();
  });

  ok('Война с Карфагеном продолжается', DE.isAtWar('rome', 'carthage'));
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — ЦЕПОЧКА: Мир после войны восстанавливает возможность договоров
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] Цепочка: Мир после войны → можно снова заключать договоры');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Объявляем войну
  DE.declareWar('rome', 'carthage');
  ok('В состоянии войны', DE.isAtWar('rome', 'carthage'));

  // Заключаем мир
  noThrow('concludePeace не крашит', () => DE.concludePeace('rome', 'carthage', {}));
  ok('Война завершена', !DE.isAtWar('rome', 'carthage'));

  // После мира можно заключить торговый договор
  GS.nations.rome.influence_points = 50;
  const trade = DE.createTreaty('rome', 'carthage', 'trade_agreement', { duration: 20 });
  ok('Торговый договор создан после мира', trade.status === 'active');
}

// ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
