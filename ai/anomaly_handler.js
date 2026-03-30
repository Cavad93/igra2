/**
 * anomaly_handler.js — Обработчик аномалий Super-OU через Groq
 *
 * Когда calculateAnomalyScore() возвращает isAnomaly=true,
 * этот модуль вызывает Groq LLM для интерпретации и коррекции.
 *
 * Архитектура:
 *   1. handleAnomaly(nation, ouState, anomalyResult) — главная точка входа
 *   2. _buildAnomalyPrompt()  — формирует промпт в исторический контекст
 *   3. _callGroqAnomaly()     — вызов Groq API
 *   4. _applyCorrection()     — применяет коррекцию к OU-переменным
 *   5. _throttleCheck()       — не более 1 вызова на нацию в 5 тиков
 */

// ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────────

const ANOMALY_CONFIG = {
  groqModel:        'llama-3.3-70b-versatile',
  maxTokens:        512,
  timeoutMs:        20_000,
  cooldownTicks:    5,      // пауза между вызовами на нацию
  maxCorrections:   3,      // максимум переменных для коррекции за раз
  correctionStrength: 0.3,  // сила сдвига mu к нормальному диапазону [0,1]
  enableGroq:       true,   // false → только локальная коррекция без LLM
};

// ─── СОСТОЯНИЕ ────────────────────────────────────────────────────────────────

// Хранит тик последнего вызова per naton: { nationId: tickNumber }
const _lastCallTick = {};

// Кэш последних ответов LLM (для дебага)
const _responseCache = [];
const CACHE_SIZE = 20;

// ─── ГЛАВНАЯ ФУНКЦИЯ ─────────────────────────────────────────────────────────

/**
 * Обработать аномалию нации.
 * @param {object} nation        — объект нации с nation._ou
 * @param {object} ouState       — nation._ou (ссылка)
 * @param {object} anomalyResult — результат calculateAnomalyScore()
 * @returns {Promise<object>}    — { corrected, groqResponse, actions }
 */
async function handleAnomaly(nation, ouState, anomalyResult) {
  if (!anomalyResult || !anomalyResult.isAnomaly) {
    return { corrected: false, reason: 'no_anomaly' };
  }

  const nationId = nation.id || nation.name || 'unknown';

  // Throttle: не чаще чем раз в cooldownTicks
  const currentTick = ouState.tick || 0;
  if (!_throttleCheck(nationId, currentTick)) {
    // Применяем только локальную коррекцию без LLM
    const localResult = _applyLocalCorrection(nation, ouState, anomalyResult);
    return { corrected: true, method: 'local', ...localResult };
  }

  _lastCallTick[nationId] = currentTick;

  // Строим промпт
  const { system, user } = _buildAnomalyPrompt(nation, ouState, anomalyResult);

  let groqText = null;
  let groqActions = [];

  if (ANOMALY_CONFIG.enableGroq && typeof CONFIG !== 'undefined' && CONFIG.GROQ_API_KEY) {
    try {
      groqText = await _callGroqAnomaly(system, user);
      groqActions = _parseGroqResponse(groqText);
    } catch (err) {
      console.warn(`[AnomalyHandler] Groq недоступен для ${nationId}:`, err.message);
      // Graceful degradation — продолжаем с локальной коррекцией
    }
  }

  // Применяем коррекцию (Groq или локальную)
  const correction = _applyCorrection(nation, ouState, anomalyResult, groqActions);

  // Сохраняем в кэш для дебага
  _cacheResponse(nationId, currentTick, anomalyResult.total, groqText, correction);

  return {
    corrected:    true,
    method:       groqText ? 'groq' : 'local',
    nationId,
    tick:         currentTick,
    anomalyScore: anomalyResult.total,
    groqResponse: groqText,
    groqActions,
    correction,
  };
}

// ─── THROTTLE ─────────────────────────────────────────────────────────────────

function _throttleCheck(nationId, currentTick) {
  const last = _lastCallTick[nationId];
  if (last === undefined) return true;
  return (currentTick - last) >= ANOMALY_CONFIG.cooldownTicks;
}

// ─── ПРОМПТ ───────────────────────────────────────────────────────────────────

/**
 * Построить исторически контекстуализированный промпт для Groq.
 */
