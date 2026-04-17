# Карта содержимого engine/turn.js (baseline перед разбиением)

Зафиксировано: 2026-04-16, коммит: 42849c6
Размер файла: 2575 строк.

## 1. Все функции верхнего уровня

| # | Строка | Имя | Экспорт window.* | Вызывается из (внешние файлы) |
|---|--------|-----|-------------------|-------------------------------|
| 1 | 23 | `_ensureNationDefaults` | нет | — (только внутри turn.js) |
| 2 | 47 | `processTurn` | нет (глобальная function) | index.html onclick (7959), ui/top_bar.js:149 (Space) |
| 3 | 385 | `advanceDate` | нет | — |
| 4 | 400 | `formatDate` | нет | — |
| 5 | 447 | `getCurrentSeason` | `window.getCurrentSeason` | ui/turn_summary_card.js:44 |
| 6 | 466 | `applySeasonVisual` | `window.applySeasonVisual` | — (вызывается через typeof check в renderAll) |
| 7 | 508 | `updateDateDisplay` | нет | — |
| 8 | 574 | `updateStele` | `window.updateStele` | — (вызывается из advanceDate и renderAll) |
| 9 | 561 | `toRomanYear` | `window.toRomanYear` | — |
| 10 | 626 | `agingCharacters` | нет | — |
| 11 | 641 | `checkCharacterDeaths` | нет | — |
| 12 | 684 | `maybeSpawnCharacter` | нет | — |
| 13 | 703 | `processAINations` | нет | — |
| 14 | 882 | `_processEspionageTick` | нет | — |
| 15 | 1025 | `_cleanExpiredCasusBelli` | нет | — |
| 16 | 1051 | `_ouNaturalMu` | нет | — |
| 17 | 1072 | `_ouStep` | нет | — |
| 18 | 1079 | `_tickOU` | нет | — |
| 19 | 1114 | `_softmax` | нет | — |
| 20 | 1121 | `_weightedPick` | нет | — |
| 21 | 1132 | `_findWarTarget` | нет | — |
| 22 | 1158 | `_findDiplomacyPartner` | нет | — |
| 23 | 1178 | `_findBuildTarget` | нет | — |
| 24 | 1212 | `applyFallbackDecision` | нет | — |
| 25 | 1633 | `_getAIHttpWorker` | нет | — |
| 26 | 1664 | `_callGroqViaWorker` | нет | — |
| 27 | 1691 | `startAIBackgroundLoop` | нет | — |
| 28 | 1698 | `stopAIBackgroundLoop` | нет | — |
| 29 | 1703 | `_aiBgTick` | нет | — |
| 30 | 1715 | `_aiBgProcess` | нет | — |
| 31 | 1947 | `triggerRandomEvent` | нет | — |
| 32 | 1971 | `_showEventChoiceOverlay` | нет | — |
| 33 | 2004 | `_recordTurnSummary` | нет | — |
| 34 | 2074 | `_getSaveWorker` | нет | — |
| 35 | 2105 | `_buildSavePayload` | нет | — |
| 36 | 2137 | `saveGame` | нет (глобальная function) | — (вызывается из processTurn) |
| 37 | 2175 | `loadGame` | нет (глобальная function) | — (вызывается из initGame) |
| 38 | 2229 | `_migrateCharacterIds` | нет | — |
| 39 | 2257 | `_sanitizeInstitutions` | нет | — |
| 40 | 2268 | `_migrateSenateConfig` | нет | — |
| 41 | 2284 | `_migrateCharacterSenateFields` | нет | — |
| 42 | 2313 | `initGame` | нет (глобальная function) | ui/boot.js:75 |
| 43 | 2532 | `renderAll` | нет (глобальная function) | ui/input.js (×4), ui/panels.js (×3), ui/government_tab.js (×3), ui/region_build_tab.js (×1) |

## 2. Все константы и переменные верхнего уровня

