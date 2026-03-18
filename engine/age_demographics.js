// ═══════════════════════════════════════════════════════════════════════════
// ВОЗРАСТНАЯ ДЕМОГРАФИЯ
//
// Система моделирует три возрастные когорты населения:
//   children  — от 0 до min_work_age (иждивенцы / частичные работники)
//   adults    — от min_work_age до elder_threshold (основные работники)
//   elderly   — от elder_threshold до смерти (частичные иждивенцы)
//
// Параметры труда определяются трудовыми законами (labor_laws).
// Выходные показатели:
//   nation.demographics.effective_workforce — суммарная рабочая сила (в «взрослых эквивалентах»)
//   nation.demographics.dependency_ratio   — иждивенцы / работники
//   nation.demographics.consumption_mult   — множитель потребления относительно baseline
//   nation.demographics.labor_productivity_mod — множитель производства (1.0 = норма)
//
// Базовые значения откалиброваны под дефолтные законы (work_age_12, women_crafts, elder_55):
//   baseline_labor_ratio      = 0.460  (46% населения работают в адаптированных единицах)
//   BASELINE_CONSUMPTION_MULT = 1.80   (каждый работник кормит 1.8 потребителя)
// ═══════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// БИОЛОГИЧЕСКИЕ КОНСТАНТЫ (Античность ~300 г. до н.э.)
// ──────────────────────────────────────────────────────────────

const AGE_PARAMS = {
  birth_rate_annual:      0.042,   // ~42 на 1000 в год (высокая рождаемость)
  child_mortality_annual: 0.030,   // 3% детской смертности в год
  adult_mortality_annual: 0.012,   // 1.2% взрослой смертности в год (без войны)
  elder_mortality_annual: 0.120,   // 12% смертности пожилых в год (средняя ~10 лет старости)

  // Начальные доли когорт для нации без данных
  initial_children: 0.36,
  initial_adults:   0.54,
  initial_elderly:  0.10,

  // Базовая доля рабочей силы при дефолтных законах:
  //   male_adults (0.27) + female_adults×0.40 (0.108) + children×0.40×0.38 (0.0547) + elder×0.50×0.55 (0.0275)
  //   = 0.460 от общего населения
  baseline_labor_ratio:       0.460,
  // Базовый множитель потребления (потребляемое / работающие взрослые equiv):
  //   (0.270+0.108+0.162+0.086+0.119+0.043+0.040) / 0.460 = 1.798 ≈ 1.80
  baseline_consumption_mult:  1.80,
};

// ──────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ КОГОРТ НАЦИИ (ленивая, при первом обращении)
// ──────────────────────────────────────────────────────────────

function initAgeCohorts(nation) {
  if (nation.demographics) return;

  const total = nation.population?.total || 0;
  nation.demographics = {
    cohort_fractions: {
      children: AGE_PARAMS.initial_children,
      adults:   AGE_PARAMS.initial_adults,
      elderly:  AGE_PARAMS.initial_elderly,
    },
    cohort_counts: {
      children: Math.round(total * AGE_PARAMS.initial_children),
      adults:   Math.round(total * AGE_PARAMS.initial_adults),
      elderly:  Math.round(total * AGE_PARAMS.initial_elderly),
    },
    effective_workforce:    Math.round(total * AGE_PARAMS.baseline_labor_ratio),
    dependency_ratio:       (1.0 - AGE_PARAMS.baseline_labor_ratio) / AGE_PARAMS.baseline_labor_ratio,
    consumption_mult:       AGE_PARAMS.baseline_consumption_mult,
    labor_productivity_mod: 1.0,
    labor_force_ratio:      AGE_PARAMS.baseline_labor_ratio,
  };

  // Применяем трудовые законы по умолчанию
  if (typeof initLaborLaws === 'function' && typeof LAWS_LABOR !== 'undefined') {
    initLaborLaws(nation);
  }

  computeLaborForce(nation);
}

// ──────────────────────────────────────────────────────────────
// ОБНОВЛЕНИЕ ВОЗРАСТНЫХ КОГОРТ (каждый ход)
// Вызывается ПОСЛЕ processDemography() — total уже обновлён.
// ──────────────────────────────────────────────────────────────

