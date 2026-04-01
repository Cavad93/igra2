// ══════════════════════════════════════════════════════════════════════
// VICTORY / LEGACY SYSTEM — итоги правления и кризисные вехи
//
// Нет классической победы. Нет экрана «Ты победил».
// Только итоги правления и кризисные вехи.
//
// Публичные функции:
//   checkVictoryConditions()          — вызывать из turn.js каждый ход
//   generateRulerLegacy(nationId, reason)
//   showLegacyModal(text, data)
//   processCrisisVeha()               — кризисные вехи раз в 600 ходов
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 7 — ИТОГ ПРАВЛЕНИЯ ПРИ СМЕНЕ ВЛАСТИ
// ══════════════════════════════════════════════════════════════════════

function checkVictoryConditions() {
  const playerNation = GAME_STATE.player_nation;
  if (!playerNation) return;
  const n = GAME_STATE.nations?.[playerNation];
  if (!n) return;

  const govType = n.government?.type ?? 'monarchy';
  const turn    = GAME_STATE.turn ?? 0;

  // ── Монархия / тирания / вождество → при смерти правителя ──
  if (['monarchy', 'tyranny', 'chiefdom', 'tribal'].includes(govType)) {
    if (n.government?.ruler_changed) {
      n.government.ruler_changed = false;
      generateRulerLegacy(playerNation, 'ruler_death');
    }
  }

  // ── Республика → каждые 12 ходов (смена консула) ──
  if (govType === 'republic' && turn > 1 && turn % 12 === 0) {
    generateRulerLegacy(playerNation, 'consul_change');
  }

  // ── Олигархия → каждые 24 хода (смена совета) ──
  if (govType === 'oligarchy' && turn > 1 && turn % 24 === 0) {
    generateRulerLegacy(playerNation, 'council_change');
  }

  // ── Кризисные вехи ──
  if (turn > 0 && turn % 600 === 0) {
    processCrisisVeha();
  }

  // ── Проверка завершения активного кризиса ──
  _checkCrisisResolution(playerNation);

  // ── Завещание: показать кнопку при возрасте правителя >= 60 ──
  _checkTestamentTrigger(playerNation);
}

// ──────────────────────────────────────────────────────────────────────

function generateRulerLegacy(nationId, reason) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;

  const gov = n.government ?? {};
  const eco = n.economy   ?? {};
  const pop = n.population ?? {};

  const rulerName   = gov.ruler?.name ?? 'Правитель';
  const turnsRuled  = (GAME_STATE.turn ?? 0) - (n._ruler_start_turn ?? 0);
  const grandeur    = (typeof calcGrandeur === 'function') ? calcGrandeur(nationId) : 0;
  const achievList  = (typeof getAchievements === 'function') ? getAchievements(nationId) : [];
  // Достижения, полученные в ЭТОТ период правления
  const reignStartTurn = n._ruler_start_turn ?? 0;
  const reignAchievs = achievList.filter(a => (a.turn ?? 0) >= reignStartTurn);

  const data = {
    ruler_name:    rulerName,
    turns_ruled:   turnsRuled,
    grandeur,
    achievements:  reignAchievs.map(a => a.name),
    wars:          n._wars_total ?? 0,
    treasury:      Math.round(eco.treasury ?? 0),
    population:    pop.total ?? 0,
    reason,
    nation_name:   n.name ?? nationId,
  };

  // Запомнить начало следующего правления
  n._ruler_start_turn = GAME_STATE.turn ?? 0;

  // Проверить завещание
  const testamentResult = _checkTestamentOnDeath(nationId, data);
  if (testamentResult) data.testament = testamentResult;

  const legacyText = _buildLegacyText(data);
  showLegacyModal(legacyText, data);

  // Хроника
  if (typeof addEventLog === 'function') {
    addEventLog(`📜 Правление ${rulerName} завершилось. Величие: ${grandeur}. Ходов: ${turnsRuled}.`, 'info');
  }
}

// ──────────────────────────────────────────────────────────────────────

