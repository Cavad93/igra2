// Экономический движок — чистая математика, без AI
// Порядок вызова строго определён в turn.js

// ──────────────────────────────────────────────────────────────
// НАЛОГОВЫЕ ГРУППЫ → классы общества (из social_classes.js)
//
// Каждая группа содержит список class_id из SOCIAL_CLASSES.
// Налоговая база группы = Σ(class_population × SOCIAL_CLASSES[class].wealth_level)
// ──────────────────────────────────────────────────────────────
const TAX_GROUP_CLASSES = {
  aristocrats: ['aristocrats', 'officials'],                            // аристократы + чиновники
  clergy:      ['clergy_class'],                                        // жречество
  commoners:   ['citizens', 'craftsmen_class', 'farmers_class', 'sailors_class'], // граждане + прочие
  soldiers:    ['soldiers_class', 'freedmen'],                          // солдаты + вольноотпущенники
};

// Калибровочный множитель: (pop × wealth_level) → золото/ход
// wealth_level=5, pop=19000, rate=0.15, calibration=0.5 → ~7125 зол. с аристократов Сиракуз
const TAX_CALIBRATION = 0.5;

// ──────────────────────────────────────────────────────────────
// ВЫЧИСЛЕНИЕ НАЛОГОВЫХ БАЗ ПО ГРУППАМ
// Использует CLASS_FROM_PROFESSION + SOCIAL_CLASSES из social_classes.js
// Возвращает { aristocrats, clergy, commoners, soldiers } — суммарные
// pop×wealth_level единицы для каждой налоговой группы.
// ──────────────────────────────────────────────────────────────
function computeTaxGroupBases(by_profession) {
  // Вычисляем население каждого социального класса из профессий
  let classPops = {};
  if (typeof calculateClassPopulations === 'function') {
    classPops = calculateClassPopulations(by_profession);
  }

  const bases = { aristocrats: 0, clergy: 0, commoners: 0, soldiers: 0 };

  for (const [group, classIds] of Object.entries(TAX_GROUP_CLASSES)) {
    for (const classId of classIds) {
      const pop = classPops[classId] || 0;
      const wealthLevel = (typeof SOCIAL_CLASSES !== 'undefined')
        ? (SOCIAL_CLASSES[classId]?.wealth_level ?? 0)
        : 0;
      bases[group] += pop * wealthLevel;
    }
  }

  return bases;
}

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

// ══════════════════════════════════════════════════════════════
// ЭТАП 3: РЕГИОНАЛЬНЫЕ ЗАПАСЫ
//
// Производство сначала идёт в region.local_stockpile (буфер 3 тика).
// Избыток переливается в nation.economy.stockpile.
// Товары, не произведённые в регионе (инструменты/скот как капитал),
// в local_stockpile НЕ переполняются — остаются там до потребления.
// ══════════════════════════════════════════════════════════════

// Возвращает производство зданий по регионам: { regionId: { good: amount } }
// Вызывается только из routeProductionToLocalStockpiles.
function _getRegionalBuildingProduction(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return {};

  const result = {};
  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    const regionOut = {};
    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;
      if (typeof getBuildingOutput !== 'function') continue;
      const out = getBuildingOutput(slot, region, nation);
      for (const [good, amt] of Object.entries(out)) {
        regionOut[good] = (regionOut[good] || 0) + amt;
      }
    }
    if (Object.keys(regionOut).length > 0) result[rid] = regionOut;
  }
  return result;
}

