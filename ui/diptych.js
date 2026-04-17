/* diptych.js — контроллер складной левой панели */

const TITLES = {
  overview:  'Обзор нации',
  army:      'Армия',
  economy:   'Казна',
  diplomacy: 'Дипломатия',
  laws:      'Законы',
};
const STORAGE_KEY = 'diptych';
const VALID_TABS = Object.keys(TITLES);

export const Diptych = {
  _open: false,
  _tab:  'overview',
  _inited: false,

  init: function () {
    if (this._inited) return;
    this._inited = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s && typeof s.open === 'boolean') this._open = s.open;
        if (s && typeof s.tab === 'string' && VALID_TABS.indexOf(s.tab) >= 0) {
          this._tab = s.tab;
        }
      }
    } catch (e) { /* ignore */ }

    this._apply();
    this._syncNav();
    this._syncTitle();

    if (this._open) {
      this._renderTab(this._tab);
    }
  },

  toggle: function () {
    this._open = !this._open;
    this._save();
    this._apply();
    if (this._open) {
      const self = this;
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
    const panel = document.getElementById('left-panel');
    if (!panel) return;
    panel.classList.toggle('open',   this._open);
    panel.classList.toggle('closed', !this._open);
  },

  _syncNav: function () {
    const btns = document.querySelectorAll('#diptych-nav .dip-nav-btn');
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const active = (b.getAttribute('data-tab') === this._tab);
      b.classList.toggle('active', active);
    }
  },

  _syncTitle: function () {
    const titleEl = document.getElementById('diptych-title');
    if (!titleEl) return;
    titleEl.textContent = TITLES[this._tab] || this._tab;
  },

  _save: function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        open: this._open,
        tab:  this._tab,
      }));
    } catch (e) { /* ignore */ }
  },
};

export function toggleDiptych()        { Diptych.toggle(); }
export function switchDiptychTab(tab)  { Diptych.switchTab(tab); }

// Backward compat
window.Diptych           = Diptych;
window.toggleDiptych     = toggleDiptych;
window.switchDiptychTab  = switchDiptychTab;

function _initDiptych() { Diptych.init(); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initDiptych);
} else {
  _initDiptych();
}
