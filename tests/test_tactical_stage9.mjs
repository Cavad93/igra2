// Тесты Этапа 9 — Боеприпасы стрелков
// Запуск: node tests/test_tactical_stage9.mjs

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

// ── Инлайн: FORMATION_MULT ───────────────────────────
const FORMATION_MULT = {
  standard:  { atk: 1.0, def: 1.0 },
  aggressive:{ atk: 1.3, def: 0.8 },
  defensive: { atk: 0.7, def: 1.4 },
  flanking:  { atk: 1.1, def: 0.9 },
  siege:     { atk: 0.5, def: 1.2 }
};

// ── Инлайн: addLog ───────────────────────────────────
function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
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

// ── Инлайн: resolveArrows (Этап 9) ───────────────────
function resolveArrows(archer, target, bs) {
  const isElev   = bs.elevatedCells.has(`${archer.gridX},${archer.gridY}`);
  const rangeMax = isElev ? 4 : 3;
  const dist     = Math.abs(archer.gridX - target.gridX)
                 + Math.abs(archer.gridY - target.gridY);
  if (dist > rangeMax || dist === 0) return 0;

  const ammoBonus = archer.ammo > 10 ? 1.0 : archer.ammo > 0 ? 0.65 : 0;
  if (ammoBonus === 0) return 0;

  const elevBonus = isElev ? 1.15 : 1.0;
  const dmg = Math.floor(archer.strength * 0.06 * ammoBonus * elevBonus
    * moraleMultiplier(archer.morale) * fatigueMultiplier(archer.fatigue));

  archer.ammo = Math.max(0, archer.ammo - 1);
  target.strength = Math.max(0, target.strength - dmg);
  if (target.strength === 0) target.morale = 0;

  if (archer.ammo === 0) {
    addLog(bs, `⚠️ Лучники ${archer.id} израсходовали стрелы!`);
  }
  return dmg;
}

// ── Инлайн: checkVictory ─────────────────────────────
function checkVictory(bs) {
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  const enemyAlive  = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (enemyAlive.length === 0) return 'player_wins';
  if (playerAlive.length === 0) return 'player_loses';
  return null;
}

function endTacticalBattle(bs, outcome) {
  bs._testOutcome = outcome;
}

// ── Инлайн: tacticalTick с стрелковой фазой ─────────
function tacticalTick(bs) {
  if (bs.phase === 'ended') return;
  bs.turn++;

  // 0. Стрелковая фаза (до рукопашной)
  for (const pu of bs.playerUnits) {
    if (pu.type !== 'archers' || pu.isRouting || pu.strength === 0 || pu.isReserve) continue;
    if (pu.ammo === 0) continue;
    const isElev = bs.elevatedCells.has(`${pu.gridX},${pu.gridY}`);
    const rangeMax = isElev ? 4 : 3;
    const inRange = bs.enemyUnits.filter(eu =>
      eu.strength > 0 && !eu.isRouting &&
      Math.abs(eu.gridX - pu.gridX) + Math.abs(eu.gridY - pu.gridY) <= rangeMax
    );
    if (inRange.length === 0) continue;
    const target = inRange.reduce((best, eu) =>
      (Math.abs(eu.gridX - pu.gridX) + Math.abs(eu.gridY - pu.gridY)) <
      (Math.abs(best.gridX - pu.gridX) + Math.abs(best.gridY - pu.gridY)) ? eu : best
    );
    const dmg = resolveArrows(pu, target, bs);
    if (dmg > 0) addLog(bs, `🏹 Лучники выпустили залп: −${dmg} (осталось ${pu.ammo})`);
  }
  for (const eu of bs.enemyUnits) {
    if (eu.type !== 'archers' || eu.isRouting || eu.strength === 0 || eu.isReserve) continue;
    if (eu.ammo === 0) continue;
    const isElev = bs.elevatedCells.has(`${eu.gridX},${eu.gridY}`);
    const rangeMax = isElev ? 4 : 3;
    const inRange = bs.playerUnits.filter(pu =>
      pu.strength > 0 && !pu.isRouting &&
      Math.abs(pu.gridX - eu.gridX) + Math.abs(pu.gridY - eu.gridY) <= rangeMax
    );
    if (inRange.length === 0) continue;
    const target = inRange.reduce((best, pu) =>
      (Math.abs(pu.gridX - eu.gridX) + Math.abs(pu.gridY - eu.gridY)) <
      (Math.abs(best.gridX - eu.gridX) + Math.abs(best.gridY - eu.gridY)) ? pu : best
    );
    const dmg = resolveArrows(eu, target, bs);
    if (dmg > 0) addLog(bs, `🏹 Вражеские лучники: −${dmg} (осталось ${eu.ammo})`);
  }

  // 1. Рукопашный бой: каждый юнит игрока атакует соседних врагов
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

  // 1b. Ответный удар
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

  // 2. Простой ИИ
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

  // 3. Проверить победу
  const outcome = checkVictory(bs);
  if (outcome) {
    bs.phase = 'ended';
    addLog(bs, outcome === 'player_wins' ? '🏆 Победа!' : '💀 Поражение!');
    endTacticalBattle(bs, outcome);
  }
}

