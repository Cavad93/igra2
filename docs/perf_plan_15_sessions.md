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

### Session 20 — Убрать `renderAll()` из keystroke-пути input-хэндлеров   ✅ Выполнено (2026-04-18)
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

### Session 21 — `innerHTML=` → DOM API в `ui/government_tab.js`   ✅ Выполнено (2026-04-18)
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

### Session 22 — Region culling при стратегическом zoom   ✅ Выполнено (2026-04-18)
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

### Session 29 — Per-tick memo стоимости входов рецептов по building_id   ✅ Выполнено (2026-04-18)
**Цель:** `Σ(input.amount × market.price)` для каждого рецепта считается
**трижды** независимо на каждый активный слот каждого экономического тика:
в `processAllRecipes` (шаг 1a), `updateBuildingFinancials` (шаг 3a) и
`recomputeAllProductionCosts` (шаг 5a). На baseline-пресете это ~10k
слот-обходов × 1-3 входа × 3 раза = ~60-100k избыточных `market[g]?.price`
lookups за тик, хотя сумма зависит только от `(building_id, recipe, market)`,
а рыночные цены стабильны между шагами 1a и 5a (updateMarketPrices — в 5d).
**Файлы:** [engine/buildings.js](engine/buildings.js) (новые
`_bumpRecipeCostCacheTick`, `_getRecipeInputCostsByBuilding` + замены в 5
callsite'ах), [engine/economy.js](engine/economy.js) (бамп в начале
`runEconomyTick`).
**Шаги:**
1. Ключ кэша — `building_id`; значение — `Array<inputCostPerUnit[rIdx]>`.
   ~50 уникальных building_id делят одну запись вместо 10k слот-обходов.
2. Инвалидация раз-за-тик бампом `_bumpRecipeCostCacheTick()` из
   `runEconomyTick` (до шага 1).
3. Замена внутренних per-input loop'ов на cache-read в
   `processAllRecipes`, `updateBuildingFinancials`,
   `recomputeAllProductionCosts`, `_estimateSlotProfit`,
   `_estimateSlotProfitability`. Математика идентична, `treasury = 21389`.
**Результат:** total mean **2398 → 2320–2371 ms** (−1.1…−3.3 %), econ mean
**986 → 925–978 ms** (−0.8…−6.2 %) — в пределах noise (±3 %), но знак
положительный на всех трёх прогонах. Главный осязаемый итог — чистое
удаление трёх продублированных внутренних циклов и подготовка cost-функции
как переиспользуемого хелпера. Все audit тесты (14×PASS) + budget guard
20/20 зелёные. `perf/session-29.md`.

### Session 28 — Log-spam gate в `updateRegionSpecialization` (turn-10 p95)   ✅ Выполнено (2026-04-18)
**Цель:** `perf/last_run.json` показывал p95 Экономики **2782 ms** vs p50 **541 ms**
— одиночный шип на 10-м ходу. Session 27 notes подозревали AI tier2,
но `ИИ думает` в p95 был всего 203 ms. Инструментация
`runEconomyExtTick` выявила: 2568 ms тратится в
`updateRegionSpecialization()`. На `streak = 10` у ~2500 из 3734 регионов
одновременно `newBonus (1.05) > prev (1.0)` → каждый триггерил
`addEconomicEvent` → `addEventLog` → `renderLog` (пересборка DOM).
События чужих регионов игроку в UI всё равно не показывались.
**Файлы:** [engine/economy_ext.js](engine/economy_ext.js)
(3 места в `updateRegionSpecialization`),
[tests/eco_stage3_specialization_test.cjs](tests/eco_stage3_specialization_test.cjs)
(ESM-стрип для vm — pre-existing баг, падал до фикса).
**Шаги:**
1. Хойст `playerId = GAME_STATE.player_nation`, `isPlayerRegion = region.nation === playerId`.
2. Гейтировать 3 `addEconomicEvent`-вызова (смена/потеря/повышение спеца)
   через `isPlayerRegion`. Расчёт `streak`/`bonus` — без изменений.
3. Исправлен pre-existing ESM-баг в `tests/eco_stage3_specialization_test.cjs`
   (стрип import/export + `export const` → `var` для vm-совместимости).
