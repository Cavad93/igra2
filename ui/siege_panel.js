// ══════════════════════════════════════════════════════════════════════
// SIEGE PANEL — красивый UI для механики осад
//
// Показывает: прогресс-кольцо, бары гарнизона/морали/снабжения,
//             анимацию катапульты, кнопку ШТУРМ с пульсацией.
// ══════════════════════════════════════════════════════════════════════

let _activeSiegeId   = null;
let _siegePanelTimer = null;

// ── Открыть панель осады ──────────────────────────────────────────────

function showSiegePanel(siegeId) {
  const siege = (GAME_STATE.sieges ?? []).find(s => s.id === siegeId);
  if (!siege || siege.status !== 'active') return;

  _activeSiegeId = siegeId;
  _renderSiegePanel(siege);

  const panel = document.getElementById('siege-panel');
  if (panel) {
    panel.style.display = 'flex';
    panel.classList.remove('siege-panel--hidden');
    panel.classList.add('siege-panel--visible');
  }

  // Запускаем анимацию катапульты
  _startCatapultAnim();
}

function closeSiegePanel() {
  _activeSiegeId = null;
  const panel = document.getElementById('siege-panel');
  if (panel) {
    panel.classList.remove('siege-panel--visible');
    panel.classList.add('siege-panel--hidden');
    setTimeout(() => { if (panel.classList.contains('siege-panel--hidden')) panel.style.display = 'none'; }, 350);
  }
  _stopCatapultAnim();
}

// Вызывается после каждого хода если панель открыта
function refreshSiegePanel() {
  if (!_activeSiegeId) return;
  const siege = (GAME_STATE.sieges ?? []).find(s => s.id === _activeSiegeId);
  if (!siege || siege.status !== 'active') {
    closeSiegePanel();
    return;
  }
  _renderSiegePanel(siege);
}

// ── Рендер содержимого панели ─────────────────────────────────────────

function _renderSiegePanel(siege) {
  // Прогресс-кольцо (SVG)
  const RING_R   = 44;
  const RING_C   = 2 * Math.PI * RING_R;
  const progress = Math.min(100, siege.progress ?? 0);
  const offset   = RING_C * (1 - progress / 100);

  const fortIcon = ['🏚','🏠','🏯','🏰','🗼','⚔️'][siege.fortress_level ?? 1] ?? '🏰';

  // Цвет кольца: зелёный → жёлтый → красный
  const ringColor = progress < 40 ? '#4caf50' : progress < 75 ? '#ff9800' : '#f44336';

  // Уровень крепости (сегменты)
  const lvlDots = Array.from({ length: 5 }, (_, i) =>
    `<span class="sp-fort-dot ${i < (siege.fortress_level ?? 1) ? 'sp-fort-dot--active' : ''}"></span>`
  ).join('');

  // Бар гарнизона
  const garMax  = siege.garrison_max ?? Math.max(siege.garrison ?? 0, 500);
  const garPct  = Math.round(Math.min(100, ((siege.garrison ?? 0) / garMax) * 100));
  const morPct  = siege.garrison_morale ?? 0;
  const supPct  = siege.garrison_supply ?? 0;

  const supWarn = supPct <= 0 ? '<span class="sp-warn">💀 Голод!</span>' :
                  supPct <= 25 ? '<span class="sp-warn">⚠️ Критически мало снабжения</span>' : '';

  // Армии осаждающих
  const armies = (GAME_STATE.armies ?? []).filter(
    a => (siege.attacker_army_ids ?? []).includes(a.id) && a.state !== 'disbanded'
  );
  const totalTroops = armies.reduce((s, a) => {
    const u = a.units ?? {};
    return s + (u.infantry ?? 0) + (u.cavalry ?? 0) + (u.mercenaries ?? 0) + (u.artillery ?? 0);
  }, 0);
  const totalArtil  = armies.reduce((s, a) => s + (a.units?.artillery ?? 0), 0);

  const stormPossible = siege.storm_possible;
  const isPlayer = siege.attacker_nation === GAME_STATE.player_nation;
  const playerArmy = isPlayer ? armies[0] : null;

  // Нации
  const attNation = GAME_STATE.nations?.[siege.attacker_nation];
  const defNation = GAME_STATE.nations?.[siege.defender_nation];
  const attName   = attNation?.name ?? siege.attacker_nation;
  const defName   = defNation?.name ?? siege.defender_nation;

  // Оценка длительности
  let etaStr = '?';
  if (playerArmy && typeof estimateSiegeDuration === 'function') {
    const eta = estimateSiegeDuration(playerArmy.id, siege.region_id);
    etaStr = eta !== null && eta > 0 ? `~${eta} ход.` : 'скоро';
  }

  document.getElementById('sp-region-name').textContent  = siege.region_name ?? siege.region_id;
  document.getElementById('sp-att-name').textContent     = attName;
  document.getElementById('sp-def-name').textContent     = defName;
  document.getElementById('sp-fort-level').innerHTML     = lvlDots;
  document.getElementById('sp-turns').textContent        = siege.turns_elapsed ?? 0;
  document.getElementById('sp-eta').textContent          = etaStr;
  document.getElementById('sp-troops').textContent       = totalTroops.toLocaleString();
  document.getElementById('sp-artil').textContent        = totalArtil.toLocaleString();
  document.getElementById('sp-fort-icon').textContent    = fortIcon;
  document.getElementById('sp-supply-warn').innerHTML    = supWarn;

  // SVG кольцо прогресса
  const ringEl = document.getElementById('sp-ring');
  if (ringEl) {
    ringEl.style.strokeDashoffset = offset;
    ringEl.style.stroke = ringColor;
  }
  const ringPctEl = document.getElementById('sp-ring-pct');
  if (ringPctEl) ringPctEl.textContent = Math.round(progress) + '%';

  // Бары
  _setBar('sp-gar-bar',  garPct,  '#e53935', '#333');
  _setBar('sp-mor-bar',  morPct,  '#7b1fa2', '#333');
  _setBar('sp-sup-bar',  supPct,  '#1565c0', '#333');
  document.getElementById('sp-gar-val').textContent = `${siege.garrison ?? 0} / ${garMax}`;
  document.getElementById('sp-mor-val').textContent = morPct + '%';
  document.getElementById('sp-sup-val').textContent = supPct + '%';

  // Кнопка штурма
  const stormBtn = document.getElementById('sp-storm-btn');
  if (stormBtn) {
    if (!isPlayer) {
      stormBtn.style.display = 'none';
    } else {
      stormBtn.style.display = '';
      stormBtn.disabled      = !stormPossible;
      stormBtn.classList.toggle('sp-storm-btn--pulse', stormPossible);
    }
  }

  // Пламя на крепости при голоде
  const flameEl = document.getElementById('sp-fort-flame');
  if (flameEl) flameEl.style.display = supPct <= 0 ? '' : 'none';

  // Если стены почти взяты — трясём крепость
  const fortIconEl = document.getElementById('sp-fort-icon');
  if (fortIconEl) {
    fortIconEl.classList.toggle('sp-shake', progress >= 80);
  }
}

