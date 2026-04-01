'use strict';
/**
 * tests/audit/eco_unit_test.js
 *
 * UNIT-тесты модуля Экономика (Итерация 1, Аудит)
 * Проверяет изолированные функции без зависимостей от GAME_STATE.
 *
 * Запуск: node tests/audit/eco_unit_test.js
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
    console.log(`  ✓ ${msg} (${a.toFixed(4)} ≈ ${b.toFixed(4)})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg} — got ${a.toFixed(4)}, expected ≈ ${b.toFixed(4)} (±${eps})`);
    failed++;
  }
}

// ─── Копии функций из engine/loans.js для изолированного тестирования ─────────

function calcMonthlyPayment(principal, annualRate, termTurns) {
  const r = annualRate / 12;
  if (r < 0.0001) return Math.ceil(principal / termTurns);
  const factor = Math.pow(1 + r, termTurns);
  return Math.ceil(principal * r * factor / (factor - 1));
}

/**
 * Правильная амортизация: каждый ход считается процент на остаток,
 * из платежа вычитается только основной долг.
 * Возвращает { turnsToPayOff, totalPaid, effectiveAnnualRate }
 */
function simulateLoanRepaymentCorrect(principal, annualRate, termTurns) {
  const r = annualRate / 12;
  const monthly = calcMonthlyPayment(principal, annualRate, termTurns);
  let remaining = principal;
  let totalPaid = 0;
  let turn = 0;

  while (remaining > 0.01 && turn < termTurns + 5) {
    const interest = remaining * r;
    const payment  = Math.min(monthly, remaining + interest);
    const principalPaid = Math.max(0, payment - interest);
    remaining = Math.max(0, remaining - principalPaid);
    totalPaid += payment;
    turn++;
  }
  return { turnsToPayOff: turn, totalPaid, interestPaid: totalPaid - principal };
}

/**
 * Старая (баговая) амортизация: вычитает полный платёж из remaining.
 */
function simulateLoanRepaymentBuggy(principal, annualRate, termTurns) {
  const monthly = calcMonthlyPayment(principal, annualRate, termTurns);
  let remaining = principal;
  let totalPaid = 0;
  let turn = 0;

  while (remaining > 0 && turn < termTurns + 5) {
    const payment = Math.min(monthly, remaining);
    remaining = Math.max(0, remaining - payment);
    totalPaid += payment;
    turn++;
  }
  return { turnsToPayOff: turn, totalPaid, interestPaid: totalPaid - principal };
}

// ─── ТЕСТ 1: calcMonthlyPayment — аннуитетная формула ─────────────────────────
console.log('\n=== ECO-UNIT-01: calcMonthlyPayment (аннуитет) ===');

{
  // Известный расчёт: 1000 @ 8%/год на 24 мес.
  // Ожидаемый платёж ≈ 45.23, ceil = 46
  const p = calcMonthlyPayment(1000, 0.08, 24);
  assert(p === 46, 'calcMonthlyPayment(1000, 8%, 24мес) = 46');

  // При нулевой ставке — простое деление
  const pZero = calcMonthlyPayment(1200, 0, 12);
  assert(pZero === 100, 'При нулевой ставке платёж = principal / term = 100');

  // Более высокая ставка → бо́льший платёж
  const pHigh = calcMonthlyPayment(1000, 0.20, 24);
  const pLow  = calcMonthlyPayment(1000, 0.04, 24);
  assert(pHigh > pLow, 'Более высокая ставка → бо́льший ежемесячный платёж');

  // Более длинный срок → меньший платёж
  const pShort = calcMonthlyPayment(1000, 0.08, 12);
  const pLong  = calcMonthlyPayment(1000, 0.08, 36);
  assert(pShort > pLong, 'Более длинный срок → меньший ежемесячный платёж');
}

// ─── ТЕСТ 2: Корректная амортизация гасит за term ходов ───────────────────────
console.log('\n=== ECO-UNIT-02: Правильная амортизация — срок и проценты ===');

{
  const res = simulateLoanRepaymentCorrect(1000, 0.08, 24);
  assert(res.turnsToPayOff <= 24, `Заём погашен за ≤24 хода (факт: ${res.turnsToPayOff})`);
  assert(res.interestPaid > 0, `Нация платит проценты (факт: +${res.interestPaid.toFixed(1)} зол.)`);
  // При 8% годовых на 24 месяца: payment=46, итого ~24*46 - часть последнего платежа ≈ 84 зол.
  // (ceil округляет payment вверх, поэтому немного больше теоретического минимума)
  assertNear(res.interestPaid, 84, 30, 'Итоговые проценты ≈ 84 зол. (±30)');
}

// ─── ТЕСТ 3: Баговая амортизация — ноль процентов ─────────────────────────────
console.log('\n=== ECO-UNIT-03: Баговая амортизация (фиксируем регрессию) ===');

{
  const res = simulateLoanRepaymentBuggy(1000, 0.08, 24);
  // БАГ: нация платит лишь principal (нет процентов), гасит до срока
  assert(res.turnsToPayOff < 24,
    `[BUG-документирован] Баговый код гасит за ${res.turnsToPayOff} ходов вместо 24`);
  assert(Math.abs(res.interestPaid) < 5,
    `[BUG-документирован] Эффективный процент ≈ 0 (факт: ${res.interestPaid.toFixed(1)} зол.)`);
}

