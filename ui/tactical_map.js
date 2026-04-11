// ══════════════════════════════════════════════════════
// Тактическая карта боя — Canvas UI
// Этап 2: renderGrid + инициализация Canvas
// Этап 4: renderUnit + redrawAll
// Этап 5: сетка иконок солдат + полоски силы/морали
// Этап 6: управление мышью — выбор и перемещение юнитов
// Этап 7: панель выбранного юнита и кнопки формаций
// Этап 8: endTacticalBattle + привязка кнопки "Следующий ход"
// ══════════════════════════════════════════════════════

// ── Глобальные ссылки ────────────────────────────────
let _battleState = null;
let _canvas      = null;
let _ctx         = null;
let _dpr         = 1;          // devicePixelRatio — для HiDPI/Retina
let _bgOffscreen  = null;       // Г6: offscreen-кэш фона (рисуется один раз)
let _rafId        = null;       // Г7: requestAnimationFrame ID
let _floatNums    = [];         // C1: плавающие числа урона [{x,y,val,alpha,vy,color}]
let _hoverEnemy   = null;      // C2: юнит-враг под курсором (для линии прицела)
const _particles  = [];        // A1: пул частиц при ударе [{x,y,vx,vy,life,maxLife,r,color}]
const _attackAnims = new Map(); // A5: атак-анимации {unitId → {tx,ty,progress}} (0→1→0)

const UNIT_MIN_SZ = 26;
const UNIT_MAX_SZ = 52;

// ── Г2: палитра цветов ────────────────────────────────
const _P = {
  playerBorder: '#4488dd',
  enemyBorder:  '#dd5533',
  cmdGold:      '#ffd700',
  routeBorder:  '#555555',
  strBarGreen:  '#44dd44',
  strBarAmber:  '#ddaa00',
  strBarRed:    '#dd2222',
  moraleBar:    '#4488ff',
  barBg:        '#1a1a1a',
  selBorder:    '#ffffff',
};

// ── Г5: детализация местности ─────────────────────────

// Детерминированный генератор псевдослучайных чисел по seed
function _rng(seed) {
  let s = seed | 0;
  return function() {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

// Трава — небольшие стебли
function _paintGrass(ctx, px, py, rng) {
  ctx.strokeStyle = 'rgba(80,150,40,0.28)';
  ctx.lineWidth   = 1;
  ctx.lineCap     = 'round';
  const n = 3 + (rng() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const gx = px + 3 + rng() * (CELL_SIZE - 6);
    const gy = py + CELL_SIZE * 0.35 + rng() * CELL_SIZE * 0.55;
    const h  = 3 + rng() * 4;
    ctx.beginPath();
    ctx.moveTo(gx,     gy);
    ctx.lineTo(gx - 2, gy - h);
    ctx.moveTo(gx,     gy);
    ctx.lineTo(gx + 2, gy - h);
    ctx.stroke();
  }
}

// Холмы — треугольные силуэты
function _paintHills(ctx, px, py, rng) {
  ctx.fillStyle = 'rgba(110,90,50,0.22)';
  const base = py + CELL_SIZE - 3;
  const n    = 1 + (rng() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const hx = px + CELL_SIZE * (0.2 + rng() * 0.6);
    const hw = CELL_SIZE * (0.22 + rng() * 0.18);
    const hh = CELL_SIZE * (0.22 + rng() * 0.18);
    ctx.beginPath();
    ctx.moveTo(hx - hw, base);
    ctx.lineTo(hx,      base - hh);
    ctx.lineTo(hx + hw, base);
    ctx.closePath();
    ctx.fill();
  }
}

// Горы — более высокий силуэт со снежной шапкой
function _paintMountain(ctx, px, py, rng) {
  const base = py + CELL_SIZE - 2;
  const hx   = px + CELL_SIZE * (0.35 + rng() * 0.3);
  const hw   = CELL_SIZE * 0.40;
  const hh   = CELL_SIZE * 0.58;
  ctx.fillStyle = 'rgba(95,88,105,0.30)';
  ctx.beginPath();
  ctx.moveTo(hx - hw, base);
  ctx.lineTo(hx - hw * 0.3, base - hh * 0.55);
  ctx.lineTo(hx,             base - hh);
  ctx.lineTo(hx + hw * 0.3,  base - hh * 0.55);
  ctx.lineTo(hx + hw, base);
  ctx.closePath();
  ctx.fill();
  // Снежная шапка
  ctx.fillStyle = 'rgba(210,225,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(hx - hw * 0.20, base - hh * 0.74);
  ctx.lineTo(hx,              base - hh);
  ctx.lineTo(hx + hw * 0.20, base - hh * 0.74);
  ctx.closePath();
  ctx.fill();
}

// ── Г4: иконки типов юнитов — чистый canvas, без emoji ──
const _ICONS = {
  infantry(ctx, cx, cy, sz) {
    // Два скрещённых меча
    const s = sz * 0.26;
    ctx.strokeStyle = 'rgba(255,255,255,0.90)';
    ctx.lineWidth   = Math.max(1.2, sz * 0.045);
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
    // Гарды (крестовины)
    ctx.lineWidth = Math.max(1, sz * 0.032);
    const g = s * 0.5;
    ctx.beginPath(); ctx.moveTo(cx - g, cy - g); ctx.lineTo(cx + g, cy - g); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - g, cy + g); ctx.lineTo(cx + g, cy + g); ctx.stroke();
  },
  cavalry(ctx, cx, cy, sz) {
    // Силуэт лошади: тело-эллипс + голова + ноги
    const s = sz * 0.20;
    ctx.strokeStyle = 'rgba(255,255,255,0.90)';
    ctx.lineWidth   = Math.max(1.2, sz * 0.04);
    ctx.lineCap     = 'round';
    // Тело
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.3, s * 0.7, -0.15, 0, Math.PI * 2); ctx.stroke();
    // Голова
    ctx.beginPath(); ctx.ellipse(cx + s * 1.2, cy - s * 0.5, s * 0.48, s * 0.38, 0.3, 0, Math.PI * 2); ctx.stroke();
    // Ноги (4 штуки)
    ctx.lineWidth = Math.max(1, sz * 0.028);
    const legY = cy + s * 0.6;
    for (const [lx, ang] of [[-0.75, -0.1], [-0.25, 0.1], [0.25, -0.1], [0.75, 0.1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + lx * s, legY);
      ctx.lineTo(cx + lx * s + ang * s, legY + s * 0.9);
      ctx.stroke();
    }
  },
  archers(ctx, cx, cy, sz) {
    // Лук + стрела
    const s = sz * 0.26;
    ctx.strokeStyle = 'rgba(255,255,255,0.90)';
    ctx.lineWidth   = Math.max(1.2, sz * 0.045);
    ctx.lineCap     = 'round';
    // Дуга лука
    ctx.beginPath(); ctx.arc(cx - s * 0.25, cy, s, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();
    // Тетива
    const sx = cx - s * 0.25 + Math.cos(Math.PI * 0.6) * s;
    const sy1 = cy - Math.sin(Math.PI * 0.6) * s;
    const sy2 = cy + Math.sin(Math.PI * 0.6) * s;
    ctx.beginPath(); ctx.moveTo(sx, sy1); ctx.lineTo(sx, sy2); ctx.stroke();
    // Стрела
    ctx.lineWidth = Math.max(1, sz * 0.030);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.05, cy); ctx.lineTo(cx + s * 1.1, cy); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 1.1, cy);
    ctx.lineTo(cx + s * 0.82, cy - s * 0.22);
    ctx.moveTo(cx + s * 1.1, cy);
    ctx.lineTo(cx + s * 0.82, cy + s * 0.22);
    ctx.stroke();
  }
};

