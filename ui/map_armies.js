// ══════════════════════════════════════════════════════════════════════
// MAP ARMIES — визуализация армий и флотов на карте Leaflet
//
// Слои: armyMarkersLayer (маркеры), armyPathsLayer (линии маршрута),
//       siegeMarkersLayer (индикаторы осад)
//
// Маркер: DivIcon с иконкой, числом войск, мини-барами морали/снабжения.
// Маршрут: пунктирная L.polyline + призрак на следующий ход.
// ══════════════════════════════════════════════════════════════════════

let armyMarkersLayer  = null;
let armyPathsLayer    = null;
let siegeMarkersLayer = null;

const _armyMarkers   = {};  // armyId → L.Marker
const _armyPaths     = {};  // armyId → { line, ghost }
const _siegeIcons    = {};  // siegeId → L.Marker

let _selectedArmyId     = null;
let _activeMoveHandler  = null;  // функция-обработчик клика по региону в режиме движения

// ── Инициализация ─────────────────────────────────────────────────────

function initArmyLayers() {
  if (!leafletMap || armyMarkersLayer) return;
  armyPathsLayer    = L.layerGroup().addTo(leafletMap);
  siegeMarkersLayer = L.layerGroup().addTo(leafletMap);
  armyMarkersLayer  = L.layerGroup().addTo(leafletMap); // поверх путей
}

// ── Полная перерисовка ────────────────────────────────────────────────

function renderAllArmies() {
  if (!leafletMap) return;
  if (!armyMarkersLayer) initArmyLayers();

  armyMarkersLayer.clearLayers();
  armyPathsLayer.clearLayers();
  siegeMarkersLayer.clearLayers();

  Object.keys(_armyMarkers).forEach(k => delete _armyMarkers[k]);
  Object.keys(_armyPaths).forEach(k => delete _armyPaths[k]);
  Object.keys(_siegeIcons).forEach(k => delete _siegeIcons[k]);

  for (const army of (GAME_STATE.armies ?? [])) {
    if (army.state === 'disbanded' || army.state === 'embarked') continue;
    _renderArmyMarker(army);
    if (army.path?.length > 0) _renderMovementLine(army);
  }

  for (const siege of (GAME_STATE.sieges ?? [])) {
    if (siege.status === 'active') _renderSiegeIndicator(siege);
  }
}

// ── Маркер армии ──────────────────────────────────────────────────────

function _renderArmyMarker(army) {
  const center = _regionCenter(army.position);
  if (!center) return;

  const isPlayer = army.nation === GAME_STATE.player_nation;
  const color    = _nationColor(army.nation);
  const isNaval  = army.type === 'naval';

  const count = isNaval
    ? Object.values(army.ships ?? {}).reduce((s, n) => s + n, 0)
    : (army.units.infantry ?? 0) + (army.units.cavalry ?? 0) + (army.units.mercenaries ?? 0);

  const countStr = count >= 1000 ? (count / 1000).toFixed(1) + 'к' : String(count);
  const typeIcon = isNaval ? '⛵' : '🛡';

  const stateIcon = { sieging: '🏰', routing: '💨', resting: '⛺', moving: '➡' }[army.state] ?? '';

  const selected = _selectedArmyId === army.id ? ' army-marker--selected' : '';
  const playerCls = isPlayer ? ' army-marker--player' : '';

  const html = `
    <div class="army-marker${selected}${playerCls}" style="--army-color:${color}">
      <div class="army-marker__top">
        <span class="army-marker__icon">${typeIcon}</span>
        <span class="army-marker__count">${countStr}</span>
        <span class="army-marker__state">${stateIcon}</span>
      </div>
      <div class="army-marker__bars">
        ${_miniBar(army.morale,  '#4caf50', '#f44336')}
        ${_miniBar(army.supply,  '#2196f3', '#ff5722')}
      </div>
    </div>`;

  const icon = L.divIcon({ html, className: '', iconSize: [54, 42], iconAnchor: [27, 21] });
  const m    = L.marker(center, { icon, zIndexOffset: 1000 });

  m.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    if (_activeMoveHandler) {
      // Сначала обрабатываем движение если активен режим
    } else {
      selectArmy(army.id);
    }
  });

  m.bindTooltip(`
    <b>${army.name}</b><br>
    Мораль: ${army.morale} · Дисциплина: ${army.discipline}<br>
    Снабжение: ${army.supply} · Усталость: ${army.fatigue}<br>
    Скорость: ${typeof calcArmySpeed === 'function' ? calcArmySpeed(army).toFixed(1) : '?'} рег/ход
  `, { direction: 'top', offset: [0, -5] });

  m.addTo(armyMarkersLayer);
  _armyMarkers[army.id] = m;
}

