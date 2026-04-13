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

---

# ЧАСТЬ 2 — Редизайн главного экрана игры

> Улучшения главной игровой страницы `index.html`.
> Каждый шаг независим — можно реализовывать в любом порядке внутри блока.
> После каждого шага тест в браузере перед переходом к следующему.

## БЛОК I — Layout: нижняя строка и алерты (Шаги 24–26)

---

### Шаг 24 — Лог событий как drawer (выдвижная панель)

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

## БЛОК Z — Исправление цвета регионов при перезагрузке (Шаг 61)

---

### Шаг 61 — Цвета стран не пропадают при перезагрузке: три уровня защиты

**Цель:** устранить баг, при котором после перезагрузки страницы регионы теряют цвет и их нужно кликать по одному чтобы цвет вернулся. Причина — race condition: Leaflet Canvas рендерит тайлы асинхронно и сбрасывает стили, пока `refreshRegionStyles()` уже отработал.

**Диагностика:**
- Leaflet Canvas renderer вызывает `_redraw()` несколько раз после `invalidateSize()`
- Каждый `_redraw()` сбрасывает заливку полигонов к дефолтной
- `refreshRegionStyles()` нужно вызывать ПОСЛЕ последнего `_redraw()`, а не после DOMContentLoaded

**Что сделать:**

1. Первый уровень — три последовательных `setTimeout` с возрастающей задержкой:
   ```js
   // После инициализации карты
   setTimeout(refreshRegionStyles, 300);
   setTimeout(refreshRegionStyles, 800);
   setTimeout(refreshRegionStyles, 1500);
   ```
   Это перекрывает большинство кейсов на быстрых и медленных машинах.

2. Второй уровень — слушать события Leaflet после добавления слоёв:
   ```js
   leafletMap.on('layeradd', debounce(refreshRegionStyles, 200));
   leafletMap.on('zoomend',  debounce(refreshRegionStyles, 150));
   leafletMap.on('moveend',  debounce(refreshRegionStyles, 150));
   ```
   Функция `debounce` — стандартная, задержка 150–200 мс:
   ```js
   function debounce(fn, delay) {
     let timer;
     return (...args) => {
       clearTimeout(timer);
       timer = setTimeout(() => fn(...args), delay);
     };
   }
   ```

3. Третий уровень — Canvas renderer hook. Leaflet Canvas имеет метод `_updateStyle`, патчим его:
   ```js
   // После создания renderer
   const originalUpdateStyle = L.Canvas.prototype._updateStyle;
   L.Canvas.prototype._updateStyle = function(layer) {
     originalUpdateStyle.call(this, layer);
     // Восстановить цвет из gameState если слой — регион
     if (layer._regionId && gameState.regionColors[layer._regionId]) {
       layer.setStyle({ fillColor: gameState.regionColors[layer._regionId] });
     }
   };
   ```

4. Сохранять цвета регионов в `localStorage` при каждом изменении:
   ```js
   function setRegionColor(regionId, color) {
     // Обновить слой на карте
     regionLayers[regionId]?.setStyle({ fillColor: color, fillOpacity: 0.5 });

     // Сохранить в gameState
     gameState.regionColors[regionId] = color;

     // Персистировать
     localStorage.setItem('regionColors', JSON.stringify(gameState.regionColors));
   }
   ```

5. При загрузке восстанавливать цвета ДО первого рендера карты:
   ```js
   function loadSavedRegionColors() {
     try {
       const saved = JSON.parse(localStorage.getItem('regionColors') ?? '{}');
       Object.assign(gameState.regionColors, saved);
     } catch { /* ignore */ }
   }

   // Порядок вызовов при старте:
   loadSavedRegionColors();   // 1. загрузить цвета
   initLeafletMap();          // 2. создать карту
   setTimeout(refreshRegionStyles, 300);  // 3. применить цвета
   ```

6. `refreshRegionStyles()` должна читать из `gameState.regionColors`:
   ```js
   function refreshRegionStyles() {
     for (const [regionId, layer] of Object.entries(regionLayers)) {
       const color = gameState.regionColors[regionId];
       if (color) {
         layer.setStyle({ fillColor: color, fillOpacity: 0.5 });
       }
     }
   }
   ```

**Какие файлы затрагиваются:**
- `js/map.js` (или основной файл карты) — патч Canvas, `refreshRegionStyles`, дебаунсированные обработчики
- `js/game.js` — `loadSavedRegionColors`, `setRegionColor`, порядок инициализации

**Тест Шага 61:**
- Установить цвет нескольких регионов, обновить страницу — цвета сохранились.
- `localStorage.getItem('regionColors')` содержит корректный JSON с ID регионов.
- При масштабировании карты цвета не пропадают.
- При быстром открытии в Firefox (медленный Canvas) цвета также восстанавливаются.

---

## БЛОК AA — Переработка всплывающего окна региона (Шаг 62)

---

### Шаг 62 — Popup региона: вкладки, иконки, прогресс-бар строительства

**Цель:** заменить простой `L.popup` на кастомный HTML-попап, закреплённый за регионом. Попап содержит три вкладки: «Регион», «Армия», «Строительство». Закрывается по клику вне, перетаскивается мышью, запоминает позицию в сессии.

**Что сделать:**

1. HTML-шаблон кастомного попапа в `index.html`:
   ```html
   <div id="region-popup" class="rpopup" hidden>
     <div class="rpopup__header">
       <img class="rpopup__nation-icon" src="" width="20" height="20" alt="">
       <span class="rpopup__region-name"></span>
       <button class="rpopup__close" aria-label="Закрыть">×</button>
     </div>

     <nav class="rpopup__tabs">
       <button class="rpopup__tab is-active" data-tab="region">Регион</button>
       <button class="rpopup__tab" data-tab="army">Армия</button>
       <button class="rpopup__tab" data-tab="build">Строительство</button>
     </nav>

     <div class="rpopup__body">
       <!-- Вкладка: Регион -->
       <div class="rpopup__panel" data-panel="region">
         <div class="rpopup__stats"></div>
       </div>
       <!-- Вкладка: Армия -->
       <div class="rpopup__panel" data-panel="army" hidden>
         <div class="rpopup__army-list"></div>
       </div>
       <!-- Вкладка: Строительство -->
       <div class="rpopup__panel" data-panel="build" hidden>
         <div class="rpopup__build-list"></div>
       </div>
     </div>
   </div>
   ```

2. CSS попапа:
   ```css
   .rpopup {
     position: fixed;
     width: 280px;
     background: rgba(15,10,5,0.95);
     border: 1px solid rgba(200,170,90,0.3);
     border-radius: 6px;
     z-index: 1000;
     box-shadow: 0 8px 32px rgba(0,0,0,0.6);
     font-size: 13px;
     color: #ddd;
   }
   .rpopup__header {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 8px 10px;
     border-bottom: 1px solid rgba(200,170,90,0.2);
     cursor: move;          /* drag handle */
   }
   .rpopup__region-name { font-weight: 600; flex: 1; }
   .rpopup__close {
     background: none; border: none; color: #aaa;
     cursor: pointer; font-size: 18px; line-height: 1;
   }
   .rpopup__tabs {
     display: flex;
     border-bottom: 1px solid rgba(200,170,90,0.15);
   }
   .rpopup__tab {
     flex: 1; padding: 6px 0;
     background: none; border: none;
     color: rgba(255,255,255,0.5); cursor: pointer;
     font-size: 12px; transition: color 0.15s;
   }
   .rpopup__tab.is-active {
     color: #f0e8c8;
     border-bottom: 2px solid rgba(200,170,90,0.7);
   }
   .rpopup__body { padding: 10px; }

   /* Прогресс-бар строительства */
   .build-item__bar {
     height: 4px;
     background: rgba(255,255,255,0.1);
     border-radius: 2px;
     margin-top: 4px;
   }
   .build-item__fill {
     height: 100%;
     background: rgba(200,170,90,0.7);
     border-radius: 2px;
     transition: width 0.3s ease;
   }
   ```

3. JS — открыть попап при клике на регион:
   ```js
   function openRegionPopup(regionId, screenX, screenY) {
     const popup = document.getElementById('region-popup');
     const data  = getRegionData(regionId);

     // Заполнить заголовок
     popup.querySelector('.rpopup__nation-icon').src =
       getNationIconPath(data.ownerNationId);
     popup.querySelector('.rpopup__region-name').textContent = data.name;

     // Заполнить вкладку «Регион»
     popup.querySelector('.rpopup__stats').innerHTML = `
       <div>Население: ${data.population.toLocaleString()}</div>
       <div>Доход: ${data.income} зол./ход</div>
       <div>Защита: ${data.defense}</div>
     `;

     // Заполнить вкладку «Строительство»
     const buildList = popup.querySelector('.rpopup__build-list');
     buildList.innerHTML = '';
     for (const project of data.buildQueue) {
       const pct = Math.round((project.progress / project.total) * 100);
       buildList.insertAdjacentHTML('beforeend', `
         <div class="build-item">
           <span>${project.name}</span>
           <span>${project.progress}/${project.total} ходов</span>
           <div class="build-item__bar">
             <div class="build-item__fill" style="width:${pct}%"></div>
           </div>
         </div>
       `);
     }

     // Позиционировать, не выходя за края экрана
     const w = 280, h = 200;
     const left = Math.min(screenX + 10, window.innerWidth  - w - 10);
     const top  = Math.min(screenY + 10, window.innerHeight - h - 10);
     popup.style.left = `${left}px`;
     popup.style.top  = `${top}px`;

     popup.hidden = false;
     activateTab(popup, 'region');
   }
   ```

4. Переключение вкладок:
   ```js
   function activateTab(popup, tabName) {
     popup.querySelectorAll('.rpopup__tab').forEach(t => {
       t.classList.toggle('is-active', t.dataset.tab === tabName);
     });
     popup.querySelectorAll('.rpopup__panel').forEach(p => {
       p.hidden = p.dataset.panel !== tabName;
     });
   }

   document.getElementById('region-popup').addEventListener('click', e => {
     if (e.target.matches('.rpopup__tab')) {
       activateTab(e.target.closest('.rpopup'), e.target.dataset.tab);
     }
     if (e.target.matches('.rpopup__close')) {
       e.target.closest('.rpopup').hidden = true;
     }
   });
   ```

5. Drag-to-move попапа:
   ```js
   function makeDraggable(el, handleSel) {
     let ox = 0, oy = 0, mx = 0, my = 0;
     el.querySelector(handleSel).addEventListener('mousedown', e => {
       ox = el.offsetLeft; oy = el.offsetTop;
       mx = e.clientX;     my = e.clientY;
       const move = ev => {
         el.style.left = (ox + ev.clientX - mx) + 'px';
         el.style.top  = (oy + ev.clientY - my) + 'px';
       };
       const up = () => {
         document.removeEventListener('mousemove', move);
         document.removeEventListener('mouseup',   up);
       };
       document.addEventListener('mousemove', move);
       document.addEventListener('mouseup',   up);
       e.preventDefault();
     });
   }
   makeDraggable(document.getElementById('region-popup'), '.rpopup__header');
   ```

**Какие файлы затрагиваются:**
- `index.html` — разметка `#region-popup`
- `ui/styles.css` — CSS попапа, вкладок, прогресс-баров
- `js/map.js` — `openRegionPopup`, заменить вызовы `L.popup`
- `js/ui.js` — `activateTab`, `makeDraggable`

**Тест Шага 62:**
- Клик по региону открывает кастомный попап с тремя вкладками.
- Вкладка «Строительство» показывает прогресс-бар для каждого проекта.
- Попап перетаскивается мышью.
- Попап не выходит за границы экрана при открытии у края карты.
- Закрытие по кнопке × работает.

---

## БЛОК AB — Механика персонажей и делегирования (Шаг 63)

---

### Шаг 63 — Система персонажей: придворные посты, атрибуты, делегирование задач

**Цель:** переработать взаимодействие с персонажами. Вместо простого списка — полноценный двор с должностями. У каждого персонажа есть атрибуты (Дипломатия, Военное дело, Управление, Интриги). Назначение на должность даёт пассивный бонус. Делегирование — явное действие с визуальным подтверждением.

**Что сделать:**

1. Структура данных персонажа (расширить существующий объект `char`):
   ```js
   // Пример объекта персонажа
   {
     id:         'char_001',
     name:       'Клеарх Афинский',
     nationId:   'athens',
     age:        42,
     traits:     ['brave', 'ambitious'],   // до 3 черт
     attrs: {
       diplomacy:  8,   // 1–20
       martial:    14,
       stewardship: 6,
       intrigue:   11,
     },
     postId:     'general',   // текущая должность или null
     tasks:      [],          // делегированные задачи
   }
   ```

2. Структура придворных должностей `COURT_POSTS` в `data/court.js`:
   ```js
   export const COURT_POSTS = {
     ruler: {
       label:   'Правитель',
       icon:    'crown',
       maxSlots: 1,
       bonus:   null,   // особый пост, не назначается
     },
     general: {
       label:   'Полководец',
       icon:    'sword',
       maxSlots: 2,
       bonus:   { type: 'martial_bonus', value: '+15% атака армий' },
       requires: { martial: 10 },
     },
     chancellor: {
       label:   'Канцлер',
       icon:    'scroll',
       maxSlots: 1,
       bonus:   { type: 'diplo_bonus', value: '+20% к дипломатии' },
       requires: { diplomacy: 8 },
     },
     treasurer: {
       label:   'Казначей',
       icon:    'coin',
       maxSlots: 1,
       bonus:   { type: 'income_pct', value: '+10% доход' },
       requires: { stewardship: 8 },
     },
     spymaster: {
       label:   'Шпионмейстер',
       icon:    'eye',
       maxSlots: 1,
       bonus:   { type: 'intrigue_bonus', value: '+25% успех интриг' },
       requires: { intrigue: 10 },
     },
     advisor: {
       label:   'Советник',
       icon:    'star',
       maxSlots: 3,
       bonus:   { type: 'research_pct', value: '+5% скорость исследований' },
       requires: {},
     },
   };
   ```

