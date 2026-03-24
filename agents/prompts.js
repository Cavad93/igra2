// agents/prompts.js — все 5 промптов для Claude API

const SYSTEM_BASE = `Ты архитектор игровой экономики Pax Historia (304 BC, Сицилия).
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

// ─── ПРОМПТ 2: Конструктор производственной цепочки ─────────────────────────

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

export function buildGraphPrompt(ctx) {
  const { completeChainsData } = ctx;

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify({ chains_data: completeChainsData }, null, 2)}

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
- critical_nodes: товары которые блокируют 3+ других цепочек (сортировать по blocks_count desc)
- circular_dependencies: циклические зависимости (A→B→C→A)
- overloaded_classes: классы занятые в 5+ зданиях одновременно
- summary: общая статистика по всем цепочкам`;

  return { system, user };
}
