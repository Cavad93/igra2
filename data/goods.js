// Товары, базовые цены и параметры производства
const GOODS = {

  // ── ЗЕРНОВЫЕ ────────────────────────────────────────────────────────────
  wheat: {
    name: 'Пшеница',
    name_gen: 'пшеницы',
    base_price: 10,
    unit: 'бушель',
    category: 'food',
    producers: ['farmers'],
    is_food: true,
    is_grain: true,      // считается зерном (основная еда)
    icon: '🌾',
    market_category: 'food_staple',
    stockpile_target_turns: 6,   // критичный продукт — нужен большой запас
    price_elasticity: 1.5,       // цена резко реагирует на дефицит
  },
  barley: {
    name: 'Ячмень',
    name_gen: 'ячменя',
    base_price: 7,
    unit: 'бушель',
    category: 'food',
    producers: ['farmers'],
    is_food: true,
    is_grain: true,      // вторичное зерно, едят низшие классы
    icon: '🌿',
    market_category: 'food_staple',
    stockpile_target_turns: 6,
    price_elasticity: 1.4,
  },

  // ── РЫБА И МОРЕПРОДУКТЫ ─────────────────────────────────────────────────
  fish: {
    name: 'Рыба',
    name_gen: 'рыбы',
    base_price: 15,
    unit: 'амфора',
    category: 'food',
    producers: ['sailors'],
    is_food: true,
    icon: '🐟',
    market_category: 'food_staple',
    stockpile_target_turns: 5,
    price_elasticity: 1.3,
  },

  // ── МАСЛО И ФРУКТЫ ──────────────────────────────────────────────────────
  olives: {
    name: 'Оливки',
    name_gen: 'оливок',
    base_price: 18,
    unit: 'амфора',
    category: 'food',
    producers: ['farmers'],
    is_food: false,
    icon: '🫒',
    market_category: 'food_processed',
    stockpile_target_turns: 4,
    price_elasticity: 1.1,
  },
  olive_oil: {
    name: 'Оливковое масло',
    name_gen: 'оливкового масла',
    base_price: 32,
    unit: 'амфора',
    category: 'food',
    producers: ['craftsmen', 'farmers'],
    is_food: false,      // еда + освещение + гигиена
    icon: '🏺',
    market_category: 'food_processed',
    stockpile_target_turns: 4,
    price_elasticity: 1.1,
  },
  honey: {
    name: 'Мёд',
    name_gen: 'мёда',
    base_price: 45,
    unit: 'амфора',
    category: 'food',
    producers: ['farmers'],
    is_food: false,
    icon: '🍯',
    market_category: 'food_processed',
    stockpile_target_turns: 3,
    price_elasticity: 0.9,
  },

  // ── НАПИТКИ ─────────────────────────────────────────────────────────────
  wine: {
    name: 'Вино',
    name_gen: 'вина',
    base_price: 30,
    unit: 'амфора',
    category: 'food',
    producers: ['craftsmen', 'farmers'],
    is_food: false,
    icon: '🍷',
    market_category: 'food_processed',
    stockpile_target_turns: 3,
    price_elasticity: 1.0,
  },

  // ── КОНСЕРВАНТЫ И СПЕЦИИ ────────────────────────────────────────────────
  salt: {
    name: 'Соль',
    name_gen: 'соли',
    base_price: 18,
    unit: 'мешок',
    category: 'essential',
    producers: ['merchants'],
    is_food: false,
    is_essential: true,
    icon: '🧂',
    market_category: 'trade_hub',
    stockpile_target_turns: 5,   // соль — консервант, высокий приоритет
    price_elasticity: 1.4,
  },

  // ── МЕТАЛЛЫ ─────────────────────────────────────────────────────────────
  iron: {
    name: 'Железо',
    name_gen: 'железа',
    base_price: 45,
    unit: 'талант',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '⚙️',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 1.0,
  },
  bronze: {
    name: 'Бронза',
    name_gen: 'бронзы',
    base_price: 55,
    unit: 'талант',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🔔',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 0.9,
  },

  // ── СТРОИТЕЛЬНОЕ СЫРЬЁ ──────────────────────────────────────────────────
  timber: {
    name: 'Древесина',
    name_gen: 'древесины',
    base_price: 22,
    unit: 'воз',
    category: 'material',
    producers: ['farmers'],
    is_food: false,
    icon: '🪵',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 1.0,
  },

  // ── ТЕКСТИЛЬ И СЫРЬЁ ────────────────────────────────────────────────────
  wool: {
    name: 'Шерсть',
    name_gen: 'шерсти',
    base_price: 20,
    unit: 'тюк',
    category: 'material',
    producers: ['farmers'],
    is_food: false,
    icon: '🧶',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 0.9,
  },
  cloth: {
    name: 'Ткань',
    name_gen: 'ткани',
    base_price: 28,
    unit: 'тюк',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🧵',
    market_category: 'processed_goods',
    stockpile_target_turns: 3,
    price_elasticity: 0.9,
  },
  leather: {
    name: 'Кожа',
    name_gen: 'кожи',
    base_price: 28,
    unit: 'тюк',
    category: 'material',
    producers: ['farmers', 'craftsmen'],
    is_food: false,
    icon: '🥾',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 0.9,
  },

  // ── ИНСТРУМЕНТЫ И ПОСУДА ────────────────────────────────────────────────
  tools: {
    name: 'Инструменты',
    name_gen: 'инструментов',
    base_price: 35,
    unit: 'комплект',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🔨',
    market_category: 'processed_goods',
    stockpile_target_turns: 3,
    price_elasticity: 0.8,
  },
  pottery: {
    name: 'Керамика',
    name_gen: 'керамики',
    base_price: 15,
    unit: 'партия',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    icon: '🏺',
    market_category: 'processed_goods',
    stockpile_target_turns: 3,
    price_elasticity: 0.8,
  },

  // ── ПИСЬМЕННЫЕ ПРИНАДЛЕЖНОСТИ ────────────────────────────────────────────
  papyrus: {
    name: 'Папирус',
    name_gen: 'папируса',
    base_price: 38,
    unit: 'свиток',
    category: 'material',
    producers: ['merchants'],   // импортируется из Египта
    is_food: false,
    icon: '📜',
    market_category: 'processed_goods',
    stockpile_target_turns: 3,
    price_elasticity: 0.7,
  },
  wax: {
    name: 'Воск',
    name_gen: 'воска',
    base_price: 25,
    unit: 'фунт',
    category: 'material',
    producers: ['farmers'],
    is_food: false,
    icon: '🕯',
    market_category: 'raw_material',
    stockpile_target_turns: 3,
    price_elasticity: 0.8,
  },

  // ── ПРЕДМЕТЫ РОСКОШИ ────────────────────────────────────────────────────
  incense: {
    name: 'Благовония',
    name_gen: 'благовоний',
    base_price: 85,
    unit: 'амфора',
    category: 'luxury',
    producers: ['merchants'],   // импорт с Востока
    is_food: false,
    icon: '🌿',
    market_category: 'luxury',
    stockpile_target_turns: 2,
    price_elasticity: 0.6,   // спрос рухает при дефиците — не первая необходимость
  },
  purple_dye: {
    name: 'Пурпур',
    name_gen: 'пурпура',
    base_price: 320,
    unit: 'фунт',
    category: 'luxury',
    producers: ['merchants'],   // финикийский пурпур
    is_food: false,
    icon: '💜',
    market_category: 'luxury',
    stockpile_target_turns: 2,
    price_elasticity: 0.5,
  },

  // ── ТОРГОВЫЕ ТОВАРЫ ─────────────────────────────────────────────────────
  // Смешанные мелкие товары (гончарка, кожа, мелкое железо), торгуемые через порты.
  trade_goods: {
    name: 'Торговые товары',
    name_gen: 'торговых товаров',
    base_price: 25,
    unit: 'партия',
    category: 'material',
    producers: ['merchants', 'sailors'],
    is_food: false,
    icon: '🎁',
    market_category: 'trade_hub',
    stockpile_target_turns: 3,
    price_elasticity: 0.8,
  },

  // ── СИЦИЛИЙСКИЕ РЕСУРСЫ ─────────────────────────────────────────────────
  // Уникальные товары, добываемые только на Сицилии.

  sulfur: {
    name: 'Сера',
    name_gen: 'серы',
    base_price: 40,
    unit: 'мешок',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    // Применение: дубление кожи, медицина, фумигация, окраска
    icon: '🟡',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 0.9,
  },

  tuna: {
    name: 'Тунец',
    name_gen: 'тунца',
    base_price: 22,
    unit: 'амфора',
    category: 'food',
    producers: ['sailors'],
    is_food: true,
    // Ловушки-маттанцы — сицилийский промысел тунца
    icon: '🐟',
    market_category: 'food_staple',
    stockpile_target_turns: 5,
    price_elasticity: 1.3,
  },

  // ── РАБОЧАЯ СИЛА ────────────────────────────────────────────────────────
  slaves: {
    name: 'Рабы',
    name_gen: 'рабов',
    base_price: 200,
    unit: 'человек',
    category: 'labor',
    producers: ['merchants'],
    is_food: false,
    icon: '⛓️',
    market_category: 'labor',
    stockpile_target_turns: 2,
    price_elasticity: 0.7,
  },
};

