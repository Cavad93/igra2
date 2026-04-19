// ══════════════════════════════════════════════════════════════════════
// battle_pixi_render.js
// Pixi-рендер тактического боя: читает GAME-объект `bs` из
// engine/tactical_battle.js и строит сцену напрямую, без промежуточных
// адаптеров и без Canvas 2D. Одна функция renderPixiAll(layers, bs, opts)
// полностью перерисовывает сцену; отдельные функции для FX-слоя
// (damage numbers, particles, attack jumps) живут тут же.
//
// Контракт:
//   • Canvas Pixi всегда 880×640 (22×40 × 16×40) — совпадает с сеткой
//     движка, поэтому gridX*40, gridY*40 → пиксели 1:1 без масштабов.
//   • layers.{bg, rivers, roads, forests, units, fx} — берутся из
//     battle_map_pixi.js initBattleMap().
//   • Перерисовка чистит bg/units/fx contents и заново наполняет.
//     Тяжёлые слои terrain рендерятся через кэш-Graphics один раз за бой.
// ══════════════════════════════════════════════════════════════════════

export const BP_W = 22 * 40; // TACTICAL_GRID_COLS * CELL_SIZE
export const BP_H = 16 * 40;
export const BP_CELL = 40;
export const BP_RESERVE_COLS = 3;

// Палитра цветов фона по типу местности.
const TERRAIN_BG = {
  plains:       0x2a4418,
  hills:        0x3a3018,
  mountains:    0x282830,
  river_valley: 0x1a2830,
  coastal_city: 0x1a2828
};

// Цвета юнитов — близки к старой палитре canvas-рендера.
const UNIT_COLOR = {
  player:        { top: 0x4680dd, mid: 0x254d9a, bot: 0x0a1835 },
  enemy:         { top: 0xd24040, mid: 0x8a1a1a, bot: 0x280808 }
};
const BORDER_PLAYER    = 0x4488dd;
const BORDER_ENEMY     = 0xdd5533;
const BORDER_COMMANDER = 0xffd700;
const BORDER_ROUTING   = 0x555555;

