// ══════════════════════════════════════════════════════════════════════
// Шаг 51 (arma.md) — Индикаторы действий ИИ-наций
//
// После обработки хода карта показывает что делают AI-нации: над
// регионами появляются маленькие цветные кружки с иконкой действия.
// Карта перестаёт быть «мёртвой» между ходами игрока.
//
// Жизненный цикл:
//   1. В начале processAINations() вызывается clearAIIndicators() —
//      прежние маркеры снимаются с карты, накопленный список очищается.
//   2. Во время обработки AI-решений (engine/turn.js, ai/parser.js)
//      вызывается recordAIAction({ nationId, action, regionId, detail }).
//   3. В конце processAINations() вызывается renderAIIndicators() —
//      создаёт L.marker с L.divIcon для каждого накопленного действия.
//
// Публичный API:
//   recordAIAction(info)              — добавить действие в список
//   renderAIIndicators(actions?)      — отрисовать все накопленные
//                                       (или переданные в аргументе)
//   clearAIIndicators()               — убрать маркеры и очистить список
//   getAIActions()                    — текущий снимок списка (для тестов)
//   getAIActionsCount()               — длина списка
//   getAIIndicatorMarkers()           — число живых L.marker
//
// Инварианты:
//   • Одна запись на (nationId, type, regionId) за ход — дедупликация.
//   • Без regionId и без известного action — запись отбрасывается.
//   • Маркер создаётся как L.divIcon с CSS-классом .ai-indicator,
//     цвет нации задаётся через CSS-переменную --nc.
//   • Tooltip формируется через атрибут title (работает даже без
//     Leaflet tooltip-плагинов).
// ══════════════════════════════════════════════════════════════════════