function updateAgeCohorts(nation) {
  if (!nation.demographics) initAgeCohorts(nation);

  const dem   = nation.demographics;
  const laws  = _getLaborLaws(nation);
  const pop   = nation.population;
  const total = pop.total;
  const TURNS = _turnsPerYear();

  // Продолжительность фаз жизни в ходах
  const childhood_turns = Math.max(12, laws.min_work_age * TURNS);
  const working_years   = Math.max(5, laws.elder_threshold - laws.min_work_age);
  const working_turns   = working_years * TURNS;

  // Модификаторы от состояния нации
  const foodRatio = _getFoodRatio(nation);
  const birthMod      = foodRatio >= 1.0 ? 1.20 : (foodRatio >= 0.7 ? 0.90 : 0.50);
  const childMortMod  = foodRatio >= 1.0 ? 0.80 : (foodRatio >= 0.7 ? 1.00 : 1.80);
  const adultMortMod  = foodRatio >= 1.0 ? 0.90 : (foodRatio >= 0.7 ? 1.00 : 1.40);

  // Здания снижают смертность
  const healthMod = 1.0
    - (_nationHasBuilding(nation, 'aqueduct') ? 0.15 : 0)
    - (_nationHasBuilding(nation, 'temple')   ? 0.05 : 0)
    - (_nationHasBuilding(nation, 'baths')    ? 0.05 : 0);

  // Текущие абсолютные значения когорт
  const frac     = dem.cohort_fractions;
  const children = frac.children * total;
  const adults   = frac.adults   * total;
  const elderly  = frac.elderly  * total;

  // ── Демографические потоки ──────────────────────────────
  const ratePerTurn = (rate) => rate / TURNS;

  // Рождения (от взрослых женщин репродуктивного возраста)
  const adultFemales = adults * 0.50;
  const births       = adultFemales * ratePerTurn(AGE_PARAMS.birth_rate_annual) * birthMod;

  // Детская смертность
  const childDeaths  = children * ratePerTurn(AGE_PARAMS.child_mortality_annual) * childMortMod * healthMod;

  // Взросление: дети становятся взрослыми (равномерный поток)
  const maturing     = children / childhood_turns;

  // Взрослая смертность
  const adultDeaths  = adults * ratePerTurn(AGE_PARAMS.adult_mortality_annual) * adultMortMod * healthMod;

  // Старение: взрослые становятся пожилыми
  const agingOut     = adults / working_turns;

  // Смертность пожилых
  const elderDeaths  = elderly * ratePerTurn(AGE_PARAMS.elder_mortality_annual) * healthMod;

  // ── Новые значения когорт ─────────────────────────────────
  const newChildren = Math.max(0,  children + births - childDeaths - maturing);
  const newAdults   = Math.max(50, adults + maturing - adultDeaths - agingOut);
  const newElderly  = Math.max(0,  elderly + agingOut - elderDeaths);

  // Нормируем фракции (total управляет demography.js — не трогаем его напрямую)
  const cohortTotal = newChildren + newAdults + newElderly;
  if (cohortTotal > 0) {
    dem.cohort_fractions.children = newChildren / cohortTotal;
    dem.cohort_fractions.adults   = newAdults   / cohortTotal;
    dem.cohort_fractions.elderly  = newElderly  / cohortTotal;
  }

  // Абсолютные числа
  dem.cohort_counts.children = Math.round(dem.cohort_fractions.children * total);
  dem.cohort_counts.adults   = Math.round(dem.cohort_fractions.adults   * total);
  dem.cohort_counts.elderly  = Math.round(dem.cohort_fractions.elderly  * total);

  // Пересчитываем трудовые показатели
  computeLaborForce(nation);

  // Собираем satisfaction-бонусы от трудовых законов
  collectLaborLawBonuses(nation);

  // Записываем историю демографических показателей
  recordDemographicHistory(nation);
}

// ──────────────────────────────────────────────────────────────
// РАСЧЁТ ТРУДОВОЙ СИЛЫ
// Вычисляет effective_workforce, dependency_ratio, consumption_mult,
// labor_productivity_mod из текущих когорт + labor_laws.
// ──────────────────────────────────────────────────────────────

