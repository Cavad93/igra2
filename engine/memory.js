// ══════════════════════════════════════════════════════════════════════
// NATION MEMORY — контекстная память AI-наций
//
// Структура nation.memory:
//   events[]   — полные записи событий (последние RECENT_TURNS ходов)
//   archive[]  — сжатые сводки старых периодов (Haiku-компрессия)
//   dialogues  — история переговоров с каждой нацией {[partnerId]: []}
//
// Цикл жизни данных:
//   1. addMemoryEvent() / addDialogueMessage() → пишут в events[] / dialogues[]
//   2. processMemoryTick() каждый ход → проверяет нужна ли компрессия
//   3. _scheduleCompression() → выносит старые (>120 ходов) события в batch
//   4. _compressBatchAsync() → Haiku-вызов генерирует сводку → archive[]
//   5. getDecisionContext() → собирает archive[] + recent events → строка в промпт
//   6. getDialogueContext() → последние диалоги с нацией → строка в промпт
// ══════════════════════════════════════════════════════════════════════

const MEMORY_CFG = {
  RECENT_TURNS:       120,  // ходов (10 лет) — полное хранение
  COMPRESS_INTERVAL:   12,  // запускать компрессию каждые N ходов
  COMPRESS_BATCH:      12,  // ходов в одном сжимаемом batch
  MAX_ARCHIVE:         30,  // максимум архивных сводок на нацию
  MAX_EVENT_TEXT:     300,  // символов на одно событие
  MAX_DIALOGUE_MSGS:   60,  // сообщений диалога на пару наций (полный текст)
  CONTEXT_EVENTS:      30,  // последних событий в промпт решения
  CONTEXT_SUMMARIES:    5,  // архивных сводок в промпт решения
  CONTEXT_DIAL_MSGS:   10,  // последних сообщений диалога в промпт дипломатии
  MAX_CONTEXT_CHARS:  3500, // лимит символов итогового контекста
};

// ══════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════════════════

function _ensureMemory(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return null;
  if (!nation.memory) {
    nation.memory = { events: [], archive: [], dialogues: {} };
  }
  return nation.memory;
}

// ══════════════════════════════════════════════════════════════════════
// ЗАПИСЬ СОБЫТИЙ
// ══════════════════════════════════════════════════════════════════════

/**
 * Добавить событие в память нации.
 * @param {string} nationId
 * @param {'military'|'diplomacy'|'economy'|'decision'|'political'} type
 * @param {string} text  — описание события
 * @param {string[]} [involvedNations] — другие нации-участники (для перекрёстной записи)
 */
function addMemoryEvent(nationId, type, text, involvedNations) {
  const mem = _ensureMemory(nationId);
  if (!mem) return;

  mem.events.push({
    turn: GAME_STATE.turn ?? 1,
    type,
    text: String(text).slice(0, MEMORY_CFG.MAX_EVENT_TEXT),
  });

  // Перекрёстная запись для других наций-участников
  if (Array.isArray(involvedNations)) {
    for (const nId of involvedNations) {
      if (nId && nId !== nationId) {
        const m2 = _ensureMemory(nId);
        if (m2) m2.events.push({
          turn: GAME_STATE.turn ?? 1,
          type,
          text: String(text).slice(0, MEMORY_CFG.MAX_EVENT_TEXT),
        });
      }
    }
  }
}

/**
 * Добавить сообщение дипломатического диалога.
 * Записывается в память ОБЕИХ сторон.
 * @param {string} nationId     — нация, чья память обновляется
 * @param {string} partnerId    — нация-собеседник
 * @param {'user'|'assistant'|'system'} role
 * @param {string} text
 */
function addDialogueMessage(nationId, partnerId, role, text) {
  const mem = _ensureMemory(nationId);
  if (!mem) return;

  if (!mem.dialogues[partnerId]) mem.dialogues[partnerId] = [];
  mem.dialogues[partnerId].push({
    turn: GAME_STATE.turn ?? 1,
    role,
    text: String(text).slice(0, 500),
  });

  // Обрезаем по лимиту
  if (mem.dialogues[partnerId].length > MEMORY_CFG.MAX_DIALOGUE_MSGS) {
    mem.dialogues[partnerId] = mem.dialogues[partnerId].slice(-MEMORY_CFG.MAX_DIALOGUE_MSGS);
  }
}

// ══════════════════════════════════════════════════════════════════════
// ПОЛУЧЕНИЕ КОНТЕКСТА ДЛЯ ПРОМПТОВ
// ══════════════════════════════════════════════════════════════════════

/**
 * Строка контекста для промпта решения AI-нации.
 * Включает архивные сводки + последние события.
 */
function getDecisionContext(nationId) {
  const mem = _ensureMemory(nationId);
  if (!mem) return '';

  const parts = [];

  // ── Архивные сводки (самые свежие первыми в списке — в хронологии) ──
  const summaries = mem.archive.slice(-MEMORY_CFG.CONTEXT_SUMMARIES);
  if (summaries.length > 0) {
    parts.push('ИСТОРИЯ (АРХИВ):');
    for (const s of summaries) {
      parts.push(`  [Ходы ${s.from_turn}–${s.to_turn}]: ${s.summary}`);
    }
  }

  // ── Последние события ────────────────────────────────────────────
  const recent = mem.events.slice(-MEMORY_CFG.CONTEXT_EVENTS);
  if (recent.length > 0) {
    parts.push('\nНЕДАВНИЕ СОБЫТИЯ:');
    for (const e of recent) {
      parts.push(`  [Ход ${e.turn}][${e.type}] ${e.text}`);
    }
  }

  const result = parts.join('\n');
  return result.length > MEMORY_CFG.MAX_CONTEXT_CHARS
    ? '...(обрезано)\n' + result.slice(-MEMORY_CFG.MAX_CONTEXT_CHARS)
    : result;
}

