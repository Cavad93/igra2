// ══════════════════════════════════════════════════════════════════════
// VICTORY.JS — Итог правления, кризисные вехи, завещание
//
// НЕТ классической победы. Нет принудительного конца игры.
// Только смена власти → итог правления, кризисные вехи раз в 600 ходов,
// и система завещания при возрасте правителя >= 60.
//
// Сессия 7:  checkVictoryConditions, generateRulerLegacy, showLegacyModal
// Сессия 8:  processCrisisVeha
// Сессия 10: testament system
// ══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
// FALLBACK — _addChronicleEntry (если achievements.js не загружен)
// ──────────────────────────────────────────────────────────────────────
if (typeof _addChronicleEntry !== 'function') {
  _addChronicleEntry = function(entry) {
    if (!GAME_STATE) return;
    if (!GAME_STATE.chronicle_log) GAME_STATE.chronicle_log = [];
    GAME_STATE.chronicle_log.push({ turn: GAME_STATE.turn ?? 0, ...entry });
    if (GAME_STATE.chronicle_log.length > 50) GAME_STATE.chronicle_log.shift();
  };
}

// ──────────────────────────────────────────────────────────────────────
// СЕССИЯ 7 — ИТОГ ПРАВЛЕНИЯ
// ──────────────────────────────────────────────────────────────────────

/**
 * Главный тик условий. Вызывается из turn.js после каждого хода.
 */
function checkVictoryConditions() {
  if (!GAME_STATE) return;
  const playerNation = GAME_STATE.player_nation;
  if (!playerNation) return;
  const n   = GAME_STATE.nations?.[playerNation];
  if (!n) return;
  const gov     = n.government ?? {};
  const govType = gov.type ?? 'monarchy';
  const turn    = GAME_STATE.turn ?? 0;

  // ── Кризисные вехи (Сессия 8) ──
  if (turn > 0 && turn % 600 === 0) {
    try { processCrisisVeha(playerNation); } catch (e) { console.warn('[crisis]', e); }
  }

  // ── Тик активного кризиса (постепенные эффекты) ──
  try { _tickActiveCrisis(playerNation); } catch (e) {}

  // ── Проверка итогов кризиса (через N ходов после начала) ──
  const crisis = GAME_STATE.active_crisis;
  if (crisis && !crisis.resolved) {
    const checkAt = crisis.check_at ?? (crisis.start_turn + (CRISIS_DEFS[crisis.type]?.check_turns ?? 15));
    if (turn >= checkAt) {
      _resolveCrisis(playerNation, crisis);
    }
  }

  // ── Монархия / тирания / племя → при смерти правителя ──
  if (['monarchy', 'tyranny', 'chiefdom', 'tribal'].includes(govType)) {
    if (gov.ruler_changed === true) {
      gov.ruler_changed = false;
      generateRulerLegacy(playerNation, 'ruler_death');
    }
  }

  // ── Республика → каждые 12 ходов ──
  if (govType === 'republic' && turn > 1 && turn % 12 === 0) {
    generateRulerLegacy(playerNation, 'consul_change');
  }

  // ── Олигархия → каждые 24 хода ──
  if (govType === 'oligarchy' && turn > 1 && turn % 24 === 0) {
    generateRulerLegacy(playerNation, 'council_change');
  }

  // ── Завещание: уведомить при возрасте >= 60 (Сессия 10) ──
  _checkTestamentAge(playerNation);
}

/**
 * Сгенерировать итог правления и показать модал.
 * @param {string} nationId
 * @param {string} reason  'ruler_death' | 'consul_change' | 'council_change'
 */
function generateRulerLegacy(nationId, reason) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;
  const gov = n.government ?? {};

  const rulerStartTurn = n._ruler_start_turn ?? 0;
  const currentTurn    = GAME_STATE.turn ?? 0;

  // Запомнить начало следующего правления
  n._ruler_start_turn = currentTurn;

  // Проверить завещание (Сессия 10) — до построения data, чтобы включить в неё
  const testamentResult = _evaluateTestament(nationId);

  const data = {
    ruler_name:   gov.ruler?.name ?? 'Правитель',
    turns_ruled:  Math.max(1, currentTurn - rulerStartTurn),
    grandeur:     typeof calcGrandeur === 'function' ? calcGrandeur(nationId) : 0,
    achievements: typeof getAchievements === 'function'
      ? getAchievements(nationId).map(a => a.name)
      : [],
    wars:         n._wars_total ?? 0,
    treasury:     Math.round(n.economy?.treasury ?? 0),
    population:   n.population?.total ?? 0,
    reason,
    testament:    testamentResult,
  };

  const legacyText = _buildLegacyText(data);

  // Добавить в хронику
  if (typeof _addChronicleEntry === 'function') {
    _addChronicleEntry({
      type:   'legacy',
      text:   legacyText,
      reason,
      ruler:  data.ruler_name,
      grandeur: data.grandeur,
    });
  }

  // Добавить в событийный лог
  if (typeof addEventLog === 'function') {
    addEventLog(`👑 Итог правления ${data.ruler_name}: ${legacyText}`, 'info');
  }

  showLegacyModal(legacyText, data, testamentResult);
}

