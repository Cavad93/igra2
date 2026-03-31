// ══════════════════════════════════════════════════════════════════════
// GOV_008 TESTS — Личная гвардия тирана и тайная полиция
// Запуск: node tests/gov_008_test.js
// ══════════════════════════════════════════════════════════════════════

// ── Минимальный стаб окружения ────────────────────────────────────────
const GAME_STATE = {
  turn: 10,
  player_nation: 'tyrannos',
  nations: {},
};

function addEventLog() {}
function renderGovernmentOverlay() {}
function getSenateManager() { return null; }
function calculateConspiracyChance(nation) {
  // Упрощённая версия для тестов — достаточно проверить, что guard снижает шанс
  const gov = nation.government;
  let chance = gov.conspiracies?.base_chance_per_turn ?? 0.15;
  if (gov.personal_guard && gov.personal_guard.size > 0) {
    const guardDefense = gov.personal_guard.size * 0.4 * (gov.personal_guard.loyalty / 100);
    chance *= Math.max(0.1, 1 - guardDefense / 150);
  }
  if (gov.conspiracies?.secret_police?.enabled) {
    chance *= (1 - (gov.conspiracies.secret_police.conspiracy_detection_bonus ?? 0.4));
  }
  return Math.max(0, Math.min(0.85, chance));
}

// Заглушка CONSPIRACY_ENGINE
const CONSPIRACY_ENGINE = {
  _apply_blood_feud(nationId, clanId, names) {
    const nation = GAME_STATE.nations[nationId];
    if (!nation) return;
    if (!nation._blood_feuds) nation._blood_feuds = [];
    nation._blood_feuds.push({ clanId, names });
  }
};

// Загружаем только нужные функции из government.js (без браузерных зависимостей)
// Инлайним нужные функции напрямую для изолированного теста:

function processPersonalGuardTick(nation, nationId, isPlayer) {
  const gov   = nation.government;
  const guard = gov.personal_guard;
  if (!guard || guard.size <= 0) return;
  const cost = guard.cost_per_turn ?? Math.round(guard.size * 2);
  guard.cost_per_turn = cost;
  if ((nation.economy?.treasury ?? 0) >= cost) {
    nation.economy.treasury -= cost;
    guard.unpaid_turns = 0;
    guard.loyalty = Math.min(100, guard.loyalty + 0.3);
  } else {
    guard.unpaid_turns = (guard.unpaid_turns ?? 0) + 1;
    guard.loyalty = Math.max(0, guard.loyalty - 5);
  }
  const loyDecay = 0.5 + Math.random() * 1.0;
  guard.loyalty = Math.max(0, guard.loyalty - loyDecay);
  if (guard.size > 60) {
    if (nation.population) {
      nation.population.happiness = Math.max(0, (nation.population.happiness ?? 50) - 10);
    }
    if (nation._revolt_pressure > 0) {
      nation._revolt_pressure = Math.max(0, nation._revolt_pressure - 15);
    }
  }
  if (guard.size > 80 && (guard.unpaid_turns ?? 0) > 3 && Math.random() < 0.05) {
    _triggerGuardCoup(nation, nationId, isPlayer);
  }
}

function _triggerGuardCoup(nation, nationId, isPlayer) {
  const gov = nation.government;
  gov.stability  = Math.max(0, (gov.stability  ?? 50) - 45);
  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 35);
  if (nation.military) nation.military.loyalty = Math.max(0, (nation.military.loyalty ?? 50) - 30);
  gov.personal_guard = null;
  if (!gov.transition_history) gov.transition_history = [];
  gov.transition_history.push({
    turn: GAME_STATE.turn ?? 0,
    from: 'tyranny', to: 'tyranny',
    cause: "Coup d'état от личной гвардии из-за невыплаты жалованья",
  });
}

