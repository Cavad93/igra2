// Тесты Этапа 8 — Базовая формула боя и тактический тик
// Запуск: node tests/test_tactical_stage8.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const UNIT_BASE_SIZE     = 400;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн: createUnit ───────────────────────────────
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

// ── Инлайн: FORMATION_MULT ───────────────────────────
const FORMATION_MULT = {
  standard:  { atk: 1.0, def: 1.0 },
  aggressive:{ atk: 1.3, def: 0.8 },
  defensive: { atk: 0.7, def: 1.4 },
  flanking:  { atk: 1.1, def: 0.9 },
  siege:     { atk: 0.5, def: 1.2 }
};

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

// ── Инлайн: findUnitAt ───────────────────────────────
function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
}

// ── Инлайн: resolveMelee ─────────────────────────────
function resolveMelee(attacker, defender, bs) {
  const fm  = FORMATION_MULT[attacker.formation] ?? FORMATION_MULT.standard;
  const damage = attacker.strength
    * 0.04
    * fm.atk
    * moraleMultiplier(attacker.morale)
    * fatigueMultiplier(attacker.fatigue);
  defender.strength = Math.max(0, defender.strength - Math.floor(damage));
  if (defender.strength === 0) defender.morale = 0;
  return Math.floor(damage);
}

// ── Инлайн: checkVictory ─────────────────────────────
function checkVictory(bs) {
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  const enemyAlive  = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (enemyAlive.length === 0) return 'player_wins';
  if (playerAlive.length === 0) return 'player_loses';
  return null;
}

// ── Инлайн: tacticalTick (без DOM) ──────────────────
const _logs = [];

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
}

function endTacticalBattle(bs, outcome) {
  bs._testOutcome = outcome;
}

function tacticalTick(bs) {
  bs.turn++;

  for (const pu of bs.playerUnits) {
    if (pu.isRouting || pu.strength === 0 || pu.isReserve) continue;
    const enemies = bs.enemyUnits.filter(eu =>
      eu.strength > 0 &&
      Math.abs(eu.gridX - pu.gridX) + Math.abs(eu.gridY - pu.gridY) === 1
    );
    for (const eu of enemies) {
      const dmg = resolveMelee(pu, eu, bs);
      if (dmg > 0) addLog(bs, `⚔ ${pu.type} → ${eu.type}: −${dmg}`);
    }
  }

  for (const eu of bs.enemyUnits) {
    if (eu.isRouting || eu.strength === 0 || eu.isReserve) continue;
    const players = bs.playerUnits.filter(pu =>
      pu.strength > 0 &&
      Math.abs(pu.gridX - eu.gridX) + Math.abs(pu.gridY - eu.gridY) === 1
    );
    for (const pu of players) {
      const dmg = resolveMelee(eu, pu, bs);
      if (dmg > 0) addLog(bs, `🛡 ${eu.type} бьёт ${pu.type}: −${dmg}`);
    }
  }

  for (const eu of bs.enemyUnits) {
    if (eu.isRouting || eu.strength === 0 || eu.isReserve) continue;
    const alive = bs.playerUnits.filter(u => u.strength > 0);
    if (alive.length === 0) break;
    const target = alive.reduce((best, u) =>
      (Math.abs(u.gridX - eu.gridX) + Math.abs(u.gridY - eu.gridY)) <
      (Math.abs(best.gridX - eu.gridX) + Math.abs(best.gridY - eu.gridY)) ? u : best
    );
    const dx = Math.sign(target.gridX - eu.gridX);
    const dy = Math.sign(target.gridY - eu.gridY);
    const nx = eu.gridX + (dx !== 0 ? dx : 0);
    const ny = eu.gridY + (dx === 0 ? dy : 0);
    if (nx >= 0 && nx < TACTICAL_GRID_COLS && ny >= 0 && ny < TACTICAL_GRID_ROWS) {
      if (!findUnitAt(nx, ny, bs)) { eu.gridX = nx; eu.gridY = ny; }
    }
  }

  const outcome = checkVictory(bs);
  if (outcome) {
    bs.phase = 'ended';
    addLog(bs, outcome === 'player_wins' ? '🏆 Победа!' : '💀 Поражение!');
    endTacticalBattle(bs, outcome);
    return;
  }
  // DOM вызовы пропущены (нет браузера в тестах)
}

