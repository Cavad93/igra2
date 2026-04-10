// Тесты Этапа 17 — Отступление с расчётом выживших (Улучшение 10)
// Запуск: node tests/test_tactical_stage17.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const RESERVE_ZONE_COLS  = 3;
const CELL_SIZE          = 40;

// ── Инлайн-функции ───────────────────────────────────

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
}

function createUnit(id, side, type, strength, gridX, gridY, extra = {}) {
  return {
    id, side, type,
    strength,
    maxStrength: strength,
    morale: 80,
    fatigue: 0,
    ammo: type === 'archers' ? 30 : 0,
    isRouting: false,
    isReserve: false,
    isCommander: false,
    gridX, gridY,
    moveSpeed: type === 'cavalry' ? 4 : 2,
    formation: 'standard',
    selected: false,
    _movedThisTick: false,
    _foughtThisTick: false,
    ...extra
  };
}

// Заглушка endTacticalBattle
let endBattleCalls = [];
function endTacticalBattle(bs, outcome) {
  endBattleCalls.push({ outcome, bs });
}

function makeBattleState(overrides = {}) {
  return {
    playerUnits: [],
    enemyUnits: [],
    turn: 1,
    log: [],
    elevatedCells: new Set(),
    ambushUsed: false,
    phase: 'battle',
    maxStrengthInBattle: 1000,
    playerStandardPos: null,
    enemyStandardPos: null,
    ...overrides
  };
}

// ── calcRetreatSurvival (копия из engine/tactical_battle.js) ──

function calcRetreatSurvival(bs) {
  const enemyActive = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);

  const hasEnemyBehind      = enemyActive.some(e => e.gridX < RESERVE_ZONE_COLS + 2);
  const hasEnemyTopFlank    = enemyActive.some(e => e.gridY <= 2);
  const hasEnemyBottomFlank = enemyActive.some(e => e.gridY >= TACTICAL_GRID_ROWS - 3);
  const flankedBothSides    = hasEnemyTopFlank && hasEnemyBottomFlank;

  const routingRatio = bs.playerUnits.filter(u => u.isRouting).length /
                       Math.max(1, bs.playerUnits.length);

  let base = 0.68;
  if (hasEnemyBehind && flankedBothSides) base = 0.12;
  else if (hasEnemyBehind || flankedBothSides) base = 0.35;
  else if (routingRatio > 0.5) base = 0.50;

  const hasCavalry = bs.playerUnits.some(u => u.type === 'cavalry' && u.strength > 0);
  const cavBonus   = hasCavalry ? 0.10 : 0;

  return Math.min(0.80, base + cavBonus);
}

// ── executeRetreat (копия из engine/tactical_battle.js) ──

function executeRetreat(bs) {
  const pct = calcRetreatSurvival(bs);
  for (const u of bs.playerUnits) {
    u.strength = Math.floor(u.strength * pct);
  }
  bs.phase = 'ended';
  addLog(bs, `🏃 Армия отступила. Спаслось ~${Math.round(pct * 100)}% войск.`);
  endTacticalBattle(bs, 'player_retreat');
}

// ── Утилиты тестирования ─────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'Assertion failed');
}

function assertClose(a, b, eps = 0.001, msg) {
  if (Math.abs(a - b) > eps) throw new Error(msg ?? `Expected ~${b}, got ${a}`);
}

// ── Тесты ────────────────────────────────────────────

console.log('\nЭтап 17 — Отступление с расчётом выживших\n');

// Тест 1: Открытые фланги — ~68% выживших
test('С открытыми флангами (нет окружения) → ~68% выживших', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 1000, 14, 8)],
  });
  const pct = calcRetreatSurvival(bs);
  assertClose(pct, 0.68, 0.001, `Ожидалось 0.68, получено ${pct}`);
});

// Тест 2: Враги за линией игрока → ~35%
test('При вражеских юнитах за линией игрока → ~35%', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 1000, 2, 8)], // gridX < RESERVE_ZONE_COLS + 2 = 5
  });
  const pct = calcRetreatSurvival(bs);
  assertClose(pct, 0.35, 0.001, `Ожидалось 0.35, получено ${pct}`);
});

// Тест 3: Полное окружение → ~12%
test('При полном окружении → ~12%', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [
      createUnit('e1', 'enemy', 'infantry', 1000, 2, 2),  // за линией И сверху
      createUnit('e2', 'enemy', 'infantry', 1000, 2, 13), // за линией И снизу
    ],
  });
  const pct = calcRetreatSurvival(bs);
  assertClose(pct, 0.12, 0.001, `Ожидалось 0.12, получено ${pct}`);
});