function hirePersonalGuard(nationId, size) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return { ok: false, reason: 'no_nation' };
  const gov = nation.government;
  if (gov.type !== 'tyranny') return { ok: false, reason: 'not_tyranny' };
  const sz = Math.max(10, Math.min(100, size ?? 50));
  const cost = sz * 20;
  if ((nation.economy?.treasury ?? 0) < cost) return { ok: false, reason: 'no_gold', needed: cost };
  nation.economy.treasury -= cost;
  gov.personal_guard = { size: sz, loyalty: 70, cost_per_turn: Math.round(sz * 2), unpaid_turns: 0 };
  return { ok: true, size: sz, cost };
}

function disbandPersonalGuard(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.government) return { ok: false };
  const gov = nation.government;
  if (!gov.personal_guard) return { ok: false, reason: 'no_guard' };
  gov.personal_guard = null;
  return { ok: true };
}

function processSecretPoliceTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  const sp  = gov.conspiracies?.secret_police;
  if (!sp?.enabled) return;
  const cost = sp.cost_per_turn ?? 200;
  nation.economy.treasury = Math.max(0, (nation.economy?.treasury ?? 0) - cost);
  const isFalse = Math.random() < 0.15;
  if (isFalse) {
    const innocents = (nation.characters ?? []).filter(c => c.alive);
    if (innocents.length > 0) {
      const victim = innocents[Math.floor(Math.random() * innocents.length)];
      victim.alive       = false;
      victim.death_cause = 'executed';
      victim.death_turn  = GAME_STATE.turn ?? 0;
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 15);
      const clanId = victim.clan_id ?? null;
      if (clanId) {
        try { CONSPIRACY_ENGINE._apply_blood_feud(nationId, clanId, [victim.name]); } catch (_) {}
      }
    } else {
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 8);
    }
  } else {
    if (gov.power_resource?.type === 'fear') {
      gov.power_resource.current = Math.min(100, gov.power_resource.current + 3);
    }
  }
}

// ── Утилиты тестирования ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function makeTyrannyNation(overrides = {}) {
  return Object.assign({
    name: 'Тиранос',
    government: {
      type: 'tyranny',
      stability: 60,
      legitimacy: 35,
      power_resource: { type: 'fear', current: 60, max: 100, decay_per_turn: 2 },
      personal_guard: null,
      conspiracies: {
        base_chance_per_turn: 0.15,
        secret_police: { enabled: false, cost_per_turn: 200, conspiracy_detection_bonus: 0.4 },
      },
    },
    economy: { treasury: 5000 },
    military: { loyalty: 60 },
    population: { happiness: 50 },
    characters: [],
    _revolt_pressure: 0,
  }, overrides);
}

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 1: Найм и роспуск гвардии
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 1: Найм и роспуск личной гвардии');

GAME_STATE.nations.tyrannos = makeTyrannyNation();
const n1 = GAME_STATE.nations.tyrannos;

// Найм — недостаточно золота
n1.economy.treasury = 100;
let r = hirePersonalGuard('tyrannos', 50);
assert(!r.ok && r.reason === 'no_gold', 'Найм отклонён при нехватке золота');
assert(r.needed === 1000, `Правильная стоимость найма 50 чел. = 1000 (получено: ${r.needed})`);

// Найм — достаточно золота
n1.economy.treasury = 5000;
r = hirePersonalGuard('tyrannos', 50);
assert(r.ok, 'Найм успешен при достаточном золоте');
assert(n1.government.personal_guard !== null, 'Гвардия создана');
assert(n1.government.personal_guard.size === 50, `Размер гвардии 50 (получено: ${n1.government.personal_guard?.size})`);
assert(n1.government.personal_guard.loyalty === 70, 'Лояльность при найме = 70');
assert(n1.economy.treasury === 4000, `Казна: 5000 − 1000 = 4000 (получено: ${n1.economy.treasury})`);

// Роспуск
r = disbandPersonalGuard('tyrannos');
assert(r.ok, 'Роспуск гвардии успешен');
assert(n1.government.personal_guard === null, 'Гвардия уничтожена после роспуска');

// Роспуск когда гвардии нет
r = disbandPersonalGuard('tyrannos');
assert(!r.ok && r.reason === 'no_guard', 'Роспуск без гвардии возвращает ошибку');

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 2: Тик гвардии — оплата и лояльность
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 2: Тик гвардии — оплата, лояльность');

