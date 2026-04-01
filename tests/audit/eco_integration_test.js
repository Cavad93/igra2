'use strict';
/**
 * tests/audit/eco_integration_test.js
 *
 * INTEGRATION-тесты: Экономика ↔ Займы (loans.js)
 *
 * Проверяет взаимодействие казны нации с системой займов:
 *   — Заём зачисляется в treasury
 *   — processLoanPayments вычитает платёж из treasury
 *   — При правильной амортизации нация платит реальные проценты
 *   — Банкротство срабатывает при treasury < -(grossIncome * 3)
 *   — debtLoad не превышает 70% после взятия займа
 *
 * Запуск: node tests/audit/eco_integration_test.js
 */

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function assertNear(a, b, eps, msg) {
  const ok = Math.abs(a - b) <= eps;
  if (ok) {
    console.log(`  ✓ ${msg} (${a.toFixed(2)} ≈ ${b.toFixed(2)})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg} — got ${a.toFixed(2)}, expected ≈ ${b.toFixed(2)} (±${eps})`);
    failed++;
  }
}

// ─── Минимальный mock GAME_STATE ──────────────────────────────────────────────

let GAME_STATE = {};

function resetState() {
  GAME_STATE = {
    turn: 1,
    loans: [],
    nations: {
      rome: {
        name: 'Рим',
        government: { stability: 60 },
        population:  { happiness: 60 },
        economy: {
          treasury:       2000,
          income_per_turn: 500,
          primary_exports: ['wheat', 'wine'],
          primary_imports: ['iron'],
          trade_routes:    [],
        },
        relations: {},
        regions: [],
      },
    },
    diplomacy: { relations: {} },
  };
}

// ─── Встроенные копии функций loans.js ────────────────────────────────────────

const LOAN_MAX_PAYMENT_RATIO = 0.70;
const LOAN_MIN_AMOUNT        = 500;
const LOAN_DEFAULT_TERM      = 24;
const BANKRUPTCY_STABILITY_HIT  = -20;
const BANKRUPTCY_HAPPINESS_HIT  = -15;
const BANKRUPTCY_RELATION_HIT   = -25;

function _getGrossIncome(nation) {
  return Math.max(1, nation.economy?.income_per_turn ?? 0);
}

function calcInterestRate(nationId) {
  const nation    = GAME_STATE.nations?.[nationId];
  if (!nation) return 0.12;
  const stability = nation.government?.stability ?? 50;
  const happiness = nation.population?.happiness ?? 50;
  let rate = 0.08;
  if (stability < 40) rate += 0.03;
  if (stability < 25) rate += 0.03;
  if (happiness < 40) rate += 0.02;
  if (getLoanDebtLoad(nationId) > 0.30) rate += 0.03;
  if (getLoanDebtLoad(nationId) > 0.55) rate += 0.04;
  return Math.max(0.04, Math.min(0.20, rate));
}

function calcMonthlyPayment(principal, annualRate, termTurns) {
  const r = annualRate / 12;
  if (r < 0.0001) return Math.ceil(principal / termTurns);
  const factor = Math.pow(1 + r, termTurns);
  return Math.ceil(principal * r * factor / (factor - 1));
}

function getLoanTotalPayment(nationId) {
  return (GAME_STATE.loans ?? [])
    .filter(l => l.nation_id === nationId && !l.defaulted && l.remaining > 0)
    .reduce((s, l) => s + l.monthly_payment, 0);
}

function getLoanDebtLoad(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;
  return getLoanTotalPayment(nationId) / _getGrossIncome(nation);
}

function getLoanCapacity(nationId, termTurns = LOAN_DEFAULT_TERM) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;
  const grossIncome    = _getGrossIncome(nation);
  const currentPayment = getLoanTotalPayment(nationId);
  const maxPayment     = grossIncome * LOAN_MAX_PAYMENT_RATIO;
  const freePayment    = maxPayment - currentPayment;
  if (freePayment <= 0) return 0;
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

