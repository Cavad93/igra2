// ══════════════════════════════════════════════════════════════════════════════
// WAR SCORE ENGINE — система очков войны
//
// Очки войны (WS) отражают военные успехи в конкретном конфликте.
// Сторона с бо́льшим WS вправе требовать более тяжёлые условия мира.
//
// GAME_STATE.wars[] = [{
//   id, attacker, defender,
//   attacker_score, defender_score,
//   started_turn, status('active'|'ended'),
//   events: [{type, nation, amount, turn, notes}]
// }]
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Конфигурация ──────────────────────────────────────────────────────────────

const WAR_SCORE_CFG = {
  // Полевые сражения
  BATTLE_BASE:        5,   // базовые очки за победу
  BATTLE_PER_ENEMY:   200, // 1 очко за каждые N уничтоженных врагов
  BATTLE_MAX:         30,  // максимум очков за одно сражение

  // Осады
  SIEGE_BASE:         8,
  SIEGE_PER_LEVEL:    4,   // бонус за уровень крепости
  SIEGE_MAX:          26,

  // Захват регионов
  CAPTURE_BASE:       5,
  CAPTURE_PER_10K:    1,   // очко за каждые 10 000 жителей
  CAPTURE_MAX:        22,
  CAPITAL_CAPTURE:    50,  // MIL_010: бонус за захват столицы

  // Морские сражения
  NAVAL_BASE:         6,
  NAVAL_PER_10_SHIPS: 3,
  NAVAL_MAX:          24,

  // Блокада порта (за ход, за уровень)
  BLOCKADE_PER_LEVEL: 3,
  BLOCKADE_MAX_TURN:  12,  // не более N очков за ход со всех блокад

  // Удержание вражеских территорий (за ход)
  HOLD_PER_REGION:    1,
  HOLD_MAX_TURN:      8,

  // Стоимость условий мирного договора в очках войны
  PEACE_PROVINCE_BASE:    8,   // за одну провинцию
  PEACE_PROVINCE_PER_10K: 1,   // за каждые 10 000 жителей
  PEACE_PROVINCE_MAX:     22,  // максимальная стоимость одной провинции
  PEACE_VASSALIZE:        30,
  PEACE_REP_60:           10,  // 5 лет репараций
  PEACE_REP_120:          18,  // 10 лет репараций
  PEACE_ARMISTICE:        0,   // перемирие — бесплатно
};

// ── Инициализация ─────────────────────────────────────────────────────────────

function ensureWarsArray() {
  if (!GAME_STATE.wars) GAME_STATE.wars = [];
  return GAME_STATE.wars;
}

// ── Создание / завершение войны ───────────────────────────────────────────────

/**
 * Создаёт запись войны при объявлении.
 * Вызывается из DiplomacyEngine.declareWar().
 */
function initWar(attackerNationId, defenderNationId) {
  ensureWarsArray();
  // Проверяем, нет ли уже активной войны между ними
  if (getActiveWar(attackerNationId, defenderNationId)) return;

  const war = {
    id:              `war_${attackerNationId}_${defenderNationId}_t${GAME_STATE.turn ?? 1}`,
    attacker:        attackerNationId,
    defender:        defenderNationId,
    attacker_score:  0,
    defender_score:  0,
    started_turn:    GAME_STATE.turn ?? 1,
    status:          'active',
    events:          [],
    // Блокированные порты: regionId → blockading_nation_id
    blockaded_ports: {},
  };
  GAME_STATE.wars.push(war);
  return war;
}

/**
 * Завершает войну (мир, капитуляция).
 */
function endWar(nationA, nationB) {
  const war = getActiveWar(nationA, nationB);
  if (!war) return;
  war.status     = 'ended';
  war.ended_turn = GAME_STATE.turn ?? 1;
  // Сбрасываем блокады
  war.blockaded_ports = {};
}

/**
 * Получить активную войну между двумя нациями (или null).
 */
