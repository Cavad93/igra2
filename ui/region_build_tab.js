// ═══════════════════════════════════════════════════════════════════════════
// ВКЛАДКА СТРОИТЕЛЬСТВА — UI для управления зданиями региона
//
// Публичные функции:
//   renderConstructionTab(regionId)            — строит HTML вкладки
//   toggleBuildingChooser(regionId)            — показать/скрыть список зданий
//   uiOrderConstruction(regionId, buildingId)  — заказать строительство
//   uiCancelConstruction(regionId, slotId)     — отменить строительство (50% возврат)
//   uiDemolishBuilding(regionId, slotId)       — снести построенное здание
// ═══════════════════════════════════════════════════════════════════════════

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

  // Биом имеет приоритет над terrain (как в engine/buildings.js).
  // REGION_BIOMES хранит более точную классификацию (mediterranean_coast и т.д.)
  const _biome   = (typeof REGION_BIOMES !== 'undefined' && REGION_BIOMES[parseInt(regionId)]) || null;
  const terrain  = _biome || region.terrain || 'plains';
  const maxSlots = (typeof getRegionMaxSlots === 'function') ? getRegionMaxSlots(terrain) : 4;

  const activeSlots = (region.building_slots || []).filter(s => s.status !== 'demolished');
  const queue       = region.construction_queue || [];
  const newInQueue  = queue.filter(e => !e.is_upgrade);
  const usedSlots   = activeSlots.length + newInQueue.length;
  const emptyCount  = Math.max(0, maxSlots - usedSlots);

  const nation = GAME_STATE.nations[nationId];

  let cards = '';

  // Активные здания
  for (const slot of activeSlots) {
    cards += _rbtActiveCard(slot, regionId, nation, region);
  }

  // Здания в процессе строительства
  for (const entry of queue) {
    cards += _rbtQueueCard(entry, regionId);
  }

  // Пустые слоты
  for (let i = 0; i < emptyCount; i++) {
    cards += _rbtEmptyCard(regionId);
  }

  const chooserHtml = _rbtBuildingChooser(regionId, region, terrain, nation);

  return `
    <div class="rbt-wrap">
      ${_rbtLandBar(region)}
      <div class="rbt-hdr">
        <span class="rbt-slots-lbl">Слоты:</span>
        <span class="rbt-slots-val">${usedSlots}/${maxSlots}</span>
        <span class="rbt-terrain-tag">${typeof getTerrainName === 'function' ? getTerrainName(terrain) : terrain}</span>
      </div>
      <div class="rbt-grid">${cards}</div>
      ${chooserHtml}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// ЗЕМЕЛЬНАЯ ПОЛОСА
// ──────────────────────────────────────────────────────────────

function _rbtLandBar(region) {
  const land = region.land;
  if (!land || !land.arable_ha) {
    return '<div class="rbt-land rbt-land--nodata">📐 Земельные данные недоступны</div>';
  }

  const used  = land.buildings_ha  || 0;
  const total = land.arable_ha;
  const free  = land.free_ha       || 0;
  const pct   = Math.min(100, Math.round(used / total * 100));

  // Цвет полосы по степени заполнения
  const tier = pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green';

  // Подсказки: сколько единиц каждого пшеничного типа ещё влезет
  const hints = [];
  if (typeof BUILDINGS !== 'undefined') {
    const pairs = [
      ['wheat_family_farm',  '🌾ф'],
      ['wheat_villa',        '🏡в'],
      ['wheat_latifundium',  '🌿л'],
    ];
    for (const [id, label] of pairs) {
      const fp = BUILDINGS[id]?.footprint_ha;
      if (fp && free >= fp) {
        hints.push(`${label}×${Math.floor(free / fp)}`);
      }
    }
  }
  const hintsHtml = hints.length
    ? `<span class="rbt-land-hints">${hints.join(' · ')}</span>`
    : '';

  return `
    <div class="rbt-land">
      <div class="rbt-land-track">
        <div class="rbt-land-fill rbt-land-fill--${tier}" style="width:${pct}%"></div>
      </div>
      <div class="rbt-land-row">
        <span class="rbt-land-stat">
          <b>${used.toLocaleString()}</b> га занято из <b>${total.toLocaleString()}</b> га
        </span>
        <span class="rbt-land-free rbt-land-free--${tier}">
          свободно <b>${free.toLocaleString()}</b> га
        </span>
      </div>
      ${hintsHtml}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// КАРТОЧКИ СЛОТОВ
// ──────────────────────────────────────────────────────────────

