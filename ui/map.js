// Карта на Leaflet.js + тайлы CAWM (Ancient World Mapping Center)
// Тайлы: https://cawm.lib.uiowa.edu — CC BY 4.0
// Координаты в формате Leaflet [lat, lng]

let leafletMap = null;          // экземпляр L.Map
let regionLayers = {};          // { regionId: L.Polygon }
let selectedRegionId = null;
let awmcProvinceLayer = null;   // слой границ провинций из AWMC geodata
let canvasRenderer = null;      // Canvas-рендерер для производительности с 2800+ полигонами
let svgTradeRenderer = null;    // SVG-рендерер (Шаг 42) — только для торговых маршрутов (CSS-анимация)
let regionIdMarkers = [];       // маркеры с ID регионов (для отладки)
let showRegionIds = false;      // флаг показа ID регионов
let showTradeRoutes = false;    // флаг показа торговых маршрутов
let tradeRouteLines = [];       // линии торговых маршрутов
let nationBorderLayer = null;   // слой толстых границ между нациями
let nationLabelMarkers = [];    // (устарело) оставлено для совместимости
let nationLabelData   = [];     // { nationId, name, lat, lng, regions, totalGeoArea }
let _labelTimerId     = null;   // debounce timer для обновления видимости
let _colorRefreshTimer = null;  // Шаг 36: debounce для refreshRegionStyles после layeradd
let _colorRefreshRetryTimer = null; // Шаг 36: таймер повтора для полигонов без _renderer
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

  // Этап 17 (Tabula Peutingeriana) — фон карты = цвет моря.
  // Принудительно устанавливаем тёмно-базальтовый фон, чтобы Leaflet
  // не подсвечивал области вне полигонов нейтрально-серым цветом.
  try { container.style.background = '#0f1a24'; } catch (_) {}

  // Canvas-рендерер: критично для производительности с 2800+ полигонами
  canvasRenderer = L.canvas({ padding: 0.5, tolerance: 4 });
  // SVG-рендерер (Шаг 42) — только для линий торговых маршрутов.
  // Нужен, чтобы CSS-анимация stroke-dashoffset работала на <path>.
  svgTradeRenderer = L.svg({ padding: 0.5 });

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

  // Этап 17 — фон Leaflet-контейнера принудительно = цвет моря.
  try { leafletMap.getContainer().style.background = '#0f1a24'; } catch (_) {}

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

  // uisuper Этап 18 — подписи городов-столиц (Cinzel, золотом для игрока)
  try { renderCityLabels(); } catch (e) { console.warn('[renderCityLabels]', e); }

  // Слои армий и осад (поверх всего)
  if (typeof initArmyLayers === 'function') initArmyLayers();

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
    // Шаг 44 (arma.md): пересчитать уровень детализации карты
    try { onZoomChange(leafletMap.getZoom()); } catch (e) { console.warn('[Шаг 44]', e); }
  });
  // Шаг 44: первичное применение уровня сразу после инициализации.
  try { onZoomChange(leafletMap.getZoom()); } catch (_) {}
  window.addEventListener('resize', scheduleNationLabelUpdate);

  // Шаг 36: слушатель событий добавления слоя Canvas-рендерером.
  // Дебаунс (100мс) нужен чтобы не дёргать refreshRegionStyles сотни раз
  // подряд при пакетной добавке полигонов.
  leafletMap.on('layeradd', () => {
    if (_colorRefreshTimer) clearTimeout(_colorRefreshTimer);
    _colorRefreshTimer = setTimeout(() => {
      _colorRefreshTimer = null;
      if (leafletMap) refreshRegionStyles();
    }, 100);
  });

  // Шаг 36: при ресайзе окна Canvas пересоздаётся → повторно раскрашиваем.
  window.addEventListener('resize', () => {
    if (_colorRefreshTimer) clearTimeout(_colorRefreshTimer);
    _colorRefreshTimer = setTimeout(() => {
      _colorRefreshTimer = null;
      if (leafletMap) {
        leafletMap.invalidateSize();
        refreshRegionStyles();
      }
    }, 150);
  });

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

  // Кнопка показа торговых маршрутов
  const tradeToggleControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const btn = L.DomUtil.create('button',
        'leaflet-bar leaflet-control trade-routes-toggle-btn');
      btn.title = 'Показать/скрыть торговые маршруты';
      btn.textContent = 'TRADE';
      L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation);
      L.DomEvent.on(btn, 'click', () => {
        showTradeRoutes = !showTradeRoutes;
        btn.classList.toggle('active', showTradeRoutes);
        showTradeRoutes ? renderTradeRouteLines() : clearTradeRouteLines();
      });
      return btn;
    },
  });
  new tradeToggleControl().addTo(leafletMap);

  // Шаг 48 — создаём SVG pane для fog-of-war хэтчинга
  _ensureFogOverlayPane();
}

// ──────────────────────────────────────────────────────────────
// Шаг 48 — SVG оверлей "туман войны" с pattern hatching
// ──────────────────────────────────────────────────────────────
let _fogOverlayPane = null;
let _fogOverlaySvg  = null;

function _ensureFogOverlayPane() {
  if (!leafletMap) return;
  if (_fogOverlayPane) return;
  try {
    const pane = leafletMap.createPane('fogOverlayPane');
    pane.style.zIndex = 410;
    pane.style.pointerEvents = 'none';
    _fogOverlayPane = pane;
  } catch (e) {
    console.warn('[Шаг 48] fog pane create failed', e);
  }
}

function _ensureFogPattern() {
  if (!svgTradeRenderer || !svgTradeRenderer._container) return;
  const svg = svgTradeRenderer._container;
  if (svg.querySelector && svg.querySelector('#fog-hatch-pattern')) return;
  const NS = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector && svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  // uisuper hot-fix #3: штриховка fog-of-war была слишком контрастной
  // (rgba 0.35 фон + 0.55 линии width=2, шаг 8px) и визуально портила
  // карту. Делаем её заметно мягче: шаг 14px, полупрозрачный фон,
  // тонкая едва видимая диагональная линия.
  const pattern = document.createElementNS(NS, 'pattern');
  pattern.setAttribute('id', 'fog-hatch-pattern');
  pattern.setAttribute('width', '14');
  pattern.setAttribute('height', '14');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('width', '14');
  rect.setAttribute('height', '14');
  rect.setAttribute('fill', 'rgba(10,8,4,0.10)');
  pattern.appendChild(rect);
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', '0');
  line.setAttribute('x2', '0');
  line.setAttribute('y2', '14');
  line.setAttribute('stroke', 'rgba(0,0,0,0.18)');
  line.setAttribute('stroke-width', '0.7');
  pattern.appendChild(line);
  defs.appendChild(pattern);
}

let _fogPolygons = {};
function refreshFogOverlay() {
  if (!leafletMap) return;
  _ensureFogOverlayPane();
  // Убираем старые
  for (const poly of Object.values(_fogPolygons)) {
    try { if (leafletMap.hasLayer(poly)) leafletMap.removeLayer(poly); } catch (_) {}
  }
  _fogPolygons = {};

  // Рендерим полупрозрачные полигоны SVG над регионами intel=0
  for (const [regionId, mapData] of Object.entries(MAP_REGIONS)) {
    if (!mapData?.coords || mapData.coords.length < 3) continue;
    if (NON_PLAYABLE_TYPES.has(mapData.mapType)) continue;
    const intel = getIntelLevel(regionId);
    if (intel !== 0) continue;
    const coords = mapData.coords.length <= 60
      ? smoothChaikin(mapData.coords, 2)
      : mapData.coords;
    const poly = L.polygon(coords, {
      pane: 'fogOverlayPane',
      renderer: svgTradeRenderer,
      stroke: false,
      weight: 0,
      fillColor: '#0a0804',
      // uisuper hot-fix #3: fog overlay opacity 0.35→0.15 — туман
      // обозначает неизведанные регионы, но не должен перекрывать
      // цвет фракций.
      fillOpacity: 0.15,
      interactive: false,
    });
    poly.addTo(leafletMap);
    // Пробуем подменить fill на pattern — если pattern недоступен, остаётся
    // запасной тёмный fill, что всё равно визуально притеняет регион.
    _ensureFogPattern();
    try {
      if (poly._path) {
        poly._path.setAttribute('fill', 'url(#fog-hatch-pattern)');
        poly._path.setAttribute('fill-opacity', '1');
      }
    } catch (_) {}
    _fogPolygons[regionId] = poly;
  }
}
if (typeof window !== 'undefined') {
  window.refreshFogOverlay = refreshFogOverlay;
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

// ──────────────────────────────────────────────────────────────
// Шаг 48 — ТУМАН ВОЙНЫ (РАЗВЕДКА)
// ──────────────────────────────────────────────────────────────
// Возвращает уровень разведданных для региона с точки зрения игрока:
//   2 — полная информация (свои регионы / союзники / соседи игрока)
//   1 — частичная (регионы в 2 перехода от игрока, торговые партнёры)
//   0 — минимум (все остальные далёкие регионы)
function getIntelLevel(regionId) {
  try {
    const playerId = GAME_STATE?.player_nation;
    if (!playerId) return 2; // до инициализации игрока показываем всё
    const mapData  = MAP_REGIONS[regionId];
    if (!mapData) return 0;
    const gameRegion = GAME_STATE.regions?.[regionId];
    const ownerId   = gameRegion ? gameRegion.nation : mapData.nation;

    // (a) свой регион → полная информация
    if (ownerId === playerId) return 2;

    // Кэш соседей игрока
    if (!_fogIntelCache || _fogIntelCache.turn !== GAME_STATE.turn
        || _fogIntelCache.playerId !== playerId) {
      _rebuildFogIntelCache(playerId);
    }
    const cache = _fogIntelCache;

    // (b) союзники / военные альянсы / брачный союз / оборонительный союз
    if (cache.allies.has(ownerId)) return 2;
    // (c) соседние регионы — граничат с регионом игрока
    if (cache.neighborRegions.has(regionId)) return 2;

    // (d) регионы в 2 перехода → частичная
    if (cache.secondRingRegions.has(regionId)) return 1;
    // (e) торговые партнёры → частичная
    if (cache.tradePartners.has(ownerId)) return 1;

    // (f) всё остальное — минимум
    return 0;
  } catch (e) {
    console.warn('[getIntelLevel] error', e);
    return 2;
  }
}

// Кэш обхода графа соседей (пересчитывается 1 раз за ход)
let _fogIntelCache = null;
function _rebuildFogIntelCache(playerId) {
  const ownRegions = new Set();
  for (const [rid, gr] of Object.entries(GAME_STATE.regions || {})) {
    if (gr?.nation === playerId) ownRegions.add(rid);
  }
  // BFS по connections на 2 перехода
  const neighborRegions   = new Set(); // в 1 переходе
  const secondRingRegions = new Set(); // в 2 переходах
  for (const rid of ownRegions) {
    const md = MAP_REGIONS[rid];
    for (const nid of (md?.connections || [])) {
      if (!ownRegions.has(nid)) neighborRegions.add(nid);
    }
  }
  for (const rid of neighborRegions) {
    const md = MAP_REGIONS[rid];
    for (const nid of (md?.connections || [])) {
      if (!ownRegions.has(nid) && !neighborRegions.has(nid)) secondRingRegions.add(nid);
    }
  }

  // Союзники: активные defensive_alliance / military_alliance / marriage_alliance
  const allies = new Set();
  const tradePartners = new Set();
  const diplomacy = GAME_STATE.diplomacy;
  if (diplomacy?.treaties) {
    for (const t of diplomacy.treaties) {
      if (t.status !== 'active') continue;
      if (!Array.isArray(t.parties) || !t.parties.includes(playerId)) continue;
      const other = t.parties.find(p => p !== playerId);
      if (!other) continue;
      if (t.type === 'defensive_alliance'
          || t.type === 'military_alliance'
          || t.type === 'marriage_alliance') {
        allies.add(other);
      }
      if (t.type === 'trade_agreement' || t.type === 'trade_pact'
          || t.type === 'commerce_treaty') {
        tradePartners.add(other);
      }
    }
  }
  // Также экономические торговые маршруты игрока
  const playerNation = GAME_STATE.nations?.[playerId];
  const tradeRoutes  = playerNation?.economy?.trade_routes || [];
  for (const partnerId of tradeRoutes) {
    // trade_routes может содержать regionId или nationId — пытаемся оба варианта
    const mapped = MAP_REGIONS[partnerId];
    if (mapped) {
      // это регион — добавляем его хозяина
      const gr = GAME_STATE.regions?.[partnerId];
      if (gr?.nation && gr.nation !== playerId) tradePartners.add(gr.nation);
    } else if (GAME_STATE.nations?.[partnerId]) {
      tradePartners.add(partnerId);
    }
  }

  _fogIntelCache = {
    turn: GAME_STATE.turn,
    playerId,
    ownRegions,
    neighborRegions,
    secondRingRegions,
    allies,
    tradePartners,
  };
}

// Текстовая метка уровня разведки
function getIntelLabel(level) {
  if (level >= 2) return { text: 'полная',    icon: '🔍', hint: 'Свой регион, союзник или сосед' };
  if (level >= 1) return { text: 'частичная', icon: '🔍', hint: 'Торговый партнёр или регион в 2 перехода' };
  return           { text: 'нет данных', icon: '🌫', hint: 'Далёкий регион — отправьте разведчика или установите торговлю' };
}

// Приблизительная оценка числа (для intel=1 показывает диапазон ~X-Y)
function roughEstimate(num) {
  const n = Math.max(0, Math.round(+num || 0));
  if (n === 0) return '0';
  // Округляем до 2 значащих цифр, формируем диапазон ±30%
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  const center = Math.round(n / magnitude) * magnitude;
  const low  = Math.max(0, Math.round(center * 0.7));
  const high = Math.round(center * 1.3);
  const fmt = (v) => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : '' + v;
  return `~${fmt(low)}–${fmt(high)}`;
}

// Инвалидировать кэш извне (например, после смены хода)
function invalidateFogIntelCache() { _fogIntelCache = null; }
if (typeof window !== 'undefined') {
  window.getIntelLevel          = getIntelLevel;
  window.getIntelLabel          = getIntelLabel;
  window.roughEstimate          = roughEstimate;
  window.invalidateFogIntelCache = invalidateFogIntelCache;
}

// Стили для не-игровых типов регионов.
// Этап 17 (Tabula Peutingeriana) — цвета моря/озёр приглушённее, без
// насыщенной синевы; непроходимые области — тёплая умбра.
const NON_PLAYABLE_STYLES = {
  Ocean:      { color: 'none', weight: 0, fillColor: '#14202c', fillOpacity: 0.55, interactive: false },
  Strait:     { color: 'none', weight: 0, fillColor: '#16263a', fillOpacity: 0.60, interactive: false },
  Lake:       { color: 'rgba(40,60,90,0.35)', weight: 0.5, fillColor: '#1c3045', fillOpacity: 0.75, interactive: false },
  Impassible: { color: 'rgba(60,42,22,0.35)', weight: 0.5, fillColor: '#5a4a32', fillOpacity: 0.55, interactive: false },
};

// ──────────────────────────────────────────────────────────────
// Этап 17 — цветовые хелперы (HSL-манипуляции)
// ──────────────────────────────────────────────────────────────

/** Hex → HSL [h:0..360, s:0..1, l:0..1] */
function hexToHsl(hex) {
  if (typeof hex !== 'string') return [0, 0, 0.5];
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return [0, 0, 0.5];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hh = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hh = (b - r) / d + 2; break;
      case b: hh = (r - g) / d + 4; break;
    }
    hh *= 60;
  }
  return [hh, s, l];
}

