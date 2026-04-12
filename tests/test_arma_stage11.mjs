// Тесты Шага 11 (arma.md) — Roads: A* pathfinding + generateRoads
// Запуск: node tests/test_arma_stage11.mjs
//
// Чеклист из arma.md Шаг 11:
//   [1] astar(heightmap, {x:10,y:10}, {x:200,y:200}) → массив точек.
//   [2] Путь не проходит через h < 0.20 (вода) при наличии обхода.
//   [3] generateRoads соединяет все keyPoints + кольцевое замыкание.
//   [4] Детерминированность: одинаковые входы → одинаковый путь.
//   [5] Terrain cost формула: cost(0.45) ≈ 2.8, вода=99, горы=10.
//   [6] BinaryHeap корректно выдаёт элементы по возрастанию ключа.
//   [7] Граничные случаи: невалидные входы, start==end, нет пути.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noisePath = resolve(__dirname, '..', 'engine', 'noise.js');
const roadsPath = resolve(__dirname, '..', 'engine', 'roads.js');

// ──────────────────────────────────────────────────────────
// VM-контекст (идентичный test_arma_stage10.mjs)
// ──────────────────────────────────────────────────────────
const ctx = {
  module: { exports: {} },
  require: undefined,
  console,
  Number,
  Math,
  Float32Array,
  Float64Array,
  Uint8Array,
  Uint8ClampedArray,
  Int32Array,
  Array,
  Object,
  Error,
  Infinity,
  isFinite,
  parseInt,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// Load engine/noise.js
vm.runInContext(readFileSync(noisePath, 'utf8'), ctx, { filename: noisePath });
const noiseExports = ctx.module.exports;

// Публикуем в root
ctx.mulberry32        = noiseExports.mulberry32;
ctx.getHeight         = noiseExports.getHeight;
ctx.PerlinNoise       = noiseExports.PerlinNoise;
ctx.fbm               = noiseExports.fbm;
ctx.domainWarp        = noiseExports.domainWarp;
ctx.generateHeightmap = noiseExports.generateHeightmap;

// Load engine/roads.js
ctx.module = { exports: {} };
vm.runInContext(readFileSync(roadsPath, 'utf8'), ctx, { filename: roadsPath });
const roadsExports = ctx.module.exports;

const {
  generateKeyPoints,
  astar,
  generateRoads,
  terrainCost,
  BinaryHeap,
} = roadsExports;
const { generateHeightmap, getHeight } = noiseExports;

// ──────────────────────────────────────────────────────────
// Тест-раннер
// ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name + ' — ' + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function approxEq(a, b, eps) {
  return Math.abs(a - b) <= (eps == null ? 1e-9 : eps);
}

// ──────────────────────────────────────────────────────────
// Искусственные heightmaps
// ──────────────────────────────────────────────────────────
function makeFlatHeightmap(W, H, v) {
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = v;
  return { data, width: W, height: H };
}

/**
 * Карта с "островом" воды посередине. По периметру — равнина (h=0.45).
 * Центральная область [wX0..wX1]×[wY0..wY1] — вода (h=0.05).
 */
function makeIslandMap(W, H) {
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = 0.45;
  const wX0 = (W * 0.3) | 0, wX1 = (W * 0.7) | 0;
  const wY0 = (H * 0.3) | 0, wY1 = (H * 0.7) | 0;
  for (let y = wY0; y < wY1; y++) {
    for (let x = wX0; x < wX1; x++) {
      data[y * W + x] = 0.05;
    }
  }
  return { data, width: W, height: H };
}

/**
 * Карта с "стеной" воды вертикально, но с разрывом — коридор для обхода.
 * Левая половина равнина, правая половина равнина, между ними стена воды
 * с проходом в верхней части.
 */
function makeWalledMap(W, H) {
  const data = new Float32Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = 0.45;
  const wallX = (W / 2) | 0;
  for (let y = 0; y < H; y++) {
    // оставляем проход сверху: y < 5
    if (y < 5) continue;
    data[y * W + wallX] = 0.05;
  }
  return { data, width: W, height: H };
}

