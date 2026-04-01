'use strict';
// ══════════════════════════════════════════════════════════════════════
// ТЕСТЫ: интеграционные цепочки + краш-тесты движка Victory/Achievements
// Запуск: node tests/victory_chain_crash_test.cjs
// ══════════════════════════════════════════════════════════════════════

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ FAIL: ${label}`); failed++; errors.push(label); }
}

function loadBoth(gsOverrides = {}) {
  const GS = {
    turn: 1, player_nation: 'syracuse',
    nations: {
      syracuse: {
        name: 'Сиракузы',
        economy: { treasury: 8000, income_per_turn: 1500, stockpile: { wheat: 25000 } },
        population: { total: 500000, happiness: 62, by_profession: { slaves: 0 } },
        government: { type: 'tyranny', stability: 58, legitimacy: 72, ruler: { name: 'Агафокл', age: 45 }, ruler_changed: false },
        military: { infantry: 5000, cavalry: 1000, ships: 50, mercenaries: 0, at_war_with: [] },
        regions: ['r55', 'r102', 'r245'],
        buildings: ['port', 'market'], relations: {}, characters: [],
        capital_region: 'r55', _ruler_start_turn: 0,
      },
      carthage: {
        name: 'Карфаген', economy: { treasury: 50000, income_per_turn: 3000 },
        population: { total: 800000, happiness: 60 },
        government: { type: 'oligarchy', stability: 70, legitimacy: 80, ruler: { name: 'Совет Ста', age: 0 } },
        military: { infantry: 40000, cavalry: 10000, ships: 150, at_war_with: [] },
        regions: ['c1', 'c2', 'c3'], relations: {}, characters: [],
      },
    },
    diplomacy: { treaties: [], relations: {} },
    loans: [],
    regions: { r55: { owner: 'syracuse', name: 'Сиракузы' } },
    achievements: {}, player_vows: [],
    active_crisis: null, chronicle_log: [],
    date: { year: -301, month: 1 }, events_log: [], testament: null,
    ...gsOverrides,
  };

  const declareWarFn = (a, b) => {
    if (GS.nations[a]) GS.nations[a].military.at_war_with.push(b);
    if (GS.nations[b]) GS.nations[b].military.at_war_with.push(a);
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => GS.events_log.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: declareWarFn,
    window: { ChronicleSystem: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {}, document: undefined,
    MAP_REGIONS: { r55: { name: 'Сиракузы' } },
  });

  const achSrc = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const vicSrc = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(achSrc, ctx);
  vm.runInContext(vicSrc, ctx);

  return { ctx, GS };
}

// ══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 1: Правление → накопление достижений → итог → легаси
// ══════════════════════════════════════════════════════════════════════
console.log('\n🔗 ЦЕПОЧКА 1: Правление → достижения → итог правления');
{
  const { ctx, GS } = loadBoth({ turn: 100 });
  const n = GS.nations.syracuse;
  n.economy.treasury = 120000;
  n.population.happiness = 88;
  n._battles_won = 12;
  n.regions = Array.from({length: 22}, (_, i) => `r${i}`);

  // 1. Проверить достижения
  ctx.checkAchievements('syracuse');
  const ach = ctx.getAchievements('syracuse');
  ok('Достижения накоплены', ach.length > 0);
  ok('centurion разблокирован', ach.some(a => a.id === 'centurion'));
  ok('treasurer разблокирован', ach.some(a => a.id === 'treasurer'));
  ok('hegemon разблокирован', ach.some(a => a.id === 'hegemon'));

  // 2. Смена правителя → итог
  n.government.ruler_changed = true;
  n._ruler_start_turn = 0;
  let legacyCalled = false;
  ctx.showLegacyModal = () => { legacyCalled = true; };
  ctx.checkVictoryConditions();
  ok('Итог правления вызван', legacyCalled);
  ok('_ruler_start_turn сброшен', n._ruler_start_turn === 100);
}

// ══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 2: Клятва → война → нарушение → легитимность
// ══════════════════════════════════════════════════════════════════════
console.log('\n🔗 ЦЕПОЧКА 2: Клятва «не нападать» → война → штраф');
{
  const { ctx, GS } = loadBoth({ turn: 20 });
  
  // Дать клятву no_first_strike
  ctx.takeVow('no_first_strike');
  ok('Клятва no_first_strike принята', GS.player_vows.some(v => v.id === 'no_first_strike'));
  
  const legitBefore = GS.nations.syracuse.government.legitimacy;
  
  // Нарушение: объявляем войну
  GS.nations.syracuse._wars_declared_this_turn = 1;
  ctx.checkAchievements('syracuse');
  
  const vow = GS.player_vows.find(v => v.id === 'no_first_strike');
  ok('Клятва нарушена', vow?.broken === true);
  ok('Легитимность снизилась', GS.nations.syracuse.government.legitimacy < legitBefore);
  ok('Событие нарушения в логе', GS.events_log.some(e => e.msg.includes('Клятва нарушена')));
}

// ══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 3: Кризис → выживание → achievement survivor
// ══════════════════════════════════════════════════════════════════════
console.log('\n🔗 ЦЕПОЧКА 3: Кризис → выживание → достижение survivor');
{
  const { ctx, GS } = loadBoth({ turn: 600 });
  
  // Форсируем кризис голода
  GS.active_crisis = { type: 'FAMINE', start_turn: 600, resolved: false, success: null };
  GS.nations.syracuse.population.happiness = 60; // > 20 → выживем
  GS.nations.syracuse._crisis_famine_ticks = 0;
  
  // Переходим на ход 610
  GS.turn = 610;
  ctx.checkVictoryConditions();
  
  ok('Кризис успешно завершён', GS.active_crisis?.resolved === true && GS.active_crisis?.success === true);
  
  // Проверяем достижение
  ctx.checkAchievements('syracuse');
  const ach = ctx.getAchievements('syracuse');
  ok('survivor разблокирован после кризиса', ach.some(a => a.id === 'survivor'));
}

// ══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 4: Завещание → смерть правителя → проверка выполнения
// ══════════════════════════════════════════════════════════════════════
console.log('\n🔗 ЦЕПОЧКА 4: Завещание → условия выполнены → legacy_keeper');
{
  const { ctx, GS } = loadBoth({ turn: 80 });
  const n = GS.nations.syracuse;
  
  // Установить завещание
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('end_wars');
  
  // Выполнить условия
  n.economy.treasury = 25000; // ✅ > 20k
  n.military.at_war_with = []; // ✅ нет войн
  
  // Смерть правителя
  n.government.ruler_changed = true;
  n._ruler_start_turn = 0;
  
  let legacyData = null;
  ctx.showLegacyModal = (text, data) => { legacyData = data; };
  ctx.checkVictoryConditions();
  
  ok('Legacy modal вызван', legacyData !== null);
  ok('Данные завещания переданы в modal', legacyData?.testament !== null);
  ok('Оба условия выполнены', legacyData?.testament?.fulfilled === 2);
  ok('_testament_completed = true', n._testament_completed === true);
}

// ══════════════════════════════════════════════════════════════════════
// ЦЕПОЧКА 5: Манифест → проверка хронистом каждые 25 ходов
// ══════════════════════════════════════════════════════════════════════
console.log('\n🔗 ЦЕПОЧКА 5: Манифест → хронист через 25 ходов');
{
  const { ctx, GS } = loadBoth({ turn: 25 });
  GS.player_manifest = { text: 'Стать богатейшим', chosen_turn: 1 };
  
  const logsBefore = GS.events_log.length;
  ctx.checkAchievements('syracuse');
  ok('Хронист добавил запись на ходу 25',
    GS.events_log.length > logsBefore &&
    GS.events_log.some(e => e.msg.includes('Хронист') || e.msg.includes('Летописец') || e.msg.includes('летопис')));
}

// ══════════════════════════════════════════════════════════════════════
// КРАШ-ТЕСТ 1: Все функции при полностью пустом GAME_STATE
// ══════════════════════════════════════════════════════════════════════
console.log('\n💥 КРАШ-ТЕСТ 1: Пустой GAME_STATE');
{
  const ctx = vm.createContext({
    GAME_STATE: {},
    addEventLog: () => {},
    addMemoryEvent: () => {},
    declareWar: () => {},
    window: null,
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {}, document: undefined, MAP_REGIONS: {},
  });

  const achSrc = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const vicSrc = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(achSrc, ctx);
  vm.runInContext(vicSrc, ctx);

  let crashed = false;
  try {
    ctx.checkAchievements('any');
    ctx.calcGrandeur('any');
    ctx.getAchievements('any');
    ctx.getAchievementCount('any');
    ctx.generateDynamicGoals('any');
    ctx.checkVowViolations('any');
    ctx.checkVictoryConditions();
    ctx.processCrisisVeha();
    ctx.generateRulerLegacy('any', 'ruler_death');
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('Все функции работают при пустом GAME_STATE', !crashed);
}

// ══════════════════════════════════════════════════════════════════════
// КРАШ-ТЕСТ 2: Минимальная нация (только name)
// ══════════════════════════════════════════════════════════════════════
console.log('\n💥 КРАШ-ТЕСТ 2: Минимальная нация');
{
  const { ctx, GS } = loadBoth();
  GS.nations.minimal = { name: 'Минимальная' };
  GS.player_nation = 'minimal';
  
  let crashed = false;
  try {
    ctx.checkAchievements('minimal');
    const g = ctx.calcGrandeur('minimal');
    ok('calcGrandeur для минимальной нации >= 0', g >= 0);
    ctx.generateDynamicGoals('minimal');
    ctx.getHistoricalRating('minimal');
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('Минимальная нация обрабатывается без краша', !crashed);
}

// ══════════════════════════════════════════════════════════════════════
// КРАШ-ТЕСТ 3: Чрезмерные значения (overflow)
// ══════════════════════════════════════════════════════════════════════
console.log('\n💥 КРАШ-ТЕСТ 3: Чрезмерные значения');
{
  const { ctx, GS } = loadBoth();
  const n = GS.nations.syracuse;
  n.economy.treasury = Number.MAX_SAFE_INTEGER;
  n.economy.income_per_turn = Number.MAX_SAFE_INTEGER;
  n.military.infantry = Number.MAX_SAFE_INTEGER;
  n.military.cavalry  = Number.MAX_SAFE_INTEGER;
  n.population.total  = Number.MAX_SAFE_INTEGER;
  n.population.happiness = 200; // сверх максимума
  n.government.stability = -50; // отрицательная
  n.government.legitimacy = 200; // сверх максимума
  n.regions = Array.from({length: 10000}, (_, i) => `r${i}`);
  
  let crashed = false;
  let grandeur = -1;
  try {
    ctx.checkAchievements('syracuse');
    grandeur = ctx.calcGrandeur('syracuse');
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('Чрезмерные значения не вызывают краш', !crashed);
  ok('grandeur остаётся <= 1000 при max значениях', grandeur <= 1000);
}

// ══════════════════════════════════════════════════════════════════════
// КРАШ-ТЕСТ 4: NaN и Infinity
// ══════════════════════════════════════════════════════════════════════
console.log('\n💥 КРАШ-ТЕСТ 4: NaN и Infinity');
{
  const { ctx, GS } = loadBoth();
  const n = GS.nations.syracuse;
  n.economy.treasury = NaN;
  n.economy.income_per_turn = Infinity;
  n.military.infantry = NaN;
  n.population.happiness = NaN;
  
  let crashed = false;
  try {
    ctx.checkAchievements('syracuse');
    ctx.calcGrandeur('syracuse');
  } catch (e) {
    crashed = true;
    console.error('  Crash:', e.message);
  }
  ok('NaN/Infinity не вызывают краш', !crashed);
}

// ══════════════════════════════════════════════════════════════════════
// КРАШ-ТЕСТ 5: Множественный вызов checkAchievements подряд
// ══════════════════════════════════════════════════════════════════════
console.log('\n💥 КРАШ-ТЕСТ 5: Идемпотентность checkAchievements');
{
  const { ctx, GS } = loadBoth({ turn: 100 });
  GS.nations.syracuse.economy.treasury = 150000;
  
  // Вызвать 10 раз
  for (let i = 0; i < 10; i++) {
    ctx.checkAchievements('syracuse');
  }
  
  const count = ctx.getAchievementCount('syracuse');
  ok('Достижение не задваивается при повторных вызовах', count === Object.keys(GS.achievements?.syracuse ?? {}).length);
  // Достижение treasurer должно быть только 1 раз
  const entries = Object.entries(GS.achievements?.syracuse ?? {}).filter(([k]) => k === 'treasurer');
  ok('treasurer встречается ровно 1 раз', entries.length === 1);
}

// ══════════════════════════════════════════════════════════════════════
// ИТОГИ
// ══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
if (errors.length > 0) {
  console.log('Провалено:');
  errors.forEach(e => console.log(`  - ${e}`));
}
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
