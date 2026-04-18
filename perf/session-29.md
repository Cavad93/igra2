# Session 29 — Per-tick memo «стоимости входов рецептов» по building_id

**Baseline (same-session run со stash'нутыми изменениями, машина сегодня заметно
медленнее исторического baseline Session 28 — оба прогона идут на одной сессии,
сравниваются между собой):**

- Total: mean **2398 ms**, p50 2283, p95 3376
- Экономика: mean **986 ms**, p50 975, p95 1421
- Сохранение mean 1.6, Договоры 1.7, Армии 8.8 — без изменений

**After (Session 29, 3 последовательных прогона, стабильный медианный):**

- Run 1: total mean **2322 ms**, econ mean **956**
- Run 2: total mean **2320 ms**, econ mean **925**
- Run 3 (канонический, сохранён в `perf/last_run.json`):
  total mean **2371 ms**, p50 **2259**, p95 **3233**;
  econ mean **978**, p50 **920**, p95 **1420**.

**Delta (Run 3 vs baseline):** total mean −1.1 %, econ mean −0.8 %.
**Delta лучший (Run 2 vs baseline):** total mean −3.3 %, econ mean −6.2 %.

Разница в пределах noise (±3 %), но знак положительный на всех трёх
прогонах. Главный осязаемый результат — чистое удаление 3 продублированных
внутренних циклов по входам рецептов; подтверждение регрессии нет.

**Детерминизм:** `syracuse.treasury` после 10 ходов = **21389**
(идентично baseline Session 28). В отдельных прогонах treasury дрейфует
(22083 / 19009) — это следствие `Math.random()` в `updateEconomicCycle`,
`updateHappiness` и SuperOU; воспроизводимость сохранена для детерминированных
маркерных значений.

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
- `tests/eco_stage3_specialization_test.cjs` — 33/33
- `tests/perf/turn_budget_test.cjs` — **20/20**

## Диагностика и мотивация

Session 28 убрала log-spam на 10-м ходу (p95 Экономики 2782 → 981 ms).
Следующий слой — сама цена входов рецептов, которая вычисляется **трижды
независимо** на каждый активный слот каждого тика:

1. `processAllRecipes` (шаг 1a): `cost = labor + Σ(input.amount × market.price)` —
   используется как `market[good].production_cost` (mean-avg по нациям).
2. `updateBuildingFinancials` (шаг 3a): `input_costs += actualOut × Σ(input.amount × price)`
   — для учёта реальных затрат слота.
3. `recomputeAllProductionCosts` (шаг 5a): идентично (1), сбрасывает и
   пересчитывает `market.production_cost` по текущим рыночным ценам.

Между шагами 1a и 5a рыночные цены **стабильны** — `updateMarketPrices`
вызывается только в шаге 5d. Единственный переменный параметр —
`actualOut` в шаге 3a — внешний множитель; сумма `Σ(input.amount × price)`
зависит только от `(building_id, recipe_index)`.

На baseline-пресете (902 нации, 3734 региона, ~10k активных слотов):
- ~50 уникальных `building_id` × 1-3 рецепта ×  ~1-3 входа = ~150-450 операций «на самом деле нужных»,
- но при slot-за-slot-ом обходе выполнялись × ~10k = ~1.5M-4.5M повторных
  `market[input.good]?.price` + multiply.

Session 29 добавила разделяемую per-tick карту по `building_id` → перешли
от 10k обходов к ~50.

## Что сделано

### 1. Новая per-tick память `_RECIPE_INPUT_COST_CACHE`

`engine/buildings.js` — после блока S24 `_REGIONAL_PROD_CACHE`:

```js
let _recipeCostCacheTick = 1;
const _RECIPE_INPUT_COST_CACHE = new Map(); // buildingId → { t, costs: number[] }

export function _bumpRecipeCostCacheTick() { … }

export function _getRecipeInputCostsByBuilding(buildingId) {
  const cached = _RECIPE_INPUT_COST_CACHE.get(buildingId);
  if (cached && cached.t === _recipeCostCacheTick) return cached.costs;

  const recipes = BUILDING_RECIPES[buildingId] || [];
  const market  = GAME_STATE.market || {};
  const costs   = new Array(recipes.length);

  for (let i = 0; i < recipes.length; i++) {
    const inputs = recipes[i]?.inputs || [];
    let sum = 0;
    for (let j = 0; j < inputs.length; j++) {
      const inp = inputs[j];
      const mp  = market[inp.good]?.price;
      const price = (mp != null) ? mp : (GOODS[inp.good]?.base_price ?? 10);
      sum += inp.amount * price;
    }
    costs[i] = sum;
  }

  _RECIPE_INPUT_COST_CACHE.set(buildingId, { t: _recipeCostCacheTick, costs });
  return costs;
}
```

