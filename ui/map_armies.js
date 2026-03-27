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

  // Маршрутная линия: яркая с обводкой
  const isPlayer = army.nation === GAME_STATE.player_nation;
  const lineColor = isPlayer ? '#FFD700' : color;
  // Тёмная обводка для читаемости
  L.polyline(pts, { color: 'rgba(0,0,0,0.45)', weight: 5, opacity: 0.6 }).addTo(armyPathsLayer);
  const line = L.polyline(pts, {
    color: lineColor, weight: 3, opacity: 0.9,
    dashArray: '10 6',
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

      ${(() => {
        if (!cmd) return `<div class="army-panel-cmd army-panel-cmd--empty">
          ⚠️ Нет командующего
          ${isPlayer ? `<button class="army-btn army-btn--assign" onclick="showCommanderPicker('${army.id}')">👑 Назначить</button>` : ''}
        </div>`;
        const lvl    = typeof getCommanderLevel === 'function' ? getCommanderLevel(cmd) : 0;
        const stars  = '★'.repeat(lvl) + '☆'.repeat(5 - lvl);
        const tactic = cmd.skills?.tactics ?? cmd.skills?.military ?? 0;
        const logist = cmd.skills?.logistics ?? 0;
        const siege  = cmd.skills?.siege ?? 0;
        const xp     = cmd.commander_xp ?? 0;
        const skills = cmd.commander_skills ?? [];
        const skillDefs = typeof COMMANDER_SKILLS_DEF !== 'undefined' ? COMMANDER_SKILLS_DEF : {};
        const skillsHtml = skills.map(s => {
          const d = skillDefs[s];
          return d ? `<span class="cmd-skill-badge" title="${d.desc}">${d.icon} ${d.name}</span>` : '';
        }).join('');
        return `<div class="army-panel-cmd">
          <div class="cmd-row-top">
            <span class="cmd-name">👤 <b>${cmd.name}</b></span>
            <span class="cmd-stars" title="${xp} XP">${stars}</span>
            ${isPlayer ? `<button class="army-btn army-btn--assign" onclick="showCommanderPicker('${army.id}')">🔄</button>` : ''}
          </div>
          <div class="cmd-row-stats">Тактика: <b>${tactic}</b> · Логистика: <b>${logist}</b> · Осада: <b>${siege}</b></div>
          ${skillsHtml ? `<div class="cmd-skills-row">${skillsHtml}</div>` : ''}
        </div>`;
      })()}

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

  // Скрываем панель армии — нужно видеть карту
  const panel = document.getElementById('army-panel');
  if (panel) panel.style.display = 'none';

  if (leafletMap) leafletMap.getContainer().classList.add('map--move-mode');

  _showMoveBanner(army.name, armyId);

  _activeMoveHandler = (regionId) => {
    _activeMoveHandler = null;
    if (leafletMap) leafletMap.getContainer().classList.remove('map--move-mode');
    _hideMoveBanner();

    if (!regionId || regionId === army.position) {
      _renderArmyPanel(armyId);
      return;
    }

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
    _renderArmyPanel(armyId);
  };
}

function _showMoveBanner(armyName, armyId) {
  let banner = document.getElementById('move-mode-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'move-mode-banner';
    (document.getElementById('map-container') ?? document.body).appendChild(banner);
  }
  banner.innerHTML = `
    <div class="mmb-inner">
      <span class="mmb-pulse"></span>
      <span class="mmb-text">🗺 Выберите цель марша для <b>${armyName}</b></span>
      <button class="mmb-cancel" onclick="cancelMoveMode('${armyId}')">✕ Отмена</button>
    </div>`;
  banner.style.display = 'block';
}

function _hideMoveBanner() {
  const banner = document.getElementById('move-mode-banner');
  if (banner) banner.style.display = 'none';
}

function cancelMoveMode(armyId) {
  _activeMoveHandler = null;
  if (leafletMap) leafletMap.getContainer().classList.remove('map--move-mode');
  _hideMoveBanner();
  if (armyId) _renderArmyPanel(armyId);
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
  // Fallback: REGION_CENTROIDS (lat/lon от генератора центроидов)
  const rc = typeof REGION_CENTROIDS !== 'undefined' ? REGION_CENTROIDS[regionId] : null;
  if (rc?.lat != null && rc?.lon != null) return [rc.lat, rc.lon];
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

// ── Picker командующего ───────────────────────────────────────────────

const _HIRE_GENERAL_NAMES = [
  'Диокл','Сосипол','Эпимен','Архидам','Никий','Лисандр','Клеомен',
  'Феодот','Аминий','Главкий','Леонид','Евмен','Пердикка','Филипп',
];
const _HIRE_SUFFIXES = [
  'из Коринфа','Старший','Сиракузец','Наёмник','из Эпира','из Спарты',
];

function _generateHireGenerals(nationId) {
  const used = new Set();
  const result = [];
  const archetypes = [
    { label: 'Агрессивный', tBonus: 20, lBonus: -5, sBonus: 5,  traits: { ambition: 80, caution: 25 } },
    { label: 'Осторожный',  tBonus: -5, lBonus: 15, sBonus: 15, traits: { ambition: 40, caution: 80 } },
    { label: 'Сбалансированный', tBonus: 8, lBonus: 8, sBonus: 8, traits: { ambition: 60, caution: 55 } },
  ];
  for (let i = 0; i < 3; i++) {
    let name;
    do { name = _HIRE_GENERAL_NAMES[Math.floor(Math.random() * _HIRE_GENERAL_NAMES.length)]; }
    while (used.has(name));
    used.add(name);
    const arch = archetypes[i];
    const base = 25 + Math.floor(Math.random() * 30);
    result.push({
      id: `gen_hire_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
      name: `${name} ${_HIRE_SUFFIXES[Math.floor(Math.random() * _HIRE_SUFFIXES.length)]}`,
      role: 'general',
      alive: true,
      _is_hire: true,
      traits: arch.traits,
      skills: {
        military: base,
        tactics:  Math.max(0, base + arch.tBonus),
        logistics: Math.max(0, base + arch.lBonus),
        siege: Math.max(0, base + arch.sBonus),
      },
      commander_xp: 0,
      commander_skills: [],
      _archetype_label: arch.label,
    });
  }
  return result;
}

function _cmdCardHtml(char, armyId, isHire) {
  const lvl    = typeof getCommanderLevel === 'function' ? getCommanderLevel(char) : 0;
  const stars  = '★'.repeat(lvl) + '☆'.repeat(5 - lvl);
  const tactic = char.skills?.tactics  ?? char.skills?.military ?? 0;
  const logist = char.skills?.logistics ?? 0;
  const siege  = char.skills?.siege     ?? 0;
  const xp     = char.commander_xp ?? 0;
  const skills = char.commander_skills ?? [];
  const skillDefs = typeof COMMANDER_SKILLS_DEF !== 'undefined' ? COMMANDER_SKILLS_DEF : {};
  const skillsHtml = skills.map(s => {
    const d = skillDefs[s];
    return d ? `<span class="cmd-skill-badge" title="${d.desc}">${d.icon} ${d.name}</span>` : '';
  }).join('');
  const roleLabel = { general: 'Полководец', senator: 'Сенатор', advisor: 'Советник',
                      ruler: 'Правитель', priest: 'Жрец' }[char.role] ?? char.role ?? '';
  const archLabel = char._archetype_label ? `<span class="cmd-archetype">${char._archetype_label}</span>` : '';
  return `
    <div class="cmd-pick-card">
      <div class="cmd-pick-top">
        <div>
          <span class="cmd-pick-name">${char.name}</span>
          ${archLabel}
          <span class="cmd-pick-role">${roleLabel}</span>
        </div>
        <span class="cmd-pick-stars">${stars}</span>
      </div>
      <div class="cmd-pick-stats">
        ⚔️ Тактика: <b>${tactic}</b> &nbsp; 📦 Логистика: <b>${logist}</b> &nbsp; 🏰 Осада: <b>${siege}</b>
        ${xp > 0 ? `&nbsp; · &nbsp; XP: <b>${xp}</b>` : ''}
      </div>
      ${skillsHtml ? `<div class="cmd-skills-row">${skillsHtml}</div>` : ''}
      <button class="army-btn cmd-pick-assign-btn"
        onclick="assignCommanderFromPicker('${armyId}','${char.id}',${isHire})">
        ${isHire ? '⚔ Нанять и назначить' : '✔ Назначить'}
      </button>
    </div>`;
}

function showCommanderPicker(armyId) {
  closeCommanderPicker();
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army) return;

  const nation = GAME_STATE.nations[army.nation];
  const courtChars = (nation?.characters ?? []).filter(c => c.alive !== false);

  // Генерируем 3 нанимаемых генерала
  const hireGens = _generateHireGenerals(army.nation);

  const courtHtml = courtChars.length
    ? courtChars.map(c => _cmdCardHtml(c, armyId, false)).join('')
    : '<div class="cmd-pick-empty">Нет доступных персонажей при дворе</div>';

  const hireHtml = hireGens.map(c => _cmdCardHtml(c, armyId, true)).join('');

  const overlay = document.createElement('div');
  overlay.id = 'cmd-picker-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeCommanderPicker(); };
  overlay.innerHTML = `
    <div class="cmd-picker">
      <div class="cmd-picker-hdr">
        <span>👑 Назначить командующего</span>
        <button class="cmd-picker-close" onclick="closeCommanderPicker()">✕</button>
      </div>
      <div class="cmd-picker-body">
        <div class="cmd-picker-section-title">🏛 Двор / Советники</div>
        ${courtHtml}
        <div class="cmd-picker-section-title" style="margin-top:10px">⚔ Полководцы (наём)</div>
        ${hireHtml}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Сохраняем hire-генералов во временное хранилище чтобы они были доступны при назначении
  overlay._hireGens = hireGens;
}

function closeCommanderPicker() {
  document.getElementById('cmd-picker-overlay')?.remove();
}

function assignCommanderFromPicker(armyId, charId, isHire) {
  const army = typeof getArmy === 'function' ? getArmy(armyId) : null;
  if (!army) return;

  let char = null;
  const nation = GAME_STATE.nations[army.nation];

  if (isHire) {
    // Найти в временном хранилище picker-а
    const overlay = document.getElementById('cmd-picker-overlay');
    const hireGens = overlay?._hireGens ?? [];
    char = hireGens.find(c => c.id === charId);
    if (char) {
      // Добавляем в состав нации
      if (!nation.characters) nation.characters = [];
      // Убираем служебный флаг
      const { _is_hire, _archetype_label, ...cleanChar } = char;
      char = cleanChar;
      nation.characters.push(char);
    }
  } else {
    char = (nation?.characters ?? []).find(c => c.id === charId);
  }

  if (!char) return;
  army.commander_id = char.id;
  closeCommanderPicker();
  _renderArmyPanel(armyId);

  if (typeof addEventLog === 'function')
    addEventLog(`👑 ${char.name} назначен командующим армии «${army.name}».`, 'character');
}
