// ══════════════════════════════════════════════════════════════════════════
//  ДОГМЫ РЕЛИГИЙ — Каноны и Доктрины
//
//  Система «Вариант C»:
//    3 фиксированных канона (дискретные, мутируют ~50 лет)
//    3 оси доктрин (числовые 0–100, дрейфуют ±1-2/год)
//
//  КАНОНЫ: слоты с вариантами, у каждого — бонусы и мутации
//  ДОКТРИНЫ: оси со значением 0–100, бонусы зависят от положения
// ══════════════════════════════════════════════════════════════════════════

// ── КАТЕГОРИИ КАНОНОВ ──────────────────────────────────────────────────

const CANON_CATEGORIES = {
  marriage: { name: 'Брак и семья', icon: '💍' },
  afterlife: { name: 'Загробный мир', icon: '💀' },
  sacrifice: { name: 'Жертвоприношения', icon: '🔪' },
};

// ── ОПРЕДЕЛЕНИЯ КАНОНОВ ────────────────────────────────────────────────
//
//  Каждый канон:
//    category   — в какой слот ставится
//    name       — название для UI
//    desc       — описание
//    bonus      — бонусы к нации (как у традиций)
//    mut        — массив мутаций: { to, need, w }
//      need:
//        inst_min/max     — институционализация доминантной религии
//        doctrine_min/max — значение оси доктрины (tolerance, hierarchy, asceticism)
//        war              — нация воюет
//        peace            — мирное время (число ходов)
//        happiness_min/max — порог счастья
//        group            — группа религии (hellenic, punic, indigenous, mystery, syncretic)
// ══════════════════════════════════════════════════════════════════════════

