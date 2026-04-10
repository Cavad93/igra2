# Тактический режим боя — план реализации за 20 сессий

## Контекст проекта

**Стек:** vanilla JS, Canvas 2D, без фреймворков.
**Основной файл:** `index.html`
**Движок армий:** `engine/armies.js` — содержит `resolveBattle(attacker, defender, region)`
**Движок боя:** `engine/battle.js`, `engine/combat.js`
**Существующие типы юнитов:** `infantry`, `cavalry`, `archers`
**Существующие формации:** `standard`, `aggressive`, `defensive`, `flanking`, `siege`
**Существующие типы местности:** `plains`, `hills`, `mountains`, `river_valley`, `coastal_city`
**Командиры:** `army.commander` с полями `skills[]`, `personality`
**Текущий бой:** автоматический, результат — `showBattleResult(r)` в `ui/battle_result.js`

## Файлы к созданию

| Файл | Назначение |
|------|-----------|
| `engine/tactical_battle.js` | Логика тактического боя |
| `ui/tactical_map.js` | Canvas-рендер и UI |
| CSS в `index.html` | Стили оверлея |

## Точка интеграции

В `engine/armies.js` найти вызов `resolveBattle()` и добавить перехват:
если армия принадлежит игроку (`atk.nation_id === GAME_STATE.player_nation`) —
показать модальное окно выбора режима вместо автоматического расчёта.

## 10 улучшений которые реализуются

1. **Тактическая карта боя** — Canvas-поле 22×16 клеток, юниты квадратиками, пошаговое управление
2. **Боеприпасы стрелков** — 30 зарядов, штраф при истощении, переход в рукопашную
3. **Рельеф и высота** — возвышенные клетки (hills 25%, mountains 40%), боевые бонусы
4. **Фланговая атака** — определение направления атаки, урон ×1.4/×1.7, визуальная стрелка
5. **Паника и бегство** — routing при морали ≤20, эффект домино, остановка командиром
6. **Командир на поле** — отдельный юнит, аура +15 морали, гибель = -30 армии, засада
7. **Усталость от марша** — начальная усталость если маршировал, нарастает в бою
8. **Резерв** — зона отдыха, юниты не получают урон, ввод в нужный момент
9. **Захват стандарта** — занять клетку командира врага = мгновенная победа
10. **Отступление** — расчёт выживших по степени окружения (12–68%)

## 4 визуальных подхода для отображения силы юнита

1. **Сетка иконок солдат** внутри квадрата — больше точек = больше войск
2. **Размер квадрата** — 28–52px в зависимости от силы
3. **Цвет и яркость** — насыщеннее/ярче = сильнее, полупрозрачный = слабый/routing
4. **Полоска силы** под квадратом — зелёная→жёлтая→красная

---

## Этап 1 — Каркас файлов и HTML-структура оверлея

**Цель:** создать пустые файлы, подключить их, нарисовать оверлей без логики.

### Задачи

1. Создать `engine/tactical_battle.js` с константами:
```javascript
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const CELL_SIZE = 40;
const UNIT_BASE_SIZE = 400;
const RESERVE_ZONE_COLS = 3;
```

2. Создать `ui/tactical_map.js` с одной функцией-заглушкой `openTacticalMap()`.

3. В `index.html` добавить перед `</body>`:
```html
<script src="engine/tactical_battle.js"></script>
<script src="ui/tactical_map.js"></script>
```

4. В `index.html` в тег `<style>` добавить CSS оверлея:

```css
#tactical-overlay {
  position: fixed; inset: 0;
  background: #080808;
  z-index: 9000;
  display: none;
  flex-direction: column;
}
#tactical-overlay.visible { display: flex; }
#tactical-canvas { flex: 1; display: block; cursor: crosshair; }
#tactical-top-bar {
  height: 34px; background: #111; color: #aaa;
  display: flex; align-items: center; gap: 24px;
  padding: 0 14px; font-size: 12px;
  border-bottom: 1px solid #2a2a2a; flex-shrink: 0;
}
#tactical-bottom-bar {
  height: 46px; background: #111;
  border-top: 1px solid #2a2a2a;
  display: flex; align-items: center; gap: 10px;
  padding: 0 14px; flex-shrink: 0;
}
#tactical-bottom-bar button {
  padding: 5px 14px; background: #1a1a1a;
  border: 1px solid #444; color: #ccc;
  border-radius: 2px; cursor: pointer; font-size: 12px;
}
#tactical-bottom-bar button:hover { background: #252525; }
#tac-btn-next    { border-color: #2a7a2a; color: #88ee88; }
#tac-btn-retreat { border-color: #7a2a2a; color: #ee8888; }
#tactical-unit-panel {
  position: absolute; top: 42px; left: 6px;
  width: 176px; background: rgba(8,8,8,0.90);
  border: 1px solid #383838; border-radius: 3px;
  padding: 10px; color: #ccc; font-size: 12px;
  display: none; line-height: 1.5;
}
#tactical-log {
  position: absolute; bottom: 54px; right: 6px;
  width: 250px; background: rgba(8,8,8,0.82);
  border: 1px solid #2a2a2a; border-radius: 3px;
  padding: 6px; font-size: 11px; color: #aaa;
  max-height: 130px; overflow: hidden;
}
.tac-log-entry { padding: 2px 0; border-bottom: 1px solid #1e1e1e; line-height: 1.4; }
.tac-log-entry:first-child { color: #ddd; }
#tac-tooltip {
  position: fixed; background: rgba(0,0,0,0.88);
  border: 1px solid #444; color: #ccc;
  font-size: 11px; padding: 5px 8px; border-radius: 3px;
  pointer-events: none; white-space: pre; z-index: 9100; display: none;
}
```

5. В `index.html` в `<body>` добавить HTML оверлея:
```html
<div id="tactical-overlay">
  <div id="tactical-top-bar">
    <span id="tac-turn">Ход 1</span>
    <span id="tac-terrain"></span>
    <span id="tac-ratio"></span>
  </div>
  <canvas id="tactical-canvas"></canvas>
  <div id="tactical-unit-panel">
    <div id="tup-name"></div>
    <div id="tup-strength"></div>
    <div class="tup-bar-wrap"><div id="tup-morale"  class="tup-bar-fill tup-morale"></div></div>
    <div class="tup-bar-wrap"><div id="tup-fatigue" class="tup-bar-fill tup-fatigue"></div></div>
    <div id="tup-ammo"></div>
    <div id="tup-elevation-hint"></div>
    <div id="tup-formation-btns"></div>
    <div id="tup-reserve-btn"></div>
    <div id="tup-ambush-btn"></div>
  </div>
  <div id="tactical-bottom-bar">
    <button id="tac-btn-next">⏭ Следующий ход</button>
    <button id="tac-btn-retreat">🏃 Отступить</button>
    <button id="tac-btn-auto">⚡ Авторассчёт</button>
  </div>
  <div id="tactical-log"></div>
  <div id="tac-tooltip"></div>
</div>
```

### Тесты этапа 1

- [ ] `engine/tactical_battle.js` подключается без ошибок в консоли
- [ ] `ui/tactical_map.js` подключается без ошибок в консоли
- [ ] `openTacticalMap()` вызывается из консоли браузера без `ReferenceError`
- [ ] В DevTools → Elements виден `#tactical-overlay` с `display:none`
- [ ] Вручную в консоли: `document.getElementById('tactical-overlay').classList.add('visible')` — оверлей показывается чёрным экраном с тремя кнопками снизу
- [ ] Кнопки "Следующий ход", "Отступить", "Авторассчёт" видны и не вызывают ошибок при клике (функции-заглушки)

---

## Этап 2 — Рендер сетки и фон местности

**Цель:** Canvas рисует сетку 22×16, фон зависит от типа местности.

### Задачи

В `ui/tactical_map.js` реализовать:

```javascript
function renderGrid(ctx, terrain, elevatedCells = new Set()) {
  const W = TACTICAL_GRID_COLS * CELL_SIZE;
  const H = TACTICAL_GRID_ROWS * CELL_SIZE;

  // Цвет фона по местности
  const bgColor = {
    plains:       '#2a4418',
    hills:        '#3a3018',
    mountains:    '#282830',
    river_valley: '#1a2830',
    coastal_city: '#1a2828'
  }[terrain] ?? '#2a3020';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Возвышенные клетки
  ctx.fillStyle = 'rgba(255,255,200,0.08)';
  for (const key of elevatedCells) {
    const [ex, ey] = key.split(',').map(Number);
    ctx.fillRect(ex * CELL_SIZE, ey * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  // Зоны резерва
  ctx.fillStyle = 'rgba(100,200,100,0.05)';
  ctx.fillRect(0, 0, RESERVE_ZONE_COLS * CELL_SIZE, H);
  ctx.fillStyle = 'rgba(200,80,80,0.05)';
  ctx.fillRect((TACTICAL_GRID_COLS - RESERVE_ZONE_COLS) * CELL_SIZE, 0,
               RESERVE_ZONE_COLS * CELL_SIZE, H);

  // Подписи зон резерва
  ctx.fillStyle = 'rgba(100,200,100,0.25)';
  ctx.font = '10px monospace';
  ctx.fillText('РЕЗЕРВ', 4, 14);
  ctx.fillStyle = 'rgba(200,80,80,0.25)';
  ctx.fillText('РЕЗЕРВ', (TACTICAL_GRID_COLS - RESERVE_ZONE_COLS) * CELL_SIZE + 4, 14);

  // Линии сетки
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= TACTICAL_GRID_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, H);
    ctx.stroke();
  }
  for (let y = 0; y <= TACTICAL_GRID_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(W, y * CELL_SIZE);
    ctx.stroke();
  }
}
```

В `openTacticalMap()` инициализировать Canvas и вызвать `renderGrid`:
```javascript
function openTacticalMap(atkArmy, defArmy, region) {
  const overlay = document.getElementById('tactical-overlay');
  const canvas  = document.getElementById('tactical-canvas');
  overlay.classList.add('visible');
  canvas.width  = TACTICAL_GRID_COLS * CELL_SIZE;
  canvas.height = TACTICAL_GRID_ROWS * CELL_SIZE;
  const ctx = canvas.getContext('2d');
  renderGrid(ctx, region?.terrain ?? 'plains');
  document.getElementById('tac-terrain').textContent =
    region?.name ?? 'Неизвестная местность';
}
```

