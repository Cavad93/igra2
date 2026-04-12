/* ═══════════════════════════════════════════════════════════
   battle_map_pixi.js — Pixi.js v8 Battle Map (arma.md)
   Шаг 1: инициализация Application + 6 контейнеров-слоёв
   Шаг 4: BIOMES палитра + getBiomeColor / getBiomeAt
   Шаг 5: renderTerrain — Canvas 2D → PIXI.Texture → Sprite
   Шаг 6: parchment overlay + vignette (TilingSprite + radial gradient)
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
    initBattleMap, destroyBattleMap
  };
}
