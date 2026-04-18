# Session 27 — Memoize region-invariants в `calcRegionLandCapacity`

**Before (Session 26 last run, `perf/last_run.json` от 2026-04-18):**
- Total: mean **2090.7 ms**, p50 **1812.8 ms**, p95 **4674.6 ms**
- Экономика: mean **953.0 ms**, p50 **655.5 ms**, p95 **3493.9 ms**

**After (Session 27, тот же сценарий):**
- Total: mean **1864.5 ms** (−10.8 %), p50 **1593.8 ms** (−12.1 %), p95 **3910.5 ms** (−16.3 %)
- Экономика: mean **786.2 ms** (−17.5 %), p50 **540.9 ms** (−17.4 %), p95 **2782.7 ms** (−20.4 %)

Индивидуально по ходам (ms):
`2087, 1805, 1651, 1594, 1573, 1497, 1461, 1490, 1576, 3911`

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
- `tests/test_save_roundtrip.mjs` — treasury=17388, 902/3734 PASS
- `tests/perf/turn_budget_test.cjs` — 20/20

**Детерминизм:** `syracuse.treasury` после 10 ходов = **21389** (идентично baseline).

## Что сделано

### Проблема

`calcRegionLandCapacity` вызывается в `engine/turn.js:267` в цикле по всем
`GAME_STATE.regions` — 3734 региона каждый ход. Внутри:

1. Два `?? REGION_BIOMES[numId]` / `REGION_AREAS[numId]` лукапа.
2. Три `Math.round(total * params.X_pct)` для `unsuitable_ha`, `reserve_ha` —
   результат **полностью детерминирован** по (biome, area_ha).
3. `Math.floor(total * 0.70)` для `max_buildings_ha` — то же.
4. `(slots ?? []).filter().reduce()` — две аллокации массива каждый тик.
5. `Object.fromEntries(['wheat_family_farm', …].map(id => [id, …getBuildingFootprint(id)…]))`
   — 7 лукапов в BUILDINGS + temp-массив + Object.fromEntries каждую итерацию.

В сумме: **~3734 × 10 = 37340** повторных вычислений одних и тех же констант
за 10 ходов. biome и area_ha — статические поля (grep `region.biome =` даёт
только init/save-load). Никакого runtime-mutation нет.

### Решение

**Кэш `region._landConst`** — pure-константная структура от биома + площади:

```js
function _ensureLandConst(region, regionId) {
  const cached = region._landConst;
  if (cached && cached._biome === region.biome && cached._area === region.area_ha) {
    return cached;  // hot path: один объектный лукап + два ===
  }
  // cold path: биомные/областные лукапы, Math.round, запись кэша
}
```

Поля кэша: `total_ha`, `unsuitable_ha`, `reserve_ha`, `max_arable_ha`,
`max_buildings_ha`, `buildable_ha`, `per_person_ha`, `biome`. Все —
функции исключительно (биома, площади). Ключ валидности — пара (`_biome`,
`_area`).

В `calcRegionLandCapacity` остались только динамические:
- `settlement_ha` от `pop × per_person_ha` (кэш отдаёт per_person_ha).
- `buildings_ha` — однопроходный `for (let i…)` без filter/reduce
  аллокаций.
- `free_ha`, `exploitation`, `pop_density`, warnings — O(1) над кэшем.
- `can_build` — заранее посчитанные footprint'ы (лениво при первом вызове),
  плоский `for` по 7 id.

### Предвычисленные footprint'ы

```js
const CAN_BUILD_IDS = Object.freeze([
  'wheat_family_farm', 'wheat_villa', 'wheat_latifundium',
  'farm', 'latifundium', 'mine', 'granary',
]);
let _canBuildFootprints = null;
function _getCanBuildFootprints() {
  if (_canBuildFootprints) return _canBuildFootprints;
  const map = {};
  for (let i = 0; i < CAN_BUILD_IDS.length; i++) {
    const id = CAN_BUILD_IDS[i];
    map[id] = getBuildingFootprint(id) || 0;
  }
  _canBuildFootprints = map;
  return map;
}
```

Заменяет `getBuildingFootprint(id)` в горячем цикле на plain lookup
`fp[id]` — 7 × 3734 × 10 = 261 380 лукапов по `BUILDINGS[id].footprint_ha`
заменены на 7 лукапов (один раз за процесс).

## Almanah (details)

| место             | до              | после                         |
|-------------------|-----------------|-------------------------------|
| biome-lookup      | каждый вызов    | 1× при `_landConst` miss      |
| `Math.round` × 3  | каждый вызов    | 1× при `_landConst` miss      |
| filter().reduce() | 2 аллокации/вызов | 0 аллокаций (for-loop)       |
| Object.fromEntries | 1 alloc+map/вызов | 0 alloc (prealloc for-loop) |
| `getBuildingFootprint` | 7×/вызов    | 0 (лукап в кэше fp[id])       |

Проверено: `region.biome` / `region.area_ha` не мутируются в рантайме
(`grep 'region.biome =' → только engine/init.js:50, engine/save.js:178`,
оба при `!r.biome`). Соответственно `_landConst` никогда не протухает
по ходу игры; кэш пересобирается только если save-load приносит другое
значение (миграция старого сейва).

## Notes

- `processTurn()` вызывает `calcRegionLandCapacity` **между шагами
  Население и неизмеренной зоной** (line 264-270 в engine/turn.js). Поэтому
  выигрыш не попадает ни в один step-таймер — но суммарный per-turn total
  упал на 226 ms mean (2090 → 1864) и 764 ms на 10-м ходе (4674 → 3910).
- Econ p95 тоже упала на 711 ms (3494 → 2783). Это побочный эффект
  того, что `_ensureNationDefaults` и прочие цикл-over-regions работают
  в том же GC-bucket — меньше временных объектов, меньше пауз GC.
- Budget guard не подвинут — S14 бюджеты рассчитаны с запасом ×1.2, и
  новые метрики легко вписываются.
- За четыре сессии (23/24/26/27) Econ p50 снизился с baseline S15 **742 → 541 ms**
  (−27 %), а full turn p50 с **1813 → 1594 ms** (−12 %). Оставшийся
  bottleneck — хвост 10-го хода (AI warmup + tier2 rollout), который нужно
  адресовать отдельной сессией.
