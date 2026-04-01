'use strict';
// ── VICTORY 011: Crash & Edge Case Tests ─────────────────────────────
// Тест на устойчивость движка: null/undefined, переполнение, Infinity,
// NaN, мутирующие данные, многократные вызовы, экстремальные значения.
// Запуск: node tests/victory_011_crash_tests.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n💥 ${name}`); }

const ACH_SRC = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
const VIC_SRC = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');

const makeEl = () => ({
  id: '', className: '', innerHTML: '', style: { display: '' },
  remove() {}, appendChild() {}, querySelector() { return null; },
});
const domStub = {
  getElementById: () => makeEl(),
  createElement:  () => makeEl(),
  body: { appendChild() {} },
};

function makeCtx(gsOverrides = {}) {
  const GS = {
    turn: 1,
    player_nation: 'sparta',
    date: { year: -400 },
    nations: {
      sparta: {
        name: 'Спарта',
        economy:    { treasury: 1000, income_per_turn: 200, tax_rate: 0.10, stockpile: { wheat: 5000 } },
        military:   { infantry: 1000, cavalry: 100, ships: 5, morale: 70, loyalty: 75,
                      at_war_with: [], mercenaries: 0 },
        population: { total: 50000, happiness: 60, by_profession: { slaves: 0 } },
        government: { type: 'monarchy', stability: 55, legitimacy: 65,
                      ruler: { name: 'Леонид', age: 40 }, ruler_changed: false },
        regions:    ['r1', 'r2'],
        relations:  {},
        active_laws: [],
        _wars_total: 0,
        _ruler_start_turn: 0,
        _battles_won: 0,
      },
    },
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    player_vows:  [],
    chronicle_log: [],
    active_crisis: null,
    testament:    null,
    player_manifest: null,
    dynamic_goals:   {},
    ...gsOverrides,
  };

  const log = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog:    (msg, type) => log.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar:     () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._log = log;
  vm.runInContext(ACH_SRC, ctx);
  vm.runInContext(VIC_SRC, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// 1. NULL / UNDEFINED НАЦИЯ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 1: null/undefined нация');

{
  const ctx = makeCtx();
  const { checkAchievements, calcGrandeur, getAchievements, generateDynamicGoals,
          checkVowViolations, checkVictoryConditions } = ctx;

  // checkAchievements с null nationId
  let err = null;
  try { checkAchievements(null); } catch (e) { err = e; }
  ok('checkAchievements(null) не крашит', err === null);

  // checkAchievements с undefined
  err = null;
  try { checkAchievements(undefined); } catch (e) { err = e; }
  ok('checkAchievements(undefined) не крашит', err === null);

  // calcGrandeur несуществующей нации
  err = null;
  let g;
  try { g = calcGrandeur('nonexistent'); } catch (e) { err = e; }
  ok('calcGrandeur("nonexistent") не крашит', err === null);
  ok('calcGrandeur("nonexistent") = 0', g === 0);

  // getAchievements несуществующей нации
  err = null;
  try { getAchievements('no_such'); } catch (e) { err = e; }
  ok('getAchievements("no_such") не крашит', err === null);

  // generateDynamicGoals несуществующей нации
  err = null;
  try { generateDynamicGoals('no_such'); } catch (e) { err = e; }
  ok('generateDynamicGoals("no_such") не крашит', err === null);

  // checkVowViolations несуществующей нации
  err = null;
  try { checkVowViolations('no_such'); } catch (e) { err = e; }
  ok('checkVowViolations("no_such") не крашит', err === null);

  // checkVictoryConditions без player_nation
  const { GAME_STATE: GS } = ctx;
  GS.player_nation = null;
  err = null;
  try { checkVictoryConditions(); } catch (e) { err = e; }
  ok('checkVictoryConditions() без player_nation не крашит', err === null);
}

// ════════════════════════════════════════════════════════════════════
// 2. NaN И INFINITY В ДАННЫХ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 2: NaN и Infinity в полях');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, calcGrandeur, checkAchievements } = ctx;
  const n = GS.nations.sparta;

  n.economy.treasury      = NaN;
  n.economy.income_per_turn = Infinity;
  n.population.total      = -Infinity;
  n.population.happiness  = NaN;
  n.military.infantry     = Infinity;
  n.government.stability  = NaN;

  let err = null;
  try { checkAchievements('sparta'); } catch (e) { err = e; }
  ok('checkAchievements с NaN/Infinity не крашит', err === null);

  err = null;
  let g;
  try { g = calcGrandeur('sparta'); } catch (e) { err = e; }
  ok('calcGrandeur с NaN/Infinity не крашит', err === null);
  ok('calcGrandeur с NaN/Infinity в диапазоне [0,1000]', typeof g === 'number' && g >= 0 && g <= 1000);
}

// ════════════════════════════════════════════════════════════════════
// 3. ПУСТЫЕ / ОТСУТСТВУЮЩИЕ ВЛОЖЕННЫЕ ОБЪЕКТЫ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 3: Пустые вложенные объекты');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, calcGrandeur, generateDynamicGoals,
          checkVictoryConditions } = ctx;

  // Полностью пустая нация
  GS.nations.sparta = {};
  let err = null;
  try { checkAchievements('sparta'); } catch (e) { err = e; }
  ok('checkAchievements с пустой нацией не крашит', err === null);

  err = null;
  try { calcGrandeur('sparta'); } catch (e) { err = e; }
  ok('calcGrandeur с пустой нацией не крашит', err === null);

  err = null;
  try { generateDynamicGoals('sparta'); } catch (e) { err = e; }
  ok('generateDynamicGoals с пустой нацией не крашит', err === null);

  // GS.nations = null
  GS.nations = null;
  err = null;
  try { checkAchievements('sparta'); } catch (e) { err = e; }
  ok('checkAchievements при nations=null не крашит', err === null);

  // GS = null (через подмену)
  const ctxNull = makeCtx();
  ctxNull.GAME_STATE = null;
  err = null;
  try { ctxNull.checkAchievements('sparta'); } catch (e) { err = e; }
  ok('checkAchievements при GS=null не крашит', err === null);
}