function computeLaborForce(nation) {
  const dem   = nation.demographics;
  if (!dem) return;

  const laws  = _getLaborLaws(nation);
  const total = nation.population?.total || 0;
  const frac  = dem.cohort_fractions;

  // Население по когортам
  const childPop = total * frac.children;
  const adultPop = total * frac.adults;
  const elderPop = total * frac.elderly;

  // ── Взрослые ──────────────────────────────────────────────
  // Мужчины-взрослые: все работают (100%)
  const maleAdultWork   = adultPop * 0.50 * 1.00;
  // Женщины-взрослые: по закону о женском труде
  const womenRate       = laws.women_participation;
  const femaleAdultWork = adultPop * 0.50 * womenRate;
  const femaleDepend    = adultPop * 0.50 * (1 - womenRate);  // иждивенцы

  // ── Дети ──────────────────────────────────────────────────
  // Работающие дети (в «взрослых эквивалентах»)
  const childWorkFrac   = laws.child_labor_intensity;
  const childEffic      = laws.child_work_efficiency;
  const childWorkEq     = childPop * childWorkFrac * childEffic;   // эквиваленты
  const childWorkCount  = childPop * childWorkFrac;                // реальные люди
  const childDepend     = childPop * (1 - childWorkFrac);           // иждивенцы

  // ── Пожилые ───────────────────────────────────────────────
  const elderWorkFrac   = laws.elder_work_intensity;
  const elderEffic      = laws.elder_work_efficiency;
  const elderWorkEq     = elderPop * elderWorkFrac * elderEffic;   // эквиваленты
  const elderWorkCount  = elderPop * elderWorkFrac;                // реальные люди
  const elderDepend     = elderPop * (1 - elderWorkFrac);           // иждивенцы

  // ── Суммарная рабочая сила (в «взрослых эквивалентах») ───
  const effectiveWorkforce = maleAdultWork + femaleAdultWork + childWorkEq + elderWorkEq;

  // ── Суммарные иждивенцы ───────────────────────────────────
  const totalDependents = femaleDepend + childDepend + elderDepend;

  // ── Потребление (в «взрослых эквивалентах») ──────────────
  // Все взрослые потребляют 1.0
  const adultConsume  = adultPop  * 1.00;
  // Работающие дети = 0.60, нерабочие = 0.55
  const childConsume  = childWorkCount * 0.60 + childDepend * 0.55;
  // Работающие пожилые = 0.85, нерабочие = 0.80
  const elderConsume  = elderWorkCount * 0.85 + elderDepend * 0.80;

  const totalConsumption = adultConsume + childConsume + elderConsume;

  // ── Результирующие показатели ─────────────────────────────
  dem.effective_workforce = Math.round(effectiveWorkforce);
  dem.dependency_ratio    = effectiveWorkforce > 0
    ? totalDependents / effectiveWorkforce
    : 1.0;

  // consumption_mult: сколько «единиц» потребления приходится на одного работника
  dem.consumption_mult = effectiveWorkforce > 0
    ? totalConsumption / effectiveWorkforce
    : AGE_PARAMS.baseline_consumption_mult;

  // labor_force_ratio: доля трудоспособного населения
  dem.labor_force_ratio = total > 0 ? effectiveWorkforce / total : 0.5;

  // labor_productivity_mod: отношение к базовому уровню (1.0 = дефолтные законы)
  const raw = effectiveWorkforce / Math.max(1, total * AGE_PARAMS.baseline_labor_ratio);
  dem.labor_productivity_mod = Math.max(0.55, Math.min(1.50, raw));
}

// ──────────────────────────────────────────────────────────────
// БОНУСЫ К УДОВЛЕТВОРЁННОСТИ ОТ ТРУДОВЫХ ЗАКОНОВ
// Собирает satisfaction_effects всех активных трудовых законов.
// Хранит в nation.population._labor_law_bonuses для updateHappiness().
// ──────────────────────────────────────────────────────────────

