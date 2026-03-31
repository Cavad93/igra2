'use strict';
// ── Сессия 3 / Тест 1: Юнит-тесты DIP_001 (Эмбарго) + DIP_002 (Инциденты) ──
// Проверяет точные механики эмбарго и дипломатических инцидентов
// Запуск: node tests/dip_session3_embargo_incidents_test.cjs

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
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 6000, income: 300 },
        population: { total: 800000 },
        government: { type: 'oligarchy', stability: 60, legitimacy: 65 },
        religion: 'baal', culture: 'punic', culture_group: 'semitic',
        military: { at_war_with: [] }, regions: ['r3', 'r4'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      greece: {
        name: 'Эллада', economy: { treasury: 2000, income: 100 },
        population: { total: 500000 },
        government: { type: 'democracy', stability: 55, legitimacy: 60 },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r5', 'r6'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      gaul: {
        name: 'Галлия', economy: { treasury: 800, income: 50 },
        population: { total: 1200000 },
        government: { type: 'tribe', stability: 30, legitimacy: 40 },
        religion: 'celtic', culture: 'gaulish', culture_group: 'celtic',
        military: { at_war_with: [] }, regions: ['r7', 'r8'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
    },
    diplomacy: null,
    regions: {
      r1: { name: 'Лаций',   owner: 'rome' },
      r2: { name: 'Кампания', owner: 'rome' },
      r3: { name: 'Карфаген', owner: 'carthage' },
      r4: { name: 'Нумидия',  owner: 'carthage' },
      r5: { name: 'Аттика',   owner: 'greece' },
      r6: { name: 'Беотия',   owner: 'greece' },
      r7: { name: 'Галлия',   owner: 'gaul' },
      r8: { name: 'Бельгика', owner: 'gaul' },
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
// TEST 1 — DIP_001: Эмбарго уменьшает казну цели на 20% за ход
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] DIP_001: Эмбарго уменьшает казну цели на ~20% дохода за ход');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Создаём договор эмбарго Рим → Карфаген
  const treaty = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 10,
  });

  const treasuryBefore = GS.nations.carthage.economy.treasury; // 6000
  const incomeCarthage = GS.nations.carthage.economy.income;   // 300
  const expectedPenalty = incomeCarthage * 0.20; // 60

  // Применяем эмбарго напрямую
  DE.applyEmbargo(treaty, 1);

  const treasuryAfter = GS.nations.carthage.economy.treasury;
  ok('Казна Карфагена уменьшилась', treasuryAfter < treasuryBefore);
  ok(`Штраф ≈ 20% дохода (${expectedPenalty})`, Math.abs((treasuryBefore - treasuryAfter) - expectedPenalty) < 1);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — DIP_001: Эмбарго даёт +5 к отношениям с врагами цели
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] DIP_001: Эмбарго улучшает отношения с врагами цели на +5');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Устанавливаем: Греция враждебна к Карфагену (score < -20)
  const relGreeceCarthage = DE.getRelation('greece', 'carthage');
  relGreeceCarthage.score = -40;

  // Рим объявляет эмбарго Карфагена
  const treaty = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 10,
  });

  const relRomeGreceBefore = DE.getRelationScore('rome', 'greece');
  DE.applyEmbargo(treaty, 1);
  const relRomeGreceAfter = DE.getRelationScore('rome', 'greece');

  ok('Отношения Рима с Грецией улучшились', relRomeGreceAfter > relRomeGreceBefore);
  ok('Улучшение = +5 (враг врага)', (relRomeGreceAfter - relRomeGreceBefore) >= 5);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — DIP_001: Дружественные нации не получают бонус от эмбарго
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] DIP_001: Нации с нейтральными/хорошими отношениями с целью не получают бонус');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Галлия нейтральна к Карфагену (score = 0, > -20)
  const relGaulCarthage = DE.getRelation('gaul', 'carthage');
  relGaulCarthage.score = 10; // дружелюбна

  const treaty = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 10,
  });

  const relRomeGaulBefore = DE.getRelationScore('rome', 'gaul');
  DE.applyEmbargo(treaty, 1);
  const relRomeGaulAfter  = DE.getRelationScore('rome', 'gaul');

  ok('Нейтральная Галлия не получила бонус от эмбарго', relRomeGaulAfter === relRomeGaulBefore);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — DIP_001: Эмбарго не затрагивает казну самого инициатора
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] DIP_001: Казна инициатора эмбарго не уменьшается');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const treaty = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 10,
  });

  const romeTreasuryBefore = GS.nations.rome.economy.treasury;
  DE.applyEmbargo(treaty, 1);
  const romeTreasuryAfter = GS.nations.rome.economy.treasury;

  ok('Казна Рима (инициатора) не изменилась', romeTreasuryAfter === romeTreasuryBefore);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — DIP_001: processAllTreatyTicks вызывает applyEmbargo каждый ход
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] DIP_001: processAllTreatyTicks применяет штраф эмбарго за 3 хода');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Создаём эмбарго
  DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    income_per_turn: 300,
    duration: 10,
  });
  GS.nations.carthage.economy.treasury = 6000;

  // Применяем 3 хода через processAllTreatyTicks
  for (let t = 1; t <= 3; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
  }

  const finalTreasury = GS.nations.carthage.economy.treasury;
  ok('Казна Карфагена уменьшилась за 3 хода эмбарго', finalTreasury < 6000);
  ok('Казна не ушла в минус', finalTreasury >= 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — DIP_002: Инцидент не срабатывает при хороших отношениях
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] DIP_002: Инцидент НЕ срабатывает при отношениях ≥ -20');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Рим и Греция дружат
  const rel = DE.getRelation('rome', 'greece');
  rel.score = 30;

  const scoresBefore = rel.score;
  // Запускаем 1000 глобальных тиков — при score ≥ -20 инцидент не должен сработать
  for (let i = 0; i < 1000; i++) {
    GS.turn = i + 1;
    DE.processGlobalTick();
  }

  // Score может измениться через α-конвергенцию, но не должен падать из-за инцидентов
  // Главное — не ниже базового с большим отрывом из-за инцидентов
  ok('Отношения не рухнули из-за инцидентов при мирных отношениях', rel.score > -20);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — DIP_002: addDiplomacyEvent записывает события в память
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] DIP_002: addEvent записывает инцидент в историю отношений');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const relBefore = DE.getRelation('rome', 'carthage');
  const eventsBefore = (relBefore.events || []).length;

  DE.addEvent('rome', 'carthage', -10, 'incident');

  const eventsAfter = (relBefore.events || []).length;
  ok('Событие инцидента записано', eventsAfter > eventsBefore);
  const lastEvent = relBefore.events[eventsAfter - 1];
  ok('Тип события = incident', lastEvent.type === 'incident');
  ok('Delta события = -10', lastEvent.delta === -10);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — DIP_002: Инциденты не происходят у наций без общих регионов
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] DIP_002: Инциденты требуют соседства (общие регионы)');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Рим (r1,r2) и Галлия (r7,r8) — нет общих регионов
  // Устанавливаем враждебные отношения
  const rel = DE.getRelation('rome', 'gaul');
  rel.score = -50;

  const eventsBefore = (rel.events || []).length;
  // Запускаем много тиков — инциденты не должны срабатывать (нет общих регионов)
  for (let i = 0; i < 500; i++) {
    GS.turn = i + 1;
    DE.processGlobalTick();
  }
  const incidentEvents = (rel.events || []).filter(e => e.type === 'incident').length;
  ok('Инциденты не сработали без соседства', incidentEvents === 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — DIP_001 + DIP_002: Комбо — эмбарго не мешает инцидентам
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] DIP_001+DIP_002: Эмбарго и инциденты работают независимо');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Создаём эмбарго
  DE.createTreaty('rome', 'carthage', 'embargo', { embargo_target: 'carthage', duration: 10 });

  // Записываем инцидент напрямую
  DE.addEvent('rome', 'carthage', -15, 'incident');

  const treasuryBefore = GS.nations.carthage.economy.treasury;
  DE.applyEmbargo(DE.getAllTreaties('rome').find(t => t.type === 'embargo'), 1);
  const treasuryAfter = GS.nations.carthage.economy.treasury;

  const rel = DE.getRelation('rome', 'carthage');
  const hasIncident = (rel.events || []).some(e => e.type === 'incident');

  ok('Инцидент записан в историю', hasIncident);
  ok('Эмбарго уменьшило казну', treasuryAfter < treasuryBefore);
  ok('Оба механизма работают независимо', hasIncident && treasuryAfter < treasuryBefore);
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — DIP_001: Завершение эмбарго не крашит систему
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] DIP_001: Разрыв договора эмбарго не вызывает ошибок');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const treaty = DE.createTreaty('rome', 'carthage', 'embargo', {
    embargo_target: 'carthage',
    duration: 5,
  });

  noThrow('breakTreaty эмбарго не падает', () => {
    DE.breakTreaty(treaty.id, 'rome');
  });

  ok('После разрыва статус договора = broken', treaty.status === 'broken');
}

// ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
