// ═══════════════════════════════════════════════════════════════════════════
// ДВИЖОК ЗДАНИЙ — строительство, производство, зарплаты
//
// Порядок вызова в turn.js:
//   1. processBuildingConstruction()   ← до runEconomyTick()
//   2. runEconomyTick()               ← читает buildingProduction
//   3. distributeWages(nationId)      ← после runEconomyTick(), для игрока
//
// Ключевые концепции:
//   • region.building_slots[]   — активные / строящиеся здания региона
//   • region.construction_queue[] — очередь строительства (ходы до завершения)
//   • region.employment{}       — занятые рабочие (обновляется здесь)
//   • nation.population._wage_bonuses{} — satisfaction-бонус от зарплат
//   • nation.population._unemployment_rates{} — для UI и демографии
// ═══════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ
// ──────────────────────────────────────────────────────────────

// Суммарное число рабочих в слоте
function _slotTotalWorkers(slot) {
  if (!slot.workers) return 0;
  return Object.values(slot.workers).reduce((s, v) => s + v, 0);
}

// Бонус к производству товара по типу местности или биому региона.
// Сначала проверяет region.biome (13 биомов), затем region.terrain (5 старых типов).
// Используется в _calcSlotBaseOutput как terrainBonus.
function _terrainGoodBonus(terrain, good) {
  const TABLE = {
    // ── Старые типы местности (backward-compat) ───────────────────────────
    plains:       { wheat: 1.15, barley: 1.10, wool:   1.10 },
    hills:        { wine:  1.20, olive_oil: 1.15, iron: 1.10, sulfur: 1.15 },
    mountains:    { iron:  1.20, bronze: 1.15, timber: 1.10, sulfur: 1.30 },
    coastal_city: { fish:  1.20, salt:   1.20, trade_goods: 1.15, tuna: 1.25 },

    // ── 13 биомов (region.biome) ──────────────────────────────────────────
    // Бонусы пшеницы выведены из BIOME_META.agriculture.yield_kg
    // (нормализация: mediterranean_hills = 1.00 как базовый уровень)
    //
    // biome              yield_kg  wheat  barley  wine   olive  iron   timber fish  trade  salt
    river_valley:       { wheat: 1.40, barley: 1.30, cloth: 1.15, pottery: 1.10, papyrus: 1.20 },
    mediterranean_coast:{ wheat: 1.15, barley: 1.10, fish: 1.30, salt: 1.20, trade_goods: 1.25, tuna: 1.20 },
    mediterranean_hills:{ wheat: 1.00, barley: 1.00, wine: 1.35, olive_oil: 1.30 },
    steppe:             { wheat: 0.85, barley: 0.90, wool: 1.20, leather: 1.10 },
    temperate_forest:   { wheat: 0.80, barley: 0.85, timber: 1.30, wool: 1.10 },
    volcanic:           { wheat: 1.05, barley: 1.00, sulfur: 1.40, wine: 1.15 },
    subtropical:        { wheat: 0.70, barley: 0.75, fish: 1.10, trade_goods: 1.10 },
    semi_arid:          { wheat: 0.45, barley: 0.55, salt: 1.15 },
    savanna:            { wheat: 0.30, barley: 0.35, ivory: 1.50 },
    alpine:             { wheat: 0.20, barley: 0.25, iron: 1.15, timber: 1.20 },
    arctic:             { wheat: 0.05, barley: 0.05, fish: 1.20, furs: 1.50 },
    desert:             { wheat: 0.05, barley: 0.10, salt: 1.10, trade_goods: 0.80 },
    tropical:           { wheat: 0.15, barley: 0.20, fish: 1.15 },
  };
  return TABLE[terrain]?.[good] ?? 1.0;
}

// ──────────────────────────────────────────────────────────────
// 1. ПЕРЕСЧЁТ ЗАНЯТОСТИ РЕГИОНА
// Вызывается всякий раз, когда building_slots меняются.
// ──────────────────────────────────────────────────────────────

function recalculateRegionEmployment(region) {
  const emp = region.employment;
  if (!emp) return;

  // Сбрасываем
  for (const k of Object.keys(emp)) emp[k] = 0;

  for (const slot of (region.building_slots || [])) {
    if (slot.status !== 'active') continue;
    const level = slot.level || 1;
    for (const [prof, count] of Object.entries(slot.workers || {})) {
      emp[prof] = (emp[prof] || 0) + count * level;
    }
  }
}

// Пересчитать занятость для всех регионов нации
function recalculateAllEmployment(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  for (const rid of nation.regions) {
    const r = GAME_STATE.regions[rid];
    if (r) recalculateRegionEmployment(r);
  }
}

// ──────────────────────────────────────────────────────────────
// 2а. БАЗОВЫЙ ВЫХОД ЗДАНИЯ (без учёта рецептов и наличия сырья)
// Используется как внутренний примитив: processAllRecipes() и
// getBuildingOutput() вызывают его, чтобы не дублировать логику.
// ──────────────────────────────────────────────────────────────

// Возвращает эффективное число рабочих слота с учётом slave_fallback_profession:
// если nation.population.by_profession.slaves === 0, рабские слоты → farmers.
function _getEffectiveWorkers(slot, bDef, nation) {
  const w = { ...(slot.workers || {}) };
  const fallback = bDef?.slave_fallback_profession;
  if (fallback && (w.slaves ?? 0) > 0) {
    const slavePop = nation?.population?.by_profession?.slaves ?? 0;
    if (slavePop === 0) {
      // Рабов нет в нации → весь слот занимают фермеры
      w[fallback] = (w[fallback] || 0) + w.slaves;
      w.slaves = 0;
    }
  }
  return w;
}

function _calcSlotBaseOutput(slot, region, nation) {
  if (!slot || slot.status !== 'active') return {};

  const bDef = BUILDINGS[slot.building_id];
  if (!bDef || !bDef.production_output?.length) return {};

  // Биом имеет приоритет над старым terrain-типом для бонусов к урожаю
  const terrain    = region.biome || region.terrain || region.type || 'plains';
  const fertility  = region.fertility ?? 0.7;
  const satMod     = nation.population._production_mod ?? 1.0;
  const level      = slot.level || 1;

  // Учитываем замену рабов фермерами при нехватке рабов в нации
  const effectiveWorkers = _getEffectiveWorkers(slot, bDef, nation);
  const workers = Object.values(effectiveWorkers).reduce((s, v) => s + v, 0) * level;

  if (workers <= 0) return {};

  // production_eff: 0.0–1.0, снижается при убытках (Stage 4).
  const eff = slot.production_eff ?? 1.0;
  if (eff <= 0) return {};

  // _pop_eff: 0.7–1.0, зависит от удовлетворённости рабочих (Stage 6).
  const popEff = slot._pop_eff ?? 1.0;

  // efficiency_mult: масштабный коэффициент урожайности на га (1.0 / 1.3 / 1.8).
  // Задаётся в определении здания; отсутствие поля = 1.0 (не влияет).
  const effMult = bDef.efficiency_mult ?? 1.0;

  const output = {};
  for (const { good, base_rate } of bDef.production_output) {
    const terrainBonus = _terrainGoodBonus(terrain, good);
    // base_rate: канонический выход на 1000 рабочих (без масштабного коэф.)
    // effMult: умножитель эффективности за счёт масштаба хозяйства
    const amount = (workers / 1000) * base_rate * effMult * fertility * satMod * terrainBonus * eff * popEff;
    if (amount > 0.1) output[good] = (output[good] || 0) + amount;
  }

  return output;
}

