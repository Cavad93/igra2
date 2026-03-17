// ══════════════════════════════════════════════════════════════════════
// DIALOGUE ENGINE — свободное текстовое общение с персонажами
//
// Модели:
//   Sonnet 4.6  — когда игрок активно разговаривает (сессия горячая)
//   Haiku 4.5   — классификация намерений + сжатие памяти
//   Математика  — однозначно распознаваемые паттерны (без LLM вообще)
//
// Три слоя памяти:
//   Hot Memory      — последние 15 реплик текущего диалога (полный текст)
//   Summary Memory  — 1-2 предложения на ход (сжимается Haiku в конце сессии)
//   LTS Tags        — постоянные теги из старых резюме (>20 ходов назад)
// ══════════════════════════════════════════════════════════════════════

// Реестр временных персонажей для диалога (senators, advisors без char в nation.characters)
const _DIALOGUE_TEMP_CHARS = {};

const DIALOGUE_ENGINE = (() => {

  // ─────────────────────────────────────────────────────────────
  // КОНСТАНТЫ
  // ─────────────────────────────────────────────────────────────
  const HOT_MEMORY_LIMIT   = 15;   // максимум реплик в горячей памяти (пар player+char)
  const PATIENCE_MAX       = 100;
  const PATIENCE_COST_SPAM = 25;   // штраф за бессмыслицу
  const PATIENCE_REGEN     = 10;   // восстановление за ход без взаимодействия
  const SESSION_TIMEOUT_TURNS = 3; // ходов тишины → сессия считается завершённой

  // charId → { lastTurn: number } — отслеживание активных сессий
  const _sessions = {};

  // ─────────────────────────────────────────────────────────────
  // ПУБЛИЧНЫЙ ИНТЕРФЕЙС
  // ─────────────────────────────────────────────────────────────

  // Главная функция: игрок отправил text персонажу charId
  async function processPlayerInput(charId, text, nationId) {
    const nId    = nationId ?? GAME_STATE.player_nation;
    const nation = GAME_STATE.nations[nId];
    const char   = (nation?.characters ?? []).find(c => c.id === charId)
                ?? _DIALOGUE_TEMP_CHARS[charId];
    if (!char || !char.alive) return { error: 'Персонаж недоступен.' };

    _ensureDialogue(char);

    // Восстановление терпения если прошли ходы
    _regenPatience(char);

    // Anti-cheese: проверка терпения
    const patienceBlock = _checkPatience(char, text);
    if (patienceBlock) {
      char.traits.loyalty = Math.max(0, char.traits.loyalty - 8);
      return {
        blocked:       true,
        reply:         patienceBlock,
        loyalty_delta: -8,
        patience:      char.dialogue.patience_score,
      };
    }

    // Пометить сессию активной
    _sessions[charId] = { lastTurn: GAME_STATE.turn };

    // 1. Определить намерение (математика → Haiku если неясно)
    const intent = await _detectIntent(text, char, nation);

    // 2. Получить ответ персонажа (Sonnet — сессия горячая)
    const response = await _getCharacterResponse(char, text, intent, nation);

    // 3. Применить базовые эффекты (лояльность, деньги, тирания)
    const effects = _applyEffects(char, intent, response, nation);

    // 3b. Применить исход сделки если персонаж согласился (accept: true)
    if (response.accept) {
      const outcomes = _applyOutcome(char, intent, response, nation);
      effects.push(...outcomes);
    }

    // 4. Сохранить в горячую память
    _addToHotMemory(char, text, response.reply, intent);

    // Небольшое восстановление терпения за нормальный диалог
    char.dialogue.patience_score = Math.min(PATIENCE_MAX, char.dialogue.patience_score + 5);
    char.dialogue.last_interaction_turn = GAME_STATE.turn;

    return {
      reply:         response.reply,
      intent:        intent.type,
      mood:          response.mood,
      effects,
      patience:      char.dialogue.patience_score,
      loyalty_after: char.traits.loyalty,
    };
  }

  // Сжать горячую память по окончании диалога/хода (вызывается из tick)
  async function compressMemory(charId, nationId) {
    const nId    = nationId ?? GAME_STATE.player_nation;
    const nation = GAME_STATE.nations[nId];
    const char   = (nation?.characters ?? []).find(c => c.id === charId)
                ?? _DIALOGUE_TEMP_CHARS[charId];
    if (!char?.dialogue?.hot_memory?.length) return;

    const hotText = char.dialogue.hot_memory
      .map(m => `${m.role === 'player' ? 'Игрок' : char.name}: ${m.text}`)
      .join('\n');

    let summaryText = `Ход ${GAME_STATE.turn}: диалог из ${Math.ceil(char.dialogue.hot_memory.length / 2)} реплик.`;
    try {
      summaryText = await callClaude(
        'Сожми диалог в 1-2 предложения. Только факты: что предлагал игрок, реакция персонажа, итог. Стиль: летопись. Пиши по-русски.',
        hotText,
        120,
        CONFIG.MODEL_HAIKU
      );
    } catch (_) { /* используем fallback */ }

    char.dialogue.summary_memory.push({ turn: GAME_STATE.turn, text: summaryText });

    // Если резюме > 5 — старые уходят в LTS
    if (char.dialogue.summary_memory.length > 5) {
      const old = char.dialogue.summary_memory.splice(0, char.dialogue.summary_memory.length - 5);
      _promoteToLTS(char, old);
    }

    char.dialogue.hot_memory = [];
  }

  // Ежеходный тик: сжать память тех персонажей, у кого закончилась активная сессия
  async function tick(nationId) {
    const nId    = nationId ?? GAME_STATE.player_nation;
    const nation = GAME_STATE.nations[nId];

    // Персонажи из nation.characters
    for (const char of (nation?.characters ?? [])) {
      if (!char.alive || !char.dialogue?.hot_memory?.length) continue;
      const lastTurn = char.dialogue.last_interaction_turn ?? 0;
      if (GAME_STATE.turn > lastTurn) await compressMemory(char.id, nId);
    }

    // Сенаторы и другие временные персонажи из реестра
    for (const pseudo of Object.values(_DIALOGUE_TEMP_CHARS)) {
      if (!pseudo.dialogue?.hot_memory?.length) continue;
      const lastTurn = pseudo.dialogue.last_interaction_turn ?? 0;
      if (GAME_STATE.turn > lastTurn) await compressMemory(pseudo.id, nId);
    }
  }

  // Проверяет, является ли сессия "горячей" (игрок недавно разговаривал)
  function isSessionActive(charId) {
    const s = _sessions[charId];
    if (!s) return false;
    return (GAME_STATE.turn - s.lastTurn) < SESSION_TIMEOUT_TURNS;
  }

  // ─────────────────────────────────────────────────────────────
  // ОПРЕДЕЛЕНИЕ НАМЕРЕНИЙ
  //
  // Всегда используем Haiku 4.5 с полным контекстом:
  //   — черты персонажа и его теги
  //   — последние 4 реплики горячей памяти (контекст разговора)
  //   — текст игрока
  //
  // Это позволяет распознавать непрямые формулировки:
  //   «Я слышал ты любишь монеты... вот триста штук» → bribe, amount:300
  //   «Наши интересы совпадают» → alliance
  //   «Твои дни сочтены, если ты откажешь» → threat
  //
  // Regex используется ТОЛЬКО как вспомогательный экстрактор числа суммы,
  // чтобы не терять его если Haiku вернул тип bribe без amount.
  // ─────────────────────────────────────────────────────────────

  // Вспомогательно: вытащить число из текста (для bribe amount)
  function _extractAmount(text) {
    const m = text.match(/(\d[\d\s]*)\s*(золот|монет|талант|денар|статер|штук)?/);
    if (!m) return null;
    const n = parseInt(m[1].replace(/\s/g, ''));
    return isNaN(n) ? null : n;
  }

  async function _detectIntent(text, char, nation) {
    // Контекст: последние 4 реплики (2 пары)
    const recentLines = (char.dialogue.hot_memory ?? []).slice(-4)
      .map(m => `${m.role === 'player' ? 'Игрок' : char.name}: ${m.text}`)
      .join('\n');

    // Профиль персонажа для классификатора
    const profile = [
      `Имя: ${char.name}`,
      `Черты: жадность ${char.traits.greed}/100, честолюбие ${char.traits.ambition}/100,`,
      `  лояльность ${char.traits.loyalty}/100, осторожность ${char.traits.caution ?? 50}/100`,
      `Теги: ${_buildTags(char)}`,
    ].join('\n');

    const systemPrompt = `Ты — анализатор намерений игрока в исторической стратегии 301 до н.э.
Получаешь профиль персонажа, контекст разговора и реплику игрока.
Определи намерение игрока. Учитывай косвенные формулировки, метафоры, намёки.

Типы намерений:
  bribe             — предлагает деньги, ценности, выгоду (явно или косвенно)
  alliance          — предлагает политический союз, долгосрочный блок, взаимную поддержку
  request           — просит об одноразовой помощи, поддержке закона, услуге, голосовании
  conspiracy_join   — предлагает персонажу вступить в заговор, переворот, тайный план против кого-то
  conspiracy_betray — просит персонажа предать, раскрыть или остановить существующий заговор
  military_support  — просит военной помощи, поддержки армией, стратегического союза (к генералам)
  trade_deal        — предлагает торговую сделку, экономическое соглашение (к купцам)
  threat            — угрожает, шантажирует, намекает на последствия
  flatter           — льстит, хвалит, превозносит
  info_request      — хочет узнать что-то, спрашивает о событиях, слухах
  insult            — оскорбляет, унижает, проявляет неуважение
  conversation      — нейтральная беседа, не подпадает под остальные

Верни ТОЛЬКО JSON без markdown:
{"type":"bribe","amount":500,"confidence":0.9}
Поле amount — только для bribe, иначе не включай. confidence: 0.0–1.0.`;

    const userPrompt = `ПЕРСОНАЖ:
${profile}

${recentLines ? `ПРЕДЫДУЩИЙ КОНТЕКСТ:\n${recentLines}\n\n` : ''}ИГРОК ГОВОРИТ: "${text}"`;

    try {
      const raw = await callClaude(systemPrompt, userPrompt, 100, CONFIG.MODEL_HAIKU);
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error('no json');
      const parsed = JSON.parse(match[0]);

      // Если bribe но нет amount — пробуем вытащить из текста
      if (parsed.type === 'bribe' && !parsed.amount) {
        parsed.amount = _extractAmount(text) ?? 0;
      }
      return {
        type:       parsed.type       ?? 'conversation',
        amount:     parsed.amount,
        confidence: parsed.confidence ?? 0.6,
      };
    } catch (_) {
      // Крайний fallback — разговор без классификации
      return { type: 'conversation', confidence: 0.3 };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ОТВЕТ ПЕРСОНАЖА (Sonnet 4.6)
  // ─────────────────────────────────────────────────────────────

  async function _getCharacterResponse(char, playerText, intent, nation) {
    const hotLines = (char.dialogue.hot_memory ?? []).slice(-HOT_MEMORY_LIMIT * 2)
      .map(m => `${m.role === 'player' ? 'Игрок' : char.name}: ${m.text}`)
      .join('\n');

    const summaries = (char.dialogue.summary_memory ?? []).slice(-3).map(s => s.text).join(' | ');
    const lts       = (char.dialogue.lts_tags ?? []).join(', ');
    const tags      = _buildTags(char);
    const roleStr   = _roleLabel(char.role);
    const intentHint = _intentHint(intent, char, nation);

    const systemPrompt = `Ты — ${char.name}, ${roleStr} в Сиракузах, 301 до н.э.
Черты характера: ${tags}.
Лояльность к правителю: ${char.traits.loyalty}/100. Жадность: ${char.traits.greed}/100. Честолюбие: ${char.traits.ambition}/100.
Долгосрочная история с игроком: ${lts || 'нет значимых событий'}.
Резюме предыдущих встреч: ${summaries || 'первая встреча'}.

ПРАВИЛА ОТВЕТА:
- Говори от первого лица, кратко: 2-4 предложения. Античный стиль.
- Не упоминай цифры (loyalty, greed) — только действия и слова.
- Если предложение выгодно — прими с достоинством. Если нет — откажи с характером.
- Верни ТОЛЬКО JSON без markdown: {"reply":"...","mood":"accepting|neutral|suspicious|offended|pleased","loyalty_delta":-20..20,"accept":true}`;

    const userPrompt = `${hotLines ? `ПРЕДЫДУЩИЙ РАЗГОВОР:\n${hotLines}\n\n` : ''}Игрок говорит: "${playerText}"
Оценка намерения: ${intentHint}
Ответь как ${char.name}.`;

    try {
      const raw = await callClaude(systemPrompt, userPrompt, 350, CONFIG.MODEL_SONNET);
      // Извлечь JSON из ответа (Sonnet иногда добавляет текст вокруг)
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      if (!parsed) throw new Error('no JSON');
      return {
        reply:         String(parsed.reply ?? 'Я обдумаю твои слова.'),
        mood:          parsed.mood  ?? 'neutral',
        loyalty_delta: Math.max(-25, Math.min(25, Number(parsed.loyalty_delta ?? 0))),
        accept:        Boolean(parsed.accept),
      };
    } catch (e) {
      console.warn('[DIALOGUE] Sonnet parse error:', e);
      return { reply: 'Я слышу тебя, консул. Дай мне подумать.', mood: 'neutral', loyalty_delta: 0, accept: false };
    }
  }

  function _intentHint(intent, char, nation) {
    const treasury = nation.economy?.treasury ?? 0;
    switch (intent.type) {
      case 'bribe': {
        const amount = intent.amount ?? 0;
        const greed  = char.traits.greed ?? 50;
        const chance = Math.min(95, Math.round(20 + (amount / 100) * 0.4 + greed * 0.3));
        return `Предлагает взятку ${amount} золота. Жадность персонажа: ${greed}/100. Расчётная вероятность принятия: ${chance}%.`;
      }
      case 'alliance':
        return `Предлагает политический союз. Лояльность: ${char.traits.loyalty}/100. Честолюбие: ${char.traits.ambition}/100.`;
      case 'threat':
        return `Угрожает. Это задевает гордость персонажа (жестокость ${char.traits.cruelty ?? 30}/100).`;
      case 'flatter':
        return `Льстит. Честолюбие ${char.traits.ambition}/100 — ему приятно, но он не наивен.`;
      case 'request':
        return `Просит о поддержке. Лояльность ${char.traits.loyalty}/100 определяет готовность помочь.`;
      case 'info_request':
        return `Хочет информацию. Осторожность ${char.traits.caution ?? 50}/100 влияет на откровенность.`;
      case 'conspiracy_join':
        return `Предлагает вступить в тайный заговор или переворот. Честолюбие ${char.traits.ambition}/100, лояльность ${char.traits.loyalty}/100. Высокое честолюбие и низкая лояльность = склонен согласиться.`;
      case 'conspiracy_betray':
        return `Просит предать или раскрыть существующий заговор. Осторожность ${char.traits.caution ?? 50}/100. Страх репрессий vs лояльность правителю.`;
      case 'military_support':
        return `Просит военной поддержки. Актуально для полководцев и военных. Лояльность ${char.traits.loyalty}/100.`;
      case 'trade_deal':
        return `Предлагает торговую сделку. Актуально для купцов. Жадность ${char.traits.greed}/100 влияет на условия.`;
      case 'insult':
        return `Оскорбляет или неуважителен. Персонаж должен выразить гнев или холодное презрение.`;
      default:
        return `Ведёт беседу. Отвечай по обстановке.`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ПРИМЕНЕНИЕ ИГРОВЫХ ЭФФЕКТОВ
  // ─────────────────────────────────────────────────────────────

  function _applyEffects(char, intent, response, nation) {
    const effects = [];

    // Изменение лояльности
    if (response.loyalty_delta !== 0) {
      char.traits.loyalty = Math.max(0, Math.min(100, char.traits.loyalty + response.loyalty_delta));
      effects.push({ type: 'loyalty', delta: response.loyalty_delta });
    }

    // Подкуп — снять деньги если принято
    if (intent.type === 'bribe' && response.accept && intent.amount > 0) {
      const cost = Math.min(intent.amount, nation.economy.treasury);
      nation.economy.treasury -= cost;
      if (!char.hidden_interests) char.hidden_interests = [];
      if (!char.hidden_interests.includes('Known_Bribed_By_Player')) {
        char.hidden_interests.push('Known_Bribed_By_Player');
      }
      // Добавляем в историю персонажа
      (char.history ?? (char.history = [])).push({
        turn:  GAME_STATE.turn,
        event: `Принял взятку от правителя (${cost} золота).`,
      });
      effects.push({ type: 'bribe_paid', amount: cost });
    }

    // Угроза → tyranny_points
    if (intent.type === 'threat') {
      const cs = GAME_STATE.nations[GAME_STATE.player_nation]?.constitutional_state;
      if (cs) {
        cs.tyranny_points = Math.min(200, (cs.tyranny_points ?? 0) + 3);
        effects.push({ type: 'tyranny', delta: 3 });
      }
    }

    // Оскорбление → потеря patience + history
    if (intent.type === 'insult') {
      char.dialogue.patience_score = Math.max(0, char.dialogue.patience_score - 20);
      effects.push({ type: 'insult' });
    }

    return effects;
  }

  // ─────────────────────────────────────────────────────────────
  // ИСХОД СДЕЛКИ — вызывается только когда response.accept = true
  // Переводит согласие персонажа в конкретные игровые состояния.
  // ─────────────────────────────────────────────────────────────

  function _applyOutcome(char, intent, response, nation) {
    const outcomes = [];
    const lts = char.dialogue.lts_tags;
    const nId = GAME_STATE.player_nation;

    const _addLTS = tag => { if (!lts.includes(tag)) lts.push(tag); };
    const _logChar = event => {
      (char.history ?? (char.history = [])).push({ turn: GAME_STATE.turn, event });
    };

    switch (intent.type) {

      // ── СОЮЗ ──────────────────────────────────────────────────
      // Долгосрочный: союзник поддерживает ВСЕ законы игрока в сенате.
      case 'alliance': {
        _addLTS('[Allied_With_Player]');
        // Удаляем тег врага если был
        const enemyIdx = lts.indexOf('[Known_Enemy]');
        if (enemyIdx !== -1) lts.splice(enemyIdx, 1);
        char.traits.loyalty = Math.min(100, char.traits.loyalty + 10);
        _logChar('Заключил политический союз с правителем.');
        if (nId === GAME_STATE.player_nation) {
          addEventLog(`🤝 ${char.name} вступил в союз — он поддержит ваши законы в Сенате.`, 'good');
        }
        outcomes.push({ type: 'alliance_formed', char: char.name });
        break;
      }

      // ── ОДНОРАЗОВАЯ ПОДДЕРЖКА ─────────────────────────────────
      // Разовое: поддержит СЛЕДУЮЩИЙ закон игрока (+15pp в голосовании).
      case 'request': {
        _addLTS('[Supports_Player_Request]');
        _logChar('Пообещал поддержать следующий закон правителя.');
        if (nId === GAME_STATE.player_nation) {
          addEventLog(`📜 ${char.name} обещал поддержать ваш следующий закон.`, 'info');
        }
        outcomes.push({ type: 'request_support', char: char.name });
        break;
      }

      // ── ВСТУПЛЕНИЕ В ЗАГОВОР ИГРОКА ───────────────────────────
      // Персонаж соглашается участвовать в тайном плане игрока.
      case 'conspiracy_join': {
        _addLTS('[Player_Conspirator]');
        // Помечаем флаг на самом персонаже для работы conspiracy engine
        char.player_conspiracy_member = true;
        _logChar('Согласился участвовать в тайном замысле правителя.');
        if (nId === GAME_STATE.player_nation) {
          addEventLog(`🗡️ ${char.name} согласился — теперь он участник вашего замысла.`, 'warning');
        }
        outcomes.push({ type: 'joined_player_conspiracy', char: char.name });
        break;
      }

      // ── ПРЕДАТЕЛЬСТВО ЗАГОВОРА ────────────────────────────────
      // Персонаж раскрывает/разрушает заговор в котором состоит.
      case 'conspiracy_betray': {
        const conspiracies = GAME_STATE.nations[nId]?.conspiracies ?? [];
        const cons = conspiracies.find(c =>
          ['incubating','growing','detected'].includes(c.status) &&
          (c.members ?? []).includes(char.id)
        );
        if (cons) {
          // Наносим ущерб заговору
          cons.conspiracy_stealth  = Math.max(0,  (cons.conspiracy_stealth ?? 50)  - 40);
          cons.preparation         = Math.max(0,  (cons.preparation        ?? 0)   - 30);
          cons.detected_by_player  = true;
          cons.status              = 'detected';
          // Удаляем предателя из членов
          const idx = cons.members.indexOf(char.id);
          if (idx !== -1) cons.members.splice(idx, 1);
          char.conspiracy_id              = null;
          char.is_conspiracy_leader       = false;
          _addLTS('[Betrayed_Conspiracy]');
          _logChar(`Предал заговор ${cons.leader_name} — раскрыл его правителю.`);
          addEventLog(
            `🔍 ${char.name} раскрыл заговор «${cons.manifest?.name ?? cons.leader_name}»! Скрытность упала до ${cons.conspiracy_stealth}. Подготовка сброшена.`,
            'good'
          );
          outcomes.push({ type: 'conspiracy_betrayed', conspiracy_id: cons.id });
        } else {
          // Персонаж не состоит ни в каком известном заговоре — просто тег
          _addLTS('[Loyal_Informant]');
          _logChar('Пообещал сообщать о заговорах при дворе.');
          addEventLog(`👁 ${char.name} станет вашим осведомителем при дворе.`, 'info');
          outcomes.push({ type: 'informant_recruited', char: char.name });
        }
        break;
      }

      // ── ВОЕННАЯ ПОДДЕРЖКА (генерал) ───────────────────────────
      case 'military_support': {
        if (char.role === 'general') {
          const mil = nation.military;
          if (mil) {
            mil.loyalty  = Math.min(100, (mil.loyalty  ?? 50) + 8);
            mil.morale   = Math.min(100, (mil.morale   ?? 50) + 5);
          }
          _addLTS('[Military_Ally]');
          _logChar('Пообещал личную военную поддержку правителю.');
          addEventLog(`⚔️ ${char.name} поддержал армию — лояльность войск +8, боевой дух +5.`, 'good');
          outcomes.push({ type: 'military_support', char: char.name, loyalty_delta: 8, morale_delta: 5 });
        }
        break;
      }

      // ── ТОРГОВАЯ СДЕЛКА (купец) ───────────────────────────────
      case 'trade_deal': {
        if (char.role === 'merchant') {
          const bonus = Math.round(200 + (char.traits.greed ?? 50) * 5);
          nation.economy.treasury = (nation.economy.treasury ?? 0) + bonus;
          _addLTS('[Trade_Partner]');
          _logChar(`Заключил торговую сделку с правителем (+${bonus} золота).`);
          addEventLog(`💼 ${char.name} заключил сделку — казна пополнилась на ${bonus} золота.`, 'good');
          outcomes.push({ type: 'trade_deal', char: char.name, gold: bonus });
        }
        break;
      }
    }

    return outcomes;
  }

  // ─────────────────────────────────────────────────────────────
  // ГОРЯЧАЯ ПАМЯТЬ
  // ─────────────────────────────────────────────────────────────

  function _addToHotMemory(char, playerText, charReply, intent) {
    const mem = char.dialogue.hot_memory;
    mem.push({ role: 'player',    text: playerText, turn: GAME_STATE.turn, intent: intent.type });
    mem.push({ role: 'character', text: charReply,  turn: GAME_STATE.turn });
    // Ограничиваем объём
    const limit = HOT_MEMORY_LIMIT * 2;
    if (mem.length > limit) mem.splice(0, mem.length - limit);
  }

  // ─────────────────────────────────────────────────────────────
  // LTS — долгосрочное хранилище
  // ─────────────────────────────────────────────────────────────

  function _promoteToLTS(char, oldSummaries) {
    const lts = char.dialogue.lts_tags;
    // loyalty может быть в traits.loyalty (nation.characters) или loyalty_score (сенаторы)
    const loyalty = char.traits?.loyalty ?? char.loyalty_score ?? 50;

    // Теги по состоянию персонажа
    if (char.hidden_interests?.includes('Known_Bribed_By_Player') && !lts.includes('[Bribed]'))
      lts.push('[Bribed]');
    if (loyalty > 70 && !lts.includes('[Old_Friend]'))
      lts.push('[Old_Friend]');
    if (loyalty < 20 && !lts.includes('[Known_Enemy]'))
      lts.push('[Known_Enemy]');

    // Тезис из старых резюме (ограничиваем длину LTS до 10 записей)
    const tezis = oldSummaries.map(s => s.text).join('; ');
    lts.push(`[Ход_${GAME_STATE.turn}: ${tezis.slice(0, 120)}]`);
    if (lts.length > 10) lts.splice(0, lts.length - 10);
  }

  // ─────────────────────────────────────────────────────────────
  // ANTI-CHEESE: PATIENCE
  // ─────────────────────────────────────────────────────────────

  function _regenPatience(char) {
    const turnsSince = GAME_STATE.turn - (char.dialogue.last_interaction_turn ?? 0);
    if (turnsSince > 0) {
      char.dialogue.patience_score = Math.min(
        PATIENCE_MAX,
        char.dialogue.patience_score + turnsSince * PATIENCE_REGEN
      );
    }
  }

  function _checkPatience(char, text) {
    const d   = char.dialogue;
    const mem = d.hot_memory;

    // Текст слишком короткий, только цифры/знаки или повтор последней реплики
    const lastPlayerLine = mem.filter(m => m.role === 'player').slice(-1)[0]?.text ?? '';
    const isNonsense = text.trim().length < 3
      || /^[\d\s!?.,;]+$/.test(text.trim())
      || text.trim().toLowerCase() === lastPlayerLine.toLowerCase();

    if (isNonsense) {
      d.patience_score = Math.max(0, d.patience_score - PATIENCE_COST_SPAM);
    }

    if (d.patience_score <= 0) {
      return `${char.name} холодно поворачивается спиной: «Ты злоупотребляешь моим временем, консул. Разговор окончен.»`;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // ВСПОМОГАТЕЛЬНЫЕ
  // ─────────────────────────────────────────────────────────────

  function _ensureDialogue(char) {
    if (!char.dialogue) {
      char.dialogue = {
        hot_memory:            [],
        summary_memory:        [],
        lts_tags:              [],
        patience_score:        PATIENCE_MAX,
        last_interaction_turn: 0,
      };
    }
  }

  function _buildTags(char) {
    const t = char.traits ?? {};
    // loyalty может быть в traits.loyalty или loyalty_score (сенаторы)
    const loyalty = t.loyalty ?? char.loyalty_score ?? 50;
    return [
      ...(char.hidden_interests ?? []),
      (t.greed    ?? 0) > 70 ? '[Greedy]'    : '',
      loyalty            > 70 ? '[Honorable]' : '',
      (t.ambition ?? 0) > 70 ? '[Ambitious]' : '',
      (t.cruelty  ?? 0) > 60 ? '[Ruthless]'  : '',
      (t.caution  ?? 0) > 70 ? '[Cautious]'  : '',
      (t.piety    ?? 0) > 70 ? '[Pious]'     : '',
      ...(char.dialogue?.lts_tags ?? []),
    ].filter(Boolean).join(', ') || 'нет особых черт';
  }

  function _roleLabel(role) {
    return { senator:'сенатор', advisor:'советник', general:'стратег',
             priest:'жрец', merchant:'купец' }[role] ?? 'советник';
  }

  // ─────────────────────────────────────────────────────────────
  // ЭКСПОРТ
  // ─────────────────────────────────────────────────────────────
  // Сжать диалог напрямую по объекту персонажа (для сенаторов и внешних объектов)
  async function compressDirect(char) {
    if (!char?.dialogue?.hot_memory?.length) return;
    const lastTurn = char.dialogue.last_interaction_turn ?? 0;
    if (GAME_STATE.turn <= lastTurn) return;  // сессия ещё горячая

    const hotText = char.dialogue.hot_memory
      .map(m => `${m.role === 'player' ? 'Игрок' : char.name}: ${m.text}`)
      .join('\n');

    let summaryText = `Ход ${GAME_STATE.turn}: диалог из ${Math.ceil(char.dialogue.hot_memory.length / 2)} реплик.`;
    try {
      summaryText = await callClaude(
        'Сожми диалог в 1-2 предложения. Только факты: что предлагал игрок, реакция персонажа, итог. Стиль: летопись. Пиши по-русски.',
        hotText, 120, CONFIG.MODEL_HAIKU
      );
    } catch (_) { /* используем fallback */ }

    char.dialogue.summary_memory ??= [];
    char.dialogue.summary_memory.push({ turn: GAME_STATE.turn, text: summaryText });

    if (char.dialogue.summary_memory.length > 5) {
      const old = char.dialogue.summary_memory.splice(0, char.dialogue.summary_memory.length - 5);
      _promoteToLTS(char, old);
    }
    char.dialogue.hot_memory = [];
  }

  return { processPlayerInput, compressMemory, compressDirect, tick, isSessionActive };

})();