const CANONS = {

  // ══════════════ БРАК И СЕМЬЯ ══════════════

  sacred_monogamy: {
    category: 'marriage',
    name: 'Священная моногамия',
    desc: 'Брак — священный союз перед богами. Один муж, одна жена. Развод — святотатство. Укрепляет стабильность.',
    bonus: { stability: 0.03, legitimacy: 2, happiness: -1 },
    mut: [
      { to: 'priestly_celibacy', need: { inst_min: 60, doctrine_asceticism_max: 35 }, w: 1.0 },
      { to: 'free_union', need: { doctrine_tolerance_min: 70, happiness_min: 60 }, w: 0.8 },
    ],
  },

  noble_polygamy: {
    category: 'marriage',
    name: 'Полигамия знати',
    desc: 'Простой люд живёт в моногамии, но знать и правители вправе иметь несколько жён. Политические браки укрепляют союзы.',
    bonus: { diplomacy: 3, population_growth: 0.001, stability: -0.01 },
    mut: [
      { to: 'sacred_monogamy', need: { inst_min: 65, doctrine_hierarchy_min: 60 }, w: 0.9 },
      { to: 'free_union', need: { doctrine_tolerance_min: 75 }, w: 0.6 },
    ],
  },

  priestly_celibacy: {
    category: 'marriage',
    name: 'Безбрачие жрецов',
    desc: 'Жрецы отрекаются от плотских уз ради чистоты служения. Народ чтит их аскезу. Высокая легитимность, но жречество малочисленно.',
    bonus: { legitimacy: 4, stability: 0.02, population_growth: -0.001 },
    mut: [
      { to: 'sacred_monogamy', need: { doctrine_asceticism_min: 60, happiness_max: 40 }, w: 0.7 },
      { to: 'ritual_marriage', need: { group: 'mystery', doctrine_asceticism_max: 40 }, w: 0.8 },
    ],
  },

  free_union: {
    category: 'marriage',
    name: 'Свободный союз',
    desc: 'Боги не вмешиваются в дела сердца. Союзы создаются и расторгаются по воле людей. Счастье выше, но стабильность страдает.',
    bonus: { happiness: 3, assimilation_speed: 0.03, stability: -0.02, legitimacy: -2 },
    mut: [
      { to: 'sacred_monogamy', need: { doctrine_hierarchy_min: 65, inst_min: 55 }, w: 0.9 },
      { to: 'noble_polygamy', need: { doctrine_tolerance_min: 40, doctrine_tolerance_max: 70 }, w: 0.6 },
    ],
  },

  ritual_marriage: {
    category: 'marriage',
    name: 'Ритуальный брак',
    desc: 'Священный брак — иерогамия. Жрец и жрица воспроизводят союз божеств. Плодородие земли зависит от обряда.',
    bonus: { food_production: 0.03, happiness: 1, legitimacy: 2 },
    mut: [
      { to: 'sacred_monogamy', need: { doctrine_hierarchy_min: 70, inst_min: 60 }, w: 0.7 },
      { to: 'free_union', need: { doctrine_tolerance_min: 70 }, w: 0.5 },
    ],
  },

  // ══════════════ ЗАГРОБНЫЙ МИР ══════════════

  cult_of_heroes: {
    category: 'afterlife',
    name: 'Культ героев',
    desc: 'Великие воины и основатели полисов обретают посмертную славу. Их могилы — святилища, их дух хранит город.',
    bonus: { military_morale: 0.03, legitimacy: 3, garrison_defense: 0.02 },
    mut: [
      { to: 'underworld_judgment', need: { inst_min: 55, doctrine_hierarchy_min: 50 }, w: 1.0 },
      { to: 'dissolution_in_nature', need: { group: 'indigenous', doctrine_asceticism_max: 30 }, w: 0.7 },
    ],
  },

  underworld_judgment: {
    category: 'afterlife',
    name: 'Суд мёртвых',
    desc: 'Души предстают перед судом подземных богов. Праведники — на Елисейские поля, грешники — в Тартар. Страх наказания хранит порядок.',
    bonus: { stability: 0.04, happiness: -1, legitimacy: 2 },
    mut: [
      { to: 'rebirth_cycle', need: { doctrine_tolerance_min: 60, group: 'mystery' }, w: 0.9 },
      { to: 'cult_of_heroes', need: { war: true, doctrine_hierarchy_max: 40 }, w: 0.7 },
    ],
  },

  rebirth_cycle: {
    category: 'afterlife',
    name: 'Цикл перерождений',
    desc: 'Душа возвращается в мир в новом теле. Орфические и пифагорейские учения. Вегетарианство, очищение, тайные обряды.',
    bonus: { happiness: 2, assimilation_speed: 0.04, military_morale: -0.02 },
    mut: [
      { to: 'underworld_judgment', need: { inst_min: 65, doctrine_hierarchy_min: 60 }, w: 0.8 },
      { to: 'dissolution_in_nature', need: { doctrine_asceticism_max: 25 }, w: 0.6 },
    ],
  },

  dissolution_in_nature: {
    category: 'afterlife',
    name: 'Растворение в природе',
    desc: 'Смерть — возвращение в круговорот стихий. Дух уходит в реки, деревья, камни. Нет рая и ада — есть вечный поток жизни.',
    bonus: { food_production: 0.02, happiness: 1, assimilation_speed: -0.03 },
    mut: [
      { to: 'cult_of_heroes', need: { war: true, doctrine_hierarchy_min: 40 }, w: 0.8 },
      { to: 'rebirth_cycle', need: { doctrine_tolerance_min: 55, inst_min: 40 }, w: 0.7 },
    ],
  },

  ancestor_watch: {
    category: 'afterlife',
    name: 'Стражи предков',
    desc: 'Мёртвые не уходят — они наблюдают. Духи предков защищают живых, карают предателей, дают советы через сны и знамения.',
    bonus: { garrison_defense: 0.03, stability: 0.02, happiness: 1 },
    mut: [
      { to: 'cult_of_heroes', need: { inst_min: 45, war: true }, w: 0.9 },
      { to: 'dissolution_in_nature', need: { peace: 240, doctrine_asceticism_max: 35 }, w: 0.6 },
    ],
  },

  // ══════════════ ЖЕРТВОПРИНОШЕНИЯ ══════════════

  bloodless_offerings: {
    category: 'sacrifice',
    name: 'Бескровные дары',
    desc: 'Богам подносят первины урожая, вино, мёд, благовония. Кровь не проливается — чистота обряда важнее.',
    bonus: { happiness: 2, food_production: 0.01, trade_income: 0.02 },
    mut: [
      { to: 'animal_sacrifice', need: { inst_min: 45, doctrine_hierarchy_min: 45 }, w: 1.0 },
      { to: 'self_mortification', need: { doctrine_asceticism_max: 25, happiness_max: 35 }, w: 0.6 },
    ],
  },

  animal_sacrifice: {
    category: 'sacrifice',
    name: 'Жертвы животных',
    desc: 'Быки, овцы, козы — кровь на алтарь, мясо на пир. Гекатомбы в дни великих празднеств. Щедрость жертвы — мера благочестия.',
    bonus: { legitimacy: 2, military_morale: 0.02, food_production: -0.01 },
    mut: [
      { to: 'ritual_combat', need: { war: true, doctrine_hierarchy_min: 55 }, w: 0.9 },
      { to: 'bloodless_offerings', need: { doctrine_asceticism_max: 30, peace: 360 }, w: 0.7 },
      { to: 'human_sacrifice', need: { group: 'punic', inst_min: 65, doctrine_hierarchy_min: 65 }, w: 0.5 },
    ],
  },

  ritual_combat: {
    category: 'sacrifice',
    name: 'Ритуальные бои',
    desc: 'Воинские состязания перед богами. Кровь бойцов — лучшая жертва. Погибший в поединке обретает вечную славу.',
    bonus: { military_morale: 0.04, army_strength: 0.02, happiness: -1 },
    mut: [
      { to: 'animal_sacrifice', need: { peace: 240, doctrine_hierarchy_max: 45 }, w: 0.8 },
      { to: 'self_mortification', need: { doctrine_asceticism_max: 30, happiness_max: 35 }, w: 0.6 },
    ],
  },

  self_mortification: {
    category: 'sacrifice',
    name: 'Самоистязание',
    desc: 'Жрецы и адепты наносят себе раны, постятся, не спят. Через страдание тела — к очищению духа. Народ в благоговейном ужасе.',
    bonus: { legitimacy: 3, stability: 0.02, happiness: -2, population_growth: -0.001 },
    mut: [
      { to: 'bloodless_offerings', need: { happiness_min: 55, doctrine_asceticism_min: 60 }, w: 0.8 },
      { to: 'ritual_combat', need: { war: true }, w: 0.7 },
    ],
  },

  human_sacrifice: {
    category: 'sacrifice',
    name: 'Человеческие жертвы',
    desc: 'Тофет Баал-Хаммона. Первенцев отдают огню в час великой нужды. Ужас соседей, но вера непоколебима.',
    bonus: { military_morale: 0.05, legitimacy: 3, happiness: -3, diplomacy: -4 },
    mut: [
      { to: 'animal_sacrifice', need: { doctrine_tolerance_min: 50, happiness_max: 30 }, w: 1.0 },
      { to: 'ritual_combat', need: { war: true, doctrine_hierarchy_max: 50 }, w: 0.7 },
    ],
  },
};

