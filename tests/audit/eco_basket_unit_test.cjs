/**
 * tests/audit/eco_basket_unit_test.cjs
 *
 * Модуль: Экономика — корзина потребления (pops.js)
 * Тип: Unit-тест
 * Цель: проверка getConsumptionBasket и тарифной логики _getEffectiveTariffRate
 *
 * Дополняет eco_unit_test.js (займы/рынок) — фокус на wealth-зависимом потреблении.
 *
 * Запуск: node tests/audit/eco_basket_unit_test.cjs
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function assertClose(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, msg, `got=${a.toFixed(4)}, expected≈${b.toFixed(4)}`);
}

// ─── Логика из engine/pops.js ─────────────────────────────────────────────────

function getConsumptionBasket(wealth) {
  const w = Math.max(0, Math.min(100, wealth));
  let grain;
  if (w <= 30)      grain = 0.8;
  else if (w <= 60) grain = 0.8 + (w - 30) / 30 * (0.6 - 0.8);
  else              grain = 0.6 + (w - 60) / 40 * (0.4 - 0.6);
  const basket = { wheat: Math.round(grain * 1000) / 1000 };
  if (w > 30) {
    basket.timber = Math.min(0.10, (w - 30) / 30 * 0.10);
    basket.timber = Math.round(basket.timber * 1000) / 1000;
  }
  if (w > 30) {
    const tMid  = Math.min(0.05, (w - 30) / 30 * 0.05);
    const tRich = w > 60 ? (w - 60) / 40 * 0.05 : 0;
    basket.tools = Math.round((tMid + tRich) * 1000) / 1000;
    if (basket.tools < 0.001) delete basket.tools;
  }
  if (w > 60) {
    basket.wine = Math.round((w - 60) / 40 * 0.20 * 1000) / 1000;
    if (basket.wine < 0.001) delete basket.wine;
  }
  return basket;
}

// ─── TEST 1: граничные значения ───────────────────────────────────────────────
console.log('\n=== TEST 1: getConsumptionBasket — граничные значения ===');
{
  const b0 = getConsumptionBasket(0);
  assert(b0.wheat === 0.8, 'w=0: wheat=0.8');
  assert(!b0.timber,       'w=0: нет timber');
  assert(!b0.wine,         'w=0: нет wine');

  const b30 = getConsumptionBasket(30);
  assert(b30.wheat === 0.8, 'w=30 (граница бедных): wheat=0.8');
  assert(!b30.timber,       'w=30: нет timber (граница не включена)');

  const b60 = getConsumptionBasket(60);
  assertClose(b60.wheat,  0.6,  0.001, 'w=60: wheat≈0.6');
  assertClose(b60.timber, 0.10, 0.001, 'w=60: timber≈0.10');
  assertClose(b60.tools,  0.05, 0.001, 'w=60: tools≈0.05');
  assert(!b60.wine,             'w=60: нет wine (граница не включена)');

  const b100 = getConsumptionBasket(100);
  assertClose(b100.wheat,  0.4,  0.001, 'w=100: wheat≈0.4');
  assertClose(b100.timber, 0.10, 0.001, 'w=100: timber≈0.10');
  assertClose(b100.tools,  0.10, 0.001, 'w=100: tools≈0.10');
  assertClose(b100.wine,   0.20, 0.001, 'w=100: wine≈0.20');
}

// ─── TEST 2: монотонность wheat ───────────────────────────────────────────────
console.log('\n=== TEST 2: монотонность wheat w=0..100 ===');
{
  let prev = getConsumptionBasket(0).wheat;
  let monotone = true;
  for (let w = 1; w <= 100; w++) {
    const cur = getConsumptionBasket(w).wheat;
    if (cur > prev + 0.001) { monotone = false; break; }
    prev = cur;
  }
  assert(monotone, 'wheat монотонно убывает с ростом wealth');
}

// ─── TEST 3: клампинг за пределами 0–100 ─────────────────────────────────────
console.log('\n=== TEST 3: клампинг ===');
{
  assert(getConsumptionBasket(-10).wheat === getConsumptionBasket(0).wheat,   'w=-10 → как w=0');
  assert(getConsumptionBasket(150).wheat === getConsumptionBasket(100).wheat, 'w=150 → как w=100');
}

// ─── TEST 4: тарифная ставка ──────────────────────────────────────────────────
console.log('\n=== TEST 4: _getEffectiveTariffRate ===');
{
  function computeTariffByScore(score) {
    return Math.max(0.05, Math.min(0.35, 0.20 - (score / 100) * 0.15));
  }
  assertClose(computeTariffByScore(-100), 0.35, 0.001, 'score=-100 → 35%');
  assertClose(computeTariffByScore(0),    0.20, 0.001, 'score=0 → 20%');
  assertClose(computeTariffByScore(100),  0.05, 0.001, 'score=+100 → 5%');
  assert(computeTariffByScore(-200) === 0.35, 'score=-200 → clamp 0.35');
  assert(computeTariffByScore(200)  === 0.05, 'score=+200 → clamp 0.05');
}

// ─── Итог ────────────────────────────────────────────────────────────────────
console.log(`\n─── Итог: ${passed} passed, ${failed} failed ───`);
if (failed > 0) process.exit(1);
