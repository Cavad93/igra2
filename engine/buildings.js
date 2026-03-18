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

// Terrain-бонус для конкретного товара: некоторые локации лучше подходят
// для определённых типов производства.
function _terrainGoodBonus(terrain, good) {
  const TABLE = {
    plains:       { wheat: 1.15, barley: 1.10, wool:   1.10 },
    hills:        { wine:  1.20, olive_oil: 1.15, iron: 1.10, sulfur: 1.15 },
    river_valley: { wheat: 1.25, barley: 1.15, cloth: 1.15, pottery: 1.10, papyrus: 1.20 },
    mountains:    { iron:  1.20, bronze: 1.15, timber: 1.10, sulfur: 1.30 },  // Этна — богатейшие залежи
    coastal_city: { fish:  1.20, salt:   1.20, trade_goods: 1.15, tuna: 1.25 },
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
// 2. ВЫХОД ЗДАНИЯ (товары за ход)
// Возвращает { good: amount } для одного активного слота.
// ──────────────────────────────────────────────────────────────

function getBuildingOutput(slot, region, nation) {
  if (!slot || slot.status !== 'active') return {};

  const bDef = BUILDINGS[slot.building_id];
  if (!bDef || !bDef.production_output?.length) return {};

  const terrain    = region.terrain || region.type || 'plains';
  const fertility  = region.fertility ?? 0.7;
  const satMod     = nation.population._production_mod ?? 1.0;
  const level      = slot.level || 1;
  const workers    = _slotTotalWorkers(slot) * level;

  if (workers <= 0) return {};

  const output = {};
  for (const { good, base_rate } of bDef.production_output) {
    const terrainBonus = _terrainGoodBonus(terrain, good);
    // base_rate: единиц товара на 1000 рабочих в ход
    const amount = (workers / 1000) * base_rate * fertility * satMod * terrainBonus;
    if (amount > 0.1) output[good] = (output[good] || 0) + amount;
  }

  return output;
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
  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations[nationId];
  if (!nation) return;

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

  region.building_slots.push({
    slot_id:      entry.slot_id,
    building_id:  entry.building_id,
    status:       'active',
    level:        1,
    workers,
    founded_turn: GAME_STATE.turn,
    revenue:      0,
    wages_paid:   0,
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

// ──────────────────────────────────────────────────────────────
// 7. УРОВЕНЬ БЕЗРАБОТИЦЫ ПО ПРОФЕССИЯМ
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

  // Стоимость — снимаем с казны
  const cost = bDef.cost || 0;
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
