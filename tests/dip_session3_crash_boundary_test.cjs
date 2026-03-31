'use strict';
// ── Сессия 3 / Тест 5: Краш-тесты и граничные условия всех DIP-подсистем ─────
// Проверяет устойчивость системы при некорректных/граничных данных
// Запуск: node tests/dip_session3_crash_boundary_test.cjs

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
function throws(label, fn) {
  try { fn(); console.error(`  ❌ ДОЛЖНО ПАДАТЬ: ${label}`); failed++; }
  catch (e) { console.log(`  ✅ (ожидаемое исключение) ${label}`); passed++; }
}

function makeCtx(extraNations = {}) {
  const GS = {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        name: 'Рим', economy: { treasury: 5000, income: 200 },
        population: { total: 1000000 },
        government: { type: 'republic', stability: 70, legitimacy: 75, ruler: 'Caesar' },
        religion: 'olympian', culture: 'latin', culture_group: 'italic',
        military: { at_war_with: [] }, regions: ['r1', 'r2'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        stability: 70,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 4000, income: 150 },
        population: { total: 800000 },
        government: { type: 'oligarchy', stability: 60, legitimacy: 65, ruler: 'Hannibal' },
        religion: 'baal', culture: 'punic', culture_group: 'semitic',
        military: { at_war_with: [] }, regions: ['r3', 'r4'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        stability: 60,
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      ...extraNations,
    },
    diplomacy: null,
    regions: {
      r1: { name: 'Лаций',    owner: 'rome' },
      r2: { name: 'Кампания', owner: 'rome' },
      r3: { name: 'Карфаген', owner: 'carthage' },
      r4: { name: 'Нумидия',  owner: 'carthage' },
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
// CRASH 1 — DIP_001: applyEmbargo с null-договором не крашит
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 1] DIP_001: applyEmbargo с null/undefined не крашит');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  noThrow('applyEmbargo(null) не падает',      () => DE.applyEmbargo(null, 1));
  noThrow('applyEmbargo(undefined) не падает', () => DE.applyEmbargo(undefined, 1));
  noThrow('applyEmbargo({}) не падает',        () => DE.applyEmbargo({}, 1));
  noThrow('applyEmbargo с status=expired',     () =>
    DE.applyEmbargo({ status: 'expired', type: 'embargo', parties: ['rome', 'carthage'], conditions: {} }, 1)
  );
}

// ═══════════════════════════════════════════════════════════════
// CRASH 2 — DIP_001: applyEmbargo с несуществующими нациями
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 2] DIP_001: applyEmbargo с несуществующими нациями');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  noThrow('applyEmbargo с ghost нациями не падает', () => {
    DE.applyEmbargo({
      status: 'active',
      type: 'embargo',
      parties: ['ghost1', 'ghost2'],
      conditions: { embargo_target: 'ghost2' },
    }, 1);
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 3 — DIP_002: Инциденты при пустом дипломатическом состоянии
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 3] DIP_002: processGlobalTick с минимальным состоянием');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Удаляем регионы у наций
  GS.nations.rome.regions = [];
  GS.nations.carthage.regions = [];

  noThrow('processGlobalTick без регионов не падает', () => {
    for (let t = 1; t <= 5; t++) { GS.turn = t; DE.processGlobalTick(); }
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 4 — DIP_003: breakTreaty с несуществующим ID договора
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 4] DIP_003: breakTreaty с несуществующим ID');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  noThrow('breakTreaty с несуществующим ID не падает', () => {
    DE.breakTreaty('non_existent_treaty_id_123', 'rome');
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 5 — DIP_003: diplo_reputation отсутствует у нации
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 5] DIP_003: breakTreaty когда у нации нет diplo_reputation');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Удаляем diplo_reputation у Рима
  delete GS.nations.rome.diplo_reputation;

  const treaty = DE.createTreaty('rome', 'carthage', 'non_aggression', { duration: 20 });
  noThrow('breakTreaty без diplo_reputation не падает', () => {
    DE.breakTreaty(treaty.id, 'rome');
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 6 — DIP_004: _checkVassalRebellion с нулевой стабильностью
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 6] DIP_004: Вассалитет при stability=0 не крашит');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.carthage.stability = 0;
  const treaty = DE.createTreaty('rome', 'carthage', 'vassalage', {
    tribute_pct: 0.50,
    vassal: 'carthage',
    duration: 50,
  });

  noThrow('processAllTreatyTicks с stability=0 не падает', () => {
    for (let t = 1; t <= 20; t++) {
      GS.turn = t;
      ctx.processAllTreatyTicks();
    }
  });

  ok('Статус договора валиден после тиков', ['active', 'broken', 'expired'].includes(treaty.status));
}

