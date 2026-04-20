// Главный игровой цикл — один ход = один месяц

import { CONFIG } from '../config.js';
import { _aiPending } from './ai_worker.js';

export let IS_PROCESSING_TURN = false;

// _aiPending, _aiBgRunning — вынесены в engine/ai_worker.js (Этап 50)

// MONTH_NAMES, advanceDate, formatDate, getCurrentSeason, applySeasonVisual,
// updateDateDisplay, updateStele, toRomanYear — вынесены в engine/date.js (Этап 45)

// ──────────────────────────────────────────────────────────────
// Session 9 — верхние границы для журналов/истории (ring buffer).
// Защита от неограниченного роста, когда запись идёт мимо обёртки
// addEventLog (ai/strategic_llm.js, загрузка старых сейвов и т.п.).
// Внутренние обёртки ставят более жёсткие лимиты:
//   ui/log.js       → events_log       = 120 (отображаются последние 12)
//   engine/turn.js  → _turn_summary_history = 24 (2 года)
//   ui/panels.js    → history.*        = 10 (спарклайны)
// Эти константы — аварийный предохранитель.
// ──────────────────────────────────────────────────────────────
export const PERSIST_CAPS = Object.freeze({
  events_log:             500,
  turn_summary_history:   200,
});

function _trimFromTail(arr, max) {
  if (!Array.isArray(arr) || arr.length <= max) return;
  // events_log хранит свежие записи в голове (unshift), поэтому срезаем хвост.
  arr.length = max;
}

export function _enforcePersistentLogCaps(gs) {
  if (!gs) return;
  _trimFromTail(gs.events_log, PERSIST_CAPS.events_log);
  const summary = gs._turn_summary_history;
  if (Array.isArray(summary) && summary.length > PERSIST_CAPS.turn_summary_history) {
    // _turn_summary_history: push в конец (свежие — в хвосте), срезаем начало.
    summary.splice(0, summary.length - PERSIST_CAPS.turn_summary_history);
  }
  // Money audit log тоже капим.
  const audit = gs._money_audit;
  if (Array.isArray(audit) && audit.length > 200) audit.splice(0, audit.length - 200);
}

// ──────────────────────────────────────────────────────────────
// Этап 3 economic3.md — Money conservation audit
//
// Считаем суммарную казну всех наций каждый ход и сравниваем с ожидаемой
// величиной по сумме _income_breakdown и _expense_breakdown. Drift > 0.1%
// означает, что где-то в движке монеты появляются или исчезают без учёта —
// это источник unbounded growth (seleukid +909 трлн за 500 ходов).
//
// Результат: GAME_STATE._money_audit — массив drift-событий за последние 200 ходов.
// ──────────────────────────────────────────────────────────────
export function _auditMoneyConservation() {
  const gs = GAME_STATE;
  if (!gs || !gs.nations) return;

  let totalMoney    = 0;
  let totalIncome   = 0;
  let totalExpense  = 0;
  let totalHoardBurn = 0;

  for (const nation of Object.values(gs.nations)) {
    const eco = nation.economy;
    if (!eco) continue;
    totalMoney += eco.treasury || 0;

    const inc = eco._income_breakdown || {};
    const exp = eco._expense_breakdown || {};
    // В _income_breakdown ключ total — суммарный доход за последний ход
    totalIncome   += Number.isFinite(inc.total) ? inc.total : 0;
    totalExpense  += Number.isFinite(exp.total) ? exp.total : 0;
    totalHoardBurn += Number.isFinite(exp.hoard_penalty) ? exp.hoard_penalty : 0;
  }

  const prev = gs._last_money_total ?? totalMoney;    // первый тик: не сравниваем
  const expected = prev + totalIncome - totalExpense;
  const delta = totalMoney - expected;
  const pct = prev !== 0 ? Math.abs(delta) / Math.abs(prev) : 0;

  // Логируем только значимые отклонения. 0.1% — пороговое.
  if (pct > 0.001 && Math.abs(delta) > 1000 && gs.turn > 1) {
    gs._money_audit ??= [];
    gs._money_audit.push({
      turn: gs.turn,
      total: Math.round(totalMoney),
      expected: Math.round(expected),
      delta: Math.round(delta),
      pct: Math.round(pct * 10000) / 100,  // в %, 2 знака
      income: Math.round(totalIncome),
      expense: Math.round(totalExpense),
      hoard_burn: Math.round(totalHoardBurn),
    });
  }

  gs._last_money_total = totalMoney;
}

// ──────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ ХОДА
// ──────────────────────────────────────────────────────────────