3. UI придворного экрана — `ui/court.js`. Рендерить сетку должностей с портретами:
   ```js
   export function renderCourt(nationId, chars, assignedPosts) {
     const grid = document.createElement('div');
     grid.className = 'court-grid';

     for (const [postId, post] of Object.entries(COURT_POSTS)) {
       if (postId === 'ruler') continue;

       for (let slot = 0; slot < post.maxSlots; slot++) {
         const assignedChar = assignedPosts[`${postId}_${slot}`] ?? null;
         const cell = document.createElement('div');
         cell.className = 'court-cell';
         cell.dataset.postId = postId;
         cell.dataset.slot   = slot;

         cell.appendChild(renderCourtSlot(post, assignedChar, nationId));

         const label = document.createElement('div');
         label.className = 'court-cell__label';
         label.textContent = post.label;
         cell.appendChild(label);

         if (post.bonus) {
           const bonus = document.createElement('div');
           bonus.className = 'court-cell__bonus';
           bonus.textContent = post.bonus.value;
           cell.appendChild(bonus);
         }

         grid.appendChild(cell);
       }
     }
     return grid;
   }
   ```
   CSS:
   ```css
   .court-grid {
     display: grid;
     grid-template-columns: repeat(3, 1fr);
     gap: 12px;
     padding: 12px;
   }
   .court-cell {
     display: flex;
     flex-direction: column;
     align-items: center;
     gap: 4px;
     padding: 8px;
     background: rgba(255,255,255,0.04);
     border-radius: 6px;
     border: 1px solid rgba(200,170,90,0.15);
     cursor: pointer;
     transition: background 0.15s;
   }
   .court-cell:hover { background: rgba(255,255,255,0.08); }
   .court-cell__label { font-size: 11px; opacity: 0.7; text-align: center; }
   .court-cell__bonus { font-size: 10px; color: rgba(200,170,90,0.8); text-align: center; }
   ```

4. Панель делегирования — открывается при клике на должность, показывает список доступных персонажей:
   ```js
   function openAssignPanel(postId, slot) {
     const panel = document.getElementById('assign-panel');
     const post  = COURT_POSTS[postId];

     panel.querySelector('.assign-panel__title').textContent =
       `Назначить ${post.label}`;

     const list = panel.querySelector('.assign-panel__list');
     list.innerHTML = '';

     // Показать только подходящих кандидатов
     const eligible = getAllChars().filter(char => {
       if (char.postId && char.postId !== `${postId}_${slot}`) return false;
       for (const [attr, min] of Object.entries(post.requires ?? {})) {
         if ((char.attrs[attr] ?? 0) < min) return false;
       }
       return true;
     });

     for (const char of eligible) {
       const row = document.createElement('div');
       row.className = 'assign-row';
       row.appendChild(renderPortrait(char, char.nationId, 40));

       row.insertAdjacentHTML('beforeend', `
         <div class="assign-row__info">
           <span class="assign-row__name">${char.name}</span>
           <span class="assign-row__attrs">
             Д:${char.attrs.diplomacy}
             В:${char.attrs.martial}
             У:${char.attrs.stewardship}
             И:${char.attrs.intrigue}
           </span>
         </div>
         <button class="assign-row__btn">Назначить</button>
       `);

       row.querySelector('.assign-row__btn').addEventListener('click', () => {
         assignToPost(char.id, postId, slot);
         panel.hidden = true;
       });

       list.appendChild(row);
     }

     panel.hidden = false;
   }
   ```

5. Функция делегирования задачи персонажу — с явным тостом-подтверждением (использует систему тостов из Шага 29):
   ```js
   function delegateTask(charId, taskType, targetId) {
     const char = getChar(charId);
     if (!char) return;

     char.tasks.push({ type: taskType, targetId, startTurn: gameState.turn });

     showToast(`${char.name} получил задание: ${TASK_LABELS[taskType]}`, 'success');
     refreshCourtUI();
   }
   ```

**Какие файлы затрагиваются:**
- `data/court.js` — новый файл `COURT_POSTS`
- `ui/court.js` — `renderCourt`, `openAssignPanel`
- `ui/portrait.js` — переиспользуется (Шаг 57)
- `js/chars.js` — расширить структуру `char`, добавить `assignToPost`, `delegateTask`
- `index.html` — `#assign-panel`, `#court-screen`
- `ui/styles.css` — `.court-grid`, `.court-cell`, `.assign-row`

**Тест Шага 63:**
- Открыть экран двора — видна сетка должностей 3×N.
- Клик на пустую должность — открывается список кандидатов с атрибутами.
- Персонаж с `martial < 10` не появляется в кандидатах на Полководца.
- После назначения — портрет появляется в слоте должности.
- Тост «Имя получил задание» появляется при делегировании.

---

## БЛОК AC — Движущиеся маркеры армий на карте (Шаг 64)

---

### Шаг 64 — Анимированные маркеры армий: движение по карте, иконка культурной группы

**Цель:** игрок должен видеть армии как отдельные объекты на карте, которые анимированно движутся из региона в регион при отдаче приказа. Маркер содержит иконку культурной группы нации, число юнитов и полосу здоровья. Движение — CSS-анимация по промежуточным точкам маршрута.

**Что сделать:**

1. Структура данных армии:
   ```js
   {
     id:       'army_001',
     nationId: 'athens',
     regionId: 'attica',           // текущий регион
     targetId: 'boeotia',          // цель движения или null
     units:    1200,
     strength: 85,                 // % здоровья (0-100)
     route:    ['attica','megara','boeotia'],  // промежуточные регионы
     moveProgress: 0,              // 0-1 внутри текущего сегмента
   }
   ```

2. Создать маркер армии как Leaflet `L.marker` с кастомным `divIcon`:
   ```js
   // js/army_markers.js
   import { getNationIconPath } from '../data/culture_groups.js';

   const armyMarkers = {};   // armyId → L.marker

   export function createArmyMarker(army) {
     const iconPath = getNationIconPath(army.nationId);
     const strengthColor = army.strength > 60 ? '#7cba5a'
                         : army.strength > 30 ? '#e0b030'
                         :                      '#cc4444';

     const html = `
       <div class="army-marker" data-army-id="${army.id}">
         <img src="${iconPath}" class="army-marker__icon" width="16" height="16">
         <span class="army-marker__units">${formatUnits(army.units)}</span>
         <div class="army-marker__hp">
           <div class="army-marker__hp-fill"
                style="width:${army.strength}%;background:${strengthColor}"></div>
         </div>
       </div>
     `;

     const divIcon = L.divIcon({
       className: '',
       html,
       iconSize:   [48, 36],
       iconAnchor: [24, 36],
     });

     const [lat, lng] = getRegionCenter(army.regionId);
     const marker = L.marker([lat, lng], { icon: divIcon, zIndexOffset: 100 });
     marker.addTo(leafletMap);
     armyMarkers[army.id] = marker;
     return marker;
   }

   function formatUnits(n) {
     return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);
   }
   ```
   CSS:
   ```css
   .army-marker {
     display: flex;
     flex-direction: column;
     align-items: center;
     gap: 2px;
     background: rgba(10,8,4,0.85);
     border: 1px solid rgba(200,170,90,0.5);
     border-radius: 4px;
     padding: 3px 5px;
     font-size: 10px;
     color: #f0e8c8;
     white-space: nowrap;
     pointer-events: auto;
     cursor: pointer;
   }
   .army-marker__icon { filter: invert(1) sepia(1) saturate(1.5); }
   .army-marker__hp {
     width: 36px; height: 3px;
     background: rgba(255,255,255,0.15);
     border-radius: 2px;
     overflow: hidden;
   }
   .army-marker__hp-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
   ```

3. Анимация движения армии между регионами (покадровая через `requestAnimationFrame`):
   ```js
   export function animateArmyMove(armyId, fromLatLng, toLatLng, durationMs = 1200) {
     const marker = armyMarkers[armyId];
     if (!marker) return;

     const start = performance.now();
     const [fLat, fLng] = [fromLatLng.lat, fromLatLng.lng];
     const [tLat, tLng] = [toLatLng.lat,  toLatLng.lng];

     function frame(now) {
       const t = Math.min((now - start) / durationMs, 1);
       const ease = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;   // easeInOut

       marker.setLatLng([
         fLat + (tLat - fLat) * ease,
         fLng + (tLng - fLng) * ease,
       ]);

       if (t < 1) requestAnimationFrame(frame);
     }
     requestAnimationFrame(frame);
   }
   ```

4. Вызов при обработке хода — если армия движется, анимировать переход:
   ```js
   function processMoveOrders() {
     for (const army of gameState.armies) {
       if (!army.targetId) continue;

       const from = getRegionCenter(army.regionId);
       const to   = getRegionCenter(army.targetId);

       animateArmyMove(army.id,
         { lat: from[0], lng: from[1] },
         { lat: to[0],   lng: to[1] },
         1000
       );

       // После анимации обновить regionId
       setTimeout(() => {
         army.regionId = army.targetId;
         army.targetId = null;
         updateArmyMarker(army);
       }, 1050);
     }
   }
   ```

5. Обновление маркера при изменении силы армии:
   ```js
   export function updateArmyMarker(army) {
     const marker = armyMarkers[army.id];
     if (!marker) return;

     const iconPath = getNationIconPath(army.nationId);
     const strengthColor = army.strength > 60 ? '#7cba5a'
                         : army.strength > 30 ? '#e0b030' : '#cc4444';
     marker.getElement()?.querySelector('.army-marker__hp-fill')
       ?.style.setProperty('width', `${army.strength}%`);
     marker.getElement()?.querySelector('.army-marker__hp-fill')
       ?.style.setProperty('background', strengthColor);
     marker.getElement()?.querySelector('.army-marker__units')
       ?.textContent = formatUnits(army.units);
   }
   ```

**Какие файлы затрагиваются:**
- `js/army_markers.js` — новый файл, `createArmyMarker`, `animateArmyMove`, `updateArmyMarker`
- `js/game.js` — `processMoveOrders`, вызов анимаций после хода
- `data/culture_groups.js` — `getNationIconPath` (уже в Шаге 60)
- `ui/styles.css` — `.army-marker` и дочерние классы

**Тест Шага 64:**
- После отдачи приказа «двигаться» маркер армии плавно перемещается в новый регион за ~1 с.
- Иконка армии соответствует культурной группе нации (сова для греков, орёл для римлян).
- Полоса здоровья меняет цвет: зелёный > жёлтый > красный.
- Маркеры разных наций отображаются одновременно без перекрытий при зуме.
- После перезагрузки маркеры восстанавливаются на правильных позициях.

---

## БЛОК AD — Иконки строительства на карте (Шаг 65)

---

### Шаг 65 — Маркеры строительства: визуальный индикатор активных проектов на регионе

**Цель:** показывать прямо на карте, что в регионе идёт строительство. Маленькая иконка с прогресс-баром появляется в центре региона пока проект активен. Это устраняет проблему «действия не видно на карте».

**Что сделать:**