// Детерминированный RNG по seed — для стабильного рисунка травы/холмов.
function bpRng(seed) {
  let s = seed | 0;
  return function() {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

// ──────────────────────────────────────────────────────────────────────
// Шаг 1 — Terrain (кэш на Graphics, один раз за бой)
// ──────────────────────────────────────────────────────────────────────

let _cachedTerrainKey = null; // terrain name + elevated cells signature

function _terrainKey(terrain, elevated) {
  var arr = [];
  elevated.forEach(function(k) { arr.push(k); });
  arr.sort();
  return terrain + '|' + arr.join(',');
}

/**
 * renderPixiTerrain(layers, terrain, elevatedCells)
 *
 * Создаёт в layers.bg один PIXI.Graphics, который закрашивает фон под
 * тип местности + подсвечивает возвышенности жёлтыми треугольниками
 * в правом-нижнем углу клетки + рисует зоны резерва + сетку.
 *
 * Кэшируется по сигнатуре (terrain + elevated) — повторные вызовы с теми
 * же параметрами no-op.
 */
export function renderPixiTerrain(layers, terrain, elevatedCells) {
  if (!layers || !layers.bg) return;
  var key = _terrainKey(terrain, elevatedCells);
  if (key === _cachedTerrainKey && layers.bg.children.length > 0) return;
  _cachedTerrainKey = key;

  // Очистить старый terrain.
  while (layers.bg.children.length) {
    var c = layers.bg.children[0];
    layers.bg.removeChild(c);
    try { c.destroy(); } catch (_) {}
  }

  var g = new PIXI.Graphics();

  // 1) Базовая заливка.
  var bg = TERRAIN_BG[terrain] != null ? TERRAIN_BG[terrain] : 0x2a3020;
  g.rect(0, 0, BP_W, BP_H).fill({ color: bg, alpha: 1.0 });

  // 2) Травка/холмы/горы — мелкие акценты, стабильный seed по координатам.
  for (var col = 0; col < 22; col++) {
    for (var row = 0; row < 16; row++) {
      var seed = col * 37 + row * 53 + (terrain.charCodeAt(0) || 0);
      var rng  = bpRng(seed);
      var cpx  = col * BP_CELL;
      var cpy  = row * BP_CELL;
      if (terrain === 'plains') {
        _paintPixiGrass(g, cpx, cpy, rng);
      } else if (terrain === 'hills') {
        if (rng() > 0.5) _paintPixiHills(g, cpx, cpy, bpRng(seed + 1));
        else             _paintPixiGrass(g, cpx, cpy, bpRng(seed + 2));
      } else if (terrain === 'mountains') {
        if (rng() > 0.35) _paintPixiMountain(g, cpx, cpy, bpRng(seed + 1));
      } else if (terrain === 'river_valley') {
        _paintPixiGrass(g, cpx, cpy, rng);
      }
    }
  }

  // 3) Возвышенные клетки — светлая заливка + жёлтый треугольник.
  elevatedCells.forEach(function(k) {
    var parts = k.split(',');
    var ex = parseInt(parts[0], 10);
    var ey = parseInt(parts[1], 10);
    g.rect(ex * BP_CELL, ey * BP_CELL, BP_CELL, BP_CELL)
     .fill({ color: 0xffffc8, alpha: 0.08 });
    // Треугольник в правом-нижнем углу.
    g.moveTo((ex + 1) * BP_CELL - 8, (ey + 1) * BP_CELL);
    g.lineTo((ex + 1) * BP_CELL,     (ey + 1) * BP_CELL);
    g.lineTo((ex + 1) * BP_CELL,     (ey + 1) * BP_CELL - 8);
    g.lineTo((ex + 1) * BP_CELL - 8, (ey + 1) * BP_CELL);
    g.fill({ color: 0xffdc64, alpha: 0.35 });
  });

  // 4) Зоны резерва — слева (игрок) и справа (враг).
  g.rect(0, 0, BP_RESERVE_COLS * BP_CELL, BP_H)
   .fill({ color: 0x64c864, alpha: 0.05 });
  g.rect((22 - BP_RESERVE_COLS) * BP_CELL, 0, BP_RESERVE_COLS * BP_CELL, BP_H)
   .fill({ color: 0xc85050, alpha: 0.05 });

  // 5) Линии сетки.
  for (var x = 0; x <= 22; x++) {
    g.moveTo(x * BP_CELL, 0).lineTo(x * BP_CELL, BP_H);
  }
  for (var y = 0; y <= 16; y++) {
    g.moveTo(0, y * BP_CELL).lineTo(BP_W, y * BP_CELL);
  }
  g.stroke({ width: 0.5, color: 0xffffff, alpha: 0.06 });

  layers.bg.addChild(g);

  // 6) Подписи резервных зон — отдельные PIXI.Text (Graphics текст не рисует).
  if (typeof PIXI !== 'undefined' && PIXI.Text) {
    var labelStyle = { fontFamily: 'monospace', fontSize: 10, fill: 0x64c864, align: 'left' };
    var tL = new PIXI.Text({ text: 'РЕЗЕРВ', style: labelStyle });
    tL.x = 4; tL.y = 4; tL.alpha = 0.5;
    layers.bg.addChild(tL);
    var tR = new PIXI.Text({
      text:  'РЕЗЕРВ',
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0xc85050, align: 'left' }
    });
    tR.x = (22 - BP_RESERVE_COLS) * BP_CELL + 4; tR.y = 4; tR.alpha = 0.5;
    layers.bg.addChild(tR);
  }
}

function _paintPixiGrass(g, px, py, rng) {
  var n = 3 + (rng() * 4 | 0);
  for (var i = 0; i < n; i++) {
    var gx = px + 3 + rng() * (BP_CELL - 6);
    var gy = py + BP_CELL * 0.35 + rng() * BP_CELL * 0.55;
    var h  = 3 + rng() * 4;
    g.moveTo(gx, gy).lineTo(gx - 2, gy - h);
    g.moveTo(gx, gy).lineTo(gx + 2, gy - h);
  }
  g.stroke({ width: 1, color: 0x5096a0, alpha: 0.28 });
}

function _paintPixiHills(g, px, py, rng) {
  var base = py + BP_CELL - 3;
  var n    = 1 + (rng() * 2 | 0);
  for (var i = 0; i < n; i++) {
    var hx = px + BP_CELL * (0.2 + rng() * 0.6);
    var hw = BP_CELL * (0.22 + rng() * 0.18);
    var hh = BP_CELL * (0.22 + rng() * 0.18);
    g.moveTo(hx - hw, base)
     .lineTo(hx,      base - hh)
     .lineTo(hx + hw, base)
     .lineTo(hx - hw, base)
     .fill({ color: 0x6e5a32, alpha: 0.22 });
  }
}

function _paintPixiMountain(g, px, py, rng) {
  var base = py + BP_CELL - 2;
  var hx   = px + BP_CELL * (0.35 + rng() * 0.3);
  var hw   = BP_CELL * 0.40;
  var hh   = BP_CELL * 0.58;
  g.moveTo(hx - hw,         base)
   .lineTo(hx - hw * 0.3,   base - hh * 0.55)
   .lineTo(hx,               base - hh)
   .lineTo(hx + hw * 0.3,   base - hh * 0.55)
   .lineTo(hx + hw,          base)
   .lineTo(hx - hw,          base)
   .fill({ color: 0x5f5869, alpha: 0.30 });
  // Шапка.
  g.moveTo(hx - hw * 0.20, base - hh * 0.74)
   .lineTo(hx,              base - hh)
   .lineTo(hx + hw * 0.20, base - hh * 0.74)
   .lineTo(hx - hw * 0.20, base - hh * 0.74)
   .fill({ color: 0xd2e1ff, alpha: 0.28 });
}

/**
 * clearTerrainCache — сбросить сигнатуру, чтобы следующий renderPixiTerrain
 * пересоздал графику (например, при открытии нового боя).
 */
export function clearPixiTerrainCache() {
  _cachedTerrainKey = null;
}

// ──────────────────────────────────────────────────────────────────────
// Шаг 2 — Подсветка радиуса движения выбранного юнита
// ──────────────────────────────────────────────────────────────────────

/**
 * renderPixiMovementRange(layers, unit, bs, findUnitAtFn)
 *
 * Рисует в layers.roads (над terrain, под юнитами) полупрозрачную заливку
 * клеток, куда unit может пойти за один тик. Кавалерия на возвышенности
 * теряет 1 ед. скорости.
 */
export function renderPixiMovementRange(layers, unit, bs, findUnitAtFn) {
  if (!layers || !layers.roads) return;
  if (!unit || unit._movedThisTick) return;

  var cavOnElev = unit.type === 'cavalry' &&
    bs.elevatedCells.has(unit.gridX + ',' + unit.gridY);
  var spd = cavOnElev ? Math.max(1, unit.moveSpeed - 1) : unit.moveSpeed;

  var g = new PIXI.Graphics();
  for (var gx = 0; gx < 22; gx++) {
    for (var gy = 0; gy < 16; gy++) {
      var dist = Math.abs(gx - unit.gridX) + Math.abs(gy - unit.gridY);
      if (dist > 0 && dist <= spd && !findUnitAtFn(gx, gy, bs)) {
        g.rect(gx * BP_CELL + 1, gy * BP_CELL + 1, BP_CELL - 2, BP_CELL - 2);
      }
    }
  }
  g.fill({ color: 0x00c8c8, alpha: 0.10 });
  g.stroke({ width: 0.5, color: 0x00c8c8, alpha: 0.35 });
  layers.roads.addChild(g);
}

// ──────────────────────────────────────────────────────────────────────
// Шаг 3 — Рендер одного юнита
// ──────────────────────────────────────────────────────────────────────

/**
 * renderPixiUnit(layers, unit, bs, opts)
 *
 * Рисует юнит как скруглённый квадрат со стороной ∝ strength, с:
 *  • градиентной заливкой по стороне (player/enemy)
 *  • сеткой белых точек-солдатиков (∝ strength)
 *  • подписью strength под блоком
 *  • полосой силы (внизу) и морали (сверху)
 *  • иконкой типа юнита (infantry/cavalry/archers)
 *  • звёздочкой для командира
 *  • пульсирующим белым контуром при unit.selected
 *  • пунктирной рамкой при isReserve
 *  • мерцанием при isRouting
 *
 * opts:
 *   maxStrength       — для нормализации размера (bs.maxStrengthInBattle)
 *   attackAnim        — { fromX, fromY, toX, toY, t, dir } или null
 *   nowMs             — Date.now() для мерцаний
 */
export function renderPixiUnit(layers, unit, bs, opts) {
  if (!layers || !layers.units || !unit) return;
  opts = opts || {};
  var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();

  // A5: анимация атаки — смещаем на 30% пути к цели с ease-out.
  var offsetX = 0, offsetY = 0;
  var anim = opts.attackAnim;
  if (anim) {
    var ease = anim.t * (2 - anim.t);
    offsetX = (anim.toX - anim.fromX) * BP_CELL * ease * 0.30;
    offsetY = (anim.toY - anim.fromY) * BP_CELL * ease * 0.30;
  }

  var cellX = unit.gridX * BP_CELL + offsetX;
  var cellY = unit.gridY * BP_CELL + offsetY;

  // Размер зависит от силы.
  var UNIT_MIN = 26, UNIT_MAX = 52;
  var ratio = Math.min(1, unit.strength / (opts.maxStrength || unit.maxStrength || 1));
  var sz  = UNIT_MIN + (UNIT_MAX - UNIT_MIN) * ratio;
  var px  = cellX + (BP_CELL - sz) / 2;
  var py  = cellY + (BP_CELL - sz) / 2;
  var cx  = px + sz / 2;
  var cy  = py + sz / 2;
  var R   = 4;

  var isPlayer = unit.side === 'player';
  var pal      = isPlayer ? UNIT_COLOR.player : UNIT_COLOR.enemy;
  var strPct   = Math.max(0, Math.min(1, unit.strength / (unit.maxStrength || 1)));

  var borderColor = unit.isCommander     ? BORDER_COMMANDER
                  : unit.strength > 5000 ? 0xe8c840
                  : unit.isRouting       ? BORDER_ROUTING
                  : isPlayer             ? BORDER_PLAYER
                  :                        BORDER_ENEMY;

  // Alpha контейнера для мигания/прозрачности.
  var containerAlpha;
  if (unit.isRouting) {
    containerAlpha = (Math.floor(nowMs / 400) % 2 === 0) ? 0.6 : 0.2;
  } else {
    containerAlpha = unit.isReserve ? 0.65 : 1.0;
  }

  var container = new PIXI.Container();
  container.alpha = containerAlpha;
  container.zIndex = cellY; // Painter's algorithm

  // 1) Заливка квадрата — три слоя (тёмный, средний, светлый) через три
  //    прямоугольника убывающего размера — простой заменитель
  //    radialGradient из Canvas 2D.
  var gBox = new PIXI.Graphics();
  gBox.roundRect(px, py, sz, sz, R)
      .fill({ color: pal.bot, alpha: 0.8 });
  gBox.roundRect(px + 1, py + 1, sz - 2, sz - 2, R - 1)
      .fill({ color: pal.mid, alpha: 0.85 });
  gBox.roundRect(px + sz * 0.1, py + sz * 0.1, sz * 0.75, sz * 0.75, R - 1)
      .fill({ color: pal.top, alpha: 0.45 });

  // Тонкий светлый bevel сверху-слева.
  gBox.roundRect(px, py, sz, sz * 0.35, R)
      .fill({ color: 0xffffff, alpha: 0.10 });

  // Обводка.
  gBox.roundRect(px, py, sz, sz, R);
  if (unit.isReserve) {
    gBox.stroke({ width: 1.5, color: borderColor, alpha: 0.85 }); // без dash
  } else {
    gBox.stroke({ width: unit.isCommander ? 2.5 : 1.5, color: borderColor, alpha: 1.0 });
  }
  container.addChild(gBox);

  // 2) Сетка точек-солдатиков (подход старого canvas).
  var DOT_SZ = 3, DOT_MAX = 25, UNIT_BASE = 400;
  var dotCount = Math.min(DOT_MAX, Math.max(1, Math.round(unit.strength / UNIT_BASE)));
  var dotCols  = Math.ceil(Math.sqrt(dotCount));
  var dotRows  = Math.ceil(dotCount / dotCols);
  var gapX     = sz / (dotCols + 1);
  var gapY     = (sz * 0.65) / (dotRows + 1);
  var gDots    = new PIXI.Graphics();
  for (var r = 0; r < dotRows; r++) {
    for (var c = 0; c < dotCols; c++) {
      if (r * dotCols + c >= dotCount) break;
      gDots.rect(
        px + gapX * (c + 1) - DOT_SZ / 2,
        py + gapY * (r + 1) - DOT_SZ / 2,
        DOT_SZ, DOT_SZ
      );
    }
  }
  gDots.fill({ color: 0xffffff, alpha: unit.isRouting ? 0.2 : 0.80 });
  container.addChild(gDots);

  // 3) Иконка типа юнита.
  var gIcon = new PIXI.Graphics();
  _drawPixiUnitIcon(gIcon, unit.type, cx, cy - sz * 0.04, sz);
  gIcon.alpha = unit.isRouting ? 0.40 : 0.88;
  container.addChild(gIcon);

  // 4) Полоса силы — под блоком.
  var barColor = strPct > 0.6 ? 0x44dd44 : strPct > 0.3 ? 0xddaa00 : 0xdd2222;
  var gBarStr  = new PIXI.Graphics();
  gBarStr.roundRect(px, py + sz + 3, sz, 4, 2)
         .fill({ color: 0x1a1a1a, alpha: 0.9 });
  if (strPct > 0) {
    gBarStr.roundRect(px, py + sz + 3, sz * strPct, 4, 2)
           .fill({ color: barColor, alpha: 0.9 });
  }
  container.addChild(gBarStr);

  // 5) Полоса морали — сверху.
  var moralePct = Math.max(0, Math.min(1, unit.morale / 100));
  var gBarMor   = new PIXI.Graphics();
  gBarMor.roundRect(px, py - 6, sz, 3, 1.5)
         .fill({ color: 0x1a1a1a, alpha: 0.9 });
  if (moralePct > 0) {
    gBarMor.roundRect(px, py - 6, sz * moralePct, 3, 1.5)
           .fill({ color: 0x4488ff, alpha: 0.9 });
  }
  container.addChild(gBarMor);

  // 6) Число солдат снизу (с outline).
  if (typeof PIXI !== 'undefined' && PIXI.Text) {
    var labelTxt = unit.strength >= 1000
      ? (unit.strength / 1000).toFixed(1) + 'k'
      : '' + unit.strength;
    var fontPx = Math.max(8, (sz * 0.17) | 0);
    var t = new PIXI.Text({
      text: labelTxt,
      style: {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize:   fontPx,
        fill:       0xf0e8c0,
        stroke:     { color: 0x000000, width: 2.5 },
        fontWeight: 'bold',
        align:      'center'
      }
    });
    t.anchor = { x: 0.5, y: 1.0 };
    t.x = cx;
    t.y = py + sz * 0.94 + fontPx;
    t.alpha = unit.isRouting ? 0.4 : 1.0;
    container.addChild(t);
  }

  // 7) Звёздочка командира — правый-верхний угол.
  if (unit.isCommander && typeof PIXI !== 'undefined' && PIXI.Text) {
    var star = new PIXI.Text({
      text: '★',
      style: { fontFamily: 'monospace', fontSize: Math.max(10, (sz * 0.28) | 0), fill: 0xffd700 }
    });
    star.anchor = { x: 1, y: 0 };
    star.x = px + sz - 2;
    star.y = py + 1;
    container.addChild(star);
  }

  // 8) Пульсирующая белая обводка при selected.
  if (unit.selected) {
    var pulse = 0.55 + 0.45 * Math.sin(nowMs / 220);
    var gSel  = new PIXI.Graphics();
    gSel.roundRect(px - 3, py - 3, sz + 6, sz + 6, R + 2)
        .stroke({ width: 2.0, color: 0xffffff, alpha: pulse });
    container.addChild(gSel);
  }

  layers.units.addChild(container);
}

// ──────────────────────────────────────────────────────────────────────
// Иконки типов юнитов — Pixi Graphics примитивы, без emoji.
// ──────────────────────────────────────────────────────────────────────

function _drawPixiUnitIcon(g, type, cx, cy, sz) {
  var col  = 0xe8e8e8;
  var alp  = 0.9;
  var w    = Math.max(1.2, sz * 0.045);

  if (type === 'infantry') {
    // Два скрещённых меча.
    var s = sz * 0.26;
    g.moveTo(cx - s, cy - s).lineTo(cx + s, cy + s)
     .moveTo(cx + s, cy - s).lineTo(cx - s, cy + s)
     .stroke({ width: w, color: col, alpha: alp });
    // Гарды.
    var gd = s * 0.5;
    g.moveTo(cx - gd, cy - gd).lineTo(cx + gd, cy - gd)
     .moveTo(cx - gd, cy + gd).lineTo(cx + gd, cy + gd)
     .stroke({ width: w * 0.7, color: col, alpha: alp });
    return;
  }

  if (type === 'cavalry') {
    var sc = sz * 0.20;
    // Тело (эллипс приближаем кругом).
    g.ellipse(cx, cy, sc * 1.3, sc * 0.7)
     .stroke({ width: w, color: col, alpha: alp });
    // Голова.
    g.ellipse(cx + sc * 1.2, cy - sc * 0.5, sc * 0.48, sc * 0.38)
     .stroke({ width: w, color: col, alpha: alp });
    // Ноги — 4 штуки.
    var legY = cy + sc * 0.6;
    var legs = [[-0.75, -0.1], [-0.25, 0.1], [0.25, -0.1], [0.75, 0.1]];
    for (var li = 0; li < legs.length; li++) {
      var lx  = legs[li][0] * sc;
      var ang = legs[li][1] * sc;
      g.moveTo(cx + lx, legY)
       .lineTo(cx + lx + ang, legY + sc * 0.9);
    }
    g.stroke({ width: w * 0.7, color: col, alpha: alp });
    return;
  }

  if (type === 'archers') {
    var sa = sz * 0.26;
    // Дуга лука — рисуем как два отрезка (arc в Graphics v8 сложнее).
    g.moveTo(cx - sa * 0.25 + Math.cos(-Math.PI * 0.6) * sa,
             cy + Math.sin(-Math.PI * 0.6) * sa)
     .bezierCurveTo(
        cx + sa * 0.3,        cy - sa * 0.7,
        cx + sa * 0.3,        cy + sa * 0.7,
        cx - sa * 0.25 + Math.cos(Math.PI * 0.6) * sa,
        cy + Math.sin(Math.PI * 0.6) * sa
      )
     .stroke({ width: w, color: col, alpha: alp });
    // Стрела.
    g.moveTo(cx - sa * 0.05, cy).lineTo(cx + sa * 1.1, cy)
     .moveTo(cx + sa * 1.1, cy).lineTo(cx + sa * 0.82, cy - sa * 0.22)
     .moveTo(cx + sa * 1.1, cy).lineTo(cx + sa * 0.82, cy + sa * 0.22)
     .stroke({ width: w * 0.7, color: col, alpha: alp });
    return;
  }

  // Fallback — маленький круг.
  g.circle(cx, cy, sz * 0.12).fill({ color: col, alpha: alp });
}

// ──────────────────────────────────────────────────────────────────────
// Шаг 4 — Флаги стандартов, фланговая стрелка, линия прицела
// ──────────────────────────────────────────────────────────────────────

/**
 * renderPixiStandards(layers, bs)
 *
 * Рисует эмодзи-флажок 🚩 на клетке стандарта (исходной позиции командира),
 * но только если командир ушёл со своей клетки.
 */
export function renderPixiStandards(layers, bs) {
  if (!layers || !layers.fx) return;
  if (typeof PIXI === 'undefined' || !PIXI.Text) return;

  var pairs = [
    [bs.enemyStandardPos,  bs.enemyUnits.find(function(u){ return u.isCommander; })],
    [bs.playerStandardPos, bs.playerUnits.find(function(u){ return u.isCommander; })]
  ];
  for (var i = 0; i < pairs.length; i++) {
    var std = pairs[i][0];
    var cmd = pairs[i][1];
    if (!std || !cmd) continue;
    if (cmd.gridX === std.x && cmd.gridY === std.y) continue;
    var t = new PIXI.Text({
      text: '🚩',
      style: { fontFamily: 'monospace', fontSize: 18, fill: 0xffffff }
    });
    t.x = std.x * BP_CELL + 4;
    t.y = std.y * BP_CELL + 2;
    layers.fx.addChild(t);
  }
}

/**
 * renderPixiFlankArrow(layers, bs)
 *
 * Пунктирная стрелка фланговой/тыльной атаки. Живёт 1 ход —
 * после рендеринга bs._lastFlankArrow обнуляется.
 */
export function renderPixiFlankArrow(layers, bs) {
  if (!layers || !layers.fx) return;
  var a = bs._lastFlankArrow;
  if (!a) return;
  var color = a.type === 'rear' ? 0xff3333 : 0xffaa00;
  var fx = a.fromX * BP_CELL + BP_CELL / 2;
  var fy = a.fromY * BP_CELL + BP_CELL / 2;
  var tx = a.toX   * BP_CELL + BP_CELL / 2;
  var ty = a.toY   * BP_CELL + BP_CELL / 2;

  var g = new PIXI.Graphics();
  // Пунктир имитируем серией отрезков.
  var dx = tx - fx, dy = ty - fy;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) { bs._lastFlankArrow = null; return; }
  var nx = dx / len, ny = dy / len;
  var dash = 5, gap = 3;
  for (var u = 0; u < len; u += (dash + gap)) {
    var u2 = Math.min(len, u + dash);
    g.moveTo(fx + nx * u,  fy + ny * u)
     .lineTo(fx + nx * u2, fy + ny * u2);
  }
  g.stroke({ width: 2, color: color, alpha: 1.0 });
  layers.fx.addChild(g);
  bs._lastFlankArrow = null;
}

