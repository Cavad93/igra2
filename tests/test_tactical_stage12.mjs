// Тесты Этапа 12 — Паника и бегство
// Запуск: node tests/test_tactical_stage12.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const UNIT_BASE_SIZE     = 400;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн: вспомогательные функции ─────────────────

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
}

function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
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
    ...extra
  };
}

function makeBattleState(playerUnits = [], enemyUnits = []) {
  return {
    playerUnits,
    enemyUnits,
    turn: 1,
    log: [],
    elevatedCells: new Set()
  };
}

// ── Инлайн: processPanic ─────────────────────────────
function processPanic(bs) {
  const allUnits = [...bs.playerUnits, ...bs.enemyUnits];

  for (const unit of allUnits) {
    if (unit.strength === 0) continue;

    if (!unit.isRouting && unit.morale <= 20) {
      unit.isRouting = true;
      addLog(bs, `💀 ${unit.type} (${unit.side === 'player' ? 'наши' : 'враги'}) обратились в бегство!`);

      const allies = (unit.side === 'player' ? bs.playerUnits : bs.enemyUnits)
        .filter(u => u.id !== unit.id && u.strength > 0 && !u.isRouting &&
          Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridY - unit.gridY) <= 2);
      for (const ally of allies) {
        ally.morale = Math.max(0, ally.morale - 15);
        if (allies.length > 0)
          addLog(bs, `😱 Паника распространяется на ${ally.type}! (-15 мораль)`);
      }
    }

    if (unit.isRouting && unit.strength > 0) {
      const retreatDir = unit.side === 'player' ? -1 : 1;
      const nx = unit.gridX + retreatDir;
      if (nx < 0 || nx >= TACTICAL_GRID_COLS) {
        addLog(bs, `🏃 ${unit.type} покинули поле боя (потеряны)`);
        unit.strength = 0;
      } else if (!findUnitAt(nx, unit.gridY, bs)) {
        unit.gridX = nx;
      }
    }
  }
}

// ── Инлайн: processCommanderRally ───────────────────
function processCommanderRally(bs, forceRally = false) {
  for (const side of ['player', 'enemy']) {
    const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;
    const cmd   = units.find(u => u.isCommander && u.strength > 0);
    if (!cmd) continue;

    const routing = units.filter(u => u.isRouting && u.strength > 0 &&
      Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= 2);

    for (const ru of routing) {
      if (forceRally || Math.random() < 0.30) {
        ru.isRouting = false;
        ru.morale    = 30;
        addLog(bs, `★ Командир остановил бегущих ${ru.type}!`);
      }
    }
  }
}

// ── Тесты ───────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

// ── Тест 1: мораль ≤ 20 → isRouting = true ──────────
console.log('\nТест 1: Юнит с моралью ≤ 20 становится routing');
test('Юнит с morale=15 становится isRouting после processPanic', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  unit.morale = 15;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  assert(unit.isRouting === true, `isRouting должен быть true, но: ${unit.isRouting}`);
});

test('Юнит с morale=20 становится isRouting (граничное значение)', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  unit.morale = 20;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  assert(unit.isRouting === true, `isRouting должен быть true при morale=20`);
});

test('Юнит с morale=21 НЕ становится routing', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  unit.morale = 21;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  assert(unit.isRouting === false, `isRouting должен быть false при morale=21`);
});

// ── Тест 2: лог при панике ───────────────────────────
console.log('\nТест 2: Лог при обращении в бегство');
test('Лог содержит "обратились в бегство" при routing', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  unit.morale = 10;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  const hasLog = bs.log.some(l => l.text.includes('обратились в бегство'));
  assert(hasLog, 'Лог должен содержать "обратились в бегство"');
});