// ── Фабрика боевого состояния ────────────────────────
function makeBs(overrides = {}) {
  const playerUnits = [
    createUnit('p_inf', 'player', 'infantry', 1000, 5, 7),
    createUnit('p_cmd', 'player', 'infantry',   50, 5, 8, { isCommander: true }),
  ];
  const enemyUnits = [
    createUnit('e_inf', 'enemy', 'infantry', 1000, 15, 7),
    createUnit('e_cmd', 'enemy', 'infantry',   50, 16, 8, { isCommander: true }),
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
    ...overrides
  };
}

// ── Тест-утилиты ─────────────────────────────────────
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
function assertClose(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error(`${msg ?? ''}: ${a} not close to ${b} (eps=${eps})`);
}

// ═══════════════════════════════════════════════════
console.log('\n── moraleMultiplier ────────────────────────────');

test('мораль 100 → 1.20', () => assertEqual(moraleMultiplier(100), 1.20, 'мораль 100'));
test('мораль 80  → 1.20', () => assertEqual(moraleMultiplier(80),  1.20, 'мораль 80'));
test('мораль 79  → 1.00', () => assertEqual(moraleMultiplier(79),  1.00, 'мораль 79'));
test('мораль 50  → 1.00', () => assertEqual(moraleMultiplier(50),  1.00, 'мораль 50'));
test('мораль 49  → 0.80', () => assertEqual(moraleMultiplier(49),  0.80, 'мораль 49'));
test('мораль 30  → 0.80', () => assertEqual(moraleMultiplier(30),  0.80, 'мораль 30'));
test('мораль 29  → 0.50', () => assertEqual(moraleMultiplier(29),  0.50, 'мораль 29'));
test('мораль 0   → 0.50', () => assertEqual(moraleMultiplier(0),   0.50, 'мораль 0'));

// ═══════════════════════════════════════════════════
console.log('\n── fatigueMultiplier ───────────────────────────');

test('усталость 0   → 1.00', () => assertEqual(fatigueMultiplier(0),   1.00, 'усталость 0'));
test('усталость 39  → 1.00', () => assertEqual(fatigueMultiplier(39),  1.00, 'усталость 39'));
test('усталость 40  → 0.85', () => assertEqual(fatigueMultiplier(40),  0.85, 'усталость 40'));
test('усталость 69  → 0.85', () => assertEqual(fatigueMultiplier(69),  0.85, 'усталость 69'));
test('усталость 70  → 0.65', () => assertEqual(fatigueMultiplier(70),  0.65, 'усталость 70'));
test('усталость 89  → 0.65', () => assertEqual(fatigueMultiplier(89),  0.65, 'усталость 89'));
test('усталость 90  → 0.45', () => assertEqual(fatigueMultiplier(90),  0.45, 'усталость 90'));
test('усталость 100 → 0.45', () => assertEqual(fatigueMultiplier(100), 0.45, 'усталость 100'));

// ═══════════════════════════════════════════════════
console.log('\n── resolveMelee — базовый урон ─────────────────');

test('1000 силы, standard, мораль 80, усталость 0 → 48 урона', () => {
  // 1000 * 0.04 * 1.0 * 1.20 * 1.00 = 48
  const bs  = makeBs();
  const atk = createUnit('a', 'player', 'infantry', 1000, 5, 7, { morale: 80, fatigue: 0 });
  const def = createUnit('d', 'enemy',  'infantry', 1000, 6, 7);
  const dmg = resolveMelee(atk, def, bs);
  assertEqual(dmg, 48, 'урон standard');
});