// ─── ТЕСТ 4: Трёхзонная рыночная логика (market.js) ───────────────────────────
console.log('\n=== ECO-UNIT-04: Трёхзонная логика updateMarketPrices ===');

{
  const _MARKET_SMOOTHING  = 0.30;
  const _BALANCE_SENS      = 0.05;
  const _SURPLUS_RATE      = 0.03;
  const _DEFICIT_INTENSITY = 0.10;

  function simulateMarketZone(stockpile, stockpileTarget, supply, demand, price, base, streak = 0) {
    let price_delta = 0;
    let newStreak = streak;

    if (stockpile < 0.5 * stockpileTarget) {
      const shortage_mult = Math.exp(streak * 0.15);
      price_delta = base * shortage_mult * _DEFICIT_INTENSITY;
      newStreak = Math.min(streak + 1, 8);
    } else if (stockpile <= 2.0 * stockpileTarget) {
      const safeSupply = Math.max(supply, 1);
      price_delta = (demand - safeSupply) / safeSupply * _BALANCE_SENS * price;
      newStreak = Math.max(0, streak - 1);
    } else {
      const surplus_ratio = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
      price_delta = -base * _SURPLUS_RATE * surplus_ratio;
      newStreak = Math.max(0, streak - 1);
    }

    const rawNew   = price + price_delta;
    const clamped  = Math.max(base * 0.5, Math.min(base * 10, rawNew));
    const newPrice = price + (clamped - price) * _MARKET_SMOOTHING;
    return { newPrice: Math.round(newPrice * 10) / 10, streak: newStreak };
  }

  // Зона дефицита → цена растёт
  const def = simulateMarketZone(10, 100, 5, 20, 10, 10);
  assert(def.newPrice > 10, `Дефицит → цена растёт (${def.newPrice} > 10)`);
  assert(def.streak === 1,  `Дефицит → shortage_streak увеличивается`);

  // Зона избытка → цена падает
  const surp = simulateMarketZone(500, 100, 100, 20, 10, 10);
  assert(surp.newPrice < 10, `Избыток → цена падает (${surp.newPrice} < 10)`);

  // Зона баланса при supply = demand → цена стабильна
  const bal = simulateMarketZone(100, 100, 50, 50, 10, 10);
  assertNear(bal.newPrice, 10, 0.5, 'Баланс при supply=demand → цена стабильна');

  // Сглаживание: за 1 тик изменение ≤ 30% от delta
  const bigDef = simulateMarketZone(0, 100, 0, 100, 10, 10);
  const maxDelta = (10 * 10 - 10) * _MARKET_SMOOTHING + 10; // worst case
  assert(bigDef.newPrice <= maxDelta,
    `Сглаживание: цена не прыгает более чем на 30% delta за тик`);

  // Нижняя граница: цена не падает ниже base×0.5
  const floor = simulateMarketZone(10000, 100, 10000, 1, 6, 10);
  assert(floor.newPrice >= 5, `Нижняя граница: цена ≥ base×0.5 = 5 (факт: ${floor.newPrice})`);
}

// ─── ТЕСТ 5: getBuildingBonuses — накопление бонусов ──────────────────────────
console.log('\n=== ECO-UNIT-05: getBuildingBonuses ===');

{
  const BUILDING_BONUSES = {
    'порт':       { port_bonus: 80,  production_mult: 1.05 },
    'агора':      { tax_mult: 1.10,  happiness_bonus: 3    },
    'мастерская': { production_mult: 1.20 },
    'акведук':    { happiness_bonus: 4 },
  };

  function getBuildingBonusesMock(buildings) {
    const bonuses = { production_mult: 1.0, tax_mult: 1.0, port_bonus: 0, happiness_bonus: 0 };
    for (const building of buildings) {
      const name = String(building).toLowerCase();
      for (const [key, bonus] of Object.entries(BUILDING_BONUSES)) {
        if (name.includes(key)) {
          bonuses.production_mult *= (bonus.production_mult ?? 1);
          bonuses.tax_mult        *= (bonus.tax_mult        ?? 1);
          bonuses.port_bonus      += (bonus.port_bonus      ?? 0);
          bonuses.happiness_bonus += (bonus.happiness_bonus ?? 0);
        }
      }
    }
    return bonuses;
  }

  const b1 = getBuildingBonusesMock(['Большой порт', 'Агора']);
  assertNear(b1.production_mult, 1.05, 0.001, 'Порт даёт production_mult=1.05');
  assert(b1.port_bonus === 80,  'Порт даёт port_bonus=80');
  assertNear(b1.tax_mult, 1.10, 0.001, 'Агора даёт tax_mult=1.10');

  const b2 = getBuildingBonusesMock(['Мастерская', 'Мастерская']);
  assertNear(b2.production_mult, 1.20 * 1.20, 0.001,
    'Две мастерских: production_mult перемножается = 1.44');

  const b3 = getBuildingBonusesMock([]);
  assert(b3.production_mult === 1.0 && b3.tax_mult === 1.0 && b3.port_bonus === 0,
    'Нет зданий → дефолтные значения');
}

// ─── ИТОГ ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log(`Итог: ${passed} прошли, ${failed} провалились`);
if (failed === 0) {
  console.log('✅ Все unit-тесты прошли');
  process.exit(0);
} else {
  console.log('❌ Есть ошибки — требуется ревью!');
  process.exit(1);
}
