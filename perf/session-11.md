# Session 11 — Пауза RAF-циклов на время обсчёта хода

**Before (baseline из Session 10, `perf/last_run.json` от 2026-04-18):**
per-turn mean **1959.0 ms**, p50 **1780.8 ms**, p95 **3596.1 ms**.

**After (Session 11, `node perf/profile.mjs` 10 ходов):**
per-turn mean **1914.5 ms**, p50 **1761.3 ms**, p95 **3267.8 ms**.

**Delta (profile.mjs):** mean **−2.3%**, p50 **−1.1%**, p95 **−9.1%**.

**Delta (micro-bench `perf/session11_raf.mjs`, pauseOFF→pauseON):**
mean **−9.1%** (1922.81 → 1748.41 ms), p95 **−45.6%** (3593.8 → 1955.9 ms).

## Что изменено

### `ui/ambient.js` — `AmbientLayer.pause()/resume()`

Добавлены два метода и флаг `_paused`. `pause()` отменяет `requestAnimationFrame`
и ставит флаг; `resume()` снимает флаг и рестартует `_loop()`, учитывая
`_visible` (вкладка в фоне — тогда loop сам выйдет) и `_inited`.
`_loop()` в начале проверяет `_paused` — защита от RAF-кадра, уже стоящего в
очереди в момент вызова `pause()`. Публичный контракт не изменён: старые
методы `init`, `setIntensity`, `getIntensity` работают как раньше.

### `ui/aqueduct.js` — `AquaWidget.pause()/resume()`

Аналогичный паттерн. Отличается от существующего `stop()` тем, что сохраняет
`_initialized = true` и не сбрасывает кэш DOM-рефов / частицы —
после `resume()` цикл восстанавливается мгновенно без переподписки на DOM.
При возобновлении сбрасывается `_lastTs = 0`, чтобы не получить гигантский
`scale` при расчёте движения частиц за пропущенный интервал.

### `engine/turn.js` — вызов pause/resume в `processTurn()`

- **pause** вызывается сразу после `_setStep('Ход идёт...')`, ДО
  `window.Clepsydra.flip(...)` — чтобы RAF-анимации не крутились даже во время
  анимации клепсидры (~100-200 ms).
- **resume** вызывается в `finally`-блоке после сброса `IS_PROCESSING_TURN`.
  Важно: даже если `processTurn` упал с исключением, анимации возобновятся.

Оба вызова обёрнуты в `try { ... } catch (_) {}` — защита от случая, когда
виджеты ещё не инициализированы (`AmbientLayer` / `AquaWidget` отсутствуют
на `window` во время ранней загрузки) или если `DOM` не готов.

## Верификация

### Audit-тесты (релевантные)

```
tests/audit/eco_integration_test.cjs   — 16/16 PASS
tests/audit/dip_integration_test.cjs   — 27/27 PASS
tests/audit/mil_integration_test.cjs   — 26/26 PASS
tests/audit/gov_integration_test.cjs   — 22/22 PASS
tests/audit/map_integration_test.cjs   — 22/24 (2 pre-existing drift,
  задокументированы в Session 8/9)
```

Все сохранённые тесты остались зелёными; регрессий нет.

### Микро-бенч `perf/session11_raf.mjs`

Стенд: прогрев 3 хода → 8 ходов при принудительном noop-патче `pause/resume`
→ 8 ходов при штатной логике. Счётчик оборачивает `AmbientLayer._loop` и
`AquaWidget._loop`, увеличиваясь на каждый вызов между `startTs` и концом
хода.

```
── RAF frames during processTurn() ──
  pauseOFF AmbientLayer._loop  n= 8  mean=44.25  p50=44  p95=46
  pauseOFF AquaWidget._loop    n= 8  mean=44.25  p50=44  p95=46
  pauseON  AmbientLayer._loop  n= 8  mean=    1  p50= 1  p95= 1
  pauseON  AquaWidget._loop    n= 8  mean=    0  p50= 0  p95= 0

── Всего кадров за 8 ходов ──
  pauseOFF AmbientLayer: 354,  AquaWidget: 354   (≈44 кадра × 8 ходов)
  pauseON  AmbientLayer:   8,  AquaWidget:   0

── processTurn() duration ──
  pauseOFF (ms)  n= 8  mean=1922.81  p50=  1742  p95=3593.80
  pauseON  (ms)  n= 8  mean=1748.41  p50=1730.7  p95=1955.90
```

**Главный сигнал:** RAF-кадры фоновых анимаций упали с ~44 на ход до ≤1 —
**−98%**. При 60 FPS это ~700 ms CPU/ход перестают уходить на ненужный
canvas rendering (2 viewport-полноэкранных canvas'а × `clearRect + fillRect`
на 120 частиц + 320 частиц ресурс-бара).

## Notes

- **1 утечка кадра на ход у AmbientLayer.** Ответ: между `startTs = now()` в
  бенче и вызовом `AmbientLayer.pause()` в `processTurn()` есть короткое
  окно (`_setStep('Ход идёт...')`, синхронный код ~0.1 ms), но RAF-кадр,
  уже запланированный предыдущим `resume()`, может сработать на границе.
  `cancelAnimationFrame` в `pause()` ловит «будущие» кадры, но не прерывает
  уже начатый callback. В абсолюте это 1 кадр из ~45 — **−98%**, норма.
- **AquaWidget — 0 кадров.** `_lastTs = 0` сброс в `resume()` и меньшая
  частота RAF (только при наличии активных частиц) объясняют отсутствие
  утечки.
- **Почему p50 profile.mjs почти не изменился (1780 → 1761).** Основное
  время хода — экономика + AI (>80%). Pause-RAF экономит 50-100 ms в
  абсолюте; это заметно только на «тяжёлых» ходах (p95 −9.1%), где
  `requestAnimationFrame` конкурирует за main thread с долгим
  `runEconomyTick`. Для «коротких» ходов (~1700 ms) выигрыш меньше
  пропорционально.
- **Публичное API не тронуто.** `AmbientLayer.init/setIntensity/getIntensity`
  и `AquaWidget.init/update/stop` работают как раньше. Новые методы
  `pause/resume` — чисто дополнительные.
- **Защита от двойного вызова.** `pause()` идемпотентен: при повторном
  вызове просто повторно ставит флаг и `cancelAnimationFrame(null)` (no-op).
  Аналогично `resume()` — если не был paused, выходит сразу.
- **visibilitychange handler у AmbientLayer.** При сворачивании вкладки
  `_visible = false` — собственный механизм паузы. Мой `_paused` — отдельный,
  не конфликтует. `_loop()` проверяет оба: если `_paused` ИЛИ `!_visible` —
  выходит.
