// Тесты Этапа 10 — Рельеф и возвышенности
// Запуск: node tests/test_tactical_stage10.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const UNIT_BASE_SIZE     = 400;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн: generateElevatedCells (Этап 10) ──────────
function generateElevatedCells(terrain, cols, rows) {
  const elevated = new Set();
  const ratio = { plains: 0, river_valley: 0.04, coastal_city: 0.05,
                  hills: 0.25, mountains: 0.40 }[terrain] ?? 0;
  if (ratio === 0) return elevated;

  const totalCells   = cols * rows;
  const targetCount  = Math.floor(totalCells * ratio);
  const clusterCount = Math.ceil(targetCount / 10);

  for (let i = 0; i < clusterCount; i++) {
    const cx = RESERVE_ZONE_COLS + 1 +
               Math.floor(Math.random() * (cols - RESERVE_ZONE_COLS * 2 - 2));
    const cy = 1 + Math.floor(Math.random() * (rows - 2));
    const r  = 2 + Math.floor(Math.random() * 2);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy <= r * r) {
          const ex = cx + dx, ey = cy + dy;
          if (ex >= RESERVE_ZONE_COLS && ex < cols - RESERVE_ZONE_COLS &&
              ey >= 0 && ey < rows) {
            elevated.add(`${ex},${ey}`);
          }
        }
      }
    }
  }
  return elevated;
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

// ── Инлайн: getTerrainAttackMult (Этап 10) ───────────
function getTerrainAttackMult(attacker, defender, bs) {
  const atkElev = bs.elevatedCells.has(`${attacker.gridX},${attacker.gridY}`);
  const defElev = bs.elevatedCells.has(`${defender.gridX},${defender.gridY}`);
  if (atkElev && !defElev) return 1.10;
  if (!atkElev && defElev) return 0.88;
  return 1.0;
}

// ── Инлайн: addLog ───────────────────────────────────
function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
}

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

// ── Инлайн: findUnitAt ───────────────────────────────
function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
}

// ── Инлайн: resolveMelee с terrain-бонусом ───────────
function resolveMelee(attacker, defender, bs) {
  const fm      = FORMATION_MULT[attacker.formation] ?? FORMATION_MULT.standard;
  const terrain = getTerrainAttackMult(attacker, defender, bs);
  const damage  = attacker.strength
    * 0.04
    * fm.atk
    * terrain
    * moraleMultiplier(attacker.morale)
    * fatigueMultiplier(attacker.fatigue);
  defender.strength = Math.max(0, defender.strength - Math.floor(damage));
  if (defender.strength === 0) defender.morale = 0;
  return Math.floor(damage);
}

// ── Инлайн: resolveArrows ────────────────────────────
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
  return dmg;
}

// ── Инлайн: initTacticalBattle ──────────────────────
function initTacticalBattle(atkArmy, defArmy, region) {
  const playerUnits = [];
  const enemyUnits  = [];

  function splitArmy(army, side) {
    const units = [];
    const inf = army.infantry || 0;
    const cav = army.cavalry  || 0;
    const arc = army.archers  || 0;
    const total = inf + cav + arc;
    if (total === 0) return units;
    const maxUnits  = MAX_UNITS_PER_SIDE - 1;
    const baseCount = Math.min(maxUnits, Math.max(1, Math.ceil(total / 500)));
    const infUnits  = Math.max(inf > 0 ? 1 : 0, Math.round(baseCount * inf / total));
    const cavUnits  = Math.max(cav > 0 ? 1 : 0, Math.round(baseCount * cav / total));
    const arcUnits  = Math.max(arc > 0 ? 1 : 0, baseCount - infUnits - cavUnits);
    const types     = [];
    for (let i = 0; i < infUnits; i++) types.push(['infantry', Math.floor(inf / infUnits)]);
    for (let i = 0; i < cavUnits; i++) types.push(['cavalry',  Math.floor(cav / cavUnits)]);
    for (let i = 0; i < arcUnits; i++) types.push(['archers',  Math.floor(arc / (arcUnits || 1))]);
    const startX  = side === 'player' ? 4 : 14;
    const centerY = Math.floor(TACTICAL_GRID_ROWS / 2);
    types.forEach(([type, str], i) => {
      if (str <= 0) return;
      const gridY = centerY - Math.floor(types.length / 2) + i;
      units.push(createUnit(`${side}_${type}_${i}`, side, type, str,
        startX + (side === 'player' ? 0 : 2), gridY));
    });
    const cmdX = side === 'player' ? 5 : 16;
    const cmdUnit = createUnit(`${side}_cmd`, side, 'infantry', 50, cmdX, centerY, {
      isCommander: true, moveSpeed: 3, commander: army.commander || null
    });
    units.push(cmdUnit);
    return units;
  }

  playerUnits.push(...splitArmy(atkArmy, 'player'));
  enemyUnits.push(...splitArmy(defArmy, 'enemy'));

  const maxStrength = Math.max(
    ...playerUnits.map(u => u.maxStrength),
    ...enemyUnits.map(u => u.maxStrength)
  );

  return {
    playerUnits,
    enemyUnits,
    region,
    terrain: region?.terrain ?? 'plains',
    elevatedCells: generateElevatedCells(region?.terrain ?? 'plains', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS),
    turn: 0,
    phase: 'battle',
    log: [],
    atkArmy,
    defArmy,
    maxStrengthInBattle: maxStrength,
    ambushUsed: false,
    selectedUnitId: null
  };
}

