// Главный игровой цикл — один ход = один месяц

let IS_PROCESSING_TURN = false;

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

async function processTurn() {
  if (IS_PROCESSING_TURN) return;
  IS_PROCESSING_TURN = true;

  const btn = document.getElementById('end-turn-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Ход идёт...';
  }

  try {
    const date = GAME_STATE.date;
    const monthName = MONTH_NAMES?.[Math.max(1, Math.min(12, date.month ?? 1))] ?? 'Месяц';
    addEventLog(`── Ход ${GAME_STATE.turn}: ${monthName} ${Math.abs(date.year)} г. до н.э. ──`, 'turn');

    // 0.8. Договоры — сброс флагов, финансовые потоки (дань, контрибуции), истечение
    if (typeof processAllTreatyTicks === 'function') {
      try { processAllTreatyTicks(); } catch (e) { console.warn('[treaty_effects]', e); }
    }

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
    //    Внутри:
    //      0    applyPopSatisfiedToBuildings   (satisfied прошлого тика → _pop_eff)
    //      0.5  computeWorldMarketQuotas       (квоты мирового рынка)
    //           procureCapitalInputs           (закупка инструментов/скота)
    //      0.6  procureSlaves                  (закупка рабов для латифундий)
    //      1    processAllRecipes + calculateProduction + routeProduction
    //      1.5  buildProvinceMarket + updateRegionalMarketPrices
    //      2    calculateConsumption
    //      3    updateBuildingFinancials
    //      4а   distributeWages
    //      4б   distributeClassIncome
    //      4в   updatePopWealth
    //      5    updateMarketPrices (world)
    //      5б   processAutonomousBuilding
    //      5в   checkClassBankruptcy
    //      6    processTrade + updateTreasury + события
    try { runEconomyTick(); } catch (e) { console.error('[economy]', e); }

    // 1.1. Запись истории экономики (для вкладки «Экономический обзор»)
    if (typeof recordEconomyHistory === 'function') {
      try { recordEconomyHistory(); } catch (e) { console.warn('[econ_history]', e); }
    }

    // 1.5. Правительство (детерминировано)
    try { processAllGovernmentTicks(); } catch (e) { console.error('[government]', e); }

    // 1.6. Конституционный движок — тирания, гражданская война
    try { CONSTITUTIONAL_ENGINE.tick(GAME_STATE.player_nation); } catch (e) { console.error('[constitutional]', e); }

    // 1.7. Движок заговоров — инкубация, вербовка, Час Икс (для всех наций)
    for (const _conspNationId of Object.keys(GAME_STATE.nations)) {
      try { await CONSPIRACY_ENGINE.tick(_conspNationId); } catch (e) { console.warn('[conspiracy]', _conspNationId, e); }
    }

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
    try {
      if (typeof processDemography === 'function') {
        processDemography();
      } else {
        updatePopulationGrowth(); // fallback
      }
    } catch (e) { console.error('[demography]', e); }

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

    // 3.5–3.6. Диалоговый движок — сжимаем горячую память для ВСЕХ наций
    for (const nId of Object.keys(GAME_STATE.nations ?? {})) {
      try {
        // nation.characters (советники, генералы, жрецы, купцы...)
        await DIALOGUE_ENGINE.tick(nId);
        // Сенаторы и члены советов (хранятся вне nation.characters)
        const _mgr = getSenateManager(nId);
        if (_mgr) {
          for (const sen of (_mgr.senators ?? [])) {
            if (sen.dialogue?.hot_memory?.length) await DIALOGUE_ENGINE.compressDirect(sen);
          }
        }
      } catch (e) { console.warn('[dialogue]', nId, e); }
    }

    // 4. AI нации — решения (Claude, параллельно)
    try { await processAINations(); } catch (e) { console.warn('[ai_nations]', e); }

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

    // 5.4в. Движение армий и обработка осад
    if (typeof processArmyMovement === 'function') {
      try { processArmyMovement(); } catch (e) { console.warn('[army_movement]', e); }
    }

    // 5.5. Прогресс активных приказов (делегирование)
    if (typeof processAllOrders === 'function') {
      try { processAllOrders(); } catch (e) { console.warn('[orders]', e); }
    }

    // 5.55. Автономное поведение персонажей (fire-and-forget)
    processCharacterAutonomy(GAME_STATE.player_nation).catch(console.warn);

    // 5.6. Условия победы / поражения
    try { checkVictoryConditions(); } catch (e) { console.warn('[victory]', e); }

    // 6. Обновляем дату
    advanceDate();

    // 6.5. Итоги хода
    try { _recordTurnSummary(); } catch (e) { console.warn('[summary]', e); }

    // 7. Автосохранение
    saveGame();

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

  const promises        = [];
  const pendingNationIds = [];

  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    if (nation.is_player) continue;
    if (nation.is_minor)  continue;

    // Каждые 3 хода AI нации принимают решение
    if (GAME_STATE.turn % 3 !== 0) continue;

    // Определяем tier доступности (1=Sonnet, 2=Haiku, 3=только fallback)
    const tier = typeof getNationTier === 'function'
      ? getNationTier(nationId)
      : 1;

    if (tier === 3) {
      // Дальняя нация — не тратим API, только детерминированный fallback
      applyFallbackDecision(nationId);
      continue;
    }

    // Tier 1 → Sonnet (полный контекст), Tier 2 → Haiku (экономия)
    const model = tier === 1 ? CONFIG.MODEL_SONNET : CONFIG.MODEL_HAIKU;

    pendingNationIds.push(nationId);
    promises.push(
      getAINationDecision(nationId, model).catch(err => {
        console.warn(`AI fallback для ${nationId} (tier ${tier}):`, err.message);
        applyFallbackDecision(nationId);
      })
    );
  }

  if (promises.length > 0) {
    // Таймаут 15 секунд
    const timeoutId      = { fired: false };
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => { timeoutId.fired = true; reject(new Error('AI timeout')); }, 15000)
    );

    try {
      await Promise.race([Promise.all(promises), timeoutPromise]);
    } catch (err) {
      if (timeoutId.fired) {
        console.warn('processAINations: таймаут 15с, применяем fallback');
        for (const nId of pendingNationIds) applyFallbackDecision(nId);
      }
    }
  }

  // ── Анти-сноуболл (каждый ход для всех AI-наций) ───────────────
  if (typeof processConquestFatigue === 'function') {
    try { processConquestFatigue(); } catch (e) { console.warn('[conquest_fatigue]', e); }
  }
  if (typeof checkCoalitionReflex === 'function') {
    try { checkCoalitionReflex(); } catch (e) { console.warn('[coalition_reflex]', e); }
  }
}

