# Улучшения экономики — план реализации за 10 сессий

## Контекст проекта

**Стек:** vanilla JS, без фреймворков.
**1 ход = 1 месяц. 1 единица ресурса = 1 кг.**

### Ключевые файлы экономики

| Файл | Роль |
|------|------|
| `engine/economy.js` | Оркестрация: производство, налоги, казна |
| `engine/market.js` | Мировые и региональные цены, трёхзонная логика |
| `engine/pops.js` | Благосостояние и потребление pop-групп |
| `engine/land_capacity.js` | Земельные лимиты застройки |
| `engine/turn.js` | Главный цикл, вызов `runEconomyTick()` |
| `ui/treasury-panel.js` | Казна, налоги, расходы |
| `ui/economy_tab.js` | Обзорная вкладка экономики |
| `data/goods.js` | Каталог товаров с ценами и эластичностью |
| `data/goods_meta.js` | STRATEGIC_GOODS и типы ресурсов |

### Что уже реализовано (не трогать)

- Трёхзонное ценообразование (дефицит / баланс / избыток)
- Двухуровневое производство (здания + свободные рабочие ×0.65)
- Pop-система: wealth, satisfaction, корзина потребления
- Региональные склады (буфер 3 тика)
- Мировой рынок с транспортными издержками
- Налоговые группы: aristocrats, clergy, commoners, soldiers
- Лимит застройки 70% площади
- Система займов: `engine/loans.js`

### Новые файлы к созданию

- `engine/economy_ext.js` — расширения экономики (все 8 улучшений)

Подключить в `index.html` перед `engine/turn.js`:
```html
<script src="engine/economy_ext.js"></script>
```

### Структура GAME_STATE (поля которые добавляем)

```javascript
GAME_STATE.economy_ext = {
  // Улучшение 3: специализация
  region_specialization: {},  // { region_id: { good, streak, bonus } }

  // Улучшение 4: инфляция
  inflation: {},              // { nation_id: 0.0–0.25 }

  // Улучшение 5: экономические циклы
  economic_cycle: {
    current: 'normal',        // 'boom' | 'normal' | 'recession'
    turns_left: 0,
    next_check_turn: 48
  },

  // Улучшение 6: монополии (кешируется)
  monopolies: {},             // { good: nation_id }

  // Улучшение 8: история торговли
  trade_history: []           // последние 12 записей { turn, balance_by_nation }
}
```

---

## Улучшение 1: Торговый баланс (видимость) ✅ ВЫПОЛНЕНО (этап 1)

**Суть:** Показать игроку сколько золота приходит и уходит через торговлю за ход.
**Сложность:** Только UI — логика уже есть в market.js.
**Файлы:** `ui/treasury-panel.js`, `engine/economy_ext.js`

**Что сделано в этапе 1:**
- Создан `engine/economy_ext.js` с каркасом `GAME_STATE.economy_ext`
  (region_specialization / inflation / economic_cycle / monopolies / trade_history).
- `initEconomyExt()` — идемпотентная инициализация всех полей расширения.
- `calcTradeBalance(nationId)` — считает `{ income, expense, net, gross_exports, imports, port_duties, tariff_income }` из уже существующих данных (`_income_breakdown` + `market._world_bought_tick`).
- `runEconomyExtTick()` — точка входа расширения; вызывается в конце `runEconomyTick()` (engine/economy.js).
- `_ecoExtRecordTradeHistory()` — пишет баланс по всем нациям в `economy_ext.trade_history` (ограничено 12 записями).
- `addEconomicEvent(text)` — общий логгер для этапов 2–8.
- Подключён скрипт в `index.html` ПОСЛЕ `engine/economy.js`.
- В `ui/treasury-panel.js` добавлен блок «Торговый баланс за ход» (`_tpRenderTradeBalance()`) с раздельным показом экспорта/импорта/пошлин и итогового сальдо. CSS-стили в `index.html`.

**НЕ повторять в новых сессиях.**

---

## Улучшение 2: Монопольный бонус ✅ ВЫПОЛНЕНО (этап 2)

**Суть:** Единственный производитель стратегического товара получает +20% к цене продажи и +5 к дипломатии с импортёрами.
**Сложность:** Низкая — проверка в конце `runEconomyTick()`.
**Файлы:** `engine/economy_ext.js`, `engine/economy.js`, `ui/treasury-panel.js`, `index.html`

**Что сделано в этапе 2:**
- В `engine/economy_ext.js` добавлены константы `MONOPOLY_PRICE_BONUS = 0.20` и `MONOPOLY_DIPLOMACY_BONUS = 5`.
- `detectMonopolies()` — аггрегирует производство нации по `region._production_last_tick`, сверяет со списком `STRATEGIC_GOODS` и записывает единственных производителей в `GAME_STATE.economy_ext.monopolies = { good: nationId }`. Порог `EPS = 0.01` отсекает численный шум. Логирует новые и утраченные монополии через `addEconomicEvent()`.
- `getMonopolyPriceMult(nationId, good)` — возвращает `1.20` если нация владеет монополией на товар, иначе `1.0`.
- В `engine/economy.js → processTrade()` множитель применяется к `grossProfit` рядом с `prefBonus` и `PIRACY_BASE`, так что монополист получает +20% прибыли по каждому торговому маршруту с экспортом этого товара.
- `_applyMonopolyDiplomacyDelta()` — пересчитывает desired-бонус для каждой пары `(монополист, торговый партнёр)` по данным новой карты монополий и приводит `diplomacy.relations[key].score` к этой величине через инвариант `rel.flags._mono_bonus_applied`. Это гарантирует, что бонус НЕ накапливается тик-за-тиком и корректно снимается при потере монополии (подтверждено тестами T4/T5/T6).
- `detectMonopolies()` вызывается из `runEconomyExtTick()` сразу после записи торговой истории.
- В `ui/treasury-panel.js → _tpRenderMonopolies()` добавлен блок списка активных монополий игрока в панели «Торговый баланс за ход». CSS-класс `.tp-trade-mono` в `index.html`.

**Тесты этапа 2 (Node-stubs, все зелёные):**
- `initEconomyExt()` создаёт `economy_ext.monopolies` как объект ✓
- `detectMonopolies()` помечает товар, производимый только одной нацией ✓
- `detectMonopolies()` НЕ помечает товар, производимый несколькими нациями (`wheat` в тестовом наборе) ✓
- `getMonopolyPriceMult(mono, good)` возвращает 1.20, для всех остальных — 1.0 ✓
- При появлении монополии `rel.score` у пары (монополист, торговый партнёр) увеличивается на +5 за каждый монополизированный товар ✓
- При потере части монополий бонус корректно уменьшается без побочных эффектов ✓
- При потере всех монополий `rel.flags._mono_bonus_applied` удаляется, score возвращается к исходному уровню ✓
- В `ui/treasury-panel.js` блок монополий появляется только у игрока-монополиста ✓

**НЕ повторять в новых сессиях.**

---

## Улучшение 3: Специализация региона ✅ ВЫПОЛНЕНО (этап 3)

**Суть:** Регион производящий один товар 10+ ходов без перебоев получает +5% эффективности (до +25%). Сброс при смене или дефиците.
**Сложность:** Средняя — новое поле в регионе.
**Файлы:** `engine/economy_ext.js`, `engine/economy.js`

