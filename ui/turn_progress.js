/* ───────────────────────────────────────────────────────────
   turn_progress.js — список действий хода и их визуализация
   (через Clepsydra и легаси-#turn-progress).
   Публичный API:
     window.TURN_ACTIONS, window.markTurnAction(id),
     window.resetTurnProgress(), window.renderTurnProgress()
   Зависимости: window.Clepsydra (опционально), DOM.
   Рефакторинг Части II, этап 39.
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Список действий, которые игрок может выполнить за один ход
  const TURN_ACTIONS = [
    { id: 'taxes',  label: 'Налоги собраны' },
    { id: 'orders', label: 'Приказы выданы' },
    { id: 'diplo',  label: 'Дипломатия' },
    { id: 'build',  label: 'Строительство' },
    { id: 'events', label: 'События рассмотрены' },
  ];

  // Множество выполненных id для текущего хода
  const _turnDone = new Set();

  function renderTurnProgress() {
    // uisuper Этап 12 — синхронизируем уровень воды клепсидры с прогрессом хода
    try {
      const total = TURN_ACTIONS.length;
      if (total > 0 && window.Clepsydra) {
        const done = _turnDone.size;
        window.Clepsydra.progress = done / total;
        window.Clepsydra.setReady(done >= total);
      }
    } catch (_) {}

    // Обновляем тултип на кнопке клепсидры (если есть) — перечень приказов
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
      const doneList = TURN_ACTIONS.filter(a => _turnDone.has(a.id)).map(a => '✓ ' + a.label);
      const todoList = TURN_ACTIONS.filter(a => !_turnDone.has(a.id)).map(a => '○ ' + a.label);
      btn.title = 'Следующий ход [Space] — прогресс (' + _turnDone.size + '/' + TURN_ACTIONS.length + ')\n'
        + (doneList.length ? doneList.join('\n') + '\n' : '')
        + todoList.join('\n');
    }

    // Легаси: если где-то остались старые dot-контейнеры, обновляем и их
    const dots = document.getElementById('tp-dots');
    const label = document.getElementById('tp-label');
    const wrap = document.getElementById('turn-progress');
    if (!dots || !label) return;
    dots.innerHTML = '';
    for (const act of TURN_ACTIONS) {
      const d = document.createElement('div');
      d.className = 'tp-dot' + (_turnDone.has(act.id) ? ' done' : '');
      d.setAttribute('data-tp-id', act.id);
      d.title = act.label + (_turnDone.has(act.id) ? ' ✓' : '');
      dots.appendChild(d);
    }
    label.textContent = _turnDone.size + '/' + TURN_ACTIONS.length;
    if (wrap) {
      const done = TURN_ACTIONS.filter(a => _turnDone.has(a.id)).map(a => '✓ ' + a.label);
      const todo = TURN_ACTIONS.filter(a => !_turnDone.has(a.id)).map(a => '○ ' + a.label);
      wrap.title = 'Прогресс хода (' + _turnDone.size + '/' + TURN_ACTIONS.length + ')\n'
        + (done.length ? done.join('\n') + '\n' : '')
        + todo.join('\n');
    }
  }

  function markTurnAction(id) {
    if (!TURN_ACTIONS.some(a => a.id === id)) return;
    if (_turnDone.has(id)) return;
    _turnDone.add(id);
    renderTurnProgress();
  }

  function resetTurnProgress() {
    _turnDone.clear();
    renderTurnProgress();
  }

  // Первичная отрисовка после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderTurnProgress);
  } else {
    renderTurnProgress();
  }

  window.TURN_ACTIONS       = TURN_ACTIONS;
  window.markTurnAction     = markTurnAction;
  window.resetTurnProgress  = resetTurnProgress;
  window.renderTurnProgress = renderTurnProgress;
})();
