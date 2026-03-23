// ══════════════════════════════════════════════════════════════════════
// data/pdf_chains.js
// 100 производственных цепочек PAX HISTORIA
// 301 до н.э. — 476 н.э.
// Каждая цепочка — живая система с круговой причинностью.
// Три компонента: ЦЕПОЧКА (механика), УЯЗВИМОСТЬ, АЛЬТЕРНАТИВА.
// ══════════════════════════════════════════════════════════════════════

var PDF_CHAINS = {

  // ══════════════════════════════════════════════════════════════════════
  // ⚔ ВОЕННЫЕ (#1–18)
  // ══════════════════════════════════════════════════════════════════════

  // ===== ШАГ 1: #1–6 =====

  1: {
    id: 1,
    name: 'Железный кулак',
    name_key: 'iron_fist',
    category: 'military',
    nodes: ['iron_ore', 'charcoal', 'timber', 'forge', 'weapons', 'armor', 'army_quality', 'victories', 'mines'],
    inputs: ['iron', 'charcoal', 'timber'],
    output: 'weapons',
    primary_building: 'forge',
    is_circular: true,
    contradiction: null,
    bottleneck: 'Уголь редок на Сицилии — критическое импортное узкое место',
    bottleneck_goods: ['charcoal'],
    bottleneck_buildings: [],
    bottleneck_conditions: ['charcoal_import_blocked'],
    alternative: 'Бронза (медь + олово): дороже, но доступнее через Карфаген',
    alternative_chain_id: 44,
    alternative_good: 'bronze',
    historical_example: 'Агафокл закупал железо в Этрурии через посредников',
    historical_date: null,
    historical_figure: 'Агафокл',
    upstream_chain_ids: [],
    downstream_chain_ids: [2, 11, 13],
    is_crisis_chain: false,
    crisis_trigger: null,
    game_effects: {
      active_bonus: 'army_quality +30%, weapons_output +1',
      broken_penalty: 'army_quality -20%, weapons_output 0'
    },
    delay_turns: 2,
    warning_turns: 3
  },

  2: {
    id: 2,
    name: 'Военно-морская держава',
    name_key: 'naval_power',
    category: 'military',
    nodes: ['timber', 'pitch', 'hemp', 'shipyard', 'ships', 'sea_control', 'customs', 'piracy_suppressed', 'treasury', 'shipyard_funding'],
    inputs: ['timber', 'pitch', 'hemp'],
    output: 'ships',
    primary_building: 'shipyard',
    is_circular: true,
    contradiction: 'Сицилия исторически вырубала леса — флот убивает сам себя долгосрочно',
    bottleneck: 'Исчерпание лесов делает новые корабли невозможными',
    bottleneck_goods: ['timber'],
    bottleneck_buildings: ['shipyard'],
    bottleneck_conditions: ['timber_depleted'],
    alternative: 'Наёмный флот: быстро, но лояльность нулевая при задержке оплаты',
    alternative_chain_id: null,
    alternative_good: null,
    historical_example: 'Дионисий Сиракузский создал крупнейший флот Запада в 399 до н.э.',
    historical_date: '399 BC',
    historical_figure: 'Дионисий Сиракузский',
    upstream_chain_ids: [31],
    downstream_chain_ids: [9, 15, 18],
    is_crisis_chain: false,
    crisis_trigger: null,
    game_effects: {
      active_bonus: 'sea_control +1, customs_income +20%',
      broken_penalty: 'sea_control -1, trade_routes -1'
    },
    delay_turns: 3,
    warning_turns: 5
  },

  3: {
    id: 3,
    name: 'Наёмная машина',
    name_key: 'mercenary_machine',
    category: 'military',
    nodes: ['silver', 'gold', 'gaul_mercenaries', 'iberian_mercenaries', 'numidian_mercenaries', 'powerful_army', 'citizens_satisfied', 'taxes_paid', 'treasury'],
    inputs: ['silver', 'gold'],
    output: 'mercenary_army',
    primary_building: 'barracks',
    is_circular: true,
    contradiction: 'Поражение → наёмники уходят к врагу мгновенно',
    bottleneck: 'Без выплат армия разбегается за 1 ход; победа без добычи — убыток',
    bottleneck_goods: ['silver', 'gold'],
    bottleneck_buildings: [],
    bottleneck_conditions: ['treasury_empty', 'no_loot'],
    alternative: 'Гражданское ополчение: дешевле, но мобилизация снижает производство',
    alternative_chain_id: null,
    alternative_good: null,
    historical_example: 'Агафокл содержал 10 000 наёмников, финансируя их грабежом Карфагена',
    historical_date: null,
    historical_figure: 'Агафокл',
    upstream_chain_ids: [],
    downstream_chain_ids: [12, 46],
    is_crisis_chain: false,
    crisis_trigger: null,
    game_effects: {
      active_bonus: 'army_power +40%, citizen_happiness +10%',
      broken_penalty: 'army_power -60%, stability -2'
    },
    delay_turns: 1,
    warning_turns: 2
  },

  4: {
    id: 4,
    name: 'Осадное превосходство',
    name_key: 'siege_superiority',
    category: 'military',
    nodes: ['timber', 'engineers', 'iron_parts', 'catapults', 'ballistae', 'city_siege', 'fast_victories', 'fewer_losses', 'labor_preserved', 'production_stable'],
    inputs: ['timber', 'iron', 'engineers'],
    output: 'siege_weapons',
    primary_building: 'workshop',
    is_circular: true,
    contradiction: null,
    bottleneck: 'Производство требует 3–4 хода; без дерева — стагнация',
    bottleneck_goods: ['timber'],
    bottleneck_buildings: ['workshop'],
    bottleneck_conditions: ['no_engineers'],
    alternative: 'Длительная блокада: не нужна техника, но голод захватчика тоже растёт',
    alternative_chain_id: null,
    alternative_good: null,
    historical_example: 'Дионисий изобрёл катапульту — первое применение в Мотии 397 до н.э.',
    historical_date: '397 BC',
    historical_figure: 'Дионисий Сиракузский',
    upstream_chain_ids: [1],
    downstream_chain_ids: [],
    is_crisis_chain: false,
    crisis_trigger: null,
    game_effects: {
      active_bonus: 'siege_speed +50%, battle_losses -20%',
      broken_penalty: 'siege_speed -30%'
    },
    delay_turns: 3,
    warning_turns: 4
  },

  5: {
    id: 5,
    name: 'Конная разведка',
    name_key: 'cavalry_recon',
    category: 'military',
    nodes: ['stables', 'barley', 'steppe_allies', 'cavalry', 'flank_recon', 'attack_warning', 'fewer_surprise_losses', 'stable_rear_economy'],
    inputs: ['barley', 'horses'],
    output: 'cavalry',
    primary_building: 'stables',
    is_circular: true,
    contradiction: null,
    bottleneck: 'Ячмень конкурирует с питанием крестьян — выбор: лошади или люди',
    bottleneck_goods: ['barley', 'horses'],
    bottleneck_buildings: ['stables'],
    bottleneck_conditions: ['barley_shortage'],
    alternative: 'Шпионы: дешевле, но реакция медленнее на 2–3 хода',
    alternative_chain_id: 17,
    alternative_good: null,
    historical_example: 'Нумидийская конница была ключевым ресурсом Карфагена и Рима',
    historical_date: null,
    historical_figure: null,
    upstream_chain_ids: [],
    downstream_chain_ids: [10],
    is_crisis_chain: false,
    crisis_trigger: null,
    game_effects: {
      active_bonus: 'recon_range +2, surprise_attack_prevention +1',
      broken_penalty: 'recon_range 0, surprise_vulnerability +1'
    },
    delay_turns: 1,
    warning_turns: 2
  },

  6: {
    id: 6,
    name: 'Дорога как оружие',
    name_key: 'road_as_weapon',
    category: 'military',
    nodes: ['stone', 'slave_labor', 'paved_roads', 'troop_speed_x2', 'one_army_two_fronts', 'savings_on_second_army', 'treasury', 'construction'],
    inputs: ['stone', 'slaves'],
    output: 'roads',
    primary_building: 'construction_office',
    is_circular: true,
    contradiction: null,
    bottleneck: 'Строительство 1 дороги = 20–30 ходов и 500+ рабочих',
    bottleneck_goods: ['stone'],
    bottleneck_buildings: ['construction_office'],
    bottleneck_conditions: ['no_labor', 'no_stone'],
    alternative: 'Речные пути: бесплатно, но только вдоль рек',
    alternative_chain_id: null,
    alternative_good: null,
    historical_example: 'Via Appia 312 до н.э. — первая стратегическая дорога Рима',
    historical_date: '312 BC',
    historical_figure: null,
    upstream_chain_ids: [],
    downstream_chain_ids: [15],
    is_crisis_chain: false,
    crisis_trigger: null,
    game_effects: {
      active_bonus: 'army_movement_speed x2, supply_range +3',
      broken_penalty: 'army_movement_speed x1'
    },
    delay_turns: 20,
    warning_turns: 5
  }

};
