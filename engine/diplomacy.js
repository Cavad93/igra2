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
    description: 'Проигравший выплачивает единовременно или по ходам.',
    effects: { reparations: true },
    default_duration: 5,    // лет
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
    turn_expires: (conditions.duration ?? tDef.default_duration)
      ? turn + (conditions.duration ?? tDef.default_duration ?? 0) * TURNS_PER_YEAR
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
  // Научная модель отношений
  calcBaseRelation,
  addEvent:          addDiplomacyEvent,
  processGlobalTick: processDiplomacyGlobalTick,
  TREATY_TYPES,
};