// ── Фабрика боевого состояния ────────────────────────
function makeBs(overrides = {}) {
  return {
    playerUnits: [],
    enemyUnits: [],
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
  if (Math.abs(a - b) > eps) throw new Error(`${msg ?? ''}: ${a} не близко к ${b} (eps=${eps})`);
}

// ═══════════════════════════════════════════════════
console.log('\n── resolveArrows — базовая стрельба ────────────');

test('лучник на дистанции 2 наносит урон', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 7, 7); // dist=2
  const before = target.strength;
  const dmg = resolveArrows(archer, target, bs);
  assert(dmg > 0, `урон должен быть > 0, получено ${dmg}`);
  assert(target.strength < before, `сила цели уменьшилась: ${before} → ${target.strength}`);
});

test('лучник на дистанции 1 (контакт) тоже наносит урон', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 6, 7); // dist=1
  const dmg = resolveArrows(archer, target, bs);
  assert(dmg > 0, `урон при dist=1 должен быть > 0`);
});

test('лучник на дистанции 3 (макс. без возвышенности) наносит урон', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 8, 7); // dist=3
  const dmg = resolveArrows(archer, target, bs);
  assert(dmg > 0, `урон при dist=3 должен быть > 0`);
});

test('лучник на дистанции 4 (без возвышенности) НЕ стреляет', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 9, 7); // dist=4
  const dmg = resolveArrows(archer, target, bs);
  assertEqual(dmg, 0, 'dist=4 без возвышенности → 0 урона');
  // ammo не должен расходоваться
  assertEqual(archer.ammo, 30, 'ammo не расходуется без выстрела');
});

test('лучник на дистанции 5 НЕ стреляет', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 10, 7); // dist=5
  const dmg = resolveArrows(archer, target, bs);
  assertEqual(dmg, 0, 'dist=5 → 0 урона');
});

// ═══════════════════════════════════════════════════
console.log('\n── resolveArrows — возвышенность ───────────────');

test('лучник на возвышенности: дальность 4', () => {
  const bs = makeBs({ elevatedCells: new Set(['5,7']) });
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 9, 7); // dist=4
  const dmg = resolveArrows(archer, target, bs);
  assert(dmg > 0, `на возвышенности dist=4 должен давать урон`);
});

test('лучник на возвышенности: дальность 5 НЕ стреляет', () => {
  const bs = makeBs({ elevatedCells: new Set(['5,7']) });
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7);
  const target = createUnit('t', 'enemy',  'infantry', 1000, 10, 7); // dist=5
  const dmg = resolveArrows(archer, target, bs);
  assertEqual(dmg, 0, 'на возвышенности dist=5 → 0 урона');
});