// ── Г2: скруглённый прямоугольник ────────────────────
function _rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

// ── Г6: offscreen-кэш фона ────────────────────────────
function _getBgCanvas(battleState) {
  if (_bgOffscreen) return _bgOffscreen;
  const W   = TACTICAL_GRID_COLS * CELL_SIZE;
  const H   = TACTICAL_GRID_ROWS * CELL_SIZE;
  const off = document.createElement('canvas');
  off.width  = W;
  off.height = H;
  renderGrid(off.getContext('2d'), battleState.terrain, battleState.elevatedCells);
  _bgOffscreen = off;
  return off;
}

// ── Г6: подсветка зоны движения выбранного юнита ─────
function renderMovementRange(ctx, unit, battleState) {
  if (!unit || !unit.selected || unit._movedThisTick) return;
  const cavOnElev = unit.type === 'cavalry' &&
    battleState.elevatedCells.has(`${unit.gridX},${unit.gridY}`);
  const spd = cavOnElev ? Math.max(1, unit.moveSpeed - 1) : unit.moveSpeed;

  ctx.fillStyle   = 'rgba(0,200,200,0.10)';
  ctx.strokeStyle = 'rgba(0,200,200,0.35)';
  ctx.lineWidth   = 0.5;
  for (let gx = 0; gx < TACTICAL_GRID_COLS; gx++) {
    for (let gy = 0; gy < TACTICAL_GRID_ROWS; gy++) {
      const dist = Math.abs(gx - unit.gridX) + Math.abs(gy - unit.gridY);
      if (dist > 0 && dist <= spd && !findUnitAt(gx, gy, battleState)) {
        const cpx = gx * CELL_SIZE + 1;
        const cpy = gy * CELL_SIZE + 1;
        ctx.fillRect(cpx, cpy, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.strokeRect(cpx, cpy, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }
  }
}

function renderGrid(ctx, terrain, elevatedCells = new Set()) {
  const W = TACTICAL_GRID_COLS * CELL_SIZE;
  const H = TACTICAL_GRID_ROWS * CELL_SIZE;

  // Цвет фона по местности
  const bgColor = {
    plains:       '#2a4418',
    hills:        '#3a3018',
    mountains:    '#282830',
    river_valley: '#1a2830',
    coastal_city: '#1a2828'
  }[terrain] ?? '#2a3020';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Г5: детальная отрисовка клеток по типу местности
  for (let col = 0; col < TACTICAL_GRID_COLS; col++) {
    for (let row = 0; row < TACTICAL_GRID_ROWS; row++) {
      const seed = col * 37 + row * 53 + (terrain.charCodeAt(0) || 0);
      const rng  = _rng(seed);
      const cpx  = col * CELL_SIZE;
      const cpy  = row * CELL_SIZE;
      if (terrain === 'plains') {
        _paintGrass(ctx, cpx, cpy, rng);
      } else if (terrain === 'hills') {
        if (rng() > 0.5) _paintHills(ctx, cpx, cpy, _rng(seed + 1));
        else             _paintGrass(ctx, cpx, cpy, _rng(seed + 2));
      } else if (terrain === 'mountains') {
        if (rng() > 0.35) _paintMountain(ctx, cpx, cpy, _rng(seed + 1));
      } else if (terrain === 'river_valley') {
        _paintGrass(ctx, cpx, cpy, rng);
      }
    }
  }

  // Возвышенные клетки — светлая заливка
  ctx.fillStyle = 'rgba(255,255,200,0.08)';
  for (const key of elevatedCells) {
    const [ex, ey] = key.split(',').map(Number);
    ctx.fillRect(ex * CELL_SIZE, ey * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  // Возвышенные клетки — жёлтый треугольник в правом нижнем углу
  ctx.fillStyle = 'rgba(255,220,100,0.35)';
  for (const key of elevatedCells) {
    const [ex, ey] = key.split(',').map(Number);
    ctx.beginPath();
    ctx.moveTo((ex + 1) * CELL_SIZE - 8, (ey + 1) * CELL_SIZE);
    ctx.lineTo((ex + 1) * CELL_SIZE,     (ey + 1) * CELL_SIZE);
    ctx.lineTo((ex + 1) * CELL_SIZE,     (ey + 1) * CELL_SIZE - 8);
    ctx.fill();
  }

  // Зоны резерва
  ctx.fillStyle = 'rgba(100,200,100,0.05)';
  ctx.fillRect(0, 0, RESERVE_ZONE_COLS * CELL_SIZE, H);
  ctx.fillStyle = 'rgba(200,80,80,0.05)';
  ctx.fillRect((TACTICAL_GRID_COLS - RESERVE_ZONE_COLS) * CELL_SIZE, 0,
               RESERVE_ZONE_COLS * CELL_SIZE, H);

  // Подписи зон резерва
  ctx.fillStyle = 'rgba(100,200,100,0.25)';
  ctx.font = '10px monospace';
  ctx.fillText('РЕЗЕРВ', 4, 14);
  ctx.fillStyle = 'rgba(200,80,80,0.25)';
  ctx.fillText('РЕЗЕРВ', (TACTICAL_GRID_COLS - RESERVE_ZONE_COLS) * CELL_SIZE + 4, 14);

  // Линии сетки
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= TACTICAL_GRID_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, H);
    ctx.stroke();
  }
  for (let y = 0; y <= TACTICAL_GRID_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(W, y * CELL_SIZE);
    ctx.stroke();
  }
}

// ── Этап 4: рендер юнита ────────────────────────────

function renderUnit(ctx, unit, battleState) {
  // A5: анимация атаки — смещаем позицию рисования на 30% пути к цели
  let offsetX = 0, offsetY = 0;
  const anim = _attackAnims.get(unit.id);
  if (anim) {
    const ease = anim.t * (2 - anim.t); // ease-out
    offsetX = (anim.toX - anim.fromX) * CELL_SIZE * ease * 0.30;
    offsetY = (anim.toY - anim.fromY) * CELL_SIZE * ease * 0.30;
  }
  const cellX = unit.gridX * CELL_SIZE + offsetX;
  const cellY = unit.gridY * CELL_SIZE + offsetY;

  // Подход 2: размер зависит от силы
  const ratio = Math.min(1, unit.strength / battleState.maxStrengthInBattle);
  const sz = UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
  const px = cellX + (CELL_SIZE - sz) / 2;
  const py = cellY + (CELL_SIZE - sz) / 2;

  // Подход 3: цвет и яркость
  const isPlayer  = unit.side === 'player';
  const strPct    = unit.strength / unit.maxStrength;
  // Г2: используем палитру _P
  const borderColor = unit.isCommander     ? _P.cmdGold
                    : unit.strength > 5000 ? '#e8c840'
                    : unit.isRouting       ? _P.routeBorder
                    : isPlayer             ? _P.playerBorder
                    :                        _P.enemyBorder;
  const R  = 4;                         // радиус скругления
  const cx = px + sz / 2;
  const cy = py + sz / 2;

  // ── Этап 12: мигание routing-юнитов ─────────────────
  if (unit.isRouting) {
    ctx.globalAlpha = (Math.floor(Date.now() / 400) % 2 === 0) ? 0.6 : 0.2;
  } else {
    ctx.globalAlpha = unit.isReserve ? 0.65 : 1.0;
  }

  // Г3: радиальный градиент — источник света слева-сверху
  const alpha = unit.isReserve ? 0.55 : (0.5 + 0.5 * strPct);
  const grad  = ctx.createRadialGradient(
    px + sz * 0.3, py + sz * 0.25, sz * 0.05,
    cx, cy, sz * 0.75
  );
  if (isPlayer) {
    grad.addColorStop(0,   `rgba(70,130,230,${alpha})`);
    grad.addColorStop(0.5, `rgba(26,74,158,${alpha})`);
    grad.addColorStop(1,   `rgba(8,22,55,${alpha})`);
  } else {
    grad.addColorStop(0,   `rgba(210,70,70,${alpha})`);
    grad.addColorStop(0.5, `rgba(139,26,26,${alpha})`);
    grad.addColorStop(1,   `rgba(40,8,8,${alpha})`);
  }
  _rrect(ctx, px, py, sz, sz, R);
  ctx.fillStyle = grad;
  ctx.fill();

  // Г3: bevel-блик — тонкий градиент сверху-слева для объёмности
  const bevel = ctx.createLinearGradient(px, py, px + sz * 0.5, py + sz * 0.5);
  bevel.addColorStop(0,   'rgba(255,255,255,0.18)');
  bevel.addColorStop(0.4, 'rgba(255,255,255,0.04)');
  bevel.addColorStop(1,   'rgba(0,0,0,0)');
  _rrect(ctx, px, py, sz, sz, R);
  ctx.fillStyle = bevel;
  ctx.fill();

  ctx.globalAlpha = unit.isRouting
    ? ((Math.floor(Date.now() / 400) % 2 === 0) ? 0.6 : 0.2)
    : 1.0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = unit.isCommander ? 2.5 : 1.5;
  if (unit.isReserve) ctx.setLineDash([4, 3]);
  _rrect(ctx, px, py, sz, sz, R);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Этап 5: сетка иконок солдат (Подход 1) ──────────
  const DOT_SIZE = 3;
  const DOT_MAX  = 25;
  const dotCount = Math.min(DOT_MAX, Math.max(1, Math.round(unit.strength / UNIT_BASE_SIZE)));
  const dotCols  = Math.ceil(Math.sqrt(dotCount));
  const dotRows  = Math.ceil(dotCount / dotCols);
  const gapX     = sz / (dotCols + 1);
  const gapY     = (sz * 0.65) / (dotRows + 1);

  ctx.fillStyle   = '#ffffff';
  ctx.globalAlpha = unit.isRouting ? 0.2 : 0.80;
  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      if (r * dotCols + c >= dotCount) break;
      ctx.fillRect(
        px + gapX * (c + 1) - DOT_SIZE / 2,
        py + gapY * (r + 1) - DOT_SIZE / 2,
        DOT_SIZE, DOT_SIZE
      );
    }
  }

  // А2: число солдат с outline для читаемости на любом фоне
  ctx.globalAlpha  = unit.isRouting ? 0.4 : 1.0;
  ctx.font         = `bold ${Math.max(8, sz * 0.17 | 0)}px 'Cinzel','Georgia',serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  const label = unit.strength >= 1000
    ? (unit.strength / 1000).toFixed(1) + 'k'
    : unit.strength.toString();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.strokeText(label, cx, py + sz * 0.94);
  ctx.fillStyle   = '#f0e8c0';
  ctx.fillText(label, cx, py + sz * 0.94);

  // Г2: полоска силы (под юнитом) — скруглённая
  const strPct2  = unit.strength / unit.maxStrength;
  const barColor = strPct2 > 0.6 ? _P.strBarGreen : strPct2 > 0.3 ? _P.strBarAmber : _P.strBarRed;
  ctx.globalAlpha = 0.90;
  _rrect(ctx, px, py + sz + 3, sz,           4, 2); ctx.fillStyle = _P.barBg;   ctx.fill();
  _rrect(ctx, px, py + sz + 3, sz * strPct2, 4, 2); ctx.fillStyle = barColor;   ctx.fill();

  // Г2: полоска морали (над юнитом) — скруглённая
  _rrect(ctx, px, py - 6, sz,                      3, 1.5); ctx.fillStyle = _P.barBg;     ctx.fill();
  _rrect(ctx, px, py - 6, sz * (unit.morale / 100),3, 1.5); ctx.fillStyle = _P.moraleBar; ctx.fill();
  ctx.globalAlpha = 1.0;

  // Г4: иконка типа — чистый canvas (без emoji)
  ctx.save();
  ctx.globalAlpha = unit.isRouting ? 0.40 : 0.88;
  (_ICONS[unit.type] ?? _ICONS.infantry)(ctx, cx, cy - sz * 0.04, sz);
  ctx.restore();

  if (unit.isCommander) {
    ctx.font      = `${Math.max(10, sz * 0.28 | 0)}px monospace`;
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText('★', px + sz - 2, py + 12);
  }

  if (unit.selected) {
    // Г7: пульсирующая обводка через Math.sin
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 220);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = _P.selBorder;
    ctx.lineWidth   = 2.0;
    ctx.setLineDash([4, 3]);
    _rrect(ctx, px - 3, py - 3, sz + 6, sz + 6, R + 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = 1.0;
  ctx.textAlign   = 'left';
}

// ── Этап 11: стрелка фланговой атаки ─────────────────

function drawFlankArrow(ctx, bs) {
  const a = bs._lastFlankArrow;
  if (!a) return;
  const color = a.type === 'rear' ? '#ff3333' : '#ffaa00';
  const fx = a.fromX * CELL_SIZE + CELL_SIZE / 2;
  const fy = a.fromY * CELL_SIZE + CELL_SIZE / 2;
  const tx = a.toX   * CELL_SIZE + CELL_SIZE / 2;
  const ty = a.toY   * CELL_SIZE + CELL_SIZE / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  // Стрелка живёт 1 ход
  bs._lastFlankArrow = null;
}

// ── Этап 16: рисовать флаг на позиции стандарта если командир ушёл ──

function drawStandards(ctx, bs) {
  for (const [std, cmd] of [
    [bs.enemyStandardPos,  bs.enemyUnits.find(u => u.isCommander)],
    [bs.playerStandardPos, bs.playerUnits.find(u => u.isCommander)]
  ]) {
    if (!std || !cmd) continue;
    // Показывать флаг только если командир покинул свою стартовую клетку
    if (cmd.gridX === std.x && cmd.gridY === std.y) continue;
    ctx.font = '18px monospace';
    ctx.fillText('🚩', std.x * CELL_SIZE + 4, std.y * CELL_SIZE + 20);
  }
}

function redrawAll(ctx, battleState) {
  // Г6: фон из кэша (не перерисовываем terrain каждый кадр)
  ctx.drawImage(_getBgCanvas(battleState), 0, 0);
  // Г6: подсветка зоны движения
  const sel = getSelectedUnit(battleState);
  if (sel) renderMovementRange(ctx, sel, battleState);
  for (const u of battleState.playerUnits) renderUnit(ctx, u, battleState);
  for (const u of battleState.enemyUnits)  renderUnit(ctx, u, battleState);
  drawFlankArrow(ctx, battleState);
  drawStandards(ctx, battleState);
  // A5: обновить анимации атак
  _updateAttackAnims();
  // A1: частицы удара
  _updateParticles();
  _drawParticles(ctx);
  // C2: линия прицела
  if (_hoverEnemy) drawAimLine(ctx, getSelectedUnit(battleState), _hoverEnemy);
  // C1: плавающие числа урона поверх всего
  _updateFloatNums();
  _drawFloatNums(ctx);
}

// ── Этап 6: логические функции ───────────────────────

function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
}

function selectUnit(unit, bs) {
  [...bs.playerUnits, ...bs.enemyUnits].forEach(u => u.selected = false);
  if (unit) { unit.selected = true; bs.selectedUnitId = unit.id; }
  else       { bs.selectedUnitId = null; }
  updateUnitPanel(unit, bs);
}

function getSelectedUnit(bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.id === bs.selectedUnitId) ?? null;
}

function isCellFree(gridX, gridY, bs) {
  return !findUnitAt(gridX, gridY, bs);
}

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
  const el = document.getElementById('tactical-log');
  if (el) el.innerHTML = bs.log.slice(0, 6)
    .map(e => `<div class="tac-log-entry">${e.text}</div>`).join('');
}

// ── Этап 6: обработчики мыши ─────────────────────────

function onTacticalClick(e) {
  if (!_battleState || !_canvas) return;
  const rect  = _canvas.getBoundingClientRect();
  // Г1: используем логический размер canvas (не физический canvas.width*dpr)
  const logW  = TACTICAL_GRID_COLS * CELL_SIZE;
  const logH  = TACTICAL_GRID_ROWS * CELL_SIZE;
  const scaleX = logW / rect.width;
  const scaleY = logH / rect.height;
  const gridX = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
  const gridY = Math.floor((e.clientY - rect.top)  * scaleY / CELL_SIZE);
  if (gridX < 0 || gridX >= TACTICAL_GRID_COLS) return;
  if (gridY < 0 || gridY >= TACTICAL_GRID_ROWS) return;

  const clicked  = findUnitAt(gridX, gridY, _battleState);
  const selected = getSelectedUnit(_battleState);

  if (!selected) {
    // Выбрать свой юнит
    if (clicked?.side === 'player') selectUnit(clicked, _battleState);
  } else if (clicked?.side === 'player') {
    // Переключить выбор на другой свой юнит
    selectUnit(clicked, _battleState);
  } else if (!clicked) {
    // Переместить если в радиусе moveSpeed
    // Этап 10: кавалерия на возвышенности теряет 1 ед. скорости
    const cavOnElev = selected.type === 'cavalry' &&
      _battleState.elevatedCells.has(`${selected.gridX},${selected.gridY}`);
    const effectiveMoveSpeed = cavOnElev
      ? Math.max(1, selected.moveSpeed - 1)
      : selected.moveSpeed;
    const dist = Math.abs(gridX - selected.gridX) + Math.abs(gridY - selected.gridY);
    if (dist <= effectiveMoveSpeed && isCellFree(gridX, gridY, _battleState)) {
      selected.gridX = gridX;
      selected.gridY = gridY;
      selected._movedThisTick = true; // Этап 14: флаг усталости
      addLog(_battleState, `Юнит перемещён на (${gridX},${gridY})`);
    }
  } else if (clicked?.side === 'enemy') {
    // Атака — будет реализована в Этапе 8
    addLog(_battleState, `Атака врага запланирована (Этап 8)`);
  }

  redrawAll(_ctx, _battleState);
}

function onTacticalHover(e) {
  if (!_battleState || !_canvas) return;
  const rect  = _canvas.getBoundingClientRect();
  // Г1: логический масштаб, HiDPI-safe
  const logW  = TACTICAL_GRID_COLS * CELL_SIZE;
  const logH  = TACTICAL_GRID_ROWS * CELL_SIZE;
  const scaleX = logW / rect.width;
  const scaleY = logH / rect.height;
  const gridX = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
  const gridY = Math.floor((e.clientY - rect.top)  * scaleY / CELL_SIZE);
  const unit  = findUnitAt(gridX, gridY, _battleState);
  const key   = `${gridX},${gridY}`;
  const isElev = _battleState.elevatedCells.has(key);
  const tip   = document.getElementById('tac-tooltip');

  // C2: запомнить врага под курсором для линии прицела
  const sel = getSelectedUnit(_battleState);
  _hoverEnemy = (sel && unit?.side === 'enemy') ? unit : null;

  if (!tip) return;

  if (unit) {
    tip.style.display = 'block';
    tip.style.left    = (e.clientX + 12) + 'px';
    tip.style.top     = (e.clientY + 12) + 'px';
    tip.textContent   =
      `${unit.type} | ${unit.strength.toLocaleString()} чел.\n` +
      `Мораль: ${unit.morale} | Усталость: ${unit.fatigue}\n` +
      (unit.type === 'archers' ? `Боеприпасы: ${unit.ammo}/30\n` : '') +
      (isElev ? '⛰ Возвышенность: +15% защита' : '');
  } else if (isElev) {
    tip.style.display = 'block';
    tip.style.left    = (e.clientX + 12) + 'px';
    tip.style.top     = (e.clientY + 12) + 'px';
    tip.textContent   = '⛰ Возвышенность: +15% защита, +1 дальность лучникам';
  } else {
    tip.style.display = 'none';
  }
}

// ── Этап 7: панель выбранного юнита и кнопки формаций ─

const FORMATION_LABELS = {
  standard:  'Строй',
  aggressive:'Атака',
  defensive: 'Оборона',
  flanking:  'Охват',
  siege:     'Осада'
};

function updateUnitPanel(unit, bs) {
  const panel = document.getElementById('tactical-unit-panel');
  if (!panel) return;

  if (!unit || unit.side !== 'player') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  document.getElementById('tup-name').textContent =
    (unit.isCommander ? '★ Командир' : FORMATION_LABELS[unit.type] ?? unit.type)
    + ` (${unit.side === 'player' ? 'Свои' : 'Враги'})`;

  document.getElementById('tup-strength').textContent =
    `${unit.strength.toLocaleString()} / ${unit.maxStrength.toLocaleString()} чел.`;

  const moraleEl  = document.getElementById('tup-morale');
  const fatigueEl = document.getElementById('tup-fatigue');
  if (moraleEl)  moraleEl.style.width  = unit.morale  + '%';
  if (fatigueEl) fatigueEl.style.width = unit.fatigue + '%';

  const ammoEl = document.getElementById('tup-ammo');
  if (ammoEl) {
    if (unit.type === 'archers') {
      ammoEl.textContent = unit.ammo > 0
        ? `🏹 ${unit.ammo}/30 зарядов`
        : '🏹 Стрелы кончились';
      ammoEl.style.color = unit.ammo <= 5 ? '#dd4444' : '';
    } else {
      ammoEl.textContent = '';
    }
  }

  const elevEl = document.getElementById('tup-elevation-hint');
  if (elevEl) {
    const key = `${unit.gridX},${unit.gridY}`;
    elevEl.textContent = bs.elevatedCells.has(key)
      ? '⛰ На возвышенности (+15% защита)' : '';
  }

  // Кнопки формаций
  const fbtns = document.getElementById('tup-formation-btns');
  if (fbtns) {
    fbtns.innerHTML = Object.entries(FORMATION_LABELS)
      .map(([f, label]) =>
        `<button class="tup-form-btn${unit.formation === f ? ' active' : ''}"
         onclick="_setFormation('${unit.id}','${f}')">${label}</button>`)
      .join('');
  }

  // Кнопка резерва (командиров в резерв не отправляем)
  const resBtn = document.getElementById('tup-reserve-btn');
  if (resBtn) {
    if (unit.isCommander) {
      resBtn.innerHTML = '';
    } else {
      resBtn.innerHTML = unit.isReserve
        ? `<button onclick="_withdrawReserve('${unit.id}')">⚔ В бой!</button>`
        : `<button onclick="_sendReserve('${unit.id}')">🛡 В резерв</button>`;
    }
  }

  // Этап 13: кнопка засады для командира с навыком cunning
  const ambushBtn = document.getElementById('tup-ambush-btn');
  if (ambushBtn) {
    if (unit.isCommander && unit.strength > 0 &&
        unit.commander?.skills?.includes('cunning')) {
      if (bs.ambushUsed) {
        ambushBtn.innerHTML = '<span style="color:#888;font-size:11px">(Засада использована)</span>';
      } else {
        ambushBtn.innerHTML =
          '<button onclick="_triggerAmbush()" style="width:100%;margin-top:6px;padding:4px;' +
          'background:#1a1a1a;border:1px solid #8a5a00;color:#ffaa00;' +
          'border-radius:2px;cursor:pointer;font-size:11px">🎯 Засада</button>';
      }
    } else {
      ambushBtn.innerHTML = '';
    }
  }
}

// ── Этап 13: засада командира ─────────────────────────

function _triggerAmbush() {
  if (!_battleState || _battleState.ambushUsed) return;
  const cmd = _battleState.playerUnits.find(u => u.isCommander && u.strength > 0);
  if (!cmd || !cmd.commander?.skills?.includes('cunning')) return;

  _battleState.ambushUsed = true;
  const r        = 3;
  const affected = _battleState.enemyUnits.filter(u =>
    u.strength > 0 &&
    Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= r
  );
  for (const u of affected) {
    u.morale = Math.max(0, u.morale - 20);
  }
  addLog(_battleState, `🎯 Засада! Враги в радиусе ${r} клеток деморализованы (-20 мораль)`);

  const ambushBtn = document.getElementById('tup-ambush-btn');
  if (ambushBtn) ambushBtn.innerHTML = '<span style="color:#888;font-size:11px">(Засада использована)</span>';

  redrawAll(_ctx, _battleState);
}

function _setFormation(unitId, formation) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (unit) {
    unit.formation = formation;
    updateUnitPanel(unit, _battleState);
    redrawAll(_ctx, _battleState);
  }
}

// ── Этап 15: резерв — полная реализация ───────────────

function _sendReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (!unit || unit.isCommander) return;

  // Найти свободную клетку в резервной зоне (колонки 0–2)
  for (let x = 0; x < RESERVE_ZONE_COLS; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, _battleState)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = true;
        addLog(_battleState, `🛡 ${unit.type} отведён в резерв`);
        updateUnitPanel(unit, _battleState);
        redrawAll(_ctx, _battleState);
        return;
      }
    }
  }
  addLog(_battleState, `⚠️ Нет места в резерве`);
  redrawAll(_ctx, _battleState);
}

function _withdrawReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (!unit) return;

  // Найти свободную клетку на линии фронта (колонки 4–8)
  for (let x = RESERVE_ZONE_COLS + 1; x <= 8; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, _battleState)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = false;
        addLog(_battleState, `⚔ ${unit.type} введён в бой!`);
        updateUnitPanel(unit, _battleState);
        redrawAll(_ctx, _battleState);
        return;
      }
    }
  }
}

// ── Этап 17: диалог отступления ──────────────────────

function showRetreatConfirm(bs) {
  const pct           = calcRetreatSurvival(bs);
  const totalStrength = bs.playerUnits.reduce((s, u) => s + u.strength, 0);
  const survivors     = Math.floor(totalStrength * pct);

  const msg = document.createElement('div');
  msg.id = 'retreat-confirm';
  msg.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);
    z-index:9500;display:flex;align-items:center;justify-content:center;`;
  msg.innerHTML = `
    <div style="background:#141414;border:1px solid #555;border-radius:4px;
                padding:24px 32px;text-align:center;color:#ddd;min-width:280px;">
      <h3 style="margin:0 0 12px;color:#ee8888">Отступление</h3>
      <p>Спасётся примерно <b>${survivors.toLocaleString()}</b> солдат (${Math.round(pct * 100)}%)</p>
      <p style="color:#aaa;font-size:12px">
        ${pct < 0.2 ? '⚠️ Полное окружение' :
          pct < 0.4 ? '⚠️ Частичное окружение' : ''}
      </p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
        <button onclick="document.getElementById('retreat-confirm').remove();
                         executeRetreat(_battleState)"
          style="padding:8px 20px;background:#3a1a1a;border:1px solid #aa4444;
                 color:#ee8888;border-radius:3px;cursor:pointer">Отступить</button>
        <button onclick="document.getElementById('retreat-confirm').remove()"
          style="padding:8px 20px;background:#1a1a1a;border:1px solid #444;
                 color:#ccc;border-radius:3px;cursor:pointer">Продолжать бой</button>
      </div>
    </div>`;
  document.body.appendChild(msg);
}

// ── Этап 19: завершение боя с финализацией ────────────

function endTacticalBattle(bs, outcome) {
  // Г7: остановить rAF-цикл
  _stopRenderLoop();
  const overlay = document.getElementById('tactical-overlay');

  // B3: сначала fade-out (убираем faded-in → CSS переход opacity 0),
  //     потом через 360ms полностью скрываем оверлей
  function _finalize() {
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.classList.remove('faded-in');
      const canvas = document.getElementById('tactical-canvas');
      if (canvas) {
        canvas.removeEventListener('click',     onTacticalClick);
        canvas.removeEventListener('mousemove', onTacticalHover);
      }
    }
    _bgOffscreen = null;
    const result = finalizeTacticalBattle(bs, outcome);
    if (typeof showBattleResult === 'function') showBattleResult(result);
    if (typeof window !== 'undefined' && typeof window._onTacticalBattleEnd === 'function') {
      window._onTacticalBattleEnd(result);
    }
  }

  if (overlay && overlay.classList.contains('faded-in')) {
    overlay.classList.remove('faded-in'); // запускает CSS fade-out 0.35s
    setTimeout(_finalize, 370);
  } else {
    _finalize();
  }
}

