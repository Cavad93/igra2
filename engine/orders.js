// engine/orders.js
// ══════════════════════════════════════════════════════════════════════
// СИСТЕМА ПРИКАЗОВ И ДЕЛЕГИРОВАНИЯ ВЛАСТИ
//
// Правитель издаёт приказы — персонажи их исполняют.
// Качество исполнения зависит от:
//   • навыков персонажа (military / admin / diplomacy / intrigue)
//   • лояльности (низкая → халтурит или саботирует)
//   • коррупции (жадный персонаж присваивает ресурсы)
//   • личного участия правителя (личный надзор = лучше)
//
// Структура приказа в GAME_STATE.orders[]:
//   { id, type, label, target_id, assigned_char_id,
//     issued_turn, duration, progress,
//     ruler_oversight,   // 'personal'|'direct'|'distant'
//     status,            // 'active'|'completed'|'failed'|'cancelled'
//     result_quality,    // 0–100 при завершении
//     result_text }
//
// Типы приказов:
//   military_campaign   — военный поход (нужен генерал)
//   administrative_reform — реформа управления (нужен министр)
//   diplomatic_mission  — дипломатическая миссия (нужен посол)
//   govern_region       — управление провинцией (нужен наместник)
//   economic_project    — экономический проект (нужен казначей/министр)
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ──────────────────────────────────────────────────────────────────────
// КОНСТАНТЫ
// ──────────────────────────────────────────────────────────────────────

const ORDER_TYPES = {
  military_campaign: {
    label:       '⚔️ Военный поход',
    skill:       'military',
    role_needed: ['general', 'strategos', 'commander'],
    duration:    6,   // ходов по умолчанию
    desc:        'Поручить полководцу вести армию против указанной цели.',
  },
  administrative_reform: {
    label:       '📜 Административная реформа',
    skill:       'admin',
    role_needed: ['minister', 'advisor', 'chancellor'],
    duration:    4,
    desc:        'Поручить министру провести реформу управления.',
  },
  diplomatic_mission: {
    label:       '🤝 Дипломатическая миссия',
    skill:       'diplomacy',
    role_needed: ['ambassador', 'diplomat', 'envoy', 'advisor'],
    duration:    3,
    desc:        'Направить посла для переговоров с иностранной державой.',
  },
  govern_region: {
    label:       '🏛 Управление провинцией',
    skill:       'admin',
    role_needed: ['governor', 'epistates', 'proconsul', 'advisor'],
    duration:    12,
    desc:        'Назначить наместника для управления регионом.',
  },
  economic_project: {
    label:       '💰 Экономический проект',
    skill:       'admin',
    role_needed: ['treasurer', 'minister', 'advisor', 'merchant'],
    duration:    4,
    desc:        'Поручить провести экономические преобразования.',
  },
};

// Метки надзора правителя
const OVERSIGHT_LABELS = {
  personal: '👑 Личный надзор',
  direct:   '📋 Прямой контроль',
  distant:  '📮 Дальнее командование',
};

// Модификаторы надзора (влияют на финальное качество)
const OVERSIGHT_FACTOR = {
  personal: 1.00,
  direct:   0.90,
  distant:  0.72,
};

// ──────────────────────────────────────────────────────────────────────
// НАВЫКИ ПЕРСОНАЖА
// Если у персонажа нет .skills — выводим из трейтов.
// ──────────────────────────────────────────────────────────────────────

function getCharSkills(char) {
  if (char.skills) return char.skills;
  const t = char.traits ?? {};
  const amb  = t.ambition  ?? 50;
  const caut = t.caution   ?? 50;
  const cru  = t.cruelty   ?? 30;
  const pie  = t.piety     ?? 40;
  const loy  = t.loyalty   ?? 50;
  const gre  = t.greed     ?? 40;
  return {
    military:  Math.round((amb * 0.55 + cru  * 0.45)),
    admin:     Math.round((caut * 0.5  + pie  * 0.5)),
    diplomacy: Math.round(((100 - cru) * 0.5 + caut * 0.3 + pie * 0.2)),
    intrigue:  Math.round((amb * 0.4  + (100 - loy) * 0.4 + gre * 0.2)),
  };
}

