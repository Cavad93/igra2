// Определения зданий — демографические, экономические и производственные эффекты
//
// Новые поля (Этап 1):
//   worker_profession       [{profession, count}]  — кто и сколько работает в здании
//   wage_rate               0.0–0.35               — доля выручки, уходящая рабочим
//   labor_type              'wage'|'tenant'|'slave'|'mixed'|'self'|'state'|'none'
//   build_turns             int                    — сколько ходов строится
//   terrain_restriction     [string] | null        — допустимые типы местности (null = все суша)
//   region_tag_restriction  [string] | null        — регион должен иметь хотя бы один из этих тегов
//   max_per_region          int | null             — макс. экземпляров в одном регионе
//   max_level               int                    — максимальный уровень (1 = не улучшаемое)
//   production_output       [{good, base_rate}]    — товары/ход на 1000 задействованных рабочих
//
// Старые поля (backward-compat): profession_growth, capacity_bonus, mobility,
// mortality_mod, all_growth_mod, famine_mortality_mod, famine_protection,
// needs_satisfaction_bonus, war_mortality_mod, slave_mortality_mod,
// epidemic_chance_mod, mobility_speed_mod

const BUILDINGS = {

  // ══════════════════════════════════════════════════════════════
  // ИНФРАСТРУКТУРА
  // ══════════════════════════════════════════════════════════════

  port: {
    name:        'Порт',
    icon:        '⚓',
    description: 'Торговый порт. Обеспечивает работой моряков и торговцев, даёт рыбу и торговые товары.',
    cost:        800,
    category:    'infrastructure',
    footprint_ha: 8,   // причалы, склады, акватория
    // timber×10(220) + iron×5(225) + tools×3(105) = 550; labor=250 → ~800
    construction_materials: { timber: 10, iron: 5, tools: 3 },
    construction_labor:     250,

    worker_profession: [
      { profession: 'sailors',   count: 250 },
      { profession: 'merchants', count: 150 },
    ],
    wage_rate:          0.24,   // моряки и торговцы получают долю прибыли
    labor_type:         'wage',
    build_turns:        4,
    terrain_restriction: ['coastal_city'],
    max_per_region:     1,
    max_level:          1,

    production_output: [
      { good: 'fish',        base_rate: 60 },  // +60 рыбы/ход на 1000 моряков
      { good: 'trade_goods', base_rate: 40 },
    ],

    // legacy
    profession_growth: { sailors: 0.018, merchants: 0.010 },
    capacity_bonus:    3000,
  },

  shipyard: {
    name:        'Верфь',
    icon:        '🚢',
    description: 'Верфь для кораблей. Ремесленники строят суда, моряки их обслуживают.',
    cost:        1200,
    category:    'infrastructure',
    footprint_ha: 12,  // стапели, мастерские, береговая полоса
    // timber×20(440) + iron×10(450) + tools×5(175) = 1065; labor=135 → ~1200
    construction_materials: { timber: 20, iron: 10, tools: 5 },
    construction_labor:     135,

    worker_profession: [
      { profession: 'craftsmen', count: 300 },
      { profession: 'sailors',   count: 100 },
    ],
    wage_rate:          0.26,
    labor_type:         'wage',
    build_turns:        5,
    terrain_restriction: ['coastal_city'],
    max_per_region:     1,
    max_level:          1,

    production_output: [],   // выход — военные корабли, учитываются отдельно

    // legacy
    profession_growth: { sailors: 0.025, craftsmen: 0.010 },
    capacity_bonus:    2000,
  },

  market: {
    name:        'Рынок',
    icon:        '🏪',
    description: 'Городской рынок. Торговцы работают за комиссию, улучшают доступность товаров.',
    cost:        600,
    category:    'infrastructure',
    footprint_ha: 2,   // городская площадь с лавками
    // timber×8(176) + tools×4(140) = 316; labor=284 → ~600
    construction_materials: { timber: 8, tools: 4 },
    construction_labor:     284,

    worker_profession: [
      { profession: 'merchants', count: 200 },
    ],
    wage_rate:          0.30,   // торговцы-самозанятые оставляют себе маржу
    labor_type:         'self',
    build_turns:        3,
    terrain_restriction: null,  // строится на любой суше
    max_per_region:     1,
    max_level:          2,

    production_output: [],

    // Рынок улучшает доступность товаров — прямой бонус к счастью классов
    class_happiness_bonus: {
      citizens:        5,   // торговцы выигрывают от рынка
      craftsmen_class: 3,   // ремесленники легче сбывают продукцию
    },

    // legacy
    profession_growth:        { merchants: 0.015, craftsmen: 0.008 },
    needs_satisfaction_bonus: 0.05,
    capacity_bonus:           1500,
  },

  road: {
    name:        'Дорожная сеть',
    icon:        '🛤',
    description: 'Мощёные дороги. Государственные рабочие содержат трассу, ускоряя торговлю.',
    cost:        1000,
    category:    'infrastructure',
    footprint_ha: 1,   // линейная инфраструктура, минимальный отвод земли
    // timber×8(176) + iron×8(360) + tools×6(210) = 746; labor=254 → ~1000
    construction_materials: { timber: 8, iron: 8, tools: 6 },
    construction_labor:     254,

    worker_profession: [
      { profession: 'craftsmen', count: 50 },  // техобслуживание
    ],
    wage_rate:          0.15,
    labor_type:         'state',
    build_turns:        5,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          1,

    production_output: [],

    // legacy
    famine_mortality_mod:     -0.002,
    mobility_speed_mod:        1.4,
    needs_satisfaction_bonus:  0.03,
  },

  warehouse: {
    name:        'Торговый склад',
    icon:        '🏭',
    description: 'Закрытый склад. Увеличивает ёмкость хранилища, снижает порчу товаров.',
    cost:        450,
    category:    'infrastructure',
    footprint_ha: 3,   // складские помещения и двор
    // timber×10(220) + tools×3(105) = 325; labor=125 → ~450
    construction_materials: { timber: 10, tools: 3 },
    construction_labor:     125,

    worker_profession: [
      { profession: 'merchants', count: 100 },
    ],
    wage_rate:          0.25,
    labor_type:         'wage',
    build_turns:        2,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          3,

    production_output: [],

    capacity_bonus:            2000,
    stockpile_capacity_mult:   1.30,  // +30% к объёму склада нации
  },

  // ══════════════════════════════════════════════════════════════
  // ВОЕННЫЕ
  // ══════════════════════════════════════════════════════════════

  barracks: {
    name:        'Казармы',
    icon:        '⚔️',
    description: 'Военные казармы. Солдаты обучаются и квартируют здесь.',
    cost:        700,
    category:    'military',
    footprint_ha: 6,   // казармы, плац, конюшни
    // timber×10(220) + iron×5(225) + tools×4(140) = 585; labor=115 → ~700
    construction_materials: { timber: 10, iron: 5, tools: 4 },
    construction_labor:     115,

    worker_profession: [
      { profession: 'soldiers', count: 500 },
    ],
    wage_rate:          0.00,   // солдаты получают жалование из казны напрямую
    labor_type:         'state',
    build_turns:        3,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          3,

    production_output: [],

    // legacy
    profession_growth: { soldiers: 0.020 },
    mobility: [{ from: 'farmers', to: 'soldiers', rate: 0.006 }],
  },

  walls: {
    name:        'Крепостные стены',
    icon:        '🧱',
    description: 'Укрепления города. Гарнизон несёт дежурство, защищая жителей.',
    cost:        1500,
    category:    'military',
    footprint_ha: 5,   // периметр стен и эспланада
    // timber×5(110) + iron×15(675) + tools×10(350) = 1135; labor=365 → ~1500
    construction_materials: { timber: 5, iron: 15, tools: 10 },
    construction_labor:     365,

    worker_profession: [
      { profession: 'soldiers', count: 100 },  // стражники
    ],
    wage_rate:          0.00,
    labor_type:         'state',
    build_turns:        8,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          1,

    production_output: [],

    // legacy
    war_mortality_mod: -0.35,
    all_growth_mod:     0.001,
  },

  // ══════════════════════════════════════════════════════════════
  // АГРАРНЫЕ
  // ══════════════════════════════════════════════════════════════


  ranch: {
    name:        'Пастбище',
    icon:        '🐑',
    description: 'Скотоводческое хозяйство. Даёт шерсть, кожу и мёд.',
    cost:        300,
    category:    'agriculture',
    footprint_ha: 200,  // выгоны и луга для скота
    // timber×5(110) + tools×2(70) = 180; labor=120 → ~300
    construction_materials: { timber: 5, tools: 2 },
    construction_labor:     120,

    worker_profession: [
      { profession: 'farmers', count: 300 },
    ],
    wage_rate:          0.28,
    labor_type:         'tenant',
    build_turns:        2,
    terrain_restriction: ['plains', 'hills', 'mountains'],
    max_per_region:     null,
    max_level:          4,

    production_output: [
      { good: 'wool',    base_rate: 60 },
      { good: 'leather', base_rate: 30 },
      { good: 'honey',   base_rate: 15 },
    ],
  },

  granary: {
    name:        'Зернохранилище',
    icon:        '🌾',
    description: 'Государственный запас зерна. Охранники и управляющие — на жаловании.',
    cost:        500,
    category:    'agriculture',
    footprint_ha: 2,   // амбары и двор
    // timber×8(176) + tools×4(140) = 316; labor=184 → ~500
    construction_materials: { timber: 8, tools: 4 },
    construction_labor:     184,

    worker_profession: [
      { profession: 'farmers', count: 50 },
    ],
    wage_rate:          0.20,   // государственные хранители — наёмные работники
    labor_type:         'wage',
    build_turns:        2,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          1,

    production_output: [],

    // Продовольственная безопасность даёт землевладельцам и крестьянам спокойствие
    class_happiness_bonus: {
      farmers_class: 3,
    },

    // legacy
    famine_mortality_mod: -0.004,
    famine_protection:     0.30,
  },


  irrigation: {
    name:        'Ирригационные каналы',
    icon:        '💧',
    description: 'Система орошения. Требует постоянного обслуживания земледельцами.',
    cost:        1100,
    category:    'agriculture',
    footprint_ha: 30,  // сеть каналов и водозаборов
    // timber×10(220) + iron×10(450) + tools×8(280) = 950; labor=150 → ~1100
    construction_materials: { timber: 10, iron: 10, tools: 8 },
    construction_labor:     150,

    worker_profession: [
      { profession: 'farmers', count: 100 },
    ],
    wage_rate:          0.10,
    labor_type:         'state',
    build_turns:        6,
    terrain_restriction: ['plains', 'river_valley'],
    max_per_region:     1,
    max_level:          1,

    production_output: [],   // мультипликатор урожая, а не прямой выход

    // legacy
    profession_growth:    { farmers: 0.015 },
    all_growth_mod:        0.002,
    capacity_bonus:        4000,
    famine_mortality_mod: -0.002,
  },

  // ══════════════════════════════════════════════════════════════
  // КУЛЬТУРНЫЕ
  // ══════════════════════════════════════════════════════════════

  temple: {
    name:        'Храм',
    icon:        '🏛',
    description: 'Религиозный центр. Жрецы живут на пожертвования, лечат и молятся.',
    cost:        800,
    category:    'culture',
    footprint_ha: 2,   // теменос, постройки, священная роща
    // timber×12(264) + tools×6(210) = 474; labor=326 → ~800
    construction_materials: { timber: 12, tools: 6 },
    construction_labor:     326,

    worker_profession: [
      { profession: 'clergy', count: 150 },
    ],
    wage_rate:          0.00,   // жрецы живут на пожертвования, не зарплату
    labor_type:         'self',
    build_turns:        4,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          2,

    production_output: [],

    // Храм успокаивает всё население — религиозный бонус к единству
    class_happiness_bonus: {
      clergy_class:    8,   // жрецы рады
      farmers_class:   4,
      soldiers_class:  3,
      citizens:        3,
    },

    // legacy
    profession_growth: { clergy: 0.025 },
    mortality_mod:     -0.003,
    all_growth_mod:     0.001,
  },

  aqueduct: {
    name:        'Акведук',
    icon:        '🏗',
    description: 'Водопровод. Обслуживается государственными ремесленниками.',
    cost:        2000,
    category:    'culture',
    footprint_ha: 4,   // трасса акведука и водонапорные башни
    // timber×8(176) + iron×20(900) + tools×15(525) = 1601; labor=399 → ~2000
    construction_materials: { timber: 8, iron: 20, tools: 15 },
    construction_labor:     399,

    worker_profession: [
      { profession: 'craftsmen', count: 100 },
    ],
    wage_rate:          0.18,
    labor_type:         'state',
    build_turns:        8,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          1,

    production_output: [],

    // Чистая вода снижает смертность и радует всех горожан
    class_happiness_bonus: {
      farmers_class:   4,
      craftsmen_class: 4,
      citizens:        4,
    },

    // legacy
    mortality_mod:         -0.006,
    all_growth_mod:         0.003,
    capacity_bonus:         5000,
    epidemic_chance_mod:   -0.4,
  },

  school: {
    name:        'Школа / Гимнасий',
    icon:        '📚',
    description: 'Образование. Жрецы-учителя работают за пожертвования.',
    cost:        700,
    category:    'culture',
    footprint_ha: 1,   // здание и двор для упражнений
    // timber×10(220) + tools×5(175) = 395; labor=305 → ~700
    construction_materials: { timber: 10, tools: 5 },
    construction_labor:     305,

    worker_profession: [
      { profession: 'clergy', count: 80 },
    ],
    wage_rate:          0.00,
    labor_type:         'self',
    build_turns:        3,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          1,

    production_output: [],

    // legacy
    profession_growth: { merchants: 0.008, clergy: 0.006 },
    mobility: [{ from: 'craftsmen', to: 'merchants', rate: 0.004 }],
  },

  forum: {
    name:        'Форум / Агора',
    icon:        '🏟',
    description: 'Общественная площадь. Рабочих не требует, центр городской жизни.',
    cost:        600,
    category:    'culture',
    footprint_ha: 2,   // площадь с портиками и трибунами
    // timber×8(176) + tools×4(140) = 316; labor=284 → ~600
    construction_materials: { timber: 8, tools: 4 },
    construction_labor:     284,

    worker_profession:   [],
    wage_rate:           0.00,
    labor_type:          'none',
    build_turns:         3,
    terrain_restriction: null,
    max_per_region:      1,
    max_level:          1,

    production_output: [],

    // Форум как центр общественной жизни — прямой бонус гражданским классам
    class_happiness_bonus: {
      citizens:        5,
      merchants:       3,
      craftsmen_class: 2,
    },

    // legacy
    profession_growth:        { merchants: 0.007 },
    all_growth_mod:            0.001,
    needs_satisfaction_bonus:  0.03,
    capacity_bonus:            1000,
  },

  tavern: {
    name:        'Таверна',
    icon:        '🍺',
    description: 'Трактир. Хозяева и слуги работают на себя, потребляют вино и рыбу.',
    cost:        250,
    category:    'culture',
    footprint_ha: 1,   // здание с двором
    // timber×5(110) + tools×2(70) = 180; labor=70 → ~250
    construction_materials: { timber: 5, tools: 2 },
    construction_labor:     70,

    worker_profession: [
      { profession: 'craftsmen', count: 50 },
    ],
    wage_rate:          0.30,
    labor_type:         'self',
    build_turns:        1,
    terrain_restriction: null,
    max_per_region:     null,
    max_level:          5,

    production_output: [],

    // Бонус к счастью конкретных классов
    class_happiness_bonus: {
      craftsmen_class: 8,
      citizens:        6,
      sailors_class:   5,
      soldiers_class:  4,
    },
    // Потребляет товары из склада нации (ход)
    consumes: [
      { good: 'wine', amount: 10 },
      { good: 'fish', amount:  5 },
    ],
  },

  baths: {
    name:        'Термы',
    icon:        '🛁',
    description: 'Общественные бани. Рабы топят печи, горожане здоровеют.',
    cost:        700,
    category:    'culture',
    footprint_ha: 2,   // здание с бассейнами и садиком
    // timber×6(132) + iron×4(180) + tools×3(105) = 417; labor=283 → ~700
    construction_materials: { timber: 6, iron: 4, tools: 3 },
    construction_labor:     283,

    worker_profession: [
      { profession: 'slaves', count: 80 },
    ],
    wage_rate:          0.00,
    labor_type:         'slave',
    build_turns:        4,
    terrain_restriction: null,
    max_per_region:     1,
    max_level:          2,

    production_output: [],

    class_happiness_bonus: {
      citizens:        6,
      craftsmen_class: 5,
    },
    consumes: [
      { good: 'timber',     amount: 8 },
      { good: 'olive_oil',  amount: 4 },
    ],

    // legacy
    mortality_mod: -0.002,
  },

  // ══════════════════════════════════════════════════════════════
  // ПРОИЗВОДСТВЕННЫЕ
  // ══════════════════════════════════════════════════════════════

  workshop: {
    name:        'Мастерские',
    icon:        '🔨',
    description: 'Ремесленные мастерские. Ремесленники получают наёмную плату.',
    cost:        650,
    category:    'production',
    footprint_ha: 3,   // цеха и склад материалов
    // timber×8(176) + iron×4(180) + tools×4(140) = 496; labor=154 → ~650
    construction_materials: { timber: 8, iron: 4, tools: 4 },
    construction_labor:     154,

    worker_profession: [
      { profession: 'craftsmen', count: 400 },
    ],
    wage_rate:          0.28,
    labor_type:         'wage',
    build_turns:        3,
    terrain_restriction: null,
    max_per_region:     null,
    max_level:          5,

    production_output: [
      { good: 'tools',   base_rate: 35 },
      { good: 'cloth',   base_rate: 25 },
      { good: 'pottery', base_rate: 20 },
    ],

    // legacy
    profession_growth: { craftsmen: 0.018 },
    mobility:          [{ from: 'farmers', to: 'craftsmen', rate: 0.005 }],
    capacity_bonus:    1500,
  },

  mine: {
    name:        'Рудники',
    icon:        '⛏',
    description: 'Добыча руды. Ремесленники надзирают, рабы добывают.',
    cost:        850,
    category:    'production',
    footprint_ha: 20,  // карьер, отвалы, обогатительный двор
    // timber×12(264) + iron×6(270) + tools×6(210) = 744; labor=106 → ~850
    construction_materials: { timber: 12, iron: 6, tools: 6 },
    construction_labor:     106,

    worker_profession: [
      { profession: 'craftsmen', count: 200 },
      { profession: 'slaves',    count: 400 },
    ],
    wage_rate:          0.10,   // только ремесленники-надзиратели получают оплату
    labor_type:         'mixed',
    build_turns:        5,
    terrain_restriction: ['mountains', 'hills'],
    max_per_region:     null,
    max_level:          4,

    production_output: [
      { good: 'iron',   base_rate: 80 },
      { good: 'bronze', base_rate: 30 },
    ],

    // legacy
    profession_growth:  { craftsmen: 0.008, slaves: 0.015 },
    slave_mortality_mod: 0.008,
  },

  salt_works: {
    name:        'Солеварня',
    icon:        '⬜',
    description: 'Морские соляные промыслы. Ремесленники варят соль, рабы таскают мешки.',
    cost:        600,
    category:    'production',
    footprint_ha: 15,  // соляные выпарные бассейны
    // timber×6(132) + tools×4(140) = 272; labor=328 → ~600
    construction_materials: { timber: 6, tools: 4 },
    construction_labor:     328,

    worker_profession: [
      { profession: 'craftsmen', count: 200 },
      { profession: 'slaves',    count: 100 },
    ],
    wage_rate:          0.20,
    labor_type:         'mixed',
    build_turns:        3,
    terrain_restriction: ['coastal_city'],
    max_per_region:     1,
    max_level:          3,

    production_output: [
      { good: 'salt', base_rate: 120 },
    ],
  },

  lumber_camp: {
    name:        'Лесозаготовка',
    icon:        '🪓',
    description: 'Лесоповал. Земледельцы рубят лес на продажу.',
    cost:        350,
    category:    'production',
    footprint_ha: 150, // делянка леса под вырубку
    // timber×4(88) + iron×2(90) + tools×3(105) = 283; labor=67 → ~350
    construction_materials: { timber: 4, iron: 2, tools: 3 },
    construction_labor:     67,

    worker_profession: [
      { profession: 'farmers', count: 300 },
      { profession: 'slaves',  count: 100 },
    ],
    wage_rate:          0.22,   // земледельцы получают долю выручки
    labor_type:         'mixed',
    build_turns:        2,
    terrain_restriction: ['mountains', 'hills'],
    max_per_region:     null,
    max_level:          4,

    production_output: [
      { good: 'timber', base_rate: 90 },
    ],
  },

  pottery_workshop: {
    name:        'Гончарная мастерская',
    icon:        '🏺',
    description: 'Производство посуды. Ремесленники работают за наёмную плату.',
    cost:        400,
    category:    'production',
    footprint_ha: 2,   // мастерская с обжиговыми печами
    // timber×7(154) + tools×4(140) = 294; labor=106 → ~400
    construction_materials: { timber: 7, tools: 4 },
    construction_labor:     106,

    worker_profession: [
      { profession: 'craftsmen', count: 200 },
    ],
    wage_rate:          0.28,
    labor_type:         'wage',
    build_turns:        2,
    terrain_restriction: ['river_valley', 'coastal_city', 'plains'],
    max_per_region:     null,
    max_level:          5,

    production_output: [
      { good: 'pottery', base_rate: 110 },  // увеличено: низкая цена → нужен объём
    ],
  },

  oil_press: {
    name:        'Давильня',
    icon:        '🫒',
    description: 'Прессование оливок. Земледельцы и рабы производят масло.',
    cost:        350,
    category:    'production',
    footprint_ha: 4,   // давильня и сборный двор
    // timber×6(132) + tools×3(105) = 237; labor=113 → ~350
    construction_materials: { timber: 6, tools: 3 },
    construction_labor:     113,

    worker_profession: [
      { profession: 'farmers', count: 100 },
      { profession: 'slaves',  count: 100 },
    ],
    wage_rate:          0.30,   // фермеры получают хорошую долю от масла
    labor_type:         'mixed',
    build_turns:        2,
    terrain_restriction: ['hills', 'plains', 'coastal_city'],
    max_per_region:     null,
    max_level:          4,

    // Требует оливки на входе
    requires_input: [
      { good: 'olives', per_100_workers: 200 },
    ],

    production_output: [
      { good: 'olive_oil', base_rate: 50 },
    ],
  },

  winery: {
    name:        'Винодельня',
    icon:        '🍷',
    description: 'Производство вина. Ремесленники и земледельцы давят виноград.',
    cost:        450,
    category:    'production',
    footprint_ha: 10,  // погреба, давильня, небольшой виноградник
    // timber×8(176) + tools×3(105) = 281; labor=169 → ~450
    construction_materials: { timber: 8, tools: 3 },
    construction_labor:     169,

    worker_profession: [
      { profession: 'craftsmen', count: 150 },
      { profession: 'farmers',   count:  50 },
    ],
    wage_rate:          0.25,
    labor_type:         'wage',
    build_turns:        3,
    terrain_restriction: ['hills', 'river_valley'],
    max_per_region:     null,
    max_level:          5,

    production_output: [
      { good: 'wine', base_rate: 80 },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // ПШЕНИЧНОЕ ПРОИЗВОДСТВО — три масштаба
  // Слот = тип хозяйства, уровень = количество единиц.
  // footprint_ha и workers_per_unit — на 1 единицу (level=1).
  // Эффективность на га растёт с масштабом: ферма < вилла < латифундия.
  //
  // Производство считается по формуле: (workers/1000) × base_rate × level
  // base_rate намеренно высокий — компенсирует малое кол-во рабочих на единицу.
  // ══════════════════════════════════════════════════════════════

  wheat_family_farm: {
    name:        'Семейная ферма',
    icon:        '🌾',
    description: 'Небольшой семейный надел. Быстро строится, мало рабочих. ' +
                 'Низкая эффективность на гектар, но доступна с первых ходов.',
    cost:        100,
    category:    'agriculture',
    footprint_ha: 5,           // га на 1 ферму (уровень)
    workers_per_unit: 5,       // 5 фермеров на 1 ферму

    // ── Автономное строительство ──────────────────────────────────────────────
    // Строится ТОЛЬКО классом farmers_class на накопленный капитал.
    // Игрок и AI нации НЕ могут строить это здание напрямую.
    autonomous_builder: 'farmers_class',
    // ── Масштабный коэффициент урожайности (эффективность на га) ──────────────
    // efficiency_mult × (workers/1000) × base_rate = итоговый выход
    // Базовый уровень: 5 чел × (2000/1000) × 1.0 = 10 ед./ход → 2 ед./га
    efficiency_mult: 1.0,

    // timber×2(44) + tools×1(35) = 79; labor=21 → ~100
    construction_materials: { timber: 2, tools: 1 },
    construction_labor:     21,

    worker_profession: [
      { profession: 'farmers', count: 5 },  // 5 чел./ферму
    ],
    wage_rate:          0.35,  // арендаторы оставляют себе 35% урожая
    labor_type:         'tenant',
    build_turns:        1,
    terrain_restriction: ['plains', 'hills', 'river_valley',
                          'mediterranean_coast', 'mediterranean_hills',
                          'river_valley', 'steppe', 'temperate_forest'],
    max_per_region:     null,
    max_level:          20,    // до 20 ферм на регион

    production_output: [
      // base_rate = канонический выход на 1000 рабочих (без efficiency_mult)
      // (5/1000)×2000×1.0 = 10 пш/ход → 2 пш/га
      { good: 'wheat', base_rate: 2000 },
    ],

    // ── Производственные ресурсы (капитальные вложения на уровень) ───────────
    // Фермы должны держать эти ресурсы как запас. При нехватке снижается _capital_ratio.
    // monthly_wear — доля списания в тик (1 мес): инструменты ломаются, скот стареет.
    // alt_good / alt_efficiency — альтернативный товар с бонусом к эффективности.
    capital_inputs: [
      { good: 'tools',  count_per_level: 1,  monthly_wear: 0.021 },
      { good: 'cattle', count_per_level: 1,  monthly_wear: 0.007,
        alt_good: 'horses', alt_efficiency: 1.2 },
    ],

    // legacy
    profession_growth: { farmers: 0.003 },
  },

  wheat_villa: {
    name:        'Средняя вилла',
    icon:        '🏡',
    description: 'Товарное хозяйство среднего размера. Дороже фермы, но ' +
                 'эффективнее на гектар благодаря лучшей организации труда.',
    cost:        600,
    category:    'agriculture',
    footprint_ha: 75,          // га на 1 виллу
    workers_per_unit: 15,      // 15 фермеров на 1 виллу

    // ── Автономное строительство ──────────────────────────────────────────────
    // Строится ТОЛЬКО классом soldiers_class на накопленный капитал.
    // Игрок и AI нации НЕ могут строить это здание напрямую.
    autonomous_builder: 'soldiers_class',
    // ── Масштабный коэффициент ────────────────────────────────────────────────
    // (15/1000)×10000×1.3 = 195 пш/ход → 2.6 пш/га (×1.3 vs ферма)
    efficiency_mult: 1.3,

    // timber×6(132) + iron×2(90) + tools×3(105) = 327; labor=273 → ~600
    construction_materials: { timber: 6, iron: 2, tools: 3 },
    construction_labor:     273,

    worker_profession: [
      { profession: 'farmers', count: 15 },  // 15 чел./виллу
    ],
    wage_rate:          0.30,
    labor_type:         'tenant',
    build_turns:        3,
    terrain_restriction: ['plains', 'hills', 'river_valley',
                          'mediterranean_coast', 'mediterranean_hills',
                          'steppe', 'temperate_forest'],
    max_per_region:     null,
    max_level:          10,

    production_output: [
      // (15/1000)×10000×1.3 = 195 пш/ход/виллу → 2.6 пш/га
      { good: 'wheat', base_rate: 10000 },
    ],

    capital_inputs: [
      { good: 'tools',  count_per_level: 3,  monthly_wear: 0.021 },
      { good: 'cattle', count_per_level: 10, monthly_wear: 0.007,
        alt_good: 'horses', alt_efficiency: 1.2 },
    ],

    // legacy
    profession_growth: { farmers: 0.005 },
  },

  wheat_latifundium: {
    name:        'Латифундия (пшеница)',
    icon:        '🌿',
    description: 'Крупное поместье с отлаженным производством. Максимальная ' +
                 'отдача с гектара. 50 свободных фермеров + до 50 рабов; ' +
                 'при нехватке рабов недостающие слоты заменяются фермерами.',
    cost:        2500,
    category:    'agriculture',
    footprint_ha: 300,         // га на 1 латифундию
    workers_per_unit: 100,     // 50 фермеров + до 50 рабов (или 100 фермеров)

    // ── Автономное строительство ──────────────────────────────────────────────
    // Может строиться ДВУМЯ путями:
    //   1. Игрок / AI нация → slot.owner = 'nation' → прибыль в казну
    //   2. Класс aristocrats на накопленный капитал → slot.owner = 'aristocrats'
    // autonomous_builder задаёт кто строит АВТОНОМНО (не по команде игрока).
    autonomous_builder: 'aristocrats',

    // ── Масштабный коэффициент ────────────────────────────────────────────────
    // (200/1000)×3000×1.8 = 1080 пш/ход → 3.6 пш/га (×1.8 vs ферма)
    efficiency_mult: 1.8,

    // timber×15(330) + iron×8(360) + tools×8(280) = 970; labor=530 → ~2500 с наценкой
    construction_materials: { timber: 15, iron: 8, tools: 8 },
    construction_labor:     530,

    worker_profession: [
      { profession: 'farmers', count: 50 },
      { profession: 'slaves',  count: 50 },  // до 50% — рабы (если есть на рынке)
    ],
    // Замена рабов: если nation.population.by_profession.slaves === 0,
    // движок заменяет слот рабов фермерами (slave_fallback_profession).
    slave_fallback_profession: 'farmers',

    wage_rate:          0.25,  // фермеры-арендаторы; рабы без оплаты
    labor_type:         'tenant',
    build_turns:        6,
    terrain_restriction: ['plains', 'river_valley',
                          'mediterranean_coast', 'mediterranean_hills'],
    max_per_region:     null,
    max_level:          5,

    production_output: [
      // (100/1000)×3000×1.8 = 540 пш/ход → 1.8 пш/га (итог ниже, но рабочих вдвое меньше)
      { good: 'wheat',  base_rate: 3000 },
      // побочный ячмень: (100/1000)×834×1.8 ≈ 150 ячм/ход → 0.5 ячм/га
      { good: 'barley', base_rate: 834 },
    ],

    capital_inputs: [
      { good: 'tools',  count_per_level: 20, monthly_wear: 0.021 },
      { good: 'cattle', count_per_level: 30, monthly_wear: 0.007,
        alt_good: 'horses', alt_efficiency: 1.2 },
    ],

    // legacy
    profession_growth:  { farmers: 0.006, slaves: 0.015 },
    slave_mortality_mod: 0.003,
  },

  // ══════════════════════════════════════════════════════════════
  // СКОТОВОДСТВО — разведение тягловых животных
  // Дают horses / cattle, которые фермы потребляют как capital_inputs.
  // ══════════════════════════════════════════════════════════════

  horse_ranch: {
    name:        'Конный завод',
    icon:        '🐎',
    description: 'Разведение лошадей для сельского хозяйства, армии и транспорта. ' +
                 'Лошади эффективнее волов (+20%) и дороже. ' +
                 'Строится классом всадников.',
    cost:        400,
    category:    'agriculture',
    footprint_ha: 40,
    workers_per_unit: 8,

    autonomous_builder: 'soldiers_class',   // всадники заинтересованы в лошадях
    efficiency_mult: 1.0,

    // timber×4(88) + tools×2(70) = 158; labor=242 → ~400
    construction_materials: { timber: 4, tools: 2 },
    construction_labor:     242,

    worker_profession: [
      { profession: 'farmers', count: 8 },
    ],
    wage_rate:   0.30,
    labor_type:  'tenant',
    build_turns: 3,
    terrain_restriction: ['plains', 'steppe', 'mediterranean_hills',
                          'hills', 'river_valley'],
    max_per_region: null,
    max_level:   6,

    production_output: [
      // (8/1000)×60×1.0 = 0.48 головы/мес на уровень
      { good: 'horses', base_rate: 60 },
    ],

    profession_growth: { farmers: 0.002 },
  },

  cattle_farm: {
    name:        'Скотоводческое хозяйство',
    icon:        '🐂',
    description: 'Разведение волов и крупного рогатого скота для пашни. ' +
                 'Дешевле лошадей, медленнее, но незаменимы для плуга. ' +
                 'Требует зернового подкорма: при голоде воспроизводство скота прекращается. ' +
                 'Строится классом земледельцев.',
    cost:        250,
    category:    'agriculture',
    footprint_ha: 30,
    workers_per_unit: 6,

    autonomous_builder: 'farmers_class',    // земледельцы держат скот
    efficiency_mult: 1.0,

    // timber×3(66) + tools×1(35) = 101; labor=149 → ~250
    construction_materials: { timber: 3, tools: 1 },
    construction_labor:     149,

    worker_profession: [
      { profession: 'farmers', count: 6 },
    ],
    wage_rate:   0.30,
    labor_type:  'tenant',
    build_turns: 2,
    terrain_restriction: ['plains', 'steppe', 'river_valley',
                          'mediterranean_coast', 'mediterranean_hills', 'hills'],
    max_per_region: null,
    max_level:   8,

    production_output: [
      // (6/1000)×80×1.0 = 0.48 головы/мес на уровень
      { good: 'cattle', base_rate: 80 },
    ],

    profession_growth: { farmers: 0.002 },
  },

  // ══════════════════════════════════════════════════════════════
  // СИЦИЛИЙСКИЕ (УНИКАЛЬНЫЕ ПРОВИНЦИАЛЬНЫЕ)
  // region_tag_restriction: ['sicily'] — строятся только в регионах Сицилии
  // ══════════════════════════════════════════════════════════════

  sulfur_mine: {
    name:        'Серные рудники',
    icon:        '🟡',
    description: 'Подземные залежи серы у подножий Этны. Рабы и ремесленники добывают зелёный камень — основу дубильного и аптечного ремесла.',
    cost:        700,
    category:    'production',
    footprint_ha: 15,  // шахты, отвалы, производственный двор
    // timber×10(220) + iron×5(225) + tools×4(140) = 585; labor=115 → ~700
    construction_materials: { timber: 10, iron: 5, tools: 4 },
    construction_labor:     115,

    worker_profession: [
      { profession: 'craftsmen', count: 100 },
      { profession: 'slaves',    count: 200 },
    ],
    wage_rate:               0.10,   // только надзиратели-ремесленники оплачиваются
    labor_type:              'mixed',
    build_turns:             4,
    terrain_restriction:     ['mountains', 'hills'],
    region_tag_restriction:  ['sicily'],
    max_per_region:          null,
    max_level:          4,

    production_output: [
      { good: 'sulfur', base_rate: 80 },
    ],

    slave_mortality_mod: 0.006,  // опасная добыча
  },

  tuna_trap: {
    name:        'Тоня (ловушка для тунца)',
    icon:        '🐟',
    description: 'Лабиринт сетей для сезонной охоты на тунца. Сицилийские рыбаки ежегодно устраивают mattanza — ритуальный загон рыбы.',
    cost:        500,
    category:    'production',
    footprint_ha: 3,   // береговые постройки и причал
    // timber×8(176) + tools×4(140) = 316; labor=184 → ~500
    construction_materials: { timber: 8, tools: 4 },
    construction_labor:     184,

    worker_profession: [
      { profession: 'sailors',   count: 200 },
      { profession: 'craftsmen', count: 30 },
    ],
    wage_rate:               0.28,
    labor_type:              'wage',
    build_turns:             3,
    terrain_restriction:     ['coastal_city'],
    region_tag_restriction:  ['sicily'],
    max_per_region:          1,
    max_level:          3,

    production_output: [
      { good: 'tuna', base_rate: 140 },  // 140 амфор/1000 рыбаков
    ],
  },


  papyrus_bed: {
    name:        'Папирусные заросли',
    icon:        '📜',
    description: 'Заросли папируса вдоль реки Киана у Сиракуз — единственное место в Европе, где растёт нильский папирус. Ценнейшее писчее сырьё.',
    cost:        400,
    category:    'production',
    footprint_ha: 8,   // прибрежные заросли вдоль Кианы
    // timber×5(110) + tools×3(105) = 215; labor=185 → ~400
    construction_materials: { timber: 5, tools: 3 },
    construction_labor:     185,

    worker_profession: [
      { profession: 'farmers', count: 80 },
      { profession: 'slaves',  count: 40 },
    ],
    wage_rate:               0.22,
    labor_type:              'mixed',
    build_turns:             3,
    terrain_restriction:     ['river_valley', 'coastal_city'],
    region_tag_restriction:  ['sicily'],
    max_per_region:          1,
    max_level:          2,

    production_output: [
      { good: 'papyrus', base_rate: 60 },
    ],
  },

};

// ══════════════════════════════════════════════════════════════
// СЛОТЫ СТРОИТЕЛЬСТВА ПО ТИПУ МЕСТНОСТИ
// Максимальное количество зданий, которое можно возвести в регионе
// ══════════════════════════════════════════════════════════════

const TERRAIN_MAX_SLOTS = {
  coastal_city:  8,
  river_valley:  7,
  plains:        6,
  hills:         5,
  mountains:     4,
  ocean:         0,
  rural:         5,   // устаревший тип, fallback
  default:       4,
};

// ══════════════════════════════════════════════════════════════
// ЁМКОСТЬ НАСЕЛЕНИЯ ПО МЕСТНОСТИ (без построек)
// ══════════════════════════════════════════════════════════════

const TERRAIN_BASE_CAPACITY = {
  coastal_city:  8000,
  plains:        6000,
  hills:         4000,
  mountains:     2800,
  river_valley: 11000,
  ocean:            0,
  default:       4000,
};

// ══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
// Возвращает суммарное число рабочих мест здания
// ══════════════════════════════════════════════════════════════

function getBuildingTotalWorkers(buildingId) {
  const b = BUILDINGS[buildingId];
  if (!b || !b.worker_profession) return 0;
  return b.worker_profession.reduce((sum, wp) => sum + wp.count, 0);
}

// ══════════════════════════════════════════════════════════════
// РЕЦЕПТЫ ПРОИЗВОДСТВА — перенесено в data/recipes.js (Этап 8)
// BUILDING_RECIPES определён в data/recipes.js, которое загружается
// ДО этого файла. Изменять рецепты там.
// ══════════════════════════════════════════════════════════════

// Максимум слотов для региона (с учётом его типа местности)
function getRegionMaxSlots(terrain) {
  return TERRAIN_MAX_SLOTS[terrain] ?? TERRAIN_MAX_SLOTS.default;
}

// Список зданий, совместимых с местностью и (опционально) тегами региона.
// region — объект региона (необязательно), нужен для фильтрации по region_tag_restriction.
// Здания с region_tag_restriction показываются только в регионах с подходящими тегами.
function getBuildingsForTerrain(terrain, region = null) {
  const regionTags = region?.tags || [];
  return Object.entries(BUILDINGS)
    .filter(([, b]) => {
      if (b.terrain_restriction && !b.terrain_restriction.includes(terrain)) return false;
      if (b.region_tag_restriction) {
        // Скрываем провинциальные здания в регионах без нужного тега
        if (!b.region_tag_restriction.some(t => regionTags.includes(t))) return false;
      }
      return true;
    })
    .map(([id, b]) => ({ id, ...b }));
}

// Проверка: можно ли построить здание в регионе
// Возвращает { ok: bool, reason: string | null, is_upgrade?, to_level?, target_slot_id? }
function canBuildInRegion(buildingId, region) {
  const b = BUILDINGS[buildingId];
  if (!b) return { ok: false, reason: 'Здание не найдено' };

  const terrain = region.terrain || region.type || 'plains';

  // Ограничение по местности
  if (b.terrain_restriction && !b.terrain_restriction.includes(terrain)) {
    return { ok: false, reason: `Не подходит для типа местности «${terrain}»` };
  }

  // Ограничение по тегу региона (например, только Сицилия)
  if (b.region_tag_restriction) {
    const regionTags = region.tags || [];
    const hasRequiredTag = b.region_tag_restriction.some(t => regionTags.includes(t));
    if (!hasRequiredTag) {
      const tagNames = { sicily: 'Сицилия' };
      const readable = b.region_tag_restriction.map(t => tagNames[t] || t).join(', ');
      return { ok: false, reason: `Строится только в провинции: ${readable}` };
    }
  }

  // ── Система уровней ───────────────────────────────────────────────────────
  // Если здание уже есть в регионе — это улучшение, а не новое строительство.
  const maxLevel    = b.max_level ?? 1;
  const existingSlot = (region.building_slots || [])
    .find(s => s.building_id === buildingId && s.status !== 'demolished');

  if (existingSlot) {
    const currentLevel = existingSlot.level || 1;
    if (currentLevel >= maxLevel) {
      return { ok: false, reason: `Максимальный уровень ${maxLevel} достигнут` };
    }
    // Улучшение уже стоит в очереди?
    const upgradeInQueue = (region.construction_queue || [])
      .some(e => e.building_id === buildingId && e.is_upgrade);
    if (upgradeInQueue) {
      return { ok: false, reason: 'Улучшение уже в очереди строительства' };
    }
    // Земельная проверка для улучшения: нужен ровно 1 дополнительный уровень
    const upgradeFootprint = b.footprint_ha ?? 0;
    if (upgradeFootprint > 0) {
      const freeHa = region.land?.free_ha ?? Infinity;
      if (upgradeFootprint > freeHa) {
        return { ok: false, reason: `Нужно ${upgradeFootprint} га, свободно ${Math.round(freeHa)} га` };
      }
    }
    return {
      ok:             true,
      reason:         null,
      is_upgrade:     true,
      to_level:       currentLevel + 1,
      target_slot_id: existingSlot.slot_id,
    };
  }

  // Новое здание — проверяем, нет ли его уже в очереди
  const newBuildInQueue = (region.construction_queue || [])
    .some(e => e.building_id === buildingId && !e.is_upgrade);
  if (newBuildInQueue) {
    return { ok: false, reason: 'Это здание уже строится' };
  }

  // Свободные слоты (улучшения в очереди не занимают новый слот)
  const maxSlots = getRegionMaxSlots(terrain);
  const usedSlots =
    (region.building_slots || []).filter(s => s.status !== 'demolished').length +
    (region.construction_queue || []).filter(e => !e.is_upgrade).length;
  if (usedSlots >= maxSlots) {
    return { ok: false, reason: 'Нет свободных строительных слотов' };
  }

  // Земельная проверка для нового здания
  const newFootprint = b.footprint_ha ?? 0;
  if (newFootprint > 0) {
    const freeHa = region.land?.free_ha ?? Infinity;
    if (newFootprint > freeHa) {
      return { ok: false, reason: `Нужно ${newFootprint} га, свободно ${Math.round(freeHa)} га` };
    }
  }

  return { ok: true, reason: null, is_upgrade: false };
}