**Что сделано в этапе 3:**
- В `engine/economy_ext.js` добавлены константы
  `SPEC_STREAK_WINDOW = 10`, `SPEC_STEP_BONUS = 0.05`, `SPEC_MAX_BONUS = 0.25`,
  `SPEC_EPS = 0.01` (порог «реального» производства).
- `updateRegionSpecialization()` — проходит по всем регионам,
  определяет топ-товар тика из `region._production_last_tick`, инкрементирует
  `streak` при совпадении с предыдущим топом, сбрасывает до 1 при смене,
  удаляет запись полностью при «дефиците» (нет производства или < EPS).
  Пересчитывает `bonus = 1 + min(0.25, floor(streak/10) × 0.05)`.
  Структура записи: `region_specialization[rid] = { good, streak, bonus }`
  — полностью совпадает с контрактом, ожидаемым этапом 8
  (`ui/economy_tab.js`).
- `getRegionSpecBonus(regionId, good)` — возвращает `bonus` (≥1.0), если
  `good === spec.good`, иначе `1.0`.
- В `engine/economy.js → routeProductionToLocalStockpiles()` после сборки
  `prodThisTick` для региона, но ДО расчёта `overflow`, применяется
  `getRegionSpecBonus(rid, good)` к каждому товару: добавочная величина
  `prod × (mult − 1)` заливается и в `prodThisTick[good]`, и в
  `region.local_stockpile[good]`. Это гарантирует, что бонус влияет и на
  ёмкость `capacity = produced × 3`, и на последующий overflow в
  `nation.economy.stockpile`.
- `updateRegionSpecialization()` вызывается из `runEconomyExtTick()` сразу
  после `detectMonopolies()`. Один тик задержки между расчётом бонуса и
  применением к производству — задуманный (бонус, начисленный в тике N,
  действует начиная с тика N+1).
- Логи: сообщения о каждом повышении порога (+5%, +10%, …, +25%), о смене
  топ-товара (только если прежний бонус был > 1.0) и о полной утрате
  специализации при дефиците.
- Все функции и константы экспортированы в `window` для инспекции и
  сохранения/загрузки.

**Тесты этапа 3 (`tests/eco_stage3_specialization_test.cjs`, все зелёные — 33/33):**
- `initEconomyExt()` создаёт `region_specialization` как пустой объект ✓
- Первый тик создаёт запись `{good, streak=1, bonus=1.0}` ✓
- Через 10 ходов `bonus=1.05`, через 20 → `1.10`, через 50 → `1.25` ✓
- После 100 ходов `bonus` не превышает `SPEC_MAX_BONUS=0.25` ✓
- Смена топ-товара сбрасывает streak в 1 и bonus в 1.0 ✓
- «Дефицит» (пустой `_production_last_tick` или значения < `SPEC_EPS`)
  удаляет запись ✓
- `getRegionSpecBonus(rid, 'wheat')` отдаёт бонус для совпадающего товара
  и 1.0 для всех остальных (и для неизвестных регионов) ✓
- Регионы независимы (streak у r1 и r2 ведётся отдельно) ✓
- После дефицита восстановление идёт с `streak=1` ✓
- Все функции/константы экспортированы в `window` ✓
- `runEconomyExtTick()` не падает и корректно вызывает
  `updateRegionSpecialization()` ✓

**НЕ повторять в новых сессиях.**

---

## Улучшение 4: Инфляция от переполненной казны ✅ ВЫПОЛНЕНО (этап 4)

**Суть:** Казна > 3× месячного дохода → внутренние цены растут +1–2%/ход (до +25%). Мотивирует тратить деньги на развитие.
**Сложность:** Средняя — мультипликатор цен.
**Файлы:** `engine/economy_ext.js`, `engine/buildings.js`, `ui/treasury-panel.js`, `index.html`

**Что сделано в этапе 4:**
- В `engine/economy_ext.js` добавлены константы `TREASURY_HOARD_RATIO = 3`,
  `TREASURY_CRITICAL_RATIO = 6`, `INFLATION_STEP = 0.01`,
  `INFLATION_STEP_FAST = 0.02`, `INFLATION_MAX = 0.25`.
- `updateInflation()` — раз в тик для каждой нации считает
  `ratio = treasury / income_per_turn`. При `ratio ≥ 3` инфляция растёт
  на +1%/ход; при `ratio ≥ 6` на +2%/ход (fast path). При нормализации
  казны (`ratio < 3`) — рассасывается на −1%/ход и удаляется из
  `economy_ext.inflation` при достижении нуля. Значения clamped до
  `INFLATION_MAX`. Логирует значимые переходы: появление, достижение
  потолка, полное снятие.
- `getInflationMult(nationId)` — возвращает `1 + inflation[nId]` в
  диапазоне 1.00–1.25.
- Вызывается из `runEconomyExtTick()` после `updateRegionSpecialization()`.
- В `engine/buildings.js → procureCapitalInputs()` провинциальный
  уровень снабжения умножает `provPayment` на `getInflationMult(nationId)`.
  Мировой рынок (внешний) НЕ затрагивается — это «защитный клапан» от
  внутренней инфляции.
- В `ui/treasury-panel.js → _tpRenderInflation()` добавлен блок
  предупреждения «💰 Инфляция (казна переполнена): +X% к закупкам»
  внутри панели торгового баланса. Условие показа `tp-trade-balance`
  расширено, чтобы блок выводился даже без торговой активности, если
  инфляция ≥ 0.5%. CSS-класс `.tp-trade-infl` в `index.html`.
- Все функции и константы экспортированы в `window` для инспекции и
  save/load.

**Тесты этапа 4 (`tests/eco_stage4_inflation_test.cjs`, 27/27 зелёные):**
- `initEconomyExt()` создаёт `inflation` как объект ✓
- Все константы выставлены (3, 6, 0.01, 0.02, 0.25) ✓
- `ratio < 3` — инфляция остаётся 0 ✓
- `ratio = 4` — инфляция растёт на +1% за тик (0.01, 0.02, …) ✓
- `ratio ≥ 6` — инфляция растёт на +2% за тик (0.02, 0.04, …) ✓
- Инфляция clamped до `INFLATION_MAX` = 0.25 ✓
- При нормализации казны рассасывается на −1%/ход ✓
- Полное обнуление удаляет запись нации из `inflation` ✓
- `getInflationMult()` = 1.0 для нации без инфляции и для неизвестной ✓
- Инфляции двух наций независимы (rome slow, egypt fast) ✓
- `income_per_turn = 0` не ломает расчёт (рассасывание продолжается) ✓
- `runEconomyExtTick()` интегрирует `updateInflation()` без падений ✓

**НЕ повторять в новых сессиях.**

---

## Улучшение 5: Экономические циклы ✅ ВЫПОЛНЕНО (этап 5)

**Суть:** Раз в 48–72 хода — рандомный глобальный сдвиг: урожайный год (+15% зерно) или голодный (−18%). Длится 6–12 ходов.
**Сложность:** Низкая — один таймер и мультипликатор.
**Файлы:** `engine/economy_ext.js`, `engine/economy.js`, `ui/treasury-panel.js`, `index.html`