/** HSL → Hex */
function hslToHex(hDeg, s, l) {
  const h = ((hDeg % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x) => {
    const v = Math.round(x * 255);
    return (v < 16 ? '0' : '') + v.toString(16);
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/** Снизить насыщенность цвета (amount = 0..1). */
function desaturateColor(hex, amount = 0.4) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s * (1 - amount), l);
}

/** Затемнить цвет (amount = 0..1). */
function darkenColor(hex, amount = 0.3) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, l * (1 - amount));
}

/**
 * Этап 17 — кэш приглушённых цветов наций.
 * Маппинг: сырой hex → {fill, border}.
 */
const _tabulaColorCache = new Map();
function tabulaRegionColor(rawHex, nationId) {
  // uisuper hot-fix #1 (v5): КРИТИЧНО. Предыдущие версии v2–v4
  // хэшировали nation.color (hex), но в renderRegionPolygons
  // подставляется blendColor из getProvinceBlendColor — это
  // линейный blend двух ведущих наций провинции. Разные регионы
  // одной нации в одной провинции получают РАЗНЫЕ blend-hex →
  // РАЗНЫЕ хэши → РАЗНЫЕ цвета. И наоборот, все регионы одной
  // провинции получают ОДИН blend-hex → ОДИН цвет, независимо от
  // того, каким нациям они фактически принадлежат. Катастрофа:
  // Сицилия (3 нации в одной провинции) вся одного цвета, но
  // при этом на обзоре каждый регион разноцветный как мозаика.
  //
  // v5: хэш-ключ — nation_id (стабильный per-nation идентификатор),
  // а не hex цвета. Все регионы нации X → точно один цвет. Разные
  // нации → гарантированно разные цвета. Блэнд-hex провинций для
  // раскраски игнорируется (остаётся для других визуализаций).
  // Fallback на rawHex только если nationId не передан (legacy).
  const key = (typeof nationId === 'string' && nationId.length > 0)
              ? ('n:' + nationId.toLowerCase())
              : (typeof rawHex === 'string' ? rawHex.toLowerCase() : '');
  if (_tabulaColorCache.has(key)) return _tabulaColorCache.get(key);

  // Нейтральные регионы — охристый пергамент.
  const NEUTRAL_FILL   = '#c8a96e';
  const NEUTRAL_BORDER = '#6b4f2a';
  if (!key || key === '#a8a898' || key === '#aaaaaa'
      || key === 'n:neutral' || key === 'n:ocean'
      || key === 'n:rebels' || key === 'n:unowned') {
    const pair = { fill: NEUTRAL_FILL, border: NEUTRAL_BORDER };
    _tabulaColorCache.set(key, pair);
    return pair;
  }

  // FNV-1a 32-bit hash на entropy source (nationId string или hex)
  const hashInput = key.startsWith('n:') ? key.slice(2) : key;
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < hashInput.length; i++) {
    hash ^= hashInput.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0; // FNV prime
  }
  // Три битовых среза → H/S/L (эффективная ёмкость ≈ 268M комбинаций)
  const h01 = ( hash        & 0xFFF) / 4096; // 0..1
  const s01 = ((hash >>> 12) & 0xFF)  / 256; // 0..1
  const l01 = ((hash >>> 20) & 0xFF)  / 256; // 0..1
  const adjH = h01 * 360;                    // 0..360°
  const adjS = 0.58 + s01 * 0.32;            // 0.58..0.90
  const adjL = 0.42 + l01 * 0.28;            // 0.42..0.70
  const fill   = hslToHex(adjH, adjS, adjL);
  const border = darkenColor(fill, 0.55);
  const pair = { fill, border };
  _tabulaColorCache.set(key, pair);
  return pair;
}

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
    // Провинциальное смешение цветов при оспариваемом контроле
    const blendColor   = (typeof getProvinceBlendColor === 'function')
                         ? getProvinceBlendColor(regionId) : null;
    const color        = blendColor ?? (nation ? nation.color : '#A8A898');
    const isPlayerRegion = (nationId === GAME_STATE.player_nation);
    const isSelected   = (selectedRegionId === regionId);

    // Оккупация: оригинальный цвет владельца для штриховки
    const originalNationId = gameRegion?.original_nation;
    const occupierColor    = gameRegion?.occupied_by
      ? (GAME_STATE.nations[gameRegion.occupied_by]?.color ?? null)
      : null;
    const originalColor    = originalNationId
      ? (GAME_STATE.nations[originalNationId]?.color ?? null)
      : null;

    // Сглаживание только для небольших полигонов (Ocean уже отсеян выше)
    const coords = mapData.coords.length <= 60
      ? smoothChaikin(mapData.coords, 2)
      : mapData.coords;

    const intelLevel = getIntelLevel(regionId);
    const occupierNationId = gameRegion?.occupied_by ?? null;
    const polygon = L.polygon(coords, {
      ...buildPolygonStyle(color, isPlayerRegion, isSelected, originalColor, occupierColor, intelLevel, nationId, originalNationId, occupierNationId),
      renderer: canvasRenderer,
    });

    polygon.on('click',     () => onRegionClick(regionId));
    polygon.on('mouseover', (e) => onRegionHover(e, regionId, true,  color, isPlayerRegion));
    polygon.on('mouseout',  (e) => onRegionHover(e, regionId, false, color, isPlayerRegion));
    // Шаг 30: правый клик по региону → контекстное меню
    polygon.on('contextmenu', (e) => {
      if (e && e.originalEvent) {
        try { e.originalEvent.preventDefault(); } catch (err) {}
        try { e.originalEvent.stopPropagation(); } catch (err) {}
      }
      if (typeof window.showContextMenu === 'function') {
        const ox = e?.originalEvent?.clientX ?? 0;
        const oy = e?.originalEvent?.clientY ?? 0;
        window.showContextMenu(ox, oy, regionId);
      }
    });

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

/**
 * Стиль полигона региона.
 * @param {string}      color        — цвет нации-владельца
 * @param {boolean}     isPlayerRegion
 * @param {boolean}     isSelected
 * @param {string|null} originalColor  — цвет оригинального владельца (оккупация)
 * @param {string|null} occupierColor  — цвет оккупанта (для границы)
 * @param {number}      intelLevel     — Шаг 48: уровень разведки (0/1/2)
 */
function buildPolygonStyle(color, isPlayerRegion, isSelected, originalColor = null, occupierColor = null, intelLevel = 2, nationId = null, originalNationId = null, occupierNationId = null) {
  // Этап 17 (Tabula Peutingeriana) + uisuper hot-fix #1 v5:
  // tabulaRegionColor теперь хэширует nationId (не hex), чтобы все
  // регионы одной нации получали один цвет. Передаём nationId явно;
  // fallback на color-hex сохранён для legacy-вызовов.
  const tab       = tabulaRegionColor(color, nationId);
  const tabFill   = tab.fill;
  const tabBorder = tab.border;

  // Оккупированный регион: показываем цвет оригинального владельца (светлее),
  // а толстую штрихованную границу — в цвете захватчика.
  if (originalColor && occupierColor && !isSelected) {
    const origTab = tabulaRegionColor(originalColor, originalNationId);
    const occTab  = tabulaRegionColor(occupierColor, occupierNationId);
    return {
      fillColor:   origTab.fill,      // оригинальный владелец виден как фон
      fillOpacity: intelLevel === 0 ? 0.40 : 0.55,
      color:       occTab.border,     // граница = тёмный цвет захватчика
      weight:      2.5,
      opacity:     1.0,
      dashArray:   '8 4',             // штриховая граница — признак оккупации
    };
  }

  // Шаг 48 + uisuper hot-fix #1: туман войны — далёкие регионы
  // приглушаются МЕНЬШЕ, чем раньше, чтобы nation color оставался
  // читаемым (иначе весь мир выглядит одноцветным охристым полотном).
  if (!isSelected && intelLevel === 0) {
    return {
      color:        'rgba(40,30,15,0.60)',
      weight:       0.8,
      fillColor:    tabFill,
      fillOpacity:  0.70,
      opacity:      0.90,
      dashArray:    '3 3',
    };
  }
  if (!isSelected && intelLevel === 1) {
    return {
      color:        'rgba(60,45,20,0.55)',
      weight:       0.9,
      fillColor:    tabFill,
      fillOpacity:  0.78,
      opacity:      1.0,
      dashArray:    null,
    };
  }

  return {
    // Этап 17 — выделение = палитровое золото (--gold #c9a961),
    // обычная граница — тонкая тёмная умбра.
    // uisuper hot-fix #1: базовая fillOpacity поднята 0.70→0.85 —
    // nation colors теперь явно читаются.
    color:        isSelected ? '#c9a961' : tabBorder,
    weight:       isSelected ? 2.5 : 1.0,
    fillColor:    tabFill,
    fillOpacity:  isSelected ? 0.92 : 0.85,
    opacity:      1.0,
    dashArray:    null,
  };
}

function buildTooltipContent(regionId, mapData, nationId) {
  const gameRegion = GAME_STATE.regions[regionId];

  // При оккупации — показываем оригинального владельца как основную нацию,
  // а захватчика — отдельной строкой
  const isOccupied  = !!(gameRegion?.occupied_by && gameRegion?.original_nation);
  const displayNatId = isOccupied ? gameRegion.original_nation : nationId;
  const nation = GAME_STATE.nations[displayNatId];
  const nationName  = nation ? nation.name : 'Независимые';
  const nationColor = nation ? nation.color : '#A8A898';

  // Шаг 48: фильтрация данных по уровню разведки
  const intel = (typeof getIntelLevel === 'function') ? getIntelLevel(regionId) : 2;
  const popRaw = gameRegion ? (gameRegion.population || 0) : 0;
  const population = intel >= 1 ? popRaw.toLocaleString() : '???';
  const garrisonRaw = gameRegion ? (gameRegion.garrison || 0) : 0;
  const garrisonStr = intel >= 2
    ? garrisonRaw.toLocaleString()
    : (intel >= 1 ? roughEstimate(garrisonRaw) : '???');

  // Оккупация (известна только при intel >= 1)
  let occupyStr = '';
  if (isOccupied && intel >= 1) {
    const occNation = GAME_STATE.nations[gameRegion.occupied_by];
    const occColor  = occNation?.color ?? '#f44336';
    occupyStr = `<div class="rt-occupied" style="color:${occColor}">⚔️ Оккупировано: ${occNation?.name ?? gameRegion.occupied_by}</div>`;
  }

  // Индикатор крепости — известен только при intel >= 1
  let fortStr = '';
  if (intel >= 1 && (gameRegion?.fortress_level ?? 0) > 0) {
    const lvl = gameRegion.fortress_level;
    const lvlLabels = ['','Частокол','Деревянные стены','Каменные стены','Цитадель','Неприступная крепость'];
    const conserved = gameRegion.fortress_conserved ? ' (законсервирована)' : '';
    fortStr = `<div class="rt-fort">🏰 ${lvlLabels[lvl] ?? 'Крепость ур.' + lvl}${conserved}</div>`;
  }

  // Блокировка линией крепостей для армии игрока
  let blockStr = '';
  if (intel >= 1 && typeof _isFortressLineBlocked === 'function' && GAME_STATE.player_nation) {
    if (_isFortressLineBlocked(regionId, GAME_STATE.player_nation)) {
      blockStr = `<div class="rt-blocked">⛔ Заблокировано линией крепостей</div>`;
    }
  }

  // B4: военная сила нации в регионе (нации показываем только при intel >= 2)
  let milStr = '';
  if (nation && intel >= 2) {
    const mil = nation.military;
    const total = (mil?.infantry || 0) + (mil?.cavalry || 0) + (mil?.archers || 0);
    if (total > 0) {
      const totalFmt = total >= 1000 ? (total / 1000).toFixed(1) + 'k' : total;
      milStr = `<div class="rt-mil">⚔ ${totalFmt} воинов</div>`;
    }
  }

  // Шаг 48: индикатор разведки
  const intelMeta = (typeof getIntelLabel === 'function') ? getIntelLabel(intel)
                  : { text: 'полная', icon: '🔍', hint: '' };
  const intelClass = `rt-intel rt-intel--${intel}`;
  const intelStr = `<div class="${intelClass}" title="${intelMeta.hint}">${intelMeta.icon} Разведка: ${intelMeta.text}</div>`;

  return `
    <div class="rt-name">${mapData.name}</div>
    <div class="rt-nation" style="color:${nationColor}">${nationName}</div>
    <div class="rt-pop">👥 ${population}</div>
    <div class="rt-garr">⚔ Гарнизон: ${garrisonStr}</div>
    ${milStr}${occupyStr}${fortStr}${blockStr}${intelStr}
  `;
}

// ──────────────────────────────────────────────────────────────
// ВЗАИМОДЕЙСТВИЕ
// ──────────────────────────────────────────────────────────────

/** Получить цвета оккупации для региона (originalColor, occupierColor) */
function _regionOccupationColors(regionId) {
  const gr = GAME_STATE.regions?.[regionId];
  if (!gr?.occupied_by || !gr?.original_nation) return [null, null];
  const origColor = GAME_STATE.nations[gr.original_nation]?.color ?? null;
  const occColor  = GAME_STATE.nations[gr.occupied_by]?.color ?? null;
  return [origColor, occColor];
}

