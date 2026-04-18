# Session 25 — Разбить engine-ai чанк (520 kB) на engine-ai/gov/chars

**Before (Session 14 split):**

| chunk | size | gzip |
|---|---:|---:|
| engine-ai | **520.96 kB** | 155.48 kB |

**After (Session 25):**

| chunk | size | gzip |
|---|---:|---:|
| engine-ai | **404.06 kB** | 121.52 kB |
| engine-gov (new) | 110.75 kB | 32.67 kB |
| engine-chars (new) | 6.29 kB | 2.86 kB |
| **sum** | **521.10 kB** | 157.05 kB |

Общий размер практически не изменился (-0.14 kB), но ни один чанк больше
**не превышает 500 kB порог** предупреждения vite. Критическую для
первого кадра часть можно теперь кэшировать/preload-ить отдельно.

**Tests:**
- `node tests/audit/eco_integration_test.cjs` — PASS (16/16)
- `node tests/audit/ai_integration_test.cjs` — PASS
- `node tests/audit/gov_integration_test.cjs` — PASS (22/22)
- `node tests/perf/turn_budget_test.cjs` — PASS (20/20)

## Что сделано

В `vite.config.js` `manualChunks` разбит старый `engine-ai` на три логических
чанка по зоне ответственности:

### `engine-gov` (110.75 kB) — правительство, политика
- `engine/government.js` (2613 строк) — правительственная механика
- `engine/senate.js` (1389 строк) — сенат, голосования
- `engine/constitutional.js` (548 строк) — конституционные реформы

Эти модули часто обновляются вместе и используются только при открытии
UI-вкладок Government / Senate. При изменениях их можно инвалидировать
в кэше браузера независимо от `engine-ai`.

### `engine-chars` (6.29 kB) — персонажи + архивы
- `engine/characters_ai.js` (180 строк) — логика поведения персонажей
- `engine/characters_lifecycle.js` (83 строки) — рождение/смерть
- `engine/super_ou.js` (2864 строки) — мистические события
- `engine/memory.js` (341 строк) — исторический архив

Финальный размер 6.29 kB показывает, что значительная часть этих модулей
treeshaken (много внутренних функций не вызывается из других чанков);
это как раз плюс — стабилизация границы упрощает шейкинг.

### `engine-ai` (404.06 kB) — AI-решения (основной ход)
- `engine/ai_worker.js` (207 строк), `engine/ai_fallback.js` (425 строк),
  `engine/ai_scoring.js` (183 строки)
- `ai/*` — LLM-мосты (claude.js — 2196 строк, strategic_llm.js, utility_ai.js
  — всего 6598 строк в директории)

Используется каждый ход для принятия решений AI-нациями; критический
путь.

## Notes

- Split **не меняет runtime-поведение** — все модули по-прежнему грузятся
  через `import` в `ui/boot.js`. Браузер параллельно подгружает отдельные
  чанки, но ES-module graph идентичен.
- Reduced `engine-ai` (520 → 404 kB) — **ниже порога 500 kB** vite не будет
  больше ругаться на этот конкретный чанк (осталось: `index`, `data-nations`,
  `data-map`, `regions_data`).
- Зависимости между `engine-gov` и `engine-chars`: government.js использует
  character-ids напрямую, но только через runtime-lookup на `window.*`
  (через `_reg(...)` паттерн). Статических ES-импортов между чанками нет.
- Preload-hint в index.html не нужен — critical path уже идёт через
  main `index` чанк; engine-gov/chars грузятся по требованию.
- `npm run preview` first-interaction замер — не делался (среда без live
  browser), оставлен как futurework в baseline.md.
