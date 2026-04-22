// ui/intelligence_overlay.js — Этап C docs/fog_of_war.md
//
// UI-оверлей «Разведка»:
//   • Список известных наций с фильтрами: свои / сосед / дальние
//   • Для terra incognita — кнопка «Отправить купца» (500 монет, 12+ ходов)
//   • Для known / unknown — кнопка «Отправить шпиона» (2000 монет, 3 хода подготовки)
//   • Секция «Активные миссии» — текущие экспедиции/шпионы
//
// Вызов: window.showIntelligenceOverlay()
// Зависимости: engine/fog_of_war.js (sendMerchantExpedition, sendSpy,
//   getNationKnownLevel, FOG_CONFIG).

let _intelOverlayEl = null;

function _ensureIntelOverlay() {
  if (_intelOverlayEl) return _intelOverlayEl;
  const el = document.createElement('div');
  el.id = 'intelligence-overlay';
  el.className = 'overlay hidden';
  el.innerHTML = `
    <div class="io-dialog">
      <div class="io-header">
        <h2>🗺 Разведка</h2>
        <button class="io-close" data-action="closeIntelligenceOverlay">×</button>
      </div>
      <div class="io-tabs">
        <button class="io-tab active" data-tab="nations">Нации</button>
        <button class="io-tab" data-tab="missions">Активные миссии</button>
        <button class="io-tab" data-tab="rumors">Слухи</button>
      </div>
      <div class="io-body">
        <div class="io-filters">
          <label><input type="checkbox" id="io-filter-unknown" checked/> Terra incognita</label>
          <label><input type="checkbox" id="io-filter-known"   checked/> Известные</label>
          <label><input type="checkbox" id="io-filter-full"    checked/> Полные данные</label>
          <input type="text" id="io-filter-search" placeholder="поиск по имени..." />
        </div>
        <div class="io-list" id="io-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector('.io-close').addEventListener('click', () => closeIntelligenceOverlay());
  el.querySelectorAll('.io-tab').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
  });
  el.querySelectorAll('.io-filters input').forEach(inp => {
    inp.addEventListener('input', () => _renderIntelList());
  });
  el.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-io-action]');
    if (!act) return;
    const action = act.dataset.ioAction;
    const targetId = act.dataset.target;
    if (action === 'send_merchant') _sendMerchant(targetId);
    else if (action === 'send_spy')  _sendSpy(targetId);
  });

  _intelOverlayEl = el;
  return el;
}

let _currentTab = 'nations';

export function showIntelligenceOverlay() {
  const el = _ensureIntelOverlay();
  el.classList.remove('hidden');
  _switchTab(_currentTab);
}

export function closeIntelligenceOverlay() {
  if (_intelOverlayEl) _intelOverlayEl.classList.add('hidden');
}

function _switchTab(tab) {
  _currentTab = tab;
  if (!_intelOverlayEl) return;
  _intelOverlayEl.querySelectorAll('.io-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // фильтры показываем только на вкладке «Нации»
  const filters = _intelOverlayEl.querySelector('.io-filters');
  if (filters) filters.style.display = (tab === 'nations') ? '' : 'none';
  if (tab === 'nations')      _renderIntelList();
  else if (tab === 'missions') _renderMissionsList();
  else if (tab === 'rumors')   _renderRumorsList();
}

// ──────────────────────────────────────────────────────────────
// Вкладка «Нации»
// ──────────────────────────────────────────────────────────────

function _renderIntelList() {
  const list = document.getElementById('io-list');
  if (!list) return;
  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
  if (!gs?.nations) { list.innerHTML = '<em>Нет данных</em>'; return; }

  const playerId = gs.player_nation;
  const showUnknown = document.getElementById('io-filter-unknown')?.checked ?? true;
  const showKnown   = document.getElementById('io-filter-known')?.checked   ?? true;
  const showFull    = document.getElementById('io-filter-full')?.checked    ?? true;
  const search      = (document.getElementById('io-filter-search')?.value || '').toLowerCase().trim();

  const nations = Object.entries(gs.nations)
    .filter(([nId]) => nId !== playerId)
    .filter(([nId, n]) => n?.regions?.length || n?.population?.total);

  const rows = [];
  for (const [nId, n] of nations) {
    const level = (typeof getNationKnownLevel === 'function')
      ? getNationKnownLevel(playerId, nId) : 2;
    if (level === 0 && !showUnknown) continue;
    if (level === 1 && !showKnown)   continue;
    if (level === 2 && !showFull)    continue;

    const name = n.name || nId;
    if (search && !name.toLowerCase().includes(search) && !nId.toLowerCase().includes(search)) continue;

    rows.push({ nId, n, name, level });
  }

  // Сортировка: full → known → unknown, потом по имени.
  rows.sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name));

  if (!rows.length) {
    list.innerHTML = '<em>Ничего не найдено по фильтру.</em>';
    return;
  }

  const treasury = gs.nations[playerId]?.economy?.treasury ?? 0;
  const merchCost = (typeof FOG_CONFIG !== 'undefined') ? FOG_CONFIG.MERCHANT_COST : 500;
  const spyCost   = (typeof FOG_CONFIG !== 'undefined') ? FOG_CONFIG.SPY_COST      : 2000;

  const html = rows.slice(0, 200).map(({ nId, n, name, level }) => {
    const label = level === 0 ? '<span class="io-level lvl0">Terra incognita</span>'
                : level === 1 ? '<span class="io-level lvl1">Известна</span>'
                :               '<span class="io-level lvl2">Полные данные</span>';

    let details = '';
    if (level >= 1) {
      const regionsCount = n.regions?.length ?? 0;
      const pop = n.population?.total ?? 0;
      const popTxt = pop > 1e6 ? (pop / 1e6).toFixed(1) + ' млн'
                   : pop > 1000 ? Math.round(pop / 1000) + ' тыс'
                   :              pop;
      details = `<span class="io-detail">${regionsCount} регионов · ~${popTxt} чел.</span>`;
    }
    if (level >= 2) {
      const treasury = Math.round(n.economy?.treasury ?? 0);
      const army = (n.military?.infantry ?? 0) + (n.military?.cavalry ?? 0)
                 + (n.military?.mercenaries ?? 0);
      details += ` <span class="io-detail">💰${treasury.toLocaleString('ru-RU')} ⚔${army.toLocaleString('ru-RU')}</span>`;
    }

    // Кнопки действий: купец доступен если level < 1, шпион если level < 2.
    const merchBtn = level < 1
      ? `<button class="io-btn" data-io-action="send_merchant" data-target="${nId}" ${treasury < merchCost ? 'disabled' : ''}>🧭 Купец (${merchCost})</button>`
      : '';
    const spyBtn = level < 2
      ? `<button class="io-btn" data-io-action="send_spy" data-target="${nId}" ${treasury < spyCost ? 'disabled' : ''}>🕵 Шпион (${spyCost})</button>`
      : '';

    return `
      <div class="io-row">
        <div class="io-name">${_esc(name)} ${label}</div>
        <div class="io-details">${details}</div>
        <div class="io-actions">${merchBtn}${spyBtn}</div>
      </div>
    `;
  }).join('');

  const truncated = rows.length > 200 ? `<div class="io-truncated">Показано 200 из ${rows.length}. Используйте поиск.</div>` : '';
  list.innerHTML = html + truncated;
}

// ──────────────────────────────────────────────────────────────
// Вкладка «Активные миссии»
// ──────────────────────────────────────────────────────────────

function _renderMissionsList() {
  const list = document.getElementById('io-list');
  if (!list) return;
  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
  const playerId = gs?.player_nation;
  const missions = (gs?.expeditions || []).filter(e => e.observerId === playerId);

  if (!missions.length) {
    list.innerHTML = '<em>Активных миссий нет. Отправьте купца или шпиона во вкладке «Нации».</em>';
    return;
  }

  const html = missions.map(m => {
    const target = gs.nations?.[m.targetId];
    const tName = target?.name || m.targetId;
    const icon  = m.type === 'spy' ? '🕵' : '🧭';
    const statusTxt = m.type === 'merchant'
      ? `В пути: осталось ${m.turns_left ?? 0} ходов`
      : m.status === 'preparing'
        ? `Подготовка: ${m.turns_left ?? 0} ходов до активации`
        : `Активен: ${m.turns_left ?? 0} ходов full intel`;
    return `
      <div class="io-row">
        <div class="io-name">${icon} ${_esc(tName)}</div>
        <div class="io-details">${statusTxt}</div>
      </div>`;
  }).join('');

  list.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────
// Вкладка «Слухи»
// ──────────────────────────────────────────────────────────────

function _renderRumorsList() {
  const list = document.getElementById('io-list');
  if (!list) return;
  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
  const playerId = gs?.player_nation;
  const rumors = (gs?.rumors || []).filter(r => !r.observerId || r.observerId === playerId);

  if (!rumors.length) {
    list.innerHTML = '<em>Слухов пока не слышно. Иностранные купцы и путешественники принесут их со временем.</em>';
    return;
  }

  const html = rumors.slice(-30).reverse().map(r => `
    <div class="io-row io-rumor">
      <div class="io-name">📜 ${_esc(r.subject || '')}</div>
      <div class="io-details">ход ${r.turn}: ${_esc(r.content || '')}</div>
    </div>
  `).join('');
  list.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────────────────────

function _sendMerchant(targetId) {
  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
  const playerId = gs?.player_nation;
  if (!playerId) return;
  const res = (typeof sendMerchantExpedition === 'function')
    ? sendMerchantExpedition(playerId, targetId)
    : { ok: false, reason: 'fog_missing' };
  if (!res.ok) {
    if (typeof addEventLog === 'function') {
      addEventLog(`⚠ Экспедиция не отправлена: ${res.reason}`, 'warning');
    }
    return;
  }
  _renderIntelList();
}

function _sendSpy(targetId) {
  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
  const playerId = gs?.player_nation;
  if (!playerId) return;
  const res = (typeof sendSpy === 'function')
    ? sendSpy(playerId, targetId)
    : { ok: false, reason: 'fog_missing' };
  if (!res.ok) {
    if (typeof addEventLog === 'function') {
      addEventLog(`⚠ Шпион не отправлен: ${res.reason}`, 'warning');
    }
    return;
  }
  _renderIntelList();
}

// ──────────────────────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}
