// ═══════════════════════════════════════════════════════════════════════════
// ВКЛАДКА СТРОИТЕЛЬСТВА — Аккордеон по категориям (Вариант B)
//
// Публичные функции:
//   renderConstructionTab(regionId)            — строит HTML вкладки
//   rbtToggleCategory(regionId, catId)         — раскрыть/свернуть категорию
//   uiOrderConstruction(regionId, buildingId)  — заказать строительство / улучшение
//   uiCancelConstruction(regionId, slotId)     — отменить строительство (50% возврат)
//   uiDemolishBuilding(regionId, slotId)       — снести здание
// ═══════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ КАТЕГОРИЙ
// ──────────────────────────────────────────────────────────────

const RBT_CATEGORIES = [
  { id: 'agriculture',    label: 'Сельское хозяйство', icon: '🌾' },
  { id: 'production',     label: 'Производство',        icon: '⚒' },
  { id: 'infrastructure', label: 'Инфраструктура',      icon: '🏛' },
  { id: 'commerce',       label: 'Торговля',             icon: '💰' },
  { id: 'military',       label: 'Военные',              icon: '⚔' },
  { id: 'culture',        label: 'Культура',             icon: '🎭' },
];

// Состояние открытых категорий: { regionId -> Set<catId> }
// По умолчанию открыты категории, в которых есть здания
const _rbtOpenCats = {};

function _getRbtOpenCats(regionId) {
  if (!_rbtOpenCats[regionId]) _rbtOpenCats[regionId] = new Set();
  return _rbtOpenCats[regionId];
}

// ──────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ — возвращает HTML всей вкладки
// ──────────────────────────────────────────────────────────────