1. Создать SVG-иконку строительства `assets/icons/construction.svg`:
   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round">
     <!-- Молот -->
     <rect x="2" y="14" width="8" height="4" rx="1"/>
     <line x1="6" y1="14" x2="13" y2="7"/>
     <rect x="11" y="4" width="6" height="4" rx="1"
           transform="rotate(45 14 6)"/>
     <!-- Уголки строит. площадки -->
     <polyline points="18,18 22,18 22,22"/>
     <polyline points="18,2  22,2  22,6"/>
   </svg>
   ```

2. Функция `addConstructionMarker(regionId, projectName, progress, total)`:
   ```js
   // js/construction_markers.js
   const constructionMarkers = {};   // regionId → L.marker

   export function addConstructionMarker(regionId, projectName, progress, total) {
     removeConstructionMarker(regionId);   // убрать старый если был

     const pct = Math.round((progress / total) * 100);
     const html = `
       <div class="constr-marker" title="${projectName}">
         <img src="assets/icons/construction.svg"
              class="constr-marker__icon" width="14" height="14">
         <div class="constr-marker__bar">
           <div class="constr-marker__fill" style="width:${pct}%"></div>
         </div>
       </div>
     `;

     const divIcon = L.divIcon({
       className: '',
       html,
       iconSize:   [36, 24],
       iconAnchor: [18, 12],
     });

     const [lat, lng] = getRegionCenter(regionId);
     // Сместить чуть вниз-вправо чтобы не перекрывать название региона
     const marker = L.marker([lat - 0.3, lng + 0.5], { icon: divIcon, zIndexOffset: 50 });
     marker.addTo(leafletMap);
     constructionMarkers[regionId] = marker;
   }

   export function removeConstructionMarker(regionId) {
     constructionMarkers[regionId]?.remove();
     delete constructionMarkers[regionId];
   }

   export function updateConstructionMarker(regionId, progress, total) {
     const marker = constructionMarkers[regionId];
     if (!marker) return;
     const pct = Math.round((progress / total) * 100);
     marker.getElement()?.querySelector('.constr-marker__fill')
           ?.style.setProperty('width', `${pct}%`);
   }
   ```
   CSS:
   ```css
   .constr-marker {
     display: flex;
     flex-direction: column;
     align-items: center;
     gap: 2px;
     background: rgba(10,8,4,0.8);
     border: 1px solid rgba(200,160,60,0.5);
     border-radius: 3px;
     padding: 2px 4px;
   }
   .constr-marker__icon {
     filter: invert(1) sepia(1) saturate(2) hue-rotate(5deg);
     opacity: 0.9;
   }
   .constr-marker__bar {
     width: 28px; height: 3px;
     background: rgba(255,255,255,0.12);
     border-radius: 2px;
     overflow: hidden;
   }
   .constr-marker__fill {
     height: 100%;
     background: rgba(200,160,60,0.8);
     border-radius: 2px;
     transition: width 0.4s ease;
   }
   ```

3. Вызывать маркеры строительства при загрузке игры:
   ```js
   function refreshConstructionMarkers() {
     // Сначала убрать все старые
     for (const regionId of Object.keys(constructionMarkers)) {
       removeConstructionMarker(regionId);
     }
     // Добавить для регионов с активным строительством
     for (const region of gameState.regions) {
       if (region.buildQueue?.length > 0) {
         const project = region.buildQueue[0];
         addConstructionMarker(region.id, project.name,
                               project.progress, project.total);
       }
     }
   }
   ```

4. Обновлять прогресс после каждого хода:
   ```js
   function onTurnEnd() {
     // ... остальная логика хода ...
     for (const region of gameState.regions) {
       if (region.buildQueue?.length > 0) {
         const project = region.buildQueue[0];
         project.progress++;
         if (project.progress >= project.total) {
           region.buildQueue.shift();    // проект завершён
           removeConstructionMarker(region.id);
           showToast(`Построено: ${project.name} в ${region.name}`, 'success');
           // Добавить следующий проект из очереди если есть
           if (region.buildQueue.length > 0) {
             const next = region.buildQueue[0];
             addConstructionMarker(region.id, next.name, next.progress, next.total);
           }
         } else {
           updateConstructionMarker(region.id, project.progress, project.total);
         }
       }
     }
   }
   ```

**Какие файлы затрагиваются:**
- `assets/icons/construction.svg` — новый SVG, коммитится в git
- `js/construction_markers.js` — новый файл
- `js/game.js` — `onTurnEnd` вызывает `updateConstructionMarker`
- `ui/styles.css` — `.constr-marker` и дочерние

**Тест Шага 65:**
- В регионе с активным строительством виден маленький маркер с молотом.
- Прогресс-бар заполняется с каждым ходом.
- После завершения строительства маркер исчезает, тост появляется.
- При перезагрузке маркеры строительства восстанавливаются.
- Маркер не мешает кликать на регион (не перехватывает события).

---

## БЛОК AE — Торговые пути на карте (Шаг 66)

---

### Шаг 66 — Визуализация торговых путей: анимированные линии между регионами

**Цель:** отображать активные торговые связи как тонкие пунктирные линии между регионами. Линии анимированы (бегущий пунктир показывает направление торговли). При клике на линию открывается информация о торговом договоре.

**Что сделать:**

1. Нарисовать торговый путь как `L.polyline` с кастомным SVG-паттерном:
   ```js
   // js/trade_routes.js
   const tradeLines = {};   // routeId → { line, decorator }

   export function addTradeRoute(routeId, fromRegionId, toRegionId, goodsLabel, income) {
     const from = getRegionCenter(fromRegionId);
     const to   = getRegionCenter(toRegionId);

     const line = L.polyline([from, to], {
       color:     'rgba(200,170,90,0.5)',
       weight:    2,
       dashArray: '6 4',
       dashOffset: '0',
       className: 'trade-route-line',
     });
     line.addTo(leafletMap);

     // Подсказка при наведении
     line.bindTooltip(`${goodsLabel} · +${income} зол./ход`, {
       sticky: true,
       className: 'trade-tooltip',
     });

     tradeLines[routeId] = line;
   }

   export function removeTradeRoute(routeId) {
     tradeLines[routeId]?.remove();
     delete tradeLines[routeId];
   }
   ```

2. CSS-анимация бегущего пунктира:
   ```css
   .trade-route-line {
     animation: tradeFlow 1.8s linear infinite;
   }
   @keyframes tradeFlow {
     to { stroke-dashoffset: -20; }
   }

   .trade-tooltip {
     background: rgba(10,8,4,0.9);
     border: 1px solid rgba(200,170,90,0.4);
     color: #f0e8c8;
     font-size: 12px;
     padding: 4px 8px;
     border-radius: 4px;
   }
   ```
   Leaflet использует SVG для полилиний — `stroke-dashoffset` анимируется напрямую через CSS класс.

3. При загрузке игры отрисовать все активные торговые пути:
   ```js
   function renderAllTradeRoutes() {
     for (const routeId of Object.keys(tradeLines)) {
       removeTradeRoute(routeId);
     }
     for (const route of gameState.tradeRoutes ?? []) {
       if (route.active) {
         addTradeRoute(route.id, route.fromRegion, route.toRegion,
                       route.goods, route.income);
       }
     }
   }
   ```

4. Переключатель слоя в интерфейсе — кнопка «Торговля» в панели режимов карты (подключается к системе из Шага 34):
   ```js
   registerMapMode('trade', {
     label: 'Торговля',
     icon:  'assets/icons/coin.svg',
     onEnable:  renderAllTradeRoutes,
     onDisable: () => {
       for (const routeId of Object.keys(tradeLines)) removeTradeRoute(routeId);
     },
   });
   ```

**Какие файлы затрагиваются:**
- `js/trade_routes.js` — новый файл
- `js/game.js` — вызов `renderAllTradeRoutes` при старте и после хода
- `ui/styles.css` — `.trade-route-line`, анимация `tradeFlow`, `.trade-tooltip`
- `js/map_modes.js` — регистрация режима `'trade'`

**Тест Шага 66:**
- В режиме «Торговля» между торгующими регионами видны жёлто-золотые пунктиры.
- Пунктир анимирован — бежит в сторону получателя.
- Наведение мышью на линию показывает тултип с товаром и доходом.
- Выключение режима «Торговля» убирает все линии с карты.
- При отмене торгового договора линия исчезает после следующего хода.

---

## БЛОК AF — Дипломатический граф (Шаг 67)

---

### Шаг 67 — Дипломатический граф: визуализация отношений между нациями

**Цель:** вкладка «Дипломатия» вместо плоского списка показывает интерактивный граф-паутину: нации как узлы, отношения как дуги с цветом (зелёный=союз, красный=война, серый=нейтрал). Canvas 2D — без внешних библиотек.

**Что сделать:**

1. HTML-разметка в дипломатической вкладке:
   ```html
   <div id="diplo-tab" class="tab-panel" hidden>
     <canvas id="diplo-canvas" width="340" height="320"></canvas>
     <div id="diplo-detail" class="diplo-detail" hidden></div>
   </div>
   ```

2. Функция `renderDiploGraph(playerNationId, relations)` — рисует граф на Canvas:
   ```js
   // ui/diplo_graph.js
   export function renderDiploGraph(playerNationId, relations) {
     const canvas = document.getElementById('diplo-canvas');
     const ctx    = canvas.getContext('2d');
     const W = canvas.width, H = canvas.height;
     const cx = W / 2, cy = H / 2;

     ctx.clearRect(0, 0, W, H);

     // Собрать уникальные нации из relations
     const nations = new Set([playerNationId]);
     for (const r of relations) {
       nations.add(r.fromId);
       nations.add(r.toId);
     }
     const nationList = [...nations];
     const N = nationList.length;

     // Разместить нации по кругу; игрок — в центре
     const radius = Math.min(W, H) * 0.38;
     const positions = {};
     positions[playerNationId] = { x: cx, y: cy };

     const others = nationList.filter(id => id !== playerNationId);
     others.forEach((id, i) => {
       const angle = (2 * Math.PI * i) / others.length - Math.PI / 2;
       positions[id] = {
         x: cx + Math.cos(angle) * radius,
         y: cy + Math.sin(angle) * radius,
       };
     });

     // Нарисовать дуги (отношения)
     for (const rel of relations) {
       const a = positions[rel.fromId];
       const b = positions[rel.toId];
       if (!a || !b) continue;

       const color = rel.type === 'alliance' ? 'rgba(80,200,120,0.7)'
                   : rel.type === 'war'      ? 'rgba(220,60,60,0.7)'
                   : rel.type === 'trade'    ? 'rgba(200,170,90,0.5)'
                   :                           'rgba(150,150,150,0.3)';

       ctx.beginPath();
       ctx.moveTo(a.x, a.y);
       ctx.lineTo(b.x, b.y);
       ctx.strokeStyle = color;
       ctx.lineWidth   = rel.type === 'war' ? 2.5 : 1.5;
       ctx.stroke();
     }

     // Нарисовать узлы (нации)
     for (const [id, pos] of Object.entries(positions)) {
       const isPlayer = id === playerNationId;
       const r = isPlayer ? 14 : 9;

       ctx.beginPath();
       ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
       ctx.fillStyle   = isPlayer ? 'rgba(200,170,90,0.9)' : 'rgba(60,50,30,0.9)';
       ctx.strokeStyle = 'rgba(200,170,90,0.6)';
       ctx.lineWidth   = 1.5;
       ctx.fill();
       ctx.stroke();

       // Иконка культурной группы внутри узла
       const iconPath = getNationIconPath(id);
       const img = new Image(r * 1.4, r * 1.4);
       img.src = iconPath;
       img.onload = () => {
         ctx.drawImage(img, pos.x - r*0.7, pos.y - r*0.7, r*1.4, r*1.4);
       };

       // Подпись под узлом
       ctx.fillStyle   = 'rgba(220,210,180,0.85)';
       ctx.font        = `${isPlayer ? 11 : 9}px sans-serif`;
       ctx.textAlign   = 'center';
       ctx.fillText(getNationShortName(id), pos.x, pos.y + r + 10);
     }
   }
   ```

3. Клик на узел — показать детали отношений с этой нацией:
   ```js
   canvas.addEventListener('click', e => {
     const rect = canvas.getBoundingClientRect();
     const mx = e.clientX - rect.left;
     const my = e.clientY - rect.top;

     for (const [id, pos] of Object.entries(positions)) {
       const dist = Math.hypot(mx - pos.x, my - pos.y);
       if (dist < 14) {
         showDiploDetail(id);
         return;
       }
     }
   });

   function showDiploDetail(nationId) {
     const panel = document.getElementById('diplo-detail');
     const rel   = getRelationWith(nationId);
     panel.innerHTML = `
       <div class="diplo-detail__name">${getNationName(nationId)}</div>
       <div>Отношение: <b>${rel.score > 0 ? '+' : ''}${rel.score}</b></div>
       <div>Статус: ${rel.type}</div>
       <button data-action="declare-war"   data-id="${nationId}">Объявить войну</button>
       <button data-action="offer-alliance" data-id="${nationId}">Предложить союз</button>
       <button data-action="offer-trade"    data-id="${nationId}">Торговый договор</button>
     `;
     panel.hidden = false;
   }
   ```

4. Перерисовывать граф при открытии вкладки и после каждого хода:
   ```js
   document.querySelector('[data-tab="diplomacy"]').addEventListener('click', () => {
     renderDiploGraph(gameState.playerNation, gameState.relations);
   });
   eventBus.on('turnEnd', () => {
     if (activeDiploTab) renderDiploGraph(gameState.playerNation, gameState.relations);
   });
   ```

**Какие файлы затрагиваются:**
- `ui/diplo_graph.js` — новый файл, `renderDiploGraph`, `showDiploDetail`
- `index.html` — `#diplo-canvas`, `#diplo-detail`
- `ui/styles.css` — `.diplo-detail` и его дочерние классы

**Тест Шага 67:**
- Вкладка «Дипломатия» показывает граф с нациями по кругу, игрок в центре.
- Союзники — зелёная дуга, враги — красная, нейтралы — серая.
- Клик на узел нации показывает панель с кнопками дипломатических действий.
- После объявления войны дуга перекрашивается в красный без перезагрузки страницы.

---

## БЛОК AG — Лента событий (Шаг 68)

---

### Шаг 68 — Лента событий: хронологический журнал с иконками и фильтрами

**Цель:** заменить простой текстовый лог полноценной лентой событий. Каждое событие имеет тип (военное, дипломатическое, экономическое, персональное), иконку, временную метку (ход) и описание. Лента фильтруется по типу и прокручивается. Важные события подсвечены.

**Что сделать:**

1. HTML-структура ленты в боковой панели:
   ```html
   <div id="event-feed" class="event-feed">
     <div class="event-feed__filters">
       <button class="ef-filter is-active" data-type="all">Все</button>
       <button class="ef-filter" data-type="war">⚔</button>
       <button class="ef-filter" data-type="diplo">🤝</button>
       <button class="ef-filter" data-type="eco">💰</button>
       <button class="ef-filter" data-type="char">👤</button>
     </div>
     <div class="event-feed__list"></div>
   </div>
   ```