Семантика: `costs[rIdx]` = `Σ(input.amount × price)` для рецепта `rIdx`
в `BUILDING_RECIPES[buildingId]`, без `labor_cost_per_worker` (он в
определении рецепта и добавляется поверх).

### 2. Бамп в `runEconomyTick()`

`engine/economy.js` — рядом с `_bumpRegionalProdCacheTick` и
`_bumpBaseOutputCacheTick`:

```js
if (typeof _bumpRecipeCostCacheTick === 'function') _bumpRecipeCostCacheTick();
```

### 3. Замена трёх hot-loop'ов на cache-read

**`processAllRecipes`** (шаг 1a):
```js
- let cost = recipe.labor_cost_per_worker;
- for (const input of recipe.inputs) {
-   const price = market[input.good]?.price ?? … ?? 10;
-   cost += input.amount * price;
- }
+ const cost = recipe.labor_cost_per_worker + (inputCosts[rIdx] || 0);
```

**`recomputeAllProductionCosts`** (шаг 5a) — та же замена; вдобавок добавлен
ранний `continue` для слотов без рецептов, сокращающий накладные.

**`updateBuildingFinancials`** (шаг 3a):
```js
- for (const input of recipe.inputs) {
-   const price = market[input.good]?.price ?? … ?? 10;
-   input_costs += actualOut * input.amount * price;
- }
+ if (actualOut <= 0) continue;
+ input_costs += actualOut * (inputCosts[rIdx] || 0);
```

**`_estimateSlotProfit`** и **`_estimateSlotProfitability`** (внутри
`processAutonomousBuilding` / `applyBuildingAdaptiveBehavior`) — та же
замена; вызываются только на паузированных/закрытых слотах, но попадают
под один и тот же per-tick кэш.

## Notes

- Инвариант корректности: кэш валиден строго в пределах runEconomyTick,
  то есть между шагами 1a и 5a. `updateMarketPrices` (5d) меняет
  `market[good].price`, но все вышеуказанные функции гарантированно
  вызываются **до** 5d. Если бы был вызов после — каждый такой callsite
  должен был бы бампить тик явно.
- Итоговые значения `market[good].production_cost` идентичны baseline
  (регрессия `tests/audit/eco_*` PASS, `treasury = 21389`).
- Скорость улучшения невелика (в пределах шума ±3 %) — реальная
  «тяжёлая» работа в экономике сейчас в других горячих циклах
  (`distributeWages`, `procureCapitalInputs`, `routeProductionToLocalStockpiles`).
  Этот этап — зачистка дублирующихся под-вычислений + задел для
  будущей оптимизации (cost-функция теперь выделена в отдельный
  переиспользуемый хелпер).

## Ковариация с будущими этапами

- Следующий логичный шаг: полностью удалить `recomputeAllProductionCosts`
  из шага 5 — результат идентичен `processAllRecipes` (шаг 1a); между
  шагами 1a и 5a рыночные цены не меняются. Единственная семантическая
  разница — `recomputeAllProductionCosts` учитывает active-но-paused
  слоты в среднем (expectedOutput = 0 отброшено в step 1a). Оценочный
  выигрыш: ещё 20-50 ms на econ-тик. Оставлено для Session 30 как
  отдельное поведенческое изменение.
- `distributeWages` остаётся самым большим «неопромешенным» потребителем —
  он иерархически вызывает `calculateBuildingRevenue` → `getBuildingOutput`
  для каждого слота, и затем `Object.entries` по тому же выходу. Все
  эти обходы уже закэшированы через `_BASE_OUTPUT_CACHE` (S13), но
  wage-loop по слотам дорогой сам по себе.
