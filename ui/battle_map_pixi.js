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
export function fillTerrainPixels(heightmap) {
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
export function buildTerrainCanvas(heightmap) {
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
export function renderTerrain(app, layers, heightmap) {
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
export function buildProceduralParchmentCanvas(size, seed) {
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
export function renderParchmentOverlay(app, layers, texture) {
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
export function renderVignette(app, layers) {
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

/* ═════════════════════════════════════════════════════════════════════
   Шаг 15 (arma.md) — renderForests:
   Painter's algorithm (sort by Y) для индивидуальных деревьев.

   Принцип:
     1. Сортируем treePositions по возрастанию y (Painter's algorithm:
        дальние объекты рисуются первыми, ближние перекрывают их).
     2. Для каждой точки создаём PIXI.Graphics с 4 примитивами:
        тень (эллипс), крона (круг), блик (круг), ствол (прямоугольник).
     3. Устанавливаем tree.x / tree.y / tree.zIndex = screenY.
     4. Включаем layers.forests.sortableChildren = true (Pixi отсортирует
        детей по zIndex автоматически — это страховка к ручной сортировке
        перед добавлением).

   Координаты примитивов внутри Graphics — относительно (0, 0), потому
   что позиция всего объекта задаётся через tree.x / tree.y. Это важно
   для Painter's сортировки и для batch-рендера в Pixi.

   Параметры спрайта точно соответствуют arma.md Шаг 15:
     • тень:   ellipse(0, +6),  rgba(0,0,0,0.25), rx=7, ry=3
     • крона:  circle(0, 0),    0x1a3a14,         r=8
     • блик:   circle(-3, -3),  0x2d5a24, α=0.6,  r=4
     • ствол:  rect(-1.5, +5),  0x4a2800,         3×5
   ═════════════════════════════════════════════════════════════════════ */

/**
 * renderForests(app, layers, treePositions, hmW, hmH)
 *
 * Рисует индивидуальные деревья в layers.forests с правильным
 * перекрытием по Painter's algorithm (zIndex = screenY).
 *
 * @param {PIXI.Application} app
 * @param {{forests: PIXI.Container}} layers
 * @param {Array<{x:number,y:number}>} treePositions — позиции в координатах
 *        heightmap (как возвращает poissonDisk).
 * @param {number} hmW — ширина heightmap
 * @param {number} hmH — высота heightmap
 * @returns {Array<PIXI.Graphics>} массив созданных Graphics-объектов
 *          (по одному на дерево).
 */
function renderForests(app, layers, treePositions, hmW, hmH) {
  if (!app || !layers || !layers.forests) {
    throw new Error('[renderForests] app/layers not initialised — call initBattleMap() first');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) {
    throw new Error('[renderForests] PIXI.Graphics is not available');
  }
  if (!Array.isArray(treePositions) || treePositions.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderForests] invalid heightmap dimensions');
  }

  // Painter's algorithm: ближние (большой y) рисуются ПОСЛЕ дальних,
  // поэтому сортируем по возрастанию y. Создаём копию, чтобы не
  // мутировать вход.
  var sorted = treePositions.slice().sort(function(a, b) { return a.y - b.y; });

  // Включаем сортировку по zIndex — в Pixi v8 это перерисовывает
  // детей по zIndex при каждом render(). Дешёвая страховка на случай,
  // если кто-то добавит дерево после первичного рендера.
  layers.forests.sortableChildren = true;

  var screenW = app.screen.width;
  var screenH = app.screen.height;
  var sx = screenW / hmW;
  var sy = screenH / hmH;

  var created = [];

  for (var i = 0; i < sorted.length; i++) {
    var pt = sorted[i];
    if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;

    var screenX = pt.x * sx;
    var screenY = pt.y * sy;

    var g = new PIXI.Graphics();

    // a. Тень — эллипс (0, +6), rx=7, ry=3, rgba(0,0,0,0.25)
    g.ellipse(0, 6, 7, 3);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // b. Крона — круг (0, 0), r=8, 0x1a3a14
    g.circle(0, 0, 8);
    g.fill({ color: 0x1a3a14, alpha: 1.0 });

    // c. Блик кроны — круг (-3, -3), r=4, 0x2d5a24, α=0.6
    g.circle(-3, -3, 4);
    g.fill({ color: 0x2d5a24, alpha: 0.6 });

    // d. Ствол — прямоугольник (-1.5, +5), 3×5, 0x4a2800
    g.rect(-1.5, 5, 3, 5);
    g.fill({ color: 0x4a2800, alpha: 1.0 });

    g.x = screenX;
    g.y = screenY;
    g.zIndex = screenY;

    layers.forests.addChild(g);
    created.push(g);
  }

  return created;
}

/* ═════════════════════════════════════════════════════════════════════
   Шаг 17 (arma.md) — renderUnit / renderAllUnits:
   Рендер батальона как изометрического блока (ромб + 2 боковые грани),
   поверх — иконка типа войск, поверх — полоска HP.

   Структура контейнера юнита (PIXI.Container):
     ├─ Graphics #1 — 3 грани блока (top / left / right)
     ├─ Graphics #2 — иконка типа войск (infantry/cavalry/archers/cannon)
     └─ Graphics #3 — HP-бар (чёрный фон + цветная полоска)

   Размер ромба: w=40, h=20 px; глубина боковых граней — depth=8 px.
   Цвета сторон:
     • ally  base = 0x3a6a2a  → top ≈ *1.10 (lighter), left *0.70, right *0.80
     • enemy base = 0x6a2a2a  → аналогично

   HP-бар (arma.md):
     • чёрный фон: rect(-18, -22, 36, 4)
     • полоса:     rect(-18, -22, 36*(health/maxHealth), 4)
     • цвет: green >50%, yellow >25%, red ≤25%

   Painter's algorithm: container.zIndex = screenY.
   ═════════════════════════════════════════════════════════════════════ */

var UNIT_DIAMOND_W     = 40;
var UNIT_DIAMOND_H     = 20;
var UNIT_DIAMOND_DEPTH = 8;

// Базовые цвета для стороны (ally / enemy) — тёмно-зелёный / тёмно-красный,
// как указано в arma.md Шаг 17.
var UNIT_BASE_COLOR = {
  ally:  0x3a6a2a,
  enemy: 0x6a2a2a
};

// Цвета HP-полоски по порогам.
var UNIT_HP_GREEN  = 0x00cc00;
var UNIT_HP_YELLOW = 0xffcc00;
var UNIT_HP_RED    = 0xcc0000;
var UNIT_HP_BG     = 0x000000;

/**
 * _shadeColor(color, factor)
 *
 * Умножает каждую компоненту RGB на factor (0..2) с клампом [0, 255].
 * factor < 1 → темнее, > 1 → светлее.
 *
 * @param {number} color  — 0xRRGGBB
 * @param {number} factor — множитель яркости
 * @returns {number} 0xRRGGBB
 */
function _shadeColor(color, factor) {
  var r = (color >> 16) & 0xff;
  var g = (color >>  8) & 0xff;
  var b =  color        & 0xff;
  r = Math.round(r * factor); if (r > 255) r = 255; if (r < 0) r = 0;
  g = Math.round(g * factor); if (g > 255) g = 255; if (g < 0) g = 0;
  b = Math.round(b * factor); if (b > 255) b = 255; if (b < 0) b = 0;
  return (r << 16) | (g << 8) | b;
}

/**
 * _getHpColor(health, maxHealth)
 * Возвращает цвет полоски HP по процентному порогу (arma.md).
 */
function _getHpColor(health, maxHealth) {
  if (!(maxHealth > 0)) return UNIT_HP_RED;
  var pct = health / maxHealth;
  if (pct > 0.5)  return UNIT_HP_GREEN;
  if (pct > 0.25) return UNIT_HP_YELLOW;
  return UNIT_HP_RED;
}

/**
 * _drawUnitDiamond(g, side)
 *
 * Рисует изометрический блок (3 грани) в Graphics g, координаты
 * относительно (0,0) — верх-ромба на (0, -h/2).
 *
 * @param {PIXI.Graphics} g
 * @param {'ally'|'enemy'} side
 */
function _drawUnitDiamond(g, side) {
  var base = UNIT_BASE_COLOR[side];
  if (typeof base !== 'number') base = UNIT_BASE_COLOR.ally;

  var topColor   = _shadeColor(base, 1.10); // чуть светлее
  var leftColor  = _shadeColor(base, 0.70); // темнее на 30%
  var rightColor = _shadeColor(base, 0.80); // темнее на 20%

  var hw = UNIT_DIAMOND_W / 2; // 20
  var hh = UNIT_DIAMOND_H / 2; // 10
  var d  = UNIT_DIAMOND_DEPTH; // 8

  // Вершины ромба (top face):
  //   top    = ( 0, -hh)
  //   right  = ( hw, 0)
  //   bottom = ( 0,  hh)
  //   left   = (-hw, 0)

  // Left side face — параллелограмм:
  //   left(-hw, 0) → bottom(0, hh) → (0, hh+d) → (-hw, d)
  g.moveTo(-hw, 0);
  g.lineTo(0,   hh);
  g.lineTo(0,   hh + d);
  g.lineTo(-hw, d);
  g.lineTo(-hw, 0);
  g.fill({ color: leftColor, alpha: 1.0 });

  // Right side face — параллелограмм:
  //   right(hw, 0) → bottom(0, hh) → (0, hh+d) → (hw, d)
  g.moveTo(hw, 0);
  g.lineTo(0,  hh);
  g.lineTo(0,  hh + d);
  g.lineTo(hw, d);
  g.lineTo(hw, 0);
  g.fill({ color: rightColor, alpha: 1.0 });

  // Top face (ромб) — рисуется последним, чтобы перекрывать боковые.
  g.moveTo(0,   -hh);
  g.lineTo(hw,  0);
  g.lineTo(0,   hh);
  g.lineTo(-hw, 0);
  g.lineTo(0,   -hh);
  g.fill({ color: topColor, alpha: 1.0 });
}

/**
 * _drawUnitIcon(g, unitType)
 *
 * Рисует схематическую иконку типа войск поверх ромба (в координатах
 * Graphics, относительно (0,0) — центра ромба). Используется Graphics-
 * примитивы (линии/круги/прямоугольники), без PIXI.Text — чтобы модуль
 * оставался тестируемым без мока текста.
 *
 * @param {PIXI.Graphics} g
 * @param {'infantry'|'cavalry'|'archers'|'cannon'} unitType
 */
function _drawUnitIcon(g, unitType) {
  var ICON_COLOR = 0xffffff;
  var ICON_DARK  = 0x111111;

  if (unitType === 'infantry') {
    // Три вертикальные «пики»: три тонких прямоугольника.
    g.rect(-5, -6, 2, 8);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    g.rect(-1, -6, 2, 8);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    g.rect( 3, -6, 2, 8);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    return;
  }

  if (unitType === 'cavalry') {
    // Диагональная линия (через тонкий прямоугольник) + точка-наконечник.
    // Рисуем линию как полигон, чтобы не зависеть от mock-stroke.
    g.moveTo(-6, 4);
    g.lineTo(-4, 4);
    g.lineTo( 6, -6);
    g.lineTo( 4, -6);
    g.lineTo(-6, 4);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    // Наконечник-точка.
    g.circle(6, -6, 2);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    return;
  }

  if (unitType === 'archers') {
    // «Дуга + стрела»: круг как дуга (декоративно) + горизонтальный
    // прямоугольник + треугольник-наконечник.
    g.circle(0, 0, 5);
    g.fill({ color: ICON_DARK, alpha: 0.35 });
    g.rect(-5, -1, 8, 2);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    g.moveTo(3,  -3);
    g.lineTo(6,   0);
    g.lineTo(3,   3);
    g.lineTo(3,  -3);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    return;
  }

  if (unitType === 'cannon') {
    // Прямоугольник (корпус) + труба (узкий прямоугольник) + колесо.
    g.rect(-6, -2, 10, 5);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    g.rect( 4, -1, 4, 2);
    g.fill({ color: ICON_COLOR, alpha: 1.0 });
    g.circle(-3, 4, 2);
    g.fill({ color: ICON_DARK, alpha: 1.0 });
    return;
  }

  // Fallback (неизвестный тип) — маленький квадрат, чтобы не было
  // «пустой» иконки в отладке.
  g.rect(-3, -3, 6, 6);
  g.fill({ color: ICON_COLOR, alpha: 0.8 });
}

/**
 * _drawUnitHpBar(g, health, maxHealth)
 *
 * Чёрный фон (rect -18,-22, 36,4) + цветная полоса поверх
 * пропорциональной ширины.
 *
 * @param {PIXI.Graphics} g
 * @param {number} health
 * @param {number} maxHealth
 */
function _drawUnitHpBar(g, health, maxHealth) {
  g.rect(-18, -22, 36, 4);
  g.fill({ color: UNIT_HP_BG, alpha: 1.0 });

  var pct = (maxHealth > 0) ? (health / maxHealth) : 0;
  if (pct < 0) pct = 0;
  if (pct > 1) pct = 1;
  var w = 36 * pct;
  if (w > 0) {
    g.rect(-18, -22, w, 4);
    g.fill({ color: _getHpColor(health, maxHealth), alpha: 1.0 });
  }
}

/**
 * renderUnit(battalion, app, layers, hmW, hmH)
 *
 * Создаёт PIXI.Container для одного батальона и добавляет его в
 * layers.units. Внутри контейнера — три Graphics: блок, иконка, HP-бар.
 *
 * Координаты battalion.x/y заданы в пространстве heightmap;
 * преобразование в экранные идёт через sx = screenW/hmW, sy = screenH/hmH.
 *
 * @param {Battalion} battalion
 * @param {PIXI.Application} app
 * @param {{units: PIXI.Container}} layers
 * @param {number} hmW
 * @param {number} hmH
 * @returns {PIXI.Container}
 */
function renderUnit(battalion, app, layers, hmW, hmH) {
  if (!app || !layers || !layers.units) {
    throw new Error('[renderUnit] app/layers not initialised — call initBattleMap() first');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Container || !PIXI.Graphics) {
    throw new Error('[renderUnit] PIXI.Container/Graphics is not available');
  }
  if (!battalion || typeof battalion.x !== 'number' || typeof battalion.y !== 'number') {
    throw new Error('[renderUnit] invalid battalion');
  }
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderUnit] invalid heightmap dimensions');
  }

  var screenW = app.screen.width;
  var screenH = app.screen.height;
  var sx = screenW / hmW;
  var sy = screenH / hmH;
  var screenX = battalion.x * sx;
  var screenY = battalion.y * sy;

  var container = new PIXI.Container();

  // 1) Изометрический блок (3 грани).
  var blockG = new PIXI.Graphics();
  _drawUnitDiamond(blockG, battalion.side);
  container.addChild(blockG);

  // 2) Иконка типа войск.
  var iconG = new PIXI.Graphics();
  _drawUnitIcon(iconG, battalion.unitType);
  container.addChild(iconG);

  // 3) HP-бар.
  var hpG = new PIXI.Graphics();
  _drawUnitHpBar(hpG, battalion.health, battalion.maxHealth);
  container.addChild(hpG);

  container.x = screenX;
  container.y = screenY;
  container.zIndex = screenY;

  // Ссылки для последующего обновления (arma.md Шаг 18).
  container.battalionId = battalion.id;
  container._blockG = blockG;
  container._iconG  = iconG;
  container._hpG    = hpG;
  container._selectionG = null;

  // arma.md Шаг 18 — интерактивность по-умолчанию.
  // Настоящий обработчик pointerdown подключается в
  // attachBattleMapInteractions(state) — там есть ссылка на state.
  container.interactive = true;
  container.eventMode   = 'static';

  layers.units.addChild(container);
  return container;
}

/**
 * renderAllUnits(battalions, app, layers, hmW, hmH)
 *
 * Итерирует по массиву батальонов и рендерит каждый через renderUnit.
 * layers.units.sortableChildren ← true (Painter's algorithm).
 *
 * @returns {Array<PIXI.Container>}
 */
function renderAllUnits(battalions, app, layers, hmW, hmH) {
  if (!app || !layers || !layers.units) {
    throw new Error('[renderAllUnits] app/layers not initialised — call initBattleMap() first');
  }
  if (!Array.isArray(battalions) || battalions.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderAllUnits] invalid heightmap dimensions');
  }

  layers.units.sortableChildren = true;

  var created = [];
  for (var i = 0; i < battalions.length; i++) {
    var b = battalions[i];
    if (!b) continue;
    created.push(renderUnit(b, app, layers, hmW, hmH));
  }
  return created;
}

// ══════════════════════════════════════════════════════════════════════
// arma.md Шаг 18 — Взаимодействие: выбор и движение юнитов
//
// Public API:
//   createBattleMapState({ app, layers, battalions, containers, hmW, hmH })
//   attachBattleMapInteractions(state)
//   selectBattalion(id, state)
//   deselectAll(state)
//   onMapClick(globalPos, state)
//   redrawUnit(battalion, container, app, hmW, hmH)
//   stepBattleMapAnimations(state, delta)
//
// Чеклист (arma.md Шаг 18):
//   [1] renderUnit делает контейнер интерактивным
//       (interactive=true, eventMode='static').
//   [2] selectBattalion(id): снимает выделение с предыдущего юнита,
//       ставит isSelected = true, рисует пульсирующий жёлтый контур.
//   [3] onMapClick(e.global): если выбран — ставим цель движения
//       в state.moves[id], плавно лерпаем x, y.
//   [4] stepBattleMapAnimations(state, delta): двигает юнитов по lerp,
//       обновляет zIndex = container.y (Painter's algorithm).
//   [5] redrawUnit(battalion, container): пересоздаёт Graphics
//       (блок, иконка, HP) + при желании обновляет позицию.
// ══════════════════════════════════════════════════════════════════════

var SELECTION_OUTLINE_COLOR = 0xffcc00; // жёлтый

/**
 * _drawSelectionOutline(g)
 *
 * Рисует жёлтый ромбический контур чуть больше ромба юнита.
 * Контур — stroke, чтобы можно было мигать через alpha.
 */
function _drawSelectionOutline(g) {
  var hw = UNIT_DIAMOND_W / 2 + 3;
  var hh = UNIT_DIAMOND_H / 2 + 3;
  g.moveTo(0,   -hh);
  g.lineTo(hw,   0);
  g.lineTo(0,    hh);
  g.lineTo(-hw,  0);
  g.lineTo(0,   -hh);
  g.stroke({ width: 2, color: SELECTION_OUTLINE_COLOR, alpha: 1.0 });
}

function _addSelectionOutline(container) {
  if (!container) return null;
  if (container._selectionG) return container._selectionG;
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) return null;
  var g = new PIXI.Graphics();
  _drawSelectionOutline(g);
  g.alpha = 1.0;
  container._selectionG = g;
  if (typeof container.addChild === 'function') {
    container.addChild(g);
  } else if (container.children && container.children.push) {
    container.children.push(g);
  }
  return g;
}

function _removeSelectionOutline(container) {
  if (!container || !container._selectionG) return;
  var g = container._selectionG;
  if (container.children && container.children.length) {
    var idx = container.children.indexOf(g);
    if (idx >= 0) container.children.splice(idx, 1);
  }
  try {
    if (typeof g.destroy === 'function') g.destroy();
  } catch (_) { /* noop */ }
  container._selectionG = null;
}

/**
 * createBattleMapState(opts)
 *
 * Собирает объект-состояние тактической карты, объединяющий батальоны,
 * их контейнеры, ссылки на app/layers и словарь анимаций.
 *
 * @param {{ app:any, layers:any, battalions:Array, containers:Array,
 *           hmW:number, hmH:number }} opts
 * @returns {object} state
 */
function createBattleMapState(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('[createBattleMapState] opts required');
  }
  var app        = opts.app;
  var layers     = opts.layers;
  var battalions = Array.isArray(opts.battalions) ? opts.battalions : [];
  var containers = Array.isArray(opts.containers) ? opts.containers : [];
  var hmW        = opts.hmW;
  var hmH        = opts.hmH;

  if (battalions.length !== containers.length) {
    throw new Error('[createBattleMapState] battalions.length != containers.length');
  }

  var units = {};
  for (var i = 0; i < battalions.length; i++) {
    var b = battalions[i];
    var c = containers[i];
    if (!b || typeof b.id !== 'string') {
      throw new Error('[createBattleMapState] battalion without id at index ' + i);
    }
    units[b.id] = { battalion: b, container: c };
  }

  return {
    app:        app,
    layers:     layers,
    hmW:        hmW,
    hmH:        hmH,
    battalions: battalions,
    units:      units,
    selectedId: null,
    moves:      {},                // id → { startX, startY, targetX, targetY, t }
    pulse:      { phase: 0, alpha: 1 }
  };
}