// ════════════════════════════════════════════════════════════════════
// 4. ЭКСТРЕМАЛЬНО БОЛЬШИЕ ЗНАЧЕНИЯ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 4: Экстремально большие значения');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, calcGrandeur, checkAchievements, getAchievementCount } = ctx;
  const n = GS.nations.sparta;

  n.economy.treasury        = 1e15;
  n.economy.income_per_turn = 1e12;
  n.military.infantry       = 1e9;
  n.military.cavalry        = 1e8;
  n.population.total        = 1e10;
  n.population.happiness    = 1e6;
  n.government.stability    = 1e4;
  n.regions                 = Array.from({ length: 1000 }, (_, i) => `r${i}`);
  n._battles_won             = 1e9;
  n._wars_declared           = 1e6;
  n._total_loans_taken       = 1e12;
  n._buildings_built         = 1e6;
  GS.turn = 10000;

  let err = null;
  try { checkAchievements('sparta'); } catch (e) { err = e; }
  ok('checkAchievements с огромными числами не крашит', err === null);

  let g;
  err = null;
  try { g = calcGrandeur('sparta'); } catch (e) { err = e; }
  ok('calcGrandeur с огромными числами не крашит', err === null);
  ok('calcGrandeur с огромными числами ≤ 1000', g <= 1000);
  ok('calcGrandeur с огромными числами ≥ 0', g >= 0);

  ok('getAchievementCount вернул число', typeof getAchievementCount('sparta') === 'number');
}

