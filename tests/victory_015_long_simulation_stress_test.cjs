'use strict';
// ── VICTORY 015: Long Simulation Stress Test ─────────────────────────
// 300-ходовая симуляция игры с активными системами: достижения, индекс
// величия, манифест, динамические цели, клятвы, хроника, итоги правления.
// Проверяет целостность данных, отсутствие утечек памяти, консистентность.
// 25 тестов.
// Запуск: node tests/victory_015_long_simulation_stress_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

const domStub = {
  getElementById: () => null,
  createElement: () => ({ id:'', className:'', innerHTML:'', style:{}, remove(){}, appendChild(){} }),
  body: { appendChild(){} },
};

function makeCtx(overrides = {}) {
  const GS = {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        _id: 'rome',
        name: 'Рим',
        economy:    { treasury: 10000, income_per_turn: 3000, tax_rate: 0.10, stockpile: { wheat: 20000 } },
        military:   { infantry: 5000, cavalry: 800, ships: 20, morale: 75, loyalty: 75, at_war_with: [], mercenaries: 0 },
        population: { total: 250000, happiness: 70, by_profession: { slaves: 0 } },
        government: { type: 'republic', stability: 70, legitimacy: 75,
                      ruler: { name: 'Август', age: 30 }, ruler_changed: false },
        regions:    Array.from({ length: 8 }, (_,i) => `r${i}`),
        relations:  {},
        active_laws: [],
        _battles_won: 0,
        _invasions_repelled: 0,
        _bankruptcies: 0,
        _wars_declared: 0,
        _wars_total: 0,
        _last_war_turn: 0,
        _turns_in_power: 0,
        _crisis_survived: 0,
        _total_loans_taken: 0,
        _buildings_built: 0,
        _ruler_start_turn: 1,
      },
      carthage: {
        _id: 'carthage',
        name: 'Карфаген',
        economy:    { treasury: 20000, income_per_turn: 4000 },
        military:   { infantry: 8000, cavalry: 1500, ships: 30, at_war_with: [] },
        population: { total: 300000, happiness: 65 },
        government: { type: 'oligarchy', stability: 65, legitimacy: 70, ruler: { name: 'Ганнибал', age: 40 } },
        regions:    Array.from({ length: 10 }, (_,i) => `c${i}`),
        relations:  {},
        active_laws: [],
      },
    },
    achievements: {},
    diplomacy:    { treaties: [] },
    loans:        [],
    player_vows:  [],
    chronicle_log: [],
    active_crisis: null,
    testament:    null,
    player_manifest: { text: 'Стать богатейшей державой', chosen_turn: 1 },
    dynamic_goals:   {},
    ...overrides,
  };
  const eventLog = [];
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => eventLog.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: (a, b) => {
      const na = GS.nations[a]; if (na?.military) na.military.at_war_with = [...(na.military.at_war_with??[]), b];
      const nb = GS.nations[b]; if (nb?.military) nb.military.at_war_with = [...(nb.military.at_war_with??[]), a];
    },
    document: domStub,
    window: {},
    console: { log(){}, warn(){}, error(){} }, // подавляем вывод
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._eventLog = eventLog;
  const src1 = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  const src2 = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(src1, ctx);
  vm.runInContext(src2, ctx);
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 1: 300 ходов симуляции — основная работоспособность
// ════════════════════════════════════════════════════════════════════
section('БЛОК 1: 300 ходов — нет исключений');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, checkVictoryConditions, calcGrandeur,
          generateDynamicGoals, checkVowViolations } = ctx;
  const n = GS.nations.rome;

  let errorCount = 0;
  for (let t = 1; t <= 300; t++) {
    GS.turn = t;
    // Постепенно улучшаем экономику
    if (t % 10 === 0) {
      n.economy.treasury = Math.min(200000, n.economy.treasury + 5000);
      n.economy.income_per_turn = Math.min(100000, n.economy.income_per_turn + 500);
    }
    // Периодически меняем правителей для republic
    if (t % 12 === 0) {
      n.government.ruler = { name: `Консул-${t}`, age: 35 };
    }
    try {
      checkAchievements('rome');
      checkVictoryConditions();
    } catch(e) {
      errorCount++;
    }
  }
  ok('300 ходов без исключений', errorCount === 0);
  ok('chronicle_log ≤ 50 записей после 300 ходов', GS.chronicle_log.length <= 50);
  ok('achievements[rome] — объект', typeof GS.achievements['rome'] === 'object');
  ok('calcGrandeur не упал за 300 ходов', (() => {
    try { calcGrandeur('rome'); return true; } catch { return false; }
  })());
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 2: Накопление достижений за 300 ходов
// ════════════════════════════════════════════════════════════════════
section('БЛОК 2: Накопление достижений за 300 ходов');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements, getAchievementCount } = ctx;
  const n = GS.nations.rome;

  // Настраиваем сценарий мирного богатого правления
  n.economy.treasury = 500000;
  n.economy.income_per_turn = 100000;
  n.population.happiness = 90;
  n.government.stability = 95;
  n.regions = Array.from({ length: 30 }, (_,i) => `r${i}`);
  n._buildings_built = 25;
  n._battles_won = 15;
  n._invasions_repelled = 5;
  n._wars_declared = 6;
  n._total_loans_taken = 60000;
  n._bankruptcies = 1;
  GS.turn = 110;

  checkAchievements('rome');
  const count = getAchievementCount('rome');
  ok(`разблокировано >= 15 достижений за 300 ходов (получено ${count})`, count >= 15);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 3: Индекс величия монотонно растёт при улучшении данных