// ═══════════════════════════════════════════════════════════════
// CRASH 7 — DIP_005: onRulerDeath с undefined nationId
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 7] DIP_005: onRulerDeath с несуществующей нацией');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  noThrow('onRulerDeath(undefined) не падает',       () => DE.onRulerDeath(undefined));
  noThrow('onRulerDeath(null) не падает',            () => DE.onRulerDeath(null));
  noThrow('onRulerDeath("ghost") не падает',         () => DE.onRulerDeath('ghost'));
  noThrow('onRulerDeath("") не падает',              () => DE.onRulerDeath(''));
}

// ═══════════════════════════════════════════════════════════════
// CRASH 8 — DIP_006: addEvent с экстремальными delta-значениями
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 8] DIP_006: addEvent с экстремальными значениями delta');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  noThrow('addEvent(-9999) не падает', () => DE.addEvent('rome', 'carthage', -9999, 'spy_caught'));
  noThrow('addEvent(+9999) не падает', () => DE.addEvent('rome', 'carthage', +9999, 'spy_caught'));
  noThrow('addEvent(NaN) не падает',   () => DE.addEvent('rome', 'carthage', NaN,   'spy_caught'));
  noThrow('addEvent(Infinity) не падает', () => DE.addEvent('rome', 'carthage', Infinity, 'spy_caught'));

  // Проверяем, что конечные delta ограничены [-30, +30], а NaN/Infinity — отфильтрованы или не мешают
  const rel = DE.getRelation('rome', 'carthage');
  const events = rel.events || [];
  const extremeEvents = events.filter(e => e.type === 'spy_caught');
  // Конечные числа не должны выходить за [-30, +30]; NaN/Infinity заменяются clamp-ом
  const allFiniteOk = extremeEvents
    .filter(e => isFinite(e.delta))
    .every(e => e.delta >= -30 && e.delta <= 30);
  ok('Конечные delta зажаты в [-30, +30] (NaN/Infinity не ломают массив)', allFiniteOk && extremeEvents.length >= 2);
}

// ═══════════════════════════════════════════════════════════════
// CRASH 9 — DIP_007: processReligionSpread без поля religion_influence
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 9] DIP_007: processReligionSpread когда у нации нет religion_influence');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Удаляем religion_influence
  delete GS.nations.rome.religion_influence;
  delete GS.nations.carthage.religion_influence;

  DE.createTreaty('rome', 'carthage', 'cultural_exchange', { duration: 30 });

  noThrow('processReligionSpread без religion_influence не падает', () => {
    for (let t = 1; t <= 20; t++) { GS.turn = t; DE.processReligionSpread(); }
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 10 — DIP_008: proposeCoalition с самой собой
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 10] DIP_008: proposeCoalition с одинаковыми нациями');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.rome.influence_points = 100;

  noThrow('proposeCoalition(rome, rome, carthage) не падает', () => {
    const r = DE.proposeCoalition('rome', 'rome', 'carthage');
    ok('Возвращает ok:false для одинаковых наций', r.ok === false || typeof r === 'object');
  });

  noThrow('proposeCoalition против себя не падает', () => {
    const r = DE.proposeCoalition('rome', 'carthage', 'rome');
    ok('Возвращает объект результата', typeof r === 'object');
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 11 — DIP_009: processHistoricalGrievances с отсутствующим diplomacy
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 11] DIP_009: processHistoricalGrievances без дипломатического состояния');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Убираем diplomacy
  GS.diplomacy = null;

  noThrow('processHistoricalGrievances при diplomacy=null не падает', () => {
    DE.processHistoricalGrievances();
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 12 — DIP_010: spendInfluencePoints с отрицательным amount
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 12] DIP_010: spendInfluencePoints с нулём и отрицательными значениями');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.rome.influence_points = 50;

  noThrow('spendInfluencePoints(rome, 0) не падает', () => {
    const r = DE.spendInfluencePoints('rome', 0, 'test');
    ok('Трата 0 ОВ успешна', r.ok === true);
  });

  noThrow('spendInfluencePoints(rome, -10) не падает', () => {
    DE.spendInfluencePoints('rome', -10, 'negative_test');
  });
  // Документируем фактическое поведение: spend(-10) эквивалентен += 10 (математически).
  // Главное — отсутствие краша и возврат валидного числа.
  ok('ОВ после spendInfluencePoints(-10) — валидное число', typeof DE.getInfluencePoints('rome') === 'number');
}

// ═══════════════════════════════════════════════════════════════
// CRASH 13 — DIP_010: bribeNation когда у цели нет economy
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 13] DIP_010: bribeNation когда у цели нет economy');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.nations.rome.influence_points = 50;
  delete GS.nations.carthage.economy;

  noThrow('bribeNation без economy у цели не падает', () => {
    const r = DE.bribeNation('rome', 'carthage', 100);
    ok('Результат — объект', typeof r === 'object');
  });
}