/**
 * renderPixiAimLine(layers, selected, enemy)
 *
 * Пунктирная красная линия от выбранного юнита к врагу под курсором.
 * Вызывать каждый кадр (alpha пульсирует через Date.now()).
 */
export function renderPixiAimLine(layers, selected, enemy) {
  if (!layers || !layers.fx || !selected || !enemy) return;
  var sx = selected.gridX * BP_CELL + BP_CELL / 2;
  var sy = selected.gridY * BP_CELL + BP_CELL / 2;
  var ex = enemy.gridX    * BP_CELL + BP_CELL / 2;
  var ey = enemy.gridY    * BP_CELL + BP_CELL / 2;

  var g = new PIXI.Graphics();
  // Пунктир.
  var dx = ex - sx, dy = ey - sy;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.1) {
    var nx = dx / len, ny = dy / len;
    var dash = 5, gap = 4;
    var offset = (Date.now() / 50) % (dash + gap);
    for (var u = -offset; u < len; u += (dash + gap)) {
      var u1 = Math.max(0, u);
      var u2 = Math.min(len, u + dash);
      if (u2 > u1) {
        g.moveTo(sx + nx * u1, sy + ny * u1)
         .lineTo(sx + nx * u2, sy + ny * u2);
      }
    }
    g.stroke({ width: 1.5, color: 0xff3c3c, alpha: 0.75 });
  }
  // Прицел-крестик на враге.
  var cs = 5;
  g.moveTo(ex - cs, ey - cs).lineTo(ex + cs, ey + cs)
   .moveTo(ex + cs, ey - cs).lineTo(ex - cs, ey + cs)
   .stroke({ width: 1.5, color: 0xff5050, alpha: 0.9 });
  layers.fx.addChild(g);
}