// ──────────────────────────────────────────────────────────
// Тесты
// ──────────────────────────────────────────────────────────
console.log('═══ Шаг 11 (arma.md) — Roads: A* + generateRoads ═══');

// ── API surface ──
console.log('\n[API surface]');

test('astar is a function', () => {
  assert(typeof astar === 'function');
});

test('generateRoads is a function', () => {
  assert(typeof generateRoads === 'function');
});

test('terrainCost is a function', () => {
  assert(typeof terrainCost === 'function');
});

test('BinaryHeap is a constructor', () => {
  assert(typeof BinaryHeap === 'function');
});

// ── terrainCost формула ──
console.log('\n[terrainCost — формула из arma.md]');

test('cost(0.10) = 99 (вода)', () => {
  assert(terrainCost(0.10) === 99);
});

test('cost(0.19) = 99 (вода, верхняя граница)', () => {
  assert(terrainCost(0.19) === 99);
});

test('cost(0.20) = 1.8 (равнина, пограничное)', () => {
  // 1.0 + 0.20 * 4.0 = 1.8
  assert(approxEq(terrainCost(0.20), 1.8));
});

test('cost(0.45) ≈ 2.8 (равнина, arma.md spec)', () => {
  assert(approxEq(terrainCost(0.45), 2.8));
});

test('cost(0.80) = 4.2 (пограничное, до override)', () => {
  // 1.0 + 0.80 * 4.0 = 4.2
  assert(approxEq(terrainCost(0.80), 4.2));
});

test('cost(0.85) = 10 (горы)', () => {
  assert(terrainCost(0.85) === 10);
});

test('cost(0.95) = 10 (снежные пики)', () => {
  assert(terrainCost(0.95) === 10);
});

// ── BinaryHeap ──
console.log('\n[BinaryHeap]');

test('pop возвращает элементы в возрастающем порядке', () => {
  const scores = { 0: 5, 1: 2, 2: 8, 3: 1, 4: 3 };
  const h = new BinaryHeap((x) => scores[x]);
  [0,1,2,3,4].forEach((v) => h.push(v));
  const out = [];
  while (h.size() > 0) out.push(h.pop());
  // Ожидаем порядок по score: 3(1), 1(2), 4(3), 0(5), 2(8)
  const ordered = out.map((id) => scores[id]);
  for (let i = 1; i < ordered.length; i++) {
    assert(ordered[i - 1] <= ordered[i], 'not sorted at ' + i);
  }
});

test('push/pop 200 случайных элементов сохраняет порядок', () => {
  const vals = {};
  const h = new BinaryHeap((x) => vals[x]);
  for (let i = 0; i < 200; i++) {
    vals[i] = Math.random();
    h.push(i);
  }
  let prev = -Infinity;
  while (h.size() > 0) {
    const id = h.pop();
    assert(vals[id] >= prev, 'heap order broken');
    prev = vals[id];
  }
});

// ── astar на реальном heightmap ──
console.log('\n[astar — реальный heightmap]');

test('возвращает массив точек между (10,10) и (200,200)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const path = astar(hm, { x: 10, y: 10 }, { x: 200, y: 200 });
  assert(Array.isArray(path), 'not array');
  assert(path.length >= 2, 'path too short: ' + path.length);
});

test('путь начинается в start, кончается в end', () => {
  const hm = generateHeightmap(256, 256, 42);
  const path = astar(hm, { x: 10, y: 10 }, { x: 200, y: 200 });
  assert(path[0].x === 10 && path[0].y === 10, 'wrong start');
  const last = path[path.length - 1];
  assert(last.x === 200 && last.y === 200, 'wrong end');
});

test('каждый шаг — переход к одному из 8 соседей', () => {
  const hm = generateHeightmap(256, 256, 42);
  const path = astar(hm, { x: 10, y: 10 }, { x: 200, y: 200 });
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);
    assert(dx <= 1 && dy <= 1 && (dx + dy) > 0,
      `step ${i}: dx=${dx} dy=${dy}`);
  }
});

