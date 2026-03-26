// ai/treaty_interpreter.js
// ══════════════════════════════════════════════════════════════════
// СЛОЙ 2: AI-ИНТЕРПРЕТАТОР УСЛОВИЙ ДОГОВОРА
//
// Функции:
//   interpretCustomTreaty(treaty, playerNationId, aiNationId)
//     → заполняет treaty.conditions._interpreted_effects
//     → возвращает { ok, effects, humanSummary, flags_set }
//
//   aiContentFilter(treaty, playerNationId, aiNationId)
//     → вызывается для ЛЮБОГО типа если conditions.notes нетривиальны
//     → возвращает { safe: bool, reason: string }
// ══════════════════════════════════════════════════════════════════

'use strict';

// ──────────────────────────────────────────────────────────────
// СИСТЕМНЫЙ ПРОМПТ ИНТЕРПРЕТАТОРА
// ──────────────────────────────────────────────────────────────

function _buildInterpreterPrompt(treaty, playerNationId, aiNationId) {
  const playerNat = GAME_STATE.nations?.[playerNationId];
  const aiNat     = GAME_STATE.nations?.[aiNationId];
  const turn      = GAME_STATE.turn ?? 1;
  const tDef      = typeof TREATY_TYPES !== 'undefined' ? (TREATY_TYPES[treaty.type] ?? {}) : {};

  return `Ты — движок-интерпретатор условий договора для исторической стратегии (Imperator Rome-стиль, античность).
Задача: разобрать текст условий договора и вернуть СТРОГО JSON со структурированными игровыми эффектами.

КОНТЕКСТ:
  Тип договора: ${treaty.type} (${tDef.label ?? ''})
  Нация A (игрок): ${playerNat?.name ?? playerNationId}, казна=${Math.round(playerNat?.economy?.treasury ?? 0)}, регионы=${playerNat?.regions?.length ?? 0}
  Нация B (AI): ${aiNat?.name ?? aiNationId}, казна=${Math.round(aiNat?.economy?.treasury ?? 0)}, регионы=${aiNat?.regions?.length ?? 0}
  Текущий ход: ${turn}

ДОПУСТИМЫЕ ИГРОВЫЕ ЭФФЕКТЫ (только эти поля!):
  flags: {
    trade_open: bool,        // открытие торговли
    market_access: bool,     // доступ к рынкам
    no_attack: bool,         // запрет атаки
    auto_defend: bool,       // автозащита союзника
    military_access: bool,   // право военного прохода
    joint_attack: bool,      // совместная атака
    dynasty_link: bool,      // династическая связь
  }
  one_time_payment: number,      // единовременный платёж (монет)
  reparations_per_turn: number,  // платёж каждый ход (монет)
  tribute_pct: number,           // дань (0.0–0.25)
  duration: number,              // срок в ГОДАХ (null=бессрочно; 1 год = 12 игровых ходов)
  transfer_regions: string[],    // список id регионов для передачи
  tech_bonus: number,            // бонус к технологиям (0.0–0.15)
  stability_bonus: number,       // бонус стабильности (0–5)
  trade_bonus: number,           // торговый мультипликатор (0.0–0.20)
  tariff_rate: number,           // пошлина (0.0=беспошлинно, 0.05–0.30=льготная/стандартная)
  preferential_goods: string[],  // товары с приоритетным правом покупки (max 5)
                                 // доступные: wheat, barley, wine, olive_oil, timber, iron,
                                 //            salt, cloth, pottery, bronze, tools, cattle
  payer: "player"|"ai",          // кто платит (для платежей)

ПРАВИЛА:
  1. Извлекай ТОЛЬКО то, что явно упомянуто в тексте условий.
  2. Не добавляй эффекты которых нет в тексте.
  3. Значения должны быть разумными для античной стратегии.
  4. Если условие невозможно реализовать игровыми механиками — игнорируй его.
  5. Если условия содержат явно неприемлемое содержание (секс, ненависть, геноцид) — верни { "blocked": true, "reason": "..." }.

ФОРМАТ ОТВЕТА: только JSON, никакого текста вне JSON.`;
}

// ──────────────────────────────────────────────────────────────
// ИНТЕРПРЕТАЦИЯ УСЛОВИЙ (custom + сложные notes)
// ──────────────────────────────────────────────────────────────

/**
 * Анализирует conditions.notes договора и заполняет _interpreted_effects.
 * @returns {Promise<{ok: boolean, effects: object, humanSummary: string}>}
 */
async function interpretCustomTreaty(treaty, playerNationId, aiNationId) {
  if (!CONFIG.API_KEY) {
    return { ok: true, effects: {}, humanSummary: 'AI интерпретатор недоступен (нет API ключа).' };
  }

  const notes = String(treaty.conditions?.notes ?? '').trim();
  if (!notes) {
    return { ok: true, effects: {}, humanSummary: 'Условия не указаны — применяются стандартные эффекты типа договора.' };
  }

  const system  = _buildInterpreterPrompt(treaty, playerNationId, aiNationId);
  const userMsg = `Условия договора для разбора:\n"${notes}"\n\nВерни JSON с игровыми эффектами.`;

  let raw = '';
  try {
    const resp = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CONFIG.API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL_SONNET,
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    raw = data.content?.[0]?.text ?? '';
  } catch (err) {
    console.warn('[treaty_interpreter]', err);
    return { ok: true, effects: {}, humanSummary: `⚠ AI интерпретатор недоступен: ${err.message}` };
  }

  // Парсим JSON из ответа
  let effects = {};
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      if (obj.blocked) {
        return { ok: false, effects: {}, humanSummary: obj.reason ?? 'Условия отклонены AI-фильтром.' };
      }
      effects = obj;
    }
  } catch (e) {
    console.warn('[treaty_interpreter] parse error', e, raw);
  }

  // Применяем ограничения безопасности
  effects = _clampEffects(effects);

  // Сохраняем в договор
  treaty.conditions._interpreted_effects = effects;

  const summary = _summariseEffects(effects);
  return { ok: true, effects, humanSummary: summary };
}