test('возвышенность даёт бонус ×1.15 к урону', () => {
  // Сравниваем урон с возвышенностью и без
  const bsFlat = makeBs();
  const bsElev = makeBs({ elevatedCells: new Set(['5,7']) });

  const a1 = createUnit('a1', 'player', 'archers', 1000, 5, 7, { ammo: 30 });
  const t1 = createUnit('t1', 'enemy',  'infantry', 99999, 7, 7);
  const dmgFlat = resolveArrows(a1, t1, bsFlat);

  const a2 = createUnit('a2', 'player', 'archers', 1000, 5, 7, { ammo: 30 });
  const t2 = createUnit('t2', 'enemy',  'infantry', 99999, 7, 7);
  const dmgElev = resolveArrows(a2, t2, bsElev);

  assert(dmgElev > dmgFlat, `возвышенность (${dmgElev}) > ровная местность (${dmgFlat})`);
  assertClose(dmgElev / dmgFlat, 1.15, 0.02, 'бонус возвышенности ≈ 1.15');
});

// ═══════════════════════════════════════════════════
console.log('\n── resolveArrows — расход боеприпасов ──────────');

test('каждый выстрел уменьшает ammo на 1', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7, { ammo: 30 });
  const target = createUnit('t', 'enemy',  'infantry', 99999, 7, 7);

  resolveArrows(archer, target, bs);
  assertEqual(archer.ammo, 29, 'ammo = 29 после 1 выстрела');

  resolveArrows(archer, target, bs);
  assertEqual(archer.ammo, 28, 'ammo = 28 после 2 выстрелов');
});

test('ammo не опускается ниже 0', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7, { ammo: 1 });
  const target = createUnit('t', 'enemy',  'infantry', 99999, 7, 7);

  resolveArrows(archer, target, bs);
  assertEqual(archer.ammo, 0, 'ammo = 0 после последнего выстрела');

  resolveArrows(archer, target, bs);
  assertEqual(archer.ammo, 0, 'ammo не уходит в отрицательные');
});

test('при ammo === 0 урон равен 0', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7, { ammo: 0 });
  const target = createUnit('t', 'enemy',  'infantry', 99999, 7, 7);
  const before = target.strength;
  const dmg = resolveArrows(archer, target, bs);
  assertEqual(dmg, 0, 'ammo=0 → урон 0');
  assertEqual(target.strength, before, 'сила цели не изменилась');
});

test('лог "израсходовали стрелы" когда ammo достигает 0', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7, { ammo: 1 });
  const target = createUnit('t', 'enemy',  'infantry', 99999, 7, 7);

  resolveArrows(archer, target, bs);
  assertEqual(archer.ammo, 0, 'ammo = 0');
  const hasMsg = bs.log.some(e => e.text.includes('израсходовали стрелы'));
  assert(hasMsg, 'лог содержит "израсходовали стрелы"');
});

test('при ammo от 1 до 10 урон ×0.65 от полного', () => {
  const bs = makeBs();

  const aFull = createUnit('af', 'player', 'archers', 1000, 5, 7, { ammo: 30 });
  const tFull = createUnit('tf', 'enemy',  'infantry', 99999, 7, 7);
  const dmgFull = resolveArrows(aFull, tFull, bs);

  const aLow = createUnit('al', 'player', 'archers', 1000, 5, 7, { ammo: 5 });
  const tLow = createUnit('tl', 'enemy',  'infantry', 99999, 7, 7);
  const dmgLow = resolveArrows(aLow, tLow, bs);

  assert(dmgLow < dmgFull, `малый запас (${dmgLow}) < полный запас (${dmgFull})`);
  assertClose(dmgLow / dmgFull, 0.65, 0.02, 'соотношение урона с малым ammo ≈ 0.65');
});

test('после 30 выстрелов подряд ammo === 0', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7, { ammo: 30 });
  const target = createUnit('t', 'enemy',  'infantry', 999999, 7, 7);

  for (let i = 0; i < 30; i++) {
    resolveArrows(archer, target, bs);
  }
  assertEqual(archer.ammo, 0, 'после 30 выстрелов ammo = 0');
  const hasMsg = bs.log.some(e => e.text.includes('израсходовали стрелы'));
  assert(hasMsg, 'лог содержит предупреждение об исчерпании стрел');
});

// ═══════════════════════════════════════════════════
console.log('\n── tacticalTick — стрелковая фаза ─────────────');

