// ══════════════════════════════════════════════════════════════════════
// Шаг 50 (arma.md) — Лента событий на карте (Event Feed)
//
// Над регионами всплывают баббл-иконки с текстом описания. В отличие от
// Шага 41 (разовые пульсирующие круги), здесь — непрерывная очередь
// событий: turn.js после каждого хода вызывает addMapEvent(), и они
// поочерёдно, с задержкой, появляются как L.divIcon-маркеры.
//
// API:
//   addMapEvent({ regionId, icon, text, type })
//     regionId — ID региона (window.regionLayers[id].getCenter())
//     icon     — эмодзи или строка (текст в теге <span>)
//     text     — описание справа от иконки
//     type     — опциональный ключ (добавляется как CSS-класс)
//
//   processEventFeedQueue() — ручной запуск (обычно не нужен).
//   clearMapEventFeed()     — очистить очередь и активные маркеры.
//
// Инварианты:
//   • Максимум MAX_ACTIVE_MARKERS (5) одновременно видимых бабблов.
//   • Между появлениями — QUEUE_DELAY_MS (600ms).
//   • Каждый баббл живёт MARKER_LIFETIME_MS (2600ms), CSS-анимация
//     `event-bubble` отрабатывает slideup / видимость / fadeout.
//   • pointer-events: none — бабблы не перехватывают клики по регионам.
// ══════════════════════════════════════════════════════════════════════

  // Константы — согласованы с CSS @keyframes event-bubble (2.6s).
  var MAX_ACTIVE_MARKERS = 5;
  var QUEUE_DELAY_MS     = 600;
  var MARKER_LIFETIME_MS = 2600;

  var _queue        = [];                // FIFO: { regionId, icon, text, type }
  var _active       = [];                // [{ marker, entry, createdAt }]
  var _processorTid = null;

  // ── 1. Публичный API ────────────────────────────────────────────────

  /**
   * Добавить событие в ленту.
   * @param {{regionId:string, icon?:string, text?:string, type?:string}} evt
   */
  export function addMapEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    if (!evt.regionId) return;
    _queue.push({
      regionId: String(evt.regionId),
      icon:     evt.icon != null ? String(evt.icon) : '',
      text:     evt.text != null ? String(evt.text) : '',
      type:     evt.type != null ? String(evt.type) : 'default'
    });
    _scheduleProcess(0);
  }

  /**
   * Ручной запуск обработчика очереди. В обычной работе не нужен —
   * addMapEvent сам запускает цикл.
   */
  export function processEventFeedQueue() {
    _scheduleProcess(0);
  }

  /**
   * Очистить очередь и снять все активные маркеры. Безопасно вызывать
   * при перезагрузке игры / смене карты.
   */
  export function clearMapEventFeed() {
    _queue.length = 0;
    if (_processorTid !== null) {
      try { clearTimeout(_processorTid); } catch (_) {}
      _processorTid = null;
    }
    while (_active.length > 0) {
      _removeActive(_active[0]);
    }
  }

  // ── 2. Обработчик очереди ───────────────────────────────────────────

  function _scheduleProcess(delay) {
    if (_processorTid !== null) return;
    _processorTid = setTimeout(_processTick, delay || 0);
  }

  function _processTick() {
    _processorTid = null;
    if (_queue.length === 0) return;

    // Инвариант: не больше MAX_ACTIVE_MARKERS одновременно.
    if (_active.length >= MAX_ACTIVE_MARKERS) {
      // Ждём освобождения слота. Проверяем через DELAY — если за это
      // время кто-то истёк, появится место. Иначе снова планируем.
      _processorTid = setTimeout(_processTick, QUEUE_DELAY_MS);
      return;
    }

    var entry = _queue.shift();
    _showEventMarker(entry);

    if (_queue.length > 0) {
      _processorTid = setTimeout(_processTick, QUEUE_DELAY_MS);
    }
  }

  // ── 3. Координаты региона ───────────────────────────────────────────

  function _regionLatLng(regionId) {
    if (typeof window.regionLayers !== 'undefined' && regionLayers && window.regionLayers[regionId]) {
      try {
        var c = window.regionLayers[regionId].getCenter();
        if (c && typeof c.lat === 'number') return c;
      } catch (_) {}
    }
    // Fallback: _regionCenter([lat, lon]) из ui/map_armies.js
    if (typeof window._regionCenter === 'function' && typeof L !== 'undefined') {
      var rc = window._regionCenter(regionId);
      if (rc && rc.length >= 2) return L.latLng(rc[0], rc[1]);
    }
    return null;
  }

  // ── 4. HTML-санитайзер (маленький, без внешних зависимостей) ───────

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── 5. Создание L.divIcon маркера ───────────────────────────────────

  function _buildMarkerHtml(entry) {
    var typeClass = 'event-feed-' + _escapeHtml(entry.type || 'default');
    var iconSpan  = entry.icon
      ? '<span class="event-feed-icon">' + _escapeHtml(entry.icon) + '</span>'
      : '';
    var textSpan  = entry.text
      ? '<span class="event-feed-text">' + _escapeHtml(entry.text) + '</span>'
      : '';
    return '<div class="event-feed-marker ' + typeClass + '">' +
             iconSpan + textSpan +
           '</div>';
  }

  function _showEventMarker(entry) {
    if (typeof window.leafletMap === 'undefined' || !window.leafletMap) return;
    if (typeof L === 'undefined') return;

    var latLng = _regionLatLng(entry.regionId);
    if (!latLng) return;

    var icon = L.divIcon({
      className:  'event-feed-divicon',
      html:       _buildMarkerHtml(entry),
      iconSize:   [0, 0],   // фактический размер задаёт содержимое
      iconAnchor: [0, 0]
    });

    var marker;
    try {
      marker = L.marker(latLng, {
        icon:        icon,
        interactive: false,
        keyboard:    false,
        zIndexOffset: 1000
      });
      marker.addTo(window.leafletMap);
    } catch (_) {
      return;
    }

    var active = { marker: marker, entry: entry, createdAt: Date.now() };
    _active.push(active);

    setTimeout(function () { _removeActive(active); }, MARKER_LIFETIME_MS);
  }

  function _removeActive(active) {
    var idx = _active.indexOf(active);
    if (idx >= 0) _active.splice(idx, 1);
    try {
      if (active && active.marker) {
        if (typeof active.marker.remove === 'function') {
          active.marker.remove();
        } else if (typeof window.leafletMap !== 'undefined' && leafletMap &&
                   typeof window.leafletMap.removeLayer === 'function') {
          window.leafletMap.removeLayer(active.marker);
        }
      }
    } catch (_) {}
    // Освободился слот — может быть кто-то в очереди ждёт.
    if (_queue.length > 0) _scheduleProcess(0);
  }

  // ── 6. Отладочные геттеры (для тестов и консоли) ────────────────────

  function _getActiveCount()  { return _active.length; }
  function _getQueueLength()  { return _queue.length; }

  // ── 7. Экспорт ──────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
  }
