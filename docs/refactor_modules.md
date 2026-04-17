# План перехода на ES-модули

> Автоматический аудит графа зависимостей. Этап 55.

---

## 1. Граф экспортов (window.X = ...)

Всего файлов с экспортами: **48** | Всего экспортов: **267**

| Файл | Экспорты |
|------|----------|
| js/rng.js | seededRNG |
| data/culture_groups.js | getPortraitInfoForCharacter |
| data/portrait_filters.js | PORTRAIT_FILTERS, getPortraitFilter |
| engine/noise.js | PerlinNoise, domainWarp, fbm, generateHeightmap, getHeight, mulberry32 |
| engine/date.js | MONTH_NAMES, SEASON_STYLES, advanceDate, applySeasonVisual, formatDate, getCurrentSeason, toRomanYear, updateDateDisplay, updateStele |
| engine/characters_lifecycle.js | agingCharacters, checkCharacterDeaths, maybeSpawnCharacter |
| engine/combat.js | _onTacticalBattleEnd |
| engine/espionage.js | _cleanExpiredCasusBelli, _processEspionageTick |
| engine/events.js | RANDOM_EVENTS, _showEventChoiceOverlay, triggerRandomEvent |
| engine/save.js | loadGame, saveGame, warmupSaveWorker |
| engine/init.js | initGame, renderAll |
| engine/super_ou.js | SuperOU |
| engine/ai_fallback.js | applyFallbackDecision |
| engine/ai_scoring.js | _SUPER_OU_ACTION_MAP, _findBuildTarget, _findDiplomacyPartner, _findWarTarget, _softmax, _tickOU, _weightedPick |
| engine/ai_worker.js | _aiPending, _callGroqViaWorker, startAIBackgroundLoop, stopAIBackgroundLoop |
| engine/economy_ext.js | ARMY_UNDERFUND_PENALTY, ARMY_UNDERFUND_THRESHOLD, CYCLE_GOODS, CYCLE_TYPES, INFLATION_MAX, INFLATION_STEP, INFLATION_STEP_FAST, MONOPOLY_DIPLOMACY_BONUS, MONOPOLY_PRICE_BONUS, SPEC_MAX_BONUS, SPEC_STEP_BONUS, SPEC_STREAK_WINDOW, TECH_DRIFT_INTERVAL, TECH_DRIFT_MAX, TECH_DRIFT_STEP, TREASURY_CRITICAL_RATIO, TREASURY_HOARD_RATIO, UNORGANIZED_PENALTY, addEconomicEvent, calcNormalArmyExpense, calcTradeBalance, detectMonopolies, getArmyCombatMult, getArmyFundingRatio, getCycleMult, getEconomicCycleBanner, getInflationMult, getMonopolyPriceMult, getRegionSpecBonus, getTechDriftMult, hasRegionBuildings, initEconomyExt, renderRegionProductionEfficiency, renderTechDrift, runEconomyExtTick, updateArmyFunding, updateEconomicCycle, updateInflation, updateRegionSpecialization, updateTechDrift |
| ai/anomaly_handler.js | AnomalyHandler |
| ai/chronicle.js | ChronicleSystem |
| ai/strategic_llm.js | StrategicLLM |
| ui/icons.js | ICONS, icon |
| ui/ambient.js | AmbientLayer |
| ui/aqueduct.js | AquaWidget |
| ui/boot.js | handleGenerateChars |
| ui/clepsydra.js | Clepsydra |
| ui/diplo_graph.js | closeDiploGraph, isDiploGraphOpen, onDiploGraphNodeClick, openDiploGraph, renderDiploGraph, toggleDiploGraph |
| ui/diptych.js | Diptych, switchDiptychTab, toggleDiptych |
| ui/government_tab.js | _govSetupState, toggleOrdersMini, updateOrdersMiniCount |
| ui/input.js | Messenger, dismissMessenger |
| ui/log.js | addEventLog, renderLog, resetLogNotifications, toggleLog, updateLogCollapsed, updateLogDots |
| ui/map.js | CURRENT_MAP_MODE, MAP_MODES, WindRose, ZOOM_LEVELS, _applyCityLabelVisibility, _applyZoomFillOpacity, _buildDetailBuildingsLayer, _buildDetailGarrisonsLayer, clearCityLabels, clearTradeRouteLines, getIntelLabel, getIntelLevel, getZoomLevel, initWindRoseKeyboard, invalidateFogIntelCache, onZoomChange, refreshFogOverlay, renderCityLabels, renderTradeRouteLines, roughEstimate, setMapMode |
| ui/map_ai_indicators.js | AI_INDICATOR_ACTION_MAP, AI_INDICATOR_MAX, clearAIIndicators, getAIActions, getAIActionsCount, getAIIndicatorMarkers, recordAIAction, renderAIIndicators |
| ui/map_event_feed.js | EVENT_FEED_DELAY_MS, EVENT_FEED_LIFETIME_MS, EVENT_FEED_MAX_ACTIVE, addMapEvent, clearMapEventFeed, getActiveMapEventCount, getMapEventQueueLength, processEventFeedQueue |
| ui/map_events.js | MAP_EVENT_TYPES, clearMapEvents, showMapEvent |
| ui/panels.js | _closeRosterMenu, _hideAlertBadge, _pushResourceHistory, _showRosterMenu, _swapCourtPositions, applyNationTheme, drawSparkline, initCourtDragDrop, onResourceBarClick, preloadTexture, renderLeftPanelTab, setRosterFilter, setRosterSort, updateAlertBadges, updateNationHeader, updateResourceBar |
| ui/portrait.js | __renderPortraitFallback, renderPortrait, renderPortraitHTML |
| ui/portrait_svg.js | generatePortraitDataURL, generatePortraitSVG |
| ui/pulse.js | PULSE_TYPES, triggerPulse |
| ui/reactions.js | UIReactions |
| ui/region_compare.js | closeCompare, getPinnedRegionId, handleRegionClickForCompare, pinRegionForCompare, renderComparePanel |
| ui/splash.js | hideSplashWithAnimation, initSplash, showSplashStartButton |
| ui/splash_mosaic.js | SplashMosaic |
| ui/status_bar.js | markSaved, setAIStatus, updateSaveIndicator, updateSbGame |
| ui/toast.js | showToast |
| ui/top_bar.js | closeCtxMenu, closeSearchPanel, closeSettingsModal, closeTopModal, cycleMapMode, focusCommandInput, focusNextAlert, goToSearchResult, isSearchOpen, onHotkey, onSearchInput, openSearchPanel, openSettingsModal, performSearch, renderSearchResults, showContextMenu, switchLeftTab, switchSettingsTab, toggleSearchPanel, toggleSettingsModal |
| ui/treasury-panel.js | _tpRenderEconomyExtSummary |
| ui/turn_progress.js | TURN_ACTIONS, markTurnAction, renderTurnProgress, resetTurnProgress |
| ui/turn_summary_card.js | closeTurnSummaryCard, showTurnSummaryCard, snapshotNationState |
| ui/battle_map_pixi.js | BIOMES, addBattleMapTicker, attachBattleMapInteractions, buildProceduralParchmentCanvas, buildRiverSparkles, buildTerrainCanvas, buildVignetteCanvas, chaikin, chaikinSmooth, clearTerrainCache, createBattleMapState, deselectAll, destroyBattleMap, drawAimLine, drawCatmullRomBezier, drawPolyline, drawRiverSparkles, emitDamageNumber, fillTerrainPixels, getBiomeAt, getBiomeColor, initBattleMap, loadParchmentTexture, mapRiverPathToScreen, onMapClick, pauseBattleMap, redrawUnit, removeAimLine, removeBattleMapTicker, renderAllUnits, renderForests, renderFortifications, renderParchmentOverlay, renderRivers, renderRiversPolished, renderRoads, renderTerrain, renderTerrainCached, renderTerrainOverlays, renderUnit, renderVignette, resumeBattleMap, sampleSparklePosition, selectBattalion, startRiverSparkleTicker, stepBattleMapAnimations |

