// ═══════════════════════════════════════════════════════════════════════════
// ДВИЖОК ЗДАНИЙ — строительство, производство, зарплаты
//
// Порядок вызова в turn.js:
//   1. processBuildingConstruction()        ← до runEconomyTick()
//   2. runEconomyTick()                    ← читает buildingProduction
//   3. distributeWages(nationId)           ← шаг 4а; пишет slot.wages_paid
//   4. recomputeAllProductionCosts()       ← шаг 5; пишет slot.profit_last, revenue_last
//   5. distributeClassIncome(nationId)     ← шаг 5б; читает актуальный profit_last
//   6. deductFoodPurchases(nationId)       ← шаг 5в; вычитает еду из class_capital
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
// Для 13 биомов читает из BIOME_META[biome].goods_bonus (data/biomes.js).
// Для старых terrain-типов (plains/hills/mountains/coastal_city) — fallback-таблица.
function _terrainGoodBonus(terrain, good) {
  // ── 13 биомов: читаем из BIOME_META (data/biomes.js) ──────────────────
  if (typeof BIOME_META !== 'undefined' && BIOME_META[terrain]?.goods_bonus) {
    const v = BIOME_META[terrain].goods_bonus[good];
    return v !== undefined ? v : 1.0;
  }
  // ── Старые типы местности (backward-compat) ────────────────────────────
  const LEGACY = {
    plains:       { wheat: 1.15, barley: 1.10, wool: 1.10 },
    hills:        { wine: 1.20, olive_oil: 1.15, iron: 1.10, sulfur: 1.15 },
    mountains:    { iron: 1.20, bronze: 1.15, timber: 1.10, sulfur: 1.30 },
    coastal_city: { fish: 1.20, salt: 1.20, trade_goods: 1.15, tuna: 1.25 },
  };
  return LEGACY[terrain]?.[good] ?? 1.0;
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
  // level = количество зданий данного типа в регионе (не уровень улучшения).
  // workers — на одно здание; умножаем на level чтобы получить суммарную рабочую силу.
  const workers = Object.values(effectiveWorkers).reduce((s, v) => s + v, 0) * level;

  if (workers <= 0) return {};

  // production_eff: 0.0–1.0, снижается при убытках (Stage 4).
  const eff = slot.production_eff ?? 1.0;
  if (eff <= 0) return {};

  // _pop_eff: 0.7–1.0, зависит от удовлетворённости рабочих (Stage 6).
  const popEff = slot._pop_eff ?? 1.0;

  // _capital_ratio: 0.0–1.0, нехватка инструментов/скота снижает выход (Stage 2).
  const capitalRatio = slot._capital_ratio ?? 1.0;

  // efficiency_mult: масштабный коэффициент урожайности на га (1.0 / 1.3 / 1.8).
  // Задаётся в определении здания; отсутствие поля = 1.0 (не влияет).
  const effMult = bDef.efficiency_mult ?? 1.0;

  // Бонус от месторождений (deposits): регион с iron:1.8 даёт +80% к добыче железа.
  const deposits = region.deposits || {};

  const output = {};
  for (const { good, base_rate } of bDef.production_output) {
    const terrainBonus  = _terrainGoodBonus(terrain, good);
    const depositBonus  = deposits[good] ?? 1.0;  // 1.0 = нет месторождения (нейтрально)
    // base_rate: канонический выход на 1000 рабочих (без масштабного коэф.)
    // effMult: умножитель эффективности за счёт масштаба хозяйства
    // capitalRatio: снижение при нехватке инструментов/тягловых животных
    // depositBonus: множитель месторождения (>1 = богатое, <1 = бедное)
    const amount = (workers / 1000) * base_rate * effMult * fertility * satMod
                 * terrainBonus * eff * popEff * capitalRatio * depositBonus;
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
              `⚠ ${bName}: нехватка (${missingInputs}), производство ${(typeof GOODS !== 'undefined' ? GOODS[good]?.name : null) || good} — ${Math.round(ratio * 100)}%`,
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
    // ── Stage 2: капитальные ресурсы (инструменты / скот) ──────────────────
    // _capital_stock: сколько единиц каждого товара хранится у здания.
    //   Ключ — good id (tools, cattle, horses). Заполняется procureCapitalInputs().
    // _capital_ratio: 0.0–1.0, минимум из всех capital_inputs ratios.
    //   Умножается на базовый выход в _calcSlotBaseOutput.
    _capital_stock:         {},
    _capital_ratio:         1.0,
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
// ОБСЛУЖИВАНИЕ ЗДАНИЯ — динамический расчёт
//
// Обслуживание масштабируется с числом рабочих здания, а не фиксировано.
// Формула: workers_per_unit × MAINTENANCE_PER_WORKER × level
//
// Итог (при MAINTENANCE_PER_WORKER = 2):
//   wheat_family_farm (5 раб.)  →  10 ден/уровень  (было 50)
//   wheat_villa       (15 раб.) →  30 ден/уровень  (было 50)
//   wheat_latifundium (100 раб.)→ 200 ден/уровень  (было 50)
// ──────────────────────────────────────────────────────────────
function _calcBuildingMaintenance(bDef, level) {
  const ratePerWorker = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.MAINTENANCE_PER_WORKER) ?? 2;
  const workersPerUnit = bDef.workers_per_unit
    ?? (bDef.worker_profession?.reduce((s, p) => s + p.count, 0) ?? 1);
  return Math.max(1, workersPerUnit * ratePerWorker) * (level || 1);
}

// ──────────────────────────────────────────────────────────────
// calcSlaveUpkeepPerPerson()
//
// Стоимость содержания одного занятого раба за тик.
// Равна рыночной стоимости базовой корзины + стандартной корзины.
// Пересчитывается каждый ход вместе с рыночными ценами.
//
//   Базовая    (SLAVE_BASIC_BASKET):    wheat 0.25 + salt 0.005
//   Стандартная (SLAVE_STANDARD_BASKET): wheat 0.10 + salt 0.005 + cloth 0.01
//
// При wheat=10, salt=12, cloth=15:
//   базовая  = 0.25×10 + 0.005×12 = 2.56 ₴
//   стандарт = 0.10×10 + 0.005×12 + 0.01×15 = 1.21 ₴
//   итого    ≈ 3.77 ₴/раб/тик
// ──────────────────────────────────────────────────────────────
function calcSlaveUpkeepPerPerson() {
  const B       = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE) || {};
  const market  = (typeof GAME_STATE !== 'undefined' && GAME_STATE.market) || {};
  const GOODS_  = (typeof GOODS !== 'undefined') ? GOODS : {};

  const basic    = B.SLAVE_BASIC_BASKET    || { wheat: 0.25, salt: 0.005 };
  const standard = B.SLAVE_STANDARD_BASKET || { wheat: 0.10, salt: 0.005, cloth: 0.01 };

  let cost = 0;
  for (const [good, amount] of Object.entries(basic)) {
    const price = market[good]?.price ?? GOODS_[good]?.base_price ?? 10;
    cost += amount * price;
  }
  for (const [good, amount] of Object.entries(standard)) {
    const price = market[good]?.price ?? GOODS_[good]?.base_price ?? 10;
    cost += amount * price;
  }
  return cost;
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

      // Содержание занятых рабов по рыночной стоимости корзин (базовая + стандартная)
      const slaveCount  = slot.workers?.slaves ?? 0;
      const slaveUpkeep = slaveCount > 0 ? slaveCount * calcSlaveUpkeepPerPerson() : 0;

      const profit    = revenue - wages - _calcBuildingMaintenance(bDef, level) - slaveUpkeep;

      slot.revenue    = Math.round(revenue);
      slot.wages_paid = Math.round(wages);
      slot.slave_upkeep_last = Math.round(slaveUpkeep);
      totalWagesPaid    += wages;
      // Автономные здания (wheat_*) сами учитывают maintenance в profit_last,
      // который затем направляется в казну через distributeClassIncome.
      // Добавлять их maintenance в _building_maintenance_per_turn нельзя —
      // это привело бы к двойному вычету из казны (БАГ 1).
      if (!bDef.autonomous_builder) {
        totalMaintenance += _calcBuildingMaintenance(bDef, level);
      }

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
// Читает slot.revenue_last / slot.wages_paid / slot.profit_last.
//   slot.wages_paid    — заполняется в updateBuildingFinancials (шаг 3).
//   slot.revenue_last  — заполняется в recomputeAllProductionCosts (шаг 5).
//   slot.profit_last   — заполняется в recomputeAllProductionCosts (шаг 5).
// Вызывается ПОСЛЕ шага 5: все три поля принадлежат ТЕКУЩЕМУ тику.
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
// ВЫЗОВ: ШАГ 5б — после recomputeAllProductionCosts(), до deductFoodPurchases().
//   Перенесено из шага 4 чтобы читать profit_last ТЕКУЩЕГО тика.
// ══════════════════════════════════════════════════════════════
function distributeClassIncome(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const economy = nation.economy;

  // Сбрасываем накопленную прибыль госзданий за этот тик
  economy._building_profit_last_tick = 0;
  economy._state_building_active_count = 0;

  // Сбрасываем доход по типам производства за этот тик (для UI батарейки)
  economy._class_income_by_type = {};

  // Сбрасываем счётчик вовлечённых людей: только те, кто РЕАЛЬНО связан с производством
  // (фермеры в конкретных полях, солдаты владеющие виллами, аристократы — латифундиями)
  economy._class_workers_by_type = {};

  // Lazy init батарейки
  if (!economy._class_battery) economy._class_battery = {};

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
      // Если owner не задан явно, используем autonomous_builder класс здания
      // (а не 'nation'). Это предотвращает ошибочную маршрутизацию прибыли
      // всех зданий без поля owner в казну государства.
      const slotOwner  = slot.owner ?? bDef.autonomous_builder ?? 'nation';
      const prodType   = slot.building_id  ? slot.building_id.split('_')[0] : null;
      const _ibt       = economy._class_income_by_type;
      const _cwbt      = economy._class_workers_by_type;

      // Вспомогательная функция: добавить вовлечённых людей к типу производства
      const _addEngaged = (cls, ptype, count) => {
        if (!ptype || count <= 0) return;
        if (!_cwbt[cls]) _cwbt[cls] = {};
        _cwbt[cls][ptype] = (_cwbt[cls][ptype] || 0) + count;
      };

      if (slotOwner === 'farmers_class') {
        // ── Самозанятые земледельцы (семейная ферма) ────────────────────────
        // Трудовая доля (wages) + земельная прибыль (profitLast) = весь доход
        const totalFarmerIncome = wages + Math.max(0, profitLast);
        if (totalFarmerIncome > 0) {
          cc.farmers_class          = (cc.farmers_class || 0) + totalFarmerIncome;
          incomeTick.farmers_class += totalFarmerIncome;
          if (prodType) {
            if (!_ibt.farmers_class) _ibt.farmers_class = {};
            _ibt.farmers_class[prodType] = (_ibt.farmers_class[prodType] || 0) + totalFarmerIncome;
            // Вовлечены: число единиц фермы (слот = N ферм = N семей-владельцев)
            _addEngaged('farmers_class', prodType, slot.level || 1);
          }
        }

      } else {
        // ── Наёмные арендаторы (вилла / латифундия) ─────────────────────────
        // Зарплата → всегда земледельцам (они физически работают на земле).
        // НО: зарплата от чужих зданий идёт только в class_capital (реальные сбережения),
        // а НЕ в _ibt/_cwbt (батарейку инвестиций).
        // Батарейка отвечает на вопрос «выгодно ли строить собственные фермы?» —
        // это зависит только от дохода СОБСТВЕННЫХ ферм, не от найма у аристократов.
        // Без этого разделения: villa wages (370 ₴/ур.) раздувают perCapitaIncome в 3× vs
        // реального дохода фермы (33 ₴/ур.), ускоряя строительство некорректно.
        if (wages > 0) {
          cc.farmers_class          = (cc.farmers_class || 0) + wages;
          incomeTick.farmers_class += wages;
          // _ibt / _cwbt НЕ обновляем — батарейка строится только на своём доходе
        }

        // Считаем активные государственные здания (включая убыточные)
        if (slotOwner === 'nation') {
          economy._state_building_active_count = (economy._state_building_active_count || 0) + 1;
        }

        // Чистая прибыль (или убыток) → владельцу здания.
        // БАГ-A FIX: убыток (profitLast < 0) тоже применяется — без guard на > 0.
        //   nation-owned: убыток вычитается из казны (государство несёт расходы).
        //   class-owned:  убыток снижает class_capital владельца (класс несёт убыток).
        if (slotOwner === 'nation') {
          // Государственная латифундия: прибыль/убыток прямо в/из казны
          economy.treasury = (economy.treasury || 0) + profitLast;
          economy._building_profit_last_tick = (economy._building_profit_last_tick || 0) + profitLast;
        } else if (cc[slotOwner] !== undefined) {
          // Классовая собственность: аристократы / солдаты — всегда, даже убыток
          cc[slotOwner]         = (cc[slotOwner] || 0) + profitLast;
          if (profitLast > 0) {
            // В батарейки и incomeTick записываем только прибыль (для UI battery)
            incomeTick[slotOwner] = (incomeTick[slotOwner] || 0) + profitLast;
            if (prodType) {
              if (!_ibt[slotOwner]) _ibt[slotOwner] = {};
              _ibt[slotOwner][prodType] = (_ibt[slotOwner][prodType] || 0) + profitLast;
              // Вовлечены: количество единиц здания (1 слот = 1 владелец на уровень)
              // Делитель — число ВЛАДЕЛЬЦЕВ, а не наёмных рабочих в слоте
              _addEngaged(slotOwner, prodType, slot.level || 1);
            }
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
  let soldierSalaryPaid = 0;
  if (totalSalary > 0) {
    const paid = Math.min(totalSalary, Math.max(0, economy.treasury || 0));
    if (paid > 0) {
      economy.treasury           -= paid;
      cc.soldiers_class           = (cc.soldiers_class || 0) + paid;
      incomeTick.soldiers_class  += paid;
      soldierSalaryPaid           = paid;
    }
  }
  // Отслеживаем для корректного отображения баланса в UI
  economy._soldier_salary_per_turn = soldierSalaryPaid;

  // ── class_income_per_capita: средний доход на человека за тик (UI + батарейка) ──
  // Вычисляем ДО цикла батарейки — per-capita нужен для правильного накопления.
  const classPops = (typeof calculateClassPopulations === 'function')
    ? calculateClassPopulations(nation.population.by_profession || {})
    : {};
  const cipc = economy.class_income_per_capita;
  for (const [cls, income] of Object.entries(incomeTick)) {
    const pop  = Math.max(1, classPops[cls] ?? 1);
    cipc[cls]  = Math.round((income / pop) * 10) / 10;  // 1 знак после запятой
  }

  // ── Обновляем батарейки классов (прогресс к следующей инвестиции) ─────────
  // Батарейка заполняется на avg_income вовлечённых людей, а не всего класса:
  //   Аристократы → только работники их латифундий (масштаб владения)
  //   Солдаты     → только работники их вилл
  //   Земледельцы → только фермеры, реально занятые в данном типе производства
  {
    for (const [cls, types] of Object.entries(economy._class_income_by_type)) {
      for (const [ptype, income] of Object.entries(types)) {
        let bThresh = 3000;
        for (const [bid, bDef] of Object.entries(BUILDINGS)) {
          if (bDef.autonomous_builder === cls && bid.startsWith(ptype + '_')) {
            bThresh = (bDef.cost || 0) + 5 * 12 * _calcBuildingMaintenance(bDef, 1);
            break;
          }
        }
        // Делитель — только вовлечённые в это производство, не весь класс
        const engaged = Math.max(1, economy._class_workers_by_type?.[cls]?.[ptype] ?? 1);
        const perCapitaIncome = income / engaged;
        if (!economy._class_battery[cls]) economy._class_battery[cls] = {};
        economy._class_battery[cls][ptype] = Math.min(
          (economy._class_battery[cls][ptype] || 0) + perCapitaIncome,
          bThresh
        );
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// 6б.  МОНЕТАРНЫЙ РЫНОК ПРОДОВОЛЬСТВИЯ — deductFoodPurchases
//
// Цель: соединить доходы работников с реальными расходами на пшеницу,
//       создав тем самым денежно-обеспеченный спрос на рынке.
//
// Модель двух уровней:
//   1) Занятые в ЗДАНИЯХ работники продают весь урожай на рынок
//      и покупают обратно нужное им зерно на заработанное золото.
//      → class_capital[class] уменьшается на стоимость купленной пшеницы.
//   2) Subsistence-производители (не занятые в зданиях) сами себя
//      кормят — монетарная транзакция не нужна, они уже учтены
//      в физической модели supply/demand.
//
// Маппинг профессия → кошелёк:
//   farmers  → class_capital.farmers_class
//   slaves   → class_capital.aristocrats  (господин кормит рабов)
//   soldiers → economy.treasury           (государство кормит армию)
//   прочие   → пропускаем (класс пока без капитала)
//
// Привязка монеты к пшенице (wheat standard):
//   base_price = 10 → 1 золотой = 0,1 бушеля ≈ 3 кг зерна.
//   При введении чеканки монет количество золота вырастет →
//   цена пшеницы поднимется (инфляция), что автоматически
//   отразится в трёхзонной модели рынка.
//
// ВЫЗОВ: ШАГ 5в — сразу после distributeClassIncome() (class_capital уже пополнен).
// ══════════════════════════════════════════════════════════════
function deductFoodPurchases(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const economy = nation.economy;
  const market  = GAME_STATE.market;
  const wheatPrice = market?.wheat?.price ?? 10;

  // Lazy-init class_capital с начальным буфером вместо нулей.
  // Стартовые 6 месяцев ожидаемых расходов на еду + строительный резерв.
  if (!economy.class_capital) {
    const farmersPop = nation.population.by_profession?.farmers ?? 0;
    const monthlyFood = (farmersPop / 1000) * 0.8 * wheatPrice; // бушели×цена
    economy.class_capital = {
      aristocrats:    Math.round(monthlyFood * 4),   // доходы с ренты, 4 мес.
      soldiers_class: Math.round(monthlyFood * 1),   // солдаты: 1 мес.
      farmers_class:  Math.round(monthlyFood * 6),   // главный класс, 6 мес.
    };
  }
  if (!economy.class_income_per_capita) {
    economy.class_income_per_capita = {
      aristocrats: 0, soldiers_class: 0, farmers_class: 0,
    };
  }

  const cc = economy.class_capital;

  // Аккумуляторы для UI
  let foodSpendFarmers    = 0;
  let foodSpendAristocrats = 0;
  let foodSpendTreasury   = 0;

  // ── Обходим только активные здания ───────────────────────────────────────
  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;
      if (!slot.workers)           continue;

      // Корзина потребления пшеницы на тик для каждой группы работников.
      // Используем фиксированный коэффициент 0.8 (бедняк, wealth≈10):
      //   при богатстве > 30 пшеницы нужно меньше — корректировка в updatePopWealth.
      const WHEAT_PER_KPERSON = 0.8; // бушелей / 1000 чел. / тик

      for (const [prof, count] of Object.entries(slot.workers)) {
        if (!count) continue;

        const wheatNeed = (count / 1000) * WHEAT_PER_KPERSON;
        const cost      = wheatNeed * wheatPrice;

        if (prof === 'farmers' || prof === 'craftsmen') {
          // Фермеры-арендаторы и ремесленники → farmers_class
          const avail = Math.max(0, cc.farmers_class || 0);
          const spent = Math.min(cost, avail);
          cc.farmers_class    -= spent;
          foodSpendFarmers    += spent;

        } else if (prof === 'slaves') {
          // Еда рабов теперь входит в корзину содержания здания (calcSlaveUpkeepPerPerson),
          // которая вычитается из прибыли здания в updateBuildingFinancials / distributeWages.
          // Здесь не списываем — иначе получим двойной счёт.

        } else if (prof === 'soldiers') {
          // Армию кормит казна
          const avail = Math.max(0, economy.treasury || 0);
          const spent = Math.min(cost, avail);
          economy.treasury    -= spent;
          foodSpendTreasury   += spent;
        }
        // merchants, sailors, clergy → пока без монетарной модели еды
      }
    }
  }

  // Записываем для UI / отладки
  if (!economy._food_spending) economy._food_spending = {};
  economy._food_spending.farmers_class = Math.round(foodSpendFarmers  * 10) / 10;
  economy._food_spending.aristocrats   = Math.round(foodSpendAristocrats * 10) / 10;
  economy._food_spending.treasury      = Math.round(foodSpendTreasury  * 10) / 10;
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

  return gross - inputCosts - wages - _calcBuildingMaintenance(bDef, 1);
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
    let bestCheck  = null;  // сохраняем результат canBuildInRegion для upgrade-логики

    for (const bid of buildingIds) {
      const bDef = BUILDINGS[bid];
      if (!bDef) continue;

      const prodType      = bid.split('_')[0];
      const battThreshold = (bDef.cost || 0) + 5 * 12 * _calcBuildingMaintenance(bDef, 1);
      const battery      = economy._class_battery?.[cls]?.[prodType] ?? 0;
      if (battery < battThreshold) continue;
      if (capital < (bDef.cost || 0)) continue;

      for (const rid of nation.regions) {
        const region = GAME_STATE.regions[rid];
        if (!region) continue;

        const check = (typeof canBuildInRegion === 'function')
          ? canBuildInRegion(bid, region)
          : { ok: true, is_upgrade: false };
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
          bestCheck  = check;
        }
      }
    }

    if (!bestBid || !bestRid || !bestCheck) continue;

    const bDef   = BUILDINGS[bestBid];
    const region = GAME_STATE.regions[bestRid];
    const cost   = bDef.cost || 0;

    cc[cls] -= cost;

    // Уменьшаем батарейку: стоимость + 1 год обслуживания (класс копит заново)
    {
      const _ptPost    = bestBid.split('_')[0];
      if (!economy._class_battery)         economy._class_battery = {};
      if (!economy._class_battery[cls])    economy._class_battery[cls] = {};
      economy._class_battery[cls][_ptPost] = Math.max(0,
        (economy._class_battery[cls][_ptPost] || 0) - (cost + 12 * _calcBuildingMaintenance(BUILDINGS[bestBid], 1)));
    }

    // Детерминированный slot_id: ход + регион + счётчик слотов (без Date.now())
    const queueCount = (region.construction_queue || []).length;
    const slotId = bestCheck.is_upgrade
      ? `${bestRid}_upg_${bestBid}_t${GAME_STATE.turn}`
      : `${bestRid}_auto_${cls}_t${GAME_STATE.turn}_${queueCount}`;

    const queueEntry = {
      slot_id:      slotId,
      building_id:  bestBid,
      turns_left:   bDef.build_turns || 1,
      turns_total:  bDef.build_turns || 1,
      ordered_turn: GAME_STATE.turn,
      owner:        cls,
    };

    // Если здание уже есть — это улучшение, а не новое строительство
    if (bestCheck.is_upgrade) {
      queueEntry.is_upgrade     = true;
      queueEntry.target_slot_id = bestCheck.target_slot_id;
      queueEntry.to_level       = bestCheck.to_level;
    }

    region.construction_queue = region.construction_queue || [];
    region.construction_queue.push(queueEntry);

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
//   maintenance   = _calcBuildingMaintenance(bDef, level)  (workers_per_unit × MAINTENANCE_PER_WORKER × level)
//   net_profit    = gross_revenue − input_costs − wages − maintenance
// ──────────────────────────────────────────────────────────────

function updateBuildingFinancials(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const market    = GAME_STATE.market;
  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef = BUILDINGS[slot.building_id];
      if (!bDef) continue;

      const level         = slot.level || 1;
      const maintenance   = _calcBuildingMaintenance(bDef, level);

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

      // Содержание занятых рабов по рыночной стоимости корзин
      const slaveCount  = slot.workers?.slaves ?? 0;
      const slaveUpkeep = slaveCount > 0 ? slaveCount * calcSlaveUpkeepPerPerson() : 0;

      const net_profit = gross_revenue - input_costs - wages - maintenance - slaveUpkeep;

      // ── Финансовый журнал ─────────────────────────────────────────────
      slot.revenue_last      = Math.round(gross_revenue);
      slot.slave_upkeep_last = Math.round(slaveUpkeep);
      slot.costs_last        = Math.round(input_costs + wages + maintenance + slaveUpkeep);
      slot.profit_last       = Math.round(net_profit);

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

// Возвращает профиль рабочих здания в унифицированном формате [{profession, count}].
// Стандартные здания используют worker_profession; автономные (wheat_*) — workers_per_unit.
// Для автономных зданий основная профессия определяется по текущим данным слота:
// берём профессию с максимальным числом рабочих (или 'farmers' по умолчанию).
function _getBuildingWorkerProfile(bDef, slot) {
  if (bDef?.worker_profession?.length) return bDef.worker_profession;
  if (bDef?.workers_per_unit) {
    // Определяем профессию: из slot.workers или 'farmers' по умолчанию
    let mainProf = 'farmers';
    if (slot?.workers && Object.keys(slot.workers).length > 0) {
      mainProf = Object.keys(slot.workers)[0];
    }
    return [{ profession: mainProf, count: bDef.workers_per_unit }];
  }
  return [];
}

// Постепенное восстановление рабочих до максимума из bDef.
// Если задан slave_fallback_profession и рабов нет в нации → восстанавливаем
// фермеров вместо рабов (не пытаемся нанять несуществующих рабов).
function _restoreSlotWorkers(slot, bDef, fraction, nation) {
  const profile = _getBuildingWorkerProfile(bDef, slot);
  if (!profile.length) return;
  const slavePop      = nation?.population?.by_profession?.slaves ?? 0;
  const fallbackProf  = bDef?.slave_fallback_profession;

  for (const { profession: prof, count: maxCount } of profile) {
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
    production_eff:  1.0,
    _capital_ratio:  1.0,  // предполагаем полное снабжение (нехватка ресурсов — временна)
    workers:         {},
    _recipe_ratios:  {},   // нет данных о входах → ratio = 1
  };
  for (const { profession: prof, count } of _getBuildingWorkerProfile(bDef, slot)) {
    tempSlot.workers[prof] = count;
  }

  const baseOut   = _calcSlotBaseOutput(tempSlot, region, nation);
  const market    = GAME_STATE.market;
  let gross = 0;
  for (const [g, amt] of Object.entries(baseOut)) {
    gross += amt * (market[g]?.price ?? 10);
  }

  const wages = gross * (bDef?.wage_rate ?? 0);
  const maint = _calcBuildingMaintenance(bDef, slot.level || 1);

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

      // ── Приостановленное здание (eff=0, workers>0, streak 9–15): проверяем возобновление ─
      // Без этой проверки здание навсегда застревает в паузе: eff=0 → доход=0 → убыток
      // → streak растёт → закрытие. Оценка идёт при полной мощности (_capital_ratio=1.0).
      const isPaused = (eff <= 0 && _slotTotalWorkers(slot) > 0);
      if (isPaused) {
        if (_estimateSlotProfitability(slot, bDef, region, nation)) {
          slot.production_eff  = 1.0;
          slot.loss_streak     = 0;
          slot._recovery_accum = 0;
          if (isPlayer) _logSlotEvent(slot, bDef, rid, '▶ возобновлено (экономика улучшилась).', 'info');
        }
        continue;
      }

      // ── Закрытое здание: проверяем рыночное условие для повторного открытия ─
      if (isClosed) {
        if (_estimateSlotProfitability(slot, bDef, region, nation)) {
          // Полное восстановление сразу: частичное открытие не работает для зданий,
          // у которых обслуживание фиксировано (не масштабируется с eff).
          // При eff=0.10 revenue ≈ maintenance → убыток → немедленное закрытие снова.
          slot.production_eff  = 1.0;
          slot.loss_streak     = 0;
          slot._recovery_accum = 0;
          _restoreSlotWorkers(slot, bDef, 1.0, nation);  // полное восстановление
          if (isPlayer) _logSlotEvent(slot, bDef, rid, '🔄 повторно открыто (экономика улучшилась).', 'info');
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
// 8. ДИНАМИЧЕСКАЯ СТОИМОСТЬ СТРОИТЕЛЬСТВА
//
// calcConstructionCost(buildingId) — пересчитывается каждый раз
// из текущих рыночных цен; НЕ кэшируется в GAME_STATE.
//
//   cost = Σ(material.qty × market.price) × 1.20
//
// ×1.20 — надбавка на труд строителей (наём, питание, инструменты).
// Если рыночная цена недоступна, берётся base_price из GOODS.
// ──────────────────────────────────────────────────────────────

const CONSTRUCTION_LABOR_SURCHARGE = 1.20;   // 20% на труд строителей

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
  return Math.round(matCost * CONSTRUCTION_LABOR_SURCHARGE);
}

// Детальный расчёт для UI — возвращает разбивку по материалам
function calcConstructionCostDetailed(buildingId) {
  const bDef = BUILDINGS[buildingId];
  if (!bDef) return { total: 0, matCost: 0, laborCost: 0, lines: [] };
  const mats = bDef.construction_materials || {};
  const lines = [];
  let matCost = 0;
  for (const [good, amount] of Object.entries(mats)) {
    const price = GAME_STATE.market?.[good]?.price
      ?? (typeof GOODS !== 'undefined' ? (GOODS[good]?.base_price ?? 0) : 0);
    const subtotal = amount * price;
    matCost += subtotal;
    const goodDef = typeof GOODS !== 'undefined' ? GOODS[good] : null;
    lines.push({ good, amount, price: Math.round(price), subtotal: Math.round(subtotal),
                 icon: goodDef?.icon ?? '📦', name: goodDef?.name ?? good });
  }
  const laborCost = Math.round(matCost * (CONSTRUCTION_LABOR_SURCHARGE - 1));
  const total     = Math.round(matCost * CONSTRUCTION_LABOR_SURCHARGE);
  return { total, matCost: Math.round(matCost), laborCost, lines };
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

  // Здания с nation_buildable === false строятся только классами автономно
  if (bDef.nation_buildable === false) {
    return { ok: false, reason: `Это здание строится только классом (${bDef.autonomous_builder}), не нацией` };
  }

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
  // Детерминированный ID: ход + количество существующих слотов (без Date.now())
  const _slotIdx = (region.building_slots || []).length + (region.construction_queue || []).length;
  const queueId = check.is_upgrade
    ? `${regionId}_upg_${buildingId}_t${GAME_STATE.turn}`
    : `${regionId}_slot_t${GAME_STATE.turn}_${_slotIdx}`;

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

  return { ok: true, slot_id: queueId };
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
  const currentLevel = slot.level ?? 1;
  const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[regionId]?.name) || regionId;

  if (currentLevel > 1) {
    // Уменьшаем уровень на 1, возвращаем половину стоимости одного уровня
    slot.level = currentLevel - 1;
    const refund = Math.round((bDef?.cost ?? 0) * 0.5);
    if (refund > 0) nation.economy.treasury = (nation.economy.treasury || 0) + refund;
    recalculateRegionEmployment(region);
    if (typeof addEventLog === 'function') {
      addEventLog(`🏚 ${bDef?.name || slot.building_id} в ${rName}: уровень снижен до ${slot.level}.`, 'info');
    }
  } else {
    // Уровень 1 — сносим полностью
    slot.status = 'demolished';
    recalculateRegionEmployment(region);
    if (typeof addEventLog === 'function') {
      addEventLog(`🏚 ${bDef?.name || slot.building_id} снесено в ${rName}.`, 'info');
    }
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

// ══════════════════════════════════════════════════════════════
// STAGE 2: КАПИТАЛЬНЫЕ РЕСУРСЫ ФЕРМ
//
// Фермы потребляют инструменты и тягловых животных как
// производственный капитал. Нехватка снижает _capital_ratio,
// который умножается на выход в _calcSlotBaseOutput.
//
// Вызывается в runEconomyTick ДО processAllRecipes (шаг 0.5а).
// ══════════════════════════════════════════════════════════════

// Вспомогательная функция: wear-ставка для конкретного товара.
function _capitalWearRate(good, ciMonthlyWear) {
  if (ciMonthlyWear != null) return ciMonthlyWear;
  if (good === 'horses') return CONFIG.BALANCE.HORSE_MONTHLY_WEAR  ?? 0.0083;
  if (good === 'cattle') return CONFIG.BALANCE.CATTLE_MONTHLY_WEAR ?? 0.0070;
  if (good === 'tools')  return CONFIG.BALANCE.TOOLS_MONTHLY_WEAR  ?? 0.021;
  return 0.02;
}

// ──────────────────────────────────────────────────────────────
// procureCapitalInputs(nationId)
//
// Для каждого активного здания с capital_inputs:
//   1. Амортизирует текущий запас (_capital_stock).
//   2. Вычисляет дефицит до требуемого уровня.
//   3. Для скота — выбирает лошадей или волов по соотношению цена/эффект.
//   4. Закупает из nation.economy.stockpile (региональный рынок — Этапы 3–4).
//   5. Устанавливает slot._capital_ratio = min(ratio по всем входам).
// ──────────────────────────────────────────────────────────────
function procureCapitalInputs(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const stockpile = nation.economy.stockpile;
  const market    = GAME_STATE.market;
  const isPlayer  = (nationId === GAME_STATE.player_nation);

  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef = BUILDINGS[slot.building_id];
      if (!bDef?.capital_inputs?.length) {
        // Здание без capital_inputs — полная эффективность
        slot._capital_ratio = 1.0;
        continue;
      }

      // Гарантируем инициализацию (для зданий, построенных до Stage 2)
      if (!slot._capital_stock) slot._capital_stock = {};

      const level = slot.level || 1;
      let minRatio = 1.0;

      for (const ci of bDef.capital_inputs) {
        const required = ci.count_per_level * level;

        // ── 1. Амортизация основного товара ──────────────────────────────
        const wear = _capitalWearRate(ci.good, ci.monthly_wear);
        if ((slot._capital_stock[ci.good] || 0) > 0) {
          slot._capital_stock[ci.good] = Math.max(
            0, slot._capital_stock[ci.good] * (1 - wear),
          );
        }

        // Амортизация альтернативного товара (лошади, если держали вместо волов)
        if (ci.alt_good && (slot._capital_stock[ci.alt_good] || 0) > 0) {
          const altWear = _capitalWearRate(ci.alt_good, null);
          slot._capital_stock[ci.alt_good] = Math.max(
            0, slot._capital_stock[ci.alt_good] * (1 - altWear),
          );
        }

        // ── 2. Эффективный текущий запас (с учётом бонуса лошадей) ───────
        const altEff     = ci.alt_efficiency ?? CONFIG.BALANCE.HORSE_EFFICIENCY_MULT ?? 1.2;
        const stockPrim  = slot._capital_stock[ci.good]                   || 0;
        const stockAlt   = ci.alt_good ? (slot._capital_stock[ci.alt_good] || 0) * altEff : 0;
        const currentEff = stockPrim + stockAlt;

        // ── 3. Закупка при дефиците ───────────────────────────────────────
        const deficit = Math.max(0, required - currentEff);
        if (deficit > 0) {
          // Выбираем товар: тот, у которого ниже cost-per-effective-unit
          let buyGood    = ci.good;
          let buyEffMult = 1.0;

          if (ci.alt_good) {
            const priceAlt  = market[ci.alt_good]?.price ?? GOODS?.[ci.alt_good]?.base_price ?? 9999;
            const pricePrim = market[ci.good]?.price     ?? GOODS?.[ci.good]?.base_price     ?? 9999;
            const effCostAlt  = priceAlt  / altEff;   // цена за 1 eff-unit от alt
            const effCostPrim = pricePrim / 1.0;       // цена за 1 eff-unit от primary

            // Не меняем тип если уже накоплен запас противоположного
            // (избегаем постоянного переключения при малой разнице цен)
            const holdingAlt  = slot._capital_stock[ci.alt_good] || 0;
            const holdingPrim = slot._capital_stock[ci.good]     || 0;

            if (holdingAlt > holdingPrim) {
              // Уже держим лошадей — оставаться если не намного выгоднее переключиться
              buyGood    = (effCostPrim < effCostAlt * 0.75) ? ci.good : ci.alt_good;
            } else {
              buyGood    = (effCostAlt <= effCostPrim) ? ci.alt_good : ci.good;
            }
            buyEffMult = (buyGood === ci.alt_good) ? altEff : 1.0;
          }

          // Трёхуровневое снабжение:
          //   1. region.local_stockpile  (0% надбавка)
          //   2. провинциальный рынок    (+15%, −5% при дорогах) — Этап 4
          //   3. nation.economy.stockpile (национальный пул)
          const headsNeeded  = deficit / buyEffMult;
          let   stillNeeded  = headsNeeded;

          // ── 1. Берём из region.local_stockpile (цена = мировая, 0% доставка) ──
          if (!region.local_stockpile) region.local_stockpile = {};
          const localStock   = region.local_stockpile;
          const localAvail   = localStock[buyGood] || 0;
          const fromLocal    = Math.min(stillNeeded, localAvail);
          if (fromLocal > 0) {
            localStock[buyGood]          = Math.max(0, localAvail - fromLocal);
            slot._capital_stock[buyGood] = (slot._capital_stock[buyGood] || 0) + fromLocal;
            stillNeeded -= fromLocal;
          }

          // ── 2. Провинциальный рынок (+15%, −5% при дорогах) ─────────────────
          //   Доступ зависит от effective_control (Этап 6):
          //     'full' / 'partial' → закупка разрешена
          //     'trade_only'       → закупка разрешена, цена +15%
          //     'none'             → пропустить уровень
          if (stillNeeded > 0 && typeof getRegionProvince === 'function') {
            const provName   = getRegionProvince(rid);
            const prov       = provName ? GAME_STATE.provinces?.[provName] : null;
            const provAccess = (provName && typeof getProvinceMarketAccess === 'function')
              ? getProvinceMarketAccess(nationId, provName)
              : { access_tier: 'full' };

            if (provAccess.access_tier !== 'none' && prov?.market?.[buyGood]?.available > 0) {
              const provEntry  = prov.market[buyGood];
              const fromProv   = Math.min(stillNeeded, provEntry.available);
              if (fromProv > 0) {
                // Вычитаем из local_stockpile провинциальных регионов пропорционально
                let toDeduct = fromProv;
                for (const provRid of prov.regions) {
                  if (toDeduct <= 0) break;
                  const provRegion = GAME_STATE.regions[provRid];
                  if (!provRegion?.local_stockpile) continue;
                  const avail = provRegion.local_stockpile[buyGood] || 0;
                  if (avail <= 0) continue;
                  const take = Math.min(toDeduct, avail);
                  provRegion.local_stockpile[buyGood] = Math.max(0, avail - take);
                  toDeduct -= take;
                }
                // Транспортные расходы: базовая провинциальная надбавка × access price_modifier
                const provBaseCost  = _PROVINCE_TRANSPORT_BASE - (prov.has_roads ? _PROVINCE_ROAD_DISCOUNT : 0);
                const provTotalCost = provBaseCost * (provAccess.price_modifier ?? 1.0);
                const provPayment   = fromProv * (GAME_STATE.market[buyGood]?.price || 0) * provTotalCost;
                nation.economy.treasury = (nation.economy.treasury || 0) - provPayment;

                slot._capital_stock[buyGood] = (slot._capital_stock[buyGood] || 0) + fromProv;
                provEntry.available = Math.max(0, provEntry.available - fromProv);
                stillNeeded -= fromProv;
              }
            }
          }

          // ── 3. Остаток — из nation.economy.stockpile (национальный пул) ──────
          if (stillNeeded > 0) {
            const nationalAvail = stockpile[buyGood] || 0;
            const fromNational  = Math.min(stillNeeded, nationalAvail);
            if (fromNational > 0) {
              stockpile[buyGood]           = Math.max(0, nationalAvail - fromNational);
              slot._capital_stock[buyGood] = (slot._capital_stock[buyGood] || 0) + fromNational;
              stillNeeded -= fromNational;
            }
          }

          // ── 4. Мировой рынок (+25%, −10% договор, −5% монополия, кap +40%) ──
          if (stillNeeded > 0
              && typeof canAccessWorldMarket === 'function'
              && canAccessWorldMarket(nationId)) {

            const mktEntry = market[buyGood];
            if (mktEntry && (mktEntry.world_stockpile || 0) > 0) {
              const quota    = mktEntry._quota_per_buyer ?? (mktEntry.world_stockpile || 0);
              const boughtSoFar = (mktEntry._world_bought_tick?.[nationId] || 0);
              const canBuy   = Math.max(0, quota - boughtSoFar);
              const fromWorld = Math.min(stillNeeded, canBuy, mktEntry.world_stockpile || 0);

              if (fromWorld > 0) {
                const transportCost = typeof getWorldMarketTransportCost === 'function'
                  ? getWorldMarketTransportCost(nationId, buyGood)
                  : _WORLD_SEA_COST_BASE ?? 0.25;

                // Транспортные расходы списываем с казны
                const payment = fromWorld * (mktEntry.price || 0) * transportCost;
                nation.economy.treasury = (nation.economy.treasury || 0) - payment;

                mktEntry.world_stockpile = Math.max(0, mktEntry.world_stockpile - fromWorld);
                if (!mktEntry._world_bought_tick) mktEntry._world_bought_tick = {};
                mktEntry._world_bought_tick[nationId] = boughtSoFar + fromWorld;

                slot._capital_stock[buyGood] = (slot._capital_stock[buyGood] || 0) + fromWorld;
                stillNeeded -= fromWorld;

                if (isPlayer && typeof addEventLog === 'function') {
                  const gName = GOODS?.[buyGood]?.name ?? buyGood;
                  addEventLog(
                    `🌊 Закупка ${Math.round(fromWorld)} ${gName} на мировом рынке`
                    + ` (+${Math.round(transportCost * 100)}% транспорт, −${Math.round(payment)} монет)`,
                    'economy',
                  );
                }
              }
            }
          }
        }

        // ── 4. Итоговый ratio после закупки ──────────────────────────────
        const finalPrim  = slot._capital_stock[ci.good]                    || 0;
        const finalAlt   = ci.alt_good ? (slot._capital_stock[ci.alt_good] || 0) * altEff : 0;
        const finalEff   = finalPrim + finalAlt;
        const ratio      = required > 0 ? Math.min(1.0, finalEff / required) : 1.0;
        minRatio         = Math.min(minRatio, ratio);

        // ── 5. Предупреждение для игрока при серьёзном дефиците ───────────
        if (isPlayer && ratio < 0.5 && typeof addEventLog === 'function') {
          const goodName = GOODS?.[ci.good]?.name ?? ci.good;
          const bName    = BUILDINGS?.[slot.building_id]?.name ?? slot.building_id;
          addEventLog(
            `⚠ ${bName}: нехватка ${goodName} (${Math.round(ratio * 100)}% запаса), производительность снижена`,
            'warning',
          );
        }
      }

      slot._capital_ratio = minRatio;
    }
  }
}

// ──────────────────────────────────────────────────────────────
// procureSlaves(nationId)
//
// Поддерживает численность рабов в зданиях с slave_fallback_profession.
// Покупает недостающих рабов с мирового рынка (market.slaves).
//
// Логика:
//   • Считает суммарную потребность всех активных рабовладельческих зданий.
//   • Сравнивает с nation.population.by_profession.slaves.
//   • Докупает дефицит из market.slaves.world_stockpile (до 50 в тик).
//   • Цена → nation.economy.treasury; рабы → nation.population.
//
// Вызывается в runEconomyTick ДО processAllRecipes (шаг 0.5б).
// ──────────────────────────────────────────────────────────────
function procureSlaves(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const slaveGood = GAME_STATE.market?.slaves;
  if (!slaveGood || (slaveGood.world_stockpile ?? 0) <= 0) return;

  const byProf = nation.population.by_profession;

  // Суммируем сколько рабов нужно всем активным зданиям нации
  let totalNeeded = 0;
  for (const rid of nation.regions) {
    const region = GAME_STATE.regions[rid];
    if (!region?.building_slots?.length) continue;

    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;

      const bDef = BUILDINGS[slot.building_id];
      if (!bDef?.slave_fallback_profession) continue;

      const level          = slot.level || 1;
      const slaveWorkerDef = (bDef.worker_profession || []).find(wp => wp.profession === 'slaves');
      if (!slaveWorkerDef) continue;

      totalNeeded += slaveWorkerDef.count * level;
    }
  }

  if (totalNeeded === 0) return;

  const currentSlaves = byProf.slaves || 0;
  const deficit       = Math.max(0, totalNeeded - currentSlaves);
  if (deficit <= 0) return;

  const worldAvailable = slaveGood.world_stockpile ?? 0;
  const price          = slaveGood.price ?? 200;
  const canAfford      = Math.floor(nation.economy.treasury / price);
  // Ограничиваем закупку: не более 50 в тик, не больше рыночного предложения и казны
  const toBuy = Math.min(deficit, worldAvailable, canAfford, 50);
  if (toBuy <= 0) return;

  const cost = toBuy * price;
  nation.economy.treasury              -= cost;
  byProf.slaves                         = currentSlaves + toBuy;
  nation.population.total               = (nation.population.total || 0) + toBuy;
  slaveGood.world_stockpile             = Math.max(0, worldAvailable - toBuy);

  if (nationId === GAME_STATE.player_nation && typeof addEventLog === 'function') {
    addEventLog(
      `⛓ Куплено ${toBuy} рабов для латифундий — ${Math.round(cost)} монет`,
      'economy',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// initBuildingOwnership()
//
// Вызывается ОДИН РАЗ при старте новой игры (initGame, до loadGame).
// Для всех наций (игрок + ИИ) корректирует собственность wheat-зданий:
//
//   wheat_latifundium : 70% → aristocrats, 30% → nation
//     • Сортировка по level убыв. — крупнейшие латифундии достаются
//       аристократам (при round(N×0.7) аристократов, остальные — государству)
//     • Если в нации только одна латифундия — она идёт аристократам (round(0.7)=1)
//
//   wheat_villa       : 100% → soldiers_class
//     • Проверка лимита: сумма level по слотам нации < soldiers_population
//       Если превышает — уровни крупнейших вилл обрезаются до 80% от солдат
//
//   wheat_family_farm : 100% → farmers_class
//
// ИСПРАВЛЯЕТ БАГ: на старте ряд латифундий имел owner='nation' вместо
// owner='aristocrats', из-за чего аристократы показывали 0 зданий/0 дохода.
// ─────────────────────────────────────────────────────────────────────────────
function initBuildingOwnership() {
  const regions = GAME_STATE.regions;
  if (!regions) return;

  // ── 1. Группируем слоты по нации ────────────────────────────────────────
  const byNation = {};
  for (const region of Object.values(regions)) {
    if (!Array.isArray(region.building_slots)) continue;
    const nId = region.nation;
    if (!nId || nId === 'neutral') continue;
    if (!byNation[nId]) byNation[nId] = { latifundia: [], villas: [], farms: [] };
    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;
      if      (slot.building_id === 'wheat_latifundium')  byNation[nId].latifundia.push(slot);
      else if (slot.building_id === 'wheat_villa')        byNation[nId].villas.push(slot);
      else if (slot.building_id === 'wheat_family_farm')  byNation[nId].farms.push(slot);
    }
  }

  // ── 2. Применяем правила для каждой нации ───────────────────────────────
  const report = [];

  for (const [nId, data] of Object.entries(byNation)) {
    const nation = GAME_STATE.nations[nId];
    const soldiersPop = nation?.population?.by_profession?.soldiers ?? Infinity;

    // 2a. Латифундии: 70% аристократам, 30% государству
    if (data.latifundia.length > 0) {
      data.latifundia.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
      const nLat      = data.latifundia.length;
      const nAristocr = Math.max(1, Math.round(nLat * 0.7));
      data.latifundia.forEach((slot, i) => {
        slot.owner = i < nAristocr ? 'aristocrats' : 'nation';
        // Сбрасываем убытки/паузу — старое обслуживание (50×level) или нехватка
        // capital_inputs могла закрыть латифундии. После исправления — открываем.
        slot.loss_streak     = 0;
        slot._recovery_accum = 0;
        slot.production_eff  = 1.0;
      });
      report.push({
        nation: nId, cls: 'Аристократы', type: 'Латифундия',
        pct: `${Math.round((nAristocr / nLat) * 100)}%`, count: nAristocr,
      });
      if (nLat - nAristocr > 0) {
        report.push({
          nation: nId, cls: 'Государство', type: 'Латифундия',
          pct: `${Math.round(((nLat - nAristocr) / nLat) * 100)}%`, count: nLat - nAristocr,
        });
      }
    }

    // 2b. Виллы: 100% солдатам, лимит по суммарному уровню
    if (data.villas.length > 0) {
      data.villas.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
      const totalLevel = data.villas.reduce((s, sl) => s + (sl.level ?? 1), 0);
      if (totalLevel >= soldiersPop) {
        // Обрезаем уровни до 80% от популяции солдат
        const cap = Math.floor(soldiersPop * 0.8);
        let remaining = cap;
        for (const slot of data.villas) {
          const take = Math.min(slot.level ?? 1, remaining);
          slot.level = take;
          remaining -= take;
          if (remaining <= 0) slot.level = 0;
        }
      }
      data.villas.forEach(slot => { slot.owner = 'soldiers_class'; });
      report.push({
        nation: nId, cls: 'Солдаты', type: 'Вилла',
        pct: '100%', count: data.villas.length,
      });
    }

    // 2c. Фермы: 100% земледельцам
    if (data.farms.length > 0) {
      const farmDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS['wheat_family_farm'] : null;
      data.farms.forEach(slot => {
        slot.owner          = 'farmers_class';
        // Сбрасываем убытки: при старом обслуживании (50×level) фермы уходили
        // в хронический убыток и закрывались. После исправления формулы — открываем.
        slot.loss_streak     = 0;
        slot._recovery_accum = 0;
        slot.production_eff  = 1.0;
        if (slot.workers && farmDef?.workers_per_unit) {
          for (const prof of Object.keys(slot.workers)) {
            slot.workers[prof] = farmDef.workers_per_unit;
          }
        }
      });
      report.push({
        nation: nId, cls: 'Земледельцы', type: 'Семейная ферма',
        pct: '100%', count: data.farms.length,
      });
    }
  }

  // ── 2d. Прочие здания — собственность по autonomous_builder или типу ────────
  // Правила из OWNER_RULES генератора (дублируем здесь для единообразия):
  //   horse_ranch, cattle_farm    → soldiers_class / farmers_class
  //   olive_grove, hemp_field     → farmers_class
  //   apiary, ranch               → farmers_class
  // Здания которым уже проставлен owner (пшеничные) — не трогаем.
  const EXTRA_OWNERS = {
    horse_ranch:   'soldiers_class',
    cattle_farm:   'farmers_class',
    olive_grove:   'farmers_class',
    hemp_field:    'farmers_class',
    apiary:        'farmers_class',
    ranch:         'farmers_class',
  };
  // Сбрасываем счётчики убытков на сгенерированных зданиях (founded_turn=0)
  // чтобы они не закрылись в первый же ход из-за нулевой выручки при старте.
  for (const region of Object.values(regions)) {
    if (!Array.isArray(region.building_slots)) continue;
    for (const slot of region.building_slots) {
      if (slot.owner === undefined) {
        const newOwner = EXTRA_OWNERS[slot.building_id];
        if (newOwner) slot.owner = newOwner;
      }
      // Сброс счётчиков для свежих зданий (founded_turn=0 = стартовые)
      if (slot.founded_turn === 0) {
        slot.loss_streak     = 0;
        slot._recovery_accum = 0;
        slot.production_eff  = 1.0;
      }
    }
  }

  // ── 3. Предзаполнение капитальных запасов зданий ─────────────────────────
  // На старте новой игры здания уже работают (исторический сценарий).
  // slot._capital_stock пуст → в первый ход procureCapitalInputs не может
  // купить весь объём из тощего госзапаса → _capital_ratio=0 → выручка=0.
  // Решение: заполнить _capital_stock по норме (count_per_level × level).
  // Если уже есть запас ≥ 50% нормы — не трогаем (игровая сессия в процессе).
  for (const region of Object.values(regions)) {
    if (!Array.isArray(region.building_slots)) continue;
    for (const slot of region.building_slots) {
      if (slot.status !== 'active') continue;
      const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[slot.building_id] : null;
      if (!bDef?.capital_inputs?.length) continue;
      const level = slot.level || 1;
      if (!slot._capital_stock) slot._capital_stock = {};
      for (const ci of bDef.capital_inputs) {
        const required = ci.count_per_level * level;
        if ((slot._capital_stock[ci.good] || 0) < required * 0.5) {
          slot._capital_stock[ci.good] = required;
        }
      }
      // После заполнения гарантируем полную эффективность на старте
      slot._capital_ratio = 1.0;
    }
  }

  // ── 4. Отчёт в консоль ───────────────────────────────────────────────────
  console.log('[initBuildingOwnership] Собственность зданий инициализирована:');
  console.table(report.map(r => ({
    Нация: r.nation, Класс: r.cls, Тип: r.type,
    '% владения': r.pct, 'Кол-во слотов': r.count,
  })));
}
