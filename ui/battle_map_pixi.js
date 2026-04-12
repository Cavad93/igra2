/* ═══════════════════════════════════════════════════════════
   battle_map_pixi.js — Pixi.js v8 Battle Map (arma.md)
   Шаг 1: инициализация Application + 6 контейнеров-слоёв
   Шаг 4: BIOMES палитра + getBiomeColor / getBiomeAt
   Шаг 5: renderTerrain — Canvas 2D → PIXI.Texture → Sprite
   Шаг 6: parchment overlay + vignette (TilingSprite + radial gradient)
   Шаг 8: renderRivers — Chaikin + Catmull-Rom → bezierCurveTo
   Шаг 9: renderRiversPolished — двойная линия (тень+вода) +
          буферные "блики" (sparkles) на ticker-анимации
   ═══════════════════════════════════════════════════════════ */

/**
 * Global singleton, populated by initBattleMap().
 *   BattleMap.app    — PIXI.Application instance
 *   BattleMap.layers — { bg, rivers, roads, forests, units, fx }
 */
var BattleMap = null;

/* ─────────────────────────────────────────────────────────
   Шаг 4 — Биомы (военная тёмная палитра)

   Массив отсортирован по возрастанию threshold. Для значения h ∈ [0,1]
   выбирается ПЕРВЫЙ биом, у которого h <= threshold. Последний биом
   (snow_peak) имеет threshold = 1.00, поэтому "хвост" гарантирован.
   ───────────────────────────────────────────────────────── */
var BIOMES = [
  { threshold: 0.10, name: 'deep_water',    color: 0x1a2a3a },
  { threshold: 0.20, name: 'shallow_water', color: 0x2a3f55 },
  { threshold: 0.35, name: 'wetland',       color: 0x3d5c3a },
  { threshold: 0.55, name: 'grassland',     color: 0x4a6b3f },
  { threshold: 0.68, name: 'forest',        color: 0x2d4a24 },
  { threshold: 0.80, name: 'hills',         color: 0x6b5a3a },
  { threshold: 0.90, name: 'mountain',      color: 0x7a6a5a },
  { threshold: 1.00, name: 'snow_peak',     color: 0xc8c0b0 }
];

/**
 * getBiomeColor(h)
 *
 * По значению высоты h ∈ [0, 1] возвращает { color, name } биома.
 * Первый биом в BIOMES, у которого h <= threshold.
 *
 * Значения за пределами [0, 1] clamp-ятся к границам (h<0 → deep_water,
 * h>1 → snow_peak). Non-finite → deep_water (безопасное дефолт-значение).
 *
 * @param {number} h  — значение высоты в [0, 1]
 * @returns {{color: number, name: string}}
 */
function getBiomeColor(h) {
  if (!Number.isFinite(h)) return { color: BIOMES[0].color, name: BIOMES[0].name };
  if (h < 0) h = 0;
  else if (h > 1) h = 1;
  for (let i = 0; i < BIOMES.length; i++) {
    if (h <= BIOMES[i].threshold) {
      return { color: BIOMES[i].color, name: BIOMES[i].name };
    }
  }
  // fallback (не должен достигаться при корректной палитре)
  const last = BIOMES[BIOMES.length - 1];
  return { color: last.color, name: last.name };
}

/**
 * getBiomeAt(heightmap, x, y)
 *
 * Возвращает биом в точке heightmap. Координаты clamp-ятся через getHeight()
 * из engine/noise.js (ожидается в глобале window.getHeight или require'нут
 * в модульной среде).
 *
 * @param {{data: Float32Array, width: number, height: number}} heightmap
 * @param {number} x
 * @param {number} y
 * @returns {{color: number, name: string}}
 */
function getBiomeAt(heightmap, x, y) {
  // getHeight определён в engine/noise.js. В браузере — глобал, в Node —
  // либо глобал (если файл загружен до этого), либо передаётся тестом
  // через контекст VM (см. tests/test_arma_stage4.mjs).
  var gh = (typeof getHeight !== 'undefined') ? getHeight : null;
  if (!gh && typeof globalThis !== 'undefined' && globalThis.getHeight) {
    gh = globalThis.getHeight;
  }
  if (!gh) {
    throw new Error('[getBiomeAt] getHeight() is not available — load engine/noise.js first');
  }
  const h = gh(heightmap, x, y);
  return getBiomeColor(h);
}

/* ─────────────────────────────────────────────────────────
   Шаг 5 — renderTerrain: биомы → пиксели → PIXI.Sprite

   Почему Canvas → Texture, а не Graphics:
     Pixi.js Graphics на каждый пиксель — десятки тысяч draw calls,
     это на два порядка медленнее прямой записи в ImageData.
     Canvas 2D imageData заполняется в один проход (O(w*h)),
     затем один раз конвертируется в GPU-текстуру через Texture.from().
   ───────────────────────────────────────────────────────── */

/**
 * fillTerrainPixels(heightmap)
 *
 * Чистая функция: по heightmap генерирует RGBA-массив Uint8ClampedArray
 * размером width*height*4, где для каждого пикселя цвет = биом по его высоте.
 * Альфа = 255 (непрозрачный). Порядок: [R,G,B,A, R,G,B,A, ...].
 *
 * Разделено из renderTerrain для (а) тестируемости без DOM/PIXI,
 * (б) возможности повторного использования (mini-map, экспорт PNG).
 *
 * @param {{data: Float32Array, width: number, height: number}} heightmap
 * @returns {Uint8ClampedArray}  — RGBA buffer длиной width*height*4
 */
function fillTerrainPixels(heightmap) {
  const w = heightmap.width | 0;
  const h = heightmap.height | 0;
  const data = heightmap.data;
  const out  = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const hv    = data[row + x];
      const biome = getBiomeColor(hv);
      const c     = biome.color;
      const i     = (row + x) * 4;
      out[i    ] = (c >> 16) & 0xFF;
      out[i + 1] = (c >>  8) & 0xFF;
      out[i + 2] =  c        & 0xFF;
      out[i + 3] = 255;
    }
  }

  return out;
}

