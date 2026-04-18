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

## Верификация всего плана (после 15 сессий)

1. `node perf/profile.mjs` сравнивается с `perf/baseline.md` — per-turn p50 должен упасть в **>5 раз**.
2. `npm run dev`, сыграть 20 ходов в браузере: кнопка "Следующий ход" возвращает фокус менее чем за 1 сек.
3. DevTools Performance Recording одного хода — нет блокирующих JS-тасков >200ms на main thread.
4. `npm run build:vite && npm run preview` — first-meaningful-paint < 2 сек.
5. `tests/audit/*_test.cjs` — все по-прежнему зелёные (ни одна оптимизация не сломала игровую логику).
