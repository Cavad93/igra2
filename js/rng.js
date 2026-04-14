// ============================================================================
//  arma.md Шаг 73 — Детерминированный генератор псевдослучайных чисел
//
//  Используется процедурным SVG-портретом (ui/portrait_svg.js) для генерации
//  уникального детерминированного лица на основе char.id. Разные seed дают
//  разные последовательности, одинаковые seed — одинаковые.
//
//  Алгоритм: Mulberry32 — быстрый, компактный, статистически качественный
//  32-битный PRNG. Public domain.
//  Источник: https://stackoverflow.com/a/47593316
//
//  Публичное API:
//    seededRNG(seed)  → function(): number   // [0, 1)
//
//  Глобально экспортируется как window.seededRNG и через CommonJS module.exports.
// ============================================================================

(function () {
  /**
   * Mulberry32 — 32-битный детерминированный PRNG.
   * Возвращает функцию, которая при каждом вызове даёт число [0, 1).
   *
   * @param {number} seed — целочисленный seed (будет приведён к uint32)
   * @returns {function(): number}
   */
  function seededRNG(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      s >>>= 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Экспорт в window
  if (typeof window !== 'undefined') {
    window.seededRNG = seededRNG;
  }
  // CommonJS (тесты Node)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { seededRNG };
  }
})();
