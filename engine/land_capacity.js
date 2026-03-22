// engine/land_capacity.js
// Динамическая формула земельной ёмкости региона
// Вызывается каждый ход после processDemography(), перед runEconomyTick()

// ── БИОМНЫЕ КОЭФФИЦИЕНТЫ ─────────────────────────────────────────────────────
const BIOME_LAND_PARAMS = {

  // Города плотные, строят вверх, земля дорогая
  // Помпеи, Карфаген, Афины — 150-300 чел/га в черте города
  mediterranean_coast: {
    unsuitable_pct: 0.15,  // мало непригодной земли (рельеф слабый)
    ha_per_person:  0.07,  // 0.01 город + 0.06 периферия (море заменяет часть)
    reserve_pct:    0.05,  // мало леса (прибрежная зона)
  },

  // Деревни рассредоточены, у каждой семьи двор и огород
  // Типичная сицилийская деревня: 80-120 чел/га
  mediterranean_hills: {
    unsuitable_pct: 0.30,  // холмы, скалы, крутые склоны
    ha_per_person:  0.11,  // 0.01 дом + 0.10 двор/огород/скот
    reserve_pct:    0.10,  // лес для дров и пастбища
  },

  // Плотные поселения вдоль берега, остальная земля — ценная пашня
  // Нильские деревни: 200-400 чел/га
  river_valley: {
    unsuitable_pct: 0.10,  // только пойменные болота
    ha_per_person:  0.08,  // плотнее чем холмы — земля слишком ценна
    reserve_pct:    0.05,  // пастбища минимальны — всё под пашню
  },

  // Богатейшая почва — каждый га на счету, поселения компактны
  volcanic: {
    unsuitable_pct: 0.20,  // лавовые поля, крутые склоны конуса
    ha_per_person:  0.09,  // компактнее чем холмы — земля очень ценна
    reserve_pct:    0.08,  // немного леса на склонах
  },

  // Поселения вокруг воды, остальное — малопригодная земля
  // Нумидийские деревни очень рассредоточены
  semi_arid: {
    unsuitable_pct: 0.40,  // много непригодного — сухие склоны, каменистые равнины
    ha_per_person:  0.15,  // больше места (скот, выпас, доступ к воде)
    reserve_pct:    0.12,  // пастбища важны — основа хозяйства
  },

  // Полукочевой образ жизни. Постоянных поселений мало.
  steppe: {
    unsuitable_pct: 0.20,  // овраги, солончаки
    ha_per_person:  0.50,  // каждый человек «держит» большую территорию
    reserve_pct:    0.40,  // пастбища — главный ресурс степи
  },

  // Галлия, Германия — деревни в лесных прогалинах
  temperate_forest: {
    unsuitable_pct: 0.20,  // болота, реки, непроходимые чащи
    ha_per_person:  0.13,  // просторнее — земля менее ценна
    reserve_pct:    0.25,  // лес — основной ресурс, его берегут
  },

  // Деревни в узких долинах. Пашня — буквально каждый клочок
  alpine: {
    unsuitable_pct: 0.65,  // большая часть непригодна (скалы, ледники)
    ha_per_person:  0.20,  // поселения на склонах, много места под двор
    reserve_pct:    0.15,  // альпийские пастбища (летние)
  },

  // Левант, Финикия — плотные города-государства
  subtropical: {
    unsuitable_pct: 0.25,
    ha_per_person:  0.10,
    reserve_pct:    0.08,
  },

  // Оазисная модель — поселения крошечные, земля ограничена ирригацией
  desert: {
    unsuitable_pct: 0.85,  // почти всё непригодно
    ha_per_person:  0.05,  // очень компактные оазисные города
    reserve_pct:    0.05,  // финиковые рощи
  },

  // Нубия, Эфиопия — скотоводческо-земледельческая модель
  savanna: {
    unsuitable_pct: 0.25,
    ha_per_person:  0.20,  // скот требует большого выпаса
    reserve_pct:    0.20,  // пастбища
  },

  arctic: {
    unsuitable_pct: 0.80,
    ha_per_person:  0.30,
    reserve_pct:    0.10,
  },

  tropical: {
    unsuitable_pct: 0.30,
    ha_per_person:  0.15,
    reserve_pct:    0.20,
  },
};

// ── ПЛОЩАДИ ЗДАНИЙ ───────────────────────────────────────────────────────────
// Площадь каждого здания теперь хранится в data/buildings.js как footprint_ha.
// Вспомогательная функция читает её оттуда — дублирования нет.
function getBuildingFootprint(buildingId) {
  if (typeof BUILDINGS !== 'undefined' && BUILDINGS[buildingId]) {
    return BUILDINGS[buildingId].footprint_ha ?? 0;
  }
  return 0;
}

// ── ОСНОВНАЯ ФУНКЦИЯ ─────────────────────────────────────────────────────────
/**
 * Вычисляет земельную ёмкость региона.
 * @param {object} region   — объект региона из GAME_STATE.regions
 * @param {string} regionId — ключ региона, например "r246"
 * @returns {object} полный расчёт земельного баланса
 */
