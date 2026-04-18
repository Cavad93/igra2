// engine/land_capacity.js
// Динамическая формула земельной ёмкости региона
// Вызывается каждый ход после processDemography(), перед runEconomyTick()

import { BUILDINGS } from '../data/buildings.js';

// ── БИОМНЫЕ КОЭФФИЦИЕНТЫ ─────────────────────────────────────────────────────
export const BIOME_LAND_PARAMS = {

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
export function getBuildingFootprint(buildingId) {
  if (BUILDINGS && BUILDINGS[buildingId]) {
    return BUILDINGS[buildingId].footprint_ha ?? 0;
  }
  return 0;
}

// ── Session 27: предвычисленные footprint'ы для can_build[] ─────────────────
// BUILDINGS статичны — считать лукапы по 7 id на каждый регион каждый ход
// бессмысленно. Кэшируем один раз. MAP заменяем на plain object для v8.
const CAN_BUILD_IDS = Object.freeze([
  'wheat_family_farm', 'wheat_villa', 'wheat_latifundium',
  'farm', 'latifundium', 'mine', 'granary',
]);
let _canBuildFootprints = null;
function _getCanBuildFootprints() {
  if (_canBuildFootprints) return _canBuildFootprints;
  const map = {};
  for (let i = 0; i < CAN_BUILD_IDS.length; i++) {
    const id = CAN_BUILD_IDS[i];
    map[id] = getBuildingFootprint(id) || 0;
  }
  _canBuildFootprints = map;
  return map;
}

// ── Session 27: region-constant инварианты (биом, площадь-производные) ─────
// biome и area_ha неизменны в рантайме (engine/init.js + engine/save.js
// записывают биом лишь если его ещё нет). Все поля, зависящие только от
// этих двух входов, считаем один раз и кэшируем на region._landConst.
// Ключ валидности — пара (_biome, _area).
function _ensureLandConst(region, regionId) {
  const cached = region._landConst;
  const biomeHint = region.biome;
  const areaHint  = region.area_ha;

  // Быстрый выход: если кэш уже заполнен и базовые поля не поменялись —
  // ни одной лукап-операции по REGION_BIOMES/REGION_AREAS не делаем.
  if (cached && cached._biome === biomeHint && cached._area === areaHint) {
    return cached;
  }

  const numId = String(regionId).replace('r', '');
  const biome = biomeHint
    ?? (typeof REGION_BIOMES !== 'undefined' ? REGION_BIOMES[numId] : null)
    ?? 'mediterranean_hills';
  const area  = areaHint
    ?? (typeof REGION_AREAS !== 'undefined' ? (REGION_AREAS[numId] ?? 0) * 100 : 0);

  if (cached && cached._biome === biome && cached._area === area) {
    return cached;
  }

  const params = BIOME_LAND_PARAMS[biome] ?? BIOME_LAND_PARAMS['mediterranean_hills'];

  if (!area) {
    region._landConst = {
      _biome: biome, _area: 0,
      total_ha: 0, unsuitable_ha: 0, reserve_ha: 0,
      max_arable_ha: 0, max_buildings_ha: 0, buildable_ha: 0,
      per_person_ha: params.ha_per_person, biome,
    };
    return region._landConst;
  }

  const unsuitable_ha    = Math.round(area * params.unsuitable_pct);
  const reserve_ha       = Math.round(area * params.reserve_pct);
  const max_arable_ha    = area - unsuitable_ha - reserve_ha;
  const max_buildings_ha = Math.floor(area * 0.70); // MAX_BUILDING_PCT=0.70
  const buildable_ha     = Math.min(max_arable_ha, max_buildings_ha);

  region._landConst = {
    _biome: biome, _area: area,
    total_ha: area,
    unsuitable_ha, reserve_ha,
    max_arable_ha, max_buildings_ha, buildable_ha,
    per_person_ha: params.ha_per_person, biome,
  };
  return region._landConst;
}

// ── ОСНОВНАЯ ФУНКЦИЯ ─────────────────────────────────────────────────────────
/**
 * Вычисляет земельную ёмкость региона.
 * @param {object} region   — объект региона из GAME_STATE.regions
 * @param {string} regionId — ключ региона, например "r246"
 * @returns {object} полный расчёт земельного баланса
 */
export function calcRegionLandCapacity(region, regionId) {

  // Session 27: константы региона — из кэша (без Math.round, без лукапов).
  const c = _ensureLandConst(region, regionId);
  const total = c.total_ha;

  if (total === 0) {
    return {
      total_ha: 0, unsuitable_ha: 0, settlement_ha: 0, reserve_ha: 0,
      max_arable_ha: 0, arable_ha: 0, buildings_ha: 0, free_ha: 0,
      exploitation: 1.0, warnings: ['НЕТ ДАННЫХ: area_ha = 0'], can_build: {},
    };
  }

  const pop = region.population ?? 0;

  // ── B: Земля под поселения (информационная, НЕ вычитается из пашни) ──────
  // Исторически: города строились на холмах, побережье, склонах — не на
  // пахотных равнинах. Поэтому settlement_ha не конкурирует с farmland.
  const settlement_ha = Math.round(pop * c.per_person_ha);

  // ── E: Занято зданиями ───────────────────────────────────────────────────
  // Session 27: однопроходный for без filter().reduce() аллокаций.
  let buildings_ha = 0;
  const slots = region.building_slots;
  if (slots && slots.length) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || s.status === 'demolished') continue;
      const fp = getBuildingFootprint(s.building_id);
      if (fp) buildings_ha += fp * (s.level ?? 1);
    }
  }

  // ── F: Свободная земля ───────────────────────────────────────────────────
  const free_ha      = Math.max(0, c.buildable_ha - buildings_ha);
  const exploitation = c.max_buildings_ha > 0
    ? Math.min(1.0, buildings_ha / c.max_buildings_ha)
    : 1.0;

  // ── H: Плотность населения (предупреждения) ──────────────────────────────
  const pop_density = Math.round(pop / (total / 100)); // чел/км²
  const warnings = [];
  if (settlement_ha > c.max_arable_ha * 0.8) {
    warnings.push('ПЕРЕНАСЕЛЕНИЕ: жилая зона занимает более 80% пахотного фонда');
  }
  if (buildings_ha >= c.max_buildings_ha) {
    warnings.push('ЛИМИТ ЗАСТРОЙКИ: здания занимают 70% площади региона — строительство запрещено');
  } else if (free_ha < c.buildable_ha * 0.05) {
    warnings.push('ЗЕМЛЯ ЗАКАНЧИВАЕТСЯ: осталось менее 5% от допустимого лимита застройки');
  }

  // can_build — 7 заранее посчитанных footprint'ов.
  const fp = _getCanBuildFootprints();
  const can_build = {};
  if (free_ha > 0) {
    for (let i = 0; i < CAN_BUILD_IDS.length; i++) {
      const id = CAN_BUILD_IDS[i];
      const f  = fp[id];
      can_build[id] = f > 0 ? Math.floor(free_ha / f) : 0;
    }
  } else {
    for (let i = 0; i < CAN_BUILD_IDS.length; i++) {
      can_build[CAN_BUILD_IDS[i]] = 0;
    }
  }

  return {
    total_ha:         total,
    unsuitable_ha:    c.unsuitable_ha,      // константа биома
    settlement_ha,                           // информационно (не ограничивает строительство)
    reserve_ha:       c.reserve_ha,          // константа биома
    max_arable_ha:    c.max_arable_ha,       // = arable_ha (сохранено для совместимости)
    arable_ha:        c.max_arable_ha,       // пахотный фонд (константа биома + площади)
    max_buildings_ha: c.max_buildings_ha,    // ЖЁСТКИЙ ЛИМ: 70% от total_ha
    buildable_ha:     c.buildable_ha,        // эффективный лимит = min(arable_ha, max_buildings_ha)
    buildings_ha,                            // занято зданиями
    free_ha,                                 // СВОБОДНО ДЛЯ СТРОИТЕЛЬСТВА
    exploitation,                            // коэффициент освоения 0.0-1.0
    pop_density,                             // чел/км² (для отладки)
    warnings,
    biome:            c.biome,               // для отладки
    can_build,
  };
}

// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