// Производство каждого региона по типу
// Коэффициенты показывают единиц товара на 1000 жителей данной профессии
const REGION_PRODUCTION_BASE = {
  coastal_city: {
    fish:      { per: 'sailors',   rate: 120 },
    cloth:     { per: 'craftsmen', rate: 70 },
    tools:     { per: 'craftsmen', rate: 40 },
    wine:      { per: 'craftsmen', rate: 30 },
    salt:      { per: 'merchants', rate: 50 },
    pottery:   { per: 'craftsmen', rate: 60 },
    bronze:    { per: 'craftsmen', rate: 20 },
    leather:   { per: 'craftsmen', rate: 30 },
    papyrus:   { per: 'merchants', rate: 20 }, // реэкспорт через порты
    incense:   { per: 'merchants', rate: 8  }, // импорт с Востока
    purple_dye:{ per: 'merchants', rate: 3  }, // финикийский пурпур
  },
  plains: {
    wheat:     { per: 'farmers',   rate: 200 },
    barley:    { per: 'farmers',   rate: 80 },
    olives:    { per: 'farmers',   rate: 50 },
    timber:    { per: 'farmers',   rate: 30 },
    wool:      { per: 'farmers',   rate: 40 },
    leather:   { per: 'farmers',   rate: 20 },
    honey:     { per: 'farmers',   rate: 15 },
    wax:       { per: 'farmers',   rate: 10 },
    olive_oil: { per: 'farmers',   rate: 30 },
  },
  hills: {
    wheat:     { per: 'farmers',   rate: 100 },
    barley:    { per: 'farmers',   rate: 60 },
    olives:    { per: 'farmers',   rate: 90 },
    olive_oil: { per: 'farmers',   rate: 50 },
    wine:      { per: 'craftsmen', rate: 70 },
    iron:      { per: 'craftsmen', rate: 40 },
    wool:      { per: 'farmers',   rate: 30 },
    honey:     { per: 'farmers',   rate: 20 },
    pottery:   { per: 'craftsmen', rate: 30 },
  },
  mountains: {
    iron:      { per: 'craftsmen', rate: 80 },
    bronze:    { per: 'craftsmen', rate: 30 },
    timber:    { per: 'farmers',   rate: 70 },
    tools:     { per: 'craftsmen', rate: 25 },
    barley:    { per: 'farmers',   rate: 40 },
    wool:      { per: 'farmers',   rate: 50 },
    wax:       { per: 'farmers',   rate: 12 },
  },
  river_valley: {
    wheat:     { per: 'farmers',   rate: 260 },
    barley:    { per: 'farmers',   rate: 100 },
    cloth:     { per: 'craftsmen', rate: 80 },
    papyrus:   { per: 'farmers',   rate: 25 }, // нильский тип
    olive_oil: { per: 'farmers',   rate: 20 },
    honey:     { per: 'farmers',   rate: 18 },
    wax:       { per: 'farmers',   rate: 14 },
    pottery:   { per: 'craftsmen', rate: 40 },
  },
};