2. Функция `addEvent(type, text, details)` — добавить событие в ленту:
   ```js
   // js/event_feed.js
   const ICONS = {
     war:   'assets/icons/sword.svg',
     diplo: 'assets/icons/scroll.svg',
     eco:   'assets/icons/coin.svg',
     char:  'assets/icons/star.svg',
     build: 'assets/icons/construction.svg',
     default: 'assets/icons/generic_sword.svg',
   };

   const events = [];

   export function addEvent({ type = 'default', text, details = null,
                               important = false }) {
     const ev = {
       id:        crypto.randomUUID(),
       turn:      gameState.turn,
       type,
       text,
       details,
       important,
       ts:        Date.now(),
     };
     events.unshift(ev);   // новые события — сверху

     renderEventItem(ev);

     // Бейдж на вкладке лога (+1)
     incrementLogBadge();
   }

   function renderEventItem(ev) {
     const list = document.querySelector('.event-feed__list');
     const icon = ICONS[ev.type] ?? ICONS.default;

     const item = document.createElement('div');
     item.className = `ef-item ef-item--${ev.type}${ev.important ? ' ef-item--important' : ''}`;
     item.dataset.type = ev.type;
     item.dataset.evId = ev.id;

     item.innerHTML = `
       <img src="${icon}" class="ef-item__icon" width="14" height="14">
       <div class="ef-item__body">
         <span class="ef-item__turn">Ход ${ev.turn}</span>
         <span class="ef-item__text">${ev.text}</span>
       </div>
     `;

     if (ev.details) {
       item.addEventListener('click', () => showEventDetails(ev));
     }

     list.prepend(item);

     // Ограничить список 200 последними событиями
     while (list.children.length > 200) list.lastChild?.remove();
   }
   ```

3. CSS ленты событий:
   ```css
   .event-feed {
     display: flex;
     flex-direction: column;
     height: 100%;
   }
   .event-feed__filters {
     display: flex;
     gap: 4px;
     padding: 6px 8px;
     border-bottom: 1px solid rgba(200,170,90,0.15);
     flex-shrink: 0;
   }
   .ef-filter {
     padding: 2px 8px;
     border-radius: 12px;
     border: 1px solid rgba(200,170,90,0.25);
     background: none;
     color: rgba(255,255,255,0.55);
     font-size: 12px;
     cursor: pointer;
     transition: all 0.15s;
   }
   .ef-filter.is-active {
     background: rgba(200,170,90,0.15);
     color: #f0e8c8;
     border-color: rgba(200,170,90,0.5);
   }
   .event-feed__list {
     overflow-y: auto;
     flex: 1;
     padding: 4px 0;
   }
   .ef-item {
     display: flex;
     gap: 8px;
     align-items: flex-start;
     padding: 5px 10px;
     border-left: 3px solid transparent;
     transition: background 0.1s;
   }
   .ef-item:hover { background: rgba(255,255,255,0.04); }
   .ef-item--important { border-left-color: rgba(200,170,90,0.7); }
   .ef-item--war       { border-left-color: rgba(220,60,60,0.5); }
   .ef-item__icon { opacity: 0.7; filter: invert(1); flex-shrink: 0; margin-top: 2px; }
   .ef-item__turn { font-size: 10px; opacity: 0.45; display: block; }
   .ef-item__text { font-size: 12px; line-height: 1.4; }
   ```

4. Фильтрация событий по типу:
   ```js
   document.querySelector('.event-feed__filters').addEventListener('click', e => {
     if (!e.target.matches('.ef-filter')) return;

     document.querySelectorAll('.ef-filter').forEach(b => b.classList.remove('is-active'));
     e.target.classList.add('is-active');

     const type = e.target.dataset.type;
     document.querySelectorAll('.ef-item').forEach(item => {
       item.hidden = type !== 'all' && item.dataset.type !== type;
     });
   });
   ```

**Какие файлы затрагиваются:**
- `js/event_feed.js` — новый файл, `addEvent`, `renderEventItem`
- `index.html` — `#event-feed`
- `ui/styles.css` — `.event-feed`, `.ef-item`, `.ef-filter`
- `js/game.js` — вызовы `addEvent` при объявлении войны, заключении договоров, смерти персонажей, завершении строительства

**Тест Шага 68:**
- При объявлении войны в ленте появляется событие с иконкой меча.
- Фильтр «⚔» показывает только военные события.
- Важные события (потеря столицы) выделены золотой боковой полосой.
- Лента не накапливает больше 200 элементов (старые удаляются).
- При завершении строительства добавляется событие типа `build`.

---

## БЛОК AH — Сводка хода (Шаг 69)

---

### Шаг 69 — Карточка итогов хода: что произошло, что изменилось

**Цель:** в конце каждого хода показывать компактную карточку «Итог хода» — не просто список событий, а структурированный отчёт: что построено, кто умер, какие битвы произошли, как изменились ресурсы. Карточка закрывается кнопкой «Следующий ход».

**Что сделать:**

1. HTML-разметка карточки сводки в `index.html`:
   ```html
   <div id="turn-summary" class="turn-summary" hidden>
     <div class="turn-summary__header">
       <span class="turn-summary__turn">Ход <b id="ts-turn-num"></b></span>
       <h2 class="turn-summary__title">Итог хода</h2>
     </div>

     <div class="turn-summary__sections">
       <section class="ts-section" id="ts-military" hidden>
         <h3 class="ts-section__title">⚔ Военные события</h3>
         <ul class="ts-section__list" id="ts-military-list"></ul>
       </section>

       <section class="ts-section" id="ts-economy" hidden>
         <h3 class="ts-section__title">💰 Экономика</h3>
         <ul class="ts-section__list" id="ts-economy-list"></ul>
       </section>

       <section class="ts-section" id="ts-build" hidden>
         <h3 class="ts-section__title">🔨 Строительство</h3>
         <ul class="ts-section__list" id="ts-build-list"></ul>
       </section>

       <section class="ts-section" id="ts-chars" hidden>
         <h3 class="ts-section__title">👤 Персонажи</h3>
         <ul class="ts-section__list" id="ts-chars-list"></ul>
       </section>
     </div>

     <div class="turn-summary__footer">
       <div class="ts-resources">
         <span id="ts-gold-delta"></span>
         <span id="ts-manpower-delta"></span>
       </div>
       <button id="ts-next-btn" class="turn-summary__btn">Следующий ход →</button>
     </div>
   </div>
   ```

2. CSS карточки:
   ```css
   .turn-summary {
     position: fixed;
     right: 24px;
     bottom: 24px;
     width: 320px;
     max-height: 70vh;
     overflow-y: auto;
     background: rgba(12,8,4,0.96);
     border: 1px solid rgba(200,170,90,0.35);
     border-radius: 8px;
     z-index: 800;
     box-shadow: 0 8px 32px rgba(0,0,0,0.6);
     animation: slideUp 0.3s ease;
   }
   @keyframes slideUp {
     from { transform: translateY(40px); opacity: 0; }
     to   { transform: translateY(0);    opacity: 1; }
   }
   .turn-summary__header {
     padding: 12px 16px 8px;
     border-bottom: 1px solid rgba(200,170,90,0.15);
   }
   .turn-summary__turn { font-size: 11px; opacity: 0.5; display: block; }
   .turn-summary__title { margin: 2px 0 0; font-size: 16px; color: #f0e8c8; }

   .turn-summary__sections { padding: 8px 0; }
   .ts-section { padding: 6px 16px; }
   .ts-section__title {
     font-size: 12px; font-weight: 600; margin: 0 0 4px;
     color: rgba(200,170,90,0.8);
   }
   .ts-section__list {
     margin: 0; padding: 0; list-style: none;
     font-size: 12px; color: #ccc;
   }
   .ts-section__list li { padding: 2px 0; }

   .turn-summary__footer {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 10px 16px;
     border-top: 1px solid rgba(200,170,90,0.15);
   }
   .ts-resources { font-size: 12px; color: rgba(200,170,90,0.8); }
   .turn-summary__btn {
     padding: 8px 20px;
     background: rgba(200,170,90,0.12);
     border: 1px solid rgba(200,170,90,0.5);
     color: #f0e8c8;
     border-radius: 4px;
     cursor: pointer;
     font-size: 13px;
     transition: background 0.15s;
   }
   .turn-summary__btn:hover { background: rgba(200,170,90,0.25); }
   ```

3. JS — собрать сводку и показать карточку:
   ```js
   // js/turn_summary.js
   export function showTurnSummary(turnEvents, resourceDelta) {
     const card = document.getElementById('turn-summary');

     document.getElementById('ts-turn-num').textContent = gameState.turn;

     // Заполнить секции по типам событий
     const sections = {
       military: { id: 'ts-military', listId: 'ts-military-list', events: [] },
       economy:  { id: 'ts-economy',  listId: 'ts-economy-list',  events: [] },
       build:    { id: 'ts-build',    listId: 'ts-build-list',    events: [] },
       char:     { id: 'ts-chars',    listId: 'ts-chars-list',    events: [] },
     };

     const typeMap = { war: 'military', eco: 'economy', build: 'build', char: 'char' };

     for (const ev of turnEvents) {
       const section = sections[typeMap[ev.type] ?? 'economy'];
       if (section) section.events.push(ev.text);
     }

     for (const [key, sec] of Object.entries(sections)) {
       const sectionEl = document.getElementById(sec.id);
       const listEl    = document.getElementById(sec.listId);
       if (sec.events.length === 0) {
         sectionEl.hidden = true;
       } else {
         sectionEl.hidden = false;
         listEl.innerHTML = sec.events
           .map(t => `<li>${t}</li>`)
           .join('');
       }
     }

     // Дельта ресурсов
     const goldSign = resourceDelta.gold >= 0 ? '+' : '';
     document.getElementById('ts-gold-delta').textContent =
       `Золото: ${goldSign}${resourceDelta.gold}`;

     card.hidden = false;

     document.getElementById('ts-next-btn').onclick = () => {
       card.hidden = true;
       advanceTurn();   // реальное продвижение хода
     };
   }
   ```

4. Вызов `showTurnSummary` вместо прямого `advanceTurn`:
   ```js
   // Вместо:
   endTurnButton.addEventListener('click', advanceTurn);
   // Стало:
   endTurnButton.addEventListener('click', () => {
     const events = collectTurnEvents();   // все события этого хода
     const delta  = computeResourceDelta();
     showTurnSummary(events, delta);
     // advanceTurn() вызывается внутри showTurnSummary по кнопке
   });
   ```

**Какие файлы затрагиваются:**
- `js/turn_summary.js` — новый файл
- `index.html` — `#turn-summary`
- `ui/styles.css` — `.turn-summary` и дочерние классы
- `js/game.js` — заменить прямой вызов `advanceTurn` на `showTurnSummary`

**Тест Шага 69:**
- Нажатие «Конец хода» показывает карточку снизу-справа.
- Секции отображаются только если в ходу были соответствующие события.
- Дельта золота показана со знаком `+` или `-`.
- Кнопка «Следующий ход →» закрывает карточку и продвигает ход.
- Карточка появляется с плавной анимацией вверх.

---

## БЛОК AI — Сравнение регионов (Шаг 70)

---

### Шаг 70 — Режим сравнения регионов: выбрать два и увидеть разницу

**Цель:** игрок может выбрать два региона и сравнить их по ключевым параметрам (население, доход, армия, защита, строительство). Режим активируется кнопкой в панели режимов карты. Итог — компактная таблица рядом с картой.

**Что сделать:**

1. Кнопка сравнения в панели режимов — добавить в `js/map_modes.js`:
   ```js
   registerMapMode('compare', {
     label: 'Сравнить',
     icon:  'assets/icons/generic_sword.svg',   // временно, заменить на весы
     onEnable:  startCompareMode,
     onDisable: stopCompareMode,
   });
   ```

2. Логика выбора двух регионов:
   ```js
   // js/compare_mode.js
   let compareSelections = [];

   export function startCompareMode() {
     compareSelections = [];
     showToast('Выберите первый регион для сравнения', 'info');

     // Подсветить все регионы как выбираемые
     for (const layer of Object.values(regionLayers)) {
       layer.setStyle({ weight: 2, opacity: 0.8 });
       layer.once('click', onRegionClickForCompare);
     }
   }

   function onRegionClickForCompare(e) {
     const regionId = e.target.options.regionId ?? e.target._regionId;
     compareSelections.push(regionId);

     // Подсветить выбранный
     e.target.setStyle({ weight: 3, color: 'rgba(200,170,90,0.9)' });

     if (compareSelections.length === 1) {
       showToast('Теперь выберите второй регион', 'info');
       // Добавить обработчик для остальных
       for (const [rid, layer] of Object.entries(regionLayers)) {
         if (rid !== regionId) layer.once('click', onRegionClickForCompare);
       }
     } else if (compareSelections.length === 2) {
       renderComparePanel(compareSelections[0], compareSelections[1]);
     }
   }

   export function stopCompareMode() {
     compareSelections = [];
     document.getElementById('compare-panel')?.remove();
     // Снять подсветку
     refreshRegionStyles();
   }
   ```