**Что сделано в этапе 5:**
- В `engine/economy_ext.js` добавлены константы `CYCLE_GOODS` (`wheat`,
  `barley`, `olives`, `grapes`, `fish`), `CYCLE_TYPES`
  (boom ×1.15, recession ×0.82, normal ×1.0), параметры периодичности
  `CYCLE_CHECK_MIN=48`, `CYCLE_CHECK_RANGE=24`, длительности
  `CYCLE_DUR_MIN=6`, `CYCLE_DUR_RANGE=7` и вероятности
  `CYCLE_BOOM_PROB=0.20`, `CYCLE_RECESSION_PROB=0.20`.
- `updateEconomicCycle()` — раз в тик: если активен ненормальный
  цикл, отсчитывает `turns_left` до 0 и возвращает state в `'normal'`,
  логгируя завершение. Если `turn ≥ next_check_turn` — делает roll:
  20% boom / 20% recession / 60% normal. При активации задаёт длину
  6–12 ходов случайно. `next_check_turn` отложен на 48–71 ход вперёд
  даже при нормальном исходе. Гарантия: новая проверка не делается
  пока длится активный цикл.
- `getCycleMult(good)` — 1.0 для `normal` и не-food-товаров; иначе
  мультипликатор активного цикла (1.15 / 0.82). Используется в
  `engine/economy.js → routeProductionToLocalStockpiles()` сразу после
  бонуса специализации (этап 3): прибавка/вычет идёт в `prodThisTick`
  и `local_stockpile`, поэтому корректно влияет на ёмкость и overflow.
- `getEconomicCycleBanner()` — HTML-блок для UI (пустая строка для
  normal). Возвращает баннер с названием цикла, числом оставшихся
  ходов и описанием.
- В `ui/treasury-panel.js → _tpRenderEconomicCycle()` добавлен блок
  активного цикла внутри панели «Торговый баланс за ход». Условие
  показа `tp-trade-balance` расширено, чтобы блок появлялся даже без
  торговой активности при активном цикле. CSS-класс `.tp-trade-cycle`
  в `index.html` (зелёная рамка для бума, оранжевая для спада).
- Вызывается из `runEconomyExtTick()` после `updateInflation()`.
- Все функции и константы экспортированы в `window` для инспекции и
  save/load (`updateEconomicCycle`, `getCycleMult`,
  `getEconomicCycleBanner`, `CYCLE_GOODS`, `CYCLE_TYPES`).

**Тесты этапа 5 (`tests/eco_stage5_cycles_test.cjs`, 53/53 зелёные):**
- `initEconomyExt()` создаёт `economic_cycle` с дефолтным состоянием
  `current=normal, turns_left=0, next_check_turn=48` ✓
- Все экспорты на месте; `CYCLE_TYPES.boom.mult=1.15`,
  `recession.mult=0.82` ✓
- При `turn < next_check_turn` ничего не происходит ✓
- При `turn ≥ 48` и roll < 0.20 → активируется boom с длительностью
  в `[6,12]` ✓
- `getCycleMult('wheat'|'barley'|'fish') = 1.15` при boom ✓
- `getCycleMult('iron'|'timber'|'horses') = 1.0` (не-food) ✓
- `turns_left` уменьшается каждый ход; при обнулении `current →
  normal`, лог завершения, `next_check_turn` сдвинут вперёд ✓
- Roll ∈ [0.20; 0.40) → recession; `getCycleMult('wheat')=0.82` ✓
- Roll ≥ 0.40 → остаёмся в normal, `next_check_turn` всё равно
  сдвигается в окно `[turn+48; turn+72)` ✓
- `getEconomicCycleBanner()` — пустая строка для normal,
  непустая HTML-строка с `eco-cycle-banner`, названием цикла и числом
  оставшихся ходов при активном цикле ✓
- `runEconomyExtTick()` интегрирует `updateEconomicCycle()` без
  падений ✓
- Полный жизненный цикл: boom (6 ходов) → normal → recession ✓
- 7 значений random для длительности → все 7 длин ∈ `[6,12]` ✓

**НЕ повторять в новых сессиях.**

---

## Улучшение 6: Усталость армии от недофинансирования ✅ ВЫПОЛНЕНО (этап 6)

**Суть:** Если расходы на армию < 80% нормы → боевая эффективность ×0.85. Связь экономики и военной силы.
**Сложность:** Низкая — одна строка в боевой формуле.
**Файлы:** `engine/economy_ext.js`, `engine/battle.js`, `ui/treasury-panel.js`

**Что сделано в этапе 6:**
- В `engine/economy_ext.js` добавлены константы
  `ARMY_UNDERFUND_THRESHOLD = 0.80` и `ARMY_UNDERFUND_PENALTY = 0.85`.
- `calcNormalArmyExpense(nationId)` — нормальный upkeep без ползунка.
  Сначала пытается взять кэшированное значение из
  `nation.economy._expense_breakdown.army_base` (заполняется в
  `engine/economy.js → updateTreasury()`), а при его отсутствии
  пересобирает по `CONFIG.BALANCE.INFANTRY_UPKEEP / CAVALRY_UPKEEP /
  MERCENARY_UPKEEP`. Fallback-коэффициенты (2/4/3) используются только
  в Node-стабах.
- `getArmyFundingRatio(nationId)` — отношение фактически выплаченных
  военных расходов текущего тика (`army_infantry + army_cavalry +
  army_mercenaries` из `_expense_breakdown`) к `army_base`. Результат
  clamped в `[0, 1]`. Если у нации нет армии — возвращает 1.0
  (штраф невозможен).
- `getArmyCombatMult(nationId)` — `1.0` при `ratio ≥ 0.80`, иначе
  линейная интерполяция от `ARMY_UNDERFUND_PENALTY = 0.85` при
  `ratio = 0` до `1.0` при `ratio = 0.80` по формуле
  `0.85 + 0.15 × (ratio / 0.80)`.
- `updateArmyFunding()` — раз в тик пересчитывает `ratio/mult` для всех
  наций и кладёт в `nation.economy._army_funding = { ratio, mult }`
  (используется UI и консольной инспекцией). Для игрока логирует
  появление и снятие штрафа через `addEconomicEvent()`.
- Вызов `updateArmyFunding()` добавлен в `runEconomyExtTick()` после
  `updateEconomicCycle()`.
- В `engine/battle.js → calculateMilitaryStrength()` после культурных
  бонусов итоговая сила умножается на `getArmyCombatMult(opts.nationId)`.
  Это работает и для атакующего, и для защитника, так как `nationId`
  уже передаётся в `calculateMilitaryStrength()` в обоих вызовах из
  `resolveBattle()`.
- В `ui/treasury-panel.js → _tpRenderArmyFunding()` добавлен блок
  предупреждения «⚔ Армия недофинансирована: X% нормы / Боевой штраф:
  −Y%» внутри панели «Торговый баланс за ход». Условие показа
  расширено так, что блок выводится даже без торговой активности, если
  `ratio < 0.80`. Цвет рамки меняется с оранжевого на красный при
  `ratio < 0.40`.
- Все функции и константы экспортированы в `window` для инспекции и
  save/load (`calcNormalArmyExpense`, `getArmyFundingRatio`,
  `getArmyCombatMult`, `updateArmyFunding`,
  `ARMY_UNDERFUND_THRESHOLD`, `ARMY_UNDERFUND_PENALTY`).