function calcRegionLandCapacity(region, regionId) {

  // Определяем биом: из объекта региона или из REGION_BIOMES
  const numId  = String(regionId).replace('r', '');
  const biome  = region.biome
              ?? (typeof REGION_BIOMES !== 'undefined' ? REGION_BIOMES[numId] : null)
              ?? 'mediterranean_hills';

  const params = BIOME_LAND_PARAMS[biome]
              ?? BIOME_LAND_PARAMS['mediterranean_hills'];

  // Площадь: region.area_ha если есть, иначе из REGION_AREAS (км² → га)
  const total = region.area_ha
             ?? (typeof REGION_AREAS !== 'undefined'
                 ? (REGION_AREAS[numId] ?? 0) * 100
                 : 0);

  if (total === 0) {
    return {
      total_ha: 0, unsuitable_ha: 0, settlement_ha: 0, reserve_ha: 0,
      max_arable_ha: 0, arable_ha: 0, buildings_ha: 0, free_ha: 0,
      exploitation: 1.0, warnings: ['НЕТ ДАННЫХ: area_ha = 0'], can_build: {},
    };
  }

  const pop = region.population ?? 0;

  // ── A: Непригодная земля (константа биома) ───────────────────────────────
  const unsuitable_ha = Math.round(total * params.unsuitable_pct);

  // ── B: Земля под поселения (информационная, НЕ вычитается из пашни) ──────
  // Исторически: города строились на холмах, побережье, склонах — не на
  // пахотных равнинах. Поэтому settlement_ha не конкурирует с farmland.
  const settlement_ha = Math.round(pop * params.ha_per_person);

  // ── C: Обязательный резерв леса и пастбищ (константа биома) ─────────────
  const reserve_ha = Math.round(total * params.reserve_pct);

  // ── D: Пахотный фонд региона (константа — зависит от площади и биома) ───
  // settlement_ha НЕ вычитается: поселения занимают непригодную/склонную
  // землю, а не пашню. Пашня — это только равнины и долины.
  const max_arable_ha = total - unsuitable_ha - reserve_ha;
  const arable_ha     = max_arable_ha;   // одно значение, без динамики

  // ── E: Занято зданиями ───────────────────────────────────────────────────
  // Читаем footprint_ha из BUILDINGS[id] — единственный источник истины.
  const buildings_ha = (region.building_slots ?? [])
    .filter(s => s.status !== 'demolished')
    .reduce((sum, s) => {
      return sum + getBuildingFootprint(s.building_id) * (s.level ?? 1);
    }, 0);

  // ── F: Жёсткий лимит застройки — не более 70% площади региона ──────────
  // Критическое условие: здания (все, любого типа) в сумме не должны
  // занимать более 70% полной площади региона (total_ha), а не только пашни.
  const MAX_BUILDING_PCT  = 0.70;
  const max_buildings_ha  = Math.floor(total * MAX_BUILDING_PCT);

  // Реальный лимит свободной земли = минимум из пашни и 70%-порога.
  const buildable_ha = Math.min(arable_ha, max_buildings_ha);
  const free_ha      = Math.max(0, buildable_ha - buildings_ha);

  // ── G: Степень освоения (0.0 — пусто, 1.0 — полностью застроено) ────────
  // Считаем относительно жёсткого лимита (70% площади), а не только пашни.
  const exploitation = max_buildings_ha > 0
    ? Math.min(1.0, buildings_ha / max_buildings_ha)
    : 1.0;

  // ── H: Плотность населения (предупреждения) ──────────────────────────────
  // settlement_ha используем только для информационных предупреждений,
  // не как ограничитель строительства.
  const pop_density = total > 0 ? Math.round(pop / (total / 100)) : 0; // чел/км²
  const warnings = [];
  if (settlement_ha > arable_ha * 0.8) {
    warnings.push('ПЕРЕНАСЕЛЕНИЕ: жилая зона занимает более 80% пахотного фонда');
  }
  if (buildings_ha >= max_buildings_ha) {
    warnings.push('ЛИМИТ ЗАСТРОЙКИ: здания занимают 70% площади региона — строительство запрещено');
  } else if (free_ha < buildable_ha * 0.05) {
    warnings.push('ЗЕМЛЯ ЗАКАНЧИВАЕТСЯ: осталось менее 5% от допустимого лимита застройки');
  }

  return {
    total_ha:     total,
    unsuitable_ha,              // константа биома
    settlement_ha,              // информационно (не ограничивает строительство)
    reserve_ha,                 // константа биома
    max_arable_ha,              // = arable_ha (сохранено для совместимости)
    arable_ha,                  // пахотный фонд (константа биома + площади)
    max_buildings_ha,           // ЖЁСТКИЙ ЛИМ: 70% от total_ha
    buildable_ha,               // эффективный лимит = min(arable_ha, max_buildings_ha)
    buildings_ha,               // занято зданиями
    free_ha,                    // СВОБОДНО ДЛЯ СТРОИТЕЛЬСТВА (с учётом 70%-лимита)
    exploitation,               // коэффициент освоения 0.0-1.0 (отн. 70%-лимита)
    pop_density,                // чел/км² (для отладки)
    warnings,
    biome,                      // для отладки

    // Сколько единиц каждого здания ещё можно построить (уровней)
    can_build: Object.fromEntries(
      ['wheat_family_farm', 'wheat_villa', 'wheat_latifundium',
       'farm', 'latifundium', 'mine', 'granary']
        .map(id => [id, free_ha > 0
          ? Math.floor(free_ha / (getBuildingFootprint(id) || Infinity))
          : 0])
    ),
  };
}
