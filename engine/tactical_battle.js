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

  // Этап 14: начальная усталость если армия маршировала в этот ход
  const marchedThisTurn = atkArmy.marchedThisTurn ?? false;
  playerUnits.forEach(u => { u.fatigue = marchedThisTurn ? 35 : 0; });

  const maxStrength = Math.max(
    ...playerUnits.map(u => u.maxStrength),
    ...enemyUnits.map(u => u.maxStrength)
  );

  // Этап 16: сохранить стартовые позиции стандартов (клетки командиров)
  const playerCmd = playerUnits.find(u => u.isCommander);
  const enemyCmd  = enemyUnits.find(u => u.isCommander);

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
    selectedUnitId: null,
    playerStandardPos: playerCmd ? { x: playerCmd.gridX, y: playerCmd.gridY } : null,
    enemyStandardPos:  enemyCmd  ? { x: enemyCmd.gridX,  y: enemyCmd.gridY  } : null
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

// ── Этап 11: фланговая атака ─────────────────────────

function getAttackDirection(attacker, defender) {
  const dx = attacker.gridX - defender.gridX;
  const dy = attacker.gridY - defender.gridY;
  // Флаг если атака преимущественно горизонтальная
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  if (isHorizontal) {
    // Фронт цели смотрит в сторону противника:
    // player смотрит вправо (ожидает атаку с dx > 0 — это фронт)
    // enemy  смотрит влево  (ожидает атаку с dx < 0 — это фронт)
    const expectedSide = defender.side === 'player' ? 1 : -1;
    return Math.sign(dx) === expectedSide ? 'front' : 'rear';
  }
  return 'flank';
}

function flankBonus(direction) {
  if (direction === 'rear')  return { dmg: 1.70, morale: -35 };
  if (direction === 'flank') return { dmg: 1.40, morale: -20 };
  return { dmg: 1.00, morale: 0 };
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

// ── Этап 14: усталость ───────────────────────────────

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

function getAdjacentUnits(unit, side, bs) {
  const all = side === 'player' ? bs.playerUnits : bs.enemyUnits;
  return all.filter(u =>
    u.strength > 0 && !u.isRouting &&
    Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridY - unit.gridY) === 1
  );
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

  // Этап 13: шанс гибели командира при атаке
  if (defender.isCommander && damage > 0) {
    processCommanderDeath(defender, bs);
  }

  if (defender.strength === 0) defender.morale = 0;
  return damage;
}

// ── Этап 13: аура командира ───────────────────────────

function processCommanderAura(bs) {
  for (const side of ['player', 'enemy']) {
    const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;
    const cmd   = units.find(u => u.isCommander && u.strength > 0);
    if (!cmd) continue;

    const skills    = cmd.commander?.skills ?? [];
    const auraBonus = 15 + (skills.includes('inspiring') ? 10 : 0);

    const nearby = units.filter(u =>
      u.id !== cmd.id && u.strength > 0 && !u.isRouting &&
      Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= 2
    );

    for (const u of nearby) {
      const prev = u.morale;
      u.morale = Math.min(100, u.morale + auraBonus * 0.1); // +1.5 (или +2.5) за тик
      if (prev < 60 && u.morale > prev)
        addLog(bs, `★ ${cmd.commander?.name ?? 'Командир'} воодушевляет войска`);
    }
  }
}

// Вызывается из resolveMelee при атаке на командира
function processCommanderDeath(cmd, bs) {
  const side  = cmd.side;
  const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;

  if (Math.random() < 0.10) { // 10% шанс гибели за атаку
    cmd.strength = 0;
    addLog(bs, `💀 КОМАНДИР ПАЛ В БОЮ! Армия в смятении! (-30 мораль всем)`);
    for (const u of units) {
      u.morale = Math.max(0, u.morale - 30);
    }
  }
}

// ── Этап 12: паника и бегство ────────────────────────

