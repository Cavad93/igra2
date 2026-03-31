// ══════════════════════════════════════════════════════════════════════
// GOV_010 TESTS — Давление войной на племенного вождя
// Запуск: node tests/gov_010_tribal_war_pressure_test.js
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Минимальное окружение ─────────────────────────────────────────────
const GAME_STATE = { turn: 0, player_nation: 'tribe_a', nations: {} };

const _logs = [];
function addEventLog(msg, type) { _logs.push({ msg, type }); }
function renderGovernmentOverlay() {}

// ── Инлайн processTribalTick (копия из engine/government.js) ──────────
function processTribalTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  if (!gov) return;

  if (!gov.tribal) gov.tribal = {};
  const tribal = gov.tribal;

  const atWar = (nation.military?.at_war_with?.length ?? 0) > 0;
  if (atWar) {
    tribal.turns_at_peace = 0;
    gov._last_war_turn = GAME_STATE.turn ?? 0;
  } else {
    tribal.turns_at_peace = (tribal.turns_at_peace ?? 0) + 1;
  }

  const tap = tribal.turns_at_peace ?? 0;

  if (gov.power_resource?.type === 'prestige' && tap > 0) {
    gov.power_resource.current = Math.max(0, gov.power_resource.current - 3);
    gov.legitimacy = Math.round(gov.power_resource.current);
  }

  const prestige = gov.power_resource?.current ?? gov.legitimacy ?? 50;

  if (tap > 8) {
    if (tap % 4 === 0) {
      const actors = gov.actors ?? [];
      if (actors.length > 0) {
        const idx = Math.floor(Math.random() * actors.length);
        const advisor = actors[idx];
        if (advisor) {
          if (advisor.loyalty === undefined) advisor.loyalty = 50;
          advisor.loyalty = Math.max(0, advisor.loyalty - 5);
          if (isPlayer) addEventLog(`🏕️ «${advisor.name ?? 'Советник'}» сомневается.`, 'warning');
        }
      } else if (isPlayer) {
        addEventLog(`🏕️ Совет старейшин ропщет: вождь ${tap} ходов без войны.`, 'warning');
      }
    }
    if (tap % 4 === 1 && isPlayer) {
      addEventLog(`⚠️ Недовольство совета: уже ${tap} ходов без набегов.`, 'warning');
    }
  }

  if (prestige < 20 && isPlayer && (GAME_STATE.turn ?? 0) % 3 === 0) {
    addEventLog(`🔴 Престиж вождя упал до ${Math.round(prestige)}!`, 'danger');
  }

  if (prestige < 10 && !tribal.rival_challenge) {
    const rivalNames = ['Бренн', 'Верцингеторикс', 'Думнориг', 'Каск', 'Орикс', 'Таравис'];
    const rivalName  = rivalNames[Math.floor(Math.random() * rivalNames.length)];
    tribal.rival_challenge = {
      rival_name: rivalName,
      issued_turn: GAME_STATE.turn ?? 0,
      expires_turn: (GAME_STATE.turn ?? 0) + 5,
    };
    if (isPlayer) addEventLog(`⚔️ Вождь ${rivalName} бросает вызов!`, 'danger');
  }

  if (tribal.rival_challenge) {
    const ch = tribal.rival_challenge;
    if ((GAME_STATE.turn ?? 0) >= ch.expires_turn) {
      gov.stability  = Math.max(0, (gov.stability ?? 50) - 30);
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 25);
      if (gov.power_resource) gov.power_resource.current = Math.max(0, gov.power_resource.current - 25);
      tribal.rival_challenge = null;
      tribal.turns_at_peace  = 0;
      if (isPlayer) addEventLog(`😔 Вождь ${ch.rival_name} захватил часть влияния.`, 'danger');
    }
  }

  if (gov._raid_declared) {
    gov._raid_declared = false;
    tribal.turns_at_peace = 0;
    if (gov.power_resource?.type === 'prestige') {
      gov.power_resource.current = Math.min(
        gov.power_resource.max ?? 100,
        gov.power_resource.current + 15
      );
      gov.legitimacy = Math.round(gov.power_resource.current);
    }
    if (tribal.rival_challenge) {
      if (isPlayer) addEventLog(`⚔️ Набег объявлен! Вызов от ${tribal.rival_challenge.rival_name} снят.`, 'military');
      tribal.rival_challenge = null;
    }
    if (isPlayer) addEventLog(`⚔️ Набег объявлен. Воины воодушевлены. Престиж +15.`, 'military');
  }
}