/**
 * attachBattleMapInteractions(state)
 *
 * Подключает pointerdown-обработчики:
 *  • на каждый контейнер юнита → selectBattalion(id, state)
 *  • на app.stage → onMapClick(e.global, state) (если событие не
 *    помечено _unitHandled).
 *
 * Безопасно вызывать в тестовых окружениях, где у контейнеров нет
 * метода .on() — такие объекты просто пропускаются.
 */
function attachBattleMapInteractions(state) {
  if (!state || !state.units) return;

  Object.keys(state.units).forEach(function(id) {
    var unit = state.units[id];
    var container = unit && unit.container;
    if (!container) return;
    container.interactive = true;
    container.eventMode   = 'static';
    if (typeof container.on === 'function') {
      container.on('pointerdown', function(e) {
        if (e) {
          e._unitHandled = true;
          if (typeof e.stopPropagation === 'function') {
            try { e.stopPropagation(); } catch (_) { /* noop */ }
          }
        }
        selectBattalion(id, state);
      });
    }
  });

  var stage = state.app && state.app.stage;
  if (stage) {
    if ('eventMode' in stage) stage.eventMode = 'static';
    if (typeof stage.on === 'function') {
      stage.on('pointerdown', function(e) {
        if (e && e._unitHandled) return;
        if (state.selectedId == null) return;
        var g = e && e.global ? e.global : { x: 0, y: 0 };
        onMapClick(g, state);
      });
    }
  }
}

