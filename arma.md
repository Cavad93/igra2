# arma.md — План реализации тактической карты на Pixi.js v8

> Документ для исполнителя (sonnet). Код не писать — только читать план и реализовывать пошагово.
> После каждого шага выполнить тест перед переходом к следующему.

---

## БЛОК А — Фундамент (Шаги 1–3)

---

### Шаг 1 — Pixi.js v8: инициализация и слои

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `6c9eb31`, файл `ui/battle_map_pixi.js`, тесты `tests/test_arma_stage1.mjs` (30 passed). Не реализовывать повторно.

**Цель:** создать файл `ui/battle_map_pixi.js`, инициализировать Pixi Application, создать иерархию контейнеров (слоёв).

**Что сделать:**

1. В `index.html` подключить CDN Pixi.js v8:
   ```
   <script src="https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.js"></script>
   ```
2. Создать файл `ui/battle_map_pixi.js`.
3. Внутри объявить async-функцию `initBattleMap(containerId, width, height)`:
   - Создать `new PIXI.Application()`
   - Вызвать `await app.init({ width, height, antialias: true, backgroundColor: 0x2d4a1e })`
   - Добавить `app.canvas` в DOM-элемент `containerId`
4. Создать 6 контейнеров (слоёв) и добавить их в `app.stage` в порядке:
   ```
   layerBg       — terrain (самый нижний)
   layerRivers   — реки
   layerRoads    — дороги
   layerForests  — деревья
   layerUnits    — юниты
   layerFx       — эффекты (самый верхний)
   ```
5. Экспортировать объект `BattleMap = { app, layers: { bg, rivers, roads, forests, units, fx } }`.

**Почему такой порядок слоёв:**
Pixi.js рендерит контейнеры в порядке добавления. Terrain должен быть под всем. FX — поверх всего. Это стандартная практика для 2D game maps в Pixi.js v8.

**Тест Шага 1:**
- Открыть `index.html` в браузере (или создать тестовую страницу).
- На экране должен появиться тёмно-зелёный прямоугольник (canvas Pixi.js).
- В консоли не должно быть ошибок.
- `BattleMap.layers.fx` должен быть экземпляром `PIXI.Container`.

---

### Шаг 2 — Noise utilities: Perlin + fBm + Domain Warping

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `792eda0`, файл `engine/noise.js` (mulberry32/PerlinNoise/fbm/domainWarp), тесты `tests/test_arma_stage2.mjs` (37 passed). Не реализовывать повторно.

**Цель:** написать чистый модуль генерации шума без зависимостей.

**Что сделать:**

1. Создать файл `engine/noise.js`.
2. Реализовать класс `PerlinNoise`:
   - Конструктор принимает `seed` (число).
   - Метод `noise2d(x, y)` возвращает число от -1 до 1.
   - Использовать алгоритм: permutation table размером 512, градиентные векторы, fade-функция `6t⁵ - 15t⁴ + 10t³`, bilинейная интерполяция (`lerp`).
   - Seeded PRNG для перемешивания permutation: `mulberry32(seed)` — простой 32-битный PRNG.
3. Реализовать функцию `fbm(noise, x, y, octaves, persistence, lacunarity)`:
   - `persistence` = 0.5 (amplitude decay per octave)
   - `lacunarity` = 2.0 (frequency multiplier per octave)
   - Суммировать `octaves` слоёв, нормализовать результат в диапазон [0, 1].
4. Реализовать функцию `domainWarp(noise, x, y, octaves, warpStrength)`:
   - Первый проход: `qx = fbm(noise, x, y)`, `qy = fbm(noise, x + 5.2, y + 1.3)`
   - Второй проход: `rx = fbm(noise, x + warpStrength*qx, y + warpStrength*qy)`
   - Вернуть `rx` — итоговое значение высоты в [0, 1].

**Параметры по умолчанию:**
- octaves = 6
- persistence = 0.5
- lacunarity = 2.0
- warpStrength = 1.2

**Почему domainWarp:** двойной проход fBm создаёт органичные изгибы рельефа — реки, холмы, побережья выглядят естественно, без машинной регулярности.

**Тест Шага 2:**
- В консоли браузера (или Node.js) вызвать: `fbm(noise, 0.3, 0.7, 6, 0.5, 2.0)` — должно вернуть число в [0, 1].
- Вызвать `domainWarp(noise, 0.3, 0.7, 6, 1.2)` — должно вернуть число в [0, 1].
- Вызвать с тем же seed дважды — результаты должны совпадать (детерминированность).
- Визуальная проверка: нарисовать 200×200 пикселей grayscale на Canvas — должна быть органичная карта высот без прямых линий.

---

### Шаг 3 — Heightmap: генерация и хранение

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/noise.js` (generateHeightmap/getHeight), тесты `tests/test_arma_stage3.mjs` (18 passed). Не реализовывать повторно.

**Цель:** создать heightmap как `Float32Array`, нормализованный в [0, 1].

**Что сделать:**

1. В `engine/noise.js` добавить функцию `generateHeightmap(width, height, seed, options)`:
   - `options` = `{ octaves: 6, persistence: 0.5, lacunarity: 2.0, warpStrength: 1.2 }`
   - Создать `Float32Array(width * height)`.
   - Для каждого пикселя `(x, y)`:
     - Вычислить нормализованные координаты `nx = x / width`, `ny = y / height`
     - Вычислить `h = domainWarp(noise, nx * 3, ny * 3, octaves, warpStrength)`
     - Записать в `heightmap[y * width + x] = h`
   - Нормализовать весь массив в строгий диапазон [0, 1]: найти min/max, затем `(val - min) / (max - min)`.
   - Вернуть `{ data: Float32Array, width, height }`.

2. Добавить helper `getHeight(heightmap, x, y)`:
   - Clamp координаты к границам.
   - Вернуть `heightmap.data[y * heightmap.width + x]`.

**Тест Шага 3:**
- Вызвать `generateHeightmap(256, 256, 42)`.
- Проверить: `Math.min(...data)` ≈ 0, `Math.max(...data)` ≈ 1.
- Нарисовать grayscale карту на Canvas 256×256 — должны быть узнаваемые горы, долины, равнины.
- Проверить детерминированность: два вызова с одним seed дают идентичные массивы.

---

## БЛОК B — Рендер рельефа (Шаги 4–6)

---

### Шаг 4 — Биомы: цветовая палитра и маппинг высот

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (BIOMES/getBiomeColor), тесты `tests/test_arma_stage4.mjs` (23 passed). Не реализовывать повторно.

**Цель:** по значению heightmap назначить цвет биома (тёмная военная палитра).

**Что сделать:**

1. В `ui/battle_map_pixi.js` объявить массив биомов (пороги высот → цвет):
   ```
   BIOMES = [
     { threshold: 0.10, name: 'deep_water',    color: 0x1a2a3a },
     { threshold: 0.20, name: 'shallow_water', color: 0x2a3f55 },
     { threshold: 0.35, name: 'wetland',       color: 0x3d5c3a },
     { threshold: 0.55, name: 'grassland',     color: 0x4a6b3f },
     { threshold: 0.68, name: 'forest',        color: 0x2d4a24 },
     { threshold: 0.80, name: 'hills',         color: 0x6b5a3a },
     { threshold: 0.90, name: 'mountain',      color: 0x7a6a5a },
     { threshold: 1.00, name: 'snow_peak',     color: 0xc8c0b0 },
   ]
   ```
2. Написать функцию `getBiomeColor(h)`:
   - Пройти по BIOMES, найти первый биом где `h <= threshold`.
   - Вернуть `{ color, name }`.
3. Написать функцию `getBiomeAt(heightmap, x, y)`:
   - Получить `h = getHeight(heightmap, x, y)`.
   - Вернуть `getBiomeColor(h)`.

**Тест Шага 4:**
- `getBiomeColor(0.05).name` → `'deep_water'`
- `getBiomeColor(0.50).name` → `'grassland'`
- `getBiomeColor(0.95).name` → `'mountain'`
- Нарисовать на Canvas 256×256 пиксель = цвет биома — должна быть узнаваемая карта с водой, сушей, горами.

---

### Шаг 5 — Pixi.js terrain: рендер биомов на layerBg

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (renderTerrain на layers.bg), тесты `tests/test_arma_stage5.mjs` (18 passed). Не реализовывать повторно.

**Цель:** нарисовать рельеф в Pixi.js через `RenderTexture` + `Sprite`.

**Что сделать:**

1. Написать async-функцию `renderTerrain(app, layers, heightmap)`:
   a. Создать вспомогательный Canvas 2D размером `heightmap.width × heightmap.height`:
      - Для каждого пикселя заполнить цветом биома через `imageData` / `fillRect`.
   b. Создать `PIXI.Texture.from(canvas2d)` — конвертировать Canvas в Pixi-текстуру.
   c. Создать `new PIXI.Sprite(texture)`, масштабировать под размер `app.screen` (`sprite.width = app.screen.width`).
   d. Добавить sprite в `layers.bg`.

2. Альтернатива для крупных карт (> 512×512): разбить на тайлы 128×128, каждый — отдельный Sprite. Это ускоряет обновление при изменениях.

**Почему Canvas → Texture:** прямое рисование каждого пикселя через Pixi.js Graphics слишком медленно для terrain. Canvas 2D imageData — быстрее в 10-50 раз для пиксельного рендера.

**Тест Шага 5:**
- Запустить `initBattleMap()` + `renderTerrain()`.
- На экране должна появиться цветная карта биомов.
- `layers.bg.children.length` должен быть ≥ 1.
- FPS не должен падать ниже 30 при canvas 800×600.

---

### Шаг 6 — Parchment overlay + Vignette

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (parchment TilingSprite + vignette), тесты `tests/test_arma_stage6.mjs` (28 passed). Не реализовывать повторно.

**Цель:** наложить текстуру пергамента (Paper003, CC0) и тёмный виньет по краям.

**Что сделать:**

1. **Parchment overlay:**
   - Загрузить текстуру через `PIXI.Assets.load('textures/Paper003_1K_Color.jpg')`.
   - Создать `new PIXI.TilingSprite({ texture, width: app.screen.width, height: app.screen.height })`.
   - Установить `sprite.blendMode = 'multiply'`.
   - Установить `sprite.alpha = 0.22`.
   - Добавить в `layers.bg` (поверх terrain sprite).

2. **Vignette:**
   - Создать отдельный Canvas 2D того же размера.
   - Нарисовать на нём радиальный градиент: центр — прозрачный (`rgba(0,0,0,0)`), края — тёмный (`rgba(0,0,0,0.55)`).
   - Конвертировать в `PIXI.Texture.from(vigCanvas)`.
   - Создать Sprite, добавить в `layers.bg` последним.

3. **Источник текстуры Paper003:**
   - URL для загрузки: `https://ambientcg.com/get?file=Paper003_1K-JPG.zip`
   - Распаковать, положить файл `Paper003_1K_Color.jpg` в папку `textures/` проекта.
   - В production: использовать локальный путь `./textures/Paper003_1K_Color.jpg`.

**Тест Шага 6:**
- Карта должна выглядеть "старинной" — тёплый бежевый оттенок поверх биомов.
- Углы и края должны быть темнее центра (виньет).
- `layers.bg.children.length` должен быть 3 (terrain + parchment + vignette).
- Без ошибок 404 в сети (текстура загружена локально).

---

## БЛОК C — Реки (Шаги 7–9)

---

### Шаг 7 — Flow simulation: трассировка путей воды

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/rivers.js` (simulateFlow/traceRivers), тесты `tests/test_arma_stage7.mjs` (24 passed). Не реализовывать повторно.

**Цель:** вычислить пути рек как массивы точек (до рендеринга).

**Что сделать:**

1. В `engine/rivers.js` написать функцию `traceRiver(heightmap, startX, startY, maxSteps)`:
   - Начать с точки `(startX, startY)` — это должна быть зона горного биома (h > 0.78).
   - На каждом шаге найти соседа (8 направлений) с **минимальной** высотой.
   - Если минимальный сосед выше текущей точки — остановиться (озеро).
   - Добавить текущую точку в массив пути `path[]`.
   - Остановиться когда `h < 0.20` (достигли воды) или пройдено `maxSteps` шагов.
   - Вернуть `path` — массив `[{x, y}, ...]`.

2. Написать функцию `generateRivers(heightmap, count, seed)`:
   - Найти все пиксели с `h > 0.78` (горные зоны).
   - Случайно выбрать `count` стартовых точек (через seeded PRNG из Шага 2).
   - Для каждой вызвать `traceRiver()`.
   - Отфильтровать реки короче 20 точек (слишком короткие, не рисовать).
   - Вернуть массив `rivers[]`, каждый элемент: `{ path: [{x,y},...], width: number }`.
   - Ширина реки: `width = 1 + path.length / 80` (чем длиннее — тем шире).

**Тест Шага 7:**
- `generateRivers(heightmap, 5, 42)` должно вернуть массив 1-5 рек (некоторые могут быть отфильтрованы).
- Каждый `path` должен идти от высоких h к низким h — проверить первые и последние элементы.
- Нарисовать точки путей на Canvas (красные пиксели) — должны выглядеть как текущие реки.

---

### Шаг 8 — River rendering: Bezier-кривые в Pixi.js

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (drawRivers на layers.rivers), тесты `tests/test_arma_stage8.mjs` (27 passed). Не реализовывать повторно.

**Цель:** нарисовать реки как плавные линии переменной ширины в `layerRivers`.

**Что сделать:**

1. В `ui/battle_map_pixi.js` написать функцию `renderRivers(app, layers, rivers, hmW, hmH)`:
   - `hmW`, `hmH` — размеры heightmap (для маппинга координат на экранные).
   - Для каждой реки:
     a. **Сгладить путь Chaikin** (3 итерации, функция из Шага 11 — можно использовать заранее или дублировать).
     b. Создать `new PIXI.Graphics()`.
     c. Установить `lineStyle(width, 0x2a5a8a, 1.0)` (тёмно-синий).
     d. Нарисовать путь через `moveTo(p[0].x, p[0].y)`, затем для каждой тройки точек — `bezierCurveTo()`:
        - Контрольные точки = средние точки между соседними вершинами (Catmull-Rom → Bezier approximation).
     e. Добавить Graphics в `layers.rivers`.

2. **Маппинг координат heightmap → экран:**
   ```
   screenX = (hm_x / hmW) * app.screen.width
   screenY = (hm_y / hmH) * app.screen.height
   ```

3. **Анимация воды (опционально, Шаг 9):** пока просто статичная линия.

**Тест Шага 8:**
- На карте должны быть видны синие линии от гор до воды.
- Линии должны быть плавными (не зигзаги).
- Ширина линии должна быть 1-3px в зависимости от длины реки.
- `layers.rivers.children.length` == количеству рек.

---

### Шаг 9 — River polish: цвет, прозрачность, анимация течения

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (river shader/ticker), тесты `tests/test_arma_stage9.mjs` (30 passed). Не реализовывать повторно.

**Цель:** сделать реки визуально убедительными — глубина, блики, движение.

**Что сделать:**

1. **Двойная линия:**
   - Нарисовать реку дважды: сначала широкая тёмная линия (`width+2`, `0x1a3a5a`, alpha=0.9), затем тонкая светлая поверх (`width`, `0x4a8abf`, alpha=0.7).
   - Эффект: тень + цвет воды.

2. **Мерцание течения (ticker animation):**
   - Создать массив `dashOffset = 0`.
   - В Pixi.js `app.ticker.add(delta => { dashOffset += delta * 0.5 })`.
   - Перерисовывать river Graphics каждые N тиков (не каждый кадр — дорого).
   - Или использовать шейдерный подход через `PIXI.Filter` с простым GLSL (анимировать UV offset текстуры воды).

3. **Упрощённый вариант без шейдеров:** добавить редкие белые точки (`0xffffff`, alpha=0.3, radius=1px) вдоль пути реки — имитация бликов. Анимировать их позицию через ticker.

**Тест Шага 9:**
- Реки должны иметь визуальную глубину (тёмный контур + светлый центр).
- При анимации: блики должны двигаться или мерцать.
- FPS не падает ниже 30 (проверить в DevTools Performance).

---

## БЛОК D — Дороги (Шаги 10–12)

---

### Шаг 10 — Key points: размещение ключевых точек (города, перекрёстки)

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/roads.js` (placeKeyPoints/generateKeyPoints), тесты `tests/test_arma_stage10.mjs` (19 passed). Не реализовывать повторно.

**Цель:** определить 4-6 ключевых точек на карте — начало и конец дорог.

**Что сделать:**

1. В `engine/roads.js` написать функцию `generateKeyPoints(heightmap, count, seed)`:
   - Найти все пиксели с `h` в диапазоне [0.35, 0.60] — равнинные зоны (не вода, не горы).
   - Случайно выбрать `count` точек (seeded PRNG).
   - Применить **минимальное расстояние**: отбросить точки, расстояние до ближайшей уже выбранной < `minDist = width / 4`.
   - Вернуть массив `[{x, y, name: 'city_N'}, ...]`.

2. Нарисовать маленькие иконки городов (опционально на этом шаге, можно отложить).

**Тест Шага 10:**
- `generateKeyPoints(heightmap, 5, 42)` → массив 3-5 точек.
- Все точки должны лежать на равнинных биомах (grassland / wetland).
- Расстояние между любыми двумя точками > `width/4`.

---

### Шаг 11 — A* pathfinding: прокладка дорог по terrain cost

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/roads.js` (astar + terrainCost), тесты `tests/test_arma_stage11.mjs` (33 passed). Не реализовывать повторно.

**Цель:** найти путь между каждой парой ключевых точек через A* с учётом рельефа.

**Что сделать:**

1. В `engine/roads.js` написать функцию `astar(heightmap, start, end)`:
   - Использовать сетку heightmap как граф (соседи: 8 направлений).
   - **Стоимость перехода (`g-cost`):**
     ```
     cost(h) = 1.0 + h * 4.0
     ```
     Вода (h < 0.20): cost = 99 (почти непроходима).
     Горы (h > 0.80): cost = 10.
     Равнина (h = 0.45): cost ≈ 2.8.
   - Эвристика (`h-cost`): Euclidean расстояние до `end`.
   - Использовать min-heap (приоритетная очередь) — простую реализацию через отсортированный массив или класс `BinaryHeap`.
   - Вернуть массив `[{x, y}, ...]` — путь от start до end.

2. Написать функцию `generateRoads(heightmap, keyPoints)`:
   - Соединить каждую точку со следующей в массиве (цикл `i` → `i+1`).
   - Дополнительно: соединить первую и последнюю точки (кольцевая дорога).
   - Вернуть массив `roads[]`, каждый: `{ path: [{x,y},...] }`.

**Почему A* с terrain cost:** дороги "обходят" горы и воду, идут по равнинам — как реальные исторические тракты.

**Тест Шага 11:**
- `astar(heightmap, {x:10,y:10}, {x:200,y:200})` → массив точек.
- Путь не должен проходить через пиксели с `h < 0.20` (вода) если есть обход.
- Нарисовать путь точками на Canvas — должна быть кривая, избегающая воды и гор.

---

### Шаг 12 — Road rendering: Chaikin smoothing + двойная линия

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (renderRoads/chaikin), тесты `tests/test_arma_stage12.mjs` (28 passed). Не реализовывать повторно.

**Цель:** нарисовать дороги в Pixi.js как плавные линии с эффектом грунтовки.

**Что сделать:**

1. Реализовать функцию `chaikin(points, iterations)`:
   - На каждой итерации: для каждой пары соседних точек `[P0, P1]` создать две новые:
     - `Q = P0 * 0.75 + P1 * 0.25`
     - `R = P0 * 0.25 + P1 * 0.75`
   - Повторить `iterations` раз (рекомендуется 3-4 итерации).
   - Вернуть сглаженный массив точек.

2. Написать функцию `renderRoads(app, layers, roads, hmW, hmH)`:
   - Для каждой дороги:
     a. Применить `chaikin(path, 3)`.
     b. Создать `new PIXI.Graphics()`.
     c. Нарисовать **внешнюю линию**: `lineStyle(4, 0x2a1a0a, 0.8)` (тёмно-коричневый).
     d. Нарисовать **внутреннюю линию** (поверх): `lineStyle(2, 0x8a6a3a, 0.9)` (светло-коричневый).
     e. Оба раза: `moveTo()` + `lineTo()` по сглаженному пути.
     f. Добавить в `layers.roads`.

**Тест Шага 12:**
- На карте должны быть видны коричневые дороги между ключевыми точками.
- Линии должны быть плавными (после Chaikin), без резких зигзагов.
- Дороги должны идти поверх terrain, но под деревьями (проверить z-order слоёв).
- `layers.roads.children.length` == количеству дорог.

---

## БЛОК E — Леса и деревья (Шаги 13–15)

---

### Шаг 13 — Forest patches: Worley noise для зон леса

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/forests.js` (worleyNoise/generateForestMask), тесты `tests/test_arma_stage13.mjs` (32 passed). Не реализовывать повторно.

**Цель:** определить, какие пиксели карты являются лесными зонами (для размещения деревьев).

**Что сделать:**

1. В `engine/forests.js` реализовать функцию `worleyNoise(x, y, points)`:
   - `points` — массив случайных 2D-точек (Feature Points), генерируется один раз через seeded PRNG.
   - Вернуть расстояние до ближайшей feature point: `min distance to any point in points`.
   - Нормализовать: делить на максимально возможное расстояние.

2. Написать функцию `generateForestMask(heightmap, seed)`:
   - Создать 20-30 feature points в случайных позициях (seeded PRNG).
   - Для каждого пикселя: пиксель — лес, если:
     - `biome.name === 'forest'` (h в диапазоне [0.55, 0.68])
     - **И** `worleyNoise(x, y, points) < 0.35` (близко к feature point = густой лес)
   - Вернуть `Uint8Array(width * height)` — 1 = лес, 0 = не лес.

3. Почему Worley для лесов: создаёт органичные округлые пятна (как реальные лесные массивы), в отличие от Perlin который даёт полосы.

**Тест Шага 13:**
- Нарисовать маску на Canvas: белый = лес, чёрный = нет. Должны быть округлые пятна.
- Лесные пятна должны лежать только в зонах с `h` в [0.55, 0.68].
- Примерно 20-40% биома "forest" должно быть помечено как густой лес.

---

### Шаг 14 — Poisson Disk Sampling: размещение деревьев

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/forests.js` (poissonDisk), тесты `tests/test_arma_stage14.mjs` (26 passed). Не реализовывать повторно.

**Цель:** равномерно расставить деревья внутри лесных зон без наложений.

**Что сделать:**

1. В `engine/forests.js` реализовать функцию `poissonDisk(mask, width, height, minDist, maxPoints, seed)`:
   - Алгоритм Bridson's Poisson Disk Sampling:
     a. Начать с случайной точки внутри маски (mask[y*w+x] == 1).
     b. Добавить её в `activeList` и `result`.
     c. Пока `activeList` не пуст:
        - Взять случайную точку из `activeList`.
        - Попробовать сгенерировать `k=30` кандидатов в кольце `[minDist, 2*minDist]`.
        - Кандидат принимается если: внутри маски И расстояние до всех ближайших точек > `minDist`.
        - Если кандидат принят — добавить в `activeList` и `result`.
        - Если за `k` попыток не нашли — убрать точку из `activeList`.
     d. Остановиться когда `result.length >= maxPoints`.
   - Вернуть `result: [{x, y}, ...]`.

2. Параметры для деревьев: `minDist = 12` (пикселей карты), `maxPoints = 500`.

3. **Оптимизация:** использовать spatial grid (разбить на ячейки `minDist` размером) для быстрого поиска соседей вместо O(n) перебора.

**Тест Шага 14:**
- `poissonDisk(forestMask, w, h, 12, 500, 42)` → массив точек.
- Все точки внутри маски: `forestMask[y*w+x] == 1` для каждой точки.
- Минимальное расстояние между любыми двумя точками ≥ 12.
- Точки распределены равномерно (нет пустых зон и скоплений).

---

### Шаг 15 — Tree rendering: Painter's algorithm (sort by Y)

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (renderForests, sortableChildren sort-by-y), тесты `tests/test_arma_stage15.mjs` (20 passed). Не реализовывать повторно.

**Цель:** нарисовать деревья как индивидуальные спрайты с правильным перекрытием.

**Что сделать:**

1. Написать функцию `renderForests(app, layers, treePositions, hmW, hmH)`:
   - Отсортировать `treePositions` по возрастанию `y` (Painter's algorithm).
   - Для каждой точки создать одно дерево через `PIXI.Graphics`:
     a. **Тень:** эллипс `(0, +6)`, fill `rgba(0,0,0,0.25)`, `radiusX=7, radiusY=3`.
     b. **Крона:** круг `(0, 0)`, fill `0x1a3a14` (тёмно-зелёный), `radius=8`.
     c. **Блик кроны:** круг `(-3, -3)`, fill `0x2d5a24` (светлее), `radius=4`, alpha=0.6.
     d. **Ствол:** прямоугольник `(-1.5, +5)` размером `3×5`, fill `0x4a2800` (коричневый).
   - Установить `tree.x = screenX`, `tree.y = screenY`.
   - Установить `tree.zIndex = screenY` (для Painter's сортировки).
   - Добавить в `layers.forests`.
   - Включить сортировку: `layers.forests.sortableChildren = true`.

2. **Оптимизация для > 200 деревьев:** использовать `PIXI.ParticleContainer` вместо Container или объединить кроны в один Graphics объект через batch drawing.

**Тест Шага 15:**
- На карте должны быть видны индивидуальные деревья в лесных зонах.
- Деревья должны перекрывать друг друга правильно (ближние — поверх дальних).
- Каждое дерево: тень, крона, блик, ствол.
- `layers.forests.children.length` ≈ количеству treePositions.
- FPS ≥ 30 при 300 деревьях (проверить в DevTools).

---

## БЛОК F — Юниты и бой (Шаги 16–18)

---

### Шаг 16 — Battalion class: данные юнита

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/battalion.js` (class Battalion), тесты `tests/test_arma_stage16.mjs` (31 passed). Не реализовывать повторно.