// Коэффициент коррупции: 0.0 = честный, 0.5 = очень коррумпированный
function getCorruptionFactor(char) {
  const greed = char.traits?.greed ?? 30;
  // Коррупция = жадность (более мягкий эффект: max 0.4 штраф при greed=100)
  return greed / 250;   // 0 – 0.40
}

// ──────────────────────────────────────────────────────────────────────
// РАСЧЁТ КАЧЕСТВА ИСПОЛНЕНИЯ (0–100)
// ──────────────────────────────────────────────────────────────────────

/**
 * Считает ожидаемое качество исполнения.
 * @param {object} char         - персонаж
 * @param {string} skillName    - 'military'|'admin'|'diplomacy'|'intrigue'
 * @param {string} oversight    - 'personal'|'direct'|'distant'
 * @param {object} nation       - нация игрока (для личной власти правителя)
 * @returns {number} 0–100
 */
function calcOrderQuality(char, skillName, oversight, nation) {
  const skills = getCharSkills(char);
  const rawSkill = skills[skillName] ?? 50;

  // 1. Базовое качество из навыка
  const skillBase = rawSkill / 100;

  // 2. Лояльность: нелояльный халтурит (диапазон 0.35 – 1.0)
  const loyalty = char.traits?.loyalty ?? 50;
  const loyaltyFactor = 0.35 + (loyalty / 100) * 0.65;

  // 3. Коррупция (присваивает ресурсы, снижает эффективность)
  const corruptionPenalty = getCorruptionFactor(char);

  // 4. Надзор правителя
  const oversightF = OVERSIGHT_FACTOR[oversight] ?? 0.72;

  // 5. Личная сила правителя (слабый правитель плохо контролирует)
  const rulerPP = nation?.government?.ruler?.personal_power ?? 60;
  const rulerFactor = rulerPP < 30 ? 0.85 : 1.0;

  const raw = skillBase * loyaltyFactor * (1 - corruptionPenalty) * oversightF * rulerFactor;
  return Math.round(Math.min(100, Math.max(10, raw * 100)));
}

// ──────────────────────────────────────────────────────────────────────
// СОЗДАНИЕ ПРИКАЗА
// ──────────────────────────────────────────────────────────────────────

let _orderIdCounter = 1;

/**
 * Создаёт новый приказ и добавляет в GAME_STATE.orders.
 * @param {object} opts - параметры приказа
 * @returns {object|null} созданный приказ или null при ошибке
 */