/**
 * selectBattalion(id, state)
 *
 * Снимает предыдущее выделение, ставит isSelected=true у выбранного
 * батальона, добавляет пульсирующий жёлтый контур.
 *
 * Клик по несуществующему id — no-op.
 */
function selectBattalion(id, state) {
  if (!state || !state.units) return;
  var unit = state.units[id];
  if (!unit) return;

  // Deselect previous
  if (state.selectedId != null && state.units[state.selectedId]) {
    var prev = state.units[state.selectedId];
    if (prev.battalion) prev.battalion.isSelected = false;
    _removeSelectionOutline(prev.container);
  }

  if (unit.battalion) unit.battalion.isSelected = true;
  state.selectedId = id;
  _addSelectionOutline(unit.container);
}

/**
 * deselectAll(state)
 *
 * Сбрасывает выделение без выбора нового юнита.
 */
function deselectAll(state) {
  if (!state) return;
  if (state.selectedId != null && state.units && state.units[state.selectedId]) {
    var prev = state.units[state.selectedId];
    if (prev.battalion) prev.battalion.isSelected = false;
    _removeSelectionOutline(prev.container);
  }
  state.selectedId = null;
}

/**
 * onMapClick(globalPos, state)
 *
 * Если есть выбранный юнит — ставит цель движения в state.moves[id].
 * Координаты клика — в пиксельном пространстве экрана; внутри
 * пересчитываются обратно в координаты heightmap для battalion.x/y.
 *
 * @returns {object|null} описание move-анимации или null, если движение
 *                       невозможно (нет выделения / невалидные размеры).
 */
