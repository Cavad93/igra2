// ui/diplomacy_tab.js
// Большое окно дипломатии — открывается как полноэкранный overlay.
// Структура: левая колонка = список наций, правая = зал переговоров / архив.

'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЕ
// ──────────────────────────────────────────────────────────────────────────────

let _dpSelectedNation = null;   // string|null — ID выбранной AI-нации
let _dpTab            = 'negotiations'; // 'negotiations' | 'treaties'

// _dtState[aiNationId] = { selectedTreaty: string|null, isLoading: bool }
const _dtState = {};
function _getDtState(id) {
  if (!_dtState[id]) _dtState[id] = { selectedTreaty: null, isLoading: false };
  return _dtState[id];
}

// ──────────────────────────────────────────────────────────────────────────────
// ОТКРЫТЬ / ЗАКРЫТЬ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Открывает дипломатическое окно, опционально фокусируясь на нации.
 * @param {string} [aiNationId]
 */
function showDiplomacyOverlay(aiNationId) {
  if (typeof DiplomacyEngine !== 'undefined') DiplomacyEngine.init?.();

  // Выбираем нацию: переданную, сохранённую, или первую доступную
  const playerNationId = GAME_STATE.player_nation;
  const foreignNations = _getForeignNations(playerNationId);

  if (aiNationId && GAME_STATE.nations[aiNationId]) {
    _dpSelectedNation = aiNationId;
  } else if (!_dpSelectedNation || !GAME_STATE.nations[_dpSelectedNation]) {
    _dpSelectedNation = foreignNations[0]?.id ?? null;
  }

  _dpTab = 'negotiations';

  const el = document.getElementById('diplomacy-overlay');
  if (!el) return;
  el.classList.remove('hidden');
  _dpRender();
}

function hideDiplomacyOverlay() {
  document.getElementById('diplomacy-overlay')?.classList.add('hidden');
}

// ──────────────────────────────────────────────────────────────────────────────
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК / ВЫБОР НАЦИИ
// ──────────────────────────────────────────────────────────────────────────────

function dpSwitchTab(tab) {
  _dpTab = tab;
  _dpRender();
}

function dpSelectNation(aiNationId) {
  _dpSelectedNation = aiNationId;
  _dpTab = 'negotiations';
  _dpRender();
}

// ──────────────────────────────────────────────────────────────────────────────
// ГЛАВНЫЙ РЕНДЕР
// ──────────────────────────────────────────────────────────────────────────────

