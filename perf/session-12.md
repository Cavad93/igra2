# Session 12 — Lazy-load `data/regions_data.js`

**Before:** boot 3033 ms, per-turn p50 1761 ms, p95 3268 ms
**After:**  boot 2064 ms, per-turn p50 1726 ms, p95 3273 ms
**Delta:**  boot **−32 %** (~−969 ms); per-turn не изменилось (как и ожидалось — это boot-оптимизация, не tick-оптимизация)

**Tests:**
- `node tests/audit/map_unit_test.cjs` — 49 PASS / 2 FAIL (оба pre-existing, не связаны: r472/main, r1061/wei — несоответствие данных в nations.js vs regions_data.js)
- `node tests/audit/map_integration_test.cjs` — 22 PASS / 2 FAIL (pre-existing)
- `node tests/audit/eco_unit_test.cjs` — 18 PASS / 0 FAIL
- `node tests/audit/dip_unit_test.cjs` — 33 PASS / 0 FAIL

Проверено, что количество загруженных регионов после boot = 3734 (совпадает с baseline), lazy-импорт отрабатывает до initGame().

## Что изменено

- `ui/boot.js:34` — статический `import * as _regionsData from '../data/regions_data.js'`
  заменён на динамический `var _regionsDataReady = import('../data/regions_data.js')`.
  Промис сохранён в `window._regionsDataReady` (на случай, если другим модулям/
  тестам понадобится дождаться загрузки).
- `ui/boot.js:178` — `_regionsData` убран из вызова `_reg(...)` (у файла 0 ES-экспортов —
  только side-effect IIFE, который мутирует `INITIAL_GAME_STATE.regions`).
- `ui/boot.js:546` — `window.initGame().then(...)` обёрнут в
  `_regionsDataReady.then(() => window.initGame()).then(...)`, чтобы гарантировать
  что `INITIAL_GAME_STATE.regions` заполнен до первого `Object.assign` внутри
  `initGame()` в `engine/init.js:9`.

## Наблюдения

- `data/nation_enriched.js` (упомянутый в плане Session 12) **НЕ загружается игрой**:
  единственные его упоминания — в `scripts/geo_server.js` (HTTP-утилита) и
  `scripts/geo_monitor.html` (панель мониторинга). В `ui/boot.js` он никогда не
  импортировался, lazy-load не нужен.
- `regions_data.js` — 7.0 MB, используется как side-effecting IIFE: читает
  `window.INITIAL_GAME_STATE.regions` и мутирует его 3734 записями. Без экспортов,
  поэтому из `_reg(...)` его можно убрать бесплатно.
- Между синхронным `window.GAME_STATE = JSON.parse(JSON.stringify(INITIAL_GAME_STATE))`
  (`boot.js:329`) и `initGame()` ни один код не читает `GAME_STATE.regions`. Так что
  кратковременный шаг, когда `GAME_STATE.regions = {}`, безопасен. `initGame()` на
  своём первом шаге (`engine/init.js:9`) перепишет `GAME_STATE` полным клоном
  `INITIAL_GAME_STATE`, где regions уже загружены.
- Экономия boot ~= время parse 7 MB JS на main thread. Profile.mjs использует
  headless Chromium, где это ~1 сек. В реальном браузере на слабом железе
  выгода должна быть выше.
- Perf per-turn не изменился (1914 → 1923 ms mean, 1761 → 1726 ms p50) — это
  ожидаемо: оптимизация влияет только на boot-фазу.

## Потенциальные риски

- Если когда-нибудь между `boot.js:329` (clone) и `window.initGame()` кто-то добавит
  код, читающий `GAME_STATE.regions`, он увидит пустой объект. Защита: `initGame()`
  начинается с полного Object.assign из INITIAL_GAME_STATE, который к тому моменту
  уже наполнен lazy-промисом — любое использование GAME_STATE.regions после
  `initGame().then(...)` безопасно.
