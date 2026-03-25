// ui/diplomacy_tab.js
// Вкладка дипломатии в панели региона — «Зал переговоров»
//
// Структура вкладки:
//   1. Статус отношений (полоса + метка)
//   2. Активные договоры
//   3. Выбор типа предложения (кнопки)
//   4. Чат-диалог с лидером
//   5. Поле ввода + кнопки
//   6. Архив всех договоров

'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЕ ВКЛАДКИ
// ──────────────────────────────────────────────────────────────────────────────

// _dtState[aiNationId] = { selectedTreaty: string|null, isLoading: bool }
const _dtState = {};

function _getDtState(aiNationId) {
  if (!_dtState[aiNationId]) {
    _dtState[aiNationId] = { selectedTreaty: null, isLoading: false };
  }
  return _dtState[aiNationId];
}

// ──────────────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Рендерит HTML вкладки дипломатии для чужого региона.
 * @param {string} regionId
 * @returns {string} HTML
 */
function renderDiplomacyTab(regionId) {
  const gameRegion   = GAME_STATE.regions[regionId];
  const aiNationId   = gameRegion?.nation;
  const playerNationId = GAME_STATE.player_nation;

  if (!aiNationId || aiNationId === playerNationId) {
    return `<div class="dt-empty">Это ваш регион — дипломатия недоступна.</div>`;
  }

  const aiNation   = GAME_STATE.nations[aiNationId];
  if (!aiNation) return `<div class="dt-empty">Нация не найдена.</div>`;

  const aiName     = aiNation.name;
  const aiRuler    = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? '?';
  const aiGovType  = aiNation.government?.type ?? '';
  const aiFlag     = aiNation.flag_emoji ?? '🏛';

  // Инициализация системы дипломатии если нужно
  if (typeof DiplomacyEngine !== 'undefined') DiplomacyEngine.init?.();

  const relScore = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationScore(playerNationId, aiNationId)
    : 0;
  const relLabel = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationLabel(relScore)
    : 'Нейтральные';
  const atWar = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiNationId);

  const st = _getDtState(aiNationId);

  // ── Блок 1: шапка + статус ──
  const relPct  = Math.round((relScore + 100) / 2); // 0..100%
  const relColor = relScore >= 50 ? '#4caf50' : relScore >= 0 ? '#ffc107' : relScore >= -50 ? '#ff9800' : '#f44336';
  const warBadge = atWar
    ? `<span class="dt-war-badge">⚔ ВОЙНА</span>` : '';

  const headerHtml = `
    <div class="dt-header">
      <span class="dt-flag">${aiFlag}</span>
      <div class="dt-header-info">
        <div class="dt-nation-name">${aiName}</div>
        <div class="dt-ruler-name">${aiRuler}${aiGovType ? ` · ${aiGovType}` : ''}</div>
      </div>
      ${warBadge}
    </div>
    <div class="dt-relation">
      <div class="dt-relation-bar">
        <div class="dt-relation-fill" style="width:${relPct}%; background:${relColor}"></div>
      </div>
      <span class="dt-relation-label" style="color:${relColor}">${relLabel} (${relScore > 0 ? '+' : ''}${relScore})</span>
    </div>`;

  // ── Блок 2: активные договоры ──
  const activeTreaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, aiNationId)
    : [];
  let activeTreatiesHtml = '';
  if (activeTreaties.length > 0) {
    const rows = activeTreaties.map(t => {
      const def = TREATY_TYPES?.[t.type];
      const label = def?.label ?? t.type;
      const icon  = def?.icon  ?? '📜';
      const left  = t.duration ? `ещё ${t.duration - ((GAME_STATE.date?.turn ?? 0) - t.turn_signed)} ходов` : 'бессрочно';
      return `<div class="dt-treaty-row"><span>${icon} ${label}</span><span class="dt-treaty-left">${left}</span></div>`;
    }).join('');
    activeTreatiesHtml = `
      <div class="dt-section-title">Действующие договоры</div>
      <div class="dt-active-treaties">${rows}</div>`;
  }

  // ── Блок 3: выбор типа предложения ──
  const treatyButtons = Object.entries(TREATY_TYPES ?? {}).map(([key, def]) => {
    const active = st.selectedTreaty === key ? ' dt-treaty-btn--active' : '';
    return `<button class="dt-treaty-btn${active}" title="${def.description ?? ''}"
      onclick="dtSelectTreaty('${aiNationId}','${key}')">${def.icon} ${def.label}</button>`;
  }).join('');

  const proposalHtml = `
    <div class="dt-section-title">Предложить договор</div>
    <div class="dt-treaty-grid">${treatyButtons}</div>
    ${st.selectedTreaty ? `<div class="dt-selected-tag">
      Выбрано: ${TREATY_TYPES?.[st.selectedTreaty]?.icon ?? ''} <strong>${TREATY_TYPES?.[st.selectedTreaty]?.label ?? st.selectedTreaty}</strong>
      <button class="dt-clear-btn" onclick="dtSelectTreaty('${aiNationId}',null)">✕</button>
    </div>` : ''}`;

  // ── Блок 4: чат-диалог ──
  const dialogue = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getDialogue(playerNationId, aiNationId)
    : [];

  let chatHtml = '';
  if (dialogue.length > 0) {
    const playerNation = GAME_STATE.nations[playerNationId];
    const playerFlag   = playerNation?.flag_emoji ?? '👑';
    const msgs = dialogue.map(msg => {
      const isPlayer = msg.role === 'user';
      const cls    = isPlayer ? 'dt-msg dt-msg--player' : 'dt-msg dt-msg--ai';
      const avatar = isPlayer ? playerFlag : aiFlag;
      const name   = isPlayer ? (playerNation?.name ?? 'Вы') : aiRuler;
      const textDisplay = msg.displayText ?? msg.text;
      return `<div class="${cls}">
        <span class="dt-msg-avatar">${avatar}</span>
        <div class="dt-msg-body">
          <span class="dt-msg-name">${name}</span>
          <span class="dt-msg-text">${_escHtml(textDisplay)}</span>
        </div>
      </div>`;
    }).join('');
    chatHtml = `
      <div class="dt-section-title">Диалог</div>
      <div class="dt-chat" id="dt-chat-${aiNationId}">${msgs}</div>
      <button class="dt-clear-chat-btn" onclick="dtClearDialogue('${aiNationId}')">Очистить диалог</button>`;
  }

  // ── Блок 5: поле ввода ──
  const inputHtml = `
    <div class="dt-section-title">Ваше обращение</div>
    <textarea class="dt-input" id="dt-input-${aiNationId}" rows="3"
      placeholder="Напишите обращение к ${aiRuler}..."
    ></textarea>
    <div class="dt-actions">
      <button class="dt-send-btn" id="dt-send-${aiNationId}"
        onclick="dtSendMessage('${aiNationId}')"
        ${st.isLoading ? 'disabled' : ''}>
        ${st.isLoading ? '⏳ Ожидание ответа...' : '📨 Отправить'}
      </button>
    </div>`;

  // ── Блок 6: архив договоров ──
  const allTreaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getAllTreaties(playerNationId).filter(t =>
        t.parties.includes(aiNationId))
    : [];
  let archiveHtml = '';
  if (allTreaties.length > 0) {
    const rows = allTreaties.map(t => {
      const def     = TREATY_TYPES?.[t.type];
      const label   = def?.label ?? t.type;
      const icon    = def?.icon  ?? '📜';
      const statusIcon = t.status === 'active' ? '✅' : t.status === 'expired' ? '⏰' : t.status === 'broken' ? '💔' : t.status === 'rejected' ? '❌' : '📄';
      const statusLabel = t.status === 'active' ? 'Действует' : t.status === 'expired' ? 'Истёк' : t.status === 'broken' ? 'Нарушен' : t.status === 'rejected' ? 'Отклонён' : t.status;
      const signed = t.turn_signed ? `Ход ${t.turn_signed}` : '';
      return `<div class="dt-archive-row">
        <span class="dt-archive-icon">${icon}</span>
        <span class="dt-archive-label">${label}</span>
        <span class="dt-archive-status">${statusIcon} ${statusLabel}</span>
        <span class="dt-archive-turn">${signed}</span>
      </div>`;
    }).join('');
    archiveHtml = `
      <div class="dt-section-title">Архив договоров</div>
      <div class="dt-archive">${rows}</div>`;
  }

  return `<div class="dt-root" data-ai-nation="${aiNationId}">
    ${headerHtml}
    ${activeTreatiesHtml}
    ${proposalHtml}
    ${chatHtml}
    ${inputHtml}
    ${archiveHtml}
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// ОБРАБОТЧИКИ ДЕЙСТВИЙ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Выбрать/снять тип договора.
 */
function dtSelectTreaty(aiNationId, treatyKey) {
  const st = _getDtState(aiNationId);
  st.selectedTreaty = treatyKey || null;
  _dtRefresh(aiNationId);
}

/**
 * Отправить сообщение игрока и получить ответ AI-лидера.
 */
async function dtSendMessage(aiNationId) {
  if (!aiNationId) return;

  const playerNationId = GAME_STATE.player_nation;
  const inputEl = document.getElementById(`dt-input-${aiNationId}`);
  if (!inputEl) return;

  const userText = inputEl.value.trim();
  if (!userText) {
    inputEl.classList.add('dt-input--shake');
    setTimeout(() => inputEl.classList.remove('dt-input--shake'), 400);
    return;
  }

  const st = _getDtState(aiNationId);
  if (st.isLoading) return;

  // Формируем полное сообщение (с указанием типа договора если выбран)
  let fullMessage = userText;
  if (st.selectedTreaty && TREATY_TYPES?.[st.selectedTreaty]) {
    const def = TREATY_TYPES[st.selectedTreaty];
    fullMessage = `[Предложение: ${def.icon} ${def.label}]\n${userText}`;
  }

  // Добавляем сообщение игрока в историю
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.addMessage(playerNationId, aiNationId, 'user', fullMessage, userText);
  }

  inputEl.value = '';
  st.isLoading  = true;
  _dtRefresh(aiNationId);

  // Прокручиваем чат вниз
  _dtScrollChat(aiNationId);

  try {
    // Строим messages[] для API из истории диалога
    const dialogue = typeof DiplomacyEngine !== 'undefined'
      ? DiplomacyEngine.getDialogue(playerNationId, aiNationId)
      : [];

    // Конвертируем историю в формат API (user/assistant)
    const apiMessages = dialogue.map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    // Вызываем AI
    const rawResponse = await callDiplomacyAI(aiNationId, playerNationId, apiMessages);

    // Разбираем ответ
    const treaty  = parseDiplomacyTreaty(rawResponse);
    const display = stripDiplomacyJSON(rawResponse);

    // Сохраняем ответ лидера в историю
    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'assistant', rawResponse, display);
    }

    // Обрабатываем договор если принят
    if (treaty?.agreed === true && treaty.treaty_type) {
      _dtSignTreaty(playerNationId, aiNationId, treaty.treaty_type, treaty.conditions ?? {}, dialogue);
    } else if (treaty?.agreed === false) {
      // Отклонено — добавляем в архив как rejected
      if (typeof DiplomacyEngine !== 'undefined' && st.selectedTreaty) {
        DiplomacyEngine.recordRejection(playerNationId, aiNationId, st.selectedTreaty);
      }
      st.selectedTreaty = null;
    }

  } catch (err) {
    console.error('[dtSendMessage]', err);
    // Показываем ошибку как системное сообщение
    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'system',
        `[Ошибка связи: ${err.message}]`, `⚠ Ошибка: ${err.message}`);
    }
  } finally {
    st.isLoading = false;
    _dtRefresh(aiNationId);
    _dtScrollChat(aiNationId);
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
  _dtRefresh(aiNationId);
}

// ──────────────────────────────────────────────────────────────────────────────
// ВНУТРЕННИЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Подписывает договор и уведомляет в лог.
 */
function _dtSignTreaty(playerNationId, aiNationId, treatyType, conditions, dialogueLog) {
  if (typeof DiplomacyEngine === 'undefined') return;

  const duration = conditions.duration ?? TREATY_TYPES?.[treatyType]?.default_duration ?? 10;
  const treaty   = DiplomacyEngine.createTreaty(
    playerNationId, aiNationId, treatyType,
    { ...conditions, duration },
    dialogueLog,
  );

  const def = TREATY_TYPES?.[treatyType];
  const aiNation     = GAME_STATE.nations[aiNationId];
  const playerNation = GAME_STATE.nations[playerNationId];

  // Лог события
  if (typeof addLogEntry === 'function') {
    addLogEntry('diplomacy',
      `${def?.icon ?? '📜'} Договор "${def?.label ?? treatyType}" подписан между ${playerNation?.name ?? 'вами'} и ${aiNation?.name ?? aiNationId}.`
    );
  }

  // Сбрасываем выбранный тип
  _getDtState(aiNationId).selectedTreaty = null;

  return treaty;
}

/**
 * Перерендеривает вкладку дипломатии без перезагрузки всей панели.
 */
function _dtRefresh(aiNationId) {
  // Находим текущий открытый регион
  const regionId = window.selectedRegionId;
  if (!regionId) return;

  const gameRegion = GAME_STATE.regions[regionId];
  if (!gameRegion || gameRegion.nation !== aiNationId) return;

  const container = document.getElementById('region-tab-diplomacy');
  if (!container) return;

  container.innerHTML = renderDiplomacyTab(regionId);
  _dtScrollChat(aiNationId);
}

/**
 * Прокручивает чат вниз.
 */
function _dtScrollChat(aiNationId) {
  requestAnimationFrame(() => {
    const chatEl = document.getElementById(`dt-chat-${aiNationId}`);
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  });
}

/**
 * Экранирует HTML-спецсимволы.
 */
function _escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
