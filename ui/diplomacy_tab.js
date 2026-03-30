// ui/diplomacy_tab.js  — Дипломатическое окно (overlay)
// Открывается как большой оверлей при клике «🤝 Дипломатия» в панели региона.

'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЕ
// ──────────────────────────────────────────────────────────────────────────────

let _dpSelectedNation = null;     // string|null
let _dpTab            = 'negotiations'; // 'negotiations' | 'treaties'

// Состояние текущего открытого чат-модала
let _dpChatModalNation = null;    // aiNationId открытого модала

// Выбранные регионы для передачи в условиях мира
let _dpPeaceRegions    = new Set();   // Set of regionId
let _dpPeaceVassalize  = false;
let _dpPeaceRepTurns   = 0;    // 0 | 60 | 120
let _dpPeaceArmistice  = true;
let _dpShowPeaceForm   = false;

const _dtState = {};
function _getDtState(id) {
  if (!_dtState[id]) {
    _dtState[id] = {
      selectedTreaty: null,
      isLoading:      false,
      // Фаза переговоров: 'chat' | 'finalization' | 'signed'
      phase:          'chat',
      agreedTreaty:   null,  // { type, conditions } — согласованный договор
      draftText:      '',    // текст договора в фазе финализации
      finDialogue:    [],    // [{role, text}] — правки в фазе финализации
      isFinLoading:   false,
      draftVersion:   0,
    };
  }
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
  let score = DiplomacyEngine.getRelationScore(playerNationId, aiNationId);
  // Если DiplomacyEngine ещё не имеет данных для пары — берём из legacy nation.relations
  if (score === 0) {
    const legA = GAME_STATE.nations?.[playerNationId]?.relations?.[aiNationId]?.score;
    const legB = GAME_STATE.nations?.[aiNationId]?.relations?.[playerNationId]?.score;
    const leg  = legA ?? legB ?? null;
    if (typeof leg === 'number' && leg !== 0) score = leg;
  }
  const obj = DiplomacyEngine.getRelationLabel(score);
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
  _dpShowPeaceForm  = false;
  _dpPeaceRegions   = new Set();
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
  const pct     = Math.max(0, Math.min(100, Math.round(((Number(rel.score) || 0) + 100) / 2)));
  const active  = _dpSelectedNation === n.id;

  const treaties = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getActiveTreaties(playerNationId, n.id) : [];

  // Зона дипломатического охвата
  const tier = typeof getNationTier === 'function' ? getNationTier(n.id) : 1;
  const dist = typeof getDiploDistance === 'function' ? getDiploDistance(n.id) : null;
  const TIER_BADGE = {
    1: { icon: '🟢', label: 'Зона 1', title: 'Полная дипломатия' },
    2: { icon: '🟡', label: 'Зона 2', title: 'Ограниченный контакт' },
    3: { icon: '🔴', label: 'Зона 3', title: 'За горизонтом — недоступна' },
  };
  const badge = TIER_BADGE[tier] ?? TIER_BADGE[3];

  return `
    <div class="dp-nation-card${active ? ' dp-nation-card--active' : ''}${tier === 3 ? ' dp-nation-card--far' : ''}"
      onclick="dpSelectNation('${n.id}')">
      <div class="dp-nation-avatar" style="background:${rel.color ?? '#9e9e9e'}22; border-color:${rel.color ?? '#9e9e9e'}55">
        ${n.flag}
      </div>
      <div class="dp-nation-meta">
        <div class="dp-nation-nm">
          ${n.name}
          ${treaties.length > 0 ? `<span class="dp-treaties-count">${treaties.length}</span>` : ''}
          <span class="dp-tier-badge dp-tier-${tier}" title="${badge.title}${dist !== null ? ' (' + dist + ' хопов)' : ''}">${badge.icon} ${badge.label}</span>
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
          ${atWar ? '⚔ ВОЙНА' : (rel.icon ?? '') + ' ' + (rel.label ?? '') + ' (' + (rel.score >= 0 ? '+' : '') + (rel.score ?? 0) + ')'}
        </div>
        <div class="dp-nh-stats">
          <span title="Население">👥 ${aiPop > 0 ? aiPop.toLocaleString() : '?'}</span>
          <span title="Казна">💰 ${aiTreasury > 0 ? aiTreasury.toLocaleString() : '?'}</span>
        </div>
      </div>
    </div>

    <!-- ВОЙНА / МИР -->
    ${_dpWarPeaceBlock(playerNationId, aiId, atWar, rel)}

    <!-- ДОГОВОРЫ (только когда нет войны и не показана форма мира) -->
    ${!atWar && !_dpShowPeaceForm ? `
    <div class="dp-treaties-section">
      <div class="dp-sec-label">Предложить договор</div>
      <div class="dp-treaty-grid">${treatyBtns}</div>
      ${selectedTag}
    </div>` : ''}

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

// ──────────────────────────────────────────────────────────────────────────────
// БЛОК ВОЙНА / МИР
// ──────────────────────────────────────────────────────────────────────────────

function _dpWarPeaceBlock(playerNationId, aiId, atWar, rel) {
  const armistice = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getArmistice?.(playerNationId, aiId) : null;
  const armisticeTurns = armistice
    ? Math.max(0, (armistice.turn_expires ?? 0) - (GAME_STATE.turn ?? 1))
    : 0;

  if (atWar) {
    // Очки войны
    const ws = typeof WarScoreEngine !== 'undefined'
      ? WarScoreEngine.getWarScore(playerNationId, aiId)
      : { player: 0, opponent: 0 };
    const wsBar = _dpWarScoreBar(ws.player, ws.opponent);

    // Показываем форму условий мира или кнопку её открытия
    if (_dpShowPeaceForm) return wsBar + _dpPeaceForm(playerNationId, aiId);
    return `<div class="dp-war-block dp-war-block--war">
      <div class="dp-war-status">⚔️ <b>Состояние войны</b></div>
      ${wsBar}
      <div class="dp-war-actions">
        <button class="dp-war-btn dp-war-btn--peace" onclick="dpOpenPeaceForm('${aiId}')">
          📜 Условия мира (форма)
        </button>
        <button class="dp-war-btn dp-war-btn--peace-chat" onclick="dpOpenPeaceChat('${aiId}')">
          🤝 Переговоры с ИИ
        </button>
      </div>
    </div>`;
  }

  // Не в войне
  const hasArmistice = !!armistice;
  const armisticeWarning = hasArmistice
    ? `<div class="dp-armistice-warn">
        🕊 Перемирие действует ещё <b>${armisticeTurns} ход.</b>
        Объявление войны нарушит договор: <b>−50 отношений</b> + штраф со всеми соседями.
      </div>` : '';

  return `<div class="dp-war-block">
    ${armisticeWarning}
    <button class="dp-war-btn dp-war-btn--declare${hasArmistice ? ' dp-war-btn--armistice' : ''}"
      onclick="dpDeclareWar('${aiId}')">
      ⚔️ ${hasArmistice ? 'Нарушить перемирие и объявить войну' : 'Объявить войну'}
    </button>
  </div>`;
}

/** Форма условий мира */
function _dpPeaceForm(playerNationId, aiId) {
  const aiNation = GAME_STATE.nations[aiId];
  const aiName   = aiNation?.name ?? aiId;

  // War score
  const ws = typeof WarScoreEngine !== 'undefined'
    ? WarScoreEngine.getWarScore(playerNationId, aiId)
    : { player: 0, opponent: 0 };
  const playerWS = ws.player;

  // Регионы противника (список с чекбоксами)
  const allRegions   = Object.values(GAME_STATE.regions ?? {});
  const enemyRegions = allRegions.filter(r => r.nation === aiId);
  const cfg          = typeof WarScoreEngine !== 'undefined' ? WarScoreEngine.CFG : {};

  const regionRows = enemyRegions.map(r => {
    const checked = _dpPeaceRegions.has(r.id) ? 'checked' : '';
    const terrain = r.terrain ? ` <span class="dp-reg-terrain">[${r.terrain}]</span>` : '';
    const pop     = r.population?.total ?? r.population ?? 0;
    const cost    = Math.min(cfg.PEACE_PROVINCE_MAX ?? 22,
      (cfg.PEACE_PROVINCE_BASE ?? 8) + Math.floor(pop / 10_000) * (cfg.PEACE_PROVINCE_PER_10K ?? 1)
    );
    return `<label class="dp-reg-row${_dpPeaceRegions.has(r.id) ? ' dp-reg-row--sel' : ''}">
      <input type="checkbox" ${checked} onchange="dpTogglePeaceRegion('${r.id}')">
      <span class="dp-reg-name">${_escHtml(r.name ?? r.id)}${terrain}</span>
      ${pop > 0 ? `<span class="dp-reg-pop">👥 ${pop.toLocaleString()}</span>` : ''}
      <span class="dp-reg-cost dp-ws-cost">⚔${cost}</span>
    </label>`;
  }).join('');

  const noRegions = enemyRegions.length === 0
    ? '<div class="dp-reg-empty">У противника нет регионов для передачи.</div>' : '';

  // Расчёт стоимости текущих требований
  const currentTerms = {
    ceded_regions:    [..._dpPeaceRegions],
    vassalize:        _dpPeaceVassalize,
    reparations_turns: _dpPeaceRepTurns,
    armistice_turns:  _dpPeaceArmistice ? 60 : 0,
  };
  const costCalc = typeof WarScoreEngine !== 'undefined'
    ? WarScoreEngine.calcPeaceTermsCost(currentTerms)
    : { total: 0, breakdown: [] };
  const totalCost    = costCalc.total;
  const canAfford    = totalCost <= playerWS;
  const costBarPct   = playerWS > 0 ? Math.min(100, Math.round((totalCost / playerWS) * 100)) : (totalCost > 0 ? 100 : 0);
  const costColor    = canAfford ? '#66bb6a' : '#ef5350';

  // Расчёт контрибуции на основе казны противника
  const aiTreasury   = Math.round(aiNation?.economy?.treasury ?? 0);
  const suggestedRep = Math.max(10, Math.round(aiTreasury * 0.03));

  const repOptions = [
    { v: 0,   l: 'Без контрибуции',     cost: 0 },
    { v: 60,  l: '5 лет (60 ходов)',    cost: cfg.PEACE_REP_60  ?? 10 },
    { v: 120, l: '10 лет (120 ходов)',  cost: cfg.PEACE_REP_120 ?? 18 },
  ].map(o => `<option value="${o.v}"${_dpPeaceRepTurns === o.v ? ' selected' : ''}>${o.l} ${o.cost > 0 ? '(⚔' + o.cost + ' WS)' : ''}</option>`).join('');

  const vassalCost = cfg.PEACE_VASSALIZE ?? 30;
  const vassalChecked = _dpPeaceVassalize ? 'checked' : '';
  const armChecked    = _dpPeaceArmistice ? 'checked' : '';

  return `<div class="dp-peace-form">
    <div class="dp-peace-hdr">
      <span>📜 Условия мира с <b>${_escHtml(aiName)}</b></span>
      <button class="dp-peace-cancel" onclick="dpClosePeaceForm()">✕</button>
    </div>

    <!-- Стоимость условий -->
    <div class="dp-peace-cost-bar">
      <div class="dp-peace-cost-track">
        <div class="dp-peace-cost-fill" style="width:${costBarPct}%;background:${costColor}"></div>
      </div>
      <span class="dp-peace-cost-txt" style="color:${costColor}">
        Стоимость: <b>${totalCost}</b> / ${playerWS} WS
        ${!canAfford ? ' ⚠️ Недостаточно очков войны' : ''}
      </span>
    </div>

    <!-- Провинции -->
    <div class="dp-peace-section">
      <div class="dp-peace-sec-label">🗺 Потребовать провинции
        <span class="dp-peace-count">${_dpPeaceRegions.size > 0 ? '(' + _dpPeaceRegions.size + ' выбрано)' : ''}</span>
      </div>
      <div class="dp-reg-list">
        ${noRegions}
        ${regionRows}
      </div>
    </div>

    <!-- Вассалитет -->
    <div class="dp-peace-section dp-peace-row">
      <label class="dp-peace-check-label">
        <input type="checkbox" ${vassalChecked} onchange="dpSetPeaceVassalize(this.checked);dpUpdatePeaceCost('${aiId}')">
        🏳 Потребовать вассалитет
      </label>
      <span class="dp-ws-cost">⚔${vassalCost} WS</span>
    </div>

    <!-- Контрибуция -->
    <div class="dp-peace-section dp-peace-row">
      <span class="dp-peace-sec-label">💰 Репарации</span>
      <select class="dp-peace-sel" onchange="dpSetPeaceRep(+this.value)">
        ${repOptions}
      </select>
      ${_dpPeaceRepTurns > 0 ? `<span class="dp-peace-rep-hint">≈ ${suggestedRep} зол./ход</span>` : ''}
    </div>

    <!-- Перемирие -->
    <div class="dp-peace-section dp-peace-row">
      <label class="dp-peace-check-label">
        <input type="checkbox" ${armChecked} onchange="dpSetPeaceArmistice(this.checked)">
        🕊 Перемирие 5 лет (60 ходов)
      </label>
      <span class="dp-ws-cost" style="color:var(--text-dim)">⚔0 WS (бесплатно)</span>
    </div>

    <button class="dp-peace-submit${canAfford ? '' : ' dp-peace-submit--blocked'}"
      onclick="dpProposePeace('${aiId}')"
      ${canAfford ? '' : 'title="Недостаточно очков войны"'}>
      📨 Предложить условия мира
    </button>
    <div class="dp-peace-hint">
      Очки войны (WS) определяют, насколько тяжёлые условия вы можете требовать.
      ${!canAfford ? '<b style="color:#ef9a9a">Снизьте требования или продолжайте воевать.</b>' : ''}
    </div>
  </div>`;
}

/** Полоска очков войны: игрок vs противник */
function _dpWarScoreBar(playerScore, opponentScore) {
  const total = Math.max(1, playerScore + opponentScore);
  const pct   = Math.round((playerScore / total) * 100);
  const lead  = playerScore > opponentScore ? 'dp-ws-lead--player' : playerScore < opponentScore ? 'dp-ws-lead--opp' : '';
  return `<div class="dp-ws-row">
    <span class="dp-ws-label">Мои очки</span>
    <div class="dp-ws-bar">
      <div class="dp-ws-fill dp-ws-fill--player" style="width:${pct}%"></div>
    </div>
    <span class="dp-ws-nums ${lead}">
      <b>${playerScore}</b> vs ${opponentScore}
    </span>
  </div>`;
}

// ── Обработчики войны / мира ─────────────────────────────────────────────────

function dpDeclareWar(aiId) {
  const playerNationId = GAME_STATE.player_nation;
  const aiNation  = GAME_STATE.nations[aiId];
  const armistice = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getArmistice?.(playerNationId, aiId) : null;

  const msg = armistice
    ? `Вы нарушите активное перемирие! Штраф: −50 к отношениям + ухудшение отношений со всеми соседями.\n\nОбъявить войну ${aiNation?.name ?? aiId}?`
    : `Объявить войну ${aiNation?.name ?? aiId}?`;

  if (!confirm(msg)) return;

  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.declareWar(playerNationId, aiId);
  }
  _dpRender();
}

function dpOpenPeaceForm(aiId) {
  _dpPeaceRegions   = new Set();
  _dpPeaceVassalize = false;
  _dpPeaceRepTurns  = 0;
  _dpPeaceArmistice = true;
  _dpShowPeaceForm  = true;
  _dpRender();
}

/** Открыть переговоры о мире через AI-чат (Claude Sonnet). */
function dpOpenPeaceChat(aiId) {
  const playerNationId = GAME_STATE.player_nation;
  const aiNation = GAME_STATE.nations[aiId];
  const ws = typeof WarScoreEngine !== 'undefined'
    ? WarScoreEngine.getWarScore(playerNationId, aiId)
    : { player: 0, opponent: 0 };

  const firstMessage = `Я предлагаю начать переговоры о мире. `
    + `Наши очки войны: мои — ${ws.player}, ваши — ${ws.opponent}. `
    + `Какие условия вы считаете приемлемыми для завершения конфликта?`;

  if (typeof showDipChatModal === 'function') {
    showDipChatModal(aiId, firstMessage);
  }
}

function dpClosePeaceForm() {
  _dpShowPeaceForm = false;
  _dpRender();
}

function dpTogglePeaceRegion(regionId) {
  if (_dpPeaceRegions.has(regionId)) _dpPeaceRegions.delete(regionId);
  else _dpPeaceRegions.add(regionId);
  // Перерисовываем только форму, не весь оверлей
  const formEl = document.querySelector('.dp-peace-form');
  if (formEl) formEl.outerHTML = _dpPeaceForm(GAME_STATE.player_nation, _dpSelectedNation);
  // Fallback — полный ре-рендер
  else _dpRender();
}

function dpSetPeaceVassalize(v) { _dpPeaceVassalize = v; }
function dpSetPeaceRep(v)       { _dpPeaceRepTurns  = v; _dpRender(); }
function dpSetPeaceArmistice(v) { _dpPeaceArmistice = v; }
function dpUpdatePeaceCost(aiId) { _dpRender(); }

function dpProposePeace(aiId) {
  if (typeof DiplomacyEngine === 'undefined') return;

  const playerNationId = GAME_STATE.player_nation;
  const aiNation  = GAME_STATE.nations[aiId];
  const aiTreasury = Math.round(aiNation?.economy?.treasury ?? 0);
  const suggestedRep = Math.max(10, Math.round(aiTreasury * 0.03));

  // Проверка war score
  const ws = typeof WarScoreEngine !== 'undefined'
    ? WarScoreEngine.getWarScore(playerNationId, aiId)
    : { player: 0, opponent: 0 };
  const currentTerms = {
    ceded_regions: [..._dpPeaceRegions],
    vassalize: _dpPeaceVassalize,
    reparations_turns: _dpPeaceRepTurns,
    armistice_turns: _dpPeaceArmistice ? 60 : 0,
  };
  const costCalc = typeof WarScoreEngine !== 'undefined'
    ? WarScoreEngine.calcPeaceTermsCost(currentTerms)
    : { total: 0 };

  if (costCalc.total > ws.player) {
    if (typeof addEventLog === 'function')
      addEventLog(`⚠️ Требования слишком тяжёлые для ваших военных успехов (нужно ${costCalc.total} WS, у вас ${ws.player}).`, 'warning');
    _dpRender();
    return;
  }

  // Оцениваем принятие ИИ на основе военного баланса
  const aiEval = typeof WarScoreEngine !== 'undefined'
    ? WarScoreEngine.evaluateAIWarPosition(aiId, playerNationId)
    : null;

  const scoreGap  = ws.player - ws.opponent;  // положительное = игрок выигрывает
  let acceptChance = 0.45 + (scoreGap / 100);  // базовый шанс от разрыва WS

  // Тяжёлые условия снижают шанс принятия
  const costRatio = ws.player > 0 ? costCalc.total / ws.player : 1;
  acceptChance -= costRatio * 0.3;  // дороже требования = меньше шанс

  // Если ИИ оценивает своё положение как безнадёжное — принимает охотнее
  if (aiEval?.shouldSeekPeace) acceptChance += 0.25;

  // Перемирие повышает шанс
  if (_dpPeaceArmistice) acceptChance += 0.08;

  acceptChance = Math.max(0.05, Math.min(0.92, acceptChance));

  const accepted = Math.random() < acceptChance;

  const terms = {
    ceded_regions:       [..._dpPeaceRegions],
    vassalize:           _dpPeaceVassalize,
    reparations_turns:   _dpPeaceRepTurns,
    reparations_per_turn: _dpPeaceRepTurns > 0 ? suggestedRep : 0,
    armistice_turns:     _dpPeaceArmistice ? 60 : 0,
    loser:               aiId,
    winner:              playerNationId,
  };

  if (accepted) {
    DiplomacyEngine.concludePeace(playerNationId, aiId, terms);
    _dpShowPeaceForm = false;
    if (typeof addEventLog === 'function') {
      addEventLog(`✅ ${aiNation?.name ?? aiId} принял условия мира.`, 'success');
    }
  } else {
    if (typeof addEventLog === 'function') {
      addEventLog(`❌ ${aiNation?.name ?? aiId} отклонил условия мира. Слишком тяжёлые требования.`, 'warning');
    }
  }
  _dpRender();
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
    const dur   = t.duration    ? `${t.duration} лет` : '';
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

function dtSendMessage(aiNationId) {
  const inputEl = document.getElementById(`dp-input-${aiNationId}`);
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) {
    inputEl.classList.add('dp-shake');
    setTimeout(() => inputEl.classList.remove('dp-shake'), 400);
    return;
  }

  inputEl.value = '';
  // Открываем большой чат-модал и отправляем первое сообщение
  showDipChatModal(aiNationId, text);
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
  if (typeof DiplomacyEngine === 'undefined') return null;
  const dur = treaty.conditions?.duration
    ?? TREATY_TYPES?.[treaty.treaty_type]?.default_duration ?? 10;
  const created = DiplomacyEngine.createTreaty(
    playerNationId, aiNationId, treaty.treaty_type,
    { ...treaty.conditions, duration: dur },
    dialogueLog,
  );
  const def = TREATY_TYPES?.[treaty.treaty_type];
  if (typeof addLogEntry === 'function') {
    const pName = GAME_STATE.nations[playerNationId]?.name ?? 'вами';
    const aName = GAME_STATE.nations[aiNationId]?.name ?? aiNationId;
    addLogEntry('diplomacy', `${def?.icon ?? '📜'} Подписан «${def?.label ?? treaty.treaty_type}» между ${pName} и ${aName}.`);
  } else if (typeof addEventLog === 'function') {
    const pName = GAME_STATE.nations[playerNationId]?.name ?? 'вами';
    const aName = GAME_STATE.nations[aiNationId]?.name ?? aiNationId;
    addEventLog(`${def?.icon ?? '📜'} Подписан «${def?.label ?? treaty.treaty_type}» между ${pName} и ${aName}.`, 'diplomacy');
  }
  _getDtState(aiNationId).selectedTreaty = null;
  return created; // возвращаем для applyTreatyEffects
}

// ══════════════════════════════════════════════════════════════════════════════
// ЧАТ-МОДАЛ: ПЕРЕГОВОРНЫЙ ЗАЛ (МЕССЕНДЖЕР-СТИЛЬ)
// Фаза 1: свободный диалог → Фаза 2: финализация и подписание договора
// ══════════════════════════════════════════════════════════════════════════════

function showDipChatModal(aiNationId, firstMessage) {
  // Проверяем дипломатический охват
  if (typeof getNationTier === 'function') {
    const tier = getNationTier(aiNationId);
    if (tier === 3) {
      const nation = GAME_STATE.nations?.[aiNationId];
      const dist   = typeof getDiploDistance === 'function' ? getDiploDistance(aiNationId) : '?';
      if (typeof addEventLog === 'function') {
        addEventLog(
          `🌫 ${nation?.name ?? aiNationId} слишком далека (${dist} хопов). `
          + `Расширьте территорию или отправьте посла, чтобы установить контакт.`,
          'warning'
        );
      }
      return;
    }
  }

  const modal = document.getElementById('dp-chat-modal');
  if (!modal) return;
  _dpChatModalNation = aiNationId;
  const st = _getDtState(aiNationId);
  // Сбрасываем фазу если предыдущий договор уже подписан
  if (st.phase === 'signed') {
    st.phase = 'chat';
    st.agreedTreaty = null;
    st.draftText = '';
    st.finDialogue = [];
  }
  modal.classList.remove('hidden');
  _renderChatModal();
  if (firstMessage && firstMessage.trim()) {
    _dpChatSendActual(aiNationId, firstMessage.trim());
  }
}

function hideDipChatModal() {
  // Записываем исход переговоров в память до закрытия
  if (_dpChatModalNation && typeof addMemoryEvent === 'function') {
    const aiId         = _dpChatModalNation;
    const playerId     = GAME_STATE.player_nation;
    const st           = _getDtState(aiId);
    const aiName       = GAME_STATE.nations[aiId]?.name ?? aiId;
    const playerName   = GAME_STATE.nations[playerId]?.name ?? playerId;

    if (st?.agreedTreaty?.type && st?.phase !== 'signed') {
      // Договор достигнут но ещё не подписан (прервали на полпути)
      const tLabel = TREATY_TYPES?.[st.agreedTreaty.type]?.label ?? st.agreedTreaty.type;
      const outcomeText = `Переговоры с ${playerName}: договор «${tLabel}» обсуждался, но не подписан`;
      addMemoryEvent(aiId,     'diplomacy', outcomeText, [playerId], 'sonnet');
      addMemoryEvent(playerId, 'diplomacy', `Переговоры с ${aiName}: договор «${tLabel}» обсуждался, но не подписан`, [aiId], 'player');
    } else if (!st?.agreedTreaty?.type) {
      const dialogue = typeof DiplomacyEngine !== 'undefined'
        ? DiplomacyEngine.getDialogue(playerId, aiId) : [];
      if (dialogue.length > 0) {
        addMemoryEvent(aiId,     'diplomacy', `Переговоры с ${playerName} прерваны без договора`, [playerId], 'sonnet');
        addMemoryEvent(playerId, 'diplomacy', `Переговоры с ${aiName} прерваны без договора`, [aiId], 'player');
      }
    }

    // ── ST_009: Уведомить SuperOU о дипломатическом событии ──
    if (typeof SuperOU !== 'undefined' && typeof SuperOU.onDiplomacyEvent === 'function') {
      const treatyType = st?.agreedTreaty?.type ?? null;
      const ouEventMap = {
        alliance: 'ALLIANCE_SIGNED', trade: 'TRADE_AGREEMENT',
        non_aggression: 'HONORABLE_PEACE', peace: 'HONORABLE_PEACE',
        tribute: 'TRIBUTE_AGREED', marriage: 'MARRIAGE_ALLIANCE',
      };
      if (treatyType && st?.phase === 'signed') {
        const ouEvt = ouEventMap[treatyType] ?? null;
        if (ouEvt) SuperOU.onDiplomacyEvent(aiId, ouEvt, { gameState: GAME_STATE });
      }
    }
  }
  document.getElementById('dp-chat-modal')?.classList.add('hidden');
  _dpChatModalNation = null;
}

// ── Главный рендер модала ─────────────────────────────────────
function _renderChatModal() {
  const modal = document.getElementById('dp-chat-modal');
  if (!modal) return;
  const aiId = _dpChatModalNation;
  if (!aiId) { modal.classList.add('hidden'); return; }

  const playerNationId = GAME_STATE.player_nation;
  const aiNation    = GAME_STATE.nations[aiId];
  const playerNation = GAME_STATE.nations[playerNationId];
  if (!aiNation) return;

  const st      = _getDtState(aiId);
  const aiFlag  = aiNation.flag_emoji ?? '🏛';
  const aiName  = aiNation.name;
  const aiRuler = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  const rel     = _dpRelObj(playerNationId, aiId);
  const atWar   = typeof DiplomacyEngine !== 'undefined'
    && DiplomacyEngine.isAtWar?.(playerNationId, aiId);
  const pct     = Math.max(0, Math.min(100, Math.round(((Number(rel.score) || 0) + 100) / 2)));

  const phaseBadge = st.phase === 'chat'
    ? `<span class="dp-cm-phase-badge dp-cm-phase-badge--chat">● Фаза I · Переговоры</span>`
    : st.phase === 'finalization'
    ? `<span class="dp-cm-phase-badge dp-cm-phase-badge--draft">● Фаза II · Финализация договора</span>`
    : `<span class="dp-cm-phase-badge dp-cm-phase-badge--final">✓ Договор подписан</span>`;

  const treatyTag = st.selectedTreaty && TREATY_TYPES?.[st.selectedTreaty]
    ? `<span class="dp-cm-hdr-treaty">${TREATY_TYPES[st.selectedTreaty].icon} ${TREATY_TYPES[st.selectedTreaty].label}</span>`
    : st.agreedTreaty && TREATY_TYPES?.[st.agreedTreaty.type]
    ? `<span class="dp-cm-hdr-treaty" style="border-color:rgba(76,175,80,.5);background:rgba(76,175,80,.1);color:#a5d6a7">${TREATY_TYPES[st.agreedTreaty.type].icon} ${TREATY_TYPES[st.agreedTreaty.type].label}</span>`
    : '';

  let bodyHtml = '';
  if (st.phase === 'chat') {
    bodyHtml = _renderCmChatPhase(aiId, st, aiNation, playerNation);
  } else if (st.phase === 'finalization') {
    bodyHtml = _renderCmFinalizationPhase(aiId, st, aiNation, playerNation);
  } else {
    bodyHtml = _renderCmSignedPhase(aiId, st, aiNation);
  }

  modal.innerHTML = `
    <div class="dp-cm-backdrop" onclick="hideDipChatModal()"></div>
    <div class="dp-cm-panel">
      <div class="dp-cm-hdr">
        <div class="dp-cm-hdr-left">
          <div class="dp-cm-avatar">${aiFlag}</div>
          <div class="dp-cm-hdr-info">
            <div class="dp-cm-hdr-name">${aiName}</div>
            <div class="dp-cm-hdr-sub">${aiRuler}${aiNation.government?.type ? ' · ' + aiNation.government.type : ''}</div>
          </div>
          ${phaseBadge}
          ${treatyTag}
        </div>
        <div class="dp-cm-hdr-rel">
          <div class="dp-cm-hdr-relbar">
            <div class="dp-cm-hdr-relfill" style="width:${pct}%;background:${rel.color}"></div>
          </div>
          <div class="dp-cm-hdr-rellbl" style="color:${rel.color}">
            ${atWar ? '⚔ ВОЙНА' : (rel.icon ?? '') + ' ' + (rel.label ?? '') + ' (' + (rel.score >= 0 ? '+' : '') + (rel.score ?? 0) + ')'}
          </div>
        </div>
        <button class="dp-cm-close" onclick="hideDipChatModal()" title="Закрыть">✕</button>
      </div>
      ${bodyHtml}
    </div>`;

  // Прокрутить чат вниз
  requestAnimationFrame(() => {
    const chatEl = document.getElementById('dp-cm-msgs-' + aiId);
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    const editEl = document.getElementById('dp-cm-edit-' + aiId);
    if (editEl) editEl.scrollTop = editEl.scrollHeight;
  });
}

// ── Фаза 1: мессенджер ───────────────────────────────────────
function _renderCmChatPhase(aiId, st, aiNation, playerNation) {
  const playerNationId = GAME_STATE.player_nation;
  const aiFlag   = aiNation.flag_emoji ?? '🏛';
  const aiRuler  = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  const plFlag   = playerNation?.flag_emoji ?? '👑';
  const plName   = playerNation?.name ?? 'Вы';

  const dialogue = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getDialogue(playerNationId, aiId) : [];

  let msgsHtml;
  if (dialogue.length === 0 && !st.isLoading) {
    msgsHtml = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text-dim);text-align:center">
      <div style="font-size:52px;opacity:.3">${aiFlag}</div>
      <div style="font-family:'Cinzel',serif;font-size:14px">Начните переговоры</div>
      <div style="font-size:11px;max-width:280px;opacity:.7">Напишите обращение к ${aiRuler} — выберите тип договора и изложите условия</div>
    </div>`;
  } else {
    msgsHtml = dialogue.map(m => {
      const isPlayer = m.role === 'user';
      const isSys    = m.role === 'system';
      const cls = isPlayer ? 'dp-cm-msg dp-cm-msg--player' : isSys ? 'dp-cm-msg dp-cm-msg--sys' : 'dp-cm-msg dp-cm-msg--ai';
      const av  = isPlayer ? plFlag : isSys ? '' : aiFlag;
      const nm  = isPlayer ? plName : isSys ? '' : aiRuler;
      const txt = _escHtml(m.displayText ?? m.text);
      if (isSys) {
        return `<div class="${cls}"><div class="dp-cm-bubble">${txt}</div></div>`;
      }
      return `<div class="${cls}">
        <div class="dp-cm-msg-av">${av}</div>
        <div class="dp-cm-msg-body">
          ${nm ? `<div class="dp-cm-msg-name">${nm}</div>` : ''}
          <div class="dp-cm-bubble">${txt}</div>
        </div>
      </div>`;
    }).join('');

    if (st.isLoading) {
      msgsHtml += `<div class="dp-cm-msg dp-cm-msg--ai">
        <div class="dp-cm-msg-av">${aiFlag}</div>
        <div class="dp-cm-msg-body">
          <div class="dp-cm-msg-name">${aiRuler}</div>
          <div class="dp-cm-bubble dp-cm-typing"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    }
  }

  // Если AI согласился — показываем баннер перехода к финализации
  const agreedBanner = (!st.isLoading && st.agreedTreaty) ? `
    <div style="
      margin: 0 24px 12px;
      padding: 12px 18px;
      background: rgba(76,175,80,.08);
      border: 1px solid rgba(76,175,80,.35);
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 14px;
    ">
      <span style="font-size:24px">${TREATY_TYPES?.[st.agreedTreaty.type]?.icon ?? '📜'}</span>
      <div style="flex:1;font-size:12px;color:#c8e6c9;line-height:1.5">
        <strong style="color:#a5d6a7">Соглашение достигнуто!</strong><br>
        ${aiRuler} согласился на «${TREATY_TYPES?.[st.agreedTreaty.type]?.label ?? st.agreedTreaty.type}».
        Перейдите к составлению финального текста.
      </div>
      <button onclick="dpEndNegotiations('${aiId}')" style="
        background: linear-gradient(135deg, rgba(76,175,80,.45), rgba(40,110,45,.3));
        border: 1px solid rgba(76,175,80,.55);
        border-radius: 5px;
        color: #c8e6c9;
        font-size: 12px;
        font-family: 'Cinzel', serif;
        padding: 8px 16px;
        cursor: pointer;
        white-space: nowrap;
        letter-spacing: 0.04em;
        transition: all .15s;
      ">📜 К финализации →</button>
    </div>` : '';

  const placeholder = st.selectedTreaty && TREATY_TYPES?.[st.selectedTreaty]
    ? `Обратитесь к ${aiRuler} по поводу «${TREATY_TYPES[st.selectedTreaty].label}»...`
    : `Напишите обращение к ${aiRuler}...`;

  return `
    <div class="dp-cm-body">
      <div class="dp-cm-messages" id="dp-cm-msgs-${aiId}">${msgsHtml}</div>
      ${agreedBanner}
      <div class="dp-cm-compose">
        <div class="dp-cm-compose-row">
          <textarea class="dp-cm-textarea" id="dp-cm-input-${aiId}" rows="3"
            placeholder="${placeholder}"
            onkeydown="if(event.ctrlKey&&event.key==='Enter')dpChatSend('${aiId}')"
            ${st.isLoading ? 'disabled' : ''}></textarea>
          <div class="dp-cm-btns">
            <button class="dp-cm-send" id="dp-cm-send-${aiId}"
              onclick="dpChatSend('${aiId}')"
              ${st.isLoading ? 'disabled' : ''}>
              ${st.isLoading
                ? `<span class="dp-btn-dots"><span></span><span></span><span></span></span>`
                : '📨 Отправить'}
            </button>
            <button class="dp-cm-end-btn" onclick="dpEndNegotiations('${aiId}')"
              ${st.isLoading ? 'disabled' : ''}>
              ${st.agreedTreaty ? '📜 Финализировать →' : dialogue.length > 0 ? '🚪 Прервать' : '✕ Закрыть'}
            </button>
          </div>
        </div>
        <div class="dp-cm-hint">Ctrl+Enter — отправить · Выберите тип договора в главном окне</div>
      </div>
    </div>`;
}

// ── Фаза 2: финализация договора ─────────────────────────────
function _renderCmFinalizationPhase(aiId, st, aiNation, playerNation) {
  const def = st.agreedTreaty ? TREATY_TYPES?.[st.agreedTreaty.type] : null;
  const treatyLabel = def ? `${def.icon} ${def.label}` : '📜 Договор';
  const aiRuler = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  const plFlag  = playerNation?.flag_emoji ?? '👑';

  // Текст договора
  let docContent;
  if (st.isFinLoading && !st.draftText) {
    docContent = `<div class="dp-cm-doc-loading">
      <div class="dp-cm-doc-loading-dots"><span></span><span></span><span></span></div>
      <div>${aiRuler} составляет текст договора...</div>
    </div>`;
  } else if (st.draftText) {
    docContent = `<div class="dp-cm-doc-text">${_escHtml(st.draftText)}</div>`;
  } else {
    docContent = `<div class="dp-cm-doc-loading">
      <div style="font-size:32px;opacity:.3">📜</div>
      <div>Текст договора будет здесь</div>
    </div>`;
  }

  // История правок
  const editsHtml = st.finDialogue.map(m => {
    const cls = m.role === 'user' ? 'dp-cm-edit-msg dp-cm-edit-msg--player'
              : m.role === 'system' ? 'dp-cm-edit-msg dp-cm-edit-msg--sys'
              : 'dp-cm-edit-msg dp-cm-edit-msg--ai';
    return `<div class="${cls}">${_escHtml(m.text)}</div>`;
  }).join('');

  if (st.isFinLoading && st.draftText) {
    // AI обрабатывает правку
  }

  const canSign = !!st.draftText && !st.isFinLoading;

  return `
    <div class="dp-cm-final-body">
      <!-- Документ договора -->
      <div class="dp-cm-doc-pane">
        <div class="dp-cm-doc-hdr">
          <div class="dp-cm-doc-title">${treatyLabel}</div>
          <div class="dp-cm-doc-subtitle">
            ${aiNation.flag_emoji ?? '🏛'} ${aiNation.name} &nbsp;↔&nbsp; ${playerNation?.flag_emoji ?? '👑'} ${playerNation?.name ?? 'Ваша держава'}
            · Версия ${st.draftVersion + 1}
          </div>
        </div>
        <div class="dp-cm-doc-scroll">${docContent}</div>
      </div>

      <!-- Правки и подписание -->
      <div class="dp-cm-edit-pane">
        <div class="dp-cm-edit-hdr">
          <div class="dp-cm-edit-hdr-title">Обсуждение условий</div>
          <div class="dp-cm-edit-hdr-sub">Предложите правки или запросите изменения</div>
        </div>
        <div class="dp-cm-edit-chat" id="dp-cm-edit-${aiId}">
          ${editsHtml || `<div style="padding:16px;font-size:11px;color:var(--text-dim);text-align:center">
            Стороны согласовали основные условия.<br>Вы можете запросить правки или подписать договор.
          </div>`}
          ${st.isFinLoading ? `<div class="dp-cm-edit-msg dp-cm-edit-msg--ai">
            <span class="dp-btn-dots"><span></span><span></span><span></span></span> ${aiRuler} отвечает...
          </div>` : ''}
        </div>
        <div class="dp-cm-edit-compose">
          <textarea class="dp-cm-edit-textarea" id="dp-cm-edit-input-${aiId}"
            placeholder="Запросите правки или уточнения..."
            onkeydown="if(event.ctrlKey&&event.key==='Enter')dpFinalizeSend('${aiId}')"
            ${st.isFinLoading ? 'disabled' : ''}></textarea>
          <div class="dp-cm-edit-btns">
            <button class="dp-cm-edit-send"
              onclick="dpFinalizeSend('${aiId}')"
              ${st.isFinLoading || !st.draftText ? 'disabled' : ''}>
              💬 Запросить правку
            </button>
          </div>
        </div>
        <div class="dp-cm-sign-bar">
          <div class="dp-cm-sign-status">
            ${canSign
              ? '✅ Договор готов к подписанию. Обе стороны могут принять условия.'
              : '⏳ Ожидание текста договора...'}
          </div>
          <button class="dp-cm-sign-btn" onclick="dpSignTreaty('${aiId}')"
            ${canSign ? '' : 'disabled'}>
            ✍ Подписать
          </button>
        </div>
      </div>
    </div>`;
}

// ── Экран «Договор подписан» ──────────────────────────────────
function _renderCmSignedPhase(aiId, st, aiNation) {
  const def    = st.agreedTreaty ? TREATY_TYPES?.[st.agreedTreaty.type] : null;
  const icon   = def?.icon ?? '📜';
  const label  = def?.label ?? 'Договор';
  const ruler  = aiNation.government?.ruler?.name ?? aiNation.government?.ruler ?? 'Правитель';
  return `
    <div class="dp-cm-signed">
      <div class="dp-cm-signed-seal">${icon}</div>
      <div class="dp-cm-signed-title">Договор подписан!</div>
      <div class="dp-cm-signed-sub">
        «${label}» между <strong>${GAME_STATE.nations[GAME_STATE.player_nation]?.name ?? 'вами'}</strong> и
        <strong>${aiNation.name}</strong> скреплён печатью.<br>
        ${ruler} благодарит за плодотворные переговоры.
      </div>
      <button class="dp-cm-signed-close" onclick="hideDipChatModal();_dpRender()">
        Закрыть переговорный зал
      </button>
    </div>`;
}

// ── Отправить сообщение в фазе 1 ─────────────────────────────
function dpChatSend(aiNationId) {
  const inputEl = document.getElementById(`dp-cm-input-${aiNationId}`);
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  const st = _getDtState(aiNationId);
  if (st.isLoading) return;
  inputEl.value = '';
  _dpChatSendActual(aiNationId, text);
}

async function _dpChatSendActual(aiNationId, text) {
  const playerNationId = GAME_STATE.player_nation;
  const st = _getDtState(aiNationId);

  let fullText = text;
  if (st.selectedTreaty && TREATY_TYPES?.[st.selectedTreaty]) {
    const d = TREATY_TYPES[st.selectedTreaty];
    fullText = `[Предложение: ${d.icon} ${d.label}]\n${text}`;
  }

  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.addMessage(playerNationId, aiNationId, 'user', fullText, text);
  }
  // Сохраняем в долгосрочную память обеих сторон
  if (typeof addDialogueMessage === 'function') {
    addDialogueMessage(aiNationId,     playerNationId, 'user',      fullText);
    addDialogueMessage(playerNationId, aiNationId,     'user',      fullText);
  }

  st.isLoading = true;
  _renderChatModal();

  try {
    const dialogue    = typeof DiplomacyEngine !== 'undefined'
      ? DiplomacyEngine.getDialogue(playerNationId, aiNationId) : [];
    const apiMessages = dialogue.map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    const dialogueModel = typeof getDialogueModel === 'function'
      ? getDialogueModel(aiNationId)
      : null;
    const raw     = await callDiplomacyAI(aiNationId, playerNationId, apiMessages, dialogueModel);
    const treaty  = parseDiplomacyTreaty(raw);
    const display = stripDiplomacyJSON(raw);

    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'assistant', raw, display);
    }
    // Сохраняем ответ AI в долгосрочную память
    if (typeof addDialogueMessage === 'function') {
      addDialogueMessage(aiNationId,     playerNationId, 'assistant', display);
      addDialogueMessage(playerNationId, aiNationId,     'assistant', display);
    }

    if (treaty?.is_peace) {
      // ── Ответ на мирные переговоры ──────────────────────────────────
      if (treaty.peace_agreed === true) {
        // AI принял мир — заключаем договор
        const terms = treaty.peace_terms ?? {};
        if (typeof DiplomacyEngine !== 'undefined') {
          const aiTreasury = GAME_STATE.nations[aiNationId]?.economy?.treasury ?? 0;
          const repTurns = terms.reparations_turns ?? 0;
          DiplomacyEngine.concludePeace(playerNationId, aiNationId, {
            ceded_regions:       terms.ceded_regions ?? [],
            vassalize:           terms.vassalize ?? false,
            reparations_turns:   repTurns,
            reparations_per_turn: repTurns > 0 ? Math.max(10, Math.round(aiTreasury * 0.03)) : 0,
            armistice_turns:     terms.armistice_turns ?? 60,
            loser:               aiNationId,
            winner:              playerNationId,
          });
          if (typeof addEventLog === 'function')
            addEventLog(`✅ Мир заключён через переговоры с ${GAME_STATE.nations[aiNationId]?.name ?? aiNationId}.`, 'success');
        }
        hideDipChatModal();
        _dpShowPeaceForm = false;
        _dpRender();
      } else if (treaty.peace_agreed === 'counter') {
        // AI выдвинул встречные условия — они отображаются в чате
        if (typeof addEventLog === 'function')
          addEventLog(`💬 ${GAME_STATE.nations[aiNationId]?.name ?? aiNationId} выдвинул встречные условия мира.`, 'info');
      }
      // false — отклонил, текст уже в чате
    } else if (treaty?.agreed === true && treaty.treaty_type) {
      // AI согласился — сохраняем и переходим к финализации
      st.agreedTreaty = { type: treaty.treaty_type, conditions: treaty.conditions ?? {} };
      // Не сохраняем как финальный договор пока — это делается при подписании
      st.selectedTreaty = null;
    } else if (treaty?.agreed === false) {
      if (typeof DiplomacyEngine !== 'undefined' && st.selectedTreaty) {
        DiplomacyEngine.recordRejection(playerNationId, aiNationId, st.selectedTreaty);
      }
      st.selectedTreaty = null;
    }
  } catch (err) {
    console.error('[dpChatSend]', err);
    if (typeof DiplomacyEngine !== 'undefined') {
      DiplomacyEngine.addMessage(playerNationId, aiNationId, 'system',
        `[Ошибка: ${err.message}]`, `⚠ Ошибка связи: ${err.message}`);
    }
  } finally {
    st.isLoading = false;
    _renderChatModal();
  }
}

// ── Завершить фазу 1 переговоров ─────────────────────────────
function dpEndNegotiations(aiNationId) {
  const st = _getDtState(aiNationId);
  if (st.isLoading) return;
  const dialogue = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getDialogue(GAME_STATE.player_nation, aiNationId) : [];

  if (!st.agreedTreaty) {
    // Нет договорённости — просто закрыть
    hideDipChatModal();
    return;
  }

  // Есть договорённость — перейти к финализации
  st.phase = 'finalization';
  _renderChatModal();
  // Автоматически запросить черновик у AI
  _dpRequestDraftFromAI(aiNationId);
}

// ── Запросить черновик договора у AI ─────────────────────────
async function _dpRequestDraftFromAI(aiNationId) {
  const playerNationId = GAME_STATE.player_nation;
  const st = _getDtState(aiNationId);
  if (!st.agreedTreaty) return;

  st.isFinLoading = true;
  _renderChatModal();

  try {
    const chatHistory = typeof DiplomacyEngine !== 'undefined'
      ? DiplomacyEngine.getDialogue(playerNationId, aiNationId) : [];

    const draftText = await callTreatyDraftAI(
      aiNationId, playerNationId,
      chatHistory, st.agreedTreaty.type, st.agreedTreaty.conditions
    );

    st.draftText    = draftText;
    st.draftVersion = 0;
    st.finDialogue.push({ role: 'system', text: '📜 Первый вариант договора составлен. Ознакомьтесь и предложите правки или подпишите.' });
  } catch (err) {
    console.error('[_dpRequestDraftFromAI]', err);
    st.finDialogue.push({ role: 'system', text: `⚠ Ошибка составления договора: ${err.message}` });
  } finally {
    st.isFinLoading = false;
    _renderChatModal();
  }
}

// ── Отправить правку в фазе финализации ──────────────────────
async function dpFinalizeSend(aiNationId) {
  const inputEl = document.getElementById(`dp-cm-edit-input-${aiNationId}`);
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  const st = _getDtState(aiNationId);
  if (st.isFinLoading || !st.draftText) return;

  inputEl.value = '';
  st.finDialogue.push({ role: 'user', text });
  st.isFinLoading = true;
  _renderChatModal();

  try {
    const playerNationId = GAME_STATE.player_nation;
    const result = await callTreatyRevisionAI(
      aiNationId, playerNationId,
      st.draftText, st.finDialogue, st.agreedTreaty?.type
    );

    st.draftText = result.draftText;
    st.draftVersion++;
    st.finDialogue.push({ role: 'assistant', text: result.comment });
    if (result.comment.toLowerCase().includes('изменени') || result.comment.toLowerCase().includes('обновл')) {
      st.finDialogue.push({ role: 'system', text: `📝 Версия ${st.draftVersion + 1}: договор обновлён по вашему запросу.` });
    }
  } catch (err) {
    console.error('[dpFinalizeSend]', err);
    st.finDialogue.push({ role: 'system', text: `⚠ Ошибка: ${err.message}` });
  } finally {
    st.isFinLoading = false;
    _renderChatModal();
  }
}

// ── Подписать договор (с валидацией и AI интерпретацией) ─────
async function dpSignTreaty(aiNationId) {
  const playerNationId = GAME_STATE.player_nation;
  const st = _getDtState(aiNationId);
  if (!st.agreedTreaty || !st.draftText) return;

  // Показываем статус проверки
  st.isFinLoading = true;
  st.finDialogue.push({ role: 'system', text: '⚙ Проверка условий договора...' });
  _renderChatModal();

  const treatyObj = {
    type:       st.agreedTreaty.type,
    conditions: { ...st.agreedTreaty.conditions, notes: st.draftText.slice(0, 600) },
    parties:    [playerNationId, aiNationId],
  };

  try {
    // ── 1. Правило-базированная валидация ──
    const validation = typeof validateTreaty === 'function'
      ? validateTreaty(treatyObj, playerNationId, aiNationId)
      : { ok: true, blocked: false, issues: [], warnings: [], modified: {} };

    if (validation.blocked) {
      st.finDialogue.push({ role: 'system', text: `🚫 Договор отклонён: ${validation.reason}` });
      st.isFinLoading = false;
      _renderChatModal();
      return;
    }

    // Применяем исправленные условия
    if (Object.keys(validation.modified).length) {
      Object.assign(treatyObj.conditions, validation.modified);
      const issueText = validation.issues.map(i => `• ${i}`).join('\n');
      st.finDialogue.push({ role: 'system', text: `⚖ Условия скорректированы системой баланса:\n${issueText}` });
    }

    // ── 2. AI контент-фильтр для сложных условий ──
    const notes = treatyObj.conditions.notes ?? '';
    if (notes.length > 30 && typeof aiContentFilter === 'function') {
      const filter = await aiContentFilter(notes);
      if (!filter.safe) {
        st.finDialogue.push({ role: 'system', text: `🚫 Условия отклонены фильтром содержания: ${filter.reason}` });
        st.isFinLoading = false;
        _renderChatModal();
        return;
      }
    }

    // ── 3. AI интерпретация условий (custom + сложные notes) ──
    if ((treatyObj.type === 'custom' || notes.length > 50)
        && typeof interpretCustomTreaty === 'function') {
      const interp = await interpretCustomTreaty(treatyObj, playerNationId, aiNationId);
      if (!interp.ok) {
        st.finDialogue.push({ role: 'system', text: `🚫 ${interp.humanSummary}` });
        st.isFinLoading = false;
        _renderChatModal();
        return;
      }
      if (interp.humanSummary) {
        st.finDialogue.push({ role: 'system', text: `✅ Применено: ${interp.humanSummary}` });
      }
    }

    // ── 4. Подписание и применение эффектов ──
    const dialogue = typeof DiplomacyEngine !== 'undefined'
      ? DiplomacyEngine.getDialogue(playerNationId, aiNationId) : [];

    const treaty = _dtFinalizeTreaty(playerNationId, aiNationId, {
      agreed:      true,
      treaty_type: treatyObj.type,
      conditions:  treatyObj.conditions,
    }, dialogue);

    // Применяем эффекты немедленно
    if (treaty && typeof applyTreatyEffects === 'function') {
      try { applyTreatyEffects(treaty); } catch (e) { console.warn('[applyTreatyEffects]', e); }
    }

    st.phase = 'signed';
  } catch (err) {
    console.error('[dpSignTreaty]', err);
    st.finDialogue.push({ role: 'system', text: `⚠ Ошибка при подписании: ${err.message}` });
  } finally {
    st.isFinLoading = false;
    _renderChatModal();
    _dpRender();
  }
}

// Максимальное число иностранных наций в списке дипломатии.
// Больше 150 рядов в DOM — уже лагово; с 1920 нациями нужен жёсткий лимит.
const _DP_NATIONS_LIMIT = 150;

function _getForeignNations(playerNationId) {
  const diplomacy = GAME_STATE.diplomacy;

  return Object.entries(GAME_STATE.nations ?? {})
    .filter(([id, n]) => id !== playerNationId && !n.is_eliminated && !n.is_defeated)
    .map(([id, n]) => {
      // Читаем score напрямую из relations — НЕ вызываем getRelationScore,
      // чтобы не провоцировать ленивую инициализацию 1900+ пар при открытии UI.
      const key    = [id, playerNationId].sort().join('_');
      let   score  = diplomacy?.relations?.[key]?.score ?? 0;
      const atWar  = diplomacy?.relations?.[key]?.war ?? false;
      // Fallback на legacy nation.relations если DiplomacyEngine ещё не засеян
      if (score === 0) {
        const legA = GAME_STATE.nations?.[playerNationId]?.relations?.[id]?.score;
        const legB = n?.relations?.[playerNationId]?.score;
        const leg  = legA ?? legB ?? null;
        if (typeof leg === 'number' && leg !== 0) score = leg;
      }
      return { id, name: n.name, flag: n.flag_emoji ?? '🏛', score, atWar };
    })
    // Сначала союзники/дружественные, потом враги, потом нейтральные
    .sort((a, b) => {
      if (a.atWar !== b.atWar) return a.atWar ? 1 : -1;
      return b.score - a.score;
    })
    .slice(0, _DP_NATIONS_LIMIT);
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
  const pct     = Math.max(0, Math.min(100, Math.round(((Number(rel.score) || 0) + 100) / 2)));

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
        ${atWar ? '⚔ ВОЙНА' : (rel.label ?? 'Нейтральные') + ' (' + (rel.score >= 0 ? '+' : '') + (rel.score ?? 0) + ')'}
      </span>
    </div>
    <div class="dp-redir-treaties">${tagsHtml}</div>
    <button class="dp-redir-btn" onclick="showDiplomacyOverlay('${aiId}')">
      🤝 Открыть зал переговоров
    </button>
  </div>`;
}