// Детерминированное решение при недоступности AI
function applyFallbackDecision(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  const treasury = nation.economy.treasury;
  const military = nation.military;
  const pop = nation.population;

  // Приоритет 1: если мало армии относительно населения — рекрутируем
  // cavalry * 3: cavalry units count as 3x for military strength purposes (mounted troops are ~3x more effective)
  const armyRatio = (military.infantry + military.cavalry * 3) / Math.max(1, pop.total);
  if (armyRatio < 0.01 && treasury > 2000) {
    const recruits = Math.min(Math.floor(treasury / 10), Math.floor(pop.total * 0.005));
    if (recruits > 0) {
      military.infantry += recruits;
      nation.economy.treasury -= recruits * CONFIG.BALANCE.INFANTRY_UPKEEP * 5;
    }
    return;
  }

  // Приоритет 2: если в войне — усилить армию
  const atWar = (military.at_war_with || []).length > 0;
  if (atWar && treasury > 3000) {
    const recruits = Math.min(Math.floor(treasury * 0.02), 500);
    military.infantry += recruits;
    nation.economy.treasury -= recruits * CONFIG.BALANCE.INFANTRY_UPKEEP * 3;

    // Нанять наёмников если есть деньги
    if (treasury > 5000 && military.mercenaries < 300) {
      const mercs = Math.min(100, Math.floor((treasury - 3000) / 20));
      military.mercenaries += mercs;
      nation.economy.treasury -= mercs * CONFIG.BALANCE.MERCENARY_UPKEEP * 5;
    }
    return;
  }

  // Приоритет 3: дипломатия — попытаться заключить торговый договор
  if (!atWar && treasury > 1000 && GAME_STATE.turn % 12 === 0) {
    for (const [otherId, rel] of Object.entries(nation.relations || {})) {
      if (rel.at_war || (rel.treaties || []).includes('trade')) continue;
      if (rel.score > -10) {
        // Предлагаем торговлю
        const chance = (rel.score + 50) / 100;
        if (Math.random() < chance * 0.5) {
          rel.treaties = rel.treaties || [];
          rel.treaties.push('trade');
          rel.score = Math.min(100, rel.score + 10);
          // Взаимно
          const other = GAME_STATE.nations[otherId];
          if (other?.relations?.[nationId]) {
            other.relations[nationId].treaties = other.relations[nationId].treaties || [];
            if (!other.relations[nationId].treaties.includes('trade')) {
              other.relations[nationId].treaties.push('trade');
            }
            other.relations[nationId].score = Math.min(100, other.relations[nationId].score + 10);
          }
          break; // одно действие за ход
        }
      }
    }
    return;
  }

  // Приоритет 4: накапливать деньги (ничего не делаем)
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
}

