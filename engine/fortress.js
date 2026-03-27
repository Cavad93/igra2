// ══════════════════════════════════════════════════════════════════════
// ДВИЖОК КРЕПОСТЕЙ — fortress.js
//
// Отвечает за:
//   • Максимальный гарнизон от уровня крепости
//   • Рекрутирование гарнизона из свободного населения
//   • Расчёт расходов на содержание (с учётом консервации)
//   • Лимит крепостей по размеру страны
//   • Консервация: 90% экономия, гарнизон заморожен, ползунок не влияет
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Максимальный гарнизон по уровню крепости ─────────────────────────
const FORTRESS_GARRISON_MAX = { 1: 100, 2: 250, 3: 500, 4: 900, 5: 1500 };

// Монет за одного солдата гарнизона в ход
const GARRISON_UPKEEP_RATE = 1.5;

// Базовое содержание уровня крепости (стены, ремонт, стражники) монет/ход
const FORTRESS_LEVEL_UPKEEP = { 1: 30, 2: 60, 3: 110, 4: 180, 5: 280 };

// ── Лимит крепостей по размеру страны ────────────────────────────────
/**
 * Возвращает максимальное количество крепостей которое нация может содержать.
 * Формула: floor(регионов / 3) + 1, минимум 1, максимум 12.
 */
function getFortressLimit(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 1;
  const regionCount = (nation.regions ?? []).length;
  return Math.max(1, Math.min(12, Math.floor(regionCount / 3) + 1));
}

/**
 * Возвращает текущее количество крепостей у нации (fortress_level > 0).
 */
function getFortressCount(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;
  let count = 0;
  for (const regionId of (nation.regions ?? [])) {
    const region = GAME_STATE.regions?.[regionId];
    if ((region?.fortress_level ?? 0) > 0) count++;
  }
  return count;
}

// ── Расчёт расходов на крепости ───────────────────────────────────────
/**
 * Рассчитывает базовые расходы на все крепости нации.
 * Разделяет на активные (множитель ползунка применяется) и
 * законсервированные (фиксированная стоимость 10%, ползунок НЕ влияет).
 *
 * @returns {{ active: number, conserved: number, detail: Array }}
 */
function calcFortressExpenses(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return { active: 0, conserved: 0, detail: [] };

  let active    = 0;  // суммарно по активным (будет умножено на ползунок)
  let conserved = 0;  // суммарно законсервированным (10%, ползунок не влияет)
  const detail  = [];

  for (const regionId of (nation.regions ?? [])) {
    const region = GAME_STATE.regions?.[regionId];
    if (!region) continue;

    const fortLvl = region.fortress_level ?? 0;
    if (fortLvl === 0) continue;

    const isConserved  = region.fortress_conserved === true;
    const garrison     = region.garrison ?? 0;
    const levelUpkeep  = FORTRESS_LEVEL_UPKEEP[fortLvl] ?? 30;
    const garrisonCost = Math.round(garrison * GARRISON_UPKEEP_RATE);
    const baseCost     = levelUpkeep + garrisonCost;

    if (isConserved) {
      const cost = Math.round(baseCost * 0.10);
      conserved += cost;
      detail.push({ regionId, fortLvl, garrison, baseCost: cost, isConserved: true });
    } else {
      active += baseCost;
      detail.push({ regionId, fortLvl, garrison, baseCost, isConserved: false });
    }
  }

  return { active: Math.round(active), conserved: Math.round(conserved), detail };
}

// ── Рекрутирование гарнизонов ─────────────────────────────────────────
/**
 * Вызывается каждый ход из processTurn().
 * Для активных (не законсервированных) крепостей:
 *   - Набирает до garrison_max из свободного местного населения
 *   - При низком финансировании (< 75%) гарнизон убывает
 * Для законсервированных: гарнизон заморожен.
 */
function processFortressGarrisons() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations ?? {})) {
    const expLevels    = nation.economy?.expense_levels ?? {};
    const fundingMult  = Math.max(0.5, Math.min(1.5, expLevels.fortresses ?? 1.0));

    for (const regionId of (nation.regions ?? [])) {
      const region = GAME_STATE.regions?.[regionId];
      if (!region) continue;

      const fortLvl = region.fortress_level ?? 0;
      if (fortLvl === 0) continue;

      const isConserved  = region.fortress_conserved === true;
      const garrisonMax  = FORTRESS_GARRISON_MAX[fortLvl] ?? 100;

      if (!region.garrison) region.garrison = 0;

      if (isConserved) {
        // Законсервировано: гарнизон не меняется
        continue;
      }

      // ── Рекрутирование ───────────────────────────────────────────
      const freePop  = region.population ?? 0;
      const current  = region.garrison;

      if (current < garrisonMax && freePop > garrisonMax * 3) {
        // Рекрутируем до 0.4% населения за ход, не более 40 за раз
        const canRecruit = Math.min(
          Math.floor(freePop * 0.004),
          garrisonMax - current,
          40
        );
        if (canRecruit > 0) region.garrison += canRecruit;
      }

      // Гарнизон не может превышать максимум
      if (region.garrison > garrisonMax) region.garrison = garrisonMax;

      // ── Убыль при низком финансировании ──────────────────────────
      if (fundingMult < 0.75 && region.garrison > 0) {
        const decay = Math.max(1, Math.floor(region.garrison * (0.75 - fundingMult) * 0.15));
        region.garrison = Math.max(0, region.garrison - decay);
      }
    }
  }
}

/**
 * Переключает режим консервации крепости в регионе.
 * Вызывается из UI (кнопка в панели крепости).
 */
function toggleFortressConservation(regionId) {
  const region = GAME_STATE.regions?.[regionId];
  if (!region || (region.fortress_level ?? 0) === 0) return;

  region.fortress_conserved = !region.fortress_conserved;

  const rName = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[regionId]?.name)
    || region.name || regionId;

  if (typeof addEventLog === 'function') {
    if (region.fortress_conserved) {
      addEventLog(`🔒 ${rName}: крепость законсервирована. Содержание −90%, гарнизон заморожен.`, 'economy');
    } else {
      addEventLog(`🔓 ${rName}: крепость расконсервирована. Гарнизон начнёт набор.`, 'military');
    }
  }

  // Перерисовать вкладку строительства если открыта
  if (typeof renderConstructionTab === 'function') {
    const tabEl = document.getElementById('region-build-tab-content');
    if (tabEl) tabEl.innerHTML = renderConstructionTab(regionId);
  }
}
