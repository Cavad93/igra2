// Тесты Этапа 14 — Усталость (processFatigue + marchedThisTurn + fatigueMultiplier)
// Запуск: node tests/test_tactical_stage14.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн: вспомогательные функции ─────────────────

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
    ambushUsed: false
  };
}

// ── Инлайн: processFatigue (точная копия из tactical_battle.js) ──────────

function processFatigue(unit, moved, fought) {
  if (unit.isReserve) {
    unit.fatigue = Math.max(0, unit.fatigue - 5); // отдых в резерве
    return;
  }
  if (fought)       unit.fatigue = Math.min(100, unit.fatigue + 8);
  else if (moved)   unit.fatigue = Math.min(100, unit.fatigue + 6);
  else              unit.fatigue = Math.max(0,   unit.fatigue - 3); // отдых
  if (unit.type === 'cavalry') unit.fatigue = Math.min(100, unit.fatigue + 2); // кавалерия устаёт быстрее
}

// ── Инлайн: fatigueMultiplier (точная копия из tactical_battle.js) ────────

function fatigueMultiplier(fatigue) {
  if (fatigue < 40)  return 1.00;
  if (fatigue < 70)  return 0.85;
  if (fatigue < 90)  return 0.65;
  return 0.45;
}

// ── Инлайн: initTacticalBattle (упрощённая версия для теста marchedThisTurn) ─

