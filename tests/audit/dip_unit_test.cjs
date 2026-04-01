/**
 * tests/audit/dip_unit_test.cjs
 * Модуль: Дипломатия — Unit-тест
 *
 * Проверяет изолированную логику:
 *   - _calcThreatBalance: корректная детекция пограничных наций
 *   - processDiplomacyTick: бонусы НЕ должны накапливаться между ходами
 *   - _areNeighbors: должна использовать MAP_REGIONS для проверки связей
 *   - getRelationLabel: правильные метки по пороговым значениям
 *   - evalAIReceptiveness: корректный расчёт готовности AI
 *   - _relKey: симметрия ключа (A,B) == (B,A)
 *   - calcBaseRelation: итоговый score в диапазоне -100..100
 *
 * Запуск: node tests/audit/dip_unit_test.cjs
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail) {
  if (cond) {
    console.log('  \u2713 ' + msg + (detail ? ' (' + detail + ')' : ''));
    passed++;
  } else {
    console.error('  \u2717 FAIL: ' + msg + (detail ? ' (' + detail + ')' : ''));
    failed++;
  }
}
function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, msg, 'got ' + a + ', expected ~' + b + ' \xb1' + tol);
}

// ─────────────────────────────────────────────────────────────────────────────
// Мок глобального состояния
// ─────────────────────────────────────────────────────────────────────────────

let GAME_STATE;
let MAP_REGIONS;
const TURNS_PER_YEAR = 12;
const _INIT_NATION_LIMIT = 200;

function resetState() {
  MAP_REGIONS = {
    r1: { connections: ['r2'] },
    r2: { connections: ['r1', 'r3'] },
    r3: { connections: ['r2'] },
    r4: { connections: [] },
  };
  GAME_STATE = {
    turn: 1,
    player_nation: 'nation_a',
    nations: {
      nation_a: {
        name: 'Нация А', is_player: true,
        regions: ['r1'],
        population: { total: 100000 },
        military: { infantry: 500, cavalry: 100, mercenaries: 0 },
        economy: { treasury: 1000 },
        government: { type: 'republic', stability: 80 },
        culture: 'latin', religion: 'pagan',
      },
      nation_b: {
        name: 'Нация Б',
        regions: ['r2'],
        population: { total: 80000 },
        military: { infantry: 300, cavalry: 50, mercenaries: 0 },
        economy: { treasury: 500 },
        government: { type: 'republic', stability: 70 },
        culture: 'latin', religion: 'pagan',
      },
      nation_c: {
        name: 'Нация В',
        regions: ['r4'],
        population: { total: 200000 },
        military: { infantry: 2000, cavalry: 500, mercenaries: 200 },
        economy: { treasury: 5000 },
        government: { type: 'monarchy', stability: 60 },
        culture: 'germanic', religion: 'norse',
      },
    },
    diplomacy: {
      relations: {},
      treaties: [],
      dialogues: {},
    },
    regions: {},
    armies: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Копии функций из engine/diplomacy.js (изолировано для тестирования)
// ─────────────────────────────────────────────────────────────────────────────

function _relKey(a, b) {
  return [a, b].sort().join('_');
}

function getRelation(nationA, nationB) {
  const key = _relKey(nationA, nationB);
  if (!GAME_STATE.diplomacy.relations[key]) {
    GAME_STATE.diplomacy.relations[key] = {
      score: 0, war: false, truces: [], events: [], flags: {},
      last_interaction: null,
    };
  }
  const rel = GAME_STATE.diplomacy.relations[key];
  if (!rel.flags) rel.flags = {};
  return rel;
}

function getRelationScore(nationA, nationB) {
  return getRelation(nationA, nationB).score;
}

function getRelationLabel(score) {
  if (score >=  60) return { label: 'Союзник',       color: '#4caf50', icon: '\ud83d\udc9a' };
  if (score >=  30) return { label: 'Дружественный', color: '#8bc34a', icon: '\ud83d\udfe2' };
  if (score >=   5) return { label: 'Нейтральный',   color: '#9e9e9e', icon: '\u26aa' };
  if (score >= -20) return { label: 'Напряжённый',   color: '#ff9800', icon: '\ud83d\udfe1' };
  if (score >= -50) return { label: 'Враждебный',    color: '#f44336', icon: '\ud83d\udd34' };
  return               { label: 'Война',            color: '#b71c1c', icon: '\u2694' };
}

// ── Тест-копия _calcThreatBalance: ОРИГИНАЛЬНАЯ ЛОГИКА (с багом) ──────────────
function _calcThreatBalance_BUGGY(natA, natB) {
  const popA = natA.population?.total ?? 100000;
  const popB = natB.population?.total ?? 100000;
  const milA = natA.military?.size ?? natA.military?.total ?? 0;
  const milB = natB.military?.size ?? natB.military?.total ?? 0;
  const treA = Math.max(0, natA.economy?.treasury ?? 0);
  const treB = Math.max(0, natB.economy?.treasury ?? 0);

  const powerA = popA + milA * 800 + treA * 10 || 1;
  const powerB = popB + milB * 800 + treB * 10 || 1;
  const powerRatio = Math.log2(powerB / powerA);

  // БАГ: проверяет совпадение ID регионов, а не смежность
  const regA = new Set(natA.regions || []);
  const regB = new Set(natB.regions || []);
  const hasBorder = [...regA].some(r => regB.has(r));  // ВСЕГДА false
  const proximity = hasBorder ? 1.0 : 0.35;

  const offCapB = milB > 0 ? Math.min(1.0, (milB * 1000) / Math.max(popB, 1)) : 0.1;
  const threat = Math.tanh(powerRatio * proximity * offCapB * 1.8);
  return Math.round(-threat * 30);
}

// ── Тест-копия _calcThreatBalance: ИСПРАВЛЕННАЯ ЛОГИКА ───────────────────────
function _calcThreatBalance_FIXED(natA, natB) {
  const popA = natA.population?.total ?? 100000;
  const popB = natB.population?.total ?? 100000;
  const milA = natA.military?.size ?? natA.military?.total ?? 0;
  const milB = natB.military?.size ?? natB.military?.total ?? 0;
  const treA = Math.max(0, natA.economy?.treasury ?? 0);
  const treB = Math.max(0, natB.economy?.treasury ?? 0);

  const powerA = popA + milA * 800 + treA * 10 || 1;
  const powerB = popB + milB * 800 + treB * 10 || 1;
  const powerRatio = Math.log2(powerB / powerA);

  // ИСПРАВЛЕНО: проверяем смежность через MAP_REGIONS
  const regA = new Set(natA.regions || []);
  const regB = new Set(natB.regions || []);
  const hasBorder = [...regA].some(rId => {
    const conn = MAP_REGIONS?.[rId]?.connections ?? [];
    return conn.some(nb => regB.has(nb));
  });
  const proximity = hasBorder ? 1.0 : 0.35;

  const offCapB = milB > 0 ? Math.min(1.0, (milB * 1000) / Math.max(popB, 1)) : 0.1;
  const threat = Math.tanh(powerRatio * proximity * offCapB * 1.8);
  return Math.round(-threat * 30);
}

// ── Тест-копия _areNeighbors: ОРИГИНАЛЬНАЯ ЛОГИКА (с багом) ──────────────────
function _areNeighbors_BUGGY(nationA, nationB) {
  const regions = Object.values(GAME_STATE.regions ?? {});
  const regA = new Set(regions.filter(r => r.nation === nationA).map(r => r.id));
  const regB = new Set(regions.filter(r => r.nation === nationB).map(r => r.id));
  for (const r of regions) {
    if (regA.has(r.id)) {
      // БАГ: r.connections не существует в GAME_STATE.regions — всегда undefined
      for (const c of (r.connections ?? [])) {
        if (regB.has(c)) return true;
      }
    }
  }
  return false;
}

// ── Тест-копия _areNeighbors: ИСПРАВЛЕННАЯ ЛОГИКА ────────────────────────────
function _areNeighbors_FIXED(nationA, nationB) {
  const natA = GAME_STATE.nations?.[nationA];
  const natB = GAME_STATE.nations?.[nationB];
  if (!natA || !natB) return false;
  const regB = new Set(natB.regions || []);
  for (const rId of (natA.regions || [])) {
    // ИСПРАВЛЕНО: читаем connections из MAP_REGIONS
    const conn = MAP_REGIONS?.[rId]?.connections ?? [];
    if (conn.some(nb => regB.has(nb))) return true;
  }
  return false;
}

// ── Тест-копия processDiplomacyTick (ключевая часть — накопление бонусов) ─────
function processDiplomacyTick_BUGGY(nationId) {
  const turn = GAME_STATE.turn || 1;
  for (const treaty of GAME_STATE.diplomacy.treaties) {
    if (treaty.status !== 'active') continue;
    if (!treaty.parties.includes(nationId)) continue;
    if (treaty.turn_expires && turn >= treaty.turn_expires) {
      treaty.status = 'expired';
      continue;
    }
    const nation = GAME_STATE.nations[nationId];
    if (!nation) continue;
    const effects = treaty.effects || {};
    // БАГ: аккумулируем без сброса
    if (effects.trade_bonus && nation.economy) {
      nation.economy._trade_treaty_bonus = (nation.economy._trade_treaty_bonus || 0) + effects.trade_bonus;
    }
    if (effects.legitimacy_bonus && nation.population) {
      nation.population._diplomacy_legitimacy = (nation.population._diplomacy_legitimacy || 0)
        + effects.legitimacy_bonus;
    }
  }
  // Нет сброса!
}

function processDiplomacyTick_FIXED(nationId) {
  const turn = GAME_STATE.turn || 1;
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // ИСПРАВЛЕНО: сбрасываем накопленные бонусы ПЕРЕД пересчётом
  if (nation.economy)    nation.economy._trade_treaty_bonus = 0;
  if (nation.population) nation.population._diplomacy_legitimacy = 0;

  for (const treaty of GAME_STATE.diplomacy.treaties) {
    if (treaty.status !== 'active') continue;
    if (!treaty.parties.includes(nationId)) continue;
    if (treaty.turn_expires && turn >= treaty.turn_expires) {
      treaty.status = 'expired';
      continue;
    }
    const effects = treaty.effects || {};
    if (effects.trade_bonus && nation.economy) {
      nation.economy._trade_treaty_bonus = (nation.economy._trade_treaty_bonus || 0) + effects.trade_bonus;
    }
    if (effects.legitimacy_bonus && nation.population) {
      nation.population._diplomacy_legitimacy = (nation.population._diplomacy_legitimacy || 0)
        + effects.legitimacy_bonus;
    }
  }
}

function addDiplomacyEvent(nationA, nationB, delta, eventType) {
  const rel = getRelation(nationA, nationB);
  if (!rel.events) rel.events = [];
  rel.events.push({
    type: eventType || 'generic',
    delta: Math.max(-30, Math.min(30, delta)),
    turn: GAME_STATE.turn || 1,
  });
  if (rel.events.length > 80) rel.events.splice(0, rel.events.length - 80);
  const now = GAME_STATE.turn || 1;
  rel.events = rel.events.filter(ev => (now - ev.turn) <= 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// ТЕСТЫ
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== UNIT-ТЕСТЫ: Дипломатия ===\n');

// ─── Группа 1: _relKey ───────────────────────────────────────────────────────
console.log('--- 1. _relKey: симметрия ключа ---');
resetState();
assert(_relKey('nation_a', 'nation_b') === _relKey('nation_b', 'nation_a'),
  '_relKey симметричен: (A,B) == (B,A)');
assert(_relKey('a', 'b') === 'a_b', '_relKey сортирует по алфавиту');
assert(_relKey('z', 'a') === 'a_z', '_relKey: z+a → a_z');

// ─── Группа 2: getRelationLabel ──────────────────────────────────────────────
console.log('\n--- 2. getRelationLabel: пороговые значения ---');
resetState();
assert(getRelationLabel(70).label === 'Союзник',       'score=70 → Союзник');
assert(getRelationLabel(60).label === 'Союзник',       'score=60 → Союзник (граница)');
assert(getRelationLabel(59).label === 'Дружественный', 'score=59 → Дружественный');
assert(getRelationLabel(30).label === 'Дружественный', 'score=30 → Дружественный (граница)');
assert(getRelationLabel(29).label === 'Нейтральный',   'score=29 → Нейтральный');
assert(getRelationLabel(5).label  === 'Нейтральный',   'score=5  → Нейтральный (граница)');
assert(getRelationLabel(4).label  === 'Напряжённый',   'score=4  → Напряжённый');
assert(getRelationLabel(-20).label === 'Напряжённый',  'score=-20 → Напряжённый (граница)');
assert(getRelationLabel(-21).label === 'Враждебный',   'score=-21 → Враждебный');
assert(getRelationLabel(-50).label === 'Враждебный',   'score=-50 → Враждебный (граница)');
assert(getRelationLabel(-51).label === 'Война',        'score=-51 → Война');

// ─── Группа 3: getRelation — ленивая инициализация ──────────────────────────
console.log('\n--- 3. getRelation: ленивая инициализация ---');
resetState();
const rel = getRelation('nation_a', 'nation_b');
assert(rel !== undefined && rel !== null, 'getRelation создаёт запись при отсутствии');
assert(rel.score === 0,  'Начальный score = 0');
assert(rel.war === false, 'Начальное war = false');
assert(Array.isArray(rel.truces), 'truces — массив');
assert(typeof rel.flags === 'object', 'flags — объект');
// Повторный вызов возвращает тот же объект
const rel2 = getRelation('nation_b', 'nation_a');
rel.score = 42;
assert(rel2.score === 42, 'getRelation возвращает один объект для (A,B) и (B,A)');

// ─── Группа 4: БАГ — _calcThreatBalance: hasBorder всегда false ──────────────
console.log('\n--- 4. БАГ: _calcThreatBalance: hasBorder в оригинале всегда false ---');
resetState();
// nation_a (r1) и nation_b (r2) — смежны по MAP_REGIONS: r1.connections=[r2]
const natA = GAME_STATE.nations.nation_a;
const natB = GAME_STATE.nations.nation_b;

// Проверяем баг: оригинал всегда использует proximity=0.35
const threatBuggy   = _calcThreatBalance_BUGGY(natA, natB);
const threatFixed   = _calcThreatBalance_FIXED(natA, natB);

// Для соседних наций (r1 смежен с r2) proximity должно быть 1.0 в fixed,
// а в buggy — всегда 0.35. Значения угрозы должны ОТЛИЧАТЬСЯ.
// (Для nation_a→nation_b: нации сопоставимы, угроза умеренная)
assert(
  threatBuggy !== threatFixed,
  'БАГ подтверждён: _calcThreatBalance_BUGGY и FIXED дают разные результаты для соседей',
  'buggy=' + threatBuggy + ' fixed=' + threatFixed
);

// Дополнительно: для несоседних наций (nation_a r1, nation_c r4 — нет связи) результат должен совпадать
const natC = GAME_STATE.nations.nation_c;
const threatBuggyAC = _calcThreatBalance_BUGGY(natA, natC);
const threatFixedAC = _calcThreatBalance_FIXED(natA, natC);
assert(
  threatBuggyAC === threatFixedAC,
  'Для несоседних наций BUGGY == FIXED (proximity одинаков = 0.35)',
  'both=' + threatBuggyAC
);

// Проверяем математику: соседние нации угрожают больше при одинаковой мощи
// (proximity 1.0 vs 0.35 → более сильный сигнал угрозы)
assert(
  Math.abs(threatFixed) >= Math.abs(threatBuggy),
  'Исправленная версия: угроза от соседа >= угрозы от дальнего при прочих равных',
  'fixed=' + Math.abs(threatFixed) + ' buggy=' + Math.abs(threatBuggy)
);

// ─── Группа 5: БАГ — _areNeighbors: не находит соседей через GAME_STATE.regions ──
console.log('\n--- 5. БАГ: _areNeighbors не находит соседей без MAP_REGIONS ---');
resetState();
// Добавляем регионы в GAME_STATE.regions (без поля connections — как есть в игре)
GAME_STATE.regions = {
  r1: { id: 'r1', name: 'Регион 1', nation: 'nation_a' },
  r2: { id: 'r2', name: 'Регион 2', nation: 'nation_b' },
};
// Баг: GAME_STATE.regions не имеет connections → всегда false
const buggyResult = _areNeighbors_BUGGY('nation_a', 'nation_b');
assert(buggyResult === false, 'БАГ подтверждён: _areNeighbors_BUGGY возвращает false для соседей');

// Исправление: читает connections из MAP_REGIONS → должно вернуть true
const fixedResult = _areNeighbors_FIXED('nation_a', 'nation_b');
assert(fixedResult === true,  'ИСПРАВЛЕНО: _areNeighbors_FIXED возвращает true для смежных наций');

// Несмежные нации: nation_a (r1) и nation_c (r4) — r1.connections не содержит r4
const fixedNoNeighbor = _areNeighbors_FIXED('nation_a', 'nation_c');
assert(fixedNoNeighbor === false, '_areNeighbors_FIXED: несмежные нации → false');

// ─── Группа 6: БАГ — processDiplomacyTick накапливает бонусы ─────────────────
console.log('\n--- 6. БАГ: processDiplomacyTick накапливает _trade_treaty_bonus ---');
resetState();
// Добавляем активный торговый договор
GAME_STATE.diplomacy.treaties.push({
  id: 'treaty_test_1',
  type: 'trade_agreement',
  status: 'active',
  parties: ['nation_a', 'nation_b'],
  turn_signed: 1,
  turn_expires: null,
  effects: { trade_bonus: 0.15, market_access: true },
  conditions: {},
});

// Первый ход
processDiplomacyTick_BUGGY('nation_a');
const bonusAfter1Turn = GAME_STATE.nations.nation_a.economy._trade_treaty_bonus;

// Второй ход (без сброса — баг накапливает)
processDiplomacyTick_BUGGY('nation_a');
const bonusAfter2Turns = GAME_STATE.nations.nation_a.economy._trade_treaty_bonus;

assert(
  bonusAfter2Turns > bonusAfter1Turn,
  'БАГ подтверждён: бонус накапливается (' + bonusAfter1Turn + ' → ' + bonusAfter2Turns + ')'
);
assert(
  Math.abs(bonusAfter2Turns - 0.30) < 0.001,
  'После 2 ходов без сброса: bonus = 0.30 (накоплено)',
  'got ' + bonusAfter2Turns
);

// Исправление: сброс перед пересчётом
resetState();
GAME_STATE.diplomacy.treaties.push({
  id: 'treaty_test_1',
  type: 'trade_agreement',
  status: 'active',
  parties: ['nation_a', 'nation_b'],
  turn_signed: 1,
  turn_expires: null,
  effects: { trade_bonus: 0.15, market_access: true },
  conditions: {},
});

processDiplomacyTick_FIXED('nation_a');
const fixedBonus1 = GAME_STATE.nations.nation_a.economy._trade_treaty_bonus;
processDiplomacyTick_FIXED('nation_a');
const fixedBonus2 = GAME_STATE.nations.nation_a.economy._trade_treaty_bonus;

assert(
  Math.abs(fixedBonus1 - 0.15) < 0.001,
  'ИСПРАВЛЕНО: после 1 хода bonus = 0.15',
  'got ' + fixedBonus1
);
assert(
  Math.abs(fixedBonus2 - 0.15) < 0.001,
  'ИСПРАВЛЕНО: после 2 ходов bonus всё ещё = 0.15 (сброс работает)',
  'got ' + fixedBonus2
);

// ─── Группа 7: addDiplomacyEvent — ограничение 80 событий ───────────────────
console.log('\n--- 7. addDiplomacyEvent: ограничение истории ---');
resetState();
for (let i = 0; i < 90; i++) {
  GAME_STATE.turn = i + 1;
  addDiplomacyEvent('nation_a', 'nation_b', 5, 'gift');
}
const rel7 = getRelation('nation_a', 'nation_b');
// Последний ход = 90, MAX_AGE = 50, поэтому события с хода <= 40 отфильтрованы
// Проверяем, что не более 80 (базовый лимит)
assert(rel7.events.length <= 80, 'История событий ≤ 80 записей', 'len=' + rel7.events.length);

// ─── Группа 8: addDiplomacyEvent — clamp delta [-30, +30] ────────────────────
console.log('\n--- 8. addDiplomacyEvent: delta clamp ---');
resetState();
GAME_STATE.turn = 1;
addDiplomacyEvent('nation_a', 'nation_b', 999, 'test');
const rel8 = getRelation('nation_a', 'nation_b');
assert(rel8.events[0].delta === 30, 'delta clamp: 999 → 30');
addDiplomacyEvent('nation_a', 'nation_b', -999, 'test');
assert(rel8.events[1].delta === -30, 'delta clamp: -999 → -30');

// ─────────────────────────────────────────────────────────────────────────────
// Итог
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n==============================');
console.log('Результат: ' + passed + ' прошло, ' + failed + ' провалено');
if (failed > 0) {
  console.error('ТЕСТЫ НЕ ПРОШЛИ');
  process.exit(1);
} else {
  console.log('ВСЕ ТЕСТЫ ПРОШЛИ');
  process.exit(0);
}
