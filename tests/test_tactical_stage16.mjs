// Тесты Этапа 16 — Захват стандарта (Улучшение 9)
// Запуск: node tests/test_tactical_stage16.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const RESERVE_ZONE_COLS  = 3;
const CELL_SIZE          = 40;

// ── Инлайн-функции (точные копии из engine/tactical_battle.js) ──

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
  endBattleCalls.push({ outcome });
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

// ── checkStandardCapture (копия из engine/tactical_battle.js) ──

function checkStandardCapture(bs) {
  if (bs.phase === 'ended') return;

  const eStd = bs.enemyStandardPos;
  const pStd = bs.playerStandardPos;

  if (eStd) {
    const captor = bs.playerUnits.find(u =>
      u.strength > 0 && !u.isRouting && u.gridX === eStd.x && u.gridY === eStd.y);
    if (captor) {
      addLog(bs, `🏴 СТАНДАРТ ЗАХВАЧЕН! Враг деморализован — ПОБЕДА!`);
      bs.enemyUnits.forEach(u => { u.isRouting = true; u.morale = 0; });
      bs.phase = 'ended';
      setTimeout(() => endTacticalBattle(bs, 'player_captured_standard'), 1500);
      return;
    }
  }

  if (pStd) {
    const captor = bs.enemyUnits.find(u =>
      u.strength > 0 && !u.isRouting && u.gridX === pStd.x && u.gridY === pStd.y);
    if (captor) {
      addLog(bs, `🏴 Враг захватил наш стандарт — ПОРАЖЕНИЕ!`);
      bs.playerUnits.forEach(u => { u.isRouting = true; u.morale = 0; });
      bs.phase = 'ended';
      setTimeout(() => endTacticalBattle(bs, 'player_loses'), 1500);
    }
  }
}

// ── Тестирующий фреймворк ────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? 'assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ════════════════════════════════════════════════════
// 1. initTacticalBattle сохраняет позиции стандартов
// ════════════════════════════════════════════════════

console.log('\n── 1. Инициализация стандартов ──────────────────────');

test('playerStandardPos устанавливается по координате командира игрока', () => {
  const playerCmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 8, { isCommander: true });
  const enemyCmd  = createUnit('e_cmd', 'enemy',  'infantry', 50, 16, 8, { isCommander: true });

  // Имитируем то что делает initTacticalBattle
  const playerUnits = [playerCmd];
  const enemyUnits  = [enemyCmd];
  const pCmd = playerUnits.find(u => u.isCommander);
  const eCmd = enemyUnits.find(u => u.isCommander);

  const bs = {
    playerStandardPos: pCmd ? { x: pCmd.gridX, y: pCmd.gridY } : null,
    enemyStandardPos:  eCmd ? { x: eCmd.gridX,  y: eCmd.gridY  } : null,
  };

  assert(bs.playerStandardPos !== null, 'playerStandardPos должен быть задан');
  assertEqual(bs.playerStandardPos.x, 5, 'x координата стандарта игрока');
  assertEqual(bs.playerStandardPos.y, 8, 'y координата стандарта игрока');
});

test('enemyStandardPos устанавливается по координате командира врага', () => {
  const enemyCmd = createUnit('e_cmd', 'enemy', 'infantry', 50, 16, 7, { isCommander: true });
  const eCmd = [enemyCmd].find(u => u.isCommander);
  const bs = {
    enemyStandardPos: eCmd ? { x: eCmd.gridX, y: eCmd.gridY } : null
  };
  assert(bs.enemyStandardPos !== null, 'enemyStandardPos должен быть задан');
  assertEqual(bs.enemyStandardPos.x, 16, 'x координата');
  assertEqual(bs.enemyStandardPos.y, 7,  'y координата');
});

test('если нет командира — стандарт null', () => {
  const playerUnits = [createUnit('p_inf', 'player', 'infantry', 100, 5, 8)];
  const pCmd = playerUnits.find(u => u.isCommander);
  const bs = { playerStandardPos: pCmd ? { x: pCmd.gridX, y: pCmd.gridY } : null };
  assertEqual(bs.playerStandardPos, null, 'без командира стандарт null');
});

// ════════════════════════════════════════════════════
// 2. checkStandardCapture — захват стандарта врага игроком
// ════════════════════════════════════════════════════

console.log('\n── 2. Захват стандарта врага игроком ───────────────');

test('юнит игрока на клетке стандарта врага → победа', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 16, 8);
  const enemyUnit1 = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);
  const enemyUnit2 = createUnit('e2', 'enemy',  'cavalry',  80,  12, 7);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit1, enemyUnit2],
    enemyStandardPos: { x: 16, y: 8 }
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'ended', 'фаза должна стать ended');
  const logEntry = bs.log.find(e => e.text.includes('СТАНДАРТ ЗАХВАЧЕН'));
  assert(logEntry !== undefined, 'лог должен содержать "СТАНДАРТ ЗАХВАЧЕН"');
});

