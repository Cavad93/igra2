// Товары, базовые цены и параметры производства
//
// ЕДИНИЦА ИЗМЕРЕНИЯ: 1 единица = 1 кг (см. CONFIG.UNIT_KG).
// Все base_price — золотых за 1 кг товара.
// Исключения: horses, cattle (1 ед = 1 голова), slaves (1 ед = 1 человек).
var GOODS = {

  // ══════════════════════════════════════════════════════════════
  // WHEAT STANDARD — денежный якорь (proto-economy)
  //
  // base_price пшеницы = 10 → 10 золотых за 1 кг.
  //
  // КАК ОПРЕДЕЛЯЕТСЯ СТАРТОВАЯ ЦЕНА:
  //   P₀ = total_wages_per_tick / total_commercial_wheat_demand_per_tick
  //   Рынок сам находит это равновесие за 10–20 тиков.
  //   При subsistence-доминировании (много свободных фермеров) P < base_price;
  //   при росте коммерческого производства P → base_price.
  //
  // БУДУЩАЯ ЧЕКАНКА МОНЕТ:
  //   Монеты (gold) станут товаром с ограниченным запасом.
  //   Выпуск новых монет → рост money supply → P_wheat в монетах растёт.
  //   Текущая модель: gold supply = const → P стабилизируется у base_price.
  // ══════════════════════════════════════════════════════════════

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

  // ── СКОТ ────────────────────────────────────────────────────────────────
  horses: {
    name:       'Лошади',
    name_gen:   'лошадей',
    base_price: 120,
    unit:       'голова',
    category:   'livestock',
    producers:  ['soldiers_class'],  // конный завод строится soldiers_class
    is_food:    false,
    icon:       '🐎',
    market_category:       'livestock',
    stockpile_target_turns: 8,
    price_elasticity:       0.55,
  },
  cattle: {
    name:       'Крупный рогатый скот',
    name_gen:   'скота',
    base_price: 70,
    unit:       'голова',
    category:   'livestock',
    producers:  ['farmers_class'],   // скотоводческое хозяйство — farmers_class
    is_food:    false,
    icon:       '🐂',
    market_category:       'livestock',
    stockpile_target_turns: 8,
    price_elasticity:       0.60,
  },

  // ── РАБОЧАЯ СИЛА ────────────────────────────────────────────────────────
  slaves: {
    name: 'Рабы',
    name_gen: 'рабов',
    base_price: 200,
    unit: 'человек',   // штучный товар — 1 ед = 1 человек
    category: 'labor',
    producers: ['merchants'],
    is_food: false,
    icon: '⛓️',
    market_category: 'labor',
    stockpile_target_turns: 2,
    price_elasticity: 0.7,
  },

  // ── ПЕРЕРАБОТАННЫЕ ПРОДУКТЫ ──────────────────────────────────────────────

  garum: {
    name:     'Гарум',
    name_gen: 'гарума',
    base_price: 30,
    unit: 'кг',
    category: 'food',
    producers: ['craftsmen'],
    is_food: true,
    // Ферментированный рыбный соус — главная приправа Рима и Греции.
    // Производство: рыба + соль → 3–4 месяца ферментации. Экспортировался по всему Средиземноморью.
    icon: '🫙',
    market_category: 'food_processed',
    stockpile_target_turns: 4,
    price_elasticity: 1.1,
  },

  meat: {
    name:     'Мясо',
    name_gen: 'мяса',
    base_price: 25,
    unit: 'кг',
    category: 'food',
    producers: ['farmers'],
    is_food: true,
    // Говядина, баранина, свинина. Дорогой продукт — большинство крестьян ели мясо редко.
    // Аристократы и солдаты — основные потребители.
    icon: '🥩',
    market_category: 'food_staple',
    stockpile_target_turns: 3,
    price_elasticity: 1.2,
  },

  // ── МЕТАЛЛЫ — СЫРЬЁ ─────────────────────────────────────────────────────

  copper: {
    name:     'Медь',
    name_gen: 'меди',
    base_price: 35,
    unit: 'кг',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    // Основа бронзового сплава (90% меди + 10% олова). Кипр — главный поставщик.
    // Также: монеты, кровля, утварь.
    icon: '🪙',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 0.9,
  },

  tin: {
    name:     'Олово',
    name_gen: 'олова',
    base_price: 80,
    unit: 'кг',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    // Редкий металл. Главные источники: Иберия (Gallaecia), Британия (Cornwall).
    // Необходимо для бронзы. Высокая цена из-за дальности транспортировки.
    icon: '⬜',
    market_category: 'raw_material',
    stockpile_target_turns: 6,
    price_elasticity: 0.8,
  },

  silver: {
    name:     'Серебро',
    name_gen: 'серебра',
    base_price: 800,
    unit: 'кг',
    category: 'precious',
    producers: ['craftsmen'],
    is_food: false,
    // Основа монетного дела (драхма, денарий). Лаврий (Аттика), Иберия.
    // Государственный резерв. Высокая эластичность спроса как у денег.
    icon: '🥈',
    market_category: 'precious',
    stockpile_target_turns: 8,
    price_elasticity: 0.5,
  },

  gold: {
    name:     'Золото',
    name_gen: 'золота',
    base_price: 4000,
    unit: 'кг',
    category: 'precious',
    producers: ['craftsmen'],
    is_food: false,
    // Самый ценный металл. Чеканка ауреусов и статеров. Стратегический резерв.
    icon: '🥇',
    market_category: 'precious',
    stockpile_target_turns: 12,
    price_elasticity: 0.4,
  },

  // ── ТОПЛИВО И СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ ────────────────────────────────────

  charcoal: {
    name:     'Древесный уголь',
    name_gen: 'древесного угля',
    base_price: 12,
    unit: 'кг',
    category: 'material',
    producers: ['craftsmen', 'farmers'],
    is_food: false,
    // Топливо для металлургии: ~5 кг угля на 1 кг железа. Производится из древесины.
    // Ограничивает производство металлов там, где мало леса (Сицилия, Греция).
    icon: '⬛',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 1.1,
  },

  stone: {
    name:     'Камень',
    name_gen: 'камня',
    base_price: 5,
    unit: 'кг',
    category: 'material',
    producers: ['craftsmen'],
    is_food: false,
    // Строительный материал: стены, храмы, дороги. Добывается в каменоломнях.
    // Дёшев в добыче, дорог в транспортировке из-за веса.
    icon: '🪨',
    market_category: 'raw_material',
    stockpile_target_turns: 3,
    price_elasticity: 0.7,
  },

  // ── КОРАБЕЛЬНЫЕ МАТЕРИАЛЫ ────────────────────────────────────────────────

  hemp: {
    name:     'Пенька',
    name_gen: 'пеньки',
    base_price: 18,
    unit: 'кг',
    category: 'material',
    producers: ['farmers'],
    is_food: false,
    // Волокно конопли — канаты, паруса, оснастка флота. Без пеньки нет флота.
    // Выращивается в речных долинах и прибрежных равнинах.
    icon: '🌿',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
    price_elasticity: 0.9,
  },

  pitch: {
    name:     'Смола',
    name_gen: 'смолы',
    base_price: 25,
    unit: 'кг',
    category: 'material',
    producers: ['craftsmen', 'farmers'],
    is_food: false,
    // Корабельная смола — гидроизоляция обшивки и конопатка. Из хвойной древесины.
    // Также: факелы, бочки, медицина. Производится в лесных регионах.
    icon: '🟫',
    market_category: 'raw_material',
    stockpile_target_turns: 5,
    price_elasticity: 1.0,
  },

  // ── ВОЕННОЕ СНАРЯЖЕНИЕ ───────────────────────────────────────────────────

  weapons: {
    name:     'Оружие',
    name_gen: 'оружия',
    base_price: 120,
    unit: 'кг',
    category: 'military',
    producers: ['craftsmen'],
    is_food: false,
    // Мечи, копья, щиты. Производится из железа/бронзы + дерева.
    // Стратегический товар — контролируется государством.
    icon: '⚔️',
    market_category: 'military',
    stockpile_target_turns: 6,
    price_elasticity: 0.7,
  },

  armor: {
    name:     'Доспехи',
    name_gen: 'доспехов',
    base_price: 200,
    unit: 'кг',
    category: 'military',
    producers: ['craftsmen'],
    is_food: false,
    // Бронзовые и железные шлемы, панцири, поножи, щиты.
    // Дорого, долго, трудоёмко — один полный комплект = ~25 кг металла.
    icon: '🛡️',
    market_category: 'military',
    stockpile_target_turns: 8,
    price_elasticity: 0.6,
  },

  // ── ЭКЗОТИЧЕСКИЕ И СЕВЕРНЫЕ ТОВАРЫ ──────────────────────────────────────

  amber: {
    name:     'Янтарь',
    name_gen: 'янтаря',
    base_price: 200,
    unit: 'кг',
    category: 'luxury',
    producers: ['merchants'],
    is_food: false,
    // Балтийский янтарь. Янтарный путь: Балтика → Висла → Дунай → Средиземноморье.
    // Украшения, амулеты. Только торговля, не добывается в игровом регионе.
    icon: '🟠',
    market_category: 'luxury',
    stockpile_target_turns: 2,
    price_elasticity: 0.5,
  },

  furs: {
    name:     'Меха',
    name_gen: 'мехов',
    base_price: 80,
    unit: 'кг',
    category: 'luxury',
    producers: ['merchants', 'farmers'],
    is_food: false,
    // Из северных лесов: Галлия, Германия, Скифия, Дакия.
    // Тёплая одежда и статусный товар для элиты южных регионов.
    icon: '🦊',
    market_category: 'luxury',
    stockpile_target_turns: 3,
    price_elasticity: 0.6,
  },

  // ── ВОЕННЫЕ ЖИВОТНЫЕ ────────────────────────────────────────────────────

  war_elephants: {
    name:     'Боевые слоны',
    name_gen: 'боевых слонов',
    base_price: 8000,
    unit: 'голова',   // штучный товар — 1 ед = 1 животное
    category: 'military',
    producers: ['merchants'],
    is_food: false,
    // Из Африки (Карфаген — лесной слон) и Индии (Диадохи — индийский слон).
    // Требует корм (зерно, сено), дрессировщиков. Огромный эффект на поле боя.
    icon: '🐘',
    market_category: 'military',
    stockpile_target_turns: 12,
    price_elasticity: 0.3,
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
    // ── ЕДА ─────────────────────────────────────────────────────────────
    wheat:          ['farm', 'latifundium', 'grain_estate'],
    barley:         ['farm', 'grain_estate'],
    fish:           ['port'],
    tuna:           ['tuna_trap'],
    garum:          ['workshop'],           // рыба + соль → ферментация
    meat:           ['ranch', 'latifundium'],
    olives:         ['latifundium', 'farm'],
    olive_oil:      ['oil_press'],
    wine:           ['winery'],
    honey:          ['ranch'],
    // ── МЕТАЛЛЫ — СЫРЬЁ ─────────────────────────────────────────────────
    iron:           ['mine'],
    bronze:         ['workshop'],           // медь + олово → плавка
    copper:         ['mine'],
    tin:            ['mine'],
    silver:         ['mine'],
    gold:           ['mine'],
    // ── ТОПЛИВО И СТРОИТЕЛЬСТВО ─────────────────────────────────────────
    charcoal:       ['lumber_camp'],        // обжиг древесины
    timber:         ['lumber_camp'],
    stone:          ['quarry'],
    // ── КОРАБЕЛЬНЫЕ МАТЕРИАЛЫ ────────────────────────────────────────────
    hemp:           ['farm'],
    pitch:          ['lumber_camp'],        // смолокурня из хвойной древесины
    // ── ПЕРЕРАБОТАННОЕ ───────────────────────────────────────────────────
    tools:          ['workshop'],
    weapons:        ['armory'],
    armor:          ['armory'],
    cloth:          ['workshop'],
    leather:        ['ranch', 'workshop'],
    pottery:        ['workshop', 'pottery_workshop'],
    wool:           ['ranch'],
    salt:           ['salt_works'],
    sulfur:         ['sulfur_mine'],
    papyrus:        ['papyrus_bed'],
    trade_goods:    ['port'],
    // ── НЕ ПРОИЗВОДЯТСЯ ЗДАНИЯМИ — ТОЛЬКО ИМПОРТ/ТОРГОВЛЯ ───────────────
    // wax, incense, purple_dye: природный сбор или импорт
    // amber: торговый путь с Балтики
    // furs: охота или торговля с севером
    // war_elephants: только импорт из Африки/Индии
    // slaves: военный захват или работорговля
    // horses, cattle: разведение (через ranch — уже штучные товары)
  };
  for (const [goodId, bldIds] of Object.entries(MAP)) {
    if (GOODS[goodId]) GOODS[goodId].produced_by = bldIds;
  }
  for (const goodId of Object.keys(GOODS)) {
    if (!GOODS[goodId].produced_by) GOODS[goodId].produced_by = [];
  }
})();
