# Карта содержимого index.html (baseline перед Частью II)

Зафиксировано: 2026-04-16, коммит: daeed3c
Размер файла: 14042 строк, 545629 байт.

## 1. Блоки `<style>`

Один блок `<style>`: строки **81–10997** (10916 строк CSS).

| # | Строки | Секция |
|---|--------|--------|
| 1 | 82–104 | SVG-иконки (.icon-wrap, .icon) |
| 2 | 105–230 | Экран загрузки + фреска splash-screen |
| 3 | 231–283 | Экран загрузки: мозаика Сиракуз (canvas) |
| 4 | 287–288 | **ВЫНЕСЕНО в ui/styles/base.css** (этап 32) — :root, reset, html/body |
| 5 | 373–948 | Layout (body, #app, grid, top-bar, стела, клепсидра, аквидукт) — **top-bar/стела/клепсидра/ресурс-бар/turn-progress/settings-btn/nation-header/search-btn ВЫНЕСЕНЫ в ui/styles/top.css** (этап 33) |
| 6 | 949–970 | Боковые панели (базовые) |
| 7 | 971–1004 | Шаг 56 — Культурная текстура на боковых панелях |
| 8 | 1005–1128 | Шаг 59 — Декоративная SVG-рамка (угловой орнамент) |
| 9 | 1129–1272 | Этап 21 — Диптих: складная левая панель |
| 10 | 1273–1344 | Шаг 33 — Строка статуса + индикаторы сохранения/AI |
| 11 | 1345–1446 | Шаг 34 — Панель поиска |
| 12 | 1447–1546 | Шаг 52 — Визуальная карточка итога хода |
| 13 | 1547–1666 | Шаг 53 — Режим сравнения регионов |
| 14 | 1667–1731 | Шаг 27 — Toast-уведомления |
| 15 | 1732–1780 | Шаг 35 — Визуальный пульс для критических событий |
| 16 | 1781–2489 | Центральная область — карта (регион-панель, маршруты, строительство) |
| 17 | 2490–2586 | Блок религии в карточке региона |
| 18 | 2587–2915 | Окно культуры — Modern Antiquity Redesign |
| 19 | 2916–3062 | Окно религии — дополнительные стили |
| 20 | 3063–3199 | Дипломатия (базовые стили) |
| 21 | 3200–3218 | Адаптивность (media queries) |
| 22 | 3219–3592 | Нижняя область — лог + ввод (табличка-лог, дощечка) |
| 23 | 3593–4061 | Панель приказов (главный экран) |
| 24 | 4062–4315 | Панели — общие стили |
| 25 | 4316–4348 | Персонажи |
| 26 | 4349–4432 | Шаг 57 — CC0-портреты персонажей |
| 27 | 4433–4563 | Шаг 43 — Экран должностей (двор) |
| 28 | 4564–5013 | Этапы 23/24 — Court Board (EU4/Imperator) |
| 29 | 5014–5193 | Оверлеи |
| 30 | 5194–5216 | Кнопка генерации персонажей |
| 31 | 5217–5246 | Tooltip для символов нации |
| 32 | 5247–5288 | Шаг 29 — Панель режимов карты (Map modes) |
| 33 | 5289–5297 | Шаг 44 — Стратегические уровни зума |
| 34 | 5298–5458 | Этап 19 — Роза ветров |
| 35 | 5459–5507 | Шаг 30 — Контекстное меню правой кнопки мыши |
| 36 | 5508–5567 | Оверлей правительства |
| 37 | 5568–5571 | Армии на карте (базовые) |
| 38 | 5572–5603 | Этап 18 — Подписи городов-столиц |
| 39 | 5604–5688 | Шаг 39 — Анимированные SVG-маркеры армий |
| 40 | 5689–5728 | Шаг 40 — Прогресс строительства на карте |
| 41 | 5729–5742 | Шаг 41 — Пульсирующие иконки событий на карте |
| 42 | 5743–5786 | Шаг 50 — Лента событий на карте (Event Feed) |
| 43 | 5787–5829 | Шаг 51 — Индикаторы действий AI-наций |
| 44 | 5830–6026 | Результат битвы (#battle-result-overlay) |
| 45 | 6027–6216 | Панель осады (#siege-panel) |
| 46 | 6217–6922 | Шаг 47 — Предпросмотр маршрута армии (hover) |
| 47 | 6923–7266 | Форма составления закона |
| 48 | 7267–7279 | Лог — фильтры |
| 49 | 7280–7301 | Выбор события |
| 50 | 7302–7329 | Итоги хода |
| 51 | 7330–7374 | Панель мирных переговоров |
| 52 | 7375–7397 | Конец игры |
| 53 | 7398–7426 | Инициативы персонажей |
| 54 | 7427–7446 | Заговорщики игрока |
| 55 | 7447–7551 | Модал API ключа |
| 56 | 7552–8100 | Оверлей населения v2 — Dashboard |
| 57 | 8101–8239 | Возрастная демография |
| 58 | 8240–8455 | Экономический обзор — React overlay |
| 59 | 8456–8870 | Вкладки панели региона |
| 60 | 8871–9110 | Аккордеон строительства — Вариант B |
| 61 | 9111–9144 | Экономический обзор (React) — анимации |
| 62 | 9145–9449 | Дипломатия — вкладка зала переговоров |
| 63 | 9450–10255 | Большое дипломатическое окно |
| 64 | 10256–10563 | Переговорный чат — мессенджер-стиль |
| 65 | 10564–10801 | Фаза 2: Финализация договора |
| 66 | 10802–10903 | Тактический бой — CSS-переменные |
| 67 | 10904–10997 | Граф дипломатических отношений |

## 2. Теги `<script src="…">` (внешние, в порядке загрузки)

### Библиотеки (head)

| # | Строка | Путь |
|---|--------|------|
| 1 | 18 | `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` |
| 2 | 22 | `https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.js` |

### Данные (body, после HTML-разметки)

| # | Строка | Путь |
|---|--------|------|
| 3 | 11869 | `config.js` |
| 4 | 11870 | `data/goods.js` |
| 5 | 11871 | `data/chains_data.js` |
| 6 | 11872 | `data/buildings.js` |
| 7 | 11873 | `data/laws_labor.js` |
| 8 | 11874 | `data/social_classes.js` |
| 9 | 11875 | `data/map.js` |
| 10 | 11876 | `data/nations.js` |
| 11 | 11877 | `data/regions_data.js` |
| 12 | 11878 | `data/biomes.js` |
| 13 | 11879 | `data/region_areas.js` |
| 14 | 11880 | `data/characters.js` |
| 15 | 11881 | `data/traditions/traditions_military.js` |
| 16 | 11882 | `data/traditions/traditions_economic.js` |
| 17 | 11883 | `data/traditions/traditions_social.js` |
| 18 | 11884 | `data/traditions/traditions_religious.js` |
| 19 | 11885 | `data/traditions/traditions_naval.js` |
| 20 | 11886 | `data/traditions/traditions_arts.js` |
| 21 | 11887 | `data/traditions/traditions_diplomatic.js` |
| 22 | 11888 | `data/traditions/traditions_survival.js` |
| 23 | 11889 | `data/traditions/traditions_extra.js` |
| 24 | 11890 | `data/traditions/traditions_index.js` |
| 25 | 11891 | `data/cultures.js` |
| 26 | 11892 | `data/portrait_filters.js` |
| 27 | 11893 | `data/culture_groups.js` |
| 28 | 11894 | `data/religions.js` |
| 29 | 11895 | `data/dogmas.js` |
| 30 | 11896 | `data/religion_regions.js` |

### UI-модули

| # | Строка | Путь |
|---|--------|------|
| 31 | 11909 | `ui/icons.js` |
| 32 | 11910 | `ui/log.js` |
| 33 | 11911 | `ui/toast.js` |
| 34 | 11912 | `ui/pulse.js` |
| 35 | 11913 | `ui/panel_resize.js` |

### Engine-модули

| # | Строка | Путь |
|---|--------|------|
| 36 | 11914 | `engine/pops.js` |
| 37 | 11915 | `engine/land_capacity.js` |
| 38 | 11916 | `engine/diplomacy.js` |
| 39 | 11917 | `engine/treaty_validator.js` |
| 40 | 11918 | `engine/treaty_effects.js` |
| 41 | 11919 | `engine/war_score.js` |
| 42 | 11920 | `engine/diplomacy_range.js` |
| 43 | 11921 | `engine/memory.js` |
| 44 | 11922 | `engine/buildings.js` |
| 45 | 11923 | `engine/fortress.js` |
| 46 | 11924 | `engine/market.js` |
| 47 | 11925 | `engine/provinces.js` |
| 48 | 11926 | `engine/economy.js` |
| 49 | 11927 | `engine/economy_ext.js` |
| 50 | 11928 | `engine/loans.js` |
| 51 | 11929 | `engine/demography.js` |
| 52 | 11930 | `engine/age_demographics.js` |
| 53 | 11931 | `engine/government.js` |
| 54 | 11932 | `engine/dialogue.js` |
| 55 | 11933 | `engine/constitutional.js` |
| 56 | 11934 | `engine/conspiracy.js` |
| 57 | 11935 | `engine/senate.js` |
| 58 | 11936 | `engine/battle.js` |
| 59 | 11937 | `engine/armies.js` |
| 60 | 11938 | `engine/combat.js` |
| 61 | 11939 | `engine/siege.js` |
| 62 | 11940 | `engine/victory.js` |
| 63 | 11941 | `engine/characters_ai.js` |
| 64 | 11942 | `engine/orders.js` |
| 65 | 11943 | `engine/culture.js` |
| 66 | 11944 | `engine/religion.js` |
| 67 | 11945 | `engine/storage.js` |
| 68 | 11946 | `engine/super_ou.js` |
| 69 | 11947 | `engine/achievements.js` |

### AI-модули

| # | Строка | Путь |
|---|--------|------|
| 70 | 11948 | `ai/chronicle.js` |

### Engine (turn) + UI (карта, панели)

| # | Строка | Путь |
|---|--------|------|
| 71 | 11949 | `engine/turn.js` |
| 72 | 11950 | `ui/map.js?v=nationhash5` |
| 73 | 11951 | `ui/map_armies.js` |
| 74 | 11952 | `ui/map_events.js` |
| 75 | 11953 | `ui/map_event_feed.js` |
| 76 | 11954 | `ui/map_ai_indicators.js` |
| 77 | 11955 | `ui/turn_summary_card.js` |
| 78 | 11956 | `ui/region_compare.js` |
| 79 | 11957 | `ui/region_build_tab.js` |
| 80 | 11958 | `ui/diplomacy_tab.js` |
| 81 | 11959 | `ui/diplo_graph.js` |
| 82 | 11961 | `js/rng.js` |
| 83 | 11962 | `ui/portrait_svg.js` |
| 84 | 11963 | `ui/portrait.js` |
| 85 | 11964 | `ui/splash.js` |
| 86 | 11965 | `ui/panels.js?v=nationhash5` |
| 87 | 11966 | `ui/aqueduct.js` |
| 88 | 11967 | `ui/government_tab.js` |
| 89 | 11968 | `ui/population_tab.js` |
| 90 | 11969 | `ui/economy_tab.js` |
| 91 | 11972 | `ui/economy_react.jsx` |
| 92 | 11973 | `ui/treasury-panel.js` |
| 93 | 11974 | `ui/siege_panel.js` |
| 94 | 11975 | `ui/battle_result.js` |
| 95 | 11976 | `ui/peace_panel.js` |

### AI (второй блок)

| # | Строка | Путь |
|---|--------|------|
| 96 | 11977 | `ai/prompts.js` |
| 97 | 11978 | `ai/parser.js` |
| 98 | 11979 | `ai/claude.js` |
| 99 | 11980 | `ai/diplomacy_ai.js` |
| 100 | 11981 | `ai/utility_ai.js` |
| 101 | 11982 | `ai/commander_ai.js` |
| 102 | 11983 | `ai/treaty_interpreter.js` |

### UI (финальный блок) + Engine (тактический бой)

| # | Строка | Путь |
|---|--------|------|
| 103 | 11984 | `ui/apikey.js` |
| 104 | 11985 | `ui/input.js` |
| 105 | 11986 | `engine/tactical_battle.js` |
| 106 | 11987 | `ui/tactical_map.js` |
| 107 | 11988 | `engine/noise.js` |
| 108 | 11989 | `ui/battle_map_pixi.js` |

## 3. Блоки инлайн-`<script>`

### Блок A — строки 30–79 (icons bootstrap)

Объявления:
- `function initIconWraps(root)` (36)
- `function _bootObserver()` (52)

Экспорты window.*:
- `window.initIconWraps` (48)
- `window._iconReady` (53)

DOM-зависимости: `.icon-wrap[data-icon]`, `document.body`, DOMContentLoaded

### Блок B — строки 11899–11902 (GAME_STATE init)

Объявления:
- `var GAME_STATE` — deep clone INITIAL_GAME_STATE

Экспорты window.*: нет (GAME_STATE — глобальная var)

### Блок C — строки 11991–13675 (главный блок, ~1685 строк)

**Группа: Splash/Мозаика**
- `const SplashMosaic` (12008) — объект с методами init, setProgress, _render и др.
- `const _splash` (12391)
- `function _splashProgress(pct, text)` (12392)
- `function _splashHide()` (12402)

**Группа: Клепсидра**
- `const Clepsydra` (12306) — объект с get/set progress, setReady, flip
- `window.Clepsydra` (12386)

**Группа: Настройки**
- `function toggleSettingsModal()` (12587)
- `function openSettingsModal()` (12596)
- `function closeSettingsModal()` (12603)
- `function switchSettingsTab(name)` (12608)
- `window.toggleSettingsModal` (12619)
- `window.openSettingsModal` (12620)
- `window.closeSettingsModal` (12621)
- `window.switchSettingsTab` (12622)

**Группа: Разное**
- `function renderNationLegend()` (12516)
- `async function handleGenerateChars()` (12537)

**Группа: Горячие клавиши**
- `function switchLeftTab(tabName)` (12629)
- `function focusCommandInput()` (12636)
- `let _alertCycleIdx` (12646)
- `function focusNextAlert()` (12647)
- `function closeTopModal()` (12664)
- `function cycleMapMode()` (12709)
- `function onHotkey(e)` (12725)
- `window.onHotkey` (13010)
- `window.switchLeftTab` (13011)
- `window.focusCommandInput` (13012)
- `window.focusNextAlert` (13013)
- `window.closeTopModal` (13014)
- `window.cycleMapMode` (13015)

**Группа: Контекстное меню**
- `function _buildCtxMenuItems(regionId)` (12834)
- `function showContextMenu(x, y, regionOrId)` (12925)
- `function closeCtxMenu()` (12982)
- `window.showContextMenu` (13016)
- `window.closeCtxMenu` (13017)

**Группа: Прогресс хода**
- `const TURN_ACTIONS` (13024)
- `const _turnDone` (13033)
- `function renderTurnProgress()` (13035)
- `function markTurnAction(id)` (13079)
- `function resetTurnProgress()` (13086)
- `window.TURN_ACTIONS` (13098)
- `window.markTurnAction` (13099)
- `window.resetTurnProgress` (13100)
- `window.renderTurnProgress` (13101)

**Группа: Статус-бар (IIFE)**
- `(function initStatusBar(){…})()` (13106)
- Внутренние экспорты: `window.safeSet` (13120), `window.setAIStatus` (13272), `window.markSaved` (13273), `window.updateSbGame` (13274), `window.updateSaveIndicator` (13275)

**Группа: Поиск (IIFE)**
- `(function initSearch(){…})()` (13281)
- Внутренние экспорты: `window.toggleSearchPanel` (13666), `window.openSearchPanel` (13667), `window.closeSearchPanel` (13668), `window.isSearchOpen` (13669), `window.onSearchInput` (13670), `window.performSearch` (13671), `window.renderSearchResults` (13672), `window.goToSearchResult` (13673)

### Блок D — строки 13684–13815 (AmbientLayer IIFE)

- `AmbientLayer` — объект (canvas-частицы фона)
- `window.AmbientLayer`

DOM-зависимости: `#ambient-canvas`, resize, visibilitychange, DOMContentLoaded

### Блок E — строки 13825–13904 (UIReactions IIFE)

- `UIReactions` — объект (flash/shake при событиях)
- `window.UIReactions`

DOM-зависимости: `#end-turn-btn`, `#app`, `document.body`

### Блок F — строки 13911–14039 (Diptych IIFE)

- `Diptych` — объект (складная левая панель)
- `window.Diptych`
- `window.toggleDiptych`
- `window.switchDiptychTab`

DOM-зависимости: `#left-panel`, `#diptych-nav .dip-nav-btn`, `#diptych-title`, localStorage

## 4. Inline-хендлеры в разметке

| Строка | Функция | Где определена |
|--------|---------|----------------|
| 11008 | `closeCompare()` | ui/region_compare.js |
| 11029 | `closeTurnSummaryCard()` | ui/turn_summary_card.js |
| 11079 | `toggleSearchPanel()` | инлайн-блок C (IIFE initSearch) |
| 11082 | `toggleSettingsModal()` | инлайн-блок C |
| 11086 | `processTurn()` | engine/turn.js |
| 11147 | `onResourceBarClick('gold')` | ui/aqueduct.js или ui/panels.js |
| 11157 | `onResourceBarClick('troops')` | ui/aqueduct.js или ui/panels.js |
| 11167 | `onResourceBarClick('food')` | ui/aqueduct.js или ui/panels.js |
| 11177 | `onResourceBarClick('pop')` | ui/aqueduct.js или ui/panels.js |
| 11191 | `closeDiploGraph()` | ui/diplo_graph.js |
| 11223 | `toggleDiptych()` | инлайн-блок F |
| 11249 | `toggleDiptych()` | инлайн-блок F |
| 11255 | `switchDiptychTab('overview')` | инлайн-блок F |
| 11257 | `switchDiptychTab('army')` | инлайн-блок F |
| 11259 | `switchDiptychTab('economy')` | инлайн-блок F |
| 11261 | `switchDiptychTab('diplomacy')` | инлайн-блок F |
| 11263 | `switchDiptychTab('laws')` | инлайн-блок F |
| 11268 | `renderLeftPanelTab('overview')` | ui/panels.js |
| 11269 | `renderLeftPanelTab('army')` | ui/panels.js |
| 11270 | `renderLeftPanelTab('economy')` | ui/panels.js |
| 11271 | `renderLeftPanelTab('diplomacy')` | ui/panels.js |
| 11272 | `renderLeftPanelTab('laws')` | ui/panels.js |
| 11274 | `toggleDiploGraph()` | ui/diplo_graph.js |
| 11297 | `setMapMode('political')` | ui/map.js |
| 11298 | `setMapMode('economy')` | ui/map.js |
| 11299 | `setMapMode('military')` | ui/map.js |
| 11300 | `setMapMode('population')` | ui/map.js |
| 11320 | `setMapMode('political')` | ui/map.js (роза ветров) |
| 11331 | `setMapMode('economy')` | ui/map.js (роза ветров) |
| 11342 | `setMapMode('military')` | ui/map.js (роза ветров) |
| 11353 | `setMapMode('population')` | ui/map.js (роза ветров) |
| 11384 | `closeSiegePanel()` | ui/siege_panel.js |
| 11448 | `siegePanelStorm()` | ui/siege_panel.js |
| 11449 | `siegePanelLift()` | ui/siege_panel.js |
| 11461 | `handleGenerateChars()` | инлайн-блок C |
| 11480 | `toggleLog()` | ui/log.js |
| 11490 | `toggleLog()` | ui/log.js |
| 11498 | `setLogFilter('all')` | ui/log.js |
| 11499 | `setLogFilter('danger')` | ui/log.js |
| 11500 | `setLogFilter('economy')` | ui/log.js |
| 11501 | `setLogFilter('character')` | ui/log.js |
| 11502 | `setLogFilter('law')` | ui/log.js |
| 11504 | `showTurnSummary()` | ui/turn_summary_card.js |
| 11506 | `toggleLog()` | ui/log.js |
| 11517 | `toggleOrdersMini()` | engine/orders.js |
| 11554 | `showMpOrderForm()` | engine/orders.js |
| 11555 | `toggleOrdersMini()` | engine/orders.js |
| 11589 | `dismissMessenger()` | ui/input.js |
| 11612 | `closeCharacterDetail()` | ui/panels.js |
| 11616 | `closeAssignModal()` | ui/government_tab.js |
| 11639 | `location.reload()` | встроенная |
| 11647 | `hideGovernmentOverlay()` | ui/government_tab.js |
| 11651 | `hideGovernmentOverlay()` | ui/government_tab.js |
| 11660 | `hideVowsModal()` | ui/government_tab.js |
| 11665 | `hideVowsModal()` | ui/government_tab.js |
| 11672 | `hideChronicleModal()` | ai/chronicle.js |
| 11677 | `hideChronicleModal()` | ai/chronicle.js |
| 11684 | `hideTestamentModal()` | ui/government_tab.js |
| 11689 | `hideTestamentModal()` | ui/government_tab.js |
| 11711 | `closeBattleResult()` | ui/battle_result.js |
| 11714 | `closePeacePanel()` | ui/peace_panel.js |
| 11719 | `closeSettingsModal()` | инлайн-блок C |
| 11723 | `closeSettingsModal()` | инлайн-блок C |
| 11726 | `switchSettingsTab('keys')` | инлайн-блок C |
| 11727 | `switchSettingsTab('hotkeys')` | инлайн-блок C |
| 11728 | `switchSettingsTab('ui')` | инлайн-блок C |
| 11754 | `saveInlineAPIKeys()` | ui/apikey.js |
| 11804 | `_akmKeyDown(event)` | ui/apikey.js |
| 11818 | `_akmKeyDown(event)` | ui/apikey.js |
| 11825 | `submitAPIKey()` | ui/apikey.js |
| 11828 | `hideTurnSummary()` | ui/turn_summary_card.js |

## 5. План этапов 32–42

Копия карты из uisuper.md:

| Этап | Что выносим | Куда |
|------|-------------|------|
| 32 | CSS: переменные палитры и базовые стили | `ui/styles/base.css` |
| 33 | CSS: стела, топ-бар, клепсидра, кнопка конца хода | `ui/styles/top.css` |
| 34 | CSS: сплэш-экран и мозаика | `ui/styles/splash.css` |
| 35 | CSS: левая панель (диптих), правая панель (камеи), прочие панели | `ui/styles/panels.css` |
| 36 | CSS: нижняя табличка-лог, дощечка команды, ambient-слой | `ui/styles/bottom.css` |
| 37 | JS: `SplashMosaic` | `ui/splash_mosaic.js` |
| 38 | JS: `Clepsydra` | `ui/clepsydra.js` |
| 39 | JS: `TURN_ACTIONS`, `renderTurnProgress`, `markTurnAction`, `resetTurnProgress` | `ui/turn_progress.js` |
| 40 | JS: `initStatusBar` и хелперы | `ui/status_bar.js` |
| 41 | JS: обработчики топ-бара (поиск, настройки, модалки, контекстное меню) | `ui/top_bar.js` |
| 42 | JS: «монтажный лист» инициализации | `ui/boot.js` |
| 43 | Финальный аудит, smoke-тест | — |

## 6. Риски и неочевидные зависимости

- **Клепсидра-кнопка** содержит SVG внутри `<button>` — при установке `textContent` SVG уничтожается (см. этап 12).
- **`SplashMosaic.init()`** вызывается при парсинге `<script>`, до DOMContentLoaded — canvas может быть null если скрипт перенести выше разметки.
- **`var GAME_STATE`** (блок B) — глобальная var, на неё ссылаются ~50+ файлов через `window.GAME_STATE`. Не трогать при рефакторинге.
- **IIFE initSearch** (блок C) привязывается к DOM при исполнении — при выносе обеспечить тот же порядок загрузки (после HTML-разметки).
- **IIFE initStatusBar** содержит `setInterval` для FPS — при выносе убедиться что interval запускается корректно.
- **`processTurn()`** определена в `engine/turn.js`, не в инлайн-блоке — безопасна для вынесения хендлеров.
- **Порядок `<script>` критичен**: ui/icons.js должен загрузиться до инлайн-блока A (initIconWraps), а engine/turn.js — до инлайн-блока C (вызов processTurn).
- **`onHotkey`** привязан через `document.addEventListener('keydown', onHotkey)` внутри блока C — при выносе обеспечить аналогичную привязку.
- Всего **108 внешних script-тегов** и **6 инлайн-блоков** (A–F).

---

## Состояние после этапа 36

**Дата:** 2026-04-16

Вынесены в `ui/styles/bottom.css` (873 строки):
- `#ambient-canvas`, `@keyframes map-breathe`, `@keyframes ui-shake`
- `.log-religion`
- `#bottom-area`, `#event-log` (collapsed/expanded), `#log-strip`, `#log-dots`, `.log-dot`, `@keyframes logDotPulse`
- `#log-last-entry`, `#log-collapsed`, `#log-expand-btn`, `#log-body`
- `.log-title`, `.log-filters`, `.log-collapse-btn`, `#log-entries`
- `.log-entry`, `.log-icon`, `.log-mark`, `.log-text`, `.log-turn-n`, `@keyframes log-highlight`
- Все `.log-*` цветовые варианты (turn, danger, warning, good, economy, military, ai, law, character, diplomacy, achievement)
- `.manifest-*`, `.dg-*`, `.vow-*`, `.chronicle-*`
- `.legacy-*`, `.testament-*`
- `#orders-panel`, `.op-*`, `#mp-order-form`
- `#input-area`, `#api-key-section`, `#ai-response`, `.ai-*`, `.action-*`, `.vote-required`, `.radicalism`
- `.positive`, `.negative`
- `#messenger`, `#messenger-figure`, `#messenger-scroll`, `#messenger-text`, `#messenger-close`
- `.api-key-*`
- `#input-row`, `.orders-counter`, `#tablet-wrap`, `#command-input`, `#send-btn`

Остаток `<style>` в `index.html`: строки 92–7870 (~7779 строк CSS).
Это панели, карта, аквидукт, диптих, камеи, модалы, оверлеи — планируется к выносу в следующих этапах.

Все 5 `<link rel="stylesheet">` подключены в `<head>`: base → top → splash → panels → bottom.

---

## 7. После Части II (этап 43)

| Метрика | Baseline (этап 31) | После этапа 43 | Δ |
|---------|--------------------|----------------|---|
| `wc -l index.html` | 14042 | 8878 | −5164 |
| Байт `index.html`  | 545629 | 355005 | −190624 |
| `<style>`-блоков   | 1   | 1 | 0 |
| Инлайн `<script>`-блоков | 6 | 2 | −4 |
| Файлов в `ui/styles/` | 0 | 5 | +5 |
| Файлов в `ui/` (новых JS) | 0 | 6 | +6 |

### Оставшийся `<style>` блок

Один блок `<style>` (~7779 строк) остаётся в `index.html` — содержит CSS для
панелей, карты, аквидукта, диптиха, камей, модалов, оверлеев. Вынос этих стилей
в отдельные файлы возможен, но не входил в план Части II.

### Оставшиеся inline `<script>` блоки

1. **Блок A** (строка 41) — icons bootstrap: `initIconWraps()` + MutationObserver.
   Минимальный, необходим до загрузки `ui/icons.js`.
2. **Блок B** (строка 8772) — `var GAME_STATE = JSON.parse(JSON.stringify(INITIAL_GAME_STATE))`.
   Одна строка, глобальная var, на которую ссылаются 50+ файлов.

### Новые файлы CSS (`ui/styles/`)

| Файл | Строк | Содержимое |
|------|-------|------------|
| `base.css` | ~190 | :root, reset, html/body |
| `top.css` | ~300 | стела, топ-бар, клепсидра, ресурс-бар |
| `splash.css` | ~220 | экран загрузки, мозаика |
| `panels.css` | ~1500 | панели, камеи, диптих |
| `bottom.css` | ~870 | лог, дощечка, мессенджер, ambient |

### Новые файлы JS (`ui/`)

| Файл | Строк | Содержимое |
|------|-------|------------|
| `splash_mosaic.js` | ~430 | SplashMosaic объект (canvas-мозаика) |
| `clepsydra.js` | ~130 | Клепсидра (SVG-анимация) |
| `turn_progress.js` | ~130 | Прогресс хода (checklist) |
| `status_bar.js` | ~250 | Статус-бар (FPS, save, AI) |
| `top_bar.js` | ~830 | Поиск, настройки, контекстное меню, горячие клавиши |
| `boot.js` | ~380 | Монтажный лист инициализации |

## 8. Открытые вопросы для Части III

- Переход на `type="module"` (требует убрать все inline-`onclick`)
- Разбиение `engine/turn.js` (тоже большой)
- Отдельный build-step (Vite / esbuild) с minification