function onMapClick(globalPos, state) {
  if (!state || state.selectedId == null) return null;
  if (!globalPos || typeof globalPos.x !== 'number' || typeof globalPos.y !== 'number') {
    return null;
  }
  var unit = state.units[state.selectedId];
  if (!unit || !unit.container || !unit.battalion) return null;

  var app = state.app;
  var screenW = app && app.screen ? app.screen.width  : 0;
  var screenH = app && app.screen ? app.screen.height : 0;
  if (!(screenW > 0) || !(screenH > 0) || !(state.hmW > 0) || !(state.hmH > 0)) {
    return null;
  }

  var sx = screenW / state.hmW;
  var sy = screenH / state.hmH;

  // Clamp target внутрь экрана.
  var tx = globalPos.x;
  var ty = globalPos.y;
  if (tx < 0) tx = 0;
  if (ty < 0) ty = 0;
  if (tx > screenW) tx = screenW;
  if (ty > screenH) ty = screenH;

  // Обновляем координаты батальона (heightmap-space) сразу —
  // визуальный контейнер догонит их анимацией.
  unit.battalion.x = tx / sx;
  unit.battalion.y = ty / sy;

  var move = {
    startX:  unit.container.x,
    startY:  unit.container.y,
    targetX: tx,
    targetY: ty,
    t:       0
  };
  state.moves[state.selectedId] = move;
  return move;
}

/**
 * redrawUnit(battalion, container, app, hmW, hmH)
 *
 * Перерисовывает Graphics-дочерние элементы контейнера (блок, иконка,
 * HP-бар) по текущим значениям battalion. Если переданы app/hmW/hmH —
 * также пересчитывает container.x/y и zIndex.
 *
 * @param {Battalion} battalion
 * @param {PIXI.Container} container
 * @param {PIXI.Application} [app]
 * @param {number} [hmW]
 * @param {number} [hmH]
 * @returns {PIXI.Container}
 */