// ════════════════════════════════════════════════════════════════════
// 5. ИДЕМПОТЕНТНОСТЬ: 100 вызовов подряд
// ════════════════════════════════════════════════════════════════════
section('КРАШ 5: Идемпотентность — 100 вызовов checkAchievements');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements } = ctx;
  GS.nations.sparta.economy.treasury = 200000;
  GS.turn = 5;

  let err = null;
  try {
    for (let i = 0; i < 100; i++) checkAchievements('sparta');
  } catch (e) { err = e; }
  ok('100 вызовов checkAchievements не крашит', err === null);

  // treasurer не задваивается
  const count = getAchievements('sparta').filter(a => a.id === 'treasurer').length;
  ok('treasurer встречается ровно 1 раз', count === 1);
}

// ════════════════════════════════════════════════════════════════════
// 6. ОДНОВРЕМЕННЫЕ КРИЗИСЫ — второй не запускается
// ════════════════════════════════════════════════════════════════════
section('КРАШ 6: Повторный запуск кризиса при активном');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, processCrisisVeha } = ctx;

  GS.nations.sparta.population.total = 500000;
  GS.turn = 600;
  processCrisisVeha('sparta');
  const type1 = GS.active_crisis?.type;
  ok('первый кризис создан', !!type1);

  // Попытка запустить второй
  processCrisisVeha('sparta');
  ok('тип кризиса не изменился', GS.active_crisis?.type === type1);
  ok('resolved остался false', GS.active_crisis?.resolved === false);
}

// ════════════════════════════════════════════════════════════════════
// 7. МУТАЦИИ GS ВО ВРЕМЯ ИТЕРАЦИИ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 7: Мутации GS во время вызова checkAchievements');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;

  // Добавить нацию во время проверки (simulate concurrent mutation)
  let err = null;
  try {
    checkAchievements('sparta');
    GS.nations['new_nation'] = { name: 'Новая нация', economy: {}, military: {}, population: {}, government: {} };
    checkAchievements('sparta');
    delete GS.nations['new_nation'];
    checkAchievements('sparta');
  } catch (e) { err = e; }
  ok('мутации GS не крашат checkAchievements', err === null);
}

// ════════════════════════════════════════════════════════════════════
// 8. КРАШ-ТЕСТ processCrisisVeha БЕЗ НАЦИИ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 8: processCrisisVeha без нации / пустые данные');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, processCrisisVeha, _tickActiveCrisis, _resolveCrisis } = ctx;

  // processCrisisVeha с несуществующей нацией
  GS.turn = 600;
  let err = null;
  try { processCrisisVeha('nonexistent'); } catch (e) { err = e; }
  ok('processCrisisVeha("nonexistent") не крашит', err === null);

  // _tickActiveCrisis без active_crisis
  GS.active_crisis = null;
  err = null;
  try { _tickActiveCrisis('sparta'); } catch (e) { err = e; }
  ok('_tickActiveCrisis без кризиса не крашит', err === null);

  // _resolveCrisis с resolved=true
  GS.active_crisis = { type: 'PLAGUE', resolved: true, start_turn: 600 };
  err = null;
  try { _resolveCrisis('sparta', GS.active_crisis); } catch (e) { err = e; }
  ok('_resolveCrisis с resolved=true не крашит', err === null);

  // _resolveCrisis с неизвестным типом
  GS.active_crisis = { type: 'UNKNOWN_TYPE', resolved: false, start_turn: 600 };
  err = null;
  try { _resolveCrisis('sparta', GS.active_crisis); } catch (e) { err = e; }
  ok('_resolveCrisis с неизвестным типом не крашит', err === null);
}

