// ══════════════════════════════════════════════════════════════════════
// GOV_010 TESTS — Давление войной на племенного вождя
// Запуск: node tests/gov_010_tribal_pressure_test.js
//
// Покрывает:
//   1. Prestige decay после >10 ходов без войны
//   2. Ропот советника (-5 лояльности) при turnsAtPeace > 8 каждые 4 хода
//   3. Флаг _rival_challenge_active срабатывает при prestige < 10
//   4. acceptTribalChallenge: победа восстанавливает престиж, сбрасывает вызов
//   5. yieldTribalPower: мирная передача власти — штраф без poединка
// ══════════════════════════════════════════════════════════════════════

// ── Минимальный стаб окружения ────────────────────────────────────────
const GAME_STATE = {
  turn: 0,
  player_nation: 'tribe1',
  nations: {},
};

const _eventLog = [];
function addEventLog(msg, type) { _eventLog.push({ msg, type }); }
function clearLog() { _eventLog.length = 0; }

// ── Инлайним нужные функции из engine/government.js ───────────────────
const RIVAL_CHIEF_NAMES = [
  'Брэнн Огнеборец', 'Кагрим Стальной Кулак', 'Тарн Кровавый Топор',
];

function processTribalTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  if (!gov || gov.power_resource?.type !== 'prestige') return;

  if (gov._raid_declared) {
    gov._raid_declared = false;
    gov._last_war_turn = GAME_STATE.turn;
    gov.turns_at_peace = 0;
    gov.power_resource.current = Math.min(100, (gov.power_resource.current ?? 50) + 15);
    if (gov._rival_challenge_active) {
      gov._rival_challenge_active = false;
      delete gov._rival_chief_name;
      delete gov._show_challenge_event;
    }
    if (isPlayer) addEventLog('⚔️ Набег объявлен! Воины воодушевлены. Престиж +15.', 'military');
    return;
  }

  const lastWar = gov._last_war_turn ?? 0;
  const turnsAtPeace = GAME_STATE.turn - lastWar;
  gov.turns_at_peace = turnsAtPeace;

  if (turnsAtPeace > 10) {
    gov.power_resource.current = Math.max(0, gov.power_resource.current - 3);
  }

  const prestige = gov.power_resource.current;

  if (turnsAtPeace > 8) {
    if (turnsAtPeace % 4 === 0) {
      if (isPlayer) addEventLog('🏕️ Старейшины начинают сомневаться...', 'warning');
      const advisors = (nation.characters ?? []).filter(c => c.traits);
      if (advisors.length) {
        const idx = Math.floor(Math.random() * advisors.length);
        const advisor = advisors[idx];
        const prev = advisor.traits.loyalty ?? 50;
        advisor.traits.loyalty = Math.max(0, prev - 5);
        if (isPlayer) addEventLog(`👤 ${advisor.name} сомневается. Лояльность: ${prev} → ${advisor.traits.loyalty}.`, 'warning');
      }
    }
  }

  if (prestige < 20 && isPlayer && GAME_STATE.turn % 3 === 0) {
    addEventLog(`⚠️ Престиж вождя опасно мал (${Math.round(prestige)})!`, 'danger');
  }

  if (prestige < 10 && !gov._rival_challenge_active) {
    gov._rival_challenge_active = true;
    const rivalIdx = Math.floor(Math.random() * RIVAL_CHIEF_NAMES.length);
    gov._rival_chief_name = RIVAL_CHIEF_NAMES[rivalIdx];
    gov._show_challenge_event = true;
    if (isPlayer) addEventLog(`⚔️ ВЫЗОВ! ${gov._rival_chief_name} бросает вызов вождю!`, 'danger');
  }
}

