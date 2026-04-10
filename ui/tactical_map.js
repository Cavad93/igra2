// ══════════════════════════════════════════════════════
// Тактическая карта боя — Canvas UI
// Этап 2: renderGrid + инициализация Canvas
// Этап 4: renderUnit + redrawAll
// Этап 5: сетка иконок солдат + полоски силы/морали
// ══════════════════════════════════════════════════════

const UNIT_MIN_SZ = 26;
const UNIT_MAX_SZ = 52;

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

  // Возвышенные клетки
  ctx.fillStyle = 'rgba(255,255,200,0.08)';
  for (const key of elevatedCells) {
    const [ex, ey] = key.split(',').map(Number);
    ctx.fillRect(ex * CELL_SIZE, ey * CELL_SIZE, CELL_SIZE, CELL_SIZE);
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
  const cellX = unit.gridX * CELL_SIZE;
  const cellY = unit.gridY * CELL_SIZE;

  // Подход 2: размер зависит от силы
  const ratio = Math.min(1, unit.strength / battleState.maxStrengthInBattle);
  const sz = UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
  const px = cellX + (CELL_SIZE - sz) / 2;
  const py = cellY + (CELL_SIZE - sz) / 2;

  // Подход 3: цвет и яркость
  const isPlayer  = unit.side === 'player';
  const strPct    = unit.strength / unit.maxStrength;
  const fillColor = isPlayer ? '#1a4a9e' : '#8b1a1a';
  const borderColor = unit.isCommander     ? '#ffd700'
                    : unit.strength > 5000 ? '#e8c840'
                    : unit.isRouting       ? '#555555'
                    : isPlayer             ? '#4488dd'
                    :                        '#dd5533';

  ctx.globalAlpha = unit.isReserve ? 0.50
                  : unit.isRouting  ? 0.35
                  :                   0.45 + 0.55 * strPct;

  ctx.fillStyle = fillColor;
  ctx.fillRect(px, py, sz, sz);

  ctx.globalAlpha = unit.isRouting ? 0.4 : 1.0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = unit.isCommander ? 2.5 : 1.5;
  if (unit.isReserve) ctx.setLineDash([4, 3]);
  ctx.strokeRect(px, py, sz, sz);
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

  // Число солдат (у нижнего края квадрата)
  ctx.globalAlpha = unit.isRouting ? 0.4 : 1.0;
  ctx.font        = `${Math.max(8, sz * 0.16 | 0)}px monospace`;
  ctx.fillStyle   = '#cccccc';
  ctx.textAlign   = 'center';
  const label = unit.strength >= 1000
    ? (unit.strength / 1000).toFixed(1) + 'k'
    : unit.strength.toString();
  ctx.fillText(label, px + sz / 2, py + sz * 0.94);

  // Подход 4: полоска силы (под квадратом)
  const strPct2  = unit.strength / unit.maxStrength;
  const barColor = strPct2 > 0.6 ? '#44dd44' : strPct2 > 0.3 ? '#ddaa00' : '#dd2222';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle   = '#222222';
  ctx.fillRect(px, py + sz + 3, sz, 4);
  ctx.fillStyle   = barColor;
  ctx.fillRect(px, py + sz + 3, sz * strPct2, 4);

  // Полоска морали (над квадратом, синяя)
  ctx.fillStyle   = '#222222';
  ctx.fillRect(px, py - 6, sz, 3);
  ctx.fillStyle   = '#4488ff';
  ctx.fillRect(px, py - 6, sz * (unit.morale / 100), 3);
  ctx.globalAlpha = 1.0;

  // Иконка типа в центре
  const icon = { infantry: '⚔', cavalry: '🐴', archers: '🏹' }[unit.type] ?? '⚔';
  ctx.globalAlpha = unit.isRouting ? 0.5 : 1.0;
  ctx.font      = `bold ${Math.max(10, sz * 0.28 | 0)}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(icon, px + sz / 2, py + sz / 2 + 5);

  if (unit.isCommander) {
    ctx.font      = `${Math.max(10, sz * 0.28 | 0)}px monospace`;
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText('★', px + sz - 2, py + 12);
  }

  if (unit.selected) {
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(px - 3, py - 3, sz + 6, sz + 6);
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = 1.0;
  ctx.textAlign   = 'left';
}

function redrawAll(ctx, battleState) {
  renderGrid(ctx, battleState.terrain, battleState.elevatedCells);
  for (const u of battleState.playerUnits) renderUnit(ctx, u, battleState);
  for (const u of battleState.enemyUnits)  renderUnit(ctx, u, battleState);
}

function openTacticalMap(atkArmy, defArmy, region) {
  const overlay = document.getElementById('tactical-overlay');
  const canvas  = document.getElementById('tactical-canvas');
  overlay.classList.add('visible');
  canvas.width  = TACTICAL_GRID_COLS * CELL_SIZE;
  canvas.height = TACTICAL_GRID_ROWS * CELL_SIZE;
  const ctx = canvas.getContext('2d');

  const bs = initTacticalBattle(atkArmy || {}, defArmy || {}, region || {});
  redrawAll(ctx, bs);

  document.getElementById('tac-terrain').textContent =
    region?.name ?? 'Неизвестная местность';
}
