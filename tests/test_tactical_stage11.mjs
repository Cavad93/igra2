// Тесты Этапа 11 — Фланговая атака
// Запуск: node tests/test_tactical_stage11.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const UNIT_BASE_SIZE     = 400;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн: боевые мультипликаторы ──────────────────
function moraleMultiplier(morale) {
  if (morale >= 80) return 1.20;
  if (morale >= 50) return 1.00;
  if (morale >= 30) return 0.80;
  return 0.50;
}

function fatigueMultiplier(fatigue) {
  if (fatigue < 40)  return 1.00;
  if (fatigue < 70)  return 0.85;
  if (fatigue < 90)  return 0.65;
  return 0.45;
}

const FORMATION_MULT = {
  standard:  { atk: 1.0, def: 1.0 },
  aggressive:{ atk: 1.3, def: 0.8 },
  defensive: { atk: 0.7, def: 1.4 },
  flanking:  { atk: 1.1, def: 0.9 },
  siege:     { atk: 0.5, def: 1.2 }
};

// ── Инлайн: getAttackDirection (Этап 11) ──────────────
function getAttackDirection(attacker, defender) {
  const dx = attacker.gridX - defender.gridX;
  const dy = attacker.gridY - defender.gridY;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  if (isHorizontal) {
    const expectedSide = defender.side === 'player' ? 1 : -1;
    return Math.sign(dx) === expectedSide ? 'front' : 'rear';
  }
  return 'flank';
}

// ── Инлайн: flankBonus (Этап 11) ─────────────────────
function flankBonus(direction) {
  if (direction === 'rear')  return { dmg: 1.70, morale: -35 };
  if (direction === 'flank') return { dmg: 1.40, morale: -20 };
  return { dmg: 1.00, morale: 0 };
}

// ── Инлайн: вспомогательные ─────────────────────────
function getTerrainAttackMult(attacker, defender, bs) {
  const atkElev = bs.elevatedCells.has(`${attacker.gridX},${attacker.gridY}`);
  const defElev = bs.elevatedCells.has(`${defender.gridX},${defender.gridY}`);
  if (atkElev && !defElev) return 1.10;
  if (!atkElev && defElev) return 0.88;
  return 1.0;
}

const _logs = [];
function addLog(bs, message) {
  bs.log = bs.log || [];
  bs.log.unshift({ text: message, turn: bs.turn });
  _logs.push(message);
}

function resolveMelee(attacker, defender, bs) {
  const fm  = FORMATION_MULT[attacker.formation] ?? FORMATION_MULT.standard;
  const dir = getAttackDirection(attacker, defender);
  const fb  = flankBonus(dir);
  const tm  = getTerrainAttackMult(attacker, defender, bs);

  const damage = Math.floor(
    attacker.strength * 0.04
    * fm.atk
    * moraleMultiplier(attacker.morale)
    * fatigueMultiplier(attacker.fatigue)
    * fb.dmg
    * tm
  );

  defender.strength = Math.max(0, defender.strength - damage);
  defender.morale   = Math.max(0, defender.morale  + fb.morale);

  if (dir !== 'front' && fb.morale < 0) {
    const dirLabel = dir === 'flank' ? 'во фланг' : 'в тыл';
    addLog(bs, `⚔️ Удар ${dirLabel}! ${defender.type} деморализован (${fb.morale} мораль)`);
    bs._lastFlankArrow = {
      fromX: attacker.gridX, fromY: attacker.gridY,
      toX: defender.gridX,   toY: defender.gridY,
      type: dir
    };
  }

  if (defender.strength === 0) defender.morale = 0;
  return damage;
}

// ── Утилиты тестов ───────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function makeUnit(side, gridX, gridY, overrides = {}) {
  return {
    id: `${side}_test`,
    side,
    type: 'infantry',
    strength: 1000,
    maxStrength: 1000,
    morale: 80,
    fatigue: 0,
    formation: 'standard',
    isRouting: false,
    isReserve: false,
    isCommander: false,
    gridX,
    gridY,
    ...overrides
  };
}

function makeBS() {
  return {
    turn: 1,
    log: [],
    elevatedCells: new Set(),
    _lastFlankArrow: null
  };
}

// ══════════════════════════════════════════════════════
// Блок 1: getAttackDirection
// ══════════════════════════════════════════════════════
console.log('\n═══ Этап 11: getAttackDirection — горизонтальные атаки ═══\n');

{
  // Атака по горизонтали (dx >= dy)
  // Враг (enemy) на (10,8), игрок атакует с (9,8) → dx=-1
  // Enemy front ожидает dx=-1 (expectedSide=-1) → Math.sign(-1) === -1 → 'front'
  const atk = makeUnit('player', 9, 8);
  const def = makeUnit('enemy',  10, 8);
  assert(getAttackDirection(atk, def) === 'front',
    'player атакует enemy горизонтально с левой стороны → фронт');
}

{
  // Player (player) на (10,8), враг атакует с (11,8) → dx=1
  // Player front ожидает dx=1 (expectedSide=1) → Math.sign(1) === 1 → 'front'
  const atk = makeUnit('enemy',  11, 8);
  const def = makeUnit('player', 10, 8);
  assert(getAttackDirection(atk, def) === 'front',
    'enemy атакует player горизонтально с правой стороны → фронт');
}

