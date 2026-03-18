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

  const terrain  = region.terrain || 'plains';
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
// КАРТОЧКИ СЛОТОВ
// ──────────────────────────────────────────────────────────────

// Карточка работающего здания
function _rbtActiveCard(slot, regionId, nation, region) {
  const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[slot.building_id] : null;
  if (!bDef) return '';

  const level    = slot.level || 1;
  const maxLevel = bDef.max_level ?? 1;
  const revenue  = slot.revenue ? Math.round(slot.revenue) : 0;
  const wages    = slot.wages_paid ? Math.round(slot.wages_paid) : 0;

  const workerLines = Object.entries(slot.workers || {}).map(([prof, cnt]) => {
    const effective = cnt * level;
    return `<span class="rbt-w-row">${_rbtProfLabel(prof)}: <b>${effective.toLocaleString()}</b></span>`;
  }).join('');

  const upgrading = (region.construction_queue || [])
    .some(e => e.building_id === slot.building_id && e.is_upgrade);

  const upgBtn = (level < maxLevel && !upgrading)
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
    const check     = (typeof canBuildInRegion === 'function')
      ? canBuildInRegion(b.id, region)
      : { ok: true, reason: null };
    const canAfford = treasury >= (b.cost || 0);
    const disabled  = !check.ok || !canAfford;
    const reason    = !check.ok ? check.reason : (!canAfford ? `Нужно ${b.cost} монет` : null);

    const totalWorkers = (b.worker_profession || []).reduce((s, wp) => s + wp.count, 0);
    const prodItems    = (b.production_output || []).map(p => {
      const g = (typeof GOODS !== 'undefined') ? GOODS[p.good] : null;
      return `${g ? g.icon : '📦'} ${g ? g.name : p.good}`;
    }).join(', ');

    return `
      <div class="rbt-bcard${disabled ? ' rbt-bcard--dis' : ''}"
        ${disabled ? `title="${reason || ''}"` : `onclick="uiOrderConstruction('${regionId}','${b.id}')"`}>
        <div class="rbt-bc-head">
          <span class="rbt-bc-icon">${b.icon || '🏛'}</span>
          <span class="rbt-bc-name">${b.name}</span>
          <span class="rbt-bc-cost${canAfford ? '' : ' rbt-bc-cost--poor'}">💰${(b.cost || 0).toLocaleString()}</span>
        </div>
        <div class="rbt-bc-body">
          ${totalWorkers > 0 ? `<div class="rbt-bc-wkr">👷 ${totalWorkers.toLocaleString()} рабочих</div>` : ''}
          ${b.build_turns ? `<div class="rbt-bc-turns">⏳ ${b.build_turns} хода</div>` : ''}
          ${prodItems ? `<div class="rbt-bc-prod">${prodItems}</div>` : ''}
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
