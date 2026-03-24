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

  // Фильтруем только регионы с deposit для этого товара (или, для biome-ресурсов, с нужным биомом)
  const allowedBiomes = new Set(goodMeta.allowed_terrains ?? []);
  const REGION_BIOMES = allData.BIOME_META?._region_biomes ?? {};
  const relevantRegions = {};
  for (const [rId, rData] of Object.entries(allData.REGIONS_DATA)) {
    const hasDeposit = rData.deposits && rData.deposits[goodId] !== undefined;
    const biome = REGION_BIOMES[rId] ?? rData.biome ?? rData.terrain ?? '';
    const matchesBiome = allowedBiomes.size > 0 && allowedBiomes.has(biome);
    if (hasDeposit || matchesBiome) {
      relevantRegions[rId] = {
        nation: rData.nation,
        terrain: rData.terrain ?? rData.type,
        deposit: rData.deposits?.[goodId],
        biome,
      };
    }
  }
  // Ограничиваем до 50 регионов (приоритет — с deposit)
  const depositRegions = Object.entries(relevantRegions).filter(([, r]) => r.deposit);
  const biomeRegions   = Object.entries(relevantRegions).filter(([, r]) => !r.deposit);
  const trimmedEntries = [...depositRegions, ...biomeRegions].slice(0, 50);
  const trimmedRegions = Object.fromEntries(trimmedEntries);

  const context = {
    good_id:      goodId,
    good_data:    goodData,
    good_meta:    goodMeta,
    relevant_regions: trimmedRegions,
    relevant_regions_count: Object.keys(relevantRegions).length,
    biome_meta:   allData.BIOME_META,
    pdf_chains_using_this_good: pdfChains.slice(0, 10),
  };

  const system = SYSTEM_BASE;
  const user = `${JSON.stringify(context, null, 2)}

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
- production_locations: список ID регионов где есть подходящий deposit или биом
- import_required: нужен ли импорт если нет локального производства
- import_sources: ID наций-поставщиков из good_meta.import_sources или исторических данных
- relevant_pdf_chain_ids: ID цепочек из pdf_chains_using_this_good плюс цепочки где этот товар в output`;

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

  // Только ID и названия классов (не полная структура)
  const classIds = Object.keys(allData.SOCIAL_CLASSES);

  // Только основные типы труда из labor_laws
  const laborSummary = {
    slavery_allowed: allData.LAWS_LABOR?.slavery?.default?.slaves_allowed ?? true,
    typical_slave_ratio: 0.3,
  };

  const context = {
    good_id:            goodId,
    good_data:          allData.GOODS[goodId] ?? {},
    good_meta:          allData.GOODS_META[goodId] ?? {},
    analyst_result:     analystResult,
    relevant_buildings: relevantBuildings,
    all_building_ids:   allBuildingIds,
    valid_class_ids:    classIds,
    labor_summary:      laborSummary,
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

Используй только ID зданий из relevant_buildings или all_buildings.
Используй только ID классов из social_classes.
slave_ratio: 0.0–1.0`;

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