function getActiveWar(nationA, nationB) {
  return (GAME_STATE.wars ?? []).find(w =>
    w.status === 'active' &&
    ((w.attacker === nationA && w.defender === nationB) ||
     (w.attacker === nationB && w.defender === nationA))
  ) ?? null;
}

// ── Начисление очков ──────────────────────────────────────────────────────────

/**
 * Добавить очки войны нации в конфликте с противником.
 * @param {string} nation      — кому начисляем
 * @param {string} opponent    — противник (для нахождения войны)
 * @param {number} amount      — очки (> 0)
 * @param {string} reason      — 'battle' | 'siege' | 'capture' | 'naval' | 'blockade' | 'hold'
 * @param {string} [notes]     — доп. описание
 */
function addWarScore(nation, opponent, amount, reason, notes) {
  if (amount <= 0) return;
  const war = getActiveWar(nation, opponent);
  if (!war) return;

  const isAttacker = war.attacker === nation;
  if (isAttacker) war.attacker_score += amount;
  else            war.defender_score += amount;

  war.events.push({
    type:    reason,
    nation,
    amount,
    turn:    GAME_STATE.turn ?? 1,
    notes:   notes ?? '',
  });
}

/**
 * Получить очки войны игрока и противника.
 * @returns {{ player: number, opponent: number, war: object|null }}
 */
function getWarScore(playerNationId, opponentNationId) {
  const war = getActiveWar(playerNationId, opponentNationId);
  if (!war) return { player: 0, opponent: 0, war: null };
  const isAttacker = war.attacker === playerNationId;
  return {
    player:   isAttacker ? war.attacker_score : war.defender_score,
    opponent: isAttacker ? war.defender_score : war.attacker_score,
    war,
  };
}

// ── Стоимость условий мирного договора ───────────────────────────────────────

/**
 * Рассчитать суммарную стоимость условий мирного договора в очках войны.
 * @param {Object} terms — { ceded_regions: string[], vassalize: bool, reparations_turns: number }
 * @returns {{ total: number, breakdown: [{label, cost}] }}
 */
function calcPeaceTermsCost(terms) {
  const cfg       = WAR_SCORE_CFG;
  const breakdown = [];
  let   total     = 0;

  // Провинции
  for (const regionId of (terms.ceded_regions ?? [])) {
    const region = GAME_STATE.regions?.[regionId];
    const pop    = region?.population?.total ?? region?.population ?? 0;
    const cost   = Math.min(cfg.PEACE_PROVINCE_MAX,
      cfg.PEACE_PROVINCE_BASE + Math.floor(pop / 10_000) * cfg.PEACE_PROVINCE_PER_10K
    );
    breakdown.push({ label: region?.name ?? regionId, cost });
    total += cost;
  }

  // Вассалитет
  if (terms.vassalize) {
    breakdown.push({ label: 'Вассализация', cost: cfg.PEACE_VASSALIZE });
    total += cfg.PEACE_VASSALIZE;
  }

  // Репарации
  if ((terms.reparations_turns ?? 0) >= 120) {
    breakdown.push({ label: 'Репарации 10 лет', cost: cfg.PEACE_REP_120 });
    total += cfg.PEACE_REP_120;
  } else if ((terms.reparations_turns ?? 0) >= 60) {
    breakdown.push({ label: 'Репарации 5 лет', cost: cfg.PEACE_REP_60 });
    total += cfg.PEACE_REP_60;
  }

  // Перемирие — бесплатно
  if (terms.armistice_turns) {
    breakdown.push({ label: 'Перемирие', cost: 0 });
  }

  return { total, breakdown };
}

// ── Подключение к боевым системам ────────────────────────────────────────────