function processPanic(bs) {
  const allUnits = [...bs.playerUnits, ...bs.enemyUnits];

  for (const unit of allUnits) {
    if (unit.strength === 0) continue;

    // Новые routing-юниты (мораль ≤ 20)
    if (!unit.isRouting && unit.morale <= 20) {
      unit.isRouting = true;
      addLog(bs, `💀 ${unit.type} (${unit.side === 'player' ? 'наши' : 'враги'}) обратились в бегство!`);

      // Эффект домино: соседи теряют мораль
      const allies = (unit.side === 'player' ? bs.playerUnits : bs.enemyUnits)
        .filter(u => u.id !== unit.id && u.strength > 0 && !u.isRouting &&
          Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridY - unit.gridY) <= 2);
      for (const ally of allies) {
        ally.morale = Math.max(0, ally.morale - 15);
        if (allies.length > 0)
          addLog(bs, `😱 Паника распространяется на ${ally.type}! (-15 мораль)`);
      }
    }

    // Движение routing-юнитов — назад к своему краю
    if (unit.isRouting && unit.strength > 0) {
      const retreatDir = unit.side === 'player' ? -1 : 1;
      const nx = unit.gridX + retreatDir;
      if (nx < 0 || nx >= TACTICAL_GRID_COLS) {
        // Вышел за карту — потерян
        addLog(bs, `🏃 ${unit.type} покинули поле боя (потеряны)`);
        unit.strength = 0;
      } else if (!findUnitAt(nx, unit.gridY, bs)) {
        unit.gridX = nx;
      }
    }
  }
}

// Попытка остановить панику командиром (30% шанс)
function processCommanderRally(bs) {
  for (const side of ['player', 'enemy']) {
    const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;
    const cmd   = units.find(u => u.isCommander && u.strength > 0);
    if (!cmd) continue;

    const routing = units.filter(u => u.isRouting && u.strength > 0 &&
      Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= 2);

    for (const ru of routing) {
      if (Math.random() < 0.30) {
        ru.isRouting = false;
        ru.morale    = 30;
        addLog(bs, `★ Командир остановил бегущих ${ru.type}!`);
      }
    }
  }
}

function checkVictory(bs) {
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  const enemyAlive  = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (enemyAlive.length === 0) return 'player_wins';
  if (playerAlive.length === 0) return 'player_loses';
  return null;
}

// ── Этап 16: захват стандарта ─────────────────────────

function checkStandardCapture(bs) {
  if (bs.phase === 'ended') return;

  const eStd = bs.enemyStandardPos;
  const pStd = bs.playerStandardPos;

  // Игрок захватывает стандарт врага
  if (eStd) {
    const captor = bs.playerUnits.find(u =>
      u.strength > 0 && !u.isRouting && u.gridX === eStd.x && u.gridY === eStd.y);
    if (captor) {
      addLog(bs, `🏴 СТАНДАРТ ЗАХВАЧЕН! Враг деморализован — ПОБЕДА!`);
      bs.enemyUnits.forEach(u => { u.isRouting = true; u.morale = 0; });
      bs.phase = 'ended';
      setTimeout(() => endTacticalBattle(bs, 'player_captured_standard'), 1500);
      return;
    }
  }

  // Враг захватывает стандарт игрока
  if (pStd) {
    const captor = bs.enemyUnits.find(u =>
      u.strength > 0 && !u.isRouting && u.gridX === pStd.x && u.gridY === pStd.y);
    if (captor) {
      addLog(bs, `🏴 Враг захватил наш стандарт — ПОРАЖЕНИЕ!`);
      bs.playerUnits.forEach(u => { u.isRouting = true; u.morale = 0; });
      bs.phase = 'ended';
      setTimeout(() => endTacticalBattle(bs, 'player_loses'), 1500);
    }
  }
}

// ── Этап 17: отступление с расчётом выживших ─────────

function calcRetreatSurvival(bs) {
  const enemyActive = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);

  // Проверка направлений окружения
  const hasEnemyBehind      = enemyActive.some(e => e.gridX < RESERVE_ZONE_COLS + 2);
  const hasEnemyTopFlank    = enemyActive.some(e => e.gridY <= 2);
  const hasEnemyBottomFlank = enemyActive.some(e => e.gridY >= TACTICAL_GRID_ROWS - 3);
  const flankedBothSides    = hasEnemyTopFlank && hasEnemyBottomFlank;

  const routingRatio = bs.playerUnits.filter(u => u.isRouting).length /
                       Math.max(1, bs.playerUnits.length);

  let base = 0.68;
  if (hasEnemyBehind && flankedBothSides) base = 0.12; // полное окружение
  else if (hasEnemyBehind || flankedBothSides) base = 0.35; // частичное окружение
  else if (routingRatio > 0.5) base = 0.50;

  const hasCavalry = bs.playerUnits.some(u => u.type === 'cavalry' && u.strength > 0);
  const cavBonus   = hasCavalry ? 0.10 : 0;

  return Math.min(0.80, base + cavBonus);
}