// ── Линия маршрута ────────────────────────────────────────────────────

function _renderMovementLine(army) {
  const curCenter = _regionCenter(army.position);
  if (!curCenter) return;

  const color = _nationColor(army.nation);
  const pts   = [curCenter];

  for (const r of army.path) {
    const c = _regionCenter(r);
    if (c) pts.push(c);
  }
  if (pts.length < 2) return;

  // Пунктирная линия всего маршрута
  const line = L.polyline(pts, {
    color, weight: 2, opacity: 0.75,
    dashArray: '7 5',
  }).addTo(armyPathsLayer);

  // Призрак — позиция через 1 ход
  const speed       = typeof calcArmySpeed === 'function' ? calcArmySpeed(army) : 1;
  let   turnsLeft   = Math.max(1, Math.floor(speed));
  let   ghostRegion = army.position;
  const tempPath    = [...army.path];

  while (turnsLeft > 0 && tempPath.length > 0) {
    ghostRegion = tempPath.shift();
    turnsLeft--;
  }

  if (ghostRegion !== army.position) {
    const gc = _regionCenter(ghostRegion);
    if (gc) {
      const gIcon = L.divIcon({
        html: `<div class="army-ghost" style="border-color:${color};background:${color}33">
                 <span>+1</span>
               </div>`,
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      });
      const ghost = L.marker(gc, { icon: gIcon, interactive: false, zIndexOffset: 900 })
        .addTo(armyPathsLayer);
      _armyPaths[army.id] = { line, ghost };
    }
  }
}

// ── Индикатор осады ───────────────────────────────────────────────────

function _renderSiegeIndicator(siege) {
  const center = _regionCenter(siege.region_id);
  if (!center) return;

  const pct   = Math.round(siege.progress);
  const color = _nationColor(siege.attacker_nation);
  // Сдвигаем вниз чтобы не перекрывать маркер армии
  const pos   = [center[0] - 0.25, center[1]];

  const html = `
    <div class="siege-indicator" title="${siege.region_name}: осада ${pct}%">
      <span>🏰</span>
      <div class="siege-bar">
        <div class="siege-bar__fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="siege-pct">${pct}%</span>
    </div>`;

  const icon = L.divIcon({ html, className: '', iconSize: [68, 22], iconAnchor: [34, 0] });
  const m    = L.marker(pos, { icon, zIndexOffset: 850 }).addTo(siegeMarkersLayer);
  _siegeIcons[siege.id] = m;
}

// ── Выбор армии и панель ──────────────────────────────────────────────

function selectArmy(armyId) {
  _selectedArmyId = armyId;

  Object.entries(_armyMarkers).forEach(([id, m]) => {
    const el = m.getElement();
    if (!el) return;
    el.querySelector('.army-marker')?.classList.toggle('army-marker--selected', id === armyId);
  });

  _renderArmyPanel(armyId);
  renderAllArmies(); // обновить подсветку
}

function closeArmyPanel() {
  _selectedArmyId    = null;
  _activeMoveHandler = null;
  const panel = document.getElementById('army-panel');
  if (panel) panel.style.display = 'none';
  if (leafletMap) leafletMap.getContainer().classList.remove('map--move-mode');
  renderAllArmies();
}

// ── Панель армии ──────────────────────────────────────────────────────