### Тесты этапа 2

- [ ] `openTacticalMap({}, {}, { terrain: 'plains', name: 'Равнина' })` — зелёный фон с сеткой
- [ ] `openTacticalMap({}, {}, { terrain: 'mountains', name: 'Горы' })` — тёмно-синий фон
- [ ] `openTacticalMap({}, {}, { terrain: 'hills', name: 'Холмы' })` — коричневый фон
- [ ] Видны 22×16 линий сетки
- [ ] Две зоны резерва (левая зелёная, правая красная) с подписями "РЕЗЕРВ"
- [ ] Canvas размер точно 880×640px (22×40 и 16×40)
- [ ] При закрытии и повторном открытии Canvas перерисовывается корректно

---

## Этап 3 — Разбивка армии на тактические юниты

**Цель:** функция `initTacticalBattle()` делит армии на юниты и расставляет на карте.

### Задачи

В `engine/tactical_battle.js` реализовать:

```javascript
// Структура юнита — создаётся через эту функцию
function createUnit(id, side, type, strength, gridX, gridY, extra = {}) {
  return {
    id, side, type,
    strength,
    maxStrength: strength,
    morale: 80,
    fatigue: 0,
    ammo: type === 'archers' ? 30 : 0,
    isRouting: false,
    isReserve: false,
    isCommander: false,
    gridX, gridY,
    moveSpeed: type === 'cavalry' ? 4 : 2,
    formation: 'standard',
    selected: false,
    ...extra
  };
}

function initTacticalBattle(atkArmy, defArmy, region) {
  const playerUnits = [];
  const enemyUnits  = [];

  // Разбить армию на юниты
  function splitArmy(army, side) {
    const units = [];
    const inf = army.infantry || 0;
    const cav = army.cavalry  || 0;
    const arc = army.archers  || 0;
    const total = inf + cav + arc;
    if (total === 0) return units;

    const maxUnits = MAX_UNITS_PER_SIDE - 1; // -1 для командира
    const baseCount = Math.min(maxUnits, Math.max(1, Math.ceil(total / 500)));

    // Пропорциональное распределение типов
    const types = [];
    const infUnits = Math.max(inf > 0 ? 1 : 0, Math.round(baseCount * inf / total));
    const cavUnits = Math.max(cav > 0 ? 1 : 0, Math.round(baseCount * cav / total));
    const arcUnits = Math.max(arc > 0 ? 1 : 0, baseCount - infUnits - cavUnits);

    for (let i = 0; i < infUnits; i++) types.push(['infantry', Math.floor(inf / infUnits)]);
    for (let i = 0; i < cavUnits; i++) types.push(['cavalry',  Math.floor(cav / cavUnits)]);
    for (let i = 0; i < arcUnits; i++) types.push(['archers',  Math.floor(arc / (arcUnits||1))]);

    // Расстановка: игрок — колонки 4–8, враг — 14–18
    const startX  = side === 'player' ? 4 : 14;
    const centerY = Math.floor(TACTICAL_GRID_ROWS / 2);

    types.forEach(([type, str], i) => {
      if (str <= 0) return;
      const gridY = centerY - Math.floor(types.length / 2) + i;
      units.push(createUnit(`${side}_${type}_${i}`, side, type, str,
        startX + (side === 'player' ? 0 : 2), gridY));
    });

    // Командир
    const cmdX = side === 'player' ? 5 : 16;
    const cmdY = centerY;
    const cmdUnit = createUnit(`${side}_cmd`, side, 'infantry', 50, cmdX, cmdY, {
      isCommander: true,
      moveSpeed: 3,
      commander: army.commander || null
    });
    units.push(cmdUnit);

    return units;
  }

  playerUnits.push(...splitArmy(atkArmy, 'player'));
  enemyUnits.push(...splitArmy(defArmy, 'enemy'));

  const maxStrength = Math.max(
    ...playerUnits.map(u => u.maxStrength),
    ...enemyUnits.map(u => u.maxStrength)
  );

  return {
    playerUnits,
    enemyUnits,
    region,
    terrain: region?.terrain ?? 'plains',
    elevatedCells: new Set(),
    turn: 0,
    phase: 'battle',
    log: [],
    atkArmy,
    defArmy,
    maxStrengthInBattle: maxStrength,
    ambushUsed: false,
    selectedUnitId: null
  };
}
```

### Тесты этапа 3

- [ ] `initTacticalBattle({ infantry:1000 }, { infantry:500 }, { terrain:'plains' })` возвращает объект с `playerUnits` и `enemyUnits`
- [ ] Армия 1000 пехоты → 2–3 юнита пехоты + 1 командир
- [ ] Армия 100 000 солдат → не более 20 юнитов на сторону
- [ ] Армия 50 смешанная (inf+cav+arc) → юниты разных типов
- [ ] Все юниты имеют поля: `strength`, `maxStrength`, `morale`, `fatigue`, `gridX`, `gridY`
- [ ] У archer-юнитов `ammo === 30`
- [ ] У infantry/cavalry юнитов `ammo === 0`
- [ ] Ровно 1 юнит с `isCommander:true` на каждую сторону
- [ ] `maxStrengthInBattle` равно максимальному `strength` среди всех юнитов
- [ ] Юниты игрока: `gridX` в диапазоне 4–8
- [ ] Юниты врага: `gridX` в диапазоне 14–18

---

## Этап 4 — Рендер юнита: размер и цвет (Подходы 2 и 3)

**Цель:** каждый квадрат на Canvas имеет правильный размер и цвет в зависимости от силы.

### Задачи

В `ui/tactical_map.js` реализовать базовый рендер юнита:

```javascript
const UNIT_MIN_SZ = 26;
const UNIT_MAX_SZ = 52;

function renderUnit(ctx, unit, battleState) {
  const cellX = unit.gridX * CELL_SIZE;
  const cellY = unit.gridY * CELL_SIZE;

  // Подход 2: размер зависит от силы
  const ratio = Math.min(1, unit.strength / battleState.maxStrengthInBattle);
  const sz = UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
  const px = cellX + (CELL_SIZE - sz) / 2;
  const py = cellY + (CELL_SIZE - sz) / 2;

  // Подход 3: цвет и яркость
  const isPlayer = unit.side === 'player';
  const strPct   = unit.strength / unit.maxStrength;
  const fillColor = isPlayer ? '#1a4a9e' : '#8b1a1a';
  const borderColor = unit.isCommander     ? '#ffd700'
                    : unit.strength > 5000 ? '#e8c840'
                    : unit.isRouting       ? '#555555'
                    : isPlayer             ? '#4488dd'
                    :                        '#dd5533';

  ctx.globalAlpha = unit.isReserve ? 0.50
                  : unit.isRouting  ? 0.35
                  :                   0.45 + 0.55 * strPct;

  ctx.fillStyle = fillColor;
  ctx.fillRect(px, py, sz, sz);

  ctx.globalAlpha = unit.isRouting ? 0.4 : 1.0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = unit.isCommander ? 2.5 : 1.5;
  if (unit.isReserve) ctx.setLineDash([4, 3]);
  ctx.strokeRect(px, py, sz, sz);
  ctx.setLineDash([]);

  // Иконка типа в центре
  const icon = { infantry: '⚔', cavalry: '🐴', archers: '🏹' }[unit.type] ?? '⚔';
  ctx.globalAlpha = unit.isRouting ? 0.5 : 1.0;
  ctx.font      = `bold ${Math.max(10, sz * 0.28 | 0)}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(icon, px + sz / 2, py + sz / 2 + 5);

  if (unit.isCommander) {
    ctx.font      = `${Math.max(10, sz * 0.28 | 0)}px monospace`;
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText('★', px + sz - 2, py + 12);
  }

  if (unit.selected) {
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(px - 3, py - 3, sz + 6, sz + 6);
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = 1.0;
  ctx.textAlign   = 'left';
}

function redrawAll(ctx, battleState) {
  renderGrid(ctx, battleState.terrain, battleState.elevatedCells);
  for (const u of battleState.playerUnits) renderUnit(ctx, u, battleState);
  for (const u of battleState.enemyUnits)  renderUnit(ctx, u, battleState);
}
```

Обновить `openTacticalMap()` чтобы вызывать `redrawAll` после `initTacticalBattle`.

### Тесты этапа 4

- [ ] Открыть тактическую карту — видны синие (игрок) и красные (враг) квадраты
- [ ] Юнит 5000 солдат визуально БОЛЬШЕ юнита 500 солдат
- [ ] Командир обведён золотой рамкой и имеет звезду ★
- [ ] Routing-юнит (вручную `unit.isRouting=true`) выглядит полупрозрачным и серым
- [ ] Резервный юнит (вручную `unit.isReserve=true`) выглядит полупрозрачным с пунктирной рамкой
- [ ] Юнит силой > 5000 имеет золотистую обводку
- [ ] `redrawAll()` вызывается без ошибок с любым battleState

---

## Этап 5 — Сетка иконок солдат внутри квадрата (Подход 1) и полоски (Подход 4)

**Цель:** внутри каждого квадрата видны точки-солдаты; под квадратом — полоска силы и морали.

### Задачи

Добавить в функцию `renderUnit()` после рисования квадрата:

```javascript
// Подход 1: сетка иконок солдат
const DOT_SIZE  = 3;
const DOT_MAX   = 25;
const dotCount  = Math.min(DOT_MAX, Math.max(1, Math.round(unit.strength / UNIT_BASE_SIZE)));
const dotCols   = Math.ceil(Math.sqrt(dotCount));
const dotRows   = Math.ceil(dotCount / dotCols);
const gapX      = sz / (dotCols + 1);
const gapY      = (sz * 0.65) / (dotRows + 1); // верхние 65% — под точки

ctx.fillStyle   = '#ffffff';
ctx.globalAlpha = unit.isRouting ? 0.2 : 0.80;
for (let r = 0; r < dotRows; r++) {
  for (let c = 0; c < dotCols; c++) {
    if (r * dotCols + c >= dotCount) break;
    ctx.fillRect(
      px + gapX * (c + 1) - DOT_SIZE / 2,
      py + gapY * (r + 1) - DOT_SIZE / 2,
      DOT_SIZE, DOT_SIZE
    );
  }
}

