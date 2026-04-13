// ══════════════════════════════════════════════════════════════════════
// Шаг 41 — Пульсирующие иконки событий на карте
//
// Важные события (восстание, чума, победа, постройка, смерть персонажа,
// урожай) визуально отображаются прямо над регионом-источником в момент
// возникновения. Иконка пульсирует через SVG <animate>, потом исчезает.
//
// API:
//   showMapEvent(regionId, type, duration = 3000)
//     - regionId: ID региона на карте
//     - type:     'revolt' | 'plague' | 'harvest' | 'victory' |
//                 'death'  | 'construction'
//     - duration: время жизни иконки в мс (по умолчанию 3000)
//
// SVG-overlay создаётся внутри контейнера Leaflet-карты (как _nationSvg
// в map.js), позиционирование — через `latLngToContainerPoint`, что
// корректно работает при пане/зуме после обновления на событиях
// `move`/`zoom`.
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Таблица типов событий — иконка + цвет пульсирующего круга.
  // См. arma.md Шаг 41 — таблица иконок событий.
  var EVENT_TYPES = {
    revolt:       { icon: '🔥', color: '#f44336' },
    plague:       { icon: '💀', color: '#9c27b0' },
    harvest:      { icon: '🌾', color: '#4caf50' },
    victory:      { icon: '⭐', color: '#ffd700' },
    death:        { icon: '💔', color: '#607d8b' },
    construction: { icon: '🏛', color: '#2196f3' },
  };

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var _eventSvg     = null;   // <svg> overlay внутри map container
  var _eventGroup   = null;   // <g> с активными событиями
  var _eventEntries = [];     // [{ regionId, group, type, expiresAt }]
  var _repositionRafId = null;

  // ── 1. Создание/восстановление SVG-overlay ──────────────────────────

  function _ensureEventSvg() {
    if (typeof leafletMap === 'undefined' || !leafletMap) return null;
    var container = leafletMap.getContainer();
    if (_eventSvg && container.contains(_eventSvg)) return _eventSvg;

    if (_eventSvg) { try { _eventSvg.remove(); } catch (_) {} }

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'map-event-svg');
    // z-index 650 — выше vector-overlayPane (400/450) и shadowPane (500),
    // ниже tooltipPane (650) и popupPane (700) → не закрывает попапы.
    svg.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:650;overflow:visible;';

    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'map-event-g');
    svg.appendChild(g);

    container.appendChild(svg);
    _eventSvg   = svg;
    _eventGroup = g;

    _bindMapHandlers();
    return svg;
  }

  // Слушатели зум/пана — обновляют координаты активных иконок.
  // Подписка делается ровно один раз (флаг _eventHandlersBound на map).
  function _bindMapHandlers() {
    if (!leafletMap || leafletMap._eventHandlersBound) return;
    leafletMap._eventHandlersBound = true;
    leafletMap.on('zoom move', _scheduleReposition);
    window.addEventListener('resize', _scheduleReposition);
  }

  function _scheduleReposition() {
    if (_repositionRafId) cancelAnimationFrame(_repositionRafId);
    _repositionRafId = requestAnimationFrame(function () {
      _repositionRafId = null;
      _repositionEventSvg();
    });
  }

  // ── 2. Расчёт позиции одной иконки ──────────────────────────────────

  function _regionEventCenter(regionId) {
    if (typeof regionLayers !== 'undefined' &&
        regionLayers && regionLayers[regionId] &&
        typeof regionLayers[regionId].getCenter === 'function') {
      try {
        var c = regionLayers[regionId].getCenter();
        if (c && typeof c.lat === 'number') return c;
      } catch (_) {}
    }
    // Fallback: _regionCenter из ui/map_armies.js → [lat, lon]
    if (typeof _regionCenter === 'function') {
      var rc = _regionCenter(regionId);
      if (rc) return L.latLng(rc[0], rc[1]);
    }
    return null;
  }

  function _latLngToPx(latLng) {
    return leafletMap.latLngToContainerPoint(latLng);
  }

  // ── 3. Создание SVG-группы иконки события ───────────────────────────

  function _buildEventGroup(latLng, def) {
    var pt = _latLngToPx(latLng);
    var x = pt.x;
    var y = pt.y;

    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'map-event-item');

    // Пульсирующий круг — два цикла "вспышки".
    var circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', def.color);
    circle.setAttribute('opacity', '0.8');

    var animR = document.createElementNS(SVG_NS, 'animate');
    animR.setAttribute('attributeName', 'r');
    animR.setAttribute('from', '8');
    animR.setAttribute('to', '24');
    animR.setAttribute('dur', '1s');
    animR.setAttribute('repeatCount', '2');
    circle.appendChild(animR);

    var animO = document.createElementNS(SVG_NS, 'animate');
    animO.setAttribute('attributeName', 'opacity');
    animO.setAttribute('from', '0.8');
    animO.setAttribute('to', '0');
    animO.setAttribute('dur', '1s');
    animO.setAttribute('repeatCount', '2');
    circle.appendChild(animO);

    g.appendChild(circle);

    // Иконка-эмодзи поверх круга.
    var text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '14');
    text.setAttribute('class', 'map-event-icon');
    text.textContent = def.icon;
    g.appendChild(text);

    // Сохраняем ссылки на анимируемые узлы для repositioning.
    g._cx = x;
    g._cy = y;
    g._circle = circle;
    g._text = text;
    return g;
  }

  function _placeGroup(g, latLng) {
    var pt = _latLngToPx(latLng);
    g._cx = pt.x;
    g._cy = pt.y;
    g._circle.setAttribute('cx', pt.x);
    g._circle.setAttribute('cy', pt.y);
    g._text.setAttribute('x', pt.x);
    g._text.setAttribute('y', pt.y);
  }

  function _repositionEventSvg() {
    if (!_eventGroup || _eventEntries.length === 0) return;
    for (var i = 0; i < _eventEntries.length; i++) {
      var e = _eventEntries[i];
      _placeGroup(e.group, e.latLng);
    }
  }

  // ── 4. Публичный API ────────────────────────────────────────────────

  /**
   * Показать пульсирующее событие над регионом.
   * @param {string} regionId
   * @param {string} type      — ключ из EVENT_TYPES
   * @param {number} duration  — мс до удаления (по умолчанию 3000)
   */
  function showMapEvent(regionId, type, duration) {
    if (typeof leafletMap === 'undefined' || !leafletMap) return;
    var def = EVENT_TYPES[type];
    if (!def) {
      console.warn('[map_events] unknown event type:', type);
      return;
    }
    var latLng = _regionEventCenter(regionId);
    if (!latLng) return;

    _ensureEventSvg();
    if (!_eventGroup) return;

    var dur = (typeof duration === 'number' && duration > 0) ? duration : 3000;

    var g = _buildEventGroup(latLng, def);
    _eventGroup.appendChild(g);

    var entry = {
      regionId: regionId,
      type:     type,
      group:    g,
      latLng:   latLng,
      expiresAt: Date.now() + dur,
    };
    _eventEntries.push(entry);

    setTimeout(function () {
      _removeEntry(entry);
    }, dur);
  }

  function _removeEntry(entry) {
    var idx = _eventEntries.indexOf(entry);
    if (idx >= 0) _eventEntries.splice(idx, 1);
    if (entry.group && entry.group.parentNode) {
      try { entry.group.parentNode.removeChild(entry.group); } catch (_) {}
    }
  }

  /**
   * Очистить все активные события (например, при перезагрузке игры).
   */
  function clearMapEvents() {
    while (_eventEntries.length > 0) _removeEntry(_eventEntries[0]);
  }

  // Экспорт
  if (typeof window !== 'undefined') {
    window.showMapEvent      = showMapEvent;
    window.clearMapEvents    = clearMapEvents;
    window.MAP_EVENT_TYPES   = EVENT_TYPES;
  }
})();
