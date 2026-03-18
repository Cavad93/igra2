// Определения зданий — демографические и экономические эффекты
// buildings строятся на уровне нации (nation.buildings[])

const BUILDINGS = {

  // ── ИНФРАСТРУКТУРА ──────────────────────────────────────────

  port: {
    name: 'Порт',
    icon: '⚓',
    description: 'Торговый порт. Привлекает моряков и торговцев.',
    cost: 800,
    category: 'infrastructure',
    // Дополнительный прирост конкретных профессий (+%/ход)
    profession_growth: { sailors: 0.018, merchants: 0.010 },
    // Ёмкость (добавляет к максимальному населению)
    capacity_bonus: 3000,
  },

  shipyard: {
    name: 'Верфь',
    icon: '🚢',
    description: 'Верфь для строительства кораблей. Нужны ремесленники и моряки.',
    cost: 1200,
    category: 'infrastructure',
    profession_growth: { sailors: 0.025, craftsmen: 0.010 },
    capacity_bonus: 2000,
  },

  market: {
    name: 'Рынок',
    icon: '🏪',
    description: 'Городской рынок. Стимулирует торговлю и ремёсла.',
    cost: 600,
    category: 'infrastructure',
    profession_growth: { merchants: 0.015, craftsmen: 0.008 },
    // Улучшает удовлетворение нужд (снижает порог потребления)
    needs_satisfaction_bonus: 0.05,
    capacity_bonus: 1500,
  },

  road: {
    name: 'Дорожная сеть',
    icon: '🛤',
    description: 'Мощёные дороги. Ускоряет торговлю, снижает смертность.',
    cost: 1000,
    category: 'infrastructure',
    // Снижает смертность от голода
    famine_mortality_mod: -0.002,
    // Ускоряет переток между профессиями (социальную мобильность)
    mobility_speed_mod: 1.4,
    needs_satisfaction_bonus: 0.03,
  },

  // ── ВОЕННЫЕ ─────────────────────────────────────────────────

  barracks: {
    name: 'Казармы',
    icon: '⚔️',
    description: 'Военные казармы. Увеличивают число солдат.',
    cost: 700,
    category: 'military',
    profession_growth: { soldiers: 0.020 },
    // Социальная мобильность: земледельцы → солдаты
    mobility: [{ from: 'farmers', to: 'soldiers', rate: 0.006 }],
  },

  walls: {
    name: 'Крепостные стены',
    icon: '🧱',
    description: 'Укрепления. Снижают потери населения на войне.',
    cost: 1500,
    category: 'military',
    // Уменьшают военную смертность
    war_mortality_mod: -0.35,
    // Защита от набегов снижает страх → небольшой рост счастья
    all_growth_mod: 0.001,
  },

  // ── АГРАРНЫЕ ────────────────────────────────────────────────

  granary: {
    name: 'Зернохранилище',
    icon: '🌾',
    description: 'Запас зерна. Защищает от голода в неурожайные годы.',
    cost: 500,
    category: 'agriculture',
    // Снижает смертность от голода
    famine_mortality_mod: -0.004,
    // Буфер: если нет еды, зернохранилище покрывает 30% дефицита
    famine_protection: 0.30,
  },

  latifundium: {
    name: 'Латифундия',
    icon: '🌿',
    description: 'Крупные поместья. Много рабов, зерна, но беднеют свободные крестьяне.',
    cost: 900,
    category: 'agriculture',
    profession_growth: { farmers: 0.008, slaves: 0.022 },
    // Долговое рабство: свободные крестьяне → рабы
    mobility: [{ from: 'farmers', to: 'slaves', rate: 0.003 }],
    needs_satisfaction_bonus: 0.04,
  },

  irrigation: {
    name: 'Ирригационные каналы',
    icon: '💧',
    description: 'Каналы орошения. Повышают урожай и рождаемость.',
    cost: 1100,
    category: 'agriculture',
    profession_growth: { farmers: 0.015 },
    // Повышает общий прирост населения
    all_growth_mod: 0.002,
    capacity_bonus: 4000,
    famine_mortality_mod: -0.002,
  },

  // ── КУЛЬТУРНЫЕ ──────────────────────────────────────────────

  temple: {
    name: 'Храм',
    icon: '🏛',
    description: 'Религиозный центр. Жрецы, медицина, счастье.',
    cost: 800,
    category: 'culture',
    profession_growth: { clergy: 0.025 },
    // Снижает общую смертность (медицина при храмах)
    mortality_mod: -0.003,
    // Небольшой общий прирост от счастья
    all_growth_mod: 0.001,
  },

  aqueduct: {
    name: 'Акведук',
    icon: '🏗',
    description: 'Водопровод. Снижает смертность от болезней.',
    cost: 2000,
    category: 'culture',
    mortality_mod: -0.006,
    all_growth_mod: 0.003,
    capacity_bonus: 5000,
    // Снижает вероятность эпидемий
    epidemic_chance_mod: -0.4,
  },

  school: {
    name: 'Школа/Гимнасий',
    icon: '📚',
    description: 'Образование. Ремесленники становятся торговцами.',
    cost: 700,
    category: 'culture',
    profession_growth: { merchants: 0.008, clergy: 0.006 },
    mobility: [{ from: 'craftsmen', to: 'merchants', rate: 0.004 }],
  },

  forum: {
    name: 'Форум/Агора',
    icon: '🏟',
    description: 'Общественная площадь. Центр торговли и политики.',
    cost: 600,
    category: 'culture',
    profession_growth: { merchants: 0.007 },
    all_growth_mod: 0.001,
    needs_satisfaction_bonus: 0.03,
    capacity_bonus: 1000,
  },

  // ── ПРОИЗВОДСТВЕННЫЕ ───────────────────────────────────────

  workshop: {
    name: 'Мастерские',
    icon: '🔨',
    description: 'Ремесленные мастерские. Привлекают ремесленников из деревни.',
    cost: 650,
    category: 'production',
    profession_growth: { craftsmen: 0.018 },
    mobility: [{ from: 'farmers', to: 'craftsmen', rate: 0.005 }],
    capacity_bonus: 1500,
  },

  mine: {
    name: 'Рудники',
    icon: '⛏',
    description: 'Добыча металлов. Много рабского труда.',
    cost: 850,
    category: 'production',
    profession_growth: { craftsmen: 0.008, slaves: 0.015 },
    // Высокая смертность рабов в рудниках
    slave_mortality_mod: 0.008,
  },

};

// Максимальное население по типу местности
// (базовая ёмкость региона без построек)
const TERRAIN_BASE_CAPACITY = {
  coastal_city:  8000,
  plains:        6000,
  hills:         4000,
  mountains:     2800,
  river_valley: 11000,
  ocean:            0,
  default:       4000,
};