function redrawUnit(battalion, container, app, hmW, hmH) {
  if (!battalion) throw new Error('[redrawUnit] battalion required');
  if (!container) throw new Error('[redrawUnit] container required');

  if (container._blockG && typeof container._blockG.clear === 'function') {
    container._blockG.clear();
    _drawUnitDiamond(container._blockG, battalion.side);
  }
  if (container._iconG && typeof container._iconG.clear === 'function') {
    container._iconG.clear();
    _drawUnitIcon(container._iconG, battalion.unitType);
  }
  if (container._hpG && typeof container._hpG.clear === 'function') {
    container._hpG.clear();
    _drawUnitHpBar(container._hpG, battalion.health, battalion.maxHealth);
  }

  if (app && app.screen && hmW > 0 && hmH > 0) {
    var sx = app.screen.width  / hmW;
    var sy = app.screen.height / hmH;
    container.x = battalion.x * sx;
    container.y = battalion.y * sy;
    container.zIndex = container.y;
  }

  return container;
}

/**
 * stepBattleMapAnimations(state, delta)
 *
 * Advance per-frame анимации тактической карты: движение юнитов и
 * пульсация жёлтого контура выделения.
 *
 * @param {object} state
 * @param {number} delta — коэффициент от Pixi ticker
 *                         (1.0 на 60Гц; в тестах можно передавать произвольный).
 */
function stepBattleMapAnimations(state, delta) {
  if (!state) return;
  if (typeof delta !== 'number' || !isFinite(delta) || delta < 0) delta = 0;

  // 1) Пульс контура.
  state.pulse.phase = (state.pulse.phase + delta * 0.05) % 1;
  state.pulse.alpha = 0.5 + 0.5 * Math.sin(state.pulse.phase * Math.PI * 2);

  if (state.selectedId != null && state.units && state.units[state.selectedId]) {
    var selected = state.units[state.selectedId];
    if (selected.container && selected.container._selectionG) {
      selected.container._selectionG.alpha = state.pulse.alpha;
    }
  }

  // 2) Движение юнитов (lerp, t += delta * 0.05).
  if (!state.moves) return;
  var ids = Object.keys(state.moves);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var m  = state.moves[id];
    var u  = state.units ? state.units[id] : null;
    if (!u || !u.container) { delete state.moves[id]; continue; }

    m.t += delta * 0.05;
    if (m.t > 1) m.t = 1;

    var c = u.container;
    c.x = m.startX + (m.targetX - m.startX) * m.t;
    c.y = m.startY + (m.targetY - m.startY) * m.t;
    c.zIndex = c.y;

    if (m.t >= 1) {
      // Синхронизация — battalion.x уже был выставлен в onMapClick.
      delete state.moves[id];
    }
  }

  // 3) Плавающие числа урона (arma.md Шаг 19).
  //    text.y -= delta * 1.5; text.alpha -= delta * 0.03.
  //    При alpha <= 0 — удаление из layer.fx и списка state.damageNumbers.
  if (state.damageNumbers && state.damageNumbers.length) {
    for (var di = state.damageNumbers.length - 1; di >= 0; di--) {
      var dt = state.damageNumbers[di];
      if (!dt) { state.damageNumbers.splice(di, 1); continue; }
      dt.y     -= delta * 1.5;
      dt.alpha -= delta * 0.03;
      if (dt.alpha <= 0) {
        dt.alpha = 0;
        if (dt.parent && dt.parent.children) {
          var idxD = dt.parent.children.indexOf(dt);
          if (idxD >= 0) dt.parent.children.splice(idxD, 1);
        }
        try { if (typeof dt.destroy === 'function') dt.destroy(); } catch (_) { /* noop */ }
        state.damageNumbers.splice(di, 1);
      }
    }
  }

  // 4) Aim-line dash-offset (arma.md Шаг 19): бегущий пунктир.
  //    Если у state есть aimLine — мигаем alpha, чтобы пунктир "жил".
  if (state.aimLine && state.aimLine.graphics) {
    var ag = state.aimLine.graphics;
    // Плавная пульсация 0.4..0.9 (не задевает саму геометрию, только alpha).
    state.aimLine.phase = ((state.aimLine.phase || 0) + delta * 0.08) % 1;
    ag.alpha = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(state.aimLine.phase * Math.PI * 2));
  }
}

/* ═════════════════════════════════════════════════════════════════════
   Шаг 19 (arma.md) — Укрепления и эффекты атаки:
     1. renderFortifications(app, layers, forts, hmW, hmH):
        Для каждого fort (3..5 точек вокруг города):
          • Ломаная линия stroke({ width:2, color:0x8a0000, alpha:0.9 }).
          • Шипы вдоль линии каждые ~8px — треугольники высотой 5 px,
            направленные наружу от центра fort.
        Добавляется в layers.roads (под деревьями, над terrain).
     2. emitDamageNumber(layers, x, y, amount, opts):
        Создаёт PIXI.Text(amount) в layers.fx. При передаче opts.state
        добавляет в state.damageNumbers — stepBattleMapAnimations
        анимирует text.y -= 1.5*δ, text.alpha -= 0.03*δ, удаляет по alpha<=0.
     3. drawAimLine(layers, fromUnit, toUnit):
        Пунктирная оранжевая линия от fromUnit к toUnit в layers.fx.
        Реализация — moveTo/lineTo с чередованием 6px dash / 6px gap,
        затем один stroke({ width:1, color:0xff8800, alpha:0.7 }).
     4. removeAimLine(layers, g): удаляет Graphics из layers.fx.children.
   ═════════════════════════════════════════════════════════════════════ */

var FORT_STROKE_COLOR = 0x8a0000; // тёмно-красный
var FORT_SPIKE_STEP   = 8;        // шаг между шипами вдоль линии, px
var FORT_SPIKE_H      = 5;        // высота шипа наружу, px
var FORT_SPIKE_BASE   = 2;        // полуширина основания шипа, px

/**
 * renderFortifications(app, layers, forts, hmW, hmH)
 *
 * Рисует красные шипастые линии обороны вокруг городов в layers.roads.
 * Каждый fort = {center:{x,y}, points:[{x,y},...]} (см. generateFortifications
 * из engine/fortifications.js).
 *
 * Координаты points / center — в heightmap-пространстве; функция
 * проецирует их на screen через app.screen.width/height.
 *
 * @param {PIXI.Application} app
 * @param {{roads: PIXI.Container}} layers
 * @param {Array<{center:{x:number,y:number}, points:Array<{x:number,y:number}>}>} forts
 * @param {number} hmW
 * @param {number} hmH
 * @returns {Array<PIXI.Graphics>}
 */