/** Вызывается из combat.js после полевого сражения. */
function onBattleResult(winnerNationId, loserNationId, enemyCasualties, capturedRegionId) {
  const cfg    = WAR_SCORE_CFG;
  let   amount = Math.min(cfg.BATTLE_MAX,
    cfg.BATTLE_BASE + Math.floor((enemyCasualties ?? 0) / cfg.BATTLE_PER_ENEMY)
  );
  let reasonSuffix = '';
  if (capturedRegionId) {
    const region = GAME_STATE.regions?.[capturedRegionId];
    const pop    = region?.population?.total ?? region?.population ?? 0;
    const capBonus = Math.min(cfg.CAPTURE_MAX,
      cfg.CAPTURE_BASE + Math.floor(pop / 10_000) * cfg.CAPTURE_PER_10K
    );
    amount += capBonus;
    reasonSuffix = ', регион захвачен';
    // MIL_010: бонус за захват столицы (+50)
    const isCapital = region?.is_capital ||
      Object.values(GAME_STATE.nations ?? {}).some(n => n.capital === capturedRegionId);
    if (isCapital) {
      amount += cfg.CAPITAL_CAPTURE;
      reasonSuffix = ', СТОЛИЦА ЗАХВАЧЕНА';
    }
  }
  addWarScore(winnerNationId, loserNationId, amount,
    capturedRegionId ? 'battle+capture' : 'battle',
    `Потери врага: ${enemyCasualties ?? 0}${reasonSuffix}`);
}

/** Вызывается из siege.js при взятии крепости. */
function onSiegeComplete(winnerNationId, loserNationId, fortressLevel) {
  const cfg    = WAR_SCORE_CFG;
  const amount = Math.min(cfg.SIEGE_MAX,
    cfg.SIEGE_BASE + (fortressLevel ?? 1) * cfg.SIEGE_PER_LEVEL
  );
  addWarScore(winnerNationId, loserNationId, amount, 'siege',
    `Крепость ур.${fortressLevel ?? 1} взята`);
}

/** Вызывается из combat.js при морском сражении. */
function onNavalBattle(winnerNationId, loserNationId, enemyShipsLost) {
  const cfg    = WAR_SCORE_CFG;
  const amount = Math.min(cfg.NAVAL_MAX,
    cfg.NAVAL_BASE + Math.floor((enemyShipsLost ?? 0) / 10) * cfg.NAVAL_PER_10_SHIPS
  );
  addWarScore(winnerNationId, loserNationId, amount, 'naval',
    `Потоплено кораблей: ${enemyShipsLost ?? 0}`);
}

// ── Блокада портов ────────────────────────────────────────────────────────────

/**
 * Проверяет флоты и регистрирует/обновляет блокады портов.
 * Вызывается в начале каждого хода перед экономическим расчётом.
 */
function processBlockadeTick() {
  ensureWarsArray();
  const armies = GAME_STATE.armies ?? [];
  const turn   = GAME_STATE.turn ?? 1;

  // Сброс блокад предыдущего хода
  for (const war of GAME_STATE.wars) {
    if (war.status !== 'active') continue;
    war.blockaded_ports = {};
  }

  let totalScoreByNation = {}; // nationId → очков за блокаду за этот ход

  for (const fleet of armies) {
    if (fleet.state === 'disbanded' || fleet.type !== 'naval') continue;

    const region = GAME_STATE.regions?.[fleet.position];
    if (!region || region.nation === fleet.nation) continue; // только во вражеских регионах

    const war = getActiveWar(fleet.nation, region.nation);
    if (!war) continue;

    // Проверяем наличие порта в регионе
    const slots     = region.building_slots ?? [];
    let   portLevel = 0;
    for (const slot of slots) {
      if (slot.status !== 'active') continue;
      if (slot.building === 'port' || slot.building === 'military_port') {
        portLevel += (slot.level ?? 1);
      }
    }
    if (portLevel === 0) continue; // нет порта — нет блокады

    // Регистрируем блокаду
    war.blockaded_ports[fleet.position] = fleet.nation;
    region._blockaded_by = fleet.nation;
    region._blockade_turn = turn;

    // Начисляем очки
    if (!totalScoreByNation[fleet.nation]) totalScoreByNation[fleet.nation] = 0;
    const remaining = WAR_SCORE_CFG.BLOCKADE_MAX_TURN - totalScoreByNation[fleet.nation];
    if (remaining > 0) {
      const gain = Math.min(remaining, WAR_SCORE_CFG.BLOCKADE_PER_LEVEL * portLevel);
      addWarScore(fleet.nation, region.nation, gain, 'blockade',
        `Блокада ${region.name ?? fleet.position} (порт ур.${portLevel})`);
      totalScoreByNation[fleet.nation] = (totalScoreByNation[fleet.nation] ?? 0) + gain;
    }

    // Экономический эффект блокады: снижаем доход порта
    if (region.economy) {
      region.economy._blockade_penalty = 0.5; // −50% к торговому доходу
    }
  }

  // Снимаем блокады там, где флот ушёл
  for (const region of Object.values(GAME_STATE.regions ?? {})) {
    if (region._blockade_turn && region._blockade_turn < turn) {
      delete region._blockaded_by;
      delete region._blockade_turn;
      if (region.economy) delete region.economy._blockade_penalty;
    }
  }
}