// ── Вспомогательные функции рынка ────────────────────────────────────────────

/**
 * Возвращает объект динамического состояния товара по умолчанию.
 * Используется при инициализации и при добавлении нового товара в рынок.
 * @param {string} goodId - ключ из GOODS
 * @returns {Object}
 */
function ensureMarketEntry(goodId) {
  const good = GOODS[goodId];
  if (!good) return null;
  const base = good.base_price;
  return {
    base:             base,
    price:            base,
    supply:           0,
    demand:           0,
    world_stockpile:  null,        // инициализируется в первый тик (demand * targetTurns)
    price_history:    [],          // последние 24 тика
    shortage_streak:  0,           // тиков подряд со складом < 50% цели
    production_cost:  null,        // заполняется движком рецептов (Этап 3)
    price_floor:      base * 0.5,  // минимальная цена = 50% базы
  };
}

/**
 * Добавляет в GAME_STATE.market все товары из GOODS, которых там ещё нет,
 * сохраняя существующие записи без изменений.
 * Вызывается один раз при старте игры.
 * @param {Object} market - GAME_STATE.market
 */
function initializeAllMarketEntries(market) {
  for (const goodId of Object.keys(GOODS)) {
    if (!market[goodId]) {
      market[goodId] = ensureMarketEntry(goodId);
    }
  }
}