function issueOrder(opts) {
  const {
    type,
    target_id    = null,
    target_label = null,
    assigned_char_id,
    army_id      = null,   // для military_campaign: какой армией командует
    oversight    = 'direct',
    notes        = '',
  } = opts;

  const typeDef = ORDER_TYPES[type];
  if (!typeDef) return null;

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (!nation) return null;

  // Правитель ведёт лично — специальный случай
  const isRulerLed = (assigned_char_id === 'ruler');
  let char = null;
  let charName = '';

  if (isRulerLed) {
    charName = nation.government?.ruler?.name ?? 'Правитель';
  } else {
    char = (nation.characters ?? []).find(c => c.id === assigned_char_id && c.alive !== false);
    if (!char) return null;
    charName = char.name;
  }

  if (!GAME_STATE.orders) GAME_STATE.orders = [];

  // Проверяем занятость персонажа (правителя не проверяем — он может лично участвовать)
  if (!isRulerLed) {
    const alreadyBusy = GAME_STATE.orders.some(
      o => o.status === 'active' && o.assigned_char_id === assigned_char_id
    );
    if (alreadyBusy) {
      addEventLog(`⚠️ ${charName} уже исполняет приказ.`, 'warning');
      return null;
    }
  }

  // Качество: для правителя — из личной власти
  let quality;
  if (isRulerLed) {
    const pp = nation.government?.ruler?.personal_power ?? 60;
    quality = Math.min(100, Math.max(20, Math.round(pp * 1.05)));
  } else {
    quality = calcOrderQuality(char, typeDef.skill, oversight, nation);
  }

  const id = `ORD_${String(_orderIdCounter++).padStart(4, '0')}`;

  const order = {
    id,
    type,
    label:            typeDef.label,
    target_id,
    target_label:     target_label ?? target_id ?? '—',
    assigned_char_id,
    assigned_char_name: charName,
    is_ruler_led:     isRulerLed,
    army_id:          army_id ?? null,
    issued_turn:      GAME_STATE.turn,
    duration:         typeDef.duration,
    progress:         0,
    ruler_oversight:  isRulerLed ? 'personal' : oversight,
    notes,
    status:           'active',
    expected_quality: quality,
    result_quality:   null,
    result_text:      null,
  };

  GAME_STATE.orders.push(order);

  // Военный поход: привязываем командира к армии
  if (type === 'military_campaign' && army_id) {
    const army = typeof getArmy === 'function' ? getArmy(army_id) : null;
    if (army) {
      army.commander_id     = isRulerLed ? 'ruler' : assigned_char_id;
      army._campaign_order  = id;  // обратная ссылка для UI
    }
  }

  addEventLog(
    `📋 Приказ выдан: ${typeDef.label} → ${charName} (ожидаемое качество: ${quality}/100)`,
    'character'
  );

  return order;
}

// ──────────────────────────────────────────────────────────────────────
// ОТМЕНА ПРИКАЗА
// ──────────────────────────────────────────────────────────────────────

function cancelOrder(orderId) {
  if (!GAME_STATE.orders) return;
  const order = GAME_STATE.orders.find(o => o.id === orderId);
  if (!order || order.status !== 'active') return;
  order.status = 'cancelled';
  // Освобождаем командира армии
  if (order.type === 'military_campaign' && order.army_id) {
    const army = typeof getArmy === 'function' ? getArmy(order.army_id) : null;
    if (army) { army.commander_id = null; army._campaign_order = null; }
  }
  addEventLog(`❌ Приказ ${order.label} отменён.`, 'warning');
}

// ──────────────────────────────────────────────────────────────────────
// ОБРАБОТКА ХОДА — прогресс всех активных приказов
// ──────────────────────────────────────────────────────────────────────

function processAllOrders() {
  if (!GAME_STATE.orders || !GAME_STATE.orders.length) return;

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (!nation) return;

  for (const order of GAME_STATE.orders) {
    if (order.status !== 'active') continue;
    // НПЦ-командир военного похода: автоматически двигает армию к цели
    if (order.type === 'military_campaign' && order.army_id && !order.is_ruler_led) {
      _processNpcCommanderMove(order);
    }
    _progressOrder(order, nation);
  }
}

/**
 * Тактический ИИ командующего — вызывается каждый ход для армий с НПЦ-командиром.
 * Использует Groq Llama через commander_ai.js; падает на эвристику без ключа.
 */
function _processNpcCommanderMove(order) {
  if (typeof getArmy !== 'function' || typeof orderArmyMove !== 'function') return;
  const army = getArmy(order.army_id);
  if (!army || army.state === 'disbanded') return;

  // Получаем тактическое решение (кэш прошлого хода или эвристика)
  const decision = typeof getCommanderDecisionNow === 'function'
    ? getCommanderDecisionNow(army, order)
    : _legacyMove(army, order);

  if (!decision) return;
  _applyCommanderDecision(army, decision);
}

/**
 * Применяет тактическое решение командующего к армии.
 */