// Число солдат под иконкой
ctx.globalAlpha = unit.isRouting ? 0.4 : 1.0;
ctx.font      = `${Math.max(8, sz * 0.16 | 0)}px monospace`;
ctx.fillStyle = '#cccccc';
ctx.textAlign = 'center';
const label = unit.strength >= 1000
  ? (unit.strength / 1000).toFixed(1) + 'k'
  : unit.strength.toString();
ctx.fillText(label, px + sz / 2, py + sz * 0.94);

// Подход 4: полоска силы
const strPct2  = unit.strength / unit.maxStrength;
const barColor = strPct2 > 0.6 ? '#44dd44' : strPct2 > 0.3 ? '#ddaa00' : '#dd2222';
ctx.globalAlpha = 0.85;
ctx.fillStyle   = '#222222';
ctx.fillRect(px, py + sz + 3, sz, 4);
ctx.fillStyle   = barColor;
ctx.fillRect(px, py + sz + 3, sz * strPct2, 4);

// Полоска морали (тонкая синяя над квадратом)
ctx.fillStyle   = '#222222';
ctx.fillRect(px, py - 6, sz, 3);
ctx.fillStyle   = '#4488ff';
ctx.fillRect(px, py - 6, sz * (unit.morale / 100), 3);
ctx.globalAlpha = 1.0;
```

### Тесты этапа 5

- [ ] Юнит 400 солдат → 1 точка внутри квадрата
- [ ] Юнит 2000 солдат → ~5 точек (2×2 или 2×3)
- [ ] Юнит 10 000 солдат → 25 точек (5×5)
- [ ] Число отображается: `400`, `2.0k`, `10.0k`
- [ ] Полоска силы под квадратом зелёная при >60% силы
- [ ] Полоска силы жёлтая при 30–60%, красная при <30%
- [ ] Полоска морали синяя над квадратом, пропорциональна morale/100
- [ ] Вручную снизить `unit.morale = 30` — полоска морали заметно укоротилась
- [ ] Вручную снизить `unit.strength` до 20% — полоска силы красная, квадрат мельче
- [ ] Точки хорошо видны на фоне цветного квадрата (контраст достаточный)

---

## Этап 6 — Управление мышью: выбор и перемещение юнитов

**Цель:** игрок кликает на свой юнит → выбирает его; кликает на пустую клетку → перемещает.

### Задачи

В `ui/tactical_map.js`:

```javascript
let _battleState = null;
let _canvas      = null;
let _ctx         = null;

function findUnitAt(gridX, gridY, bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.gridX === gridX && u.gridY === gridY && u.strength > 0) ?? null;
}

function selectUnit(unit, bs) {
  [...bs.playerUnits, ...bs.enemyUnits].forEach(u => u.selected = false);
  if (unit) { unit.selected = true; bs.selectedUnitId = unit.id; }
  else       { bs.selectedUnitId = null; }
  updateUnitPanel(unit, bs);
}

function getSelectedUnit(bs) {
  return [...bs.playerUnits, ...bs.enemyUnits]
    .find(u => u.id === bs.selectedUnitId) ?? null;
}

function isCellFree(gridX, gridY, bs) {
  return !findUnitAt(gridX, gridY, bs);
}

function onTacticalClick(e) {
  if (!_battleState || !_canvas) return;
  const rect  = _canvas.getBoundingClientRect();
  const gridX = Math.floor((e.clientX - rect.left)  / CELL_SIZE);
  const gridY = Math.floor((e.clientY - rect.top)   / CELL_SIZE);
  if (gridX < 0 || gridX >= TACTICAL_GRID_COLS) return;
  if (gridY < 0 || gridY >= TACTICAL_GRID_ROWS) return;

  const clicked = findUnitAt(gridX, gridY, _battleState);
  const selected = getSelectedUnit(_battleState);

  if (!selected) {
    // Выбрать свой юнит
    if (clicked?.side === 'player') selectUnit(clicked, _battleState);
  } else if (clicked?.side === 'player') {
    // Переключить выбор на другой свой юнит
    selectUnit(clicked, _battleState);
  } else if (!clicked) {
    // Переместить если в радиусе moveSpeed
    const dist = Math.abs(gridX - selected.gridX) + Math.abs(gridY - selected.gridY);
    if (dist <= selected.moveSpeed && isCellFree(gridX, gridY, _battleState)) {
      selected.gridX = gridX;
      selected.gridY = gridY;
      addLog(_battleState, `Юнит перемещён на (${gridX},${gridY})`);
    }
  } else if (clicked?.side === 'enemy') {
    // Атака — будет реализована в Этапе 8
    addLog(_battleState, `Атака врага запланирована (Этап 8)`);
  }

  redrawAll(_ctx, _battleState);
}

function onTacticalHover(e) {
  if (!_battleState || !_canvas) return;
  const rect  = _canvas.getBoundingClientRect();
  const gridX = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const gridY = Math.floor((e.clientY - rect.top)  / CELL_SIZE);
  const unit  = findUnitAt(gridX, gridY, _battleState);
  const key   = `${gridX},${gridY}`;
  const isElev = _battleState.elevatedCells.has(key);
  const tip   = document.getElementById('tac-tooltip');
  if (!tip) return;

  if (unit) {
    tip.style.display = 'block';
    tip.style.left    = (e.clientX + 12) + 'px';
    tip.style.top     = (e.clientY + 12) + 'px';
    tip.textContent   =
      `${unit.type} | ${unit.strength.toLocaleString()} чел.\n` +
      `Мораль: ${unit.morale} | Усталость: ${unit.fatigue}\n` +
      (unit.type === 'archers' ? `Боеприпасы: ${unit.ammo}/30\n` : '') +
      (isElev ? '⛰ Возвышенность: +15% защита' : '');
  } else if (isElev) {
    tip.style.display = 'block';
    tip.style.left    = (e.clientX + 12) + 'px';
    tip.style.top     = (e.clientY + 12) + 'px';
    tip.textContent   = '⛰ Возвышенность: +15% защита, +1 дальность лучникам';
  } else {
    tip.style.display = 'none';
  }
}
```

Добавить в `openTacticalMap()`:
```javascript
_canvas = document.getElementById('tactical-canvas');
_canvas.addEventListener('click',     onTacticalClick);
_canvas.addEventListener('mousemove', onTacticalHover);
```

Функция лога:
```javascript
function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
  if (bs.log.length > 20) bs.log.pop();
  const el = document.getElementById('tactical-log');
  if (el) el.innerHTML = bs.log.slice(0, 6)
    .map(e => `<div class="tac-log-entry">${e.text}</div>`).join('');
}
```

### Тесты этапа 6

- [ ] Клик по синему квадрату → вокруг него белая пунктирная рамка (выбран)
- [ ] Клик по пустой соседней клетке → юнит перемещается туда
- [ ] Клик на клетку дальше чем `moveSpeed` (2 для пехоты) → юнит не двигается
- [ ] Клик на занятую клетку → юнит не двигается
- [ ] Hover на юнит → tooltip с числом солдат, моралью, усталостью
- [ ] Hover на пустую клетку → tooltip исчезает
- [ ] Лог внизу справа обновляется при каждом действии
- [ ] Кавалерия (`moveSpeed=4`) перемещается на 4 клетки за ход

---

## Этап 7 — Панель выбранного юнита и кнопки формаций

**Цель:** при выборе юнита слева появляется панель с детальной информацией и кнопками.

### Задачи

В `ui/tactical_map.js`:

```javascript
const FORMATION_LABELS = {
  standard:  'Строй',
  aggressive:'Атака',
  defensive: 'Оборона',
  flanking:  'Охват',
  siege:     'Осада'
};

function updateUnitPanel(unit, bs) {
  const panel = document.getElementById('tactical-unit-panel');
  if (!panel) return;

  if (!unit || unit.side !== 'player') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  document.getElementById('tup-name').textContent =
    (unit.isCommander ? '★ Командир' : FORMATION_LABELS[unit.type] ?? unit.type)
    + ` (${unit.side === 'player' ? 'Свои' : 'Враги'})`;

  document.getElementById('tup-strength').textContent =
    `${unit.strength.toLocaleString()} / ${unit.maxStrength.toLocaleString()} чел.`;

  const moraleEl  = document.getElementById('tup-morale');
  const fatigueEl = document.getElementById('tup-fatigue');
  if (moraleEl)  moraleEl.style.width  = unit.morale  + '%';
  if (fatigueEl) fatigueEl.style.width = unit.fatigue + '%';

  const ammoEl = document.getElementById('tup-ammo');
  if (ammoEl) {
    ammoEl.textContent = unit.type === 'archers'
      ? (unit.ammo > 0 ? `🏹 ${unit.ammo}/30 зарядов` : '🏹 Стрелы кончились')
      : '';
  }

  const elevEl = document.getElementById('tup-elevation-hint');
  if (elevEl) {
    const key = `${unit.gridX},${unit.gridY}`;
    elevEl.textContent = bs.elevatedCells.has(key)
      ? '⛰ На возвышенности (+15% защита)' : '';
  }

  // Кнопки формаций
  const fbtns = document.getElementById('tup-formation-btns');
  if (fbtns) {
    fbtns.innerHTML = Object.entries(FORMATION_LABELS)
      .map(([f, label]) =>
        `<button class="tup-form-btn${unit.formation===f?' active':''}"
         onclick="_setFormation('${unit.id}','${f}')">${label}</button>`)
      .join('');
  }

  // Кнопка резерва
  const resBtn = document.getElementById('tup-reserve-btn');
  if (resBtn) {
    resBtn.innerHTML = unit.isReserve
      ? `<button onclick="_withdrawReserve('${unit.id}')">⚔ В бой!</button>`
      : `<button onclick="_sendReserve('${unit.id}')">🛡 В резерв</button>`;
  }
}

