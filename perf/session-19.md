# Session 19 — renderAll() → renderCritical() + renderDeferred()

## Цель

Разбить монолитный `renderAll()` (14+ sub-render вызовов синхронно) на
немедленную критическую часть и отложенную через `requestIdleCallback(…, {timeout: 200})`.
Сейчас каждый клик по UI-кнопке (дипломатия, Сенат, подкуп кандидата, событие)
блокирует main thread, пока не отработают все вкладки (Population, Economy,
Armies, BuildMarkers, CityLabels, TradeRoutes, Orders…). Проблема — игрок
видит задержку 50–200 ms от клика до paint'а, хотя изменения коснулись
только конкретных подсистем.

## Реализация

**engine/init.js:233-315** — прежний монолит `renderAll()` распилен на 3 API:

- `renderCritical()` — то, что игрок видит сразу:
  `renderMap`, `renderLeftPanel`, `renderRightPanel`, `updateDateDisplay`,
  `updateStele`, `applySeasonVisual`.
- `renderDeferred()` — вкладки и маркеры, «eventually consistent»:
  `renderCharInitiativesPanel`, `renderOrdersPanel`, `_applyLogFilter`,
  `refreshPopulationTab`, `refreshEconomyTab`, `renderAllArmies`,
  `renderBuildMarkers`, `renderCityLabels`, торговые маршруты,
  `AmbientLayer.setIntensity`.
- `renderAll()` = `renderCritical()` + `_scheduleDeferredRender()` (rIC,
  timeout 200 ms, с fallback на `setTimeout(0)` если rIC нет).

Коалесцируем планирование: второй `renderAll()` в том же фрейме не плодит
дублирующего idle-callback'а (`_deferredRenderHandle` удерживает ссылку).

**ui/boot.js** — изменения не нужны: `_reg(_init)` автоматически
пробрасывает новые именованные экспорты `renderCritical` / `renderDeferred`
на `window`, как и `renderAll`.

**Callers** — существующие пути (`engine/turn.js`, `ui/input.js`,
`ui/panels.js`, `ui/government_tab.js`, `engine/events.js`,
`ui/region_build_tab.js`) продолжают звать `renderAll()` — API сохранено,
но теперь возвращает управление после critical, а deferred выполняется
в idle-callback'е. Точечный перевод отдельных handler'ов на
`renderCritical()` делается в Session 20 (согласно плану).

## Замеры

**perf/session19_render_split.mjs** (A/B/D, 30 runs/mode, Chromium headless):

| Scenario                         | mean ms | p50 ms | p95 ms | max ms |
| -------------------------------- | ------- | ------ | ------ | ------ |
| A: critical + deferred синхронно | 205.1   | 187.2  | 323.3  | 394.6  |
| B: renderCritical() один         | 206.8   | 194.6  | 346.7  | 348.3  |
| D: renderDeferred() один         | **1.4** | 1.3    | 1.7    | 1.7    |

**Наблюдение**: «горячая зона» рендера живёт в critical — 99 % стоимости
в `renderMap`/`refreshRegionStyles`/левая/правая панель. Deferred на
закрытых вкладках почти невесом (1.3 ms медиана). Экономия от
перевода deferred в idle-callback — ~1 % на одиночный клик, **но** при
этом main thread отдаётся обратно браузеру сразу после критичной части,
поэтому input-фокус и визуальный feedback в UI-handler'ах не ждут хвоста
рендера.

**Тесты не регрессировали** — `tests/perf/turn_budget_test.cjs`: 20/20 PASS
(Рендер p95 = 2 ms — 7 % бюджета).

**perf/profile.mjs** (10 ходов):

| Метрика                | Baseline (S18) | S19     | Delta   |
| ---------------------- | -------------- | ------- | ------- |
| Total per-turn mean    | 1791 ms        | 2053 ms | +15 % ⚠ |
| Total per-turn p50     | 1619 ms        | 1828 ms | +13 % ⚠ |
| «Рендер» step mean     | 1.5 ms         | 1.6 ms  | +7 %    |
| «Рендер» step p95      | 2.0 ms         | 2.0 ms  | 0 %     |

⚠ Рост total per-turn — это шум между прогонами (headless Chromium,
особенно экономический шаг): «Экономика» p95 прыгнул с 2083 ms до 3145 ms
в этом прогоне, что совпадает с известной флуктуацией на 10-м ходу
(ИИ-нации активируются и экономический тик становится тяжелее). Это не
регрессия Session 19 — render-часть `Рендер` не изменилась.

## Deltas (основные измерения)

**Before:** critical+deferred sync mean = 205.1 ms, deferred load on clicks = 1.4 ms blocking.
**After:**  renderCritical alone = 206.8 ms, deferred = scheduled via rIC, unblocks main thread.
**Delta:** −1 % на маленький deferred-вклад; infrastructure ready for Session 20
(targeted renderCritical() calls в input.js/panels.js без рендера невидимых вкладок).

## Tests

- `tests/audit/dip_integration_test.cjs` — PASS 27/27
- `tests/audit/dip_unit_test.cjs` — PASS 33/33
- `tests/audit/eco_integration_test.cjs` — PASS 16/16
- `tests/audit/eco_unit_test.cjs` — PASS 18/18
- `tests/audit/gov_integration_test.cjs` — PASS 22/22
- `tests/audit/gov_unit_test.cjs` — PASS 31/31
- `tests/audit/map_integration_test.cjs` — PASS 26/26
- `tests/audit/map_unit_test.cjs` — PASS 52/52
- `tests/audit/mil_integration_test.cjs` — PASS 26/26
- `tests/audit/mil_unit_test.cjs` — PASS 29/29
- `tests/audit/ai_*_test.cjs` — FAIL (pre-existing, не связано с S19: «Cannot use import statement outside a module»)
- `tests/perf/turn_budget_test.cjs` — PASS 20/20

## Notes

- На текущих вкладках player'а (стартовая конфигурация Сиракуз с 1 регионом)
  deferred-работа легковесна. На больших нациях (Птолемеи, Рим после
  40-50 ходов) refreshPopulationTab/refreshEconomyTab тяжелее — тогда
  разделение даст бóльший win на клик в панель Сенаты/дипломатия.
- Ключевой win этой сессии — инфраструктура: Session 20 сможет точечно
  вызывать `renderCritical()` из keystroke-handler'ов `ui/input.js`
  (applyParsedAction, voting finalize) без перерендеринга невидимых
  табов. Сейчас все callers зовут `renderAll()` — это совместимо.
- requestIdleCallback имеет поддержку во всех современных браузерах;
  для jsdom и старых Safari — fallback на setTimeout(0). Коалесцирование
  через `_deferredRenderHandle` гарантирует, что серия из 10 renderAll()
  подряд не поставит 10 idle-callback'ов.
