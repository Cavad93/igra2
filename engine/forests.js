// ══════════════════════════════════════════════════════════════════════
// FORESTS — Worley noise + forest mask (arma.md Шаг 13)
//           Poisson Disk Sampling для размещения деревьев (arma.md Шаг 14)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Определяет какие пиксели heightmap принадлежат зонам густого леса,
// и генерирует равномерно распределённые позиции деревьев внутри этих зон.
//
// Экспортирует:
//   worleyNoise(x, y, points, maxDist)         → нормализованное [0,1]
//                                                 min-расстояние до
//                                                 ближайшей feature point.
//   generateForestMask(heightmap, seed, opts?) → Uint8Array(width*height)
//                                                 (1 = пиксель густого
//                                                 леса, 0 = иначе).
//   poissonDisk(mask, w, h, minDist, maxPoints, seed)
//                                              → Array<{x,y}> позиций,
//                                                 равномерно распределённых
//                                                 внутри маски (Bridson).
//   FOREST_MIN, FOREST_MAX                      — пороги биома «forest»
//                                                 (соответствуют палитре
//                                                 BIOMES в battle_map_pixi.js).
//   DEFAULT_TREE_MIN_DIST, DEFAULT_TREE_MAX_POINTS
//                                              — параметры для деревьев.
//
// Алгоритм:
//   1. Сгенерировать N feature points (N ∈ [20, 30], seeded mulberry32).
//   2. Worley noise (cellular/Voronoi F1): для каждого пикселя
//      найти минимум евклидова расстояния до любой feature point.
//   3. Нормализовать: делить на характеристическую «длину ячейки»
//      maxDist = sqrt((W*H) / N) — ожидаемое расстояние между
//      соседями при равномерном Пуассоновском распределении N точек
//      в прямоугольнике W×H. С такой нормализацией порог 0.35
//      выдаёт ~20-40% покрытия биома «forest», как заявлено в arma.md.
//   4. Пиксель — густой лес, если ОДНОВРЕМЕННО:
//      - высота h ∈ [FOREST_MIN, FOREST_MAX] (биом «forest»),
//      - worleyNoise(x, y, points, maxDist) < 0.35.
//
// Почему Worley, а не Perlin:
//   Worley даёт органичные округлые «пятна» вокруг feature points —
//   похоже на реальные лесные массивы. Perlin даёт полосы / шум.
//   Worley = F1-distance от cellular noise (Steven Worley, 1996).
//
// Зависимости: mulberry32 из engine/noise.js.
// ══════════════════════════════════════════════════════════════════════

import { mulberry32 } from './noise.js';

// ────────────────────────────────────────────────────────────────
// PRNG helper — wraps imported mulberry32
// ────────────────────────────────────────────────────────────────
function PRNG(seed) {
  return mulberry32(seed);
}

// Пороги биома «forest» (согласованы с BIOMES в ui/battle_map_pixi.js:
//   grassland — h ∈ (0.35, 0.55]
//   forest    — h ∈ (0.55, 0.68]   ← нас интересует именно этот диапазон
//   hills     — h ∈ (0.68, 0.80] )
// Значения взяты полуинтервалом [FOREST_MIN, FOREST_MAX] включительно
// для удобства тестов и совпадения с текстом arma.md «в диапазоне [0.55, 0.68]».
export const FOREST_MIN = 0.55;
export const FOREST_MAX = 0.68;
// Float32 epsilon: h, хранимый в Float32Array, может отличаться от
// литерала ≈ 1.2e-7. Используем 1e-6 чтобы включить граничные значения.
var FOREST_EPS = 1e-6;

// Количество feature points и порог worley (из arma.md Шаг 13).
// N выбран в середине диапазона [20, 30]; threshold = 0.35.
export const DEFAULT_N_POINTS = 25;
export const DEFAULT_THRESHOLD = 0.35;