**Тесты этапа 6 (`tests/eco_stage6_army_funding_test.cjs`, 33/33 зелёные):**
- `calcNormalArmyExpense` / `getArmyFundingRatio` / `getArmyCombatMult`
  / `updateArmyFunding` экспортированы; константы = 0.80 / 0.85 ✓
- `calcNormalArmyExpense()` берёт `army_base` из breakdown ✓
- Fallback без breakdown считает по ставкам CONFIG.BALANCE ✓
- Неизвестная нация → 0 (calcNormal) / 1.0 (ratio/mult) ✓
- `expense_levels.army = 1.0` → ratio = 1.0, mult = 1.0 ✓
- `expense_levels.army = 0.5` → ratio ≈ 0.5, штраф активен,
  mult ≈ 0.944 (линейная интерполяция) ✓
- `actualPaidMult = 0` → ratio = 0, mult = `ARMY_UNDERFUND_PENALTY` = 0.85 ✓
- На пороге `ratio = 0.80` штрафа нет (mult = 1.0) ✓
- `lvl = 1.20` → ratio capped в 1.0 (переплата не даёт бонуса) ✓
- Нация без армии: `ratio = 1.0`, `mult = 1.0` ✓
- `updateArmyFunding()` кладёт `{ratio, mult}` в
  `economy._army_funding` ✓
- `runEconomyExtTick()` не падает и вызывает `updateArmyFunding()` ✓
- `calculateMilitaryStrength()` при `ratio = 0` даёт ровно 85%
  силы относительно `ratio = 1.0` (проверено vm-загрузкой функции
  из `engine/battle.js`) ✓
- Существующие тесты этапов 3/4/5 остаются зелёными ✓

**НЕ повторять в новых сессиях.**

---

## Улучшение 7: Рост производительности со временем ✅ ВЫПОЛНЕНО (этап 7)

**Суть:** Каждые 120 ходов (10 лет) — пассивный прирост +2% к эффективности всех зданий (до +20% за 100 лет). Отражает развитие ремёсел.
**Сложность:** Низкая — глобальный мультипликатор.
**Файлы:** `engine/economy_ext.js`, `engine/economy.js`, `ui/economy_react.jsx`

**Что сделано в этапе 7:**
- В `engine/economy_ext.js` добавлены константы
  `TECH_DRIFT_INTERVAL = 120`, `TECH_DRIFT_STEP = 0.02`,
  `TECH_DRIFT_MAX = 0.20`.
- `updateTechDrift()` — раз в тик проверяет `turn − last_tick ≥
  TECH_DRIFT_INTERVAL` и докидывает `+2%` к `tech_drift.bonus`, пока
  не упрётся в потолок. Цикл `while` «догоняет» пропущенные
  интервалы (важно после загрузки старого сейва, где прошло
  несколько полных интервалов сразу). При достижении потолка
  `last_tick` корректно нормализуется, чтобы не генерировать
  повторные логи.
- `getTechDriftMult()` — глобальный множитель `1.0…1.20`. Возвращает
  `1.0` если `GAME_STATE` отсутствует, `tech_drift.bonus < 0` или NaN.
- `renderTechDrift()` — HTML-блок для UI (отдельный класс
  `eco-tech-none` при базовом уровне и `eco-tech-level` при активном
  бонусе).
- Вызов `updateTechDrift()` добавлен в `runEconomyExtTick()` после
  `updateArmyFunding()`.
- В `engine/economy.js → routeProductionToLocalStockpiles()` после
  заливки регионального `bldByRegion[rid]` в `prodThisTick` и `ls`
  прибавляется технологический прирост: `delta = amt × (techMult − 1)`
  по каждому товару зданий. Это гарантирует, что бонус идёт ТОЛЬКО
  к организованному производству (зданиям), не затрагивая
  неорганизованную часть, и учитывается в `overflow` через
  обновлённый `capacity = produced × 3`.
- В `ui/economy_react.jsx → _eRender()` в шапке экономического
  обзора добавлен бейдж «⚒ Ремёсла: +X%» с тултипом, описывающим
  формулу дрейфа. При `bonus < 0.01` выводится «⚒ Ремёсла: базовый».
- Все функции и константы экспортированы в `window` для инспекции
  и save/load (`updateTechDrift`, `getTechDriftMult`,
  `renderTechDrift`, `TECH_DRIFT_INTERVAL`, `TECH_DRIFT_STEP`,
  `TECH_DRIFT_MAX`).

**Тесты этапа 7 (`tests/eco_stage7_tech_drift_test.cjs`, 44/44 зелёные):**
- Экспорты и константы на месте (120 / 0.02 / 0.20) ✓
- `updateTechDrift()` лениво создаёт `tech_drift = {bonus:0,last_tick:0}` ✓
- `turn < 120` — `bonus` остаётся 0 ✓
- `turn = 120` → `bonus = 0.02`, `last_tick = 120`,
  `getTechDriftMult() = 1.02` ✓
- `turn = 240` → `bonus = 0.04`, `last_tick = 240` ✓
- 5 циклов (по 120 ходов каждый) → `bonus = 0.10`, mult = 1.10 ✓
- `turn = 1200+` — `bonus` не превышает `TECH_DRIFT_MAX = 0.20`,
  mult = 1.20; дальнейшие тики не двигают значение ✓
- `getTechDriftMult()` возвращает 1.0 для `GAME_STATE = null` и для
  отсутствующего `tech_drift` ✓
- Интеграция: `runEconomyExtTick()` на `turn=120` повышает bonus
  до 0.02 без падений ✓
- `renderTechDrift()` — «базовый» при bonus < 0.01 и `+X%` +
  класс `eco-tech-level` при активном бонусе ✓
- «Догоняющие» шаги: `turn=360` с `last_tick=0` за один вызов
  повышает bonus до 0.06, `last_tick=360` ✓
- Save/load: JSON-сериализация `tech_drift` сохраняет `bonus` и
  `last_tick`; после восстановления mult корректен ✓
- Патч `engine/economy.js` содержит блок «Этап 7» и прибавляет
  `delta = amt × (mult − 1)` в `prodThisTick` и `local_stockpile` ✓
- Симуляция: при `bonus = 0.10` производство здания `wheat: 100`
  становится 110, `iron: 50` → 55 (как в `prodThisTick`, так и в
  `local_stockpile`) ✓
- Существующие тесты этапов 3/4/5/6 остаются зелёными ✓

**НЕ повторять в новых сессиях.**

---

## Улучшение 8: Тултип неорганизованного производства ✅ ВЫПОЛНЕНО (этап 8)

**Суть:** В экономической вкладке показывать "65% эффективность (нет зданий)" чтобы игрок понимал почему производство низкое.
**Сложность:** Минимальная — только UI.
**Файлы:** `engine/economy_ext.js`, `ui/economy_react.jsx`, `index.html`

