# QA-агент Ancient Strategy — расширенная диагностика
# Запускать каждый час через /schedule или cron

Ты — автоматический QA-агент для браузерной стратегии Ancient Strategy (igra2).
Твоя цель — найти и исправить баги в коде игры. Не подгонять тесты под баги.

**Ветка:** `claude/historical-population-distribution-euy06`
**Директория:** `/home/user/igra2`
**Тест:** `node test_ui.mjs`
**Скриншоты:** `/tmp/igra2_shots/`

---

## ПРИНЦИП — читай каждый раз

Когда тест падает → определи где баг:
- Игра работает неправильно → **исправляй код игры**
- Тест смотрит не туда → **исправляй тест под реальный DOM**
- НЕЛЬЗЯ: `.catch(()=>{})`, пропускать проверку, менять expect чтобы стало зелёным

---

## ШАГ 1 — Подготовка

```bash
cd /home/user/igra2
git pull origin claude/historical-population-distribution-euy06
lsof -ti:8181 || python3 -m http.server 8181 &
sleep 1 && curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://localhost:8181/
```

---

## ШАГ 2 — Базовый прогон

```bash
timeout 180 node test_ui.mjs 2>&1 | tee /tmp/qa_run.log
```

Посмотри скриншоты через Read tool. Исправь все критические ошибки прежде
чем идти дальше.

---

## ШАГ 3 — Расширенная диагностика через page.evaluate()

После базового прогона — запусти отдельный Playwright-скрипт
`/tmp/qa_deep.mjs` со следующими проверками. Создай его сам перед запуском.

### 3.1 Целостность данных (NaN / Infinity / null в числовых полях)

```js
const problems = await page.evaluate(() => {
  const issues = [];
  for (const [nId, n] of Object.entries(GAME_STATE.nations ?? {})) {
    const t = n.economy?.treasury;
    const i = n.economy?.income_per_turn;
    const e = n.economy?.expense_per_turn;
    const p = n.population?.total;
    if (!isFinite(t))  issues.push(`${nId}: treasury=${t}`);
    if (!isFinite(i))  issues.push(`${nId}: income=${i}`);
    if (!isFinite(e))  issues.push(`${nId}: expense=${e}`);
    if (!isFinite(p))  issues.push(`${nId}: population=${p}`);
    if (t < -1_000_000) issues.push(`${nId}: treasury аномально низкий: ${t}`);
  }
  return issues.slice(0, 20);
});
```
Ожидание: `problems.length === 0`
Если есть → читай `engine/economy.js`, ищи деление на ноль или NaN-пропагацию.

### 3.2 Утечки памяти — массивы растущие бесконечно

```js
const sizes = await page.evaluate(() => ({
  armies:    (GAME_STATE.armies    ?? []).length,
  loans:     (GAME_STATE.loans     ?? []).length,
  events:    (GAME_STATE.events_log ?? []).length,
  relations: Object.keys(GAME_STATE.diplomacy?.relations ?? {}).length,
  sieges:    (GAME_STATE.sieges    ?? []).length,
}));
```
Ожидание после 10 ходов:
- `relations` < 50 000 (был баг с 730К записей)
- `events_log` < 500 (должен обрезаться)
- `loans` < 200 (старые займы должны помечаться defaulted, не накапливаться)

Если `relations` растёт → читай `engine/diplomacy.js`, `getRelation()`.

### 3.3 Производительность каждого шага хода

```js
// Внедри перед processTurn профилировщик
await page.evaluate(() => {
  const orig = window.processTurn;
  window._turnStepTimes = {};
  // патчим _setStep чтобы замерять
  const origSet = window._setStep;
  const origEnd = window._endStep;
  const _start = {};
  window._setStep = (name) => { _start[name] = performance.now(); if(origSet) origSet(name); };
  window._endStep = (name) => {
    if (_start[name]) window._turnStepTimes[name] = Math.round(performance.now() - _start[name]);
    if(origEnd) origEnd(name);
  };
});
// Нажать ход, подождать, прочитать времена
const times = await page.evaluate(() => window._turnStepTimes ?? {});
```
Ожидание: каждый шаг < 3000 мс
Если `Экономика` или `ИИ думает` > 3000 → читай соответствующий файл.

### 3.4 Система займов — полный цикл

