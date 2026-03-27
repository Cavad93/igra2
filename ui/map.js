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

    const polygon = L.polygon(coords, {
      ...buildPolygonStyle(color, isPlayerRegion, isSelected, originalColor, occupierColor),
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

/**
 * Стиль полигона региона.
 * @param {string}      color        — цвет нации-владельца
 * @param {boolean}     isPlayerRegion
 * @param {boolean}     isSelected
 * @param {string|null} originalColor  — цвет оригинального владельца (оккупация)
 * @param {string|null} occupierColor  — цвет оккупанта (для границы)
 */
function buildPolygonStyle(color, isPlayerRegion, isSelected, originalColor = null, occupierColor = null) {
  // Оккупированный регион: показываем цвет оригинального владельца (светлее),
  // а толстую штрихованную границу — в цвете захватчика
  if (originalColor && occupierColor && !isSelected) {
    return {
      fillColor:   originalColor,   // оригинальный владелец виден как фон
      fillOpacity: 0.45,            // чуть прозрачнее обычного
      color:       occupierColor,   // граница = цвет захватчика
      weight:      2.5,
      opacity:     1.0,
      dashArray:   '8 4',           // штриховая граница — признак оккупации
    };
  }

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

  // Оккупация
  let occupyStr = '';
  if (gameRegion?.occupied_by && gameRegion?.original_nation) {
    const occNation  = GAME_STATE.nations[gameRegion.occupied_by];
    const origNation = GAME_STATE.nations[gameRegion.original_nation];
    const occColor   = occNation?.color ?? '#f44336';
    occupyStr = `<div class="rt-occupied" style="color:${occColor}">
      ⚔️ Оккупировано: ${occNation?.name ?? gameRegion.occupied_by}
      <span style="color:#8a6e3a">(было: ${origNation?.name ?? gameRegion.original_nation})</span>
    </div>`;
  }

  // Индикатор крепости
  let fortStr = '';
  if ((gameRegion?.fortress_level ?? 0) > 0) {
    const lvl = gameRegion.fortress_level;
    const lvlLabels = ['','Частокол','Деревянные стены','Каменные стены','Цитадель','Неприступная крепость'];
    const conserved = gameRegion.fortress_conserved ? ' (законсервирована)' : '';
    fortStr = `<div class="rt-fort">🏰 ${lvlLabels[lvl] ?? 'Крепость ур.' + lvl}${conserved}</div>`;
  }

  // Блокировка линией крепостей для армии игрока
  let blockStr = '';
  if (typeof _isFortressLineBlocked === 'function' && GAME_STATE.player_nation) {
    if (_isFortressLineBlocked(regionId, GAME_STATE.player_nation)) {
      blockStr = `<div class="rt-blocked">⛔ Заблокировано линией крепостей</div>`;
    }
  }

  return `
    <div class="rt-name">${mapData.name}</div>
    <div class="rt-nation" style="color:${nationColor}">${nationName}</div>
    <div class="rt-pop">👥 ${pop}</div>
    ${occupyStr}${fortStr}${blockStr}
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

  // Снимаем выделение с предыдущего
  if (selectedRegionId && regionLayers[selectedRegionId]) {
    const prev = GAME_STATE.regions[selectedRegionId];
    const prevNationId = prev ? prev.nation : MAP_REGIONS[selectedRegionId]?.nation;
    const prevNation = GAME_STATE.nations[prevNationId];
    const prevColor = prevNation ? prevNation.color : '#A8A898';
    const prevIsPlayer = (prevNationId === GAME_STATE.player_nation);
    const [origC, occC] = _regionOccupationColors(selectedRegionId);
    regionLayers[selectedRegionId].setStyle(buildPolygonStyle(prevColor, prevIsPlayer, false, origC, occC));
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
    const [origC, occC] = _regionOccupationColors(regionId);
    layer.setStyle(buildPolygonStyle(color, isPlayerRegion, false, origC, occC));
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
  document.querySelectorAll('.ri-tab').forEach(b =>
    b.classList.toggle('ri-tab--active', b.dataset.tab === tab)
  );
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

    const productionLines = Object.entries(gameData.production || {}).map(([good, amount]) => {
      const g = GOODS[good];
      return `<span class="prod-item">${g ? g.icon : '📦'} ${g ? g.name : good}: ${Math.round(amount).toLocaleString()}</span>`;
    }).join('');

    const buildings = (gameData.buildings || []).map(b =>
      `<span class="building-tag">🏛 ${b.replace(/_/g, ' ')}</span>`
    ).join('');

    // ── Блок культуры ──
    let cultureHtml = '';
    try { cultureHtml = renderRegionCultureBlock(regionId, gameData.population || 0); }
    catch (e) { console.warn('[showRegionInfo] culture block error:', e); }

    // ── Блок религии ──
    let religionHtml = '';
    try {
      if (typeof renderRegionReligionBlock === 'function')
        religionHtml = renderRegionReligionBlock(regionId, gameData.population || 0);
    } catch (e) { console.warn('[showRegionInfo] religion block error:', e); }

    // ── Блок социальной структуры ──
    let socialStructureHtml = '';
    try { socialStructureHtml = renderRegionSocialStructure(regionId, gameData); }
    catch (e) { console.warn('[showRegionInfo] social structure error:', e); }

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
          <button class="ri-dipl-overlay-btn" onclick="showDiplomacyOverlay('${nationId}')">
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
            <button class="ri-dipl-send-btn" onclick="sendDiplomaticMissionFromPanel('${nationId}', '${nationName}')">
              Отправить миссию
            </button>
          </div>
        </div>`;
    }

    panel.innerHTML = `
      <div class="region-info-header" style="border-left: 4px solid ${nationColor}">
        <span class="region-info-name">${mapData.name}</span>
        <span class="region-info-nation" style="color:${nationColor}">${nationName}</span>
        <button class="region-info-close" onclick="closeRegionInfo()">✕</button>
      </div>
      <div class="ri-tabs">
        <button class="ri-tab${curTab === 'info'  ? ' ri-tab--active' : ''}" data-tab="info"
          onclick="switchRegionTab('info')">Информация</button>
        <button class="ri-tab${curTab === 'build' ? ' ri-tab--active' : ''}" data-tab="build"
          onclick="switchRegionTab('build')">${isPlayer ? '🏗 Строительство' : 'Строительство'}</button>
        ${!isPlayer ? `<button class="ri-tab${curTab === 'diplomacy' ? ' ri-tab--active' : ''}" data-tab="diplomacy"
          onclick="switchRegionTab('diplomacy')">🤝 Дипломатия</button>` : ''}
      </div>
      <div id="region-tab-info" class="region-info-body${curTab !== 'info' ? ' hidden' : ''}">
        <div class="region-info-desc">${mapData.description}</div>
        <div class="region-stats">
          <div class="region-stat">👥 Нас.: <strong>${(gameData.population || 0).toLocaleString()}</strong></div>
          <div class="region-stat">🌿 Плодородие: <strong>${Math.round((gameData.fertility || 0) * 100)}%</strong></div>
          <div class="region-stat">⚔️ Гарнизон: <strong>${(gameData.garrison || 0).toLocaleString()}</strong></div>
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
        ${nationId === GAME_STATE.player_nation ? `
          <div class="region-army-actions" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            <button class="army-btn" onclick="showAssembleArmyDialog('${regionId}');closeRegionInfo();">⚔️ Собрать армию</button>
            ${(GAME_STATE.armies ?? []).some(a => a.position === regionId && a.nation === GAME_STATE.player_nation && a.state !== 'disbanded')
              ? `<button class="army-btn" onclick="selectArmy((GAME_STATE.armies ?? []).find(a => a.position === '${regionId}' && a.nation === GAME_STATE.player_nation && a.state !== 'disbanded')?.id)">🛡 Выбрать армию</button>`
              : ''}
          </div>` : ''}
      </div>
      <div id="region-tab-build" class="region-tab-build${curTab !== 'build' ? ' hidden' : ''}">
        ${buildTabHtml}
      </div>
      ${!isPlayer ? `<div id="region-tab-diplomacy" class="region-tab-diplomacy${curTab !== 'diplomacy' ? ' hidden' : ''}">
        ${diplTabHtml}
      </div>` : ''}
    `;
  } catch (e) {
    console.error('[showRegionInfo] Error:', e);
    panel.innerHTML = `
      <div class="region-info-header">
        <span class="region-info-name">${mapData.name}</span>
        <button class="region-info-close" onclick="closeRegionInfo()">✕</button>
      </div>
      <div class="region-info-body">
        <div class="region-stat">👥 Нас.: <strong>${(gameData.population || 0).toLocaleString()}</strong></div>
        <div class="region-stat" style="color:#f44336">Ошибка: ${e.message}</div>
      </div>
    `;
  }

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
function _updateNationLabelVisibility() {
  if (!_nationSvg || !_nationSvgGroup) return;
  _nationSvgGroup.innerHTML = '';

  // Очищаем старые spine-пути из defs
  const defs = _nationSvg.querySelector('defs');
  for (const el of defs.querySelectorAll('[data-sp]')) el.remove();

  const mapSize  = leafletMap.getSize();
  const FONT_FAM = 'Cinzel, Palatino, Georgia, serif';
  const MIN_PX_AREA = 450;
  const MIN_FONT = 8;
  let spIdx = 0;

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
    const blendColor = (typeof getProvinceBlendColor === 'function')
                       ? getProvinceBlendColor(regionId) : null;
    const color = blendColor ?? (nation ? nation.color : '#A8A898');
    const isPlayer = (nationId === GAME_STATE.player_nation);
    const isSelected = (regionId === selectedRegionId);
    const [origC, occC] = _regionOccupationColors(regionId);
    layer.setStyle(buildPolygonStyle(color, isPlayer, isSelected, origC, occC));

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
        // invalidateSize на случай если контейнер ещё не получил финальный размер.
        // После корректировки размера принудительно обновляем стили регионов —
        // Canvas-рендерер мог нарисовать полигоны в контейнер нулевого размера.
        setTimeout(() => {
          if (leafletMap) {
            leafletMap.invalidateSize();
            requestAnimationFrame(() => refreshRegionStyles());
          }
        }, 150);
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
