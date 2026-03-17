// Карта на Leaflet.js + тайлы CAWM (Ancient World Mapping Center)
// Тайлы: https://cawm.lib.uiowa.edu — CC BY 4.0
// Координаты в формате Leaflet [lat, lng]

let leafletMap = null;          // экземпляр L.Map
let regionLayers = {};          // { regionId: L.Polygon }
let selectedRegionId = null;
let awmcProvinceLayer = null;   // слой границ провинций из AWMC geodata
let canvasRenderer = null;      // Canvas-рендерер для производительности с 2800+ полигонами
let regionIdMarkers = [];       // маркеры с ID регионов (для отладки)
let showRegionIds = false;      // флаг показа ID регионов
let nationBorderLayer = null;   // слой толстых границ между нациями
let nationLabelMarkers = [];    // (устарело) оставлено для совместимости
let nationLabelData   = [];     // { nationId, name, lat, lng, regions, totalGeoArea }
let _labelTimerId     = null;   // debounce timer для обновления видимости
let _nationSvg        = null;   // SVG overlay для подписей наций (Imperator Rome стиль)
let _nationSvgGroup   = null;   // <g> элемент внутри SVG
const _labelCanvas    = document.createElement('canvas');
const _labelCtx       = _labelCanvas.getContext('2d');

// ──────────────────────────────────────────────────────────────
// POLYLABEL — визуальный центр полигона (mapbox/polylabel)
// Находит точку внутри полигона, максимально удалённую от границ
// ──────────────────────────────────────────────────────────────
function polylabel(polygon, precision) {
  precision = precision || 1.0;
  // Находим bbox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const outerRing = polygon[0];
  for (let i = 0; i < outerRing.length; i++) {
    const p = outerRing[i];
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize === 0) return [minX, minY];
  let h = cellSize / 2;
  // Приоритетная очередь (простая реализация)
  const cells = [];
  function Cell(x, y, h) {
    this.x = x; this.y = y; this.h = h;
    this.d = _pointToPolygonDist(x, y, polygon);
    this.max = this.d + this.h * Math.SQRT2;
  }
  for (let x = minX; x < maxX; x += cellSize)
    for (let y = minY; y < maxY; y += cellSize)
      cells.push(new Cell(x + h, y + h, h));
  cells.sort((a, b) => b.max - a.max);
  // Центроид как начальное приближение
  let bestCell = _getCentroidCell(polygon);
  let maxIter = 500;
  while (cells.length && maxIter-- > 0) {
    const cell = cells.shift();
    if (cell.d > bestCell.d) bestCell = cell;
    if (cell.max - bestCell.d <= precision) continue;
    h = cell.h / 2;
    const children = [
      new Cell(cell.x - h, cell.y - h, h), new Cell(cell.x + h, cell.y - h, h),
      new Cell(cell.x - h, cell.y + h, h), new Cell(cell.x + h, cell.y + h, h),
    ];
    for (const c of children) cells.push(c);
    cells.sort((a, b) => b.max - a.max);
  }
  return [bestCell.x, bestCell.y];
}
function _pointToPolygonDist(x, y, polygon) {
  let inside = false, minDistSq = Infinity;
  for (let k = 0; k < polygon.length; k++) {
    const ring = polygon[k];
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y !== b[1] > y) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]))
        inside = !inside;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      let t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
      const px = a[0] + t * dx - x, py = a[1] + t * dy - y;
      const dSq = px * px + py * py;
      if (dSq < minDistSq) minDistSq = dSq;
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}
function _getCentroidCell(polygon) {
  let area = 0, x = 0, y = 0;
  const ring = polygon[0];
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const a = ring[i], b = ring[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area === 0) return { x: ring[0][0], y: ring[0][1], h: 0, d: 0, max: 0 };
  const cx = x / area, cy = y / area;
  return { x: cx, y: cy, h: 0, d: _pointToPolygonDist(cx, cy, polygon), max: 0 };
}

// ──────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ──────────────────────────────────────────────────────────────

