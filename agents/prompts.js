// agents/prompts.js — все промпты для Claude API

const SYSTEM_BASE = `Ты архитектор игровой экономики Pax Historia (304 BC, весь известный мир).
Игра охватывает весь античный мир: от Иберии до Индии, от Скифии до Нубии.
Сицилия и Сиракузы — лишь одна из ~200 наций, наравне с Карфагеном, Римом, Египтом, державой Селевкидов, Маурьями, Цинь, скифами и сотнями других государств и народов.
Производственные цепочки должны отражать реалии ВСЕГО региона, в котором производится данный товар.
Используй только реальные исторические данные из контекста.
Отвечай ТОЛЬКО валидным JSON. Никакого текста вне JSON.`;

// ─── ПРОМПТ 1: Аналитик производства ────────────────────────────────────────

export function buildAnalystPrompt(ctx) {
  const { goodId, allData } = ctx;
  const goodData   = allData.GOODS[goodId]     ?? {};
  const goodMeta   = allData.GOODS_META[goodId] ?? {};
  const pdfChains  = Object.values(allData.PDF_CHAINS)
    .filter(c => Array.isArray(c.inputs) && c.inputs.includes(goodId));

  // Все регионы принадлежащие нациям/государствам (neutral = пустые территории — исключаем)
  // Компактный формат: n=nation, t=terrain(=биом), d=deposits (только если есть)
  const nationRegions = {};
  for (const [rId, rData] of Object.entries(allData.REGIONS_DATA)) {
    if (!rData.nation || rData.nation === 'neutral') continue;
    const entry = {
      n: rData.nation,
      t: rData.terrain ?? rData.type ?? '',
    };
    if (rData.deposits && Object.keys(rData.deposits).length > 0) {
      entry.d = rData.deposits;
    }
    nationRegions[rId] = entry;
  }

  // Бонус производства этого конкретного товара по каждому биому
  // + общая пригодность для сельского хозяйства
  const biomeGoodBonus = {};
  for (const [biomeId, bData] of Object.entries(allData.BIOME_META ?? {})) {
    if (typeof bData !== 'object' || bData === null || Array.isArray(bData)) continue;
    biomeGoodBonus[biomeId] = {
      good_bonus:    bData.goods_bonus?.[goodId]           ?? 1.0,
      agri_suit:     bData.agriculture?.suitability        ?? null,
      prod_bonus:    bData.production_bonus?.[goodId]      ?? null,
    };
  }

  const ctxMeta = {
    good_id:   goodId,
    good_data: goodData,
    good_meta: goodMeta,
    nation_regions_total: Object.keys(nationRegions).length,
    // Для каждого биома: бонус именно для этого товара + пригодность под с/х
    biome_bonuses_for_this_good: biomeGoodBonus,
    pdf_chains_using_this_good: pdfChains.slice(0, 10),
  };

  const system = SYSTEM_BASE;
  // nation_regions передаём без отступов чтобы сократить размер
  const user = `${JSON.stringify(ctxMeta, null, 2)}

nation_regions (n=nation, t=terrain/биом, d=deposits):
${JSON.stringify(nationRegions)}

Задача: проанализируй производство товара "${goodId}" и верни JSON:
{
  "production_possible": boolean,
  "production_locations": string[],
  "import_required": boolean,
  "import_sources": string[],
  "relevant_pdf_chain_ids": number[]
}

Поля:
- production_possible: можно ли производить локально в регионах карты
- production_locations: список ID регионов из nation_regions где есть нужный deposit (d) или подходящий terrain (t) для этого товара согласно good_meta.allowed_terrains
- import_required: нужен ли импорт если нет локального производства
- import_sources: ID наций-поставщиков из good_meta.import_sources или исторических данных
- relevant_pdf_chain_ids: ID цепочек из pdf_chains_using_this_good плюс цепочки где этот товар в output
Примечание: nation_regions — формат {regionId: {n: nation, t: terrain/биом, d?: deposits}}`;

  return { system, user };
}

