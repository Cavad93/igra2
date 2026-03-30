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

// ─── ШАБЛОНЫ СТРАТЕГИЙ ────────────────────────────────────────────────────────

const STRATEGY_TEMPLATES = {

  military_buildup: {
    strategy: 'military_buildup',
    goal: 'Achieve military dominance through rapid force expansion and conquest',
    phases: [
      { name: 'Mobilisation',  duration: 8,  priority_actions: ['recruit_infantry','recruit_cavalry','build_barracks'], forbidden_actions: ['demobilize'], ou_overrides: {'military.army_size':0.15,'military.readiness':0.10,'economy.treasury':-0.05}, trigger_conditions: { abort: 'army_size>0.85', early_trigger: 'enemy_weakness' } },
      { name: 'Campaign',      duration: 15, priority_actions: ['mobilize','recruit_cavalry','sell_goods'],             forbidden_actions: ['seek_alliance','demobilize'], ou_overrides: {'military.morale':0.10,'military.army_size':0.10,'economy.trade_balance':-0.05}, trigger_conditions: { abort: 'treasury<0', early_trigger: 'victory' } },
      { name: 'Consolidation', duration: 10, priority_actions: ['build_farm','build_market','demobilize'],              forbidden_actions: ['mobilize'], ou_overrides: {'economy.food_supply':0.10,'politics.stability':0.08}, trigger_conditions: { abort: 'none', early_trigger: 'none' } },
    ],
  },

  consolidation: {
    strategy: 'consolidation',
    goal: 'Secure existing holdings and build a resilient defensive base',
    phases: [
      { name: 'Fortification', duration: 10, priority_actions: ['build_barracks','build_farm','seek_alliance'],  forbidden_actions: ['mobilize'], ou_overrides: {'military.readiness':0.08,'economy.food_supply':0.08,'politics.stability':0.05}, trigger_conditions: { abort: 'invasion', early_trigger: 'none' } },
      { name: 'Recovery',      duration: 12, priority_actions: ['build_market','build_farm','buy_food'],          forbidden_actions: ['mobilize'], ou_overrides: {'economy.treasury':0.10,'economy.trade_balance':0.08,'politics.happiness':0.05}, trigger_conditions: { abort: 'none', early_trigger: 'surplus' } },
      { name: 'Stability',     duration: 8,  priority_actions: ['seek_alliance','sell_goods','build_market'],     forbidden_actions: ['recruit_cavalry'], ou_overrides: {'diplomacy.reputation':0.08,'politics.legitimacy':0.07}, trigger_conditions: { abort: 'none', early_trigger: 'none' } },
    ],
  },

  economic_strangulation: {
    strategy: 'economic_strangulation',
    goal: 'Dominate trade networks and bankrupt rivals through commercial superiority',
    phases: [
      { name: 'Trade Expansion', duration: 10, priority_actions: ['build_market','build_port','seek_alliance'],     forbidden_actions: ['mobilize'], ou_overrides: {'economy.trade_balance':0.15,'economy.treasury':0.10,'diplomacy.trade_agreements':0.10}, trigger_conditions: { abort: 'trade_blocked', early_trigger: 'monopoly' } },
      { name: 'Monopoly',        duration: 12, priority_actions: ['sell_goods','build_port','seek_alliance'],        forbidden_actions: ['buy_food'], ou_overrides: {'economy.trade_balance':0.12,'diplomacy.reputation':0.08}, trigger_conditions: { abort: 'treasury<0', early_trigger: 'none' } },
      { name: 'Leverage',        duration: 10, priority_actions: ['seek_alliance','sell_goods','recruit_infantry'],  forbidden_actions: ['mobilize'], ou_overrides: {'economy.treasury':0.10,'diplomacy.alliance_count':0.08}, trigger_conditions: { abort: 'none', early_trigger: 'none' } },
    ],
  },

  opportunism: {
    strategy: 'opportunism',
    goal: 'Expand opportunistically by exploiting neighbour weaknesses and crises',
    phases: [
      { name: 'Preparation',  duration: 8,  priority_actions: ['build_farm','recruit_infantry','seek_alliance'], forbidden_actions: ['demobilize'], ou_overrides: {'economy.food_supply':0.08,'military.readiness':0.10}, trigger_conditions: { abort: 'none', early_trigger: 'enemy_crisis' } },
      { name: 'Exploitation', duration: 12, priority_actions: ['mobilize','recruit_cavalry','sell_goods'],        forbidden_actions: ['demobilize'], ou_overrides: {'military.army_size':0.12,'military.morale':0.08}, trigger_conditions: { abort: 'treasury<0', early_trigger: 'victory' } },
      { name: 'Digestion',    duration: 10, priority_actions: ['build_farm','build_market','demobilize'],          forbidden_actions: ['mobilize'], ou_overrides: {'economy.treasury':0.10,'politics.stability':0.08}, trigger_conditions: { abort: 'none', early_trigger: 'none' } },
    ],
  },

  survival: {
    strategy: 'survival',
    goal: 'Survive immediate threats and preserve the nation at any cost',
    phases: [
      { name: 'Emergency',  duration: 6,  priority_actions: ['buy_food','recruit_infantry','seek_alliance'],   forbidden_actions: ['sell_goods','mobilize'], ou_overrides: {'economy.food_supply':0.20,'military.readiness':0.12,'politics.stability':0.05}, trigger_conditions: { abort: 'none', early_trigger: 'crisis_resolved' } },
      { name: 'Endurance',  duration: 14, priority_actions: ['build_farm','seek_alliance','build_barracks'],   forbidden_actions: ['mobilize','sell_goods'], ou_overrides: {'economy.food_supply':0.10,'politics.happiness':0.08,'military.morale':0.05}, trigger_conditions: { abort: 'treasury<-50', early_trigger: 'stability>0.5' } },
      { name: 'Rebuilding', duration: 10, priority_actions: ['build_farm','build_market','sell_goods'],        forbidden_actions: ['recruit_cavalry'], ou_overrides: {'economy.treasury':0.12,'economy.trade_balance':0.08}, trigger_conditions: { abort: 'none', early_trigger: 'none' } },
    ],
  },

};

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
  // Tier-1 check
  const tier = nation.tier ?? nation.ai_tier ?? 99;
  if (tier > STRATEGIC_CONFIG.tier1Threshold) return false;

  // Treasury must be positive
  const ou = nation._ou;
  const treasury = ou
    ? (ou.economy?.find(v => v.name === 'treasury')?.current ?? 0)
    : (nation.economy?.treasury ?? 0);
  if (treasury <= STRATEGIC_CONFIG.minTreasury) return false;

  // No active anomaly
  const lastAnomaly = ou?.lastAnomaly;
  if (lastAnomaly?.isAnomaly) return false;

  // Must have waited planInterval turns since last plan
  const lastPlanTurn = nation._strategic_plan?.createdAt ?? -Infinity;
  if ((currentTurn - lastPlanTurn) < STRATEGIC_CONFIG.planInterval) return false;

  return true;
}

