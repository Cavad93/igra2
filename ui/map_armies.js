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

// Шаг 47: state планировщика маршрута (hover preview)
let _routePreviewLine       = null; // L.Polyline — пунктир-предпросмотр маршрута
let _routePreviewOutline    = null; // L.Polyline — тёмная подложка для читаемости
let _routePreviewTooltipEl  = null; // DOM-элемент — плавающий тултип у курсора
let _routePreviewHoverRegId = null; // id региона, для которого сейчас показан превью
let _routePreviewMapMoveFn  = null; // привязка mousemove на карту (чтобы снять потом)

// Шаг 39: предыдущие координаты маркеров — для плавной анимации при движении
const _armyPrevCenters  = {};   // armyId → [lat, lon]
const _armyMoveAnims    = {};   // armyId → requestAnimationFrame id

// ── Инициализация ─────────────────────────────────────────────────────

function initArmyLayers() {
  if (!leafletMap || armyMarkersLayer) return;
  armyPathsLayer    = L.layerGroup().addTo(leafletMap);
  siegeMarkersLayer = L.layerGroup().addTo(leafletMap);
  armyMarkersLayer  = L.layerGroup().addTo(leafletMap); // поверх путей
  // Шаг 40: слой маркеров строительства (под маркерами армий)
  initBuildMarkersLayer();
}

// ══════════════════════════════════════════════════════════════════════
// Шаг 40 — Прогресс строительства на карте (Build Progress Markers)
// ══════════════════════════════════════════════════════════════════════

let buildMarkersLayer = null;
const buildMarkers = {};   // regionId → L.Marker

function initBuildMarkersLayer() {
  if (!leafletMap || buildMarkersLayer) return;
  buildMarkersLayer = L.layerGroup().addTo(leafletMap);
}

/**
 * Склонение слова "ход" по числу: 1 ход, 2 хода, 5 ходов.
 */
function _bpmTurnsWord(n) {
  const abs  = Math.abs(n);
  const n10  = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return 'ход';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'хода';
  return 'ходов';
}

/**
 * Выбирает активную запись строительства из очереди региона:
 * ту, у которой меньше всего turns_left (самая близкая к завершению).
 */
function _pickActiveBuildEntry(region) {
  const q = region && region.construction_queue;
  if (!q || !q.length) return null;
  let best = q[0];
  for (const e of q) {
    if ((e.turns_left ?? 0) < (best.turns_left ?? 0)) best = e;
  }
  return best;
}

/**
 * Создаёт L.divIcon маркера прогресса строительства.
 * Размер: 48×32 px, полоска 44×3 px золотого цвета.
 */