// ────────────────────────────────────────────────────────────────
// worleyNoise(x, y, points, maxDist)
//
// Cellular (Worley) noise F1: минимум евклидова расстояния от (x, y)
// до любой feature point в массиве `points`. Опционально нормализуется
// делением на `maxDist` — тогда возвращает число в [0, 1]
// (clamp-ится по верхней границе до 1.0).
//
// Если `points` пуст или невалиден — возвращает 1.0 (максимально «далеко»).
// Если `maxDist` не передан / ≤ 0 — возвращает сырое расстояние
// в пикселях (для debug-отрисовки / unit-тестов).
//
// @param {number} x
// @param {number} y
// @param {Array<{x:number,y:number}>} points
// @param {number} [maxDist]  — если задано, результат нормализуется в [0,1]
// @returns {number}
// ────────────────────────────────────────────────────────────────
export function worleyNoise(x, y, points, maxDist) {
  if (!points || !points.length) {
    return (maxDist && maxDist > 0) ? 1.0 : Infinity;
  }
  var minD2 = Infinity;
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    var dx = x - p.x;
    var dy = y - p.y;
    var d2 = dx * dx + dy * dy;
    if (d2 < minD2) minD2 = d2;
  }
  var d = Math.sqrt(minD2);
  if (!(maxDist > 0)) return d;
  var norm = d / maxDist;
  return norm > 1.0 ? 1.0 : norm;
}

// ────────────────────────────────────────────────────────────────
// generateForestMask(heightmap, seed, opts?)
//
// Строит Uint8Array-маску размера heightmap.width × heightmap.height,
// где 1 = пиксель густого леса, 0 = иначе.
//
// Алгоритм (arma.md Шаг 13):
//   1. Генерируем DEFAULT_N_POINTS (=25) feature points в случайных
//      позициях внутри карты через seeded mulberry32.
//   2. maxDist = sqrt((W*H)/N) — характеристическая длина ячейки
//      (ожидаемое расстояние между соседями для равномерного
//      распределения N точек).
//   3. Для каждого пикселя: если биом «forest» (h ∈ [FOREST_MIN,
//      FOREST_MAX]) И worleyNoise(x,y,points,maxDist) < 0.35 →
//      помечаем как густой лес.
//
// Детерминированность: при одном и том же seed + heightmap результат
// идентичен (feature points генерируются mulberry32).
//
// Защиты: пустой / невалидный heightmap → Uint8Array(0).
//         Если в карте нет пикселей биома «forest» → нулевая маска.
//
// @param {{data:Float32Array,width:number,height:number}} heightmap
// @param {number} seed
// @param {{nPoints?:number, threshold?:number}} [opts] — необязательно,
//        для тестов/отладки. По умолчанию nPoints=25, threshold=0.35.
// @returns {Uint8Array} — маска (1 = forest, 0 = нет)
// ────────────────────────────────────────────────────────────────
export function generateForestMask(heightmap, seed, opts) {
  if (!heightmap || !heightmap.data) return new Uint8Array(0);
  var W = heightmap.width | 0;
  var H = heightmap.height | 0;
  if (!(W > 0) || !(H > 0) || heightmap.data.length !== W * H) {
    return new Uint8Array(0);
  }

  var options = opts || {};
  var nPoints = options.nPoints | 0;
  if (nPoints < 1) nPoints = DEFAULT_N_POINTS;
  var threshold = (typeof options.threshold === 'number')
    ? options.threshold : DEFAULT_THRESHOLD;

  // 1. Seeded PRNG + feature points.
  var rng = PRNG(seed | 0);
  var points = new Array(nPoints);
  for (var i = 0; i < nPoints; i++) {
    points[i] = { x: rng() * W, y: rng() * H };
  }

  // 2. Нормировочный коэффициент: «характеристическая длина ячейки»
  //    для N точек в W×H. Минимум W/2, чтобы на вырожденных 1×1 / 2×2
  //    не было деления на ~0.
  var maxDist = Math.sqrt((W * H) / nPoints);
  if (!(maxDist > 0)) maxDist = 1;

  // 3. Быстрый однопроходный сканер. Инлайнить worleyNoise для скорости
  //    на больших картах (512×512 = 262k пикселей × 25 points = 6.5M ops).
  var data = heightmap.data;
  var mask = new Uint8Array(W * H);
  var thrNorm = threshold; // уже нормализован
  var thrPx = thrNorm * maxDist;
  var thrPx2 = thrPx * thrPx; // сравнение в квадратах для скорости

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var h = data[idx];
      if (h < FOREST_MIN - FOREST_EPS || h > FOREST_MAX + FOREST_EPS) continue;

      // Ищем min distance² до feature point — outer-loop unrolled
      // вручную не даёт заметного выигрыша, массив достаточно мал.
      var minD2 = Infinity;
      for (var k = 0; k < nPoints; k++) {
        var p = points[k];
        var dx = x - p.x;
        var dy = y - p.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < minD2) {
          minD2 = d2;
          if (minD2 < thrPx2) break; // ранний выход — нам достаточно
        }
      }
      if (minD2 < thrPx2) mask[idx] = 1;
    }
  }

  return mask;
}

