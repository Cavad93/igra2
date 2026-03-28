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

  // Географическая близость (общие регионы = граница)
  const regA = new Set(natA.regions || []);
  const regB = new Set(natB.regions || []);
  const hasBorder = [...regA].some(r => regB.has(r));
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
    const scoreAC = GAME_STATE.diplomacy.relations[keyAC]?.score ?? 0;
    const scoreBC = GAME_STATE.diplomacy.relations[keyBC]?.score ?? 0;

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

  const raw = affinity + threat + econ + triangle + memory;
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
    for (const [key, rel] of Object.entries(GAME_STATE.diplomacy.relations)) {
      if (!rel || rel.war) continue;
      // _relKey(a,b) = [a,b].sort().join('_')
      // Nation IDs may contain underscores, so we find the split point where both sides are known nation IDs
      const nidSet = new Set(nids);
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
      rel.score  = Math.round(rel.score + ALPHA * (base - rel.score));
      rel.score  = Math.max(-100, Math.min(100, rel.score));
    }
    return;
  }

  for (let i = 0; i < nids.length; i++) {
    for (let j = i + 1; j < nids.length; j++) {
      const a = nids[i], b = nids[j];
      const rel = getRelation(a, b);
      if (rel.war) continue;
      const base = calcBaseRelation(a, b);
      rel.score  = Math.round(rel.score + ALPHA * (base - rel.score));
      rel.score  = Math.max(-100, Math.min(100, rel.score));
    }
  }
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

  // Размер экстренного набора: до 3% населения, не дороже 30% казны
  const maxByPop  = Math.floor(pop * 0.03);
  const maxByGold = treasury > 0
    ? Math.floor(treasury * 0.30 / Math.max(1, CONFIG?.BALANCE?.INFANTRY_UPKEEP ?? 2))
    : 0;
  const recruits  = Math.max(0, Math.min(maxByPop, maxByGold, 1500));

  if (recruits > 0) {
    military.infantry = (military.infantry ?? 0) + recruits;
    const cost = recruits * (CONFIG?.BALANCE?.INFANTRY_UPKEEP ?? 2) * 3;
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

function _areNeighbors(nationA, nationB) {
  const regions = Object.values(GAME_STATE.regions ?? {});
  const regA = new Set(regions.filter(r => r.nation === nationA).map(r => r.id));
  const regB = new Set(regions.filter(r => r.nation === nationB).map(r => r.id));
  for (const r of regions) {
    if (regA.has(r.id)) {
      for (const c of (r.connections ?? [])) {
        if (regB.has(c)) return true;
      }
    }
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
  TREATY_TYPES,
};
