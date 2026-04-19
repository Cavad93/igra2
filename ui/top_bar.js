/* ───────────────────────────────────────────────────────────
   top_bar.js — обработчики кнопок верхнего ряда и вспомогательных
   окон: настройки, горячие клавиши, контекстное меню,
   переключение режимов карты, алерты, модалки, поиск.
   Рефакторинг Части II, этап 41 (uisuper.md).
   ─────────────────────────────────────────────────────────── */
  // ──────────────────────────────────────────
  // Модал настроек (⚙)
  // ──────────────────────────────────────────
  export function toggleSettingsModal() {
    var modal = document.getElementById('settings-modal');
    if (!modal) return;
    if (modal.classList.contains('open')) {
      closeSettingsModal();
    } else {
      openSettingsModal();
    }
  }
  export function openSettingsModal() {
    var modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('open');
    if (typeof window._updateInlineKeyStatus === 'function') window._updateInlineKeyStatus();
  }
  export function closeSettingsModal() {
    var modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('open');
  }
  export function switchSettingsTab(name) {
    var modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.querySelectorAll('.sm-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-sm-tab') === name);
    });
    modal.querySelectorAll('.sm-tab-pane').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sm-pane') === name);
    });
  }


  // ──────────────────────────────────────────
  // Горячие клавиши — вспомогательные
  // ──────────────────────────────────────────
  export function switchLeftTab(tabName) {
    if (typeof window.renderLeftPanelTab === 'function') {
      window.renderLeftPanelTab(tabName);
    }
  }

  export function focusCommandInput() {
    var inp = document.getElementById('command-input');
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
    }
  }

  var _alertCycleIdx = -1;
  export function focusNextAlert() {
    var badges = Array.from(document.querySelectorAll('#left-nav .lnav-badge'))
      .filter(function (b) { return b && b.style.display !== 'none'; });
    if (badges.length === 0) return false;
    _alertCycleIdx = (_alertCycleIdx + 1) % badges.length;
    var badge = badges[_alertCycleIdx];
    var btn = badge.closest('.lnav-btn');
    if (btn) {
      var tab = btn.getAttribute('data-tab');
      if (tab) switchLeftTab(tab);
      btn.focus();
    }
    return true;
  }

  export function closeTopModal() {
    if (typeof window.isDiploGraphOpen === 'function' && window.isDiploGraphOpen()) {
      window.closeDiploGraph();
      return true;
    }
    if (typeof window.isSearchOpen === 'function' && window.isSearchOpen()) {
      window.closeSearchPanel();
      return true;
    }
    var sm = document.getElementById('settings-modal');
    if (sm && sm.classList.contains('open')) {
      closeSettingsModal();
      return true;
    }
    if (typeof window.closeCharacterDetail === 'function') {
      var co = document.getElementById('char-overlay');
      if (co && co.classList && co.classList.contains('open')) {
        window.closeCharacterDetail();
        return true;
      }
    }
    var votingOverlay = document.getElementById('voting-overlay');
    if (votingOverlay && votingOverlay.style.display && votingOverlay.style.display !== 'none') {
      votingOverlay.style.display = 'none';
      return true;
    }
    if (typeof window.closeRegionInfo === 'function') {
      window.closeRegionInfo();
    }
    var op = document.getElementById('orders-panel');
    if (op && !op.classList.contains('closed')) {
      if (typeof window.toggleOrdersMini === 'function') window.toggleOrdersMini();
      return true;
    }
    return false;
  }

  export function cycleMapMode() {
    if (typeof window.setMapMode === 'function' && Array.isArray(window.MAP_MODES)) {
      var modes = window.MAP_MODES;
      var cur = window.CURRENT_MAP_MODE || modes[0];
      var i = modes.indexOf(cur);
      var next = modes[(i + 1) % modes.length];
      window.setMapMode(next);
      return;
    }
    if (typeof window.showToast === 'function') {
      window.showToast('Режимы карты будут добавлены в Шаге 29', 'info');
    }
  }

  // ──────────────────────────────────────────
  // Главный обработчик горячих клавиш
  // ──────────────────────────────────────────
  export function onHotkey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var t = e.target;
    if (t) {
      var tag = (t.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
        if (e.key === 'Escape') { try { t.blur(); } catch (err) {} }
        return;
      }
    }
    var key = e.key;
    if (key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      if (typeof window.processTurn === 'function') window.processTurn();
      return;
    }
    if (key === 'Escape') { closeTopModal(); return; }
    if (key === 'Tab') {
      var badges = document.querySelectorAll('#left-nav .lnav-badge');
      var hasVisible = false;
      badges.forEach(function (b) { if (b.style.display !== 'none') hasVisible = true; });
      if (hasVisible) { e.preventDefault(); focusNextAlert(); }
      return;
    }
    if (key === '/') {
      e.preventDefault();
      if (typeof window.toggleSearchPanel === 'function') window.toggleSearchPanel();
      else if (typeof focusCommandInput === 'function') focusCommandInput();
      return;
    }
    if (key === '[') {
      e.preventDefault();
      if (typeof window.toggleDiptych === 'function') window.toggleDiptych();
      return;
    }
    var k = key.length === 1 ? key.toLowerCase() : key;
    switch (k) {
      case 'e': e.preventDefault(); switchLeftTab('economy'); break;
      case 'd': e.preventDefault(); switchLeftTab('diplomacy'); break;
      case 'a': e.preventDefault(); switchLeftTab('army'); break;
      case 'm': e.preventDefault(); cycleMapMode(); break;
      case '1': e.preventDefault(); if (typeof window.setMapMode === 'function') window.setMapMode('political'); break;
      case '2': e.preventDefault(); if (typeof window.setMapMode === 'function') window.setMapMode('economy'); break;
      case '3': e.preventDefault(); if (typeof window.setMapMode === 'function') window.setMapMode('military'); break;
      case '4': e.preventDefault(); if (typeof window.setMapMode === 'function') window.setMapMode('population'); break;
    }
  }

  document.addEventListener('keydown', onHotkey);


  // ══════════════════════════════════════════════════
  // КОНТЕКСТНОЕ МЕНЮ ПРАВОЙ КНОПКИ МЫШИ
  // ══════════════════════════════════════════════════
  function _buildCtxMenuItems(regionId) {
    var items = [];
    var gs = window.GAME_STATE || null;
    var mr = (typeof window.MAP_REGIONS !== 'undefined') ? MAP_REGIONS : null;
    var region = gs && gs.regions && gs.regions[regionId] ? gs.regions[regionId] : null;
    var mapData = mr && mr[regionId] ? mr[regionId] : null;
    var playerId = gs ? gs.player_nation : undefined;
    var ownerId  = region ? region.nation : (mapData ? mapData.nation : undefined);
    var isOwn    = (ownerId && ownerId === playerId);
    var isForeign = (ownerId && ownerId !== playerId);

    items.push({
      label: 'Подробности', icon: 'laws',
      action: function () {
        if (typeof window.onRegionClick === 'function') window.onRegionClick(regionId);
        else if (typeof window.showRegionInfo === 'function') window.showRegionInfo(regionId);
      }
    });

    if (isForeign) {
      var armies = Array.isArray(gs && gs.armies) ? gs.armies : [];
      var hasArmyNear = armies.some(function (a) {
        if (!a || a.nation !== playerId) return false;
        if (a.state === 'disbanded') return false;
        if (a.position === regionId) return true;
        var neigh = (mr && mr[a.position] && mr[a.position].neighbors) || (region && region.neighbors) || [];
        return Array.isArray(neigh) && neigh.includes(regionId);
      });
      if (hasArmyNear) {
        items.push({
          label: 'Атаковать', icon: 'army',
          action: function () {
            if (typeof window.onRegionClick === 'function') window.onRegionClick(regionId);
            if (typeof window.showToast === 'function') window.showToast('Выберите армию и цель для атаки', 'info');
          }
        });
      }
      var myNation  = gs && gs.nations && gs.nations[playerId] ? gs.nations[playerId] : null;
      var atWarList = myNation && myNation.military && myNation.military.at_war_with ? myNation.military.at_war_with : [];
      var atWar     = Array.isArray(atWarList) && atWarList.includes(ownerId);
      if (!atWar) {
        items.push({
          label: 'Предложить союз', icon: 'diplomacy',
          action: function () {
            if (typeof switchLeftTab === 'function') switchLeftTab('diplomacy');
            if (typeof window.showToast === 'function') {
              var nn = gs && gs.nations && gs.nations[ownerId] ? (gs.nations[ownerId].name || ownerId) : ownerId;
              window.showToast('Дипломатия: ' + nn, 'info');
            }
          }
        });
      }
    }

    if (isOwn) {
      items.push({ sep: true });
      items.push({
        label: 'Построить', icon: 'court',
        action: function () {
          if (typeof window.onRegionClick === 'function') window.onRegionClick(regionId);
          if (typeof window.switchRegionTab === 'function') window.switchRegionTab('build');
        }
      });
      items.push({
        label: 'Управление', icon: 'orders',
        action: function () {
          if (typeof window.onRegionClick === 'function') window.onRegionClick(regionId);
        }
      });
    }
    return items;
  }

  export function showContextMenu(x, y, regionOrId) {
    var menu = document.getElementById('ctx-menu');
    if (!menu) return;
    var regionId = (typeof regionOrId === 'string')
      ? regionOrId
      : (regionOrId && (regionOrId.id || regionOrId.regionId)) || null;
    if (!regionId) return;
    var items = _buildCtxMenuItems(regionId);
    if (!items.length) { closeCtxMenu(); return; }
    menu.innerHTML = '';
    items.forEach(function (it, idx) {
      if (it.sep) {
        var sep = document.createElement('div');
        sep.className = 'ctx-separator';
        menu.appendChild(sep);
        return;
      }
      var el = document.createElement('div');
      el.className = 'ctx-item';
      el.setAttribute('data-ctx-idx', String(idx));
      var iconSvg = (window.icon && typeof it.icon === 'string') ? window.icon(it.icon) : '';
      el.innerHTML = '<span class="ctx-icon icon-wrap">' + (iconSvg || (it.icon || '')) + '</span><span class="ctx-label">' + it.label + '</span>';
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        try { it.action && it.action(); }
        catch (e) { console.warn('[ctx-menu] action error:', e); }
        closeCtxMenu();
      });
      menu.appendChild(el);
    });
    menu.style.left = '-9999px';
    menu.style.top  = '-9999px';
    menu.style.display = 'block';
    var vw = window.innerWidth  || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var rect = menu.getBoundingClientRect();
    var w = rect.width  || 160;
    var h = rect.height || 40;
    var left = x;
    var top  = y;
    if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
    if (top  + h > vh - 4) top  = Math.max(4, vh - h - 4);
    if (left < 4) left = 4;
    if (top  < 4) top  = 4;
    menu.style.left = left + 'px';
    menu.style.top  = top  + 'px';
  }

  export function closeCtxMenu() {
    var menu = document.getElementById('ctx-menu');
    if (menu) menu.style.display = 'none';
  }

  // Закрытие контекстного меню по клику/правому клику вне/Esc
  document.addEventListener('click', function (e) {
    var menu = document.getElementById('ctx-menu');
    if (!menu || menu.style.display !== 'block') return;
    if (e.target && menu.contains(e.target)) return;
    closeCtxMenu();
  });
  document.addEventListener('contextmenu', function (e) {
    var menu = document.getElementById('ctx-menu');
    if (!menu || menu.style.display !== 'block') return;
    if (e.target && menu.contains(e.target)) return;
    closeCtxMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var menu = document.getElementById('ctx-menu');
      if (menu && menu.style.display === 'block') closeCtxMenu();
    }
  });


  // ──────────────────────────────────────────
  // Поиск по игре
  // ──────────────────────────────────────────
  (function initSearch() {
    var _debounceTimer = null;
    var _activeIdx = -1;
    var _flatResults = [];
    var _outsideHandler = null;

    function _panel()   { return document.getElementById('search-panel'); }
    function _input()   { return document.getElementById('search-input'); }
    function _results() { return document.getElementById('search-results'); }

    function isSearchOpen() {
      var p = _panel();
      return !!(p && !p.classList.contains('hidden'));
    }

    function openSearchPanel() {
      var p = _panel();
      if (!p) return;
      p.classList.remove('hidden');
      var inp = _input();
      if (inp) { inp.value = ''; inp.focus(); inp.select(); }
      _results().innerHTML = '';
      _flatResults = [];
      _activeIdx = -1;
      setTimeout(function () {
        _outsideHandler = function (e) {
          var panel = _panel();
          var btn   = document.getElementById('search-btn');
          if (!panel || panel.classList.contains('hidden')) return;
          if (panel.contains(e.target)) return;
          if (btn && btn.contains(e.target)) return;
          closeSearchPanel();
        };
        document.addEventListener('mousedown', _outsideHandler, true);
      }, 0);
    }

    function closeSearchPanel() {
      var p = _panel();
      if (!p) return;
      p.classList.add('hidden');
      if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
      if (_outsideHandler) {
        document.removeEventListener('mousedown', _outsideHandler, true);
        _outsideHandler = null;
      }
      _activeIdx = -1;
      _flatResults = [];
    }

    function toggleSearchPanel() {
      if (isSearchOpen()) closeSearchPanel();
      else                openSearchPanel();
    }

    function _esc(s) {
      return String(s).replace(/[&<>"']/g, function (ch) {
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
      });
    }

    function _matches(name, q) {
      if (!name) return false;
      return name.toLowerCase().indexOf(q) !== -1;
    }

    function performSearch(query) {
      var q = (query || '').trim().toLowerCase();
      if (!q) return { regions: [], nations: [], characters: [] };
      var gs = window.GAME_STATE || null;
      var regions = [];
      var nations = [];
      var characters = [];
      try {
        var seen = new Set();
        if (gs && gs.regions) {
          for (var id in gs.regions) {
            var r = gs.regions[id];
            if (!r) continue;
            var name = r.name || id;
            if (_matches(name, q)) {
              regions.push({ type: 'region', id: id, label: name, sub: r.nation || '' });
              seen.add(id);
            }
          }
        }
        if (typeof window.MAP_REGIONS !== 'undefined' && MAP_REGIONS) {
          for (var id2 in MAP_REGIONS) {
            if (seen.has(id2)) continue;
            var md = window.MAP_REGIONS[id2];
            if (!md) continue;
            var name2 = md.name || id2;
            if (_matches(name2, q)) {
              regions.push({ type: 'region', id: id2, label: name2, sub: md.nation || '' });
            }
          }
        }
      } catch(_) {}
      try {
        if (gs && gs.nations) {
          for (var nid in gs.nations) {
            var n = gs.nations[nid];
            if (!n) continue;
            var nname = n.name || nid;
            if (_matches(nname, q)) {
              nations.push({ type: 'nation', id: nid, label: nname, sub: '' });
            }
          }
        }
      } catch(_) {}
      try {
        if (gs && gs.nations) {
          for (var nid2 in gs.nations) {
            var n2 = gs.nations[nid2];
            if (!n2 || !Array.isArray(n2.characters)) continue;
            for (var ci = 0; ci < n2.characters.length; ci++) {
              var c = n2.characters[ci];
              if (!c || !c.name) continue;
              if (c.alive === false) continue;
              if (_matches(c.name, q)) {
                var sub = n2.name || nid2;
                characters.push({ type: 'character', id: c.id, nationId: nid2, label: c.name, sub: sub });
              }
            }
          }
        }
      } catch(_) {}
      return { regions: regions, nations: nations, characters: characters };
    }

    function renderSearchResults(groups) {
      var out = _results();
      if (!out) return;
      var totalCount = groups.regions.length + groups.nations.length + groups.characters.length;
      if (totalCount === 0) {
        out.innerHTML = '<div class="sr-empty">Ничего не найдено</div>';
        _flatResults = [];
        _activeIdx = -1;
        return;
      }
      var MAX = 8;
      var rTake = groups.regions.length;
      var nTake = groups.nations.length;
      var cTake = groups.characters.length;
      while (rTake + nTake + cTake > MAX) {
        if (rTake >= nTake && rTake >= cTake && rTake > 0) rTake--;
        else if (nTake >= cTake && nTake > 0) nTake--;
        else if (cTake > 0) cTake--;
        else break;
      }
      var parts = [];
      _flatResults = [];
      var _svg = function (name) { return window.icon ? window.icon(name) : ''; };
      if (rTake > 0) {
        parts.push('<div class="sr-group-title"><span class="icon-wrap">'+_svg('overview')+'</span> Регионы</div>');
        for (var i = 0; i < rTake; i++) {
          var it = groups.regions[i];
          var idx = _flatResults.length;
          _flatResults.push(it);
          parts.push('<div class="sr-item" data-idx="'+idx+'"><span class="sr-icon icon-wrap">'+_svg('overview')+'</span><span class="sr-label">'+_esc(it.label)+'</span>'+(it.sub ? '<span class="sr-sub">'+_esc(it.sub)+'</span>' : '')+'</div>');
        }
      }
      if (nTake > 0) {
        parts.push('<div class="sr-group-title"><span class="icon-wrap">'+_svg('diplomacy')+'</span> Нации</div>');
        for (var i2 = 0; i2 < nTake; i2++) {
          var it2 = groups.nations[i2];
          var idx2 = _flatResults.length;
          _flatResults.push(it2);
          parts.push('<div class="sr-item" data-idx="'+idx2+'"><span class="sr-icon icon-wrap">'+_svg('diplomacy')+'</span><span class="sr-label">'+_esc(it2.label)+'</span></div>');
        }
      }
      if (cTake > 0) {
        parts.push('<div class="sr-group-title"><span class="icon-wrap">'+_svg('population')+'</span> Персонажи</div>');
        for (var i3 = 0; i3 < cTake; i3++) {
          var it3 = groups.characters[i3];
          var idx3 = _flatResults.length;
          _flatResults.push(it3);
          parts.push('<div class="sr-item" data-idx="'+idx3+'"><span class="sr-icon icon-wrap">'+_svg('population')+'</span><span class="sr-label">'+_esc(it3.label)+'</span>'+(it3.sub ? '<span class="sr-sub">'+_esc(it3.sub)+'</span>' : '')+'</div>');
        }
      }
      out.innerHTML = parts.join('');
      _activeIdx = _flatResults.length ? 0 : -1;
      _updateActiveClass();
      out.querySelectorAll('.sr-item').forEach(function (el) {
        el.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          var idx4 = parseInt(el.getAttribute('data-idx'), 10);
          if (!isNaN(idx4)) goToSearchResult(idx4);
        });
      });
    }

    function _updateActiveClass() {
      var out = _results();
      if (!out) return;
      out.querySelectorAll('.sr-item').forEach(function (el) { el.classList.remove('active'); });
      if (_activeIdx < 0) return;
      var cur = out.querySelector('.sr-item[data-idx="'+_activeIdx+'"]');
      if (cur) {
        cur.classList.add('active');
        try { cur.scrollIntoView({ block: 'nearest' }); } catch(_) {}
      }
    }

    function onSearchInput(query) {
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(function () {
        var groups = performSearch(query);
        renderSearchResults(groups);
      }, 150);
    }

    function goToSearchResult(idx) {
      var it = _flatResults[idx];
      if (!it) return;
      if (it.type === 'region')    _goToRegion(it.id);
      else if (it.type === 'nation')    _goToNation(it.id);
      else if (it.type === 'character') _goToCharacter(it.id, it.nationId);
      closeSearchPanel();
    }

    function _goToRegion(regionId) {
      try {
        var md = (typeof window.MAP_REGIONS !== 'undefined') ? window.MAP_REGIONS[regionId] : null;
        if (md && md.center && typeof window.window.leafletMap !== 'undefined' && window.leafletMap) {
          var zoom = Math.max(window.leafletMap.getZoom() || 5, 6);
          window.leafletMap.flyTo([md.center[0], md.center[1]], zoom, { duration: 0.6 });
        }
      } catch(_) {}
      try {
        if (typeof window.onRegionClick === 'function') window.onRegionClick(regionId);
        else if (typeof window.showRegionInfo === 'function') window.showRegionInfo(regionId);
      } catch(_) {}
    }

    function _goToNation(nationId) {
      try {
        var gs = window.GAME_STATE || null;
        var ids = [];
        if (gs && gs.regions) {
          for (var rid in gs.regions) {
            var r = gs.regions[rid];
            if (r && r.nation === nationId) ids.push(rid);
          }
        }
        if (ids.length && typeof window.MAP_REGIONS !== 'undefined' && typeof window.window.leafletMap !== 'undefined' && window.leafletMap) {
          var sumLat = 0, sumLng = 0, cnt = 0;
          for (var j = 0; j < ids.length; j++) {
            var c = window.MAP_REGIONS[ids[j]] && window.MAP_REGIONS[ids[j]].center;
            if (c) { sumLat += c[0]; sumLng += c[1]; cnt++; }
          }
          if (cnt > 0) {
            window.leafletMap.flyTo([sumLat/cnt, sumLng/cnt], Math.max(window.leafletMap.getZoom() || 4, 5), { duration: 0.6 });
          }
        }
      } catch(_) {}
      try {
        var gs2 = window.GAME_STATE || null;
        var n = gs2 && gs2.nations && gs2.nations[nationId] ? gs2.nations[nationId] : null;
        if (typeof window.showToast === 'function') {
          window.showToast('Нация: ' + (n ? (n.name || nationId) : nationId), 'info');
        }
      } catch(_) {}
    }

    function _goToCharacter(charId, nationId) {
      try {
        var gs = window.GAME_STATE || null;
        if (gs && nationId === gs.player_nation && typeof window.showCharacterDetail === 'function') {
          window.showCharacterDetail(charId);
          return;
        }
      } catch(_) {}
      try {
        var gs2 = window.GAME_STATE || null;
        var n = gs2 && gs2.nations && gs2.nations[nationId] ? gs2.nations[nationId] : null;
        var ch = (n && n.characters || []).find(function (x) { return x && x.id === charId; });
        if (typeof window.showToast === 'function') {
          window.showToast('Персонаж: ' + (ch ? (ch.name || charId) : charId) + ' (' + (n ? (n.name || nationId) : nationId) + ')', 'info');
        }
      } catch(_) {}
    }

    function _onInputKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (_activeIdx >= 0 && _flatResults[_activeIdx]) goToSearchResult(_activeIdx); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (_flatResults.length === 0) return;
        _activeIdx = (_activeIdx + 1) % _flatResults.length;
        _updateActiveClass();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (_flatResults.length === 0) return;
        _activeIdx = (_activeIdx - 1 + _flatResults.length) % _flatResults.length;
        _updateActiveClass();
        return;
      }
    }

    function _boot() {
      var inp = _input();
      if (inp) {
        inp.addEventListener('input', function () { onSearchInput(inp.value); });
        inp.addEventListener('keydown', _onInputKeydown);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _boot);
    } else {
      _boot();
    }

    // Пробрасываем наружу — используется closeTopModal() на Esc
    // (см. top_bar.js:80). Без моста bare-вызов из внешней функции
    // падает ReferenceError.
    if (typeof window !== 'undefined') {
      window.isSearchOpen     = isSearchOpen;
      window.closeSearchPanel = closeSearchPanel;
    }

  })();