// ── ОСИ ДОКТРИН ────────────────────────────────────────────────────────
//
//  Каждая ось: 0–100
//  low_name / high_name — названия крайностей
//  breakpoints — пороги, при которых включаются бонусы
//    Формат: { threshold, compare, bonus }
//    compare: 'lte' (≤) или 'gte' (≥)
// ══════════════════════════════════════════════════════════════════════════

const DOCTRINE_AXES = {
  tolerance: {
    name: 'Толерантность',
    icon: '🤝',
    low_name: 'Фанатизм',
    high_name: 'Открытость',
    low_icon: '🔥',
    high_icon: '🕊',
    desc_low: 'Наша вера — единственная истина. Чужие боги — демоны.',
    desc_high: 'Боги многолики. В чужой вере можно найти крупицы истины.',
    breakpoints: [
      // Фанатизм (0–25): +мораль, −дипломатия, −ассимиляция
      { threshold: 25, compare: 'lte', bonus: { military_morale: 0.04, diplomacy: -3, assimilation_speed: -0.04 } },
      // Консерватизм (26–40): +мораль слабее, −дипломатия слабее
      { threshold: 40, compare: 'lte', bonus: { military_morale: 0.02, diplomacy: -1 } },
      // Открытость (60–74): +дипломатия, +ассимиляция
      { threshold: 60, compare: 'gte', bonus: { diplomacy: 2, assimilation_speed: 0.02 } },
      // Синкретизм (75–100): +дипломатия, +ассимиляция, +торговля, −стабильность
      { threshold: 75, compare: 'gte', bonus: { diplomacy: 4, assimilation_speed: 0.05, trade_income: 0.02, stability: -0.02 } },
    ],
  },

  hierarchy: {
    name: 'Организованность',
    icon: '🏛',
    low_name: 'Народная вера',
    high_name: 'Иерархия',
    low_icon: '🌾',
    high_icon: '⛪',
    desc_low: 'Каждый сам общается с богами. Нет жрецов — есть старейшины и знахари.',
    desc_high: 'Жречество — опора государства. Храмы, обряды, каноны — всё подчинено порядку.',
    breakpoints: [
      // Народная вера (0–25): +распространение, +счастье, −стабильность
      { threshold: 25, compare: 'lte', bonus: { happiness: 2, assimilation_speed: 0.03, stability: -0.02 } },
      // Свободное вероисповедание (26–40): +счастье слабее
      { threshold: 40, compare: 'lte', bonus: { happiness: 1 } },
      // Организованный культ (60–74): +стабильность, +легитимность
      { threshold: 60, compare: 'gte', bonus: { stability: 0.02, legitimacy: 2 } },
      // Теократия (75–100): +стабильность, +легитимность, −счастье, −ассимиляция
      { threshold: 75, compare: 'gte', bonus: { stability: 0.04, legitimacy: 4, happiness: -2, assimilation_speed: -0.03 } },
    ],
  },

  asceticism: {
    name: 'Аскетизм',
    icon: '⚖',
    low_name: 'Аскеза',
    high_name: 'Роскошь',
    low_icon: '🪨',
    high_icon: '👑',
    desc_low: 'Истинная вера — в отречении от мирских благ. Простота, пост, молитва.',
    desc_high: 'Богатство храмов — слава богов. Золотые статуи, пышные праздники, щедрые пиры.',
    breakpoints: [
      // Аскеза (0–25): +легитимность, +стабильность, −счастье, −торговля
      { threshold: 25, compare: 'lte', bonus: { legitimacy: 3, stability: 0.02, happiness: -2, trade_income: -0.02 } },
      // Умеренность (26–40): +легитимность слабее
      { threshold: 40, compare: 'lte', bonus: { legitimacy: 1 } },
      // Праздничность (60–74): +счастье, +торговля
      { threshold: 60, compare: 'gte', bonus: { happiness: 2, trade_income: 0.02 } },
      // Роскошь (75–100): +счастье, +торговля, −легитимность, −стабильность
      { threshold: 75, compare: 'gte', bonus: { happiness: 3, trade_income: 0.04, legitimacy: -2, stability: -0.02 } },
    ],
  },
};