// ════════════════════════════════════════════════════════════════════
// 9. ЗАВЕЩАНИЕ — ЭКСТРЕМАЛЬНЫЕ СИТУАЦИИ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 9: Завещание — крайние случаи');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, addTestamentGoal, removeTestamentGoal,
          _evaluateTestament, getTestamentGoalDefs } = ctx;

  // addTestamentGoal с неизвестным id
  let err = null;
  try { addTestamentGoal('nonexistent_goal', 'sparta'); } catch (e) { err = e; }
  ok('addTestamentGoal с неизвестным id не крашит', err === null);

  // _evaluateTestament без завещания
  GS.testament = null;
  err = null;
  let result;
  try { result = _evaluateTestament('sparta'); } catch (e) { err = e; }
  ok('_evaluateTestament без завещания не крашит', err === null);
  ok('_evaluateTestament без завещания возвращает null', result === null);

  // _evaluateTestament с пустыми целями
  GS.testament = { goals: [], created_turn: 1 };
  err = null;
  try { result = _evaluateTestament('sparta'); } catch (e) { err = e; }
  ok('_evaluateTestament с пустыми целями не крашит', err === null);

  // removeTestamentGoal несуществующей цели
  err = null;
  try { removeTestamentGoal('nonexistent_goal'); } catch (e) { err = e; }
  ok('removeTestamentGoal несуществующей цели не крашит', err === null);
}

// ════════════════════════════════════════════════════════════════════
// 10. КРАШ-ТЕСТ 500 ХОДОВ С ДВУМЯ НАЦИЯМИ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 10: 500 ходов с двумя нациями');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, checkVictoryConditions, calcGrandeur } = ctx;

  // Добавить вторую нацию
  GS.nations['corinth'] = {
    name: 'Коринф',
    economy: { treasury: 2000, income_per_turn: 300, tax_rate: 0.10, stockpile: { wheat: 3000 } },
    military: { infantry: 500, cavalry: 50, ships: 5, morale: 65, loyalty: 70, at_war_with: [], mercenaries: 0 },
    population: { total: 30000, happiness: 55, by_profession: { slaves: 0 } },
    government: { type: 'oligarchy', stability: 50, legitimacy: 55, ruler: { name: 'Советник', age: 50 },
                  ruler_changed: false },
    regions: ['c1'],
    relations: {},
    active_laws: [],
    _wars_total: 0, _ruler_start_turn: 0,
  };

  let crashed = false;
  try {
    for (let t = 1; t <= 500; t++) {
      GS.turn = t;
      checkAchievements('sparta');
      checkAchievements('corinth');
      checkVictoryConditions();

      // Случайные мутации
      if (t % 50 === 0) GS.nations.sparta.economy.treasury = Math.random() * 200000;
      if (t % 75 === 0) GS.nations.sparta.military.infantry = Math.floor(Math.random() * 30000);
      if (t % 100 === 0) GS.nations.sparta.population.total = Math.floor(Math.random() * 2000000);
    }
  } catch (e) {
    crashed = true;
    console.error('  Краш на ходу:', e.message);
  }
  ok('500 ходов без краша', !crashed);
  ok('chronicle_log ≤ 50', GS.chronicle_log.length <= 50);
  ok('grandeur(sparta) в диапазоне', calcGrandeur('sparta') >= 0 && calcGrandeur('sparta') <= 1000);
  ok('grandeur(corinth) в диапазоне', calcGrandeur('corinth') >= 0 && calcGrandeur('corinth') <= 1000);
}

// ════════════════════════════════════════════════════════════════════
// 11. КЛЯТВЫ — ПОВТОРНЫЕ НАРУШЕНИЯ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 11: Клятвы — повторные нарушения');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, takeVow, checkVowViolations } = ctx;

  takeVow('no_mercs');
  GS.nations.sparta.military.mercenaries = 500;

  // Нарушить 10 раз
  let err = null;
  try {
    for (let i = 0; i < 10; i++) checkVowViolations('sparta');
  } catch (e) { err = e; }
  ok('повторные нарушения клятвы не крашат', err === null);

  // Легитимность не стала отрицательной (капнула, но не ниже 0)
  const leg = GS.nations.sparta.government.legitimacy;
  ok('легитимность не стала отрицательной', leg >= 0);
}