3. Панель сравнения:
   ```js
   function renderComparePanel(regionIdA, regionIdB) {
     const a = getRegionData(regionIdA);
     const b = getRegionData(regionIdB);

     // Удалить старую панель
     document.getElementById('compare-panel')?.remove();

     const panel = document.createElement('div');
     panel.id = 'compare-panel';
     panel.className = 'compare-panel';

     const rows = [
       ['Население',  a.population,  b.population,  v => v.toLocaleString()],
       ['Доход',      a.income,      b.income,      v => `${v} зол.`],
       ['Армия',      a.garrison,    b.garrison,    v => `${v} юн.`],
       ['Защита',     a.defense,     b.defense,     v => String(v)],
       ['Здания',     a.buildings.length, b.buildings.length, v => String(v)],
     ];

     const rowsHtml = rows.map(([label, va, vb, fmt]) => {
       const better = va > vb ? 'a' : vb > va ? 'b' : '';
       return `
         <tr>
           <td class="cp-cell ${better === 'a' ? 'cp-better' : ''}">${fmt(va)}</td>
           <td class="cp-label">${label}</td>
           <td class="cp-cell ${better === 'b' ? 'cp-better' : ''}">${fmt(vb)}</td>
         </tr>
       `;
     }).join('');

     panel.innerHTML = `
       <div class="cp-header">
         <span>${a.name}</span>
         <span>vs</span>
         <span>${b.name}</span>
       </div>
       <table class="cp-table">${rowsHtml}</table>
       <button class="cp-close">×</button>
     `;

     panel.querySelector('.cp-close').addEventListener('click', () => {
       deactivateMapMode('compare');
     });

     document.body.appendChild(panel);
   }
   ```

4. CSS панели сравнения:
   ```css
   .compare-panel {
     position: fixed;
     top: 50%;
     left: 50%;
     transform: translate(-50%, -50%);
     background: rgba(12,8,4,0.97);
     border: 1px solid rgba(200,170,90,0.35);
     border-radius: 8px;
     z-index: 900;
     padding: 0 0 12px;
     min-width: 280px;
     box-shadow: 0 8px 40px rgba(0,0,0,0.7);
   }
   .cp-header {
     display: flex;
     justify-content: space-between;
     padding: 10px 14px;
     font-weight: 600;
     font-size: 13px;
     color: #f0e8c8;
     border-bottom: 1px solid rgba(200,170,90,0.15);
   }
   .cp-table { width: 100%; border-collapse: collapse; }
   .cp-label { text-align: center; font-size: 11px; opacity: 0.55; padding: 4px 8px; }
   .cp-cell  { text-align: center; font-size: 13px; padding: 4px 10px; }
   .cp-better { color: rgba(120,220,100,0.9); font-weight: 600; }
   .cp-close {
     position: absolute; top: 8px; right: 10px;
     background: none; border: none; color: #aaa;
     font-size: 18px; cursor: pointer; line-height: 1;
   }
   ```

**Какие файлы затрагиваются:**
- `js/compare_mode.js` — новый файл
- `js/map_modes.js` — регистрация режима `'compare'`
- `ui/styles.css` — `.compare-panel`, `.cp-*`
- `js/game.js` — `getRegionData` должна возвращать все необходимые поля

**Тест Шага 70:**
- Активация режима «Сравнить» меняет курсор и показывает подсказку.
- Клик на два региона открывает таблицу сравнения по центру экрана.
- Лучшие показатели выделены зелёным в каждой строке.
- Кнопка × закрывает панель и выходит из режима.
- При выходе из режима подсветка регионов снимается.

---

## БЛОК AJ — Стратегический зум и уровни детализации (Шаг 71)

---

### Шаг 71 — Уровни зума: разная детализация карты на разных масштабах

**Цель:** при приближении карта показывает больше деталей (иконки армий, маркеры строительства, названия городов), при отдалении — только цвета регионов и стратегический обзор. Это снижает визуальный шум на мелких масштабах.

**Что сделать:**

1. Определить три порога зума и что показывается на каждом:
   ```
   Zoom 3–4 (стратегический):  только цвет регионов + имена крупных наций
   Zoom 5–6 (тактический):     + маркеры армий + иконки строительства
   Zoom 7+  (детальный):       + названия регионов + торговые пути + маркеры событий
   ```

2. Функция `applyZoomLevel(zoom)` — включает/выключает слои по порогам:
   ```js
   // js/zoom_layers.js
   let lastZoomLevel = null;

   export function applyZoomLevel(zoom) {
     const level = zoom <= 4 ? 'strategic' : zoom <= 6 ? 'tactical' : 'detail';
     if (level === lastZoomLevel) return;
     lastZoomLevel = level;

     // Маркеры армий
     const showArmies = level !== 'strategic';
     for (const marker of Object.values(armyMarkers)) {
       marker.getElement()?.style.setProperty('display',
         showArmies ? '' : 'none');
     }

     // Маркеры строительства
     const showConstruction = level !== 'strategic';
     for (const marker of Object.values(constructionMarkers)) {
       marker.getElement()?.style.setProperty('display',
         showConstruction ? '' : 'none');
     }

     // Названия регионов (L.tooltip постоянные)
     const showRegionLabels = level === 'detail';
     for (const layer of Object.values(regionLayers)) {
       const tooltip = layer.getTooltip();
       if (tooltip) {
         showRegionLabels ? tooltip.setOpacity(1) : tooltip.setOpacity(0);
       }
     }

     // Торговые пути
     const showTrade = level === 'detail';
     for (const line of Object.values(tradeLines)) {
       line.setStyle({ opacity: showTrade ? 0.5 : 0 });
     }
   }
   ```

3. Подключить к событию `zoomend` Leaflet:
   ```js
   leafletMap.on('zoomend', () => {
     applyZoomLevel(leafletMap.getZoom());
   });
   // Применить при старте
   applyZoomLevel(leafletMap.getZoom());
   ```

4. Плавная смена непрозрачности при переходе между уровнями (CSS-переходы):
   ```css
   /* Все маркеры армий и строительства получают CSS-переход */
   .army-marker,
   .constr-marker {
     transition: opacity 0.25s ease;
   }
   ```
   В `applyZoomLevel` использовать `opacity` вместо `display` для плавности:
   ```js
   marker.getElement()?.style.setProperty('opacity', showArmies ? '1' : '0');
   marker.getElement()?.style.setProperty('pointer-events', showArmies ? '' : 'none');
   ```

5. Добавить индикатор текущего уровня зума в статус-бар (Шаг 35):
   ```js
   function updateStatusBar() {
     const zoom  = leafletMap.getZoom();
     const level = zoom <= 4 ? 'Стратегический' : zoom <= 6 ? 'Тактический' : 'Детальный';
     document.getElementById('status-zoom').textContent = `Зум: ${level}`;
   }
   leafletMap.on('zoomend', updateStatusBar);
   ```

**Какие файлы затрагиваются:**
- `js/zoom_layers.js` — новый файл, `applyZoomLevel`
- `js/map.js` — подключить `zoomend` обработчик
- `ui/styles.css` — CSS-переходы для маркеров

**Тест Шага 71:**
- На зуме 3 маркеры армий не видны; на зуме 5 появляются с плавным fade.
- На зуме 7 показываются торговые пути и названия регионов.
- Статус-бар отображает текущий режим зума.
- Переход между уровнями плавный (0.25 с, не мгновенный).

---

## БЛОК AK — Сезоны (Шаг 72)

---

### Шаг 72 — Визуальные сезоны: цветовой тинт карты и текстуры по времени года

**Цель:** каждые N ходов наступает новый сезон (весна, лето, осень, зима). Сезон меняет цветовой фильтр над картой (SVG/CSS overlay) и добавляет тонкий тинт к фонам панелей. Сезоны влияют на механику (зима — штраф к движению, лето — пик урожая).

**Что сделать:**

1. Определить сезоны и их параметры в `data/seasons.js`:
   ```js
   export const SEASONS = {
     spring: {
       label:      'Весна',
       turns:      3,           // длительность в ходах
       mapFilter:  'hue-rotate(10deg) saturate(1.1) brightness(1.05)',
       panelTint:  'rgba(20,40,10,0.15)',   // дополнительный зелёный тинт
       mechanics:  { moveBonus: 0, harvestMod: 1.0 },
     },
     summer: {
       label:      'Лето',
       turns:      4,
       mapFilter:  'saturate(1.2) brightness(1.08)',
       panelTint:  'rgba(40,20,5,0.1)',
       mechanics:  { moveBonus: 0, harvestMod: 1.2 },
     },
     autumn: {
       label:      'Осень',
       turns:      3,
       mapFilter:  'hue-rotate(-15deg) saturate(0.9) brightness(0.95)',
       panelTint:  'rgba(40,20,5,0.2)',
       mechanics:  { moveBonus: 0, harvestMod: 0.9 },
     },
     winter: {
       label:      'Зима',
       turns:      3,
       mapFilter:  'saturate(0.5) brightness(0.85) hue-rotate(-5deg)',
       panelTint:  'rgba(10,15,30,0.25)',
       mechanics:  { moveBonus: -1, harvestMod: 0.5 },
     },
   };

   const SEASON_ORDER = ['spring','summer','autumn','winter'];

   export function getSeasonForTurn(turn) {
     const cycleLength = SEASON_ORDER.reduce((s, k) => s + SEASONS[k].turns, 0);
     const pos = turn % cycleLength;
     let acc = 0;
     for (const key of SEASON_ORDER) {
       acc += SEASONS[key].turns;
       if (pos < acc) return key;
     }
     return 'spring';
   }
   ```

2. Применить сезон к карте — CSS фильтр на `#map` контейнер:
   ```js
   // js/seasons.js
   import { SEASONS, getSeasonForTurn } from '../data/seasons.js';

   export function applySeason(turn) {
     const key    = getSeasonForTurn(turn);
     const season = SEASONS[key];

     // Фильтр на карту
     document.getElementById('map').style.filter = season.mapFilter;

     // Дополнительный тинт панелей (поверх культурного тинта из Шага 56)
     document.documentElement.style.setProperty(
       '--season-tint', season.panelTint
     );

     // Обновить индикатор сезона в статус-баре
     document.getElementById('status-season').textContent = `🌿 ${season.label}`;
   }
   ```

3. CSS — добавить `--season-tint` как дополнительный слой `::after` на панели:
   ```css
   #left-panel::after,
   #right-panel::after {
     content: '';
     position: absolute;
     inset: 0;
     background: var(--season-tint, transparent);
     pointer-events: none;
     z-index: 1;           /* между текстурой (z:0) и контентом (z:1) */
     transition: background 1.5s ease;
   }
   /* Контент выше обоих псевдоэлементов */
   #left-panel > *,
   #right-panel > * { z-index: 2; }
   ```

4. Вызов при смене хода:
   ```js
   eventBus.on('turnStart', ({ turn }) => applySeason(turn));
   // и при загрузке:
   applySeason(gameState.turn);
   ```

5. Применить механику зимы при расчёте движения армий:
   ```js
   function getMovementPoints(army, turn) {
     const season  = SEASONS[getSeasonForTurn(turn)];
     const base    = army.movePoints ?? 2;
     return Math.max(0, base + season.mechanics.moveBonus);
   }
   ```

**Какие файлы затрагиваются:**
- `data/seasons.js` — новый файл
- `js/seasons.js` — `applySeason`
- `js/game.js` — `getMovementPoints`, `applySeason` при смене хода
- `ui/styles.css` — `--season-tint`, CSS-переход фильтра

**Тест Шага 72:**
- Через 3 хода (конец весны) карта приобретает летние тона.
- Зимой `getMovementPoints` возвращает на 1 меньше обычного.
- Индикатор в статус-баре показывает текущий сезон.
- CSS-переход фильтра карты занимает ~1.5 с (не мгновенный).
- `getSeasonForTurn(0)` → `'spring'`, `getSeasonForTurn(13)` → `'spring'` (цикл 13 ходов).

---

## БЛОК AL — Спарклайны ресурсов (Шаг 73)

---

### Шаг 73 — Мини-графики динамики ресурсов: sparklines в панели ресурсов

**Цель:** рядом с каждым ресурсом (золото, население, армия) показывать крошечный мини-график за последние 20 ходов. Игрок сразу видит тренд — растёт или падает без клика. Реализация — SVG, генерируется из массива истории.

**Что сделать:**

1. Хранить историю ресурсов в `gameState`:
   ```js
   // Добавить в gameState при инициализации
   gameState.history = {
     gold:      [],   // массив значений по ходам, макс. 20 элементов
     manpower:  [],
     food:      [],
   };

   // Записывать после каждого хода
   function recordResourceHistory() {
     const MAX = 20;
     for (const key of ['gold', 'manpower', 'food']) {
       gameState.history[key].push(gameState.resources[key]);
       if (gameState.history[key].length > MAX) {
         gameState.history[key].shift();
       }
     }
   }
   ```

2. Функция `buildSparkline(values, width, height)` — генерирует SVG-строку:
   ```js
   // ui/sparkline.js
   export function buildSparkline(values, width = 48, height = 16) {
     if (values.length < 2) return '';

     const min  = Math.min(...values);
     const max  = Math.max(...values);
     const range = max - min || 1;

     const xStep = width / (values.length - 1);
     const points = values.map((v, i) => {
       const x = i * xStep;
       const y = height - ((v - min) / range) * height;
       return `${x.toFixed(1)},${y.toFixed(1)}`;
     }).join(' ');

     // Цвет: зелёный если последнее > первого, красный если меньше
     const trend = values[values.length - 1] >= values[0];
     const color = trend ? 'rgba(100,210,80,0.8)' : 'rgba(220,80,60,0.8)';

     return `
       <svg xmlns="http://www.w3.org/2000/svg"
            width="${width}" height="${height}"
            viewBox="0 0 ${width} ${height}"
            class="sparkline">
         <polyline points="${points}"
                   fill="none"
                   stroke="${color}"
                   stroke-width="1.5"
                   stroke-linejoin="round"
                   stroke-linecap="round"/>
         <!-- Последняя точка — кружок -->
         <circle cx="${(values.length-1)*xStep}" cy="${height - ((values[values.length-1]-min)/range)*height}"
                 r="2" fill="${color}"/>
       </svg>
     `;
   }
   ```