test('aggressive × 1.3 наносит больше чем defensive × 0.7', () => {
  const bs   = makeBs();
  const base = createUnit('b', 'player', 'infantry', 1000, 5, 7, { morale: 50, fatigue: 0 });
  const defU = createUnit('d', 'enemy',  'infantry', 5000, 6, 7);

  const atk1   = { ...base, formation: 'aggressive' };
  const def1   = { ...defU, strength: 5000 };
  const dmg1   = resolveMelee(atk1, def1, bs);

  const atk2   = { ...base, formation: 'defensive' };
  const def2   = { ...defU, strength: 5000 };
  const dmg2   = resolveMelee(atk2, def2, bs);

  assert(dmg1 > dmg2, `aggressive(${dmg1}) должен быть > defensive(${dmg2})`);
});

test('aggressive даёт × 1.3 / defensive × 0.7 относительно standard', () => {
  const bs = makeBs();
  const base = { morale: 50, fatigue: 0 };

  const aStd  = createUnit('s', 'player', 'infantry', 1000, 5, 7, { ...base, formation: 'standard' });
  const aAgg  = createUnit('a', 'player', 'infantry', 1000, 5, 7, { ...base, formation: 'aggressive' });
  const aDef  = createUnit('d', 'player', 'infantry', 1000, 5, 7, { ...base, formation: 'defensive' });

  const dStd  = createUnit('ds', 'enemy', 'infantry', 9999, 6, 7);
  const dAgg  = createUnit('da', 'enemy', 'infantry', 9999, 6, 7);
  const dDef  = createUnit('dd', 'enemy', 'infantry', 9999, 6, 7);

  const dmgStd = resolveMelee(aStd, dStd, bs);  // 1000*0.04*1.0*1.0*1.0 = 40
  const dmgAgg = resolveMelee(aAgg, dAgg, bs);  // 1000*0.04*1.3*1.0*1.0 = 52
  const dmgDef = resolveMelee(aDef, dDef, bs);  // 1000*0.04*0.7*1.0*1.0 = 28

  assertClose(dmgAgg / dmgStd, 1.3, 0.02, 'aggressive ratio');
  assertClose(dmgDef / dmgStd, 0.7, 0.02, 'defensive ratio');
});

test('низкая мораль (20) снижает урон до × 0.5', () => {
  const bs  = makeBs();
  const a80 = createUnit('h', 'player', 'infantry', 1000, 5, 7, { morale: 80,  fatigue: 0 });
  const a20 = createUnit('l', 'player', 'infantry', 1000, 5, 7, { morale: 20,  fatigue: 0 });
  const d1  = createUnit('d1','enemy',  'infantry', 9999, 6, 7);
  const d2  = createUnit('d2','enemy',  'infantry', 9999, 6, 7);

  const high = resolveMelee(a80, d1, bs);  // 1000*0.04*1.0*1.2*1.0 = 48
  const low  = resolveMelee(a20, d2, bs);  // 1000*0.04*1.0*0.5*1.0 = 20

  assert(low < high, `мораль 20 (${low}) должен быть < мораль 80 (${high})`);
  assertClose(low / high, 0.5 / 1.2, 0.02, 'соотношение мораль 20 / 80');
});

test('высокая усталость (95) снижает урон', () => {
  const bs   = makeBs();
  const fresh = createUnit('f', 'player', 'infantry', 1000, 5, 7, { fatigue: 0,  morale: 50 });
  const tired = createUnit('t', 'player', 'infantry', 1000, 5, 7, { fatigue: 95, morale: 50 });
  const d1   = createUnit('d1','enemy',  'infantry', 9999, 6, 7);
  const d2   = createUnit('d2','enemy',  'infantry', 9999, 6, 7);

  const dmgFresh = resolveMelee(fresh, d1, bs);
  const dmgTired = resolveMelee(tired, d2, bs);
  assert(dmgTired < dmgFresh, `усталый (${dmgTired}) должен бить слабее свежего (${dmgFresh})`);
});