function createBuildProgressIcon(entry) {
  const total = Math.max(1, Number(entry.turns_total) || 1);
  const left  = Math.max(0, Number(entry.turns_left)  || 0);
  const pct   = Math.max(0, Math.min(100, Math.round((1 - left / total) * 100)));
  const turns = left;

  const bDef = (typeof BUILDINGS !== 'undefined') ? BUILDINGS[entry.building_id] : null;
  const icon = (bDef && bDef.icon) ? bDef.icon : '🏗';

  const html = `
    <div class="build-progress-marker" title="${bDef?.name ?? 'Строительство'}: ${pct}%">
      🏗
      <div class="bpm-bar">
        <div class="bpm-fill" style="width: ${pct}%"></div>
      </div>
      <span class="bpm-turns">${turns} ${_bpmTurnsWord(turns)}</span>
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize:   [48, 32],
    iconAnchor: [24, 16],
  });
}

/**
 * Полная перерисовка маркеров строительства на карте.
 * - Находит все регионы с активным construction_queue
 * - Удаляет старые маркеры, добавляет новые (словарь buildMarkers: regionId → marker)
 * - Регионы без очереди (завершённое строительство) — маркер удаляется
 *
 * Вызывается после каждого хода из renderAll() в engine/turn.js.
 */
function renderBuildMarkers() {
  if (!leafletMap) return;
  if (!buildMarkersLayer) initBuildMarkersLayer();

  const regions = (typeof GAME_STATE !== 'undefined' && GAME_STATE && GAME_STATE.regions) || {};
  const seen = new Set();

  for (const rid of Object.keys(regions)) {
    const region = regions[rid];
    const entry  = _pickActiveBuildEntry(region);
    if (!entry) continue;

    const center = _regionCenter(rid);
    if (!center) continue;

    seen.add(rid);

    // При обновлении — удаляем старый маркер этого региона, добавляем новый
    if (buildMarkers[rid]) {
      try { buildMarkersLayer.removeLayer(buildMarkers[rid]); } catch (_) {}
      delete buildMarkers[rid];
    }

    const icon = createBuildProgressIcon(entry);
    // Небольшое смещение к северу, чтобы не перекрывать имя региона/армии
    const pos  = [center[0] + 0.20, center[1]];
    const m    = L.marker(pos, { icon, zIndexOffset: 700, interactive: false });
    m._regionId = rid;
    m.addTo(buildMarkersLayer);
    buildMarkers[rid] = m;
  }

  // Завершённое строительство → маркер удаляется
  for (const rid of Object.keys(buildMarkers)) {
    if (!seen.has(rid)) {
      try { buildMarkersLayer.removeLayer(buildMarkers[rid]); } catch (_) {}
      delete buildMarkers[rid];
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// Шаг 39 — Анимированные SVG-маркеры армий
// ══════════════════════════════════════════════════════════════════════

/**
 * Формат числа войск для метки маркера: 4200 → "4.2k", 800 → "800".
 */
function formatArmySize(n) {
  n = Math.max(0, Math.round(Number(n) || 0));
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

/**
 * Определить доминирующий тип войск (для выбора иконки).
 * @returns {'naval'|'cavalry'|'archers'|'infantry'}
 */
function _dominantUnitType(army) {
  if (army?.type === 'naval') return 'naval';
  const u = army?.units ?? {};
  const inf  = (u.infantry    ?? 0) + (u.mercenaries ?? 0);
  const cav  = (u.cavalry     ?? 0);
  const arch = (u.archers     ?? 0);
  const art  = (u.artillery   ?? 0);
  const max = Math.max(inf, cav, arch, art);
  if (max <= 0)    return 'infantry';
  if (cav  === max) return 'cavalry';
  if (arch === max) return 'archers';
  return 'infantry';
}

/**
 * Инлайн SVG-пути для каждого типа войск (game-icons.net стиль, CC BY 3.0).
 * Сами пути — собственная упрощённая перерисовка.
 */
const _ARMY_TYPE_PATHS = {
  // Звезда — общий силуэт (оригинал из arma.md)
  star:     'M12 2L15 9H22L16.5 13.5L18.5 21L12 17L5.5 21L7.5 13.5L2 9H9Z',
  // Пехота: скрещенные мечи
  infantry: 'M4 4L11 11L8 14L5 14L5 17L7 19L7 16L10 16L13 13L20 20L19 21L12 14L9 17L7 19M14 4L20 4L20 10L17 13L14 10Z',
  // Конница: голова лошади
  cavalry:  'M19 3L15 4L13 6L10 5L7 7L7 10L9 12L9 15L8 16L8 19L10 19L10 17L12 15L14 15L14 18L16 18L16 15L18 13L18 9L20 7L20 4Z',
  // Лучники: пучок стрел
  archers:  'M2 12L8 9L8 11L16 11L16 9L22 12L16 15L16 13L8 13L8 15Z',
  // Флот: треугольный парус
  naval:    'M12 2L12 15L4 15L12 2M13 4L20 15L13 15L13 4M3 18Q6 20 9 18T15 18T21 18L20 20Q16 22 13 20T7 20L3 20Z',
};

/**
 * Шаг 39 — создать L.divIcon маркера армии с SVG-звездой цвета нации.
 * @param {object} army — объект армии из GAME_STATE.armies
 * @param {string} nationColor — HEX/RGB цвет нации
 * @param {object} [opts]
 * @param {boolean} [opts.selected] — выбрана ли армия (активирует пульс)
 * @param {boolean} [opts.isPlayer] — принадлежит игроку (золотая обводка)
 */
function createArmyIcon(army, nationColor, opts = {}) {
  const isNaval = army?.type === 'naval';
  const units   = army?.units ?? {};
  const total   = isNaval
    ? Object.values(army?.ships ?? {}).reduce((s, n) => s + (Number(n) || 0), 0)
    : (units.infantry ?? 0) + (units.cavalry ?? 0)
      + (units.mercenaries ?? 0) + (units.artillery ?? 0) + (units.archers ?? 0);

  // Размер зависит от силы (как в arma.md Шаг 39)
  const size = total > 5000 ? 36 : total > 1000 ? 30 : 24;

  const kind      = _dominantUnitType(army);
  const glyphPath = _ARMY_TYPE_PATHS[kind] ?? _ARMY_TYPE_PATHS.infantry;
  const starPath  = _ARMY_TYPE_PATHS.star;

  const selCls    = opts.selected ? ' army-selected' : '';
  const playerCls = opts.isPlayer ? ' army-marker--player' : '';

  const html = `
    <div class="army-marker${selCls}${playerCls}"
         style="--nc: ${nationColor}; width:${size}px; height:${size}px">
      <svg class="army-marker__svg" viewBox="0 0 24 24" width="${size}" height="${size}"
           fill="${nationColor}" stroke="rgba(0,0,0,0.6)" stroke-width="0.6">
        <path class="army-marker__star" d="${starPath}"/>
        <path class="army-marker__glyph" d="${glyphPath}"
              fill="#ffffff" stroke="rgba(0,0,0,0.8)" stroke-width="0.5"
              transform="translate(6 6) scale(0.5)"/>
      </svg>
      <span class="army-count">${formatArmySize(total)}</span>
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize:   [size, size + 14],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Шаг 39 — плавно перемещает маркер от одной точки к другой.
 * Fallback-реализация для случая, когда leafletMap.motion (плагин) недоступен.
 * Используется интерполяция через requestAnimationFrame.
 */
function smoothMoveArmyMarker(marker, fromLatLng, toLatLng, duration = 650) {
  if (!marker || !fromLatLng || !toLatLng) return;
  // Если доступен плагин Leaflet.Motion — используем его
  if (typeof L !== 'undefined' && L.motion && typeof marker.motion === 'function') {
    try {
      marker.motion([fromLatLng, toLatLng], { duration });
      return;
    } catch (_) { /* fallback */ }
  }

  const [fLat, fLng] = fromLatLng;
  const [tLat, tLng] = toLatLng;
  if (Math.abs(fLat - tLat) < 1e-6 && Math.abs(fLng - tLng) < 1e-6) {
    marker.setLatLng(toLatLng);
    return;
  }

  const armyId = marker._armyId;
  if (armyId && _armyMoveAnims[armyId]) {
    cancelAnimationFrame(_armyMoveAnims[armyId]);
    delete _armyMoveAnims[armyId];
  }

  const start = performance.now();
  marker.setLatLng(fromLatLng);
  const step = (now) => {
    const t    = Math.min(1, (now - start) / duration);
    // ease-in-out cubic
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    marker.setLatLng([
      fLat + (tLat - fLat) * ease,
      fLng + (tLng - fLng) * ease,
    ]);
    if (t < 1) {
      _armyMoveAnims[armyId] = requestAnimationFrame(step);
    } else if (armyId) {
      delete _armyMoveAnims[armyId];
    }
  };
  _armyMoveAnims[armyId] = requestAnimationFrame(step);
}

// ── Полная перерисовка ────────────────────────────────────────────────

function renderAllArmies() {
  if (!leafletMap) return;
  if (!armyMarkersLayer) initArmyLayers();

  // Шаг 39: сохраним предыдущие центры для плавной анимации при перемещении
  Object.entries(_armyMarkers).forEach(([id, m]) => {
    try {
      const ll = m.getLatLng?.();
      if (ll) _armyPrevCenters[id] = [ll.lat, ll.lng];
    } catch (_) {}
  });

  armyMarkersLayer.clearLayers();
  armyPathsLayer.clearLayers();
  siegeMarkersLayer.clearLayers();

  Object.keys(_armyMarkers).forEach(k => delete _armyMarkers[k]);
  Object.keys(_armyPaths).forEach(k => delete _armyPaths[k]);
  Object.keys(_siegeIcons).forEach(k => delete _siegeIcons[k]);

  const seenArmyIds = new Set();
  for (const army of (GAME_STATE.armies ?? [])) {
    if (army.state === 'disbanded' || army.state === 'embarked') continue;
    seenArmyIds.add(army.id);
    _renderArmyMarker(army);
    if (army.path?.length > 0) _renderMovementLine(army);
  }

  // Очистим prevCenters для армий, которых больше нет
  Object.keys(_armyPrevCenters).forEach(id => {
    if (!seenArmyIds.has(id)) delete _armyPrevCenters[id];
  });

  for (const siege of (GAME_STATE.sieges ?? [])) {
    if (siege.status === 'active') _renderSiegeIndicator(siege);
  }

  // Шаг 40: прогресс строительства на карте
  try { renderBuildMarkers(); } catch (_) {}
}

// ── Маркер армии ──────────────────────────────────────────────────────

function _renderArmyMarker(army) {
  const center = _regionCenter(army.position);
  if (!center) return;

  const isPlayer = army.nation === GAME_STATE.player_nation;
  const color    = _nationColor(army.nation);
  const selected = _selectedArmyId === army.id;

  // Шаг 39: создание иконки через createArmyIcon (SVG-звезда + тип войск)
  const icon = createArmyIcon(army, color, { selected: selected, isPlayer: isPlayer });

  // Если предыдущая позиция отличается — появимся в ней и поплывём к новой
  const prev = _armyPrevCenters[army.id];
  const startCenter = (prev &&
    (Math.abs(prev[0] - center[0]) > 1e-6 || Math.abs(prev[1] - center[1]) > 1e-6))
    ? prev
    : center;

  const m = L.marker(startCenter, { icon, zIndexOffset: 1000 });
  m._armyId = army.id;

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

  // Шаг 39: если сменилась позиция — плавно анимируем маркер
  if (startCenter !== center) {
    smoothMoveArmyMarker(m, startCenter, center);
  }
  _armyPrevCenters[army.id] = center;
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
  const pos   = [center[0] - 0.28, center[1]];

  // SVG кольцо прогресса (радиус 9, circumference = 56.5)
  const R   = 9;
  const C   = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  const ringColor = pct < 40 ? '#4caf50' : pct < 75 ? '#ff9800' : '#f44336';

  const isPlayerInvolved = siege.attacker_nation === (GAME_STATE?.player_nation)
                        || siege.defender_nation === (GAME_STATE?.player_nation);
  const clickHint = isPlayerInvolved ? ' (нажмите для деталей)' : '';

  const html = `
    <div class="siege-indicator" title="${siege.region_name}: осада ${pct}%${clickHint}"
         style="cursor:${isPlayerInvolved ? 'pointer' : 'default'}">
      <div class="siege-ring-wrap">
        <svg class="siege-ring-svg" width="22" height="22" viewBox="0 0 22 22" style="transform:rotate(-90deg)">
          <circle cx="11" cy="11" r="${R}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <circle cx="11" cy="11" r="${R}" fill="none" stroke="${ringColor}" stroke-width="3"
                  stroke-linecap="round"
                  stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>
        </svg>
        <div class="siege-ring-icon">🏰</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:1px">
        <span style="font-size:9px;color:${ringColor};font-weight:700">${pct}%</span>
        <div class="siege-bar" style="width:42px">
          <div class="siege-bar__fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    </div>`;

  const icon = L.divIcon({ html, className: '', iconSize: [80, 28], iconAnchor: [40, 0] });
  const m    = L.marker(pos, { icon, zIndexOffset: 850 }).addTo(siegeMarkersLayer);

  if (isPlayerInvolved) {
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (typeof showSiegePanel === 'function') showSiegePanel(siege.id);
    });
  }

  _siegeIcons[siege.id] = m;
}