function _applyCommanderDecision(army, decision) {
  const char    = typeof getArmyCommander === 'function' ? getArmyCommander(army) : null;
  const cmdName = char?.name ?? 'Командующий';

  switch (decision.action) {

    case 'move': {
      if (!decision.target_id) break;
      if (army.state === 'moving' && army.target === decision.target_id) break; // уже идём туда
      if (army.state === 'sieging') break;
      const path = orderArmyMove(army.id, decision.target_id);
      if (path && path.length >= 2) {
        const tName = GAME_STATE.regions?.[decision.target_id]?.name ?? decision.target_id;
        if (typeof addEventLog === 'function')
          addEventLog(`🗺 ${cmdName}: «${decision.reasoning}» → ${tName}`, 'military');
      }
      break;
    }

    case 'storm': {
      if (!army.siege_id) break;
      const siege = (GAME_STATE.sieges ?? []).find(s => s.id === army.siege_id);
      if (siege?.storm_possible && typeof stormAssault === 'function') {
        stormAssault(army.id, army.siege_id);
        if (typeof addEventLog === 'function')
          addEventLog(`⚔️ ${cmdName}: «${decision.reasoning}» → ШТУРМ!`, 'danger');
      }
      break;
    }

    case 'retreat': {
      if (!decision.target_id || army.state === 'sieging') break;
      const path = orderArmyMove(army.id, decision.target_id);
      if (path && path.length >= 2) {
        const tName = GAME_STATE.regions?.[decision.target_id]?.name ?? decision.target_id;
        if (typeof addEventLog === 'function')
          addEventLog(`🏃 ${cmdName}: «${decision.reasoning}» ← отступление на ${tName}`, 'warning');
      }
      break;
    }

    case 'hold':
      // Ускоренное восстановление: +5 морали и -5 усталости при удержании
      if (army.morale < 100) army.morale    = Math.min(100, army.morale    + 5);
      if (army.fatigue > 0)  army.fatigue   = Math.max(0,   army.fatigue   - 5);
      if (typeof addEventLog === 'function' && decision.reasoning)
        addEventLog(`⛺ ${cmdName}: «${decision.reasoning}»`, 'military');
      break;

    case 'siege':
      // Осада продолжается автоматически через processSiegeTicks() — ничего делать не надо
      break;

    case 'ambush':
      // MIL_007: засада — армия остаётся на месте, ambush_set уже выставлен в utilityAIDecide
      army.state = 'stationed';
      if (typeof addEventLog === 'function')
        addEventLog(`🪤 ${cmdName}: «${decision.reasoning}» — засада готова!`, 'military');
      break;
  }
}

/** Устаревший fallback (без commander_ai.js) */
function _legacyMove(army, order) {
  if (army.state === 'moving' && army.target) return null;
  if (!order.target_id) return null;
  const tNation = GAME_STATE.nations?.[order.target_id];
  const tRegion = tNation ? (tNation.regions ?? [])[0] : order.target_id;
  if (tRegion && army.position !== tRegion) return { action: 'move', target_id: tRegion, reasoning: '' };
  return null;
}

function _progressOrder(order, nation) {
  order.progress = Math.min(100, order.progress + Math.round(100 / order.duration));

  if (order.progress >= 100) {
    _completeOrder(order, nation);
  } else {
    // Промежуточные события
    _checkMidOrderEvents(order, nation);
  }
}

