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

## Улучшение 1: Торговый баланс (видимость)

**Суть:** Показать игроку сколько золота приходит и уходит через торговлю за ход.
**Сложность:** Только UI — логика уже есть в market.js.
**Файлы:** `ui/treasury-panel.js`, `engine/economy_ext.js`

---

## Улучшение 2: Монопольный бонус

**Суть:** Единственный производитель стратегического товара получает +20% к цене продажи и +5 к дипломатии с импортёрами.
**Сложность:** Низкая — проверка в конце `runEconomyTick()`.
**Файлы:** `engine/economy_ext.js`, `data/goods_meta.js`

---

## Улучшение 3: Специализация региона

**Суть:** Регион производящий один товар 10+ ходов без перебоев получает +5% эффективности (до +25%). Сброс при смене или дефиците.
**Сложность:** Средняя — новое поле в регионе.
**Файлы:** `engine/economy_ext.js`, `engine/economy.js`

---

## Улучшение 4: Инфляция от переполненной казны

**Суть:** Казна > 3× месячного дохода → внутренние цены растут +1–2%/ход (до +25%). Мотивирует тратить деньги на развитие.
**Сложность:** Средняя — мультипликатор цен.
**Файлы:** `engine/economy_ext.js`, `engine/market.js`

---

## Улучшение 5: Экономические циклы

**Суть:** Раз в 48–72 хода — рандомный глобальный сдвиг: урожайный год (+15% зерно) или голодный (−15%). Длится 6–12 ходов.
**Сложность:** Низкая — один таймер и мультипликатор.
**Файлы:** `engine/economy_ext.js`

---

## Улучшение 6: Усталость армии от недофинансирования

**Суть:** Если расходы на армию < 80% нормы → боевая эффективность ×0.85. Связь экономики и военной силы.
**Сложность:** Низкая — одна строка в боевой формуле.
**Файлы:** `engine/economy_ext.js`, `engine/armies.js` или `engine/combat.js`

---

## Улучшение 7: Рост производительности со временем

**Суть:** Каждые 120 ходов (10 лет) — пассивный прирост +2% к эффективности всех зданий (до +20% за 100 лет). Отражает развитие ремёсел.
**Сложность:** Низкая — глобальный мультипликатор.
**Файлы:** `engine/economy_ext.js`

---

## Улучшение 8: Тултип неорганизованного производства

**Суть:** В экономической вкладке показывать "65% эффективность (нет зданий)" чтобы игрок понимал почему производство низкое.
**Сложность:** Минимальная — только UI.
**Файлы:** `ui/economy_tab.js`

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

## Этап 9 — Интеграция в торговый поток + отчёт казны

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
| 1 | Каркас `economy_ext.js` + торговый баланс | 1 | economy_ext.js, treasury-panel.js |
| 2 | Монопольный бонус к цене и дипломатии | 2 | economy_ext.js, economy_tab.js |
| 3 | Специализация региона (+5% за 10 ходов) | 3 | economy_ext.js, economy.js |
| 4 | Инфляция от переполненной казны | 4 | economy_ext.js, market.js |
| 5 | Экономические циклы (бум/спад) | 5 | economy_ext.js, economy.js |
| 6 | Штраф армии при недофинансировании | 6 | economy_ext.js, combat.js |
| 7 | Технологический дрейф (+2% за 10 лет) | 7 | economy_ext.js, economy.js |
| 8 | Тултипы эффективности в UI | 8 | economy_tab.js |
| 9 | Итоговый блок казны со всеми бонусами | — | treasury-panel.js |
| 10 | Финальное тестирование | — | все файлы |

## Правила для каждой сессии

1. Читать файл перед изменением (не писать наугад)
2. Реализовывать только свой этап
3. Не трогать `engine/loans.js`, `engine/super_ou.js`, `engine/turn.js` без необходимости
4. Все новые функции добавлять в `engine/economy_ext.js`, а не в существующие файлы
5. Пройти чеклист тестов до коммита
6. Коммит: `git commit -m "economy: этап N — [название]"`
7. Пуш: `git push -u origin claude/historical-population-distribution-euy06`
