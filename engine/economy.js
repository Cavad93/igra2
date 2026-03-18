// Экономический движок — чистая математика, без AI
// Порядок вызова строго определён в turn.js

// ──────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────

// Изменить значение в GameState по пути (dotted notation)
function applyDelta(path, value) {
  const keys = path.split('.');
  let obj = GAME_STATE;

  for (let i = 0; i < keys.length - 1; i++) {
    if (obj[keys[i]] === undefined) {
      console.warn(`applyDelta: путь не найден: ${path}`);
      return;
    }
    obj = obj[keys[i]];
  }

  const lastKey = keys[keys.length - 1];
  const oldValue = obj[lastKey];
  obj[lastKey] = value;

  // Пишем в лог только значимые изменения
  if (typeof value === 'number' && Math.abs(value - oldValue) > 0.01) {
    const diff = value - oldValue;
    const sign = diff > 0 ? '+' : '';
    // console.debug(`[Delta] ${path}: ${oldValue} → ${value} (${sign}${diff.toFixed(1)})`);
  }
}

// Получить значение из GameState по пути
function getState(path) {
  return path.split('.').reduce((obj, key) => obj && obj[key], GAME_STATE);
}

// ──────────────────────────────────────────────────────────────
// БОНУСЫ ЗДАНИЙ
// Возвращает объект { production_mult, tax_mult, port_bonus,
//                     happiness_bonus } для нации.
// production_mult: множитель к производству всей нации
// tax_mult:        множитель к налоговым доходам
// port_bonus:      доп. золото от портов
// happiness_bonus: прибавка к счастью за ход
// ──────────────────────────────────────────────────────────────

const BUILDING_BONUSES = {
  // ключ — подстрока в названии здания (нижний регистр)
  'порт':        { port_bonus: 80,  production_mult: 1.05 },
  'port':        { port_bonus: 80,  production_mult: 1.05 },
  'агора':       { tax_mult: 1.10,  happiness_bonus: 3    },
  'agora':       { tax_mult: 1.10,  happiness_bonus: 3    },
  'forum':       { tax_mult: 1.10,  happiness_bonus: 3    },
  'форум':       { tax_mult: 1.10,  happiness_bonus: 3    },
  'мастерская':  { production_mult: 1.20 },
  'workshop':    { production_mult: 1.20 },
  'акведук':     { happiness_bonus: 4    },
  'aqueduct':    { happiness_bonus: 4    },
  'храм':        { happiness_bonus: 5,  tax_mult: 1.05 },
  'temple':      { happiness_bonus: 5,  tax_mult: 1.05 },
  'ипподром':    { happiness_bonus: 7    },
  'hippodrome':  { happiness_bonus: 7    },
  'склад':       { production_mult: 1.08 },
  'warehouse':   { production_mult: 1.08 },
  'арсенал':     { production_mult: 1.05 },
  'arsenal':     { production_mult: 1.05 },
};

function getBuildingBonuses(nationId) {
  const nation  = GAME_STATE.nations[nationId];
  const bonuses = { production_mult: 1.0, tax_mult: 1.0, port_bonus: 0, happiness_bonus: 0 };

  for (const regionId of (nation?.regions ?? [])) {
    const region = GAME_STATE.regions[regionId];
    if (!region?.buildings) continue;
    for (const building of region.buildings) {
      const name = String(building).toLowerCase();
      for (const [key, bonus] of Object.entries(BUILDING_BONUSES)) {
        if (name.includes(key)) {
          bonuses.production_mult += (bonus.production_mult ?? 1) - 1;
          bonuses.tax_mult        += (bonus.tax_mult        ?? 1) - 1;
          bonuses.port_bonus      += (bonus.port_bonus      ?? 0);
          bonuses.happiness_bonus += (bonus.happiness_bonus ?? 0);
        }
      }
    }
  }

  return bonuses;
}

// ──────────────────────────────────────────────────────────────
// ШАГ 1: ПРОИЗВОДСТВО
// Гибридная модель:
//   A) Организованное — суммируется из building_slots регионов игрока.
//   B) Неорганизованное — базовое REGION_PRODUCTION_BASE для рабочих,
//      не занятых в зданиях (эффективность 65% от организованного).
//
// Для AI-наций применяется только схема B (у них нет building_slots).
// ──────────────────────────────────────────────────────────────

