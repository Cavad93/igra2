// Toast-уведомления
// Типы: 'info' | 'warning' | 'danger' | 'success'

const DEFAULT_DURATION = 4000;
const TYPES = { info: 1, warning: 1, danger: 1, success: 1 };

function _ensureContainer() {
  if (typeof document === 'undefined') return null;
  let c = document.getElementById('toast-container');
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
  setTimeout(function () {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }, 220);
}

export function showToast(message, type, duration) {
  if (typeof document === 'undefined') return null;
  if (!TYPES[type]) type = 'info';
  if (typeof duration !== 'number' || duration <= 0) duration = DEFAULT_DURATION;

  const container = _ensureContainer();
  if (!container) return null;

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.setAttribute('role', type === 'danger' ? 'alert' : 'status');

  const textEl = document.createElement('span');
  textEl.className = 'toast-text';
  textEl.innerHTML = _escape(message);
  toast.appendChild(textEl);

  if (type === 'danger') {
    const btn = document.createElement('button');
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

// Backward compat: expose to non-module scripts (ai/)
if (typeof window !== 'undefined') {
}