// Гарантирует минимальную структуру нации перед обработкой хода
export function _ensureNationDefaults(nation) {
  if (!nation.economy)                    nation.economy    = {};
  if (!nation.economy.stockpile)          nation.economy.stockpile = {};
  if (nation.economy.treasury == null)    nation.economy.treasury  = 0;
  if (!nation.population)                 nation.population = {};
  if (!nation.population.by_profession)   nation.population.by_profession = {};
  if (nation.population.total == null)    nation.population.total     = 0;
  if (nation.population.happiness == null) nation.population.happiness = 50;
  if (!nation.military)                   nation.military   = {};
  if (!nation.military.at_war_with)       nation.military.at_war_with = [];
  if (!nation.government)                 nation.government = {};
  if (nation.government.legitimacy == null) nation.government.legitimacy = 50;
  if (nation.government.stability == null)  nation.government.stability  = 50;
  if (!nation.regions)                    nation.regions    = [];
  if (!nation.relations)                  nation.relations  = {};
  // SuperOU — инициализировать вектор состояния при первом вызове.
  // Пропускаем stub-нации (0 регионов, 0 населения) — им не нужен OU.
  if (!nation._ou && typeof window !== 'undefined' && window.SuperOU) {
    if (nation.regions?.length || nation.population?.total) {
      try { window.SuperOU.initNation(nation); } catch (e) { console.warn('[super_ou] initNation:', e); }
    }
  }
}

