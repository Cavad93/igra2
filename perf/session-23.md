# Session 23 — Агрессивный skip stub-наций (pop<10k + ≤1 регион)

**Before (baseline на ветке без правки):**
- total mean 2195.4 / p50 **1928.6** / p95 4698.7 ms
- Экономика mean 1056.3 / p50 **800.0** / p95 3485.4 ms

**After (3 прогона с Session 23):**
- total mean ~2073 / p50 **1780–1797** / p95 ~4700 ms
- Экономика mean ~955 / p50 **650–690** / p95 ~3500 ms

**Delta (медианы 3 прогонов):**
- total p50 **−7.7 %** (1928 → 1789)
- Экономика p50 **−14.9 %** (800 → 680)

**Tests:**
- `node tests/audit/eco_integration_test.cjs` — PASS (16/16)
- `node tests/audit/eco_unit_test.cjs` — PASS (18/18)
- `node tests/perf/turn_budget_test.cjs` — PASS (20/20)

**Детерминизм игрока:** `syracuse.treasury` после 10 ходов = **21389** (как в baseline — правка не меняет поведение игрока).

## Что сделано

Расширен `_isStubNation(nation, nationId)` в [engine/economy.js](../engine/economy.js):

Добавлена агрессивная ветвь **ДО** проверки зданий:

```js
const isPlayer = nationId != null
  ? (nationId === GAME_STATE.player_nation)
  : Boolean(nation.is_player);

if (!isPlayer) {
  const pop = nation.population?.total ?? 0;
  if (pop < STUB_POP_THRESHOLD && regs.length <= 1) return true;
}
```

Константа `STUB_POP_THRESHOLD = 10000` экспортируется из модуля.

### Численно

| классификация | было (S3) | стало (S23) | delta |
|---|---:|---:|---:|
| stub-наций | 27 / 902 | **165 / 902** | +138 |
| активных | 875 | 737 | −138 |

138 новых skippable-наций — это «малые племена» с 1 регионом и
населением < 10 000. У них есть 1-2 активных building_slot, но их
субсистентное производство незначимо для мирового рынка.

### Что НЕ изменилось

- `updateTreasury` всё равно вызывается для всех наций (stubs считают налоги).
- `applyActiveLaws` — аналогично.
- `updatePopulationGrowth` и `updateHappiness` не в `runEconomyTick` — они
  идут из `turn.js` для всех наций.
- Поведение игрока: `syracuse` защищён по `nationId === GAME_STATE.player_nation`.

## Notes

- Изначально план говорил про `<5k населения`, но в реальном пресете таких
  наций всего 1. Threshold поднят до 10 000 — покрывает все «один
  регион, одно поселение» племена без вклада в мировую экономику.
- Исходное `<5k только` дало бы economy.p50 делту < 1 ms — в шуме.
- Защита игрока критична: `syracuse.population.total` в старте < 100k и
  мог бы теоретически попасть под порог при апокалиптическом голоде.
  `nationId === player_nation` — детерминистическая защита.
- Baseline.md будет обновлён при завершении всего спринта Sessions 23-26.