function renderConstructionTab(regionId) {
  const region = GAME_STATE.regions[regionId];
  if (!region) return '<div class="rbt-empty">Данные региона недоступны.</div>';

  const nationId = region.nation;
  if (nationId !== GAME_STATE.player_nation) {
    return `<div class="rbt-foreign">
      <span class="rbt-foreign-icon">🔒</span>
      <span>Строительство доступно<br>только в ваших регионах.</span>
    </div>`;
  }

  // Биом → тип местности
  const _biome  = (typeof REGION_BIOMES !== 'undefined' && REGION_BIOMES[parseInt(regionId)]) || null;
  const terrain = _biome || region.terrain || 'plains';
  const maxSlots = (typeof getRegionMaxSlots === 'function') ? getRegionMaxSlots(terrain) : 10;

  const activeSlots = (region.building_slots || []).filter(s => s.status !== 'demolished');
  const queue       = region.construction_queue || [];
  const newInQueue  = queue.filter(e => !e.is_upgrade);
  const usedSlots   = activeSlots.length + newInQueue.length;
  const slotsLeft   = Math.max(0, maxSlots - usedSlots);

  const nation = GAME_STATE.nations[nationId];

  // Все доступные для постройки здания (совместимые с биомом/terrain)
  const compatible = (typeof getBuildingsForTerrain === 'function')
    ? getBuildingsForTerrain(terrain, region)
    : [];

  // Открываем категории с активными зданиями при первом показе
  const openCats = _getRbtOpenCats(regionId);
  if (openCats.size === 0) {
    const builtCats = new Set(
      activeSlots.map(s => (typeof BUILDINGS !== 'undefined' && BUILDINGS[s.building_id]?.category) || 'production')
    );
    builtCats.forEach(c => openCats.add(c));
    // Если совсем пусто — открыть первую категорию
    if (openCats.size === 0) openCats.add('agriculture');
  }

  // Строим аккордеон
  const terrainName = typeof getTerrainName === 'function' ? getTerrainName(terrain) : terrain;
  const slotsTierCls = usedSlots >= maxSlots ? 'rbt-slots-val--full' : '';

  let accordion = '';
  for (const cat of RBT_CATEGORIES) {
    accordion += _rbtCategoryBlock(cat, regionId, region, nation, activeSlots, queue, compatible, slotsLeft, openCats);
  }

  return `
    <div class="rbt-wrap">
      ${_rbtLandBar(region)}
      <div class="rbt-hdr">
        <span class="rbt-slots-lbl">Слоты:</span>
        <span class="rbt-slots-val ${slotsTierCls}">${usedSlots}/${maxSlots}</span>
        <span class="rbt-terrain-tag">${terrainName}</span>
      </div>
      <div class="rbt-accordion">${accordion}</div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// РЕНДЕР ОДНОЙ КАТЕГОРИИ-АККОРДЕОНА
// ──────────────────────────────────────────────────────────────

function _rbtCategoryBlock(cat, regionId, region, nation, activeSlots, queue, compatible, slotsLeft, openCats) {
  const catId = cat.id;

  // Активные здания этой категории
  const builtSlots = activeSlots.filter(s => {
    const bDef = typeof BUILDINGS !== 'undefined' ? BUILDINGS[s.building_id] : null;
    return (bDef?.category || 'production') === catId;
  });

  // Здания в очереди этой категории
  const queuedEntries = queue.filter(e => {
    const bDef = typeof BUILDINGS !== 'undefined' ? BUILDINGS[e.building_id] : null;
    return (bDef?.category || 'production') === catId;
  });

  // Доступные для постройки в этой категории (ещё не построены)
  const builtIds    = new Set(builtSlots.map(s => s.building_id));
  const inQueueIds  = new Set(queuedEntries.filter(e => !e.is_upgrade).map(e => e.building_id));
  const availBuildings = compatible.filter(b => {
    const bCat = b.category || 'production';
    return bCat === catId && !builtIds.has(b.id) && !inQueueIds.has(b.id);
  });

  // Пустая категория — не рендерим
  if (builtSlots.length === 0 && queuedEntries.length === 0 && availBuildings.length === 0) {
    return '';
  }

  const isOpen   = openCats.has(catId);
  const hdrCls   = isOpen ? 'rbt-ac-hdr rbt-ac-hdr--open' : 'rbt-ac-hdr';
  const bodyCls  = isOpen ? 'rbt-ac-body rbt-ac-body--open' : 'rbt-ac-body';

  // Статистика для заголовка
  const totalWorkers = builtSlots.reduce((sum, s) => {
    const level = s.level || 1;
    return sum + Object.values(s.workers || {}).reduce((a, v) => a + v * level, 0);
  }, 0);
  const statsHtml = builtSlots.length > 0
    ? `<span class="rbt-ac-stats"><b>${builtSlots.length}</b> зд · <b>${totalWorkers.toLocaleString()}</b> раб.</span>`
    : `<span class="rbt-ac-stats">${availBuildings.length} доступно</span>`;

  // Строки тела
  let rows = '';
  for (const slot of builtSlots) {
    rows += _rbtBuiltRow(slot, regionId, region, nation);
  }
  for (const entry of queuedEntries) {
    rows += _rbtQueueRow(entry, regionId);
  }
  for (const b of availBuildings) {
    rows += _rbtAvailRow(b, regionId, region, nation, slotsLeft);
  }

  return `
    <div class="rbt-ac-cat" id="rbt-cat-${regionId}-${catId}">
      <div class="${hdrCls}" onclick="rbtToggleCategory('${regionId}','${catId}')">
        <span class="rbt-ac-icon">${cat.icon}</span>
        <span class="rbt-ac-title">${cat.label}</span>
        ${statsHtml}
        <span class="rbt-ac-chevron">▶</span>
      </div>
      <div class="${bodyCls}">
        ${rows}
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// СТРОКА: АКТИВНОЕ ЗДАНИЕ
// ──────────────────────────────────────────────────────────────

function _rbtBuiltRow(slot, regionId, region, nation) {
  const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[slot.building_id] : null;
  if (!bDef) return '';

  const level    = slot.level || 1;
  const maxLevel = bDef.max_level ?? Infinity;
  const revenue  = slot.revenue ? Math.round(slot.revenue) : 0;
  const isPaused = slot.status === 'paused';

  // Суммарные работники (level × workers_per_unit)
  const totalWorkers = Object.values(slot.workers || {}).reduce((s, v) => s + v * level, 0);

  // Проверяем: идёт ли уже улучшение
  const upgrading = (region.construction_queue || [])
    .some(e => e.building_id === slot.building_id && e.is_upgrade);

  const canUpgrade = bDef.nation_buildable !== false && level < maxLevel && !upgrading && !isPaused;

  // Метки: автономное здание / достигнут максимум / пауза
  const autoTag = bDef.autonomous_builder
    ? `<span class="rbt-ac-auto" title="Также строится автономно классом населения">🤝</span>`
    : '';
  const maxTag  = (level >= maxLevel && maxLevel !== Infinity)
    ? `<span class="rbt-ac-lvl" title="Максимальный уровень">макс</span>`
    : '';
  const pauseTag = isPaused
    ? `<span class="rbt-ac-pause-tag" title="На паузе — не производит и не рекрутирует">⏸</span>`
    : '';

  const upgBtn = canUpgrade
    ? `<button class="rbt-ac-btn rbt-ac-btn--upg"
         title="Построить ещё 1 здание (уровень ${level} → ${level + 1})"
         onclick="uiOrderConstruction('${regionId}','${slot.building_id}')">▲ +1</button>`
    : (upgrading
        ? `<span class="rbt-ac-building">▲…</span>`
        : (!isPaused ? maxTag : ''));

  const demBtn = `<button class="rbt-ac-btn rbt-ac-btn--dem"
      title="${level > 1 ? 'Снизить уровень' : 'Снести'}"
      onclick="uiDemolishBuilding('${regionId}','${slot.slot_id}')">✕</button>`;

  // Кнопка паузы — для всех зданий
  const pauseBtn = `<button class="rbt-ac-btn rbt-ac-btn--pause${isPaused ? ' rbt-ac-btn--paused' : ''}"
      title="${isPaused ? 'Возобновить работу' : 'Приостановить'}"
      onclick="uiToggleBuildingPause('${regionId}','${slot.slot_id}')">
      ${isPaused ? '▶' : '⏸'}</button>`;

  // Строка рекрутинга (для казарм, конюшен, военного порта)
  const ro = bDef.recruit_output;
  let recruitInfo = '';
  if (ro) {
    const unitLabels = { infantry: 'пехота', cavalry: 'конница', light_ships: 'корабли' };
    const perTurn = isPaused ? 0 : level * ro.per_level_per_turn;
    const popCost = isPaused ? 0 : perTurn * ro.pop_cost_per_unit;
    const lastTurn = slot._recruited_last_turn ?? 0;
    const unitLabel = unitLabels[ro.unit_type] ?? ro.unit_type;
    recruitInfo = `
      <div class="rbt-recruit-info${isPaused ? ' rbt-recruit-info--paused' : ''}">
        🪖 ${isPaused ? '<i>Пауза</i>' : `+${perTurn} ${unitLabel}/ход · −${popCost} нас.`}
        ${!isPaused && lastTurn > 0 ? `<span class="rbt-recruit-last">(прошл. ход: +${lastTurn})</span>` : ''}
      </div>`;
  }

  return `
    <div class="rbt-ac-row rbt-ac-row--built${isPaused ? ' rbt-ac-row--paused' : ''}">
      <span class="rbt-ac-bicon">${bDef.icon || '🏛'}</span>
      <span class="rbt-ac-bname">${bDef.name}</span>
      ${autoTag}${pauseTag}
      ${level > 1 ? `<span class="rbt-ac-lvl">×${level}</span>` : ''}
      <span class="rbt-ac-workers"><b>${totalWorkers.toLocaleString()}</b> раб.</span>
      <span class="rbt-ac-rev">💰${revenue.toLocaleString()}</span>
      <span class="rbt-ac-actions">${upgBtn}${pauseBtn}${demBtn}</span>
      ${recruitInfo}
    </div>
  `;
}

/**
 * Переключает паузу здания (active ↔ paused).
 * Вызывается из HTML кнопки.
 */
function uiToggleBuildingPause(regionId, slotId) {
  const region = GAME_STATE.regions?.[regionId];
  if (!region) return;
  const slot = (region.building_slots ?? []).find(s => s.slot_id === slotId);
  if (!slot) return;
  slot.status = slot.status === 'paused' ? 'active' : 'paused';
  if (typeof showRegionInfo === 'function') showRegionInfo(regionId);
  else if (typeof renderAll === 'function') renderAll();
}

// ──────────────────────────────────────────────────────────────
// СТРОКА: ЗДАНИЕ В ОЧЕРЕДИ
// ──────────────────────────────────────────────────────────────

function _rbtQueueRow(entry, regionId) {
  const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[entry.building_id] : null;
  if (!bDef) return '';

  const pct    = entry.turns_total > 0
    ? Math.round((1 - entry.turns_left / entry.turns_total) * 100)
    : 0;
  const refund = Math.round((bDef.cost || 0) * 0.5);
  const label  = entry.is_upgrade ? `▲ ур. ${entry.to_level}` : 'Строится';

  return `
    <div class="rbt-ac-row rbt-ac-row--queue">
      <span class="rbt-ac-bicon">${bDef.icon || '🏗'}</span>
      <span class="rbt-ac-bname">${bDef.name}</span>
      <span class="rbt-ac-building">${label}</span>
      <span class="rbt-ac-workers" style="color:#ffb74d"><b>${entry.turns_left}</b> ход${_rbtTurnsSuffix(entry.turns_left)}</span>
      <div style="flex:1">
        <div class="rbt-ac-prog"><div class="rbt-ac-prog-fill" style="width:${pct}%"></div></div>
      </div>
      <span class="rbt-ac-actions">
        <button class="rbt-ac-btn rbt-ac-btn--cancel"
          title="Отменить (+${refund} монет)"
          onclick="uiCancelConstruction('${regionId}','${entry.slot_id}')">✕ +${refund}</button>
      </span>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// СТРОКА: ДОСТУПНОЕ ДЛЯ ПОСТРОЙКИ ЗДАНИЕ
// ──────────────────────────────────────────────────────────────

function _rbtAvailRow(b, regionId, region, nation, slotsLeft) {
  const check = (typeof canBuildInRegion === 'function')
    ? canBuildInRegion(b.id, region)
    : { ok: true, reason: null };

  // Детальный расчёт стоимости (материалы × рыночная цена × 1.2)
  const detail  = (typeof calcConstructionCostDetailed === 'function')
    ? calcConstructionCostDetailed(b.id)
    : { total: b.cost || 0, lines: [], laborCost: 0 };
  const dynCost = detail.total;
  const treasury = nation?.economy?.treasury || 0;

  let costTier, costCls;
  if (treasury >= dynCost * 1.5) { costTier = 'ok';  costCls = 'rbt-ac-cost--ok'; }
  else if (treasury >= dynCost)  { costTier = 'low'; costCls = 'rbt-ac-cost--low'; }
  else                            { costTier = 'no';  costCls = 'rbt-ac-cost--no'; }

  const canAfford = costTier !== 'no';
  const noSlots   = slotsLeft <= 0;

  // Определяем блокировку и причину
  let disabled = false;
  let reason   = null;
  if (noSlots) {
    disabled = true;
    reason   = 'Нет слотов';
  } else if (!check.ok) {
    disabled = true;
    reason   = check.reason;
  } else if (!canAfford) {
    disabled = true;
    reason   = `Нужно ${dynCost.toLocaleString()}`;
  }

  // Строка иконок материалов с количеством (кликабельный тултип)
  const matIcons = detail.lines.map(l =>
    `<span class="rbt-ac-mat" title="${l.name}: ${l.amount}×${l.price}=${l.subtotal}">` +
    `${l.icon}${l.amount}</span>`
  ).join('');
  // Tooltip с полной разбивкой для кнопки ＋
  const matTooltip = detail.lines.map(l =>
    `${l.icon} ${l.name}: ${l.amount} × ${l.price} = ${l.subtotal}`
  ).join('\n') + `\nТруд (+20%): ${detail.laborCost}\nИТОГО: ${dynCost}`;

  const totalWorkers = (b.worker_profession || []).reduce((s, wp) => s + wp.count, 0);

  const addBtn = `<button class="rbt-ac-btn rbt-ac-btn--add"
      ${disabled ? 'disabled' : `onclick="uiOrderConstruction('${regionId}','${b.id}')"`}
      title="${disabled ? (reason || 'Недоступно') : matTooltip}">＋</button>`;

  const rowCls = disabled ? 'rbt-ac-row rbt-ac-row--avail rbt-ac-row--noafford' : 'rbt-ac-row rbt-ac-row--avail';

  return `
    <div class="${rowCls}">
      <span class="rbt-ac-bicon">${b.icon || '🏛'}</span>
      <span class="rbt-ac-bname">${b.name}</span>
      ${reason ? `<span class="rbt-ac-reason" title="${reason}">${reason}</span>` : ''}
      ${matIcons ? `<span class="rbt-ac-mats">${matIcons}</span>` : ''}
      ${totalWorkers > 0 ? `<span class="rbt-ac-workers">${totalWorkers.toLocaleString()} раб.</span>` : ''}
      <span class="rbt-ac-cost ${costCls}">💰${dynCost.toLocaleString()}</span>
      <span class="rbt-ac-actions">${addBtn}</span>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// ЗЕМЕЛЬНАЯ ПОЛОСА (без изменений)
// ──────────────────────────────────────────────────────────────

function _rbtLandBar(region) {
  const land = region.land;
  if (!land || !land.arable_ha) {
    return '<div class="rbt-land rbt-land--nodata">📐 Земельные данные недоступны</div>';
  }

  const used  = land.buildings_ha    || 0;
  const limit = land.max_buildings_ha || land.arable_ha;
  const free  = land.free_ha          || 0;
  const total = land.total_ha         || land.arable_ha;
  const pct   = Math.min(100, Math.round(used / limit * 100));
  const tier  = pct >= 95 ? 'red' : pct >= 75 ? 'yellow' : 'green';

  const hints = [];
  if (typeof BUILDINGS !== 'undefined') {
    const pairs = [
      ['wheat_family_farm', '🌾ф'],
      ['wheat_villa',       '🏡в'],
      ['wheat_latifundium', '🌿л'],
    ];
    for (const [id, label] of pairs) {
      const fp = BUILDINGS[id]?.footprint_ha;
      if (fp && free >= fp) hints.push(`${label}×${Math.floor(free / fp)}`);
    }
  }
  const hintsHtml = hints.length
    ? `<span class="rbt-land-hints">${hints.join(' · ')}</span>`
    : '';

  return `
    <div class="rbt-land">
      <div class="rbt-land-track">
        <div class="rbt-land-fill rbt-land-fill--${tier}" style="width:${pct}%"></div>
        <div class="rbt-land-limit-marker" title="Лимит 70% площади региона" style="left:100%"></div>
      </div>
      <div class="rbt-land-row">
        <span class="rbt-land-stat">
          <b>${used.toLocaleString()}</b> га из <b>${limit.toLocaleString()}</b> га
        </span>
        <span class="rbt-land-free rbt-land-free--${tier}">
          свободно <b>${free.toLocaleString()}</b> га
        </span>
      </div>
      ${land.settlement_ha > 0 ? `<div class="rbt-land-settlement">🏘 Поселения: ${land.settlement_ha.toLocaleString()} га</div>` : ''}
      ${hintsHtml}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// ПУБЛИЧНЫЕ ОБРАБОТЧИКИ СОБЫТИЙ
// ──────────────────────────────────────────────────────────────

function rbtToggleCategory(regionId, catId) {
  const openCats = _getRbtOpenCats(regionId);
  if (openCats.has(catId)) openCats.delete(catId);
  else                      openCats.add(catId);

  // Обновляем только этот блок без полного перерисования
  const catEl  = document.getElementById(`rbt-cat-${regionId}-${catId}`);
  if (!catEl) { showRegionInfo(regionId); return; }

  const hdrEl  = catEl.querySelector('.rbt-ac-hdr');
  const bodyEl = catEl.querySelector('.rbt-ac-body');
  if (!hdrEl || !bodyEl) return;

  if (openCats.has(catId)) {
    hdrEl.classList.add('rbt-ac-hdr--open');
    bodyEl.classList.add('rbt-ac-body--open');
  } else {
    hdrEl.classList.remove('rbt-ac-hdr--open');
    bodyEl.classList.remove('rbt-ac-body--open');
  }
}

function uiOrderConstruction(regionId, buildingId) {
  const result = (typeof orderBuildingConstruction === 'function')
    ? orderBuildingConstruction(GAME_STATE.player_nation, regionId, buildingId)
    : { ok: false, reason: 'Движок зданий не загружен' };

  if (result.ok) {
    _activeRegionTab = 'build';
    showRegionInfo(regionId);
  } else {
    // Краткое уведомление в шапке панели (если есть rbt-hdr)
    const wrap = document.querySelector('.rbt-wrap');
    if (wrap) {
      let err = wrap.querySelector('.rbt-err');
      if (!err) {
        err = document.createElement('div');
        err.className = 'rbt-err';
        wrap.insertBefore(err, wrap.children[1] || null);
      }
      err.textContent = result.reason || 'Ошибка строительства';
      clearTimeout(err._tid);
      err._tid = setTimeout(() => { if (err.parentNode) err.remove(); }, 3000);
    }
  }
}

function uiCancelConstruction(regionId, slotId) {
  if (typeof cancelConstruction === 'function') {
    cancelConstruction(GAME_STATE.player_nation, regionId, slotId);
  }
  _activeRegionTab = 'build';
  showRegionInfo(regionId);
}

function uiDemolishBuilding(regionId, slotId) {
  const region = GAME_STATE.regions[regionId];
  const slot   = (region?.building_slots || []).find(s => s.slot_id === slotId);
  const level  = slot?.level ?? 1;
  const msg    = level > 1
    ? `Снизить уровень здания с ${level} до ${level - 1}? Возврат 50% стоимости уровня.`
    : 'Снести здание полностью? Рабочие потеряют занятость.';
  if (!confirm(msg)) return;
  if (typeof demolishBuilding === 'function') {
    demolishBuilding(GAME_STATE.player_nation, regionId, slotId);
  }
  _activeRegionTab = 'build';
  showRegionInfo(regionId);
}

// ──────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────────────────────

function _rbtProfLabel(prof) {
  const MAP = {
    farmers: 'Земледельцы', craftsmen: 'Ремесленники', merchants: 'Торговцы',
    sailors: 'Моряки', clergy: 'Духовенство', soldiers: 'Солдаты', slaves: 'Рабы',
  };
  return MAP[prof] || prof;
}

function _rbtTurnsSuffix(n) {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return '';
  if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'а';
  return 'ов';
}