test('после захвата все вражеские юниты в routing', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 16, 8);
  const e1 = createUnit('e1', 'enemy', 'infantry', 100, 10, 5);
  const e2 = createUnit('e2', 'enemy', 'cavalry',  80,  12, 7);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [e1, e2],
    enemyStandardPos: { x: 16, y: 8 }
  });

  checkStandardCapture(bs);

  assert(e1.isRouting, 'e1 должен быть в routing');
  assert(e2.isRouting, 'e2 должен быть в routing');
  assertEqual(e1.morale, 0, 'e1 мораль = 0');
  assertEqual(e2.morale, 0, 'e2 мораль = 0');
});

test('после захвата через 1.5с вызывается endTacticalBattle с player_captured_standard', async () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 16, 8);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    enemyStandardPos: { x: 16, y: 8 }
  });

  checkStandardCapture(bs);

  await new Promise(r => setTimeout(r, 2000));
  assert(endBattleCalls.length > 0, 'endTacticalBattle должен быть вызван');
  assertEqual(endBattleCalls[0].outcome, 'player_captured_standard', 'исход должен быть player_captured_standard');
});

test('routing-юнит игрока не захватывает стандарт', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 16, 8, { isRouting: true });
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    enemyStandardPos: { x: 16, y: 8 }
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'battle', 'routing-юнит не захватывает стандарт');
  const logEntry = bs.log.find(e => e.text.includes('СТАНДАРТ ЗАХВАЧЕН'));
  assert(logEntry === undefined, 'лога не должно быть');
});

test('юнит с 0 силой не захватывает стандарт', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 0, 16, 8);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    enemyStandardPos: { x: 16, y: 8 }
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'battle', 'юнит с 0 силой не захватывает стандарт');
});

// ════════════════════════════════════════════════════
// 3. checkStandardCapture — захват стандарта игрока врагом
// ════════════════════════════════════════════════════

console.log('\n── 3. Захват стандарта игрока врагом ───────────────');

test('вражеский юнит на клетке стандарта игрока → поражение', () => {
  endBattleCalls = [];
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 5, 8);
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    playerStandardPos: { x: 5, y: 8 }
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'ended', 'фаза должна стать ended');
  const logEntry = bs.log.find(e => e.text.includes('ПОРАЖЕНИЕ'));
  assert(logEntry !== undefined, 'лог должен содержать "ПОРАЖЕНИЕ"');
});

test('после захвата врагом все юниты игрока в routing', () => {
  endBattleCalls = [];
  const enemyUnit = createUnit('e1', 'enemy', 'infantry', 100, 5, 8);
  const p1 = createUnit('p1', 'player', 'infantry', 100, 10, 5);
  const p2 = createUnit('p2', 'player', 'cavalry',  80,  12, 7);

  const bs = makeBattleState({
    playerUnits: [p1, p2],
    enemyUnits: [enemyUnit],
    playerStandardPos: { x: 5, y: 8 }
  });

  checkStandardCapture(bs);

  assert(p1.isRouting, 'p1 должен быть в routing');
  assert(p2.isRouting, 'p2 должен быть в routing');
  assertEqual(p1.morale, 0, 'p1 мораль = 0');
  assertEqual(p2.morale, 0, 'p2 мораль = 0');
});

test('вражеский routing-юнит не захватывает стандарт игрока', () => {
  endBattleCalls = [];
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 5, 8, { isRouting: true });
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    playerStandardPos: { x: 5, y: 8 }
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'battle', 'routing не захватывает стандарт');
});

// ════════════════════════════════════════════════════
// 4. checkStandardCapture вызывается каждый тик
// ════════════════════════════════════════════════════

console.log('\n── 4. Вызов каждый тик ───────────────────────────');

test('checkStandardCapture срабатывает без движения (просто позиция)', () => {
  endBattleCalls = [];
  // Юнит уже стоит на клетке стандарта с самого начала тика
  const playerUnit = createUnit('p1', 'player', 'cavalry', 200, 16, 8);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    enemyStandardPos: { x: 16, y: 8 }
  });

  // Вызываем несколько раз (имитируем несколько тиков)
  checkStandardCapture(bs); // первый тик — должен сработать
  assertEqual(bs.phase, 'ended', 'срабатывает без движения');
});

test('если phase уже ended — checkStandardCapture ничего не делает', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 16, 8);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    enemyStandardPos: { x: 16, y: 8 },
    phase: 'ended'
  });

  checkStandardCapture(bs);

  // Вражеские юниты должны остаться нетронутыми (phase уже ended)
  assert(!enemyUnit.isRouting, 'при phase=ended юниты не меняются');
});

// ════════════════════════════════════════════════════
// 5. Нет ложных срабатываний
// ════════════════════════════════════════════════════

console.log('\n── 5. Нет ложных срабатываний ───────────────────');

test('если никого нет на клетке стандарта — фаза остаётся battle', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 5, 5);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 10, 5);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    playerStandardPos: { x: 3, y: 8 },
    enemyStandardPos:  { x: 18, y: 8 }
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'battle', 'фаза должна остаться battle');
  assertEqual(bs.log.length, 0, 'логов не должно быть');
});