// ─── ПРОМПТ 0: Исторический исследователь (запускается один раз до цикла) ────
// Генерирует исторический контекст для всех товаров разом.
// ctx: { allData }

export function buildHistoricalPrompt(ctx) {
  const { allData } = ctx;

  const goodsSummary = Object.entries(allData.GOODS).map(([id, g]) => ({
    id,
    category: g.category,
    resource_type: allData.GOODS_META?.[id]?.resource_type ?? 'unknown',
    is_strategic: allData.GOODS_META?.[id]?.is_strategic ?? false,
    import_sources: allData.GOODS_META?.[id]?.import_sources ?? [],
  }));

  const nationsSummary = Object.entries(allData.NATIONS).slice(0, 30).map(([id, n]) => ({
    id,
    government: n.government?.type ?? 'unknown',
    region_count: (n.regions ?? []).length,
  }));

  const context = {
    game_setting: '304 BC, весь известный мир: от Иберии до Индии, от Скифии до Нубии',
    goods: goodsSummary,
    major_nations_sample: nationsSummary,
    total_nations: Object.keys(allData.NATIONS).length,
    deposit_keys: Object.keys(allData.DEPOSIT_MAP ?? {}),
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: для каждого товара в goods создай исторически точный контекст и верни JSON:
{
  "<good_id>": {
    "world_context": string,
    "primary_producers": string[],
    "major_trade_routes": string[],
    "labor_model": string,
    "strategic_importance": string,
    "historical_note_304bc": string
  }
}

ПРАВИЛА:
- world_context: где в мире 304 BC производится этот товар (2-3 предложения, весь мир)
- primary_producers: ID наций из nations которые реально производили/контролировали этот товар
- major_trade_routes: реальные торговые маршруты с этим товаром
- labor_model: кто производил (рабы, крестьяне, ремесленники, государство)
- strategic_importance: военное/политическое значение
- historical_note_304bc: специфика именно 304 BC (войны, события влиявшие на производство)
- Охватывай ВЕСЬ мир, не только Грецию/Рим/Сицилию`;

  return { system, user };
}

// ─── ПРОМПТ 2a: Производственная механика (количественная часть) ─────────────
// Заменяет первую половину старого buildChainPrompt.
// Отвечает только за: building, inputs, output, output_per_turn, biome_modifiers,
//                     bottleneck, alternative_good

export function buildQuantityPrompt(ctx) {
  const { goodId, allData, analystResult, historicalCtx } = ctx;

  const relevantBuildings = {};
  for (const [bId, bData] of Object.entries(allData.BUILDINGS)) {
    const outputs = bData.outputs ?? bData.output ?? {};
    if (outputs[goodId] !== undefined) {
      relevantBuildings[bId] = {
        name:              bData.name,
        worker_profession: bData.worker_profession,
        terrain_restriction: bData.terrain_restriction ?? null,
        production_output: outputs,
        workers_per_unit:  bData.workers_per_unit ?? null,
      };
    }
  }
  const allBuildingIds = Object.keys(allData.BUILDINGS);

  const biomeGoodBonus = {};
  for (const [biomeId, bData] of Object.entries(allData.BIOME_META ?? {})) {
    if (typeof bData !== 'object' || bData === null || Array.isArray(bData)) continue;
    const bonus = bData.goods_bonus?.[goodId] ?? 1.0;
    if (bonus !== 1.0) biomeGoodBonus[biomeId] = bonus;
  }

  // Из goods_meta: inputs (что нужно для производства)
  const goodMeta = allData.GOODS_META?.[goodId] ?? {};
  const goodLaborRef = allData.GOODS_LABOR?.[goodId] ?? {};

  const relevantChains = (analystResult.relevant_pdf_chain_ids ?? [])
    .map(id => allData.PDF_CHAINS?.[String(id)] ?? allData.PDF_CHAINS?.[id])
    .filter(Boolean).slice(0, 8);

  const context = {
    good_id:          goodId,
    good_data:        allData.GOODS[goodId] ?? {},
    good_meta:        goodMeta,
    analyst_result:   analystResult,
    historical_context: historicalCtx ?? null,
    relevant_buildings: relevantBuildings,
    all_building_ids:   allBuildingIds,
    biome_modifiers_ref: biomeGoodBonus,
    calibration_target:  {
      base_output_per_turn: goodLaborRef.base_output_per_turn ?? null,
      note: 'output_per_turn должен быть 0.1x–10x от base_output_per_turn',
    },
    relevant_pdf_chains: relevantChains,
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: опиши ПРОИЗВОДСТВЕННУЮ МЕХАНИКУ товара "${goodId}" и верни JSON:
{
  "building": string,
  "inputs": [{ "good": string, "quantity": number, "source": "local|import|deposit" }],
  "output": { "good": "${goodId}", "quantity": number },
  "output_per_turn": number,
  "biome_modifiers": { "<biome_id>": number },
  "bottleneck": string,
  "alternative_good": string | null
}

ПРАВИЛА:
- building: из relevant_buildings (предпочтительно) или all_building_ids
- inputs: товары необходимые для производства (из good_meta.inputs или логически)
- output.good ДОЛЖНО быть "${goodId}"
- output_per_turn: близко к calibration_target.base_output_per_turn (0.1x–10x)
- biome_modifiers: значения из biome_modifiers_ref, для biome/hybrid товаров заполнить все значимые биомы
- bottleneck: конкретная историческая уязвимость (минимум 30 символов)
- alternative_good: товар-замена при дефиците (null если нет)`;

  return { system, user };
}

// ─── ПРОМПТ 2b: Трудовые отношения и собственность ───────────────────────────
// Отвечает только за: workers, ownership, class_conflicts (контекст)

export function buildLaborPrompt(ctx) {
  const { goodId, allData, analystResult, quantityResult, historicalCtx } = ctx;

  // Классы с релевантными характеристиками
  const classesFull = {};
  for (const [cId, cData] of Object.entries(allData.SOCIAL_CLASSES ?? {})) {
    classesFull[cId] = {
      name:         cData.name,
      wealth_level: cData.wealth_level,
      typical_work: cData.typical_work ?? cData.description ?? '',
      needs_this_good: !!(cData.needs?.[goodId]),
    };
  }

  // Законы труда — все релевантные категории
  const LABOR_CATEGORIES = ['slavery', 'farming', 'crafts', 'maritime', 'labor', 'construction', 'mining'];
  const relevantLaws = {};
  for (const [lawId, lawData] of Object.entries(allData.LAWS_LABOR ?? {})) {
    if (LABOR_CATEGORIES.includes(lawData.category) ||
        LABOR_CATEGORIES.some(cat => (lawData.group ?? '').startsWith(cat))) {
      relevantLaws[lawId] = { name: lawData.name, effects: lawData.effects };
    }
  }

  // Формы правления по нациям
  const govTypeCounts = {};
  for (const nData of Object.values(allData.NATIONS ?? {})) {
    const gt = nData.government?.type ?? 'unknown';
    govTypeCounts[gt] = (govTypeCounts[gt] ?? 0) + 1;
  }

  // Исторические ограничения труда из goods_labor
  const laborRef = allData.GOODS_LABOR?.[goodId] ?? null;

  const context = {
    good_id:           goodId,
    good_meta:         allData.GOODS_META?.[goodId] ?? {},
    production_building: quantityResult?.building ?? null,
    analyst_result:    analystResult,
    historical_context: historicalCtx ?? null,
    social_classes:    classesFull,
    labor_laws:        relevantLaws,
    government_type_distribution: govTypeCounts,
    historical_labor_constraints: laborRef,
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: опиши ТРУДОВЫЕ ОТНОШЕНИЯ для производства "${goodId}" и верни JSON:
{
  "workers": {
    "primary_class": string,
    "secondary_class": string | null,
    "slave_ratio": number,
    "total_needed": number
  },
  "ownership": {
    "default": string,
    "under_tyranny": string,
    "under_oligarchy": string,
    "under_republic": string
  }
}

ПРАВИЛА:
- primary_class: из historical_labor_constraints.primary_classes (если задано) или social_classes
- secondary_class: надсмотрщик/мастер или null; из historical_labor_constraints.secondary_classes
- slave_ratio: СТРОГО в диапазоне historical_labor_constraints.min_slave_ratio – max_slave_ratio
- total_needed: близко к historical_labor_constraints.workers_per_building
- ownership: отражает реальную собственность в зависимости от типа правления
  * tyranny → государство или тиран
  * oligarchy → аристократы или частные лица
  * republic → граждане или государство
  * default → наиболее распространённая форма в 304 BC для этого товара
- все значения в ownership должны быть ID из social_classes или "state"`;

  return { system, user };
}

// ─── ПРОМПТ 2: Конструктор производственной цепочки (УСТАРЕЛ, для совместимости) ─
// Оставлен как fallback. В основном pipeline используется 2a+2b.

export function buildChainPrompt(ctx) {
  const { goodId, allData, analystResult } = ctx;

  // Здания, которые производят этот товар (output содержит goodId)
  const relevantBuildings = {};
  for (const [bId, bData] of Object.entries(allData.BUILDINGS)) {
    const outputs = bData.outputs ?? bData.output ?? {};
    if (outputs[goodId] !== undefined) {
      relevantBuildings[bId] = bData;
    }
  }

  const relevantChains = (analystResult.relevant_pdf_chain_ids ?? [])
    .map(id => allData.PDF_CHAINS[String(id)] ?? allData.PDF_CHAINS[id])
    .filter(Boolean);

  // Краткий список всех ID зданий для справки
  const allBuildingIds = Object.keys(allData.BUILDINGS);

  // Классы: id → {name, wealth_level, typical_work} — достаточно для выбора workers
  const classesSummary = {};
  for (const [cId, cData] of Object.entries(allData.SOCIAL_CLASSES ?? {})) {
    classesSummary[cId] = {
      name:         cData.name,
      wealth_level: cData.wealth_level,
      // потребность в этом товаре (есть ли у класса needs на него)
      needs_this_good: !!(cData.needs?.[goodId]),
    };
  }

  // Бонус этого товара по биомам — для biome_modifiers в ответе
  const biomeGoodBonus = {};
  for (const [biomeId, bData] of Object.entries(allData.BIOME_META ?? {})) {
    if (typeof bData !== 'object' || bData === null || Array.isArray(bData)) continue;
    const bonus = bData.goods_bonus?.[goodId] ?? 1.0;
    if (bonus !== 1.0) biomeGoodBonus[biomeId] = bonus; // передаём только не-единичные бонусы
  }

  // Законы труда — группируем по категории, передаём только id+name+effects
  // Категории релевантные для производственных цепочек
  const LABOR_CATEGORIES = ['slavery', 'farming', 'crafts', 'maritime', 'labor'];
  const relevantLaws = {};
  for (const [lawId, lawData] of Object.entries(allData.LAWS_LABOR ?? {})) {
    if (LABOR_CATEGORIES.includes(lawData.category) || LABOR_CATEGORIES.includes(lawData.group?.split('_')[0])) {
      relevantLaws[lawId] = {
        name:    lawData.name,
        effects: lawData.effects,
      };
    }
  }

  // Нации: government_type → для поля ownership (кто владеет при какой форме правления)
  const nationGovTypes = {};
  for (const [nId, nData] of Object.entries(allData.NATIONS ?? {})) {
    const govType = nData.government?.type ?? nData.government_type ?? 'unknown';
    if (!nationGovTypes[govType]) nationGovTypes[govType] = [];
    nationGovTypes[govType].push(nId);
  }

  const context = {
    good_id:             goodId,
    good_data:           allData.GOODS[goodId] ?? {},
    good_meta:           allData.GOODS_META[goodId] ?? {},
    analyst_result:      analystResult,
    relevant_buildings:  relevantBuildings,
    all_building_ids:    allBuildingIds,
    social_classes:      classesSummary,
    biome_modifiers_ref: biomeGoodBonus,
    labor_laws:          relevantLaws,           // полные законы труда (farming/slavery/crafts/maritime)
    nation_gov_types:    nationGovTypes,         // {gov_type: [nation_ids]} для поля ownership
    relevant_pdf_chains: relevantChains,
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: опиши производственную цепочку для товара "${goodId}" и верни JSON:
{
  "building": string,
  "inputs": [{ "good": string, "quantity": number, "source": "local|import|deposit" }],
  "output": { "good": string, "quantity": number },
  "workers": {
    "primary_class": string,
    "secondary_class": string | null,
    "slave_ratio": number,
    "total_needed": number
  },
  "ownership": {
    "default": string,
    "under_tyranny": string,
    "under_oligarchy": string,
    "under_republic": string
  },
  "output_per_turn": number,
  "biome_modifiers": { "<biome_id>": number },
  "bottleneck": string,
  "alternative_good": string | null
}

Используй только ID зданий из relevant_buildings или all_building_ids.
Используй только ID классов из social_classes (ключи объекта).
biome_modifiers: используй значения из biome_modifiers_ref (биомы с бонусом ≠ 1.0).
slave_ratio: определи из labor_laws (slavery_* законы → effects.slave_ratio или effects.labor_laws).
ownership: используй nation_gov_types чтобы понять какие формы правления реально существуют.`;

  return { system, user };
}

// ─── ПРОМПТ 3b: Rebuild Connector — полный граф (после генерации всех цепочек) ─
// Вызывается один раз в конце. Пересчитывает upstream/downstream для ВСЕХ цепочек
// зная полный граф.

export function buildRebuildConnectorPrompt(ctx) {
  const { allChains, allData } = ctx;

  // Краткий граф: кто что производит из чего
  const chainGraph = {};
  for (const [id, ch] of Object.entries(allChains)) {
    chainGraph[id] = {
      building:   ch.building,
      inputs:     (ch.inputs ?? []).map(i => ({ good: i.good, source: i.source })),
      output:     ch.output?.good,
      critical_node: ch.critical_node ?? false,
    };
  }

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify({ chain_graph: chainGraph, all_good_ids: Object.keys(allData.GOODS) }, null, 2)}

Задача: пересчитай связи ВСЕХ цепочек зная полный граф и верни JSON:
{
  "<good_id>": {
    "upstream_chains": string[],
    "downstream_chains": string[],
    "critical_node": boolean,
    "blocks_if_missing": string[],
    "economic_loops": string[]
  }
}

ПРАВИЛА:
- upstream_chains: все товары из chain_graph которые являются inputs[].good для данной цепочки (source=local)
- downstream_chains: все товары из chain_graph которые используют данный товар как input
- critical_node: блокирует 3+ цепочек если отсутствует
- blocks_if_missing: список good_id которые невозможно произвести без этого товара
- economic_loops: описание круговых зависимостей (A нужен B нужен A)
- Верни ТОЛЬКО те good_id которые есть в chain_graph`;

  return { system, user };
}

// ─── ПРОМПТ 3: Коннектор — связи между цепочками ────────────────────────────

export function buildConnectorPrompt(ctx) {
  const { goodId, allData, chainResult, existingChains } = ctx;

  // Передаём только краткую сводку существующих цепочек (без полных объектов)
  const chainsSummary = {};
  for (const [gId, ch] of Object.entries(existingChains)) {
    chainsSummary[gId] = {
      building: ch.building,
      inputs: (ch.inputs ?? []).map(i => i.good),
      output: ch.output?.good,
    };
  }

  // Только цепочки PDF где участвует этот товар (как input или output)
  const relatedPdfChains = Object.values(allData.PDF_CHAINS).filter(c => {
    const inputs  = Array.isArray(c.inputs)  ? c.inputs  : [];
    const outputs = Array.isArray(c.outputs) ? c.outputs : (c.output ? [c.output] : []);
    return inputs.includes(goodId) || outputs.includes(goodId);
  }).slice(0, 15);

  const context = {
    good_id:          goodId,
    chain_result:     chainResult,
    existing_chains_summary: chainsSummary,
    all_good_ids:     Object.keys(allData.GOODS),
    related_pdf_chains: relatedPdfChains,
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: найди связи цепочки "${goodId}" с другими цепочками и верни JSON:
{
  "upstream_chains": string[],
  "downstream_chains": string[],
  "critical_node": boolean,
  "blocks_if_missing": string[],
  "class_conflicts": string[],
  "economic_loops": string[]
}

Поля:
- upstream_chains: ID товаров-цепочек из existing_chains которые поставляют inputs для этой цепочки
- downstream_chains: ID товаров-цепочек из existing_chains которые используют "${goodId}" как input
- critical_node: блокирует ли отсутствие этого товара 3 или более других цепочек
- blocks_if_missing: что ломается без этого товара (цепочки или системы)
- class_conflicts: конфликты классов (из CLASS_CONFLICTS) в этом здании
- economic_loops: описания круговых зависимостей через PDF цепочки`;

  return { system, user };
}

// ─── ПРОМПТ 4: Валидатор ─────────────────────────────────────────────────────

export function buildValidatorPrompt(ctx) {
  const { goodId, allResults, allData } = ctx;

  // Краткий сниппет структуры goods_meta для валидации
  const goodsMeta = allData.GOODS_META[goodId] ?? {};
  const buildingIds = Object.keys(allData.BUILDINGS);
  const goodIds     = Object.keys(allData.GOODS);
  const classIds    = Object.keys(allData.SOCIAL_CLASSES);

  const context = {
    good_id:      goodId,
    all_results:  allResults,
    goods_meta:   goodsMeta,
    valid_building_ids: buildingIds,
    valid_good_ids:     goodIds,
    valid_class_ids:    classIds,
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: проверь согласованность данных для "${goodId}" и верни JSON:
{
  "valid": boolean,
  "warnings": string[],
  "conflicts": string[],
  "ready_to_write": boolean
}

Проверяй:
- building из all_results.building существует в valid_building_ids
- все inputs[*].good существуют в valid_good_ids
- workers.primary_class и secondary_class существуют в valid_class_ids
- slave_ratio между 0 и 1
- output_per_turn > 0
- biome_modifiers ключи — реальные биомы (не пустой объект для biome-товаров)
- valid: true только если нет conflicts`;

  return { system, user };
}

// ─── ПРОМПТ 5: Граф всех цепочек ─────────────────────────────────────────────

// ─── ПРОМПТ 6: Исправление ошибок валидации ──────────────────────────────────
// Вызывается когда validateChain или validateCrossChains находят ERR-ошибки.
// ctx содержит:
//   chain      — исходная цепочка с ошибками
//   issues     — массив ошибок из validator.js
//   allData    — справочные данные
//   crossMode  — true если это межцепочечное исправление
//   allChains  — (только при crossMode) все существующие цепочки

export function buildFixPrompt(ctx) {
  const { chain, issues, allData, crossMode = false, allChains = {} } = ctx;

  // Только ERR-ошибки (WARN не требуют исправления)
  const errors = issues.filter(i => i.severity === 'ERR');
  const warnings = issues.filter(i => i.severity === 'WARN');

  // Справочные данные для исправления
  const refs = {
    valid_building_ids: Object.keys(allData.BUILDINGS),
    valid_good_ids:     Object.keys(allData.GOODS),
    valid_class_ids:    Object.keys(allData.SOCIAL_CLASSES),
    valid_biome_ids:    Object.keys(allData.BIOME_META).filter(k => k !== '_region_biomes'),
    valid_nation_ids:   Object.keys(allData.NATIONS),
    // Здания производящие этот товар
    producing_buildings: Object.fromEntries(
      Object.entries(allData.BUILDINGS).filter(([, b]) => {
        const out = b.outputs ?? b.output ?? b.production_output ?? {};
        return out[chain.good_id] !== undefined;
      }).map(([id, b]) => [id, { name: b.name, worker_profession: b.worker_profession }])
    ),
    // biome_modifiers для этого товара
    biome_modifiers_ref: Object.fromEntries(
      Object.entries(allData.BIOME_META)
        .filter(([k, v]) => k !== '_region_biomes' && typeof v === 'object')
        .map(([k, v]) => [k, v.goods_bonus?.[chain.good_id] ?? 1.0])
        .filter(([, v]) => v !== 1.0)
    ),
  };

  // При межцепочечном исправлении добавляем сводку соседних цепочек
  const crossContext = crossMode ? {
    all_chain_ids: Object.keys(allChains),
    chains_that_use_this_as_input: Object.entries(allChains)
      .filter(([, c]) => (c.inputs ?? []).some(i => i.good === chain.good_id))
      .map(([id]) => id),
    chains_this_uses_as_input: (chain.inputs ?? []).map(i => i.good).filter(g => allChains[g]),
  } : null;

  const context = {
    good_id:       chain.good_id,
    current_chain: chain,
    errors:        errors.map(e => ({ code: e.code, msg: e.msg })),
    warnings:      warnings.map(w => ({ code: w.code, msg: w.msg })),
    refs,
    ...(crossContext ? { cross_chain_context: crossContext } : {}),
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: исправь ошибки в цепочке "${chain.good_id}" и верни ПОЛНЫЙ исправленный объект цепочки в JSON.

ПРАВИЛА ИСПРАВЛЕНИЯ:
- Исправляй ТОЛЬКО поля указанные в errors, остальные поля оставь без изменений
- building должен быть из refs.valid_building_ids (предпочтительно из producing_buildings)
- inputs[].good должны быть из refs.valid_good_ids
- output.good должно совпадать с good_id
- workers.primary_class и secondary_class должны быть из refs.valid_class_ids
- workers.slave_ratio: число от 0.0 до 1.0
- output_per_turn: положительное число
- biome_modifiers: ключи только из refs.valid_biome_ids, значения из refs.biome_modifiers_ref
- alternative_good: null или существующий good_id из refs.valid_good_ids (не равный good_id)
- Верни ПОЛНЫЙ объект цепочки со всеми полями (не только исправленные)`;

  return { system, user };
}

// ─── ПРОМПТ 5: Граф всех цепочек ─────────────────────────────────────────────
// Использует КОМПАКТНОЕ представление чтобы не превышать лимит токенов.

export function buildGraphPrompt(ctx) {
  const { completeChainsData } = ctx;

  // Компактный граф — только топологически важные поля, без полных объектов
  const compactGraph = {};
  for (const [id, ch] of Object.entries(completeChainsData)) {
    compactGraph[id] = {
      building:      ch.building,
      inputs:        (ch.inputs ?? []).map(i => ({ good: i.good, source: i.source })),
      output:        ch.output?.good,
      upstream:      ch.upstream_chains   ?? [],
      downstream:    ch.downstream_chains ?? [],
      critical_node: ch.critical_node     ?? false,
      score:         ch.quality_score     ?? 0,
      workers_class: ch.workers?.primary_class,
    };
  }

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify({ chain_graph: compactGraph }, null, 2)}

Задача: проанализируй граф всех производственных цепочек и верни JSON:
{
  "critical_nodes": [
    { "good": string, "blocks_count": number, "blocked_chains": string[] }
  ],
  "circular_dependencies": [
    { "cycle": string[], "description": string }
  ],
  "overloaded_classes": [
    { "class": string, "building_count": number, "buildings": string[] }
  ],
  "summary": {
    "total_chains": number,
    "import_dependent": number,
    "deposit_dependent": number,
    "fully_local": number
  }
}

Поля:
- critical_nodes: товары у которых |downstream| >= 3, сортировать по blocks_count desc
- circular_dependencies: циклические зависимости (A→B→C→A) из upstream/downstream
- overloaded_classes: классы занятые в 5+ зданиях одновременно
- summary: статистика по всем цепочкам в chain_graph`;

  return { system, user };
}

// ─── ПРОМПТ 7: Улучшение качества (для цепочек с score < SCORE_THRESHOLD) ────
// Вызывается когда chain.quality_score < 40.
// Не трогает правильные поля — наращивает качество в слабых местах.

export function buildImprovementPrompt(ctx) {
  const { chain, scoreBreakdown, allData } = ctx;

  // Определяем слабые места (score < 6 из 10-15 возможных)
  const weakAreas = Object.entries(scoreBreakdown ?? {})
    .filter(([, s]) => s < 6)
    .sort((a, b) => a[1] - b[1])
    .map(([key, score]) => key);

  // Справочники для исправления слабых мест
  const refs = {
    valid_building_ids:  Object.keys(allData.BUILDINGS),
    valid_good_ids:      Object.keys(allData.GOODS),
    valid_class_ids:     Object.keys(allData.SOCIAL_CLASSES),
    valid_biome_ids:     Object.keys(allData.BIOME_META).filter(k => k !== '_region_biomes'),
    biome_modifiers_ref: Object.fromEntries(
      Object.entries(allData.BIOME_META)
        .filter(([k, v]) => k !== '_region_biomes' && typeof v === 'object' && v !== null)
        .map(([k, v]) => [k, v.goods_bonus?.[chain.good_id] ?? 1.0])
        .filter(([, v]) => v !== 1.0)
    ),
    labor_ref:  allData.GOODS_LABOR?.[chain.good_id] ?? null,
    good_meta:  allData.GOODS_META?.[chain.good_id]  ?? {},
    pdf_chains_for_this_good: Object.values(allData.PDF_CHAINS ?? {})
      .filter(c => {
        const inputs  = Array.isArray(c.inputs)  ? c.inputs  : [];
        const outputs = Array.isArray(c.outputs) ? c.outputs : (c.output ? [c.output] : []);
        return inputs.includes(chain.good_id) || outputs.includes(chain.good_id);
      })
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.name, inputs: c.inputs, output: c.output })),
  };

  // Конкретные подсказки по слабым местам
  const hints = {};
  if (weakAreas.includes('biome_modifiers')) {
    hints.biome_modifiers =
      'Заполни biome_modifiers для всех биомов из refs.biome_modifiers_ref (bonus ≠ 1.0). ' +
      'Для biome/hybrid товаров обязательно минимум 3 записи.';
  }
  if (weakAreas.includes('upstream')) {
    hints.upstream =
      'upstream_chains: перечисли good_id из refs.valid_good_ids которые являются inputs для этой цепочки';
  }
  if (weakAreas.includes('bottleneck')) {
    hints.bottleneck =
      'bottleneck: расширь до 40+ символов с конкретной исторической уязвимостью (нехватка ресурса, блокада, сезонность)';
  }
  if (weakAreas.includes('pdf_refs')) {
    hints.pdf_refs =
      `pdf_chain_ids: добавь ID из refs.pdf_chains_for_this_good — они напрямую связаны с ${chain.good_id}`;
  }
  if (weakAreas.includes('ownership_variety')) {
    hints.ownership =
      'ownership: сделай все 4 поля (default/under_tyranny/under_oligarchy/under_republic) разными — ' +
      'отражай реальную разницу между формами правления';
  }
  if (weakAreas.includes('inputs_diversity')) {
    hints.inputs =
      'inputs: добавь минимум 2 разных ресурса с разными source (local + import или deposit). ' +
      'Все good из refs.valid_good_ids.';
  }

  const context = {
    good_id:          chain.good_id,
    current_chain:    chain,
    quality_score:    chain.quality_score,
    score_breakdown:  scoreBreakdown,
    weak_areas:       weakAreas,
    improvement_hints: hints,
    refs,
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

Задача: улучши качество цепочки "${chain.good_id}" (текущий score: ${chain.quality_score}/100).
Слабые места: ${weakAreas.join(', ')}.

Верни ПОЛНЫЙ улучшенный объект цепочки в JSON:
- Исправляй ТОЛЬКО слабые места согласно improvement_hints
- НЕ меняй: good_id, generated_at, production_possible, production_locations, import_required, import_sources, building, workers
- Улучшай: biome_modifiers, upstream_chains, bottleneck, pdf_chain_ids, ownership, inputs, class_conflicts, economic_loops
- Все ключи из refs.valid_biome_ids, refs.valid_good_ids, refs.valid_class_ids`;

  return { system, user };
}