/**
 * Синхронный шаблонный генератор нарратива.
 * @param {object} data
 * @returns {string}
 */
function _buildLegacyText(data) {
  const { ruler_name, turns_ruled, grandeur, achievements, wars, treasury, reason } = data;

  let text = '';

  if (reason === 'consul_change') {
    // Консульский итог
    const quality = treasury > 10000 ? 'процветала' : 'испытывала трудности';
    text = `Консулат ${ruler_name} (${turns_ruled} мес.): казна ${quality}. `;
    if (achievements.includes('Миротворец')) text += 'Мирный период укрепил торговлю. ';
    if (wars > 2) text += `Три кампании истощили государство. `;
    text += grandeur >= 500 ? 'Сенат оценил работу высоко.' : 'Сенат оценил работу как удовлетворительную.';
  } else if (reason === 'council_change') {
    // Олигархический итог
    const influence = grandeur >= 400 ? 'сохранил влияние' : 'утратил часть власти';
    text = `Совет под руководством ${ruler_name} ${influence}. `;
    text += treasury > 20000 ? 'Торговля процветала.' : 'Казна требовала внимания.';
  } else {
    // Монарший итог (ruler_death)
    text = `${ruler_name} правил ${turns_ruled} месяцев. `;
    if (wars > 5) {
      text += 'Его правление прошло в постоянных войнах. ';
    } else if (wars === 0) {
      text += 'Он хранил мир на протяжении всего правления. ';
    } else {
      text += 'Он избегал излишних конфликтов. ';
    }
    text += `Индекс величия достиг ${grandeur}. `;
    if (achievements.length > 5) {
      text += 'Народ будет помнить его ещё долго.';
    } else if (achievements.length > 2) {
      text += 'История сохранит о нём достойные записи.';
    } else {
      text += 'История оценит его скромно.';
    }
  }

  return text.trim();
}

/**
 * Показать модальное окно «Итог правления» (не останавливает игру).
 * @param {string} text    нарративный текст
 * @param {object} data    данные правителя
 * @param {object|null} testament  результат проверки завещания
 */
