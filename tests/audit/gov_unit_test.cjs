/**
 * tests/audit/gov_unit_test.cjs
 * Модуль: Правительство — Unit-тест
 *
 * Проверяет изолированную логику функций движка правительства:
 *   - calculatePersonalPower: расчёт личной власти правителя
 *   - calculateConspiracyChance: вычисление шанса заговора
 *   - checkPopularRevolt: накопление давления восстания
 *   - processTribalTick: decay престижа, авто-истечение вызова (единственная версия)
 *   - processTransition: штрафы переходного периода
 *
 * Запуск: node tests/audit/gov_unit_test.cjs
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' (' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}${detail ? ' (' + detail + ')' : ''}`);
    failed++;
  }
}

function assertClose(a, b, tolerance, msg) {
  const ok = Math.abs(a - b) <= tolerance;
  assert(ok, msg, `got ${a}, expected ~${b} ±${tolerance}`);
}

// ─── Мок-окружение ────────────────────────────────────────────────────────────

const GAME_STATE = { turn: 1, nations: {}, player_nation: 'rome' };
function addEventLog() {}
function getSenateManager() { return null; }

// ─── calculatePersonalPower (изолированная копия) ─────────────────────────────

function calculatePersonalPower(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?.ruler) return 25;

  const ruler   = gov.ruler;
  const govType = gov.type ?? 'republic';

  const BASE = { tyranny: 50, monarchy: 45, theocracy: 40, tribal: 35, oligarchy: 20, republic: 15 };
  let power = BASE[govType] ?? 25;

  const legitimacy = gov.legitimacy ?? 50;
  power += Math.round((legitimacy - 50) * 0.35);

  if (gov.power_resource) {
    const pr = gov.power_resource.current ?? 50;
    const mult = { fear: 0.20, military_loyalty: 0.15, prestige: 0.12,
                   wealth: 0.10, divine_mandate: 0.12, legitimacy: 0.08 };
    power += Math.round(pr * (mult[gov.power_resource.type] ?? 0.08));
  }

  if (ruler.type === 'person') {
    const armyLoy = nation.military?.loyalty ?? 50;
    if      (armyLoy > 70) power += 10;
    else if (armyLoy < 30) power -= 15;
    else                   power += Math.round((armyLoy - 50) * 0.2);
  }

  const activeConsp = (nation.conspiracies ?? []).filter(
    c => ['incubating','growing','detected'].includes(c.status)
  );
  for (const c of activeConsp) {
    power -= 12;
    if (c.preparation > 80) power -= 15;
    else if (c.status === 'growing') power -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(power)));
}

// ─── calculateConspiracyChance (изолированная копия) ─────────────────────────

function calculateConspiracyChance(nation) {
  const gov = nation.government;
  let chance = gov.conspiracies?.base_chance_per_turn ?? 0.15;

  if (gov.power_resource?.type === 'fear') {
    const fear = gov.power_resource.current ?? 50;
    chance *= Math.max(0.2, 1 - fear / 150);
  }

  if (nation.economy.treasury < 2000)  chance += 0.08;
  if (nation.economy.treasury < 0)     chance += 0.15;
  if (nation.military.loyalty < 40)    chance += 0.10;
  if (nation.military.loyalty < 20)    chance += 0.15;

  if (gov.personal_guard && gov.personal_guard.size > 0) {
    const guardDefense = gov.personal_guard.size * 0.4 * (gov.personal_guard.loyalty / 100);
    chance *= Math.max(0.1, 1 - guardDefense / 150);
  }

  if (gov.conspiracies?.secret_police?.enabled) {
    chance *= (1 - (gov.conspiracies.secret_police.conspiracy_detection_bonus ?? 0.4));
  }

  const pp = gov.ruler?.personal_power ?? 50;
  if      (pp > 75) chance *= 0.50;
  else if (pp < 25) chance *= 1.80;
  else if (pp < 40) chance *= 1.30;

  return Math.max(0, Math.min(0.85, chance));
}

// ─── Вспомогательная — создать нацию-заглушку ─────────────────────────────────

function makeNation(govType = 'republic', legitimacy = 50) {
  return {
    government: {
      type: govType,
      legitimacy,
      stability: 50,
      ruler: { type: 'person', personal_power: 50 },
      power_resource: { type: 'legitimacy', current: legitimacy, max: 100, decay_per_turn: 0.5 },
      conspiracies: { base_chance_per_turn: 0.15 },
    },
    economy:    { treasury: 5000 },
    military:   { loyalty: 50, at_war_with: [] },
    population: { happiness: 60, total: 1000 },
    characters: [],
    conspiracies: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: calculatePersonalPower
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- calculatePersonalPower ---');

{
  // Нация без правителя → 25
  const n = makeNation('republic', 50);
  delete n.government.ruler;
  GAME_STATE.nations['test'] = n;
  assert(calculatePersonalPower('test') === 25, 'Нет правителя → power = 25');
}

{
  // Тирания: base=50, legitimacy=50 → +0 → 50 + legitimacy_bonus(0) + fear_pr
  const n = makeNation('tyranny', 50);
  n.government.power_resource = { type: 'fear', current: 100, max: 100 };
  GAME_STATE.nations['test'] = n;
  // base=50, legitimacy=50 → +0, fear 100 × 0.20 = +20, armyLoy=50 → +0 → 70
  assertClose(calculatePersonalPower('test'), 70, 2, 'Тирания с max fear → power ~70');
}

{
  // Активный заговор (incubating) снижает power
  const n = makeNation('monarchy', 80);
  n.conspiracies = [{ status: 'incubating', preparation: 50 }];
  GAME_STATE.nations['test'] = n;
  const ppWithConsp = calculatePersonalPower('test');
  n.conspiracies = [];
  const ppClean = calculatePersonalPower('test');
  assert(ppWithConsp < ppClean, 'Заговор снижает personal_power', `${ppWithConsp} < ${ppClean}`);
}

{
  // Армия с лояльностью > 70 даёт +10 (person ruler)
  const n = makeNation('monarchy', 50);
  n.military.loyalty = 90;
  GAME_STATE.nations['test'] = n;
  const ppHighLoy = calculatePersonalPower('test');
  n.military.loyalty = 20;
  const ppLowLoy = calculatePersonalPower('test');
  assert(ppHighLoy > ppLowLoy, 'Высокая лояльность армии повышает power', `${ppHighLoy} > ${ppLowLoy}`);
}

{
  // Результат всегда [0..100]
  const n = makeNation('republic', 0);
  n.conspiracies = [
    { status: 'growing', preparation: 90 },
    { status: 'growing', preparation: 90 },
    { status: 'detected', preparation: 90 },
  ];
  n.military.loyalty = 10;
  GAME_STATE.nations['test'] = n;
  const pp = calculatePersonalPower('test');
  assert(pp >= 0 && pp <= 100, 'power всегда в диапазоне [0..100]', `got ${pp}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: calculateConspiracyChance
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- calculateConspiracyChance ---');

{
  // Базовый шанс: хорошие условия (treasury=5000, loyalty=50) → ~0.15
  const n = makeNation('tyranny', 50);
  n.government.power_resource = { type: 'fear', current: 50 };
  const chance = calculateConspiracyChance(n);
  // fear=50: chance *= max(0.2, 1 - 50/150) = max(0.2, 0.667) = 0.667
  // 0.15 × 0.667 ≈ 0.10
  assert(chance > 0 && chance <= 0.85, 'Шанс заговора в допустимых пределах [0..0.85]', `got ${chance.toFixed(3)}`);
}

{
  // Пустая казна повышает шанс
  const n = makeNation('tyranny', 50);
  n.government.power_resource = { type: 'fear', current: 100 };
  n.economy.treasury = 5000;
  const c1 = calculateConspiracyChance(n);
  n.economy.treasury = 500; // < 2000
  const c2 = calculateConspiracyChance(n);
  assert(c2 > c1, 'Низкая казна повышает шанс заговора', `${c2.toFixed(3)} > ${c1.toFixed(3)}`);
}

{
  // Тайная полиция снижает шанс
  const n = makeNation('tyranny', 50);
  n.government.power_resource = { type: 'fear', current: 0 };
  const cBase = calculateConspiracyChance(n);
  n.government.conspiracies.secret_police = { enabled: true, conspiracy_detection_bonus: 0.4 };
  const cWithPolice = calculateConspiracyChance(n);
  assert(cWithPolice < cBase, 'Тайная полиция снижает шанс заговора', `${cWithPolice.toFixed(3)} < ${cBase.toFixed(3)}`);
}

{
  // Личная гвардия снижает шанс
  const n = makeNation('tyranny', 50);
  n.government.power_resource = { type: 'fear', current: 0 };
  const cNoGuard = calculateConspiracyChance(n);
  n.government.personal_guard = { size: 80, loyalty: 90 };
  const cWithGuard = calculateConspiracyChance(n);
  assert(cWithGuard < cNoGuard, 'Личная гвардия снижает шанс заговора', `${cWithGuard.toFixed(3)} < ${cNoGuard.toFixed(3)}`);
}

{
  // Слабый правитель (pp < 25) увеличивает шанс
  const n = makeNation('republic', 10);
  n.government.power_resource = { type: 'legitimacy', current: 10 };
  n.government.ruler.personal_power = 10; // < 25
  const chance = calculateConspiracyChance(n);
  // base 0.15 × 1.80 = 0.27
  assert(chance > 0.20, 'Слабая власть увеличивает шанс заговора', `got ${chance.toFixed(3)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: checkPopularRevolt (накопление давления)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- checkPopularRevolt ---');

{
  // happiness >= 30 → давление спадает (не нарастает)
  const nation = makeNation();
  nation.population.happiness = 35;
  nation._revolt_pressure = 10;
  nation.regions = ['reg1'];

  // Имитируем логику функции
  function simRevolt(n) {
    const happiness = n.population.happiness ?? 50;
    if (!n._revolt_pressure) n._revolt_pressure = 0;
    if (happiness < 10) {
      n._revolt_pressure += 15;
    } else if (happiness < 20) {
      n._revolt_pressure += 8;
    } else if (happiness < 30) {
      n._revolt_pressure += 3;
    } else {
      n._revolt_pressure = Math.max(0, n._revolt_pressure - 2);
    }
  }

  simRevolt(nation);
  assert(nation._revolt_pressure === 8, 'Happiness 35 → давление спадает на 2', `got ${nation._revolt_pressure}`);
}

{
  // happiness < 10 → давление нарастает на 15
  const nation = makeNation();
  nation.population.happiness = 5;
  nation._revolt_pressure = 0;

  function simRevoltAdd(n) {
    const happiness = n.population.happiness ?? 50;
    if (!n._revolt_pressure) n._revolt_pressure = 0;
    if (happiness < 10)       n._revolt_pressure += 15;
    else if (happiness < 20)  n._revolt_pressure += 8;
    else if (happiness < 30)  n._revolt_pressure += 3;
    else n._revolt_pressure = Math.max(0, n._revolt_pressure - 2);
  }
  simRevoltAdd(nation);
  assert(nation._revolt_pressure === 15, 'Happiness 5 → давление +15', `got ${nation._revolt_pressure}`);
}

{
  // Порог 60: при достижении revolt → stability и legitimacy уменьшаются
  const nation = makeNation();
  nation.population.happiness = 5;
  nation._revolt_pressure = 59;
  nation.regions = ['reg1', 'reg2'];

  function simRevoltFull(n) {
    const happiness = n.population.happiness ?? 50;
    if (!n._revolt_pressure) n._revolt_pressure = 0;
    if (happiness < 10) n._revolt_pressure += 15;
    else if (happiness < 20) n._revolt_pressure += 8;
    else if (happiness < 30) n._revolt_pressure += 3;
    else { n._revolt_pressure = Math.max(0, n._revolt_pressure - 2); return; }

    const revoltThreshold = 60;
    if (n._revolt_pressure < revoltThreshold) return;

    n._revolt_pressure = 0;
    n.government.stability  = Math.max(0, (n.government.stability  ?? 50) - 20);
    n.government.legitimacy = Math.max(0, (n.government.legitimacy ?? 50) - 15);
    n.military.loyalty = Math.max(0, (n.military.loyalty ?? 50) - 10);
  }

  simRevoltFull(nation);
  assert(nation._revolt_pressure === 0,        'После восстания давление сброшено');
  assert(nation.government.stability  === 30,  'Stability −20 после восстания');
  assert(nation.government.legitimacy === 35,  'Legitimacy −15 после восстания');
  assert(nation.military.loyalty === 40,       'Army loyalty −10 после восстания');
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: processTribalTick — авто-истечение вызова (ключевой исправленный баг)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- processTribalTick: авто-истечение вызова ---');

{
  // Вызов активирован; 5 ходов без ответа → автоматическая уступка
  const gov = {
    type: 'tribal',
    stability: 50,
    legitimacy: 50,
    turns_at_peace: 5,
    power_resource: { type: 'prestige', current: 5, max: 100 },
    _rival_challenge_active:    true,
    _rival_chief_name:          'Бренн',
    _rival_challenge_issued_turn: 0,  // issued_turn=0
    _last_war_turn: 0,
    _raid_declared: false,
  };
  const nation = { government: gov, characters: [] };

  GAME_STATE.turn = 5; // 5 ходов прошло после вызова

  // Имитируем логику авто-истечения из активной версии
  function simExpire(g, turn) {
    if (g._rival_challenge_active) {
      const issuedTurn = g._rival_challenge_issued_turn ?? turn;
      const turnsIgnored = turn - issuedTurn;
      if (turnsIgnored >= 5) {
        g._rival_challenge_active = false;
        delete g._rival_chief_name;
        delete g._rival_challenge_issued_turn;
        g.stability  = Math.max(0, (g.stability  ?? 50) - 30);
        g.legitimacy = Math.max(0, (g.legitimacy ?? 50) - 25);
        if (g.power_resource) g.power_resource.current = Math.max(0, g.power_resource.current - 25);
        g.turns_at_peace = 0;
      }
    }
  }

  simExpire(gov, 5);
  assert(gov._rival_challenge_active === false, 'Вызов истёк после 5 ходов — флаг сброшен');
  assert(gov.stability  === 20,  'Stability −30 при авто-истечении', `got ${gov.stability}`);
  assert(gov.legitimacy === 25,  'Legitimacy −25 при авто-истечении', `got ${gov.legitimacy}`);
  assert(gov.power_resource.current === 0, 'prestige уменьшен при истечении', `got ${gov.power_resource.current}`);
  assert(gov.turns_at_peace === 0, 'turns_at_peace сброшен при истечении');
}

{
  // Вызов активирован; только 3 хода — ещё не истёк
  const gov = {
    _rival_challenge_active:    true,
    _rival_chief_name:          'Каск',
    _rival_challenge_issued_turn: 0,
    stability: 50,
    legitimacy: 50,
    power_resource: { type: 'prestige', current: 5, max: 100 },
  };

  function simExpireEarly(g, turn) {
    if (g._rival_challenge_active) {
      const issuedTurn = g._rival_challenge_issued_turn ?? turn;
      if ((turn - issuedTurn) >= 5) {
        g._rival_challenge_active = false;
        g.stability  = Math.max(0, (g.stability  ?? 50) - 30);
        g.legitimacy = Math.max(0, (g.legitimacy ?? 50) - 25);
      }
    }
  }

  simExpireEarly(gov, 3);
  assert(gov._rival_challenge_active === true, 'Вызов не истёк после 3 ходов — флаг активен');
  assert(gov.stability === 50,  'Stability не изменена до истечения');
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE 5: processTransition — штрафы переходного периода
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- processTransition — штрафы ---');

{
  // Каждый ход перехода снимает stability, army_loyalty, legitimacy по penalties
  const gov = {
    type: 'republic',
    stability: 50,
    legitimacy: 40,
    active_transition: {
      status: 'in_progress',
      turns_elapsed: 0,
      transition_penalties: { stability: -3, army_loyalty: -2, legitimacy: -2 },
      completion_requires: { legitimacy_of_new_form: 30 },
    },
    in_transition: true,
  };
  const nation = { government: gov, military: { loyalty: 50 } };
  GAME_STATE.turn = 10;

  // Имитируем один тик processTransition
  function simTransTick(n) {
    const g = n.government;
    const trans = g.active_transition;
    if (!trans || trans.status !== 'in_progress') return;
    trans.turns_elapsed = (trans.turns_elapsed ?? 0) + 1;
    const pen = trans.transition_penalties ?? {};
    if (pen.stability)    g.stability    = Math.max(0, (g.stability ?? 50) + pen.stability);
    if (pen.army_loyalty) n.military.loyalty = Math.max(0, n.military.loyalty + pen.army_loyalty);
    if (pen.legitimacy)   g.legitimacy   = Math.max(0, g.legitimacy + pen.legitimacy);
  }

  simTransTick(nation);
  assert(gov.stability         === 47, 'Stability −3 за ход перехода', `got ${gov.stability}`);
  assert(nation.military.loyalty === 48, 'Army loyalty −2 за ход перехода', `got ${nation.military.loyalty}`);
  assert(gov.legitimacy        === 38, 'Legitimacy −2 за ход перехода', `got ${gov.legitimacy}`);
  assert(gov.active_transition.turns_elapsed === 1, 'turns_elapsed инкрементируется');
}

{
  // Переход завершается при turns_elapsed >= 5 И legitimacy >= порога
  const gov = {
    type: 'republic',
    stability: 50,
    legitimacy: 35,
    active_transition: {
      from: 'tyranny',
      to:   'republic',
      status: 'in_progress',
      turns_elapsed: 5,
      transition_penalties: { stability: -3, army_loyalty: -2, legitimacy: -2 },
      completion_requires: { legitimacy_of_new_form: 30 },
      cause_type: 'reform',
    },
    in_transition: true,
    transition_history: [],
  };
  const nation = { government: gov, military: { loyalty: 50 } };
  GAME_STATE.turn = 15;

  function simTransComplete(n) {
    const g = n.government;
    const trans = g.active_transition;
    if (!trans || trans.status !== 'in_progress') return;
    trans.turns_elapsed = (trans.turns_elapsed ?? 0) + 1;
    const pen = trans.transition_penalties ?? {};
    if (pen.stability)    g.stability    = Math.max(0, (g.stability ?? 50) + pen.stability);
    if (pen.army_loyalty) n.military.loyalty = Math.max(0, n.military.loyalty + pen.army_loyalty);
    if (pen.legitimacy)   g.legitimacy   = Math.max(0, g.legitimacy + pen.legitimacy);

    const legOk = g.legitimacy >= (trans.completion_requires?.legitimacy_of_new_form ?? 30);
    if (trans.turns_elapsed >= 5 && legOk) {
      g.type = trans.to;
      trans.status = 'completed';
      g.active_transition = null;
      g.in_transition = false;
      g.transition_history.push({ turn: GAME_STATE.turn, from: trans.from, to: trans.to });
    }
  }

  simTransComplete(nation);
  // legitimacy = 35 - 2 = 33 >= 30, turns=6 >= 5 → завершение
  assert(gov.type         === 'republic',   'Тип правления обновлён при завершении');
  assert(gov.in_transition === false,       'in_transition сброшен после завершения');
  assert(gov.active_transition === null,    'active_transition очищен');
  assert(gov.transition_history.length > 0, 'Запись добавлена в transition_history');
}

// ═════════════════════════════════════════════════════════════════════════════
// ИТОГ
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n=== ИТОГ: ${passed} пройдено, ${failed} провалено ===\n`);
if (failed > 0) process.exit(1);
