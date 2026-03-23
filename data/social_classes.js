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
// Источники калибровки:
//   Зерно: Полибий — паёк легионера ~870 г зерна/день = ~320 кг/год.
//          Катон «О земледелии» — полевой раб ~700 г хлеба/день ≈ 255-320 кг зерна/год.
//          Норма выживания взрослого ~200 кг зерна/год.
//   Вино:  богатые римляне ~0.5 л/день ≈ 180 л/год ≈ 180 кг/год.
//          Бедные ~0.1-0.2 л/день. Корабельный паёк ~0.1 л/день.
//   Масло: ~10-25 кг/год (кулинария + освещение + гигиена).
//   Соль:  ~3-7 кг/год (еда + консервация продуктов).
// ─────────────────────────────────────────────────────────────────────────
const SOCIAL_CLASSES = {

  // ── АРИСТОКРАТЫ ────────────────────────────────────────────────────────
  // Сидячий труд. Зерна мало — калории покрывают вино, масло, рыба.
  // Пшеница — статусный белый хлеб, а не основа питания.
  // 150 кг пшеницы + 200 л вина + 25 кг масла на человека в год.
  aristocrats: {
    name:          'Аристократы',
    name_gen:      'аристократов',
    icon:          '👑',
    description:   'Землевладельцы, полководцы, богатые граждане. Владеют землёй и рабами.',
    color:         '#9C27B0',
    wealth_level:  5,
    political_weight: 0.20,
    needs: {
      wheat:       { per_100: 15_000, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100:    600, priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 20_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  2_500, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_000, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    800, priority: 'standard', label: 'Ткань' },
      pottery:     { per_100:    500, priority: 'standard', label: 'Керамика' },
      papyrus:     { per_100:    200, priority: 'standard', label: 'Папирус' },
      honey:       { per_100:    150, priority: 'luxury',   label: 'Мёд' },
      incense:     { per_100:     50, priority: 'luxury',   label: 'Благовония' },
      purple_dye:  { per_100:      5, priority: 'luxury',   label: 'Пурпур' },
    },
    unhappy_effects: {
      conspiracy_chance_mod: +0.12,
      legitimacy_mod: -1,
    },
    happy_effects: {
      tax_efficiency_mod: +0.05,
      legitimacy_mod: +0.5,
    },
  },

  // ── ЧИНОВНИКИ ──────────────────────────────────────────────────────────
  // Лёгкий труд (~2300 ккал/день). 200 кг пшеницы + 100 л вина + 18 кг масла.
  // Высокий расход папируса — профессиональная необходимость.
  officials: {
    name:          'Чиновники',
    name_gen:      'чиновников',
    icon:          '📜',
    description:   'Налоговые сборщики, судьи, писцы, городские магистраты.',
    color:         '#5C6BC0',
    wealth_level:  4,
    political_weight: 0.12,
    needs: {
      wheat:       { per_100: 20_000, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 10_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_800, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:    800, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    600, priority: 'standard', label: 'Ткань' },
      papyrus:     { per_100:    500, priority: 'standard', label: 'Папирус' },
      wax:         { per_100:    200, priority: 'standard', label: 'Воск' },
      pottery:     { per_100:    300, priority: 'standard', label: 'Керамика' },
      honey:       { per_100:     80, priority: 'luxury',   label: 'Мёд' },
    },
    unhappy_effects: {
      tax_efficiency_mod: -0.10,
      conspiracy_chance_mod: +0.05,
    },
    happy_effects: {
      tax_efficiency_mod: +0.08,
    },
  },

  // ── ЖРЕЧЕСТВО ──────────────────────────────────────────────────────────
  // Сидячий труд. Масло и вино — ритуальные. Главный потребитель благовоний:
  // 5 кг/жреца/год (храмовые курения ежедневно).
  clergy_class: {
    name:          'Жречество',
    name_gen:      'жречества',
    icon:          '🏛',
    description:   'Жрецы, оракулы, храмовые служители. Посредники между богами и людьми.',
    color:         '#FF8F00',
    wealth_level:  3,
    political_weight: 0.10,
    needs: {
      wheat:       { per_100: 20_000, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      olive_oil:   { per_100:  2_000, priority: 'standard', label: 'Оливковое масло' },
      wine:        { per_100:  8_000, priority: 'standard', label: 'Вино (обряды)' },
      fish:        { per_100:    800, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    500, priority: 'standard', label: 'Ткань' },
      incense:     { per_100:    500, priority: 'standard', label: 'Благовония' },
      papyrus:     { per_100:    300, priority: 'standard', label: 'Папирус' },
      wax:         { per_100:    300, priority: 'standard', label: 'Воск' },
      pottery:     { per_100:    300, priority: 'standard', label: 'Керамика' },
      honey:       { per_100:     80, priority: 'luxury',   label: 'Мёд' },
    },
    unhappy_effects: {
      happiness_base_mod: -5,
      conspiracy_chance_mod: +0.04,
    },
    happy_effects: {
      happiness_base_mod: +5,
    },
  },

  // ── СВОБОДНЫЕ ГРАЖДАНЕ ─────────────────────────────────────────────────
  // Лёгкий труд (~2300 ккал/день). 180 кг пшеницы + 80 кг ячменя.
  // Рыба — регулярный продукт в Средиземноморье: 15 кг/чел/год.
  citizens: {
    name:          'Свободные граждане',
    name_gen:      'свободных граждан',
    icon:          '🏪',
    description:   'Торговцы, зажиточные ремесленники, мелкие землевладельцы.',
    color:         '#26A69A',
    wealth_level:  3,
    political_weight: 0.18,
    needs: {
      wheat:       { per_100: 18_000, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100:  8_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      wine:        { per_100:  6_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_500, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_500, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    400, priority: 'standard', label: 'Ткань' },
      pottery:     { per_100:    400, priority: 'standard', label: 'Керамика' },
      tools:       { per_100:    200, priority: 'standard', label: 'Инструменты' },
      honey:       { per_100:     60, priority: 'luxury',   label: 'Мёд' },
    },
    unhappy_effects: {
      trade_income_mod: -0.10,
      conspiracy_chance_mod: +0.04,
    },
    happy_effects: {
      trade_income_mod: +0.08,
    },
  },

  // ── РЕМЕСЛЕННИКИ ───────────────────────────────────────────────────────
  // Тяжёлый физический труд (~2700 ккал/день).
  // 150 кг пшеницы + 150 кг ячменя. Инструменты: 10 кг/чел/год — рабочий износ.
  craftsmen_class: {
    name:          'Ремесленники',
    name_gen:      'ремесленников',
    icon:          '⚒',
    description:   'Кузнецы, гончары, ткачи, плотники, строители.',
    color:         '#8D6E63',
    wealth_level:  2,
    political_weight: 0.12,
    needs: {
      wheat:       { per_100: 15_000, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 15_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    400, priority: 'basic',    label: 'Соль' },
      wine:        { per_100:  3_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_200, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  2_000, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    300, priority: 'standard', label: 'Ткань' },
      wool:        { per_100:    300, priority: 'standard', label: 'Шерсть' },
      tools:       { per_100:  1_000, priority: 'standard', label: 'Инструменты' },
      iron:        { per_100:    400, priority: 'standard', label: 'Железо' },
      leather:     { per_100:    200, priority: 'standard', label: 'Кожа' },
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
    },
    unhappy_effects: {
      production_mod: -0.15,
    },
    happy_effects: {
      production_mod: +0.10,
    },
  },

  // ── ЗЕМЛЕДЕЛЬЦЫ ────────────────────────────────────────────────────────
  // Очень тяжёлый труд. В основном ячмень — дешевле пшеницы.
  // 50 кг пшеницы + 250 кг ячменя. Соль важна: консервация продуктов.
  // Сушёная рыба: 15 кг/чел/год — доступный белок для бедных.
  farmers_class: {
    name:          'Земледельцы',
    name_gen:      'земледельцев',
    icon:          '🌾',
    description:   'Крестьяне, арендаторы, мелкие свободные фермеры.',
    color:         '#66BB6A',
    wealth_level:  1,
    political_weight: 0.10,
    needs: {
      wheat:       { per_100:  5_000, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 25_000, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100:    400, priority: 'basic',    label: 'Соль' },
      olive_oil:   { per_100:  1_000, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_500, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    200, priority: 'standard', label: 'Ткань' },
      wool:        { per_100:    200, priority: 'standard', label: 'Шерсть' },
      tools:       { per_100:    500, priority: 'standard', label: 'Инструменты' },
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
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
  // Очень тяжёлый труд. Рыба — основной белок (60 кг/чел/год).
  // Соль высокая (9 кг): консервация рыбы в море + личный расход.
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
      wheat:       { per_100: 12_000, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 16_000, priority: 'basic',    label: 'Ячмень' },
      fish:        { per_100:  6_000, priority: 'basic',    label: 'Рыба' },
      salt:        { per_100:    900, priority: 'basic',    label: 'Соль' },
      wine:        { per_100:  4_000, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:  1_000, priority: 'standard', label: 'Оливковое масло' },
      cloth:       { per_100:    200, priority: 'standard', label: 'Ткань' },
      wool:        { per_100:    300, priority: 'standard', label: 'Шерсть (такелаж)' },
      leather:     { per_100:    300, priority: 'standard', label: 'Кожа' },
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
    },
    unhappy_effects: {
      trade_income_mod: -0.12,
    },
    happy_effects: {
      trade_income_mod: +0.10,
    },
  },

  // ── СОЛДАТЫ ────────────────────────────────────────────────────────────
  // Полибий: легионер получал 2/3 аттического медимна пшеницы в месяц
  //   = ~27 кг/мес = 324 кг/год. Здесь: 320 кг/чел/год.
  // Соль: традиционный "salarium" — часть жалованья солдата.
  soldiers_class: {
    name:          'Солдаты',
    name_gen:      'солдат',
    icon:          '🗡',
    description:   'Ополченцы, наёмники, гарнизонные войска.',
    color:         '#EF5350',
    wealth_level:  2,
    political_weight: 0.08,
    needs: {
      wheat:       { per_100: 32_000, priority: 'basic',    label: 'Зерно (паёк)' },
      barley:      { per_100:  3_000, priority: 'basic',    label: 'Ячмень (штрафной паёк)' },
      salt:        { per_100:    500, priority: 'basic',    label: 'Соль' },
      wine:        { per_100:  2_500, priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100:    800, priority: 'standard', label: 'Оливковое масло' },
      fish:        { per_100:  1_000, priority: 'standard', label: 'Рыба' },
      cloth:       { per_100:    300, priority: 'standard', label: 'Ткань' },
      iron:        { per_100:    500, priority: 'standard', label: 'Железо (снаряжение)' },
      leather:     { per_100:    500, priority: 'standard', label: 'Кожа (доспех)' },
      tools:       { per_100:    200, priority: 'standard', label: 'Инструменты' },
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
      cloth:       { per_100:    200, priority: 'standard', label: 'Ткань' },
      pottery:     { per_100:    200, priority: 'standard', label: 'Керамика' },
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
      cloth:       { per_100:    100, priority: 'standard', label: 'Ткань' },
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
