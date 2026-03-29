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

// ── Ollama — основной AI для решений наций ────────────────────────────
async function _callOllama(system, user, maxTokens = 1024) {
  const url   = CONFIG.OLLAMA_URL   || 'http://localhost:11434/v1/chat/completions';
  const model = CONFIG.OLLAMA_MODEL || 'phi4-mini';

  const wantsJson = user.includes('"action"') || user.includes('верни JSON') ||
                    user.includes('Верни JSON') || system.includes('JSON');

  const body = {
    model,
    max_tokens: maxTokens,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    ...(wantsJson && { response_format: { type: 'json_object' } }),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000); // 5 мин для CPU

  let response;
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Ollama timeout (5min)');
    throw new Error(`Ollama недоступен. Запусти: bash start_llm.sh (${err.message})`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Ollama ошибка ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Пустой ответ от Ollama');
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

// ── Groq API (OpenAI-совместимый) — Llama-3 70B для военного AI ──────
async function _callGroq(system, user, maxTokens) {
  if (!CONFIG.GROQ_API_KEY) {
    throw new Error('Groq API ключ не установлен (CONFIG.GROQ_API_KEY)');
  }

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(CONFIG.GROQ_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL_WAR_AI,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Groq timeout (30s)');
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Groq API ошибка ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Пустой ответ от Groq');
  return text;
}

// ── Единая точка входа: маршрутизация по модели ───────────────────────
// MODEL_HAIKU  (phi4-mini)        → Ollama   (фоновые нации)
// MODEL_WAR_AI (llama-3.3-70b)    → Groq     (война с игроком)
// MODEL_SONNET (claude-sonnet-4-6) → Anthropic (диалоги с игроком)
async function callClaude(system, user, maxTokens = 1024, model = CONFIG.MODEL_HAIKU) {
  if (model && model.startsWith('claude-')) {
    return _callAnthropic(system, user, maxTokens, model);
  }
  return _callOllama(system, user, maxTokens);
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

// ── Батч-решения: N наций → 1 Groq запрос ─────────────────────────────
// Возвращает Map<nationId, decision> для всех наций в батче.
// Нации у которых LLM не вернул решение получат fallback снаружи.
async function getAIBatchDecisions(nationIds, model = CONFIG.MODEL_HAIKU) {
  if (!nationIds.length) return new Map();

  // ── Компактный блок нации (оптимизирован для 3B модели) ──────────────
  const nationBlocks = nationIds.map(id => {
    const n   = GAME_STATE.nations[id];
    if (!n) return null;
    const mil = n.military   ?? {};
    const eco = n.economy    ?? {};
    const gov = n.government ?? {};

    const str  = (mil.infantry ?? 0) + (mil.cavalry ?? 0) * 3 + (mil.mercenaries ?? 0);
    const bal  = Math.round((eco.income_per_turn ?? 0) - (eco.expense_per_turn ?? 0));
    const wars = (mil.at_war_with ?? []).map(eid => GAME_STATE.nations[eid]?.name ?? eid);

    // Цели атаки (соседние вражеские регионы — не более 2)
    const myRegions = (n.regions ?? []).slice(0, 4);
    const atkTargets = [];
    outer: for (const rid of myRegions) {
      for (const cid of (GAME_STATE.regions?.[rid]?.connections ?? []).slice(0, 4)) {
        const cr = GAME_STATE.regions?.[cid];
        if (!cr || !cr.nation || cr.nation === id) continue;
        const rel = n.relations?.[cr.nation];
        if (rel?.at_war || (rel?.score ?? 0) < -30) {
          const ease = (cr.garrison ?? 0) < str * 0.4 ? 'easy' : 'hard';
          atkTargets.push(`${cid}(${ease})`);
          if (atkTargets.length >= 2) break outer;
        }
      }
    }

    // Доступные здания (топ-2)
    const builtIds  = new Set(myRegions.flatMap(rid => (GAME_STATE.regions?.[rid]?.building_slots ?? []).map(s => s.building_id)));
    const PRIO_BLDS = ['barracks','granary','market','road','temple','stables','workshop','forge'];
    const availBlds = PRIO_BLDS.filter(b => !builtIds.has(b)
      && (typeof BUILDINGS === 'undefined' || BUILDINGS[b]?.nation_buildable !== false)).slice(0, 2);
    const bldRegion = myRegions.find(rid => !(GAME_STATE.regions?.[rid]?.construction_queue ?? []).length) ?? myRegions[0];

    // Враждебные без войны (для declare_war)
    const hostile = Object.entries(n.relations ?? {})
      .filter(([, r]) => !r.at_war && (r.score ?? 0) < -30).map(([oid]) => oid).slice(0, 1);

    // Первая армия
    const army = (GAME_STATE.armies ?? []).find(a => a.nation === id && a.state !== 'disbanded');
    const armyStr = army ? `${army.id}@${army.position}` : '';

    // Последнее авто-решение
    const lastOU = (n.memory?.events ?? []).filter(e => e.type === 'decision').slice(-1)[0];
    const ouStr  = lastOU ? `prev:[${lastOU.text.slice(0, 40)}]` : '';

    // Одна строка на нацию
    const parts = [
      `[${id}]${n.name}`,
      `str:${Math.round(str)}`,
      `gold:${Math.round(eco.treasury ?? 0)}`,
      `bal:${bal >= 0 ? '+' : ''}${bal}`,
      `stab:${gov.stability ?? 50}`,
      wars.length   ? `WAR:[${wars.join(',')}]`       : '',
      atkTargets.length ? `atk:[${atkTargets.join(',')}]` : '',
      hostile.length    ? `hostile:[${hostile[0]}]`       : '',
      availBlds.length  ? `bld:[${availBlds.join(',')}]@${bldRegion ?? ''}` : '',
      armyStr           ? `army:${armyStr}`                : '',
      ouStr,
    ].filter(Boolean).join(' ');

    return parts;
  }).filter(Boolean).join('\n');

  // ── Системный промпт: короткий и чёткий для 3B модели ─────────────
  const system = `You are a strategy AI for an ancient world game. Choose ONE action per nation.
Return ONLY a JSON array, no extra text.
Format: [{"id":"...","action":"...","target":"nation_or_region_id_or_null","building":"building_id_or_null","region":"region_id_or_null","army_id":"army_id_or_null","tactic":"aggressive|defensive|standard|null","tax_commoners":0.0-0.3_or_null,"tax_aristocrats":0.0-0.2_or_null}]
Actions: wait recruit recruit_mercs fortify trade diplomacy form_alliance attack declare_war seek_peace armistice build set_taxes move_army
Rules:
- attack/move_army: target=region_id from atk[], army_id from army:
- declare_war: target=nation_id from hostile[]
- seek_peace/armistice: target=nation_id from WAR[]
- build: building from bld[], region from bld[]@ field
- set_taxes: tax_commoners 0.05-0.28, tax_aristocrats 0.02-0.18`;

  const user = `Turn ${GAME_STATE.turn ?? 0}:\n${nationBlocks}\nReturn JSON array.`;

  // ~80 токенов на нацию в ответе достаточно для компактного JSON
  const responseTokens = Math.min(1200, Math.max(300, nationIds.length * 80));
  const raw = await _callOllama(system, user, responseTokens);

  // Парсим ответ
  const result = new Map();
  try {
    const parsed = extractJSON(raw);
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.decisions) ? parsed.decisions : []);
    for (const item of arr) {
      if (item?.id && item?.action) {
        result.set(item.id, {
          action:         item.action,
          target:         item.target         ?? null,
          building:       item.building       ?? null,
          region:         item.region         ?? null,
          army_id:        item.army_id        ?? null,
          tactic:         item.tactic         ?? null,
          tax_commoners:  item.tax_commoners  ?? null,
          tax_aristocrats:item.tax_aristocrats ?? null,
          tax_clergy:     item.tax_clergy     ?? null,
          reasoning:      item.reasoning      ?? '',
        });
      }
    }
  } catch (e) {
    console.warn('[batch] Ошибка парсинга батч-ответа:', e.message);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════
// ОДИНОЧНЫЙ ЗАПРОС — стратегический советник для 1 нации
//
// Архитектура «JS думает, модель выбирает»:
//   1. JS вычисляет стратегическую фазу и рекомендованные действия
//   2. Модель видит только валидные ID армий и незанятые здания
//   3. Цепные реакции вычисляются заранее («если атакуешь X — Y вступит»)
//   4. Цель нации (_ai_goal) сохраняется между ходами
// ══════════════════════════════════════════════════════════════════════

// ── Вычислить стратегическую фазу нации ───────────────────────────────
function _computeNationPhase(n, str, playerStr, playerNearby, atWar) {
  const treasury  = n.economy?.treasury    ?? 0;
  const bal       = (n.economy?.income_per_turn ?? 0) - (n.economy?.expense_per_turn ?? 0);
  const happiness = n.population?.happiness ?? 50;
  const stability = n.government?.stability ?? 50;
  const warCount  = atWar.length;

  if (stability < 30 || happiness < 25) {
    return {
      phase: 'CRISIS',
      advice: 'Internal crisis. Focus on stability. Avoid new wars.',
      recommended: ['set_taxes','wait','fortify'],
      avoid: ['declare_war','attack','recruit'],
    };
  }
  if (warCount > 0) {
    const enemies = atWar.map(eid => {
      const en = GAME_STATE.nations[eid];
      const es = (en?.military?.infantry ?? 0) + (en?.military?.cavalry ?? 0) * 3;
      return es;
    });
    const totalEnemyStr = enemies.reduce((a, b) => a + b, 0);
    if (str > totalEnemyStr * 1.3) {
      return {
        phase: 'WAR_WINNING',
        advice: 'You are stronger than your enemies. Press the attack.',
        recommended: ['attack','move_army','recruit'],
        avoid: ['seek_peace','trade'],
      };
    }
    if (str < totalEnemyStr * 0.7) {
      return {
        phase: 'WAR_LOSING',
        advice: 'You are losing. Seek peace or armistice before army collapses.',
        recommended: ['seek_peace','armistice','recruit_mercs','fortify'],
        avoid: ['declare_war','build'],
      };
    }
    return {
      phase: 'WAR_STALEMATE',
      advice: 'War is balanced. Reinforce or seek armistice to recover.',
      recommended: ['recruit','fortify','armistice','move_army'],
      avoid: ['trade','build'],
    };
  }
  if (playerNearby && playerStr > str * 0.8) {
    return {
      phase: 'DEFENSIVE',
      advice: 'Player army near your border. Defend and seek allies.',
      recommended: ['fortify','recruit','form_alliance','diplomacy'],
      avoid: ['declare_war'],
    };
  }
  if (treasury < 500 || bal < -100) {
    return {
      phase: 'ECONOMIC',
      advice: 'Treasury is low. Fix economy before military expansion.',
      recommended: ['set_taxes','build','trade'],
      avoid: ['recruit','declare_war','recruit_mercs'],
    };
  }
  if (treasury > 5000 && str > 2000) {
    return {
      phase: 'EXPANSION',
      advice: 'Strong position. Good time to expand — build, recruit, or declare war on weak neighbors.',
      recommended: ['declare_war','build','recruit','form_alliance'],
      avoid: ['wait'],
    };
  }
  return {
    phase: 'BUILDUP',
    advice: 'Stable but not yet dominant. Build economy and military.',
    recommended: ['build','recruit','trade','diplomacy'],
    avoid: ['declare_war'],
  };
}

// ── Вычислить цепные реакции (кто вступит в войну если атаковать цель) ─
function _computeChainReactions(nationId, targetId) {
  if (!targetId || !GAME_STATE.nations[targetId]) return [];
  const chains = [];
  for (const [oid, on] of Object.entries(GAME_STATE.nations)) {
    if (oid === nationId || oid === targetId || on.is_eliminated) continue;
    const relWithTarget = on.relations?.[targetId];
    if (!relWithTarget) continue;
    const hasDefAlliance = (relWithTarget.treaties ?? []).some(
      t => ['defensive_alliance','military_alliance'].includes(t)
    );
    const veryFriendly = (relWithTarget.score ?? 0) > 60;
    if (hasDefAlliance || veryFriendly) {
      const os = (on.military?.infantry ?? 0) + (on.military?.cavalry ?? 0) * 3;
      chains.push(`${on.name}(str:${Math.round(os)},${hasDefAlliance ? 'ally' : 'friend'})`);
    }
  }
  return chains.slice(0, 3);
}

// ── #1 Личность нации — поведенческие инструкции по типу нации ────────
const _PERSONALITY_TRAITS = {
  expansionist: {
    style:  'EXPANSIONIST empire — you seek to grow by conquest and colonisation.',
    prefer: 'declare_war on weak neighbors, move_army to borders, recruit before striking',
    avoid:  'staying idle when you have military advantage, excessive diplomacy',
  },
  merchant: {
    style:  'MERCHANT state — wealth and trade are your power.',
    prefer: 'trade agreements, building markets/roads, bribing rather than fighting',
    avoid:  'costly land wars, high military upkeep, neglecting treasury',
  },
  aggressive: {
    style:  'AGGRESSIVE warrior nation — war is your answer to every problem.',
    prefer: 'attack first, heavy recruitment, forge/stables before barracks',
    avoid:  'defensive postures when you can strike, long peace treaties',
  },
  diplomatic: {
    style:  'DIPLOMATIC city-state — alliances and clever politics are your strength.',
    prefer: 'form_alliance, diplomacy actions, treaties, balancing against the strongest',
    avoid:  'starting wars without allies, economic neglect',
  },
  defensive: {
    style:  'DEFENSIVE nation — you protect your homeland and wait for enemies to exhaust.',
    prefer: 'fortify, build walls, recruit only when threatened, seek_peace to end costly wars',
    avoid:  'expensive offensive wars, overextension',
  },
  survival: {
    style:  'SURVIVAL tribe — every resource matters; you fight only to survive.',
    prefer: 'granary/farm before anything else, armistice when losing, seek_peace early',
    avoid:  'declaring war, recruiting beyond what you can afford, ignoring food',
  },
};

const _PRIORITY_NOTES = {
  military: 'Military priority: spend surplus on recruitment first, then buildings.',
  trade:    'Trade priority: always maintain at least one active trade agreement.',
  survival: 'Survival priority: keep treasury positive above all else.',
};

function _buildPersonalityBlock(nation) {
  const personality = nation.ai_personality ?? 'defensive';
  const priority    = nation.ai_priority    ?? 'survival';
  const traits = _PERSONALITY_TRAITS[personality] ?? _PERSONALITY_TRAITS.defensive;
  const prioNote = _PRIORITY_NOTES[priority] ?? '';
  return `## Nation Character
You are ${nation.name} — a ${traits.style}
Preferred actions: ${traits.prefer}.
Avoid: ${traits.avoid}.
${prioNote}`;
}

async function getAISingleDecision(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return null;

  const mil = n.military   ?? {};
  const eco = n.economy    ?? {};
  const gov = n.government ?? {};
  const pop = n.population ?? {};

  const str      = (mil.infantry ?? 0) + (mil.cavalry ?? 0) * 3 + (mil.mercenaries ?? 0);
  const treasury = Math.round(eco.treasury ?? 0);
  const income   = Math.round(eco.income_per_turn  ?? 0);
  const expense  = Math.round(eco.expense_per_turn ?? 0);
  const bal      = income - expense;
  const atWar    = (mil.at_war_with ?? []);
  const currentTurn = GAME_STATE.turn ?? 0;

  // ── [FIX] Армии — только реальные ID + валидные регионы движения ───
  const myArmies = (GAME_STATE.armies ?? [])
    .filter(a => a.nation === nationId && a.state !== 'disbanded');

  const armyLines = myArmies.map(a => {
    // Валидные соседние регионы для движения
    const validMoveTargets = (GAME_STATE.regions?.[a.position]?.connections ?? [])
      .slice(0, 4)
      .map(cid => {
        const cr = GAME_STATE.regions?.[cid];
        if (!cr) return null;
        const owner = cr.nation ? (GAME_STATE.nations[cr.nation]?.name ?? cr.nation) : 'unowned';
        return `${cid}(${owner})`;
      })
      .filter(Boolean)
      .join(', ');
    return `  id:${a.id} @ ${a.position}(${a.state}) — ${a.units?.infantry ?? 0}inf ${a.units?.cavalry ?? 0}cav\n    valid_move_targets: ${validMoveTargets || 'none'}`;
  }).join('\n') || '  (no field army — use recruit/raise_army first)';

  // ── [FIX] Здания — явно показываем что уже есть, предлагаем только новое ─
  const PRIO_BLDS = ['barracks','granary','market','road','temple','stables','workshop','forge','farm','wall'];
  const buildLines = (n.regions ?? []).slice(0, 4).map(rid => {
    const region = GAME_STATE.regions?.[rid];
    if (!region) return null;
    const builtIds   = (region.building_slots ?? []).map(s => s.building_id);
    const inQueue    = (region.construction_queue ?? []).map(q => q.building_id ?? q);
    const takenIds   = new Set([...builtIds, ...inQueue]);
    const freeSlots  = Math.max(0, 3 - builtIds.length);
    if (freeSlots === 0 || inQueue.length >= 2) return null;
    const avail = PRIO_BLDS
      .filter(b => !takenIds.has(b) && (typeof BUILDINGS === 'undefined' || BUILDINGS[b]?.nation_buildable !== false))
      .slice(0, 3)
      .map(b => `${b}(${BUILDINGS?.[b]?.cost ?? '?'}g)`);
    if (!avail.length) return null;
    return `  region:${rid} | free_slots:${freeSlots} | already_built:[${builtIds.join(',')||'none'}]\n    can_build: ${avail.join(', ')}`;
  }).filter(Boolean).join('\n') || '  (no free building slots)';

  // ── #3 Военная разведка — приблизительные оценки вражеских сил ──────
  // Чем меньше торговли/дипломатии — тем хуже разведка
  function _scoutEstimate(exactStr, relScore) {
    const intel = relScore ?? 0;
    if (intel > 40) return `~${Math.round(exactStr)}`;         // хорошие отношения — точная оценка
    if (intel > 0)  return `~${Math.round(exactStr * (0.8 + Math.random() * 0.4))}`; // ±20%
    return exactStr > 5000 ? 'massive' : exactStr > 2000 ? 'large' : exactStr > 800 ? 'medium' : 'small'; // враги — только категория
  }

  // ── Дипломатия — топ 8 по важности ───────────────────────────────
  const relLines = Object.entries(n.relations ?? {})
    .map(([oid, r]) => {
      const on = GAME_STATE.nations[oid];
      if (!on || on.is_eliminated) return null;
      const oStr     = (on.military?.infantry ?? 0) + (on.military?.cavalry ?? 0) * 3;
      const power    = oStr > str * 1.3 ? 'STRONGER' : oStr < str * 0.7 ? 'weaker' : 'equal';
      const treaties = (r.treaties ?? []).join(',') || 'none';
      const war      = r.at_war ? ' ⚔AT_WAR' : '';
      const scoutStr = _scoutEstimate(oStr, r.score);
      return { score: Math.abs(r.score ?? 0), line:
        `  id:${oid.padEnd(18)} ${on.name.padEnd(16)} score:${(r.score ?? 0) >= 0 ? '+' : ''}${r.score ?? 0}  treaties:${treaties}  str:${scoutStr}(${power})${war}` };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(x => x.line)
    .join('\n');

  // ── Цели атаки (только при войне или враждебных) ───────────────────
  const atkTargets = [];
  outer: for (const rid of (n.regions ?? []).slice(0, 5)) {
    for (const cid of (GAME_STATE.regions?.[rid]?.connections ?? []).slice(0, 5)) {
      const cr = GAME_STATE.regions?.[cid];
      if (!cr || !cr.nation || cr.nation === nationId) continue;
      const rel = n.relations?.[cr.nation];
      if (rel?.at_war || (rel?.score ?? 0) < -25) {
        const ease    = (cr.garrison ?? 0) < str * 0.4 ? 'easy' : 'hard';
        const chains  = _computeChainReactions(nationId, cr.nation);
        const warning = chains.length ? ` ⚠chain:${chains.join('+')}` : '';
        atkTargets.push(`  region:${cid} owner:${GAME_STATE.nations[cr.nation]?.name ?? cr.nation}(${ease})${warning}`);
        if (atkTargets.length >= 3) break outer;
      }
    }
  }

  // ── [FIX] Цепные реакции для declare_war ──────────────────────────
  const warTargetLines = Object.entries(n.relations ?? {})
    .filter(([, r]) => !r.at_war && (r.score ?? 0) < -30)
    .slice(0, 3)
    .map(([oid]) => {
      const on     = GAME_STATE.nations[oid];
      const os     = (on?.military?.infantry ?? 0) + (on?.military?.cavalry ?? 0) * 3;
      const chains = _computeChainReactions(nationId, oid);
      const risk   = chains.length ? ` ⚠ IF YOU ATTACK: ${chains.join(', ')} may join against you` : ' (no known allies)';
      return `  id:${oid} ${on?.name ?? oid} str:${Math.round(os)}${risk}`;
    })
    .join('\n') || '  none';

  // ── Блок игрока ───────────────────────────────────────────────────
  const playerNationId = GAME_STATE.player_nation ?? 'syracuse';
  const pn = GAME_STATE.nations[playerNationId];
  let playerBlock = '';
  let playerStr = 0;
  let playerNearby = false;
  if (pn && playerNationId !== nationId) {
    const pMil  = pn.military ?? {};
    const pEco  = pn.economy  ?? {};
    playerStr   = (pMil.infantry ?? 0) + (pMil.cavalry ?? 0) * 3 + (pMil.mercenaries ?? 0);
    const relWithPlayer = n.relations?.[playerNationId];
    const pScore    = relWithPlayer?.score ?? 0;
    const pTreaties = (relWithPlayer?.treaties ?? []).join(',') || 'none';
    const pAtWar    = relWithPlayer?.at_war ? '⚔ AT WAR WITH YOU' : 'not at war with you';
    const pPower    = playerStr > str * 1.3 ? 'STRONGER than you' : playerStr < str * 0.7 ? 'weaker than you' : 'equal strength';

    const myRegionSet = new Set(n.regions ?? []);
    const playerArmiesNearby = (GAME_STATE.armies ?? [])
      .filter(a => a.nation === playerNationId && a.state !== 'disbanded')
      .filter(a => {
        const neighbors = GAME_STATE.regions?.[a.position]?.connections ?? [];
        return myRegionSet.has(a.position) || neighbors.some(c => myRegionSet.has(c));
      });
    playerNearby = playerArmiesNearby.length > 0;
    const playerArmyStr = playerArmiesNearby
      .map(a => `  id:${a.id} @ ${a.position} — ${a.units?.infantry ?? 0}inf+${a.units?.cavalry ?? 0}cav`)
      .join('\n');

    // Цепные реакции если атаковать игрока
    const playerChains = _computeChainReactions(nationId, playerNationId);
    const playerChainWarn = playerChains.length
      ? `  ⚠ IF YOU ATTACK PLAYER: ${playerChains.join(', ')} may join against you`
      : '';

    const playerName = pn.name ?? playerNationId;
    const recentPlayerEvents = (GAME_STATE.events_log ?? [])
      .filter(e => (currentTurn - (e.turn ?? 0)) <= 5
        && (e.type === 'military' || e.type === 'diplomacy')
        && e.message?.includes(playerName))
      .slice(0, 4)
      .map(e => `  Turn ${e.turn}: ${e.message}`)
      .join('\n');

    playerBlock = `
## Player Nation: ${playerName} (id:${playerNationId})
Treasury: ${Math.round(pEco.treasury ?? 0)}g | Army: ${Math.round(playerStr)} (${pMil.infantry ?? 0}inf+${pMil.cavalry ?? 0}cav) | ${pPower}
Relations: score:${pScore >= 0 ? '+' : ''}${pScore}  treaties:${pTreaties}  ${pAtWar}
Player at war with: ${(pMil.at_war_with ?? []).map(id => GAME_STATE.nations[id]?.name ?? id).join(', ') || 'nobody'}
${playerNearby ? `⚠ PLAYER ARMIES AT YOUR BORDER:\n${playerArmyStr}` : 'No player armies near your border'}
${playerChainWarn}
${recentPlayerEvents ? `Recent player actions:\n${recentPlayerEvents}` : ''}`;
  }

  // ── #1 Личность нации ─────────────────────────────────────────────
  const personalityBlock = _buildPersonalityBlock(n);

  // ── #5 Голод/кризис поставок ─────────────────────────────────────
  const happiness  = pop.happiness  ?? 50;
  const stability  = gov.stability  ?? 50;
  const food       = eco.food_supply ?? eco.food ?? null;
  let supplyWarning = '';
  if (food !== null && food < 100) {
    supplyWarning = `\n⚠ FOOD SHORTAGE: supply=${food} — build granary/farm or population will revolt!`;
  } else if (happiness < 30) {
    supplyWarning = `\n⚠ POPULATION UNREST: happiness=${happiness} — tax cuts or entertainment buildings needed.`;
  } else if (happiness < 45 || stability < 35) {
    supplyWarning = `\n⚠ LOW MORALE: happiness=${happiness} stability=${stability} — address before expanding.`;
  }

  // ── #2 Экономический прогноз — 3-ходовой прогноз казны ───────────
  const t1 = treasury + bal;
  const t2 = t1 + bal;
  const t3 = t2 + bal;
  const bankruptIn = bal < 0 ? Math.max(0, Math.floor(treasury / Math.abs(bal))) : null;
  const econForecast = bal >= 0
    ? `Forecast: +${bal}/t → T+1:${t1}g T+2:${t2}g T+3:${t3}g (growing)`
    : `⚠ DEFICIT ${bal}/t → T+1:${t1}g T+2:${t2}g T+3:${t3}g${bankruptIn !== null ? ` — BANKRUPT in ~${bankruptIn} turns!` : ''}`;


  // ── #14 Пиратство и торговые маршруты ────────────────────────────────
  const tradePartners = Object.entries(n.relations ?? {})
    .filter(([, r]) => (r.treaties ?? []).some(t => t.includes('trade')))
    .map(([oid]) => oid);
  const disrupted = tradePartners.filter(oid => {
    const r = n.relations?.[oid];
    return r?.at_war || (r?.score ?? 0) < -10;
  });
  let tradeNote = '';
  if (disrupted.length > 0) {
    const names = disrupted.map(oid => GAME_STATE.nations[oid]?.name ?? oid).join(', ');
    tradeNote = `\n⚠ TRADE DISRUPTED: active routes with ${names} at risk — sign armistice or find new partners`;
  } else if (tradePartners.length === 0 && income < expense * 1.2) {
    tradeNote = '\nNo trade agreements — seek_trade with neighbors to boost income';
  }

  // ── #13 Сезонность — зима/лето стратегические модификаторы ──────────
  const seasonTurn = currentTurn % 4; // 0=spring,1=summer,2=autumn,3=winter
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const SEASON_ADVICE = [
    'Spring: good time to begin campaigns — armies march well, harvests approaching.',
    'Summer: peak campaign season — maximise military operations.',
    'Autumn: harvest season — build granaries, gather resources before winter.',
    'Winter: harsh conditions — avoid long marches, focus on economy and diplomacy.',
  ];
  const season     = SEASONS[seasonTurn];
  const seasonNote = SEASON_ADVICE[seasonTurn];

  // ── #12 Истощение армии — % потерь от пиковой силы ──────────────────
  const peakStr  = mil._peak_strength ?? str;
  // Запоминаем пиковую силу для будущих сравнений
  if (str > peakStr) mil._peak_strength = str;
  const lossPercent = peakStr > 0 ? Math.round((1 - str / peakStr) * 100) : 0;
  let armyExhaustionNote = '';
  if (lossPercent >= 50) {
    armyExhaustionNote = `\n⚠ ARMY EXHAUSTED: lost ${lossPercent}% of peak strength — recruit before engaging or seek armistice`;
  } else if (lossPercent >= 25) {
    armyExhaustionNote = `\n⚠ ATTRITION: lost ${lossPercent}% of peak strength — consider recruiting to reinforce`;
  }

  // ── #11 Реакция на предательство — детекция неожиданного нападения ──
  const betrayalWarnings = [];
  for (const eid of atWar) {
    const rel = n.relations?.[eid];
    const prevScore = rel?.score ?? 0;
    // Считаем предательством: были в союзе или score > 30, а теперь война
    const hadTreaty = (rel?.treaties ?? []).length > 0;
    if (prevScore > 30 || hadTreaty) {
      const en = GAME_STATE.nations[eid];
      betrayalWarnings.push(`⚠ BETRAYAL: ${en?.name ?? eid} attacked despite ${hadTreaty ? 'treaty' : `score:${prevScore}`} — punish by refusing any peace for 5+ turns or seek revenge`);
    }
  }
  const betrayalBlock = betrayalWarnings.length ? '\n' + betrayalWarnings.join('\n') : '';

  // ── #10 Приоритет регионов — лучшая цель для захвата ────────────────
  let bestConquestTarget = null;
  let bestConquestValue  = -Infinity;
  for (const rid of (n.regions ?? []).slice(0, 6)) {
    for (const cid of (GAME_STATE.regions?.[rid]?.connections ?? []).slice(0, 6)) {
      const cr = GAME_STATE.regions?.[cid];
      if (!cr || !cr.nation || cr.nation === nationId) continue;
      const owner  = GAME_STATE.nations[cr.nation];
      if (!owner) continue;
      const relToOwner = n.relations?.[cr.nation];
      if ((relToOwner?.score ?? 0) > 20) continue; // не атакуем друзей
      const garrison = cr.garrison ?? 0;
      const wealth   = cr.tax_income ?? cr.income ?? 0;
      // Ценность = доход - % гарнизона от нашей силы
      const value = wealth * 10 - (garrison / Math.max(str, 1)) * 50;
      if (value > bestConquestValue) {
        bestConquestValue = value;
        const ease = garrison < str * 0.3 ? 'easy' : garrison < str * 0.6 ? 'medium' : 'hard';
        bestConquestTarget = `${cid} (owner:${owner.name}, garrison:${garrison}, income:${wealth}, ease:${ease})`;
      }
    }
  }
  const conquestHint = bestConquestTarget
    ? `Best expansion target: region ${bestConquestTarget}`
    : 'No profitable expansion targets adjacent';

  // ── #9 Контр-стратегия против игрока — детекция возможной коалиции ──
  let coalitionBlock = '';
  if (pn && playerNationId !== nationId) {
    const potentialCoalitionMembers = [];
    for (const [oid, r] of Object.entries(n.relations ?? {})) {
      if (oid === playerNationId) continue;
      const on = GAME_STATE.nations[oid];
      if (!on || on.is_eliminated) continue;
      const pRel = on.relations?.[playerNationId];
      // Нации, враждебные к игроку И дружественные к нам
      if ((pRel?.score ?? 0) < -20 && (r.score ?? 0) > 20) {
        const os = (on.military?.infantry ?? 0) + (on.military?.cavalry ?? 0) * 3;
        potentialCoalitionMembers.push(`${on.name}(str:${Math.round(os)})`);
      }
    }
    if (potentialCoalitionMembers.length > 0 && playerStr > str * 0.9) {
      coalitionBlock = `\n⚡ COALITION OPPORTUNITY: ${potentialCoalitionMembers.slice(0,3).join(', ')} also oppose the player — coordinate attacks via form_alliance`;
    }
  }

  // ── #8 Дипломатический момент — лучший кандидат для альянса ─────────
  let bestAllyCandidate = null;
  let bestAllyScore = -Infinity;
  for (const [oid, r] of Object.entries(n.relations ?? {})) {
    if (r.at_war) continue;
    const on = GAME_STATE.nations[oid];
    if (!on || on.is_eliminated) continue;
    const alreadyAllied = (r.treaties ?? []).some(t => t.includes('alliance'));
    if (alreadyAllied) continue;
    const os = (on.military?.infantry ?? 0) + (on.military?.cavalry ?? 0) * 3;
    // Хорошо: высокие отношения + примерно равная сила
    const score = (r.score ?? 0) + (os > str * 0.5 && os < str * 2 ? 20 : 0);
    if (score > 30 && score > bestAllyScore) {
      bestAllyScore = score;
      bestAllyCandidate = `${on.name}(id:${oid}, score:${r.score ?? 0}, str:~${_scoutEstimate(os, r.score)})`;
    }
  }
  const allyHint = bestAllyCandidate
    ? `Best alliance opportunity: ${bestAllyCandidate} — use form_alliance action`
    : 'No strong alliance candidates right now';

  // ── #7 Индекс угрозы 0-100 ───────────────────────────────────────
  let threatScore = 0;
  // Активные войны
  threatScore += atWar.length * 20;
  // Враждебные соседи сильнее нас
  for (const [oid, r] of Object.entries(n.relations ?? {})) {
    if ((r.score ?? 0) < -20) {
      const en = GAME_STATE.nations[oid];
      if (!en || en.is_eliminated) continue;
      const es = (en.military?.infantry ?? 0) + (en.military?.cavalry ?? 0) * 3;
      if (es > str) threatScore += 10;
    }
  }
  // Игрок рядом
  if (playerNearby) threatScore += 15;
  // Плохая экономика
  if (bal < -200) threatScore += 10;
  if (happiness < 30) threatScore += 10;
  threatScore = Math.min(100, threatScore);
  const threatLabel = threatScore >= 70 ? '🔴 CRITICAL' : threatScore >= 40 ? '🟡 HIGH' : threatScore >= 20 ? '🟠 MODERATE' : '🟢 LOW';

  // ── #6 Многоходовые стратегии A/B/C ──────────────────────────────
  function _buildStrategicOptions(treasury, bal, str, atWar, happiness, stability) {
    const options = [];
    // Вариант A: экономический
    if (bal < 0 || treasury < 1000) {
      options.push('A) ECONOMY FIRST: set_taxes + build market/granary → fix deficit in 2-3 turns, then expand');
    } else {
      options.push('A) ECONOMY BOOST: build market/road → increase income +20% over 3 turns');
    }
    // Вариант B: военный
    if (atWar.length > 0) {
      options.push('B) WAR FOCUS: recruit + move_army to front → press advantage or stabilise line');
    } else if (str < 1000) {
      options.push('B) MILITARY BUILDUP: build barracks + recruit × 2 turns → reach 1500 str before declaring war');
    } else {
      options.push('B) EXPANSION: identify weakest neighbor → declare_war + move_army → capture 1 region');
    }
    // Вариант C: дипломатический
    if (happiness < 50 || stability < 50) {
      options.push('C) STABILITY: reduce taxes + build temple → happiness +15 in 2 turns, then resume expansion');
    } else {
      options.push('C) DIPLOMACY: form_alliance with nearest strong nation → deter attacks + unlock trade bonuses');
    }
    return options.join('\n');
  }
  const strategicOptions = _buildStrategicOptions(treasury, bal, str, atWar, happiness, stability);

  // ── [FIX] Стратегическая фаза — вычислено JS, не моделью ─────────
  const phase = _computeNationPhase(n, str, playerStr, playerNearby, atWar);

  // ── [FIX] Многоходовая цель — сохраняется между ходами ────────────
  const prevGoal = n._ai_goal
    ? `Current goal (set turn ${n._ai_goal.turn}): "${n._ai_goal.text}"\n  Progress: ${n._ai_goal.progress ?? 'in progress'}`
    : 'No goal set yet';

  // ── #4 Память побед и поражений ──────────────────────────────────
  const warHistory = (GAME_STATE.events_log ?? [])
    .filter(e => e.type === 'military'
      && (e.message?.includes(n.name) || e.nations?.includes(nationId))
      && (currentTurn - (e.turn ?? 0)) <= 20)
    .slice(-5)
    .map(e => {
      const isVictory = e.message?.match(/captured|routed|defeated|victory/i);
      const isLoss    = e.message?.match(/lost|retreat|forced back|eliminated/i);
      const marker    = isVictory ? '⚔ WIN' : isLoss ? '✗ LOSS' : '—';
      return `  T${e.turn} ${marker}: ${e.message}`;
    })
    .join('\n') || '  (no recent battles)';

  // ── История решений ────────────────────────────────────────────────
  const recentDecisions = (n.memory?.events ?? [])
    .filter(e => e.type === 'decision')
    .slice(-4)
    .map(e => `  Turn ${e.turn ?? '?'}: ${e.text}`)
    .join('\n') || '  (none)';

  // ── War status ────────────────────────────────────────────────────
  const warLine = atWar.length
    ? `At war with: ${atWar.map(eid => {
        const en    = GAME_STATE.nations[eid];
        const turns = currentTurn - (mil._war_start?.[eid] ?? currentTurn);
        const es    = (en?.military?.infantry ?? 0) + (en?.military?.cavalry ?? 0) * 3;
        return `${en?.name ?? eid}(${turns}t,str:${Math.round(es)})`;
      }).join(', ')}`
    : 'Not at war';

  // ── Промпт ────────────────────────────────────────────────────────
  const system = `You are a strategic advisor for an ancient nation. Each turn you choose ONE action.
You think like a real ruler: react to threats, pursue goals, exploit opportunities.
Respond ONLY with a JSON object — no text outside JSON.
Format: {"action":"...","target":"exact_id or null","building":"exact_id or null","region":"exact_region_id or null","army_id":"exact_army_id or null","tactic":"aggressive|defensive|standard|null","tax_commoners":null,"tax_aristocrats":null,"goal":"your 3-turn plan as short sentence","reasoning":"1 sentence"}
RULES:
- army_id: ONLY use id values from ## Field Armies section (copy exactly)
- move_army/attack: target ONLY from valid_move_targets or Attack Targets (copy exactly)
- build: building ONLY from can_build list; region ONLY from that building's region id
- declare_war: target ONLY from ## War Targets section (use the id: value)
- seek_peace/armistice: target ONLY from "At war with" list
- set goal: describe your plan for next 2-3 turns in the "goal" field`;

  const user = `## ${n.name} (id:${nationId}) | Turn ${currentTurn}

## State
Treasury:${treasury}g | Income:+${income} Expenses:-${expense} Balance:${bal >= 0 ? '+' : ''}${bal}/turn${tradeNote}
${econForecast}
Army:${Math.round(str)} (${mil.infantry ?? 0}inf+${mil.cavalry ?? 0}cav+${mil.mercenaries ?? 0}mercs)${armyExhaustionNote}
Pop:${pop.total ?? 0} Happiness:${happiness} Stability:${stability} Legitimacy:${gov.legitimacy ?? 50}${supplyWarning}
Threat Index: ${threatScore}/100 ${threatLabel}${betrayalBlock}
${warLine}
${playerBlock}
${personalityBlock}

## Season: ${season}
${seasonNote}

## ⚡ Strategic Phase: ${phase.phase}
${phase.advice}
Recommended actions: ${phase.recommended.join(', ')}
Avoid: ${phase.avoid.join(', ')}

## Strategic Options (choose or combine)
${strategicOptions}
Expansion: ${conquestHint}
Diplomacy: ${allyHint}${coalitionBlock}

## Your Goal (multi-turn plan)
${prevGoal}

## Diplomatic Relations
${relLines || '  (none)'}

## War Targets (declare_war candidates)
${warTargetLines}

## Attack Targets (move_army / attack — use exact region id)
${atkTargets.length ? atkTargets.join('\n') : '  none'}

## Field Armies (use EXACT id values below)
${armyLines}

## Build Options (use EXACT region and building ids below)
${buildLines}

## Recent Decisions
${recentDecisions}

## Battle History (last 20 turns)
${warHistory}

Choose the best action for this turn. Follow Strategic Phase advice. Update your goal.`;

  const raw = await _callOllama(system, user, 320);

  try {
    const parsed = extractJSON(raw);
    const item   = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!item?.action) return null;

    // ── #15 Валидация решений — JS проверяет перед применением ─────────
    const validArmyIds = new Set(myArmies.map(a => String(a.id)));
    // Если army_id указан но не существует — обнуляем
    if (item.army_id != null && !validArmyIds.has(String(item.army_id))) {
      console.warn(`[#15] ${nationId}: invalid army_id "${item.army_id}" — cleared`);
      item.army_id = null;
      // Если действие требует армию — откатываемся на wait
      if (['move_army', 'attack', 'fortify'].includes(item.action)) item.action = 'wait';
    }
    // Если move_army/attack — target должен быть в valid_move_targets одной из армий
    if (['move_army', 'attack'].includes(item.action) && item.target) {
      const allValidTargets = new Set(
        myArmies.flatMap(a => GAME_STATE.regions?.[a.position]?.connections ?? []).map(String)
      );
      // Также принимаем atkTargets (регионы из Attack Targets)
      const atkRegionIds = new Set(atkTargets.map(l => l.match(/region:(\S+)/)?.[1]).filter(Boolean));
      if (!allValidTargets.has(String(item.target)) && !atkRegionIds.has(String(item.target))) {
        console.warn(`[#15] ${nationId}: invalid move target "${item.target}" — cleared`);
        item.target = null;
        item.action = 'wait';
      }
    }
    // Если build — region и building должны совпадать с buildLines
    if (item.action === 'build' && item.region && item.building) {
      const regionData = GAME_STATE.regions?.[item.region];
      if (!regionData || regionData.nation !== nationId) {
        console.warn(`[#15] ${nationId}: build in non-owned region "${item.region}" — cleared`);
        item.action = 'wait';
        item.region = null;
        item.building = null;
      }
    }
    // ── #16 Confidence score — fallback если модель не уверена ──────────
    const VALID_ACTIONS = [
      'trade','build','recruit','recruit_mercs','diplomacy','attack','fortify','wait',
      'declare_war','seek_peace','armistice','set_taxes','move_army','form_alliance',
    ];
    if (!VALID_ACTIONS.includes(item.action)) {
      console.warn(`[#16] ${nationId}: unknown action "${item.action}" → wait`);
      item.action = 'wait';
    }
    const reasoning = typeof item.reasoning === 'string' ? item.reasoning.trim() : '';
    if (reasoning.length < 5) {
      // Модель не дала обоснования — подозрительно, но не fallback; только лог
      console.warn(`[#16] ${nationId}: short/missing reasoning for action "${item.action}"`);
    }
    // ── конец confidence ──────────────────────────────────────────────

    // Сохраняем цель нации если модель её обновила
    if (item.goal && typeof item.goal === 'string' && item.goal.length > 3) {
      n._ai_goal = { text: item.goal, turn: currentTurn, progress: null };
    } else if (n._ai_goal) {
      // Обновляем прогресс на основе последнего действия
      n._ai_goal.progress = `last action: ${item.action}`;
    }

    return {
      action:          item.action,
      target:          item.target          ?? null,
      building:        item.building        ?? null,
      region:          item.region          ?? null,
      army_id:         item.army_id         ?? null,
      tactic:          item.tactic          ?? null,
      tax_commoners:   item.tax_commoners   ?? null,
      tax_aristocrats: item.tax_aristocrats ?? null,
      tax_clergy:      item.tax_clergy      ?? null,
      reasoning:       item.reasoning       ?? '',
    };
  } catch (e) {
    console.warn(`[single] Ошибка парсинга для ${nationId}:`, e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// ВОЕННЫЙ AI — Haiku 4.5 перехватывает управление нацией пока она
// воюет с игроком. Возвращает управление phi4-mini после мира.
//
// Получает полный тактический контекст:
//   • армии обеих сторон с позициями
//   • история сражений (из events_log)
//   • союзники которых можно призвать
//   • степень истощения войны
// ══════════════════════════════════════════════════════════════════════

async function getAIWarDecision(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return null;

  const playerNationId = GAME_STATE.player_nation ?? 'syracuse';
  const pn = GAME_STATE.nations[playerNationId];
  if (!pn) return null;

  const mil = n.military   ?? {};
  const eco = n.economy    ?? {};
  const gov = n.government ?? {};
  const pop = n.population ?? {};

  const str      = (mil.infantry ?? 0) + (mil.cavalry ?? 0) * 3 + (mil.mercenaries ?? 0);
  const treasury = Math.round(eco.treasury ?? 0);
  const bal      = Math.round((eco.income_per_turn ?? 0) - (eco.expense_per_turn ?? 0));
  const currentTurn = GAME_STATE.turn ?? 0;

  // ── Силы игрока ───────────────────────────────────────────────────
  const pMil = pn.military ?? {};
  const pStr = (pMil.infantry ?? 0) + (pMil.cavalry ?? 0) * 3 + (pMil.mercenaries ?? 0);
  const strRatio = pStr > 0 ? (str / pStr).toFixed(2) : '∞';
  const warSince = mil._war_start?.[playerNationId] ?? currentTurn;
  const warDuration = currentTurn - warSince;
  const exhaustion = warDuration >= 10 ? 'HIGH' : warDuration >= 5 ? 'MEDIUM' : 'LOW';

  // ── Армии обеих сторон с валидными позициями ───────────────────────
  const myArmies = (GAME_STATE.armies ?? [])
    .filter(a => a.nation === nationId && a.state !== 'disbanded')
    .map(a => {
      const moveTargets = (GAME_STATE.regions?.[a.position]?.connections ?? [])
        .slice(0, 5)
        .map(cid => {
          const cr = GAME_STATE.regions?.[cid];
          const owner = cr?.nation ? (GAME_STATE.nations[cr.nation]?.name ?? cr.nation) : 'unowned';
          return `${cid}(${owner})`;
        }).join(', ');
      return `  id:${a.id} @ ${a.position}(${a.state}) — ${a.units?.infantry ?? 0}inf+${a.units?.cavalry ?? 0}cav\n    move_to: ${moveTargets || 'none'}`;
    }).join('\n') || '  (no field army)';

  const playerArmies = (GAME_STATE.armies ?? [])
    .filter(a => a.nation === playerNationId && a.state !== 'disbanded')
    .map(a => `  id:${a.id} @ ${a.position}(${a.state}) — ${a.units?.infantry ?? 0}inf+${a.units?.cavalry ?? 0}cav`)
    .join('\n') || '  (no player armies)';

  // ── Атакуемые регионы (принадлежат игроку, смежные с нами) ────────
  const myRegionSet = new Set(n.regions ?? []);
  const attackTargets = [];
  for (const rid of (n.regions ?? []).slice(0, 6)) {
    for (const cid of (GAME_STATE.regions?.[rid]?.connections ?? []).slice(0, 5)) {
      const cr = GAME_STATE.regions?.[cid];
      if (!cr || cr.nation !== playerNationId) continue;
      const ease = (cr.garrison ?? 0) < str * 0.4 ? 'easy' : 'hard';
      attackTargets.push(`  region:${cid}(${ease}) — garrison:${cr.garrison ?? 0}`);
      if (attackTargets.length >= 4) break;
    }
    if (attackTargets.length >= 4) break;
  }

  // ── Союзники которых можно призвать ──────────────────────────────
  const potentialAllies = Object.entries(n.relations ?? {})
    .filter(([oid, r]) => {
      if (r.at_war) return false;
      const hasTreaty = (r.treaties ?? []).some(t => ['defensive_alliance','military_alliance'].includes(t));
      return hasTreaty || (r.score ?? 0) > 50;
    })
    .map(([oid]) => {
      const on  = GAME_STATE.nations[oid];
      const os  = (on?.military?.infantry ?? 0) + (on?.military?.cavalry ?? 0) * 3;
      return `  id:${oid} ${on?.name ?? oid} str:${Math.round(os)}`;
    })
    .slice(0, 3)
    .join('\n') || '  none';

  // ── История сражений (последние 5 военных событий) ────────────────
  const playerName = pn.name ?? playerNationId;
  const battleHistory = (GAME_STATE.events_log ?? [])
    .filter(e => e.type === 'military' && (currentTurn - (e.turn ?? 0)) <= 8)
    .slice(0, 6)
    .map(e => `  Turn ${e.turn}: ${e.message}`)
    .join('\n') || '  (no battles yet)';

  // ── Стройки (только самые важные для войны) ───────────────────────
  const warBuilds = (n.regions ?? []).slice(0, 3).map(rid => {
    const region = GAME_STATE.regions?.[rid];
    if (!region || (region.construction_queue ?? []).length >= 2) return null;
    const built = new Set([
      ...(region.building_slots ?? []).map(s => s.building_id),
      ...(region.construction_queue ?? []).map(q => q.building_id ?? q),
    ]);
    const warBlds = ['barracks','stables','wall','fortress']
      .filter(b => !built.has(b) && (typeof BUILDINGS === 'undefined' || BUILDINGS[b]?.nation_buildable !== false))
      .map(b => `${b}(${BUILDINGS?.[b]?.cost ?? '?'}g)`);
    if (!warBlds.length) return null;
    return `  region:${rid}: ${warBlds.join(', ')}`;
  }).filter(Boolean).join('\n') || '  none';

  // ── Последние решения нации ───────────────────────────────────────
  const recentDecisions = (n.memory?.events ?? [])
    .filter(e => e.type === 'decision')
    .slice(-4)
    .map(e => `  Turn ${e.turn ?? '?'}: ${e.text}`)
    .join('\n') || '  (none)';

  // ── Текущая цель ──────────────────────────────────────────────────
  const currentGoal = n._ai_goal
    ? `"${n._ai_goal.text}" (set turn ${n._ai_goal.turn}, progress: ${n._ai_goal.progress ?? 'ongoing'})`
    : 'none';

  // ── Оценка ситуации (предвычислено JS) ────────────────────────────
  let situation, recommended, avoid;
  if (str > pStr * 1.4) {
    situation = `YOU ARE STRONGER (ratio ${strRatio}). Press the attack — this is your chance to win decisively.`;
    recommended = ['attack', 'move_army', 'recruit'];
    avoid = ['seek_peace', 'armistice'];
  } else if (str < pStr * 0.6) {
    situation = `YOU ARE WEAKER (ratio ${strRatio}). Avoid open battle. Fortify, recruit, or seek peace.`;
    recommended = ['fortify', 'recruit_mercs', 'seek_peace', 'armistice', 'form_alliance'];
    avoid = ['attack'];
  } else if (exhaustion === 'HIGH') {
    situation = `WAR EXHAUSTION HIGH (${warDuration} turns). Population unhappy. Consider armistice.`;
    recommended = ['armistice', 'seek_peace', 'fortify'];
    avoid = ['declare_war', 'recruit_mercs'];
  } else {
    situation = `BALANCED WAR (ratio ${strRatio}, ${warDuration} turns). Reinforce or seek advantage.`;
    recommended = ['recruit', 'move_army', 'fortify', 'form_alliance'];
    avoid = ['seek_peace'];
  }

  const system = `You are a military commander of an ancient nation currently at WAR with the player.
This is the most critical moment — your decisions directly affect the war outcome.
Think tactically: consider army positions, strength ratios, exhaustion, and allies.
Respond ONLY with a JSON object.
Format: {"action":"...","target":"exact_id","building":"exact_id or null","region":"exact_region_id or null","army_id":"exact_army_id or null","tactic":"aggressive|defensive|standard|flanking","tax_commoners":null,"tax_aristocrats":null,"goal":"your 2-3 turn war plan","reasoning":"1 tactical sentence"}
CRITICAL RULES:
- army_id: ONLY from ## Your Armies (exact id: value)
- move_army/attack target: ONLY from move_to: lists or Attack Targets (exact region id)
- form_alliance target: ONLY from ## Potential Allies (exact id: value)
- seek_peace/armistice target: "${playerNationId}" (the player)
- build: ONLY from ## War Buildings`;

  const warPersonalityBlock = _buildPersonalityBlock(n);

  const user = `## WAR COMMAND: ${n.name} (id:${nationId}) vs Player: ${playerName} (id:${playerNationId})
Turn ${currentTurn} | War duration: ${warDuration} turns | Exhaustion: ${exhaustion}

${warPersonalityBlock}

## Forces
Your army:   ${Math.round(str)} (${mil.infantry ?? 0}inf+${mil.cavalry ?? 0}cav+${mil.mercenaries ?? 0}mercs)
Player army: ${Math.round(pStr)} (${pMil.infantry ?? 0}inf+${pMil.cavalry ?? 0}cav+${pMil.mercenaries ?? 0}mercs)
Strength ratio (you/player): ${strRatio}

## Treasury
${treasury}g | balance:${bal >= 0 ? '+' : ''}${bal}/turn | Stability:${gov.stability ?? 50} | Happiness:${pop.happiness ?? 50}

## ⚡ Situation Assessment
${situation}
Recommended: ${recommended.join(', ')}
Avoid: ${avoid.join(', ')}

## Your Current War Goal
${currentGoal}

## Your Armies (use EXACT id values)
${myArmies}

## Player Armies
${playerArmies}

## Attack Targets (player regions adjacent to yours)
${attackTargets.length ? attackTargets.join('\n') : '  none reachable'}

## Potential Allies (can call via form_alliance)
${potentialAllies}

## War Buildings (barracks/walls — use EXACT region id)
${warBuilds}

## Battle History (last 8 turns)
${battleHistory}

## Recent Decisions
${recentDecisions}

Choose ONE decisive action this turn. Update your war goal.`;

  const raw = await _callGroq(system, user, 400);

  try {
    const parsed = extractJSON(raw);
    const item   = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!item?.action) return null;

    // Сохраняем военную цель
    if (item.goal && typeof item.goal === 'string' && item.goal.length > 3) {
      n._ai_goal = { text: item.goal, turn: currentTurn, progress: null };
    } else if (n._ai_goal) {
      n._ai_goal.progress = `Turn ${currentTurn}: ${item.action}`;
    }

    console.log(`[war_ai] ${n.name}(Haiku): ${item.action}${item.target ? '→' + item.target : ''} | "${item.reasoning ?? ''}"`);

    return {
      action:          item.action,
      target:          item.target          ?? null,
      building:        item.building        ?? null,
      region:          item.region          ?? null,
      army_id:         item.army_id         ?? null,
      tactic:          item.tactic          ?? 'standard',
      tax_commoners:   item.tax_commoners   ?? null,
      tax_aristocrats: item.tax_aristocrats ?? null,
      tax_clergy:      item.tax_clergy      ?? null,
      reasoning:       item.reasoning       ?? '',
    };
  } catch (e) {
    console.warn(`[war_ai] Ошибка парсинга для ${nationId}:`, e.message);
    return null;
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