/**
 * Строит компактный промпт для Groq (< 500 токенов).
 * @param {Object} nation
 * @param {Object} ou   — nation._ou
 * @param {Object} gameState
 * @returns {{ system: string, user: string }}
 */
function _buildStrategicPrompt(nation, ou, gameState) {
  // ── Исторический год ──────────────────────────────────────────────────────
  const tick    = ou?.tick ?? 0;
  const rawYear = (gameState?.year) ?? (-300 + Math.round(tick * 0.5));
  const year    = rawYear < 0
    ? `${Math.abs(rawYear)} BC`
    : `${rawYear} AD`;

  // ── Вспомогательные функции ───────────────────────────────────────────────
  const gv = (cat, name) =>
    (ou?.[cat]?.find(v => v.name === name)?.current ?? 0).toFixed(2);

  // ── Ключевые метрики ──────────────────────────────────────────────────────
  const econ = [
    `treasury=${gv('economy','treasury')}`,
    `food=${gv('economy','food_supply')}`,
    `trade=${gv('economy','trade_balance')}`,
    `pop_growth=${gv('economy','population_growth')}`,
  ].join(', ');

  const mil = [
    `army=${gv('military','army_size')}`,
    `morale=${gv('military','morale')}`,
    `readiness=${gv('military','readiness')}`,
  ].join(', ');

  const dip = [
    `reputation=${gv('diplomacy','reputation')}`,
    `alliances=${gv('diplomacy','alliance_count')}`,
  ].join(', ');

  const pol = [
    `stability=${gv('politics','stability')}`,
    `legitimacy=${gv('politics','legitimacy')}`,
    `happiness=${gv('politics','happiness')}`,
  ].join(', ');

  // ── Активные модификаторы (топ-5) ─────────────────────────────────────────
  const mods = (ou?.activeModifiers ?? [])
    .slice(0, 5)
    .map(m => m.name)
    .join(', ') || 'none';

  // ── Текущие цели (топ-3 по current) ──────────────────────────────────────
  const topGoals = [...(ou?.goals ?? [])]
    .sort((a, b) => b.current - a.current)
    .slice(0, 3)
    .map(g => g.name)
    .join(', ') || 'survive';

  // ── Промпт ────────────────────────────────────────────────────────────────
  const system = `You are a strategic advisor for an ancient nation in ${year}. \
Respond ONLY with valid JSON matching the schema.`;

  const user = `Nation: ${nation.name ?? nation.id}
Personality: ${nation.ai_personality ?? 'balanced'} | Priority: ${nation.ai_priority ?? 'survival'}
Year: ${year} | Tier: ${nation.tier ?? '?'}

State:
  Economy: ${econ}
  Military: ${mil}
  Diplomacy: ${dip}
  Politics: ${pol}

Active modifiers: ${mods}
Top goals: ${topGoals}

Create a ${STRATEGIC_CONFIG.planHorizon}-turn strategic plan.
Respond with JSON:
{
  "strategy": "<name>",
  "goal": "<one sentence>",
  "phases": [
    {
      "name": "<phase name>",
      "duration": <turns: number>,
      "priority_actions": ["<action>"],
      "forbidden_actions": ["<action>"],
      "ou_overrides": {"<category>.<varName>": <deltaMu: number>},
      "trigger_conditions": {"abort": "<condition>", "early_trigger": "<condition>"}
    }
  ]
}`;

  return { system, user };
}

