# План на 15 сессий — оптимизация скорости Ancient Strategy

## Context

Игра тормозит до неиграбельного состояния. Быстрый аудит показал конкретные узкие места: экономический тик (~29M операций/ход через 902 нации × 2700 регионов × 12 зданий), full-restyle всех 2700 region-полигонов после каждого хода, ≥276 `innerHTML=` мутаций в ui/, дипломатические дистанции O(N²) = 814k пар наций, блокирующий `JSON.stringify` на ~10-15 MB state в `saveGame()`. Задержка хода сейчас оценочно **5-15 секунд** на Mac, больше на мобильных. Цель — опустить до **<1 секунды** к концу 15-й сессии.

План спроектирован для автономного запуска через Claude Routines (`/schedule`): каждая сессия самодостаточна, имеет explicit файлы/измерения, и НЕ ломает игру (должна быть работоспособна на main после каждого коммита).

## Формат сессии (контракт для Routine)

Каждая сессия начинается с:
1. `git fetch && git checkout claude/exciting-fermat-KVLXr && git pull`
2. Найти свой номер в этом файле, прочитать «Цель», «Файлы», «Шаги», «Верификация».
3. Перед правкой — запустить `npm run dev` в фоне, открыть [perf/baseline.md](perf/baseline.md) (создаётся в Session 1).
4. Выполнить правки по чек-листу.
5. **Верификация**: запустить `node tests/audit/<релевантный>_test.cjs` из затронутого модуля + перф-скрипт (если создан). Снять новое значение метрики, записать в [perf/session-N.md](perf/session-N.md).
6. Коммит: `perf(<scope>): Session N — <short summary>` + `Measured: <before ms> → <after ms>`.
7. Push. Ветка: **та же** `claude/exciting-fermat-KVLXr` (не плодить ветки для Routine-runner).

**Kill switch**: если после правки какой-либо из `tests/audit/*_test.cjs` падает или `processTurn()` бросает в консоли — Claude должен откатить свой коммит (`git reset --hard HEAD~1`), записать причину в `perf/session-N.md` и остановиться (не пушить). Следующая сессия увидит откат и может предложить другой подход.

## 15 сессий (порядок — по ROI и безопасности, от самых безопасных к более рискованным)