| # | Строка | Имя | Тип | Используется в |
|---|--------|-----|-----|----------------|
| 1 | 2 | `IS_PROCESSING_TURN` | `let` | processTurn |
| 2 | 6 | `_aiPending` | `const Map` | processAINations, _aiBgProcess |
| 3 | 7 | `_aiBgRunning` | `let` | startAIBackgroundLoop, stopAIBackgroundLoop, _aiBgTick, _aiBgProcess |
| 4 | 10 | `MONTH_NAMES` | `const array` | processTurn, formatDate; ui/turn_summary_card.js:35 (typeof check) |
| 5 | 415 | `SEASON_STYLES` | `const object` | window.SEASON_STYLES; getCurrentSeason, applySeasonVisual, updateDateDisplay |
| 6 | 537 | `GREEK_MONTHS` | `const array` | updateStele |
| 7 | 545 | `STELE_GOV_TITLES` | `const object` | updateStele |
| 8 | 1048 | `_OU_THETA` | `const` | _ouStep |
| 9 | 1049 | `_OU_SIGMA` | `const` | _ouStep, _tickOU |
| 10 | 1174 | `_FALLBACK_BUILD_PRIORITY` | `const array` | _findBuildTarget |
| 11 | 1195 | `_SUPER_OU_ACTION_MAP` | `const object` | applyFallbackDecision |
| 12 | 1850 | `RANDOM_EVENTS` | `const array` | triggerRandomEvent |
| 13 | 1628 | `_aiHttpWorker` | `let` | _getAIHttpWorker |
| 14 | 1629 | `_aiHttpWorkerFailed` | `let` | _getAIHttpWorker |
| 15 | 1630 | `_aiReqCounter` | `let` | _callGroqViaWorker |
| 16 | 1631 | `_aiPendingReqs` | `const Map` | _getAIHttpWorker, _callGroqViaWorker |
| 17 | 2070 | `_saveWorker` | `let` | _getSaveWorker |
| 18 | 2071 | `_saveWorkerFailed` | `let` | _getSaveWorker |
| 19 | 2072 | `_saveInFlight` | `let` | _getSaveWorker, saveGame |

## 3. Граф вызовов (кто кого вызывает внутри turn.js)

```
processTurn
  → _ensureNationDefaults (для всех наций)
  → advanceDate
      → updateDateDisplay
          → formatDate
          → getCurrentSeason, SEASON_STYLES
      → updateStele
          → toRomanYear
  → _processEspionageTick
      → _cleanExpiredCasusBelli
  → processAINations
      → _findWarTarget
      → _findDiplomacyPartner
      → applyFallbackDecision
          → _tickOU
              → _ouNaturalMu
              → _ouStep
          → _findBuildTarget
          → _softmax
          → _weightedPick
  → triggerRandomEvent
      → _showEventChoiceOverlay
  → _recordTurnSummary
  → saveGame
      → _buildSavePayload
      → _getSaveWorker
  → renderAll
      → updateDateDisplay
      → updateStele
      → applySeasonVisual
          → getCurrentSeason

initGame
  → _ensureNationDefaults
  → loadGame
      → _migrateCharacterIds
      → _sanitizeInstitutions
      → _migrateSenateConfig
      → _migrateCharacterSenateFields
  → renderAll
  → startAIBackgroundLoop
      → _aiBgTick
          → _aiBgProcess
              → _callGroqViaWorker
                  → _getAIHttpWorker
  → _getSaveWorker
```

## 4. Внешние зависимости (что turn.js читает из window.*)

### Глобальные объекты данных
- `GAME_STATE` — везде (центральный объект состояния)
- `CONFIG` — processTurn, processAINations, applyFallbackDecision, saveGame, initGame
- `INITIAL_GAME_STATE` — loadGame, initGame
- `MAP_REGIONS` — RANDOM_EVENTS (землетрясение)
- `BUILDINGS` — _findBuildTarget
- `GOODS` — initGame (инициализация market)
- `REGION_BIOMES` — loadGame, initGame

### Глобальные объекты персонажей (initGame)
- `INITIAL_CHARACTERS_SYRACUSE`
- `INITIAL_SENATORS_ROME`
- `INITIAL_COUNCIL_CARTHAGE`
- `INITIAL_COURT_EGYPT`
- `INITIAL_HETAIROI_MACEDON`
- `INITIAL_ELDERS_NUMIDIA`

