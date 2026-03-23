// Социальные классы — структура общества 301 до н.э.
// Профессии (by_profession) определяют ПРОИЗВОДСТВО.
// Классы (SOCIAL_CLASSES) определяют ПОТРЕБЛЕНИЕ и ПОЛИТИКУ.
//
// Население каждого класса вычисляется из by_profession через
// CLASS_FROM_PROFESSION — матрицу принадлежности.

// ─────────────────────────────────────────────────────────────────────────
// МАТРИЦА: доля каждой профессии, образующей соответствующий класс
// ─────────────────────────────────────────────────────────────────────────
const CLASS_FROM_PROFESSION = {
  aristocrats:     { merchants: 0.12, craftsmen: 0.02 },
  officials:       { merchants: 0.20, clergy: 0.10 },
  clergy_class:    { clergy: 0.80 },
  citizens:        { merchants: 0.50, craftsmen: 0.22 },
  craftsmen_class: { craftsmen: 0.58, sailors: 0.06 },
  farmers_class:   { farmers: 0.82 },
  sailors_class:   { sailors: 0.74 },
  soldiers_class:  { soldiers: 0.85 },
  freedmen:        { slaves: 0.08, farmers: 0.05, craftsmen: 0.10 },
  slaves_class:    { slaves: 0.90 },
};