**Что сделано в этапе 8:**
- В `engine/economy_ext.js` добавлены:
  - Константа `UNORGANIZED_PENALTY = 0.35` (= 1 − `SUBSISTENCE_FACTOR`
    из `engine/economy.js`).
  - `hasRegionBuildings(region)` — true, если в регионе есть хотя
    бы один `building_slot` со `status='active'`. Поддержана
    legacy-форма `{ type: ... }` из исходной спецификации.
  - `renderRegionProductionEfficiency(regionId)` — собирает
    HTML-блок с активными бонусами/штрафами по приоритету:
    1) «⚠ Неорганизованное производство: −35% эффективность»
       при `!hasRegionBuildings(region)`;
    2) «⚙ Специализация (товар, streak ходов): +X%» из
       `economy_ext.region_specialization[regionId]` (Этап 3);
    3) «⚒ Уровень ремёсел: +X%» из `getTechDriftMult()` (Этап 7);
    4) «🌾/🌧 Экономический цикл: ±X% к зерну» из
       `economy_ext.economic_cycle.current` (Этап 5).
    Возвращает пустую строку, если нечего показать (защищает UI
    от лишних пустых блоков).
  - Обе функции и `UNORGANIZED_PENALTY` экспортированы в `window`
    для инспекции и save/load.
- В `ui/economy_react.jsx → _eRenderM_Region()` над таблицей
  товаров выбранного региона вставлен блок
  `renderRegionProductionEfficiency(selReg.rid)` в шапке
  правой колонки рядом с названием области. Вызов защищён
  через `typeof` — старые сейвы без `economy_ext` не падают.
- В `index.html` добавлены CSS-стили для блока тултипов:
  `.eco-eff-block`, `.eco-eff-row`, `.eco-eff-warn`,
  `.eco-eff-pos`, `.eco-eff-neg`, `.eco-eff-hint` — с
  цветовой дифференциацией (оранжевое предупреждение,
  зелёные бонусы, красный отрицательный штраф цикла).

**Тесты этапа 8 (`tests/eco_stage8_production_tooltips_test.cjs`, 42/42 зелёные):**
- Экспорты `hasRegionBuildings`, `renderRegionProductionEfficiency`
  и константа `UNORGANIZED_PENALTY = 0.35` на месте ✓
- `hasRegionBuildings` корректно распознаёт `null`, `undefined`,
  пустой объект, `building_slots=null`, пустой массив и массив
  только строящихся слотов как «нет зданий» ✓
- `hasRegionBuildings` возвращает `true` для массива с хотя бы
  одним `status='active'`; поддерживает legacy-форму `{type}` ✓
- Регион без зданий показывает строку «Неорганизованное
  производство: −35% эффективность» с классом `eco-eff-warn`,
  обёрнутую в `eco-eff-block`, с подсказкой `eco-eff-hint` ✓
- Регион с активным зданием БЕЗ прочих бонусов возвращает
  пустую строку ✓
- Спец-бонус (streak=12, bonus=1.05, good=wheat) показывается
  с именем «Пшеница», числом ходов и `+5%`, класс `eco-eff-pos` ✓
- `bonus=1.0` НЕ выводит строку специализации ✓
- Tech-drift `bonus=0.08` выводит «⚒ Уровень ремёсел: +8%» ✓
- `tech_drift.bonus=0` НЕ выводит строку ремёсел ✓
- `economic_cycle.current='boom'` выводит `+15% к зерну` с
  эмоджи 🌾 и классом `eco-eff-pos` ✓
- `economic_cycle.current='recession'` выводит `−18%` с
  эмоджи 🌧 и классом `eco-eff-neg` ✓
- `current='normal'` НЕ выводит строку цикла ✓
- Комбинация (нет зданий + spec + tech + boom) → 4 строки,
  все четыре блока одновременно ✓
- Неизвестный regionId → пустая строка ✓
- `GAME_STATE = null` → пустая строка (нет `TypeError`) ✓
- Все бонусы на нулевом/базовом уровне → пустая строка ✓
- Существующие тесты этапов 3/4/5/6/7 остаются зелёными ✓

**НЕ повторять в новых сессиях.**

---

## Этап 5 — Экономические циклы (Улучшение 5)

**Цель:** раз в 48–72 хода случайный глобальный сдвиг (урожайный год / голодный год), длится 6–12 ходов.

### Задачи

В `engine/economy_ext.js`:

```javascript
const CYCLE_GOODS = ['wheat', 'barley', 'olives', 'grapes', 'fish'];

const CYCLE_TYPES = {
  boom: {
    label: 'Урожайный год',
    mult: 1.15,
    desc: '+15% к производству зерна и продовольствия'
  },
  recession: {
    label: 'Неурожайный год',
    mult: 0.82,
    desc: '−18% к производству зерна и продовольствия'
  },
  normal: { label: 'Нормальный год', mult: 1.0, desc: '' }
};

function updateEconomicCycle() {
  const cycle = GAME_STATE.economy_ext?.economic_cycle;
  if (!cycle) return;

  const turn = GAME_STATE.turn ?? 0;

  // Активный цикл — отсчитываем ходы
  if (cycle.current !== 'normal' && cycle.turns_left > 0) {
    cycle.turns_left--;
    if (cycle.turns_left === 0) {
      // Цикл завершён — возврат к норме
      addEconomicEvent(`📅 ${CYCLE_TYPES[cycle.current].label} завершился.`);
      cycle.current = 'normal';
    }
    return;
  }

  // Проверка нового цикла
  if (turn < cycle.next_check_turn) return;

  // Следующая проверка через 48–72 хода
  cycle.next_check_turn = turn + 48 + Math.floor(Math.random() * 24);

  // 20% boom, 20% recession, 60% normal
  const roll = Math.random();
  if (roll < 0.20) {
    cycle.current    = 'boom';
    cycle.turns_left = 6 + Math.floor(Math.random() * 7); // 6–12 ходов
    addEconomicEvent(`🌾 ${CYCLE_TYPES.boom.label}! ${CYCLE_TYPES.boom.desc}`);
  } else if (roll < 0.40) {
    cycle.current    = 'recession';
    cycle.turns_left = 6 + Math.floor(Math.random() * 7);
    addEconomicEvent(`🌧 ${CYCLE_TYPES.recession.label}! ${CYCLE_TYPES.recession.desc}`);
  }
}

// Получить мультипликатор цикла для товара
function getCycleMult(good) {
  const cycle = GAME_STATE.economy_ext?.economic_cycle;
  if (!cycle || cycle.current === 'normal') return 1.0;
  if (CYCLE_GOODS.includes(good)) return CYCLE_TYPES[cycle.current].mult;
  return 1.0;
}

// Лог экономических событий
function addEconomicEvent(text) {
  if (typeof addLog === 'function') addLog(text);
  console.log('[economy_ext]', text);
}
```

Применить в `engine/economy.js` при расчёте производства продовольствия:
```javascript
const cycleMult = typeof getCycleMult === 'function' ? getCycleMult(good) : 1.0;
produced *= cycleMult;
```

Показать активный цикл в `ui/economy_tab.js`:
```javascript
function renderEconomicCycle() {
  const cycle = GAME_STATE.economy_ext?.economic_cycle;
  if (!cycle || cycle.current === 'normal') return '';
  const info = CYCLE_TYPES[cycle.current];
  const color = cycle.current === 'boom' ? '#44cc44' : '#cc6644';
  return `<div class="eco-cycle-banner" style="border-color:${color}">
    ${info.label} — ещё ${cycle.turns_left} ходов<br>
    <small>${info.desc}</small>
  </div>`;
}
```

Добавить вызов в `runEconomyExtTick()`:
```javascript
updateEconomicCycle();
```

### Тесты этапа 5

