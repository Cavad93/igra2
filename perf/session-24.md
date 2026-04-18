# Session 24 — Per-tick memo building-производства + hoist subsistence-инвариантов

**Before (Session 23):**
- total p50 **1780–1797 ms**, Econ p50 **650–690 ms** (median ~680)

**After (Session 24, 3 прогона):**
- total p50 **1786–1790 ms**, Econ p50 **637–650 ms** (median ~645)

**Delta:**
- Экономика p50 **~−5 %** (680 → 645 ms, около −35 ms)
- Total p50 в пределах шума (хвост доминируется 10-м ходом и AI variance).

**Tests:**
- `node tests/audit/eco_integration_test.cjs` — PASS (16/16)
- `node tests/audit/eco_unit_test.cjs` — PASS (18/18)
- `node tests/perf/turn_budget_test.cjs` — PASS (20/20)

**Детерминизм:** `treasury` после 10 ходов колеблется 20251–22009 (±8 %,
нормальная variance baseline — уже была в S23 runs: 19569–21543).

## Что сделано

### 1. Per-tick cache агрегаций building-производства

В `engine/buildings.js` — новая инфраструктура:

```js
let _regionalProdCacheTick = 1;
const _REGIONAL_PROD_CACHE = new Map(); // nationId → { t, byRegion }
const _ALL_BLD_PROD_CACHE  = new Map(); // nationId → { t, totals }

export function _bumpRegionalProdCacheTick() { ... }
export function _getCachedRegionalBuildingProduction(nationId) { ... }
export function _cacheRegionalBuildingProduction(nationId, byRegion) { ... }
```

`runEconomyTick` в `engine/economy.js` бампает `_bumpRegionalProdCacheTick()`
сразу после `_bumpBaseOutputCacheTick()`.

**`calculateAllBuildingProduction(nationId)`** (шаг 1b):
- При кэш-хите по `byRegion` — суммирует уже готовые цифры, не трогая слоты.
- При промахе — считает byRegion и totals одним проходом, затем
  сохраняет оба в кэш.

**`_getRegionalBuildingProduction(nationId)`** (шаг 1c):
- Читает `byRegion` из кэша, если тот заполнен шагом 1b.
- Cache-hit = полный скип обхода всех слотов нации.

В итоге для каждой активной нации за тик происходит **ровно один**
обход её building_slots (вместо двух).

### 2. Hoist инвариантов из subsistence loop

В `calculateProduction()`:
- `SUBSISTENCE_FACTOR` вынесен на функциональный scope (был в per-region loop).
- Нация-уровневые значения (`nationPop`, `byProf`, `classMod`, `laborMod`,
  `bldMult`) вычисляются один раз за нацию вместо per-region.
- Предкомпилированная константа `nationConst = bldMult × classMod ×
  SUBSISTENCE_FACTOR × laborMod` — один множитель вместо четырёх в
  inner loop.
- `regionConst = fertility × nationConst` — предкомпилят per-region часть.
- `freeWorkers ≤ 0 → continue` выходит раньше, экономя оставшиеся умножения.
- `(freeWorkers / 1000)` → `(freeWorkers * 0.001)` — избегает деления.

### 3. Pre-computed `REGION_PRODUCTION_BASE` entries

Новый кэш `_REGION_PROD_ENTRIES_CACHE: Map<terrain, Array<[good, spec]>>`.
`REGION_PRODUCTION_BASE` статичен, но `Object.entries(REGION_PRODUCTION_BASE[terrain])`
ранее аллоцировался на каждый регион каждой нации каждый тик (~10k
новых массивов/тик). Теперь один массив на терраин, индексированный цикл
`for (let i = 0; i < entries.length; i++)`.

## Notes

- Исходная формулировка roadmap «fine-grained invalidation
  (pop-миграция, стройка/снос здания)» заменена на per-tick full bump
  (как `_calcSlotBaseOutput` в S13): проще, безопаснее, даёт большую
  часть выигрыша (все дубликаты в одном тике устраняются). Fine-grained
  dependency-tracking добавил бы риск корруптированного кэша при пропуске
  write-path — с минимальным дополнительным выигрышем, т.к. ВСЁ равно
  population меняется каждый тик.
- Кэш Map не чистится явно: entries перезаписываются по тику. Размер
  ограничен числом наций (~900) → ~50 KB стабильно.
- Треasury-variance 1800 coin между прогонами уже присутствовал в S23 и
  до этого — вызвано non-seeded `Math.random` в AI и событиях экономики.