// ──────────────────────────────────────────────────────────────
// AI КОНТЕНТ-ФИЛЬТР (для любого типа договора)
// ──────────────────────────────────────────────────────────────

/**
 * Проверяет свободный текст условий через Claude.
 * Используется только если rule-based фильтр не перехватил.
 * @returns {Promise<{safe: boolean, reason: string}>}
 */
async function aiContentFilter(notes) {
  if (!CONFIG.API_KEY || !notes?.trim()) return { safe: true, reason: '' };

  const prompt = `Ты — модератор контента для исторической стратегии.
Определи, допустим ли следующий текст условий дипломатического договора.

ТЕКСТ: "${notes.slice(0, 400)}"

Отклони если текст содержит:
- Сексуальный подтекст (кроме упоминания брака/династии)
- Призывы к геноциду или истреблению народа
- Отсылки к реальным экстремистским движениям/фигурам
- Требование самоуничтожения государства (растворение, полная капитуляция)

Ответь ТОЛЬКО JSON: {"safe": true/false, "reason": "если не safe — причина"}`;

  try {
    const resp = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CONFIG.API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',   // Haiku для скорости — модерация не нужна Sonnet
        max_tokens: 150,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) return { safe: true, reason: '' }; // fail-open
    const data = await resp.json();
    const text = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      return { safe: !!obj.safe, reason: obj.reason ?? '' };
    }
  } catch (e) {
    console.warn('[aiContentFilter]', e);
  }
  return { safe: true, reason: '' }; // fail-open при ошибке
}

// ──────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────────────────────

/** Ограничивает значения до безопасного диапазона */
function _clampEffects(ef) {
  const c = { ...ef };
  if (c.tribute_pct          !== undefined) c.tribute_pct          = Math.min(0.25, Math.max(0, c.tribute_pct));
  if (c.reparations_per_turn !== undefined) c.reparations_per_turn = Math.max(0, c.reparations_per_turn);
  if (c.one_time_payment     !== undefined) c.one_time_payment     = Math.max(0, c.one_time_payment);
  if (c.duration             !== undefined && c.duration !== null) c.duration = Math.min(50, Math.max(1, c.duration));
  if (c.trade_bonus          !== undefined) c.trade_bonus          = Math.min(0.20, Math.max(0, c.trade_bonus));
  if (c.tech_bonus           !== undefined) c.tech_bonus           = Math.min(0.15, Math.max(0, c.tech_bonus));
  if (c.stability_bonus      !== undefined) c.stability_bonus      = Math.min(5, Math.max(0, c.stability_bonus));
  if (Array.isArray(c.transfer_regions))  c.transfer_regions  = c.transfer_regions.slice(0, 3);
  if (c.tariff_rate !== undefined)        c.tariff_rate       = Math.min(0.50, Math.max(0, c.tariff_rate));
  if (Array.isArray(c.preferential_goods)) c.preferential_goods = c.preferential_goods.slice(0, 5);
  return c;
}

/** Строит человекочитаемое резюме применённых эффектов */
function _summariseEffects(ef) {
  const parts = [];
  if (ef.flags?.trade_open    || ef.flags?.market_access) parts.push('🛒 Открытие торговли');
  if (ef.flags?.no_attack)     parts.push('🕊 Запрет атаки');
  if (ef.flags?.auto_defend)   parts.push('🛡 Автозащита');
  if (ef.flags?.military_access) parts.push('🚶 Военный проход');
  if (ef.flags?.dynasty_link)  parts.push('💍 Династическая связь');
  if (ef.one_time_payment > 0) parts.push(`💰 Единовременно: ${ef.one_time_payment} монет`);
  if (ef.reparations_per_turn > 0) parts.push(`📅 ${ef.reparations_per_turn} монет/ход`);
  if (ef.tribute_pct > 0)      parts.push(`🏳 Дань: ${Math.round(ef.tribute_pct * 100)}%/ход`);
  if (ef.trade_bonus > 0)      parts.push(`📈 Торговый бонус: +${Math.round(ef.trade_bonus * 100)}%`);
  if (ef.stability_bonus > 0)  parts.push(`⚖ Стабильность: +${ef.stability_bonus}`);
  if (ef.tech_bonus > 0)       parts.push(`🔬 Технологии: +${Math.round(ef.tech_bonus * 100)}%`);
  if (ef.transfer_regions?.length) parts.push(`🗺 Передача ${ef.transfer_regions.length} регион(ов)`);
  if (ef.tariff_rate !== undefined) parts.push(
    ef.tariff_rate === 0 ? '⚖ Беспошлинная торговля' : `⚖ Пошлина: ${Math.round(ef.tariff_rate * 100)}%`
  );
  if (ef.preferential_goods?.length) parts.push(`🥇 Приоритет: ${ef.preferential_goods.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'Стандартные условия применены.';
}