function initLeafletMap() {
  const container = document.getElementById('map-container');
  if (!container) return;

  // Canvas-рендерер: критично для производительности с 2800+ полигонами
  canvasRenderer = L.canvas({ padding: 0.5, tolerance: 4 });

  // Карта центрируется на Средиземноморье
  // Настройки зума/панорамирования в стиле Google Maps:
  // - zoomSnap: 0 — непрерывный (дробный) зум, плавное колесо
  // - zoomDelta: 0.25 — маленький шаг зума при каждом щелчке колеса
  // - wheelPxPerZoomLevel: 180 — больше пикселей scroll = плавнее
  // - wheelDebounceTime: 60 — быстрый отклик колеса
  // - inertia + inertiaDeceleration — инерция панорамирования
  // - bounceAtZoomLimits: false — не "пружинит" на min/maxZoom
  leafletMap = L.map('map-container', {
    center: [37.5, 18.0],
    zoom: 5,
    minZoom: 3,
    maxZoom: 10,
    zoomSnap: 0,                 // дробные уровни зума (плавный scroll)
    zoomDelta: 0.25,             // маленький шаг при клике кнопок +/-
    wheelPxPerZoomLevel: 180,    // больше scroll пикселей на 1 уровень = плавнее
    wheelDebounceTime: 60,       // быстрый отклик колеса мыши
    zoomAnimation: true,
    zoomAnimationThreshold: 4,
    fadeAnimation: true,
    markerZoomAnimation: true,
    inertia: true,               // инерция при панорамировании
    inertiaDeceleration: 2500,   // замедление инерции (меньше = дольше скользит)
    inertiaMaxSpeed: 1500,       // макс. скорость инерции
    bounceAtZoomLimits: false,   // не пружинить на пределах зума
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
    renderer: canvasRenderer,
    // Ограничение панорамирования — не уйти слишком далеко от Средиземноморья
    maxBounds: [[-10, -50], [72, 90]],
    maxBoundsViscosity: 0.7,     // мягкое "резиновое" ограничение
  });

  // Кнопки зума — помещаем в правый нижний угол
  // zoomDelta: 0.5 для кнопок (крупнее шаг чем у колеса)
  L.control.zoom({ position: 'bottomright', zoomDelta: 0.5, zoomSnap: 0 }).addTo(leafletMap);

  // Атрибуция
  L.control.attribution({
    position: 'bottomleft',
    prefix: false,
  }).addAttribution(
    '© <a href="https://cawm.lib.uiowa.edu/" target="_blank">CAWM</a> · CC BY 4.0'
  ).addTo(leafletMap);

  // Базовый слой — тайлы древнего мира CAWM
  addBaseTileLayer();

  // Регионы
  renderRegionPolygons();

  // Подписи морей
  renderSeaLabels();

  // Толстые границы между нациями
  renderNationBorders();

  // Названия наций на карте (динамические, зум-адаптивные)
  renderNationLabels();

  // Пересчёт подписей при изменении вида
  // move: пересчитываем позиции через RAF — один раз за кадр, без задержки.
  // latLngToContainerPoint всегда возвращает правильные координаты даже во время пана.
  let _panRafId = null;
  leafletMap.on('move', () => {
    if (_panRafId) cancelAnimationFrame(_panRafId);
    _panRafId = requestAnimationFrame(() => { _panRafId = null; _updateNationLabelVisibility(); });
  });
  leafletMap.on('moveend', scheduleNationLabelUpdate);
  // zoom: скрываем SVG во время анимации масштаба
  leafletMap.on('zoomstart', () => { if (_nationSvg) _nationSvg.style.opacity = '0'; });
  leafletMap.on('zoomend',   () => {
    scheduleNationLabelUpdate();
    setTimeout(() => { if (_nationSvg) _nationSvg.style.opacity = '1'; }, 90);
  });
  window.addEventListener('resize', scheduleNationLabelUpdate);

  // AWMC overlay отключён: границы провинций теперь из map.json
  // loadAWMCProvinceBoundaries();

  // Кнопка показа ID регионов (для ручной разметки)
  const idToggleControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control region-id-toggle-btn');
      btn.title = 'Показать/скрыть ID регионов';
      btn.textContent = 'ID';
      L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation);
      L.DomEvent.on(btn, 'click', () => {
        showRegionIds = !showRegionIds;
        btn.classList.toggle('active', showRegionIds);
        showRegionIds ? renderRegionIdLabels() : clearRegionIdLabels();
      });
      return btn;
    },
  });
  new idToggleControl().addTo(leafletMap);
}

// ──────────────────────────────────────────────────────────────
// ТАЙЛОВЫЙ СЛОЙ
// ──────────────────────────────────────────────────────────────

function addBaseTileLayer() {
  const cawmUrl = CONFIG.MAP_TILE_URL || 'https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png';

  const tileLayer = L.tileLayer(cawmUrl, {
    attribution: '© CAWM · CC BY 4.0',
    maxZoom: 10,
    maxNativeZoom: 8,            // тайлы существуют до 8, выше — масштабирование
    minZoom: 3,
    tileSize: 256,
    opacity: 1.0,
    crossOrigin: true,
    errorTileUrl: '',
    updateWhenZooming: false,    // не перерисовывать тайлы при анимации зума
    updateWhenIdle: true,        // обновлять после завершения зума
  });

  tileLayer.on('tileerror', () => {
    // При ошибке загрузки тайлов — тихо fallback
    console.warn('Тайлы CAWM недоступны. Проверьте подключение к интернету.');
  });

  tileLayer.addTo(leafletMap);

  // Тёмный полупрозрачный оверлей для игровой атмосферы
  // (подчёркивает цвета регионов, не мешает читабельности)
  L.tileLayer(cawmUrl, {
    attribution: '',
    maxZoom: 10,
    maxNativeZoom: 8,
    opacity: 0,
  });
}

// ──────────────────────────────────────────────────────────────
// РЕГИОНЫ
// ──────────────────────────────────────────────────────────────

// Типы регионов, не являющихся игровыми территориями
const NON_PLAYABLE_TYPES = new Set(['Ocean', 'Strait', 'Lake', 'Impassible']);

// Стили для не-игровых типов регионов
const NON_PLAYABLE_STYLES = {
  Ocean:      { color: 'none', weight: 0, fillColor: '#2a5a7c', fillOpacity: 0.18, interactive: false },
  Strait:     { color: 'none', weight: 0, fillColor: '#2a5a8c', fillOpacity: 0.22, interactive: false },
  Lake:       { color: 'rgba(70,120,190,0.3)', weight: 0.5, fillColor: '#4a8ab8', fillOpacity: 0.40, interactive: false },
  Impassible: { color: 'rgba(50,35,20,0.30)', weight: 0.5, fillColor: '#5a4e3a', fillOpacity: 0.50, interactive: false },
};

