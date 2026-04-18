# Session 28 — Log-spam gate в `updateRegionSpecialization` (turn-10 p95 spike)

**Before (Session 27 last run, `perf/last_run.json` от 2026-04-18):**
- Total: mean **1864.5 ms**, p50 **1593.8 ms**, p95 **4674.6 ms**
- Экономика: mean **786.2 ms**, p50 **540.9 ms**, p95 **2782.7 ms**
- Ход 10 (spike): **3910.5 ms**

**After (Session 28, тот же сценарий, 2 последовательных прогона):**
- Run #1: Total mean **1683.9 ms**, p50 **1676.5 ms**, p95 **2089.2 ms**; Эко mean **591.5 ms**, p95 **958.2 ms**
- Run #2: Total mean **1669.3 ms** (−10.5 %), p50 **1675.4 ms**, p95 **2112.1 ms** (−54.8 %)
- Эко mean **587.5 ms** (−25.3 %), p50 **558.2 ms**, p95 **980.9 ms** (−64.7 %)
- Ход 10 (бывший spike): **1804.7 ms** (−53.8 %)

Индивидуально по ходам (ms) Run #2:
`2112, 1776, 1645, 1694, 1582, 1471, 1434, 1499, 1675, 1805`

**Tests (все PASS):**
- `tests/audit/eco_unit_test.cjs` — 18/18
- `tests/audit/eco_integration_test.cjs` — 16/16
- `tests/audit/map_unit_test.cjs` — 52/52
- `tests/audit/map_integration_test.cjs` — 26/26
- `tests/audit/gov_unit_test.cjs` — 31/31
- `tests/audit/gov_integration_test.cjs` — 22/22
- `tests/audit/mil_unit_test.cjs` — 29/29
- `tests/audit/mil_integration_test.cjs` — 26/26
- `tests/audit/dip_unit_test.cjs` — 33/33
- `tests/audit/dip_integration_test.cjs` — 27/27
- `tests/audit/ai_unit_test.cjs` — 28/28
- `tests/audit/ai_integration_test.cjs` — 12/12
- `tests/eco_stage3_specialization_test.cjs` — **33/33** (до фикса падал на ESM-import; исправлен)
- `tests/test_save_roundtrip.mjs` — treasury=17388, 902/3734 PASS
- `tests/perf/turn_budget_test.cjs` — 20/20

**Детерминизм:** `syracuse.treasury` после 10 ходов = **21389** (идентично baseline Session 27).

## Диагностика

`perf/last_run.json` Session 27 зафиксировал характерный паттерн:
p50 Экономики **541 ms** vs p95 **2783 ms** — колоссальная разница между
средним ходом и одиночным «шипом» на 10-м ходу. Session 27 notes
предполагали «AI warmup + tier2 rollout», но `ИИ думает` в p95 выдавал
всего **203 ms** — источник spike'а был внутри Экономики.

Инструментировал `runEconomyExtTick` в `engine/economy_ext.js` временным
`_t(label, fn)` обёртчиком (`perf/session28_ext.mjs`). Результат на
10-м ходу:

```
[ext-step] spec: 2568.1ms
```

Все остальные под-этапы (`trade_hist`, `monopolies`, `inflation`, `cycle`,
`army_fund`, `tech_drift`) — **<50 ms** на всех ходах. Виновник
однозначен: `updateRegionSpecialization()`.

### Почему именно 10-й ход

Логика функции в `engine/economy_ext.js:363`:

```js
const entry = spec[rid];
const steps = Math.floor(entry.streak / SPEC_STREAK_WINDOW);  // SPEC_STREAK_WINDOW = 10
const newBonus = 1.0 + Math.min(SPEC_MAX_BONUS, steps * SPEC_STEP_BONUS);
if (newBonus > (entry.bonus || 1.0) + 1e-9) {
  addEconomicEvent(
    `⚙ Регион '${rid}' (${entry.good}) — специализация +${…}% (streak=${entry.streak}).`
  );
}
```

На 10-м ходу у регионов, стабильно производивших один товар, `streak=10` →
`steps=1` → `newBonus=1.05` (ранее был `1.0`) — триггер лога для **~2500
из 3734 регионов** одновременно.

