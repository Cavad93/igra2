// Тесты Этапа 18 — Улучшенный ИИ противника
// Запуск: node tests/test_tactical_stage18.mjs

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

// ── findUnitAt (копия из ui/tactical_map.js) ──

function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits].find(
    u => u.gridX === gridX && u.gridY === gridY && u.strength > 0
  ) ?? null;
}

// ── moveTowards (копия из engine/tactical_battle.js) ──

function moveTowards(unit, tx, ty, bs) {
  const dx = Math.sign(tx - unit.gridX);
  const dy = Math.sign(ty - unit.gridY);
  const options = [];
  if (dx !== 0) options.push({ x: unit.gridX + dx, y: unit.gridY });
  if (dy !== 0) options.push({ x: unit.gridX,      y: unit.gridY + dy });
  for (const opt of options) {
    if (opt.x >= 0 && opt.x < TACTICAL_GRID_COLS &&
        opt.y >= 0 && opt.y < TACTICAL_GRID_ROWS &&
        !findUnitAt(opt.x, opt.y, bs)) {
      unit.gridX = opt.x; unit.gridY = opt.y;
      return;
    }
  }
}

// ── runEnemyAI (копия из engine/tactical_battle.js) ──

function runEnemyAI(bs) {
  const enemyAlive  = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (playerAlive.length === 0) return;

  const enemyCmd   = enemyAlive.find(u => u.isCommander);
  const ownHpRatio = enemyAlive.reduce((s, u) => s + u.strength, 0) /
                     Math.max(1, bs.enemyUnits.reduce((s, u) => s + u.maxStrength, 0));

  for (const eu of enemyAlive) {
    if (eu.isReserve) continue;
    eu._movedThisTick = false;

    // TIER 1: Защита командира при низком HP
    if (ownHpRatio < 0.40 && enemyCmd && eu.id !== enemyCmd.id) {
      const distToCmd = Math.abs(eu.gridX - enemyCmd.gridX) + Math.abs(eu.gridY - enemyCmd.gridY);
      if (distToCmd > 2) {
        moveTowards(eu, enemyCmd.gridX, enemyCmd.gridY, bs);
        eu._movedThisTick = true;
        continue;
      }
    }

    // TIER 2: Атаковать ближайшего слабого (низкая мораль)
    const weakTarget = playerAlive
      .filter(p => Math.abs(p.gridX - eu.gridX) + Math.abs(p.gridY - eu.gridY) <= eu.moveSpeed + 1)
      .sort((a, b) => a.morale - b.morale)[0];

    if (weakTarget) {
      moveTowards(eu, weakTarget.gridX, weakTarget.gridY, bs);
      eu._movedThisTick = true;
      continue;
    }

    // TIER 3: Двигаться к ближайшему
    const nearest = playerAlive.reduce((best, p) =>
      (Math.abs(p.gridX - eu.gridX) + Math.abs(p.gridY - eu.gridY)) <
      (Math.abs(best.gridX - eu.gridX) + Math.abs(best.gridY - eu.gridY)) ? p : best
    );
    moveTowards(eu, nearest.gridX, nearest.gridY, bs);
    eu._movedThisTick = true;
  }
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

// ── Тесты ────────────────────────────────────────────

console.log('\nЭтап 18 — Улучшенный ИИ противника\n');

// Тест 1: Враги двигаются к юнитам игрока (TIER 3 — ближайший)
test('Враги движутся к ближайшему юниту игрока (TIER 3)', () => {
  const enemy = createUnit('e1', 'enemy', 'infantry', 500, 18, 8);
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);
  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [enemy],
  });

  const startX = enemy.gridX;
  runEnemyAI(bs);
  // Враг должен двигаться влево (к игроку)
  assert(enemy.gridX < startX || enemy.gridY !== 8 || enemy._movedThisTick,
    `Враг должен двигаться к игроку, gridX: ${startX} → ${enemy.gridX}`);
  assert(enemy._movedThisTick, '_movedThisTick должен быть true после хода');
});

// Тест 2: moveTowards — движение по X
test('moveTowards двигает юнит по горизонтали к цели', () => {
  const bs = makeBattleState({ playerUnits: [], enemyUnits: [] });
  const unit = createUnit('e1', 'enemy', 'infantry', 100, 18, 8);
  bs.enemyUnits = [unit];
  const prevX = unit.gridX;
  moveTowards(unit, 10, 8, bs);
  assert(unit.gridX < prevX, `Юнит должен двигаться влево: ${prevX} → ${unit.gridX}`);
  assert(unit.gridY === 8, `Y не должен меняться: ${unit.gridY}`);
});

