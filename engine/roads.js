// ══════════════════════════════════════════════════════════════════════
// ROADS — ключевые точки + A* прокладка дорог (arma.md Шаги 10–11)
//
// Чистый, без зависимостей от DOM / PIXI, модуль.
// Вычисляет ключевые точки на равнинных зонах heightmap и прокладывает
// между ними дороги через A* pathfinding с terrain cost.
//
// Экспортирует:
//   generateKeyPoints(heightmap, count, seed) → [{x, y, name:'city_N'}, ...]
//   astar(heightmap, start, end)              → [{x, y}, ...]  путь
//   generateRoads(heightmap, keyPoints)       → [{path:[{x,y},...]}, ...]
//   terrainCost(h)                            → стоимость прохода по пикселю
//   BinaryHeap                                → класс min-heap (для тестов)
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

  // ══════════════════════════════════════════════════════════════
  // BinaryHeap — простой min-heap для приоритетной очереди A*.
  //
  // Стандартная реализация: массив + bubble-up / sink-down.
  // Элементы — целочисленные индексы (node id = y*W+x), приоритет
  // берётся извне через scoreFn(id).
  //
  // Лениво-корректный подход: мы НЕ ищем элемент при decrease-key;
  // вместо этого всегда делаем push при улучшении gScore. Старые
  // записи отфильтровываются при pop через проверку closed[].
  // Это стандартная техника для A* на сетках — экономит ~30% времени
  // по сравнению с честным decrease-key.
  // ══════════════════════════════════════════════════════════════
  function BinaryHeap(scoreFn) {
    this.items = [];
    this.scoreFn = scoreFn;
  }
  BinaryHeap.prototype.size = function() { return this.items.length; };
  BinaryHeap.prototype.push = function(item) {
    this.items.push(item);
    this._bubbleUp(this.items.length - 1);
  };
  BinaryHeap.prototype.pop = function() {
    var top = this.items[0];
    var end = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = end;
      this._sinkDown(0);
    }
    return top;
  };
  BinaryHeap.prototype._bubbleUp = function(i) {
    var items = this.items;
    var item  = items[i];
    var score = this.scoreFn(item);
    while (i > 0) {
      var parentIdx = (i - 1) >> 1;
      var parent    = items[parentIdx];
      if (this.scoreFn(parent) <= score) break;
      items[i] = parent;
      items[parentIdx] = item;
      i = parentIdx;
    }
  };
  BinaryHeap.prototype._sinkDown = function(i) {
    var items = this.items;
    var n     = items.length;
    var item  = items[i];
    var score = this.scoreFn(item);
    while (true) {
      var l = 2 * i + 1;
      var r = 2 * i + 2;
      var swap = -1;
      var lScore = 0;
      if (l < n) {
        lScore = this.scoreFn(items[l]);
        if (lScore < score) swap = l;
      }
      if (r < n) {
        var rScore = this.scoreFn(items[r]);
        if (swap === -1 ? rScore < score : rScore < lScore) swap = r;
      }
      if (swap === -1) break;
      items[i] = items[swap];
      items[swap] = item;
      i = swap;
    }
  };

  // ────────────────────────────────────────────────────────────────
  // terrainCost — стоимость шага на пиксель с высотой h (arma.md Шаг 11).
  //
  // Формула: cost(h) = 1.0 + h * 4.0, с override-ами:
  //   h < 0.20 (вода):      cost = 99  (почти непроходимо)
  //   h > 0.80 (горы):      cost = 10  (дорого, но возможно)
  //   иначе базовая формула (равнина/лес/холмы).
  //
  // Спецификация (arma.md Шаг 11):
  //   "Вода (h < 0.20): cost = 99 (почти непроходима).
  //    Горы (h > 0.80): cost = 10.
  //    Равнина (h = 0.45): cost ≈ 2.8."
  // ────────────────────────────────────────────────────────────────
  function terrainCost(h) {
    if (h < 0.20) return 99;
    if (h > 0.80) return 10;
    return 1.0 + h * 4.0;
  }

  // Порог "слишком длинного" пути — защита от патологий.
  // На 256×256 диагональ ≈ 362 пикселя; лимит ставим щедрым.
  var ASTAR_MAX_STEPS_FACTOR = 16;

  // Смещения соседей (8 направлений).
  // Первые 4 — кардинальные, последние 4 — диагональные.
  var DX = [ 1, -1,  0,  0,  1,  1, -1, -1];
  var DY = [ 0,  0,  1, -1,  1, -1,  1, -1];
  var SQRT2 = Math.SQRT2;

  // ────────────────────────────────────────────────────────────────
  // astar — поиск пути по heightmap с учётом рельефа.
  //
  // Стандартный A* на сетке (Patel / Brian Grinstead) с:
  //   - 8-связной окрестностью,
  //   - эвристикой Euclidean (допустима на 8-связной сетке),
  //   - ценой шага = terrainCost(h_neighbor) * stepLen,
  //     где stepLen = 1 для кардинальных, sqrt(2) для диагональных,
  //   - BinaryHeap как priority queue,
  //   - lazy decrease-key (повторные push, фильтр по closed[]).
  //
  // Узлы нумеруются линейно: id = y*W + x. gScore/fScore/cameFrom —
  // плоские массивы размера W*H, что существенно быстрее объектов.
  //
  // Детерминированность: при равных входах путь всегда одинаков
  // (порядок соседей фиксирован, heap стабилен по порядку push-ей).
  //
  // @param {{data:Float32Array,width:number,height:number}} heightmap
  // @param {{x:number,y:number}} start
  // @param {{x:number,y:number}} end
  // @returns {Array<{x:number,y:number}>} путь start→end или [] если не найден
  // ────────────────────────────────────────────────────────────────
  function astar(heightmap, start, end) {
    if (!heightmap || !heightmap.data) return [];
    if (!start || !end) return [];
    var W = heightmap.width | 0;
    var Hh = heightmap.height | 0;
    if (W <= 0 || Hh <= 0) return [];
    var data = heightmap.data;
    if (data.length !== W * Hh) return [];

    // Clamp start/end в границы карты.
    function clampX(v) { v = v | 0; return v < 0 ? 0 : (v >= W  ? W  - 1 : v); }
    function clampY(v) { v = v | 0; return v < 0 ? 0 : (v >= Hh ? Hh - 1 : v); }
    var sx = clampX(start.x), sy = clampY(start.y);
    var ex = clampX(end.x),   ey = clampY(end.y);

    var startIdx = sy * W + sx;
    var endIdx   = ey * W + ex;
    if (startIdx === endIdx) return [{ x: sx, y: sy }];

    var N = W * Hh;
    var gScore   = new Float64Array(N);
    var fScore   = new Float64Array(N);
    var cameFrom = new Int32Array(N);
    var closed   = new Uint8Array(N);
    for (var i = 0; i < N; i++) {
      gScore[i]   = Infinity;
      fScore[i]   = Infinity;
      cameFrom[i] = -1;
    }

    function heuristic(x, y) {
      var dx = ex - x;
      var dy = ey - y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(sx, sy);

    var heap = new BinaryHeap(function(idx) { return fScore[idx]; });
    heap.push(startIdx);

    // Предохранитель: каждый узел закрывается один раз, но при lazy
    // decrease-key один и тот же idx может быть в heap до ~8 раз
    // (по одному за каждого соседа). Поэтому верхняя граница числа
    // pop-операций — ASTAR_MAX_STEPS_FACTOR * N.
    var maxPops = N * ASTAR_MAX_STEPS_FACTOR;
    var pops = 0;

    while (heap.size() > 0) {
      if (++pops > maxPops) break;

      var current = heap.pop();
      if (current === endIdx) {
        // Реконструируем путь.
        var path = [];
        var c = current;
        // Защита от зацикливания cameFrom.
        var guard = 0;
        while (c !== -1 && guard++ < N + 1) {
          path.push({ x: c % W, y: (c / W) | 0 });
          if (c === startIdx) break;
          c = cameFrom[c];
        }
        path.reverse();
        return path;
      }
      if (closed[current]) continue;
      closed[current] = 1;

      var cx = current % W;
      var cy = (current / W) | 0;
      var gCur = gScore[current];

      for (var d = 0; d < 8; d++) {
        var nx = cx + DX[d];
        var ny = cy + DY[d];
        if (nx < 0 || nx >= W || ny < 0 || ny >= Hh) continue;
        var nIdx = ny * W + nx;
        if (closed[nIdx]) continue;

        var diag = (d >= 4);
        var stepLen = diag ? SQRT2 : 1.0;
        var stepCost = terrainCost(data[nIdx]) * stepLen;
        var tentativeG = gCur + stepCost;

        if (tentativeG < gScore[nIdx]) {
          gScore[nIdx]   = tentativeG;
          cameFrom[nIdx] = current;
          fScore[nIdx]   = tentativeG + heuristic(nx, ny);
          heap.push(nIdx);
        }
      }
    }

    // Путь не найден.
    return [];
  }

  // ────────────────────────────────────────────────────────────────
  // generateRoads — прокладка дорог между ключевыми точками.
  //
  // Соединяет каждую точку со следующей (i → i+1), плюс замыкающее
  // ребро last → first (кольцевая топология), как указано в arma.md
  // Шаг 11. Если точек <2, возвращает [].
  //
  // Замыкание добавляется только при length > 2 — иначе цикл
  // вырождается в дубль того же ребра.
  //
  // Каждая дорога: { path: [{x,y},...] }. Пути короче 2 точек
  // отбрасываются (непроходимый или тривиальный случай).
  //
  // @param {{data:Float32Array,width:number,height:number}} heightmap
  // @param {Array<{x:number,y:number}>} keyPoints
  // @returns {Array<{path:Array<{x:number,y:number}>}>}
  // ────────────────────────────────────────────────────────────────
  function generateRoads(heightmap, keyPoints) {
    if (!heightmap || !heightmap.data) return [];
    if (!Array.isArray(keyPoints) || keyPoints.length < 2) return [];

    var roads = [];

    // 1. Основные рёбра i → i+1.
    for (var i = 0; i < keyPoints.length - 1; i++) {
      var path = astar(heightmap, keyPoints[i], keyPoints[i + 1]);
      if (path && path.length >= 2) {
        roads.push({ path: path });
      }
    }

    // 2. Замыкание last → first (только если точек > 2).
    if (keyPoints.length > 2) {
      var last = keyPoints[keyPoints.length - 1];
      var first = keyPoints[0];
      var closePath = astar(heightmap, last, first);
      if (closePath && closePath.length >= 2) {
        roads.push({ path: closePath });
      }
    }

    return roads;
  }

  // ────────────────────────────────────────────────────────────────
  // Экспорт: глобалы (браузер) + module.exports (Node.js / vm)
  // ────────────────────────────────────────────────────────────────
  var api = {
    generateKeyPoints: generateKeyPoints,
    astar: astar,
    generateRoads: generateRoads,
    terrainCost: terrainCost,
    BinaryHeap: BinaryHeap,
    // константы открыты для тестов
    PLAIN_MIN: PLAIN_MIN,
    PLAIN_MAX: PLAIN_MAX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.generateKeyPoints = generateKeyPoints;
    root.astar             = astar;
    root.generateRoads     = generateRoads;
    root.terrainCost       = terrainCost;
    root.BinaryHeap        = BinaryHeap;
  }
})(typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : this);
