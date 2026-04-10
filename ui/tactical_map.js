// ══════════════════════════════════════════════════════
// Тактическая карта боя — Canvas UI
// Этап 2: renderGrid + инициализация Canvas
// Этап 4: renderUnit + redrawAll
// Этап 5: сетка иконок солдат + полоски силы/морали
// Этап 6: управление мышью — выбор и перемещение юнитов
// Этап 7: панель выбранного юнита и кнопки формаций
// Этап 8: endTacticalBattle + привязка кнопки "Следующий ход"
// ══════════════════════════════════════════════════════

// ── Этап 6: глобальные ссылки ────────────────────────
let _battleState = null;
let _canvas      = null;
let _ctx         = null;

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
  const gridX = Math.floor((e.clientX - rect.left)  / CELL_SIZE);
  const gridY = Math.floor((e.clientY - rect.top)   / CELL_SIZE);
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
    const dist = Math.abs(gridX - selected.gridX) + Math.abs(gridY - selected.gridY);
    if (dist <= selected.moveSpeed && isCellFree(gridX, gridY, _battleState)) {
      selected.gridX = gridX;
      selected.gridY = gridY;
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
  const gridX = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const gridY = Math.floor((e.clientY - rect.top)  / CELL_SIZE);
  const unit  = findUnitAt(gridX, gridY, _battleState);
  const key   = `${gridX},${gridY}`;
  const isElev = _battleState.elevatedCells.has(key);
  const tip   = document.getElementById('tac-tooltip');
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

  // Кнопка резерва
  const resBtn = document.getElementById('tup-reserve-btn');
  if (resBtn) {
    resBtn.innerHTML = unit.isReserve
      ? `<button onclick="_withdrawReserve('${unit.id}')">⚔ В бой!</button>`
      : `<button onclick="_sendReserve('${unit.id}')">🛡 В резерв</button>`;
  }
}

function _setFormation(unitId, formation) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (unit) {
    unit.formation = formation;
    updateUnitPanel(unit, _battleState);
    redrawAll(_ctx, _battleState);
  }
}

function _sendReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (unit) {
    unit.isReserve = true;
    updateUnitPanel(unit, _battleState);
    redrawAll(_ctx, _battleState);
  }
}

function _withdrawReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (unit) {
    unit.isReserve = false;
    updateUnitPanel(unit, _battleState);
    redrawAll(_ctx, _battleState);
  }
}

// ── Этап 8: завершение боя ────────────────────────────

function endTacticalBattle(bs, outcome) {
  // TODO: Этапы 10+ — интеграция с основным игровым потоком
  const msg = outcome === 'player_wins' ? '🏆 Победа!' : '💀 Поражение!';
  console.log('[tactical] Бой завершён:', outcome);
  const overlay = document.getElementById('tactical-overlay');
  if (overlay) {
    setTimeout(() => overlay.classList.remove('visible'), 2500);
  }
}

function openTacticalMap(atkArmy, defArmy, region) {
  const overlay = document.getElementById('tactical-overlay');
  const canvas  = document.getElementById('tactical-canvas');
  overlay.classList.add('visible');
  canvas.width  = TACTICAL_GRID_COLS * CELL_SIZE;
  canvas.height = TACTICAL_GRID_ROWS * CELL_SIZE;
  const ctx = canvas.getContext('2d');

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

  redrawAll(_ctx, _battleState);

  document.getElementById('tac-terrain').textContent =
    region?.name ?? 'Неизвестная местность';
}
