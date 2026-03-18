// ============================================================================
//  КУЛЬТУРЫ СИЦИЛИИ ~301 BC
//
//  Каждая культура:
//  - traditions: 8 слотов (id из ALL_TRADITIONS)
//  - locked: корневые традиции (макс. 2), не мутируют
//  - experience: счётчики опыта, растут от событий
//  - last_mutation_turn: ход последней мутации
//  - group: культурная группа (для ассимиляции — близкие группы легче)
//  - color: цвет для диаграмм
//  - icon: символ для отображения
//  - image: URL свободного изображения (Wikimedia Commons, Public Domain)
// ============================================================================

const CULTURE_GROUPS = {
  hellenic:    { name: 'Эллинская',       assimilation_modifier: 1.0 },
  punic:       { name: 'Пунийская',       assimilation_modifier: 0.8 },
  italic:      { name: 'Италийская',      assimilation_modifier: 0.9 },
  indigenous:  { name: 'Аборигенная',     assimilation_modifier: 1.2 },
  celtic:      { name: 'Кельтская',       assimilation_modifier: 0.7 },
  egyptian:    { name: 'Египетская',      assimilation_modifier: 0.6 },
  persian:     { name: 'Персидская',      assimilation_modifier: 0.5 },
};

const CULTURE_GROUP_AFFINITY = {
  'hellenic-punic':      0.4,
  'hellenic-italic':     0.6,
  'hellenic-indigenous': 0.7,
  'punic-indigenous':    0.5,
  'italic-indigenous':   0.5,
  'hellenic-egyptian':   0.5,
  'hellenic-celtic':     0.3,
  'punic-egyptian':      0.4,
};

// ── Определения культур ───────────────────────────────────────────────────────