// ── Тестовый хелпер ──────────────────────────────────
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

// ════════════════════════════════════════
// ТЕСТЫ ЭТАПА 10
// ════════════════════════════════════════

console.log('\n═══ Этап 10: generateElevatedCells ═══\n');

test('hills → elevatedCells.size > 0', () => {
  // Запустим несколько раз чтобы убедиться — hills всегда генерирует клетки
  let nonZero = 0;
  for (let i = 0; i < 10; i++) {
    const s = generateElevatedCells('hills', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS);
    if (s.size > 0) nonZero++;
  }
  assert(nonZero === 10, `hills должен всегда давать > 0 клеток (только ${nonZero}/10 раз)`);
});

test('plains → elevatedCells.size === 0', () => {
  for (let i = 0; i < 5; i++) {
    const s = generateElevatedCells('plains', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS);
    assert(s.size === 0, `plains должен давать 0 клеток, получено ${s.size}`);
  }
});

test('hills ≈ 25% клеток (±15%)', () => {
  const total = TACTICAL_GRID_COLS * TACTICAL_GRID_ROWS; // 352
  const sizes = [];
  for (let i = 0; i < 20; i++) {
    sizes.push(generateElevatedCells('hills', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS).size);
  }
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const pct = avg / total;
  assert(pct >= 0.10 && pct <= 0.40,
    `hills: средний % = ${(pct * 100).toFixed(1)}%, ожидалось 10–40%`);
});

test('mountains ≈ 40% клеток (±15%)', () => {
  const total = TACTICAL_GRID_COLS * TACTICAL_GRID_ROWS;
  const sizes = [];
  for (let i = 0; i < 20; i++) {
    sizes.push(generateElevatedCells('mountains', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS).size);
  }
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const pct = avg / total;
  assert(pct >= 0.25 && pct <= 0.55,
    `mountains: средний % = ${(pct * 100).toFixed(1)}%, ожидалось 25–55%`);
});

test('mountains > hills (в среднем)', () => {
  let sumH = 0, sumM = 0;
  for (let i = 0; i < 20; i++) {
    sumH += generateElevatedCells('hills',     TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS).size;
    sumM += generateElevatedCells('mountains', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS).size;
  }
  assert(sumM > sumH, `mountains (${sumM}) должен быть > hills (${sumH})`);
});

test('elevated клетки не в резервных зонах (колонки 0–2 и 19–21)', () => {
  for (let i = 0; i < 10; i++) {
    const s = generateElevatedCells('hills', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS);
    for (const key of s) {
      const [ex] = key.split(',').map(Number);
      assert(ex >= RESERVE_ZONE_COLS && ex < TACTICAL_GRID_COLS - RESERVE_ZONE_COLS,
        `Клетка ${key} попала в резервную зону (x=${ex})`);
    }
  }
});

test('river_valley генерирует небольшое количество клеток', () => {
  let hasAny = false;
  for (let i = 0; i < 20; i++) {
    const s = generateElevatedCells('river_valley', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS);
    if (s.size > 0) { hasAny = true; break; }
  }
  assert(hasAny, 'river_valley должен иногда генерировать клетки');
});

test('coastal_city генерирует небольшое количество клеток', () => {
  let hasAny = false;
  for (let i = 0; i < 20; i++) {
    const s = generateElevatedCells('coastal_city', TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS);
    if (s.size > 0) { hasAny = true; break; }
  }
  assert(hasAny, 'coastal_city должен иногда генерировать клетки');
});

// ════════════════════════════════════════
console.log('\n═══ Этап 10: initTacticalBattle с terrain ═══\n');

test('initTacticalBattle hills → elevatedCells.size > 0', () => {
  const bs = initTacticalBattle(
    { infantry: 1000 }, { infantry: 1000 }, { terrain: 'hills' }
  );
  assert(bs.elevatedCells.size > 0,
    `hills → ожидали > 0 elevated клеток, получили ${bs.elevatedCells.size}`);
});

