// engine/peace_engine.js — Этап CB-8..11: расширенная мирная логика
//
// Отвечает за:
//   • Применение мирных требований (10 типов demand) в applyPeaceDemands(...)
//   • Очередь peace_offers[] для AI↔AI и AI↔player
//   • Систему truces (перемирия после мира, 60 ходов)
//   • AI-оценку принятия мирных предложений (evaluatePeaceOffer)
//
// Работает поверх:
//   • engine/casus_belli.js — проверка allowed_demands, стоимость WS
//   • engine/war_score.js   — getWarScore, endWar
//   • engine/diplomacy.js   — createTreaty, breakTreaty, transferRegion
//
// Вся динамика работает на GAME_STATE, без DOM.

'use strict';

import { TURNS_PER_YEAR } from './diplomacy.js';

// ──────────────────────────────────────────────────────────────
// Конфигурация
// ──────────────────────────────────────────────────────────────

export const PEACE_CONFIG = {
  OFFER_TTL_TURNS:       3,    // сколько ходов peace_offer живёт
  MIN_WAR_DURATION:      5,    // минимум ходов войны до первого seek_peace
  TRUCE_DURATION_TURNS: 60,    // 5 лет труция после мира
  FORCED_ACCEPT_WS:    100,    // WS, с которого противник обязан принять
  REPARATIONS_PCT_INCOME_5Y:  0.08,  // 5-летняя репарация ≈ 8% дохода/ход
  REPARATIONS_PCT_INCOME_10Y: 0.06,
  PLUNDER_TREASURY_PCT:       0.25,  // 25% казны при plunder
  HUMILIATE_PRESTIGE:         20,
};

// ──────────────────────────────────────────────────────────────
// Инициализация
// ──────────────────────────────────────────────────────────────

export function initPeaceEngine() {
  if (typeof GAME_STATE === 'undefined') return;
  if (!Array.isArray(GAME_STATE.peace_offers)) GAME_STATE.peace_offers = [];
  if (!Array.isArray(GAME_STATE.truces))       GAME_STATE.truces = [];
}

// ──────────────────────────────────────────────────────────────
// Применение мирных требований (demands) при подписании мира
// ──────────────────────────────────────────────────────────────

/**
 * Применить список мирных требований к проигравшей нации.
 * @param {string} winnerId — победитель (получает бонусы)
 * @param {string} loserId  — проигравший (несёт штрафы)
 * @param {Array<{type, region_id?}>} demands
 * @returns {Array<string>} лог применения
 */
