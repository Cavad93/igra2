// ══════════════════════════════════════════════════════════════════════
// FORTIFICATIONS — укрепления вокруг ключевых точек (arma.md Шаг 19)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Для каждого ключевого города создаёт 3–5 точек в радиусе ~30px
// и соединяет их в ломаную линию (линия обороны).
//
// Экспортирует:
//   generateFortifications(keyPoints, seed) →
//     [{ center:{x,y}, points:[{x,y}, ...] }, ...]
//
// Детерминированность: один и тот же seed + keyPoints → одинаковый
// результат (mulberry32 из engine/noise.js).
//
// Зависимости: mulberry32 — из engine/noise.js.
// В Node.js: require(); в браузере / vm-sandbox: root.mulberry32.
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

  // Параметры (arma.md Шаг 19):
  //   - 3..5 точек вокруг города,
  //   - радиус 30 px,
  //   - ломаная линия из этих точек — линия обороны.
  var FORT_MIN_POINTS = 3;
  var FORT_MAX_POINTS = 5;
  var FORT_RADIUS     = 30;

  /**
   * generateFortifications(keyPoints, seed)
   *
   * Для каждой точки keyPoints формирует fort: N точек в кольце вокруг
   * центра, равномерно по углам с небольшим джиттером угла и радиуса.
   * Возвращает массив fort'ов в том же порядке, что keyPoints.
   *
   * Некорректные записи keyPoints (без числовых x/y) пропускаются.
   *
   * @param {Array<{x:number,y:number}>} keyPoints — координаты городов в heightmap
   * @param {number} seed — детерминирующий seed (mulberry32)
   * @returns {Array<{center:{x:number,y:number}, points:Array<{x:number,y:number}>}>}
   */
  function generateFortifications(keyPoints, seed) {
    if (!Array.isArray(keyPoints) || keyPoints.length === 0) return [];

    var rng = _mulberry32
      ? _mulberry32(((seed | 0) + 0x19) >>> 0)
      : function() { return Math.random(); };

    var forts = [];
    for (var i = 0; i < keyPoints.length; i++) {
      var kp = keyPoints[i];
      if (!kp || typeof kp.x !== 'number' || typeof kp.y !== 'number') continue;
      if (!isFinite(kp.x) || !isFinite(kp.y)) continue;

      // 3..5 включительно (равномерно через rng).
      var span = (FORT_MAX_POINTS - FORT_MIN_POINTS + 1); // 3
      var n = FORT_MIN_POINTS + Math.floor(rng() * span);
      if (n < FORT_MIN_POINTS) n = FORT_MIN_POINTS;
      if (n > FORT_MAX_POINTS) n = FORT_MAX_POINTS;

      // Начальный угол — случайный, чтобы разные города не смотрели
      // одинаково. Далее точки равномерно распределены по окружности
      // с небольшим джиттером угла (±0.15 рад) и радиуса (0.8..1.2 * R).
      var angleStart = rng() * Math.PI * 2;

      var pts = [];
      for (var k = 0; k < n; k++) {
        var baseAngle = angleStart + (Math.PI * 2) * (k / n);
        var jitterAngle = (rng() - 0.5) * 0.3; // ±0.15 rad
        var angle = baseAngle + jitterAngle;
        var rFactor = 0.8 + rng() * 0.4; // 0.8..1.2
        var r = FORT_RADIUS * rFactor;
        pts.push({
          x: kp.x + Math.cos(angle) * r,
          y: kp.y + Math.sin(angle) * r
        });
      }

      forts.push({
        center: { x: kp.x, y: kp.y },
        points: pts
      });
    }

    return forts;
  }

  // ────────────────────────────────────────────────────────────────
  // Экспорт: глобалы (браузер) + module.exports (Node.js / vm)
  // ────────────────────────────────────────────────────────────────
  var api = {
    generateFortifications: generateFortifications,
    FORT_MIN_POINTS: FORT_MIN_POINTS,
    FORT_MAX_POINTS: FORT_MAX_POINTS,
    FORT_RADIUS: FORT_RADIUS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.generateFortifications = generateFortifications;
  }
})(typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : this);
