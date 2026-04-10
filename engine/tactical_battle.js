// ══════════════════════════════════════════════════════
// Тактический режим боя — логика
// Этап 1: константы
// Этап 3: createUnit + initTacticalBattle
// Этап 8: боевые формулы и тактический тик
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

// ── Этап 10: генерация возвышенных клеток ────────────

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

// ── Этап 10: боевой бонус от рельефа ─────────────────

function getTerrainAttackMult(attacker, defender, bs) {
  const atkElev = bs.elevatedCells.has(`${attacker.gridX},${attacker.gridY}`);
  const defElev = bs.elevatedCells.has(`${defender.gridX},${defender.gridY}`);
  if (atkElev && !defElev) return 1.10; // атака с высоты
  if (!atkElev && defElev) return 0.88; // атака вверх
  return 1.0;
}

// ── Этап 9: боеприпасы стрелков ──────────────────────

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

// ── Этап 8: боевые формулы и тактический тик ──────────

const FORMATION_MULT = {
  standard:  { atk: 1.0, def: 1.0 },
  aggressive:{ atk: 1.3, def: 0.8 },
  defensive: { atk: 0.7, def: 1.4 },
  flanking:  { atk: 1.1, def: 0.9 },
  siege:     { atk: 0.5, def: 1.2 }
};

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

function getAdjacentUnits(unit, side, bs) {
  const all = side === 'player' ? bs.playerUnits : bs.enemyUnits;
  return all.filter(u =>
    u.strength > 0 && !u.isRouting &&
    Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridY - unit.gridY) === 1
  );
}

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

function checkVictory(bs) {
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  const enemyAlive  = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (enemyAlive.length === 0) return 'player_wins';
  if (playerAlive.length === 0) return 'player_loses';
  return null;
}

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

  // 1b. Ответный удар: каждый враг атакует соседних юнитов игрока
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

  // 2. Простой ИИ: враги двигаются к ближайшему юниту игрока
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
    return;
  }

  document.getElementById('tac-turn').textContent = `Ход ${bs.turn}`;
  redrawAll(_ctx, bs);
}