test('все точки пути в пределах карты', () => {
  const hm = generateHeightmap(256, 256, 42);
  const path = astar(hm, { x: 10, y: 10 }, { x: 200, y: 200 });
  for (const p of path) {
    assert(p.x >= 0 && p.x < 256, 'x out: ' + p.x);
    assert(p.y >= 0 && p.y < 256, 'y out: ' + p.y);
  }
});

test('детерминированность: одинаковый вход → одинаковый путь', () => {
  const hm = generateHeightmap(256, 256, 42);
  const a = astar(hm, { x: 10, y: 10 }, { x: 200, y: 200 });
  const b = astar(hm, { x: 10, y: 10 }, { x: 200, y: 200 });
  assert(a.length === b.length, `len ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].x === b[i].x && a[i].y === b[i].y,
      `point ${i} differs`);
  }
});

// ── astar обход воды ──
console.log('\n[astar — обход воды]');

test('обходит водный остров (makeIslandMap)', () => {
  const hm = makeIslandMap(60, 60);
  // start — верхний левый, end — нижний правый, прямая через центр = вода.
  const path = astar(hm, { x: 2, y: 2 }, { x: 57, y: 57 });
  assert(path.length >= 2, 'empty path');
  // Считаем сколько пикселей пути попадают в воду.
  let waterHits = 0;
  for (const p of path) {
    if (hm.data[p.y * hm.width + p.x] < 0.20) waterHits++;
  }
  // Обход существует — не должно быть вообще водных пикселей.
  assert(waterHits === 0,
    `путь проходит через воду: ${waterHits} пикселей`);
});

test('находит обход через верхний проход (makeWalledMap)', () => {
  const hm = makeWalledMap(40, 40);
  const path = astar(hm, { x: 5, y: 20 }, { x: 35, y: 20 });
  assert(path.length >= 2, 'empty path');
  let waterHits = 0;
  for (const p of path) {
    if (hm.data[p.y * hm.width + p.x] < 0.20) waterHits++;
  }
  assert(waterHits === 0, 'идёт через воду вместо обхода');
});

test('на однородной равнине путь близок к прямой (длина ≤ 1.5·euclid)', () => {
  const hm = makeFlatHeightmap(50, 50, 0.45);
  const sx = 5, sy = 5, ex = 45, ey = 45;
  const path = astar(hm, { x: sx, y: sy }, { x: ex, y: ey });
  const euclid = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
  // A* на 8-связной сетке с равной стоимостью даёт путь
  // длиной ≈ max(|dx|,|dy|) + (sqrt(2)-1)*min(|dx|,|dy|) шагов.
  // В нашем случае (40,40) — чистая диагональ: 40 шагов по sqrt(2).
  assert(path.length <= euclid * 1.5 + 2,
    `path ${path.length} too long vs euclid ${euclid}`);
});

// ── Граничные случаи astar ──
console.log('\n[astar — граничные случаи]');

test('start === end → путь из одной точки', () => {
  const hm = makeFlatHeightmap(10, 10, 0.45);
  const path = astar(hm, { x: 5, y: 5 }, { x: 5, y: 5 });
  assert(path.length === 1);
  assert(path[0].x === 5 && path[0].y === 5);
});

test('null heightmap → []', () => {
  assert(astar(null, { x: 0, y: 0 }, { x: 1, y: 1 }).length === 0);
});

test('null start/end → []', () => {
  const hm = makeFlatHeightmap(10, 10, 0.45);
  assert(astar(hm, null, { x: 1, y: 1 }).length === 0);
  assert(astar(hm, { x: 1, y: 1 }, null).length === 0);
});

test('координаты за границами clamp-ятся', () => {
  const hm = makeFlatHeightmap(10, 10, 0.45);
  const path = astar(hm, { x: -5, y: -5 }, { x: 100, y: 100 });
  assert(path.length >= 2);
  assert(path[0].x === 0 && path[0].y === 0);
  const last = path[path.length - 1];
  assert(last.x === 9 && last.y === 9);
});

test('непроходимая карта (всё вода) → путь всё равно строится (через 99-стоимость)', () => {
  // Алгоритм должен всё-таки найти путь — вода не непроходима, просто
  // очень дорога. Если вообще нет никакого обхода, astar должен вернуть путь.
  const hm = makeFlatHeightmap(10, 10, 0.05);
  const path = astar(hm, { x: 0, y: 0 }, { x: 9, y: 9 });
  assert(path.length >= 2, 'должен быть хоть какой-то путь');
});

// ── generateRoads ──
console.log('\n[generateRoads]');

test('пустой keyPoints → []', () => {
  const hm = makeFlatHeightmap(20, 20, 0.45);
  assert(generateRoads(hm, []).length === 0);
  assert(generateRoads(hm, [{ x: 5, y: 5 }]).length === 0);
});

test('2 точки → 1 дорога (без замыкания — было бы дубль)', () => {
  const hm = makeFlatHeightmap(30, 30, 0.45);
  const pts = [{ x: 3, y: 3 }, { x: 25, y: 25 }];
  const roads = generateRoads(hm, pts);
  assert(roads.length === 1, 'expected 1 road, got ' + roads.length);
  assert(Array.isArray(roads[0].path));
  assert(roads[0].path.length >= 2);
});

test('3 точки → 3 дороги (цикл: 0→1, 1→2, 2→0)', () => {
  const hm = makeFlatHeightmap(40, 40, 0.45);
  const pts = [
    { x: 5,  y: 5  },
    { x: 30, y: 5  },
    { x: 18, y: 30 },
  ];
  const roads = generateRoads(hm, pts);
  assert(roads.length === 3, 'expected 3 roads, got ' + roads.length);
  for (const r of roads) {
    assert(r.path && r.path.length >= 2);
  }
});

test('4 точки → 4 дороги (0→1, 1→2, 2→3, 3→0)', () => {
  const hm = makeFlatHeightmap(50, 50, 0.45);
  const pts = [
    { x: 5,  y: 5  },
    { x: 40, y: 5  },
    { x: 40, y: 40 },
    { x: 5,  y: 40 },
  ];
  const roads = generateRoads(hm, pts);
  assert(roads.length === 4, 'expected 4 roads, got ' + roads.length);
});

test('дороги на реальном heightmap — соединяют все ключевые точки', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  if (pts.length >= 2) {
    const roads = generateRoads(hm, pts);
    const expected = pts.length === 2 ? 1 : pts.length;
    assert(roads.length === expected,
      `got ${roads.length}, expected ${expected}`);
    // Каждая дорога должна быть непустой.
    for (const r of roads) {
      assert(r.path.length >= 2, 'short path');
    }
  }
});

test('дорога между двумя точками избегает воды (реальная карта)', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  if (pts.length >= 2) {
    const roads = generateRoads(hm, pts);
    // Считаем среднюю долю водных пикселей — должна быть низкой.
    let totalWater = 0, totalLen = 0;
    for (const r of roads) {
      for (const p of r.path) {
        totalLen++;
        if (hm.data[p.y * hm.width + p.x] < 0.20) totalWater++;
      }
    }
    if (totalLen > 0) {
      const frac = totalWater / totalLen;
      // Дороги строго избегают воды, если обход возможен. На реальной карте
      // острова могут быть неизбежны для отдельных точек, но общая доля
      // должна быть очень низкой.
      assert(frac < 0.05,
        `water fraction ${frac.toFixed(3)} too high`);
    }
  }
});

test('детерминированность generateRoads', () => {
  const hm = generateHeightmap(256, 256, 42);
  const pts = generateKeyPoints(hm, 5, 42);
  const a = generateRoads(hm, pts);
  const b = generateRoads(hm, pts);
  assert(a.length === b.length);
  for (let i = 0; i < a.length; i++) {
    assert(a[i].path.length === b[i].path.length, `path ${i} len differs`);
    for (let j = 0; j < a[i].path.length; j++) {
      assert(
        a[i].path[j].x === b[i].path[j].x && a[i].path[j].y === b[i].path[j].y,
        `path ${i} point ${j} differs`
      );
    }
  }
});

// ── Итог ─────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) process.exit(1);
