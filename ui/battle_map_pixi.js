/* ═══════════════════════════════════════════════════════════
   battle_map_pixi.js — Pixi.js v8 Battle Map (arma.md)
   Шаг 1: инициализация Application + 6 контейнеров-слоёв
   Шаг 4: BIOMES палитра + getBiomeColor / getBiomeAt
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
  window.BIOMES         = BIOMES;
  window.getBiomeColor  = getBiomeColor;
  window.getBiomeAt     = getBiomeAt;
  window.initBattleMap  = initBattleMap;
  window.destroyBattleMap = destroyBattleMap;
}
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    BIOMES, getBiomeColor, getBiomeAt,
    initBattleMap, destroyBattleMap
  };
}
