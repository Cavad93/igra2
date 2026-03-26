// Поле ввода команд игрока + обработка ответа AI

let inputHistory = [];
let historyIndex = -1;

function initInput() {
  const input  = document.getElementById('command-input');
  const sendBtn = document.getElementById('send-btn');

  if (!input || !sendBtn) return;

  // Отправка по Enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommand();
    }

    // История команд (стрелки вверх/вниз)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < inputHistory.length - 1) {
        historyIndex++;
        input.value = inputHistory[historyIndex] || '';
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = inputHistory[historyIndex] || '';
      } else {
        historyIndex = -1;
        input.value = '';
      }
    }
  });

  // Отправка по кнопке
  sendBtn.addEventListener('click', handleCommand);

  // Фокус при загрузке
  input.focus();
}

// ──────────────────────────────────────────────────────────────
// ОБРАБОТКА КОМАНДЫ
// ──────────────────────────────────────────────────────────────

async function handleCommand() {
  const input = document.getElementById('command-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Сохраняем в историю
  inputHistory.unshift(text);
  if (inputHistory.length > 50) inputHistory.length = 50;
  historyIndex = -1;

  input.value = '';
  input.disabled = true;

  // Показываем команду в логе
  addEventLog(`› ${text}`, 'info');

  // Показываем индикатор загрузки
  showAIThinking(true);

  try {
    // Проверяем ключ API (Groq для парсинга команд, Anthropic как запасной)
    if (!CONFIG.GROQ_API_KEY && !CONFIG.API_KEY) {
      showAPIKeyPrompt();
      return;
    }

    // Отправляем в Claude
    const response = await parsePlayerCommand(text);
    handleAIResponse(response, text);

  } catch (err) {
    console.error('Ошибка команды:', err);
    showAIResponse(`Ошибка: ${err.message}`, 'error');
    addEventLog(`Ошибка AI: ${err.message}`, 'warning');
  } finally {
    showAIThinking(false);
    input.disabled = false;
    input.focus();
  }
}

// ──────────────────────────────────────────────────────────────
// ОБРАБОТКА ОТВЕТА AI
// ──────────────────────────────────────────────────────────────

function handleAIResponse(parsed, originalText) {
  if (!parsed || typeof parsed !== 'object') {
    showAIResponse('Не удалось разобрать команду. Попробуйте переформулировать.', 'error');
    return;
  }

  // Показываем разобранное действие
  const actionType = parsed.action_type || 'unknown';
  const effects = parsed.estimated_effects || {};

  let responseHTML = `
    <div class="ai-response-action">
      <span class="action-type-badge ${actionType}">${getActionTypeName(actionType)}</span>
      <span class="action-desc">${originalText}</span>
    </div>
  `;

  // Описание последствий
  if (Object.keys(effects).length > 0) {
    responseHTML += `<div class="ai-effects"><strong>Ожидаемые последствия:</strong><ul>`;
    for (const [key, val] of Object.entries(effects)) {
      const sign = typeof val === 'number' && val > 0 ? '+' : '';
      const cls  = typeof val === 'number' ? (val >= 0 ? 'positive' : 'negative') : '';
      responseHTML += `<li class="${cls}">${formatEffectPath(key)}: <strong>${sign}${val}</strong></li>`;
    }
    responseHTML += `</ul></div>`;
  }

  // Требует ли голосования?
  if (parsed.requires_vote) {
    responseHTML += `<div class="vote-required">⚠️ Это действие требует голосования в совете</div>`;
  }

  // Радикальность
  if (parsed.radicalism_score !== undefined) {
    const rad = parsed.radicalism_score;
    const radColor = rad > 70 ? '#f44336' : rad > 40 ? '#FF9800' : '#4CAF50';
    responseHTML += `<div class="radicalism">Радикальность: <span style="color:${radColor}">${rad}/100</span></div>`;
  }

  // Применяем действие
  applyParsedAction(parsed);

  showAIResponse(responseHTML, 'success');
  addEventLog(`Действие: ${getActionTypeName(actionType)} — ${originalText.slice(0, 60)}`, 'info');
}

// ──────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ДЕЙСТВИЯ К GAMESTATE
// ──────────────────────────────────────────────────────────────

function applyParsedAction(parsed) {
  const nationId = GAME_STATE.player_nation;
  const action = parsed.parsed_action || {};

  switch (parsed.action_type) {
    case 'economy':
      applyEconomyAction(nationId, action);
      break;
    case 'military':
      applyMilitaryAction(nationId, action);
      break;
    case 'diplomacy':
      applyDiplomacyAction(nationId, action);
      break;
    case 'law':
      initiateLawProcess(nationId, action, parsed);
      break;
    case 'build':
      applyBuildAction(nationId, action);
      break;
    case 'character':
      applyCharacterAction(nationId, action);
      break;
    default:
      // Неизвестное действие — просто логируем
      console.info('Неизвестный тип действия:', parsed.action_type, action);
  }

  renderAll();
}

function applyEconomyAction(nationId, action) {
  const nation = GAME_STATE.nations[nationId];

  if (action.change_tax_rate !== undefined) {
    const newRate = Math.max(0, Math.min(0.5, action.change_tax_rate));
    applyDelta(`nations.${nationId}.economy.tax_rate`, newRate);
    addEventLog(`Налоговая ставка изменена на ${Math.round(newRate * 100)}%.`, 'economy');
  }

  if (action.buy_good && action.amount) {
    const cost = (GAME_STATE.market[action.buy_good]?.price || 10) * action.amount;
    if (nation.economy.treasury >= cost) {
      nation.economy.stockpile[action.buy_good] =
        (nation.economy.stockpile[action.buy_good] || 0) + action.amount;
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - cost);
      addEventLog(`Куплено ${action.amount} ед. ${action.buy_good} за ${Math.round(cost)} монет.`, 'economy');
    } else {
      addEventLog(`Недостаточно средств! Нужно ${Math.round(cost)}, есть ${Math.round(nation.economy.treasury)}.`, 'warning');
    }
  }
}