test('Лог содержит "наши" для игрока и "враги" для врага', () => {
  const pu = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  pu.morale = 10;
  const eu = createUnit('e_inf_0', 'enemy',  'infantry', 500, 15, 7);
  eu.morale = 10;
  const bs = makeBattleState([pu], [eu]);
  processPanic(bs);
  const playerLog = bs.log.find(l => l.text.includes('наши'));
  const enemyLog  = bs.log.find(l => l.text.includes('враги'));
  assert(playerLog, 'Лог должен содержать "наши"');
  assert(enemyLog, 'Лог должен содержать "враги"');
});

// ── Тест 3: эффект домино ────────────────────────────
console.log('\nТест 3: Эффект домино — соседи теряют мораль');
test('Соседний союзник (расстояние 1) теряет 15 морали при панике', () => {
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  routing.morale = 10;
  const neighbor = createUnit('p_inf_1', 'player', 'infantry', 500, 6, 7);
  neighbor.morale = 70;
  const bs = makeBattleState([routing, neighbor], []);
  processPanic(bs);
  assert(neighbor.morale === 55, `Мораль соседа должна быть 55, но: ${neighbor.morale}`);
});

test('Союзник на расстоянии 2 теряет 15 морали', () => {
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  routing.morale = 10;
  const neighbor = createUnit('p_inf_1', 'player', 'infantry', 500, 7, 7);
  neighbor.morale = 80;
  const bs = makeBattleState([routing, neighbor], []);
  processPanic(bs);
  assert(neighbor.morale === 65, `Мораль соседа должна быть 65, но: ${neighbor.morale}`);
});

test('Союзник на расстоянии 3 НЕ теряет мораль', () => {
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  routing.morale = 10;
  const far = createUnit('p_inf_1', 'player', 'infantry', 500, 8, 7);
  far.morale = 80;
  const bs = makeBattleState([routing, far], []);
  processPanic(bs);
  assert(far.morale === 80, `Мораль дальнего юнита не должна измениться, но: ${far.morale}`);
});

test('Вражеские юниты НЕ теряют мораль от паники игрока', () => {
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  routing.morale = 10;
  const enemy = createUnit('e_inf_0', 'enemy', 'infantry', 500, 6, 7);
  enemy.morale = 80;
  const bs = makeBattleState([routing], [enemy]);
  processPanic(bs);
  assert(enemy.morale === 80, `Мораль врага не должна меняться от паники игрока, но: ${enemy.morale}`);
});

// ── Тест 4: движение routing-юнита ──────────────────
console.log('\nТест 4: Routing-юнит движется назад');
test('Routing-юнит игрока движется влево (retreatDir = -1)', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  unit.isRouting = true;
  unit.morale = 10; // уже routing, не запустит домино
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  assert(unit.gridX === 4, `Юнит должен переместиться на gridX=4, но: ${unit.gridX}`);
});

test('Routing-юнит врага движется вправо (retreatDir = +1)', () => {
  const unit = createUnit('e_inf_0', 'enemy', 'infantry', 500, 15, 7);
  unit.isRouting = true;
  unit.morale = 10;
  const bs = makeBattleState([], [unit]);
  processPanic(bs);
  assert(unit.gridX === 16, `Юнит врага должен переместиться на gridX=16, но: ${unit.gridX}`);
});

test('Routing-юнит не движется если клетка занята', () => {
  const routing  = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  routing.isRouting = true;
  routing.morale    = 10;
  const blocker  = createUnit('p_inf_1', 'player', 'infantry', 500, 4, 7);
  blocker.morale = 80;
  const bs = makeBattleState([routing, blocker], []);
  processPanic(bs);
  assert(routing.gridX === 5, `Заблокированный юнит должен остаться на gridX=5, но: ${routing.gridX}`);
});

// ── Тест 5: выход за край карты ─────────────────────
console.log('\nТест 5: Выход за край карты');
test('Routing-юнит игрока на gridX=0 → strength=0 (потерян)', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 0, 7);
  unit.isRouting = true;
  unit.morale = 10;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  assert(unit.strength === 0, `strength должен быть 0 при выходе за карту, но: ${unit.strength}`);
});

