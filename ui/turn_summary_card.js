// ui/turn_summary_card.js — Шаг 52 (arma.md)
// Визуальная карточка итога хода: после нажатия "Следующий ход"
// показывает дельты ресурсов игрока с автозакрытием через 5 сек.
//
// Публичный API:
//   - snapshotNationState(nation)      → объект со снимком ключевых ресурсов
//   - showTurnSummaryCard(prev, next)  → показать карточку с дельтами
//   - closeTurnSummaryCard()           → закрыть карточку (кнопка / авто)
//
// DOM: #turn-summary-card (создаётся лениво, один раз)
// Стили: #turn-summary-card + .tsc-* + @keyframes tsc-appear/tsc-countdown
// определены в index.html <style>.

(function () {
  'use strict';

  const CARD_ID = 'turn-summary-card';
  const AUTO_CLOSE_MS = 5000;

  let _autoCloseTimer = null;

  // ── MONTH_NAMES берём из engine/turn.js глобала; fallback — аттические месяцы ──
  const FALLBACK_MONTHS = [
    '', 'Гамелион', 'Анфестерион', 'Элафеболион', 'Мунихион',
    'Таргелион', 'Скирофорион', 'Гекатомбеон', 'Метагитнион',
    'Боэдромион', 'Пианопсион', 'Маймактерион', 'Посейдеон',
  ];

  // ── Сезонные иконки дублируют SEASON_STYLES из turn.js ──
  const SEASON_ICONS = ['🌸', '☀', '🍂', '❄'];

  function _formatDate(date) {
    if (!date) return '';
    const month = Math.max(1, Math.min(12, date.month ?? 1));
    const names = (typeof MONTH_NAMES !== 'undefined' && MONTH_NAMES) ? MONTH_NAMES : FALLBACK_MONTHS;
    const monthName = names[month] ?? FALLBACK_MONTHS[month] ?? 'Месяц';
    const year = date.year ?? 0;
    const era = year < 0 ? `${Math.abs(year)} BC` : `${year} AD`;
    return `${monthName}, ${era}`;
  }

  function _getSeasonIcon() {
    if (typeof getCurrentSeason === 'function') {
      try { return SEASON_ICONS[getCurrentSeason() & 3] ?? '🌸'; } catch (_) {}
    }
    const turn = (typeof GAME_STATE !== 'undefined' && GAME_STATE && GAME_STATE.turn) || 0;
    return SEASON_ICONS[((turn % 4) + 4) % 4];
  }

  // ── Снимок состояния нации для расчёта дельт ──
  function snapshotNationState(nation) {
    if (!nation) return { treasury: 0, population: 0, total_troops: 0, happiness: 0, legitimacy: 0 };
    const mil = nation.military ?? {};
    const pop = nation.population ?? {};
    const eco = nation.economy ?? {};
    const gov = nation.government ?? {};
    return {
      treasury:     Math.round(eco.treasury ?? 0),
      population:   Math.round(pop.total ?? 0),
      total_troops: Math.round((mil.infantry ?? 0) + (mil.cavalry ?? 0) + (mil.ships ?? 0)),
      happiness:    Math.round(pop.happiness ?? 0),
      legitimacy:   Math.round(gov.legitimacy ?? 0),
    };
  }

  // ── Ленивое создание DOM-узла ──
  function _ensureCard() {
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'hidden';
    card.innerHTML = `
      <div class="tsc-header">
        <span id="tsc-turn">Ход 0</span>
        <span id="tsc-date"></span>
        <span id="tsc-season">🌸</span>
      </div>
      <div class="tsc-deltas" id="tsc-deltas"></div>
      <div class="tsc-alerts" id="tsc-alerts"></div>
      <div class="tsc-footer">
        <div class="tsc-progress"></div>
        <button type="button" id="tsc-continue-btn">Продолжить →</button>
      </div>
    `;
    document.body.appendChild(card);
    const btn = card.querySelector('#tsc-continue-btn');
    if (btn) btn.addEventListener('click', closeTurnSummaryCard);
    return card;
  }

  function _fmtDelta(n) {
    if (n > 0) return '+' + n;
    return String(n);
  }

  function _buildDeltaRow(label, delta) {
    const cls = delta > 0 ? 'tsc-delta-pos' : (delta < 0 ? 'tsc-delta-neg' : '');
    return `<div class="tsc-delta-row"><span class="tsc-delta-label">${label}</span>` +
           `<span class="tsc-delta-val ${cls}">${_fmtDelta(delta)}</span></div>`;
  }

  // ── Главный публичный метод ──
  function showTurnSummaryCard(prevState, newState) {
    const prev = prevState || {};
    const next = newState  || {};

    const card = _ensureCard();

    // Заголовок
    const turnEl   = card.querySelector('#tsc-turn');
    const dateEl   = card.querySelector('#tsc-date');
    const seasonEl = card.querySelector('#tsc-season');
    const turnNum  = (typeof GAME_STATE !== 'undefined' && GAME_STATE && GAME_STATE.turn) || 0;
    const gameDate = (typeof GAME_STATE !== 'undefined' && GAME_STATE && GAME_STATE.date) || null;
    if (turnEl)   turnEl.textContent   = `Ход ${turnNum}`;
    if (dateEl)   dateEl.textContent   = _formatDate(gameDate);
    if (seasonEl) seasonEl.textContent = _getSeasonIcon();

    // Дельты
    const rows = [
      { label: '💰 Казна',     delta: (next.treasury     ?? 0) - (prev.treasury     ?? 0) },
      { label: '👥 Население', delta: (next.population   ?? 0) - (prev.population   ?? 0) },
      { label: '⚔ Армия',      delta: (next.total_troops ?? 0) - (prev.total_troops ?? 0) },
    ];
    if (next.happiness != null && prev.happiness != null) {
      rows.push({ label: '🙂 Счастье', delta: next.happiness - prev.happiness });
    }

    const deltasEl = card.querySelector('#tsc-deltas');
    if (deltasEl) deltasEl.innerHTML = rows.map(r => _buildDeltaRow(r.label, r.delta)).join('');

    // Алерты — простые эвристики
    const alertsEl = card.querySelector('#tsc-alerts');
    if (alertsEl) {
      const alerts = [];
      const dTreas = rows[0].delta;
      const dPop   = rows[1].delta;
      if (dTreas < 0 && (next.treasury ?? 0) < 0) {
        alerts.push('<div class="tsc-alert tsc-alert-danger">⚠ Казна в минусе</div>');
      }
      if (dPop < 0) {
        alerts.push('<div class="tsc-alert tsc-alert-warning">⚠ Население сокращается</div>');
      }
      alertsEl.innerHTML = alerts.join('');
    }

    // Перезапускаем прогресс-бар (сбрасываем анимацию)
    const progressEl = card.querySelector('.tsc-progress');
    if (progressEl) {
      progressEl.style.animation = 'none';
      // reflow чтобы анимация перезапустилась
      void progressEl.offsetWidth;
      progressEl.style.animation = '';
    }

    // Показываем
    card.classList.remove('hidden');

    // Автозакрытие через 5 сек
    if (_autoCloseTimer) { clearTimeout(_autoCloseTimer); _autoCloseTimer = null; }
    _autoCloseTimer = setTimeout(closeTurnSummaryCard, AUTO_CLOSE_MS);
  }

  function closeTurnSummaryCard() {
    if (_autoCloseTimer) { clearTimeout(_autoCloseTimer); _autoCloseTimer = null; }
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    card.classList.add('hidden');
    // После закрытия — фокус на карту
    const map = document.getElementById('map');
    if (map && typeof map.focus === 'function') {
      try { map.focus({ preventScroll: true }); } catch (_) { try { map.focus(); } catch (_) {} }
    }
  }

  // ── Экспорт в глобал ──
  if (typeof window !== 'undefined') {
    window.snapshotNationState = snapshotNationState;
    window.showTurnSummaryCard = showTurnSummaryCard;
    window.closeTurnSummaryCard = closeTurnSummaryCard;
  }
})();