function _completeOrder(order, nation) {
  const typeDef = ORDER_TYPES[order.type];
  if (!typeDef) { order.status = 'completed'; return; }

  // Правитель лично — нет персонажа в массиве characters
  const char = order.is_ruler_led
    ? null
    : (nation.characters ?? []).find(c => c.id === order.assigned_char_id);
  if (!order.is_ruler_led && !char) { order.status = 'completed'; return; }

  // Освобождаем командира армии при завершении похода
  if (order.type === 'military_campaign' && order.army_id) {
    const army = typeof getArmy === 'function' ? getArmy(order.army_id) : null;
    if (army) { army.commander_id = null; army._campaign_order = null; }
  }

  // Финальное качество с небольшим случайным отклонением (±10)
  const jitter = Math.round((Math.random() - 0.5) * 20);
  const finalQuality = Math.min(100, Math.max(0, (order.expected_quality ?? 50) + jitter));
  order.result_quality = finalQuality;
  order.status = 'completed';

  // Применяем игровые эффекты
  const resultText = _applyOrderEffects(order, finalQuality, char, nation);
  order.result_text = resultText;

  // Лояльность: успешное выполнение поднимает лояльность (только у НПЦ)
  if (char) {
    if (finalQuality >= 70) {
      char.traits.loyalty = Math.min(100, (char.traits.loyalty ?? 50) + 4);
    } else if (finalQuality < 40) {
      char.traits.loyalty = Math.max(0, (char.traits.loyalty ?? 50) - 3);
    }
    (char.history ?? (char.history = [])).push({
      turn:  GAME_STATE.turn,
      event: `Исполнил приказ «${order.label}» (качество: ${finalQuality}/100). ${resultText}`,
    });
  }

  const qualLabel = finalQuality >= 80 ? '🏆 Блестяще' :
                    finalQuality >= 60 ? '✅ Хорошо' :
                    finalQuality >= 40 ? '⚠️ Посредственно' : '❌ Провал';
  const execName = char?.name ?? order.assigned_char_name ?? 'Правитель';
  addEventLog(
    `${qualLabel}: ${execName} завершил «${order.label}». ${resultText}`,
    finalQuality >= 60 ? 'good' : finalQuality >= 40 ? 'warning' : 'danger'
  );
}

// ──────────────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ЭФФЕКТОВ ВЫПОЛНЕННОГО ПРИКАЗА
// ──────────────────────────────────────────────────────────────────────