function renderRegionPolygons() {
  // Удаляем старые слои
  for (const layer of Object.values(regionLayers)) {
    if (leafletMap.hasLayer(layer)) leafletMap.removeLayer(layer);
  }
  regionLayers = {};

  // Сначала рисуем не-игровые (фон), потом игровые поверх
  const playable    = [];
  const nonPlayable = [];
  for (const entry of Object.entries(MAP_REGIONS)) {
    if (!entry[1].coords || entry[1].coords.length < 3) continue;
    (NON_PLAYABLE_TYPES.has(entry[1].mapType) ? nonPlayable : playable).push(entry);
  }

  // Не-игровые регионы — без сглаживания, без событий
  for (const [regionId, mapData] of nonPlayable) {
    const style = NON_PLAYABLE_STYLES[mapData.mapType] || NON_PLAYABLE_STYLES.Ocean;
    const polygon = L.polygon(mapData.coords, { ...style, renderer: canvasRenderer });
    polygon.addTo(leafletMap);
    regionLayers[regionId] = polygon;
  }

  // Игровые регионы — со сглаживанием и событиями
  for (const [regionId, mapData] of playable) {
    const gameRegion   = GAME_STATE.regions[regionId];
    const nationId     = gameRegion ? gameRegion.nation : mapData.nation;
    const nation       = GAME_STATE.nations[nationId];
    const color        = nation ? nation.color : '#A8A898';
    const isPlayerRegion = (nationId === GAME_STATE.player_nation);
    const isSelected   = (selectedRegionId === regionId);

    // Сглаживание только для небольших полигонов (Ocean уже отсеян выше)
    const coords = mapData.coords.length <= 60
      ? smoothChaikin(mapData.coords, 2)
      : mapData.coords;

    const polygon = L.polygon(coords, {
      ...buildPolygonStyle(color, isPlayerRegion, isSelected),
      renderer: canvasRenderer,
    });

    polygon.on('click',     () => onRegionClick(regionId));
    polygon.on('mouseover', (e) => onRegionHover(e, regionId, true,  color, isPlayerRegion));
    polygon.on('mouseout',  (e) => onRegionHover(e, regionId, false, color, isPlayerRegion));

    polygon.bindTooltip(buildTooltipContent(regionId, mapData, nationId), {
      className: 'region-tooltip',
      direction: 'top',
      offset:    [0, -4],
      opacity:   0.95,
    });

    polygon.addTo(leafletMap);
    regionLayers[regionId] = polygon;
  }
}

function buildPolygonStyle(color, isPlayerRegion, isSelected) {
  return {
    color:        isSelected ? '#FFD700' : 'rgba(70,50,25,0.45)',
    weight:       isSelected ? 3.0 : 1.0,
    fillColor:    color,
    fillOpacity:  isSelected ? 0.78 : 0.70,
    opacity:      1.0,
    dashArray:    null,
  };
}

function buildTooltipContent(regionId, mapData, nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gameRegion = GAME_STATE.regions[regionId];
  const nationName = nation ? nation.name : 'Независимые';
  const nationColor = nation ? nation.color : '#A8A898';
  const pop = gameRegion ? (gameRegion.population || 0).toLocaleString() : '?';

  return `
    <div class="rt-name">${mapData.name}</div>
    <div class="rt-nation" style="color:${nationColor}">${nationName}</div>
    <div class="rt-pop">👥 ${pop}</div>
  `;
}

// ──────────────────────────────────────────────────────────────
// ВЗАИМОДЕЙСТВИЕ
// ──────────────────────────────────────────────────────────────

function onRegionClick(regionId) {
  // Снимаем выделение с предыдущего
  if (selectedRegionId && regionLayers[selectedRegionId]) {
    const prev = GAME_STATE.regions[selectedRegionId];
    const prevNationId = prev ? prev.nation : MAP_REGIONS[selectedRegionId]?.nation;
    const prevNation = GAME_STATE.nations[prevNationId];
    const prevColor = prevNation ? prevNation.color : '#A8A898';
    const prevIsPlayer = (prevNationId === GAME_STATE.player_nation);
    regionLayers[selectedRegionId].setStyle(buildPolygonStyle(prevColor, prevIsPlayer, false));
  }

  if (selectedRegionId === regionId) {
    // Клик по уже выбранному — снимаем выбор
    selectedRegionId = null;
    closeRegionInfo();
    return;
  }

  selectedRegionId = regionId;

  // Выделяем новый регион
  const layer = regionLayers[regionId];
  if (layer) {
    const gameRegion = GAME_STATE.regions[regionId];
    const nationId = gameRegion ? gameRegion.nation : MAP_REGIONS[regionId]?.nation;
    const nation = GAME_STATE.nations[nationId];
    const color = nation ? nation.color : '#A8A898';
    layer.setStyle(buildPolygonStyle(color, nationId === GAME_STATE.player_nation, true));
    layer.bringToFront();
  }

  showRegionInfo(regionId);
}

function onRegionHover(e, regionId, entering, color, isPlayerRegion) {
  if (regionId === selectedRegionId) return;

  const layer = regionLayers[regionId];
  if (!layer) return;

  if (entering) {
    layer.setStyle({
      fillOpacity: 0.80,
      weight: isPlayerRegion ? 2.5 : 2.0,
      color: 'rgba(200,170,100,0.8)',
    });
    layer.bringToFront();
  } else {
    layer.setStyle(buildPolygonStyle(color, isPlayerRegion, false));
  }
}

