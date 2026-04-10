// Тесты Этапа 3 — initTacticalBattle()
// Запуск: node tests/test_tactical_stage3.mjs

// ── Инлайн-константы из engine/tactical_battle.js ────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const CELL_SIZE = 40;
const UNIT_BASE_SIZE = 400;
const RESERVE_ZONE_COLS = 3;

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

    const maxUnits = MAX_UNITS_PER_SIDE - 1;
    const baseCount = Math.min(maxUnits, Math.max(1, Math.ceil(total / 500)));

    const types = [];
    const infUnits = Math.max(inf > 0 ? 1 : 0, Math.round(baseCount * inf / total));
    const cavUnits = Math.max(cav > 0 ? 1 : 0, Math.round(baseCount * cav / total));
    const arcUnits = Math.max(arc > 0 ? 1 : 0, baseCount - infUnits - cavUnits);

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
    const cmdY = centerY;
    const cmdUnit = createUnit(`${side}_cmd`, side, 'infantry', 50, cmdX, cmdY, {
      isCommander: true,
      moveSpeed: 3,
      commander: army.commander || null
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
    elevatedCells: new Set(),
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

// ── Тестовый фреймворк ──────────────────────────────
let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failed++;
  }
}

// ── Тест 1: базовая структура ────────────────────────
console.log('\n[1] initTacticalBattle({ infantry:1000 }, { infantry:500 }, { terrain:"plains" })');
{
  const state = initTacticalBattle({ infantry: 1000 }, { infantry: 500 }, { terrain: 'plains' });
  check('Возвращает объект с playerUnits', Array.isArray(state.playerUnits));
  check('Возвращает объект с enemyUnits', Array.isArray(state.enemyUnits));
  check('playerUnits не пусто', state.playerUnits.length > 0);
  check('enemyUnits не пусто', state.enemyUnits.length > 0);
  check('terrain = plains', state.terrain === 'plains');
  check('turn = 0', state.turn === 0);
  check('phase = battle', state.phase === 'battle');
  check('log — массив', Array.isArray(state.log));
  check('elevatedCells — Set', state.elevatedCells instanceof Set);
  check('ambushUsed = false', state.ambushUsed === false);
  check('selectedUnitId = null', state.selectedUnitId === null);
}

// ── Тест 2: армия 1000 пехоты ────────────────────────
console.log('\n[2] Армия 1000 пехоты → 2–3 юнита + 1 командир');
{
  const state = initTacticalBattle({ infantry: 1000 }, { infantry: 1 }, { terrain: 'plains' });
  const pUnits = state.playerUnits;
  const nonCmdPlayer = pUnits.filter(u => !u.isCommander);
  const cmdPlayer    = pUnits.filter(u => u.isCommander);
  console.log(`  playerUnits count: ${pUnits.length}, non-cmd: ${nonCmdPlayer.length}, cmd: ${cmdPlayer.length}`);
  check('Ровно 1 командир у игрока', cmdPlayer.length === 1);
  check('2–3 боевых юнита у игрока', nonCmdPlayer.length >= 2 && nonCmdPlayer.length <= 3);
}

// ── Тест 3: ограничение 20 юнитов ────────────────────
console.log('\n[3] Армия 100 000 → не более 20 юнитов на сторону');
{
  const state = initTacticalBattle(
    { infantry: 100000 }, { infantry: 100000 }, { terrain: 'plains' }
  );
  console.log(`  playerUnits: ${state.playerUnits.length}, enemyUnits: ${state.enemyUnits.length}`);
  check('playerUnits ≤ 20', state.playerUnits.length <= 20);
  check('enemyUnits ≤ 20', state.enemyUnits.length <= 20);
}

// ── Тест 4: смешанная армия (inf+cav+arc) ─────────────
console.log('\n[4] Армия 50 смешанная → юниты разных типов');
{
  const state = initTacticalBattle(
    { infantry: 20, cavalry: 15, archers: 15 },
    { infantry: 10 },
    { terrain: 'hills' }
  );
  const types = new Set(state.playerUnits.filter(u => !u.isCommander).map(u => u.type));
  console.log(`  Types найдены: ${[...types].join(', ')}`);
  check('Есть infantry', types.has('infantry'));
  check('Есть cavalry', types.has('cavalry'));
  check('Есть archers', types.has('archers'));
}