const CULTURES = {

  // ══════════════════════════════════════════════════════════════════════════
  //  ГРЕЧЕСКИЕ КУЛЬТУРЫ
  // ══════════════════════════════════════════════════════════════════════════

  greek_sicilian: {
    name: 'Сицилийские греки',
    group: 'hellenic',
    color: '#4A90D9',
    icon: '🏛',
    // Тетрадрахма Сиракуз — Аретуза (Public Domain, монета ~300 BC)
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Tetradrachm_Syracuse_Agathokles_317-310BC_obverse_CdM_Paris.jpg/120px-Tetradrachm_Syracuse_Agathokles_317-310BC_obverse_CdM_Paris.jpg',
    desc: 'Потомки коринфских и мегарских колонистов. Урбанизированная, воинственная, культурная цивилизация',
    traditions: [
      'colonial_heritage',       // locked — колониальное прошлое
      'olympian_devotion',       // locked — вера в олимпийцев
      'phalanx_tradition',       // сильная пехота
      'slave_economy',           // рабский труд
      'theater_tradition',       // театр и искусство
      'maritime_trade',          // морская торговля
      'democratic_assembly',     // народное собрание (хотя Агафокл — тиран)
      'athletic_games',          // атлетические игры
    ],
    locked: ['colonial_heritage', 'olympian_devotion'],
    experience: {
      exp_war: 60, exp_naval: 40, exp_trade: 50, exp_agriculture: 30,
      exp_culture: 70, exp_religion: 40, exp_diplomacy: 30, exp_civic: 50,
      exp_suffering: 20,
    },
    last_mutation_turn: 0,
  },

  greek_colonial: {
    name: 'Колониальные греки',
    group: 'hellenic',
    color: '#6BB3E0',
    icon: '⚱️',
    // Храм Конкордии, Акрагас (Public Domain, Wikimedia)
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Agrigente_Temple_de_la_Concorde.jpg/120px-Agrigente_Temple_de_la_Concorde.jpg',
    desc: 'Малые греческие полисы Сицилии — Гела, Акрагас, Тиндарис. Менее воинственны, более торговые',
    traditions: [
      'colonial_heritage',       // locked
      'olympian_devotion',       // locked
      'citizen_militia',         // ополчение вместо профессионалов
      'olive_growers',           // оливки и вино
      'market_traders',          // рыночная торговля
      'festival_tradition',      // праздники
      'common_law',              // обычное право
      'coastal_dwellers',        // прибрежная жизнь
    ],
    locked: ['colonial_heritage', 'olympian_devotion'],
    experience: {
      exp_war: 30, exp_naval: 30, exp_trade: 40, exp_agriculture: 50,
      exp_culture: 40, exp_religion: 35, exp_diplomacy: 25, exp_civic: 30,
      exp_suffering: 30,
    },
    last_mutation_turn: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  ПУНИЙСКАЯ КУЛЬТУРА
  // ══════════════════════════════════════════════════════════════════════════

  punic_sicilian: {
    name: 'Сицилийские пунийцы',
    group: 'punic',
    color: '#C0392B',
    icon: '☀️',
    // Знак Танит (Public Domain, финикийская стела)
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Tanit-Symbol-alternate.svg/120px-Tanit-Symbol-alternate.svg.png',
    desc: 'Финикийские колонисты Западной Сицилии. Панорм, Лилибей, Мотия — торговые крепости',
    traditions: [
      'child_of_tanit',          // locked — пунийская религия
      'maritime_trade',          // locked — торговое призвание
      'fortification_builders',  // мощные стены
      'mercenary_tradition',     // наёмники, а не граждане
      'trade_monopoly',          // контроль торговли
      'purple_dye',              // тирский пурпур
      'harbor_masters',          // великие порты
      'hostage_tradition',       // заложники для контроля
    ],
    locked: ['child_of_tanit', 'maritime_trade'],
    experience: {
      exp_war: 40, exp_naval: 60, exp_trade: 70, exp_agriculture: 20,
      exp_culture: 30, exp_religion: 50, exp_diplomacy: 40, exp_civic: 30,
      exp_suffering: 15,
    },
    last_mutation_turn: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  АБОРИГЕННЫЕ КУЛЬТУРЫ
  // ══════════════════════════════════════════════════════════════════════════

  sikel: {
    name: 'Сикелы',
    group: 'indigenous',
    color: '#8B6914',
    icon: '🗻',
    // Сикельская керамика (Public Domain)
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Centuripe_-_Busto_fittile_%28III_sec_a_C%29.jpg/120px-Centuripe_-_Busto_fittile_%28III_sec_a_C%29.jpg',
    desc: 'Древнейшие жители Восточной Сицилии. Частично эллинизированы, но сохраняют свой уклад',
    traditions: [
      'ancestor_worship',        // locked — культ предков
      'stubborn_independence',   // locked — непокорность
      'tribal_warriors',         // племенные воины
      'subsistence_farming',     // натуральное хозяйство
      'mountain_refuge',         // горные убежища
      'oral_tradition',          // устные предания
      'blood_feuds',             // кровная месть
      'pastoral_herders',        // скотоводство
    ],
    locked: ['ancestor_worship', 'stubborn_independence'],
    experience: {
      exp_war: 40, exp_naval: 5, exp_trade: 10, exp_agriculture: 40,
      exp_culture: 15, exp_religion: 30, exp_diplomacy: 10, exp_civic: 15,
      exp_suffering: 40,
    },
    last_mutation_turn: 0,
  },

  sican: {
    name: 'Сиканы',
    group: 'indigenous',
    color: '#A0522D',
    icon: '🌿',
    // Сиканская керамика (Public Domain)
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Sicani_vase.jpg/120px-Sicani_vase.jpg',
    desc: 'Древнейшие жители Западной Сицилии. Пастухи и земледельцы горных долин',
    traditions: [
      'earth_spirits',           // locked — духи земли
      'clan_loyalty',            // locked — клановая верность
      'tribal_warriors',         // племенные воины
      'pastoral_herders',        // скотоводство
      'mountain_refuge',         // горы — защита
      'sacred_groves',           // священные рощи
      'seasonal_migration',      // отгонное скотоводство
      'elder_wisdom',            // мудрость старейшин
    ],
    locked: ['earth_spirits', 'clan_loyalty'],
    experience: {
      exp_war: 25, exp_naval: 2, exp_trade: 8, exp_agriculture: 45,
      exp_culture: 10, exp_religion: 35, exp_diplomacy: 8, exp_civic: 10,
      exp_suffering: 35,
    },
    last_mutation_turn: 0,
  },

  elymian: {
    name: 'Элимы',
    group: 'indigenous',
    color: '#DAA520',
    icon: '🐴',
    // Храм в Сегесте, элимский (Public Domain)
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Segesta_Greek_Temple.jpg/120px-Segesta_Greek_Temple.jpg',
    desc: 'Народ-загадка. Утверждают, что произошли от троянцев. Живут между греками и пунийцами',
    traditions: [
      'trojan_legacy',           // locked — троянское наследие
      'sacred_hospitality',      // locked — священное гостеприимство
      'diplomatic_survivors',    // выживают дипломатией
      'temple_builders',         // храм в Эриксе знаменит
      'bilingual_culture',       // говорят по-гречески и по-своему
      'mountain_refuge',         // Эрикс — горная крепость
      'vine_tenders',            // виноградарство
      'mixed_heritage',          // смешанное наследие
    ],
    locked: ['trojan_legacy', 'sacred_hospitality'],
    experience: {
      exp_war: 20, exp_naval: 10, exp_trade: 25, exp_agriculture: 35,
      exp_culture: 30, exp_religion: 45, exp_diplomacy: 40, exp_civic: 15,
      exp_suffering: 30,
    },
    last_mutation_turn: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  КАРТА: какая культура в каком регионе (по нации-владельцу)
  // ══════════════════════════════════════════════════════════════════════════
  // Определяется в REGION_CULTURES ниже
};

// ══════════════════════════════════════════════════════════════════════════
//  Привязка культуры к регионам — Сицилия ~301 до н.э.
//
//  primary — основная культура, minorities — список {culture, strength 0..1}
//  Исторический контекст:
//  - Восток: Сиракузская держава Агафокла. Греки доминируют, сикелы — хинтерланд
//  - Запад: Карфагенская эпикратея. Пунийцы на побережье, элимы и сиканы внутри
//  - Центр: Независимые сикелы (Энна, Капитий) — последние неассимилированные
//  - Юг: Гела, Акрагас — независимые греческие полисы (после разорения 406-405 до н.э.)
//  - Север: Мелкие полисы — Тиндарис, Калактея — эллинизированное побережье
// ══════════════════════════════════════════════════════════════════════════

const REGION_CULTURES = {

  // ── СИРАКУЗСКАЯ ДЕРЖАВА (Восточная Сицилия) ──────────────────────────────

  // Мессана — основана мамертинцами (оскское племя) в 288, но в 301 ещё греческий
  // полис Занкла/Мессана. Коринфская колония, важнейший порт на проливе.
  r55:   { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.05 }] },

  // Тавромений — основан Дионисием I для сикелов Наксоса. К 301 — эллинизирован
  // под Андромахом (отцом Тимея). Смешанное греко-сикельское население.
  r102:  { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.12 }] },

  // Катания — халкидская колония. Крупный город у подножия Этны.
  // Сикелы жили в округе до колонизации, часть осталась.
  r245:  { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.10 }] },

  // Кенторипа — сикельский город, частично эллинизирован при Тимолеонте.
  // Горная местность, горнодобыча. Значительное сикельское население.
  r246:  { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.25 }] },

  // Мегара Гиблея — одна из древнейших колоний (728 до н.э.), разрушена Гелоном.
  // К 301 — небольшое поселение, чисто греческое.
  r247:  { primary: 'greek_sicilian', minorities: [] },

  // Сиракузы — столица. 125 000 жителей. Крупнейший город Запада.
  // Небольшое сикельское население в пригородах (Эпиполы).
  r248:  { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.05 }] },

  // Побережье к югу от Сиракуз — мелкие греческие поселения
  r763:  { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.08 }] },

  // Моргантион — важный сикельский город, затем эллинизирован.
  // Найдены знаменитые мозаики. Значительное двуязычное население.
  r2402: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.30 }] },

  // Камарина — дорийская колония Сиракуз. Разрушалась и отстраивалась трижды.
  // К 301 — средний портовый город, чисто греческий.
  r2403: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.05 }] },

  // Гиблейские горы — горный массив. Мелкие сикельские деревни.
  // Слабо затронуты греческой колонизацией.
  r2405: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.12 }] },

  // Менаи (Менайнон) — сикельская крепость в горах. Частично эллинизирована.
  r2406: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.20 }] },

  // Акраи — колония Сиракуз (664 до н.э.). Укреплённый пост на пути вглубь.
  // Смешанное население, доминируют греки.
  r2407: { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.15 }] },

  // Леонтины — халкидская колония. Богатейшая равнина Сицилии.
  // Родина Горгия. Сикелы — меньшинство (вытеснены к горам).
  r2408: { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.08 }] },

  // ── НЕЗАВИСИМЫЕ ГРЕЧЕСКИЕ ПОЛИСЫ ─────────────────────────────────────────

  // Гела — дорийская колония (689 до н.э.). Мать Акрагаса.
  // Разрушена Карфагеном в 405, восстановлена Тимолеонтом в 339.
  r2404: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.08 }] },

  // Акрагас — один из богатейших городов древности (ок. 200 000 до 406).
  // Разрушен Карфагеном, восстановлен. К 301 — ок. 25 000, но ещё великолепен.
  r2409: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.05 }] },

  // Гераклея Миноа — пограничный город между греческой и пунийской зонами.
  // Много раз переходил из рук в руки. Смешанное население.
  r2410: { primary: 'greek_colonial', minorities: [{ culture: 'punic_sicilian', strength: 0.20 }, { culture: 'sican', strength: 0.08 }] },

  // Селинунт — некогда великий дорийский полис. Уничтожен Карфагеном в 409.
  // К 301 — небольшое пунийское поселение на руинах. Остатки греков.
  r2411: { primary: 'punic_sicilian', minorities: [{ culture: 'greek_colonial', strength: 0.20 }, { culture: 'sican', strength: 0.05 }] },

  // ── КАРФАГЕНСКАЯ ЭПИКРАТЕЯ (Западная Сицилия) ────────────────────────────

  // Лилибей (Марсала) — основан карфагенянами после падения Мотии (397 до н.э.).
  // Сильнейшая крепость Запада. Чисто пунийский город.
  r2412: { primary: 'punic_sicilian', minorities: [{ culture: 'elymian', strength: 0.05 }] },

  // Панорм (Палермо) — древнейшая финикийская колония на Сицилии.
  // Главный порт западной Сицилии. Элимское меньшинство в окрестностях.
  r2415: { primary: 'punic_sicilian', minorities: [{ culture: 'elymian', strength: 0.10 }, { culture: 'greek_colonial', strength: 0.05 }] },

  // Гиккара — маленький прибрежный город. Разорён афинянами в 415.
  // К 301 — пунийское поселение с элимским населением.
  r2416: { primary: 'punic_sicilian', minorities: [{ culture: 'elymian', strength: 0.15 }] },

  // Тирм (Терме Имересе) — на месте разрушенной Гимеры.
  // Карфагенское поселение с пунийскими колонистами.
  r249:  { primary: 'punic_sicilian', minorities: [{ culture: 'greek_colonial', strength: 0.10 }] },

  // ── ЭЛИМСКИЕ ТЕРРИТОРИИ ──────────────────────────────────────────────────

  // Эрикс (Эриче) — священная гора с храмом Афродиты/Астарты.
  // Элимский город, но с сильным пунийским влиянием (гарнизон Карфагена).
  r2413: { primary: 'elymian', minorities: [{ culture: 'punic_sicilian', strength: 0.20 }] },

  // Эгеста (Сегеста) — главный город элимов. Знаменитый храм.
  // Традиционный союзник Карфагена. Некоторое греческое влияние (образование).
  r2414: { primary: 'elymian', minorities: [{ culture: 'punic_sicilian', strength: 0.10 }, { culture: 'greek_colonial', strength: 0.08 }] },

  // ── СИКЕЛЬСКИЕ ТЕРРИТОРИИ (Центральная Сицилия) ──────────────────────────

  // Капитий — горное сикельское поселение. Слабо затронуто колонизацией.
  r2420: { primary: 'sikel', minorities: [] },

  // Энна — «пуп Сицилии», горная крепость. Центр культа Деметры и Коры.
  // Значительное греческое культурное влияние (элевсинские мистерии).
  r2422: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.12 }] },

  // ── СИКАНСКИЕ ТЕРРИТОРИИ (Западный хинтерланд) ───────────────────────────

  // Митистрат — горное поселение сиканов у реки Гальсо.
  r2423: { primary: 'sican', minorities: [] },

  // Гиппана — сиканский город на равнинах. Частично под пунийским влиянием.
  r2424: { primary: 'sican', minorities: [{ culture: 'punic_sicilian', strength: 0.08 }] },

  // Партанна — сиканское поселение, граничит с территорией элимов.
  r2425: { primary: 'sican', minorities: [{ culture: 'elymian', strength: 0.12 }] },

  // ── СЕВЕРНОЕ ПОБЕРЕЖЬЕ (мелкие полисы) ───────────────────────────────────

  // Кефалойдий (Чефалу) — греческая колония на скалистом мысе.
  // Сикельское население в округе.
  r2417: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.18 }] },

  // Кале-Акте — «прекрасный берег». Основан Дукетием (сикельский вождь).
  // Смешанное греко-сикельское население.
  r2418: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.22 }] },

  // Тиндарис — основан Дионисием I в 396 для мессенских изгнанников.
  // Молодой полис, чисто греческий.
  r2419: { primary: 'greek_colonial', minorities: [] },

  // Липарские острова — Мелигунис. Греческая колония книдцев (580 до н.э.).
  // Островной полис, рыбаки и пираты.
  r3199: { primary: 'greek_colonial', minorities: [] },
};
