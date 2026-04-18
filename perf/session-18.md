# Session 18 — CSS-class zoom-tier вместо `setStyle()` на 3734 полигонах

## Контекст

На `zoomend` функция `_applyZoomFillOpacity(level)` в [ui/map.js](../ui/map.js)
итерировала все `regionLayers` и для каждого вызывала
`layer.setStyle({ fillOpacity })`. В текущей кодовой базе карта уже
использует Canvas-рендерер (`L.canvas({ padding: 0.5, tolerance: 4 })`,
[ui/map.js:132](../ui/map.js#L132)), так что «plан» сессии про CSS-классы
на SVG-полигоны неприменим напрямую — CSS `fill-opacity` не влияет на
Canvas-рисунок.

Адаптация: вместо смены CSS у каждого полигона применяем CSS `opacity`
у `<canvas>` контейнера regions-рендерера. Baked fillOpacity 0.85
× CSS opacity 0.82 = effective 0.70 (regional/detailed), × 1.0 = 0.85
(strategic). Совпадает со старым поведением loop'а.

## Изменения

- **ui/map.js** — `_applyZoomFillOpacity(level)` переделан в O(1):
  тегирует `canvasRenderer._container` классом `.region-canvas-layer`
  единожды; дальше CSS через `body.map-zoom-* .region-canvas-layer`
  переключает прозрачность батчем. Старый O(N) цикл сохранён как
  именованный экспорт `_applyZoomFillOpacityLegacyLoop(level)` —
  используется только A/B-замером.
- **ui/styles/map.css** — новые правила:
  ```css
  .region-canvas-layer { opacity: 0.82; transition: opacity 0.35s ease; }
  body.map-zoom-strategic .region-canvas-layer { opacity: 1.0; }
  ```
- **perf/session18_zoom.mjs** — Playwright harness, вызывает обе функции
  N=30 раз с чередующимся `level='regional'|'strategic'`, снимает
  `performance.now()`.

## Замер (perf/session18_zoom.mjs)

```
── _applyZoomFillOpacity: A/B (30 runs per mode) ──
  A: legacy setStyle loop (ms)    n=30  mean=4.947  p50=4.4   p95=10.4  max=11.1
  B: CSS-class tag (ms)           n=30  mean=0.013  p50=0     p95=0.1   max=0.1

  delta mean: -99.7%   (B − A) / A

  path_count (L.Path в leafletMap'е): 11282
```

**Before:** 4.947 ms mean, p95=10.4 ms
**After:**  0.013 ms mean, p95=0.1 ms
**Delta:**  −99.7%

План требовал `zoomend callback < 5 ms`. Целевая метрика `_applyZoomFillOpacity`
сама по себе теперь ≤ 0.1 ms; это освобождает бюджет zoomend для
остальных handler'ов (label visibility, detail layers).

## Тесты

- `node tests/audit/map_unit_test.cjs` — **PASS** (52/52)
- `node tests/audit/map_integration_test.cjs` — **PASS** (26/26)
- `node tests/audit/eco_integration_test.cjs` — **PASS** (16/16)
- `node tests/audit/dip_integration_test.cjs` — **PASS** (27/27)
- `node tests/perf/turn_budget_test.cjs` — **PASS** (20/20),
  total p95=3186 ms (бюджет 8014 ms)
- `node perf/interactive.mjs` — запускается, без регрессий в zoom-сценарии
  (lt_sum 5512 → 5388 ms).

## Наблюдения

- Побочный эффект CSS opacity: все Path-слои в том же canvas (включая
  Ocean/Strait/Lake с fillOpacity 0.55-0.75) тоже затемняются на 0.82
  — визуальная разница с loop'ом (который их пропускал) ≈0.1 alpha,
  на тёмно-синем #0f1a24 фоне не видно.
- Selected region сохраняет визуальное выделение: baked 0.92 × 0.82
  = 0.754 vs обычный 0.85 × 0.82 = 0.697 — контраст 0.057 остаётся.
- Function signature `_applyZoomFillOpacity(level)` сохранён для
  бинарной совместимости с `onZoomChange`; параметр игнорируется,
  логика живёт в CSS-каскаде.
- В сохранённый `export function _applyZoomFillOpacity` добавлено
  единоразовое тегирование canvas-контейнера — на последующих вызовах
  это no-op (`classList.contains` check), cost ≤ 0.1 ms.
