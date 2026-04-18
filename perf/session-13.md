# Session 13 — Мемоизация `_calcSlotBaseOutput`

**Before (baseline, e7a9fd9, 2 прогона avg):**
- total p50 = 2562 ms, economy p50 = 1198 ms

**After (этот коммит, 2 прогона avg):**
- total p50 = 2483 ms, economy p50 = 1099 ms

**Delta:**
- total p50:   −79 ms  (−3.1%)
- economy p50: −99 ms  (−8.3%)
- economy mean: −98 ms (−7.0%)

**Tests:**
- `node tests/audit/eco_unit_test.cjs`         — PASS (18/18)
- `node tests/audit/eco_integration_test.cjs`  — PASS (16/16)
- `node tests/wheat_chain_test.js`             — PASS (10/10)

## Что сделано

`_calcSlotBaseOutput(slot, region, nation)` в [engine/buildings.js](../engine/buildings.js)
вызывался ~5 раз на каждый активный слот за один `runEconomyTick`:

1. `processAllRecipes` (шаг 1a)
2. `calculateAllBuildingProduction → getBuildingOutput` (шаг 1b)
3. `_getRegionalBuildingProduction → getBuildingOutput` (шаг 1c)
4. `updateBuildingFinancials → calculateBuildingRevenue → getBuildingOutput` (шаг 3a)
5. `updateBuildingFinancials → _calcSlotBaseOutput` напрямую (шаг 3a)

Все 5 обращений попадают в интервал, где входы функции заморожены:
`_pop_eff` ставится в шаге 0, `_capital_ratio` — в шаге 0.5, а `production_eff`
/ `workers` / `level` меняются только после шага 3a в
`applyBuildingAdaptiveBehavior` / `processAutonomousBuilding`. Параметры
региона (biome, fertility, deposits) и нации (`_production_mod`, slave fallback)
в пределах тика не мутируют.

## Решение

**Tick-scoped WeakMap cache** в `engine/buildings.js`:

```js
const _BASE_OUTPUT_CACHE = new WeakMap();
let _baseOutputCacheTick = 1;

export function _bumpBaseOutputCacheTick() {
  _baseOutputCacheTick = (_baseOutputCacheTick + 1) | 0;
  if (_baseOutputCacheTick === 0) _baseOutputCacheTick = 1;
}

export function _calcSlotBaseOutput(slot, region, nation) {
  // ... guard-clauses ...
  const cached = _BASE_OUTPUT_CACHE.get(slot);
  if (cached !== undefined && cached.t === _baseOutputCacheTick) return cached.o;

  // ... compute output ...

  _BASE_OUTPUT_CACHE.set(slot, { t: _baseOutputCacheTick, o: output });
  return output;
}
```

`_bumpBaseOutputCacheTick()` вызывается первой строкой `runEconomyTick()` в
[engine/economy.js](../engine/economy.js).

### Почему WeakMap, а не поле на слоте

- `saveGame` использует structured clone через `postMessage` — любые поля
  на слоте попадают в сейв. Хранение кэша на слоте раздуло бы сейв на
  ~0.5–1 МБ (9000 слотов × ~80 байт). WeakMap не сериализуется.
- WeakMap очищается GC автоматически при удалении/замене слота.
- Временные слоты из `_estimateSlotProfit` / `_estimateSlotProfitability`
  попадают в кэш, но выходят из области видимости сразу после вычисления —
  запись в WeakMap отбрасывается GC.

### Почему tick-scoped, а не signature-based

Первая попытка использовала строковую сигнатуру из 12 полей (building_id,
level, eff, pop_eff, capital_ratio, workers sum, slave flag, terrain,
fertility, deposit sum/count, satMod). Per-call overhead от
`for-in` + `+=` + 12 string-concat оказался сопоставим с экономией от
кэширования — измерение показало +3% к total p50 (нейтрально или хуже).

Tick-scoped variant заменяет сигнатуру на `int === int` сравнение: O(1),
единицы наносекунд на попадание. Корректность гарантируется анализом порядка
шагов в `runEconomyTick` (см. выше).

## Notes

- Пустой выход (`workers <= 0` или `eff <= 0`) тоже кэшируется через общий
  `_EMPTY_OUT = Object.freeze({})`, чтобы 600+ stub-слотов не аллоцировали
  новый `{}` на каждый из 5 вызовов.
- `_bumpBaseOutputCacheTick` экспортируется и регистрируется на `window`
  через стандартный `_reg(_buildings)` в [ui/boot.js](../ui/boot.js:79).
  `economy.js` вызывает через глобальный lookup (`typeof … === 'function'`).
- Переполнение 32-бит счётчика: `| 0` приводит к signed 32-bit wrap; при
  достижении 0 сразу перескакиваем на 1, чтобы `undefined !== 0 = true` не
  сбил логику «первого промаха».