function applyMilitaryAction(nationId, action) {
  const nation  = GAME_STATE.nations[nationId];
  const military = nation.military;

  if (action.recruit_infantry && action.amount) {
    const cost = action.amount * 10;  // 10 монет за пехотинца
    if (nation.economy.treasury >= cost) {
      applyDelta(`nations.${nationId}.military.infantry`, military.infantry + action.amount);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - cost);
      addEventLog(`Набрано ${action.amount} пехотинцев. Стоимость: ${cost} монет.`, 'military');
    } else {
      addEventLog(`Не хватает денег на рекрутинг! Нужно ${cost} монет.`, 'warning');
    }
  }

  if (action.recruit_ships && action.amount) {
    const cost = action.amount * 800;
    if (nation.economy.treasury >= cost) {
      applyDelta(`nations.${nationId}.military.ships`, military.ships + action.amount);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - cost);
      addEventLog(`Построено ${action.amount} кораблей. Стоимость: ${cost} монет.`, 'military');
    } else {
      addEventLog(`Не хватает денег на строительство флота!`, 'warning');
    }
  }

  if (action.recruit_mercenaries && action.amount) {
    const cost = action.amount * 15;
    if (nation.economy.treasury >= cost) {
      applyDelta(`nations.${nationId}.military.mercenaries`, military.mercenaries + action.amount);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - cost);
      addEventLog(`Наняты ${action.amount} наёмников. Стоимость: ${cost} монет.`, 'military');
    }
  }
}

function applyDiplomacyAction(nationId, action) {
  if (!action.target_nation) return;

  const relation = GAME_STATE.nations[nationId]?.relations[action.target_nation];
  if (!relation) return;

  if (action.send_gift && action.gold_amount) {
    const nation = GAME_STATE.nations[nationId];
    if (nation.economy.treasury >= action.gold_amount) {
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - action.gold_amount);
      const bonus = Math.min(30, Math.floor(action.gold_amount / 100));
      relation.score = Math.min(100, relation.score + bonus);
      addEventLog(`Отправлен дар ${action.target_nation}: ${action.gold_amount} монет. Отношения +${bonus}.`, 'diplomacy');
    }
  }

  if (action.propose_trade) {
    relation.treaties = [...new Set([...relation.treaties, 'trade'])];
    addEventLog(`Предложен торговый договор с ${GAME_STATE.nations[action.target_nation]?.name}.`, 'diplomacy');
  }
}

function initiateLawProcess(nationId, action, parsed) {
  // Создаём черновик закона
  const lawDraft = {
    id: `LAW_${String(Date.now()).slice(-6)}`,
    name: action.name || 'Новый закон',
    text: action.text || '',
    type: action.law_type || 'general',
    proposed_turn: GAME_STATE.turn,
    effects_per_turn: action.effects || {},
    requires_vote: true,
    vote: null,
  };

  // Показываем диалог голосования
  showVotingModal(nationId, lawDraft);
}

function applyBuildAction(nationId, action) {
  if (!action.region || !action.building) return;

  const region = GAME_STATE.regions[action.region];
  if (!region || region.nation !== nationId) {
    addEventLog('Строить можно только на своей территории!', 'warning');
    return;
  }

  const buildCosts = {
    port:     2000,
    barracks: 1500,
    market:   1200,
    temple:   1800,
    walls:    3000,
    granary:  800,
  };

  const cost = buildCosts[action.building] || 1000;
  const nation = GAME_STATE.nations[nationId];

  if (nation.economy.treasury < cost) {
    addEventLog(`Не хватает денег на строительство! Нужно ${cost} монет.`, 'warning');
    return;
  }

  region.buildings = region.buildings || [];
  region.buildings.push(action.building);
  applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - cost);
  addEventLog(`Построено: ${action.building} в регионе ${MAP_REGIONS[action.region]?.name || action.region}. Стоимость: ${cost} монет.`, 'info');
}

