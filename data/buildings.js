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

  farm: {
    name:        'Ферма',
    icon:        '🌾',
    description: 'Семейная ферма. Арендаторы-земледельцы отдают часть урожая владельцу.',
    cost:        400,
    category:    'agriculture',

    worker_profession: [
      { profession: 'farmers', count: 500 },
    ],
    wage_rate:          0.30,   // 30% урожая остаётся у арендаторов
    labor_type:         'tenant',
    build_turns:        2,
    terrain_restriction: ['plains', 'hills', 'river_valley'],
    max_per_region:     null,   // можно строить несколько
    max_level:          5,

    production_output: [
      { good: 'wheat',  base_rate: 200 },
      { good: 'barley', base_rate:  80 },
    ],

    // legacy
    profession_growth: { farmers: 0.005 },
  },

  ranch: {
    name:        'Пастбище',
    icon:        '🐑',
    description: 'Скотоводческое хозяйство. Даёт шерсть, кожу и мёд.',
    cost:        300,
    category:    'agriculture',

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

  latifundium: {
    name:        'Латифундия',
    icon:        '🌿',
    description: 'Крупное поместье. Земледельцы — издольщики, рабы — без оплаты.',
    cost:        900,
    category:    'agriculture',

    worker_profession: [
      { profession: 'farmers', count: 600 },
      { profession: 'slaves',  count: 200 },
    ],
    wage_rate:          0.28,   // арендаторы получают ~28% урожая (рабы — ничего)
    labor_type:         'tenant',  // аристократ-землевладелец = profit goes to aristocrats
    build_turns:        4,
    terrain_restriction: ['plains', 'hills', 'river_valley'],
    max_per_region:     null,
    max_level:          3,

    production_output: [
      { good: 'wheat',  base_rate: 180 },
      { good: 'olives', base_rate:  60 },
    ],

    // legacy
    profession_growth:        { farmers: 0.008, slaves: 0.022 },
    mobility:                 [{ from: 'farmers', to: 'slaves', rate: 0.003 }],
    needs_satisfaction_bonus:  0.04,
  },

  irrigation: {
    name:        'Ирригационные каналы',
    icon:        '💧',
    description: 'Система орошения. Требует постоянного обслуживания земледельцами.',
    cost:        1100,
    category:    'agriculture',

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
  // СИЦИЛИЙСКИЕ (УНИКАЛЬНЫЕ ПРОВИНЦИАЛЬНЫЕ)
  // region_tag_restriction: ['sicily'] — строятся только в регионах Сицилии
  // ══════════════════════════════════════════════════════════════

  sulfur_mine: {
    name:        'Серные рудники',
    icon:        '🟡',
    description: 'Подземные залежи серы у подножий Этны. Рабы и ремесленники добывают зелёный камень — основу дубильного и аптечного ремесла.',
    cost:        700,
    category:    'production',

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

  grain_estate: {
    name:        'Сицилийская пшеничная латифундия',
    icon:        '🌾',
    description: 'Обширное поместье на плодороднейших равнинах Леонтин и Акраганта. Сицилийская пшеница кормила весь греческий мир. Арендаторы и рабы работают на владельца.',
    cost:        1200,
    category:    'agriculture',

    worker_profession: [
      { profession: 'farmers', count: 900 },
      { profession: 'slaves',  count: 300 },
    ],
    wage_rate:               0.28,   // аренда на сицилийских условиях
    labor_type:              'tenant',
    build_turns:             5,
    terrain_restriction:     ['plains', 'river_valley'],
    region_tag_restriction:  ['sicily'],
    max_per_region:          null,
    max_level:          5,

    production_output: [
      { good: 'wheat',  base_rate: 300 },  // исключительная урожайность
      { good: 'barley', base_rate: 110 },
    ],

    class_happiness_bonus: {
      farmers_class: 2,   // земледельцы ценят stabile landholding
    },
  },

  papyrus_bed: {
    name:        'Папирусные заросли',
    icon:        '📜',
    description: 'Заросли папируса вдоль реки Киана у Сиракуз — единственное место в Европе, где растёт нильский папирус. Ценнейшее писчее сырьё.',
    cost:        400,
    category:    'production',

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
// РЕЦЕПТЫ ПРОИЗВОДСТВА
//
// Структура записи:
//   output_good           — производимый товар (совпадает с ключом в production_output)
//   inputs[]              — { good, amount } потребляется на 1 единицу выхода
//   labor_cost_per_worker — золото/тик на 1 единицу выхода (компонент себестоимости)
//
// Назначение:
//   • inputs.amount × market_price → себестоимость сырья
//   • Σ(input costs) + labor_cost_per_worker = production_cost товара
//   • production_cost × 0.5 = price_floor (обновляется каждый тик)
//   • production_ratio = min(available_input / needed) — частичное производство
//     при нехватке сырья; создаёт каскадный дефицит по цепочке
//
// Здания без рецептов (нет входных товаров) — ratio = 1.0 всегда.
// ══════════════════════════════════════════════════════════════

const BUILDING_RECIPES = {

  // ── Мастерские ────────────────────────────────────────────────────────────
  workshop: [
    {
      output_good:            'tools',
      inputs: [
        { good: 'iron',   amount: 2.0 },  // 2 таланта железа + 0.5 воза дерева = 1 набор инструментов
        { good: 'timber', amount: 0.5 },
      ],
      labor_cost_per_worker: 8,
    },
    {
      output_good:            'cloth',
      inputs: [
        { good: 'wool', amount: 1.5 },    // 1.5 тюка шерсти = 1 тюк ткани
      ],
      labor_cost_per_worker: 6,
    },
    {
      output_good:            'pottery',
      inputs: [
        { good: 'timber', amount: 0.3 },  // дрова для обжига
      ],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Давильня ──────────────────────────────────────────────────────────────
  oil_press: [
    {
      output_good:            'olive_oil',
      inputs: [
        { good: 'olives', amount: 2.0 },  // 2 амфоры оливок → 1 амфора масла
      ],
      labor_cost_per_worker: 5,
    },
  ],

  // ── Винодельня ────────────────────────────────────────────────────────────
  winery: [
    {
      output_good:            'wine',
      inputs: [
        { good: 'barley', amount: 0.5 },  // ячмень — зерновая основа брожения
      ],
      labor_cost_per_worker: 7,
    },
  ],

  // ── Гончарная мастерская ──────────────────────────────────────────────────
  pottery_workshop: [
    {
      output_good:            'pottery',
      inputs: [
        { good: 'timber', amount: 0.2 },  // дрова для обжига в гончарных печах
      ],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Рудники ───────────────────────────────────────────────────────────────
  mine: [
    {
      output_good:            'iron',
      inputs:                 [],          // прямая добыча руды
      labor_cost_per_worker: 12,
    },
    {
      output_good:            'bronze',
      inputs: [
        { good: 'iron', amount: 0.5 },    // бронза = медь+олово, упрощение: тратит железо
      ],
      labor_cost_per_worker: 15,
    },
  ],

  // ── Солеварня ─────────────────────────────────────────────────────────────
  salt_works: [
    {
      output_good:            'salt',
      inputs:                 [],          // выпаривание морской воды
      labor_cost_per_worker: 6,
    },
  ],

  // ── Лесозаготовка ─────────────────────────────────────────────────────────
  lumber_camp: [
    {
      output_good:            'timber',
      inputs:                 [],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Ферма ─────────────────────────────────────────────────────────────────
  farm: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'barley', inputs: [], labor_cost_per_worker: 3 },
  ],

  // ── Пастбище ──────────────────────────────────────────────────────────────
  ranch: [
    { output_good: 'wool',    inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'leather', inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'honey',   inputs: [], labor_cost_per_worker: 2 },
  ],

  // ── Латифундия ────────────────────────────────────────────────────────────
  latifundium: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 2 },
    { output_good: 'olives', inputs: [], labor_cost_per_worker: 2 },
  ],

  // ── Сицилийская пшеничная латифундия ─────────────────────────────────────
  grain_estate: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 2 },
    { output_good: 'barley', inputs: [], labor_cost_per_worker: 2 },
  ],

  // ── Серные рудники ────────────────────────────────────────────────────────
  sulfur_mine: [
    { output_good: 'sulfur', inputs: [], labor_cost_per_worker: 10 },
  ],

  // ── Тоня (ловушка для тунца) ──────────────────────────────────────────────
  tuna_trap: [
    { output_good: 'tuna', inputs: [], labor_cost_per_worker: 6 },
  ],

  // ── Папирусные заросли ────────────────────────────────────────────────────
  papyrus_bed: [
    { output_good: 'papyrus', inputs: [], labor_cost_per_worker: 4 },
  ],

  // ── Порт ──────────────────────────────────────────────────────────────────
  port: [
    { output_good: 'fish',        inputs: [], labor_cost_per_worker: 5  },
    { output_good: 'trade_goods', inputs: [], labor_cost_per_worker: 10 },
  ],
};

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

  return { ok: true, reason: null, is_upgrade: false };
}