/**
 * Создаёт стратегический план (вызов Groq + валидация + fallback).
 * @param {Object} nation
 * @param {Object} ou       — состояние OU из nation._ou
 * @param {Object} gameState
 * @returns {Promise<Object>} plan
 */
async function createPlan(nation, ou, gameState) {
  const { system, user } = _buildStrategicPrompt(nation, ou, gameState);
  let plan = null;

  if (STRATEGIC_CONFIG.enableGroq &&
      typeof CONFIG !== 'undefined' && CONFIG.GROQ_API_KEY) {
    try {
      const raw    = await _callGroqStrategic(system, user);
      const parsed = JSON.parse(raw);
      plan = _validatePlan(parsed, nation, ou);
    } catch (err) {
      console.warn(`[StrategicLLM] Groq failed for ${nation.name ?? nation.id}: ${err.message}`);
    }
  }

  if (!plan) plan = _buildFallbackPlan(nation, ou);

  // Сохраняем план в нацию
  nation._strategic_plan = plan;

  // Логируем в events_log
  const tick = ou?.tick ?? 0;
  const logEntry = {
    tick,
    type:     'strategic_plan',
    nationId: nation.id ?? nation.name,
    strategy: plan.strategy,
    goal:     plan.goal,
    phases:   plan.phases.length,
    fallback: plan.fallback,
  };
  if (Array.isArray(gameState?.events_log)) gameState.events_log.push(logEntry);
  if (typeof events_log !== 'undefined' && Array.isArray(events_log)) {
    events_log.push(logEntry);
  }

  return plan;
}

// ─── ВЫЗОВ GROQ ───────────────────────────────────────────────────────────────

/**
 * Делает запрос к Groq API и возвращает сырой текст ответа.
 * @param {string} system
 * @param {string} user
 * @returns {Promise<string>}
 */
