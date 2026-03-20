// Конфигурация игры — API ключ и константы баланса
const CONFIG = {
  // Установите свой ключ API Anthropic здесь или через UI
  API_KEY: '',
  API_URL: 'https://api.anthropic.com/v1/messages',

  // Haiku 4.5 — быстрые задачи: парсинг команд, реакции персонажей, генерация
  MODEL_HAIKU: 'claude-haiku-4-5-20251001',

  // Sonnet 4.6 — сложные задачи: дипломатия, решения AI-наций, управление государством
  MODEL_SONNET: 'claude-sonnet-4-6',

  BALANCE: {
    // Потребление населения за ход
    FOOD_PER_PERSON: 0.3,          // бушелей зерна
    SALT_PER_PERSON: 0.01,
    CLOTH_PER_PERSON: 0.05,
    TOOLS_PER_CRAFTSMAN: 0.1,

    // Население
    BASE_GROWTH_RATE: 0.002,       // +0.2% в ход при сытости
    FAMINE_MORTALITY: 0.008,       // смертность при голоде

    // Экономика
    PRICE_SMOOTHING: 0.3,          // сглаживание цен за ход
    SOLDIER_SALARY: 2,             // монет в ход за солдата
    BUILDING_MAINTENANCE: 50,      // монет в ход за здание
    SLAVE_UPKEEP: 1,               // монет в ход за раба

    // Амортизация капитальных ресурсов ферм (доля списания в тик = 1 мес)
    TOOLS_MONTHLY_WEAR:   0.021,   // инструменты: срок ~4 года (48 тиков)
    HORSE_MONTHLY_WEAR:   0.0083,  // лошади: рабочий срок ~10 лет (120 тиков)
    CATTLE_MONTHLY_WEAR:  0.0070,  // волы: рабочий срок ~12 лет (144 тика)

    // Бонус лошадей к производительности относительно волов
    HORSE_EFFICIENCY_MULT: 1.2,    // лошади быстрее → +20% к production_ratio

    // Армия
    INFANTRY_UPKEEP: 2,            // монет в ход
    CAVALRY_UPKEEP: 5,
    SHIP_UPKEEP: 10,
    MERCENARY_UPKEEP: 4,

    // Налоги
    BASE_TAX_RATE: 0.12,           // 12% от стоимости производства

    // Счастье
    BASE_HAPPINESS: 50,
    HAPPINESS_FROM_FOOD: 10,       // при избытке еды
    HAPPINESS_FROM_FAMINE: -25,    // при голоде
    HAPPINESS_FROM_WAR: -15,

    // Торговля
    PIRACY_BASE: 0.05,             // базовый риск пиратства
    BASE_TARIFF: 0.08,             // базовая пошлина

    // Профессии — эффективность по типу местности
    TERRAIN_MULTIPLIERS: {
      coastal_city:  { farmers: 0.5, craftsmen: 1.5, merchants: 2.0, sailors: 2.5 },
      plains:        { farmers: 1.5, craftsmen: 0.8, merchants: 0.7, sailors: 0.1 },
      hills:         { farmers: 0.8, craftsmen: 1.2, merchants: 0.6, sailors: 0.0 },
      mountains:     { farmers: 0.5, craftsmen: 1.0, merchants: 0.4, sailors: 0.0 },
      river_valley:  { farmers: 1.8, craftsmen: 1.0, merchants: 1.2, sailors: 0.5 },
    },
  },

  // Отображение
  TURNS_PER_YEAR: 12,
  START_YEAR: -301,
  START_MONTH: 1,

  // Сохранение
  SAVE_KEY: 'ancient_strategy_save',

  // Шанс случайного события за ход
  RANDOM_EVENT_CHANCE: 0.10,

  // ─────────────────────────────────────
  // КАРТА — тайловый сервер
  // ─────────────────────────────────────
  // CAWM (Consortium of Ancient World Mappers, ун-т Айовы)
  // Преемник AWMC. Лицензия: CC BY 4.0
  // Сайт: https://cawm.lib.uiowa.edu
  MAP_TILE_URL: 'https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png',
  MAP_TILE_ATTRIBUTION: '© <a href="https://cawm.lib.uiowa.edu/">CAWM</a> CC BY 4.0',
};
