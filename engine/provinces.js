// ══════════════════════════════════════════════════════════════
// ПРОВИНЦИАЛЬНЫЙ РЫНОК — engine/provinces.js
//
// Провинция = группа регионов с одинаковым tags[0].
// Пример: все регионы с tags:['sicily'] образуют провинцию 'sicily'.
//
// GAME_STATE.provinces['sicily'] = {
//   regions:           ['r55','r102', ...],  // id регионов
//   total_area:        km²,                   // сумма REGION_AREAS
//   control:           { nationId: fraction },  // доля по площади
//   influence:         { nationId: 0–1 },        // дипломатическое влияние
//   effective_control: { nationId: 0–1 },        // 0.7×control + 0.3×influence
//   market:            { good: { price, available } },
//   has_roads:         bool,                  // хотя бы один регион с road-зданием
// }
//
// Порядок вызова в runEconomyTick:
//   initProvinces()       — один раз при initGame()
//   updateProvinceControl() — каждый тик, шаг 1.5a
//   buildProvinceMarket()   — каждый тик, шаг 1.5b (после routeProduction)
//
// Транспортные расходы при закупке из провинциального рынка:
//   базовая надбавка +15%, -5% если в любом регионе провинции есть 'road'
//
// Загружать ДО engine/economy.js в index.html.
// ══════════════════════════════════════════════════════════════

const _PROVINCE_TRANSPORT_BASE = 0.15;  // +15% к мировой цене
const _PROVINCE_ROAD_DISCOUNT  = 0.05;  // −5% за наличие дорог

// ──────────────────────────────────────────────────────────────
// initProvinces()
//
// Вызывается ОДИН РАЗ при initGame().
// Строит GAME_STATE.provinces из region.tags[0].
// Суммирует площади через REGION_AREAS (ключи = числовые id без 'r').
// ──────────────────────────────────────────────────────────────
function initProvinces() {
  if (!GAME_STATE.provinces) GAME_STATE.provinces = {};

  for (const [rid, region] of Object.entries(GAME_STATE.regions)) {
    const tag = Array.isArray(region.tags) ? region.tags[0] : null;
    if (!tag) continue;

    if (!GAME_STATE.provinces[tag]) {
      GAME_STATE.provinces[tag] = {
        regions:           [],
        total_area:        0,
        control:           {},
        influence:         {},
        effective_control: {},
        market:            {},
        has_roads:         false,
      };
    }

    const prov = GAME_STATE.provinces[tag];
    prov.regions.push(rid);

    // Числовой ключ для REGION_AREAS (rid = 'r55' → '55')
    const numericId  = rid.replace(/^r/, '');
    const area       = (typeof REGION_AREAS !== 'undefined')
                       ? (REGION_AREAS[numericId] ?? 0)
                       : 0;
    prov.total_area += area;
  }
}

// ──────────────────────────────────────────────────────────────
// updateProvinceControl()
//
// Каждый тик (шаг 1.5а).
// Для каждой провинции подсчитывает:
//   control[nationId]           = owned_area / total_area
//   effective_control[nationId] = control×0.7 + influence×0.3
//
// influence[nationId] не меняется здесь — выставляется
// дипломатическим движком или инициализируется в 0.
// ──────────────────────────────────────────────────────────────
function updateProvinceControl() {
  if (!GAME_STATE.provinces) return;

  for (const [provName, prov] of Object.entries(GAME_STATE.provinces)) {
    // Пересчитываем площади по текущему владельцу региона
    const ownedArea = {};

    for (const rid of prov.regions) {
      const region  = GAME_STATE.regions[rid];
      if (!region) continue;

      const owner   = region.nation;
      if (!owner) continue;

      const numericId = rid.replace(/^r/, '');
      const area      = (typeof REGION_AREAS !== 'undefined')
                        ? (REGION_AREAS[numericId] ?? 0)
                        : 0;
      ownedArea[owner] = (ownedArea[owner] || 0) + area;
    }

    // Проверяем наличие дорог (здание 'road' в активных слотах)
    prov.has_roads = prov.regions.some(rid => {
      const region = GAME_STATE.regions[rid];
      return region?.building_slots?.some(
        s => s.status === 'active' && s.building_id === 'road',
      );
    });

    const total = prov.total_area || 1;
    prov.control = {};

    for (const [nationId, area] of Object.entries(ownedArea)) {
      prov.control[nationId] = area / total;
    }

    // effective_control = 0.7 × control + 0.3 × influence
    // Собираем всех нации, у которых есть хоть что-то
    const allNations = new Set([
      ...Object.keys(prov.control),
      ...Object.keys(prov.influence || {}),
    ]);

    prov.effective_control = {};
    for (const nationId of allNations) {
      const ctrl = prov.control[nationId]   || 0;
      const infl = (prov.influence || {})[nationId] || 0;
      prov.effective_control[nationId] = ctrl * 0.7 + infl * 0.3;
    }
  }
}

// ──────────────────────────────────────────────────────────────
// buildProvinceMarket()
//
// Каждый тик (шаг 1.5б, после routeProductionToLocalStockpiles).
// Агрегирует local_stockpile всех регионов провинции в
// prov.market[good].available.
//
// Цена = world_price × (1 + transport_cost)
//   transport_cost = _PROVINCE_TRANSPORT_BASE − (prov.has_roads ? _PROVINCE_ROAD_DISCOUNT : 0)
//
// Товар доступен из провинциального рынка только если хотя бы
// один регион провинции содержит его в local_stockpile.
// ──────────────────────────────────────────────────────────────
function buildProvinceMarket() {
  if (!GAME_STATE.provinces) return;

  for (const prov of Object.values(GAME_STATE.provinces)) {
    // Суммируем local_stockpile всех регионов
    const aggregated = {};

    for (const rid of prov.regions) {
      const region = GAME_STATE.regions[rid];
      if (!region?.local_stockpile) continue;

      for (const [good, qty] of Object.entries(region.local_stockpile)) {
        if (qty > 0) aggregated[good] = (aggregated[good] || 0) + qty;
      }
    }

    // Транспортная надбавка
    const transportMult = _PROVINCE_TRANSPORT_BASE
                        - (prov.has_roads ? _PROVINCE_ROAD_DISCOUNT : 0);

    // Строим prov.market
    prov.market = {};
    for (const [good, available] of Object.entries(aggregated)) {
      const worldPrice = GAME_STATE.market[good]?.price
                       ?? GOODS?.[good]?.base_price
                       ?? 0;
      prov.market[good] = {
        available,
        price: Math.round(worldPrice * (1 + transportMult) * 10) / 10,
      };
    }
  }
}

// ──────────────────────────────────────────────────────────────
// getRegionProvince(rid)
//
// Вспомогательная функция: возвращает имя провинции для региона,
// или null если регион не входит ни в одну провинцию.
// ──────────────────────────────────────────────────────────────
function getRegionProvince(rid) {
  const region = GAME_STATE.regions?.[rid];
  const tag    = Array.isArray(region?.tags) ? region.tags[0] : null;
  if (!tag || !GAME_STATE.provinces?.[tag]) return null;
  return tag;
}
