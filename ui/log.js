// Лог событий — хроники игры

const LOG_MAX_ENTRIES = 120;  // сколько записей держим в памяти
const LOG_DISPLAY = 12;       // сколько показываем в UI

// Типы записей → CSS классы
const LOG_STYLES = {
  info:      { icon: 'ℹ',  cls: 'log-info'     },
  turn:      { icon: '⏰', cls: 'log-turn'     },
  economy:   { icon: '💰', cls: 'log-economy'  },
  military:  { icon: '⚔️', cls: 'log-military' },
  character: { icon: '👤', cls: 'log-character'},
  diplomacy: { icon: '🤝', cls: 'log-diplomacy'},
  warning:   { icon: '⚠',  cls: 'log-warning'  },
  danger:    { icon: '💀', cls: 'log-danger'   },
  good:      { icon: '✨', cls: 'log-good'     },
  ai:        { icon: '🤖', cls: 'log-ai'       },
  law:       { icon: '📜', cls: 'log-law'      },
  culture:   { icon: '🎭', cls: 'log-culture'  },
  religion:  { icon: '⛪', cls: 'log-religion' },
  achievement: { icon: '🏆', cls: 'log-achievement' },
};

// Шаг 24 — счётчики по категориям (для свёрнутого вида #log-collapsed)
const _LOG_COUNTERS = { danger: 0, economy: 0, character: 0 };

// Добавить запись в лог
function addEventLog(message, type = 'info') {
  const entry = {
    turn: GAME_STATE ? GAME_STATE.turn : 0,
    date: GAME_STATE ? formatDate(GAME_STATE.date) : '—',
    message,
    type,
    timestamp: Date.now(),
  };

  // Добавляем в GAME_STATE для сохранения
  if (GAME_STATE) {
    if (!GAME_STATE.events_log) GAME_STATE.events_log = [];
    GAME_STATE.events_log.unshift(entry);
    // Обрезаем старые записи
    if (GAME_STATE.events_log.length > LOG_MAX_ENTRIES) {
      GAME_STATE.events_log.length = LOG_MAX_ENTRIES;
    }
  }

  // Шаг 24: обновляем счётчики по категориям и последнюю строку
  if (type === 'danger' || type === 'economy' || type === 'character') {
    _LOG_COUNTERS[type] = (_LOG_COUNTERS[type] ?? 0) + 1;
  }
  updateLogCollapsed(entry);

  // Обновляем DOM сразу
  renderLog();
}

// Шаг 24 / uisuper Этап 25 — обновить свёрнутый вид
// (последнее событие, счётчики старого вида, точки-нотификации новой таблички)
function updateLogCollapsed(lastEntry) {
  if (typeof document === 'undefined') return;

  // Последняя строка
  const lastEl = document.getElementById('log-last-entry');
  if (lastEl && lastEntry) {
    const style = LOG_STYLES[lastEntry.type] || LOG_STYLES.info;
    lastEl.textContent = `${style.icon} ${lastEntry.message}`;
    lastEl.setAttribute('data-type', lastEntry.type);
  }

  // === Старый вид — счётчики #log-counters (Шаг 24, backward compat) ===
  const countersEl = document.getElementById('log-counters');
  if (countersEl) {
    countersEl.querySelectorAll('.log-cnt').forEach(cnt => {
      const f = cnt.getAttribute('data-filter');
      const b = cnt.querySelector('b');
      if (b) b.textContent = String(_LOG_COUNTERS[f] ?? 0);
    });

    // Импульс-анимация для danger при появлении нового danger-события
    if (lastEntry && lastEntry.type === 'danger') {
      const dangerCnt = countersEl.querySelector('.log-cnt[data-filter="danger"]');
      if (dangerCnt) {
        dangerCnt.classList.remove('pulse');
        void dangerCnt.offsetWidth;
        dangerCnt.classList.add('pulse');
        setTimeout(() => dangerCnt.classList.remove('pulse'), 2000);
      }
    }
  }

  // === Новый вид — точки-нотификации #log-dots (uisuper Этап 25) ===
  const dotsEl = document.getElementById('log-dots');
  if (dotsEl) {
    dotsEl.querySelectorAll('.log-dot').forEach(dot => {
      const f = dot.getAttribute('data-filter');
      const n = _LOG_COUNTERS[f] ?? 0;
      if (n > 0) dot.classList.add('active');
      else       dot.classList.remove('active');
    });

    // Импульс для последней категории
    if (lastEntry && _LOG_COUNTERS[lastEntry.type] !== undefined) {
      const dot = dotsEl.querySelector(`.log-dot[data-filter="${lastEntry.type}"]`);
      if (dot) {
        dot.classList.remove('pulse');
        void dot.offsetWidth;
        dot.classList.add('pulse');
        setTimeout(() => dot.classList.remove('pulse'), 2000);
      }
    }
  }
}

// Шаг 24 — переключить свёрнутый/развёрнутый режим лога
function toggleLog() {
  if (typeof document === 'undefined') return;
  const logEl = document.getElementById('event-log');
  const btn = document.getElementById('log-expand-btn');
  if (!logEl) return;

  const isCollapsed = logEl.classList.contains('collapsed') || !logEl.classList.contains('expanded');
  if (isCollapsed) {
    logEl.classList.remove('collapsed');
    logEl.classList.add('expanded');
    if (btn) {
      btn.classList.add('open');
      btn.textContent = '▼ Хроники';
    }
  } else {
    logEl.classList.remove('expanded');
    logEl.classList.add('collapsed');
    if (btn) {
      btn.classList.remove('open');
      btn.textContent = '▲ Хроники';
    }
  }
}

// Отрисовать лог
function renderLog() {
  const container = document.getElementById('log-entries');
  if (!container || !GAME_STATE) return;

  if (!GAME_STATE.events_log) GAME_STATE.events_log = [];
  const entries = GAME_STATE.events_log.slice(0, LOG_DISPLAY);

  container.innerHTML = entries.map(entry => {
    const style = LOG_STYLES[entry.type] || LOG_STYLES.info;
    return `
      <div class="log-entry ${style.cls}" data-type="${entry.type}">
        <span class="log-icon">${style.icon}</span>
        <span class="log-text">${escapeHtml(entry.message)}</span>
      </div>
    `;
  }).join('');
}

// Экспорт в глобальную область — чтобы onclick в HTML видели функции
if (typeof window !== 'undefined') {
  window.addEventLog      = addEventLog;
  window.renderLog        = renderLog;
  window.toggleLog        = toggleLog;
  window.updateLogCollapsed = updateLogCollapsed;
}

// Экранирование HTML для безопасного вывода
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
