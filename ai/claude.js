// Все вызовы Anthropic API
// Каждый вызов получает полный снимок нужной части GameState

// ──────────────────────────────────────────────────────────────
// УТИЛИТА: НАДЁЖНЫЙ ПАРСИНГ JSON ИЗ ОТВЕТА МОДЕЛИ
// ──────────────────────────────────────────────────────────────

/**
 * Извлекает и парсит первый JSON-объект или массив из строки ответа модели.
 * Устойчив к markdown-обёрткам (```json...```) и хвостовым запятым.
 */
function extractJSON(raw) {
  let s = raw ?? '';

  // 1. Убираем markdown-блок кода, если есть
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1];

  // 2. Ищем первый { или [
  const firstBrace   = s.indexOf('{');
  const firstBracket = s.indexOf('[');

  if (firstBrace === -1 && firstBracket === -1) throw new Error('JSON не найден в ответе AI');

  let start, close;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace; close = '}';
  } else {
    start = firstBracket; close = ']';
  }

  const end = s.lastIndexOf(close);
  if (end <= start) throw new Error('Незакрытый JSON в ответе AI');

  let c = s.slice(start, end + 1);

  // 3. Убираем JS-комментарии вне строк (// ... и /* ... */)
  //    Простой state-machine: пропускаем символы внутри строк
  c = _stripJSONComments(c);

  // 4. Убираем хвостовые запятые (,} и ,])
  c = c.replace(/,\s*([\]}])/g, '$1');

  // 5. Первая попытка
  try { return JSON.parse(c); } catch (_) {}

  // 6. Запасная попытка: обрезаем до последнего валидного объекта/массива
  //    (на случай обрыва в конце)
  for (let i = c.length - 1; i > start; i--) {
    if (c[i] === '}' || c[i] === ']') {
      const trimmed = c.slice(0, i + 1).replace(/,\s*([\]}])/g, '$1');
      try { return JSON.parse(trimmed); } catch (_) {}
    }
  }

  throw new Error('Не удалось разобрать JSON из ответа AI');
}