// Карточка работающего здания
function _rbtActiveCard(slot, regionId, nation, region) {
  const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[slot.building_id] : null;
  if (!bDef) return '';

  const level    = slot.level || 1;
  // null = без верхнего предела (ограничено землёй/населением)
  const maxLevel = bDef.max_level ?? Infinity;
  const revenue  = slot.revenue ? Math.round(slot.revenue) : 0;
  const wages    = slot.wages_paid ? Math.round(slot.wages_paid) : 0;

  const workerLines = Object.entries(slot.workers || {}).map(([prof, cnt]) => {
    const effective = cnt * level;
    return `<span class="rbt-w-row">${_rbtProfLabel(prof)}: <b>${effective.toLocaleString()}</b></span>`;
  }).join('');

  const upgrading = (region.construction_queue || [])
    .some(e => e.building_id === slot.building_id && e.is_upgrade);

  // Здания с nation_buildable===false улучшаются только автономно (классами), не игроком
  const canUpgrade = bDef.nation_buildable !== false;
  const upgBtn = (canUpgrade && level < maxLevel && !upgrading)
    ? `<button class="rbt-btn rbt-btn--upg"
        onclick="uiOrderConstruction('${regionId}','${slot.building_id}')">▲ Улучшить до ур. ${level + 1}</button>`
    : (upgrading ? `<span class="rbt-badge rbt-badge--wip">Улучшение…</span>` : '');

  return `
    <div class="rbt-card rbt-card--active">
      <div class="rbt-card-head">
        <span class="rbt-icon">${bDef.icon || '🏛'}</span>
        <span class="rbt-bname">${bDef.name}</span>
        ${level > 1 ? `<span class="rbt-badge rbt-badge--lvl">Ур. ${level}</span>` : ''}
        <span class="rbt-badge rbt-badge--ok">Работает</span>
      </div>
      <div class="rbt-card-body">
        <div class="rbt-wrows">${workerLines || '<span class="rbt-dim">Нет рабочих</span>'}</div>
        <div class="rbt-rev">💰 ~${revenue} ден/ход</div>
        ${wages > 0 ? `<div class="rbt-wages">👷 Зарплаты: ${wages} ден</div>` : ''}
      </div>
      <div class="rbt-card-foot">
        ${upgBtn}
        <button class="rbt-btn rbt-btn--dem"
          onclick="uiDemolishBuilding('${regionId}','${slot.slot_id}')">Снести</button>
      </div>
    </div>
  `;
}

// Карточка строящегося здания
function _rbtQueueCard(entry, regionId) {
  const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[entry.building_id] : null;
  if (!bDef) return '';

  const pct    = entry.turns_total > 0
    ? Math.round((1 - entry.turns_left / entry.turns_total) * 100)
    : 0;
  const refund = Math.round((bDef.cost || 0) * 0.5);

  const isUpgrade = !!entry.is_upgrade;

  return `
    <div class="rbt-card rbt-card--queue">
      <div class="rbt-card-head">
        <span class="rbt-icon">${bDef.icon || '🏗'}</span>
        <span class="rbt-bname">${bDef.name}</span>
        <span class="rbt-badge rbt-badge--wip">${isUpgrade ? `Улучшение до ур. ${entry.to_level}` : 'Строится'}</span>
      </div>
      <div class="rbt-card-body">
        <div class="rbt-prog-wrap"><div class="rbt-prog-bar" style="width:${pct}%"></div></div>
        <div class="rbt-turns-left">
          Осталось: <b>${entry.turns_left}</b> ход${_rbtTurnsSuffix(entry.turns_left)}
        </div>
      </div>
      <div class="rbt-card-foot">
        <button class="rbt-btn rbt-btn--cancel"
          onclick="uiCancelConstruction('${regionId}','${entry.slot_id}')">
          Отменить (+${refund} монет)
        </button>
      </div>
    </div>
  `;
}

