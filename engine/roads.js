// ══════════════════════════════════════════════════════════════════════
// ROADS — размещение ключевых точек (города, перекрёстки) (arma.md Шаг 10)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Вычисляет 3–N ключевых точек на равнинных зонах heightmap для
// последующей прокладки дорог через A* (Шаг 11).
//
// Экспортирует:
//   generateKeyPoints(heightmap, count, seed) → [{x, y, name:'city_N'}, ...]
//
// Алгоритм (Poisson-like greedy с seeded shuffle):
//   1. Собираем индексы пикселей с h ∈ [0.35, 0.60] (равнинная зона:
//      грасленд / частично лес; выше — лес/горы, ниже — вода/ветленд).
//   2. Seeded shuffle (mulberry32 + Fisher-Yates).
//   3. Жадно выбираем точки: новая принимается, если расстояние до
//      каждой уже выбранной > minDist = width / 4 (евклидово).
//   4. Останавливаемся, когда набрали `count` или перебрали всех.
//
// Зависимости: mulberry32, getHeight — из engine/noise.js.
// В Node.js: require(); в браузере: window.*.
// ══════════════════════════════════════════════════════════════════════

(function(root) {
  'use strict';

  // ────────────────────────────────────────────────────────────────
  // Импорт зависимостей (Node.js / браузер / vm-sandbox)
  // ────────────────────────────────────────────────────────────────
  var _mulberry32, _getHeight;
  if (typeof require === 'function' && typeof module !== 'undefined' && module.exports) {
    try {
      var _noise = require('./noise.js');
      _mulberry32 = _noise.mulberry32;
      _getHeight  = _noise.getHeight;
    } catch (e) {
      // fallthrough to root lookup
    }
  }
  if (!_mulberry32 && root && root.mulberry32) _mulberry32 = root.mulberry32;
  if (!_getHeight  && root && root.getHeight)  _getHeight  = root.getHeight;

  /** Мини-fallback на случай, если noise.js не загружен. */
  function _getHeightFallback(heightmap, x, y) {
    var w = heightmap.width;
    var h = heightmap.height;
    var ix = x | 0;
    var iy = y | 0;
    if (ix < 0) ix = 0; else if (ix >= w) ix = w - 1;
    if (iy < 0) iy = 0; else if (iy >= h) iy = h - 1;
    return heightmap.data[iy * w + ix];
  }

  function H(heightmap, x, y) {
    return _getHeight ? _getHeight(heightmap, x, y)
                      : _getHeightFallback(heightmap, x, y);
  }

  // Пороги равнинной зоны (arma.md Шаг 10)
  var PLAIN_MIN = 0.35;
  var PLAIN_MAX = 0.60;

  // ────────────────────────────────────────────────────────────────
  // generateKeyPoints — равномерные ключевые точки на равнинах
  // ────────────────────────────────────────────────────────────────
  /**
   * Генерация ключевых точек (городов/перекрёстков) для дорог.
   *
   * Возвращает массив до `count` точек, все:
   *   - находятся на равнинной зоне (h ∈ [0.35, 0.60]);
   *   - попарно удалены более чем на minDist = width / 4 (евклид).
   *
   * Если в heightmap мало равнинных пикселей или они сгрудились,
   * фактическое число возвращённых точек может быть меньше `count`.
   *
   * Детерминированность: при одном и том же seed + heightmap
   * возвращается идентичный результат.
   *
   * @param {{data:Float32Array,width:number,height:number}} heightmap
   * @param {number} count — сколько точек нужно максимум
   * @param {number} seed  — seed для mulberry32
   * @returns {Array<{x:number,y:number,name:string}>}
   */
  function generateKeyPoints(heightmap, count, seed) {
    if (!heightmap || !heightmap.data) return [];
    if (!(count > 0)) return [];

    var W = heightmap.width;
    var Hh = heightmap.height;
    var data = heightmap.data;
    if (!(W > 0) || !(Hh > 0) || data.length !== W * Hh) return [];

    // 1. Собираем индексы равнинных пикселей.
    var plain = [];
    for (var i = 0; i < data.length; i++) {
      var h = data[i];
      if (h >= PLAIN_MIN && h <= PLAIN_MAX) plain.push(i);
    }
    if (plain.length === 0) return [];

    // 2. Seeded PRNG + Fisher-Yates shuffle (полный, для детерминизма).
    var rng = _mulberry32 ? _mulberry32(seed | 0) : Math.random;
    var N = plain.length;
    for (var k = N - 1; k > 0; k--) {
      var j = Math.floor(rng() * (k + 1));
      if (j > k) j = k;
      var tmp = plain[k]; plain[k] = plain[j]; plain[j] = tmp;
    }

    // 3. Жадный отбор с ограничением по минимальной дистанции.
    var minDist = W / 4;
    var minDist2 = minDist * minDist; // сравниваем квадраты, чтобы избежать sqrt

    var result = [];
    var target = count | 0;

    for (var p = 0; p < N && result.length < target; p++) {
      var idx = plain[p];
      var px = idx % W;
      var py = (idx / W) | 0;

      // Проверяем дистанцию до каждой уже выбранной точки
      var ok = true;
      for (var q = 0; q < result.length; q++) {
        var dx = px - result[q].x;
        var dy = py - result[q].y;
        if (dx * dx + dy * dy < minDist2) { ok = false; break; }
      }
      if (!ok) continue;

      result.push({
        x: px,
        y: py,
        name: 'city_' + (result.length + 1)
      });
    }

    return result;
  }

  // ────────────────────────────────────────────────────────────────
  // Экспорт: глобалы (браузер) + module.exports (Node.js / vm)
  // ────────────────────────────────────────────────────────────────
  var api = {
    generateKeyPoints: generateKeyPoints,
    // константы открыты для тестов
    PLAIN_MIN: PLAIN_MIN,
    PLAIN_MAX: PLAIN_MAX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.generateKeyPoints = generateKeyPoints;
  }
})(typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : this);