export async function processTurn() {
  if (IS_PROCESSING_TURN) return;
  IS_PROCESSING_TURN = true;

  // Шаг 31: при нажатии "Следующий ход" — сбросить прогресс хода
  if (typeof resetTurnProgress === 'function') {
    try { resetTurnProgress(); } catch (_) {}
  }

  // Шаг 52 — снимок состояния игрока ДО обработки хода (для карточки итогов)
  let _tscPrevSnapshot = null;
  try {
    if (typeof snapshotNationState === 'function') {
      const _playerNation = GAME_STATE?.nations?.[GAME_STATE?.player_nation];
      if (_playerNation) _tscPrevSnapshot = snapshotNationState(_playerNation);
    }
  } catch (_) {}

  const btn = document.getElementById('end-turn-btn');
  // uisuper Этап 12: клепсидра-кнопка содержит SVG — textContent-подписи заменены
  // на console.time (таймеры шагов). Внешнее состояние показывается через disabled/flip.
  const _setStep = (label) => { console.time(`[turn] ${label}`); };
  const _endStep = (label) => { try { console.timeEnd(`[turn] ${label}`); } catch (_) {} };

  if (btn) btn.disabled = true;
  _setStep('Ход идёт...');

  // Session 11 — пауза фоновых RAF-анимаций на время обсчёта хода.
  // AmbientLayer (фоновые точки) и AquaWidget (частицы ресурс-бара) продолжают
  // крутиться при tab-visible, отнимая CPU main-thread у processTurn().
  // Пауза идемпотентна; resume() в finally.
  try {
    if (typeof window !== 'undefined') {
      if (window.AmbientLayer && typeof window.AmbientLayer.pause === 'function') {
        window.AmbientLayer.pause();
      }
      if (window.AquaWidget && typeof window.AquaWidget.pause === 'function') {
        window.AquaWidget.pause();
      }
    }
  } catch (_) {}

  // uisuper Этап 12 — анимация переворота клепсидры перед расчётом хода
  try {
    if (typeof window !== 'undefined' && window.Clepsydra && typeof window.Clepsydra.flip === 'function') {
      await new Promise(resolve => window.Clepsydra.flip(resolve));
    }
  } catch (e) { console.warn('[clepsydra_flip]', e); }

  try {
    // Session 9 — ring-buffer: трим журналов до начала хода.
    // Ловит неограниченный рост events_log (прямые push в ai/strategic_llm.js)
    // и _turn_summary_history (если сейв загружен со старой версии).
    try { _enforcePersistentLogCaps(GAME_STATE); } catch (_) {}

    // Инициализируем поля у всех наций перед обработкой
    for (const nation of Object.values(GAME_STATE.nations ?? {})) {
      _ensureNationDefaults(nation);
      // Сброс per-turn флагов для системы клятв
      nation._wars_declared_this_turn  = 0;
      nation._loans_taken_this_turn    = 0;
    }

    const date = GAME_STATE.date;
    const monthName = MONTH_NAMES?.[Math.max(1, Math.min(12, date.month ?? 1))] ?? 'Месяц';
    addEventLog(`── Ход ${GAME_STATE.turn}: ${monthName} ${Math.abs(date.year)} г. до н.э. ──`, 'turn');

    // 0.8. Договоры — сброс флагов, финансовые потоки (дань, контрибуции), истечение
    _setStep('Договоры...');
    if (typeof processAllTreatyTicks === 'function') {
      try { processAllTreatyTicks(); } catch (e) { console.warn('[treaty_effects]', e); }
    }
    _endStep('Договоры...');

    // 0.85. Научная конвергенция дипломатических отношений (α-drift)
    if (typeof DiplomacyEngine !== 'undefined' && typeof DiplomacyEngine.processGlobalTick === 'function') {
      try { DiplomacyEngine.processGlobalTick(); } catch (e) { console.warn('[diplomacy_tick]', e); }
    }

    // 0.87. DIP_006: Шпионаж → дипломатические отношения (поимка шпионов, casus belli)
    try { window._processEspionageTick(); } catch (e) { console.warn('[espionage_tick]', e); }

    // 0.9. Строительство зданий — продвигаем очередь, завершаем готовые
    if (typeof processBuildingConstruction === 'function') {
      try { processBuildingConstruction(); } catch (e) { console.warn('[buildings]', e); }
    }

    // 0.95. Провинциальный контроль — пересчёт area_control + influence_bonus
    //       + effective_control ДО расчёта экономики (провинциальный рынок
    //       зависит от контроля, поэтому обновляем после военного шага).
    // Session 4: внутри функции стоит кэш по сигнатуре владельцев регионов —
    // если никто не менял nation, пересчёт пропускается.
    _setStep('Провинции...');
    if (typeof calculateProvinceControl === 'function') {
      try { calculateProvinceControl(); } catch (e) { console.warn('[province_control]', e); }
    }
    _endStep('Провинции...');

    // 1. Экономика (детерминировано)
    _setStep('Экономика...');
    try {
      runEconomyTick();
    } catch (e) {
      console.error('[economy]', e);
      addEventLog(`⚠ Ошибка экономики: ${e.message}`, 'danger');
    }
    _endStep('Экономика...');

    // 1.02. Достижения — проверяем после экономики
    if (typeof checkAchievements === 'function') {
      try {
        checkAchievements(GAME_STATE.player_nation);
        if (typeof updateGrandeurDisplay === 'function') updateGrandeurDisplay();
      } catch (e) { console.warn('[achievements]', e); }
    }

    // 1.05. Выплаты по займам (после пополнения казны доходами)
    if (typeof processLoanPayments === 'function') {
      try {
        for (const nId of Object.keys(GAME_STATE.nations ?? {})) {
          processLoanPayments(nId);
        }
      } catch (e) { console.warn('[loans]', e); }
    }

    // 1.1. Запись истории экономики (для вкладки «Экономический обзор»)
    if (typeof recordEconomyHistory === 'function') {
      try { recordEconomyHistory(); } catch (e) { console.warn('[econ_history]', e); }
    }

    // 1.5. Правительство (детерминировано)
    try { processAllGovernmentTicks(); } catch (e) { console.error('[government]', e); }

    // 1.6. Конституционный движок — тирания, гражданская война
    try { CONSTITUTIONAL_ENGINE.tick(GAME_STATE.player_nation); } catch (e) { console.error('[constitutional]', e); }

    // 1.7. Движок заговоров — только игрок + нации со своими заговорами
    _setStep('Заговоры...');
    for (const _conspNationId of Object.keys(GAME_STATE.nations)) {
      const _cn = GAME_STATE.nations[_conspNationId];
      // Пропускаем AI-нации без активных заговоров (оптимизация)
      if (_conspNationId !== GAME_STATE.player_nation) {
        const hasActive = (_cn?.conspiracies ?? []).some(
          c => c.status === 'incubating' || c.status === 'growing'
        );
        if (!hasActive) continue;
      }
      try { await CONSPIRACY_ENGINE.tick(_conspNationId); } catch (e) { console.warn('[conspiracy]', _conspNationId, e); }
    }
    _endStep('Заговоры...');

    // 1.8. Культура — опыт, мутации, ассимиляция
    if (typeof cultureTick === 'function') {
      try { cultureTick(); } catch (e) { console.warn('[culture]', e); }
    }

    // 1.9. Религия — распространение, синкретизм, кризисы
    if (typeof religionTick === 'function') {
      try { religionTick(); } catch (e) { console.warn('[religion]', e); }
    }

    // 2. Население (детерминировано)
    // processDemography обновляет by_profession + total для всех наций
    _setStep('Население...');
    try {
      if (typeof processDemography === 'function') {
        processDemography();
      } else {
        updatePopulationGrowth(); // fallback
      }
    } catch (e) { console.error('[demography]', e); }
    _endStep('Население...');

    // 2.1. Рекрутинг из казарм, конюшен, военных портов
    if (typeof processRecruitment === 'function') {
      try { processRecruitment(); } catch (e) { console.warn('[recruitment]', e); }
    }

    // 2.15. Гарнизоны крепостей — набор из населения, убыль при недофинансировании
    if (typeof processFortressGarrisons === 'function') {
      try { processFortressGarrisons(); } catch (e) { console.warn('[fortress_garrisons]', e); }
    }

    // 2.2. Возрастная демография — когорты, рабочая сила, законы труда
    if (typeof processAgeDemographics === 'function') {
      try { processAgeDemographics(); } catch (e) { console.warn('[age_demographics]', e); }
    }

    try { updateHappiness(); } catch (e) { console.error('[happiness]', e); }

    // 2.4. Земельная ёмкость — пересчёт ПОСЛЕ населения, ПЕРЕД производством
    if (typeof calcRegionLandCapacity === 'function') {
      try {
        for (const [regionId, region] of Object.entries(GAME_STATE.regions)) {
          region.land = calcRegionLandCapacity(region, regionId);
        }
      } catch (e) { console.warn('[land_capacity]', e); }
    }

    // 2.5. Записываем историю населения (после обновления class_satisfaction)
    if (typeof recordPopulationHistory === 'function') {
      try { recordPopulationHistory(); } catch (e) { console.warn('[history]', e); }
    }

    // 3. Персонажи — старение (детерминировано)
    try { agingCharacters(); }     catch (e) { console.warn('[aging]', e); }
    try { checkCharacterDeaths(); } catch (e) { console.warn('[deaths]', e); }
    try { maybeSpawnCharacter(); }  catch (e) { console.warn('[spawn]', e); }

    // 3.5–3.6. Диалоговый движок — только персонажи с активной горячей памятью
    _setStep('Персонажи...');
    for (const nId of Object.keys(GAME_STATE.nations ?? {})) {
      try {
        // nation.characters (советники, генералы, жрецы, купцы...)
        const _nChars = GAME_STATE.nations[nId]?.characters ?? [];
        const hasHotMem = _nChars.some(c => c.alive && c.dialogue?.hot_memory?.length);
        if (hasHotMem) await window.DIALOGUE_ENGINE.tick(nId);

        // Сенаторы и члены советов (хранятся вне nation.characters)
        const _mgr = getSenateManager(nId);
        if (_mgr) {
          for (const sen of (_mgr.senators ?? [])) {
            if (sen.dialogue?.hot_memory?.length) await window.DIALOGUE_ENGINE.compressDirect(sen);
          }
        }
      } catch (e) { console.warn('[dialogue]', nId, e); }
    }
    _endStep('Персонажи...');

    // 4. AI нации — решения (Claude/Groq, ограничено 5 секундами)
    _setStep('ИИ думает...');
    try {
      await Promise.race([
        processAINations(),
        new Promise(r => setTimeout(r, 5000)),
      ]);
    } catch (e) { console.warn('[ai_nations]', e); }
    _endStep('ИИ думает...');

    // 5. Случайные события (10% шанс)
    if (Math.random() < CONFIG.RANDOM_EVENT_CHANCE) {
      try { triggerRandomEvent(); } catch (e) { console.warn('[random_event]', e); }
    }

    // 5.4. Провинциальный контроль — события при смене баланса сил
    if (typeof checkProvinceControlEvents === 'function') {
      try { checkProvinceControlEvents(); } catch (e) { console.warn('[province_events]', e); }
    }

    // 5.4б. Военные союзы — AI союзники атакуют общих врагов
    if (typeof processAllianceWars === 'function') {
      try { processAllianceWars(); } catch (e) { console.warn('[alliance_wars]', e); }
    }

    // 5.4г. Тик памяти AI-наций (компрессия старых событий в архив)
    if (typeof processMemoryTick === 'function') {
      try { processMemoryTick(); } catch (e) { console.warn('[memory_tick]', e); }
    }

    // 5.4б2. Блокады портов и удержание территорий (war score)
    if (typeof WarScoreEngine !== 'undefined') {
      try { WarScoreEngine.processBlockadeTick(); } catch (e) { console.warn('[blockade_tick]', e); }
      try { WarScoreEngine.processHoldingTick();  } catch (e) { console.warn('[holding_tick]', e); }
    }

    // 5.4в. Движение армий и обработка осад
    _setStep('Армии...');
    if (typeof processArmyMovement === 'function') {
      try { processArmyMovement(); } catch (e) { console.warn('[army_movement]', e); }
    }
    _endStep('Армии...');

    // 5.5. Прогресс активных приказов (делегирование)
    if (typeof processAllOrders === 'function') {
      try { processAllOrders(); } catch (e) { console.warn('[orders]', e); }
    }

    // 5.52. Тактический ИИ командующих (армии без активного приказа)
    if (typeof processCommanderAI === 'function') {
      try { processCommanderAI(); } catch (e) { console.warn('[commander_ai]', e); }
    }

    // 5.55. Автономное поведение персонажей (fire-and-forget)
    // Запускаем с задержкой чтобы не перекрываться с processAINations (rate limit)
    setTimeout(() => processCharacterAutonomy(GAME_STATE.player_nation).catch(console.warn), 8000);

    // 5.56. Хронист — каждые 50 ходов генерирует нарративные события (fire-and-forget)
    if (GAME_STATE.turn > 0 && GAME_STATE.turn % 50 === 0) {
      const _chronicle = window.ChronicleSystem;
      if (_chronicle) {
        _chronicle.generate(GAME_STATE)
          .catch(e => console.warn('[Chronicle] ошибка:', e.message));
      }
    }

    // 5.6. Условия победы / итог правления / кризисные вехи
    try { checkVictoryConditions(); } catch (e) { console.warn('[victory]', e); }
    // 5.61. Тик активного кризиса
    if (typeof _tickActiveCrisis === 'function') {
      try { _tickActiveCrisis(GAME_STATE.player_nation); } catch (e) { console.warn('[crisis-tick]', e); }
    }

    // 6. Обновляем дату
    advanceDate();

    // 6.5. Итоги хода
    try { _recordTurnSummary(); } catch (e) { console.warn('[summary]', e); }

    // Шаг 52 — визуальная карточка итога хода (дельты ресурсов игрока)
    try {
      if (typeof showTurnSummaryCard === 'function' && typeof snapshotNationState === 'function') {
        const _playerNation = GAME_STATE?.nations?.[GAME_STATE?.player_nation];
        if (_playerNation && _tscPrevSnapshot) {
          const _next = snapshotNationState(_playerNation);
          showTurnSummaryCard(_tscPrevSnapshot, _next);
        }
      }
    } catch (e) { console.warn('[turn_summary_card]', e); }

    // 6.55. Шаг 46 — история ресурсов игрока (для спарклайнов в топ-баре)
    {
      const _pushHist = (typeof window !== 'undefined' && window._pushResourceHistory)
        || (typeof window._pushResourceHistory === 'function' ? window._pushResourceHistory : null);
      if (typeof _pushHist === 'function') {
        try { _pushHist(GAME_STATE); } catch (e) { console.warn('[res-history]', e); }
      }
    }

    // 6.9. Money conservation audit (Этап 3 плана economic3.md)
    //   Проверяет, что сумма казны всех наций + монеты «списанные» (hoard/inflation)
    //   не расходится с ожидаемой величиной (last_total + income − expense − burns).
    //   Отклонение > 0.1% → запись в GAME_STATE._money_audit для пост-анализа.
    try { _auditMoneyConservation(); } catch (e) { console.warn('[money_audit]', e); }

    // 7. Автосохранение
    _setStep('Сохранение...');
    await saveGame();
    _endStep('Сохранение...');

    // 8. Обновляем весь UI
    _setStep('Рендер...');
    renderAll();
    _endStep('Рендер...');

  } catch (err) {
    console.error('Ошибка в processTurn:', err);
    addEventLog('Ошибка при обработке хода. Проверьте консоль.', 'danger');
    // Гарантируем продвижение хода даже при критической ошибке
    try { advanceDate(); } catch (_) {}
    try { renderAll(); }   catch (_) {}
  } finally {
    IS_PROCESSING_TURN = false;
    _endStep('Ход идёт...');
    if (btn) {
      btn.disabled = false;
    }
    // Session 11 — возобновить фоновые RAF-анимации после tick'а.
    // Запускается даже если тик упал — идемпотентно.
    try {
      if (typeof window !== 'undefined') {
        if (window.AmbientLayer && typeof window.AmbientLayer.resume === 'function') {
          window.AmbientLayer.resume();
        }
        if (window.AquaWidget && typeof window.AquaWidget.resume === 'function') {
          window.AquaWidget.resume();
        }
      }
    } catch (_) {}
    // uisuper Этап 12 — новый ход: сброс состояния «готов» клепсидры
    try {
      if (typeof window !== 'undefined' && window.Clepsydra && typeof window.Clepsydra.setReady === 'function') {
        window.Clepsydra.setReady(false);
      }
    } catch (_) {}
  }
}

