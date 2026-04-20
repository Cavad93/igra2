// Конфигурация игры — API ключ и константы баланса
export const CONFIG = {
  // ── Anthropic (Claude Sonnet — только диалоги с игроком) ────────────
  API_KEY: '',
  API_URL: 'https://api.anthropic.com/v1/messages',

  // ── Groq (Llama-3 70B — военный AI во время войны с игроком) ────────
  // Бесплатный ключ: console.groq.com → API Keys
  GROQ_API_KEY: '',
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',

  // ── Ollama (локальная модель — решения AI-наций) ─────────────────────
  // Запуск: bash setup_llm.sh (один раз), затем bash start_llm.sh
  OLLAMA_URL:   'http://localhost:11434/v1/chat/completions',
  OLLAMA_MODEL: 'phi4-mini',  // рекомендуется; альтернативы: qwen2.5:7b, gemma3:4b
  OLLAMA_BATCH: 5,            // наций за 1 запрос (оптимально для 3B модели)

  // Session 10 — round-robin batch per turn для AI-наций.
  // В processAINations() за один ход обрабатывается этот срез из tier2+tier3
  // (tier1, warWithPlayer, hot-nations всегда идут критическим путём без батча).
  // Меньше → быстрее ход, но дольше «тишина» провинциальных наций.
  AI_TURN_BATCH: 50,

  // ── Модели ───────────────────────────────────────────────────────────
  MODEL_HAIKU:     'phi4-mini',                        // → Ollama   (фоновые нации)
  MODEL_WAR_AI:    'llama-3.3-70b-versatile',          // → Groq     (война с игроком)
  MODEL_SONNET:    'claude-sonnet-4-6',                // → Anthropic (диалоги с игроком)

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
    // Потребление населения за ход (кг на человека в месяц)
    // Используются как fallback; детальные нормы — в social_classes.js (per_100).
    FOOD_PER_PERSON: 0.5,          // кг зерна в месяц (среднее по всем классам, масштаб ×1/50 от исторического)
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
    SLAVE_BASIC_BASKET:    { wheat: 0.06, barley: 0.46, salt: 0.25 },           // ~0.5 кг/мес (×1/50 от исторического)
    SLAVE_STANDARD_BASKET: { wheat: 0.10, barley: 0.40, salt: 0.3, cloth: 0.08 }, // ~0.5 кг/мес

    // Амортизация капитальных ресурсов ферм (доля списания в тик = 1 мес)
    TOOLS_MONTHLY_WEAR:   0.021,   // инструменты: срок ~4 года (48 тиков)
    HORSE_MONTHLY_WEAR:   0.0083,  // лошади: рабочий срок ~10 лет (120 тиков)
    CATTLE_MONTHLY_WEAR:  0.0070,  // волы: рабочий срок ~12 лет (144 тика)

    // Бонус лошадей к производительности относительно волов
    HORSE_EFFICIENCY_MULT: 1.2,    // лошади быстрее → +20% к production_ratio

    // Армия
    // Калибровка (Этап 4 economic3.md по Scheidel / Полибию):
    //   Легионер I в. AD: 225 ден/год = 19 ден/мес. Игровая шкала ~1:10 → 2 монеты ✓
    //   Кавалерист: 3-4× пехотинца = ~60 ден/мес → 5 монет близко к норме ✓
    //   Trireme 200 чел × 4 ден/день × 30 = 24000 ден/мес. При шкале 1:500 → 50 ✓
    //     (было 10 — флот был разменным ресурсом, нации плодили флоты бесконтрольно)
    //   Наёмник: 2-3× легионера = ~4-6 → 4 монеты ✓
    INFANTRY_UPKEEP: 2,            // монет в ход
    CAVALRY_UPKEEP: 5,
    SHIP_UPKEEP: 50,               // Этап 4: 10 → 50 (реалистичная стоимость trireme)
    MERCENARY_UPKEEP: 4,

    // Налоги
    // Калибровка (Этап 4): Рим I в. AD — tributum ~1% + vectigal 2-5%.
    //   Текущие 12% от производства — слишком агрессивно. 8% ближе к исторической
    //   норме мирного налога. При `HAPPINESS_TAX_MULT=0.015` реальный эффективный
    //   налог ещё ниже в 1.5-2 раза у несчастного населения.
    BASE_TAX_RATE: 0.08,           // Этап 4: 0.12 → 0.08 (историческая норма)

    // Счастье
    BASE_HAPPINESS: 50,
    HAPPINESS_FROM_FOOD: 10,       // при избытке еды
    HAPPINESS_FROM_FAMINE: -25,    // при голоде
    HAPPINESS_FROM_WAR: -15,

    // Торговля
    PIRACY_BASE: 0.03,             // базовый риск пиратства (ECO_010: снижено с 0.05)
    BASE_TARIFF: 0.08,             // базовая пошлина
    TRADE_PROFIT_RATE:      0.05,  // 5% от объёма — базовая доходность маршрута
    TRADE_TARIFF_FRIENDLY:  0.05,  // тариф при отношениях > 50
    TRADE_TARIFF_NEUTRAL:   0.15,  // тариф при 0–50
    TRADE_TARIFF_HOSTILE:   0.30,  // тариф при < 0

    // Производство (ECO_010)
    SUBSISTENCE_FACTOR:    0.65,   // неорганизованное = 65% эффективности
    ORGANIZED_BONUS:       1.20,   // здания дают +20% к базовому

    // Рынок (ECO_010)
    MISSING_NATIONS_MULT:  1.2,    // снижено с 2.0 → убирает вечный дефицит (цены переставали возвращаться от price_ceiling)
    SHORTAGE_STREAK_CAP:   8,      // максимум 8 ходов подряд дефицита
    PRICE_SMOOTH_FACTOR:   0.30,   // сглаживание цен

    // Население (ECO_010)
    HAPPINESS_TAX_MULT:    0.015,  // каждые -10 счастья = -15% налогов

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
  // Session 26 (perf): автосохранение выполняется каждые N ходов,
  // а не после каждого хода. При крэше теряется максимум (N-1) ходов.
  // Save-payload создаётся на main thread (_buildSavePayload + structured
  // clone в postMessage) и стоит ~3-5 ms/ход на 10-15 МБ state; при
  // N=5 это даёт −80% веса этого шага в сумме.
  // Игрок всегда сохраняется на ходах: 1 (инициализация), каждом N-м,
  // и через window.forceSaveGame() (UI-хук для будущей кнопки «Save»).
  SAVE_INTERVAL_TURNS: 5,

  // Шанс случайного события за ход
  RANDOM_EVENT_CHANCE: 0.20,   // Этап 5 economic3.md: 0.10 → 0.20 (≈1 событие/5 ходов на случ. нацию) — обеспечивает variance цен, ломает stuck_price равновесие

  // ─────────────────────────────────────
  // КАРТА — тайловый сервер
  // ─────────────────────────────────────
  // CAWM (Consortium of Ancient World Mappers, ун-т Айовы)
  // Преемник AWMC. Лицензия: CC BY 4.0
  // Сайт: https://cawm.lib.uiowa.edu
  MAP_TILE_URL: 'https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png',
  MAP_TILE_ATTRIBUTION: '© <a href="https://cawm.lib.uiowa.edu/">CAWM</a> CC BY 4.0',
};