function _setFormation(unitId, formation) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (unit) { unit.formation = formation; updateUnitPanel(unit, _battleState); redrawAll(_ctx, _battleState); }
}
```

Добавить CSS в `index.html`:
```css
.tup-bar-wrap { height: 5px; background: #2a2a2a; border-radius: 2px; margin: 3px 0; }
.tup-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.tup-morale   { background: #3a9a3a; }
.tup-fatigue  { background: #cc8822; }
.tup-formation-btns { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 8px; }
.tup-form-btn { font-size: 10px; padding: 2px 5px; background: #1a1a1a;
  border: 1px solid #3a3a3a; color: #999; border-radius: 2px; cursor: pointer; }
.tup-form-btn:hover  { background: #252525; }
.tup-form-btn.active { border-color: #c8a000; color: #ffd700; }
#tup-reserve-btn button { width: 100%; margin-top: 6px; padding: 4px;
  background: #1a1a1a; border: 1px solid #444; color: #bbb;
  border-radius: 2px; cursor: pointer; font-size: 11px; }
```

### Тесты этапа 7

- [ ] Клик на свой юнит → левая панель появляется с именем типа и числом солдат
- [ ] Полоска морали синяя, пропорциональна morale
- [ ] Полоска усталости оранжевая, пропорциональна fatigue
- [ ] У archer-юнита показывается "🏹 30/30 зарядов"
- [ ] У infantry/cavalry — строка с боеприпасами пустая
- [ ] 5 кнопок формаций видны; активная подсвечена золотом
- [ ] Клик на кнопку формации меняет `unit.formation` и подсветку кнопки
- [ ] Клик на пустое место → панель скрывается
- [ ] Панель НЕ появляется при клике на вражеский юнит

---

## Этап 8 — Базовая формула боя и функция тактического тика

**Цель:** реализовать `tacticalTick()` с рукопашным боем, победными условиями и кнопкой "Следующий ход".

### Задачи

В `engine/tactical_battle.js`:

```javascript
const FORMATION_MULT = {
  standard:  { atk: 1.0, def: 1.0 },
  aggressive:{ atk: 1.3, def: 0.8 },
  defensive: { atk: 0.7, def: 1.4 },
  flanking:  { atk: 1.1, def: 0.9 },
  siege:     { atk: 0.5, def: 1.2 }
};

function moraleMultiplier(morale) {
  if (morale >= 80) return 1.20;
  if (morale >= 50) return 1.00;
  if (morale >= 30) return 0.80;
  return 0.50;
}

function fatigueMultiplier(fatigue) {
  if (fatigue < 40)  return 1.00;
  if (fatigue < 70)  return 0.85;
  if (fatigue < 90)  return 0.65;
  return 0.45;
}

function getAdjacentUnits(unit, side, bs) {
  const all = side === 'player' ? bs.playerUnits : bs.enemyUnits;
  return all.filter(u =>
    u.strength > 0 && !u.isRouting &&
    Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridY - unit.gridY) === 1
  );
}

function resolveMelee(attacker, defender, bs) {
  const fm  = FORMATION_MULT[attacker.formation] ?? FORMATION_MULT.standard;
  const damage = attacker.strength
    * 0.04
    * fm.atk
    * moraleMultiplier(attacker.morale)
    * fatigueMultiplier(attacker.fatigue);
  defender.strength = Math.max(0, defender.strength - Math.floor(damage));
  if (defender.strength === 0) defender.morale = 0;
  return Math.floor(damage);
}

function checkVictory(bs) {
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  const enemyAlive  = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (enemyAlive.length === 0) return 'player_wins';
  if (playerAlive.length === 0) return 'player_loses';
  return null;
}

function tacticalTick(bs) {
  bs.turn++;

  // 1. Рукопашный бой: каждый юнит атакует соседа противника
  for (const pu of bs.playerUnits) {
    if (pu.isRouting || pu.strength === 0 || pu.isReserve) continue;
    const targets = getAdjacentUnits(pu, 'enemy', bs);
    // ищем соседей врага
    const enemies = bs.enemyUnits.filter(eu =>
      eu.strength > 0 &&
      Math.abs(eu.gridX - pu.gridX) + Math.abs(eu.gridY - pu.gridY) === 1
    );
    for (const eu of enemies) {
      const dmg = resolveMelee(pu, eu, bs);
      if (dmg > 0) addLog(bs, `⚔ ${pu.type} → ${eu.type}: −${dmg}`);
    }
  }
  for (const eu of bs.enemyUnits) {
    if (eu.isRouting || eu.strength === 0 || eu.isReserve) continue;
    const players = bs.playerUnits.filter(pu =>
      pu.strength > 0 &&
      Math.abs(pu.gridX - eu.gridX) + Math.abs(pu.gridY - eu.gridY) === 1
    );
    for (const pu of players) {
      const dmg = resolveMelee(eu, pu, bs);
      if (dmg > 0) addLog(bs, `🛡 ${eu.type} бьёт ${pu.type}: −${dmg}`);
    }
  }

  // 2. Простой ИИ: враги двигаются к ближайшему юниту игрока
  for (const eu of bs.enemyUnits) {
    if (eu.isRouting || eu.strength === 0 || eu.isReserve) continue;
    const alive = bs.playerUnits.filter(u => u.strength > 0);
    if (alive.length === 0) break;
    const target = alive.reduce((best, u) =>
      (Math.abs(u.gridX - eu.gridX) + Math.abs(u.gridY - eu.gridY)) <
      (Math.abs(best.gridX - eu.gridX) + Math.abs(best.gridY - eu.gridY)) ? u : best
    );
    const dx = Math.sign(target.gridX - eu.gridX);
    const dy = Math.sign(target.gridY - eu.gridY);
    const nx = eu.gridX + (dx !== 0 ? dx : 0);
    const ny = eu.gridY + (dx === 0 ? dy : 0);
    if (nx >= 0 && nx < TACTICAL_GRID_COLS && ny >= 0 && ny < TACTICAL_GRID_ROWS) {
      if (!findUnitAt(nx, ny, bs)) { eu.gridX = nx; eu.gridY = ny; }
    }
  }

  // 3. Проверить победу
  const outcome = checkVictory(bs);
  if (outcome) {
    bs.phase = 'ended';
    addLog(bs, outcome === 'player_wins' ? '🏆 Победа!' : '💀 Поражение!');
    endTacticalBattle(bs, outcome);
    return;
  }

  document.getElementById('tac-turn').textContent = `Ход ${bs.turn}`;
  redrawAll(_ctx, bs);
}
```

Привязать кнопку:
```javascript
document.getElementById('tac-btn-next').onclick = () => {
  if (_battleState?.phase === 'battle') tacticalTick(_battleState);
};
```

### Тесты этапа 8

- [ ] Кнопка "Следующий ход" увеличивает счётчик хода в верхней панели
- [ ] Враги двигаются в сторону юнитов игрока каждый ход
- [ ] Соприкоснувшиеся юниты наносят урон друг другу — `strength` уменьшается
- [ ] Формула урона: aggressive (×1.3) наносит заметно больше чем defensive (×0.7)
- [ ] Когда все вражеские юниты уничтожены → лог "🏆 Победа!"
- [ ] Когда все юниты игрока уничтожены → лог "💀 Поражение!"
- [ ] Число солдат на квадрате уменьшается по мере потерь
- [ ] Размер квадрата уменьшается вместе со `strength`

---

## Этап 9 — Боеприпасы стрелков (Улучшение 2)

**Цель:** archer-юниты стреляют на расстоянии, расходуют ammo, при 0 переходят в рукопашную.

### Задачи

В `engine/tactical_battle.js` добавить стрелковую фазу В `tacticalTick()` ПЕРЕД рукопашной:

```javascript
function resolveArrows(archer, target, bs) {
  const isElev    = bs.elevatedCells.has(`${archer.gridX},${archer.gridY}`);
  const rangeMax  = isElev ? 4 : 3;
  const dist      = Math.abs(archer.gridX - target.gridX)
                  + Math.abs(archer.gridY - target.gridY);
  if (dist > rangeMax || dist === 0) return 0;

  const ammoBonus = archer.ammo > 10 ? 1.0 : archer.ammo > 0 ? 0.65 : 0;
  if (ammoBonus === 0) return 0; // стрел нет

  const elevBonus = isElev ? 1.15 : 1.0;
  const dmg = Math.floor(archer.strength * 0.06 * ammoBonus * elevBonus
    * moraleMultiplier(archer.morale) * fatigueMultiplier(archer.fatigue));

  archer.ammo = Math.max(0, archer.ammo - 1);
  target.strength = Math.max(0, target.strength - dmg);
  if (target.strength === 0) target.morale = 0;

  if (archer.ammo === 0) {
    addLog(bs, `⚠️ Лучники ${archer.id} израсходовали стрелы!`);
  }
  return dmg;
}
```

В `tacticalTick()` добавить стрелковую фазу:
```javascript
// Стрелковая фаза (до рукопашной)
for (const pu of bs.playerUnits) {
  if (pu.type !== 'archers' || pu.isRouting || pu.strength === 0 || pu.isReserve) continue;
  if (pu.ammo === 0) continue; // перейдут в рукопашную автоматически
  // Атаковать ближайшего врага в радиусе
  const inRange = bs.enemyUnits.filter(eu => eu.strength > 0 && !eu.isRouting &&
    Math.abs(eu.gridX - pu.gridX) + Math.abs(eu.gridY - pu.gridY) <=
    (bs.elevatedCells.has(`${pu.gridX},${pu.gridY}`) ? 4 : 3));
  if (inRange.length === 0) continue;
  const target = inRange[0];
  const dmg = resolveArrows(pu, target, bs);
  if (dmg > 0) addLog(bs, `🏹 Лучники выпустили залп: −${dmg} (осталось ${pu.ammo})`);
}
// Аналогично для вражеских лучников...
```

Обновить `updateUnitPanel()` — при `ammo === 0` показывать красным цветом.

### Тесты этапа 9

- [ ] Archer-юнит на расстоянии 2 клетки от врага наносит урон без контакта
- [ ] Archer-юнит на расстоянии 4 клетки НЕ стреляет (вне радиуса)
- [ ] После 30 ходов стрельбы `ammo === 0`, лог "Лучники израсходовали стрелы!"
- [ ] При `ammo === 0` лучники вступают в рукопашную при контакте (этап 8)
- [ ] В панели юнита ammo отображается и уменьшается каждый ход
- [ ] При `ammo <= 5` строка в панели краснеет
- [ ] Вражеские лучники тоже стреляют по юнитам игрока

---

## Этап 10 — Рельеф и возвышенности (Улучшение 3)

**Цель:** генерация возвышенных клеток, визуализация, боевые бонусы.

### Задачи

В `engine/tactical_battle.js`:

```javascript
function generateElevatedCells(terrain, cols, rows) {
  const elevated = new Set();
  const ratio = { plains:0, river_valley:0.04, coastal_city:0.05,
                  hills:0.25, mountains:0.40 }[terrain] ?? 0;
  if (ratio === 0) return elevated;

  const totalCells   = cols * rows;
  const targetCount  = Math.floor(totalCells * ratio);
  const clusterCount = Math.ceil(targetCount / 10);

  for (let i = 0; i < clusterCount; i++) {
    const cx = RESERVE_ZONE_COLS + 1 +
               Math.floor(Math.random() * (cols - RESERVE_ZONE_COLS * 2 - 2));
    const cy = 1 + Math.floor(Math.random() * (rows - 2));
    const r  = 2 + Math.floor(Math.random() * 2);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx*dx + dy*dy <= r*r) {
          const ex = cx + dx, ey = cy + dy;
          if (ex >= RESERVE_ZONE_COLS && ex < cols - RESERVE_ZONE_COLS &&
              ey >= 0 && ey < rows) {
            elevated.add(`${ex},${ey}`);
          }
        }
      }
    }
  }
  return elevated;
}
```

Добавить в `initTacticalBattle()`:
```javascript
battleState.elevatedCells = generateElevatedCells(region.terrain, TACTICAL_GRID_COLS, TACTICAL_GRID_ROWS);
```

В `renderGrid()` добавить угловой треугольник для elevated клеток:
```javascript
ctx.fillStyle = 'rgba(255,220,100,0.35)';
for (const key of elevatedCells) {
  const [ex, ey] = key.split(',').map(Number);
  ctx.beginPath();
  ctx.moveTo((ex+1)*CELL_SIZE - 8, (ey+1)*CELL_SIZE);
  ctx.lineTo((ex+1)*CELL_SIZE,     (ey+1)*CELL_SIZE);
  ctx.lineTo((ex+1)*CELL_SIZE,     (ey+1)*CELL_SIZE - 8);
  ctx.fill();
}
```

В `tacticalTick()` добавить terrain-бонусы в формулу урона:
```javascript
function getTerrainAttackMult(attacker, defender, bs) {
  const atkElev = bs.elevatedCells.has(`${attacker.gridX},${attacker.gridY}`);
  const defElev = bs.elevatedCells.has(`${defender.gridX},${defender.gridY}`);
  if (atkElev && !defElev) return 1.10; // атака с высоты
  if (!atkElev && defElev) return 0.88; // атака вверх
  return 1.0;
}
```

Кавалерия на возвышенности: `moveSpeed = Math.max(1, original - 1)`.

### Тесты этапа 10

- [ ] `initTacticalBattle` с `terrain:'hills'` → `elevatedCells.size > 0`
- [ ] `initTacticalBattle` с `terrain:'plains'` → `elevatedCells.size === 0`
- [ ] Hills: примерно 25% клеток возвышены (размытая оценка ±10%)
- [ ] Mountains: примерно 40% клеток возвышены
- [ ] Возвышенные клетки видны на Canvas (светлее + жёлтый треугольник в углу)
- [ ] Юнит на возвышенности наносит на ~10% больше урона (тест в консоли)
- [ ] Юнит атакующий вверх наносит на ~12% меньше урона
- [ ] Стрелки с возвышенности бьют на 4 клетки, с ровной — на 3
- [ ] Hover на elevated клетку → tooltip "⛰ Возвышенность: +15% защита"
- [ ] Elevated клетки не генерируются в резервных зонах (колонки 0–2 и 19–21)

---

## Этап 11 — Фланговая атака (Улучшение 4)

**Цель:** атака с фланга или тыла даёт бонус к урону и снижает мораль цели. Рисуется стрелка.

### Задачи

В `engine/tactical_battle.js`:

```javascript
function getAttackDirection(attacker, defender) {
  const dx = attacker.gridX - defender.gridX;
  const dy = attacker.gridY - defender.gridY;
  // "фронт" цели обращён в сторону противника
  // Флаг = атака по вертикали когда фронт горизонтальный
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  if (isHorizontal) {
    // атака спереди или сзади
    const expectedSide = defender.side === 'player' ? 1 : -1;
    return Math.sign(dx) === expectedSide ? 'front' : 'rear';
  }
  return 'flank';
}

function flankBonus(direction) {
  if (direction === 'rear')  return { dmg: 1.70, morale: -35 };
  if (direction === 'flank') return { dmg: 1.40, morale: -20 };
  return { dmg: 1.00, morale: 0 };
}
```

Обновить `resolveMelee()`:
```javascript
function resolveMelee(attacker, defender, bs) {
  const fm  = FORMATION_MULT[attacker.formation] ?? FORMATION_MULT.standard;
  const dir = getAttackDirection(attacker, defender);
  const fb  = flankBonus(dir);
  const tm  = getTerrainAttackMult(attacker, defender, bs);

  const damage = Math.floor(
    attacker.strength * 0.04
    * fm.atk
    * moraleMultiplier(attacker.morale)
    * fatigueMultiplier(attacker.fatigue)
    * fb.dmg
    * tm
  );

  defender.strength = Math.max(0, defender.strength - damage);
  defender.morale   = Math.max(0,  defender.morale  + fb.morale);

  if (dir !== 'front' && fb.morale < 0) {
    const dirLabel = dir === 'flank' ? 'во фланг' : 'в тыл';
    addLog(bs, `⚔️ Удар ${dirLabel}! ${defender.type} деморализован (${fb.morale} мораль)`);
    // Сохранить для рендера стрелки
    bs._lastFlankArrow = {
      fromX: attacker.gridX, fromY: attacker.gridY,
      toX: defender.gridX, toY: defender.gridY,
      type: dir
    };
  }
  return damage;
}
```

В `ui/tactical_map.js` в `redrawAll()` рисовать стрелку фланговой атаки:
```javascript
function drawFlankArrow(ctx, bs) {
  const a = bs._lastFlankArrow;
  if (!a) return;
  const color = a.type === 'rear' ? '#ff3333' : '#ffaa00';
  const fx = a.fromX * CELL_SIZE + CELL_SIZE / 2;
  const fy = a.fromY * CELL_SIZE + CELL_SIZE / 2;
  const tx = a.toX   * CELL_SIZE + CELL_SIZE / 2;
  const ty = a.toY   * CELL_SIZE + CELL_SIZE / 2;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.setLineDash([]);
  // Стрелка живёт 1 ход
  bs._lastFlankArrow = null;
}
```

### Тесты этапа 11

- [ ] Юнит атакующий сбоку → лог "Удар во фланг! ... деморализован (-20 мораль)"
- [ ] Юнит атакующий сзади → лог "Удар в тыл! ... деморализован (-35 мораль)"
- [ ] Урон при фланговой атаке заметно выше чем при лобовой (можно проверить в консоли)
- [ ] На Canvas рисуется оранжевая пунктирная стрелка при фланговом ударе
- [ ] При тыловом ударе стрелка красная
- [ ] Стрелка исчезает на следующий ход
- [ ] Прямая лобовая атака не даёт флангового бонуса

---

## Этап 12 — Паника и бегство (Улучшение 5)

**Цель:** юниты с моралью ≤ 20 начинают бежать, создавая эффект домино. Командир останавливает панику.

### Задачи

В `engine/tactical_battle.js` добавить в `tacticalTick()` после фаз боя:

```javascript
// Фаза паники
function processPanic(bs) {
  const allUnits = [...bs.playerUnits, ...bs.enemyUnits];

  for (const unit of allUnits) {
    if (unit.strength === 0) continue;

    // Новые routing
    if (!unit.isRouting && unit.morale <= 20) {
      unit.isRouting = true;
      addLog(bs, `💀 ${unit.type} (${unit.side === 'player' ? 'наши' : 'враги'}) обратились в бегство!`);

      // Эффект домино: соседи теряют мораль
      const allies = (unit.side === 'player' ? bs.playerUnits : bs.enemyUnits)
        .filter(u => u.id !== unit.id && u.strength > 0 && !u.isRouting &&
          Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridY - unit.gridY) <= 2);
      for (const ally of allies) {
        ally.morale = Math.max(0, ally.morale - 15);
        if (allies.length > 0)
          addLog(bs, `😱 Паника распространяется на ${ally.type}! (-15 мораль)`);
      }
    }

    // Движение routing-юнитов
    if (unit.isRouting && unit.strength > 0) {
      const retreatDir = unit.side === 'player' ? -1 : 1;
      const nx = unit.gridX + retreatDir;
      if (nx < 0 || nx >= TACTICAL_GRID_COLS) {
        // Вышел за карту — потерян
        addLog(bs, `🏃 ${unit.type} покинули поле боя (потеряны)`);
        unit.strength = 0;
      } else if (!findUnitAt(nx, unit.gridY, bs)) {
        unit.gridX = nx;
      }
    }
  }
}

