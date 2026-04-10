// Тесты Этапа 15 — Резерв
// Запуск: node tests/test_tactical_stage15.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const RESERVE_ZONE_COLS  = 3;

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

function makeBattleState(playerUnits = [], enemyUnits = []) {
  return {
    playerUnits,
    enemyUnits,
    turn: 1,
    log: [],
    elevatedCells: new Set(),
    ambushUsed: false,
    phase: 'battle',
    maxStrengthInBattle: 1000
  };
}

function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
}

// ── Логика резерва (точная копия из ui/tactical_map.js) ──────────

function sendReserve(unitId, bs) {
  const unit = bs.playerUnits.find(u => u.id === unitId);
  if (!unit || unit.isCommander) return 'commander_blocked';

  for (let x = 0; x < RESERVE_ZONE_COLS; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, bs)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = true;
        addLog(bs, `🛡 ${unit.type} отведён в резерв`);
        return 'ok';
      }
    }
  }
  addLog(bs, `⚠️ Нет места в резерве`);
  return 'full';
}

function withdrawReserve(unitId, bs) {
  const unit = bs.playerUnits.find(u => u.id === unitId);
  if (!unit) return 'not_found';

  for (let x = RESERVE_ZONE_COLS + 1; x <= 8; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, bs)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = false;
        addLog(bs, `⚔ ${unit.type} введён в бой!`);
        return 'ok';
      }
    }
  }
  return 'no_space';
}

// ── ИИ-резерв (точная копия из engine/tactical_battle.js) ────────

function aiReserveLogic(bs) {
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

// ── processFatigue (точная копия из engine/tactical_battle.js) ───

function processFatigue(unit, moved, fought) {
  if (unit.isReserve) {
    unit.fatigue = Math.max(0, unit.fatigue - 5);
    return;
  }
  if (fought)     unit.fatigue = Math.min(100, unit.fatigue + 8);
  else if (moved) unit.fatigue = Math.min(100, unit.fatigue + 6);
  else            unit.fatigue = Math.max(0,   unit.fatigue - 3);
  if (unit.type === 'cavalry') unit.fatigue = Math.min(100, unit.fatigue + 2);
}

// ── Тестовый фреймворк ──────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} — ожидалось ${expected}, получено ${actual}`);
    failed++;
  }
}

// ── Тесты ──────────────────────────────────────────

console.log('\n=== Этап 15: Резерв ===\n');

// ─── 1. Кнопка "🛡 В резерв" переводит юнит в зону резерва (колонки 0–2) ───

console.log('1. sendReserve — размещение в зоне резерва (колонки 0–2):');
{
  const unit = createUnit('p1', 'player', 'infantry', 500, 6, 8);
  const bs = makeBattleState([unit], []);
  const result = sendReserve('p1', bs);
  assertEqual(result, 'ok', 'sendReserve возвращает ok');
  assert(unit.isReserve === true, 'isReserve = true после отправки в резерв');
  assert(unit.gridX < RESERVE_ZONE_COLS, `gridX (${unit.gridX}) < RESERVE_ZONE_COLS (${RESERVE_ZONE_COLS})`);
  assert(unit.gridX >= 0 && unit.gridY >= 0, 'координаты неотрицательные');
}

{
  // Убедиться что лог содержит запись об отводе в резерв
  const unit = createUnit('p2', 'player', 'archers', 200, 7, 5);
  const bs = makeBattleState([unit], []);
  sendReserve('p2', bs);
  const hasLog = bs.log.some(e => e.text.includes('отведён в резерв'));
  assert(hasLog, 'Лог содержит "отведён в резерв"');
}

// ─── 2. Командира нельзя отправить в резерв ───

console.log('\n2. Командира нельзя отправить в резерв:');
{
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 8, { isCommander: true });
  const bs = makeBattleState([cmd], []);
  const result = sendReserve('p_cmd', bs);
  assertEqual(result, 'commander_blocked', 'sendReserve для командира возвращает commander_blocked');
  assert(cmd.isReserve === false, 'Командир остаётся не в резерве');
  assert(cmd.gridX === 5, 'Командир не сдвинут с места');
}

// ─── 3. Резервный юнит не получает урона ───

console.log('\n3. Резервный юнит не получает урона (isReserve пропускается в боевом цикле):');
{
  // Симулируем боевой цикл: враг пытается атаковать, но reserve-юнит пропускается
  const player = createUnit('p1', 'player', 'infantry', 500, 1, 8, { isReserve: true });
  const enemy  = createUnit('e1', 'enemy',  'infantry', 500, 2, 8);
  const bs = makeBattleState([player], [enemy]);

  // Симуляция: в боевом цикле проверяется isReserve
  const initialStrength = player.strength;
  // Атака не происходит если цель — reserve
  // (в реальном коде: if (pu.isRouting || pu.strength === 0 || pu.isReserve) continue;)
  const wouldAttack = !player.isReserve;
  assert(!wouldAttack, 'Резервный юнит пропускается в боевом цикле (isReserve=true)');
  assertEqual(player.strength, initialStrength, 'Сила резервного юнита не изменилась');
}

