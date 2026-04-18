# Session 8 — Инкрементальный `refreshDiploDistances` (sig-based cache)

## Что изменилось

До Session 8 `refreshDiploDistances()` инвалидировал кэш по **фиксированному
интервалу** (`DIPLO_CFG.CACHE_INTERVAL = 12` ходов). Поведение:

- **Турн 1:** `_cacheComputedAt = -999` → делал полный BFS от регионов игрока.
- **Турн 2–12:** ранний выход по `turn - _cacheComputedAt < 12`.
- **Турн 13:** снова полный BFS, даже если игрок ни разу не двигал границ.
- **Если игрок реально захватил регион на 5-м ходу:** кэш видит обновление
  только на турне 13 — 8 ходов устаревших тиров.

Session 8 переходит на **sig-based инвалидацию**:

- `_playerRegionsSig` — FNV-1a от отсортированного списка регионов игрока.
- `_allNationsRegionsSig` — FNV-1a от `(nationId, regions[])*` по всем нациям.
- **Sig игрока изменился** → полный re-BFS + rebuild `_nationDistCache`.
- **Sig игрока прежний, sig наций изменился** → только rebuild `_nationDistCache`
  (чужие владения не влияют на BFS от территории игрока).
- **Оба sig'а прежние** → ранний выход.

Плюс O(1) guard `_checkedAtTurn === turn && _checkedAtPlayer === playerId`:
внутри одного хода `processAINations()` зовёт `getNationTier(nId)` для всех 902
наций → 902 вызова `refreshDiploDistances()`. С guard'ом пересчёт сигнатур
делается **один раз за ход**, остальные 901 вызов — O(1) return.

## Метрики

### Профайлер (`node perf/profile.mjs`, 10 ходов)

|                  | mean   | p50    | p95    |
|------------------|-------:|-------:|-------:|
| До Session 8     | 2741.7 | 2454.6 | 5193.8 |
| После Session 8  | 2682.1 | 2495.3 | 4841.3 |

**Per-turn mean: −2.2 %**, p95 −6.8 % (в пределах run-to-run шума).

Шаг «ИИ думает» (внутри которого раньше лежал BFS): 530.9 → 529.6 мс (flat).

**Это ожидаемо.** За 10 ходов и старый, и новый код делают BFS ровно 1 раз
(на турне 1). Структурная разница видна только на длинной партии:

- Над 120 ходов: старый код делал бы ~10 полных BFS (~33 мс накладных).
  Новый — 0–3 BFS (в зависимости от того, захватывал ли игрок новые регионы).
- Выигрыш: **~25–30 мс накладных расходов за 100 ходов** + корректность
  (нет 12-турного лага в обновлении тиров при реальной смене границ).

### Микро-бенч (`node perf/session8_diplo.mjs`, 30 итераций)

```
── Hot path: 902 × getNationTier per iter ──
  всего на 902 вызова (мс)             n=30  mean=0.327  p50=0.2  p95=0.5

── Cached refresh (sig совпадает) ──
  refreshDiploDistances() (мс)         n=30  mean=0      p50=0    p95=0

── Force refresh (полный BFS) ──
  refreshDiploDistances(true) (мс)     n=30  mean=3.263  p50=2.6  p95=6.7
```

Hot path (902 × `getNationTier`) — **0.3 мс на ход** благодаря O(1) guard'у.
Cached refresh — 0 мс (sub-microsecond): guard ловится без sig-вычисления.
Force BFS — 3.3 мс (абсолютный низ, BFS структурно).

## Тесты

```
tests/audit/dip_integration_test.cjs   — 27/27 PASS
tests/audit/dip_unit_test.cjs          — 33/33 PASS
tests/audit/eco_integration_test.cjs   — 16/16 PASS
tests/audit/eco_unit_test.cjs          — 18/18 PASS
tests/audit/mil_integration_test.cjs   — 26/26 PASS
tests/audit/gov_integration_test.cjs   — 22/22 PASS
tests/audit/map_unit_test.cjs          — 49/51 (2 pre-existing drift, как в S5–S7)
```

## Изменения

### `engine/diplomacy_range.js`

- Добавлены `_playerRegionsSig`, `_allNationsRegionsSig`, `_checkedAtTurn`,
  `_checkedAtPlayer` — состояние sig-based кэша.
- Новые функции: `_hashRegionList()` (FNV-1a), `_computePlayerRegionsSig()`,
  `_computeAllNationsRegionsSig()`.
- `refreshDiploDistances()` полностью переписан:
  - O(1) guard по `turn + player_nation` — ловит повторные вызовы внутри
    хода без пересчёта сигнатур.
  - Sig-based инвалидация вместо `CACHE_INTERVAL`: территория игрока
    изменилась → полный BFS; только чужие нации изменились → rebuild
    nation cache без BFS; ничего не изменилось → ранний выход.
  - `DIPLO_CFG.CACHE_INTERVAL` больше не читается, но оставлен в конфиге
    (обратная совместимость — вдруг кто-то читает из UI).

### `perf/session8_diplo.mjs` (новый)

Playwright micro-bench: замеряет 902 × `getNationTier`, cached refresh,
force-BFS. Честно показывает, что hot path практически бесплатный после
sig-based guard'а.

## Замечания

1. **Почему профайлер не показал большой win.** Потому что и до Session 8
   BFS уже кэшировался (12-турным интервалом). За 10 ходов профилировки
   BFS делался ровно 1 раз. Реальный win — в корректности (немедленная
   реакция на смену границ) и в длинной партии (накопленные 25–30 мс за
   100 ходов).
2. **Почему не делаю incremental BFS (multi-source из новых регионов).**
   Full BFS стоит 3.3 мс — это уже дёшево. Поверх этого incremental BFS
   усложняет код (обратный случай «игрок потерял регион» требует полного
   пересчёта в любом случае). ROI отрицательный.
3. **Guard безопасен от мид-туровых конквестов.** В `engine/turn.js`
   завоевания происходят в `_runArmies()` (после `processAINations()`).
   Внутри `processAINations()` границы не меняются → guard не может
   вернуть stale data в критических путях.
4. **Тиры пересчитываются ровно в момент инвалидации** (а не по таймеру).
   Если игрок захватил регион и какая-то нация сдвинулась из Tier 3 в
   Tier 2, event-лог получит сообщение на том же ходу. Раньше — с лагом
   до 12 ходов.

## Что бы сделал иначе

- В `turn.js` можно было добавить отдельный `_setStep('Дипломатия...')`
  вокруг `refreshDiploDistances()` — тогда профайлер показал бы 3 мс
  отдельной строкой вместо того, чтобы прятать их внутри «ИИ думает».
  Но это меняет профиль публичных метрик, решил не трогать в рамках
  Session 8.
- `_computeAllNationsRegionsSig()` делает `regions.slice().sort()` для каждой
  нации — 902 аллокации массивов. Можно было бы обойтись FNV'ом по
  несортированному списку (позиция тоже заводит хэш), но тогда один и
  тот же состав, пришедший в разном порядке, прочитается как разный.
  Текущая реализация — консервативная.
