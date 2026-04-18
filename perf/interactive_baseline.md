# perf/interactive_baseline.md — база interactive-latency

Фиксируется перед Session 17 как точка сравнения для Sessions 17–22.
Источник: `node perf/interactive.mjs` (Playwright + longtask PerformanceObserver).

## Окружение

- Node 22 / Playwright (chromium headless, no-sandbox, --ignore-certificate-errors)
- Viewport 1400×900
- file:// index.html
- AI-ответы замоканы (Groq/Anthropic/Ollama → `{"action":"wait"}`)
- CAWM-тайлы недоступны из CORS-песочницы (визуал деградирован, но Leaflet
  панорамится и зумится — longtask-сумма замеряется корректно)
- FPS-значения занижены относительно реального браузера из-за headless + GPU-off;
  **интересна только relative-разница** между pauseOFF/pauseON

## Сценарии

- **Pan**: 10 × `leafletMap.panBy([±40,±40], { animate:true, duration:0.3s })`;
  ждём `moveend`. RAF-счётчик активен в окне [panBy → moveend]. Longtask >50 ms
  собираются за это же окно.
- **Zoom**: 4 × (zoomIn 1 + zoomOut 1) с `animate:true`.

## База (до Session 17) — runs=2

| Метрика                              | pauseOFF      | pauseON       | Δ            |
|--------------------------------------|---------------|---------------|--------------|
| Pan — mean-FPS                       | 3.43 – 3.54   | 3.61 – 3.62   | +2 … +5 %    |
| Pan — sum longtask>50 ms             | 517 – 544 ms  | 0 ms          | **−100 %**   |
| Pan — duration per op (p50)          | 584 – 591 ms  | 526 – 530 ms  | ≈ −10 %      |
| Zoom — sum longtask>50 ms            | 5961 – 6033   | 5562 – 8172   | variance     |
| Zoom — elapsed                       | 7440 – 7554   | 7048 – 9297   | variance     |

### Интерпретация

- **Pan longtask −100 %** — Session 16 (pause AmbientLayer/AquaWidget на
  movestart) убирает почти все main-thread blocks >50 ms, которые ранее
  порождались RAF-циклом фоновых виджетов, работающим параллельно с
  Leaflet pan-animation.
- **FPS pan +2…5 %** — Leaflet pan-handler сам по себе тяжёлый
  (`_updateNationLabelVisibility` PCA на ~900 наций). Фоновые RAF отбирали
  ~3 ms/frame, их убрали — FPS слегка вырос. Основной прирост FPS ждёт
  Session 17 (PCA-кэш в `_updateNationLabelVisibility`).
- **Zoom — variance** — zoom-операция триггерит `onZoomChange` →
  `refreshRegionStyles` на 3734 полигонах + CAWM tile-request retries.
  Longtask-сумма доминируется этими «родными» ms, RAF-пауза вклада почти
  не даёт. Session 18 (CSS-class для fill-opacity) должна обрушить эти
  longtasks.

## Таргеты для Session 17–22

| Session | Метрика                     | Таргет                    |
|---------|-----------------------------|---------------------------|
| 17      | Pan mean-FPS                | ≥ 50 FPS (сейчас 3-4 FPS — корректнее мерить в реальном браузере, в headless порядок сильно занижен) |
| 18      | Zoom longtask sum>50 ms     | −70 % относительно этой базы |
| 19      | Click → input-to-paint p95  | < 50 ms                   |
| 20      | Keystroke → input-to-paint  | < 16 ms                   |
| 21      | Mutations на смену Gov-таба | −5× (через `MutationObserver`) |
| 22      | Pan FPS на zoom=3           | ≥ 50 FPS                  |

## Как пере-замерить

```bash
node perf/interactive.mjs
```

Выводит JSON-блок, откуда значения копируются в `perf/session-N.md`.
Ветка: `claude/exciting-fermat-KVLXr`.