// ── Тест 5: обязательные поля юнита ─────────────────
console.log('\n[5] Все юниты имеют обязательные поля');
{
  const state = initTacticalBattle(
    { infantry: 500, cavalry: 200, archers: 100 },
    { infantry: 300 },
    { terrain: 'plains' }
  );
  const allUnits = [...state.playerUnits, ...state.enemyUnits];
  const requiredFields = ['strength', 'maxStrength', 'morale', 'fatigue', 'gridX', 'gridY',
                          'ammo', 'isRouting', 'isReserve', 'isCommander', 'formation'];
  let allOk = true;
  for (const u of allUnits) {
    for (const f of requiredFields) {
      if (!(f in u)) {
        console.error(`  ❌ Юнит ${u.id} не имеет поля ${f}`);
        allOk = false;
      }
    }
  }
  check('Все юниты имеют обязательные поля', allOk);
}

// ── Тест 6: ammo у лучников ──────────────────────────
console.log('\n[6] ammo = 30 у archers, 0 у остальных');
{
  const state = initTacticalBattle(
    { infantry: 200, archers: 200 },
    { cavalry: 200, archers: 100 },
    { terrain: 'plains' }
  );
  const allUnits = [...state.playerUnits, ...state.enemyUnits];
  const archerAmmoOk = allUnits.filter(u => u.type === 'archers').every(u => u.ammo === 30);
  const otherAmmoOk  = allUnits.filter(u => u.type !== 'archers').every(u => u.ammo === 0);
  check('Лучники ammo === 30', archerAmmoOk);
  check('Не-лучники ammo === 0', otherAmmoOk);
}

// ── Тест 7: ровно 1 командир на сторону ─────────────
console.log('\n[7] Ровно 1 командир на каждую сторону');
{
  const state = initTacticalBattle(
    { infantry: 500, cavalry: 300, archers: 200 },
    { infantry: 400, cavalry: 100 },
    { terrain: 'mountains' }
  );
  const pCmd = state.playerUnits.filter(u => u.isCommander);
  const eCmd = state.enemyUnits.filter(u => u.isCommander);
  check('1 командир у игрока', pCmd.length === 1);
  check('1 командир у врага', eCmd.length === 1);
}

// ── Тест 8: maxStrengthInBattle ─────────────────────
console.log('\n[8] maxStrengthInBattle = максимум среди всех юнитов');
{
  const state = initTacticalBattle(
    { infantry: 1000 },
    { cavalry: 200 },
    { terrain: 'plains' }
  );
  const allUnits = [...state.playerUnits, ...state.enemyUnits];
  const realMax = Math.max(...allUnits.map(u => u.maxStrength));
  console.log(`  maxStrengthInBattle: ${state.maxStrengthInBattle}, realMax: ${realMax}`);
  check('maxStrengthInBattle равно реальному максимуму', state.maxStrengthInBattle === realMax);
}

// ── Тест 9: gridX диапазоны ──────────────────────────
console.log('\n[9] Позиции: игрок gridX 4–8, враг gridX 14–18');
{
  const state = initTacticalBattle(
    { infantry: 600 },
    { infantry: 600 },
    { terrain: 'plains' }
  );
  const pInRange = state.playerUnits.every(u => u.gridX >= 4 && u.gridX <= 8);
  const eInRange = state.enemyUnits.every(u => u.gridX >= 14 && u.gridX <= 18);
  const pXList = state.playerUnits.map(u => u.gridX).join(', ');
  const eXList = state.enemyUnits.map(u => u.gridX).join(', ');
  console.log(`  player gridX: [${pXList}]`);
  console.log(`  enemy  gridX: [${eXList}]`);
  check('Юниты игрока gridX в 4–8', pInRange);
  check('Юниты врага gridX в 14–18', eInRange);
}

// ── Итог ────────────────────────────────────────────
console.log(`\n════════════════════════════════════`);
console.log(`Результат: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