function executeRetreat(bs) {
  const pct = calcRetreatSurvival(bs);
  for (const u of bs.playerUnits) {
    u.strength = Math.floor(u.strength * pct);
  }
  bs.phase = 'ended';
  addLog(bs, `🏃 Армия отступила. Спаслось ~${Math.round(pct * 100)}% войск.`);
  endTacticalBattle(bs, 'player_retreat');
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
    if (dmg > 0) {
      addLog(bs, `🏹 Лучники выпустили залп: −${dmg} (осталось ${pu.ammo})`);
      pu._foughtThisTick = true;
    }
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
    if (dmg > 0) {
      addLog(bs, `🏹 Вражеские лучники: −${dmg} (осталось ${eu.ammo})`);
      eu._foughtThisTick = true;
    }
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
      if (dmg > 0) {
        addLog(bs, `⚔ ${pu.type} → ${eu.type}: −${dmg}`);
        pu._foughtThisTick = true;
        eu._foughtThisTick = true;
      }
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
      if (dmg > 0) {
        addLog(bs, `🛡 ${eu.type} бьёт ${pu.type}: −${dmg}`);
        eu._foughtThisTick = true;
        pu._foughtThisTick = true;
      }
    }
  }

  // 2. Этап 15: ИИ-резерв — ввести если фронт < 3 активных юнитов
  {
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

  // 2b. ИИ противника: движение с учётом стратегии захвата стандарта (Этап 16)
  {
    const enemyTotalStr  = bs.enemyUnits.reduce((s, u) => s + u.strength, 0);
    const enemyMaxStr    = bs.enemyUnits.reduce((s, u) => s + u.maxStrength, 0);
    const enemyHpRatio   = enemyMaxStr > 0 ? enemyTotalStr / enemyMaxStr : 1;

    for (const eu of bs.enemyUnits) {
      if (eu.isRouting || eu.strength === 0 || eu.isReserve) continue;
      const alive = bs.playerUnits.filter(u => u.strength > 0);
      if (alive.length === 0) break;

      let targetX, targetY;

      // Этап 16: ИИ-стратегия стандарта
      if (enemyHpRatio < 0.40 && bs.enemyStandardPos) {
        // Прикрывать командира: двигаться к позиции стандарта врага (нашего командира)
        targetX = bs.enemyStandardPos.x;
        targetY = bs.enemyStandardPos.y;
      } else if (enemyHpRatio > 0.60 && bs.playerStandardPos) {
        // Прорваться к стандарту игрока
        targetX = bs.playerStandardPos.x;
        targetY = bs.playerStandardPos.y;
      } else {
        // Обычное движение к ближайшему юниту игрока
        const nearest = alive.reduce((best, u) =>
          (Math.abs(u.gridX - eu.gridX) + Math.abs(u.gridY - eu.gridY)) <
          (Math.abs(best.gridX - eu.gridX) + Math.abs(best.gridY - eu.gridY)) ? u : best
        );
        targetX = nearest.gridX;
        targetY = nearest.gridY;
      }

      const dx = Math.sign(targetX - eu.gridX);
      const dy = Math.sign(targetY - eu.gridY);
      const nx = eu.gridX + (dx !== 0 ? dx : 0);
      const ny = eu.gridY + (dx === 0 ? dy : 0);
      if (nx >= 0 && nx < TACTICAL_GRID_COLS && ny >= 0 && ny < TACTICAL_GRID_ROWS) {
        if (!findUnitAt(nx, ny, bs)) {
          eu.gridX = nx; eu.gridY = ny;
          eu._movedThisTick = true;
        }
      }
    }
  }

  // 2c. Этап 16: проверить захват стандарта после перемещений
  checkStandardCapture(bs);
  if (bs.phase === 'ended') return;

  // 3. Аура командира (воодушевление союзников)
  processCommanderAura(bs);

  // 4. Фаза паники и попытка командира остановить бегство
  processPanic(bs);
  processCommanderRally(bs);

  // 5. Фаза усталости
  for (const u of [...bs.playerUnits, ...bs.enemyUnits]) {
    if (u.strength === 0) continue;
    processFatigue(u, u._movedThisTick, u._foughtThisTick);
    u._movedThisTick  = false;
    u._foughtThisTick = false;
  }

  // 6. Проверить победу
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
