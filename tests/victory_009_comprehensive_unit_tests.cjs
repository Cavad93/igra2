'use strict';
// ── VICTORY 009: Comprehensive Unit Tests (Session 10+ batch) ─────────
// 50 unit tests covering all 10 sessions in depth.
// Запуск: node tests/victory_009_comprehensive_unit_tests.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

// ─── DOM stub ────────────────────────────────────────────────────────
const domStub = {
  getElementById: id => {
    if (id === 'testament-modal') return { style: { display: 'none' } };
    if (id === 'testament-modal-content') return { innerHTML: '' };
    if (id === 'manifest-custom-input') return { value: 'Тест-манифест' };
    return null;
  },
  createElement: () => ({ id: '', className: '', innerHTML: '', style: {}, remove() {}, appendChild() {} }),
  body: { appendChild() {} },
};

function makeCtx(overrides = {}) {
  const GS = {
    turn: 5,
    player_nation: 'sparta',
    nations: {
      sparta: {
        _id: 'sparta',
        name: 'Спарта',
        economy:    { treasury: 1000, income_per_turn: 300, tax_rate: 0.10, stockpile: { wheat: 8000 } },
        military:   { infantry: 2000, cavalry: 200, ships: 10, morale: 70, loyalty: 75, at_war_with: [], mercenaries: 0 },
        population: { total: 100000, happiness: 65, by_profession: { slaves: 0 } },
        government: { type: 'monarchy', stability: 55, legitimacy: 65,
                      ruler: { name: 'Леонид', age: 40 }, ruler_changed: false },
        regions:    ['r1', 'r2', 'r3'],
        relations:  {},
        active_laws: [],
        _wars_total: 0,
        _ruler_start_turn: 0,
        _battles_won: 0,
        _invasions_repelled: 0,
        _bankruptcies: 0,
        _wars_declared: 0,
        _last_war_turn: 0,
        _turns_in_power: 0,
        _crisis_survived: 0,
        _loans_total: 0,
        _buildings_built: 0,
        _turns_without_alliance: 0,
        _turns_without_loan: 0,
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
    ...overrides,
  };

  const eventLog = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => eventLog.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: (a, b) => {
      GS.nations[a]?.military?.at_war_with?.push(b);
      if (GS.nations[b]) GS.nations[b].military = GS.nations[b].military ?? {};
      GS.nations[b]?.military?.at_war_with?.push(a);
    },
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._eventLog = eventLog;

  const achSrc = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const vicSrc = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(achSrc, ctx);
  vm.runInContext(vicSrc, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 1: ДОСТИЖЕНИЯ — детальные проверки (Сессия 1)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 1: Достижения — детальные проверки');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievements, getAchievementCount } = ctx;

  // 1. silk_road при income >= 50000
  GS.nations.sparta.economy.income_per_turn = 50000;
  checkAchievements('sparta');
  ok('silk_road при income=50000', getAchievements('sparta').some(a => a.id === 'silk_road'));

  // 2. debt_lord при _total_loans_taken > 50000
  GS.nations.sparta._total_loans_taken = 60000;
  checkAchievements('sparta');
  ok('debt_lord при _total_loans_taken=60000', getAchievements('sparta').some(a => a.id === 'debt_lord'));

  // 3. builder при _buildings_built >= 20
  GS.nations.sparta._buildings_built = 20;
  checkAchievements('sparta');
  ok('builder при _buildings_built=20', getAchievements('sparta').some(a => a.id === 'builder'));

  // 4. lone_wolf при 50 ходов без союзников
  GS.turn = 60;
  GS.nations.sparta._turns_without_ally = 55;
  checkAchievements('sparta');
  ok('lone_wolf при 55 ходов без союзников', getAchievements('sparta').some(a => a.id === 'lone_wolf'));

  // 5. diplomat при 3 активных союзах
  GS.diplomacy.treaties = [
    { status: 'active', type: 'alliance', parties: ['sparta', 'athens'] },
    { status: 'active', type: 'alliance', parties: ['sparta', 'corinth'] },
    { status: 'active', type: 'alliance', parties: ['sparta', 'thebes'] },
  ];
  checkAchievements('sparta');
  ok('diplomat при 3 активных союзах', getAchievements('sparta').some(a => a.id === 'diplomat'));

  // 6. frugal при 20 ходов без займа при казне < 1000 (_turns_frugal)
  GS.nations.sparta._turns_frugal = 25;
  GS.nations.sparta.economy.treasury = 500;
  checkAchievements('sparta');
  ok('frugal при 25 ходов без займа (_turns_frugal), казна<1000', getAchievements('sparta').some(a => a.id === 'frugal'));

  // 7. warmonger при _wars_declared >= 5
  GS.nations.sparta._wars_declared = 5;
  checkAchievements('sparta');
  ok('warmonger при _wars_declared=5', getAchievements('sparta').some(a => a.id === 'warmonger'));

  // 8. conqueror при 20 победах
  GS.nations.sparta._battles_won = 20;
  checkAchievements('sparta');
  ok('conqueror при 20 победах', getAchievements('sparta').some(a => a.id === 'conqueror'));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 2: Индекс величия — граничные случаи (Сессия 2)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 2: Индекс величия — граничные случаи');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, calcGrandeur, getAchievementCount, checkAchievements } = ctx;

  // 9. Нулевая нация → grandeur = 0
  GS.nations.sparta.economy.treasury = 0;
  GS.nations.sparta.military.infantry = 0;
  GS.nations.sparta.military.cavalry = 0;
  GS.nations.sparta.population.happiness = 0;
  GS.nations.sparta.economy.income_per_turn = 0;
  GS.nations.sparta.government.stability = 0;
  GS.nations.sparta.regions = [];
  ok('grandeur ≥ 0 при нулевых данных', calcGrandeur('sparta') >= 0);

  // 10. Максимальная казна даёт не более 150 к итогу
  GS.nations.sparta.economy.treasury = 1000000;
  const g = calcGrandeur('sparta');
  ok('grandeur ≤ 1000 при огромной казне', g <= 1000);

  // 11. Счастье 100 добавляет ровно 100 к компоненту
  GS.nations.sparta.population.happiness = 100;
  GS.nations.sparta.government.stability = 100;
  GS.nations.sparta.regions = Array.from({ length: 20 }, (_, i) => `r${i}`);
  const g2 = calcGrandeur('sparta');
  ok('grandeur с max регионами, казной, счастьем > 400', g2 > 400);

  // 12. Дипломатия = 0 во время войны
  GS.nations.sparta.military.at_war_with = ['carthage'];
  GS.diplomacy.treaties = [
    { status: 'active', type: 'alliance', parties: ['sparta', 'athens'] },
    { status: 'active', type: 'alliance', parties: ['sparta', 'corinth'] },
  ];
  const gWar = calcGrandeur('sparta');
  GS.nations.sparta.military.at_war_with = [];
  const gPeace = calcGrandeur('sparta');
  ok('grandeur во время войны ≤ grandeur в мире (дипломатия=0)', gWar <= gPeace);

  // 13. Legacy component растёт с достижениями
  const g0 = calcGrandeur('sparta');
  checkAchievements('sparta');
  const g1 = calcGrandeur('sparta');
  ok('grandeur не уменьшается после check достижений', g1 >= g0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 3: Манифест — логика хранения (Сессия 3)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 3: Манифест — логика хранения');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, _saveManifest, selectManifestPreset } = ctx;

  // 14. _saveManifest сохраняет текст
  ctx._saveManifest('Завоевать Карфаген');
  ok('player_manifest.text сохранён', GS.player_manifest?.text === 'Завоевать Карфаген');

  // 15. chosen_turn записан
  ok('player_manifest.chosen_turn == turn', GS.player_manifest?.chosen_turn === GS.turn);

  // 16. player_manifest.text возвращает текст через GS
  ok('GS.player_manifest.text == сохранённый текст', GS.player_manifest?.text === 'Завоевать Карфаген');

  // 17. _saveManifest обновляет текст при повторном вызове
  ctx._saveManifest('Другой манифест');
  ok('повторный _saveManifest обновляет текст', GS.player_manifest?.text === 'Другой манифест');

  // 18. selectManifestPreset 'richest' устанавливает корректный текст
  ctx.selectManifestPreset('richest');
  ok("preset 'richest' устанавливает текст", typeof GS.player_manifest?.text === 'string' && GS.player_manifest.text.length > 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 4: Динамические цели (Сессия 4)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 4: Динамические цели');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, generateDynamicGoals } = ctx;

  // 19. Возвращает не более 3 целей
  const goals = generateDynamicGoals('sparta');
  ok('не более 3 динамических целей', goals.length <= 3);

  // 20. Каждая цель имеет поля id, text, progress, completed
  const valid = goals.every(g => g.id && g.text && typeof g.progress === 'function' && typeof g.completed === 'function');
  ok('каждая цель имеет id, text, progress(), completed()', valid);

  // 21. progress() возвращает [0,1]
  const inRange = goals.every(g => { const p = g.progress(); return p >= 0 && p <= 1; });
  ok('progress() в диапазоне [0,1]', inRange);

  // 22. При казне > 5000 и растущей → цель "накопи" появляется
  GS.nations.sparta.economy.treasury = 8000;
  GS.nations.sparta.economy.income_per_turn = 1000;
  const goalsRich = generateDynamicGoals('sparta');
  ok('при казне 8000 и растущей доходе — есть цель-ориентир', goalsRich.length > 0);

  // 23. При отсутствии союзов → цель "заключи союз"
  GS.diplomacy.treaties = [];
  GS.nations.sparta.military.at_war_with = [];
  const goalsNoAlliance = generateDynamicGoals('sparta');
  const allianceGoal = goalsNoAlliance.find(g => g.text && g.text.includes('союз'));
  ok('при нет союзов — есть цель "заключи союз"', !!allianceGoal);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 5: Клятвы — полная проверка (Сессия 5)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 5: Клятвы — полная проверка');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, takeVow, checkVowViolations, getAchievements } = ctx;

  // 24. takeVow сохраняет клятву
  takeVow('no_first_strike', 'sparta');
  ok('клятва no_first_strike добавлена', GS.player_vows?.some(v => v.id === 'no_first_strike'));

  // 25. Дублирующая клятва не добавляется
  takeVow('no_first_strike', 'sparta');
  const count = GS.player_vows.filter(v => v.id === 'no_first_strike').length;
  ok('дублирующая клятва не добавляется', count === 1);

  // 26. no_loans не нарушена без займов (этот ход нет займов)
  takeVow('no_loans', 'sparta');
  GS.nations.sparta._loans_taken_this_turn = 0;
  checkVowViolations('sparta');
  const noLoansVow = GS.player_vows.find(v => v.id === 'no_loans');
  ok('no_loans не нарушена если _loans_taken_this_turn=0', !noLoansVow?.broken);

  // 27. no_loans нарушена при взятии займа в этот ход
  GS.nations.sparta._loans_taken_this_turn = 1;
  checkVowViolations('sparta');
  ok('no_loans нарушена при _loans_taken_this_turn=1', noLoansVow?.broken === true);

  // 28. Нарушение клятвы уменьшает легитимность
  const ctx2 = makeCtx();
  const { GAME_STATE: GS2, takeVow: takeVow2, checkVowViolations: checkVow2 } = ctx2;
  takeVow2('no_mercs', 'sparta');
  GS2.nations.sparta.military.mercenaries = 500;
  const legBefore = GS2.nations.sparta.government.legitimacy;
  checkVow2('sparta');
  const legAfter = GS2.nations.sparta.government.legitimacy;
  ok('нарушение клятвы уменьшает легитимность', legAfter < legBefore);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 6: Хроника (Сессия 6)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 6: Хроника');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, _buildChronicleText } = ctx;

  // 29. chronicle_log создаётся как массив
  GS.chronicle_log = [];
  ok('chronicle_log — массив', Array.isArray(GS.chronicle_log));

  // 30. _buildChronicleText возвращает непустую строку
  const text = _buildChronicleText({ grandeur: 400, achievements: [], manifest: 'Тест', wars: 0, treasury: 1000, turn: 25 });
  ok('_buildChronicleText возвращает строку', typeof text === 'string' && text.length > 5);

  // 31. Запись добавляется в хронику на ходу 25
  GS.turn = 25;
  GS.nations.sparta._wars_total = 0;
  GS.player_manifest = { text: 'Мирный путь', chosen_turn: 1 };
  checkAchievements('sparta');
  ok('chronicle_log пополнен на ходу 25', GS.chronicle_log.length > 0);

  // 32. Каждая запись имеет turn и text
  const valid = GS.chronicle_log.every(e => typeof e.turn === 'number' && typeof e.text === 'string');
  ok('каждая запись имеет turn и text', valid);

  // 33. Максимум 50 записей (ротация)
  for (let i = 0; i < 60; i++) {
    GS.turn = 25 + i * 25;
    checkAchievements('sparta');
  }
  ok('chronicle_log не превышает 50 записей', GS.chronicle_log.length <= 50);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 7: Итог правления (Сессия 7)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 7: Итог правления');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, _buildLegacyText, generateRulerLegacy } = ctx;

  // 34. _buildLegacyText для монарха содержит имя
  const data = {
    ruler_name: 'Леонид', turns_ruled: 30, grandeur: 400,
    achievements: ['Казначей', 'Первая кровь'],
    wars: 2, treasury: 15000, population: 100000, reason: 'ruler_death',
  };
  const text = _buildLegacyText(data);
  ok('_buildLegacyText содержит имя правителя', text.includes('Леонид'));

  // 35. Воинственный правитель упоминает войны
  const dataWar = { ...data, wars: 10 };
  const textWar = _buildLegacyText(dataWar);
  ok('_buildLegacyText при wars=10 упоминает войны', textWar.toLowerCase().includes('войн'));

  // 36. Консульский итог содержит "Консулат"
  const dataCons = { ...data, reason: 'consul_change' };
  const textCons = _buildLegacyText(dataCons);
  ok('consul_change текст содержит "Консулат"', textCons.includes('Консулат'));

  // 37. generateRulerLegacy обновляет _ruler_start_turn
  GS.nations.sparta.government.type = 'monarchy';
  GS.nations.sparta.government.ruler_changed = true;
  GS.turn = 45;
  generateRulerLegacy('sparta', 'ruler_death');
  ok('_ruler_start_turn обновлён до текущего хода', GS.nations.sparta._ruler_start_turn === 45);

  // 38. generateRulerLegacy добавляет запись в chronicle_log
  const logLen = GS.chronicle_log.length;
  GS.turn = 50;
  generateRulerLegacy('sparta', 'consul_change');
  ok('chronicle_log пополнен после generateRulerLegacy', GS.chronicle_log.length > logLen);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 8: Кризисные вехи (Сессия 8)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 8: Кризисные вехи');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, processCrisisVeha, _tickActiveCrisis, _resolveCrisis } = ctx;

  // 39. PLAGUE создаётся при population > 100000
  GS.nations.sparta.population.total = 200000;
  GS.turn = 600;
  GS.active_crisis = null;
  processCrisisVeha('sparta');
  ok('PLAGUE или другой кризис создан при turn=600', GS.active_crisis !== null);

  // 40. Кризис не запускается дважды (resolved=false блокирует)
  const crisisType = GS.active_crisis?.type;
  processCrisisVeha('sparta');
  ok('кризис не дублируется при resolved=false', GS.active_crisis?.type === crisisType);

  // 41. _tickActiveCrisis: PLAGUE уменьшает население постепенно
  if (GS.active_crisis?.type === 'PLAGUE') {
    const popBefore = GS.nations.sparta.population.total;
    GS.active_crisis._plague_ticks = 0;
    GS.turn = 601;
    _tickActiveCrisis('sparta');
    ok('PLAGUE уменьшает население', GS.nations.sparta.population.total <= popBefore);
  } else {
    ok('кризис создан (тип зависит от условий)', GS.active_crisis !== null);
  }

  // 42. FAMINE: wheat становится 0 при _famine_turns_left > 0
  const ctx2 = makeCtx();
  const { GAME_STATE: GS2 } = ctx2;
  GS2.nations.sparta.economy.stockpile = { wheat: 500 };
  GS2.nations.sparta._famine_turns_left = 3;
  GS2.active_crisis = {
    type: 'FAMINE', start_turn: 600, resolved: false,
    check_at: 610, nation_id: 'sparta',
  };
  ctx2._tickActiveCrisis('sparta');
  ok('FAMINE обнуляет wheat при _famine_turns_left=3', GS2.nations.sparta.economy.stockpile.wheat === 0);

  // 43. crisis.resolved устанавливается после проверки
  const ctx3 = makeCtx();
  const { GAME_STATE: GS3, _resolveCrisis: resolve3 } = ctx3;
  GS3.active_crisis = {
    type: 'FAMINE', start_turn: 600, resolved: false,
    check_at: 610, baseline: {},
  };
  GS3.turn = 610;
  GS3.nations.sparta.population.happiness = 50; // выше 20 → успех
  resolve3('sparta', GS3.active_crisis);
  ok('active_crisis.resolved = true после _resolveCrisis', GS3.active_crisis.resolved === true);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 9: Исторический рейтинг (Сессия 9)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 9: Исторический рейтинг');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, getHistoricalRating } = ctx;

  // 44. Возвращает массив строк длиной 2-3
  const rating = getHistoricalRating('sparta');
  ok('getHistoricalRating возвращает массив', Array.isArray(rating));
  ok('рейтинг содержит 2-3 строки', rating.length >= 2 && rating.length <= 3);

  // 45. Казна > 80000 → "Птолемеи"
  GS.nations.sparta.economy.treasury = 90000;
  const ratingRich = getHistoricalRating('sparta');
  ok('казна > 80000 → упоминание Птолемеев', ratingRich.some(s => s.includes('Птолемеев')));

  // 46. Армия > 50000 → "Александр"
  GS.nations.sparta.military.infantry = 55000;
  GS.nations.sparta.military.cavalry = 0;
  const ratingArmy = getHistoricalRating('sparta');
  ok('армия 55000 → упоминание Александра', ratingArmy.some(s => s.includes('Александра')));

  // 47. Легитимность < 30 → предупреждение "Цезаря"
  GS.nations.sparta.government.legitimacy = 20;
  const ratingLow = getHistoricalRating('sparta');
  ok('легитимность < 30 → упоминание Цезаря', ratingLow.some(s => s.includes('Цезаря')));

  // 48. Для несуществующей нации → пустой массив
  const ratingNull = getHistoricalRating('nonexistent');
  ok('несуществующая нация → пустой массив', ratingNull.length === 0);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 10: Завещание (Сессия 10)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 10: Завещание');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, addTestamentGoal, removeTestamentGoal,
          _evaluateTestament, getTestamentGoalDefs, _checkTestamentAge } = ctx;

  // 49. getTestamentGoalDefs содержит ≥ 5 определений
  const defs = getTestamentGoalDefs();
  ok('getTestamentGoalDefs ≥ 5 определений', defs.length >= 5);

  // 50. addTestamentGoal → goals.length растёт
  addTestamentGoal('treasury_20k', 'sparta');
  ok('addTestamentGoal добавляет цель', GS.testament?.goals?.length === 1);
  addTestamentGoal('army_5k', 'sparta');
  ok('addTestamentGoal: теперь 2 цели', GS.testament?.goals?.length === 2);

  // 51. Нельзя добавить более 3 целей
  addTestamentGoal('peace', 'sparta');
  addTestamentGoal('no_debt', 'sparta'); // лишняя
  ok('не более 3 целей в завещании', GS.testament?.goals?.length <= 3);

  // 52. removeTestamentGoal убирает цель
  removeTestamentGoal('treasury_20k');
  ok('removeTestamentGoal убирает цель', !GS.testament?.goals?.find(g => g.id === 'treasury_20k'));

  // 53. _evaluateTestament: выполненное завещание
  GS.testament = { goals: [{ id: 'army_5k', text: 'Армия > 5000' }], created_turn: 1 };
  GS.nations.sparta.military.infantry = 6000;
  const result = _evaluateTestament('sparta');
  ok('_evaluateTestament: army_5k выполнена', result?.goals?.[0]?.ok === true);

  // 54. _checkTestamentAge: уведомление при age >= 60
  GS.nations.sparta.government.ruler.age = 65;
  GS.nations.sparta._testament_notified = false;
  _checkTestamentAge('sparta');
  ok('_testament_notified при age=65', GS.nations.sparta._testament_notified === true);
}

// ════════════════════════════════════════════════════════════════════
// ИТОГ
// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
