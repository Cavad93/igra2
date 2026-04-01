'use strict';
// engine/loans.js — Система государственных займов у граждан
//
// Механика:
//   - Нация берёт заём у своих граждан (торговцев, аристократов, купцов)
//   - Каждый ход списывается ежемесячный платёж (основной долг + проценты)
//   - Нельзя брать новый заём если сумма платежей > 70% валового дохода
//   - При невозможности платить — объявление банкротства со штрафами
//
// Структура займа (хранится в GAME_STATE.loans[]):
//   {
//     id:              'loan_<nationId>_<turn>',
//     nation_id:       string,
//     principal:       number,   // сумма займа
//     remaining:       number,   // остаток долга
//     monthly_payment: number,   // фиксированный платёж в ход
//     interest_rate:   number,   // годовая ставка (0.04..0.20)
//     term:            number,   // срок в ходах (месяцах)
//     turns_paid:      number,
//     taken_turn:      number,
//     defaulted:       boolean,
//   }

// ─── КОНСТАНТЫ ────────────────────────────────────────────────────────────────

const LOAN_MAX_PAYMENT_RATIO  = 0.70;  // платежи ≤ 70% валового дохода
const LOAN_MIN_AMOUNT         = 500;   // минимальная сумма займа
const LOAN_DEFAULT_TERM       = 24;    // срок по умолчанию: 24 хода (2 года)

// Штрафы при банкротстве
const BANKRUPTCY_STABILITY_HIT  = -20;
const BANKRUPTCY_HAPPINESS_HIT  = -15;
const BANKRUPTCY_RELATION_HIT   = -25; // к отношениям со всеми соседями

// ─── ВСПОМОГАТЕЛЬНЫЕ ──────────────────────────────────────────────────────────

/** Валовый доход нации (до расходов) из последнего тика. */
function _getGrossIncome(nation) {
  return Math.max(1, nation.economy?.income_per_turn ?? 0);
}

/** Торговый оборот нации — влияет на процентную ставку. */
function _getTradeVolume(nation) {
  const routes = (nation.economy?.primary_exports?.length ?? 0)
               + (nation.economy?.primary_imports?.length ?? 0);
  return routes * 500; // грубая оценка оборота
}

/** Рассчитать годовую процентную ставку для данной нации.
 *  Базовая 8%. Скидка за торговлю. Надбавка за нестабильность и долг.
 */
function calcInterestRate(nationId) {
  const nation     = GAME_STATE.nations?.[nationId];
  if (!nation) return 0.12;

  const stability  = nation.government?.stability ?? 50;
  const happiness  = nation.population?.happiness ?? 50;
  const tradeVol   = _getTradeVolume(nation);
  const income     = _getGrossIncome(nation);
  const debtLoad   = getLoanDebtLoad(nationId); // текущие платежи / доход

  let rate = 0.08; // базовая ставка 8% годовых

  // Торговля снижает ставку (доверие граждан к государству)
  if (tradeVol > 2000) rate -= 0.02;
  if (tradeVol > 5000) rate -= 0.01;

  // Нестабильность повышает ставку
  if (stability < 40) rate += 0.03;
  if (stability < 25) rate += 0.03;

  // Недовольство повышает ставку
  if (happiness < 40) rate += 0.02;

  // Уже есть долги — риск выше
  if (debtLoad > 0.30) rate += 0.03;
  if (debtLoad > 0.55) rate += 0.04;

  return Math.max(0.04, Math.min(0.20, rate));
}

/** Рассчитать фиксированный ежемесячный платёж (аннуитет).
 *  payment = P × r / (1 − (1+r)^−n),  r = месячная ставка, n = срок в месяцах
 */
function calcMonthlyPayment(principal, annualRate, termTurns) {
  const r = annualRate / 12; // месячная ставка
  if (r < 0.0001) return Math.ceil(principal / termTurns);
  const factor = Math.pow(1 + r, termTurns);
  return Math.ceil(principal * r * factor / (factor - 1));
}