function _renderArmyPanel(armyId) {
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army) return;

  let panel = document.getElementById('army-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'army-panel';
    document.getElementById('map-container')?.appendChild(panel);
  }

  const nation    = GAME_STATE.nations[army.nation];
  const cmd       = typeof getArmyCommander === 'function' ? getArmyCommander(army) : null;
  const isPlayer  = army.nation === GAME_STATE.player_nation;
  const speed     = typeof calcArmySpeed === 'function' ? calcArmySpeed(army).toFixed(2) : '?';
  const isNaval   = army.type === 'naval';

  const unitsHtml = isNaval
    ? Object.entries(army.ships ?? {}).filter(([,n]) => n > 0)
        .map(([t, n]) => `<div>⛵ ${_shipLabel(t)}: <b>${n}</b></div>`).join('')
    : `
      ${army.units.infantry    ? `<div>🗡 Пехота: <b>${army.units.infantry.toLocaleString()}</b></div>` : ''}
      ${army.units.cavalry     ? `<div>🐴 Конница: <b>${army.units.cavalry.toLocaleString()}</b></div>` : ''}
      ${army.units.mercenaries ? `<div>💰 Наёмники: <b>${army.units.mercenaries.toLocaleString()}</b></div>` : ''}
      ${army.units.artillery   ? `<div>🪨 Осадные орудия: <b>${army.units.artillery.toLocaleString()}</b></div>` : ''}`;

  const siegeInfo = army.siege_id ? (() => {
    const s = (GAME_STATE.sieges ?? []).find(sg => sg.id === army.siege_id);
    return s ? `<div class="army-siege-info">
      🏰 Осада ${s.region_name}: <b>${Math.round(s.progress)}%</b>
      ${s.storm_possible ? `<button class="army-btn army-btn--danger" onclick="stormAssault('${army.id}','${s.id}');renderAllArmies();">⚔️ Штурм</button>` : ''}
      <button class="army-btn" onclick="liftSiege('${army.id}');renderAllArmies();">🏃 Снять</button>
    </div>` : '';
  })() : '';

  const fmtLabels = { standard: 'Стандартный', aggressive: 'Агрессивный', defensive: 'Оборонительный', flanking: 'Фланговый' };

  // Оценка силы
  const strength = typeof calcArmyCombatStrength === 'function'
    ? Math.round(calcArmyCombatStrength(army, 'plains', false))
    : '?';

  panel.innerHTML = `
    <div class="army-panel-inner">
      <div class="army-panel-header">
        <span>${isNaval ? '⛵' : '🛡'} <b>${army.name}</b></span>
        <span class="army-nation-name">${nation?.name ?? army.nation}</span>
        <button class="army-panel-close" onclick="closeArmyPanel()">✕</button>
      </div>

      <div class="army-panel-stats">
        ${_statBar('Мораль',      army.morale,     '#4caf50', '#f44336')}
        ${_statBar('Дисциплина',  army.discipline, '#2196f3', '#2196f3')}
        ${_statBar('Снабжение',   army.supply,     '#ff9800', '#f44336')}
        ${_statBar('Усталость',   army.fatigue,    '#9c27b0', '#9c27b0', true)}
      </div>
      ${(() => {
        const cap  = army._supply_capacity ?? 0;
        const load = army._supply_region_load ?? 0;
        const over = army._supply_overload ?? 0;
        if (!cap && !load) return '';
        const pct  = cap > 0 ? Math.min(100, Math.round((load / cap) * 100)) : 100;
        const color = over > 1.2 ? '#f44336' : over > 0.8 ? '#ff9800' : '#4caf50';
        const overText = over > 1.0 ? `<span class="army-cap-over">▲ Перегрузка ${Math.round(over * 100)}%</span>` : '';
        return `<div class="army-cap-row">
          <span class="army-cap-label">Ёмкость региона</span>
          <div class="army-cap-bar-wrap">
            <div class="army-cap-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="army-cap-nums">${load.toLocaleString()} / ${cap.toLocaleString()}</span>
          ${overText}
        </div>`;
      })()}

      <div class="army-panel-units">${unitsHtml}</div>

      <div class="army-panel-meta">
        ⚡ Скорость: <b>${speed}</b> рег/ход &nbsp;·&nbsp;
        ⚔ Сила: <b>${strength}</b> &nbsp;·&nbsp;
        🏆 ${army.battles_won}W / ${army.battles_lost}L
      </div>

      ${cmd ? `<div class="army-panel-cmd">
        👤 <b>${cmd.name}</b> — тактика: ${cmd.skills?.tactics ?? cmd.skills?.military ?? 0},
        логистика: ${cmd.skills?.logistics ?? 0}, осада: ${cmd.skills?.siege ?? 0}
      </div>` : '<div class="army-panel-cmd">⚠️ Нет командующего</div>'}

      ${siegeInfo}

      <div class="army-panel-footer">
        Строй: <b>${fmtLabels[army.formation] ?? army.formation}</b>
        &nbsp;·&nbsp; Победы в боях: ${army.battles_won}
      </div>

      ${isPlayer ? (() => {
        // Марш доступен только если командует правитель лично (или нет командира)
        const npcCmd = army.commander_id && army.commander_id !== 'ruler';
        const campaignOrder = npcCmd
          ? (GAME_STATE.orders ?? []).find(o => o.army_id === army.id && o.status === 'active')
          : null;
        const marchBtn = npcCmd && campaignOrder
          ? `<div class="army-panel-npc-cmd">
               ⚔️ Командует <b>${campaignOrder.assigned_char_name}</b><br>
               <small style="color:var(--text-dim)">Маршрут задаёт командующий. Правитель не вмешивается.</small>
             </div>`
          : `<button class="army-btn" onclick="enterMoveMode('${army.id}')">🗺 Марш</button>`;
        return `<div class="army-panel-actions">
          ${marchBtn}
          <button class="army-btn" onclick="showFormationPicker('${army.id}')">⚔ Строй</button>
          <button class="army-btn army-btn--secondary" onclick="disbandArmyUI('${army.id}')">❌ Распустить</button>
        </div>`;
      })() : ''}
    </div>`;

  panel.style.display = 'block';
}