// ──────────────────────────────────────────────────────────────
// 2б. ВЫХОД ЗДАНИЯ С УЧЁТОМ РЕЦЕПТОВ
// Возвращает { good: amount } для одного активного слота.
// Если processAllRecipes() уже отработал в этом тике,
// slot._recipe_ratios содержит production_ratio для каждого товара
// и фактический выход масштабируется (частичное производство).
// ──────────────────────────────────────────────────────────────

function getBuildingOutput(slot, region, nation) {
  const base   = _calcSlotBaseOutput(slot, region, nation);
  const ratios = slot._recipe_ratios;

  // Нет рецептов или рецепты ещё не обработаны → полный выход
  if (!ratios || Object.keys(ratios).length === 0) return base;

  const scaled = {};
  for (const [good, amount] of Object.entries(base)) {
    // Если для этого товара есть рецепт — применяем коэффициент,
    // иначе (товар без рецептурных входов) берём ratio = 1.0
    const ratio = Object.prototype.hasOwnProperty.call(ratios, good) ? ratios[good] : 1.0;
    const actual = amount * ratio;
    if (actual > 0.1) scaled[good] = actual;
  }
  return scaled;
}

// ──────────────────────────────────────────────────────────────
// 2в. ОБРАБОТКА РЕЦЕПТОВ ДЛЯ ОДНОЙ НАЦИИ
//
// Вызывается в начале каждого тика (до calculateProduction).
// Для каждого активного здания с рецептом:
//   1. Считает ожидаемый выход (через _calcSlotBaseOutput)
//   2. Определяет нужное количество входных материалов
//   3. Вычисляет production_ratio = min(available/needed) по всем входам
//   4. Потребляет scaled-количество из nation.economy.stockpile
//   5. Сохраняет ratio в slot._recipe_ratios
//   6. Считает production_cost (per unit) для каждого товара
//
// После обхода всех зданий обновляет GAME_STATE.market[good].production_cost
// (средневзвешенное по всем активным рецептам, производящим этот товар).
// ──────────────────────────────────────────────────────────────

function processAllRecipes(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const stockpile = nation.economy.stockpile;
  const market    = GAME_STATE.market;
  const isPlayer  = (nationId === GAME_STATE.player_nation);

  // Аккумулятор себестоимостей: { good: [cost1, cost2, ...] }
  // Несколько зданий могут производить один товар — берём среднее.
  const goodCosts = {};

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const recipes = (typeof BUILDING_RECIPES !== 'undefined')
                      ? BUILDING_RECIPES[slot.building_id]
                      : null;

      if (!recipes?.length) {
        // Нет рецепта → ratio = 1.0, не трогаем старые _recipe_ratios
        slot._recipe_ratios = {};
        continue;
      }

      // Ожидаемый выход за тик (полный, без учёта дефицита)
      const baseOutput = _calcSlotBaseOutput(slot, region, nation);
      const ratios     = {};

      for (const recipe of recipes) {
        const good           = recipe.output_good;
        const expectedOutput = baseOutput[good] || 0;

        if (expectedOutput <= 0) {
          ratios[good] = 0;
          continue;
        }

        // ── Расчёт production_ratio ────────────────────────────────────────
        let ratio = 1.0;
        for (const input of recipe.inputs) {
          const needed    = expectedOutput * input.amount;
          if (needed <= 0) continue;
          const available = stockpile[input.good] || 0;
          ratio = Math.min(ratio, available / needed);
        }
        ratio = Math.max(0, Math.min(1.0, ratio));
        ratios[good] = ratio;

        // ── Потребляем входные материалы (scaled) ─────────────────────────
        const actualOutput = expectedOutput * ratio;
        for (const input of recipe.inputs) {
          const consumed = actualOutput * input.amount;
          if (consumed > 0) {
            stockpile[input.good] = Math.max(0,
              (stockpile[input.good] || 0) - consumed
            );
          }
        }

        // ── Предупреждение при существенном дефиците (только игрок) ───────
        if (isPlayer && ratio < 0.5 && ratio > 0) {
          const missingInputs = recipe.inputs
            .filter(inp => (stockpile[inp.good] || 0) < expectedOutput * inp.amount)
            .map(inp => (typeof GOODS !== 'undefined' ? GOODS[inp.good]?.name : inp.good) || inp.good)
            .join(', ');
          if (missingInputs && typeof addEventLog === 'function') {
            const bName = (typeof BUILDINGS !== 'undefined' ? BUILDINGS[slot.building_id]?.name : null)
                         || slot.building_id;
            addEventLog(
              `⚠ ${bName}: нехватка (${missingInputs}), производство ${good} — ${Math.round(ratio * 100)}%`,
              'warning'
            );
          }
        }

        // ── Себестоимость: Σ(input.amount × price) + labor_cost ───────────
        let cost = recipe.labor_cost_per_worker;
        for (const input of recipe.inputs) {
          const price = market[input.good]?.price
                     ?? (typeof GOODS !== 'undefined' ? GOODS[input.good]?.base_price : null)
                     ?? 10;
          cost += input.amount * price;
        }
        if (!goodCosts[good]) goodCosts[good] = [];
        goodCosts[good].push(cost);
      }

      slot._recipe_ratios = ratios;
    }
  }

  // ── Обновляем production_cost в мировом рынке ──────────────────────────
  // Для каждого товара берём среднее по всем активным рецептам нации.
  // Это немедленно влияет на price_floor при следующем вызове updateMarketPrices.
  for (const [good, costs] of Object.entries(goodCosts)) {
    if (!market[good]) continue;
    const avg = costs.reduce((s, c) => s + c, 0) / costs.length;

    // Берём максимум с предыдущим значением, чтобы не занижать из-за
    // одной дешёвой нации при нескольких производителях.
    // Для первого тика (null) просто устанавливаем.
    const prev = market[good].production_cost;
    market[good].production_cost = Math.round(
      (prev == null ? avg : Math.max(prev, avg)) * 10
    ) / 10;
  }
}

// ──────────────────────────────────────────────────────────────
// 2б. ПЕРЕСЧЁТ СЕБЕСТОИМОСТИ (Шаг 5 тика, Stage 7)
//
// Чистое чтение — НЕ трогает stockpile, НЕ обновляет recipe_ratios.
// Пересчитывает market[good].production_cost по текущим рыночным ценам.
// Вызывается в Шаге 5 (РЫНОК) после зарплат, чтобы price_floor
// отражал актуальные издержки перед updateMarketPrices().
// ──────────────────────────────────────────────────────────────

function recomputeAllProductionCosts(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const market    = GAME_STATE.market;
  const recipes   = (typeof BUILDING_RECIPES !== 'undefined') ? BUILDING_RECIPES : {};
  const goodCosts = {};

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      for (const recipe of (recipes[slot.building_id] || [])) {
        const good = recipe.output_good;
        let cost   = recipe.labor_cost_per_worker;

        for (const input of (recipe.inputs || [])) {
          const price = market[input.good]?.price
            ?? (typeof GOODS !== 'undefined' ? GOODS[input.good]?.base_price : null)
            ?? 10;
          cost += input.amount * price;
        }

        if (!goodCosts[good]) goodCosts[good] = [];
        goodCosts[good].push(cost);
      }
    }
  }

  for (const [good, costs] of Object.entries(goodCosts)) {
    if (!market[good]) continue;
    const avg  = costs.reduce((s, c) => s + c, 0) / costs.length;
    const prev = market[good].production_cost;
    market[good].production_cost = Math.round(
      (prev == null ? avg : Math.max(prev, avg)) * 10
    ) / 10;
  }
}

