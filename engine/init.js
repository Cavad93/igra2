// engine/init.js — Инициализация игры и полный рендер
// Вынесено из engine/turn.js (Этап 53)

import { CONFIG } from '../config.js';
import { GOODS } from '../data/goods.js';

export async function initGame() {
  // Инициализируем GAME_STATE из стартовых данных
  Object.assign(GAME_STATE, JSON.parse(JSON.stringify(INITIAL_GAME_STATE)));

  // Загружаем персонажей для игрока
  GAME_STATE.nations.syracuse.characters = JSON.parse(
    JSON.stringify(INITIAL_CHARACTERS_SYRACUSE)
  );

  // Загружаем персонажей крупных наций (при их наличии в текущем пресете —
  // Pax Historia 304 BC включает не все страны первоначального датасета)
  if (GAME_STATE.nations.rome) {
    GAME_STATE.nations.rome.characters = JSON.parse(JSON.stringify(INITIAL_SENATORS_ROME));
  }
  if (GAME_STATE.nations.carthage) {
    GAME_STATE.nations.carthage.characters = JSON.parse(JSON.stringify(INITIAL_COUNCIL_CARTHAGE));
  }
  if (GAME_STATE.nations.ptolemaic_kingdom) {
    GAME_STATE.nations.ptolemaic_kingdom.characters = JSON.parse(JSON.stringify(INITIAL_COURT_EGYPT));
  }
  if (GAME_STATE.nations.macedon) {
    GAME_STATE.nations.macedon.characters = JSON.parse(JSON.stringify(INITIAL_HETAIROI_MACEDON));
  }
  if (GAME_STATE.nations.numidia) {
    GAME_STATE.nations.numidia.characters = JSON.parse(JSON.stringify(INITIAL_ELDERS_NUMIDIA));
  }

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

    // ── НОРМАЛИЗАЦИЯ СТАРТОВОЙ КАЗНЫ ──────────────────────────
    // Фикс бага «86% наций в минусе на ходе 2».
    // Крупные нации (например zhao с 146k инфантерии) имеют armyUpkeep ≈ 520k/ход
    // при стартовой treasury 8107 и income 1.5k — разрыв 1:343. Нация банкротится
    // мгновенно. Устанавливаем минимум = 12 × месячного upkeep + 20% маржа.
    // Math.max: не понижаем казну у тех кто уже богат.
    if (!GAME_STATE._startup_treasury_normalized) {
      const INFANTRY_UPKEEP  = CONFIG.BALANCE?.INFANTRY_UPKEEP  ?? 2;
      const CAVALRY_UPKEEP   = CONFIG.BALANCE?.CAVALRY_UPKEEP   ?? 5;
      const MERCENARY_UPKEEP = CONFIG.BALANCE?.MERCENARY_UPKEEP ?? 4;
      const SHIP_UPKEEP      = CONFIG.BALANCE?.SHIP_UPKEEP      ?? 10;

      for (const nation of Object.values(GAME_STATE.nations)) {
        const mil = nation.military;
        const eco = nation.economy;
        if (!mil || !eco) continue;

        const annualArmy = 12 * (
          (mil.infantry    ?? 0) * INFANTRY_UPKEEP  +
          (mil.cavalry     ?? 0) * CAVALRY_UPKEEP   +
          (mil.mercenaries ?? 0) * MERCENARY_UPKEEP +
          (mil.ships       ?? 0) * SHIP_UPKEEP
        );
        const minTreasury = Math.round(annualArmy * 1.2);
        eco.treasury = Math.max(eco.treasury ?? 0, minTreasury);
      }

      GAME_STATE._startup_treasury_normalized = true;
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
  {
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

  // Гарантируем базовые поля для всех наций (включая stub-нации без economy/population)
  // до _initEconomyPreview, чтобы income_per_turn/expense_per_turn были числами с хода 1.
  for (const nation of Object.values(GAME_STATE.nations)) {
    _ensureNationDefaults(nation);
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
  if (typeof window.initializeAllMarketEntries === 'function') {
    window.initializeAllMarketEntries(GAME_STATE.market);
  }

  // Запускаем фоновый AI-цикл — phi4-mini обрабатывает нации непрерывно,
  // решения кэшируются в _aiPending и применяются мгновенно при нажатии хода.
  startAIBackgroundLoop();

  // Прогреваем Save Worker заранее — если файловый протокол или CSP блокирует Worker,
  // это выясняется сейчас, а не при первом ходу, что убирает ~1.5с задержку хода 1.
  if (typeof warmupSaveWorker === 'function') warmupSaveWorker();
}

// Session 19 — renderAll() разделён на critical + deferred.
// renderCritical() — немедленно видимые части (карта, топ-бар, левая/правая панели, стела, сезон).
// renderDeferred() — вкладки и маркеры, которые игрок видит только при открытии панели или
// при разглядывании карты: их можно считать «eventually consistent».
// renderAll() по-прежнему API: выполняет critical синхронно и планирует deferred через rIC.

// Немедленная (критичная) часть — то, что игрок видит сразу после клика/хода.
export function renderCritical() {
  try { renderMap(); }                    catch (e) { console.error('renderMap error:', e); }
  try { renderLeftPanel(); }              catch (e) { console.error('renderLeftPanel error:', e); }
  try { renderRightPanel(); }             catch (e) { console.error('renderRightPanel error:', e); }
  try { updateDateDisplay(); }            catch (e) { console.error('updateDateDisplay error:', e); }
  // Этап 10 (uisuper.md) — стела: имя правителя и дата
  try { updateStele(); }                  catch (e) { console.error('updateStele error:', e); }
  // Шаг 45 — сезонный визуал (фильтр карты, оверлей, иконка в топ-баре)
  try { if (typeof applySeasonVisual === 'function') applySeasonVisual(); } catch (e) { console.error('applySeasonVisual error:', e); }
}

// Отложенная часть — вкладки, маркеры, ambient. Запускается из requestIdleCallback.
export function renderDeferred() {
  try { renderCharInitiativesPanel(); }   catch (e) { console.error('renderCharInitiativesPanel error:', e); }
  try { if (typeof window.renderOrdersPanel    === 'function') window.renderOrdersPanel();    } catch (e) {}
  try { if (typeof _applyLogFilter      === 'function') _applyLogFilter();      } catch (e) {}
  try { if (typeof refreshPopulationTab === 'function') refreshPopulationTab(); } catch (e) {}
  try { if (typeof refreshEconomyTab    === 'function') refreshEconomyTab();    } catch (e) {}
  try { if (typeof renderAllArmies      === 'function') renderAllArmies();      } catch (e) {}
  // Шаг 40: обновить маркеры прогресса строительства на карте
  try { if (typeof renderBuildMarkers   === 'function') renderBuildMarkers();   } catch (e) {}
  // uisuper Этап 18 — обновить подписи столиц (владелец мог смениться)
  try { if (typeof renderCityLabels     === 'function') renderCityLabels();     } catch (e) {}
  // ECO_009: обновить торговые маршруты если панель открыта
  try {
    if (typeof window.showTradeRoutes !== 'undefined' && window.showTradeRoutes) {
      clearTradeRouteLines?.();
      renderTradeRouteLines?.();
    }
  } catch (e) {}
  // uisuper Этап 29 — Ambient: синхронизировать интенсивность с войной/миром.
  try {
    if (typeof window !== 'undefined' && window.AmbientLayer
        && typeof window.AmbientLayer.setIntensity === 'function') {
      const st = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
      const pid = st && st.playerNationId;
      const nat = pid && st.nations ? st.nations.find(n => n && n.id === pid) : null;
      const warList = nat && nat.military && Array.isArray(nat.military.at_war_with)
        ? nat.military.at_war_with : [];
      // 0 войн → 0.3 (мир), 1 война → 0.5, 2+ → 0.7, 3+ → 0.9.
      let intensity = 0.3;
      if (warList.length === 1) intensity = 0.5;
      else if (warList.length === 2) intensity = 0.7;
      else if (warList.length >= 3) intensity = 0.9;
      window.AmbientLayer.setIntensity(intensity);
    }
  } catch (e) {}
}

// Идентификатор уже запланированного idle-callback'а — чтобы несколько renderAll()
// в одном фрейме не плодили дубль-deferred вызовов (важно на input-флудах).
let _deferredRenderHandle = null;

function _scheduleDeferredRender() {
  // Коалесцируем: если уже запланировано — пропускаем.
  if (_deferredRenderHandle !== null) return;
  const g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  const ric = g && typeof g.requestIdleCallback === 'function' ? g.requestIdleCallback.bind(g) : null;
  const run = () => {
    _deferredRenderHandle = null;
    try { renderDeferred(); } catch (e) { console.error('renderDeferred error:', e); }
  };
  if (ric) {
    _deferredRenderHandle = ric(run, { timeout: 200 });
  } else {
    // Fallback: setTimeout(0) — тесты в jsdom, Safari (нет rIC).
    _deferredRenderHandle = setTimeout(run, 0);
  }
}

// Полный рендер (сохраняем API) — critical немедленно, deferred через rIC.
// Используется из initGame() и processTurn().
export function renderAll() {
  renderCritical();
  _scheduleDeferredRender();
  // Этап CB-10: показать pending peace offer для игрока (если есть).
  if (typeof renderPendingPeaceOffers === 'function') {
    try { renderPendingPeaceOffers(); } catch (_) {}
  }
}


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