export function applyPeaceDemands(winnerId, loserId, demands) {
  const gs = GAME_STATE;
  const winner = gs.nations?.[winnerId];
  const loser  = gs.nations?.[loserId];
  if (!winner || !loser) return ['no_nation'];
  const log = [];

  for (const demand of (demands || [])) {
    const type = demand.type;
    try {
      switch (type) {
        case 'cede_region': {
          if (!demand.region_id) { log.push('cede_region:no_region'); break; }
          if (typeof transferRegion === 'function') {
            transferRegion(demand.region_id, loserId, winnerId);
            // Аннексия поднимает AE атакующего.
            if (typeof addAeScore === 'function') {
              addAeScore(winnerId, 10, 'annex_region');
            }
            log.push(`cede_region:${demand.region_id}`);
          }
          break;
        }
        case 'vassalize': {
          // Антиблоббинг CB-13: pop(winner)/pop(loser) < 50.
          if (typeof canVassalize === 'function' && !canVassalize(winnerId, loserId)) {
            log.push('vassalize:blocked_anti_blob');
            break;
          }
          if (typeof createTreaty === 'function') {
            createTreaty(winnerId, loserId, 'vassalage', {
              notes: 'Мирный договор: вассализация.',
            });
            if (typeof addAeScore === 'function') {
              addAeScore(winnerId, 15, 'vassalize');
            }
            log.push('vassalize');
          }
          break;
        }
        case 'force_tributary': {
          // Репарации = 10% дохода/ход на 48 ходов (4 года)
          const income = loser.economy?.income ?? 50;
          const perTurn = Math.max(5, Math.round(income * 0.10));
          if (typeof createTreaty === 'function') {
            createTreaty(winnerId, loserId, 'war_reparations', {
              duration:              4,  // лет
              reparations_per_turn:  perTurn,
              reparations_payer:     loserId,
              notes: `Данничество по ${perTurn} зол./ход.`,
            });
            log.push(`force_tributary:${perTurn}/turn`);
          }
          break;
        }
        case 'reparations_5y': {
          const income = loser.economy?.income ?? 50;
          const perTurn = Math.max(5, Math.round(income * PEACE_CONFIG.REPARATIONS_PCT_INCOME_5Y));
          if (typeof createTreaty === 'function') {
            createTreaty(winnerId, loserId, 'war_reparations', {
              duration:              5,
              reparations_per_turn:  perTurn,
              reparations_payer:     loserId,
              notes: `Репарации 5 лет по ${perTurn} зол./ход.`,
            });
            log.push(`reparations_5y:${perTurn}/turn`);
          }
          break;
        }
        case 'reparations_10y': {
          const income = loser.economy?.income ?? 50;
          const perTurn = Math.max(5, Math.round(income * PEACE_CONFIG.REPARATIONS_PCT_INCOME_10Y));
          if (typeof createTreaty === 'function') {
            createTreaty(winnerId, loserId, 'war_reparations', {
              duration:              10,
              reparations_per_turn:  perTurn,
              reparations_payer:     loserId,
              notes: `Репарации 10 лет по ${perTurn} зол./ход.`,
            });
            log.push(`reparations_10y:${perTurn}/turn`);
          }
          break;
        }
        case 'force_religion': {
          // Смена мажоритарной религии loser на религию winner
          const winRel = winner.religion ?? winner.culture?.religion;
          if (winRel && loser) {
            loser.religion = winRel;
            if (loser.culture) loser.culture.religion = winRel;
            // Штраф к стабильности за «еретическую» власть
            if (loser.government) {
              loser.government.stability = Math.max(0, (loser.government.stability ?? 50) - 25);
            }
            log.push(`force_religion:${winRel}`);
          }
          break;
        }
        case 'plunder_treasury': {
          const amount = Math.floor((loser.economy?.treasury ?? 0) * PEACE_CONFIG.PLUNDER_TREASURY_PCT);
          if (amount > 0 && typeof mutateTreasury === 'function') {
            mutateTreasury(loser,  -amount, 'plunder_loss');
            mutateTreasury(winner,  amount, 'plunder_gain');
          }
          log.push(`plunder_treasury:${amount}`);
          break;
        }
        case 'cancel_alliances': {
          // Разрываем все альянсы/пакты loser (кроме с winner)
          const incompat = ['defensive_alliance', 'military_alliance', 'non_aggression'];
          const treaties = gs.diplomacy?.treaties ?? [];
          let cancelled = 0;
          for (const t of treaties) {
            if (t.status !== 'active') continue;
            if (!incompat.includes(t.type)) continue;
            if (!t.parties.includes(loserId)) continue;
            if (t.parties.includes(winnerId)) continue;   // договор с winner не ломаем
            t.status = 'broken';
            t.breaker = loserId;
            t.turn_broken = gs.turn ?? 1;
            cancelled++;
          }
          log.push(`cancel_alliances:${cancelled}`);
          break;
        }
        case 'humiliate': {
          loser._prestige  = Math.max(-100, (loser._prestige  ?? 0) - PEACE_CONFIG.HUMILIATE_PRESTIGE);
          winner._prestige = Math.min( 100, (winner._prestige ?? 0) + PEACE_CONFIG.HUMILIATE_PRESTIGE);
          if (loser.government) {
            loser.government.stability = Math.max(0, (loser.government.stability ?? 50) - 5);
          }
          log.push('humiliate');
          break;
        }
        case 'armistice': {
          // Явное перемирие создаётся в addTruce ниже, здесь просто маркер.
          log.push('armistice');
          break;
        }
        default:
          log.push(`unknown:${type}`);
      }
    } catch (e) {
      console.warn('[applyPeaceDemands]', type, e);
      log.push(`error:${type}`);
    }
  }
  return log;
}

// ──────────────────────────────────────────────────────────────
// Truce system — автоматическое 60-ходовое перемирие после мира
// ──────────────────────────────────────────────────────────────

/**
 * Создать truce между двумя нациями на TRUCE_DURATION_TURNS ходов.
 */
export function addTruce(nationA, nationB, durationTurns = PEACE_CONFIG.TRUCE_DURATION_TURNS) {
  initPeaceEngine();
  const turn = GAME_STATE.turn ?? 1;
  const truce = {
    id:            `truce_${nationA}_${nationB}_t${turn}`,
    parties:       [nationA, nationB],
    turn_created:  turn,
    turn_expires:  turn + durationTurns,
  };
  // Удаляем предыдущий truce между этими двумя (если был) — обновляем expiry.
  GAME_STATE.truces = GAME_STATE.truces.filter(t =>
    !(t.parties.includes(nationA) && t.parties.includes(nationB))
  );
  GAME_STATE.truces.push(truce);
  return truce;
}