// ── Режим движения ────────────────────────────────────────────────────

function enterMoveMode(armyId) {
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army || army.nation !== GAME_STATE.player_nation) return;

  if (leafletMap) leafletMap.getContainer().classList.add('map--move-mode');

  if (typeof addEventLog === 'function')
    addEventLog(`🗺 ${army.name}: выберите регион-цель на карте.`, 'info');

  _activeMoveHandler = (regionId) => {
    _activeMoveHandler = null;
    if (leafletMap) leafletMap.getContainer().classList.remove('map--move-mode');

    if (!regionId || regionId === army.position) return;

    if (typeof orderArmyMove === 'function') {
      const path = orderArmyMove(armyId, regionId);
      if (path === 'sieging') {
        if (typeof addEventLog === 'function')
          addEventLog(`⚔️ ${army.name} ведёт осаду — нельзя двигаться.`, 'warning');
      } else if (path && path.length >= 2) {
        const rData = GAME_STATE.regions?.[regionId] ?? MAP_REGIONS?.[regionId];
        const turns = typeof calcArmySpeed === 'function'
          ? Math.ceil((path.length - 1) / calcArmySpeed(army))
          : (path.length - 1);
        if (typeof addEventLog === 'function')
          addEventLog(
            `🗺 ${army.name} → ${rData?.name ?? regionId}. `
            + `Маршрут: ${path.length - 1} рег. (~${turns} ход.)`,
            'info'
          );
        renderAllArmies();
        _renderArmyPanel(armyId);
      } else {
        const fromData = GAME_STATE.regions?.[army.position] ?? MAP_REGIONS?.[army.position];
        const hasConns = fromData?.connections?.length > 0;
        if (typeof addEventLog === 'function')
          addEventLog(
            `❌ Нет пути до ${regionId}.`
            + (!hasConns ? ` (позиция армии ${army.position} не имеет связей — перезапустите игру)` : ''),
            'warning'
          );
      }
    }
  };
}

/**
 * Вызывается из onRegionClick (map.js) при активном режиме движения.
 * @returns {boolean} true если событие обработано
 */
function handleRegionClickForArmy(regionId) {
  if (!_activeMoveHandler) return false;
  const fn = _activeMoveHandler;
  _activeMoveHandler = null;
  fn(regionId);
  return true;
}

