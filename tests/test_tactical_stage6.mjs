// Тесты Этапа 6 — управление мышью: выбор и перемещение юнитов
// Запуск: node tests/test_tactical_stage6.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const UNIT_BASE_SIZE     = 400;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн createUnit ────────────────────────────────
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

// ── Инлайн-логика Stage 6 ────────────────────────────

function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
}

function getSelectedUnit(bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.id === bs.selectedUnitId) ?? null;
}

function isCellFree(gridX, gridY, bs) {
  return !findUnitAt(gridX, gridY, bs);
}

function updateUnitPanel(unit, bs) { /* TODO: этап 7 */ }

function selectUnit(unit, bs) {
  [...bs.playerUnits, ...bs.enemyUnits].forEach(u => u.selected = false);
  if (unit) { unit.selected = true; bs.selectedUnitId = unit.id; }
  else       { bs.selectedUnitId = null; }
  updateUnitPanel(unit, bs);
}

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
}

// Упрощённая симуляция клика
function simulateClick(gridX, gridY, bs) {
  if (gridX < 0 || gridX >= TACTICAL_GRID_COLS) return;
  if (gridY < 0 || gridY >= TACTICAL_GRID_ROWS) return;

  const clicked  = findUnitAt(gridX, gridY, bs);
  const selected = getSelectedUnit(bs);

  if (!selected) {
    if (clicked?.side === 'player') selectUnit(clicked, bs);
  } else if (clicked?.side === 'player') {
    selectUnit(clicked, bs);
  } else if (!clicked) {
    const dist = Math.abs(gridX - selected.gridX) + Math.abs(gridY - selected.gridY);
    if (dist <= selected.moveSpeed && isCellFree(gridX, gridY, bs)) {
      selected.gridX = gridX;
      selected.gridY = gridY;
      addLog(bs, `Юнит перемещён на (${gridX},${gridY})`);
    }
  } else if (clicked?.side === 'enemy') {
    addLog(bs, `Атака врага запланирована (Этап 8)`);
  }
}

// ── Фабрика battleState ───────────────────────────────
function makeBs() {
  const playerUnits = [
    createUnit('p_inf_0',  'player', 'infantry', 500,  4, 7),
    createUnit('p_cav_0',  'player', 'cavalry',  300,  5, 8),
    createUnit('p_arc_0',  'player', 'archers',  200,  4, 9),
    createUnit('p_cmd',    'player', 'infantry',  50,  5, 7, { isCommander: true, moveSpeed: 3 }),
  ];
  const enemyUnits = [
    createUnit('e_inf_0',  'enemy',  'infantry', 600, 15, 7),
    createUnit('e_cmd',    'enemy',  'infantry',  50, 16, 8, { isCommander: true, moveSpeed: 3 }),
  ];
  return {
    playerUnits,
    enemyUnits,
    terrain: 'plains',
    elevatedCells: new Set(),
    turn: 0,
    phase: 'battle',
    log: [],
    selectedUnitId: null,
  };
}

// ── Тесты ────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? ''}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ═══════════════════════════════════════════════════
console.log('\n── findUnitAt ──────────────────────────────────');

test('findUnitAt возвращает юнит на нужной клетке', () => {
  const bs = makeBs();
  const u = findUnitAt(4, 7, bs);
  assert(u !== null, 'должен найти юнит');
  assertEqual(u.id, 'p_inf_0');
});

test('findUnitAt возвращает null на пустой клетке', () => {
  const bs = makeBs();
  const u = findUnitAt(10, 10, bs);
  assert(u === null, 'пустая клетка должна вернуть null');
});

test('findUnitAt игнорирует юниты с strength=0', () => {
  const bs = makeBs();
  bs.playerUnits[0].strength = 0;
  const u = findUnitAt(4, 7, bs);
  assert(u === null, 'юнит с 0 силой должен быть невидим');
});

test('findUnitAt находит вражеский юнит', () => {
  const bs = makeBs();
  const u = findUnitAt(15, 7, bs);
  assert(u !== null);
  assertEqual(u.side, 'enemy');
});

// ═══════════════════════════════════════════════════
console.log('\n── isCellFree ──────────────────────────────────');

test('isCellFree возвращает false на занятой клетке', () => {
  const bs = makeBs();
  assert(!isCellFree(4, 7, bs), 'клетка (4,7) занята');
});

test('isCellFree возвращает true на пустой клетке', () => {
  const bs = makeBs();
  assert(isCellFree(10, 10, bs), 'клетка (10,10) свободна');
});

// ═══════════════════════════════════════════════════
console.log('\n── selectUnit ──────────────────────────────────');

test('selectUnit устанавливает selected=true на юните', () => {
  const bs = makeBs();
  const unit = bs.playerUnits[0];
  selectUnit(unit, bs);
  assert(unit.selected === true, 'selected должен быть true');
  assertEqual(bs.selectedUnitId, unit.id);
});

test('selectUnit сбрасывает selected на других юнитах', () => {
  const bs = makeBs();
  bs.playerUnits[1].selected = true;
  selectUnit(bs.playerUnits[0], bs);
  assert(!bs.playerUnits[1].selected, 'предыдущий выбор должен сброситься');
  assert(bs.playerUnits[0].selected === true);
});