function applyCharacterAction(nationId, action) {
  // Действия с персонажами (назначения, ссылки, подарки)
  const nation = GAME_STATE.nations[nationId];
  const char = (nation.characters || []).find(c => c.id === action.target_character);
  if (!char) return;

  if (action.give_gift && action.gold_amount) {
    if (nation.economy.treasury >= action.gold_amount) {
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - action.gold_amount);
      char.traits.loyalty = Math.min(100, char.traits.loyalty + Math.floor(action.gold_amount / 200));
      char.resources.gold += action.gold_amount;
      addEventLog(`${char.name} получил дар ${action.gold_amount} монет. Лояльность выросла.`, 'character');
    }
  }

  if (action.exile) {
    char.alive = false;
    addEventLog(`${char.name} отправлен в изгнание!`, 'character');
    renderRightPanel();
  }
}

// ──────────────────────────────────────────────────────────────
// ГОЛОСОВАНИЕ (упрощённое)
// ──────────────────────────────────────────────────────────────

function showVotingModal(nationId, law) {
  const overlay = document.getElementById('voting-overlay');
  if (!overlay) return;

  const nation = GAME_STATE.nations[nationId];
  const mgr    = getSenateManager(nationId);

  let votesFor, votesAgainst, votesAbstain, passed, vetoed = false, tribuneName = null;
  let speeches = [];
  let senateMode = false;

  // ── Если у нации есть Сенат — используем SenateManager.process_vote() ──
  if (mgr && nation.senate_config) {
    senateMode = true;
    const result = mgr.process_vote({
      threshold:  law.threshold ?? 51,
      law_type:   law.type ?? 'reform',
      law_tags:   law.tags ?? [],
    });

    votesFor      = Math.round(result.for);
    votesAgainst  = Math.round(result.against);
    votesAbstain  = Math.round(result.abstain);
    passed        = result.passed;
    vetoed        = result.vetoed ?? false;
    tribuneName   = result.tribune_name ?? null;

    // Спикеры — материализованные сенаторы
    speeches = (result.top_speakers ?? []).map(s => ({
      name:     s.name,
      portrait: s.portrait ?? '👤',
      vote:     s.loyalty_score > 55 ? 'for' : 'against',
    }));

    // Обновляем настроение Сената после голосования
    mgr._recalculateSenateState();

  } else {
    // ── Старая логика через nation.characters ──────────────────────
    const characters = (nation.characters || []).filter(c => c.alive);
    let charFor = 0, charAgainst = 0, charAbstain = 0;
    for (const char of characters) {
      const vote = calculateCharacterVote(char, law);
      if (vote === 'for' || vote === 'strongly_for') charFor++;
      else if (vote === 'against' || vote === 'strongly_against') charAgainst++;
      else charAbstain++;
      if (char.traits.ambition > 60 || char.traits.loyalty > 70) {
        speeches.push({ name: char.name, portrait: char.portrait, vote });
      }
    }
    const total = characters.length || 1;
    votesFor     = charFor;
    votesAgainst = charAgainst;
    votesAbstain = charAbstain;
    passed       = charFor / total > 0.5;
  }

  const vetoNote = vetoed
    ? `<div class="vote-veto">⚖️ Вето Трибуна (${tribuneName}): закон заблокирован!</div>`
    : '';
  const senateNote = senateMode
    ? `<div class="vote-senate-note">🏛️ Голосует Сенат (${votesFor + votesAgainst + votesAbstain} голосов)</div>`
    : '';

  overlay.innerHTML = `
    <div class="voting-modal">
      <div class="voting-title">⚖️ Голосование: ${law.name}</div>
      <div class="voting-text">${law.text || ''}</div>
      ${senateNote}

      <div class="vote-counts">
        <span class="vote-for">✅ За: ${Math.round(votesFor)}</span>
        <span class="vote-against">❌ Против: ${Math.round(votesAgainst)}</span>
        <span class="vote-abstain">🔲 Воздержались: ${Math.round(votesAbstain)}</span>
      </div>

      ${speeches.slice(0, 3).map(s => `
        <div class="vote-speech">
          <span>${s.portrait}</span>
          <span>${s.name}: <em>${getVoteText(s.vote)}</em></span>
        </div>
      `).join('')}

      ${vetoNote}

      <div class="vote-result ${passed ? 'passed' : 'failed'}">
        ${passed ? '✅ ЗАКОН ПРИНЯТ' : '❌ ЗАКОН ОТКЛОНЁН'}
      </div>

      <div class="voting-btns">
        <button onclick="finalizeVote('${nationId}', ${JSON.stringify(law).replace(/"/g, '&quot;')}, ${Math.round(votesFor)}, ${Math.round(votesAgainst)}, ${Math.round(votesAbstain)}, ${passed})">
          Принять результат
        </button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
}

function calculateCharacterVote(char, law) {
  // Детерминированная логика голосования
  const loyalty = char.traits.loyalty;
  const ambition = char.traits.ambition;
  const caution = char.traits.caution;

  // Базовый шанс поддержки — лояльность + случайность
  const baseSupport = loyalty + (Math.random() * 40 - 20);

  if (law.type === 'military' && ambition > 60) return 'strongly_for';
  if (law.type === 'military' && caution > 70) return 'against';
  if (baseSupport > 70) return 'for';
  if (baseSupport > 50) return 'neutral';
  return 'against';
}

function getVoteText(vote) {
  const texts = {
    strongly_for:     'Горячо поддерживаю!',
    for:              'Поддерживаю.',
    neutral:          'Воздерживаюсь.',
    against:          'Против.',
    strongly_against: 'Категорически против!',
  };
  return texts[vote] || 'Воздерживаюсь.';
}

function finalizeVote(nationId, law, votesFor, votesAgainst, votesAbstain, passed) {
  const overlay = document.getElementById('voting-overlay');
  if (overlay) overlay.style.display = 'none';

  if (passed) {
    law.vote = { for: votesFor, against: votesAgainst, abstain: votesAbstain };
    law.enacted_turn = GAME_STATE.turn;
    GAME_STATE.nations[nationId].active_laws.push(law);
    addEventLog(`Закон "${law.name}" принят! За: ${votesFor}, Против: ${votesAgainst}.`, 'law');
  } else {
    addEventLog(`Закон "${law.name}" отклонён. За: ${votesFor}, Против: ${votesAgainst}.`, 'law');
  }

  renderAll();
}

// ══════════════════════════════════════════════════════════════
// ДЕБАТЫ В СЕНАТЕ — анимированное голосование с речами
// ══════════════════════════════════════════════════════════════

// Фракционные реплики: [faction_id][for|against]
const _FACTION_SPEECHES = {
  aristocrats: {
    for: [
      'Этот закон укрепит устои, что держат Сиракузы тысячелетиями.',
      'Благородные дома города поддерживают это мудрое решение.',
      'Традиция и порядок — вот что стоит за моим голосом «за».',
      'Патриции Сиракуз одобряют. Пусть закон будет принят.',
    ],
    against: [
      'Это посягательство на права нашего сословия. Я против!',
      'Подобный закон разрушит устои, выкованные предками.',
      'Нет. Это противно природе порядка и древним привилегиям.',
      'Благородные дома не допустят такого решения.',
    ],
  },
  demos: {
    for: [
      'Народ Сиракуз давно ждёт этого. Голосую «за»!',
      'Наконец-то слово сказано в пользу простых граждан.',
      'Плебс поддержит такой закон. И я — вместе с ним.',
      'Этот закон — голос улицы, агоры, гавани. Поддерживаю.',
    ],
    against: [
      'Где здесь забота о народе? Я голосую «против».',
      'Богатые снова тянут одеяло на себя. Это несправедливо!',
      'Граждане будут недовольны. Я выражаю их волю — против.',
      'Этот закон не для народа. Нет.',
    ],
  },
  military: {
    for: [
      'Армия нуждается в твёрдом решении. Поддерживаю.',
      'Ветераны Сиракуз ждут действий. Голосую «за».',
      'Во имя славы города и его легионов — поддерживаю.',
      'Сила — единственный язык, который уважают враги. За!',
    ],
    against: [
      'Армия видит в этом слабость. Я голосую «против».',
      'Пока враги точат мечи, мы тратим время на это? Против!',
      'Военные нужды города важнее. Не поддерживаю.',
      'Это решение подорвёт боеспособность. Категорически против.',
    ],
  },
  merchants: {
    for: [
      'Торговый квартал одобряет. Это выгодно для гавани.',
      'Рынки оживятся. Моё слово — «за».',
      'Купцы Сиракуз поддержат любой закон, открывающий возможности.',
      'Выгода говорит «за». И я — вместе с ней.',
    ],
    against: [
      'Это ударит по торговле. Рынки пострадают. Против.',
      'Купцы потеряют. Я голосую «против» от имени гавани.',
      'Нет смысла в законе, который закрывает, а не открывает.',
      'Прибыль — это кровь города. Этот закон её остановит.',
    ],
  },
};

// Базовые реплики для неизвестных фракций
const _GENERIC_SPEECHES = {
  for:     ['Поддерживаю это решение.', 'Голосую «за».', 'Считаю это верным шагом.'],
  against: ['Возражаю.', 'Голосую «против».', 'Это ошибочный путь.'],
};

function _pickSpeech(factionId, side) {
  const pool = (_FACTION_SPEECHES[factionId] ?? _GENERIC_SPEECHES)[side] ?? _GENERIC_SPEECHES[side];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Анализирует речь игрока и возвращает {speech_bonus, resonance[]}
function _calcArgumentBonus(speech, factions) {
  if (!speech || !speech.trim()) return { speech_bonus: {}, resonance: [] };

  const lower = speech.toLowerCase();
  const bonus  = {};
  const resonance = [];

  const KEYWORDS = {
    aristocrats: ['аристократ', 'благородн', 'патриций', 'традиц', 'клан', 'знать', 'порядок', 'устои'],
    demos:       ['народ', 'плебс', 'гражданин', 'улиц', 'бедн', 'справедлив', 'свобод', 'права'],
    military:    ['армия', 'войск', 'легион', 'война', 'враг', 'победа', 'ветеран', 'оружие', 'защит'],
    merchants:   ['торгов', 'купец', 'рынок', 'гавань', 'порт', 'прибыль', 'товар', 'флот', 'деньг'],
  };

  for (const faction of factions ?? []) {
    const keys = KEYWORDS[faction.id] ?? [];
    const hits  = keys.filter(k => lower.includes(k)).length;
    if (hits > 0) {
      const bp = Math.min(hits * 4, 14); // до +14pp за фракцию
      bonus[faction.id] = bp;
      resonance.push({ id: faction.id, name: faction.name, bonus: bp });
    }
  }

  return { speech_bonus: bonus, resonance };
}

// Задержка-промис
function _wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Добавляет фазовый заголовок в stage
function _debateAddPhase(stage, text) {
  const el = document.createElement('div');
  el.className = 'debate-phase-label';
  el.textContent = text;
  stage.appendChild(el);
}

// Добавляет заметку (резонанс речи) в stage
function _debateAddNote(stage, text) {
  const el = document.createElement('div');
  el.className = 'debate-resonance-note';
  el.textContent = text;
  stage.appendChild(el);
  stage.scrollTop = stage.scrollHeight;
}

// Добавляет реплику сенатора / игрока
function _debateAddSpeech(stage, { portrait, name, factionLabel, text, side }) {
  const el = document.createElement('div');
  el.className = `debate-speech-entry debate-speech-${side}`;
  el.innerHTML = `
    <span class="debate-portrait">${portrait}</span>
    <div class="debate-speech-body">
      <div class="debate-speech-name">${name}${factionLabel ? ` <span class="debate-speech-faction">${factionLabel}</span>` : ''}</div>
      <div class="debate-speech-text">${text}</div>
    </div>
    ${side === 'for' ? '<span class="debate-vote-badge dv-for">ЗА</span>'
    : side === 'against' ? '<span class="debate-vote-badge dv-against">ПРОТИВ</span>'
    : ''}
  `;
  stage.appendChild(el);
  stage.scrollTop = stage.scrollHeight;
}

// Анимирует счётчики голосов
async function _animateVoteCount(targetFor, targetAgainst, targetAbstain, durationMs) {
  const steps = 40;
  const interval = durationMs / steps;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const elF = document.getElementById('dvc-for');
    const elA = document.getElementById('dvc-against');
    const elN = document.getElementById('dvc-abstain');
    if (elF) elF.textContent = Math.round(targetFor     * ease);
    if (elA) elA.textContent = Math.round(targetAgainst * ease);
    if (elN) elN.textContent = Math.round(targetAbstain * ease);
    await _wait(interval);
  }
}

// Определяет метку фракции для сенатора
function _factionLabel(factionId) {
  const labels = {
    aristocrats: 'Аристократы', demos: 'Народная партия',
    military: 'Военная фракция', merchants: 'Торговцы',
  };
  return labels[factionId] ?? factionId;
}

// Главная точка входа — вызывается из submitSenateLaw
async function startSenateDebate(nationId, law, playerSpeech) {
  const nation = GAME_STATE.nations[nationId];
  const mgr    = getSenateManager(nationId);

  if (!mgr || !nation?.senate_config) {
    // Нет Сената — старый модал
    showVotingModal(nationId, law);
    return;
  }

  // Анализ речи игрока → бонус фракциям
  const { speech_bonus, resonance } = _calcArgumentBonus(
    playerSpeech,
    nation.senate_config.factions ?? []
  );

  // Запускаем голосование с учётом речи
  const result = mgr.process_vote({
    threshold:   law.threshold ?? 51,
    law_type:    law.type ?? 'reform',
    law_tags:    law.tags ?? [],
    speech_bonus,
  });
  mgr._recalculateSenateState();

  // Материализованные сенаторы для дебатов (до 6)
  const speakers = mgr.getMaterialized().slice(0, 6);

  // Показываем дебатный зал
  _showSenateDebateUI(nationId, law, playerSpeech, result, speakers, resonance);
}

function _showSenateDebateUI(nationId, law, playerSpeech, result, speakers, resonance) {
  let overlay = document.getElementById('senate-debate-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'senate-debate-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);display:flex;align-items:center;justify-content:center;z-index:3000;';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="senate-debate-chamber">
      <div class="debate-chamber-title">🏛️ Зал Сената — Голосование</div>
      <div class="debate-law-header">
        <div class="debate-law-name">"${law.name}"</div>
        ${law.text ? `<div class="debate-law-text">${law.text}</div>` : ''}
      </div>
      <div id="debate-stage" class="debate-stage"></div>
    </div>
  `;
  overlay.style.display = 'flex';

  // Запускаем анимацию асинхронно
  _runDebateAnimation(nationId, law, playerSpeech, result, speakers, resonance);
}

