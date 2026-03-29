// Главный игровой цикл — один ход = один месяц

let IS_PROCESSING_TURN = false;

// ── Фоновый AI: кэш решений и флаг цикла ────────────────────────────────
// Ключ: nationId → { decision, turn, processedAt }
const _aiPending = new Map();
let _aiBgRunning = false;

// Названия месяцев в греческой традиции
const MONTH_NAMES = [
  '', // индекс 0 не используется
  'Гекатомбеон', 'Метагейтнион', 'Боэдромион',
  'Пианепсион',  'Мемактерион',  'Посидеон',
  'Гамелион',    'Антестерион',  'Элафеболион',
  'Мунихион',    'Таргелион',    'Скирофорион',
];

// ──────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ ХОДА
// ──────────────────────────────────────────────────────────────

// Гарантирует минимальную структуру нации перед обработкой хода
function _ensureNationDefaults(nation) {
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
}

async function processTurn() {
  if (IS_PROCESSING_TURN) return;
  IS_PROCESSING_TURN = true;

  const btn = document.getElementById('end-turn-btn');
  const _setStep = (label) => {
    if (btn) btn.textContent = `⏳ ${label}`;
    console.time(`[turn] ${label}`);
  };
  const _endStep = (label) => console.timeEnd(`[turn] ${label}`);

  if (btn) btn.disabled = true;
  _setStep('Ход идёт...');

  try {
    // Инициализируем поля у всех наций перед обработкой
    for (const nation of Object.values(GAME_STATE.nations ?? {})) {
      _ensureNationDefaults(nation);
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

    // 0.9. Строительство зданий — продвигаем очередь, завершаем готовые
    if (typeof processBuildingConstruction === 'function') {
      try { processBuildingConstruction(); } catch (e) { console.warn('[buildings]', e); }
    }

    // 0.95. Провинциальный контроль — пересчёт area_control + influence_bonus
    //       + effective_control ДО расчёта экономики (провинциальный рынок
    //       зависит от контроля, поэтому обновляем после военного шага).
    if (typeof calculateProvinceControl === 'function') {
      try { calculateProvinceControl(); } catch (e) { console.warn('[province_control]', e); }
    }

    // 1. Экономика (детерминировано)
    _setStep('Экономика...');
    try {
      runEconomyTick();
    } catch (e) {
      console.error('[economy]', e);
      addEventLog(`⚠ Ошибка экономики: ${e.message}`, 'danger');
    }
    _endStep('Экономика...');

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
        if (hasHotMem) await DIALOGUE_ENGINE.tick(nId);

        // Сенаторы и члены советов (хранятся вне nation.characters)
        const _mgr = getSenateManager(nId);
        if (_mgr) {
          for (const sen of (_mgr.senators ?? [])) {
            if (sen.dialogue?.hot_memory?.length) await DIALOGUE_ENGINE.compressDirect(sen);
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

    // 5.6. Условия победы / поражения
    try { checkVictoryConditions(); } catch (e) { console.warn('[victory]', e); }

    // 6. Обновляем дату
    advanceDate();

    // 6.5. Итоги хода
    try { _recordTurnSummary(); } catch (e) { console.warn('[summary]', e); }

    // 7. Автосохранение
    _setStep('Сохранение...');
    await saveGame();
    _endStep('Сохранение...');

    // 8. Обновляем весь UI
    renderAll();

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
      btn.textContent = '⚔ Следующий ход';
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ДАТА
// ──────────────────────────────────────────────────────────────

function advanceDate() {
  GAME_STATE.turn++;
  let { year, month } = GAME_STATE.date;
  month++;
  if (month > 12) {
    month = 1;
    year++;
    // Переход до нашей эры: -301 → -300 → ... → 0 → 1 н.э.
    if (year === 0) year = 1;
  }
  GAME_STATE.date = { year, month };
  updateDateDisplay();
}

function formatDate(date) {
  const era = date.year < 0 ? `${Math.abs(date.year)} г. до н.э.` : `${date.year} г. н.э.`;
  return `${MONTH_NAMES?.[Math.max(1, Math.min(12, date.month ?? 1))] ?? 'Месяц'}, ${era}`;
}

function updateDateDisplay() {
  const el = document.getElementById('game-date');
  if (el) el.textContent = formatDate(GAME_STATE.date);
}

// ──────────────────────────────────────────────────────────────
// ПЕРСОНАЖИ — СТАРЕНИЕ И СМЕРТЬ
// ──────────────────────────────────────────────────────────────

function agingCharacters() {
  // Раз в год (ход 12, 24, ...) стареем персонажей
  if (GAME_STATE.turn % 12 !== 0) return;

  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    for (const char of (nation.characters || [])) {
      if (!char.alive) continue;
      char.age++;
      // После 55 лет здоровье падает быстрее
      const healthDecline = char.age > 55 ? 8 : 3;
      char.health = Math.max(0, char.health - healthDecline + Math.floor(Math.random() * 5));
    }
  }
}

function checkCharacterDeaths() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    for (const char of (nation.characters || [])) {
      if (!char.alive) continue;

      // Здоровье < 10 → персонаж умирает
      if (char.health < 10) {
        char.alive = false;
        addEventLog(`${char.name} скончался в возрасте ${char.age} лет.`, 'character');

        // Синхронизация с Сенатом: если персонаж был сенатором — заменяем призраком
        const mgr = getSenateManager(nationId);
        if (mgr) {
          const senator = mgr.getSenatorByCharacterId(char.id);
          if (senator) {
            mgr.replace_senator(senator, 'death');
            if (nationId === GAME_STATE.player_nation) {
              addEventLog(
                `🏛️ Место ${char.name} в Сенате освободилось. Фракция ${mgr._factionName(senator.faction_id)} ищет преемника.`,
                'character'
              );
            }
          }
        }

        // Если умер правитель → кризис наследования
        const govRuler = GAME_STATE.nations[nationId]?.government?.ruler;
        if (govRuler && (govRuler.character_id === char.id || govRuler.name === char.name)) {
          triggerSuccessionCrisis(nationId);
        }
      }
    }
  }
}

function maybeSpawnCharacter() {
  // Каждые 10 ходов 20% шанс нового персонажа для игрока
  if (GAME_STATE.turn % 10 !== 0) return;
  if (Math.random() > 0.2) return;

  const playerNation = GAME_STATE.nations[GAME_STATE.player_nation];
  const currentChars = (playerNation.characters || []).filter(c => c.alive).length;

  // Не больше 12 активных персонажей
  if (currentChars >= 12) return;

  // Запрашиваем генерацию нового персонажа через Claude (асинхронно)
  generateNewCharacter(GAME_STATE.player_nation).catch(console.error);
}

// ──────────────────────────────────────────────────────────────
// AI НАЦИИ — РЕШЕНИЯ
// ──────────────────────────────────────────────────────────────

async function processAINations() {
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

  // ── Haiku 4.5: нации воюющие с игроком (макс 2 чтобы не тормозить) ─
  const warWithPlayer = rotationList.filter(nId =>
    playerNationId &&
    (GAME_STATE.nations[nId]?.military?.at_war_with ?? []).includes(playerNationId)
  ).slice(0, 2);

  const warSet = new Set(warWithPlayer);

  // Запускаем Haiku параллельно для всех воюющих наций
  const warResults = new Map();
  if (warWithPlayer.length > 0 && typeof getAIWarDecision === 'function' && CONFIG.API_KEY) {
    const warPromises = warWithPlayer.map(async nId => {
      const decision = await getAIWarDecision(nId).catch(err => {
        console.warn(`[war_ai] Haiku недоступен для ${nId} (${err.message}) — fallback`);
        return null;
      });
      if (decision) warResults.set(nId, decision);
    });
    await Promise.all(warPromises);
    if (warResults.size > 0) {
      addEventLog(`⚔ Военный AI (Haiku) обработал ${warResults.size} нации`, 'ai');
    }
  }

  let fromCache = 0, fromFallback = 0, fromWarAI = 0;

  // ── Применяем военные решения Haiku ───────────────────────────────
  for (const nId of warWithPlayer) {
    const decision = warResults.get(nId);
    if (decision && validateNationDecision(decision)) {
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
  for (const nId of rotationList) {
    if (warSet.has(nId)) continue; // уже обработано Haiku
    const cached = _aiPending.get(nId);
    if (cached && (currentTurn - cached.turn) <= MAX_STALE && validateNationDecision(cached.decision)) {
      applyNationDecision(nId, cached.decision);
      _aiPending.delete(nId);
      fromCache++;
    } else {
      if (cached) _aiPending.delete(nId);
      applyFallbackDecision(nId);
      fromFallback++;
    }
  }

  // Tier3 — всегда только OU Fallback
  for (const nId of tier3) {
    applyFallbackDecision(nId);
  }

  console.log(`[ai_nations] ход ${currentTurn}: warAI(Haiku):${fromWarAI} cache(phi4):${fromCache} fallback(OU):${fromFallback} tier3:${tier3.length}`);

  // ── Анти-сноуболл ─────────────────────────────────────────────────
  if (typeof processConquestFatigue === 'function') {
    try { processConquestFatigue(); } catch (e) { console.warn('[conquest_fatigue]', e); }
  }
  if (typeof checkCoalitionReflex === 'function') {
    try { checkCoalitionReflex(); } catch (e) { console.warn('[coalition_reflex]', e); }
  }
}

// ══════════════════════════════════════════════════════════════════════
// OU (Ornstein-Uhlenbeck) — стохастические "настроения" нации
// Каждое настроение дрейфует случайно, но возвращается к своему μ.
// Формула: x(t+1) = x(t) + θ·(μ−x(t)) + σ·N(0,1)
//
// Измерения:
//   aggression    [-1..+1]  склонность к войне и рекрутингу
//   expansion     [-1..+1]  склонность к захвату территорий
//   diplomacy     [-1..+1]  склонность к союзам и торговле
//   economy_focus [-1..+1]  склонность к строительству и налогам
//   caution       [-1..+1]  склонность к миру и осторожности
// ══════════════════════════════════════════════════════════════════════

const _OU_THETA = 0.12; // скорость возврата к среднему
const _OU_SIGMA = 0.07; // амплитуда шума

function _ouNaturalMu(nation) {
  const treasury  = nation.economy?.treasury ?? 0;
  const military  = nation.military          ?? {};
  const pop       = nation.population        ?? {};
  const gov       = nation.government        ?? {};
  const atWar     = (military.at_war_with ?? []).length > 0;
  const armyStr   = (military.infantry ?? 0) + (military.cavalry ?? 0) * 3;
  const armyRatio = armyStr / Math.max(1, pop.total ?? 1);
  const happiness = pop.happiness ?? 50;
  const stability = gov.stability ?? 50;

  return {
    aggression:     atWar ? 0.45 : (armyRatio > 0.05 ? 0.15 : -0.10),
    expansion:      treasury > 5000 ? 0.25 : (treasury > 1000 ? 0.0 : -0.20),
    diplomacy:      atWar ? -0.35 : (treasury > 2000 ? 0.30 : 0.0),
    economy_focus:  atWar ? -0.20 : (treasury > 3000 ? 0.35 : (treasury > 800 ? 0.10 : -0.30)),
    caution:        (happiness < 30 || stability < 30) ? 0.50
                    : (atWar && armyRatio < 0.02 ? 0.40 : 0.0),
  };
}

function _ouStep(x, mu) {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-1, Math.min(1, x + _OU_THETA * (mu - x) + _OU_SIGMA * normal));
}

function _tickOU(nationId, nation) {
  const mu = _ouNaturalMu(nation);
  if (!nation._ou) {
    nation._ou = {
      aggression:    mu.aggression    + (Math.random() - 0.5) * 0.2,
      expansion:     mu.expansion     + (Math.random() - 0.5) * 0.2,
      diplomacy:     mu.diplomacy     + (Math.random() - 0.5) * 0.2,
      economy_focus: mu.economy_focus + (Math.random() - 0.5) * 0.2,
      caution:       mu.caution       + (Math.random() - 0.5) * 0.2,
    };
  }
  const ou = nation._ou;
  // Инициализировать новые измерения у старых наций
  if (ou.economy_focus === undefined) ou.economy_focus = mu.economy_focus + (Math.random() - 0.5) * 0.2;
  if (ou.caution       === undefined) ou.caution       = mu.caution       + (Math.random() - 0.5) * 0.2;

  ou.aggression    = _ouStep(ou.aggression,    mu.aggression);
  ou.expansion     = _ouStep(ou.expansion,     mu.expansion);
  ou.diplomacy     = _ouStep(ou.diplomacy,     mu.diplomacy);
  ou.economy_focus = _ouStep(ou.economy_focus, mu.economy_focus);
  ou.caution       = _ouStep(ou.caution,       mu.caution);
  return ou;
}

function _softmax(scoreMap, temp = 1.2) {
  const entries = Object.entries(scoreMap);
  const exps    = entries.map(([k, v]) => [k, Math.exp(v / temp)]);
  const sum     = exps.reduce((s, [, e]) => s + e, 0);
  return Object.fromEntries(exps.map(([k, e]) => [k, e / sum]));
}

function _weightedPick(probMap) {
  const r = Math.random();
  let cum = 0;
  for (const [key, p] of Object.entries(probMap)) {
    cum += p;
    if (r <= cum) return key;
  }
  return Object.keys(probMap).at(-1);
}

// ── Найти враждебного соседа для объявления войны (max 20 отношений) ───
function _findWarTarget(nationId, nation) {
  const military = nation.military ?? {};
  if ((military.at_war_with ?? []).length >= 2) return null;
  const ownStr = (military.infantry ?? 0) + (military.cavalry ?? 0) * 3;
  let best = null, bestScore = -Infinity;
  const entries = Object.entries(nation.relations || {}).slice(0, 20);
  for (const [otherId, rel] of entries) {
    if (rel.at_war) continue;
    if ((rel.treaties ?? []).some(t => ['non_aggression','defensive_alliance','military_alliance','vassalage'].includes(t))) continue;
    if (typeof getArmistice === 'function' && getArmistice(nationId, otherId)) continue;
    const other = GAME_STATE.nations?.[otherId];
    if (!other || other.is_defeated) continue;
    const enemyStr = (other.military?.infantry ?? 0) + (other.military?.cavalry ?? 0) * 3;
    const relScore = rel.score ?? 0;
    const attractiveness = -relScore * 0.03
      + (ownStr > enemyStr * 1.5 ? 1.5 : 0)
      + (ownStr > enemyStr * 2.0 ? 1.0 : 0);
    if (relScore < -20 && attractiveness > bestScore) {
      bestScore = attractiveness;
      best = otherId;
    }
  }
  return best;
}

// ── Найти дружественного партнёра для союза/торговли ───────────────────
function _findDiplomacyPartner(nationId, nation, minScore = 20, excludeTreaty = null) {
  let best = null, bestScore = -Infinity;
  const entries = Object.entries(nation.relations || {}).slice(0, 20);
  for (const [otherId, rel] of entries) {
    if (rel.at_war) continue;
    const score = rel.score ?? 0;
    if (score < minScore) continue;
    if (excludeTreaty && (rel.treaties ?? []).includes(excludeTreaty)) continue;
    const other = GAME_STATE.nations?.[otherId];
    if (!other || other.is_defeated) continue;
    if (score > bestScore) { bestScore = score; best = otherId; }
  }
  return best;
}

// ── Подобрать здание для строительства (max 10 регионов) ───────────────
const _FALLBACK_BUILD_PRIORITY = [
  'barracks', 'granary', 'market', 'road', 'warehouse',
  'temple', 'forum', 'stables', 'workshop', 'farm',
];
function _findBuildTarget(nationId, nation) {
  const regions = (nation.regions ?? []).slice(0, 10);
  for (const regionId of regions) {
    const region = GAME_STATE.regions?.[regionId];
    if (!region) continue;
    if ((region.construction_queue ?? []).length >= 2) continue;
    const existingIds = (region.building_slots ?? []).map(s => s.building_id);
    for (const bid of _FALLBACK_BUILD_PRIORITY) {
      if (existingIds.includes(bid)) continue;
      if (typeof BUILDINGS !== 'undefined' && BUILDINGS[bid]?.nation_buildable === false) continue;
      return { regionId, buildingId: bid };
    }
  }
  return null;
}

// ── Fallback с OU-вероятностями — полный набор действий ────────────────
function applyFallbackDecision(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const treasury = nation.economy?.treasury ?? 0;
  const military = nation.military          ?? {};
  const pop      = nation.population        ?? {};
  const gov      = nation.government        ?? {};

  if (!military.at_war_with) military.at_war_with = [];

  const _rec = (action, detail) => {
    if (typeof addMemoryEvent === 'function')
      addMemoryEvent(nationId, 'decision', `${action}${detail ? ': ' + detail : ''}`, [], 'fallback');
  };

  const ou = _tickOU(nationId, nation);

  // ── #17 Fallback иерархия — личность влияет на OU-баллы ─────────────
  const personality = nation.ai_personality ?? 'defensive';
  const priority    = nation.ai_priority    ?? 'survival';
  // Модификатор: усиливаем склонности нации в fallback
  const pMod = {
    aggression:    personality === 'aggressive'   ? 1.5 : personality === 'expansionist' ? 1.2 : 1.0,
    economy_focus: personality === 'merchant'     ? 1.5 : priority === 'trade'          ? 1.3 : 1.0,
    diplomacy:     personality === 'diplomatic'   ? 1.5 : 1.0,
    caution:       personality === 'defensive'    ? 1.5 : personality === 'survival'    ? 1.8 : 1.0,
    expansion:     personality === 'expansionist' ? 1.5 : 1.0,
  };
  // Применяем модификаторы к ou
  ou.aggression    = (ou.aggression    ?? 0.5) * pMod.aggression;
  ou.economy_focus = (ou.economy_focus ?? 0.5) * pMod.economy_focus;
  ou.diplomacy     = (ou.diplomacy     ?? 0.5) * pMod.diplomacy;
  ou.caution       = (ou.caution       ?? 0.5) * pMod.caution;
  ou.expansion     = (ou.expansion     ?? 0.5) * pMod.expansion;

  const atWar       = military.at_war_with.length > 0;
  const warCount    = military.at_war_with.length;
  const armyStr     = (military.infantry ?? 0) + (military.cavalry ?? 0) * 3;
  const armyRatio   = armyStr / Math.max(1, pop.total ?? 1);
  const hasArmy     = (GAME_STATE.armies ?? []).some(
    a => a.nation === nationId && a.state !== 'disbanded'
  );
  const happiness   = pop.happiness ?? 50;
  const stability   = gov.stability ?? 50;
  const warExhausted = atWar && armyRatio < 0.01;

  // ── Скоринг ────────────────────────────────────────────────────────
  const scores = {

    recruit:
      ou.aggression * 2.0
      + (armyRatio < 0.01 ? 2.5 : armyRatio < 0.03 ? 0.5 : -1.0)
      + (atWar ? 1.5 : 0)
      + (treasury < 800 ? -5 : treasury > 4000 ? 0.5 : 0),

    raise_army:
      ou.aggression * 1.5 + ou.expansion * 1.0
      + (!hasArmy && military.infantry > 200 ? 3.0 : -4.0)
      + (atWar ? 2.0 : 0),

    recruit_mercs:
      ou.aggression * 1.5
      + (atWar ? 2.0 : -1.0)
      + (treasury > 5000 ? 1.0 : -4.0)
      + ((military.mercenaries ?? 0) > 300 ? -3 : 0),

    declare_war:
      ou.aggression * 3.0 + ou.expansion * 1.5
      + (atWar ? -4.0 : 0)
      + (warExhausted ? -10 : 0)
      + (ou.caution * -2.0)
      + (treasury < 1000 ? -3 : 0)
      + (armyRatio < 0.01 ? -5 : 0),

    seek_peace:
      ou.caution * 3.0
      + (warExhausted ? 4.0 : -2.0)
      + (!atWar ? -10 : 0)
      + (warCount >= 2 ? 2.0 : 0),

    armistice:
      ou.caution * 2.0 + ou.diplomacy * 1.0
      + (atWar && !warExhausted ? 1.0 : -3.0),

    build:
      ou.economy_focus * 3.0
      + (!atWar ? 1.0 : -2.0)
      + (treasury > 2000 ? 1.5 : treasury > 800 ? 0 : -5.0),

    set_taxes:
      ou.economy_focus * 1.5
      + (treasury < 500 ? 2.0 : treasury > 8000 ? 1.5 : 0)
      + (GAME_STATE.turn % 4 === 0 ? 0.5 : -1.0),

    form_alliance:
      ou.diplomacy * 2.5 + ou.caution * 1.0
      + (!atWar ? 1.0 : -3.0)
      + (GAME_STATE.turn % 5 === 0 ? 1.0 : -1.5),

    trade:
      ou.diplomacy * 2.5
      + (!atWar ? 1.0 : -5.0)
      + (treasury > 2000 ? 0.5 : -1.0)
      + (GAME_STATE.turn % 6 === 0 ? 1.0 : -1.5),

    counter_conspiracy:
      (nation.conspiracies?.some(c => c.status === 'detected') ? 4.0 : -10.0)
      + (stability < 40 ? 1.0 : 0),

    move_army:
      ou.aggression * 2.0 + ou.expansion * 1.5
      + (hasArmy && atWar ? 3.0 : -4.0),

    wait:
      -ou.aggression * 0.5 + 0.3,
  };

  const action = _weightedPick(_softmax(scores));

  switch (action) {

    case 'recruit': {
      if (treasury < 800) { _rec('wait', 'казна мала'); break; }
      const n = Math.min(
        Math.floor(treasury / 10),
        Math.floor(Math.max(1, pop.total ?? 1) * 0.005)
      );
      if (n > 0) {
        military.infantry = (military.infantry ?? 0) + n;
        nation.economy.treasury -= n * (CONFIG.BALANCE?.INFANTRY_UPKEEP ?? 1) * 5;
        _rec('recruit', `+${n} пехоты [agg:${ou.aggression.toFixed(2)}]`);
      }
      break;
    }

    case 'raise_army': {
      if (!hasArmy && (military.infantry ?? 0) > 200 && typeof createArmy === 'function') {
        const homeRegion = nation.regions?.[0];
        if (homeRegion) {
          const troops = Math.floor(military.infantry * 0.6);
          military.infantry -= troops;
          createArmy(nationId, homeRegion, { infantry: troops },
            { name: `Армия ${nation.name ?? nationId}` });
          _rec('raise_army', `${troops} пехоты → поле [exp:${ou.expansion.toFixed(2)}]`);
        }
      } else {
        _rec('wait', 'армия уже в поле');
      }
      break;
    }

    case 'recruit_mercs': {
      if (treasury > 5000 && (military.mercenaries ?? 0) < 300) {
        const m = Math.min(100, Math.floor((treasury - 3000) / 20));
        military.mercenaries = (military.mercenaries ?? 0) + m;
        nation.economy.treasury -= m * (CONFIG.BALANCE?.MERCENARY_UPKEEP ?? 2) * 5;
        _rec('recruit_mercs', `+${m} наёмников [agg:${ou.aggression.toFixed(2)}]`);
      } else {
        _rec('wait', 'наёмники недоступны');
      }
      break;
    }

    case 'declare_war': {
      if (typeof declareWar !== 'function') { _rec('wait', 'declareWar N/A'); break; }
      if (atWar) { _rec('wait', 'уже в войне'); break; }
      if (armyStr < 100) { _rec('wait', 'армия слишком мала'); break; }
      const warTarget = _findWarTarget(nationId, nation);
      if (warTarget) {
        const result = declareWar(nationId, warTarget);
        if (result?.ok !== false) {
          _rec('declare_war', `→ ${GAME_STATE.nations?.[warTarget]?.name ?? warTarget} [agg:${ou.aggression.toFixed(2)}]`);
        } else {
          _rec('wait', result?.reason ?? 'война невозможна');
        }
      } else {
        _rec('wait', 'нет подходящей цели для войны');
      }
      break;
    }

    case 'seek_peace': {
      if (!atWar || typeof concludePeace !== 'function') { _rec('wait', 'нет войны'); break; }
      const enemy = military.at_war_with[0];
      if (!enemy) { _rec('wait', 'враг не найден'); break; }
      concludePeace(nationId, enemy, { loser: null, winner: null, ceded_regions: [] });
      _rec('seek_peace', `мир с ${GAME_STATE.nations?.[enemy]?.name ?? enemy} [cau:${ou.caution.toFixed(2)}]`);
      break;
    }

    case 'armistice': {
      if (!atWar || typeof createTreaty !== 'function') { _rec('wait', 'нет войны'); break; }
      const enemy = military.at_war_with[0];
      if (!enemy) { _rec('wait', 'враг не найден'); break; }
      if (typeof getArmistice === 'function' && getArmistice(nationId, enemy)) {
        _rec('wait', 'перемирие уже есть'); break;
      }
      createTreaty(nationId, enemy, 'armistice', { duration_years: 3 });
      _rec('armistice', `перемирие с ${GAME_STATE.nations?.[enemy]?.name ?? enemy} [dip:${ou.diplomacy.toFixed(2)}]`);
      break;
    }

    case 'build': {
      if (typeof orderBuildingConstruction !== 'function') { _rec('wait', 'build N/A'); break; }
      if (treasury < 800) { _rec('wait', 'казна мала для строительства'); break; }
      const bt = _findBuildTarget(nationId, nation);
      if (bt) {
        const res = orderBuildingConstruction(nationId, bt.regionId, bt.buildingId);
        if (res?.ok !== false) {
          _rec('build', `${bt.buildingId} в ${bt.regionId} [eco:${ou.economy_focus.toFixed(2)}]`);
        } else {
          _rec('wait', res?.reason ?? 'стройка невозможна');
        }
      } else {
        _rec('wait', 'нет свободных стройслотов');
      }
      break;
    }

    case 'set_taxes': {
      if (!nation.economy) { _rec('wait', 'экономика N/A'); break; }
      nation.economy.tax_rates_by_class = nation.economy.tax_rates_by_class ?? {};
      const tr = nation.economy.tax_rates_by_class;
      let label = '';
      if (treasury < 500) {
        tr.commoners   = Math.min(0.30, (tr.commoners   ?? 0.10) + 0.05);
        tr.aristocrats = Math.min(0.20, (tr.aristocrats ?? 0.05) + 0.03);
        label = 'повышение налогов';
      } else if (treasury > 8000) {
        tr.commoners   = Math.max(0.03, (tr.commoners   ?? 0.10) - 0.03);
        tr.aristocrats = Math.max(0.02, (tr.aristocrats ?? 0.05) - 0.02);
        label = 'снижение налогов';
      } else {
        tr.commoners   = tr.commoners   ?? 0.12;
        tr.aristocrats = tr.aristocrats ?? 0.08;
        tr.clergy      = tr.clergy      ?? 0.05;
        tr.soldiers    = tr.soldiers    ?? 0.00;
        label = 'стандартные налоги';
      }
      _rec('set_taxes', `${label} [eco:${ou.economy_focus.toFixed(2)}]`);
      break;
    }

    case 'form_alliance': {
      if (typeof createTreaty !== 'function') { _rec('wait', 'treaty N/A'); break; }
      const partner = _findDiplomacyPartner(nationId, nation, 30, 'defensive_alliance');
      if (partner) {
        createTreaty(nationId, partner, 'defensive_alliance', {});
        _rec('form_alliance', `союз с ${GAME_STATE.nations?.[partner]?.name ?? partner} [dip:${ou.diplomacy.toFixed(2)}]`);
      } else {
        _rec('wait', 'нет партнёра для союза');
      }
      break;
    }

    case 'trade': {
      if (atWar) { _rec('wait', 'война — торговля невозможна'); break; }
      let done = false;
      for (const [otherId, rel] of Object.entries(nation.relations || {})) {
        if (rel.at_war || (rel.treaties ?? []).includes('trade')) continue;
        if (rel.score > -10 && Math.random() < (rel.score + 50) / 200) {
          rel.treaties = rel.treaties || [];
          rel.treaties.push('trade');
          rel.score = Math.min(100, rel.score + 10);
          const other = GAME_STATE.nations[otherId];
          if (other?.relations?.[nationId]) {
            other.relations[nationId].treaties = other.relations[nationId].treaties || [];
            if (!other.relations[nationId].treaties.includes('trade'))
              other.relations[nationId].treaties.push('trade');
            other.relations[nationId].score = Math.min(100, other.relations[nationId].score + 10);
          }
          _rec('trade_deal', `${other?.name ?? otherId} [dip:${ou.diplomacy.toFixed(2)}]`);
          done = true;
          break;
        }
      }
      if (!done) _rec('wait', 'нет партнёров для торговли');
      break;
    }

    case 'counter_conspiracy': {
      const detected = (nation.conspiracies ?? []).find(c => c.status === 'detected');
      if (detected) {
        detected.preparation      = Math.max(0, (detected.preparation ?? 50) - 15);
        detected.conspiracy_stealth = Math.max(5, (detected.conspiracy_stealth ?? 50) - 10);
        if (detected.preparation <= 0) detected.status = 'resolved';
        _rec('counter_conspiracy', `${detected.secret_name ?? detected.id}`);
      } else {
        _rec('wait', 'заговоров не обнаружено');
      }
      break;
    }

    case 'move_army': {
      if (!hasArmy || typeof orderArmyMove !== 'function') { _rec('wait', 'армия N/A'); break; }
      const myArmy = (GAME_STATE.armies ?? []).find(
        a => a.nation === nationId && a.state === 'stationed'
      );
      if (!myArmy) { _rec('wait', 'нет стоячей армии'); break; }
      const enemy = military.at_war_with[0];
      if (!enemy) { _rec('wait', 'нет врага для движения'); break; }
      const enemyNation  = GAME_STATE.nations?.[enemy];
      const enemyRegion  = enemyNation?.regions?.[0];
      if (!enemyRegion) { _rec('wait', 'регион врага не найден'); break; }
      const moved = orderArmyMove(myArmy.id, enemyRegion);
      if (moved) {
        _rec('move_army', `→ ${enemyRegion} (${enemyNation?.name ?? enemy}) [agg:${ou.aggression.toFixed(2)}]`);
      } else {
        _rec('wait', 'путь к врагу недоступен');
      }
      break;
    }

    default:
      _rec('wait', `казна:${Math.round(treasury)} agg:${ou.aggression.toFixed(2)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// ФОНОВЫЙ AI-ЦИКЛ
// phi4-mini обрабатывает нации непрерывно в фоне.
// Решения сохраняются в _aiPending и применяются при следующем нажатии
// «Следующий ход» — ход игрока становится мгновенным.
// ══════════════════════════════════════════════════════════════════════

function startAIBackgroundLoop() {
  if (_aiBgRunning) return;
  _aiBgRunning = true;
  console.log('[ai_bg] Фоновый AI-цикл запущен');
  _aiBgTick();
}

function stopAIBackgroundLoop() {
  _aiBgRunning = false;
  console.log('[ai_bg] Фоновый AI-цикл остановлен');
}

async function _aiBgTick() {
  if (!_aiBgRunning) return;
  try {
    await _aiBgProcess();
  } catch (e) {
    console.warn('[ai_bg] Ошибка тика:', e.message);
  }
  // Следующий тик через 200 мс после завершения — phi4-mini сам регулирует скорость
  // (запрос занимает 2-5 сек на 1 нацию, поэтому пауза минимальная)
  if (_aiBgRunning) setTimeout(_aiBgTick, 200);
}

async function _aiBgProcess() {
  if (!GAME_STATE?.nations || IS_PROCESSING_TURN) return;
  if (typeof getAISingleDecision !== 'function') return;

  // ── Строим список приоритетов ──────────────────────────────────────
  // 1. Воюющие нации без свежего кэша — срочно
  // 2. Tier1 без кэша — важно
  // 3. Tier2 без кэша — по ротации
  const tier1 = [], tier2 = [];
  for (const [nId, n] of Object.entries(GAME_STATE.nations)) {
    if (n.is_player || n.is_eliminated) continue;
    const tier = typeof getNationTier === 'function' ? getNationTier(nId) : 3;
    if      (tier === 1) tier1.push(nId);
    else if (tier === 2) tier2.push(nId);
  }

  const rotationList = [...tier1, ...tier2];
  if (rotationList.length === 0) return;

  const currentTurn = GAME_STATE.turn ?? 0;

  // Нация считается «свежей» если кэш не старше 2 ходов
  // Нации воюющие с игроком пропускаем — их обрабатывает Haiku во время хода
  const playerNationIdBg = GAME_STATE.player_nation;
  const needsUpdate = nId => {
    if (playerNationIdBg &&
        (GAME_STATE.nations[nId]?.military?.at_war_with ?? []).includes(playerNationIdBg)) {
      return false; // Haiku обрабатывает во время хода
    }
    const c = _aiPending.get(nId);
    return !c || (currentTurn - c.turn) > 2;
  };

  // Выбираем 1 нацию: сначала воюющие без кэша, затем по курсору
  const atWarUncached = rotationList.filter(
    nId => (GAME_STATE.nations[nId]?.military?.at_war_with?.length ?? 0) > 0 && needsUpdate(nId)
  );

  let nationId;
  if (atWarUncached.length > 0) {
    // Воюющая нация — приоритет
    nationId = atWarUncached[0];
  } else {
    // Двигаем курсор по всему списку, ищем первую без свежего кэша
    if (GAME_STATE._ai_bg_cursor == null || GAME_STATE._ai_bg_cursor >= rotationList.length)
      GAME_STATE._ai_bg_cursor = 0;

    let found = false;
    for (let i = 0; i < rotationList.length; i++) {
      const idx = (GAME_STATE._ai_bg_cursor + i) % rotationList.length;
      if (needsUpdate(rotationList[idx])) {
        nationId = rotationList[idx];
        GAME_STATE._ai_bg_cursor = (idx + 1) % rotationList.length;
        found = true;
        break;
      }
    }
    if (!found) {
      // Все нации свежие — ждём следующего тика
      return;
    }
  }

  // ── Запрос к phi4-mini с богатым контекстом ───────────────────────
  const t0 = Date.now();
  const decision = await getAISingleDecision(nationId);
  const ms = Date.now() - t0;

  if (decision) {
    _aiPending.set(nationId, { decision, turn: currentTurn, processedAt: Date.now() });
    const nation = GAME_STATE.nations[nationId];
    console.log(`[ai_bg] ${nation?.name ?? nationId}: ${decision.action}${decision.target ? '→' + decision.target : ''} | ${ms}ms | pending:${_aiPending.size}/${rotationList.length} | "${decision.reasoning?.slice(0, 60) ?? ''}"`);
  } else {
    console.warn(`[ai_bg] ${nationId}: нет решения (${ms}ms) — OU fallback при ходе`);
  }
}

// ──────────────────────────────────────────────────────────────
// СЛУЧАЙНЫЕ СОБЫТИЯ
// ──────────────────────────────────────────────────────────────

const RANDOM_EVENTS = [
  {
    id: 'PLAGUE',
    name: 'Чума',
    description: 'Болезнь охватила город. Население сокращается.',
    probability: 0.15,
    choices: [
      { label: 'Карантин',     desc: 'Изолировать заражённые кварталы. Потери меньше, но казна страдает.',
        effect: (n) => { const d = Math.floor(n.population.total * 0.008); n.population.total -= d; n.economy.treasury -= 500; n.population.happiness = Math.max(0, n.population.happiness - 5); addEventLog(`Карантин введён. Погибло ${d} чел. Казна −500.`, 'warning'); } },
      { label: 'Молебны',      desc: 'Обратиться к богам. Дёшево, но помогает мало.',
        effect: (n) => { const d = Math.floor(n.population.total * 0.015); n.population.total -= d; n.population.happiness = Math.max(0, n.population.happiness - 7); addEventLog(`Жрецы молились. Погибло ${d} чел.`, 'warning'); } },
    ],
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const deaths = Math.floor(nation.population.total * 0.02);
      applyDelta(`nations.${nationId}.population.total`, nation.population.total - deaths);
      applyDelta(`nations.${nationId}.population.happiness`, Math.max(0, nation.population.happiness - 10));
      addEventLog(`${nation.name}: Чума унесла ${deaths} жизней!`, 'danger');
    },
  },
  {
    id: 'GOOD_HARVEST',
    name: 'Богатый урожай',
    description: 'Небывалый урожай. Запасы зерна пополнены.',
    probability: 0.25,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const bonus = Math.floor(nation.population.total * 0.5);
      nation.economy.stockpile.wheat = (nation.economy.stockpile.wheat || 0) + bonus;
      applyDelta(`nations.${nationId}.population.happiness`, Math.min(100, nation.population.happiness + 5));
      addEventLog(`${nation.name}: Богатый урожай! +${bonus} бушелей пшеницы.`, 'good');
    },
  },
  {
    id: 'PIRATE_RAID',
    name: 'Пиратский набег',
    description: 'Пираты атаковали торговые суда.',
    probability: 0.20,
    choices: [
      { label: 'Отправить флот',  desc: 'Преследовать пиратов. Риск потерь, но можно вернуть часть добычи.',
        effect: (n) => { const loss = Math.floor(n.economy.treasury * 0.02); n.economy.treasury -= loss; addEventLog(`Флот отогнал пиратов. Потери: ${loss} монет.`, 'warning'); } },
      { label: 'Откупиться',      desc: 'Заплатить выкуп. Дороже, но надёжнее.',
        effect: (n) => { const loss = Math.floor(n.economy.treasury * 0.07); n.economy.treasury -= loss; addEventLog(`Пираты получили откуп ${loss} монет и ушли.`, 'warning'); } },
    ],
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const loss = Math.floor(nation.economy.treasury * 0.05);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - loss);
      addEventLog(`${nation.name}: Пираты разграбили торговые суда! Потеряно ${loss} монет.`, 'warning');
    },
  },
  {
    id: 'MERCHANT_WINDFALL',
    name: 'Удачная сделка',
    description: 'Купцы заключили выгодный торговый договор.',
    probability: 0.25,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const gain = Math.floor(nation.economy.treasury * 0.08 + 200);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury + gain);
      addEventLog(`${nation.name}: Удачная торговая сделка! +${gain} монет в казну.`, 'good');
    },
  },
  {
    id: 'EARTHQUAKE',
    name: 'Землетрясение',
    description: 'Землетрясение разрушило часть построек.',
    probability: 0.05,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      if (nation.regions.length > 0) {
        const regionId = nation.regions[Math.floor(Math.random() * nation.regions.length)];
        const region = GAME_STATE.regions[regionId];
        if (region && region.buildings && region.buildings.length > 0) {
          const removed = region.buildings.splice(0, 1)[0];
          addEventLog(`${nation.name}: Землетрясение разрушило ${removed} в ${MAP_REGIONS[regionId]?.name || regionId}!`, 'danger');
        }
      }
      applyDelta(`nations.${nationId}.population.happiness`, Math.max(0, nation.population.happiness - 8));
    },
  },
  {
    id: 'ARMY_DESERTION',
    name: 'Дезертирство',
    description: 'Часть наёмников покинула армию.',
    probability: 0.10,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      if (nation.military.mercenaries > 0) {
        const deserters = Math.floor(nation.military.mercenaries * 0.15);
        applyDelta(`nations.${nationId}.military.mercenaries`, nation.military.mercenaries - deserters);
        addEventLog(`${nation.name}: ${deserters} наёмников дезертировали!`, 'warning');
      }
    },
  },
];

function triggerRandomEvent() {
  // Событие случается с игроком или с одной из AI наций
  const allNations = Object.keys(GAME_STATE.nations);
  const targetNationId = allNations[Math.floor(Math.random() * allNations.length)];

  // Выбираем событие по вероятности
  const totalWeight = RANDOM_EVENTS.reduce((sum, e) => sum + e.probability, 0);
  let rand = Math.random() * totalWeight;

  for (const event of RANDOM_EVENTS) {
    rand -= event.probability;
    if (rand <= 0) {
      // Если событие на игрока И у события есть выборы — показываем оверлей
      if (targetNationId === GAME_STATE.player_nation && event.choices?.length) {
        _showEventChoiceOverlay(event, targetNationId);
      } else {
        event.effect(targetNationId);
      }
      return;
    }
  }
}

// Показывает оверлей выбора для случайного события
function _showEventChoiceOverlay(event, nationId) {
  const overlay = document.getElementById('event-choice-overlay');
  if (!overlay) {
    // Fallback — применяем стандартный эффект
    event.effect(nationId);
    return;
  }

  overlay.querySelector('.ec-title').textContent       = event.name;
  overlay.querySelector('.ec-description').textContent = event.description;

  const choicesEl = overlay.querySelector('.ec-choices');
  choicesEl.innerHTML = '';
  for (const choice of event.choices) {
    const btn = document.createElement('button');
    btn.className = 'ec-choice-btn';
    btn.innerHTML = `<strong>${choice.label}</strong><span class="ec-choice-desc">${choice.desc}</span>`;
    btn.onclick = () => {
      const nation = GAME_STATE.nations[nationId];
      choice.effect(nation);
      overlay.style.display = 'none';
      renderAll();
    };
    choicesEl.appendChild(btn);
  }

  overlay.style.display = 'flex';
}

// ──────────────────────────────────────────────────────────────
// ИТОГИ ХОДА — записываем дельты для сводного экрана
// ──────────────────────────────────────────────────────────────

function _recordTurnSummary() {
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

// ──────────────────────────────────────────────────────────────
// СОХРАНЕНИЕ / ЗАГРУЗКА
// ──────────────────────────────────────────────────────────────

function _buildSavePayload() {
  // Сериализуем SENATE_MANAGERS
  const senateData = {};
  for (const [nationId, mgr] of Object.entries(SENATE_MANAGERS)) {
    try { senateData[nationId] = mgr.toJSON(); } catch (_) {}
  }

  // Исключаем эфемерные данные хода (пересчитываются каждый ход)
  const { _turn_summary_history, _last_turn_snapshot, _pending_char_initiatives, ...base } = GAME_STATE;

  // Обрезаем лог событий до 50 записей
  if (base.events_log?.length > 50) base.events_log = base.events_log.slice(0, 50);

  return { ...base, _senate: senateData };
}

async function saveGame() {
  try {
    const payload = _buildSavePayload();
    await GameStorage.save(payload);
  } catch (e) {
    console.warn('[save] Ошибка сохранения:', e);
    addEventLog('⚠ Автосохранение не удалось: ' + e.message, 'warning');
  }
}

async function loadGame() {
  try {
    // Миграция старого сохранения из localStorage (однократно)
    await GameStorage.migrate(CONFIG.SAVE_KEY);

    const loadedState = await GameStorage.load();
    if (!loadedState) return false;

    // Восстанавливаем SENATE_MANAGERS до Object.assign,
    // чтобы initSenateForNation() не перезаписывал их заново
    if (loadedState._senate) {
      for (const [nationId, data] of Object.entries(loadedState._senate)) {
        try {
          SENATE_MANAGERS[nationId] = SenateManager.fromJSON(data);
        } catch (e) {
          console.warn(`Не удалось восстановить сенат ${nationId}:`, e);
        }
      }
      delete loadedState._senate;
    }

    Object.assign(GAME_STATE, loadedState);
    _migrateCharacterIds();
    _sanitizeInstitutions();
    _migrateSenateConfig();
    _migrateCharacterSenateFields();

    // Восстанавливаем поля из INITIAL_GAME_STATE которые могут отсутствовать
    // в старых сохранениях (например color добавленный позже).
    for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
      const initial = INITIAL_GAME_STATE.nations?.[nationId];
      if (initial && !nation.color && initial.color) nation.color = initial.color;
      if (initial && !nation.flag_emoji && initial.flag_emoji) nation.flag_emoji = initial.flag_emoji;
    }

    // Совместимость: применяем REGION_BIOMES к регионам из сохранений
    // созданных до того как region.biome был введён.
    if (typeof REGION_BIOMES !== 'undefined') {
      for (const [rid, biomeId] of Object.entries(REGION_BIOMES)) {
        const r = GAME_STATE.regions[rid];
        if (r && !r.biome) r.biome = biomeId;
      }
    }

    addEventLog('Игра загружена из сохранения.', 'info');
    return true;
  } catch (e) {
    console.warn('Не удалось загрузить игру:', e);
  }
  return false;
}

// После загрузки сохранения: если институты существуют но character_ids пустые,
// заполняем их из nation.characters (персонажи уже загружены из INITIAL_*)
function _migrateCharacterIds() {
  const INST_CHARS = {
    INST_strategos:       ['CHAR_0001','CHAR_0002','CHAR_0003','CHAR_0004','CHAR_0005'],
    INST_senate:          ['ROME_SEN_001','ROME_SEN_002','ROME_SEN_003','ROME_SEN_004','ROME_SEN_005','ROME_SEN_006','ROME_SEN_007','ROME_SEN_008','ROME_SEN_009'],
    INST_council_hundred: ['CARTH_OLI_001','CARTH_OLI_002','CARTH_OLI_003','CARTH_OLI_004','CARTH_OLI_005','CARTH_OLI_006'],
    INST_royal_court_eg:  ['EGY_CRT_001','EGY_CRT_002','EGY_CRT_003','EGY_CRT_004','EGY_CRT_005'],
    INST_hetairoi:        ['MAC_HTR_001','MAC_HTR_002','MAC_HTR_003','MAC_HTR_004','MAC_HTR_005'],
    INST_elder_council:   ['NUM_ELD_001','NUM_ELD_002','NUM_ELD_003','NUM_ELD_004'],
  };

  for (const nation of Object.values(GAME_STATE.nations)) {
    for (const inst of (nation.government?.institutions ?? [])) {
      if ((!inst.character_ids || inst.character_ids.length === 0) && INST_CHARS[inst.id]) {
        inst.character_ids = INST_CHARS[inst.id];
      }
    }
    // Для нумидии — и в ruler.character_ids
    if (!nation.government?.ruler?.character_ids?.length) {
      const rulerIds = { numidia: ['NUM_ELD_001','NUM_ELD_002','NUM_ELD_003','NUM_ELD_004'] };
      const nationKey = Object.keys(GAME_STATE.nations).find(k => GAME_STATE.nations[k] === nation);
      if (nationKey && rulerIds[nationKey]) {
        nation.government.ruler.character_ids = rulerIds[nationKey];
      }
    }
  }
}

// Удаляет из gov.institutions все объекты без id или name (артефакты AI-дельт)
function _sanitizeInstitutions() {
  for (const nation of Object.values(GAME_STATE.nations)) {
    const insts = nation.government?.institutions;
    if (Array.isArray(insts)) {
      nation.government.institutions = insts.filter(i => i?.id && i?.name);
    }
  }
}

// Восстанавливает senate_config из INITIAL_GAME_STATE для наций, где он отсутствует
// (старые сохранения были сделаны до добавления этого поля)
function _migrateSenateConfig() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    if (!nation.senate_config) {
      const initial = INITIAL_GAME_STATE.nations?.[nationId];
      if (initial?.senate_config) {
        nation.senate_config = JSON.parse(JSON.stringify(initial.senate_config));
      }
    }
    // Минимум 100 мест — исправляем устаревшее значение 90
    const arch = nation.senate_config?.state_architecture;
    if (arch && (arch.senate_capacity ?? 0) < 100) arch.senate_capacity = 100;
  }
}

// Переносит senate_faction_id и другие новые поля из INITIAL_CHARACTERS_*
// в персонажей, загруженных из старого сохранения (где этих полей ещё нет).
function _migrateCharacterSenateFields() {
  const INITIAL_SETS = {
    syracuse: typeof INITIAL_CHARACTERS_SYRACUSE !== 'undefined' ? INITIAL_CHARACTERS_SYRACUSE : [],
    rome:     typeof INITIAL_SENATORS_ROME        !== 'undefined' ? INITIAL_SENATORS_ROME        : [],
    carthage: typeof INITIAL_COUNCIL_CARTHAGE     !== 'undefined' ? INITIAL_COUNCIL_CARTHAGE     : [],
    ptolemaic_kingdom: typeof INITIAL_COURT_EGYPT !== 'undefined' ? INITIAL_COURT_EGYPT          : [],
    macedon:  typeof INITIAL_HETAIROI_MACEDON     !== 'undefined' ? INITIAL_HETAIROI_MACEDON     : [],
    numidia:  typeof INITIAL_ELDERS_NUMIDIA       !== 'undefined' ? INITIAL_ELDERS_NUMIDIA       : [],
  };

  for (const [nationId, initials] of Object.entries(INITIAL_SETS)) {
    const nation = GAME_STATE.nations[nationId];
    if (!nation?.characters?.length || !initials.length) continue;

    for (const saved of nation.characters) {
      const template = initials.find(c => c.id === saved.id);
      if (!template) continue;
      // Копируем только поля, которых нет в сохранении
      if (template.senate_faction_id && !saved.senate_faction_id) {
        saved.senate_faction_id = template.senate_faction_id;
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ ИГРЫ
// ──────────────────────────────────────────────────────────────

async function initGame() {
  // Инициализируем GAME_STATE из стартовых данных
  Object.assign(GAME_STATE, JSON.parse(JSON.stringify(INITIAL_GAME_STATE)));

  // Загружаем персонажей для игрока
  GAME_STATE.nations.syracuse.characters = JSON.parse(
    JSON.stringify(INITIAL_CHARACTERS_SYRACUSE)
  );

  // Загружаем сенаторов Рима
  GAME_STATE.nations.rome.characters = JSON.parse(JSON.stringify(INITIAL_SENATORS_ROME));
  // Загружаем акторов остальных наций
  GAME_STATE.nations.carthage.characters = JSON.parse(JSON.stringify(INITIAL_COUNCIL_CARTHAGE));
  if (GAME_STATE.nations.ptolemaic_kingdom) {
    GAME_STATE.nations.ptolemaic_kingdom.characters = JSON.parse(JSON.stringify(INITIAL_COURT_EGYPT));
  }
  GAME_STATE.nations.macedon.characters  = JSON.parse(JSON.stringify(INITIAL_HETAIROI_MACEDON));
  GAME_STATE.nations.numidia.characters  = JSON.parse(JSON.stringify(INITIAL_ELDERS_NUMIDIA));

  // Инициализируем провинции (до рендера!)
  if (typeof initProvinces === 'function') initProvinces();

  // Инициализируем культуры (до рендера!)
  if (typeof initCultures === 'function') initCultures();
  if (typeof initRegionCultures === 'function') initRegionCultures();

  // Инициализируем религии
  if (typeof initReligions === 'function') initReligions();
  if (typeof initRegionReligions === 'function') initRegionReligions();

  // Проставляем region.biome из REGION_BIOMES — используется в движке производства
  // для корректного применения BIOME_META.goods_bonus (bonus > 1.0 / < 1.0).
  if (typeof REGION_BIOMES !== 'undefined') {
    for (const [rid, biomeId] of Object.entries(REGION_BIOMES)) {
      const r = GAME_STATE.regions[rid];
      if (r && !r.biome) r.biome = biomeId;
    }
  }

  // Инициализируем собственность зданий по классам (70/30 для латифундий и т.д.)
  // Вызываем ДО loadGame, чтобы новые игры стартовали с корректным распределением.
  // При наличии сохранения loadGame() перезапишет значения сохранёнными.
  if (typeof initBuildingOwnership === 'function') {
    try { initBuildingOwnership(); } catch (e) { console.warn('[init_ownership]', e); }
  }

  // Инициализируем массив приказов
  if (typeof initOrders === 'function') initOrders();

  // Попытка загрузки сохранения
  const hasSave = await loadGame();

  // Заполняем geo-данные (connections, mapType) для всех регионов из MAP_REGIONS.
  // Это гарантирует работу поиска пути армий сразу после загрузки.
  if (typeof initRegionGeoData === 'function') initRegionGeoData();

  // Стартовый склад — только для новых игр (не загруженных сохранений).
  // Решает проблему холодного старта для циклических зависимостей:
  //   wheat нужна wheat (семена), barley нужен barley (семена),
  //   tools нужны для шахт и ферм, но tools требуют iron, iron требует charcoal.
  // Используем Math.max — не уменьшаем склад у наций которые уже имеют больше.
  if (!hasSave) {
    const FOOD_PP   = CONFIG.BALANCE?.FOOD_PER_PERSON ?? 25;
    const SALT_PP   = CONFIG.BALANCE?.SALT_PER_PERSON ?? 0.4;
    const CLOTH_PP  = CONFIG.BALANCE?.CLOTH_PER_PERSON ?? 0.25;

    for (const nation of Object.values(GAME_STATE.nations)) {
      const sp  = nation.economy?.stockpile;
      const pop = nation.population?.total || 1000;
      if (!sp) continue;

      // Стартовый запас еды = 3 месяца потребности населения.
      // avail = wheat + barley*0.8 + fish*0.6 должен покрывать pop * FOOD_PP * 3.
      // Распределяем: 60% пшеница, 30% ячмень, 10% рыба.
      const foodBuffer = pop * FOOD_PP * 3;
      sp.wheat  = Math.max(sp.wheat  || 0, Math.ceil(foodBuffer * 0.60));
      sp.barley = Math.max(sp.barley || 0, Math.ceil(foodBuffer * 0.30 / 0.8));
      sp.fish   = Math.max(sp.fish   || 0, Math.ceil(foodBuffer * 0.10 / 0.6));
      sp.salt   = Math.max(sp.salt   || 0, Math.ceil(pop * SALT_PP  * 3));
      sp.cloth  = Math.max(sp.cloth  || 0, Math.ceil(pop * CLOTH_PP * 3));

      // Производственная цепочка — фиксированный стартовый запас
      const BASE = {
        tools: 250, iron: 150, charcoal: 100, timber: 120,
        cattle: 80, pottery: 100, leather: 60,
      };
      for (const [good, min] of Object.entries(BASE)) {
        sp[good] = Math.max(sp[good] || 0, min);
      }
    }
  }

  // Гарантируем обязательные поля для всех регионов (lazy init для старых данных)
  for (const region of Object.values(GAME_STATE.regions)) {
    if (!Array.isArray(region.building_slots))    region.building_slots    = [];
    if (!Array.isArray(region.construction_queue)) region.construction_queue = [];
  }

  // Пересчёт занятости по building_slots (данные в regions_data.js могут быть устаревшими)
  if (typeof recalculateAllEmployment === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { recalculateAllEmployment(nationId); } catch (e) { console.warn('[init_employment]', e); }
    }
  }

  // Инициализируем world_stockpile и price_history до первого рендера
  // чтобы Биржа в Экономическом обзоре показывала реальные данные с хода 1.
  if (typeof GOODS !== 'undefined') {
    for (const [good, mkt] of Object.entries(GAME_STATE.market || {})) {
      if (mkt.world_stockpile == null) {
        const targetTurns = GOODS[good]?.stockpile_target_turns ?? 4;
        mkt.world_stockpile = (mkt.demand || mkt.supply || 100) * targetTurns;
      }
      if (!Array.isArray(mkt.price_history) || mkt.price_history.length === 0) {
        mkt.price_history = [mkt.price ?? mkt.base ?? 10];
      }
    }
  }

  // Инициализируем pops для всех наций (wealth, satisfied) до первого рендера
  if (typeof ensureNationPops === 'function') {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      try { ensureNationPops(nationId); } catch (e) { /* ignore */ }
    }
  }

  // Предварительный расчёт доходов/расходов для UI (без изменения казны)
  if (typeof _initEconomyPreview === 'function') {
    try { _initEconomyPreview(); } catch (e) { console.warn('[init_economy_preview]', e); }
  }

  // Первоначальный рендер
  renderAll();

  if (!hasSave) {
    addEventLog('Начало игры. 301 год до н.э. Вы — тиран Сиракуз Агафокл.', 'info');
    addEventLog('Карфаген угрожает с запада. Рим растёт на севере. Действуйте, стратег.', 'info');
  }

  // Привязываем кнопку конца хода
  const endTurnBtn = document.getElementById('end-turn-btn');
  if (endTurnBtn) {
    endTurnBtn.addEventListener('click', processTurn);
  }

  // Инициализируем сенаты для новой игры (при загрузке сенаты восстанавливаются из сохранения)
  if (!hasSave && typeof initAllSenates === 'function') {
    initAllSenates();
  }

  // Инициализируем возрастную демографию (lazy init для всех наций)
  if (typeof initAgeCohorts === 'function') {
    for (const nation of Object.values(GAME_STATE.nations)) {
      try { initAgeCohorts(nation); } catch (e) { /* ignore */ }
    }
  }

  // ── Инициализация экономических переменных (Bugfix) ───────────────────────

  // Fix #2a: _production_mod используется в _calcSlotBaseOutput на Ход 1,
  // до того как updateHappiness() его установит. Инициализируем нейтральным значением.
  for (const nation of Object.values(GAME_STATE.nations)) {
    _ensureNationDefaults(nation);
    if (nation.population._production_mod == null) {
      nation.population._production_mod = 1.0;
    }
  }

  // Классовая экономика: накопленный капитал и средний доход на человека.
  //
  // class_capital[cls]           — накопленный золотой запас класса (персистентный).
  //   Пополняется каждый тик через distributeClassIncome().
  //   Тратится когда класс строит здание (autonomous_builder).
  //   Уходит в 0 (→ 'nation') при банкротстве класса-владельца здания.
  //
  // class_income_per_capita[cls] — средний доход на 1 человека за тик (только для UI).
  //   Обновляется в distributeClassIncome(), не хранится между тиками.
  //
  // Стартовые значения: скромный начальный капитал пропорционально размеру класса.
  // Аристократы богаче — могут начать инвестировать раньше.
  for (const nation of Object.values(GAME_STATE.nations)) {
    if (!nation.economy.class_capital) {
      nation.economy.class_capital = {
        aristocrats:    5000,   // могут начать строить латифундию сразу (порог 5500)
        soldiers_class: 1000,   // нужно накопить до 3600 для виллы
        farmers_class:  500,    // нужно накопить до 3100 для фермы
      };
    }
    if (!nation.economy.class_income_per_capita) {
      nation.economy.class_income_per_capita = {
        aristocrats:    0,
        soldiers_class: 0,
        farmers_class:  0,
      };
    }
  }

  // Fix #4: Гарантируем, что все товары из GOODS присутствуют в GAME_STATE.market.
  // Нужно при добавлении новых товаров в GOODS без правки INITIAL_GAME_STATE.
  if (typeof initializeAllMarketEntries === 'function') {
    initializeAllMarketEntries(GAME_STATE.market);
  }

  // Запускаем фоновый AI-цикл — phi4-mini обрабатывает нации непрерывно,
  // решения кэшируются в _aiPending и применяются мгновенно при нажатии хода.
  startAIBackgroundLoop();
}

// Рендерим всё разом — каждая функция изолирована, чтобы ошибка в одной не ломала остальные
function renderAll() {
  try { renderMap(); }                    catch (e) { console.error('renderMap error:', e); }
  try { renderLeftPanel(); }              catch (e) { console.error('renderLeftPanel error:', e); }
  try { renderRightPanel(); }             catch (e) { console.error('renderRightPanel error:', e); }
  try { updateDateDisplay(); }            catch (e) { console.error('updateDateDisplay error:', e); }
  try { renderCharInitiativesPanel(); }   catch (e) { console.error('renderCharInitiativesPanel error:', e); }
  try { if (typeof renderOrdersPanel    === 'function') renderOrdersPanel();    } catch (e) {}
  try { if (typeof _applyLogFilter      === 'function') _applyLogFilter();      } catch (e) {}
  try { if (typeof refreshPopulationTab === 'function') refreshPopulationTab(); } catch (e) {}
  try { if (typeof refreshEconomyTab    === 'function') refreshEconomyTab();    } catch (e) {}
  try { if (typeof renderAllArmies      === 'function') renderAllArmies();      } catch (e) {}
}