function renderFortifications(app, layers, forts, hmW, hmH) {
  if (!app || !layers || !layers.roads) {
    throw new Error('[renderFortifications] app/layers not initialised — call initBattleMap() first');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) {
    throw new Error('[renderFortifications] PIXI.Graphics is not available');
  }
  if (!Array.isArray(forts) || forts.length === 0) return [];
  if (!(hmW > 0) || !(hmH > 0)) {
    throw new Error('[renderFortifications] invalid heightmap dimensions');
  }

  var screenW = app.screen.width;
  var screenH = app.screen.height;
  var sx = screenW / hmW;
  var sy = screenH / hmH;

  var created = [];

  for (var f = 0; f < forts.length; f++) {
    var fort = forts[f];
    if (!fort || !Array.isArray(fort.points) || fort.points.length < 2) continue;

    // heightmap → screen
    var mapped = [];
    for (var p = 0; p < fort.points.length; p++) {
      var pt = fort.points[p];
      if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
      mapped.push({ x: pt.x * sx, y: pt.y * sy });
    }
    if (mapped.length < 2) continue;

    var cx = (fort.center && typeof fort.center.x === 'number') ? fort.center.x * sx : mapped[0].x;
    var cy = (fort.center && typeof fort.center.y === 'number') ? fort.center.y * sy : mapped[0].y;

    var g = new PIXI.Graphics();

    // 1) Ломаная линия обороны.
    g.moveTo(mapped[0].x, mapped[0].y);
    for (var m = 1; m < mapped.length; m++) {
      g.lineTo(mapped[m].x, mapped[m].y);
    }
    g.stroke({
      width: 2,
      color: FORT_STROKE_COLOR,
      alpha: 0.9,
      cap:   'round',
      join:  'round'
    });

    // 2) Шипы наружу: по сегментам (mapped[i] → mapped[i+1]) каждые
    //    FORT_SPIKE_STEP px ставим треугольник высотой FORT_SPIKE_H,
    //    направленный в ту сторону перпендикуляра, которая "от центра".
    for (var s = 0; s < mapped.length - 1; s++) {
      var a  = mapped[s];
      var b  = mapped[s + 1];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) continue;

      var tx = dx / len;   // tangent
      var ty = dy / len;
      var nx = -ty;        // normal (90° CCW)
      var ny =  tx;

      // Сколько шипов помещается: хотя бы 1 на сегмент.
      var count = Math.max(1, Math.floor(len / FORT_SPIKE_STEP));
      for (var t = 0; t < count; t++) {
        var u   = (t + 0.5) / count;
        var px  = a.x + dx * u;
        var py  = a.y + dy * u;

        // Сторона "наружу" — та, где скалярное произведение
        // (midpoint - center) · normal положительно.
        var ox = px - cx;
        var oy = py - cy;
        var sign = ((ox * nx + oy * ny) >= 0) ? 1 : -1;

        var tipX = px + nx * sign * FORT_SPIKE_H;
        var tipY = py + ny * sign * FORT_SPIKE_H;

        var b1x = px - tx * FORT_SPIKE_BASE;
        var b1y = py - ty * FORT_SPIKE_BASE;
        var b2x = px + tx * FORT_SPIKE_BASE;
        var b2y = py + ty * FORT_SPIKE_BASE;

        g.moveTo(b1x, b1y);
        g.lineTo(tipX, tipY);
        g.lineTo(b2x, b2y);
        g.lineTo(b1x, b1y);
        g.fill({ color: FORT_STROKE_COLOR, alpha: 0.9 });
      }
    }

    layers.roads.addChild(g);
    created.push(g);
  }

  return created;
}

/**
 * emitDamageNumber(layers, x, y, amount, opts)
 *
 * Создаёт плавающее число урона (PIXI.Text) в layers.fx на позиции (x, y).
 * Если передан opts.state — регистрирует текст в state.damageNumbers,
 * чтобы stepBattleMapAnimations мог его двигать/угашать.
 *
 * @param {{fx: PIXI.Container}} layers
 * @param {number} x — экранные координаты
 * @param {number} y
 * @param {number} amount — величина урона
 * @param {{state?: object}} [opts]
 * @returns {PIXI.Text}
 */
function emitDamageNumber(layers, x, y, amount, opts) {
  if (!layers || !layers.fx) {
    throw new Error('[emitDamageNumber] layers.fx required');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Text) {
    throw new Error('[emitDamageNumber] PIXI.Text not available');
  }
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error('[emitDamageNumber] x/y must be numbers');
  }

  var text = new PIXI.Text({
    text:  String(amount),
    style: {
      fill:       0xff4444,
      fontSize:   14,
      fontFamily: 'serif',
      fontWeight: 'bold'
    }
  });
  text.x = x;
  text.y = y;
  text.alpha = 1;

  if (typeof layers.fx.addChild === 'function') {
    layers.fx.addChild(text);
  } else if (layers.fx.children && layers.fx.children.push) {
    layers.fx.children.push(text);
    text.parent = layers.fx;
  }

  var state = opts && opts.state;
  if (state) {
    if (!Array.isArray(state.damageNumbers)) state.damageNumbers = [];
    state.damageNumbers.push(text);
  }

  return text;
}

/**
 * _drawDashedLine(g, x0, y0, x1, y1, dash)
 *
 * Рисует пунктир вдоль отрезка (x0,y0)→(x1,y1): чередование dash/gap
 * длиной dash (обычно 6 px) через moveTo/lineTo. stroke() вызывает
 * caller'ом ОДИН раз после накопления всех отрезков.
 *
 * Pixi v8 не поддерживает dashed stroke натирно — стандартный приём
 * (описан в Pixi docs и discussions) — именно последовательные
 * moveTo/lineTo с перерывами.
 */
function _drawDashedLine(g, x0, y0, x1, y1, dash) {
  var dx = x1 - x0;
  var dy = y1 - y0;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return;
  var ux = dx / len;
  var uy = dy / len;
  var step = (dash > 0) ? dash : 6;

  var pos = 0;
  var drawSegment = true;
  while (pos < len) {
    var next = pos + step;
    if (next > len) next = len;
    if (drawSegment) {
      g.moveTo(x0 + ux * pos,  y0 + uy * pos);
      g.lineTo(x0 + ux * next, y0 + uy * next);
    }
    pos = next;
    drawSegment = !drawSegment;
  }
}

/**
 * drawAimLine(layers, fromUnit, toUnit)
 *
 * Рисует пунктирную оранжевую линию от fromUnit к toUnit.
 * Точки берутся у .container.x/y, если контейнер есть; иначе — .x/.y.
 *
 * @param {{fx: PIXI.Container}} layers
 * @param {object} fromUnit — {container:{x,y}} или {x,y}
 * @param {object} toUnit
 * @returns {PIXI.Graphics}
 */
