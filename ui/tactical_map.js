// ══════════════════════════════════════════════════════════════════════
// tactical_map.js — оркестратор тактического боя.
//
// Весь рендер живёт в ui/battle_pixi_render.js; здесь — только
// подключение оверлея, цикл rAF, обработчики мыши на Pixi-стейдже,
// панель выбранного юнита, боевой лог, мини-карта и конец боя.
//
// Старый Canvas 2D рендерер удалён (миграция по arma.md завершена).
// Публичный API (через _reg в boot.js → window.*) сохранён в полном
// объёме, чтобы engine/tactical_battle.js и другие места не ломались:
//   window.redrawAll, .emitDamageNumber, .emitHitParticles,
//   .startAttackAnim, .findUnitAt, .addLog, .endTacticalBattle,
//   .executeRetreat, .tacticalTick (уже из engine), .openTacticalMap,
//   ._setFormation, ._sendReserve, ._withdrawReserve, ._triggerAmbush,
//   ._confirmRetreat, ._cancelRetreat.
// ══════════════════════════════════════════════════════════════════════

import {
  TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS, CELL_SIZE, RESERVE_ZONE_COLS,
  initTacticalBattle, tacticalTick, executeRetreat,
  calcRetreatSurvival, finalizeTacticalBattle
} from '../engine/tactical_battle.js';

import {
  renderPixiAll, clearPixiTerrainCache,
  updatePixiFloatNums, updatePixiParticles, updatePixiAttackAnims,
  BP_W, BP_H
} from './battle_pixi_render.js';

// ── Глобальные ссылки ────────────────────────────────────────────────
let _battleState = null;
let _rafId        = null;
let _hoverEnemy   = null; // враг под курсором — для линии прицела
let _battleMap    = null; // handle из initBattleMap() — доступ к app, layers, canvas

// FX-состояния, обновляются в rAF-цикле, рендерятся в renderPixiAll.
let _floatNums     = []; // плавающие числа урона
const _particles   = []; // частицы удара
const _attackAnims = new Map(); // id → { fromX, fromY, toX, toY, t, dir }

// Совместимость со старым кодом, который обращался к window._ctx —
// теперь это просто заглушка (никто не читает оттуда в рантайме).
if (typeof window !== 'undefined') window._ctx = null;

// ── Вспомогательные функции логики (поиск, выбор) ────────────────────

function findUnitAt(gridX, gridY, bs) {
  if (!bs) return null;
  const all = [...bs.playerUnits, ...bs.enemyUnits];
  return all.find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) || null;
}

function getSelectedUnit(bs) {
  if (!bs || bs.selectedUnitId == null) return null;
  const all = [...bs.playerUnits, ...bs.enemyUnits];
  return all.find(u => u.id === bs.selectedUnitId) || null;
}

function isCellFree(gridX, gridY, bs) {
  return !findUnitAt(gridX, gridY, bs);
}

function selectUnit(unit, bs) {
  [...bs.playerUnits, ...bs.enemyUnits].forEach(u => { u.selected = false; });
  if (unit) { unit.selected = true; bs.selectedUnitId = unit.id; }
  else       { bs.selectedUnitId = null; }
  updateUnitPanel(unit, bs);
}

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
  const el = document.getElementById('tactical-log');
  if (el) {
    el.innerHTML = bs.log.slice(0, 6)
      .map(e => `<div class="tac-log-entry">${e.text}</div>`).join('');
  }
}

// ── rAF-цикл: анимации + Pixi-перерендер ─────────────────────────────