function _applyOrderEffects(order, quality, char, nation) {
  const qf = quality / 100;   // 0–1

  switch (order.type) {
    case 'military_campaign': {
      // Качественный поход → бонус к боевому духу и лояльности армии
      const moraleDelta = Math.round((qf - 0.5) * 20);  // -10 .. +10
      nation.military.morale  = Math.min(100, Math.max(0, (nation.military.morale  ?? 60) + moraleDelta));
      nation.military.loyalty = Math.min(100, Math.max(0, (nation.military.loyalty ?? 60) + Math.round(moraleDelta * 0.5)));
      if (quality >= 70) {
        return `Армия вернулась с победой. Боевой дух +${moraleDelta}.`;
      } else if (quality >= 40) {
        return `Поход завершён без решающего успеха.`;
      } else {
        return `Армия понесла потери. Боевой дух ${moraleDelta}.`;
      }
    }

    case 'administrative_reform': {
      // Реформа → стабильность и легитимность
      const stabDelta = Math.round((qf - 0.5) * 10);
      const legDelta  = Math.round((qf - 0.5) * 6);
      nation.government.stability  = Math.min(100, Math.max(0, (nation.government.stability  ?? 50) + stabDelta));
      nation.government.legitimacy = Math.min(100, Math.max(0, (nation.government.legitimacy ?? 50) + legDelta));
      if (quality >= 70) {
        return `Реформа прошла успешно. Стабильность +${stabDelta}, легитимность +${legDelta}.`;
      } else if (quality >= 40) {
        return `Реформа частично реализована.`;
      } else {
        return `Реформа вызвала недовольство. Стабильность ${stabDelta}.`;
      }
    }

    case 'diplomatic_mission': {
      // Успех → дипломатические очки с целью
      if (order.target_id && typeof DiplomacyEngine !== 'undefined') {
        const scoreDelta = Math.round((qf - 0.5) * 40);  // -20 .. +20
        const rel = DiplomacyEngine.getRelation(GAME_STATE.player_nation, order.target_id);
        if (rel) {
          rel.score = Math.min(100, Math.max(-100, (rel.score ?? 0) + scoreDelta));
        }
        if (quality >= 70) {
          return `Миссия успешна. Отношения с ${order.target_label} улучшились на ${scoreDelta} очков.`;
        } else if (quality >= 40) {
          return `Переговоры не дали результата.`;
        } else {
          return `Посол провалил миссию. Отношения ухудшились на ${Math.abs(scoreDelta)} очков.`;
        }
      }
      return quality >= 60 ? 'Дипломатическая миссия выполнена.' : 'Миссия не принесла плодов.';
    }

    case 'govern_region': {
      // Управление провинцией → счастье, стабильность, разовый налоговый бонус
      const happyDelta  = Math.round((qf - 0.5) * 10);
      const stabDelta   = Math.round((qf - 0.5) * 6);

      nation.population.happiness = Math.min(100, Math.max(0,
        (nation.population.happiness ?? 50) + happyDelta
      ));
      nation.government.stability = Math.min(100, Math.max(0,
        (nation.government.stability ?? 50) + stabDelta
      ));

      // Разовый налоговый доход от хорошо управляемой провинции
      if (quality >= 50) {
        const incomeBonus = Math.round(qf * 300);
        nation.economy.treasury = (nation.economy.treasury ?? 0) + incomeBonus;
        if (quality >= 70) {
          return `Провинция процветает под управлением наместника. Стабильность +${stabDelta}, счастье +${happyDelta}, налоги +${incomeBonus} монет.`;
        }
        return `Управление провинцией удовлетворительное. Стабильность +${stabDelta}, счастье +${happyDelta}.`;
      } else {
        // Наместник злоупотребляет — крадёт из казны
        const stolen = Math.round(300 * (0.5 - qf));
        nation.economy.treasury = Math.max(0, (nation.economy.treasury ?? 0) - stolen);
        char.resources = char.resources ?? {};
        char.resources.gold = (char.resources.gold ?? 0) + stolen;
        return `Наместник злоупотребляет положением. Счастье ${happyDelta}, стабильность ${stabDelta}. Похищено ${stolen} монет из казны.`;
      }
    }

    case 'economic_project': {
      // Экономический проект: наместник строит здание в целевом регионе
      // за счёт государственной казны (не более 30% наличных средств).
      // Устраняет один дефицитный товар. Строит 1 тип здания, до 5 уровней.

      const regionId = order.target_id;
      const region   = regionId ? GAME_STATE.regions[regionId] : null;
      if (!region) {
        return 'Экономический проект: регион не указан или данные недоступны.';
      }

      // 1. Определяем дефицитный товар
      const deficitGood = _findDeficitGood(nation);
      if (!deficitGood) {
        // Дефицита нет — строим наиболее востребованное здание по доходности
        return 'Проект завершён: серьёзных дефицитов не обнаружено. Казначей оптимизировал существующее производство.';
      }

      // 2. Находим подходящее здание для региона
      const buildingId = _findBuildingForGood(deficitGood, region);
      if (!buildingId) {
        const gName = typeof GOODS !== 'undefined' ? (GOODS[deficitGood]?.name ?? deficitGood) : deficitGood;
        return `Проект: нет подходящего здания для «${gName}» в данном регионе (несовместимая местность).`;
      }

      const bDef       = BUILDINGS[buildingId];
      const costPerLvl = calcConstructionCost(buildingId) || (bDef.cost ?? 200);

      // 3. Бюджет ≤ 30% казны
      const budget = Math.floor((nation.economy.treasury ?? 0) * 0.3);
      if (budget < costPerLvl) {
        return `Проект: недостаточно средств. Нужно ${costPerLvl} монет, бюджет 30% казны = ${budget} монет.`;
      }

      // 4. Сколько уровней строим (1-5, с учётом качества и бюджета)
      const maxByBudget  = Math.min(5, Math.floor(budget / costPerLvl));
      const maxByQuality = Math.max(1, Math.round(maxByBudget * qf));

      // Проверяем существующий слот
      const existingSlot = (region.building_slots || [])
        .find(s => s.building_id === buildingId && s.status !== 'demolished');
      const currentLevel = existingSlot ? (existingSlot.level || 1) : 0;
      // max_level теперь null = без ограничений; бюджет и качество — единственный лимит
      const levelsToAdd  = maxByQuality;

      if (levelsToAdd <= 0) {
        const rName = MAP_REGIONS?.[regionId]?.name ?? regionId;
        return `Проект: недостаточно бюджета для строительства ${bDef.name} в ${rName}.`;
      }

      const totalCost  = levelsToAdd * costPerLvl;
      const finalLevel = currentLevel + levelsToAdd;

      // 5. Применяем: меняем слот напрямую (проект выполнен за время приказа)
      if (existingSlot) {
        existingSlot.level = finalLevel;
      } else {
        region.building_slots = region.building_slots || [];
        region.building_slots.push({
          slot_id:      `${regionId}_ep_${buildingId}_t${GAME_STATE.turn}`,
          building_id:  buildingId,
          status:       'active',
          level:        finalLevel,
          workers:      {},
          founded_turn: GAME_STATE.turn,
          revenue:      0,
          wages_paid:   0,
          owner:        'nation',
        });
      }
      nation.economy.treasury = Math.max(0, (nation.economy.treasury ?? 0) - totalCost);

      const rName   = MAP_REGIONS?.[regionId]?.name ?? regionId;
      const gName   = typeof GOODS !== 'undefined' ? (GOODS[deficitGood]?.name ?? deficitGood) : deficitGood;
      const lvlWord = finalLevel === 1 ? 'построено' : `расширено до уровня ${finalLevel}`;

      if (quality >= 70) {
        return `${bDef.icon ?? ''} ${bDef.name} ${lvlWord} в ${rName}. Устраняет дефицит «${gName}». Потрачено ${totalCost} монет.`;
      } else if (quality >= 40) {
        return `${bDef.name} ${lvlWord} в ${rName} (качество среднее). Потрачено ${totalCost} монет.`;
      } else {
        // Плохое качество: построено меньше, часть денег потрачена впустую
        return `${bDef.name} ${lvlWord} в ${rName}, но строительство велось неэффективно. Потрачено ${totalCost} монет.`;
      }
    }

    default:
      return 'Приказ выполнен.';
  }
}

