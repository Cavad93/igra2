// ═══════════════════════════════════════════════════════════════════════════
// ТРУДОВОЕ ЗАКОНОДАТЕЛЬСТВО — каталог законов о труде, возрасте и занятости
//
// Законы управляют:
//   • min_work_age              — минимальный возраст начала труда (лет)
//   • child_labor_intensity     — доля детей, вовлечённых в труд (0.0–1.0)
//   • elder_threshold           — возраст перехода в статус «пожилой» (лет)
//   • elder_work_intensity      — доля пожилых, продолжающих работать (0.0–1.0)
//   • women_participation       — доля женщин, участвующих в рыночной экономике
//
// Каждый закон принадлежит одной несовместимой группе (incompatible_with).
// is_default = true → закон применяется при старте и при отмене конкурента.
//
// satisfaction_effects: { classId: delta } — прямое изменение satisfaction классов
//   при активном законе (применяется каждый ход через _labor_law_bonuses).
//   Малые значения: +3/−3 = ощутимо, +8/−8 = значительно.
// ═══════════════════════════════════════════════════════════════════════════

const LAWS_LABOR = {

  // ══════════════════════════════════════════════════════
  // МИНИМАЛЬНЫЙ ВОЗРАСТ ТРУДА
  // ══════════════════════════════════════════════════════

  work_age_8: {
    id:          'work_age_8',
    name:        'Труд с 8 лет',
    icon:        '⚒',
    category:    'labor',
    group:       'min_work_age',
    description: 'Дети от 8 лет обязаны работать наравне со взрослыми. Максимальный трудовой ресурс, но ценой здоровья и будущего детей.',
    effects: {
      labor_laws: { min_work_age: 8, child_labor_intensity: 0.80 },
    },
    // Постоянный бонус/штраф удовлетворённости пока закон активен
    satisfaction_effects: {
      clergy_class: -8,
      citizens:     -5,
      slaves_class: -3,  // дети рабов страдают больше всех
    },
    incompatible_with: ['work_age_10', 'work_age_12', 'work_age_14', 'work_age_16'],
    is_default: false,
    historical_note: 'В Риме дети из бедных семей работали с 7–8 лет: мальчики помогали отцам в поле или ремесленных мастерских, девочки — на кухне и за прялкой.',
  },

  work_age_10: {
    id:          'work_age_10',
    name:        'Труд с 10 лет',
    icon:        '👦',
    category:    'labor',
    group:       'min_work_age',
    description: 'Дети старше 10 лет вовлечены в посильный труд. Мальчики пасут скот, девочки прядут и помогают на кухне.',
    effects: {
      labor_laws: { min_work_age: 10, child_labor_intensity: 0.60 },
    },
    satisfaction_effects: {
      clergy_class: -3,
    },
    incompatible_with: ['work_age_8', 'work_age_12', 'work_age_14', 'work_age_16'],
    is_default: false,
    historical_note: 'Греческие мальчики с 10 лет пасли скот; Ксенофонт в «Домострое» описывает воспитание сельского хозяина с детства через наблюдение и лёгкий труд.',
  },

  work_age_12: {
    id:          'work_age_12',
    name:        'Труд с 12 лет',
    icon:        '🧑',
    category:    'labor',
    group:       'min_work_age',
    description: 'Стандарт Античности: с 12 лет юноши начинают обучение ремеслу, земледелию и торговле. Разумный баланс труда и детства.',
    effects: {
      labor_laws: { min_work_age: 12, child_labor_intensity: 0.40 },
    },
    satisfaction_effects: {},
    incompatible_with: ['work_age_8', 'work_age_10', 'work_age_14', 'work_age_16'],
    is_default: true,
    historical_note: 'Аристотель в «Политике» считал 12–14 лет оптимальным возрастом начала практического обучения ремеслу; до этого — гимнасий и музыка.',
  },

  work_age_14: {
    id:          'work_age_14',
    name:        'Труд с 14 лет',
    icon:        '📖',
    category:    'labor',
    group:       'min_work_age',
    description: 'Дети освобождены от труда до 14 лет. Философская традиция: детство — время воспитания и учёбы. Сокращает рабочую силу.',
    effects: {
      labor_laws: { min_work_age: 14, child_labor_intensity: 0.15 },
    },
    satisfaction_effects: {
      clergy_class:   +5,
      citizens:       +3,
      farmers_class:  -3,  // земледельцы лишаются помощников
    },
    incompatible_with: ['work_age_8', 'work_age_10', 'work_age_12', 'work_age_16'],
    is_default: false,
    historical_note: 'Платон в «Законах» предписывал воздерживаться от производительного труда до 14 лет, посвящая время музыке, математике и воспитанию характера.',
  },

  work_age_16: {
    id:          'work_age_16',
    name:        'Запрет детского труда',
    icon:        '🚫',
    category:    'labor',
    group:       'min_work_age',
    description: 'До 16 лет дети полностью освобождены от труда. Утопический идеал, доступный лишь богатым городам. Серьёзно сокращает рабочую силу.',
    effects: {
      labor_laws: { min_work_age: 16, child_labor_intensity: 0.00 },
    },
    satisfaction_effects: {
      clergy_class:   +10,
      citizens:        +7,
      farmers_class:  -6,
      craftsmen_class: -3,
    },
    incompatible_with: ['work_age_8', 'work_age_10', 'work_age_12', 'work_age_14'],
    is_default: false,
    historical_note: 'Спартанские мальчики с 7 лет уходили в агоге — военную систему воспитания; физический труд там был запрещён, зато суровые испытания заменяли работу.',
  },

  // ══════════════════════════════════════════════════════
  // ИНТЕНСИВНОСТЬ ДЕТСКОГО ТРУДА (дополнительно к возрасту)
  // ══════════════════════════════════════════════════════

  child_labor_heavy: {
    id:          'child_labor_heavy',
    name:        'Полный детский труд',
    icon:        '⛏',
    category:    'labor',
    group:       'child_intensity',
    description: 'Дети работают в полную силу — поля, шахты, верфи. Максимальная рабочая сила. Высокая детская смертность.',
    effects: {
      labor_laws: { child_labor_intensity: 0.90, child_work_efficiency: 0.42 },
    },
    satisfaction_effects: {
      clergy_class:   -12,
      citizens:        -8,
      slaves_class:    -4,
    },
    incompatible_with: ['child_labor_light', 'child_labor_none'],
    is_default: false,
    historical_note: 'Дети рабов на сицилийских латифундиях работали в полях с ранних лет — Диодор Сицилийский описывает жуткие условия труда детей на сахарных и зерновых фермах.',
  },

  child_labor_light: {
    id:          'child_labor_light',
    name:        'Лёгкий детский труд',
    icon:        '🌾',
    category:    'labor',
    group:       'child_intensity',
    description: 'Дети помогают в поле и по дому, но избавлены от тяжёлых работ. Традиционная модель крестьянской семьи.',
    effects: {
      labor_laws: { child_labor_intensity: 0.40 },
    },
    satisfaction_effects: {},
    incompatible_with: ['child_labor_heavy', 'child_labor_none'],
    is_default: true,
    historical_note: 'Традиционная крестьянская семья Античности — дети пасли коз и помогали в огороде с 7–8 лет, но тяжёлые полевые работы начинались после подросткового возраста.',
  },

  child_labor_none: {
    id:          'child_labor_none',
    name:        'Запрет детского труда',
    icon:        '📚',
    category:    'labor',
    group:       'child_intensity',
    description: 'Дети полностью освобождены от труда — только учёба и воспитание. Идеал Платона. Значительно сокращает рабочую силу.',
    effects: {
      labor_laws: { child_labor_intensity: 0.00 },
    },
    satisfaction_effects: {
      clergy_class:   +15,
      citizens:        +10,
      farmers_class:   -8,
      craftsmen_class: -5,
    },
    incompatible_with: ['child_labor_heavy', 'child_labor_light'],
    is_default: false,
    historical_note: 'Платон в «Государстве» и Аристотель в «Политике» осуждали привлечение детей к ремёслам, считая это препятствием для полноценного воспитания свободного гражданина.',
  },

  // ══════════════════════════════════════════════════════
  // ПОРОГ СТАРОСТИ И ТРУД ПОЖИЛЫХ
  // ══════════════════════════════════════════════════════

  elder_45: {
    id:          'elder_45',
    name:        'Старость с 45 лет',
    icon:        '👴',
    category:    'labor',
    group:       'elder_threshold',
    description: 'После 45 лет человек считается стариком, но пожилые продолжают работать под давлением нужды. Жёсткий рынок труда выжимает максимум из каждого тела. Краткосрочный прирост рабочей силы оборачивается ростом смертности и недовольством.',
    effects: {
      labor_laws: { elder_threshold: 45, elder_work_intensity: 0.70 },
    },
    satisfaction_effects: {
      clergy_class:  -5,
      soldiers_class: -4,
      aristocrats:   -3,
    },
    requires: null,
    incompatible_with: ['elder_55', 'elder_60'],
    is_default: false,
    historical_note: 'Среднестатистическая продолжительность жизни в Античности составляла 35–40 лет; лишь немногие доживали до 60 в добром здравии.',
  },

  elder_55: {
    id:          'elder_55',
    name:        'Старость с 55 лет',
    icon:        '🧓',
    category:    'labor',
    group:       'elder_threshold',
    description: 'После 55 лет граждане отходят от тяжёлого труда, но многие продолжают советовать, торговать и обучать. Античный стандарт — баланс опыта и отдыха. Нейтральный вариант для большинства государств.',
    effects: {
      labor_laws: { elder_threshold: 55, elder_work_intensity: 0.50 },
    },
    satisfaction_effects: {},
    requires: null,
    incompatible_with: ['elder_45', 'elder_60'],
    is_default: true,
    historical_note: 'В Афинах мужчины старше 50 освобождались от воинской службы, но продолжали участвовать в народном собрании и управлении.',
  },

  elder_60: {
    id:          'elder_60',
    name:        'Уважение к старикам',
    icon:        '🏛',
    category:    'labor',
    group:       'elder_threshold',
    description: 'Государство признаёт граждан пожилыми с 60 лет и облегчает их труд. Уважение к старости повышает авторитет власти и поддержку духовенства. Рабочая сила сокращается, но лояльность растёт.',
    effects: {
      labor_laws: { elder_threshold: 60, elder_work_intensity: 0.30 },
    },
    satisfaction_effects: {
      clergy_class:  +5,
      citizens:      +3,
      farmers_class: +2,
    },
    requires: null,
    incompatible_with: ['elder_45', 'elder_55'],
    is_default: false,
    historical_note: 'В Спарте совет герусии (герон — старец) заседал с 60 лет; пожилые граждане освобождались от физического труда, сохраняя политический вес.',
  },

  // ══════════════════════════════════════════════════════
  // ЖЕНСКИЙ ТРУД
  // ══════════════════════════════════════════════════════

  women_domestic: {
    id:          'women_domestic',
    name:        'Женщины в доме',
    icon:        '🏠',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины занимаются исключительно домашним хозяйством: прядение, ткачество, дети. Минимальное участие в рыночной экономике.',
    effects: {
      labor_laws: { women_participation: 0.20 },
    },
    satisfaction_effects: {
      aristocrats:    +3,
      citizens:       -4,
      craftsmen_class: -2,
    },
    incompatible_with: ['women_crafts', 'women_market', 'women_full'],
    is_default: false,
    historical_note: 'Афинские женщины-гражданки жили за закрытыми дверями гинекея; Ксенофонт в «Домострое» описывает идеальную жену как управительницу дома, но не участницу рынка.',
  },

  women_crafts: {
    id:          'women_crafts',
    name:        'Женский труд в ремёслах',
    icon:        '🧵',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины работают в прядении, ткачестве, гончарстве и мелкой торговле. Исторический стандарт греческих полисов.',
    effects: {
      labor_laws: { women_participation: 0.40 },
    },
    satisfaction_effects: {},
    incompatible_with: ['women_domestic', 'women_market', 'women_full'],
    is_default: true,
    historical_note: 'Большинство греческих женщин занимались прядением и ткачеством дома или в небольших мастерских — ткань была второй по важности экспортной статьёй Афин после серебра.',
  },

  women_market: {
    id:          'women_market',
    name:        'Женская торговля',
    icon:        '🏪',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины допускаются к самостоятельной торговле, ведению мастерских и рыночным сделкам. Увеличивает рабочую силу и торговый оборот.',
    effects: {
      labor_laws: { women_participation: 0.60 },
    },
    satisfaction_effects: {
      craftsmen_class: +5,
      citizens:        +3,
      aristocrats:    -3,
      clergy_class:   -2,
    },
    incompatible_with: ['women_domestic', 'women_crafts', 'women_full'],
    is_default: false,
    historical_note: 'Женщины в Карфагене и эллинистических городах участвовали в рыночной торговле; коринфские торговки пурпуром упомянуты у Страбона как отдельная экономическая группа.',
  },

  women_full: {
    id:          'women_full',
    name:        'Равный труд',
    icon:        '⚖',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины участвуют во всех отраслях экономики наравне с мужчинами. Революционная политика — максимизирует рабочую силу.',
    effects: {
      labor_laws: { women_participation: 0.85 },
    },
    satisfaction_effects: {
      craftsmen_class:  +5,
      citizens:          +7,
      sailors_class:     +3,
      aristocrats:      -8,
      clergy_class:     -5,
    },
    incompatible_with: ['women_domestic', 'women_crafts', 'women_market'],
    is_default: false,
    historical_note: 'Птолемеевский Египет давал женщинам более широкие права в хозяйственной сфере, чем большинство государств Античности — они могли владеть землёй, заключать контракты и вести суды.',
  },

  // ══════════════════════════════════════════════════════
  // СТАТУС РАБСКОГО ТРУДА
  // ══════════════════════════════════════════════════════

  slavery_harsh: {
    id:          'slavery_harsh',
    name:        'Жёсткое рабовладение',
    icon:        '⛓',
    category:    'labor',
    group:       'slave_labor',
    description: 'Рабы работают с максимальной отдачей под угрозой наказания. Надсмотрщики применяют телесные наказания за малейший проступок. Эффективно краткосрочно, но подавляет любые поблажки и резко повышает риск восстания.',
    effects: {
      labor_laws: {
        slave_efficiency:       1.30,
        slave_freedom_chance:   0.00,
        slave_revolt_threshold: -20,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      slaves_class:  -15,
      clergy_class:   -8,
      citizens:       -5,
    },
    requires: null,
    incompatible_with: ['slavery_standard', 'slavery_moderate', 'slavery_manumission'],
    is_default: false,
    historical_note: 'На серебряных рудниках Лавриона в Афинах одновременно работало до 20 000 рабов в чудовищных условиях; рабские восстания там были нередки.',
  },

  slavery_standard: {
    id:          'slavery_standard',
    name:        'Стандартное рабство',
    icon:        '⚒',
    category:    'labor',
    group:       'slave_labor',
    description: 'Стандартное рабовладение Античности. Умеренное обращение — рабы работают предсказуемо, хозяин не заинтересован уничтожать дорогостоящее имущество. Небольшой шанс отпуска на волю сохраняет надежду и снижает бунтарство.',
    effects: {
      labor_laws: {
        slave_efficiency:       1.00,
        slave_freedom_chance:   0.01,
        slave_revolt_threshold: 0,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {},
    requires: null,
    incompatible_with: ['slavery_harsh', 'slavery_moderate', 'slavery_manumission'],
    is_default: true,
    historical_note: 'В классических Афинах раб-ремесленник (хорис ойкон) мог вести собственное дело, откладывая деньги на выкуп — практика, широко распространённая в V–IV вв. до н.э.',
  },

  slavery_moderate: {
    id:          'slavery_moderate',
    name:        'Мягкое рабство',
    icon:        '🫱',
    category:    'labor',
    group:       'slave_labor',
    description: 'Мягкое обращение с рабами — лучшее питание, право на семью, обещание вольной. Производительность ниже, но лояльность выше. Часть рабов постепенно превращается в вольноотпущенников, пополняя ряды ремесленников.',
    effects: {
      labor_laws: {
        slave_efficiency:       0.80,
        slave_freedom_chance:   0.03,
        slave_revolt_threshold: 10,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      slaves_class:  +8,
      freedmen:      +5,
      clergy_class:  +6,
      aristocrats:   -4,
    },
    requires: null,
    incompatible_with: ['slavery_harsh', 'slavery_standard', 'slavery_manumission'],
    is_default: false,
    historical_note: 'Стоик Хризипп (ок. 280–207 до н.э.) учил, что раб — это «наёмник на всю жизнь», которого следует кормить и одевать достойно; эта философия влияла на практику более гуманного обращения.',
  },

  slavery_manumission: {
    id:          'slavery_manumission',
    name:        'Массовое освобождение',
    icon:        '🕊',
    category:    'labor',
    group:       'slave_labor',
    description: 'Государство поощряет отпуск рабов на волю. Число рабов падает, число вольноотпущенников и ремесленников растёт. Аристократы теряют дешёвую рабочую силу, но средний класс укрепляется. Исторически — Рим после Пунических войн.',
    effects: {
      labor_laws: {
        slave_efficiency:       0.70,
        slave_freedom_chance:   0.08,
        slave_revolt_threshold: 20,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      slaves_class:     +15,
      freedmen:         +12,
      craftsmen_class:  +5,
      aristocrats:      -10,
      farmers_class:    -5,
    },
    requires: {
      government_type: ['republic', 'oligarchy'],
      min_stability:   50,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['slavery_harsh', 'slavery_standard', 'slavery_moderate'],
    is_default: false,
    historical_note: 'После Второй Пунической войны Рим отпустил тысячи рабов, служивших в армии, — это стало одной из причин быстрого роста класса либертов в Республике.',
  },

  // ══════════════════════════════════════════════════════
  // УСЛОВИЯ СВОБОДНОГО ТРУДА
  // ══════════════════════════════════════════════════════

  labor_unregulated: {
    id:          'labor_unregulated',
    name:        'Свободный рынок труда',
    icon:        '🤝',
    category:    'labor',
    group:       'free_labor',
    description: 'Рынок труда полностью свободен — работодатель платит сколько хочет, работник идёт куда хочет. Максимальная гибкость найма, минимальная защита трудящихся. Аристократы процветают, ремесленники лишены рычагов влияния.',
    effects: {
      labor_laws: {
        wage_floor:          0.0,
        free_labor_mobility: 1.0,
        guild_strength:      0.0,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      aristocrats:     +5,
      craftsmen_class: -5,
      farmers_class:   -3,
    },
    requires: null,
    incompatible_with: ['labor_guild_rights', 'labor_client_system', 'labor_debt_bondage'],
    is_default: true,
    historical_note: 'В эллинистических полисах свободные ремесленники (банавсои) нанимались поденно без каких-либо государственных гарантий; их правовая защита зависела только от доброй воли нанимателя.',
  },

  labor_guild_rights: {
    id:          'labor_guild_rights',
    name:        'Права ремесленных коллегий',
    icon:        '⚙',
    category:    'labor',
    group:       'free_labor',
    description: 'Ремесленные коллегии получают право устанавливать минимальные ставки и контролировать доступ к профессии. Повышает цену труда и качество продукции. Исторически — коллегии Рима и греческие тиасы.',
    effects: {
      labor_laws: {
        wage_floor:          0.3,
        free_labor_mobility: 0.7,
        guild_strength:      0.5,
      },
      production_bonus: {
        forge:             0.10,
        pottery_workshop:  0.10,
        textile_mill:      0.08,
      },
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      craftsmen_class: +10,
      sailors_class:   +6,
      aristocrats:     -6,
      officials:       -3,
    },
    requires: {
      government_type: ['republic', 'oligarchy', 'tyranny'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['labor_unregulated', 'labor_client_system', 'labor_debt_bondage'],
    is_default: false,
    historical_note: 'Римские коллегии ремесленников (коллегиа опификум) насчитывали десятки видов — от булочников до флейтистов; Нума Помпилий, по преданию, учредил первые восемь коллегий.',
  },

  labor_client_system: {
    id:          'labor_client_system',
    name:        'Патрон-клиентские отношения',
    icon:        '🏛',
    category:    'labor',
    group:       'free_labor',
    description: 'Свободные работники прикреплены к покровителю (патрону), который обеспечивает защиту и доход в обмен на верность и услуги. Стабильность обеспечена, мобильность падает. Классическая система Рима, смягчающая социальное расслоение.',
    effects: {
      labor_laws: {
        wage_floor:          0.2,
        free_labor_mobility: 0.5,
        guild_strength:      0.2,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      citizens:        +5,
      freedmen:        +8,
      craftsmen_class: +3,
      farmers_class:   +3,
    },
    requires: null,
    incompatible_with: ['labor_unregulated', 'labor_guild_rights', 'labor_debt_bondage'],
    is_default: false,
    historical_note: 'Римская клиентела была основой социальной структуры Республики: клиент получал юридическую защиту и хлеб, патрон — голоса на выборах и преданных сторонников.',
  },

  labor_debt_bondage: {
    id:          'labor_debt_bondage',
    name:        'Долговое рабство',
    icon:        '📜',
    category:    'labor',
    group:       'free_labor',
    description: 'Должники теряют личную свободу до полной выплаты долга, работая на кредитора. Политически взрывоопасный инструмент, выгодный аристократии. Братья Гракхи погибли именно за попытку отменить практику, близкую к долговому рабству.',
    effects: {
      labor_laws: {
        wage_floor:          0.0,
        free_labor_mobility: 0.2,
        guild_strength:      0.0,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      aristocrats:     +8,
      officials:       +3,
      citizens:        -12,
      farmers_class:   -15,
      craftsmen_class: -8,
    },
    requires: {
      government_type: ['tyranny', 'oligarchy', 'monarchy'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['labor_unregulated', 'labor_guild_rights', 'labor_client_system'],
    is_default: false,
    historical_note: 'В Афинах закон Солона (594 до н.э.) отменил долговое рабство граждан и освободил уже порабощённых должников — это стало одной из величайших реформ греческого мира.',
  },

  // ══════════════════════════════════════════════════════
  // ВОИНСКАЯ ОБЯЗАННОСТЬ
  // ══════════════════════════════════════════════════════

  service_voluntary: {
    id:          'service_voluntary',
    name:        'Добровольная служба',
    icon:        '🤚',
    category:    'labor',
    group:       'military_service',
    description: 'Армия полностью добровольная: профессиональные солдаты и наёмники по контракту. Производство не страдает от призыва, но содержание армии обходится дорого. Наёмники требуют постоянной оплаты, иначе уходят или мятежатся.',
    effects: {
      labor_laws: {
        conscription_rate:    0.03,
        military_exemptions:  1.0,
        veterans_rights:      0.0,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      soldiers_class:  +5,
      farmers_class:   +5,
      craftsmen_class: +3,
    },
    requires: null,
    incompatible_with: ['service_citizens_only', 'service_universal', 'service_mercenary_only'],
    is_default: true,
    historical_note: 'Греческие тираны — от Дионисия Сиракузского до Агафокла — строили власть на наёмных армиях, свободных от гражданских обязательств и целиком зависевших от жалованья.',
  },

  service_citizens_only: {
    id:          'service_citizens_only',
    name:        'Гражданское ополчение',
    icon:        '🛡',
    category:    'labor',
    group:       'military_service',
    description: 'Только свободные граждане несут воинскую службу — классическая модель греческих гоплитов. Рабы, вольноотпущенники и женщины освобождены. Ветераны получают земельные наделы. Армия дешевле наёмной, но изымает граждан из производства.',
    effects: {
      labor_laws: {
        conscription_rate:   0.08,
        military_exemptions: 0.5,
        veterans_rights:     0.5,
      },
      production_bonus: {
        barracks: 0.15,
      },
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      citizens:        +6,
      soldiers_class:  +8,
      farmers_class:   -4,
      craftsmen_class: -4,
    },
    requires: null,
    incompatible_with: ['service_voluntary', 'service_universal', 'service_mercenary_only'],
    is_default: false,
    historical_note: 'Греческое гражданское ополчение — фаланга гоплитов — было основой полисной обороны в V–IV вв. до н.э.; воин сам приобретал своё дорогостоящее снаряжение.',
  },

  service_universal: {
    id:          'service_universal',
    name:        'Всеобщая воинская обязанность',
    icon:        '⚔️',
    category:    'labor',
    group:       'military_service',
    description: 'Все свободные мужчины призываются на службу. Крупнейшая армия из возможных, но производство серьёзно страдает от призыва. Духовенство освобождено — священные ритуалы не прерываются. Реформа Мария в своём крайнем варианте.',
    effects: {
      labor_laws: {
        conscription_rate:   0.15,
        military_exemptions: 0.1,
        veterans_rights:     0.8,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      soldiers_class:  +12,
      farmers_class:   -8,
      craftsmen_class: -8,
      citizens:        -5,
      aristocrats:     -3,
    },
    requires: {
      government_type: ['republic', 'tyranny', 'empire'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['service_voluntary', 'service_citizens_only', 'service_mercenary_only'],
    is_default: false,
    historical_note: 'Реформа Гая Мария (107 до н.э.) открыла армию для пролетариев и ввела профессиональное обучение, превратив Рим из гражданского ополчения в постоянную армию.',
  },

  service_mercenary_only: {
    id:          'service_mercenary_only',
    name:        'Только наёмники',
    icon:        '💰',
    category:    'labor',
    group:       'military_service',
    description: 'Государство полностью отказывается от призыва — армия состоит исключительно из наёмников. Производство не страдает совсем, граждане довольны. Агафокл держал 10 000 наёмников, финансируя их грабежом Карфагена. Дорого и ненадёжно.',
    effects: {
      labor_laws: {
        conscription_rate:   0.00,
        military_exemptions: 1.0,
        veterans_rights:     0.0,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      farmers_class:   +8,
      craftsmen_class: +6,
      citizens:        +5,
      soldiers_class:  -10,
    },
    requires: {
      government_type: null,
      min_stability:   null,
      min_treasury:    5000,
      has_law:         null,
    },
    incompatible_with: ['service_voluntary', 'service_citizens_only', 'service_universal'],
    is_default: false,
    historical_note: 'Карфаген строил свою военную мощь почти исключительно на наёмниках — нумидийская конница, иберийская пехота, балеарские пращники; сами карфагеняне воевали крайне редко.',
  },

  // ══════════════════════════════════════════════════════
  // ЗЕМЕЛЬНЫЕ ОБЯЗАТЕЛЬСТВА
  // ══════════════════════════════════════════════════════

  farming_free_market: {
    id:          'farming_free_market',
    name:        'Свободное землепользование',
    icon:        '🌱',
    category:    'labor',
    group:       'agricultural_obligation',
    description: 'Землевладелец сам решает, что сажать: пшеницу, виноград или оливки. Рынок регулирует специализацию, максимизируя прибыль при стабильных ценах. Оптимальный вариант при богатой казне и налаженных торговых путях.',
    effects: {
      labor_laws: {
        land_tax_rate:     0.10,
        forced_cultivation: false,
        fallow_requirement: false,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      farmers_class: +5,
      aristocrats:   +5,
    },
    requires: null,
    incompatible_with: ['farming_grain_mandate', 'farming_three_field', 'farming_latifundia_banned'],
    is_default: true,
    historical_note: 'Сицилийские латифундисты в IV–III вв. до н.э. специализировались на экспортном зерне, пользуясь свободой выбора культур и близостью карфагенских и греческих рынков.',
  },

  farming_grain_mandate: {
    id:          'farming_grain_mandate',
    name:        'Зерновая повинность',
    icon:        '🌾',
    category:    'labor',
    group:       'agricultural_obligation',
    description: 'Государство обязывает засевать минимум 60% пашни пшеницей и ячменём. Гарантирует продовольственную безопасность и снабжение армии. Запрещает уход в виноград и оливки — ограничивает экспортный доход, но защищает от голода.',
    effects: {
      labor_laws: {
        land_tax_rate:      0.12,
        forced_cultivation:  true,
        fallow_requirement:  false,
      },
      production_bonus: {
        wheat_family_farm:  0.10,
        wheat_villa:        0.10,
        wheat_latifundium:  0.10,
      },
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      farmers_class:  -5,
      aristocrats:    -8,
      soldiers_class: +5,
      slaves_class:   +2,
    },
    requires: null,
    incompatible_with: ['farming_free_market', 'farming_three_field', 'farming_latifundia_banned'],
    is_default: false,
    historical_note: 'Птолемеевский Египет государственно регулировал посевные площади под зерно — крестьяне получали семенной фонд от государства и сдавали часть урожая в казну.',
  },

  farming_three_field: {
    id:          'farming_three_field',
    name:        'Трёхпольный оборот',
    icon:        '🔄',
    category:    'labor',
    group:       'agricultural_obligation',
    description: 'Обязательный трёхпольный севооборот — треть земли ежегодно отдыхает под паром. Восстанавливает почву и предотвращает долгосрочное истощение. Краткосрочно снижает урожай, долгосрочно защищает от деградации земель.',
    effects: {
      labor_laws: {
        land_tax_rate:      0.10,
        forced_cultivation:  true,
        fallow_requirement:  true,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      +0.5,
    },
    satisfaction_effects: {
      farmers_class: +3,
      clergy_class:  +4,
      aristocrats:   -5,
    },
    requires: null,
    incompatible_with: ['farming_free_market', 'farming_grain_mandate', 'farming_latifundia_banned'],
    is_default: false,
    historical_note: 'Катон Старший в трактате «О земледелии» (II в. до н.э.) описывает ротацию культур для поддержания плодородия; греческие агрономы Теофраст и Ксенофонт упоминали пар как необходимый элемент хозяйства.',
  },

  farming_latifundia_banned: {
    id:          'farming_latifundia_banned',
    name:        'Запрет латифундий',
    icon:        '⚖',
    category:    'labor',
    group:       'agricultural_obligation',
    description: 'Максимальный размер землевладения ограничен законом. Крупные поместья разбиваются, создаётся класс средних землевладельцев. Закон Лициния 367 до н.э. пытался ограничить пользование ager publicus. Политически невозможно при аристократии.',
    effects: {
      labor_laws: {
        land_tax_rate:      0.14,
        forced_cultivation:  false,
        fallow_requirement:  false,
      },
      production_bonus: {
        wheat_family_farm:  0.20,
        wheat_villa:        0.10,
      },
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      farmers_class: +15,
      citizens:      +8,
      aristocrats:   -20,
      officials:     -5,
    },
    requires: {
      government_type: ['republic', 'tyranny'],
      min_stability:   60,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['farming_free_market', 'farming_grain_mandate', 'farming_three_field'],
    is_default: false,
    historical_note: 'Тиберий Гракх (133 до н.э.) предложил возобновить Лициниевы законы об ограничении земли — за это был убит разъярёнными сенаторами прямо в народном собрании.',
  },

  // ══════════════════════════════════════════════════════
  // МОРСКОЙ ТРУД
  // ══════════════════════════════════════════════════════

  maritime_free: {
    id:          'maritime_free',
    name:        'Свободное мореходство',
    icon:        '⚓',
    category:    'labor',
    group:       'maritime_labor',
    description: 'Море открыто для всех — рыбаки и торговцы ходят свободно без лицензий и пошлин. Государство не вмешивается в морской промысел. Стандарт греческих полисов; максимальная активность частного флота.',
    effects: {
      labor_laws: {
        navy_conscription: 0.02,
        fishing_rights:    true,
        port_tax_rate:     0.05,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      sailors_class: +6,
    },
    requires: null,
    incompatible_with: ['maritime_state_control', 'maritime_piracy_sanctioned'],
    is_default: true,
    historical_note: 'Афинский Пирей в V–IV вв. до н.э. был крупнейшим свободным портом Средиземноморья — любой корабль мог войти, торговать и выйти без особых разрешений.',
  },

  maritime_state_control: {
    id:          'maritime_state_control',
    name:        'Государственный контроль портов',
    icon:        '🏛',
    category:    'labor',
    group:       'maritime_labor',
    description: 'Государство монополизирует морскую торговлю и рыболовство: лицензии, портовые инспекторы, закрытые торговые пути для чужаков. Карфагенская модель. Повышает налоговые поступления, но душит частную инициативу моряков и купцов.',
    effects: {
      labor_laws: {
        navy_conscription: 0.10,
        fishing_rights:    false,
        port_tax_rate:     0.12,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: +0.08,
      stability_mod:      null,
    },
    satisfaction_effects: {
      sailors_class: -8,
      officials:     +5,
    },
    requires: {
      government_type: ['tyranny', 'oligarchy', 'empire'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['maritime_free', 'maritime_piracy_sanctioned'],
    is_default: false,
    historical_note: 'Карфаген закрывал Гибралтарский пролив для чужих кораблей и топил нарушителей: Юстин сообщает, что карфагеняне отправляли в море специальные патрули.',
  },

  maritime_piracy_sanctioned: {
    id:          'maritime_piracy_sanctioned',
    name:        'Попустительство пиратству',
    icon:        '🏴‍☠️',
    category:    'labor',
    group:       'maritime_labor',
    description: 'Государство негласно поощряет пиратство против чужих торговцев или закрывает глаза на флибустьерские операции. Флот получает безнаказанность — ослабляет экономику врагов. Репутация государства падает, стабильность страдает.',
    effects: {
      labor_laws: {
        navy_conscription: 0.05,
        fishing_rights:    true,
        port_tax_rate:     0.03,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      -1,
    },
    satisfaction_effects: {
      sailors_class: +10,
      clergy_class:  -8,
      citizens:      -5,
    },
    requires: {
      government_type: ['tyranny'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['maritime_free', 'maritime_state_control'],
    is_default: false,
    historical_note: 'Иллирийская царица Тевта (ок. 230 до н.э.) официально санкционировала пиратство против греческих и итальянских купцов — это вызвало первую Иллирийскую войну с Римом.',
  },

  // ══════════════════════════════════════════════════════
  // РЕГУЛИРОВАНИЕ РЕМЁСЕЛ
  // ══════════════════════════════════════════════════════

  crafts_unregulated: {
    id:          'crafts_unregulated',
    name:        'Нерегулируемые ремёсла',
    icon:        '🔨',
    category:    'labor',
    group:       'craft_regulation',
    description: 'Ремесленник сам определяет стандарты, цены и учеников. Быстрый вход в профессию, конкуренция без правил. Низкий барьер входа максимизирует количество ремесленников, но качество продукции непостоянно.',
    effects: {
      labor_laws: {
        apprentice_years:  0,
        quality_standards: false,
        export_license:    false,
      },
      production_bonus:   {},
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      craftsmen_class: +3,
    },
    requires: null,
    incompatible_with: ['crafts_guild_system', 'crafts_state_workshops'],
    is_default: true,
    historical_note: 'В большинстве греческих полисов ремёсла были нерегулируемы — любой свободный человек мог открыть мастерскую, платить налог с оборота и работать без государственного надзора.',
  },

  crafts_guild_system: {
    id:          'crafts_guild_system',
    name:        'Система гильдий',
    icon:        '🏅',
    category:    'labor',
    group:       'craft_regulation',
    description: 'Обязательное ученичество три года перед самостоятельной работой. Гильдия контролирует качество и выдаёт экспортные лицензии. Вход в профессию медленнее, но продукция лучше и дороже на внешних рынках.',
    effects: {
      labor_laws: {
        apprentice_years:  3,
        quality_standards: true,
        export_license:    true,
      },
      production_bonus: {
        forge:             0.15,
        bronze_foundry:    0.12,
        textile_mill:      0.12,
        pottery_workshop:  0.10,
      },
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      craftsmen_class: +12,
      citizens:        +4,
      slaves_class:    -5,
      farmers_class:   -2,
    },
    requires: {
      government_type: ['republic', 'oligarchy'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['crafts_unregulated', 'crafts_state_workshops'],
    is_default: false,
    historical_note: 'Коринф в VII–V вв. до н.э. прославился высококачественной бронзовой посудой и керамикой, экспортируемой по всему Средиземноморью — без конкуренции благодаря высоким стандартам.',
  },

  crafts_state_workshops: {
    id:          'crafts_state_workshops',
    name:        'Государственные мастерские',
    icon:        '🏭',
    category:    'labor',
    group:       'craft_regulation',
    description: 'Государственные мастерские заменяют частных ремесленников: военное производство централизовано, оружие и доспехи изготавливаются только для казны. Эффективно для армии, но уничтожает частное ремесло и лишает мастеров дохода.',
    effects: {
      labor_laws: {
        apprentice_years:  0,
        quality_standards: true,
        export_license:    false,
      },
      production_bonus: {
        forge:    0.25,
        barracks: 0.10,
      },
      class_wealth_mod:   {},
      tax_efficiency_mod: null,
      stability_mod:      null,
    },
    satisfaction_effects: {
      craftsmen_class: -15,
      officials:       +8,
      soldiers_class:  +10,
      aristocrats:     +3,
    },
    requires: {
      government_type: ['tyranny', 'empire'],
      min_stability:   null,
      min_treasury:    null,
      has_law:         null,
    },
    incompatible_with: ['crafts_unregulated', 'crafts_guild_system'],
    is_default: false,
    historical_note: 'Птолемеевский Египет создал государственные текстильные мастерские (эргастерии), обеспечивавшие армию и флот; частное производство тканей было строго ограничено.',
  },
};

// ══════════════════════════════════════════════════════════════
// ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ — стандартная практика греческого полиса ~300 г. до н.э.
// ══════════════════════════════════════════════════════════════

const DEFAULT_LABOR_LAWS = {
  // ── Существующие поля ──
  min_work_age:           12,
  child_labor_intensity:  0.40,
  elder_threshold:        55,
  elder_work_intensity:   0.50,
  women_participation:    0.40,
  child_work_efficiency:  0.38,
  elder_work_efficiency:  0.55,
  // ── Рабский труд ──
  slave_efficiency:        1.00,
  slave_freedom_chance:    0.01,
  slave_revolt_threshold:  0,
  // ── Свободный труд ──
  wage_floor:              0.0,
  free_labor_mobility:     1.0,
  guild_strength:          0.0,
  // ── Воинская обязанность ──
  conscription_rate:       0.03,
  military_exemptions:     1.0,
  veterans_rights:         0.0,
  // ── Земельные обязательства ──
  land_tax_rate:           0.10,
  forced_cultivation:      false,
  fallow_requirement:      false,
  // ── Морской труд ──
  navy_conscription:       0.02,
  fishing_rights:          true,
  port_tax_rate:           0.05,
  // ── Регулирование ремёсел ──
  apprentice_years:        0,
  quality_standards:       false,
  export_license:          false,
};

// Порядок отображения групп законов в UI
const LABOR_LAW_GROUPS = [
  { id: 'min_work_age',             name: 'Минимальный возраст труда',    icon: '👶' },
  { id: 'child_intensity',          name: 'Интенсивность детского труда', icon: '⚒' },
  { id: 'elder_threshold',          name: 'Порог старости',               icon: '👴' },
  { id: 'women_labor',              name: 'Участие женщин в экономике',   icon: '⚖' },
  { id: 'slave_labor',              name: 'Статус рабского труда',        icon: '⛓' },
  { id: 'free_labor',               name: 'Условия свободного труда',     icon: '🤝' },
  { id: 'military_service',         name: 'Воинская обязанность',         icon: '⚔️' },
  { id: 'agricultural_obligation',  name: 'Земельные обязательства',      icon: '🌾' },
  { id: 'maritime_labor',           name: 'Морской труд',                 icon: '⚓' },
  { id: 'craft_regulation',         name: 'Регулирование ремёсел',        icon: '🔨' },
];

// ══════════════════════════════════════════════════════════════
// API: применить / отменить трудовой закон
// ══════════════════════════════════════════════════════════════

function applyLaborLaw(nation, lawId) {
  const law = LAWS_LABOR[lawId];
  if (!law) return { ok: false, reason: 'Закон не найден' };

  // Проверяем несовместимость с уже активными законами
  const activeLawIds = (nation.active_laws || []).map(l => l.id);
  for (const incompId of (law.incompatible_with || [])) {
    if (activeLawIds.includes(incompId)) {
      const incompName = LAWS_LABOR[incompId]?.name || incompId;
      return { ok: false, reason: `Несовместим с активным законом: «${incompName}»` };
    }
  }

  // Инициализируем labor_laws если отсутствует
  if (!nation.labor_laws) nation.labor_laws = { ...DEFAULT_LABOR_LAWS };

  // Применяем изменения к labor_laws
  if (law.effects?.labor_laws) {
    Object.assign(nation.labor_laws, law.effects.labor_laws);
  }

  // Удаляем конкурирующие законы той же группы
  nation.active_laws = (nation.active_laws || []).filter(l =>
    !(law.incompatible_with || []).includes(l.id)
  );

  // Регистрируем закон как активный
  nation.active_laws.push({
    id:           law.id,
    name:         law.name,
    type:         'labor',
    category:     'labor',
    _labor_law:   true,
    _group:       law.group,
  });

  return { ok: true };
}

function repealLaborLaw(nation, lawId) {
  const law = LAWS_LABOR[lawId];
  if (!law) return;

  nation.active_laws = (nation.active_laws || []).filter(l => l.id !== lawId);

  // Восстанавливаем дефолт той же группы
  const defaultLaw = Object.values(LAWS_LABOR).find(l =>
    l.is_default && l.group === law.group && l.id !== lawId
  );
  if (defaultLaw) {
    applyLaborLaw(nation, defaultLaw.id);
  } else if (nation.labor_laws) {
    // Fallback: восстанавливаем DEFAULT_LABOR_LAWS для затронутых полей
    if (law.effects?.labor_laws) {
      for (const key of Object.keys(law.effects.labor_laws)) {
        nation.labor_laws[key] = DEFAULT_LABOR_LAWS[key];
      }
    }
  }
}

// Инициализация трудовых законов — применяет все is_default законы
function initLaborLaws(nation) {
  if (!nation.labor_laws) {
    nation.labor_laws = { ...DEFAULT_LABOR_LAWS };
  }

  const existingGroups = new Set(
    (nation.active_laws || [])
      .filter(l => l._labor_law)
      .map(l => LAWS_LABOR[l.id]?.group)
      .filter(Boolean)
  );

  // Применяем дефолты для групп, которых ещё нет
  for (const law of Object.values(LAWS_LABOR)) {
    if (!law.is_default) continue;
    if (existingGroups.has(law.group)) continue;
    nation.active_laws = nation.active_laws || [];
    if (!nation.active_laws.some(l => l.id === law.id)) {
      nation.active_laws.push({
        id:           law.id,
        name:         law.name,
        type:         'labor',
        category:     'labor',
        _labor_law:   true,
        _group:       law.group,
      });
      if (law.effects?.labor_laws) {
        Object.assign(nation.labor_laws, law.effects.labor_laws);
      }
    }
  }
}