function drawAimLine(layers, fromUnit, toUnit) {
  if (!layers || !layers.fx) {
    throw new Error('[drawAimLine] layers.fx required');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Graphics) {
    throw new Error('[drawAimLine] PIXI.Graphics not available');
  }
  if (!fromUnit || !toUnit) {
    throw new Error('[drawAimLine] fromUnit and toUnit required');
  }

  function _coord(u) {
    if (u.container && typeof u.container.x === 'number' && typeof u.container.y === 'number') {
      return { x: u.container.x, y: u.container.y };
    }
    return { x: u.x, y: u.y };
  }
  var f = _coord(fromUnit);
  var t = _coord(toUnit);
  if (typeof f.x !== 'number' || typeof f.y !== 'number' ||
      typeof t.x !== 'number' || typeof t.y !== 'number') {
    throw new Error('[drawAimLine] fromUnit/toUnit have no numeric coordinates');
  }

  var g = new PIXI.Graphics();
  g._isAimLine = true;

  _drawDashedLine(g, f.x, f.y, t.x, t.y, 6);
  g.stroke({ width: 1, color: 0xff8800, alpha: 0.7 });

  if (typeof layers.fx.addChild === 'function') {
    layers.fx.addChild(g);
  } else if (layers.fx.children && layers.fx.children.push) {
    layers.fx.children.push(g);
    g.parent = layers.fx;
  }

  return g;
}

/**
 * removeAimLine(layers, g)
 *
 * Удаляет Graphics пунктирной линии из layers.fx (если он там есть).
 */
function removeAimLine(layers, g) {
  if (!layers || !layers.fx || !g) return;
  if (layers.fx.children && layers.fx.children.length) {
    var idx = layers.fx.children.indexOf(g);
    if (idx >= 0) layers.fx.children.splice(idx, 1);
  }
  try { if (typeof g.destroy === 'function') g.destroy(); } catch (_) { /* noop */ }
}

/* ═════════════════════════════════════════════════════════════════════
   Шаг 20 (arma.md) — Полировка: HiDPI, Ticker, offscreen terrain cache,
                      интеграция с основной игрой.

     1. HiDPI / Retina:
        dpr = window.devicePixelRatio || 1;
        app.init({ resolution: dpr, autoDensity: true, ... })
        Pixi v8 автоматически масштабирует canvas под DPR.

     2. Offscreen terrain cache (renderTerrainCached):
        Первый вызов с данной cacheKey строит Canvas→Texture, оборачивает
        в Sprite и вкладывает в layers.bg. Последующие вызовы с той же
        cacheKey повторно используют уже построенную PIXI.Texture
        (новый Sprite — в layers.bg). При смене cacheKey кеш сбрасывается.

     3. Ticker handlers:
        BattleMap.tickerHandlers — массив {fn, ctx}; мастер-callback,
        вложенный в app.ticker.add(masterTick), прогоняет их по одному.
        addBattleMapTicker(fn) / removeBattleMapTicker(fn) —
        публичный API. pauseBattleMap() / resumeBattleMap() —
        app.ticker.stop() / start(), используются при скрытии/показе
        тактического оверлея.

     4. Интеграция:
        ui/tactical_map.js::openTacticalMap() вызывает initBattleMap();
        endTacticalBattle() вызывает destroyBattleMap().
   ═════════════════════════════════════════════════════════════════════ */

// Offscreen terrain cache — одна текстура на (seed × width × height).
var TERRAIN_TEXTURE_CACHE = {
  key:     null,      // строка-ключ (например: 'seed:42:800x600')
  texture: null       // PIXI.Texture (кешированная)
};

/**
 * clearTerrainCache()
 *
 * Полностью сбрасывает offscreen-кеш terrain. Destroy у закешированной
 * PIXI.Texture вызывается безопасно (игнорируем ошибку, если уже мёртвая).
 */
function clearTerrainCache() {
  if (TERRAIN_TEXTURE_CACHE.texture) {
    try {
      if (typeof TERRAIN_TEXTURE_CACHE.texture.destroy === 'function') {
        TERRAIN_TEXTURE_CACHE.texture.destroy(true);
      }
    } catch (_) { /* noop */ }
  }
  TERRAIN_TEXTURE_CACHE.key     = null;
  TERRAIN_TEXTURE_CACHE.texture = null;
}

/**
 * renderTerrainCached(app, layers, heightmap, cacheKey)
 *
 * Обёртка над renderTerrain, переиспользующая PIXI.Texture на один и тот
 * же cacheKey. Нужна при повторном открытии карты с теми же параметрами
 * (экономит 20..40 мс на 800×600 heightmap).
 *
 * Если cacheKey !== TERRAIN_TEXTURE_CACHE.key — кеш сбрасывается и
 * строится заново через fillTerrainPixels → Canvas → PIXI.Texture.from.
 *
 * @param {PIXI.Application} app
 * @param {{bg: PIXI.Container}} layers
 * @param {{data: Float32Array, width: number, height: number}} heightmap
 * @param {string} cacheKey
 * @returns {PIXI.Sprite}
 */
export function renderTerrainCached(app, layers, heightmap, cacheKey) {
  if (!app || !layers || !layers.bg) {
    throw new Error('[renderTerrainCached] app/layers not initialised');
  }
  if (!heightmap || !heightmap.data || !heightmap.width || !heightmap.height) {
    throw new Error('[renderTerrainCached] invalid heightmap');
  }
  if (typeof PIXI === 'undefined' || !PIXI.Sprite || !PIXI.Texture) {
    throw new Error('[renderTerrainCached] PIXI is not loaded');
  }

  var key = String(cacheKey || ('' + heightmap.width + 'x' + heightmap.height));

  // Miss → (re)build.
  if (TERRAIN_TEXTURE_CACHE.key !== key || !TERRAIN_TEXTURE_CACHE.texture) {
    clearTerrainCache();
    var canvas  = buildTerrainCanvas(heightmap);
    var texture = PIXI.Texture.from(canvas);
    TERRAIN_TEXTURE_CACHE.key     = key;
    TERRAIN_TEXTURE_CACHE.texture = texture;
  }

  var sprite = new PIXI.Sprite(TERRAIN_TEXTURE_CACHE.texture);
  sprite.width  = app.screen.width;
  sprite.height = app.screen.height;
  layers.bg.addChild(sprite);
  return sprite;
}

/**
 * addBattleMapTicker(fn)
 *
 * Регистрирует per-frame callback у глобального мастер-тика, установленного
 * в initBattleMap. Значение delta из Pixi ticker передаётся в fn.
 * Возвращает сам fn (для последующей передачи в removeBattleMapTicker).
 *
 * Если BattleMap ещё не инициализирован — noop, возвращает null.
 *
 * @param {function(number):void} fn
 * @returns {function(number):void|null}
 */
