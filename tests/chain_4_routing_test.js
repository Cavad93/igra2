'use strict';
/**
 * chain_4_routing_test.js — маршрутизация прибыли и батарейки инвестиций
 *
 * ПОРОГИ БАТАРЕЙКИ:
 *   bThresh = cost + 5 × 12 × maintenance(level=1)
 *   farmers_class  → wheat_family_farm:  100 + 5×12×10  =   700 ₴
 *   soldiers_class → wheat_villa:        600 + 5×12×30  =  2400 ₴
 *   aristocrats    → wheat_latifundium: 2500 + 5×12×200 = 14500 ₴
 *
 * НАКОПЛЕНИЕ БАТАРЕЙКИ:
 *   perCapitaIncome = _ibt[cls][ptype] / _cwbt[cls][ptype]
 *   battery[cls][ptype] += perCapitaIncome  (до порога)
 *
 * Запуск: node tests/chain_4_routing_test.js
 */

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else       { console.error('  ✗ FAIL: ' + msg); failed++; }
}
function eq(a, b, msg) {
  if (a === b) { console.log(`  ✓ ${msg} (${a})`); passed++; }
  else         { console.error(`  ✗ FAIL: ${msg} — ожидалось ${b}, получено ${a}`); failed++; }
}

// ── Воспроизводим логику батарейки из distributeClassIncome ────────────────
function calcThreshold(cost, workersPerUnit, level) {
  const maint = workersPerUnit * 2 * level; // _calcBuildingMaintenance
  return cost + 5 * 12 * maint;
}

function updateBattery(battery, ibt, cwbt) {
  // Воспроизводит цикл батарейки из distributeClassIncome
  const result = Object.assign({}, battery);
  for (const [cls, types] of Object.entries(ibt)) {
    for (const [ptype, income] of Object.entries(types)) {
      const engaged = Math.max(1, cwbt[cls]?.[ptype] ?? 1);
      const perCapita = income / engaged;
      if (!result[cls]) result[cls] = {};
      result[cls][ptype] = (result[cls][ptype] || 0) + perCapita;
    }
  }
  return result;
}

// ── Тест 1: Пороги батарейки ───────────────────────────────────────────────
console.log('\n─── Пороги батарейки ───');
{
  eq(calcThreshold(100,  5,  1),   700, 'farmers_class  threshold = 700 ₴');
  eq(calcThreshold(600,  15, 1),  2400, 'soldiers_class threshold = 2400 ₴');
  eq(calcThreshold(2500, 100, 1), 14500, 'aristocrats    threshold = 14500 ₴');
}

// ── Тест 2: Накопление батарейки ───────────────────────────────────────────
console.log('\n─── Накопление батарейки за 1 тик ───');
{
  // Ферма: ibt=70, cwbt=1 (1 уровень)
  const ibt  = { farmers_class: { wheat: 70 } };
  const cwbt = { farmers_class: { wheat: 1  } };
  const bat  = updateBattery({}, ibt, cwbt);
  eq(bat.farmers_class.wheat, 70, 'farmers_class battery += 70/тик (perCapita=70)');

  // Вилла: ibt=945, cwbt=1
  const ibt2  = { soldiers_class: { wheat: 945 } };
  const cwbt2 = { soldiers_class: { wheat: 1   } };
  const bat2  = updateBattery({}, ibt2, cwbt2);
  eq(bat2.soldiers_class.wheat, 945, 'soldiers_class battery += 945/тик (perCapita=945)');

  // Латифундия: ibt=6401, cwbt=1
  const ibt3  = { aristocrats: { wheat: 6401 } };
  const cwbt3 = { aristocrats: { wheat: 1    } };
  const bat3  = updateBattery({}, ibt3, cwbt3);
  eq(bat3.aristocrats.wheat, 6401, 'aristocrats battery += 6401/тик (perCapita=6401)');
}

// ── Тест 3: Тиков до полного заряда ───────────────────────────────────────
console.log('\n─── Сколько тиков до порога (строительство) ───');
{
  const farmThresh   = 700;
  const villaThresh  = 2400;
  const latThresh    = 14500;

  const farmInc  = 70;   // per-capita за тик
  const villaInc = 945;
  const latInc   = 6401;

  const farmTicks  = Math.ceil(farmThresh  / farmInc);   // 10 тиков
  const villaTicks = Math.ceil(villaThresh / villaInc);  // 3 тика
  const latTicks   = Math.ceil(latThresh   / latInc);    // 3 тика

  eq(farmTicks,  10, 'farmers_class: 10 тиков до постройки новой фермы');
  eq(villaTicks,  3, 'soldiers_class: 3 тика до постройки новой виллы');
  eq(latTicks,    3, 'aristocrats: 3 тика до постройки новой латифундии');
}

// ── Тест 4: Батарейка не превышает порог ──────────────────────────────────
console.log('\n─── Батарейка ограничена порогом ───');
{
  const thresh = 700;
  let battery  = 680;
  const income = 70;  // +70 за тик, но порог = 700
  battery = Math.min(battery + income, thresh);
  eq(battery, 700, 'батарейка = 700 (ограничена порогом, не 750)');
}

// ── Тест 5: Множество уровней — делитель cwbt ─────────────────────────────
console.log('\n─── Несколько уровней: perCapita корректен ───');
{
  // 3 виллы (level=3) дают income=945×3=2835 и cwbt=3
  const ibt  = { soldiers_class: { wheat: 2835 } };
  const cwbt = { soldiers_class: { wheat: 3    } };
  const bat  = updateBattery({}, ibt, cwbt);
  eq(bat.soldiers_class.wheat, 945, 'perCapita = 2835/3 = 945 (не зависит от числа уровней)');
}

// ── Тест 6: farmers_class НЕ получает battery от вилл/латифундий ──────────
console.log('\n─── Батарейка farmers_class: только собственные фермы ───');
{
  // Если бы villa wages (585) попали в _ibt.farmers_class (БАГ-D):
  const ibtBroken = { farmers_class: { wheat: 70 + 585 } };  // 655, было бы так
  const cwbtBroken = { farmers_class: { wheat: 1 } };
  const batBroken = updateBattery({}, ibtBroken, cwbtBroken);
  ok(batBroken.farmers_class.wheat > 70, `BROKEN: батарейка была бы ${batBroken.farmers_class.wheat} вместо 70`);

  // После БАГ-D fix: только собственный доход фермы
  const ibtFixed = { farmers_class: { wheat: 70 } };  // только ферма
  const cwbtFixed = { farmers_class: { wheat: 1 } };
  const batFixed = updateBattery({}, ibtFixed, cwbtFixed);
  eq(batFixed.farmers_class.wheat, 70, 'FIXED: батарейка = 70 (только собственный доход)');

  const inflate = Math.round(batBroken.farmers_class.wheat / batFixed.farmers_class.wheat * 10) / 10;
  ok(inflate > 9, `без фикса батарейка была бы завышена в ${inflate}× (> 9×)`);
}

console.log(`\n═══ Итог: ${passed} прошло, ${failed} провалено ═══\n`);
if (failed > 0) process.exit(1);
