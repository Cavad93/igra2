// ui/peace_offer_overlay.js — Этап CB-10
//
// Модальное окно: AI предлагает игроку мир с конкретными требованиями.
// Показывается автоматически при появлении peace_offer с to === player_nation.
//
// Действия: Принять / Отвергнуть. (MVP — без counter-offer, добавим позже.)
//
// Вызов: showPeaceOfferOverlay(offerId). Автоматический рендер через
// renderPendingPeaceOffers() из основного цикла UI.

'use strict';

let _peaceOfferEl = null;
let _currentOfferId = null;

function _ensureOverlay() {
  if (_peaceOfferEl) return _peaceOfferEl;
  const el = document.createElement('div');
  el.id = 'peace-offer-overlay';
  el.className = 'overlay hidden';
  el.innerHTML = `
    <div class="po-dialog">
      <div class="po-header">
        <h2>📜 Предложение мира</h2>
      </div>
      <div class="po-body" id="po-body"></div>
      <div class="po-footer">
        <button class="po-btn po-accept" data-action="acceptPeaceOfferUI">✓ Принять</button>
        <button class="po-btn po-reject" data-action="rejectPeaceOfferUI">✗ Отвергнуть</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  _peaceOfferEl = el;
  return el;
}

function _esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function _demandLabel(demand) {
  const type = demand.type;
  const labels = {
    cede_region:      region => `🗺 Цессия региона «${region?.name ?? demand.region_id}»`,
    vassalize:        () => '🏳 Вассализация',
    force_tributary:  () => '💰 Данничество (4 года)',
    reparations_5y:   () => '💰 Репарации (5 лет)',
    reparations_10y:  () => '💰 Репарации (10 лет)',
    force_religion:   () => '✝ Смена религии',
    plunder_treasury: () => '🗡 Разграбление казны (25%)',
    cancel_alliances: () => '⚔ Разрыв альянсов',
    humiliate:        () => '😞 Унижение',
    armistice:        () => '🕊 Перемирие',
  };
  const fn = labels[type];
  if (!fn) return type;
  if (type === 'cede_region') {
    const region = GAME_STATE.regions?.[demand.region_id];
    return fn(region);
  }
  return fn();
}

export function showPeaceOfferOverlay(offerId) {
  const gs = GAME_STATE;
  const offer = (gs.peace_offers || []).find(o => o.id === offerId);
  if (!offer || offer.status !== 'pending') return;
  _currentOfferId = offerId;
  const el = _ensureOverlay();
  const from = gs.nations?.[offer.from];
  const fromName = from?.name ?? offer.from;
  const role = offer.from === gs.player_nation ? 'you' : 'them';

  let ownWs = 0, otherWs = 0;
  if (typeof getWarScore === 'function') {
    const s = getWarScore(gs.player_nation, offer.from);
    ownWs = s.player; otherWs = s.opponent;
  }

  const demandsHtml = (offer.demands || []).map(d => `<li>${_esc(_demandLabel(d))}</li>`).join('');

  let totalCost = 0;
  if (typeof getDemandWsCost === 'function') {
    for (const d of (offer.demands || [])) totalCost += getDemandWsCost(d.type, { region_id: d.region_id });
  }

  el.querySelector('#po-body').innerHTML = `
    <p class="po-intro"><strong>${_esc(fromName)}</strong> предлагает мир со следующими условиями:</p>
    <ul class="po-demands">${demandsHtml || '<li>(нет требований)</li>'}</ul>
    <div class="po-ws">
      <div>Ваш warscore: <strong>${ownWs}</strong></div>
      <div>Их warscore: <strong>${otherWs}</strong></div>
      <div>Стоимость требований: <strong>${totalCost} WS</strong></div>
    </div>
    <p class="po-hint">Принятие завершит войну и установит 5-летнее перемирие (60 ходов).</p>
  `;

  el.classList.remove('hidden');
}

export function closePeaceOfferOverlay() {
  if (_peaceOfferEl) _peaceOfferEl.classList.add('hidden');
  _currentOfferId = null;
}

export function acceptPeaceOfferUI() {
  if (!_currentOfferId) return;
  if (typeof acceptPeaceOffer === 'function') {
    acceptPeaceOffer(_currentOfferId);
  }
  if (typeof addEventLog === 'function') addEventLog('📜 Предложение мира принято.', 'good');
  closePeaceOfferOverlay();
  if (typeof renderAll === 'function') renderAll();
}

export function rejectPeaceOfferUI() {
  if (!_currentOfferId) return;
  if (typeof rejectPeaceOffer === 'function') {
    rejectPeaceOffer(_currentOfferId);
  }
  if (typeof addEventLog === 'function') addEventLog('✗ Предложение мира отвергнуто.', 'warning');
  closePeaceOfferOverlay();
  if (typeof renderAll === 'function') renderAll();
}

/**
 * Проверить pending offers и показать первый релевантный игроку.
 * Вызывается из renderAll() каждый ход.
 */
export function renderPendingPeaceOffers() {
  const gs = GAME_STATE;
  if (!gs?.peace_offers) return;
  const playerId = gs.player_nation;
  const myOffer = gs.peace_offers.find(o => o.status === 'pending' && o.to === playerId);
  if (!myOffer) return;
  // Если оверлей уже показывает — не перекрываем.
  if (_currentOfferId === myOffer.id && _peaceOfferEl && !_peaceOfferEl.classList.contains('hidden')) return;
  showPeaceOfferOverlay(myOffer.id);
}