### Глобальные движки / системы (вызываются из processTurn)
- `DiplomacyEngine` — processGlobalTick(), onRulerDeath()
- `CONSTITUTIONAL_ENGINE` — tick()
- `CONSPIRACY_ENGINE` — tick()
- `WarScoreEngine` — processBlockadeTick(), processHoldingTick()
- `DIALOGUE_ENGINE` — tick(), compressDirect()
- `ChronicleSystem` — generate()
- `SuperOU` (window.SuperOU) — initNation(), tick(), onRulerDied(), applyHegemonModifier(), onDiplomacyEvent()
- `StrategicLLM` (window.StrategicLLM) — shouldPlan(), createPlan()
- `SENATE_MANAGERS` — loadGame, _buildSavePayload
- `SenateManager` — fromJSON() (loadGame)
- `GameStorage` — save(), load(), migrate()

### Глобальные функции (вызываются через typeof check)
- `processAllTreatyTicks` — договоры
- `processBuildingConstruction` — строительство
- `calculateProvinceControl` — провинции
- `runEconomyTick` — экономика
- `checkAchievements`, `updateGrandeurDisplay` — достижения
- `processLoanPayments`, `getLoanCapacity`, `getLoanDebtLoad`, `takeLoan` — займы
- `recordEconomyHistory` — история экономики
- `processAllGovernmentTicks` — правительство
- `cultureTick` — культура
- `religionTick` — религия
- `processDemography`, `updatePopulationGrowth` — население
- `processRecruitment` — рекрутинг
- `processFortressGarrisons` — гарнизоны
- `processAgeDemographics` — возрастная демография
- `updateHappiness` — счастье
- `calcRegionLandCapacity` — земля
- `recordPopulationHistory` — история населения
- `processArmyMovement`, `createArmy`, `orderArmyMove` — армии
- `processAllOrders` — приказы
- `processCommanderAI` — тактический AI
- `processCharacterAutonomy` — автономное поведение
- `checkVictoryConditions` — победа
- `_tickActiveCrisis` — кризисы
- `checkProvinceControlEvents` — события провинций
- `processAllianceWars` — военные союзы
- `processMemoryTick` — память AI
- `processConquestFatigue`, `checkCoalitionReflex` — анти-сноуболл
- `snapshotNationState`, `showTurnSummaryCard` — итоги хода
- `_pushResourceHistory` — история ресурсов
- `addEventLog` — лог событий
- `generateNewCharacter` — генерация персонажей
- `triggerSuccessionCrisis` — кризис наследования
- `getSenateManager` — менеджер сената
- `applyDelta` — изменение состояния
- `addDiplomacyEvent` — дипломатические события
- `addMemoryEvent` — события памяти
- `validateNationDecision`, `applyNationDecision` — применение решений AI
- `getAIWarDecision`, `_buildWarPrompts`, `_parseWarDecision` — военный AI
- `getNationTier` — тиры наций
- `refreshDiploDistances` — дипломатические расстояния
- `declareWar`, `concludePeace`, `getArmistice`, `createTreaty` — дипломатия/война
- `orderBuildingConstruction` — строительство
- `resetTurnProgress` — прогресс хода (UI)

### DOM-элементы (document.getElementById / querySelector)
- `end-turn-btn` — processTurn (disabled/enabled)
- `game-date` — updateDateDisplay
- `season-overlay` — applySeasonVisual
- `map-container` — applySeasonVisual (fallback)
- `stele-ruler` — updateStele
- `game-month` — updateStele
- `game-year` — updateStele
- `event-choice-overlay`, `.ec-title`, `.ec-description`, `.ec-choices` — _showEventChoiceOverlay

### UI-рендеринг (вызывается из renderAll)
- `renderMap`, `renderLeftPanel`, `renderRightPanel` — основной рендер
- `renderCharInitiativesPanel` — инициативы персонажей
- `renderOrdersPanel` — панель приказов
- `_applyLogFilter` — фильтр лога
- `refreshPopulationTab`, `refreshEconomyTab` — вкладки
- `renderAllArmies` — армии на карте
- `renderBuildMarkers` — маркеры строительства
- `renderCityLabels` — подписи городов
- `clearTradeRouteLines`, `renderTradeRouteLines` — торговые маршруты
- `window.AmbientLayer.setIntensity` — ambient-слой
- `window.Clepsydra.flip`, `window.Clepsydra.setReady` — клепсидра