/**
 * buildTerrainCanvas(heightmap)
 *
 * Создаёт HTMLCanvasElement размером heightmap.width × heightmap.height,
 * заполненный цветами биомов через putImageData. Возвращает canvas.
 *
 * @param {{data: Float32Array, width: number, height: number}} heightmap
 * @returns {HTMLCanvasElement}
 */
function buildTerrainCanvas(heightmap) {
  const w = heightmap.width | 0;
  const h = heightmap.height | 0;

  // Node-среда тестов может не иметь document — в этом случае тесты должны
  // использовать fillTerrainPixels напрямую и передавать свой canvas-мок.
  if (typeof document === 'undefined') {
    throw new Error('[buildTerrainCanvas] document is not available (non-DOM env)');
  }

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('[buildTerrainCanvas] getContext("2d") returned null');
  }

  const imageData = ctx.createImageData(w, h);
  const pixels    = fillTerrainPixels(heightmap);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * renderTerrain(app, layers, heightmap)
 *
 * Рисует рельеф в layers.bg:
 *   1. Строит Canvas 2D по heightmap (биом → RGBA).
 *   2. Конвертирует его в PIXI.Texture через Texture.from().
 *   3. Создаёт PIXI.Sprite, масштабирует под размер app.screen.
 *   4. Добавляет Sprite в layers.bg.
 *
 * Возвращает созданный Sprite (полезно для повторного использования
 * или удаления при смене seed).
 *
 * @param {PIXI.Application} app
 * @param {{bg: PIXI.Container}} layers
 * @param {{data: Float32Array, width: number, height: number}} heightmap
 * @returns {PIXI.Sprite}
 */
function renderTerrain(app, layers, heightmap) {
  if (!app || !layers || !layers.bg) {
    throw new Error('[renderTerrain] app/layers not initialised — call initBattleMap() first');
  }
  if (!heightmap || !heightmap.data || !heightmap.width || !heightmap.height) {
    throw new Error('[renderTerrain] invalid heightmap');
  }
  if (typeof PIXI === 'undefined') {
    throw new Error('[renderTerrain] PIXI is not loaded');
  }

  // 1. Canvas с цветами биомов.
  const canvas  = buildTerrainCanvas(heightmap);

  // 2. Canvas → GPU-текстура (Pixi v8).
  const texture = PIXI.Texture.from(canvas);

  // 3. Sprite, масштабированный под размер приложения.
  const sprite  = new PIXI.Sprite(texture);
  sprite.width  = app.screen.width;
  sprite.height = app.screen.height;

  // 4. Добавляем в фоновый слой.
  layers.bg.addChild(sprite);

  return sprite;
}

/* ─────────────────────────────────────────────────────────
   Шаг 6 — Parchment overlay + Vignette

   Цель (по arma.md):
     1) Пергаментная текстура (Paper003, CC0) как TilingSprite поверх
        terrain, blendMode='multiply', alpha=0.22 — даёт "старинный"
        тёплый бежевый оттенок.
     2) Виньет — радиальный градиент от прозрачного центра к
        тёмным краям (rgba(0,0,0,0.55)) — фокусирует взгляд в центре.

   Почему TilingSprite:
     Текстура пергамента 1024×1024, а экран может быть 800×600, 1920×1080
     и т.д. TilingSprite повторяет текстуру без растяжения — каждая ячейка
     остаётся резкой, что важно для органичности бумаги.

   Fallback-парчмент:
     Если `PIXI.Assets.load(url)` упал (offline / 404 / non-browser),
     собираем процедурный пергамент в Canvas 2D — тёплая бежевая база
     с shaded noise. Это гарантирует, что карта не останется "голой".
   ───────────────────────────────────────────────────────── */

/**
 * buildProceduralParchmentCanvas(size, seed)
 *
 * Собирает Canvas 2D size×size с процедурным пергаментом:
 *   — тёплая бежевая база (#d8c79a)
 *   — мелкий шум (светлые/тёмные пятна)
 *   — лёгкое виньетирование по краям тайла, чтобы при tiling не было швов
 *
 * Используется как fallback, когда реальная текстура Paper003 недоступна.
 *
 * @param {number} size  — сторона квадратного канваса (по умолчанию 256)
 * @param {number} seed  — целое, для детерминированного шума
 * @returns {HTMLCanvasElement}
 */
function buildProceduralParchmentCanvas(size, seed) {
  const S = (size | 0) || 256;
  if (typeof document === 'undefined') {
    throw new Error('[buildProceduralParchmentCanvas] document is not available');
  }
  const canvas = document.createElement('canvas');
  canvas.width  = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[buildProceduralParchmentCanvas] getContext("2d") null');

  // Тёплая бежевая база
  ctx.fillStyle = '#d8c79a';
  ctx.fillRect(0, 0, S, S);

  // Простой детерминированный PRNG (mulberry32)
  let s = ((seed | 0) || 1) >>> 0;
  function rnd() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Пиксельный шум поверх базы
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 24; // ±12
    d[i    ] = Math.max(0, Math.min(255, d[i    ] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.9));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.7));
    // alpha оставляем 255
  }
  ctx.putImageData(img, 0, 0);

  return canvas;
}

/**
 * loadParchmentTexture(url)
 *
 * Пытается загрузить текстуру пергамента через PIXI.Assets.load.
 * Если загрузка провалилась (нет PIXI.Assets, сеть, 404), возвращает
 * процедурный fallback через PIXI.Texture.from(proceduralCanvas).
 *
 * @param {string} [url='./textures/Paper003_1K_Color.jpg']
 * @returns {Promise<PIXI.Texture>}
 */
