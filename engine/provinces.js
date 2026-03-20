// ══════════════════════════════════════════════════════════════
// ПРОВИНЦИАЛЬНЫЙ РЫНОК И КОНТРОЛЬ — engine/provinces.js
//
// Провинция = группа регионов с одинаковым tags[0].
//
// GAME_STATE.provinces['sicily'] = {
//   regions:                ['r55','r102', ...],
//   total_area:             km²,
//   control:                { nationId: 0–1 },   // доля по площади
//   influence:              { nationId: 0–1 },   // дипломатическое влияние
//   effective_control:      { nationId: 0–1 },   // 0.7×control + 0.3×influence
//   _prev_effective_control:{ nationId: 0–1 },   // для детекции падения
//   market:                 { good: { price, available } },
//   has_roads:              bool,
// }
//
// Тирование доступа (effective_control):
//   ≥ 1.0 (100%) → full:       полный доступ, tax_fraction = 1.0
//   0.50–0.99    → partial:    пропорц. доступ, tax_fraction = ctrl, +10%×(1-ctrl) к цене
//   0.20–0.49    → trade_only: только торговля, налоги не собираются, +15% к цене
//   < 0.20       → none:       нет доступа к провинциальному рынку
//
// Загружать ДО engine/economy.js в index.html.
// ══════════════════════════════════════════════════════════════

const _PROVINCE_TRANSPORT_BASE = 0.15;  // +15% базовая надбавка
const _PROVINCE_ROAD_DISCOUNT  = 0.05;  // −5% за наличие дорог

// ──────────────────────────────────────────────────────────────
// initProvinces()
//
// Вызывается ОДИН РАЗ при initGame().
// ──────────────────────────────────────────────────────────────
function initProvinces() {
  if (!GAME_STATE.provinces) GAME_STATE.provinces = {};

  for (const [rid, region] of Object.entries(GAME_STATE.regions)) {
    const tag = Array.isArray(region.tags) ? region.tags[0] : null;
    if (!tag) continue;

    if (!GAME_STATE.provinces[tag]) {
      GAME_STATE.provinces[tag] = {
        regions:                [],
        total_area:             0,
        control:                {},
        influence:              {},
        effective_control:      {},
        _prev_effective_control:{},
        market:                 {},
        has_roads:              false,
      };
    }

    const prov = GAME_STATE.provinces[tag];
    prov.regions.push(rid);

    const numericId  = rid.replace(/^r/, '');
    const area       = (typeof REGION_AREAS !== 'undefined')
                       ? (REGION_AREAS[numericId] ?? 0)
                       : 0;
    prov.total_area += area;
  }
}

// ──────────────────────────────────────────────────────────────
// _provinceCulturalPresence(nationId, provRegions)
//
// Доля регионов провинции, где основная культура совпадает
// с основной культурой нации (по populace, не по REGION_CULTURES.primary).
// Возвращает 0–1.
// ──────────────────────────────────────────────────────────────
function _provinceCulturalPresence(nationId, provRegions) {
  if (typeof getNationPrimaryCulture !== 'function') return 0;

  const nationCulture = getNationPrimaryCulture(nationId);
  if (!nationCulture) return 0;

  let matching = 0;
  let total    = 0;

  for (const rid of provRegions) {
    const rc = GAME_STATE.region_cultures?.[rid];
    if (!rc) continue;
    total++;
    if (rc.primary === nationCulture) matching++;
  }

  return total > 0 ? matching / total : 0;
}