function _buildLegacyText(data) {
  const { ruler_name, turns_ruled, grandeur, achievements, wars, treasury, reason, nation_name } = data;

  const months = turns_ruled;
  const years  = Math.floor(months / 12);
  const period = years > 0 ? `${years} лет (${months} месяцев)` : `${months} месяцев`;

  let text = '';

  if (reason === 'ruler_death') {
    text += `${ruler_name} правил ${nation_name} на протяжении ${period}. `;
    text += wars > 5
      ? 'Его правление прошло в постоянных войнах, армии не знали покоя. '
      : wars > 0
        ? 'Несколько войн пришлось пережить народу. '
        : 'Он избегал конфликтов, предпочитая мир. ';
    text += `Индекс величия достиг ${grandeur}. `;
    text += achievements.length > 5
      ? 'Народ будет помнить его ещё долго.'
      : achievements.length > 0
        ? 'История сохранит несколько его свершений.'
        : 'История оценит его скромно.';

  } else if (reason === 'consul_change') {
    text += `Консулат ${ruler_name} (${period}): `;
    text += treasury > 10000 ? 'казна процветала. ' : 'казна испытывала трудности. ';
    if (achievements.includes('Миротворец')) text += 'Мирный период укрепил торговлю. ';
    if (achievements.includes('Первая кровь') || achievements.includes('Машина войны')) {
      text += 'Военные победы прославили консула. ';
    }
    text += `Величие державы: ${grandeur}.`;

  } else if (reason === 'council_change') {
    text += `Совет под руководством ${ruler_name} управлял державой ${period}. `;
    text += treasury > 20000 ? 'Торговля процветала. ' : 'Экономика требовала внимания. ';
    text += `Величие: ${grandeur}.`;

  } else {
    text += `${ruler_name} завершил период правления (${period}). Величие: ${grandeur}.`;
  }

  return text;
}

// ──────────────────────────────────────────────────────────────────────

