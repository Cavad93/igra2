// ══════════════════════════════════════════════════════
// Тактический режим боя — логика
// Этап 1: константы
// Этап 3: createUnit + initTacticalBattle
// ══════════════════════════════════════════════════════

const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const CELL_SIZE = 40;
const UNIT_BASE_SIZE = 400;
const RESERVE_ZONE_COLS = 3;

// ── Этап 3: структура юнита ──────────────────────────

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

  // Разбить армию на юниты
  function splitArmy(army, side) {
    const units = [];
    const inf = army.infantry || 0;
    const cav = army.cavalry  || 0;
    const arc = army.archers  || 0;
    const total = inf + cav + arc;
    if (total === 0) return units;

    const maxUnits = MAX_UNITS_PER_SIDE - 1; // -1 для командира
    const baseCount = Math.min(maxUnits, Math.max(1, Math.ceil(total / 500)));

    // Пропорциональное распределение типов
    const types = [];
    const infUnits = Math.max(inf > 0 ? 1 : 0, Math.round(baseCount * inf / total));
    const cavUnits = Math.max(cav > 0 ? 1 : 0, Math.round(baseCount * cav / total));
    const arcUnits = Math.max(arc > 0 ? 1 : 0, baseCount - infUnits - cavUnits);

    for (let i = 0; i < infUnits; i++) types.push(['infantry', Math.floor(inf / infUnits)]);
    for (let i = 0; i < cavUnits; i++) types.push(['cavalry',  Math.floor(cav / cavUnits)]);
    for (let i = 0; i < arcUnits; i++) types.push(['archers',  Math.floor(arc / (arcUnits || 1))]);

    // Расстановка: игрок — колонки 4–8, враг — 14–18
    const startX  = side === 'player' ? 4 : 14;
    const centerY = Math.floor(TACTICAL_GRID_ROWS / 2);

    types.forEach(([type, str], i) => {
      if (str <= 0) return;
      const gridY = centerY - Math.floor(types.length / 2) + i;
      units.push(createUnit(`${side}_${type}_${i}`, side, type, str,
        startX + (side === 'player' ? 0 : 2), gridY));
    });

    // Командир
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
