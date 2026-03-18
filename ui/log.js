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
};

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
    GAME_STATE.events_log.unshift(entry);
    // Обрезаем старые записи
    if (GAME_STATE.events_log.length > LOG_MAX_ENTRIES) {
      GAME_STATE.events_log.length = LOG_MAX_ENTRIES;
    }
  }

  // Обновляем DOM сразу
  renderLog();
}

// Отрисовать лог
function renderLog() {
  const container = document.getElementById('log-entries');
  if (!container || !GAME_STATE) return;

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

// Экранирование HTML для безопасного вывода
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