function _setBar(id, pct, fillColor, bgColor) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.setProperty('--bar-pct',   pct + '%');
  el.style.setProperty('--bar-color', fillColor);
}

// ── Кнопка ШТУРМ ─────────────────────────────────────────────────────

function siegePanelStorm() {
  if (!_activeSiegeId) return;
  const siege = (GAME_STATE.sieges ?? []).find(s => s.id === _activeSiegeId);
  if (!siege) return;
  const army = (GAME_STATE.armies ?? []).find(
    a => (siege.attacker_army_ids ?? []).includes(a.id) && a.nation === GAME_STATE.player_nation
  );
  if (!army) return;

  // Анимация штурма — трясём крепость сильно
  const fortIconEl = document.getElementById('sp-fort-icon');
  if (fortIconEl) {
    fortIconEl.classList.add('sp-storm-shake');
    setTimeout(() => fortIconEl.classList.remove('sp-storm-shake'), 900);
  }

  // Запускаем снаряд
  _fireSiegeProjectile();

  const result = stormAssault(army.id, _activeSiegeId);
  if (!result) return;

  setTimeout(() => {
    refreshSiegePanel();
    if (typeof renderAllArmies === 'function') renderAllArmies();
  }, 400);
}

// ── Анимация катапульты ───────────────────────────────────────────────

let _catapultInterval = null;

function _startCatapultAnim() {
  _stopCatapultAnim();
  // Запускаем снаряд каждые 4 секунды если осада идёт
  _catapultInterval = setInterval(() => {
    if (!_activeSiegeId) { _stopCatapultAnim(); return; }
    _fireSiegeProjectile();
  }, 4000);
}

function _stopCatapultAnim() {
  if (_catapultInterval) { clearInterval(_catapultInterval); _catapultInterval = null; }
}

function _fireSiegeProjectile() {
  const container = document.getElementById('sp-anim-field');
  if (!container) return;

  // Удаляем старые снаряды
  container.querySelectorAll('.sp-projectile').forEach(el => el.remove());

  const proj = document.createElement('div');
  proj.className = 'sp-projectile';
  proj.textContent = '🪨';
  container.appendChild(proj);

  // Анимируем по дуге через CSS animation
  proj.style.animation = 'sp-fly 0.8s cubic-bezier(.17,.67,.83,.67) forwards';
  setTimeout(() => proj.remove(), 850);
}

// ── Кнопка снятия осады ───────────────────────────────────────────────

function siegePanelLift() {
  if (!_activeSiegeId) return;
  const siege = (GAME_STATE.sieges ?? []).find(s => s.id === _activeSiegeId);
  if (!siege) return;
  const army = (GAME_STATE.armies ?? []).find(
    a => (siege.attacker_army_ids ?? []).includes(a.id) && a.nation === GAME_STATE.player_nation
  );
  if (!army) return;
  if (typeof liftSiege === 'function') liftSiege(army.id);
  closeSiegePanel();
  if (typeof renderAllArmies === 'function') renderAllArmies();
}