// ── A1: система частиц при ударе ─────────────────────
function emitHitParticles(gridX, gridY, isMelee) {
  const cx  = gridX * CELL_SIZE + CELL_SIZE / 2;
  const cy  = gridY * CELL_SIZE + CELL_SIZE / 2;
  const n   = isMelee ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.2;
    // Переиспользуем слот в пуле (не даём расти бесконечно)
    if (_particles.length < 200) {
      _particles.push({
        x:       cx + (Math.random() - 0.5) * 8,
        y:       cy + (Math.random() - 0.5) * 8,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed - 1.0,
        life:    1.0,
        decay:   0.03 + Math.random() * 0.04,
        r:       1.5 + Math.random() * 2,
        color:   isMelee ? '#ffaa40' : '#60aaff',
      });
    }
  }
}

function _updateParticles() {
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.08;   // гравитация
    p.life -= p.decay;
    if (p.life <= 0) _particles.splice(i, 1);
  }
}

function _drawParticles(ctx) {
  if (!_particles.length) return;
  ctx.save();
  for (const p of _particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

// ── A5: анимация атаки — юнит "прыгает" к цели и назад ──
function startAttackAnim(attacker, defender) {
  if (!attacker || !defender) return;
  _attackAnims.set(attacker.id, {
    fromX: attacker.gridX,
    fromY: attacker.gridY,
    toX:   defender.gridX,
    toY:   defender.gridY,
    t:     0,       // 0..1..0 (туда и обратно)
    dir:   1,       // 1 = вперёд, -1 = назад
  });
}

function _updateAttackAnims() {
  for (const [id, a] of _attackAnims) {
    a.t += 0.12 * a.dir;
    if (a.t >= 1) { a.t = 1; a.dir = -1; }
    if (a.t <= 0 && a.dir === -1) _attackAnims.delete(id);
  }
}

// ── C2: линия прицела выбранного юнита к врагу ───────
function drawAimLine(ctx, selected, enemy) {
  if (!selected || !enemy) return;
  const sx = selected.gridX * CELL_SIZE + CELL_SIZE / 2;
  const sy = selected.gridY * CELL_SIZE + CELL_SIZE / 2;
  const ex = enemy.gridX   * CELL_SIZE + CELL_SIZE / 2;
  const ey = enemy.gridY   * CELL_SIZE + CELL_SIZE / 2;

  // Пунктирная красная линия
  ctx.save();
  ctx.strokeStyle = 'rgba(255,60,60,0.75)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -(Date.now() / 50 % 9); // бегущий пунктир
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  // Прицел на враге: крестик
  ctx.strokeStyle = 'rgba(255,80,80,0.9)';
  ctx.lineWidth   = 1.5;
  const cs = 5;
  ctx.beginPath();
  ctx.moveTo(ex - cs, ey - cs); ctx.lineTo(ex + cs, ey + cs);
  ctx.moveTo(ex + cs, ey - cs); ctx.lineTo(ex - cs, ey + cs);
  ctx.stroke();
  ctx.restore();
}

// ── C1: плавающие числа урона ─────────────────────────
function emitDamageNumber(gridX, gridY, value, isEnemy) {
  if (!value || value <= 0) return;
  _floatNums.push({
    x:     gridX * CELL_SIZE + CELL_SIZE / 2,
    y:     gridY * CELL_SIZE + CELL_SIZE / 4,
    val:   value,
    alpha: 1.0,
    vy:    -0.9,           // скорость подъёма px/frame
    color: isEnemy ? '#ff6060' : '#60b0ff',
  });
  // Не более 30 активных чисел
  if (_floatNums.length > 30) _floatNums.shift();
}

function _drawFloatNums(ctx) {
  if (!_floatNums.length) return;
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  for (const fn of _floatNums) {
    if (fn.alpha <= 0) continue;
    ctx.font        = 'bold 13px Cinzel,Georgia,serif';
    ctx.globalAlpha = fn.alpha;
    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.strokeText(`-${fn.val}`, fn.x, fn.y);
    ctx.fillStyle   = fn.color;
    ctx.fillText(`-${fn.val}`, fn.x, fn.y);
  }
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

function _updateFloatNums() {
  for (const fn of _floatNums) {
    fn.y     += fn.vy;
    fn.alpha -= 0.018;      // угасание за ~55 кадров (~0.9 сек)
  }
  // Удалить угасшие
  _floatNums = _floatNums.filter(fn => fn.alpha > 0);
}

// ── Г7: rAF-цикл для плавной анимации ────────────────
function _startRenderLoop() {
  if (typeof requestAnimationFrame === 'undefined') return;
  if (_rafId !== null) return;
  function loop() {
    if (!_battleState || !_ctx || !_canvas) { _rafId = null; return; }
    const W = TACTICAL_GRID_COLS * CELL_SIZE;
    const H = TACTICAL_GRID_ROWS * CELL_SIZE;
    _ctx.clearRect(0, 0, W, H);
    redrawAll(_ctx, _battleState);
    _rafId = requestAnimationFrame(loop);
  }
  _rafId = requestAnimationFrame(loop);
}

function _stopRenderLoop() {
  if (_rafId !== null) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

function openTacticalMap(atkArmy, defArmy, region) {
  const overlay = document.getElementById('tactical-overlay');
  const canvas  = document.getElementById('tactical-canvas');
  overlay.classList.add('visible');
  // A3: плавное появление — добавить класс после одного кадра
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('faded-in')));

  // Г6: сбросить кэш фона при новом бою
  _bgOffscreen = null;

  // ── Г1: HiDPI / Retina — физический размер × dpr, логический через CSS ──
  _dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const logW = TACTICAL_GRID_COLS * CELL_SIZE;
  const logH = TACTICAL_GRID_ROWS * CELL_SIZE;
  canvas.width  = logW * _dpr;
  canvas.height = logH * _dpr;
  canvas.style.width  = logW + 'px';
  canvas.style.height = logH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(_dpr, _dpr);

  // ── Этап 6: сохранить глобальные ссылки ─────────────
  // Убрать старые слушатели если канвас переиспользуется
  if (_canvas) {
    _canvas.removeEventListener('click',     onTacticalClick);
    _canvas.removeEventListener('mousemove', onTacticalHover);
  }
  _canvas      = canvas;
  _ctx         = ctx;
  _battleState = initTacticalBattle(atkArmy || {}, defArmy || {}, region || {});

  _canvas.addEventListener('click',     onTacticalClick);
  _canvas.addEventListener('mousemove', onTacticalHover);

  // ── Этап 8: привязать кнопки управления боем ─────────
  const btnNext = document.getElementById('tac-btn-next');
  if (btnNext) {
    btnNext.onclick = () => {
      if (_battleState?.phase === 'battle') tacticalTick(_battleState);
    };
  }

  // ── Этап 17: привязать кнопку отступления ────────────
  const btnRetreat = document.getElementById('tac-btn-retreat');
  if (btnRetreat) {
    btnRetreat.onclick = () => {
      if (_battleState?.phase === 'battle') showRetreatConfirm(_battleState);
    };
  }

  // Г7: запустить rAF-цикл анимации
  _stopRenderLoop();
  _startRenderLoop();

  document.getElementById('tac-terrain').textContent =
    region?.name ?? 'Неизвестная местность';
}
