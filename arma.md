# arma.md — План реализации тактической карты на Pixi.js v8

> Документ для исполнителя (sonnet). Код не писать — только читать план и реализовывать пошагово.
> После каждого шага выполнить тест перед переходом к следующему.

---

## БЛОК А — Фундамент (Шаги 1–3)

---

### Шаг 1 — Pixi.js v8: инициализация и слои

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

