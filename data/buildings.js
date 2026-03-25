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
    workers_per_unit: 50,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["coastal_city"]},
    historical_note: "Порты Сиракуз, Карфагена и Александрии были крупнейшими торговыми узлами античного мира; Дионисий Сиракузский расширил гавань до вмещения 200 военных триер.",
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
    workers_per_unit: 40,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["coastal_city"]},
    historical_note: "Дионисий I в 399 до н.э. одновременно задействовал 20 верфей Сиракуз и нанял специалистов со всей Греции — результатом стал первый в истории пятипалубный корабль.",
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
    workers_per_unit: 20,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Агора Афин и форум Рима были центрами не только торговли, но и политики; Аристотель выделял особую роль рынка как места формирования гражданского сообщества.",
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
    workers_per_unit: 10,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Аппиева дорога (312 до н.э.) заложила стандарт: ширина 4 м, щебёночная подсыпка, камень поверху; римские дороги до сих пор служат основой европейских трасс.",
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
    workers_per_unit: 5,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Карфагенские склады-хорреи были государственными монополиями; в Остии хорреи Эпагатиана вмещали до 7 000 тонн зерна и работали непрерывно.",
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
    workers_per_unit: 100,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Гарнизонные казармы Сиракуз при Дионисии I вмещали до 10 000 наёмников; казармы совмещали жильё, склады оружия и учебные поля.",
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
    workers_per_unit: 30,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Городские стены Сиракуз при Дионисии (402–397 до н.э.) протяжённостью 27 км считались крупнейшими в греческом мире; их возвели за 20 дней с использованием 60 000 рабочих.",
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
    workers_per_unit: 8,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Скотоводческие хозяйства горных районов Сицилии (Неброди) поставляли шерсть и кожу для военного снаряжения армий Агафокла.",
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
    workers_per_unit: 5,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Государственные зернохранилища Птолемеевского Египта вмещали годовой урожай провинции; Рим к I в. до н.э. содержал хорреи на 40 000 тонн зерна.",
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
    workers_per_unit: 12,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Ирригационные системы долины Нила и Вавилонии существовали тысячелетиями; Феофраст описывал продуманные сицилийские водоводы в прибрежных равнинах.",
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
    workers_per_unit: 15,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Храм Зевса в Акраганте (V в. до н.э.) — крупнейший дорический храм Сицилии; строился силами тысяч карфагенских пленников и так и не был достроен.",
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
    workers_per_unit: 20,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Акведук Аппия Клавдия (312 до н.э.) первым снабдил Рим чистой водой; Фронтин сообщает, что к I в. н.э. в Рим поступало более миллиона кубометров воды в сутки.",
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
    workers_per_unit: 10,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Платоновская Академия и Ликей Аристотеля стали прообразом институтов высшей учёбы; обучение риторике и философии было основой образования свободного гражданина.",
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
    workers_per_unit: 5,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Форум Рима — политический, торговый и религиозный центр; сицилийские агоры были меньше, но выполняли те же функции в городах под греческим влиянием.",
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
    workers_per_unit: 8,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Таверны (caupona) были обязательным элементом античного городского квартала; помпейские cauponae сохранили свинцовые прилавки с подогревом еды и надписи меню.",
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
    workers_per_unit: 15,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["coastal_city","mediterranean_coast","plains"]},
    historical_note: "Термы Агриппы в Риме (25 до н.э.) стали первыми публичными банями; ежедневное посещение терм было социальным ритуалом римского горожанина.",
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
    workers_per_unit: 15,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Эргастерии — ремесленные мастерские — присутствовали в любом античном городе; крупнейшие афинские мастерские использовали до 120 рабов-ремесленников (Лисий, III в. до н.э.).",
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
    workers_per_unit: 50,
    location_requirement: {"type":"deposit","deposit_key":"any","allowed_biomes":[]},
    historical_note: "Общий термин для рудников разных типов; технология варьировалась от открытых карьеров до глубоких подземных штолен с вентиляцией и насосами.",
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
    workers_per_unit: 15,
    location_requirement: {"type":"hybrid","deposit_key":"salt_deposit","allowed_biomes":["coastal_city","mediterranean_coast","semi_arid","desert"]},
    historical_note: "Солеварни у западных берегов Сицилии (Марсала) производили соль тысячелетиями; карфагеняне контролировали этот стратегический ресурс до Первой Пунической войны.",
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
    workers_per_unit: 20,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["temperate_forest","alpine","subtropical","mediterranean_hills"]},
    historical_note: "Леса Неброди и Мадоние на Сицилии заготовляли корабельный лес для флота; Дионисий I организовал промышленную вырубку для 399 до н.э. флотской программы.",
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
    workers_per_unit: 12,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Коринфская и аттическая керамика экспортировалась по всему античному миру; сицилийские гончары Акраганта производили столовую посуду для местных и карфагенских рынков.",
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
    workers_per_unit: 8,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["mediterranean_hills","mediterranean_coast","volcanic","subtropical"]},
    historical_note: "Оливковые прессы Аттики производили масло для экспорта; крупная маслобойня использовала тяжёлые каменные жернова и деревянные прессы с верёвочным приводом.",
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
    workers_per_unit: 10,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["mediterranean_hills","volcanic","mediterranean_coast","subtropical","temperate_forest"]},
    historical_note: "Сицилийские вина экспортировались через Карфаген в Африку; Диодор упоминает виноградники Акраганта, дававшие десятки тысяч амфор в год.",
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
    nation_buildable: false,
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
                          'steppe', 'temperate_forest',
                          'coastal_city'],   // хора полиса — сельская округа города
    max_per_region:     null,
    max_level:          null,  // ограничено землёй и населением, не константой

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
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Мелкие крестьянские хозяйства Сицилии производили большую часть зерна; Диодор описывает 30 000 небольших ферм вокруг Сиракуз в IV в. до н.э.",
  },

  // ── farm ─────────────────────────────────────────────────────────
  // Средняя зерновая ферма — между семейным наделом и виллой.
  // Управляется вольными арендаторами. Совместимость: r2407, r2408 (Сицилия, Сиракузы).
  farm: {
    name:        'Ферма',
    icon:        '🌾',
    description: 'Среднее зерновое хозяйство вольных арендаторов. ' +
                 'Крупнее семейного надела, но не требует рабского труда. ' +
                 'Эффективнее wheat_family_farm, дешевле wheat_villa.',
    cost:        250,
    category:    'agriculture',
    footprint_ha: 20,          // га на 1 ферму
    workers_per_unit: 20,      // 20 фермеров на 1 ферму

    autonomous_builder: 'farmers_class',
    nation_buildable:   true,

    // (20/1000)×3500×1.05 ≈ 73.5 пш/ферму/ход → ~3.7 пш/га
    efficiency_mult: 1.05,

    // timber×3(66) + tools×2(70) = 136; labor=114 → ~250
    construction_materials: { timber: 3, tools: 2 },
    construction_labor:     114,

    worker_profession: [
      { profession: 'farmers', count: 20 },
    ],
    wage_rate:    0.33,
    labor_type:   'tenant',
    build_turns:  2,
    terrain_restriction: ['plains', 'hills', 'river_valley',
                          'mediterranean_coast', 'mediterranean_hills',
                          'steppe', 'temperate_forest', 'coastal_city'],
    max_per_region: null,
    max_level:      null,

    production_output: [
      { good: 'wheat', base_rate: 3500 },
    ],

    capital_inputs: [
      { good: 'tools',  count_per_level: 2,  monthly_wear: 0.021 },
      { good: 'cattle', count_per_level: 3,  monthly_wear: 0.007,
        alt_good: 'horses', alt_efficiency: 1.2 },
    ],

    profession_growth: { farmers: 0.004 },
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Обычная аренда участка у землевладельца; типична для сельских округ сицилийских полисов. Диодор упоминает арендаторов-зерновиков в окрестностях Сиракуз.",
  },

  // ── grain_estate ─────────────────────────────────────────────────
  // Крупное зерновое поместье с рабами — между виллой и латифундией.
  // Высокий выход пшеницы + побочный ячмень. r2408 (Сицилия, река, Сиракузы).
  grain_estate: {
    name:        'Зерновое поместье',
    icon:        '🏚️',
    description: 'Крупное поместье с вольными арендаторами и рабами. ' +
                 'Производит пшеницу и ячмень. Эффективнее виллы, ' +
                 'дешевле полноценной латифундии.',
    cost:        1500,
    category:    'agriculture',
    footprint_ha: 150,         // га на 1 поместье
    workers_per_unit: 75,      // 55 фермеров + 20 рабов (соотношение ~3:1)

    autonomous_builder: 'aristocrats',
    nation_buildable:   true,

    // (75/1000)×5000×1.4 ≈ 525 пш/поместье/ход → 3.5 пш/га
    efficiency_mult: 1.4,

    // timber×10(220) + iron×4(180) + tools×6(210) = 610; labor=390 → ~1500 с наценкой
    construction_materials: { timber: 10, iron: 4, tools: 6 },
    construction_labor:     390,

    worker_profession: [
      { profession: 'farmers', count: 55 },
      { profession: 'slaves',  count: 20 },
    ],
    slave_fallback_profession: 'farmers',

    wage_rate:    0.28,
    labor_type:   'tenant',
    build_turns:  5,
    terrain_restriction: ['plains', 'river_valley',
                          'mediterranean_coast', 'mediterranean_hills'],
    max_per_region: null,
    max_level:      null,

    production_output: [
      { good: 'wheat',  base_rate: 5000 },
      { good: 'barley', base_rate: 700 },
    ],

    capital_inputs: [
      { good: 'tools',  count_per_level: 8,  monthly_wear: 0.021 },
      { good: 'cattle', count_per_level: 15, monthly_wear: 0.007,
        alt_good: 'horses', alt_efficiency: 1.2 },
    ],

    profession_growth:   { farmers: 0.005, slaves: 0.010 },
    slave_mortality_mod: 0.002,
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Крупные зерновые поместья с рабами процветали на плодородных речных долинах Сицилии. Цицерон описывает подобные хозяйства в Вёррах как основу сицилийского зернового экспорта.",
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
    nation_buildable: false,
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
                          'steppe', 'temperate_forest',
                          'coastal_city'],   // хора полиса — сельская округа города
    max_per_region:     null,
    max_level:          null,  // ограничено землёй и населением, не константой

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
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Вилла с рабами среднего размера — стандарт для богатых граждан Сицилии; Катон рекомендовал 13 рабов на виноградник площадью 100 югеров.",
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
    // (100/1000)×6000×1.8 = 1080 пш/ход → 3.6 пш/га (×1.8 vs ферма)
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
    max_level:          null,  // ограничено землёй (footprint_ha × level ≤ region_farmland) и рабами

    production_output: [
      // (100/1000)×6000×1.8 = 1080 пш/ход → 3.6 пш/га (×1.8 vs ферма)
      { good: 'wheat',  base_rate: 6000 },
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
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Крупные латифундии Сицилии с рабским трудом возникли после Второй Пунической войны; Тиберий Гракх видел в них угрозу для малоземельного крестьянства.",
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
    nation_buildable: false,
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
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Нумидийские коневоды поставляли Карфагену лучшую конницу античного мира; на Сицилии конные хозяйства Агригента были известны по всей Греции.",
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
    nation_buildable: false,
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
    location_requirement: {"type":"none","deposit_key":null,"allowed_biomes":[]},
    historical_note: "Пастбищное скотоводство центральной Сицилии давало тягловых волов, мясо и кожу; Columella описывает оптимальные пропорции стада для смешанного хозяйства.",
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
    workers_per_unit: 25,
    location_requirement: {"type":"hybrid","deposit_key":"sulfur_deposit","allowed_biomes":["volcanic"]},
    historical_note: "Сицилийские серные копи у Этны производили дезинфицирующие вещества и зажигательные смеси; монополия острова на серу сохранялась вплоть до XIX века.",
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
    workers_per_unit: 12,
    location_requirement: {"type":"hybrid","deposit_key":"tuna_migration","allowed_biomes":["coastal_city"]},
    historical_note: "Тоннара (ловушка для тунца) в Мессинском проливе — уникальная технология, описанная ещё Страбоном; тысячи тунцов ловились в сезон миграции у берегов Сицилии.",
  },


  // ── КУЗНИЦА ──────────────────────────────────────────────────
  forge: {
    name:        'Кузница',
    icon:        '🔥',
    description: 'Городская кузня — центр производства оружия, доспехов и инструментов. ' +
                 'Опытные кузнецы работают вместе с рабами-молотобойцами. ' +
                 'Требует постоянный подвоз железа и древесного угля.',
    cost:        500,
    category:    'production',
    footprint_ha: 2,
    workers_per_unit: 20,
    worker_profession: [
      { profession: 'craftsmen', count: 15 },
      { profession: 'slaves',    count: 5 },
    ],
    wage_rate:          0.25,
    labor_type:         'mixed',
    construction_materials: { timber: 8, iron: 6, tools: 4 },
    construction_labor:     152,
    build_turns:        3,
    autonomous_builder: 'craftsmen_class',
    nation_buildable:   true,
    production_output: [
      { good: 'weapons', base_rate: 30 },
      { good: 'armor',   base_rate: 20 },
      { good: 'tools',   base_rate: 45 },
    ],
    production_inputs: [
      { good: 'iron',     amount_per_turn: 15, required: true },
      { good: 'charcoal', amount_per_turn: 10, required: true },
    ],
    capital_inputs: [
      { good: 'tools', count_per_level: 4, monthly_wear: 0.025,
        alt_good: null, alt_efficiency: null },
    ],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   15,
    maintenance_goods:  {},
    effects: {
      army_quality: 0.05,
    },
    historical_note: 'Сирийские и карфагенские кузнецы поставляли оружие армиям III в. до н.э.; кузница была обязательным элементом любого античного города.',
  },

  // ── ЖЕЛЕЗНЫЙ РУДНИК ──────────────────────────────────────────
  iron_mine: {
    name:        'Железный рудник',
    icon:        '⛏️',
    description: 'Подземные или открытые разработки железной руды. ' +
                 'Почти полностью рабский труд под надзором немногих ремесленников. ' +
                 'Строится только в регионах с месторождениями железной руды.',
    cost:        900,
    category:    'production',
    footprint_ha: 25,
    workers_per_unit: 60,
    worker_profession: [
      { profession: 'craftsmen', count: 10 },
      { profession: 'slaves',    count: 50 },
    ],
    wage_rate:          0.08,
    labor_type:         'slave',
    construction_materials: { timber: 14, iron: 4, tools: 6 },
    construction_labor:     196,
    build_turns:        5,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'iron', base_rate: 80 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 8, required: true },
      { good: 'tools',  amount_per_turn: 5, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'iron_ore', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   20,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Рим добывал железо в Популонии (Этрурия) и на острове Эльба — к 200 г. до н.э. её рудники давали тысячи талантов руды в год.',
    slave_mortality_mod: 0.005,
  },

  // ── МЕДНЫЙ РУДНИК ────────────────────────────────────────────
  copper_mine: {
    name:        'Медный рудник',
    icon:        '🟤',
    description: 'Добыча медной руды для бронзового литья. ' +
                 'Исторически главные медные копи античности — Кипр, Испания, Нубия. ' +
                 'Рабский труд под надзором; руда без плавки ценится мало.',
    cost:        850,
    category:    'production',
    footprint_ha: 20,
    workers_per_unit: 50,
    worker_profession: [
      { profession: 'craftsmen', count: 8 },
      { profession: 'slaves',    count: 42 },
    ],
    wage_rate:          0.08,
    labor_type:         'slave',
    construction_materials: { timber: 12, iron: 4, tools: 5 },
    construction_labor:     179,
    build_turns:        5,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'copper', base_rate: 70 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 6, required: true },
      { good: 'tools',  amount_per_turn: 4, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'copper_ore', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   18,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Само слово "купрум" происходит от Kypros — Кипра; крупнейшие античные копи производили тысячи тонн меди ежегодно.',
    slave_mortality_mod: 0.004,
  },

  // ── СЕРЕБРЯНЫЙ РУДНИК ────────────────────────────────────────
  silver_mine: {
    name:        'Серебряный рудник',
    icon:        '🪨',
    description: 'Добыча серебра — самое доходное и самое смертоносное предприятие античности. ' +
                 'Лаврионские шахты дали Афинам деньги на флот при Фемистокле. ' +
                 'Строится только в регионах с серебряными месторождениями.',
    cost:        1200,
    category:    'production',
    footprint_ha: 30,
    workers_per_unit: 80,
    worker_profession: [
      { profession: 'craftsmen', count: 10 },
      { profession: 'slaves',    count: 70 },
    ],
    wage_rate:          0.06,
    labor_type:         'slave',
    construction_materials: { timber: 18, iron: 8, tools: 8 },
    construction_labor:     286,
    build_turns:        6,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'silver', base_rate: 50 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 10, required: true },
      { good: 'tools',  amount_per_turn:  6, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'silver_ore', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   25,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Лаврионские рудники (Аттика) эксплуатировали более 10 000 рабов и к V в. до н.э. приносили Афинам около 25–30 талантов серебра в год.',
    slave_mortality_mod: 0.010,
  },

  // ── УГОЛЬНАЯ ЯМА ─────────────────────────────────────────────
  charcoal_kiln: {
    name:        'Угольная яма (углежжение)',
    icon:        '🪵',
    description: 'Пережиг дров в древесный уголь — топливо для кузниц и металлургии. ' +
                 'Несколько дровосеков укладывают кострище, засыпают землёй и жгут неделями. ' +
                 'Допустима лишь там, где есть достаточно леса.',
    cost:        150,
    category:    'production',
    footprint_ha: 5,
    workers_per_unit: 6,
    worker_profession: [
      { profession: 'craftsmen', count: 4 },
      { profession: 'farmers',   count: 2 },
    ],
    wage_rate:          0.25,
    labor_type:         'mixed',
    construction_materials: { timber: 3, tools: 1 },
    construction_labor:     76,
    build_turns:        1,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'charcoal', base_rate: 90 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 20, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'biome', deposit_key: null,
      allowed_biomes: ['temperate_forest', 'alpine', 'steppe'],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          5,
    maintenance_cost:   3,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Для выплавки 1 таланта железа требовалось около 4 талантов древесного угля — углежжение было критической отраслью античной металлургии.',
  },

  // ── БРОНЗОЛИТЕЙНЯ ────────────────────────────────────────────
  bronze_foundry: {
    name:        'Бронзолитейня',
    icon:        '🫗',
    description: 'Плавка бронзы из меди и олова — высокотехнологичное производство античности. ' +
                 'Требует постоянного притока обоих металлов и угля для горна. ' +
                 'Олово почти всегда привозное, из далёких Корнуолла или Испании.',
    cost:        700,
    category:    'production',
    footprint_ha: 4,
    workers_per_unit: 25,
    worker_profession: [
      { profession: 'craftsmen', count: 20 },
      { profession: 'slaves',    count: 5 },
    ],
    wage_rate:          0.24,
    labor_type:         'mixed',
    construction_materials: { timber: 10, iron: 5, tools: 5 },
    construction_labor:     180,
    build_turns:        4,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'bronze', base_rate: 55 },
    ],
    production_inputs: [
      { good: 'copper',   amount_per_turn: 10, required: true },
      { good: 'tin',      amount_per_turn:  5, required: true },
      { good: 'charcoal', amount_per_turn:  8, required: true },
    ],
    capital_inputs: [
      { good: 'tools', count_per_level: 3, monthly_wear: 0.020,
        alt_good: null, alt_efficiency: null },
    ],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   12,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Афинская литейная у храма Гефеста производила тысячи бронзовых щитов и статуй в год; бронза оставалась основным конструкционным металлом до II в. до н.э.',
  },

  // ── КОЖЕВНЯ ──────────────────────────────────────────────────
  tannery: {
    name:        'Кожевня',
    icon:        '🐄',
    description: 'Выделка кожи из шкур скота: вымачивание, дубление дубовой корой, сушка. ' +
                 'Ремесленники работают за долю выручки. ' +
                 'Дурно пахнущее производство исторически выносили за городскую черту.',
    cost:        280,
    category:    'production',
    footprint_ha: 3,
    workers_per_unit: 20,
    worker_profession: [
      { profession: 'craftsmen', count: 20 },
    ],
    wage_rate:          0.28,
    labor_type:         'wage',
    construction_materials: { timber: 6, tools: 3 },
    construction_labor:     124,
    build_turns:        2,
    autonomous_builder: 'craftsmen_class',
    nation_buildable:   true,
    production_output: [
      { good: 'leather', base_rate: 65 },
    ],
    production_inputs: [
      { good: 'cattle', amount_per_turn: 8, required: true },
      { good: 'wool',   amount_per_turn: 5, required: false },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   6,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Кожевенный квартал (βυρσοδεψεία) в античных городах всегда располагался у воды и вниз по ветру; афинская кожевенная деловая сеть Клеона была знаменита своим богатством.',
  },

  // ── ТКАЦКАЯ МАСТЕРСКАЯ ───────────────────────────────────────
  textile_mill: {
    name:        'Ткацкая мастерская',
    icon:        '🧵',
    description: 'Прядение и ткачество шерстяных тканей. ' +
                 'Ремесленники-ткачи работают за наёмную плату; основной товар — ' +
                 'грубая шерстяная ткань для армии и народа.',
    cost:        320,
    category:    'production',
    footprint_ha: 2,
    workers_per_unit: 30,
    worker_profession: [
      { profession: 'craftsmen', count: 25 },
      { profession: 'slaves',    count: 5 },
    ],
    wage_rate:          0.27,
    labor_type:         'mixed',
    construction_materials: { timber: 6, tools: 3 },
    construction_labor:     134,
    build_turns:        2,
    autonomous_builder: 'craftsmen_class',
    nation_buildable:   true,
    production_output: [
      { good: 'cloth', base_rate: 70 },
    ],
    production_inputs: [
      { good: 'wool', amount_per_turn: 15, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          5,
    maintenance_cost:   8,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Пергамский текстиль экспортировался по всему Средиземноморью; крупнейшие ткацкие хозяйства Рима использовали труд сотен рабынь.',
  },

  // ── ПАСЕКА ───────────────────────────────────────────────────
  apiary: {
    name:        'Пасека',
    icon:        '🍯',
    description: 'Разведение пчёл для получения мёда и воска. ' +
                 'Несколько пасечников обслуживают ульи; труд лёгкий и сезонный. ' +
                 'Строится фермерами самостоятельно, государство не вмешивается.',
    cost:        100,
    category:    'agriculture',
    footprint_ha: 3,
    workers_per_unit: 4,
    worker_profession: [
      { profession: 'farmers', count: 4 },
    ],
    wage_rate:          0.35,
    labor_type:         'free',
    construction_materials: { timber: 2, tools: 1 },
    construction_labor:     27,
    build_turns:        1,
    autonomous_builder: 'farmers_class',
    nation_buildable:   false,
    production_output: [
      { good: 'honey', base_rate: 40 },
      { good: 'wax',   base_rate: 20 },
    ],
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          6,
    maintenance_cost:   2,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Аттический мёд с горы Гиметт считался лучшим в античном мире и экспортировался по всему Средиземноморью; воск шёл на таблички, свечи и корабельную конопатку.',
  },

  // ── РЫБОЛОВЕЦКОЕ ХОЗЯЙСТВО ───────────────────────────────────
  fishery: {
    name:        'Рыболовецкое хозяйство',
    icon:        '🎣',
    description: 'Прибрежный рыбный промысел: сети, верши, лодки. ' +
                 'Моряки выходят ежедневно; улов идёт на рынок и на засолку. ' +
                 'Строится только на морском побережье или у рек.',
    cost:        280,
    category:    'production',
    footprint_ha: 5,
    workers_per_unit: 50,
    worker_profession: [
      { profession: 'sailors',   count: 40 },
      { profession: 'craftsmen', count: 10 },
    ],
    wage_rate:          0.30,
    labor_type:         'free',
    construction_materials: { timber: 7, tools: 3 },
    construction_labor:     130,
    build_turns:        2,
    autonomous_builder: 'sailors_class',
    nation_buildable:   true,
    production_output: [
      { good: 'fish', base_rate: 80 },
    ],
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'biome', deposit_key: null,
      allowed_biomes: ['mediterranean_coast', 'river_valley'],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          5,
    maintenance_cost:   5,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Понтийское побережье и Боспор Киммерийский поставляли Афинам сушёную и солёную рыбу; рыболовство было одним из главных промыслов всего Средиземноморья.',
  },

  // ── МАСТЕРСКАЯ ГАРУМА ────────────────────────────────────────
  garum_workshop: {
    name:        'Мастерская гарума',
    icon:        '🐟',
    description: 'Производство рыбного соуса из ферментированных рыбных внутренностей с солью. ' +
                 'Гарум был важнейшим кулинарным и торговым продуктом Рима и Карфагена. ' +
                 'Требует постоянного притока рыбы и соли.',
    cost:        350,
    category:    'production',
    footprint_ha: 2,
    workers_per_unit: 12,
    worker_profession: [
      { profession: 'craftsmen', count: 12 },
    ],
    wage_rate:          0.28,
    labor_type:         'free',
    construction_materials: { timber: 7, stone: 3, tools: 3 },
    construction_labor:     120,
    build_turns:        2,
    autonomous_builder: 'sailors_class',
    nation_buildable:   true,
    production_output: [
      { good: 'garum', base_rate: 55 },
    ],
    production_inputs: [
      { good: 'fish', amount_per_turn: 20, required: true },
      { good: 'salt', amount_per_turn:  5, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   5,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Карфагенский и испанский гарум (Гадес, Картахена) были главными экспортными продуктами западного Средиземноморья — амфоры с ним найдены по всей Римской империи.',
  },

  // ── БОЙНЯ И МЯСНАЯ ЛАВКА ─────────────────────────────────────
  butchery: {
    name:        'Бойня и мясная лавка',
    icon:        '🥩',
    description: 'Забой скота и продажа мяса на рынке. ' +
                 'Ремесленники-мясники работают за долю выручки. ' +
                 'Требует регулярного подвоза живого скота.',
    cost:        200,
    category:    'production',
    footprint_ha: 1,
    workers_per_unit: 15,
    worker_profession: [
      { profession: 'craftsmen', count: 15 },
    ],
    wage_rate:          0.28,
    labor_type:         'wage',
    construction_materials: { timber: 4, tools: 2 },
    construction_labor:     86,
    build_turns:        1,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'meat', base_rate: 60 },
    ],
    production_inputs: [
      { good: 'cattle', amount_per_turn: 10, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   4,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Городские бойни (macellum) были обычным явлением в римских и греческих городах; жертвенный скот после храмовых ритуалов часто продавался на рынке.',
  },

  // ── КАМЕНОЛОМНЯ ──────────────────────────────────────────────
  quarry: {
    name:        'Каменоломня',
    icon:        '🪨',
    description: 'Добыча строительного камня в горах и холмах. ' +
                 'Тяжёлый физический труд: рабы колют камень, ремесленники-надзиратели правят работы. ' +
                 'Строится только в холмистой и горной местности.',
    cost:        400,
    category:    'production',
    footprint_ha: 15,
    workers_per_unit: 40,
    worker_profession: [
      { profession: 'craftsmen', count: 10 },
      { profession: 'slaves',    count: 30 },
    ],
    wage_rate:          0.12,
    labor_type:         'mixed',
    construction_materials: { timber: 8, iron: 4, tools: 5 },
    construction_labor:     143,
    build_turns:        3,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'stone', base_rate: 100 },
    ],
    production_inputs: [
      { good: 'tools', amount_per_turn: 5, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'biome', deposit_key: null,
      allowed_biomes: ['mediterranean_hills', 'alpine', 'volcanic'],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   8,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Сиракузские каменоломни Latomie del Paradiso служили одновременно тюрьмой для 7000 афинских пленных (413 до н.э.) и главным источником камня для строительства города.',
    slave_mortality_mod: 0.003,
  },

  // ── КРАСИЛЬНЯ ПУРПУРА ────────────────────────────────────────
  dye_works: {
    name:        'Красильня пурпура',
    icon:        '🟣',
    description: 'Получение тирского пурпура из улиток мурекс — самый дорогой краситель античности. ' +
                 'Тысячи улиток дают лишь граммы краски; вся мастерская пропитана запахом гниения. ' +
                 'Возможна только на средиземноморском побережье с залежами мурекса.',
    cost:        500,
    category:    'production',
    footprint_ha: 3,
    workers_per_unit: 10,
    worker_profession: [
      { profession: 'craftsmen', count: 8 },
      { profession: 'slaves',    count: 2 },
    ],
    wage_rate:          0.22,
    labor_type:         'mixed',
    construction_materials: { timber: 6, stone: 4, tools: 3 },
    construction_labor:     137,
    build_turns:        3,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'purple_dye', base_rate: 15 },
    ],
    production_inputs: [
      { good: 'fish', amount_per_turn: 5, required: false },
      { good: 'salt', amount_per_turn: 3, required: false },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'hybrid', deposit_key: 'murex',
      allowed_biomes: ['mediterranean_coast'],
    },
    terrain_restriction: [],
    max_per_region:     1,
    max_level:          3,
    maintenance_cost:   10,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Тирский пурпур (Murex brandaris) стоил дороже золота по весу — 1 г краски требовал около 9000 улиток, что делало его монополией финикийцев и карфагенян.',
  },

  // ── ТОРГОВАЯ ФАКТОРИЯ ────────────────────────────────────────
  trading_post: {
    name:        'Торговая фактория',
    icon:        '🏪',
    description: 'Перевалочный пункт для транзитной торговли — генерирует торговые товары из потока грузов. ' +
                 'Торговцы работают за комиссию; выгодна в узловых точках торговых путей. ' +
                 'Даёт небольшой бонус к торговым доходам региона.',
    cost:        450,
    category:    'commerce',
    footprint_ha: 2,
    workers_per_unit: 30,
    worker_profession: [
      { profession: 'merchants', count: 30 },
    ],
    wage_rate:          0.30,
    labor_type:         'wage',
    construction_materials: { timber: 8, tools: 4 },
    construction_labor:     158,
    build_turns:        2,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'trade_goods', base_rate: 50 },
    ],
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   8,
    maintenance_goods:  {},
    effects: {
      trade_income_mult: 1.1,
    },
    historical_note: 'Карфагенские фактории (emporion) на берегах Африки и Иберии позволяли контролировать обмен золота и слоновой кости без постоянных колоний.',
  },

  // ── ОЛИВКОВАЯ РОЩА ───────────────────────────────────────────
  olive_grove: {
    name:        'Оливковая роща',
    icon:        '🫒',
    description: 'Посадка и уход за оливковыми деревьями. ' +
                 'Деревья начинают плодоносить через 10–15 лет, зато живут столетиями. ' +
                 'Строится только в средиземноморском климате.',
    cost:        250,
    category:    'agriculture',
    footprint_ha: 40,
    workers_per_unit: 20,
    worker_profession: [
      { profession: 'farmers', count: 15 },
      { profession: 'slaves',  count: 5 },
    ],
    wage_rate:          0.30,
    labor_type:         'mixed',
    construction_materials: { timber: 3, tools: 2 },
    construction_labor:     95,
    build_turns:        3,
    autonomous_builder: 'farmers_class',
    nation_buildable:   true,
    production_output: [
      { good: 'olives', base_rate: 120 },
    ],
    production_inputs: [],
    capital_inputs: [
      { good: 'tools', count_per_level: 2, monthly_wear: 0.015,
        alt_good: null, alt_efficiency: null },
    ],
    location_requirement: {
      type: 'biome', deposit_key: null,
      allowed_biomes: ['mediterranean_coast', 'mediterranean_hills'],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          6,
    maintenance_cost:   5,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Оливковое масло было основой экономики классических Афин; Солон запретил вырубку олив под страхом смерти — настолько они были ценны для полиса.',
  },

  // ── ЗОЛОТОЙ РУДНИК ───────────────────────────────────────────
  gold_mine: {
    name:        'Золотой рудник',
    icon:        '🥇',
    description: 'Добыча золота — россыпного или жильного. ' +
                 'Исключительно рабский труд в тяжелейших условиях; смертность огромна. ' +
                 'Строится только в регионах с золотыми месторождениями.',
    cost:        1400,
    category:    'production',
    footprint_ha: 20,
    workers_per_unit: 80,
    worker_profession: [
      { profession: 'craftsmen', count: 10 },
      { profession: 'slaves',    count: 70 },
    ],
    wage_rate:          0.05,
    labor_type:         'slave',
    construction_materials: { timber: 16, iron: 8, tools: 8 },
    construction_labor:     312,
    build_turns:        6,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'gold', base_rate: 20 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 10, required: true },
      { good: 'tools',  amount_per_turn:  6, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'gold_ore', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   30,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Нубийские золотые рудники Египта (Вади-Аллаки) к III в. до н.э. были крупнейшими в мире; Диодор Сицилийский описывает условия труда там как ужасающие.',
    slave_mortality_mod: 0.012,
  },

  // ── КОНОПЛЯНОЕ ПОЛЕ ──────────────────────────────────────────
  hemp_field: {
    name:        'Конопляное поле',
    icon:        '🌿',
    description: 'Возделывание конопли для получения волокна и верёвок. ' +
                 'Конопляный канат был незаменим для флота и строительства. ' +
                 'Строится в умеренном и степном климате.',
    cost:        150,
    category:    'agriculture',
    footprint_ha: 20,
    workers_per_unit: 15,
    worker_profession: [
      { profession: 'farmers', count: 15 },
    ],
    wage_rate:          0.30,
    labor_type:         'tenant',
    construction_materials: { timber: 2, tools: 1 },
    construction_labor:     67,
    build_turns:        1,
    autonomous_builder: 'farmers_class',
    nation_buildable:   true,
    production_output: [
      { good: 'hemp', base_rate: 100 },
    ],
    production_inputs: [],
    capital_inputs: [
      { good: 'tools', count_per_level: 1, monthly_wear: 0.015,
        alt_good: null, alt_efficiency: null },
    ],
    location_requirement: {
      type: 'biome', deposit_key: null,
      allowed_biomes: ['temperate_forest', 'steppe', 'river_valley'],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          5,
    maintenance_cost:   3,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Скифы и народы Причерноморья выращивали коноплю тысячелетиями; Геродот описывает скифские конопляные бани. Римский флот потреблял огромные количества пеньки для такелажа.',
  },

  // ── СМОЛОКУРНЯ ───────────────────────────────────────────────
  pitch_works: {
    name:        'Смолокурня',
    icon:        '🌲',
    description: 'Перегонка смолы из хвойной древесины — производство корабельной смолы и дёгтя. ' +
                 'Без pitch невозможно законопатить и просмолить корабль. ' +
                 'Строится только там, где есть хвойный лес.',
    cost:        200,
    category:    'production',
    footprint_ha: 8,
    workers_per_unit: 10,
    worker_profession: [
      { profession: 'craftsmen', count: 7 },
      { profession: 'farmers',   count: 3 },
    ],
    wage_rate:          0.25,
    labor_type:         'mixed',
    construction_materials: { timber: 5, tools: 2 },
    construction_labor:     83,
    build_turns:        2,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'pitch', base_rate: 60 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 12, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'biome', deposit_key: null,
      allowed_biomes: ['temperate_forest', 'alpine'],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   4,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Македония и Фракия были главными поставщиками корабельной смолы для греческих флотов; контроль над хвойными лесами Македонии был стратегическим приоритетом Афин.',
  },

  // ── СБОР ЯНТАРЯ ──────────────────────────────────────────────
  amber_gathering: {
    name:        'Янтарный промысел',
    icon:        '🟠',
    description: 'Сбор янтаря на балтийском побережье — поиск на пляжах и ловля сетями с лодок. ' +
                 'Простой труд, но доступен только там, где янтарь выбрасывает море. ' +
                 'Собранный янтарь идёт на юг по Янтарному пути через тысячи км.',
    cost:        120,
    category:    'production',
    footprint_ha: 10,
    workers_per_unit: 15,
    worker_profession: [
      { profession: 'farmers', count: 12 },
      { profession: 'sailors', count: 3 },
    ],
    wage_rate:          0.32,
    labor_type:         'free',
    construction_materials: { timber: 3, tools: 1 },
    construction_labor:     56,
    build_turns:        1,
    autonomous_builder: 'farmers_class',
    nation_buildable:   true,
    production_output: [
      { good: 'amber', base_rate: 30 },
    ],
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'amber_beds', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     1,
    max_level:          3,
    maintenance_cost:   2,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Самбийский полуостров (совр. Калининград) был главным источником янтаря античности; Плиний Старший описывает янтарный путь длиной более 600 миль от Балтики до Карнунта.',
  },

  // ── ПУШНОЙ ПРОМЫСЕЛ ──────────────────────────────────────────
  fur_trapping: {
    name:        'Пушной промысел',
    icon:        '🦊',
    description: 'Охота и ловля пушных зверей в северных лесах и тундре. ' +
                 'Охотники расставляют ловушки на соболя, куницу, бобра и лису. ' +
                 'Меха высоко ценятся на юге как предмет роскоши и зимняя одежда.',
    cost:        100,
    category:    'production',
    footprint_ha: 50,
    workers_per_unit: 10,
    worker_profession: [
      { profession: 'farmers', count: 10 },
    ],
    wage_rate:          0.35,
    labor_type:         'free',
    construction_materials: { timber: 2, tools: 1 },
    construction_labor:     47,
    build_turns:        1,
    autonomous_builder: 'farmers_class',
    nation_buildable:   true,
    production_output: [
      { good: 'furs', base_rate: 35 },
    ],
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'fur_grounds', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   2,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Скифские и германские племена торговали мехами с греческими колониями Причерноморья; Геродот упоминает торговлю мехами у народов к северу от Скифии.',
  },

  // ── ОЛОВЯННЫЙ РУДНИК ─────────────────────────────────────────
  tin_mine: {
    name:        'Оловянный рудник',
    icon:        '⬜',
    description: 'Добыча касситерита — оловянной руды. ' +
                 'Крупнейшие месторождения античности — в Иберии, Корнуолле и Бретани. ' +
                 'Без олова невозможно производство бронзы; контроль над рудниками — стратегический приоритет.',
    cost:        950,
    category:    'production',
    footprint_ha: 20,
    workers_per_unit: 55,
    worker_profession: [
      { profession: 'craftsmen', count: 10 },
      { profession: 'slaves',    count: 45 },
    ],
    wage_rate:          0.08,
    labor_type:         'slave',
    construction_materials: { timber: 12, iron: 5, tools: 6 },
    construction_labor:     207,
    build_turns:        5,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'tin', base_rate: 45 },
    ],
    production_inputs: [
      { good: 'timber', amount_per_turn: 7, required: true },
      { good: 'tools',  amount_per_turn: 4, required: true },
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'tin_ore', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   18,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Финикийцы и карфагеняне монополизировали морской путь к оловянным "Кассiteridам" (Британским островам); само слово "касситерит" — греческого происхождения.',
    slave_mortality_mod: 0.004,
  },

  // ── ПЛАНТАЦИЯ БЛАГОВОНИЙ ─────────────────────────────────────
  incense_grove: {
    name:        'Плантация благовоний',
    icon:        '🌿',
    description: 'Сбор ладана (Boswellia) и мирры (Commiphora) в аравийских и восточноафриканских пустынях. ' +
                 'Деревья надрезают, смола застывает и собирается вручную. ' +
                 'Возможно только в пустынных регионах с соответствующими деревьями.',
    cost:        300,
    category:    'production',
    footprint_ha: 30,
    workers_per_unit: 20,
    worker_profession: [
      { profession: 'farmers', count: 20 },
    ],
    wage_rate:          0.30,
    labor_type:         'free',
    construction_materials: { timber: 3, tools: 2 },
    construction_labor:     115,
    build_turns:        2,
    autonomous_builder: 'farmers_class',
    nation_buildable:   true,
    production_output: [
      { good: 'incense', base_rate: 40 },
    ],
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'incense_trees', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     null,
    max_level:          4,
    maintenance_cost:   5,
    maintenance_goods:  {},
    effects: {},
    historical_note: 'Сабейское царство (Йемен) контролировало торговлю ладаном; путь благовоний из Аравии Феликс в Газу занимал около 65 дней на верблюдах.',
  },

  // ── РАБОТОРГОВЫЙ РЫНОК ───────────────────────────────────────
  slave_market: {
    name:        'Работорговый рынок',
    icon:        '⛓️',
    description: 'Рынок для продажи и распределения рабов, захваченных в ходе войн или куплённых у торговцев. ' +
                 'Здание само рабов НЕ производит — они поступают только как военные трофеи или по торговым маршрутам. ' +
                 'Без рынка захваченные рабы не могут быть распределены в хозяйство региона.',
    cost:        350,
    category:    'commerce',
    footprint_ha: 2,
    workers_per_unit: 15,
    worker_profession: [
      { profession: 'merchants', count: 15 },
    ],
    wage_rate:          0.28,
    labor_type:         'wage',
    construction_materials: { timber: 6, stone: 3, tools: 3 },
    construction_labor:     128,
    build_turns:        2,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [],   // рабы не производятся — только военный захват
    production_inputs: [],
    capital_inputs: [],
    location_requirement: {
      type: 'none', deposit_key: null, allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     1,
    max_level:          2,
    maintenance_cost:   6,
    maintenance_goods:  {},
    effects: {
      slave_intake_capacity: 500,   // макс. рабов в ход из военных трофеев
      slave_price_mod:      -0.10,  // -10% к цене рабов в регионе (предложение растёт)
    },
    historical_note: 'Делос был крупнейшим невольничьим рынком античности — по словам Страбона, через него проходило до 10 000 рабов в день; Карфаген и Рим имели постоянные рынки у форума.',
  },

  // ── ЗАГОН ДЛЯ БОЕВЫХ СЛОНОВ ──────────────────────────────────
  elephant_corral: {
    name:        'Загон для боевых слонов',
    icon:        '🐘',
    description: 'Содержание, кормёжка и боевая дрессировка слонов под руководством опытных mahout. ' +
                 'Строится только там, где водятся слоны — в саваннах Африки или субтропиках. ' +
                 'Слоны требуют огромного количества корма и годами обучаются бою.',
    cost:        800,
    category:    'military',
    footprint_ha: 30,
    workers_per_unit: 25,
    worker_profession: [
      { profession: 'craftsmen', count: 15 },  // mahout-дрессировщики
      { profession: 'farmers',   count: 10 },  // заготовка корма
    ],
    wage_rate:          0.25,
    labor_type:         'wage',
    construction_materials: { timber: 12, iron: 4, tools: 4 },
    construction_labor:     230,
    build_turns:        4,
    autonomous_builder: null,
    nation_buildable:   true,
    production_output: [
      { good: 'war_elephants', base_rate: 5 },  // медленное воспроизводство
    ],
    production_inputs: [
      { good: 'wheat', amount_per_turn: 20, required: true },  // корм
      { good: 'meat',  amount_per_turn:  8, required: false }, // доп. корм
    ],
    capital_inputs: [],
    location_requirement: {
      type: 'deposit', deposit_key: 'elephant_grounds', allowed_biomes: [],
    },
    terrain_restriction: [],
    max_per_region:     1,
    max_level:          3,
    maintenance_cost:   20,
    maintenance_goods:  {},
    effects: {
      army_elephant_cap: 10,  // +10 слонов к боевому лимиту армии на уровень
    },
    historical_note: 'Карфаген использовал лесных слонов из Атласских гор; Птолемеи охотились на слонов в Эфиопии. Один боевой слон требовал корма как 40 солдат и дрессировки 2–3 года.',
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
    workers_per_unit: 8,
    location_requirement: {"type":"biome","deposit_key":null,"allowed_biomes":["river_valley","subtropical"]},
    historical_note: "Заросли папируса у Сиракуз (река Анапо) — единственное место в Европе, где рос папирус; небольшое местное производство не покрывало нужд и дополнялось египетским импортом.",
  },

};

// ══════════════════════════════════════════════════════════════
// СЛОТЫ СТРОИТЕЛЬСТВА ПО ТИПУ МЕСТНОСТИ
// Максимальное количество зданий, которое можно возвести в регионе
// ══════════════════════════════════════════════════════════════

const TERRAIN_MAX_SLOTS = {
  coastal_city:  20,
  river_valley:  18,
  plains:        15,
  hills:         12,
  mountains:     10,
  ocean:          0,
  rural:         12,  // устаревший тип, fallback
  default:       10,
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
// РЕЦЕПТЫ ПРОИЗВОДСТВА — определены в data/chains_data.js
// BUILDING_RECIPES генерируется там же из CHAINS_DATA + RECIPE_DATA.
// Изменять рецепты в chains_data.js (секция RECIPE_DATA внизу файла).
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
      if (b.nation_buildable === false) return false;
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

  // Ограничение по местности (пустой массив = нет ограничений)
  if (b.terrain_restriction?.length && !b.terrain_restriction.includes(terrain)) {
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
  // null означает «без верхнего предела» (ограничено землёй/населением, а не константой)
  const maxLevel    = b.max_level ?? Infinity;
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

  // Ограничение max_per_region (например, port: 1)
  if (b.max_per_region != null) {
    const countInRegion =
      (region.building_slots || []).filter(
        s => s.building_id === buildingId && s.status !== 'demolished'
      ).length +
      (region.construction_queue || []).filter(
        e => e.building_id === buildingId && !e.is_upgrade
      ).length;
    if (countInRegion >= b.max_per_region) {
      return { ok: false, reason: `Максимум ${b.max_per_region} здание(й) этого типа в регионе` };
    }
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
