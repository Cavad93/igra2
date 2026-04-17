// ══════════════════════════════════════════════════════════════════════
// RIVERS — трассировка потоков воды по heightmap (arma.md Шаг 7)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Вычисляет пути рек как массивы точек — ДО рендера.
//
// Экспортирует:
//   traceRiver(heightmap, startX, startY, maxSteps)  → [{x,y}, ...]
//   generateRivers(heightmap, count, seed)            → [{ path, width }, ...]
//
// Алгоритм (greedy steepest-descent):
//   - Стартуем с пикселя горного биома (h > 0.78).
//   - На каждом шаге выбираем соседа (8 направлений) с минимальной
//     высотой. Если минимальный сосед не НИЖЕ текущего — стоп (озеро / плато).
//   - Идём пока h < 0.20 (вода) или maxSteps.
//   - Отслеживаем посещённые клетки, чтобы избежать циклов.
//
// Зависимости: mulberry32, getHeight из engine/noise.js.
// ══════════════════════════════════════════════════════════════════════

import { mulberry32, getHeight } from './noise.js';

// ────────────────────────────────────────────────────────────────
// Обёртка getHeight
// ────────────────────────────────────────────────────────────────

function H(heightmap, x, y) {
  return getHeight(heightmap, x, y);
}

/**
 * Smoothed 3×3 average — используется ТОЛЬКО для решения "куда течь",
 * чтобы обойти микро-бассейны domain-warped Perlin (1-2 пиксельные ямки).
 * Для условий start/stop (вода / старт-гора) берётся сырая высота.
 */
function smoothH(heightmap, x, y) {
  var s = 0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      s += H(heightmap, x + dx, y + dy);
    }
  }
  return s / 9;
}

// 8-связные смещения (направления Мура)
var DX = [-1, 0, 1, -1, 1, -1, 0, 1];
var DY = [-1, -1, -1, 0, 0, 1, 1, 1];

// Пороги (arma.md Шаг 7)
export var MOUNTAIN_H  = 0.78;  // старт рек — горные зоны
export var WATER_H     = 0.20;  // конец рек — дошли до воды
var MIN_LEN     = 20;    // фильтр коротких рек
export var MIN_RIVER_LEN = MIN_LEN;
var WIDTH_DIVISOR = 80;  // width = 1 + len/80

// ────────────────────────────────────────────────────────────────
// traceRiver — steepest-descent от (startX, startY) до воды
// ────────────────────────────────────────────────────────────────
/**
 * Трассировка пути реки от горной вершины к воде.
 *
 * На каждом шаге выбирает соседа (8 направлений) со строго минимальной
 * высотой. Останавливается, если:
 *   - минимальный сосед НЕ ниже текущей точки (озеро / плато)
 *   - текущая точка h < WATER_H (достигли воды)
 *   - пройдено maxSteps шагов
 *   - сосед уже был посещён (избежать циклов на плоских кольцах)
 *
 * @param {{data:Float32Array,width:number,height:number}} heightmap
 * @param {number} startX
 * @param {number} startY
 * @param {number} [maxSteps=10000]
 * @returns {Array<{x:number,y:number}>}  путь от старта к воде (включая оба)
 */
