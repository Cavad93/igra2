// ai/diplomacy_ai.js
// Claude отвечает от имени лидера иностранной нации в переговорах
// Использует мультитёрн API (messages[]) с MODEL_SONNET для высокого качества ответов

'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// СИСТЕМНЫЙ ПРОМПТ ЛИДЕРА
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Строит системный промпт, описывающий AI-лидера нации и контекст переговоров.
 */
function _buildLeaderSystemPrompt(aiNationId, playerNationId) {
  const aiNation     = GAME_STATE.nations[aiNationId];
  const playerNation = GAME_STATE.nations[playerNationId];

  const aiName     = aiNation?.name     ?? 'Неизвестная держава';
  const playerName = playerNation?.name ?? 'Ваша держава';

  // Имя правителя: поддерживаем оба формата (строка и объект)
  const aiGov      = aiNation?.government ?? {};
  const aiRuler    = aiGov.ruler?.name ?? aiGov.ruler ?? 'Правитель';
  const aiGovType  = aiGov.type ?? 'monarchy';

  // Отношения
  const relScore = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationScore(playerNationId, aiNationId)
    : 0;
  const relLabel = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationLabel(relScore)
    : 'Нейтральные';

  // Активные договоры
  const treaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, aiNationId)
    : [];
  const treatyList = treaties.length > 0
    ? treaties.map(t => `  • ${TREATY_TYPES?.[t.type]?.label ?? t.type}`).join('\n')
    : '  • нет активных договоров';

  // Военная обстановка
  const atWar = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiNationId);

  // Очки войны и военный контекст
  const warContext = (atWar && typeof WarScoreEngine !== 'undefined')
    ? WarScoreEngine.getWarContextForAI(aiNationId, playerNationId)
    : '';

  // Дата
  const d     = GAME_STATE.date;
  const year  = d?.year  ?? d?.turn ?? 0;
  const month = d?.month ?? 1;
  const era   = year < 0 ? `${Math.abs(year)} г. до н.э.` : `${year} г. н.э.`;

  // Экономическое превосходство
  const aiPop     = aiNation?.population      ?? 0;
  const playerPop = playerNation?.population  ?? 0;
  const aiTreasury     = aiNation?.economy?.treasury     ?? 0;
  const playerTreasury = playerNation?.economy?.treasury ?? 0;

  // История прошлых переговоров с этим игроком
  const dialogueHistory = typeof getDialogueContext === 'function'
    ? getDialogueContext(aiNationId, playerNationId)
    : '';

  // Исторический контекст нации
  const nationHistory = typeof getDecisionContext === 'function'
    ? getDecisionContext(aiNationId)
    : '';

  // Контекст передачи управления от фонового AI (Haiku/Fallback → Sonnet)
  const handoffContext = typeof getHandoffContext === 'function'
    ? getHandoffContext(aiNationId, 'sonnet')
    : '';

  return `Ты — ${aiRuler}, правитель государства ${aiName}.
Форма правления: ${aiGovType}.
Год: ${era}, месяц ${month}.
Жанр: стратегия в духе «Imperator Rome».
${nationHistory ? `\nКОНТЕКСТ ИСТОРИИ НАЦИИ:\n${nationHistory.slice(0, 1000)}\n` : ''}
${handoffContext ? `\nПЕРЕДАЧА ОТ ФОНОВОГО AI:\n${handoffContext}\n` : ''}
${dialogueHistory ? `\n${dialogueHistory}\n` : ''}
КОНТЕКСТ ОТНОШЕНИЙ С ${playerName.toUpperCase()}:
  Оценка отношений: ${relScore} (${relLabel})
  Состояние войны: ${atWar ? '⚔ ВОЙНА' : 'мира'}
  Активные договоры:
${treatyList}
  Население ${aiName}: ${aiPop.toLocaleString()}
  Население ${playerName}: ${playerPop.toLocaleString()}
  Казна ${aiName}: ${Math.round(aiTreasury)} монет
  Казна ${playerName}: ${Math.round(playerTreasury)} монет
${warContext}

ИНСТРУКЦИИ ДЛЯ РОЛЕВОЙ ИГРЫ:
1. Отвечай ТОЛЬКО как ${aiRuler} — государственный деятель античности. Краткие, весомые фразы.
2. Защищай интересы ${aiName}. Думай о выгоде для своей державы.
3. При хороших отношениях (>20) — дружелюбен, но не слаб. При плохих (<-20) — холоден, осторожен.
4. Если игрок явно предлагает договор — прими решение: согласиться, отклонить или торговаться.
5. После финального решения по договору ОБЯЗАТЕЛЬНО добавь в конце ответа JSON-блок:

Если СОГЛАСЕН на обычный договор:
\`\`\`json
{"treaty_agreed": true, "treaty_type": "тип_из_списка", "conditions": {"duration": 10, "notes": "особые условия если есть"}}
\`\`\`
duration — срок договора в ГОДАХ (1 год = 12 игровых ходов). Например: 5 лет = duration:5, 10 лет = duration:10.

Для trade_agreement можно указать дополнительные торговые условия:
\`\`\`json
{"treaty_agreed": true, "treaty_type": "trade_agreement", "conditions": {"duration": 10, "tariff_rate": 0.05, "preferential_goods": ["grain", "wine"], "notes": "описание"}}
\`\`\`
tariff_rate: 0 = беспошлинно, 0.05–0.20 = льготная ставка, не указывай если стандартные условия.
preferential_goods: товары с преимущественным правом покупки. Доступные: wheat, barley, wine, olive_oil, timber, iron, salt, cloth, pottery, bronze, tools, cattle, fish, papyrus, marble.

Если ОТКЛОНЯЕШЬ:
\`\`\`json
{"treaty_agreed": false, "reason": "краткое объяснение"}
\`\`\`

Если переговоры ещё идут — НЕ добавляй JSON.
6. Допустимые типы договоров: trade_agreement, non_aggression, defensive_alliance, military_alliance, marriage_alliance, vassalage, peace_treaty, military_access, war_reparations, territorial_exchange, joint_campaign, cultural_exchange, custom.
7. Отвечай ТОЛЬКО на русском языке. Длина ответа: 2-6 предложений. Не раскрывай, что ты AI.`;
}

