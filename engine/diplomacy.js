// ═══════════════════════════════════════════════════════════════════════════
// ДВИЖОК ДИПЛОМАТИИ
//
// Структура данных в GAME_STATE:
//   GAME_STATE.diplomacy = {
//     relations:  { "A_B": { score, war, truces[] } }  — отношения между нациями
//     treaties:   [ Treaty ]                            — все договоры
//     dialogues:  { "A_B": [ {role, text, turn} ] }    — история диалогов
//   }
//
// Treaty = {
//   id, type, status, parties[2], turn_signed, duration,
//   conditions: {},   dialogue_log: [],   effects: {}
// }
// ═══════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// ТИПЫ ДОГОВОРОВ
// ──────────────────────────────────────────────────────────────

const TREATY_TYPES = {
  trade_agreement: {
    label:       'Торговый договор',
    icon:        '💼',
    description: 'Снижение пошлин и взаимный доступ к рынкам.',
    effects: { trade_bonus: 0.15, market_access: true },
    default_duration: 10,
    ai_weight: 1.2,   // насколько AI склонен принять (multiplier от отношений)
  },
  non_aggression: {
    label:       'Пакт о ненападении',
    icon:        '🕊',
    description: 'Обе стороны обязуются не нападать N ходов.',
    effects: { forbid_attack: true },
    default_duration: 15,
    ai_weight: 1.1,
  },
  defensive_alliance: {
    label:       'Оборонный союз',
    icon:        '🛡',
    description: 'Автоматическое вступление в войну при нападении на союзника.',
    effects: { auto_defend: true, military_access: true },
    default_duration: 20,
    ai_weight: 0.8,
  },
  military_alliance: {
    label:       'Военный союз',
    icon:        '⚔',
    description: 'Полное военное сотрудничество, совместные кампании.',
    effects: { auto_defend: true, joint_attack: true, military_access: true, trade_bonus: 0.10 },
    default_duration: 20,
    ai_weight: 0.6,
  },
  marriage_alliance: {
    label:       'Брачный союз',
    icon:        '💍',
    description: 'Династические связи. +легитимность, снижение напряжённости.',
    effects: { legitimacy_bonus: 5, relation_bonus: 15 },
    default_duration: null,  // бессрочный
    ai_weight: 0.9,
  },
  vassalage: {
    label:       'Вассалитет',
    icon:        '🏳',
    description: 'Вассальное государство платит дань и получает военную защиту.',
    effects: { tribute_pct: 0.10, protectorate: true, forbid_attack: true },
    default_duration: null,
    ai_weight: 0.3,  // AI редко принимает — только при слабости
  },
  peace_treaty: {
    label:       'Мирный договор',
    icon:        '📜',
    description: 'Прекращение войны. Условия согласовываются в диалоге.',
    effects: { end_war: true },
    default_duration: null,
    ai_weight: 0.7,
  },
  military_access: {
    label:       'Военный проход',
    icon:        '🚶',
    description: 'Право прохода армий через территорию другой страны.',
    effects: { military_access: true },
    default_duration: 8,
    ai_weight: 0.85,
  },
  war_reparations: {
    label:       'Выплата контрибуции',
    icon:        '💰',
    description: 'Проигравший выплачивает единовременно или по ходам.',
    effects: { reparations: true },
    default_duration: 5,
    ai_weight: 0.5,
  },
  territorial_exchange: {
    label:       'Обмен территориями',
    icon:        '🗺',
    description: 'Передача конкретных регионов. Условия в диалоге.',
    effects: { transfer_regions: true },
    default_duration: null,
    ai_weight: 0.4,
  },
  joint_campaign: {
    label:       'Совместный поход',
    icon:        '⚡',
    description: 'Объединённые армии против общего врага. Добыча делится.',
    effects: { joint_attack: true, shared_loot: 0.5 },
    default_duration: 6,
    ai_weight: 0.7,
  },
  cultural_exchange: {
    label:       'Культурный обмен',
    icon:        '🎭',
    description: '+стабильность, +науки. Снижение культурной напряжённости.',
    effects: { stability_bonus: 3, tech_bonus: 0.05 },
    default_duration: 12,
    ai_weight: 1.0,
  },
  custom: {
    label:       'Свободная форма',
    icon:        '✍',
    description: 'Игрок формулирует условия самостоятельно в тексте.',
    effects: {},
    default_duration: null,
    ai_weight: 0.8,
  },
};

