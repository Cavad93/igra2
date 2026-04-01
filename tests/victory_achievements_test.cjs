'use strict';
// ══════════════════════════════════════════════════════════════════════
// ТЕСТЫ: система достижений, индекс величия, клятвы, итог правления
// Запуск: node tests/victory_achievements_test.cjs
// ══════════════════════════════════════════════════════════════════════

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function ok(label, cond) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
    errors.push(label);
  }
}

function makeCtx(overrides = {}) {
  const GS = {
    turn: 10,
    player_nation: 'syracuse',
    nations: {
      syracuse: {
        name: 'Сиракузы',
        economy: { treasury: 5000, income_per_turn: 1000, stockpile: { wheat: 10000 } },
        population: { total: 500000, happiness: 62, by_profession: { slaves: 0 } },
        government: { type: 'tyranny', stability: 58, legitimacy: 72, ruler: { name: 'Агафокл', age: 55 } },
        military: { infantry: 2361, cavalry: 343, ships: 48, mercenaries: 0, at_war_with: [] },
        regions: ['r55', 'r102', 'r245'],
        buildings: ['port', 'market', 'temple'],
        relations: {},
        characters: [],
        memory: { events: [], archive: [], dialogues: {} },
      },
      carthage: {
        name: 'Карфаген',
        economy: { treasury: 50000, income_per_turn: 5000, stockpile: { wheat: 50000 } },
        population: { total: 1000000, happiness: 60, by_profession: {} },
        government: { type: 'oligarchy', stability: 70, legitimacy: 75 },
        military: { infantry: 40000, cavalry: 10000, ships: 150, mercenaries: 0, at_war_with: [] },
        regions: ['r1', 'r2', 'r3'],
        relations: {},
        characters: [],
      },
    },
    diplomacy: { treaties: [], relations: {} },
    loans: [],
    regions: { r55: { owner: 'syracuse', name: 'Сиракузы' } },
    achievements: {},
    player_vows: [],
    date: { year: -301, month: 1 },
    events_log: [],
    ...overrides,
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => GS.events_log.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    window: { ChronicleSystem: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {},
    document: undefined,
    MAP_REGIONS: { r55: { name: 'Сиракузы' } },
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  vm.runInContext(src, ctx);

  return { ctx, GS };
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 1: Инициализация achievements
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 1: Инициализация хранилища достижений');
{
  const { ctx, GS } = makeCtx();
  ctx.checkAchievements('syracuse');
  ok('GAME_STATE.achievements создан', GS.achievements !== undefined);
  ok('achievements[syracuse] создан', GS.achievements['syracuse'] !== undefined);
  ok('getAchievementCount возвращает число', typeof ctx.getAchievementCount('syracuse') === 'number');
  ok('getAchievements возвращает массив', Array.isArray(ctx.getAchievements('syracuse')));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 2: Разблокировка достижения «Ветеран» при turn >= 100
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 2: Разблокировка достижений по условию (ветеран)');
{
  const { ctx, GS } = makeCtx({ turn: 100 });
  ctx.checkAchievements('syracuse');
  const achievs = ctx.getAchievements('syracuse');
  ok('centurion разблокирован при turn=100', achievs.some(a => a.id === 'centurion'));
  ok('long_reign НЕ разблокирован при turn=100', !achievs.some(a => a.id === 'long_reign'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 3: Достижение «Казначей» при казне >= 100 000
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 3: Достижение «Казначей» (treasury >= 100000)');
{
  const { ctx, GS } = makeCtx();
  GS.nations.syracuse.economy.treasury = 100000;
  ctx.checkAchievements('syracuse');
  const achievs = ctx.getAchievements('syracuse');
  ok('treasurer разблокирован при treasury=100000', achievs.some(a => a.id === 'treasurer'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 4: Достижение «Народный» при happiness >= 85
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 4: Достижение «Народный» (happiness >= 85)');
{
  const { ctx, GS } = makeCtx();
  GS.nations.syracuse.population.happiness = 85;
  ctx.checkAchievements('syracuse');
  const achievs = ctx.getAchievements('syracuse');
  ok('populist разблокирован при happiness=85', achievs.some(a => a.id === 'populist'));
  ok('beloved НЕ разблокирован при happiness=85', !achievs.some(a => a.id === 'beloved'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 5: Достижение «Легенда» (10+ достижений)
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 5: Достижение «Легенда» (10 достижений)');
{
  const { ctx, GS } = makeCtx({ turn: 200 });
  const n = GS.nations.syracuse;
  n.economy.treasury = 500001;
  n.population.happiness = 96;
  n.regions = Array.from({length: 25}, (_, i) => `r${i}`);
  n.population.total = 1100000;
  n.military.ships = 210;
  n._battles_won = 25;
  n._wars_declared = 6;
  n.government.stability = 92;
  n.government.legitimacy = 91;
  n.economy.income_per_turn = 60000;
  ctx.checkAchievements('syracuse');
  const count = ctx.getAchievementCount('syracuse');
  ok('Разблокировано 10+ достижений при мощной нации', count >= 10);
  const achievs = ctx.getAchievements('syracuse');
  ok('legend разблокирован при 10+ достижениях', achievs.some(a => a.id === 'legend'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 6: calcGrandeur — корректный диапазон 0–1000
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 6: calcGrandeur (диапазон 0–1000)');
{
  const { ctx, GS } = makeCtx();
  const g = ctx.calcGrandeur('syracuse');
  ok('calcGrandeur возвращает число', typeof g === 'number');
  ok('calcGrandeur >= 0', g >= 0);
  ok('calcGrandeur <= 1000', g <= 1000);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 7: calcGrandeur — мощная нация имеет высокий индекс
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 7: calcGrandeur — слабая vs мощная нация');
{
  const { ctx, GS } = makeCtx();
  const weakG = ctx.calcGrandeur('syracuse');
  GS.nations.syracuse.economy.treasury = 200000;
  GS.nations.syracuse.economy.income_per_turn = 50000;
  GS.nations.syracuse.military.infantry = 30000;
  GS.nations.syracuse.regions = Array.from({length: 25}, (_, i) => `r${i}`);
  GS.nations.syracuse.population.happiness = 90;
  GS.nations.syracuse.government.stability = 85;
  const strongG = ctx.calcGrandeur('syracuse');
  ok('Мощная нация имеет grandeur > слабой', strongG > weakG);
  ok('Grandeur мощной нации > 300', strongG > 300);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 8: Система клятв — принятие и проверка
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 8: Система клятв');
{
  const { ctx, GS } = makeCtx();
  ctx.takeVow('no_loans');
  ok('Клятва no_loans добавлена', GS.player_vows.some(v => v.id === 'no_loans'));
  ok('Клятва изначально не нарушена', !GS.player_vows.find(v => v.id === 'no_loans').broken);
  
  // Нарушение: нанимаем наёмников при клятве no_mercs
  ctx.takeVow('no_mercs');
  GS.nations.syracuse.military.mercenaries = 100;
  ctx.checkVowViolations('syracuse');
  const mercVow = GS.player_vows.find(v => v.id === 'no_mercs');
  ok('Клятва no_mercs нарушена при наёмниках', mercVow?.broken === true);
  ok('Легитимность снизилась при нарушении', GS.nations.syracuse.government.legitimacy < 72);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 9: Динамические цели — генерация по контексту
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 9: Динамические цели');
{
  const { ctx, GS } = makeCtx();
  GS.nations.syracuse.economy.treasury = 10000; // казна растёт
  const goals = ctx.generateDynamicGoals('syracuse');
  ok('generateDynamicGoals возвращает массив', Array.isArray(goals));
  ok('Не более 3 целей', goals.length <= 3);
  ok('Каждая цель имеет text', goals.every(g => typeof g.text === 'string'));
  ok('Каждая цель имеет progress функцию', goals.every(g => typeof g.progress === 'function'));
  ok('progress() возвращает 0–1', goals.every(g => {
    const p = g.progress();
    return typeof p === 'number' && p >= 0 && p <= 1;
  }));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 10: Счётчик ходов без союзников (_turns_without_ally)
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 10: Счётчик одиночки (_turns_without_ally)');
{
  const { ctx, GS } = makeCtx({ turn: 5 });
  // Нет союзников — счётчик растёт
  ctx.checkAchievements('syracuse');
  ok('_turns_without_ally > 0 без союзников', (GS.nations.syracuse._turns_without_ally ?? 0) > 0);
  
  // Добавить союз — счётчик сбросится
  GS.diplomacy.treaties.push({
    id: 'T1', type: 'alliance', status: 'active',
    parties: ['syracuse', 'carthage']
  });
  ctx.checkAchievements('syracuse');
  ok('_turns_without_ally = 0 с союзником', GS.nations.syracuse._turns_without_ally === 0);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 11: getHistoricalRating — корректные строки
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 11: getHistoricalRating');
{
  const { ctx, GS } = makeCtx();
  const rating = ctx.getHistoricalRating('syracuse');
  ok('getHistoricalRating возвращает массив', Array.isArray(rating));
  ok('Массив не пустой', rating.length > 0);
  ok('Каждая строка содержит текст', rating.every(s => typeof s === 'string' && s.length > 0));
  
  // Богатая нация
  GS.nations.syracuse.economy.treasury = 90000;
  const richRating = ctx.getHistoricalRating('syracuse');
  ok('Богатая нация получает высокую оценку казны',
    richRating.some(s => s.includes('Птолемеев')));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 12: Счётчик скромности (_turns_frugal)
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 12: Счётчик скромности (frugal)');
{
  const { ctx, GS } = makeCtx();
  GS.nations.syracuse.economy.treasury = 500; // < 1000
  GS.loans = []; // нет займов
  ctx.checkAchievements('syracuse');
  ok('_turns_frugal > 0 при казне < 1000 без займов',
    (GS.nations.syracuse._turns_frugal ?? 0) > 0);
  
  // Добавить заём — счётчик сбросится
  GS.loans = [{ nation_id: 'syracuse', status: 'active', remaining: 1000, monthly_payment: 50 }];
  ctx.checkAchievements('syracuse');
  ok('_turns_frugal = 0 при активном займе',
    GS.nations.syracuse._turns_frugal === 0);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 13: Дипломатическое достижение (3 союза)
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 13: Достижение «Дипломат» (3 союза)');
{
  const { ctx, GS } = makeCtx();
  GS.diplomacy.treaties = [
    { id: 'T1', type: 'alliance', status: 'active', parties: ['syracuse', 'rome'] },
    { id: 'T2', type: 'defensive_alliance', status: 'active', parties: ['syracuse', 'carthage'] },
    { id: 'T3', type: 'military_alliance', status: 'active', parties: ['syracuse', 'macedon'] },
  ];
  ctx.checkAchievements('syracuse');
  const achievs = ctx.getAchievements('syracuse');
  ok('diplomat разблокирован при 3 союзах', achievs.some(a => a.id === 'diplomat'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 14: Достижение «Первая кровь» (_battles_won >= 1)
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 14: Достижение «Первая кровь»');
{
  const { ctx, GS } = makeCtx();
  GS.nations.syracuse._battles_won = 1;
  ctx.checkAchievements('syracuse');
  const achievs = ctx.getAchievements('syracuse');
  ok('first_blood разблокирован при _battles_won=1', achievs.some(a => a.id === 'first_blood'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 15: Краш-тест: checkAchievements с null nationId
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 15: Краш-тест (null nationId)');
{
  const { ctx } = makeCtx();
  let crashed = false;
  try {
    ctx.checkAchievements(null);
    ctx.checkAchievements(undefined);
    ctx.checkAchievements('');
    ctx.checkAchievements('nonexistent_nation');
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('checkAchievements не падает при null/undefined/несуществующей нации', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 16: Краш-тест: calcGrandeur с несуществующей нацией
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 16: Краш-тест calcGrandeur');
{
  const { ctx } = makeCtx();
  let crashed = false;
  let result = -1;
  try {
    result = ctx.calcGrandeur(null);
    ctx.calcGrandeur('nonexistent');
  } catch (e) {
    crashed = true;
  }
  ok('calcGrandeur не падает с null', !crashed);
  ok('calcGrandeur возвращает 0 для null', result === 0);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 17: Краш-тест: generateDynamicGoals с пустой нацией
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 17: Краш-тест generateDynamicGoals');
{
  const { ctx, GS } = makeCtx();
  GS.nations.empty = { name: 'Пустая' };
  GS.nations.stub  = null;
  let crashed = false;
  try {
    ctx.generateDynamicGoals('empty');
    ctx.generateDynamicGoals('nonexistent');
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('generateDynamicGoals не падает при пустой нации', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 18: Краш-тест: checkVowViolations с пустым состоянием
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 18: Краш-тест checkVowViolations');
{
  const { ctx, GS } = makeCtx();
  GS.player_vows = undefined; // нет клятв
  let crashed = false;
  try {
    ctx.checkVowViolations('syracuse');
    ctx.checkVowViolations(null);
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('checkVowViolations не падает при undefined vows', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 19: Граничные значения grandeur
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 19: Граничные значения grandeur');
{
  const { ctx, GS } = makeCtx();
  // Нация с максимальными показателями
  const n = GS.nations.syracuse;
  n.regions = Array.from({length: 50}, (_, i) => `r${i}`); // 500 territory (capped 200)
  n.economy.treasury = 1000000; // 1000 wealth (capped 150)
  n.military.infantry = 100000; n.military.cavalry = 20000; // 700+60000/100 -> capped 100
  n.population.happiness = 100; // 100
  n.economy.income_per_turn = 200000; // 666 -> capped 150
  n.government.stability = 100; // 100
  GS.diplomacy.treaties = Array.from({length: 10}, (_, i) => ({
    id: `T${i}`, type: 'alliance', status: 'active', parties: ['syracuse', `nation${i}`]
  })); // 200 -> capped 100
  // 10 достижений → legacy = 100
  GS.achievements.syracuse = {};
  for (let i = 0; i < 10; i++) GS.achievements.syracuse[`ach${i}`] = { turn: 1 };
  
  const g = ctx.calcGrandeur('syracuse');
  ok('Максимальная нация имеет grandeur <= 1000', g <= 1000);
  ok('Максимальная нация имеет grandeur >= 700', g >= 700);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 20: Цепочка: война → _last_war_turn → миротворец не разблокируется
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 20: Цепочка война → Миротворец');
{
  const { ctx, GS } = makeCtx({ turn: 50 });
  const n = GS.nations.syracuse;
  n._last_war_turn = 40; // последняя война 10 ходов назад (< 30 не выполнено)
  ctx.checkAchievements('syracuse');
  const achievs = ctx.getAchievements('syracuse');
  ok('peacemaker НЕ разблокирован если война была 10 ходов назад',
    !achievs.some(a => a.id === 'peacemaker'));
  
  // Сброс — давно не было войн
  n._last_war_turn = 0;
  const { ctx: ctx2, GS: GS2 } = makeCtx({ turn: 50 });
  GS2.nations.syracuse._last_war_turn = 0;
  ctx2.checkAchievements('syracuse');
  const achievs2 = ctx2.getAchievements('syracuse');
  ok('peacemaker разблокирован через 30+ ходов без войн',
    achievs2.some(a => a.id === 'peacemaker'));
}

// ──────────────────────────────────────────────────────────────────────
// ИТОГИ
// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
if (errors.length > 0) {
  console.log('Провалено:');
  errors.forEach(e => console.log(`  - ${e}`));
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
