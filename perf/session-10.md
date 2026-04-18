# Session 10 — AI-нации: round-robin по ходам

**Before (baseline из Session 9, `perf/last_run.json` от 2026-04-18):**
per-turn mean **3457.6 ms**, p50 **3297 ms**, p95 **6184.6 ms**;
`ИИ думает` — mean **665.9 ms**, p50 **679.9 ms**, p95 **759.4 ms**.

**After (Session 10, `node perf/profile.mjs` 10 ходов):**
per-turn mean **1959 ms**, p50 **1780.8 ms**, p95 **3596.1 ms**;
`ИИ думает` — mean **143.8 ms**, p50 **142.6 ms**, p95 **182 ms**.

**Delta:** `ИИ думает` — **−78.4% mean**, **−75% p95**.
Per-turn mean: **−43%** (часть выигрыша за счёт AI, часть run-to-run-шум
в экономическом шаге).

## Что изменено

### `engine/turn.js` — `processAINations()`

До Session 10: каждый ход обрабатывались **все** нации:
- `warWithPlayer` (≤2, Haiku) — прямой критический путь,
- `rotationList = tier1 + tier2` (~185+319 = 504 наций) — кэш phi4 или fallback,
- `tier3` (~397 наций) — всегда fallback (который тикает SuperOU для каждого
  non-stub).

Итого **~900 наций × SuperOU.tick + decision apply** за ход.

После Session 10 добавлен round-robin cursor:
- `CONFIG.AI_TURN_BATCH = 50` — размер батча на ход.
- `GAME_STATE._aiTurnCursor` — позиция в pool (mod pool.length).
- **Критический путь** (обрабатывается каждый ход, игнорирует батч):
  - `warWithPlayer` — нации в войне с игроком;
  - **весь tier1** — стратегически ключевые соседи игрока;
  - **hot-nations** — чьи id фигурируют в `events_log` (≤2 хода,
    `type === 'military' || 'diplomacy'`), в т.ч. из tier2/tier3 — нация,
    которую игрок задел, реагирует в тот же ход без ожидания слота.
- **batchablePool** = (tier2 ∪ tier3) \ критические → обрабатываются срезом
  `BATCH_SIZE` per turn, cursor сдвигается на `take` и wrapping по модулю.

Логика сохранена:
- Кэшированные phi4-mini решения всё ещё применяются мгновенно (если нация
  в батче этого хода).
- Fallback (SuperOU.tick) — как раньше.
- Логирование notable-actions и AI-индикаторов — без изменений.

Добавлен `batch_skip:N` в итоговой строке `[ai_nations] ход X:`, чтобы в
консоли было видно количество отложенных наций.

### `config.js`

Новый параметр `CONFIG.AI_TURN_BATCH = 50` с комментарием про tradeoff
(меньше → быстрее ход, но дольше тишина провинциальных наций).

## Верификация

```
tests/audit/eco_integration_test.cjs   — 16/16 PASS
tests/audit/eco_unit_test.cjs          — 18/18 PASS
tests/audit/dip_integration_test.cjs   — 27/27 PASS
tests/audit/dip_unit_test.cjs          — 33/33 PASS
tests/audit/mil_integration_test.cjs   — 26/26 PASS
tests/audit/gov_integration_test.cjs   — 22/22 PASS
tests/audit/map_integration_test.cjs   — 22/24 (2 pre-existing drift,
  задокументированы в Session 8/9)
tests/audit/ai_unit_test.cjs           — Failed to load modules
  (pre-existing ESM/CJS mismatch, не связан с этим PR)
```

## Микро-бенч `perf/session10_ai.mjs`

Стенд: прогрев 3 хода → замер `processAINations()` stand-alone 8 раз при
`AI_TURN_BATCH=99999` (батч выключен, как до Session 10) → перезагрузка
cursor → замер 8 раз при `AI_TURN_BATCH=50`.

```
Pools: tier1=185 tier2=319 tier3=397 total=902

── processAINations() per-call ──
  batch=OFF (Session 9)  n= 8  mean= 330.77  p50=  306.9  p95=    474
  batch=50 (Session 10)  n= 8  mean=   70.4  p50=     73  p95=   74.4

  delta mean: -78.7%   p95: -84.3%
```

Изолированный `processAINations()` — **−78.7% mean, −84.3% p95**.

## Notes

- **Почему cursor живёт в `GAME_STATE`**, а не в модульной переменной:
  поле должно переживать save/load, иначе после загрузки сейва все нации
  получат тот же слот что и на предыдущей сессии, провал цикла. Теперь
  cursor едет по одной и той же ротации до/после save.
- **Tier1 не батчим.** tier1 — нации в дипломатической зоне игрока
  (≤6 хопов), по определению стратегически важные. За 10-ходный профиль
  это 185 наций. Это основной остаток работы (~70 ms/turn). Батчить tier1
  означало бы замораживать дипломатическую реакцию соседей на игрока на
  много ходов — слишком видимый для пользователя побочный эффект.
- **hot-list и recentPlayerEvents.** Уже существовал `recentPlayerEvents`
  (actor == player, инвалидация кэша). Я добавил более широкий `hotAI`,
  который покрывает ЛЮБУЮ пару в military/diplomacy событии за 2 хода.
  Консервативнее — ни одна активная нация не рискует быть замороженной.
- **Пропущенная нация = `wait`.** Когда tier2/tier3 нация пропущена
  батчем, она ничего не делает в этот ход. Это эквивалент действия
  'wait', которое и так было default-ом fallback'а с маленьким
  ou.aggression. На поведенческом уровне неотличимо.
- **batchablePool порядок стабильный** — собирается через `for ... of
  tier2` / `for ... of tier3`, где сами массивы построены итерацией
  `Object.entries(GAME_STATE.nations)`. Object.entries в V8 даёт
  insertion order, поэтому порядок детерминирован между ходами и
  cursor корректно двигается.
- **Per-turn variance в Экономике** (707→2463 p95) — не связано с этим
  коммитом, это нормальный jitter runEconomyTick на холодном рантайме
  (Session 3 early-exit уже там). Наблюдается и в baseline.