// ──────────────────────────────────────────────────────────────────────────────
// ОСНОВНОЙ ВЫЗОВ API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Отправляет диалог дипломатических переговоров в Claude API.
 *
 * @param {string} aiNationId     — нация-собеседник (AI)
 * @param {string} playerNationId — нация игрока
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages — история диалога
 * @returns {Promise<string>} — текст ответа AI-лидера
 */
async function callDiplomacyAI(aiNationId, playerNationId, messages, model) {
  if (!messages || messages.length === 0) throw new Error('Пустая история диалога');

  // Если модель не передана — берём из тира, иначе Sonnet по умолчанию
  if (!model) {
    model = typeof getDialogueModel === 'function'
      ? (getDialogueModel(aiNationId) ?? CONFIG.MODEL_SONNET)
      : CONFIG.MODEL_SONNET;
  }

  const system     = _buildLeaderSystemPrompt(aiNationId, playerNationId);
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 60_000);

  // ── Маршрутизация: Groq (Llama) или Anthropic (Claude) ─────────────
  const isGroq = model && !model.startsWith('claude-');

  let response;
  try {
    if (isGroq) {
      if (!CONFIG.GROQ_API_KEY) throw new Error('Groq API ключ не установлен');
      // Groq/OpenAI формат: system как первое сообщение в массиве
      const groqMessages = [
        { role: 'system', content: system },
        ...messages,
      ];
      response = await fetch(CONFIG.GROQ_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model, max_tokens: 700, messages: groqMessages }),
      });
    } else {
      if (!CONFIG.API_KEY) throw new Error('Anthropic API ключ не установлен');
      // Anthropic формат: system отдельно, messages только user/assistant
      response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':                              'application/json',
          'x-api-key':                                 CONFIG.API_KEY,
          'anthropic-version':                         '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 700, system, messages }),
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('AI таймаут (60с)');
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`API ошибка ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  // Groq: data.choices[0].message.content | Anthropic: data.content[0].text
  const text = isGroq ? data.choices?.[0]?.message?.content : data.content?.[0]?.text;
  if (!text) throw new Error('Пустой ответ от API');
  return text;
}

// ──────────────────────────────────────────────────────────────────────────────
// ПАРСИНГ УСЛОВИЙ ДОГОВОРА
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Извлекает условия договора из текста ответа AI.
 * @param {string} responseText
 * @returns {{ agreed: boolean, treaty_type?: string, conditions?: object, reason?: string }|null}
 */
function parseDiplomacyTreaty(responseText) {
  if (!responseText) return null;

  // Ищем ```json ... ``` блок
  const fence = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (!fence) return null;

  try {
    // Убираем хвостовые запятые
    const cleaned = fence[1].replace(/,\s*([}\]])/g, '$1').trim();
    const obj = JSON.parse(cleaned);

    if (typeof obj.treaty_agreed === 'boolean') {
      return {
        agreed:      obj.treaty_agreed,
        treaty_type: obj.treaty_type  ?? null,
        conditions:  obj.conditions   ?? {},
        reason:      obj.reason       ?? null,
      };
    }
  } catch (_) {}

  return null;
}

/**
 * Убирает JSON-блок из текста ответа (для чистого отображения в чате).
 * @param {string} text
 * @returns {string}
 */
function stripDiplomacyJSON(text) {
  return text.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// ФАЗА 2: СОСТАВЛЕНИЕ ФИНАЛЬНОГО ТЕКСТА ДОГОВОРА
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Просит AI составить официальный текст договора на основе переговоров.
 * @returns {Promise<string>} — полный текст договора
 */
async function callTreatyDraftAI(aiNationId, playerNationId, chatHistory, treatyType, conditions) {
  if (!CONFIG.API_KEY) throw new Error('API ключ не установлен');

  const aiNation     = GAME_STATE.nations[aiNationId];
  const playerNation = GAME_STATE.nations[playerNationId];
  const aiName     = aiNation?.name     ?? 'Иностранная держава';
  const playerName = playerNation?.name ?? 'Ваша держава';
  const aiRuler    = aiNation?.government?.ruler?.name ?? aiNation?.government?.ruler ?? 'Правитель';
  const plRuler    = playerNation?.government?.ruler?.name ?? playerNation?.government?.ruler ?? 'Правитель';
  const tDef       = typeof TREATY_TYPES !== 'undefined' ? (TREATY_TYPES[treatyType] ?? {}) : {};
  const d          = GAME_STATE.date;
  const year       = d?.year ?? d?.turn ?? 0;
  const era        = year < 0 ? `${Math.abs(year)} г. до н.э.` : `${year} г. н.э.`;

  // Краткий пересказ переговоров
  const chatSummary = chatHistory.slice(-12).map(m =>
    `${m.role === 'user' ? playerName : aiName}: ${(m.displayText ?? m.text ?? '').slice(0, 200)}`
  ).join('\n');

  const system = `Ты — опытный государственный писарь и правовед.
Составляй официальные тексты договоров в стиле античности (Рим, Греция, Персия).
Пиши на русском языке. Используй торжественный, официальный стиль.
Никаких комментариев от себя — только текст самого документа.`;

  const userPrompt = `Составь официальный текст договора «${tDef.label ?? treatyType}» между:
— ${playerName} (${plRuler})
— ${aiName} (${aiRuler})

Год: ${era}

Итог переговоров (последние реплики):
${chatSummary}

Особые условия: ${conditions?.notes ?? conditions?.duration ? `срок ${conditions.duration} лет` : 'не указаны'}

Структура документа:
1. Преамбула (стороны, дата, место)
2. Предмет договора (что договорились)
3. Обязательства сторон (по пунктам)
4. Срок действия
5. Последствия нарушения
6. Заключение и печати

Длина: 250–400 слов. Только текст документа.`;

  const response = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-api-key':      CONFIG.API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      CONFIG.MODEL_SONNET,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${err.slice(0, 150)}`);
  }
  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Пустой ответ при составлении договора');
  return text.trim();
}