async function loadParchmentTexture(url) {
  const src = url || './textures/Paper003_1K_Color.jpg';
  if (typeof PIXI === 'undefined') {
    throw new Error('[loadParchmentTexture] PIXI is not loaded');
  }
  // Путь 1: PIXI.Assets.load (браузер, production)
  if (PIXI.Assets && typeof PIXI.Assets.load === 'function') {
    try {
      const tex = await PIXI.Assets.load(src);
      if (tex) return tex;
    } catch (e) {
      console.warn('[loadParchmentTexture] Assets.load failed, using procedural fallback:', e && e.message);
    }
  }
  // Путь 2: процедурный пергамент
  const canvas = buildProceduralParchmentCanvas(256, 42);
  return PIXI.Texture.from(canvas);
}

/**
 * renderParchmentOverlay(app, layers, texture)
 *
 * Создаёт TilingSprite с пергаментной текстурой, накрывает им всю
 * область app.screen, blendMode='multiply' + alpha=0.22, добавляет
 * в layers.bg (поверх terrain, под vignette).
 *
 * @param {PIXI.Application} app
 * @param {{bg: PIXI.Container}} layers
 * @param {PIXI.Texture} texture  — предварительно загруженная парчмент-текстура
 * @returns {PIXI.TilingSprite}
 */
function renderParchmentOverlay(app, layers, texture) {
  if (!app || !layers || !layers.bg) {
    throw new Error('[renderParchmentOverlay] app/layers not initialised');
  }
  if (!texture) {
    throw new Error('[renderParchmentOverlay] texture is required');
  }
  if (typeof PIXI === 'undefined' || !PIXI.TilingSprite) {
    throw new Error('[renderParchmentOverlay] PIXI.TilingSprite is not available');
  }

  // v8: новый object-конструктор TilingSprite
  const sprite = new PIXI.TilingSprite({
    texture: texture,
    width:   app.screen.width,
    height:  app.screen.height
  });

  sprite.blendMode = 'multiply';
  sprite.alpha     = 0.22;

  layers.bg.addChild(sprite);
  return sprite;
}

/**
 * buildVignetteCanvas(width, height)
 *
 * Создаёт Canvas 2D width×height с радиальным градиентом:
 *   центр: rgba(0,0,0,0)    — полностью прозрачный
 *   края:  rgba(0,0,0,0.55) — затемнение 55%
 *
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
function buildVignetteCanvas(width, height) {
  const w = width  | 0;
  const h = height | 0;
  if (typeof document === 'undefined') {
    throw new Error('[buildVignetteCanvas] document is not available');
  }
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[buildVignetteCanvas] getContext("2d") null');

  const cx = w / 2;
  const cy = h / 2;
  // Радиус до самого дальнего угла — чтобы градиент дотягивался до краёв.
  const rOuter = Math.sqrt(cx * cx + cy * cy);
  const rInner = Math.min(cx, cy) * 0.30; // центральное "ядро" без затемнения

  const grad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
  grad.addColorStop(0,   'rgba(0,0,0,0)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1,   'rgba(0,0,0,0.55)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  return canvas;
}

/**
 * renderVignette(app, layers)
 *
 * Собирает виньет-Canvas по размеру app.screen, конвертирует в
 * PIXI.Texture и добавляет Sprite поверх layers.bg (как последний
 * дочерний элемент — поверх parchment и terrain).
 *
 * @param {PIXI.Application} app
 * @param {{bg: PIXI.Container}} layers
 * @returns {PIXI.Sprite}
 */
function renderVignette(app, layers) {
  if (!app || !layers || !layers.bg) {
    throw new Error('[renderVignette] app/layers not initialised');
  }
  if (typeof PIXI === 'undefined') {
    throw new Error('[renderVignette] PIXI is not loaded');
  }
  const canvas  = buildVignetteCanvas(app.screen.width, app.screen.height);
  const texture = PIXI.Texture.from(canvas);
  const sprite  = new PIXI.Sprite(texture);
  sprite.width  = app.screen.width;
  sprite.height = app.screen.height;
  layers.bg.addChild(sprite);
  return sprite;
}

/**
 * renderTerrainOverlays(app, layers, [parchmentTexture], [opts])
 *
 * Удобный хелпер: добавляет к уже отрисованному terrain и parchment,
 * и vignette одним вызовом. Если parchmentTexture не передан —
 * загружает / генерирует его через loadParchmentTexture().
 *
 * Порядок детей в layers.bg после вызова (снизу вверх):
 *   [0] terrain sprite    — из Шага 5
 *   [1] parchment overlay — TilingSprite, multiply, α=0.22
 *   [2] vignette          — Sprite с радиальным градиентом
 *
 * @param {PIXI.Application} app
 * @param {{bg: PIXI.Container}} layers
 * @param {PIXI.Texture}  [parchmentTexture]
 * @returns {Promise<{parchment: PIXI.TilingSprite, vignette: PIXI.Sprite}>}
 */
async function renderTerrainOverlays(app, layers, parchmentTexture) {
  const tex = parchmentTexture || await loadParchmentTexture();
  const parchment = renderParchmentOverlay(app, layers, tex);
  const vignette  = renderVignette(app, layers);
  return { parchment, vignette };
}

/* ─────────────────────────────────────────────────────────
   Шаг 8 — River rendering: Chaikin smoothing + Catmull-Rom → Bezier

   Цель (по arma.md):
     Нарисовать реки как плавные кривые в layerRivers. Перед рендером
     точки пути сглаживаются алгоритмом Chaikin (3 итерации), затем по
     сглаженному пути строится цепочка cubic-Bezier сегментов методом
     Catmull-Rom → Bezier — так получается кривая, проходящая через
     ВСЕ опорные точки, без полилинии-зигзагов.

   Координаты:
     Исходные точки пути — в координатах heightmap (hm_x ∈ [0, hmW),
     hm_y ∈ [0, hmH)). На экран они проецируются простым растяжением:
        screenX = (hm_x / hmW) * app.screen.width
        screenY = (hm_y / hmH) * app.screen.height

   Ширина линии:
     river.width из generateRivers() — уже "1 + len/80". Клэмпим в
     [1, 3] px (требование из arma.md: "Ширина линии 1-3px").

   Pixi.js v8 API:
     В v8 нет lineStyle(); путь строится через moveTo/bezierCurveTo,
     затем один раз закрашивается g.stroke({ width, color, alpha }).
   ───────────────────────────────────────────────────────── */