// Попытка остановить панику командиром
function processCommanderRally(bs) {
  for (const side of ['player', 'enemy']) {
    const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;
    const cmd   = units.find(u => u.isCommander && u.strength > 0);
    if (!cmd) continue;

    const routing = units.filter(u => u.isRouting && u.strength > 0 &&
      Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= 2);

    for (const ru of routing) {
      if (Math.random() < 0.30) {
        ru.isRouting = false;
        ru.morale    = 30;
        addLog(bs, `★ Командир остановил бегущих ${ru.type}!`);
      }
    }
  }
}
```

В `tacticalTick()` добавить вызовы:
```javascript
processPanic(bs);
processCommanderRally(bs);
```

Routing-юниты рендерятся с миганием — в `renderUnit()` добавить CSS-класс на Canvas-элемент (или вручную менять opacity через `Date.now()`):
```javascript
// Мигание routing юнита
if (unit.isRouting) {
  ctx.globalAlpha = (Math.floor(Date.now() / 400) % 2 === 0) ? 0.6 : 0.2;
}
```

### Тесты этапа 12

- [ ] Вручную установить `unit.morale = 15` → на следующем ходу юнит становится routing
- [ ] Routing-юнит мигает (видно визуально)
- [ ] Routing-юнит движется назад к своему краю каждый ход
- [ ] Соседи routing-юнита теряют -15 морали (эффект домино)
- [ ] При выходе за край карты юнит исчезает (`strength = 0`), лог "покинули поле боя"
- [ ] Командир в радиусе 2 клеток от routing-юнита имеет 30% шанс остановить бегство
- [ ] При остановке мораль восстанавливается до 30, лог "★ Командир остановил..."
- [ ] Паника не распространяется если нет routing-юнитов

---

## Этап 13 — Командир на поле (Улучшение 6)

**Цель:** командир — самостоятельный юнит с аурой морали, шансом гибели и навыком засады.

### Задачи

В `engine/tactical_battle.js` добавить ауру командира в `tacticalTick()`:

```javascript
function processCommanderAura(bs) {
  for (const side of ['player', 'enemy']) {
    const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;
    const cmd   = units.find(u => u.isCommander && u.strength > 0);
    if (!cmd) continue;

    const skills = cmd.commander?.skills ?? [];
    const auraBonus = 15 + (skills.includes('inspiring') ? 10 : 0);

    const nearby = units.filter(u => u.id !== cmd.id && u.strength > 0 && !u.isRouting &&
      Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= 2);

    for (const u of nearby) {
      const prev = u.morale;
      u.morale = Math.min(100, u.morale + auraBonus * 0.1); // per tick
      if (prev < 60 && u.morale > prev)
        addLog(bs, `★ ${cmd.commander?.name ?? 'Командир'} воодушевляет войска`);
    }
  }
}