test('selectUnit(null) сбрасывает selectedUnitId', () => {
  const bs = makeBs();
  selectUnit(bs.playerUnits[0], bs);
  selectUnit(null, bs);
  assert(bs.selectedUnitId === null, 'selectedUnitId должен стать null');
  assert(!bs.playerUnits[0].selected, 'selected должен сброситься');
});

// ═══════════════════════════════════════════════════
console.log('\n── getSelectedUnit ─────────────────────────────');

test('getSelectedUnit возвращает null если ничего не выбрано', () => {
  const bs = makeBs();
  assert(getSelectedUnit(bs) === null);
});

test('getSelectedUnit возвращает выбранный юнит', () => {
  const bs = makeBs();
  selectUnit(bs.playerUnits[0], bs);
  const sel = getSelectedUnit(bs);
  assert(sel !== null);
  assertEqual(sel.id, 'p_inf_0');
});

// ═══════════════════════════════════════════════════
console.log('\n── simulateClick (перемещение) ─────────────────');

test('клик на свой юнит — выбирает его', () => {
  const bs = makeBs();
  simulateClick(4, 7, bs); // юнит p_inf_0
  assert(bs.playerUnits[0].selected === true, 'должен выбраться');
});

test('клик на пустую соседнюю клетку — перемещает', () => {
  const bs = makeBs();
  simulateClick(4, 7, bs); // выбрать p_inf_0 (moveSpeed=2)
  simulateClick(6, 7, bs); // сдвинуть на 2 клетки вправо
  assertEqual(bs.playerUnits[0].gridX, 6, 'gridX должен обновиться');
  assertEqual(bs.playerUnits[0].gridY, 7, 'gridY не изменился');
});

test('клик дальше moveSpeed (>2) — юнит не двигается', () => {
  const bs = makeBs();
  simulateClick(4, 7, bs); // выбрать p_inf_0 (пехота, moveSpeed=2)
  simulateClick(9, 7, bs); // расстояние 5 — слишком далеко
  assertEqual(bs.playerUnits[0].gridX, 4, 'юнит не должен переместиться');
});

test('клик на занятую клетку — юнит не двигается', () => {
  const bs = makeBs();
  simulateClick(4, 7, bs); // выбрать p_inf_0
  simulateClick(4, 9, bs); // клетка (4,9) занята p_arc_0
  assertEqual(bs.playerUnits[0].gridX, 4, 'юнит не переместился на занятую клетку');
});

test('кавалерия (moveSpeed=4) может переместиться на 4 клетки', () => {
  const bs = makeBs();
  simulateClick(5, 8, bs); // выбрать p_cav_0 (кавалерия, moveSpeed=4)
  simulateClick(9, 8, bs); // расстояние 4 — ровно moveSpeed
  assertEqual(bs.playerUnits[1].gridX, 9, 'кавалерия переместилась на 4 клетки');
});

test('клик на вражеский юнит — добавляет запись в лог', () => {
  const bs = makeBs();
  simulateClick(4, 7, bs); // выбрать свой юнит
  simulateClick(15, 7, bs); // кликнуть на врага
  assert(bs.log.length > 0, 'лог должен пополниться');
  assert(bs.log[0].text.includes('Этап 8'), 'лог упоминает Этап 8');
});

test('переключение выбора между своими юнитами', () => {
  const bs = makeBs();
  simulateClick(4, 7, bs); // выбрать p_inf_0
  simulateClick(5, 8, bs); // выбрать p_cav_0
  assert(!bs.playerUnits[0].selected, 'p_inf_0 снят с выбора');
  assert(bs.playerUnits[1].selected === true, 'p_cav_0 выбран');
  assertEqual(bs.selectedUnitId, 'p_cav_0');
});

// ═══════════════════════════════════════════════════
console.log('\n── addLog ──────────────────────────────────────');

test('addLog добавляет запись в начало списка', () => {
  const bs = makeBs();
  addLog(bs, 'тест сообщение');
  assertEqual(bs.log.length, 1);
  assertEqual(bs.log[0].text, 'тест сообщение');
  assertEqual(bs.log[0].turn, 0);
});

test('addLog не хранит более 20 записей', () => {
  const bs = makeBs();
  for (let i = 0; i < 25; i++) addLog(bs, `msg ${i}`);
  assert(bs.log.length <= 20, `лог не должен превышать 20, сейчас: ${bs.log.length}`);
});

test('addLog ставит свежие записи первыми (unshift)', () => {
  const bs = makeBs();
  addLog(bs, 'первое');
  addLog(bs, 'второе');
  assertEqual(bs.log[0].text, 'второе', 'последняя запись — первая');
  assertEqual(bs.log[1].text, 'первое');
});

// ═══════════════════════════════════════════════════
console.log('\n── Итог ────────────────────────────────────────');
console.log(`  Пройдено: ${passed}  Провалено: ${failed}`);
if (failed > 0) process.exit(1);
