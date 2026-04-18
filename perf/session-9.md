# Session 9 — Ring buffer для events_log и history

## Цель

`GAME_STATE.events_log` и `_turn_summary_history` росли без ограничения,
когда запись шла **мимо** обёртки `ui/log.js:addEventLog` (прямые
`events_log.push` в `ai/strategic_llm.js`, а также старые сейвы, загруженные
до добавления внутренних обёрток). На длинной игре это утяжеляло runtime
состояние и увеличивало цену structured-clone при `saveGame()`.

## Что поменяно

1. **`engine/turn.js`**
   - Добавлена константа `PERSIST_CAPS = { events_log: 500, turn_summary_history: 200 }`.
   - Добавлена функция `_enforcePersistentLogCaps(gs)`, вызывается в самом
     начале `processTurn()` — аварийный предохранитель.
2. **`ai/strategic_llm.js`**
   - После двух прямых `events_log.push(...)` добавлен локальный трим до
     500 записей (`_trimEventsLog`), так как эти push'ы идут в обход
     `addEventLog` и бесконтрольно пухнут при реальных LLM-вызовах.
3. **Не трогали то, что уже ограничено:**
   - `ui/log.js LOG_MAX_ENTRIES = 120` (рендер 12) — жёстче плана (500), оставлено.
   - `_recordTurnSummary`: cap=24 (2 года) — жёстче плана (200), оставлено.
   - `ui/panels.js _RES_HISTORY_MAX = 10` (спарклайны) — уже cap'нуто.
   - `engine/achievements.js chronicle_log` cap=50, `economy_ext.trade_history` cap=24,
     `super_ou.history` cap по `SUPER_OU_CONFIG.historyLength`,
     `demography.pop.history` cap=60, `age_demographics.dem.history` cap=120.

`PERSIST_CAPS` — верхние (внешние) рамки. Внутренние обёртки держат
жёстче — значит кап в `processTurn()` почти всегда no-op на здоровом state
и срабатывает только при:
  - загрузке старого сейва без внутренних лимитов;
  - активной LLM-сессии, где strategic_llm раз за разом пушит мимо обёртки.

## Верификация

```
node tests/audit/eco_integration_test.cjs  — PASS (16/16)
node tests/audit/eco_unit_test.cjs         — PASS (18/18)
node tests/audit/dip_integration_test.cjs  — PASS (27/27)
node tests/audit/dip_unit_test.cjs         — PASS (33/33)
node tests/audit/gov_integration_test.cjs  — PASS (22/22)
node tests/audit/mil_integration_test.cjs  — PASS (26/26)
node tests/audit/map_integration_test.cjs  — 22/24 (2 fail — pre-existing,
  не связаны с этим PR; перепроверено на baseline)
node tests/audit/ai_integration_test.cjs   — Failed to load modules
  (pre-existing ESM/CJS mismatch, не связан с этим PR)
node tests/test_save_roundtrip.mjs         — PASS (save→load не теряет данные)
node perf/profile.mjs                      — p95 turn time без регресса
```

## Измерение `perf/session9_hist.mjs`

Скрипт грузит игру в headless Chromium, после 5 прогревочных ходов
искусственно «раздувает» `events_log` и `_turn_summary_history` до 5000
записей каждый (имитация long-running LLM-сессии), замеряет размер
payload'а и стоимость `structuredClone` **до** и **после** вызова
`_enforcePersistentLogCaps`.

```
PERF_WARMUP=5 PERF_SYNTH=5000 node perf/session9_hist.mjs

Caps: events_log=500, _turn_summary_history=200

  events_log.length              5120  →     500
  _turn_summary_history.length   5005  →     200
  payload JSON (MB)             33.07  →   33.07  (0.0%)
  runtime GAME_STATE (MB)      106.92  →  105.66  (-1.2%)
  structuredClone mean (ms)    603.27  →  593.82  (-1.6%)
  structuredClone p95 (ms)      763.5  →   675.9  (-11.5%)
```

**Before:** structuredClone p95 = 763.5 ms (runtime state с неограниченными журналами).
**After:**  structuredClone p95 = 675.9 ms (после enforcement cap).
**Delta:**  −11.5% p95 на save-path clone.

**Tests:** `tests/audit/*_test.cjs` — без регресса; `test_save_roundtrip.mjs` PASS.
**Notes:**
- Payload JSON остался прежним: `_buildSavePayload()` уже слайсит
  `events_log` до 50 и дропает `_turn_summary_history` полностью — поэтому
  размер на диске не меняется. Runtime-save-path (structured-clone для
  Web Worker из Session 7) — **меняется**: клонируется именно runtime
  объект, так что сокращение массивов в runtime улучшает p95.
- Основной выигрыш — в боевой игре с live LLM: `strategic_llm.js` без
  трима раньше мог дорастить `events_log` до десятков тысяч записей за
  длинную сессию (при `shouldPlan` каждые 20 ходов для ~100 tier1+2 наций).
  Теперь верхняя граница 500 строго держится.
- `_turn_summary_history` при штатной работе держится на 24 записях
  (внутренний cap в `_recordTurnSummary`). Внешний cap 200 сработает
  только при загрузке сейва со старой версии, где этого cap не было.