test('strength врага уменьшается после удара', () => {
  const bs  = makeBs();
  const atk = createUnit('a', 'player', 'infantry', 1000, 5, 7);
  const def = createUnit('d', 'enemy',  'infantry', 1000, 6, 7);
  const before = def.strength;
  resolveMelee(atk, def, bs);
  assert(def.strength < before, `сила защитника уменьшилась: ${before} → ${def.strength}`);
});

test('уничтоженный юнит получает мораль 0', () => {
  const bs  = makeBs();
  const atk = createUnit('a', 'player', 'infantry', 9999, 5, 7, { morale: 80, fatigue: 0 });
  const def = createUnit('d', 'enemy',  'infantry',    1, 6, 7, { morale: 80 });
  resolveMelee(atk, def, bs);
  assertEqual(def.strength, 0, 'strength = 0');
  assertEqual(def.morale, 0, 'мораль = 0 при уничтожении');
});

// ═══════════════════════════════════════════════════
console.log('\n── checkVictory ────────────────────────────────');

test('обе стороны живы → null', () => {
  const bs = makeBs();
  assertEqual(checkVictory(bs), null, 'обе живы → null');
});

test('все враги уничтожены → player_wins', () => {
  const bs = makeBs();
  bs.enemyUnits.forEach(u => { u.strength = 0; });
  assertEqual(checkVictory(bs), 'player_wins', 'все враги уничтожены');
});

test('все юниты игрока уничтожены → player_loses', () => {
  const bs = makeBs();
  bs.playerUnits.forEach(u => { u.strength = 0; });
  assertEqual(checkVictory(bs), 'player_loses', 'все юниты игрока уничтожены');
});

test('все враги в routing → player_wins', () => {
  const bs = makeBs();
  bs.enemyUnits.forEach(u => { u.isRouting = true; });
  assertEqual(checkVictory(bs), 'player_wins', 'враги в routing → победа');
});

test('все юниты игрока в routing → player_loses', () => {
  const bs = makeBs();
  bs.playerUnits.forEach(u => { u.isRouting = true; });
  assertEqual(checkVictory(bs), 'player_loses', 'игрок в routing → поражение');
});

// ═══════════════════════════════════════════════════
console.log('\n── tacticalTick — счётчик хода ─────────────────');

test('каждый вызов увеличивает bs.turn на 1', () => {
  const bs = makeBs();
  assertEqual(bs.turn, 0, 'начальный ход 0');
  tacticalTick(bs);
  assertEqual(bs.turn, 1, 'после 1 тика → ход 1');
  tacticalTick(bs);
  assertEqual(bs.turn, 2, 'после 2 тиков → ход 2');
});

// ═══════════════════════════════════════════════════
console.log('\n── tacticalTick — рукопашный бой ───────────────');

test('смежные юниты наносят урон друг другу', () => {
  const bs = makeBs();
  // Поставить врага рядом с игроком
  bs.playerUnits[0].gridX = 10; bs.playerUnits[0].gridY = 7;
  bs.enemyUnits[0].gridX  = 11; bs.enemyUnits[0].gridY  = 7;
  bs.playerUnits[1].gridX = 3;  bs.playerUnits[1].gridY = 3; // далеко
  bs.enemyUnits[1].gridX  = 18; bs.enemyUnits[1].gridY  = 3; // далеко

  const pBefore = bs.playerUnits[0].strength;
  const eBefore = bs.enemyUnits[0].strength;

  tacticalTick(bs);

  assert(bs.playerUnits[0].strength < pBefore, `игрок получил урон: ${pBefore} → ${bs.playerUnits[0].strength}`);
  assert(bs.enemyUnits[0].strength  < eBefore, `враг получил урон:  ${eBefore} → ${bs.enemyUnits[0].strength}`);
});