function addBattleMapTicker(fn) {
  if (!BattleMap || !BattleMap.tickerHandlers) return null;
  if (typeof fn !== 'function') return null;
  if (BattleMap.tickerHandlers.indexOf(fn) === -1) {
    BattleMap.tickerHandlers.push(fn);
  }
  return fn;
}

/**
 * removeBattleMapTicker(fn)
 *
 * Снимает ранее зарегистрированный callback. Возвращает true если удалён.
 *
 * @param {function(number):void} fn
 * @returns {boolean}
 */
function removeBattleMapTicker(fn) {
  if (!BattleMap || !BattleMap.tickerHandlers) return false;
  var idx = BattleMap.tickerHandlers.indexOf(fn);
  if (idx === -1) return false;
  BattleMap.tickerHandlers.splice(idx, 1);
  return true;
}

/**
 * pauseBattleMap()
 *
 * Останавливает Pixi ticker (на время сокрытия карты). Safe-noop если
 * карта не инициализирована.
 */
function pauseBattleMap() {
  if (!BattleMap || !BattleMap.app || !BattleMap.app.ticker) return;
  try { BattleMap.app.ticker.stop(); } catch (_) { /* noop */ }
}

/**
 * resumeBattleMap()
 *
 * Перезапускает Pixi ticker после pauseBattleMap. Safe-noop если карта
 * не инициализирована.
 */
function resumeBattleMap() {
  if (!BattleMap || !BattleMap.app || !BattleMap.app.ticker) return;
  try { BattleMap.app.ticker.start(); } catch (_) { /* noop */ }
}

/**
 * initBattleMap(containerId, width, height, opts?)
 *
 * Creates a Pixi.js v8 Application, appends its canvas to the
 * DOM element with the given id, and sets up 6 rendering layers.
 *
 * Шаг 20 (arma.md):
 *   • HiDPI через window.devicePixelRatio + autoDensity: true.
 *   • Глобальный ticker-callback → диспетчеризует BattleMap.tickerHandlers.
 *
 * @param {string} containerId  — id of the DOM container (e.g. 'pixi-battle-map')
 * @param {number} width        — canvas width in CSS pixels
 * @param {number} height       — canvas height in CSS pixels
 * @param {object} [opts]       — { resolution?, backgroundColor?, antialias? }
 * @returns {Promise<object>}   — the BattleMap singleton
 */
async function initBattleMap(containerId, width, height, opts) {
  // Prevent double-init
  if (BattleMap && BattleMap.app) {
    console.warn('[BattleMap] already initialised — call destroyBattleMap() first');
    return BattleMap;
  }

  opts = opts || {};

  // 1a. HiDPI (arma.md Шаг 20). В Node/тестах window может отсутствовать.
  var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  if (typeof opts.resolution === 'number' && opts.resolution > 0) {
    dpr = opts.resolution;
  }

  // 1b. Create Pixi Application (v8: two-step init)
  const app = new PIXI.Application();
  await app.init({
    width:           width,
    height:          height,
    antialias:       (opts.antialias !== false),
    backgroundColor: (typeof opts.backgroundColor === 'number') ? opts.backgroundColor : 0x2d4a1e,
    resolution:      dpr,
    autoDensity:     true
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
    },
    dpr:             dpr,
    tickerHandlers:  [],
    masterTick:      null
  };

  // 5. Master ticker callback (arma.md Шаг 20).
  //    Один add() на Pixi ticker, который сам диспетчеризует все
  //    пользовательские handlers. Это позволяет одной парой start/stop
  //    управлять всей per-frame анимацией карты.
  var master = function(ticker) {
    // Pixi v8: ticker.add передаёт экземпляр Ticker (а не число).
    // delta/ deltaTime доступны через ticker.deltaTime (1.0 на 60Гц).
    var delta;
    if (ticker && typeof ticker.deltaTime === 'number') {
      delta = ticker.deltaTime;
    } else if (typeof ticker === 'number') {
      delta = ticker;
    } else {
      delta = 1;
    }
    var handlers = BattleMap && BattleMap.tickerHandlers;
    if (!handlers || handlers.length === 0) return;
    // Итерация по snapshot: handler может удалить себя изнутри.
    var snap = handlers.slice();
    for (var i = 0; i < snap.length; i++) {
      try { snap[i](delta); } catch (e) {
        console.warn('[BattleMap] ticker handler threw:', e);
      }
    }
  };
  BattleMap.masterTick = master;
  if (app.ticker && typeof app.ticker.add === 'function') {
    app.ticker.add(master);
  }

  console.log('[BattleMap] initialised — canvas', width + 'x' + height,
              '@ dpr=' + dpr + ' | layers:', Object.keys(BattleMap.layers).join(', '));

  return BattleMap;
}

/**
 * destroyBattleMap()
 *
 * Tears down the Pixi Application and clears the singleton. Also drops
 * the offscreen terrain cache so the next open() starts fresh.
 * Safe to call even if not initialised.
 */
function destroyBattleMap() {
  if (!BattleMap || !BattleMap.app) return;

  // Снять мастер-тик, очистить handlers — чтобы не осталось ссылок на
  // destroyed-контейнеры.
  try {
    if (BattleMap.app.ticker && BattleMap.masterTick &&
        typeof BattleMap.app.ticker.remove === 'function') {
      BattleMap.app.ticker.remove(BattleMap.masterTick);
    }
  } catch (_) { /* noop */ }
  BattleMap.tickerHandlers = [];
  BattleMap.masterTick     = null;

  try {
    BattleMap.app.destroy(true, { children: true, texture: true });
  } catch (e) {
    console.warn('[BattleMap] destroy error:', e);
  }

  // Сброс offscreen-кеша: текстура привязана к destroyed-рендереру.
  clearTerrainCache();

  BattleMap = null;
  console.log('[BattleMap] destroyed');
}

// ──────────────────────────────────────────────────────────────────────
// Экспорт: глобалы (браузер) + module.exports (Node.js тесты)
// ──────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
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
    renderForests,
    renderUnit,
    renderAllUnits,
    createBattleMapState,
    attachBattleMapInteractions,
    selectBattalion,
    deselectAll,
    onMapClick,
    redrawUnit,
    stepBattleMapAnimations,
    renderFortifications,
    emitDamageNumber,
    drawAimLine,
    removeAimLine,
    initBattleMap, destroyBattleMap,
    renderTerrainCached,
    clearTerrainCache,
    addBattleMapTicker,
    removeBattleMapTicker,
    pauseBattleMap,
    resumeBattleMap
  };
}