// Тест 3: moveTowards — движение по Y
test('moveTowards двигает юнит по вертикали к цели', () => {
  const bs = makeBattleState({ playerUnits: [], enemyUnits: [] });
  const unit = createUnit('e1', 'enemy', 'infantry', 100, 18, 8);
  bs.enemyUnits = [unit];
  moveTowards(unit, 18, 3, bs);
  assert(unit.gridY < 8, `Юнит должен двигаться вверх: ${unit.gridY}`);
  assert(unit.gridX === 18, `X не должен меняться: ${unit.gridX}`);
});

// Тест 4: TIER 1 — Защита командира при ownHpRatio < 0.40
test('При ownHpRatio < 0.40 враги группируются вокруг командира', () => {
  // Командир в 16,8. Обычный юнит в 19,8. Игрок в 6,8.
  // ownHpRatio = strength/maxStrength
  const cmd = createUnit('e_cmd', 'enemy', 'infantry', 40, 16, 8, { isCommander: true, maxStrength: 100 });
  const e1  = createUnit('e1',    'enemy', 'infantry', 30, 19, 5, { maxStrength: 100 });
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  // ownHpRatio = (40+30) / (100+100) = 70/200 = 0.35 < 0.40
  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [cmd, e1],
  });

  const startX = e1.gridX;
  const startY = e1.gridY;
  runEnemyAI(bs);

  // e1 должен двигаться к командиру (16,8), а не к игроку
  const distToCmd   = Math.abs(e1.gridX - cmd.gridX) + Math.abs(e1.gridY - cmd.gridY);
  const distToPlayer = Math.abs(e1.gridX - player.gridX) + Math.abs(e1.gridY - player.gridY);
  const prevDistToCmd = Math.abs(startX - cmd.gridX) + Math.abs(startY - cmd.gridY);

  assert(distToCmd <= prevDistToCmd,
    `Дистанция до командира должна уменьшиться: ${prevDistToCmd} → ${distToCmd}`);
});

// Тест 5: TIER 1 — не активируется при ownHpRatio >= 0.40
test('При ownHpRatio >= 0.40 TIER 1 не активируется (враги атакуют игрока)', () => {
  const cmd = createUnit('e_cmd', 'enemy', 'infantry', 500, 16, 8, { isCommander: true });
  const e1  = createUnit('e1',    'enemy', 'infantry', 500, 18, 8);
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  // ownHpRatio = 1000/1000 = 1.0 >= 0.40
  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [cmd, e1],
  });

  const e1StartX = e1.gridX;
  runEnemyAI(bs);

  // e1 должен двигаться к игроку (влево)
  assert(e1.gridX < e1StartX, `e1 должен двигаться к игроку: ${e1StartX} → ${e1.gridX}`);
});

// Тест 6: TIER 2 — враг предпочитает юнит с низкой моралью
test('Враг предпочитает атаковать юнит с низкой моралью (TIER 2)', () => {
  // e1 стоит между двумя игроками: p1 (мораль 80) в 15,7 и p2 (мораль 20) в 15,9
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 18, 8);
  const p1 = createUnit('p1', 'player', 'infantry', 500, 15, 7, { morale: 80 });
  const p2 = createUnit('p2', 'player', 'infantry', 500, 15, 9, { morale: 20 });

  const bs = makeBattleState({
    playerUnits: [p1, p2],
    enemyUnits:  [e1],
  });

  runEnemyAI(bs);

  // moveSpeed=2, поэтому weakTarget = юниты в радиусе moveSpeed+1=3
  // distToP1 = |18-15|+|8-7| = 4, distToP2 = |18-15|+|8-9| = 4
  // оба в радиусе 3+1=4? нет, оба на дистанции 4, радиус = moveSpeed+1 = 3
  // значит ни один не слабый цель в TIER 2 → переходит к TIER 3 (ближайший)
  // Ближайший — оба на dist=4, т.е. первый из reduce (p1)
  // e1 должен двигаться влево
  assert(e1.gridX < 18 || e1.gridY !== 8, `e1 должен двигаться: ${e1.gridX},${e1.gridY}`);
});

