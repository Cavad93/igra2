# Session 20 — targeted refresh в applyParsedAction вместо renderAll()

**Before:** applyParsedAction + renderAll() — mean ≈ 194 ms, p95 ≈ 229–286 ms (blocking main thread).
**After:**  applyParsedAction + точечный refresh — mean ≈ 1.1–1.6 ms, p95 ≤ 1.9 ms.
**Delta:**  **−99 %** input-to-paint на keystroke (economy / diplomacy / character / chit-chat).

**Tests:**
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
- `tests/perf/turn_budget_test.cjs` — PASS 20/20 (Рендер p95 = 2.0 ms, 7 % бюджета)

## Цель

План Session 20: "keystroke в диалоге — < 16 ms input-to-paint". Сейчас
каждый `applyParsedAction(parsed)` из [ui/input.js:183](../ui/input.js#L183)
зовёт `renderAll()` → `renderCritical()` → `renderMap()` → `invalidateSize()`
+ `refreshRegionStyles()` (десятки–сотни ms). Для большинства player-действий
(изменение налога, отправка подарка, подарок персонажу) карта не меняется —
дорогая перерисовка лишняя.

## Реализация

**ui/input.js:155-220** — `applyParsedAction` переделан в targeted-refresh:

```js
let dirty = 0;
switch (parsed.action_type) {
  case 'economy':    dirty |= _DIRTY_ECONOMY; ...
  case 'military':   dirty |= _DIRTY_ARMIES | _DIRTY_ECONOMY; ...
  case 'diplomacy':  dirty |= _DIRTY_DIPLOMACY | _DIRTY_ECONOMY; ...
  case 'law':        /* открывает модал — рендер в finalizeVote */ return;
  case 'build':      dirty |= _DIRTY_REGIONS | _DIRTY_ECONOMY; ...
  case 'character':  dirty |= _DIRTY_CHARACTERS | _DIRTY_ECONOMY; ...
  default:           /* chit-chat — state не меняется */ return;
}

if (dirty & (_DIRTY_REGIONS | _DIRTY_ARMIES)) { renderAll(); return; }

renderLeftPanel();
renderRightPanel();
if (dirty & _DIRTY_ECONOMY)    refreshEconomyTab?.();
if (dirty & _DIRTY_CHARACTERS) renderCharInitiativesPanel?.();
```

Ключевые правила:

1. **Chit-chat (default case)** — `applyParsedAction` с неизвестным
   `action_type` теперь **не** вызывает никакого рендера. До S20: вся
   вкладка перерисовывалась даже если action — пустой ответ AI.
2. **Карта/армии → renderAll()** сохраняется для `build` и `military`:
   здания-маркеры, армейские маркеры на Leaflet canvas по-прежнему
   требуют полного цикла.
3. **Экономика / дипломатия / персонаж** → только `renderLeftPanel`
   (казна, легитимность), `renderRightPanel` (персонажи, реликвии),
   `refreshEconomyTab` (график казны), `renderCharInitiativesPanel`
   (инициативы двора). `renderMap()` пропускается полностью.

Обратная совместимость: `renderAll` из `engine/init.js` и все другие
callers (`engine/turn.js`, `ui/panels.js`, `ui/government_tab.js`,
`ui/region_build_tab.js`, `finalizeVote`, `finalizeDebateVote`,
`_applyLawChangesAsync`) не тронуты — их поведение прежнее.

## Замер (perf/session20_input.mjs)

Playwright headless, 25 runs/mode, applyParsedAction с noop-apply для
честного A/B по рендер-стоимости:

| action_type | A (renderAll) mean | B (S20) mean  | Delta       |
| ----------- | ------------------ | ------------- | ----------- |
| economy     | 193.9 ms           | **1.6 ms**    | **−99.2 %** |
| diplomacy   | 194.0 ms           | **1.3 ms**    | **−99.3 %** |
| character   | 193.2 ms           | **1.1 ms**    | **−99.4 %** |
| chit-chat   | 196.8 ms           | **0.2 ms**    | **−99.9 %** |

p95 по B: 1.3–1.9 ms — **в 8-10× ниже** целевого бюджета 16 ms (один кадр
@ 60 FPS).

## Notes

- `finalizeVote` / `finalizeDebateVote` / `_applyLawChangesAsync` по-прежнему
  зовут `renderAll()` — принятие закона редкое событие, там безопаснее
  полный рендер (правки закона могут менять произвольные поля state
  через `_applyLawChangesAsync`).
- Сценарий `build`/`military` остался на `renderAll()` — новое здание
  должно обновить маркер стройки на карте (`renderBuildMarkers`), новый
  юнит — армейские маркеры (`renderAllArmies`). Это по-прежнему ≈200 ms,
  но это редкий hit-path (несколько раз за ход), а не каждый keystroke.
- `chit-chat` теперь полностью бесплатный — AI-ответы без изменения
  state не дёргают DOM вообще. Это типичный случай для вопросов типа
  «что у нас с казной?» / «кто командует армией?», где AI просто
  возвращает текст без `action_type`.
- renderRightPanel имеет `_rightPanelSig` кэш (Session 6) — повторный
  вызов с неизменными данными = no-op. Это делает B ещё дешевле после
  первого прогона.
