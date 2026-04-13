// ui/region_compare.js — Шаг 53 (arma.md)
// Режим сравнения регионов: "закрепить" первый регион, кликнуть на второй —
// вместо обычного popup открывается панель сравнения с двумя столбцами,
// где лучшее значение подсвечено зелёным, худшее — тусклее.
//
// Публичный API:
//   - pinRegionForCompare(regionId)            — закрепить/отменить закрепление
//   - closeCompare()                           — закрыть панель, сбросить pin
//   - handleRegionClickForCompare(regionId)    — перехват клика на карте;
//                                                возвращает true, если клик
//                                                обработан (открыта панель)
//   - renderComparePanel(regionA, regionB)     — рендер панели сравнения
//   - getPinnedRegionId()                      — текущий закреплённый regionId
//
// DOM-узел #compare-panel создаётся в index.html и управляется классом .hidden.

(function () {
  'use strict';

  const PANEL_ID = 'compare-panel';

  let _pinnedRegionId = null;

  // ── Набор метрик для сравнения (порядок строк в панели) ──
  // Каждая метрика: ключ, подпись, эмодзи, способ извлечения из region-данных,
  // формат вывода и направление "лучше" (higher=больше лучше, lower=меньше лучше).
  const METRICS = [
    {
      key: 'population',
      label: '👥 Население',
      better: 'higher',
      get: (g) => Math.round(g.population || 0),
      fmt: (v) => v.toLocaleString(),
    },
    {
      key: 'garrison',
      label: '⚔ Гарнизон',
      better: 'higher',
      get: (g) => Math.round(g.garrison || 0),
      fmt: (v) => v.toLocaleString(),
    },
    {
      key: 'fertility',
      label: '🌿 Плодородие',
      better: 'higher',
      get: (g) => Math.round(Math.max(0, Math.min(1, g.fertility || 0)) * 100),
      fmt: (v) => v + '%',
    },
    {
      key: 'wealth',
      label: '💰 Богатство',
      better: 'higher',
      // Богатство региона: оценка дохода = pop * fertility * nationTax * 0.05
      // Если нет tax_rate — используем 0.10 по умолчанию.
      get: (g, nation) => {
        const pop = Math.round(g.population || 0);
        const fert = Math.max(0, Math.min(1, g.fertility || 0));
        const tax = (nation && nation.economy && nation.economy.tax_rate) || 0.10;
        return Math.round(pop * fert * tax * 0.05);
      },
      fmt: (v) => (v >= 0 ? '+' : '') + v.toLocaleString(),
    },
    {
      key: 'buildings_count',
      label: '🏛 Постройки',
      better: 'higher',
      get: (g) => Array.isArray(g.buildings) ? g.buildings.length : 0,
      fmt: (v) => String(v),
    },
  ];

  function _getRegionData(regionId) {
    const game = (typeof GAME_STATE !== 'undefined' && GAME_STATE) || {};
    const regions = game.regions || {};
    const mapRegs = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS) || {};
    const mapData  = mapRegs[regionId];
    const gameData = regions[regionId];
    if (!mapData || !gameData) return null;
    const nations = game.nations || {};
    const nationId = gameData.nation || mapData.nation;
    const nation = nations[nationId] || null;
    return { regionId, mapData, gameData, nation, nationId };
  }

  function _extractValues(regionData) {
    const out = {};
    for (const m of METRICS) {
      try { out[m.key] = m.get(regionData.gameData, regionData.nation); }
      catch (_) { out[m.key] = 0; }
    }
    return out;
  }

  function _ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'hidden';
    panel.innerHTML = `
      <div class="cp-header">
        <span class="cp-title">⚖ Сравнение регионов</span>
        <button type="button" class="cp-reset-btn" id="cp-reset-btn">Сбросить</button>
        <button type="button" class="cp-close-btn" id="cp-close-btn">✕</button>
      </div>
      <div class="cp-body">
        <div class="cp-col" id="cp-left"></div>
        <div class="cp-divider"></div>
        <div class="cp-col" id="cp-right"></div>
      </div>
    `;
    document.body.appendChild(panel);
    const closeBtn = panel.querySelector('#cp-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeCompare);
    const resetBtn = panel.querySelector('#cp-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', closeCompare);
    return panel;
  }

  // ── Вспомогательная рендер-функция для одной ячейки-столбца ──
  function _renderColumn(regionData, valueMap, winnerMap, side) {
    const name  = regionData.mapData.name || regionData.regionId;
    const nat   = regionData.nation;
    const nColor = nat ? nat.color : '#A8A898';
    const nName  = nat ? nat.name  : 'Независимые';

    const rowsHtml = METRICS.map(m => {
      const val = valueMap[m.key];
      const winner = winnerMap[m.key]; // 'left' | 'right' | 'tie'
      const isWinner = winner === side;
      const isLoser  = winner !== 'tie' && winner !== side;
      const arrow = winner === 'tie' ? '='
                 : isWinner ? '↑'
                 : '↓';
      const cls = ['cp-row'];
      if (isWinner) cls.push('cp-winner');
      if (isLoser)  cls.push('cp-loser');
      return `<div class="${cls.join(' ')}" data-key="${m.key}">` +
             `<span class="cp-row-lbl">${m.label}</span>` +
             `<span class="cp-row-val">${m.fmt(val)} <span class="cp-arrow">${arrow}</span></span>` +
             `</div>`;
    }).join('');

    return `<div class="cp-col-header" style="border-bottom-color: ${nColor}66;">` +
           `<div class="cp-col-name">${name}</div>` +
           `<div class="cp-col-nation" style="color: ${nColor};">${nName}</div>` +
           `</div>` +
           `<div class="cp-col-rows">${rowsHtml}</div>`;
  }

  function renderComparePanel(regionA, regionB) {
    const dataA = _getRegionData(regionA);
    const dataB = _getRegionData(regionB);
    if (!dataA || !dataB) return false;

    const valsA = _extractValues(dataA);
    const valsB = _extractValues(dataB);

    // Определяем победителя по каждой метрике
    const winners = {};
    for (const m of METRICS) {
      const a = valsA[m.key];
      const b = valsB[m.key];
      if (a === b) { winners[m.key] = 'tie'; continue; }
      if (m.better === 'higher') winners[m.key] = (a > b) ? 'left' : 'right';
      else                        winners[m.key] = (a < b) ? 'left' : 'right';
    }

    const panel = _ensurePanel();
    const leftEl  = panel.querySelector('#cp-left');
    const rightEl = panel.querySelector('#cp-right');
    if (leftEl)  leftEl.innerHTML  = _renderColumn(dataA, valsA, winners, 'left');
    if (rightEl) rightEl.innerHTML = _renderColumn(dataB, valsB, winners, 'right');

    panel.classList.remove('hidden');

    // Закрываем popup региона, если он открыт
    try { if (typeof closeRegionInfo === 'function') closeRegionInfo(); } catch (_) {}

    return true;
  }

  // ── pin / unpin ──
  function pinRegionForCompare(regionId) {
    if (!regionId) return;
    // Повторное нажатие на тот же регион снимает pin
    if (_pinnedRegionId === regionId) {
      _pinnedRegionId = null;
      _updatePinnedButtons();
      return;
    }
    _pinnedRegionId = regionId;
    _updatePinnedButtons();
    if (typeof showToast === 'function') {
      try { showToast('⚖ Регион закреплён. Кликните второй для сравнения.'); } catch (_) {}
    }
  }

  function _updatePinnedButtons() {
    // Обновляем текст всех видимых кнопок Сравнить в popup
    const btns = document.querySelectorAll('.ri-compare-btn');
    btns.forEach(btn => {
      const rid = btn.getAttribute('data-region-id');
      if (rid && rid === _pinnedRegionId) {
        btn.classList.add('ri-compare-active');
        btn.textContent = '⚖ Сравнивается...';
      } else {
        btn.classList.remove('ri-compare-active');
        btn.textContent = '⚖ Сравнить';
      }
    });
  }

  // ── Перехват клика на второй регион ──
  // Возвращает true, если клик обработан (открыта панель сравнения) —
  // тогда обычный showRegionInfo вызывать не нужно.
  function handleRegionClickForCompare(regionId) {
    if (!_pinnedRegionId) return false;
    if (_pinnedRegionId === regionId) return false; // клик на тот же — не сравниваем
    const ok = renderComparePanel(_pinnedRegionId, regionId);
    return !!ok;
  }

  function closeCompare() {
    _pinnedRegionId = null;
    _updatePinnedButtons();
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.add('hidden');
  }

  function getPinnedRegionId() {
    return _pinnedRegionId;
  }

  // ── Экспорт в глобал ──
  if (typeof window !== 'undefined') {
    window.pinRegionForCompare       = pinRegionForCompare;
    window.closeCompare              = closeCompare;
    window.renderComparePanel        = renderComparePanel;
    window.handleRegionClickForCompare = handleRegionClickForCompare;
    window.getPinnedRegionId         = getPinnedRegionId;
  }
})();