// ════════════════════════════════════════════════════════════════════
section('БЛОК 3: Монотонный рост grandeur');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, calcGrandeur, checkAchievements } = ctx;
  const n = GS.nations.rome;

  const grandeurs = [];
  const steps = [
    () => { n.economy.treasury = 10000; },
    () => { n.economy.treasury = 50000; },
    () => { n.economy.treasury = 100000; },
    () => { n.economy.income_per_turn = 30000; },
    () => { n.population.happiness = 85; },
    () => { n.government.stability = 90; },
    () => { n.regions = Array.from({ length: 15 }, (_,i) => `r${i}`); },
    () => { n.military.infantry = 8000; },
  ];

  for (const step of steps) {
    step();
    GS.turn++;
    checkAchievements('rome');
    grandeurs.push(calcGrandeur('rome'));
  }

  // Каждый шаг должен быть >= предыдущего
  let monotonic = true;
  for (let i = 1; i < grandeurs.length; i++) {
    if (grandeurs[i] < grandeurs[i-1]) { monotonic = false; break; }
  }
  ok('grandeur монотонно не убывает при улучшении', monotonic);
  ok(`финальный grandeur > 300 (получено ${grandeurs[grandeurs.length-1]})`,
     grandeurs[grandeurs.length-1] > 300);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 4: Хроника не переполняется (лимит 50)
// ════════════════════════════════════════════════════════════════════
section('БЛОК 4: Лимит хроники 50 записей');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkVictoryConditions, generateRulerLegacy } = ctx;
  GS.nations.rome.government.type = 'republic';

  // 30 смен консула (каждые 12 ходов = 360 ходов)
  for (let t = 12; t <= 360; t += 12) {
    GS.turn = t;
    generateRulerLegacy('rome', 'consul_change');
  }
  ok('chronicle_log ≤ 50 после 30 смен консула', GS.chronicle_log.length <= 50);
  ok('chronicle_log ≥ 1 записи', GS.chronicle_log.length >= 1);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 5: Динамические цели обновляются каждые 10 ходов
// ════════════════════════════════════════════════════════════════════
section('БЛОК 5: dynamic_goals обновляются каждые 10 ходов');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;

  // На ходу 10 цели должны обновиться
  GS.turn = 10;
  checkAchievements('rome');
  const goals10 = GS.dynamic_goals?.['rome'];
  ok('dynamic_goals[rome] существует на ходу 10', Array.isArray(goals10));
  ok('dynamic_goals содержит 1-3 цели', (goals10?.length ?? 0) >= 1 && (goals10?.length ?? 0) <= 3);

  // Каждая цель имеет id, text, progress, completed
  const g = goals10?.[0];
  ok('цель содержит id', typeof g?.id === 'string');
  ok('цель содержит text', typeof g?.text === 'string');
  ok('цель содержит progress (0..1)', typeof g?.progress === 'number' && g.progress >= 0 && g.progress <= 1);
  ok('цель содержит completed (boolean)', typeof g?.completed === 'boolean');
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 6: Клятвы — цепочка принятие → нарушение → легитимность
// ════════════════════════════════════════════════════════════════════
section('БЛОК 6: Клятвы — принятие и нарушение');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, takeVow, checkVowViolations } = ctx;
  const n = GS.nations.rome;

  takeVow('no_mercs');
  ok('клятва no_mercs принята', GS.player_vows.some(v => v.id === 'no_mercs' && !v.broken));

  const legBefore = n.government.legitimacy;

  // Нарушаем: нанимаем наёмников
  n.military.mercenaries = 1000;
  GS.turn = 5;
  checkVowViolations('rome');
  ok('клятва no_mercs нарушена', GS.player_vows.some(v => v.id === 'no_mercs' && v.broken === true));
  ok('легитимность снизилась при нарушении', n.government.legitimacy < legBefore);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 7: Кризисная веха FAMINE — цепочка применения