async function _runDebateAnimation(nationId, law, playerSpeech, result, speakers, resonance) {
  const stage = document.getElementById('debate-stage');
  if (!stage) return;

  // — Фаза 0: Объявление + запрос к AI (параллельно) —
  _debateAddPhase(stage, '⚖️ Консул берёт слово...');
  await _wait(600);

  // Запускаем AI-запрос в фоне пока показываем речь игрока
  const mgr = getSenateManager(nationId);
  const senateCtx = mgr ? {
    global_mood:   mgr.getGlobalSentiment?.() ?? null,
    faction_stats: mgr.getFactionStats?.() ?? null,
  } : null;
  const aiDebatePromise = (typeof generateSenateDebateViaLLM === 'function')
    ? generateSenateDebateViaLLM(law, speakers, playerSpeech, senateCtx)
    : Promise.resolve(null);

  // — Фаза 1: Речь игрока —
  if (playerSpeech && playerSpeech.trim()) {
    _debateAddSpeech(stage, {
      portrait: '👑', name: 'Консул (вы)', factionLabel: '', text: playerSpeech, side: 'player',
    });
    await _wait(900);
    for (const r of resonance) {
      await _wait(320);
      _debateAddNote(stage, `💬 Фракция «${r.name}» услышала ваши слова (+${r.bonus}% поддержки)`);
    }
    if (resonance.length) await _wait(600);
  } else {
    _debateAddSpeech(stage, {
      portrait: '👑', name: 'Консул', factionLabel: '',
      text: `Выношу на голосование: «${law.name}». Прошу сенаторов высказаться.`,
      side: 'player',
    });
    await _wait(600);
  }

  // — Ожидаем AI (показываем спиннер если долго) —
  let aiData = null;
  if (speakers.length > 0) {
    _debateAddPhase(stage, '🤔 Сенаторы изучают закон...');
    aiData = await aiDebatePromise;
  }

  // — Фаза 2: Речи сенаторов —
  if (speakers.length > 0) {
    // Если AI вернул opening_cry — показываем реакцию зала
    if (aiData?.opening_cry) {
      _debateAddNote(stage, `📣 ${aiData.opening_cry}`);
      await _wait(600);
    }

    // Если закон радикальный — предупреждение
    const radicalism = aiData?.radicalism ?? 0;
    if (radicalism >= 2) {
      const radLabel = radicalism === 3
        ? '🚨 Закон вызвал скандал в зале!'
        : '⚠️ Закон встречает серьёзное сопротивление';
      _debateAddPhase(stage, radLabel);
      await _wait(700);
    } else {
      _debateAddPhase(stage, '🗣️ Сенаторы высказываются...');
    }
    await _wait(400);

    // Речи: приоритет AI, fallback — шаблоны
    const aiLines = aiData?.speaker_lines ?? [];
    for (const senator of speakers) {
      const aiLine = aiLines.find(l => l.name === senator.name);
      const vote    = aiLine?.vote ?? (senator.loyalty_score > 52 ? 'for' : 'against');
      const speech  = aiLine?.speech ?? _pickSpeech(senator.faction_id, vote);
      const intense = aiLine?.intensity ?? 'mild';

      _debateAddSpeech(stage, {
        portrait:     senator.portrait ?? '👤',
        name:         senator.name,
        factionLabel: _factionLabel(senator.faction_id),
        text:         speech,
        side:         vote,
        intense,
      });
      // Яростные речи — чуть дольше пауза
      await _wait(600 + (intense === 'fierce' ? 400 : intense === 'strong' ? 200 : 0) + Math.random() * 250);
    }

    // Dramatic event — скандал, выход из зала, угроза вето
    if (aiData?.dramatic_event) {
      await _wait(400);
      const evtClass = aiData.dramatic_event.type === 'walkout' ? 'dbe-walkout'
                     : aiData.dramatic_event.type === 'veto_threat' ? 'dbe-veto'
                     : 'dbe-scandal';
      const evtEl = document.createElement('div');
      evtEl.className = `debate-dramatic-event ${evtClass}`;
      evtEl.innerHTML = `
        <span class="dde-icon">${aiData.dramatic_event.type === 'walkout' ? '🚶' : aiData.dramatic_event.type === 'veto_threat' ? '✋' : '💥'}</span>
        <span>${aiData.dramatic_event.text}</span>
      `;
      stage.appendChild(evtEl);
      stage.scrollTop = stage.scrollHeight;
      await _wait(900);
    }

    await _wait(400);
  } else {
    _debateAddPhase(stage, '🌑 Анонимные сенаторы молча занимают места...');
    await _wait(700);
  }

  // — Фаза 3: Голосование —
  _debateAddPhase(stage, '🗳️ Голоса подсчитываются...');
  await _wait(400);

  const vcDiv = document.createElement('div');
  vcDiv.className = 'debate-vote-counters';
  vcDiv.innerHTML = `
    <div class="dvc-item dvc-item-for">✅ За<br><b id="dvc-for">0</b></div>
    <div class="dvc-item dvc-item-against">❌ Против<br><b id="dvc-against">0</b></div>
    <div class="dvc-item dvc-item-abstain">⬜ Возд.<br><b id="dvc-abstain">0</b></div>
  `;
  stage.appendChild(vcDiv);
  stage.scrollTop = stage.scrollHeight;

  await _animateVoteCount(Math.round(result.for), Math.round(result.against), Math.round(result.abstain), 2200);
  await _wait(600);

  // Коалиции
  if (result.coalitions?.length) {
    for (const [f1, f2, dir] of result.coalitions) {
      _debateAddNote(stage, `🤝 Коалиция: «${_factionLabel(f1)}» и «${_factionLabel(f2)}» голосуют вместе (${dir > 0 ? 'за' : 'против'})`);
      await _wait(280);
    }
    await _wait(400);
  }

  // — Фаза 4: Вердикт —
  const passed = result.passed && !result.vetoed;
  const verdictEl = document.createElement('div');
  verdictEl.className = `debate-verdict ${passed ? 'debate-verdict-pass' : 'debate-verdict-fail'}`;
  verdictEl.innerHTML = passed
    ? '✅ ЗАКОН ПРИНЯТ'
    : (result.vetoed
        ? `⚖️ ЗАКОН ЗАБЛОКИРОВАН ВЕТО<br><span style="font-size:13px;font-weight:normal;">Трибун ${result.tribune_name ?? ''} поднял жезл</span>`
        : '❌ ЗАКОН ОТКЛОНЁН');
  stage.appendChild(verdictEl);
  stage.scrollTop = stage.scrollHeight;

  await _wait(600);

  // Кнопка подтверждения
  const btnEl = document.createElement('div');
  btnEl.style.textAlign = 'center';
  btnEl.style.marginTop = '16px';
  const lawJson = encodeURIComponent(JSON.stringify(law));
  btnEl.innerHTML = `
    <button class="debate-accept-btn"
            onclick="finalizeDebateVote('${nationId}', '${lawJson}', ${Math.round(result.for)}, ${Math.round(result.against)}, ${Math.round(result.abstain)}, ${result.passed})">
      Покинуть зал Сената
    </button>
  `;
  stage.appendChild(btnEl);
  stage.scrollTop = stage.scrollHeight;
}