// ──────────────────────────────────────────────────────────────
// ИНФО-ПАНЕЛЬ РЕГИОНА
// ──────────────────────────────────────────────────────────────

function showRegionInfo(regionId) {
  const panel = document.getElementById('region-info');
  if (!panel) return;

  const mapData = MAP_REGIONS[regionId];
  const gameData = GAME_STATE.regions[regionId];
  if (!mapData || !gameData) return;

  const nationId = gameData.nation;
  const nation = GAME_STATE.nations[nationId];
  const nationName  = nation ? nation.name  : 'Независимые';
  const nationColor = nation ? nation.color : '#A8A898';

  const productionLines = Object.entries(gameData.production || {}).map(([good, amount]) => {
    const g = GOODS[good];
    return `<span class="prod-item">${g ? g.icon : '📦'} ${g ? g.name : good}: ${Math.round(amount).toLocaleString()}</span>`;
  }).join('');

  const buildings = (gameData.buildings || []).map(b =>
    `<span class="building-tag">🏛 ${b.replace(/_/g, ' ')}</span>`
  ).join('');

  panel.innerHTML = `
    <div class="region-info-header" style="border-left: 4px solid ${nationColor}">
      <span class="region-info-name">${mapData.name}</span>
      <span class="region-info-nation" style="color:${nationColor}">${nationName}</span>
      <button class="region-info-close" onclick="closeRegionInfo()">✕</button>
    </div>
    <div class="region-info-body">
      <div class="region-info-desc">${mapData.description}</div>
      <div class="region-stats">
        <div class="region-stat">👥 Нас.: <strong>${(gameData.population || 0).toLocaleString()}</strong></div>
        <div class="region-stat">🌿 Плодородие: <strong>${Math.round((gameData.fertility || 0) * 100)}%</strong></div>
        <div class="region-stat">⚔️ Гарнизон: <strong>${(gameData.garrison || 0).toLocaleString()}</strong></div>
        <div class="region-stat">🏔 Тип: <strong>${getTerrainName(gameData.terrain)}</strong></div>
      </div>
      ${productionLines ? `<div class="region-production"><div class="section-label">Производство:</div>${productionLines}</div>` : ''}
      ${buildings ? `<div class="region-buildings"><div class="section-label">Постройки:</div>${buildings}</div>` : ''}
    </div>
  `;

  panel.classList.remove('hidden');
}

function closeRegionInfo() {
  const panel = document.getElementById('region-info');
  if (panel) panel.classList.add('hidden');

  if (selectedRegionId && regionLayers[selectedRegionId]) {
    const gameRegion = GAME_STATE.regions[selectedRegionId];
    const nationId = gameRegion ? gameRegion.nation : MAP_REGIONS[selectedRegionId]?.nation;
    const nation = GAME_STATE.nations[nationId];
    const color = nation ? nation.color : '#A8A898';
    regionLayers[selectedRegionId].setStyle(
      buildPolygonStyle(color, nationId === GAME_STATE.player_nation, false)
    );
  }
  selectedRegionId = null;
}

// ──────────────────────────────────────────────────────────────
// ПОДПИСИ МОРЕЙ
// ──────────────────────────────────────────────────────────────

function renderSeaLabels() {
  for (const label of SEA_LABELS) {
    const icon = L.divIcon({
      className: 'sea-label',
      html: `<div class="sea-label-text" style="font-size:${label.size || 11}px">${label.text}</div>`,
      iconAnchor: [50, 10],
      iconSize: [100, 24],
    });
    L.marker([label.lat, label.lng], { icon, interactive: false }).addTo(leafletMap);
  }
}

// ──────────────────────────────────────────────────────────────
// ГРАНИЦЫ МЕЖДУ НАЦИЯМИ
// ──────────────────────────────────────────────────────────────

function findSharedEdge(coords1, coords2) {
  const p = 3;
  const key = c => c[0].toFixed(p) + ',' + c[1].toFixed(p);
  const set1 = new Set(coords1.map(key));
  const segments = [];
  let cur = [];
  const n = coords2.length;
  for (let i = 0; i <= n; i++) {
    const c = coords2[i % n];
    if (set1.has(key(c))) {
      cur.push(c);
    } else {
      if (cur.length >= 2) segments.push([...cur]);
      cur = [];
    }
  }
  if (cur.length >= 2) segments.push(cur);
  return segments;
}

