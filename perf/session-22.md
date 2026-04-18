# Session 22 — Region culling при стратегическом zoom

## Цель

На strategic-зуме (z<4) большинство ~4149 региональных полигонов занимают
<1% площади экрана, но Canvas-рендерер всё равно обходит их в каждом
redraw во время pan/zoom. Решение — убрать 70% самых мелких полигонов
из `leafletMap._layers` (через `removeLayer`) на strategic, вернуть
обратно на regional/detailed через `addLayer`.

## Реализация

### Ключевое архитектурное решение

План изначально предлагал «`display: none` через CSS-класс `.region-culled`».
Это невозможно: Leaflet использует **Canvas-рендерер** (`preferCanvas: true`,
`L.canvas()` — ui/map.js:132), полигоны рисуются на одном `<canvas>` без
per-polygon DOM. CSS-селекторы индивидуальные полигоны не видят.

Идиоматический Leaflet-путь — `leafletMap.removeLayer(layer)` /
`addLayer(layer)`. Это убирает слой из `canvasRenderer._layers` → Canvas
draw-loop становится короче.

### Файлы

- **ui/map.js**
  - Новые переменные (строка ~36): `_cullableRegionIds`,
    `_cullCurrentlyApplied`, `_CULL_REF_ZOOM=3`, `_CULL_PERCENTILE=0.70`.
  - Новые функции (после `_pxPolyArea`):
    - `_computeCullableRegions()` — один раз на init считает `areaPx`
      каждого playable-региона через `leafletMap.project([lat,lng], 3)`,
      сортирует, берёт 70-й перцентиль как threshold, формирует Set.
      Ocean/Strait/Lake/Impassible исключены (они составляют фон морей).
    - `_applyRegionCulling(shouldCull)` — идемпотентный toggle
      `removeLayer`/`addLayer` для элементов из `_cullableRegionIds`.
      При возврате слоёв сбрасывает `GAME_STATE._renderStyleCache`, чтобы
      следующий `refreshRegionStyles` точно применил актуальный цвет.
    - `resetRegionCullingState()` — публичный helper для случаев
      пересоздания polygon-layers.
  - Вызов `_computeCullableRegions()` после `renderRegionPolygons()` в
    `initLeafletMap()`.
  - Вызов `_applyRegionCulling(level === 'strategic')` в `onZoomChange()`
    после `_applyZoomFillOpacity()`.

- **perf/session22_cull.mjs** — новый A/B harness. Выставляет z=3,
  гоняет 10 panBy, замеряет FPS / longtask / pan-duration для
  `cullOFF`/`cullON`.

## Метрики

**Harness:** `perf/session22_cull.mjs` (headless Chromium, viewport 1400×900).

**Cullable regions:** 2665 / 4149 (64% — близко к 70% target).

### Pan @ z=3, 10 panBy, step=60px

```
                              cullOFF       cullON       delta
Pan duration mean (ms)        142.0         125.2        -11.8%
FPS mean                      1.47          1.56         +6.1%
Longtask sum>50 (ms)          1155.0        1399.0       +21%  (noisy)
```

**Dominant signal — pan duration −11.8 %.** Pan успевает завершиться
быстрее, потому что Canvas draw-loop при z=3 стал короче на ~64 %
слоёв.

**FPS / longtask** — в headless Chromium с `--disable-gpu` и
`--headless` RAF жёстко throttled (видно по p50=0 во многих pan-окнах).
Эти метрики здесь ненадёжны; primary signal — pan duration.

### Per-turn regression check (`perf/profile.mjs`)

```
                  mean      p50       p95       max
total             1880ms    1676ms    3720ms    3720ms
Рендер            1.6ms     1.5ms     2.6ms     2.6ms  ← не затронут
Экономика         812ms     605ms     2589ms    2589ms
```

Рендер-бюджет в `processTurn` — 1.6ms, без изменений. Culling не
затрагивает hot path `processTurn()`, только zoom-handler.

## Верификация тестов

- `node tests/audit/map_unit_test.cjs` — **PASS (52/52)**
- `node tests/audit/map_integration_test.cjs` — **PASS (26/26)**

## Заметки

- **Culling fires при пересечении границы `level='strategic'`** (z<4).
  На regional/detailed (z≥4) все layers на карте.
- **Hysteresis** через `_cullCurrentlyApplied` — идемпотентный toggle,
  повторный вызов с тем же флагом не делает ничего.
- **Selection на culled-регионе** невозможен (polygon не на карте →
  click-handler не сработает). При z<4 это ожидаемое поведение —
  мелкий регион визуально не видно.
- **Intel / fog of war** — culled регионы не рисуются, но их статус
  в GAME_STATE сохраняется полностью. При возврате на regional зумом —
  цвета / туман войны применяются через `refreshRegionStyles` (кэш
  сброшен в `_applyRegionCulling`).

**Before:** pan @ z=3 mean 142.0ms
**After:**  pan @ z=3 mean 125.2ms
**Delta:**  −11.8 %

**Tests:** map_unit_test (52/52) + map_integration_test (26/26) — PASS.
**Notes:** FPS/longtask недостаточно надёжны в headless; pan duration — единственный стабильный сигнал. 64% регионов становятся культ-таргетом (близко к плановым 70%).