- [ ] `GAME_STATE.economy_ext.economic_cycle` инициализирован корректно
- [ ] После 48+ ходов цикл может смениться (проверить `next_check_turn`)
- [ ] При `current='boom'` производство зерна выше чем без цикла
- [ ] При `current='recession'` производство зерна ниже
- [ ] `turns_left` уменьшается каждый ход при активном цикле
- [ ] При `turns_left=0` цикл возвращается в `'normal'`
- [ ] `getCycleMult('iron')` возвращает 1.0 (не продовольствие)
- [ ] `getCycleMult('wheat')` возвращает не 1.0 при активном цикле
- [ ] В UI виден баннер активного цикла с числом оставшихся ходов

---

## Этап 6 — Усталость армии от недофинансирования (Улучшение 6)

**Цель:** расходы на армию < 80% нормы → боевая эффективность ×0.85.

### Задачи

В `engine/economy_ext.js`:

```javascript
const ARMY_UNDERFUND_THRESHOLD = 0.80; // ниже 80% нормы — штраф
const ARMY_UNDERFUND_PENALTY   = 0.85; // множитель боевой эффективности

function getArmyFundingRatio(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 1.0;

  // Нормальный уровень расходов на армию (spending_level = 1.0)
  const spendingLevel  = nation.economy?.spending?.army ?? 1.0;
  const normalExpense  = calcNormalArmyExpense(nationId); // функция из economy.js
  const actualExpense  = nation.economy?.last_army_expense ?? normalExpense;
  const normalAtLevel  = normalExpense * spendingLevel;

  if (normalAtLevel <= 0) return 1.0;
  return Math.min(1.0, actualExpense / normalAtLevel);
}

function getArmyCombatMult(nationId) {
  const ratio = getArmyFundingRatio(nationId);
  if (ratio >= ARMY_UNDERFUND_THRESHOLD) return 1.0;
  // Линейное снижение от 1.0 до ARMY_UNDERFUND_PENALTY
  const t = ratio / ARMY_UNDERFUND_THRESHOLD;
  return ARMY_UNDERFUND_PENALTY + (1.0 - ARMY_UNDERFUND_PENALTY) * t;
}
```

Если `calcNormalArmyExpense` не существует в `economy.js` — определить простую версию:
```javascript
function calcNormalArmyExpense(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;
  const armies = Object.values(nation.armies ?? {});
  return armies.reduce((s, a) =>
    s + ((a.infantry||0) + (a.cavalry||0)*2 + (a.archers||0)) * 2, 0);
}
```

Применить в `engine/combat.js` или `engine/armies.js`.
Найти где считается финальный боевой урон и добавить:
```javascript
const fundMult = typeof getArmyCombatMult === 'function'
  ? getArmyCombatMult(army.nation_id) : 1.0;
finalDamage *= fundMult;
```

Показать в казне если финансирование низкое:
```javascript
function _tpRenderArmyFunding(nation) {
  const ratio = typeof getArmyFundingRatio === 'function'
    ? getArmyFundingRatio(GAME_STATE.player_nation) : 1.0;
  if (ratio >= 0.80) return '';
  const pct = Math.round(ratio * 100);
  return `<div class="tp-army-warn">
    ⚔ Армия недофинансирована: ${pct}% нормы
    <span class="tp-army-penalty">Боевой штраф: −${Math.round((1-getArmyCombatMult(GAME_STATE.player_nation))*100)}%</span>
  </div>`;
}
```

### Тесты этапа 6

- [ ] `getArmyFundingRatio()` возвращает число от 0 до 1
- [ ] При spending.army = 1.0 и нормальных расходах ratio ≈ 1.0
- [ ] При spending.army = 0.5 ratio ≈ 0.5 → штраф к боевой силе
- [ ] `getArmyCombatMult()` возвращает 1.0 при ratio ≥ 0.80
- [ ] `getArmyCombatMult()` возвращает ≈ 0.85 при ratio = 0
- [ ] Армия с штрафом наносит заметно меньше урона в `resolveBattle()`
- [ ] В казне появляется предупреждение при funding < 80%
- [ ] Нация с полным финансированием не видит предупреждения

---

## Этап 7 — Рост производительности со временем (Улучшение 7)

**Цель:** каждые 120 ходов (10 лет) — +2% к эффективности всех зданий (до +20%).

### Задачи

В `engine/economy_ext.js`:

```javascript
const TECH_DRIFT_INTERVAL = 120;  // каждые 10 лет
const TECH_DRIFT_STEP     = 0.02; // +2% за цикл
const TECH_DRIFT_MAX      = 0.20; // максимум +20%

function updateTechDrift() {
  if (!GAME_STATE.economy_ext) return;
  const turn = GAME_STATE.turn ?? 0;

  if (!GAME_STATE.economy_ext.tech_drift) {
    GAME_STATE.economy_ext.tech_drift = { bonus: 0, last_tick: 0 };
  }
  const td = GAME_STATE.economy_ext.tech_drift;

  if (turn - td.last_tick >= TECH_DRIFT_INTERVAL) {
    if (td.bonus < TECH_DRIFT_MAX) {
      td.bonus    = Math.min(TECH_DRIFT_MAX, td.bonus + TECH_DRIFT_STEP);
      td.last_tick = turn;
      addEconomicEvent(
        `⚒ Ремёсла развились. Производительность зданий: +${Math.round(td.bonus*100)}%`
      );
    }
  }
}

// Получить глобальный мультипликатор технологического дрейфа
function getTechDriftMult() {
  return 1.0 + (GAME_STATE.economy_ext?.tech_drift?.bonus ?? 0);
}
```

Применить в `engine/economy.js` при расчёте производства зданий:
```javascript
const techMult = typeof getTechDriftMult === 'function' ? getTechDriftMult() : 1.0;
buildingProduction *= techMult;
```

Показать в экономической вкладке:
```javascript
function renderTechDrift() {
  const td = GAME_STATE.economy_ext?.tech_drift;
  if (!td || td.bonus < 0.01) return '<div class="eco-tech-none">Начальный уровень</div>';
  const pct = Math.round(td.bonus * 100);
  return `<div class="eco-tech-level">
    ⚒ Уровень ремёсел: +${pct}% к производству зданий
  </div>`;
}
```

Добавить вызов в `runEconomyExtTick()`:
```javascript
updateTechDrift();
```

### Тесты этапа 7

- [ ] `GAME_STATE.economy_ext.tech_drift` инициализируется при первом вызове
- [ ] На ходу 120 `tech_drift.bonus` становится 0.02
- [ ] На ходу 240 `tech_drift.bonus` становится 0.04
- [ ] На ходу 1200 `tech_drift.bonus` не превышает 0.20
- [ ] `getTechDriftMult()` возвращает 1.0 в начале игры
- [ ] `getTechDriftMult()` возвращает 1.10 после 5 циклов
- [ ] Здания производят больше после применения мультипликатора (можно проверить логом)
- [ ] В экономической вкладке отображается текущий уровень ремёсел

---

## Этап 8 — Тултип неорганизованного производства + рефакторинг UI (Улучшение 8)

**Цель:** игрок видит почему регион без зданий производит мало, видит все активные бонусы.

### Задачи

В `ui/economy_tab.js` найти место где отображается производство региона.
Добавить строку об эффективности:

```javascript
function renderRegionProductionEfficiency(region) {
  const hasBuildings = Object.values(region.building_slots ?? {})
    .some(slot => slot && slot.type);

  const specBonus = GAME_STATE.economy_ext?.region_specialization?.[region.id]?.bonus ?? 1.0;
  const techMult  = typeof getTechDriftMult === 'function' ? getTechDriftMult() : 1.0;

  const rows = [];

  if (!hasBuildings) {
    rows.push(`<div class="eco-eff-row eco-eff-warn">
      ⚠ Неорганизованное производство: −35% эффективность
      <span class="eco-eff-hint">Постройте здания для полной отдачи</span>
    </div>`);
  }

  if (specBonus > 1.0) {
    const spec = GAME_STATE.economy_ext.region_specialization[region.id];
    rows.push(`<div class="eco-eff-row eco-eff-pos">
      ⚙ Специализация (${spec.good}, ${spec.streak} ходов): +${Math.round((specBonus-1)*100)}%
    </div>`);
  }

  if (techMult > 1.0) {
    rows.push(`<div class="eco-eff-row eco-eff-pos">
      ⚒ Уровень ремёсел: +${Math.round((techMult-1)*100)}%
    </div>`);
  }

  const cycle = GAME_STATE.economy_ext?.economic_cycle;
  if (cycle && cycle.current !== 'normal') {
    const isGood = cycle.current === 'boom';
    rows.push(`<div class="eco-eff-row ${isGood ? 'eco-eff-pos' : 'eco-eff-neg'}">
      ${isGood ? '🌾' : '🌧'} Экономический цикл: ${isGood ? '+15%' : '−18%'} к зерну
    </div>`);
  }

  return rows.length ? `<div class="eco-eff-block">${rows.join('')}</div>` : '';
}
```

Добавить CSS:
```css
.eco-eff-block { margin: 6px 0; font-size: 11px; }
.eco-eff-row   { padding: 2px 6px; margin: 2px 0; border-radius: 2px; line-height: 1.5; }
.eco-eff-warn  { background: rgba(200,100,0,0.15); color: #cc8844; }
.eco-eff-pos   { background: rgba(0,150,0,0.12);  color: #66cc66; }
.eco-eff-neg   { background: rgba(200,0,0,0.12);  color: #cc6666; }
.eco-eff-hint  { display: block; font-size: 10px; color: #888; margin-top: 1px; }
```

### Тесты этапа 8

- [ ] Регион без зданий показывает предупреждение "−35% эффективность"
- [ ] Регион с зданиями НЕ показывает это предупреждение
- [ ] При специализации streak > 10 показывается бонус специализации
- [ ] При активном экономическом цикле показывается его влияние
- [ ] Тултип не показывает нулевые бонусы
- [ ] CSS-стили применяются корректно (нет сырого HTML)

---

## Этап 9 — Интеграция в торговый поток + отчёт казны ✅ ВЫПОЛНЕНО (этап 9)

**Что сделано в этапе 9:**
- В `ui/treasury-panel.js` добавлена функция `_tpRenderEconomyExtSummary()`,
  которая собирает ВСЕ активные предупреждения/бонусы `economy_ext` в один
  итоговый блок `<div class="tp-eco-summary">` над графиком казны:
  1) **Инфляция** (`≥1%`) — карточка `.tp-eco-warn`, цвет рамки меняется
     от жёлтого (<10%) к красному (≥20%). Текст «⚠ Инфляция: +X% к ценам
     покупки».
  2) **Армия недофинансирована** (`ratio < 0.80`) — карточка `.tp-eco-warn`
     с красной рамкой. Текст «⚔ Армия: X% финансирования → −Y% в бою».
  3) **Монополии игрока** — карточка `.tp-eco-bonus` (зелёная). Список
     локализованных имён товаров через `GOODS[g].name` + «(+20% цена
     продажи)».
  4) **Экономический цикл** (`current ≠ 'normal'`) — карточка
     `.tp-eco-cycle`, цвет рамки зелёный для boom и оранжевый для
     recession. Текст «${label} — ещё N ходов».
- Функция защищена от отсутствия `GAME_STATE`, `player_nation`,
  `economy_ext`: в этих случаях возвращает пустую строку.
- В `_tpRender()` вызов `${_tpRenderEconomyExtSummary()}` добавлен между
  футером панели и `tp-chart-section`, поэтому блок виден на верхнем
  уровне казны без вложенности в торговый баланс.
- Рефакторинг `_tpRenderTradeBalance()`: из функции убраны встроенные
  вызовы `_tpRenderMonopolies / _tpRenderInflation /
  _tpRenderEconomicCycle / _tpRenderArmyFunding` — теперь все эти блоки
  сведены только в новую сводку, чтобы не дублироваться. Сам торговый
  баланс продолжает показывать экспорт/импорт/пошлины/сальдо в колонке
  «Доходы» и рендерится только при наличии торговой активности.
- В `index.html` добавлены CSS-классы:
  `.tp-eco-summary` (контейнер с flex-колонкой, gap 4px, отступы 8×14),
  `.tp-eco-warn` (оранжевая подложка + жёлтая левая рамка),
  `.tp-eco-bonus` (зелёная подложка + оливковая рамка),
  `.tp-eco-cycle` (серая подложка + серая рамка).
  Все три класса не конфликтуют со старыми
  `.tp-trade-mono / .tp-trade-infl / .tp-trade-cycle / .tp-army-warn`,
  которые остались в CSS для обратной совместимости, но больше не
  используются.
- `window._tpRenderEconomyExtSummary` экспортирован для инспекции и
  тестов.

**Тесты этапа 9 (`tests/eco_stage9_treasury_summary_test.cjs`, 40/40 зелёные):**
- `_tpRenderEconomyExtSummary` извлекается из `ui/treasury-panel.js`
  как функция ✓
- Нормальное состояние (нет инфляции, нет штрафов, cycle=normal,
  ratio=1.0, нет монополий) → пустая строка ✓
- Инфляция 12% → выводится обёртка `tp-eco-summary`, карточка
  `tp-eco-warn` с текстом «Инфляция +12%» ✓
- Инфляция 0.4% (< 1%) не попадает в сводку ✓
- Монополии игрока (iron, silk) → карточка `tp-eco-bonus` с
  локализованными именами «Железо, Шёлк»; чужие монополии (horses→egypt)
  не отображаются у игрока ✓
- Монополия только у соперника → пустой результат у игрока ✓
- `current=boom` → карточка `tp-eco-cycle`, выведено «ещё 8 ходов» ✓
- `current=recession` → карточка `tp-eco-cycle` ✓
- `current=normal` → блок цикла не добавляется ✓
- Армия `ratio=0.40` → карточка `tp-eco-warn` с текстом про
  финансирование (40%) и штраф «в бою» ✓
- Армия `ratio=1.0` → блока нет; `ratio=0.80` (на пороге) → блока нет ✓
- Комбинация (инфляция + монополии + цикл + армия) → ровно 4 блока
  (2 × `tp-eco-warn`, 1 × `tp-eco-bonus`, 1 × `tp-eco-cycle`) ✓
- `GAME_STATE=null` / `player_nation=null` / `economy_ext=null` →
  пустая строка (нет `TypeError`) ✓
- Новые классы НЕ используют старые имена
  `tp-trade-mono / tp-trade-infl / tp-trade-cycle` ✓
- Все 4 CSS-класса определены в `index.html` ✓
- `_tpRender()` вызывает `_tpRenderEconomyExtSummary()` ✓
- Тесты этапов 3/4/5/6/7/8 остаются зелёными ✓