export function traceRiver(heightmap, startX, startY, maxSteps) {
  if (!heightmap || !heightmap.data) return [];
  var W = heightmap.width;
  var Hh = heightmap.height;
  if (maxSteps == null) maxSteps = 10000;

  var path = [];
  var visited = new Uint8Array(W * Hh);

  var x = startX | 0;
  var y = startY | 0;
  if (x < 0) x = 0; else if (x >= W) x = W - 1;
  if (y < 0) y = 0; else if (y >= Hh) y = Hh - 1;

  for (var step = 0; step < maxSteps; step++) {
    // Отметить текущую клетку
    var idx = y * W + x;
    if (visited[idx]) break;
    visited[idx] = 1;
    path.push({ x: x, y: y });

    var curH    = H(heightmap, x, y);
    var curSmooth = smoothH(heightmap, x, y);

    // Достигли воды — останавливаемся (по сырой высоте — точное условие).
    if (curH < WATER_H) break;

    // Ищем соседа (8 направлений) с минимальной СГЛАЖЕННОЙ высотой.
    // Сглаживание: средняя h по 3×3 окну. Это "спрямляет" микро-ямы
    // Perlin-шума и оставляет только крупный градиент рельефа.
    var bestH  = Infinity;
    var bestNX = -1;
    var bestNY = -1;

    for (var i = 0; i < 8; i++) {
      var nx = x + DX[i];
      var ny = y + DY[i];
      if (nx < 0 || nx >= W || ny < 0 || ny >= Hh) continue;
      if (visited[ny * W + nx]) continue;
      var nh = smoothH(heightmap, nx, ny);
      if (nh < bestH) {
        bestH  = nh;
        bestNX = nx;
        bestNY = ny;
      }
    }

    // Нет доступных соседей (все посещены / край) — стоп
    if (bestNX < 0) break;

    // Минимальный сосед СТРОГО выше (по сглаженной высоте) — озеро, стоп.
    // Равные высоты допускаются: visited[] защищает от циклов.
    if (bestH > curSmooth) break;

    x = bestNX;
    y = bestNY;
  }

  return path;
}

// ────────────────────────────────────────────────────────────────
// generateRivers — выбрать count стартов и протрассировать все реки
// ────────────────────────────────────────────────────────────────
/**
 * Генерация count рек из случайных горных точек.
 *
 * 1. Собираем все пиксели с h > MOUNTAIN_H.
 * 2. Seeded PRNG (mulberry32) перемешивает индексы — берём первые count.
 * 3. Для каждого стартового индекса вызываем traceRiver.
 * 4. Фильтруем пути короче MIN_LEN (= 20).
 * 5. width = 1 + path.length / 80.
 *
 * @param {{data:Float32Array,width:number,height:number}} heightmap
 * @param {number} count — сколько стартов попробовать (не гарантированное кол-во рек)
 * @param {number} seed  — seed для PRNG
 * @returns {Array<{path:Array<{x:number,y:number}>, width:number}>}
 */
export function generateRivers(heightmap, count, seed) {
  if (!heightmap || !heightmap.data) return [];
  if (!(count > 0)) return [];

  var W = heightmap.width;
  var Hh = heightmap.height;
  var data = heightmap.data;

  // 1. Собираем горные пиксели.
  // Для крупных карт это O(W*H) память — допустимо: 256x256 = 65k Int32
  var mountIdx = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i] > MOUNTAIN_H) mountIdx.push(i);
  }
  if (mountIdx.length === 0) return [];

  // 2. Seeded PRNG.
  var rng = mulberry32(seed | 0);

  // 3. Выбираем count стартов через partial Fisher-Yates shuffle.
  // Защита: если count > mountIdx.length — ограничиваем.
  var starts = [];
  var N = mountIdx.length;
  var picks = Math.min(count | 0, N);
  // Копия, чтобы не портить исходный массив (хотя мы не обязаны)
  var pool = mountIdx.slice();
  for (var k = 0; k < picks; k++) {
    var j = k + Math.floor(rng() * (N - k));
    if (j >= N) j = N - 1;
    var tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp;
    starts.push(pool[k]);
  }

  // 4. Трассировка.
  var rivers = [];
  for (var s = 0; s < starts.length; s++) {
    var idx = starts[s];
    var sx = idx % W;
    var sy = (idx / W) | 0;
    var path = traceRiver(heightmap, sx, sy, (W + Hh) * 4);
    if (path.length >= MIN_LEN) {
      rivers.push({
        path:  path,
        width: 1 + path.length / WIDTH_DIVISOR
      });
    }
  }

  return rivers;
}

// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)
window.MIN_RIVER_LEN = MIN_RIVER_LEN;
window.MOUNTAIN_H = MOUNTAIN_H;
window.WATER_H = WATER_H;
window.generateRivers = generateRivers;
window.traceRiver = traceRiver;

