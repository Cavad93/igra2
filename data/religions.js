// ══════════════════════════════════════════════════════════════════════════
//  РЕЛИГИИ СИЦИЛИИ — ~301 г. до н.э.
//
//  Спектр институционализации (0–100):
//    0–20  Анимизм:           нет храмов, нет жрецов, устная традиция
//   21–40  Культовая практика: святилища, шаманы, локальные ритуалы
//   41–60  Храмовая религия:  храмы, жрецы, праздники, каноны
//   61–80  Организованный культ: иерархия, паломничества, священные тексты
//   81–100 Теократический институт: жречество = политическая сила
//
//  spread_method:
//    'trade'      — через торговые пути и порты
//    'conquest'   — через захват территорий
//    'pilgrimage' — через священные места
//    'migration'  — через переселение народов
//    'mystery'    — тайно, через инициацию (не зависит от государства)
// ══════════════════════════════════════════════════════════════════════════

const RELIGIONS = {

  // ── ЭЛЛИНСКИЕ ──────────────────────────────────────────────────────────

  olympian: {
    name: 'Олимпийский пантеон',
    group: 'hellenic',
    color: '#4A90D9',
    icon: '⚡',
    desc: 'Двенадцать олимпийских богов — Зевс, Гера, Афина, Аполлон, Артемида, Посейдон, Деметра, Арес, Гефест, Афродита, Гермес, Дионис. Официальная религия всех греческих полисов.',
    institutionalization: 65,
    domains: ['война', 'закон', 'море', 'торговля', 'ремесло', 'искусство'],
    bonuses: {
      base:       { legitimacy: 2, diplomacy: 2 },
      fervor_50:  { happiness: 3, stability: 0.02 },
      fervor_80:  { legitimacy: 4, military_morale: 0.03 },
    },
    sacred_sites: ['r248', 'r2409'], // Сиракузы (храм Афины), Акрагас (храм Зевса Олимпийского)
    spread_method: 'trade',
    affinity: {
      demeter_kore: 0.9,  // Деметра — часть пантеона
      dionysian: 0.8,     // Дионис — тоже олимпиец
      elymian_aphrodite: 0.6, // Афродита-Эрицина
      melqart: 0.3,       // Мелькарт ≈ Геракл (interpretatio graeca)
      punic_pantheon: 0.2,
      adranon: 0.4,       // Адранос ≈ Гефест
      earth_spirits: 0.3,
    },
  },

  demeter_kore: {
    name: 'Мистерии Деметры и Коры',
    group: 'hellenic',
    color: '#8B6914',
    icon: '🌾',
    desc: 'Энна — пуп Сицилии, место похищения Персефоны. Элевсинские мистерии в сицилийской версии. Культ плодородия, тайные обряды, обещание загробной жизни.',
    institutionalization: 70,
    domains: ['плодородие', 'смерть', 'тайна', 'земледелие'],
    bonuses: {
      base:       { food_production: 0.02, happiness: 1 },
      fervor_50:  { food_production: 0.04, happiness: 3, stability: 0.02 },
      fervor_80:  { food_production: 0.06, population_growth: 0.001, legitimacy: 2 },
    },
    sacred_sites: ['r2422'], // Энна — главное святилище Деметры в мире
    spread_method: 'pilgrimage',
    affinity: {
      olympian: 0.9,
      dionysian: 0.7,
      earth_spirits: 0.6, // Сикульские духи земли → Деметра
      sican_earth: 0.5,
      elymian_aphrodite: 0.5,
      punic_pantheon: 0.2,
    },
  },

  dionysian: {
    name: 'Дионисийские мистерии',
    group: 'mystery',
    color: '#9B30FF',
    icon: '🍇',
    desc: 'Экстатический культ Диониса. Вакханалии, театральные представления, вино как священный напиток. Стирает грани между сословиями — в мистериях равны все.',
    institutionalization: 45,
    domains: ['вино', 'экстаз', 'театр', 'равенство'],
    bonuses: {
      base:       { happiness: 2 },
      fervor_50:  { happiness: 4, assimilation_speed: 0.04 },
      fervor_80:  { happiness: 5, assimilation_speed: 0.06, stability: -0.02 },
    },
    sacred_sites: [],
    spread_method: 'mystery',
    affinity: {
      olympian: 0.8,
      demeter_kore: 0.7,
      earth_spirits: 0.5,
      elymian_aphrodite: 0.4,
      punic_pantheon: 0.2,
      adranon: 0.3,
    },
  },

  // ── ПУНИЙСКИЕ ──────────────────────────────────────────────────────────

  punic_pantheon: {
    name: 'Пантеон Баал-Танит',
    group: 'punic',
    color: '#CC5500',
    icon: '☀',
    desc: 'Баал-Хаммон — владыка неба и плодородия. Танит — его супруга, покровительница Карфагена. Молох, Решеф, Эшмун. Строгая обрядность, человеческие жертвоприношения (тофет).',
    institutionalization: 78,
    domains: ['плодородие', 'война', 'торговля', 'жертвоприношение'],
    bonuses: {
      base:       { military_morale: 0.02, trade_income: 0.02 },
      fervor_50:  { military_morale: 0.04, trade_income: 0.03, legitimacy: 2 },
      fervor_80:  { military_morale: 0.05, trade_income: 0.04, legitimacy: 4, happiness: -2 },
    },
    sacred_sites: ['r2412'], // Лилибей — оплот пунийцев на Сицилии
    spread_method: 'trade',
    affinity: {
      melqart: 0.9,
      olympian: 0.2,
      elymian_aphrodite: 0.5, // Астарта ≈ Афродита Эрицина
      demeter_kore: 0.2,
      earth_spirits: 0.1,
      adranon: 0.1,
    },
  },

  melqart: {
    name: 'Культ Мелькарта',
    group: 'punic',
    color: '#E87040',
    icon: '🔱',
    desc: 'Мелькарт — «царь города», бог-покровитель Тира и всех финикийских колоний. Отождествлён с Гераклом. Культ мореплавателей и торговцев.',
    institutionalization: 55,
    domains: ['море', 'торговля', 'колонизация', 'сила'],
    bonuses: {
      base:       { naval_strength: 0.02, trade_income: 0.02 },
      fervor_50:  { naval_strength: 0.04, trade_income: 0.04 },
      fervor_80:  { naval_strength: 0.06, trade_income: 0.05, diplomacy: 2 },
    },
    sacred_sites: ['r249'], // Солунт — финикийский порт
    spread_method: 'trade',
    affinity: {
      punic_pantheon: 0.9,
      olympian: 0.3, // Мелькарт ≈ Геракл
      elymian_aphrodite: 0.4,
      dionysian: 0.2,
      adranon: 0.2,
    },
  },

  // ── КОРЕННЫЕ ───────────────────────────────────────────────────────────

  adranon: {
    name: 'Культ Адраноса',
    group: 'indigenous',
    color: '#FF4500',
    icon: '🔥',
    desc: 'Адранос — сикульский бог огня и войны. Его храм у подножия Этны охраняли священные псы (кирнские собаки). Огонь Этны — его дыхание. Греки отождествляли с Гефестом.',
    institutionalization: 32,
    domains: ['огонь', 'война', 'вулкан', 'животные'],
    bonuses: {
      base:       { military_morale: 0.02 },
      fervor_50:  { military_morale: 0.04, army_strength: 0.02, garrison_defense: 0.03 },
      fervor_80:  { military_morale: 0.06, army_strength: 0.03, garrison_defense: 0.05 },
    },
    sacred_sites: ['r245'], // Катания — у подножия Этны
    spread_method: 'migration',
    affinity: {
      earth_spirits: 0.8,
      sican_earth: 0.6,
      olympian: 0.4, // Адранос ≈ Гефест
      demeter_kore: 0.3,
      punic_pantheon: 0.1,
    },
  },

  earth_spirits: {
    name: 'Духи Земли и Предков',
    group: 'indigenous',
    color: '#228B22',
    icon: '🌿',
    desc: 'Древнейшая религия Сицилии. Одушевление рек, гор, источников. Культ предков, погребальные обряды. Нет храмов — есть священные рощи, пещеры, горные вершины.',
    institutionalization: 12,
    domains: ['природа', 'предки', 'целительство', 'земля'],
    bonuses: {
      base:       { food_production: 0.02, happiness: 1 },
      fervor_50:  { food_production: 0.03, happiness: 2, stability: 0.02 },
      fervor_80:  { food_production: 0.04, happiness: 3, stability: 0.03, assimilation_speed: -0.04 },
    },
    sacred_sites: ['r2420'], // Капитий — горная крепость сикулов
    spread_method: 'migration',
    affinity: {
      adranon: 0.8,
      sican_earth: 0.9,
      demeter_kore: 0.6, // Деметра — тоже богиня земли
      olympian: 0.3,
      dionysian: 0.5,
      punic_pantheon: 0.1,
    },
  },

  sican_earth: {
    name: 'Сиканские обряды Земли-Матери',
    group: 'indigenous',
    color: '#6B8E23',
    icon: '🏔',
    desc: 'Сиканы — древнейшее население Сицилии. Культ Земли-Матери, пещерные святилища, камни-менгиры. Жрицы-женщины хранят знания трав и родов.',
    institutionalization: 15,
    domains: ['земля', 'деторождение', 'целительство', 'пещеры'],
    bonuses: {
      base:       { population_growth: 0.001, food_production: 0.01 },
      fervor_50:  { population_growth: 0.002, food_production: 0.02, happiness: 2 },
      fervor_80:  { population_growth: 0.003, food_production: 0.03, happiness: 3, assimilation_speed: -0.05 },
    },
    sacred_sites: ['r2423'], // Миттистратон — сиканская глубинка
    spread_method: 'migration',
    affinity: {
      earth_spirits: 0.9,
      adranon: 0.6,
      demeter_kore: 0.5,
      elymian_aphrodite: 0.4,
      olympian: 0.2,
      punic_pantheon: 0.1,
    },
  },

  // ── СИНКРЕТИЧЕСКАЯ ─────────────────────────────────────────────────────

  elymian_aphrodite: {
    name: 'Культ Афродиты Эрицины',
    group: 'syncretic',
    color: '#FF69B4',
    icon: '🕊',
    desc: 'На горе Эрикс — древнейшее святилище Астарты/Афродиты. Элимы объединили финикийскую Астарту и греческую Афродиту. Священная проституция, голуби, благовония. Паломники со всего Средиземноморья.',
    institutionalization: 55,
    domains: ['любовь', 'плодородие', 'дипломатия', 'торговля'],
    bonuses: {
      base:       { diplomacy: 2, trade_income: 0.02 },
      fervor_50:  { diplomacy: 3, trade_income: 0.03, happiness: 2, assimilation_speed: 0.04 },
      fervor_80:  { diplomacy: 5, trade_income: 0.05, happiness: 3, assimilation_speed: 0.08 },
    },
    sacred_sites: ['r2413'], // Эрикс — святилище Афродиты/Астарты
    spread_method: 'pilgrimage',
    affinity: {
      olympian: 0.6,
      punic_pantheon: 0.5,
      melqart: 0.4,
      demeter_kore: 0.5,
      dionysian: 0.4,
      earth_spirits: 0.3,
      sican_earth: 0.4,
      adranon: 0.2,
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════
//  РЕЛИГИОЗНЫЕ ГРУППЫ — модификаторы распространения
// ══════════════════════════════════════════════════════════════════════════

const RELIGION_GROUPS = {
  hellenic:   { name: 'Эллинская',      spread_modifier: 1.0,  resistance: 0.3 },
  punic:      { name: 'Пунийская',      spread_modifier: 0.8,  resistance: 0.5 },
  indigenous: { name: 'Коренная',       spread_modifier: 0.4,  resistance: 0.8 },
  mystery:    { name: 'Мистериальная',  spread_modifier: 1.2,  resistance: 0.2 },
  syncretic:  { name: 'Синкретическая', spread_modifier: 1.0,  resistance: 0.1 },
};

// ══════════════════════════════════════════════════════════════════════════
//  КОНФИГУРАЦИЯ
// ══════════════════════════════════════════════════════════════════════════

const RELIGION_CONFIG = {
  // Распространение
  SPREAD_BASE_RATE:          0.003,  // базовая скорость распространения/год
  SPREAD_TRADE_MULTIPLIER:   0.8,    // множитель по торговым путям
  SPREAD_NEIGHBOR_RATE:      0.001,  // диффузия к соседним регионам/год
  SPREAD_SACRED_SITE_BONUS:  0.05,   // бонус в регионе со святилищем
  SPREAD_TEMPLE_BONUS:       0.02,   // бонус за каждый храм

  // Институционализация
  INST_GROWTH_PER_TEMPLE:    0.3,    // рост институционализации за храм/год
  INST_GROWTH_STABILITY:     0.1,    // рост при стабильности > 60
  INST_DECAY_WAR:            0.2,    // падение при войне/год
  INST_DECAY_FAMINE:         0.4,    // падение при голоде/год

  // Синкретизм
  SYNCRETISM_THRESHOLD:      0.25,   // минимум fervor для обеих религий
  SYNCRETISM_YEARS:          20,     // лет сосуществования
  SYNCRETISM_CHANCE:         0.03,   // шанс/год при выполнении условий

  // Кризисы
  CRISIS_CHECK_INTERVAL:     120,    // ходов между проверками (10 лет)
  SCHISM_INST_THRESHOLD:     70,     // мин. институционализация для раскола
  PROPHET_SUFFERING_THRESHOLD: 60,   // мин. exp_suffering для пророка

  // Влияние на государство
  OFFICIAL_RELIGION_BONUS:   0.02,   // бонус fervor для официальной религии/год
  PERSECUTION_FERVOR_LOSS:   0.04,   // потеря fervor при гонениях/год
  PERSECUTION_HAPPINESS_COST: 3,     // цена счастья за гонения
  PATRONAGE_COST_PER_TURN:  50,      // золота за покровительство/ход
};