function acceptTribalChallenge(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?._rival_challenge_active) return { outcome: 'no_challenge' };

  const rivalName = gov._rival_chief_name ?? 'соперник';
  const roll = Math.random() * 100;
  const prestige = gov.power_resource?.current ?? 5;
  const winChance = 30 + prestige * 2;

  gov._rival_challenge_active = false;
  delete gov._rival_chief_name;
  delete gov._show_challenge_event;

  if (roll < winChance) {
    gov.power_resource.current = Math.min(100, prestige + 30);
    gov._last_war_turn = GAME_STATE.turn;
    gov.turns_at_peace = 0;
    addEventLog(`⚔️ Вождь победил ${rivalName}! Престиж +30.`, 'military');
    return { outcome: 'victory', roll, winChance };
  } else {
    gov.power_resource.current = Math.max(0, prestige - 20);
    gov.stability = Math.max(0, (gov.stability ?? 50) - 25);
    addEventLog(`💀 Вождь проиграл ${rivalName}! Престиж −20, Стабильность −25.`, 'danger');
    return { outcome: 'defeat', roll, winChance };
  }
}

function yieldTribalPower(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?._rival_challenge_active) return { outcome: 'no_challenge' };

  const rivalName = gov._rival_chief_name ?? 'соперник';
  gov._rival_challenge_active = false;
  delete gov._rival_chief_name;
  delete gov._show_challenge_event;

  gov.stability  = Math.max(0, (gov.stability ?? 50) - 15);
  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 20);
  gov.power_resource.current = 0;

  addEventLog(`🏳️ Вождь уступил власть ${rivalName}. Стабильность −15, Легитимность −20.`, 'warning');
  return { outcome: 'yield' };
}

// ── Хелперы тестов ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function makeTribalNation(overrides = {}) {
  return {
    government: {
      type: 'tribal',
      stability: 70,
      legitimacy: 50,
      power_resource: { type: 'prestige', current: 50, decay_per_turn: 0.5 },
      _last_war_turn: 0,
      turns_at_peace: 0,
      ...(overrides.government ?? {}),
    },
    economy: { treasury: 500 },
    characters: [
      { id: 'c1', name: 'Старейшина Горн', traits: { loyalty: 70 } },
      { id: 'c2', name: 'Воин Барк',      traits: { loyalty: 60 } },
    ],
    ...(overrides.nation ?? {}),
  };
}

// ════════════════════════════════════════════════════════════════════
// ТЕСТ 1: Prestige decay при >10 ходах без войны
// ════════════════════════════════════════════════════════════════════
console.log('\n📋 Тест 1: Prestige decay при длительном мире');
{
  const nation = makeTribalNation({ government: { _last_war_turn: 0 } });
  GAME_STATE.nations['tribe1'] = nation;
  GAME_STATE.turn = 15; // 15 ходов без войны > 10
  clearLog();

  const prestBefore = nation.government.power_resource.current;
  processTribalTick(nation, 'tribe1', true);
  const prestAfter = nation.government.power_resource.current;

  assert(prestAfter < prestBefore, 'Prestige упал после >10 ходов без войны',
    `было ${prestBefore}, стало ${prestAfter}`);
  assert(Math.abs(prestBefore - prestAfter - 3) < 0.01, 'Decay точно -3',
    `delta=${prestBefore - prestAfter}`);
  assert(nation.government.turns_at_peace === 15, 'turns_at_peace обновлён',
    `turns_at_peace=${nation.government.turns_at_peace}`);
}

// ════════════════════════════════════════════════════════════════════
// ТЕСТ 2: Без войны <= 10 ходов — decay НЕ срабатывает
// ════════════════════════════════════════════════════════════════════
console.log('\n📋 Тест 2: Без войны ≤10 ходов — нет decay');
{
  const nation = makeTribalNation({ government: { _last_war_turn: 0 } });
  GAME_STATE.nations['tribe1'] = nation;
  GAME_STATE.turn = 8; // 8 ходов без войны <= 10
  clearLog();

  const prestBefore = nation.government.power_resource.current;
  processTribalTick(nation, 'tribe1', true);
  const prestAfter = nation.government.power_resource.current;

  assert(prestAfter === prestBefore, 'Prestige не падает при ≤10 ходах мира',
    `было ${prestBefore}, стало ${prestAfter}`);
}