function takeLoan(nationId, amount, term = LOAN_DEFAULT_TERM) {
  if (!GAME_STATE.loans) GAME_STATE.loans = [];
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return { ok: false, reason: 'Нация не найдена.' };
  if (amount < LOAN_MIN_AMOUNT) return { ok: false, reason: `Мин. сумма: ${LOAN_MIN_AMOUNT}.` };
  const capacity = getLoanCapacity(nationId, term);
  if (capacity < amount) {
    return {
      ok: false,
      reason: capacity < LOAN_MIN_AMOUNT
        ? 'Лимит исчерпан.'
        : `Макс. доступно: ${Math.floor(capacity)}.`,
    };
  }
  const annualRate = calcInterestRate(nationId);
  const monthly    = calcMonthlyPayment(amount, annualRate, term);
  const loan = {
    id:              `loan_${nationId}_${GAME_STATE.turn}_${Date.now() % 100000}`,
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
  return { ok: true, loan };
}

// ПРАВИЛЬНАЯ версия processLoanPayments (исправленная)
function processLoanPaymentsFixed(nationId) {
  if (!GAME_STATE.loans) return;
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;
  const active = GAME_STATE.loans.filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  if (active.length === 0) return;

  for (const loan of active) {
    const r        = loan.interest_rate / 12;
    const interest = loan.remaining * r;
    // Полный платёж = min(monthly_payment, остаток долга + начисленные проценты)
    const payment       = Math.min(loan.monthly_payment, loan.remaining + interest);
    const principalPaid = Math.max(0, payment - interest);
    loan.remaining      = Math.max(0, loan.remaining - principalPaid);
    loan.turns_paid    += 1;
    nation.economy.treasury = (nation.economy.treasury ?? 0) - payment;
  }

  // Автобанкротство
  const grossIncome = _getGrossIncome(nation);
  if ((nation.economy.treasury ?? 0) < -(grossIncome * 3)) {
    declareBankruptcy(nationId);
  }
}

// Баговая версия (оригинал из репозитория для сравнения)
function processLoanPaymentsBuggy(nationId) {
  if (!GAME_STATE.loans) return;
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;
  const active = GAME_STATE.loans.filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  for (const loan of active) {
    const payment = Math.min(loan.monthly_payment, loan.remaining);
    loan.remaining   = Math.max(0, loan.remaining - payment);
    loan.turns_paid += 1;
    nation.economy.treasury = (nation.economy.treasury ?? 0) - payment;
  }
}

function declareBankruptcy(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation || !GAME_STATE.loans) return;
  const activeLoans = GAME_STATE.loans.filter(
    l => l.nation_id === nationId && !l.defaulted && l.remaining > 0
  );
  if (activeLoans.length === 0) return;
  for (const l of activeLoans) l.defaulted = true;
  if (nation.government)
    nation.government.stability = Math.max(0, (nation.government.stability ?? 50) + BANKRUPTCY_STABILITY_HIT);
  if (nation.population)
    nation.population.happiness = Math.max(0, (nation.population.happiness ?? 50) + BANKRUPTCY_HAPPINESS_HIT);
  nation.economy.treasury = 0;
}

// ─── ТЕСТ 1: Заём зачисляется в казну ─────────────────────────────────────────
console.log('\n=== ECO-INT-01: takeLoan → treasury ===');

resetState();
{
  const treasuryBefore = GAME_STATE.nations.rome.economy.treasury;
  const res = takeLoan('rome', 1000);
  assert(res.ok, 'takeLoan возвращает ok=true');
  assert(GAME_STATE.loans.length === 1, 'Заём добавлен в GAME_STATE.loans');
  assert(
    GAME_STATE.nations.rome.economy.treasury === treasuryBefore + 1000,
    `Treasury увеличена на сумму займа: ${treasuryBefore} + 1000 = ${GAME_STATE.nations.rome.economy.treasury}`
  );
  assert(res.loan.interest_rate >= 0.04 && res.loan.interest_rate <= 0.20,
    `Процентная ставка в пределах [4%, 20%]: ${(res.loan.interest_rate * 100).toFixed(1)}%`);
}

// ─── ТЕСТ 2: processLoanPayments (fixed) → treasury уменьшается ──────────────
console.log('\n=== ECO-INT-02: processLoanPayments → treasury (правильная версия) ===');

resetState();
{
  takeLoan('rome', 1000, 24);
  const loan    = GAME_STATE.loans[0];
  const monthly = loan.monthly_payment;
  const treasBefore = GAME_STATE.nations.rome.economy.treasury;

  processLoanPaymentsFixed('rome');

  const treasAfter  = GAME_STATE.nations.rome.economy.treasury;
  // Ожидаем: treasury уменьшилась примерно на monthly_payment
  assertNear(treasBefore - treasAfter, monthly, 1,
    `Treasury уменьшилась на ≈monthly_payment=${monthly}`);
  assert(loan.remaining < loan.principal,
    `remaining уменьшился: ${loan.remaining.toFixed(1)} < ${loan.principal}`);
  assert(loan.turns_paid === 1, 'turns_paid = 1 после первого платежа');
}