## 5. Внешние вызовы (кто из других файлов вызывает функции turn.js)

| Функция | Откуда вызывается |
|---------|-------------------|
| `processTurn` | index.html onclick (строка 7959), ui/top_bar.js:149 (Space keydown) |
| `initGame` | ui/boot.js:75 — основная инициализация |
| `renderAll` | ui/input.js:181, 479, 906, 927; ui/panels.js:1900, 1930, 1983; ui/government_tab.js:862, 3165, 3183; ui/region_build_tab.js:435 |
| `getCurrentSeason` | ui/turn_summary_card.js:44 |
| `MONTH_NAMES` | ui/turn_summary_card.js:35 (typeof check) |
| `window.SEASON_STYLES` | экспортируется, но вызовов извне не обнаружено |
| `window.updateStele` | экспортируется, но вызовов извне не обнаружено |
| `window.toRomanYear` | экспортируется, но вызовов извне не обнаружено |
| `window.applySeasonVisual` | экспортируется, но вызовов извне не обнаружено |
| `saveGame` | только из processTurn (внутри turn.js) |
| `loadGame` | только из initGame (внутри turn.js) |
| `stopAIBackgroundLoop` | нигде не вызывается |

## 6. План разбиения (этапы 45–53)

| Этап | Функции | Целевой файл | Строк (≈) |
|------|---------|--------------|-----------|
| 45 | `advanceDate`, `formatDate`, `getCurrentSeason`, `applySeasonVisual`, `updateDateDisplay`, `updateStele`, `toRomanYear` + `MONTH_NAMES`, `SEASON_STYLES`, `GREEK_MONTHS`, `STELE_GOV_TITLES` | `engine/date.js` | ~240 |
| 46 | `agingCharacters`, `checkCharacterDeaths`, `maybeSpawnCharacter` | `engine/characters_lifecycle.js` | ~76 |
| 47 | `_processEspionageTick`, `_cleanExpiredCasusBelli` | `engine/espionage.js` | ~160 |
| 48 | `_ouNaturalMu`, `_ouStep`, `_tickOU`, `_softmax`, `_weightedPick`, `_findWarTarget`, `_findDiplomacyPartner`, `_findBuildTarget` + `_OU_THETA`, `_OU_SIGMA`, `_FALLBACK_BUILD_PRIORITY`, `_SUPER_OU_ACTION_MAP` | `engine/ai_scoring.js` | ~176 |
| 49 | `applyFallbackDecision` | `engine/ai_fallback.js` | ~410 |
| 50 | `_getAIHttpWorker`, `_callGroqViaWorker`, `startAIBackgroundLoop`, `stopAIBackgroundLoop`, `_aiBgTick`, `_aiBgProcess` + `_aiHttpWorker`, `_aiHttpWorkerFailed`, `_aiReqCounter`, `_aiPendingReqs`, `_aiPending`, `_aiBgRunning` | `engine/ai_worker.js` | ~220 |
| 51 | `RANDOM_EVENTS`, `triggerRandomEvent`, `_showEventChoiceOverlay` | `engine/events.js` | ~153 |
| 52 | `_getSaveWorker`, `_buildSavePayload`, `saveGame`, `loadGame`, `_migrateCharacterIds`, `_sanitizeInstitutions`, `_migrateSenateConfig`, `_migrateCharacterSenateFields` + `_saveWorker`, `_saveWorkerFailed`, `_saveInFlight` | `engine/save.js` | ~244 |
| 53 | `initGame`, `renderAll` | `engine/init.js` | ~264 |

### Зависимости между модулями после разбиения

```
engine/init.js
  ├── engine/date.js           (advanceDate, renderAll → updateStele, applySeasonVisual)
  ├── engine/save.js           (loadGame, saveGame)
  ├── engine/characters_lifecycle.js
  ├── engine/events.js         (triggerRandomEvent)
  ├── engine/ai_worker.js      (startAIBackgroundLoop)
  └── engine/ai_fallback.js → engine/ai_scoring.js

engine/turn.js (processTurn — ~380 строк после разбиения)
  ├── engine/date.js           (advanceDate)
  ├── engine/characters_lifecycle.js (agingCharacters, checkCharacterDeaths, maybeSpawnCharacter)
  ├── engine/espionage.js      (_processEspionageTick)
  ├── engine/ai_fallback.js    (applyFallbackDecision через processAINations)
  ├── engine/events.js         (triggerRandomEvent)
  ├── engine/save.js           (saveGame)
  └── engine/init.js           (renderAll)
```