// Тест 4: Кавалерия даёт +10%
test('Кавалерия в армии даёт +10% к выживаемости', () => {
  // Без кавалерии
  const bsNoCav = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 1000, 14, 8)],
  });
  const pctNoCav = calcRetreatSurvival(bsNoCav);

  // С кавалерией
  const bsCav = makeBattleState({
    playerUnits: [
      createUnit('p1', 'player', 'infantry', 500, 6, 8),
      createUnit('p2', 'player', 'cavalry',  500, 6, 7),
    ],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 1000, 14, 8)],
  });
  const pctCav = calcRetreatSurvival(bsCav);

  assertClose(pctCav - pctNoCav, 0.10, 0.001,
    `Ожидалась разница 0.10, получено ${(pctCav - pctNoCav).toFixed(3)}`);
});

// Тест 5: Кавалерия при полном окружении → 22% (не более 80%)
test('Кавалерия + открытые фланги → не более 80%', () => {
  const bs = makeBattleState({
    playerUnits: [
      createUnit('p1', 'player', 'cavalry', 500, 6, 8),
      createUnit('p2', 'player', 'cavalry', 500, 6, 7),
    ],
    enemyUnits: [createUnit('e1', 'enemy', 'infantry', 1000, 14, 8)],
  });
  const pct = calcRetreatSurvival(bs);
  assert(pct <= 0.80, `pct должен быть ≤ 0.80, получено ${pct}`);
  assertClose(pct, 0.78, 0.001, `Ожидалось 0.78, получено ${pct}`);
});

// Тест 6: executeRetreat изменяет strength и ставит phase = 'ended'
test('executeRetreat умножает strength всех юнитов на pct и завершает бой', () => {
  endBattleCalls = [];
  const bs = makeBattleState({
    playerUnits: [
      createUnit('p1', 'player', 'infantry', 1000, 6, 8),
      createUnit('p2', 'player', 'cavalry',  500,  6, 7),
    ],
    enemyUnits: [createUnit('e1', 'enemy', 'infantry', 800, 14, 8)],
  });

  const pct = calcRetreatSurvival(bs); // должно быть 0.78
  executeRetreat(bs);

  assert(bs.phase === 'ended', `phase должен быть 'ended', получено '${bs.phase}'`);
  // p1: 1000 * 0.78 = 780
  assert(bs.playerUnits[0].strength === Math.floor(1000 * pct),
    `Ожидалось ${Math.floor(1000 * pct)}, получено ${bs.playerUnits[0].strength}`);
  // p2: 500 * 0.78 = 390
  assert(bs.playerUnits[1].strength === Math.floor(500 * pct),
    `Ожидалось ${Math.floor(500 * pct)}, получено ${bs.playerUnits[1].strength}`);
});

// Тест 7: executeRetreat вызывает endTacticalBattle с outcome 'player_retreat'
test('executeRetreat вызывает endTacticalBattle с outcome player_retreat', () => {
  endBattleCalls = [];
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 800, 14, 8)],
  });
  executeRetreat(bs);
  assert(endBattleCalls.length === 1, `Ожидался 1 вызов endTacticalBattle, получено ${endBattleCalls.length}`);
  assert(endBattleCalls[0].outcome === 'player_retreat',
    `Ожидался outcome 'player_retreat', получено '${endBattleCalls[0].outcome}'`);
});

// Тест 8: addLog вызывается с текстом про отступление
test('executeRetreat добавляет лог с текстом об отступлении', () => {
  endBattleCalls = [];
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 800, 14, 8)],
  });
  executeRetreat(bs);
  assert(bs.log.length > 0, 'Лог должен содержать хотя бы одну запись');
  assert(bs.log[0].text.includes('отступила'),
    `Лог не содержит "отступила": ${bs.log[0].text}`);
});

// Тест 9: routing > 50% → base 0.50
test('При >50% бегущих юнитов → ~50% выживших', () => {
  const bs = makeBattleState({
    playerUnits: [
      createUnit('p1', 'player', 'infantry', 1000, 6, 8, { isRouting: true }),
      createUnit('p2', 'player', 'infantry', 1000, 6, 9, { isRouting: true }),
      createUnit('p3', 'player', 'infantry', 1000, 6, 10),
    ],
    enemyUnits: [createUnit('e1', 'enemy', 'infantry', 800, 14, 8)],
  });
  const pct = calcRetreatSurvival(bs);
  assertClose(pct, 0.50, 0.001, `Ожидалось 0.50, получено ${pct}`);
});

// Тест 10: flankedBothSides (без тыла) → 0.35
test('Окружение с флангов (без тыла) → ~35%', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 1000, 6, 8)],
    enemyUnits:  [
      createUnit('e1', 'enemy', 'infantry', 500, 14, 1),  // сверху (gridY <= 2)
      createUnit('e2', 'enemy', 'infantry', 500, 14, 14), // снизу (gridY >= 13)
    ],
  });
  const pct = calcRetreatSurvival(bs);
  assertClose(pct, 0.35, 0.001, `Ожидалось 0.35, получено ${pct}`);
});

// ── Итог ─────────────────────────────────────────────

console.log(`\nРезультат: ${passed} из ${passed + failed} тестов пройдено\n`);
if (failed > 0) process.exit(1);