function calculateProduction() {
  const produced = {};  // { nation: { good: amount } }

  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    produced[nationId] = {};
    const bldBonuses = getBuildingBonuses(nationId);

    // ── A) Производство из зданий (только для наций с building_slots) ──────
    if (typeof calculateAllBuildingProduction === 'function') {
      const bldProd = calculateAllBuildingProduction(nationId);
      for (const [good, amount] of Object.entries(bldProd)) {
        produced[nationId][good] = (produced[nationId][good] || 0) + amount;
      }
    }

    // ── B) Неорганизованное производство ────────────────────────────────────
    // Рабочие, не занятые в зданиях, работают на себя с пониженной отдачей.
    // SUBSISTENCE_FACTOR = 0.65: неорганизованные менее эффективны, чем здания.
    const SUBSISTENCE_FACTOR = 0.65;

    for (const regionId of nation.regions) {
      const region  = GAME_STATE.regions[regionId];
      if (!region) continue;

      const terrain      = region.terrain || 'plains';
      const multipliers  = CONFIG.BALANCE.TERRAIN_MULTIPLIERS?.[terrain]
                        || CONFIG.BALANCE.TERRAIN_MULTIPLIERS?.plains || {};
      const fertility    = region.fertility || 0.7;
      const classMod     = nation.population._production_mod ?? 1;

      // Доля региона в общем населении нации
      const nationPop       = nation.population.total;
      const regionShareRaw  = nationPop > 0 ? region.population / nationPop : 0;

      // Занятость в зданиях этого региона
      const employment  = region.employment || {};

      const regionProduction = REGION_PRODUCTION_BASE[terrain] || {};

      for (const [good, spec] of Object.entries(regionProduction)) {
        const professionPop = nation.population.by_profession[spec.per] || 0;
        const localWorkers  = professionPop * regionShareRaw;

        // Сколько из local workers уже задействованы в организованных зданиях.
        // employment[prof] — АКТУАЛЬНОЕ число занятых в зданиях ЭТОГО региона.
        // Вычитаем напрямую из оценочного localWorkers (без повторного умножения на share).
        const employedOfProf = employment[spec.per] || 0;

        // Неорганизованные рабочие = свободные от зданий (min 0)
        const freeWorkers = Math.max(0, localWorkers - employedOfProf);

        const terrainMult = multipliers[spec.per] || 1.0;
        const dem      = nation.demographics;
        const laborMod = dem?.labor_productivity_mod ?? 1.0;
        const amount = (freeWorkers / 1000) * spec.rate * terrainMult * fertility
                     * bldBonuses.production_mult * classMod * SUBSISTENCE_FACTOR * laborMod;

        if (amount > 0) {
          produced[nationId][good] = (produced[nationId][good] || 0) + amount;
        }
      }
    }
  }

  return produced;
}

// ──────────────────────────────────────────────────────────────
// ШАГ 2: ПОТРЕБЛЕНИЕ (классовая модель)
// ──────────────────────────────────────────────────────────────

