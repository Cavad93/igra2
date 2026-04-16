/* ═══════════════════════════════════════════════════════════
   ЭТАП 22 (uisuper.md) — полноценный контроллер диптиха.
   Управляет раскрытием/складыванием левой панели, переключением вкладок,
   сохраняет состояние в localStorage, инициализируется на DOMContentLoaded.
   Совместим с renderLeftPanelTab() из ui/panels.js — при открытии и смене
   вкладки вызывает его для реального рендера содержимого.
   Вынесен из inline-скрипта index.html в этапе 42.
   ═══════════════════════════════════════════════════════════ */
(function () {
  var TITLES = {
    overview:  'Обзор нации',
    army:      'Армия',
    economy:   'Казна',
    diplomacy: 'Дипломатия',
    laws:      'Законы',
  };
  var STORAGE_KEY = 'diptych';
  var VALID_TABS = Object.keys(TITLES);

  var Diptych = {
    _open: false,
    _tab:  'overview',
    _inited: false,

    init: function () {
      if (this._inited) return;
      this._inited = true;
      // Восстановить состояние из localStorage
      try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          var s = JSON.parse(saved);
          if (s && typeof s.open === 'boolean') this._open = s.open;
          if (s && typeof s.tab === 'string' && VALID_TABS.indexOf(s.tab) >= 0) {
            this._tab = s.tab;
          }
        }
      } catch (e) { /* ignore corrupt json */ }

      this._apply();
      this._syncNav();
      this._syncTitle();

      // Если было открыто — отрендерить контент активной вкладки
      if (this._open) {
        this._renderTab(this._tab);
      }
    },

    toggle: function () {
      this._open = !this._open;
      this._save();
      this._apply();
      if (this._open) {
        // Рендерим контент после начала анимации открытия
        var self = this;
        setTimeout(function () { self._renderTab(self._tab); }, 50);
      }
    },

    open: function () {
      if (this._open) return;
      this.toggle();
    },

    close: function () {
      if (!this._open) return;
      this.toggle();
    },

    switchTab: function (tab) {
      if (VALID_TABS.indexOf(tab) < 0) return;
      this._tab = tab;
      this._save();
      this._syncNav();
      this._syncTitle();
      this._renderTab(tab);
    },

    isOpen: function () { return this._open; },
    currentTab: function () { return this._tab; },

    _renderTab: function (tab) {
      if (typeof window.renderLeftPanelTab === 'function') {
        try { window.renderLeftPanelTab(tab); } catch (e) {}
      }
    },

    _apply: function () {
      var panel = document.getElementById('left-panel');
      if (!panel) return;
      panel.classList.toggle('open',   this._open);
      panel.classList.toggle('closed', !this._open);
    },

    _syncNav: function () {
      var btns = document.querySelectorAll('#diptych-nav .dip-nav-btn');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        var active = (b.getAttribute('data-tab') === this._tab);
        b.classList.toggle('active', active);
      }
    },

    _syncTitle: function () {
      var titleEl = document.getElementById('diptych-title');
      if (!titleEl) return;
      titleEl.textContent = TITLES[this._tab] || this._tab;
    },

    _save: function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          open: this._open,
          tab:  this._tab,
        }));
      } catch (e) { /* quota / private mode — ignore */ }
    },
  };

  function toggleDiptych()        { Diptych.toggle(); }
  function switchDiptychTab(tab)  { Diptych.switchTab(tab); }

  window.Diptych           = Diptych;
  window.toggleDiptych     = toggleDiptych;
  window.switchDiptychTab  = switchDiptychTab;

  // Инициализация после загрузки DOM (или сразу, если уже загружен)
  function _initDiptych() { Diptych.init(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDiptych);
  } else {
    _initDiptych();
  }
})();