// ──────────────────────────────────────────────────────────────
// 3. ПРОИЗВОДСТВО ВСЕХ ЗДАНИЙ НАЦИИ
// Суммирует выход по всем активным слотам всех регионов.
// Возвращает { good: totalAmount } — добавляется к общей выработке.
// ──────────────────────────────────────────────────────────────

function calculateAllBuildingProduction(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return {};

  const totals = {};

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;
      const out = getBuildingOutput(slot, region, nation);
      for (const [good, amount] of Object.entries(out)) {
        totals[good] = (totals[good] || 0) + amount;
      }
    }
  }

  return totals;
}

// ──────────────────────────────────────────────────────────────
// 4. СТРОИТЕЛЬСТВО — продвигаем очередь на один ход
// Вызывается ПЕРЕД runEconomyTick() в turn.js.
// ──────────────────────────────────────────────────────────────

function processBuildingConstruction() {
  // Обрабатываем строительные очереди ВСЕХ наций (игрока + AI + автономные классы).
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    const nation = GAME_STATE.nations[nationId];
    if (!nation) continue;

    for (const rid of nation.regions) {
      const region = GAME_STATE.regions[rid];
      if (!region?.construction_queue?.length) continue;

      const completedIds = [];

      for (const entry of region.construction_queue) {
        entry.turns_left = Math.max(0, entry.turns_left - 1);

        if (entry.turns_left <= 0) {
          _completeConstruction(entry, region, rid);
          completedIds.push(entry.slot_id);
        }
      }

      // Убираем завершённые из очереди
      if (completedIds.length) {
        region.construction_queue = region.construction_queue.filter(
          e => !completedIds.includes(e.slot_id),
        );
        recalculateRegionEmployment(region);
      }
    }
  }
}

function _completeConstruction(entry, region, regionId) {
  const bDef = BUILDINGS[entry.building_id];
  if (!bDef) return;

  const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[regionId]?.name) || regionId;

  // ── Улучшение: повышаем уровень существующего слота ──────────────────────
  if (entry.is_upgrade) {
    const slot = (region.building_slots || [])
      .find(s => s.slot_id === entry.target_slot_id);
    if (slot) {
      slot.level = entry.to_level;
    }
    if (typeof addEventLog === 'function') {
      addEventLog(`⬆ ${bDef.icon || ''} ${bDef.name} улучшено до уровня ${entry.to_level} в ${rName}!`, 'good');
    }
    return;
  }

  // ── Новое здание ─────────────────────────────────────────────────────────
  const workers = {};
  for (const wp of (bDef.worker_profession || [])) {
    if (wp.count > 0) workers[wp.profession] = wp.count;
  }
  // Fix #5: здания без рабочих (forum, road и т.д.) — это норма; предупреждаем
  // только если worker_profession заявлен непустым, но ни одна запись не валидна.
  if ((bDef.worker_profession?.length ?? 0) > 0 && Object.keys(workers).length === 0) {
    console.warn(`[buildings] ${entry.building_id}: worker_profession определён, но ни один рабочий не добавлен`);
  }

  // owner: кто владеет зданием и получает прибыль (profit_portion).
  //   'nation'         — построено игроком или AI; прибыль → казна
  //   'aristocrats'    — построено классом аристократов; прибыль → class_capital
  //   'soldiers_class' — построено классом солдат; прибыль → class_capital
  //   'farmers_class'  — построено классом земледельцев; прибыль → class_capital
  // entry.owner задаётся при постановке в очередь; по умолчанию 'nation'.
  const slotOwner = entry.owner ?? 'nation';

  region.building_slots.push({
    slot_id:      entry.slot_id,
    building_id:  entry.building_id,
    status:       'active',
    level:        1,
    workers,
    owner:        slotOwner,
    founded_turn:           GAME_STATE.turn,
    revenue:                0,
    wages_paid:             0,
    // ── Stage 4: финансовый журнал и адаптивное поведение ──────────────────
    production_eff:         1.0,   // 0.0–1.0; снижается при убытках
    loss_streak:            0,     // тиков подряд в убытке
    revenue_last:           0,     // выручка за прошлый тик
    costs_last:             0,     // затраты за прошлый тик
    profit_last:            0,     // чистая прибыль за прошлый тик
    construction_cost_cached: bDef.cost || 0,  // стоимость постройки по ценам тика
  });

  if (typeof addEventLog === 'function') {
    addEventLog(`🏗 ${bDef.icon || ''} ${bDef.name} завершено в ${rName}!`, 'good');
  }
}

// ──────────────────────────────────────────────────────────────
// 5. ВЫРУЧКА ЗДАНИЯ (в денариях за ход)
// ──────────────────────────────────────────────────────────────

function calculateBuildingRevenue(slot, region, nation) {
  const output = getBuildingOutput(slot, region, nation);
  let revenue  = 0;
  for (const [good, amount] of Object.entries(output)) {
    const price = GAME_STATE.market?.[good]?.price
               ?? (typeof GOODS !== 'undefined' ? GOODS[good]?.base_price : null)
               ?? 10;
    revenue += amount * price;
  }
  return revenue;
}

// ──────────────────────────────────────────────────────────────
// 6. РАСПРЕДЕЛЕНИЕ ЗАРПЛАТ
//
// Для каждого активного здания:
//   • Считает выручку
//   • Вычисляет зарплатный фонд (revenue × wage_rate)
//   • Формирует satisfaction-бонус рабочим (_wage_bonuses)
//   • Остаток прибыли → бонус классу-владельцу
//   • Записывает в slot.revenue, slot.wages_paid
//
// Вызывается ПОСЛЕ runEconomyTick() в turn.js.
// ──────────────────────────────────────────────────────────────

// Ожидаемая зарплата на одного рабочего в ход (денарии).
//
// Калибровка: при типичном здании (400 рабочих, wage_rate 0.25, выручка ~700 ден)
//   реальная зарплата ≈ 700×0.25 / 400 = 0.44 ден/рабочего.
//   EXPECTED=0.5 → adequacy ≈ 0.88 → satBonus ≈ −2. Нейтральный результат.
// При богатом здании (рудник, 200 ремесленников, выручка 3000, ставка 0.10):
//   wages = 300; только ремесленники (нет рабов): 300/200 = 1.5 ден/рабочего → adequacy 3 → cap +20.
// При бедном (гончарня 200 рабочих, выручка 290, ставка 0.28):
//   wages = 81; 81/200 = 0.41 → adequacy 0.82 → satBonus −4. Умеренный минус.
const EXPECTED_WAGE_PER_WORKER = 0.5;

// Типы труда, для которых зарплатный satisfaction-бонус НЕ применяется.
// self/none: самозанятые и пустые здания получают удовлетворение иначе.
// slave:     рабы работают принудительно — зарплата не мотивирует.
const _WAGE_BONUS_SKIP = new Set(['self', 'none', 'slave']);