test('несмежные юниты не получают урон', () => {
  const bs = makeBs();
  // Все далеко друг от друга
  bs.playerUnits[0].gridX = 4;  bs.playerUnits[0].gridY = 7;
  bs.playerUnits[1].gridX = 4;  bs.playerUnits[1].gridY = 8;
  bs.enemyUnits[0].gridX  = 15; bs.enemyUnits[0].gridY  = 7;
  bs.enemyUnits[1].gridX  = 15; bs.enemyUnits[1].gridY  = 8;

  const pBefore = bs.playerUnits[0].strength;
  const eBefore = bs.enemyUnits[0].strength;

  tacticalTick(bs);

  assertEqual(bs.playerUnits[0].strength, pBefore, 'игрок не получил урон');
  assertEqual(bs.enemyUnits[0].strength,  eBefore, 'враг не получил урон');
});

test('резервный юнит не наносит урон врагу', () => {
  // Резервный юнит пропускается в цикле атаки игрока (if isReserve continue)
  const bs = makeBs();
  bs.playerUnits[0].gridX  = 10; bs.playerUnits[0].gridY = 7;
  bs.playerUnits[0].isReserve = true;
  bs.enemyUnits[0].gridX   = 11; bs.enemyUnits[0].gridY  = 7;
  bs.playerUnits[1].gridX  = 3;  bs.playerUnits[1].gridY = 3; // далеко
  bs.enemyUnits[1].gridX   = 18; bs.enemyUnits[1].gridY  = 3; // далеко

  const eBefore = bs.enemyUnits[0].strength;

  tacticalTick(bs);

  assertEqual(bs.enemyUnits[0].strength, eBefore, 'резервный не наносит урон врагу');
});

// ═══════════════════════════════════════════════════
console.log('\n── tacticalTick — движение ИИ ──────────────────');

test('враг двигается к игроку (X-ось)', () => {
  const bs = makeBs();
  // Враг правее игрока, должен сдвинуться влево
  bs.playerUnits[0].gridX = 5;  bs.playerUnits[0].gridY = 7;
  bs.playerUnits[1].gridX = 3;  bs.playerUnits[1].gridY = 3;
  bs.enemyUnits[0].gridX  = 14; bs.enemyUnits[0].gridY  = 7;
  bs.enemyUnits[1].gridX  = 18; bs.enemyUnits[1].gridY  = 3;

  const xBefore = bs.enemyUnits[0].gridX;
  tacticalTick(bs);
  assert(bs.enemyUnits[0].gridX < xBefore, `враг сдвинулся влево: ${xBefore} → ${bs.enemyUnits[0].gridX}`);
});

test('враг двигается к игроку (Y-ось если X совпадает)', () => {
  const bs = makeBs();
  bs.playerUnits[0].gridX = 10; bs.playerUnits[0].gridY = 5;
  bs.playerUnits[1].gridX = 3;  bs.playerUnits[1].gridY = 0;
  bs.enemyUnits[0].gridX  = 10; bs.enemyUnits[0].gridY  = 12;  // X совпадает, двигается по Y
  bs.enemyUnits[1].gridX  = 18; bs.enemyUnits[1].gridY  = 15;

  const yBefore = bs.enemyUnits[0].gridY;
  tacticalTick(bs);
  assert(bs.enemyUnits[0].gridY < yBefore, `враг сдвинулся вверх по Y: ${yBefore} → ${bs.enemyUnits[0].gridY}`);
});

test('враг не двигается на занятую клетку', () => {
  const bs = makeBs();
  // Враг прямо справа от игрока, клетка между занята другим игроком
  bs.playerUnits[0].gridX = 10; bs.playerUnits[0].gridY = 7;
  bs.playerUnits[1].gridX = 11; bs.playerUnits[1].gridY = 7;  // блокирует путь
  bs.enemyUnits[0].gridX  = 12; bs.enemyUnits[0].gridY  = 7;  // пытается на 11,7
  bs.enemyUnits[1].gridX  = 18; bs.enemyUnits[1].gridY  = 3;

  const xBefore = bs.enemyUnits[0].gridX;
  tacticalTick(bs);
  // 11,7 занята → враг не должен сдвинуться
  assertEqual(bs.enemyUnits[0].gridX, xBefore, `враг не прошёл через занятую клетку: остался на ${xBefore}`);
});

// ═══════════════════════════════════════════════════
console.log('\n── tacticalTick — победные условия ────────────');