// Карточка пустого слота
function _rbtEmptyCard(regionId) {
  return `
    <div class="rbt-card rbt-card--empty" onclick="toggleBuildingChooser('${regionId}')">
      <div class="rbt-empty-inner">
        <span class="rbt-plus">＋</span>
        <span class="rbt-empty-lbl">Построить</span>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// СПИСОК ЗДАНИЙ-КАНДИДАТОВ
// ──────────────────────────────────────────────────────────────

function _rbtBuildingChooser(regionId, region, terrain, nation) {
  // Скрываем здания, которые уже есть в регионе (для них есть кнопка «Улучшить» на карточке)
  const builtIds = new Set(
    (region.building_slots || [])
      .filter(s => s.status !== 'demolished')
      .map(s => s.building_id),
  );
  const inQueueIds = new Set(
    (region.construction_queue || [])
      .filter(e => !e.is_upgrade)
      .map(e => e.building_id),
  );

  const compatible = (typeof getBuildingsForTerrain === 'function')
    ? getBuildingsForTerrain(terrain, region).filter(b => !builtIds.has(b.id) && !inQueueIds.has(b.id))
    : [];

  if (!compatible.length) {
    return '<div class="rbt-chooser hidden" id="rbt-chooser"></div>';
  }

  const treasury = nation?.economy?.treasury || 0;

  const bCards = compatible.map(b => {
    const check   = (typeof canBuildInRegion === 'function')
      ? canBuildInRegion(b.id, region)
      : { ok: true, reason: null };
    const dynCost = (typeof calcConstructionCost === 'function')
      ? calcConstructionCost(b.id)
      : (b.cost || 0);

    // Три порога доступности
    let affordTier; // 'green' | 'yellow' | 'red'
    if (treasury >= dynCost * 1.5) affordTier = 'green';
    else if (treasury >= dynCost)  affordTier = 'yellow';
    else                            affordTier = 'red';

    const canAfford = (affordTier !== 'red');
    const disabled  = !check.ok || !canAfford;
    const reason    = !check.ok
      ? check.reason
      : (!canAfford ? `Нужно ${dynCost.toLocaleString()} монет` : null);

    // Разбивка по материалам
    const mats = b.construction_materials || {};
    const matLines = Object.entries(mats).map(([good, amt]) => {
      const g     = (typeof GOODS !== 'undefined') ? GOODS[good] : null;
      const price = GAME_STATE?.market?.[good]?.price ?? g?.base_price ?? 0;
      const total = Math.round(amt * price);
      return `<span class="rbt-bc-mat">${g ? g.icon : '📦'}${amt}×${Math.round(price)}=${total}</span>`;
    }).join('');

    const totalWorkers = (b.worker_profession || []).reduce((s, wp) => s + wp.count, 0);
    const prodItems    = (b.production_output || []).map(p => {
      const g = (typeof GOODS !== 'undefined') ? GOODS[p.good] : null;
      return `${g ? g.icon : '📦'} ${g ? g.name : p.good}`;
    }).join(', ');

    // Земельная строка
    const footprint = b.footprint_ha ?? 0;
    const freeHa    = region.land?.free_ha ?? null;
    let landHtml = '';
    if (footprint > 0) {
      if (freeHa === null) {
        landHtml = `<div class="rbt-bc-land">📐 ${footprint} га</div>`;
      } else {
        const landOk  = freeHa >= footprint;
        const tierCls = landOk ? 'ok' : 'bad';
        const sign    = landOk ? '✓' : '✗';
        landHtml = `<div class="rbt-bc-land rbt-bc-land--${tierCls}">` +
          `📐 ${footprint} га · свободно ${Math.round(freeHa).toLocaleString()} га ${sign}</div>`;
      }
    }

    return `
      <div class="rbt-bcard rbt-bcard--${affordTier}${disabled ? ' rbt-bcard--dis' : ''}"
        ${disabled ? `title="${reason || ''}"` : `onclick="uiOrderConstruction('${regionId}','${b.id}')"`}>
        <div class="rbt-bc-head">
          <span class="rbt-bc-icon">${b.icon || '🏛'}</span>
          <span class="rbt-bc-name">${b.name}</span>
          <span class="rbt-bc-cost rbt-bc-cost--${affordTier}">💰${dynCost.toLocaleString()}</span>
        </div>
        <div class="rbt-bc-body">
          ${totalWorkers > 0 ? `<div class="rbt-bc-wkr">👷 ${totalWorkers.toLocaleString()} рабочих</div>` : ''}
          ${b.build_turns ? `<div class="rbt-bc-turns">⏳ ${b.build_turns} хода</div>` : ''}
          ${prodItems ? `<div class="rbt-bc-prod">${prodItems}</div>` : ''}
          ${landHtml}
          ${matLines ? `<div class="rbt-bc-mats">${matLines}</div>` : ''}
          ${reason ? `<div class="rbt-bc-reason">${reason}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="rbt-chooser hidden" id="rbt-chooser">
      <div class="rbt-ch-hdr">
        <span class="rbt-ch-title">Выбор здания</span>
        <button class="rbt-ch-close" onclick="toggleBuildingChooser('${regionId}')">✕</button>
      </div>
      <div class="rbt-ch-treasury">Казна: ${Math.round(treasury).toLocaleString()} монет</div>
      <div class="rbt-ch-grid">${bCards}</div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// ПУБЛИЧНЫЕ ОБРАБОТЧИКИ СОБЫТИЙ
// ──────────────────────────────────────────────────────────────

function toggleBuildingChooser(regionId) {
  const ch = document.getElementById('rbt-chooser');
  if (!ch) return;
  ch.classList.toggle('hidden');
}

function uiOrderConstruction(regionId, buildingId) {
  const result = (typeof orderBuildingConstruction === 'function')
    ? orderBuildingConstruction(GAME_STATE.player_nation, regionId, buildingId)
    : { ok: false, reason: 'Движок зданий не загружен' };

  if (result.ok) {
    _activeRegionTab = 'build';
    showRegionInfo(regionId);
  } else {
    // Показываем ошибку в шапке chooser
    const ch = document.getElementById('rbt-chooser');
    if (ch) {
      let err = ch.querySelector('.rbt-err');
      if (!err) {
        err = document.createElement('div');
        err.className = 'rbt-err';
        ch.insertBefore(err, ch.children[1] || null);
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
  if (!confirm('Снести здание? Рабочие потеряют занятость.')) return;
  if (typeof demolishBuilding === 'function') {
    demolishBuilding(GAME_STATE.player_nation, regionId, slotId);
  }
  _activeRegionTab = 'build';
  showRegionInfo(regionId);
}

// ──────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ
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