function renderNationBorders() {
  if (nationBorderLayer) {
    if (leafletMap.hasLayer(nationBorderLayer)) leafletMap.removeLayer(nationBorderLayer);
    nationBorderLayer = null;
  }
  const processed = new Set();
  const edges = [];
  for (const [regionId, mapData] of Object.entries(MAP_REGIONS)) {
    if (NON_PLAYABLE_TYPES.has(mapData.mapType) || !mapData.coords) continue;
    const gameRegion = GAME_STATE.regions[regionId];
    const nationA = gameRegion ? gameRegion.nation : mapData.nation;
    for (const connId of (mapData.connections || [])) {
      const pairKey = regionId < connId ? regionId + '|' + connId : connId + '|' + regionId;
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);
      const connData = MAP_REGIONS[connId];
      if (!connData || !connData.coords || NON_PLAYABLE_TYPES.has(connData.mapType)) continue;
      const connRegion = GAME_STATE.regions[connId];
      const nationB = connRegion ? connRegion.nation : connData.nation;
      if (nationA !== nationB) {
        for (const seg of findSharedEdge(mapData.coords, connData.coords)) {
          edges.push(seg);
        }
      }
    }
  }
  if (edges.length > 0) {
    nationBorderLayer = L.layerGroup();
    for (const seg of edges) {
      // Одна тонкая линия — как в Imperator Rome
      L.polyline(seg, {
        color: 'rgba(45, 30, 15, 0.55)',
        weight: 1.5,
        opacity: 1,
        interactive: false,
        lineCap: 'round',
        lineJoin: 'round',
        renderer: canvasRenderer,
      }).addTo(nationBorderLayer);
    }
    nationBorderLayer.addTo(leafletMap);
  }
}

// ──────────────────────────────────────────────────────────────
// ПОДПИСИ НАЗВАНИЙ НАЦИЙ — SVG overlay, Pax Historia / Imperator Rome стиль
// Текст повёрнут по форме территории (PCA), дублируется для островов
// ──────────────────────────────────────────────────────────────

function _pxPolyArea(pxPoly) {
  let area = 0;
  const n = pxPoly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pxPoly[i].x * pxPoly[j].y - pxPoly[j].x * pxPoly[i].y;
  }
  return Math.abs(area / 2);
}