function calculateConsumption(nation) {
  let result;

  // Используем классовую модель если доступны SOCIAL_CLASSES
  if (typeof calculateTotalConsumptionByClass === 'function') {
    result = calculateTotalConsumptionByClass(nation.population.by_profession);
  } else {
    // Запасной вариант — старая плоская модель
    const pop   = nation.population.total;
    const profs = nation.population.by_profession;
    result = {
      wheat: pop * CONFIG.BALANCE.FOOD_PER_PERSON,
      salt:  pop * CONFIG.BALANCE.SALT_PER_PERSON,
      cloth: pop * CONFIG.BALANCE.CLOTH_PER_PERSON,
      tools: (profs.craftsmen || 0) * CONFIG.BALANCE.TOOLS_PER_CRAFTSMAN,
    };
  }

  // Модификатор возрастной структуры (иждивенцы увеличивают нагрузку)
  const dem = nation.demographics;
  if (dem && dem.consumption_mult > 0 && typeof AGE_PARAMS !== 'undefined') {
    const relMult = dem.consumption_mult / AGE_PARAMS.baseline_consumption_mult;
    if (Math.abs(relMult - 1.0) > 0.001) {
      for (const good of Object.keys(result)) result[good] *= relMult;
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────
// ШАГ 3: ОБНОВЛЕНИЕ РЫНОЧНЫХ ЦЕН — трёхзонная модель
//
// Три режима в зависимости от мирового склада (world stockpile):
//
//   ДЕФИЦИТ  stockpile < 0.5 * target
//     → price_delta = base * exp(shortage_streak * 0.15)   экспоненциальный рост
//
//   БАЛАНС   0.5 * target ≤ stockpile ≤ 2.0 * target
//     → price_delta = (demand − supply) / supply * 0.05 * price   ±5% / тик
//
//   ИЗБЫТОК  stockpile > 2.0 * target
//     → price_delta = −base * 0.03 * surplus_ratio         плавное снижение
//
// Ограничители:
//   raw_new  = clamp(price + delta,  price_floor,  base * 10)
//   new_price = lerp(price, raw_new, 0.3)   — сглаживание, рынок «плывёт»
//
// Склад:
//   stockpile += supply − demand  ;  stockpile = max(0, stockpile)
//   shortage_streak++ если stockpile < 0.5 * target, иначе max(0, streak − 1)
// ──────────────────────────────────────────────────────────────

const _MARKET_SMOOTHING  = 0.30;   // скорость сглаживания (30% за тик)
const _BALANCE_SENS      = 0.05;   // чувствительность зоны баланса (±5% / тик)
const _SURPLUS_RATE      = 0.03;   // скорость снижения цены в зоне избытка
const _DEFICIT_INTENSITY = 0.10;   // базовый множитель дельты в зоне дефицита

function updateMarketPrices(totalProduced, totalConsumed) {
  // ── 1. Агрегируем мировые supply / demand ────────────────────────────────
  const worldSupply = {};
  const worldDemand = {};

  for (const goods of Object.values(totalProduced)) {
    for (const [good, amount] of Object.entries(goods)) {
      worldSupply[good] = (worldSupply[good] || 0) + amount;
    }
  }
  for (const consumed of Object.values(totalConsumed)) {
    for (const [good, amount] of Object.entries(consumed)) {
      worldDemand[good] = (worldDemand[good] || 0) + amount;
    }
  }

  // ── 2. Трёхзонная ценовая логика ─────────────────────────────────────────
  for (const [good, market] of Object.entries(GAME_STATE.market)) {
    const supply = worldSupply[good] || 0;
    const demand = worldDemand[good] || market.demand || 1;

    // Сохраняем агрегаты для совместимости со старым кодом
    market.supply = supply;
    market.demand = demand;

    // Метаданные из GOODS (elasticity, stockpile_target_turns)
    const goodDef        = typeof GOODS !== 'undefined' ? GOODS[good] : null;
    const targetTurns    = goodDef?.stockpile_target_turns ?? 4;
    const elasticity     = goodDef?.price_elasticity      ?? 1.0;
    const base           = market.base;

    // Инициализация мирового склада при первом тике
    if (market.world_stockpile == null) {
      market.world_stockpile = demand * targetTurns; // начинаем «в норме»
    }

    // ── 2a. Обновляем мировой склад ──────────────────────────────────────
    market.world_stockpile = Math.max(0, market.world_stockpile + supply - demand);
    const stockpileTarget = Math.max(1, demand * targetTurns);

    // ── 2b. Нижняя граница цены ──────────────────────────────────────────
    const floor   = (market.production_cost != null)
                    ? market.production_cost * 0.5
                    : base * 0.5;
    const ceiling = base * 10;
    market.price_floor = floor;  // обновляем для UI / этапа 3

    // ── 2c. Зона и дельта ────────────────────────────────────────────────
    let price_delta   = 0;
    const streak      = market.shortage_streak || 0;
    const stockpile   = market.world_stockpile;

    if (stockpile < 0.5 * stockpileTarget) {
      // ЗОНА ДЕФИЦИТА — экспоненциальный рост
      const shortage_mult = Math.exp(streak * 0.15);
      price_delta = base * shortage_mult * _DEFICIT_INTENSITY * elasticity;
      market.shortage_streak = streak + 1;

    } else if (stockpile <= 2.0 * stockpileTarget) {
      // ЗОНА БАЛАНСА — плавные колебания ±5% / тик
      const safeSupply = Math.max(supply, 1);
      price_delta = (demand - safeSupply) / safeSupply * _BALANCE_SENS
                  * market.price * elasticity;
      market.shortage_streak = Math.max(0, streak - 1);

    } else {
      // ЗОНА ИЗБЫТКА — медленное снижение
      const surplus_ratio = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
      price_delta = -base * _SURPLUS_RATE * surplus_ratio * elasticity;
      market.shortage_streak = Math.max(0, streak - 1);
    }

    // ── 2d. Ограничители + сглаживание ──────────────────────────────────
    const rawNew    = market.price + price_delta;
    const clamped   = Math.max(floor, Math.min(ceiling, rawNew));
    const newPrice  = market.price + (clamped - market.price) * _MARKET_SMOOTHING;

    market.price = Math.round(newPrice * 10) / 10;

    // ── 2e. История цен (последние 24 тика) ──────────────────────────────
    if (!Array.isArray(market.price_history)) market.price_history = [];
    market.price_history.push(market.price);
    if (market.price_history.length > 24) market.price_history.shift();
  }
}

// ──────────────────────────────────────────────────────────────
// ШАГ 4: ТОРГОВЛЯ
// ──────────────────────────────────────────────────────────────

function processTrade(nationId) {
  const nation = GAME_STATE.nations[nationId];
  let tradeProfit = 0;

  for (const partnerNationId of (nation.economy.trade_routes || [])) {
    const partner = GAME_STATE.nations[partnerNationId];
    if (!partner) continue;

    // Ищем товары с разницей цен (упрощённая модель)
    for (const [good, market] of Object.entries(GAME_STATE.market)) {
      const nationStock = nation.economy.stockpile[good] || 0;
      if (nationStock < 100) continue;

      // Простая модель: торговля даёт 5% от стоимости экспортируемых излишков
      const surplus = nationStock - 500;  // минимальный резерв
      if (surplus <= 0) continue;

      const tradeVolume = Math.min(surplus * 0.1, 1000);  // не более 10% за ход
      // Торговый договор с партнёром: +50% прибыли
      const hasTradeTreaty = (nation.relations?.[partnerNationId]?.treaties ?? []).includes('trade');
      const treatyMult = hasTradeTreaty ? 1.5 : 1.0;
      const profit = tradeVolume * market.price * 0.05 * treatyMult
                   * (1 - CONFIG.BALANCE.PIRACY_BASE)
                   * (1 - CONFIG.BALANCE.BASE_TARIFF);

      tradeProfit += profit;
    }
  }

  return tradeProfit;
}

// ──────────────────────────────────────────────────────────────
// ШАГ 5: КАЗНА
// ──────────────────────────────────────────────────────────────

function updateTreasury(nationId, produced, consumed, tradeProfit) {
  const nation = GAME_STATE.nations[nationId];
  const economy = nation.economy;
  const military = nation.military;
  const pop = nation.population.total;

  // ДОХОДЫ
  // Налоги = tax_rate × стоимость производства
  let productionValue = 0;
  for (const [good, amount] of Object.entries(produced)) {
    const price = GAME_STATE.market[good] ? GAME_STATE.market[good].price : 10;
    productionValue += amount * price;
  }
  const taxIncome = Math.round(productionValue * economy.tax_rate);

  // Бонусы зданий
  const bldBonuses = getBuildingBonuses(nationId);

  // Налоги с бонусом зданий
  const taxIncomeWithBonus = taxIncome * bldBonuses.tax_mult;

  // Портовые пошлины (прибрежные города) + бонус портовых зданий
  const coastalRegions = nation.regions.filter(rId => {
    const r = GAME_STATE.regions[rId];
    return r && (r.terrain === 'coastal_city');
  }).length;
  const portDuties = coastalRegions * 120 + bldBonuses.port_bonus;

  // Счастье от зданий (акведуки, храмы, ипподромы)
  if (bldBonuses.happiness_bonus > 0) {
    nation.population.happiness = Math.min(100,
      (nation.population.happiness ?? 50) + bldBonuses.happiness_bonus * 0.1
    );
  }

  const totalIncome = taxIncomeWithBonus + portDuties + tradeProfit;

  // РАСХОДЫ
  // Армия
  const militaryCost = (military.infantry    * CONFIG.BALANCE.INFANTRY_UPKEEP)
                     + (military.cavalry     * CONFIG.BALANCE.CAVALRY_UPKEEP)
                     + (military.ships       * CONFIG.BALANCE.SHIP_UPKEEP)
                     + (military.mercenaries * CONFIG.BALANCE.MERCENARY_UPKEEP);

  // Здания — legacy-список (nation.buildings) + новые building_slots
  let buildingsCost = 0;
  for (const regionId of nation.regions) {
    const region = GAME_STATE.regions[regionId];
    if (!region) continue;
    // Legacy: nation.buildings — плоский список
    if (region.buildings?.length) {
      buildingsCost += region.buildings.length * CONFIG.BALANCE.BUILDING_MAINTENANCE;
    }
    // Новые: building_slots — уже включены в distributeWages(), здесь не дублируем.
    // Вычитаем только то, что НЕ учтено через distributeWages (вызывается отдельно).
    // Поэтому building_slots maintenance учитываем только для НЕ-игрока.
    if (nationId !== GAME_STATE.player_nation) {
      const activeSlots = (region.building_slots || []).filter(s => s.status === 'active').length;
      buildingsCost += activeSlots * CONFIG.BALANCE.BUILDING_MAINTENANCE;
    }
  }
  // Для игрока maintenance зданий из building_slots уже вычтена в distributeWages()
  if (nationId === GAME_STATE.player_nation) {
    buildingsCost += economy._building_maintenance_per_turn || 0;
  }

  // Рабы
  const slavesCost = (nation.population.by_profession.slaves || 0) * CONFIG.BALANCE.SLAVE_UPKEEP;

  const totalExpense = militaryCost + buildingsCost + slavesCost;

  // ОБНОВЛЯЕМ КАЗНУ
  const delta = totalIncome - totalExpense;
  const newTreasury = economy.treasury + delta;

  applyDelta(`nations.${nationId}.economy.treasury`, Math.round(newTreasury));
  applyDelta(`nations.${nationId}.economy.income_per_turn`, Math.round(totalIncome));
  applyDelta(`nations.${nationId}.economy.expense_per_turn`, Math.round(totalExpense));

  // Если казна пуста — армия теряет лояльность
  if (newTreasury < 0) {
    const newLoyalty = Math.max(0, military.loyalty - 5);
    applyDelta(`nations.${nationId}.military.loyalty`, newLoyalty);
    addEventLog(`${nation.name}: казна пуста! Армия не получила жалованье. Лояльность упала.`, 'warning');
  }

  return { income: totalIncome, expense: totalExpense, delta };
}

// ──────────────────────────────────────────────────────────────
// ШАГ 6: ПРИМЕНЕНИЕ ЗАКОНОВ
// ──────────────────────────────────────────────────────────────

function applyActiveLaws(nationId) {
  const nation = GAME_STATE.nations[nationId];

  for (const law of (nation.active_laws || [])) {
    if (!law.effects_per_turn) continue;

    for (const [path, effect] of Object.entries(law.effects_per_turn)) {
      const currentValue = getState(`nations.${nationId}.${path}`);
      if (typeof currentValue === 'number') {
        applyDelta(`nations.${nationId}.${path}`, currentValue + effect);
      }
    }

    // Проверяем условия отмены закона
    if (law.conditions_for_repeal) {
      for (const [path, condition] of Object.entries(law.conditions_for_repeal)) {
        const currentValue = getState(`nations.${nationId}.${path}`);
        if (evaluateCondition(currentValue, condition)) {
          // Убираем закон
          nation.active_laws = nation.active_laws.filter(l => l.id !== law.id);
          addEventLog(`Закон "${law.name}" автоматически отменён: условие "${condition}" выполнено.`, 'info');
          break;
        }
      }
    }
  }
}

function evaluateCondition(value, condition) {
  // Разбираем условие типа "< 0" или "> 100"
  const match = condition.match(/^([<>=!]+)\s*(-?\d+\.?\d*)$/);
  if (!match) return false;
  const [, op, numStr] = match;
  const num = parseFloat(numStr);
  switch (op) {
    case '<':  return value < num;
    case '<=': return value <= num;
    case '>':  return value > num;
    case '>=': return value >= num;
    case '=':
    case '==': return value === num;
    default:   return false;
  }
}

// ──────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ ЭКОНОМИЧЕСКОГО ХОДА
// Вызывается из turn.js
// ──────────────────────────────────────────────────────────────

function runEconomyTick() {
  // Шаг 1: производство всех наций
  const allProduced = calculateProduction();

  // Шаг 2: потребление всех наций
  const allConsumed = {};
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    allConsumed[nationId] = calculateConsumption(nation);

    // Обновляем запасы
    const stockpile = nation.economy.stockpile;
    const produced = allProduced[nationId] || {};
    const consumed = allConsumed[nationId];

    // Добавляем произведённое в запасы
    for (const [good, amount] of Object.entries(produced)) {
      stockpile[good] = (stockpile[good] || 0) + amount;
    }

    // Вычитаем потреблённое из запасов
    for (const [good, amount] of Object.entries(consumed)) {
      const available = stockpile[good] || 0;
      const deficit = amount - available;

      if (deficit > 0 && good === 'wheat') {
        // Голод!
        const famineMortality = Math.min(deficit * CONFIG.BALANCE.FAMINE_MORTALITY, nation.population.total * 0.05);
        const newPop = nation.population.total - Math.round(famineMortality);
        applyDelta(`nations.${nationId}.population.total`, newPop);

        const newHappiness = Math.max(0, nation.population.happiness + CONFIG.BALANCE.HAPPINESS_FROM_FAMINE);
        applyDelta(`nations.${nationId}.population.happiness`, newHappiness);

        addEventLog(`${nation.name}: ГОЛОД! Не хватает ${Math.round(deficit)} бушелей зерна. Погибло ${Math.round(famineMortality)} человек.`, 'danger');
        stockpile.wheat = 0;
      } else {
        stockpile[good] = Math.max(0, available - amount);
      }
    }
  }

  // Шаг 3: рыночные цены
  updateMarketPrices(allProduced, allConsumed);

  // Шаги 4-5: торговля и казна для каждой нации
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    const tradeProfit = processTrade(nationId);
    const { income, expense, delta } = updateTreasury(
      nationId,
      allProduced[nationId] || {},
      allConsumed[nationId],
      tradeProfit,
    );

    // Только для игрока показываем детали
    if (nationId === GAME_STATE.player_nation && Math.abs(delta) > 10) {
      const sign = delta >= 0 ? '+' : '';
      addEventLog(`Казна: ${sign}${Math.round(delta)} монет (доход ${Math.round(income)}, расход ${Math.round(expense)})`, 'economy');
    }
  }

  // Шаг 6: применяем законы
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    applyActiveLaws(nationId);
  }
}