function _dpRender() {
  const el = document.getElementById('diplomacy-overlay');
  if (!el) return;

  const playerNationId = GAME_STATE.player_nation;
  const playerNation   = GAME_STATE.nations[playerNationId];
  const playerFlag     = playerNation?.flag_emoji ?? '👑';
  const playerName     = playerNation?.name ?? 'Ваша держава';
  const playerRuler    = playerNation?.government?.ruler?.name
    ?? playerNation?.government?.ruler ?? 'Правитель';

  const foreignNations = _getForeignNations(playerNationId);

  el.innerHTML = `
    <div class="dp-backdrop" onclick="hideDiplomacyOverlay()"></div>
    <div class="dp-panel">

      <!-- ШАПКА -->
      <div class="dp-header">
        <div class="dp-header-left">
          <span class="dp-header-icon">🤝</span>
          <div>
            <div class="dp-header-title">Дипломатия</div>
            <div class="dp-header-sub">${playerFlag} ${playerName} · ${playerRuler}</div>
          </div>
        </div>
        <div class="dp-header-tabs">
          <button class="dp-htab${_dpTab === 'negotiations' ? ' dp-htab--active' : ''}"
            onclick="dpSwitchTab('negotiations')">🏛 Переговоры</button>
          <button class="dp-htab${_dpTab === 'treaties' ? ' dp-htab--active' : ''}"
            onclick="dpSwitchTab('treaties')">📜 Все договоры</button>
        </div>
        <button class="dp-close-btn" onclick="hideDiplomacyOverlay()">✕</button>
      </div>

      <!-- ТЕЛО -->
      <div class="dp-body">

        <!-- ЛЕВАЯ КОЛОНКА: СПИСОК НАЦИЙ -->
        <div class="dp-sidebar">
          <div class="dp-sidebar-title">Государства</div>
          <div class="dp-nations-list">
            ${foreignNations.map(n => _dpNationRow(n, playerNationId)).join('')}
            ${foreignNations.length === 0
              ? '<div class="dp-no-nations">Нет известных государств</div>' : ''}
          </div>
        </div>

        <!-- ПРАВАЯ ЧАСТЬ -->
        <div class="dp-main">
          ${_dpTab === 'negotiations'
            ? _dpRenderNegotiation(playerNationId, foreignNations)
            : _dpRenderTreatiesTab(playerNationId)}
        </div>

      </div>
    </div>`;

  // Прокрутка чата вниз после рендера
  if (_dpSelectedNation) {
    requestAnimationFrame(() => {
      const chat = document.getElementById(`dp-chat-${_dpSelectedNation}`);
      if (chat) chat.scrollTop = chat.scrollHeight;
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ЛЕВАЯ КОЛОНКА — строка нации
// ──────────────────────────────────────────────────────────────────────────────

function _dpNationRow(n, playerNationId) {
  const rel   = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationScore(playerNationId, n.id) : 0;
  const label = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationLabel(rel) : 'Нейтральные';
  const atWar = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, n.id);
  const pct   = Math.round((rel + 100) / 2);
  const color = _relColor(rel);
  const isSelected = _dpSelectedNation === n.id;

  // Сколько активных договоров
  const treaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, n.id) : [];
  const treatyBadge = treaties.length > 0
    ? `<span class="dp-treaty-badge" title="${treaties.map(t => TREATY_TYPES?.[t.type]?.label ?? t.type).join(', ')}">${treaties.length}</span>`
    : '';

  return `<div class="dp-nation-row${isSelected ? ' dp-nation-row--active' : ''}"
    onclick="dpSelectNation('${n.id}')">
    <span class="dp-nflag">${n.flag ?? '🏛'}</span>
    <div class="dp-ninfo">
      <div class="dp-nname">${n.name}${treatyBadge}</div>
      <div class="dp-nrelbar">
        <div class="dp-nrelbar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="dp-nrel-label" style="color:${color}">
        ${atWar ? '⚔ Война' : label + ' (' + (rel >= 0 ? '+' : '') + rel + ')'}
      </div>
    </div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// ПРАВАЯ ЧАСТЬ — зал переговоров
// ──────────────────────────────────────────────────────────────────────────────

function _dpRenderNegotiation(playerNationId, foreignNations) {
  if (!_dpSelectedNation || !GAME_STATE.nations[_dpSelectedNation]) {
    if (foreignNations.length === 0) {
      return '<div class="dp-placeholder"><div class="dp-placeholder-icon">🌍</div><div>Нет известных государств</div></div>';
    }
    return '<div class="dp-placeholder"><div class="dp-placeholder-icon">👈</div><div>Выберите государство слева</div></div>';
  }

  const aiId     = _dpSelectedNation;
  const aiNation = GAME_STATE.nations[aiId];
  const aiName   = aiNation.name;
  const aiFlag   = aiNation.flag_emoji ?? '🏛';
  const aiRuler  = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  const aiGov    = aiNation.government?.type ?? '';

  const rel      = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationScore(playerNationId, aiId) : 0;
  const relLabel = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationLabel(rel) : 'Нейтральные';
  const atWar    = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiId);
  const color    = _relColor(rel);
  const pct      = Math.round((rel + 100) / 2);

  const activeTreaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, aiId) : [];
  const activeTreatiesHtml = activeTreaties.length > 0
    ? `<div class="dp-active-treaties">
        ${activeTreaties.map(t => {
          const def = TREATY_TYPES?.[t.type];
          return `<span class="dp-active-tag" title="${def?.description ?? ''}">${def?.icon ?? '📜'} ${def?.label ?? t.type}</span>`;
        }).join('')}
       </div>` : '';

  const st = _getDtState(aiId);

  // Кнопки типов договоров
  const treatyGrid = Object.entries(TREATY_TYPES ?? {}).map(([key, def]) => {
    const isActive = st.selectedTreaty === key;
    return `<button class="dp-treaty-btn${isActive ? ' dp-treaty-btn--active' : ''}"
      title="${def.description ?? ''}"
      onclick="dtSelectTreaty('${aiId}','${key}')">
      <span class="dp-tbtn-icon">${def.icon}</span>
      <span class="dp-tbtn-label">${def.label}</span>
    </button>`;
  }).join('');

  // Чат-история
  const playerNation = GAME_STATE.nations[playerNationId];
  const playerFlag   = playerNation?.flag_emoji ?? '👑';
  const playerName   = playerNation?.name ?? 'Вы';
  const dialogue = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getDialogue(playerNationId, aiId) : [];

  const chatHtml = dialogue.length > 0
    ? dialogue.map(msg => {
        const isPlayer = msg.role === 'user';
        const isSystem = msg.role === 'system';
        const cls    = isPlayer ? 'dp-msg dp-msg--player'
          : isSystem ? 'dp-msg dp-msg--system' : 'dp-msg dp-msg--ai';
        const avatar = isPlayer ? playerFlag : isSystem ? '⚙' : aiFlag;
        const name   = isPlayer ? playerName : isSystem ? '' : aiRuler;
        const text   = msg.displayText ?? msg.text;
        return `<div class="${cls}">
          <div class="dp-msg-avatar">${avatar}</div>
          <div class="dp-msg-bubble">
            ${name ? `<div class="dp-msg-name">${name}</div>` : ''}
            <div class="dp-msg-text">${_escHtml(text)}</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="dp-chat-empty">
        <div class="dp-chat-empty-icon">${aiFlag}</div>
        <div>Напишите обращение к ${aiRuler} и нажмите «Отправить»</div>
      </div>`;

  const selectedTag = st.selectedTreaty
    ? `<div class="dp-selected-proposal">
        ${TREATY_TYPES?.[st.selectedTreaty]?.icon ?? '📜'}
        <strong>${TREATY_TYPES?.[st.selectedTreaty]?.label ?? st.selectedTreaty}</strong>
        <button class="dp-sel-clear" onclick="dtSelectTreaty('${aiId}',null)">✕</button>
      </div>` : '';

  return `
    <!-- ШАПКА НАЦИИ -->
    <div class="dp-nation-header" style="border-bottom: 2px solid ${color}33">
      <span class="dp-nflag-lg">${aiFlag}</span>
      <div class="dp-nation-header-info">
        <div class="dp-nation-header-name">${aiName}</div>
        <div class="dp-nation-header-ruler">${aiRuler}${aiGov ? ` · ${aiGov}` : ''}</div>
        ${activeTreatiesHtml}
      </div>
      <div class="dp-nation-header-rel">
        <div class="dp-relbar-wrap">
          <div class="dp-relbar-track">
            <div class="dp-relbar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="dp-rellabel" style="color:${color}">
            ${atWar ? '⚔ ВОЙНА' : relLabel + ' (' + (rel >= 0 ? '+' : '') + rel + ')'}
          </span>
        </div>
        <div class="dp-nation-stats">
          <span>👥 ${(aiNation.population ?? 0).toLocaleString()}</span>
          <span>💰 ${Math.round(aiNation.economy?.treasury ?? 0).toLocaleString()}</span>
        </div>
      </div>
    </div>

    <!-- ПРЕДЛОЖИТЬ ДОГОВОР -->
    <div class="dp-section">
      <div class="dp-section-title">Предложить договор</div>
      <div class="dp-treaty-grid">${treatyGrid}</div>
      ${selectedTag}
    </div>

    <!-- ДИАЛОГ -->
    <div class="dp-section dp-section--chat">
      <div class="dp-section-title-row">
        <span class="dp-section-title">История переговоров</span>
        ${dialogue.length > 0 ? `<button class="dp-clear-chat" onclick="dtClearDialogue('${aiId}')">Очистить</button>` : ''}
      </div>
      <div class="dp-chat" id="dp-chat-${aiId}">${chatHtml}</div>
    </div>

    <!-- ПОЛЕ ВВОДА -->
    <div class="dp-input-area">
      <textarea class="dp-textarea" id="dp-input-${aiId}" rows="3"
        placeholder="Напишите обращение к ${aiRuler}..."
        onkeydown="if(event.ctrlKey&&event.key==='Enter')dtSendMessage('${aiId}')"
      ></textarea>
      <div class="dp-input-actions">
        <span class="dp-input-hint">Ctrl+Enter — отправить</span>
        <button class="dp-send-btn" id="dp-send-${aiId}"
          onclick="dtSendMessage('${aiId}')"
          ${st.isLoading ? 'disabled' : ''}>
          ${st.isLoading
            ? '<span class="dp-spinner">⏳</span> Ожидание ответа...'
            : '📨 Отправить'}
        </button>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────────────
// ПРАВАЯ ЧАСТЬ — все договоры
// ──────────────────────────────────────────────────────────────────────────────

function _dpRenderTreatiesTab(playerNationId) {
  const allTreaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getAllTreaties(playerNationId) : [];

  if (allTreaties.length === 0) {
    return `<div class="dp-placeholder">
      <div class="dp-placeholder-icon">📜</div>
      <div>Архив договоров пуст</div>
      <div class="dp-placeholder-sub">Заключайте договоры на вкладке «Переговоры»</div>
    </div>`;
  }

  const active   = allTreaties.filter(t => t.status === 'active');
  const inactive = allTreaties.filter(t => t.status !== 'active');

  const treatyRow = (t) => {
    const def      = TREATY_TYPES?.[t.type];
    const icon     = def?.icon    ?? '📜';
    const label    = def?.label   ?? t.type;
    const otherParty = t.parties.find(p => p !== playerNationId) ?? '';
    const otherNation = GAME_STATE.nations[otherParty];
    const otherName = otherNation?.name ?? otherParty;
    const otherFlag = otherNation?.flag_emoji ?? '🏛';

    const statusMap = {
      active:   { icon: '✅', label: 'Действует',   cls: 'status--active'   },
      expired:  { icon: '⏰', label: 'Истёк',       cls: 'status--expired'  },
      broken:   { icon: '💔', label: 'Нарушен',     cls: 'status--broken'   },
      rejected: { icon: '❌', label: 'Отклонён',    cls: 'status--rejected' },
      pending:  { icon: '⏳', label: 'На рассмотрении', cls: 'status--pending' },
    };
    const sts  = statusMap[t.status] ?? { icon: '📄', label: t.status, cls: '' };
    const turn = t.turn_signed ? `Ход ${t.turn_signed}` : '';
    const dur  = t.duration    ? `· ${t.duration} ходов` : '';

    const condNotes = t.conditions?.notes
      ? `<div class="dp-arc-notes">${t.conditions.notes}</div>` : '';

    const breakBtn = t.status === 'active'
      ? `<button class="dp-break-btn" onclick="dtBreakTreaty('${t.id}')">Разорвать</button>` : '';

    return `<div class="dp-arc-row">
      <div class="dp-arc-icon">${icon}</div>
      <div class="dp-arc-body">
        <div class="dp-arc-top">
          <span class="dp-arc-label">${label}</span>
          <span class="dp-arc-nation">${otherFlag} ${otherName}</span>
          <span class="dp-arc-status ${sts.cls}">${sts.icon} ${sts.label}</span>
          <span class="dp-arc-turn">${turn} ${dur}</span>
          ${breakBtn}
        </div>
        ${condNotes}
        ${def?.description ? `<div class="dp-arc-desc">${def.description}</div>` : ''}
      </div>
    </div>`;
  };

  return `
    <div class="dp-treaties-view">
      ${active.length > 0 ? `
        <div class="dp-treaties-section">
          <div class="dp-treaties-section-title">✅ Действующие договоры (${active.length})</div>
          ${active.map(treatyRow).join('')}
        </div>` : ''}
      ${inactive.length > 0 ? `
        <div class="dp-treaties-section">
          <div class="dp-treaties-section-title">📁 Архив (${inactive.length})</div>
          ${inactive.map(treatyRow).join('')}
        </div>` : ''}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────────────
// ОБРАБОТЧИКИ ДЕЙСТВИЙ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Выбор / сброс типа договора.
 */
function dtSelectTreaty(aiNationId, key) {
  _getDtState(aiNationId).selectedTreaty = key || null;
  _dpRender();
}

/**
 * Отправка сообщения + получение ответа AI-лидера.
 */
async function dtSendMessage(aiNationId) {
  const playerNationId = GAME_STATE.player_nation;
  const inputEl = document.getElementById(`dp-input-${aiNationId}`);
  if (!inputEl) return;

  const userText = inputEl.value.trim();
  if (!userText) {
    inputEl.classList.add('dp-shake');
    setTimeout(() => inputEl.classList.remove('dp-shake'), 400);
    return;
  }

  const st = _getDtState(aiNationId);
  if (st.isLoading) return;

  // Полный текст с пометкой типа договора
  let fullText = userText;
  if (st.selectedTreaty && TREATY_TYPES?.[st.selectedTreaty]) {
    const def = TREATY_TYPES[st.selectedTreaty];
    fullText = `[Предложение: ${def.icon} ${def.label}]\n${userText}`;
  }

  // Сохраняем сообщение игрока
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.addMessage(playerNationId, aiNationId, 'user', fullText, userText);
  }

  inputEl.value = '';
  st.isLoading  = true;
  _dpRender();

  try {
    // Строим messages[] для API
    const dialogue   = typeof DiplomacyEngine !== 'undefined'
      ? DiplomacyEngine.getDialogue(playerNationId, aiNationId) : [];
    const apiMessages = dialogue.map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    const rawResponse = await callDiplomacyAI(aiNationId, playerNationId, apiMessages);
    const treaty      = parseDiplomacyTreaty(rawResponse);
    const display     = stripDiplomacyJSON(rawResponse);

    // Сохраняем ответ лидера
    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'assistant', rawResponse, display);
    }

    // Обрабатываем результат переговоров
    if (treaty?.agreed === true && treaty.treaty_type) {
      _dtFinalizeTreaty(playerNationId, aiNationId, treaty, dialogue);
    } else if (treaty?.agreed === false) {
      if (typeof DiplomacyEngine !== 'undefined' && st.selectedTreaty) {
        DiplomacyEngine.recordRejection(playerNationId, aiNationId, st.selectedTreaty);
      }
      st.selectedTreaty = null;
    }

  } catch (err) {
    console.error('[dtSendMessage]', err);
    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'system',
        `[Ошибка: ${err.message}]`, `⚠ Ошибка связи: ${err.message}`);
    }
  } finally {
    st.isLoading = false;
    _dpRender();
  }
}

/**
 * Очистить историю диалога с нацией.
 */
function dtClearDialogue(aiNationId) {
  const playerNationId = GAME_STATE.player_nation;
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.clearDialogue(playerNationId, aiNationId);
  }
  _getDtState(aiNationId).selectedTreaty = null;
  _dpRender();
}

/**
 * Разорвать договор по ID.
 */
function dtBreakTreaty(treatyId) {
  const playerNationId = GAME_STATE.player_nation;
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.breakTreaty(treatyId, playerNationId);
  }
  _dpRender();
}

// ──────────────────────────────────────────────────────────────────────────────
// ВНУТРЕННИЕ УТИЛИТЫ
// ──────────────────────────────────────────────────────────────────────────────

function _dtFinalizeTreaty(playerNationId, aiNationId, treaty, dialogueLog) {
  if (typeof DiplomacyEngine === 'undefined') return;

  const duration = treaty.conditions?.duration
    ?? TREATY_TYPES?.[treaty.treaty_type]?.default_duration ?? 10;

  DiplomacyEngine.createTreaty(
    playerNationId, aiNationId, treaty.treaty_type,
    { ...treaty.conditions, duration },
    dialogueLog,
  );

  const def        = TREATY_TYPES?.[treaty.treaty_type];
  const aiNation   = GAME_STATE.nations[aiNationId];
  const playerNation = GAME_STATE.nations[playerNationId];

  if (typeof addLogEntry === 'function') {
    addLogEntry('diplomacy',
      `${def?.icon ?? '📜'} Подписан договор "${def?.label ?? treaty.treaty_type}" между ${playerNation?.name ?? 'вами'} и ${aiNation?.name ?? aiNationId}.`
    );
  }

  _getDtState(aiNationId).selectedTreaty = null;
}

/** Возвращает список чужих наций с метаданными, отсортированных по отношению (убывание). */
function _getForeignNations(playerNationId) {
  return Object.entries(GAME_STATE.nations ?? {})
    .filter(([id]) => id !== playerNationId)
    .map(([id, n]) => ({
      id,
      name: n.name,
      flag: n.flag_emoji ?? '🏛',
    }))
    .sort((a, b) => {
      const ra = typeof DiplomacyEngine !== 'undefined'
        ? DiplomacyEngine.getRelationScore(playerNationId, a.id) : 0;
      const rb = typeof DiplomacyEngine !== 'undefined'
        ? DiplomacyEngine.getRelationScore(playerNationId, b.id) : 0;
      return rb - ra;
    });
}

function _relColor(score) {
  if (score >= 50)  return '#4caf50';
  if (score >= 15)  return '#8bc34a';
  if (score >= -15) return '#ffc107';
  if (score >= -50) return '#ff9800';
  return '#f44336';
}

function _escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ──────────────────────────────────────────────────────────────────────────────
// РЕНДЕР ВКЛАДКИ В МАЛЕНЬКОЙ ПАНЕЛИ РЕГИОНА (кнопка-редирект)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Вызывается из map.js для рендера содержимого вкладки «Дипломатия»
 * внутри маленькой панели региона — просто показывает кнопку открытия.
 */
function renderDiplomacyTab(regionId) {
  const gameRegion     = GAME_STATE.regions[regionId];
  const aiNationId     = gameRegion?.nation;
  const playerNationId = GAME_STATE.player_nation;

  if (!aiNationId || aiNationId === playerNationId) {
    return '<div class="dp-redir-box"><span>Это ваш регион</span></div>';
  }

  const aiNation  = GAME_STATE.nations[aiNationId];
  const aiName    = aiNation?.name ?? '?';
  const aiFlag    = aiNation?.flag_emoji ?? '🏛';
  const aiRuler   = aiNation?.government?.ruler?.name
    ?? aiNation?.government?.ruler ?? 'Правитель';

  const rel       = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationScore(playerNationId, aiNationId) : 0;
  const relLabel  = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationLabel(rel) : 'Нейтральные';
  const atWar     = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiNationId);
  const color     = _relColor(rel);
  const pct       = Math.round((rel + 100) / 2);

  const treaties  = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, aiNationId) : [];
  const treatyList = treaties.length > 0
    ? treaties.map(t => {
        const def = TREATY_TYPES?.[t.type];
        return `<span class="dp-mini-tag">${def?.icon ?? '📜'} ${def?.label ?? t.type}</span>`;
      }).join('')
    : '<span class="dp-mini-none">Нет договоров</span>';

  return `<div class="dp-redir-box">
    <div class="dp-redir-nation">
      <span class="dp-redir-flag">${aiFlag}</span>
      <div>
        <div class="dp-redir-name">${aiName}</div>
        <div class="dp-redir-ruler">${aiRuler}</div>
      </div>
    </div>
    <div class="dp-redir-rel">
      <div class="dp-redir-bar">
        <div class="dp-redir-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="dp-redir-rlabel" style="color:${color}">
        ${atWar ? '⚔ ВОЙНА' : relLabel + ' (' + (rel >= 0 ? '+' : '') + rel + ')'}
      </span>
    </div>
    <div class="dp-redir-treaties">${treatyList}</div>
    <button class="dp-redir-btn" onclick="showDiplomacyOverlay('${aiNationId}')">
      🤝 Открыть зал переговоров
    </button>
  </div>`;
}
