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

// 1 год = 12 ходов (месяцев). Все default_duration хранятся в ГОДАХ.
const TURNS_PER_YEAR = 12;

const TREATY_TYPES = {
  trade_agreement: {
    label:       'Торговый договор',
    icon:        '💼',
    description: 'Снижение пошлин и взаимный доступ к рынкам.',
    effects: { trade_bonus: 0.15, market_access: true },
    default_duration: 10,   // лет
    ai_weight: 1.2,   // насколько AI склонен принять (multiplier от отношений)
  },
  non_aggression: {
    label:       'Пакт о ненападении',
    icon:        '🕊',
    description: 'Обе стороны обязуются не нападать N лет.',
    effects: { forbid_attack: true },
    default_duration: 10,   // лет
    ai_weight: 1.1,
  },
  defensive_alliance: {
    label:       'Оборонный союз',
    icon:        '🛡',
    description: 'Автоматическое вступление в войну при нападении на союзника.',
    effects: { auto_defend: true, military_access: true },
    default_duration: 10,   // лет
    ai_weight: 0.8,
  },
  military_alliance: {
    label:       'Военный союз',
    icon:        '⚔',
    description: 'Полное военное сотрудничество, совместные кампании.',
    effects: { auto_defend: true, joint_attack: true, military_access: true, trade_bonus: 0.10 },
    default_duration: 15,   // лет
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
    default_duration: 5,    // лет
    ai_weight: 0.85,
  },
  war_reparations: {
    label:       'Выплата контрибуции',
    icon:        '💰',
    description: 'Проигравший выплачивает ежемесячно в течение 10 лет (120 ходов).',
    effects: { reparations: true },
    default_duration: 10,   // лет (120 ходов)
    ai_weight: 0.5,
  },
  armistice: {
    label:       'Перемирие',
    icon:        '🕊',
    description: 'Обязательное прекращение огня на 5 лет (60 ходов). Нарушение карается штрафом к отношениям со всеми соседями.',
    effects: { forbid_attack: true, is_armistice: true },
    default_duration: 5,    // лет (60 ходов)
    ai_weight: 1.3,
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
    default_duration: 2,    // лет
    ai_weight: 0.7,
  },
  cultural_exchange: {
    label:       'Культурный обмен',
    icon:        '🎭',
    description: '+стабильность, +науки. Снижение культурной напряжённости.',
    effects: { stability_bonus: 3, tech_bonus: 0.05 },
    default_duration: 5,    // лет
    ai_weight: 1.0,
  },
  embargo: {
    label:       'Торговое эмбарго',
    icon:        '🚫',
    description: 'Блокирует торговлю с целью. -20% дохода казны цели каждый ход. +5 к отношениям с врагами цели за каждый ход.',
    effects: { trade_block: true },
    default_duration: 5,    // лет
    ai_weight: 0.4,
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

// Пороговое количество наций: при > MAX_NATIONS_FULL_INIT используем ленивый режим.
// 200 наций → 19,900 пар — допустимо. 1920 наций → 1,843,680 пар → freeze браузера.
const _INIT_NATION_LIMIT = 200;

function initDiplomacy() {
  if (!GAME_STATE.diplomacy) {
    GAME_STATE.diplomacy = {
      relations: {},
      treaties:  [],
      dialogues: {},
    };
  }

  const nids = Object.keys(GAME_STATE.nations || {});

  // Для больших карт (> лимита) пары создаются лениво в getRelation().
  // Проводим полную инициализацию только для малых карт.
  if (nids.length > _INIT_NATION_LIMIT) return;

  // Проход 1: создаём все пары с нулевым score
  for (let i = 0; i < nids.length; i++) {
    for (let j = i + 1; j < nids.length; j++) {
      const key = _relKey(nids[i], nids[j]);
      if (!GAME_STATE.diplomacy.relations[key]) {
        GAME_STATE.diplomacy.relations[key] = {
          score:            0,
          war:              false,
          truces:           [],
          events:           [],
          flags:            {},
          last_interaction: null,
        };
      }
    }
  }

  // Проход 2: рассчитываем начальный score (все пары уже созданы → triangular OK)
  for (let i = 0; i < nids.length; i++) {
    for (let j = i + 1; j < nids.length; j++) {
      const key = _relKey(nids[i], nids[j]);
      const rel = GAME_STATE.diplomacy.relations[key];
      if (rel && !rel._score_calculated) {
        try {
          rel.score            = calcBaseRelation(nids[i], nids[j]);
          rel._score_calculated = true;
        } catch (_) {}
      }
    }
  }

  // Проход 3: смешиваем с унаследованными данными из nation.relations (сценарные значения)
  _seedFromLegacyRelations();
}

/**
 * Читает score из устаревшего формата nation.relations[otherId].score.
 * Возвращает null если данных нет.
 */
function _legacyScore(nationA, nationB) {
  const a = GAME_STATE.nations?.[nationA]?.relations?.[nationB]?.score;
  if (typeof a === 'number') return a;
  const b = GAME_STATE.nations?.[nationB]?.relations?.[nationA]?.score;
  if (typeof b === 'number') return b;
  return null;
}

/**
 * Засевает DiplomacyEngine из устаревшей системы nation.relations.
 * Если рассчитанный score == 0, но в legacy есть ненулевое значение — берём legacy.
 * Если оба ненулевые — среднее, с весом 60% legacy (сценарные данные приоритетнее).
 */
function _seedFromLegacyRelations() {
  const nations = GAME_STATE.nations ?? {};
  for (const [nId, nation] of Object.entries(nations)) {
    const legRels = nation.relations;
    if (!legRels || typeof legRels !== 'object') continue;
    for (const [otherId, legRel] of Object.entries(legRels)) {
      if (!nations[otherId]) continue;
      const legScore = typeof legRel?.score === 'number' ? legRel.score : null;
      if (legScore === null) continue;
      const key = _relKey(nId, otherId);
      const rel = GAME_STATE.diplomacy.relations[key];
      if (!rel) continue;
      if (rel.score === 0) {
        rel.score = legScore;
      } else if (rel.score !== legScore) {
        // Взвешенное среднее: 60% сценарные данные, 40% рассчитанные
        rel.score = Math.round(legScore * 0.6 + rel.score * 0.4);
      }
      // Синхронизируем флаг войны
      if (legRel.at_war) rel.war = true;
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
    const nids = Object.keys(GAME_STATE.nations || {});
    let score = 0;
    let calculated = false;
    // Для малых карт рассчитываем score при первом доступе к паре
    if (nids.length <= _INIT_NATION_LIMIT) {
      try { score = calcBaseRelation(nationA, nationB); calculated = true; } catch (_) {}
    }
    // Если рассчитанный score == 0, пробуем унаследовать из устаревшего формата
    if (score === 0) {
      const leg = _legacyScore(nationA, nationB);
      if (leg !== null) { score = leg; calculated = true; }
    }
    GAME_STATE.diplomacy.relations[key] = {
      score, war: false, truces: [], events: [], flags: {},
      last_interaction: null, _score_calculated: calculated,
    };
  }
  const rel = GAME_STATE.diplomacy.relations[key];
  if (!rel.flags) rel.flags = {};
  return rel;
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
    duration:     conditions.duration ?? tDef.default_duration,  // в годах, null = бессрочный
    conditions:   { ...conditions },
    effects:      { ...tDef.effects, ...( conditions.effects || {}) },
    dialogue_log: dialogueLog || [],
    // duration хранится в годах; 1 год = TURNS_PER_YEAR (12) ходов
    turn_expires: (() => {
      const durationInYears = conditions.duration ?? tDef.default_duration ?? null;
      return durationInYears ? turn + durationInYears * TURNS_PER_YEAR : null;
    })(),
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
  t.status      = 'broken';
  t.breaker     = breakerNation;
  t.turn_broken = GAME_STATE.turn;

  // Снятие эффектов договора (флаги, бонусы)
  if (typeof removeTreatyEffects === 'function') {
    try { removeTreatyEffects(t); } catch (_) {}
  }

  // Штраф к отношениям за разрыв (уже внутри removeTreatyEffects, но добавим событие памяти)
  const rel = getRelation(t.parties[0], t.parties[1]);
  rel.score = Math.max(-100, rel.score - 20);
  if (typeof addDiplomacyEvent === 'function') {
    addDiplomacyEvent(t.parties[0], t.parties[1], -20, 'treaty_broken');
  }
}

// ──────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ЭФФЕКТОВ ДОГОВОРОВ (вызывается каждый ход)
// ──────────────────────────────────────────────────────────────

function processDiplomacyTick(nationId) {
  if (!GAME_STATE.diplomacy) return;
  const turn = GAME_STATE.turn || 1;

  // Сбрасываем накопленные за предыдущий ход временные бонусы
  // (они пересчитываются свежо в цикле ниже)
  const _nation = GAME_STATE.nations[nationId];
  if (_nation?.economy)    _nation.economy._trade_treaty_bonus      = 0;
  if (_nation?.population) _nation.population._diplomacy_legitimacy = 0;

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

  // DIP_003: honor_score игрока в контексте лидера-AI
  // Вероломный переговорщик вызывает меньше доверия → AI менее охотно принимает договоры
  const plRep = (plNation ?? GAME_STATE.nations?.[playerNationId])?.diplo_reputation;
  if (plRep && plRep.honor_score < 100) {
    // Линейный штраф: honor 100 → ×1.0, honor 0 → ×0.5
    const honorMod = 0.5 + (plRep.honor_score / 100) * 0.5;
    base *= honorMod;
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

// ══════════════════════════════════════════════════════════════
// НАУЧНАЯ МОДЕЛЬ ФОРМИРОВАНИЯ ОТНОШЕНИЙ
//
// Основана на:
//   • Walt (1987)           — Balance of Threat Theory
//   • Bueno de Mesquita (1981) — Expected Utility Theory
//   • Rosecrance (1986)     — Commercial Peace / Economic Interdependence
//   • Heider (1958)         — Structural Balance (триады: враг врага — друг)
//   • Doyle (1983)          — Democratic Peace Theory (сходство форм правления)
//   • Memory Decay          — экспоненциальное затухание прошлых событий (λ = 0.10)
//
// Итоговый score = clamp(affinity + threat + econ + triangle + memory, −100, 100)
// α-конвергенция за ход: score += 0.04 × (base − score)
// ══════════════════════════════════════════════════════════════

// ── Группировка форм правления (Doyle 1983) ──────────────────
function _govGroupOf(type) {
  if (['republic', 'democracy', 'oligarchy'].includes(type)) return 'civic';
  if (['monarchy', 'absolute_monarchy', 'kingdom'].includes(type)) return 'monarchic';
  if (['empire', 'hegemony', 'imperial'].includes(type)) return 'imperial';
  return 'other';
}

// ── 1. АФФИНИТЕТ: культура + религия + правление (±25) ───────
function _calcAffinity(natA, natB) {
  let aff = 0;

  // Культурная близость
  if (natA.culture && natB.culture) {
    if (natA.culture === natB.culture) {
      aff += 12;
    } else if (natA.culture_group && natB.culture_group
               && natA.culture_group === natB.culture_group) {
      aff += 5;
    }
  }

  // Религиозная близость
  if (natA.religion && natB.religion) {
    if (natA.religion === natB.religion) {
      aff += 12;
    } else if (natA.religion_group && natB.religion_group
               && natA.religion_group === natB.religion_group) {
      aff += 4;
    } else {
      aff -= 3;  // разные религии — слабое напряжение
    }
  }

  // Форма правления (Doyle 1983: «демократический мир»)
  const govA = natA.government?.type ?? 'monarchy';
  const govB = natB.government?.type ?? 'monarchy';
  if (govA === govB) {
    aff += 8;
  } else if (_govGroupOf(govA) === _govGroupOf(govB)) {
    aff += 3;
  } else {
    aff -= 4;
  }

  return Math.max(-20, Math.min(25, aff));
}

// ── 2. БАЛАНС УГРОЗ (Walt 1987) (±30) ────────────────────────
// Угроза = f(мощь, наступ.потенциал, близость)
// Высокая угроза → негативный вклад в отношения
function _calcThreatBalance(natA, natB) {
  const popA = natA.population?.total ?? 100_000;
  const popB = natB.population?.total ?? 100_000;
  const milA = natA.military?.size ?? natA.military?.total ?? 0;
  const milB = natB.military?.size ?? natB.military?.total ?? 0;
  const treA = Math.max(0, natA.economy?.treasury ?? 0);
  const treB = Math.max(0, natB.economy?.treasury ?? 0);

  // Composite Index of Power (упрощённый CINC)
  const powerA = popA + milA * 800 + treA * 10 || 1;
  const powerB = popB + milB * 800 + treB * 10 || 1;

  // Логарифмическое соотношение мощи (0 = равные; +2 = B в 4× сильнее A)
  const powerRatio = Math.log2(powerB / powerA);

  // Географическая близость: нации граничат, если любой регион A смежен с регионом B
  // (connections хранятся в MAP_REGIONS; если не определён — считаем несмежными)
  const regB = new Set(natB.regions || []);
  const _mapRef = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS : null;
  const hasBorder = !!_mapRef && (natA.regions || []).some(rId => {
    const conn = _mapRef[rId]?.connections ?? [];
    return conn.some(nb => regB.has(nb));
  });
  const proximity = hasBorder ? 1.0 : 0.35;

  // Наступательный потенциал = доля армии от населения
  const offCapB = milB > 0 ? Math.min(1.0, (milB * 1000) / Math.max(popB, 1)) : 0.1;

  // Threat = tanh(ratio × proximity × offCap × scale)
  const threat = Math.tanh(powerRatio * proximity * offCapB * 1.8);

  // Сильная угроза → недоверие (отрицательный вклад)
  return Math.round(-threat * 30);
}

// ── 3. ЭКОНОМИЧЕСКАЯ ВЗАИМОЗАВИСИМОСТЬ (Rosecrance 1986) (0..20) ──
function _calcEconInterdep(nationA, nationB, treaties) {
  const natA = GAME_STATE.nations[nationA];
  const natB = GAME_STATE.nations[nationB];
  if (!natA || !natB) return 0;

  let econ = 0;

  // Активные торговые/союзнические договоры = высокая взаимозависимость
  const tradeActive    = treaties.some(t => t.status === 'active'
    && ['trade_agreement', 'joint_campaign', 'cultural_exchange'].includes(t.type));
  const allianceActive = treaties.some(t => t.status === 'active'
    && ['defensive_alliance', 'military_alliance', 'marriage_alliance'].includes(t.type));

  if (tradeActive)    econ += 14;
  if (allianceActive) econ += 9;

  // Богатство соседа = потенциальная торговая выгода
  const avgTreasury = ((natA.economy?.treasury ?? 0) + (natB.economy?.treasury ?? 0)) / 2;
  if (avgTreasury > 500) econ += Math.min(7, Math.log10(Math.max(1, avgTreasury)));

  return Math.min(20, Math.round(econ));
}

// ── 4. ТРЕУГОЛЬНЫЙ БАЛАНС (Heider 1958) (±15) ────────────────
// «Враг врага — мой друг», «друг врага — мой враг»
// Взвешенная сумма знаков парных произведений через третьи страны
function _calcTriangularBalance(nationA, nationB) {
  if (!GAME_STATE.diplomacy) return 0;

  // Для больших карт итерируем только по СУЩЕСТВУЮЩИМ отношениям (не создаём новые),
  // что позволяет избежать O(N) обхода тысяч наций.
  const nids = Object.keys(GAME_STATE.nations || {});
  const largMap = nids.length > _INIT_NATION_LIMIT;

  // На большой карте берём только нации, с которыми уже есть ненулевые отношения
  const candidates = largMap
    ? Object.keys(GAME_STATE.diplomacy.relations)
        .filter(k => k.includes(nationA) || k.includes(nationB))
        .flatMap(k => {
          for (let si = 1; si < k.length; si++) {
            if (k[si] === '_') {
              const left = k.slice(0, si), right = k.slice(si + 1);
              if (GAME_STATE.nations?.[left] && GAME_STATE.nations?.[right]) return [left, right];
            }
          }
          return [];
        })
        .filter((id, i, arr) => id !== nationA && id !== nationB && arr.indexOf(id) === i)
    : nids.filter(id => id !== nationA && id !== nationB);

  let balance = 0;
  let count   = 0;

  for (const c of candidates) {
    // Читаем score напрямую без lazy-создания пар (избегаем рекурсии на больших картах)
    const keyAC = _relKey(nationA, c);
    const keyBC = _relKey(nationB, c);
    const _rawAC = GAME_STATE.diplomacy.relations[keyAC]?.score;
    const _rawBC = GAME_STATE.diplomacy.relations[keyBC]?.score;
    const scoreAC = Number.isFinite(_rawAC) ? _rawAC : 0;
    const scoreBC = Number.isFinite(_rawBC) ? _rawBC : 0;

    if (Math.abs(scoreAC) < 20 || Math.abs(scoreBC) < 20) continue;
    balance += Math.tanh((scoreAC * scoreBC) / 4000);
    count++;
  }

  if (count === 0) return 0;
  return Math.round((balance / count) * 15);
}

// ── 5. ПАМЯТЬ СОБЫТИЙ — экспоненциальное затухание ───────────
// Σ delta_i × e^(−λ × age_i),  λ = 0.10 за ход, ±30
function _calcMemoryDecay(nationA, nationB) {
  const rel    = getRelation(nationA, nationB);
  const events = rel.events || [];
  const now    = GAME_STATE.turn || 1;
  const LAMBDA = 0.10;
  const MAX_AGE = 50; // e^(-0.1*50) ≈ 0.007, negligible

  let sum = 0;
  for (const ev of events) {
    const age = Math.max(0, now - ev.turn);
    if (age > MAX_AGE) continue; // skip negligible old events
    sum += ev.delta * Math.exp(-LAMBDA * age);
  }
  return Math.max(-30, Math.min(30, Math.round(sum)));
}

// ── ИТОГОВАЯ БАЗОВАЯ ОЦЕНКА ───────────────────────────────────
/**
 * Рассчитывает «базовые» отношения между двумя нациями
 * по совокупности пяти научных компонент.
 * @returns {number} — от -100 до +100
 */
// ── DIP_009: Вспомогательная функция получения исторических обид нации ────────
/**
 * Читает historical_grievances (0..1) из SuperOU nation._ou.diplomacy.
 * Возвращает 0, если данные недоступны.
 * @param {object} nation
 * @returns {number} 0..1
 */
function _getNationGrievance(nation) {
  const arr = nation?._ou?.diplomacy;
  if (!Array.isArray(arr)) return 0;
  const v = arr.find(x => x.name === 'historical_grievances');
  return v ? (v.current ?? 0) : 0;
}

function calcBaseRelation(nationA, nationB) {
  const natA = GAME_STATE.nations?.[nationA];
  const natB = GAME_STATE.nations?.[nationB];
  if (!natA || !natB) return 0;

  const treaties = GAME_STATE.diplomacy?.treaties?.filter(t =>
    t.parties.includes(nationA) && t.parties.includes(nationB)
  ) ?? [];

  const affinity = _calcAffinity(natA, natB);
  const threat   = _calcThreatBalance(natA, natB);
  const econ     = _calcEconInterdep(nationA, nationB, treaties);
  const triangle = _calcTriangularBalance(nationA, nationB);
  const memory   = _calcMemoryDecay(nationA, nationB);

  // DIP_003: штраф за репутацию вероломного (betrayals у нации B)
  const betrayalPenalty = (natB.diplo_reputation?.betrayals ?? 0) * 5;

  // DIP_009: Исторические обиды снижают базовые отношения
  // Обиды нации A уменьшают её восприятие всех (компонент памяти)
  // Обиды нации B симметрично влияют на отношения с A
  const grievanceA       = _getNationGrievance(natA);
  const grievanceB       = _getNationGrievance(natB);
  const grievancePenalty = Math.round((grievanceA + grievanceB) * 0.5 * 8);

  const raw = (affinity - betrayalPenalty) + threat + econ + triangle + (memory - grievancePenalty);
  return Math.max(-100, Math.min(100, raw));
}

// ── Запись исторического события для памяти ───────────────────
/**
 * Добавляет дипломатическое событие в историю пары (memory decay).
 * @param {string} nationA
 * @param {string} nationB
 * @param {number} delta      — изменение (−30…+30)
 * @param {string} eventType  — 'war', 'gift', 'betrayal', 'aid', 'insult', ...
 */
function addDiplomacyEvent(nationA, nationB, delta, eventType) {
  const rel = getRelation(nationA, nationB);
  if (!rel.events) rel.events = [];
  rel.events.push({
    type:  eventType || 'generic',
    delta: Math.max(-30, Math.min(30, delta)),
    turn:  GAME_STATE.turn || 1,
  });
  // Оставляем последние 80 событий
  if (rel.events.length > 80) rel.events.splice(0, rel.events.length - 80);
  // Also remove events older than 50 turns
  const now = GAME_STATE.turn || 1;
  rel.events = rel.events.filter(ev => (now - ev.turn) <= 50);
}

// ── DIP_002: Дипломатические инциденты ──────────────────────────────────────
/**
 * Для каждой пары враждебных соседей (score < -20, общие регионы) —
 * 2% шанс за ход генерировать инцидент: пограничная стычка, поимка шпиона,
 * оскорбление при дворе. Вызывает addDiplomacyEvent() и уведомляет игрока.
 */
function _processDiplomaticIncidents(nids) {
  const INCIDENT_CHANCE = 0.02;
  const INCIDENT_TYPES  = [
    { label: 'Пограничная стычка',   delta: -10 },
    { label: 'Поимка шпиона',         delta: -15 },
    { label: 'Оскорбление при дворе', delta: -5  },
  ];
  const nations      = GAME_STATE.nations || {};
  const playerNation = GAME_STATE.player_nation;
  const nidSet       = new Set(nids);

  function _tryIncident(a, b, rel) {
    if (!rel || rel.war || rel.score >= -20) return;
    const natA = nations[a];
    const natB = nations[b];
    if (!natA || !natB) return;
    // Соседство через общие регионы
    const regA = new Set(natA.regions || []);
    if (!(natB.regions || []).some(r => regA.has(r))) return;
    // 2% шанс инцидента
    if (Math.random() >= INCIDENT_CHANCE) return;

    const inc = INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)];
    addDiplomacyEvent(a, b, inc.delta, 'incident');
    rel.score = Math.max(-100, rel.score + inc.delta);

    // Обновить SuperOU: INSULT_RECEIVED повышает diplomatic_incidents у обеих наций
    if (typeof window !== 'undefined' && window.SuperOU?.onDiplomacyEvent) {
      window.SuperOU.onDiplomacyEvent(a, 'INSULT_RECEIVED');
      window.SuperOU.onDiplomacyEvent(b, 'INSULT_RECEIVED');
    }

    // Уведомление игрока
    if (a === playerNation || b === playerNation) {
      const nameA = natA.name ?? a;
      const nameB = natB.name ?? b;
      const msg   = `⚠️ Дипломатический инцидент: «${inc.label}» между ${nameA} и ${nameB}. Отношения: ${inc.delta}`;
      if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');
      if (typeof window !== 'undefined' && window.UI?.notify) window.UI.notify(msg);
    }
  }

  if (nids.length > _INIT_NATION_LIMIT) {
    // Большие карты: итерируем только существующие пары
    for (const [key, rel] of Object.entries(GAME_STATE.diplomacy.relations)) {
      if (!rel) continue;
      let a = null, b = null;
      for (let si = 1; si < key.length; si++) {
        if (key[si] === '_') {
          const left = key.slice(0, si), right = key.slice(si + 1);
          if (nidSet.has(left) && nidSet.has(right)) { a = left; b = right; break; }
        }
      }
      if (a && b) _tryIncident(a, b, rel);
    }
  } else {
    // Малые карты: все пары
    for (let i = 0; i < nids.length; i++) {
      for (let j = i + 1; j < nids.length; j++) {
        _tryIncident(nids[i], nids[j], getRelation(nids[i], nids[j]));
      }
    }
  }
}

// ── DIP_007: Динамическое распространение религии через дипломатию ──────────
/**
 * Для каждого активного договора cultural_exchange или marriage_alliance:
 * 1% шанс за ход сдвинуть minor_religion слабого партнёра на 10% в сторону
 * религии сильного партнёра. Отслеживается в nation.religion_influence{}.
 * При influence > 0.5: religious_conversion — +8 к единоверцам, -8 с противниками.
 */
function _processReligionSpread() {
  if (!GAME_STATE.diplomacy) return;
  const nations = GAME_STATE.nations || {};
  const SPREAD_CHANCE            = 0.01;   // 1% шанс за ход
  const SPREAD_AMOUNT            = 0.10;   // +10% влияния за событие
  const CONVERSION_THRESHOLD     = 0.50;   // порог конверсии

  for (const treaty of GAME_STATE.diplomacy.treaties) {
    if (treaty.status !== 'active') continue;
    if (treaty.type !== 'cultural_exchange' && treaty.type !== 'marriage_alliance') continue;

    const [a, b] = treaty.parties;
    const natA = nations[a];
    const natB = nations[b];
    if (!natA || !natB) continue;
    if (!natA.religion || !natB.religion) continue;
    // Если религии одинаковы — распространение не нужно
    if (natA.religion === natB.religion) continue;

    // 1% шанс за ход
    if (Math.random() >= SPREAD_CHANCE) continue;

    // «Сильный» партнёр — тот у кого больше населения
    const popA = natA.population?.total ?? 100_000;
    const popB = natB.population?.total ?? 100_000;
    const [strongId, weakId] = popA >= popB ? [a, b] : [b, a];
    const strongNat = nations[strongId];
    const weakNat   = nations[weakId];
    if (!strongNat?.religion || !weakNat) continue;

    const targetReligion = strongNat.religion;

    // Инициализируем объект влияния
    if (!weakNat.religion_influence) weakNat.religion_influence = {};
    const currentInfluence = weakNat.religion_influence[targetReligion] ?? 0;
    const newInfluence      = Math.min(1.0, currentInfluence + SPREAD_AMOUNT);
    weakNat.religion_influence[targetReligion] = newInfluence;

    if (typeof addEventLog === 'function') {
      addEventLog(
        `⛪ Религиозное влияние: ${targetReligion} распространяется в ` +
        `${weakNat.name ?? weakId} (${Math.round(newInfluence * 100)}%) ` +
        `через договор с ${strongNat.name ?? strongId}.`,
        'diplomacy'
      );
    }

    // При influence > 0.5 — конверсия
    if (newInfluence > CONVERSION_THRESHOLD && weakNat.religion !== targetReligion) {
      weakNat.religion = targetReligion;
      delete weakNat.religion_influence[targetReligion]; // сброс после конверсии

      const msg = `⛪ ${weakNat.name ?? weakId} принял религию «${targetReligion}» под влиянием ${strongNat.name ?? strongId}!`;
      if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');
      const playerNation = GAME_STATE.player_nation;
      if (weakId === playerNation || strongId === playerNation) {
        if (typeof window !== 'undefined' && window.UI?.notify) {
          window.UI.notify(msg);
        } else {
          console.log('[DIP_007]', msg);
        }
      }

      // +8 к отношениям с единоверцами, -8 с противниками
      for (const [otherId, otherNat] of Object.entries(nations)) {
        if (otherId === weakId || !otherNat || otherNat.is_eliminated) continue;
        if (!otherNat.religion) continue;
        if (otherNat.religion === targetReligion) {
          addDiplomacyEvent(weakId, otherId, +8, 'religious_conversion');
        } else {
          addDiplomacyEvent(weakId, otherId, -8, 'religious_conversion');
        }
      }
    }
  }
}

// ── DIP_009: Исторические обиды как события ──────────────────────────────────
/**
 * Нации с historical_grievances > 0.6 имеют 5% шанс за ход инициировать
 * дипломатическое требование репараций от ИИ.
 * Добавляет событие 'demand_reparations' и уведомляет игрока.
 */
function _processHistoricalGrievances() {
  if (!GAME_STATE.diplomacy) return;
  const nations      = GAME_STATE.nations || {};
  const playerNation = GAME_STATE.player_nation;
  const GRIEVANCE_THRESHOLD = 0.6;
  const REPARATION_CHANCE   = 0.05;

  for (const [nationId, nation] of Object.entries(nations)) {
    if (!nation || nation.is_eliminated) continue;
    // Игрок не инициирует сам от себя — только ИИ-нации
    if (nationId === playerNation) continue;

    const grievance = _getNationGrievance(nation);
    if (grievance <= GRIEVANCE_THRESHOLD) continue;
    if (Math.random() >= REPARATION_CHANCE) continue;

    // Найти нацию с наихудшими отношениями (потенциальный «должник»)
    let worstScore  = Infinity;
    let targetId    = null;
    for (const [otherId, other] of Object.entries(nations)) {
      if (otherId === nationId || !other || other.is_eliminated) continue;
      const rel = GAME_STATE.diplomacy.relations[_relKey(nationId, otherId)];
      if (!rel) continue;
      if (rel.score < worstScore) {
        worstScore = rel.score;
        targetId   = otherId;
      }
    }
    if (!targetId) continue;

    // Применить штраф к отношениям за требование репараций
    const rel = getRelation(nationId, targetId);
    const delta = -8;
    rel.score = Math.max(-100, rel.score + delta);
    addDiplomacyEvent(nationId, targetId, delta, 'demand_reparations');

    const nationName = nation.name ?? nationId;
    const targetName = GAME_STATE.nations[targetId]?.name ?? targetId;
    const msg = `📜 ${nationName} требует репараций от ${targetName} (обиды: ${Math.round(grievance * 100)}%).`;
    if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');

    // Уведомить игрока, если он участвует
    if (nationId === playerNation || targetId === playerNation) {
      if (typeof window !== 'undefined' && window.UI?.notify) {
        window.UI.notify(msg);
      } else {
        console.log('[DIP_009]', msg);
      }
    }
  }
}

// ── Глобальный тик конвергенции (вызывать 1 раз за ход) ──────
/**
 * α-конвергенция: медленно тянет score каждой пары к базовому значению.
 * α = 0.04 (≈ полная конвергенция за ~25 ходов).
 * Должен вызываться один раз за ход (не per-nation).
 */
function processDiplomacyGlobalTick() {
  if (!GAME_STATE.diplomacy) return;
  const ALPHA = 0.04;
  const nids  = Object.keys(GAME_STATE.nations || {});

  // На больших картах конвергируем только СУЩЕСТВУЮЩИЕ пары (не O(N²) обход)
  if (nids.length > _INIT_NATION_LIMIT) {
    // nidSet создаётся ОДИН РАЗ вне цикла — иначе O(R × N) Set-аллокаций при тысячах записей
    const nidSet = new Set(nids);
    for (const [key, rel] of Object.entries(GAME_STATE.diplomacy.relations)) {
      if (!rel || rel.war) continue;
      // _relKey(a,b) = [a,b].sort().join('_')
      // Nation IDs may contain underscores, so we find the split point where both sides are known nation IDs
      let a = null, b = null;
      for (let si = 1; si < key.length; si++) {
        if (key[si] === '_') {
          const left = key.slice(0, si);
          const right = key.slice(si + 1);
          if (nidSet.has(left) && nidSet.has(right)) { a = left; b = right; break; }
        }
      }
      if (!a || !b) continue;
      const base = calcBaseRelation(a, b);
      if (!Number.isFinite(base)) continue;
      rel.score  = Math.round(rel.score + ALPHA * (base - rel.score));
      rel.score  = Number.isFinite(rel.score) ? Math.max(-100, Math.min(100, rel.score)) : 0;
    }
    _processDiplomaticIncidents(nids);
    _processReligionSpread();
    _processHistoricalGrievances();
    return;
  }

  for (let i = 0; i < nids.length; i++) {
    for (let j = i + 1; j < nids.length; j++) {
      const a = nids[i], b = nids[j];
      const rel = getRelation(a, b);
      if (rel.war) continue;
      const base = calcBaseRelation(a, b);
      if (!Number.isFinite(base)) continue;
      rel.score  = Math.round(rel.score + ALPHA * (base - rel.score));
      rel.score  = Number.isFinite(rel.score) ? Math.max(-100, Math.min(100, rel.score)) : 0;
    }
  }
  _processDiplomaticIncidents(nids);
  _processReligionSpread();
  _processHistoricalGrievances();
  // DIP_010: начислять ОВ каждый ход
  _earnInfluencePointsTick();
}

// ──────────────────────────────────────────────────────────────
// ВОЙНА / МИР — прямые действия
// ──────────────────────────────────────────────────────────────

/**
 * Официально объявить войну. Учитывает активное перемирие (armistice).
 * @returns { ok: bool, reason: string }
 */
function declareWar(attackerNationId, targetNationId) {
  if (!GAME_STATE.diplomacy) initDiplomacy();
  const rel = getRelation(attackerNationId, targetNationId);

  if (rel.war) return { ok: false, reason: 'Вы уже находитесь в состоянии войны.' };

  // Нарушение перемирия
  const armistices = (GAME_STATE.diplomacy.treaties ?? []).filter(t =>
    t.status === 'active' && t.type === 'armistice' &&
    t.parties.includes(attackerNationId) && t.parties.includes(targetNationId)
  );
  const breakingArmistice = armistices.length > 0;

  if (breakingArmistice) {
    for (const t of armistices) {
      t.status    = 'broken';
      t.breaker   = attackerNationId;
      t.turn_broken = GAME_STATE.turn ?? 1;
    }
    // Штраф за нарушение перемирия
    rel.score = Math.max(-100, rel.score - 50);
    addDiplomacyEvent(attackerNationId, targetNationId, -50, 'armistice_broken');
    // Штраф к отношениям со всеми соседями-очевидцами
    _applyArmisticeBreakCoalitionPenalty(attackerNationId, targetNationId);
    // DIP_003: записать предательство в репутацию агрессора (без вызова removeTreatyEffects)
    _recordBetrayalDirect(attackerNationId);
  }

  // Создаём запись войны в WarScoreEngine
  if (typeof WarScoreEngine !== 'undefined') {
    WarScoreEngine.initWar(attackerNationId, targetNationId);
  }

  // Объявление войны
  rel.war   = true;
  rel.score = Math.min(-60, rel.score - 30);
  addDiplomacyEvent(attackerNationId, targetNationId, -30, 'war');

  // Обновляем legacy relations
  const natA = GAME_STATE.nations?.[attackerNationId];
  const natB = GAME_STATE.nations?.[targetNationId];
  if (natA?.relations?.[targetNationId]) natA.relations[targetNationId].at_war = true;
  if (natB?.relations?.[attackerNationId]) natB.relations[attackerNationId].at_war = true;

  // Обновляем military.at_war_with — проверяется логикой мобилизации AI
  if (natA?.military) {
    if (!natA.military.at_war_with) natA.military.at_war_with = [];
    if (!natA.military.at_war_with.includes(targetNationId))
      natA.military.at_war_with.push(targetNationId);
  }
  if (natB?.military) {
    if (!natB.military.at_war_with) natB.military.at_war_with = [];
    if (!natB.military.at_war_with.includes(attackerNationId))
      natB.military.at_war_with.push(attackerNationId);
  }

  // Разрываем несовместимые договоры (пакты о ненападении, союзы)
  const incompatible = ['non_aggression', 'defensive_alliance', 'military_alliance', 'military_access'];
  for (const t of (GAME_STATE.diplomacy.treaties ?? [])) {
    if (t.status !== 'active') continue;
    if (!incompatible.includes(t.type)) continue;
    if (t.parties.includes(attackerNationId) && t.parties.includes(targetNationId)) {
      t.status    = 'broken';
      t.breaker   = attackerNationId;
      t.turn_broken = GAME_STATE.turn ?? 1;
    }
  }

  if (typeof addEventLog === 'function') {
    const aN = natA?.name ?? attackerNationId;
    const bN = natB?.name ?? targetNationId;
    const warn = breakingArmistice ? ' ⚠️ Перемирие нарушено! Штраф к отношениям.' : '';
    addEventLog(`⚔️ ${aN} объявляет войну ${bN}!${warn}`, 'danger');
  }

  // Трекинг статистики войн (для системы достижений и клятв)
  if (natA) {
    natA._wars_declared           = (natA._wars_declared ?? 0) + 1;
    natA._wars_declared_this_turn = (natA._wars_declared_this_turn ?? 0) + 1;
    natA._wars_total              = (natA._wars_total ?? 0) + 1;
    natA._last_war_turn           = GAME_STATE.turn ?? 0;
  }
  if (natB) {
    natB._wars_total    = (natB._wars_total ?? 0) + 1;
    natB._last_war_turn = GAME_STATE.turn ?? 0;
  }

  // Немедленная мобилизация AI-нации(-й) в ответ на объявление войны.
  // Не ждём следующего хода — атакованная страна начинает набирать армию сейчас.
  const playerNation = GAME_STATE.player_nation;
  for (const [nationId, nation] of [
    [attackerNationId, natA],
    [targetNationId,   natB],
  ]) {
    if (!nation || nationId === playerNation) continue; // игрок управляет собой
    _warMobilizationResponse(nationId, nation);
  }

  return { ok: true, breaking_armistice: breakingArmistice };
}

/**
 * Немедленная мобилизация AI-нации в ответ на войну.
 * Вызывается однажды в момент объявления войны — первый экстренный набор.
 * Регулярная мобилизация продолжается через applyFallbackDecision каждый ход.
 */
function _warMobilizationResponse(nationId, nation) {
  const military = nation.military;
  const treasury = nation.economy?.treasury ?? 0;
  const pop      = nation.population?.total ?? 0;

  // Размер экстренного набора: до 3% населения, не дороже 30% казны.
  // Минимум 1% населения — оборонное ополчение не зависит от казны.
  const maxByPop  = Math.floor(pop * 0.03);
  const maxByGold = treasury > 0
    ? Math.floor(treasury * 0.30 / Math.max(1, CONFIG?.BALANCE?.INFANTRY_UPKEEP ?? 2))
    : 0;
  const defensiveLevy = Math.floor(pop * 0.01); // ополчение — всегда доступно
  const recruits  = Math.max(defensiveLevy, Math.min(maxByPop, Math.max(maxByGold, defensiveLevy), 1500));

  if (recruits > 0) {
    military.infantry = (military.infantry ?? 0) + recruits;
    // Платим только за то, что финансируется казной (ополчение бесплатно)
    const paidRecruits = Math.min(recruits, maxByGold);
    const cost = paidRecruits * (CONFIG?.BALANCE?.INFANTRY_UPKEEP ?? 2) * 3;
    nation.economy.treasury = Math.max(0, treasury - cost);

    if (typeof addEventLog === 'function') {
      addEventLog(
        `🛡 ${nation.name ?? nationId} объявляет военную мобилизацию! `
        + `Набрано ${recruits} солдат.`,
        'military'
      );
    }
    if (typeof addMemoryEvent === 'function') {
      addMemoryEvent(nationId, 'military', `Экстренная мобилизация: +${recruits} пехоты в ответ на войну.`);
    }

    // Создаём полевую армию — 70% рекрутов идут в поле, 30% остаются гарнизоном
    const homeRegion = nation.regions?.[0];
    if (homeRegion && typeof createArmy === 'function') {
      // Проверяем: у нации уже есть полевая армия?
      const existing = (GAME_STATE.armies ?? []).filter(
        a => a.nation === nationId && a.state !== 'disbanded'
      );
      if (existing.length === 0) {
        const fieldTroops = Math.floor(recruits * 0.70);
        military.infantry = Math.max(0, military.infantry - fieldTroops);
        const mercs = military.mercenaries ?? 0;
        const fieldMercs = Math.floor(mercs * 0.5);
        if (fieldMercs > 0) military.mercenaries -= fieldMercs;

        createArmy(nationId, homeRegion, {
          infantry:    fieldTroops,
          cavalry:     Math.floor((military.cavalry ?? 0) * 0.5),
          mercenaries: fieldMercs,
        }, {
          name: `Армия ${nation.name ?? nationId}`,
        });
      } else {
        // Усиливаем существующую армию
        const army = existing[0];
        const fieldTroops = Math.floor(recruits * 0.50);
        military.infantry = Math.max(0, military.infantry - fieldTroops);
        army.units.infantry = (army.units.infantry ?? 0) + fieldTroops;
      }
    }
  }

  // Если есть наёмники — нанять дополнительно
  if (treasury > 4000 && (military.mercenaries ?? 0) < 400) {
    const mercs = Math.min(200, Math.floor((treasury - 4000) / 25));
    if (mercs > 0) {
      military.mercenaries = (military.mercenaries ?? 0) + mercs;
      nation.economy.treasury -= mercs * (CONFIG?.BALANCE?.MERCENARY_UPKEEP ?? 5) * 3;
      if (typeof addEventLog === 'function') {
        addEventLog(
          `⚔️ ${nation.name ?? nationId} нанимает ${mercs} наёмников.`,
          'military'
        );
      }
    }
  }
}

/** Штраф к отношениям агрессора со всеми его соседями при нарушении перемирия. */
function _applyArmisticeBreakCoalitionPenalty(aggressorId, victimId) {
  const allNationIds = Object.keys(GAME_STATE.nations ?? {});
  for (const otherId of allNationIds) {
    if (otherId === aggressorId || otherId === victimId) continue;
    const relOther = getRelation(aggressorId, otherId);
    // Соседи (смежные регионы) получают штраф -15, остальные -5
    const penalty = _areNeighbors(aggressorId, otherId) ? 15 : 5;
    relOther.score = Math.max(-100, relOther.score - penalty);
    addDiplomacyEvent(aggressorId, otherId, -penalty, 'armistice_broken_observer');
  }
}

// ── DIP_003: Прямая запись предательства (без вызова removeTreatyEffects) ──────
/**
 * Используется в declareWar() для нарушений перемирия, которые не проходят
 * через removeTreatyEffects(). treaty_effects.js::_applyBetrayalReputation()
 * обрабатывает остальные случаи через breakTreaty().
 */
function _recordBetrayalDirect(nationId) {
  if (!nationId) return;
  const nat = GAME_STATE.nations?.[nationId];
  if (!nat) return;
  if (!nat.diplo_reputation) {
    nat.diplo_reputation = { betrayals: 0, honor_score: 100 };
  }
  nat.diplo_reputation.betrayals++;
  nat.diplo_reputation.honor_score = Math.max(0, nat.diplo_reputation.honor_score - 15);

  const playerNation = GAME_STATE.player_nation;
  if (nationId === playerNation) {
    const msg = `⚖️ Нарушив перемирие, вы потеряли честь! Очки чести: ${nat.diplo_reputation.honor_score}/100.`;
    if (typeof window !== 'undefined' && window.UI?.notify) {
      window.UI.notify(msg);
    } else {
      console.log('[DIP_003]', msg);
    }
  }
}

function _areNeighbors(nationA, nationB) {
  const natA = GAME_STATE.nations?.[nationA];
  const natB = GAME_STATE.nations?.[nationB];
  if (!natA || !natB) return false;
  const regB = new Set(natB.regions || []);
  // connections хранятся в MAP_REGIONS, не в GAME_STATE.regions
  const _mapRef = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS : null;
  if (!_mapRef) return false;
  for (const rId of (natA.regions || [])) {
    const conn = _mapRef[rId]?.connections ?? [];
    if (conn.some(nb => regB.has(nb))) return true;
  }
  return false;
}

/**
 * Передать регион от одной нации к другой (при мирном договоре).
 * @param {string} regionId
 * @param {string} fromNationId
 * @param {string} toNationId
 */
function transferRegion(regionId, fromNationId, toNationId) {
  const region = GAME_STATE.regions?.[regionId];
  if (!region) return false;
  if (region.nation !== fromNationId) return false;

  region.nation = toNationId;

  // Обновляем нации (если хранят списки регионов)
  const natFrom = GAME_STATE.nations?.[fromNationId];
  const natTo   = GAME_STATE.nations?.[toNationId];
  if (natFrom?.regions) natFrom.regions = natFrom.regions.filter(id => id !== regionId);
  if (natTo?.regions && !natTo.regions.includes(regionId)) natTo.regions.push(regionId);

  if (typeof addEventLog === 'function') {
    const fromName = natFrom?.name ?? fromNationId;
    const toName   = natTo?.name   ?? toNationId;
    addEventLog(`🗺 Регион «${region.name ?? regionId}» передан: ${fromName} → ${toName}.`, 'info');
  }
  return true;
}

/**
 * Принять условия мира и создать соответствующие договоры.
 * terms = {
 *   ceded_regions:    string[],   // regionId — от проигравшего к победителю
 *   vassalize:        bool,        // проигравший становится вассалом
 *   reparations_turns: number,     // 0 | 60 | 120
 *   reparations_per_turn: number,  // золото/ход
 *   armistice_turns:  number,      // 60 (5 лет)
 *   loser:            string,      // nationId проигравшего
 *   winner:           string,      // nationId победителя
 * }
 */
function concludePeace(playerNationId, targetNationId, terms) {
  if (!GAME_STATE.diplomacy) initDiplomacy();
  const rel = getRelation(playerNationId, targetNationId);

  // 1. Завершаем войну
  rel.war = false;
  if (typeof WarScoreEngine !== 'undefined') {
    WarScoreEngine.endWar(playerNationId, targetNationId);
  }
  const natPlayer = GAME_STATE.nations?.[playerNationId];
  const natTarget = GAME_STATE.nations?.[targetNationId];
  if (natPlayer?.relations?.[targetNationId]) natPlayer.relations[targetNationId].at_war = false;
  if (natTarget?.relations?.[playerNationId]) natTarget.relations[playerNationId].at_war = false;

  const loser  = terms.loser  ?? targetNationId;
  const winner = terms.winner ?? playerNationId;

  // 2. Передача регионов
  for (const regionId of (terms.ceded_regions ?? [])) {
    transferRegion(regionId, loser, winner);
  }

  // 3. Вассалитет
  if (terms.vassalize) {
    createTreaty(winner, loser, 'vassalage', { notes: 'Условие мирного договора.' });
  }

  // 4. Контрибуция
  if ((terms.reparations_turns ?? 0) > 0 && (terms.reparations_per_turn ?? 0) > 0) {
    const durationYears = Math.round(terms.reparations_turns / TURNS_PER_YEAR);
    createTreaty(winner, loser, 'war_reparations', {
      duration:              durationYears,
      reparations_per_turn:  terms.reparations_per_turn,
      reparations_payer:     loser,
      notes: `Контрибуция по ${terms.reparations_per_turn} зол./ход за ${terms.reparations_turns} ходов.`,
    });
  }

  // 5. Перемирие
  if ((terms.armistice_turns ?? 0) > 0) {
    const durationYears = Math.round(terms.armistice_turns / TURNS_PER_YEAR);
    createTreaty(playerNationId, targetNationId, 'armistice', {
      duration: durationYears,
      notes: `Перемирие на ${terms.armistice_turns} ходов.`,
    });
  }

  // 6. Мирный договор (сам факт)
  const peaceTreaty = createTreaty(playerNationId, targetNationId, 'peace_treaty', {
    ceded_regions: terms.ceded_regions ?? [],
    notes: 'Конец войны.',
  });

  rel.score = Math.min(rel.score + 20, -10); // улучшение, но не выше -10 сразу

  addDiplomacyEvent(playerNationId, targetNationId, 15, 'peace');
  if (typeof addEventLog === 'function') {
    const pN = natPlayer?.name ?? playerNationId;
    const tN = natTarget?.name ?? targetNationId;
    addEventLog(`📜 Мир заключён: ${pN} и ${tN}.`, 'success');
  }
  return peaceTreaty;
}

/** Получить активное перемирие между двумя нациями (или null). */
function getArmistice(nationA, nationB) {
  if (!GAME_STATE.diplomacy) return null;
  return (GAME_STATE.diplomacy.treaties ?? []).find(t =>
    t.status === 'active' && t.type === 'armistice' &&
    t.parties.includes(nationA) && t.parties.includes(nationB)
  ) ?? null;
}

// ──────────────────────────────────────────────────────────────
// DIP_005: Наследование договоров по династии
// ──────────────────────────────────────────────────────────────

/**
 * Вызывается при смерти правителя нации nationId.
 * Проверяет все активные брачные союзы нации:
 *   - Если у наследника нет dynasty_link с партнёром → договор истекает
 *     через 5 ходов (grace period) и уведомляет обе стороны.
 *
 * @param {string} nationId — нация, чей правитель умер
 */
function onRulerDeath(nationId) {
  if (!GAME_STATE.diplomacy) return;

  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;

  const currentTurn  = GAME_STATE.turn ?? 1;
  const GRACE_PERIOD = 5; // ходов до истечения брачных союзов без наследника

  // Ищем все активные брачные союзы нации
  const marriageTreaties = (GAME_STATE.diplomacy.treaties ?? []).filter(t =>
    t.status === 'active' &&
    t.type === 'marriage_alliance' &&
    t.parties.includes(nationId)
  );

  if (!marriageTreaties.length) return;

  // Наследник — новый правитель после смены
  const newRuler = nation.government?.ruler;

  for (const treaty of marriageTreaties) {
    const partnerId = treaty.parties.find(p => p !== nationId);
    if (!partnerId) continue;

    const partnerNation = GAME_STATE.nations?.[partnerId];
    const rel = getRelation(nationId, partnerId);

    // Проверяем, есть ли у наследника dynasty_link с партнёром.
    // dynasty_link — флаг отношений. Если флага нет (отношения переустановятся
    // в processAllTreatyTicks на основе активных договоров) — считаем, что
    // наследник не имеет личной связи и союз теряет основу.
    // Практически: у нас нет данных о том, с каким правителем был заключён брак,
    // поэтому проверяем наличие другого активного marriage_alliance той же пары
    // (вдруг был двойной союз) — если нет, то союз должен истечь.
    const hasAlternativeBond = (GAME_STATE.diplomacy.treaties ?? []).some(t =>
      t !== treaty &&
      t.status === 'active' &&
      t.type === 'marriage_alliance' &&
      t.parties.includes(nationId) &&
      t.parties.includes(partnerId)
    );

    if (hasAlternativeBond) {
      // Другой брачный союз той же пары существует — связь сохраняется
      continue;
    }

    // Нет альтернативной династической связи — назначаем grace period
    // Если treaty уже имеет _dynasty_expires_turn — пропускаем (уже обработан)
    if (treaty._dynasty_expires_turn) continue;

    const expiryTurn = currentTurn + GRACE_PERIOD;
    treaty._dynasty_expires_turn = expiryTurn;

    const nationName  = nation.name ?? nationId;
    const partnerName = partnerNation?.name ?? partnerId;
    const playerNation = GAME_STATE.player_nation;

    const msg = `👑 Правитель ${nationName} скончался. Брачный союз с ${partnerName} потеряет силу через ${GRACE_PERIOD} ходов, если новый правитель не подтвердит союз.`;

    if (typeof addEventLog === 'function') {
      addEventLog(msg, 'diplomacy');
    }

    // Уведомить игрока, если он участник
    if (nationId === playerNation || partnerId === playerNation) {
      if (typeof window !== 'undefined' && window.UI?.notify) {
        window.UI.notify(msg);
      } else {
        console.log('[DIP_005]', msg);
      }
    }

    addDiplomacyEvent(nationId, partnerId, -5, 'ruler_death_dynasty');
  }
}

/**
 * Проверяет истечение брачных союзов по grace period (dynasty_expires_turn).
 * Вызывается из processAllTreatyTicks() каждый ход.
 * @param {object} treaty
 * @param {number} turn
 */
function _checkDynastyExpiry(treaty, turn) {
  if (!treaty._dynasty_expires_turn) return;
  if (turn < treaty._dynasty_expires_turn) return;
  if (treaty.status !== 'active') return;

  treaty.status = 'expired';

  const [a, b]  = treaty.parties;
  const natA    = GAME_STATE.nations?.[a];
  const natB    = GAME_STATE.nations?.[b];
  const nameA   = natA?.name ?? a;
  const nameB   = natB?.name ?? b;
  const msg     = `💍 Брачный союз между ${nameA} и ${nameB} расторгнут — наследник не сохранил династическую связь.`;

  if (typeof removeTreatyEffects === 'function') {
    try { removeTreatyEffects(treaty); } catch (_) {}
  }

  addDiplomacyEvent(a, b, -10, 'dynasty_bond_dissolved');

  if (typeof addEventLog === 'function') {
    addEventLog(msg, 'diplomacy');
  }

  const playerNation = GAME_STATE.player_nation;
  if (playerNation && (a === playerNation || b === playerNation)) {
    if (typeof window !== 'undefined' && window.UI?.notify) {
      window.UI.notify(msg);
    } else {
      console.log('[DIP_005]', msg);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// DIP_008: Коалиция по инициативе игрока
// ──────────────────────────────────────────────────────────────

/**
 * Найти общих врагов двух наций (нации, к которым обе относятся с score < -20).
 * @param {string} nationA
 * @param {string} nationB
 * @returns {string[]} массив nationId общих врагов
 */
function findCommonEnemies(nationA, nationB) {
  const nations = GAME_STATE.nations ?? {};
  const common  = [];
  for (const [nId, n] of Object.entries(nations)) {
    if (nId === nationA || nId === nationB) continue;
    if (n.is_eliminated || n.is_defeated) continue;
    const relA = getRelationScore(nationA, nId);
    const relB = getRelationScore(nationB, nId);
    if (relA < -20 && relB < -20) common.push(nId);
  }
  return common;
}

/**
 * DIP_008: Сформировать коалицию двух наций против общего врага.
 * Проверяет условия и создаёт договор joint_campaign с метаданными коалиции.
 *
 * Условия:
 *   - Отношения playerNation ↔ targetNation > 20
 *   - Отношения targetNation ↔ enemyNation  < -20
 *   - Отношения playerNation ↔ enemyNation  < -20
 *
 * @param {string} playerNationId — инициатор (обычно игрок)
 * @param {string} targetNationId — партнёр по коалиции
 * @param {string} enemyNationId  — общий враг
 * @returns {{ ok: boolean, reason?: string, treaty?: object }}
 */
function proposeCoalition(playerNationId, targetNationId, enemyNationId) {
  if (!GAME_STATE.diplomacy) initDiplomacy();

  const playerNation = GAME_STATE.nations?.[playerNationId];
  const targetNation = GAME_STATE.nations?.[targetNationId];
  const enemyNation  = GAME_STATE.nations?.[enemyNationId];

  if (!playerNation || !targetNation || !enemyNation) {
    return { ok: false, reason: 'Нация не найдена.' };
  }

  // DIP_010: проверить и списать ОВ за предложение коалиции
  const ipCheck = spendInfluencePoints(playerNationId, INFLUENCE_COSTS.propose_coalition, 'Коалиция');
  if (!ipCheck.ok) return ipCheck;

  // Внутренний хелпер: вернуть ОВ при ошибке
  const _refundAndFail = (reason) => {
    _ensureInfluencePoints(playerNation);
    playerNation.influence_points += INFLUENCE_COSTS.propose_coalition;
    return { ok: false, reason };
  };

  // Проверка 1: отношения инициатора с партнёром
  const relPlayerTarget = getRelationScore(playerNationId, targetNationId);
  if (relPlayerTarget <= 20) {
    return _refundAndFail(
      `Недостаточно хорошие отношения с ${targetNation.name ?? targetNationId} `
      + `для коалиции (нужно > 20, сейчас ${relPlayerTarget}).`
    );
  }

  // Проверка 2: партнёр должен быть враждебен к общему врагу
  const relTargetEnemy = getRelationScore(targetNationId, enemyNationId);
  if (relTargetEnemy >= -20) {
    return _refundAndFail(
      `${targetNation.name ?? targetNationId} недостаточно враждебна к `
      + `${enemyNation.name ?? enemyNationId} (нужно < -20, сейчас ${relTargetEnemy}).`
    );
  }

  // Проверка 3: инициатор тоже должен быть враждебен
  const relPlayerEnemy = getRelationScore(playerNationId, enemyNationId);
  if (relPlayerEnemy >= -20) {
    return _refundAndFail(
      `Вы недостаточно враждебны к ${enemyNation.name ?? enemyNationId} `
      + `для организации коалиции (нужно < -20, сейчас ${relPlayerEnemy}).`
    );
  }

  // Проверка 4: нет уже активной коалиции против этого врага между теми же нациями
  const existing = (GAME_STATE.diplomacy.treaties ?? []).find(t =>
    t.status === 'active' &&
    t.type   === 'joint_campaign' &&
    t.parties.includes(playerNationId) &&
    t.parties.includes(targetNationId) &&
    t.conditions?.coalition_enemy === enemyNationId
  );
  if (existing) {
    return _refundAndFail('Коалиция против этой нации уже активна.');
  }

  const enemyName  = enemyNation.name  ?? enemyNationId;
  const playerName = playerNation.name ?? playerNationId;
  const targetName = targetNation.name ?? targetNationId;

  const treaty = createTreaty(playerNationId, targetNationId, 'joint_campaign', {
    coalition_enemy:     enemyNationId,
    coalition_countdown: 5,
    duration:            2,
    notes: `Коалиция против ${enemyName}. Совместное наступление через 5 ходов.`,
  });

  const msg = `⚡ Коалиция сформирована! ${playerName} и ${targetName} объединяются против `
            + `${enemyName}. Совместная атака через 5 ходов.`;

  if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');

  const playerNat = GAME_STATE.player_nation;
  if (playerNationId === playerNat || targetNationId === playerNat) {
    if (typeof window !== 'undefined' && window.UI?.notify) {
      window.UI.notify(msg);
    } else {
      console.log('[DIP_008]', msg);
    }
  }

  addDiplomacyEvent(playerNationId, targetNationId, +10, 'coalition_formed');

  return { ok: true, treaty };
}

// ──────────────────────────────────────────────────────────────
// DIP_010: ОЧКИ ДИПЛОМАТИЧЕСКОГО ВЛИЯНИЯ (ОВ / Influence Points)
// ──────────────────────────────────────────────────────────────

/**
 * Стоимость дипломатических действий в Очках Влияния.
 */
const INFLUENCE_COSTS = {
  send_ambassador: 5,   // Отправить посла / начать переговоры
  propose_alliance: 15, // Предложить союз (defensive/military alliance)
  bribe:            20, // Подкуп иностранного правителя
  propose_coalition: 25, // Предложить коалицию
};

/**
 * Гарантирует поле influence_points у нации.
 */
function _ensureInfluencePoints(nation) {
  if (nation && nation.influence_points == null) {
    nation.influence_points = 0;
  }
}

/**
 * Возвращает текущие ОВ игровой нации.
 */
function getInfluencePoints(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;
  _ensureInfluencePoints(nation);
  return nation.influence_points;
}

/**
 * Начисляет ОВ за один ход для ВСЕХ наций:
 *   +2 базово
 *   +1 за каждую нацию, с которой есть хотя бы один активный договор (посольство)
 *   +0.5 за каждый активный договор trade_agreement
 */
function _earnInfluencePointsTick() {
  const nations = GAME_STATE.nations || {};
  const treaties = GAME_STATE.diplomacy?.treaties ?? [];

  for (const [nationId, nation] of Object.entries(nations)) {
    if (!nation || nation.is_eliminated) continue;
    _ensureInfluencePoints(nation);

    let earned = 2; // базовое начисление

    // +1 ОВ за каждого дипломатического партнёра (нация с активным договором = посольство)
    const embassyPartners = new Set();
    for (const t of treaties) {
      if (t.status !== 'active') continue;
      if (!t.parties.includes(nationId)) continue;
      const partner = t.parties.find(p => p !== nationId);
      if (partner) embassyPartners.add(partner);
    }
    earned += embassyPartners.size * 1;

    // +0.5 ОВ за каждый активный торговый договор
    const tradeCount = treaties.filter(t =>
      t.status === 'active' &&
      t.type === 'trade_agreement' &&
      t.parties.includes(nationId)
    ).length;
    earned += tradeCount * 0.5;

    nation.influence_points = Math.min(100, nation.influence_points + earned);
  }
}

/**
 * Проверяет и списывает ОВ у нации перед дипломатическим действием.
 * @returns { ok: boolean, reason?: string }
 */
function spendInfluencePoints(nationId, amount, actionName) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return { ok: false, reason: 'Нация не найдена.' };
  _ensureInfluencePoints(nation);

  if (nation.influence_points < amount) {
    return {
      ok: false,
      reason: `Недостаточно Очков Влияния для «${actionName}» (нужно ${amount}, есть ${Math.floor(nation.influence_points)}).`,
    };
  }
  nation.influence_points -= amount;
  return { ok: true };
}

/**
 * Дипломатический подкуп: тратит 20 ОВ + золото, улучшает отношения.
 * @param {string} playerNationId
 * @param {string} targetNationId
 * @param {number} goldAmount — сумма подкупа (влияет на эффективность)
 * @returns { ok: boolean, delta?: number, reason?: string }
 */
function bribeNation(playerNationId, targetNationId, goldAmount) {
  if (!GAME_STATE.diplomacy) initDiplomacy();

  const playerNation = GAME_STATE.nations?.[playerNationId];
  const targetNation = GAME_STATE.nations?.[targetNationId];
  if (!playerNation || !targetNation) return { ok: false, reason: 'Нация не найдена.' };

  // Проверить и списать ОВ
  const ipCheck = spendInfluencePoints(playerNationId, INFLUENCE_COSTS.bribe, 'Подкуп');
  if (!ipCheck.ok) return ipCheck;

  // Проверить золото
  const gold = goldAmount ?? 200;
  if ((playerNation.economy?.treasury ?? 0) < gold) {
    // Вернуть потраченные ОВ
    _ensureInfluencePoints(playerNation);
    playerNation.influence_points += INFLUENCE_COSTS.bribe;
    return { ok: false, reason: `Недостаточно золота (нужно ${gold}).` };
  }

  playerNation.economy.treasury -= gold;

  // Эффект: +5..+25 к отношениям в зависимости от суммы (логарифмически)
  const delta = Math.round(5 + Math.min(20, Math.log2(gold / 100 + 1) * 10));
  const rel = getRelation(playerNationId, targetNationId);
  rel.score = Math.min(100, rel.score + delta);
  addDiplomacyEvent(playerNationId, targetNationId, delta, 'bribe');

  const playerName = playerNation.name ?? playerNationId;
  const targetName = targetNation.name ?? targetNationId;
  const msg = `💰 ${playerName} подкупил двор ${targetName} на ${gold} монет (+${delta} к отношениям).`;
  if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');
  if (playerNationId === GAME_STATE.player_nation) {
    if (typeof window !== 'undefined' && window.UI?.notify) window.UI.notify(msg);
  }

  return { ok: true, delta };
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
  // Война / Мир
  declareWar,
  concludePeace,
  transferRegion,
  getArmistice,
  // Научная модель отношений
  calcBaseRelation,
  addEvent:          addDiplomacyEvent,
  processGlobalTick: processDiplomacyGlobalTick,
  applyEmbargo:      (...args) => typeof applyEmbargo === 'function' ? applyEmbargo(...args) : undefined,
  // DIP_005: Наследование договоров по династии
  onRulerDeath,
  // DIP_006: Шпионаж → дипломатические отношения
  getCasusBelli(holderNationId, againstNationId) {
    if (!GAME_STATE.diplomacy) return [];
    const rel = getRelation(holderNationId, againstNationId);
    const now = GAME_STATE.turn ?? 1;
    return (rel.casus_belli ?? []).filter(
      cb => cb.holder === holderNationId &&
            cb.against === againstNationId &&
            (!cb.expires || cb.expires > now)
    );
  },
  // DIP_007: Религиозное влияние — ручной запуск (processGlobalTick уже включает)
  processReligionSpread: _processReligionSpread,
  // DIP_008: Коалиция по инициативе игрока
  findCommonEnemies,
  proposeCoalition,
  // DIP_009: Исторические обиды
  getGrievance(nationId) {
    const nation = GAME_STATE.nations?.[nationId];
    return _getNationGrievance(nation);
  },
  processHistoricalGrievances: _processHistoricalGrievances,
  TREATY_TYPES,
  // DIP_010: Очки дипломатического влияния
  getInfluencePoints,
  spendInfluencePoints,
  bribeNation,
  INFLUENCE_COSTS,
};
