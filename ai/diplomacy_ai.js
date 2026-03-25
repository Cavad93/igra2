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

  return `Ты — ${aiRuler}, правитель государства ${aiName}.
Форма правления: ${aiGovType}.
Год: ${era}, месяц ${month}.
Жанр: стратегия в духе «Imperator Rome».

КОНТЕКСТ ОТНОШЕНИЙ С ${playerName.toUpperCase()}:
  Оценка отношений: ${relScore} (${relLabel})
  Состояние войны: ${atWar ? '⚔ ВОЙНА' : 'мира'}
  Активные договоры:
${treatyList}
  Население ${aiName}: ${aiPop.toLocaleString()}
  Население ${playerName}: ${playerPop.toLocaleString()}
  Казна ${aiName}: ${Math.round(aiTreasury)} монет
  Казна ${playerName}: ${Math.round(playerTreasury)} монет

ИНСТРУКЦИИ ДЛЯ РОЛЕВОЙ ИГРЫ:
1. Отвечай ТОЛЬКО как ${aiRuler} — государственный деятель античности. Краткие, весомые фразы.
2. Защищай интересы ${aiName}. Думай о выгоде для своей державы.
3. При хороших отношениях (>20) — дружелюбен, но не слаб. При плохих (<-20) — холоден, осторожен.
4. Если игрок явно предлагает договор — прими решение: согласиться, отклонить или торговаться.
5. После финального решения по договору ОБЯЗАТЕЛЬНО добавь в конце ответа JSON-блок:

Если СОГЛАСЕН:
\`\`\`json
{"treaty_agreed": true, "treaty_type": "тип_из_списка", "conditions": {"duration": 10, "notes": "особые условия если есть"}}
\`\`\`

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
async function callDiplomacyAI(aiNationId, playerNationId, messages) {
  if (!CONFIG.API_KEY) throw new Error('API ключ не установлен');
  if (!messages || messages.length === 0) throw new Error('Пустая история диалога');

  const system     = _buildLeaderSystemPrompt(aiNationId, playerNationId);
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch(CONFIG.API_URL, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':                          'application/json',
        'x-api-key':                             CONFIG.API_KEY,
        'anthropic-version':                     '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL_SONNET,
        max_tokens: 700,
        system,
        messages,
      }),
    });
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
  const text = data.content?.[0]?.text;
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