// ──────────────────────────────────────────────────────────────────────
// ПРОМЕЖУТОЧНЫЕ СОБЫТИЯ (например, предательство на полпути)
// ──────────────────────────────────────────────────────────────────────

function _checkMidOrderEvents(order, nation) {
  const char = (nation.characters ?? []).find(c => c.id === order.assigned_char_id);
  if (!char) return;

  const loyalty = char.traits?.loyalty ?? 50;

  // Шанс предательства при низкой лояльности (только для военных)
  if (order.type === 'military_campaign' && loyalty < 25
      && !order._betrayal_checked && order.progress >= Math.round(100 / order.duration * 2)) {
    order._betrayal_checked = true;
    if (Math.random() < 0.3) {
      order.status = 'failed';
      order.result_quality = 0;
      order.result_text = `${char.name} перешёл на сторону врага!`;
      char.traits.loyalty = Math.max(0, loyalty - 20);
      addEventLog(`⚔️ Предательство! ${char.name} дезертировал во время похода!`, 'danger');
    }
  }

  // Случайное досрочное завершение при отличном навыке (10% шанс)
  if (order.expected_quality >= 85 && order.progress >= 60 && Math.random() < 0.10) {
    order.progress = 100;
    _completeOrder(order, nation);
  }
}

// ──────────────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────────────────────────────

/**
 * Возвращает список персонажей, подходящих для данного типа приказа.
 */
