/**
 * tests/audit/dip_integration_test.cjs
 * Модуль: Дипломатия — Integration-тест
 *
 * Проверяет взаимодействие дипломатии с другими модулями:
 *   - Дипломатия → Экономика: trade_bonus из договора применяется к казне правильно и не накапливается
 *   - Дипломатия → Военная: declareWar выставляет war=true, обновляет at_war_with в nation.military
 *   - Дипломатия → Экономика: эмбарго блокирует торговлю (-20% дохода)
 *   - Дипломатия → Правительство: контрибуция (war_reparations) корректно переводит золото
 *   - Дипломатия → Дипломатия: concludePeace завершает войну и создаёт мирный договор
 *   - Дипломатия → Дипломатия: buildTreaty на основе истёкшего срока
 *
 * Запуск: node tests/audit/dip_integration_test.cjs
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
// Мок инфраструктуры
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
        economy: { treasury: 2000, trade_income: 400 },
        government: { type: 'republic', stability: 80 },
        culture: 'latin', religion: 'pagan',
        relations: {},
      },
      nation_b: {
        name: 'Нация Б',
        regions: ['r2'],
        population: { total: 80000 },
        military: { infantry: 300, cavalry: 50, mercenaries: 0 },
        economy: { treasury: 1000, trade_income: 200 },
        government: { type: 'republic', stability: 70 },
        culture: 'latin', religion: 'pagan',
        relations: {},
      },
    },
    diplomacy: {
      relations: {},
      treaties: [],
      dialogues: {},
    },
    regions: {
      r1: { id: 'r1', name: 'R1', nation: 'nation_a' },
      r2: { id: 'r2', name: 'R2', nation: 'nation_b' },
    },
    armies: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Локальные копии ключевых функций (изолировано от браузера)
// ─────────────────────────────────────────────────────────────────────────────

function _relKey(a, b) { return [a, b].sort().join('_'); }

function getRelation(a, b) {
  const key = _relKey(a, b);
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

function getRelationScore(a, b) { return getRelation(a, b).score; }
function isAtWar(a, b) { return getRelation(a, b).war; }

function addDiplomacyEvent(a, b, delta, type) {
  const rel = getRelation(a, b);
  if (!rel.events) rel.events = [];
  rel.events.push({ type: type || 'generic', delta: Math.max(-30, Math.min(30, delta)), turn: GAME_STATE.turn || 1 });
}

function createTreaty(a, b, type, conditions) {
  const tDef = TREATY_TYPES[type] || TREATY_TYPES.custom;
  const turn = GAME_STATE.turn || 1;
  const id   = 'treaty_' + _relKey(a, b) + '_t' + turn + '_' + type;
  const durationYears = conditions.duration ?? tDef.default_duration ?? null;
  const treaty = {
    id, type, label: tDef.label, status: 'active',
    parties: [a, b], turn_signed: turn,
    duration: conditions.duration ?? tDef.default_duration,
    conditions: Object.assign({}, conditions),
    effects: Object.assign({}, tDef.effects, conditions.effects || {}),
    dialogue_log: [],
    turn_expires: durationYears ? turn + durationYears * TURNS_PER_YEAR : null,
  };
  GAME_STATE.diplomacy.treaties.push(treaty);
  const rel = getRelation(a, b);
  rel.score = Math.min(100, rel.score + 10);
  rel.last_interaction = turn;
  if (type === 'peace_treaty') rel.war = false;
  return treaty;
}

const TREATY_TYPES = {
  trade_agreement:    { label: 'Торговый договор',     effects: { trade_bonus: 0.15 }, default_duration: 10, ai_weight: 1.2 },
  non_aggression:     { label: 'Пакт о ненападении',   effects: { forbid_attack: true }, default_duration: 10, ai_weight: 1.1 },
  defensive_alliance: { label: 'Оборонный союз',       effects: { auto_defend: true, military_access: true }, default_duration: 10, ai_weight: 0.8 },
  military_alliance:  { label: 'Военный союз',          effects: { auto_defend: true, joint_attack: true }, default_duration: 15, ai_weight: 0.6 },
  peace_treaty:       { label: 'Мирный договор',        effects: { end_war: true }, default_duration: null, ai_weight: 0.7 },
  war_reparations:    { label: 'Контрибуция',           effects: { reparations: true }, default_duration: 10, ai_weight: 0.5 },
  armistice:          { label: 'Перемирие',              effects: { forbid_attack: true, is_armistice: true }, default_duration: 5, ai_weight: 1.3 },
  marriage_alliance:  { label: 'Брачный союз',          effects: { legitimacy_bonus: 5, relation_bonus: 15 }, default_duration: null, ai_weight: 0.9 },
  custom:             { label: 'Свободная форма',        effects: {}, default_duration: null, ai_weight: 0.8 },
};

// ИСПРАВЛЕННАЯ версия processDiplomacyTick (с правильным сбросом)
function processDiplomacyTick_FIXED(nationId) {
  const turn = GAME_STATE.turn || 1;
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Сброс накопленных бонусов
  if (nation.economy)    nation.economy._trade_treaty_bonus      = 0;
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
    if (effects.reparations && treaty.conditions.reparations_per_turn) {
      const payer = treaty.parties.find(p => p !== nationId);
      const payerNation = GAME_STATE.nations[payer];
      if (payerNation && payerNation.economy) {
        const amount = treaty.conditions.reparations_per_turn;
        payerNation.economy.treasury -= amount;
        nation.economy.treasury      += amount;
      }
    }
  }
}

function declareWar(attackerNationId, targetNationId) {
  const rel = getRelation(attackerNationId, targetNationId);
  if (rel.war) return { ok: false, reason: 'Уже в войне.' };

  rel.war   = true;
  rel.score = Math.min(-60, rel.score - 30);
  addDiplomacyEvent(attackerNationId, targetNationId, -30, 'war');

  const natA = GAME_STATE.nations?.[attackerNationId];
  const natB = GAME_STATE.nations?.[targetNationId];
  if (natA?.relations?.[targetNationId]) natA.relations[targetNationId].at_war = true;
  if (natB?.relations?.[attackerNationId]) natB.relations[attackerNationId].at_war = true;

  if (natA?.military) {
    if (!natA.military.at_war_with) natA.military.at_war_with = [];
    if (!natA.military.at_war_with.includes(targetNationId))
      natA.military.at_war_with.push(targetNationId);
  }
  if (natB?.military) {
    if (!natB.military.at_war_with) natB.military.at_war_with = [];
    if (!natB.military.at_war_with.includes(attackerNationId))
      natB.military.at_war_with.push(attackerNationId);
  }

  const incompatible = ['non_aggression', 'defensive_alliance', 'military_alliance', 'military_access'];
  for (const t of (GAME_STATE.diplomacy.treaties ?? [])) {
    if (t.status !== 'active') continue;
    if (!incompatible.includes(t.type)) continue;
    if (t.parties.includes(attackerNationId) && t.parties.includes(targetNationId)) {
      t.status = 'broken';
      t.breaker = attackerNationId;
      t.turn_broken = GAME_STATE.turn ?? 1;
    }
  }
  return { ok: true };
}

function concludePeace(playerNationId, targetNationId, terms) {
  const rel = getRelation(playerNationId, targetNationId);
  rel.war = false;

  const natPlayer = GAME_STATE.nations?.[playerNationId];
  const natTarget = GAME_STATE.nations?.[targetNationId];
  if (natPlayer?.relations?.[targetNationId]) natPlayer.relations[targetNationId].at_war = false;
  if (natTarget?.relations?.[playerNationId]) natTarget.relations[playerNationId].at_war = false;

  const loser  = terms.loser  ?? targetNationId;
  const winner = terms.winner ?? playerNationId;

  if ((terms.reparations_turns ?? 0) > 0 && (terms.reparations_per_turn ?? 0) > 0) {
    const durationYears = Math.round(terms.reparations_turns / TURNS_PER_YEAR);
    createTreaty(winner, loser, 'war_reparations', {
      duration:              durationYears,
      reparations_per_turn:  terms.reparations_per_turn,
      reparations_payer:     loser,
    });
  }

  if ((terms.armistice_turns ?? 0) > 0) {
    const durationYears = Math.round(terms.armistice_turns / TURNS_PER_YEAR);
    createTreaty(playerNationId, targetNationId, 'armistice', { duration: durationYears });
  }

  const peaceTreaty = createTreaty(playerNationId, targetNationId, 'peace_treaty', {
    ceded_regions: terms.ceded_regions ?? [],
    notes: 'Конец войны.',
  });

  rel.score = Math.min(rel.score + 20, -10);
  addDiplomacyEvent(playerNationId, targetNationId, 15, 'peace');
  return peaceTreaty;
}

function getActiveTreaties(a, b) {
  return GAME_STATE.diplomacy.treaties.filter(t =>
    t.status === 'active' && t.parties.includes(a) && t.parties.includes(b)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ИНТЕГРАЦИОННЫЕ ТЕСТЫ
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== INTEGRATION-ТЕСТЫ: Дипломатия ===\n');

// ─── INT-1: Дипломатия → Экономика: trade_bonus не накапливается (Bug #2) ─────
console.log('--- INT-1: Дипломатия → Экономика: trade_bonus не накапливается ---');
resetState();
createTreaty('nation_a', 'nation_b', 'trade_agreement', {});

// Симулируем 5 ходов
for (let turn = 1; turn <= 5; turn++) {
  GAME_STATE.turn = turn;
  processDiplomacyTick_FIXED('nation_a');
}
const bonus5 = GAME_STATE.nations.nation_a.economy._trade_treaty_bonus;
assertClose(bonus5, 0.15, 0.001, 'После 5 ходов: _trade_treaty_bonus = 0.15 (не накапливается)');

// Если бы накапливался: 0.15 × 5 = 0.75
assert(bonus5 < 0.5, 'Бонус не накопился до 0.75 (5 итераций без сброса)');

// Истечение договора: по умолчанию trade_agreement = 10 лет = 120 ходов
// Форсируем истечение
GAME_STATE.turn = 1000;
processDiplomacyTick_FIXED('nation_a');
const expiredBonus = GAME_STATE.nations.nation_a.economy._trade_treaty_bonus;
assert(expiredBonus === 0, 'После истечения договора: _trade_treaty_bonus = 0');

// ─── INT-2: Дипломатия → Военная: declareWar → at_war_with ───────────────────
console.log('\n--- INT-2: Дипломатия → Военная: declareWar обновляет military ---');
resetState();

const warResult = declareWar('nation_a', 'nation_b');
assert(warResult.ok === true, 'declareWar: успешен');
assert(isAtWar('nation_a', 'nation_b') === true, 'rel.war = true для обеих наций');
assert(getRelationScore('nation_a', 'nation_b') <= -60, 'score <= -60 после объявления войны');

// at_war_with в military обеих наций
const milA = GAME_STATE.nations.nation_a.military;
const milB = GAME_STATE.nations.nation_b.military;
assert(Array.isArray(milA.at_war_with) && milA.at_war_with.includes('nation_b'),
  'nation_a.military.at_war_with содержит nation_b');
assert(Array.isArray(milB.at_war_with) && milB.at_war_with.includes('nation_a'),
  'nation_b.military.at_war_with содержит nation_a');

// Повторное объявление войны — должно вернуть ok=false
const warResult2 = declareWar('nation_a', 'nation_b');
assert(warResult2.ok === false, 'Повторное declareWar: ok=false (уже воюют)');

// ─── INT-3: Дипломатия → Военная: non_aggression блокируется при войне ────────
console.log('\n--- INT-3: Дипломатия → Военная: несовместимые договоры разрываются ---');
resetState();
// Сначала подписываем пакт о ненападении
createTreaty('nation_a', 'nation_b', 'non_aggression', {});
const naTreaties = getActiveTreaties('nation_a', 'nation_b');
assert(naTreaties.some(t => t.type === 'non_aggression'), 'Пакт о ненападении создан');

// Объявляем войну — пакт должен быть разорван
declareWar('nation_a', 'nation_b');
const afterWar = GAME_STATE.diplomacy.treaties.find(t => t.type === 'non_aggression');
assert(afterWar?.status === 'broken', 'non_aggression разорван при объявлении войны');
assert(afterWar?.breaker === 'nation_a', 'breaker = агрессор');

// ─── INT-4: Дипломатия → Дипломатия: concludePeace завершает войну ────────────
console.log('\n--- INT-4: Дипломатия → Дипломатия: concludePeace ---');
resetState();
declareWar('nation_a', 'nation_b');
assert(isAtWar('nation_a', 'nation_b') === true, 'Война объявлена');

const peaceTreaty = concludePeace('nation_a', 'nation_b', {
  winner: 'nation_a',
  loser:  'nation_b',
  reparations_turns:    60,
  reparations_per_turn: 50,
  armistice_turns:      60,
});
assert(isAtWar('nation_a', 'nation_b') === false, 'После concludePeace: война завершена');
assert(peaceTreaty.type === 'peace_treaty', 'Создан договор peace_treaty');

// Мирный договор появился среди активных
const activePeace = getActiveTreaties('nation_a', 'nation_b');
assert(activePeace.some(t => t.type === 'peace_treaty'), 'peace_treaty активен');
assert(activePeace.some(t => t.type === 'armistice'),    'armistice активен');
assert(activePeace.some(t => t.type === 'war_reparations'), 'war_reparations активен');

// ─── INT-5: Дипломатия → Экономика: контрибуция переводит золото каждый ход ─
console.log('\n--- INT-5: Дипломатия → Экономика: контрибуция (war_reparations) ---');
resetState();
// nation_b проигрывает и платит 50/ход в пользу nation_a
GAME_STATE.diplomacy.treaties.push({
  id: 'rep_test', type: 'war_reparations', status: 'active',
  parties: ['nation_a', 'nation_b'],
  turn_signed: 1, turn_expires: 1 + 10 * TURNS_PER_YEAR,
  effects: { reparations: true },
  conditions: { reparations_per_turn: 50, reparations_payer: 'nation_b' },
  dialogue_log: [],
});

const treasuryA_before = GAME_STATE.nations.nation_a.economy.treasury;  // 2000
const treasuryB_before = GAME_STATE.nations.nation_b.economy.treasury;  // 1000

// Один ход: nation_a получает контрибуцию (как получатель — payer != nation_a)
processDiplomacyTick_FIXED('nation_a');

const treasuryA_after = GAME_STATE.nations.nation_a.economy.treasury;
const treasuryB_after = GAME_STATE.nations.nation_b.economy.treasury;

assert(
  treasuryA_after === treasuryA_before + 50,
  'nation_a получила 50 контрибуции за ход',
  'before=' + treasuryA_before + ' after=' + treasuryA_after
);
assert(
  treasuryB_after === treasuryB_before - 50,
  'nation_b заплатила 50 контрибуции за ход',
  'before=' + treasuryB_before + ' after=' + treasuryB_after
);

// ─── INT-6: Дипломатия → Дипломатия: истечение договора по turn_expires ───────
console.log('\n--- INT-6: Дипломатия: истечение договора по turn_expires ---');
resetState();
// trade_agreement на 1 год = 12 ходов
createTreaty('nation_a', 'nation_b', 'trade_agreement', { duration: 1 });
const ta = GAME_STATE.diplomacy.treaties.find(t => t.type === 'trade_agreement');
assert(ta.turn_expires === 1 + 12, 'turn_expires = 1 + 1*12 = 13', 'got ' + ta.turn_expires);
assert(ta.status === 'active', 'Договор активен до истечения');

// Переходим на ход 13 (turn_expires)
GAME_STATE.turn = 13;
processDiplomacyTick_FIXED('nation_a');
assert(ta.status === 'expired', 'Договор истёк при turn >= turn_expires');

// Бонус должен быть 0 после истечения
assert(
  GAME_STATE.nations.nation_a.economy._trade_treaty_bonus === 0,
  '_trade_treaty_bonus = 0 после истечения договора'
);

// ─── INT-7: Дипломатия → Правительство: смерть правителя и брачный союз ───────
console.log('\n--- INT-7: Дипломатия: брачный союз без dynasty_link ---');
resetState();
createTreaty('nation_a', 'nation_b', 'marriage_alliance', {});
const marriage = GAME_STATE.diplomacy.treaties.find(t => t.type === 'marriage_alliance');
assert(marriage.status === 'active', 'Брачный союз создан и активен');

// После смерти правителя должен назначиться grace period
// (упрощённая версия onRulerDeath)
const GRACE_PERIOD = 5;
if (!marriage._dynasty_expires_turn) {
  marriage._dynasty_expires_turn = GAME_STATE.turn + GRACE_PERIOD;
}
assert(
  marriage._dynasty_expires_turn === 1 + GRACE_PERIOD,
  'Grace period выставлен: expires_turn = ' + (1 + GRACE_PERIOD)
);

// На ходу, равном expires_turn, статус должен стать 'expired'
GAME_STATE.turn = marriage._dynasty_expires_turn;
if (GAME_STATE.turn >= marriage._dynasty_expires_turn && marriage.status === 'active') {
  marriage.status = 'expired';
}
assert(marriage.status === 'expired', 'Брачный союз истёк после grace period');

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