/**
 * Начисляет очки за удержание вражеских территорий (за ход).
 */
function processHoldingTick() {
  ensureWarsArray();
  const activeWars = GAME_STATE.wars.filter(w => w.status === 'active');
  if (!activeWars.length) return;

  // Собираем какие регионы кем захвачены
  const regions = Object.values(GAME_STATE.regions ?? {});
  for (const war of activeWars) {
    let atkHeld = 0, defHeld = 0;

    for (const region of regions) {
      // Регион принадлежит атакующему, но изначально был вражеским
      if (region.nation === war.attacker && region._conquest_turn) {
        // Был захвачен от защитника
        atkHeld++;
      }
      if (region.nation === war.defender && region._conquest_turn) {
        defHeld++;
      }
    }

    const cfg = WAR_SCORE_CFG;
    const atkHoldScore = Math.min(cfg.HOLD_MAX_TURN, atkHeld * cfg.HOLD_PER_REGION);
    const defHoldScore = Math.min(cfg.HOLD_MAX_TURN, defHeld * cfg.HOLD_PER_REGION);
    if (atkHoldScore > 0) war.attacker_score += atkHoldScore;
    if (defHoldScore > 0) war.defender_score += defHoldScore;
  }
}

// ── Оценка военного положения ИИ ─────────────────────────────────────────────

/**
 * Оценивает, должна ли ИИ-нация запрашивать мир с игроком.
 * Возвращает { shouldSeekPeace: bool, score: { ai, player }, reason: string }
 */
function evaluateAIWarPosition(aiNationId, playerNationId) {
  const { player: playerScore, opponent: aiScore, war } = getWarScore(playerNationId, aiNationId);
  if (!war) return { shouldSeekPeace: false, score: null };

  // Военная сила нации (суммарно по армиям)
  const armies  = GAME_STATE.armies ?? [];
  const aiForce = armies.reduce((s, a) => {
    if (a.nation !== aiNationId || a.state === 'disbanded') return s;
    return s + (a.units?.infantry ?? 0) + (a.units?.cavalry ?? 0)
              + (a.units?.mercenaries ?? 0);
  }, 0);
  const playerForce = armies.reduce((s, a) => {
    if (a.nation !== playerNationId || a.state === 'disbanded') return s;
    return s + (a.units?.infantry ?? 0) + (a.units?.cavalry ?? 0)
              + (a.units?.mercenaries ?? 0);
  }, 0);

  const scoreGap = playerScore - aiScore;     // >0 = игрок выигрывает
  const forceRatio = aiForce / Math.max(1, playerForce);

  // ИИ готов к миру если:
  // 1. Разрыв в очках > 20 в пользу игрока, или
  // 2. Военная мощь ИИ < 40% от игрока, или
  // 3. Очки ИИ не превышают 10 и прошло > 24 хода с начала войны
  const warLength = (GAME_STATE.turn ?? 1) - (war.started_turn ?? 0);
  const shouldSeekPeace = (
    (scoreGap > 20) ||
    (forceRatio < 0.4 && scoreGap > 0) ||
    (aiScore < 10 && playerScore > 15 && warLength > 24)
  );

  return {
    shouldSeekPeace,
    score:       { ai: aiScore, player: playerScore },
    forceRatio,
    scoreGap,
    warLength,
    reason: shouldSeekPeace
      ? `Военное положение неблагоприятно (очки: ${aiScore} vs ${playerScore}, сила: ${Math.round(forceRatio*100)}%)`
      : `Война продолжается (очки: ${aiScore} vs ${playerScore})`,
  };
}

