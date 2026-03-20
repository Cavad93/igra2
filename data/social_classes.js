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
const SOCIAL_CLASSES = {

  // ── АРИСТОКРАТЫ ────────────────────────────────────────────────────────
  // Нагрузка: сидячая (~2000 ккал/день). Зерна мало — калории покрывают
  // вино, оливковое масло, мёд. Пшеница пшеничная — статусный хлеб,
  // а не основа питания.
  aristocrats: {
    name:          'Аристократы',
    name_gen:      'аристократов',
    icon:          '👑',
    description:   'Землевладельцы, полководцы, богатые граждане. Владеют землёй и рабами.',
    color:         '#9C27B0',
    wealth_level:  5,
    political_weight: 0.20,  // высокое политическое влияние
    needs: {
      wheat:       { per_100: 840, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 28,  priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100: 20,  priority: 'standard', label: 'Оливковое масло' },
      cloth:       { per_100: 14, priority: 'standard', label: 'Ткань' },
      pottery:     { per_100: 8,  priority: 'standard', label: 'Керамика' },
      papyrus:     { per_100: 8,  priority: 'standard', label: 'Папирус' },
      honey:       { per_100: 8,  priority: 'luxury',   label: 'Мёд' },
      incense:     { per_100: 5,  priority: 'luxury',   label: 'Благовония' },
      purple_dye:  { per_100: 2,  priority: 'luxury',   label: 'Пурпур' },
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
  // Нагрузка: лёгкая (~2300 ккал/день). Сидячий труд, часть калорий
  // из вина и масла. Пшеница — основа, но в умеренном количестве.
  officials: {
    name:          'Чиновники',
    name_gen:      'чиновников',
    icon:          '📜',
    description:   'Налоговые сборщики, судьи, писцы, городские магистраты.',
    color:         '#5C6BC0',
    wealth_level:  4,
    political_weight: 0.12,
    needs: {
      wheat:       { per_100: 900, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 16,  priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100: 12, priority: 'standard', label: 'Оливковое масло' },
      cloth:       { per_100: 12, priority: 'standard', label: 'Ткань' },
      papyrus:     { per_100: 20, priority: 'standard', label: 'Папирус' },
      wax:         { per_100: 8,  priority: 'standard', label: 'Воск' },
      pottery:     { per_100: 5,  priority: 'standard', label: 'Керамика' },
      honey:       { per_100: 4,  priority: 'luxury',   label: 'Мёд' },
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
  // Нагрузка: сидячая (~2000 ккал/день). Ритуальный пост и воздержание
  // снижают зерновую норму ниже среднего. Оливковое масло и вино —
  // культовые, а не только пищевые.
  clergy_class: {
    name:          'Жречество',
    name_gen:      'жречества',
    icon:          '🏛',
    description:   'Жрецы, оракулы, храмовые служители. Посредники между богами и людьми.',
    color:         '#FF8F00',
    wealth_level:  3,
    political_weight: 0.10,
    needs: {
      wheat:       { per_100: 780, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      olive_oil:   { per_100: 12,  priority: 'standard', label: 'Оливковое масло' },
      wine:        { per_100: 14, priority: 'standard', label: 'Вино (обряды)' },
      cloth:       { per_100: 12, priority: 'standard', label: 'Ткань' },
      incense:     { per_100: 18, priority: 'standard', label: 'Благовония' },
      papyrus:     { per_100: 12, priority: 'standard', label: 'Папирус' },
      wax:         { per_100: 6,  priority: 'standard', label: 'Воск' },
      pottery:     { per_100: 5,  priority: 'standard', label: 'Керамика' },
      honey:       { per_100: 4,  priority: 'luxury',   label: 'Мёд' },
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
  // Нагрузка: лёгкая (~2300 ккал/день). Торговля и управление — не тяжёлый
  // труд. Пшеница и вино, умеренный достаток.
  citizens: {
    name:          'Свободные граждане',
    name_gen:      'свободных граждан',
    icon:          '🏪',
    description:   'Торговцы, зажиточные ремесленники, мелкие землевладельцы.',
    color:         '#26A69A',
    wealth_level:  3,
    political_weight: 0.18,
    needs: {
      wheat:       { per_100: 840, priority: 'basic',    label: 'Зерно' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 12,  priority: 'standard', label: 'Вино' },
      olive_oil:   { per_100: 9,  priority: 'standard', label: 'Оливковое масло' },
      cloth:       { per_100: 9,  priority: 'standard', label: 'Ткань' },
      pottery:     { per_100: 7,  priority: 'standard', label: 'Керамика' },
      tools:       { per_100: 4,  priority: 'standard', label: 'Инструменты' },
      honey:       { per_100: 3,  priority: 'luxury',   label: 'Мёд' },
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
  // Нагрузка: умеренная–тяжёлая (~2700 ккал/день). Кузнецы, плотники и
  // строители работают физически. Ячмень — дешёвое дополнение к пшенице.
  craftsmen_class: {
    name:          'Ремесленники',
    name_gen:      'ремесленников',
    icon:          '⚒',
    description:   'Кузнецы, гончары, ткачи, плотники, строители.',
    color:         '#8D6E63',
    wealth_level:  2,
    political_weight: 0.12,
    needs: {
      wheat:       { per_100: 960, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 240, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 6,  priority: 'standard', label: 'Вино' },
      cloth:       { per_100: 7,  priority: 'standard', label: 'Ткань' },
      wool:        { per_100: 5,  priority: 'standard', label: 'Шерсть' },
      tools:       { per_100: 12, priority: 'standard', label: 'Инструменты' },
      iron:        { per_100: 4,  priority: 'standard', label: 'Железо' },
      leather:     { per_100: 3,  priority: 'standard', label: 'Кожа' },
      pottery:     { per_100: 6,  priority: 'standard', label: 'Керамика' },
    },
    unhappy_effects: {
      production_mod: -0.15,
    },
    happy_effects: {
      production_mod: +0.10,
    },
  },

  // ── ЗЕМЛЕДЕЛЬЦЫ ────────────────────────────────────────────────────────
  // Нагрузка: тяжёлая (~3200 ккал/день). Пашут, сеют, жнут. Питаются
  // преимущественно ячменём — дешевле пшеницы. Katona: 4 фунта хлеба/день
  // для работника поля. Самые высокие зерновые потребности в игре.
  farmers_class: {
    name:          'Земледельцы',
    name_gen:      'земледельцев',
    icon:          '🌾',
    description:   'Крестьяне, арендаторы, мелкие свободные фермеры.',
    color:         '#66BB6A',
    wealth_level:  1,
    political_weight: 0.10,
    needs: {
      wheat:       { per_100: 780, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 600, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      cloth:       { per_100: 5,  priority: 'standard', label: 'Ткань' },
      wool:        { per_100: 4,  priority: 'standard', label: 'Шерсть' },
      tools:       { per_100: 6,  priority: 'standard', label: 'Инструменты' },
      pottery:     { per_100: 4,  priority: 'standard', label: 'Керамика' },
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
  // Нагрузка: тяжёлая (~3200 ккал/день). Гребля и такелаж — изнурительный
  // труд. Рыба — основной белок и часть калорий; ячмень дополняет зерновую
  // норму. Паёк греческого гребца: пшеница + рыба + вино.
  sailors_class: {
    name:          'Моряки',
    name_gen:      'моряков',
    icon:          '⚓',
    description:   'Рыбаки, морские торговцы, корабельщики, лоцманы.',
    color:         '#1E88E5',
    wealth_level:  2,
    political_weight: 0.06,
    needs: {
      wheat:       { per_100: 840,  priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 240,  priority: 'basic',    label: 'Ячмень' },
      fish:        { per_100: 660,  priority: 'basic',    label: 'Рыба' },
      salt:        { per_100: 3,    priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 9,  priority: 'standard', label: 'Вино' },
      cloth:       { per_100: 6,  priority: 'standard', label: 'Ткань' },
      wool:        { per_100: 5,  priority: 'standard', label: 'Шерсть (такелаж)' },
      leather:     { per_100: 4,  priority: 'standard', label: 'Кожа' },
      pottery:     { per_100: 4,  priority: 'standard', label: 'Керамика' },
    },
    unhappy_effects: {
      trade_income_mod: -0.12,
    },
    happy_effects: {
      trade_income_mod: +0.10,
    },
  },

  // ── СОЛДАТЫ ────────────────────────────────────────────────────────────
  // Нагрузка: тяжёлая (~3200 ккал/день). Полибий: греческий солдат получал
  // 2/3 медимна пшеницы в месяц (~4 модия). Паёк формализован, поэтому
  // зерновая норма выше чем у свободного крестьянина.
  soldiers_class: {
    name:          'Солдаты',
    name_gen:      'солдат',
    icon:          '🗡',
    description:   'Ополченцы, наёмники, гарнизонные войска.',
    color:         '#EF5350',
    wealth_level:  2,
    political_weight: 0.08,
    needs: {
      wheat:       { per_100: 1020, priority: 'basic',    label: 'Зерно (паёк)' },
      barley:      { per_100: 360,  priority: 'basic',    label: 'Ячмень (паёк)' },
      salt:        { per_100: 3,  priority: 'basic',    label: 'Соль' },
      wine:        { per_100: 7,  priority: 'standard', label: 'Вино' },
      cloth:       { per_100: 6,  priority: 'standard', label: 'Ткань' },
      iron:        { per_100: 6,  priority: 'standard', label: 'Железо (снаряжение)' },
      leather:     { per_100: 6,  priority: 'standard', label: 'Кожа (доспех)' },
      tools:       { per_100: 2,  priority: 'standard', label: 'Инструменты' },
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
  // Нагрузка: умеренная–тяжёлая (~2800 ккал/день). Работают поденно,
  // подёнщики и мелкие ремесленники. Ячменя больше чем пшеницы — дешевле.
  freedmen: {
    name:          'Вольноотпущенники',
    name_gen:      'вольноотпущенников',
    icon:          '🔑',
    description:   'Бывшие рабы. Лично свободны, но без гражданских прав.',
    color:         '#78909C',
    wealth_level:  1,
    political_weight: 0.04,
    needs: {
      wheat:       { per_100: 660, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 480, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100: 2,   priority: 'basic',    label: 'Соль' },
      cloth:       { per_100: 5,  priority: 'standard', label: 'Ткань' },
      pottery:     { per_100: 3,  priority: 'standard', label: 'Керамика' },
    },
    unhappy_effects: {
      conspiracy_chance_mod: +0.03,
    },
    happy_effects: {
      production_mod: +0.05,
    },
  },

  // ── РАБЫ ───────────────────────────────────────────────────────────────
  // Нагрузка: тяжёлая (~3200 ккал/день). Катон: 4–4.5 фунта хлеба/день
  // для полевого раба, 3 фунта для надсмотрщика. Паёк намеренно минимален —
  // достаточно чтобы работать, не более. Ячмень вместо пшеницы — дешевле.
  slaves_class: {
    name:          'Рабы',
    name_gen:      'рабов',
    icon:          '⛓',
    description:   'Домашние, рудничные и сельские рабы. Основа производства.',
    color:         '#455A64',
    wealth_level:  0,
    political_weight: 0.00,  // нет политического влияния
    needs: {
      wheat:       { per_100: 540, priority: 'basic',    label: 'Зерно' },
      barley:      { per_100: 360, priority: 'basic',    label: 'Ячмень' },
      salt:        { per_100: 1,  priority: 'basic',    label: 'Соль' },
      cloth:       { per_100: 2,  priority: 'standard', label: 'Ткань' },
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