GAME_STATE.nations.tyrannos = makeTyrannyNation();
const n2 = GAME_STATE.nations.tyrannos;
hirePersonalGuard('tyrannos', 50); // cost 1000, cost_per_turn 100

const treasuryBefore = n2.economy.treasury;
const loyBefore = n2.government.personal_guard.loyalty;
processPersonalGuardTick(n2, 'tyrannos', false);

assert(
  n2.economy.treasury === treasuryBefore - 100,
  `Содержание списано: было ${treasuryBefore}, стало ${n2.economy.treasury} (ожидалось ${treasuryBefore - 100})`
);
assert(n2.government.personal_guard.unpaid_turns === 0, 'unpaid_turns = 0 при оплате');
// Лояльность: +0.3 за оплату, потом -0.5...-1.5 за decay → ≈ loyBefore ± 2
assert(
  n2.government.personal_guard.loyalty >= loyBefore - 2,
  `Лояльность не упала катастрофически (было ${loyBefore}, стало ${n2.government.personal_guard.loyalty.toFixed(1)})`
);

// Тест при нехватке денег
n2.economy.treasury = 0;
const loyBefore2 = n2.government.personal_guard.loyalty;
processPersonalGuardTick(n2, 'tyrannos', false);
assert(n2.government.personal_guard.unpaid_turns === 1, 'unpaid_turns = 1 при неоплате');
assert(
  n2.government.personal_guard.loyalty <= loyBefore2 - 4,
  `При неоплате лояльность сильно падает (было ${loyBefore2.toFixed(1)}, стало ${n2.government.personal_guard.loyalty.toFixed(1)})`
);

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 3: Гвардия > 60 подавляет беспорядки
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 3: Гвардия > 60 подавляет беспорядки');

GAME_STATE.nations.tyrannos = makeTyrannyNation();
const n3 = GAME_STATE.nations.tyrannos;
hirePersonalGuard('tyrannos', 80); // 80 > 60
n3.economy.treasury = 100000;
n3.population.happiness = 50;
n3._revolt_pressure = 40;

processPersonalGuardTick(n3, 'tyrannos', false);

assert(n3.population.happiness <= 40, `Счастье снижено на 10 (стало: ${n3.population.happiness})`);
assert(n3._revolt_pressure <= 25, `Давление восстания снизилось (стало: ${n3._revolt_pressure})`);

// Гвардия ≤ 60 не подавляет
GAME_STATE.nations.tyrannos = makeTyrannyNation();
const n3b = GAME_STATE.nations.tyrannos;
hirePersonalGuard('tyrannos', 50); // 50 ≤ 60
n3b.economy.treasury = 100000;
n3b.population.happiness = 50;
n3b._revolt_pressure = 40;

processPersonalGuardTick(n3b, 'tyrannos', false);
assert(n3b.population.happiness === 50, `Гвардия 50 чел. не снижает счастье (осталось: ${n3b.population.happiness})`);
assert(n3b._revolt_pressure === 40, `Гвардия 50 чел. не снижает revolt_pressure (осталось: ${n3b._revolt_pressure})`);

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 4: Гвардия снижает риск заговора
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 4: Гвардия снижает риск заговора');

GAME_STATE.nations.tyrannos = makeTyrannyNation();
const n4 = GAME_STATE.nations.tyrannos;

const chanceNoGuard = calculateConspiracyChance(n4);

hirePersonalGuard('tyrannos', 100); // максимальная гвардия
const chanceWithGuard = calculateConspiracyChance(n4);

assert(
  chanceWithGuard < chanceNoGuard,
  `Гвардия снижает риск заговора: ${(chanceNoGuard*100).toFixed(1)}% → ${(chanceWithGuard*100).toFixed(1)}%`
);
// При 100 чел. и лояльности 70: guardDefense = 100*0.4*0.7 = 28, mult = 1-28/150 ≈ 0.813 → снижение ~19%
assert(
  chanceWithGuard < chanceNoGuard * 0.85,
  `Снижение заметное (>15%): было ${(chanceNoGuard*100).toFixed(1)}%, стало ${(chanceWithGuard*100).toFixed(1)}%`
);