// ════════════════════════════════════════════════════════════════════
// ТЕСТ 3: При turnsAtPeace > 8 и кратном 4 — ропот советника
// ════════════════════════════════════════════════════════════════════
console.log('\n📋 Тест 3: Ропот советника при 12 ходах мира');
{
  const nation = makeTribalNation({
    government: { _last_war_turn: 0 },
  });
  GAME_STATE.nations['tribe1'] = nation;
  GAME_STATE.turn = 12; // 12 % 4 === 0 и > 8
  clearLog();

  const loyaltiesBefore = nation.characters.map(c => c.traits.loyalty);
  processTribalTick(nation, 'tribe1', true);
  const loyaltiesAfter = nation.characters.map(c => c.traits.loyalty);

  const totalDecay = loyaltiesBefore.reduce((s, v, i) => s + (v - loyaltiesAfter[i]), 0);
  assert(totalDecay === 5, 'Ровно один советник потерял 5 лояльности',
    `суммарный decay=${totalDecay}`);

  const hasWarningLog = _eventLog.some(e => e.msg.includes('сомневать'));
  assert(hasWarningLog, 'Событие «Старейшины сомневаются» добавлено в лог');
}

// ════════════════════════════════════════════════════════════════════
// ТЕСТ 4: Вызов на поединок при prestige < 10
// ════════════════════════════════════════════════════════════════════
console.log('\n📋 Тест 4: Вызов на поединок при prestige < 10');
{
  const nation = makeTribalNation({
    government: {
      _last_war_turn: 0,
      power_resource: { type: 'prestige', current: 5, decay_per_turn: 0 },
    },
  });
  // Установим turns_at_peace так чтобы decay не срабатывал дважды
  GAME_STATE.nations['tribe1'] = nation;
  GAME_STATE.turn = 5; // 5 ходов — нет decay (<=10)
  clearLog();

  assert(!nation.government._rival_challenge_active, 'До тика нет вызова');
  processTribalTick(nation, 'tribe1', true);

  assert(nation.government._rival_challenge_active === true, '_rival_challenge_active установлен');
  assert(typeof nation.government._rival_chief_name === 'string', '_rival_chief_name задан');
  assert(nation.government._show_challenge_event === true, '_show_challenge_event выставлен');

  const hasChallengeLog = _eventLog.some(e => e.msg.includes('ВЫЗОВ'));
  assert(hasChallengeLog, 'Событие о вызове добавлено в лог');

  // Повторный тик не должен создавать новый вызов
  clearLog();
  processTribalTick(nation, 'tribe1', true);
  const challengeLogs = _eventLog.filter(e => e.msg.includes('ВЫЗОВ'));
  assert(challengeLogs.length === 0, 'Повторный тик не дублирует вызов');
}

