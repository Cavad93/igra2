// agents/calibrator.js — калибровка числовых полей цепочки без API
// Исправляет output_per_turn и workers.total_needed на основе GOODS_LABOR

// Допустимое отклонение от базового значения (x0.1 … x10)
const MIN_RATIO = 0.10;
const MAX_RATIO = 10.0;

/**
 * calibrateChain(chain, allData) → { chain, adjustments }
 *
 * Проверяет:
 *   - output_per_turn в пределах MIN_RATIO..MAX_RATIO × base_output_per_turn
 *   - workers.total_needed в пределах 1..workers_per_building × 5
 *   - slave_ratio в пределах min_slave_ratio..max_slave_ratio
 *
 * Если значение вне диапазона — клампирует к ближайшей границе.
 * Возвращает { chain, adjustments: [] } где adjustments описывают что исправлено.
 */
export function calibrateChain(chain, allData) {
  const labor = allData.GOODS_LABOR?.[chain.good_id];
  if (!labor) return { chain, adjustments: [] };

  const adjustments = [];
  const c = { ...chain, workers: { ...chain.workers } };

  // ── 1. output_per_turn ────────────────────────────────────────────────────
  const base = labor.base_output_per_turn;
  if (base && base > 0) {
    const min = base * MIN_RATIO;
    const max = base * MAX_RATIO;
    const orig = c.output_per_turn;

    if (orig < min) {
      c.output_per_turn = Math.round(min);
      adjustments.push(`output_per_turn: ${orig} → ${c.output_per_turn} (мин ${min.toFixed(0)} = base×${MIN_RATIO})`);
    } else if (orig > max) {
      c.output_per_turn = Math.round(max);
      adjustments.push(`output_per_turn: ${orig} → ${c.output_per_turn} (макс ${max.toFixed(0)} = base×${MAX_RATIO})`);
    }

    // output.quantity синхронизируем с output_per_turn
    if (c.output?.quantity !== c.output_per_turn) {
      c.output = { ...c.output, quantity: c.output_per_turn };
    }
  }

  // ── 2. workers.total_needed ───────────────────────────────────────────────
  const maxWorkers = (labor.workers_per_building ?? 10) * 5;
  const origW = c.workers?.total_needed ?? 0;
  if (origW < 1) {
    c.workers.total_needed = labor.workers_per_building ?? 5;
    adjustments.push(`workers.total_needed: ${origW} → ${c.workers.total_needed} (мин 1)`);
  } else if (origW > maxWorkers) {
    c.workers.total_needed = maxWorkers;
    adjustments.push(`workers.total_needed: ${origW} → ${maxWorkers} (макс ${maxWorkers})`);
  }

  // ── 3. slave_ratio в историческом диапазоне ───────────────────────────────
  const sr = c.workers?.slave_ratio;
  if (sr !== undefined && sr !== null) {
    const { min_slave_ratio: sMin, max_slave_ratio: sMax } = labor;
    if (sMin !== undefined && sMax !== undefined) {
      if (sr < sMin) {
        c.workers.slave_ratio = sMin;
        adjustments.push(`slave_ratio: ${sr} → ${sMin} (историч. мин для ${chain.good_id})`);
      } else if (sr > sMax) {
        c.workers.slave_ratio = sMax;
        adjustments.push(`slave_ratio: ${sr} → ${sMax} (историч. макс для ${chain.good_id})`);
      }
    }
  }

  return { chain: c, adjustments };
}