test('archer-юнит стреляет в первом тике без контакта', () => {
  const bs = makeBs();
  // Лучник в позиции 5,7 — враг в позиции 8,7 (dist=3, в радиусе)
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 1000, 8, 7)];

  const eBefore = bs.enemyUnits[0].strength;
  tacticalTick(bs);

  assert(bs.enemyUnits[0].strength < eBefore,
    `враг получил урон от стрелы: ${eBefore} → ${bs.enemyUnits[0].strength}`);
});

test('archer-юнит вне радиуса (dist=4) НЕ стреляет через тик', () => {
  const bs = makeBs();
  // Лучник в 5,7 — враг в 9,7 (dist=4, вне стандартного радиуса 3)
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 1000, 9, 7)];

  const eBefore = bs.enemyUnits[0].strength;
  const ammoBefore = bs.playerUnits[0].ammo;
  tacticalTick(bs);

  assertEqual(bs.enemyUnits[0].strength, eBefore, 'враг не получил урон от стрел (вне радиуса)');
  assertEqual(bs.playerUnits[0].ammo, ammoBefore, 'ammo не расходуется (выстрела не было)');
});

test('ammo лучника уменьшается после стрелкового тика', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 1000, 7, 7)]; // dist=2

  assertEqual(bs.playerUnits[0].ammo, 30, 'начальный ammo = 30');
  tacticalTick(bs);
  assertEqual(bs.playerUnits[0].ammo, 29, 'ammo = 29 после 1 тика');
});

test('лучник с ammo=0 не стреляет, но melee-контакт работает', () => {
  const bs = makeBs();
  // Лучник с исчерпанными стрелами, вплотную к врагу
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7, { ammo: 0 })];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 9999, 6, 7)]; // dist=1

  const eBefore = bs.enemyUnits[0].strength;
  tacticalTick(bs);

  // Стрелы кончились → стрелковый урон 0
  // Но в рукопашной (melee) всё равно бьёт
  assert(bs.enemyUnits[0].strength < eBefore,
    `лучник без стрел наносит рукопашный урон: ${eBefore} → ${bs.enemyUnits[0].strength}`);
  // ammo не уходит ниже 0
  assertEqual(bs.playerUnits[0].ammo, 0, 'ammo остаётся 0');
});

test('резервный лучник не стреляет', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7, { isReserve: true })];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 1000, 7, 7)]; // dist=2

  const eBefore = bs.enemyUnits[0].strength;
  const ammoBefore = bs.playerUnits[0].ammo;
  tacticalTick(bs);

  assertEqual(bs.enemyUnits[0].strength, eBefore, 'резервный лучник не стреляет');
  assertEqual(bs.playerUnits[0].ammo, ammoBefore, 'ammo резервного не расходуется');
});

test('routing-лучник не стреляет', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7, { isRouting: true })];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 1000, 7, 7)];

  const eBefore = bs.enemyUnits[0].strength;
  const ammoBefore = bs.playerUnits[0].ammo;
  tacticalTick(bs);

  assertEqual(bs.enemyUnits[0].strength, eBefore, 'routing-лучник не стреляет');
  assertEqual(bs.playerUnits[0].ammo, ammoBefore, 'ammo routing-лучника не расходуется');
});

// ═══════════════════════════════════════════════════
console.log('\n── Вражеские лучники ───────────────────────────');

test('вражеский лучник стреляет по юниту игрока', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_inf', 'player', 'infantry', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_arc', 'enemy',  'archers',  1000, 8, 7)]; // dist=3

  const pBefore = bs.playerUnits[0].strength;
  tacticalTick(bs);

  assert(bs.playerUnits[0].strength < pBefore,
    `игрок получил урон от вражеских лучников: ${pBefore} → ${bs.playerUnits[0].strength}`);
});

test('вражеский лучник тоже расходует ammo', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_inf', 'player', 'infantry', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_arc', 'enemy',  'archers',  1000, 7, 7)]; // dist=2

  assertEqual(bs.enemyUnits[0].ammo, 30, 'начальный ammo вражеского лучника = 30');
  tacticalTick(bs);
  assertEqual(bs.enemyUnits[0].ammo, 29, 'ammo вражеского лучника = 29 после тика');
});