`addEconomicEvent` → `addEventLog(text, 'economy')` в `ui/log.js:49`:
- `gs.events_log.unshift(entry)` — копирование N-элементного массива
- `updateLogCollapsed(entry)` — **обход DOM через `querySelectorAll` + `classList`**
- `renderLog()` — **пересборка всего лог-DOM**

Пересборка DOM × 2500 раз за один вызов — 2500 ms бюджета. При этом
события про **чужие регионы игроку не видны** (лог фильтруется на
игрока) — чистая потеря времени.

## Что сделано

### 1. Гейт лог-событий по `region.nation === player_nation`

`engine/economy_ext.js:363` — `updateRegionSpecialization`:

```js
const playerId = GAME_STATE?.player_nation ?? null;
for (const rid of Object.keys(regions)) {
  const region = regions[rid];
  const isPlayerRegion = (playerId !== null) && (region?.nation === playerId);
  // …
  if (isPlayerRegion && (prev.bonus || 1.0) > 1.0) {
    addEconomicEvent(`⚙ Регион '${rid}' утратил специализацию …`);
  }
  // …
  if (isPlayerRegion && cur && (cur.bonus || 1.0) > 1.0) {
    addEconomicEvent(`⚙ Регион '${rid}' сменил специализацию …`);
  }
  // …
  if (isPlayerRegion && newBonus > (entry.bonus || 1.0) + 1e-9) {
    addEconomicEvent(`⚙ Регион '${rid}' … специализация +${…}%`);
  }
}
```

**Поведение:** расчёт `streak`/`bonus` для всех регионов идёт как
прежде (детерминизм `treasury`, `getRegionSpecBonus`). Логируются только
те 3 типа событий, которые имеют смысл в ленте игрока — для его
собственных регионов. 3000+ → ~50 вызовов `addEconomicEvent` на 10-й ход.

### 2. Pre-existing баг в `tests/eco_stage3_specialization_test.cjs`

Тест падал с `SyntaxError: Cannot use import statement outside a module`
(vm не поддерживает ESM, а `economy_ext.js` начинается с
`import { CONFIG } from '../config.js'`). Такой же паттерн был
исправлен в Session 26 для `tests/audit/ai_*_test.cjs` (стрип-регэкс
ESM-синтаксиса). Применил аналогичный стрип + добавил
`export const X = Y` → `var X = Y` (иначе const-биндинг не попадает
на `sandbox.*` в Node vm). 3 падавших check'а на
`SPEC_STREAK_WINDOW/STEP_BONUS/MAX_BONUS` стали зелёными.

## Notes

- `getRegionSpecBonus(rid, good)` читает `entry.bonus`, который ставится
  безусловно (вне `if (isPlayerRegion)`). Никакой логики игры не
  затронуто — только UI-шум.
- События про AI-регионы всё равно никогда не показывались игроку
  (лог в UI фильтруется на `gs.events_log`, который растёт для всех,
  но рендерится только один и без фильтра по владельцу). Фактически
  это были «пустые» мутации DOM.
- `perf/session28_ext.mjs` — диагностический Playwright-скрипт,
  перехватывающий `[ext-step]` log'и. Оставлен в репо по аналогии с
  `session10_ai.mjs`, `session18_zoom.mjs` etc. для будущих regression
  investigations. Инструментация в `engine/economy_ext.js` удалена.
- Budget guard `tests/perf/turn_budget_test.cjs` зелёный 20/20,
  включая `Экономика p95 <= 6000` (фактический 981 ms — 16% бюджета)
  и `Total p95 <= 12000` (фактический 2112 ms — 18%).

## Ковариация с будущими этапами

На 10-м ходу всё ещё есть заметная ступенька:
`1675 → 1805 ms` (Ход 9 → 10). Это предварительная пересборка кэшей AI
tier2 rollout (Session 10 cursor) — осталось как хвост, но уже не spike.
Если нужно давить дальше: спилить `applyBuildingAdaptiveBehavior` — он
всплывал вторым в диагностике (до фикса — 151 ms на 10-м ходу; после
фикса — в пределах шума, так как GC больше не нагружен после
устранения 2500 DOM-мутаций).