// ──────────────────────────────────────────────────────────────
// routeProductionToLocalStockpiles(nationId, allProduced)
//
// Заменяет прямое добавление в nation.economy.stockpile (шаг 1c).
// Для каждого региона нации:
//   1. Зачисляет производство зданий и неорганизованное → local_stockpile
//   2. Вычисляет local_capacity = 3 × тик-производство региона
//   3. Переводит overflow → nation.economy.stockpile
//
// Товары без производства в регионе (инструменты/скот, хранящиеся как
// капитал) не переполняются — остаются в local_stockpile.
// ──────────────────────────────────────────────────────────────
function routeProductionToLocalStockpiles(nationId, allProduced) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const nationProduced  = allProduced[nationId] || {};
  const nationStockpile = nation.economy.stockpile;

  // ── A. Производство зданий по регионам ──────────────────────────────────
  const bldByRegion = _getRegionalBuildingProduction(nationId);

  // Суммарное здание-производство по всей нации (для вычисления неорганизованного)
  const bldTotal = {};
  for (const rOut of Object.values(bldByRegion)) {
    for (const [g, a] of Object.entries(rOut)) {
      bldTotal[g] = (bldTotal[g] || 0) + a;
    }
  }

  // Неорганизованное производство = nationProduced − здания
  const unorgTotal = {};
  for (const [good, amt] of Object.entries(nationProduced)) {
    const unorg = Math.max(0, amt - (bldTotal[good] || 0));
    if (unorg > 0.01) unorgTotal[good] = unorg;
  }

  // Суммарное население всех регионов нации (для пропорций)
  let totalRegionPop = 0;
  for (const rid of nation.regions) {
    totalRegionPop += GAME_STATE.regions[rid]?.population || 0;
  }
  if (totalRegionPop <= 0) totalRegionPop = 1;

  // ── B. Маршрутизация по регионам ────────────────────────────────────────
  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region) continue;

    // Ленивая инициализация (не меняем regions_data.js — тысячи регионов)
    if (!region.local_stockpile) region.local_stockpile = {};
    if (!region.local_market)   region.local_market   = {};

    const ls           = region.local_stockpile;
    const prodThisTick = {};  // что произведено ЗДЕСЬ в этот тик

    // Производство зданий региона
    for (const [good, amt] of Object.entries(bldByRegion[rid] || {})) {
      ls[good]             = (ls[good]             || 0) + amt;
      prodThisTick[good]   = (prodThisTick[good]   || 0) + amt;
    }

    // Доля неорганизованного производства пропорционально населению
    const popShare = (region.population || 0) / totalRegionPop;
    for (const [good, unorgAmt] of Object.entries(unorgTotal)) {
      const share = unorgAmt * popShare;
      if (share > 0.01) {
        ls[good]           = (ls[good]           || 0) + share;
        prodThisTick[good] = (prodThisTick[good] || 0) + share;
      }
    }

    // Запоминаем для расчёта региональных цен и ёмкости
    region._production_last_tick = prodThisTick;

    // ── C. Overflow: только для произведённых здесь товаров ─────────────
    // Capacity = 3 тика производства. Непроизведённые товары (инструменты,
    // скот как капитальный запас) не переполняются.
    for (const [good, produced] of Object.entries(prodThisTick)) {
      const capacity = produced * 3;
      const current  = ls[good] || 0;
      if (current > capacity) {
        const overflow = current - capacity;
        nationStockpile[good] = (nationStockpile[good] || 0) + overflow;
        ls[good] = capacity;
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ШАГ 2: ПОТРЕБЛЕНИЕ (классовая модель)
// ──────────────────────────────────────────────────────────────

function calculateConsumption(nation) {
  let result;

  // Предпочтительный путь: wealth-зависимая корзина потребления (Stage 6)
  if (typeof calcNationBasketDemand === 'function') {
    const basketDemand = calcNationBasketDemand(nation);
    if (basketDemand) result = basketDemand;
  }

  // Запасной вариант — классовая модель
  if (!result && typeof calculateTotalConsumptionByClass === 'function') {
    result = calculateTotalConsumptionByClass(nation.population.by_profession);
  }

  // Последний резерв — плоская модель
  if (!result) {
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
// updateMarketPrices — перенесено в engine/market.js (Этап 8)
// Функция определена там и вызывается здесь без изменений.

// ──────────────────────────────────────────────────────────────
// ШАГ 4: ТОРГОВЛЯ
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// _WORLD_IMPORT_GOODS — товары, которые нация закупает на мировом
// рынке при дефиците в processTrade (не capital_inputs — они в
// procureCapitalInputs).  Приоритет: сначала продовольствие,
// затем инструменты и сырьё.
// ──────────────────────────────────────────────────────────────
const _WORLD_IMPORT_GOODS = [
  'wheat', 'barley', 'salt', 'cloth',         // потребительские
  'tools', 'iron', 'timber', 'bronze',         // производственные
  'wine', 'olive_oil', 'pottery',              // ценные
];

function processTrade(nationId) {
  const nation = GAME_STATE.nations[nationId];
  let tradeProfit = 0;

  // ── 1. Экспортная прибыль от торговых маршрутов ───────────────────────
  for (const partnerNationId of (nation.economy.trade_routes || [])) {
    const partner = GAME_STATE.nations[partnerNationId];
    if (!partner) continue;

    for (const [good, mkt] of Object.entries(GAME_STATE.market)) {
      const nationStock = nation.economy.stockpile[good] || 0;
      if (nationStock < 100) continue;

      const surplus = nationStock - 500;
      if (surplus <= 0) continue;

      const tradeVolume = Math.min(surplus * 0.1, 1000);
      const hasTradeTreaty = (nation.relations?.[partnerNationId]?.treaties ?? []).includes('trade');
      const treatyMult = hasTradeTreaty ? 1.5 : 1.0;
      const profit = tradeVolume * mkt.price * 0.05 * treatyMult
                   * (1 - CONFIG.BALANCE.PIRACY_BASE)
                   * (1 - CONFIG.BALANCE.BASE_TARIFF);

      tradeProfit += profit;
    }
  }

  // ── 2. Импорт с мирового рынка при дефиците товаров ──────────────────
  //   Условие: нация имеет доступ к мировому рынку (canAccessWorldMarket).
  //   Закупает только то, чего не хватает (stockpile < demand × 2 тика).
  //   Квота и транспортные расходы те же, что в procureCapitalInputs.
  if (typeof canAccessWorldMarket === 'function' && canAccessWorldMarket(nationId)) {
    const stockpile = nation.economy.stockpile;

    for (const good of _WORLD_IMPORT_GOODS) {
      const mktEntry = GAME_STATE.market[good];
      if (!mktEntry || (mktEntry.world_stockpile || 0) <= 0) continue;

      const currentStock = stockpile[good] || 0;
      const demandPerTick = mktEntry.demand
                          ? mktEntry.demand / Math.max(1, Object.keys(GAME_STATE.nations).length)
                          : 0;

      // Только если запас < 2 тика потребления
      if (demandPerTick <= 0 || currentStock >= demandPerTick * 2) continue;

      const needed = demandPerTick * 2 - currentStock;

      const quota      = mktEntry._quota_per_buyer ?? (mktEntry.world_stockpile || 0);
      const boughtSoFar = (mktEntry._world_bought_tick?.[nationId] || 0);
      const canBuy     = Math.max(0, quota - boughtSoFar);
      const fromWorld  = Math.min(needed, canBuy, mktEntry.world_stockpile || 0);

      if (fromWorld <= 0) continue;

      const transportCost = typeof getWorldMarketTransportCost === 'function'
        ? getWorldMarketTransportCost(nationId, good)
        : 0.25;
      const priceWithTransport = (mktEntry.price || 0) * (1 + transportCost);
      const payment = fromWorld * priceWithTransport;

      // Закупаем только если казна позволяет
      if ((nation.economy.treasury || 0) < payment) continue;

      nation.economy.treasury = (nation.economy.treasury || 0) - payment;
      stockpile[good] = (stockpile[good] || 0) + fromWorld;

      mktEntry.world_stockpile = Math.max(0, mktEntry.world_stockpile - fromWorld);
      if (!mktEntry._world_bought_tick) mktEntry._world_bought_tick = {};
      mktEntry._world_bought_tick[nationId] = boughtSoFar + fromWorld;

      // Учитываем в торговой прибыли (отрицательно — расход)
      tradeProfit -= payment;
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
  const prof = nation.population.by_profession;

  // ── БОНУСЫ ЗДАНИЙ ──────────────────────────────────────────
  const bldBonuses = getBuildingBonuses(nationId);

  // ── УРОВНИ ФИНАНСИРОВАНИЯ РАСХОДОВ (0.5..1.5) ──────────────
  const expLevels    = economy.expense_levels || {};
  const armyLvl      = Math.max(0.5, Math.min(1.5, expLevels.army       ?? 1.0));
  const navyLvl      = Math.max(0.5, Math.min(1.5, expLevels.navy       ?? 1.0));
  const courtLvl     = Math.max(0.5, Math.min(1.5, expLevels.court      ?? 1.0));
  const stabilLvl    = Math.max(0.5, Math.min(1.5, expLevels.stability  ?? 1.0));
  const fortressLvl  = Math.max(0.5, Math.min(1.5, expLevels.fortresses ?? 1.0));
  const buildingsLvl = Math.max(0.5, Math.min(1.5, expLevels.buildings  ?? 1.0));
  const slavesLvl    = Math.max(0.5, Math.min(1.5, expLevels.slaves     ?? 1.0));

  // ── ДОХОДЫ: НАЛОГИ ─────────────────────────────────────────
  // Единая механика для всех наций: tax_rates_by_class × wealth_level.
  // Если нация не имеет явных ставок — инициализируем из единого tax_rate
  // с исторически правдоподобным распределением по слоям.
  if (!economy.tax_rates_by_class) {
    const r = economy.tax_rate || 0.10;
    economy.tax_rates_by_class = {
      aristocrats: Math.min(0.30, parseFloat((r * 1.5).toFixed(2))),
      clergy:      Math.min(0.30, parseFloat((r * 0.7).toFixed(2))),
      commoners:   Math.min(0.30, parseFloat((r * 1.0).toFixed(2))),
      soldiers:    Math.min(0.30, parseFloat((r * 0.4).toFixed(2))),
    };
  }

  // taxBase[group] = Σ(class_pop × wealth_level) по классам группы
  const taxBases = computeTaxGroupBases(prof);
  const totalTaxBase = taxBases.aristocrats + taxBases.clergy
                     + taxBases.commoners   + taxBases.soldiers;

  // tax_class = taxBase[group] × rate × TAX_CALIBRATION × building_bonus
  const r = economy.tax_rates_by_class;
  let taxByClass;
  if (totalTaxBase > 0) {
    taxByClass = {
      aristocrats: Math.round(taxBases.aristocrats * r.aristocrats * TAX_CALIBRATION * bldBonuses.tax_mult),
      clergy:      Math.round(taxBases.clergy      * r.clergy      * TAX_CALIBRATION * bldBonuses.tax_mult),
      commoners:   Math.round(taxBases.commoners   * r.commoners   * TAX_CALIBRATION * bldBonuses.tax_mult),
      soldiers:    Math.round(taxBases.soldiers    * r.soldiers    * TAX_CALIBRATION * bldBonuses.tax_mult),
    };
  } else {
    taxByClass = { aristocrats: 0, clergy: 0, commoners: 0, soldiers: 0 };
  }
  const taxIncomeTotal = taxByClass.aristocrats + taxByClass.clergy
                       + taxByClass.commoners   + taxByClass.soldiers;

  // ── ДОХОДЫ: ПОРТОВЫЕ ПОШЛИНЫ ───────────────────────────────
  const coastalRegions = nation.regions.filter(rId => {
    const r = GAME_STATE.regions[rId];
    return r && (r.terrain === 'coastal_city');
  }).length;
  const portDuties = Math.round(coastalRegions * 120 + bldBonuses.port_bonus);

  // ── СЧАСТЬЕ ОТ ЗДАНИЙ ──────────────────────────────────────
  if (bldBonuses.happiness_bonus > 0) {
    nation.population.happiness = Math.min(100,
      (nation.population.happiness ?? 50) + bldBonuses.happiness_bonus * 0.1
    );
  }

  // Флот влияет на торговую прибыль; здания — на портовые пошлины
  const effTradeProfit = Math.round(tradeProfit * navyLvl);
  const effPortDuties  = Math.round(portDuties  * buildingsLvl);
  const totalIncome = taxIncomeTotal + effPortDuties + effTradeProfit;

  // ── РАСХОДЫ: АРМИЯ ─────────────────────────────────────────
  const expArmyInfantry    = (military.infantry    || 0) * CONFIG.BALANCE.INFANTRY_UPKEEP;
  const expArmyCavalry     = (military.cavalry     || 0) * CONFIG.BALANCE.CAVALRY_UPKEEP;
  const expArmyMercenaries = (military.mercenaries || 0) * CONFIG.BALANCE.MERCENARY_UPKEEP;
  const expNavy            = (military.ships       || 0) * CONFIG.BALANCE.SHIP_UPKEEP;

  // ── РАСХОДЫ: ДВОР И СОВЕТНИКИ ──────────────────────────────
  // Двор: все живые персонажи (базовое содержание)
  const aliveChars = (nation.characters || []).filter(c => c.alive !== false);
  const expCourt = aliveChars.length * 15;
  // Советники: персонажи с ролью 'advisor' (дополнительное содержание)
  const advisorCount = aliveChars.filter(c => c.role === 'advisor').length;
  const expAdvisors = advisorCount * 50;

  // ── РАСХОДЫ: СТАБИЛЬНОСТЬ ──────────────────────────────────
  // 200 × (1 - stability/100): при 100% → 0, при 50% → 100, при 0% → 200
  const stability = nation.government?.stability ?? 50;
  const expStability = Math.round(200 * (1 - stability / 100));

  // ── РАСХОДЫ: КРЕПОСТИ ──────────────────────────────────────
  // Считаем 'walls' в nation.buildings (legacy) и building_slots с типом 'walls'
  const legacyWalls = (nation.buildings || []).filter(b => b === 'walls').length;
  let slotWalls = 0;
  for (const regionId of nation.regions) {
    const region = GAME_STATE.regions[regionId];
    if (!region) continue;
    slotWalls += (region.building_slots || []).filter(
      s => s.status === 'active' && (s.type === 'walls' || s.type === 'fortress')
    ).length;
  }
  const expFortresses = (legacyWalls + slotWalls) * 80;

  // ── РАСХОДЫ: ЗДАНИЯ ────────────────────────────────────────
  // Обычные здания (без стен — они уже учтены выше)
  let expBuildings = 0;
  for (const regionId of nation.regions) {
    const region = GAME_STATE.regions[regionId];
    if (!region) continue;
    // Legacy: плоский список (не стены — они в expFortresses)
    if (region.buildings?.length) {
      const nonWalls = region.buildings.filter(b => b !== 'walls').length;
      expBuildings += nonWalls * CONFIG.BALANCE.BUILDING_MAINTENANCE;
    }
    // Новые building_slots — только для AI (игрок учтён в distributeWages)
    if (nationId !== GAME_STATE.player_nation) {
      const activeNonWall = (region.building_slots || []).filter(
        s => s.status === 'active' && s.type !== 'walls' && s.type !== 'fortress'
      ).length;
      expBuildings += activeNonWall * CONFIG.BALANCE.BUILDING_MAINTENANCE;
    }
  }
  if (nationId === GAME_STATE.player_nation) {
    expBuildings += economy._building_maintenance_per_turn || 0;
  }

  // ── РАСХОДЫ: РАБЫ ──────────────────────────────────────────
  const expSlaves = (prof.slaves || 0) * CONFIG.BALANCE.SLAVE_UPKEEP;

  // ── ПРИМЕНЯЕМ УРОВНИ ФИНАНСИРОВАНИЯ ────────────────────────
  const effArmyInf      = Math.round(expArmyInfantry    * armyLvl);
  const effArmyCav      = Math.round(expArmyCavalry     * armyLvl);
  const effArmyMerc     = Math.round(expArmyMercenaries * armyLvl);
  const effNavyExp      = Math.round(expNavy             * navyLvl);
  const effCourtExp     = Math.round(expCourt            * courtLvl);
  const effAdvisorsExp  = Math.round(expAdvisors         * courtLvl);
  const effStabExp      = Math.round(expStability        * stabilLvl);
  const effFortresses   = Math.round(expFortresses       * fortressLvl);
  const effBuildings    = Math.round(expBuildings        * buildingsLvl);
  const effSlaves       = Math.round(expSlaves           * slavesLvl);

  const totalExpense = effArmyInf + effArmyCav + effArmyMerc
                     + effNavyExp + effCourtExp + effAdvisorsExp + effStabExp
                     + effFortresses + effBuildings + effSlaves;

  // ── ОБНОВЛЯЕМ КАЗНУ ────────────────────────────────────────
  const delta = totalIncome - totalExpense;
  const newTreasury = economy.treasury + delta;

  applyDelta(`nations.${nationId}.economy.treasury`, Math.round(newTreasury));
  applyDelta(`nations.${nationId}.economy.income_per_turn`, Math.round(totalIncome));
  applyDelta(`nations.${nationId}.economy.expense_per_turn`, Math.round(totalExpense));

  // ── ВОССТАНОВЛЕНИЕ СТАБИЛЬНОСТИ ────────────────────────────
  // stabilLvl масштабирует скорость восстановления (× уровень финансирования).
  // fundingRatio убывает при дефиците (у эффективных расходов на стабильность).
  if (expStability > 0) {
    const currentStab = nation.government?.stability ?? 50;
    if (currentStab < 100) {
      const fundingRatio = delta >= 0
        ? 1.0
        : Math.max(0, 1 + delta / Math.max(1, effStabExp));
      const stabRecovery = parseFloat((1.5 * fundingRatio * stabilLvl).toFixed(2));
      if (stabRecovery > 0) {
        applyDelta(
          `nations.${nationId}.government.stability`,
          Math.min(100, parseFloat((currentStab + stabRecovery).toFixed(2))),
        );
      }
      economy._stability_funding_ratio = parseFloat(fundingRatio.toFixed(2));
    }
  }

  // ── ЭФФЕКТЫ УРОВНЕЙ ФИНАНСИРОВАНИЯ ─────────────────────────
  const totalArmy = (military.infantry || 0) + (military.cavalry || 0) + (military.mercenaries || 0);
  if (totalArmy > 0 && Math.abs(armyLvl - 1.0) > 0.01) {
    const moraleDelta  = parseFloat(((armyLvl - 1.0) * 15).toFixed(1));
    const loyaltyDelta = parseFloat(((armyLvl - 1.0) *  8).toFixed(1));
    applyDelta(`nations.${nationId}.military.morale`,
      Math.max(0, Math.min(100, (military.morale ?? 50) + moraleDelta)));
    applyDelta(`nations.${nationId}.military.loyalty`,
      Math.max(0, Math.min(100, (military.loyalty ?? 50) + loyaltyDelta)));
  }
  if (Math.abs(courtLvl - 1.0) > 0.01) {
    const legDelta = parseFloat(((courtLvl - 1.0) * 2).toFixed(1));
    const gov = nation.government;
    applyDelta(`nations.${nationId}.government.legitimacy`,
      Math.max(0, Math.min(100, (gov?.legitimacy ?? 50) + legDelta)));
  }
  // Крепости: содержание гарнизона влияет на стабильность
  economy._fortress_defense_mult = fortressLvl;
  if (expFortresses > 0 && Math.abs(fortressLvl - 1.0) > 0.01) {
    const stabDelta = parseFloat(((fortressLvl - 1.0) * 2.0).toFixed(2));
    const currentStab = nation.government?.stability ?? 50;
    if (stabDelta > 0 || currentStab > 0) {
      applyDelta(`nations.${nationId}.government.stability`,
        Math.max(0, Math.min(100, parseFloat((currentStab + stabDelta).toFixed(2)))));
    }
  }
  // Рабы: условия содержания влияют на счастье населения
  economy._slave_condition = slavesLvl;
  if ((prof.slaves || 0) > 0 && Math.abs(slavesLvl - 1.0) > 0.01) {
    const happDelta = parseFloat(((slavesLvl - 1.0) * 8).toFixed(1));
    applyDelta(`nations.${nationId}.population.happiness`,
      Math.max(0, Math.min(100, (nation.population.happiness ?? 50) + happDelta)));
  }

  // ── КЭШ РАЗБИВКИ ДЛЯ UI ────────────────────────────────────
  const buildingProfit = Math.round(nation.economy._building_profit_last_tick || 0);
  applyDelta(`nations.${nationId}.economy._income_breakdown`, {
    tax_aristocrats: taxByClass.aristocrats,
    tax_clergy:      taxByClass.clergy,
    tax_commoners:   taxByClass.commoners,
    tax_soldiers:    taxByClass.soldiers,
    trade_profit:    Math.round(effTradeProfit),
    port_duties:     Math.round(effPortDuties),
    building_profit: buildingProfit,
    total:           Math.round(totalIncome) + buildingProfit,
  });
  applyDelta(`nations.${nationId}.economy._expense_breakdown`, {
    army_infantry:     effArmyInf,
    army_cavalry:      effArmyCav,
    army_mercenaries:  effArmyMerc,
    army_base:         Math.round(expArmyInfantry + expArmyCavalry + expArmyMercenaries),
    army_level:        armyLvl,
    navy:              effNavyExp,
    navy_base:         expNavy,
    navy_level:        navyLvl,
    court:             effCourtExp,
    advisors:          effAdvisorsExp,
    court_base:        expCourt + expAdvisors,
    court_level:       courtLvl,
    stability:         effStabExp,
    stability_base:    expStability,
    stability_level:   stabilLvl,
    fortresses:        effFortresses,
    fortresses_base:   expFortresses,
    fortresses_level:  fortressLvl,
    buildings:         effBuildings,
    buildings_base:    expBuildings,
    buildings_level:   buildingsLvl,
    slaves:            effSlaves,
    slaves_base:       expSlaves,
    slaves_level:      slavesLvl,
    total:            totalExpense,
  });

  // ── БАНКРОТСТВО ────────────────────────────────────────────
  if (newTreasury < 0) {
    const newLoyalty = Math.max(0, military.loyalty - 5);
    applyDelta(`nations.${nationId}.military.loyalty`, newLoyalty);
    addEventLog(`${nation.name}: казна пуста! Армия не получила жалованье. Лояльность упала.`, 'warning');
  }

  return { income: totalIncome, expense: totalExpense, delta };
}

// ──────────────────────────────────────────────────────────────
// ШАГ 5b: ЗАПИСЬ ИСТОРИИ БАЛАНСА (вызывается из turn.js)
// ──────────────────────────────────────────────────────────────

function recordEconomyHistory() {
  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations?.[nationId];
  if (!nation) return;
  const eco  = nation.economy;
  const turn = GAME_STATE.turn || 0;
  const income  = eco.income_per_turn  || 0;
  const expense = eco.expense_per_turn || 0;
  if (!Array.isArray(eco._balance_history)) eco._balance_history = [];
  eco._balance_history.push({ turn, income, expense, net: income - expense });
  if (eco._balance_history.length > 24) eco._balance_history.shift();
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
//
// Канонический порядок шагов (см. turn.js шаг 1):
//   0    POP → здания (_pop_eff)
//   0.5  computeWorldMarketQuotas → procureCapitalInputs
//   0.6  procureSlaves
//   1    processAllRecipes + calculateProduction + routeProduction
//   1.5  buildProvinceMarket + updateRegionalMarketPrices
//   2    calculateConsumption + updatePopSatisfied
//   3    updateBuildingFinancials + applyBuildingAdaptiveBehavior
//   4а   distributeWages
//   4б   distributeClassIncome
//   4в   updatePopWealth
//   5    recomputeAllProductionCosts + updateMarketPrices
//   5б   processAutonomousBuilding
//   5в   checkClassBankruptcy
//   6    processTrade + updateTreasury + applyActiveLaws + события
//
// updateProvinceControl (calculateProvinceControl) вызывается СНАРУЖИ
// в turn.js шаг 0.95 — до runEconomyTick.
// ──────────────────────────────────────────────────────────────

function runEconomyTick() {

  // ════════════════════════════════════════════════════════════
  // ШАГ 0: POP-эффективность зданий
  // прошлотиковая satisfied → slot._pop_eff
  // ════════════════════════════════════════════════════════════
  if (typeof applyPopSatisfiedToBuildings === 'function') {
    for (const _nId of Object.keys(GAME_STATE.nations)) {
      try { applyPopSatisfiedToBuildings(_nId); } catch (e) { console.warn('[pops_eff]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 0.5: КВОТЫ + КАПИТАЛЬНЫЕ РЕСУРСЫ ФЕРМ
  //   Квоты мирового рынка (world_stockpile / число покупателей).
  //   Амортизация + четырёхуровневая закупка инструментов/скота:
  //     local → province → national → world.
  //   Устанавливает slot._capital_ratio (влияет на выход в шаге 1).
  // ════════════════════════════════════════════════════════════
  if (typeof computeWorldMarketQuotas === 'function') {
    try { computeWorldMarketQuotas(); } catch (e) { console.warn('[world_quotas]', e); }
  }
  if (typeof procureCapitalInputs === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { procureCapitalInputs(nationId); } catch (e) { console.warn('[capital_inputs]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 0.6: ЗАКУПКА РАБОВ
  //   Покупает рабов с мирового рынка для латифундий.
  //   → nation.population.by_profession.slaves
  // ════════════════════════════════════════════════════════════
  if (typeof procureSlaves === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { procureSlaves(nationId); } catch (e) { console.warn('[procure_slaves]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 1: ПРОИЗВОДСТВО
  //   1a. Рецепты — production_ratio, production_cost, вычет входных
  //   1b. actual output = base × _pop_eff × recipe_ratio × _capital_ratio
  //   1c. Роутинг: → region.local_stockpile (3 тика) → overflow → nation.stockpile
  // ════════════════════════════════════════════════════════════
  for (const m of Object.values(GAME_STATE.market)) { m.production_cost = null; }
  if (typeof processAllRecipes === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { processAllRecipes(nationId); } catch (e) { console.warn('[recipes]', e); }
    }
  }

  const allProduced = calculateProduction();

  for (const nationId of Object.keys(GAME_STATE.nations)) {
    try { routeProductionToLocalStockpiles(nationId, allProduced); } catch (e) { console.warn('[route_prod]', e); }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 1.5: ПРОВИНЦИАЛЬНЫЙ И РЕГИОНАЛЬНЫЙ РЫНОК
  //   buildProvinceMarket — агрегирует local_stockpile → prov.market
  //     (транспортная надбавка +15%, −5% при дорогах;
  //      доступ ограничен по effective_control через getProvinceMarketAccess)
  //   updateRegionalMarketPrices — region.local_market[good].price
  //     (±15–20% от мировой цены по балансу local_stockpile)
  // ════════════════════════════════════════════════════════════
  if (typeof buildProvinceMarket === 'function') {
    try { buildProvinceMarket(); } catch (e) { console.warn('[province_market]', e); }
  }
  if (typeof updateRegionalMarketPrices === 'function') {
    try { updateRegionalMarketPrices(); } catch (e) { console.warn('[regional_prices]', e); }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 2: ПОТРЕБЛЕНИЕ POPs
  //   2a. Корзина потребления каждой страты (wealth-зависимая)
  //   2b. Вычесть из stockpile; зафиксировать actual vs demanded
  //   2c. Обновить pop.satisfied = actual / demanded
  // ════════════════════════════════════════════════════════════

  const allConsumed       = {};
  const allActualConsumed = {};

  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    allConsumed[nationId] = calculateConsumption(nation);   // wealth-basket (Stage 6) или flat

    const consumed  = allConsumed[nationId];
    const stockpile = nation.economy.stockpile;
    const actual    = {};

    for (const [good, amount] of Object.entries(consumed)) {
      const available = stockpile[good] || 0;
      actual[good]    = Math.min(amount, available);
      const deficit   = amount - available;

      if (deficit > 0 && good === 'wheat') {
        // Голод!
        const famineMortality = Math.min(
          deficit * CONFIG.BALANCE.FAMINE_MORTALITY,
          nation.population.total * 0.05,
        );
        const newPop       = nation.population.total - Math.round(famineMortality);
        const newHappiness = Math.max(0, nation.population.happiness + CONFIG.BALANCE.HAPPINESS_FROM_FAMINE);
        applyDelta(`nations.${nationId}.population.total`, newPop);
        applyDelta(`nations.${nationId}.population.happiness`, newHappiness);
        addEventLog(
          `${nation.name}: ГОЛОД! Не хватает ${Math.round(deficit)} бушелей зерна. Погибло ${Math.round(famineMortality)} человек.`,
          'danger',
        );
        stockpile.wheat = 0;
      } else {
        stockpile[good] = Math.max(0, available - amount);
      }
    }
    allActualConsumed[nationId] = actual;

    // 2c. Обновить satisfied сразу по нации
    if (typeof updatePopSatisfied === 'function') {
      try { updatePopSatisfied(nationId, consumed, actual); } catch (e) { console.warn('[pops_sat]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 3: ФИНАНСЫ ЗДАНИЙ
  //   3a. revenue / costs / profit / loss_streak
  //   3b. Адаптивное поведение: сокращение рабочих, приостановка, закрытие
  // ════════════════════════════════════════════════════════════
  if (typeof updateBuildingFinancials === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { updateBuildingFinancials(nationId); } catch (e) { console.warn('[bld_fin]', e); }
    }
  }
  if (typeof applyBuildingAdaptiveBehavior === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { applyBuildingAdaptiveBehavior(nationId); } catch (e) { console.warn('[bld_adapt]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 4: ЗАРПЛАТЫ → ДОХОДЫ POPs
  //   4a. Распределить wages → обновить _wage_bonuses (и profit-бонусы)
  //   4b. Обновить pop.wealth на основе incomeAdequacy + priceRatio
  // ════════════════════════════════════════════════════════════
  if (typeof distributeWages === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { distributeWages(nationId); } catch (e) { console.warn('[wages]', e); }
    }
  }

  // ── 4б. КЛАССОВАЯ ЭКОНОМИКА ───────────────────────────────────────────────
  // Читает slot.revenue_last / wages_paid / profit_last (готовы после шагов 3–4).
  // Маршрутизирует:
  //   nation-owned зерновые здания  → treasury
  //   class-owned зерновые здания   → class_capital[owner]
  //   арендная зарплата фермеров    → class_capital.farmers_class
  //   военная зарплата солдат       → treasury → class_capital.soldiers_class
  if (typeof distributeClassIncome === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { distributeClassIncome(nationId); } catch (e) { console.warn('[class_income]', e); }
    }
  }

  // ── 4в. МОНЕТАРНЫЕ РАСХОДЫ НА ПИТАНИЕ ───────────────────────────────────────
  // Работники зданий тратят часть class_capital на покупку пшеницы с рынка.
  // Subsistence-фермеры (не в зданиях) кормят себя напрямую — без транзакции.
  // Вызов до updatePopWealth: изменения class_capital должны быть видны в wealth.
  if (typeof deductFoodPurchases === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { deductFoodPurchases(nationId); } catch (e) { console.warn('[food_purchases]', e); }
    }
  }

  if (typeof updatePopWealth === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { updatePopWealth(nationId); } catch (e) { console.warn('[pops_wealth]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 5: РЫНОК
  //   5a. Сброс production_cost → чистый пересчёт по текущим ценам
  //   5b. Обновить price_floor = production_cost × 0.5
  //   5c. Алгоритм трёх зон (дефицит/баланс/избыток), Этап 2
  //   5d. Запись в price_history (выполняется внутри updateMarketPrices)
  // ════════════════════════════════════════════════════════════
  for (const m of Object.values(GAME_STATE.market)) { m.production_cost = null; }
  if (typeof recomputeAllProductionCosts === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { recomputeAllProductionCosts(nationId); } catch (e) { console.warn('[prod_cost]', e); }
    }
  }
  // Передаём ФАКТИЧЕСКИ потреблённые объёмы (не demanded), чтобы мировой склад
  // и зоны дефицита/баланса/избытка отражали реальные изъятия из stockpile.
  // allConsumed  = demanded (что хотели)
  // allActualConsumed = что реально вычтено (min(demanded, available))
  updateMarketPrices(allProduced, allActualConsumed);

  // ════════════════════════════════════════════════════════════
  // ШАГ 5б: АВТОНОМНОЕ СТРОИТЕЛЬСТВО КЛАССОВ
  //   Классы тратят class_capital на новые здания (после рынка —
  //   чтобы использовать актуальные цены при оценке прибыльности).
  //   Затем проверяем банкротства классов.
  // ════════════════════════════════════════════════════════════
  if (typeof processAutonomousBuilding === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { processAutonomousBuilding(nationId); } catch (e) { console.warn('[auto_build]', e); }
    }
  }
  if (typeof checkClassBankruptcy === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { checkClassBankruptcy(nationId); } catch (e) { console.warn('[class_bankrupt]', e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ШАГ 6: UI / СОБЫТИЯ
  //   6a. Торговля и казна
  //   6b. Применение активных законов
  //   6c. Триггеры событий: затяжной дефицит, банкротство
  // ════════════════════════════════════════════════════════════
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    const tradeProfit = processTrade(nationId);
    const { income, expense, delta } = updateTreasury(
      nationId,
      allProduced[nationId] || {},
      allConsumed[nationId],
      tradeProfit,
    );
    if (nationId === GAME_STATE.player_nation && Math.abs(delta) > 10) {
      const sign = delta >= 0 ? '+' : '';
      addEventLog(
        `Казна: ${sign}${Math.round(delta)} монет (доход ${Math.round(income)}, расход ${Math.round(expense)})`,
        'economy',
      );
    }
  }
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    applyActiveLaws(nationId);
  }
  _checkEconomicEventTriggers();
}

// ──────────────────────────────────────────────────────────────
// ТРИГГЕРЫ ЭКОНОМИЧЕСКИХ СОБЫТИЙ (Шаг 6, Stage 7)
//   • Затяжной дефицит: shortage_streak кратен 5 → предупреждение
//   • Банкротство казны: treasury < 0 → тревога
// ──────────────────────────────────────────────────────────────

function _checkEconomicEventTriggers() {
  // Дефицит товаров (логируем каждые 5 тиков дефицита)
  for (const [good, market] of Object.entries(GAME_STATE.market)) {
    const streak = market.shortage_streak || 0;
    if (streak > 0 && streak % 5 === 0) {
      const goodName = (typeof GOODS !== 'undefined' ? GOODS[good]?.name : null) || good;
      addEventLog(
        `⚠ Затяжной дефицит: ${goodName} (${streak} тиков подряд). Цена: ${Math.round(market.price)}`,
        'economy',
      );
    }
  }

  // Банкротство казны игрока
  const playerNation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (playerNation && playerNation.economy.treasury < 0) {
    addEventLog(
      `⚠ Казна отрицательна (${Math.round(playerNation.economy.treasury)} монет). Риск банкротства!`,
      'danger',
    );
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

      // ── Штраф от высоких налогов (2c) ─────────────────────
      // Ставка > 20% снижает удовлетворённость затронутых классов.
      // Формула: penalty = (rate - 0.20) × 200, макс 40 очков.
      const taxRates = economy.tax_rates_by_class;
      if (taxRates) {
        for (const [group, classIds] of Object.entries(TAX_GROUP_CLASSES)) {
          const rate = taxRates[group] ?? 0;
          if (rate <= 0.20) continue;
          const penalty = -Math.min(40, Math.round((rate - 0.20) * 200));
          for (const classId of classIds) {
            if (!classSat[classId]) continue;
            classSat[classId].satisfaction = Math.max(0, Math.min(100,
              classSat[classId].satisfaction + penalty,
            ));
            classSat[classId].tax_burden = penalty; // для UI
          }
        }
      }

      // Сохраняем в состояние для UI — ПОСЛЕ всех модификаторов (налоги, зарплаты,
      // здания, законы), чтобы UI отражал полную картину удовлетворённости.
      nation.population.class_satisfaction = classSat;

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
        // loyalty_mod сглаживается ×0.3 как morale — не допускаем резких скачков
        if (fx.military_loyalty_mod !== 0) {
          const newLoyalty = Math.max(0, Math.min(100,
            nation.military.loyalty + fx.military_loyalty_mod * 0.3,
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
    // Штраф от налоговой нагрузки учитывается через satisfaction классов (2c):
    // _tpPenalty применяется в блоке «Штраф от высоких налогов» выше.
    // Все нации теперь используют tax_rates_by_class → этот путь не нужен.
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

// ══════════════════════════════════════════════════════════════════════════
// _initEconomyPreview()
//
// Вызывается ОДИН РАЗ при старте игры (initGame) ДО первого хода.
// Заполняет income_per_turn / expense_per_turn / _income_breakdown /
// _expense_breakdown для всех наций, используя ту же формулу, что и
// updateTreasury(), но БЕЗ изменения казны, морали или стабильности.
// ══════════════════════════════════════════════════════════════════════════
function _initEconomyPreview() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    const eco = nation?.economy;
    if (!eco) continue;

    const prof = nation.population?.by_profession || {};
    const mil  = nation.military || {};
    const gov  = nation.government || {};

    // Инициализируем ставки налогов если их нет
    if (!eco.tax_rates_by_class) {
      const rate = eco.tax_rate || 0.10;
      eco.tax_rates_by_class = {
        aristocrats: Math.min(0.30, parseFloat((rate * 1.5).toFixed(2))),
        clergy:      Math.min(0.30, parseFloat((rate * 0.7).toFixed(2))),
        commoners:   Math.min(0.30, parseFloat((rate * 1.0).toFixed(2))),
        soldiers:    Math.min(0.30, parseFloat((rate * 0.4).toFixed(2))),
      };
    }

    const bldBonuses = (typeof getBuildingBonuses === 'function')
      ? getBuildingBonuses(nationId)
      : { tax_mult: 1, port_bonus: 0 };

    // ── Доходы ──────────────────────────────────────────────────────────
    const taxBases = computeTaxGroupBases(prof);
    const r = eco.tax_rates_by_class;
    const taxMult = bldBonuses.tax_mult || 1;
    const taxByClass = {
      aristocrats: Math.round((taxBases.aristocrats || 0) * r.aristocrats * TAX_CALIBRATION * taxMult),
      clergy:      Math.round((taxBases.clergy      || 0) * r.clergy      * TAX_CALIBRATION * taxMult),
      commoners:   Math.round((taxBases.commoners   || 0) * r.commoners   * TAX_CALIBRATION * taxMult),
      soldiers:    Math.round((taxBases.soldiers    || 0) * r.soldiers    * TAX_CALIBRATION * taxMult),
    };
    const taxTotal = taxByClass.aristocrats + taxByClass.clergy
                   + taxByClass.commoners   + taxByClass.soldiers;

    const coastalCount = (nation.regions || []).filter(rId => {
      const reg = GAME_STATE.regions?.[rId];
      return reg && reg.terrain === 'coastal_city';
    }).length;
    const portDuties = Math.round(coastalCount * 120 + (bldBonuses.port_bonus || 0));

    const totalIncome = taxTotal + portDuties;

    // ── Расходы ─────────────────────────────────────────────────────────
    const expLvls  = eco.expense_levels || {};
    const armyLvl  = expLvls.army  ?? 1.0;
    const navyLvl  = expLvls.navy  ?? 1.0;
    const courtLvl = expLvls.court ?? 1.0;

    const expArmy = Math.round((
      (mil.infantry    || 0) * CONFIG.BALANCE.INFANTRY_UPKEEP  +
      (mil.cavalry     || 0) * CONFIG.BALANCE.CAVALRY_UPKEEP   +
      (mil.mercenaries || 0) * CONFIG.BALANCE.MERCENARY_UPKEEP
    ) * armyLvl);
    const expNavy = Math.round((mil.ships || 0) * CONFIG.BALANCE.SHIP_UPKEEP * navyLvl);

    const aliveChars  = (nation.characters || []).filter(c => c.alive !== false);
    const advisorCnt  = aliveChars.filter(c => c.role === 'advisor').length;
    const expCourt    = Math.round((aliveChars.length * 15 + advisorCnt * 50) * courtLvl);

    const stability   = gov.stability ?? 50;
    const expStab     = Math.round(200 * (1 - stability / 100));
    const expSlaves   = Math.round((prof.slaves || 0) * CONFIG.BALANCE.SLAVE_UPKEEP);

    const totalExpense = expArmy + expNavy + expCourt + expStab + expSlaves;

    // ── Записываем только поля UI (казна не меняется) ───────────────────
    eco.income_per_turn  = totalIncome;
    eco.expense_per_turn = totalExpense;
    eco._income_breakdown = {
      tax_aristocrats: taxByClass.aristocrats,
      tax_clergy:      taxByClass.clergy,
      tax_commoners:   taxByClass.commoners,
      tax_soldiers:    taxByClass.soldiers,
      port_duties:     portDuties,
      trade_profit:    0,
      total:           totalIncome,
    };
    eco._expense_breakdown = {
      army:       expArmy,
      navy:       expNavy,
      court:      expCourt,
      stability:  expStab,
      slaves:     expSlaves,
      total:      totalExpense,
    };
  }
}