// ── Вспомогательные функции ───────────────────────────────────────────
function makeTribalNation(overrides = {}) {
  return {
    government: {
      type: 'tribal',
      legitimacy: 60,
      stability: 70,
      power_resource: { type: 'prestige', current: 60, max: 100, decay_per_turn: 1 },
      actors: [
        { name: 'Старейшина Горг', loyalty: 70 },
        { name: 'Воевода Каррак', loyalty: 80 },
      ],
      tribal: {},
      ...overrides.government,
    },
    military: { at_war_with: [], ...overrides.military },
    population: { happiness: 55, total: 5000, growth_rate: 0.003 },
    economy: { treasury: 500 },
    ...overrides,
  };
}

function runTurns(nation, nationId, count, isPlayer = true) {
  for (let i = 0; i < count; i++) {
    GAME_STATE.turn++;
    processTribalTick(nation, nationId, isPlayer);
  }
}

// ── Утилита assert ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertApprox(a, b, tolerance, label) {
  assert(Math.abs(a - b) <= tolerance, `${label} (got ${a}, expected ~${b})`);
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 1 — Инициализация: turns_at_peace = 0 для воюющей нации
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 1: Инициализация turns_at_peace при войне');
{
  GAME_STATE.turn = 0;
  _logs.length = 0;
  const n = makeTribalNation({ military: { at_war_with: ['enemy_rome'] } });
  processTribalTick(n, 'tribe_a', true);
  assert(n.government.tribal.turns_at_peace === 0, 'turns_at_peace = 0 при активной войне');
  assert(n.government._last_war_turn === 0, '_last_war_turn обновляется в ход войны');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 2 — Счётчик мирных ходов растёт
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 2: Счётчик мирных ходов');
{
  GAME_STATE.turn = 10;
  _logs.length = 0;
  const n = makeTribalNation();
  processTribalTick(n, 'tribe_a', false);
  assert(n.government.tribal.turns_at_peace === 1, 'После 1 мирного хода: turns_at_peace = 1');
  processTribalTick(n, 'tribe_a', false);
  assert(n.government.tribal.turns_at_peace === 2, 'После 2 мирных ходов: turns_at_peace = 2');
  // Война — сбрасывает счётчик
  n.military.at_war_with = ['enemy'];
  processTribalTick(n, 'tribe_a', false);
  assert(n.government.tribal.turns_at_peace === 0, 'Война сбрасывает turns_at_peace в 0');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 3 — Престиж падает на 3 каждый мирный ход
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 3: Падение престижа без войны');
{
  GAME_STATE.turn = 20;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 60;
  processTribalTick(n, 'tribe_a', false); // ход 1
  assert(n.government.power_resource.current === 57, 'Ход 1: престиж 60 → 57');
  processTribalTick(n, 'tribe_a', false); // ход 2
  assert(n.government.power_resource.current === 54, 'Ход 2: престиж 57 → 54');
  // Война — НЕ падает в следующий ход
  n.military.at_war_with = ['enemy'];
  const preWar = n.government.power_resource.current;
  processTribalTick(n, 'tribe_a', false);
  assert(n.government.tribal.turns_at_peace === 0, 'Во время войны turns_at_peace = 0');
  // prestige может не меняться (tap = 0 → условие tap > 0 не выполняется)
  assert(n.government.power_resource.current === preWar, 'Во время войны престиж не падает');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 4 — Лояльность советника падает при tap > 8 и tap % 4 === 0
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 4: Падение лояльности советника при долгом мире');
{
  GAME_STATE.turn = 30;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.tribal.turns_at_peace = 11; // уже 11 ходов мира
  n.government.power_resource.current = 30; // достаточно высокий для отсутствия вызова
  // tap после processTribalTick станет 12 — 12 % 4 === 0 → лояльность падает
  const initialLoyalties = n.government.actors.map(a => a.loyalty);
  processTribalTick(n, 'tribe_a', true);
  const tap12 = n.government.tribal.turns_at_peace;
  assert(tap12 === 12, 'turns_at_peace = 12 после хода');
  const anyChanged = n.government.actors.some((a, i) => a.loyalty < initialLoyalties[i]);
  assert(anyChanged, 'Лояльность хотя бы одного советника снизилась');
  const warnLog = _logs.some(l => l.type === 'warning');
  assert(warnLog, 'Лог предупреждения о сомнении советника записан');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 5 — Rival_challenge появляется при prestige < 10
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 5: Автоматический вызов от соперника при prestige < 10');
{
  GAME_STATE.turn = 50;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 5; // очень низкий престиж
  n.government.legitimacy = 5;
  processTribalTick(n, 'tribe_a', true);
  assert(n.government.tribal.rival_challenge !== null &&
         n.government.tribal.rival_challenge !== undefined,
    'rival_challenge создан при prestige < 10');
  assert(typeof n.government.tribal.rival_challenge.rival_name === 'string',
    'rival_challenge содержит имя соперника');
  assert(n.government.tribal.rival_challenge.expires_turn === GAME_STATE.turn + 5,
    'expires_turn = текущий ход + 5');
  const challengeLog = _logs.some(l => l.type === 'danger' && l.msg.includes('бросает вызов'));
  assert(challengeLog, 'Лог опасности о вызове записан');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 6 — Набег сбрасывает turns_at_peace и восстанавливает престиж
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 6: Набег восстанавливает престиж и сбрасывает счётчик');
{
  GAME_STATE.turn = 60;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 25;
  n.government.tribal.turns_at_peace = 15;
  n.government._raid_declared = true;
  processTribalTick(n, 'tribe_a', true);
  assert(n.government.tribal.turns_at_peace === 0, 'turns_at_peace сброшен до 0 после набега');
  // Порядок в processTribalTick: сначала decay (tap=16, -3), потом raid (+15): 25-3+15=37
  assert(n.government.power_resource.current === 37, 'Престиж: 25 → 22 (decay −3) → 37 (raid +15)');
  assert(n.government._raid_declared === false, '_raid_declared сброшен');
  const raidLog = _logs.some(l => l.msg.includes('Набег объявлен'));
  assert(raidLog, 'Лог о набеге записан');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 7 — Вызов истекает автоматически → штрафы
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 7: Автоматические штрафы при истечении вызова');
{
  GAME_STATE.turn = 70;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.stability = 60;
  n.government.legitimacy = 50;
  n.government.power_resource.current = 8; // < 10 → создаст challenge
  // Принудительно ставим истекший вызов
  n.government.tribal.rival_challenge = {
    rival_name: 'Бренн',
    issued_turn: 65,
    expires_turn: 70, // истекает прямо сейчас
  };
  processTribalTick(n, 'tribe_a', true);
  assert(n.government.tribal.rival_challenge === null, 'rival_challenge сброшен после истечения');
  assert(n.government.stability <= 30, 'Стабильность снизилась (было 60, -30 = ≤30)');
  const yieldLog = _logs.some(l => l.msg.includes('захватил часть влияния'));
  assert(yieldLog, 'Лог о захвате влияния записан');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 8 — Комплексный тест: полная цепочка мир → упадок → вызов
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 8 (Интеграция): полная цепочка мир → упадок → вызов');
{
  GAME_STATE.turn = 100;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 60;
  n.government.tribal.turns_at_peace = 0;

  // 20 мирных ходов — престиж должен упасть ниже 10
  for (let i = 0; i < 20; i++) {
    GAME_STATE.turn++;
    if (n.government.tribal.rival_challenge) break; // вызов уже появился
    processTribalTick(n, 'tribe_a', true);
  }

  const finalPrestige = n.government.power_resource.current;
  assert(finalPrestige < 60, `Престиж упал ниже начального 60 (сейчас: ${finalPrestige})`);

  // Ход 17: 60 - 3×17 = 9 < 10 → вызов должен появиться
  const challengeAppeared = n.government.tribal.rival_challenge !== null &&
                            n.government.tribal.rival_challenge !== undefined;
  const turnsRun = n.government.tribal.turns_at_peace;
  // К моменту вызова престиж должен быть < 10
  assert(challengeAppeared || finalPrestige >= 10,
    `Вызов появился при низком престиже (prestige=${finalPrestige}, tap=${turnsRun})`);

  const warningLogs = _logs.filter(l => l.type === 'warning' || l.type === 'danger');
  assert(warningLogs.length > 0, 'Предупреждения и опасные события записаны');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 9 — Краш-тест: нация без power_resource
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 9 (Краш): нация без power_resource');
{
  GAME_STATE.turn = 200;
  _logs.length = 0;
  const n = makeTribalNation();
  delete n.government.power_resource;
  n.government.legitimacy = 30;
  let crashed = false;
  try {
    processTribalTick(n, 'tribe_a', true);
    processTribalTick(n, 'tribe_a', true);
    processTribalTick(n, 'tribe_a', true);
  } catch (e) {
    crashed = true;
    console.error('  CRASH:', e.message);
  }
  assert(!crashed, 'Нет краша без power_resource (использует legitimacy как fallback)');
  assert(typeof n.government.tribal.turns_at_peace === 'number', 'turns_at_peace инициализирован');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 10 — Краш-тест: нация без actors (нет советников)
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 10 (Краш): нация без советников (actors = [])');
{
  GAME_STATE.turn = 210;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.actors = [];
  n.government.tribal.turns_at_peace = 12; // > 8 и % 4 === 0 сработает при следующем ходе
  let crashed = false;
  try {
    for (let i = 0; i < 5; i++) {
      GAME_STATE.turn++;
      processTribalTick(n, 'tribe_a', true);
    }
  } catch (e) {
    crashed = true;
    console.error('  CRASH:', e.message);
  }
  assert(!crashed, 'Нет краша при пустом массиве actors');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 11 — Краш-тест: нация без military
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 11 (Краш): нация без military объекта');
{
  GAME_STATE.turn = 220;
  _logs.length = 0;
  const n = makeTribalNation();
  delete n.military;
  let crashed = false;
  try {
    for (let i = 0; i < 3; i++) {
      GAME_STATE.turn++;
      processTribalTick(n, 'tribe_a', true);
    }
  } catch (e) {
    crashed = true;
    console.error('  CRASH:', e.message);
  }
  assert(!crashed, 'Нет краша при отсутствии military объекта');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 12 — Набег снимает активный вызов от соперника
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 12: Набег снимает активный вызов соперника');
{
  GAME_STATE.turn = 300;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 5;
  n.government.tribal.rival_challenge = {
    rival_name: 'Думнориг',
    issued_turn: 295,
    expires_turn: 305,
  };
  n.government._raid_declared = true;
  processTribalTick(n, 'tribe_a', true);
  assert(n.government.tribal.rival_challenge === null, 'Набег снял вызов соперника');
  const cancelLog = _logs.some(l => l.msg.includes('Вызов от'));
  assert(cancelLog, 'Лог об отмене вызова записан');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 13 — AI нация не спамит логами (isPlayer = false)
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 13: AI нация — нет лог-спама');
{
  GAME_STATE.turn = 400;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 5;
  n.government.tribal.turns_at_peace = 20;
  for (let i = 0; i < 10; i++) {
    GAME_STATE.turn++;
    processTribalTick(n, 'tribe_ai', false); // isPlayer = false
  }
  assert(_logs.length === 0, 'AI нация не пишет в лог событий');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 14 — Краш: gov=null не роняет функцию
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 14 (Краш): government = null');
{
  GAME_STATE.turn = 500;
  _logs.length = 0;
  const n = { government: null, military: { at_war_with: [] } };
  let crashed = false;
  try {
    processTribalTick(n, 'tribe_null', true);
  } catch (e) {
    crashed = true;
    console.error('  CRASH:', e.message);
  }
  assert(!crashed, 'Нет краша при government = null (ранний выход)');
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 15 — Интеграция: война прерывает цепочку упадка
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 15 (Интеграция): война прерывает упадок престижа');
{
  GAME_STATE.turn = 600;
  _logs.length = 0;
  const n = makeTribalNation();
  n.government.power_resource.current = 40;

  // 5 мирных ходов
  for (let i = 0; i < 5; i++) {
    GAME_STATE.turn++;
    processTribalTick(n, 'tribe_a', false);
  }
  const afterPeace = n.government.power_resource.current;
  assert(afterPeace < 40, `Престиж упал после 5 мирных ходов (${afterPeace})`);

  // Война на 3 хода
  n.military.at_war_with = ['rome'];
  for (let i = 0; i < 3; i++) {
    GAME_STATE.turn++;
    processTribalTick(n, 'tribe_a', false);
  }
  const afterWar = n.government.power_resource.current;
  assert(afterWar === afterPeace, `Во время войны престиж не падает (${afterPeace} → ${afterWar})`);
  assert(n.government.tribal.turns_at_peace === 0, 'turns_at_peace = 0 во время войны');

  // Конец войны — упадок возобновляется
  n.military.at_war_with = [];
  GAME_STATE.turn++;
  processTribalTick(n, 'tribe_a', false);
  assert(n.government.power_resource.current < afterWar, 'После войны упадок возобновился');
}

// ══════════════════════════════════════════════════════════════════════
// ИТОГ
// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`GOV_010 РЕЗУЛЬТАТ: ${passed} тестов прошло, ${failed} провалено`);
if (failed > 0) {
  console.error('❌ Есть провалы — исправьте перед коммитом!');
  process.exit(1);
} else {
  console.log('✅ Все тесты GOV_010 прошли успешно!');
}