function getEligibleChars(nationId, orderType) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return [];
  const typeDef = ORDER_TYPES[orderType];
  if (!typeDef) return [];

  const busyIds = new Set(
    (GAME_STATE.orders ?? [])
      .filter(o => o.status === 'active')
      .map(o => o.assigned_char_id)
  );

  return (nation.characters ?? []).filter(c => {
    if (!c.alive) return false;
    if (busyIds.has(c.id)) return false;
    // Роль подходит?
    const roleOk = typeDef.role_needed.some(r =>
      (c.role ?? '').toLowerCase().includes(r)
    );
    // Если нет подходящей роли — всё равно разрешаем (но с пометкой)
    return true; // roleOk is cosmetic for now, allow any alive char
  });
}

/**
 * Возвращает активные приказы игрока.
 */
function getActiveOrders() {
  return (GAME_STATE.orders ?? []).filter(o => o.status === 'active');
}

/**
 * Возвращает завершённые приказы (последние N).
 */
function getRecentCompletedOrders(n = 5) {
  return (GAME_STATE.orders ?? [])
    .filter(o => o.status === 'completed' || o.status === 'failed')
    .slice(-n)
    .reverse();
}

/**
 * Метка роли персонажа (для отображения пригодности).
 */
function getOrderRoleMatch(char, orderType) {
  const typeDef = ORDER_TYPES[orderType];
  if (!typeDef) return '—';
  const roleOk = typeDef.role_needed.some(r =>
    (char.role ?? '').toLowerCase().includes(r)
  );
  return roleOk ? '✅ Подходит' : '⚠️ Не профиль';
}

/**
 * Инициализирует GAME_STATE.orders если отсутствует.
 */
function initOrders() {
  if (!GAME_STATE.orders) GAME_STATE.orders = [];
}

// ──────────────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ЭКОНОМИЧЕСКОГО ПРОЕКТА
// ──────────────────────────────────────────────────────────────────────

/**
 * Находит наиболее дефицитный товар в запасах нации.
 * Приоритет: wheat > timber > salt > tools > cloth > iron > wine > fish
 * Возвращает строку-ключ товара или null если дефицита нет.
 */
function _findDeficitGood(nation) {
  const stockpile = nation?.economy?.stockpile ?? {};
  const PRIORITY = ['wheat', 'timber', 'salt', 'tools', 'cloth', 'iron', 'wine', 'fish',
                    'wool', 'leather', 'olive_oil', 'pottery', 'bronze', 'trade_goods'];

  // Сначала ищем товары с нулевым или очень низким запасом (< 50)
  for (const good of PRIORITY) {
    const qty = stockpile[good] ?? 0;
    if (qty < 50) return good;
  }

  // Если явного нуля нет — берём товар с наименьшим запасом среди приоритетных
  let minGood = null, minQty = Infinity;
  for (const good of PRIORITY) {
    const qty = stockpile[good] ?? 0;
    if (qty < minQty) { minQty = qty; minGood = good; }
  }
  // Считаем дефицитом если ниже 200
  return (minQty < 200) ? minGood : null;
}

/**
 * Находит здание, производящее указанный товар и совместимое с регионом.
 * Возвращает buildingId или null.
 */
function _findBuildingForGood(good, region) {
  if (!good || typeof BUILDINGS === 'undefined') return null;

  const candidates = [];
  for (const [bid, bDef] of Object.entries(BUILDINGS)) {
    if (!bDef.nation_buildable) continue;
    const outputs = bDef.production_output ?? [];
    const produces = outputs.some(o => o.good === good);
    if (!produces) continue;
    // Проверяем совместимость с регионом
    const check = typeof canBuildInRegion === 'function' ? canBuildInRegion(bid, region) : { ok: true };
    if (check.ok || check.is_upgrade) candidates.push(bid);
  }

  if (candidates.length === 0) return null;

  // Предпочитаем здание, которое уже строится/существует в регионе
  const existing = (region.building_slots ?? []).map(s => s.building_id);
  for (const bid of candidates) {
    if (existing.includes(bid)) return bid;
  }
  return candidates[0];
}
