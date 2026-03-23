// Товары, базовые цены и параметры производства
// base_price — якорь равновесия. Реальная цена живёт в nation.market[good]
// и меняется каждый ход через engine/market.js
//
// ЕДИНИЦА ИЗМЕРЕНИЯ: 1 единица ≈ 1 кг (см. CONFIG.UNIT_KG).
// Исключения: horses, cattle (1 ед = 1 голова), slaves (1 ед = 1 человек).
// Wheat standard: base_price пшеницы = 10 → денежный якорь всей экономики.
//
// resource_type:
//   biome        — производство определяется биомом региона (goods_bonus в BIOME_META)
//   deposit      — требуется месторождение в регионе (deposit_key → region.deposits)
//   import_only  — нельзя производить локально; только торговля и импорт
//   processed    — изготовляется из других товаров (requires_building обязателен)
//   livestock    — живой ресурс; получается разведением или военным захватом

var GOODS = {

  // ── ЗЕРНОВЫЕ И ПРОДОВОЛЬСТВИЕ ────────────────────────────────────────────

  wheat: {
    name: 'Пшеница',
    name_gen: 'пшеницы',
    base_price: 10,
    price_elasticity: 1.5,   // резко реагирует на голод
    price_floor: 3,
    unit: 'бушель',
    category: 'food_staple',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'farm',
    is_food: true,
    is_grain: true,
    producers: ['farmers'],
    icon: '🌾',
    market_category: 'food_staple',
    stockpile_target_turns: 6,
  },

  barley: {
    name: 'Ячмень',
    name_gen: 'ячменя',
    base_price: 7,
    price_elasticity: 1.4,
    price_floor: 2,
    unit: 'бушель',
    category: 'food_staple',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'farm',
    is_food: true,
    is_grain: true,   // вторичное зерно, едят низшие классы и кормят скот
    producers: ['farmers'],
    icon: '🌿',
    market_category: 'food_staple',
    stockpile_target_turns: 6,
  },

  fish: {
    name: 'Рыба',
    name_gen: 'рыбы',
    base_price: 15,
    price_elasticity: 1.3,
    price_floor: 5,
    unit: 'амфора',
    category: 'food_staple',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'port',
    is_food: true,
    is_grain: false,
    producers: ['sailors'],
    icon: '🐟',
    market_category: 'food_staple',
    stockpile_target_turns: 5,
  },

  tuna: {
    name: 'Тунец',
    name_gen: 'тунца',
    base_price: 22,
    price_elasticity: 1.3,
    price_floor: 7,
    unit: 'амфора',
    category: 'food_staple',
    resource_type: 'biome',   // прибрежный — только mediterranean_coast и смежные
    deposit_key: null,
    requires_building: 'tuna_trap',   // маттанца — сицилийская ловушка
    is_food: true,
    is_grain: false,
    producers: ['sailors'],
    icon: '🐠',
    market_category: 'food_staple',
    stockpile_target_turns: 5,
  },

  garum: {
    name: 'Гарум',
    name_gen: 'гарума',
    base_price: 30,
    price_elasticity: 1.1,
    price_floor: 9,
    unit: 'амфора',
    category: 'food_processed',
    resource_type: 'processed',   // рыба + соль → 3–4 месяца ферментации
    deposit_key: null,
    requires_building: 'workshop',
    is_food: true,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🫙',
    market_category: 'food_processed',
    stockpile_target_turns: 4,
  },

  meat: {
    name: 'Мясо',
    name_gen: 'мяса',
    base_price: 25,
    price_elasticity: 1.2,
    price_floor: 8,
    unit: 'кг',
    category: 'food_staple',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'ranch',
    is_food: true,
    is_grain: false,
    producers: ['farmers'],
    icon: '🥩',
    market_category: 'food_staple',
    stockpile_target_turns: 3,
  },

  olives: {
    name: 'Оливки',
    name_gen: 'оливок',
    base_price: 18,
    price_elasticity: 1.1,
    price_floor: 5,
    unit: 'амфора',
    category: 'food_staple',
    resource_type: 'biome',   // только mediterranean_hills / mediterranean_coast
    deposit_key: null,
    requires_building: 'farm',
    is_food: true,
    is_grain: false,
    producers: ['farmers'],
    icon: '🫒',
    market_category: 'food_processed',
    stockpile_target_turns: 4,
  },

  olive_oil: {
    name: 'Оливковое масло',
    name_gen: 'оливкового масла',
    base_price: 32,
    price_elasticity: 1.1,
    price_floor: 10,
    unit: 'амфора',
    category: 'food_processed',
    resource_type: 'processed',   // оливки → давильня
    deposit_key: null,
    requires_building: 'oil_press',
    is_food: true,
    is_grain: false,
    producers: ['craftsmen', 'farmers'],
    icon: '🏺',
    market_category: 'food_processed',
    stockpile_target_turns: 4,
  },

  wine: {
    name: 'Вино',
    name_gen: 'вина',
    base_price: 30,
    price_elasticity: 1.0,
    price_floor: 9,
    unit: 'амфора',
    category: 'food_processed',
    resource_type: 'processed',   // виноград → винодельня
    deposit_key: null,
    requires_building: 'winery',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen', 'farmers'],
    icon: '🍷',
    market_category: 'food_processed',
    stockpile_target_turns: 3,
  },

  honey: {
    name: 'Мёд',
    name_gen: 'мёда',
    base_price: 45,
    price_elasticity: 0.9,
    price_floor: 14,
    unit: 'амфора',
    category: 'food_luxury',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'ranch',   // пасека
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🍯',
    market_category: 'food_processed',
    stockpile_target_turns: 3,
  },

  // ── СЫРЬЁ — БИОМНОЕ ──────────────────────────────────────────────────────

  timber: {
    name: 'Древесина',
    name_gen: 'древесины',
    base_price: 22,
    price_elasticity: 1.0,
    price_floor: 7,
    unit: 'воз',
    category: 'raw_material',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'lumber_camp',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🪵',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
  },

  wool: {
    name: 'Шерсть',
    name_gen: 'шерсти',
    base_price: 20,
    price_elasticity: 0.9,
    price_floor: 6,
    unit: 'тюк',
    category: 'raw_material',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'ranch',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🧶',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
  },

  salt: {
    name: 'Соль',
    name_gen: 'соли',
    base_price: 18,
    price_elasticity: 1.3,   // монополия, но жизненно необходима
    price_floor: 5,
    unit: 'мешок',
    category: 'raw_material',
    resource_type: 'deposit',
    deposit_key: 'salt_deposit',   // солевые копи или испарительные чаши
    requires_building: 'salt_works',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🧂',
    market_category: 'raw_material',
    stockpile_target_turns: 5,
  },

  papyrus: {
    name: 'Папирус',
    name_gen: 'папируса',
    base_price: 38,
    price_elasticity: 0.7,
    price_floor: 11,
    unit: 'свиток',
    category: 'raw_material',
    resource_type: 'deposit',
    deposit_key: 'papyrus_bed',   // нильские заросли папируса
    requires_building: 'papyrus_bed',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '📜',
    market_category: 'raw_material',
    stockpile_target_turns: 3,
  },

  wax: {
    name: 'Воск',
    name_gen: 'воска',
    base_price: 25,
    price_elasticity: 0.8,
    price_floor: 8,
    unit: 'фунт',
    category: 'raw_material',
    resource_type: 'biome',
    deposit_key: null,
    requires_building: 'ranch',   // пасека
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🕯️',
    market_category: 'raw_material',
    stockpile_target_turns: 3,
  },

  // ── СЫРЬЁ — ЛОКАЦИОННОЕ ──────────────────────────────────────────────────

  iron: {
    name: 'Железо',
    name_gen: 'железа',
    base_price: 45,
    price_elasticity: 1.1,
    price_floor: 14,
    unit: 'талант',
    category: 'metal',
    resource_type: 'deposit',
    deposit_key: 'iron_ore',
    requires_building: 'iron_mine',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '⚙️',
    market_category: 'metal',
    stockpile_target_turns: 4,
  },

  copper: {
    name: 'Медь',
    name_gen: 'меди',
    base_price: 35,
    price_elasticity: 0.9,
    price_floor: 11,
    unit: 'талант',
    category: 'metal',
    resource_type: 'deposit',
    deposit_key: 'copper_ore',   // Кипр (cuprum) — главный источник
    requires_building: 'copper_mine',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🪙',
    market_category: 'metal',
    stockpile_target_turns: 4,
  },

  sulfur: {
    name: 'Сера',
    name_gen: 'серы',
    base_price: 40,
    price_elasticity: 0.9,
    price_floor: 12,
    unit: 'мешок',
    category: 'raw_material',
    resource_type: 'deposit',
    deposit_key: 'sulfur_deposit',   // Сицилия, Эолийские острова — крупнейший источник
    requires_building: 'sulfur_mine',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🟡',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
  },

  silver: {
    name: 'Серебро',
    name_gen: 'серебра',
    base_price: 50,
    price_elasticity: 0.4,   // денежный металл — почти не реагирует на локальный рынок
    price_floor: 15,
    unit: 'кг',
    category: 'precious',
    resource_type: 'deposit',
    deposit_key: 'silver_ore',   // Лаврион (Аттика), Иберия, Дакия
    requires_building: 'silver_mine',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🥈',
    market_category: 'precious',
    stockpile_target_turns: 8,
  },

  gold: {
    name: 'Золото',
    name_gen: 'золота',
    base_price: 500,   // ×50 к пшенице
    price_elasticity: 0.3,   // почти не реагирует на локальный рынок
    price_floor: 150,
    unit: 'кг',
    category: 'precious',
    resource_type: 'deposit',
    deposit_key: 'gold_ore',   // Македония (Пангей), Нубия, Иберия
    requires_building: 'gold_mine',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🥇',
    market_category: 'precious',
    stockpile_target_turns: 12,
  },

  // ── ТОЛЬКО ИМПОРТ ────────────────────────────────────────────────────────

  tin: {
    name: 'Олово',
    name_gen: 'олова',
    base_price: 80,
    price_elasticity: 0.8,
    price_floor: 24,
    unit: 'кг',
    category: 'metal',
    resource_type: 'deposit',      // Иберия, Корнуолл, Бретань
    deposit_key: 'tin_ore',
    requires_building: 'tin_mine',
    is_food: false,
    is_grain: false,
    producers: ['miners'],
    icon: '⬜',
    market_category: 'metal',
    stockpile_target_turns: 6,
  },

  amber: {
    name: 'Янтарь',
    name_gen: 'янтаря',
    base_price: 200,
    price_elasticity: 0.5,
    price_floor: 60,
    unit: 'кг',
    category: 'luxury',
    resource_type: 'deposit',      // Балтийское побережье: Пруссия, Самбия, Ютландия
    deposit_key: 'amber_beds',
    requires_building: 'amber_gathering',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🟠',
    market_category: 'luxury',
    stockpile_target_turns: 2,
  },

  furs: {
    name: 'Меха',
    name_gen: 'мехов',
    base_price: 80,
    price_elasticity: 0.6,
    price_floor: 24,
    unit: 'кг',
    category: 'luxury',
    resource_type: 'deposit',      // арктические и таёжные леса: Скифия, Германия, Дакия
    deposit_key: 'fur_grounds',
    requires_building: 'fur_trapping',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🦊',
    market_category: 'luxury',
    stockpile_target_turns: 3,
  },

  incense: {
    name: 'Благовония',
    name_gen: 'благовоний',
    base_price: 85,
    price_elasticity: 0.6,
    price_floor: 26,
    unit: 'амфора',
    category: 'luxury',
    resource_type: 'deposit',      // Аравия Феликс (ладан), Сомали (мирра)
    deposit_key: 'incense_trees',
    requires_building: 'incense_grove',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🌿',
    market_category: 'luxury',
    stockpile_target_turns: 2,
  },

  // ── ПЕРЕРАБОТАННЫЕ ───────────────────────────────────────────────────────

  bronze: {
    name: 'Бронза',
    name_gen: 'бронзы',
    base_price: 55,
    price_elasticity: 0.9,
    price_floor: 17,
    unit: 'талант',
    category: 'metal_processed',
    resource_type: 'processed',   // медь (90%) + олово (10%) → плавка
    deposit_key: null,
    requires_building: 'workshop',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🔔',
    market_category: 'metal',
    stockpile_target_turns: 4,
  },

  charcoal: {
    name: 'Древесный уголь',
    name_gen: 'древесного угля',
    base_price: 12,
    price_elasticity: 1.1,   // топливо для металлургии — стратегический дефицит
    price_floor: 4,
    unit: 'кг',
    category: 'raw_material',
    resource_type: 'processed',   // обжиг древесины; ~5 кг угля на 1 кг железа
    deposit_key: null,
    requires_building: 'lumber_camp',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen', 'farmers'],
    icon: '⬛',
    market_category: 'raw_material',
    stockpile_target_turns: 4,
  },

  cloth: {
    name: 'Ткань',
    name_gen: 'ткани',
    base_price: 28,
    price_elasticity: 0.9,
    price_floor: 8,
    unit: 'тюк',
    category: 'goods_processed',
    resource_type: 'processed',   // шерсть / лён → ткацкий станок
    deposit_key: null,
    requires_building: 'workshop',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🧵',
    market_category: 'goods_processed',
    stockpile_target_turns: 3,
  },

  leather: {
    name: 'Кожа',
    name_gen: 'кожи',
    base_price: 28,
    price_elasticity: 0.9,
    price_floor: 8,
    unit: 'тюк',
    category: 'goods_processed',
    resource_type: 'processed',   // шкуры → дубление (с серой или дубовой корой)
    deposit_key: null,
    requires_building: 'workshop',
    is_food: false,
    is_grain: false,
    producers: ['farmers', 'craftsmen'],
    icon: '🥾',
    market_category: 'goods_processed',
    stockpile_target_turns: 4,
  },

  pottery: {
    name: 'Керамика',
    name_gen: 'керамики',
    base_price: 15,
    price_elasticity: 0.8,
    price_floor: 5,
    unit: 'партия',
    category: 'goods_processed',
    resource_type: 'processed',   // глина → гончарный круг и обжиговая печь
    deposit_key: null,
    requires_building: 'workshop',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🏺',
    market_category: 'goods_processed',
    stockpile_target_turns: 3,
  },

  tools: {
    name: 'Инструменты',
    name_gen: 'инструментов',
    base_price: 35,
    price_elasticity: 0.8,
    price_floor: 11,
    unit: 'комплект',
    category: 'goods_processed',
    resource_type: 'processed',   // железо/бронза → кузница
    deposit_key: null,
    requires_building: 'workshop',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🔨',
    market_category: 'goods_processed',
    stockpile_target_turns: 3,
  },

  weapons: {
    name: 'Оружие',
    name_gen: 'оружия',
    base_price: 120,
    price_elasticity: 0.7,
    price_floor: 36,
    unit: 'комплект',
    category: 'military',
    resource_type: 'processed',   // железо/бронза + дерево → оружейня
    deposit_key: null,
    requires_building: 'armory',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '⚔️',
    market_category: 'military',
    stockpile_target_turns: 6,
  },

  armor: {
    name: 'Доспехи',
    name_gen: 'доспехов',
    base_price: 200,
    price_elasticity: 0.6,
    price_floor: 60,
    unit: 'комплект',
    category: 'military',
    resource_type: 'processed',   // ~25 кг металла на один полный комплект
    deposit_key: null,
    requires_building: 'armory',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🛡️',
    market_category: 'military',
    stockpile_target_turns: 8,
  },

  stone: {
    name: 'Камень',
    name_gen: 'камня',
    base_price: 5,
    price_elasticity: 0.7,
    price_floor: 2,
    unit: 'кг',
    category: 'raw_material',
    resource_type: 'deposit',
    deposit_key: 'stone_quarry',   // каменоломня — привязана к рельефу
    requires_building: 'quarry',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '🪨',
    market_category: 'raw_material',
    stockpile_target_turns: 3,
  },

  hemp: {
    name: 'Пенька',
    name_gen: 'пеньки',
    base_price: 18,
    price_elasticity: 0.9,
    price_floor: 5,
    unit: 'кг',
    category: 'raw_material',
    resource_type: 'biome',   // конопля — речные долины и прибрежные равнины
    deposit_key: null,
    requires_building: 'farm',
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🌿',
    market_category: 'raw_material',
    stockpile_target_turns: 4,   // без пеньки нет канатов → нет флота
  },

  pitch: {
    name: 'Смола',
    name_gen: 'смолы',
    base_price: 25,
    price_elasticity: 1.0,
    price_floor: 8,
    unit: 'кг',
    category: 'raw_material',
    resource_type: 'processed',   // смолокурня из хвойной древесины
    deposit_key: null,
    requires_building: 'lumber_camp',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen', 'farmers'],
    icon: '🟫',
    market_category: 'raw_material',
    stockpile_target_turns: 5,   // гидроизоляция обшивки и конопатка корабля
  },

  purple_dye: {
    name: 'Пурпур',
    name_gen: 'пурпура',
    base_price: 200,   // монопольный товар Финикии / Карфагена
    price_elasticity: 0.4,   // люкс — богатые платят любую цену
    price_floor: 60,
    unit: 'фунт',
    category: 'luxury',
    resource_type: 'deposit',
    deposit_key: 'murex_beds',   // раковины мурекса — только Финикийское побережье
    requires_building: 'dye_works',
    is_food: false,
    is_grain: false,
    producers: ['craftsmen'],
    icon: '💜',
    market_category: 'luxury',
    stockpile_target_turns: 2,
  },

  war_elephants: {
    name: 'Боевые слоны',
    name_gen: 'боевых слонов',
    base_price: 8000,
    price_elasticity: 0.3,   // штучный стратегический товар
    price_floor: 2400,
    unit: 'голова',
    category: 'military',
    resource_type: 'livestock',   // саванна (Африка) и субтропики (Индия)
    deposit_key: null,
    requires_building: null,   // только торговля или захват
    is_food: false,
    is_grain: false,
    producers: ['merchants'],
    icon: '🐘',
    market_category: 'military',
    stockpile_target_turns: 12,
  },

  // ── ЖИВЫЕ РЕСУРСЫ ────────────────────────────────────────────────────────

  horses: {
    name: 'Лошади',
    name_gen: 'лошадей',
    base_price: 120,
    price_elasticity: 0.55,
    price_floor: 36,
    unit: 'голова',
    category: 'livestock',
    resource_type: 'livestock',
    deposit_key: null,
    requires_building: null,   // конный завод строится через soldiers_class
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🐎',
    market_category: 'livestock',
    stockpile_target_turns: 8,
  },

  cattle: {
    name: 'Крупный рогатый скот',
    name_gen: 'скота',
    base_price: 70,
    price_elasticity: 0.6,
    price_floor: 21,
    unit: 'голова',
    category: 'livestock',
    resource_type: 'livestock',
    deposit_key: null,
    requires_building: null,   // пастбище через farmers_class
    is_food: false,
    is_grain: false,
    producers: ['farmers'],
    icon: '🐂',
    market_category: 'livestock',
    stockpile_target_turns: 8,
  },

  slaves: {
    name: 'Рабы',
    name_gen: 'рабов',
    base_price: 80,   // военный захват снижает цену вдвое; базово = 80
    price_elasticity: 0.7,
    price_floor: 24,
    unit: 'человек',
    category: 'labor',
    resource_type: 'livestock',
    deposit_key: null,
    requires_building: null,   // военный захват или работорговля
    is_food: false,
    is_grain: false,
    producers: ['merchants'],
    icon: '⛓️',
    market_category: 'labor',
    stockpile_target_turns: 2,
  },

  // ── ТРАНЗИТ ───────────────────────────────────────────────────────────────

  trade_goods: {
    name: 'Торговые товары',
    name_gen: 'торговых товаров',
    base_price: 25,
    price_elasticity: 0.8,
    price_floor: 8,
    unit: 'партия',
    category: 'trade',
    resource_type: 'processed',   // смешанные мелкие товары через торговый порт
    deposit_key: null,
    requires_building: 'port',
    is_food: false,
    is_grain: false,
    producers: ['merchants', 'sailors'],
    icon: '🎁',
    market_category: 'trade_hub',
    stockpile_target_turns: 3,
  },

};