/**
 * chaikinSmooth(points, iterations)
 *
 * Сглаживание Chaikin: на каждой итерации для каждой пары соседних
 * точек [P0, P1] создаёт две новые — Q (75/25) и R (25/75). Крайние
 * точки сохраняются. За 3 итерации зигзаги Perlin-потока превращаются
 * в плавную кривую, проходящую "между" исходных вершин.
 *
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [iterations=3]
 * @returns {Array<{x:number,y:number}>}
 */
function chaikinSmooth(points, iterations) {
  if (!Array.isArray(points) || points.length < 3) {
    return points ? points.slice() : [];
  }
  const iters = (iterations == null) ? 3 : (iterations | 0);
  let pts = points.slice();
  for (let k = 0; k < iters; k++) {
    const next = new Array(2 * (pts.length - 1) + 2);
    next[0] = pts[0];
    let j = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      next[j++] = { x: 0.75 * p0.x + 0.25 * p1.x,
                    y: 0.75 * p0.y + 0.25 * p1.y };
      next[j++] = { x: 0.25 * p0.x + 0.75 * p1.x,
                    y: 0.25 * p0.y + 0.75 * p1.y };
    }
    next[j] = pts[pts.length - 1];
    pts = next;
  }
  return pts;
}

/**
 * mapRiverPathToScreen(path, hmW, hmH, screenW, screenH)
 *
 * Чистая функция: преобразует массив точек heightmap-координат в
 * экранные координаты по простой пропорции. Ничего не рисует —
 * нужна для тестов и для композиции с chaikinSmooth.
 *
 * @param {Array<{x:number,y:number}>} path
 * @param {number} hmW
 * @param {number} hmH
 * @param {number} screenW
 * @param {number} screenH
 * @returns {Array<{x:number,y:number}>}
 */
function mapRiverPathToScreen(path, hmW, hmH, screenW, screenH) {
  if (!Array.isArray(path) || path.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) return [];
  const sx = screenW / hmW;
  const sy = screenH / hmH;
  const out = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    out[i] = { x: path[i].x * sx, y: path[i].y * sy };
  }
  return out;
}

/**
 * drawCatmullRomBezier(g, points)
 *
 * По массиву опорных точек (length >= 2) строит плавную кривую через
 * все точки: moveTo(p[0]), затем для каждого сегмента [p[i]..p[i+1]]
 * один cubic Bezier с контрольными точками:
 *     B1 = p[i]   + (p[i+1] - p[i-1]) / 6
 *     B2 = p[i+1] - (p[i+2] - p[i])   / 6
 * (стандартная аппроксимация Catmull-Rom → Bezier).
 * На границах "виртуальные" p[-1] = p[0] и p[n] = p[n-1].
 *
 * Для length === 2 вырождается в lineTo.
 *
 * @param {PIXI.Graphics|object} g — Pixi v8 Graphics (mockable в тестах)
 * @param {Array<{x:number,y:number}>} points
 */