// ── НАЧАЛЬНЫЕ ДОГМЫ ДЛЯ КАЖДОЙ РЕЛИГИИ ────────────────────────────────
//
//  canons: [marriage_canon, afterlife_canon, sacrifice_canon]
//  doctrines: { tolerance, hierarchy, asceticism }  — каждое 0–100
//  locked_canon: индекс канона который не мутирует (0/1/2 или null)
// ══════════════════════════════════════════════════════════════════════════

const RELIGION_DOGMAS = {

  olympian: {
    canons: ['sacred_monogamy', 'cult_of_heroes', 'animal_sacrifice'],
    locked_canon: 1, // cult_of_heroes — фундамент олимпийской религии
    doctrines: { tolerance: 55, hierarchy: 60, asceticism: 65 },
  },

  demeter_kore: {
    canons: ['ritual_marriage', 'underworld_judgment', 'bloodless_offerings'],
    locked_canon: 1, // underworld_judgment — суть мистерий Деметры
    doctrines: { tolerance: 45, hierarchy: 55, asceticism: 40 },
  },

  dionysian: {
    canons: ['free_union', 'rebirth_cycle', 'bloodless_offerings'],
    locked_canon: 1, // rebirth_cycle — орфическое учение
    doctrines: { tolerance: 75, hierarchy: 20, asceticism: 80 },
  },

  punic_pantheon: {
    canons: ['noble_polygamy', 'underworld_judgment', 'human_sacrifice'],
    locked_canon: 2, // human_sacrifice — тофет, ядро пунийского культа
    doctrines: { tolerance: 25, hierarchy: 75, asceticism: 50 },
  },

  melqart: {
    canons: ['noble_polygamy', 'cult_of_heroes', 'animal_sacrifice'],
    locked_canon: 0, // noble_polygamy — финикийская традиция
    doctrines: { tolerance: 40, hierarchy: 55, asceticism: 60 },
  },

  adranon: {
    canons: ['sacred_monogamy', 'ancestor_watch', 'ritual_combat'],
    locked_canon: 2, // ritual_combat — воинский культ Адраноса
    doctrines: { tolerance: 30, hierarchy: 35, asceticism: 35 },
  },

  earth_spirits: {
    canons: ['free_union', 'dissolution_in_nature', 'bloodless_offerings'],
    locked_canon: 1, // dissolution_in_nature — суть анимизма
    doctrines: { tolerance: 60, hierarchy: 10, asceticism: 25 },
  },

  sican_earth: {
    canons: ['ritual_marriage', 'ancestor_watch', 'bloodless_offerings'],
    locked_canon: 0, // ritual_marriage — иерогамия Земли-Матери
    doctrines: { tolerance: 50, hierarchy: 15, asceticism: 30 },
  },

  elymian_aphrodite: {
    canons: ['free_union', 'rebirth_cycle', 'bloodless_offerings'],
    locked_canon: 0, // free_union — культ Афродиты
    doctrines: { tolerance: 70, hierarchy: 45, asceticism: 75 },
  },
};

// ── КОНФИГУРАЦИЯ ДОГМ ──────────────────────────────────────────────────

const DOGMA_CONFIG = {
  // Мутация канонов
  CANON_MUTATION_INTERVAL: 12,       // проверка каждые 12 ходов (1 год)
  CANON_MUTATION_COOLDOWN: 600,      // минимум 600 ходов (50 лет) между мутациями
  CANON_MUTATION_THRESHOLD: 0.6,     // минимальный score для мутации

  // Дрифт доктрин
  DOCTRINE_DRIFT_INTERVAL: 12,      // применяется каждые 12 ходов (1 год)
  DOCTRINE_DRIFT_MAX: 3,            // максимальный сдвиг за год
  DOCTRINE_INERTIA: 0.3,            // сила притяжения к 50 (центру)
};