// ──────────────────────────────────────────────────────────────
// СОХРАНЕНИЕ / ЗАГРУЗКА
// ──────────────────────────────────────────────────────────────

function saveGame() {
  try {
    // Сериализуем SENATE_MANAGERS отдельно (они не входят в GAME_STATE)
    const senateData = {};
    for (const [nationId, mgr] of Object.entries(SENATE_MANAGERS)) {
      senateData[nationId] = mgr.toJSON();
    }
    const saveData = JSON.stringify({ ...GAME_STATE, _senate: senateData });
    localStorage.setItem(CONFIG.SAVE_KEY, saveData);
  } catch (e) {
    console.warn('Не удалось сохранить игру:', e);
  }
}

function loadGame() {
  try {
    const saved = localStorage.getItem(CONFIG.SAVE_KEY);
    if (saved) {
      const loadedState = JSON.parse(saved);

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
    }
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

function initGame() {
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

  // Попытка загрузки сохранения
  const hasSave = loadGame();

  // Стартовый склад — только для новых игр (не загруженных сохранений).
  // Решает проблему холодного старта для циклических зависимостей:
  //   wheat нужна wheat (семена), barley нужен barley (семена),
  //   tools нужны для шахт и ферм, но tools требуют iron, iron требует charcoal.
  // Используем Math.max — не уменьшаем склад у наций которые уже имеют больше.
  if (!hasSave) {
    const STARTING_STOCKPILE = {
      // Еда
      wheat:      500,   // семена: ферма потребляет ~0.20/ед. выхода
      barley:     400,   // семена: аналогично пшенице
      fish:       200,   // быстрый источник белка
      salt:       150,   // консервирование рыбы и мяса
      // Производственная цепочка
      tools:      250,   // кирки/плуги
      iron:       150,   // запас для кузницы
      charcoal:   100,   // плавка + отопление
      timber:     120,   // строительство, плавка
      // Животноводство
      cattle:     80,    // тягловая сила для ферм (capital_input)
      // Ремёсла
      pottery:    100,   // тара для вина, рыбы, масла
      leather:    60,    // упряжь, обувь
    };
    for (const nation of Object.values(GAME_STATE.nations)) {
      const sp = nation.economy?.stockpile;
      if (!sp) continue;
      for (const [good, min] of Object.entries(STARTING_STOCKPILE)) {
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
}

// Рендерим всё разом — каждая функция изолирована, чтобы ошибка в одной не ломала остальные
function renderAll() {
  try { renderMap(); }                    catch (e) { console.error('renderMap error:', e); }
  try { renderLeftPanel(); }              catch (e) { console.error('renderLeftPanel error:', e); }
  try { renderRightPanel(); }             catch (e) { console.error('renderRightPanel error:', e); }
  try { updateDateDisplay(); }            catch (e) { console.error('updateDateDisplay error:', e); }
  try { renderCharInitiativesPanel(); }   catch (e) { console.error('renderCharInitiativesPanel error:', e); }
  try { if (typeof _applyLogFilter === 'function') _applyLogFilter(); } catch (e) {}
  try { if (typeof refreshPopulationTab  === 'function') refreshPopulationTab();  } catch (e) {}
  try { if (typeof refreshEconomyTab    === 'function') refreshEconomyTab();    } catch (e) {}
  try { if (typeof renderAllArmies      === 'function') renderAllArmies();      } catch (e) {}
}