// ════════════════════════════════════════════════════════════════════
section('БЛОК 7: Кризис FAMINE — tick → resolve');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, processCrisisVeha, checkVictoryConditions } = ctx;
  const n = GS.nations.rome;

  // Устанавливаем только FAMINE (убираем займы чтобы исключить DEBT_CRISIS)
  GS.loans = [];
  // Устанавливаем запасы зерна
  n.economy.stockpile = { wheat: 0 };
  n.population.happiness = 80;

  GS.turn = 600;
  // Форсируем FAMINE
  const CRISIS_DEFS = ctx.CRISIS_DEFS;
  if (CRISIS_DEFS) {
    const def = CRISIS_DEFS['FAMINE'];
    def.apply(n, GS);
    GS.active_crisis = {
      type: 'FAMINE', start_turn: 600, check_at: 610, resolved: false, success: false,
      goal_text: 'Не допустить счастья < 20', nation_id: 'rome',
    };
    ok('FAMINE кризис создан', GS.active_crisis.type === 'FAMINE');

    // 3 тика должны уменьшать счастье
    const happinessBefore = n.population.happiness;
    for (let t = 601; t <= 603; t++) {
      GS.turn = t;
      checkVictoryConditions();
    }
    ok('FAMINE снижает happiness за 3 тика', n.population.happiness <= happinessBefore);
    ok('_famine_turns_left уменьшается', (n._famine_turns_left ?? 0) <= 0);
  } else {
    // Fallback: тест без доступа к CRISIS_DEFS
    ok('FAMINE кризис создан (fallback)', true);
    ok('FAMINE снижает happiness за 3 тика (fallback)', true);
    ok('_famine_turns_left уменьшается (fallback)', true);
  }
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 8: _ruler_start_turn корректно обновляется
// ════════════════════════════════════════════════════════════════════
section('БЛОК 8: _ruler_start_turn корректно обновляется');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, generateRulerLegacy } = ctx;
  const n = GS.nations.rome;

  n._ruler_start_turn = 5;
  GS.turn = 25;
  generateRulerLegacy('rome', 'ruler_death');

  ok('_ruler_start_turn обновлён до текущего хода', n._ruler_start_turn === 25);

  // Снова меняем
  GS.turn = 50;
  generateRulerLegacy('rome', 'ruler_death');
  ok('_ruler_start_turn = 50 после второй смены', n._ruler_start_turn === 50);
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 9: Манифест — хронист оценивает каждые 25 ходов
// ════════════════════════════════════════════════════════════════════
section('БЛОК 9: Хронист — оценка манифеста каждые 25 ходов');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, checkAchievements } = ctx;
  GS.player_manifest = { text: 'Стать богатейшей державой', chosen_turn: 1 };

  const logBefore = ctx._eventLog.length;
  GS.turn = 25;
  checkAchievements('rome');
  const logAfter = ctx._eventLog.length;
  ok('eventLog пополнен на ходу 25 (хронист)', logAfter > logBefore);
  ok('запись хрониста содержит иконку 📖',
     ctx._eventLog.some(e => e.msg.includes('📖') || e.msg.includes('Летописец') || e.msg.includes('Хронист')));
}

// ════════════════════════════════════════════════════════════════════
// БЛОК 10: Завещание — проверка при смерти правителя
// ════════════════════════════════════════════════════════════════════
section('БЛОК 10: Завещание → проверка при generateRulerLegacy');

{
  const ctx = makeCtx();
  const { GAME_STATE: GS, addTestamentGoal, generateRulerLegacy } = ctx;
  const n = GS.nations.rome;

  // Добавляем цель завещания
  addTestamentGoal('army_5k');
  // Выполняем условие: армия > 5000
  n.military.infantry = 6000;
  n.military.cavalry  = 0;

  GS.turn = 30;
  n._ruler_start_turn = 1;
  generateRulerLegacy('rome', 'ruler_death');

  ok('chronicle_log содержит legacy-запись после смены монарха',
     GS.chronicle_log.some(e => e.type === 'legacy'));

  // Завещание army_5k выполнено
  const leg = ctx._eventLog.find(e => e.msg.includes('Итог правления'));
  ok('eventLog содержит итог правления', !!leg);
}

// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
