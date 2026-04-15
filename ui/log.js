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

// uisuper Этап 26 — категорийные метки в стиле манускрипта.
// Каждая запись в раскрытой табличке выводится со знаком-маркером:
//   ⚠ — опасность, ◈ — экономика, ◉ — персонажи, § — законы, · — прочее.
const LOG_CATEGORY_MARKS = {
  danger:      { mark: '⚠', color: 'var(--negative)'    },
  warning:     { mark: '⚠', color: 'var(--warning)'     },
  economy:     { mark: '◈', color: 'var(--gold)'        },
  character:   { mark: '◉', color: 'var(--bronze)'      },
  diplomacy:   { mark: '◉', color: 'var(--bronze)'      },
  law:         { mark: '§', color: 'var(--text-dim)'    },
  military:    { mark: '†', color: 'var(--negative)'    },
  turn:        { mark: '✦', color: 'var(--gold-bright)' },
  good:        { mark: '✧', color: 'var(--positive)'    },
  ai:          { mark: '·', color: 'var(--text-dim)'    },
  culture:     { mark: '·', color: 'var(--text-dim)'    },
  religion:    { mark: '·', color: 'var(--text-dim)'    },
  achievement: { mark: '✦', color: 'var(--gold-bright)' },
  info:        { mark: '·', color: 'var(--text-dim)'    },
  default:     { mark: '·', color: 'var(--text-dim)'    },
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
    isNew: true,  // uisuper Этап 26 — метка «новая запись», сбрасывается при раскрытии
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

// Шаг 24 / uisuper Этап 26 — переключить свёрнутый/развёрнутый режим лога.
// При раскрытии — сбрасываем точки-нотификации и метки «новая запись».
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
    // uisuper Этап 26 — при открытии лога гасим нотификации
    resetLogNotifications();
  } else {
    logEl.classList.remove('expanded');
    logEl.classList.add('collapsed');
    if (btn) {
      btn.classList.remove('open');
      btn.textContent = '▲ Хроники';
    }
  }
}

// uisuper Этап 26 — сброс нотификаций: счётчики, точки и флаги isNew.
function resetLogNotifications() {
  // 1. Обнуляем счётчики
  for (const k of Object.keys(_LOG_COUNTERS)) _LOG_COUNTERS[k] = 0;
  // 2. Снимаем isNew с прочитанных записей, чтобы новые подсветки не стреляли повторно
  if (typeof GAME_STATE !== 'undefined' && GAME_STATE && Array.isArray(GAME_STATE.events_log)) {
    GAME_STATE.events_log.forEach(e => { e.isNew = false; });
  }
  if (typeof document === 'undefined') return;
  // 3. Гасим точки в полоске (только если document поддерживает querySelectorAll)
  if (typeof document.querySelectorAll === 'function') {
    document.querySelectorAll('#log-dots .log-dot').forEach(dot => {
      dot.classList.remove('active');
      dot.classList.remove('pulse');
    });
  }
  // 4. Старые счётчики (Шаг 24 compat) — тоже обнулим
  if (typeof document.getElementById === 'function') {
    const countersEl = document.getElementById('log-counters');
    if (countersEl && typeof countersEl.querySelectorAll === 'function') {
      countersEl.querySelectorAll('.log-cnt b').forEach(b => { b.textContent = '0'; });
    }
  }
}

// uisuper Этап 26 — обновить точки-нотификации по списку записей лога.
// Экспортируется как window.updateLogDots для внешних вызовов.
function updateLogDots(entries) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  const counts = { danger: 0, economy: 0, character: 0, law: 0 };
  (entries || []).forEach(e => {
    if (e && e.isNew && counts[e.type] !== undefined) counts[e.type]++;
  });
  document.querySelectorAll('#log-dots .log-dot').forEach(dot => {
    const f = dot.getAttribute('data-filter');
    dot.classList.toggle('active', (counts[f] ?? 0) > 0);
  });
}

// uisuper Этап 26 — отрисовка лога в стиле манускрипта.
// Каждая запись: категорийная метка (⚠/◈/◉/§/·) + текст + номер хода.
function renderLog() {
  const container = document.getElementById('log-entries');
  if (!container || typeof GAME_STATE === 'undefined' || !GAME_STATE) return;

  if (!GAME_STATE.events_log) GAME_STATE.events_log = [];
  const entries = GAME_STATE.events_log.slice(0, LOG_DISPLAY);

  container.innerHTML = entries.map(entry => {
    const style = LOG_STYLES[entry.type] || LOG_STYLES.info;
    const cat = LOG_CATEGORY_MARKS[entry.type] || LOG_CATEGORY_MARKS.default;
    const isNewCls = entry.isNew ? ' new' : '';
    const turnStr = entry.turn ? `ход ${entry.turn}` : '';
    return `
      <div class="log-entry ${style.cls}${isNewCls}" data-type="${entry.type}" data-filter="${entry.type}">
        <span class="log-mark" style="color:${cat.color}">${cat.mark}</span>
        <span class="log-text">${escapeHtml(entry.message)}</span>
        <span class="log-turn-n">${turnStr}</span>
      </div>
    `;
  }).join('');

  // Снять подсветку .new через 1.6s чтобы анимация не застревала
  if (typeof setTimeout !== 'undefined') {
    setTimeout(() => {
      container.querySelectorAll('.log-entry.new').forEach(el => el.classList.remove('new'));
    }, 1600);
  }

  // Применить текущий фильтр если есть
  if (typeof _applyLogFilter === 'function') {
    try { _applyLogFilter(); } catch (_) { /* ignore */ }
  }
}

// Экспорт в глобальную область — чтобы onclick в HTML видели функции
if (typeof window !== 'undefined') {
  window.addEventLog         = addEventLog;
  window.renderLog           = renderLog;
  window.toggleLog           = toggleLog;
  window.updateLogCollapsed  = updateLogCollapsed;
  window.updateLogDots       = updateLogDots;
  window.resetLogNotifications = resetLogNotifications;
}

// Экранирование HTML для безопасного вывода
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