// ──────────────────────────────────────────────────────────────
// РОСТ НАСЕЛЕНИЯ
// ──────────────────────────────────────────────────────────────

function updatePopulationGrowth() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    const pop = nation.population;
    const food = nation.economy.stockpile.wheat || 0;
    const foodNeeded = pop.total * CONFIG.BALANCE.FOOD_PER_PERSON;

    let growthRate = CONFIG.BALANCE.BASE_GROWTH_RATE;

    if (food >= foodNeeded) {
      // Достаточно еды — нормальный рост, счастье немного растёт
      const newHappiness = Math.min(100, pop.happiness + 1);
      applyDelta(`nations.${nationId}.population.happiness`, newHappiness);
    } else {
      // Нехватка еды замедляет рост
      growthRate = -CONFIG.BALANCE.FAMINE_MORTALITY;
    }

    // Счастье влияет на рост
    const happinessMod = (pop.happiness - 50) / 1000;
    growthRate += happinessMod;

    const newPop = Math.max(1000, Math.round(pop.total * (1 + growthRate)));
    applyDelta(`nations.${nationId}.population.total`, newPop);
  }
}

// ──────────────────────────────────────────────────────────────
// СЧАСТЬЕ НАСЕЛЕНИЯ (с учётом классовой удовлетворённости)
// ──────────────────────────────────────────────────────────────