### Примечания

- `processTurn` и `_ensureNationDefaults` остаются в `engine/turn.js` после разбиения (~380 строк)
- `processAINations` + `_logAIStrategy` — сложный вопрос: тесно переплетён с `_aiPending` (Этап 50) и `applyFallbackDecision` (Этап 49). Вероятно останется в `turn.js` или переедет в отдельный модуль позже.
- `_recordTurnSummary` — мелкая функция (~60 строк), можно оставить в turn.js или перенести в init.js.
- `IS_PROCESSING_TURN` используется только в processTurn — остаётся в turn.js.

---

## После разбиения (этап 54)

| Метрика | До | После | Δ |
|---------|-----|-------|---|
| `wc -l engine/turn.js` | 2575 | 634 | −1941 |
| Файлов в `engine/` (новых) | 0 | 9 | +9 |

### Размеры новых модулей

| Файл | Строк |
|------|-------|
| `engine/date.js` | 249 |
| `engine/characters_lifecycle.js` | 84 |
| `engine/espionage.js` | 167 |
| `engine/ai_scoring.js` | 186 |
| `engine/ai_fallback.js` | 420 |
| `engine/ai_worker.js` | 207 |
| `engine/events.js` | 150 |
| `engine/save.js` | 221 |
| `engine/init.js` | 269 |
| **Итого новых** | **1953** |

### Содержимое `turn.js` после разбиения (634 строки)

| Элемент | Тип |
|---------|-----|
| `IS_PROCESSING_TURN` | переменная (флаг) |
| `_ensureNationDefaults(nation)` | функция (~20 строк) |
| `processTurn()` | async функция (~340 строк) |
| `processAINations()` | async функция (~185 строк) |
| `_recordTurnSummary()` | функция (~60 строк) |

### Верификация

- Все 9 новых файлов проходят `node --check` ✅
- `turn.js` содержит только 5 элементов верхнего уровня ✅
- Обратная совместимость через `window.*` сохранена ✅

---

## Финальный аудит (этап 71)

### Актуальные метрики

| Метрика | Ожидание | Факт | Статус |
|---------|----------|------|--------|
| `wc -l engine/turn.js` | ~600 | 642 | ✅ |
| `wc -l index.html` | < 2000 | 8688 (CSS inline — Часть IV) | ⏳ |
| `<script` тегов в HTML | 3 | 3 | ✅ |
| Inline onclick | 0 | 0 | ✅ |
| `window.*` экспорты (реальные) | ≤ 5 | 4 | ✅ |
| Vite build | проходит | ✅ (9.75s, 136 модулей) | ✅ |

### Бандл (Vite prod build)

| Чанк | Размер |
|------|--------|
| index.js (main) | 13 048 kB |
| index.css | 62.78 kB |
| diplomacy.js (lazy) | 52.48 kB |
| population.js (lazy) | 49.71 kB |
| economy_ui.js (lazy) | 40.60 kB |
| tactical.js (lazy) | 33.01 kB |
| rolldown-runtime.js | 0.99 kB |

### Актуальные размеры engine-модулей

| Файл | Строк |
|------|-------|
| `engine/turn.js` | 642 |
| `engine/date.js` | 239 |
| `engine/init.js` | 273 |
| `engine/ai_fallback.js` | 425 |
| `engine/save.js` | 223 |
| `engine/ai_worker.js` | 207 |
| `engine/ai_scoring.js` | 183 |
| `engine/espionage.js` | 167 |
| `engine/events.js` | 152 |
| `engine/characters_lifecycle.js` | 83 |

Примечание: `index.html` (8688 строк) будет уменьшен до < 2000 строк
в Части IV (этапы 72–80) путём выноса inline CSS в отдельные файлы.
