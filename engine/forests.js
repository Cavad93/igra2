// ══════════════════════════════════════════════════════════════════════
// FORESTS — Worley noise + forest mask (arma.md Шаг 13)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Определяет какие пиксели heightmap принадлежат зонам густого леса.
//
// Экспортирует:
//   worleyNoise(x, y, points, maxDist)         → нормализованное [0,1]
//                                                 min-расстояние до
//                                                 ближайшей feature point.
//   generateForestMask(heightmap, seed, opts?) → Uint8Array(width*height)
//                                                 (1 = пиксель густого
//                                                 леса, 0 = иначе).
//   FOREST_MIN, FOREST_MAX                      — пороги биома «forest»
//                                                 (соответствуют палитре
//                                                 BIOMES в battle_map_pixi.js).
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
// В Node.js: require(); в браузере: window.*.
// ══════════════════════════════════════════════════════════════════════

(function(root) {
  'use strict';

  // ────────────────────────────────────────────────────────────────
  // Импорт зависимостей (Node.js / браузер / vm-sandbox)
  // ────────────────────────────────────────────────────────────────
  var _mulberry32;
  if (typeof require === 'function' && typeof module !== 'undefined' && module.exports) {
    try {
      var _noise = require('./noise.js');
      _mulberry32 = _noise.mulberry32;
    } catch (e) {
      // fallthrough to root lookup
    }
  }
  if (!_mulberry32 && root && root.mulberry32) _mulberry32 = root.mulberry32;

  // Минимальный fallback, если noise.js не загружен (только для dev).
  function _mulberry32Fallback(seed) {
    var a = seed >>> 0;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function PRNG(seed) {
    return (_mulberry32 || _mulberry32Fallback)(seed);
  }

  // Пороги биома «forest» (согласованы с BIOMES в ui/battle_map_pixi.js:
  //   grassland — h ∈ (0.35, 0.55]
  //   forest    — h ∈ (0.55, 0.68]   ← нас интересует именно этот диапазон
  //   hills     — h ∈ (0.68, 0.80] )
  // Значения взяты полуинтервалом [FOREST_MIN, FOREST_MAX] включительно
  // для удобства тестов и совпадения с текстом arma.md «в диапазоне [0.55, 0.68]».
  var FOREST_MIN = 0.55;
  var FOREST_MAX = 0.68;
  // Float32 epsilon: h, хранимый в Float32Array, может отличаться от
  // литерала ≈ 1.2e-7. Используем 1e-6 чтобы включить граничные значения.
  var FOREST_EPS = 1e-6;

  // Количество feature points и порог worley (из arma.md Шаг 13).
  // N выбран в середине диапазона [20, 30]; threshold = 0.35.
  var DEFAULT_N_POINTS = 25;
  var DEFAULT_THRESHOLD = 0.35;

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
  function worleyNoise(x, y, points, maxDist) {
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
  function generateForestMask(heightmap, seed, opts) {
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
  // Экспорт: глобалы (браузер) + module.exports (Node.js / vm)
  // ────────────────────────────────────────────────────────────────
  var api = {
    worleyNoise:        worleyNoise,
    generateForestMask: generateForestMask,
    FOREST_MIN:         FOREST_MIN,
    FOREST_MAX:         FOREST_MAX,
    DEFAULT_N_POINTS:   DEFAULT_N_POINTS,
    DEFAULT_THRESHOLD:  DEFAULT_THRESHOLD
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.worleyNoise        = worleyNoise;
    root.generateForestMask = generateForestMask;
  }
})(typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : this);
