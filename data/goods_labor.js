// ═══════════════════════════════════════════════════════════════════
// GOODS_LABOR — исторически обоснованные трудовые и калибровочные
//               ограничения для каждого товара (304 BC, весь мир).
//
// Используется:
//   agents/calibrator.js — проверка и коррекция output_per_turn
//   agents/validator.js  — проверка slave_ratio и классов
//   agents/prompts.js    — подсказки для buildLaborPrompt
//
// Поля:
//   primary_classes     — допустимые ID классов как primary_class
//   secondary_classes   — допустимые ID классов как secondary_class (null = без надсмотрщика)
//   min_slave_ratio     — исторический минимум доли рабов
//   max_slave_ratio     — исторический максимум доли рабов
//   ownership_tendency  — типичный владелец по умолчанию
//   base_output_per_turn  — базовый выпуск на одно здание в ход (ед. товара)
//   workers_per_building  — количество рабочих на одно здание
//   notes               — источники/обоснование
// ═══════════════════════════════════════════════════════════════════

var GOODS_LABOR = {

  // ── ЗЕРНОВЫЕ ────────────────────────────────────────────────────

  wheat: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   ['farmers_class', null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.60,
    ownership_tendency:  'farmers_class',
    base_output_per_turn: 2000,
    workers_per_building: 8,
    notes: 'Египет/Сицилия: мелкое крестьянство + арендаторы + рабы. Карфаген: рабовладельческие латифундии. Персия/Индия: свободные общинники.'
  },

  barley: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   ['farmers_class', null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.55,
    ownership_tendency:  'farmers_class',
    base_output_per_turn: 1800,
    workers_per_building: 8,
    notes: 'Менее трудоёмок чем пшеница, растёт на маргинальных землях. Основной корм скота.'
  },

  fish: {
    primary_classes:     ['sailors_class', 'freedmen'],
    secondary_classes:   ['sailors_class', null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.15,
    ownership_tendency:  'citizens',
    base_output_per_turn: 500,
    workers_per_building: 5,
    notes: 'Рыболовство — профессиональное ремесло свободных. Рабы редки из-за навыков управления судном.'
  },

  tuna: {
    primary_classes:     ['sailors_class', 'citizens'],
    secondary_classes:   ['citizens', null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.10,
    ownership_tendency:  'citizens',
    base_output_per_turn: 300,
    workers_per_building: 6,
    notes: 'Ловля тунца — сезонная, коллективная. Требует навигационного опыта.'
  },

  olives: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   ['farmers_class', null],
    min_slave_ratio:     0.20,
    max_slave_ratio:     0.60,
    ownership_tendency:  'aristocrats',
    base_output_per_turn: 800,
    workers_per_building: 7,
    notes: 'Маслиновые сады — аристократические поместья с рабским трудом (Греция, Рим, Карфаген). Уборка урожая сезонная.'
  },

  wine: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   ['craftsmen_class', null],
    min_slave_ratio:     0.20,
    max_slave_ratio:     0.55,
    ownership_tendency:  'aristocrats',
    base_output_per_turn: 600,
    workers_per_building: 6,
    notes: 'Виноградники требуют многолетнего ухода. Сбор — интенсивный сезонный труд рабов.'
  },

  honey: {
    primary_classes:     ['farmers_class', 'craftsmen_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.10,
    ownership_tendency:  'farmers_class',
    base_output_per_turn: 150,
    workers_per_building: 2,
    notes: 'Пчеловодство — малотрудоёмко, специализированный навык. Рабы редки.'
  },

  // ── ПЕРЕРАБОТАННАЯ ЕДА ──────────────────────────────────────────

  olive_oil: {
    primary_classes:     ['craftsmen_class', 'slaves_class'],
    secondary_classes:   ['craftsmen_class', null],
    min_slave_ratio:     0.15,
    max_slave_ratio:     0.40,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 250,
    workers_per_building: 4,
    notes: 'Прессовка — механический труд, часто рабский. Мастер-техник обычно свободный.'
  },

  meat: {
    primary_classes:     ['craftsmen_class', 'freedmen'],
    secondary_classes:   [null],
    min_slave_ratio:     0.05,
    max_slave_ratio:     0.20,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 300,
    workers_per_building: 3,
    notes: 'Мясники — свободные ремесленники. Забой скота требует специфики, рабы редки.'
  },

  garum: {
    primary_classes:     ['slaves_class', 'freedmen'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.35,
    max_slave_ratio:     0.70,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 200,
    workers_per_building: 5,
    notes: 'Производство гарума — тяжёлый запах, непрестижный труд. Доминируют рабы. Мастер-рецептуар свободный.'
  },

  wax: {
    primary_classes:     ['craftsmen_class', 'farmers_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.15,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 50,
    workers_per_building: 2,
    notes: 'Воск — побочный продукт пчеловодства. Минимальный труд сверх апиарного.'
  },

  // ── СЫРЬЁ БИОМНОЕ ───────────────────────────────────────────────

  timber: {
    primary_classes:     ['slaves_class', 'farmers_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.30,
    max_slave_ratio:     0.70,
    ownership_tendency:  'state',
    base_output_per_turn: 800,
    workers_per_building: 12,
    notes: 'Вырубка леса — изматывающий труд. Государственные лесозаготовки (Македония, Египет) + частные рабовладельцы.'
  },

  wool: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.15,
    max_slave_ratio:     0.45,
    ownership_tendency:  'farmers_class',
    base_output_per_turn: 400,
    workers_per_building: 5,
    notes: 'Скотоводство — традиционно семейный труд. Крупные стада у аристократов — рабский.'
  },

  papyrus: {
    primary_classes:     ['slaves_class', 'farmers_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.25,
    max_slave_ratio:     0.60,
    ownership_tendency:  'state',
    base_output_per_turn: 300,
    workers_per_building: 6,
    notes: 'Египетские заросли папируса — государственный ресурс Птолемеев. Обработка интенсивна.'
  },

  stone: {
    primary_classes:     ['slaves_class', 'craftsmen_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.50,
    max_slave_ratio:     0.90,
    ownership_tendency:  'state',
    base_output_per_turn: 500,
    workers_per_building: 15,
    notes: 'Каменоломни — одно из самых тяжёлых мест для рабов. Лавренские серебряники и египетские каменоломни — рекорды жестокости.'
  },

  hemp: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.45,
    ownership_tendency:  'farmers_class',
    base_output_per_turn: 600,
    workers_per_building: 6,
    notes: 'Конопля — сезонная культура, близка к зерновым по труду. Скифы: ключевые экспортёры.'
  },

  // ── ПЕРЕРАБОТКА СЫРЬЯ ───────────────────────────────────────────

  charcoal: {
    primary_classes:     ['craftsmen_class', 'slaves_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.15,
    max_slave_ratio:     0.40,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 600,
    workers_per_building: 4,
    notes: 'Углежжение — специализированный ремесленный труд. Длительный и изматывающий процесс.'
  },

  cloth: {
    primary_classes:     ['craftsmen_class', 'slaves_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.20,
    max_slave_ratio:     0.50,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 200,
    workers_per_building: 8,
    notes: 'Ткачество — исторически труд женщин-рабынь и вольных мастериц. Мастерские в городах.'
  },

  leather: {
    primary_classes:     ['craftsmen_class', 'slaves_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.20,
    max_slave_ratio:     0.45,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 150,
    workers_per_building: 5,
    notes: 'Дубление — тяжёлый химический процесс. Кожевники — презираемое, но нужное ремесло.'
  },

  pottery: {
    primary_classes:     ['craftsmen_class'],
    secondary_classes:   ['slaves_class', null],
    min_slave_ratio:     0.15,
    max_slave_ratio:     0.40,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 300,
    workers_per_building: 4,
    notes: 'Гончарство — квалифицированный труд. Мастер + ученики + несколько рабов на вспомогательных работах.'
  },

  pitch: {
    primary_classes:     ['craftsmen_class', 'slaves_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.20,
    max_slave_ratio:     0.50,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 400,
    workers_per_building: 5,
    notes: 'Смолокурение рядом с лесозаготовками. Опасный дымный процесс — типично рабский.'
  },

  // ── МЕСТОРОЖДЕНИЯ ───────────────────────────────────────────────

  iron: {
    primary_classes:     ['slaves_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.55,
    max_slave_ratio:     0.90,
    ownership_tendency:  'state',
    base_output_per_turn: 300,
    workers_per_building: 20,
    notes: 'Железные шахты — государственные или частные с принудительным трудом. Смертность рабов высока. Этрурия, Понт, Испания — крупнейшие источники.'
  },

  copper: {
    primary_classes:     ['slaves_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.55,
    max_slave_ratio:     0.85,
    ownership_tendency:  'state',
    base_output_per_turn: 200,
    workers_per_building: 18,
    notes: 'Кипрские медные шахты — этимология слова copper. Преимущественно рабский труд.'
  },

  silver: {
    primary_classes:     ['slaves_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.65,
    max_slave_ratio:     0.95,
    ownership_tendency:  'state',
    base_output_per_turn: 50,
    workers_per_building: 25,
    notes: 'Лаврийские шахты Афин: 20 000 рабов единовременно. Серебро = монетная чеканка = военная сила.'
  },

  gold: {
    primary_classes:     ['slaves_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.60,
    max_slave_ratio:     0.95,
    ownership_tendency:  'state',
    base_output_per_turn: 30,
    workers_per_building: 20,
    notes: 'Нубийское золото (Египет/Мероэ), Фракия (Македония), Испания. Почти всегда государственная монополия.'
  },

  sulfur: {
    primary_classes:     ['slaves_class', 'craftsmen_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.50,
    max_slave_ratio:     0.80,
    ownership_tendency:  'state',
    base_output_per_turn: 200,
    workers_per_building: 10,
    notes: 'Вулканическая добыча серьёзно опасна. Исключительно принудительный труд. Этна (Сицилия), Понт.'
  },

  salt: {
    primary_classes:     ['slaves_class', 'farmers_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.30,
    max_slave_ratio:     0.60,
    ownership_tendency:  'state',
    base_output_per_turn: 400,
    workers_per_building: 8,
    notes: 'Соляные промыслы — государственная монополия везде. Рим: Via Salaria. Карфаген: эвапоритные бассейны.'
  },

  purple_dye: {
    primary_classes:     ['slaves_class', 'craftsmen_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.40,
    max_slave_ratio:     0.75,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 30,
    workers_per_building: 8,
    notes: 'Раздавливание мурекса — нестерпимый запах. Карфаген/Тир держат монополию. Рабский труд на побережье.'
  },

  // ── ИМПОРТ-ТОЛЬКО ───────────────────────────────────────────────

  tin: {
    primary_classes:     ['sailors_class', 'citizens'],
    secondary_classes:   ['citizens'],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.05,
    ownership_tendency:  'citizens',
    base_output_per_turn: 100,  // торговая партия
    workers_per_building: 3,
    notes: 'Олово: Корнуолл (Британия) → Массалия → Средиземноморье. Торговля, не производство.'
  },

  amber: {
    primary_classes:     ['sailors_class', 'citizens'],
    secondary_classes:   [null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.05,
    ownership_tendency:  'citizens',
    base_output_per_turn: 50,
    workers_per_building: 2,
    notes: 'Янтарный путь: Балтика → Аквилея → Греция. Редкий предмет роскоши.'
  },

  furs: {
    primary_classes:     ['sailors_class', 'citizens'],
    secondary_classes:   [null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.05,
    ownership_tendency:  'citizens',
    base_output_per_turn: 80,
    workers_per_building: 2,
    notes: 'Меха скифов/фракийцев. Продаются через боспорские города.'
  },

  incense: {
    primary_classes:     ['citizens', 'sailors_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.05,
    ownership_tendency:  'citizens',
    base_output_per_turn: 60,
    workers_per_building: 2,
    notes: 'Аравийские благовония: Сабейское царство → Набатея → Египет/Левант. Торговля через посредников.'
  },

  // ── ПЕРЕРАБОТАННЫЕ: ВОЕННЫЕ ─────────────────────────────────────

  tools: {
    primary_classes:     ['craftsmen_class'],
    secondary_classes:   ['slaves_class', null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.30,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 200,
    workers_per_building: 5,
    notes: 'Кузнечное дело — высокоспециализированный ремесленный труд. Мастер-кузнец свободный, подмастерья смешанные.'
  },

  weapons: {
    primary_classes:     ['craftsmen_class'],
    secondary_classes:   ['slaves_class', null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.30,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 150,
    workers_per_building: 6,
    notes: 'Оружейники — престижный ремесленный труд. Военные заказы от государства. Рабы на грубых операциях.'
  },

  armor: {
    primary_classes:     ['craftsmen_class'],
    secondary_classes:   ['slaves_class', null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.25,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 80,
    workers_per_building: 8,
    notes: 'Доспехи — самый трудоёмкий металлообрабатывающий продукт. Мастера-бронники высоко ценились.'
  },

  bronze: {
    primary_classes:     ['craftsmen_class'],
    secondary_classes:   ['slaves_class'],
    min_slave_ratio:     0.15,
    max_slave_ratio:     0.40,
    ownership_tendency:  'craftsmen_class',
    base_output_per_turn: 250,
    workers_per_building: 6,
    notes: 'Литейщики бронзы — специализация. Топлива много, руды из двух источников. Смешанный труд.'
  },

  trade_goods: {
    primary_classes:     ['citizens', 'sailors_class'],
    secondary_classes:   ['officials', null],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.05,
    ownership_tendency:  'citizens',
    base_output_per_turn: 1000,
    workers_per_building: 4,
    notes: 'Торговля — не производство. Купцы-граждане + государственные торговые агенты. Рабы как переносчики груза.'
  },

  // ── ЖИВЫЕ РЕСУРСЫ ───────────────────────────────────────────────

  horses: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   ['nobles', null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.35,
    ownership_tendency:  'aristocrats',
    base_output_per_turn: 20,
    workers_per_building: 6,
    notes: 'Коневодство — аристократическая деятельность. Нумидия, Скифия — профессиональные конские народы.'
  },

  cattle: {
    primary_classes:     ['farmers_class', 'slaves_class'],
    secondary_classes:   [null],
    min_slave_ratio:     0.10,
    max_slave_ratio:     0.35,
    ownership_tendency:  'farmers_class',
    base_output_per_turn: 50,
    workers_per_building: 4,
    notes: 'Скотоводство — традиционное семейное хозяйство. Крупные стада у богатых — рабский пастушеский труд.'
  },

  slaves: {
    primary_classes:     ['sailors_class', 'soldiers_class'],
    secondary_classes:   ['officials'],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.00,
    ownership_tendency:  'state',
    base_output_per_turn: 100,
    workers_per_building: 10,
    notes: 'Работорговля: война → захват → рынок (Делос). Свободный труд, организация государственная или частная.'
  },

  war_elephants: {
    primary_classes:     ['soldiers_class', 'sailors_class'],
    secondary_classes:   ['craftsmen_class'],
    min_slave_ratio:     0.00,
    max_slave_ratio:     0.10,
    ownership_tendency:  'state',
    base_output_per_turn: 5,
    workers_per_building: 15,
    notes: 'Боевые слоны — исключительно государственный ресурс. Маурьи, Птолемеи, Карфаген. Дрессура — специализация.'
  },

};
