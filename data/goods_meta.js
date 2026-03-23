// ═══════════════════════════════════════════════════════════
// GOODS_META — природа и источник каждого товара
//
// resource_type:
//   biome       — производится там где подходящий terrain
//   deposit     — только там где region.deposits содержит deposit_key
//   hybrid      — нужен И terrain И deposit
//   processed   — производится из других товаров в здании
//   import_only — не производится на карте, только торговля
//   livestock   — живые существа, разводятся или покупаются
//
// Используется:
//   engine/buildings.js  — проверка условий строительства
//   agents/chain_builder — источник истины для цепочек
// ═══════════════════════════════════════════════════════════

var GOODS_META = {

  // ── ЗЕРНОВЫЕ И ПРОДОВОЛЬСТВИЕ ────────────────────────────

  wheat: {
    resource_type:             'biome',
    allowed_terrains:          ['plains', 'river_valley', 'mediterranean_coast',
                                'mediterranean_hills', 'steppe', 'temperate_forest',
                                'subtropical', 'volcanic'],
    terrain_bonus:             { river_valley: 1.40, plains: 1.15,
                                 mediterranean_coast: 1.10, volcanic: 1.05 },
    terrain_penalty:           { steppe: 0.85, temperate_forest: 0.80,
                                 semi_arid: 0.45, alpine: 0.20,
                                 desert: 0.05, arctic: 0.05, savanna: 0.30 },
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              true,
    chain_importance:          10,
    can_be_absent:             false,
    note: 'Основа питания. Сицилия — главный экспортёр зерна Средиземноморья',
  },

  barley: {
    resource_type:             'biome',
    allowed_terrains:          ['plains', 'river_valley', 'steppe',
                                'mediterranean_coast', 'mediterranean_hills',
                                'temperate_forest', 'semi_arid', 'volcanic'],
    terrain_bonus:             { river_valley: 1.30, plains: 1.10 },
    terrain_penalty:           { alpine: 0.25, arctic: 0.05, desert: 0.10 },
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              true,
    chain_importance:          7,
    can_be_absent:             false,
    note: 'Корм для лошадей и скота — конкурирует с едой людей (#5)',
  },

  fish: {
    resource_type:             'biome',
    allowed_terrains:          ['coastal_city', 'river_valley'],
    terrain_bonus:             { coastal_city: 1.30, river_valley: 1.10 },
    terrain_penalty:           {},
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          6,
    can_be_absent:             true,
    note: 'Дешёвый белок для армии (#21)',
  },

  olives: {
    resource_type:             'biome',
    allowed_terrains:          ['mediterranean_hills', 'mediterranean_coast',
                                'volcanic', 'subtropical'],
    terrain_bonus:             { mediterranean_hills: 1.35, volcanic: 1.15 },
    terrain_penalty:           { steppe: 0.30, temperate_forest: 0.20 },
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          5,
    can_be_absent:             true,
    note: '5–7 лет до первого урожая. Война рубит рощи (#20)',
  },

  wine: {
    resource_type:             'biome',
    allowed_terrains:          ['mediterranean_hills', 'volcanic',
                                'mediterranean_coast', 'subtropical',
                                'temperate_forest'],
    terrain_bonus:             { mediterranean_hills: 1.35, volcanic: 1.15 },
    terrain_penalty:           { steppe: 0.30, alpine: 0.20 },
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          5,
    can_be_absent:             true,
    note: 'Экспорт в варварские народы — высокая цена (#26)',
  },

  honey: {
    resource_type:             'biome',
    allowed_terrains:          ['plains', 'mediterranean_hills',
                                'mediterranean_coast', 'temperate_forest',
                                'volcanic', 'subtropical'],
    terrain_bonus:             { mediterranean_hills: 1.20 },
    terrain_penalty:           { desert: 0.10, arctic: 0.05 },
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          3,
    can_be_absent:             true,
    note: 'Гибла на Сицилии — лучший мёд античного мира (#30)',
  },

  // ── ГИБРИДНАЯ ЕДА (terrain + deposit) ────────────────────

  tuna: {
    resource_type:             'hybrid',
    allowed_terrains:          ['coastal_city'],
    terrain_bonus:             { coastal_city: 1.20 },
    terrain_penalty:           {},
    deposit_key:               'tuna_migration',
    tradeable_without_deposit: true,
    inputs:                    null,
    produced_by:               null,
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          4,
    can_be_absent:             true,
    note: 'Мессинский пролив — главная ловушка тунца Сицилии (#34)',
  },

  // ── ПЕРЕРАБОТАННАЯ ЕДА ───────────────────────────────────

  olive_oil: {
    resource_type:             'processed',
    allowed_terrains:          [],
    terrain_bonus:             {},
    terrain_penalty:           {},
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    { olives: 3 },
    produced_by:               'oil_press',
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          5,
    can_be_absent:             true,
    note: 'Масло — топливо ламп, основа кухни и тела в Античности',
  },

  wax: {
    resource_type:             'processed',
    allowed_terrains:          [],
    terrain_bonus:             {},
    terrain_penalty:           {},
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    { honey: 2 },
    produced_by:               'apiary',
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          2,
    can_be_absent:             true,
    note: 'Писчие таблички и герметичная упаковка; побочный продукт апиария',
  },

  meat: {
    resource_type:             'processed',
    allowed_terrains:          [],
    terrain_bonus:             {},
    terrain_penalty:           {},
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    { cattle: 1 },
    produced_by:               'butchery',
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          3,
    can_be_absent:             true,
    note: 'Скот на убой — праздничная и военная еда; кожа как побочный продукт',
  },

  garum: {
    resource_type:             'processed',
    allowed_terrains:          [],
    terrain_bonus:             {},
    terrain_penalty:           {},
    deposit_key:               null,
    tradeable_without_deposit: false,
    inputs:                    { fish: 3, salt: 1 },
    produced_by:               'garum_workshop',
    import_sources:            [],
    breed_terrains:            [],
    is_strategic:              false,
    chain_importance:          3,
    can_be_absent:             true,
    note: 'Рыбный соус — экспортный деликатес Рима (#21 #34)',
  },

};