function onRegionClick(regionId) {
  // Режим выбора цели движения армии — перехватываем клик
  if (typeof handleRegionClickForArmy === 'function' && handleRegionClickForArmy(regionId)) return;

  // Шаг 53 (arma.md): режим сравнения регионов. Если первый регион уже
  // закреплён (pinnedRegionId) — открываем панель сравнения вместо popup.
  if (typeof handleRegionClickForCompare === 'function' && handleRegionClickForCompare(regionId)) return;

  // Снимаем выделение с предыдущего
  if (selectedRegionId && regionLayers[selectedRegionId]) {
    const prev = GAME_STATE.regions[selectedRegionId];
    const prevNationId = prev ? prev.nation : MAP_REGIONS[selectedRegionId]?.nation;
    const prevNation = GAME_STATE.nations[prevNationId];
    const prevColor = prevNation ? prevNation.color : '#A8A898';
    const prevIsPlayer = (prevNationId === GAME_STATE.player_nation);
    const [origC, occC] = _regionOccupationColors(selectedRegionId);
    const prevIntel = (typeof getIntelLevel === 'function') ? getIntelLevel(selectedRegionId) : 2;
    const prevOrigNat = prev?.original_nation ?? null;
    const prevOccNat  = prev?.occupied_by ?? null;
    regionLayers[selectedRegionId].setStyle(buildPolygonStyle(prevColor, prevIsPlayer, false, origC, occC, prevIntel, prevNationId, prevOrigNat, prevOccNat));
  }

  if (selectedRegionId === regionId) {
    selectedRegionId = null;
    closeRegionInfo();
    return;
  }

  selectedRegionId = regionId;

  // Выделяем новый регион (selected всегда без штриховки — чтобы видеть)
  const layer = regionLayers[regionId];
  if (layer) {
    const gameRegion = GAME_STATE.regions[regionId];
    const nationId = gameRegion ? gameRegion.nation : MAP_REGIONS[regionId]?.nation;
    const nation = GAME_STATE.nations[nationId];
    const color = nation ? nation.color : '#A8A898';
    layer.setStyle(buildPolygonStyle(color, nationId === GAME_STATE.player_nation, true, null, null, 2, nationId));
    layer.bringToFront();
  }

  showRegionInfo(regionId);
}

function onRegionHover(e, regionId, entering, color, isPlayerRegion) {
  // Шаг 47: предпросмотр маршрута армии (работает даже если регион "selected")
  if (typeof handleRegionHoverForArmy === 'function') {
    try { handleRegionHoverForArmy(regionId, entering, e); } catch (err) {}
  }

  if (regionId === selectedRegionId) return;

  const layer = regionLayers[regionId];
  if (!layer) return;

  if (entering) {
    // Этап 17 — при наведении: золотой бордюр (палитра --gold),
    // слегка увеличенная непрозрачность заливки.
    layer.setStyle({
      fillOpacity: 0.85,
      weight: isPlayerRegion ? 2.5 : 2.0,
      color: '#c9a961',
    });
    layer.bringToFront();
  } else {
    const [origC, occC] = _regionOccupationColors(regionId);
    const intelLevel = (typeof getIntelLevel === 'function') ? getIntelLevel(regionId) : 2;
    // v5: достаём nationId чтобы tabulaRegionColor хэшировал по нации
    const gr = GAME_STATE.regions?.[regionId];
    const nid = gr ? gr.nation : MAP_REGIONS[regionId]?.nation;
    const orig = gr?.original_nation ?? null;
    const occ  = gr?.occupied_by ?? null;
    layer.setStyle(buildPolygonStyle(color, isPlayerRegion, false, origC, occC, intelLevel, nid, orig, occ));
  }
}

// ──────────────────────────────────────────────────────────────
// КУЛЬТУРА РЕГИОНА — диаграмма
// ──────────────────────────────────────────────────────────────

