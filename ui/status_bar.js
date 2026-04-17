/* status_bar.js — дебаг-строка внизу (#status-bar) */

let _sbLastSaveTs = null;
let _sbSaveTimer  = null;

function _el(id) { return document.getElementById(id); }

export function safeSet(id, value, attr) {
  const el = document.getElementById(id);
  if (!el) return;
  el[attr || 'textContent'] = value;
}

export function updateSbGame() { /* no-op */ }

export function setAIStatus(status, text) {
  const s = (status || 'ready').toLowerCase();
  const el = _el('sb-ai');
  if (el) {
    el.classList.remove('ready','busy','error');
    el.classList.add(s);
    const aiIcon = (window.icon ? window.icon('ai') : '')
      || '<span class="icon-wrap" data-icon="ai"></span>';
    if (typeof text === 'string' && text) {
      el.innerHTML = '<span class="icon-wrap">' + aiIcon + '</span> ' + text;
    } else {
      let label;
      if (s === 'busy')       label = 'AI: обрабатывает…';
      else if (s === 'error') label = 'AI: ошибка';
      else                    label = 'AI: готов';
      el.innerHTML = '<span class="icon-wrap">' + aiIcon + '</span> ' + label;
    }
  }
  const dot = _el('ai-dot');
  if (dot) {
    dot.className = 'ai-dot ' + s;
    let dotTitle;
    if (typeof text === 'string' && text) dotTitle = text;
    else if (s === 'busy')  dotTitle = 'AI: обрабатывает…';
    else if (s === 'error') dotTitle = 'AI: ошибка';
    else                    dotTitle = 'AI: готов';
    dot.title = dotTitle;
  }
}

function _renderSaveLabel() {
  const el = _el('sb-save');
  if (!el) return;
  const saveIcon = (window.icon ? window.icon('save') : '')
    || '<span class="icon-wrap" data-icon="save"></span>';
  const wrap = function(label) { return '<span class="icon-wrap">' + saveIcon + '</span> ' + label; };
  if (_sbLastSaveTs == null) {
    el.innerHTML = wrap('Не сохранено');
    return;
  }
  const diffMs = Date.now() - _sbLastSaveTs;
  const mins   = Math.floor(diffMs / 60000);
  if (diffMs < 5000)       el.innerHTML = wrap('Сохранено только что');
  else if (mins < 1)       el.innerHTML = wrap('Сохранено ' + Math.floor(diffMs/1000) + ' сек назад');
  else if (mins === 1)     el.innerHTML = wrap('Сохранено 1 мин назад');
  else if (mins < 60)      el.innerHTML = wrap('Сохранено ' + mins + ' мин назад');
  else {
    const h = Math.floor(mins / 60);
    el.innerHTML = wrap('Сохранено ' + h + ' ч назад');
  }
}

export function markSaved() {
  _sbLastSaveTs = Date.now();
  _renderSaveLabel();
  if (_sbSaveTimer) clearInterval(_sbSaveTimer);
  _sbSaveTimer = setInterval(_renderSaveLabel, 15000);
  updateSaveIndicator('saving');
  setTimeout(function() { updateSaveIndicator('saved'); }, 1800);
}

export function updateSaveIndicator(status) {
  const el = _el('save-indicator');
  if (!el) return;
  el.className = '';
  if (status === 'saving') {
    el.className = 'saving';
    el.title = 'Сохранение…';
  } else if (status === 'error') {
    el.className = 'error';
    el.title = 'Ошибка сохранения';
  } else {
    el.className = 'saved';
    el.title = 'Сохранено';
  }
}

// FPS loop
(function fpsLoop() {
  let frames = 0;
  let lastTs = performance.now();
  let _devFpsEl = null;

  function ensureOverlay() {
    if (_devFpsEl && document.body.contains(_devFpsEl)) return _devFpsEl;
    _devFpsEl = document.createElement('div');
    _devFpsEl.id = 'dev-fps-overlay';
    _devFpsEl.style.cssText = [
      'position:fixed','bottom:4px','right:4px','z-index:99998',
      'font-family:monospace','font-size:10px','color:#0f0',
      'background:rgba(0,0,0,0.5)','padding:2px 6px','pointer-events:none'
    ].join(';');
    document.body.appendChild(_devFpsEl);
    return _devFpsEl;
  }

  function tick(now) {
    if (window.DEV_MODE) {
      frames++;
      if (now - lastTs >= 1000) {
        const fps = Math.round((frames * 1000) / (now - lastTs));
        ensureOverlay().textContent = fps + ' fps';
        safeSet('sb-fps', fps + ' fps');
        frames = 0;
        lastTs = now;
      }
      requestAnimationFrame(tick);
    } else {
      if (_devFpsEl) { _devFpsEl.remove(); _devFpsEl = null; }
      frames = 0;
      lastTs = performance.now();
      setTimeout(function() { requestAnimationFrame(tick); }, 1000);
    }
  }
  requestAnimationFrame(tick);
})();

function _bootGameLabel() {
  updateSbGame();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bootGameLabel);
} else {
  _bootGameLabel();
}

// Backward compat