function _startRenderLoop() {
  if (typeof requestAnimationFrame === 'undefined') return;
  if (_rafId !== null) return;
  function loop() {
    if (!_battleState || !_battleMap || !_battleMap.layers) {
      _rafId = null; return;
    }
    // FX: двигаем плавающие числа, частицы, атак-анимации.
    updatePixiFloatNums(_floatNums, 1);
    updatePixiParticles(_particles, 1);
    updatePixiAttackAnims(_attackAnims, 1);

    redrawAll(null, _battleState);
    renderMinimap(_battleState);
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

// ── Ядро рендера — делегирует в Pixi ─────────────────────────────────

function redrawAll(_ignoredCtx, battleState) {
  if (!battleState || !_battleMap || !_battleMap.layers) return;
  const sel = getSelectedUnit(battleState);
  renderPixiAll(_battleMap.layers, battleState, {
    findUnitAtFn: findUnitAt,
    selectedUnit: sel,
    hoverEnemy:   _hoverEnemy,
    attackAnims:  _attackAnims,
    floatNums:    _floatNums,
    particles:    _particles,
    nowMs:        Date.now()
  });
}

// ── Обработчики мыши на Pixi stage ───────────────────────────────────

function _screenToGrid(e, pixiCanvas) {
  const rect = pixiCanvas.getBoundingClientRect();
  const scaleX = BP_W / rect.width;
  const scaleY = BP_H / rect.height;
  const gridX  = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
  const gridY  = Math.floor((e.clientY - rect.top)  * scaleY / CELL_SIZE);
  return { gridX, gridY };
}

function _onPixiPointerDown(e) {
  if (!_battleState || !_battleMap || !_battleMap.app) return;
  const canvas = _battleMap.app.canvas;
  if (!canvas) return;
  const { gridX, gridY } = _screenToGrid(e, canvas);
  if (gridX < 0 || gridX >= TACTICAL_GRID_COLS) return;
  if (gridY < 0 || gridY >= TACTICAL_GRID_ROWS) return;

  const clicked  = findUnitAt(gridX, gridY, _battleState);
  const selected = getSelectedUnit(_battleState);

  if (!selected) {
    if (clicked?.side === 'player') selectUnit(clicked, _battleState);
  } else if (clicked?.side === 'player') {
    selectUnit(clicked, _battleState);
  } else if (!clicked) {
    // Перемещение.
    const cavOnElev = selected.type === 'cavalry' &&
      _battleState.elevatedCells.has(`${selected.gridX},${selected.gridY}`);
    const effectiveMoveSpeed = cavOnElev
      ? Math.max(1, selected.moveSpeed - 1)
      : selected.moveSpeed;
    const dist = Math.abs(gridX - selected.gridX) + Math.abs(gridY - selected.gridY);
    if (dist <= effectiveMoveSpeed && isCellFree(gridX, gridY, _battleState)) {
      selected.gridX = gridX;
      selected.gridY = gridY;
      selected._movedThisTick = true;
      addLog(_battleState, `Юнит перемещён на (${gridX},${gridY})`);
    }
  } else if (clicked?.side === 'enemy') {
    addLog(_battleState, `Цель выбрана — атака при следующем ходе`);
  }

  redrawAll(null, _battleState);
}

function _onPixiPointerMove(e) {
  if (!_battleState || !_battleMap || !_battleMap.app) return;
  const canvas = _battleMap.app.canvas;
  if (!canvas) return;
  const { gridX, gridY } = _screenToGrid(e, canvas);
  const unit   = findUnitAt(gridX, gridY, _battleState);
  const isElev = _battleState.elevatedCells.has(`${gridX},${gridY}`);
  const tip    = document.getElementById('tac-tooltip');

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

function _onPixiPointerLeave() {
  const tip = document.getElementById('tac-tooltip');
  if (tip) tip.style.display = 'none';
  _hoverEnemy = null;
}

// ── Панель выбранного юнита — HTML-виджет, feed'ится из Pixi selection ──

const FORMATION_LABELS = {
  standard:   'Строй',
  aggressive: 'Атака',
  defensive:  'Оборона',
  flanking:   'Охват',
  siege:      'Осада'
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
    (unit.isCommander ? '★ Командир' : FORMATION_LABELS[unit.type] ?? unit.type) +
    ` (${unit.side === 'player' ? 'Свои' : 'Враги'})`;

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

  const fbtns = document.getElementById('tup-formation-btns');
  if (fbtns) {
    fbtns.innerHTML = Object.entries(FORMATION_LABELS)
      .map(([f, label]) =>
        `<button class="tup-form-btn${unit.formation === f ? ' active' : ''}"
         data-action="_setFormation" data-arg="${unit.id}|${f}">${label}</button>`)
      .join('');
  }

  const resBtn = document.getElementById('tup-reserve-btn');
  if (resBtn) {
    if (unit.isCommander) {
      resBtn.innerHTML = '';
    } else {
      resBtn.innerHTML = unit.isReserve
        ? `<button data-action="_withdrawReserve" data-arg="${unit.id}">⚔ В бой!</button>`
        : `<button data-action="_sendReserve" data-arg="${unit.id}">🛡 В резерв</button>`;
    }
  }

  const ambushBtn = document.getElementById('tup-ambush-btn');
  if (ambushBtn) {
    if (unit.isCommander && unit.strength > 0 &&
        unit.commander?.skills?.includes('cunning')) {
      if (bs.ambushUsed) {
        ambushBtn.innerHTML = '<span style="color:#888;font-size:11px">(Засада использована)</span>';
      } else {
        ambushBtn.innerHTML =
          '<button data-action="_triggerAmbush" style="width:100%;margin-top:6px;padding:4px;' +
          'background:#1a1a1a;border:1px solid #8a5a00;color:#ffaa00;' +
          'border-radius:2px;cursor:pointer;font-size:11px">🎯 Засада</button>';
      }
    } else {
      ambushBtn.innerHTML = '';
    }
  }
}

// ── Actions (экспорты, вызываемые через data-action) ─────────────────

export function _triggerAmbush() {
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

  redrawAll(null, _battleState);
}

export function _setFormation(unitId, formation) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (unit) {
    unit.formation = formation;
    updateUnitPanel(unit, _battleState);
    redrawAll(null, _battleState);
  }
}

export function _sendReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (!unit || unit.isCommander) return;
  for (let x = 0; x < RESERVE_ZONE_COLS; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, _battleState)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = true;
        addLog(_battleState, `🛡 ${unit.type} отведён в резерв`);
        updateUnitPanel(unit, _battleState);
        redrawAll(null, _battleState);
        return;
      }
    }
  }
  addLog(_battleState, `⚠️ Нет места в резерве`);
  redrawAll(null, _battleState);
}

