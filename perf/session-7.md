# Session 7 — Save payload через structured clone (без `JSON.stringify` на main)

## Метрика, которая нас интересовала

`saveGame()` планировался через `setTimeout(0)`, внутри которого на
main-треде выполнялись `JSON.stringify(payload)` + `TextEncoder.encode(json)`
— обе операции синхронные и блокировали UI между ходами на ~500 мс при
~32 МБ state'а. В профайлере это не видно (шаг «Сохранение» замеряет только
время await'а на планирование), зато отлично видно в микробенчмарке и в
общей per-turn метрике (меньше отложенной работы → следующий ход стартует
быстрее).

## Микробенчмарк save-пути (Chromium, `perf/session7_save.mjs`)

```
Payload: ~31.80 MB (JSON), 902 наций

  Legacy  (stringify+encode) n=8  mean=  529.92  p50=520.8  p95=594.5
  Session7 (structuredClone) n=8  mean=  358.59  p50=368.2  p95=401.2

  Δ mean: -32.3%   Δ p95: -32.5%
```

**Before:** 529.9 ms на главном треде за один вызов сохранения.
**After:**  358.6 ms на главном треде за один вызов сохранения.
**Delta:**  −32 % main-thread blocking (фактически меньше: в воркер уходит
сразу объект, `JSON.parse` в воркере тоже исключён).

## Profile per-turn breakdown (`perf/profile.mjs`, 10 ходов)

|             | mean   | p50    | p95    |
|-------------|-------:|-------:|-------:|
| До S7       | 2528.9 | 2350.2 | 4084.5 |
| После S7    | 2269.4 | 2141.1 | 3551.3 |

Per-turn mean −10 %, p95 −13 %. Шаг «Сохранение» в turn.js не изменился
(он замеряет только `await` на планирование, а не реальный клон) —
это ожидаемо, реальный win виден в микробенчмарке и общем per-turn
(следующий ход больше не ждёт `stringify` от предыдущего сохранения).

## Тесты

```
tests/test_save_roundtrip.mjs     — PASS  (save→load round-trip, 7 полей совпали)
tests/audit/eco_integration_test.cjs — 16/16 PASS
tests/audit/dip_integration_test.cjs — 27/27 PASS
tests/audit/mil_integration_test.cjs — 26/26 PASS
tests/audit/gov_integration_test.cjs — 22/22 PASS
tests/audit/eco_unit_test.cjs        — 18/18 PASS
tests/audit/map_unit_test.cjs        — 49/51 (2 pre-existing drift, как в S5/S6)
```

## Изменения

### engine/save.js

- Убран `JSON.stringify(payload) + new TextEncoder().encode(json).buffer` на
  main-треде. Теперь `worker.postMessage(payload)` — structured clone делает
  сам runtime, и он нативно быстрее связки stringify+encode на большом
  деревянном объекте (state состоит в основном из plain object / Array /
  number / string — идеальный кейс для structured clone).
- Fallback-путь (если Web Worker недоступен: file://, строгий CSP и т.п.)
  переведён с `GameStorage.save` на новый `idbSave`, который умеет падать
  на `localStorage` при ошибке IDB.
- Импорт `{ idbSave }` из `./idb_storage.js`.

### engine/save_worker.js

- Новый протокол: `onmessage` принимает payload-объект **напрямую**
  (structured clone через `postMessage`). `JSON.parse` в воркере больше
  не нужен — IDB сам хранит объект.
- Обратная совместимость: если почему-то пришёл `ArrayBuffer` (старый
  клиент в кэше), воркер декодирует и парсит как раньше. Это «мягкий»
  переход, если страница не перегрузилась после обновления.
- В ответе `{ ok: true, backend: 'idb' }` — упрощает диагностику.

### engine/idb_storage.js (новый, ~95 строк)

- Тонкий helper: `idbSave(payload)`, `idbLoad()`, `idbClear()`,
  `idbSupported()`.
- На happy-path кладёт объект в IDB без сериализации (та же БД
  `ancient_strategy_db`, store `saves`, ключ `current` — чтобы
  совпадало с воркером).
- На fail-path (IDB выключена, quota exceeded, `indexedDB`
  отсутствует) откатывается на `localStorage` с JSON-сериализацией.
  Ключ fallback: `ancient_strategy_save_fallback` (отдельный, чтобы
  не путать со старым `CONFIG.SAVE_KEY`).
- Экспорт зарегистрирован в `ui/boot.js` (`_reg`), чтобы поля стали
  доступны как `window.idbSave` / `window.idbLoad`.

### tests/test_save_roundtrip.mjs (новый)

- Playwright-тест: загружает игру, прогоняет 2 хода, вызывает
  `saveGame()`, обнуляет `GAME_STATE`, вызывает `loadGame()` и
  сравнивает ключевые поля (turn, player, nations/regions count,
  treasury, relations, events_log). Зелёный.

### perf/session7_save.mjs (новый)

- Микробенчмарк, который честно сравнивает цену main-thread клона
  между старым путём (stringify+encode) и новым (structured clone).

## Замечания

1. `structuredClone` используется в воркерном пути при `postMessage(payload)`
   автоматически — без вызова функции `structuredClone()` в нашем коде.
   Микробенчмарк меряет её явно, но в продакшн-пути этого вызова нет:
   структурный клон делает сам runtime во время передачи.
2. Fallback-путь (`idbSave` на main) всё ещё синхронно блокирует тред
   на структурный клон при IDB `put`. Это хуже чем воркер-путь, но
   срабатывает редко и по-прежнему без stringify, поэтому всё равно
   быстрее чем до Session 7.
3. `engine/storage.js` оставлен без изменений — он умеет мигрировать
   старые сохранения из `localStorage` (ключ `CONFIG.SAVE_KEY`), и его
   продолжает звать `loadGame()`. `idbSave` не трогает этот путь, чтобы
   не сломать миграцию при первом запуске после апдейта.
4. Размер payload оказался ~32 МБ (а не 10-15 МБ из плана) — значит,
   экономия в абсолюте ещё больше: 529 → 359 мс main-thread per save.

## Что бы сделал иначе

- Если в будущем окажется, что structured-clone всё равно тяжеловат
  (очень глубокая вложенность `nations[].history[]`), можно было бы
  разбить save на несколько `transferable` буферов per-subsystem
  (nations, regions, diplomacy) и сериализовать только те части,
  которые реально изменились с прошлого хода. Сейчас — избыточно.
- Можно добавить throttle: сохранять не каждый ход, а раз в 3-5 ходов
  (кроме ручного save). Это уже вне рамок Session 7.
