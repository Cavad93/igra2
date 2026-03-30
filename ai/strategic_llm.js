/**
 * strategic_llm.js — Стратегическое планирование нации через Groq LLM
 *
 * Каждые STRATEGIC_INTERVAL ходов (по умолчанию 20) для Tier-1 наций
 * генерируется стратегический план на 20-40 ходов вперёд.
 *
 * Архитектура:
 *   1. shouldPlan(nation, turn)        — нужно ли создавать план сейчас
 *   2. createPlan(nation, ou, gameState)— запрос к Groq + сохранение плана
 *   3. executePlan(nation, ou, turn)    — применение текущей фазы плана
 *   4. _broadcastCoalitionPlan(plan, gs)— передача плана союзникам
 *   5. _buildFallbackPlan(nation, ou)   — локальный план без LLM
 */

// ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────────

const STRATEGIC_CONFIG = {
  groqModel:         'llama-3.3-70b-versatile',
  maxTokens:         400,
  timeoutMs:         25_000,
  planInterval:      20,    // каждые N ходов
  planHorizon:       40,    // горизонт плана (ходов)
  minTreasury:       0,     // минимум казны для планирования
  enableGroq:        true,
  tier1Threshold:    3,     // Tier ≤ 3 → получает стратегический план
};

// ─── ШАБЛОНЫ СТРАТЕГИЙ (будут заполнены в ST_004) ────────────────────────────

const STRATEGY_TEMPLATES = {};

// ─── СТРУКТУРА СТРАТЕГИЧЕСКОГО ПЛАНА ─────────────────────────────────────────

/**
 * Создаёт пустую структуру плана.
 * @returns {Object} — шаблон плана
 */
function _emptyPlan() {
  return {
    createdAt:     null,   // ход создания
    horizon:       0,      // сколько ходов рассчитан
    strategy:      '',     // название стратегии
    goal:          '',     // главная цель
    phases:        [],     // [{name, duration, ou_overrides, priority_actions, forbidden_actions, trigger_conditions}]
    currentPhase:  0,      // индекс активной фазы
    commitments:   [],     // обещания союзникам
    fallback:      false,  // true → план без LLM
  };
}

// ─── ЗАГЛУШКИ ПУБЛИЧНЫХ ФУНКЦИЙ ───────────────────────────────────────────────

/**
 * Решает, нужно ли создавать стратегический план прямо сейчас.
 * @param {Object} nation
 * @param {number} currentTurn
 * @returns {boolean}
 */
function shouldPlan(nation, currentTurn) {
  // TODO ST_002: реализовать логику проверки
  void nation; void currentTurn;
  return false;
}

/**
 * Создаёт стратегический план (вызов Groq + валидация + fallback).
 * @param {Object} nation
 * @param {Object} ou       — состояние OU из nation._ou
 * @param {Object} gameState
 * @returns {Promise<Object>} plan
 */
async function createPlan(nation, ou, gameState) {
  // TODO ST_003: реализовать запрос к Groq
  void ou; void gameState;
  return _buildFallbackPlan(nation, ou);
}

/**
 * Применяет текущую фазу стратегического плана к OU-состоянию.
 * @param {Object} nation
 * @param {Object} ou
 * @param {number} currentTurn
 * @returns {Object|null} activePhase или null
 */
function executePlan(nation, ou, currentTurn) {
  // TODO ST_005: реализовать выполнение фаз
  void nation; void ou; void currentTurn;
  return null;
}

/**
 * Рассылает упрощённый план союзникам нации.
 * @param {Object} plan
 * @param {Object} gameState
 */
function _broadcastCoalitionPlan(plan, gameState) {
  // TODO ST_006: реализовать рассылку
  void plan; void gameState;
}

/**
 * Строит локальный план без LLM на основе шаблона по personality.
 * @param {Object} nation
 * @param {Object} ou
 * @returns {Object} plan
 */
function _buildFallbackPlan(nation, ou) {
  // TODO ST_004: реализовать 6 шаблонов по personality
  void ou;
  const plan = _emptyPlan();
  plan.createdAt  = nation._ou?.tick ?? 0;
  plan.horizon    = STRATEGIC_CONFIG.planHorizon;
  plan.strategy   = 'consolidation';
  plan.goal       = 'Maintain stability';
  plan.fallback   = true;
  return plan;
}

// ─── ЭКСПОРТ ──────────────────────────────────────────────────────────────────

export { shouldPlan, createPlan, executePlan, _broadcastCoalitionPlan,
         _buildFallbackPlan, STRATEGIC_CONFIG, STRATEGY_TEMPLATES };

if (typeof window !== 'undefined') {
  window.StrategicLLM = { shouldPlan, createPlan, executePlan,
                           _buildFallbackPlan, STRATEGIC_CONFIG };
}