### Session 1 — Профайлер-базис   ✅ Выполнено (2026-04-17)
**Цель:** зафиксировать текущую скорость хода и рендера, чтобы все следующие сессии имели точку сравнения.
**Файлы:** новый `perf/profile.mjs` (standalone, без HTML), новый `perf/baseline.md`.
**Шаги:** написать Node-скрипт, который импортирует `engine/turn.js` логику в jsdom, прогоняет `initGame()` + 10 `processTurn()`, печатает: общее время, p50/p95 per-turn, разбивку по шагам (через `console.time` уже расставленные в [engine/turn.js:63](engine/turn.js#L63)). Сохранить результат в markdown.
**Верификация:** `node perf/profile.mjs` выводит таблицу и пишет в файл; число в baseline не 0 и не ∞.

### Session 2 — Кэш `Object.entries(GAME_STATE.nations)` в hot loops   ✅ Выполнено (2026-04-17)
**Цель:** убрать 7+ повторных `Object.entries(...)` за один tick в [engine/economy.js](engine/economy.js) (экспертный отчёт нашёл `for...Object.entries(GAME_STATE.nations)` 23 раза через engine/).
**Файлы:** [engine/economy.js](engine/economy.js), [engine/turn.js](engine/turn.js).
**Шаги:** в начале `processTurn()` один раз собрать `const _nationEntries = Object.entries(GAME_STATE.nations)`, пробросить в нижележащие функции параметром. Grep'нуть `Object.entries\(GAME_STATE\.nations\)` и заменить на переменную.
**Верификация:** `node tests/audit/eco_integration_test.cjs` зелёный + профайлер показывает −10-15% per-turn.

### Session 3 — Skip stub-наций в экономике   ✅ Выполнено (2026-04-18)
**Цель:** ~600 из 902 наций — племенные stub'ы с 1 регионом и без зданий. Они не имеют продуктивной экономики, но сейчас проходят все loops. Early-exit.
**Файлы:** [engine/economy.js](engine/economy.js) (runEconomyTick), [engine/pops.js](engine/pops.js).
**Шаги:** в начале каждого per-nation цикла — `if (!nation.regions?.length || !hasAnyBuilding(nation)) continue;` с комментарием, что stub пропускается. Сохранить налог/население минимальный тик (без рынка/амортизации).
**Верификация:** зарплаты/казна крупных наций (syracuse/carthage/ptolemaic_kingdom) не изменились ±1% за 10 ходов; профайлер −30-40% экономики.

### Session 4 — Кэш `calculateProvinceControl`   ✅ Выполнено (2026-04-18)
**Цель:** [engine/provinces.js](engine/provinces.js) пересчитывает control по всем провинциям каждый ход. Инвалидировать кэш только если хоть один регион сменил owner.
**Файлы:** [engine/provinces.js](engine/provinces.js), [engine/turn.js](engine/turn.js) (точка вызова).
**Шаги:** хранить `GAME_STATE._provinceControlCache` + `GAME_STATE._regionOwnerSig` (хеш owner'ов регионов). При `processTurn` сравнивать signature; если не изменилась — пропустить `calculateProvinceControl()`.
**Верификация:** contrl_test (если есть) + визуальная проверка — при захвате региона панель провинции всё ещё обновляется.

### Session 5 — Инкрементальный `refreshRegionStyles`   ✅ Выполнено (2026-04-18)
**Цель:** [ui/map.js:2781](ui/map.js#L2781) сейчас вызывает `.setStyle()` на всех 2700 полигонах после каждого хода. Перейти на diff-подход.
**Файлы:** [ui/map.js](ui/map.js).
**Шаги:** ввести `GAME_STATE._dirtyRegions = new Set()`; при смене owner/control/intel в turn.js добавлять id региона; `refreshRegionStyles()` стилит только регионы из Set, затем чистит Set. При смене map-mode — форсирует полный рендер (как сейчас).
**Верификация:** ручной тест — владелец региона меняется, цвет обновляется; профайлер рендер-части хода −70-90%.

### Session 6 — Убрать `innerHTML=` в `updateResourceBar`   ✅ Выполнено (2026-04-18)
**Цель:** [ui/panels.js:342](ui/panels.js#L342) `updateResourceBar` и [ui/panels.js:2119](ui/panels.js#L2119) `renderRightPanel` каждый ход пересобирают DOM через innerHTML. Точечно обновлять только `.textContent` нужных `<span>`.
**Файлы:** [ui/panels.js](ui/panels.js).
**Шаги:** кэшировать ссылки на `#aq-gold-val` / `#aq-gold-delta` и т.п. в замыкание при первом вызове; далее только `el.textContent = ...`. Для `renderRightPanel` — перевести на шаблон один раз, дальше обновлять точечно.
**Верификация:** снять «replaced node» events в DevTools (или ставить `MutationObserver` в тесте) — после моей правки количество мутаций должно упасть в 10+ раз.

### Session 7 — Save в IndexedDB через Web Worker   ✅ Выполнено (2026-04-18)
**Цель:** [engine/save.js](engine/save.js) делает синхронный `JSON.stringify` на ~10-15 MB state в конце каждого хода. Перевести сериализацию в уже существующий [engine/save_worker.js](engine/save_worker.js), хранилище — IndexedDB вместо localStorage.
**Файлы:** [engine/save.js](engine/save.js), [engine/save_worker.js](engine/save_worker.js), новый тонкий helper `engine/idb_storage.js`.
**Шаги:** добавить fallback на localStorage, если IDB недоступен. Использовать structured clone через `postMessage(state)` вместо stringify на main.
**Верификация:** ход завершается без «заморозки» UI; профайлер save-части −90%. `saveGame`/`loadGame` round-trip даёт идентичный объект.

### Session 8 — Инкрементальный `refreshDiploDistances`   ✅ Выполнено (2026-04-18)
**Цель:** [engine/diplomacy_range.js](engine/diplomacy_range.js) пересчитывает дистанции по парам наций при каждом ходе. Кэшировать матрицу; инвалидировать только изменённые строки/столбцы.
**Файлы:** [engine/diplomacy_range.js](engine/diplomacy_range.js).
**Шаги:** хранить `GAME_STATE._diploDistMatrix` + версию signature регионов. BFS/Dijkstra запускать только из регионов, сменивших владельца; остальные дистанции сохранить.
**Верификация:** `tests/audit/dip_integration_test.cjs` зелёный; профайлер дипломатии −60-80%.

### Session 9 — Ring buffer для `events_log` и history   ✅ Выполнено (2026-04-18)
**Цель:** `GAME_STATE.events_log` растёт без ограничения. После 500+ ходов save ворочает мегабайты. Срезать на уровне runtime.
**Файлы:** [engine/turn.js](engine/turn.js) (addEventLog), [ui/panels.js](ui/panels.js) (sparklines).
**Шаги:** обертка `addEventLog` уже есть — добавить `if (arr.length > 500) arr.shift()`. `_turn_summary_history` cap = 200. Спарклайн-история уже capped = 10 в [panels.js:_RES_HISTORY_MAX](ui/panels.js#L417).
**Верификация:** save-файл после 100 ходов весит <N MB (зафиксировать N до/после).

### Session 10 — AI-нации: round-robin по ходам   ✅ Выполнено (2026-04-18)
**Цель:** [engine/turn.js processAINations](engine/turn.js) обрабатывает tier1+tier2 каждый ход. Вместо этого распределить обработку: каждый ход — 1/N часть наций.
**Файлы:** [engine/turn.js](engine/turn.js), [engine/ai_worker.js](engine/ai_worker.js).
**Шаги:** добавить `GAME_STATE._aiTurnCursor`, на каждый ход брать batch = 50 наций начиная с cursor, cursor += batch (mod total). Критичные решения (война, мир, атака игрока) — обрабатываются немедленно через отдельную ветку.
**Верификация:** 50 ходов — каждая AI-нация получила хотя бы 1 tick; профайлер AI-части −80%.

### Session 11 — Пауза RAF-циклов на время обсчёта хода   ✅ Выполнено (2026-04-18)
**Цель:** [ui/ambient.js](ui/ambient.js), [ui/aqueduct.js](ui/aqueduct.js) крутят RAF 60 FPS даже когда идёт processTurn(). Ставить их на паузу на время хода.
**Файлы:** [ui/ambient.js](ui/ambient.js), [ui/aqueduct.js](ui/aqueduct.js), [engine/turn.js](engine/turn.js).
**Шаги:** `processTurn()` начинается → `AmbientLayer.pause()` + `AquaWidget.pause()`; заканчивается — `.resume()`. Использовать существующий `IS_PROCESSING_TURN` флаг в [engine/turn.js:6](engine/turn.js#L6).
**Верификация:** во время tick'а CPU браузера падает; FPS анимаций до/после тика нормальный.

### Session 12 — Lazy-load `data/regions_data.js` и `data/nation_enriched.js`   ✅ Выполнено (2026-04-18)
**Цель:** эти два файла (~7 MB суммарно) грузятся синхронно при boot. Многие из них нужны только при открытии вкладки «Регионы» / «Нации».
**Файлы:** [ui/boot.js](ui/boot.js), места первого использования в [engine/init.js](engine/init.js).
**Шаги:** заменить `import * as _regionsData from '../data/regions_data.js'` на `async function getRegions() { return (await import('../data/regions_data.js')) }`. Прокачать callers через `await`.
**Верификация:** начальная загрузка splash`a меньше; игра стартует быстрее; открытие «Регионы» может быть на 200мс дольше первый раз — это ок.

### Session 13 — Мемоизация `_computeRegionProduction`   ✅ Выполнено (2026-04-18)
**Цель:** [engine/economy.js:124](engine/economy.js#L124) пересчитывает производство региона целиком даже если ничего не изменилось. Кэшировать по (region_id, buildings_hash, pop_hash).
**Файлы:** [engine/economy.js](engine/economy.js).
**Шаги:** вычислить дешёвый hash входа → если совпадает с прошлым ходом, вернуть кэш. Инвалидировать при стройке/сносе здания, при миграции населения.
**Верификация:** прод. уровни у базовой нации за 10 ходов без действий игрока — детерминированы и совпадают с baseline ±0.01%.

### Session 14 — Vite prod-build: manualChunks + preload   ✅ Выполнено (2026-04-18)
**Цель:** [vite.config.js](vite.config.js) уже имеет minimal manualChunks. Добавить engine-level split (economy / diplomacy / combat / save), preload критических чанков.
**Файлы:** [vite.config.js](vite.config.js), [index.html](index.html) (возможный `<link rel="modulepreload">`).
**Шаги:** в `manualChunks` добавить группы: `'engine-core'`, `'engine-econ'`, `'engine-dip'`, `'engine-war'`, `'engine-ai'`. Прогнать `npm run build:vite`, замерить total JS и largest chunk.
**Верификация:** `dist/` размер chunks более ровный; в `npm run preview` время до first-interaction замерить.

### Session 15 — Регрессионный guard + финальный баланс   ✅ Выполнено (2026-04-18)
**Цель:** закрепить достигнутое, чтобы будущие коммиты не откатили прогресс.
**Файлы:** новый `tests/perf/turn_budget_test.cjs`, обновить [perf/baseline.md](perf/baseline.md).
**Шаги:** написать тест, который запускает 10 ходов на фикстурных данных и падает если p95 > X ms (X = baseline после Session 14 × 1.2). Запустить профайлер всех 14 предыдущих сессий, собрать финальный отчёт с графиком «baseline → S1 → … → S14».
**Верификация:** `node tests/perf/turn_budget_test.cjs` падает, если искусственно замедлить любой step >20%.

---

## Расширение: Sessions 16–22 — Interactive latency

Sessions 1–15 сфокусированы на per-turn времени (`processTurn()`). Жалоба игрока:
**лагает zoom/pan карты, клики по вкладкам и ввод текста в диалогах** —
это отдельное измерение производительности, которое per-turn не покрывает.

### Контекст (на основе аудита ui/map.js, ui/ambient.js, ui/aqueduct.js,
### ui/input.js, ui/government_tab.js, engine/init.js)

Главные источники interactive-lag:

1. **`_updateNationLabelVisibility()` [ui/map.js:2244](ui/map.js#L2244)** — запускается
   на каждый pan/zoom через RAF. Внутри: PCA по всем полигонам каждой нации,
   `canvas.measureText()` для fontSize, SVG-манипуляции. Debounce 80ms не хватает.
2. **`_applyZoomFillOpacity()` [ui/map.js:3574](ui/map.js#L3574)** — на `zoomend`
   итерирует по всем ~3734 `regionLayers` и вызывает `setStyle()` на каждый
   (даже при `preferCanvas: true` это не бесплатно).
3. **RAF-циклы `AmbientLayer` / `AquaWidget`** — Session 11 ставит на паузу
   только во время `processTurn()`. Во время zoom/pan они крутятся 60 FPS и
   отнимают CPU у label/style handler'ов.
4. **`renderAll()` [engine/init.js:234](engine/init.js#L234)** — 12+ рендер-функций
   подряд, вызывается синхронно из input-хэндлеров: `ui/input.js:183,483`,
   `ui/government_tab.js:864,3167`, `ui/panels.js:1936,1966,2019`.
5. **Горячие `innerHTML =`** после Session 6 осталось: `ui/government_tab.js` —
   33 вхождений (в т.ч. диалоги персонажей, 3345-3389), `ui/panels.js` — 12,
   `ui/input.js` — 10. Полный тир-даун панели на каждое действие.

### Новый метрический harness

`perf/profile.mjs` измеряет per-turn, а не interactive. Session 16 создаёт
`perf/interactive.mjs` (Playwright + CDP Performance domain): измеряет
input-to-paint latency на клик/keystroke, FPS во время `map.panBy()` / `zoomIn()`,
количество long-tasks (>50 ms) на main thread. Базовая линия фиксируется в
`perf/interactive_baseline.md` перед Session 17.

### Session 16 — Interactive harness + pause RAF на zoom/pan   ✅ Выполнено (2026-04-18)
**Цель:** получить численную базу для interactive-lag и убрать первую простую
конкуренцию за CPU — `AmbientLayer` / `AquaWidget` RAF-циклы крутятся во
время zoom/pan, удваивая нагрузку на main thread.
**Файлы:** новый `perf/interactive.mjs`, новый `perf/interactive_baseline.md`,
[ui/map.js](ui/map.js) (регистрация listener'ов `zoomstart/movestart` +
`zoomend/moveend` с debounce 150 ms).
**Шаги:**
1. Написать `perf/interactive.mjs`: открывает игру в headless Chromium,
   эмулирует 30 zoomIn, 30 panBy, 60 клика по случайной вкладке, 100 keystroke
   в input. Снимает `performance.getEntriesByType('longtask')`, FPS через
   `requestAnimationFrame`-таймер, input-to-paint через `performance.mark`.
2. Сохранить в `perf/interactive_baseline.md` три числа: mean-FPS при pan,
   p95 input-to-paint, сумма longtask > 50 ms за сценарий.
3. В `ui/map.js` добавить:
   ```js
   leafletMap.on('zoomstart movestart', () => {
     window.AmbientLayer?.pause(); window.AquaWidget?.pause();
   });
   leafletMap.on('zoomend moveend', debounce(() => {
     window.AmbientLayer?.resume(); window.AquaWidget?.resume();
   }, 150));
   ```
**Верификация:** `node perf/interactive.mjs` — mean-FPS при pan **+10…20 %**,
сумма longtask на pan **−20 %**. `tests/audit/*_test.cjs` — зелёные.

### Session 17 — Throttle + кэш `_updateNationLabelVisibility()`   ✅ Выполнено (2026-04-18)
**Цель:** убрать тяжелейший handler pan/zoom — PCA + `canvas.measureText()` +
SVG DOM для всех видимых наций запускается на каждый RAF-frame pan'а.
**Файлы:** [ui/map.js](ui/map.js) (функции `_updateNationLabelVisibility`,
`scheduleNationLabelUpdate`, `_pcaAnglePx`).
**Шаги:**
1. Кэшировать PCA-результат и bbox **на нацию**:
   `nation._labelCache = { regionsSig, pcaAngle, spine, bboxPx }`. Инвалидировать
   только при смене `regionsSig` (hash nation.regions) или при zoom-change.
2. Разделить «paint» и «layout»: на `move` пересчитывать ТОЛЬКО позицию/видимость
   существующих SVG-элементов через `transform: translate(...)` — без
   `innerHTML=''`, без PCA. Полная пересборка подписей — только на `zoomend` и
   при смене владельцев регионов.
3. Поднять debounce `scheduleNationLabelUpdate` с 80 ms до 150 ms (ухо на это
   не среагирует при прокрутке).
**Верификация:** mean-FPS при pan **≥ 50 FPS** (сейчас вероятно 20-30 FPS).
Визуально — подписи наций не пропадают и не «скачут» при прокрутке.
Регрессия: открыть окно — подписи читаемые на всех zoom-уровнях.

### Session 18 — CSS-class zoom-tier вместо `setStyle()` на 3734 полигонах   ✅ Выполнено (2026-04-18)
**Цель:** заменить imperative `polygon.setStyle({ fillOpacity })` в
`_applyZoomFillOpacity()` на смену CSS-класса у parent-элемента — браузер
применит стили батчем через CSS cascade за O(1).
**Файлы:** [ui/map.js](ui/map.js) (функции `onZoomChange`,
`_applyZoomFillOpacity`), [ui/styles/map.css](ui/styles/map.css).
**Шаги:**
1. Ввести CSS-переменную `--zoom-tier: strategic | regional | detailed` на
   контейнер карты (уже есть body-класс — использовать его).
2. В CSS:
   ```css
   .zoom-strategic .leaflet-interactive.region { fill-opacity: 0.9; }
   .zoom-regional  .leaflet-interactive.region { fill-opacity: 0.6; }
   .zoom-detailed  .leaflet-interactive.region { fill-opacity: 0.3; }
   ```
3. Удалить цикл по `regionLayers` в `_applyZoomFillOpacity()`, оставить
   только смену класса.
**Верификация:** `zoomend` callback **< 5 ms** (сейчас оцениваем 50-150 ms
при 3734 полигонах). Визуально — прозрачность полигонов соответствует
стратегическому/региональному/детальному zoom'у как сейчас.

### Session 19 — `renderAll()` → `renderCritical()` + `renderDeferred()`   ✅ Выполнено (2026-04-18)
**Цель:** `renderAll()` блокирует main thread на ~5-15 ms при каждом клике
(12+ функций синхронно). Разделить на критичное (то, что видит игрок сразу)
и отложенное (через `requestIdleCallback`).
**Файлы:** [engine/init.js](engine/init.js) (функция `renderAll`).
**Шаги:**
1. Разбить:
   - `renderCritical()` — `updateDateDisplay`, `updateStele`, `renderLeftPanel`,
     `renderRightPanel` (видимые немедленно).
   - `renderDeferred()` — `refreshPopulationTab`, `refreshEconomyTab`,
     `renderAllArmies`, `renderBuildMarkers`, `renderCityLabels`,
     `renderTradeRouteLines`.
2. `renderAll` = `renderCritical()` + `requestIdleCallback(renderDeferred, {timeout: 200})`.
3. Кнопка «Следующий ход» ждёт обе части (await), но UI-клики — только
   critical.
**Верификация:** input-to-paint p95 **< 50 ms** на клик по вкладке
(сейчас оцениваем 100-200 ms). Визуальный тест — переключение вкладок Army /
Economy / Diplomacy не рвёт FPS RAF-анимаций.

### Session 20 — Убрать `renderAll()` из keystroke-пути input-хэндлеров
**Цель:** `ui/input.js:183,483` вызывает `renderAll()` на каждый enter в
диалоге. На практике изменились 1-2 поля — нужен точечный refresh, не
полная перерисовка.
**Файлы:** [ui/input.js](ui/input.js) (`handleAIResponse`, `applyParsedAction`).
**Шаги:**
1. Добавить в `applyParsedAction` bitmask `_dirty = { economy: bool,
   armies: bool, diplomacy: bool, regions: bool }` на основании типа
   применённого эффекта.
2. В конце обработки — вызывать только те `refresh*Tab()`, что помечены dirty;
   полный `renderAll()` — только если `_dirty.regions || _dirty.armies`.
3. Для «пустых» ответов AI (chit-chat без изменения state) — не звать
   renderAll вообще.
**Верификация:** keystroke в диалоге — **< 16 ms** input-to-paint (один
кадр 60 FPS). `tests/audit/*_test.cjs` — зелёные.

### Session 21 — `innerHTML=` → DOM API в `ui/government_tab.js`
**Цель:** 33 вхождений `innerHTML=` в ui/government_tab.js, включая диалоги
персонажей (3345-3389) и список сенаторов (3611-3694). Каждый клик на
зал / реплика персонажа = полный teardown поддерева.
**Файлы:** [ui/government_tab.js](ui/government_tab.js).
**Шаги:**
1. Инвентаризация: разбить 33 места на 3 группы — (а) статический шаблон
   (написал раз, клонируй), (б) list-render (DocumentFragment + append),
   (в) точечный text/атрибут (`el.textContent=`, `el.dataset.x=`).
2. Переписать категорию (в) первой — это cheapest win (~15 из 33). Следом
   (б) через `<template>`-элементы. (а) оставить как есть (редкие редирективы).
3. Замеры до/после через `MutationObserver` счётчик — как в Session 6.
**Верификация:** смена вкладки Government / клик по «Зал сената» —
mutations **−5×** по `MutationObserver`. Функциональный регресс: все диалоги
открываются, кнопки работают.

### Session 22 — Region culling при стратегическом zoom
**Цель:** при zoom ≤ 5 (стратегический вид мира) все 3734 полигона всё ещё
в DOM, даже если мелкие регионы едва видны пиксельно. Скрыть ~70 % самых
мелких — FPS при pan на мировом масштабе вырастет значительно.
**Файлы:** [ui/map.js](ui/map.js) (функция `refreshRegionStyles` из Session 5,
`onZoomChange`), [data/map.js](data/map.js) (выставить статическую метрику
`areaPx` при инициализации).
**Шаги:**
1. Один раз при старте посчитать площадь каждого региона в пикселях на
   мировом zoom (через `L.polygon.getBounds() → latLngToContainerPoint`).
2. В `onZoomChange`: при zoom ≤ 5 — у regions с `areaPx < 20` ставить
   `display: none` через CSS-класс `.region-culled`; при zoom ≥ 6 —
   снимать класс.
3. Интеграция с Session 8 (`refreshDiploDistances`) и Session 5
   (`refreshRegionStyles`): culled-регионы всё равно существуют в
   GAME_STATE — только скрыты из DOM.
**Верификация:** FPS при `panBy(500, 500)` на zoom=3 **≥ 50 FPS** (сейчас
вероятно 15-25). При zoom ≥ 6 — все регионы видны. Визуально: крупные
полисы (Сиракузы, Афины, Александрия) не исчезают.

### Общие принципы Sessions 16-22

- **Метрика** — не per-turn, а interactive: FPS при pan, input-to-paint,
  longtask-sum за сценарий (`perf/interactive.mjs`).
- **Kill switch** тот же — `git reset --hard HEAD~1` + причина в
  `perf/session-N.md`. Но критерий отката мягче: если interactive
  улучшилось, а per-turn просел **< 10 %**, это приемлемо (цели разные).
- **Риск регрессии** — выше, чем у 1-15: zoom-label handler, dialogue
  rendering — UI-тонкости, которые легко сломать косметически. Ручная
  проверка в браузере обязательна перед push'ем в каждой из 16-22.

## Настройка Routine (`/schedule`)

Рекомендую **ручной триггер между сессиями**, не cron. Причина: часть сессий (3, 5, 7, 10) потенциально меняет поведение и требует визуального подтверждения игроком, что ничего не сломалось. Cron-режим рискует накопить 3-4 broken-сессии за ночь.

Команда для ручного запуска каждой сессии:
```
/schedule run-once — prompt:
  "Выполни Session N из /Users/dzavadgadzimuradly/.claude/plans/binary-mixing-eagle.md.
   Точно следуй секции «Формат сессии». В конце — коммит и push в ветку
   claude/exciting-fermat-KVLXr. Если kill-switch сработал, останови."
```

Для autonomous-режима (все 15 подряд) — запустить `/loop 30m <тот же prompt с переменной N=N+1>`, но только если предыдущая сессия зелёная. Проверка `git log -1 --pretty=%s` на содержит "Session (N-1)" — условие запуска Session N.

## Верификация всего плана (после 22 сессий)

1. `node perf/profile.mjs` сравнивается с `perf/baseline.md` — per-turn p50 должен упасть в **>5 раз**.
2. `npm run dev`, сыграть 20 ходов в браузере: кнопка "Следующий ход" возвращает фокус менее чем за 1 сек.
3. DevTools Performance Recording одного хода — нет блокирующих JS-тасков >200ms на main thread.
4. `npm run build:vite && npm run preview` — first-meaningful-paint < 2 сек.
5. `tests/audit/*_test.cjs` — все по-прежнему зелёные (ни одна оптимизация не сломала игровую логику).
6. **После 16-22** — `node perf/interactive.mjs`: mean-FPS при pan ≥ 50, input-to-paint p95 < 50 ms, keystroke-to-paint p95 < 16 ms, сумма longtask за сценарий **−60 %** относительно interactive-baseline.