// ─────────────────────────────────────────────────────────────────────────
// СОЦИАЛЬНЫЕ КЛАССЫ
//
// needs[товар].per_100  — единиц товара на 100 чел. в ГОД (делится на 12 для месячного потребления)
// needs[товар].priority — 'basic' | 'standard' | 'luxury'
//   basic   → невыполнение: -20 счастья, рост смертности
//   standard→ невыполнение: -8 счастья
//   luxury  → выполнение: +10 счастья
//
// political_weight — вклад класса в итоговое счастье нации
// unhappy_threshold / happy_threshold — пороги для политических эффектов
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// ЕДИНИЦА: 1 ед = 1 кг (CONFIG.UNIT_KG).
// per_100 — кг на 100 человек в год. Движок делит на 12 для месячного расчёта.
//
// ПРИОРИТЕТЫ:
//   basic    → выживание. Отсутствие: -20 счастья, рост смертности.
//   standard → нормальный образ жизни для данного класса. Отсутствие: -8 счастья.
//   luxury   → комфорт и статус. Наличие: +10 счастья.
//
// ТОВАРЫ В ЛИЧНОМ ПОТРЕБЛЕНИИ (26 из 41):
//   еда:      wheat, barley, fish, tuna, garum, meat, olives, olive_oil, wine, honey
//   основное: salt, cloth, wool, leather, pottery, tools, iron
//   военное:  weapons, armor (только солдаты)
//   морское:  hemp (только моряки)
//   письмо:   papyrus, wax
//   роскошь:  incense, purple_dye, amber, furs, silver
//
// НЕ В ЛИЧНОМ ПОТРЕБЛЕНИИ (производственные ресурсы, деньги, активы):
//   bronze, copper, tin, charcoal, timber, stone, pitch, gold, trade_goods,
//   sulfur, cattle, horses, war_elephants, slaves
//
// Источники калибровки:
//   Зерно:   Полибий — легионер ~320 кг пшеницы/год.
//            Катон — полевой раб ~280-320 кг ячменя/год.
//   Вино:    Аристократы ~0.5 л/день = ~180 кг/год. Солдаты ~0.07 л/день.
//   Масло:   10-25 кг/год. Используется для готовки, освещения и гигиены.
//   Соль:    3-9 кг/год. Больше у тех, кто консервирует продукты (моряки).
//   Мясо:    Аристократы ~30 кг/год. Крестьяне ~2-3 кг/год (редко).
//   Гарум:   Универсальная приправа. От 0.5 кг (бедные) до 3 кг (богатые).
// ─────────────────────────────────────────────────────────────────────────
const SOCIAL_CLASSES = {

  // ── АРИСТОКРАТЫ ────────────────────────────────────────────────────────
  // Сидячий труд, ~2000 ккал/день. Зерна мало — калории покрывают мясо,
  // вино, масло, рыба. Главные потребители статусных товаров (пурпур, янтарь).
  // per_100 / год: 150 кг пшеницы, 200 л вина, 30 кг мяса, 25 кг масла.
  aristocrats: {
    name:          'Аристократы',
    name_gen:      'аристократов',
    icon:          '👑',
    description:   'Землевладельцы, полководцы, богатые граждане. Владеют землёй и рабами.',
    color:         '#9C27B0',
    wealth_level:  5,
    political_weight: 0.20,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 15_000, priority: 'basic',    label: 'Пшеница' },
      salt:        { per_100:    600, priority: 'basic',    label: 'Соль' },
      // ── стандартные ──────────────────────────────────────────────────
      wine:        { per_100: 20_000, priority: 'standard', label: 'Вино' },          // 200 л/чел/год
      olive_oil:   { per_100:  2_500, priority: 'standard', label: 'Оливковое масло' }, // готовка, бани, лампы
      meat:        { per_100:  3_000, priority: 'standard', label: 'Мясо' },           // регулярный стол
      fish:        { per_100:  1_000, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    300, priority: 'standard', label: 'Гарум' },
      olives:      { per_100:  1_000, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    800, priority: 'standard', label: 'Ткань' },           // несколько тонких одеяний
      leather:     { per_100:    300, priority: 'standard', label: 'Кожа' },
      pottery:     { per_100:    500, priority: 'standard', label: 'Керамика' },
      papyrus:     { per_100:    200, priority: 'standard', label: 'Папирус' },
      wax:         { per_100:    100, priority: 'standard', label: 'Воск' },
      // ── роскошь ──────────────────────────────────────────────────────
      tuna:        { per_100:    500, priority: 'luxury',   label: 'Тунец' },
      honey:       { per_100:    150, priority: 'luxury',   label: 'Мёд' },
      incense:     { per_100:     50, priority: 'luxury',   label: 'Благовония' },
      purple_dye:  { per_100:      5, priority: 'luxury',   label: 'Пурпур' },          // единицы одеяний
      amber:       { per_100:     50, priority: 'luxury',   label: 'Янтарь' },
      furs:        { per_100:    100, priority: 'luxury',   label: 'Меха' },
      silver:      { per_100:     50, priority: 'luxury',   label: 'Серебро' },         // украшения, посуда
    },
    unhappy_effects: {
      conspiracy_chance_mod: +0.12,
      legitimacy_mod: -1,
    },
    happy_effects: {
      tax_efficiency_mod: +0.05,
      legitimacy_mod: +0.5,
    },
    // ── НОВЫЕ ПОЛЯ ───────────────────────────────────────────────────────────
    can_work_in: {
      primary:   [],   // аристократы не работают руками
      secondary: ['barracks'],   // военное командование
      forbidden: [
        'forge', 'iron_mine', 'copper_mine', 'silver_mine', 'gold_mine',
        'tin_mine', 'sulfur_mine', 'quarry', 'mine',
        'charcoal_kiln', 'lumber_camp', 'salt_works', 'pottery_workshop',
        'textile_mill', 'tannery', 'bronze_foundry', 'garum_workshop',
        'butchery', 'fishery', 'dye_works', 'pitch_works',
        'amber_gathering', 'fur_trapping', 'incense_grove',
      ],
    },
    ownership_rights: {
      can_own: [
        'wheat_latifundium', 'wheat_villa', 'horse_ranch', 'cattle_farm',
        'silver_mine', 'gold_mine', 'iron_mine', 'copper_mine',
        'winery', 'oil_press', 'market', 'olive_grove',
      ],
      can_build:  ['wheat_latifundium', 'wheat_villa'],
      max_owned:  null,
    },
    political_actions: {
      can_vote:          true,
      can_hold_office:   true,
      can_lead_army:     true,
      can_conspire:      true,
      rebellion_trigger: 30,
      rebellion_type:    'coup',
      pressure_actions:  [
        'reduce_tax_demand',
        'block_legislation',
        'fund_rival_faction',
        'withdraw_military_support',
        'bribe_officials',
      ],
    },
  },

  // ── ЧИНОВНИКИ ──────────────────────────────────────────────────────────
  // Лёгкий труд (~2300 ккал/день). 200 кг пшеницы + 100 л вина + 18 кг масла.
  // Высокий расход папируса (5 кг/чел/год) и воска — профессиональная необходимость.
  officials: {
    name:          'Чиновники',
    name_gen:      'чиновников',
    icon:          '📜',
    description:   'Налоговые сборщики, судьи, писцы, городские магистраты.',
    color:         '#5C6BC0',
    wealth_level:  4,
    political_weight: 0.12,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 20_000, priority: 'basic',    label: 'Пшеница' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      // ── стандартные ──────────────────────────────────────────────────
      wine:        { per_100: 10_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_800, priority: 'standard', label: 'Оливковое масло' },
      meat:        { per_100:  2_000, priority: 'standard', label: 'Мясо' },
      fish:        { per_100:    800, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    200, priority: 'standard', label: 'Гарум' },
      olives:      { per_100:    800, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    600, priority: 'standard', label: 'Ткань' },
      leather:     { per_100:    200, priority: 'standard', label: 'Кожа' },
      papyrus:     { per_100:    500, priority: 'standard', label: 'Папирус' },        // учёт, переписка
      wax:         { per_100:    200, priority: 'standard', label: 'Воск' },           // печати, таблички
      pottery:     { per_100:    300, priority: 'standard', label: 'Керамика' },
      // ── роскошь ──────────────────────────────────────────────────────
      tuna:        { per_100:    200, priority: 'luxury',   label: 'Тунец' },
      honey:       { per_100:     80, priority: 'luxury',   label: 'Мёд' },
      incense:     { per_100:     30, priority: 'luxury',   label: 'Благовония' },
      amber:       { per_100:     30, priority: 'luxury',   label: 'Янтарь' },
      furs:        { per_100:     50, priority: 'luxury',   label: 'Меха' },
    },
    unhappy_effects: {
      tax_efficiency_mod: -0.10,
      conspiracy_chance_mod: +0.05,
    },
    happy_effects: {
      tax_efficiency_mod: +0.08,
    },
    // ── НОВЫЕ ПОЛЯ ───────────────────────────────────────────────────────────
    can_work_in: {
      primary:   ['forum', 'market', 'granary', 'warehouse', 'port', 'slave_market'],
      secondary: ['temple', 'school'],
      forbidden: [
        'forge', 'iron_mine', 'copper_mine', 'silver_mine', 'gold_mine',
        'tin_mine', 'sulfur_mine', 'quarry', 'mine',
        'charcoal_kiln', 'lumber_camp', 'salt_works',
        'textile_mill', 'tannery', 'bronze_foundry', 'butchery',
        'fishery', 'garum_workshop', 'dye_works',
        'wheat_family_farm', 'wheat_villa', 'wheat_latifundium',
        'cattle_farm', 'horse_ranch', 'ranch',
      ],
    },
    ownership_rights: {
      can_own:   ['market', 'warehouse'],
      can_build: [],
      max_owned: 2,
    },
    political_actions: {
      can_vote:          true,
      can_hold_office:   true,
      can_lead_army:     false,
      can_conspire:      true,
      rebellion_trigger: 25,
      rebellion_type:    'assassination',
      pressure_actions:  [
        'slow_tax_collection',
        'falsify_records',
        'leak_information',
        'obstruct_permits',
      ],
    },
  },

  // ── ЖРЕЧЕСТВО ──────────────────────────────────────────────────────────
  // Сидячий труд, ~2000 ккал/день. Масло и вино — ритуальное использование.
  // Главный потребитель благовоний (5 кг/чел/год — ежедневные курения в храмах)
  // и воска (ритуальные свечи, обеты). Жрецы получают долю жертвенного мяса.
  clergy_class: {
    name:          'Жречество',
    name_gen:      'жречества',
    icon:          '🏛',
    description:   'Жрецы, оракулы, храмовые служители. Посредники между богами и людьми.',
    color:         '#FF8F00',
    wealth_level:  3,
    political_weight: 0.10,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 20_000, priority: 'basic',    label: 'Пшеница' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      // ── стандартные ──────────────────────────────────────────────────
      olive_oil:   { per_100:  2_000, priority: 'standard', label: 'Оливковое масло' }, // ритуал + личное
      wine:        { per_100:  8_000, priority: 'standard', label: 'Вино (обряды)' },
      meat:        { per_100:  1_500, priority: 'standard', label: 'Мясо' },            // жертвенные доли
      fish:        { per_100:    800, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    200, priority: 'standard', label: 'Гарум' },
      olives:      { per_100:    800, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    500, priority: 'standard', label: 'Ткань' },
      leather:     { per_100:    150, priority: 'standard', label: 'Кожа' },            // сандалии, ритуальная обувь
      incense:     { per_100:    500, priority: 'standard', label: 'Благовония' },      // ежедневные курения
      papyrus:     { per_100:    300, priority: 'standard', label: 'Папирус' },         // священные тексты
      wax:         { per_100:    300, priority: 'standard', label: 'Воск' },            // свечи, обеты
      pottery:     { per_100:    300, priority: 'standard', label: 'Керамика' },
      // ── роскошь ──────────────────────────────────────────────────────
      honey:       { per_100:     80, priority: 'luxury',   label: 'Мёд' },
      tuna:        { per_100:    200, priority: 'luxury',   label: 'Тунец' },
      amber:       { per_100:     20, priority: 'luxury',   label: 'Янтарь' },          // вотивные дары
      furs:        { per_100:     30, priority: 'luxury',   label: 'Меха' },
    },
    unhappy_effects: {
      happiness_base_mod: -5,
      conspiracy_chance_mod: +0.04,
    },
    happy_effects: {
      happiness_base_mod: +5,
    },
    // ── НОВЫЕ ПОЛЯ ───────────────────────────────────────────────────────────
    can_work_in: {
      primary:   ['temple'],
      secondary: ['school', 'aqueduct'],
      forbidden: [
        'barracks', 'walls', 'forge', 'iron_mine', 'copper_mine',
        'silver_mine', 'gold_mine', 'tin_mine', 'sulfur_mine',
        'quarry', 'mine', 'charcoal_kiln', 'lumber_camp',
        'salt_works', 'textile_mill', 'tannery', 'bronze_foundry',
        'garum_workshop', 'butchery', 'fishery', 'dye_works',
        'wheat_latifundium', 'cattle_farm',
      ],
    },
    ownership_rights: {
      can_own:   ['temple'],
      can_build: ['temple'],
      max_owned: null,
    },
    political_actions: {
      can_vote:          false,
      can_hold_office:   false,
      can_lead_army:     false,
      can_conspire:      true,
      rebellion_trigger: 20,
      rebellion_type:    'riot',
      pressure_actions:  [
        'religious_unrest',
        'prophecy_against_ruler',
        'refuse_rituals',
        'call_for_sacrifice',
        'excommunicate_official',
      ],
    },
  },

  // ── СВОБОДНЫЕ ГРАЖДАНЕ ─────────────────────────────────────────────────
  // Лёгкий труд (~2300 ккал/день). 180 кг пшеницы + 80 кг ячменя.
  // Рыба — регулярный продукт: 15 кг/чел/год. Вино — норма, не роскошь.
  citizens: {
    name:          'Свободные граждане',
    name_gen:      'свободных граждан',
    icon:          '🏪',
    description:   'Торговцы, зажиточные ремесленники, мелкие землевладельцы.',
    color:         '#26A69A',
    wealth_level:  3,
    political_weight: 0.18,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 18_000, priority: 'basic',    label: 'Пшеница' },
      barley:      { per_100:  8_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      // ── стандартные ──────────────────────────────────────────────────
      wine:        { per_100:  6_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_500, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_500, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    200, priority: 'standard', label: 'Гарум' },
      meat:        { per_100:  1_000, priority: 'standard', label: 'Мясо' },
      olives:      { per_100:    800, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    400, priority: 'standard', label: 'Ткань' },
      leather:     { per_100:    150, priority: 'standard', label: 'Кожа' },
      pottery:     { per_100:    400, priority: 'standard', label: 'Керамика' },
      tools:       { per_100:    200, priority: 'standard', label: 'Инструменты' },
      papyrus:     { per_100:    100, priority: 'standard', label: 'Папирус' },
      // ── роскошь ──────────────────────────────────────────────────────
      tuna:        { per_100:    100, priority: 'luxury',   label: 'Тунец' },
      honey:       { per_100:     60, priority: 'luxury',   label: 'Мёд' },
      wax:         { per_100:     50, priority: 'luxury',   label: 'Воск' },
      incense:     { per_100:     20, priority: 'luxury',   label: 'Благовония' },
      furs:        { per_100:     30, priority: 'luxury',   label: 'Меха' },
    },
    unhappy_effects: {
      trade_income_mod: -0.10,
      conspiracy_chance_mod: +0.04,
    },
    happy_effects: {
      trade_income_mod: +0.08,
    },
    // ── НОВЫЕ ПОЛЯ ───────────────────────────────────────────────────────────
    can_work_in: {
      primary:   ['market', 'forum', 'port', 'trading_post', 'school', 'slave_market'],
      secondary: ['barracks', 'warehouse', 'tavern'],
      forbidden: ['silver_mine', 'iron_mine', 'gold_mine', 'tin_mine', 'sulfur_mine', 'mine'],
    },
    ownership_rights: {
      can_own:   ['trading_post', 'tavern', 'workshop', 'pottery_workshop', 'slave_market'],
      can_build: ['trading_post', 'tavern'],
      max_owned: 5,
    },
    political_actions: {
      can_vote:          true,
      can_hold_office:   true,
      can_lead_army:     true,
      can_conspire:      true,
      rebellion_trigger: 35,
      rebellion_type:    'riot',
      pressure_actions:  [
        'vote_against_ruler',
        'refuse_military_service',
        'public_protests',
        'support_rival',
        'fund_demagogue',
      ],
    },
  },

  // ── РЕМЕСЛЕННИКИ ───────────────────────────────────────────────────────
  // Тяжёлый физический труд (~2700 ккал/день).
  // 150 кг пшеницы + 150 кг ячменя. Инструменты (10 кг/чел/год) и железо
  // (4 кг/чел/год) — рабочий расход сырья и износ оснастки.
  craftsmen_class: {
    name:          'Ремесленники',
    name_gen:      'ремесленников',
    icon:          '⚒',
    description:   'Кузнецы, гончары, ткачи, плотники, строители.',
    color:         '#8D6E63',
    wealth_level:  2,
    political_weight: 0.12,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 15_000, priority: 'basic',    label: 'Пшеница' },
      barley:      { per_100: 15_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    400, priority: 'basic',    label: 'Соль' },
      // ── стандартные ──────────────────────────────────────────────────
      wine:        { per_100:  3_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_200, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  2_000, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    150, priority: 'standard', label: 'Гарум' },
      olives:      { per_100:    600, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    300, priority: 'standard', label: 'Ткань' },
      wool:        { per_100:    300, priority: 'standard', label: 'Шерсть' },      // сырьё для домашней одежды
      leather:     { per_100:    200, priority: 'standard', label: 'Кожа' },
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
      tools:       { per_100:  1_000, priority: 'standard', label: 'Инструменты' }, // рабочий износ
      iron:        { per_100:    400, priority: 'standard', label: 'Железо' },       // сырьё для производства
      // ── роскошь ──────────────────────────────────────────────────────
      meat:        { per_100:    500, priority: 'luxury',   label: 'Мясо' },
      honey:       { per_100:     40, priority: 'luxury',   label: 'Мёд' },
      tuna:        { per_100:     50, priority: 'luxury',   label: 'Тунец' },
    },
    unhappy_effects: {
      production_mod: -0.15,
    },
    happy_effects: {
      production_mod: +0.10,
    },
  },

  // ── ЗЕМЛЕДЕЛЬЦЫ ────────────────────────────────────────────────────────
  // Очень тяжёлый труд (~3200 ккал/день). В основном ячмень — дешевле пшеницы.
  // 50 кг пшеницы + 250 кг ячменя. Сушёная рыба — доступный белок.
  // Вино и мясо — редкая праздничная роскошь (урожай, праздники).
  farmers_class: {
    name:          'Земледельцы',
    name_gen:      'земледельцев',
    icon:          '🌾',
    description:   'Крестьяне, арендаторы, мелкие свободные фермеры.',
    color:         '#66BB6A',
    wealth_level:  1,
    political_weight: 0.10,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100:  5_000, priority: 'basic',    label: 'Пшеница' },
      barley:      { per_100: 25_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    400, priority: 'basic',    label: 'Соль' },
      // ── стандартные ──────────────────────────────────────────────────
      olive_oil:   { per_100:  1_000, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_500, priority: 'standard', label: 'Рыба' },            // сушёная/солёная рыба
      garum:       { per_100:    100, priority: 'standard', label: 'Гарум' },           // дешёвый liquamen
      olives:      { per_100:    500, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    200, priority: 'standard', label: 'Ткань' },
      wool:        { per_100:    200, priority: 'standard', label: 'Шерсть' },
      leather:     { per_100:    100, priority: 'standard', label: 'Кожа' },            // сандалии, рабочие ремни
      tools:       { per_100:    500, priority: 'standard', label: 'Инструменты' },     // серпы, мотыги
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
      // ── роскошь ──────────────────────────────────────────────────────
      wine:        { per_100:  1_000, priority: 'luxury',   label: 'Вино' },            // 10 л/чел/год
      meat:        { per_100:    200, priority: 'luxury',   label: 'Мясо' },            // 2 кг/чел/год
      honey:       { per_100:     30, priority: 'luxury',   label: 'Мёд' },
    },
    unhappy_effects: {
      production_mod: -0.12,
      growth_rate_mod: -0.001,
    },
    happy_effects: {
      production_mod: +0.08,
      growth_rate_mod: +0.001,
    },
  },

  // ── МОРЯКИ ─────────────────────────────────────────────────────────────
  // Очень тяжёлый труд (~3200 ккал/день). Рыба — основной белок (60 кг/чел/год).
  // Соль высокая (9 кг): консервация улова в море + личный расход.
  // Пенька (2 кг) — рабочий расход: мелкий ремонт такелажа.
  // Паёк афинского гребца: пшеница + ячмень + рыба + вино.
  sailors_class: {
    name:          'Моряки',
    name_gen:      'моряков',
    icon:          '⚓',
    description:   'Рыбаки, морские торговцы, корабельщики, лоцманы.',
    color:         '#1E88E5',
    wealth_level:  2,
    political_weight: 0.06,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 12_000, priority: 'basic',    label: 'Пшеница' },
      barley:      { per_100: 16_000, priority: 'basic',    label: 'Ячмень' },
      fish:        { per_100:  6_000, priority: 'basic',    label: 'Рыба' },            // главный белок
      salt:        { per_100:    900, priority: 'basic',    label: 'Соль' },            // консервация + личное
      // ── стандартные ──────────────────────────────────────────────────
      wine:        { per_100:  4_000, priority: 'standard', label: 'Вино' },            // корабельный паёк
      olive_oil:   { per_100:  1_000, priority: 'standard', label: 'Оливковое масло' },
      garum:       { per_100:    400, priority: 'standard', label: 'Гарум' },           // много используется в море
      tuna:        { per_100:    500, priority: 'standard', label: 'Тунец' },           // сами ловят
      olives:      { per_100:    600, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    200, priority: 'standard', label: 'Ткань' },
      wool:        { per_100:    300, priority: 'standard', label: 'Шерсть' },
      leather:     { per_100:    300, priority: 'standard', label: 'Кожа' },
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
      hemp:        { per_100:    200, priority: 'standard', label: 'Пенька' },          // ремонт такелажа
      tools:       { per_100:    400, priority: 'standard', label: 'Инструменты' },     // судовой ремонт, снасти
      // ── роскошь ──────────────────────────────────────────────────────
      meat:        { per_100:    200, priority: 'luxury',   label: 'Мясо' },
      honey:       { per_100:     30, priority: 'luxury',   label: 'Мёд' },
    },
    unhappy_effects: {
      trade_income_mod: -0.12,
    },
    happy_effects: {
      trade_income_mod: +0.10,
    },
  },

  // ── СОЛДАТЫ ────────────────────────────────────────────────────────────
  // Полибий: легионер ~320 кг пшеницы/год. Соль: традиционный "salarium".
  // Оружие (basic) — без него солдат не функционирует.
  // Доспехи и железо (standard) — поддержание боеспособности.
  soldiers_class: {
    name:          'Солдаты',
    name_gen:      'солдат',
    icon:          '🗡',
    description:   'Ополченцы, наёмники, гарнизонные войска.',
    color:         '#EF5350',
    wealth_level:  2,
    political_weight: 0.08,
    needs: {
      // ── базовые ──────────────────────────────────────────────────────
      wheat:       { per_100: 32_000, priority: 'basic',    label: 'Пшеница (паёк)' },
      barley:      { per_100:  3_000, priority: 'basic',    label: 'Ячмень (штрафной паёк)' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль (salarium)' },
      weapons:     { per_100:    500, priority: 'basic',    label: 'Оружие' },           // замена сломанного
      // ── стандартные ──────────────────────────────────────────────────
      wine:        { per_100:  2_500, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:    800, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_000, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    300, priority: 'standard', label: 'Гарум' },
      meat:        { per_100:  1_000, priority: 'standard', label: 'Мясо' },
      cloth:       { per_100:    300, priority: 'standard', label: 'Ткань' },
      leather:     { per_100:    500, priority: 'standard', label: 'Кожа' },            // сандалии, ремни, доспех
      iron:        { per_100:    500, priority: 'standard', label: 'Железо' },          // ремонт снаряжения
      armor:       { per_100:    250, priority: 'standard', label: 'Доспехи' },         // амортизация
      tools:       { per_100:    200, priority: 'standard', label: 'Инструменты' },     // полевые инструменты
      // ── роскошь ──────────────────────────────────────────────────────
      tuna:        { per_100:    100, priority: 'luxury',   label: 'Тунец' },
      honey:       { per_100:     30, priority: 'luxury',   label: 'Мёд' },
      olives:      { per_100:    400, priority: 'luxury',   label: 'Оливки' },
    },
    unhappy_effects: {
      military_loyalty_mod: -8,
      desertion_risk: +0.05,
    },
    happy_effects: {
      military_loyalty_mod: +4,
      military_morale_mod: +5,
    },
  },

  // ── ВОЛЬНООТПУЩЕННИКИ ──────────────────────────────────────────────────
  // Поденщики и мелкие ремесленники. Бедный, но свободный класс.
  // 70 кг пшеницы + 150 кг ячменя. Масло и рыба — доступный минимум.
  freedmen: {
    name:          'Вольноотпущенники',
    name_gen:      'вольноотпущенников',
    icon:          '🔑',
    description:   'Бывшие рабы. Лично свободны, но без гражданских прав.',
    color:         '#78909C',
    wealth_level:  1,
    political_weight: 0.04,
    needs: {
      wheat:       { per_100:  7_000, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 15_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    400, priority: 'basic',    label: 'Соль' },
      olive_oil:   { per_100:    800, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_500, priority: 'standard', label: 'Рыба' },
      garum:       { per_100:    100, priority: 'standard', label: 'Гарум' },
      olives:      { per_100:    400, priority: 'standard', label: 'Оливки' },
      cloth:       { per_100:    200, priority: 'standard', label: 'Ткань' },
      leather:     { per_100:     80, priority: 'standard', label: 'Кожа' },            // сандалии, базовые изделия
      tools:       { per_100:    300, priority: 'standard', label: 'Инструменты' },     // поденная работа
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
      wine:        { per_100:    500, priority: 'luxury',   label: 'Вино' },
      meat:        { per_100:    200, priority: 'luxury',   label: 'Мясо' },
      honey:       { per_100:     20, priority: 'luxury',   label: 'Мёд' },
    },
    unhappy_effects: {
      conspiracy_chance_mod: +0.03,
    },
    happy_effects: {
      production_mod: +0.05,
    },
  },

  // ── РАБЫ ───────────────────────────────────────────────────────────────
  // Катон «О земледелии» гл. 56: ~700 г хлеба/день для полевого раба
  //   ≈ ~500 г зерна/день × 365 = ~183 кг пшеницы или ~255 кг ячменя.
  // Здесь: 40 кг пшеницы + 280 кг ячменя = 320 кг/год — полевой раб.
  slaves_class: {
    name:          'Рабы',
    name_gen:      'рабов',
    icon:          '⛓',
    description:   'Домашние, рудничные и сельские рабы. Основа производства.',
    color:         '#455A64',
    wealth_level:  0,
    political_weight: 0.00,
    needs: {
      wheat:       { per_100:  4_000, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 28_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    300, priority: 'basic',    label: 'Соль' },
      fish:        { per_100:  1_000, priority: 'standard', label: 'Рыба' },            // дешёвый солёный белок
      cloth:       { per_100:    100, priority: 'standard', label: 'Ткань' },
      leather:     { per_100:     80, priority: 'standard', label: 'Кожа (одежда/обувь)' },
      olive_oil:   { per_100:    200, priority: 'standard', label: 'Оливковое масло' },
      pottery:     { per_100:    100, priority: 'standard', label: 'Керамика' },        // бытовая посуда
    },
    unhappy_effects: {
      rebellion_risk: +0.08,
      production_mod: -0.10,
    },
    happy_effects: {
      production_mod: +0.08,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// ВЫЧИСЛЕНИЕ НАСЕЛЕНИЯ КАЖДОГО КЛАССА
// Принимает объект by_profession, возвращает { class_id: count }
// ─────────────────────────────────────────────────────────────────────────
function calculateClassPopulations(by_profession) {
  const result = {};
  for (const [classId, profShares] of Object.entries(CLASS_FROM_PROFESSION)) {
    let count = 0;
    for (const [prof, share] of Object.entries(profShares)) {
      count += (by_profession[prof] || 0) * share;
    }
    result[classId] = Math.round(count);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// ПОТРЕБЛЕНИЕ КЛАССА ЗА ХОД
// Возвращает { good: amount } для одного класса заданного размера
// ─────────────────────────────────────────────────────────────────────────
// CONSUMPTION_TURNS: per_100 задан как годовая норма, делим на 12 для ежемесячного потребления
const CONSUMPTION_TURNS = 12;

function calculateClassNeeds(classId, classPopulation) {
  const classDef = SOCIAL_CLASSES[classId];
  if (!classDef) return {};
  const needs = {};
  for (const [good, spec] of Object.entries(classDef.needs)) {
    needs[good] = (classPopulation / 100) * spec.per_100 / CONSUMPTION_TURNS;
  }
  return needs;
}

// ─────────────────────────────────────────────────────────────────────────
// ОБЩЕЕ ПОТРЕБЛЕНИЕ НАЦИИ (все классы суммарно)
// Возвращает { good: totalAmount }
// ─────────────────────────────────────────────────────────────────────────
function calculateTotalConsumptionByClass(by_profession) {
  const classPops = calculateClassPopulations(by_profession);
  const total = {};
  for (const [classId, pop] of Object.entries(classPops)) {
    const needs = calculateClassNeeds(classId, pop);
    for (const [good, amount] of Object.entries(needs)) {
      total[good] = (total[good] || 0) + amount;
    }
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────
// УДОВЛЕТВОРЁННОСТЬ КЛАССОВ
// Принимает stockpile и consumed (что уже вычтено/доступно),
// возвращает { class_id: { satisfaction: 0-100, basic_met: bool,
//                           standard_met: bool, luxury_met: bool } }
// ─────────────────────────────────────────────────────────────────────────
function calculateClassSatisfaction(by_profession, stockpile) {
  const classPops = calculateClassPopulations(by_profession);
  const result = {};

  for (const [classId, pop] of Object.entries(classPops)) {
    const classDef = SOCIAL_CLASSES[classId];
    const needs = classDef.needs;

    let basicCount = 0, basicMet = 0;
    let standardCount = 0, standardMet = 0;
    let luxuryCount = 0, luxuryMet = 0;

    for (const [good, spec] of Object.entries(needs)) {
      // needed = месячная норма потребления класса; satisfaction = запас / месячная_норма
      const needed = (pop / 100) * spec.per_100 / CONSUMPTION_TURNS;
      const available = stockpile[good] || 0;
      const ratio = needed > 0 ? Math.min(1, available / needed) : 1;

      if (spec.priority === 'basic') {
        basicCount++;
        basicMet += ratio;
      } else if (spec.priority === 'standard') {
        standardCount++;
        standardMet += ratio;
      } else {
        luxuryCount++;
        luxuryMet += ratio;
      }
    }

    const basicSat    = basicCount    > 0 ? basicMet    / basicCount    : 1;
    const standardSat = standardCount > 0 ? standardMet / standardCount : 1;
    const luxurySat   = luxuryCount   > 0 ? luxuryMet   / luxuryCount   : 1;

    // Итоговое счастье класса: базовые нужды важнее всего
    // basic×60% + standard×30% + luxury×10%
    const satisfaction = Math.round(basicSat * 60 + standardSat * 30 + luxurySat * 10);

    result[classId] = {
      population:   pop,
      satisfaction, // 0-100
      basic_sat:    Math.round(basicSat * 100),
      standard_sat: Math.round(standardSat * 100),
      luxury_sat:   Math.round(luxurySat * 100),
      basic_met:    basicSat >= 0.8,
      standard_met: standardSat >= 0.6,
      luxury_met:   luxurySat >= 0.5,
    };
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// ПОЛИТИЧЕСКИЕ ЭФФЕКТЫ ОТ НЕДОВОЛЬСТВА/ДОВОЛЬСТВА КЛАССОВ
// Принимает classSatisfaction (вывод calculateClassSatisfaction),
// возвращает суммарные модификаторы для нации
// ─────────────────────────────────────────────────────────────────────────
function calculatePoliticalEffects(classSatisfaction) {
  const effects = {
    happiness_base_mod:      0,
    tax_efficiency_mod:      0,
    production_mod:          0,
    trade_income_mod:        0,
    conspiracy_chance_mod:   0,
    legitimacy_mod:          0,
    military_loyalty_mod:    0,
    military_morale_mod:     0,
    growth_rate_mod:         0,
    rebellion_risk:          0,
    desertion_risk:          0,
  };

  for (const [classId, data] of Object.entries(classSatisfaction)) {
    const classDef = SOCIAL_CLASSES[classId];
    if (!classDef) continue;

    if (data.satisfaction < 40) {
      for (const [key, val] of Object.entries(classDef.unhappy_effects || {})) {
        if (effects[key] !== undefined) effects[key] += val;
      }
    } else if (data.satisfaction > 70) {
      for (const [key, val] of Object.entries(classDef.happy_effects || {})) {
        if (effects[key] !== undefined) effects[key] += val;
      }
    }
  }

  return effects;
}

// ─────────────────────────────────────────────────────────────────────────
// ВЗВЕШЕННОЕ СЧАСТЬЕ НАЦИИ (с учётом политического веса классов)
// ─────────────────────────────────────────────────────────────────────────
function calculateWeightedHappiness(classSatisfaction) {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [classId, data] of Object.entries(classSatisfaction)) {
    const classDef = SOCIAL_CLASSES[classId];
    if (!classDef) continue;
    const w = classDef.political_weight;
    weightedSum += data.satisfaction * w;
    totalWeight += w;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
}

// ══════════════════════════════════════════════════════════════
// МОСТ: Классовая удовлетворённость → Целевое богатство POPs (Этап 8)
//
// Связывает класс-ориентированную систему потребления (SOCIAL_CLASSES)
// с моделью богатства по профессиям (pops.js).
//
// Для каждой профессии вычисляет wealth_target (0–100) на основе того,
// каким классам она принадлежит (CLASS_FROM_PROFESSION) и насколько
// эти классы удовлетворены своим потреблением.
//
// Используется в updatePopWealth() как дополнительный сигнал (30% веса)
// помимо зарплатного incomeAdequacy (70% веса).
//
// Формула:
//   classWealthBase = wealth_level × 20   (0–100 по шкале класса)
//   wealthTarget    = Σ(classWealthBase × classSat × classWeight) / Σweight
// ══════════════════════════════════════════════════════════════

function getClassBasedWealthTargets(nation) {
  if (!nation?.population?.by_profession || !nation?.economy?.stockpile) return {};

  // Вычисляем удовлетворённость классов по текущему складу
  const classSat = calculateClassSatisfaction(
    nation.population.by_profession,
    nation.economy.stockpile,
  );

  // Аккумуляторы: для каждой профессии собираем взвешенное среднее
  const accum = {};  // prof → { wSum: number, wTotal: number }

  for (const [classId, classProfs] of Object.entries(CLASS_FROM_PROFESSION)) {
    const cls = SOCIAL_CLASSES[classId];
    if (!cls) continue;

    // Насколько класс доволен (0–1) и какое «базовое богатство» он олицетворяет
    const sat             = (classSat[classId]?.satisfaction ?? 50) / 100;
    const classWealthBase = cls.wealth_level * 20;  // wealth_level 0–5 → 0–100
    const wealthTarget    = classWealthBase * sat;

    for (const [prof, weight] of Object.entries(classProfs)) {
      if (!accum[prof]) accum[prof] = { wSum: 0, wTotal: 0 };
      accum[prof].wSum   += wealthTarget * weight;
      accum[prof].wTotal += weight;
    }
  }

  // Итоговые целевые значения богатства по профессиям
  const result = {};
  for (const [prof, { wSum, wTotal }] of Object.entries(accum)) {
    result[prof] = wTotal > 0 ? Math.min(100, Math.round(wSum / wTotal)) : 25;
  }
  return result;
}