// ──────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ
// ──────────────────────────────────────────────────────────────

function initDiplomacy() {
  if (!GAME_STATE.diplomacy) {
    GAME_STATE.diplomacy = {
      relations: {},
      treaties:  [],
      dialogues: {},
    };
  }
  // Инициализация отношений для всех пар наций
  const nids = Object.keys(GAME_STATE.nations || {});
  for (let i = 0; i < nids.length; i++) {
    for (let j = i + 1; j < nids.length; j++) {
      const key = _relKey(nids[i], nids[j]);
      if (!GAME_STATE.diplomacy.relations[key]) {
        GAME_STATE.diplomacy.relations[key] = {
          score: 0,         // -100 враждебно … +100 дружественно
          war: false,
          truces: [],       // [{until_turn}]
          last_interaction: null,
        };
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ГЕТТЕРЫ ОТНОШЕНИЙ
// ──────────────────────────────────────────────────────────────

function _relKey(a, b) {
  return [a, b].sort().join('_');
}

function getRelation(nationA, nationB) {
  if (!GAME_STATE.diplomacy) initDiplomacy();
  const key = _relKey(nationA, nationB);
  if (!GAME_STATE.diplomacy.relations[key]) {
    GAME_STATE.diplomacy.relations[key] = { score: 0, war: false, truces: [], last_interaction: null };
  }
  return GAME_STATE.diplomacy.relations[key];
}

function getRelationScore(nationA, nationB) {
  return getRelation(nationA, nationB).score;
}

// Текстовый уровень отношений
function getRelationLabel(score) {
  if (score >=  60) return { label: 'Союзник',      color: '#4caf50', icon: '💚' };
  if (score >=  30) return { label: 'Дружественный', color: '#8bc34a', icon: '🟢' };
  if (score >=   5) return { label: 'Нейтральный',   color: '#9e9e9e', icon: '⚪' };
  if (score >= -20) return { label: 'Напряжённый',   color: '#ff9800', icon: '🟡' };
  if (score >= -50) return { label: 'Враждебный',    color: '#f44336', icon: '🔴' };
  return               { label: 'Война',            color: '#b71c1c', icon: '⚔' };
}

function isAtWar(nationA, nationB) {
  return getRelation(nationA, nationB).war;
}

// ──────────────────────────────────────────────────────────────
// АКТИВНЫЕ ДОГОВОРЫ
// ──────────────────────────────────────────────────────────────

function getActiveTreaties(nationA, nationB) {
  if (!GAME_STATE.diplomacy) return [];
  return GAME_STATE.diplomacy.treaties.filter(t =>
    t.status === 'active' &&
    t.parties.includes(nationA) &&
    t.parties.includes(nationB)
  );
}

function getAllTreaties(nationId) {
  if (!GAME_STATE.diplomacy) return [];
  return GAME_STATE.diplomacy.treaties.filter(t => t.parties.includes(nationId));
}

// ──────────────────────────────────────────────────────────────
// СОЗДАНИЕ / СОХРАНЕНИЕ ДОГОВОРА
// ──────────────────────────────────────────────────────────────

function createTreaty(nationA, nationB, type, conditions, dialogueLog) {
  if (!GAME_STATE.diplomacy) initDiplomacy();

  const tDef = TREATY_TYPES[type] || TREATY_TYPES.custom;
  const turn  = GAME_STATE.turn || 1;
  const id    = `treaty_${_relKey(nationA, nationB)}_t${turn}_${type}`;

  const treaty = {
    id,
    type,
    label:        tDef.label,
    icon:         tDef.icon,
    status:       'active',
    parties:      [nationA, nationB],
    turn_signed:  turn,
    duration:     conditions.duration ?? tDef.default_duration,  // null = бессрочный
    conditions:   { ...conditions },
    effects:      { ...tDef.effects, ...( conditions.effects || {}) },
    dialogue_log: dialogueLog || [],
    turn_expires: conditions.duration
      ? turn + (conditions.duration ?? tDef.default_duration ?? 0)
      : null,
  };

  GAME_STATE.diplomacy.treaties.push(treaty);

  // Обновляем отношения
  const rel = getRelation(nationA, nationB);
  rel.score = Math.min(100, rel.score + 10);
  rel.last_interaction = turn;
  if (type === 'peace_treaty') rel.war = false;

  return treaty;
}

function breakTreaty(treatyId, breakerNation) {
  if (!GAME_STATE.diplomacy) return;
  const t = GAME_STATE.diplomacy.treaties.find(x => x.id === treatyId);
  if (!t) return;
  t.status   = 'broken';
  t.breaker  = breakerNation;
  t.turn_broken = GAME_STATE.turn;

  // Штраф к отношениям за разрыв
  const rel = getRelation(t.parties[0], t.parties[1]);
  rel.score = Math.max(-100, rel.score - 25);
}

// ──────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ЭФФЕКТОВ ДОГОВОРОВ (вызывается каждый ход)
// ──────────────────────────────────────────────────────────────

function processDiplomacyTick(nationId) {
  if (!GAME_STATE.diplomacy) return;
  const turn = GAME_STATE.turn || 1;

  for (const treaty of GAME_STATE.diplomacy.treaties) {
    if (treaty.status !== 'active') continue;
    if (!treaty.parties.includes(nationId)) continue;

    // Истечение срока
    if (treaty.turn_expires && turn >= treaty.turn_expires) {
      treaty.status = 'expired';
      continue;
    }

    const nation = GAME_STATE.nations[nationId];
    if (!nation) continue;

    const effects = treaty.effects || {};

    // Торговый бонус
    if (effects.trade_bonus && nation.economy) {
      nation.economy._trade_treaty_bonus = (nation.economy._trade_treaty_bonus || 0) + effects.trade_bonus;
    }

    // Бонус легитимности
    if (effects.legitimacy_bonus && nation.population) {
      nation.population._diplomacy_legitimacy = (nation.population._diplomacy_legitimacy || 0)
        + effects.legitimacy_bonus;
    }

    // Контрибуция
    if (effects.reparations && treaty.conditions.reparations_per_turn) {
      const payer = treaty.parties.find(p => p !== nationId);
      const payerNation = GAME_STATE.nations[payer];
      if (payerNation && payerNation.economy) {
        const amount = treaty.conditions.reparations_per_turn;
        payerNation.economy.treasury -= amount;
        nation.economy.treasury      += amount;
      }
    }
  }

  // Чистим временные бонусы перед следующим ходом
  // (пересчитываются свежо каждый ход выше)
}

// ──────────────────────────────────────────────────────────────
// ИСТОРИЯ ДИАЛОГОВ
// ──────────────────────────────────────────────────────────────

function getDiplomacyDialogue(nationA, nationB) {
  if (!GAME_STATE.diplomacy) initDiplomacy();
  const key = _relKey(nationA, nationB);
  if (!GAME_STATE.diplomacy.dialogues[key]) {
    GAME_STATE.diplomacy.dialogues[key] = [];
  }
  return GAME_STATE.diplomacy.dialogues[key];
}

function addDiplomacyMessage(nationA, nationB, role, text, displayText) {
  const log = getDiplomacyDialogue(nationA, nationB);
  const entry = { role, text, turn: GAME_STATE.turn || 1, ts: Date.now() };
  // displayText — очищенный текст для UI (без JSON-блоков)
  if (displayText !== undefined && displayText !== text) entry.displayText = displayText;
  log.push(entry);
  // Ограничиваем историю 50 сообщениями
  if (log.length > 50) log.splice(0, log.length - 50);
  return log;
}

/**
 * Записывает отклонённое предложение в архив договоров.
 */
function recordRejection(nationA, nationB, treatyType) {
  if (!GAME_STATE.diplomacy) initDiplomacy();
  const id = `treaty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const treaty = {
    id,
    type:        treatyType,
    status:      'rejected',
    parties:     [nationA, nationB],
    turn_signed: GAME_STATE.turn || 1,
    duration:    0,
    conditions:  {},
    dialogue_log: [],
    effects:     {},
  };
  GAME_STATE.diplomacy.treaties.push(treaty);
  return treaty;
}

function clearDiplomacyDialogue(nationA, nationB) {
  if (!GAME_STATE.diplomacy) return;
  const key = _relKey(nationA, nationB);
  GAME_STATE.diplomacy.dialogues[key] = [];
}

// ──────────────────────────────────────────────────────────────
// ОЦЕНКА ГОТОВНОСТИ AI К ДОГОВОРУ
// ──────────────────────────────────────────────────────────────

// Возвращает 0..1 — насколько AI склонен принять предложение
function evalAIReceptiveness(aiNationId, playerNationId, treatyType) {
  const tDef = TREATY_TYPES[treatyType] || TREATY_TYPES.custom;
  const rel   = getRelation(aiNationId, playerNationId);

  // Базовый вес типа договора (1.0 = нейтральный)
  let base = tDef.ai_weight;

  // Модификатор отношений: -100→+100 → ×0.3…×1.7
  const relMod = 1.0 + (rel.score / 100) * 0.7;
  base *= relMod;

  // В состоянии войны мирный договор вероятнее
  if (rel.war && treatyType === 'peace_treaty') base *= 1.5;
  // Военный союз нельзя если воюем
  if (rel.war && treatyType === 'military_alliance') base *= 0.1;

  // Сила нации: если AI намного слабее → вассалитет принять охотнее
  const aiNation  = GAME_STATE.nations[aiNationId];
  const plNation  = GAME_STATE.nations[playerNationId];
  if (aiNation && plNation && treatyType === 'vassalage') {
    const aiPop = aiNation.population?.total  ?? aiNation.regions?.length * 50000 ?? 100000;
    const plPop = plNation.population?.total  ?? plNation.regions?.length * 50000 ?? 100000;
    const ratio = aiPop / Math.max(plPop, 1);
    if (ratio < 0.3) base *= 2.0;   // слабее в 3+ раза — принимают охотнее
    else              base *= 0.2;   // иначе никогда
  }

  return Math.min(1.0, Math.max(0, base));
}

// ──────────────────────────────────────────────────────────────
// ИЗВЛЕЧЕНИЕ УСЛОВИЙ ДОГОВОРА ИЗ ТЕКСТА (парсинг ответа AI)
// ──────────────────────────────────────────────────────────────

// AI возвращает JSON-блок с условиями внутри ответа.
// Ищем ```json ... ``` или <treaty_conditions>...</treaty_conditions>
function extractTreatyConditions(aiResponse) {
  // Вариант 1: JSON в ```json...```
  const jsonBlock = aiResponse.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try { return JSON.parse(jsonBlock[1]); } catch {}
  }
  // Вариант 2: тег <treaty_conditions>
  const tagBlock = aiResponse.match(/<treaty_conditions>([\s\S]*?)<\/treaty_conditions>/);
  if (tagBlock) {
    try { return JSON.parse(tagBlock[1]); } catch {}
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// ПУБЛИЧНОЕ API
// ──────────────────────────────────────────────────────────────

const DiplomacyEngine = {
  init:              initDiplomacy,
  getRelation,
  getRelationScore,
  getRelationLabel,
  isAtWar,
  getActiveTreaties,
  getAllTreaties,
  createTreaty,
  breakTreaty,
  processTick:       processDiplomacyTick,
  getDialogue:       getDiplomacyDialogue,
  addMessage:        addDiplomacyMessage,
  clearDialogue:     clearDiplomacyDialogue,
  evalReceptiveness: evalAIReceptiveness,
  extractConditions: extractTreatyConditions,
  recordRejection,
  TREATY_TYPES,
};