// ── Выбор армии и панель ──────────────────────────────────────────────

function selectArmy(armyId) {
  _selectedArmyId = armyId;

  Object.entries(_armyMarkers).forEach(([id, m]) => {
    const el = m.getElement();
    if (!el) return;
    // Шаг 39: класс .army-selected вместо старого .army-marker--selected
    el.querySelector('.army-marker')?.classList.toggle('army-selected', id === armyId);
  });

  _renderArmyPanel(armyId);
  renderAllArmies(); // обновить подсветку
}

function closeArmyPanel() {
  _selectedArmyId    = null;
  _activeMoveHandler = null;
  _clearRoutePreview();
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
      <button class="army-btn" onclick="showSiegePanel('${s.id}')">📊 Панель</button>
      ${s.storm_possible ? `<button class="army-btn army-btn--danger" onclick="showSiegePanel('${s.id}');setTimeout(()=>siegePanelStorm&&siegePanelStorm(),50)">⚔️ Штурм</button>` : ''}
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
        // Шаг 47: сохраняем полный маршрут (включая текущую позицию) в army.planned_route
        army.planned_route = [...path];
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
  _clearRoutePreview();
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
  // Шаг 47: убрать preview-линию и тултип перед подтверждением маршрута
  _clearRoutePreview();
  const fn = _activeMoveHandler;
  _activeMoveHandler = null;
  fn(regionId);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
// Шаг 47 — Планировщик маршрутов армии (hover preview)
// ══════════════════════════════════════════════════════════════════════

/**
 * Вызывается из onRegionHover (map.js) при наведении на полигон региона.
 * Если активна выбранная армия игрока — рисует пунктир-предпросмотр
 * маршрута и показывает тултип с количеством ходов.
 * Действует в режиме марша (_activeMoveHandler) — т.е. после клика "🗺 Марш".
 *
 * @param {string}  regionId
 * @param {boolean} entering — true при mouseover, false при mouseout
 * @param {*}       e        — Leaflet mouse event
 */
function handleRegionHoverForArmy(regionId, entering, e) {
  // Работаем только пока активен режим марша (армия выбрана для перемещения)
  if (!_activeMoveHandler || !_selectedArmyId) return;

  const army = (typeof getArmy === 'function') ? getArmy(_selectedArmyId) : null;
  if (!army) return;

  if (!entering) {
    // Убираем превью, если уходим именно с того региона, где рисовали маршрут
    if (_routePreviewHoverRegId === regionId) {
      _clearRoutePreview();
    }
    return;
  }

  // Не рисуем маршрут на регион, где армия уже стоит
  if (regionId === army.position) {
    _clearRoutePreview();
    return;
  }

  // Чтобы не пересчитывать при каждом mouseover одного и того же региона
  if (_routePreviewHoverRegId === regionId && _routePreviewLine) {
    _moveRoutePreviewTooltip(e);
    return;
  }

  _routePreviewHoverRegId = regionId;

  // BFS/Dijkstra по connections — findArmyPath уже существует в engine/armies.js
  const path = (typeof findArmyPath === 'function')
    ? findArmyPath(army.position, regionId, army.type, army.nation)
    : null;

  _clearRoutePreviewLineOnly();

  if (!path || path.length < 2) {
    _showRoutePreviewTooltip(e, `❌ Нет пути`);
    return;
  }

  const pts = path.map(r => _regionCenter(r)).filter(Boolean);
  if (pts.length < 2) {
    _showRoutePreviewTooltip(e, `❌ Нет координат`);
    return;
  }

  const color = _nationColor(army.nation);

  // Тёмная подложка — для читаемости поверх ярких полигонов
  _routePreviewOutline = L.polyline(pts, {
    color:     'rgba(0,0,0,0.55)',
    weight:    5,
    opacity:   0.55,
    interactive: false,
    renderer:  (typeof svgTradeRenderer !== 'undefined' && svgTradeRenderer) ? svgTradeRenderer : undefined,
  }).addTo(armyPathsLayer);

  // Основная пунктирная линия — с CSS-анимацией stroke-dashoffset
  // (параметры точно по arma.md Шаг 47)
  _routePreviewLine = L.polyline(pts, {
    color,
    weight:    2,
    dashArray: '8 6',
    opacity:   0.7,
    className: 'army-route-preview',
    interactive: false,
    renderer:  (typeof svgTradeRenderer !== 'undefined' && svgTradeRenderer) ? svgTradeRenderer : undefined,
  }).addTo(armyPathsLayer);

  // Оценка длительности в ходах (скорость армии может быть < 1)
  const speed = (typeof calcArmySpeed === 'function') ? calcArmySpeed(army) : 1;
  const hops  = path.length - 1;
  const turns = Math.max(1, Math.ceil(hops / Math.max(0.1, Number(speed) || 1)));

  // Названия: промежуточные регионы + целевой
  const nameOf = (rid) => {
    const d = (GAME_STATE && GAME_STATE.regions && GAME_STATE.regions[rid])
           || (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[rid] : null);
    return d?.name ?? rid;
  };
  const targetName = nameOf(regionId);
  const via = path.slice(1, -1).map(nameOf);
  let viaStr;
  if (via.length === 0) {
    viaStr = `→ ${targetName}`;
  } else if (via.length <= 2) {
    viaStr = `через ${via.join(' → ')} → ${targetName}`;
  } else {
    viaStr = `через ${via[0]} → … → ${via[via.length - 1]} → ${targetName}`;
  }

  const text = `📍 ${turns} ${_bpmTurnsWord(turns)} · ${viaStr}`;
  _showRoutePreviewTooltip(e, text);

  // Привязываем mousemove к карте — чтобы тултип ехал за курсором
  if (!_routePreviewMapMoveFn && leafletMap) {
    _routePreviewMapMoveFn = (ev) => _moveRoutePreviewTooltip(ev);
    try { leafletMap.on('mousemove', _routePreviewMapMoveFn); } catch (_) {}
  }
}

function _showRoutePreviewTooltip(e, text) {
  if (!_routePreviewTooltipEl) {
    _routePreviewTooltipEl = document.createElement('div');
    _routePreviewTooltipEl.id = 'army-route-preview-tooltip';
    document.body.appendChild(_routePreviewTooltipEl);
  }
  _routePreviewTooltipEl.textContent = text;
  _routePreviewTooltipEl.style.display = 'block';
  _moveRoutePreviewTooltip(e);
}

function _moveRoutePreviewTooltip(e) {
  if (!_routePreviewTooltipEl) return;
  const ev = e?.originalEvent || e;
  const x = (ev?.clientX != null) ? ev.clientX : (e?.containerPoint?.x ?? 0);
  const y = (ev?.clientY != null) ? ev.clientY : (e?.containerPoint?.y ?? 0);
  // Сдвиг вправо-вниз от курсора, чтобы не перекрывать его
  _routePreviewTooltipEl.style.left = (x + 16) + 'px';
  _routePreviewTooltipEl.style.top  = (y + 16) + 'px';
}

function _clearRoutePreviewLineOnly() {
  if (_routePreviewLine) {
    try { armyPathsLayer.removeLayer(_routePreviewLine); } catch (_) {}
    _routePreviewLine = null;
  }
  if (_routePreviewOutline) {
    try { armyPathsLayer.removeLayer(_routePreviewOutline); } catch (_) {}
    _routePreviewOutline = null;
  }
}

function _clearRoutePreview() {
  _clearRoutePreviewLineOnly();
  _routePreviewHoverRegId = null;
  if (_routePreviewTooltipEl) {
    _routePreviewTooltipEl.style.display = 'none';
  }
  if (_routePreviewMapMoveFn && leafletMap) {
    try { leafletMap.off('mousemove', _routePreviewMapMoveFn); } catch (_) {}
    _routePreviewMapMoveFn = null;
  }
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