// ────────────────────────────────────────────────────────────────
// poissonDisk(mask, width, height, minDist, maxPoints, seed)
//
// Bridson's Fast Poisson Disk Sampling (2007) — равномерное
// размещение точек внутри маски с гарантией минимального расстояния.
//
// Алгоритм (arma.md Шаг 14):
//   1. Начать со случайной точки (x0, y0), где mask[y0*W+x0] == 1.
//      Добавить её в activeList и result.
//   2. Пока activeList не пуст:
//      - взять случайную точку p из activeList;
//      - сгенерировать K=30 кандидатов в кольце [minDist, 2*minDist]
//        вокруг p (равномерно по углу и радиусу);
//      - для каждого кандидата проверить:
//          * в пределах карты [0, W)×[0, H)
//          * пиксель внутри маски (mask[iy*W+ix] === 1)
//          * расстояние до ближайшего уже размещённого ≥ minDist
//      - первый подходящий кандидат — добавить в activeList и result.
//      - если за K попыток никто не прошёл — убрать p из activeList.
//   3. Остановиться когда result.length >= maxPoints.
//
// Оптимизация: spatial grid. Классический трюк Bridson: ячейка размера
// r/sqrt(2), где r = minDist. Тогда в одной ячейке не может быть больше
// одной точки (её диагональ = r). Поиск соседей ведётся только в квадрате
// 5×5 ячеек вокруг кандидата. Это сводит проверку к O(1) вместо O(n).
//
// Детерминированность: один seed + одна mask → идентичный результат
// (все случайные решения идут через mulberry32).
//
// Защиты:
//   - null/invalid mask, W/H ≤ 0, minDist ≤ 0, maxPoints ≤ 0 → [].
//   - Пустая маска (ни одной «1») → [].
//   - Стартовая точка ищется до 1000 случайных попыток,
//     затем — линейным сканом.
//
// @param {Uint8Array} mask          — 1 = валидная позиция, 0 = нет
// @param {number}     width
// @param {number}     height
// @param {number}     minDist       — минимальное расстояние (пиксели)
// @param {number}     maxPoints     — верхний предел числа точек
// @param {number}     seed          — seed mulberry32
// @returns {Array<{x:number,y:number}>}
// ────────────────────────────────────────────────────────────────
export const DEFAULT_TREE_MIN_DIST   = 12;
export const DEFAULT_TREE_MAX_POINTS = 500;
var POISSON_K                        = 30;