function updateHappiness() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    const economy = nation.economy;

    // ── Классовая удовлетворённость ─────────────────────────
    let happiness = 50; // базовое
    if (typeof calculateClassSatisfaction === 'function') {
      const classSat = calculateClassSatisfaction(
        nation.population.by_profession,
        economy.stockpile,
      );
      // Сохраняем в состояние для UI
      nation.population.class_satisfaction = classSat;

      // ── Зарплатные бонусы к satisfaction классов ─────────────────────
      // Заполняются в distributeWages() для игрока каждый ход.
      const wageBonuses   = nation.population._wage_bonuses   || {};
      const profitBonuses = nation.population._profit_class_bonuses || {};

      // Маппинг профессия → класс (совпадает с PROF_TO_CLASS в demography.js)
      const _P2C = {
        farmers:   'farmers_class',
        craftsmen: 'craftsmen_class',
        merchants: 'citizens',
        sailors:   'sailors_class',
        clergy:    'clergy_class',
        soldiers:  'soldiers_class',
        slaves:    'slaves_class',
      };

      for (const [prof, bonus] of Object.entries(wageBonuses)) {
        const classId = _P2C[prof];
        if (classId && classSat[classId]) {
          classSat[classId].satisfaction = Math.max(0, Math.min(100,
            classSat[classId].satisfaction + bonus,
          ));
          classSat[classId].wage_bonus = bonus; // для UI
        }
      }

      // Profit-бонус классам-владельцам
      for (const [classId, bonus] of Object.entries(profitBonuses)) {
        if (bonus && classSat[classId]) {
          classSat[classId].satisfaction = Math.max(0, Math.min(100,
            classSat[classId].satisfaction + bonus,
          ));
          classSat[classId].profit_bonus = bonus; // для UI
        }
      }

      // Amenity-бонусы зданий (таверна, акведук, храм, форум и т.д.)
      // Заполняются в distributeWages() для игрока каждый ход; суммируются и capped.
      const bldBonuses = nation.population._class_building_bonuses || {};
      for (const [classId, bonus] of Object.entries(bldBonuses)) {
        if (!bonus || !classSat[classId]) continue;
        const capped = Math.max(-25, Math.min(25, bonus));
        classSat[classId].satisfaction = Math.max(0, Math.min(100,
          classSat[classId].satisfaction + capped,
        ));
        classSat[classId].building_bonus = capped; // для UI
      }

      // Бонусы/штрафы законов о труде + бремя иждивенцев
      // Заполняются в collectLaborLawBonuses() из age_demographics.js каждый ход.
      const laborLawBonuses = nation.population._labor_law_bonuses || {};
      for (const [classId, bonus] of Object.entries(laborLawBonuses)) {
        if (!bonus || !classSat[classId]) continue;
        const capped = Math.max(-20, Math.min(15, bonus));
        classSat[classId].satisfaction = Math.max(0, Math.min(100,
          classSat[classId].satisfaction + capped,
        ));
        classSat[classId].labor_law_bonus = capped; // для UI
      }

      // Взвешенное счастье по политическому весу классов
      if (typeof calculateWeightedHappiness === 'function') {
        happiness = calculateWeightedHappiness(classSat);
      }

      // Политические эффекты
      if (typeof calculatePoliticalEffects === 'function') {
        const fx = calculatePoliticalEffects(classSat);
        nation.population._political_effects = fx;

        // Применяем модификаторы производства
        if (fx.production_mod !== 0) {
          nation.population._production_mod = 1 + Math.max(-0.4, Math.min(0.3, fx.production_mod));
        } else {
          nation.population._production_mod = 1;
        }

        // Военные эффекты
        if (fx.military_loyalty_mod !== 0) {
          const newLoyalty = Math.max(0, Math.min(100,
            nation.military.loyalty + fx.military_loyalty_mod,
          ));
          applyDelta(`nations.${nationId}.military.loyalty`, newLoyalty);
        }
        if (fx.military_morale_mod !== 0) {
          const newMorale = Math.max(0, Math.min(100,
            nation.military.morale + fx.military_morale_mod * 0.2, // сглаживание
          ));
          applyDelta(`nations.${nationId}.military.morale`, newMorale);
        }

        // Легитимность
        if (fx.legitimacy_mod !== 0) {
          const newLeg = Math.max(0, Math.min(100,
            nation.government.legitimacy + fx.legitimacy_mod,
          ));
          applyDelta(`nations.${nationId}.government.legitimacy`, newLeg);
        }
      }
    } else {
      // Запасной вариант — старая логика
      happiness = nation.population.happiness;
    }

    // ── Внешние факторы ─────────────────────────────────────
    if ((nation.military.at_war_with || []).length > 0) {
      happiness += CONFIG.BALANCE.HAPPINESS_FROM_WAR;
    }
    if (economy.tax_rate > 0.15) {
      happiness -= Math.round((economy.tax_rate - 0.15) * 100);
    }
    if (economy.treasury < 0) {
      happiness -= 3;
    }

    // Бонус зданий уже применён в updateTreasury
    const bldBonus = getBuildingBonuses(nationId);
    if (bldBonus.happiness_bonus > 0) {
      happiness += Math.round(bldBonus.happiness_bonus * 0.5);
    }

    happiness = Math.max(0, Math.min(100, Math.round(happiness)));
    applyDelta(`nations.${nationId}.population.happiness`, happiness);
  }
}
