// ══════════════════════════════════════════════════════════════════════
// NOISE — Perlin noise + fBm + Domain Warping (arma.md Шаг 2)
//
// Чистый, без зависимостей, модуль генерации органичного шума.
// Используется для heightmap тактической карты (engine/noise.js, Шаг 3).
//
// Экспортирует (через глобалы / module.exports):
//   mulberry32(seed)                           — seeded PRNG
//   class PerlinNoise                          — детерминированный 2D шум
//     .noise2d(x, y)                           → число в [-1, 1]
//   fbm(noise, x, y, octaves, pers, lac)       → число в [0, 1]
//   domainWarp(noise, x, y, octaves, strength) → число в [0, 1]
//
// Алгоритмы:
//   - Ken Perlin improved noise (permutation table 512, fade 6t⁵-15t⁴+10t³)
//   - fBm: суммирование октав с persistence/lacunarity, нормализация в [0,1]
//   - Domain Warping: двойной проход fBm (K. Perlin / Inigo Quilez)
// ══════════════════════════════════════════════════════════════════════

/**
 * mulberry32(seed) — маленький 32-битный детерминированный PRNG.
 * Возвращает функцию random() → [0, 1).
 * Источник: https://stackoverflow.com/a/47593316 (public domain).
 *
 * @param {number} seed  — целочисленный seed
 * @returns {function(): number}
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * PerlinNoise — классический 2D Perlin шум по Ken Perlin.
 *
 * Принцип:
 *   1. Permutation table размером 512 (256 * 2) с seeded shuffle.
 *   2. Для точки (x, y): 4 целочисленных угла решётки.
 *   3. Для каждого угла: gradient vector выбирается через perm-хеш.
 *   4. Dot product (сдвиг точки от угла) · gradient.
 *   5. Bilinear interpolation 4 dot-ов через fade-функцию.
 *
 * Диапазон значений: примерно [-1, 1] (теоретический максимум sqrt(2)/2 * 2 ≈ 1).
 */
function PerlinNoise(seed) {
  // Build permutation table 0..255 and shuffle via mulberry32
  const rng = mulberry32(seed | 0);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates with seeded PRNG
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  // Duplicate to 512 to avoid overflow checks in hash lookups
  this.perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
}

/**
 * fade(t) = 6t⁵ - 15t⁴ + 10t³  — quintic smoothstep (Perlin 2002).
 * Имеет нулевые 1-ю и 2-ю производные в 0 и 1 → гладкая интерполяция.
 */
PerlinNoise.prototype._fade = function(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Линейная интерполяция. */
PerlinNoise.prototype._lerp = function(a, b, t) {
  return a + t * (b - a);
};

/**
 * _grad(hash, x, y) — dot product между точкой (x,y) и градиентом по hash.
 * Используем 8 направлений (углы 45°) — классический вариант Ken Perlin для 2D.
 */
PerlinNoise.prototype._grad = function(hash, x, y) {
  // 8 направлений: (±1, 0), (0, ±1), (±1, ±1) / sqrt(2)
  const h = hash & 7;
  // 4 оси (00..11) → (+x,+y), (-x,+y), (+x,-y), (-x,-y)
  // плюс 4 диагонали — через перекладку u/v
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
};

/**
 * noise2d(x, y) — возвращает Perlin-шум в диапазоне примерно [-1, 1].
 */
PerlinNoise.prototype.noise2d = function(x, y) {
  const p = this.perm;
  // Integer lattice cell
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  // Relative position in cell [0, 1)
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  // Fade curves
  const u = this._fade(xf);
  const v = this._fade(yf);
  // Hash coordinates of 4 corners
  const aa = p[p[X    ] + Y    ];
  const ab = p[p[X    ] + Y + 1];
  const ba = p[p[X + 1] + Y    ];
  const bb = p[p[X + 1] + Y + 1];
  // Gradients at corners → dot products
  const g_aa = this._grad(aa, xf,     yf    );
  const g_ba = this._grad(ba, xf - 1, yf    );
  const g_ab = this._grad(ab, xf,     yf - 1);
  const g_bb = this._grad(bb, xf - 1, yf - 1);
  // Bilinear interpolation
  const x1 = this._lerp(g_aa, g_ba, u);
  const x2 = this._lerp(g_ab, g_bb, u);
  return this._lerp(x1, x2, v);
};

/**
 * fbm(noise, x, y, octaves, persistence, lacunarity)
 *
 * Fractal Brownian Motion — сумма октав Perlin с убывающей амплитудой
 * и растущей частотой. Нормализация в строгий [0, 1].
 *
 * @param {PerlinNoise} noise  — экземпляр PerlinNoise
 * @param {number} x, y        — координаты (в noise space, обычно 0..N)
 * @param {number} octaves     — число октав (default 6)
 * @param {number} persistence — amplitude decay (default 0.5)
 * @param {number} lacunarity  — frequency growth (default 2.0)
 * @returns {number}           — значение в [0, 1]
 */
function fbm(noise, x, y, octaves, persistence, lacunarity) {
  if (octaves     == null) octaves     = 6;
  if (persistence == null) persistence = 0.5;
  if (lacunarity  == null) lacunarity  = 2.0;

  let sum  = 0;
  let amp  = 1;
  let freq = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    sum    += noise.noise2d(x * freq, y * freq) * amp;
    maxAmp += amp;
    amp    *= persistence;
    freq   *= lacunarity;
  }

  // Нормализуем в [-1, 1], затем сдвигаем в [0, 1]
  const normalized = sum / maxAmp;
  return (normalized + 1) * 0.5;
}

/**
 * domainWarp(noise, x, y, octaves, warpStrength)
 *
 * Domain Warping по Inigo Quilez / Ken Perlin: итоговое поле fbm(x',y'),
 * где координаты (x',y') сами являются fBm-полями. Это создаёт органичные
 * изгибы — идеально для карт рельефа (реки, побережья, холмы).
 *
 * @param {PerlinNoise} noise
 * @param {number} x, y
 * @param {number} octaves       — octaves для всех трёх fbm
 * @param {number} warpStrength  — сила искажения (default 1.2)
 * @returns {number}             — значение в [0, 1]
 */
function domainWarp(noise, x, y, octaves, warpStrength) {
  if (octaves      == null) octaves      = 6;
  if (warpStrength == null) warpStrength = 1.2;

  // Первый проход: 2 независимых fBm поля для смещения координат.
  // Смещения (5.2, 1.3) из "Better Mountains" (IQ) — ломают корреляцию.
  const qx = fbm(noise, x,        y,        octaves, 0.5, 2.0);
  const qy = fbm(noise, x + 5.2,  y + 1.3,  octaves, 0.5, 2.0);

  // Второй проход: fBm по искажённым координатам.
  const rx = fbm(
    noise,
    x + warpStrength * qx,
    y + warpStrength * qy,
    octaves, 0.5, 2.0
  );

  return rx; // уже в [0, 1]
}

// ──────────────────────────────────────────────────────────────────────
// Экспорт: глобалы (браузер) + module.exports (Node.js тесты)
// ──────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.mulberry32  = mulberry32;
  window.PerlinNoise = PerlinNoise;
  window.fbm         = fbm;
  window.domainWarp  = domainWarp;
}
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { mulberry32, PerlinNoise, fbm, domainWarp };
}