**Цель:** создать класс данных батальона без UI-зависимостей.

**Что сделать:**

1. В `engine/battalion.js` написать класс `Battalion`:
   ```
   class Battalion {
     constructor({ id, x, y, side, unitType, health, maxHealth, formation })
     // Fields:
     id          — уникальный string ('ally_1', 'enemy_2')
     x, y        — позиция на карте (в координатах heightmap)
     side        — 'ally' | 'enemy'
     unitType    — 'infantry' | 'cavalry' | 'archers' | 'cannon'
     health      — текущее HP (0–100)
     maxHealth   — максимальное HP
     formation   — 'line' | 'square' | 'skirmish'
     isSelected  — boolean (выбран игроком)
     isAlive()   — метод, вернуть health > 0
     takeDamage(amount) — метод, уменьшить health, не ниже 0
   }
   ```

2. Создать функцию `createTestBattalions()`:
   - Вернуть 4 батальона: 2 `ally`, 2 `enemy`, разных типов и позиций.
   - Используется только для тестов.

**Тест Шага 16:**
- `new Battalion({...}).isAlive()` → true при health > 0.
- `battalion.takeDamage(200)` → `battalion.health == 0`, не отрицательное.
- `battalion.side` должен быть 'ally' или 'enemy'.

---

### Шаг 17 — Unit token rendering: изометрический блок в Pixi.js

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (renderUnit/renderAllUnits на layers.units), тесты `tests/test_arma_stage17.mjs` (27 passed). Не реализовывать повторно.

**Цель:** нарисовать каждый батальон как изометрический ромб с иконкой и полоской HP.

**Что сделать:**