**НЕ повторять в новых сессиях.**

---

## Этап 9 — Интеграция в торговый поток + отчёт казны (первоначальная спецификация)

**Цель:** все бонусы сведены в единый отчёт казны; торговый баланс обновляется с монополиями.

### Задачи

В `ui/treasury-panel.js` собрать все новые блоки в одну функцию:

```javascript
function _tpRenderEconomyExtSummary() {
  const nId = GAME_STATE.player_nation;
  const parts = [];

  // Торговый баланс
  if (typeof calcTradeBalance === 'function') {
    parts.push(_tpRenderTradeBalance());
  }

  // Инфляция
  const infl = GAME_STATE.economy_ext?.inflation?.[nId] ?? 0;
  if (infl >= 0.01) {
    const pct = Math.round(infl * 100);
    const col = infl < 0.10 ? '#ccaa00' : infl < 0.20 ? '#cc7700' : '#cc2200';
    parts.push(`<div class="tp-eco-warn" style="border-left-color:${col}">
      ⚠ Инфляция: +${pct}% к ценам покупки
    </div>`);
  }

  // Армия недофинансирована
  if (typeof getArmyFundingRatio === 'function') {
    const ratio = getArmyFundingRatio(nId);
    if (ratio < 0.80) {
      const pen = Math.round((1 - getArmyCombatMult(nId)) * 100);
      parts.push(`<div class="tp-eco-warn" style="border-left-color:#cc4444">
        ⚔ Армия: ${Math.round(ratio*100)}% финансирования → −${pen}% в бою
      </div>`);
    }
  }

  // Монополии
  const monos = Object.entries(GAME_STATE.economy_ext?.monopolies ?? {})
    .filter(([, n]) => n === nId).map(([g]) => g);
  if (monos.length > 0) {
    parts.push(`<div class="tp-eco-bonus">
      ⭐ Монополии: ${monos.join(', ')} (+20% цена продажи)
    </div>`);
  }

  // Экономический цикл
  const cycle = GAME_STATE.economy_ext?.economic_cycle;
  if (cycle && cycle.current !== 'normal') {
    const info = CYCLE_TYPES?.[cycle.current];
    const col  = cycle.current === 'boom' ? '#44cc44' : '#cc6644';
    parts.push(`<div class="tp-eco-cycle" style="border-left-color:${col}">
      ${info?.label ?? cycle.current} — ещё ${cycle.turns_left} ходов
    </div>`);
  }

  return parts.join('');
}
```

CSS:
```css
.tp-eco-warn  { margin: 4px 0; padding: 5px 8px; font-size: 11px;
  background: rgba(200,100,0,0.1); border-left: 2px solid #cc7700;
  border-radius: 2px; color: #cc9966; }
.tp-eco-bonus { margin: 4px 0; padding: 5px 8px; font-size: 11px;
  background: rgba(100,200,0,0.08); border-left: 2px solid #88aa00;
  border-radius: 2px; color: #aacc66; }
.tp-eco-cycle { margin: 4px 0; padding: 5px 8px; font-size: 11px;
  border-left: 2px solid #888; border-radius: 2px; color: #aaa; }
```

### Тесты этапа 9

- [ ] В казне одновременно видны все активные предупреждения/бонусы
- [ ] При нормальной ситуации (нет инфляции, нет штрафов) лишних блоков нет
- [ ] Монополия отображается с перечнем товаров
- [ ] Активный цикл отображается с числом оставшихся ходов
- [ ] Все CSS-классы применяются без конфликтов со старыми стилями

---

## Этап 10 — Финальное тестирование и коммит

**Цель:** убедиться что все 8 улучшений работают вместе и не ломают базовую экономику.

### Полный стресс-тест

Выполнить в консоли браузера:

```javascript
// 1. Проверить инициализацию
console.assert(GAME_STATE.economy_ext !== undefined, 'economy_ext не инициализирован');
console.assert(typeof runEconomyExtTick === 'function', 'runEconomyExtTick не найдена');

// 2. Проверить все функции
const fns = ['calcTradeBalance','detectMonopolies','updateInflation','getInflationMult',
             'getCycleMult','getArmyCombatMult','getTechDriftMult','getArmyFundingRatio'];
fns.forEach(fn => console.assert(typeof window[fn] === 'function', fn + ' не определена'));

// 3. Прогнать 5 экономических тиков
for (let i = 0; i < 5; i++) runEconomyExtTick();

// 4. Проверить данные
const ext = GAME_STATE.economy_ext;
console.log('Trade history:', ext.trade_history.length);
console.log('Inflation:', ext.inflation);
console.log('Monopolies:', ext.monopolies);
console.log('Cycle:', ext.economic_cycle);
console.log('Tech drift:', ext.tech_drift);
```

### Тесты этапа 10

- [ ] Все 8 функций доступны глобально без ошибок
- [ ] 5 тиков проходят без `TypeError` или `ReferenceError`
- [ ] `trade_history` содержит записи после тиков
- [ ] `inflation` — число от 0 до 0.25 для каждой нации
- [ ] `economic_cycle.current` — строка ('normal'/'boom'/'recession')
- [ ] `tech_drift.bonus` — число от 0 до 0.20
- [ ] Базовый `runEconomyTick()` работает как до изменений (тест: доход считается правильно)
- [ ] Сохранение/загрузка игры сохраняет `economy_ext` корректно
- [ ] Нет утечек памяти: `trade_history` не растёт бесконечно (ограничена 24 записями)
- [ ] Открытие панели казны не выдаёт ошибок в консоли

---

## Сводная таблица этапов

| Этап | Что реализуется | Улучшение | Файлы |
|------|-----------------|-----------|-------|
| 1 ✅ | Каркас `economy_ext.js` + торговый баланс | 1 | economy_ext.js, treasury-panel.js |
| 2 ✅ | Монопольный бонус к цене и дипломатии | 2 | economy_ext.js, economy_tab.js |
| 3 ✅ | Специализация региона (+5% за 10 ходов) | 3 | economy_ext.js, economy.js |
| 4 ✅ | Инфляция от переполненной казны | 4 | economy_ext.js, buildings.js, treasury-panel.js |
| 5 ✅ | Экономические циклы (бум/спад) | 5 | economy_ext.js, economy.js |
| 6 ✅ | Штраф армии при недофинансировании | 6 | economy_ext.js, combat.js |
| 7 ✅ | Технологический дрейф (+2% за 10 лет) | 7 | economy_ext.js, economy.js |
| 8 ✅ | Тултипы эффективности в UI | 8 | economy_ext.js, economy_react.jsx, index.html |
| 9 ✅ | Итоговый блок казны со всеми бонусами | — | treasury-panel.js, index.html |
| 10 | Финальное тестирование | — | все файлы |

## Правила для каждой сессии

1. Читать файл перед изменением (не писать наугад)
2. Реализовывать только свой этап
3. Не трогать `engine/loans.js`, `engine/super_ou.js`, `engine/turn.js` без необходимости
4. Все новые функции добавлять в `engine/economy_ext.js`, а не в существующие файлы
5. Пройти чеклист тестов до коммита
6. Коммит: `git commit -m "economy: этап N — [название]"`
7. Пуш: `git push -u origin claude/historical-population-distribution-euy06`