/**
 * История диалогов с конкретной нацией (для системного промпта дипломатии).
 */
function getDialogueContext(nationId, partnerId) {
  const mem = GAME_STATE.nations?.[nationId]?.memory;
  const msgs = mem?.dialogues?.[partnerId];
  if (!msgs || msgs.length === 0) return '';

  const recent = msgs.slice(-MEMORY_CFG.CONTEXT_DIAL_MSGS);
  const lines  = recent.map(m => {
    const who  = m.role === 'user' ? 'Игрок' : m.role === 'assistant' ? 'Мы' : 'Система';
    const year = Math.abs(Math.floor(-301 + (m.turn ?? 0) / 12));
    return `    [~${year} до н.э., ход ${m.turn}] ${who}: ${m.text.slice(0, 200)}`;
  });

  return `ИСТОРИЯ ПЕРЕГОВОРОВ С ЭТОЙ НАЦИЕЙ (последние ${recent.length} сообщений):\n${lines.join('\n')}`;
}

// ══════════════════════════════════════════════════════════════════════
// ТИК ПАМЯТИ — вызывается каждый ход из processTurn()
// ══════════════════════════════════════════════════════════════════════

function processMemoryTick() {
  const turn = GAME_STATE.turn ?? 1;
  if (turn % MEMORY_CFG.COMPRESS_INTERVAL !== 0) return; // только каждые 12 ходов

  for (const nId of Object.keys(GAME_STATE.nations ?? {})) {
    const mem = GAME_STATE.nations[nId]?.memory;
    if (!mem || mem.events.length === 0) continue;
    _scheduleCompression(nId, turn);
  }
}

// ══════════════════════════════════════════════════════════════════════
// КОМПРЕССИЯ СТАРЫХ СОБЫТИЙ → АРХИВ
// ══════════════════════════════════════════════════════════════════════

function _scheduleCompression(nationId, currentTurn) {
  const mem = _ensureMemory(nationId);
  if (!mem) return;

  const cutoff = currentTurn - MEMORY_CFG.RECENT_TURNS;
  if (cutoff <= 0) return; // ещё не накопилось 120 ходов

  // События старше cutoff → сжимаем
  const toCompress = mem.events.filter(e => e.turn < cutoff);
  if (toCompress.length === 0) return;

  // Удаляем их из hot-памяти
  mem.events = mem.events.filter(e => e.turn >= cutoff);

  // Группируем по окнам COMPRESS_BATCH ходов
  const windows = new Map();
  for (const ev of toCompress) {
    const wStart = Math.floor(ev.turn / MEMORY_CFG.COMPRESS_BATCH) * MEMORY_CFG.COMPRESS_BATCH;
    if (!windows.has(wStart)) windows.set(wStart, []);
    windows.get(wStart).push(ev);
  }

  for (const [wStart, evts] of windows) {
    const wEnd = wStart + MEMORY_CFG.COMPRESS_BATCH - 1;
    // Не сжимаем повторно если уже есть сводка
    if (mem.archive.some(s => s.from_turn === wStart)) continue;
    _compressBatchAsync(nationId, wStart, wEnd, evts);
  }
}

async function _compressBatchAsync(nationId, fromTurn, toTurn, events) {
  const mem    = GAME_STATE.nations?.[nationId]?.memory;
  const nation = GAME_STATE.nations?.[nationId];
  if (!mem || !nation) return;

  const nationName = nation.name ?? nationId;
  const yearFrom   = Math.abs(Math.floor(-301 + fromTurn / 12));
  const yearTo     = Math.abs(Math.floor(-301 + toTurn   / 12));
  const eventText  = events.map(e => `[${e.type}] ${e.text}`).join('\n').slice(0, 2000);

  const system = `Ты — историограф. Кратко суммируй события государства в 2-3 предложениях.
Только текст на русском языке. Никаких заголовков, JSON, форматирования.`;

  const user = `Государство: ${nationName}
Период: ходы ${fromTurn}–${toTurn} (~${yearFrom}–${yearTo} до н.э.)

СОБЫТИЯ:
${eventText}

Дай краткую историческую сводку этого периода для ${nationName}.`;

  let summary;
  try {
    summary = await callClaude(system, user, 200, CONFIG.MODEL_HAIKU);
    summary = summary.trim().slice(0, 600);
  } catch (_) {
    // Без API: простая механическая сводка
    const types   = [...new Set(events.map(e => e.type))];
    const first   = events[0]?.text?.slice(0, 120) ?? '';
    summary = `Период ${fromTurn}–${toTurn}: ${events.length} событий (${types.join(', ')}). ${first}`;
  }

  mem.archive.push({ from_turn: fromTurn, to_turn: toTurn, summary });

  // Лимит архива
  if (mem.archive.length > MEMORY_CFG.MAX_ARCHIVE) {
    mem.archive = mem.archive.slice(-MEMORY_CFG.MAX_ARCHIVE);
  }
}

// ══════════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ══════════════════════════════════════════════════════════════════════

/**
 * Вернуть краткую статистику памяти нации (для отладки).
 */
function getMemoryStats(nationId) {
  const mem = GAME_STATE.nations?.[nationId]?.memory;
  if (!mem) return null;
  return {
    events:    mem.events.length,
    archive:   mem.archive.length,
    dialogues: Object.fromEntries(
      Object.entries(mem.dialogues).map(([k, v]) => [k, v.length])
    ),
  };
}