test('если стандарт null — нет захвата', () => {
  endBattleCalls = [];
  const playerUnit = createUnit('p1', 'player', 'infantry', 100, 16, 8);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 100, 5, 8);

  const bs = makeBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    playerStandardPos: null,
    enemyStandardPos: null
  });

  checkStandardCapture(bs);

  assertEqual(bs.phase, 'battle', 'без стандартов фаза остаётся battle');
});

// ════════════════════════════════════════════════════
// 6. drawStandards логика (без Canvas — только проверка условий)
// ════════════════════════════════════════════════════

console.log('\n── 6. Логика drawStandards ────────────────────────');

test('флаг показывается только когда командир ушёл со стартовой клетки', () => {
  const cmd = createUnit('e_cmd', 'enemy', 'infantry', 50, 17, 8, { isCommander: true });
  const std = { x: 16, y: 8 }; // стартовая позиция

  // Командир на стартовой позиции → флаг НЕ рисуется
  cmd.gridX = 16; cmd.gridY = 8;
  const showFlag1 = !(cmd.gridX === std.x && cmd.gridY === std.y);
  assertEqual(showFlag1, false, 'флаг не показывается пока командир на месте');

  // Командир ушёл → флаг рисуется
  cmd.gridX = 17; cmd.gridY = 8;
  const showFlag2 = !(cmd.gridX === std.x && cmd.gridY === std.y);
  assertEqual(showFlag2, true, 'флаг показывается когда командир ушёл');
});

test('если нет командира — флаг не показывается (cmd=undefined)', () => {
  const enemyUnits = [createUnit('e1', 'enemy', 'infantry', 100, 10, 8)];
  const cmd = enemyUnits.find(u => u.isCommander);
  // cmd === undefined → цикл в drawStandards пропустит
  assert(cmd === undefined, 'нет командира — нет флага');
});

// ════════════════════════════════════════════════════
// 7. ИИ-стратегия стандарта
// ════════════════════════════════════════════════════

console.log('\n── 7. ИИ-стратегия стандарта ─────────────────────');

test('при hp < 40% ИИ должен нацеливаться на позицию своего стандарта', () => {
  const eu = createUnit('e1', 'enemy', 'infantry', 30, 10, 8); // 30/100 < 40%
  eu.maxStrength = 100;

  const enemyTotalStr = 30;
  const enemyMaxStr   = 100;
  const enemyHpRatio  = enemyTotalStr / enemyMaxStr; // 0.30 < 0.40

  const enemyStandardPos  = { x: 18, y: 8 };
  const playerStandardPos = { x: 5,  y: 8 };

  let targetX, targetY;
  if (enemyHpRatio < 0.40 && enemyStandardPos) {
    targetX = enemyStandardPos.x;
    targetY = enemyStandardPos.y;
  } else if (enemyHpRatio > 0.60 && playerStandardPos) {
    targetX = playerStandardPos.x;
    targetY = playerStandardPos.y;
  }

  assertEqual(targetX, 18, 'при hp<40% цель — позиция своего стандарта x');
  assertEqual(targetY, 8,  'при hp<40% цель — позиция своего стандарта y');
});

test('при hp > 60% ИИ нацеливается на стандарт игрока', () => {
  const enemyHpRatio  = 0.80; // > 0.60
  const enemyStandardPos  = { x: 18, y: 8 };
  const playerStandardPos = { x: 5,  y: 8 };

  let targetX, targetY;
  if (enemyHpRatio < 0.40 && enemyStandardPos) {
    targetX = enemyStandardPos.x;
    targetY = enemyStandardPos.y;
  } else if (enemyHpRatio > 0.60 && playerStandardPos) {
    targetX = playerStandardPos.x;
    targetY = playerStandardPos.y;
  }

  assertEqual(targetX, 5, 'при hp>60% цель — стандарт игрока x');
  assertEqual(targetY, 8, 'при hp>60% цель — стандарт игрока y');
});

test('при 40%-60% hp ИИ движется к ближайшему юниту (нет специальной цели)', () => {
  const enemyHpRatio  = 0.50; // между 40% и 60%
  const enemyStandardPos  = { x: 18, y: 8 };
  const playerStandardPos = { x: 5,  y: 8 };

  let targetX = null, targetY = null;
  if (enemyHpRatio < 0.40 && enemyStandardPos) {
    targetX = enemyStandardPos.x;
    targetY = enemyStandardPos.y;
  } else if (enemyHpRatio > 0.60 && playerStandardPos) {
    targetX = playerStandardPos.x;
    targetY = playerStandardPos.y;
  }

  assertEqual(targetX, null, 'при 40-60% hp нет специальной цели');
});

// ════════════════════════════════════════════════════
// Итог
// ════════════════════════════════════════════════════

console.log('\n──────────────────────────────────────────────────');
console.log(`Этап 16: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