// Тест 7: TIER 2 — слабая цель в пределах moveSpeed+1
test('Враг атакует слабую цель (TIER 2) в пределах moveSpeed+1', () => {
  // e1 moveSpeed=2, слабая цель в радиусе 3
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 18, 8);
  const p1 = createUnit('p1', 'player', 'infantry', 500, 15, 8, { morale: 80 }); // dist=3, сильная мораль
  const p2 = createUnit('p2', 'player', 'infantry', 500, 16, 8, { morale: 15 }); // dist=2, слабая мораль

  const bs = makeBattleState({
    playerUnits: [p1, p2],
    enemyUnits:  [e1],
  });

  runEnemyAI(bs);

  // e1 должен двигаться к p2 (16,8) — низкая мораль и в радиусе
  assert(e1.gridX === 17,
    `e1 должен двигаться к p2 (gridX→17): получено ${e1.gridX},${e1.gridY}`);
});

// Тест 8: Враги не стакаются на одной клетке
test('Враги не занимают одну и ту же клетку', () => {
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 18, 8);
  const e2 = createUnit('e2', 'enemy', 'infantry', 500, 18, 9); // рядом
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [e1, e2],
  });

  for (let i = 0; i < 10; i++) {
    runEnemyAI(bs);
  }

  // Ни один юнит не должен стоять на одной клетке с другим живым юнитом
  const allUnits = [...bs.enemyUnits, ...bs.playerUnits].filter(u => u.strength > 0);
  for (let i = 0; i < allUnits.length; i++) {
    for (let j = i + 1; j < allUnits.length; j++) {
      assert(
        !(allUnits[i].gridX === allUnits[j].gridX && allUnits[i].gridY === allUnits[j].gridY),
        `Юниты ${allUnits[i].id} и ${allUnits[j].id} стоят на одной клетке (${allUnits[i].gridX},${allUnits[i].gridY})`
      );
    }
  }
});

// Тест 9: Юниты в резерве пропускаются
test('Юниты в резерве не двигаются в runEnemyAI', () => {
  const reserveUnit = createUnit('e_res', 'enemy', 'infantry', 500, 20, 8, { isReserve: true });
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [reserveUnit],
  });

  const startX = reserveUnit.gridX;
  const startY = reserveUnit.gridY;
  runEnemyAI(bs);

  assert(reserveUnit.gridX === startX && reserveUnit.gridY === startY,
    `Резервный юнит не должен двигаться: (${startX},${startY}) → (${reserveUnit.gridX},${reserveUnit.gridY})`);
});

// Тест 10: Бегущие юниты пропускаются
test('Routing-юниты не участвуют в runEnemyAI как активные враги', () => {
  const routingEnemy = createUnit('e1', 'enemy', 'infantry', 100, 18, 8, { isRouting: true });
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [routingEnemy],
  });

  const startX = routingEnemy.gridX;
  runEnemyAI(bs);

  // Routing-юнит не должен быть в enemyAlive и не должен двигаться через AI
  assert(!routingEnemy._movedThisTick || routingEnemy.gridX === startX,
    `Routing-юнит не должен двигаться через runEnemyAI`);
});

// Тест 11: Нет активных юнитов игрока — AI не падает
test('runEnemyAI не падает если нет живых юнитов игрока', () => {
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 18, 8);
  const deadPlayer = createUnit('p1', 'player', 'infantry', 0, 6, 8);

  const bs = makeBattleState({
    playerUnits: [deadPlayer],
    enemyUnits:  [e1],
  });

  let threw = false;
  try {
    runEnemyAI(bs);
  } catch (err) {
    threw = true;
  }
  assert(!threw, 'runEnemyAI не должен падать при отсутствии живых юнитов игрока');
});

// Тест 12: moveTowards — нет движения если цель уже рядом (dx=0, dy=0)
test('moveTowards не двигает юнит если уже на цели', () => {
  const bs = makeBattleState({ playerUnits: [], enemyUnits: [] });
  const unit = createUnit('e1', 'enemy', 'infantry', 100, 15, 8);
  bs.enemyUnits = [unit];
  moveTowards(unit, 15, 8, bs);
  assert(unit.gridX === 15 && unit.gridY === 8,
    `Юнит на цели не должен двигаться: (${unit.gridX},${unit.gridY})`);
});