/** Есть ли активное truce между двумя нациями? */
export function hasActiveTruce(nationA, nationB) {
  initPeaceEngine();
  const turn = GAME_STATE.turn ?? 1;
  return GAME_STATE.truces.some(t =>
    t.parties.includes(nationA) && t.parties.includes(nationB) && t.turn_expires > turn
  );
}

/** Ход-тик: убираем истёкшие truce. */
export function tickTruces() {
  initPeaceEngine();
  const turn = GAME_STATE.turn ?? 1;
  GAME_STATE.truces = GAME_STATE.truces.filter(t => t.turn_expires > turn);
}

// ──────────────────────────────────────────────────────────────
// Peace Offers — очередь мирных предложений
// ──────────────────────────────────────────────────────────────

/**
 * Создать peace_offer от одной нации к другой. TTL = OFFER_TTL_TURNS.
 * @param {object} opts — { from, to, demands, war_ref, initiator_ws }
 */
export function createPeaceOffer({ from, to, demands, war_ref = null, initiator_ws = 0 }) {
  initPeaceEngine();
  const turn = GAME_STATE.turn ?? 1;
  // Не дубликаты: один активный offer между парой
  GAME_STATE.peace_offers = GAME_STATE.peace_offers.filter(o =>
    !(o.from === from && o.to === to && o.status === 'pending')
  );
  const offer = {
    id:              `po_${from}_${to}_t${turn}`,
    from, to,
    demands:         demands || [],
    war_ref,
    initiator_ws,
    turn_created:    turn,
    turn_expires:    turn + PEACE_CONFIG.OFFER_TTL_TURNS,
    status:          'pending',
  };
  GAME_STATE.peace_offers.push(offer);
  return offer;
}

/** Отозвать или отклонить предложение. */
export function rejectPeaceOffer(offerId) {
  initPeaceEngine();
  const o = GAME_STATE.peace_offers.find(x => x.id === offerId);
  if (o) { o.status = 'rejected'; o.turn_resolved = GAME_STATE.turn ?? 1; }
  return o;
}

/** Принять предложение и выполнить мир. */
export function acceptPeaceOffer(offerId) {
  initPeaceEngine();
  const o = GAME_STATE.peace_offers.find(x => x.id === offerId);
  if (!o || o.status !== 'pending') return null;
  o.status = 'accepted';
  o.turn_resolved = GAME_STATE.turn ?? 1;

  // Определяем winner/loser по WS (если war_ref есть)
  let winnerId = null, loserId = null;
  if (typeof getWarScore === 'function') {
    const ws = getWarScore(o.from, o.to);
    // Текущая война: кто accumulated больше, тот winner
    if (ws.war) {
      winnerId = (ws.player > ws.opponent) ? o.from : o.to;
      loserId  = (winnerId === o.from) ? o.to : o.from;
    }
  }
  // Fallback: offer инициируется проигравшим, предлагающий = loser
  if (!winnerId) {
    loserId  = o.from;
    winnerId = o.to;
  }

  applyPeaceDemands(winnerId, loserId, o.demands);

  // Завершение войны и создание peace_treaty (через существующий concludePeace)
  if (typeof concludePeace === 'function') {
    try {
      concludePeace(winnerId, loserId, {
        winner:        winnerId,
        loser:         loserId,
        ceded_regions: [],       // уже применены выше
        _demands_log:  o.demands,
      });
    } catch (e) { console.warn('[acceptPeaceOffer]', e); }
  }

  // Truce на 60 ходов (5 лет)
  addTruce(o.from, o.to);
  return o;
}

/**
 * Ход-тик: истекаем старые offers, и для AI-наций оцениваем поступившие.
 */
export function tickPeaceOffers() {
  initPeaceEngine();
  const gs = GAME_STATE;
  const turn = gs.turn ?? 1;
  const playerId = gs.player_nation;

  for (const offer of gs.peace_offers) {
    if (offer.status !== 'pending') continue;
    if (offer.turn_expires <= turn) {
      offer.status = 'expired';
      offer.turn_resolved = turn;
      continue;
    }
    // Для AI-получателя — сами оцениваем и решаем (игрок оценивает через UI).
    if (offer.to !== playerId) {
      const decision = evaluatePeaceOffer(offer);
      if (decision === 'accept') acceptPeaceOffer(offer.id);
      else if (decision === 'reject') rejectPeaceOffer(offer.id);
      // 'wait' — оставляем для следующего хода
    }
  }

  // Чистим старые (expired/accepted/rejected старше 10 ходов)
  gs.peace_offers = gs.peace_offers.filter(o => {
    if (o.status === 'pending') return true;
    return (o.turn_resolved ?? 0) + 10 > turn;
  });
}

// ──────────────────────────────────────────────────────────────
// AI оценка принятия offer
// ──────────────────────────────────────────────────────────────

