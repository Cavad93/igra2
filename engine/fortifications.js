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
// результат (mulberry32 — встроенный PRNG).
//
// Зависимости: нет (Level 0).
// ══════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// Встроенный PRNG (mulberry32) — маленький 32-битный seeded PRNG.
// Источник: https://stackoverflow.com/a/47593316 (public domain).
// ────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  var a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Параметры (arma.md Шаг 19):
//   - 3..5 точек вокруг города,
//   - радиус 30 px,
//   - ломаная линия из этих точек — линия обороны.
export var FORT_MIN_POINTS = 3;
export var FORT_MAX_POINTS = 5;
export var FORT_RADIUS     = 30;

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
export function generateFortifications(keyPoints, seed) {
  if (!Array.isArray(keyPoints) || keyPoints.length === 0) return [];

  var rng = mulberry32(((seed | 0) + 0x19) >>> 0);

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

// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)
window.FORT_MAX_POINTS = FORT_MAX_POINTS;
window.FORT_MIN_POINTS = FORT_MIN_POINTS;
window.FORT_RADIUS = FORT_RADIUS;
window.generateFortifications = generateFortifications;