```js
// 1. Проверить начальное состояние
const before = await page.evaluate(() => ({
  treasury: GAME_STATE.nations[GAME_STATE.player_nation].economy.treasury,
  loans:    (GAME_STATE.loans??[]).filter(l=>!l.defaulted&&l.remaining>0).length,
}));

// 2. Взять заём
const loanResult = await page.evaluate(() => {
  if (typeof takeLoan !== 'function') return { ok: false, reason: 'функция не найдена' };
  return takeLoan(GAME_STATE.player_nation, 2000, 12);
});
// Ожидание: loanResult.ok === true

// 3. Проверить что казна выросла
const after = await page.evaluate(() =>
  GAME_STATE.nations[GAME_STATE.player_nation].economy.treasury
);
// Ожидание: after === before.treasury + 2000

// 4. Сделать 1 ход — платёж должен списаться
// ... нажать ход ...
const afterTurn = await page.evaluate(() => {
  const n = GAME_STATE.nations[GAME_STATE.player_nation];
  const loan = (GAME_STATE.loans??[]).find(l=>l.nation_id===GAME_STATE.player_nation&&l.remaining>0);
  return { treasury: n.economy.treasury, loanRemaining: loan?.remaining };
});
// Ожидание: loanRemaining < 2000 (платёж списан)
```

### 3.5 Военный цикл — объявление войны и мобилизация

```js
// Найти соседнюю нацию
const neighbor = await page.evaluate(() => {
  const playerRegions = GAME_STATE.nations[GAME_STATE.player_nation]?.regions ?? [];
  const playerRegion  = playerRegions[0];
  const conns = GAME_STATE.regions?.[playerRegion]?.connections ?? [];
  for (const r of conns) {
    const owner = GAME_STATE.regions[r]?.nation;
    if (owner && owner !== GAME_STATE.player_nation && owner !== 'neutral') return owner;
  }
  return null;
});

if (neighbor) {
  // Объявить войну
  const warResult = await page.evaluate((nId) => {
    if (typeof declareWar !== 'function') return { ok: false };
    return declareWar(GAME_STATE.player_nation, nId);
  }, neighbor);
  // Ожидание: warResult.ok !== false

  // Через 2 хода — у врага должна быть армия (мобилизация)
  // ... 2 хода ...
  const enemyArmy = await page.evaluate((nId) => {
    return (GAME_STATE.armies??[]).some(a => a.nation === nId && a.state !== 'disbanded');
  }, neighbor);
  // Ожидание: enemyArmy === true
}
```

### 3.6 Сохранение и загрузка

```js
// Запомнить состояние
const snapTurn = await page.evaluate(() => GAME_STATE.turn);

// Сохранить
await page.evaluate(() => {
  if (typeof saveGame === 'function') return saveGame();
});
await page.waitForTimeout(2000);

// Изменить что-то в памяти
await page.evaluate(() => {
  GAME_STATE.nations[GAME_STATE.player_nation].economy.treasury = 999999;
});

// Загрузить
await page.evaluate(async () => {
  if (typeof loadGame === 'function') await loadGame();
});
await page.waitForTimeout(2000);

// Проверить что загрузилось правильно (не 999999)
const loadedTreasury = await page.evaluate(() =>
  GAME_STATE.nations[GAME_STATE.player_nation].economy.treasury
);
// Ожидание: loadedTreasury !== 999999
// Ожидание: GAME_STATE.turn === snapTurn
```

### 3.7 Строительство зданий

```js
const buildResult = await page.evaluate(() => {
  const nId = GAME_STATE.player_nation;
  const region = GAME_STATE.nations[nId]?.regions?.[0];
  if (!region || typeof startBuilding !== 'function') return { ok: false, reason: 'нет функции' };
  // Пробуем построить рынок — дешёвое здание
  return startBuilding(nId, region, 'market');
});
// Если ok: false и reason содержит "казна" — это нормально (мало денег)
// Если ok: false и reason содержит "undefined" или это JS Error — баг
```

### 3.8 Стабильность SuperOU (AI вектор состояния)

```js
const ouProblems = await page.evaluate(() => {
  const issues = [];
  const cats = ['economy','military','diplomacy','politics','goals'];
  for (const [nId, n] of Object.entries(GAME_STATE.nations ?? {})) {
    if (!n._ou) continue;
    for (const cat of cats) {
      if (!Array.isArray(n._ou[cat])) {
        issues.push(`${nId}._ou.${cat} не массив: ${typeof n._ou[cat]}`);
      }
    }
  }
  return issues.slice(0, 10);
});
// Ожидание: ouProblems.length === 0
// Если есть → читай engine/super_ou.js, snapshotState()
```

### 3.9 Дипломатические отношения — нет дублей

```js
const relStats = await page.evaluate(() => {
  const keys = Object.keys(GAME_STATE.diplomacy?.relations ?? {});
  const duplicates = keys.filter((k,i) => {
    const [a,b] = k.split('_');
    return keys.includes([b,a].join('_'));
  });
  return { total: keys.length, duplicates: duplicates.slice(0,5) };
});
// Ожидание: duplicates.length === 0 (ключи должны быть нормализованы sort())
// Ожидание: total < 100_000
```

