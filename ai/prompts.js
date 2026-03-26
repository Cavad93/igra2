// Шаблоны промптов для разных ситуаций

const PROMPTS = {

  // ──────────────────────────────────────────────────────────
  // 1. ПАРСИНГ КОМАНДЫ ИГРОКА
  // ──────────────────────────────────────────────────────────
  parseCommand: (playerInput, gameStateSlice) => ({
    system: `Ты — парсер игровых команд исторической стратегии 301 BC.
Получаешь свободный текст от игрока и возвращаешь ТОЛЬКО JSON.
Никакого текста кроме JSON. Никаких пояснений. Никакого markdown.

ТИПЫ ДЕЙСТВИЙ:
- law: предложить/принять закон
- military: набор войск, рекрутинг, военные операции
- diplomacy: переговоры, дары, союзы, объявление войны
- economy: изменение налогов, торговля, покупка товаров
- character: действия с персонажами (подарки, назначения, ссылка)
- build: строительство в регионе

СХЕМА ОТВЕТА (строго JSON):
{
  "action_type": "law|military|diplomacy|economy|character|build",
  "parsed_action": {
    // для military: {"recruit_infantry": true, "amount": 500}
    // или:          {"recruit_ships": true, "amount": 10}
    // для economy:  {"change_tax_rate": 0.15}
    // или:          {"buy_good": "wheat", "amount": 5000}
    // для diplomacy:{"target_nation": "egypt", "send_gift": true, "gold_amount": 500}
    // или:          {"target_nation": "carthage", "propose_trade": true}
    // для law:      {"name": "...", "text": "...", "law_type": "military|economic|social", "effects": {}}
    // для build:    {"region": "leontini", "building": "granary"}
    // для character:{"target_character": "CHAR_0001", "give_gift": true, "gold_amount": 300}
  },
  "requires_vote": true,
  "estimated_effects": {
    // dotted paths относительно nations.{player_nation}: "economy.treasury": -500
    // числовые изменения
  },
  "radicalism_score": 0
}`,

    user: `КОМАНДА ИГРОКА: "${playerInput}"

ТЕКУЩЕЕ СОСТОЯНИЕ:
${JSON.stringify(gameStateSlice, null, 2)}

Верни JSON разбора этой команды.`,
  }),

  // ──────────────────────────────────────────────────────────
  // 2. РЕАКЦИЯ ПЕРСОНАЖА
  // ──────────────────────────────────────────────────────────
  characterReaction: (action, character, personalImpact, politicalContext) => ({
    system: `Ты — симулятор политических персонажей античного мира, 301 BC.
Отвечай ТОЛЬКО JSON. Без текста вне JSON. Без markdown.
Каждый персонаж говорит своим голосом — исходя из своих traits, wants и fears.
Речи краткие — 1-3 предложения в стиле эпохи.`,

    user: `ДЕЙСТВИЕ ИГРОКА: ${JSON.stringify(action)}

ПЕРСОНАЖ:
${JSON.stringify(character, null, 2)}

ЛИЧНЫЕ ПОСЛЕДСТВИЯ ДЛЯ НЕЁ/НЕГО:
${JSON.stringify(personalImpact, null, 2)}

ПОЛИТИЧЕСКАЯ ОБСТАНОВКА:
${JSON.stringify(politicalContext, null, 2)}

Верни JSON:
{
  "position": "strongly_for|for|neutral|against|strongly_against",
  "speech": "что говорит персонаж (1-3 предложения, от первого лица, стиль античности)",
  "proposed_amendment": null,
  "hidden_motive": "что думает на самом деле (1 предложение)",
  "loyalty_delta": -10
}`,
  }),

  // ──────────────────────────────────────────────────────────
  // 3. РЕШЕНИЕ AI-НАЦИИ
  // ──────────────────────────────────────────────────────────
  nationDecision: (nationId, nationState, neighborsSummary, availableActions, recentDecisions = [], memoryContext = '', enriched = {}) => {
    const eco  = enriched.economy    ?? {};
    const mil  = enriched.military   ?? {};
    const int_ = enriched.internal   ?? {};
    const ter  = enriched.territory  ?? {};
    const wars = enriched.active_wars ?? [];
    const gp   = enriched.global_power ?? [];
    const sp   = enriched.strategic_phase ?? {};
    const tradeOpp = enriched.trade_opportunities ?? [];

    // ── Форматирование соседей (компактно) ──────────────────────
    const neighborsLines = Object.entries(neighborsSummary).map(([id, n]) => {
      const warLine     = n.at_war ? ' ⚔ВОЙНА' : '';
      const treatyLine  = n.treaties?.length ? ` [${n.treaties.join(',')}]` : '';
      const alsoWar     = n.also_at_war_with?.length ? ` (тж.воюет с: ${n.also_at_war_with.slice(0,2).join(',')})` : '';
      return `  ${n.name}: rel=${n.relation_score}${warLine}${treatyLine} сила=${n.military_strength} казна=${n.treasury} стаб=${n.stability} регионов=${n.region_count}${alsoWar}`;
    }).join('\n');

    // ── Форматирование войн ──────────────────────────────────────
    const warsLine = wars.length > 0
      ? wars.map(w => `  ${w.enemy_name}: соотношение сил=${w.strength_ratio} (${w.strength_ratio >= 1 ? 'мы сильнее' : 'враг сильнее'}), стаб.врага=${w.enemy_stability}`).join('\n')
      : '  Войн нет';

    // ── Форматирование глобальных сил ───────────────────────────
    const gpLine = gp.map((n, i) => `  ${i+1}. ${n.name}: сила=${n.strength} регионов=${n.regions}${n.at_war ? ' ⚔' : ''}`).join('\n');

    // ── Армии на карте ───────────────────────────────────────────
    const armiesLine = (mil.field_armies ?? []).length > 0
      ? mil.field_armies.map(a => `  [${a.id}] в ${a.position} (${a.state}), сила=${a.size}, снабж=${a.supply}%`).join('\n')
      : '  Нет полевых армий';

    return {
    system: `Ты — правитель ${nationState.name} в 301 BC. Античная стратегия.
Принимаешь решение исходя из интересов своего государства.
Отвечай ТОЛЬКО JSON. Никакого текста кроме JSON.
Личность: ${nationState.ai_personality || 'нейтральный'}. Приоритет: ${nationState.ai_priority || 'выживание'}.
${sp.phase ? `ТЕКУЩАЯ СТРАТЕГИЧЕСКАЯ ФАЗА: ${sp.phase.toUpperCase()} — ${sp.advice}` : ''}
Избегай бессмысленного повторения одних и тех же действий подряд.`,

    user: `═══ ГОСУДАРСТВО ${nationState.name.toUpperCase()} ═══

ЭКОНОМИКА:
  Казна: ${eco.treasury} | Доход/ход: ${eco.income_per_turn ?? '?'} | Расход/ход: ${eco.expense_per_turn ?? '?'} | Баланс: ${eco.balance >= 0 ? '+' : ''}${eco.balance ?? '?'}
  Налог: ${((eco.tax_rate ?? 0.1) * 100).toFixed(0)}% | Торг.пути: ${eco.trade_routes ?? 0} | Запасы: ${eco.top_stockpile || 'нет'}

АРМИЯ:
  Пехота: ${mil.infantry ?? 0} | Кавалерия: ${mil.cavalry ?? 0} | Наёмники: ${mil.mercenaries ?? 0} | Арт.: ${mil.artillery ?? 0} | Флот: ${mil.ships ?? 0}
  Мораль: ${mil.morale ?? 100} | Лояльность: ${mil.loyalty ?? 100} | Общая сила: ${Math.round(mil.total_strength ?? 0)}
ПОЛЕВЫЕ АРМИИ:
${armiesLine}

ТЕРРИТОРИЯ:
  Регионов: ${ter.count ?? 0} | Пограничных: ${ter.border_regions ?? 0} | Береговых: ${ter.coastal_count ?? 0}
  Средняя плодородность: ${ter.avg_fertility ?? '?'} | Суммарный гарнизон: ${ter.total_garrison ?? 0}

ВНУТРЕННЯЯ ПОЛИТИКА:
  Стабильность: ${int_.stability ?? 50}/100 | Легитимность: ${int_.legitimacy ?? 50}/100 | Счастье: ${int_.happiness ?? 50}%
  Личная власть: ${int_.personal_power ?? 50}/100 | Форма правления: ${int_.government_type ?? '?'}
${int_.class_satisfaction ? `  Классы: ${Object.entries(int_.class_satisfaction).map(([c,v]) => `${c}=${v}`).join(', ')}` : ''}

АКТИВНЫЕ ВОЙНЫ:
${warsLine}

СОСЕДИ И ДИПЛОМАТИЯ:
${neighborsLines || '  Нет данных'}
${tradeOpp.length ? `\nНЕЗАДЕЙСТВОВАННЫЕ ТОРГОВЫЕ ПАРТНЁРЫ: ${tradeOpp.join(', ')}` : ''}

ТОП-5 ДЕРЖАВ МИРА:
${gpLine || '  Нет данных'}

ДОСТУПНЫЕ ДЕЙСТВИЯ:
${availableActions.map(a => `  ${a.action}${a.target ? '→'+a.target : ''}: ${a.description}`).join('\n')}
${recentDecisions.length ? `\nПОСЛЕДНИЕ РЕШЕНИЯ (не повторяй без причины):\n${recentDecisions.map(d => `  Ход ${d.turn}: ${d.action}${d.target ? ' → ' + d.target : ''} (${d.reasoning})`).join('\n')}` : ''}
${memoryContext ? `\n--- КОНТЕКСТ ИСТОРИИ ---\n${memoryContext}\n---` : ''}

Выбери одно действие и верни JSON:
{
  "action": "trade|build|recruit|recruit_mercs|diplomacy|attack|fortify|wait",
  "target": "id нации или региона (если применимо)",
  "reasoning": "почему (1 предложение, опираясь на данные выше)",
  "secondary_action": null
}`,
    };
  },

  // ──────────────────────────────────────────────────────────
  // 4. ГЕНЕРАЦИЯ ПЕРСОНАЖЕЙ
  // ──────────────────────────────────────────────────────────
  generateCharacters: (count, nationId, nationState, existingCharacters) => ({
    system: `Ты — генератор исторических персонажей для стратегической игры 301 BC.
Создаёшь живых, противоречивых людей с реальными мотивами.
Отвечай ТОЛЬКО JSON массивом. Никакого текста кроме JSON.`,

    user: `Сгенерируй ${count} персонажей для ${nationState.name}.
Тип правления: ${nationState.government.type}.
Правитель: ${nationState.government.ruler}.

ИСТОРИЧЕСКИЙ КОНТЕКСТ (301 BC, Сиракузы):
Агафокл — бывший гончар, захвативший власть. Старая знать его ненавидит.
Только что закончилась война с Карфагеном в Африке (Агафокл первым перенёс войну на вражескую территорию).
Город ещё не оправился от осады. Напряжение между новыми людьми и аристократией высоко.

СОЦИАЛЬНЫЙ СОСТАВ (строго соблюдай):
- 2 аристократа: старые роды, земля, недовольны тираном
- 2 торговца: порт, зерно, металл — хотят мира для торговли
- 2 военных: ветераны или офицеры, разные взгляды на тирана
- 1 жрец или философ: духовный авторитет

УЖЕ СУЩЕСТВУЮЩИЕ ПЕРСОНАЖИ (избегай дублирования имён):
${existingCharacters.map(c => c.name).join(', ')}

Каждый персонаж должен иметь:
- уникальное греческое имя и происхождение (city of origin)
- traits: 6 параметров 0-100
- 2-3 wants (конкретных желания в данный момент, snake_case)
- 1-2 fears (snake_case)
- resources: gold (500-15000), land (0-10), followers (20-500), army_command (0)
- relations: пустой объект {}
- history: [{"turn": 0, "event": "краткая биография в 1 предложении"}]
- portrait: один эмодзи
- description: 1-2 предложения о персонаже

СХЕМА (строго):
[
  {
    "id": "CHAR_XXXX (уникальный 4-значный номер)",
    "name": "Имя Происхождение",
    "age": 25-70,
    "role": "senator|advisor|general|priest|merchant",
    "nation": "${nationId}",
    "alive": true,
    "health": 60-95,
    "traits": { "ambition": 0-100, "caution": 0-100, "loyalty": 0-100, "piety": 0-100, "cruelty": 0-100, "greed": 0-100 },
    "wants": ["snake_case"],
    "fears": ["snake_case"],
    "resources": { "gold": 0, "land": 0, "followers": 0, "army_command": 0 },
    "relations": {},
    "history": [{"turn": 0, "event": "биография"}],
    "portrait": "эмодзи",
    "description": "описание"
  }
]`,
  }),

  // ──────────────────────────────────────────────────────────
  // 5. ПРАВИТЕЛЬСТВО — ПАРСИНГ ОПИСАНИЯ
  // ──────────────────────────────────────────────────────────
  parseGovernment: (playerInput, currentGov, charsSummary) => ({
    system: `Ты — парсер системы правления для исторической стратегии 301 BC.
Получаешь описание изменений и возвращаешь ТОЛЬКО JSON дельту — только изменяемые поля.
НИКАКОГО текста вне JSON. Никаких пояснений. Никакого markdown. Никаких комментариев.

ТИПЫ: republic, monarchy, tyranny, oligarchy, tribal, theocracy, custom
РЕСУРСЫ ВЛАСТИ: fear, legitimacy, prestige, divine_mandate, wealth, military_loyalty
МЕТОДЫ ГОЛОСОВАНИЯ: majority_vote, unanimous, weighted_by_wealth, single_person, lottery

СХЕМА (включай ТОЛЬКО нужные поля):
{
  "type": "republic",
  "legitimacy": 55,
  "stability": 45,
  "ruler": {"type": "council", "name": "Сенат", "personal_power": 30},
  "power_resource": {"type": "legitimacy", "current": 55},
  "institutions": [
    {"id": "senate", "name": "Сенат", "type": "legislative", "decision_method": "majority_vote", "powers": ["законодательство"], "limitations": ["нет вето тирана"]}
  ],
  "elections": {"enabled": true, "frequency_turns": 12, "next_election": 12},
  "succession": {"tracked": false},
  "_instant_change": false
}

ПРАВИЛА:
- institutions: НЕ включай factions — только id, name, type, decision_method, powers (макс 2), limitations (макс 2)
- Для смены типа правления меняй type, ruler, power_resource, elections, institutions
- Для мелкой реформы меняй только 1-2 поля`,

    user: `ЗАПРОС: "${playerInput}"

ТЕКУЩЕЕ ПРАВИТЕЛЬСТВО: тип=${currentGov.type}, легитимность=${currentGov.legitimacy}, стабильность=${currentGov.stability ?? 50}, правитель=${currentGov.ruler?.name ?? '?'}

ПЕРСОНАЖИ: ${charsSummary.map(c => `${c.name}(${c.role})`).join(', ')}

Верни минимальную JSON дельту.`,
  }),

  // ──────────────────────────────────────────────────────────
  // 6. ПРАВИТЕЛЬСТВО — РЕАКЦИЯ НА СМЕНУ ФОРМЫ
  // ──────────────────────────────────────────────────────────
  governmentChangeReactions: (fromType, toType, characters) => ({
    system: `Ты — симулятор политических реакций в античном мире 301 BC.
Отвечай ТОЛЬКО JSON массивом. Без текста вне JSON. Без markdown.
Каждый персонаж реагирует исходя из своей роли, traits, wants и fears.
Смена формы правления — политический кризис. Реакции должны быть разнообразными и конфликтными.`,

    user: `Правительство меняется: ${fromType} → ${toType}.

ПЕРСОНАЖИ ДВОРА:
${JSON.stringify(characters.map(c => ({
  id: c.id,
  name: c.name,
  role: c.role,
  traits: c.traits,
  wants: c.wants,
  fears: c.fears,
})), null, 2)}

Верни JSON массив реакций:
[
  {
    "character_id": "CHAR_XXXX",
    "reaction": "support|neutral|oppose|conspire",
    "reason": "причина в 1 предложении (от лица персонажа)",
    "action": "что персонаж делает (1 предложение)",
    "loyalty_delta": -10
  }
]`,
  }),

  // ──────────────────────────────────────────────────────────
  // 7. ПРАВИТЕЛЬСТВО — ГОЛОСОВАНИЕ В ИНСТИТУТЕ
  // ──────────────────────────────────────────────────────────
  institutionVote: (proposalText, institution, members, calculatedEffects, voteResult, narrativeContext) => ({
    system: `Ты — нарратор политических дебатов в античном мире 301 BC.
Голоса уже посчитаны кодом — ты пишешь только речи и нарратив.
Отвечай ТОЛЬКО JSON. Никаких пояснений.
Речи краткие и в духе античной риторики.`,

    user: `ПРЕДЛОЖЕНИЕ: "${proposalText}"

ИНСТИТУТ: ${institution.name} (${institution.decision_method})

УЧАСТНИКИ (3 наиболее влиятельных):
${JSON.stringify(members, null, 2)}

ЭФФЕКТЫ (если пройдёт):
${JSON.stringify(calculatedEffects, null, 2)}

РЕЗУЛЬТАТ ГОЛОСОВАНИЯ (уже посчитан):
${JSON.stringify(voteResult, null, 2)}

${narrativeContext ? `ПОЛИТИЧЕСКИЙ КОНТЕКСТ СЕНАТА:
- Закон ${narrativeContext.result} (${narrativeContext.margin_pct ?? '?'}% голосов)
- Наибольшая оппозиция: клан «${narrativeContext.opposed_clan ?? '—'}»${narrativeContext.revealed_interest ? ` (интерес: ${narrativeContext.revealed_interest})` : ''}
- Наибольшая поддержка: клан «${narrativeContext.support_clan ?? '—'}»
- Настроение сената: "${narrativeContext.senate_mood}"
` : ''}
Напиши нарратив голосования. Верни JSON:
{
  "key_speeches": [
    {
      "character_id": "CHAR_XXXX",
      "character_name": "имя",
      "position": "for|against",
      "speech": "речь персонажа (1-3 предложения, античный стиль)"
    }
  ],
  "amendments_proposed": [
    "текст поправки (если кто-то предлагал)"
  ],
  "unexpected_events": [
    "драматическое событие во время голосования (если уместно)"
  ]
}`,
  }),

  // ──────────────────────────────────────────────────────────
  // 8. КОНСТИТУЦИОННЫЙ ХРОНИКЁР — реакция Форума на реформу
  // ──────────────────────────────────────────────────────────
  constitutionalChronicle: (ctx) => ({
    system: `Ты — античный хроникёр, свидетель политической жизни Сиракуз 301 BC.
Пиши живо, кратко (2–3 предложения), в духе Фукидида или Полибия.
Никаких JSON-тегов — только нарратив от первого лица.`,

    user: `Консул только что ${ctx.passed ? 'протолкнул' : 'не сумел провести'} конституционную реформу «${ctx.law_name}».
Поддержка в Сенате: ${ctx.support_pct}%.
Изменения: ${Object.entries(ctx.changes).map(([k, v]) => `${k} → ${v}`).join('; ')}.
${ctx.opponent_name ? `Главный противник: ${ctx.opponent_name} (${ctx.opponent_clan}).` : ''}
Уровень тирании: ${ctx.tyranny}/100.
Настроение Сената: «${ctx.senate_mood}».

Опиши реакцию Форума, народа и Сената на это событие. Упомяни клан оппонента если он есть.`,
  }),

  // ──────────────────────────────────────────────────────────
  // SENATOR OBITUARY — некролог известного сенатора
  // Вызывается только при смерти материализованного персонажа
  // от болезни или заговора. Возвращает PLAIN TEXT (одно предложение).
  // ──────────────────────────────────────────────────────────
  senatorObituary: (senator, factionName, senateState) => ({
    system: `Ты — хроникёр античных Сиракуз. Пиши кратко и ёмко.
Ответь ОДНИМ предложением (20–45 слов) — некрологом для городской хроники.
Никакого JSON. Никаких заголовков. Только предложение.`,

    user: `Умер сенатор ${senator.name ?? 'неизвестный'} (${factionName}).
Возраст: ${senator.current_age ?? '?'} лет.
Черты: ${(senator.traits ?? []).join(', ')}.
Биография: ${senator.biography ?? '—'}.
Обстановка в Сенате: "${senateState}".

Напиши некролог: упомяни имя, смерть и краткое политическое последствие для фракции.`,
  }),

  // ──────────────────────────────────────────────────────────
  // LAZY MATERIALIZATION — оживление сенатора
  // Вызывается только при 3 триггерах (player_click / rising_star / rotation).
  // Передаём минимальный контекст: faction, два числа, настроение сената,
  // теги трёх самых влиятельных сенаторов.
  // ──────────────────────────────────────────────────────────
  materializeSenator: (senator, context, reason) => ({
    system: `Ты — генератор сенаторов для исторической игры 301 BC, Сиракузы.
Создай личность одним кратким JSON-объектом.
Отвечай ТОЛЬКО JSON. Без текста вне JSON. Без markdown.`,

    user: `ПАРАМЕТРЫ СЕНАТОРА:
Фракция: ${context.faction_name}
Лояльность: ${context.loyalty_score}/100
Честолюбие: ${context.ambition_level}/5
Причина появления: ${
  reason === 'rising_star' ? 'совершил политическое действие — восходящая звезда'
  : reason === 'rotation'  ? 'попал в городские новости — ротация'
  : 'игрок изучил его — прямой клик'}

НАСТРОЕНИЕ СЕНАТА: "${context.global_senate_state}"
${context.top_speakers_tags.length
  ? `ИЗВЕСТНЫЕ СЕНАТОРЫ (для связности): ${context.top_speakers_tags.join('; ')}`
  : ''}

Верни JSON:
{
  "name":      "Греческое имя + происхождение (2–3 слова)",
  "traits":    ["Тег1", "Тег2", "Тег3"],
  "biography": "одно предложение — кто он и что хочет",
  "portrait":  "один эмодзи",
  "influence": 10
}

Правила:
- traits: 3–5 коротких русских тега (Жадный / Оратор / Патриций / Ветеран / Честолюбец / Народник / Лоялист / Оппозиционер / Осторожный / Фанатик)
- influence: loyalty_score + ambition_level×5 ± небольшой разброс (10–100)
- имя должно звучать по-гречески и подходить к эпохе`,
  }),

  // ──────────────────────────────────────────────────────────
  // 11. МАНИФЕСТ ЗАГОВОРА — цель, тайное имя, текст
  // ──────────────────────────────────────────────────────────
  // Вызывается когда ячейка заговора превышает 15% сената.
  // СТРОГИЙ ЗАПРЕТ: никаких имён из учебников истории.
  conspiracyManifest: (ctx) => ({
    system: `Ты — автор политических манифестов античного мира 301 BC, Сиракузы.
Создаёшь уникальные тайные организации на основе конкретных персонажей и их интересов.
Отвечай ТОЛЬКО JSON. Без текста вне JSON.
ЗАПРЕЩЕНО: Катилина, Брут, Кассий, Гракхи и любые известные исторические заговорщики.
Все имена, названия и цели — вымышленные, вдохновлённые данными игры.`,

    user: `ЛИДЕР ЗАГОВОРА:
Имя: ${ctx.leader_name}
Клан: ${ctx.leader_clan}
Черты: [${ctx.leader_traits.join(', ')}]
Скрытые интересы: [${ctx.leader_interests.join(', ') || 'не определены'}]
Клан под [Vendetta]: ${ctx.clan_vendetta ? 'ДА — они жаждут мести за реформы' : 'НЕТ'}

РАЗМЕР ЯЧЕЙКИ: ${ctx.member_count} участников

НЕДАВНИЕ ЗАКОНЫ КОНСУЛА (причины недовольства):
${ctx.recent_laws.length ? ctx.recent_laws.map(l => `- ${l}`).join('\n') : '- законов нет'}

НАСТРОЕНИЕ СЕНАТА: "${ctx.senate_mood}"

На основе этих данных создай тайную организацию. Верни JSON:
{
  "name":      "Тайное имя союза (2–4 слова, звучит по-гречески или на латинский манер)",
  "goal":      "Конкретная политическая цель в 1 предложении (свержение / отмена закона / возврат полномочий / месть за клан)",
  "manifesto": "Текст манифеста от первого лица (3–4 предложения в стиле античного памфлета)",
  "symbol":    "Один символ или эмодзи, олицетворяющий союз"
}

Цель должна напрямую отражать интересы лидера и пострадавшего клана.`,
  }),

  // ──────────────────────────────────────────────────────────
  // 12. ДИАЛОГ [BLOOD_FEUD] — реплика сенатора с Blood_Feud
  // ──────────────────────────────────────────────────────────
  // Вызывается при materialize_senator если у сенатора Blood_Feud.
  // Добавляет в biography личное обращение к Консулу.
  bloodFeudDialogue: (senator, clanName, victimNames, lawsAfterFeud) => ({
    system: `Ты — персонаж исторической игры 301 BC, Сиракузы.
Пишешь ОДНУ реплику от первого лица (2–3 предложения) — горькое обращение к Консулу.
Никакого JSON, только текст. Без кавычек в начале/конце.`,

    user: `Ты — ${senator.name ?? 'сенатор'} из клана «${clanName}».
Консул казнил или изгнал твоих родственников из клана: ${victimNames.join(', ')}.
С тех пор приняты законы: ${lawsAfterFeud.length ? lawsAfterFeud.join('; ') : 'не принято новых законов'}.
Черты твоего характера: [${(senator.traits ?? []).join(', ')}].

Произнеси горькую реплику, обращённую к Консулу — намекни на Blood_Feud, но не угрожай открыто.
Используй имена погибших. Не называй исторических персонажей.`,
  }),

  // ──────────────────────────────────────────────────────────
  // 9. ДЕБАТЫ В СЕНАТЕ — динамические речи и реакция зала
  // ──────────────────────────────────────────────────────────
  senateDebate: (law, speakers, playerSpeech, senateCtx) => ({
    system: `Ты — нарратор политических дебатов в Сенате античных Сиракуз, 301 BC.
Тебе дан закон, предложенный Консулом, и список материализованных сенаторов с их фракциями.
Твоя задача — сгенерировать живые, неповторимые речи каждого сенатора, реагирующие именно на ЭТОТ закон.

ВАЖНО:
- Каждый сенатор говорит своим голосом, исходя из интересов своей фракции и характера
- Речи должны упоминать конкретные детали закона, а не быть шаблонными
- Если закон выглядит абсурдным, опасным или радикальным — сенаторы должны реагировать остро: кричать, угрожать вето, требовать снятия вопроса
- Оцени "radicalism" закона: 0=обычный, 1=смелый, 2=радикальный, 3=абсурдный/скандальный
- При radicalism >= 2 добавь dramatic_event

Отвечай ТОЛЬКО JSON, никакого текста вне JSON, никакого markdown.

Схема ответа:
{
  "opening_cry": "Реакция зала на объявление закона — 1 короткая фраза",
  "speaker_lines": [
    {
      "name": "точное имя из speakers",
      "speech": "Речь 2-3 предложения в духе античности, про конкретный закон",
      "vote": "for|against|abstain",
      "intensity": "mild|strong|fierce"
    }
  ],
  "radicalism": 0,
  "dramatic_event": null
}

Формат dramatic_event (только при radicalism >= 2):
{
  "type": "walkout|shouting|demand_withdrawal|veto_threat|amendment_call",
  "text": "Описание скандала — 1-2 предложения"
}`,

    user: `ЗАКОН: «${law.name}»
ТЕКСТ ЗАКОНА: ${law.text || '(не указан)'}
ТИП: ${law.type}
РЕЧЬ КОНСУЛА ПЕРЕД СЕНАТОМ: ${playerSpeech || '(Консул не произнёс речи)'}

МАТЕРИАЛИЗОВАННЫЕ СЕНАТОРЫ:
${speakers.map(s => `- ${s.name} (фракция: ${s.faction_id}, лояльность: ${Math.round(s.loyalty_score)}, черты: ${(s.traits ?? []).join(', ')})`).join('\n')}

КОНТЕКСТ СЕНАТА:
${senateCtx ? JSON.stringify(senateCtx, null, 2) : '(нет дополнительного контекста)'}

Сгенерируй речи всех перечисленных сенаторов и реакцию зала.`,
  }),

  // ──────────────────────────────────────────────────────────
  // 10. АНАЛИЗ ЗАКОНА И ИЗВЛЕЧЕНИЕ ИГРОВЫХ ИЗМЕНЕНИЙ
  // ──────────────────────────────────────────────────────────
  analyzeLawEffects: (law, nation, arch) => ({
    system: `Ты — парсер законов исторической стратегии «Сиракузы 301 BC».
Читаешь текст принятого закона и возвращаешь JSON с конкретными изменениями игровых переменных.

ДОПУСТИМЫЕ ПУТИ (только они):
- "senate_config.state_architecture.senate_capacity"  → int 50-600 (число мест в Сенате)
- "senate_config.state_architecture.consul_term"       → int 1-10 (срок Консула в годах)
- "senate_config.state_architecture.consul_powers"     → "Limited"|"Standard"|"Dictatorial"
- "senate_config.state_architecture.voting_system"     → "Plutocracy"|"Meritocracy"|"Democracy"
- "senate_config.state_architecture.veto_rights"       → true|false (право вето трибуна)
- "senate_config.state_architecture.election_cycle"    → int 1-10 (лет между выборами)
- "senate_config.factions.aristocrats.seats"           → int (кресла аристократов)
- "senate_config.factions.demos.seats"                 → int (кресла народной партии)
- "senate_config.factions.military.seats"              → int (кресла военной фракции)
- "senate_config.factions.merchants.seats"             → int (кресла торговцев)
- "economy.tax_rate"                                   → float 0.05-0.35
- "economy.treasury"                                   → int (op: "add", разовое изменение)
- "military.infantry"                                  → int (op: "add", разовое изменение)
- "population.happiness"                               → int (op: "add", -30..30)
- "government.legitimacy"                              → int (op: "add", -20..20)

ПРАВИЛА:
- Применяй изменение только если в тексте закона прямо указано число или факт
- Не выдумывай изменения которых нет в тексте
- op="set" — задаёт конкретное значение, op="add" — прибавляет к текущему
- Если закон ничего не меняет из списка → changes: []

Отвечай ТОЛЬКО JSON, без markdown.

Схема:
{
  "changes": [
    { "path": "senate_config.state_architecture.senate_capacity", "op": "set", "value": 110 }
  ],
  "narrative": "Короткое (1 предложение) описание что изменилось в механике игры"
}`,

    user: `ПРИНЯТЫЙ ЗАКОН: «${law.name}»
ТЕКСТ: ${law.text || '(нет текста)'}
ТИП: ${law.type}

ТЕКУЩИЕ ЗНАЧЕНИЯ (для op="add"):
- Сенат: ${arch?.senate_capacity ?? '?'} мест, срок Консула: ${arch?.consul_term ?? '?'} лет
- Система голосования: ${arch?.voting_system ?? '?'}
- Полномочия Консула: ${arch?.consul_powers ?? '?'}
- Право вето: ${arch?.veto_rights ?? false}
- Налоговая ставка: ${nation?.economy?.tax_rate ?? '?'}
- Казна: ${Math.round(nation?.economy?.treasury ?? 0)} монет

Извлеки конкретные игровые изменения из этого закона.`,
  }),
};