// ─── ПУБЛИЧНОЕ API ─────────────────────────────────────────────────────────────

/** Суммарный ежемесячный платёж по всем активным займам нации. */
function getLoanTotalPayment(nationId) {
  const loans = (GAME_STATE.loans ?? []).filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  return loans.reduce((s, l) => s + l.monthly_payment, 0);
}

/** Отношение суммарного платежа к валовому доходу (0..1+). */
function getLoanDebtLoad(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;
  return getLoanTotalPayment(nationId) / _getGrossIncome(nation);
}

/** Максимальная сумма нового займа при данных параметрах.
 *  Ограничена тем, чтобы суммарный платёж не превышал 70% дохода.
 *  Возвращает 0 если взять нельзя.
 */
function getLoanCapacity(nationId, termTurns = LOAN_DEFAULT_TERM) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;

  const grossIncome    = _getGrossIncome(nation);
  const currentPayment = getLoanTotalPayment(nationId);
  const maxPayment     = grossIncome * LOAN_MAX_PAYMENT_RATIO;
  const freePayment    = maxPayment - currentPayment;
  if (freePayment <= 0) return 0;

  // Обратная формула аннуитета: principal = payment × (1 − (1+r)^−n) / r
  const annualRate = calcInterestRate(nationId);
  const r = annualRate / 12;
  let maxPrincipal;
  if (r < 0.0001) {
    maxPrincipal = freePayment * termTurns;
  } else {
    const factor = Math.pow(1 + r, termTurns);
    maxPrincipal = Math.floor(freePayment * (factor - 1) / (r * factor));
  }

  return Math.max(0, maxPrincipal);
}

/** Взять заём.
 *  @param {string} nationId
 *  @param {number} amount      — запрашиваемая сумма
 *  @param {number} [term]      — срок в ходах (по умолчанию 24)
 *  @returns {{ ok: boolean, loan?: object, reason?: string }}
 */
function takeLoan(nationId, amount, term = LOAN_DEFAULT_TERM) {
  if (!GAME_STATE.loans) GAME_STATE.loans = [];

  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return { ok: false, reason: 'Нация не найдена.' };
  if (amount < LOAN_MIN_AMOUNT) return { ok: false, reason: `Минимальная сумма займа: ${LOAN_MIN_AMOUNT}.` };

  const capacity = getLoanCapacity(nationId, term);
  if (capacity < amount) {
    return {
      ok: false,
      reason: capacity < LOAN_MIN_AMOUNT
        ? 'Кредитный лимит исчерпан — платежи достигли 70% дохода.'
        : `Максимально доступная сумма: ${Math.floor(capacity)}.`,
    };
  }

  const annualRate     = calcInterestRate(nationId);
  const monthly        = calcMonthlyPayment(amount, annualRate, term);

  const loan = {
    id:              `loan_${nationId}_${GAME_STATE.turn ?? 0}_${Date.now() % 100000}`,
    nation_id:       nationId,
    principal:       amount,
    remaining:       amount,
    monthly_payment: monthly,
    interest_rate:   annualRate,
    term,
    turns_paid:      0,
    taken_turn:      GAME_STATE.turn ?? 0,
    defaulted:       false,
  };

  GAME_STATE.loans.push(loan);
  nation.economy.treasury = (nation.economy.treasury ?? 0) + amount;

  // Трекинг для достижений
  nation._total_loans_taken    = (nation._total_loans_taken ?? 0) + amount;
  nation._loans_taken_this_turn = (nation._loans_taken_this_turn ?? 0) + 1;

  if (typeof addEventLog === 'function') {
    const rateStr = (annualRate * 100).toFixed(1);
    addEventLog(
      `🏦 Заём: +${amount} монет от граждан (ставка ${rateStr}%, срок ${term} мес., платёж ${monthly}/мес.)`,
      'economy'
    );
  }

  return { ok: true, loan };
}