function drawCatmullRomBezier(g, points) {
  const n = points.length;
  if (n < 2) return;
  g.moveTo(points[0].x, points[0].y);
  if (n === 2) {
    g.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < n ? i + 2 : n - 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

/**
 * renderRivers(app, layers, rivers, hmW, hmH)
 *
 * Рисует все реки в layers.rivers как плавные Bezier-кривые.
 * Каждая река — отдельный PIXI.Graphics в контейнере rivers, ширина
 * линии клэмпится в [1, 3] px. Для сглаживания применяется
 * chaikinSmooth(path, 3), затем Catmull-Rom → Bezier.
 *
 * @param {PIXI.Application} app
 * @param {{rivers: PIXI.Container}} layers
 * @param {Array<{path:Array<{x:number,y:number}>, width:number}>} rivers
 * @param {number} hmW  — ширина heightmap
 * @param {number} hmH  — высота heightmap
 * @returns {Array<PIXI.Graphics>}
 */
function renderRivers(app, layers, rivers, hmW, hmH) {
  if (!app || !layers || !layers.rivers) {
    throw new Error('[renderRivers] app/layers not initialised — call initBattleMap() first');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) {
    throw new Error('[renderRivers] PIXI.Graphics is not available');
  }
  if (!Array.isArray(rivers) || rivers.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderRivers] invalid heightmap dimensions');
  }

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const created = [];

  for (let r = 0; r < rivers.length; r++) {
    const river = rivers[r];
    if (!river || !Array.isArray(river.path) || river.path.length < 2) continue;

    // 1. heightmap → экран
    const mapped = mapRiverPathToScreen(river.path, hmW, hmH, screenW, screenH);
    // 2. Сглаживание Chaikin (3 итерации)
    const smoothed = chaikinSmooth(mapped, 3);
    if (smoothed.length < 2) continue;

    // 3. Ширина: river.width (1 + len/80) → клэмп [1, 3]
    let w = river.width;
    if (!(w > 0)) w = 1;
    if (w < 1) w = 1;
    if (w > 3) w = 3;

    // 4. Рисуем путь и закрашиваем stroke-ом (Pixi v8)
    const g = new PIXI.Graphics();
    drawCatmullRomBezier(g, smoothed);
    g.stroke({
      width: w,
      color: 0x2a5a8a,   // тёмно-синий (arma.md Шаг 8)
      alpha: 1.0,
      cap:   'round',
      join:  'round'
    });

    layers.rivers.addChild(g);
    created.push(g);
  }

  return created;
}

/* ─────────────────────────────────────────────────────────
   Шаг 9 — River polish: двойная линия + анимация течения

   Цель (по arma.md):
     1) Двойная линия — тёмный контур (width+2, 0x1a3a5a, α=0.9) +
        светлый «водный» верх (width, 0x4a8abf, α=0.7). Даёт глубину.
     2) Мерцание течения — редкие белые точки (0xffffff, α≈0.3,
        r≈1px) вдоль пути, анимируемые через app.ticker. Это
        упрощённый "шейдерный" вариант без GLSL.

   Почему Container-на-реку:
     Чтобы layers.rivers.children.length == rivers.length осталось
     истинным и группа из двух Graphics (outer+inner) убиралась/
     двигалась одним объектом.

   Sparkle-анимация:
     Блики описываются массивом лёгких объектов
       { groupIndex, phase∈[0,1), speed, radius }
     Каждая sparkle "бежит" по своему path линейно: при каждом
     тике drawRiverSparkles() очищает sparkleGraphics и перерисовывает
     все блики в текущей позиции u = (phase + t * speed) mod 1.
     Одна Graphics на всех sparkle'ов — это дёшево (десятки
     draw calls против сотен), FPS не проседает.
   ───────────────────────────────────────────────────────── */

/**
 * renderRiversPolished(app, layers, rivers, hmW, hmH)
 *
 * Рисует каждую реку как пару Graphics (тёмный контур + светлая
 * жила) в собственном PIXI.Container, добавленном в layers.rivers.
 * Каждый контейнер помечается полями _smoothed (сглаженный путь,
 * в экранных координатах) и _baseWidth — чтобы sparkle-анимация
 * могла переиспользовать эти данные без пересчётов.
 *
 * Порядок детей group (снизу вверх):
 *   [0] outerG — width+2, 0x1a3a5a, α=0.9, round cap/join
 *   [1] innerG — width,   0x4a8abf, α=0.7, round cap/join
 *
 * @param {PIXI.Application} app
 * @param {{rivers: PIXI.Container}} layers
 * @param {Array<{path:Array<{x:number,y:number}>, width:number}>} rivers
 * @param {number} hmW
 * @param {number} hmH
 * @returns {Array<PIXI.Container>}  — массив групп-контейнеров
 */
function renderRiversPolished(app, layers, rivers, hmW, hmH) {
  if (!app || !layers || !layers.rivers) {
    throw new Error('[renderRiversPolished] app/layers not initialised — call initBattleMap() first');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics || !PIXI.Container) {
    throw new Error('[renderRiversPolished] PIXI.Graphics/Container not available');
  }
  if (!Array.isArray(rivers) || rivers.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderRiversPolished] invalid heightmap dimensions');
  }

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const created = [];

  for (let r = 0; r < rivers.length; r++) {
    const river = rivers[r];
    if (!river || !Array.isArray(river.path) || river.path.length < 2) continue;

    // 1. heightmap → экран
    const mapped = mapRiverPathToScreen(river.path, hmW, hmH, screenW, screenH);
    // 2. Chaikin smoothing (3 итерации)
    const smoothed = chaikinSmooth(mapped, 3);
    if (smoothed.length < 2) continue;

    // 3. Ширина (клэмп в [1,3]) — как в Шаге 8
    let w = river.width;
    if (!(w > 0)) w = 1;
    if (w < 1) w = 1;
    if (w > 3) w = 3;

    // 4. Контейнер-группа
    const group = new PIXI.Container();

    // 5. Внешняя линия (тень / глубина)
    const outerG = new PIXI.Graphics();
    drawCatmullRomBezier(outerG, smoothed);
    outerG.stroke({
      width: w + 2,
      color: 0x1a3a5a,
      alpha: 0.9,
      cap:   'round',
      join:  'round'
    });
    group.addChild(outerG);

    // 6. Внутренняя линия (цвет воды)
    const innerG = new PIXI.Graphics();
    drawCatmullRomBezier(innerG, smoothed);
    innerG.stroke({
      width: w,
      color: 0x4a8abf,
      alpha: 0.7,
      cap:   'round',
      join:  'round'
    });
    group.addChild(innerG);

    // 7. Сохраняем исходные данные для sparkle-анимации
    group._smoothed  = smoothed;
    group._baseWidth = w;

    layers.rivers.addChild(group);
    created.push(group);
  }

  return created;
}

/**
 * buildRiverSparkles(riverGroups, opts)
 *
 * Создаёт массив описаний бликов. На реку — от 2 до
 * floor(len(smoothed) * density) бликов, но не более maxPerRiver
 * (чтобы длинные реки не разрастались). Общий счётчик бликов
 * клэмпится в maxTotal (ограничение на FPS-budget, arma.md).
 *
 * Поля sparkle:
 *   groupIndex — индекс в riverGroups
 *   phase      — начальное смещение ∈ [0, 1)
 *   speed      — скорость прогресса по path в единицах "u в мс"
 *                (1.0 = пройти весь путь за 1 мс; типично ~2e-4)
 *   radius     — радиус точки в px ∈ [0.8, 1.4]
 *
 * @param {Array<PIXI.Container>} riverGroups
 * @param {object} [opts]
 * @param {number} [opts.density=0.04]   — доля точек-бликов относительно len(smoothed)
 * @param {number} [opts.maxPerRiver=14]
 * @param {number} [opts.maxTotal=200]
 * @param {number} [opts.seed=1337]
 * @returns {Array<{groupIndex:number, phase:number, speed:number, radius:number}>}
 */