// ──────────────────────────────────────────────────────────────────────
// Шаг 5 — Сквозной рендер сцены
// ──────────────────────────────────────────────────────────────────────

/**
 * clearLayer(layer) — удаляет все children и вызывает destroy на каждом.
 */
function clearLayer(layer) {
  if (!layer || !layer.children) return;
  while (layer.children.length) {
    var c = layer.children[layer.children.length - 1];
    layer.removeChild(c);
    try { c.destroy({ children: true }); } catch (_) {}
  }
}

/**
 * renderPixiAll(layers, bs, opts)
 *
 * Полный перерендер сцены (кроме terrain — он кэшируется). Вызывается
 * из tactical_map.js по rAF и по tacticalTick.
 *
 * opts:
 *   findUnitAtFn  — (gx, gy, bs) → unit|null
 *   selectedUnit  — текущий выбранный юнит (или null)
 *   hoverEnemy    — враг под курсором для aim-line (или null)
 *   attackAnims   — Map<unitId, { fromX, fromY, toX, toY, t, dir }>
 *   floatNums     — массив {x, y, val, alpha, vy, color, _text}
 *   particles     — массив {x, y, r, color, life, _g} (не используем пока — см. эффекты)
 *   nowMs         — Date.now()
 */
export function renderPixiAll(layers, bs, opts) {
  if (!layers || !bs) return;
  opts = opts || {};

  // 1) Terrain — ленивая кэширующая рисовка.
  renderPixiTerrain(layers, bs.terrain || 'plains', bs.elevatedCells || new Set());

  // 2) Слой roads используем под подсветку радиуса движения.
  clearLayer(layers.roads);
  if (opts.selectedUnit && opts.findUnitAtFn) {
    renderPixiMovementRange(layers, opts.selectedUnit, bs, opts.findUnitAtFn);
  }

  // 3) Unit-слой.
  clearLayer(layers.units);
  layers.units.sortableChildren = true;
  var all = bs.playerUnits.concat(bs.enemyUnits);
  var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  for (var i = 0; i < all.length; i++) {
    var u = all[i];
    if (u.strength <= 0) continue;
    var anim = (opts.attackAnims && opts.attackAnims.get)
      ? opts.attackAnims.get(u.id) : null;
    renderPixiUnit(layers, u, bs, {
      maxStrength: bs.maxStrengthInBattle,
      attackAnim:  anim || null,
      nowMs:       nowMs
    });
  }

  // 4) FX-слой — флаги, флаг-стрелки, aim-line, плавающие числа, частицы.
  clearLayer(layers.fx);
  renderPixiStandards(layers, bs);
  renderPixiFlankArrow(layers, bs);
  if (opts.selectedUnit && opts.hoverEnemy) {
    renderPixiAimLine(layers, opts.selectedUnit, opts.hoverEnemy);
  }
  _renderPixiFloatNums(layers, opts.floatNums || []);
  _renderPixiParticles(layers, opts.particles || []);
}