function _pointInPolyPx(pt, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

// BFS-кластеризация: разделяет регионы нации на связные группы (остров/материк)
function _findRegionClusters(regionList) {
  const idSet = new Set(regionList.map(r => r.regionId));
  const byId  = {};
  for (const r of regionList) byId[r.regionId] = r;

  const adj = {};
  for (const r of regionList) {
    adj[r.regionId] = [];
    const mapData = MAP_REGIONS[r.regionId];
    if (!mapData || !mapData.connections) continue;
    for (const connId of mapData.connections) {
      if (idSet.has(connId)) adj[r.regionId].push(connId);
    }
  }

  const visited = new Set();
  const clusters = [];
  for (const r of regionList) {
    if (visited.has(r.regionId)) continue;
    const cluster = [];
    const queue = [r.regionId];
    visited.add(r.regionId);
    while (queue.length) {
      const id = queue.shift();
      cluster.push(byId[id]);
      for (const nbr of (adj[id] || [])) {
        if (!visited.has(nbr)) { visited.add(nbr); queue.push(nbr); }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

// PCA-угол: направление максимального «разброса» точек (в радианах)
function _pcaAnglePx(points) {
  const n = points.length;
  if (n < 3) return 0;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const p of points) {
    const dx = p.x - cx, dy = p.y - cy;
    cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
  }
  return 0.5 * Math.atan2(2 * cxy, cxx - cyy);
}

// Повёрнутый bbox вдоль угла angle
function _rotatedSpan(points, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= points.length; cy /= points.length;
  for (const p of points) {
    const dx = p.x - cx, dy = p.y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  return { width: maxU - minU, height: maxV - minV, cx, cy };
}

// Ширина суши через точку (cx,cy) вдоль направления angle.
// Возвращает длину сегмента суши, содержащего центр (или ближайшего).
function _landWidthThrough(cx, cy, angle, pxPolys) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const allSegments = [];

  for (const poly of pxPolys) {
    const crossings = [];
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = poly[j].x - cx, ay = poly[j].y - cy;
      const bx = poly[i].x - cx, by = poly[i].y - cy;
      const va = -ax * sin + ay * cos;
      const vb = -bx * sin + by * cos;
      if (va * vb >= 0) continue;
      const frac = va / (va - vb);
      const t = (ax + frac * (bx - ax)) * cos + (ay + frac * (by - ay)) * sin;
      crossings.push(t);
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let k = 0; k < crossings.length - 1; k += 2) {
      allSegments.push({ a: crossings[k], b: crossings[k + 1] });
    }
  }

  if (!allSegments.length) return 0;

  // Сливаем перекрывающиеся сегменты
  allSegments.sort((x, y) => x.a - y.a);
  const merged = [{ ...allSegments[0] }];
  for (let i = 1; i < allSegments.length; i++) {
    const last = merged[merged.length - 1];
    if (allSegments[i].a <= last.b + 1) {
      last.b = Math.max(last.b, allSegments[i].b);
    } else {
      merged.push({ ...allSegments[i] });
    }
  }

  // Сегмент, содержащий t=0 (центральную точку)
  for (const seg of merged) {
    if (seg.a <= 0 && seg.b >= 0) return seg.b - seg.a;
  }
  // Центр не на суше → ближайший сегмент
  let best = 0;
  for (const seg of merged) if (seg.b - seg.a > best) best = seg.b - seg.a;
  return best;
}

// Визуальный центр кластера через polylabel (на наибольшем регионе кластера)
function _clusterVisualCenter(cluster) {
  let bestCenter = null, largestArea = 0;
  for (const reg of cluster) {
    if (reg.geoArea > largestArea) {
      largestArea = reg.geoArea;
      try {
        const ring = reg.coords.map(c => [c[1], c[0]]);
        ring.push(ring[0]);
        const result = polylabel([ring], 0.005);
        bestCenter = [result[1], result[0]];
      } catch (e) {
        bestCenter = reg.center;
      }
    }
  }
  return bestCenter || cluster[0].center;
}

// Создаёт/пересоздаёт SVG overlay для подписей наций
function _ensureNationSvg() {
  const container = leafletMap.getContainer();
  if (_nationSvg && container.contains(_nationSvg)) return;

  if (_nationSvg) { try { _nationSvg.remove(); } catch (e) {} }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:601;overflow:visible;transition:opacity 0.25s ease;';

  svg.innerHTML = `
    <defs>
      <filter id="nlbl-shadow" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="1.0" dy="1.5" stdDeviation="1.0"
          flood-color="#2e1204" flood-opacity="0.85"/>
      </filter>
      <filter id="nlbl-shadow-sm" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="0.6" dy="1.0" stdDeviation="0.7"
          flood-color="#2e1204" flood-opacity="0.80"/>
      </filter>
    </defs>
    <g id="nlbl-g"></g>
  `;

  container.appendChild(svg);
  _nationSvg      = svg;
  _nationSvgGroup = svg.querySelector('#nlbl-g');
}


// Строит структуры данных: один элемент на кластер (связную территорию)
function renderNationLabels() {
  for (const d of nationLabelData) {
    if (d.marker && leafletMap.hasLayer(d.marker)) leafletMap.removeLayer(d.marker);
  }
  nationLabelData = [];

  // 1. Группируем регионы по нации
  const nations = {};
  for (const [regionId, mapData] of Object.entries(MAP_REGIONS)) {
    if (NON_PLAYABLE_TYPES.has(mapData.mapType) || !mapData.center || !mapData.coords) continue;
    const gr       = GAME_STATE.regions[regionId];
    const nationId = gr ? gr.nation : mapData.nation;
    if (!nationId || nationId === 'neutral' || nationId === 'ocean') continue;
    const nation = GAME_STATE.nations[nationId];
    if (!nation) continue;

    const coords = mapData.coords;
    let geoArea = 0;
    const nc = coords.length;
    for (let i = 0; i < nc; i++) {
      const j = (i + 1) % nc;
      geoArea += coords[i][0] * coords[j][1] - coords[j][0] * coords[i][1];
    }
    geoArea = Math.abs(geoArea / 2);

    if (!nations[nationId]) nations[nationId] = {
      name: (nation.name || nationId).toUpperCase(),
      regions: [],
    };
    nations[nationId].regions.push({ regionId, coords, center: mapData.center, geoArea });
  }

  // 2. Для каждой нации разбиваем на связные кластеры (остров/материк)
  for (const [nationId, nd] of Object.entries(nations)) {
    const clusters = _findRegionClusters(nd.regions);

    for (const cluster of clusters) {
      let clusterArea = 0;
      for (const r of cluster) clusterArea += r.geoArea;
      if (!clusterArea) continue;

      const center = _clusterVisualCenter(cluster);

      nationLabelData.push({
        nationId,
        name:         nd.name,
        lat:          center[0],
        lng:          center[1],
        regions:      cluster,
        totalGeoArea: clusterArea,
      });
    }
  }

  // Крупные кластеры первыми
  nationLabelData.sort((a, b) => b.totalGeoArea - a.totalGeoArea);

  _ensureNationSvg();
  _updateNationLabelVisibility();
}

// Пересчитывает подписи в SVG при каждом изменении зума/пана
function _updateNationLabelVisibility() {
  if (!_nationSvg || !_nationSvgGroup) return;
  _nationSvgGroup.innerHTML = '';

  const mapSize    = leafletMap.getSize();
  const FONT_FAM   = 'Cinzel, Palatino, Georgia, serif';
  const FILL_COLOR = 'rgba(242,218,152,0.96)';
  const STROKE_COL = 'rgba(30,12,2,0.55)';
  const MIN_PX_AREA = 450;
  const MIN_FONT    = 8;

  for (const d of nationLabelData) {
    // ── 1. Все вершины кластера → пиксели ──
    const allPts = [];
    let totalPxArea = 0;
    const pxPolys = [];

    for (const reg of d.regions) {
      const poly = reg.coords.map(c => leafletMap.latLngToContainerPoint([c[0], c[1]]));
      pxPolys.push(poly);
      totalPxArea += _pxPolyArea(poly);
      for (const p of poly) allPts.push(p);
    }

    if (totalPxArea < MIN_PX_AREA) continue;

    // ── 2. PCA-угол (направление «длинной» оси территории) ──
    let angle = _pcaAnglePx(allPts);
    const span = _rotatedSpan(allPts, angle);

    if (span.height > span.width) angle += Math.PI / 2;
    // Нормализуем в [-π/2, π/2]
    while (angle >  Math.PI / 2) angle -= Math.PI;
    while (angle < -Math.PI / 2) angle += Math.PI;

    const finalSpan = _rotatedSpan(allPts, angle);
    if (finalSpan.width < 14 && finalSpan.height < 14) continue;

    // ── 3. Визуальный центр + поиск оптимального положения ──
    const centerPt = leafletMap.latLngToContainerPoint([d.lat, d.lng]);
    let tx = centerPt.x, ty = centerPt.y;

    // Проверяем что polylabel-центр на суше
    let onLand = false;
    for (const poly of pxPolys) {
      if (_pointInPolyPx(centerPt, poly)) { onLand = true; break; }
    }
    if (!onLand) {
      // Если нет — ищем точку на суше ближе к centroid
      tx = finalSpan.cx; ty = finalSpan.cy;
      for (const poly of pxPolys) {
        if (_pointInPolyPx({ x: tx, y: ty }, poly)) { onLand = true; break; }
      }
      if (!onLand) {
        // Берём центр наибольшего полигона
        let maxA = 0;
        for (const poly of pxPolys) {
          const a = _pxPolyArea(poly);
          if (a > maxA) {
            maxA = a;
            let sx = 0, sy = 0;
            for (const p of poly) { sx += p.x; sy += p.y; }
            tx = sx / poly.length; ty = sy / poly.length;
          }
        }
      }
    }

    // Отбрасываем если вне видимой области
    if (tx < -300 || tx > mapSize.x + 300 ||
        ty < -300 || ty > mapSize.y + 300) continue;

    // ── 4. Сканируем ширину суши вдоль текстовой оси через центр ──
    // Пробуем несколько параллельных линий и берём лучшую позицию
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);
    let bestW = 0, bestTx = tx, bestTy = ty;

    const offsets = [0, -0.15, 0.15, -0.30, 0.30];
    for (const frac of offsets) {
      const off = frac * finalSpan.height;
      const sx = tx + perpX * off;
      const sy = ty + perpY * off;
      // Проверяем что точка на суше
      let isLand = false;
      for (const poly of pxPolys) {
        if (_pointInPolyPx({ x: sx, y: sy }, poly)) { isLand = true; break; }
      }
      if (!isLand) continue;
      const w = _landWidthThrough(sx, sy, angle, pxPolys);
      if (w > bestW) { bestW = w; bestTx = sx; bestTy = sy; }
    }

    tx = bestTx; ty = bestTy;
    if (bestW < 14) bestW = finalSpan.width; // fallback

    // Высота суши (перпендикулярно тексту) для ограничения размера шрифта
    const landH = _landWidthThrough(tx, ty, angle + Math.PI / 2, pxPolys);

    // ── 5. Размер шрифта — по ширине суши ──
    const textLen = Math.max(18, Math.floor(bestW * 0.82));

    let fontSize = 7;
    while (fontSize < 68) {
      _labelCtx.font = `700 ${fontSize + 1}px ${FONT_FAM}`;
      if (_labelCtx.measureText(d.name).width > textLen) break;
      fontSize++;
    }
    // Ограничиваем высотой: не более 55% высоты суши через центр
    const maxByH = landH > 10 ? Math.floor(landH * 0.55) : 68;
    fontSize = Math.max(MIN_FONT, Math.min(68, fontSize, maxByH));
    if (fontSize < MIN_FONT) continue;

    // ── 6. SVG <text> ──
    const angleDeg = angle * 180 / Math.PI;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', tx.toFixed(1));
    el.setAttribute('y', ty.toFixed(1));
    el.setAttribute('text-anchor',      'middle');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-family',       FONT_FAM);
    el.setAttribute('font-weight',       '700');
    el.setAttribute('font-size',         fontSize.toFixed(1));
    el.setAttribute('fill',             FILL_COLOR);
    el.setAttribute('stroke',           STROKE_COL);
    el.setAttribute('stroke-width',     (fontSize < 16 ? '0.3' : '0.5'));
    el.setAttribute('paint-order',      'stroke fill');
    el.setAttribute('letter-spacing',   (fontSize > 14 ? '0.12em' : '0.06em'));
    el.setAttribute('filter', fontSize >= 14 ? 'url(#nlbl-shadow)' : 'url(#nlbl-shadow-sm)');

    if (Math.abs(angleDeg) > 0.5) {
      el.setAttribute('transform', `rotate(${angleDeg.toFixed(1)},${tx.toFixed(1)},${ty.toFixed(1)})`);
    }

    el.textContent = d.name;
    _nationSvgGroup.appendChild(el);
  }
}

function scheduleNationLabelUpdate() {
  if (_labelTimerId) clearTimeout(_labelTimerId);
  _labelTimerId = setTimeout(_updateNationLabelVisibility, 80);
}

// ──────────────────────────────────────────────────────────────
// ID РЕГИОНОВ (режим отладки/разметки)
// ──────────────────────────────────────────────────────────────

function renderRegionIdLabels() {
  clearRegionIdLabels();
  for (const [regionId, mapData] of Object.entries(MAP_REGIONS)) {
    if (NON_PLAYABLE_TYPES.has(mapData.mapType)) continue;
    if (!mapData.center) continue;
    const icon = L.divIcon({
      className: 'region-id-label',
      html: `<span>${regionId}</span>`,
      iconSize: [48, 16],
      iconAnchor: [24, 8],
    });
    const marker = L.marker(mapData.center, { icon, interactive: false, zIndexOffset: 1000 });
    marker.addTo(leafletMap);
    regionIdMarkers.push(marker);
  }
}

function clearRegionIdLabels() {
  for (const m of regionIdMarkers) {
    if (leafletMap.hasLayer(m)) leafletMap.removeLayer(m);
  }
  regionIdMarkers = [];
}

// ──────────────────────────────────────────────────────────────
// ЛЁГКОЕ ОБНОВЛЕНИЕ СТИЛЕЙ (без пересоздания слоёв)
// ──────────────────────────────────────────────────────────────

function refreshRegionStyles() {
  for (const [regionId, layer] of Object.entries(regionLayers)) {
    const mapData = MAP_REGIONS[regionId];
    // Не-игровые регионы не меняют стиль
    if (mapData && NON_PLAYABLE_TYPES.has(mapData.mapType)) continue;

    const gameRegion = GAME_STATE.regions[regionId];
    const nationId = gameRegion ? gameRegion.nation : mapData?.nation;
    const nation = GAME_STATE.nations[nationId];
    const color = nation ? nation.color : '#A8A898';
    const isPlayer = (nationId === GAME_STATE.player_nation);
    const isSelected = (regionId === selectedRegionId);
    layer.setStyle(buildPolygonStyle(color, isPlayer, isSelected));

    if (layer.getTooltip && layer.getTooltip()) {
      layer.setTooltipContent(buildTooltipContent(regionId, mapData, nationId));
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ПУБЛИЧНАЯ ФУНКЦИЯ renderMap() — вызывается из turn.js
// ──────────────────────────────────────────────────────────────

function renderMap() {
  if (!leafletMap) {
    // Первый вызов — инициализируем Leaflet
    if (typeof L === 'undefined') {
      console.error('Leaflet не загружен. Проверьте интернет-соединение.');
      const container = document.getElementById('map-container');
      if (container) {
        container.style.background = '#1a3a5c';
        container.innerHTML = '<div style="color:#d4a853;padding:20px;text-align:center;padding-top:40px">⚠ Карта недоступна — нет подключения к интернету.<br>Загрузка Leaflet не удалась.</div>';
      }
      return;
    }
    // requestAnimationFrame гарантирует, что контейнер уже имеет размеры в DOM
    requestAnimationFrame(() => {
      try {
        initLeafletMap();
        // invalidateSize на случай если контейнер ещё не получил финальный размер
        setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 100);
      } catch (e) {
        console.error('Leaflet init error:', e);
      }
    });
  } else {
    // Последующие вызовы — только обновляем стили
    refreshRegionStyles();
  }

  // Легенда наций (DOM вне Leaflet)
  renderNationLegend && renderNationLegend();
}

// ──────────────────────────────────────────────────────────────
// AWMC GEODATA — ГРАНИЦЫ ПРОВИНЦИЙ
// Источник: github.com/AWMC/geodata (ODC Open Database License)
// roman_empire_ce_200_provinces.geojson — линии границ провинций
// Накладываются поверх цветных полигонов как точные географические границы
// ──────────────────────────────────────────────────────────────

async function loadAWMCProvinceBoundaries() {
  if (!leafletMap) return;

  const AWMC_URL =
    'https://raw.githubusercontent.com/AWMC/geodata/master/' +
    'Cultural-Data/political_shading/roman_empire_ce_200_provinces/' +
    'roman_empire_ce_200_provinces.geojson';

  let geojsonData;
  try {
    const resp = await fetch(AWMC_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    geojsonData = await resp.json();
  } catch (err) {
    console.warn('AWMC province boundaries unavailable:', err.message);
    return;
  }

  if (!leafletMap) return; // карта могла быть уничтожена пока шёл fetch

  // Фильтруем: оставляем только линии в пределах Средиземноморья
  // (lat 27–50, lng −8…45) с реальной длиной (LENGTH > 0)
  const filtered = {
    type: 'FeatureCollection',
    features: (geojsonData.features || []).filter(f => {
      if (!f.geometry || !f.geometry.coordinates) return false;
      if ((f.properties.LENGTH || 0) === 0) return false;
      // Проверяем хотя бы одну координату попадает в bbox
      const coords = f.geometry.coordinates;
      const sample = Array.isArray(coords[0]) ? coords[0] : coords;
      if (!Array.isArray(sample) || sample.length < 2) return false;
      const [lng, lat] = sample;
      return lat >= 27 && lat <= 50 && lng >= -8 && lng <= 45;
    }),
  };

  if (awmcProvinceLayer) {
    awmcProvinceLayer.remove();
  }

  awmcProvinceLayer = L.geoJSON(filtered, {
    style: {
      color:   'rgba(0,0,0,0.70)',
      weight:  1.8,
      opacity: 1,
    },
    // LineString — заливка не нужна
    onEachFeature: null,
  });

  // Добавляем под игровые полигоны (чтобы не перекрывать интерактивность)
  awmcProvinceLayer.addTo(leafletMap);
  awmcProvinceLayer.bringToBack();
  // Поднимаем обратно под регионы, но поверх тайлов
  for (const layer of Object.values(regionLayers)) {
    layer.bringToFront();
  }
}

// ──────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────────────────────

// Алгоритм Чайкина — сглаживание углов полигона.
// Каждую итерацию заменяет каждый отрезок двумя точками на 1/4 и 3/4.
// iterations=3 даёт плавные, органичные границы провинций.
function smoothChaikin(coords, iterations = 3) {
  let pts = coords.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const smooth = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      smooth.push([
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1],
      ]);
      smooth.push([
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1],
      ]);
    }
    pts = smooth;
  }
  return pts;
}

function getTerrainName(terrain) {
  const names = {
    coastal_city: 'Прибрежный город',
    plains:       'Равнина',
    hills:        'Холмы',
    mountains:    'Горы',
    river_valley: 'Речная долина',
  };
  return names[terrain] || terrain;
}

function lightenColor(hex, amount) {
  if (!hex || !hex.startsWith('#')) return hex;
  try {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch {
    return hex;
  }
}
