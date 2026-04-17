/* turn_progress.js — список действий хода и их визуализация */

export const TURN_ACTIONS = [
  { id: 'taxes',  label: 'Налоги собраны' },
  { id: 'orders', label: 'Приказы выданы' },
  { id: 'diplo',  label: 'Дипломатия' },
  { id: 'build',  label: 'Строительство' },
  { id: 'events', label: 'События рассмотрены' },
];

const _turnDone = new Set();

export function renderTurnProgress() {
  try {
    const total = TURN_ACTIONS.length;
    if (total > 0 && window.Clepsydra) {
      const done = _turnDone.size;
      window.Clepsydra.progress = done / total;
      window.Clepsydra.setReady(done >= total);
    }
  } catch (_) {}

  const btn = document.getElementById('end-turn-btn');
  if (btn) {
    const doneList = TURN_ACTIONS.filter(a => _turnDone.has(a.id)).map(a => '✓ ' + a.label);
    const todoList = TURN_ACTIONS.filter(a => !_turnDone.has(a.id)).map(a => '○ ' + a.label);
    btn.title = 'Следующий ход [Space] — прогресс (' + _turnDone.size + '/' + TURN_ACTIONS.length + ')\n'
      + (doneList.length ? doneList.join('\n') + '\n' : '')
      + todoList.join('\n');
  }

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

export function markTurnAction(id) {
  if (!TURN_ACTIONS.some(a => a.id === id)) return;
  if (_turnDone.has(id)) return;
  _turnDone.add(id);
  renderTurnProgress();
}

export function resetTurnProgress() {
  _turnDone.clear();
  renderTurnProgress();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderTurnProgress);
} else {
  renderTurnProgress();
}

// Backward compat
window.TURN_ACTIONS       = TURN_ACTIONS;
window.markTurnAction     = markTurnAction;
window.resetTurnProgress  = resetTurnProgress;
window.renderTurnProgress = renderTurnProgress;
