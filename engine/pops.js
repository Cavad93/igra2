// ═══════════════════════════════════════════════════════════════════════════
// СИСТЕМА POP (Population Groups) — Этап 6
//
// Каждая нация имеет страты (POPs) по профессиям.
// Структура: nation.population.pops = { profession: { wealth, satisfied, income_last } }
//
// Богатство (wealth 0–100) зависит от:
//   - адекватности зарплаты (income_adequacy из _wage_bonuses)
//   - удовлетворённости корзины потребления (satisfied)
//
// Корзина потребления (per 1000 человек per тик) — плавная интерполяция:
//   бедные (0–30):   grain 0.8
//   средние (31–60): grain 0.6, wood 0.1, tools 0.05
//   богатые (61–100): grain 0.4, tools 0.1, wine 0.2
//   Каждый уровень включает потребности предыдущего (нет резкого скачка).
//
// satisfied → production_eff через slot._pop_eff:
//   _pop_eff = lerp(0.7, 1.0, avg_satisfied_workers)
// ═══════════════════════════════════════════════════════════════════════════

// Начальное богатство по профессии (0–100)
const POP_INITIAL_WEALTH = {
  farmers:   15,
  craftsmen: 45,
  merchants: 65,
  sailors:   38,
  clergy:    55,
  soldiers:  35,
  slaves:     5,
};

// Скорость изменения богатства: wealth += delta / POP_WEALTH_INERTIA
const POP_WEALTH_INERTIA = 20;

// ──────────────────────────────────────────────────────────────
// 1. ИНИЦИАЛИЗАЦИЯ — ensureNationPops(nationId)
//    Лениво создаёт nation.population.pops если ещё нет.
// ──────────────────────────────────────────────────────────────