// Маппинг профессия → класс-владелец прибыли
const PROFIT_CLASS = {
  wage:    'citizens',      // работодатели — граждане
  tenant:  'aristocrats',   // арендодатели — аристократы
  slave:   'aristocrats',   // рабовладельцы
  mixed:   'citizens',
  self:    null,            // самозанятые — сами получают
  state:   null,            // государство
  none:    null,
};

function distributeWages(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Аккумуляторы satisfaction-бонусов по профессиям (wage-satisfaction)
  const bonusAccum  = {};  // prof → sum(satBonus × count)
  const workerAccum = {};  // prof → total workers contributing

  // Бонус класса-владельца (от чистой прибыли зданий)
  const profitAccum = {};  // classId → total profit

  // Прямые бонусы к счастью классов (от amenity-зданий: таверна, акведук и т.д.)
  const classBldBonus = {};  // classId → cumulative bonus

  let totalWagesPaid   = 0;
  let totalMaintenance = 0;

  const maintCost = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.BUILDING_MAINTENANCE) || 50;

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef = BUILDINGS[slot.building_id];
      if (!bDef) continue;

      const revenue   = calculateBuildingRevenue(slot, region, nation);
      const wageRate  = bDef.wage_rate  ?? 0;
      const laborType = bDef.labor_type ?? 'none';
      const level     = slot.level || 1;
      const wages     = revenue * wageRate;
      const profit    = revenue - wages - maintCost * level;

      slot.revenue    = Math.round(revenue);
      slot.wages_paid = Math.round(wages);
      totalWagesPaid    += wages;
      totalMaintenance  += maintCost;

      const totalWorkers = _slotTotalWorkers(slot);
      const hasOutput    = (bDef.production_output?.length ?? 0) > 0;

      // ── Зарплатный satisfaction-бонус рабочим ──────────────────────────
      // Применяется только если:
      //   • здание производит что-то на продажу (есть выручка),
      //   • тип труда предполагает зарплату (не self/none/slave),
      //   • фактически выплачены деньги.
      if (hasOutput && wages > 0 && totalWorkers > 0 && !_WAGE_BONUS_SKIP.has(laborType)) {
        for (const [prof, count] of Object.entries(slot.workers)) {
          if (!count) continue;
          if (prof === 'slaves') continue;  // рабы не получают зарплатного бонуса

          const profShare     = wages * (count / totalWorkers);
          const expectedTotal = count * EXPECTED_WAGE_PER_WORKER;
          // adequacy > 1 = хорошие условия, < 1 = плохие
          const adequacy = profShare / Math.max(expectedTotal, 1);
          // satBonus: −15 (голодная нищета) … 0 (норма) … +20 (щедро)
          const satBonus = Math.round(Math.max(-15, Math.min(20, (adequacy - 1) * 20)));

          bonusAccum[prof]  = (bonusAccum[prof]  || 0) + satBonus * count;
          workerAccum[prof] = (workerAccum[prof] || 0) + count;
        }
      }

      // ── Прибыль владельцу ──────────────────────────────────────────────
      const ownerClass = PROFIT_CLASS[laborType];
      if (ownerClass && profit > 0) {
        profitAccum[ownerClass] = (profitAccum[ownerClass] || 0) + profit;
      }

      // ── Amenity-бонус: таверна, акведук, храм, форум и т.д. ───────────
      const bldClassBonus = bDef.class_happiness_bonus || {};
      for (const [classId, bonus] of Object.entries(bldClassBonus)) {
        classBldBonus[classId] = (classBldBonus[classId] || 0) + bonus;
      }

      // ── Производственный cost-сигнал (Этап 8) ──────────────────────────
      // Если рыночная цена главного товара здания ниже production_cost,
      // здание структурно убыточно — флаг _below_cost ускоряет адаптацию
      // (в applyBuildingAdaptiveBehavior: нет льготного периода 1–3 тика).
      const bldRecipes = (typeof BUILDING_RECIPES !== 'undefined')
                         ? (BUILDING_RECIPES[slot.building_id] ?? []) : [];
      let isBelowCost = false;
      for (const recipe of bldRecipes) {
        const mkt = GAME_STATE.market[recipe.output_good];
        if (mkt?.production_cost != null && mkt.price < mkt.production_cost * 0.95) {
          isBelowCost = true;
          break;
        }
      }
      slot._below_cost = isBelowCost;
    }
  }

  // ── Итоговые wage_bonuses (взвешенное среднее по рабочим) ───────────────
  const wageBonuses = {};
  for (const prof of Object.keys(bonusAccum)) {
    const n = workerAccum[prof] || 1;
    wageBonuses[prof] = Math.round(bonusAccum[prof] / n);
  }
  nation.population._wage_bonuses = wageBonuses;

  // ── Profit-бонус классам-владельцам ────────────────────────────────────
  // Каждые 1000 монет чистой прибыли = +1 к satisfaction, максимум +15.
  const profitBonuses = {};
  for (const [classId, totalProfit] of Object.entries(profitAccum)) {
    profitBonuses[classId] = Math.min(15, Math.floor(totalProfit / 1000));
  }
  nation.population._profit_class_bonuses = profitBonuses;

  // ── Amenity-бонусы зданий (суммарные по нации) ──────────────────────────
  // Каждый +1 из здания суммируется; итог capped на +25 на класс в updateHappiness.
  nation.population._class_building_bonuses = classBldBonus;

  // ── Экономическая статистика ────────────────────────────────────────────
  nation.economy._building_wages_per_turn       = Math.round(totalWagesPaid);
  nation.economy._building_maintenance_per_turn = Math.round(totalMaintenance);
}

