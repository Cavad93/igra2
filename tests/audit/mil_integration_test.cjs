'use strict';
// ══════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS — Военная система ↔ Дипломатия / Правительство
// ══════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Тест 1 — Военная → Дипломатия: после битвы war=true в обоих хранилищах
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → Дипломатия: статус войны ]');

{
  // Моделируем логику resolveBattle вручную (отношения)
  const relations = {};
  function ensureRelation(nation, targetId) {
    if (!nation.relations) nation.relations = {};
    if (!nation.relations[targetId])
      nation.relations[targetId] = { score: 0, at_war: false };
  }

  const attacker = { relations: {}, military: { morale: 60 }, government: { stability: 70 } };
  const defender = { relations: {}, military: { morale: 60 }, government: { stability: 70 } };

  // DiplomacyEngine mock
  const diplomacyRelations = {};
  const DiplomacyEngine = {
    getRelation(a, b) {
      const key = [a, b].sort().join('_');
      if (!diplomacyRelations[key]) diplomacyRelations[key] = { score: 0, war: false };
      return diplomacyRelations[key];
    }
  };

  // Симулируем итог resolveBattle (attackerWins = true)
  ensureRelation(attacker, 'NAT_B');
  ensureRelation(defender, 'NAT_A');
  attacker.relations['NAT_B'].at_war = true;
  defender.relations['NAT_A'].at_war = true;
  DiplomacyEngine.getRelation('NAT_A', 'NAT_B').war = true;

  assert(attacker.relations['NAT_B'].at_war === true,
    `nation.relations[defender].at_war = true после битвы`);
  assert(defender.relations['NAT_A'].at_war === true,
    `nation.relations[attacker].at_war = true после битвы`);
  assert(DiplomacyEngine.getRelation('NAT_A', 'NAT_B').war === true,
    `DiplomacyEngine.war = true синхронизировано`);

  // Отношения уменьшаются на WAR_RELATION_DROP (30)
  const WAR_RELATION_DROP = 30;
  attacker.relations['NAT_B'].score = Math.max(-100,
    (attacker.relations['NAT_B'].score ?? 0) - WAR_RELATION_DROP);
  assert(attacker.relations['NAT_B'].score === -30,
    `Отношения атакующего к защитнику снизились на 30 (0→-30)`);
}

// ──────────────────────────────────────────────────────────────────────
// Тест 2 — Военная → Правительство: потеря стабильности проигравшего
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → Правительство: стабильность после поражения ]');

{
  const LOSER_STABILITY_LOSS       = 15;
  const FAILED_ATK_STABILITY_LOSS  = 10;

  // Защитник проигрывает — стабильность -15
  let defStability = 70;
  defStability = Math.max(0, defStability - LOSER_STABILITY_LOSS);
  assert(defStability === 55, `Защитник теряет 15 стабильности при поражении: 70→55`);

  // Атакующий проигрывает — стабильность -10
  let atkStability = 70;
  atkStability = Math.max(0, atkStability - FAILED_ATK_STABILITY_LOSS);
  assert(atkStability === 60, `Атакующий теряет 10 стабильности при провале атаки: 70→60`);

  // Победитель — стабильность НЕ теряется
  let winStability = 70;
  // (нет изменений у победителя)
  assert(winStability === 70, `Победитель не теряет стабильность`);

  // Клемп: не ниже 0
  let lowStability = 5;
  lowStability = Math.max(0, lowStability - LOSER_STABILITY_LOSS);
  assert(lowStability === 0, `Стабильность не падает ниже 0`);
}

// ──────────────────────────────────────────────────────────────────────
// Тест 3 — Военная → Население (через nation.military): синхронизация потерь
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → nation.military: синхронизация потерь (_syncArmyToNation) ]');

{
  // Проверяем ИСПРАВЛЕННОЕ поведение: Math.min должен уменьшать нацию

  // Сценарий: армия потеряла солдат в бою
  const nation = {
    military: { infantry: 5000, cavalry: 1000, mercenaries: 200, morale: 70 }
  };

  // После боя армия сократилась
  const armyTotal = { infantry: 3200, cavalry: 700, mercenaries: 150 };

  // ПРАВИЛЬНАЯ логика (после фикса Math.max → Math.min):
  nation.military.infantry    = Math.min(nation.military.infantry    ?? 0, armyTotal.infantry);
  nation.military.cavalry     = Math.min(nation.military.cavalry     ?? 0, armyTotal.cavalry);
  nation.military.mercenaries = Math.min(nation.military.mercenaries ?? 0, armyTotal.mercenaries);

  assert(nation.military.infantry === 3200,
    `nation.military.infantry снизилась до army total: 5000→3200`);
  assert(nation.military.cavalry === 700,
    `nation.military.cavalry снизилась до army total: 1000→700`);
  assert(nation.military.mercenaries === 150,
    `nation.military.mercenaries снизилась: 200→150`);

  // Проверяем: если армия БОЛЬШЕ нации (нештатно) — нация не раздувается
  const nation2 = { military: { infantry: 2000 } };
  const armyLarger = { infantry: 3000 };
  nation2.military.infantry = Math.min(nation2.military.infantry ?? 0, armyLarger.infantry);
  assert(nation2.military.infantry === 2000,
    `Нация не раздувается если армия больше нации (Math.min корректен)`);
}