function showLegacyModal(text, data, testament) {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('legacy-modal');
  if (existing) existing.remove();

  const reasonLabel = {
    ruler_death:    'Смерть правителя',
    consul_change:  'Смена консула',
    council_change: 'Смена совета',
  }[data.reason] ?? 'Смена власти';

  const achievHtml = data.achievements.length
    ? `<div class="legacy-achievements">
        <div class="legacy-label">Свершения:</div>
        <div class="legacy-achiev-list">${data.achievements.slice(-8).map(a => `<span class="legacy-achiev-tag">${a}</span>`).join('')}</div>
       </div>`
    : '';

  const testamentHtml = testament
    ? `<div class="legacy-testament">
        <div class="legacy-label">Завещание выполнено: ${testament.done} / ${testament.total}</div>
        ${testament.goals.map(g => `<div class="legacy-testament-row">${g.ok ? '✅' : '❌'} ${g.text}</div>`).join('')}
      </div>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'legacy-modal';
  modal.className = 'legacy-modal-overlay';
  modal.innerHTML = `
    <div class="legacy-modal">
      <div class="legacy-header">
        <span class="legacy-title">👑 Итог правления</span>
        <div class="legacy-reason">${reasonLabel}</div>
      </div>
      <div class="legacy-ruler-name">${data.ruler_name}</div>
      <div class="legacy-period">Правил ${data.turns_ruled} месяцев</div>
      <div class="legacy-grandeur">✦ Индекс величия: <strong>${data.grandeur}</strong></div>
      ${achievHtml}
      <div class="legacy-text">${text}</div>
      ${testamentHtml}
      <div class="legacy-footer">
        <button class="legacy-continue-btn" onclick="document.getElementById('legacy-modal').remove()">
          Продолжить ▸
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// ──────────────────────────────────────────────────────────────────────
// СЕССИЯ 8 — КРИЗИСНЫЕ ВЕХИ
// ──────────────────────────────────────────────────────────────────────

const CRISIS_DEFS = {
  PLAGUE: {
    type:     'PLAGUE',
    cond:     n => (n.population?.total ?? 0) > 100000,
    message:  '🦠 Великая чума охватила земли! Выживет ли народ?',
    apply(n, gs) {
      n._crisis_plague_turns = 0;
    },
    tick(n, gs) {
      // Постепенное уменьшение населения за 5 ходов
      if ((n._crisis_plague_turns ?? 0) < 5) {
        if (n.population) n.population.total = Math.floor(n.population.total * 0.94);
        n._crisis_plague_turns = (n._crisis_plague_turns ?? 0) + 1;
      }
    },
    check_turns: 10,
    goal_text:   'Сохранить население > 300 000 человек',
    success:     n => (n.population?.total ?? 0) > 300000,
  },
  INVASION: {
    type:     'INVASION',
    cond:     (n, gs) => Object.keys(gs.nations ?? {}).length > 1,
    message:  '⚔️ Нашествие! Враги идут на столицу!',
    apply(n, gs, nationId) {
      // Найти сильнейшего соседа и объявить войну
      const others = Object.entries(gs.nations ?? {})
        .filter(([id]) => id !== nationId)
        .sort(([,a],[,b]) =>
          ((b.military?.infantry ?? 0) + (b.military?.cavalry ?? 0) * 3) -
          ((a.military?.infantry ?? 0) + (a.military?.cavalry ?? 0) * 3)
        );
      if (others.length && typeof declareWar === 'function') {
        const [invaderId] = others[0];
        gs._crisis_invader = invaderId;
        try { declareWar(invaderId, nationId); } catch (e) {}
      }
    },
    check_turns: 15,
    goal_text:   'Не потерять столицу за 15 ходов',
    success(n, gs, nationId) {
      const capital = n.capital_region ?? n.regions?.[0];
      if (!capital) return true;
      return (n.regions ?? []).includes(capital);
    },
  },
  FAMINE: {
    type:    'FAMINE',
    cond:    () => true,
    message: '🌾 Великий голод! Запасы зерна иссякли.',
    apply(n, gs) {
      if (n.economy?.stockpile) n.economy.stockpile.wheat = 0;
      n._famine_turns_left = 3;
    },
    tick(n, gs) {
      if ((n._famine_turns_left ?? 0) > 0) {
        if (n.economy?.stockpile) n.economy.stockpile.wheat = 0;
        n._famine_turns_left--;
        if (n.population) n.population.happiness = Math.max(0, (n.population.happiness ?? 50) - 5);
      }
    },
    check_turns: 10,
    goal_text:   'Не допустить счастья < 20 за 10 ходов',
    success:     n => (n.population?.happiness ?? 50) >= 20,
  },
  DEBT_CRISIS: {
    type:    'DEBT_CRISIS',
    cond:    (n, gs, nationId) => (gs.loans ?? []).some(l => l.nation_id === nationId && l.status === 'active'),
    message: '📜 Долговой кризис! Кредиторы требуют немедленной выплаты.',
    apply(n, gs, nationId) {
      // Удвоить monthly_payment всех займов на 6 ходов
      for (const loan of (gs.loans ?? [])) {
        if (loan.nation_id === nationId && loan.status === 'active') {
          loan._original_payment = loan.monthly_payment;
          loan.monthly_payment   = (loan.monthly_payment ?? 0) * 2;
        }
      }
      n._debt_crisis_turns_left = 6;
    },
    tick(n, gs, nationId) {
      if ((n._debt_crisis_turns_left ?? 0) > 0) {
        n._debt_crisis_turns_left--;
        if (n._debt_crisis_turns_left === 0) {
          // Восстановить платежи
          for (const loan of (gs.loans ?? [])) {
            if (loan.nation_id === nationId && loan._original_payment !== undefined) {
              loan.monthly_payment = loan._original_payment;
              delete loan._original_payment;
            }
          }
        }
      }
    },
    check_turns: 12,
    goal_text:   'Не объявлять банкротство за 12 ходов',
    success:     n => (n._bankruptcies ?? 0) === (n._pre_crisis_bankruptcies ?? 0),
  },
};

/**
 * Выбрать и запустить кризисную веху.
 * Вызывается из checkVictoryConditions при turn % 600 === 0.
 * @param {string} nationId
 */
function processCrisisVeha(nationId) {
  nationId = nationId ?? GAME_STATE?.player_nation;
  if (GAME_STATE.active_crisis && !GAME_STATE.active_crisis.resolved) return; // уже идёт кризис

  const n  = GAME_STATE.nations?.[nationId];
  if (!n) return;
  const gs = GAME_STATE;

  // Выбрать подходящий кризис
  const eligible = Object.values(CRISIS_DEFS).filter(def => {
    try { return def.cond(n, gs, nationId); } catch { return false; }
  });
  if (!eligible.length) return;

  // Случайный из подходящих
  const def = eligible[Math.floor(Math.random() * eligible.length)];

  // Сохранить baseline для DEBT_CRISIS
  n._pre_crisis_bankruptcies = n._bankruptcies ?? 0;

  // Применить эффект
  try { def.apply(n, gs, nationId); } catch (e) { console.warn('[crisis apply]', e); }

  GAME_STATE.active_crisis = {
    type:       def.type,
    start_turn: gs.turn ?? 0,
    check_at:   (gs.turn ?? 0) + def.check_turns,
    resolved:   false,
    success:    false,
    goal_text:  def.goal_text,
    nation_id:  nationId,
  };

  if (typeof addEventLog === 'function') {
    addEventLog(def.message, 'danger');
  }
}

/**
 * Тик активного кризиса (постепенные эффекты).
 * Вызывается из checkVictoryConditions каждый ход.
 * @param {string} nationId
 */
function _tickActiveCrisis(nationId) {
  const crisis = GAME_STATE.active_crisis;
  if (!crisis || crisis.resolved) return;
  // Treat undefined nation_id as matching player_nation
  const crisisNation = crisis.nation_id ?? GAME_STATE?.player_nation;
  if (crisisNation !== nationId) return;
  const def = CRISIS_DEFS[crisis.type];
  if (!def?.tick) return;
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;
  try { def.tick(n, GAME_STATE, nationId); } catch (e) {}
}

/**
 * Проверить итог кризиса.
 * @param {string} nationId
 * @param {object} crisis
 */
function _resolveCrisis(nationId, crisis) {
  const def = CRISIS_DEFS[crisis.type];
  const n   = GAME_STATE.nations?.[nationId];
  if (!n || !def) { crisis.resolved = true; return; }

  let success = false;
  try { success = def.success(n, GAME_STATE, nationId); } catch (e) {}

  crisis.resolved = true;
  crisis.success  = success;

  if (success) {
    n._crisis_survived = (n._crisis_survived ?? 0) + 1;
    if (typeof addEventLog === 'function') {
      addEventLog('✅ Кризис преодолён! Держава выстояла.', 'success');
    }
    if (typeof addMemoryEvent === 'function') {
      addMemoryEvent(nationId, 'politics', `Кризис ${crisis.type} преодолён.`);
    }
  } else {
    if (typeof addEventLog === 'function') {
      addEventLog('⚠ Кризис нанёс урон. Летопись запишет эту страницу.', 'warning');
    }
    if (typeof addMemoryEvent === 'function') {
      addMemoryEvent(nationId, 'politics', `Кризис ${crisis.type} не преодолён.`);
    }
  }

  // Запись в хронику
  if (typeof _addChronicleEntry === 'function') {
    _addChronicleEntry({
      type: 'crisis',
      crisis_type: crisis.type,
      success,
      text: success
        ? `⚔️ Кризис «${crisis.type}» преодолён с честью.`
        : `💀 Кризис «${crisis.type}» нанёс серьёзный урон державе.`,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
// СЕССИЯ 10 — ЗАВЕЩАНИЕ
// ──────────────────────────────────────────────────────────────────────

const TESTAMENT_GOAL_DEFS = [
  {
    id:   'treasury_20k',
    text: '💰 Оставить казну > 20 000',
    check: n => (n.economy?.treasury ?? 0) > 20000,
  },
  {
    id:   'army_5k',
    text: '⚔️ Оставить армию > 5 000 солдат',
    check: n => ((n.military?.infantry ?? 0) + (n.military?.cavalry ?? 0)) > 5000,
  },
  {
    id:   'peace',
    text: '🕊 Закончить все войны',
    check: n => (n.military?.at_war_with?.length ?? 0) === 0,
  },
  {
    id:   'end_wars',
    text: '🕊 Закончить все войны',
    check: n => (n.military?.at_war_with?.length ?? 0) === 0,
  },
  {
    id:   'no_debt',
    text: '📜 Погасить все займы',
    check: (n, gs, nid) => {
      const loans = (gs.loans ?? []).filter(l => l.nation_id === nid && l.status === 'active');
      return loans.length === 0;
    },
  },
  {
    id:   'no_loans',
    text: '📜 Погасить все займы',
    check: (n, gs, nid) => {
      const loans = (gs.loans ?? []).filter(l => l.nation_id === nid && l.status === 'active');
      return loans.length === 0;
    },
  },
  {
    id:   'alliance',
    text: '🤝 Заключить союз с соседом',
    check: (n, gs, nid) => (gs.diplomacy?.treaties ?? []).some(
      t => t.status === 'active' &&
           ['alliance', 'defensive_alliance', 'military_alliance'].includes(t.type) &&
           t.parties.includes(nid)
    ),
  },
  {
    id:   'expand_10',
    text: '🌍 Расширить владения до 10 регионов',
    check: n => (n.regions?.length ?? 0) >= 10,
  },
];

/**
 * Проверить возраст правителя и уведомить об открытии завещания.
 * @param {string} nationId
 */
function _checkTestamentAge(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;
  const age = n.government?.ruler?.age ?? 0;
  if (age < 60) return;
  if (n._testament_notified) return;

  n._testament_notified = true;

  if (typeof addEventLog === 'function') {
    addEventLog('⏳ Правитель достиг 60 лет. Откройте «Завещание» в управлении государством.', 'info');
  }
}

/**
 * Получить все доступные цели завещания.
 * @returns {Array}
 */
function getTestamentGoalDefs() {
  return TESTAMENT_GOAL_DEFS;
}

/**
 * Взять цель в завещание.
 * @param {string} goalId
 */
function addTestamentGoal(goalId) {
  if (!GAME_STATE.testament) {
    GAME_STATE.testament = { goals: [], created_turn: GAME_STATE.turn ?? 0 };
  }
  const def = TESTAMENT_GOAL_DEFS.find(g => g.id === goalId);
  if (!def) return;
  if (GAME_STATE.testament.goals.find(g => g.id === goalId)) return; // уже добавлена
  if (GAME_STATE.testament.goals.length >= 3) {
    if (typeof addEventLog === 'function') {
      addEventLog('⚠ Нельзя добавить более 3 целей в завещание.', 'warning');
    }
    return;
  }
  GAME_STATE.testament.goals.push({ id: goalId, text: def.text });
  if (typeof addEventLog === 'function') {
    addEventLog(`📜 Завещание: добавлена цель «${def.text}»`, 'info');
  }
}

/**
 * Убрать цель из завещания.
 * @param {string} goalId
 */
function removeTestamentGoal(goalId) {
  if (!GAME_STATE.testament) return;
  GAME_STATE.testament.goals = GAME_STATE.testament.goals.filter(g => g.id !== goalId);
}

/**
 * Проверить выполнение завещания при смерти правителя.
 * Вызывается из generateRulerLegacy.
 * @param {string} nationId
 * @returns {{ done, total, goals, all_ok }} | null
 */
function _evaluateTestament(nationId) {
  const testament = GAME_STATE.testament;
  if (!testament || !testament.goals?.length) return null;

  const n  = GAME_STATE.nations?.[nationId];
  const gs = GAME_STATE;

  const results = testament.goals.map(g => {
    const def = TESTAMENT_GOAL_DEFS.find(d => d.id === g.id);
    let ok = false;
    if (def) {
      try { ok = def.check(n, gs, nationId); } catch (e) {}
    }
    return { text: g.text, ok };
  });

  const done   = results.filter(r => r.ok).length;
  const total  = results.length;
  const all_ok = done === total;

  if (all_ok) {
    if (n) n._testament_completed = true;
    if (typeof addMemoryEvent === 'function') {
      addMemoryEvent(nationId, 'politics', 'Завещание выполнено полностью.');
    }
  }

  return { done, fulfilled: done, total, goals: results, all_ok };
}

/**
 * Показать модальное окно «Завещание».
 */
function showTestamentModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('testament-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  _renderTestamentModalContent();
}

function hideTestamentModal() {
  const modal = document.getElementById('testament-modal');
  if (modal) modal.style.display = 'none';
}

function _renderTestamentModalContent() {
  const content = document.getElementById('testament-modal-content');
  if (!content) return;

  const nationId = GAME_STATE?.player_nation;
  const n        = GAME_STATE?.nations?.[nationId];
  const gs       = GAME_STATE;
  const testament = gs?.testament ?? { goals: [] };
  const takenIds  = testament.goals.map(g => g.id);

  const goalsHtml = TESTAMENT_GOAL_DEFS.map(def => {
    const taken = takenIds.includes(def.id);
    let status = '⏳';
    let statusClass = '';
    if (taken) {
      let ok = false;
      try { ok = def.check(n, gs, nationId); } catch (e) {}
      status = ok ? '✅' : '⏳';
      statusClass = ok ? 'testament-done' : '';
    }

    return `<div class="testament-goal-row ${statusClass}">
      <span class="testament-goal-text">${def.text}</span>
      ${taken
        ? `<span class="testament-goal-status">${status}</span>
           <button class="testament-remove-btn" onclick="removeTestamentGoal('${def.id}');_renderTestamentModalContent()">✕</button>`
        : `<button class="testament-add-btn" onclick="addTestamentGoal('${def.id}');_renderTestamentModalContent()"
            ${takenIds.length >= 3 ? 'disabled' : ''}>+ Добавить</button>`
      }
    </div>`;
  }).join('');

  content.innerHTML = `
    <div class="testament-panel">
      <div class="testament-info">
        Выберите до 3 целей, которые хотите оставить наследнику.<br>
        Итог будет оценён при смене правителя.
      </div>
      <div class="testament-goals-list">
        ${goalsHtml}
      </div>
      <div class="testament-count" style="margin-top:8px;color:var(--text-dim);font-size:12px">
        Выбрано: ${takenIds.length} / 3
      </div>
    </div>`;
}

/**
 * Рендер блока завещания для панели управления государством.
 * Показывается только при возрасте правителя >= 60.
 * @param {object} nation
 * @returns {string} HTML или ''
 */
function renderTestamentBlock(nation) {
  const age = nation?.government?.ruler?.age ?? 0;
  if (age < 60) return '';

  const testament = GAME_STATE?.testament ?? { goals: [] };
  const takenIds  = testament.goals.map(g => g.id);
  const nationId  = GAME_STATE?.player_nation;
  const gs        = GAME_STATE;

  const goalRows = testament.goals.map(g => {
    const def = TESTAMENT_GOAL_DEFS.find(d => d.id === g.id);
    let ok = false;
    if (def) {
      try { ok = def.check(nation, gs, nationId); } catch (e) {}
    }
    return `<div class="testament-row-mini">${ok ? '✅' : '⏳'} ${g.text}</div>`;
  }).join('');

  return `
    <div class="gov-section-title">📜 Завещание наследнику</div>
    <div class="gov-block testament-block">
      ${takenIds.length === 0
        ? '<div class="testament-empty">Завещание не составлено.</div>'
        : goalRows
      }
      <button class="gov-action-btn" style="margin-top:8px" onclick="showTestamentModal()">
        📜 Составить завещание
      </button>
    </div>`;
}

/**
 * Рендер блока исторического рейтинга для панели управления государством.
 * @param {object} nation
 * @returns {string} HTML
 */
function renderHistoricalRatingBlock(nation) {
  const nationId = GAME_STATE?.player_nation;
  if (!nationId || typeof getHistoricalRating !== 'function') return '';

  const turn = GAME_STATE?.turn ?? 0;
  // Кэшировать раз в 10 ходов
  if (!nation._hist_rating_cache || (turn % 10 === 0)) {
    nation._hist_rating_cache = getHistoricalRating(nationId);
    nation._hist_rating_turn  = turn;
  }
  const lines = nation._hist_rating_cache ?? [];
  if (!lines.length) return '';

  return `
    <div class="gov-section-title">⚖️ Историческое сравнение</div>
    <div class="gov-block">
      ${lines.map(l => `<div style="font-style:italic;font-size:12px;color:var(--text-dim);margin:2px 0">${l}</div>`).join('')}
    </div>`;
}