// ══════════════════════════════════════════════════════════════
// 6б. КЛАССОВАЯ ЭКОНОМИКА — distributeClassIncome(nationId)
//
// Маршрутизирует прибыль зданий в системе классовой собственности.
//
// Читает slot.revenue_last / slot.wages_paid / slot.profit_last
// (заполняются в updateBuildingFinancials + distributeWages на шагах 3–4).
//
// Обрабатывает ТОЛЬКО здания с bDef.autonomous_builder (пшеничные):
//   wheat_family_farm, wheat_villa, wheat_latifundium.
//
// ПОТОКИ ПРИБЫЛИ:
//   slot.owner === 'nation':
//     profit_last > 0  → economy.treasury  (прямой доход казны)
//
//   slot.owner === 'farmers_class':
//     wages_paid + profit_last  → class_capital.farmers_class
//     (самозанятые: трудовая + земельная части дохода)
//
//   slot.owner === 'aristocrats' / 'soldiers_class':
//     profit_last > 0  → class_capital[owner]
//     wages_paid       → class_capital.farmers_class (арендаторы-земледельцы)
//
// ВОЕННАЯ ЗАРПЛАТА:
//   soldiersPop × SOLDIER_SALARY (из config.js) → treasury → soldiers_class
//
// ПРИМЕЧАНИЕ по maintenance: profit_last уже включает вычет обслуживания.
//   updateTreasury вычитает его повторно через _building_maintenance_per_turn
//   (~50 ден./здание/тик — допустимая погрешность для текущей версии).
//
// ВЫЗОВ: после distributeWages() в ШАГ 4 runEconomyTick().
// ══════════════════════════════════════════════════════════════
function distributeClassIncome(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const economy = nation.economy;

  // Lazy init — гарантируем поля для загруженных сохранений (без class_capital)
  if (!economy.class_capital) {
    economy.class_capital = { aristocrats: 0, soldiers_class: 0, farmers_class: 0 };
  }
  if (!economy.class_income_per_capita) {
    economy.class_income_per_capita = { aristocrats: 0, soldiers_class: 0, farmers_class: 0 };
  }
  const cc = economy.class_capital;

  // Накопители дохода за этот тик — нужны для per-capita (только UI)
  const incomeTick = { aristocrats: 0, soldiers_class: 0, farmers_class: 0 };

  // ── Доходы зданий ──────────────────────────────────────────────────────────
  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef = BUILDINGS[slot.building_id];
      // Только здания классовой экономики (autonomous_builder задан)
      if (!bDef?.autonomous_builder) continue;

      const wages      = slot.wages_paid   ?? 0;  // revenue × wage_rate (руб рабочим)
      const profitLast = slot.profit_last  ?? 0;  // чистая прибыль после всех затрат
      const slotOwner  = slot.owner        ?? 'nation';

      if (slotOwner === 'farmers_class') {
        // ── Самозанятые земледельцы (семейная ферма) ────────────────────────
        // Трудовая доля (wages) + земельная прибыль (profitLast) = весь доход
        const totalFarmerIncome = wages + Math.max(0, profitLast);
        if (totalFarmerIncome > 0) {
          cc.farmers_class             = (cc.farmers_class || 0) + totalFarmerIncome;
          incomeTick.farmers_class    += totalFarmerIncome;
        }

      } else {
        // ── Наёмные арендаторы (вилла / латифундия) ─────────────────────────
        // Зарплата → всегда земледельцам (они физически работают на земле)
        if (wages > 0) {
          cc.farmers_class            = (cc.farmers_class || 0) + wages;
          incomeTick.farmers_class   += wages;
        }

        // Чистая прибыль → владельцу здания
        if (profitLast > 0) {
          if (slotOwner === 'nation') {
            // Государственная латифундия: прибыль прямо в казну
            economy.treasury = (economy.treasury || 0) + profitLast;
          } else if (cc[slotOwner] !== undefined) {
            // Классовая собственность: аристократы / солдаты
            cc[slotOwner]              = (cc[slotOwner] || 0) + profitLast;
            incomeTick[slotOwner]      = (incomeTick[slotOwner] || 0) + profitLast;
          }
        }
      }
    }
  }

  // ── Военная зарплата: казна → soldiers_class ───────────────────────────────
  // Солдаты получают жалованье от государства (SOLDIER_SALARY ден./чел./тик).
  // Сумма ограничена текущим балансом казны (не уходим в минус из-за зарплат).
  const soldiersPop     = nation.population.by_profession?.soldiers ?? 0;
  const salaryPerPerson = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.SOLDIER_SALARY) || 2;
  const totalSalary     = Math.round(soldiersPop * salaryPerPerson);
  if (totalSalary > 0) {
    const paid = Math.min(totalSalary, Math.max(0, economy.treasury || 0));
    if (paid > 0) {
      economy.treasury           -= paid;
      cc.soldiers_class           = (cc.soldiers_class || 0) + paid;
      incomeTick.soldiers_class  += paid;
    }
  }

  // ── class_income_per_capita: средний доход на человека за тик (UI) ─────────
  const classPops = (typeof calculateClassPopulations === 'function')
    ? calculateClassPopulations(nation.population.by_profession || {})
    : {};
  const cipc = economy.class_income_per_capita;
  for (const [cls, income] of Object.entries(incomeTick)) {
    const pop  = Math.max(1, classPops[cls] ?? 1);
    cipc[cls]  = Math.round((income / pop) * 10) / 10;  // 1 знак после запятой
  }
}

// ══════════════════════════════════════════════════════════════
// 6в. ЧИСЛОВАЯ ОЦЕНКА ПРИБЫЛЬНОСТИ РЕГИОНА — _estimateSlotProfit
//
// Возвращает числовую прибыль (не bool) для здания в конкретном регионе.
// Используется processAutonomousBuilding для выбора лучшего региона.
// ══════════════════════════════════════════════════════════════
function _estimateSlotProfit(buildingId, region, nation) {
  const bDef = BUILDINGS[buildingId];
  if (!bDef) return -Infinity;

  const tempSlot = {
    building_id:    buildingId,
    status:         'active',
    level:          1,
    production_eff: 1.0,
    workers:        {},
    _recipe_ratios: {},
    owner:          'nation',
  };

  if (bDef.worker_profession) {
    for (const { profession, count } of bDef.worker_profession) {
      tempSlot.workers[profession] = count;
    }
  }

  const baseOut   = _calcSlotBaseOutput(tempSlot, region, nation);
  const market    = GAME_STATE.market;
  const maintCost = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.BUILDING_MAINTENANCE) || 50;

  let gross = 0;
  for (const [g, amt] of Object.entries(baseOut)) {
    gross += amt * (market[g]?.price ?? 10);
  }

  const wages = gross * (bDef.wage_rate ?? 0);

  let inputCosts = 0;
  const recipes = (typeof BUILDING_RECIPES !== 'undefined')
    ? (BUILDING_RECIPES[buildingId] ?? []) : [];
  for (const recipe of recipes) {
    const baseAmt = baseOut[recipe.output_good] || 0;
    for (const input of recipe.inputs) {
      const price = market[input.good]?.price
        ?? (typeof GOODS !== 'undefined' ? GOODS[input.good]?.base_price : null)
        ?? 10;
      inputCosts += baseAmt * input.amount * price;
    }
  }

  return gross - inputCosts - wages - maintCost;
}

// ══════════════════════════════════════════════════════════════
// 6г. АВТОНОМНОЕ СТРОИТЕЛЬСТВО КЛАССОВ — processAutonomousBuilding(nationId)
//
// Классы тратят накопленный class_capital на постройку новых зданий.
//
// Порог: bDef.cost + _CLASS_SAFETY_RESERVE
//   _CLASS_SAFETY_RESERVE = 3000 = 5 лет × 12 тиков × 50 коп. обслуживания
//
// Алгоритм:
//   Для каждого класса находим здание с autonomous_builder === cls,
//   перебираем все регионы нации, выбираем регион с наибольшей оценочной прибылью
//   (canBuildInRegion ok + _estimateSlotProfit максимальна).
//   Помещаем запись в construction_queue с entry.owner = cls.
//   Вычитаем bDef.cost из class_capital[cls].
//   Максимум 1 здание за класс за тик.
//
// ВЫЗОВ: после updateMarketPrices() — ШАГ 5 runEconomyTick().
// ══════════════════════════════════════════════════════════════
const _CLASS_SAFETY_RESERVE = 3000;

