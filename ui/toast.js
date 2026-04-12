// Шаг 27 — Toast-уведомления
// Важные события всплывают справа как краткие уведомления.
// Типы: 'info' | 'warning' | 'danger' | 'success'
// 'danger' не удаляется автоматически — у него есть кнопка закрытия.

(function () {
  'use strict';

  var DEFAULT_DURATION = 4000;
  var TYPES = { info: 1, warning: 1, danger: 1, success: 1 };

  function _ensureContainer() {
    if (typeof document === 'undefined') return null;
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function _escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _removeToast(el) {
    if (!el || el.__closing) return;
    el.__closing = true;
    el.classList.add('toast-hide');
    // after animation remove from DOM
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 220);
  }

  /**
   * Показать всплывающее уведомление.
   * @param {string} message - текст уведомления
   * @param {string} [type='info'] - info | warning | danger | success
   * @param {number} [duration=4000] - мс, после которых уведомление исчезнет.
   *                                   Для 'danger' игнорируется (не скрывается сам).
   */
  function showToast(message, type, duration) {
    if (typeof document === 'undefined') return null;
    if (!TYPES[type]) type = 'info';
    if (typeof duration !== 'number' || duration <= 0) duration = DEFAULT_DURATION;

    var container = _ensureContainer();
    if (!container) return null;

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.setAttribute('role', type === 'danger' ? 'alert' : 'status');

    var textEl = document.createElement('span');
    textEl.className = 'toast-text';
    textEl.innerHTML = _escape(message);
    toast.appendChild(textEl);

    if (type === 'danger') {
      var btn = document.createElement('button');
      btn.className = 'toast-close';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Закрыть');
      btn.textContent = '\u2715';
      btn.addEventListener('click', function () { _removeToast(toast); });
      toast.appendChild(btn);
    }

    container.appendChild(toast);

    if (type !== 'danger') {
      setTimeout(function () { _removeToast(toast); }, duration);
    }

    return toast;
  }

  if (typeof window !== 'undefined') {
    window.showToast = showToast;
  }
})();