function processCommanderDeath(cmd, bs) {
  // Вызывается когда вражеский юнит атакует клетку командира
  const side  = cmd.side;
  const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;

  if (Math.random() < 0.10) { // 10% шанс гибели за атаку
    cmd.strength = 0;
    addLog(bs, `💀 КОМАНДИР ПАЛ В БОЮ! Армия в смятении! (-30 мораль всем)`);
    for (const u of units) {
      u.morale = Math.max(0, u.morale - 30);
    }
  }
}
```

В `resolveMelee()` добавить проверку гибели командира:
```javascript
if (defender.isCommander) {
  processCommanderDeath(defender, bs);
}
```

Засада (навык `cunning`) — кнопка в панели:
```javascript
function _triggerAmbush() {
  if (!_battleState || _battleState.ambushUsed) return;
  const cmd = _battleState.playerUnits.find(u => u.isCommander && u.strength > 0);
  if (!cmd || !cmd.commander?.skills?.includes('cunning')) return;

  _battleState.ambushUsed = true;
  const r = 3;
  const affected = _battleState.enemyUnits.filter(u => u.strength > 0 &&
    Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= r);
  for (const u of affected) {
    u.morale = Math.max(0, u.morale - 20);
  }
  addLog(_battleState, `🎯 Засада! Враги в радиусе ${r} клеток деморализованы (-20 мораль)`);
  document.getElementById('tup-ambush-btn').innerHTML = '(Засада использована)';
  redrawAll(_ctx, _battleState);
}
```

### Тесты этапа 13

- [ ] Командир виден на поле — золотая рамка + звезда ★
- [ ] Каждые несколько ходов соседние юниты восстанавливают небольшую мораль от ауры
- [ ] Лог "воодушевляет войска" появляется если мораль была низкой
- [ ] При атаке клетки командира — 10% шанс его гибели за ход атаки
- [ ] Гибель командира → -30 морали всем своим юнитам, лог "КОМАНДИР ПАЛ"
- [ ] Если у командира навык `cunning` → кнопка "🎯 Засада" в панели
- [ ] Засада использована → вражеские юниты в радиусе 3 получают -20 морали
- [ ] Кнопка засады исчезает после использования (одноразовая)
- [ ] Если командир погиб — кнопка засады не отображается

---

## Этап 14 — Усталость (Улучшение 7)

**Цель:** юниты накапливают усталость в бою; армия маршировавшая в этот ход начинает с усталостью.

### Задачи

В `engine/tactical_battle.js`:

```javascript
function processFatigue(unit, moved, fought) {
  if (unit.isReserve) {
    unit.fatigue = Math.max(0, unit.fatigue - 5); // отдых в резерве
    return;
  }
  if (fought)  unit.fatigue = Math.min(100, unit.fatigue + 8);
  else if (moved) unit.fatigue = Math.min(100, unit.fatigue + 6);
  else        unit.fatigue = Math.max(0,   unit.fatigue - 3); // отдых
  if (unit.type === 'cavalry') unit.fatigue = Math.min(100, unit.fatigue + 2); // кавалерия устаёт быстрее
}
```

Добавить флаги `_movedThisTick` и `_foughtThisTick` в юниты (временные, сбрасываются каждый тик).

В `tacticalTick()` после всех фаз боя:
```javascript
// Фаза усталости
for (const u of [...bs.playerUnits, ...bs.enemyUnits]) {
  if (u.strength === 0) continue;
  processFatigue(u, u._movedThisTick, u._foughtThisTick);
  u._movedThisTick  = false;
  u._foughtThisTick = false;
}
```

В `initTacticalBattle()` начальная усталость:
```javascript
const marchedThisTurn = atkArmy.marchedThisTurn ?? false;
playerUnits.forEach(u => { u.fatigue = marchedThisTurn ? 35 : 0; });
```

### Тесты этапа 14

- [ ] Сражающийся юнит накапливает +8 усталости за тик
- [ ] Двигающийся юнит накапливает +6 усталости
- [ ] Стоящий без действий юнит теряет -3 усталости (отдых)
- [ ] Резервный юнит теряет -5 усталости за тик
- [ ] Усталость > 70 → урон юнита заметно меньше (×0.65)
- [ ] Усталость > 90 → юнит почти не наносит урона (×0.45)
- [ ] Полоска усталости в панели юнита обновляется каждый ход
- [ ] Кавалерия устаёт на 2 единицы быстрее пехоты
- [ ] Если `atkArmy.marchedThisTurn = true` → все юниты начинают с fatigue=35

---

## Этап 15 — Резерв (Улучшение 8)

**Цель:** игрок может держать юниты в резерве; они отдыхают и вводятся в нужный момент.

### Задачи

В `ui/tactical_map.js`:

```javascript
function _sendToReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (!unit || unit.isCommander) return;

  // Найти свободную клетку в резервной зоне (колонки 0–2)
  for (let x = 0; x < RESERVE_ZONE_COLS; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, _battleState)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = true;
        addLog(_battleState, `🛡 ${unit.type} отведён в резерв`);
        updateUnitPanel(unit, _battleState);
        redrawAll(_ctx, _battleState);
        return;
      }
    }
  }
  addLog(_battleState, `⚠️ Нет места в резерве`);
}