function collectLaborLawBonuses(nation) {
  if (typeof LAWS_LABOR === 'undefined') return;

  const bonuses = {};

  for (const activeLaw of (nation.active_laws || [])) {
    if (!activeLaw._labor_law) continue;
    const lawDef = LAWS_LABOR[activeLaw.id];
    if (!lawDef?.satisfaction_effects) continue;
    for (const [classId, delta] of Object.entries(lawDef.satisfaction_effects)) {
      bonuses[classId] = (bonuses[classId] || 0) + delta;
    }
  }

  // Бонус/штраф за иждивенческую нагрузку
  // Высокая нагрузка → рабочие классы недовольны
  const dem = nation.demographics;
  if (dem) {
    const ratio = dem.dependency_ratio;
    let burdenFx = 0;
    if (ratio > 2.0)      burdenFx = -8;  // критический груз
    else if (ratio > 1.5) burdenFx = -4;  // тяжёлая нагрузка
    else if (ratio > 1.2) burdenFx = -2;  // умеренная
    else if (ratio < 0.6) burdenFx = +3;  // мало иждивенцев = лёгкая жизнь

    if (burdenFx !== 0) {
      // Ощущают нагрузку прежде всего крестьяне и ремесленники
      for (const cls of ['farmers_class', 'craftsmen_class']) {
        bonuses[cls] = (bonuses[cls] || 0) + burdenFx;
      }
    }
  }

  nation.population._labor_law_bonuses = bonuses;
}

// ──────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ — processAgeDemographics()
// Вызывается из turn.js ПОСЛЕ processDemography().
// ──────────────────────────────────────────────────────────────