export function _withdrawReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (!unit) return;
  for (let x = RESERVE_ZONE_COLS + 1; x <= 8; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, _battleState)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = false;
        addLog(_battleState, `⚔ ${unit.type} введён в бой!`);
        updateUnitPanel(unit, _battleState);
        redrawAll(null, _battleState);
        return;
      }
    }
  }
}

// ── Диалог отступления ───────────────────────────────────────────────

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
        <button data-action="_confirmRetreat"
          style="padding:8px 20px;background:#3a1a1a;border:1px solid #aa4444;
                 color:#ee8888;border-radius:3px;cursor:pointer">Отступить</button>
        <button data-action="_cancelRetreat"
          style="padding:8px 20px;background:#1a1a1a;border:1px solid #444;
                 color:#ccc;border-radius:3px;cursor:pointer">Продолжать бой</button>
      </div>
    </div>`;
  document.body.appendChild(msg);
}

// ── Завершение боя ───────────────────────────────────────────────────

function endTacticalBattle(bs, outcome) {
  _stopRenderLoop();
  const overlay = document.getElementById('tactical-overlay');

  function _finalize() {
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.classList.remove('faded-in');
    }
    // Уничтожить Pixi Battle Map (чтобы следующий бой стартовал чисто).
    try {
      if (typeof window.destroyBattleMap === 'function' &&
          _battleMap && _battleMap.app) {
        window.destroyBattleMap();
      }
    } catch (err) {
      console.warn('[tactical_map] destroyBattleMap failed:', err);
    }
    clearPixiTerrainCache();
    _floatNums  = [];
    _particles.length   = 0;
    _attackAnims.clear();
    _hoverEnemy  = null;
    _battleState = null;
    _battleMap   = null;

    const mm = document.getElementById('tac-minimap');
    if (mm) mm.style.display = 'none';

    const result = finalizeTacticalBattle(bs, outcome);
    if (typeof window.showBattleResult === 'function') window.showBattleResult(result);
    if (typeof window._onTacticalBattleEnd === 'function') window._onTacticalBattleEnd(result);
  }

  if (overlay && overlay.classList.contains('faded-in')) {
    overlay.classList.remove('faded-in');
    setTimeout(_finalize, 370);
  } else {
    _finalize();
  }
}

// ── FX — публичные функции (вызываются из engine/tactical_battle.js) ──

function emitHitParticles(gridX, gridY, isMelee) {
  const cx = gridX * CELL_SIZE + CELL_SIZE / 2;
  const cy = gridY * CELL_SIZE + CELL_SIZE / 2;
  const n  = isMelee ? 12 : 7;
  for (let i = 0; i < n; i++) {
    if (_particles.length >= 200) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.2;
    _particles.push({
      x:     cx + (Math.random() - 0.5) * 8,
      y:     cy + (Math.random() - 0.5) * 8,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed - 1.0,
      life:  1.0,
      decay: 0.03 + Math.random() * 0.04,
      r:     1.5 + Math.random() * 2,
      color: isMelee ? 0xffaa40 : 0x60aaff
    });
  }
}

function emitDamageNumber(gridX, gridY, value, isEnemy) {
  if (!value || value <= 0) return;
  _floatNums.push({
    x:     gridX * CELL_SIZE + CELL_SIZE / 2,
    y:     gridY * CELL_SIZE + CELL_SIZE / 4,
    val:   value,
    alpha: 1.0,
    vy:    -0.9,
    color: isEnemy ? 0xff6060 : 0x60b0ff
  });
  if (_floatNums.length > 30) _floatNums.shift();
}

function startAttackAnim(attacker, defender) {
  if (!attacker || !defender) return;
  _attackAnims.set(attacker.id, {
    fromX: attacker.gridX,
    fromY: attacker.gridY,
    toX:   defender.gridX,
    toY:   defender.gridY,
    t:     0,
    dir:   1
  });
}

// ── Мини-карта — остаётся на своём отдельном canvas (простой pub/sub) ──

function renderMinimap(battleState) {
  const mc = document.getElementById('tac-minimap');
  if (!mc) return;
  mc.style.display = 'block';
  mc.width  = 110;
  mc.height = 80;
  const ctx = mc.getContext('2d');
  const cw  = mc.width  / TACTICAL_GRID_COLS;
  const ch  = mc.height / TACTICAL_GRID_ROWS;

  ctx.clearRect(0, 0, mc.width, mc.height);
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, mc.width, mc.height);

  ctx.fillStyle = 'rgba(200,180,80,0.25)';
  for (const key of battleState.elevatedCells) {
    const [ex, ey] = key.split(',').map(Number);
    ctx.fillRect(ex * cw, ey * ch, cw, ch);
  }

  for (const u of battleState.playerUnits) {
    if (u.strength <= 0) continue;
    ctx.fillStyle = u.isCommander ? '#ffd700' : '#4488dd';
    ctx.beginPath();
    ctx.arc(u.gridX * cw + cw / 2, u.gridY * ch + ch / 2, Math.max(1.5, cw * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const u of battleState.enemyUnits) {
    if (u.strength <= 0) continue;
    ctx.fillStyle = u.isCommander ? '#ffaa00' : '#dd4444';
    ctx.beginPath();
    ctx.arc(u.gridX * cw + cw / 2, u.gridY * ch + ch / 2, Math.max(1.5, cw * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(80,80,80,0.5)';
  ctx.lineWidth   = 0.5;
  ctx.strokeRect(0, 0, mc.width, mc.height);
}

// ── Open / init ──────────────────────────────────────────────────────

export async function openTacticalMap(atkArmy, defArmy, region) {
  const overlay = document.getElementById('tactical-overlay');
  if (!overlay) {
    console.warn('[tactical_map] overlay not found');
    return;
  }
  overlay.classList.add('visible');
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('faded-in')));

  // 1) Инициализировать Pixi Battle Map (размер = логический размер сетки).
  if (typeof window.destroyBattleMap === 'function' &&
      _battleMap && _battleMap.app) {
    try { window.destroyBattleMap(); } catch (_) {}
  }
  clearPixiTerrainCache();

  // initBattleMap — асинхронный из-за Pixi.Application.init().
  // В boot.js window.initBattleMap возвращает Promise, разрешающийся
  // в BattleMap singleton (см. ui/battle_map_pixi.js:initBattleMap).
  try {
    if (typeof window.initBattleMap === 'function') {
      _battleMap = await window.initBattleMap('pixi-battle-map', BP_W, BP_H, {
        backgroundColor: 0x101010,
        antialias:       true
      });
    }
  } catch (err) {
    console.warn('[tactical_map] initBattleMap failed:', err);
    return;
  }
  if (!_battleMap || !_battleMap.app) {
    console.warn('[tactical_map] BattleMap init returned empty handle');
    return;
  }

  // 2) Навесить pointer-обработчики на canvas Pixi-приложения.
  const canvas = _battleMap && _battleMap.app && _battleMap.app.canvas;
  if (canvas) {
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('click',      _onPixiPointerDown);
    canvas.addEventListener('mousemove',  _onPixiPointerMove);
    canvas.addEventListener('mouseleave', _onPixiPointerLeave);
  }

  // 3) Создать боевой state (прямой ES-импорт — engine уже доступен).
  _battleState = initTacticalBattle(atkArmy || {}, defArmy || {}, region || {});

  document.getElementById('tac-turn').textContent = `Ход ${_battleState.turn}`;
  const tt = document.getElementById('tac-terrain');
  if (tt) tt.textContent = region?.name ?? 'Неизвестная местность';

  // 4) Кнопки управления.
  const btnNext = document.getElementById('tac-btn-next');
  if (btnNext) {
    btnNext.onclick = () => {
      if (_battleState?.phase === 'battle') tacticalTick(_battleState);
    };
  }
  const btnRetreat = document.getElementById('tac-btn-retreat');
  if (btnRetreat) {
    btnRetreat.onclick = () => {
      if (_battleState?.phase === 'battle') showRetreatConfirm(_battleState);
    };
  }

  // 5) Старт render-цикла.
  _stopRenderLoop();
  _startRenderLoop();
}

export function _confirmRetreat() {
  var el = document.getElementById('retreat-confirm');
  if (el) el.remove();
  if (_battleState) executeRetreat(_battleState);
}

export function _cancelRetreat() {
  var el = document.getElementById('retreat-confirm');
  if (el) el.remove();
}

// Именованные экспорты (boot.js автоматически переносит их на window
// через _reg() — это основной мост для engine/tactical_battle.js,
// который вызывает window.addLog, window.redrawAll и т.п.).
export {
  redrawAll, findUnitAt, addLog, endTacticalBattle,
  emitDamageNumber, emitHitParticles, startAttackAnim,
  renderMinimap, showRetreatConfirm, updateUnitPanel
};