// ── Диалоги ───────────────────────────────────────────────────────────

function showFormationPicker(armyId) {
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army) return;

  const options = [
    ['standard',   'Стандартный (×1.0 атк, ×1.0 защ)'],
    ['aggressive', 'Агрессивный (×1.25 атк, ×0.75 защ)'],
    ['defensive',  'Оборонительный (×0.80 атк, ×1.30 защ)'],
    ['flanking',   'Фланговый (×1.10 атк, кавалерия +15%)'],
  ];

  const choice = window.prompt(
    `Выберите строй для ${army.name}:\n\n`
    + options.map(([, l], i) => `${i + 1}. ${l}`).join('\n')
    + `\n\nТекущий: ${army.formation}`,
    '1'
  );
  const idx = parseInt(choice) - 1;
  if (idx >= 0 && idx < options.length) {
    army.formation = options[idx][0];
    if (typeof addEventLog === 'function')
      addEventLog(`⚔ ${army.name}: строй → ${options[idx][1].split(' ')[0]}.`, 'info');
    _renderArmyPanel(armyId);
  }
}

function disbandArmyUI(armyId) {
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army || army.nation !== GAME_STATE.player_nation) return;
  if (!confirm(`Распустить ${army.name}? Войска вернутся в резерв.`)) return;

  const nat = GAME_STATE.nations[army.nation]?.military;
  if (nat) {
    nat.infantry    = (nat.infantry    ?? 0) + (army.units.infantry    ?? 0);
    nat.cavalry     = (nat.cavalry     ?? 0) + (army.units.cavalry     ?? 0);
    nat.mercenaries = (nat.mercenaries ?? 0) + (army.units.mercenaries ?? 0);
  }

  army.state = 'disbanded';
  if (army.siege_id) liftSiege(armyId);

  closeArmyPanel();
  renderAllArmies();
  if (typeof addEventLog === 'function')
    addEventLog(`❌ ${army.name} распущена.`, 'info');
}

// ── Форма сборки армии ────────────────────────────────────────────────

/**
 * Показать диалог сборки новой армии из резервов нации.
 * @param {string} regionId - исходный регион
 */