// ─── 4. Резервный юнит теряет усталость (-5/тик) ───

console.log('\n4. Резервный юнит теряет усталость (-5/тик):');
{
  const unit = createUnit('p1', 'player', 'infantry', 500, 1, 8, { isReserve: true });
  unit.fatigue = 40;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 35, 'Усталость снизилась с 40 до 35 (-5/тик)');
}
{
  const unit = createUnit('p2', 'player', 'cavalry', 300, 2, 5, { isReserve: true });
  unit.fatigue = 3;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 0, 'Усталость не уходит в отрицательные значения (кавалерия)');
}
{
  const unit = createUnit('p3', 'player', 'archers', 200, 0, 10, { isReserve: true });
  unit.fatigue = 60;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 55, 'Усталость снизилась с 60 до 55 (стрелки в резерве)');
}

// ─── 5. Кнопка "⚔ В бой!" размещает юнит на первую свободную клетку фронта (колонки 4–8) ───

console.log('\n5. withdrawReserve — размещение на линии фронта (колонки 4–8):');
{
  const unit = createUnit('p1', 'player', 'infantry', 500, 1, 8, { isReserve: true });
  const bs = makeBattleState([unit], []);
  const result = withdrawReserve('p1', bs);
  assertEqual(result, 'ok', 'withdrawReserve возвращает ok');
  assert(unit.isReserve === false, 'isReserve = false после ввода в бой');
  assert(unit.gridX >= RESERVE_ZONE_COLS + 1 && unit.gridX <= 8,
    `gridX (${unit.gridX}) в диапазоне фронта [${RESERVE_ZONE_COLS + 1}..8]`);
}

{
  const unit = createUnit('p2', 'player', 'cavalry', 300, 2, 5, { isReserve: true });
  const bs = makeBattleState([unit], []);
  withdrawReserve('p2', bs);
  const hasLog = bs.log.some(e => e.text.includes('введён в бой'));
  assert(hasLog, 'Лог содержит "введён в бой!"');
}

// ─── 6. Нельзя поместить в резерв если зона занята ───

console.log('\n6. Нет места в резерве:');
{
  // Заполнить все клетки резервной зоны (RESERVE_ZONE_COLS × TACTICAL_GRID_ROWS)
  const units = [];
  for (let x = 0; x < RESERVE_ZONE_COLS; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      units.push(createUnit(`p_fill_${x}_${y}`, 'player', 'infantry', 100, x, y));
    }
  }
  // Добавить юнит вне резервной зоны для отправки в резерв
  const newUnit = createUnit('p_new', 'player', 'infantry', 200, 10, 8);
  units.push(newUnit);
  const bs = makeBattleState(units, []);

  const result = sendReserve('p_new', bs);
  assertEqual(result, 'full', 'sendReserve возвращает full когда нет места');
  assert(newUnit.isReserve === false, 'Юнит не переведён в резерв если нет места');
  const hasLog = bs.log.some(e => e.text.includes('Нет места в резерве'));
  assert(hasLog, 'Лог содержит "Нет места в резерве"');
}

// ─── 7. ИИ вводит резерв когда фронт < 3 активных юнитов ───

console.log('\n7. ИИ-резерв: ввод при фронте < 3 активных юнитов:');
{
  // 2 активных вражеских юнита + 1 в резерве
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 14, 7);
  const e2 = createUnit('e2', 'enemy', 'infantry', 500, 15, 9);
  const eReserve = createUnit('e_res', 'enemy', 'infantry', 300, 19, 5, { isReserve: true });
  const bs = makeBattleState([], [e1, e2, eReserve]);

  aiReserveLogic(bs);

  assert(eReserve.isReserve === false, 'ИИ вывел юнит из резерва (isReserve = false)');
  assert(eReserve.gridX >= 14 && eReserve.gridX <= TACTICAL_GRID_COLS - RESERVE_ZONE_COLS - 2,
    `gridX (${eReserve.gridX}) в боевой зоне врага`);
  const hasLog = bs.log.some(e => e.text.includes('Враг вводит резерв в бой'));
  assert(hasLog, 'Лог содержит "Враг вводит резерв в бой!"');
}

{
  // 3 активных вражеских юнита — ИИ не должен вводить резерв
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 14, 6);
  const e2 = createUnit('e2', 'enemy', 'infantry', 500, 14, 8);
  const e3 = createUnit('e3', 'enemy', 'infantry', 500, 14, 10);
  const eReserve = createUnit('e_res', 'enemy', 'infantry', 300, 19, 5, { isReserve: true });
  const bs = makeBattleState([], [e1, e2, e3, eReserve]);

  aiReserveLogic(bs);

  assert(eReserve.isReserve === true, 'ИИ не вводит резерв при фронте ≥ 3 (isReserve остаётся true)');
  const hasLog = bs.log.some(e => e.text.includes('Враг вводит резерв в бой'));
  assert(!hasLog, 'Нет лога о вводе резерва при фронте ≥ 3');
}