function showLegacyModal(text, data) {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('legacy-modal');
  if (existing) existing.remove();

  const achievHtml = data.achievements?.length
    ? `<div class="legacy-achiev-list">${data.achievements.map(a => `<span class="legacy-achiev-tag">🏆 ${a}</span>`).join('')}</div>`
    : '<div style="color:var(--text-dim);font-size:12px">Нет достижений за это правление</div>';

  const testamentHtml = data.testament
    ? `<div class="legacy-testament">
         <div class="legacy-section-title">📜 Завещание</div>
         <div>Выполнено: ${data.testament.fulfilled} / ${data.testament.total}</div>
         ${data.testament.goals.map(g => `<div>${g.done ? '✅' : '❌'} ${g.text}</div>`).join('')}
       </div>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'legacy-modal';
  modal.className = 'legacy-modal-overlay';
  modal.innerHTML = `
    <div class="legacy-modal">
      <div class="legacy-header">
        <span class="legacy-title">📜 Итог правления</span>
      </div>
      <div class="legacy-ruler-name">${data.ruler_name}</div>
      <div class="legacy-period">${data.nation_name} · ${data.turns_ruled} месяцев</div>
      <div class="legacy-grandeur">✦ Величие: <strong>${data.grandeur}</strong></div>
      <div class="legacy-section-title">Достижения за правление</div>
      ${achievHtml}
      ${testamentHtml}
      <div class="legacy-narrative">${text}</div>
      <button class="legacy-continue-btn" onclick="document.getElementById('legacy-modal').remove()">
        ▸ Продолжить
      </button>
    </div>`;

  document.body.appendChild(modal);
}

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 8 — КРИЗИСНЫЕ ВЕХИ (раз в 600 ходов)
// ══════════════════════════════════════════════════════════════════════

const CRISIS_TYPES = {
  PLAGUE: {
    label: 'Великая чума',
    icon: '🦠',
    msg: '🦠 Великая чума охватила земли! Выживет ли народ?',
    trigger: (n) => (n.population?.total ?? 0) > 100000,
    apply: (n, gs) => {
      n._crisis_plague_ticks = 5;
      if (typeof addEventLog === 'function') {
        addEventLog('🦠 Великая чума охватила земли! Выживет ли народ?', 'danger');
      }
    },
    goalCheck: (n) => (n.population?.total ?? 0) > 300000,
    goalText: 'Сохранить население > 300 000 в течение 10 ходов',
    duration: 10,
  },
  INVASION: {
    label: 'Нашествие',
    icon: '⚔️',
    msg: '⚔️ Нашествие! Враги идут на столицу!',
    trigger: (n, gs) => {
      const nid = gs.player_nation;
      return Object.keys(gs.nations ?? {}).some(
        id => id !== nid && (gs.nations[id].regions?.length ?? 0) > 0
      );
    },
    apply: (n, gs) => {
      const nid = gs.player_nation;
      // Найти самую сильную соседнюю нацию
      const neighbor = Object.entries(gs.nations ?? {})
        .filter(([id]) => id !== nid)
        .sort(([,a],[,b]) =>
          ((b.military?.infantry ?? 0) + (b.military?.cavalry ?? 0)) -
          ((a.military?.infantry ?? 0) + (a.military?.cavalry ?? 0))
        )[0];
      if (neighbor && typeof declareWar === 'function') {
        try { declareWar(neighbor[0], nid); } catch (e) {}
      }
      if (typeof addEventLog === 'function') {
        addEventLog('⚔️ Нашествие! Враги идут на столицу!', 'danger');
      }
    },
    goalCheck: (n, gs) => {
      const capital = n.capital_region ?? n.regions?.[0];
      return !capital || (n.regions ?? []).includes(capital);
    },
    goalText: 'Удержать столицу в течение 15 ходов',
    duration: 15,
  },
  FAMINE: {
    label: 'Великий голод',
    icon: '🌾',
    msg: '🌾 Великий голод! Запасы зерна иссякли.',
    trigger: () => true,
    apply: (n, gs) => {
      if (n.economy?.stockpile) {
        n._crisis_famine_wheat_saved = n.economy.stockpile.wheat ?? 0;
        n.economy.stockpile.wheat = 0;
        n._crisis_famine_ticks = 3;
      }
      if (typeof addEventLog === 'function') {
        addEventLog('🌾 Великий голод! Запасы зерна иссякли.', 'danger');
      }
    },
    goalCheck: (n) => (n.population?.happiness ?? 50) >= 20,
    goalText: 'Не допустить счастья < 20 в течение 10 ходов',
    duration: 10,
  },
  DEBT_CRISIS: {
    label: 'Долговой кризис',
    icon: '📜',
    msg: '📜 Долговой кризис! Кредиторы требуют немедленной выплаты.',
    trigger: (n, gs) => (gs.loans ?? []).some(l => l.nation_id === gs.player_nation && l.status === 'active'),
    apply: (n, gs) => {
      const activeLoans = (gs.loans ?? []).filter(
        l => l.nation_id === gs.player_nation && l.status === 'active'
      );
      for (const loan of activeLoans) {
        loan.monthly_payment = (loan.monthly_payment ?? 0) * 2;
        loan._crisis_doubled = true;
        loan._crisis_turns_left = 6;
      }
      if (typeof addEventLog === 'function') {
        addEventLog('📜 Долговой кризис! Кредиторы требуют немедленной выплаты.', 'danger');
      }
    },
    goalCheck: (n) => (n._bankruptcies ?? 0) === 0,
    goalText: 'Не объявить банкротство в течение 12 ходов',
    duration: 12,
  },
};

function processCrisisVeha() {
  const nid = GAME_STATE.player_nation;
  const n   = GAME_STATE.nations?.[nid];
  if (!n) return;

  // Не запускать если уже есть активный кризис
  if (GAME_STATE.active_crisis && !GAME_STATE.active_crisis.resolved) return;

  // Выбрать случайный кризис из подходящих
  const eligible = Object.entries(CRISIS_TYPES).filter(
    ([, def]) => def.trigger(n, GAME_STATE)
  );
  if (eligible.length === 0) return;

  const [type, def] = eligible[Math.floor(Math.random() * eligible.length)];

  GAME_STATE.active_crisis = {
    type,
    start_turn: GAME_STATE.turn ?? 0,
    resolved: false,
    success: null,
  };

  def.apply(n, GAME_STATE);
}

function _checkCrisisResolution(nationId) {
  const crisis = GAME_STATE.active_crisis;
  if (!crisis || crisis.resolved) return;

  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;

  const def = CRISIS_TYPES[crisis.type];
  if (!def) return;

  const turn = GAME_STATE.turn ?? 0;
  const elapsed = turn - crisis.start_turn;

  // Продолжаем применять эффекты чумы
  if (crisis.type === 'PLAGUE' && (n._crisis_plague_ticks ?? 0) > 0) {
    n.population.total = Math.floor((n.population.total ?? 0) * 0.94);
    n._crisis_plague_ticks--;
  }

  // Продолжаем голод
  if (crisis.type === 'FAMINE' && (n._crisis_famine_ticks ?? 0) > 0) {
    if (n.economy?.stockpile) n.economy.stockpile.wheat = 0;
    n._crisis_famine_ticks--;
    // Восстанавливаем зерно когда голод кончился
    if (n._crisis_famine_ticks === 0 && n.economy?.stockpile) {
      n.economy.stockpile.wheat = n._crisis_famine_wheat_saved ?? 1000;
    }
  }

  // Сбрасываем doubled payments долгового кризиса
  if (crisis.type === 'DEBT_CRISIS') {
    for (const loan of (GAME_STATE.loans ?? [])) {
      if (loan._crisis_doubled && (loan._crisis_turns_left ?? 0) > 0) {
        loan._crisis_turns_left--;
        if (loan._crisis_turns_left === 0) {
          loan.monthly_payment = Math.floor(loan.monthly_payment / 2);
          loan._crisis_doubled = false;
        }
      }
    }
  }

  if (elapsed < def.duration) return;

  // Проверить итог
  const success = def.goalCheck(n, GAME_STATE);
  crisis.resolved = true;
  crisis.success  = success;

  if (success) {
    n._crisis_survived = (n._crisis_survived ?? 0) + 1;
    if (typeof addEventLog === 'function') {
      addEventLog(`✅ Кризис «${def.label}» преодолён! Народ выстоял.`, 'good');
    }
    if (typeof addMemoryEvent === 'function') {
      addMemoryEvent(nationId, 'crisis', `Преодолён кризис: ${def.label}`);
    }
  } else {
    if (typeof addEventLog === 'function') {
      addEventLog(`⚠ Кризис «${def.label}» нанёс урон державе.`, 'warning');
    }
    if (typeof addMemoryEvent === 'function') {
      addMemoryEvent(nationId, 'crisis', `Не справились с кризисом: ${def.label}`);
    }
  }

  // Записать в chronicle_log
  if (GAME_STATE.chronicle_log != null) {
    GAME_STATE.chronicle_log.push({
      turn: GAME_STATE.turn ?? 0,
      text: `Кризис «${def.label}»: ${success ? 'преодолён' : 'нанёс урон'}.`,
    });
    if (GAME_STATE.chronicle_log.length > 50) GAME_STATE.chronicle_log.shift();
  }
}

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 10 — ЗАВЕЩАНИЕ НАСЛЕДНИКУ
// ══════════════════════════════════════════════════════════════════════

const TESTAMENT_GOALS_DEFS = [
  {
    id: 'treasury_20k',
    icon: '💰',
    text: 'Оставить казну > 20 000',
    check: (n, gs) => (n.economy?.treasury ?? 0) > 20000,
  },
  {
    id: 'army_5k',
    icon: '⚔️',
    text: 'Оставить армию > 5 000 солдат',
    check: (n, gs) => ((n.military?.infantry ?? 0) + (n.military?.cavalry ?? 0)) > 5000,
  },
  {
    id: 'no_loans',
    icon: '📜',
    text: 'Погасить все займы',
    check: (n, gs) => (gs.loans ?? []).filter(l => l.nation_id === gs.player_nation && l.status === 'active').length === 0,
  },
  {
    id: 'end_wars',
    icon: '🕊',
    text: 'Закончить все войны',
    check: (n, gs) => (n.military?.at_war_with?.length ?? 0) === 0,
  },
  {
    id: 'expand_regions',
    icon: '🌍',
    text: 'Расширить владения до 15 регионов',
    check: (n, gs) => (n.regions?.length ?? 0) >= 15,
  },
  {
    id: 'get_alliance',
    icon: '🤝',
    text: 'Заключить союз с соседом',
    check: (n, gs) => {
      const nid = gs.player_nation;
      return (gs.diplomacy?.treaties ?? []).some(
        t => t.status === 'active' &&
             (t.type === 'alliance' || t.type === 'defensive_alliance') &&
             t.parties.includes(nid)
      );
    },
  },
];

function _checkTestamentTrigger(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;
  const age = n.government?.ruler?.age ?? 0;
  if (age >= 60 && !n._testament_notified) {
    n._testament_notified = true;
    if (typeof addEventLog === 'function') {
      addEventLog('👴 Правитель достиг 60 лет. Откройте «Завещание» в управлении государством.', 'info');
    }
    _renderTestamentButton();
  }
}

function _renderTestamentButton() {
  if (typeof document === 'undefined') return;
  const govPanel = document.getElementById('gov-content');
  if (!govPanel) return;
  // Кнопка добавляется в panels.js при рендере
}

function showTestamentModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('testament-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  _renderTestamentContent();
}

function hideTestamentModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('testament-modal');
  if (modal) modal.style.display = 'none';
}

function _renderTestamentContent() {
  if (typeof document === 'undefined') return;
  const content = document.getElementById('testament-modal-content');
  if (!content) return;

  const nid = GAME_STATE.player_nation;
  const n   = GAME_STATE.nations?.[nid];
  if (!n) return;

  const gs = GAME_STATE;
  const chosen = GAME_STATE.testament?.goals ?? [];

  content.innerHTML = `
    <div class="testament-title">📜 Завещание наследнику</div>
    <div class="testament-subtitle">Выберите до 3 целей, которые хотите достичь до конца правления</div>
    <div class="testament-goals-list">
      ${TESTAMENT_GOALS_DEFS.map(def => {
        const isChosen = chosen.some(g => g.id === def.id);
        const isDone   = def.check(n, gs);
        const statusIcon = isDone ? '✅' : isChosen ? '⏳' : '';
        return `<div class="testament-goal ${isChosen ? 'testament-chosen' : ''}">
          ${statusIcon} ${def.icon} ${def.text}
          ${!isChosen && chosen.length < 3
            ? `<button class="testament-add-btn" onclick="addTestamentGoal('${def.id}')">+ Принять</button>`
            : isChosen
              ? `<button class="testament-remove-btn" onclick="removeTestamentGoal('${def.id}')">Отказаться</button>`
              : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function addTestamentGoal(id) {
  if (!GAME_STATE.testament) {
    GAME_STATE.testament = { goals: [], created_turn: GAME_STATE.turn ?? 0 };
  }
  if (GAME_STATE.testament.goals.length >= 3) return;
  const def = TESTAMENT_GOALS_DEFS.find(d => d.id === id);
  if (!def || GAME_STATE.testament.goals.some(g => g.id === id)) return;
  GAME_STATE.testament.goals.push({ id: def.id, text: def.text, icon: def.icon });
  _renderTestamentContent();
}

function removeTestamentGoal(id) {
  if (!GAME_STATE.testament) return;
  GAME_STATE.testament.goals = GAME_STATE.testament.goals.filter(g => g.id !== id);
  _renderTestamentContent();
}

function _checkTestamentOnDeath(nationId, legacyData) {
  if (!GAME_STATE.testament?.goals?.length) return null;
  const n  = GAME_STATE.nations?.[nationId];
  const gs = GAME_STATE;
  if (!n) return null;

  const results = GAME_STATE.testament.goals.map(g => {
    const def = TESTAMENT_GOALS_DEFS.find(d => d.id === g.id);
    const done = def ? def.check(n, gs) : false;
    return { text: g.text, icon: g.icon, done };
  });

  const fulfilled = results.filter(r => r.done).length;
  const total     = results.length;

  if (fulfilled === total && total > 0) {
    n._testament_completed = true;
    if (typeof addEventLog === 'function') {
      addEventLog('📜 Завещание выполнено полностью! Достижение «Верен слову» разблокировано!', 'achievement');
    }
  }

  if (typeof addMemoryEvent === 'function') {
    addMemoryEvent(nationId, 'politics',
      `Завещание: выполнено ${fulfilled}/${total} целей`);
  }

  return { fulfilled, total, goals: results };
}