{
  // Тыловая атака: enemy находится на (10,8), player атакует сзади с (11,8)
  // dx = 11-10 = 1, expectedSide для enemy = -1, Math.sign(1) = 1 ≠ -1 → 'rear'
  const atk = makeUnit('player', 11, 8);
  const def = makeUnit('enemy',  10, 8);
  assert(getAttackDirection(atk, def) === 'rear',
    'player атакует enemy с правой стороны → тыл');
}

{
  // Тыловая атака: player на (10,8), enemy атакует слева с (9,8)
  // dx = 9-10 = -1, expectedSide для player = 1, Math.sign(-1) = -1 ≠ 1 → 'rear'
  const atk = makeUnit('enemy',  9, 8);
  const def = makeUnit('player', 10, 8);
  assert(getAttackDirection(atk, def) === 'rear',
    'enemy атакует player с левой стороны → тыл');
}

console.log('\n═══ Этап 11: getAttackDirection — вертикальные атаки (фланг) ═══\n');

{
  // Атака по вертикали → флаг
  const atk = makeUnit('player', 10, 7);
  const def = makeUnit('enemy',  10, 8);
  assert(getAttackDirection(atk, def) === 'flank',
    'атака строго сверху → фланг');
}

{
  const atk = makeUnit('enemy',  10, 9);
  const def = makeUnit('player', 10, 8);
  assert(getAttackDirection(atk, def) === 'flank',
    'атака строго снизу → фланг');
}

{
  // Диагональ 1:1 → |dx| == |dy| → isHorizontal true → горизонтальная ветвь
  // player атакует enemy с (9,7) на (10,8): dx=-1, dy=-1, |dx|==|dy|
  // expectedSide для enemy = -1, Math.sign(-1) = -1 → 'front'
  const atk = makeUnit('player', 9, 7);
  const def = makeUnit('enemy',  10, 8);
  assert(getAttackDirection(atk, def) === 'front',
    'диагональ |dx|==|dy| → горизонтальная ветвь → фронт для врага с левого-верхнего угла');
}

// ══════════════════════════════════════════════════════
// Блок 2: flankBonus
// ══════════════════════════════════════════════════════
console.log('\n═══ Этап 11: flankBonus ═══\n');

{
  const fb = flankBonus('front');
  assert(fb.dmg === 1.00 && fb.morale === 0,
    'front → dmg=1.00, morale=0');
}

{
  const fb = flankBonus('flank');
  assert(fb.dmg === 1.40 && fb.morale === -20,
    'flank → dmg=1.40, morale=-20');
}

{
  const fb = flankBonus('rear');
  assert(fb.dmg === 1.70 && fb.morale === -35,
    'rear → dmg=1.70, morale=-35');
}

// ══════════════════════════════════════════════════════
// Блок 3: resolveMelee с фланговым бонусом
// ══════════════════════════════════════════════════════
console.log('\n═══ Этап 11: resolveMelee — сравнение урона ═══\n');

{
  // Фронтальный удар по врагу
  const atk = makeUnit('player', 9, 8);
  const def = makeUnit('enemy',  10, 8, { strength: 10000, maxStrength: 10000 });
  const bs  = makeBS();
  const dmgFront = resolveMelee(atk, def, bs);

  // Флаговый удар (атака сверху)
  const atk2 = makeUnit('player', 10, 7);
  const def2 = makeUnit('enemy',  10, 8, { strength: 10000, maxStrength: 10000 });
  const bs2  = makeBS();
  const dmgFlank = resolveMelee(atk2, def2, bs2);

  assert(dmgFlank > dmgFront,
    `урон при фланге (${dmgFlank}) > урон при лобовой (${dmgFront})`);
  assert(Math.abs(dmgFlank / dmgFront - 1.40) < 0.02,
    `фланговый бонус ~1.40 (отношение ${(dmgFlank/dmgFront).toFixed(3)})`);
}

{
  // Тыловой удар
  const atk = makeUnit('player', 11, 8);
  const def = makeUnit('enemy',  10, 8, { strength: 10000, maxStrength: 10000 });
  const bs  = makeBS();
  const dmgRear = resolveMelee(atk, def, bs);

  const atk2 = makeUnit('player', 9, 8);
  const def2 = makeUnit('enemy',  10, 8, { strength: 10000, maxStrength: 10000 });
  const bs2  = makeBS();
  const dmgFront = resolveMelee(atk2, def2, bs2);

  assert(dmgRear > dmgFront,
    `урон при тыловой атаке (${dmgRear}) > урон при лобовой (${dmgFront})`);
  assert(Math.abs(dmgRear / dmgFront - 1.70) < 0.02,
    `тыловой бонус ~1.70 (отношение ${(dmgRear/dmgFront).toFixed(3)})`);
}

// ══════════════════════════════════════════════════════
// Блок 4: мораль и логирование
// ══════════════════════════════════════════════════════
console.log('\n═══ Этап 11: мораль и логирование ═══\n');

