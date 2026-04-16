/* ───────────────────────────────────────────────────────────
   status_bar.js — дебаг-строка внизу (#status-bar).
   После этапов 13–14 скрыта визуально, но служебные обновления
   продолжаются (save-status, ai-status, fps).
   Рефакторинг Части II, этап 40.
   ─────────────────────────────────────────────────────────── */
(function initStatusBar(){
  'use strict';

  var _sbLastSaveTs = null;
  var _sbSaveTimer  = null;

  function _el(id){ return document.getElementById(id); }

  // Этап 14 — безопасное обновление DOM-элемента.
  // Не падает, если элемент отсутствует в DOM (sb-*, старые splash-*, game-date …).
  function safeSet(id, value, attr){
    var el = document.getElementById(id);
    if (!el) return;
    el[attr || 'textContent'] = value;
  }
  // Экспорт — используется во всём index.html для безопасных обновлений.
  if (!window.safeSet) window.safeSet = safeSet;

  // Этап 14 — обновление #sb-game отключено: данные дублируются стелой
  // (#game-month / #game-year / #game-turn), а сам статус-бар скрыт Этапом 13.
  // Функция оставлена как no-op ради обратной совместимости с внешними вызовами.
  function updateSbGame(){ /* no-op: #status-bar скрыт, данные берутся со стелы */ }

  // AI: ready | busy | error
  function setAIStatus(status, text){
    var s = (status || 'ready').toLowerCase();
    var el = _el('sb-ai');
    if (el) {
      el.classList.remove('ready','busy','error');
      el.classList.add(s);
      var aiIcon = (window.icon ? window.icon('ai') : '')
        || '<span class="icon-wrap" data-icon="ai"></span>';
      if (typeof text === 'string' && text) {
        el.innerHTML = '<span class="icon-wrap">' + aiIcon + '</span> ' + text;
      } else {
        var label;
        if (s === 'busy')       label = 'AI: обрабатывает…';
        else if (s === 'error') label = 'AI: ошибка';
        else                    label = 'AI: готов';
        el.innerHTML = '<span class="icon-wrap">' + aiIcon + '</span> ' + label;
      }
    }
    // Этап 13 — обновляем мини-индикатор в #top-actions
    var dot = _el('ai-dot');
    if (dot) {
      dot.className = 'ai-dot ' + s;
      var dotTitle;
      if (typeof text === 'string' && text) dotTitle = text;
      else if (s === 'busy')  dotTitle = 'AI: обрабатывает…';
      else if (s === 'error') dotTitle = 'AI: ошибка';
      else                    dotTitle = 'AI: готов';
      dot.title = dotTitle;
    }
  }

  // Обновление текста сохранения
  function _renderSaveLabel(){
    var el = _el('sb-save');
    if (!el) return;
    var saveIcon = (window.icon ? window.icon('save') : '')
      || '<span class="icon-wrap" data-icon="save"></span>';
    var wrap = function(label){ return '<span class="icon-wrap">' + saveIcon + '</span> ' + label; };
    if (_sbLastSaveTs == null) {
      el.innerHTML = wrap('Не сохранено');
      return;
    }
    var diffMs = Date.now() - _sbLastSaveTs;
    var mins   = Math.floor(diffMs / 60000);
    if (diffMs < 5000)       el.innerHTML = wrap('Сохранено только что');
    else if (mins < 1)       el.innerHTML = wrap('Сохранено ' + Math.floor(diffMs/1000) + ' сек назад');
    else if (mins === 1)     el.innerHTML = wrap('Сохранено 1 мин назад');
    else if (mins < 60)      el.innerHTML = wrap('Сохранено ' + mins + ' мин назад');
    else {
      var h = Math.floor(mins / 60);
      el.innerHTML = wrap('Сохранено ' + h + ' ч назад');
    }
  }

  function markSaved(){
    _sbLastSaveTs = Date.now();
    _renderSaveLabel();
    if (_sbSaveTimer) clearInterval(_sbSaveTimer);
    _sbSaveTimer = setInterval(_renderSaveLabel, 15000);
    // Этап 13 — анимируем #save-indicator (золотой пульс), затем гасим
    updateSaveIndicator('saving');
    setTimeout(function(){ updateSaveIndicator('saved'); }, 1800);
  }

  // Этап 13 — индикатор сохранения на стеле
  // status: 'saving' | 'saved' | 'error'
  function updateSaveIndicator(status){
    var el = _el('save-indicator');
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

  // Этап 14 — FPS-счётчик виден только в dev-режиме.
  // Включить: в консоли браузера ввести `DEV_MODE = true` (или `window.DEV_MODE = true`).
  // Пока DEV_MODE выключен — rAF-цикл простаивает на setTimeout'е (1 тик в секунду),
  // чтобы не делать лишних DOM-обновлений каждый кадр. Как только DEV_MODE=true,
  // счётчик просыпается и рисует оверлей в правом нижнем углу.
  (function fpsLoop(){
    var frames = 0;
    var lastTs = performance.now();
    var _devFpsEl = null;

    function ensureOverlay(){
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

    function tick(now){
      if (window.DEV_MODE) {
        frames++;
        if (now - lastTs >= 1000) {
          var fps = Math.round((frames * 1000) / (now - lastTs));
          ensureOverlay().textContent = fps + ' fps';
          // Старый скрытый элемент обновляем для совместимости.
          safeSet('sb-fps', fps + ' fps');
          frames = 0;
          lastTs = now;
        }
        requestAnimationFrame(tick);
      } else {
        // Если оверлей остался от предыдущего DEV_MODE=true — убрать.
        if (_devFpsEl) { _devFpsEl.remove(); _devFpsEl = null; }
        // Сбрасываем счётчики, чтобы при следующем включении DEV_MODE
        // первое измерение было корректным.
        frames = 0;
        lastTs = performance.now();
        // Засыпаем на секунду — cheap poll на DEV_MODE без лишней нагрузки.
        setTimeout(function(){ requestAnimationFrame(tick); }, 1000);
      }
    }
    requestAnimationFrame(tick);
  })();

  // Этап 14 — периодическое обновление #sb-game больше не нужно (no-op функция).
  // Оставляем вызов для единственного начального рендера (на случай, если кто-то
  // в будущем вернёт status-bar — достаточно убрать no-op в updateSbGame).
  function _bootGameLabel(){
    updateSbGame();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootGameLabel);
  } else {
    _bootGameLabel();
  }

  // Экспорт
  window.setAIStatus        = setAIStatus;
  window.markSaved          = markSaved;
  window.updateSbGame       = updateSbGame;
  window.updateSaveIndicator = updateSaveIndicator;
})();
