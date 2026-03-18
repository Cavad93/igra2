// ═══════════════════════════════════════════════════════════════════════════
// ДВИЖОК ДЕМОГРАФИИ
// Обрабатывает прирост/убыль каждой профессии каждый ход.
// Вызывается из turn.js вместо старого updatePopulationGrowth().
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// КОНСТАНТЫ
// ─────────────────────────────────────────────────────────────────────────

const DEMO_BASE_GROWTH    = 0.005;   // +0.5% в ход (базовый биологический прирост)
const DEMO_MIN_PROFESSION = 50;      // минимум людей в профессии (не даём исчезнуть)

// Влияние удовлетворённости класса на рост его профессий
// sat 0..100 → mod -0.010..+0.008
function _satToGrowthMod(sat) {
  if (sat >= 85) return  0.008;
  if (sat >= 70) return  0.004;
  if (sat >= 55) return  0.001;
  if (sat >= 40) return -0.002;
  if (sat >= 25) return -0.006;
  return -0.010;
}

// Профессии, которые считаем в классовой удовлетворённости
// (соответствие profession → classId)
const PROF_TO_CLASS = {
  farmers:   'farmers_class',
  craftsmen: 'craftsmen_class',
  merchants: 'citizens',
  sailors:   'sailors_class',
  clergy:    'clergy_class',
  soldiers:  'soldiers_class',
  slaves:    'slaves_class',
};

// ─────────────────────────────────────────────────────────────────────────
// ДЕМОГРАФИЧЕСКИЕ ЭФФЕКТЫ ЗАКОНОВ
// Ключ — подстрока в id или type закона
// ─────────────────────────────────────────────────────────────────────────