function _withdrawFromReserve(unitId) {
  const unit = _battleState?.playerUnits.find(u => u.id === unitId);
  if (!unit) return;

  // Найти свободную клетку на линии фронта (колонки 4–8)
  for (let x = RESERVE_ZONE_COLS + 1; x <= 8; x++) {
    for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
      if (!findUnitAt(x, y, _battleState)) {
        unit.gridX = x; unit.gridY = y;
        unit.isReserve = false;
        addLog(_battleState, `⚔ ${unit.type} введён в бой!`);
        updateUnitPanel(unit, _battleState);
        redrawAll(_ctx, _battleState);
        return;
      }
    }
  }
}
```

ИИ вводит резерв автоматически в `tacticalTick()`:
```javascript
// ИИ-резерв: ввести если фронт < 3 активных юнитов
const enemyFront = bs.enemyUnits.filter(u => !u.isReserve && u.strength > 0 && !u.isRouting);
if (enemyFront.length < 3) {
  const reserveUnit = bs.enemyUnits.find(u => u.isReserve && u.strength > 0);
  if (reserveUnit) {
    for (let x = TACTICAL_GRID_COLS - RESERVE_ZONE_COLS - 2; x >= 14; x--) {
      for (let y = 0; y < TACTICAL_GRID_ROWS; y++) {
        if (!findUnitAt(x, y, bs)) {
          reserveUnit.gridX = x; reserveUnit.gridY = y;
          reserveUnit.isReserve = false;
          addLog(bs, `⚔ Враг вводит резерв в бой!`);
          break;
        }
      }
      if (!reserveUnit.isReserve) break;
    }
  }
}
```

### Тесты этапа 15

- [ ] Кнопка "🛡 В резерв" в панели юнита переводит его в зону резерва (колонки 0–2)
- [ ] Резервный юнит полупрозрачный с пунктирной рамкой
- [ ] Резервный юнит не получает урона от вражеских атак
- [ ] Резервный юнит теряет усталость (-5/тик) пока в резерве
- [ ] Кнопка "⚔ В бой!" размещает юнит на первую свободную клетку фронта
- [ ] Командира нельзя отправить в резерв (кнопка не появляется)
- [ ] Вражеский ИИ вводит резерв когда фронт < 3 активных юнитов, лог "Враг вводит резерв"
- [ ] Нельзя поместить в резерв если резервная зона занята (лог "Нет места")

---

## Этап 16 — Захват стандарта (Улучшение 9)

**Цель:** если игрок занял клетку командира врага — мгновенная победа.

### Задачи

В `engine/tactical_battle.js` при `initTacticalBattle()` сохранить позиции стандартов:
```javascript
const playerCmd = playerUnits.find(u => u.isCommander);
const enemyCmd  = enemyUnits.find(u => u.isCommander);
battleState.playerStandardPos = playerCmd ? { x: playerCmd.gridX, y: playerCmd.gridY } : null;
battleState.enemyStandardPos  = enemyCmd  ? { x: enemyCmd.gridX,  y: enemyCmd.gridY  } : null;
```

В `tacticalTick()` добавить проверку захвата ПОСЛЕ перемещений:
```javascript
function checkStandardCapture(bs) {
  const eStd = bs.enemyStandardPos;
  const pStd = bs.playerStandardPos;

  if (eStd) {
    const captor = bs.playerUnits.find(u =>
      u.strength > 0 && !u.isRouting && u.gridX === eStd.x && u.gridY === eStd.y);
    if (captor) {
      addLog(bs, `🏴 СТАНДАРТ ЗАХВАЧЕН! Враг деморализован — ПОБЕДА!`);
      bs.enemyUnits.forEach(u => { u.isRouting = true; u.morale = 0; });
      bs.phase = 'ended';
      setTimeout(() => endTacticalBattle(bs, 'player_captured_standard'), 1500);
      return;
    }
  }

  if (pStd) {
    const captor = bs.enemyUnits.find(u =>
      u.strength > 0 && !u.isRouting && u.gridX === pStd.x && u.gridY === pStd.y);
    if (captor) {
      addLog(bs, `🏴 Враг захватил наш стандарт — ПОРАЖЕНИЕ!`);
      bs.playerUnits.forEach(u => { u.isRouting = true; u.morale = 0; });
      bs.phase = 'ended';
      setTimeout(() => endTacticalBattle(bs, 'player_loses'), 1500);
    }
  }
}
```

В `ui/tactical_map.js` — рисовать флаг на позиции стандарта если командир ушёл:
```javascript
function drawStandards(ctx, bs) {
  for (const [std, cmd] of [
    [bs.enemyStandardPos,  bs.enemyUnits.find(u => u.isCommander)],
    [bs.playerStandardPos, bs.playerUnits.find(u => u.isCommander)]
  ]) {
    if (!std || !cmd) continue;
    // Показывать флаг только если командир покинул свою стартовую клетку
    if (cmd.gridX === std.x && cmd.gridY === std.y) continue;
    ctx.font = '18px monospace';
    ctx.fillText('🚩', std.x * CELL_SIZE + 4, std.y * CELL_SIZE + 20);
  }
}
```

Вызвать `drawStandards(ctx, bs)` в `redrawAll()`.

Стратегия ИИ: если `hp < 40%` враг прикрывает командира, если `hp > 60%` и есть открытый путь — пытается прорваться к командиру игрока.

### Тесты этапа 16

- [ ] При инициализации `playerStandardPos` и `enemyStandardPos` заполнены координатами командиров
- [ ] Когда командир покидает стартовую клетку — на той клетке появляется флаг 🚩
- [ ] Когда юнит игрока занимает клетку стандарта врага → лог "СТАНДАРТ ЗАХВАЧЕН! ПОБЕДА!"
- [ ] После захвата все вражеские юниты переходят в routing
- [ ] Через 1.5 секунды вызывается `endTacticalBattle` с победой
- [ ] Если вражеский юнит занял клетку стандарта игрока → лог "ПОРАЖЕНИЕ!"
- [ ] `checkStandardCapture` вызывается каждый тик, не только при движении

---

## Этап 17 — Отступление с расчётом выживших (Улучшение 10)

**Цель:** кнопка "Отступить" считает % выживших по степени окружения, показывает диалог.

### Задачи

В `engine/tactical_battle.js`:

```javascript
function calcRetreatSurvival(bs) {
  const enemyActive = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);

  // Проверка направлений окружения
  const hasEnemyBehind  = enemyActive.some(e => e.gridX < RESERVE_ZONE_COLS + 2);
  const hasEnemyTopFlank    = enemyActive.some(e => e.gridY <= 2);
  const hasEnemyBottomFlank = enemyActive.some(e => e.gridY >= TACTICAL_GRID_ROWS - 3);
  const flankedBothSides = hasEnemyTopFlank && hasEnemyBottomFlank;

  const routingRatio = bs.playerUnits.filter(u => u.isRouting).length /
                       Math.max(1, bs.playerUnits.length);

  let base = 0.68;
  if (hasEnemyBehind && flankedBothSides) base = 0.12; // полное окружение
  else if (hasEnemyBehind || flankedBothSides) base = 0.35; // частичное окружение
  else if (routingRatio > 0.5) base = 0.50;

  const hasCavalry = bs.playerUnits.some(u => u.type === 'cavalry' && u.strength > 0);
  const cavBonus   = hasCavalry ? 0.10 : 0;

  return Math.min(0.80, base + cavBonus);
}

function executeRetreat(bs) {
  const pct = calcRetreatSurvival(bs);
  for (const u of bs.playerUnits) {
    u.strength = Math.floor(u.strength * pct);
  }
  bs.phase = 'ended';
  addLog(bs, `🏃 Армия отступила. Спаслось ~${Math.round(pct * 100)}% войск.`);
  endTacticalBattle(bs, 'player_retreat');
}
```

В `ui/tactical_map.js`:

```javascript
function showRetreatConfirm(bs) {
  const pct = calcRetreatSurvival(bs);
  const totalStrength = bs.playerUnits.reduce((s, u) => s + u.strength, 0);
  const survivors     = Math.floor(totalStrength * pct);

  const msg = document.createElement('div');
  msg.id = 'retreat-confirm';
  msg.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);
    z-index:9500;display:flex;align-items:center;justify-content:center;`;
  msg.innerHTML = `
    <div style="background:#141414;border:1px solid #555;border-radius:4px;
                padding:24px 32px;text-align:center;color:#ddd;min-width:280px;">
      <h3 style="margin:0 0 12px;color:#ee8888">Отступление</h3>
      <p>Спасётся примерно <b>${survivors.toLocaleString()}</b> солдат (${Math.round(pct*100)}%)</p>
      <p style="color:#aaa;font-size:12px">
        ${pct < 0.2 ? '⚠️ Полное окружение' :
          pct < 0.4 ? '⚠️ Частичное окружение' : ''}
      </p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
        <button onclick="document.getElementById('retreat-confirm').remove();
                         executeRetreat(_battleState)"
          style="padding:8px 20px;background:#3a1a1a;border:1px solid #aa4444;
                 color:#ee8888;border-radius:3px;cursor:pointer">Отступить</button>
        <button onclick="document.getElementById('retreat-confirm').remove()"
          style="padding:8px 20px;background:#1a1a1a;border:1px solid #444;
                 color:#ccc;border-radius:3px;cursor:pointer">Продолжать бой</button>
      </div>
    </div>`;
  document.body.appendChild(msg);
}
```

Привязать кнопку:
```javascript
document.getElementById('tac-btn-retreat').onclick = () => {
  if (_battleState?.phase === 'battle') showRetreatConfirm(_battleState);
};
```

### Тесты этапа 17

- [ ] Кнопка "🏃 Отступить" открывает диалог подтверждения
- [ ] В диалоге показывается число выживших и % (не NaN, не 0)
- [ ] При "Продолжать бой" диалог закрывается, бой продолжается
- [ ] При "Отступить" strength всех юнитов умножается на pct, бой завершается
- [ ] С открытыми флангами (нет окружения) → ~68% выживших
- [ ] При вражеских юнитах за линией игрока → ~35%
- [ ] При полном окружении → ~12%
- [ ] Кавалерия в армии даёт +10% к выживаемости
- [ ] После отступления вызывается `endTacticalBattle` с outcome `'player_retreat'`

---

## Этап 18 — Улучшенный ИИ противника

**Цель:** враг использует тактику — охраняет командира, атакует слабые юниты, вводит резерв.

### Задачи

В `engine/tactical_battle.js` заменить примитивный ИИ на многоуровневый:

```javascript
function runEnemyAI(bs) {
  const enemyAlive = bs.enemyUnits.filter(u => u.strength > 0 && !u.isRouting);
  const playerAlive = bs.playerUnits.filter(u => u.strength > 0 && !u.isRouting);
  if (playerAlive.length === 0) return;

  const enemyCmd = enemyAlive.find(u => u.isCommander);
  const ownHpRatio = enemyAlive.reduce((s,u) => s + u.strength, 0) /
                     Math.max(1, bs.enemyUnits.reduce((s,u) => s + u.maxStrength, 0));

  for (const eu of enemyAlive) {
    if (eu.isReserve) continue;
    eu._movedThisTick = false;

    // TIER 1: Защита командира при низком HP
    if (ownHpRatio < 0.40 && enemyCmd && eu.id !== enemyCmd.id) {
      const distToCmd = Math.abs(eu.gridX - enemyCmd.gridX) + Math.abs(eu.gridY - enemyCmd.gridY);
      if (distToCmd > 2) {
        moveTowards(eu, enemyCmd.gridX, enemyCmd.gridY, bs);
        eu._movedThisTick = true;
        continue;
      }
    }

    // TIER 2: Атаковать ближайшего слабого (низкая мораль)
    const weakTarget = playerAlive
      .filter(p => Math.abs(p.gridX - eu.gridX) + Math.abs(p.gridY - eu.gridY) <= eu.moveSpeed + 1)
      .sort((a,b) => a.morale - b.morale)[0];

    if (weakTarget) {
      moveTowards(eu, weakTarget.gridX, weakTarget.gridY, bs);
      eu._movedThisTick = true;
      continue;
    }

    // TIER 3: Двигаться к ближайшему
    const nearest = playerAlive.reduce((best, p) =>
      (Math.abs(p.gridX - eu.gridX) + Math.abs(p.gridY - eu.gridY)) <
      (Math.abs(best.gridX - eu.gridX) + Math.abs(best.gridY - eu.gridY)) ? p : best
    );
    moveTowards(eu, nearest.gridX, nearest.gridY, bs);
    eu._movedThisTick = true;
  }
}

function moveTowards(unit, tx, ty, bs) {
  const dx = Math.sign(tx - unit.gridX);
  const dy = Math.sign(ty - unit.gridY);
  // Пробуем горизонтальное движение, потом вертикальное
  const options = [];
  if (dx !== 0) options.push({ x: unit.gridX + dx, y: unit.gridY });
  if (dy !== 0) options.push({ x: unit.gridX, y: unit.gridY + dy });
  for (const opt of options) {
    if (opt.x >= 0 && opt.x < TACTICAL_GRID_COLS &&
        opt.y >= 0 && opt.y < TACTICAL_GRID_ROWS &&
        !findUnitAt(opt.x, opt.y, bs)) {
      unit.gridX = opt.x; unit.gridY = opt.y;
      return;
    }
  }
}
```

