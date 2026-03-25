// ui/diplomacy_tab.js  — Дипломатическое окно (overlay)
// Открывается как большой оверлей при клике «🤝 Дипломатия» в панели региона.

'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЕ
// ──────────────────────────────────────────────────────────────────────────────

let _dpSelectedNation = null;     // string|null
let _dpTab            = 'negotiations'; // 'negotiations' | 'treaties'

const _dtState = {};
function _getDtState(id) {
  if (!_dtState[id]) _dtState[id] = { selectedTreaty: null, isLoading: false };
  return _dtState[id];
}

// ──────────────────────────────────────────────────────────────────────────────
// УТИЛИТЫ: отношения и форматирование
// ──────────────────────────────────────────────────────────────────────────────

/** Безопасное получение объекта отношений {label,color,icon} */
function _dpRelObj(playerNationId, aiNationId) {
  if (typeof DiplomacyEngine === 'undefined') {
    return { label: 'Нейтральные', color: '#9e9e9e', icon: '⚪' };
  }
  const score = DiplomacyEngine.getRelationScore(playerNationId, aiNationId);
  const obj   = DiplomacyEngine.getRelationLabel(score);
  // getRelationLabel возвращает { label, color, icon }
  return { score, ...obj };
}

/** Численность нации (nation.population может быть объектом) */
function _dpPopNum(nation) {
  const pop = nation?.population;
  if (!pop) return 0;
  if (typeof pop === 'number') return pop;
  return pop.total ?? pop.count ?? 0;
}

function _escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ──────────────────────────────────────────────────────────────────────────────
// ОТКРЫТЬ / ЗАКРЫТЬ
// ──────────────────────────────────────────────────────────────────────────────