// ════════════════════════════════════════════════════════════════════
// ТЕСТ 5: acceptTribalChallenge и yieldTribalPower
// ════════════════════════════════════════════════════════════════════
console.log('\n📋 Тест 5: acceptTribalChallenge — победа и поражение; yieldTribalPower');
{
  // --- 5a: yieldTribalPower ---
  const nationY = makeTribalNation({
    government: {
      _last_war_turn: 0,
      stability: 70,
      legitimacy: 60,
      power_resource: { type: 'prestige', current: 8 },
      _rival_challenge_active: true,
      _rival_chief_name: 'Брэнн Огнеборец',
      _show_challenge_event: true,
    },
  });
  GAME_STATE.nations['tribe1'] = nationY;
  clearLog();

  const res = yieldTribalPower('tribe1');
  assert(res.outcome === 'yield', 'yieldTribalPower: outcome === yield');
  assert(nationY.government._rival_challenge_active === false, 'Вызов снят после уступки');
  assert(nationY.government.power_resource.current === 0, 'Престиж обнулён');
  assert(nationY.government.stability === 55, 'Стабильность -15',
    `stability=${nationY.government.stability}`);
  assert(nationY.government.legitimacy === 40, 'Легитимность -20',
    `legitimacy=${nationY.government.legitimacy}`);

  // --- 5b: acceptTribalChallenge — победа (мок Math.random → 0, всегда победа) ---
  const origRandom = Math.random;
  Math.random = () => 0; // roll=0, winChance=30+5*2=40 → 0 < 40 → победа

  const nationA = makeTribalNation({
    government: {
      _last_war_turn: 0,
      stability: 70,
      power_resource: { type: 'prestige', current: 5 },
      _rival_challenge_active: true,
      _rival_chief_name: 'Тарн Кровавый Топор',
      _show_challenge_event: true,
    },
  });
  GAME_STATE.nations['tribe1'] = nationA;
  GAME_STATE.turn = 20;
  clearLog();

  const resA = acceptTribalChallenge('tribe1');
  assert(resA.outcome === 'victory', 'acceptTribalChallenge: победа при roll=0');
  assert(nationA.government.power_resource.current === 35, 'Престиж +30 после победы',
    `current=${nationA.government.power_resource.current}`);
  assert(nationA.government.turns_at_peace === 0, 'turns_at_peace сброшен после победы');
  assert(!nationA.government._rival_challenge_active, 'Вызов снят после победы');

  // --- 5c: acceptTribalChallenge — поражение ---
  Math.random = () => 0.99; // roll=99, winChance=40 → 99 > 40 → поражение

  const nationD = makeTribalNation({
    government: {
      _last_war_turn: 0,
      stability: 70,
      power_resource: { type: 'prestige', current: 5 },
      _rival_challenge_active: true,
      _rival_chief_name: 'Кагрим Стальной Кулак',
    },
  });
  GAME_STATE.nations['tribe1'] = nationD;
  clearLog();

  const resD = acceptTribalChallenge('tribe1');
  assert(resD.outcome === 'defeat', 'acceptTribalChallenge: поражение при roll=99');
  assert(nationD.government.power_resource.current === 0, 'Престиж не ниже 0 после поражения',
    `current=${nationD.government.power_resource.current}`);
  assert(nationD.government.stability === 45, 'Стабильность -25 после поражения',
    `stability=${nationD.government.stability}`);

  Math.random = origRandom;
}

// ════════════════════════════════════════════════════════════════════
// БОНУС: Краш-тест — нет персонажей, нет power_resource, null-government
// ════════════════════════════════════════════════════════════════════
console.log('\n📋 Краш-тесты: граничные случаи');
{
  // Нет power_resource
  const n1 = { government: { type: 'tribal' }, characters: [] };
  try {
    processTribalTick(n1, 'x', false);
    assert(true, 'Нет crash при отсутствии power_resource');
  } catch (e) {
    assert(false, 'Нет crash при отсутствии power_resource', e.message);
  }

  // power_resource не prestige
  const n2 = { government: { type: 'tribal', power_resource: { type: 'fear', current: 50 } }, characters: [] };
  try {
    processTribalTick(n2, 'x', false);
    assert(true, 'Нет crash при power_resource.type !== prestige');
  } catch (e) {
    assert(false, 'Нет crash при power_resource.type !== prestige', e.message);
  }

  // null government
  const n3 = { government: null };
  try {
    processTribalTick(n3, 'x', false);
    assert(true, 'Нет crash при government=null');
  } catch (e) {
    assert(false, 'Нет crash при government=null', e.message);
  }

  // yieldTribalPower без активного вызова
  const n4 = makeTribalNation();
  GAME_STATE.nations['tribe1'] = n4;
  const r = yieldTribalPower('tribe1');
  assert(r.outcome === 'no_challenge', 'yieldTribalPower без вызова возвращает no_challenge');

  // Prestige не уходит ниже 0
  const n5 = makeTribalNation({
    government: { _last_war_turn: 0, power_resource: { type: 'prestige', current: 1 } },
  });
  GAME_STATE.nations['tribe1'] = n5;
  GAME_STATE.turn = 20;
  processTribalTick(n5, 'tribe1', false);
  assert(n5.government.power_resource.current >= 0, 'Prestige не уходит в минус',
    `current=${n5.government.power_resource.current}`);
}

// ── Итог ─────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════`);
console.log(`✅ Пройдено: ${passed}   ❌ Провалено: ${failed}`);
console.log(`══════════════════════════════════════`);
if (failed > 0) process.exit(1);