{
  // Фланг → мораль снижается
  const atk = makeUnit('player', 10, 7);
  const def = makeUnit('enemy',  10, 8, { morale: 80 });
  const bs  = makeBS();
  resolveMelee(atk, def, bs);

  assert(def.morale === 60,
    `фланг: мораль цели 80 → 60 (снижение -20)`);
}

{
  // Тыл → мораль снижается на 35
  const atk = makeUnit('player', 11, 8);
  const def = makeUnit('enemy',  10, 8, { morale: 80 });
  const bs  = makeBS();
  resolveMelee(atk, def, bs);

  assert(def.morale === 45,
    `тыл: мораль цели 80 → 45 (снижение -35)`);
}

{
  // Фронт → мораль не снижается
  const atk = makeUnit('player', 9, 8);
  const def = makeUnit('enemy',  10, 8, { morale: 80 });
  const bs  = makeBS();
  resolveMelee(atk, def, bs);

  assert(def.morale === 80,
    `фронт: мораль цели не снижается (80 → 80)`);
}

{
  // Фланг → лог содержит "во фланг"
  const atk = makeUnit('player', 10, 7);
  const def = makeUnit('enemy',  10, 8);
  const bs  = makeBS();
  _logs.length = 0;
  resolveMelee(atk, def, bs);
  const hasFlankLog = _logs.some(m => m.includes('во фланг'));
  assert(hasFlankLog, 'лог содержит "во фланг"');
}

{
  // Тыл → лог содержит "в тыл"
  const atk = makeUnit('player', 11, 8);
  const def = makeUnit('enemy',  10, 8);
  const bs  = makeBS();
  _logs.length = 0;
  resolveMelee(atk, def, bs);
  const hasRearLog = _logs.some(m => m.includes('в тыл'));
  assert(hasRearLog, 'лог содержит "в тыл"');
}

{
  // Фронт → НЕТ флангового лога
  const atk = makeUnit('player', 9, 8);
  const def = makeUnit('enemy',  10, 8);
  const bs  = makeBS();
  _logs.length = 0;
  resolveMelee(atk, def, bs);
  const hasFlankLog = _logs.some(m =>
    m.includes('во фланг') || m.includes('в тыл') || m.includes('деморализован'));
  assert(!hasFlankLog, 'фронт: нет флангового/тылового лога');
}

// ══════════════════════════════════════════════════════
// Блок 5: _lastFlankArrow
// ══════════════════════════════════════════════════════
console.log('\n═══ Этап 11: _lastFlankArrow ═══\n');

{
  // Фланговая атака → устанавливает _lastFlankArrow с type='flank'
  const atk = makeUnit('player', 10, 7);
  const def = makeUnit('enemy',  10, 8);
  const bs  = makeBS();
  resolveMelee(atk, def, bs);

  assert(bs._lastFlankArrow !== null,
    'фланговая атака → _lastFlankArrow установлен');
  assert(bs._lastFlankArrow?.type === 'flank',
    '_lastFlankArrow.type === "flank"');
  assert(bs._lastFlankArrow?.fromX === 10 && bs._lastFlankArrow?.fromY === 7,
    '_lastFlankArrow.from = позиция атакующего (10,7)');
  assert(bs._lastFlankArrow?.toX === 10 && bs._lastFlankArrow?.toY === 8,
    '_lastFlankArrow.to = позиция защитника (10,8)');
}

{
  // Тыловая атака → _lastFlankArrow с type='rear'
  const atk = makeUnit('player', 11, 8);
  const def = makeUnit('enemy',  10, 8);
  const bs  = makeBS();
  resolveMelee(atk, def, bs);

  assert(bs._lastFlankArrow?.type === 'rear',
    'тыловая атака → _lastFlankArrow.type === "rear"');
}

{
  // Фронтальная атака → _lastFlankArrow остаётся null
  const atk = makeUnit('player', 9, 8);
  const def = makeUnit('enemy',  10, 8);
  const bs  = makeBS();
  resolveMelee(atk, def, bs);

  assert(bs._lastFlankArrow === null,
    'фронтальная атака → _lastFlankArrow остаётся null');
}

// ══════════════════════════════════════════════════════
// Блок 6: мораль не падает ниже 0
// ══════════════════════════════════════════════════════
console.log('\n═══ Этап 11: мораль не падает ниже 0 ═══\n');

{
  const atk = makeUnit('player', 11, 8);
  const def = makeUnit('enemy',  10, 8, { morale: 20 });
  const bs  = makeBS();
  resolveMelee(atk, def, bs);
  assert(def.morale >= 0, `мораль не падает ниже 0 (значение: ${def.morale})`);
}

{
  const atk = makeUnit('player', 10, 7);
  const def = makeUnit('enemy',  10, 8, { morale: 10 });
  const bs  = makeBS();
  resolveMelee(atk, def, bs);
  assert(def.morale >= 0, `мораль не падает ниже 0 при фланге (значение: ${def.morale})`);
}

// ══════════════════════════════════════════════════════
// Итог
// ══════════════════════════════════════════════════════
console.log('\n─────────────────────────────────────\n');
console.log(`Итого: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