// ──────────────────────────────────────────────────────────────
// calculateProvinceControl()
//
// Полная формула контроля (вызывается каждый тик, шаг 1.5а).
//
// area_control[n]    = Σ REGION_AREAS[r] / province.total_area
//                      для r принадлежащих нации n в провинции
//
// influence_bonus[n] = clamp(relScore_avg / 200, 0, 0.5)
//                    + cultural_presence × 0.10
//
//   relScore_avg = среднее relations.score с другими нациями,
//                 у которых есть регионы в этой провинции
//
// effective_control[n] = area_control[n] × 0.70
//                      + min(1, influence_bonus[n]) × 0.30
// ──────────────────────────────────────────────────────────────
function calculateProvinceControl() {
  if (!GAME_STATE.provinces) return;

  for (const prov of Object.values(GAME_STATE.provinces)) {
    // ── 1. Площадные доли ─────────────────────────────────────
    const ownedArea = {};
    for (const rid of prov.regions) {
      const region = GAME_STATE.regions[rid];
      if (!region?.nation) continue;
      const numericId = rid.replace(/^r/, '');
      const area = (typeof REGION_AREAS !== 'undefined')
                   ? (REGION_AREAS[numericId] ?? 0) : 0;
      ownedArea[region.nation] = (ownedArea[region.nation] || 0) + area;
    }

    const total = prov.total_area || 1;
    prov.control = {};
    for (const [nId, area] of Object.entries(ownedArea)) {
      prov.control[nId] = area / total;
    }

    // ── 2. Дороги ─────────────────────────────────────────────
    prov.has_roads = prov.regions.some(rid => {
      const region = GAME_STATE.regions[rid];
      return region?.building_slots?.some(
        s => s.status === 'active' && s.building_id === 'road',
      );
    });

    // ── 3. Нации с присутствием в провинции ───────────────────
    const provNations = new Set([
      ...Object.keys(prov.control),
      ...Object.keys(prov.influence || {}),
    ]);

    // ── 4. influence_bonus по формуле ─────────────────────────
    const influenceBonus = {};

    for (const nId of provNations) {
      const nation = GAME_STATE.nations[nId];
      if (!nation) continue;

      // Дипломатическое слагаемое: средний score с другими нациями в провинции
      const neighbors = [...provNations].filter(id => id !== nId);
      let relSum = 0;
      let relCount = 0;
      for (const otherId of neighbors) {
        const relEntry = nation.relations?.[otherId];
        if (relEntry != null) {
          relSum += relEntry.score ?? 0;
          relCount++;
        }
      }
      const relAvg = relCount > 0 ? relSum / relCount : 0;
      const relBonus = Math.max(0, Math.min(0.5, relAvg / 200));

      // Культурное слагаемое
      const cultPresence = _provinceCulturalPresence(nId, prov.regions);
      const cultBonus    = cultPresence * 0.10;

      influenceBonus[nId] = Math.min(1.0, relBonus + cultBonus);
    }

    // ── 5. effective_control = area×0.7 + influence×0.3 ──────
    // Сохраняем предыдущие значения для детекции падений
    prov._prev_effective_control = { ...(prov.effective_control || {}) };

    prov.effective_control = {};
    for (const nId of provNations) {
      const ctrl = prov.control[nId]      || 0;
      const infl = influenceBonus[nId]    || 0;
      prov.effective_control[nId] = Math.min(1.0, ctrl * 0.7 + infl * 0.3);
    }
  }
}

// Алиас — вызывается из economy.js (шаг 1.5а)
const updateProvinceControl = calculateProvinceControl;

// ──────────────────────────────────────────────────────────────
// getProvinceMarketAccess(nationId, provinceTag)
//
// Возвращает { fraction, price_modifier, tax_fraction, access_tier }
//
// access_tier:
//   'full'       — 100%: полный доступ, tax_fraction = 1.0
//   'partial'    — 50–99%: prop. доступ, цена +10%×(1-ctrl)
//   'trade_only' — 20–49%: торговля без налогов, цена +15%
//   'none'       — < 20%: провинциальный рынок недоступен
// ──────────────────────────────────────────────────────────────
function getProvinceMarketAccess(nationId, provinceTag) {
  const prov = GAME_STATE.provinces?.[provinceTag];
  if (!prov) return { fraction: 0, price_modifier: 1.0, tax_fraction: 0, access_tier: 'none' };

  const ctrl = prov.effective_control?.[nationId] ?? 0;

  if (ctrl >= 1.0) {
    return { fraction: 1.0, price_modifier: 1.0, tax_fraction: 1.0, access_tier: 'full' };
  } else if (ctrl >= 0.5) {
    return {
      fraction:       ctrl,
      price_modifier: 1.0 + (1 - ctrl) * 0.10,
      tax_fraction:   ctrl,
      access_tier:    'partial',
    };
  } else if (ctrl >= 0.2) {
    return {
      fraction:       ctrl,
      price_modifier: 1.15,
      tax_fraction:   0,
      access_tier:    'trade_only',
    };
  } else {
    return { fraction: 0, price_modifier: 0, tax_fraction: 0, access_tier: 'none' };
  }
}