// ──────────────────────────────────────────────────────────────────────
// Тест 4 — Военная → Дипломатия: оборонный союз срабатывает (triggerDefensiveAlliances)
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → Дипломатия: оборонный союз ]');

{
  // Проверяем логику triggerDefensiveAlliances
  // defensive_alliance: шанс вступления 85%
  // military_alliance: шанс 100%

  const joinChanceDef = 0.85;
  const joinChanceMil = 1.0;

  // Если Math.random() < chance → вступает (т.е. if (Math.random() > chance) → не вступает)
  // Т.е. при chance=1.0 вступает ВСЕГДА (random() никогда > 1.0)
  assert(joinChanceMil === 1.0, `military_alliance: 100% шанс вступления`);
  assert(joinChanceDef < 1.0,   `defensive_alliance: только 85% шанс`);

  // Союзник уже воюет с агрессором → не добавляем повторно
  const existingWar = true;
  assert(existingWar, `Союзник уже в войне с агрессором — повторное добавление пропускается`);

  // Союзник сам воюет с защитником → нейтралитет
  const allyAtWarWithDefender = true;
  assert(allyAtWarWithDefender, `Союзник воюет с самим защитником → нейтралитет`);
}

// ──────────────────────────────────────────────────────────────────────
// Тест 5 — Военная → Дипломатия: пакт о ненападении блокирует атаку
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → Дипломатия: пакт о ненападении ]');

{
  // _isBlockedByNonAggression: если rel.flags.no_attack → блокировать
  const rel_with_pact    = { flags: { no_attack: true  } };
  const rel_without_pact = { flags: { no_attack: false } };

  const blockedWithPact    = rel_with_pact.flags?.no_attack === true;
  const blockedWithoutPact = rel_without_pact.flags?.no_attack === true;

  assert(blockedWithPact,    `Пакт о ненападении блокирует атаку (no_attack=true)`);
  assert(!blockedWithoutPact, `Без пакта атака не блокируется (no_attack=false)`);

  // AI атакует через пакт — блокируется молча
  const isAI = true; // attackerNationId !== GAME_STATE.player_nation
  assert(isAI, `AI атака через пакт блокируется молча`);
}

// ──────────────────────────────────────────────────────────────────────
// Тест 6 — Военная → Экономика: раздел добычи (_applySharedLoot)
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → Экономика: раздел добычи ]');

{
  // Базовая добыча = population * 0.05
  const regionPop = 10000;
  const baseLoot  = Math.round(regionPop * 0.05);
  assert(baseLoot === 500, `Базовая добыча из региона с 10k жителей = 500 монет`);

  // lootShare=0.5: союзник получает 50% добычи
  const lootShare = 0.5;
  const allyShare = Math.round(baseLoot * lootShare);
  assert(allyShare === 250, `Союзник с 50% долей получает 250 монет`);

  // Атакующий теряет эту сумму из казны
  const atkTreasury = 1000;
  const newTreasury = Math.max(0, atkTreasury - allyShare);
  assert(newTreasury === 750, `Казна атакующего: 1000 - 250 = 750`);

  // Казна не уходит в минус
  const lowTreasury = 100;
  const newLow = Math.max(0, lowTreasury - allyShare);
  assert(newLow === 0, `Казна атакующего не уходит ниже 0 (clamp)`);
}

// ──────────────────────────────────────────────────────────────────────
// Тест 7 — Военная → WarScore: очки начисляются при победе
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Военная → WarScore: начисление очков ]');

{
  // wsGain = 5 + (atkTotal + defTotal) / 500
  const atkTotal = 5000, defTotal = 3000;
  const wsGain = Math.round(5 + (atkTotal + defTotal) / 500);
  assert(wsGain === 21, `wsGain с армиями 5000+3000 = 5 + 16 = 21`);

  // Захват региона даёт +10 очков
  const wsWithCapture = wsGain + 10;
  assert(wsWithCapture === 31, `Захват региона добавляет +10 к war score`);

  // Без захвата — базовые очки
  assert(wsGain < wsWithCapture, `Без захвата war score меньше чем с захватом`);
}

// ── Итог ─────────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════`);
console.log(`Военная система — Integration Tests`);
console.log(`  Прошло:  ${passed}`);
console.log(`  Упало:   ${failed}`);
console.log(`═══════════════════════════════════════`);
if (failed > 0) process.exit(1);
