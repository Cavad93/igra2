# Session 1 — Профайлер-базис

**Before:** — (baseline-сессия, сравнивать не с чем)
**After:**  3505.6 ms mean / 3179.8 ms p50 / 5300.3 ms p95 per-turn (10 ходов)
**Delta:**  n/a — это первая перф-метрика в репозитории

**Boot:** 3884 ms (от `file://…/index.html` до `GAME_STATE.turn >= 1`)

**Tests:** не запускались — сессия ничего не меняет в игровой логике, только
добавляет измерительный скрипт и отчёты. По CLAUDE.md тесты «не запускать
после каждого изменения» — это как раз такой случай.

**Notes:**
- Playwright + headless Chromium вместо jsdom: реальный Leaflet/DOM не живёт
  в jsdom, renderAll валится. Честный headless — минимальное приближение.
- `console.time/timeEnd` в engine/turn.js не ловится просто через `page.on('console')` —
  DevTools protocol выдаёт их как отдельный тип события, текст `m.text()`
  приходит пустой. Решение: `context.addInitScript` подменяет `console.timeEnd`
  на `console.log('[perf-step] …')`, который парсится стабильно.
- Доминируют: экономика (~42%) и ИИ (~20%). Остальное + рендер (~33%)
  размазано между `renderAll` / `refreshRegionStyles` / `innerHTML=` в панелях —
  их Session 5-6 разгребают.
- Файлы: `perf/profile.mjs` (скрипт), `perf/baseline.md` (человекочитаемый
  отчёт), `perf/last_run.json` (сырые числа для diff в следующих сессиях).