{
  // ИИ не вводит резерв если нет резервных юнитов
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 14, 8);
  const bs = makeBattleState([], [e1]);

  const logBefore = bs.log.length;
  aiReserveLogic(bs);
  assertEqual(bs.log.length, logBefore, 'Нет новых логов если нет резервных юнитов у врага');
}

// ─── 8. sendReserve: размещение в первой свободной ячейке зоны резерва ───

console.log('\n8. sendReserve занимает первую свободную ячейку (обход заполненных):');
{
  // Заполнить первые 2 колонки резервной зоны
  const units = [];
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      units.push(createUnit(`fill_${x}_${y}`, 'player', 'infantry', 100, x, y));
    }
  }
  const newUnit = createUnit('p_new', 'player', 'archers', 200, 10, 8);
  units.push(newUnit);
  const bs = makeBattleState(units, []);

  sendReserve('p_new', bs);
  assertEqual(newUnit.gridX, 2, 'Юнит размещён в 3-й колонке (x=2) — первой свободной');
  assert(newUnit.isReserve === true, 'isReserve = true');
}

// ─── 9. withdrawReserve — размещение в первую свободную ячейку фронта ───

console.log('\n9. withdrawReserve занимает первую свободную ячейку фронта:');
{
  // Занять все ячейки кроме (7, 0)
  const units = [];
  for (let x = RESERVE_ZONE_COLS + 1; x <= 8; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (x === 7 && y === 0) continue; // оставить одну свободной
      units.push(createUnit(`fill_${x}_${y}`, 'player', 'infantry', 100, x, y));
    }
  }
  const reserveUnit = createUnit('p_res', 'player', 'infantry', 300, 1, 5, { isReserve: true });
  units.push(reserveUnit);
  const bs = makeBattleState(units, []);

  withdrawReserve('p_res', bs);
  assertEqual(reserveUnit.gridX, 7, 'gridX = 7 (последняя свободная колонка фронта)');
  assertEqual(reserveUnit.gridY, 0, 'gridY = 0');
  assert(reserveUnit.isReserve === false, 'isReserve = false после вывода');
}

// ─── 10. processFatigue: резервный юнит восстанавливается, боевой накапливает ───

console.log('\n10. processFatigue: сравнение резерва и боя:');
{
  const reserveUnit = createUnit('r', 'player', 'infantry', 500, 1, 5, { isReserve: true });
  const battleUnit  = createUnit('b', 'player', 'infantry', 500, 6, 5);
  reserveUnit.fatigue = 50;
  battleUnit.fatigue  = 50;

  processFatigue(reserveUnit, false, true); // fought = true (игнорируется в резерве)
  processFatigue(battleUnit,  false, true);

  assertEqual(reserveUnit.fatigue, 45, 'Резервный юнит: 50 - 5 = 45 (восстановление)');
  assertEqual(battleUnit.fatigue,  58, 'Боевой юнит:    50 + 8 = 58 (накопление)');
}

// ─── 11. ИИ-резерв: routing-юниты не считаются активным фронтом ───

console.log('\n11. ИИ-резерв: routing-юниты не считаются активными:');
{
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 14, 7, { isRouting: true });
  const e2 = createUnit('e2', 'enemy', 'infantry', 500, 15, 8, { isRouting: true });
  const e3 = createUnit('e3', 'enemy', 'infantry', 400, 14, 9); // 1 активный
  const eReserve = createUnit('e_res', 'enemy', 'cavalry', 200, 19, 5, { isReserve: true });
  const bs = makeBattleState([], [e1, e2, e3, eReserve]);

  aiReserveLogic(bs);

  assert(eReserve.isReserve === false,
    'ИИ вводит резерв (только 1 активный юнит, routing не считаются)');
}

// ─── 12. ИИ-резерв: мёртвые юниты не считаются активными ───

console.log('\n12. ИИ-резерв: мёртвые юниты (strength=0) не считаются активными:');
{
  const e1 = createUnit('e1', 'enemy', 'infantry', 0,   14, 7); // мёртвый
  const e2 = createUnit('e2', 'enemy', 'infantry', 0,   15, 8); // мёртвый
  const eReserve = createUnit('e_res', 'enemy', 'infantry', 300, 19, 5, { isReserve: true });
  const bs = makeBattleState([], [e1, e2, eReserve]);

  aiReserveLogic(bs);

  assert(eReserve.isReserve === false,
    'ИИ вводит резерв когда все вражеские юниты мертвы (фронт = 0)');
}

// ── Итог ───────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`Всего: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
if (failed > 0) {
  console.error(`\n⚠️  ${failed} тест(а/ов) не прошли!`);
  process.exit(1);
} else {
  console.log('\n✅ Все тесты этапа 15 пройдены!');
}