function _buildAnomalyPrompt(nation, ouState, anomalyResult) {
  const nationName = nation.name || nation.id || 'Неизвестная держава';
  const cats = anomalyResult.categories || {};
  const tick = ouState.tick || 0;

  // Исторический год (игра начинается с 300 до н.э., 12 тиков = год)
  const yearOffset = Math.floor(tick / 12);
  const absYear   = 300 - yearOffset;
  const yearLabel = absYear >= 0 ? `${absYear} н.э.` : `${Math.abs(absYear)} до н.э.`;

  // Топ переменных с выбросами
  const outlierVars = _getTopOutliers(ouState, 5);
  const conflictPairs = _getConflictPairs(ouState, 3);

  const system = `Ты — советник в стратегической игре об античном мире (300 до н.э. — 476 н.э.).
Анализируй аномалии в состоянии государства и давай краткие, исторически правдоподобные рекомендации.
Отвечай ТОЛЬКО JSON без пояснений вне блока.`;

  const user = `Государство: ${nationName}
Год: ${yearLabel} (тик ${tick})
Аномальный счёт: ${(anomalyResult.total * 100).toFixed(1)}%

Категории аномалий:
${_formatCategories(cats)}

Топ переменных с выбросами:
${outlierVars.map(v => `  - ${v.name}: текущее=${v.current.toFixed(2)}, норма=${v.mu.toFixed(2)}, σ=${v.sigma}`).join('\n') || '  (нет)'}

Конфликтующие значения:
${conflictPairs.map(p => `  - ${p.a} высокое И ${p.b} высокое одновременно`).join('\n') || '  (нет)'}

Верни JSON строго в формате:
{
  "diagnosis": "краткое описание аномалии (1 предложение)",
  "historical_event": "возможное историческое объяснение (1 предложение)",
  "corrections": [
    { "variable": "имя_переменной", "action": "increase|decrease|reset", "strength": 0.3 }
  ],
  "priority_action": "одно из: stabilize_economy|military_reform|diplomatic_reset|political_purge|none"
}
Максимум ${ANOMALY_CONFIG.maxCorrections} коррекций.`;

  return { system, user };
}

function _formatCategories(cats) {
  const lines = [];
  if (cats.outliers    > 0) lines.push(`  - Выбросы: ${cats.outliers} переменных`);
  if (cats.rapid_change > 0) lines.push(`  - Резкие изменения: ${cats.rapid_change}`);
  if (cats.conflicts   > 0) lines.push(`  - Конфликты значений: ${cats.conflicts} пар`);
  if (cats.boundaries  > 0) lines.push(`  - Застрявшие на границах: ${cats.boundaries}`);
  if (cats.consistency > 0) lines.push(`  - Нарушения согласованности: ${cats.consistency}`);
  if (cats.goal_alignment > 0) lines.push(`  - Расхождение целей: ${cats.goal_alignment}`);
  if (cats.modifier_saturation > 0) lines.push(`  - Перегрузка модификаторов`);
  return lines.join('\n') || '  (нет подробностей)';
}

// ─── ВЫЗОВ GROQ ───────────────────────────────────────────────────────────────

async function _callGroqAnomaly(system, user) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), ANOMALY_CONFIG.timeoutMs);

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
        model:      ANOMALY_CONFIG.groqModel,
        max_tokens: ANOMALY_CONFIG.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Groq timeout (anomaly)');
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
  if (!text) throw new Error('Пустой ответ Groq (anomaly)');
  return text;
}

// ─── ПАРСИНГ ОТВЕТА GROQ ─────────────────────────────────────────────────────

function _parseGroqResponse(text) {
  try {
    // Извлекаем JSON из возможного markdown
    let s = text || '';
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1];
    const obj = JSON.parse(s.trim());

    const corrections = Array.isArray(obj.corrections) ? obj.corrections : [];
    return corrections
      .filter(c => c && typeof c.variable === 'string' && typeof c.action === 'string')
      .slice(0, ANOMALY_CONFIG.maxCorrections)
      .map(c => ({
        variable: c.variable,
        action:   c.action,
        strength: Math.min(1, Math.max(0, Number(c.strength) || ANOMALY_CONFIG.correctionStrength)),
        priority_action: obj.priority_action || 'none',
        diagnosis: obj.diagnosis || '',
      }));
  } catch (_) {
    return [];
  }
}

// ─── ПРИМЕНЕНИЕ КОРРЕКЦИИ ─────────────────────────────────────────────────────