// Удаляет // и /* */ комментарии из JSON-подобной строки, не трогая строковые литералы
function _stripJSONComments(str) {
  let out = '';
  let i = 0;
  while (i < str.length) {
    // Строковый литерал
    if (str[i] === '"') {
      out += '"';
      i++;
      while (i < str.length) {
        if (str[i] === '\\') { out += str[i] + (str[i + 1] ?? ''); i += 2; continue; }
        if (str[i] === '"')  { out += '"'; i++; break; }
        out += str[i++];
      }
      continue;
    }
    // Однострочный комментарий
    if (str[i] === '/' && str[i + 1] === '/') {
      while (i < str.length && str[i] !== '\n') i++;
      continue;
    }
    // Многострочный комментарий
    if (str[i] === '/' && str[i + 1] === '*') {
      i += 2;
      while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += str[i++];
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// БАЗОВАЯ ФУНКЦИЯ ВЫЗОВА API
// ──────────────────────────────────────────────────────────────

// Таймаут API-вызовов
const _API_TIMEOUT_MS = 30_000;

// ── Определяем является ли модель Groq-моделью ────────────────────────
function _isGroqModel(model) {
  // Groq модели — Llama, Mixtral, Gemma и т.д. (не начинаются с "claude-")
  return model && !model.startsWith('claude-');
}

// ── Groq API (OpenAI-совместимый формат) ──────────────────────────────
async function callGroq(system, user, maxTokens = 1024, model = CONFIG.MODEL_HAIKU) {
  if (!CONFIG.GROQ_API_KEY) {
    throw new Error('Groq API ключ не установлен (CONFIG.GROQ_API_KEY)');
  }

  const controller = new AbortController();
  const timeoutMs  = maxTokens > 512 ? 60_000 : _API_TIMEOUT_MS;
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  // Определяем нужен ли JSON-режим (структурированный вывод)
  // Включаем для задач где ожидаем JSON в ответе
  const wantsJson = user.includes('"action"') || user.includes('верни JSON') ||
                    user.includes('Верни JSON') || system.includes('ТОЛЬКО JSON');

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    ...(wantsJson && { response_format: { type: 'json_object' } }),
  };

  let response;
  try {
    response = await fetch(CONFIG.GROQ_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Groq timeout (${timeoutMs / 1000}s)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    // 429 = rate limit — пробрасываем явно чтобы вызывающий код мог откатиться к fallback
    if (response.status === 429) throw new Error(`Groq rate limit (429): ${errBody.slice(0, 100)}`);
    throw new Error(`Groq API ошибка ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Пустой ответ от Groq');
  return text;
}

// ── Anthropic Claude API ───────────────────────────────────────────────
async function _callAnthropic(system, user, maxTokens, model) {
  if (!CONFIG.API_KEY) {
    throw new Error('Anthropic API ключ не установлен (CONFIG.API_KEY)');
  }

  const controller = new AbortController();
  const timeoutMs  = maxTokens > 512 ? 60_000 : _API_TIMEOUT_MS;
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Anthropic timeout (${timeoutMs / 1000}s)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Anthropic API ошибка ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  if (!data.content?.[0]) throw new Error('Пустой ответ от Anthropic');
  return data.content[0].text;
}

// ── Единая точка входа: маршрутизация по модели ───────────────────────
// MODEL_HAIKU (llama-3.3-70b-versatile) → Groq
// MODEL_SONNET (claude-sonnet-4-6)      → Anthropic
async function callClaude(system, user, maxTokens = 1024, model = CONFIG.MODEL_HAIKU) {
  if (_isGroqModel(model)) {
    return callGroq(system, user, maxTokens, model);
  }
  return _callAnthropic(system, user, maxTokens, model);
}

// ──────────────────────────────────────────────────────────────
// 1. ПАРСИНГ КОМАНДЫ ИГРОКА
// ──────────────────────────────────────────────────────────────

async function parsePlayerCommand(playerInput) {
  // Формируем минимальный снимок состояния (не весь GameState — слишком большой)
  const nationId = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[nationId];

  const stateSlice = {
    date: GAME_STATE.date,
    turn: GAME_STATE.turn,
    nation_name: nation.name,
    government: nation.government,
    economy: {
      treasury: nation.economy.treasury,
      income_per_turn: nation.economy.income_per_turn,
      expense_per_turn: nation.economy.expense_per_turn,
      tax_rate: nation.economy.tax_rate,
    },
    population: {
      total: nation.population.total,
      happiness: nation.population.happiness,
    },
    military: {
      infantry: nation.military.infantry,
      cavalry: nation.military.cavalry,
      ships: nation.military.ships,
      mercenaries: nation.military.mercenaries,
      morale: nation.military.morale,
    },
    regions: nation.regions,
    active_laws: (nation.active_laws || []).map(l => l.name),
    relations: nation.relations,
    market_prices: Object.fromEntries(
      Object.entries(GAME_STATE.market).map(([g, m]) => [g, m.price])
    ),
  };

  const prompt = PROMPTS.parseCommand(playerInput, stateSlice);

  const rawResponse = await callClaude(prompt.system, prompt.user, 800, CONFIG.MODEL_HAIKU);
  const parsed = parseAIResponse(rawResponse);

  if (!validateCommandParse(parsed)) {
    throw new Error('AI вернул неверную структуру команды');
  }

  return parsed;
}

// ──────────────────────────────────────────────────────────────
// 2. РЕАКЦИЯ ПЕРСОНАЖЕЙ НА ДЕЙСТВИЕ
// ──────────────────────────────────────────────────────────────

async function getCharacterReactions(action, characters, politicalContext) {
  const results = [];

  // Реакции персонажей параллельно (но не больше 3 одновременно)
  const activeChars = characters.filter(c => c.alive && c.role !== 'merchant').slice(0, 5);

  for (const char of activeChars) {
    // Оцениваем личные последствия для персонажа
    const personalImpact = calculatePersonalImpact(char, action);

    const prompt = PROMPTS.characterReaction(action, char, personalImpact, politicalContext);

    try {
      const rawResponse = await callClaude(prompt.system, prompt.user, 400, CONFIG.MODEL_HAIKU);
      const parsed = parseAIResponse(rawResponse);

      if (validateCharacterReaction(parsed)) {
        results.push({ character: char, reaction: parsed });

        // Обновляем лояльность персонажа
        if (parsed.loyalty_delta !== 0) {
          char.traits.loyalty = Math.max(0, Math.min(100,
            char.traits.loyalty + parsed.loyalty_delta
          ));
          char.history.push({
            turn: GAME_STATE.turn,
            event: `Реакция на действие: лояльность ${parsed.loyalty_delta > 0 ? '+' : ''}${parsed.loyalty_delta}`,
          });
        }
      }
    } catch (err) {
      // При ошибке — детерминированная реакция
      console.warn(`Реакция ${char.name} — fallback:`, err.message);
      results.push({
        character: char,
        reaction: {
          position: char.traits.loyalty > 60 ? 'for' : 'against',
          speech: char.traits.loyalty > 60 ? 'Поддерживаю волю господина.' : 'Сомнительное решение.',
          loyalty_delta: 0,
        },
      });
    }
  }

  return results;
}

// Оценка личных последствий для персонажа (детерминированно)
function calculatePersonalImpact(char, action) {
  const impact = {};

  if (action.action_type === 'military' && action.parsed_action?.recruit_infantry) {
    if (char.role === 'general') impact.positive = 'Усиление армии соответствует интересам';
    if (char.role === 'merchant') impact.negative = 'Расходы на армию опустошат казну';
  }

  if (action.action_type === 'economy' && action.parsed_action?.change_tax_rate) {
    const newRate = action.parsed_action.change_tax_rate;
    if (newRate > 0.15) {
      if (char.role === 'merchant') impact.negative = 'Высокие налоги убьют торговлю';
      if (char.resources.gold > 5000) impact.negative = 'Потери богатых больше';
    }
  }

  if (action.action_type === 'law') {
    // Проверяем wants и fears
    const text = (action.parsed_action?.text || '').toLowerCase();
    for (const want of char.wants) {
      if (text.includes(want.replace(/_/g, ' '))) {
        impact.positive = `Закон затрагивает желание: ${want}`;
      }
    }
    for (const fear of char.fears) {
      if (text.includes(fear.replace(/_/g, ' '))) {
        impact.negative = `Закон затрагивает страх: ${fear}`;
      }
    }
  }

  return Object.keys(impact).length > 0 ? impact : { neutral: 'Прямых последствий нет' };
}

// ──────────────────────────────────────────────────────────────
// 3. РЕШЕНИЕ AI-НАЦИИ
// ──────────────────────────────────────────────────────────────

async function getAINationDecision(nationId, model = CONFIG.MODEL_HAIKU) {
  const nation = GAME_STATE.nations[nationId];

  // ── #1 Улучшение: детальная информация о соседях ──────────────
  const neighborsSummary = {};
  for (const [otherId, rel] of Object.entries(nation.relations)) {
    const otherNation = GAME_STATE.nations[otherId];
    if (!otherNation) continue;
    neighborsSummary[otherId] = {
      name:             otherNation.name,
      relation_score:   rel.score,
      at_war:           rel.at_war ?? false,
      treaties:         rel.treaties ?? [],
      military_strength: otherNation.military.infantry + otherNation.military.cavalry * 3 + (otherNation.military.mercenaries ?? 0),
      // #8: дипломатическая сеть — кто из соседей с кем воюет
      also_at_war_with: (otherNation.military.at_war_with ?? [])
        .filter(id => id !== nationId)
        .map(id => GAME_STATE.nations[id]?.name ?? id),
      stability:        otherNation.government?.stability ?? 50,
      region_count:     (otherNation.regions ?? []).length,
    };
  }

  // ── #2 Улучшение: детальная экономика ─────────────────────────
  const eco = nation.economy ?? {};
  const economySummary = {
    treasury:         Math.round(eco.treasury ?? 0),
    income_per_turn:  Math.round(eco.income_per_turn ?? 0),
    expense_per_turn: Math.round(eco.expense_per_turn ?? 0),
    balance:          Math.round((eco.income_per_turn ?? 0) - (eco.expense_per_turn ?? 0)),
    tax_rate:         eco.tax_rate ?? 0.1,
    trade_routes:     (eco.trade_routes ?? []).length,
    // топ-3 ресурса по запасам
    top_stockpile:    Object.entries(eco.stockpile ?? {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([g, q]) => `${g}:${Math.round(q)}`).join(', ') || 'нет',
  };

  // ── #3 Улучшение: детальная армия ─────────────────────────────
  const mil = nation.military ?? {};
  const myArmies = (GAME_STATE.armies ?? []).filter(a => a.nation === nationId);
  const militarySummary = {
    infantry:    mil.infantry ?? 0,
    cavalry:     mil.cavalry ?? 0,
    mercenaries: mil.mercenaries ?? 0,
    artillery:   mil.artillery ?? 0,
    ships:       mil.ships ?? 0,
    morale:      mil.morale ?? 100,
    loyalty:     mil.loyalty ?? 100,
    total_strength: (mil.infantry ?? 0) + (mil.cavalry ?? 0) * 3 + (mil.mercenaries ?? 0) * 1.5,
    // #3: позиции армий на карте
    field_armies: myArmies.map(a => ({
      id:       a.id,
      position: a.position,
      state:    a.state,
      size:     (a.units?.infantry ?? 0) + (a.units?.cavalry ?? 0) * 3,
      supply:   a.supply ?? 100,
    })),
  };

  // ── #4 Улучшение: активные войны ──────────────────────────────
  const activeWars = (mil.at_war_with ?? []).map(eid => {
    const enemy = GAME_STATE.nations[eid];
    const enemyStr = (enemy?.military?.infantry ?? 0) + (enemy?.military?.cavalry ?? 0) * 3;
    const myStr = militarySummary.total_strength;
    return {
      enemy_id:   eid,
      enemy_name: enemy?.name ?? eid,
      enemy_strength: Math.round(enemyStr),
      strength_ratio: myStr > 0 ? +(myStr / Math.max(enemyStr, 1)).toFixed(2) : 0,
      enemy_stability: enemy?.government?.stability ?? 50,
    };
  });

  // ── #5 Улучшение: внутренняя стабильность ─────────────────────
  const gov = nation.government ?? {};
  const pop = nation.population ?? {};
  const internalSummary = {
    legitimacy:    gov.legitimacy ?? 50,
    stability:     gov.stability ?? 50,
    personal_power: gov.ruler?.personal_power ?? 50,
    happiness:     pop.happiness ?? 50,
    // счастье по классам если есть
    class_satisfaction: pop.class_satisfaction
      ? Object.fromEntries(
          Object.entries(pop.class_satisfaction)
            .map(([cls, v]) => [cls, typeof v === 'object' ? Math.round(v.score ?? 50) : Math.round(v)])
        )
      : null,
    government_type: gov.type ?? 'unknown',
  };

  // ── #6 Улучшение: глобальный баланс сил ───────────────────────
  const globalPower = Object.entries(GAME_STATE.nations ?? {})
    .filter(([id]) => id !== nationId)
    .map(([id, n]) => ({
      id,
      name:     n.name,
      strength: Math.round((n.military?.infantry ?? 0) + (n.military?.cavalry ?? 0) * 3),
      regions:  (n.regions ?? []).length,
      at_war:   (n.military?.at_war_with ?? []).length > 0,
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  // ── #1 Улучшение: территориальный обзор ───────────────────────
  const myRegions = (nation.regions ?? []);
  const regionSummary = {
    count: myRegions.length,
    // агрегированные данные по регионам
    avg_fertility: myRegions.length > 0
      ? +(myRegions.reduce((s, rid) => s + (GAME_STATE.regions?.[rid]?.fertility ?? 0.7), 0) / myRegions.length).toFixed(2)
      : 0,
    total_garrison: myRegions.reduce((s, rid) => s + (GAME_STATE.regions?.[rid]?.garrison ?? 0), 0),
    coastal_count:  myRegions.filter(rid => GAME_STATE.regions?.[rid]?.type === 'coastal_city').length,
    // граничные регионы — ближайшие к врагам (упрощённо: регионы с соседями чужих наций)
    border_regions: myRegions.filter(rid => {
      const r = GAME_STATE.regions?.[rid];
      return (r?.connections ?? []).some(cid => {
        const cr = GAME_STATE.regions?.[cid];
        return cr && cr.nation && cr.nation !== nationId;
      });
    }).length,
  };

  // ── #9 Улучшение: торговые возможности ────────────────────────
  const existingTradePartners = new Set(eco.trade_routes ?? []);
  const tradeOpportunities = Object.entries(nation.relations ?? {})
    .filter(([oid, rel]) => !rel.at_war && rel.score > 0 && !existingTradePartners.has(oid))
    .map(([oid]) => GAME_STATE.nations[oid]?.name ?? oid)
    .slice(0, 3);

  // ── Список доступных действий (расширен #7) ───────────────────
  const availableActions = buildAvailableActions(nationId, nation);

  // Краткосрочная память: последние 5 решений
  const recentDecisions = (nation.recent_decisions || []).slice(-5);

  // Долгосрочный контекст из памяти нации
  const memoryContext = typeof getDecisionContext === 'function'
    ? getDecisionContext(nationId)
    : '';

  // ── #10 Улучшение: стратегическая фаза ───────────────────────
  const strategicPhase = _calcStrategicPhase(nation, militarySummary, internalSummary, activeWars);

  const prompt = PROMPTS.nationDecision(
    nationId, nation, neighborsSummary, availableActions, recentDecisions, memoryContext,
    { economy: economySummary, military: militarySummary, internal: internalSummary,
      territory: regionSummary, active_wars: activeWars, global_power: globalPower,
      trade_opportunities: tradeOpportunities, strategic_phase: strategicPhase }
  );

  const rawResponse = await callClaude(prompt.system, prompt.user, 300, model);
  const decision = parseAIResponse(rawResponse);

  if (validateNationDecision(decision)) {
    applyNationDecision(nationId, decision);

    // Сохраняем решение в краткосрочную память (последние 5 ходов)
    if (!nation.recent_decisions) nation.recent_decisions = [];
    nation.recent_decisions.push({
      turn:      GAME_STATE.turn,
      action:    decision.action,
      target:    decision.target ?? null,
      reasoning: (decision.reasoning ?? '').slice(0, 120),
    });
    if (nation.recent_decisions.length > 5) nation.recent_decisions.shift();

    // Записываем решение в долгосрочную память
    if (typeof addMemoryEvent === 'function') {
      const targetName = decision.target
        ? (GAME_STATE.nations?.[decision.target]?.name ?? decision.target)
        : null;
      const modelTag = model === CONFIG.MODEL_SONNET ? 'sonnet' : 'haiku';
      addMemoryEvent(
        nationId,
        'decision',
        `Решение: ${decision.action}${targetName ? ' → ' + targetName : ''}. ${decision.reasoning ?? ''}`,
        decision.target ? [decision.target] : [],
        modelTag
      );
    }
  }
}

// ── #10: определить стратегическую фазу ───────────────────────
function _calcStrategicPhase(nation, milSummary, internalSummary, activeWars) {
  const stability  = internalSummary.stability ?? 50;
  const legitimacy = internalSummary.legitimacy ?? 50;
  const happiness  = internalSummary.happiness ?? 50;
  const balance    = (nation.economy?.income_per_turn ?? 0) - (nation.economy?.expense_per_turn ?? 0);
  const strength   = milSummary.total_strength ?? 0;
  const atWar      = activeWars.length > 0;

  if (stability < 30 || legitimacy < 25 || happiness < 30) {
    return { phase: 'crisis', advice: 'Внутренний кризис. Приоритет: стабилизация, отказ от войн.' };
  }
  if (atWar) {
    const winning = activeWars.every(w => w.strength_ratio >= 1.2);
    return winning
      ? { phase: 'war_winning',  advice: 'Война на победном ходу. Давить врага, захватывать регионы.' }
      : { phase: 'war_losing',   advice: 'Война складывается неблагоприятно. Рассмотреть мирные переговоры.' };
  }
  if (balance < -500) {
    return { phase: 'economic_strain', advice: 'Дефицит бюджета. Сократить армию или поднять налоги.' };
  }
  if (strength > 3000 && stability > 60 && balance > 0) {
    return { phase: 'expansion', advice: 'Сильная позиция. Возможна экспансия или наступательная дипломатия.' };
  }
  if (stability < 55 || happiness < 45) {
    return { phase: 'consolidation', advice: 'Консолидация. Укрепить внутренние позиции перед активными действиями.' };
  }
  return { phase: 'steady_growth', advice: 'Стабильный рост. Расширять торговлю и армию умеренными темпами.' };
}

function buildAvailableActions(nationId, nation) {
  const actions = [];
  const mil      = nation.military ?? {};
  const eco      = nation.economy  ?? {};
  const treasury = eco.treasury ?? 0;
  const strength = (mil.infantry ?? 0) + (mil.cavalry ?? 0) * 3 + (mil.mercenaries ?? 0);
  const atWarIds = mil.at_war_with ?? [];

  // Всегда доступно
  actions.push({ action: 'wait',    description: 'Ничего не делать, накапливать ресурсы' });
  actions.push({ action: 'fortify', description: 'Укрепить позиции, поднять мораль армии' });

  // Набор войск
  if (treasury > 1000) {
    const affordable = Math.min(Math.floor(treasury / 5), 2000);
    actions.push({ action: 'recruit', description: `Набрать до ${affordable} пехоты (казна позволяет)` });
  }
  if (treasury > 5000 && (mil.mercenaries ?? 0) < 500) {
    actions.push({ action: 'recruit_mercs', description: 'Нанять наёмников (быстрее, дороже)' });
  }

  // Дипломатия с доступными нациями
  for (const [otherId, rel] of Object.entries(nation.relations ?? {})) {
    const other = GAME_STATE.nations[otherId];
    if (!other) continue;
    const otherName = other.name;

    if (!rel.at_war && rel.score > -20 && !(rel.treaties ?? []).includes('trade')) {
      actions.push({
        action: 'trade',
        target: otherId,
        description: `Торговый договор с ${otherName} (отношения: ${rel.score})`,
      });
    }
    if (!rel.at_war && rel.score > 30 && !(rel.treaties ?? []).includes('alliance')) {
      actions.push({
        action: 'diplomacy',
        target: otherId,
        description: `Улучшить отношения / союз с ${otherName}`,
      });
    }
    // #8: поиск союзников против общего врага
    if (!rel.at_war && rel.score > 0) {
      const commonEnemies = atWarIds.filter(eid => (other.military?.at_war_with ?? []).includes(eid));
      if (commonEnemies.length > 0) {
        const enemyName = GAME_STATE.nations[commonEnemies[0]]?.name ?? commonEnemies[0];
        actions.push({
          action: 'diplomacy',
          target: otherId,
          description: `Координация с ${otherName} против общего врага ${enemyName}`,
        });
      }
    }
    // Мирный договор с противниками
    if (rel.at_war && rel.score > -60) {
      actions.push({
        action: 'diplomacy',
        target: otherId,
        description: `Предложить мир ${otherName} (score: ${rel.score})`,
      });
    }
  }

  // ── #7: конкретные цели для атаки ─────────────────────────────
  const myRegions = nation.regions ?? [];
  if (strength > 500) {
    for (const rid of myRegions) {
      const r = GAME_STATE.regions?.[rid];
      if (!r) continue;
      for (const cid of (r.connections ?? [])) {
        const cr = GAME_STATE.regions?.[cid];
        if (!cr || !cr.nation || cr.nation === nationId) continue;
        const ownerRel = nation.relations?.[cr.nation];
        if (ownerRel?.at_war || (ownerRel?.score ?? 0) < -40) {
          const garrison   = cr.garrison ?? 0;
          const fortLevel  = cr.fortress_level ?? 0;
          const difficulty = garrison < strength * 0.3 ? 'лёгкая' : garrison < strength * 0.7 ? 'средняя' : 'тяжёлая';
          actions.push({
            action:  'attack',
            target:  cid,
            description: `Атаковать ${cr.name} (${cr.terrain ?? cr.type}, гарнизон: ${garrison}, форт: ${fortLevel}, сложность: ${difficulty})`,
          });
        }
      }
    }
  }

  // Строительство если есть деньги и свободные слоты
  if (treasury > 3000) {
    const hasSlot = myRegions.some(rid => {
      const r = GAME_STATE.regions?.[rid];
      return (r?.building_slots ?? []).some(s => !s.building_id || s.status === 'destroyed');
    });
    if (hasSlot) {
      actions.push({ action: 'build', description: 'Построить здание в одном из регионов' });
    }
  }

  return actions;
}

// ──────────────────────────────────────────────────────────────
// 4. ГЕНЕРАЦИЯ ПЕРСОНАЖЕЙ
// ──────────────────────────────────────────────────────────────

async function generateCharactersForNation(nationId, count = 7) {
  const nation = GAME_STATE.nations[nationId];
  const existing = nation.characters || [];

  const prompt = PROMPTS.generateCharacters(count, nationId, nation, existing);

  addEventLog('Генерирую персонажей двора через Claude...', 'ai');

  const rawResponse = await callClaude(prompt.system, prompt.user, 2500, CONFIG.MODEL_HAIKU);
  const characters = parseAIResponse(rawResponse);
  const validated = validateCharacters(characters);

  if (validated.length === 0) {
    throw new Error('AI не вернул персонажей');
  }

  // Добавляем к существующим
  nation.characters = [...existing, ...validated];
  addEventLog(`Сгенерировано ${validated.length} персонажей для ${nation.name}.`, 'character');

  renderRightPanel();
  return validated;
}

// Генерация одного нового персонажа (случайное появление)
async function generateNewCharacter(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const existing = nation.characters || [];

  const prompt = PROMPTS.generateCharacters(1, nationId, nation, existing);

  const rawResponse = await callClaude(prompt.system, prompt.user, 600, CONFIG.MODEL_HAIKU);
  const characters = parseAIResponse(rawResponse);
  const validated = validateCharacters(characters);

  if (validated.length > 0) {
    const newChar = validated[0];
    nation.characters.push(newChar);
    addEventLog(`При дворе появился новый человек: ${newChar.name} (${getRoleLabel(newChar.role)}).`, 'character');

    // Синхронизируем с SenateManager: сенаторы получают место в сенате
    if (newChar.role === 'senator' && newChar.senate_faction_id) {
      const mgr = getSenateManager(nationId);
      if (mgr) {
        // Ищем незанятое место в нужной фракции и привязываем персонажа
        const ghost = mgr.senators.find(
          s => s.faction_id === newChar.senate_faction_id && !s.materialized && !s.character_id
        );
        if (ghost) {
          ghost.character_id  = newChar.id;
          ghost.name          = newChar.name;
          ghost.materialized  = true;
          ghost.loyalty_score = newChar.loyalty ?? ghost.loyalty_score;
        } else {
          // Нет свободного места — добавляем новый призрак сверх лимита
          const extra = mgr._createGhost(newChar.senate_faction_id);
          extra.character_id = newChar.id;
          extra.name         = newChar.name;
          extra.materialized = true;
          mgr.senators.push(extra);
        }
      }
    }

    renderRightPanel();
  }
}

// ──────────────────────────────────────────────────────────────
// УТИЛИТА: getRoleLabel (дублируем здесь, т.к. claude.js загружается раньше panels.js)
// ──────────────────────────────────────────────────────────────
function getRoleLabel(role) {
  const labels = {
    senator:  'Сенатор',
    advisor:  'Советник',
    general:  'Стратег',
    priest:   'Жрец',
    merchant: 'Купец',
  };
  return labels[role] || role;
}

// ──────────────────────────────────────────────────────────────
// SENATOR OBITUARY — некролог известного сенатора
// ──────────────────────────────────────────────────────────────

// Вызывается ТОЛЬКО из SenateManager._runYearlyLifeCycle() и damage_senator()
// при смерти материализованного сенатора от болезни или заговора.
// Возвращает строку-некролог (plain text, не JSON).
async function generateSenatorObituaryViaLLM(senator, factionName, senateState) {
  const { system, user } = PROMPTS.senatorObituary(senator, factionName, senateState);
  // Некролог — очень маленький ответ, 150 токенов достаточно
  const raw = await callClaude(system, user, 150, CONFIG.MODEL_HAIKU);
  // Убираем лишние пробелы/переносы строк
  return raw.trim().replace(/\n+/g, ' ');
}

// ──────────────────────────────────────────────────────────────
// КОНСТИТУЦИОННЫЙ ХРОНИКЁР — реакция Форума на реформу
// ──────────────────────────────────────────────────────────────
// Вызывается из ConstitutionalEngine._triggerChronicle() (async, не блокирует).
// Добавляет нарратив в eventLog как 'law' запись.
async function generateConstitutionalChronicleViaLLM(ctx) {
  try {
    const { system, user } = PROMPTS.constitutionalChronicle(ctx);
    const raw = await callClaude(system, user, 250, CONFIG.MODEL_HAIKU);
    const text = raw.trim().replace(/\n+/g, ' ');
    if (text) addEventLog(`📜 Форум: ${text}`, 'law');
  } catch (err) {
    console.warn('constitutionalChronicle LLM error:', err.message);
  }
}

// ──────────────────────────────────────────────────────────────
// МАНИФЕСТ ЗАГОВОРА — LLM генерирует имя, цель и текст
// ──────────────────────────────────────────────────────────────
// Вызывается из ConspiracyEngine._generateManifest() (async, fire-and-forget).
// Возвращает { name, goal, manifesto, symbol } или null при ошибке.
async function generateConspiracyManifestViaLLM(ctx) {
  try {
    const { system, user } = PROMPTS.conspiracyManifest(ctx);
    const raw = await callClaude(system, user, 350, CONFIG.MODEL_HAIKU);
    return extractJSON(raw);
  } catch (err) {
    console.warn('conspiracyManifest LLM error:', err.message);
    // Детерминированный fallback
    return {
      name:      `Тайный Союз ${ctx.leader_clan}`,
      goal:      `Отстранить Консула и вернуть полномочия Сенату`,
      manifesto: `Мы, граждане Сиракуз, не потерпим тирании. Консул нарушил древние права. Союз ${ctx.leader_clan} встанет на защиту свободы.`,
      symbol:    '🌑',
    };
  }
}

// ──────────────────────────────────────────────────────────────
// ДИАЛОГ BLOOD_FEUD — реплика сенатора при материализации
// ──────────────────────────────────────────────────────────────
// Вызывается из materialize_senator если senator.hidden_interests содержит Blood_Feud.
// Возвращает строку (plain text) или null.
async function generateBloodFeudDialogueViaLLM(senator, clanName, victimNames, lawsAfterFeud) {
  try {
    const { system, user } = PROMPTS.bloodFeudDialogue(senator, clanName, victimNames, lawsAfterFeud);
    const raw = await callClaude(system, user, 200, CONFIG.MODEL_HAIKU);
    return raw.trim().replace(/\n+/g, ' ') || null;
  } catch (err) {
    console.warn('bloodFeudDialogue LLM error:', err.message);
    return `Ты убил наших. Мой клан помнит, Консул. Придёт время — и мы напомним тебе.`;
  }
}

// ──────────────────────────────────────────────────────────────
// LAZY MATERIALIZATION — оживление сенатора
// ──────────────────────────────────────────────────────────────

// Вызывается ТОЛЬКО из SenateManager.materialize_senator().
// Возвращает { name, traits, biography, portrait, influence }.
async function materializeSenatorViaLLM(senator, context, reason) {
  const { system, user } = PROMPTS.materializeSenator(senator, context, reason);
  const raw = await callClaude(system, user, 250, CONFIG.MODEL_HAIKU);

  const data = extractJSON(raw);
  if (!data.name || !Array.isArray(data.traits)) throw new Error('materializeSenator: missing fields');

  data.influence = Math.max(10, Math.min(100, Number(data.influence) || 50));
  return data;
}

// ──────────────────────────────────────────────────────────────
// ПРАВИТЕЛЬСТВО — 3 специализированных вызова
// ──────────────────────────────────────────────────────────────

// 1. ПАРСИНГ ПРОИЗВОЛЬНОГО ОПИСАНИЯ ПРАВИТЕЛЬСТВА
async function parseGovernmentDescription(playerInput) {
  const nation     = GAME_STATE.nations[GAME_STATE.player_nation];
  const gov        = nation.government;
  const charsSummary = (nation.characters ?? [])
    .filter(c => c.alive)
    .map(c => ({ id: c.id, name: c.name, role: c.role, portrait: c.portrait }));

  const { system, user } = PROMPTS.parseGovernment(playerInput, gov, charsSummary);

  let raw;
  try {
    raw = await callClaude(system, user, 2000, CONFIG.MODEL_SONNET);
  } catch (err) {
    console.warn('parseGovernmentDescription API error:', err);
    throw new Error('Не удалось связаться с AI. Проверьте API ключ.');
  }

  // Извлекаем JSON из ответа
  try {
    return extractJSON(raw);
  } catch (e) {
    console.warn('parseGovernmentDescription parse error. Raw response:', raw);
    throw new Error(`Ошибка разбора ответа AI: ${e.message}`);
  }
}

// 2. РЕАКЦИЯ ПЕРСОНАЖЕЙ НА СМЕНУ ФОРМЫ ПРАВЛЕНИЯ
async function getGovernmentChangeReactions(fromType, toType) {
  const nation     = GAME_STATE.nations[GAME_STATE.player_nation];
  const characters = (nation.characters ?? []).filter(c => c.alive);
  if (!characters.length) return [];

  const { system, user } = PROMPTS.governmentChangeReactions(fromType, toType, characters);

  let raw;
  try {
    raw = await callClaude(system, user, 1500, CONFIG.MODEL_HAIKU);
  } catch (err) {
    console.warn('getGovernmentChangeReactions API error:', err);
    // Fallback: детерминированные реакции
    return characters.map(c => ({
      character_id: c.id,
      reaction: c.traits.loyalty > 60 ? 'support' : c.traits.ambition > 70 ? 'oppose' : 'neutral',
      reason: 'Персонаж оценивает изменения исходя из личных интересов.',
      action: 'Наблюдает за ситуацией.',
      loyalty_delta: c.traits.loyalty > 60 ? 2 : -3,
    }));
  }

  let reactions;
  try {
    reactions = extractJSON(raw);
    // Применяем loyalty_delta
    for (const r of reactions) {
      const char = characters.find(c => c.id === r.character_id);
      if (char && typeof r.loyalty_delta === 'number') {
        char.traits.loyalty = Math.max(0, Math.min(100, char.traits.loyalty + r.loyalty_delta));
        if (!char.history) char.history = [];
        char.history.push({ turn: GAME_STATE.turn, event: `Реакция на смену правления: ${r.reaction}. "${r.reason}"` });
      }
    }
    return reactions;
  } catch {
    return [];
  }
}

// 3. ГОЛОСОВАНИЕ В КОЛЛЕГИАЛЬНОМ ОРГАНЕ (Claude пишет речи)
//    proposal: { text, law_type, faction_modifiers, threshold }
async function simulateInstitutionVote(proposalText, institutionId, calculatedEffects, proposal = {}) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const gov    = nation.government;
  const inst   = (gov.institutions ?? []).find(i => i.id === institutionId);
  if (!inst) return null;

  // Код считает голоса детерминированно
  const voteResult = calculateInstitutionVote(inst, nation);

  // Если есть SenateManager — используем его умное голосование поверх базового
  const senateMgr  = getSenateManager(GAME_STATE.player_nation);
  let narrativeCtx = null;
  if (senateMgr && proposal.law_type) {
    const senateVote = senateMgr.process_vote(proposal);
    // Обновляем глобальное настроение сената по итогам
    const moodText = senateVote.passed
      ? `Сенат поддержал ${proposal.law_type}-закон (${senateVote.margin_pct}% «за»).`
      : `Сенат отклонил ${proposal.law_type}-закон (лишь ${senateVote.margin_pct}% «за»).`;
    senateMgr.updateGlobalState(moodText);
    narrativeCtx = senateVote.narrative_context;
  }

  // Для LLM берём только 3 топ-спикера (экономия токенов)
  const members = senateMgr
    ? senateMgr._getTopSpeakers(3).map(s => ({
        id:     null,
        name:   s.name,
        traits: s.traits,
        wants:  [],
        fears:  [],
      }))
    : (nation.characters ?? [])
        .filter(c => c.alive)
        .map(c => ({ id: c.id, name: c.name, traits: c.traits, wants: c.wants, fears: c.fears }));

  const { system, user } = PROMPTS.institutionVote(
    proposalText, inst, members, calculatedEffects, voteResult, narrativeCtx
  );

  let raw;
  try {
    raw = await callClaude(system, user, 1000, CONFIG.MODEL_SONNET);
  } catch (err) {
    console.warn('simulateInstitutionVote API error:', err);
    return { ...voteResult, key_speeches: [], amendments_proposed: [], unexpected_events: [] };
  }

  let claudeResult;
  try {
    claudeResult = extractJSON(raw);
    // Код'овые голоса — приоритет над Claude для чисел
    return {
      ...voteResult,
      key_speeches:      claudeResult.key_speeches      ?? [],
      amendments_proposed: claudeResult.amendments_proposed ?? [],
      unexpected_events: claudeResult.unexpected_events ?? [],
    };
  } catch {
    return { ...voteResult, key_speeches: [], amendments_proposed: [], unexpected_events: [] };
  }
}

// ──────────────────────────────────────────────────────────────
// ДЕБАТЫ СЕНАТА — AI генерирует живые, нешаблонные речи
// ──────────────────────────────────────────────────────────────

// Генерирует динамические речи сенаторов для дебатного зала.
// speakers — массив материализованных сенаторов из SenateManager.getMaterialized()
// Возвращает: { opening_cry, speaker_lines[], radicalism, dramatic_event } или null при ошибке
async function generateSenateDebateViaLLM(law, speakers, playerSpeech, senateCtx) {
  if (!CONFIG.API_KEY || !speakers.length) return null;
  try {
    const { system, user } = PROMPTS.senateDebate(law, speakers, playerSpeech, senateCtx ?? {});
    const raw = await callClaude(system, user, 900, CONFIG.MODEL_HAIKU);
    const parsed = extractJSON(raw);
    // Базовая валидация
    if (!Array.isArray(parsed.speaker_lines)) return null;
    return parsed;
  } catch (err) {
    console.warn('generateSenateDebateViaLLM error:', err.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// АНАЛИЗ ПРИНЯТОГО ЗАКОНА — AI извлекает игровые изменения
// ──────────────────────────────────────────────────────────────

// После принятия закона — анализирует текст и возвращает список
// конкретных изменений игровой механики.
// Возвращает: { changes[], narrative } или null при ошибке
async function analyzeLawEffectsViaLLM(law, nationId) {
  if (!CONFIG.GROQ_API_KEY && !CONFIG.API_KEY) return null;
  try {
    const nation = GAME_STATE.nations[nationId];
    const arch = nation?.senate_config?.state_architecture ?? null;
    const { system, user } = PROMPTS.analyzeLawEffects(law, nation, arch);
    const raw = await callClaude(system, user, 600, CONFIG.MODEL_HAIKU);
    const parsed = extractJSON(raw);
    if (!Array.isArray(parsed.changes)) return null;
    return parsed;
  } catch (err) {
    console.warn('analyzeLawEffectsViaLLM error:', err.message);
    return null;
  }
}

// Применяет массив изменений из analyzeLawEffectsViaLLM к GAME_STATE.
// Безопасно: только допустимые пути, с проверкой типов и диапазонов.
function applyLawGameChanges(changes, nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !Array.isArray(changes)) return [];

  const arch = nation.senate_config?.state_architecture;
  const applied = [];

  for (const ch of changes) {
    try {
      const { path, op, value } = ch;
      if (typeof path !== 'string') continue;

      // ── senate_config.state_architecture.* ────────────────
      if (path.startsWith('senate_config.state_architecture.') && arch) {
        const field = path.split('.')[2];
        const allowed = ['senate_capacity','consul_term','consul_powers','voting_system','veto_rights','election_cycle'];
        if (!allowed.includes(field)) continue;

        const prev = arch[field];
        let next = value;

        // Диапазоны и типы
        if (field === 'senate_capacity') next = Math.max(50, Math.min(600, parseInt(value) || prev));
        else if (field === 'consul_term')   next = Math.max(1, Math.min(10, parseInt(value) || prev));
        else if (field === 'election_cycle') next = Math.max(1, Math.min(10, parseInt(value) || prev));
        else if (field === 'consul_powers')  next = ['Limited','Standard','Dictatorial'].includes(value) ? value : prev;
        else if (field === 'voting_system')  next = ['Plutocracy','Meritocracy','Democracy'].includes(value) ? value : prev;
        else if (field === 'veto_rights')    next = Boolean(value);

        if (next === prev) continue;
        arch[field] = next;
        // Синхронизируем senate_config.total_seats если менялась вместимость
        if (field === 'senate_capacity') nation.senate_config.total_seats = next;
        applied.push({ path, prev, next });
        continue;
      }

      // ── senate_config.factions.*.seats ────────────────────
      const factionMatch = path.match(/^senate_config\.factions\.(\w+)\.seats$/);
      if (factionMatch && nation.senate_config?.factions) {
        const fid = factionMatch[1];
        const faction = nation.senate_config.factions.find(f => f.id === fid);
        if (!faction) continue;
        const prev = faction.seats;
        const next = Math.max(1, Math.min(300, parseInt(value) || prev));
        if (next === prev) continue;
        faction.seats = next;
        applied.push({ path, prev, next });
        continue;
      }

      // ── economy.tax_rate ──────────────────────────────────
      if (path === 'economy.tax_rate' && nation.economy) {
        const prev = nation.economy.tax_rate;
        const next = Math.max(0.05, Math.min(0.35, parseFloat(op === 'add' ? prev + value : value) || prev));
        if (Math.abs(next - prev) < 0.001) continue;
        nation.economy.tax_rate = Math.round(next * 1000) / 1000;
        applied.push({ path, prev, next: nation.economy.tax_rate });
        continue;
      }

      // ── economy.treasury (op: add) ────────────────────────
      if (path === 'economy.treasury' && nation.economy && op === 'add') {
        const delta = Math.max(-50000, Math.min(50000, parseInt(value) || 0));
        if (!delta) continue;
        const prev = Math.round(nation.economy.treasury);
        nation.economy.treasury += delta;
        applied.push({ path, prev, next: Math.round(nation.economy.treasury), delta });
        continue;
      }

      // ── military.infantry (op: add) ───────────────────────
      if (path === 'military.infantry' && nation.military && op === 'add') {
        const delta = Math.max(-5000, Math.min(5000, parseInt(value) || 0));
        if (!delta) continue;
        const prev = nation.military.infantry;
        nation.military.infantry = Math.max(0, prev + delta);
        applied.push({ path, prev, next: nation.military.infantry, delta });
        continue;
      }

      // ── population.happiness (op: add) ───────────────────
      if (path === 'population.happiness' && nation.population && op === 'add') {
        const delta = Math.max(-30, Math.min(30, parseInt(value) || 0));
        if (!delta) continue;
        const prev = nation.population.happiness;
        nation.population.happiness = Math.max(0, Math.min(100, prev + delta));
        applied.push({ path, prev, next: nation.population.happiness, delta });
        continue;
      }

      // ── government.legitimacy (op: add) ──────────────────
      if (path === 'government.legitimacy' && nation.government && op === 'add') {
        const delta = Math.max(-20, Math.min(20, parseInt(value) || 0));
        if (!delta) continue;
        const prev = nation.government.legitimacy;
        nation.government.legitimacy = Math.max(0, Math.min(100, prev + delta));
        applied.push({ path, prev, next: nation.government.legitimacy, delta });
        continue;
      }
    } catch (e) {
      console.warn('applyLawGameChanges: skip', ch, e.message);
    }
  }

  return applied;
}