function buildRiverSparkles(riverGroups, opts) {
  if (!Array.isArray(riverGroups) || riverGroups.length === 0) return [];
  const o = opts || {};
  const density     = (o.density     > 0) ? o.density     : 0.04;
  const maxPerRiver = (o.maxPerRiver > 0) ? (o.maxPerRiver | 0) : 14;
  const maxTotal    = (o.maxTotal    > 0) ? (o.maxTotal    | 0) : 200;
  const seed        = (o.seed != null) ? (o.seed | 0) : 1337;

  // mulberry32 из engine/noise.js — в браузере глобал, в Node VM —
  // передан через контекст. Если его нет, используем простой fallback.
  let rnd;
  if (typeof mulberry32 === 'function') {
    rnd = mulberry32(seed);
  } else if (typeof globalThis !== 'undefined' && typeof globalThis.mulberry32 === 'function') {
    rnd = globalThis.mulberry32(seed);
  } else {
    // локальный fallback (не зависит от среды)
    let s = seed >>> 0 || 1;
    rnd = function() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const sparkles = [];
  for (let r = 0; r < riverGroups.length; r++) {
    const group = riverGroups[r];
    const pts   = group && group._smoothed;
    if (!pts || pts.length < 2) continue;

    let count = Math.floor(pts.length * density);
    if (count < 2) count = 2;
    if (count > maxPerRiver) count = maxPerRiver;

    for (let i = 0; i < count; i++) {
      if (sparkles.length >= maxTotal) return sparkles;
      sparkles.push({
        groupIndex: r,
        phase:      rnd(),                      // 0..1
        speed:      0.00015 + rnd() * 0.00025,  // u per ms
        radius:     0.8 + rnd() * 0.6           // 0.8..1.4 px
      });
    }
  }
  return sparkles;
}

/**
 * sampleSparklePosition(smoothed, u)
 *
 * Линейная интерполяция точки на path по нормализованной координате
 * u ∈ [0, 1]. Чистая функция — для тестируемости.
 *
 * @param {Array<{x:number,y:number}>} smoothed
 * @param {number} u
 * @returns {{x:number,y:number}|null}
 */
function sampleSparklePosition(smoothed, u) {
  if (!smoothed || smoothed.length < 2) return null;
  let uu = u;
  if (!(uu >= 0)) uu = 0;
  if (uu >= 1) uu = uu - Math.floor(uu);  // modulo 1
  const fi   = uu * (smoothed.length - 1);
  const i0   = fi | 0;
  const i1   = (i0 + 1 < smoothed.length) ? i0 + 1 : smoothed.length - 1;
  const frac = fi - i0;
  const p0   = smoothed[i0];
  const p1   = smoothed[i1];
  return {
    x: p0.x * (1 - frac) + p1.x * frac,
    y: p0.y * (1 - frac) + p1.y * frac
  };
}

/**
 * drawRiverSparkles(g, sparkles, riverGroups, t)
 *
 * Очищает Graphics и перерисовывает все блики в позициях,
 * соответствующих времени t (в мс). Sparkle перемещается по path
 * линейно: u = (phase + speed * t) mod 1.
 *
 * @param {PIXI.Graphics} g
 * @param {Array<object>} sparkles
 * @param {Array<PIXI.Container>} riverGroups
 * @param {number} t — время с начала анимации в мс
 */
function drawRiverSparkles(g, sparkles, riverGroups, t) {
  if (!g || typeof g.clear !== 'function') return;
  g.clear();
  if (!Array.isArray(sparkles) || sparkles.length === 0) return;
  if (!Array.isArray(riverGroups) || riverGroups.length === 0) return;

  for (let i = 0; i < sparkles.length; i++) {
    const sp = sparkles[i];
    const gr = riverGroups[sp.groupIndex];
    if (!gr || !gr._smoothed) continue;
    let u = sp.phase + sp.speed * t;
    u = u - Math.floor(u);   // mod 1
    const pos = sampleSparklePosition(gr._smoothed, u);
    if (!pos) continue;
    g.circle(pos.x, pos.y, sp.radius);
  }
  // Один fill на все circles — экономит draw calls.
  g.fill({ color: 0xffffff, alpha: 0.3 });
}

/**
 * startRiverSparkleTicker(app, layers, riverGroups, opts)
 *
 * Создаёт Graphics для бликов, добавляет его в layers.rivers поверх
 * всех групп рек, регистрирует ticker-handler, который обновляет
 * позиции бликов каждые `stepMs` миллисекунд (не каждый кадр —
 * экономит CPU). Возвращает объект с методом stop(), убирающим
 * handler и Graphics.
 *
 * @param {PIXI.Application} app
 * @param {{rivers: PIXI.Container, fx?: PIXI.Container}} layers
 * @param {Array<PIXI.Container>} riverGroups
 * @param {object} [opts]
 * @param {number} [opts.stepMs=33]  — минимальный интервал перерисовки
 * @param {object} [opts.sparkleOpts] — передаётся в buildRiverSparkles
 * @returns {{stop: Function, sparkles: Array, graphics: PIXI.Graphics}}
 */
function startRiverSparkleTicker(app, layers, riverGroups, opts) {
  if (!app || !app.ticker) {
    throw new Error('[startRiverSparkleTicker] app.ticker is required');
  }
  if (!layers || !layers.rivers) {
    throw new Error('[startRiverSparkleTicker] layers.rivers is required');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) {
    throw new Error('[startRiverSparkleTicker] PIXI.Graphics not available');
  }
  const o = opts || {};
  const stepMs = (o.stepMs > 0) ? o.stepMs : 33;

  const sparkles = buildRiverSparkles(riverGroups, o.sparkleOpts);
  const g = new PIXI.Graphics();
  layers.rivers.addChild(g);

  let t = 0;
  let accum = 0;
  // Pixi v8 ticker callback принимает PIXI.Ticker — читаем deltaMS
  const handler = function(ticker) {
    const dt = (ticker && typeof ticker.deltaMS === 'number')
      ? ticker.deltaMS
      : 16.6667;
    t     += dt;
    accum += dt;
    if (accum < stepMs) return;
    accum = 0;
    drawRiverSparkles(g, sparkles, riverGroups, t);
  };
  app.ticker.add(handler);
  // Первичная отрисовка (чтобы блики появились сразу, до первого тика)
  drawRiverSparkles(g, sparkles, riverGroups, 0);

  return {
    sparkles: sparkles,
    graphics: g,
    stop: function() {
      try { app.ticker.remove(handler); } catch (_) { /* noop */ }
      try {
        if (g.parent) g.parent.removeChild(g);
      } catch (_) { /* noop */ }
    }
  };
}

/* ─────────────────────────────────────────────────────────
   Шаг 12 — Road rendering: Chaikin smoothing + двойная линия

   Цель (по arma.md):
     Нарисовать дороги в Pixi.js как плавные линии с эффектом
     "грунтовки": для каждой дороги — две накладывающиеся линии,
     тёмный контур + светлый центр.

   Почему Chaikin (а не Catmull-Rom как для рек):
     Дороги — это рукотворные тракты, они должны выглядеть сглажено,
     но без "параболического" провисания между опорами. Chaikin
     срезает углы и быстро (3 итерации) превращает A*-зигзаг из
     8-связной сетки в плавную кривую, проходящую "близко" к исходным
     точкам. Для рек Catmull-Rom даёт более естественное течение,
     а для дорог достаточно простого срезания углов.

   API из arma.md:
     chaikin(points, iterations)            — публичный алиас
                                               (в модуле уже есть
                                               chaikinSmooth — алгоритмически
                                               идентичная функция из Шага 8;
                                               экспортируем оба имени).
     renderRoads(app, layers, roads, hmW, hmH)
       Для каждой дороги:
         1. Маппим heightmap → экран (через mapRiverPathToScreen —
            проекция идентичная, общая).
         2. Применяем chaikin(smoothed, 3).
         3. Создаём новый PIXI.Graphics:
              а) внешняя линия: moveTo + lineTo по сглаженному пути,
                 stroke({ width: 4, color: 0x2a1a0a, alpha: 0.8 })
              б) внутренняя линия (поверх):
                 stroke({ width: 2, color: 0x8a6a3a, alpha: 0.9 })
         4. Добавляем в layers.roads.
     Возвращает массив созданных Graphics.

   Pixi v8 API:
     В v8 нет lineStyle() — путь строится через moveTo/lineTo, затем
     замыкается вызовом stroke({...}). Чтобы получить "двойную линию",
     нужно ДВА раза пройти путь в одном Graphics: сначала outer stroke,
     затем inner stroke (каждый stroke применяется только к незавершённым
     path-операциям до него). Это стандартный приём для двухслойных
     линий в v8.
   ───────────────────────────────────────────────────────── */

/**
 * chaikin(points, iterations)
 *
 * Публичный алиас chaikinSmooth — по имени из спецификации
 * arma.md Шаг 12. Реализация одна: каждая итерация заменяет
 * каждую пару соседних точек на Q=0.75 P0 + 0.25 P1 и R=0.25 P0 + 0.75 P1,
 * крайние точки сохраняются. 3 итерации обычно дают плавную дугу.
 *
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [iterations=3]
 * @returns {Array<{x:number,y:number}>}
 */
function chaikin(points, iterations) {
  return chaikinSmooth(points, iterations == null ? 3 : iterations);
}

/**
 * drawPolyline(g, points)
 *
 * Собирает в Graphics путь из moveTo + lineTo по всем точкам.
 * Не вызывает stroke() — это ответственность вызывающего кода,
 * который добавляет нужный стиль (цвет/ширина/alpha).
 *
 * @param {PIXI.Graphics|object} g
 * @param {Array<{x:number,y:number}>} points
 */
function drawPolyline(g, points) {
  if (!points || points.length < 2) return;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i].x, points[i].y);
  }
}