function ensureNationPops(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.population) return;

  const byProf = nation.population.by_profession || {};

  if (!nation.population.pops) {
    const pops = {};
    for (const prof of Object.keys(byProf)) {
      pops[prof] = {
        wealth:      POP_INITIAL_WEALTH[prof] ?? 25,
        satisfied:   0.75,
        income_last: 0,
      };
    }
    nation.population.pops = pops;
    return;
  }

  // Добавляем отсутствующие профессии (если появились позже)
  for (const prof of Object.keys(byProf)) {
    if (!nation.population.pops[prof]) {
      nation.population.pops[prof] = {
        wealth:      POP_INITIAL_WEALTH[prof] ?? 25,
        satisfied:   0.75,
        income_last: 0,
      };
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 2. КОРЗИНА ПОТРЕБЛЕНИЯ — getConsumptionBasket(wealth)
//    Возвращает { good: units_per_1000_people_per_tick }
//    Плавно интерполирует между тремя уровнями богатства.
// ──────────────────────────────────────────────────────────────

function getConsumptionBasket(wealth) {
  const w = Math.max(0, Math.min(100, wealth));

  // Зерно (wheat): 0.8 (бедные) → 0.6 (средние) → 0.4 (богатые)
  let grain;
  if (w <= 30)      grain = 0.8;
  else if (w <= 60) grain = 0.8 + (w - 30) / 30 * (0.6 - 0.8);
  else              grain = 0.6 + (w - 60) / 40 * (0.4 - 0.6);

  const basket = { wheat: Math.round(grain * 1000) / 1000 };

  // Древесина (timber/wood): 0 → 0.10 (появляется у средних, 31+)
  if (w > 30) {
    basket.timber = Math.min(0.10, (w - 30) / 30 * 0.10);
    basket.timber = Math.round(basket.timber * 1000) / 1000;
  }

  // Инструменты (tools): 0 → 0.05 (средние) → 0.10 (богатые)
  if (w > 30) {
    const tMid  = Math.min(0.05, (w - 30) / 30 * 0.05);
    const tRich = w > 60 ? (w - 60) / 40 * 0.05 : 0;
    basket.tools = Math.round((tMid + tRich) * 1000) / 1000;
    if (basket.tools < 0.001) delete basket.tools;
  }

  // Вино (wine): 0 → 0.20 (только богатые, 61+)
  if (w > 60) {
    basket.wine = Math.round((w - 60) / 40 * 0.20 * 1000) / 1000;
    if (basket.wine < 0.001) delete basket.wine;
  }

  return basket;
}

// ──────────────────────────────────────────────────────────────
// 3. СУММАРНЫЙ СПРОС НАЦИИ — calcNationBasketDemand(nation)
//    Заменяет calculateConsumption как предпочтительный путь.
//    Возвращает { good: total_units_per_tick } или null если нет pops.
// ──────────────────────────────────────────────────────────────

function calcNationBasketDemand(nation) {
  const pops = nation.population?.pops;
  if (!pops) return null;

  const result = {};
  for (const [prof, pop] of Object.entries(pops)) {
    const size   = (nation.population.by_profession[prof] || 0) / 1000;  // тыс. чел.
    const basket = getConsumptionBasket(pop.wealth);
    for (const [good, amt] of Object.entries(basket)) {
      result[good] = (result[good] || 0) + amt * size;
    }
  }
  return result;
}

// ──────────────────────────────────────────────────────────────
// 4. ОБНОВЛЕНИЕ УДОВЛЕТВОРЁННОСТИ — updatePopSatisfied(nationId, demanded, actualConsumed)
//
//   demanded:       { good: units } — что было затребовано корзиной
//   actualConsumed: { good: units } — что было реально доступно (min(demanded, stockpile))
//
//   satisfied = взвешенное среднее ratio[good] по корзине профессии
//   ratio[good] = min(1, actual / demanded)
// ──────────────────────────────────────────────────────────────

function updatePopSatisfied(nationId, demanded, actualConsumed) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  ensureNationPops(nationId);
  const pops = nation.population.pops;

  // Доля удовлетворения по каждому товару
  const goodRatio = {};
  for (const [good, dem] of Object.entries(demanded)) {
    const actual      = actualConsumed[good] ?? 0;
    goodRatio[good]   = dem > 0 ? Math.min(1.0, actual / dem) : 1.0;
  }

  for (const [prof, pop] of Object.entries(pops)) {
    const basket      = getConsumptionBasket(pop.wealth);
    let weightedSum   = 0;
    let weightTotal   = 0;

    for (const [good, amt] of Object.entries(basket)) {
      const ratio   = goodRatio[good] ?? 1.0;
      weightedSum  += ratio * amt;
      weightTotal  += amt;
    }

    pop.satisfied = weightTotal > 0
      ? Math.max(0, Math.min(1, weightedSum / weightTotal))
      : 1.0;
  }
}

// ──────────────────────────────────────────────────────────────
// 5. ОБНОВЛЕНИЕ БОГАТСТВА — updatePopWealth(nationId)
//
// Нормализованная формула (избегает масштабного несоответствия):
//
//   incomeAdequacy  = (_wage_bonuses[prof] + 15) / 35   → 0..1
//   priceRatio      = basket_cost_now / basket_cost_at_base_prices → ≥0
//   score           = (incomeAdequacy / priceRatio) * 0.5
//                   + pop.satisfied * 0.5
//   wealthTarget    = score * 100
//   wealth         += (wealthTarget − wealth) / POP_WEALTH_INERTIA
//
// Эквивалент спека:
//   income↑ → incomeAdequacy↑ → wealth↑
//   prices↑ → priceRatio↑    → wealth↓
//   satisfied↑               → wealth↑
// ──────────────────────────────────────────────────────────────

function updatePopWealth(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  ensureNationPops(nationId);
  const pops      = nation.population.pops;
  const wageBonus = nation.population._wage_bonuses || {};

  for (const [prof, pop] of Object.entries(pops)) {
    const popSize = nation.population.by_profession[prof] || 0;
    if (popSize === 0) continue;

    // 1. Доходы: нормализованный wage bonus → 0..1
    //    -15 → 0.0 (нет зарплаты), 0 → 0.43 (норма), +20 → 1.0 (щедро)
    const bonus          = wageBonus[prof] ?? 0;
    const incomeAdequacy = Math.max(0, Math.min(1, (bonus + 15) / 35));

    // 2. Ценовое давление на корзину (current / base)
    const basket = getConsumptionBasket(pop.wealth);
    let costNow = 0, costBase = 0;
    for (const [good, amt] of Object.entries(basket)) {
      const pNow  = GAME_STATE.market?.[good]?.price ?? GOODS?.[good]?.base_price ?? 0;
      const pBase = GOODS?.[good]?.base_price ?? pNow;
      costNow  += amt * pNow;
      costBase += amt * pBase;
    }
    const priceRatio = costBase > 0 ? Math.min(2.0, costNow / costBase) : 1.0;

    // 3. Итоговый score: 0.0 (нищета) … 0.5 (норма) … 1.0 (процветание)
    const satisfiedScore = pop.satisfied ?? 0.75;
    const score = (incomeAdequacy / Math.max(priceRatio, 0.5)) * 0.5
                + satisfiedScore * 0.5;

    // 4. Богатство медленно стремится к цели
    const wealthTarget = score * 100;
    const delta        = (wealthTarget - pop.wealth) / POP_WEALTH_INERTIA;
    pop.wealth         = Math.max(0, Math.min(100, pop.wealth + delta));

    // 5. income_last (приблизительный доход группы за тик)
    const expectedWages  = popSize * 0.5;          // EXPECTED_WAGE_PER_WORKER * size
    pop.income_last      = Math.round(incomeAdequacy * expectedWages * 10) / 10;
  }
}

// ──────────────────────────────────────────────────────────────
// 6. ПРИМЕНЕНИЕ К ЗДАНИЯМ — applyPopSatisfiedToBuildings(nationId)
//
//   Для каждого активного слота:
//     avgSat = взвешенное среднее pop.satisfied рабочих
//     slot._pop_eff = lerp(0.7, 1.0, avgSat)
//
//   Вызывается ДО calculateProduction (в turn.js),
//   чтобы это влияло на выход текущего тика.
// ──────────────────────────────────────────────────────────────

function applyPopSatisfiedToBuildings(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const pops = nation.population.pops;

  for (const rid of (nation.regions || [])) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') {
        slot._pop_eff = 1.0;
        continue;
      }

      if (!pops) {
        slot._pop_eff = 1.0;
        continue;
      }

      const workers      = slot.workers || {};
      const totalWorkers = Object.values(workers).reduce((s, c) => s + c, 0);

      if (totalWorkers === 0) {
        slot._pop_eff = 1.0;
        continue;
      }

      // Взвешенная удовлетворённость по профессиям здания
      let weightedSat = 0;
      let totalWeight = 0;
      for (const [prof, count] of Object.entries(workers)) {
        const satisfied  = pops[prof]?.satisfied ?? 0.75;
        weightedSat     += satisfied * count;
        totalWeight     += count;
      }
      const avgSat = totalWeight > 0 ? weightedSat / totalWeight : 0.75;

      // lerp(0.7, 1.0, avgSat): 0% сат → 0.70, 100% → 1.00
      slot._pop_eff = 0.7 + 0.3 * Math.max(0, Math.min(1, avgSat));
    }
  }
}
