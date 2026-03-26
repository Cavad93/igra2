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
    target_id   = null,
    target_label = null,
    assigned_char_id,
    oversight   = 'direct',
    notes       = '',
  } = opts;

  const typeDef = ORDER_TYPES[type];
  if (!typeDef) return null;

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (!nation) return null;

  const char = (nation.characters ?? []).find(c => c.id === assigned_char_id && c.alive);
  if (!char) return null;

  if (!GAME_STATE.orders) GAME_STATE.orders = [];

  // Проверяем: не занят ли персонаж активным приказом?
  const alreadyBusy = GAME_STATE.orders.some(
    o => o.status === 'active' && o.assigned_char_id === assigned_char_id
  );
  if (alreadyBusy) {
    addEventLog(`⚠️ ${char.name} уже исполняет приказ.`, 'warning');
    return null;
  }

  const quality = calcOrderQuality(char, typeDef.skill, oversight, nation);
  const id = `ORD_${String(_orderIdCounter++).padStart(4, '0')}`;

  const order = {
    id,
    type,
    label:           typeDef.label,
    target_id,
    target_label:    target_label ?? target_id ?? '—',
    assigned_char_id,
    assigned_char_name: char.name,
    issued_turn:     GAME_STATE.turn,
    duration:        typeDef.duration,
    progress:        0,
    ruler_oversight: oversight,
    notes,
    status:          'active',
    expected_quality: quality,
    result_quality:  null,
    result_text:     null,
  };

  GAME_STATE.orders.push(order);

  addEventLog(
    `📋 Приказ выдан: ${typeDef.label} → ${char.name} (ожидаемое качество: ${quality}/100)`,
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
    _progressOrder(order, nation);
  }
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
  const char = (nation.characters ?? []).find(c => c.id === order.assigned_char_id);
  const typeDef = ORDER_TYPES[order.type];
  if (!typeDef || !char) { order.status = 'completed'; return; }

  // Финальное качество с небольшим случайным отклонением (±10)
  const jitter = Math.round((Math.random() - 0.5) * 20);
  const finalQuality = Math.min(100, Math.max(0, (order.expected_quality ?? 50) + jitter));
  order.result_quality = finalQuality;
  order.status = 'completed';

  // Применяем игровые эффекты
  const resultText = _applyOrderEffects(order, finalQuality, char, nation);
  order.result_text = resultText;

  // Лояльность: успешное выполнение поднимает лояльность
  if (finalQuality >= 70) {
    char.traits.loyalty = Math.min(100, (char.traits.loyalty ?? 50) + 4);
  } else if (finalQuality < 40) {
    char.traits.loyalty = Math.max(0, (char.traits.loyalty ?? 50) - 3);
  }

  // Запись в историю персонажа
  (char.history ?? (char.history = [])).push({
    turn:  GAME_STATE.turn,
    event: `Исполнил приказ «${order.label}» (качество: ${finalQuality}/100). ${resultText}`,
  });

  const qualLabel = finalQuality >= 80 ? '🏆 Блестяще' :
                    finalQuality >= 60 ? '✅ Хорошо' :
                    finalQuality >= 40 ? '⚠️ Посредственно' : '❌ Провал';
  addEventLog(
    `${qualLabel}: ${char.name} завершил «${order.label}». ${resultText}`,
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
      // Проект → разовая прибыль
      const bonus = Math.round(qf * 500 * (nation.economy?.tax_rate ?? 0.1) * 100);
      if (quality >= 50) {
        nation.economy.treasury = (nation.economy.treasury ?? 0) + bonus;
        return `Проект принёс ${bonus} монет в казну.`;
      } else {
        // Коррумпированный персонаж украл деньги
        const stolen = Math.round(bonus * 0.4);
        char.resources = char.resources ?? {};
        char.resources.gold = (char.resources.gold ?? 0) + stolen;
        return `Проект провален. Часть средств (${stolen} монет) присвоена исполнителем.`;
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