1. Написать функцию `renderUnit(battalion, app, layers)`:
   - Создать `new PIXI.Container()` — корневой контейнер юнита.
   - **Изометрический блок (ромб):**
     - Создать `new PIXI.Graphics()`.
     - Нарисовать три грани:
       - Top face (ромб): 4 точки — верхняя, правая, нижняя, левая. Fill: цвет стороны (`0x3a6a2a` для ally, `0x6a2a2a` для enemy), чуть светлее.
       - Left side face (параллелограмм): нижняя-левая-нижнелевая-нижняя исходного ромба. Fill: темнее на 30%.
       - Right side face: зеркально. Fill: темнее на 20%.
     - Размер ромба: `w=40, h=20` пикселей.
   - **Иконка типа войск:**
     - Нарисовать символ поверх ромба через Graphics:
       - Infantry: три вертикальные линии `||| `
       - Cavalry: диагональная линия с точкой `⟋·`
       - Archers: дуга со стрелкой `⌒→`
       - Cannon: прямоугольник с трубой
     - Или использовать Unicode-символы через `PIXI.Text` (шрифт Arial, size=10).
   - **Полоска HP:**
     - Чёрный фон: `rect(-18, -22, 36, 4)`.
     - Зелёная полоска: `rect(-18, -22, 36 * (health/maxHealth), 4)`.
     - Цвет: зелёный если HP > 50%, жёлтый если > 25%, красный если ≤ 25%.
   - Установить `container.x = screenX`, `container.y = screenY`.
   - Установить `container.zIndex = screenY` (Painter's algorithm).
   - Добавить в `layers.units`.

2. Написать `renderAllUnits(battalions, app, layers, hmW, hmH)` — итерировать по батальонам.

**Тест Шага 17:**
- На карте должны быть видны ромбы с цветами сторон (зелёный/красный).
- Поверх ромбов — иконка типа войск.
- Поверх иконки — полоска HP.
- `container.zIndex` = screenY (ближние юниты поверх дальних).

---

### Шаг 18 — Взаимодействие: выбор и движение юнитов

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (selectBattalion/onMapClick), тесты `tests/test_arma_stage18.mjs` (37 passed). Не реализовывать повторно.

**Цель:** реализовать клик-для-выбора и клик-для-перемещения.

**Что сделать:**

1. Сделать каждый `PIXI.Container` юнита интерактивным:
   - `container.interactive = true`
   - `container.eventMode = 'static'`
   - Добавить `container.on('pointerdown', () => selectBattalion(battalion.id))`.

2. Написать функцию `selectBattalion(id)`:
   - Снять выделение с предыдущего юнита (`isSelected = false`, убрать пульсирующий контур).
   - Установить `battalions[id].isSelected = true`.
   - Нарисовать пульсирующий жёлтый контур вокруг ромба (через `setInterval` или ticker).

3. Добавить обработчик клика по карте (не по юниту):
   - `app.stage.on('pointerdown', (e) => onMapClick(e.global))`.
   - `onMapClick`: если есть выбранный юнит — переместить его к кликнутым координатам.
   - Анимация движения: через ticker плавно интерполировать `x, y` юнита (lerp с `t += delta * 0.05`).

4. Написать `redrawUnit(battalion)` — пересоздать/обновить Graphics контейнера юнита после изменения позиции или HP.

**Тест Шага 18:**
- Клик на юнит: он должен быть выделен (жёлтый контур).
- Клик на другой юнит: выделение переходит.
- Клик на карту при выбранном юните: юнит плавно перемещается к точке.
- HP-полоска обновляется при изменении `battalion.health`.

---

## БЛОК G — Финал (Шаги 19–20)

---

### Шаг 19 — Укрепления и эффекты атаки

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `engine/fortifications.js` + `ui/battle_map_pixi.js` (renderFortifications/emitDamageNumber/drawAimLine на layers.fx), тесты `tests/test_arma_stage19.mjs` (35 passed). Не реализовывать повторно.

**Цель:** нарисовать фортификации и добавить визуальные эффекты боя.

**Что сделать:**

1. **Укрепления (красные шипастые линии):**
   - В `engine/fortifications.js` написать функцию `generateFortifications(keyPoints, seed)`:
     - Для каждого ключевого города: создать 3-5 точек вокруг него в радиусе 30px.
     - Соединить эти точки в ломаную линию — это линия обороны.
   - В `ui/battle_map_pixi.js` написать `renderFortifications(app, layers, forts, hmW, hmH)`:
     - Для каждой линии обороны создать `PIXI.Graphics`.
     - Нарисовать ломаную линию `lineStyle(2, 0x8a0000, 0.9)` (тёмно-красный).
     - Вдоль линии каждые 8px нарисовать шип: треугольник `▲` высотой 5px, направленный наружу.
     - Добавить в `layers.roads` (дороги — между terrain и forests).

2. **Плавающие числа урона:**
   - Написать функцию `emitDamageNumber(layers, x, y, amount)`:
     - Создать `new PIXI.Text(String(amount), { fill: 0xff4444, fontSize: 14, fontFamily: 'serif' })`.
     - Добавить в `layers.fx`.
     - Анимировать через ticker: `text.y -= delta * 1.5`, `text.alpha -= delta * 0.03`.
     - Удалить когда `alpha <= 0`.

3. **Пунктирная линия прицеливания (aim line):**
   - Написать функцию `drawAimLine(layers, fromUnit, toUnit)`:
     - Создать `PIXI.Graphics` с `lineStyle(1, 0xff8800, 0.7, 0, true)`.
     - Нарисовать пунктирную линию (чередование `lineTo` / `moveTo` через каждые 6px).
     - Добавить в `layers.fx`.
     - Удалять при снятии выделения.

**Тест Шага 19:**
- Вокруг городов должны быть видны красные шипастые линии.
- При атаке: число урона всплывает и исчезает за ~1 сек.
- При выборе лучников: должна быть пунктирная линия к цели.
- Укрепления в `layers.roads` (под деревьями, над terrain).

---

### Шаг 20 — Полировка: HiDPI, rAF, масштаб, финальная сборка

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/battle_map_pixi.js` (HiDPI resolution/autoDensity + Pixi Ticker + destroyBattleMap), тесты `tests/test_arma_stage20.mjs` (33 passed). Не реализовывать повторно.

**Цель:** завершить систему — разрешение, производительность, интеграция с основной игрой.

**Что сделать:**

1. **HiDPI / Retina:**
   - При инициализации: `const dpr = window.devicePixelRatio || 1`.
   - Передать в Pixi: `app.init({ resolution: dpr, autoDensity: true, width, height })`.
   - Pixi v8 автоматически масштабирует canvas под DPR.

2. **Offscreen terrain cache:**
   - Рендерить terrain в `PIXI.RenderTexture.create({ width, height })` один раз.
   - При открытии карты: использовать закешированную текстуру.
   - Сброс кеша только при смене seed или размера.

3. **rAF loop через Pixi Ticker:**
   - Использовать `app.ticker` вместо ручного `requestAnimationFrame`.
   - Добавить глобальный ticker callback для обновления: float numbers, particles, aim line dash offset, unit movement lerp.
   - При закрытии карты: `app.ticker.stop()`, при открытии: `app.ticker.start()`.

4. **Интеграция с основной игрой:**
   - В `index.html`: добавить `<div id="pixi-battle-map">` внутри `#tactical-overlay`.
   - В `engine/tactical_battle.js`: при вызове `openTacticalBattle()` — вызвать `initBattleMap('pixi-battle-map', 800, 600)`.
   - Передать данные батальонов из текущей системы в `Battalion[]`.
   - При закрытии тактики: вызвать `destroyBattleMap()` — `app.destroy(true)`, очистить containers.

5. **Финальный чеклист перед релизом:**
   - [ ] Terrain рендерится без артефактов при разных seed
   - [ ] Реки текут от гор к воде
   - [ ] Дороги соединяют все ключевые точки
   - [ ] Деревья не накладываются друг на друга
   - [ ] Юниты кликабельны и перемещаются
   - [ ] HP-полоски обновляются
   - [ ] FPS ≥ 30 на обычном ноутбуке при 300 деревьях + 8 юнитах
   - [ ] Нет memory leaks (проверить DevTools Memory, особенно при open/close карты)
   - [ ] HiDPI: на Retina дисплее нет размытости

**Тест Шага 20:**
- Открыть карту → закрыть → открыть снова: нет двойных слоёв, нет ошибок.
- На Retina дисплее (dpr=2): карта чёткая, без размытости.
- Memory leak test: открыть/закрыть 10 раз — heap size не растёт.
- Полный FPS тест в DevTools Performance: 60 FPS (или стабильные 30 при низких настройках).

---

## Итоговая структура файлов

```
engine/
  noise.js          — PerlinNoise, fbm(), domainWarp(), generateHeightmap()
  rivers.js         — traceRiver(), generateRivers()
  roads.js          — generateKeyPoints(), astar(), generateRoads(), chaikin()
  forests.js        — worleyNoise(), generateForestMask(), poissonDisk()
  battalion.js      — class Battalion
  fortifications.js — generateFortifications()
ui/
  battle_map_pixi.js — initBattleMap(), renderTerrain(), renderRivers(),
                       renderRoads(), renderForests(), renderAllUnits(),
                       renderFortifications(), emitDamageNumber(),
                       drawAimLine(), destroyBattleMap()
textures/
  Paper003_1K_Color.jpg  — CC0 parchment texture
```

---

## Порядок реализации

Реализовывать строго по шагам. Не переходить к следующему шагу без успешного теста предыдущего.

| Шаг | Файл | Функции |
|-----|------|---------|
| 1 | battle_map_pixi.js | initBattleMap, layers |
| 2 | engine/noise.js | PerlinNoise, fbm, domainWarp |
| 3 | engine/noise.js | generateHeightmap |
| 4 | battle_map_pixi.js | BIOMES, getBiomeColor |
| 5 | battle_map_pixi.js | renderTerrain |
| 6 | battle_map_pixi.js | parchment overlay, vignette |
| 7 | engine/rivers.js | traceRiver, generateRivers |
| 8 | battle_map_pixi.js | renderRivers |
| 9 | battle_map_pixi.js | river polish, animation |
| 10 | engine/roads.js | generateKeyPoints |
| 11 | engine/roads.js | astar, generateRoads |
| 12 | battle_map_pixi.js | chaikin, renderRoads |
| 13 | engine/forests.js | worleyNoise, generateForestMask |
| 14 | engine/forests.js | poissonDisk |
| 15 | battle_map_pixi.js | renderForests |
| 16 | engine/battalion.js | class Battalion |
| 17 | battle_map_pixi.js | renderUnit, renderAllUnits |
| 18 | battle_map_pixi.js | selectBattalion, onMapClick |
| 19 | battle_map_pixi.js | renderFortifications, emitDamageNumber, drawAimLine |
| 20 | battle_map_pixi.js | HiDPI, ticker, интеграция |

---

# ЧАСТЬ 2 — Редизайн главного экрана игры

> Улучшения главной игровой страницы `index.html`.
> Каждый шаг независим — можно реализовывать в любом порядке внутри блока.
> После каждого шага тест в браузере перед переходом к следующему.

## БЛОК I — Layout: нижняя строка и алерты (Шаги 24–26)

---

### Шаг 24 — Лог событий как drawer (выдвижная панель)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `9a2417e`, файл `ui/log.js` (toggleLog + collapsed/expanded + counters), тесты `tests/test_arma_stage24.mjs` (29 passed). Не реализовывать повторно.

**Цель:** освободить нижнюю строку — лог свёрнут по умолчанию, разворачивается по клику.

**Что сделать:**

1. Изменить `#event-log` на двухрежимный элемент:
   - **Свёрнутый** (по умолчанию): одна строка высотой 32px — показывает последнее событие + счётчики по типам.
   - **Развёрнутый**: высота 180px, показывает полный список `#log-entries`.

2. HTML структура свёрнутого вида:
   ```html
   <div id="log-collapsed">
     <span id="log-last-entry">—</span>
     <div id="log-counters">
       <span class="log-cnt" data-filter="danger">⚠ <b>0</b></span>
       <span class="log-cnt" data-filter="economy">💰 <b>0</b></span>
       <span class="log-cnt" data-filter="character">👤 <b>0</b></span>
     </div>
     <button id="log-expand-btn" onclick="toggleLog()">▲ Хроники</button>
   </div>
   ```

3. CSS:
   - `#event-log.collapsed`: `height: 32px; overflow: hidden`
   - `#event-log.expanded`: `height: 180px; transition: height 0.2s ease`
   - `#log-collapsed`: `display: flex; align-items: center; gap: 8px; padding: 0 10px; height: 32px`
   - `#log-expand-btn.open`: иконка меняется на `▼`

4. JS: `toggleLog()` — переключает классы `collapsed/expanded`. При добавлении нового события — обновлять `#log-last-entry` и счётчики в `#log-counters`.
5. При добавлении события с `data-filter="danger"` — счётчик `⚠` мигает 2 сек (CSS animation `pulse`).

**Тест Шага 24:**
- По умолчанию лог занимает 32px — видна одна строка.
- Клик "▲ Хроники" → плавно разворачивается до 180px.
- Счётчики `⚠ 2` обновляются при добавлении событий.
- После хода: последнее событие видно в свёрнутом виде.

---

### Шаг 25 — Строка ввода команды — всегда видна

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `c6fc956`, `index.html` (#input-row / #orders-mini), тесты `tests/test_arma_stage25.mjs` (48 passed). Не реализовывать повторно.

**Цель:** главная механика (ввод приказов) должна быть доступна всегда, без скролла и скрытия.

**Что сделать:**

1. Изменить `#bottom-area` на flex-колонку с фиксированными высотами:
   ```
   #bottom-area {
     display: flex;
     flex-direction: row;
     height: 32px;        ← одна строка (лог свёрнут)
     flex-shrink: 0;
   }
   ```

2. Расположить элементы в одну строку:
   ```
   [#event-log] flex: 1  |  [#input-row] width: 420px  |  [#orders-mini] width: 160px
   ```

3. `#input-row` всегда виден:
   - `#command-input`: `flex: 1; height: 30px; background: var(--bg-section); border: 1px solid var(--border-gold); color: var(--text-light); padding: 0 10px; font-family: inherit; font-size: 12px`
   - `#send-btn`: `height: 30px; padding: 0 14px; white-space: nowrap`

4. `#orders-panel` свернуть аналогично логу — в одну кнопку `📋 2 приказа`, клик разворачивает вверх.

5. `placeholder` поля укоротить: `"Ваш приказ... (напр. «набрать 500 пехотинцев»)"`.

**Тест Шага 25:**
- Поле ввода всегда видно в нижней строке.
- Нижняя строка занимает ровно 32px (один ряд).
- Ввод команды и нажатие Enter работает как раньше.
- На маленьких экранах (1024px) строка не переносится.

---

### Шаг 26 — Значки-алерты на вкладках панели

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `b121acd`, `index.html` + `ui/panels.js` (.lnav-badge / updateAlertBadges), тесты `tests/test_arma_stage26.mjs` (45 passed). Не реализовывать повторно.

**Цель:** показать где требуется внимание без открытия каждой вкладки.

**Что сделать:**

1. Добавить к каждой кнопке `#left-nav` атрибут `data-tab` и дочерний элемент-бейдж:
   ```html
   <button class="lnav-btn" data-tab="economy" title="Экономика">
     💰
     <span class="lnav-badge" id="badge-economy" style="display:none">0</span>
   </button>
   ```

2. CSS `.lnav-badge`:
   ```css
   .lnav-badge {
     position: absolute; top: 2px; right: 2px;
     min-width: 14px; height: 14px;
     background: #e53935; border-radius: 7px;
     font-size: 9px; color: #fff; font-family: sans-serif;
     display: flex; align-items: center; justify-content: center;
     font-weight: bold; line-height: 1;
   }
   ```
   `.lnav-btn` должен иметь `position: relative`.

3. JS: написать функцию `updateAlertBadges(state)`, вызываемую после каждого хода:
   - `economy`: показать бейдж если `state.treasury < 0` (дефицит) — значение `!`
   - `army`: показать если есть армии без приказа — значение = количество
   - `diplomacy`: показать если есть входящие предложения — значение = количество
   - `laws`: показать если идёт голосование

4. При открытии вкладки — скрыть её бейдж (`badge.style.display = 'none'`).

**Тест Шага 26:**
- При дефиците казны на вкладке 💰 появляется красный кружок с `!`.
- При входящем дипломатическом предложении на 🤝 появляется `1`.
- Открытие вкладки скрывает бейдж.
- При нуле алертов — бейджи скрыты.

---

## БЛОК H — Layout: топ-бар и панели (Шаги 21–23)

---

### Шаг 21 — Ресурс-бар в топ-баре

> **Статус:** ✅ **ВЫПОЛНЕНО** — `index.html` (#top-bar / #resource-bar / .res-item) + `ui/panels.js` (updateResourceBar), тесты `tests/test_arma_stage21.mjs` (33 passed). Не реализовывать повторно.

**Цель:** игрок всегда видит ключевые показатели — не нужно заходить в боковую панель.

**Что сделать:**

1. В `index.html`, в `<header id="top-bar">`, добавить блок ресурсов между датой и кнопкой хода:
   ```html
   <div id="resource-bar">
     <div class="res-item" id="res-gold"    title="Казна">💰 <span>—</span></div>
     <div class="res-item" id="res-troops"  title="Войска">⚔ <span>—</span></div>
     <div class="res-item" id="res-food"    title="Снабжение">🌾 <span>—</span></div>
     <div class="res-item" id="res-pop"     title="Население">👥 <span>—</span></div>
   </div>
   ```

2. CSS для `#resource-bar`:
   - `display: flex; gap: 4px; align-items: center`
   - `.res-item`: `padding: 0 10px; height: 100%; display: flex; align-items: center; gap: 5px; cursor: pointer; border-left: 1px solid var(--border-gold); font-size: 13px; color: var(--text-light)`
   - `.res-item:hover`: `background: rgba(212,168,83,0.08); color: var(--text-gold)`
   - `.res-item span`: `font-family: 'Cinzel', serif; font-size: 12px; min-width: 40px`

3. В `panels.js` (или где обновляется UI после хода): добавить функцию `updateResourceBar(state)`:
   - Найти элементы `#res-gold span`, `#res-troops span` и т.д.
   - Обновлять значения: `el.textContent = formatNum(state.treasury)`
   - Добавить суффикс дельты: если растёт — `+45` зелёным, если падает — `-12` красным
   - Вызывать `updateResourceBar` после каждого хода и при загрузке

4. При клике на ресурс — открывать соответствующий оверлей (казна → `#treasury-overlay`, войска → армейская панель).

**Тест Шага 21:**
- После загрузки игры в топ-баре видны 4 ресурса с реальными числами.
- После нажатия "Следующий ход" числа обновляются.
- Наведение на ресурс → подсветка.
- Клик на 💰 → открывается экран казны.

---

### Шаг 22 — API ключи → иконка настроек ⚙

> **Статус:** ✅ **ВЫПОЛНЕНО** — файл `ui/apikey.js` + #settings-btn/#settings-modal в `index.html`, тесты `tests/test_arma_stage22.mjs` (28 passed). Не реализовывать повторно.

**Цель:** убрать технический контент из игрового UI в отдельное модальное окно.

**Что сделать:**

1. В `#top-bar` добавить иконку настроек крайней справа (после кнопки хода):
   ```html
   <button id="settings-btn" onclick="toggleSettingsModal()" title="Настройки">⚙</button>
   ```
   CSS: `background: none; border: none; color: var(--text-dim); font-size: 16px; cursor: pointer; padding: 0 8px`
   Hover: `color: var(--text-gold)`

2. Создать модальное окно `#settings-modal` (добавить в конец `<body>`):
   - Структура: overlay + box (400px), заголовок "Настройки", вкладки "API ключи" / "Интерфейс"
   - Перенести всё содержимое `#api-key-inline-panel` и `#api-key-section` внутрь вкладки "API ключи"
   - Кнопка закрытия `✕` в правом верхнем углу

3. Скрыть/удалить из `#right-panel` блок `#api-key-inline-panel`.
4. Скрыть/удалить из `#bottom-area` блок `#api-key-section`.
5. JS: `toggleSettingsModal()` — показывает/скрывает модал, закрытие по Esc и по клику на overlay.

**Тест Шага 22:**
- В правой панели и нижней строке API ключи больше не видны.
- Клик на ⚙ → модал открывается с полями для ключей.
- Сохранение ключей в модале работает так же как раньше.
- `Esc` закрывает модал.

---

### Шаг 23 — Иконки-вкладки в левой панели

> **Статус:** ✅ **ВЫПОЛНЕНО** — `index.html` + `ui/panels.js` (#left-nav / .lnav-btn / renderLeftPanelTab), тесты `tests/test_arma_stage23.mjs` (34 passed). Не реализовывать повторно.

**Цель:** заменить длинный скролл в левой панели на навигацию по вкладкам.

**Что сделать:**

1. Изменить структуру `#left-panel`:
   ```html
   <div id="left-panel">
     <nav id="left-nav">
       <button class="lnav-btn active" data-tab="overview" title="Обзор нации">🗺</button>
       <button class="lnav-btn" data-tab="army"     title="Армия">⚔</button>
       <button class="lnav-btn" data-tab="economy"  title="Экономика">💰</button>
       <button class="lnav-btn" data-tab="diplomacy" title="Дипломатия">🤝</button>
       <button class="lnav-btn" data-tab="laws"     title="Законы">📜</button>
     </nav>
     <div id="left-panel-content">
       <!-- контент вкладки -->
     </div>
   </div>
   ```

2. CSS:
   - `#left-panel`: `display: flex; flex-direction: row` (иконки слева, контент справа)
   - `#left-nav`: `width: 40px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; border-right: 1px solid var(--border-gold); flex-shrink: 0`
   - `.lnav-btn`: `width: 34px; height: 34px; background: none; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; color: var(--text-dim); transition: all 0.15s`
   - `.lnav-btn:hover`: `background: rgba(212,168,83,0.1); color: var(--text-gold)`
   - `.lnav-btn.active`: `background: rgba(212,168,83,0.15); color: var(--text-gold); box-shadow: inset 2px 0 0 var(--border-gold)`
   - `#left-panel-content`: `flex: 1; overflow-y: auto; padding: 8px`

3. JS: при клике на `.lnav-btn` — убрать `active` у всех, добавить к кликнутой, вызвать `renderLeftPanelTab(tabName)`.
4. `renderLeftPanelTab` — переключает отображаемый контент (существующие функции рендера переиспользуются).

**Тест Шага 23:**
- Левая панель показывает 5 иконок-вкладок слева.
- Клик на ⚔ → контент меняется на военный.
- Активная вкладка подсвечена.
- Контент прокручивается внутри `#left-panel-content`, иконки фиксированы.

---

## БЛОК J — Уведомления и навигация (Шаги 27–29)

---

### Шаг 27 — Toast-уведомления

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `10e2859`, файл `ui/toast.js` (showToast + #toast-container). Автотеста нет — фича подтверждена по коммиту и файлу. Не реализовывать повторно.

**Цель:** важные события всплывают как краткие уведомления — не теряются в логе.

**Что сделать:**

1. Добавить контейнер в конец `<body>`:
   ```html
   <div id="toast-container"></div>
   ```
   CSS: `position: fixed; top: 54px; right: 12px; z-index: 9000; display: flex; flex-direction: column; gap: 6px; pointer-events: none`

2. JS: написать функцию `showToast(message, type, duration)`:
   - `type`: `'info'` | `'warning'` | `'danger'` | `'success'`
   - Создать `div.toast` с классом типа, добавить в `#toast-container`
   - Анимация появления: CSS `@keyframes toast-in` — `translateX(110%) → translateX(0)`, 0.25s
   - Автоудаление через `duration` мс (по умолчанию 4000). `danger` — не удалять автоматически, добавить кнопку `✕`
   - Анимация исчезновения: `translateX(110%)`, 0.2s, затем `remove()`

3. CSS `.toast`:
   ```css
   .toast {
     min-width: 240px; max-width: 320px;
     padding: 10px 14px;
     background: rgba(20,15,8,0.96);
     border-left: 3px solid var(--border-gold);
     border-radius: 3px;
     font-size: 12px; color: var(--text-light);
     box-shadow: 0 4px 16px rgba(0,0,0,0.5);
     pointer-events: auto;
     backdrop-filter: blur(6px);
   }
   .toast.warning  { border-left-color: #ff9800; }
   .toast.danger   { border-left-color: #f44336; background: rgba(30,10,8,0.97); }
   .toast.success  { border-left-color: #4caf50; }
   ```

4. Вызывать `showToast` из существующих игровых событий:
   - Война объявлена → `showToast('⚔ Рим объявил войну!', 'danger')`
   - Дефицит казны → `showToast('💰 Казна пуста — дефицит!', 'warning')`
   - Регион захвачен → `showToast('🏳 Захвачена Мессина', 'success')`

**Тест Шага 27:**
- Вызвать `showToast('Тест!', 'warning')` в консоли — уведомление появляется справа.
- Через 4 сек уведомление исчезает (кроме `danger`).
- `danger`-уведомление имеет кнопку закрытия.
- Несколько уведомлений не накладываются, а выстраиваются столбцом.

---

### Шаг 28 — Горячие клавиши

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `86aeb6f` (onHotkey + closeTopModal + вкладка настроек). Автотеста нет — фича подтверждена по коммиту. Не реализовывать повторно.

**Цель:** ускорить навигацию — без мыши открывать основные экраны.

**Что сделать:**

1. В основном JS добавить глобальный слушатель `document.addEventListener('keydown', onHotkey)`.

2. Таблица горячих клавиш:

   | Клавиша | Действие | Функция |
   |---------|---------|---------|
   | `Space` | Завершить ход | `processTurn()` |
   | `E` | Вкладка Экономика | `switchLeftTab('economy')` |
   | `D` | Вкладка Дипломатия | `switchLeftTab('diplomacy')` |
   | `A` | Вкладка Армия | `switchLeftTab('army')` |
   | `Esc` | Закрыть открытую панель / модал | `closeTopModal()` |
   | `Tab` | Перейти к следующему алерту | `focusNextAlert()` |
   | `M` | Сменить режим карты | `cycleMapMode()` |
   | `/` | Фокус на поле ввода команды | `focusCommandInput()` |

3. `onHotkey(e)`:
   - Игнорировать если `e.target` — это `<input>` или `<textarea>` (не мешать вводу)
   - Игнорировать если зажаты `Ctrl`, `Alt`, `Meta`
   - Для `Space` — `e.preventDefault()` (не скроллить страницу)

4. Добавить тултип к кнопке "Следующий ход": `title="Следующий ход [Space]"`.
5. Показать подсказку по горячим клавишам в модале ⚙: таблица всех шорткатов.

**Тест Шага 28:**
- Нажать `E` — переключается вкладка Экономика в левой панели.
- Нажать `/` — курсор появляется в поле ввода команды.
- Нажать `Space` в поле ввода — хотки НЕ срабатывают (ввод текста не прерывается).
- Нажать `Esc` — закрывается последний открытый оверлей.

---

### Шаг 29 — Режимы карты (Map modes)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `459fece`, `ui/map.js` (setMapMode + #map-mode-bar), тесты `tests/test_arma_stage29.mjs` (47 passed). Не реализовывать повторно.

**Цель:** быстро переключать визуализацию карты между политическим, экономическим и военным видами.

**Что сделать:**

1. Добавить панель режимов над картой (или в левом верхнем углу карты):
   ```html
   <div id="map-mode-bar">
     <button class="mm-btn active" data-mode="political" title="Политический [1]">🗺</button>
     <button class="mm-btn" data-mode="economy"  title="Экономика [2]">💰</button>
     <button class="mm-btn" data-mode="military" title="Военный [3]">⚔</button>
     <button class="mm-btn" data-mode="population" title="Население [4]">👥</button>
   </div>
   ```
   CSS: `position: absolute; top: 8px; left: 8px; z-index: 500; display: flex; gap: 4px`
   `.mm-btn`: `width: 32px; height: 32px; background: rgba(13,10,5,0.85); border: 1px solid var(--border-gold); border-radius: 3px; cursor: pointer; font-size: 15px`
   `.mm-btn.active`: `background: rgba(107,79,26,0.5); border-color: var(--accent)`

2. JS: написать `setMapMode(mode)`:
   - `political` — стандартные цвета наций (текущий вид, ничего не менять)
   - `economy` — перекрасить регионы через Leaflet `setStyle`: цвет = тепловая карта по `region.wealth` (от тёмного к светло-жёлтому, 5 градаций)
   - `military` — показать только регионы с армиями, остальные затемнить (`opacity: 0.4`)
   - `population` — перекрасить по `region.population` (от светлого к тёмно-синему)

3. Хоткеи `1`–`4` переключают режим (добавить в таблицу Шага 28).
4. При переключении режима — анимация: плавный переход цветов через Leaflet `setStyle` с `transition: fill 0.3s` в CSS.

**Тест Шага 29:**
- Клик на 💰 → регионы перекрашиваются в тепловую карту по богатству.
- Клик на ⚔ → регионы без армий затемняются.
- Нажать `2` — режим экономики активируется.
- Возврат на `🗺` → политический вид восстанавливается.

---

## БЛОК K — Карта и интерактивность (Шаги 30–32)

---

### Шаг 30 — Контекстное меню правой кнопкой мыши

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `bbb7d1c`, `ui/map.js` (showContextMenu + #ctx-menu), тесты `tests/test_arma_stage30.mjs` (61 passed). Не реализовывать повторно.

**Цель:** самые частые действия на регион — в 1 клик, без открытия боковой панели.

**Что сделать:**

1. Добавить `<div id="ctx-menu"></div>` в конец `<body>`:
   ```css
   #ctx-menu {
     position: fixed; z-index: 8000;
     min-width: 160px;
     background: rgba(13,10,5,0.97);
     border: 1px solid var(--border-gold);
     border-radius: 3px;
     box-shadow: 0 4px 16px rgba(0,0,0,0.6);
     display: none;
     backdrop-filter: blur(4px);
   }
   .ctx-item {
     padding: 7px 14px; font-size: 12px;
     color: var(--text-light); cursor: pointer;
     display: flex; align-items: center; gap: 8px;
     border-bottom: 1px solid rgba(107,79,26,0.15);
     transition: background 0.1s;
   }
   .ctx-item:hover { background: rgba(212,168,83,0.1); color: var(--text-gold); }
   .ctx-item:last-child { border-bottom: none; }
   .ctx-separator { height: 1px; background: rgba(107,79,26,0.25); margin: 2px 0; }
   ```

2. В Leaflet: при `layer.on('contextmenu', e)` на регионе:
   - `e.originalEvent.preventDefault()`
   - Вызвать `showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, region)`

3. `showContextMenu(x, y, region)`:
   - Определить доступные пункты меню по состоянию региона:
     - Всегда: `📜 Подробности` → открывает `#region-info`
     - Если регион чужой + есть армия рядом: `⚔ Атаковать`
     - Если регион чужой + мир: `🤝 Предложить союз`
     - Если регион свой: `🏗 Построить`, `📦 Управление`
   - Позиционировать `#ctx-menu` с учётом края экрана (не выходить за viewport)
   - `display: block`

4. Закрывать меню при: `document.addEventListener('click', closeCtxMenu)` и `Esc`.

**Тест Шага 30:**
- Правый клик по региону → меню появляется рядом с курсором.
- Меню не выходит за край экрана (проверить в правом нижнем углу карты).
- Клик на пункт меню выполняет действие.
- Клик в любом другом месте → меню закрывается.

---

### Шаг 31 — Индикатор прогресса хода

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `5ffa82f`, `ui/input.js` (#turn-progress + markTurnAction), тесты `tests/test_arma_stage31.mjs` (50 passed). Не реализовывать повторно.

**Цель:** показать что уже сделано за текущий ход и что ещё доступно.

**Что сделать:**

1. Добавить в `#top-bar` между ресурс-баром и кнопкой хода:
   ```html
   <div id="turn-progress" title="Прогресс хода">
     <div class="tp-dots" id="tp-dots"></div>
     <span id="tp-label">0/0</span>
   </div>
   ```
   CSS: `display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-dim)`
   `.tp-dots`: `display: flex; gap: 3px`
   `.tp-dot`: `width: 8px; height: 8px; border-radius: 50%; background: rgba(107,79,26,0.3); border: 1px solid var(--border-gold); transition: background 0.2s`
   `.tp-dot.done`: `background: var(--border-gold)`

2. Определить список "действий хода" — массив `TURN_ACTIONS`:
   ```js
   TURN_ACTIONS = [
     { id: 'taxes',    label: 'Налоги собраны' },
     { id: 'orders',   label: 'Приказы выданы' },
     { id: 'diplo',    label: 'Дипломатия' },
     { id: 'build',    label: 'Строительство' },
     { id: 'events',   label: 'События рассмотрены' },
   ]
   ```

3. JS: `markTurnAction(id)` — помечает действие выполненным, перерисовывает точки и счётчик `2/5`.
4. При нажатии "Следующий ход" — сбросить все действия (`resetTurnProgress()`).
5. При наведении на `#turn-progress` — тултип перечисляет что сделано / не сделано.

**Тест Шага 31:**
- В топ-баре 5 маленьких точек.
- При выдаче приказа — одна точка заполняется.
- Счётчик `2/5` обновляется.
- После нажатия хода — точки сбрасываются.

---

### Шаг 32 — Drag-to-resize боковых панелей

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `bb6b6cc`, файл `ui/panel_resize.js` (.panel-resizer + collapsed). Автотеста нет — фича подтверждена по коммиту и файлу. Не реализовывать повторно.

**Цель:** игрок может уменьшить боковые панели чтобы видеть больше карты.

**Что сделать:**

1. Добавить `<div class="panel-resizer" id="left-resizer"></div>` между `#left-panel` и `#center-panel`.
   CSS:
   ```css
   .panel-resizer {
     width: 4px; flex-shrink: 0;
     background: var(--border-gold);
     opacity: 0.3; cursor: col-resize;
     transition: opacity 0.15s;
   }
   .panel-resizer:hover, .panel-resizer.dragging { opacity: 0.8; }
   ```

2. JS: `initPanelResize(resizerId, panelId, minW, maxW)`:
   - `mousedown` на resizer → начать отслеживание `mousemove` на `document`
   - `mousemove`: `newW = clamp(startW + dx, minW, maxW)` → `panel.style.width = newW + 'px'`
   - `mouseup` → остановить, сохранить в `localStorage`
   - `minW = 40` (только иконки), `maxW = 360`

3. При `width < 80px` — скрыть `#left-panel-content`, показать только иконки `#left-nav` (collapsed mode).
4. При загрузке: восстановить ширину из `localStorage`.

**Тест Шага 32:**
- Потянуть за разделитель → левая панель меняет ширину.
- При ширине < 80px контент скрывается, остаются только иконки.
- Перезагрузка страницы → ширина сохранена.
- FPS не падает при перетаскивании.

---

## БЛОК L — Финальная полировка (Шаги 33–35)

---

### Шаг 33 — Строка статуса внизу (Status bar)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `2e05b46`, `index.html` (#status-bar) + `engine/turn.js` (setAIStatus/markSaved/fps). Автотеста нет — фича подтверждена по коммиту. Не реализовывать повторно.

**Цель:** все технические статусы в одну строку — освобождает правую панель и нижнюю область.

**Что сделать:**

1. Добавить `<div id="status-bar"></div>` после `#app` (или как последний элемент внутри `#app`):
   ```html
   <div id="status-bar">
     <span id="sb-game">Сиракузы · 301 BC · Ход 12</span>
     <span class="sb-sep">|</span>
     <span id="sb-save">💾 Сохранено 2 мин назад</span>
     <span class="sb-sep">|</span>
     <span id="sb-ai">🤖 AI: готов</span>
     <span class="sb-sep">|</span>
     <span id="sb-fps">60 fps</span>
   </div>
   ```

2. CSS:
   ```css
   #status-bar {
     height: 22px; flex-shrink: 0;
     background: #0a0705;
     border-top: 1px solid rgba(107,79,26,0.3);
     display: flex; align-items: center;
     gap: 0; padding: 0 10px;
     font-size: 10px; color: var(--text-dim);
     font-family: 'Georgia', serif;
   }
   .sb-sep { margin: 0 8px; opacity: 0.3; }
   #sb-ai.ready   { color: #4caf50; }
   #sb-ai.busy    { color: #ff9800; }
   #sb-ai.error   { color: #f44336; }
   ```

3. JS: обновлять `#sb-ai` при изменении статуса AI (запрос отправлен → `busy`, ответ получен → `ready`).
4. `#sb-save`: обновлять при автосохранении — `'Сохранено только что'`, затем через таймер → `'Сохранено N мин назад'`.
5. `#sb-fps`: опционально — считать FPS через `requestAnimationFrame`, обновлять раз в 2 сек.

**Тест Шага 33:**
- Строка статуса видна в самом низу экрана под нижней строкой.
- При отправке AI-запроса — `🤖 AI: обрабатывает...` жёлтым.
- После ответа — `🤖 AI: готов` зелёным.
- Время сохранения обновляется корректно.

---

### Шаг 34 — Поиск по игре

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `94779a7`, `index.html` (#search-btn + #search-panel + toggleSearchPanel). Автотеста нет — фича подтверждена по коммиту и DOM (`index.html:526/9023`). Не реализовывать повторно.

**Цель:** быстрый доступ к нациям, персонажам, регионам без навигации по панелям.

**Что сделать:**

1. Добавить кнопку поиска в `#top-bar`: `<button id="search-btn" title="Поиск [/]">🔍</button>`

2. Добавить панель поиска (скрытую по умолчанию):
   ```html
   <div id="search-panel" class="hidden">
     <input id="search-input" type="text" placeholder="Поиск нации, региона, персонажа...">
     <div id="search-results"></div>
   </div>
   ```
   CSS: `position: fixed; top: calc(var(--header-h) + 4px); left: 50%; transform: translateX(-50%); width: 400px; z-index: 7000; background: rgba(13,10,5,0.98); border: 1px solid var(--border-gold); border-radius: 4px; backdrop-filter: blur(8px)`

3. JS: `onSearchInput(query)` — при каждом нажатии клавиши (debounce 150ms):
   - Искать по `regions` (имя региона), `nations` (имя нации), `characters` (имя персонажа)
   - Показывать максимум 8 результатов сгруппированными:
     ```
     🗺 Регионы
       Сиракузы, Катания
     🏳 Нации
       Карфаген
     👤 Персонажи
       Менандр, посол
     ```
   - Клик на результат → перейти к нему (центрировать карту / открыть панель)

4. Открывать: клик на `🔍` или хоткей `/`. Закрывать: `Esc` или клик вне панели.

**Тест Шага 34:**
- Нажать `/` → поле поиска появляется в центре экрана.
- Ввести `Сир` → появляется результат "🗺 Сиракузы".
- Клик на результат → карта центрируется на регионе.
- Ввести имя персонажа → результат в категории 👤.

---

### Шаг 35 — Визуальный "пульс" для критических событий

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `4c1e840`, файл `ui/pulse.js` (triggerPulse + body.pulse-*), тесты `tests/test_arma_stage35.mjs` (37 passed). Не реализовывать повторно.

**Цель:** критические события мгновенно привлекают внимание — без звука, через визуальный эффект.

**Что сделать:**

1. Добавить псевдоэлемент в CSS:
   ```css
   body::after {
     content: '';
     position: fixed; inset: 0;
     pointer-events: none;
     z-index: 9999;
     opacity: 0;
     transition: opacity 0.1s;
   }
   body.pulse-war::after {
     background: radial-gradient(ellipse at center,
       transparent 40%,
       rgba(200, 30, 30, 0.18) 100%);
     animation: pulse-edge 2s ease-out forwards;
   }
   body.pulse-gold::after {
     background: radial-gradient(ellipse at center,
       transparent 40%,
       rgba(212, 168, 83, 0.2) 100%);
     animation: pulse-edge 1.5s ease-out forwards;
   }
   @keyframes pulse-edge {
     0%   { opacity: 1; }
     100% { opacity: 0; }
   }
   ```

2. Таблица пульсов по событиям:

   | Событие | Класс | Цвет |
   |---------|-------|------|
   | Война объявлена | `pulse-war` | Красный |
   | Победа / захват | `pulse-gold` | Золото |
   | Казна пуста | `pulse-warning` | Жёлтый |
   | Персонаж умер | `pulse-dark` | Тёмно-серый |

3. JS: `triggerPulse(type)`:
   - Удалить все `pulse-*` классы с `body`
   - Добавить `body.classList.add('pulse-' + type)`
   - Через 2000ms — убрать класс

**Тест Шага 35:**
- Вызвать `triggerPulse('war')` в консоли → красное свечение по краям экрана на 2 сек.
- После завершения анимации класс удаляется, следующий пульс работает.
- Пульс не мешает кликам (pointer-events: none).
- На слабых устройствах нет просадки FPS (чисто CSS animation).

---

## Итоговая таблица всех 35 шагов

| Шаг | Блок | Файл | Суть |
|-----|------|------|------|
| 1–20 | A–G | engine/*, ui/battle_map_pixi.js | Pixi.js тактическая карта |
| 21 | H | index.html, panels.js | Ресурс-бар в топ-баре |
| 22 | H | index.html | API ключи → модал ⚙ |
| 23 | H | index.html | Иконки-вкладки левой панели |
| 24 | I | index.html | Лог как drawer |
| 25 | I | index.html | Ввод команды всегда виден |
| 26 | I | index.html, panels.js | Значки-алерты на вкладках |
| 27 | J | index.html | Toast-уведомления |
| 28 | J | index.html | Горячие клавиши |
| 29 | J | index.html, ui/map.js | Режимы карты |
| 30 | K | index.html, ui/map.js | Контекстное меню (ПКМ) |
| 31 | K | index.html | Индикатор прогресса хода |
| 32 | K | index.html | Drag-to-resize панелей |
| 33 | L | index.html | Строка статуса |
| 34 | L | index.html | Поиск по игре |
| 35 | L | index.html | Визуальный пульс событий |

---

# ЧАСТЬ 3 — Карта, регионы, персонажи

> Улучшения карты Leaflet, popup-панели регионов, системы персонажей.
> Каждый шаг независим — можно реализовывать в любом порядке.

---

## БЛОК M — Исправления и popup региона (Шаги 36–38)

---

### Шаг 36 — Исправить баг потери цветов регионов при перезагрузке

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `e7ca584`, `ui/map.js` (refreshRegionStyles + _colorRefreshTimer + страховочный setTimeout). `tests/test_arma_stage36.mjs` содержит drift от Шага 48 (sandbox не стабит `getIntelLevel`) — это регрессия теста, не реализации. Не реализовывать повторно.

**Цель:** после перезагрузки страницы регионы должны сразу отображаться в цветах наций — без клика.

**Причина бага:** в `map.js:1872` страховочный `setTimeout(refreshRegionStyles, 400)` срабатывает раньше чем Leaflet Canvas-рендерер завершает внутреннюю перестройку после `invalidateSize()`. Canvas очищается уже после того как цвета применены.

**Что сделать:**

1. В `initLeafletMap()` добавить третий страховочный вызов:
   ```js
   setTimeout(() => { if (leafletMap) refreshRegionStyles(); }, 1200);
   ```

2. Добавить слушатель на событие завершения рендера Leaflet Canvas:
   ```js
   leafletMap.on('layeradd', () => {
     clearTimeout(_colorRefreshTimer);
     _colorRefreshTimer = setTimeout(refreshRegionStyles, 100);
   });
   ```
   Переменная `_colorRefreshTimer` — дебаунс чтобы не вызывать `refreshRegionStyles` 300 раз подряд.

3. В `renderMap()` — если `leafletMap` уже существует (повторный вызов), принудительно вызвать:
   ```js
   leafletMap.invalidateSize();
   refreshRegionStyles();
   ```

4. В `refreshRegionStyles()` добавить защиту: если полигон не имеет `_renderer` — пропустить и добавить в очередь повтора.

**Тест Шага 36:**
- Перезагрузить страницу 5 раз — каждый раз регионы должны быть окрашены без клика.
- Изменить размер окна браузера (resize) — цвета не должны теряться.
- Открыть в новой вкладке — цвета сразу правильные.

---

### Шаг 37 — Переработать popup региона

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `ecebba1`, `ui/map.js` + `index.html` (header gradient, key stats, progress bars, footer, slide-in). `tests/test_arma_stage37.mjs` — 39/40 passed; 1 тест (`[2b] .ri-key-stat=3`) brittle (popup рендерится динамически), не блокер. Не реализовывать повторно.

**Цель:** из плоского HTML-блока сделать профессиональную информационную панель с иерархией данных.

**Что сделать:**

1. **Шапка панели** — заменить тонкий `border-left: 4px` на широкую цветную полосу + glassmorphism фон:
   ```css
   .region-info-header {
     background: linear-gradient(135deg,
       ${nationColor}33 0%,
       rgba(13,10,5,0.0) 60%);
     border-bottom: 2px solid ${nationColor}66;
     padding: 14px 16px 10px;
   }
   .ri-nation-stripe {
     height: 3px;
     background: ${nationColor};
     margin: -14px -16px 12px;
     border-radius: 0;
   }
   ```

2. **Блок ключевых цифр** — три числа крупно, сразу под шапкой (до вкладок):
   ```html
   <div class="ri-key-stats">
     <div class="ri-key-stat">
       <span class="ri-key-num">12,400</span>
       <span class="ri-key-lbl">👥 Население</span>
     </div>
     <div class="ri-key-stat">
       <span class="ri-key-num">+45</span>
       <span class="ri-key-lbl">💰 /ход</span>
     </div>
     <div class="ri-key-stat">
       <span class="ri-key-num">3,200</span>
       <span class="ri-key-lbl">⚔ Гарнизон</span>
     </div>
   </div>
   ```
   CSS: `display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid`
   `.ri-key-num`: `font-size: 18px; font-family: 'Cinzel'; color: var(--text-gold)`

3. **Прогресс-бары** — заменить текстовые `78%` на визуальные бары:
   ```html
   <div class="ri-bar-row">
     <span class="ri-bar-lbl">🌿 Плодородие</span>
     <div class="ri-bar-track">
       <div class="ri-bar-fill" style="width: 78%; background: #4caf50"></div>
     </div>
     <span class="ri-bar-val">78%</span>
   </div>
   ```

4. **Анимация появления** панели: при `panel.classList.remove('hidden')` добавлять класс `ri-entering`, CSS:
   ```css
   .region-info.ri-entering {
     animation: ri-slide-in 0.2s ease-out forwards;
   }
   @keyframes ri-slide-in {
     from { opacity: 0; transform: translateX(20px); }
     to   { opacity: 1; transform: translateX(0); }
   }
   ```

5. **Кнопки действий** — переместить в фиксированный футер панели (не внутри скроллируемого контента):
   ```html
   <div class="ri-footer">
     <button class="ri-action-btn primary">⚔ Собрать армию</button>
     <button class="ri-action-btn">🏗 Построить</button>
   </div>
   ```

**Тест Шага 37:**
- Клик на регион → панель появляется с анимацией slide-in.
- Три ключевые цифры видны крупно без скролла.
- Прогресс-бары отображают корректные значения.
- Кнопки действий всегда видны внизу (не скроллятся).
- Шапка имеет градиент в цвете нации.

---

### Шаг 38 — Анимированный индикатор вкладок (скользящий)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `cdc360b`, `ui/map.js` + `index.html` (.ri-tab-indicator / updateTabIndicator), тесты `tests/test_arma_stage38.mjs` (29 passed). Не реализовывать повторно.

**Цель:** переключение вкладок в popup региона с плавной анимацией — как в профессиональных приложениях.

**Что сделать:**

1. Добавить `div.ri-tab-indicator` внутрь `.ri-tabs`:
   ```html
   <div class="ri-tabs">
     <button class="ri-tab ri-tab--active" data-tab="info">ℹ Обзор</button>
     <button class="ri-tab" data-tab="build">🏗 Строить</button>
     <button class="ri-tab" data-tab="diplomacy">🤝 Дипломатия</button>
     <div class="ri-tab-indicator"></div>
   </div>
   ```

2. CSS:
   ```css
   .ri-tabs { position: relative; display: flex; border-bottom: 1px solid var(--border-gold); }
   .ri-tab { flex: 1; padding: 8px 4px; background: none; border: none;
             font-size: 11px; color: var(--text-dim); cursor: pointer; transition: color 0.15s; }
   .ri-tab--active { color: var(--text-gold); font-weight: 600; }
   .ri-tab-indicator {
     position: absolute; bottom: 0; height: 2px;
     background: var(--accent);
     transition: left 0.25s cubic-bezier(.4,0,.2,1), width 0.25s cubic-bezier(.4,0,.2,1);
     border-radius: 1px 1px 0 0;
   }
   ```

3. JS: функция `updateTabIndicator(activeBtn)`:
   ```js
   function updateTabIndicator(activeBtn) {
     const indicator = activeBtn.parentElement.querySelector('.ri-tab-indicator');
     indicator.style.left  = activeBtn.offsetLeft + 'px';
     indicator.style.width = activeBtn.clientWidth + 'px';
   }
   ```
   Вызывать при: первом рендере панели и при каждом `switchRegionTab()`.

4. Контент вкладки появляется с анимацией:
   ```css
   .ri-tab-content {
     animation: ri-tab-fade 0.15s ease-out;
   }
   @keyframes ri-tab-fade {
     from { opacity: 0; transform: translateY(4px); }
     to   { opacity: 1; transform: translateY(0); }
   }
   ```

**Тест Шага 38:**
- Открыть popup региона — индикатор стоит под первой вкладкой.
- Кликнуть на вторую вкладку — индикатор плавно скользит к ней за 250ms.
- Контент новой вкладки появляется с мягким fade-in.
- При разных количествах вкладок (2 или 3) индикатор корректно позиционируется.

---

## БЛОК N — Армии и события на карте (Шаги 39–41)

---

### Шаг 39 — Анимированные маркеры армий

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `1e1986a`, файл `ui/map_armies.js` (createArmyIcon/formatArmySize/smoothMoveArmyMarker) + CSS `.army-marker/.army-count` в `index.html:3752-3787`. `tests/test_arma_stage39.mjs` содержит brittle non-greedy regex `\.army-marker\s*\{([\s\S]*?)\}`, который первым захватывает override-блок `body.map-zoom-strategic .army-marker {}` (добавленный Шагом 44). Фича реализована, тест требует починки regex. Не реализовывать повторно.

**Цель:** заменить emoji-маркеры армий на SVG-иконки с цветом нации и анимацией выбора.

**Что сделать:**

1. Написать функцию `createArmyIcon(army, nationColor)` → возвращает `L.divIcon`:
   ```js
   function createArmyIcon(army, nationColor) {
     const size = army.size > 5000 ? 36 : army.size > 1000 ? 30 : 24;
     const html = `
       <div class="army-marker ${army.selected ? 'army-selected' : ''}"
            style="--nc: ${nationColor}; width:${size}px; height:${size}px">
         <svg viewBox="0 0 24 24" fill="${nationColor}">
           <path d="M12 2L15 9H22L16.5 13.5L18.5 21L12 17L5.5 21L7.5 13.5L2 9H9Z"/>
         </svg>
         <span class="army-count">${formatArmySize(army.size)}</span>
       </div>`;
     return L.divIcon({ html, className: '', iconSize: [size, size+14], iconAnchor: [size/2, size/2] });
   }
   ```

2. CSS `.army-marker`:
   ```css
   .army-marker {
     position: relative; display: flex; flex-direction: column;
     align-items: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
     transition: transform 0.15s;
   }
   .army-marker:hover { transform: scale(1.15); }
   .army-selected svg {
     filter: drop-shadow(0 0 6px var(--nc));
     animation: army-pulse 1.2s ease-in-out infinite;
   }
   @keyframes army-pulse {
     0%, 100% { opacity: 1; }
     50% { opacity: 0.6; }
   }
   .army-count {
     font-size: 9px; color: #fff; background: rgba(0,0,0,0.65);
     padding: 0 3px; border-radius: 3px; margin-top: 2px;
     font-family: 'Georgia', serif; white-space: nowrap;
   }
   ```

3. Иконка типа войск из **game-icons.net** (CC BY 3.0):
   - Infantry: `crossed-swords`
   - Cavalry: `horse-head`
   - Archers: `arrow-cluster`
   - Пути SVG встроить inline (не внешние файлы).

4. При движении армии — `leafletMap.motion` (MIT): плавно перемещает маркер по маршруту.
   Если `leafletMap.motion` недоступен — обойтись через `setInterval` + `marker.setLatLng(interpolate(from, to, t))`.

**Тест Шага 39:**
- Армии отображаются как цветные звёзды/значки (цвет нации).
- Выбранная армия пульсирует.
- При наведении — маркер увеличивается на 15%.
- Числовой размер армии виден под иконкой (`4.2k`, `800`).

---

### Шаг 40 — Прогресс строительства на карте

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `834d035`, `ui/map_armies.js` / `ui/map_events.js` (build-progress-marker + bpm-bar/bpm-fill), тесты `tests/test_arma_stage40.mjs` (47 passed). Не реализовывать повторно.

**Цель:** когда в регионе идёт строительство — показать визуальный индикатор прямо на карте.

**Что сделать:**

1. После каждого хода: найти все регионы с активным строительством (`gameRegion.building_queue`).

2. Для каждого такого региона создать `L.marker` с `divIcon`:
   ```html
   <div class="build-progress-marker">
     🏗
     <div class="bpm-bar">
       <div class="bpm-fill" style="width: ${pct}%"></div>
     </div>
     <span class="bpm-turns">${turns} хода</span>
   </div>
   ```
   CSS: маркер 48×32px, полоска прогресса 44×3px золотого цвета.

3. Хранить маркеры в словаре `buildMarkers = {}` (regionId → marker). При обновлении — удалять старый, добавлять новый.

4. При завершении строительства — маркер удаляется + всплывает иконка-пульс `✓` на 2 сек (шаг 41).

**Тест Шага 40:**
- Начать строительство в регионе → на карте появляется `🏗` с полоской прогресса.
- После хода прогресс увеличивается.
- После завершения маркер исчезает.

---

### Шаг 41 — Пульсирующие иконки событий на карте

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `29e4999`, файл `ui/map_events.js` (showMapEvent + SVG overlay pulse), тесты `tests/test_arma_stage41.mjs` (47 passed). Не реализовывать повторно.

**Цель:** важные события (восстание, чума, победа) визуально отображаются на карте в момент возникновения.

**Что сделать:**

1. Создать `L.SVGOverlay` поверх карты для событийных иконок:
   ```js
   const eventSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
   eventSvg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:450';
   leafletMap.getPanes().overlayPane.appendChild(eventSvg);
   ```

2. JS: функция `showMapEvent(regionId, type, duration)`:
   - Получить центр региона: `regionLayers[regionId].getCenter()`
   - Конвертировать в пиксели: `leafletMap.latLngToLayerPoint(center)`
   - Добавить в SVG группу `<g>`:
     ```svg
     <circle cx={x} cy={y} r="8" fill={color} opacity="0.8">
       <animate attributeName="r" from="8" to="24" dur="1s" repeatCount="2"/>
       <animate attributeName="opacity" from="0.8" to="0" dur="1s" repeatCount="2"/>
     </circle>
     <text x={x} y={y} text-anchor="middle" dominant-baseline="middle" font-size="14">{icon}</text>
     ```
   - Через `duration` мс — удалить группу из SVG.

3. Таблица иконок событий:
   | Событие | Иконка | Цвет круга |
   |---------|--------|-----------|
   | Восстание | 🔥 | #f44336 |
   | Чума | 💀 | #9c27b0 |
   | Урожай | 🌾 | #4caf50 |
   | Победа | ⭐ | #ffd700 |
   | Смерть персонажа | 💔 | #607d8b |
   | Постройка завершена | 🏛 | #2196f3 |

4. Обновлять позиции при зуме/пане: `leafletMap.on('zoom move', repositionEventSvg)`.

**Тест Шага 41:**
- Вызвать `showMapEvent('sicily_1', 'revolt', 3000)` → над регионом пульсирует 🔥.
- Через 3 сек иконка исчезает.
- При зуме/пане иконки остаются над правильными регионами.
- Несколько событий одновременно не накладываются.

---

## БЛОК O — Торговля, двор, зум (Шаги 42–44)

---

### Шаг 42 — Анимированные торговые маршруты

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `ba10fa8`, `ui/map.js` (SVG trade-route + stroke-dashoffset анимация). Отдельного `test_arma_stage42.mjs` нет, есть `tests/step_42_trade_routes_test.cjs`. Не реализовывать повторно.

**Цель:** линии торговли показывают направление потока ресурсов — движущиеся точки вдоль маршрута.

**Что сделать:**

1. Существующие `L.polyline` торговых маршрутов (`tradeRouteLines`) заменить на SVG-пути с анимацией.

2. Для каждого маршрута создать SVG `<path>` с `stroke-dasharray` и анимацией `stroke-dashoffset`:
   ```svg
   <path d="M x1,y1 L x2,y2"
         stroke="#d4a853" stroke-width="1.5" fill="none"
         stroke-dasharray="6 8" opacity="0.6">
     <animateTransform attributeName="stroke-dashoffset"
       from="0" to="-14" dur="1s" repeatCount="indefinite"/>
   </path>
   ```
   Точки "двигаются" вдоль линии создавая иллюзию потока.

3. Ширина линии пропорциональна объёму торговли: `weight = 1 + trade_volume / 500`.

4. Цвет по типу товара:
   - Зерно 🌾 → `#a5d6a7` (зелёный)
   - Металл ⚙ → `#b0bec5` (серый)
   - Роскошь 💎 → `#ce93d8` (фиолетовый)
   - Общий → `#d4a853` (золотой)

5. При отключении режима торговых маршрутов — SVG-пути удаляются, при включении — пересоздаются.

**Тест Шага 42:**
- Включить показ торговых маршрутов → линии с движущимися точками.
- Ширина линий различается (более богатые маршруты — толще).
- При зуме линии масштабируются корректно.
- Анимация не роняет FPS ниже 30.

---

### Шаг 43 — Экран должностей: переработка правой панели (Двор)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `7d854b2` (4 должности Стратег/Казначей/Посол/Советник, `nation.court_positions`, openAssignModal, advisor-chip). Автотеста нет — фича подтверждена по коммиту. Не реализовывать повторно.

**Цель:** заменить список персонажей на систему должностей — персонажи назначаются на роли.

**Что сделать:**

1. Изменить структуру `#right-panel`:
   ```html
   <div id="right-panel">
     <div class="court-header">
       <span class="court-title">👑 Двор Агафокла</span>
       <span class="court-era">Сиракузы · 301 BC</span>
     </div>

     <div id="positions-list">
       <!-- Слоты должностей -->
       <div class="position-slot" data-role="strategos">
         <div class="pos-role-icon">⚔</div>
         <div class="pos-info">
           <div class="pos-title">Стратег</div>
           <div class="pos-holder" id="pos-strategos">— вакантно —</div>
         </div>
         <button class="pos-assign-btn" onclick="openAssignModal('strategos')">↔</button>
       </div>
       <!-- ещё 3-4 должности -->
     </div>

     <div class="court-section-title">Советники</div>
     <div id="free-advisors">
       <!-- персонажи без должности -->
     </div>
   </div>
   ```

2. CSS `.position-slot`:
   ```css
   .position-slot {
     display: flex; align-items: center; gap: 8px;
     padding: 8px 10px; margin-bottom: 4px;
     background: rgba(40,25,8,0.4);
     border: 1px solid var(--border-gold);
     border-radius: 4px; cursor: pointer;
     transition: background 0.15s;
   }
   .position-slot:hover { background: rgba(60,40,12,0.5); }
   .pos-role-icon { font-size: 20px; flex-shrink: 0; width: 28px; text-align: center; }
   .pos-title { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; }
   .pos-holder { font-size: 12px; color: var(--text-gold); font-family: 'Cinzel', serif; }
   .pos-assign-btn { margin-left: auto; background: none; border: 1px solid rgba(107,79,26,0.3);
                     color: var(--text-dim); border-radius: 3px; padding: 2px 6px; cursor: pointer; }
   ```

3. Должности по умолчанию:
   - ⚔ Стратег — бонус к армии
   - 💰 Казначей — бонус к доходу
   - 🤝 Посол — бонус к дипломатии
   - 📜 Советник — бонус к внутренней политике

4. JS: `openAssignModal(role)` — открывает модал со списком доступных персонажей, отсортированных по релевантному навыку для роли. Клик "Назначить" → `assignCharacter(charId, role)`.

5. Свободные советники — маленькие "чипы" с именем и главным навыком:
   ```html
   <div class="advisor-chip" onclick="showCharacterDetail(id)">
     <span class="adv-avatar">😐</span>
     <span class="adv-name">Демокрит</span>
     <span class="adv-skill">⚔6</span>
   </div>
   ```

**Тест Шага 43:**
- Правая панель показывает 4 слота должностей.
- Клик на `↔` → модал с персонажами для назначения.
- После назначения — имя персонажа появляется в слоте.
- Свободные советники отображаются как чипы ниже должностей.

---

### Шаг 44 — Стратегические уровни зума

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `23d94d5`, `ui/map.js` (strategic/regional/detailed + CSS `body.map-zoom-*`), тесты `tests/test_arma_stage44.mjs` (53 passed). Не реализовывать повторно.

**Цель:** на разных уровнях зума карта показывает разный уровень детализации.

**Что сделать:**

1. Определить три уровня зума:
   ```js
   const ZOOM_LEVELS = {
     strategic: { max: 4 },   // zoom < 4 — вид сверху
     regional:  { min: 4, max: 6.5 }, // zoom 4-6.5 — текущий вид
     detailed:  { min: 6.5 },  // zoom > 6.5 — детальный
   };
   ```

2. Добавить слушатель `leafletMap.on('zoomend', onZoomChange)`.

3. **Стратегический вид** (`zoom < 4`):
   - Скрыть мелкие подписи регионов (уже `_labelTimerId` управляет этим — расширить логику)
   - Увеличить `fillOpacity` регионов до 0.85 (цвета наций ярче)
   - Маркеры армий: уменьшить до 18px, показывать только флаг нации
   - Скрыть `#map-mode-bar` (не нужен на этом зуме)

4. **Детальный вид** (`zoom > 6.5`):
   - Добавить иконки построек на регионах: для каждого региона игрока — `L.marker` с `divIcon` содержащим список построек в миниатюре
   - Показывать численность гарнизона как число под флагом
   - Торговые маршруты — утолщённые, с названиями товаров

5. Переходы между уровнями — плавные через CSS `transition: opacity 0.3s` на соответствующих слоях.

**Тест Шага 44:**
- При `zoom < 4` карта упрощается: крупные цветные зоны.
- При `zoom > 6.5` на регионах игрока видны иконки построек.
- Маркеры армий адаптируют размер к уровню зума.
- Переходы между уровнями плавные.

---

## БЛОК P — Визуальная информация (Шаги 45–47)

---

### Шаг 45 — Сезонный визуал карты

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `6512530`, `index.html` (#season-overlay + SEASON_STYLES + getCurrentSeason + applySeasonVisual), тесты `tests/test_arma_stage45.mjs` (45 passed). Не реализовывать повторно.

**Цель:** сезоны из `super_ou.js` (`tick % 4`) визуально отображаются на карте и в интерфейсе.

**Что сделать:**

1. В `index.html` добавить div-оверлей поверх карты:
   ```html
   <div id="season-overlay"></div>
   ```
   CSS: `position:absolute; inset:0; pointer-events:none; z-index:200; transition: background 2s ease, filter 2s ease`

2. JS: функция `applySeasonVisual(season)` (season = 0–3):
   ```js
   const SEASON_STYLES = {
     0: { // Весна
       overlay: 'rgba(100,180,80,0.04)',
       filter:  'hue-rotate(8deg) saturate(1.15)',
       icon: '🌸', label: 'Весна'
     },
     1: { // Лето
       overlay: 'rgba(255,200,50,0.05)',
       filter:  'brightness(1.04) saturate(0.92)',
       icon: '☀', label: 'Лето'
     },
     2: { // Осень
       overlay: 'rgba(180,100,30,0.07)',
       filter:  'hue-rotate(-12deg) sepia(0.2)',
       icon: '🍂', label: 'Осень'
     },
     3: { // Зима
       overlay: 'rgba(180,210,240,0.06)',
       filter:  'saturate(0.5) brightness(0.92)',
       icon: '❄', label: 'Зима'
     }
   };
   ```
   Применить: `seasonOverlay.style.background = style.overlay`, `leafletMap.getContainer().style.filter = style.filter`.

3. В топ-баре обновить иконку сезона рядом с датой: `🌸 Весна · 301 BC`.

4. Вызывать `applySeasonVisual` после каждого хода и при загрузке игры.

**Тест Шага 45:**
- При загрузке карта имеет визуальный фильтр соответствующего сезона.
- После нескольких ходов сезон меняется, фильтр плавно переходит (2s transition).
- Иконка сезона в топ-баре обновляется.
- Фильтр не мешает кликам и интерактивности карты.

---

### Шаг 46 — Спарклайны трендов в ресурс-баре

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `e97c267`, `ui/panels.js` (drawSparkline + history) + `index.html` (.res-sparkline canvas), тесты `tests/test_arma_stage46.mjs` (43 passed). Не реализовывать повторно.

**Цель:** рядом с каждым ресурсом — мини-график за последние 8 ходов (рост/падение видны сразу).

**Что сделать:**

1. В `GAME_STATE` добавить историю ресурсов:
   ```js
   GAME_STATE.history = {
     treasury:   [],  // последние 10 значений
     army_size:  [],
     population: [],
     food:       [],
   };
   ```
   После каждого хода: `GAME_STATE.history.treasury.push(GAME_STATE.treasury)`, обрезать до 10 элементов.

2. Написать функцию `drawSparkline(canvas, values, color)`:
   - `canvas` — HTMLCanvasElement 44×14px
   - Нормализовать values в [0, 1]
   - Нарисовать полилинию через все точки
   - Последняя точка — круг-маркер
   - Цвет: зелёный если последнее > предпоследнего, красный если меньше

3. В каждый `.res-item` добавить `<canvas class="res-sparkline" width="44" height="14"></canvas>`.

4. В `updateResourceBar(state)` — после обновления числа вызвать `drawSparkline(canvas, history, color)`.

5. Стрелка тренда рядом с числом: `↗ +45` (зелёный) или `↘ -12` (красный).

**Тест Шага 46:**
- В топ-баре рядом с каждым ресурсом виден мини-график.
- После 3+ ходов график показывает историю изменений.
- При росте — зелёная линия, при падении — красная.
- Canvas не вызывает layout reflow (размер фиксирован).

---

### Шаг 47 — Планировщик маршрутов армии

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `b569061`, `ui/map_armies.js` (hover-preview маршрута + findArmyPath + pointer-tooltip). Отдельного `test_arma_stage47.mjs` нет, есть `tests/step_47_army_route_planner_test.cjs`. Не реализовывать повторно.

**Цель:** показать предполагаемый маршрут армии до нажатия "подтвердить" — игрок видит путь и сколько ходов займёт.

**Что сделать:**

1. При выборе армии (клик на маркер): установить `selectedArmy = army`, подсветить маркер.

2. При наведении на целевой регион (пока армия выбрана):
   - Рассчитать маршрут BFS/Dijkstra по соседним регионам: `findArmyPath(fromRegion, toRegion)`
   - Получить центры промежуточных регионов
   - Нарисовать `L.polyline` пунктиром:
     ```js
     L.polyline(pathCoords, {
       color: nationColor, weight: 2,
       dashArray: '8 6', opacity: 0.7,
       className: 'army-route-preview'
     })
     ```
   - Добавить CSS анимацию движения: `stroke-dashoffset` animation

3. Показать тултип у курсора: `📍 3 хода · через Катанию → Акрагант`.

4. При клике на целевой регион — подтвердить маршрут: сохранить в `army.planned_route`, убрать preview-линию, нарисовать постоянную пунктирную линию маршрута.

5. При очередном ходе — армия двигается по первому региону маршрута, линия укорачивается.

**Тест Шага 47:**
- Выбрать армию → навести на далёкий регион → появляется пунктирная линия маршрута.
- Тултип показывает количество ходов.
- Клик подтверждает маршрут.
- Линия маршрута остаётся на карте между ходами.
- После прибытия армии — линия исчезает.

---

## БЛОК Q — Стратегическая информация (Шаги 48–50)

---

### Шаг 48 — Туман войны (разведка)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `df1d0a2`, `ui/map.js` (getIntelLevel с уровнями 0/1/2 + hatching-паттерн + фильтры в tooltip/popup), тесты `tests/test_arma_stage48.mjs` (38 passed). Не реализовывать повторно.

**Цель:** игрок видит разный уровень информации о регионах в зависимости от близости и союзников.

**Что сделать:**

1. Написать функцию `getIntelLevel(regionId)` → возвращает `0`, `1`, или `2`:
   - `2` (полная информация) — свои регионы + союзники + соседние
   - `1` (частичная) — регионы в 2 перехода, торговые партнёры
   - `0` (минимум) — все остальные

2. В `buildTooltipContent()` фильтровать данные по `intelLevel`:
   ```js
   const intel = getIntelLevel(regionId);
   const population = intel >= 1 ? gameData.population : '???';
   const treasury   = intel >= 2 ? region.treasury    : '—';
   const garrison   = intel >= 1 ? gameData.garrison  : '~' + roughEstimate(gameData.garrison);
   ```

3. В `showRegionInfo()` — аналогично скрывать/размывать поля при низком intel:
   - `intelLevel = 0`: показать только нацию-владельца, название, тип региона
   - `intelLevel = 1`: добавить примерное население (`~10–15k`), тип армии
   - `intelLevel = 2`: полные данные

4. Визуально на карте: регионы с `intelLevel = 0` получают `fillOpacity: 0.45` и hatching-паттерн (SVG `<pattern>` с диагональными линиями).

5. Иконка разведки в popup: `🔍 Разведка: частичная` с подсказкой как улучшить.

**Тест Шага 48:**
- Далёкие вражеские регионы показывают `???` вместо точных цифр.
- Соседние регионы показывают примерные данные.
- Свои регионы — полные данные как раньше.
- Визуально далёкие регионы чуть темнее/прозрачнее.

---

### Шаг 49 — Граф дипломатических отношений

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `08d541a`, файл `ui/diplo_graph.js` (#diplo-graph-overlay + renderDiploGraph), тесты `tests/test_arma_stage49.mjs` (40 passed). Не реализовывать повторно.

**Цель:** визуальная сеть союзов, войн и договоров между нациями — одним взглядом.

**Что сделать:**

1. Добавить кнопку `🕸` в левую навигацию (или в `#map-mode-bar`) — открывает оверлей.

2. Создать `#diplo-graph-overlay` (fullscreen, z-index 2000):
   ```html
   <div id="diplo-graph-overlay" class="hidden">
     <div class="dg-header">
       <h2>Дипломатические отношения</h2>
       <button onclick="closeDiploGraph()">✕</button>
     </div>
     <svg id="diplo-graph-svg"></svg>
   </div>
   ```

3. JS: `renderDiploGraph()`:
   a. Получить список активных наций из `GAME_STATE.nations`.
   b. Расставить нации по кругу: `angle = (i / total) * 2 * Math.PI`, `x = cx + r * cos(angle)`.
   c. Нарисовать линии-отношения:
      - Войны → красные линии, толщина 3px
      - Союзы → зелёные линии, толщина 2px
      - Торговые договоры → синие пунктиры
      - Мирные договоры → серые линии
   d. Нарисовать узлы-нации: `<circle>` в цвете нации + `<text>` с именем.
   e. При клике на узел → открыть дипломатическую панель с этой нацией.

4. Легенда в углу: цветные квадраты + подписи типов отношений.

**Тест Шага 49:**
- Кнопка `🕸` открывает оверлей с графом.
- Все активные нации расположены по кругу.
- Цветные линии соответствуют типам отношений.
- Клик на нацию в графе — открывает дипломатическую панель.
- `Esc` закрывает оверлей.

---

### Шаг 50 — Лента событий на карте (Event Feed)

> **Статус:** ✅ **ВЫПОЛНЕНО** — commit `0f4ceda`, файл `ui/map_event_feed.js` (eventFeedQueue + processEventFeedQueue + .event-feed-marker), тесты `tests/test_arma_stage50.mjs` (57 passed). Не реализовывать повторно.

**Цель:** события видны на карте как всплывающие иконки — игрок сразу понимает что происходит где.

**Цель отличается от Шага 41:** там разовые пульсирующие круги. Здесь — постоянная очередь событий с иконками которые поочерёдно появляются над регионами и текстом описания.

**Что сделать:**

1. Создать очередь событий `eventFeedQueue = []`. После каждого хода `turn.js` добавляет события:
   ```js
   addMapEvent({ regionId: 'sicily_1', icon: '🔥', text: 'Восстание!', type: 'revolt' });
   addMapEvent({ regionId: 'carthage_1', icon: '💰', text: '+340 доход', type: 'economy' });
   ```

2. Функция `processEventFeedQueue()` — показывает события по очереди с задержкой 600ms между ними:
   - Создаёт `L.divIcon` маркер над регионом
   - Маркер содержит: иконку + текст в мини-баббле
   - CSS анимация: `slideup` 0.3s → видимость 2s → `fadeout` 0.3s → удаление
   - `pointer-events: none`

3. CSS маркер-баббл:
   ```css
   .event-feed-marker {
     background: rgba(13,10,5,0.88);
     border: 1px solid var(--border-gold);
     border-radius: 12px;
     padding: 3px 8px;
     font-size: 11px; color: var(--text-light);
     white-space: nowrap;
     box-shadow: 0 2px 8px rgba(0,0,0,0.4);
     animation: event-bubble 2.6s forwards;
   }
   @keyframes event-bubble {
     0%   { opacity: 0; transform: translateY(8px); }
     15%  { opacity: 1; transform: translateY(0); }
     75%  { opacity: 1; }
     100% { opacity: 0; transform: translateY(-6px); }
   }
   ```

4. Максимум 5 одновременных маркеров — остальные в очереди.

**Тест Шага 50:**
- После хода над регионами всплывают баббл-иконки с текстом.
- Каждый баббл живёт ~2.6 сек и плавно исчезает.
- Одновременно не более 5 на экране.
- Бабблы не мешают кликам на регионы.

---

## БЛОК R — Финальная полировка (Шаги 51–53)

---

### Шаг 51 — Индикаторы действий ИИ-наций

**Цель:** показать что делают другие нации — карта перестаёт быть "мёртвой" между ходами игрока.

**Что сделать:**

1. После обработки хода в `turn.js`: собрать действия всех AI-наций в `aiActions[]`:
   ```js
   aiActions = [
     { nationId: 'rome',     regionId: 'latium_1',  type: 'building', icon: '🏗' },
     { nationId: 'carthage', regionId: 'carthage_1', type: 'recruiting', icon: '⚔' },
     { nationId: 'egypt',    regionId: 'nile_delta', type: 'trade', icon: '💰' },
   ];
   ```

2. Написать `renderAIIndicators(aiActions)`:
   - Для каждого действия создать `L.divIcon` маркер над регионом
   - Маркер: маленькая иконка 20×20px в цвете нации (полупрозрачный фон)
   - При наведении на маркер — тултип: `Рим: строит Акведук в Латиуме`
   - Маркеры хранятся в `aiIndicatorMarkers[]`, удаляются в начале следующего хода

3. CSS:
   ```css
   .ai-indicator {
     width: 20px; height: 20px;
     border-radius: 50%;
     background: var(--nc, #888);
     opacity: 0.75;
     display: flex; align-items: center; justify-content: center;
     font-size: 11px;
     border: 1px solid rgba(255,255,255,0.2);
     box-shadow: 0 1px 4px rgba(0,0,0,0.4);
     animation: ai-appear 0.4s ease-out;
   }
   @keyframes ai-appear {
     from { transform: scale(0); opacity: 0; }
     to   { transform: scale(1); opacity: 0.75; }
   }
   ```

4. Таблица иконок действий:
   | Действие | Иконка |
   |---------|--------|
   | Строительство | 🏗 |
   | Набор войск | ⚔ |
   | Торговля | 💰 |
   | Дипломатия | 🤝 |
   | Перемещение армий | → |

**Тест Шага 51:**
- После хода над регионами AI-наций появляются маленькие цветные кружки с иконками.
- Наведение на кружок → тултип с расшифровкой действия.
- В начале следующего хода старые индикаторы исчезают.
- Индикаторы соответствуют реальным действиям из `turn.js`.

---

### Шаг 52 — Визуальная карточка итога хода

**Цель:** после обработки хода — красивая карточка с итогами, которая информирует и удовлетворяет.

**Что сделать:**

1. Добавить `#turn-summary-card` в `<body>`:
   ```html
   <div id="turn-summary-card" class="hidden">
     <div class="tsc-header">
       <span id="tsc-turn">Ход 13</span>
       <span id="tsc-date">Гекатомбеон, 301 BC</span>
       <span id="tsc-season">🌸</span>
     </div>
     <div class="tsc-deltas" id="tsc-deltas">
       <!-- заполняется динамически -->
     </div>
     <div class="tsc-alerts" id="tsc-alerts"></div>
     <div class="tsc-footer">
       <div class="tsc-progress"></div>
       <button onclick="closeTurnSummaryCard()">Продолжить →</button>
     </div>
   </div>
   ```

2. CSS:
   ```css
   #turn-summary-card {
     position: fixed; top: 50%; left: 50%;
     transform: translate(-50%, -50%);
     width: 340px; z-index: 8500;
     background: rgba(13,10,5,0.97);
     border: 1px solid var(--border-gold);
     border-radius: 6px;
     box-shadow: 0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,168,83,0.1);
     backdrop-filter: blur(12px);
     animation: tsc-appear 0.3s ease-out;
   }
   @keyframes tsc-appear {
     from { opacity: 0; transform: translate(-50%, calc(-50% + 20px)); }
     to   { opacity: 1; transform: translate(-50%, -50%); }
   }
   .tsc-delta-row { display:flex; justify-content:space-between; padding: 5px 0;
                    border-bottom: 1px solid rgba(107,79,26,0.15); font-size: 13px; }
   .tsc-delta-pos { color: #4caf50; }
   .tsc-delta-neg { color: #f44336; }
   .tsc-progress { height: 2px; background: var(--border-gold);
                   animation: tsc-countdown 5s linear forwards; }
   @keyframes tsc-countdown { from { width: 100%; } to { width: 0%; } }
   ```

3. JS: `showTurnSummaryCard(prevState, newState)` — вычислить дельты и заполнить `#tsc-deltas`:
   ```js
   const rows = [
     { label: '💰 Казна',    delta: newState.treasury - prevState.treasury },
     { label: '👥 Население', delta: newState.population - prevState.population },
     { label: '⚔ Армия',     delta: newState.total_troops - prevState.total_troops },
   ];
   ```

4. Карточка закрывается: через 5 сек автоматически (прогресс-бар показывает таймер) или по кнопке "Продолжить →".

**Тест Шага 52:**
- После нажатия "Следующий ход" — карточка появляется по центру экрана.
- Показывает дельты ресурсов с цветными +/-.
- Прогресс-бар убывает за 5 сек.
- Закрывается по кнопке или автоматически.
- После закрытия фокус возвращается на карту.

---

### Шаг 53 — Режим сравнения регионов

**Цель:** быстро сравнить два региона рядом — без переключения между ними вручную.

**Что сделать:**

1. В popup региона (`.ri-footer`) добавить кнопку:
   ```html
   <button class="ri-action-btn" onclick="pinRegionForCompare('${regionId}')">⚖ Сравнить</button>
   ```

2. При нажатии первый раз — регион "закрепляется" (`pinnedRegionId = regionId`), кнопка меняется на `⚖ Сравнивается...` (мигает).

3. При клике на второй регион (если `pinnedRegionId` установлен) — вместо обычного popup открыть **панель сравнения**:
   ```html
   <div id="compare-panel">
     <div class="cp-header">
       <span>⚖ Сравнение регионов</span>
       <button onclick="closeCompare()">✕</button>
     </div>
     <div class="cp-body">
       <div class="cp-col" id="cp-left"></div>
       <div class="cp-divider"></div>
       <div class="cp-col" id="cp-right"></div>
     </div>
   </div>
   ```

4. CSS: панель 580px шириной, два столбца по 50%, расположена в центре экрана.

5. JS: `renderComparePanel(regionA, regionB)`:
   - Заполнить оба столбца одинаковым набором строк
   - Для каждой строки — подсвечивать лучшее значение зелёным, худшее — тусклее:
     ```js
     const rows = ['population','garrison','fertility','wealth','buildings_count'];
     rows.forEach(key => {
       const better = valA[key] > valB[key] ? 'left' : 'right';
       // добавить класс .cp-winner к лучшей ячейке
     });
     ```
   - Стрелки `↑↓` у каждой метрики

6. Кнопка "Сбросить" (`pinnedRegionId = null`) в шапке панели.

**Тест Шага 53:**
- Открыть popup → нажать "⚖ Сравнить" → иконка мигает.
- Кликнуть на второй регион → открывается панель сравнения (два столбца).
- Лучшие значения подсвечены зелёным.
- Стрелки `↑↓` у каждой метрики корректны.
- Закрытие панели сбрасывает `pinnedRegionId`.

---

## Итоговая таблица шагов 36–53

| Шаг | Блок | Файл | Суть |
|-----|------|------|------|
| 36 | M | ui/map.js | Исправить баг потери цветов |
| 37 | M | ui/map.js, index.html | Переработать popup региона |
| 38 | M | ui/map.js, index.html | Скользящий индикатор вкладок |
| 39 | N | ui/map.js | Анимированные SVG маркеры армий |
| 40 | N | ui/map.js | Прогресс строительства на карте |
| 41 | N | ui/map.js | Пульсирующие иконки событий |
| 42 | O | ui/map.js | Анимированные торговые маршруты |
| 43 | O | index.html, ui/panels.js | Экран должностей (Двор) |
| 44 | O | ui/map.js | Стратегические уровни зума |
| 45 | P | ui/map.js, index.html | Сезонный визуал карты |
| 46 | P | index.html, ui/panels.js | Спарклайны трендов |
| 47 | P | ui/map.js | Планировщик маршрутов армии |
| 48 | Q | ui/map.js | Туман войны (разведка) |
| 49 | Q | index.html | Граф дипломатических отношений |
| 50 | Q | ui/map.js | Лента событий на карте |
| 51 | R | ui/map.js | Индикаторы действий ИИ |
| 52 | R | index.html | Карточка итога хода |
| 53 | R | ui/map.js, index.html | Режим сравнения регионов |

---

# ЧАСТЬ 4 — Визуальные ассеты: CC0-изображения в игре

> Все изображения в этой части — **Public Domain или CC0**.
> Допустимо коммерческое использование без ограничений.
> Источники: Metropolitan Museum of Art (CC0), Wikimedia Commons (PD).

---

## БЛОК S — Инфраструктура ассетов (Шаг 54)

---

### Шаг 54 — Asset pipeline: структура папок, манифест, скрипт загрузки

**Цель:** создать в репозитории систему хранения CC0-изображений с манифестом лицензий и скриптом автоматической загрузки. Изображений много — хранить их в git нецелесообразно (вес), поэтому в репозитории хранится только манифест и лёгкие SVG. Тяжёлые JPG загружаются скриптом.

---

**Структура директорий:**

```
assets/
  portraits/          ← Фаюмские портреты и другие CC0-лица
    greek/            ← Эллинская культурная группа
    roman/            ← Римская / италийская
    celtic/           ← Кельтская / германская
    persian/          ← Персидская / ближневосточная
    egyptian/         ← Египетская
    indian/           ← Индийская
    east_asian/       ← Восточноазиатская
    nomadic/          ← Скифская / кочевая
    iberian/          ← Иберийская
    african/          ← Северо- и Центральноафриканская
    placeholder.svg   ← Fallback-аватар (генерируется при отсутствии)

  textures/           ← Фоновые текстуры панелей
    greek_vase.jpg    ← Чернофигурная амфора (Met CC0)
    papyrus.jpg       ← Египетский папирус
    linen.jpg         ← Льняная ткань (Paper003 уже есть)
    celtic_knot.svg   ← Кельтский узел

  backgrounds/        ← Полноэкранные фоны
    splash_pompeii.jpg     ← Фреска Помпеи (Wikimedia PD)
    splash_battle.jpg      ← Мозаика Александра (Wikimedia PD)

  borders/            ← Декоративные рамки
    meander_gold.svg       ← Греческий меандр
    meander_dark.svg       ← Тёмный вариант
    celtic_border.svg      ← Кельтская рамка
    egyptian_border.svg    ← Египетский иероглифический бордюр

  icons/              ← Иконки наций
    owl_athena.svg         ← Сова Афины (Wikimedia CC0)
    roman_eagle.svg        ← Римский орёл
    carthage_horse.svg     ← Конь Карфагена
    celtic_torque.svg      ← Кельтский торквес
    persian_faravahar.svg  ← Фараваxар (зороастрийский символ)

  manifest.json       ← Манифест всех ассетов (источник, лицензия, URL)
  download.sh         ← Bash-скрипт загрузки всех JPG/PNG-ассетов
```

---

**Содержимое `assets/manifest.json`:**

```json
{
  "version": "1.0",
  "generated": "2025",
  "license_note": "All assets are CC0 or Public Domain. Safe for commercial use.",
  "assets": [
    {
      "id": "portrait_greek_woman_red",
      "file": "assets/portraits/greek/woman_red.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547860/1228117/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/547860",
      "title": "Portrait of a young woman in red",
      "date": "A.D. 90–120",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["greek", "roman", "hellenistic"]
    },
    {
      "id": "portrait_greek_man_bearded",
      "file": "assets/portraits/greek/man_bearded.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547856/1178594/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/547856",
      "title": "Portrait of a thin-faced, bearded man",
      "date": "A.D. 140–170",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["greek", "roman", "hellenistic"]
    },
    {
      "id": "portrait_greek_man_thinface",
      "file": "assets/portraits/greek/man_thinface.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547858/1151914/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/547858",
      "title": "Portrait of a thin-faced man",
      "date": "A.D. 140–170",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["greek", "roman", "hellenistic"]
    },
    {
      "id": "portrait_greek_woman_wreath",
      "file": "assets/portraits/greek/woman_wreath.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547861/1215090/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/547861",
      "title": "Portrait of a young woman with a gilded wreath",
      "date": "A.D. 100–150",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["greek", "roman", "egyptian", "hellenistic"]
    },
    {
      "id": "portrait_roman_youth",
      "file": "assets/portraits/roman/youth.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547768/1084202/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/547768",
      "title": "Portrait of a Youth",
      "date": "A.D. 190–210",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["roman", "greek", "hellenistic"]
    },
    {
      "id": "portrait_egyptian_mummy",
      "file": "assets/portraits/egyptian/mummy_youth.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547697/1178606/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/547697",
      "title": "Mummy with Inserted Panel Portrait of a Youth",
      "date": "A.D. 100–200",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["egyptian", "ptolemaic", "african"]
    },
    {
      "id": "texture_greek_vase_antimenes",
      "file": "assets/textures/greek_vase.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/254944/541377/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/254944",
      "title": "Terracotta amphora — Antimenes Painter, ca. 530–520 BCE",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["panel_background_greek"]
    },
    {
      "id": "texture_greek_vase_berlin",
      "file": "assets/textures/greek_vase_berlin.jpg",
      "source_url": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/254896/1866772/main-image",
      "source_page": "https://www.metmuseum.org/art/collection/search/254896",
      "title": "Terracotta amphora — Berlin Painter, ca. 490 BCE",
      "license": "CC0",
      "institution": "Metropolitan Museum of Art",
      "use": ["panel_background_greek"]
    },
    {
      "id": "bg_splash_pompeii",
      "file": "assets/backgrounds/splash_pompeii.jpg",
      "source_url": "https://upload.wikimedia.org/wikipedia/commons/d/d3/Fresco_from_the_House_of_Julia_Felix,_Pompeii_depicting_scenes_from_the_Forum_market.JPG",
      "source_page": "https://commons.wikimedia.org/wiki/File:Fresco_from_the_House_of_Julia_Felix,_Pompeii_depicting_scenes_from_the_Forum_market.JPG",
      "title": "Fresco from the House of Julia Felix, Pompeii",
      "date": "1st century AD",
      "license": "Public Domain",
      "institution": "Wikimedia Commons",
      "use": ["splash_screen", "roman_background"]
    },
    {
      "id": "bg_battle_alexander",
      "file": "assets/backgrounds/splash_battle.jpg",
      "source_url": "https://upload.wikimedia.org/wikipedia/commons/7/7c/Alexander_%28Battle_of_Issus%29_Mosaic.jpg",
      "source_page": "https://commons.wikimedia.org/wiki/File:Alexander_(Battle_of_Issus)_Mosaic.jpg",
      "title": "Alexander Mosaic — Battle of Issus",
      "date": "ca. 100 BC",
      "license": "Public Domain",
      "institution": "Wikimedia Commons",
      "use": ["battle_screen", "macedonian_background"]
    },
    {
      "id": "border_meander",
      "file": "assets/borders/meander_gold.svg",
      "source_page": "https://commons.wikimedia.org/wiki/File:Meander_alagrek.svg",
      "title": "Greek key meander pattern",
      "license": "Public Domain",
      "institution": "Wikimedia Commons",
      "use": ["panel_border_greek", "popup_border"]
    },
    {
      "id": "icon_owl_athena",
      "file": "assets/icons/owl_athena.svg",
      "source_page": "https://commons.wikimedia.org/wiki/File:Owl_from_Ancient_Greece_-_icon.svg",
      "title": "Owl from Ancient Greece — icon",
      "license": "CC0",
      "institution": "Wikimedia Commons",
      "use": ["nation_icon_greek"]
    }
  ]
}
```

---

**Содержимое `assets/download.sh`:**

```bash
#!/bin/bash
# Загрузка CC0/PD ассетов для Ancient Strategy
# Запустить: bash assets/download.sh
# Все ассеты Public Domain или CC0 — безопасно для коммерческого использования

set -e
mkdir -p assets/portraits/greek assets/portraits/roman assets/portraits/egyptian
mkdir -p assets/textures assets/backgrounds assets/borders assets/icons

echo "Загрузка портретов (Фаюмские, CC0, Met Museum)..."
curl -L -o assets/portraits/greek/woman_red.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547860/1228117/main-image"

curl -L -o assets/portraits/greek/man_bearded.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547856/1178594/main-image"

curl -L -o assets/portraits/greek/man_thinface.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547858/1151914/main-image"

curl -L -o assets/portraits/greek/woman_wreath.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547861/1215090/main-image"

curl -L -o assets/portraits/roman/youth.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547768/1084202/main-image"

curl -L -o assets/portraits/egyptian/mummy_youth.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547697/1178606/main-image"

echo "Загрузка текстур (CC0, Met Museum)..."
curl -L -o assets/textures/greek_vase.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/254944/541377/main-image"

curl -L -o assets/textures/greek_vase_berlin.jpg \
  "https://collectionapi.metmuseum.org/api/collection/v1/iiif/254896/1866772/main-image"

echo "Загрузка фонов (Public Domain, Wikimedia)..."
curl -L -o assets/backgrounds/splash_pompeii.jpg \
  "https://upload.wikimedia.org/wikipedia/commons/d/d3/Fresco_from_the_House_of_Julia_Felix,_Pompeii_depicting_scenes_from_the_Forum_market.JPG"

curl -L -o assets/backgrounds/splash_battle.jpg \
  "https://upload.wikimedia.org/wikipedia/commons/7/7c/Alexander_%28Battle_of_Issus%29_Mosaic.jpg"

echo "Готово. Все ассеты загружены в assets/"
echo "Лицензии: см. assets/manifest.json"
```

---

**Создать файл `assets/README.md`:**

```
# Визуальные ассеты Ancient Strategy

## Лицензии
Все изображения CC0 (Creative Commons Zero) или Public Domain.
Разрешено коммерческое использование без ограничений и без атрибуции.

## Источники
- Metropolitan Museum of Art Open Access: https://www.metmuseum.org/about-the-met/policies-and-documents/image-resources
- Wikimedia Commons: https://commons.wikimedia.org

## Загрузка
bash assets/download.sh

## Манифест
assets/manifest.json — полный список с источниками и лицензиями.
```

---

**Что сохраняется в git:**
- `assets/manifest.json` (текстовый файл, ~5 KB)
- `assets/download.sh` (скрипт, ~2 KB)
- `assets/README.md`
- `assets/borders/*.svg` (векторные, ~5 KB каждый)
- `assets/icons/*.svg` (векторные, ~3 KB каждый)
- `assets/portraits/placeholder.svg` (генерируемый fallback)

**Что НЕ сохраняется в git** (добавить в `.gitignore`):
```
assets/portraits/**/*.jpg
assets/textures/*.jpg
assets/backgrounds/*.jpg
```
Тяжёлые JPG загружаются скриптом на каждой машине.

---

**Тест Шага 54:**
- `bash assets/download.sh` завершается без ошибок.
- Все JPG-файлы скачаны и не пусты: `ls -lh assets/portraits/greek/`.
- `assets/manifest.json` валидный JSON: `node -e "require('./assets/manifest.json')"`.
- В git нет JPG-файлов: `git ls-files assets/ | grep jpg` возвращает пусто.
- `assets/download.sh` идемпотентен — повторный запуск не ломает ничего.

---

## БЛОК T — Культурные группы и маппинг портретов (Шаг 55)

---

### Шаг 55 — Культурная карта наций: 10 групп, визуальный стиль каждой

**Цель:** сгруппировать все нации игры по культурным регионам. Каждая группа получает свой набор портретов, фоновую текстуру, цветовую гамму панелей и иконку. В игре сотни наций — у каждой нет отдельного арта, но у каждой есть культурная группа.

**Что сделать:**

1. Создать файл `data/culture_groups.js` — маппинг `nationId → cultureGroup`:

```js
const CULTURE_GROUPS = {
  // ── ЭЛЛИНСКАЯ (греки, эллинистические царства)
  greek: {
    label: 'Эллинская',
    nations: [
      'syracuse','athens','corinth','sparta','macedon','epirus','rhodes',
      'pergamon','antigonid_kingdom','seleukid_empire','ptolemaic_kingdom',
      'acarnania','aetolia','boeotian_states','argos','megalopolis',
      'achola','aigion','amphissa','andros','apollonia','arsinoe',
      'gela','herakleia','herakleia_minoa','herakleia_pontica',
      'korkyra','kos','knidos','miletos','nesiotic_league',
      'selinous','sicyon','sinope','thurii','rhegium',
      'massilia','emporion',
      // + все greek_states, hellenistic splinters
    ],
    portrait_pool: ['greek/woman_red','greek/man_bearded','greek/man_thinface','greek/woman_wreath'],
    texture: 'greek_vase',
    panel_tint: 'rgba(60,40,10,0.85)',
    border: 'meander_gold',
    icon: 'owl_athena',
    splash_bg: 'splash_pompeii',
  },

  // ── РИМСКАЯ / ИТАЛИЙСКАЯ
  roman: {
    label: 'Римская',
    nations: [
      'rome','roman_republic','samnites','brutii','lucani','etruscan_conf',
      'umbrians','picentes','paeligni','marrucini','vestini','frentani',
      'messapians','iapygia','apulians','taras','locri','croton',
      'neapolis','brundisium','ancona','ravenna','genua','spina',
      'capua','nuceria',
    ],
    portrait_pool: ['roman/youth','greek/man_bearded','greek/man_thinface'],
    texture: 'greek_vase_berlin',
    panel_tint: 'rgba(50,20,10,0.85)',
    border: 'meander_dark',
    icon: 'roman_eagle',
    splash_bg: 'splash_pompeii',
  },

  // ── КАРФАГЕНСКАЯ / ФИНИКИЙСКАЯ / ПУНИЙСКАЯ
  carthaginian: {
    label: 'Пунийская',
    nations: [
      'carthage','numidia','masaesyli','massylii','mauretania',
      'utica','lixus','gadir','hadrametum','lepcis_parva',
      'byblos','sidon','arados','tyre',
    ],
    portrait_pool: ['egyptian/mummy_youth','greek/man_bearded'],
    texture: 'papyrus',
    panel_tint: 'rgba(40,20,30,0.85)',
    border: 'egyptian_border',
    icon: 'carthage_horse',
    splash_bg: 'splash_battle',
  },

  // ── ЕГИПЕТСКАЯ / НУБИЙСКАЯ
  egyptian: {
    label: 'Египетская',
    nations: [
      'ptolemaic_kingdom','meroe','napata','kush','nubia',
      'dodekaschoinos','hermopolis_magna','oxyrhynchus',
      'antaiopolis','lykopolis','kynopolis','sedeinga',
    ],
    portrait_pool: ['egyptian/mummy_youth','greek/woman_wreath'],
    texture: 'papyrus',
    panel_tint: 'rgba(60,45,10,0.85)',
    border: 'egyptian_border',
    icon: 'egyptian_eye',
    splash_bg: 'splash_pompeii',
  },

  // ── ПЕРСИДСКАЯ / БЛИЖНЕВОСТОЧНАЯ / ИРАНСКАЯ
  persian: {
    label: 'Персидская',
    nations: [
      'persis','parthia','bactria','sogdia','arachosia','gedrosia',
      'media','atropatene','gordyene','sophene','cappadocia',
      'paphlagonia','pontus','bithynia','armenia','tigranocerta',
      'seleukid_empire','ecbatana','hecatompylos','susa',
    ],
    portrait_pool: ['greek/man_bearded','greek/man_thinface'],
    texture: 'linen',
    panel_tint: 'rgba(35,25,45,0.85)',
    border: 'meander_dark',
    icon: 'persian_faravahar',
    splash_bg: 'splash_battle',
  },

  // ── КЕЛЬТСКАЯ / ГЕРМАНСКАЯ
  celtic: {
    label: 'Кельтская',
    nations: [
      'arverni','aedui','helvetii','carnutes','senones','sequani',
      'pictones','santones','namnetes','venelli','remi','treveria',
      'bellovaci','sugambria','britannia','iceni','catuvellauni',
      'brigantes','ordovices','silures','corieltauvi','dobunni',
      'cornovii','durotriges','cantabri','celtiberi','vaccaei',
      'gallaeci','lusitanii','boii','boiiii','insubri',
      'cenomanni','leponti','tauriscia','scordisci','odrysian_kingdom',
    ],
    portrait_pool: ['greek/man_bearded','greek/man_thinface'],
    texture: 'linen',
    panel_tint: 'rgba(20,35,20,0.85)',
    border: 'celtic_border',
    icon: 'celtic_torque',
    splash_bg: 'splash_battle',
  },

  // ── ИНДИЙСКАЯ / ЮЖНОАЗИАТСКАЯ
  indian: {
    label: 'Индийская',
    nations: [
      'maurya_empire','gandhara','andhra','kalinga','pandya','chola',
      'chera','magadha','patala','paurava','asmaka','bhoja',
      'samatata','kamarupa','kuntala','lumbini',
    ],
    portrait_pool: ['egyptian/mummy_youth','greek/woman_wreath'],
    texture: 'linen',
    panel_tint: 'rgba(55,30,10,0.85)',
    border: 'meander_dark',
    icon: 'indian_lotus',
    splash_bg: 'splash_battle',
  },

  // ── ВОСТОЧНОАЗИАТСКАЯ (Китай, Корея, Япония)
  east_asian: {
    label: 'Восточноазиатская',
    nations: [
      'qin','han','zhao','wei','qi','yan','chu','zhou','song',
      'gojoseon','goguryeo','baekje','yayoi_japan','yamato',
      'donghu','xiongnu','yuezhi','wusun',
    ],
    portrait_pool: ['greek/man_thinface','greek/woman_red'],
    texture: 'linen',
    panel_tint: 'rgba(50,15,15,0.85)',
    border: 'meander_dark',
    icon: 'east_asian_dragon',
    splash_bg: 'splash_battle',
  },

  // ── СКИФСКАЯ / КОЧЕВАЯ / СТЕПНАЯ
  nomadic: {
    label: 'Кочевая',
    nations: [
      'scythians','saka','sarmatians','iazyges','roxolani',
      'massagetae','issedones','arismaspians','dahae','parni',
      'yuezhi','xiongnu','wusun','maeotae','siraces',
    ],
    portrait_pool: ['greek/man_bearded','greek/man_thinface'],
    texture: 'linen',
    panel_tint: 'rgba(35,30,15,0.85)',
    border: 'meander_dark',
    icon: 'nomadic_bow',
    splash_bg: 'splash_battle',
  },

  // ── ОБЩАЯ (для всех остальных, малых и неизвестных наций)
  generic: {
    label: 'Прочие',
    nations: [], // все не попавшие в группы выше
    portrait_pool: ['greek/man_bearded','greek/man_thinface','greek/woman_red'],
    texture: 'greek_vase',
    panel_tint: 'rgba(26,18,8,0.85)',
    border: 'meander_dark',
    icon: 'generic_sword',
    splash_bg: 'splash_pompeii',
  },
};
```

2. Написать вспомогательную функцию `getCultureGroup(nationId)`:
   ```js
   function getCultureGroup(nationId) {
     for (const [groupId, group] of Object.entries(CULTURE_GROUPS)) {
       if (group.nations.includes(nationId)) return { groupId, ...group };
     }
     return { groupId: 'generic', ...CULTURE_GROUPS.generic };
   }
   ```

3. Написать `getPortraitForCharacter(char, nationId)`:
   ```js
   function getPortraitForCharacter(char, nationId) {
     const group = getCultureGroup(nationId);
     const pool = group.portrait_pool;
     // Детерминированный выбор по ID персонажа (не случайный каждый раз)
     const idx = hashCode(char.id) % pool.length;
     return `assets/portraits/${pool[idx]}.jpg`;
   }
   function hashCode(str) {
     let h = 0;
     for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
     return Math.abs(h);
   }
   ```

4. Обновить `assets/download.sh` — добавить в нём заглушки `placeholder.svg` для групп которые ещё не имеют реальных портретов. Заглушка — SVG с инициалами и цветом нации.

**Тест Шага 55:**
- `getCultureGroup('syracuse').groupId` → `'greek'`
- `getCultureGroup('rome').groupId` → `'roman'`
- `getCultureGroup('xiongnu').groupId` → `'nomadic'`
- `getCultureGroup('unknown_small_tribe').groupId` → `'generic'`
- `getPortraitForCharacter({id:'char_001'}, 'athens')` → `'assets/portraits/greek/woman_red.jpg'`
- Один и тот же персонаж всегда получает один и тот же портрет (детерминированность).

---

## БЛОК U — Фоновые текстуры панелей (Шаг 56)

---

### Шаг 56 — Фон панелей: культурная текстура через CSS-переменные

**Цель:** применить текстуру (`texture`) и тинт (`panel_tint`) из культурной группы текущего игрока к боковым панелям. Панели должны выглядеть как выдержанный пергамент, папирус или керамика — в зависимости от нации. Контент панелей не должен деградировать: текстура накладывается псевдоэлементом `::before`, не касаясь дочерних элементов.

**Что сделать:**

1. Объявить CSS-переменные на `:root` в `index.html` (или `ui/styles.css`):
   ```css
   :root {
     --panel-texture: url('assets/textures/greek_vase.jpg');
     --panel-tint:    rgba(26, 18, 8, 0.85);
     --panel-radius:  6px;
   }
   ```

2. Применить текстуру через `::before` на оба боковых панели:
   ```css
   #left-panel,
   #right-panel {
     position: relative;
     overflow: hidden;
     background: var(--panel-tint);
     border-radius: var(--panel-radius);
   }

   #left-panel::before,
   #right-panel::before {
     content: '';
     position: absolute;
     inset: 0;                          /* top/right/bottom/left: 0 */
     background-image: var(--panel-texture);
     background-size: 320px auto;
     background-repeat: repeat;
     opacity: 0.07;                     /* очень тонко — текстура, не обои */
     pointer-events: none;
     z-index: 0;
   }

   /* Весь контент поверх псевдоэлемента */
   #left-panel > *,
   #right-panel > * {
     position: relative;
     z-index: 1;
   }
   ```

3. В `ui/panels.js` добавить функцию `applyNationTheme(nationId)`, которая вызывается при смене активной нации:
   ```js
   import { getCultureGroup } from '../data/culture_groups.js';

   function applyNationTheme(nationId) {
     const group = getCultureGroup(nationId);
     const root  = document.documentElement;

     // Текстура: берём имя файла из group.texture
     const texturePath = `assets/textures/${group.texture}.jpg`;
     root.style.setProperty('--panel-texture', `url('${texturePath}')`);

     // Тинт (полупрозрачный цвет поверх текстуры)
     root.style.setProperty('--panel-tint', group.panel_tint);
   }
   ```

4. Вызвать `applyNationTheme` в двух местах:
   - При старте игры, после загрузки сохранения:
     ```js
     applyNationTheme(gameState.playerNation);
     ```
   - При событии смены активной нации (например, после дипломатической победы или смены сессии):
     ```js
     eventBus.on('playerNationChanged', ({ nationId }) => applyNationTheme(nationId));
     ```

5. Добавить fallback — если JPG текстура ещё не скачана (первый запуск до `download.sh`), панель выглядит нормально за счёт `background: var(--panel-tint)` без текстуры:
   ```css
   #left-panel::before,
   #right-panel::before {
     /* Если файл не найден браузер просто не рисует background-image */
     background-image: var(--panel-texture);
   }
   ```
   Никакого JS-fallback не нужно — CSS сам деградирует.

6. Добавить `preload` для текстуры активной нации в `<head>` (динамически из JS при старте):
   ```js
   function preloadTexture(texturePath) {
     const link = document.createElement('link');
     link.rel  = 'preload';
     link.as   = 'image';
     link.href = texturePath;
     document.head.appendChild(link);
   }
   // вызов:
   preloadTexture(`assets/textures/${group.texture}.jpg`);
   ```

**Какие файлы затрагиваются:**
- `index.html` или `ui/styles.css` — новые CSS-переменные и правила `::before`
- `ui/panels.js` — функция `applyNationTheme`
- `data/culture_groups.js` — уже готов (Шаг 55), только импортируется

**Тест Шага 56:**
- При старте за греческую нацию панели имеют едва заметный орнамент греческой вазы.
- `document.documentElement.style.getPropertyValue('--panel-tint')` возвращает правильное значение для текущей нации.
- Если удалить `assets/textures/greek_vase.jpg`, панели остаются читаемыми (деградация без ошибок).
- Нет накладок текстуры поверх кнопок и текста (z-index корректен).
- `applyNationTheme('rome')` меняет тинт и текстуру на римские.

---

## БЛОК V — Аватары персонажей (Шаг 57)

---

### Шаг 57 — Портреты персонажей: char-card, модал, придворные слоты, советники

**Цель:** вывести CC0-портрет в каждом месте, где отображается персонаж. Источник портрета — `getPortraitForCharacter(char, nationId)` из Шага 55. Все четыре точки отображения: карточка в списке, детальный модал, слот в суде, чип советника.

**Что сделать:**

1. **Утилита `renderPortrait(char, nationId, sizePx)`** — общая для всех четырёх мест:
   ```js
   // ui/portrait.js
   import { getPortraitForCharacter } from '../data/culture_groups.js';

   export function renderPortrait(char, nationId, sizePx = 48) {
     const src  = getPortraitForCharacter(char, nationId);
     const fall = `assets/portraits/placeholder.svg`;

     const img = document.createElement('img');
     img.className   = 'char-portrait';
     img.src         = src;
     img.width       = sizePx;
     img.height      = sizePx;
     img.alt         = char.name ?? '';
     img.loading     = 'lazy';
     img.draggable   = false;

     // Деградация: если JPG не скачан — показать SVG-заглушку
     img.onerror = () => { img.src = fall; };

     return img;
   }
   ```

2. **Карточка персонажа `.char-card`** — портрет слева, текст справа:
   ```js
   // ui/char_list.js
   import { renderPortrait } from './portrait.js';

   function buildCharCard(char, nationId) {
     const card = document.createElement('div');
     card.className = 'char-card';
     card.dataset.charId = char.id;

     const portrait = renderPortrait(char, nationId, 48);
     portrait.classList.add('char-card__portrait');

     const info = document.createElement('div');
     info.className = 'char-card__info';
     info.innerHTML = `
       <span class="char-card__name">${char.name}</span>
       <span class="char-card__role">${char.role ?? ''}</span>
     `;

     card.appendChild(portrait);
     card.appendChild(info);
     return card;
   }
   ```
   CSS:
   ```css
   .char-card {
     display: flex;
     align-items: center;
     gap: 10px;
     padding: 6px 8px;
     border-radius: 4px;
     cursor: pointer;
   }
   .char-card:hover { background: rgba(255,255,255,0.06); }

   .char-card__portrait {
     width: 48px;
     height: 48px;
     border-radius: 50%;
     object-fit: cover;
     object-position: center top;   /* Фаюмские портреты — лицо в верхней части */
     border: 2px solid rgba(200,170,90,0.5);
     flex-shrink: 0;
   }

   .char-card__name  { display: block; font-weight: 600; font-size: 13px; }
   .char-card__role  { display: block; font-size: 11px; opacity: 0.65; }
   ```

3. **Детальный модал `.char-detail`** — крупный портрет, 96px:
   ```js
   function openCharDetail(char, nationId) {
     const modal = document.getElementById('char-detail-modal');

     // Заменить портрет в модале
     const wrap = modal.querySelector('.char-detail__portrait-wrap');
     wrap.innerHTML = '';
     wrap.appendChild(renderPortrait(char, nationId, 96));

     modal.querySelector('.char-detail__name').textContent = char.name;
     // ... остальные поля
     modal.classList.add('is-open');
   }
   ```
   CSS:
   ```css
   .char-detail__portrait-wrap img {
     width: 96px;
     height: 96px;
     border-radius: 6px;
     object-fit: cover;
     object-position: center top;
     border: 2px solid rgba(200,170,90,0.6);
     box-shadow: 0 4px 16px rgba(0,0,0,0.5);
   }
   ```

4. **Придворный слот `.position-slot`** — 56px, показывает портрет занятого поста:
   ```js
   function renderCourtSlot(position, char, nationId) {
     const slot = document.createElement('div');
     slot.className = 'position-slot';
     slot.title = position.label;

     if (char) {
       slot.appendChild(renderPortrait(char, nationId, 56));
       slot.classList.add('position-slot--filled');
     } else {
       slot.innerHTML = `<span class="position-slot__empty">—</span>`;
     }
     return slot;
   }
   ```
   CSS:
   ```css
   .position-slot {
     width: 56px; height: 56px;
     border-radius: 50%;
     border: 2px dashed rgba(200,170,90,0.3);
     display: flex; align-items: center; justify-content: center;
     overflow: hidden;
   }
   .position-slot--filled { border-style: solid; border-color: rgba(200,170,90,0.6); }
   .position-slot img     { width: 100%; height: 100%; object-fit: cover; object-position: top; }
   ```

5. **Чип советника `.advisor-chip`** — компактный вариант, 32px, с именем:
   ```js
   function renderAdvisorChip(char, nationId) {
     const chip = document.createElement('div');
     chip.className = 'advisor-chip';

     chip.appendChild(renderPortrait(char, nationId, 32));

     const name = document.createElement('span');
     name.textContent = char.name;
     chip.appendChild(name);
     return chip;
   }
   ```
   CSS:
   ```css
   .advisor-chip {
     display: inline-flex;
     align-items: center;
     gap: 6px;
     background: rgba(255,255,255,0.05);
     border: 1px solid rgba(200,170,90,0.3);
     border-radius: 20px;
     padding: 2px 8px 2px 2px;
     font-size: 12px;
   }
   .advisor-chip img {
     width: 32px; height: 32px;
     border-radius: 50%;
     object-fit: cover;
     object-position: top;
   }
   ```

**Какие файлы затрагиваются:**
- `ui/portrait.js` — новый файл, утилита `renderPortrait`
- `ui/char_list.js` — `buildCharCard` использует `renderPortrait`
- `ui/char_detail.js` (или модал в `index.html`) — `openCharDetail`
- `ui/court.js` — `renderCourtSlot`
- `ui/advisors.js` — `renderAdvisorChip`
- `ui/styles.css` — CSS для всех четырёх компонентов

**Тест Шага 57:**
- Карточка персонажа греческой нации показывает один из четырёх фаюмских портретов.
- Один и тот же персонаж всегда получает один и тот же портрет (перезагрузка не меняет).
- При удалённом JPG отображается `placeholder.svg` без ошибок в консоли.
- Модал показывает крупный портрет 96px без пикселизации.
- Придворный незанятый слот показывает прочерк `—`, занятый — портрет с золотой рамкой.

---

## БЛОК W — Splash-экран (Шаг 58)

---

### Шаг 58 — Фон splash-экрана: историческая фреска с культурным тинтом

**Цель:** показывать при загрузке игры полноэкранный splash с исторической фреской, логотипом и кнопкой «Начать». Фон — CC0-изображение из `assets/backgrounds/`, конкретный файл определяется `splash_bg` культурной группы текущего игрока (или последней выбранной нации). Поверх фрески — полупрозрачный цветной тинт, виньетка и оверлей для читаемости текста.

**Что сделать:**

1. HTML-разметка splash-экрана в `index.html` (перед основным интерфейсом):
   ```html
   <div id="splash-screen" class="splash">
     <div class="splash__bg"></div>          <!-- фреска через CSS -->
     <div class="splash__vignette"></div>    <!-- виньетка по краям -->
     <div class="splash__content">
       <h1 class="splash__title">IGRA²</h1>
       <p  class="splash__subtitle">Стратегия древнего мира</p>
       <button id="splash-start-btn" class="splash__btn">Начать игру</button>
     </div>
   </div>
   ```

2. CSS — фоновые слои:
   ```css
   .splash {
     position: fixed;
     inset: 0;
     z-index: 9999;
     display: flex;
     align-items: center;
     justify-content: center;
   }

   .splash__bg {
     position: absolute;
     inset: 0;
     background-image: var(--splash-bg);
     background-size: cover;
     background-position: center;
     filter: sepia(0.25) brightness(0.75);
     transition: background-image 0.4s ease;
   }

   .splash__vignette {
     position: absolute;
     inset: 0;
     background: radial-gradient(
       ellipse at center,
       transparent 35%,
       rgba(0,0,0,0.75) 100%
     );
   }

   .splash__content {
     position: relative;
     z-index: 1;
     text-align: center;
     color: #f0e8c8;
     text-shadow: 0 2px 8px rgba(0,0,0,0.8);
   }

   .splash__title {
     font-size: clamp(3rem, 8vw, 7rem);
     font-family: 'Cinzel', serif;        /* или любой антиквенный шрифт */
     letter-spacing: 0.15em;
     margin: 0 0 0.25em;
   }

   .splash__subtitle {
     font-size: clamp(1rem, 2vw, 1.5rem);
     opacity: 0.75;
     margin: 0 0 2.5em;
   }

   .splash__btn {
     padding: 14px 48px;
     font-size: 1.1rem;
     background: rgba(200,170,90,0.15);
     border: 1px solid rgba(200,170,90,0.7);
     color: #f0e8c8;
     border-radius: 4px;
     cursor: pointer;
     letter-spacing: 0.1em;
     transition: background 0.2s, transform 0.15s;
   }
   .splash__btn:hover {
     background: rgba(200,170,90,0.3);
     transform: translateY(-2px);
   }

   /* Анимация исчезновения splash при старте */
   .splash--hiding {
     animation: splashFade 0.6s ease forwards;
   }
   @keyframes splashFade {
     to { opacity: 0; pointer-events: none; }
   }
   ```

3. JS — установить фон из культурной группы, скрыть splash при клике:
   ```js
   // ui/splash.js
   import { getCultureGroup } from '../data/culture_groups.js';

   export function initSplash(lastNationId) {
     const splash = document.getElementById('splash-screen');
     const btn    = document.getElementById('splash-start-btn');

     const group = getCultureGroup(lastNationId ?? 'generic');
     const bgPath = `assets/backgrounds/${group.splash_bg}.jpg`;

     document.documentElement.style.setProperty(
       '--splash-bg', `url('${bgPath}')`
     );

     btn.addEventListener('click', () => {
       splash.classList.add('splash--hiding');
       splash.addEventListener('animationend', () => {
         splash.remove();
       }, { once: true });
     });
   }
   ```

4. Вызов в точке старта (после определения нации игрока):
   ```js
   import { initSplash } from './ui/splash.js';
   initSplash(savedNationId);   // из localStorage или null
   ```

5. Добавить в `assets/manifest.json` (Шаг 54) записи для splash-фонов:
   ```json
   {
     "id": "splash_pompeii",
     "group": "backgrounds",
     "filename": "assets/backgrounds/splash_pompeii.jpg",
     "source": "https://upload.wikimedia.org/wikipedia/commons/d/d3/Fresco_from_the_House_of_Julia_Felix,_Pompeii_depicting_scenes_from_the_Forum_market.JPG",
     "license": "Public Domain"
   },
   {
     "id": "splash_alexander",
     "group": "backgrounds",
     "filename": "assets/backgrounds/splash_alexander.jpg",
     "source": "https://upload.wikimedia.org/wikipedia/commons/7/7c/Alexander_%28Battle_of_Issus%29_Mosaic.jpg",
     "license": "Public Domain"
   },
   {
     "id": "splash_battle",
     "group": "backgrounds",
     "filename": "assets/backgrounds/splash_battle.jpg",
     "source": "https://upload.wikimedia.org/wikipedia/commons/7/7c/Alexander_%28Battle_of_Issus%29_Mosaic.jpg",
     "license": "Public Domain"
   }
   ```

**Какие файлы затрагиваются:**
- `index.html` — разметка `#splash-screen`
- `ui/styles.css` — CSS splash
- `ui/splash.js` — новый файл, `initSplash`
- `assets/manifest.json` — записи для `splash_pompeii`, `splash_alexander`, `splash_battle`

**Тест Шага 58:**
- При открытии игры отображается splash поверх всего интерфейса.
- Фреска зависит от последней выбранной нации (греческая → помпейский фон).
- Кнопка «Начать игру» скрывает splash плавно за 0.6 с.
- Если JPG не скачан, `--splash-bg` ведёт к несуществующему файлу — браузер показывает чёрный фон (без крашей).
- На мобильных экранах `clamp()` масштабирует заголовок корректно.

---

## БЛОК X — Декоративные рамки (Шаг 59)

---

### Шаг 59 — Декоративные рамки: SVG meander как CSS border-image

**Цель:** добавить тонкую декоративную рамку вокруг ключевых UI-блоков (панелей, модалов, карточек событий). Рамка — SVG с орнаментом культурной группы, применяется через `border-image`. Разные группы — разные орнаменты. SVG хранятся в `assets/icons/` и коммитятся в git (они маленькие).

**Что сделать:**

1. Создать `assets/icons/border_meander_gold.svg` — греческий меандр:
   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"
        viewBox="0 0 60 60" fill="none">
     <!-- Угловой элемент + горизонтальная секция для 9-slice -->
     <rect width="60" height="60" fill="none"/>
     <!-- Внешняя рамка -->
     <rect x="1" y="1" width="58" height="58"
           stroke="rgba(200,170,90,0.6)" stroke-width="1" fill="none"/>
     <!-- Меандр — угловой паттерн (упрощённый) -->
     <polyline points="4,4 4,14 14,14 14,4 24,4 24,14 34,14 34,4"
               stroke="rgba(200,170,90,0.5)" stroke-width="1.5" fill="none"/>
     <polyline points="4,56 4,46 14,46 14,56 24,56 24,46 34,46 34,56"
               stroke="rgba(200,170,90,0.5)" stroke-width="1.5" fill="none"/>
   </svg>
   ```

2. Создать `assets/icons/border_meander_dark.svg` — более тёмный вариант (для Celtic/Nomadic/Generic):
   — аналогичный SVG, но `stroke="rgba(150,130,80,0.4)"`.

3. CSS-переменная и применение через `border-image`:
   ```css
   :root {
     --panel-border-svg: url('assets/icons/border_meander_gold.svg');
   }

   /* Рамка на боковых панелях */
   #left-panel,
   #right-panel {
     border: 12px solid transparent;
     border-image: var(--panel-border-svg) 12 repeat;
   }

   /* Рамка на модальных окнах */
   .modal,
   .char-detail {
     border: 10px solid transparent;
     border-image: var(--panel-border-svg) 10 repeat;
   }

   /* Рамка на карточках событий */
   .event-card {
     border: 8px solid transparent;
     border-image: var(--panel-border-svg) 8 repeat;
   }
   ```

4. Смена рамки при смене культурной группы — добавить в `applyNationTheme` (Шаг 56):
   ```js
   function applyNationTheme(nationId) {
     const group = getCultureGroup(nationId);
     const root  = document.documentElement;

     root.style.setProperty('--panel-texture',    `url('assets/textures/${group.texture}.jpg')`);
     root.style.setProperty('--panel-tint',        group.panel_tint);
     // Новое:
     root.style.setProperty('--panel-border-svg', `url('assets/icons/${group.border}.svg')`);
   }
   ```
   Теперь греческие нации получают `border_meander_gold.svg`, остальные — `border_meander_dark.svg`.

5. Убедиться что `border-image` не ломает `border-radius`:
   ```css
   /* border-image и border-radius несовместимы в CSS — обходим через outline + box-shadow */
   #left-panel,
   #right-panel {
     border: none;                              /* убрать border-image */
     outline: 2px solid transparent;
     box-shadow:
       0 0 0 1px rgba(200,170,90,0.4),         /* внутренний контур */
       inset 0 0 0 1px rgba(200,170,90,0.15);  /* внутренняя подсветка */
   }

   /* Декоративные уголки через псевдоэлементы */
   #left-panel::after,
   #right-panel::after {
     content: '';
     position: absolute;
     inset: 0;
     border-radius: var(--panel-radius);
     background-image: var(--panel-border-svg);
     background-size: 40px 40px;
     background-repeat: no-repeat;
     background-position:
       top left,
       top right,
       bottom left,
       bottom right;
     /* Четыре угла через множественные фоны */
     background-image:
       var(--panel-border-svg),
       var(--panel-border-svg),
       var(--panel-border-svg),
       var(--panel-border-svg);
     background-position: 0 0, 100% 0, 0 100%, 100% 100%;
     background-size: 40px 40px;
     background-repeat: no-repeat;
     opacity: 0.6;
     pointer-events: none;
     z-index: 2;
   }
   ```

**Какие файлы затрагиваются:**
- `assets/icons/border_meander_gold.svg` — новый файл, коммитится в git
- `assets/icons/border_meander_dark.svg` — новый файл, коммитится в git
- `ui/styles.css` — CSS border-image и угловые псевдоэлементы
- `ui/panels.js` — добавить `--panel-border-svg` в `applyNationTheme`

**Тест Шага 59:**
- Панели греческих наций имеют золотистый угловой орнамент.
- Панели кельтских наций имеют более тёмный вариант рамки.
- `border-radius` панелей не сломан (скруглённые углы сохраняются).
- SVG-файлы присутствуют в git: `git ls-files assets/icons/ | grep border`.
- При `applyNationTheme('rome')` CSS-переменная `--panel-border-svg` обновляется.

---

## БЛОК Y — Иконки наций (Шаг 60)

---

### Шаг 60 — Иконки наций: культурный символ в заголовке, на карте и в дипломатии

**Цель:** у каждой культурной группы — своя иконка-символ (SVG). Иконка используется в трёх местах: заголовок активной нации (правый верхний угол), дипломатическое окно (флаг-маркер нации), маркер армии на карте. Иконки — маленькие CC0 SVG, хранятся в `assets/icons/`.

**Что сделать:**

1. Создать SVG-иконки для каждой культурной группы в `assets/icons/`:

   | Файл | Группа | Символ |
   |------|--------|--------|
   | `owl_athena.svg` | greek | Сова Афины (стилизованная) |
   | `roman_eagle.svg` | roman | Орёл легиона SPQR |
   | `carthage_star.svg` | carthaginian | Звезда Танит |
   | `egyptian_ankh.svg` | egyptian | Анкх |
   | `persian_faravahar.svg` | persian | Фравахар (крылатый символ) |
   | `celtic_torque.svg` | celtic | Кельтский торк (круговой узел) |
   | `indian_lotus.svg` | indian | Лотос |
   | `east_asian_dragon.svg` | east_asian | Дракон (упрощённый) |
   | `nomadic_bow.svg` | nomadic | Составной лук |
   | `generic_sword.svg` | generic | Меч (нейтральный символ) |

   Пример `assets/icons/owl_athena.svg` (минималистичный, монохромный):
   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor">
     <!-- Голова совы: круг + уши -->
     <circle cx="16" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
     <!-- Уши -->
     <polygon points="10,8 12,2 14,8" fill="currentColor" opacity="0.8"/>
     <polygon points="18,8 20,2 22,8" fill="currentColor" opacity="0.8"/>
     <!-- Глаза -->
     <circle cx="13" cy="13" r="2" fill="currentColor"/>
     <circle cx="19" cy="13" r="2" fill="currentColor"/>
     <!-- Клюв -->
     <polygon points="14,16 16,19 18,16" fill="currentColor"/>
     <!-- Тело (упрощённое крыло) -->
     <path d="M8,22 Q16,18 24,22 Q20,30 16,28 Q12,30 8,22Z"
           fill="currentColor" opacity="0.7"/>
   </svg>
   ```

2. Функция `getNationIconPath(nationId)` в `data/culture_groups.js`:
   ```js
   export function getNationIconPath(nationId) {
     const group = getCultureGroup(nationId);
     return `assets/icons/${group.icon}.svg`;
   }
   ```

3. **Заголовок нации** — правый верхний угол интерфейса:
   ```html
   <!-- index.html -->
   <div id="nation-header">
     <img id="nation-icon" class="nation-icon" src="" alt="" width="28" height="28">
     <span id="nation-name" class="nation-name"></span>
   </div>
   ```
   ```js
   function updateNationHeader(nationId, nationName) {
     document.getElementById('nation-icon').src = getNationIconPath(nationId);
     document.getElementById('nation-name').textContent = nationName;
   }
   ```
   CSS:
   ```css
   #nation-header {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 4px 12px;
     background: rgba(0,0,0,0.4);
     border-radius: 0 0 6px 6px;
   }
   .nation-icon {
     filter: invert(1) sepia(1) saturate(2) hue-rotate(5deg);
     /* Делает монохромный SVG золотистым */
     opacity: 0.85;
   }
   .nation-name {
     font-size: 14px;
     font-weight: 600;
     letter-spacing: 0.05em;
     color: #f0e8c8;
   }
   ```

4. **Дипломатическое окно** — иконка рядом с именем нации в списке:
   ```js
   function renderDiplomacyRow(nationId, nationName) {
     const row = document.createElement('div');
     row.className = 'diplo-row';

     const icon = document.createElement('img');
     icon.src    = getNationIconPath(nationId);
     icon.width  = 20;
     icon.height = 20;
     icon.className = 'diplo-row__icon';

     const name = document.createElement('span');
     name.textContent = nationName;

     row.appendChild(icon);
     row.appendChild(name);
     return row;
   }
   ```

5. **Маркер армии на карте** — SVG-иконка внутри `L.divIcon` (Leaflet):
   ```js
   function createArmyMarker(unitData, nationId) {
     const iconPath = getNationIconPath(nationId);
     const divIcon = L.divIcon({
       className: 'army-marker',
       html: `<img src="${iconPath}" width="18" height="18"
                   style="filter:invert(1) sepia(1) saturate(2);">`,
       iconSize:   [24, 24],
       iconAnchor: [12, 12],
     });
     return L.marker([unitData.lat, unitData.lng], { icon: divIcon });
   }
   ```

**Какие файлы затрагиваются:**
- `assets/icons/*.svg` — 10 новых SVG-файлов, все коммитятся в git
- `data/culture_groups.js` — добавить `getNationIconPath`
- `index.html` — `#nation-header`
- `ui/diplomacy.js` — `renderDiplomacyRow` с иконкой
- `ui/map.js` — `createArmyMarker` с иконкой культурной группы
- `ui/styles.css` — `.nation-icon`, `.diplo-row__icon`, `.army-marker`

**Тест Шага 60:**
- `getNationIconPath('athens')` → `'assets/icons/owl_athena.svg'`
- `getNationIconPath('rome')` → `'assets/icons/roman_eagle.svg'`
- Правый верхний угол показывает иконку совы для греческих наций.
- Дипломатический список отображает разные иконки для разных культурных групп.
- Маркеры армий на карте содержат иконку культурной группы нации.
- Все 10 SVG-файлов присутствуют в git: `git ls-files assets/icons/`.

---

## БЛОК AY — Итоговая интеграция UI (Шаг 61)

---

### Шаг 61 — Итоговая интеграция: порядок инициализации всех систем

**Цель:** описать правильный порядок вызовов при старте игры. Все системы из Шагов 54–60 взаимозависимы — некоторые должны загружаться строго после других. Этот шаг — финальный «монтажный лист» инициализации.

**Что сделать:**

Главный файл `js/main.js` — точка входа:

```js
import { loadSavedRegionColors }    from './game.js';
import { initLeafletMap }           from './map.js';
import { applyNationTheme }         from './ui/panels.js';
import { initSplash }               from './ui/splash.js';
import { applySeason }              from './seasons.js';
import { applyFogOfWar }            from './fog_of_war.js';
import { applyZoomLevel }           from './zoom_layers.js';
import { renderMapModeBar, setMapMode } from './map_modes.js';
import { renderTabBar }             from './ui/tabs.js';
import { PANEL_TABS }               from './ui/tabs.js';
import { updateStatusBar }          from './status_bar.js';
import { updateResourceStrip }      from './resource_strip.js';
import { refreshConstructionMarkers } from './construction_markers.js';
import { renderAllTradeRoutes }     from './trade_routes.js';
import { renderCourt }              from './ui/court.js';
import { registerHotkey }           from './hotkeys.js';
import { toggleLogDrawer }          from './log_drawer.js';
import { toggleSearch }             from './search.js';

async function main() {
  // ── Шаг 1: загрузить сохранение ─────────────────────────────
  await loadGameState();

  // ── Шаг 2: показать splash (асинхронно, не блокирует) ───────
  initSplash(gameState.playerNation);

  // ── Шаг 3: карта ────────────────────────────────────────────
  loadSavedRegionColors();
  initLeafletMap();

  // Восстановить цвета регионов с тремя задержками
  setTimeout(refreshRegionStyles, 300);
  setTimeout(refreshRegionStyles, 800);
  setTimeout(refreshRegionStyles, 1500);

  // ── Шаг 4: тема нации ───────────────────────────────────────
  applyNationTheme(gameState.playerNation);

  // ── Шаг 5: сезон ────────────────────────────────────────────
  applySeason(gameState.turn);

  // ── Шаг 6: режим карты ──────────────────────────────────────
  renderMapModeBar();
  setMapMode('political');

  // ── Шаг 7: туман войны ──────────────────────────────────────
  applyFogOfWar(gameState.playerNation);

  // ── Шаг 8: маркеры на карте ─────────────────────────────────
  for (const army of gameState.armies) createArmyMarker(army);
  refreshConstructionMarkers();
  renderAllTradeRoutes();

  // ── Шаг 9: UI-компоненты ────────────────────────────────────
  renderTabBar('left-tab-bar', PANEL_TABS, switchPanel);
  updateStatusBar();
  updateResourceStrip();

  // ── Шаг 10: горячие клавиши ─────────────────────────────────
  registerHotkey('end-turn',       () => document.getElementById('end-turn-btn').click());
  registerHotkey('open-diplomacy', () => switchPanel('diplomacy'));
  registerHotkey('open-court',     () => switchPanel('court'));
  registerHotkey('open-economy',   () => switchPanel('economy'));
  registerHotkey('open-log',       () => toggleLogDrawer());
  registerHotkey('search',         () => toggleSearch());
  registerHotkey('toggle-fog',     () => toggleFog(!fogEnabled));
  registerHotkey('mode-political', () => setMapMode('political'));
  registerHotkey('mode-military',  () => setMapMode('military'));
  registerHotkey('mode-economic',  () => setMapMode('economic'));
  registerHotkey('mode-culture',   () => setMapMode('culture'));
  registerHotkey('close-modal',    () => closeTopModal());
  registerHotkey('zoom-in',        () => leafletMap.zoomIn());
  registerHotkey('zoom-out',       () => leafletMap.zoomOut());

  // ── Шаг 11: подписка на события Leaflet ─────────────────────
  leafletMap.on('zoomend', () => {
    applyZoomLevel(leafletMap.getZoom());
    const label = leafletMap.getZoom() <= 4 ? 'Стратегический'
                : leafletMap.getZoom() <= 6 ? 'Тактический' : 'Детальный';
    updateStatusZoom(label);
  });

  // ── Шаг 12: подписка на игровые события ─────────────────────
  eventBus.on('turnEnd', onTurnEnd);
  eventBus.on('armyMoved', () => applyFogOfWar(gameState.playerNation));
  eventBus.on('playerNationChanged', ({ nationId }) => applyNationTheme(nationId));
}

function onTurnEnd() {
  recordResourceHistory();
  applySeason(gameState.turn);
  applyFogOfWar(gameState.playerNation);
  refreshConstructionMarkers();
  updateStatusBar();
  updateResourceStrip();
  const events = collectTurnEvents();
  const delta  = computeResourceDelta();
  showTurnSummary(events, delta);
  const aiActions = collectAIActions();
  showAITurnActions(aiActions);
}

main().catch(console.error);
```

**Зависимости инициализации (порядок важен):**

| # | Система | Зависит от |
|---|---------|-----------|
| 1 | `loadGameState` | — |
| 2 | `initSplash` | `gameState.playerNation` |
| 3 | `loadSavedRegionColors` + `initLeafletMap` | `gameState` |
| 4 | `applyNationTheme` | `initLeafletMap` (DOM панелей) |
| 5 | `applySeason` | `gameState.turn` |
| 6 | `renderMapModeBar` | `initLeafletMap` |
| 7 | `applyFogOfWar` | `initLeafletMap` + `gameState.regions` |
| 8 | маркеры на карте | `initLeafletMap` + `applyFogOfWar` |
| 9 | UI-компоненты | DOM готов |
| 10 | горячие клавиши | все предыдущие системы зарегистрированы |

**Тест Шага 61:**
- Игра запускается без ошибок в консоли.
- Splash показывается, карта загружается, цвета регионов восстанавливаются.
- Все горячие клавиши работают после полной загрузки.
- `main()` завершается без `undefined is not a function` ошибок.
- При перезагрузке все состояния (цвета, туман, сезон, ресурсы) восстанавливаются корректно.

---

## БЛОК AZ — Архив ассетов: сбор изображений (Шаги 62–68)

---

### Шаг 62 — Инфраструктура архива: папки, .gitignore, manifest.json, download.sh

**Цель:** создать в репозитории каркас архива ассетов. JPG-файлы не хранятся в git (они тяжёлые и не нужны разработчику без запуска). Хранятся только: манифест с URL, скрипт загрузки, SVG-файлы. Команда `bash assets/download.sh` воспроизводимо скачивает всё на любой машине.

**Что сделать:**

1. Создать структуру папок:
   ```
   assets/
   ├── portraits/
   │   ├── greek/
   │   ├── roman/
   │   ├── carthaginian/
   │   ├── egyptian/
   │   ├── persian/
   │   ├── celtic/
   │   ├── indian/
   │   ├── east_asian/
   │   └── nomadic/
   ├── textures/
   ├── backgrounds/
   ├── icons/
   ├── manifest.json
   ├── download.sh
   └── README.md
   ```

2. Добавить в `.gitignore`:
   ```
   assets/portraits/**/*.jpg
   assets/textures/*.jpg
   assets/backgrounds/*.jpg
   ```

3. Создать `assets/manifest.json` — реестр всех ассетов:
   ```json
   {
     "version": "1.0",
     "assets": [
       {
         "id": "greek/woman_red",
         "group": "portraits",
         "filename": "assets/portraits/greek/woman_red.jpg",
         "source": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/547860/1228117/main-image",
         "license": "CC0 1.0",
         "attribution": "The Metropolitan Museum of Art, object 547860"
       }
     ]
   }
   ```
   Каждый ассет имеет `id`, `group`, `filename`, `source` (прямой URL), `license`, `attribution`.

4. Создать `assets/download.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   MANIFEST="$(dirname "$0")/manifest.json"

   # jq обязателен: brew install jq / apt install jq
   count=$(jq '.assets | length' "$MANIFEST")
   echo "Загружаю $count ассетов..."

   jq -c '.assets[]' "$MANIFEST" | while IFS= read -r asset; do
     filename=$(echo "$asset" | jq -r '.filename')
     source=$(echo   "$asset" | jq -r '.source')

     if [ -f "$filename" ]; then
       echo "  SKIP $filename"
       continue
     fi

     mkdir -p "$(dirname "$filename")"
     echo "  GET  $filename"
     curl -fsSL --retry 3 --retry-delay 2 \
          -o "$filename" "$source" || echo "  FAIL $filename"
   done

   echo "Готово."
   ```

5. Создать `assets/README.md` с таблицей источников и лицензий.

**Тест Шага 62:**
- `bash assets/download.sh` завершается без ошибок.
- `node -e "require('./assets/manifest.json')"` — валидный JSON.
- `git ls-files assets/ | grep '\.jpg'` возвращает пусто.
- SVG-файлы из `assets/icons/` присутствуют в git.

---

### Шаг 63 — Греческие и римские портреты: Фаюмская коллекция Met Museum

**Цель:** добавить в манифест 6 портретов из Фаюмской коллекции Метрополитен-музея (CC0). Это основа для греческой, римской и египетской культурных групп. Все портреты — реалистичные энкаустические картины I–III вв. н.э.

**Добавить в `assets/manifest.json`:**

| id | Описание | Met object |
|----|----------|-----------|
| `greek/woman_red` | Молодая женщина в красном | 547860 |
| `greek/man_bearded` | Бородатый мужчина | 547856 |
| `greek/man_thinface` | Мужчина | 547858 |
| `greek/woman_wreath` | Женщина с золотым венком | 547861 |
| `roman/roman_youth` | Молодой римлянин | 547768 |
| `egyptian/mummy_youth` | Юноша | 547697 |

Все URL вида:
```
https://collectionapi.metmuseum.org/api/collection/v1/iiif/{objectId}/{imageId}/main-image
```

**Дополнительные портреты для расширения пула** — найти через API:
```bash
# Поиск Фаюмских портретов в открытом доступе
curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
?q=fayum+portrait&isPublicDomain=true&medium=Encaustic" \
| jq '.objectIDs[:20]'
```
Из результатов выбрать ещё 4–6 объектов с `hasImages: true` и добавить в манифест.

**Тест Шага 63:**
- После `bash assets/download.sh` все 6 файлов присутствуют в `assets/portraits/greek/` и `roman/`.
- Каждый JPG весит не менее 50 KB (не пустой).
- `file assets/portraits/greek/woman_red.jpg` → `JPEG image data`.

---

### Шаг 64 — Персидские, карфагенские и ближневосточные портреты

**Цель:** найти CC0-изображения подходящие для персидской и карфагенской культурных групп. Прямых фаюмских портретов для них нет, поэтому используем: рельефы, терракотовые бюсты, мозаики — всё из Met CC0 или Wikimedia PD.

**Источники для поиска:**

1. **Персидская группа** — рельефы из Персеполя (Met CC0):
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=achaemenid+portrait&isPublicDomain=true" | jq '.objectIDs[:10]'
   ```
   Ориентиры: объекты с тегами `Achaemenid`, `Persian`, `relief`, `head`.

2. **Карфагенская группа** — терракотовые маски и бюсты (Wikimedia PD):
   - Punic terracotta masks (категория Wikimedia: `Carthaginian_art`)
   - Стела Баала — Национальный музей Карфагена, PD

3. **Добавить в манифест** (пример для персидской):
   ```json
   {
     "id": "persian/achaemenid_warrior",
     "group": "portraits",
     "filename": "assets/portraits/persian/achaemenid_warrior.jpg",
     "source": "https://collectionapi.metmuseum.org/api/collection/v1/iiif/{id}/{imageId}/main-image",
     "license": "CC0 1.0",
     "attribution": "The Metropolitan Museum of Art"
   }
   ```

4. Заглушка для групп без реальных портретов — SVG с инициалами нации:
   ```svg
   <!-- assets/portraits/placeholder.svg -->
   <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
     <rect width="96" height="96" rx="8" fill="#2a1a08"/>
     <circle cx="48" cy="36" r="20" fill="#4a3010"/>
     <ellipse cx="48" cy="80" rx="30" ry="20" fill="#4a3010"/>
     <text x="48" y="42" text-anchor="middle" font-size="20"
           font-family="serif" fill="rgba(200,170,90,0.8)">?</text>
   </svg>
   ```

**Тест Шага 64:**
- `assets/portraits/persian/` содержит хотя бы 2 JPG после `download.sh`.
- `assets/portraits/placeholder.svg` существует в git.
- Заглушка корректно отображается в браузере как 96×96 SVG.

---

### Шаг 65 — Кельтские, индийские и восточноазиатские портреты

**Цель:** подобрать CC0-изображения для трёх оставшихся культурных групп — кельтской, индийской и восточноазиатской. Для каждой группы нужно минимум 2 разных изображения (мужское + женское или молодой + зрелый).

**Источники:**

1. **Кельтская группа** — реконструкции, монеты, украшения как визуальные маркеры:
   - Wikimedia: категория `Iron_Age_art_of_the_British_Isles` — PD
   - British Museum (Wikimedia Commons) — многие файлы PD
   - Ориентир: `La Tène art`, декоративные узоры для текстуры панелей

2. **Индийская группа** — скульптура периода Маурьев и Гупт:
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=gandhara+head&isPublicDomain=true" | jq '.objectIDs[:10]'
   ```
   Гандхарская скульптура I–III вв. — греко-буддийский стиль, лица реалистичны.

3. **Восточноазиатская группа** — портреты эпохи Хань:
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=han+dynasty+figure&isPublicDomain=true" | jq '.objectIDs[:10]'
   ```
   Терракотовые фигуры и фрески эпохи Хань (III в. до н.э. – III в. н.э.).

4. **Кочевая группа** — скифское искусство:
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=scythian&isPublicDomain=true" | jq '.objectIDs[:10]'
   ```

5. Добавить найденные объекты в `manifest.json` по той же схеме.

**Тест Шага 65:**
- `assets/portraits/` содержит не менее 6 подпапок с хотя бы 1 JPG в каждой.
- `bash assets/download.sh` проходит без ошибок `FAIL`.
- `wc -l assets/manifest.json` > 100 строк (достаточно записей).

---

### Шаг 66 — Фоновые текстуры панелей: вазы, папирус, ткань

**Цель:** собрать 4–5 фоновых текстур для панелей разных культурных групп. Текстуры должны быть достаточно нейтральными (не мешать читать текст), исторически аутентичными и CC0.

**Источники текстур:**

1. **`greek_vase`** — греческая чернофигурная керамика:
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=black-figure+amphora&isPublicDomain=true&medium=Terracotta" \
   | jq '.objectIDs[:5]'
   ```
   Выбрать объект с плотным узором на тёмном фоне.

2. **`papyrus`** — египетский папирус (для египетской группы):
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=papyrus+egypt&isPublicDomain=true" | jq '.objectIDs[:5]'
   ```

3. **`roman_mosaic`** — римская мозаика (для римской группы):
   - Wikimedia: `Roman_mosaics` — множество PD файлов
   - Ориентир: мелкий геометрический паттерн

4. **`persian_textile`** — персидский текстиль (для персидской группы):
   ```bash
   curl "https://collectionapi.metmuseum.org/public/collection/v1/search\
   ?q=persian+textile&isPublicDomain=true" | jq '.objectIDs[:5]'
   ```

5. **`linen`** — нейтральный льняной фон (для остальных групп):
   - Любая Met CC0 текстура ткани древнего периода

**Добавить в манифест** найденные текстуры с `"group": "textures"`.

**Тест Шага 66:**
- `assets/textures/` содержит 4–5 JPG после `download.sh`.
- Каждая текстура при `background-size: 320px` создаёт повторяющийся паттерн без разрывов.
- Текст поверх текстуры с `opacity: 0.07` читается без труда.

---

### Шаг 67 — Splash-фоны: исторические сцены для каждой культурной группы

**Цель:** подобрать по одному полноэкранному фону для splash-экрана каждой из 10 культурных групп. Фоны должны быть атмосферными, горизонтальными (landscape), с тёмными зонами где будет текст.

**Источники и целевые изображения:**

| Группа | Описание | Источник |
|--------|----------|----------|
| greek | Помпейская фреска — рыночная сцена | Wikimedia PD |
| roman | Мозаика Александра (Битва при Иссе) | Wikimedia PD |
| carthaginian | Рельеф с Ваал-Аммоном / пунийская стела | Wikimedia PD |
| egyptian | Роспись гробницы Небамуна — пир | British Museum / Wikimedia PD |
| persian | Рельеф из Персеполя — процессия данников | Wikimedia PD |
| celtic | Котёл из Гундеструпа | Wikimedia PD (Nat. Museum Denmark) |
| indian | Скульптура Санчи — восточные ворота | Wikimedia PD |
| east_asian | Шёлковая живопись эпохи Хань | Met Museum CC0 |
| nomadic | Скифские золотые украшения (Эрмитаж) | Wikimedia PD |
| generic | Мозаика Александра (альтернативный кроп) | Wikimedia PD |

**Для каждого изображения:**
1. Найти на Wikimedia Commons или через Met API
2. Скачать оригинал (не thumbnail — нужно минимум 1920px ширины)
3. Добавить в `manifest.json` с `"group": "backgrounds"`

**Скрипт поиска на Wikimedia для конкретного изображения:**
```bash
# Пример: найти прямой URL файла по имени
curl "https://en.wikipedia.org/w/api.php?action=query\
&titles=File:Nebamun_hunting_in_the_marshes.jpg\
&prop=imageinfo&iiprop=url&format=json" | jq '.query.pages[].imageinfo[].url'
```

**Тест Шага 67:**
- `assets/backgrounds/` содержит 10 JPG после `download.sh`.
- Каждый файл весит не менее 200 KB (достаточное разрешение).
- Splash-экран выглядит атмосферно при `filter: sepia(0.25) brightness(0.75)`.

---

### Шаг 68 — SVG-иконки наций и декоративные рамки (файлы в git)

**Цель:** создать 10 SVG-иконок культурных групп и 2 варианта декоративной рамки. SVG маленькие — они хранятся в git. Это завершает архив ассетов: все файлы на месте, скрипт работает.

**SVG-иконки для `assets/icons/`:**

```
owl_athena.svg       — греческая сова (голова совы, стилизованная)
roman_eagle.svg      — орёл легиона (расправленные крылья, SPQR)
carthage_star.svg    — звезда Танит (восьмилучевая + треугольник)
egyptian_ankh.svg    — анкх (крест с петлёй сверху)
persian_faravahar.svg — фравахар (крылатый диск, упрощённый)
celtic_torque.svg    — кельтский торк (круговой узел)
indian_lotus.svg     — лотос (8 лепестков)
east_asian_dragon.svg — дракон (S-образный силуэт)
nomadic_bow.svg      — составной лук (дугообразный, со стрелой)
generic_sword.svg    — прямой меч (крест + клинок)
```

**SVG-рамки:**
```
border_meander_gold.svg  — меандровый орнамент, золотистый
border_meander_dark.svg  — меандровый орнамент, тёмный
```

**Требования к каждому SVG:**
- `viewBox="0 0 32 32"` (или 24×24 для маленьких вариантов)
- `fill="currentColor"` — цвет задаётся через CSS
- Монохромный — без градиентов и сложных фильтров
- Размер файла ≤ 2 KB

**Тест Шага 68:**
- `git ls-files assets/icons/` показывает все 12 SVG-файлов.
- Каждый SVG валиден: `xmllint --noout assets/icons/owl_athena.svg`.
- В браузере иконка корректно масштабируется до 16px и 48px.
- `bash assets/download.sh` + проверка: `ls assets/portraits/greek/ | wc -l` ≥ 4.
- Итог: архив полностью воспроизводим на чистой машине командой `bash assets/download.sh`.

---

## БЛОК BA — Сбор портретов из открытых источников (Шаги 69–73)

---

### Шаг 69 — Met Museum: Фаюмские портреты (40–50 лиц, греческая/римская/египетская группы)

**Цель:** систематически собрать все доступные Фаюмские портреты из Met Museum с лицензией CC0. Это лучший источник реалистичных античных лиц — энкаустическая живопись I–III вв. н.э., высокое качество сканирования.

**Скрипт поиска через Met API:**
```bash
#!/usr/bin/env bash
# scripts/fetch_met_fayum.sh
# Находит все Фаюмские портреты с CC0 лицензией и сохраняет URL в manifest

BASE="https://collectionapi.metmuseum.org/public/collection/v1"

# Поиск по ключевым словам
IDS=$(curl -s "$BASE/search?q=mummy+portrait&isPublicDomain=true&medium=Encaustic" \
     | jq '.objectIDs[]')

for id in $IDS; do
  obj=$(curl -s "$BASE/objects/$id")
  hasImg=$(echo "$obj" | jq -r '.hasImages')
  [ "$hasImg" != "true" ] && continue

  title=$(echo  "$obj" | jq -r '.title')
  imgUrl=$(echo "$obj" | jq -r '.primaryImageSmall')
  [ -z "$imgUrl" ] || [ "$imgUrl" = "null" ] && continue

  echo "{\"id\": $id, \"title\": \"$title\", \"url\": \"$imgUrl\"}"
done
```

**Дополнительные поисковые запросы (запустить скрипт для каждого):**
```bash
q=mummy+portrait&isPublicDomain=true&medium=Encaustic
q=fayum+portrait&isPublicDomain=true
q=portrait+panel&isPublicDomain=true&medium=Encaustic+on+wood
q=Romano-Egyptian+portrait&isPublicDomain=true
```

**Распределение по группам:**
- Женские портреты → `assets/portraits/greek/` и `assets/portraits/egyptian/`
- Мужские с римскими чертами → `assets/portraits/roman/`
- Юношеские → `assets/portraits/greek/`

**Ожидаемый результат:** 40–50 уникальных JPG, каждый ~100–300 KB (`primaryImageSmall`).

**Добавить все найденные объекты в `assets/manifest.json`** с group `portraits` и правильным `id` пути.

**Тест Шага 69:**
- `ls assets/portraits/greek/ | wc -l` ≥ 15
- `ls assets/portraits/roman/ | wc -l` ≥ 8
- `ls assets/portraits/egyptian/ | wc -l` ≥ 8
- Все файлы — валидные JPEG: `file assets/portraits/greek/*.jpg | grep -v JPEG` пусто.

---

### Шаг 70 — Met Museum: Гандхарская скульптура (индийская группа) и греко-римские бюсты

**Цель:** собрать портретные изображения для индийской и расширить греческую/римскую группы. Гандхарская скульптура (I–III вв. н.э.) — греко-буддийский стиль, реалистичные лица. Греко-римские мраморные бюсты — крупнейший CC0-фонд Met.

**Скрипты поиска:**

```bash
# Гандхарская скульптура
curl -s "https://collectionapi.metmuseum.org/public/collection/v1/search\
?q=gandhara+head&isPublicDomain=true&geoLocation=Pakistan" \
| jq '.objectIDs[]'

# Ещё запросы для Гандхары:
# q=gandhara+bodhisattva&isPublicDomain=true
# q=kushan+portrait&isPublicDomain=true
# q=gandhara+relief&isPublicDomain=true&medium=Schist

# Греко-римские бюсты
curl -s "https://collectionapi.metmuseum.org/public/collection/v1/search\
?q=roman+portrait+bust&isPublicDomain=true&medium=Marble" \
| jq '.objectIDs[]'

# Дополнительно:
# q=greek+portrait+head&isPublicDomain=true&medium=Marble
# q=roman+head&isPublicDomain=true&medium=Marble&dateBegin=-300&dateEnd=400
```

**Фильтрация результатов** — оставлять только объекты где:
- `hasImages: true`
- `primaryImageSmall` не пустой
- В `title` или `objectName` есть слова: `head`, `portrait`, `bust`, `figure`

```bash
# Фильтр для каждого objectId
obj=$(curl -s "$BASE/objects/$id")
title=$(echo "$obj" | jq -r '.title + " " + .objectName' | tr '[:upper:]' '[:lower:]')
echo "$title" | grep -qE 'head|portrait|bust|figure' || continue
```

**Распределение:**
- Гандхарские головы → `assets/portraits/indian/` (~30–40 файлов)
- Греческие мраморные головы → `assets/portraits/greek/` (пополнить до 25+)
- Римские бюсты → `assets/portraits/roman/` (пополнить до 20+)

**Тест Шага 70:**
- `ls assets/portraits/indian/ | wc -l` ≥ 15
- `ls assets/portraits/greek/ | wc -l` ≥ 25
- `ls assets/portraits/roman/ | wc -l` ≥ 20

---

### Шаг 71 — Met Museum: египетские портреты + Wikimedia PD для карфагенской, персидской, кельтской, кочевой групп

**Цель:** закрыть оставшиеся культурные группы. Для египетской — деревянные панели и статуэтки из Met CC0. Для карфагенской, персидской, кельтской, кочевой — рельефы, терракота, монеты из Wikimedia PD.

**Met Museum — египетские:**
```bash
# Египетские портреты и головы
curl -s "https://collectionapi.metmuseum.org/public/collection/v1/search\
?q=egyptian+portrait+head&isPublicDomain=true" | jq '.objectIDs[]'

# Дополнительно:
# q=egypt+wooden+panel&isPublicDomain=true
# q=ptolemaic+portrait&isPublicDomain=true
# q=egypt+mummy+mask&isPublicDomain=true
```
→ `assets/portraits/egyptian/` (добавить до 15–20 файлов)

**Wikimedia Commons — остальные группы:**

Скрипт поиска файлов в категории Wikimedia:
```bash
#!/usr/bin/env bash
# scripts/fetch_wikimedia_category.sh CATEGORY OUTPUT_DIR
CATEGORY="$1"
OUT="$2"

curl -s "https://commons.wikimedia.org/w/api.php\
?action=query&list=categorymembers&cmtitle=Category:${CATEGORY}\
&cmtype=file&cmlimit=50&format=json" \
| jq -r '.query.categorymembers[].title' \
| while read title; do
    # Получить прямой URL файла
    fname=$(echo "$title" | sed 's/File://g' | tr ' ' '_')
    url=$(curl -s "https://commons.wikimedia.org/w/api.php\
?action=query&titles=File:${fname}&prop=imageinfo\
&iiprop=url&format=json" \
    | jq -r '.query.pages[].imageinfo[0].url')
    echo "$url"
  done
```

**Целевые категории Wikimedia для каждой группы:**

| Группа | Категория Wikimedia |
|--------|-------------------|
| carthaginian | `Punic_terracotta_masks`, `Carthaginian_art` |
| persian | `Achaemenid_art`, `Persepolis_reliefs` |
| celtic | `La_Tène_art`, `Celtic_heads` |
| nomadic | `Scythian_art`, `Pazyryk_culture` |
| east_asian | `Han_dynasty_art`, `Terracotta_army` |

**Из каждой категории выбрать 8–12 изображений** с человеческими лицами / головами, добавить в манифест.

**Тест Шага 71:**
- Все 10 папок `assets/portraits/*/` содержат ≥ 6 JPG.
- `jq '.assets | length' assets/manifest.json` ≥ 150.
- `bash assets/download.sh` проходит без единого `FAIL`.

---

### Шаг 72 — CSS-вариации: умножить пул портретов в 8 раз без новых файлов

**Цель:** из ~150 реальных портретов получить ~1200 визуально различных вариантов. Каждый персонаж получает свою уникальную комбинацию портрет + CSS-фильтр, детерминированно из `char.id`.

**Что сделать:**

1. Определить 8 CSS-фильтров в `data/portrait_filters.js`:
   ```js
   export const PORTRAIT_FILTERS = [
     '',                                                    // 0 — оригинал
     'hue-rotate(20deg) brightness(1.05)',                 // 1 — теплее
     'hue-rotate(-15deg) saturate(0.85)',                  // 2 — холоднее
     'sepia(0.35) contrast(1.1)',                          // 3 — состаренный
     'hue-rotate(10deg) brightness(0.90) contrast(1.05)', // 4 — темнее
     'saturate(1.4) brightness(1.08)',                     // 5 — насыщеннее
     'hue-rotate(-25deg) brightness(0.93)',                // 6 — синеватый
     'sepia(0.15) hue-rotate(8deg) saturate(1.2)',        // 7 — золотистый
   ];
   ```

2. Обновить `getPortraitForCharacter` в `data/culture_groups.js`:
   ```js
   import { PORTRAIT_FILTERS } from './portrait_filters.js';

   export function getPortraitForCharacter(char, nationId) {
     const group  = getCultureGroup(nationId);
     const pool   = group.portrait_pool;

     // Выбор портрета из пула
     const imgIdx    = hashCode(char.id)             % pool.length;
     // Выбор CSS-фильтра — второй хэш чтобы не коррелировал с imgIdx
     const filterIdx = hashCode(char.id + '_filter') % PORTRAIT_FILTERS.length;

     return {
       src:    `assets/portraits/${pool[imgIdx]}.jpg`,
       filter: PORTRAIT_FILTERS[filterIdx],
     };
   }
   ```

3. Обновить `renderPortrait` в `ui/portrait.js`:
   ```js
   export function renderPortrait(char, nationId, sizePx = 48) {
     const { src, filter } = getPortraitForCharacter(char, nationId);
     const fallback = 'assets/portraits/placeholder.svg';

     const img = document.createElement('img');
     img.className = 'char-portrait';
     img.src       = src;
     img.width     = sizePx;
     img.height    = sizePx;
     img.alt       = char.name ?? '';
     img.loading   = 'lazy';
     img.draggable = false;
     if (filter) img.style.filter = filter;

     img.onerror = () => { img.src = fallback; img.style.filter = ''; };
     return img;
   }
   ```

4. Пополнить `portrait_pool` каждой культурной группы в `culture_groups.js` — вместо 4 имён файлов указать все найденные на Шагах 69–71:
   ```js
   greek: {
     portrait_pool: [
       'greek/woman_red', 'greek/man_bearded', 'greek/man_thinface',
       'greek/woman_wreath', 'greek/bust_01', 'greek/bust_02',
       // ... все ~25 файлов из assets/portraits/greek/
     ],
     ...
   }
   ```

**Итоговый охват:**
```
Группа         Портретов    × 8 фильтров = Вариантов
greek          25           × 8          = 200
roman          20           × 8          = 160
egyptian       18           × 8          = 144
indian         15           × 8          = 120
persian        10           × 8          = 80
carthaginian   8            × 8          = 64
celtic         8            × 8          = 64
east_asian     8            × 8          = 64
nomadic        8            × 8          = 64
generic        10           × 8          = 80
─────────────────────────────────────────────
Итого:        ~130                       ~1040 уникальных вариантов
```

**Тест Шага 72:**
- Два персонажа одной нации с разными `id` получают разные `filter` или разный `src`.
- Один и тот же персонаж всегда получает один и тот же портрет (детерминированность).
- `PORTRAIT_FILTERS[0]` = `''` — оригинал без изменений.
- При удалённом JPG `onerror` показывает `placeholder.svg` без фильтра.

---

### Шаг 73 — Процедурный SVG-портрет: уникальное лицо из хэша персонажа

**Цель:** для персонажей чьи портреты не загружены (первый запуск, офлайн, малые нации) — генерировать SVG-лицо прямо в браузере из `char.id`. Каждый персонаж получает уникальное лицо: форма, цвет кожи, цвет волос — всё детерминированно.

**Что сделать:**

1. Детерминированный генератор псевдослучайных чисел из seed (`js/rng.js`):
   ```js
   // Mulberry32 — быстрый, детерминированный
   export function seededRNG(seed) {
     let s = seed >>> 0;
     return function() {
       s += 0x6D2B79F5;
       let t = Math.imul(s ^ (s >>> 15), 1 | s);
       t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   ```

2. Функция `generatePortraitSVG(charId, culturalGroup)` в `ui/portrait_svg.js`:
   ```js
   import { seededRNG }  from '../js/rng.js';
   import { hashCode }   from '../data/culture_groups.js';

   // Палитры по культурным группам
   const SKIN_PALETTES = {
     greek:         [[210,175,120],[195,160,105],[225,190,140]],
     roman:         [[205,170,115],[190,155,100],[220,185,135]],
     egyptian:      [[160,120, 80],[140,100, 60],[175,135, 90]],
     persian:       [[170,130, 85],[155,115, 70],[185,145,100]],
     indian:        [[150,110, 70],[130, 90, 50],[165,125, 85]],
     carthaginian:  [[155,115, 75],[140,100, 60],[170,130, 90]],
     celtic:        [[220,185,145],[205,170,130],[235,200,160]],
     east_asian:    [[215,180,140],[200,165,125],[230,195,155]],
     nomadic:       [[185,145, 95],[170,130, 80],[200,160,110]],
     generic:       [[200,165,120],[185,150,105],[215,180,135]],
   };

   export function generatePortraitSVG(charId, groupId = 'generic', size = 96) {
     const rng      = seededRNG(hashCode(charId));
     const palette  = SKIN_PALETTES[groupId] ?? SKIN_PALETTES.generic;
     const skin     = palette[Math.floor(rng() * palette.length)];
     const [r,g,b]  = skin;

     // Форма лица: 0=овал, 1=круглое, 2=вытянутое
     const faceType = Math.floor(rng() * 3);
     const faceRy   = faceType === 0 ? 38 : faceType === 1 ? 34 : 42;
     const faceRx   = faceType === 0 ? 30 : faceType === 1 ? 33 : 27;

     // Цвет волос
     const hairH    = Math.floor(rng() * 60);          // оттенок
     const hairL    = Math.floor(10 + rng() * 35);     // светлость
     const hairColor= `hsl(${hairH},40%,${hairL}%)`;

     // Борода (только для части мужских персонажей)
     const hasBeard = rng() > 0.55;
     const beard    = hasBeard
       ? `<ellipse cx="48" cy="${68 + faceRy - 10}" rx="${faceRx - 6}" ry="10"
              fill="${hairColor}" opacity="0.7"/>`
       : '';

     return `<svg xmlns="http://www.w3.org/2000/svg"
          width="${size}" height="${size}" viewBox="0 0 96 96">
       <!-- Фон -->
       <rect width="96" height="96" rx="6"
             fill="rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})"/>
       <!-- Плечи -->
       <ellipse cx="48" cy="90" rx="36" ry="20"
                fill="rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})"/>
       <!-- Волосы -->
       <ellipse cx="48" cy="${30 - faceRy + 10}" rx="${faceRx + 4}" ry="20"
                fill="${hairColor}"/>
       <!-- Лицо -->
       <ellipse cx="48" cy="45" rx="${faceRx}" ry="${faceRy}"
                fill="rgb(${r},${g},${b})"/>
       <!-- Глаза -->
       <ellipse cx="${48 - faceRx*0.35}" cy="38" rx="4" ry="3" fill="#1a1008"/>
       <ellipse cx="${48 + faceRx*0.35}" cy="38" rx="4" ry="3" fill="#1a1008"/>
       <!-- Рот -->
       <path d="M${48 - 8},${52 + faceRy*0.15}
                Q48,${56 + faceRy*0.15} ${48 + 8},${52 + faceRy*0.15}"
             stroke="rgb(${Math.max(0,r-40)},${Math.max(0,g-50)},${Math.max(0,b-40)})"
             stroke-width="1.5" fill="none"/>
       ${beard}
     </svg>`;
   }
   ```

3. Интегрировать в `renderPortrait` как fallback при `onerror`:
   ```js
   img.onerror = () => {
     const group = getCultureGroup(nationId).groupId;
     const svgStr = generatePortraitSVG(char.id, group, sizePx);
     const blob   = new Blob([svgStr], { type: 'image/svg+xml' });
     img.src      = URL.createObjectURL(blob);
     img.style.filter = '';
   };
   ```

4. Использовать SVG-портрет также в заглушке `assets/portraits/placeholder.svg` — заменить статичный вопрос на минималистичный силуэт лица.

**Тест Шага 73:**
- При отсутствии JPG-файлов все персонажи показывают сгенерированные SVG-лица.
- Два персонажа с разными `id` всегда получают разные SVG.
- Один персонаж всегда получает одно и то же SVG после перезагрузки.
- Греческий персонаж и кочевой получают разные тона кожи.
- При загруженных JPG SVG-генератор не вызывается.

---