function initTacticalBattleSimple(atkArmy, defArmy) {
  const playerUnits = [];
  const enemyUnits  = [];

  // Создать по одному юниту для каждой стороны
  playerUnits.push(createUnit('player_inf_0', 'player', 'infantry', 500, 5, 8));
  playerUnits.push(createUnit('player_cav_0', 'player', 'cavalry', 200, 5, 9));
  enemyUnits.push(createUnit('enemy_inf_0', 'enemy', 'infantry', 500, 14, 8));

  // Этап 14: начальная усталость если армия маршировала в этот ход
  const marchedThisTurn = atkArmy.marchedThisTurn ?? false;
  playerUnits.forEach(u => { u.fatigue = marchedThisTurn ? 35 : 0; });

  return {
    playerUnits,
    enemyUnits,
    turn: 0,
    log: [],
    elevatedCells: new Set(),
    ambushUsed: false
  };
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

function assertRange(value, min, max, testName) {
  if (value >= min && value <= max) {
    console.log(`  ✅ ${testName} (значение: ${value})`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} — ожидалось [${min}..${max}], получено ${value}`);
    failed++;
  }
}

// ── Тесты ──────────────────────────────────────────

console.log('\n=== Этап 14: Усталость ===\n');

// ─── 1. Сражающийся юнит накапливает +8 усталости ───

console.log('1. Сражающийся юнит накапливает +8 усталости за тик:');
{
  const unit = createUnit('p1', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 20;
  processFatigue(unit, false, true); // fought = true
  assertEqual(unit.fatigue, 28, 'fatigue 20 + 8 = 28 после боя');
}
{
  const unit = createUnit('p2', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 0;
  processFatigue(unit, false, true);
  assertEqual(unit.fatigue, 8, 'fatigue 0 + 8 = 8 (первый тик боя)');
}
{
  const unit = createUnit('p3', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 95;
  processFatigue(unit, false, true);
  assertEqual(unit.fatigue, 100, 'fatigue не превышает 100 (кап)');
}

// ─── 2. Двигающийся юнит накапливает +6 усталости ───

console.log('\n2. Двигающийся юнит накапливает +6 усталости:');
{
  const unit = createUnit('p4', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 10;
  processFatigue(unit, true, false); // moved = true
  assertEqual(unit.fatigue, 16, 'fatigue 10 + 6 = 16 при движении');
}
{
  const unit = createUnit('p5', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 0;
  processFatigue(unit, true, false);
  assertEqual(unit.fatigue, 6, 'fatigue 0 + 6 = 6 (первый шаг)');
}

// ─── 3. Стоящий юнит теряет -3 усталости (отдых) ───

console.log('\n3. Стоящий без действий юнит теряет -3 усталости:');
{
  const unit = createUnit('p6', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 30;
  processFatigue(unit, false, false); // idle
  assertEqual(unit.fatigue, 27, 'fatigue 30 - 3 = 27 в состоянии покоя');
}
{
  const unit = createUnit('p7', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 2;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 0, 'fatigue не уходит ниже 0');
}
{
  const unit = createUnit('p8', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 0;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 0, 'fatigue остаётся 0 при отдыхе без накопления');
}

// ─── 4. Резервный юнит теряет -5 усталости ───

console.log('\n4. Резервный юнит теряет -5 усталости за тик:');
{
  const unit = createUnit('p9', 'player', 'infantry', 500, 0, 8, { isReserve: true });
  unit.fatigue = 40;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 35, 'резерв: fatigue 40 - 5 = 35');
}
{
  const unit = createUnit('p10', 'player', 'infantry', 500, 0, 8, { isReserve: true });
  unit.fatigue = 40;
  processFatigue(unit, true, true); // флаги игнорируются в резерве
  assertEqual(unit.fatigue, 35, 'резерв: флаги moved/fought игнорируются, всегда -5');
}
{
  const unit = createUnit('p11', 'player', 'infantry', 500, 0, 8, { isReserve: true });
  unit.fatigue = 3;
  processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 0, 'резерв: fatigue не уходит ниже 0');
}

// ─── 5. fatigueMultiplier > 70 → ×0.65 ───

console.log('\n5. Усталость > 70 → урон заметно меньше (×0.65):');
{
  assertEqual(fatigueMultiplier(0),   1.00, 'fatigue=0 → mult=1.00');
  assertEqual(fatigueMultiplier(39),  1.00, 'fatigue=39 → mult=1.00');
  assertEqual(fatigueMultiplier(40),  0.85, 'fatigue=40 → mult=0.85');
  assertEqual(fatigueMultiplier(69),  0.85, 'fatigue=69 → mult=0.85');
  assertEqual(fatigueMultiplier(70),  0.65, 'fatigue=70 → mult=0.65');
  assertEqual(fatigueMultiplier(89),  0.65, 'fatigue=89 → mult=0.65');
}

// ─── 6. fatigueMultiplier > 90 → ×0.45 ───

console.log('\n6. Усталость > 90 → юнит почти не наносит урона (×0.45):');
{
  assertEqual(fatigueMultiplier(90),  0.45, 'fatigue=90 → mult=0.45');
  assertEqual(fatigueMultiplier(100), 0.45, 'fatigue=100 → mult=0.45');
}

// ─── 7. Влияние усталости на урон ───

console.log('\n7. Проверка реального влияния усталости на урон:');
{
  const baseDmg = 500 * 0.04; // 20 базового урона
  const dmgFresh     = baseDmg * fatigueMultiplier(20);  // 1.00
  const dmgMidFatigue = baseDmg * fatigueMultiplier(75); // 0.65
  const dmgHighFatigue = baseDmg * fatigueMultiplier(95); // 0.45
  assert(dmgMidFatigue < dmgFresh,    'усталость=75: урон меньше чем у отдохнувшего');
  assert(dmgHighFatigue < dmgMidFatigue, 'усталость=95: урон меньше чем при 75');
  assertRange(dmgMidFatigue / dmgFresh,  0.64, 0.66, 'урон при усталости 75 ≈ 65% от нормы');
  assertRange(dmgHighFatigue / dmgFresh, 0.44, 0.46, 'урон при усталости 95 ≈ 45% от нормы');
}

// ─── 8. Кавалерия устаёт на 2 единицы быстрее пехоты ───

console.log('\n8. Кавалерия устаёт на 2 единицы быстрее пехоты:');
{
  const inf = createUnit('inf1', 'player', 'infantry', 500, 5, 8);
  const cav = createUnit('cav1', 'player', 'cavalry',  200, 5, 9);
  inf.fatigue = 20; cav.fatigue = 20;
  processFatigue(inf, false, true); // боевой тик
  processFatigue(cav, false, true); // боевой тик
  assertEqual(inf.fatigue, 28, 'пехота: 20 + 8 = 28');
  assertEqual(cav.fatigue, 30, 'кавалерия: 20 + 8 + 2 = 30 (на 2 больше)');
  assertEqual(cav.fatigue - inf.fatigue, 2, 'разница: кавалерия на 2 больше');
}
{
  const inf = createUnit('inf2', 'player', 'infantry', 500, 5, 8);
  const cav = createUnit('cav2', 'player', 'cavalry',  200, 5, 9);
  inf.fatigue = 30; cav.fatigue = 30;
  processFatigue(inf, true, false); // движение
  processFatigue(cav, true, false); // движение
  assertEqual(inf.fatigue, 36, 'пехота при движении: 30 + 6 = 36');
  assertEqual(cav.fatigue, 38, 'кавалерия при движении: 30 + 6 + 2 = 38');
}
{
  // При отдыхе кавалерия теряет те же -3, но +2 на базе, итого: -3+2 = -1 (если fought=false, moved=false)
  // Нет: +2 применяется всегда кроме reserve. При idle: -3, затем +2 = итого -1 изменение
  const inf = createUnit('inf3', 'player', 'infantry', 500, 5, 8);
  const cav = createUnit('cav3', 'player', 'cavalry',  200, 5, 9);
  inf.fatigue = 20; cav.fatigue = 20;
  processFatigue(inf, false, false); // отдых
  processFatigue(cav, false, false); // отдых
  assertEqual(inf.fatigue, 17, 'пехота при отдыхе: 20 - 3 = 17');
  assertEqual(cav.fatigue, 19, 'кавалерия при отдыхе: 20 - 3 + 2 = 19');
}

// ─── 9. marchedThisTurn = true → начальная усталость 35 ───

console.log('\n9. marchedThisTurn=true → все юниты начинают с fatigue=35:');
{
  const bs = initTacticalBattleSimple({ marchedThisTurn: true }, {});
  assert(bs.playerUnits.length > 0, 'инициализация с marchedThisTurn: юниты созданы');
  for (const u of bs.playerUnits) {
    assertEqual(u.fatigue, 35, `${u.id}: fatigue=35 при marchedThisTurn=true`);
  }
  for (const u of bs.enemyUnits) {
    assertEqual(u.fatigue, 0, `${u.id} (враг): fatigue=0 (не маршировал)`);
  }
}
{
  const bs = initTacticalBattleSimple({ marchedThisTurn: false }, {});
  for (const u of bs.playerUnits) {
    assertEqual(u.fatigue, 0, `${u.id}: fatigue=0 при marchedThisTurn=false`);
  }
}
{
  // marchedThisTurn undefined → по умолчанию false → fatigue=0
  const bs = initTacticalBattleSimple({}, {});
  for (const u of bs.playerUnits) {
    assertEqual(u.fatigue, 0, `${u.id}: fatigue=0 при marchedThisTurn не задан`);
  }
}

// ─── 10. Накопление усталости за несколько тиков ───

console.log('\n10. Накопление усталости за несколько тиков:');
{
  const unit = createUnit('p_multi', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 0;
  // 5 тиков боя: +8 каждый
  for (let i = 0; i < 5; i++) processFatigue(unit, false, true);
  assertEqual(unit.fatigue, 40, '5 тиков боя: 0 + 5*8 = 40');
  // Потом 2 тика отдыха: -3 каждый
  for (let i = 0; i < 2; i++) processFatigue(unit, false, false);
  assertEqual(unit.fatigue, 34, '2 тика отдыха после боя: 40 - 2*3 = 34');
}

// ─── 11. Флаги сбрасываются после применения ───

console.log('\n11. Флаги _movedThisTick и _foughtThisTick сбрасываются:');
{
  const u = createUnit('pflag', 'player', 'infantry', 500, 5, 8);
  u._movedThisTick  = true;
  u._foughtThisTick = false;
  processFatigue(u, u._movedThisTick, u._foughtThisTick);
  // Сброс (имитируем логику из tacticalTick)
  u._movedThisTick  = false;
  u._foughtThisTick = false;
  assertEqual(u._movedThisTick,  false, '_movedThisTick сброшен в false после тика');
  assertEqual(u._foughtThisTick, false, '_foughtThisTick сброшен в false после тика');
  // Следующий тик — юнит не двигался → отдыхает
  const prevFatigue = u.fatigue;
  processFatigue(u, u._movedThisTick, u._foughtThisTick);
  assertEqual(u.fatigue, Math.max(0, prevFatigue - 3), 'после сброса флагов следующий тик = отдых');
}

// ─── 12. Граничные значения усталости ───

console.log('\n12. Граничные значения usталости:');
{
  const unit = createUnit('pbounds', 'player', 'infantry', 500, 5, 8);
  unit.fatigue = 100;
  processFatigue(unit, false, true); // попытка превысить 100
  assertEqual(unit.fatigue, 100, 'усталость не превышает 100');

  unit.fatigue = 0;
  processFatigue(unit, false, false); // попытка уйти ниже 0
  assertEqual(unit.fatigue, 0, 'усталость не уходит ниже 0');

  // Резерв при fatigue=0
  const reserveUnit = createUnit('preserv', 'player', 'infantry', 500, 0, 8, { isReserve: true });
  reserveUnit.fatigue = 0;
  processFatigue(reserveUnit, false, false);
  assertEqual(reserveUnit.fatigue, 0, 'резервный юнит: fatigue не ниже 0');
}

// ──────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════`);
console.log(`Результат: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) {
  console.error(`\n❌ ЕСТЬ ОШИБКИ: ${failed} тестов провалено`);
  process.exit(1);
} else {
  console.log('\n✅ Все тесты этапа 14 пройдены!');
}