function renderRegionCultureBlock(regionId, totalPop) {
  // Пробуем сначала динамический стейт, потом статику
  const rc = (GAME_STATE.region_cultures && GAME_STATE.region_cultures[regionId])
    || (typeof REGION_CULTURES !== 'undefined' && REGION_CULTURES[regionId]);
  if (!rc) return '';

  // Собираем все культуры с их долями
  const cultures = [];
  const primaryDef = (typeof CULTURES !== 'undefined' && CULTURES[rc.primary])
    || (GAME_STATE.cultures && GAME_STATE.cultures[rc.primary]);

  // Считаем долю меньшинств
  let minorityTotal = 0;
  for (const m of (rc.minorities || [])) {
    minorityTotal += m.strength;
  }
  const primaryStrength = Math.max(0.01, 1 - minorityTotal);

  cultures.push({
    id: rc.primary,
    name: primaryDef?.name || rc.primary,
    color: primaryDef?.color || '#888',
    icon: primaryDef?.icon || '👥',
    image: primaryDef?.image || '',
    strength: primaryStrength,
    pop: Math.round(totalPop * primaryStrength),
  });

  for (const m of (rc.minorities || [])) {
    const def = (typeof CULTURES !== 'undefined' && CULTURES[m.culture])
      || (GAME_STATE.cultures && GAME_STATE.cultures[m.culture]);
    cultures.push({
      id: m.culture,
      name: def?.name || m.culture,
      color: def?.color || '#666',
      icon: def?.icon || '👥',
      image: def?.image || '',
      strength: m.strength,
      pop: Math.round(totalPop * m.strength),
    });
  }

  // Строим CSS conic-gradient для круговой диаграммы
  let angle = 0;
  const stops = [];
  for (const c of cultures) {
    const deg = c.strength * 360;
    stops.push(`${c.color} ${angle}deg ${angle + deg}deg`);
    angle += deg;
  }
  const gradient = `conic-gradient(${stops.join(', ')})`;

  // Легенда
  const legendItems = cultures.map(c => {
    const pct = (c.strength * 100).toFixed(1);
    const imgTag = c.image
      ? `<img src="${c.image}" class="culture-legend-img" alt="${c.name}" onerror="this.style.display='none'">`
      : '';
    return `
      <div class="culture-legend-item">
        ${imgTag}
        <div class="culture-legend-info">
          <div class="culture-legend-name">
            <span class="culture-dot" style="background:${c.color}"></span>
            ${c.icon} ${c.name}
          </div>
          <div class="culture-legend-stats">
            <span class="culture-pct">${pct}%</span>
            <span class="culture-pop">${c.pop.toLocaleString()} чел.</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="region-culture-section">
      <div class="section-label">🎭 Культура населения</div>
      <div class="culture-chart-container">
        <div class="culture-pie" style="background: ${gradient}">
          <div class="culture-pie-center">${cultures[0].icon}</div>
        </div>
        <div class="culture-legend">${legendItems}</div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// БЛОК РЕЛИГИИ В ИНФО-ПАНЕЛИ РЕГИОНА
// ──────────────────────────────────────────────────────────────

function renderRegionReligionBlock(regionId, totalPop) {
  const rr = GAME_STATE.region_religions?.[regionId];
  if (!rr || !rr.beliefs || rr.beliefs.length === 0) return '';

  // Нормализуем fervor → доли для диаграммы
  const totalFervor = rr.beliefs.reduce((s, b) => s + b.fervor, 0) || 1;

  const religions = rr.beliefs
    .filter(b => b.fervor > 0.01)
    .sort((a, b) => b.fervor - a.fervor)
    .map(b => {
      const def = (typeof RELIGIONS !== 'undefined' && RELIGIONS[b.religion])
        || GAME_STATE.religions?.[b.religion]
        || GAME_STATE.syncretic_religions?.[b.religion];
      const strength = b.fervor / totalFervor;
      return {
        id: b.religion,
        name: def?.name || b.religion,
        color: def?.color || '#888',
        icon: def?.icon || '⛪',
        fervor: b.fervor,
        strength,
        pop: Math.round(totalPop * strength),
        isOfficial: b.religion === rr.official,
      };
    });

  if (religions.length === 0) return '';

  // SVG donut (маленький, 64×64)
  const size = 64, cx = 32, cy = 32, outerR = 30, innerR = 16;
  let paths = '';
  let startAngle = -90;

  for (const r of religions) {
    const sweep = r.strength * 360;
    if (sweep < 0.5) continue;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;

    const rad = (a) => (a * Math.PI) / 180;
    const s1x = cx + outerR * Math.cos(rad(startAngle));
    const s1y = cy + outerR * Math.sin(rad(startAngle));
    const e1x = cx + outerR * Math.cos(rad(endAngle));
    const e1y = cy + outerR * Math.sin(rad(endAngle));
    const s2x = cx + innerR * Math.cos(rad(endAngle));
    const s2y = cy + innerR * Math.sin(rad(endAngle));
    const e2x = cx + innerR * Math.cos(rad(startAngle));
    const e2y = cy + innerR * Math.sin(rad(startAngle));

    paths += `<path d="M ${s1x} ${s1y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${e1x} ${e1y}
       L ${s2x} ${s2y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${e2x} ${e2y} Z"
       fill="${r.color}" />`;
    startAngle = endAngle;
  }

  const donutSvg = `
    <div class="rel-donut-mini">
      <svg viewBox="0 0 ${size} ${size}" width="64" height="64">${paths}</svg>
      <span class="rel-donut-mini-icon">${religions[0].icon}</span>
    </div>
  `;

  // Легенда: многоцветная полоса + подписи
  const barSegs = religions.map(r =>
    `<div class="rel-bar-seg" style="width:${(r.strength * 100).toFixed(1)}%;background:${r.color}" title="${r.name}: ${(r.strength * 100).toFixed(1)}%"></div>`
  ).join('');

  const legendItems = religions.map(r => {
    const pct = (r.strength * 100).toFixed(1);
    const officialMark = r.isOfficial ? ' <span class="rel-official-mark">★</span>' : '';
    // Fervor indicator: визуальные точки (1–5)
    const fervorDots = Math.max(1, Math.min(5, Math.round(r.fervor * 5)));
    const dotsStr = '<span class="rel-fervor-dot lit"></span>'.repeat(fervorDots)
      + '<span class="rel-fervor-dot"></span>'.repeat(5 - fervorDots);

    return `
      <div class="rel-legend-item">
        <span class="culture-dot" style="background:${r.color}"></span>
        <span class="rel-legend-name">${r.icon} ${r.name}${officialMark}</span>
        <span class="rel-legend-pct">${pct}%</span>
        <div class="rel-fervor-bar" title="Рвение: ${(r.fervor * 100).toFixed(0)}%">${dotsStr}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="region-religion-section">
      <div class="section-label">⛪ Религия населения</div>
      <div class="rel-chart-container">
        ${donutSvg}
        <div class="rel-chart-right">
          <div class="rel-multi-bar">${barSegs}</div>
          <div class="rel-legend">${legendItems}</div>
        </div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// СОЦИАЛЬНАЯ СТРУКТУРА РЕГИОНА
// ──────────────────────────────────────────────────────────────

// Пропорции классов по типу местности (нейтральные/чужие регионы)
const _TERRAIN_CLASS_PROFILES = {
  coastal_city:  { farmers_class:0.18, craftsmen_class:0.14, citizens:0.12, sailors_class:0.15,
                   soldiers_class:0.08, slaves_class:0.11, clergy_class:0.05,
                   freedmen:0.07, aristocrats:0.05, officials:0.05 },
  plains:        { farmers_class:0.52, craftsmen_class:0.09, citizens:0.04, sailors_class:0.02,
                   soldiers_class:0.09, slaves_class:0.11, clergy_class:0.04,
                   freedmen:0.06, aristocrats:0.02, officials:0.01 },
  hills:         { farmers_class:0.42, craftsmen_class:0.12, citizens:0.05, sailors_class:0.02,
                   soldiers_class:0.13, slaves_class:0.10, clergy_class:0.04,
                   freedmen:0.09, aristocrats:0.02, officials:0.01 },
  mountains:     { farmers_class:0.30, craftsmen_class:0.10, citizens:0.03, sailors_class:0.01,
                   soldiers_class:0.22, slaves_class:0.09, clergy_class:0.03,
                   freedmen:0.19, aristocrats:0.02, officials:0.01 },
  river_valley:  { farmers_class:0.46, craftsmen_class:0.11, citizens:0.07, sailors_class:0.06,
                   soldiers_class:0.08, slaves_class:0.10, clergy_class:0.04,
                   freedmen:0.05, aristocrats:0.02, officials:0.01 },
};

/**
 * Возвращает объект { classId → population } для заданного региона.
 * Для провинций игрока масштабирует реальные данные нации,
 * для остальных — оценивает по типу местности.
 * @returns {{ classes: {[id]: number}, isReal: boolean }}
 */
function _estimateRegionClasses(gameData) {
  const pop     = gameData.population || 0;
  const terrain = gameData.terrain || gameData.type || 'plains';

  // ── Регион игрока: масштабируем реальные данные нации ──────────────────
  if (gameData.nation === GAME_STATE.player_nation) {
    const nation = GAME_STATE.nations[gameData.nation];
    const sat    = nation?.population?.class_satisfaction;
    const total  = nation?.population?.total || 0;
    if (sat && total > 0) {
      const classes = {};
      for (const [cid, d] of Object.entries(sat)) {
        const v = Math.round(d.population / total * pop);
        if (v >= 10) classes[cid] = { pop: v, satisfaction: d.satisfaction };
      }
      return { classes, isReal: true };
    }
  }

  // ── Оценка по типу местности ────────────────────────────────────────────
  const profile = _TERRAIN_CLASS_PROFILES[terrain] || _TERRAIN_CLASS_PROFILES.plains;
  const classes = {};
  for (const [cid, frac] of Object.entries(profile)) {
    const v = Math.round(frac * pop);
    if (v >= 10) classes[cid] = { pop: v, satisfaction: null };
  }
  return { classes, isReal: false };
}

/** Маленькая SVG-диаграмма Donut для региона (120×120) */
function _buildRegionDonutSVG(slices) {
  if (!slices || slices.length === 0) return '';
  const cx = 52, cy = 52, r = 40, ir = 24;
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return '';

  let paths = '';
  let angle = -Math.PI / 2; // Start from top

  for (const sl of slices) {
    const frac  = sl.value / total;
    const sweep = frac * 2 * Math.PI;
    const x1    = cx + r * Math.cos(angle);
    const y1    = cy + r * Math.sin(angle);
    const x2    = cx + r * Math.cos(angle + sweep);
    const y2    = cy + r * Math.sin(angle + sweep);
    const xi1   = cx + ir * Math.cos(angle);
    const yi1   = cy + ir * Math.sin(angle);
    const xi2   = cx + ir * Math.cos(angle + sweep);
    const yi2   = cy + ir * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;

    paths += `<path d="M ${xi1.toFixed(1)},${yi1.toFixed(1)}
                       L ${x1.toFixed(1)},${y1.toFixed(1)}
                       A ${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}
                       L ${xi2.toFixed(1)},${yi2.toFixed(1)}
                       A ${ir},${ir} 0 ${large} 0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z"
              fill="${sl.color}" opacity="0.9">
              <title>${sl.label}: ${sl.value.toLocaleString()}</title>
            </path>`;
    angle += sweep;
  }

  return `<svg viewBox="0 0 104 104" width="90" height="90" style="flex-shrink:0">
    ${paths}
    <circle cx="${cx}" cy="${cy}" r="${ir - 1}" fill="rgba(14,11,8,.9)"/>
  </svg>`;
}

/** Полоска-индикатор удовлетворённости (только для регионов игрока) */
function _satBar(sat) {
  if (sat === null || sat === undefined) return '';
  const col = sat >= 70 ? '#4CAF50' : sat >= 45 ? '#FF9800' : '#f44336';
  return `<span class="rps-sat" style="--sat:${sat}%;--col:${col}" title="Удовлетворённость: ${sat}%"></span>`;
}

/** Рендерит секцию «Структура общества» для панели региона */
function renderRegionSocialStructure(regionId, gameData) {
  if (!gameData || !gameData.population || gameData.population < 100) return '';

  const { classes, isReal } = _estimateRegionClasses(gameData);
  const entries = Object.entries(classes)
    .sort((a, b) => b[1].pop - a[1].pop)
    .filter(([, d]) => d.pop >= 10);

  if (entries.length === 0) return '';

  const totalClass = entries.reduce((s, [, d]) => s + d.pop, 0);

  // ── Donut slices ──────────────────────────────────────────────
  const slices = entries.map(([cid, d]) => ({
    value: d.pop,
    color: SOCIAL_CLASSES[cid]?.color || '#888',
    label: SOCIAL_CLASSES[cid]?.name || cid,
  }));

  const donutSvg = _buildRegionDonutSVG(slices);

  // ── Composition strip ─────────────────────────────────────────
  const strip = entries.map(([cid, d]) => {
    const pct = (d.pop / totalClass * 100).toFixed(1);
    const col = SOCIAL_CLASSES[cid]?.color || '#888';
    const nm  = SOCIAL_CLASSES[cid]?.name || cid;
    return `<div style="width:${pct}%;background:${col};height:100%"
                 title="${nm}: ${d.pop.toLocaleString()} (${pct}%)"></div>`;
  }).join('');

  // ── Class rows ────────────────────────────────────────────────
  const maxPop = entries[0][1].pop;
  const rows = entries.map(([cid, d]) => {
    const cls    = SOCIAL_CLASSES[cid];
    if (!cls) return '';
    const pct    = (d.pop / totalClass * 100).toFixed(0);
    const barPct = (d.pop / maxPop * 100).toFixed(0);
    const sat    = _satBar(d.satisfaction);
    return `
      <div class="rps-row">
        <span class="rps-ic" style="color:${cls.color}">${cls.icon || '●'}</span>
        <span class="rps-nm">${cls.name}</span>
        <div class="rps-bar-w">
          <div class="rps-bar-f" style="width:${barPct}%;background:${cls.color}33;
               border-right:2px solid ${cls.color}88"></div>
        </div>
        <span class="rps-cnt">${d.pop >= 1000 ? (d.pop / 1000).toFixed(1) + 'к' : d.pop}</span>
        <span class="rps-pct">${pct}%</span>
        ${sat}
      </div>`;
  }).join('');

  const note = isReal
    ? `<div class="rps-note rps-note--real">✦ Реальные данные провинции</div>`
    : `<div class="rps-note">~ Оценка по типу местности</div>`;

  return `
    <div class="region-pop-struct">
      <div class="section-label" style="margin-bottom:8px">👥 Структура общества</div>

      <div class="rps-donut-wrap">
        ${donutSvg}
        <div class="rps-legend">
          ${entries.slice(0, 5).map(([cid, d]) => {
            const cls = SOCIAL_CLASSES[cid];
            const pct = (d.pop / totalClass * 100).toFixed(0);
            return cls ? `<div class="rps-leg-row">
              <span class="rps-leg-dot" style="background:${cls.color}"></span>
              <span class="rps-leg-nm">${cls.name}</span>
              <span class="rps-leg-pct">${pct}%</span>
            </div>` : '';
          }).join('')}
          ${entries.length > 5 ? `<div class="rps-leg-row" style="opacity:.5">
            <span class="rps-leg-nm">+ещё ${entries.length - 5}</span>
          </div>` : ''}
        </div>
      </div>

      <div class="rps-strip">${strip}</div>

      <div class="rps-rows">${rows}</div>

      ${note}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────

// Активная вкладка панели региона: 'info' | 'build'
let _activeRegionTab = 'info';

function switchRegionTab(tab) {
  _activeRegionTab = tab;
  const infoPane  = document.getElementById('region-tab-info');
  const buildPane = document.getElementById('region-tab-build');
  const diplPane  = document.getElementById('region-tab-diplomacy');
  if (infoPane)  infoPane.classList.toggle('hidden', tab !== 'info');
  if (buildPane) buildPane.classList.toggle('hidden', tab !== 'build');
  if (diplPane)  diplPane.classList.toggle('hidden', tab !== 'diplomacy');
  let activeBtn = null;
  document.querySelectorAll('.ri-tab').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('ri-tab--active', isActive);
    if (isActive) activeBtn = b;
  });
  if (activeBtn) updateTabIndicator(activeBtn);
  // Перезапуск fade-in анимации для активного контента
  const activePane = tab === 'info' ? infoPane : tab === 'build' ? buildPane : diplPane;
  if (activePane) {
    activePane.classList.remove('ri-tab-content');
    void activePane.offsetWidth;
    activePane.classList.add('ri-tab-content');
  }
}

/**
 * Шаг 38 — обновляет позицию скользящего индикатора активной вкладки.
 * Принимает кнопку .ri-tab--active и пересчитывает left/width индикатора.
 */
function updateTabIndicator(activeBtn) {
  if (!activeBtn || !activeBtn.parentElement) return;
  const indicator = activeBtn.parentElement.querySelector('.ri-tab-indicator');
  if (!indicator) return;
  indicator.style.left  = activeBtn.offsetLeft  + 'px';
  indicator.style.width = activeBtn.clientWidth + 'px';
}

function showRegionInfo(regionId) {
  const panel = document.getElementById('region-info');
  if (!panel) { console.warn('[showRegionInfo] panel not found'); return; }

  const mapData  = MAP_REGIONS[regionId];
  const gameData = GAME_STATE.regions[regionId];
  if (!mapData || !gameData) return;

  try {
    const nationId    = gameData.nation;
    const nation      = GAME_STATE.nations[nationId];
    const nationName  = nation ? nation.name  : 'Независимые';
    const nationColor = nation ? nation.color : '#A8A898';
    const isPlayer    = nationId === GAME_STATE.player_nation;

    // Шаг 48: уровень разведданных
    const intelLevel = (typeof getIntelLevel === 'function') ? getIntelLevel(regionId) : 2;
    const intelMeta  = (typeof getIntelLabel === 'function') ? getIntelLabel(intelLevel)
                     : { text: 'полная', icon: '🔍', hint: '' };

    // Шаг 48: полные детали только при intelLevel >= 2
    const productionLines = intelLevel >= 2
      ? Object.entries(gameData.production || {}).map(([good, amount]) => {
          const g = GOODS[good];
          return `<span class="prod-item">${g ? g.icon : '📦'} ${g ? g.name : good}: ${Math.round(amount).toLocaleString()}</span>`;
        }).join('')
      : '';

    const buildings = intelLevel >= 2
      ? (gameData.buildings || []).map(b =>
          `<span class="building-tag">🏛 ${b.replace(/_/g, ' ')}</span>`
        ).join('')
      : '';

    // ── Блок культуры ── (только при полной разведке)
    let cultureHtml = '';
    if (intelLevel >= 2) {
      try { cultureHtml = renderRegionCultureBlock(regionId, gameData.population || 0); }
      catch (e) { console.warn('[showRegionInfo] culture block error:', e); }
    }

    // ── Блок религии ──
    let religionHtml = '';
    if (intelLevel >= 2) {
      try {
        if (typeof renderRegionReligionBlock === 'function')
          religionHtml = renderRegionReligionBlock(regionId, gameData.population || 0);
      } catch (e) { console.warn('[showRegionInfo] religion block error:', e); }
    }

    // ── Блок социальной структуры ──
    let socialStructureHtml = '';
    if (intelLevel >= 2) {
      try { socialStructureHtml = renderRegionSocialStructure(regionId, gameData); }
      catch (e) { console.warn('[showRegionInfo] social structure error:', e); }
    }

    // ── Вкладка строительства ──
    let buildTabHtml = '';
    try {
      if (typeof renderConstructionTab === 'function')
        buildTabHtml = renderConstructionTab(regionId);
    } catch (e) { console.warn('[showRegionInfo] build tab error:', e); }

    const curTab = _activeRegionTab;

    // Вкладка дипломатии: форма отправки советника на миссию
    let diplTabHtml = '';
    if (!isPlayer) {
      const chars = (GAME_STATE.nations[GAME_STATE.player_nation]?.characters ?? [])
        .filter(c => c.alive !== false);
      const busyIds = new Set((GAME_STATE.orders ?? []).filter(o => o.status === 'active').map(o => o.assigned_char_id));
      const charOpts = chars.map(c => {
        const busy = busyIds.has(c.id) ? ' (занят)' : '';
        return `<option value="${c.id}"${busyIds.has(c.id) ? ' disabled' : ''}>${c.name}${busy}</option>`;
      }).join('');
      diplTabHtml = `
        <div class="ri-dipl-panel">
          <button class="ri-dipl-overlay-btn" data-action="showDiplomacyOverlay" data-arg="${nationId}">
            🤝 Открыть дипломатическое окно
          </button>
          <div class="ri-dipl-mission-form">
            <div class="ri-dipl-form-title">📜 Отправить дипломатическую миссию</div>
            <label class="ri-dipl-label">Советник</label>
            <select id="ri-dipl-char-sel" class="ri-dipl-sel">${charOpts || '<option value="">— нет персонажей —</option>'}</select>
            <label class="ri-dipl-label">Надзор</label>
            <select id="ri-dipl-oversight-sel" class="ri-dipl-sel">
              <option value="personal">Личный надзор</option>
              <option value="direct" selected>Прямое управление</option>
              <option value="distant">Удалённый контроль</option>
            </select>
            <button class="ri-dipl-send-btn" data-action="sendDiplomaticMissionFromPanel" data-arg="${nationId}|${nationName}">
              Отправить миссию
            </button>
          </div>
        </div>`;
    }

    // ── Ключевые цифры: население, оценка дохода, гарнизон ──
    const popNumRaw   = Math.round(gameData.population || 0);
    const fert        = Math.max(0, Math.min(1, gameData.fertility || 0));
    const garrisonRaw = Math.round(gameData.garrison || 0);
    // Простая оценка дохода региона: pop × fertility × базовая ставка
    const nationTaxRate = (nation?.economy?.tax_rate ?? 0.10);
    const goldPerTurnRaw = Math.round(popNumRaw * fert * nationTaxRate * 0.05);

    // Шаг 48: маскировка значений по уровню разведки
    const popNum    = intelLevel >= 1 ? popNumRaw.toLocaleString() : '???';
    const garrison  = intelLevel >= 2
      ? garrisonRaw.toLocaleString()
      : (intelLevel >= 1 ? roughEstimate(garrisonRaw) : '???');
    const goldPerTurn = intelLevel >= 2
      ? (goldPerTurnRaw >= 0 ? '+' : '') + goldPerTurnRaw.toLocaleString()
      : '—';

    // Цвет прогресс-бара плодородия
    const fertPct   = Math.round(fert * 100);
    const fertColor = fertPct >= 70 ? '#4caf50'
                    : fertPct >= 40 ? '#c9a227'
                    : '#b35a1f';

    // Стабильность/happiness бары (если есть) — только при полной разведке
    let stabilityHtml = '';
    const stability = gameData.stability;
    if (intelLevel >= 2 && typeof stability === 'number') {
      const stabPct   = Math.max(0, Math.min(100, Math.round(stability)));
      const stabColor = stabPct >= 70 ? '#4caf50' : stabPct >= 40 ? '#c9a227' : '#b35a1f';
      stabilityHtml = `
        <div class="ri-bar-row">
          <span class="ri-bar-lbl">🛡 Стабильность</span>
          <div class="ri-bar-track">
            <div class="ri-bar-fill" style="width:${stabPct}%; background:${stabColor}"></div>
          </div>
          <span class="ri-bar-val">${stabPct}%</span>
        </div>`;
    }

    // Кнопки футера
    let footerHtml = '';
    // Шаг 53 (arma.md): кнопка "⚖ Сравнить" — доступна для всех регионов
    const isPinned = (typeof getPinnedRegionId === 'function') && getPinnedRegionId() === regionId;
    const compareBtn = `<button class="ri-action-btn ri-compare-btn${isPinned ? ' ri-compare-active' : ''}" data-region-id="${regionId}" data-action="pinRegionForCompare" data-arg="${regionId}">${isPinned ? '⚖ Сравнивается...' : '⚖ Сравнить'}</button>`;
    if (nationId === GAME_STATE.player_nation) {
      const hasArmy = (GAME_STATE.armies ?? []).some(a =>
        a.position === regionId && a.nation === GAME_STATE.player_nation && a.state !== 'disbanded'
      );
      const selectArmyBtn = hasArmy
        ? `<button class="ri-action-btn" data-action="selectArmyInRegion" data-arg="${regionId}">🛡 Армия</button>`
        : '';
      footerHtml = `
        <div class="ri-footer">
          <button class="ri-action-btn primary" data-action="showAssembleArmyDialog" data-arg="${regionId}" data-action2="closeRegionInfo">⚔ Собрать армию</button>
          <button class="ri-action-btn" data-action="switchRegionTab" data-arg="build">🏗 Построить</button>
          ${selectArmyBtn}
          ${compareBtn}
        </div>`;
    } else {
      footerHtml = `
        <div class="ri-footer">
          ${compareBtn}
        </div>`;
    }

    panel.innerHTML = `
      <div class="region-info-header" style="background: linear-gradient(135deg, ${nationColor}33 0%, rgba(13,10,5,0.0) 60%); border-bottom-color: ${nationColor}66;">
        <div class="ri-nation-stripe" style="background: ${nationColor}"></div>
        <div class="region-info-header-row">
          <span class="region-info-name">${mapData.name}</span>
          <span class="region-info-nation" style="color:${nationColor}">${nationName}</span>
          <button class="region-info-close" data-action="closeRegionInfo">✕</button>
        </div>
      </div>
      <div class="ri-key-stats">
        <div class="ri-key-stat${intelLevel < 1 ? ' ri-stat--hidden' : ''}">
          <span class="ri-key-num">${popNum}</span>
          <span class="ri-key-lbl">👥 Население</span>
        </div>
        <div class="ri-key-stat${intelLevel < 2 ? ' ri-stat--hidden' : ''}">
          <span class="ri-key-num">${goldPerTurn}</span>
          <span class="ri-key-lbl">💰 /ход</span>
        </div>
        <div class="ri-key-stat${intelLevel < 2 ? ' ri-stat--blurred' : ''}">
          <span class="ri-key-num">${garrison}</span>
          <span class="ri-key-lbl">⚔ Гарнизон</span>
        </div>
      </div>
      <div class="ri-intel ri-intel--${intelLevel}" title="${intelMeta.hint}">
        ${intelMeta.icon} Разведка: ${intelMeta.text}
        ${intelLevel < 2 ? `<span class="ri-intel-hint">— ${intelMeta.hint}</span>` : ''}
      </div>
      <div class="ri-tabs">
        <button class="ri-tab${curTab === 'info'  ? ' ri-tab--active' : ''}" data-tab="info"
          data-action="switchRegionTab" data-arg="info">Информация</button>
        <button class="ri-tab${curTab === 'build' ? ' ri-tab--active' : ''}" data-tab="build"
          data-action="switchRegionTab" data-arg="build">${isPlayer ? '🏗 Строительство' : 'Строительство'}</button>
        ${!isPlayer ? `<button class="ri-tab${curTab === 'diplomacy' ? ' ri-tab--active' : ''}" data-tab="diplomacy"
          data-action="switchRegionTab" data-arg="diplomacy">🤝 Дипломатия</button>` : ''}
        <div class="ri-tab-indicator"></div>
      </div>
      <div id="region-tab-info" class="region-info-body ri-tab-content${curTab !== 'info' ? ' hidden' : ''}">
        <div class="region-info-desc">${mapData.description}</div>
        ${intelLevel >= 2 ? `<div class="ri-bar-row">
          <span class="ri-bar-lbl">🌿 Плодородие</span>
          <div class="ri-bar-track">
            <div class="ri-bar-fill" style="width:${fertPct}%; background:${fertColor}"></div>
          </div>
          <span class="ri-bar-val">${fertPct}%</span>
        </div>` : ''}
        ${stabilityHtml}
        <div class="region-stats">
          <div class="region-stat">🏔 Тип: <strong>${getTerrainName(gameData.terrain)}</strong></div>
        </div>
        ${(() => {
          const biome = typeof getRegionBiome === 'function' ? getRegionBiome(regionId) : null;
          if (!biome) return '';
          return `<div><span class="region-biome-badge" style="background:${biome.color}22; border-color:${biome.color}55" title="${biome.description}">${biome.icon} ${biome.name}</span></div>`;
        })()}
        ${cultureHtml}
        ${religionHtml}
        ${socialStructureHtml}
        ${productionLines ? `<div class="region-production"><div class="section-label">Производство:</div>${productionLines}</div>` : ''}
        ${buildings ? `<div class="region-buildings"><div class="section-label">Постройки:</div>${buildings}</div>` : ''}
      </div>
      <div id="region-tab-build" class="region-tab-build ri-tab-content${curTab !== 'build' ? ' hidden' : ''}">
        ${buildTabHtml}
      </div>
      ${!isPlayer ? `<div id="region-tab-diplomacy" class="region-tab-diplomacy ri-tab-content${curTab !== 'diplomacy' ? ' hidden' : ''}">
        ${diplTabHtml}
      </div>` : ''}
      ${footerHtml}
    `;
  } catch (e) {
    console.error('[showRegionInfo] Error:', e);
    panel.innerHTML = `
      <div class="region-info-header">
        <div class="ri-nation-stripe" style="background: #A8A898"></div>
        <div class="region-info-header-row">
          <span class="region-info-name">${mapData.name}</span>
          <button class="region-info-close" data-action="closeRegionInfo">✕</button>
        </div>
      </div>
      <div class="region-info-body">
        <div class="region-stat">👥 Нас.: <strong>${(gameData.population || 0).toLocaleString()}</strong></div>
        <div class="region-stat" style="color:#f44336">Ошибка: ${e.message}</div>
      </div>
    `;
  }

  panel.classList.remove('hidden');
  // Анимация slide-in при появлении
  panel.classList.remove('ri-entering');
  // force reflow, чтобы анимация перезапускалась на повторных кликах
  void panel.offsetWidth;
  panel.classList.add('ri-entering');

  // Шаг 38: позиционируем скользящий индикатор под активной вкладкой
  // после того, как DOM смонтирован (учитываем offsetLeft/clientWidth).
  const activeBtn = panel.querySelector('.ri-tab.ri-tab--active');
  if (activeBtn) updateTabIndicator(activeBtn);
}

function selectArmyInRegion(regionId) {
  const army = (GAME_STATE.armies ?? []).find(a =>
    a.position === regionId && a.nation === GAME_STATE.player_nation && a.state !== 'disbanded');
  if (army && typeof selectArmy === 'function') selectArmy(army.id);
}

function closeRegionInfo() {
  const panel = document.getElementById('region-info');
  if (panel) panel.classList.add('hidden');

  if (selectedRegionId && regionLayers[selectedRegionId]) {
    const gameRegion = GAME_STATE.regions[selectedRegionId];
    const nationId = gameRegion ? gameRegion.nation : MAP_REGIONS[selectedRegionId]?.nation;
    const nation = GAME_STATE.nations[nationId];
    const color = nation ? nation.color : '#A8A898';
    const [origC, occC] = _regionOccupationColors(selectedRegionId);
    const intelLevel = (typeof getIntelLevel === 'function') ? getIntelLevel(selectedRegionId) : 2;
    const origNat = gameRegion?.original_nation ?? null;
    const occNat  = gameRegion?.occupied_by ?? null;
    regionLayers[selectedRegionId].setStyle(
      buildPolygonStyle(color, nationId === GAME_STATE.player_nation, false, origC, occC, intelLevel, nationId, origNat, occNat)
    );
  }
  selectedRegionId = null;
}

/**
 * Отправляет дипломатическую миссию прямо из панели региона.
 */
function sendDiplomaticMissionFromPanel(targetNationId, targetNationName) {
  const charId    = document.getElementById('ri-dipl-char-sel')?.value;
  const oversight = document.getElementById('ri-dipl-oversight-sel')?.value ?? 'direct';

  if (!charId) {
    alert('Выберите советника для миссии.');
    return;
  }
  if (typeof issueOrder !== 'function') {
    alert('Движок приказов не загружен.');
    return;
  }

  const result = issueOrder({
    type:             'diplomatic_mission',
    target_id:        targetNationId,
    target_label:     targetNationName,
    assigned_char_id: charId,
    oversight,
  });

  if (result) {
    // Обновляем панели
    if (typeof renderOrdersPanel === 'function')     renderOrdersPanel();
    if (typeof renderGovernmentOverlay === 'function') {
      // Только если overlay открыт
      const govEl = document.getElementById('government-overlay');
      if (govEl && !govEl.classList.contains('hidden')) renderGovernmentOverlay();
    }
    // Показываем уведомление
    const charName = (GAME_STATE.nations[GAME_STATE.player_nation]?.characters ?? [])
      .find(c => c.id === charId)?.name ?? charId;
    if (typeof addEventLog === 'function')
      addEventLog(`📜 ${charName} отправлен с дипломатической миссией к ${targetNationName}.`, 'info');
    // Переключаемся на вкладку информации
    switchRegionTab('info');
  }
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
  return { width: maxU - minU, height: maxV - minV, cx, cy, minU, maxU };
}

// Возвращает слитые сегменты суши вдоль луча из (cx,cy) в направлении rayAngle
function _landSegmentsAt(cx, cy, rayAngle, pxPolys) {
  const cos = Math.cos(rayAngle), sin = Math.sin(rayAngle);
  const segs = [];
  for (const poly of pxPolys) {
    const xs = [];
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = poly[j].x - cx, ay = poly[j].y - cy;
      const bx = poly[i].x - cx, by = poly[i].y - cy;
      const va = -ax * sin + ay * cos;
      const vb = -bx * sin + by * cos;
      if (va * vb >= 0) continue;
      const f = va / (va - vb);
      xs.push((ax + f * (bx - ax)) * cos + (ay + f * (by - ay)) * sin);
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k < xs.length - 1; k += 2) segs.push({ a: xs[k], b: xs[k + 1] });
  }
  if (!segs.length) return [];
  segs.sort((x, y) => x.a - y.a);
  const m = [{ ...segs[0] }];
  for (let i = 1; i < segs.length; i++) {
    const last = m[m.length - 1];
    if (segs[i].a <= last.b + 1) last.b = Math.max(last.b, segs[i].b);
    else m.push({ ...segs[i] });
  }
  return m;
}

// Ширина суши через точку (обёртка)
function _landWidthThrough(cx, cy, angle, pxPolys) {
  const segs = _landSegmentsAt(cx, cy, angle, pxPolys);
  if (!segs.length) return 0;
  for (const s of segs) { if (s.a <= 0 && s.b >= 0) return s.b - s.a; }
  let best = 0;
  for (const s of segs) { const w = s.b - s.a; if (w > best) best = w; }
  return best;
}

// ── Вычисление «хребта» территории (медиальная ось) ──
// Развёртка перпендикулярных сечений вдоль главной оси, середины сечений → spine
function _computeSpine(refX, refY, angle, pxPolys, uMin, uMax) {
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const perpAngle = angle + Math.PI / 2;
  const perpCos = -sinA, perpSin = cosA;

  const span = uMax - uMin;
  const NUM = Math.min(28, Math.max(10, Math.round(span / 8)));
  const step = span / NUM;
  const raw = [];

  for (let i = 0; i <= NUM; i++) {
    const t = uMin + i * step;
    const sx = refX + cosA * t;
    const sy = refY + sinA * t;

    const segs = _landSegmentsAt(sx, sy, perpAngle, pxPolys);
    if (!segs.length) continue;

    // Ближайший сегмент к главной оси (t=0 перпендикулярно)
    let best = segs[0], bestD = Math.abs((segs[0].a + segs[0].b) / 2);
    for (let k = 1; k < segs.length; k++) {
      const d = Math.abs((segs[k].a + segs[k].b) / 2);
      if (d < bestD) { bestD = d; best = segs[k]; }
    }

    const midV = (best.a + best.b) / 2;
    raw.push({
      x: sx + perpCos * midV,
      y: sy + perpSin * midV,
      w: best.b - best.a
    });
  }

  if (raw.length < 3) return raw;

  // Сглаживание (3 прохода weighted average)
  for (let pass = 0; pass < 3; pass++) {
    const prev = raw.map(p => ({ ...p }));
    for (let i = 1; i < raw.length - 1; i++) {
      raw[i].x = prev[i-1].x * 0.2 + prev[i].x * 0.6 + prev[i+1].x * 0.2;
      raw[i].y = prev[i-1].y * 0.2 + prev[i].y * 0.6 + prev[i+1].y * 0.2;
      raw[i].w = prev[i-1].w * 0.2 + prev[i].w * 0.6 + prev[i+1].w * 0.2;
    }
  }

  // Ограничение кривизны: max ~18° между соседними сегментами
  for (let extra = 0; extra < 4; extra++) {
    let maxDA = 0;
    for (let i = 1; i < raw.length - 1; i++) {
      const a1 = Math.atan2(raw[i].y - raw[i-1].y, raw[i].x - raw[i-1].x);
      const a2 = Math.atan2(raw[i+1].y - raw[i].y, raw[i+1].x - raw[i].x);
      let da = a2 - a1;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > maxDA) maxDA = Math.abs(da);
    }
    if (maxDA < 0.32) break; // < 18°
    const prev = raw.map(p => ({ ...p }));
    for (let i = 1; i < raw.length - 1; i++) {
      raw[i].x = prev[i-1].x * 0.25 + prev[i].x * 0.5 + prev[i+1].x * 0.25;
      raw[i].y = prev[i-1].y * 0.25 + prev[i].y * 0.5 + prev[i+1].y * 0.25;
    }
  }

  return raw;
}

// Catmull-Rom spine → SVG cubic bezier path
function _spineToSVGPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}`
       + ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}`
       + ` ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// Приблизительная длина пути
function _approxPathLen(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
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
      <filter id="nlbl-glow" x="-15%" y="-60%" width="130%" height="220%">
        <feMorphology operator="dilate" radius="1.8" in="SourceAlpha" result="thick"/>
        <feGaussianBlur in="thick" stdDeviation="2.5" result="blur"/>
        <feFlood flood-color="#f5e6c8" flood-opacity="0.50" result="gc"/>
        <feComposite in="gc" in2="blur" operator="in" result="glow"/>
        <feMerge>
          <feMergeNode in="glow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="nlbl-glow-sm" x="-15%" y="-60%" width="130%" height="220%">
        <feMorphology operator="dilate" radius="1" in="SourceAlpha" result="thick"/>
        <feGaussianBlur in="thick" stdDeviation="1.5" result="blur"/>
        <feFlood flood-color="#f5e6c8" flood-opacity="0.40" result="gc"/>
        <feComposite in="gc" in2="blur" operator="in" result="glow"/>
        <feMerge>
          <feMergeNode in="glow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
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
// Curved text вдоль медиальной оси территории (Imperator Rome / EU4 стиль)
//
// uisuper Этап 20 (hot-fix LOD) — фильтры:
//   1) MIN_PX_AREA зависит от zoom (strategic → мягко, detailed → агрессивно)
//   2) Greedy overlap culling: сортировка уже по площади desc, первая
//      принятая рамка «забивает» место, пересекающиеся — отклоняются.
//   3) Экспортируем список принятых AABB в window._nationLabelBBoxes,
//      чтобы renderCityLabels мог избежать наложения на надписи наций.

// Локальный axis-aligned bbox overlap test
function _aabbOverlap(a, b) {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
}

// Экспорт принятых bbox'ов надписей наций (для city label culling)
let _nationLabelBBoxes = [];

function _updateNationLabelVisibility() {
  if (!_nationSvg || !_nationSvgGroup) return;
  _nationSvgGroup.innerHTML = '';
  _nationLabelBBoxes = [];

  // Очищаем старые spine-пути из defs
  const defs = _nationSvg.querySelector('defs');
  for (const el of defs.querySelectorAll('[data-sp]')) el.remove();

  const mapSize  = leafletMap.getSize();
  const FONT_FAM = 'Cinzel, Palatino, Georgia, serif';
  // uisuper Этап 20 (hot-fix LOD): динамический порог площади кластера
  // — на обзорных зумах пропускаем только крупные территории.
  const _z = leafletMap.getZoom();
  const MIN_PX_AREA = _z < 4   ? 9000
                    : _z < 5   ? 4500
                    : _z < 6   ? 2200
                    : _z < 7   ? 900
                    :            450;
  const MIN_FONT = 8;
  // Максимум надписей наций одновременно — защита «в глубину».
  const MAX_NATION_LABELS = _z < 4 ? 12 : _z < 5 ? 22 : _z < 6 ? 32 : 60;
  let spIdx = 0;
  // Список принятых рамок для greedy overlap culling
  const acceptedBBoxes = [];

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
    const span0 = _rotatedSpan(allPts, angle);
    if (span0.height > span0.width) angle += Math.PI / 2;
    while (angle >  Math.PI / 2) angle -= Math.PI;
    while (angle < -Math.PI / 2) angle += Math.PI;

    const rs = _rotatedSpan(allPts, angle);
    if (rs.width < 14 && rs.height < 14) continue;

    // Отбрасываем за экраном
    if (rs.cx < -300 || rs.cx > mapSize.x + 300 ||
        rs.cy < -300 || rs.cy > mapSize.y + 300) continue;

    // ── 3. Вычисляем хребет (медиальную ось) территории ──
    const spine = _computeSpine(rs.cx, rs.cy, angle, pxPolys, rs.minU, rs.maxU);
    if (spine.length < 2) continue;

    // Направление: слева направо; для вертикальных — сверху вниз
    const dx = spine[spine.length-1].x - spine[0].x;
    const dy = spine[spine.length-1].y - spine[0].y;
    if (Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0) spine.reverse();

    const pathLen = _approxPathLen(spine);
    if (pathLen < 20) continue;

    // ── 4. Размер шрифта ──
    // По перпендикулярной ширине суши (медиана по центральной части spine)
    const q = Math.max(1, Math.floor(spine.length * 0.15));
    const midSpine = spine.slice(q, spine.length - q);
    const ws = midSpine.map(p => p.w).sort((a, b) => a - b);
    const medianW = ws[Math.floor(ws.length * 0.35)] || 20;
    const maxFontH = Math.floor(medianW * 0.55);

    // По длине пути
    let fontSize = MIN_FONT;
    while (fontSize < 68) {
      _labelCtx.font = `700 ${fontSize + 1}px ${FONT_FAM}`;
      if (_labelCtx.measureText(d.name).width > pathLen * 0.85) break;
      fontSize++;
    }
    fontSize = Math.max(MIN_FONT, Math.min(68, fontSize, maxFontH));
    if (fontSize < MIN_FONT) continue;

    // ── 5. Динамическая разрядка (letter-spacing) ──
    _labelCtx.font = `700 ${fontSize}px ${FONT_FAM}`;
    const baseW = _labelCtx.measureText(d.name).width;
    const targetW = pathLen * 0.70;
    let spacing = 0;
    if (d.name.length > 1 && targetW > baseW) {
      spacing = (targetW - baseW) / (d.name.length - 1);
    }
    spacing = Math.min(spacing, fontSize * 0.6); // max 0.6em
    const spacingEm = spacing / fontSize;

    // ── 5b. Overlap culling (greedy, AABB) ───────────────────────
    // Центр надписи = середина spine; ширина ≈ baseW + spacing*(n-1);
    // высота ≈ fontSize*1.4. Если новая рамка пересекает уже принятую
    // — пропускаем. Поскольку nationLabelData отсортирован по площади
    // desc, крупные нации «выигрывают» место.
    const _midIdx = Math.floor(spine.length / 2);
    const _midPt  = spine[_midIdx] || { x: rs.cx, y: rs.cy };
    const _labelW = baseW + Math.max(0, spacing * Math.max(0, d.name.length - 1));
    const _labelH = fontSize * 1.4;
    const _bbox = {
      x1: _midPt.x - _labelW / 2 - 4,
      y1: _midPt.y - _labelH / 2 - 2,
      x2: _midPt.x + _labelW / 2 + 4,
      y2: _midPt.y + _labelH / 2 + 2,
    };
    let _overlap = false;
    for (let i = 0; i < acceptedBBoxes.length; i++) {
      if (_aabbOverlap(acceptedBBoxes[i], _bbox)) { _overlap = true; break; }
    }
    if (_overlap) continue;
    if (acceptedBBoxes.length >= MAX_NATION_LABELS) continue;
    acceptedBBoxes.push(_bbox);

    // ── 6. SVG path (spine) + textPath ──
    const pid = `np${spIdx++}`;
    const pathD = _spineToSVGPath(spine);

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.id = pid;
    pathEl.setAttribute('d', pathD);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('data-sp', '1');
    defs.appendChild(pathEl);

    // Текст: тёмно-коричневый, multiply blend, внешнее свечение
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('font-family', FONT_FAM);
    textEl.setAttribute('font-weight', '700');
    textEl.setAttribute('font-size', fontSize.toFixed(1));
    textEl.setAttribute('fill', 'rgba(50, 28, 8, 0.72)');
    textEl.setAttribute('letter-spacing', spacingEm > 0.02 ? `${spacingEm.toFixed(3)}em` : '0.06em');
    textEl.setAttribute('filter', fontSize >= 14 ? 'url(#nlbl-glow)' : 'url(#nlbl-glow-sm)');
    textEl.setAttribute('dy', `${(fontSize * 0.35).toFixed(1)}`);
    textEl.style.mixBlendMode = 'multiply';

    const tpEl = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
    tpEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${pid}`);
    tpEl.setAttribute('href', `#${pid}`);
    tpEl.setAttribute('startOffset', '50%');
    tpEl.setAttribute('text-anchor', 'middle');
    tpEl.textContent = d.name;

    textEl.appendChild(tpEl);
    _nationSvgGroup.appendChild(textEl);
  }

  // Экспортируем принятые рамки для city label culling
  _nationLabelBBoxes = acceptedBBoxes;
  if (typeof window !== 'undefined') window._nationLabelBBoxes = acceptedBBoxes;

  // uisuper Этап 20 (hot-fix LOD): после перерасчёта надписей наций
  // обновляем и видимость подписей столиц (они тоже зависят от zoom
  // и не должны пересекаться с уже принятыми curved-надписями).
  try {
    if (typeof _applyCityLabelVisibility === 'function') {
      _applyCityLabelVisibility();
    }
  } catch (_) { /* noop */ }
}

function scheduleNationLabelUpdate() {
  if (_labelTimerId) clearTimeout(_labelTimerId);
  _labelTimerId = setTimeout(_updateNationLabelVisibility, 80);
}

// ──────────────────────────────────────────────────────────────
// ГОРОДА / СТОЛИЦЫ — uisuper Этап 18
// Помечаем столицы наций мелкими «греческими» подписями Cinzel.
// Столица игрока — увеличенная, золотом; остальные — приглушённые.
//
// uisuper Этап 20 (hot-fix LOD): маркеры хранят метаданные (rank,
// isPlayer, nation name length) и не удаляются при зуме. Видимость
// переключает _applyCityLabelVisibility() — её вызывают из
// _updateNationLabelVisibility (которое уже подписано на zoom/pan).
// Алгоритм:
//   strategic (z<4)      : все столицы скрыты (видны только надписи наций)
//   regional  (4≤z<6)    : топ-N по числу регионов нации + игрок
//   almostDet (6≤z<6.5)  : топ-2N + игрок
//   detailed  (z≥6.5)    : все
// Плюс greedy overlap test против _nationLabelBBoxes — чтобы столица
// не легла поверх curved-надписи нации.
// ──────────────────────────────────────────────────────────────

// Метаданные: { marker, lat, lng, rank, isPlayer, nameLen, name }
let _cityLabelMarkers = [];

function renderCityLabels() {
  if (!leafletMap) return;
  // uisuper hot-fix #2: curved SVG-надписи наций уже «встроены» в
  // территории через _updateNationLabelVisibility. Плавающие divIcon-
  // подписи столиц дублировали имена наций и визуально ложились
  // поверх них («КАРФАГЕН» дважды: curved на Африке + floating
  // прямоугольник). Функция оставлена как no-op для обратной
  // совместимости вызовов из renderAll() / turn.js. При желании
  // её можно вернуть селективно (только для небольших столиц, чьё
  // название не совпадает с nation.name).
  clearCityLabels();
  return;
  // eslint-disable-next-line no-unreachable
  const nations = GAME_STATE?.nations ?? {};
  const playerId = GAME_STATE?.player_nation;

  // Ранг = число регионов нации (больше = важнее)
  const entries = [];
  for (const [nationId, nation] of Object.entries(nations)) {
    if (!nation) continue;
    const capitalRegion = nation.capital_region ?? nation.regions?.[0];
    if (!capitalRegion) continue;
    const md = MAP_REGIONS?.[capitalRegion];
    if (!md || !md.center) continue;

    const isPlayer = nationId === playerId;
    const name     = nation.capital_name || nation.name || nationId;
    const rank     = Array.isArray(nation.regions) ? nation.regions.length : 1;
    entries.push({ nationId, name, md, isPlayer, rank });
  }
  // Крупные нации первыми — для greedy ordering
  entries.sort((a, b) => (b.isPlayer - a.isPlayer) || (b.rank - a.rank));

  for (const e of entries) {
    const cls = 'city-label capital' + (e.isPlayer ? ' player' : '');
    const icon = L.divIcon({
      className: '',
      html: `<div class="${cls}">${_escapeHtml(String(e.name))}</div>`,
      iconSize: null,
      iconAnchor: [0, 0],
    });
    const marker = L.marker(e.md.center, {
      icon,
      interactive: false,
      keyboard:    false,
      zIndexOffset: 800,
    });
    marker.addTo(leafletMap);
    _cityLabelMarkers.push({
      marker,
      lat:     e.md.center[0],
      lng:     e.md.center[1],
      rank:    e.rank,
      isPlayer:e.isPlayer,
      nameLen: String(e.name).length,
      name:    e.name,
    });
  }

  // Применяем LOD-фильтрацию сразу (без ожидания zoom-событий)
  _applyCityLabelVisibility();
}

/**
 * uisuper Этап 20 (hot-fix LOD) — переключает видимость маркеров
 * столиц по текущему zoom и перекрытиям с надписями наций.
 * Вызывается из _updateNationLabelVisibility (после перерасчёта
 * _nationLabelBBoxes) и в конце renderCityLabels.
 */
function _applyCityLabelVisibility() {
  if (!leafletMap || !_cityLabelMarkers.length) return;
  const z = leafletMap.getZoom();

  // Лимит видимых столиц (не считая игрока, он всегда виден если z>=4)
  const maxVisible = z < 4   ? 0
                   : z < 5   ? 6
                   : z < 6   ? 12
                   : z < 6.5 ? 20
                   :           999;
  // На detailed-уровне отключаем overlap-culling полностью — игрок
  // специально приблизил карту, чтобы видеть все столицы.
  const skipOverlap = z >= 6.5;

  // entries уже были отсортированы по (isPlayer, rank desc), но у нас
  // сейчас _cityLabelMarkers в том же порядке.
  let shown = 0;
  // Источник рамок надписей наций — локальная переменная, но для
  // тестов/отладки разрешаем переопределение через window.
  const _srcBBoxes = (typeof window !== 'undefined' && Array.isArray(window._nationLabelBBoxes))
                   ? window._nationLabelBBoxes
                   : _nationLabelBBoxes;
  const acceptedBBoxes = Array.isArray(_srcBBoxes) ? _srcBBoxes.slice() : [];

  for (const meta of _cityLabelMarkers) {
    const m = meta.marker;
    // Переводим lat/lng в пиксели текущего viewport
    let px;
    try {
      px = leafletMap.latLngToContainerPoint([meta.lat, meta.lng]);
    } catch (_) { px = null; }

    let visible = false;

    // Игрок виден всегда (если не strategic) — его мы тоже проверяем
    // на overlap, но при коллизии предпочтём скрыть чужие столицы,
    // а маркер игрока не скрываем — только если z>=4.
    const isPlayerVisible = meta.isPlayer && z >= 4;

    if (px && (isPlayerVisible || shown < maxVisible)) {
      // Приблизительный bbox надписи города: ширина ≈ nameLen*6 (px),
      // высота ≈ 16 (для .city-label.capital). Для игрока увеличиваем.
      const charW = meta.isPlayer ? 9 : 6;
      const labelH = meta.isPlayer ? 22 : 16;
      const labelW = Math.max(24, meta.nameLen * charW);
      const bbox = {
        x1: px.x - labelW / 2 - 2,
        y1: px.y - labelH / 2 - 1,
        x2: px.x + labelW / 2 + 2,
        y2: px.y + labelH / 2 + 1,
      };

      let overlap = false;
      if (!meta.isPlayer && !skipOverlap) {
        // Non-player: отказываем при любом пересечении
        for (let i = 0; i < acceptedBBoxes.length; i++) {
          if (_aabbOverlap(acceptedBBoxes[i], bbox)) { overlap = true; break; }
        }
      }

      if (!overlap) {
        visible = true;
        acceptedBBoxes.push(bbox);
        if (!meta.isPlayer) shown++;
      }
    }

    // Переключаем display стиля root-элемента иконки
    try {
      const el = m.getElement && m.getElement();
      if (el) el.style.display = visible ? '' : 'none';
      else m.setOpacity(visible ? 1 : 0);
    } catch (_) {
      try { m.setOpacity(visible ? 1 : 0); } catch (__) {}
    }
  }
}

function clearCityLabels() {
  if (!leafletMap) { _cityLabelMarkers = []; return; }
  for (const meta of _cityLabelMarkers) {
    const m = meta && meta.marker ? meta.marker : meta;
    try { if (leafletMap.hasLayer(m)) leafletMap.removeLayer(m); } catch (_) {}
  }
  _cityLabelMarkers = [];
}

function _escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Экспорт в window для вызова из turn.js/renderAll
if (typeof window !== 'undefined') {
  window.renderCityLabels          = renderCityLabels;
  window.clearCityLabels           = clearCityLabels;
  window._applyCityLabelVisibility = _applyCityLabelVisibility;
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
// ТОРГОВЫЕ МАРШРУТЫ — ВИЗУАЛИЗАЦИЯ НА КАРТЕ
// ──────────────────────────────────────────────────────────────

// ── Категории товаров для визуализации (Шаг 42) ─────────────
// Определяют класс/цвет SVG-линии торгового маршрута.
const _TRADE_CATEGORY = {
  // Зерно/еда → зелёный
  wheat: 'grain', barley: 'grain', salt: 'grain', fish: 'grain',
  cloth: 'grain', cattle: 'grain', olive_oil: 'grain',
  // Металлы/сырьё → серый
  iron: 'metal', tools: 'metal', timber: 'metal', bronze: 'metal',
  stone: 'metal', marble: 'metal', copper: 'metal', lead: 'metal',
  // Роскошь → фиолетовый
  wine: 'luxury', pottery: 'luxury', silk: 'luxury', gold: 'luxury',
  silver: 'luxury', gems: 'luxury', spices: 'luxury', incense: 'luxury',
  ivory: 'luxury', purple_dye: 'luxury',
};

// Возвращает { category, topGood, volume } — главный товар в экспорте игрока партнёру.
function _classifyTradeRoute(nation) {
  const stockpile = nation?.economy?.stockpile || {};
  const surpluses = Object.entries(stockpile)
    .filter(([, q]) => q > 100)
    .sort(([, a], [, b]) => b - a);
  if (!surpluses.length) {
    return { category: 'general', topGood: null, volume: 0 };
  }
  // Объём = сумма трёх крупнейших избытков (суррогат trade_volume).
  const volume = surpluses.slice(0, 3).reduce((s, [, q]) => s + q, 0);
  // Категория по крупнейшему избытку; если неизвестен — general.
  const [topGood] = surpluses[0];
  const category  = _TRADE_CATEGORY[topGood] || 'general';
  return { category, topGood, volume };
}

function renderTradeRouteLines() {
  clearTradeRouteLines();
  if (!window.GAME_STATE?.nations) return;
  const playerNationId = GAME_STATE.player_nation;
  const playerNation   = GAME_STATE.nations[playerNationId];
  if (!playerNation) return;
  const playerCenter = _getRegionGroupCenter(playerNation.regions || []);
  if (!playerCenter) return;

  const { category, volume } = _classifyTradeRoute(playerNation);
  // Ширина ∝ объёму торговли: weight = 1 + volume/500, капнутая на 6.
  const weight = Math.min(6, Math.max(1.2, 1 + volume / 500));

  for (const partnerId of (playerNation.economy?.trade_routes || [])) {
    const partner = GAME_STATE.nations[partnerId];
    if (!partner) continue;
    const partnerCenter = _getRegionGroupCenter(partner.regions || []);
    if (!partnerCenter) continue;

    // L.polyline с SVG-рендерером → <path class="trade-route-path ..." />.
    // Анимация stroke-dashoffset выполняется через CSS (см. index.html).
    const line = L.polyline([playerCenter, partnerCenter], {
      renderer: svgTradeRenderer,
      weight,
      opacity: 0.75,
      dashArray: '6 8',
      lineCap: 'round',
      className: `trade-route-path ${category}`,
      interactive: true,
    });
    line.bindTooltip(
      _buildRouteTooltip(playerNation, partner, GAME_STATE.market || {}),
      { sticky: true }
    );
    line.addTo(leafletMap);
    tradeRouteLines.push(line);
  }

  if (_hasWorldMarketAccess(playerNation)) {
    const wmLine = L.polyline([playerCenter, [36, 15]], {
      renderer: svgTradeRenderer,
      weight: Math.max(1.5, weight * 0.8),
      opacity: 0.55,
      dashArray: '3 8',
      lineCap: 'round',
      className: 'trade-route-path world',
      interactive: true,
    });
    wmLine.bindTooltip('🌍 Мировой рынок');
    wmLine.addTo(leafletMap);
    tradeRouteLines.push(wmLine);
  }
}

function clearTradeRouteLines() {
  for (const l of tradeRouteLines) {
    if (leafletMap && leafletMap.hasLayer(l)) leafletMap.removeLayer(l);
  }
  tradeRouteLines = [];
}

function _getRegionGroupCenter(regionIds) {
  const centers = regionIds.map(id => MAP_REGIONS[id]?.center).filter(Boolean);
  if (!centers.length) return null;
  return [
    centers.reduce((s,c) => s+c[0], 0) / centers.length,
    centers.reduce((s,c) => s+c[1], 0) / centers.length,
  ];
}

function _estimateRouteIncome(myNation, partner) {
  const treasury = myNation.economy?.treasury || 0;
  return Math.min(treasury * 0.02, 200);
}

function _buildRouteTooltip(myNation, partner, market) {
  // Получить отношения через DiplomacyEngine или legacy
  let relations = 0;
  if (typeof getRelationScore === 'function') {
    relations = getRelationScore(myNation.id, partner.id) || 0;
  } else {
    relations = myNation.relations?.[partner.id]?.score ?? myNation.relations?.[partner.id] ?? 0;
  }
  const tariffRate = relations > 50 ? 0.05 : relations > 0 ? 0.15 : 0.30;

  // Топ-3 товара с избытком
  const surpluses = Object.entries(myNation.economy?.stockpile || {})
    .filter(([,q]) => q > 100)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 3);

  const goodsList = surpluses.map(([good, qty]) => {
    const price  = market[good]?.price || 0;
    const profit = Math.round(qty * 0.05 * price * (1 - tariffRate));
    return `${good}: +${profit} золота`;
  }).join('<br>') || 'нет данных';

  return `<b>🤝 ${partner.name}</b><br>
    Отношения: ${relations > 0 ? '+' : ''}${Math.round(relations)}<br>
    Тариф: ${Math.round(tariffRate*100)}%<br>
    Экспорт:<br>${goodsList}`;
}

function _hasWorldMarketAccess(nation) {
  const hasCoast = (nation.regions||[]).some(rId =>
    MAP_REGIONS[rId]?.terrain === 'coastal_city'
  );
  return hasCoast && (nation.economy?.trade_routes||[]).length > 0;
}

window.renderTradeRouteLines = renderTradeRouteLines;
window.clearTradeRouteLines  = clearTradeRouteLines;

// ──────────────────────────────────────────────────────────────
// ЛЁГКОЕ ОБНОВЛЕНИЕ СТИЛЕЙ (без пересоздания слоёв)
// ──────────────────────────────────────────────────────────────

function refreshRegionStyles() {
  // Шаг 36: очередь повтора для полигонов, которым Canvas-рендерер ещё не
  // успел назначить ._renderer. Race condition: invalidateSize() очищает
  // Canvas уже после того как стили применены, и цвета теряются. Поэтому
  // пропускаем "сырой" слой и планируем повторный вызов через короткий
  // интервал.
  let _hadMissingRenderer = false;

  // Шаг 48: инвалидируем кэш разведки (новый ход / смена владельцев)
  try { invalidateFogIntelCache(); } catch (_) {}

  for (const [regionId, layer] of Object.entries(regionLayers)) {
    const mapData = MAP_REGIONS[regionId];
    // Не-игровые регионы не меняют стиль
    if (mapData && NON_PLAYABLE_TYPES.has(mapData.mapType)) continue;

    // Шаг 36: защита — если у слоя ещё нет внутреннего рендерера,
    // пропускаем и запланируем повтор ниже.
    if (!layer._renderer) {
      _hadMissingRenderer = true;
      continue;
    }

    const gameRegion = GAME_STATE.regions[regionId];
    const nationId = gameRegion ? gameRegion.nation : mapData?.nation;
    const nation = GAME_STATE.nations[nationId];
    const blendColor = (typeof getProvinceBlendColor === 'function')
                       ? getProvinceBlendColor(regionId) : null;
    const color = blendColor ?? (nation ? nation.color : '#A8A898');
    const isPlayer = (nationId === GAME_STATE.player_nation);
    const isSelected = (regionId === selectedRegionId);
    const [origC, occC] = _regionOccupationColors(regionId);
    const intelLevel = getIntelLevel(regionId);
    const origNat = gameRegion?.original_nation ?? null;
    const occNat  = gameRegion?.occupied_by ?? null;
    layer.setStyle(buildPolygonStyle(color, isPlayer, isSelected, origC, occC, intelLevel, nationId, origNat, occNat));

    if (layer.getTooltip && layer.getTooltip()) {
      layer.setTooltipContent(buildTooltipContent(regionId, mapData, nationId));
    }
  }

  // Если часть слоёв не получила рендерер — повторяем через 120мс
  if (_hadMissingRenderer) {
    if (_colorRefreshRetryTimer) clearTimeout(_colorRefreshRetryTimer);
    _colorRefreshRetryTimer = setTimeout(() => {
      _colorRefreshRetryTimer = null;
      if (leafletMap) refreshRegionStyles();
    }, 120);
  }

  // Шаг 48: обновляем слой тумана войны (SVG хэтчинг для intel=0)
  try { refreshFogOverlay(); }
  catch (e) { console.warn('[Шаг 48] refreshFogOverlay', e); }
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
        container.style.background = '#0f1a24';
        container.innerHTML = '<div style="color:#c9a961;padding:20px;text-align:center;padding-top:40px">⚠ Карта недоступна — нет подключения к интернету.<br>Загрузка Leaflet не удалась.</div>';
      }
      return;
    }
    // requestAnimationFrame гарантирует, что контейнер уже имеет размеры в DOM
    requestAnimationFrame(() => {
      try {
        initLeafletMap();
        // invalidateSize корректирует размер Canvas если контейнер изменился.
        // После этого вызываем refreshRegionStyles() НАПРЯМУЮ (без RAF-обёртки),
        // затем ещё раз через 400мс как страховку — это обходит race condition
        // где invalidateSize() очищает Canvas уже после того как RAF с
        // refreshRegionStyles() успел отработать.
        setTimeout(() => {
          if (!leafletMap) return;
          leafletMap.invalidateSize();
          // Первый вызов — сразу после resize
          refreshRegionStyles();
          // Страховочный вызов — после того как Leaflet завершит внутренние RAF
          setTimeout(() => { if (leafletMap) refreshRegionStyles(); }, 400);
          // Шаг 36: третий страховочный вызов — гарантирует корректную
          // окраску даже если layeradd-событие не сработало
          // (Canvas Leaflet завершает внутреннюю перестройку позже 400мс).
          setTimeout(() => { if (leafletMap) refreshRegionStyles(); }, 1200);
        }, 200);
      } catch (e) {
        console.error('Leaflet init error:', e);
      }
    });
  } else {
    // Шаг 36: при повторном вызове renderMap() принудительно обновляем
    // размер Canvas и заново применяем стили — иначе после скрытия/показа
    // карты или ресайза окна полигоны теряют цвет.
    leafletMap.invalidateSize();
    refreshRegionStyles();
    if (showTradeRoutes) { clearTradeRouteLines(); renderTradeRouteLines(); }
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

// ══════════════════════════════════════════════════════════════
// ШАГ 29 — РЕЖИМЫ КАРТЫ (political / economy / military / population)
// ══════════════════════════════════════════════════════════════

window.MAP_MODES        = ['political', 'economy', 'military', 'population'];
window.CURRENT_MAP_MODE = 'political';

/**
 * Линейная интерполяция между двумя hex-цветами.
 * @param {string} fromHex — '#rrggbb'
 * @param {string} toHex   — '#rrggbb'
 * @param {number} t       — 0..1
 */
function _lerpHex(fromHex, toHex, t) {
  const f = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const a = f(fromHex), b = f(toHex);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Квантуем t ∈ [0..1] в k ступеней (0..k-1) и нормализуем обратно в [0..1].
 * Это даёт ровно k видимых градаций тепловой карты.
 */
function _quantize(t, k) {
  if (k <= 1) return 0;
  const i = Math.min(k - 1, Math.floor(t * k));
  return i / (k - 1);
}

/** Прокси "богатства" региона: используется для экономического режима. */
function _computeRegionWealth(rid) {
  const gr = GAME_STATE?.regions?.[rid];
  if (!gr) return 0;
  // Если кто-то позже введёт поле wealth — используем его напрямую.
  if (typeof gr.wealth === 'number') return gr.wealth;
  let w = (gr.fertility ?? 0.5) * ((gr.population ?? 0) / 1000);
  if (Array.isArray(gr.building_slots)) {
    for (const slot of gr.building_slots) w += (slot.level || 1) * 5;
  }
  if (gr.production && typeof gr.production === 'object') {
    for (const k in gr.production) w += (gr.production[k] || 0) * 0.01;
  }
  return w;
}

/** Восстановить "политический" стиль конкретного региона. */
function _restorePoliticalStyle(regionId) {
  const layer = regionLayers[regionId];
  if (!layer) return;
  const mapData    = MAP_REGIONS[regionId];
  if (!mapData) return;
  // Не-игровые (океан и т.п.) — откатываем к их стилям
  if (NON_PLAYABLE_TYPES.has(mapData.mapType)) {
    const style = NON_PLAYABLE_STYLES[mapData.mapType] || NON_PLAYABLE_STYLES.Ocean;
    layer.setStyle(style);
    return;
  }
  const gameRegion = GAME_STATE.regions[regionId];
  const nationId   = gameRegion ? gameRegion.nation : mapData.nation;
  const nation     = GAME_STATE.nations[nationId];
  const blendColor = (typeof getProvinceBlendColor === 'function')
                     ? getProvinceBlendColor(regionId) : null;
  const color        = blendColor ?? (nation ? nation.color : '#A8A898');
  const isPlayer     = (nationId === GAME_STATE.player_nation);
  const isSelected   = (selectedRegionId === regionId);
  const [origC, occC] = _regionOccupationColors(regionId);
  const intelLevel = (typeof getIntelLevel === 'function') ? getIntelLevel(regionId) : 2;
  const origNat = gameRegion?.original_nation ?? null;
  const occNat  = gameRegion?.occupied_by ?? null;
  layer.setStyle(buildPolygonStyle(color, isPlayer, isSelected, origC, occC, intelLevel, nationId, origNat, occNat));
}

// ══════════════════════════════════════════════════════════════
// uisuper.md ЭТАП 20 — РОЗА ВЕТРОВ: логика переключения режимов
// ──────────────────────────────────────────────────────────────
// WindRose — модуль синхронизации визуального состояния лепестков
// SVG-розы (см. разметку в index.html #wind-rose) с текущим
// режимом карты. Вызывается из setMapMode() при каждом
// переключении режима.
const WindRose = {
  _current: 'political',

  // Карта: mode → id лепестка SVG
  PETALS: {
    political:  'wr-political',
    economy:    'wr-economy',
    military:   'wr-military',
    population: 'wr-population',
  },

  /**
   * Установить активный лепесток по режиму карты.
   * @param {'political'|'economy'|'military'|'population'} mode
   */
  setActive(mode) {
    if (!this.PETALS[mode]) return;
    this._current = mode;

    // Снять active со всех лепестков
    const petals = document.querySelectorAll('.wr-petal');
    if (!petals.length) return;
    petals.forEach((p) => p.classList.remove('active'));

    // Активировать нужный
    const petal = document.getElementById(this.PETALS[mode]);
    if (!petal) return;
    petal.classList.add('active');

    // Анимация «пульса» при активации: кратко scale(1.1) → scale(1)
    try {
      petal.style.transition = 'none';
      petal.setAttribute('transform', 'scale(1.1)');
      requestAnimationFrame(() => {
        petal.style.transition = 'fill 0.25s, stroke 0.25s, transform 0.3s';
        petal.setAttribute('transform', 'scale(1)');
      });
    } catch (e) { /* SVG transform может не поддерживаться в тестовой среде */ }
  },
};

// Экспортируем в глобал для доступа из index.html и тестов
window.WindRose = WindRose;

/**
 * ЭТАП 20 (uisuper.md) — инициализация keyboard navigation для
 * лепестков розы ветров. Обрабатывает Enter/Space на focused-лепестке
 * и вызывает setMapMode по data-mode. Вызывается из DOMContentLoaded.
 */
function initWindRoseKeyboard() {
  const petals = document.querySelectorAll('.wr-petal');
  petals.forEach((petal) => {
    if (petal.dataset._wrKbdBound === '1') return;
    petal.dataset._wrKbdBound = '1';
    petal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        const mode = petal.dataset.mode;
        if (mode && typeof setMapMode === 'function') {
          setMapMode(mode);
        }
      }
    });
  });
}
window.initWindRoseKeyboard = initWindRoseKeyboard;

/**
 * Переключает режим отображения карты.
 * @param {'political'|'economy'|'military'|'population'} mode
 */
function setMapMode(mode) {
  if (!window.MAP_MODES.includes(mode)) return;
  window.CURRENT_MAP_MODE = mode;

  // ЭТАП 20 (uisuper.md) — синхронизация розы ветров
  try { WindRose.setActive(mode); } catch (e) { /* noop */ }

  // Синхронизируем состояние кнопок
  const bar = document.getElementById('map-mode-bar');
  if (bar) {
    bar.querySelectorAll('.mm-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  if (!regionLayers || Object.keys(regionLayers).length === 0) return;

  // Собираем id играбельных регионов
  const playableIds = [];
  for (const [rid, md] of Object.entries(MAP_REGIONS)) {
    if (NON_PLAYABLE_TYPES.has(md.mapType)) continue;
    if (!regionLayers[rid]) continue;
    playableIds.push(rid);
  }

  // 1. ПОЛИТИЧЕСКИЙ — восстановить оригинальные стили всех слоёв
  if (mode === 'political') {
    for (const rid of Object.keys(regionLayers)) _restorePoliticalStyle(rid);
    return;
  }

  // 2. ЭКОНОМИКА — тепловая карта по "богатству" (5 градаций)
  if (mode === 'economy') {
    const values = playableIds.map((rid) => _computeRegionWealth(rid));
    const maxV = Math.max(1, ...values);
    for (let i = 0; i < playableIds.length; i++) {
      const rid = playableIds[i];
      const layer = regionLayers[rid];
      const t = _quantize(values[i] / maxV, 5);
      const fill = _lerpHex('#3a2608', '#ffe394', t); // тёмный → светло-жёлтый
      const isSelected = (selectedRegionId === rid);
      layer.setStyle({
        fillColor:   fill,
        fillOpacity: 0.80,
        color:       isSelected ? '#FFD700' : 'rgba(70,50,25,0.45)',
        weight:      isSelected ? 3.0 : 1.0,
        opacity:     1.0,
        dashArray:   null,
      });
    }
    return;
  }

  // 3. ВОЕННЫЙ — регионы с армиями видны, остальные затемнены
  if (mode === 'military') {
    const withArmy = new Set(
      ((GAME_STATE.armies ?? [])
        .filter((a) => a && a.state !== 'disbanded')
        .map((a) => a.position))
    );
    for (const rid of playableIds) {
      const layer = regionLayers[rid];
      if (withArmy.has(rid)) {
        // Восстанавливаем политический стиль для активных регионов
        _restorePoliticalStyle(rid);
      } else {
        layer.setStyle({
          fillOpacity: 0.15,
          opacity:     0.4,
          weight:      1.0,
          color:       'rgba(70,50,25,0.25)',
          dashArray:   null,
        });
      }
    }
    return;
  }

  // 4. НАСЕЛЕНИЕ — от светлого к тёмно-синему
  if (mode === 'population') {
    const values = playableIds.map((rid) => (GAME_STATE.regions[rid]?.population ?? 0));
    const maxV = Math.max(1, ...values);
    for (let i = 0; i < playableIds.length; i++) {
      const rid = playableIds[i];
      const layer = regionLayers[rid];
      const t = _quantize(values[i] / maxV, 5);
      const fill = _lerpHex('#d8e6f2', '#0d3b6b', t); // светлый → тёмно-синий
      const isSelected = (selectedRegionId === rid);
      layer.setStyle({
        fillColor:   fill,
        fillOpacity: 0.80,
        color:       isSelected ? '#FFD700' : 'rgba(70,50,25,0.45)',
        weight:      isSelected ? 3.0 : 1.0,
        opacity:     1.0,
        dashArray:   null,
      });
    }
    return;
  }
}

window.setMapMode = setMapMode;

// ══════════════════════════════════════════════════════════════
// ШАГ 44 (arma.md) — СТРАТЕГИЧЕСКИЕ УРОВНИ ЗУМА
// ──────────────────────────────────────────────────────────────
// Три уровня детализации карты в зависимости от текущего zoom:
//   strategic  (zoom < 4)   — вид сверху: крупные цветные зоны,
//                              скрыт #map-mode-bar, подписи регионов
//                              скрываются, армии уменьшены до 18px.
//   regional   (4 .. 6.5)   — текущий (default) вид.
//   detailed   (zoom > 6.5) — иконки построек на регионах игрока,
//                              числовая численность гарнизона под флагом,
//                              утолщённые торговые маршруты.
//
// Переходы между уровнями — через CSS transitions на соответствующих
// слоях. body получает класс map-zoom-strategic|regional|detailed,
// а всё визуальное поведение завязано на CSS-селекторы по этому классу.
// ══════════════════════════════════════════════════════════════

window.ZOOM_LEVELS = {
  strategic: { max: 4 },
  regional:  { min: 4, max: 6.5 },
  detailed:  { min: 6.5 },
};

/**
 * Определить уровень детализации карты по текущему значению zoom.
 * @param {number} zoom — текущее значение leafletMap.getZoom()
 * @returns {'strategic'|'regional'|'detailed'}
 */
function getZoomLevel(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 'regional';
  if (z < window.ZOOM_LEVELS.strategic.max) return 'strategic';
  if (z > window.ZOOM_LEVELS.detailed.min) return 'detailed';
  return 'regional';
}

/** Текущее состояние уровня зума (избегаем лишних перерисовок). */
let _currentZoomLevel = null;

/** Слой L.layerGroup для иконок построек (детальный вид). */
let _detailBuildingsLayer = null;

/** Слой L.layerGroup для числовой численности гарнизонов (детальный вид). */
let _detailGarrisonsLayer = null;

/**
 * Собрать HTML из списка построек региона в миниатюре.
 * Показываем до 6 иконок построек, по 2 ряда по 3.
 * @param {Array<string|{type?:string,name?:string}>} buildings
 * @returns {string}
 */
function _buildingsMiniHtml(buildings) {
  const ICONS = {
    farm:         '🌾',
    mine:         '⛏',
    quarry:       '🪨',
    workshop:     '🔨',
    temple:       '🏛',
    market:       '🏪',
    port:         '⚓',
    barracks:     '🛡',
    walls:        '🧱',
    fortress:     '🏰',
    aqueduct:     '💧',
    villa:        '🏡',
    latifundium:  '🌽',
    forum:        '⚖',
    granary:      '📦',
    library:      '📚',
  };
  const list = (buildings || []).slice(0, 6);
  if (list.length === 0) return '';
  const cells = list.map((b) => {
    const key = typeof b === 'string' ? b : (b?.type || b?.name || '');
    const icon = ICONS[key] || '🏛';
    return `<span class="zoom-bld-icon" title="${String(key).replace(/_/g, ' ')}">${icon}</span>`;
  }).join('');
  return `<div class="zoom-bld-mini">${cells}</div>`;
}

/**
 * Построить детальный слой иконок построек для регионов игрока.
 * Вызывается при переходе на detailed уровень и при смене nation.
 */
function _buildDetailBuildingsLayer() {
  if (!leafletMap || typeof L === 'undefined') return;
  if (!_detailBuildingsLayer) {
    _detailBuildingsLayer = L.layerGroup();
  } else {
    _detailBuildingsLayer.clearLayers();
  }
  const playerNat = GAME_STATE?.player_nation;
  if (!playerNat) return;

  for (const [rid, gameRegion] of Object.entries(GAME_STATE?.regions ?? {})) {
    if (!gameRegion || gameRegion.nation !== playerNat) continue;
    const layer = regionLayers[rid];
    if (!layer || typeof layer.getCenter !== 'function') continue;

    const buildings = Array.isArray(gameRegion.buildings) ? gameRegion.buildings : [];
    if (buildings.length === 0) continue;

    let center;
    try { center = layer.getCenter(); }
    catch (_) { continue; }
    if (!center) continue;

    const html = _buildingsMiniHtml(buildings);
    if (!html) continue;

    const icon = L.divIcon({
      html,
      className: 'zoom-bld-div',
      iconSize:   [60, 24],
      iconAnchor: [30, 12],
    });
    const m = L.marker([center.lat, center.lng], { icon, interactive: false });
    _detailBuildingsLayer.addLayer(m);
  }
  if (!leafletMap.hasLayer(_detailBuildingsLayer)) {
    _detailBuildingsLayer.addTo(leafletMap);
  }
}

/**
 * Построить слой числовой численности гарнизона (под флагом) для
 * регионов игрока. Показывается только на детальном уровне.
 */
function _buildDetailGarrisonsLayer() {
  if (!leafletMap || typeof L === 'undefined') return;
  if (!_detailGarrisonsLayer) {
    _detailGarrisonsLayer = L.layerGroup();
  } else {
    _detailGarrisonsLayer.clearLayers();
  }
  const playerNat = GAME_STATE?.player_nation;
  if (!playerNat) return;

  for (const [rid, gameRegion] of Object.entries(GAME_STATE?.regions ?? {})) {
    if (!gameRegion || gameRegion.nation !== playerNat) continue;
    const garrison = Number(gameRegion.garrison || gameRegion.garrison_size || 0);
    if (garrison <= 0) continue;
    const layer = regionLayers[rid];
    if (!layer || typeof layer.getCenter !== 'function') continue;
    let center;
    try { center = layer.getCenter(); }
    catch (_) { continue; }
    if (!center) continue;
    const txt = garrison >= 1000 ? (garrison / 1000).toFixed(1) + 'k' : String(garrison);
    const icon = L.divIcon({
      html: `<div class="zoom-garrison-num">⚔ ${txt}</div>`,
      className: 'zoom-garrison-div',
      iconSize:   [48, 18],
      iconAnchor: [24, -8],
    });
    const m = L.marker([center.lat, center.lng], { icon, interactive: false });
    _detailGarrisonsLayer.addLayer(m);
  }
  if (!leafletMap.hasLayer(_detailGarrisonsLayer)) {
    _detailGarrisonsLayer.addTo(leafletMap);
  }
}

/** Удалить оба детальных слоя с карты (при уходе с detailed). */
function _removeDetailLayers() {
  if (_detailBuildingsLayer && leafletMap && leafletMap.hasLayer(_detailBuildingsLayer)) {
    leafletMap.removeLayer(_detailBuildingsLayer);
  }
  if (_detailGarrisonsLayer && leafletMap && leafletMap.hasLayer(_detailGarrisonsLayer)) {
    leafletMap.removeLayer(_detailGarrisonsLayer);
  }
}

/**
 * Обработчик смены зума. Определяет уровень, применяет CSS-класс к
 * <body>, корректирует fillOpacity регионов и показ/скрытие
 * map-mode-bar, детальных слоёв и подписей наций.
 * @param {number} [zoom] — если не передан, берём из leafletMap.getZoom()
 */
function onZoomChange(zoom) {
  if (!leafletMap) return;
  const z = (typeof zoom === 'number') ? zoom : leafletMap.getZoom();
  const level = getZoomLevel(z);
  if (level === _currentZoomLevel) return;
  _currentZoomLevel = level;

  // 1. CSS-класс на body — ВСЕ визуальные правила завязаны через него
  //    (через transition 0.3s для плавных переходов).
  try {
    const body = document.body;
    if (body && body.classList) {
      body.classList.remove('map-zoom-strategic', 'map-zoom-regional', 'map-zoom-detailed');
      body.classList.add('map-zoom-' + level);
    }
  } catch (_) {}

  // 2. #map-mode-bar скрывается на strategic (не нужен на мелком зуме).
  try {
    const bar = document.getElementById('map-mode-bar');
    if (bar) {
      bar.style.opacity    = (level === 'strategic') ? '0' : '1';
      bar.style.pointerEvents = (level === 'strategic') ? 'none' : 'auto';
    }
  } catch (_) {}

  // 3. Регионы: на strategic увеличиваем fillOpacity до 0.85 (цвета
  //    наций становятся ярче). На остальных — возвращаем стандарт.
  //    Реализовано через пере-применение refreshRegionStyles с
  //    внешним множителем.
  _applyZoomFillOpacity(level);

  // 4. Детальный уровень: строим слои иконок построек и гарнизонов.
  //    Иначе — убираем детальные слои с карты.
  if (level === 'detailed') {
    try { _buildDetailBuildingsLayer(); } catch (e) { console.warn('[Шаг 44] detail buildings:', e); }
    try { _buildDetailGarrisonsLayer(); } catch (e) { console.warn('[Шаг 44] detail garrisons:', e); }
  } else {
    _removeDetailLayers();
  }

  // 5. Пересчитать видимость подписей наций — на strategic многие
  //    мелкие подписи скрываются автоматически (по MIN_PX_AREA).
  try { scheduleNationLabelUpdate(); } catch (_) {}
}

/**
 * Применить корректировку fillOpacity регионов в зависимости от
 * уровня зума. На strategic поднимаем opacity до 0.85 (ярче),
 * на остальных — возвращаем default 0.70.
 * @param {'strategic'|'regional'|'detailed'} level
 */
function _applyZoomFillOpacity(level) {
  if (!regionLayers) return;
  const targetOpacity = (level === 'strategic') ? 0.85 : 0.70;
  for (const [regionId, layer] of Object.entries(regionLayers)) {
    const mapData = MAP_REGIONS[regionId];
    if (mapData && NON_PLAYABLE_TYPES.has(mapData.mapType)) continue;
    if (!layer || !layer._renderer) continue;
    // Не перетираем выделенный регион
    if (regionId === selectedRegionId) continue;
    try {
      layer.setStyle({ fillOpacity: targetOpacity });
    } catch (_) {}
  }
}

window.getZoomLevel        = getZoomLevel;
window.onZoomChange        = onZoomChange;
window._applyZoomFillOpacity = _applyZoomFillOpacity;
window._buildDetailBuildingsLayer = _buildDetailBuildingsLayer;
window._buildDetailGarrisonsLayer = _buildDetailGarrisonsLayer;