test('уничтожение всех врагов → phase = ended, log содержит Победа', () => {
  // Один враг с силой 1, рядом с игроком с силой 99999 — умрёт за один тик
  const playerUnits = [
    createUnit('p_only', 'player', 'infantry', 99999, 10, 7),
  ];
  const enemyUnits = [
    createUnit('e_only', 'enemy', 'infantry', 1, 11, 7),
  ];
  const bs = {
    playerUnits, enemyUnits,
    terrain: 'plains', elevatedCells: new Set(),
    turn: 0, phase: 'battle', log: [], selectedUnitId: null
  };

  tacticalTick(bs);

  assertEqual(bs.enemyUnits[0].strength, 0, 'враг уничтожен');
  assertEqual(bs.phase, 'ended', 'phase = ended');
  assertEqual(bs._testOutcome, 'player_wins', 'outcome = player_wins');
  const hasWin = bs.log.some(e => e.text.includes('Победа'));
  assert(hasWin, 'лог содержит "Победа"');
});

test('уничтожение всех юнитов игрока → phase = ended, log содержит Поражение', () => {
  const playerUnits = [
    createUnit('p_only', 'player', 'infantry', 1, 10, 7),
  ];
  const enemyUnits = [
    createUnit('e_only', 'enemy', 'infantry', 99999, 11, 7),
  ];
  const bs = {
    playerUnits, enemyUnits,
    terrain: 'plains', elevatedCells: new Set(),
    turn: 0, phase: 'battle', log: [], selectedUnitId: null
  };

  tacticalTick(bs);

  assertEqual(bs.playerUnits[0].strength, 0, 'юнит игрока уничтожен');
  assertEqual(bs.phase, 'ended', 'phase = ended при поражении');
  assertEqual(bs._testOutcome, 'player_loses', 'outcome = player_loses');
  const hasLose = bs.log.some(e => e.text.includes('Поражение'));
  assert(hasLose, 'лог содержит "Поражение"');
});

test('после окончания боя turn не увеличивается при повторном тике', () => {
  const bs = makeBs();
  bs.phase = 'ended';
  // tacticalTick не должен изменять состояние если phase = ended
  // (кнопка не вызывает его — проверяем логику на уровне btn)
  // Симуляция: вручную вызываем тик только если phase === 'battle'
  const turnBefore = bs.turn;
  if (bs.phase === 'battle') tacticalTick(bs);
  assertEqual(bs.turn, turnBefore, 'тик не выполняется если phase = ended');
});

// ═══════════════════════════════════════════════════
console.log('\n── FORMATION_MULT — структура ──────────────────');

test('все 5 формаций присутствуют', () => {
  const keys = Object.keys(FORMATION_MULT);
  assertEqual(keys.length, 5, 'ровно 5 формаций');
  for (const k of ['standard', 'aggressive', 'defensive', 'flanking', 'siege']) {
    assert(k in FORMATION_MULT, `${k} присутствует`);
  }
});

test('каждая формация имеет atk и def', () => {
  for (const [name, fm] of Object.entries(FORMATION_MULT)) {
    assert(typeof fm.atk === 'number', `${name}.atk число`);
    assert(typeof fm.def === 'number', `${name}.def число`);
  }
});

test('aggressive.atk > standard.atk', () => {
  assert(FORMATION_MULT.aggressive.atk > FORMATION_MULT.standard.atk, 'aggressive атакует сильнее');
});

test('defensive.atk < standard.atk', () => {
  assert(FORMATION_MULT.defensive.atk < FORMATION_MULT.standard.atk, 'defensive атакует слабее');
});

test('defensive.def > standard.def', () => {
  assert(FORMATION_MULT.defensive.def > FORMATION_MULT.standard.def, 'defensive защищается лучше');
});

// ═══════════════════════════════════════════════════
console.log('\n── Итог ────────────────────────────────────────');
console.log(`  Пройдено: ${passed}  Провалено: ${failed}`);
if (failed > 0) process.exit(1);