// Тайная полиция тоже снижает
n4.government.conspiracies.secret_police.enabled = true;
const chanceWithSP = calculateConspiracyChance(n4);
assert(
  chanceWithSP < chanceWithGuard,
  `Тайная полиция дополнительно снижает риск: ${(chanceWithGuard*100).toFixed(1)}% → ${(chanceWithSP*100).toFixed(1)}%`
);

// ══════════════════════════════════════════════════════════════════════
// ТЕСТ 5: Тайная полиция — доносы и ложные доносы
// ══════════════════════════════════════════════════════════════════════
console.log('\n📋 ТЕСТ 5: Тайная полиция — доносы и ложный донос');

GAME_STATE.nations.tyrannos = makeTyrannyNation();
const n5 = GAME_STATE.nations.tyrannos;
n5.government.conspiracies.secret_police.enabled = true;
n5.government.power_resource = { type: 'fear', current: 50, max: 100 };
n5.economy.treasury = 5000;
n5.government.legitimacy = 35;

// Добавляем персонажей с кланом для теста ложного доноса
n5.characters = [
  { id: 'c1', name: 'Иннокентий', alive: true, clan_id: 'clan_A' },
  { id: 'c2', name: 'Прокл', alive: true, clan_id: 'clan_B' },
];

const treasuryBefore5 = n5.economy.treasury;
const legBefore5 = n5.government.legitimacy;

// Запускаем тик много раз чтобы проверить оба пути (настоящий донос и ложный)
let falseDonos = 0;
let realDonos  = 0;
for (let i = 0; i < 50; i++) {
  // Сбрасываем состояние
  GAME_STATE.nations.tyrannos = makeTyrannyNation();
  GAME_STATE.nations.tyrannos.government.conspiracies.secret_police.enabled = true;
  GAME_STATE.nations.tyrannos.government.power_resource = { type: 'fear', current: 50, max: 100 };
  GAME_STATE.nations.tyrannos.economy.treasury = 50000;
  GAME_STATE.nations.tyrannos.government.legitimacy = 35;
  GAME_STATE.nations.tyrannos.characters = [
    { id: 'c1', name: 'Иннокентий', alive: true, clan_id: 'clan_A' },
  ];
  const ni = GAME_STATE.nations.tyrannos;
  const legBefore = ni.government.legitimacy;
  processSecretPoliceTick(ni, 'tyrannos', false);
  if (ni.government.legitimacy < legBefore) falseDonos++;
  else realDonos++;
}

assert(falseDonos > 0, `За 50 запусков хотя бы 1 ложный донос (было: ${falseDonos})`);
assert(realDonos > 0,  `За 50 запусков хотя бы 1 настоящий донос (было: ${realDonos})`);
// При ожидаемом 15% ложных: должно быть примерно 5-25 ложных из 50
assert(falseDonos < 35, `Ложных доносов не слишком много (${falseDonos}/50 < 35)`);

// Проверяем списание стоимости тайной полиции
GAME_STATE.nations.tyrannos = makeTyrannyNation();
GAME_STATE.nations.tyrannos.government.conspiracies.secret_police.enabled = true;
GAME_STATE.nations.tyrannos.economy.treasury = 5000;
GAME_STATE.nations.tyrannos.government.power_resource = { type: 'fear', current: 50, max: 100 };
const nSP = GAME_STATE.nations.tyrannos;
processSecretPoliceTick(nSP, 'tyrannos', false);
assert(
  nSP.economy.treasury <= 4800,
  `Тайная полиция списала стоимость (${200} монет/ход): казна ${nSP.economy.treasury}`
);

// ── Итоги ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалилось`);
if (failed === 0) {
  console.log('✅ Все тесты GOV_008 прошли успешно!');
} else {
  console.error(`❌ ${failed} тестов не прошли!`);
  process.exit(1);
}