/**
 * Возвращает статические метаданные товара вместе с его текущим рыночным состоянием.
 * @param {string} goodId
 * @param {Object} market - GAME_STATE.market
 * @returns {{ ...GOODS[goodId], market: market[goodId] } | null}
 */
function getGoodInfo(goodId, market) {
  const good = GOODS[goodId];
  if (!good) return null;
  return { ...good, id: goodId, market: market[goodId] || null };
}

// ══════════════════════════════════════════════════════════════
// Этап 8: Связь товаров с производящими зданиями
//
// produced_by[goodId] — массив building_id, чьи production_output
// включают этот товар. Позволяет навигировать «от товара к зданию»
// без перебора всего BUILDINGS. Заполняется один раз при загрузке.
//
// Товары без produced_by (wax, incense, purple_dye, slaves) добываются
// только неорганизованным трудом или импортируются.
// ══════════════════════════════════════════════════════════════
(function _addProducedBy() {
  const MAP = {
    wheat:       ['farm', 'latifundium', 'grain_estate'],
    barley:      ['farm', 'grain_estate'],
    fish:        ['port'],
    olives:      ['latifundium'],
    olive_oil:   ['oil_press'],
    honey:       ['ranch'],
    wine:        ['winery'],
    salt:        ['salt_works'],
    iron:        ['mine'],
    bronze:      ['mine'],
    timber:      ['lumber_camp'],
    wool:        ['ranch'],
    cloth:       ['workshop'],
    leather:     ['ranch'],
    tools:       ['workshop'],
    pottery:     ['workshop', 'pottery_workshop'],
    papyrus:     ['papyrus_bed'],
    trade_goods: ['port'],
    sulfur:      ['sulfur_mine'],
    tuna:        ['tuna_trap'],
    // не производятся зданиями: wax, incense, purple_dye, slaves
  };
  for (const [goodId, bldIds] of Object.entries(MAP)) {
    if (GOODS[goodId]) GOODS[goodId].produced_by = bldIds;
  }
  for (const goodId of Object.keys(GOODS)) {
    if (!GOODS[goodId].produced_by) GOODS[goodId].produced_by = [];
  }
})();