/**
 * Применить коррекции от Groq к OU-переменным (сдвиг mu).
 */
function _applyCorrection(nation, ouState, anomalyResult, groqActions) {
  const applied = [];

  if (groqActions && groqActions.length > 0) {
    // Groq-направленная коррекция
    const allVars = _getAllVars(ouState);
    for (const action of groqActions) {
      const variable = allVars.find(v => v.name === action.variable);
      if (!variable) continue;

      const shift = (action.action === 'increase') ?  action.strength * (variable.max - variable.mu)
                  : (action.action === 'decrease') ? -action.strength * (variable.mu - variable.min)
                  : (variable.mu - variable.current) * action.strength; // reset → move toward mu

      variable.current = Math.max(variable.min, Math.min(variable.max, variable.current + shift));
      applied.push({ variable: action.variable, shift: +shift.toFixed(4), action: action.action });
    }
  } else {
    // Локальная авто-коррекция: сдвигаем выбросы к mu
    applied.push(..._applyLocalCorrection(nation, ouState, anomalyResult).applied);
  }

  return applied;
}

/**
 * Локальная коррекция (без LLM): сдвигаем топ-N выбросов обратно к mu.
 */
function _applyLocalCorrection(nation, ouState, anomalyResult) {
  const outliers = _getTopOutliers(ouState, ANOMALY_CONFIG.maxCorrections);
  const applied  = [];
  const strength = ANOMALY_CONFIG.correctionStrength;

  for (const v of outliers) {
    const delta = (v.mu - v.current) * strength;
    v.current   = Math.max(v.min, Math.min(v.max, v.current + delta));
    applied.push({ variable: v.name, shift: +delta.toFixed(4), action: 'local_reset' });
  }

  return { applied };
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ─────────────────────────────────────────────────

function _getAllVars(ouState) {
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  const result = [];
  for (const cat of cats) {
    if (Array.isArray(ouState[cat])) result.push(...ouState[cat]);
  }
  return result;
}

/**
 * Вернуть топ-N переменных с наибольшим отклонением от mu (в единицах sigma).
 */
function _getTopOutliers(ouState, n) {
  return _getAllVars(ouState)
    .map(v => ({ ...v, zscore: v.sigma > 0 ? Math.abs(v.current - v.mu) / v.sigma : 0 }))
    .sort((a, b) => b.zscore - a.zscore)
    .slice(0, n);
}

/**
 * Вернуть топ-N конфликтующих пар (обе переменные > 0.75 max).
 */
function _getConflictPairs(ouState, n) {
  // Известные конфликтные пары из calculateAnomalyScore
  const CONFLICT_PAIRS = [
    ['war_readiness', 'trade_openness'],
    ['isolationism', 'alliance_strength'],
    ['debt_level', 'military_spending'],
    ['civil_war_risk', 'regime_stability'],
  ];

  const allVars = _getAllVars(ouState);
  const getVal  = name => {
    const v = allVars.find(x => x.name === name);
    return v ? (v.current / (v.max || 1)) : 0;
  };

  return CONFLICT_PAIRS
    .filter(([a, b]) => getVal(a) > 0.75 && getVal(b) > 0.75)
    .slice(0, n)
    .map(([a, b]) => ({ a, b }));
}

function _cacheResponse(nationId, tick, score, groqText, correction) {
  _responseCache.push({ nationId, tick, score, groqText, correction, ts: Date.now() });
  if (_responseCache.length > CACHE_SIZE) _responseCache.shift();
}

// ─── ПУБЛИЧНЫЙ API ────────────────────────────────────────────────────────────

/**
 * Вернуть последние N ответов из кэша (для дебага).
 */
function getAnomalyLog(n = 10) {
  return _responseCache.slice(-n);
}

/**
 * Сбросить throttle для нации (для тестов).
 */
function resetThrottle(nationId) {
  delete _lastCallTick[nationId];
}

// ─── ЭКСПОРТ ──────────────────────────────────────────────────────────────────

export { handleAnomaly, getAnomalyLog, resetThrottle, ANOMALY_CONFIG };

// Браузерный доступ для non-module скриптов
if (typeof window !== 'undefined') {
  window.AnomalyHandler = { handleAnomaly, getAnomalyLog, resetThrottle, ANOMALY_CONFIG };
}
