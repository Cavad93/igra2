// engine/treaty_validator.js
// ══════════════════════════════════════════════════════════════════
// СЛОЙ 1: ВАЛИДАЦИЯ ДОГОВОРА
// Запускается ПЕРЕД подписанием; возвращает { ok, blocked, issues[], modified{}, reason }
//
// Три уровня реакции:
//   blocked  — договор полностью отклоняется (контент-фильтр, столица, etc.)
//   issues[] — условия изменены (урезана дань, срок, etc.) — игрок уведомляется
//   ok/warn  — всё в порядке, возможно с предупреждениями
// ══════════════════════════════════════════════════════════════════

'use strict';

// ── Балансовые ограничения ────────────────────────────────────
const TREATY_LIMITS = {
  MAX_TRIBUTE_PCT:          0.25,   // макс. дань 25% дохода вассала
  MAX_REPARATION_TURN_PCT:  0.10,   // макс. контрибуция/ход: 10% казны плательщика
  MAX_REPARATION_TOTAL_PCT: 0.50,   // единовременно: не более 50% казны
  MAX_REGIONS_EXCHANGE:     3,      // передача регионов за раз
  MAX_DURATION:             50,     // макс. срок договора в годах
  MIN_REL_ALLIANCE:         20,     // мин. отношения для оборонного союза
  MIN_REL_MILITARY:         40,     // мин. отношения для военного союза
  MIN_REL_MARRIAGE:         10,     // мин. отношения для брачного союза
};

// ── Контент-фильтр: жёсткие блокировки ───────────────────────
const HARD_BLOCK_PATTERNS = [
  // Сексуальное содержание
  /секс|совокупл|порногр|эротич|проститут|блудниц/i,
  // Экстремизм / реальные геноциды
  /геноцид|истребление всех|уничтожить расу|нацистск|гитлер|холокост/i,
  // Самодеструктивное (суицид лидера, etc.)
  /покончить с собой|суицид правителя/i,
  // Полная капитуляция / передача ВСЕГО
  /передать все регионы|все земли навсегда|весь народ в рабство/i,
];

// В брачном договоре некоторые слова допустимы
const MARRIAGE_WHITELIST_RE = /брак|свадьб|династи|помолвк|наследник/i;

// ── Предупреждения (не блокировки) ───────────────────────────
const WARN_PATTERNS = [
  { re: /вечн|навсегда|бессрочн/i,    msg: 'Договор помечен как бессрочный.' },
  { re: /военн.*пропуск.*любых/i,     msg: 'Неограниченный военный проход — риск для безопасности.' },
  { re: /освободить всех рабов/i,     msg: 'Освобождение рабов сильно снизит экономику.' },
];

// ─────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────────────────────

/**
 * Проверяет договор перед подписанием.
 *
 * @param {object} treaty           — объект договора (type, conditions, parties)
 * @param {string} playerNationId
 * @param {string} aiNationId
 * @returns {{ ok: boolean, blocked: boolean, issues: string[], warnings: string[],
 *             modified: object, reason: string }}
 */