/**
 * Нация to решает, принять ли offer.
 * Возвращает 'accept' | 'reject' | 'wait'.
 *
 * Логика: сравниваем свой WS с предложенными требованиями.
 *  - Если offered_demands_ws ≤ own_ws → хорошая сделка, принимаем.
 *  - Если own_ws < FORCED_ACCEPT_WS и offered_demands_ws > own_ws по модулю
 *    но меньше FORCED_ACCEPT_WS — взвешенное решение через caution.
 *  - Если offered_demands_ws > FORCED_ACCEPT_WS → нельзя принять.
 *  - Если мы выигрываем (own_ws > other_ws + 20) → reject (сами давим).
 */
export function evaluatePeaceOffer(offer) {
  const gs = GAME_STATE;
  const receiver = gs.nations?.[offer.to];
  if (!receiver) return 'reject';

  // Суммарная WS-стоимость требований
  let demandsWs = 0;
  if (typeof getDemandWsCost === 'function') {
    for (const d of (offer.demands || [])) {
      demandsWs += getDemandWsCost(d.type, { region_id: d.region_id });
    }
  }

  // WS противников
  let ownWs = 0, otherWs = 0;
  if (typeof getWarScore === 'function') {
    const scores = getWarScore(offer.to, offer.from);
    ownWs = scores.player; otherWs = scores.opponent;
  }

  // Принуждение: если offerer имеет overwhelming WS
  if (otherWs - ownWs >= PEACE_CONFIG.FORCED_ACCEPT_WS) return 'accept';

  // Мы выигрываем — отказываем
  if (ownWs > otherWs + 20) return 'reject';

  // Caution-based decision: страна с высокой caution охотнее принимает мир.
  const caution = receiver._ou?.caution ?? 0.5;
  const acceptanceThreshold = otherWs + caution * 20;

  if (demandsWs <= acceptanceThreshold) return 'accept';
  return 'reject';
}

// ──────────────────────────────────────────────────────────────
// Генератор AI-offer: loser/winner side → demands
// ──────────────────────────────────────────────────────────────

/**
 * AI-сторона формирует список требований на основе своего WS и CB-типа.
 * Для loser: предлагает минимальные требования, чтобы выжить.
 * Для winner: требует по максимуму в рамках allowed_demands.
 *
 * @param {string} aiNationId — кто формирует offer
 * @param {string} targetId   — кому
 * @param {string} role       — 'winner' | 'loser' (относительно WS)
 * @param {string} cbType     — активный CB (опц.)
 */
export function generatePeaceDemands(aiNationId, targetId, role, cbType = null) {
  const gs = GAME_STATE;
  let ownWs = 0, otherWs = 0;
  if (typeof getWarScore === 'function') {
    const scores = getWarScore(aiNationId, targetId);
    ownWs = scores.player; otherWs = scores.opponent;
  }
  const availableWs = Math.max(0, role === 'winner' ? ownWs : Math.floor(otherWs * 0.6));

  // Допустимые требования: по CB-каталогу, если задан; иначе базовый набор.
  let allowed = ['reparations_5y', 'armistice'];
  if (cbType && typeof CASUS_BELLI_TYPES !== 'undefined' && CASUS_BELLI_TYPES[cbType]) {
    allowed = CASUS_BELLI_TYPES[cbType].allowed_demands.slice();
  }

  const demands = [];
  let budget = availableWs;

  // Для loser — просто armistice (минимум, хочет выжить)
  if (role === 'loser') {
    return [{ type: 'armistice' }];
  }

  // Для winner — жадно добавляем по убыванию стоимости
  const ordered = [
    { type: 'vassalize',       cost: 30 },
    { type: 'force_religion',  cost: 25 },
    { type: 'force_tributary', cost: 20 },
    { type: 'reparations_10y', cost: 18 },
    { type: 'cede_region',     cost: 15, needs_region: true },
    { type: 'reparations_5y',  cost: 10 },
    { type: 'cancel_alliances', cost: 10 },
    { type: 'plunder_treasury', cost: 10 },
    { type: 'humiliate',       cost: 5  },
  ];

  for (const d of ordered) {
    if (!allowed.includes(d.type)) continue;
    if (d.cost > budget) continue;
    if (d.needs_region) {
      // Берём граничный регион loser
      const loser = gs.nations?.[targetId];
      const regionId = loser?.regions?.[0];
      if (!regionId) continue;
      demands.push({ type: 'cede_region', region_id: regionId });
    } else {
      demands.push({ type: d.type });
    }
    budget -= d.cost;
  }

  // Гарантируем хотя бы armistice
  demands.push({ type: 'armistice' });
  return demands;
}