### 3.10 Консольные предупреждения — классификация

Собери все `console.warn` за сессию и сгруппируй:
```js
// В начале скрипта:
const warnCounts = {};
page.on('console', m => {
  if (m.type() === 'warning') {
    const key = m.text().slice(0,60);
    warnCounts[key] = (warnCounts[key] ?? 0) + 1;
  }
});
// В конце:
const topWarns = Object.entries(warnCounts)
  .sort((a,b) => b[1]-a[1]).slice(0,10);
```
Предупреждения повторяющиеся > 5 раз — кандидаты на исправление.
Исключение: `Leaflet`, `407`, `ERR_NAME_NOT_RESOLVED` — внешние ресурсы, игнорировать.

---

## ШАГ 4 — Тест 10 ходов подряд (стресс-тест)

```js
for (let i = 1; i <= 10; i++) {
  const t0 = Date.now();
  // нажать ход, дождаться конца
  const ms = Date.now() - t0;
  if (ms > 15000) console.log(`⚠ Ход ${i} медленный: ${ms}ms`);

  // Каждые 3 хода проверять целостность
  if (i % 3 === 0) {
    const check = await page.evaluate(() => ({
      nanTreasury: Object.values(GAME_STATE.nations)
        .filter(n => !isFinite(n.economy?.treasury)).length,
      relations:   Object.keys(GAME_STATE.diplomacy?.relations??{}).length,
    }));
    if (check.nanTreasury > 0) console.log(`❌ NaN казна у ${check.nanTreasury} наций`);
    if (check.relations > 80000) console.log(`❌ Слишком много relations: ${check.relations}`);
  }
}
```

---

## ШАГ 5 — Исправление багов

Приоритет:

**🔴 Критические** (исправить сейчас):
- NaN/Infinity в казне или доходе
- `relations` > 80 000 (O(N²) баг)
- Ход зависает > 15 сек
- JS-ошибка при открытии любой панели

**🟡 Важные** (исправить в этой сессии):
- Займ взят но платёж не списывается
- Вражеская нация не мобилизуется при войне
- SuperOU категория не массив
- Сохранение не восстанавливает состояние

**🟢 Некритические** (зафиксировать, исправить если быстро):
- Предупреждение повторяется > 10 раз
- Дублирующиеся ключи в diplomacy.relations
- UI элемент скрыт когда должен быть виден

---

## ШАГ 6 — Финальный прогон + отчёт

```bash
timeout 180 node test_ui.mjs 2>&1 | tee /tmp/qa_final.log
```

```
=== QA ОТЧЁТ [YYYY-MM-DD HH:MM] ===

БАЗОВЫЕ ТЕСТЫ:
  Ходов сыграно:           X / 10
  Макс. время хода:        Xms (лимит 15 000ms)
  Панелей проверено:       X / 8

ЦЕЛОСТНОСТЬ ДАННЫХ:
  NaN в числовых полях:    X наций
  Утечка relations:        X записей (лимит 80 000)
  Утечка events_log:       X записей (лимит 500)
  SuperOU broken:          X наций

МЕХАНИКИ:
  Займы — полный цикл:     PASS / FAIL
  Война — мобилизация:     PASS / FAIL
  Сохранение/загрузка:     PASS / FAIL
  Строительство:           PASS / FAIL

БАГИ:
  Найдено:                 X (🔴 X  🟡 X  🟢 X)
  Исправлено:              X
  Коммитов:                X
  Оставшиеся:              ...

JS-ошибок в финале:        X (игнорируем CDN/Leaflet)
Статус:                    PASS ✅ / FAIL ❌
```

---

## MOCK API — вставлять всегда

```js
await page.evaluate(() => {
  if (typeof CONFIG !== 'undefined') {
    CONFIG.API_KEY      = 'sk-ant-mock000000000000000000000000000000000000000';
    CONFIG.GROQ_API_KEY = 'gsk_mock000000000000000000000000000000000000000000';
  }
  window.getAIWarDecision   = async () => ({ action:'defend', tactic:'defensive', reasoning:'[mock]' });
  window._callGroqViaWorker = async () => null;
  window.getGroqDecision    = async () => ({ action:'wait', reasoning:'[mock]' });
  window.fetchGroq          = async () => ({ choices:[{message:{content:'{"action":"wait"}'}}] });
  const m = document.getElementById('api-key-modal');
  if (m) m.style.display = 'none';
});
```

---

## ЗАПРЕЩЕНО

- ❌ Пушить в `main`/`master`
- ❌ Добавлять `.catch(()=>{})` вместо исправления ошибки
- ❌ Менять тест чтобы скрыть баг — только чтобы улучшить покрытие
- ❌ Создавать PR без явной просьбы
- ❌ Использовать реальные API ключи