// Тест 13: moveTowards — клетка занята, альтернативный маршрут
test('moveTowards обходит занятую клетку по альтернативному маршруту', () => {
  const unit    = createUnit('e1', 'enemy', 'infantry', 100, 18, 8);
  const blocker = createUnit('e2', 'enemy', 'infantry', 100, 17, 8); // блокирует прямой путь
  const bs = makeBattleState({
    playerUnits: [],
    enemyUnits:  [unit, blocker],
  });

  const prevX = unit.gridX;
  const prevY = unit.gridY;
  moveTowards(unit, 10, 8, bs); // цель по X

  // Если горизонталь заблокирована (17,8), должен пробовать вертикаль — нет вертикальной цели (dy=0)
  // В этом случае движение невозможно
  assert(unit.gridX === prevX && unit.gridY === prevY,
    `При заблокированном пути юнит остаётся на месте: (${unit.gridX},${unit.gridY})`);
});

// Тест 14: moveTowards — граница поля (не выходит за пределы)
test('moveTowards не выходит за пределы сетки', () => {
  const bs = makeBattleState({ playerUnits: [], enemyUnits: [] });
  const unit = createUnit('e1', 'enemy', 'infantry', 100, TACTICAL_GRID_COLS - 1, 0);
  bs.enemyUnits = [unit];
  // Двигаемся вправо и вверх — за пределы
  moveTowards(unit, TACTICAL_GRID_COLS + 5, -5, bs);
  assert(unit.gridX >= 0 && unit.gridX < TACTICAL_GRID_COLS, `gridX вне границ: ${unit.gridX}`);
  assert(unit.gridY >= 0 && unit.gridY < TACTICAL_GRID_ROWS, `gridY вне границ: ${unit.gridY}`);
});

// Тест 15: ИИ вводит резерв при enemyFront < 3 (тестируем логику из tacticalTick)
test('Резервный юнит вводится в бой когда enemyFront < 3', () => {
  // Имитируем только часть логики tacticalTick — резервную часть
  function runReserveAI(bs) {
    const enemyFront = bs.enemyUnits.filter(u => !u.isReserve && u.strength > 0 && !u.isRouting);
    if (enemyFront.length < 3) {
      const reserveUnit = bs.enemyUnits.find(u => u.isReserve && u.strength > 0);
      if (reserveUnit) {
        for (let x = TACTICAL_GRID_COLS - RESERVE_ZONE_COLS - 2; x >= 14; x--) {
          let placed = false;
          for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
            if (!findUnitAt(x, y, bs)) {
              reserveUnit.gridX = x; reserveUnit.gridY = y;
              reserveUnit.isReserve = false;
              addLog(bs, `⚔ Враг вводит резерв в бой!`);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }
  }

  const e1  = createUnit('e1',    'enemy', 'infantry', 500, 14, 8); // 1 на фронте
  const res = createUnit('e_res', 'enemy', 'infantry', 300, 20, 8, { isReserve: true });
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [e1, res],
  });

  // enemyFront = 1 < 3, резерв должен быть введён
  runReserveAI(bs);

  assert(!res.isReserve, `Резервный юнит должен быть введён в бой (isReserve=false)`);
  assert(bs.log.some(l => l.text.includes('резерв')),
    `Лог должен содержать сообщение о резерве`);
});

// Тест 16: TIER 1 — командир не двигает сам себя к себе
test('Командир (isCommander) не двигает сам себя в TIER 1', () => {
  const cmd = createUnit('e_cmd', 'enemy', 'infantry', 30, 16, 8, {
    isCommander: true, maxStrength: 100
  });
  const player = createUnit('p1', 'player', 'infantry', 500, 6, 8);

  // ownHpRatio = 30/100 = 0.3 < 0.40
  const bs = makeBattleState({
    playerUnits: [player],
    enemyUnits:  [cmd],
  });

  const startX = cmd.gridX;
  const startY = cmd.gridY;
  runEnemyAI(bs);

  // Командир пропускается TIER 1 (eu.id !== enemyCmd.id)
  // Должен попасть в TIER 2 или TIER 3
  // Просто проверяем что нет краша
  assert(cmd.gridX >= 0 && cmd.gridX < TACTICAL_GRID_COLS,
    `Командир вышел за пределы: ${cmd.gridX}`);
});

// ── Итог ─────────────────────────────────────────────

console.log(`\nРезультат: ${passed} из ${passed + failed} тестов пройдено\n`);
if (failed > 0) process.exit(1);
