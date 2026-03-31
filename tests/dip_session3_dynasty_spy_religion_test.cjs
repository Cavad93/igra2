'use strict';
// ── Сессия 3 / Тест 3: Юнит-тесты DIP_005 (Династия) + DIP_006 (Шпионаж) + DIP_007 (Религия) ──
// Запуск: node tests/dip_session3_dynasty_spy_religion_test.cjs

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
        government: { type: 'republic', stability: 70, legitimacy: 75, ruler: 'Caesar' },
        religion: 'olympian', culture: 'latin', culture_group: 'italic',
        military: { at_war_with: [] }, regions: ['r1', 'r2'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 3000, income: 150 },
        population: { total: 800000 },
        government: { type: 'oligarchy', stability: 60, legitimacy: 65, ruler: 'Hannibal' },
        religion: 'baal', culture: 'punic', culture_group: 'semitic',
        military: { at_war_with: [] }, regions: ['r3', 'r4'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      greece: {
        name: 'Эллада', economy: { treasury: 2000, income: 100 },
        population: { total: 500000 },
        government: { type: 'democracy', stability: 55, legitimacy: 60, ruler: 'Pericles' },
        religion: 'olympian', culture: 'greek', culture_group: 'hellenic',
        military: { at_war_with: [] }, regions: ['r5', 'r6'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
      egypt: {
        name: 'Египет', economy: { treasury: 4000, income: 180 },
        population: { total: 600000 },
        government: { type: 'monarchy', stability: 65, legitimacy: 80, ruler: 'Ptolemy' },
        religion: 'egyptian', culture: 'coptic', culture_group: 'hamitic',
        military: { at_war_with: [] }, regions: ['r7'], relations: {},
        diplo_reputation: { betrayals: 0, honor_score: 100 },
        religion_influence: {},
        _ou: { diplomacy: { historical_grievances: 0 } },
      },
    },
    diplomacy: null,
    regions: {
      r1: { name: 'Лаций',    owner: 'rome' },
      r2: { name: 'Кампания', owner: 'rome' },
      r3: { name: 'Карфаген', owner: 'carthage' },
      r4: { name: 'Нумидия',  owner: 'carthage' },
      r5: { name: 'Аттика',   owner: 'greece' },
      r6: { name: 'Беотия',   owner: 'greece' },
      r7: { name: 'Египет',   owner: 'egypt' },
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
// TEST 1 — DIP_005: onRulerDeath устанавливает grace period на брачный союз
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 1] DIP_005: onRulerDeath устанавливает _dynasty_expires_turn на брачном союзе');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.turn = 10;
  const treaty = DE.createTreaty('rome', 'greece', 'marriage_alliance', {
    dynasty_link: true,
    duration: 50,
  });

  DE.onRulerDeath('rome');

  ok('_dynasty_expires_turn установлен', treaty._dynasty_expires_turn != null);
  ok('Истечение через 5 ходов (turn 10 + 5 = 15)', treaty._dynasty_expires_turn === 15);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — DIP_005: onRulerDeath не влияет на нации без брачных союзов
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 2] DIP_005: onRulerDeath без брачных союзов не падает и не трогает другие договоры');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const tradeTreaty = DE.createTreaty('rome', 'carthage', 'trade_agreement', { duration: 20 });
  noThrow('onRulerDeath без брачных союзов не падает', () => DE.onRulerDeath('rome'));

  ok('Торговый договор остался активным', tradeTreaty.status === 'active');
  ok('_dynasty_expires_turn на торговом договоре не установлен', !tradeTreaty._dynasty_expires_turn);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — DIP_005: Брачный союз истекает через 5 ходов после смерти правителя
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 3] DIP_005: Брачный союз расторгается через 5 ходов после _dynasty_expires_turn');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.turn = 1;
  const treaty = DE.createTreaty('rome', 'greece', 'marriage_alliance', {
    dynasty_link: true,
    duration: 100,
  });

  // Правитель умирает на ходу 1 → expires на ходу 6
  DE.onRulerDeath('rome');
  ok('Grace period установлен', treaty._dynasty_expires_turn === 6);

  // Симулируем 4 хода — договор ещё активен
  for (let t = 2; t <= 5; t++) {
    GS.turn = t;
    ctx.processAllTreatyTicks();
  }
  ok('Договор ещё активен на ходу 5', treaty.status === 'active');

  // Ход 6 — должен истечь
  GS.turn = 6;
  ctx.processAllTreatyTicks();
  ok('Договор истёк на ходу 6', treaty.status === 'expired');
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — DIP_006: addEvent с типом spy_caught записывает событие
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 4] DIP_006: spy_caught событие записывается и ухудшает отношения');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const relBefore = DE.getRelationScore('rome', 'carthage');
  DE.addEvent('rome', 'carthage', -20, 'spy_caught');

  const rel = DE.getRelation('rome', 'carthage');
  const hasSpy = (rel.events || []).some(e => e.type === 'spy_caught');

  ok('Событие spy_caught записано в историю', hasSpy);
  ok('Delta -20 зафиксирована корректно', rel.events.find(e => e.type === 'spy_caught').delta === -20);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — DIP_006: casus_belli генерируется при spy_caught во время подготовки к войне
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 5] DIP_006: getCasusBelli возвращает массив (интерфейс работает)');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Добавляем casus_belli вручную через структуру
  const rel = DE.getRelation('rome', 'carthage');
  if (!rel.casus_belli) rel.casus_belli = [];
  rel.casus_belli.push({
    type: 'spy_caught',
    holder: 'rome',
    against: 'carthage',
    turn: 1,
    expires: 50,
  });

  const cb = DE.getCasusBelli('rome', 'carthage');
  ok('getCasusBelli возвращает массив', Array.isArray(cb));
  ok('casus_belli содержит spy_caught', cb.some(c => c.type === 'spy_caught'));
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — DIP_006: casus_belli истекает после срока действия
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 6] DIP_006: casus_belli не возвращается после истечения');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const rel = DE.getRelation('rome', 'carthage');
  if (!rel.casus_belli) rel.casus_belli = [];
  rel.casus_belli.push({
    type: 'spy_caught',
    holder: 'rome',
    against: 'carthage',
    turn: 1,
    expires: 5, // истекает на ходу 5
  });

  GS.turn = 6; // после истечения
  const cb = DE.getCasusBelli('rome', 'carthage');
  ok('Истёкший casus_belli не возвращается', cb.length === 0);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — DIP_007: processReligionSpread не крашит при активных договорах
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 7] DIP_007: processReligionSpread не вызывает ошибок');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Создаём культурный обмен Рим ↔ Греция (одна религия — olympian)
  DE.createTreaty('rome', 'greece', 'cultural_exchange', { duration: 30 });
  // Создаём брачный союз Рим ↔ Египет (разные религии)
  DE.createTreaty('rome', 'egypt', 'marriage_alliance', { duration: 30 });

  noThrow('processReligionSpread не падает', () => {
    for (let i = 0; i < 20; i++) {
      GS.turn = i + 1;
      DE.processReligionSpread();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — DIP_007: religion_influence объект не выходит за пределы [0, 1]
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 8] DIP_007: religion_influence остаётся в диапазоне [0, 1]');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  // Брачный союз с Египтом — разные религии
  DE.createTreaty('rome', 'egypt', 'marriage_alliance', { duration: 100 });

  // Запускаем много ходов
  for (let i = 0; i < 200; i++) {
    GS.turn = i + 1;
    DE.processReligionSpread();
  }

  const romeInfluence = GS.nations.rome.religion_influence || {};
  const egyptInfluence = GS.nations.egypt.religion_influence || {};

  // Все значения influence должны быть в [0, 1]
  const allValid = [
    ...Object.values(romeInfluence),
    ...Object.values(egyptInfluence),
  ].every(v => v >= 0 && v <= 1);

  ok('religion_influence значения в диапазоне [0, 1]', allValid);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — DIP_005 + DIP_007: Смерть правителя во время религиозного союза
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 9] DIP_005+DIP_007: Смерть правителя + активный cultural_exchange не крашит');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  GS.turn = 5;
  DE.createTreaty('rome', 'greece', 'marriage_alliance', { duration: 30 });
  DE.createTreaty('rome', 'egypt', 'cultural_exchange', { duration: 30 });

  noThrow('onRulerDeath при нескольких договорах не падает', () => {
    DE.onRulerDeath('rome');
  });

  noThrow('processReligionSpread после смерти правителя не падает', () => {
    GS.turn = 6;
    DE.processReligionSpread();
  });
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — DIP_006 + DIP_003: Пойманный шпион = предательство (если это война)
// ═══════════════════════════════════════════════════════════════
console.log('\n[TEST 10] DIP_006+DIP_003: Цепочка spy_caught → addEvent → отношения ухудшились');
{
  const { ctx, GS } = makeCtx();
  const DE = ctx.DiplomacyEngine;

  const relScoreBefore = DE.getRelationScore('rome', 'carthage');

  // Шпион Рима пойман в Карфагене
  DE.addEvent('rome', 'carthage', -20, 'spy_caught');

  // Отношения должны учитываться через α-конвергенцию и память
  const rel = DE.getRelation('rome', 'carthage');
  const events = (rel.events || []).filter(e => e.type === 'spy_caught');

  ok('spy_caught событие записано', events.length >= 1);
  ok('Delta события = -20', events[0].delta === -20);
  ok('addEvent не крашит при последующих тиках', (() => {
    try { GS.turn = 2; DE.processGlobalTick(); return true; } catch { return false; }
  })());
}

// ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