// ──────────────────────────────────────────────────────────────
// ДАТА / СЕЗОН / СТЕЛА — вынесены в engine/date.js (Этап 45)
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// ПЕРСОНАЖИ — вынесены в engine/characters_lifecycle.js (Этап 46)
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// AI НАЦИИ — РЕШЕНИЯ
// ──────────────────────────────────────────────────────────────

export async function processAINations() {
  // Шаг 51: очищаем старые индикаторы AI-действий — перед сбором нового пула.
  if (typeof window !== 'undefined' && typeof window.clearAIIndicators === 'function') {
    try { window.clearAIIndicators(); } catch (e) { console.warn('[ai_indicators] clear:', e); }
  }

  // Обновляем кэш дипломатических расстояний
  if (typeof refreshDiploDistances === 'function') {
    try { refreshDiploDistances(); } catch (e) { console.warn('[diplo_range]', e); }
  }

  // ── Разделить нации по тирам ───────────────────────────────────────
  const tier1 = [], tier2 = [], tier3 = [];
  for (const [nId, n] of Object.entries(GAME_STATE.nations)) {
    if (n.is_player || n.is_eliminated) continue;
    const tier = typeof getNationTier === 'function' ? getNationTier(nId) : 3;
    if      (tier === 1) tier1.push(nId);
    else if (tier === 2) tier2.push(nId);
    else                 tier3.push(nId);
  }

  const rotationList = [...tier1, ...tier2];
  const currentTurn  = GAME_STATE.turn ?? 0;
  const MAX_STALE    = 3;
  const playerNationId = GAME_STATE.player_nation;

  // ── Session 10: round-robin по ходам ──────────────────────────────
  // Из tier2+tier3 за один ход обрабатываем только срез BATCH_SIZE.
  // Критический путь (warWithPlayer + tier1 + hot-nations с недавними
  // военными/дипломатическими событиями) ИГНОРИРУЕТ батч — обрабатываются
  // всегда. Нация, пропущенная в этом ходу, получит ход через N/batch ходов
  // либо немедленно, если попадёт в hot-list.
  const BATCH_SIZE = Math.max(1, CONFIG.AI_TURN_BATCH ?? 50);

  // hot-list: нации, чей id фигурирует в events_log (≤2 хода) в типах
  // military/diplomacy. Игрок задел нацию → она обязана отреагировать в тот
  // же ход, не ждать своего слота в round-robin.
  const hotAI = new Set(
    (GAME_STATE.events_log ?? [])
      .filter(e => (currentTurn - (e.turn ?? 0)) <= 2
        && (e.type === 'military' || e.type === 'diplomacy'))
      .flatMap(e => [e.actor, e.target, e.nation].filter(Boolean))
  );

  // ── ST_018: Гегемониальный страх — каждые 5 ходов ─────────────────────────
  if (currentTurn % 5 === 0 && typeof window !== 'undefined' && window.SuperOU?.applyHegemonModifier) {
    try { window.SuperOU.applyHegemonModifier(GAME_STATE); } catch (e) { console.warn('[super_ou] applyHegemonModifier:', e); }
  }

  // ── #18 Приоритизация по событиям — инвалидируем кэш после событий игрока ─
  // Если игрок совершил военное/дипломатическое действие в прошлом ходу,
  // сбрасываем кэш для нации которая затронута, чтобы она переосмыслила стратегию.
  const recentPlayerEvents = (GAME_STATE.events_log ?? [])
    .filter(e => (currentTurn - (e.turn ?? 0)) <= 1
      && (e.type === 'military' || e.type === 'diplomacy')
      && e.actor === playerNationId);
  for (const evt of recentPlayerEvents) {
    // evt.target может быть nationId которую задел игрок
    const affectedNation = evt.target ?? evt.nation;
    if (affectedNation && _aiPending.has(affectedNation)) {
      console.log(`[#18] Инвалидируем кэш ${affectedNation} — игрок совершил ${evt.type} действие`);
      _aiPending.delete(affectedNation);
    }
  }

  // ── Haiku 4.5: нации воюющие с игроком (макс 2 чтобы не тормозить) ─
  const warWithPlayer = rotationList.filter(nId =>
    playerNationId &&
    (GAME_STATE.nations[nId]?.military?.at_war_with ?? []).includes(playerNationId)
  ).slice(0, 2);

  const warSet = new Set(warWithPlayer);

  // Военные решения: сначала кэш из фонового AI Worker, затем прямой вызов Groq
  const warResults = new Map();
  for (const nId of warWithPlayer) {
    const cached = _aiPending.get(nId);
    if (cached?.source === 'war_bg' && (currentTurn - cached.turn) <= 1 && validateNationDecision(cached.decision)) {
      // Решение предзагружено воркером — берём из кэша, ход не ждёт HTTP
      warResults.set(nId, cached.decision);
      _aiPending.delete(nId);
      console.log(`[war_ai] кэш воркера: ${GAME_STATE.nations[nId]?.name ?? nId} → ${cached.decision.action}`);
    }
  }
  // Для наций без кэша — прямой вызов Groq (как раньше)
  const uncachedWar = warWithPlayer.filter(nId => !warResults.has(nId));
  if (uncachedWar.length > 0 && typeof getAIWarDecision === 'function' && CONFIG.GROQ_API_KEY) {
    const warPromises = uncachedWar.map(async nId => {
      const decision = await getAIWarDecision(nId).catch(err => {
        console.warn(`[war_ai] Groq недоступен для ${nId} (${err.message}) — fallback`);
        return null;
      });
      if (decision) warResults.set(nId, decision);
    });
    await Promise.all(warPromises);
  }
  if (warResults.size > 0) {
    addEventLog(`⚔ Военный AI обработал ${warResults.size} нации`, 'ai');
  }

  let fromCache = 0, fromFallback = 0, fromWarAI = 0, skippedByBatch = 0;

  // ── Session 10: формируем набор наций для обработки в ЭТОМ ходу ───
  // Критический путь: war с игроком + tier1 + hot-nations (игрок задел
  // их военными/дипломатическими действиями). Остальные (batchable) идут
  // через round-robin cursor с шагом BATCH_SIZE.
  const criticalAI = new Set(warWithPlayer);
  for (const nId of tier1) criticalAI.add(nId);
  for (const nId of rotationList) if (hotAI.has(nId)) criticalAI.add(nId);
  for (const nId of tier3)       if (hotAI.has(nId)) criticalAI.add(nId);

  // batchablePool: tier2 + tier3 без критических.
  // tier2 из rotationList, tier3 — отдельный массив.
  const batchablePool = [];
  for (const nId of tier2) if (!criticalAI.has(nId)) batchablePool.push(nId);
  for (const nId of tier3) if (!criticalAI.has(nId)) batchablePool.push(nId);

  // Round-robin срез. Cursor хранится в GAME_STATE для сохранения между ходами.
  const processThisTurn = new Set(criticalAI);
  if (batchablePool.length > 0) {
    let cursor = (GAME_STATE._aiTurnCursor | 0);
    if (cursor < 0 || cursor >= batchablePool.length) cursor = 0;
    const take = Math.min(BATCH_SIZE, batchablePool.length);
    for (let i = 0; i < take; i++) {
      processThisTurn.add(batchablePool[(cursor + i) % batchablePool.length]);
    }
    GAME_STATE._aiTurnCursor = (cursor + take) % batchablePool.length;
    skippedByBatch = batchablePool.length - take;
  }

  // ── #20 Логирование стратегии в UI ────────────────────────────────
  // Показываем игроку reasoning для важных решений (война, альянс, мир)
  const NOTABLE_ACTIONS = new Set(['declare_war','seek_peace','armistice','form_alliance','move_army']);
  function _logAIStrategy(nId, decision, source) {
    if (!decision?.action || !NOTABLE_ACTIONS.has(decision.action)) return;
    const nName = GAME_STATE.nations[nId]?.name ?? nId;
    const tName = decision.target
      ? (GAME_STATE.nations[decision.target]?.name ?? decision.target)
      : null;
    const reasoning = decision.reasoning ? ` — «${decision.reasoning}»` : '';
    const targetStr  = tName ? ` → ${tName}` : '';
    const sourceTag  = source === 'haiku' ? ' [⚔]' : source === 'llm' ? ' [AI]' : '';
    if (typeof addEventLog === 'function') {
      addEventLog(`${nName}${sourceTag}: ${decision.action}${targetStr}${reasoning}`, 'diplomacy');
    }
  }

  // ── Применяем военные решения Haiku ───────────────────────────────
  for (const nId of warWithPlayer) {
    const decision = warResults.get(nId);
    if (decision && validateNationDecision(decision)) {
      _logAIStrategy(nId, decision, 'haiku');
      applyNationDecision(nId, decision);
      // Инвалидируем кэш phi4-mini — Haiku взял управление
      _aiPending.delete(nId);
      fromWarAI++;
    } else {
      applyFallbackDecision(nId);
      fromFallback++;
    }
  }

  // ── Применяем кэшированные решения phi4-mini (мгновенно) ──────────
  // Session 10: обрабатываем только нации, попавшие в processThisTurn
  // (критические + round-robin срез BATCH_SIZE из tier2+tier3).
  for (const nId of rotationList) {
    if (warSet.has(nId)) continue; // уже обработано Haiku
    if (!processThisTurn.has(nId)) continue; // не в батче и не критичный
    const cached = _aiPending.get(nId);
    if (cached && (currentTurn - cached.turn) <= MAX_STALE && validateNationDecision(cached.decision)) {
      _logAIStrategy(nId, cached.decision, 'llm');
      applyNationDecision(nId, cached.decision);
      _aiPending.delete(nId);
      fromCache++;
    } else {
      if (cached) _aiPending.delete(nId);
      applyFallbackDecision(nId);
      fromFallback++;
    }
  }

  // Tier3 — OU Fallback, но только для наций из processThisTurn
  for (const nId of tier3) {
    if (!processThisTurn.has(nId)) continue;
    applyFallbackDecision(nId);
  }

  // ── StrategicLLM: планирование для tier1 наций ─────────────────────
  if (typeof window !== 'undefined' && window.StrategicLLM?.shouldPlan) {
    for (const nId of tier1) {
      const nation = GAME_STATE.nations[nId];
      if (!nation || nation.is_eliminated) continue;
      try {
        if (window.StrategicLLM.shouldPlan(nation, currentTurn)) {
          // Запускаем асинхронно, не блокируем ход
          const ou = nation._ou;
          window.StrategicLLM.createPlan(nation, ou, GAME_STATE).catch(e =>
            console.warn(`[strategic_llm] createPlan ${nId}:`, e)
          );
        }
      } catch (e) { console.warn('[strategic_llm] shouldPlan:', e); }
    }
  }

  console.log(`[ai_nations] ход ${currentTurn}: warAI(Haiku):${fromWarAI} cache(phi4):${fromCache} fallback(OU):${fromFallback} tier3:${tier3.length} batch_skip:${skippedByBatch}`);

  // Шаг 51: отрисовываем собранные за ход AI-индикаторы на карте.
  if (typeof window !== 'undefined' && typeof window.renderAIIndicators === 'function') {
    try { window.renderAIIndicators(); } catch (e) { console.warn('[ai_indicators] render:', e); }
  }

  // ── Анти-сноуболл ─────────────────────────────────────────────────
  if (typeof processConquestFatigue === 'function') {
    try { processConquestFatigue(); } catch (e) { console.warn('[conquest_fatigue]', e); }
  }
  if (typeof checkCoalitionReflex === 'function') {
    try { checkCoalitionReflex(); } catch (e) { console.warn('[coalition_reflex]', e); }
  }
}