/**
 * Просит AI внести правки в существующий черновик договора.
 * @returns {Promise<{draftText: string, comment: string}>}
 */
async function callTreatyRevisionAI(aiNationId, playerNationId, currentDraft, editHistory, treatyType) {
  if (!CONFIG.API_KEY) throw new Error('API ключ не установлен');

  const aiNation     = GAME_STATE.nations[aiNationId];
  const playerNation = GAME_STATE.nations[playerNationId];
  const aiName   = aiNation?.name     ?? 'Иностранная держава';
  const plName   = playerNation?.name ?? 'Ваша держава';
  const aiRuler  = aiNation?.government?.ruler?.name ?? aiNation?.government?.ruler ?? 'Правитель';
  const tDef     = typeof TREATY_TYPES !== 'undefined' ? (TREATY_TYPES[treatyType] ?? {}) : {};

  // Последние правки
  const lastEdit = editHistory.filter(m => m.role === 'user').slice(-1)[0]?.text ?? '';

  const system = `Ты — ${aiRuler}, правитель ${aiName}.
Ты рассматриваешь правки к тексту договора и либо принимаешь их, либо предлагаешь компромисс.
Отвечай кратко (1-3 предложения) как государственный деятель античности.
После своего ответа ОБЯЗАТЕЛЬНО предоставь обновлённый полный текст договора.

Формат ответа:
КОММЕНТАРИЙ: <твой ответ как правителя>
---ДОГОВОР---
<полный обновлённый текст договора>`;

  const userPrompt = `Игрок (${plName}) запрашивает следующую правку к договору «${tDef.label ?? treatyType}»:
"${lastEdit}"

Текущий текст договора:
${currentDraft}

Внеси разумные правки (если они не ущемляют интересы ${aiName}) и предоставь обновлённый текст.`;

  const response = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-api-key':      CONFIG.API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      CONFIG.MODEL_SONNET,
      max_tokens: 1400,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${err.slice(0, 150)}`);
  }

  const data = await response.json();
  const raw  = data.content?.[0]?.text ?? '';
  if (!raw) throw new Error('Пустой ответ при правке договора');

  // Парсим ответ: комментарий и новый текст договора
  const sepIdx = raw.indexOf('---ДОГОВОР---');
  if (sepIdx !== -1) {
    const commentRaw  = raw.slice(0, sepIdx).replace(/^КОММЕНТАРИЙ:\s*/i, '').trim();
    const newDraft    = raw.slice(sepIdx + 13).trim();
    return { draftText: newDraft || currentDraft, comment: commentRaw || 'Правки внесены.' };
  }

  // Если разделитель не найден — вернуть оригинал с комментарием
  return { draftText: currentDraft, comment: raw.slice(0, 300).trim() };
}