// ──────────────────────────────────────────────────────────────────────
// Шаг 6 — FX: плавающие числа урона и частицы удара
// ──────────────────────────────────────────────────────────────────────

function _renderPixiFloatNums(layers, list) {
  if (!layers || !layers.fx || !list.length) return;
  if (typeof PIXI === 'undefined' || !PIXI.Text) return;
  for (var i = 0; i < list.length; i++) {
    var fn = list[i];
    if (fn.alpha <= 0) continue;
    var t = new PIXI.Text({
      text: '-' + fn.val,
      style: {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize:   13,
        fill:       fn.color,
        stroke:     { color: 0x000000, width: 2.5 },
        fontWeight: 'bold',
        align:      'center'
      }
    });
    t.anchor = { x: 0.5, y: 0.5 };
    t.x = fn.x;
    t.y = fn.y;
    t.alpha = fn.alpha;
    layers.fx.addChild(t);
  }
}

function _renderPixiParticles(layers, list) {
  if (!layers || !layers.fx || !list.length) return;
  var g = new PIXI.Graphics();
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (p.life <= 0) continue;
    g.circle(p.x, p.y, p.r);
    g.fill({ color: p.color, alpha: Math.max(0, p.life) });
  }
  layers.fx.addChild(g);
}

/**
 * updatePixiFloatNums(list, delta)
 *
 * Продвигает плавающие числа: y -= 0.9*delta, alpha -= 0.018*delta.
 * Мутирует список (удаляет угасшие на месте).
 */