---

## 2. Граф импортов (window.X чтение)

### Ключевые глобалы (самые зависимые)

| Глобал | Кол-во файлов-потребителей |
|--------|---------------------------|
| GAME_STATE | 50+ |
| CONFIG | 30+ |
| MAP_REGIONS | 20+ |
| GOODS | 15+ |
| BUILDINGS | 15+ |
| window.SuperOU | 12+ |
| window.icon() | 10+ |
| ICONS | 8+ |
| EVENTS | 6+ |
| processTurn | 6+ |

### data/

| Файл | Читает глобалы |
|------|----------------|
| data/biomes.js | — |
| data/buildings.js | BUILDINGS |
| data/chains_data.js | — |
| data/chains_graph.js | — |
| data/characters.js | — |
| data/culture_groups.js | getPortraitInfoForCharacter |
| data/cultures.js | — |
| data/deposit_map.js | — |
| data/dogmas.js | CONFIG |
| data/goods.js | BUILDINGS, CONFIG, GAME_STATE, GOODS |
| data/goods_labor.js | GOODS |
| data/goods_meta.js | GOODS |
| data/laws_labor.js | — |
| data/map.js | MAP_REGIONS |
| data/nation_enriched.js | — |
| data/nation_geo.js | — |
| data/nations.js | GAME_STATE, GOODS |
| data/pdf_chains.js | — |
| data/portrait_filters.js | PORTRAIT_FILTERS, getPortraitFilter |
| data/region_areas.js | — |
| data/region_assignments.js | — |
| data/region_centroids.js | — |
| data/regions_data.js | BUILDINGS, GAME_STATE |
| data/religion_regions.js | — |
| data/religions.js | CONFIG |
| data/social_classes.js | CONFIG |
| data/traditions/traditions_index.js | CONFIG |
| data/traditions/* (остальные 9) | — |

### js/

| Файл | Читает глобалы |
|------|----------------|
| js/rng.js | seededRNG |

### engine/

| Файл | Читает глобалы |
|------|----------------|
| engine/achievements.js | GAME_STATE, ChronicleSystem |
| engine/age_demographics.js | CONFIG, GAME_STATE |
| engine/ai_fallback.js | CONFIG, GAME_STATE, SuperOU, recordAIAction |
| engine/ai_scoring.js | BUILDINGS, GAME_STATE |
| engine/ai_worker.js | CONFIG, GAME_STATE, SuperOU |
| engine/armies.js | BUILDINGS, GAME_STATE, MAP_REGIONS |
| engine/battalion.js | — |
| engine/battle.js | GAME_STATE, MAP_REGIONS, UIReactions, showToast |
| engine/buildings.js | BUILDINGS, CONFIG, GAME_STATE, GOODS, MAP_REGIONS |
| engine/characters_ai.js | CONFIG, GAME_STATE |
| engine/characters_lifecycle.js | GAME_STATE, SuperOU |
| engine/combat.js | GAME_STATE, MAP_REGIONS, _onTacticalBattleEnd |
| engine/conspiracy.js | GAME_STATE, processTurn |
| engine/constitutional.js | GAME_STATE, processTurn |
| engine/culture.js | CONFIG, GAME_STATE, MAP_REGIONS, processTurn |
| engine/date.js | GAME_STATE |
| engine/demography.js | BUILDINGS, CONFIG, EVENTS, GAME_STATE |
| engine/dialogue.js | CONFIG, GAME_STATE |
| engine/diplomacy.js | CONFIG, GAME_STATE, MAP_REGIONS, SuperOU, UI, UIReactions, showToast |
| engine/diplomacy_range.js | CONFIG, GAME_STATE, MAP_REGIONS, processTurn |
| engine/economy.js | BUILDINGS, CONFIG, GAME_STATE, GOODS, MAP_REGIONS, SuperOU, showToast |
| engine/economy_ext.js | CONFIG, GAME_STATE, GOODS |
| engine/espionage.js | GAME_STATE, SuperOU, UI |
| engine/events.js | EVENTS, GAME_STATE, MAP_REGIONS |
| engine/forests.js | — |
| engine/fortifications.js | — |
| engine/fortress.js | GAME_STATE, MAP_REGIONS, processTurn |
| engine/government.js | CONFIG, GAME_STATE, MAP_REGIONS |
| engine/init.js | CONFIG, GAME_STATE, GOODS, MAP_REGIONS, processTurn, AmbientLayer, initGame, renderAll |
| engine/land_capacity.js | BUILDINGS, GAME_STATE |
| engine/loans.js | GAME_STATE |
| engine/market.js | CONFIG, GAME_STATE, GOODS |
| engine/memory.js | CONFIG, EVENTS, GAME_STATE, processTurn |
| engine/noise.js | — (только свои экспорты) |
| engine/orders.js | BUILDINGS, GAME_STATE, GOODS, MAP_REGIONS |
| engine/pops.js | GAME_STATE, GOODS |
| engine/provinces.js | GAME_STATE, GOODS, processTurn |
| engine/religion.js | CONFIG, GAME_STATE, MAP_REGIONS |
| engine/rivers.js | — |
| engine/roads.js | — |
| engine/save.js | CONFIG, GAME_STATE |
| engine/save_worker.js | — |
| engine/senate.js | GAME_STATE |
| engine/siege.js | GAME_STATE, MAP_REGIONS |
| engine/storage.js | — |
| engine/super_ou.js | CONFIG, EVENTS, GAME_STATE, StrategicLLM, addEventLog |
| engine/tactical_battle.js | GAME_STATE, UNITS |
| engine/treaty_effects.js | GAME_STATE, DiplomacyEngine, SuperOU, UI, clearTradeRouteLines, renderTradeRouteLines, showTradeRoutes |
| engine/treaty_validator.js | GAME_STATE |
| engine/turn.js | CONFIG, GAME_STATE, processTurn, ChronicleSystem, Clepsydra, StrategicLLM, SuperOU, _processEspionageTick, _pushResourceHistory, clearAIIndicators, renderAIIndicators |
| engine/victory.js | GAME_STATE |
| engine/war_score.js | GAME_STATE |

### ai/

| Файл | Читает глобалы |
|------|----------------|
| ai/anomaly_handler.js | CONFIG |
| ai/chronicle.js | CONFIG, EVENTS, ICONS, ChronicleSystem, SuperOU, addEventLog, callClaude |
| ai/claude.js | BUILDINGS, CONFIG, GAME_STATE |
| ai/commander_ai.js | GAME_STATE, MAP_REGIONS |
| ai/diplomacy_ai.js | CONFIG, GAME_STATE |
| ai/parser.js | GAME_STATE, recordAIAction |
| ai/prompts.js | — |
| ai/strategic_llm.js | CONFIG |
| ai/treaty_interpreter.js | CONFIG, GAME_STATE |
| ai/utility_ai.js | GAME_STATE, MAP_REGIONS |

### ui/

| Файл | Читает глобалы |
|------|----------------|
| ui/ambient.js | AmbientLayer |
| ui/apikey.js | CONFIG |
| ui/aqueduct.js | AquaWidget |
| ui/battle_result.js | GAME_STATE |
| ui/boot.js | CONFIG, GAME_STATE, handleGenerateChars, icon |
| ui/clepsydra.js | Clepsydra |
| ui/diplo_graph.js | GAME_STATE, множество собственных экспортов |
| ui/diplomacy_tab.js | GAME_STATE, UI |
| ui/diptych.js | Diptych, renderLeftPanelTab, switchDiptychTab, toggleDiptych |
| ui/economy_tab.js | GAME_STATE, GOODS |
| ui/government_tab.js | GAME_STATE, ICONS, MAP_REGIONS, UI, _govSetupState, toggleOrdersMini, updateOrdersMiniCount |
| ui/icons.js | ICONS, icon |
| ui/input.js | CONFIG, GAME_STATE, MAP_REGIONS, Messenger, dismissMessenger |
| ui/log.js | GAME_STATE |
| ui/map.js | CONFIG, GAME_STATE, GOODS, ICONS, MAP_REGIONS, CURRENT_MAP_MODE, MAP_MODES, WindRose, ZOOM_LEVELS и 15+ внутренних |
| ui/map_ai_indicators.js | GAME_STATE, MAP_REGIONS |
| ui/map_armies.js | BUILDINGS, GAME_STATE, MAP_REGIONS |
| ui/map_event_feed.js | — (только свои экспорты) |
| ui/map_events.js | — (только свои экспорты) |
| ui/panels.js | CONFIG, GAME_STATE, AquaWidget и 15+ функций |
| ui/peace_panel.js | GAME_STATE |
| ui/population_tab.js | BUILDINGS, GAME_STATE, GOODS, ICONS |
| ui/portrait.js | — (только свои экспорты) |
| ui/portrait_svg.js | generatePortraitDataURL, generatePortraitSVG, hashCode, seededRNG |
| ui/pulse.js | — (только свои экспорты) |
| ui/reactions.js | AmbientLayer, UIReactions |
| ui/region_build_tab.js | BUILDINGS, GAME_STATE, GOODS |
| ui/region_compare.js | GAME_STATE, MAP_REGIONS |
| ui/siege_panel.js | GAME_STATE |
| ui/splash.js | — (только свои экспорты) |
| ui/splash_mosaic.js | SplashMosaic |
| ui/status_bar.js | DEV_MODE, icon, markSaved, safeSet, setAIStatus, updateSaveIndicator, updateSbGame |
| ui/tactical_map.js | ICONS, BattleMap, _onTacticalBattleEnd |
| ui/toast.js | — (только свой экспорт) |
| ui/top_bar.js | GAME_STATE, MAP_REGIONS, processTurn, CURRENT_MAP_MODE, MAP_MODES и 20+ функций |
| ui/treasury-panel.js | CONFIG, GAME_STATE, GOODS, MAP_REGIONS |
| ui/turn_progress.js | Clepsydra, TURN_ACTIONS, markTurnAction, renderTurnProgress, resetTurnProgress |
| ui/turn_summary_card.js | GAME_STATE, ICONS |

---

## 3. Порядок конвертации

### Уровень 0 — Нет зависимостей (чистые данные/утилиты)

```
data/biomes.js
data/chains_data.js
data/chains_graph.js
data/characters.js
data/cultures.js
data/deposit_map.js
data/laws_labor.js
data/nation_enriched.js
data/nation_geo.js
data/pdf_chains.js
data/region_areas.js
data/region_assignments.js
data/region_centroids.js
data/religion_regions.js
data/traditions/traditions_arts.js
data/traditions/traditions_diplomatic.js
data/traditions/traditions_economic.js
data/traditions/traditions_extra.js
data/traditions/traditions_military.js
data/traditions/traditions_naval.js
data/traditions/traditions_religious.js
data/traditions/traditions_social.js
data/traditions/traditions_survival.js
js/rng.js
engine/battalion.js
engine/forests.js
engine/fortifications.js
engine/noise.js
engine/rivers.js
engine/roads.js
engine/save_worker.js
engine/storage.js
ai/prompts.js
```

### Уровень 1 — Зависят только от CONFIG

```
data/dogmas.js
data/religions.js
data/social_classes.js
data/traditions/traditions_index.js
ui/apikey.js
ai/anomaly_handler.js
ai/strategic_llm.js
```

### Уровень 2 — Зависят от данных (GOODS, BUILDINGS, MAP_REGIONS, EVENTS)

```
data/buildings.js
data/goods.js
data/goods_labor.js
data/goods_meta.js
data/map.js
data/nations.js
data/regions_data.js
data/culture_groups.js
data/portrait_filters.js
ui/icons.js
ui/toast.js
ui/pulse.js
ui/splash.js
ui/portrait.js
ui/portrait_svg.js
ui/map_events.js
ui/map_event_feed.js
```

### Уровень 3 — Engine-модули с ограниченными зависимостями

```
engine/loans.js              (GAME_STATE)
engine/senate.js             (GAME_STATE)
engine/victory.js            (GAME_STATE)
engine/war_score.js          (GAME_STATE)
engine/treaty_validator.js   (GAME_STATE)
engine/date.js               (GAME_STATE)
engine/age_demographics.js   (CONFIG, GAME_STATE)
engine/characters_ai.js      (CONFIG, GAME_STATE)
engine/dialogue.js           (CONFIG, GAME_STATE)
engine/save.js               (CONFIG, GAME_STATE)
engine/land_capacity.js      (BUILDINGS, GAME_STATE)
engine/pops.js               (GAME_STATE, GOODS)
engine/market.js             (CONFIG, GAME_STATE, GOODS)
engine/economy_ext.js        (CONFIG, GAME_STATE, GOODS)
```

### Уровень 4 — Engine-модули с широкими зависимостями

```
engine/religion.js
engine/government.js
engine/armies.js
engine/siege.js
engine/buildings.js
engine/orders.js
engine/demography.js
engine/economy.js
engine/diplomacy.js
engine/combat.js
engine/battle.js
engine/tactical_battle.js
engine/espionage.js
engine/characters_lifecycle.js
engine/events.js
engine/ai_scoring.js
engine/ai_fallback.js
engine/ai_worker.js
engine/super_ou.js
engine/treaty_effects.js
engine/conspiracy.js
engine/constitutional.js
engine/culture.js
engine/diplomacy_range.js
engine/fortress.js
engine/memory.js
engine/provinces.js
engine/achievements.js
```

### Уровень 5 — AI-модули

```
ai/claude.js
ai/diplomacy_ai.js
ai/treaty_interpreter.js
ai/parser.js
ai/commander_ai.js
ai/utility_ai.js
ai/chronicle.js
```

### Уровень 6 — UI-модули

```
ui/ambient.js
ui/aqueduct.js
ui/clepsydra.js
ui/splash_mosaic.js
ui/status_bar.js
ui/log.js
ui/reactions.js
ui/input.js
ui/battle_result.js
ui/peace_panel.js
ui/siege_panel.js
ui/diplo_graph.js
ui/diptych.js
ui/region_compare.js
ui/turn_progress.js
ui/turn_summary_card.js
ui/economy_tab.js
ui/population_tab.js
ui/region_build_tab.js
ui/treasury-panel.js
ui/diplomacy_tab.js
ui/government_tab.js
ui/map_ai_indicators.js
ui/map_armies.js
ui/tactical_map.js
ui/battle_map_pixi.js
ui/panels.js
ui/map.js
ui/top_bar.js
ui/panel_resize.js
```

### Уровень 7 — Оркестраторы (конвертировать последними)

```
engine/turn.js    (зависит от почти всех engine-модулей)
engine/init.js    (зависит от CONFIG, GAME_STATE, GOODS, MAP_REGIONS, processTurn, AmbientLayer)
ui/boot.js        (точка входа, монтирует всё приложение)
```

---

## 4. Inline onclick — полный реестр

**Всего:** HTML — **73**, JS-шаблоны — **215**, итого **288**

### В index.html (73 обработчика: 71 onclick, 2 onkeydown)

| Строка | Атрибут | Функция | Файл определения |
|--------|---------|---------|------------------|
| 7881 | onclick="closeCompare()" | closeCompare | ui/region_compare.js |
| 7882 | onclick="closeCompare()" | closeCompare | ui/region_compare.js |
| 7902 | onclick="closeTurnSummaryCard()" | closeTurnSummaryCard | ui/turn_summary_card.js |
| 7952 | onclick="toggleSearchPanel()" | toggleSearchPanel | ui/top_bar.js |
| 7955 | onclick="toggleSettingsModal()" | toggleSettingsModal | ui/top_bar.js |
| 7959 | onclick="processTurn()" | processTurn | engine/turn.js |
| 8020 | onclick="onResourceBarClick('gold')" | onResourceBarClick | ui/panels.js |
| 8030 | onclick="onResourceBarClick('troops')" | onResourceBarClick | ui/panels.js |
| 8040 | onclick="onResourceBarClick('food')" | onResourceBarClick | ui/panels.js |
| 8050 | onclick="onResourceBarClick('pop')" | onResourceBarClick | ui/panels.js |
| 8064 | onclick="closeDiploGraph()" | closeDiploGraph | ui/diplo_graph.js |
| 8096 | onclick="toggleDiptych()" | toggleDiptych | ui/diptych.js |
| 8122 | onclick="toggleDiptych()" | toggleDiptych | ui/diptych.js |
| 8128 | onclick="switchDiptychTab('overview')" | switchDiptychTab | ui/diptych.js |
| 8130 | onclick="switchDiptychTab('army')" | switchDiptychTab | ui/diptych.js |
| 8132 | onclick="switchDiptychTab('economy')" | switchDiptychTab | ui/diptych.js |
| 8134 | onclick="switchDiptychTab('diplomacy')" | switchDiptychTab | ui/diptych.js |
| 8136 | onclick="switchDiptychTab('laws')" | switchDiptychTab | ui/diptych.js |
| 8141 | onclick="renderLeftPanelTab('overview')" | renderLeftPanelTab | ui/panels.js |
| 8142 | onclick="renderLeftPanelTab('army')" | renderLeftPanelTab | ui/panels.js |
| 8143 | onclick="renderLeftPanelTab('economy')" | renderLeftPanelTab | ui/panels.js |
| 8144 | onclick="renderLeftPanelTab('diplomacy')" | renderLeftPanelTab | ui/panels.js |
| 8145 | onclick="renderLeftPanelTab('laws')" | renderLeftPanelTab | ui/panels.js |
| 8147 | onclick="toggleDiploGraph()" | toggleDiploGraph | ui/diplo_graph.js |
| 8170 | onclick="setMapMode('political')" | setMapMode | ui/map.js |
| 8171 | onclick="setMapMode('economy')" | setMapMode | ui/map.js |
| 8172 | onclick="setMapMode('military')" | setMapMode | ui/map.js |
| 8173 | onclick="setMapMode('population')" | setMapMode | ui/map.js |
| 8193 | onclick="setMapMode('political')" | setMapMode | ui/map.js |
| 8204 | onclick="setMapMode('economy')" | setMapMode | ui/map.js |
| 8215 | onclick="setMapMode('military')" | setMapMode | ui/map.js |
| 8226 | onclick="setMapMode('population')" | setMapMode | ui/map.js |
| 8257 | onclick="closeSiegePanel()" | closeSiegePanel | ui/siege_panel.js |
| 8321 | onclick="siegePanelStorm()" | siegePanelStorm | ui/siege_panel.js |
| 8322 | onclick="siegePanelLift()" | siegePanelLift | ui/siege_panel.js |
| 8334 | onclick="handleGenerateChars()" | handleGenerateChars | ui/boot.js |
| 8353 | onclick="toggleLog()" | toggleLog | ui/log.js |
| 8363 | onclick="toggleLog()" | toggleLog | ui/log.js |
| 8371 | onclick="setLogFilter('all')" | setLogFilter | ui/panels.js |
| 8372 | onclick="setLogFilter('danger')" | setLogFilter | ui/panels.js |
| 8373 | onclick="setLogFilter('economy')" | setLogFilter | ui/panels.js |
| 8374 | onclick="setLogFilter('character')" | setLogFilter | ui/panels.js |
| 8375 | onclick="setLogFilter('law')" | setLogFilter | ui/panels.js |
| 8377 | onclick="showTurnSummary()" | showTurnSummary | ui/panels.js |
| 8379 | onclick="toggleLog()" | toggleLog | ui/log.js |
| 8390 | onclick="toggleOrdersMini()" | toggleOrdersMini | ui/government_tab.js |
| 8427 | onclick="showMpOrderForm()" | showMpOrderForm | ui/government_tab.js |
| 8428 | onclick="toggleOrdersMini()" | toggleOrdersMini | ui/government_tab.js |
| 8462 | onclick="dismissMessenger()" | dismissMessenger | ui/input.js |
| 8485 | onclick="if(event.target===this)closeCharacterDetail()" | closeCharacterDetail | ui/panels.js |
| 8489 | onclick="if(event.target===this)closeAssignModal()" | closeAssignModal | ui/panels.js |
| 8492 | onclick="if(event.target===this)this.style.display='none'" | (inline) | — |
| 8501 | onclick="if(event.target===this)hideTurnSummary()" | hideTurnSummary | ui/panels.js |
| 8512 | onclick="location.reload()" | location.reload | (native) |
| 8520 | onclick="if(event.target===this)hideGovernmentOverlay()" | hideGovernmentOverlay | ui/government_tab.js |
| 8524 | onclick="hideGovernmentOverlay()" | hideGovernmentOverlay | ui/government_tab.js |
| 8533 | onclick="if(event.target===this)hideVowsModal()" | hideVowsModal | engine/achievements.js |
| 8538 | onclick="hideVowsModal()" | hideVowsModal | engine/achievements.js |
| 8545 | onclick="if(event.target===this)hideChronicleModal()" | hideChronicleModal | engine/achievements.js |
| 8550 | onclick="hideChronicleModal()" | hideChronicleModal | engine/achievements.js |
| 8557 | onclick="if(event.target===this)hideTestamentModal()" | hideTestamentModal | engine/victory.js |
| 8562 | onclick="hideTestamentModal()" | hideTestamentModal | engine/victory.js |
| 8584 | onclick="closeBattleResult()" | closeBattleResult | ui/battle_result.js |
| 8587 | onclick="if(event.target===this)closePeacePanel()" | closePeacePanel | ui/peace_panel.js |
| 8592 | onclick="if(event.target===this)closeSettingsModal()" | closeSettingsModal | ui/top_bar.js |
| 8596 | onclick="closeSettingsModal()" | closeSettingsModal | ui/top_bar.js |
| 8599 | onclick="switchSettingsTab('keys')" | switchSettingsTab | ui/top_bar.js |
| 8600 | onclick="switchSettingsTab('hotkeys')" | switchSettingsTab | ui/top_bar.js |
| 8601 | onclick="switchSettingsTab('ui')" | switchSettingsTab | ui/top_bar.js |
| 8627 | onclick="saveInlineAPIKeys()" | saveInlineAPIKeys | ui/apikey.js |
| 8698 | onclick="submitAPIKey()" | submitAPIKey | ui/apikey.js |
| 8677 | onkeydown="_akmKeyDown(event)" | _akmKeyDown | ui/apikey.js |
| 8691 | onkeydown="_akmKeyDown(event)" | _akmKeyDown | ui/apikey.js |

### В JS-шаблонах (215 обработчиков)

| Файл | onclick | onchange | oninput | onkeydown | onmouseover | onmouseout | onerror | Всего |
|------|---------|----------|---------|-----------|-------------|------------|---------|-------|
| ui/government_tab.js | 54 | 4 | 0 | 3 | 2 | 2 | 0 | **65** |
| ui/panels.js | 34 | 1 | 0 | 0 | 1 | 1 | 0 | **37** |
| ui/diplomacy_tab.js | 26 | 3 | 0 | 2 | 0 | 0 | 0 | **31** |
| ui/map_armies.js | 15 | 0 | 0 | 0 | 0 | 0 | 0 | **15** |
| ui/map.js | 11 | 0 | 0 | 0 | 1 | 1 | 1 | **14** |
| ui/population_tab.js | 9 | 0 | 2 | 0 | 0 | 0 | 0 | **11** |
| ui/region_build_tab.js | 10 | 0 | 0 | 0 | 0 | 0 | 0 | **10** |
| ui/treasury-panel.js | 6 | 1 | 2 | 0 | 0 | 0 | 0 | **9** |
| ui/tactical_map.js | 6 | 0 | 0 | 0 | 0 | 0 | 0 | **6** |
| ui/peace_panel.js | 5 | 0 | 0 | 0 | 0 | 0 | 0 | **5** |
| engine/victory.js | 4 | 0 | 0 | 0 | 0 | 0 | 0 | **4** |
| engine/achievements.js | 3 | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| ui/input.js | 2 | 0 | 0 | 0 | 0 | 0 | 0 | **2** |
| ui/battle_result.js | 1 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| ui/economy_react.jsx | 8 | 0 | 0 | 0 | 2 | 2 | 0 | **12** *(JSX — React)* |

### Типы обработчиков в JS-шаблонах

| Тип | Кол-во | % |
|-----|--------|---|
| onclick | 194 | 90.2% |
| onchange | 9 | 4.2% |
| onmouseover | 6 | 2.8% |
| onmouseout | 6 | 2.8% |
| onkeydown | 5 | 2.3% |
| oninput | 4 | 1.9% |
| onerror | 1 | 0.5% |

---

*Конец аудита. Ни один .js или .html файл не изменён.*