// _processEspionageTick, _cleanExpiredCasusBelli — вынесены в engine/espionage.js (Этап 47)

// _OU_THETA, _OU_SIGMA, _ouNaturalMu, _ouStep, _tickOU, _softmax, _weightedPick,
// _findWarTarget, _findDiplomacyPartner, _FALLBACK_BUILD_PRIORITY, _findBuildTarget,
// _SUPER_OU_ACTION_MAP — вынесены в engine/ai_scoring.js (Этап 48)

// applyFallbackDecision — вынесена в engine/ai_fallback.js (Этап 49)

// _aiHttpWorker, _callGroqViaWorker, startAIBackgroundLoop, stopAIBackgroundLoop,
// _aiBgTick, _aiBgProcess — вынесены в engine/ai_worker.js (Этап 50)


// ──────────────────────────────────────────────────────────────
// ИТОГИ ХОДА — записываем дельты для сводного экрана
// ──────────────────────────────────────────────────────────────

export function _recordTurnSummary() {
  if (!GAME_STATE._turn_summary_history) GAME_STATE._turn_summary_history = [];

  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations[nationId];
  if (!nation) return;

  const prev = GAME_STATE._last_turn_snapshot ?? {};
  const snap = {
    treasury:    Math.round(nation.economy.treasury),
    population:  Math.round(nation.population.total),
    happiness:   Math.round(nation.population.happiness),
    legitimacy:  Math.round(nation.government.legitimacy),
    stability:   Math.round(nation.government.stability ?? 50),
    regions:     nation.regions.length,
    income:      Math.round(nation.economy.income_per_turn),
    expense:     Math.round(nation.economy.expense_per_turn),
    turn:        GAME_STATE.turn,
  };

  const summary = {
    turn:        GAME_STATE.turn,
    date:        { ...GAME_STATE.date },
    d_treasury:  snap.treasury   - (prev.treasury   ?? snap.treasury),
    d_pop:       snap.population - (prev.population ?? snap.population),
    d_happiness: snap.happiness  - (prev.happiness  ?? snap.happiness),
    d_legit:     snap.legitimacy - (prev.legitimacy ?? snap.legitimacy),
    income:      snap.income,
    expense:     snap.expense,
    regions:     snap.regions,
  };

  GAME_STATE._turn_summary_history.push(summary);
  // Храним последние 24 хода (2 года)
  if (GAME_STATE._turn_summary_history.length > 24) {
    GAME_STATE._turn_summary_history.shift();
  }

  GAME_STATE._last_turn_snapshot = snap;

  // Итоговая строка в журнале событий
  const parts = [];
  if (summary.d_treasury !== 0) {
    const s = summary.d_treasury >= 0 ? '+' : '';
    parts.push(`казна ${s}${summary.d_treasury}`);
  }
  if (Math.abs(summary.d_pop) >= 1) {
    const s = summary.d_pop >= 0 ? '+' : '';
    parts.push(`население ${s}${summary.d_pop}`);
  }
  if (Math.abs(summary.d_happiness) >= 1) {
    const s = summary.d_happiness >= 0 ? '+' : '';
    parts.push(`счастье ${s}${summary.d_happiness}`);
  }
  const line = parts.length > 0
    ? `Итог хода: ${parts.join(', ')}`
    : `Итог хода: без изменений`;
  addEventLog(line, 'economy');
}

// saveGame, loadGame, _buildSavePayload, _getSaveWorker, _migrateCharacterIds,
// _sanitizeInstitutions, _migrateSenateConfig, _migrateCharacterSenateFields
// — вынесены в engine/save.js (Этап 52)

// initGame, renderAll — вынесены в engine/init.js (Этап 53)

// ── Window binding for data-action="processTurn" delegation in boot.js ──

// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