### Тесты этапа 18

- [ ] Враги активно двигаются к юнитам игрока каждый ход
- [ ] При `ownHpRatio < 0.40` враги начинают группироваться вокруг командира
- [ ] Враги предпочитают атаковать юниты игрока с низкой моралью
- [ ] Вражеский ИИ вводит резерв при `enemyFront < 3`, лог "Враг вводит резерв"
- [ ] Враги не "стакаются" на одной клетке (проверка занятости)
- [ ] Бой не зависает при любом состоянии поля (нет бесконечных циклов)

---

## Этап 19 — Финализация боя и интеграция с battle_result.js

**Цель:** тактический бой корректно завершается и передаёт потери в существующую систему.

### Задачи

В `engine/tactical_battle.js`:

```javascript
function finalizeTacticalBattle(bs, outcome) {
  // Суммировать выживших
  const playerSurvived = bs.playerUnits.reduce((s, u) => s + (u.isRouting ? 0 : u.strength), 0);
  const enemySurvived  = bs.enemyUnits.reduce((s, u) => s + (u.isRouting  ? 0 : u.strength), 0);

  const playerTotal = bs.playerUnits.reduce((s, u) => s + u.maxStrength, 0);
  const enemyTotal  = bs.enemyUnits.reduce((s, u) => s + u.maxStrength, 0);

  const playerCas = playerTotal - playerSurvived;
  const enemyCas  = enemyTotal  - enemySurvived;

  // Записать обратно в army-объекты
  const atkSurvRatio = playerTotal > 0 ? playerSurvived / playerTotal : 0;
  bs.atkArmy.infantry = Math.floor((bs.atkArmy.infantry || 0) * atkSurvRatio);
  bs.atkArmy.cavalry  = Math.floor((bs.atkArmy.cavalry  || 0) * atkSurvRatio);
  bs.atkArmy.archers  = Math.floor((bs.atkArmy.archers  || 0) * atkSurvRatio);

  const defSurvRatio = enemyTotal > 0 ? enemySurvived / enemyTotal : 0;
  bs.defArmy.infantry = Math.floor((bs.defArmy.infantry || 0) * defSurvRatio);
  bs.defArmy.cavalry  = Math.floor((bs.defArmy.cavalry  || 0) * defSurvRatio);
  bs.defArmy.archers  = Math.floor((bs.defArmy.archers  || 0) * defSurvRatio);

  const atkWins = outcome === 'player_wins' || outcome === 'player_captured_standard';
  const margin  = enemyCas > 0 ? playerCas / enemyCas : 0.5;

  return {
    atkWins,
    atkName: GAME_STATE.nations?.[bs.atkArmy.nation_id]?.name ?? 'Атакующий',
    defName: GAME_STATE.nations?.[bs.defArmy.nation_id]?.name ?? 'Защитник',
    atkFlag: GAME_STATE.nations?.[bs.atkArmy.nation_id]?.flag ?? '⚔',
    defFlag: GAME_STATE.nations?.[bs.defArmy.nation_id]?.flag ?? '🛡',
    atkTotal: playerTotal,
    defTotal: enemyTotal,
    atkCas:   playerCas,
    defCas:   enemyCas,
    terrain:  bs.terrain,
    terrainLabel: bs.region?.name ?? bs.terrain,
    margin:   Math.abs(1 - margin),
    capturedRegionName: (outcome === 'player_captured_standard' || atkWins)
      ? bs.region?.name : null
  };
}

function endTacticalBattle(bs, outcome) {
  const overlay = document.getElementById('tactical-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    // Снять слушатели
    const canvas = document.getElementById('tactical-canvas');
    if (canvas) {
      canvas.removeEventListener('click',     onTacticalClick);
      canvas.removeEventListener('mousemove', onTacticalHover);
    }
  }
  const result = finalizeTacticalBattle(bs, outcome);
  if (typeof showBattleResult === 'function') showBattleResult(result);
}
```

### Тесты этапа 19

- [ ] Победа → оверлей закрывается, показывается `showBattleResult` с победой
- [ ] Поражение → оверлей закрывается, показывается `showBattleResult` с поражением
- [ ] После боя `atkArmy.infantry/cavalry/archers` уменьшились пропорционально потерям
- [ ] После боя `defArmy` аналогично обновлён
- [ ] Нет NaN в полях после финализации
- [ ] `atkCas + playerSurvived === playerTotal` (сумма сходится)
- [ ] Закрытие оверлея удаляет event listeners (нет утечки)
- [ ] Повторный вызов `openTacticalMap` работает корректно после предыдущего боя

---

## Этап 20 — Модальный выбор режима и финальная интеграция

**Цель:** перехватить `resolveBattle()` в `engine/armies.js`, показать выбор "Сыграть / Авторассчёт".

### Задачи

В `engine/armies.js` найти место вызова `resolveBattle()` и добавить обёртку:

```javascript
function maybeTacticalBattle(atk, def, region) {
  // Бой ИИ vs ИИ — всегда авторассчёт без вопросов
  if (atk.nation_id !== GAME_STATE.player_nation) {
    return resolveBattle(atk, def, region);
  }
  // Бой игрока — показать выбор
  _showTacticalChoiceModal(atk, def, region);
}

function _showTacticalChoiceModal(atk, def, region) {
  document.getElementById('tactical-choice-modal')?.remove();

  const atkStr = (atk.infantry||0) + (atk.cavalry||0) + (atk.archers||0);
  const defStr = (def.infantry||0) + (def.cavalry||0) + (def.archers||0);
  const terrainLabel = { plains:'Равнина', hills:'Холмы', mountains:'Горы',
    river_valley:'Речная долина', coastal_city:'Побережье' }[region?.terrain] ?? region?.terrain ?? '';

  const modal = document.createElement('div');
  modal.id = 'tactical-choice-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.72);
    z-index:8900;display:flex;align-items:center;justify-content:center;`;
  modal.innerHTML = `
    <div style="background:#141414;border:1px solid #555;border-radius:4px;
                padding:28px 36px;text-align:center;color:#ddd;min-width:300px;">
      <h3 style="margin:0 0 8px;font-size:17px">Битва при ${region?.name ?? 'неизвестном месте'}</h3>
      <p style="margin:0 0 4px">${atkStr.toLocaleString()} против ${defStr.toLocaleString()} воинов</p>
      <p style="color:#888;font-size:12px;margin:0 0 20px">${terrainLabel}</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <button id="tcm-play"
          style="padding:9px 22px;background:#1a2a1a;border:1px solid #4a7a4a;
                 color:#88cc88;border-radius:3px;cursor:pointer;font-size:14px">
          ⚔ Сыграть битву
        </button>
        <button id="tcm-auto"
          style="padding:9px 22px;background:#1e1e1e;border:1px solid #555;
                 color:#ccc;border-radius:3px;cursor:pointer;font-size:14px">
          ⚡ Авторассчёт
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('tcm-play').onclick = () => {
    modal.remove();
    if (typeof openTacticalMap === 'function') openTacticalMap(atk, def, region);
  };
  document.getElementById('tcm-auto').onclick = () => {
    modal.remove();
    const result = resolveBattle(atk, def, region);
    if (typeof showBattleResult === 'function') showBattleResult(result);
  };
}
```

Заменить все прямые вызовы `resolveBattle(atk, def, region)` для армий игрока на `maybeTacticalBattle(atk, def, region)`.

### Тесты этапа 20 (финальные)

- [ ] При объявлении войны ИИ нации — бой ИИ разрешается без модала
- [ ] При атаке армией игрока — появляется модал с названием региона и числом войск
- [ ] Кнопка "⚔ Сыграть битву" открывает тактическую карту с правильными армиями
- [ ] Кнопка "⚡ Авторассчёт" закрывает модал и показывает обычный battle_result
- [ ] После тактического боя — показывается `showBattleResult` с реальными потерями
- [ ] Нет `undefined` или `NaN` в отображаемых данных
- [ ] Тактическая карта корректно работает при повторном использовании
- [ ] Сохранение/загрузка игры работает нормально после тактического боя
- [ ] Бои между ИИ нациями продолжают работать как раньше

---

## Сводная таблица этапов

| Этап | Что реализуется | Улучшение |
|------|-----------------|-----------|
| 1  | Каркас файлов, HTML оверлея, CSS | — |
| 2  | Рендер сетки и фон местности | — |
| 3  | Разбивка армии на тактические юниты | — |
| 4  | Рендер юнита: размер и цвет | Подход 2, 3 |
| 5  | Сетка иконок солдат + полоски | Подход 1, 4 |
| 6  | Управление мышью: выбор и перемещение | — |
| 7  | Панель юнита и кнопки формаций | — |
| 8  | Базовая формула боя, tacticalTick, ИИ | — |
| 9  | Боеприпасы стрелков | Улучшение 2 |
| 10 | Рельеф и возвышенности | Улучшение 3 |
| 11 | Фланговая атака | Улучшение 4 |
| 12 | Паника и бегство | Улучшение 5 |
| 13 | Командир на поле, аура, засада | Улучшение 6 |
| 14 | Усталость | Улучшение 7 |
| 15 | Резерв | Улучшение 8 |
| 16 | Захват стандарта | Улучшение 9 |
| 17 | Отступление с расчётом выживших | Улучшение 10 |
| 18 | Улучшенный ИИ (TIER 1/2/3) | — |
| 19 | Финализация боя, интеграция с battle_result | — |
| 20 | Модал выбора режима, финальная интеграция | — |

---

## Правила для каждой сессии

1. **Реализовать только свой этап** — не трогать функции следующих этапов
2. **Пройти все чеклисты** перед тем как считать этап завершённым
3. **Коммитить** после прохождения всех тестов: `git commit -m "tactical: этап N — [название]"`
4. **Не ломать** существующий авторассчёт — `resolveBattle()` должен работать до Этапа 20
5. **Функции-заглушки** — если этап ссылается на функцию следующего этапа, создать пустую заглушку