test('Лог содержит "покинули поле боя" при выходе за край', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 0, 7);
  unit.isRouting = true;
  unit.morale = 10;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  const hasLog = bs.log.some(l => l.text.includes('покинули поле боя'));
  assert(hasLog, 'Лог должен содержать "покинули поле боя"');
});

test('Routing-юнит врага на gridX=21 → strength=0 (последняя колонка)', () => {
  const unit = createUnit('e_inf_0', 'enemy', 'infantry', 500, 21, 7);
  unit.isRouting = true;
  unit.morale = 10;
  const bs = makeBattleState([], [unit]);
  processPanic(bs);
  assert(unit.strength === 0, `strength врага должен быть 0 при выходе за край, но: ${unit.strength}`);
});

// ── Тест 6: юнит с strength=0 не обрабатывается ─────
console.log('\nТест 6: Мёртвые юниты игнорируются');
test('Юнит с strength=0 НЕ становится routing даже при morale=0', () => {
  const unit = createUnit('p_inf_0', 'player', 'infantry', 0, 5, 7);
  unit.morale = 0;
  const bs = makeBattleState([unit], []);
  processPanic(bs);
  assert(unit.isRouting === false, `Мёртвый юнит не должен получать isRouting`);
});

// ── Тест 7: паника не распространяется без routing ───
console.log('\nТест 7: Паника не распространяется если нет routing-юнитов');
test('Без routing-юнитов мораль союзников не изменяется', () => {
  const u1 = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  u1.morale = 80;
  const u2 = createUnit('p_inf_1', 'player', 'infantry', 500, 6, 7);
  u2.morale = 80;
  const bs = makeBattleState([u1, u2], []);
  processPanic(bs);
  assert(u1.morale === 80, `Мораль u1 должна остаться 80, но: ${u1.morale}`);
  assert(u2.morale === 80, `Мораль u2 должна остаться 80, но: ${u2.morale}`);
});

// ── Тест 8: processCommanderRally ───────────────────
console.log('\nТест 8: Командир останавливает бегущих');
test('Командир в радиусе 2 останавливает routing-юнит (forceRally)', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  routing.isRouting = true;
  const bs = makeBattleState([cmd, routing], []);
  processCommanderRally(bs, true); // forceRally=true для теста
  assert(routing.isRouting === false, `isRouting должен быть false после rally`);
  assert(routing.morale === 30, `Мораль должна восстановиться до 30, но: ${routing.morale}`);
});

test('Лог содержит "Командир остановил" при rally', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  routing.isRouting = true;
  const bs = makeBattleState([cmd, routing], []);
  processCommanderRally(bs, true);
  const hasLog = bs.log.some(l => l.text.includes('Командир остановил'));
  assert(hasLog, 'Лог должен содержать "Командир остановил"');
});

test('Командир НЕ останавливает routing-юнит вне радиуса (расстояние 3)', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 8, 7);
  routing.isRouting = true;
  const bs = makeBattleState([cmd, routing], []);
  processCommanderRally(bs, true);
  assert(routing.isRouting === true, `Юнит вне радиуса не должен быть остановлен командиром`);
});

test('Мёртвый командир (strength=0) НЕ останавливает бегущих', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 0, 5, 7, { isCommander: true });
  const routing = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  routing.isRouting = true;
  const bs = makeBattleState([cmd, routing], []);
  processCommanderRally(bs, true);
  assert(routing.isRouting === true, `Мёртвый командир не должен останавливать бегущих`);
});

test('Без командира processCommanderRally не вызывает ошибок', () => {
  const u = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  u.isRouting = true;
  const bs = makeBattleState([u], []);
  processCommanderRally(bs); // не должно бросить ошибку
  assert(true, 'Вызов без командира не должен падать');
});

// ── Итог ───────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Итог: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) {
  console.error('❌ Есть провалившиеся тесты!');
  process.exit(1);
} else {
  console.log('✅ Все тесты пройдены!');
}