// Производство каждого региона по типу местности.
// Коэффициенты показывают единиц товара на 1000 жителей данной профессии.
// Используется как fallback; биомные регионы работают через BIOME_META.goods_bonus.
const REGION_PRODUCTION_BASE = {
  coastal_city: {
    fish:        { per: 'sailors',   rate: 120 },
    cloth:       { per: 'craftsmen', rate: 70  },
    tools:       { per: 'craftsmen', rate: 40  },
    wine:        { per: 'craftsmen', rate: 30  },
    salt:        { per: 'craftsmen', rate: 50  },
    pottery:     { per: 'craftsmen', rate: 60  },
    bronze:      { per: 'craftsmen', rate: 20  },
    leather:     { per: 'craftsmen', rate: 30  },
    trade_goods: { per: 'merchants', rate: 25  },
  },
  plains: {
    wheat:     { per: 'farmers',   rate: 200 },
    barley:    { per: 'farmers',   rate: 80  },
    olives:    { per: 'farmers',   rate: 50  },
    timber:    { per: 'farmers',   rate: 30  },
    wool:      { per: 'farmers',   rate: 40  },
    leather:   { per: 'farmers',   rate: 20  },
    honey:     { per: 'farmers',   rate: 15  },
    wax:       { per: 'farmers',   rate: 10  },
    olive_oil: { per: 'farmers',   rate: 30  },
  },
  hills: {
    wheat:     { per: 'farmers',   rate: 100 },
    barley:    { per: 'farmers',   rate: 60  },
    olives:    { per: 'farmers',   rate: 90  },
    olive_oil: { per: 'farmers',   rate: 50  },
    wine:      { per: 'craftsmen', rate: 70  },
    iron:      { per: 'craftsmen', rate: 40  },
    wool:      { per: 'farmers',   rate: 30  },
    honey:     { per: 'farmers',   rate: 20  },
    pottery:   { per: 'craftsmen', rate: 30  },
  },
  mountains: {
    iron:      { per: 'craftsmen', rate: 80  },
    bronze:    { per: 'craftsmen', rate: 30  },
    timber:    { per: 'farmers',   rate: 70  },
    tools:     { per: 'craftsmen', rate: 25  },
    barley:    { per: 'farmers',   rate: 40  },
    wool:      { per: 'farmers',   rate: 50  },
    wax:       { per: 'farmers',   rate: 12  },
    stone:     { per: 'craftsmen', rate: 60  },
  },
  river_valley: {
    wheat:     { per: 'farmers',   rate: 260 },
    barley:    { per: 'farmers',   rate: 100 },
    cloth:     { per: 'craftsmen', rate: 80  },
    papyrus:   { per: 'farmers',   rate: 25  },
    olive_oil: { per: 'farmers',   rate: 20  },
    honey:     { per: 'farmers',   rate: 18  },
    wax:       { per: 'farmers',   rate: 14  },
    pottery:   { per: 'craftsmen', rate: 40  },
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
    production_cost:  null,        // заполняется движком рецептов
    price_floor:      good.price_floor ?? base * 0.3,
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
// Связь товаров с производящими зданиями.
// produced_by[goodId] — массив building_id, чьи production_output
// включают этот товар. Позволяет навигировать «от товара к зданию»
// без перебора всего BUILDINGS. Заполняется один раз при загрузке.
// ══════════════════════════════════════════════════════════════
(function _addProducedBy() {
  const MAP = {
    // ── ЕДА ─────────────────────────────────────────────────────────────────
    wheat:        ['farm', 'latifundium', 'grain_estate'],
    barley:       ['farm', 'grain_estate'],
    fish:         ['port'],
    tuna:         ['tuna_trap'],
    garum:        ['workshop'],           // рыба + соль → ферментация
    meat:         ['ranch', 'latifundium'],
    olives:       ['latifundium', 'farm'],
    olive_oil:    ['oil_press'],
    wine:         ['winery'],
    honey:        ['ranch'],
    // ── СЫРЬЁ — БИОМНОЕ ──────────────────────────────────────────────────────
    timber:       ['lumber_camp'],
    wool:         ['ranch'],
    salt:         ['salt_works'],
    papyrus:      ['papyrus_bed'],
    wax:          ['ranch'],
    // ── СЫРЬЁ — ЛОКАЦИОННОЕ (месторождения) ──────────────────────────────────
    iron:         ['iron_mine'],
    copper:       ['copper_mine'],
    sulfur:       ['sulfur_mine'],
    silver:       ['silver_mine'],
    gold:         ['gold_mine'],
    // ── ПЕРЕРАБОТАННЫЕ ───────────────────────────────────────────────────────
    bronze:       ['workshop'],           // медь + олово → плавка
    charcoal:     ['lumber_camp'],        // обжиг древесины
    cloth:        ['workshop'],
    leather:      ['ranch', 'workshop'],
    pottery:      ['workshop', 'pottery_workshop'],
    tools:        ['workshop'],
    weapons:      ['armory'],
    armor:        ['armory'],
    stone:        ['quarry'],
    hemp:         ['farm'],
    pitch:        ['lumber_camp'],        // смолокурня из хвойной древесины
    purple_dye:   ['dye_works'],
    // ── ТРАНЗИТ ──────────────────────────────────────────────────────────────
    trade_goods:  ['port'],
    // ── ТОЛЬКО ИМПОРТ — не производятся зданиями ─────────────────────────────
    // tin, amber, furs, incense: только торговые маршруты
    // ── ЖИВЫЕ РЕСУРСЫ — разведение или захват ────────────────────────────────
    // horses: конный завод (soldiers_class)
    // cattle: пастбище (farmers_class)
    // slaves: военный захват или работорговля
  };
  for (const [goodId, bldIds] of Object.entries(MAP)) {
    if (GOODS[goodId]) GOODS[goodId].produced_by = bldIds;
  }
  for (const goodId of Object.keys(GOODS)) {
    if (!GOODS[goodId].produced_by) GOODS[goodId].produced_by = [];
  }
})();