3. Встроить sparkline в строку ресурса в `ui/resource_bar.js`:
   ```js
   import { buildSparkline } from './sparkline.js';

   function renderResourceRow(key, label, value, history) {
     const spark = buildSparkline(history, 48, 16);
     return `
       <div class="resource-row" data-resource="${key}">
         <span class="resource-row__label">${label}</span>
         <span class="resource-row__value">${formatValue(value)}</span>
         <span class="resource-row__spark">${spark}</span>
       </div>
     `;
   }
   ```
   CSS:
   ```css
   .resource-row {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 3px 0;
   }
   .resource-row__label { font-size: 11px; opacity: 0.6; min-width: 60px; }
   .resource-row__value { font-size: 13px; font-weight: 600; min-width: 48px; }
   .resource-row__spark { flex-shrink: 0; }
   .sparkline { vertical-align: middle; }
   ```

4. Обновлять sparklines после каждого хода:
   ```js
   function refreshResourceBar() {
     const keys = ['gold', 'manpower', 'food'];
     const labels = { gold: 'Золото', manpower: 'Армия', food: 'Еда' };

     const container = document.getElementById('resource-bar');
     container.innerHTML = keys.map(k =>
       renderResourceRow(k, labels[k],
         gameState.resources[k],
         gameState.history[k])
     ).join('');
   }

   eventBus.on('turnEnd', () => {
     recordResourceHistory();
     refreshResourceBar();
   });
   ```

5. Тултип при наведении на sparkline — показывает точные значения за последние ходы:
   ```js
   // Делегированный обработчик на resource-bar
   document.getElementById('resource-bar').addEventListener('mouseover', e => {
     const row = e.target.closest('[data-resource]');
     if (!row) return;
     const key  = row.dataset.resource;
     const hist = gameState.history[key];
     const tip  = hist.slice(-5).reverse()
       .map((v, i) => `Ход -${i}: ${v}`)
       .join('\n');
     row.title = tip;
   });
   ```

**Какие файлы затрагиваются:**
- `ui/sparkline.js` — новый файл, `buildSparkline`
- `ui/resource_bar.js` — `renderResourceRow` с sparkline
- `js/game.js` — `recordResourceHistory`, `refreshResourceBar` после хода
- `ui/styles.css` — `.resource-row`, `.sparkline`

**Тест Шага 73:**
- Рядом с каждым ресурсом виден мини-график из 20 точек.
- Растущий тренд — зелёная линия, падающий — красная.
- После каждого хода график обновляется.
- Наведение на строку ресурса показывает последние 5 значений в `title`.

---

## БЛОК AM — Индикаторы ИИ (Шаг 74)

---

### Шаг 74 — Визуальные индикаторы действий ИИ: что делают другие нации

**Цель:** после хода ИИ-наций показывать краткий отчёт об их действиях. На карте рядом с регионами ИИ появляются временные иконки-флеши (армия двигалась, велось строительство, заключён договор). Это делает мир «живым» — игрок видит, что происходит вокруг.

**Что сделать:**

1. Структура события действия ИИ:
   ```js
   {
     nationId:  'rome',
     type:      'move',       // move | build | diplo | recruit | attack
     regionId:  'latium',
     text:      'Рим двигает армию в Лациум',
   }
   ```

2. Функция `flashAIAction(action)` — показать временную иконку на карте:
   ```js
   // js/ai_indicators.js
   const AI_ICONS = {
     move:    'assets/icons/nomadic_bow.svg',    // стрела движения
     build:   'assets/icons/construction.svg',
     diplo:   'assets/icons/scroll.svg',
     recruit: 'assets/icons/roman_eagle.svg',
     attack:  'assets/icons/generic_sword.svg',
   };

   export function flashAIAction(action) {
     const [lat, lng] = getRegionCenter(action.regionId);
     const icon = AI_ICONS[action.type] ?? AI_ICONS.attack;

     const html = `
       <div class="ai-flash ai-flash--${action.type}">
         <img src="${icon}" width="16" height="16">
       </div>
     `;
     const divIcon = L.divIcon({ className: '', html, iconSize: [28,28], iconAnchor: [14,14] });
     const marker  = L.marker([lat + 0.2, lng + 0.2], { icon: divIcon, zIndexOffset: 200 });
     marker.addTo(leafletMap);

     // Удалить через 2.5 секунды
     setTimeout(() => marker.remove(), 2500);
   }
   ```
   CSS:
   ```css
   .ai-flash {
     display: flex;
     align-items: center;
     justify-content: center;
     width: 28px; height: 28px;
     border-radius: 50%;
     background: rgba(10,8,4,0.8);
     border: 1px solid rgba(200,170,90,0.5);
     animation: aiFlashPop 0.3s ease, aiFlashFade 0.5s ease 2s forwards;
   }
   @keyframes aiFlashPop {
     from { transform: scale(0.5); opacity: 0; }
     to   { transform: scale(1);   opacity: 1; }
   }
   @keyframes aiFlashFade {
     to { opacity: 0; transform: scale(0.8); }
   }
   .ai-flash img { filter: invert(1) sepia(1) saturate(1.5); opacity: 0.85; }
   ```

3. Показывать индикаторы поочерёдно с небольшой задержкой (не все сразу):
   ```js
   export function showAITurnActions(actions) {
     // Показывать не более 8 индикаторов чтобы не перегрузить карту
     const limited = actions.slice(0, 8);

     limited.forEach((action, i) => {
       setTimeout(() => flashAIAction(action), i * 180);
     });

     // Добавить все действия ИИ в ленту событий (Шаг 68), но некоторые
     // пропустить чтобы не спамить — только важные
     for (const action of actions) {
       if (action.type === 'attack' || action.type === 'diplo') {
         addEvent({ type: 'war', text: action.text });
       }
     }
   }
   ```

4. Вызов после расчёта хода ИИ:
   ```js
   // В основном игровом цикле после processAITurns()
   const aiActions = collectAIActions();   // собрать все действия за ход
   showAITurnActions(aiActions);
   ```

5. Настройка в меню опций — «Показывать действия ИИ» (по умолчанию включено):
   ```js
   // settings.js
   const showAIIndicators = () =>
     localStorage.getItem('showAIIndicators') !== 'false';

   // В flashAIAction:
   if (!showAIIndicators()) return;
   ```

**Какие файлы затрагиваются:**
- `js/ai_indicators.js` — новый файл
- `js/game.js` — `showAITurnActions` после хода ИИ
- `ui/styles.css` — `.ai-flash`, анимации
- `js/settings.js` — опция `showAIIndicators`

**Тест Шага 74:**
- После нажатия «Следующий ход» на карте появляются мигающие иконки в регионах ИИ.
- Иконки исчезают через ~2.5 сек с плавным fade.
- Одновременно не более 8 иконок на карте.
- При выключении опции в настройках иконки не показываются.
- Атаки ИИ попадают в ленту событий как военные события.

---

## БЛОК AN — Планировщик маршрутов армий (Шаг 75)

---

### Шаг 75 — Планировщик маршрутов: визуальная прокладка пути армии по карте

**Цель:** игрок кликает на армию, затем кликает на целевой регион — отображается маршрут (A* по графу регионов) с указанием числа ходов. Подтверждение стрелкой или клавишей Enter. Маршрут рисуется пунктирной линией с анимацией.

**Что сделать:**

1. A* по графу регионов — `js/pathfinding.js`:
   ```js
   // Граф регионов: { regionId: [neighborId, ...] }
   // Предполагается что gameState.regionGraph уже заполнен при инициализации

   export function findPath(fromId, toId, graph) {
     const open   = new Set([fromId]);
     const cameFrom = {};
     const gScore   = { [fromId]: 0 };
     const fScore   = { [fromId]: heuristic(fromId, toId) };

     while (open.size > 0) {
       // Узел с наименьшим fScore
       const current = [...open].reduce((a, b) =>
         (fScore[a] ?? Infinity) < (fScore[b] ?? Infinity) ? a : b
       );

       if (current === toId) return reconstructPath(cameFrom, current);

       open.delete(current);

       for (const neighbor of (graph[current] ?? [])) {
         const tentative = (gScore[current] ?? Infinity) + 1;
         if (tentative < (gScore[neighbor] ?? Infinity)) {
           cameFrom[neighbor]  = current;
           gScore[neighbor]    = tentative;
           fScore[neighbor]    = tentative + heuristic(neighbor, toId);
           open.add(neighbor);
         }
       }
     }
     return null;   // путь не найден
   }

   function reconstructPath(cameFrom, current) {
     const path = [current];
     while (cameFrom[current]) {
       current = cameFrom[current];
       path.unshift(current);
     }
     return path;
   }

   // Эвристика: евклидово расстояние между центрами регионов
   function heuristic(aId, bId) {
     const [aLat, aLng] = getRegionCenter(aId);
     const [bLat, bLng] = getRegionCenter(bId);
     return Math.hypot(aLat - bLat, aLng - bLng);
   }
   ```

2. UI — режим планирования маршрута:
   ```js
   // js/route_planner.js
   let selectedArmyId = null;

   export function selectArmyForRoute(armyId) {
     selectedArmyId = armyId;
     showToast('Выберите целевой регион', 'info');

     // Подсветить армию
     armyMarkers[armyId]?.getElement()
       ?.classList.add('army-marker--selected');

     // Ждать клика по региону
     for (const [regionId, layer] of Object.entries(regionLayers)) {
       layer.once('click', () => planRouteTo(regionId));
     }
   }

   function planRouteTo(targetRegionId) {
     const army  = getArmy(selectedArmyId);
     if (!army) return;

     const path = findPath(army.regionId, targetRegionId, gameState.regionGraph);
     if (!path || path.length < 2) {
       showToast('Путь не найден', 'warning');
       return;
     }

     drawRoute(path);
     showRouteConfirm(army, path, targetRegionId);
   }
   ```

3. Отрисовать маршрут пунктирной линией:
   ```js
   let routeLine = null;

   function drawRoute(regionIds) {
     routeLine?.remove();

     const points = regionIds.map(id => getRegionCenter(id));
     routeLine = L.polyline(points, {
       color:     'rgba(200,200,255,0.8)',
       weight:    2.5,
       dashArray: '8 5',
       className: 'route-line',
     });
     routeLine.addTo(leafletMap);

     // Стрелка в конце маршрута
     const last   = points[points.length - 1];
     const prelast = points[points.length - 2];
     drawArrowhead(prelast, last);
   }

   function drawArrowhead(from, to) {
     // L.marker в конечной точке с SVG-стрелкой
     const angle = Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;
     const html  = `<div class="route-arrow" style="transform:rotate(${angle}deg)">▶</div>`;
     L.marker(to, {
       icon: L.divIcon({ className: '', html, iconSize: [12,12], iconAnchor: [6,6] }),
       zIndexOffset: 300,
     }).addTo(leafletMap);
   }
   ```
   CSS:
   ```css
   .route-line { animation: routeDash 0.8s linear infinite; }
   @keyframes routeDash { to { stroke-dashoffset: -26; } }

   .route-arrow {
     color: rgba(200,200,255,0.9);
     font-size: 12px;
     line-height: 1;
   }
   .army-marker--selected {
     box-shadow: 0 0 0 3px rgba(200,200,255,0.6);
     border-color: rgba(200,200,255,0.9) !important;
   }
   ```

4. Подтверждение маршрута:
   ```js
   function showRouteConfirm(army, path, targetId) {
     const turns = path.length - 1;   // упрощённо: 1 регион = 1 ход
     const toast = showToast(
       `Маршрут: ${turns} ход(а). [Enter] подтвердить, [Esc] отмена`,
       'info',
       0   // не исчезает сам
     );

     const onKey = e => {
       if (e.key === 'Enter') {
         assignRoute(army.id, path);
         cancelRoute();
       } else if (e.key === 'Escape') {
         cancelRoute();
       }
     };
     document.addEventListener('keydown', onKey, { once: false });

     function cancelRoute() {
       routeLine?.remove();
       routeLine = null;
       toast?.dismiss?.();
       document.removeEventListener('keydown', onKey);
       armyMarkers[army.id]?.getElement()
         ?.classList.remove('army-marker--selected');
     }
   }
   ```

**Какие файлы затрагиваются:**
- `js/pathfinding.js` — новый файл, A*
- `js/route_planner.js` — новый файл, UI планировщика
- `js/game.js` — `assignRoute` — сохранить маршрут в `army.route`
- `ui/styles.css` — `.route-line`, `.route-arrow`, `.army-marker--selected`

**Тест Шага 75:**
- Клик на маркер армии → клик на далёкий регион → отображается A*-маршрут через промежуточные регионы.
- Пунктирная линия анимирована (бежит в сторону цели).
- Нажатие Enter подтверждает маршрут, армия начнёт движение в следующий ход.
- Нажатие Esc отменяет выбор без последствий.
- Маршрут огибает «чужие» регионы если граф это поддерживает.

