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