const LAW_DEMO_EFFECTS = {
  // военные законы
  military: {
    profession_growth: { soldiers: 0.010 },
    mobility: [{ from: 'farmers', to: 'soldiers', rate: 0.005 }],
  },
  // работорговля / долговое рабство
  slavery: {
    profession_growth: { slaves: 0.012 },
    mobility: [{ from: 'farmers', to: 'slaves', rate: 0.004 }],
  },
  debt_slavery: {
    profession_growth: { slaves: 0.008 },
    mobility: [{ from: 'farmers', to: 'slaves', rate: 0.003 }],
  },
  // освобождение рабов
  liberation: {
    profession_growth: { slaves: -0.015 },
    mobility: [{ from: 'slaves', to: 'farmers', rate: 0.012 }],
  },
  emancipation: {
    profession_growth: { slaves: -0.015 },
    mobility: [{ from: 'slaves', to: 'farmers', rate: 0.012 }],
  },
  // расширение гражданства
  citizenship: {
    profession_growth: { merchants: 0.008 },
    mobility: [{ from: 'craftsmen', to: 'merchants', rate: 0.004 }],
  },
  // ограничение торговли
  trade_restriction: {
    profession_growth: { merchants: -0.010 },
  },
  // государственная религия
  state_religion: {
    profession_growth: { clergy: 0.018 },
  },
  religion: {
    profession_growth: { clergy: 0.010 },
  },
  // аграрная реформа
  land_reform: {
    profession_growth: { farmers: 0.012 },
    mobility: [{ from: 'slaves', to: 'farmers', rate: 0.005 }],
  },
  agrarian: {
    profession_growth: { farmers: 0.010 },
  },
  // колонизация
  colonization: {
    profession_growth: { sailors: 0.010, merchants: 0.005 },
    mobility: [{ from: 'farmers', to: 'sailors', rate: 0.003 }],
  },
  // налоговый закон: тяжёлые налоги → обнищание
  tax: {
    profession_growth: { farmers: -0.005, craftsmen: -0.003 },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 1. МОДИФИКАТОР ЕДЫ
// ─────────────────────────────────────────────────────────────────────────

function _calcFoodMod(nation) {
  const stockpile = nation.economy.stockpile;
  const pop       = nation.population.total;

  // Считаем доступные калории (зерно + рыба)
  const wheat  = stockpile.wheat  || 0;
  const barley = stockpile.barley || 0;
  const fish   = stockpile.fish   || 0;

  const FOOD_PER_PERSON = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.FOOD_PER_PERSON) || 1.2;
  const needed = pop * FOOD_PER_PERSON;
  const avail  = wheat + barley * 0.8 + fish * 0.6;
  const ratio  = needed > 0 ? Math.min(1.2, avail / needed) : 1.0;

  // Качество питания: масло + вино + мёд → бонус к рождаемости
  const qualityBonus = (
    (stockpile.olive_oil || 0) > pop * 0.1 ? 0.002 : 0
  ) + (
    (stockpile.wine || 0) > pop * 0.05 ? 0.001 : 0
  ) + (
    (stockpile.honey || 0) > pop * 0.02 ? 0.001 : 0
  );

  // Проверяем наличие зернохранилища
  const hasGranary = (nation.buildings || []).includes('granary');

  let baseMod;
  if (ratio >= 1.0) {
    baseMod = 0.003 + qualityBonus;   // еда есть — нормальный рост
  } else if (ratio >= 0.7) {
    const shortage = (1 - ratio);
    baseMod = -shortage * 0.008 + qualityBonus;  // нехватка умеренная
  } else {
    // Голод
    let famineRate = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.FAMINE_MORTALITY) || 0.015;
    if (hasGranary) famineRate *= 0.55;  // зернохранилище защищает
    baseMod = -famineRate;
  }

  // Специфика по профессиям в голод: рабы умирают быстрее
  return {
    all: baseMod,
    profSpecific: ratio < 0.7 ? { slaves: -0.008, soldiers: 0.002 } : {},
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. НАЛОГОВЫЙ МОДИФИКАТОР
// ─────────────────────────────────────────────────────────────────────────

function _calcTaxMod(nation) {
  const taxRate = nation.economy.tax_rate || 0.10;
  // Нейтральный порог ~12%
  // <8% лёгкие налоги: рост farmers/craftsmen
  // >16% тяжёлые: упадок farmers/craftsmen, рост рабства
  const mod = {};
  if (taxRate <= 0.08) {
    mod.farmers   =  0.005;
    mod.craftsmen =  0.003;
    mod.merchants =  0.002;
  } else if (taxRate <= 0.12) {
    // нейтрально — нет изменений
  } else if (taxRate <= 0.16) {
    mod.farmers   = -0.003;
    mod.craftsmen = -0.002;
  } else {
    mod.farmers   = -0.007;
    mod.craftsmen = -0.005;
    mod.merchants = -0.003;
    mod.slaves    =  0.003;  // долговое рабство при высоких налогах
  }
  return mod;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. МОДИФИКАТОР ЗДАНИЙ
// ─────────────────────────────────────────────────────────────────────────

function _calcBuildingMods(nation) {
  if (typeof BUILDINGS === 'undefined') return { profession: {}, all: 0, mortalityMod: 0, famineProtection: 0, mobilitySpeed: 1, mobilityList: [] };

  const profMod     = {};
  let   allMod      = 0;
  let   mortalityM  = 0;
  let   famineProt  = 0;
  let   mobSpeed    = 1.0;
  const mobList     = [];
  let   epidChance  = 0;
  let   slaveMort   = 0;

  for (const bId of (nation.buildings || [])) {
    const b = BUILDINGS[bId];
    if (!b) continue;

    if (b.profession_growth) {
      for (const [p, v] of Object.entries(b.profession_growth)) {
        profMod[p] = (profMod[p] || 0) + v;
      }
    }
    if (b.all_growth_mod)           allMod      += b.all_growth_mod;
    if (b.mortality_mod)            mortalityM  += b.mortality_mod;
    if (b.famine_mortality_mod)     famineProt  += b.famine_mortality_mod;
    if (b.famine_protection)        famineProt  += b.famine_protection; // treated separately
    if (b.mobility_speed_mod)       mobSpeed    *= b.mobility_speed_mod;
    if (b.mobility)                 mobList.push(...b.mobility);
    if (b.epidemic_chance_mod)      epidChance  += b.epidemic_chance_mod;
    if (b.slave_mortality_mod)      slaveMort   += b.slave_mortality_mod;
  }

  return { profMod, allMod, mortalityM, famineProt, mobSpeed, mobList, epidChance, slaveMort };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. МОДИФИКАТОР ЗАКОНОВ
// ─────────────────────────────────────────────────────────────────────────

function _calcLawMods(nation) {
  const profMod = {};
  const mobList = [];

  for (const law of (nation.active_laws || [])) {
    // Ищем совпадение по id или type закона
    const keys = Object.keys(LAW_DEMO_EFFECTS);
    const lawKey = keys.find(k =>
      (law.id   || '').toLowerCase().includes(k) ||
      (law.type || '').toLowerCase().includes(k) ||
      (law.name || '').toLowerCase().includes(k)
    );
    if (!lawKey) continue;
    const eff = LAW_DEMO_EFFECTS[lawKey];
    if (eff.profession_growth) {
      for (const [p, v] of Object.entries(eff.profession_growth)) {
        profMod[p] = (profMod[p] || 0) + v;
      }
    }
    if (eff.mobility) mobList.push(...eff.mobility);
  }
  return { profMod, mobList };
}

// ─────────────────────────────────────────────────────────────────────────
// 5. ВОЕННЫЙ МОДИФИКАТОР
// ─────────────────────────────────────────────────────────────────────────

function _calcWarMod(nation) {
  const atWar = (nation.military?.at_war_with?.length ?? 0) > 0;
  if (!atWar) return {};

  // На войне: солдаты гибнут, земледельцы страдают от разорений
  const hasWalls = (nation.buildings || []).includes('walls');
  const soldierLoss = hasWalls ? -0.008 : -0.015;
  return {
    soldiers: soldierLoss,
    farmers:  -0.006,
    sailors:  -0.003,
    slaves:    0.004,  // приток пленных при войне
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 6а. МОДИФИКАТОР ЗАНЯТОСТИ / БЕЗРАБОТИЦЫ
//
// Логика:
//   • При высокой занятости (>80%) профессия растёт: сигнал «здесь есть работа»
//   • При умеренной занятости (50–80%) нейтрально или небольшой плюс
//   • Безработица >50% — профессия убывает (люди уходят, не рожают детей)
//
// Кроме роста, функция обновляет:
//   nation.population._unemployment_rates — для UI и economy
// ─────────────────────────────────────────────────────────────────────────

function _calcUnemploymentMod(nation) {
  // Функция доступна только если движок зданий загружен
  if (typeof getUnemploymentRates !== 'function') return {};

  const rates = getUnemploymentRates(nation);

  // Кэшируем для UI и других модулей
  nation.population._unemployment_rates = rates;

  const profMod = {};
  for (const [prof, info] of Object.entries(rates)) {
    const empRate = info.rate; // 0 = всё безработные, 1 = все заняты

    if (empRate >= 0.80) {
      profMod[prof] = +0.003;   // почти полная занятость → приток
    } else if (empRate >= 0.50) {
      profMod[prof] = +0.001;   // нормально
    } else if (empRate >= 0.25) {
      profMod[prof] = -0.002;   // умеренная безработица
    } else {
      profMod[prof] = -0.005;   // высокая безработица → упадок
    }
  }

  return profMod;
}

// ─────────────────────────────────────────────────────────────────────────
// 6. ГЕОГРАФИЧЕСКИЙ МОДИФИКАТОР (по типам регионов нации)
// ─────────────────────────────────────────────────────────────────────────

function _calcGeoMod(nation) {
  const regions   = nation.regions || [];
  const regData   = (typeof REGIONS !== 'undefined') ? REGIONS : {};
  const profMod   = {};
  const terrains  = { coastal_city: 0, plains: 0, hills: 0, mountains: 0, river_valley: 0 };
  let   total     = 0;

  for (const rid of regions) {
    const r = regData[rid];
    if (!r) continue;
    const t = r.terrain || r.type || '';
    if (terrains[t] !== undefined) { terrains[t]++; total++; }
  }
  if (total === 0) return {};

  const coastal  = terrains.coastal_city / total;
  const plains   = terrains.plains / total;
  const hills    = terrains.hills / total;
  const riverV   = terrains.river_valley / total;
  const mountain = terrains.mountains / total;

  // Прибрежная нация → больше моряков и торговцев
  if (coastal > 0.3) {
    profMod.sailors   = (profMod.sailors   || 0) + coastal * 0.012;
    profMod.merchants = (profMod.merchants || 0) + coastal * 0.007;
  }
  // Равнинная → земледельцы
  if (plains > 0.4) {
    profMod.farmers = (profMod.farmers || 0) + plains * 0.008;
  }
  // Речные долины → высокая рождаемость
  if (riverV > 0.2) {
    profMod.farmers = (profMod.farmers || 0) + riverV * 0.015;
  }
  // Горные → медленный рост, устойчивые воины
  if (mountain > 0.3) {
    profMod.soldiers = (profMod.soldiers || 0) + mountain * 0.006;
  }

  return profMod;
}

// ─────────────────────────────────────────────────────────────────────────
// 7. ЁМКОСТЬ (carrying capacity)
// ─────────────────────────────────────────────────────────────────────────

function _calcCapacityFactor(nation) {
  const regData  = (typeof REGIONS  !== 'undefined') ? REGIONS  : {};
  const cap      = (typeof TERRAIN_BASE_CAPACITY !== 'undefined') ? TERRAIN_BASE_CAPACITY : {};

  // Суммируем ёмкость регионов
  let maxCap = 0;
  for (const rid of (nation.regions || [])) {
    const r = regData[rid];
    if (!r) continue;
    const t = r.terrain || r.type || 'default';
    maxCap += (cap[t] || cap.default || 4000) * (r.fertility || 0.6);
  }

  // Здания добавляют ёмкость
  if (typeof BUILDINGS !== 'undefined') {
    for (const bId of (nation.buildings || [])) {
      maxCap += BUILDINGS[bId]?.capacity_bonus || 0;
    }
  }

  if (maxCap <= 0) return 1.0;

  const current = nation.population.total;
  const ratio   = current / maxCap;

  // Логистическое торможение: при ratio < 0.5 — полный рост,
  // при ratio → 1 — рост падает, при ratio > 1 — отрицательный
  if (ratio >= 1.1) return 0.05;
  if (ratio >= 1.0) return 0.20;
  if (ratio >= 0.9) return 0.50;
  if (ratio >= 0.7) return 0.75;
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────────────
// 8. СОЦИАЛЬНАЯ МОБИЛЬНОСТЬ
// ─────────────────────────────────────────────────────────────────────────

function _applyMobility(profs, mobList, mobSpeedMult) {
  for (const m of mobList) {
    const from = m.from;
    const to   = m.to;
    if (!profs[from] || !profs[to]) continue;
    const amount = Math.round(profs[from] * m.rate * mobSpeedMult);
    if (amount <= 0) continue;
    const actual = Math.min(amount, profs[from] - DEMO_MIN_PROFESSION);
    if (actual <= 0) continue;
    profs[from] -= actual;
    profs[to]   += actual;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 9. СЛУЧАЙНЫЕ СОБЫТИЯ
// ─────────────────────────────────────────────────────────────────────────

const DEMO_RANDOM_EVENTS = [
  {
    id:    'epidemic',
    name:  'Эпидемия',
    icon:  '🤒',
    // базовая вероятность 1.5% в ход
    baseChance: 0.015,
    // снижается акведуком и храмами
    buildingReduction: { aqueduct: 0.6, temple: 0.3 },
    apply(profs, nation) {
      // Убивает в основном бедных (рабы, земледельцы)
      const scale = 0.05 + Math.random() * 0.10; // 5–15% потерь
      const affected = [];
      for (const p of ['slaves', 'farmers', 'craftsmen']) {
        if (!profs[p]) continue;
        const loss = Math.round(profs[p] * scale);
        profs[p] = Math.max(DEMO_MIN_PROFESSION, profs[p] - loss);
        affected.push(`${p} −${loss}`);
      }
      return `Эпидемия в ${nation.name}! Потери: ${affected.join(', ')}`;
    },
  },
  {
    id:    'drought',
    name:  'Засуха',
    icon:  '☀️',
    baseChance: 0.020,
    buildingReduction: { granary: 0.5, irrigation: 0.6 },
    apply(profs, nation) {
      const loss = Math.round((profs.farmers || 0) * (0.04 + Math.random() * 0.06));
      profs.farmers = Math.max(DEMO_MIN_PROFESSION, (profs.farmers || 0) - loss);
      // Засуха → часть земледельцев становятся рабами (долги)
      const enslaved = Math.round(loss * 0.3);
      profs.slaves = (profs.slaves || 0) + enslaved;
      return `Засуха в ${nation.name}! Голод: земледельцы −${loss}, обращены в рабство ${enslaved}`;
    },
  },
  {
    id:    'slave_revolt',
    name:  'Восстание рабов',
    icon:  '⚔️',
    baseChance: 0.010,
    // Только если рабов > 25% населения И их sat < 35
    apply(profs, nation) {
      const total    = Object.values(profs).reduce((s, v) => s + v, 0);
      const slaveRat = (profs.slaves || 0) / (total || 1);
      const slaveSat = nation.population.class_satisfaction?.slaves_class?.satisfaction ?? 50;
      if (slaveRat < 0.20 || slaveSat > 35) return null; // событие не срабатывает
      const slaveLoss   = Math.round((profs.slaves   || 0) * 0.08);
      const soldierLoss = Math.round((profs.soldiers || 0) * 0.04);
      profs.slaves   = Math.max(DEMO_MIN_PROFESSION, (profs.slaves   || 0) - slaveLoss);
      profs.soldiers = Math.max(DEMO_MIN_PROFESSION, (profs.soldiers || 0) - soldierLoss);
      return `Восстание рабов в ${nation.name}! Рабы −${slaveLoss}, солдаты −${soldierLoss}`;
    },
  },
  {
    id:    'migration_wave',
    name:  'Приток переселенцев',
    icon:  '🚶',
    baseChance: 0.015,
    // Только если счастье > 70
    apply(profs, nation) {
      const hap = nation.population.happiness || 50;
      if (hap < 70) return null;
      const bonus = Math.round((profs.farmers || 0) * 0.03 + (profs.craftsmen || 0) * 0.02);
      profs.farmers   = (profs.farmers   || 0) + Math.round(bonus * 0.6);
      profs.craftsmen = (profs.craftsmen || 0) + Math.round(bonus * 0.4);
      return `Переселенцы прибывают в ${nation.name}. Прирост: +${bonus} чел.`;
    },
  },
  {
    id:    'good_harvest',
    name:  'Отличный урожай',
    icon:  '🌾',
    baseChance: 0.030,
    apply(profs, nation) {
      const bonus = Math.round((profs.farmers || 0) * (0.015 + Math.random() * 0.010));
      profs.farmers = (profs.farmers || 0) + bonus;
      return `Богатый урожай в ${nation.name}! Земледельцев +${bonus}.`;
    },
  },
  {
    id:    'city_fire',
    name:  'Пожар в городе',
    icon:  '🔥',
    baseChance: 0.008,
    apply(profs, nation) {
      const loss = Math.round((profs.craftsmen || 0) * (0.03 + Math.random() * 0.04));
      profs.craftsmen = Math.max(DEMO_MIN_PROFESSION, (profs.craftsmen || 0) - loss);
      return `Пожар в городе ${nation.name}. Ремесленников −${loss}.`;
    },
  },
];

function _checkRandomEvents(nation, profs) {
  const logs = [];
  const buildings = nation.buildings || [];

  for (const ev of DEMO_RANDOM_EVENTS) {
    let chance = ev.baseChance;

    // Здания снижают вероятность
    if (ev.buildingReduction) {
      for (const [bId, factor] of Object.entries(ev.buildingReduction)) {
        if (buildings.includes(bId)) chance *= (1 - factor);
      }
    }

    if (Math.random() < chance) {
      const msg = ev.apply(profs, nation);
      if (msg) logs.push({ text: msg, icon: ev.icon, id: ev.id });
    }
  }
  return logs;
}

// ─────────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ — processDemography
// ─────────────────────────────────────────────────────────────────────────

function processDemography() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    try {
      _processDemographyForNation(nationId, nation);
    } catch (e) {
      console.warn(`[demography] Ошибка для ${nationId}:`, e);
    }
  }
}

function _processDemographyForNation(nationId, nation) {
  const pop   = nation.population;
  const profs = pop.by_profession;
  if (!profs) return;

  // ── Собираем все модификаторы ──
  const foodMod    = _calcFoodMod(nation);
  const taxMod     = _calcTaxMod(nation);
  const bldMods    = _calcBuildingMods(nation);
  const lawMods    = _calcLawMods(nation);
  const warMod     = _calcWarMod(nation);
  const geoMod     = _calcGeoMod(nation);
  const capFactor  = _calcCapacityFactor(nation);
  const unempMod   = _calcUnemploymentMod(nation);  // ← занятость от зданий

  // Классовая удовлетворённость (уже посчитана в updateHappiness предыдущего хода)
  const classSat = pop.class_satisfaction || {};

  // ── Рассчитываем прирост по каждой профессии ──
  const newProfs = {};
  for (const [prof, count] of Object.entries(profs)) {
    if (typeof count !== 'number' || count <= 0) { newProfs[prof] = DEMO_MIN_PROFESSION; continue; }

    let rate = DEMO_BASE_GROWTH;

    // Еда (общий + специфика профессии)
    rate += foodMod.all;
    if (foodMod.profSpecific[prof]) rate += foodMod.profSpecific[prof];

    // Налоги
    if (taxMod[prof]) rate += taxMod[prof];

    // Здания — общий + профессиональный
    rate += bldMods.allMod;
    if (bldMods.profMod[prof]) rate += bldMods.profMod[prof];
    rate += bldMods.mortalityM;  // снижение смертности = рост

    // Специальный штраф смертности рабов в рудниках
    if (prof === 'slaves' && bldMods.slaveMort) rate -= bldMods.slaveMort;

    // Законы
    if (lawMods.profMod[prof]) rate += lawMods.profMod[prof];

    // Война
    if (warMod[prof]) rate += warMod[prof];

    // География
    if (geoMod[prof]) rate += geoMod[prof];

    // Классовая удовлетворённость
    const classId = PROF_TO_CLASS[prof];
    if (classId && classSat[classId]) {
      rate += _satToGrowthMod(classSat[classId].satisfaction);
    }

    // Занятость от зданий (+0.003 при полной занятости, до -0.005 при безработице)
    if (unempMod[prof]) rate += unempMod[prof];

    // Ёмкость замедляет рост ближе к пределу
    // (но не применяем к убыли — она всегда работает)
    if (rate > 0) rate *= capFactor;

    // Ограничиваем максимальный прирост/убыль за ход
    rate = Math.max(-0.05, Math.min(0.04, rate));

    newProfs[prof] = Math.max(DEMO_MIN_PROFESSION, Math.round(count * (1 + rate)));
  }

  // ── Социальная мобильность ──
  // 1. От зданий
  const allMobility = [...bldMods.mobList, ...lawMods.mobList];
  _applyMobility(newProfs, allMobility, bldMods.mobSpeed);

  // 2. Базовая урбанизация: если много земледельцев — часть уходит в ремесленники
  const totalNew = Object.values(newProfs).reduce((s, v) => s + v, 0);
  if (totalNew > 0) {
    const farmerShare = (newProfs.farmers || 0) / totalNew;
    if (farmerShare > 0.55) {
      // Давление урбанизации
      const move = Math.round((newProfs.farmers || 0) * 0.003);
      newProfs.farmers   = Math.max(DEMO_MIN_PROFESSION, (newProfs.farmers   || 0) - move);
      newProfs.craftsmen = (newProfs.craftsmen || 0) + move;
    }
  }

  // ── Случайные события ──
  const isPlayerNation = nationId === GAME_STATE.player_nation;
  const eventLogs = _checkRandomEvents(nation, newProfs);
  for (const ev of eventLogs) {
    if (isPlayerNation || Math.random() < 0.3) {
      if (typeof addEventLog === 'function') {
        addEventLog(`${ev.icon} ${ev.text}`, 'info');
      }
    }
  }

  // ── Применяем изменения ──
  for (const [prof, count] of Object.entries(newProfs)) {
    pop.by_profession[prof] = count;
  }

  // ── Пересчитываем total ──
  pop.total = Object.values(pop.by_profession).reduce((s, v) => s + v, 0);

  // ── Логируем значимые изменения (только для игрока) ──
  if (isPlayerNation) {
    _logDemographyChanges(nationId, profs, newProfs);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ЛОГ ИЗМЕНЕНИЙ
// ─────────────────────────────────────────────────────────────────────────

const PROF_LABELS = {
  farmers:   'Земледельцы',
  craftsmen: 'Ремесленники',
  merchants: 'Торговцы',
  sailors:   'Моряки',
  clergy:    'Жрецы',
  soldiers:  'Воины',
  slaves:    'Рабы',
};

// ─────────────────────────────────────────────────────────────────────────
// ИСТОРИЯ НАСЕЛЕНИЯ
// ─────────────────────────────────────────────────────────────────────────

// Вызывается из turn.js ПОСЛЕ updateHappiness() чтобы записать актуальные данные
function recordPopulationHistory() {
  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations[nationId];
  if (!nation || !nation.population) return;

  const pop  = nation.population;
  if (!pop.history) pop.history = [];

  const date  = GAME_STATE.date;
  const year  = Math.abs(date.year);
  const label = `${year}`;

  // Классовые данные из актуального class_satisfaction
  const classes = {};
  const classSat = pop.class_satisfaction;
  if (classSat) {
    for (const [cid, d] of Object.entries(classSat)) {
      classes[cid] = d.population || 0;
    }
  }

  pop.history.push({
    turn:    GAME_STATE.turn || 1,
    label,
    total:   pop.total,
    classes,
    happiness: pop.happiness || 50,
  });

  // Храним не более 60 точек (~5 лет игрового времени)
  if (pop.history.length > 60) pop.history.shift();
}

function _logDemographyChanges(nationId, oldProfs, newProfs) {
  if (typeof addEventLog !== 'function') return;

  const lines = [];
  for (const [prof, newCount] of Object.entries(newProfs)) {
    const oldCount = oldProfs[prof] || 0;
    const delta    = newCount - oldCount;
    if (Math.abs(delta) < 100) continue; // незначительные изменения не показываем
    const sign  = delta > 0 ? '+' : '';
    const label = PROF_LABELS[prof] || prof;
    const cls   = delta > 0 ? 'good' : 'bad';
    lines.push(`<span class="pop-fx-${cls}">${label}: ${sign}${delta.toLocaleString()}</span>`);
  }
  if (lines.length > 0) {
    addEventLog(`👥 Демография: ${lines.join(' · ')}`, 'info');
  }
}