---

## БЛОК AO — Туман войны (Шаг 76)

---

### Шаг 76 — Туман войны: скрытые регионы за пределами разведки

**Цель:** регионы, где у игрока нет армий и нет смежных территорий, покрыты «туманом» — полупрозрачным тёмным оверлеем. Туман снимается при приближении армии. Это создаёт элемент неизвестности и стратегии.

**Что сделать:**

1. Вычислить «видимые» регионы для игрока:
   ```js
   // js/fog_of_war.js
   export function getVisibleRegions(playerNationId, graph) {
     const visible = new Set();

     // Все регионы игрока
     for (const region of gameState.regions) {
       if (region.ownerNationId === playerNationId) {
         visible.add(region.id);
         // + все соседи (разведка на 1 регион)
         for (const neighbor of (graph[region.id] ?? [])) {
           visible.add(neighbor);
         }
       }
     }

     // Все регионы где есть армии игрока
     for (const army of gameState.armies) {
       if (army.nationId === playerNationId) {
         visible.add(army.regionId);
         for (const neighbor of (graph[army.regionId] ?? [])) {
           visible.add(neighbor);
         }
       }
     }

     return visible;
   }
   ```

2. Применить туман — затемнить невидимые регионы:
   ```js
   export function applyFogOfWar(playerNationId) {
     const visible = getVisibleRegions(playerNationId, gameState.regionGraph);

     for (const [regionId, layer] of Object.entries(regionLayers)) {
       if (visible.has(regionId)) {
         layer.setStyle({ fillOpacity: 0.5, opacity: 0.8 });
         layer.getElement()?.classList.remove('region--fogged');
       } else {
         layer.setStyle({ fillColor: '#1a1a2e', fillOpacity: 0.75, opacity: 0.4 });
         layer.getElement()?.classList.add('region--fogged');
       }
     }

     // Скрыть маркеры армий чужих наций в тумане
     for (const army of gameState.armies) {
       if (army.nationId !== playerNationId) {
         const isVisible = visible.has(army.regionId);
         const marker = armyMarkers[army.id];
         if (marker) {
           marker.getElement()?.style.setProperty('opacity', isVisible ? '1' : '0');
           marker.getElement()?.style.setProperty('pointer-events',
             isVisible ? '' : 'none');
         }
       }
     }
   }
   ```

3. CSS для затуманенных регионов:
   ```css
   .region--fogged {
     /* Дополнительный штриховой паттерн поверх слоя */
     /* Leaflet Canvas не поддерживает CSS на path, поэтому используем оверлей */
   }
   ```
   Для Canvas renderer Leaflet — использовать `setStyle` как выше, не CSS-классы.

4. SVG-overlay для визуального «тумана» — тонкий noise-паттерн:
   ```js
   // Создать SVG дефинишн для паттерна тумана
   const fogPattern = `
     <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">
       <defs>
         <pattern id="fog-pattern" x="0" y="0" width="8" height="8"
                  patternUnits="userSpaceOnUse">
           <rect width="8" height="8" fill="rgba(20,18,35,0.6)"/>
           <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.04)"/>
           <circle cx="6" cy="6" r="1" fill="rgba(255,255,255,0.03)"/>
         </pattern>
       </defs>
     </svg>
   `;
   document.body.insertAdjacentHTML('afterbegin', fogPattern);
   ```

5. Настройка «Туман войны вкл/выкл» в меню опций:
   ```js
   let fogEnabled = localStorage.getItem('fogOfWar') !== 'false';

   function toggleFog(enabled) {
     fogEnabled = enabled;
     localStorage.setItem('fogOfWar', String(enabled));
     if (enabled) {
       applyFogOfWar(gameState.playerNation);
     } else {
       // Снять туман со всех регионов
       for (const layer of Object.values(regionLayers)) {
         layer.setStyle({ fillOpacity: 0.5, opacity: 0.8 });
       }
     }
   }
   ```

6. Обновлять туман после каждого хода и при движении армий:
   ```js
   eventBus.on('turnEnd',    () => applyFogOfWar(gameState.playerNation));
   eventBus.on('armyMoved',  () => applyFogOfWar(gameState.playerNation));
   ```

**Какие файлы затрагиваются:**
- `js/fog_of_war.js` — новый файл, `getVisibleRegions`, `applyFogOfWar`
- `js/game.js` — вызов `applyFogOfWar` после хода и движения армий
- `js/settings.js` — `toggleFog`

**Тест Шага 76:**
- Регионы вдали от владений игрока покрыты тёмным оверлеем.
- При движении армии в новый регион туман снимается с него и его соседей.
- Маркеры армий ИИ не видны в тумане.
- Переключатель в настройках включает/выключает туман мгновенно.
- После перезагрузки состояние тумана восстанавливается корректно.

---

## БЛОК AP — Горячие клавиши (Шаг 77)

---

### Шаг 77 — Горячие клавиши: полное управление с клавиатуры

**Цель:** добавить систему горячих клавиш для всех основных действий. Клавиши отображаются в подсказках кнопок. Пользователь может переназначить их в настройках. Реализация — централизованный реестр без хардкода в обработчиках.

**Что сделать:**

1. Реестр горячих клавиш `js/hotkeys.js`:
   ```js
   // Дефолтные привязки
   const DEFAULT_HOTKEYS = {
     'end-turn':       'Enter',
     'open-diplomacy': 'd',
     'open-court':     'c',
     'open-economy':   'e',
     'open-log':       'l',
     'toggle-fog':     'f',
     'mode-trade':     't',
     'mode-compare':   'x',
     'close-modal':    'Escape',
     'next-army':      'Tab',
     'zoom-in':        '+',
     'zoom-out':       '-',
   };

   let hotkeys = { ...DEFAULT_HOTKEYS };

   // Загрузить пользовательские переназначения
   try {
     const saved = JSON.parse(localStorage.getItem('hotkeys') ?? '{}');
     Object.assign(hotkeys, saved);
   } catch { /* ignore */ }

   // Реестр обработчиков: action → callback
   const handlers = {};

   export function registerHotkey(action, callback) {
     handlers[action] = callback;
   }

   export function bindKey(action, key) {
     hotkeys[action] = key;
     localStorage.setItem('hotkeys', JSON.stringify(hotkeys));
   }

   export function getKey(action) {
     return hotkeys[action] ?? '';
   }

   // Единый глобальный обработчик
   document.addEventListener('keydown', e => {
     // Не срабатывать внутри полей ввода
     if (e.target.matches('input, textarea, select')) return;

     for (const [action, key] of Object.entries(hotkeys)) {
       if (e.key === key && handlers[action]) {
         e.preventDefault();
         handlers[action](e);
         return;
       }
     }
   });
   ```

2. Регистрация действий при инициализации игры:
   ```js
   import { registerHotkey } from './hotkeys.js';

   registerHotkey('end-turn',       () => document.getElementById('end-turn-btn').click());
   registerHotkey('open-diplomacy', () => activateTab('diplomacy'));
   registerHotkey('open-court',     () => activateTab('court'));
   registerHotkey('open-economy',   () => activateTab('economy'));
   registerHotkey('open-log',       () => toggleLogDrawer());
   registerHotkey('toggle-fog',     () => toggleFog(!fogEnabled));
   registerHotkey('mode-trade',     () => toggleMapMode('trade'));
   registerHotkey('mode-compare',   () => toggleMapMode('compare'));
   registerHotkey('close-modal',    () => closeTopModal());
   registerHotkey('next-army',      () => selectNextArmy());
   registerHotkey('zoom-in',        () => leafletMap.zoomIn());
   registerHotkey('zoom-out',       () => leafletMap.zoomOut());
   ```

3. Показывать горячую клавишу в `title` кнопок:
   ```js
   import { getKey } from './hotkeys.js';

   // При рендере кнопок добавлять подсказку
   function setButtonHint(buttonId, action, label) {
     const btn = document.getElementById(buttonId);
     if (!btn) return;
     const key = getKey(action);
     btn.title = key ? `${label} [${key}]` : label;
   }

   setButtonHint('end-turn-btn',   'end-turn',       'Конец хода');
   setButtonHint('diplo-tab-btn',  'open-diplomacy', 'Дипломатия');
   // и т.д.
   ```

4. Экран переназначения клавиш в настройках:
   ```js
   function renderHotkeySettings() {
     const container = document.getElementById('hotkey-settings');
     const LABELS = {
       'end-turn':       'Конец хода',
       'open-diplomacy': 'Дипломатия',
       'open-court':     'Двор',
       'open-economy':   'Экономика',
       'open-log':       'Журнал',
       'toggle-fog':     'Туман войны',
       'mode-trade':     'Торговые пути',
       'mode-compare':   'Сравнение',
       'close-modal':    'Закрыть окно',
       'next-army':      'Следующая армия',
     };

     container.innerHTML = Object.entries(LABELS).map(([action, label]) => `
       <div class="hotkey-row">
         <span class="hotkey-row__label">${label}</span>
         <kbd class="hotkey-row__key" data-action="${action}"
              tabindex="0">${getKey(action)}</kbd>
       </div>
     `).join('');

     // Клик на kbd → ввести новую клавишу
     container.addEventListener('click', e => {
       const kbd = e.target.closest('.hotkey-row__key');
       if (!kbd) return;
       kbd.textContent = '...';
       kbd.classList.add('is-listening');
       document.addEventListener('keydown', function capture(ev) {
         ev.preventDefault();
         bindKey(kbd.dataset.action, ev.key);
         kbd.textContent = ev.key;
         kbd.classList.remove('is-listening');
         document.removeEventListener('keydown', capture);
       }, { once: true });
     });
   }
   ```
   CSS:
   ```css
   .hotkey-row {
     display: flex; align-items: center; justify-content: space-between;
     padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06);
   }
   .hotkey-row__label { font-size: 13px; }
   .hotkey-row__key {
     min-width: 32px; text-align: center;
     padding: 2px 8px;
     background: rgba(200,170,90,0.1);
     border: 1px solid rgba(200,170,90,0.35);
     border-radius: 4px;
     font-size: 12px; font-family: monospace;
     cursor: pointer; color: #f0e8c8;
   }
   .hotkey-row__key.is-listening {
     border-color: rgba(100,150,255,0.7);
     background: rgba(100,150,255,0.1);
   }
   ```

**Какие файлы затрагиваются:**
- `js/hotkeys.js` — новый файл, централизованный реестр
- `js/game.js` — `registerHotkey` вызовы для всех действий
- `index.html` — `#hotkey-settings`
- `ui/styles.css` — `.hotkey-row`, `.hotkey-row__key`

**Тест Шага 77:**
- `Enter` завершает ход.
- `d` открывает вкладку дипломатии.
- `Escape` закрывает открытый модал.
- `Tab` переключает между армиями.
- Переназначение в настройках: клик на клавишу → нажать новую → сохраняется в localStorage.
- Горячие клавиши не срабатывают при вводе в текстовое поле.

---

## БЛОК AQ — Контекстное меню правой кнопкой (Шаг 78)

---

### Шаг 78 — Контекстное меню: правый клик на регион или армию

**Цель:** правый клик на регион или маркер армии открывает контекстное меню с быстрыми действиями. Это устраняет необходимость открывать popup и искать кнопку — самые нужные действия в одном клике.

**Что сделать:**

1. HTML контекстного меню (один элемент, переиспользуется):
   ```html
   <ul id="context-menu" class="context-menu" hidden></ul>
   ```

2. Функция `showContextMenu(x, y, items)`:
   ```js
   // js/context_menu.js
   export function showContextMenu(x, y, items) {
     const menu = document.getElementById('context-menu');
     menu.innerHTML = items.map(item =>
       item.divider
         ? `<li class="context-menu__divider"></li>`
         : `<li class="context-menu__item ${item.disabled ? 'is-disabled' : ''}"
                data-action="${item.action}"
                data-payload='${JSON.stringify(item.payload ?? {})}'>
              ${item.icon ? `<img src="${item.icon}" width="14" height="14">` : ''}
              <span>${item.label}</span>
              ${item.key ? `<kbd>${item.key}</kbd>` : ''}
            </li>`
     ).join('');

     // Позиционировать, не выходя за края
     const w = 180;
     const left = Math.min(x, window.innerWidth  - w - 8);
     const top  = Math.min(y, window.innerHeight - menu.offsetHeight - 8);
     menu.style.left = `${left}px`;
     menu.style.top  = `${top}px`;
     menu.hidden = false;

     // Закрыть при клике вне меню
     setTimeout(() => {
       document.addEventListener('click', closeContextMenu, { once: true });
       document.addEventListener('keydown', e => {
         if (e.key === 'Escape') closeContextMenu();
       }, { once: true });
     }, 0);
   }

   export function closeContextMenu() {
     document.getElementById('context-menu').hidden = true;
   }
   ```

