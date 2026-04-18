# Session 26 — Throttle saveGame (раз в CONFIG.SAVE_INTERVAL_TURNS=5 ходов)

**Before (Session 24 last run):**
- Сохранение: mean **2.5 ms**, p50 **2.5 ms**, p95 3.0 ms

**After (Session 26):**
- Сохранение: mean **1.0 ms** (−60 %), p50 **0.5 ms** (−80 %), p95 3.1 ms

На 10 ходов профайла реально запускается только **2 полных save** (turn 1
и turn 6) вместо 10 — восьмикратное сокращение `_buildSavePayload` +
`postMessage(payload)` работ на main thread.

**Tests:**
- `node tests/audit/ai_integration_test.cjs` — PASS (12/12) **[был сломан до сессии — исправлен]**
- `node tests/audit/ai_unit_test.cjs` — PASS (28/28) **[был сломан до сессии — исправлен]**
- `node tests/audit/eco_integration_test.cjs` — PASS (16/16)
- `node tests/audit/eco_unit_test.cjs` — PASS (18/18)
- `node tests/audit/dip_*` / `gov_*` / `map_*` / `mil_*` — PASS
- `node tests/test_save_roundtrip.mjs` — PASS (треasury=17388, 902/3734)
- `node tests/perf/turn_budget_test.cjs` — PASS (20/20)

**Детерминизм:** `syracuse.treasury` после 10 ходов = **21389**
(идентично baseline).

## Что сделано

### 1. CONFIG.SAVE_INTERVAL_TURNS = 5

Добавлена константа в `config.js`. По умолчанию сохранение
выполняется каждый 5-й ход. При крэше браузера игрок теряет
максимум 4 хода — приемлемо для автосейва.

### 2. `saveGame(opts)` принимает `{ force: true }`

В `engine/save.js`:

```js
let _lastSavedTurn = 0;

function _shouldSaveThisTurn() {
  const turn     = GAME_STATE?.turn ?? 1;
  const interval = Math.max(1, CONFIG.SAVE_INTERVAL_TURNS ?? 1);
  if (turn === 1) return true;
  if (turn - _lastSavedTurn >= interval) return true;
  return false;
}

export async function saveGame(opts) {
  const force = !!(opts && opts.force);
  if (!force && !_shouldSaveThisTurn()) {
    return { skipped: true };
  }
  _lastSavedTurn = GAME_STATE?.turn ?? _lastSavedTurn;
  // ... оригинальное сохранение
}
```

Также добавлены утилиты: `_forceNextSave()` (для UI-хука ручного сохранения,
если появится) и `_getLastSavedTurn()` (для индикатора «сохранено на ходу N»).

### 3. Тест `test_save_roundtrip.mjs` → `saveGame({ force: true })`

Тесту нужно гарантированно записать в IDB независимо от номера хода.
Force-флаг обходит throttle.

### 4. Исправлено: `ai_integration_test.cjs` и `ai_unit_test.cjs`

**Предсуществующий баг** (не в этой сессии): функция `loadScript()`
стрипала только `export`, но не `import`. `ai/strategic_llm.js` имеет
`import { CONFIG } from '../config.js';` → тест падал с `SyntaxError:
Cannot use import statement outside a module`.

Фикс — расширили regex: убираем также `^import ...;?` строки и добавляем
`global.CONFIG` заглушку для vm-контекста.

После фикса:
- `ai_integration_test.cjs` — 12 passed (было: crash до первого теста)
- `ai_unit_test.cjs` — 28 passed (было: crash)

Это выполнение обязательного правила "НУЖНО ИСПРАВИТЬ ЛЮБУЮ ВЫЯВЛЕННУЮ
ОШИБКУ" из рутины.

## Notes

- Throttle — основа для возможной UX-улучшки: при крупных открытиях
  (окно "Пауза", "Меню") можно вызвать `saveGame({ force: true })`
  чтобы пользователь не терял progress при alt-tab crash.
- Save-payload build (`_buildSavePayload`) всё ещё на main thread.
  Полный вынос требует передачи сырого GAME_STATE в Worker +
  сериализация там; это S7-follow-up, не target Session 26.
- Абсолютный win мал (~1.5 ms/ход), но важен для мобильных, где
  structured clone + IDB write занимает в 3-5× больше CPU.
- За три сессии (23/24/26) Econ p50 снизился с **800 → 645 ms**
  (−19 %), а full turn p50 с **1928 → ~1800 ms** (−7 %). Оставшийся
  bottleneck — хвост 10-го хода (AI-warm-up + tier2 rollout), который
  ни одна из четырёх сессий не адресует.