function validateTreaty(treaty, playerNationId, aiNationId) {
  const result = {
    ok:       true,
    blocked:  false,
    issues:   [],
    warnings: [],
    modified: {},   // условия, которые будут изменены
    reason:   '',
  };

  const playerNation = GAME_STATE.nations?.[playerNationId];
  const aiNation     = GAME_STATE.nations?.[aiNationId];

  if (!playerNation || !aiNation) {
    return { ...result, ok: false, blocked: true, reason: 'Нация не найдена в GAME_STATE.' };
  }

  const cond   = treaty.conditions ?? {};
  const tType  = treaty.type ?? 'custom';
  const notes  = String(cond.notes ?? '');

  // ── 1. Контент-фильтр ───────────────────────────────────────
  const isMarriage = tType === 'marriage_alliance';
  for (const re of HARD_BLOCK_PATTERNS) {
    if (re.test(notes)) {
      // Brачный союз — некоторые паттерны допустимы
      if (isMarriage && MARRIAGE_WHITELIST_RE.test(notes)) continue;
      result.blocked = true;
      result.ok      = false;
      result.reason  = 'Условия договора нарушают допустимые нормы и отклонены системой.';
      return result;
    }
  }

  // ── 2. Предупреждения по тексту ─────────────────────────────
  for (const { re, msg } of WARN_PATTERNS) {
    if (re.test(notes)) result.warnings.push(msg);
  }

  // ── 3. Балансовые ограничения ───────────────────────────────

  // 3а. Дань вассала (%)
  if (cond.tribute_pct !== undefined) {
    const max = TREATY_LIMITS.MAX_TRIBUTE_PCT;
    if (cond.tribute_pct > max) {
      result.issues.push(`Дань снижена: ${pct(cond.tribute_pct)} → ${pct(max)} дохода`);
      result.modified.tribute_pct = max;
    }
  }

  // 3б. Контрибуция за ход
  if (cond.reparations_per_turn !== undefined) {
    const payerId  = _validatorPayerOf(treaty, playerNationId);
    const payerNat = GAME_STATE.nations[payerId];
    const maxTurn  = Math.max(50, (payerNat?.economy?.treasury ?? 500) * TREATY_LIMITS.MAX_REPARATION_TURN_PCT);
    if (cond.reparations_per_turn > maxTurn) {
      result.issues.push(`Контрибуция/ход снижена: ${cond.reparations_per_turn} → ${Math.round(maxTurn)} монет`);
      result.modified.reparations_per_turn = Math.round(maxTurn);
    }
  }

  // 3в. Единовременный платёж
  if (cond.one_time_payment !== undefined) {
    const payerId  = _validatorPayerOf(treaty, playerNationId);
    const payerNat = GAME_STATE.nations[payerId];
    const maxOnce  = Math.max(100, (payerNat?.economy?.treasury ?? 1000) * TREATY_LIMITS.MAX_REPARATION_TOTAL_PCT);
    if (cond.one_time_payment > maxOnce) {
      result.issues.push(`Единовременный платёж снижен: ${cond.one_time_payment} → ${Math.round(maxOnce)} монет`);
      result.modified.one_time_payment = Math.round(maxOnce);
    }
  }

  // 3г. Передача регионов
  if (cond.transfer_regions && Array.isArray(cond.transfer_regions)) {
    const capitals = [playerNation.capital, aiNation.capital].filter(Boolean);
    const capFound = cond.transfer_regions.find(r => capitals.includes(r));
    if (capFound) {
      result.blocked = true;
      result.ok      = false;
      result.reason  = `Столичный регион «${capFound}» не может быть передан по договору.`;
      return result;
    }
    const max = TREATY_LIMITS.MAX_REGIONS_EXCHANGE;
    if (cond.transfer_regions.length > max) {
      result.issues.push(`Передача ограничена ${max} регионами (было ${cond.transfer_regions.length})`);
      result.modified.transfer_regions = cond.transfer_regions.slice(0, max);
    }
  }

  // 3д. Срок договора
  if (cond.duration !== null && cond.duration !== undefined) {
    const max = TREATY_LIMITS.MAX_DURATION;
    if (cond.duration > max) {
      result.issues.push(`Срок ограничен ${max} годами (было ${cond.duration})`);
      result.modified.duration = max;
    }
  }

  // ── 4. Требования к отношениям ──────────────────────────────
  const relScore = typeof DiplomacyEngine !== 'undefined'
    ? DiplomacyEngine.getRelationScore(playerNationId, aiNationId) : 0;

  const relReq = {
    defensive_alliance: TREATY_LIMITS.MIN_REL_ALLIANCE,
    military_alliance:  TREATY_LIMITS.MIN_REL_MILITARY,
    marriage_alliance:  TREATY_LIMITS.MIN_REL_MARRIAGE,
  };
  if (relReq[tType] !== undefined && relScore < relReq[tType]) {
    result.warnings.push(
      `Отношения (${relScore}) ниже рекомендуемого минимума для «${TREATY_TYPES?.[tType]?.label ?? tType}» (${relReq[tType]}). ` +
      `Соглашение может быть ненадёжным.`
    );
  }

  // ── 4б. Ставка пошлины и приоритетные товары ────────────────
  // Проверка ставки пошлины
  if (tType === 'trade_agreement' && cond.tariff_rate !== undefined) {
    if (cond.tariff_rate < 0 || cond.tariff_rate > 0.50) {
      result.issues.push('Ставка пошлины скорректирована до допустимого диапазона (0–50%).');
      result.modified.tariff_rate = Math.max(0, Math.min(0.50, cond.tariff_rate));
    }
  }
  // Проверка preferential_goods
  if (Array.isArray(cond.preferential_goods) && cond.preferential_goods.length > 5) {
    result.issues.push('Преимущественное право ограничено 5 товарами.');
    result.modified.preferential_goods = cond.preferential_goods.slice(0, 5);
  }

  // ── 5. Логика vassal: нельзя вассализировать равного ────────
  if (tType === 'vassalage') {
    const popP = playerNation.population?.total ?? 100_000;
    const popA = aiNation.population?.total     ?? 100_000;
    if (popA > popP * 0.7) {
      result.warnings.push('Вассализация более сильной нации маловероятна; AI может отказаться выполнять условия.');
    }
  }

  // ── 6. Нельзя подписать мир без войны ───────────────────────
  if (tType === 'peace_treaty') {
    const atWar = typeof DiplomacyEngine !== 'undefined'
      && DiplomacyEngine.isAtWar(playerNationId, aiNationId);
    if (!atWar) {
      result.warnings.push('Мирный договор подписывается без состояния войны — это допустимо, но необычно.');
    }
  }

  if (result.issues.length > 0) result.ok = true; // изменено, но допустимо
  return result;
}

// ── Вспомогательные ──────────────────────────────────────────
function pct(v) { return `${Math.round(v * 100)}%`; }

/** Определяет, кто платит (для контрибуций) — проигравший = первый подписавший */
function _validatorPayerOf(treaty, playerNationId) {
  // Обычно игрок не платит сам себе; плательщик = не-игрок
  return treaty.parties.find(p => p !== playerNationId) ?? treaty.parties[0];
}

// ── Форматирование результата для UI ─────────────────────────
/**
 * Возвращает человекочитаемое резюме валидации для отображения в UI.
 * @returns {string} HTML-строка
 */
function formatValidationResult(v) {
  if (v.blocked) {
    return `<div class="treaty-val treaty-val--blocked">
      🚫 <strong>Договор отклонён:</strong> ${_escHtmlValidator(v.reason)}
    </div>`;
  }
  const parts = [];
  if (v.issues.length) {
    parts.push(`<div class="treaty-val treaty-val--warn">
      ⚖ <strong>Условия скорректированы системой баланса:</strong><br>
      ${v.issues.map(i => `• ${_escHtmlValidator(i)}`).join('<br>')}
    </div>`);
  }
  if (v.warnings.length) {
    parts.push(`<div class="treaty-val treaty-val--info">
      ℹ ${v.warnings.map(w => _escHtmlValidator(w)).join('<br>ℹ ')}
    </div>`);
  }
  return parts.join('');
}

function _escHtmlValidator(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