// ──────────────────────────────────────────────────────────────
// checkProvinceControlEvents()
//
// Вызывается ОДИН РАЗ за ход из processTurn (после военных событий).
// Триггерит события:
//   • Падение ниже 50% — "Теряем влияние в …"  (только для игрока)
//   • Потеря доступа (падение ниже 20%)
//   • Восстановление контроля (рост выше 80%)
// ──────────────────────────────────────────────────────────────
function checkProvinceControlEvents() {
  if (!GAME_STATE.provinces) return;
  if (typeof addEventLog !== 'function') return;

  const player = GAME_STATE.player_nation;

  for (const [provTag, prov] of Object.entries(GAME_STATE.provinces)) {
    const prev = prov._prev_effective_control || {};
    const curr = prov.effective_control       || {};

    // Имя провинции для сообщений
    const provDisplayName = provTag.charAt(0).toUpperCase() + provTag.slice(1);

    // Проверяем игрока
    const prevCtrl = prev[player] ?? 0;
    const currCtrl = curr[player] ?? 0;

    if (prevCtrl >= 0.5 && currCtrl < 0.5 && currCtrl >= 0.2) {
      addEventLog(
        `⚠ Теряем влияние в ${provDisplayName}! `
        + `Контроль упал до ${Math.round(currCtrl * 100)}% — `
        + 'только торговля, налоги не собираются.',
        'warning',
      );
    } else if (prevCtrl >= 0.2 && currCtrl < 0.2) {
      addEventLog(
        `🔴 Утрачен доступ к провинциальному рынку ${provDisplayName}. `
        + `Эффективный контроль: ${Math.round(currCtrl * 100)}%.`,
        'danger',
      );
    } else if (prevCtrl < 0.8 && currCtrl >= 0.8) {
      addEventLog(
        `✅ Восстановлен контроль над ${provDisplayName} `
        + `(${Math.round(currCtrl * 100)}%).`,
        'good',
      );
    }

    // Проверяем угрозу для игрока: если кто-то другой резко вырос
    for (const [otherId, otherCtrl] of Object.entries(curr)) {
      if (otherId === player) continue;
      const otherPrev = prev[otherId] ?? 0;
      if (otherPrev < 0.5 && otherCtrl >= 0.5) {
        const otherName = GAME_STATE.nations[otherId]?.name ?? otherId;
        addEventLog(
          `⚠ ${otherName} захватывает доминирующее положение в ${provDisplayName} `
          + `(${Math.round(otherCtrl * 100)}%).`,
          'warning',
        );
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// buildProvinceMarket()
//
// Каждый тик (шаг 1.5б, после routeProductionToLocalStockpiles).
// Агрегирует local_stockpile всех регионов провинции.
// ──────────────────────────────────────────────────────────────
function buildProvinceMarket() {
  if (!GAME_STATE.provinces) return;

  for (const prov of Object.values(GAME_STATE.provinces)) {
    const aggregated = {};

    for (const rid of prov.regions) {
      const region = GAME_STATE.regions[rid];
      if (!region?.local_stockpile) continue;

      for (const [good, qty] of Object.entries(region.local_stockpile)) {
        if (qty > 0) aggregated[good] = (aggregated[good] || 0) + qty;
      }
    }

    const transportMult = _PROVINCE_TRANSPORT_BASE
                        - (prov.has_roads ? _PROVINCE_ROAD_DISCOUNT : 0);

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
// ──────────────────────────────────────────────────────────────
function getRegionProvince(rid) {
  const region = GAME_STATE.regions?.[rid];
  const tag    = Array.isArray(region?.tags) ? region.tags[0] : null;
  if (!tag || !GAME_STATE.provinces?.[tag]) return null;
  return tag;
}

// ──────────────────────────────────────────────────────────────
// getProvinceBlendColor(regionId)
//
// Для карты: смешивает цвета наций по effective_control провинции.
// Если провинция не оспаривается (один игрок ≥ 0.9) — цвет владельца.
// Иначе — линейный blend двух ведущих наций.
//
// Возвращает строку '#rrggbb' или null (если нет данных).
// ──────────────────────────────────────────────────────────────
function getProvinceBlendColor(regionId) {
  const region = GAME_STATE.regions?.[regionId];
  if (!region) return null;

  const tag  = Array.isArray(region.tags) ? region.tags[0] : null;
  const prov = tag ? GAME_STATE.provinces?.[tag] : null;

  if (!prov?.effective_control) return null;

  // Сортируем нации по effective_control, берём топ-2
  const sorted = Object.entries(prov.effective_control)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return null;

  const [topId, topCtrl] = sorted[0];
  const topColor = GAME_STATE.nations[topId]?.color ?? '#A8A898';

  // Если один игрок ≥ 90% — чистый цвет
  if (topCtrl >= 0.9 || sorted.length === 1) return topColor;

  const [secId, secCtrl] = sorted[1];
  const secColor = GAME_STATE.nations[secId]?.color ?? '#A8A898';

  // Доля второго игрока в смеси (0..0.5 максимум чтобы лидер всегда превалировал)
  const blendT = Math.min(0.5, secCtrl / (topCtrl + secCtrl));
  return _blendHexColors(topColor, secColor, blendT);
}

// ── вспомогательная: смешать два hex-цвета ─────────────────────
function _blendHexColors(c1, c2, t) {
  const parse = c => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const [r1,g1,b1] = parse(c1.length === 7 ? c1 : '#A8A898');
  const [r2,g2,b2] = parse(c2.length === 7 ? c2 : '#A8A898');
  const r = Math.round(r1*(1-t) + r2*t);
  const g = Math.round(g1*(1-t) + g2*t);
  const b = Math.round(b1*(1-t) + b2*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