function finalizeDebateVote(nationId, lawJson, votesFor, votesAgainst, votesAbstain, passed) {
  const overlay = document.getElementById('senate-debate-overlay');
  if (overlay) overlay.style.display = 'none';

  let law;
  try { law = JSON.parse(decodeURIComponent(lawJson)); } catch { law = {}; }

  if (passed) {
    law.vote = { for: votesFor, against: votesAgainst, abstain: votesAbstain };
    law.enacted_turn = GAME_STATE.turn;
    GAME_STATE.nations[nationId].active_laws ??= [];
    GAME_STATE.nations[nationId].active_laws.push(law);
    addEventLog(`Закон "${law.name}" принят Сенатом! За: ${votesFor}, Против: ${votesAgainst}.`, 'law');

    // Конституционная поправка — применяем напрямую, без AI-анализа
    if (law.constitution_change) {
      const { field, new_value } = law.constitution_change;
      const arch = GAME_STATE.nations[nationId]?.senate_config?.state_architecture;
      if (arch && field in arch) {
        arch[field] = new_value;
        addEventLog(`📜 Конституция изменена: ${law.constitution_change.label}.`, 'law');
      }
    } else {
      // AI агент анализирует обычный закон и применяет изменения к игровой механике
      _applyLawChangesAsync(law, nationId);
    }
  } else {
    addEventLog(`Закон "${law.name}" отклонён Сенатом. За: ${votesFor}, Против: ${votesAgainst}.`, 'law');
  }

  // Синхронизируем faction seats обратно в senate_config (могли измениться через AI-изменения)
  if (typeof syncSenateConfigFromManager === 'function') syncSenateConfigFromManager(nationId);

  renderAll();
}