test('вражеский лучник с ammo=0 не стреляет', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_inf', 'player', 'infantry', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_arc', 'enemy',  'archers',  100, 8, 7, { ammo: 0 })];

  const pBefore = bs.playerUnits[0].strength;
  // Враг вне контакта (dist=3) и без стрел
  tacticalTick(bs);

  assertEqual(bs.playerUnits[0].strength, pBefore,
    'вражеский лучник без стрел не наносит урон издалека');
});

test('вражеский лучник вне радиуса не стреляет', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_inf', 'player', 'infantry', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_arc', 'enemy',  'archers',  1000, 9, 7)]; // dist=4

  const pBefore = bs.playerUnits[0].strength;
  const ammoBefore = bs.enemyUnits[0].ammo;
  tacticalTick(bs);

  assertEqual(bs.playerUnits[0].strength, pBefore, 'вне радиуса урон не получен');
  assertEqual(bs.enemyUnits[0].ammo, ammoBefore, 'ammo не расходуется вне радиуса');
});

// ═══════════════════════════════════════════════════
console.log('\n── Формула урона стрел ─────────────────────────');

test('базовый урон стрел: 1000 силы, ammo>10, morale 80, fatigue 0 → ≈72', () => {
  // 1000 * 0.06 * 1.0 * 1.0 * 1.20 * 1.00 = 72
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 1000, 5, 7, { ammo: 30, morale: 80, fatigue: 0 });
  const target = createUnit('t', 'enemy',  'infantry', 99999, 7, 7);
  const dmg = resolveArrows(archer, target, bs);
  assertEqual(dmg, 72, 'базовый урон стрел = 72');
});

test('стрелы наносят больше урона чем пехота (0.06 vs 0.04)', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers',  1000, 5, 7, { ammo: 30, morale: 50, fatigue: 0 });
  const inf    = createUnit('i', 'player', 'infantry', 1000, 5, 7, { morale: 50, fatigue: 0 });
  const target1 = createUnit('t1', 'enemy', 'infantry', 99999, 7, 7);
  const target2 = createUnit('t2', 'enemy', 'infantry', 99999, 6, 7);

  const dmgArrow = resolveArrows(archer, target1, bs);
  const dmgMelee = resolveMelee(inf, target2, bs);

  assert(dmgArrow > dmgMelee,
    `стрелы (${dmgArrow}) наносят больше урона чем меле (${dmgMelee}) при равной силе`);
});

test('уничтоженная цель получает mоrale=0', () => {
  const bs = makeBs();
  const archer = createUnit('a', 'player', 'archers', 99999, 5, 7, { ammo: 30 });
  const target = createUnit('t', 'enemy',  'infantry', 1, 7, 7, { morale: 80 });
  resolveArrows(archer, target, bs);
  assertEqual(target.strength, 0, 'цель уничтожена');
  assertEqual(target.morale, 0, 'мораль = 0 при уничтожении');
});

// ═══════════════════════════════════════════════════
console.log('\n── Лог событий стрелков ─────────────────────────');

test('лог обновляется при стрельбе через tacticalTick', () => {
  const bs = makeBs();
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 1000, 5, 7)];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 1000, 7, 7)];

  tacticalTick(bs);

  const hasArrowLog = bs.log.some(e => e.text.includes('🏹'));
  assert(hasArrowLog, 'лог содержит запись со стрельбой (🏹)');
});

test('ammo отображается корректно: уменьшается каждый ход', () => {
  const bs = makeBs();
  // Обе стороны живучие — никто не умирает за 5 тиков
  bs.playerUnits = [createUnit('p_arc', 'player', 'archers', 999999, 5, 7)];
  bs.enemyUnits  = [createUnit('e_inf', 'enemy', 'infantry', 999999, 7, 7)];

  for (let i = 0; i < 5; i++) tacticalTick(bs);
  assertEqual(bs.playerUnits[0].ammo, 25, 'ammo = 25 после 5 тиков стрельбы');
});

// ═══════════════════════════════════════════════════
console.log('\n── Итог ────────────────────────────────────────');
console.log(`  Пройдено: ${passed}  Провалено: ${failed}`);
if (failed > 0) process.exit(1);