function processAutonomousBuilding(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const economy  = nation.economy;
  if (!economy.class_capital) return;

  const cc       = economy.class_capital;
  const isPlayer = (nationId === GAME_STATE.player_nation);

  // Карта: cls → [buildingId]
  const autoBuildingsByClass = {};
  for (const [bid, bDef] of Object.entries(BUILDINGS)) {
    const cls = bDef.autonomous_builder;
    if (!cls) continue;
    if (!autoBuildingsByClass[cls]) autoBuildingsByClass[cls] = [];
    autoBuildingsByClass[cls].push(bid);
  }

  const clsLabels = {
    aristocrats:    'Аристократы',
    soldiers_class: 'Солдаты',
    farmers_class:  'Земледельцы',
  };

  for (const [cls, buildingIds] of Object.entries(autoBuildingsByClass)) {
    const capital = cc[cls] ?? 0;

    let bestBid    = null;
    let bestRid    = null;
    let bestProfit = -Infinity;

    for (const bid of buildingIds) {
      const bDef = BUILDINGS[bid];
      if (!bDef) continue;

      const threshold = (bDef.cost || 0) + _CLASS_SAFETY_RESERVE;
      if (capital < threshold) continue;

      for (const rid of nation.regions) {
        const region = GAME_STATE.regions[rid];
        if (!region) continue;

        const check = (typeof canBuildInRegion === 'function')
          ? canBuildInRegion(bid, region)
          : { ok: true };
        if (!check.ok) continue;

        // Не строим если уже идёт строительство этого типа от этого класса
        const alreadyQueued = (region.construction_queue || [])
          .some(e => e.building_id === bid && e.owner === cls);
        if (alreadyQueued) continue;

        const profit = _estimateSlotProfit(bid, region, nation);
        if (profit > bestProfit) {
          bestProfit = profit;
          bestBid    = bid;
          bestRid    = rid;
        }
      }
    }

    if (!bestBid || !bestRid) continue;

    const bDef   = BUILDINGS[bestBid];
    const region = GAME_STATE.regions[bestRid];
    const cost   = bDef.cost || 0;

    cc[cls] -= cost;

    region.construction_queue = region.construction_queue || [];
    region.construction_queue.push({
      slot_id:      `${bestRid}_auto_${cls}_${Date.now()}`,
      building_id:  bestBid,
      turns_left:   bDef.build_turns || 1,
      turns_total:  bDef.build_turns || 1,
      ordered_turn: GAME_STATE.turn,
      owner:        cls,
    });

    if (isPlayer && typeof addEventLog === 'function') {
      const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[bestRid]?.name) || bestRid;
      addEventLog(
        `🏗 ${clsLabels[cls] || cls} начали строительство ${bDef.icon || ''} ${bDef.name} в ${rName}.`
        + ` (казна класса: ${Math.round(cc[cls])} монет)`,
        'economy',
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════
// 6д. БАНКРОТСТВО КЛАССОВ — checkClassBankruptcy(nationId)
//
// Если class_capital[cls] ушёл в минус — класс банкрот:
//   • Все здания класса (slot.owner === cls) переходят государству (slot.owner = 'nation').
//   • Долг списывается (cc[cls] = 0) — государство поглощает убыток.
//   • Для нации игрока — событие в лог.
//
// ВЫЗОВ: после processAutonomousBuilding() каждый тик.
// ══════════════════════════════════════════════════════════════
function checkClassBankruptcy(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const economy  = nation.economy;
  const cc       = economy.class_capital;
  if (!cc) return;

  const isPlayer = (nationId === GAME_STATE.player_nation);

  const clsLabels = {
    aristocrats:    'Аристократы',
    soldiers_class: 'Солдаты',
    farmers_class:  'Земледельцы',
  };

  for (const cls of ['aristocrats', 'soldiers_class', 'farmers_class']) {
    if ((cc[cls] ?? 0) >= 0) continue;

    let reverted = 0;
    for (const rid of nation.regions) {
      const region = GAME_STATE.regions[rid];
      if (!region?.building_slots?.length) continue;

      for (const slot of region.building_slots) {
        if (slot.owner !== cls) continue;
        slot.owner = 'nation';
        reverted++;
      }
    }

    // Государство поглощает долг
    cc[cls] = 0;

    if (reverted > 0 && isPlayer && typeof addEventLog === 'function') {
      addEventLog(
        `⚠ ${clsLabels[cls] || cls} обанкротились. ${reverted} зданий перешли государству.`,
        'warning',
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 7. ФИНАНСОВЫЙ ЖУРНАЛ ЗДАНИЙ
//
// Вызывается ПОСЛЕ distributeWages() каждый тик (для всех наций).
// Вычисляет per-slot: gross_revenue, input_costs, wages, maintenance,
// net_profit; обновляет loss_streak.
//
// Формула (Stage 4.2):
//   input_costs   = Σ (actual_output × recipe.input.amount × input_price)
//   wages         = gross_revenue × bDef.wage_rate
//   maintenance   = CONFIG.BALANCE.BUILDING_MAINTENANCE × level
//   net_profit    = gross_revenue − input_costs − wages − maintenance
// ──────────────────────────────────────────────────────────────

function updateBuildingFinancials(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const market    = GAME_STATE.market;
  const maintCost = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.BUILDING_MAINTENANCE) || 50;

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef = BUILDINGS[slot.building_id];
      if (!bDef) continue;

      const level         = slot.level || 1;
      const maintenance   = maintCost * level;

      // Выручка и зарплата (через существующую функцию)
      const gross_revenue = calculateBuildingRevenue(slot, region, nation);
      const wages         = gross_revenue * (bDef.wage_rate ?? 0);

      // Затраты на входные материалы рецепта (фактически потреблённые)
      let input_costs = 0;
      const recipes    = (typeof BUILDING_RECIPES !== 'undefined')
                         ? (BUILDING_RECIPES[slot.building_id] ?? []) : [];
      const baseOutput = _calcSlotBaseOutput(slot, region, nation);
      const ratios     = slot._recipe_ratios ?? {};

      for (const recipe of recipes) {
        const good      = recipe.output_good;
        const baseAmt   = baseOutput[good] || 0;
        const ratio     = Object.prototype.hasOwnProperty.call(ratios, good) ? ratios[good] : 1.0;
        const actualOut = baseAmt * ratio;

        for (const input of recipe.inputs) {
          const price = market[input.good]?.price
                     ?? (typeof GOODS !== 'undefined' ? GOODS[input.good]?.base_price : null)
                     ?? 10;
          input_costs += actualOut * input.amount * price;
        }
      }

      const net_profit = gross_revenue - input_costs - wages - maintenance;

      // ── Финансовый журнал ─────────────────────────────────────────────
      slot.revenue_last = Math.round(gross_revenue);
      slot.costs_last   = Math.round(input_costs + wages + maintenance);
      slot.profit_last  = Math.round(net_profit);

      // ── loss_streak: ++ при убытке, -- при прибыли (медленнее) ───────
      if (net_profit < 0) {
        slot.loss_streak = (slot.loss_streak || 0) + 1;
      } else {
        // Восстановление идёт вдвое медленнее (−0.5 streak-единицы за тик)
        slot._recovery_accum = (slot._recovery_accum || 0) + 1;
        if (slot._recovery_accum >= 2) {
          slot.loss_streak    = Math.max(0, (slot.loss_streak || 0) - 1);
          slot._recovery_accum = 0;
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// 8. АДАПТИВНОЕ ПОВЕДЕНИЕ ЗДАНИЙ ПРИ УБЫТКАХ
//
// Вызывается ПОСЛЕ updateBuildingFinancials() каждый тик.
//
// Пороги по loss_streak:
//   1–3  : ждём (рынок может восстановиться)
//   4–8  : сокращаем рабочих на 10%/тик
//   9–15 : приостанавливаем (production_eff = 0, рабочие остаются)
//   16+  : закрываем (workers = 0, production_eff = 0)
//
// При возврате к прибыли (streak → 0):
//   eff < 1 → +10% eff/тик
//   workers < max → +5% workers/тик (восстановление медленнее, чем сокращение)
// ──────────────────────────────────────────────────────────────

// Вспомогательные функции адаптивного поведения

function _logSlotEvent(slot, bDef, rid, msg, type) {
  if (typeof addEventLog !== 'function') return;
  const bName = bDef?.name || slot.building_id;
  const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[rid]?.name) || rid;
  addEventLog(`${bName} (${rName}): ${msg}`, type);
}

// Плавное сокращение рабочих на fraction (0.10 = 10%) от текущего числа.
// Оставляем минимум 1 в каждой профессии (чтобы не потерять данные о типе занятости).
function _cutSlotWorkers(slot, fraction) {
  for (const [prof, count] of Object.entries(slot.workers || {})) {
    if (count <= 1) continue;
    const cut = Math.max(1, Math.floor(count * fraction));
    slot.workers[prof] = Math.max(1, count - cut);
  }
}

// Постепенное восстановление рабочих до максимума из bDef.
// Если задан slave_fallback_profession и рабов нет в нации → восстанавливаем
// фермеров вместо рабов (не пытаемся нанять несуществующих рабов).
function _restoreSlotWorkers(slot, bDef, fraction, nation) {
  if (!bDef?.worker_profession) return;
  const slavePop      = nation?.population?.by_profession?.slaves ?? 0;
  const fallbackProf  = bDef.slave_fallback_profession;

  for (const { profession: prof, count: maxCount } of bDef.worker_profession) {
    // Если рабов нет в нации и этот слот — рабский, восстанавливаем fallback-профессию
    const effectiveProf = (prof === 'slaves' && slavePop === 0 && fallbackProf)
      ? fallbackProf
      : prof;

    const current = slot.workers?.[effectiveProf] ?? 0;
    // Для оригинального слота рабов: если переключились на fallback, maxCount тот же
    const effectiveMax = (effectiveProf !== prof)
      ? maxCount + (slot.workers?.[effectiveProf] ?? 0)
      : maxCount;

    if (current >= effectiveMax) continue;
    const gain = Math.max(1, Math.floor(maxCount * fraction));
    if (!slot.workers) slot.workers = {};
    slot.workers[effectiveProf] = Math.min(effectiveMax, current + gain);
  }
}

// Оценивает, будет ли здание прибыльным при текущих рыночных ценах и полной загрузке.
// Используется для решения о повторном открытии закрытых зданий.
function _estimateSlotProfitability(slot, bDef, region, nation) {
  // Создаём временный «идеальный» слот с production_eff=1 и полными рабочими
  const tempSlot = {
    ...slot,
    production_eff: 1.0,
    workers:        {},
    _recipe_ratios: {},  // нет данных о входах → ratio = 1
  };
  for (const { profession: prof, count } of (bDef?.worker_profession || [])) {
    tempSlot.workers[prof] = count;
  }

  const baseOut   = _calcSlotBaseOutput(tempSlot, region, nation);
  const market    = GAME_STATE.market;
  const maintCost = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.BUILDING_MAINTENANCE) || 50;

  let gross = 0;
  for (const [g, amt] of Object.entries(baseOut)) {
    gross += amt * (market[g]?.price ?? 10);
  }

  const wages = gross * (bDef?.wage_rate ?? 0);
  const maint = maintCost * (slot.level || 1);

  let inputCosts = 0;
  const recipes = (typeof BUILDING_RECIPES !== 'undefined')
                  ? (BUILDING_RECIPES[slot.building_id] ?? []) : [];
  for (const recipe of recipes) {
    const baseAmt = baseOut[recipe.output_good] || 0;
    for (const input of recipe.inputs) {
      const price = market[input.good]?.price
                 ?? (typeof GOODS !== 'undefined' ? GOODS[input.good]?.base_price : null)
                 ?? 10;
      inputCosts += baseAmt * input.amount * price;
    }
  }

  return (gross - inputCosts - wages - maint) > 0;
}

function applyBuildingAdaptiveBehavior(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const isPlayer = (nationId === GAME_STATE.player_nation);

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef   = BUILDINGS[slot.building_id];
      if (!bDef) continue;

      const streak = slot.loss_streak || 0;
      const profit = slot.profit_last ?? 0;
      const eff    = slot.production_eff ?? 1.0;
      const isClosed = (eff <= 0 && _slotTotalWorkers(slot) === 0);

      // ── Восстановление: прибыльно и streak = 0 ────────────────────────
      if (streak === 0) {
        if (eff < 1.0) {
          slot.production_eff = Math.min(1.0, eff + 0.10);
          if (slot.production_eff >= 1.0 && isPlayer) {
            _logSlotEvent(slot, bDef, rid, '▶ производство восстановлено.', 'good');
          }
        }
        _restoreSlotWorkers(slot, bDef, 0.05, nation);  // +5%/тик — медленнее, чем -10%
        continue;
      }

      // ── Закрытое здание: проверяем рыночное условие для повторного открытия ─
      if (isClosed) {
        if (_estimateSlotProfitability(slot, bDef, region, nation)) {
          slot.production_eff  = 0.10;  // запускаем с 10% мощности
          slot.loss_streak     = 8;      // сбрасываем в зону «сокращение», а не «закрытие»
          slot._recovery_accum = 0;
          _restoreSlotWorkers(slot, bDef, 0.05, nation);
          if (isPlayer) _logSlotEvent(slot, bDef, rid, '🔄 начинает повторное открытие (рынок улучшился).', 'info');
        }
        continue;
      }

      // ── Деградация: последовательные пороги ────────────────────────────
      // Если здание продаёт ниже себестоимости (_below_cost), льготный период
      // сокращается с 3 до 1 тика — структурный убыток не «переживётся» рынком.
      const gracePeriod = slot._below_cost ? 1 : 3;
      if (streak <= gracePeriod) {
        // Ждём (рынок может исправиться)

      } else if (streak <= 8) {
        // Тик 4–8: −10% рабочих/тик
        _cutSlotWorkers(slot, 0.10);
        if (isPlayer && streak === 4) {
          _logSlotEvent(slot, bDef, rid,
            `📉 убытки ${streak} тик(а) — сокращение рабочих. Прибыль: ${profit} монет.`, 'warning');
        }

      } else if (streak <= 15) {
        // Тик 9–15: приостановка (eff=0, рабочие на месте)
        if (eff > 0) {
          slot.production_eff = 0;
          if (isPlayer) {
            _logSlotEvent(slot, bDef, rid,
              `⏸ приостановлено (убытки ${streak} тиков). Убыток: ${-profit} монет/тик.`, 'warning');
          }
        }

      } else {
        // Тик 16+: полное закрытие (workers = 0)
        if (!isClosed) {
          for (const prof of Object.keys(slot.workers || {})) {
            slot.workers[prof] = 0;
          }
          slot.production_eff = 0;
          slot.loss_streak    = 16;  // фиксируем streak: теперь растёт только у закрытых
          if (isPlayer) {
            _logSlotEvent(slot, bDef, rid,
              `🚫 закрыто из-за хронических убытков (${streak} тиков).`, 'danger');
          }
        }
      }
    }

    // Пересчитываем занятость после любых изменений рабочих
    recalculateRegionEmployment(region);
  }
}

// ──────────────────────────────────────────────────────────────
// 9. УРОВЕНЬ БЕЗРАБОТИЦЫ ПО ПРОФЕССИЯМ
// Используется демографическим движком и UI.
// ──────────────────────────────────────────────────────────────

function getUnemploymentRates(nation) {
  const profs    = nation.population.by_profession;
  const regions  = nation.regions || [];
  const regData  = GAME_STATE.regions;

  // Суммируем занятых по профессиям во всех регионах нации
  const totalEmployed = {};
  for (const rid of regions) {
    const r = regData[rid];
    if (!r?.employment) continue;
    for (const [prof, count] of Object.entries(r.employment)) {
      totalEmployed[prof] = (totalEmployed[prof] || 0) + count;
    }
  }

  const rates = {};
  for (const [prof, total] of Object.entries(profs)) {
    if (typeof total !== 'number' || total <= 0) continue;
    const employed = totalEmployed[prof] || 0;
    const empRate  = Math.min(1.0, employed / total); // 0..1
    rates[prof] = {
      employed,
      total,
      rate:       empRate,               // доля занятых
      unemployed: total - employed,
      unemp_pct:  1 - empRate,          // доля безработных
    };
  }

  return rates;
}

// ──────────────────────────────────────────────────────────────
// 8. ДИНАМИЧЕСКАЯ СТОИМОСТЬ СТРОИТЕЛЬСТВА (Этап 5)
//
// calcConstructionCost(buildingId) — пересчитывается каждый раз
// из текущих рыночных цен; НЕ кэшируется в GAME_STATE.
//
//   cost = Σ(material.amount × market.price) + construction_labor
//
// Если market.price недоступен, используется base_price из GOODS.
// ──────────────────────────────────────────────────────────────

function calcConstructionCost(buildingId) {
  const bDef = BUILDINGS[buildingId];
  if (!bDef) return 0;
  const mats = bDef.construction_materials || {};
  let matCost = 0;
  for (const [good, amount] of Object.entries(mats)) {
    const price = GAME_STATE.market?.[good]?.price
      ?? (typeof GOODS !== 'undefined' ? (GOODS[good]?.base_price ?? 0) : 0);
    matCost += amount * price;
  }
  return Math.round(matCost + (bDef.construction_labor ?? bDef.cost ?? 0));
}

// ──────────────────────────────────────────────────────────────
// 8. ПУБЛИЧНОЕ API — добавить здание в очередь строительства
//
// Возвращает { ok, reason, slot_id } или { ok: false, reason }
// ──────────────────────────────────────────────────────────────

function orderBuildingConstruction(nationId, regionId, buildingId) {
  const nation = GAME_STATE.nations[nationId];
  const region = GAME_STATE.regions[regionId];
  if (!nation || !region) return { ok: false, reason: 'Регион или нация не найдены' };
  if (!nation.regions.includes(regionId)) {
    return { ok: false, reason: 'Этот регион не принадлежит вашей нации' };
  }

  const bDef = BUILDINGS[buildingId];
  if (!bDef) return { ok: false, reason: 'Здание не определено' };

  // Проверяем ограничения (terrain, tag, slots, уровень)
  const check = (typeof canBuildInRegion === 'function')
    ? canBuildInRegion(buildingId, region)
    : { ok: true, is_upgrade: false };
  if (!check.ok) return check;

  // Стоимость — динамическая (текущие цены материалов)
  const cost = calcConstructionCost(buildingId);
  if (nation.economy.treasury < cost) {
    return { ok: false, reason: `Нужно ${cost} монет, в казне ${Math.round(nation.economy.treasury)}` };
  }
  nation.economy.treasury -= cost;

  // Формируем запись очереди
  const queueId = check.is_upgrade
    ? `${regionId}_upg_${Date.now()}`
    : `${regionId}_slot_${Date.now()}`;

  const entry = {
    slot_id:      queueId,
    building_id:  buildingId,
    turns_left:   bDef.build_turns || 1,
    turns_total:  bDef.build_turns || 1,
    ordered_turn: GAME_STATE.turn,
  };

  if (check.is_upgrade) {
    entry.is_upgrade     = true;
    entry.target_slot_id = check.target_slot_id;
    entry.to_level       = check.to_level;
  }

  region.construction_queue = region.construction_queue || [];
  region.construction_queue.push(entry);

  if (typeof addEventLog === 'function') {
    const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[regionId]?.name) || regionId;
    if (check.is_upgrade) {
      addEventLog(
        `📐 Начато улучшение ${bDef.icon || ''} ${bDef.name} до ур. ${check.to_level} в ${rName}. `
        + `Завершение через ${entry.turns_total} ход(а). −${cost} монет.`,
        'economy',
      );
    } else {
      addEventLog(
        `📐 Начато строительство ${bDef.icon || ''} ${bDef.name} в ${rName}. `
        + `Завершение через ${entry.turns_total} ход(а). −${cost} монет.`,
        'economy',
      );
    }
  }

  return { ok: true, slot_id };
}

// ──────────────────────────────────────────────────────────────
// 9. СНОС ЗДАНИЯ
// ──────────────────────────────────────────────────────────────

function demolishBuilding(nationId, regionId, slotId) {
  const nation = GAME_STATE.nations[nationId];
  const region = GAME_STATE.regions[regionId];
  if (!nation || !region) return { ok: false, reason: 'Регион или нация не найдены' };
  if (!nation.regions.includes(regionId)) {
    return { ok: false, reason: 'Не ваш регион' };
  }

  const slotIdx = (region.building_slots || []).findIndex(s => s.slot_id === slotId);
  if (slotIdx < 0) return { ok: false, reason: 'Слот не найден' };

  const slot = region.building_slots[slotIdx];
  const bDef = BUILDINGS[slot.building_id];

  // Помечаем снесённым (не удаляем сразу — может понадобиться для анимации)
  slot.status = 'demolished';

  recalculateRegionEmployment(region);

  if (typeof addEventLog === 'function') {
    const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[regionId]?.name) || regionId;
    addEventLog(`🏚 ${bDef?.name || slot.building_id} снесено в ${rName}.`, 'info');
  }

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// 10. ОТМЕНА СТРОИТЕЛЬСТВА
// ──────────────────────────────────────────────────────────────

function cancelConstruction(nationId, regionId, slotId) {
  const nation = GAME_STATE.nations[nationId];
  const region = GAME_STATE.regions[regionId];
  if (!nation || !region) return { ok: false, reason: 'Регион не найден' };

  const idx = (region.construction_queue || []).findIndex(e => e.slot_id === slotId);
  if (idx < 0) return { ok: false, reason: 'Не в очереди' };

  const entry = region.construction_queue[idx];
  const bDef  = BUILDINGS[entry.building_id];

  // Возвращаем 50% стоимости
  const refund = Math.round((bDef?.cost || 0) * 0.5);
  nation.economy.treasury += refund;

  region.construction_queue.splice(idx, 1);

  if (typeof addEventLog === 'function') {
    addEventLog(`❌ Строительство ${bDef?.name || entry.building_id} отменено. Возврат: ${refund} монет.`, 'info');
  }

  return { ok: true, refund };
}