// Fire-and-forget: запрашивает AI анализ и применяет изменения
async function _applyLawChangesAsync(law, nationId) {
  if (typeof analyzeLawEffectsViaLLM !== 'function') return;
  try {
    const analysis = await analyzeLawEffectsViaLLM(law, nationId);
    if (!analysis || !analysis.changes?.length) return;

    const applied = (typeof applyLawGameChanges === 'function')
      ? applyLawGameChanges(analysis.changes, nationId)
      : [];

    if (applied.length > 0) {
      // Показываем что изменилось
      const lines = applied.map(ch => _formatLawChange(ch));
      addEventLog(
        `⚙️ ${analysis.narrative || `Закон «${law.name}» изменил механику:`} ${lines.join(' | ')}`,
        'law'
      );
      renderAll();
    }
  } catch (err) {
    console.warn('_applyLawChangesAsync:', err.message);
  }
}

// Форматирует одно изменение для лога
function _formatLawChange(ch) {
  const label = {
    'senate_config.state_architecture.senate_capacity': 'мест в Сенате',
    'senate_config.state_architecture.consul_term':     'срок Консула (лет)',
    'senate_config.state_architecture.consul_powers':   'полномочия Консула',
    'senate_config.state_architecture.voting_system':   'система голосования',
    'senate_config.state_architecture.veto_rights':     'право вето',
    'senate_config.state_architecture.election_cycle':  'цикл выборов (лет)',
    'economy.tax_rate':   'налог',
    'economy.treasury':   'казна',
    'military.infantry':  'пехота',
    'population.happiness': 'счастье',
    'government.legitimacy': 'легитимность',
  }[ch.path] ?? ch.path.split('.').pop();

  if (ch.delta !== undefined) {
    return `${label}: ${ch.delta > 0 ? '+' : ''}${ch.delta} (→${ch.next})`;
  }
  return `${label}: ${ch.prev} → ${ch.next}`;
}