/** Обработать платежи по займам для одной нации за один ход.
 *  Вызывается из turn.js после updateTreasury.
 *  Если казна не позволяет — уходит в минус (государство берёт в долг у себя).
 *  Если казна уже < −(3× валового дохода) — объявляем банкротство.
 */
function processLoanPayments(nationId) {
  if (!GAME_STATE.loans) return;

  const nation  = GAME_STATE.nations?.[nationId];
  if (!nation) return;

  const active = GAME_STATE.loans.filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  if (active.length === 0) return;

  for (const loan of active) {
    // Реальный платёж: principal component + interest component
    const payment = Math.min(loan.monthly_payment, loan.remaining);
    loan.remaining   = Math.max(0, loan.remaining - payment);
    loan.turns_paid += 1;
    nation.economy.treasury = (nation.economy.treasury ?? 0) - payment;

    if (loan.remaining === 0) {
      if (typeof addEventLog === 'function') {
        addEventLog(`✅ Заём погашен! (взят на ходу ${loan.taken_turn})`, 'economy');
      }
    }
  }

  // Проверка на автобанкротство — если казна < −3× валового дохода
  const grossIncome = _getGrossIncome(nation);
  if ((nation.economy.treasury ?? 0) < -(grossIncome * 3)) {
    declareBankruptcy(nationId);
  }
}

/** Объявить банкротство.
 *  Списывает все долги, но наносит тяжёлые штрафы.
 */
function declareBankruptcy(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;
  if (!GAME_STATE.loans) return;

  const activeLoans = GAME_STATE.loans.filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  if (activeLoans.length === 0) return;

  const totalDebt = activeLoans.reduce((s, l) => s + l.remaining, 0);
  for (const l of activeLoans) l.defaulted = true;

  // Штрафы
  if (nation.government) {
    nation.government.stability = Math.max(0,
      (nation.government.stability ?? 50) + BANKRUPTCY_STABILITY_HIT
    );
  }
  if (nation.population) {
    nation.population.happiness = Math.max(0,
      (nation.population.happiness ?? 50) + BANKRUPTCY_HAPPINESS_HIT
    );
  }

  // Штраф к отношениям со всеми соседями (нарушение доверия)
  if (typeof getRelation === 'function' && GAME_STATE.diplomacy?.relations) {
    for (const [key, rel] of Object.entries(GAME_STATE.diplomacy.relations)) {
      if (key.includes(nationId)) {
        rel.score = Math.max(-100, (rel.score ?? 0) + BANKRUPTCY_RELATION_HIT);
      }
    }
  }

  // Казна обнуляется
  nation.economy.treasury = 0;

  if (typeof addEventLog === 'function') {
    addEventLog(
      `💸 ${nation.name ?? nationId} объявляет банкротство! `
      + `Списан долг ${totalDebt} монет. `
      + `Стабильность ${BANKRUPTCY_STABILITY_HIT}, `
      + `счастье ${BANKRUPTCY_HAPPINESS_HIT}.`,
      'danger'
    );
  }
  if (typeof addMemoryEvent === 'function') {
    addMemoryEvent(nationId, 'economy', `Банкротство: списан долг ${totalDebt} монет.`);
  }
}

/** Получить сводку по займам нации для UI.
 *  @returns {{ totalDebt, monthlyPayment, debtLoad, loans: [] }}
 */
function getLoanStatus(nationId) {
  const loans = (GAME_STATE.loans ?? []).filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  const totalDebt     = loans.reduce((s, l) => s + l.remaining, 0);
  const monthlyPayment = loans.reduce((s, l) => s + l.monthly_payment, 0);
  const nation        = GAME_STATE.nations?.[nationId];
  const grossIncome   = nation ? _getGrossIncome(nation) : 1;

  return {
    totalDebt,
    monthlyPayment,
    debtLoad:    monthlyPayment / grossIncome,
    canBorrow:   getLoanDebtLoad(nationId) < LOAN_MAX_PAYMENT_RATIO,
    capacity:    getLoanCapacity(nationId),
    rate:        calcInterestRate(nationId),
    loans,
  };
}