export function updatePixiFloatNums(list, delta) {
  if (!list || !list.length) return;
  var d = delta != null ? delta : 1;
  for (var i = list.length - 1; i >= 0; i--) {
    list[i].y     += (list[i].vy || -0.9) * d;
    list[i].alpha -= 0.018 * d;
    if (list[i].alpha <= 0) list.splice(i, 1);
  }
}

/**
 * updatePixiParticles(list, delta)
 *
 * Продвигает частицы: x+=vx, y+=vy, vy+=gravity, life-=decay.
 */
export function updatePixiParticles(list, delta) {
  if (!list || !list.length) return;
  var d = delta != null ? delta : 1;
  for (var i = list.length - 1; i >= 0; i--) {
    var p = list[i];
    p.x  += p.vx * d;
    p.y  += p.vy * d;
    p.vy += 0.08 * d;
    p.life -= p.decay * d;
    if (p.life <= 0) list.splice(i, 1);
  }
}

/**
 * updatePixiAttackAnims(map, delta)
 *
 * Прокручивает анимации атак: t 0→1→0, 0.12*delta шагом. Удаляет завершённые.
 */
export function updatePixiAttackAnims(map, delta) {
  if (!map || !map.forEach) return;
  var d = delta != null ? delta : 1;
  var toDelete = [];
  map.forEach(function(a, id) {
    a.t += 0.12 * d * a.dir;
    if (a.t >= 1) { a.t = 1; a.dir = -1; }
    if (a.t <= 0 && a.dir === -1) toDelete.push(id);
  });
  for (var i = 0; i < toDelete.length; i++) map.delete(toDelete[i]);
}