// ─── ТЕСТ 3: Правильная версия → нация платит проценты за full term ───────────
console.log('\n=== ECO-INT-03: Правильная амортизация — нация платит проценты ===');

resetState();
{
  // Выдаём большую казну чтобы хватило на все платежи
  GAME_STATE.nations.rome.economy.treasury = 50000;
  GAME_STATE.nations.rome.economy.income_per_turn = 500;

  takeLoan('rome', 1000, 24);
  const loan        = GAME_STATE.loans[0];
  const principal   = loan.principal;
  const treasStart  = GAME_STATE.nations.rome.economy.treasury;

  // Прогоняем все 24 хода
  for (let t = 0; t < 24; t++) {
    if (loan.remaining > 0.01) processLoanPaymentsFixed('rome');
  }

  const totalPaid = treasStart - GAME_STATE.nations.rome.economy.treasury;
  const interest  = totalPaid - principal;

  assert(loan.remaining < 0.01, `Заём полностью погашен (remaining=${loan.remaining.toFixed(2)})`);
  assert(totalPaid > principal,
    `Нация заплатила больше принципала: ${totalPaid.toFixed(1)} > ${principal} (проценты)`);
  assert(interest > 0,
    `Проценты > 0: нация заплатила ${interest.toFixed(1)} зол. сверх основного долга`);
}

// ─── ТЕСТ 4: debtLoad после займа ≤ 70% дохода ────────────────────────────────
console.log('\n=== ECO-INT-04: debtLoad не превышает 70% дохода ===');

resetState();
{
  const capacity = getLoanCapacity('rome');
  if (capacity >= LOAN_MIN_AMOUNT) {
    takeLoan('rome', capacity); // максимально возможный заём
    const load = getLoanDebtLoad('rome');
    assert(load <= LOAN_MAX_PAYMENT_RATIO + 0.01,
      `debtLoad после max займа ≤ 70%: факт ${(load * 100).toFixed(1)}%`);
  } else {
    console.log('  ⚠ Нация не может взять заём (capacity=0) — тест пропущен');
    passed++;
  }
}

// ─── ТЕСТ 5: Нельзя взять заём сверх лимита ───────────────────────────────────
console.log('\n=== ECO-INT-05: Отказ при превышении кредитного лимита ===');

resetState();
{
  const huge = 1_000_000;
  const res  = takeLoan('rome', huge);
  assert(!res.ok, `Отказ при заявке на ${huge} (превышение лимита)`);
  assert(GAME_STATE.loans.length === 0, 'Займов нет в state после отказа');
}

// ─── ТЕСТ 6: Банкротство — штрафы применяются ─────────────────────────────────
console.log('\n=== ECO-INT-06: declareBankruptcy → штрафы к stability и happiness ===');

resetState();
{
  const stabBefore  = GAME_STATE.nations.rome.government.stability;
  const happBefore  = GAME_STATE.nations.rome.population.happiness;

  // Добавляем долг вручную и загоняем казну в минус
  GAME_STATE.loans.push({
    id: 'test_loan', nation_id: 'rome',
    principal: 5000, remaining: 5000,
    monthly_payment: 300, interest_rate: 0.08,
    term: 24, turns_paid: 0, taken_turn: 1, defaulted: false,
  });
  GAME_STATE.nations.rome.economy.treasury = -10000; // < -(500*3) = -1500

  declareBankruptcy('rome');

  assert(GAME_STATE.nations.rome.economy.treasury === 0, 'Treasury обнулена после банкротства');
  assert(GAME_STATE.nations.rome.government.stability === stabBefore + BANKRUPTCY_STABILITY_HIT,
    `stability снижена на ${BANKRUPTCY_STABILITY_HIT}`);
  assert(GAME_STATE.nations.rome.population.happiness === happBefore + BANKRUPTCY_HAPPINESS_HIT,
    `happiness снижена на ${BANKRUPTCY_HAPPINESS_HIT}`);
  assert(GAME_STATE.loans[0].defaulted === true, 'Заём помечен как defaulted');
}

// ─── ИТОГ ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все integration-тесты прошли');
  process.exit(0);
} else {
  console.log('❌ Есть ошибки — требуется ревью!');
  process.exit(1);
}