function processAgeDemographics() {
  if (typeof GAME_STATE === 'undefined') return;

  for (const nation of Object.values(GAME_STATE.nations)) {
    try {
      updateAgeCohorts(nation);
    } catch (e) {
      console.warn('[age_demographics] updateAgeCohorts error:', e);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────

function _getLaborLaws(nation) {
  const base = (typeof DEFAULT_LABOR_LAWS !== 'undefined')
    ? DEFAULT_LABOR_LAWS
    : { min_work_age: 12, child_labor_intensity: 0.40, elder_threshold: 55,
        elder_work_intensity: 0.50, women_participation: 0.40,
        child_work_efficiency: 0.38, elder_work_efficiency: 0.55 };
  return Object.assign({}, base, nation.labor_laws || {});
}

function _turnsPerYear() {
  return (typeof CONFIG !== 'undefined' && CONFIG.TURNS_PER_YEAR) || 12;
}

function _getFoodRatio(nation) {
  const stockpile = nation.economy?.stockpile || {};
  const pop       = nation.population?.total  || 0;
  const FOOD_PP   = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.FOOD_PER_PERSON) || 1.2;
  const needed    = pop * FOOD_PP;
  const avail     = (stockpile.wheat  || 0)
                  + (stockpile.barley || 0) * 0.8
                  + (stockpile.fish   || 0) * 0.6;
  return needed > 0 ? Math.min(1.5, avail / needed) : 1.0;
}

function _nationHasBuilding(nation, buildingId) {
  if (typeof GAME_STATE !== 'undefined') {
    for (const rid of (nation.regions || [])) {
      const r = GAME_STATE.regions?.[rid];
      if (!r) continue;
      if ((r.building_slots || []).some(s => s.building_id === buildingId && s.status === 'active')) {
        return true;
      }
    }
  }
  return (nation.buildings || []).includes(buildingId);
}

// ──────────────────────────────────────────────────────────────
// UI-ХЕЛПЕРЫ (используются из population_tab.js)
// ──────────────────────────────────────────────────────────────

// Получить читаемую строку для dependency_ratio
function dependencyRatioLabel(ratio) {
  if (ratio < 0.5)  return { text: 'Очень низкая',  cls: 'good' };
  if (ratio < 0.8)  return { text: 'Низкая',        cls: 'good' };
  if (ratio < 1.2)  return { text: 'Умеренная',     cls: 'neutral' };
  if (ratio < 1.6)  return { text: 'Высокая',       cls: 'warn' };
  if (ratio < 2.1)  return { text: 'Очень высокая', cls: 'bad' };
  return                   { text: 'Критическая',   cls: 'bad' };
}

// Получить активный трудовой закон для группы
function getActiveLaborLawForGroup(nation, group) {
  if (typeof LAWS_LABOR === 'undefined') return null;
  const activeLaw = (nation.active_laws || []).find(l =>
    l._labor_law && LAWS_LABOR[l.id]?.group === group
  );
  return activeLaw ? LAWS_LABOR[activeLaw.id] : null;
}

// ──────────────────────────────────────────────────────────────
// ОЖИДАЕМАЯ ПРОДОЛЖИТЕЛЬНОСТЬ ЖИЗНИ
//
// Математическая модель: таблицы смертности из трёх когорт.
// При дефолтных законах и нормальном питании e0 ≈ 28–32 года —
// реалистично для Античности (высокая детская смертность даёт
// низкое e0, но выжившие до 20 лет живут ещё 30–35 лет).
// ──────────────────────────────────────────────────────────────

function computeLifeExpectancy(nation) {
  const laws  = _getLaborLaws(nation);
  const TURNS = _turnsPerYear();

  const foodRatio = _getFoodRatio(nation);
  const childMortMod = foodRatio >= 1.0 ? 0.80 : (foodRatio >= 0.7 ? 1.00 : 1.80);
  const adultMortMod = foodRatio >= 1.0 ? 0.90 : (foodRatio >= 0.7 ? 1.00 : 1.40);
  const healthMod = 1.0
    - (_nationHasBuilding(nation, 'aqueduct') ? 0.15 : 0)
    - (_nationHasBuilding(nation, 'temple')   ? 0.05 : 0)
    - (_nationHasBuilding(nation, 'baths')    ? 0.05 : 0);

  // Скорректированные годовые ставки смертности
  const cM = Math.max(0.001, AGE_PARAMS.child_mortality_annual * childMortMod * healthMod);
  const aM = Math.max(0.001, AGE_PARAMS.adult_mortality_annual * adultMortMod * healthMod);
  const eM = Math.max(0.001, AGE_PARAMS.elder_mortality_annual * healthMod);

  const mwa = laws.min_work_age;                        // граница детства
  const et  = laws.elder_threshold;                     // граница старости
  const wy  = Math.max(1, et - mwa);                   // лет взрослой жизни

  // Вероятность пережить каждую фазу
  const p1 = Math.pow(Math.max(0, 1 - cM), mwa);       // пережить детство
  const p2 = Math.pow(Math.max(0, 1 - aM), wy);        // пережить взрослость (усл.)

  // Ожидаемые годы в фазе пожилых (среднее время до смерти)
  const e_elder = 1 / eM;

  // ── Ожидаемая продолжительность жизни при рождении (e0) ──
  // E[жизнь] = P(умер в детстве)×E[возраст|детство] + P(дожил до взрослости)×...
  const e0 =
    (1 - p1) * (mwa / 2) +
    p1 * (
      mwa +
      (1 - p2) * (wy / 2) +
      p2 * (wy + e_elder)
    );

  // ── e_adult — ожидаемое долголетие при дожитии до min_work_age ──
  const e_adult = mwa + (1 - p2) * (wy / 2) + p2 * (wy + e_elder);

  // ── Медианный возраст населения (взвешенное среднее когорт) ──
  const dem   = nation.demographics;
  const cf    = dem?.cohort_fractions || { children: 0.36, adults: 0.54, elderly: 0.10 };
  const medianAge =
    cf.children * (mwa / 2) +
    cf.adults   * ((mwa + et) / 2) +
    cf.elderly  * (et + Math.min(e_elder, 15) / 2);

  // ── Детская смертность до 5 лет (на 1000 рождений) ──
  const u5years = Math.min(5, mwa);
  const under5_mort = (1 - Math.pow(Math.max(0, 1 - cM), u5years)) * 1000;

  // ── Грубые коэффициенты рождаемости/смертности (на 1000/год) ──
  const crude_death_rate =
    (cf.children * cM + cf.adults * aM + cf.elderly * eM) * 1000;
  const crude_birth_rate =
    cf.adults * 0.5 * AGE_PARAMS.birth_rate_annual * 1000;

  // ── Естественный прирост ──
  const natural_growth = (crude_birth_rate - crude_death_rate).toFixed(1);

  return {
    e0:               Math.max(1,   Math.round(e0       * 10) / 10),
    e_adult:          Math.max(mwa, Math.round(e_adult  * 10) / 10),
    median_age:       Math.max(1,   Math.round(medianAge * 10) / 10),
    p_survive_child:  Math.round(p1 * 1000) / 10,        // %
    under5_mort:      Math.round(under5_mort),            // на 1000
    crude_birth_rate: Math.round(crude_birth_rate * 10) / 10,
    crude_death_rate: Math.round(crude_death_rate * 10) / 10,
    natural_growth:   parseFloat(natural_growth),
    child_mort_rate:  Math.round(cM * 1000 * 10) / 10,   // ‰/год
    adult_mort_rate:  Math.round(aM * 1000 * 10) / 10,
    elder_mort_rate:  Math.round(eM * 1000 * 10) / 10,
    food_ratio:       Math.round(foodRatio * 100),
  };
}

// ──────────────────────────────────────────────────────────────
// ОЦЕНКА ВОЗРАСТНОГО СОСТАВА СОЦИАЛЬНОГО КЛАССА
//
// Разные классы имеют разный возрастной профиль из-за условий
// труда, доступа к пище и медицине, брачных обычаев.
// Смещения применяются к национальным когортным долям и
// нормируются в сумму 1.0.
// ──────────────────────────────────────────────────────────────

function estimateClassAgeCohorts(classId, nationCohorts) {
  // Множители смещения (child/adult/elder) относительно нации
  const BIAS = {
    //                           c      a      e
    farmers_class:   { c: 1.15, a: 1.00, e: 0.85 }, // высокая рождаемость, умеренная смертность
    craftsmen_class: { c: 0.85, a: 1.10, e: 1.00 }, // городская среда, меньше детей
    citizens:        { c: 0.70, a: 0.97, e: 1.55 }, // богатые живут дольше, меньше детей
    sailors_class:   { c: 0.88, a: 1.28, e: 0.30 }, // молодые мужчины, высокая гибель
    clergy_class:    { c: 0.38, a: 0.88, e: 2.40 }, // целибат (мало детей), уважаемая старость
    soldiers_class:  { c: 0.92, a: 1.32, e: 0.22 }, // молодые бойцы, высокая смертность
    slaves_class:    { c: 0.80, a: 1.08, e: 0.52 }, // тяжёлый труд, мало пожилых
  };

  const b = BIAS[classId] || { c: 1.0, a: 1.0, e: 1.0 };
  const raw = {
    children: Math.max(0.001, nationCohorts.children * b.c),
    adults:   Math.max(0.001, nationCohorts.adults   * b.a),
    elderly:  Math.max(0.001, nationCohorts.elderly  * b.e),
  };
  const sum = raw.children + raw.adults + raw.elderly;
  return {
    children: raw.children / sum,
    adults:   raw.adults   / sum,
    elderly:  raw.elderly  / sum,
  };
}

// ──────────────────────────────────────────────────────────────
// ЗАПИСЬ ИСТОРИИ ДЕМОГРАФИЧЕСКИХ ПОКАЗАТЕЛЕЙ (каждый ход)
// Вызывается из updateAgeCohorts() в конце хода.
// ──────────────────────────────────────────────────────────────

function recordDemographicHistory(nation) {
  const dem = nation.demographics;
  if (!dem) return;
  if (!dem.history) dem.history = [];

  const le = computeLifeExpectancy(nation);

  // Обновляем текущие показатели в demographics
  dem.life_expectancy       = le.e0;
  dem.life_expectancy_adult = le.e_adult;
  dem.median_age            = le.median_age;
  dem.under5_mort           = le.under5_mort;
  dem.crude_birth_rate      = le.crude_birth_rate;
  dem.crude_death_rate      = le.crude_death_rate;
  dem.natural_growth        = le.natural_growth;

  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;

  dem.history.push({
    turn:        gs?.turn || 1,
    label:       String(Math.abs(gs?.date?.year || 301)),
    e0:          le.e0,
    e_adult:     le.e_adult,
    median_age:  le.median_age,
    children:    dem.cohort_fractions.children,
    adults:      dem.cohort_fractions.adults,
    elderly:     dem.cohort_fractions.elderly,
    dependency:  dem.dependency_ratio || 0,
    cbr:         le.crude_birth_rate,
    cdr:         le.crude_death_rate,
    ng:          le.natural_growth,
  });

  // Храним не более 120 точек (~10 лет игрового времени)
  if (dem.history.length > 120) dem.history.shift();
}