**Результат:** full turn mean **1864.5 → 1669.3 ms (−10.5 %)**, p95
**4674.6 → 2112.1 ms (−54.8 %)**. Экономика p95 **2782.7 → 980.9 ms (−64.7 %)**.
Ход 10 (spike) **3910.5 → 1804.7 ms (−53.8 %)**. Treasury=21389
идентично baseline. `perf/session-28.md`.

### Session 27 — Memoize region-invariants в `calcRegionLandCapacity`   ✅ Выполнено (2026-04-18)
**Цель:** `engine/turn.js:267` вызывает `calcRegionLandCapacity` для всех
3734 регионов каждый ход. Внутри — три `Math.round(total*pct)`,
`filter().reduce()` по `building_slots`, `Object.fromEntries(['wheat_family_farm',…].map(...))`
с 7× `getBuildingFootprint` и `REGION_BIOMES`/`REGION_AREAS` лукапами.
Всё это для констант от `(biome, area_ha)` — неизменных в рантайме
(grep `region.biome =` → только init/save-load при `!r.biome`).
**Файлы:** [engine/land_capacity.js](engine/land_capacity.js)
(новые `_ensureLandConst`, `_getCanBuildFootprints`).
**Шаги:**
1. Кэш `region._landConst` с полями `total_ha`, `unsuitable_ha`,
   `reserve_ha`, `max_arable_ha`, `max_buildings_ha`, `buildable_ha`,
   `per_person_ha`, `biome` — ключ валидности пара (`_biome`, `_area`).
2. Замена `filter().reduce()` на однопроходный `for (let i…)` без
   временных массивов.
3. Замена `Object.fromEntries(['wheat_family_farm',…].map)` + 7×
   `getBuildingFootprint` на предвычисленную таблицу `_canBuildFootprints`
   и плоский `for`.
**Результат:** full turn mean **2090.7 → 1864.5 ms (−10.8 %)**, p50
**1812.8 → 1593.8 ms (−12.1 %)**, p95 **4674.6 → 3910.5 ms (−16.3 %)**.
Econ p50 **655.5 → 540.9 ms (−17.4 %)**. Treasury=21389 идентично
baseline. `perf/session-27.md`.

### Session 26 — Throttle saveGame (раз в CONFIG.SAVE_INTERVAL_TURNS=5 ходов)   ✅ Выполнено (2026-04-18)
**Цель:** `_buildSavePayload` + `postMessage(payload)` — единственный
main-thread save-work, оставшийся после S7. Снижаем частоту вызова:
при interval=5 на 10 ходов happens 2 full-save вместо 10.
**Файлы:** [config.js](config.js) (`SAVE_INTERVAL_TURNS`),
[engine/save.js](engine/save.js) (`saveGame(opts)` + throttle state),
[tests/test_save_roundtrip.mjs](tests/test_save_roundtrip.mjs)
(передаёт `{ force: true }`).
**Шаги:**
1. Добавить `CONFIG.SAVE_INTERVAL_TURNS = 5`.
2. `saveGame({force=false})`: при `!force && throttle` возвращает
   `{ skipped: true }` без работы.
3. Ревизия `test_save_roundtrip.mjs` и исправление пре-существующего
   бага в `ai_{integration,unit}_test.cjs` loadScript regex (стрипал
   только `export`, ломался на `import`).
**Верификация:** Сохранение p50 **2.5 → 0.5 ms (−80 %)**; все audit
тесты (включая исправленные ai_*) + save-roundtrip + budget guard
зелёные; syracuse.treasury = 21389 (детерминистично).

### Session 25 — Разбить engine-ai чанк (520 kB) на engine-ai/gov/chars   ✅ Выполнено (2026-04-18)
**Цель:** опустить крупнейший non-data чанк ниже порога 500 kB vite,
изолировать редко-меняющиеся «политические» подсистемы для независимого
кэширования браузером.
**Файлы:** [vite.config.js](vite.config.js) (`manualChunks`).
**Шаги:**
1. `engine-gov` ← government.js, senate.js, constitutional.js (110.75 kB).
2. `engine-chars` ← characters_ai.js, characters_lifecycle.js, super_ou.js,
   memory.js (6.29 kB после tree-shaking).