function showDiplomacyOverlay(aiNationId) {
  if (typeof DiplomacyEngine !== 'undefined') DiplomacyEngine.init?.();

  const playerNationId = GAME_STATE.player_nation;
  const foreign        = _getForeignNations(playerNationId);

  _dpSelectedNation = (aiNationId && GAME_STATE.nations[aiNationId])
    ? aiNationId
    : (_dpSelectedNation && GAME_STATE.nations[_dpSelectedNation]
        ? _dpSelectedNation
        : foreign[0]?.id ?? null);
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
// ПЕРЕКЛЮЧЕНИЕ
// ──────────────────────────────────────────────────────────────────────────────

function dpSwitchTab(tab) { _dpTab = tab; _dpRender(); }

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

  const foreign = _getForeignNations(playerNationId);

  el.innerHTML = `
    <div class="dp-backdrop" onclick="hideDiplomacyOverlay()"></div>
    <div class="dp-panel">

      <!-- ═══ ШАПКА ═══ -->
      <div class="dp-header">
        <div class="dp-header-brand">
          <div class="dp-header-emblem">🤝</div>
          <div>
            <div class="dp-header-title">Дипломатия</div>
            <div class="dp-header-sub">${playerFlag} ${playerName} · ${playerRuler}</div>
          </div>
        </div>
        <nav class="dp-nav">
          <button class="dp-nav-btn${_dpTab === 'negotiations' ? ' dp-nav-btn--active' : ''}"
            onclick="dpSwitchTab('negotiations')">
            <span class="dp-nav-icon">🏛</span> Переговоры
          </button>
          <button class="dp-nav-btn${_dpTab === 'treaties' ? ' dp-nav-btn--active' : ''}"
            onclick="dpSwitchTab('treaties')">
            <span class="dp-nav-icon">📜</span> Все договоры
          </button>
        </nav>
        <button class="dp-close" onclick="hideDiplomacyOverlay()" title="Закрыть">✕</button>
      </div>

      <!-- ═══ ТЕЛО ═══ -->
      <div class="dp-body">

        <!-- ЛЕВАЯ КОЛОНКА: НАЦИИ -->
        <aside class="dp-sidebar">
          <div class="dp-sidebar-hdr">Государства
            <span class="dp-sidebar-count">${foreign.length}</span>
          </div>
          <div class="dp-nations-list">
            ${foreign.map(n => _dpNationRow(n, playerNationId)).join('')}
            ${foreign.length === 0
              ? '<div class="dp-no-nations">Нет известных государств</div>' : ''}
          </div>
        </aside>

        <!-- ПРАВАЯ ЧАСТЬ -->
        <main class="dp-main">
          ${_dpTab === 'negotiations'
            ? _dpRenderNegotiation(playerNationId, foreign)
            : _dpRenderTreatiesTab(playerNationId)}
        </main>

      </div>
    </div>`;

  // Прокрутить чат вниз
  if (_dpSelectedNation) {
    requestAnimationFrame(() => {
      const chat = document.getElementById(`dp-chat-${_dpSelectedNation}`);
      if (chat) chat.scrollTop = chat.scrollHeight;
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ЛЕВАЯ КОЛОНКА — карточка нации
// ──────────────────────────────────────────────────────────────────────────────

function _dpNationRow(n, playerNationId) {
  const rel     = _dpRelObj(playerNationId, n.id);
  const atWar   = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, n.id);
  const pct     = Math.round(((rel.score ?? 0) + 100) / 2);
  const active  = _dpSelectedNation === n.id;

  const treaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, n.id) : [];

  return `
    <div class="dp-nation-card${active ? ' dp-nation-card--active' : ''}"
      onclick="dpSelectNation('${n.id}')">
      <div class="dp-nation-avatar" style="background:${rel.color ?? '#9e9e9e'}22; border-color:${rel.color ?? '#9e9e9e'}55">
        ${n.flag}
      </div>
      <div class="dp-nation-meta">
        <div class="dp-nation-nm">
          ${n.name}
          ${treaties.length > 0 ? `<span class="dp-treaties-count">${treaties.length}</span>` : ''}
        </div>
        <div class="dp-nation-rel-bar">
          <div class="dp-nation-rel-fill" style="width:${pct}%;background:${rel.color ?? '#9e9e9e'}"></div>
        </div>
        <div class="dp-nation-rel-txt ${atWar ? 'dp-at-war' : ''}"
          style="${atWar ? '' : 'color:' + (rel.color ?? '#9e9e9e')}">
          ${atWar ? '⚔ ВОЙНА' : (rel.icon ?? '') + ' ' + (rel.label ?? 'Нейтральные')}
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// ПРАВАЯ ЧАСТЬ — зал переговоров
// ──────────────────────────────────────────────────────────────────────────────

function _dpRenderNegotiation(playerNationId, foreign) {
  if (!_dpSelectedNation || !GAME_STATE.nations[_dpSelectedNation]) {
    if (!foreign.length) {
      return `<div class="dp-empty-state">
        <div class="dp-empty-icon">🌍</div>
        <div class="dp-empty-title">Нет известных государств</div>
      </div>`;
    }
    return `<div class="dp-empty-state">
      <div class="dp-empty-icon">←</div>
      <div class="dp-empty-title">Выберите государство</div>
      <div class="dp-empty-sub">Нажмите на нацию в списке слева чтобы начать переговоры</div>
    </div>`;
  }

  const aiId     = _dpSelectedNation;
  const aiNation = GAME_STATE.nations[aiId];
  const aiFlag   = aiNation.flag_emoji ?? '🏛';
  const aiRuler  = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  const aiGov    = aiNation.government?.type ?? '';
  const aiPop    = _dpPopNum(aiNation);
  const aiTreasury = Math.round(aiNation.economy?.treasury ?? 0);

  const rel    = _dpRelObj(playerNationId, aiId);
  const atWar  = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiId);
  const pct    = Math.round(((rel.score ?? 0) + 100) / 2);

  const activeTreaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, aiId) : [];

  const st = _getDtState(aiId);

  // ── Кнопки договоров ──
  const treatyBtns = Object.entries(TREATY_TYPES ?? {}).map(([key, def]) => {
    const isChosen = st.selectedTreaty === key;
    return `<button class="dp-treaty-card${isChosen ? ' dp-treaty-card--on' : ''}"
      title="${def.description ?? ''}"
      onclick="dtSelectTreaty('${aiId}','${key}')">
      <span class="dp-tc-icon">${def.icon}</span>
      <span class="dp-tc-label">${def.label}</span>
    </button>`;
  }).join('');

  // ── Активные договоры (теги) ──
  const tagsHtml = activeTreaties.length
    ? `<div class="dp-active-tags">
        ${activeTreaties.map(t => {
          const d = TREATY_TYPES?.[t.type];
          return `<span class="dp-active-tag">${d?.icon ?? '📜'} ${d?.label ?? t.type}</span>`;
        }).join('')}
      </div>` : '';

  // ── Чат ──
  const playerNation = GAME_STATE.nations[playerNationId];
  const playerFlag   = playerNation?.flag_emoji ?? '👑';
  const playerName   = playerNation?.name ?? 'Вы';
  const dialogue     = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getDialogue(playerNationId, aiId) : [];

  let chatContent;
  if (dialogue.length === 0) {
    chatContent = `<div class="dp-chat-empty">
      <div class="dp-chat-empty-face">${aiFlag}</div>
      <div class="dp-chat-empty-text">Напишите обращение к ${aiRuler} и нажмите «Отправить»</div>
    </div>`;
  } else {
    chatContent = dialogue.map(msg => {
      const isPlayer = msg.role === 'user';
      const isSystem = msg.role === 'system';
      const cls    = isPlayer ? 'dp-msg dp-msg--player' : isSystem ? 'dp-msg dp-msg--sys' : 'dp-msg dp-msg--ai';
      const avatar = isPlayer ? playerFlag : isSystem ? '⚙' : aiFlag;
      const name   = isPlayer ? playerName : isSystem ? '' : aiRuler;
      return `<div class="${cls}">
        <div class="dp-msg-av">${avatar}</div>
        <div class="dp-msg-wrap">
          ${name ? `<div class="dp-msg-name">${name}</div>` : ''}
          <div class="dp-msg-bubble">${_escHtml(msg.displayText ?? msg.text)}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Typing indicator если загрузка
  if (st.isLoading) {
    chatContent += `<div class="dp-msg dp-msg--ai dp-msg--loading">
      <div class="dp-msg-av">${aiFlag}</div>
      <div class="dp-msg-wrap">
        <div class="dp-msg-name">${aiRuler}</div>
        <div class="dp-msg-bubble dp-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`;
  }

  const selectedTag = st.selectedTreaty
    ? `<div class="dp-sel-tag">
        <span>${TREATY_TYPES?.[st.selectedTreaty]?.icon ?? '📜'}</span>
        <span><strong>${TREATY_TYPES?.[st.selectedTreaty]?.label ?? st.selectedTreaty}</strong> — выбран тип договора</span>
        <button class="dp-sel-rm" onclick="dtSelectTreaty('${aiId}',null)" title="Сбросить">✕</button>
      </div>` : '';

  return `
    <!-- ШАПКА НАЦИИ -->
    <div class="dp-nation-hdr" style="--rel-color:${rel.color ?? '#9e9e9e'}">
      <div class="dp-nh-avatar">${aiFlag}</div>
      <div class="dp-nh-info">
        <div class="dp-nh-name">${aiNation.name}</div>
        <div class="dp-nh-ruler">${aiRuler}${aiGov ? ` · ${aiGov}` : ''}</div>
        ${tagsHtml}
      </div>
      <div class="dp-nh-rel">
        <div class="dp-nh-relbar">
          <div class="dp-nh-relfill" style="width:${pct}%"></div>
        </div>
        <div class="dp-nh-rellabel ${atWar ? 'dp-at-war' : ''}">
          ${atWar ? '⚔ ВОЙНА' : (rel.icon ?? '') + ' ' + (rel.label ?? '') + ' (' + (rel.score >= 0 ? '+' : '') + rel.score + ')'}
        </div>
        <div class="dp-nh-stats">
          <span title="Население">👥 ${aiPop > 0 ? aiPop.toLocaleString() : '?'}</span>
          <span title="Казна">💰 ${aiTreasury > 0 ? aiTreasury.toLocaleString() : '?'}</span>
        </div>
      </div>
    </div>

    <!-- ДОГОВОРЫ -->
    <div class="dp-treaties-section">
      <div class="dp-sec-label">Предложить договор</div>
      <div class="dp-treaty-grid">${treatyBtns}</div>
      ${selectedTag}
    </div>

    <!-- ДИАЛОГ -->
    <div class="dp-dialogue-section">
      <div class="dp-dialogue-hdr">
        <span class="dp-sec-label">История переговоров</span>
        ${dialogue.length > 0
          ? `<button class="dp-clear-chat" onclick="dtClearDialogue('${aiId}')">Очистить</button>`
          : ''}
      </div>
      <div class="dp-chat" id="dp-chat-${aiId}">${chatContent}</div>
    </div>

    <!-- ВВОД -->
    <div class="dp-compose">
      <textarea class="dp-compose-input" id="dp-input-${aiId}" rows="3"
        placeholder="Напишите обращение к ${aiRuler}..."
        onkeydown="if(event.ctrlKey&&event.key==='Enter')dtSendMessage('${aiId}')"></textarea>
      <div class="dp-compose-bar">
        <span class="dp-compose-hint">Ctrl+Enter — отправить</span>
        <button class="dp-compose-send" id="dp-send-${aiId}"
          onclick="dtSendMessage('${aiId}')"
          ${st.isLoading ? 'disabled' : ''}>
          ${st.isLoading ? _typingDots() : '📨 Отправить'}
        </button>
      </div>
    </div>
  `;
}

function _typingDots() {
  return `<span class="dp-btn-dots"><span></span><span></span><span></span></span> Ждём ответа`;
}

// ──────────────────────────────────────────────────────────────────────────────
// ПРАВАЯ ЧАСТЬ — архив всех договоров
// ──────────────────────────────────────────────────────────────────────────────

function _dpRenderTreatiesTab(playerNationId) {
  const all = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getAllTreaties(playerNationId) : [];

  if (!all.length) {
    return `<div class="dp-empty-state">
      <div class="dp-empty-icon">📜</div>
      <div class="dp-empty-title">Архив договоров пуст</div>
      <div class="dp-empty-sub">Заключайте договоры в зале переговоров</div>
    </div>`;
  }

  const statusDef = {
    active:   { icon: '✅', label: 'Действует',   cls: 'dp-arc-active'   },
    expired:  { icon: '⏰', label: 'Истёк',       cls: 'dp-arc-expired'  },
    broken:   { icon: '💔', label: 'Нарушен',     cls: 'dp-arc-broken'   },
    rejected: { icon: '❌', label: 'Отклонён',    cls: 'dp-arc-rejected' },
    pending:  { icon: '⏳', label: 'На рассм.',   cls: 'dp-arc-pending'  },
  };

  const row = (t) => {
    const def  = TREATY_TYPES?.[t.type];
    const other = t.parties.find(p => p !== playerNationId);
    const oNat  = GAME_STATE.nations[other];
    const sts   = statusDef[t.status] ?? { icon: '📄', label: t.status, cls: '' };
    const turn  = t.turn_signed ? `Ход ${t.turn_signed}` : '';
    const dur   = t.duration    ? `${t.duration} ходов` : '';
    const breakBtn = t.status === 'active'
      ? `<button class="dp-arc-break" onclick="dtBreakTreaty('${t.id}')">Разорвать</button>` : '';
    return `<div class="dp-arc-row">
      <div class="dp-arc-type-icon">${def?.icon ?? '📜'}</div>
      <div class="dp-arc-info">
        <div class="dp-arc-top">
          <span class="dp-arc-name">${def?.label ?? t.type}</span>
          <span class="dp-arc-nation">${oNat?.flag_emoji ?? '🏛'} ${oNat?.name ?? other}</span>
        </div>
        ${def?.description ? `<div class="dp-arc-desc">${def.description}</div>` : ''}
        ${t.conditions?.notes ? `<div class="dp-arc-notes">📝 ${t.conditions.notes}</div>` : ''}
      </div>
      <div class="dp-arc-meta">
        <span class="dp-arc-status ${sts.cls}">${sts.icon} ${sts.label}</span>
        <span class="dp-arc-turn">${turn}${dur ? ' · ' + dur : ''}</span>
        ${breakBtn}
      </div>
    </div>`;
  };

  const active   = all.filter(t => t.status === 'active');
  const inactive = all.filter(t => t.status !== 'active');

  return `<div class="dp-arc-view">
    ${active.length ? `
      <div class="dp-arc-group">
        <div class="dp-arc-group-title">✅ Действующие договоры (${active.length})</div>
        ${active.map(row).join('')}
      </div>` : ''}
    ${inactive.length ? `
      <div class="dp-arc-group">
        <div class="dp-arc-group-title">📁 Архив (${inactive.length})</div>
        ${inactive.map(row).join('')}
      </div>` : ''}
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// ОБРАБОТЧИКИ
// ──────────────────────────────────────────────────────────────────────────────

function dtSelectTreaty(aiNationId, key) {
  _getDtState(aiNationId).selectedTreaty = key || null;
  _dpRender();
}

async function dtSendMessage(aiNationId) {
  const playerNationId = GAME_STATE.player_nation;
  const inputEl = document.getElementById(`dp-input-${aiNationId}`);
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) {
    inputEl.classList.add('dp-shake');
    setTimeout(() => inputEl.classList.remove('dp-shake'), 400);
    return;
  }

  const st = _getDtState(aiNationId);
  if (st.isLoading) return;

  let fullText = text;
  if (st.selectedTreaty && TREATY_TYPES?.[st.selectedTreaty]) {
    const d = TREATY_TYPES[st.selectedTreaty];
    fullText = `[Предложение: ${d.icon} ${d.label}]\n${text}`;
  }

  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.addMessage(playerNationId, aiNationId, 'user', fullText, text);
  }

  inputEl.value = '';
  st.isLoading  = true;
  _dpRender();

  try {
    const dialogue    = typeof DiplomacyEngine !== 'undefined'
      ? DiplomacyEngine.getDialogue(playerNationId, aiNationId) : [];
    const apiMessages = dialogue.map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    const raw     = await callDiplomacyAI(aiNationId, playerNationId, apiMessages);
    const treaty  = parseDiplomacyTreaty(raw);
    const display = stripDiplomacyJSON(raw);

    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'assistant', raw, display);
    }

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

function dtClearDialogue(aiNationId) {
  const playerNationId = GAME_STATE.player_nation;
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.clearDialogue(playerNationId, aiNationId);
  }
  _getDtState(aiNationId).selectedTreaty = null;
  _dpRender();
}

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
  const dur = treaty.conditions?.duration
    ?? TREATY_TYPES?.[treaty.treaty_type]?.default_duration ?? 10;
  DiplomacyEngine.createTreaty(
    playerNationId, aiNationId, treaty.treaty_type,
    { ...treaty.conditions, duration: dur },
    dialogueLog,
  );
  const def = TREATY_TYPES?.[treaty.treaty_type];
  if (typeof addLogEntry === 'function') {
    const pName = GAME_STATE.nations[playerNationId]?.name ?? 'вами';
    const aName = GAME_STATE.nations[aiNationId]?.name ?? aiNationId;
    addLogEntry('diplomacy', `${def?.icon ?? '📜'} Подписан "${def?.label ?? treaty.treaty_type}" между ${pName} и ${aName}.`);
  }
  _getDtState(aiNationId).selectedTreaty = null;
}

function _getForeignNations(playerNationId) {
  return Object.entries(GAME_STATE.nations ?? {})
    .filter(([id]) => id !== playerNationId)
    .map(([id, n]) => ({ id, name: n.name, flag: n.flag_emoji ?? '🏛' }))
    .sort((a, b) => {
      if (typeof DiplomacyEngine === 'undefined') return 0;
      return DiplomacyEngine.getRelationScore(playerNationId, b.id)
           - DiplomacyEngine.getRelationScore(playerNationId, a.id);
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// МИНИ-ПРЕВЬЮ В ПАНЕЛИ РЕГИОНА
// ──────────────────────────────────────────────────────────────────────────────

function renderDiplomacyTab(regionId) {
  const gameRegion     = GAME_STATE.regions[regionId];
  const aiId           = gameRegion?.nation;
  const playerNationId = GAME_STATE.player_nation;

  if (!aiId || aiId === playerNationId) {
    return '<div class="dp-redir-box"><span>Это ваш регион</span></div>';
  }

  const aiNation = GAME_STATE.nations[aiId];
  if (!aiNation) return '<div class="dp-redir-box"><span>Нация не найдена</span></div>';

  const aiFlag  = aiNation.flag_emoji ?? '🏛';
  const aiRuler = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  const rel     = _dpRelObj(playerNationId, aiId);
  const atWar   = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiId);
  const pct     = Math.round(((rel.score ?? 0) + 100) / 2);

  const treaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, aiId) : [];
  const tagsHtml = treaties.length > 0
    ? treaties.map(t => {
        const d = TREATY_TYPES?.[t.type];
        return `<span class="dp-mini-tag">${d?.icon ?? '📜'} ${d?.label ?? t.type}</span>`;
      }).join('')
    : '<span class="dp-mini-none">Договоров нет</span>';

  return `<div class="dp-redir-box">
    <div class="dp-redir-nation">
      <span class="dp-redir-flag">${aiFlag}</span>
      <div>
        <div class="dp-redir-name">${aiNation.name}</div>
        <div class="dp-redir-ruler">${aiRuler}</div>
      </div>
    </div>
    <div class="dp-redir-rel">
      <div class="dp-redir-bar">
        <div class="dp-redir-fill" style="width:${pct}%;background:${rel.color ?? '#9e9e9e'}"></div>
      </div>
      <span class="dp-redir-lbl" style="color:${rel.color ?? '#9e9e9e'}">
        ${atWar ? '⚔ ВОЙНА' : (rel.label ?? 'Нейтральные') + ' (' + (rel.score >= 0 ? '+' : '') + rel.score + ')'}
      </span>
    </div>
    <div class="dp-redir-treaties">${tagsHtml}</div>
    <button class="dp-redir-btn" onclick="showDiplomacyOverlay('${aiId}')">
      🤝 Открыть зал переговоров
    </button>
  </div>`;
}