test('initTacticalBattle plains → elevatedCells.size === 0', () => {
  const bs = initTacticalBattle(
    { infantry: 1000 }, { infantry: 1000 }, { terrain: 'plains' }
  );
  assert(bs.elevatedCells.size === 0,
    `plains → ожидали 0 elevated клеток, получили ${bs.elevatedCells.size}`);
});

test('initTacticalBattle mountains → elevatedCells.size > 0', () => {
  const bs = initTacticalBattle(
    { infantry: 1000 }, { infantry: 1000 }, { terrain: 'mountains' }
  );
  assert(bs.elevatedCells.size > 0,
    `mountains → ожидали > 0 elevated клеток, получили ${bs.elevatedCells.size}`);
});

// ════════════════════════════════════════
console.log('\n═══ Этап 10: getTerrainAttackMult ═══\n');

function makeBS(elevatedKeys = []) {
  return {
    elevatedCells: new Set(elevatedKeys),
    playerUnits: [],
    enemyUnits: [],
    log: [],
    turn: 0
  };
}

test('оба на равнине → множитель 1.0', () => {
  const bs  = makeBS([]);
  const atk = createUnit('a', 'player', 'infantry', 1000, 5, 5);
  const def = createUnit('d', 'enemy',  'infantry', 1000, 6, 5);
  assert(getTerrainAttackMult(atk, def, bs) === 1.0);
});

test('атакующий на высоте, защитник внизу → 1.10', () => {
  const bs  = makeBS(['5,5']);
  const atk = createUnit('a', 'player', 'infantry', 1000, 5, 5);
  const def = createUnit('d', 'enemy',  'infantry', 1000, 6, 5);
  assert(getTerrainAttackMult(atk, def, bs) === 1.10);
});

test('атакующий внизу, защитник на высоте → 0.88', () => {
  const bs  = makeBS(['6,5']);
  const atk = createUnit('a', 'player', 'infantry', 1000, 5, 5);
  const def = createUnit('d', 'enemy',  'infantry', 1000, 6, 5);
  assert(getTerrainAttackMult(atk, def, bs) === 0.88);
});

test('оба на возвышенности → 1.0', () => {
  const bs  = makeBS(['5,5', '6,5']);
  const atk = createUnit('a', 'player', 'infantry', 1000, 5, 5);
  const def = createUnit('d', 'enemy',  'infantry', 1000, 6, 5);
  assert(getTerrainAttackMult(atk, def, bs) === 1.0);
});

// ════════════════════════════════════════
console.log('\n═══ Этап 10: resolveMelee с terrain-бонусом ═══\n');

test('атака с возвышенности даёт больше урона (~10%)', () => {
  const base = makeBS([]);
  const elevated = makeBS(['5,5']);
  const str = 1000;

  const atkBase  = createUnit('a1', 'player', 'infantry', str, 5, 5);
  const defBase  = createUnit('d1', 'enemy',  'infantry', str, 6, 5);
  const strBefore1 = defBase.strength;
  resolveMelee(atkBase, defBase, base);
  const dmgBase = strBefore1 - defBase.strength;

  const atkElev  = createUnit('a2', 'player', 'infantry', str, 5, 5);
  const defElev  = createUnit('d2', 'enemy',  'infantry', str, 6, 5);
  const strBefore2 = defElev.strength;
  resolveMelee(atkElev, defElev, elevated);
  const dmgElev = strBefore2 - defElev.strength;

  assert(dmgElev > dmgBase,
    `Атака с высоты (${dmgElev}) должна быть > обычной (${dmgBase})`);
  assert(dmgElev <= dmgBase * 1.15,
    `Бонус не должен превышать 15% (получено: ${((dmgElev/dmgBase - 1)*100).toFixed(1)}%)`);
});

test('атака вверх даёт меньше урона (~12%)', () => {
  const base    = makeBS([]);
  const uphill  = makeBS(['6,5']);
  const str = 1000;

  const atkBase  = createUnit('a1', 'player', 'infantry', str, 5, 5);
  const defBase  = createUnit('d1', 'enemy',  'infantry', str, 6, 5);
  const strBefore1 = defBase.strength;
  resolveMelee(atkBase, defBase, base);
  const dmgBase = strBefore1 - defBase.strength;

  const atkUp  = createUnit('a2', 'player', 'infantry', str, 5, 5);
  const defUp  = createUnit('d2', 'enemy',  'infantry', str, 6, 5);
  const strBefore2 = defUp.strength;
  resolveMelee(atkUp, defUp, uphill);
  const dmgUp = strBefore2 - defUp.strength;

  assert(dmgUp < dmgBase,
    `Атака вверх (${dmgUp}) должна быть < обычной (${dmgBase})`);
  assert(dmgUp >= dmgBase * 0.80,
    `Штраф не должен превышать 20% (получено: ${((1 - dmgUp/dmgBase)*100).toFixed(1)}%)`);
});