/**
 * renderRoads(app, layers, roads, hmW, hmH)
 *
 * Рисует все дороги в layers.roads как двойную линию (тёмный контур +
 * светлый центр) поверх сглаженного Chaikin-пути. Каждая дорога —
 * один PIXI.Graphics в контейнере roads.
 *
 * Проекция heightmap → экран использует ту же пропорцию, что и реки
 * (mapRiverPathToScreen), чтобы дороги и реки совпадали по позициям.
 *
 * Короткие пути (< 2 точек) и пустой список — молча пропускаются.
 *
 * @param {PIXI.Application} app
 * @param {{roads: PIXI.Container}} layers
 * @param {Array<{path:Array<{x:number,y:number}>}>} roads
 * @param {number} hmW  — ширина heightmap
 * @param {number} hmH  — высота heightmap
 * @returns {Array<PIXI.Graphics>}  — массив созданных Graphics по одному на дорогу
 */
function renderRoads(app, layers, roads, hmW, hmH) {
  if (!app || !layers || !layers.roads) {
    throw new Error('[renderRoads] app/layers not initialised — call initBattleMap() first');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) {
    throw new Error('[renderRoads] PIXI.Graphics is not available');
  }
  if (!Array.isArray(roads) || roads.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderRoads] invalid heightmap dimensions');
  }

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const created = [];

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    if (!road || !Array.isArray(road.path) || road.path.length < 2) continue;

    // 1. heightmap → экранные координаты (общая проекция с реками).
    const mapped = mapRiverPathToScreen(road.path, hmW, hmH, screenW, screenH);
    // 2. Chaikin (3 итерации) — срезает зигзаги A* на 8-связной сетке.
    const smoothed = chaikin(mapped, 3);
    if (smoothed.length < 2) continue;

    // 3. Двойная линия в одном Graphics.
    const g = new PIXI.Graphics();

    // 3a. Внешний контур (тёмно-коричневый, ширина 4).
    drawPolyline(g, smoothed);
    g.stroke({
      width: 4,
      color: 0x2a1a0a,
      alpha: 0.8,
      cap:   'round',
      join:  'round'
    });

    // 3b. Внутренняя "дорожная" линия (светло-коричневая, ширина 2).
    // Второй проход path-ов, затем новый stroke — в Pixi v8 каждый
    // stroke применяется к накопленным moveTo/lineTo, поэтому нужно
    // повторить путь заново перед следующим stroke.
    drawPolyline(g, smoothed);
    g.stroke({
      width: 2,
      color: 0x8a6a3a,
      alpha: 0.9,
      cap:   'round',
      join:  'round'
    });

    layers.roads.addChild(g);
    created.push(g);
  }

  return created;
}