// ──────────────────────────────────────────────────────────────
// UI УТИЛИТЫ
// ──────────────────────────────────────────────────────────────

function showAIThinking(active) {
  const responseDiv = document.getElementById('ai-response');
  const sendBtn = document.getElementById('send-btn');

  if (active) {
    if (responseDiv) {
      responseDiv.innerHTML = '<div class="ai-thinking">🤔 Советники думают...</div>';
      responseDiv.classList.remove('hidden');
    }
    if (sendBtn) sendBtn.disabled = true;
  } else {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function showAIResponse(html, type = 'info') {
  const responseDiv = document.getElementById('ai-response');
  if (!responseDiv) return;

  responseDiv.innerHTML = `<div class="ai-response-content ${type}">${html}</div>`;
  responseDiv.classList.remove('hidden');

  // Автоскрытие через 15 секунд
  clearTimeout(responseDiv._hideTimeout);
  responseDiv._hideTimeout = setTimeout(() => {
    responseDiv.classList.add('hidden');
  }, 15000);
}

function showAPIKeyPrompt() {
  showAIThinking(false);
  // Открываем стартовый модал с зашифрованным хранилищем
  if (typeof showAPIKeyModal === 'function') showAPIKeyModal(null);
}

// Оставлено для обратной совместимости — реальное сохранение через apikey.js
function saveAPIKey() {
  if (typeof submitAPIKey === 'function') submitAPIKey();
}

// Оставлено для обратной совместимости — реальная загрузка через initAPIKey() в index.html
function loadSavedAPIKey() {
  // Ничего не делает — загрузка теперь асинхронная через initAPIKey()
}

function getActionTypeName(type) {
  const names = {
    law:        '📜 Закон',
    military:   '⚔️ Армия',
    diplomacy:  '🤝 Дипломатия',
    economy:    '💰 Экономика',
    character:  '👤 Персонаж',
    build:      '🏛 Строительство',
  };
  return names[type] || type;
}

function formatEffectPath(path) {
  const parts = path.split('.');
  const last = parts[parts.length - 1];
  const labels = {
    treasury:    'Казна',
    happiness:   'Счастье',
    legitimacy:  'Легитимность',
    infantry:    'Пехота',
    cavalry:     'Кавалерия',
    ships:       'Корабли',
    morale:      'Боевой дух',
    loyalty:     'Лояльность армии',
    total:       'Население',
    tax_rate:    'Налоговая ставка',
  };
  return labels[last] || last.replace(/_/g, ' ');
}