3. `engine-ai` (остался) ← ai_worker, ai_fallback, ai_scoring, ai/*
   (404.06 kB вместо 520.96 kB).
**Верификация:** `npm run build:vite` — `engine-ai` **−22 %** (520 → 404 kB),
нет чанков > 500 kB кроме `index`/data-; eco/ai/gov audit тесты зелёные.

### Session 24 — Per-tick memo building-производства + hoist subsistence-инвариантов   ✅ Выполнено (2026-04-18)
**Цель:** устранить дублирование обхода building_slots между шагами 1b
(`calculateAllBuildingProduction`) и 1c (`_getRegionalBuildingProduction`),
плюс вынос нация-уровневых инвариантов из горячего subsistence-цикла.
**Файлы:** [engine/buildings.js](engine/buildings.js) (per-tick byRegion/totals
кэш), [engine/economy.js](engine/economy.js) (read-через-кэш +
`_REGION_PROD_ENTRIES_CACHE` + hoist, бамп в `runEconomyTick`).
**Шаги:**
1. Добавить `_bumpRegionalProdCacheTick`, `_getCachedRegionalBuildingProduction`,
   `_cacheRegionalBuildingProduction`.
2. `calculateAllBuildingProduction`: cache-first путь через byRegion-суммирование.
3. `_getRegionalBuildingProduction`: cache-first путь с fallback на полный обход.
4. `calculateProduction`: hoist nation-уровня, `nationConst`/`regionConst`,
   индексированный цикл по закэшированным `Object.entries`.
**Верификация:** eco audit тесты + perf budget — зелёные; Econ p50 **−5 %**.

### Session 23 — Агрессивный skip stub-наций (pop<10k + ≤1 регион)   ✅ Выполнено (2026-04-18)
**Цель:** расширить `_isStubNation` вторичным критерием — «малое племя»
с населением < 10 000 и ≤ 1 регионом пропускается так же, как нация без
зданий. В пресете таких наций ~138 (из 902). Игрок защищён по
`nationId === GAME_STATE.player_nation`.
**Файлы:** [engine/economy.js](engine/economy.js) (`_isStubNation`,
`runEconomyTick`).
**Шаги:**
1. Экспортировать `STUB_POP_THRESHOLD = 10000`.
2. В `_isStubNation(nation, nationId)` добавить раннюю ветвь:
   `if (!isPlayer && pop < threshold && regs.length <= 1) return true;`.
3. В `runEconomyTick` передать `nId` вторым аргументом.
**Верификация:** `tests/audit/eco_*` зелёные, syracuse treasury после 10
ходов = 21389 (детерминистично), Экономика p50 **−14.9 %**.

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

---

# Track B — Редизайн тактического боя в стиле «Kings & Generals / Ultimate General»

> **Это отдельный трек**, не перф-сессии. Референс — кадры с YouTube канала
> **History Flywheel** (painted top-down карта + прямоугольные «отрядные плашки»
> с гербами/иконками родов войск + укрепления и топонимика) и механика
> управления в духе **Total War**, но без 1:1-детализации спрайтов-солдатиков.
>
> **Желаемый визуальный эффект:**
> - карта-подложка в стиле живописной топо-съёмки (виньетка по краям, реки,
>   леса, дороги, видимые укрепления)
> - армии — прямоугольные токены с цветом фракции, иконкой рода войск и
>   drop-shadow'ом
> - большие юниты рисуются **матрицей из токенов** в строю (3×6, 5×4 и т.п.)
> - лейблы местности («Будищенский лес», «Яковцы» в референсе)
>
> **Желаемый контроль:**
> - **click** — выбрать отряд; **shift+click** — добавить к выбору
> - **right-click-drag** (как в Total War) — переместить строй: длина drag'а
>   = фронт, направление = facing; `Alt+drag` сохраняет форму предыдущего
>   построения
> - **double-click по юниту** — переформировать (line/column/square)
> - **Tab** — tactical camera (zoom-out + viewport-overview)
> - `Q/E` — rotate selection; `F` — fire-at-will toggle; `H` — hold position
>
> Полностью заменяет текущий примитивный Canvas-рендер
> [ui/tactical_map.js](ui/tactical_map.js) + встраивается в существующий
> [ui/battle_map_pixi.js](ui/battle_map_pixi.js) (Pixi.js v8 уже в проекте —
> см. [vite.config.js](vite.config.js) `manualChunks.tactical`).
>
> **Важные ограничения (read before start):**
> - 1 ход = 1 месяц (инвариант проекта) — тактический бой развязывается
>   внутри одного хода, не требует отдельной таймлайн-анимации между ходами.
> - 1 ресурсная единица = 1 кг — визуал не влияет на экономику.
> - Публичное API (`resolveBattle` в armies.js, `window.TacticalBattle.*`)
>   не ломать, только надстраивать UI-слой.
> - **Все ассеты — только CC0 / CC-BY / Public Domain** с разрешённым
>   коммерческим использованием. Платные, CC-BY-NC, share-alike —
>   не используем.
> - Ассеты разделены по размеру:
>   - **SVG-иконки** юнитов и объектов (`assets/battle/units/*.svg`,
>     `assets/battle/objects/*.svg`) — **в git**, маленькие (~1-5 KB),
>     CC-BY 3.0 атрибуция в [assets/battle/README.md](../assets/battle/README.md).
>   - **Terrain тайлы** (`assets/battle/terrain/*.png/*.jpg`) — **НЕ в git**
>     (gitignored), скачиваются через [assets/battle/download_battle_assets.sh](../assets/battle/download_battle_assets.sh)
>     с CC0-источников (Kenney.nl, OpenGameArt).
>   - **Референс-скрины** (`docs/battle_ui/refs/*.png/*.gif`) — **НЕ в git**
>     (копирайт YouTube), пользователь собирает вручную, используются
>     только как brief, не встраиваются в игру.

## Формат сессии (Track B)

1. `git fetch && git checkout claude/exciting-fermat-KVLXr && git pull`
2. Прочесть секцию Session B-N, «Цель/Файлы/Шаги/Верификация».
3. WebSearch/WebFetch для актуальных паттернов Pixi.js v8 (фильтры, spine,
   particles) — это обязательно для B-1, B-3, B-7.
4. Правки атомарные; новые файлы создавать `Write` каркаса + `Edit` секции.
5. **Визуальная верификация**: для каждой сессии делать скрин результата,
   класть в `docs/battle_ui/session-B{N}.png` — на PR/коммит достаточно
   ссылки. UI-фичи не проверяются только через unit-тесты.
6. Коммит: `feat(battle-ui): Session B-N — <summary>`. Ветка та же.

**Kill switch:** если тесты `tests/audit/mil_*_test.cjs` падают или
`resolveBattle()` бросает в консоли на типичных сценариях — `git reset
--hard HEAD~1`, записать причину в `docs/battle_ui/session-B{N}.md`.

## B-1 — Ассет-пайплайн + brief

**Цель:** собрать банк референсов и скриптов, которые будут генерировать
текстуры/спрайты единообразно. Без этого каждая сессия начнёт рисовать
что-то своё.

**Уже готово в репозитории (пре-сессия, см. коммит от 2026-04-18):**
- [assets/battle/](../assets/battle/) — структура + атрибуции (CC-BY 3.0).
- [assets/battle/units/](../assets/battle/units/) — **15 CC-BY SVG-иконок**
  (hoplite, phalangite, archer, slinger, heavy_cavalry, light_cavalry,
  light_infantry, melee_generic, cavalry_melee, mounted, war_elephant,
  artillery_siege, naval_trireme, naval_galley, general_standard).
- [assets/battle/objects/](../assets/battle/objects/) — **7 CC-BY SVG**
  (camp_tent, fortification, watchtower, palisade_wood, bridge_stone,
  victory_marker, siege_horse).
- [assets/battle/download_battle_assets.sh](../assets/battle/download_battle_assets.sh)
  — идемпотентный фетч (game-icons.net + Wikimedia PD + OpenGameArt).
- [assets/battle/README.md](../assets/battle/README.md) — полная
  атрибуция авторов (Lorc + Delapouite) + политика «только CC0/CC-BY/PD».

**Файлы (в рамках самой сессии):** новый `docs/battle_ui/brief.md`,
`docs/battle_ui/refs/` (5–10 скринов с History Flywheel, Ultimate General,
Kings & Generals, Cossacks 3 — собираются вручную, копирайт), новый
`scripts/gen_terrain_tiles.mjs` (опциональный wrapper над
`download_battle_assets.sh` для расширения каталога биомов).

**Шаги:**
1. Запустить `bash assets/battle/download_battle_assets.sh` — идемпотентно
   добивает недостающие ассеты (если Wikimedia/OpenGameArt доступны из CI,
   скачает и terrain-тайлы; иначе пропустит с FAIL).
2. Собрать 8–10 референсных кадров вручную в `docs/battle_ui/refs/`
   (battlemaps.eu, K&G YouTube — скрины не автоматизируем, авторское).
   Подписать в `brief.md`: какой слой (terrain/units/fortifications/
   labels/vignette) мы забираем. **Источники:**
   - [battlemaps.eu — Gaugamela](https://www.battlemaps.eu/battles/gaugamela.html)
   - [battlemaps.eu — Cannae](http://www.battlemaps.eu/battles/cannae.html)
   - [Wikimedia Commons — Battle of Cannae maps](https://commons.wikimedia.org/wiki/Category:Maps_of_the_Battle_of_Cannae)
   - [American Battlefield Trust — Animated Maps](https://www.battlefields.org/learn/maps/animated-battle-maps)
3. **Каталог юнитов уже реализован** как файлы в `assets/battle/units/*.svg`
   (15 базовых типов). При необходимости расширить — добавить строчку в
   `ICONS=(...)` массиве внутри `download_battle_assets.sh`.
4. Каталог биомов (для `scripts/gen_terrain_tiles.mjs` или fetch'а):
   `grassland, forest, hills, mountain, coast, desert, river, road_dirt,
   road_paved, bridge, palisade_wood, wall_stone` — 256×256 seamless.
5. `scripts/gen_terrain_tiles.mjs` — CLI (опционально): качает
   **CC0-тайлы с Kenney.nl** или OpenGameArt (фильтр: CC0 / CC-BY) в
   `assets/battle/terrain/<biome>.png` (уже в .gitignore, не коммитим).
   CC0 предпочтительнее — без требования атрибуции.

**Политика ассетов:** **только CC0 / CC-BY / Public Domain** с
разрешённым коммерческим использованием. Платные паки и ассеты с
CC-BY-NC / SA / проприетарными лицензиями в проекте **не используем**.
Подробности — в [assets/battle/README.md](../assets/battle/README.md).

**Верификация:**
- `bash assets/battle/download_battle_assets.sh` → в первом прогоне OK≥0,
  при повторном SKIP=22 (все уже на диске), FAIL=0 на локальных ресурсах.
- Просмотр [assets/battle/README.md](../assets/battle/README.md) — все
  22 файла упомянуты в атрибуции (CC-BY 3.0 compliance).
- Типы юнитов в `assets/battle/units/*.svg` согласованы с категориями в
  [data/army_profiles.js](data/army_profiles.js) (hoplite/phalangite/
  archer/slinger/light_cavalry/heavy_cavalry/war_elephant покрывают
  Syracuse+Carthage+Ptolemaic roster).

## B-2 — Terrain layer (painted подложка)

**Цель:** убрать плоский однотонный фон тактической карты, заменить на
многослойную painted-подложку с виньеткой.

**Файлы:** [ui/battle_map_pixi.js](ui/battle_map_pixi.js) (новый слой
`terrainLayer`), новый `ui/battle/terrain_renderer.js`, тайлы из
`assets/battle/terrain/*.png` (фетчатся `download_battle_assets.sh`,
не в git).

**Шаги:**
1. В Pixi Application создать 4 именованных контейнера:
   `terrain`, `objects`, `units`, `effects`. Сейчас всё в одном root.
2. `TerrainRenderer` берёт биомную карту из
   [data/map.js](data/map.js) MAP_REGIONS для конкретного региона боя,
   мозаично стелет seamless-тайлы из `assets/battle/terrain/<biome>.png`
   (grassland, forest, hills, coast, desert). Fallback — плейсхолдер
   из `nation.color` если тайл отсутствует (graceful degradation при
   первом запуске до `download_battle_assets.sh`).
3. Поверх — overlay реки/дороги (SVG path, сгенерированный из geojson
   [data/world_bc300.geojson](data/world_bc300.geojson) или из
   [data/pleiades_300bc.json](data/pleiades_300bc.json)).
4. Виньетка: `PIXI.Filter` с radial-gradient шейдером или
   `PIXI.Graphics` с альфа-градиентом от краёв. На референсе чётко видна.
5. Лёгкий `ColorMatrixFilter` для «патины» — +5% sepia, -3% saturation.

**Верификация:** [docs/battle_ui/session-B2.png] — карта выглядит как
живописная топо-съёмка, а не как однотонная подложка. Производительность
не упала >5% (`perf/profile.mjs` остаётся в рамках).

## B-3 — Unit sprite factory + drop shadow

**Цель:** заменить текущие примитивы (круги/квадраты) на
стилизованные плашки юнитов с иконкой рода войск и фракционным
тинтом.

**Файлы:** новый `ui/battle/unit_sprite_factory.js`,
[ui/battle_map_pixi.js](ui/battle_map_pixi.js).

**Шаги:**
1. `UnitSpriteFactory.create({ type, nationId, role })` возвращает
   Pixi.Container:
   - base плашка 64×96 (Pixi.Graphics + rounded rect, цвет =
     `nation.color`), поверх — иконка рода войск из
     [assets/battle/units/](../assets/battle/units/) (SVG загружается
     через `PIXI.Assets.load('assets/battle/units/hoplite.svg')`). Маппинг
     `type → svg`:
     - infantry_heavy → `hoplite.svg` или `phalangite.svg` (по culture)
     - infantry_light → `light_infantry.svg`
     - archer → `archer.svg`
     - slinger → `slinger.svg`
     - cavalry_light → `light_cavalry.svg`
     - cavalry_heavy → `heavy_cavalry.svg`
     - elephant → `war_elephant.svg`
     - artillery → `artillery_siege.svg`
     - naval → `naval_trireme.svg` | `naval_galley.svg`
     - (role === 'general') → оверлей [general_standard.svg](../assets/battle/units/general_standard.svg)
   - tint иконки через `sprite.tint = Number('0x' + nation.color.slice(1))` —
     SVG с белым заливом (`ffffff`) идеально тинтится.
   - `DropShadowFilter({ distance: 4, blur: 2, alpha: 0.45, angle: 135 })`
2. Кэшировать скомпонованные контейнеры через `RenderTexture` — чтобы
   не строить фильтр каждый кадр. Ключ кэша:
   `${type}:${nationId}:${role}`.
3. Подменить рендер в [ui/battle_map_pixi.js](ui/battle_map_pixi.js)
   для `renderUnit()`: вместо `Graphics.drawRect` — `factory.create(...)`.

**Верификация:** [docs/battle_ui/session-B3.png] — видны плашки с
иконками и тенью, цвет совпадает с `nation.color`. FPS ≥ 50 на
Chromium headless с 30 юнитами на экране.

## B-4 — Formations (матрица токенов)

**Цель:** большой юнит («фаланга 5000») рисуется не как 1 плашка, а как
матрица плашек поменьше в строю, как на референсе.

**Файлы:** новый `ui/battle/formation_renderer.js`,
[engine/tactical_battle.js](engine/tactical_battle.js) (добавить поля
`formation`, `frontWidth`, `depth`).

**Шаги:**
1. Модель строя:
   - `line`: широкий фронт, глубина 2–3 (лучники, легкая пехота)
   - `column`: узкий фронт, глубина 6–8 (штурмовая колонна)
   - `square`: квадрат (оборонительный против кавалерии)
   - `phalanx`: плотный прямоугольник, глубина 6–8
2. `FormationRenderer.render(unit, origin, facing)` раскладывает
   `Math.ceil(size × 0.025)` токенов (коэффициент из Ultimate General)
   в сетку по `frontWidth × depth`, поворачивает всю сетку на `facing`.
3. Все токены одного юнита — дочерние элементы одного
   `PIXI.Container`, чтобы перемещать как один объект.
4. Предел: не более 40 токенов на юнит — иначе 5000 копейщиков съедят
   GPU. Сцейлим коэффициент динамически по общему числу юнитов на поле.

**Верификация:** сражение 6 юнитов × 3000 чел каждая сторона рисует
≤ 240 токенов; строй фаланги визуально отличим от колонны.

## B-5 — Total-War-like drag-controls

**Цель:** right-click-drag управление как в Total War, без необходимости
писать отдельный туториал.

**Файлы:** новый `ui/battle/input_controller.js`,
[ui/battle_map_pixi.js](ui/battle_map_pixi.js) (mouse/keyboard hooks).

**Шаги:**
1. `InputController` слушает Pixi-события + документный `keydown`:
   - `pointerdown` правой кнопкой по карте при активном selection →
     сохранить `origin`; `pointermove` → рисовать preview-линию (длина
     = фронт, угол = facing); `pointerup` → выдать `MoveOrder(unit,
     line, facing)`.
   - `Alt + pointerdown-drag` → preserveFormation: все юниты selection
     двигаются коллективно, сохраняя относительные позиции.
   - `double-click` на юните из selection → открыть радиальное меню
     переформирования.
   - `Tab` → `camera.setZoom(0.4)`; `Shift+Tab` → вернуть.
   - `Q/E` → rotate selection на ±15°; `H` → `holdPosition`; `F` →
     `fireAtWill`.
2. Preview-линия — `PIXI.Graphics`, пунктирная, цвет = faction.
3. Все события пишутся через существующий `engine/tactical_battle.js`
   API (issueOrder), UI не ломает игровую логику.

**Верификация:** [docs/battle_ui/session-B5.gif] — запись управления
4 юнитами через right-drag и Alt-drag. `tests/audit/mil_unit_test.cjs`
— зелёный (мы не трогаем battle resolution).

## B-6 — Укрепления и объекты на поле

**Цель:** частоколы / редуты / палатки / дороги / мосты из референса.

**Файлы:** новый `ui/battle/objects_renderer.js`, расширение
[engine/tactical_battle.js](engine/tactical_battle.js) под
`battlefield.objects[]`.

**Шаги:**
1. Каталог объектов уже в [assets/battle/objects/](../assets/battle/objects/):
   - [palisade_wood.svg](../assets/battle/objects/palisade_wood.svg)
   - [fortification.svg](../assets/battle/objects/fortification.svg) (замок/стены)
   - [watchtower.svg](../assets/battle/objects/watchtower.svg)
   - [camp_tent.svg](../assets/battle/objects/camp_tent.svg)
   - [bridge_stone.svg](../assets/battle/objects/bridge_stone.svg)
   - [victory_marker.svg](../assets/battle/objects/victory_marker.svg) (лавровый трофей)
   - [siege_horse.svg](../assets/battle/objects/siege_horse.svg) (троянский конь — для спец.сценариев)
2. `ObjectsRenderer` расставляет их по данным региона:
   - `region.fortification_level` >= 1 → `palisade_wood.svg` по периметру
   - `>= 2` → `fortification.svg` + `watchtower.svg` по углам
   - `region.has_road` → road (генерится линией Pixi.Graphics, не из SVG)
   - `region.is_river_crossing` → `bridge_stone.svg`
3. Лагерь атакующего/обороняющегося: 3–5 `camp_tent.svg` + штандарт
   ([general_standard.svg](../assets/battle/units/general_standard.svg))
   в центре, в тылу строя.
4. Tint через `nation.color` — все SVG с белой заливкой поддерживают
   `sprite.tint`.

**Верификация:** [docs/battle_ui/session-B6.png] — полевой бой около
укреплённого города показывает стены + ворота + частокол + лагерь
атакующего в тылу.

## B-7 — Атмосфера (bloom, particles, labels)

**Цель:** финальный «живой» слой: лейблы топонимики, пыль от кавалерии,
дым от костров, лёгкий bloom на флагах.

**Файлы:** новый `ui/battle/atmosphere.js`, использует
`@pixi/particle-emitter` (в package.json надо будет добавить).

**Шаги:**
1. Лейблы местности (как «Будищенский лес» на референсе): берутся из
   [data/pleiades_300bc.json](data/pleiades_300bc.json) ближайшие POI
   в радиусе, рендерятся как `PIXI.Text` с outline + opacity 0.7.
2. Particle-emitters:
   - `dust_cloud` под движущейся кавалерией (fade-out ~600 мс)
   - `smoke_rise` над каждым `camp_tent` (медленный)
   - `arrow_flight` при залпе лучников (короткие trail'ы)
3. `AdvancedBloomFilter` на штандартах офицеров
   (`@pixi/filter-advanced-bloom`) — лёгкий, `threshold: 0.7, intensity: 0.4`.
4. Лёгкий screen-shake при попаданиях баллисты (1 из 4 выстрелов).

**Верификация:** [docs/battle_ui/session-B7.gif] — 10-секундная запись
боя показывает пыль, дым, летящие стрелы и лейблы. 60 FPS на среднем
ноутбуке.

## B-8 — Polish + интеграция

**Цель:** собрать все слои в единый pipeline, починить края, задокументировать.

**Файлы:** [docs/bitva.md](docs/bitva.md) (обновить — этап B-8),
[ui/battle_map_pixi.js](ui/battle_map_pixi.js) (финальная сборка),
`docs/battle_ui/architecture.md` (новый — диаграмма слоёв).

**Шаги:**
1. Единый event-flow: `tactical_battle.js` эмитит `battleUpdate` →
   `battle_map_pixi.js` диспатчит в `TerrainRenderer /
   ObjectsRenderer / FormationRenderer / Atmosphere` по изменениям.
2. Hook в `engine/armies.js` `resolveBattle()`: если игрок — участник,
   открывать новый pixi-рендер; иначе — старый авто-резолв.
3. Retro-совместимость: [ui/tactical_map.js](ui/tactical_map.js)
   оставлен как fallback для `?tactical=legacy` URL-параметра
   (QA, debug).
4. В README/[docs/bitva.md](docs/bitva.md) описать новый UI, скрины.

**Верификация:** полный сценарий боя (движение → формирование → залп
→ рукопашная → отступление) проигрывается визуально правильно;
`tests/audit/mil_*_test.cjs` — зелёные; профайлер
(`perf/profile.mjs`) не деградировал относительно пост-S15 baseline.

## Верификация Track B (после B-1 … B-8)

1. Рядом с [docs/battle_ui/refs/](docs/battle_ui/refs/) лежат 8 скринов
   `session-B{1..8}.png/gif`, визуально сходимся с целевым референсом
   на 80%+.
2. `npm run dev` → запустить бой в браузере: картинка ощущается
   как на скрине-референсе, управление в духе Total War, без
   обучения через туториал.
3. Все ключевые слои (terrain/objects/units/effects) изолированы в
   своих файлах, не переплетены с игровой логикой.
4. `tests/audit/mil_*_test.cjs` — 100% pass.
5. Перф: FPS ≥ 55 в головой битве с 20 юнитами, ≥ 45 с 40 юнитами.

## Замечания по Track B

- **Не путать с перф-сессиями.** Track B — UX/визуал. Ресурсы и время
  отдельные; если perf-сессии (9–15) нужны срочно — делай их первыми.
- **Сторонние ассеты.** Большие PNG/JPG (терен, спрайты) — НЕ коммитить
  в репо (правило из [CLAUDE.md](CLAUDE.md):
  `assets/textures/*.jpg` в .gitignore). Кладём на CDN или локально;
  в коде используем плейсхолдеры + `scripts/gen_*` для воспроизводимости.
- **Total War-контролы — MVP.** Не повторять все 80 шорткатов Rome II.
  5–7 ключевых (right-drag, Alt-drag, Tab, Q/E, double-click) — уже
  даёт ощущение «управляется как TW».
- **History Flywheel-стиль — стилизация, не 1:1.** Мы не собираем
  видеопродакшн (AE/Blender). Мы собираем real-time рендер, который
  _выглядит_ как их кадр.