/**
 * initBattleMap(containerId, width, height)
 *
 * Creates a Pixi.js v8 Application, appends its canvas to the
 * DOM element with the given id, and sets up 6 rendering layers.
 *
 * @param {string} containerId  — id of the DOM container (e.g. 'pixi-battle-map')
 * @param {number} width        — canvas width in CSS pixels
 * @param {number} height       — canvas height in CSS pixels
 * @returns {Promise<object>}   — the BattleMap singleton
 */
async function initBattleMap(containerId, width, height) {
  // Prevent double-init
  if (BattleMap && BattleMap.app) {
    console.warn('[BattleMap] already initialised — call destroyBattleMap() first');
    return BattleMap;
  }

  // 1. Create Pixi Application (v8: two-step init)
  const app = new PIXI.Application();
  await app.init({
    width:           width,
    height:          height,
    antialias:       true,
    backgroundColor: 0x2d4a1e   // dark military green
  });

  // 2. Append canvas to DOM container
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('[BattleMap] container #' + containerId + ' not found');
  }
  container.appendChild(app.canvas);

  // 3. Create 6 layer containers (bottom → top render order)
  const layerBg      = new PIXI.Container();   // terrain (lowest)
  const layerRivers  = new PIXI.Container();   // rivers
  const layerRoads   = new PIXI.Container();   // roads
  const layerForests = new PIXI.Container();   // trees
  const layerUnits   = new PIXI.Container();   // battalions
  const layerFx      = new PIXI.Container();   // effects (topmost)

  app.stage.addChild(layerBg);
  app.stage.addChild(layerRivers);
  app.stage.addChild(layerRoads);
  app.stage.addChild(layerForests);
  app.stage.addChild(layerUnits);
  app.stage.addChild(layerFx);

  // Enable sortable children for layers that need Painter's algorithm
  layerForests.sortableChildren = true;
  layerUnits.sortableChildren   = true;

  // 4. Populate the global singleton
  BattleMap = {
    app: app,
    layers: {
      bg:      layerBg,
      rivers:  layerRivers,
      roads:   layerRoads,
      forests: layerForests,
      units:   layerUnits,
      fx:      layerFx
    }
  };

  console.log('[BattleMap] initialised — canvas', width + 'x' + height,
              '| layers:', Object.keys(BattleMap.layers).join(', '));

  return BattleMap;
}

/**
 * destroyBattleMap()
 *
 * Tears down the Pixi Application and clears the singleton.
 * Safe to call even if not initialised.
 */
function destroyBattleMap() {
  if (!BattleMap || !BattleMap.app) return;

  try {
    BattleMap.app.destroy(true, { children: true, texture: true });
  } catch (e) {
    console.warn('[BattleMap] destroy error:', e);
  }

  BattleMap = null;
  console.log('[BattleMap] destroyed');
}

// ──────────────────────────────────────────────────────────────────────
// Экспорт: глобалы (браузер) + module.exports (Node.js тесты)
// ──────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.BIOMES             = BIOMES;
  window.getBiomeColor      = getBiomeColor;
  window.getBiomeAt         = getBiomeAt;
  window.fillTerrainPixels  = fillTerrainPixels;
  window.buildTerrainCanvas = buildTerrainCanvas;
  window.renderTerrain      = renderTerrain;
  window.buildProceduralParchmentCanvas = buildProceduralParchmentCanvas;
  window.loadParchmentTexture = loadParchmentTexture;
  window.renderParchmentOverlay = renderParchmentOverlay;
  window.buildVignetteCanvas  = buildVignetteCanvas;
  window.renderVignette       = renderVignette;
  window.renderTerrainOverlays = renderTerrainOverlays;
  window.chaikinSmooth        = chaikinSmooth;
  window.mapRiverPathToScreen = mapRiverPathToScreen;
  window.drawCatmullRomBezier = drawCatmullRomBezier;
  window.renderRivers         = renderRivers;
  window.renderRiversPolished = renderRiversPolished;
  window.buildRiverSparkles   = buildRiverSparkles;
  window.sampleSparklePosition = sampleSparklePosition;
  window.drawRiverSparkles    = drawRiverSparkles;
  window.startRiverSparkleTicker = startRiverSparkleTicker;
  window.chaikin            = chaikin;
  window.drawPolyline       = drawPolyline;
  window.renderRoads        = renderRoads;
  window.initBattleMap      = initBattleMap;
  window.destroyBattleMap   = destroyBattleMap;
}
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    BIOMES, getBiomeColor, getBiomeAt,
    fillTerrainPixels, buildTerrainCanvas, renderTerrain,
    buildProceduralParchmentCanvas,
    loadParchmentTexture,
    renderParchmentOverlay,
    buildVignetteCanvas,
    renderVignette,
    renderTerrainOverlays,
    chaikinSmooth,
    mapRiverPathToScreen,
    drawCatmullRomBezier,
    renderRivers,
    renderRiversPolished,
    buildRiverSparkles,
    sampleSparklePosition,
    drawRiverSparkles,
    startRiverSparkleTicker,
    chaikin,
    drawPolyline,
    renderRoads,
    initBattleMap, destroyBattleMap
  };
}