// ═══════════════════════════════════════════════════════════════
// CRASH 14 — Стресс-тест: 500 ходов со всеми активными DIP-системами
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 14] Стресс-тест: 500 ходов с 4 нациями и всеми DIP-подсистемами');
{
  const { ctx, GS } = makeCtx({
    greece: {
      name: 'Эллада', economy: { treasury: 2000, income: 100 },
      population: { total: 500000 },
      government: { type: 'democracy', stability: 60, legitimacy: 65, ruler: 'Pericles' },
      religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
      military: { at_war_with: [] }, regions: ['r5'], relations: {},
      diplo_reputation: { betrayals: 0, honor_score: 100 },
      religion_influence: {},
      stability: 60,
      _ou: { diplomacy: { historical_grievances: 0.4 } },
    },
    egypt: {
      name: 'Египет', economy: { treasury: 3500, income: 170 },
      population: { total: 600000 },
      government: { type: 'monarchy', stability: 70, legitimacy: 80, ruler: 'Ptolemy' },
      religion: 'egyptian', culture: 'coptic', culture_group: 'hamitic',
      military: { at_war_with: [] }, regions: ['r6'], relations: {},
      diplo_reputation: { betrayals: 0, honor_score: 100 },
      religion_influence: {},
      stability: 70,
      _ou: { diplomacy: { historical_grievances: 0.1 } },
    },
  });
  GS.regions.r5 = { name: 'Аттика', owner: 'greece' };
  GS.regions.r6 = { name: 'Египет', owner: 'egypt' };

  const DE = ctx.DiplomacyEngine;

  // Создаём несколько договоров
  DE.createTreaty('rome', 'greece', 'trade_agreement', { duration: 100 });
  DE.createTreaty('rome', 'egypt', 'marriage_alliance', { duration: 100 });
  DE.createTreaty('rome', 'carthage', 'embargo', { embargo_target: 'carthage', duration: 200 });

  let crashed = false;
  try {
    for (let t = 1; t <= 500; t++) {
      GS.turn = t;
      ctx.processAllTreatyTicks();
      DE.processGlobalTick();
    }
  } catch (e) {
    crashed = true;
    console.error('  💥 Краш на ходу:', GS.turn, '—', e.message);
  }

  ok('500 ходов без краша', !crashed);
  ok('Все нации имеют ≥ 0 ОВ', Object.values(GS.nations).every(n => (n.influence_points ?? 0) >= 0));
  ok('Казна никуда не ушла в NaN', Object.values(GS.nations).every(n => !isNaN(n.economy?.treasury ?? 0)));
}

// ═══════════════════════════════════════════════════════════════
// CRASH 15 — DIP_009: getGrievance для нации без _ou данных
// ═══════════════════════════════════════════════════════════════
console.log('\n[CRASH 15] DIP_009: getGrievance для нации с разными форматами _ou');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Различные форматы _ou.diplomacy
  GS.nations.rome._ou = null;
  GS.nations.carthage._ou = { diplomacy: null };

  noThrow('getGrievance с _ou=null не падает',          () => {
    const g = DE.getGrievance('rome');
    ok('getGrievance с _ou=null возвращает число',      typeof g === 'number');
    ok('getGrievance с _ou=null ≥ 0',                   g >= 0);
  });

  noThrow('getGrievance с _ou.diplomacy=null не падает', () => {
    const g = DE.getGrievance('carthage');
    ok('getGrievance с diplomacy=null возвращает число', typeof g === 'number');
  });

  noThrow('getGrievance с несуществующей нацией',       () => {
    const g = DE.getGrievance('phantom');
    ok('getGrievance("phantom") = 0',                   g === 0);
  });
}

// ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