// ── Утилиты для UI ────────────────────────────────────────────────────────────

/**
 * Возвращает строку-описание военного положения для системного промпта AI.
 */
function getWarContextForAI(aiNationId, playerNationId) {
  const ws = getWarScore(playerNationId, aiNationId);
  if (!ws.war) return '';

  const aiScore     = ws.opponent;
  const playerScore = ws.player;
  const pos         = evaluateAIWarPosition(aiNationId, playerNationId);
  const cfg         = WAR_SCORE_CFG;

  // Считаем стоимость возможных требований противника (всех регионов AI)
  const aiRegions = Object.values(GAME_STATE.regions ?? {}).filter(r => r.nation === aiNationId);
  const totalRegionCost = aiRegions.reduce((s, r) => {
    const pop = r.population?.total ?? r.population ?? 0;
    return s + Math.min(cfg.PEACE_PROVINCE_MAX,
      cfg.PEACE_PROVINCE_BASE + Math.floor(pop / 10_000) * cfg.PEACE_PROVINCE_PER_10K);
  }, 0);

  return `\nВОЕННОЕ ПОЛОЖЕНИЕ:
  Очки войны ${aiNationId}: ${aiScore}
  Очки войны противника (${playerNationId}): ${playerScore}
  Длительность войны: ${pos.warLength ?? 0} ходов
  Военная сила (соотношение): ${pos.forceRatio !== undefined ? Math.round(pos.forceRatio * 100) + '%' : '?'} от сил противника
  Общая стоимость всех регионов для мирного договора: ${totalRegionCost} очков

  Обоснование позиции: ${pos.reason}
  ${pos.shouldSeekPeace
    ? 'РЕКОМЕНДАЦИЯ: Рассмотри возможность мирного договора. Военное положение неблагоприятно.'
    : 'РЕКОМЕНДАЦИЯ: Продолжай войну или требуй выгодных условий.'}

ФОРМАТ ДЛЯ МИРНОГО ДОГОВОРА:
Когда игрок предлагает условия мира или ты хочешь предложить мир — используй JSON:
Если СОГЛАСЕН на мир:
\`\`\`json
{"peace_agreed": true, "peace_terms": {"ceded_regions": [], "vassalize": false, "reparations_turns": 0, "armistice_turns": 60}}
\`\`\`
ceded_regions: список id регионов ТВОЕЙ нации которые ты уступаешь (только если твой WS значительно ниже).
vassalize: true только если очки войны крайне неблагоприятны (ниже 5 против 30+ у противника).
reparations_turns: 0, 60 или 120 ходов.
armistice_turns: всегда 60 (5 лет перемирия).

Если ОТКЛОНЯЕШЬ мир:
\`\`\`json
{"peace_agreed": false, "reason": "краткое объяснение"}
\`\`\`

Если ПРЕДЛАГАЕШЬ свои условия мира (ты требуешь от игрока):
\`\`\`json
{"peace_agreed": "counter", "counter_terms": {"ceded_regions_from_player": [], "reparations_turns": 0}}
\`\`\``;
}

// ── Публичное API ─────────────────────────────────────────────────────────────

const WarScoreEngine = {
  init:        ensureWarsArray,
  initWar,
  endWar,
  getActiveWar,
  addWarScore,
  getWarScore,
  onBattleResult,
  onSiegeComplete,
  onNavalBattle,
  calcPeaceTermsCost,
  processBlockadeTick,
  processHoldingTick,
  evaluateAIWarPosition,
  getWarContextForAI,
  CFG: WAR_SCORE_CFG,
};