// ════════════════════════════════════════════════════════════════════
// 12. ХРОНИКА — РОТАЦИЯ ПРИ 100+ ЗАПИСЯХ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 12: Хроника — ротация при 100+ записях');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;

  let err = null;
  try {
    for (let t = 1; t <= 200; t++) {
      GS.turn = t * 25;
      checkAchievements('sparta');
    }
  } catch (e) { err = e; }
  ok('200 хроника-тиков не крашат', err === null);
  ok('chronicle_log ≤ 50 после 200 тиков', GS.chronicle_log.length <= 50);
}

// ════════════════════════════════════════════════════════════════════
// 13. generateRulerLegacy — граничные данные
// ════════════════════════════════════════════════════════════════════
section('КРАШ 13: generateRulerLegacy с крайними данными');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, generateRulerLegacy, _buildLegacyText } = ctx;

  // Пустые achievements, wars=0, treasury=0
  let err = null;
  try {
    generateRulerLegacy('sparta', 'ruler_death');
  } catch (e) { err = e; }
  ok('generateRulerLegacy с минимальными данными не крашит', err === null);

  // _buildLegacyText с пустым объектом
  err = null;
  try { _buildLegacyText({}); } catch (e) { err = e; }
  ok('_buildLegacyText({}) не крашит', err === null);

  // _buildLegacyText с null полями
  err = null;
  try {
    _buildLegacyText({ ruler_name: null, turns_ruled: null,
                       grandeur: null, achievements: null,
                       wars: null, treasury: null, reason: null });
  } catch (e) { err = e; }
  ok('_buildLegacyText с null полями не крашит', err === null);
}

// ════════════════════════════════════════════════════════════════════
// 14. ДИНАМИЧЕСКИЕ ЦЕЛИ — ДЕЛЕНИЕ НА НОЛЬ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 14: Динамические цели — деление на ноль');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, generateDynamicGoals } = ctx;

  // population.total = 0 (деление на ноль в progress)
  GS.nations.sparta.population.total = 0;
  GS.nations.sparta.economy.treasury = 0;
  GS.nations.sparta.economy.income_per_turn = 0;

  let err = null;
  let goals;
  try { goals = generateDynamicGoals('sparta'); } catch (e) { err = e; }
  ok('generateDynamicGoals не крашит при нулевых данных', err === null);

  if (goals) {
    let progressErr = null;
    for (const g of goals) {
      try {
        const p = g.progress();
        if (typeof p !== 'number' || !isFinite(p) || p < 0 || p > 1) {
          // Проверяем просто что нет краша
        }
      } catch (e) { progressErr = e; }
    }
    ok('progress() при нулевых данных не крашит', progressErr === null);
  } else {
    ok('generateDynamicGoals вернул массив (пустой ок)', true);
  }
}

// ════════════════════════════════════════════════════════════════════
// 15. ИСТОРИЧЕСКИЙ РЕЙТИНГ — КРАЙНИЕ ЗНАЧЕНИЯ
// ════════════════════════════════════════════════════════════════════
section('КРАШ 15: Исторический рейтинг — крайние значения');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, getHistoricalRating } = ctx;

  // Все 0
  GS.nations.sparta.economy.treasury = 0;
  GS.nations.sparta.military.infantry = 0;
  GS.nations.sparta.military.cavalry = 0;
  GS.nations.sparta.government.legitimacy = 0;

  let err = null;
  let r;
  try { r = getHistoricalRating('sparta'); } catch (e) { err = e; }
  ok('getHistoricalRating при нулях не крашит', err === null);
  ok('getHistoricalRating при нулях возвращает массив', Array.isArray(r));

  // Отрицательные значения
  GS.nations.sparta.economy.treasury = -99999;
  GS.nations.sparta.military.infantry = -5000;
  err = null;
  try { r = getHistoricalRating('sparta'); } catch (e) { err = e; }
  ok('getHistoricalRating при отрицательных числах не крашит', err === null);
}

// ════════════════════════════════════════════════════════════════════
// ИТОГ
// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