// ES module

  // ── Карта: action → { type, icon } ────────────────────────────────
  // Тип — канонический ключ группы действия (building / recruiting / …).
  // Иконки — ровно из таблицы Шага 51 в arma.md.
  var ACTION_ICON_MAP = {
    // Строительство
    build:              { type: 'building',   icon: '🏗' },
    fortify:            { type: 'building',   icon: '🏗' },
    // Набор войск
    recruit:            { type: 'recruiting', icon: '⚔' },
    recruit_mercs:      { type: 'recruiting', icon: '⚔' },
    raise_army:         { type: 'recruiting', icon: '⚔' },
    // Торговля
    trade:              { type: 'trade',      icon: '💰' },
    trade_deal:         { type: 'trade',      icon: '💰' },
    set_taxes:          { type: 'trade',      icon: '💰' },
    take_loan:          { type: 'trade',      icon: '💰' },
    // Дипломатия
    diplomacy:          { type: 'diplomacy',  icon: '🤝' },
    form_alliance:      { type: 'diplomacy',  icon: '🤝' },
    seek_peace:         { type: 'diplomacy',  icon: '🤝' },
    armistice:          { type: 'diplomacy',  icon: '🤝' },
    // Война и движение
    declare_war:        { type: 'military',   icon: '⚔' },
    attack:             { type: 'military',   icon: '⚔' },
    move_army:          { type: 'movement',   icon: '→' },
    // Интрига
    counter_conspiracy: { type: 'intrigue',   icon: '🕵' }
  };

  // Русские подписи типов для tooltip.
  var TYPE_LABEL_RU = {
    building:   'строит',
    recruiting: 'набирает войска',
    trade:      'торгует',
    diplomacy:  'дипломатия',
    military:   'военные действия',
    movement:   'двигает армию',
    intrigue:   'контр-шпионаж'
  };

  // Жёсткий лимит — чтобы не захламлять карту при 50+ AI-нациях.
  var MAX_INDICATORS = 50;

  // ── Состояние модуля ──────────────────────────────────────────────
  var _aiActions = []; // [{ nationId, regionId, action, type, icon, detail }]
  var _markers   = []; // L.marker[]

  // ── 1. Публичный API ──────────────────────────────────────────────

  /**
   * Зарегистрировать действие AI-нации.
   * @param {{nationId:string, action:string, regionId?:string, detail?:string}} info
   */
  export function recordAIAction(info) {
    if (!info || typeof info !== 'object') return;
    if (!info.nationId || !info.action) return;
    var mapping = ACTION_ICON_MAP[info.action];
    if (!mapping) return; // неизвестное действие (wait / pass / …) — игнор
    if (!info.regionId) return;

    // Дедуп: одна запись на (nationId, type, regionId) за ход
    for (var i = 0; i < _aiActions.length; i++) {
      var a = _aiActions[i];
      if (a.nationId === info.nationId &&
          a.type     === mapping.type  &&
          a.regionId === info.regionId) {
        return;
      }
    }
    if (_aiActions.length >= MAX_INDICATORS) return;

    _aiActions.push({
      nationId: String(info.nationId),
      regionId: String(info.regionId),
      action:   String(info.action),
      type:     mapping.type,
      icon:     mapping.icon,
      detail:   info.detail != null ? String(info.detail) : ''
    });
  }

  /**
   * Очистить очередь действий и убрать все маркеры с карты.
   * Вызывается в начале processAINations() перед обработкой нового хода.
   */
  export function clearAIIndicators() {
    _aiActions.length = 0;
    _removeAllMarkers();
  }

  /**
   * Отрисовать накопленные действия как маркеры на карте.
   * Если передан массив — он заменит текущий список (режим ручной вставки).
   * @param {Array=} actions
   */
  export function renderAIIndicators(actions) {
    if (actions && typeof actions.length === 'number') {
      // Заменяем текущие действия переданными.
      _aiActions.length = 0;
      for (var k = 0; k < actions.length; k++) {
        recordAIAction(actions[k]);
      }
    }
    // Снимаем старые маркеры, но _aiActions НЕ трогаем.
    _removeAllMarkers();

    if (typeof window.leafletMap === 'undefined' || !window.leafletMap) return;
    if (typeof L === 'undefined') return;

    for (var j = 0; j < _aiActions.length; j++) {
      _createIndicatorMarker(_aiActions[j]);
    }
  }

  // ── 2. Внутреннее ─────────────────────────────────────────────────

  function _removeAllMarkers() {
    while (_markers.length > 0) {
      var m = _markers.pop();
      try {
        if (m && typeof m.remove === 'function') {
          m.remove();
        } else if (typeof window.leafletMap !== 'undefined' && leafletMap &&
                   typeof window.leafletMap.removeLayer === 'function') {
          window.leafletMap.removeLayer(m);
        }
      } catch (_) {}
    }
  }

  function _regionLatLng(regionId) {
    if (typeof window.regionLayers !== 'undefined' && window.regionLayers &&
        window.regionLayers[regionId]) {
      try {
        var c = window.regionLayers[regionId].getCenter();
        if (c && typeof c.lat === 'number') return c;
      } catch (_) {}
    }
    // Fallback: _regionCenter([lat, lon]) из ui/map_armies.js
    if (typeof window._regionCenter === 'function' && typeof L !== 'undefined') {
      try {
        var rc = window._regionCenter(regionId);
        if (rc && rc.length >= 2) return L.latLng(rc[0], rc[1]);
      } catch (_) {}
    }
    return null;
  }

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _nationColor(nationId) {
    if (typeof window.GAME_STATE !== 'undefined' && window.GAME_STATE &&
        window.GAME_STATE.nations && window.GAME_STATE.nations[nationId]) {
      var n = window.GAME_STATE.nations[nationId];
      if (n && n.color) return String(n.color);
    }
    return '#888';
  }

  function _nationName(nationId) {
    if (typeof window.GAME_STATE !== 'undefined' && window.GAME_STATE &&
        window.GAME_STATE.nations && window.GAME_STATE.nations[nationId]) {
      var n = window.GAME_STATE.nations[nationId];
      if (n && n.name) return String(n.name);
    }
    return String(nationId);
  }

  function _regionName(regionId) {
    if (typeof window.MAP_REGIONS !== 'undefined' && window.MAP_REGIONS &&
        window.MAP_REGIONS[regionId] && window.MAP_REGIONS[regionId].name) {
      return String(window.MAP_REGIONS[regionId].name);
    }
    if (typeof window.GAME_STATE !== 'undefined' && window.GAME_STATE &&
        window.GAME_STATE.regions && window.GAME_STATE.regions[regionId]) {
      var r = window.GAME_STATE.regions[regionId];
      if (r && r.name) return String(r.name);
    }
    return String(regionId);
  }

  function _buildTooltip(action) {
    var verb = TYPE_LABEL_RU[action.type] || action.action;
    var detail = action.detail ? ' (' + action.detail + ')' : '';
    return _nationName(action.nationId) + ': ' +
           verb + detail + ' в ' + _regionName(action.regionId);
  }

  function _createIndicatorMarker(action) {
    var latLng = _regionLatLng(action.regionId);
    if (!latLng) return;

    var color   = _nationColor(action.nationId);
    var tooltip = _buildTooltip(action);

    var html =
      '<div class="ai-indicator ai-indicator-' + _escapeHtml(action.type) + '"' +
      ' style="--nc:' + _escapeHtml(color) + '"' +
      ' title="' + _escapeHtml(tooltip) + '"' +
      ' data-nation="' + _escapeHtml(action.nationId) + '"' +
      ' data-action="' + _escapeHtml(action.action) + '">' +
      _escapeHtml(action.icon) +
      '</div>';

    var icon = L.divIcon({
      className:  'ai-indicator-divicon',
      html:       html,
      iconSize:   [20, 20],
      iconAnchor: [10, 10]
    });

    var marker;
    try {
      marker = L.marker(latLng, {
        icon:         icon,
        interactive:  true,
        keyboard:     false,
        zIndexOffset: 900
      });
      marker.addTo(leafletMap);
    } catch (_) {
      return;
    }
    _markers.push(marker);
  }

  // ── 3. Отладочные геттеры (для тестов и консоли) ──────────────────

  export function getAIActions()           { return _aiActions.slice(); }
  export function getAIActionsCount()      { return _aiActions.length; }
  export function getAIIndicatorMarkers()  { return _markers.length; }

  // ── 4. Экспорт ────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window.recordAIAction            = recordAIAction;
    window.renderAIIndicators        = renderAIIndicators;
    window.clearAIIndicators         = clearAIIndicators;
    window.getAIActions              = getAIActions;
    window.getAIActionsCount         = getAIActionsCount;
    window.getAIIndicatorMarkers     = getAIIndicatorMarkers;
    window.AI_INDICATOR_ACTION_MAP   = ACTION_ICON_MAP;
    window.AI_INDICATOR_MAX          = MAX_INDICATORS;
  }