// ════════════════════════════════════════
console.log('\n═══ Этап 10: стрелки — дальность с возвышенности ═══\n');

test('стрелки с высоты бьют на 4 клетки', () => {
  const bs = makeBS(['5,5']);
  const archer = createUnit('a', 'player', 'archers', 500, 5, 5);
  const target  = createUnit('t', 'enemy',  'infantry', 1000, 9, 5); // dist=4
  const dmg = resolveArrows(archer, target, bs);
  assert(dmg > 0, `Стрелки с возвышенности должны бить на дист 4 (dmg=${dmg})`);
});

test('стрелки с высоты НЕ бьют на 5 клеток', () => {
  const bs = makeBS(['5,5']);
  const archer = createUnit('a', 'player', 'archers', 500, 5, 5);
  const target  = createUnit('t', 'enemy',  'infantry', 1000, 10, 5); // dist=5
  const before = target.strength;
  resolveArrows(archer, target, bs);
  assert(target.strength === before, 'Дист 5 должна быть вне радиуса с высоты');
});

test('стрелки с ровной местности бьют на 3 клетки', () => {
  const bs = makeBS([]);
  const archer = createUnit('a', 'player', 'archers', 500, 5, 5);
  const target  = createUnit('t', 'enemy',  'infantry', 1000, 8, 5); // dist=3
  const dmg = resolveArrows(archer, target, bs);
  assert(dmg > 0, `Стрелки должны бить на дист 3 с ровной местности (dmg=${dmg})`);
});

test('стрелки с ровной местности НЕ бьют на 4 клетки', () => {
  const bs = makeBS([]);
  const archer = createUnit('a', 'player', 'archers', 500, 5, 5);
  const target  = createUnit('t', 'enemy',  'infantry', 1000, 9, 5); // dist=4
  const before = target.strength;
  resolveArrows(archer, target, bs);
  assert(target.strength === before, 'Дист 4 должна быть вне радиуса без возвышенности');
});

test('стрелки с возвышенности дают бонус к урону (elevBonus 1.15)', () => {
  const bsFlat = makeBS([]);
  const bsElev = makeBS(['5,5']);
  const str = 1000;

  const a1 = createUnit('a1', 'player', 'archers', str, 5, 5);
  const t1 = createUnit('t1', 'enemy',  'infantry', 10000, 7, 5);
  const before1 = t1.strength;
  resolveArrows(a1, t1, bsFlat);
  const dmgFlat = before1 - t1.strength;

  const a2 = createUnit('a2', 'player', 'archers', str, 5, 5);
  const t2 = createUnit('t2', 'enemy',  'infantry', 10000, 7, 5);
  const before2 = t2.strength;
  resolveArrows(a2, t2, bsElev);
  const dmgElev = before2 - t2.strength;

  assert(dmgElev >= dmgFlat,
    `Стрелки с высоты (${dmgElev}) должны бить >= с ровной (${dmgFlat})`);
});

// ════════════════════════════════════════
console.log('\n═══ Этап 10: кавалерия на возвышенности ═══\n');

// Симулируем логику onTacticalClick для moveSpeed кавалерии
function computeEffectiveMoveSpeed(unit, elevatedCells) {
  const cavOnElev = unit.type === 'cavalry' &&
    elevatedCells.has(`${unit.gridX},${unit.gridY}`);
  return cavOnElev ? Math.max(1, unit.moveSpeed - 1) : unit.moveSpeed;
}

test('кавалерия НЕ на возвышенности → moveSpeed 4', () => {
  const elev = new Set();
  const cav  = createUnit('c', 'player', 'cavalry', 500, 5, 5);
  assert(computeEffectiveMoveSpeed(cav, elev) === 4);
});

test('кавалерия НА возвышенности → moveSpeed 3 (4-1)', () => {
  const elev = new Set(['5,5']);
  const cav  = createUnit('c', 'player', 'cavalry', 500, 5, 5);
  assert(computeEffectiveMoveSpeed(cav, elev) === 3);
});

test('пехота на возвышенности → moveSpeed не меняется (2)', () => {
  const elev = new Set(['5,5']);
  const inf  = createUnit('i', 'player', 'infantry', 500, 5, 5);
  assert(computeEffectiveMoveSpeed(inf, elev) === 2);
});

test('кавалерия с moveSpeed 1 на возвышенности → не падает ниже 1', () => {
  const elev = new Set(['5,5']);
  const cav  = createUnit('c', 'player', 'cavalry', 500, 5, 5, { moveSpeed: 1 });
  assert(computeEffectiveMoveSpeed(cav, elev) === 1);
});

// ════════════════════════════════════════
console.log('\n─────────────────────────────────────\n');
console.log(`Итого: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) process.exit(1);
