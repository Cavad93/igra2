// agents/scorer.js — оценка качества производственной цепочки (0-100)
// Без API. Используется после сборки финального объекта.

import { SEVERITY } from './validator.js';

/**
 * scoreChain(chain, allData, issues) → { score: number, breakdown: object }
 *
 * score 0-100:
 *   ≥ 80 — отличная цепочка, записывается без предупреждений
 *   60-79 — хорошая, минорные недочёты
 *   40-59 — посредственная, отправляется на улучшение
 *   < 40  — слабая, требует доработки
 */
export function scoreChain(chain, allData, issues = []) {
  const breakdown = {};
  let total = 0;

  // ── 1. biome_modifiers заполнен (15 pts) ─────────────────────────────────
  const biomeKeys = Object.keys(chain.biome_modifiers ?? {});
  const meta = allData.GOODS_META?.[chain.good_id];
  if (meta?.resource_type === 'biome' || meta?.resource_type === 'hybrid') {
    if (biomeKeys.length >= 3) {
      breakdown.biome_modifiers = 15;
    } else if (biomeKeys.length >= 1) {
      breakdown.biome_modifiers = 8;
    } else {
      breakdown.biome_modifiers = 0;
    }
  } else {
    // processed/deposit/import — biome_modifiers не обязательны
    breakdown.biome_modifiers = 10;
  }
  total += breakdown.biome_modifiers;

  // ── 2. Разнообразие inputs (10 pts) ──────────────────────────────────────
  const inputs = chain.inputs ?? [];
  const uniqueSources = new Set(inputs.map(i => i.source));
  if (inputs.length >= 2 && uniqueSources.size >= 2) {
    breakdown.inputs_diversity = 10;
  } else if (inputs.length >= 1) {
    breakdown.inputs_diversity = 5;
  } else {
    // Товары без inputs (biome/deposit) не штрафуем
    breakdown.inputs_diversity = (meta?.resource_type === 'biome' || meta?.resource_type === 'deposit') ? 8 : 3;
  }
  total += breakdown.inputs_diversity;

  // ── 3. upstream_chains заполнен (10 pts) ─────────────────────────────────
  const upLen = (chain.upstream_chains ?? []).length;
  if (upLen >= 2) {
    breakdown.upstream = 10;
  } else if (upLen === 1) {
    breakdown.upstream = 6;
  } else {
    // biome/import могут не иметь upstream
    breakdown.upstream = (meta?.resource_type === 'biome' || meta?.resource_type === 'import_only') ? 8 : 2;
  }
  total += breakdown.upstream;

  // ── 4. bottleneck содержательный (10 pts) ────────────────────────────────
  const bottleneck = chain.bottleneck ?? '';
  if (bottleneck.length >= 40) {
    breakdown.bottleneck = 10;
  } else if (bottleneck.length >= 15) {
    breakdown.bottleneck = 6;
  } else {
    breakdown.bottleneck = 0;
  }
  total += breakdown.bottleneck;

  // ── 5. PDF chain IDs привязаны (10 pts) ──────────────────────────────────
  const pdfLen = (chain.pdf_chain_ids ?? []).length;
  if (pdfLen >= 2) {
    breakdown.pdf_refs = 10;
  } else if (pdfLen === 1) {
    breakdown.pdf_refs = 5;
  } else {
    breakdown.pdf_refs = 0;
  }
  total += breakdown.pdf_refs;

  // ── 6. slave_ratio в историческом диапазоне (10 pts) ─────────────────────
  const labor = allData.GOODS_LABOR?.[chain.good_id];
  const sr = chain.workers?.slave_ratio ?? -1;
  if (labor && sr >= 0) {
    const inRange = sr >= labor.min_slave_ratio && sr <= labor.max_slave_ratio;
    breakdown.slave_ratio_accuracy = inRange ? 10 : 3;
  } else {
    breakdown.slave_ratio_accuracy = 5;
  }
  total += breakdown.slave_ratio_accuracy;

  // ── 7. output_per_turn откалиброван (10 pts) ─────────────────────────────
  const opt = chain.output_per_turn ?? 0;
  if (labor?.base_output_per_turn) {
    const base = labor.base_output_per_turn;
    const ratio = opt / base;
    if (ratio >= 0.3 && ratio <= 5.0) {
      breakdown.output_calibration = 10;
    } else if (ratio >= 0.1 && ratio <= 10.0) {
      breakdown.output_calibration = 5;
    } else {
      breakdown.output_calibration = 0;
    }
  } else {
    breakdown.output_calibration = opt > 0 ? 7 : 0;
  }
  total += breakdown.output_calibration;

  // ── 8. ownership различается для 4 типов правления (10 pts) ─────────────
  const own = chain.ownership ?? {};
  const ownValues = [own.default, own.under_tyranny, own.under_oligarchy, own.under_republic];
  const filled = ownValues.filter(Boolean).length;
  const distinct = new Set(ownValues.filter(Boolean)).size;
  if (filled === 4 && distinct >= 2) {
    breakdown.ownership_variety = 10;
  } else if (filled >= 3) {
    breakdown.ownership_variety = 6;
  } else {
    breakdown.ownership_variety = 2;
  }
  total += breakdown.ownership_variety;

  // ── 9. Нет validation_warnings (10 pts) ──────────────────────────────────
  const warns = (chain.validation_warnings ?? []).length +
    (issues.filter(i => i.severity === SEVERITY.WARN).length);
  if (warns === 0) {
    breakdown.clean_warnings = 10;
  } else if (warns <= 2) {
    breakdown.clean_warnings = 6;
  } else {
    breakdown.clean_warnings = Math.max(0, 10 - warns * 2);
  }
  total += breakdown.clean_warnings;

  // ── 10. class_conflicts и economic_loops описаны (5 pts) ─────────────────
  const hasConflicts = (chain.class_conflicts ?? []).length > 0;
  const hasLoops     = (chain.economic_loops   ?? []).length > 0;
  breakdown.depth = hasConflicts || hasLoops ? 5 : 2;
  total += breakdown.depth;

  const score = Math.min(100, Math.max(0, total));

  return {
    score,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
    breakdown,
  };
}

/**
 * SCORE_THRESHOLD — ниже этого значения цепочка отправляется на улучшение
 */
export const SCORE_THRESHOLD = 40;
