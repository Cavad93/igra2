// Конфигурация игры — API ключ и константы баланса
const CONFIG = {
  // ── Anthropic (Claude Sonnet — только диалоги с игроком) ────────────
  API_KEY: '',
  API_URL: 'https://api.anthropic.com/v1/messages',

  // ── Groq (Llama 3.3 70B — все фоновые AI-задачи вместо Haiku) ───────
  // Получить бесплатный ключ: https://console.groq.com → API Keys
  GROQ_API_KEY: '',
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',

  // Haiku заменён на Groq Llama 3.3 70B (быстрее и дешевле)
  MODEL_HAIKU:  'llama-3.3-70b-versatile',  // → Groq
  MODEL_SONNET: 'claude-sonnet-4-6',         // → Anthropic (диалоги)

  // ══════════════════════════════════════════════════════════════
  // ЕДИНИЦА ИЗМЕРЕНИЯ ТОВАРОВ — КАНОНИЧЕСКИЙ СТАНДАРТ
  //
  //   1 игровая единица = 1 кг
  //
  // Все количества в данных и движке выражены в килограммах:
  //   • needs[good].per_100       — кг на 100 человек в год
  //   • production_output.base_rate — кг на 1000 рабочих в ход (месяц)
  //   • stockpile, supply, demand  — кг
  //   • SLAVE_BASIC_BASKET        — кг на одного раба в ход (месяц)
  //
  // Исключения (штучные товары — не кг):
  //   • horses  — 1 единица = 1 голова
  //   • cattle  — 1 единица = 1 голова
  //   • slaves  — 1 единица = 1 человек
  //
  // Источник калибровки зерна: Полибий — паёк легионера ~870 г зерна/день
  //   = ~320 кг/год. Катон о рабах: ~700 г хлеба/день = ~250 кг зерна/год.
  // ══════════════════════════════════════════════════════════════
  UNIT_KG: 1,   // 1 игровая единица = 1 кг. НЕ МЕНЯТЬ без пересчёта всех данных.

  BALANCE: {
    // Потребление населения за ход (игровые единицы на человека в месяц)
    // Используются как fallback; детальные нормы — в social_classes.js (per_100).
    // Масштаб: производство зданий ~(workers/1000)*base_rate, поэтому единица ≠ 1 кг физически.
    FOOD_PER_PERSON: 0.002,        // игр. ед. зерна в месяц (при 500k чел → нужно 1000 ед.; стартовый склад ~940)
    SALT_PER_PERSON: 0.4,          // кг соли в месяц
    CLOTH_PER_PERSON: 0.25,        // кг ткани в месяц
    TOOLS_PER_CRAFTSMAN: 0.85,     // кг инструментов в месяц на одного ремесленника

    // Население
    BASE_GROWTH_RATE: 0.002,       // +0.2% в ход при сытости
    FAMINE_MORTALITY: 0.008,       // смертность при голоде

    // Экономика
    PRICE_SMOOTHING: 0.3,          // сглаживание цен за ход
    SOLDIER_SALARY: 2,             // монет в ход за солдата
    MAINTENANCE_PER_WORKER: 2,     // монет в ход за одного рабочего здания (обслуживание масштабируется с размером)
    // Корзины содержания раба (кг товара в ход на одного занятого раба)
    // Итоговая стоимость пересчитывается каждый ход по рыночным ценам.
    // Базовая — минимум для выживания; стандартная — норма для нормального труда.
    // Источник: Катон «О земледелии», гл. 56-58 (~700 г зерна/день для полевого раба).
    SLAVE_BASIC_BASKET:    { wheat: 3, barley: 23, salt: 0.25 },           // ~26 кг/мес
    SLAVE_STANDARD_BASKET: { wheat: 5, barley: 20, salt: 0.3, cloth: 0.08 }, // ~25 кг/мес

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