function showAssembleArmyDialog(regionId) {
  const nat    = GAME_STATE.nations[GAME_STATE.player_nation];
  const mil    = nat?.military;
  if (!mil) return;

  const inf  = mil.infantry    ?? 0;
  const cav  = mil.cavalry     ?? 0;
  const merc = mil.mercenaries ?? 0;
  const art  = mil.artillery   ?? 0;
  const ship = mil.ships       ?? 0;

  const region = GAME_STATE.regions?.[regionId] ?? MAP_REGIONS?.[regionId];
  if (!region) return;

  let panel = document.getElementById('assemble-army-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'assemble-army-panel';
    document.getElementById('map-container')?.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="assemble-panel">
      <div class="assemble-panel-header">
        ⚔️ Собрать армию в ${region.name ?? regionId}
        <button onclick="document.getElementById('assemble-army-panel').style.display='none'">✕</button>
      </div>

      <div class="assemble-form">
        <label>🗡 Пехота (доступно: ${inf})</label>
        <input type="number" id="asm-inf" min="0" max="${inf}" value="0">

        <label>🐴 Конница (доступно: ${cav})</label>
        <input type="number" id="asm-cav" min="0" max="${cav}" value="0">

        <label>💰 Наёмники (доступно: ${merc})</label>
        <input type="number" id="asm-merc" min="0" max="${merc}" value="0">

        ${art > 0 ? `<label>🪨 Осадные орудия (доступно: ${art})</label>
        <input type="number" id="asm-art" min="0" max="${art}" value="0">` : ''}

        ${ship > 0 ? `<label>⛵ Флот (доступно: ${ship})</label>
        <input type="number" id="asm-ship" min="0" max="${ship}" value="0">` : ''}

        <label>📋 Название армии</label>
        <input type="text" id="asm-name" placeholder="Армия ${nat?.name ?? ''}">
      </div>

      <div class="assemble-actions">
        <button class="army-btn" onclick="_submitAssembleArmy('${regionId}')">✅ Собрать</button>
        <button class="army-btn army-btn--secondary" onclick="document.getElementById('assemble-army-panel').style.display='none'">Отмена</button>
      </div>
    </div>`;

  panel.style.display = 'block';
}

function _submitAssembleArmy(regionId) {
  const inf  = parseInt(document.getElementById('asm-inf')?.value  ?? 0);
  const cav  = parseInt(document.getElementById('asm-cav')?.value  ?? 0);
  const merc = parseInt(document.getElementById('asm-merc')?.value ?? 0);
  const art  = parseInt(document.getElementById('asm-art')?.value  ?? 0);
  const ship = parseInt(document.getElementById('asm-ship')?.value ?? 0);
  const name = document.getElementById('asm-name')?.value?.trim() || null;

  const total = inf + cav + merc + art + ship;
  if (total <= 0) {
    alert('Укажите хотя бы одну единицу войска!');
    return;
  }

  const nat = GAME_STATE.nations[GAME_STATE.player_nation]?.military;
  if (!nat) return;

  // Проверяем доступность
  const chk = (need, have) => { if (need > have) { alert(`Недостаточно войск!`); return false; } return true; };
  if (!chk(inf, nat.infantry ?? 0))    return;
  if (!chk(cav, nat.cavalry  ?? 0))    return;
  if (!chk(merc, nat.mercenaries ?? 0)) return;
  if (!chk(art, nat.artillery ?? 0))   return;
  if (!chk(ship, nat.ships ?? 0))      return;

  // Снимаем из резерва
  nat.infantry    = (nat.infantry    ?? 0) - inf;
  nat.cavalry     = (nat.cavalry     ?? 0) - cav;
  nat.mercenaries = (nat.mercenaries ?? 0) - merc;
  nat.artillery   = (nat.artillery   ?? 0) - art;
  nat.ships       = (nat.ships       ?? 0) - ship;

  const isNaval = ship > 0 && inf === 0 && cav === 0;
  const army = typeof createArmy === 'function'
    ? createArmy(GAME_STATE.player_nation, regionId,
        { infantry: inf, cavalry: cav, mercenaries: merc, artillery: art,
          triremes: isNaval ? ship : 0 },
        { name: name || undefined, type: isNaval ? 'naval' : 'land' })
    : null;

  document.getElementById('assemble-army-panel').style.display = 'none';

  if (army) {
    if (typeof addEventLog === 'function')
      addEventLog(`⚔️ Армия "${army.name}" собрана в ${GAME_STATE.regions?.[regionId]?.name ?? regionId}.`, 'military');
    renderAllArmies();
    selectArmy(army.id);
  }
}

// ── Утилиты ───────────────────────────────────────────────────────────

function _regionCenter(regionId) {
  const mr = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[regionId] : null;
  if (mr?.center) return mr.center;
  const gr = GAME_STATE.regions?.[regionId];
  if (gr?.center) return gr.center;
  return null;
}

function _nationColor(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  return n?.color ?? n?.map_color ?? n?.flag_color ?? '#888';
}

function _miniBar(value, colorHigh, colorLow) {
  const pct   = Math.max(0, Math.min(100, value ?? 0));
  const color = pct > 50 ? colorHigh : colorLow;
  return `<div class="mini-bar"><div style="width:${pct}%;height:100%;background:${color};border-radius:1px"></div></div>`;
}

function _statBar(label, value, colorHigh, colorLow, invert = false) {
  const pct    = Math.max(0, Math.min(100, value ?? 0));
  const good   = invert ? pct < 40 : pct > 50;
  const color  = good ? colorHigh : colorLow;
  return `<div class="army-stat-row">
    <span class="army-stat-label">${label}</span>
    <div class="army-stat-bar">
      <div style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="army-stat-val">${Math.round(value ?? 0)}</span>
  </div>`;
}

function _shipLabel(type) {
  return { triremes: 'Триремы', quinqueremes: 'Квинкеремы', light_ships: 'Лёгкие' }[type] ?? type;
}