export function poissonDisk(mask, width, height, minDist, maxPoints, seed) {
  var W = width | 0, H = height | 0;
  if (!mask || !mask.length || !(W > 0) || !(H > 0)) return [];
  if (mask.length !== W * H) return [];
  if (!(minDist > 0) || !(maxPoints > 0)) return [];

  var rng = PRNG(seed | 0);

  // 1. Стартовая точка внутри маски.
  var startX = -1, startY = -1;
  for (var t = 0; t < 1000; t++) {
    var rx = (rng() * W) | 0;
    var ry = (rng() * H) | 0;
    if (rx >= W) rx = W - 1;
    if (ry >= H) ry = H - 1;
    if (mask[ry * W + rx] === 1) { startX = rx; startY = ry; break; }
  }
  if (startX < 0) {
    // Фоллбек: линейный скан. Тоже детерминировано.
    for (var i = 0; i < mask.length; i++) {
      if (mask[i] === 1) {
        startX = i % W;
        startY = (i / W) | 0;
        break;
      }
    }
  }
  if (startX < 0) return [];

  // 2. Spatial grid (cell = r/sqrt(2)).
  var cellSize = minDist / Math.SQRT2;
  var gridW = Math.max(1, Math.ceil(W / cellSize));
  var gridH = Math.max(1, Math.ceil(H / cellSize));
  var grid = new Int32Array(gridW * gridH);
  for (var g = 0; g < grid.length; g++) grid[g] = -1; // -1 = пусто

  var result = [];
  var activeList = [];
  var minDist2 = minDist * minDist;

  function addPoint(px, py) {
    var idx = result.length;
    result.push({ x: px, y: py });
    activeList.push(idx);
    var gx = (px / cellSize) | 0;
    var gy = (py / cellSize) | 0;
    if (gx >= gridW) gx = gridW - 1;
    if (gy >= gridH) gy = gridH - 1;
    grid[gy * gridW + gx] = idx;
  }

  addPoint(startX + 0.5, startY + 0.5);

  // 3. Главный цикл Bridson.
  while (activeList.length > 0 && result.length < maxPoints) {
    var aIdx = (rng() * activeList.length) | 0;
    if (aIdx >= activeList.length) aIdx = activeList.length - 1;
    var pIdx = activeList[aIdx];
    var p = result[pIdx];
    var accepted = false;

    for (var k = 0; k < POISSON_K; k++) {
      var angle  = rng() * Math.PI * 2;
      var radius = minDist + rng() * minDist; // [minDist, 2*minDist]
      var nx = p.x + Math.cos(angle) * radius;
      var ny = p.y + Math.sin(angle) * radius;

      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

      var ix = nx | 0;
      var iy = ny | 0;
      if (mask[iy * W + ix] !== 1) continue;

      // Проверка соседей: 5×5 ячеек вокруг кандидата.
      var cgx = (nx / cellSize) | 0;
      var cgy = (ny / cellSize) | 0;
      if (cgx >= gridW) cgx = gridW - 1;
      if (cgy >= gridH) cgy = gridH - 1;
      var x0 = cgx - 2; if (x0 < 0) x0 = 0;
      var y0 = cgy - 2; if (y0 < 0) y0 = 0;
      var x1 = cgx + 2; if (x1 > gridW - 1) x1 = gridW - 1;
      var y1 = cgy + 2; if (y1 > gridH - 1) y1 = gridH - 1;

      var ok = true;
      for (var yy = y0; yy <= y1 && ok; yy++) {
        for (var xx = x0; xx <= x1 && ok; xx++) {
          var gIdx = grid[yy * gridW + xx];
          if (gIdx >= 0) {
            var q = result[gIdx];
            var ddx = nx - q.x;
            var ddy = ny - q.y;
            if (ddx * ddx + ddy * ddy < minDist2) ok = false;
          }
        }
      }

      if (ok) {
        addPoint(nx, ny);
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      // swap-remove из activeList
      var lastI = activeList.length - 1;
      activeList[aIdx] = activeList[lastI];
      activeList.pop();
    }
  }

  return result;
}

// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