async function _callGroqStrategic(system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STRATEGIC_CONFIG.timeoutMs);
  let response;
  try {
    response = await fetch(CONFIG.GROQ_API_URL, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:      STRATEGIC_CONFIG.groqModel,
        max_tokens: STRATEGIC_CONFIG.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Groq timeout (strategic)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Groq ${response.status}: ${errText.slice(0, 120)}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq: empty response');
  return text;
}

// ─── ВАЛИДАЦИЯ ПЛАНА ──────────────────────────────────────────────────────────

/**
 * Валидирует и нормализует JSON-план от Groq.
 * @param {Object} parsed
 * @param {Object} nation
 * @param {Object} ou
 * @returns {Object} валидный план
 */
function _validatePlan(parsed, nation, ou) {
  if (!parsed || typeof parsed !== 'object')       throw new Error('plan: not object');
  if (!parsed.strategy || !parsed.goal)            throw new Error('plan: missing strategy/goal');
  if (!Array.isArray(parsed.phases) || !parsed.phases.length) throw new Error('plan: no phases');

  const plan       = _emptyPlan();
  plan.createdAt   = ou?.tick ?? 0;
  plan.horizon     = STRATEGIC_CONFIG.planHorizon;
  plan.strategy    = String(parsed.strategy).slice(0, 64);
  plan.goal        = String(parsed.goal).slice(0, 256);
  plan.fallback    = false;

  plan.phases = parsed.phases.slice(0, 5).map(p => ({
    name:               String(p.name ?? 'phase').slice(0, 32),
    duration:           Math.min(Math.max(Number(p.duration) || 10, 1), 40),
    priority_actions:   Array.isArray(p.priority_actions)  ? p.priority_actions.slice(0, 5)  : [],
    forbidden_actions:  Array.isArray(p.forbidden_actions) ? p.forbidden_actions.slice(0, 5) : [],
    ou_overrides:       (p.ou_overrides  && typeof p.ou_overrides  === 'object') ? p.ou_overrides  : {},
    trigger_conditions: (p.trigger_conditions && typeof p.trigger_conditions === 'object') ? p.trigger_conditions : {},
  }));

  return plan;
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ВЫПОЛНЕНИЯ ПЛАНА ────────────────────────────────

/**
 * Проверяет строковое условие триггера по метрикам нации.
 * @param {string} condition  — напр. 'treasury<0', 'army_size>0.85', 'none'
 * @param {Object} ou
 * @returns {boolean}
 */
function _evalTrigger(condition, ou) {
  if (!condition || condition === 'none') return false;
  // Распознаём паттерн "var op number"
  const m = condition.match(/^([\w.]+)\s*([<>]=?)\s*([\d.-]+)$/);
  if (!m) return false;
  const [, varPath, op, numStr] = m;
  const num = parseFloat(numStr);
  // Ищем переменную в OU-категориях
  const parts  = varPath.split('.');
  const varName = parts.length > 1 ? parts[1] : parts[0];
  const cat     = parts.length > 1 ? parts[0] : null;
  let val = null;
  const cats = cat ? [cat] : ['economy','military','diplomacy','politics','goals'];
  for (const c of cats) {
    const found = ou?.[c]?.find(v => v.name === varName);
    if (found) { val = found.current; break; }
  }
  if (val === null) return false;
  if (op === '<')  return val <  num;
  if (op === '<=') return val <= num;
  if (op === '>')  return val >  num;
  if (op === '>=') return val >= num;
  return false;
}

/**
 * Применяет ou_overrides фазы: сдвигает mu переменных OU-вектора.
 * @param {Object} ou
 * @param {Object} overrides — {"category.varName": deltaMu}
 */
function _applyOuOverrides(ou, overrides) {
  if (!overrides || !ou) return;
  for (const [key, delta] of Object.entries(overrides)) {
    const parts = key.split('.');
    if (parts.length < 2) continue;
    const [cat, varName] = parts;
    const v = ou[cat]?.find(v => v.name === varName);
    if (v) v.mu = Math.max(v.min ?? -Infinity, Math.min(v.max ?? Infinity, v.mu + delta));
  }
}

/**
 * Применяет текущую фазу стратегического плана к OU-состоянию.
 * @param {Object} nation
 * @param {Object} ou
 * @param {number} currentTurn
 * @returns {Object|null} activePhase или null
 */
function executePlan(nation, ou, currentTurn) {
  const plan = nation._strategic_plan;
  if (!plan || !Array.isArray(plan.phases) || plan.phases.length === 0) return null;

  // Инициализация отслеживания фазы
  if (plan.phaseStartTurn == null) plan.phaseStartTurn = currentTurn;
  if (plan.currentPhase   == null) plan.currentPhase   = 0;

  const phaseIdx = plan.currentPhase;
  if (phaseIdx >= plan.phases.length) return null;

  const phase    = plan.phases[phaseIdx];
  const tc       = phase.trigger_conditions ?? {};
  const elapsed  = currentTurn - plan.phaseStartTurn;

  // Проверка abort-триггера
  if (_evalTrigger(tc.abort, ou)) {
    plan.currentPhase = plan.phases.length; // завершить план досрочно
    ou.priority_actions   = [];
    ou.forbidden_actions  = [];
    return null;
  }

  // Переход к следующей фазе: по длительности или early_trigger
  const earlyTrigger = _evalTrigger(tc.early_trigger, ou);
  if (elapsed >= phase.duration || earlyTrigger) {
    plan.currentPhase++;
    plan.phaseStartTurn = currentTurn;
    if (plan.currentPhase >= plan.phases.length) {
      ou.priority_actions  = [];
      ou.forbidden_actions = [];
      return null;
    }
    return executePlan(nation, ou, currentTurn); // рекурсия на новую фазу
  }

  // Применяем ou_overrides (сдвиг mu)
  _applyOuOverrides(ou, phase.ou_overrides);

  // Передаём priority/forbidden_actions в ou для decideActions
  ou.priority_actions  = phase.priority_actions  ?? [];
  ou.forbidden_actions = phase.forbidden_actions ?? [];

  return phase;
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
 * 6 шаблонов: aggressive→military_buildup, defensive→consolidation,
 *             merchant→economic_strangulation, expansionist→opportunism,
 *             survival→survival, default→consolidation
 * @param {Object} nation
 * @param {Object} ou
 * @returns {Object} plan
 */
function _buildFallbackPlan(nation, ou) {
  const personality = nation.ai_personality ?? '';
  const PERSONALITY_MAP = {
    aggressive:    'military_buildup',
    defensive:     'consolidation',
    merchant:      'economic_strangulation',
    expansionist:  'opportunism',
    expansion:     'opportunism',
    survival:      'survival',
  };

  const templateKey = PERSONALITY_MAP[personality] ?? 'consolidation';
  const template    = STRATEGY_TEMPLATES[templateKey];

  const plan        = _emptyPlan();
  plan.createdAt    = ou?.tick ?? nation._ou?.tick ?? 0;
  plan.horizon      = STRATEGIC_CONFIG.planHorizon;
  plan.strategy     = template.strategy;
  plan.goal         = template.goal;
  plan.fallback     = true;

  // Deep-copy phases so mutations don't affect the template
  plan.phases = template.phases.map(p => ({
    name:               p.name,
    duration:           p.duration,
    priority_actions:   [...p.priority_actions],
    forbidden_actions:  [...p.forbidden_actions],
    ou_overrides:       { ...p.ou_overrides },
    trigger_conditions: { ...p.trigger_conditions },
  }));

  return plan;
}

// ─── ЭКСПОРТ ──────────────────────────────────────────────────────────────────

export { shouldPlan, createPlan, executePlan, _broadcastCoalitionPlan,
         _buildFallbackPlan, _buildStrategicPrompt, _validatePlan,
         STRATEGIC_CONFIG, STRATEGY_TEMPLATES };

if (typeof window !== 'undefined') {
  window.StrategicLLM = { shouldPlan, createPlan, executePlan,
                           _buildFallbackPlan, _buildStrategicPrompt,
                           STRATEGIC_CONFIG };
}