3. CSS контекстного меню:
   ```css
   .context-menu {
     position: fixed;
     z-index: 2000;
     background: rgba(12,8,4,0.97);
     border: 1px solid rgba(200,170,90,0.3);
     border-radius: 6px;
     padding: 4px 0;
     min-width: 170px;
     box-shadow: 0 8px 24px rgba(0,0,0,0.6);
     list-style: none; margin: 0;
     font-size: 13px;
   }
   .context-menu__item {
     display: flex; align-items: center; gap: 8px;
     padding: 7px 14px;
     cursor: pointer; color: #ddd;
     transition: background 0.1s;
   }
   .context-menu__item:hover    { background: rgba(200,170,90,0.12); color: #f0e8c8; }
   .context-menu__item.is-disabled { opacity: 0.4; pointer-events: none; }
   .context-menu__item img      { filter: invert(1); opacity: 0.7; flex-shrink: 0; }
   .context-menu__item kbd      { margin-left: auto; font-size: 10px; opacity: 0.5; }
   .context-menu__divider       { height: 1px; background: rgba(200,170,90,0.12); margin: 4px 0; }
   ```

4. Контекстное меню для региона (правый клик на полигон):
   ```js
   layer.on('contextmenu', e => {
     L.DomEvent.preventDefault(e);
     const regionId  = layer._regionId;
     const region    = getRegionData(regionId);
     const isOwned   = region.ownerNationId === gameState.playerNation;

     showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, [
       { label: region.name, disabled: true },
       { divider: true },
       { label: 'Открыть регион',  action: 'open-region',  payload: { regionId },
         icon: 'assets/icons/generic_sword.svg' },
       { label: 'Строительство',   action: 'open-build',   payload: { regionId },
         icon: 'assets/icons/construction.svg',
         disabled: !isOwned },
       { label: 'Набор войск',     action: 'recruit',      payload: { regionId },
         icon: 'assets/icons/roman_eagle.svg',
         disabled: !isOwned },
       { divider: true },
       { label: 'Послать армию сюда', action: 'move-army', payload: { targetId: regionId },
         icon: 'assets/icons/nomadic_bow.svg',
         disabled: !selectedArmyId },
     ]);
   });
   ```

5. Обработчик кликов на пункты меню:
   ```js
   document.getElementById('context-menu').addEventListener('click', e => {
     const item = e.target.closest('.context-menu__item');
     if (!item || item.classList.contains('is-disabled')) return;

     const action  = item.dataset.action;
     const payload = JSON.parse(item.dataset.payload ?? '{}');

     closeContextMenu();

     switch (action) {
       case 'open-region':  openRegionPopup(payload.regionId); break;
       case 'open-build':   openBuildMenu(payload.regionId);   break;
       case 'recruit':      openRecruitMenu(payload.regionId); break;
       case 'move-army':    planRouteTo(payload.targetId);     break;
     }
   });
   ```

**Какие файлы затрагиваются:**
- `js/context_menu.js` — новый файл
- `js/map.js` — `contextmenu` обработчик на регионы и маркеры армий
- `index.html` — `#context-menu`
- `ui/styles.css` — `.context-menu` и дочерние классы

**Тест Шага 78:**
- Правый клик на регион открывает меню с именем региона и набором действий.
- Пункт «Послать армию сюда» отключён если нет выбранной армии.
- Клик вне меню или `Escape` закрывают его.
- Меню не выходит за края экрана при клике у правого/нижнего края.
- Клик на пункт выполняет нужное действие.

---

## БЛОК AR — Тост-уведомления (Шаг 79)

---

### Шаг 79 — Система тост-уведомлений: очередь, типы, автоскрытие

**Цель:** централизованная система уведомлений с очередью. Тосты появляются снизу-справа, у каждого тип (success/error/warning/info), иконка, прогресс-бар времени жизни. Поддерживается ручное закрытие и действие-кнопка («Отмена», «Перейти»).

**Что сделать:**

1. HTML-контейнер тостов в `index.html`:
   ```html
   <div id="toast-container" class="toast-container" aria-live="polite"></div>
   ```

2. CSS тостов:
   ```css
   .toast-container {
     position: fixed;
     bottom: 24px;
     right: 24px;
     z-index: 3000;
     display: flex;
     flex-direction: column;
     gap: 8px;
     pointer-events: none;
   }
   .toast {
     display: flex;
     align-items: flex-start;
     gap: 10px;
     background: rgba(12,8,4,0.97);
     border: 1px solid transparent;
     border-radius: 6px;
     padding: 10px 14px;
     max-width: 320px;
     box-shadow: 0 4px 16px rgba(0,0,0,0.5);
     pointer-events: auto;
     animation: toastIn 0.25s ease;
     position: relative;
     overflow: hidden;
   }
   @keyframes toastIn {
     from { transform: translateX(40px); opacity: 0; }
     to   { transform: translateX(0);    opacity: 1; }
   }
   .toast--success { border-color: rgba(80,200,100,0.4); }
   .toast--error   { border-color: rgba(220,60,60,0.5);  }
   .toast--warning { border-color: rgba(220,170,40,0.5); }
   .toast--info    { border-color: rgba(100,150,220,0.4);}

   .toast__icon    { flex-shrink: 0; font-size: 16px; margin-top: 1px; }
   .toast__body    { flex: 1; }
   .toast__text    { font-size: 13px; color: #ddd; line-height: 1.4; }
   .toast__action  {
     font-size: 12px; color: rgba(200,170,90,0.9);
     background: none; border: none; cursor: pointer; padding: 2px 0;
     text-decoration: underline;
   }
   .toast__close {
     position: absolute; top: 6px; right: 8px;
     background: none; border: none; color: rgba(255,255,255,0.4);
     font-size: 14px; cursor: pointer; line-height: 1;
   }
   /* Прогресс-бар времени жизни */
   .toast__timer {
     position: absolute; bottom: 0; left: 0;
     height: 2px; background: rgba(200,170,90,0.5);
     animation: toastTimer linear forwards;
   }
   @keyframes toastTimer { to { width: 0%; } }
   ```

3. JS — `js/toast.js`:
   ```js
   const ICONS = {
     success: '✓',
     error:   '✕',
     warning: '⚠',
     info:    'ℹ',
   };

   const queue = [];
   let activeCount = 0;
   const MAX_VISIBLE = 4;

   export function showToast(text, type = 'info', durationMs = 4000, action = null) {
     const item = { text, type, durationMs, action, id: crypto.randomUUID() };
     queue.push(item);
     processQueue();
     return item;   // вернуть для возможности item.dismiss()
   }

   function processQueue() {
     while (activeCount < MAX_VISIBLE && queue.length > 0) {
       renderToast(queue.shift());
       activeCount++;
     }
   }

   function renderToast(item) {
     const container = document.getElementById('toast-container');
     const el = document.createElement('div');
     el.className = `toast toast--${item.type}`;
     el.dataset.toastId = item.id;

     const duration = item.durationMs > 0 ? item.durationMs : 0;

     el.innerHTML = `
       <span class="toast__icon">${ICONS[item.type] ?? 'ℹ'}</span>
       <div class="toast__body">
         <div class="toast__text">${item.text}</div>
         ${item.action
           ? `<button class="toast__action">${item.action.label}</button>`
           : ''}
       </div>
       <button class="toast__close">×</button>
       ${duration > 0
         ? `<div class="toast__timer" style="width:100%;animation-duration:${duration}ms"></div>`
         : ''}
     `;

     if (item.action) {
       el.querySelector('.toast__action').addEventListener('click', () => {
         item.action.callback?.();
         dismissToast(el);
       });
     }

     el.querySelector('.toast__close').addEventListener('click', () => {
       dismissToast(el);
     });

     container.appendChild(el);

     // Прикрепить функцию dismiss к объекту item
     item.dismiss = () => dismissToast(el);

     if (duration > 0) {
       setTimeout(() => dismissToast(el), duration);
     }
   }

   function dismissToast(el) {
     if (!el.isConnected) return;
     el.style.animation = 'toastIn 0.2s ease reverse forwards';
     el.addEventListener('animationend', () => {
       el.remove();
       activeCount = Math.max(0, activeCount - 1);
       processQueue();
     }, { once: true });
   }
   ```

4. Примеры вызовов из других модулей:
   ```js
   // Успех
   showToast('Построена акведук в Риме', 'success');

   // Ошибка с действием
   showToast('Недостаточно золота для найма', 'error');

   // С кнопкой действия
   showToast('Рим объявил войну!', 'warning', 6000, {
     label: 'Открыть дипломатию',
     callback: () => activateTab('diplomacy'),
   });

   // Бессрочный (закрывается только вручную)
   const t = showToast('Выберите цель для армии', 'info', 0);
   // позже:
   t.dismiss();
   ```

**Какие файлы затрагиваются:**
- `js/toast.js` — новый файл, `showToast`
- `index.html` — `#toast-container`
- `ui/styles.css` — `.toast`, `.toast-container` и дочерние классы
- Все модули, использующие уведомления — заменить `alert()` или прямые DOM-вставки на `showToast`

**Тест Шага 79:**
- `showToast('Тест', 'success')` показывает зелёный тост снизу-справа.
- Тост исчезает через 4 с с плавным обратным slide.
- Прогресс-бар истекает синхронно с таймером.
- При 5+ одновременных тостах лишние становятся в очередь.
- Тост с `durationMs: 0` не исчезает пока не нажать ×.
- Кнопка действия вызывает callback и закрывает тост.

---

## БЛОК AS — Строка состояния (Шаг 80)

---

### Шаг 80 — Статус-бар: ход, дата, ресурсы, сезон, режим карты

**Цель:** добавить постоянную строку состояния внизу экрана. В ней всегда видны: текущий ход, игровая дата (год), сезон, текущие ресурсы (кратко), активный режим карты, зум-уровень. Это информация которую нужно видеть не открывая панелей.

**Что сделать:**

1. HTML статус-бара в `index.html` (после `#map`):
   ```html
   <div id="status-bar" class="status-bar">
     <span id="status-turn"   class="sb-item">Ход 1</span>
     <span id="status-date"   class="sb-item">278 до н.э.</span>
     <span id="status-season" class="sb-item">🌿 Весна</span>
     <span class="sb-sep">|</span>
     <span id="status-gold"    class="sb-item sb-item--gold">💰 1200</span>
     <span id="status-army"    class="sb-item">⚔ 4500</span>
     <span class="sb-sep">|</span>
     <span id="status-mode"   class="sb-item">Обзор</span>
     <span id="status-zoom"   class="sb-item">Стратегический</span>
   </div>
   ```

2. CSS статус-бара:
   ```css
   .status-bar {
     position: fixed;
     bottom: 0;
     left: 0;
     right: 0;
     height: 28px;
     background: rgba(8,5,2,0.9);
     border-top: 1px solid rgba(200,170,90,0.15);
     display: flex;
     align-items: center;
     gap: 0;
     padding: 0 12px;
     z-index: 500;
     font-size: 12px;
     color: rgba(220,210,180,0.75);
     backdrop-filter: blur(4px);
   }
   .sb-item {
     padding: 0 10px;
     white-space: nowrap;
   }
   .sb-item--gold { color: rgba(200,170,90,0.85); }
   .sb-sep {
     color: rgba(200,170,90,0.2);
     padding: 0 2px;
   }
   ```

3. Функция `updateStatusBar()` — вызывается после каждого хода и при изменении состояния:
   ```js
   // js/status_bar.js
   import { getSeasonForTurn, SEASONS } from '../data/seasons.js';
   import { getKey } from './hotkeys.js';

   export function updateStatusBar() {
     const turn   = gameState.turn;
     const year   = 280 - turn;   // начало игры — 280 до н.э.
     const season = SEASONS[getSeasonForTurn(turn)];

     document.getElementById('status-turn').textContent =
       `Ход ${turn}`;
     document.getElementById('status-date').textContent =
       `${Math.abs(year)} ${year < 0 ? 'до н.э.' : 'н.э.'}`;
     document.getElementById('status-season').textContent =
       `${season.label}`;

     document.getElementById('status-gold').textContent =
       `${formatValue(gameState.resources.gold)} зол.`;
     document.getElementById('status-army').textContent =
       `${formatValue(getTotalArmySize())} юн.`;
   }

   export function updateStatusMode(modeLabel) {
     document.getElementById('status-mode').textContent = modeLabel;
   }

   export function updateStatusZoom(zoomLabel) {
     document.getElementById('status-zoom').textContent = zoomLabel;
   }
   ```

4. Синхронизировать статус-бар с остальными системами:
   ```js
   // Начальное состояние
   updateStatusBar();

   // После каждого хода
   eventBus.on('turnEnd', () => updateStatusBar());

   // При смене режима карты
   eventBus.on('mapModeChanged', ({ label }) => updateStatusMode(label));

   // При зуме
   leafletMap.on('zoomend', () => {
     const zoom = leafletMap.getZoom();
     const label = zoom <= 4 ? 'Стратегический' : zoom <= 6 ? 'Тактический' : 'Детальный';
     updateStatusZoom(label);
   });
   ```

5. Убедиться что карта не перекрывает статус-бар — добавить отступ снизу:
   ```css
   #map { padding-bottom: 28px; }
   /* или */
   #map { height: calc(100vh - 28px); }
   ```

**Какие файлы затрагиваются:**
- `js/status_bar.js` — новый файл, `updateStatusBar`
- `index.html` — `#status-bar`
- `ui/styles.css` — `.status-bar`, `.sb-item`
- `js/game.js` — вызов `updateStatusBar` после хода
- `js/map.js` — `zoomend` → `updateStatusZoom`

**Тест Шага 80:**
- После каждого хода номер хода и дата обновляются в статус-баре.
- Сезон меняется через 3–4 хода.
- Золото обновляется после начисления дохода.
- При зуме карты обновляется метка «Стратегический / Тактический / Детальный».
- Статус-бар не перекрывает контент карты.

---

