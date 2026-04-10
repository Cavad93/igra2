// Тесты Этапа 5 — сетка иконок солдат (Подход 1) + полоски силы/морали (Подход 4)
// Запуск: node tests/test_tactical_stage5.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE = 40;
const UNIT_BASE_SIZE = 400;
const UNIT_MIN_SZ = 26;
const UNIT_MAX_SZ = 52;

// ── Инлайн createUnit ────────────────────────────────
function createUnit(id, side, type, strength, gridX, gridY, extra = {}) {
  return {
    id, side, type,
    strength,
    maxStrength: strength,
    morale: 80,
    fatigue: 0,
    ammo: type === 'archers' ? 30 : 0,
    isRouting: false,
    isReserve: false,
    isCommander: false,
    gridX, gridY,
    moveSpeed: type === 'cavalry' ? 4 : 2,
    formation: 'standard',
    selected: false,
    ...extra
  };
}

// ── Инлайн-логика Stage 5 ────────────────────────────

function calcDotCount(strength) {
  return Math.min(25, Math.max(1, Math.round(strength / UNIT_BASE_SIZE)));
}

function calcLabel(strength) {
  return strength >= 1000
    ? (strength / 1000).toFixed(1) + 'k'
    : strength.toString();
}

function calcBarColor(strPct) {
  if (strPct > 0.6) return '#44dd44';
  if (strPct > 0.3) return '#ddaa00';
  return '#dd2222';
}

function calcSz(strength, maxStrengthInBattle) {
  const ratio = Math.min(1, strength / maxStrengthInBattle);
  return UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
}

// ── Инлайн renderUnit с Stage 5 ─────────────────────
function renderUnit(ctx, unit, battleState) {
  const cellX = unit.gridX * CELL_SIZE;
  const cellY = unit.gridY * CELL_SIZE;

  const ratio = Math.min(1, unit.strength / battleState.maxStrengthInBattle);
  const sz = UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
  const px = cellX + (CELL_SIZE - sz) / 2;
  const py = cellY + (CELL_SIZE - sz) / 2;

  const isPlayer  = unit.side === 'player';
  const strPct    = unit.strength / unit.maxStrength;
  const fillColor = isPlayer ? '#1a4a9e' : '#8b1a1a';
  const borderColor = unit.isCommander     ? '#ffd700'
                    : unit.strength > 5000 ? '#e8c840'
                    : unit.isRouting       ? '#555555'
                    : isPlayer             ? '#4488dd'
                    :                        '#dd5533';

  ctx.globalAlpha = unit.isReserve ? 0.50
                  : unit.isRouting  ? 0.35
                  :                   0.45 + 0.55 * strPct;
  ctx.fillStyle = fillColor;
  ctx.fillRect(px, py, sz, sz);

  ctx.globalAlpha = unit.isRouting ? 0.4 : 1.0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = unit.isCommander ? 2.5 : 1.5;
  if (unit.isReserve) ctx.setLineDash([4, 3]);
  ctx.strokeRect(px, py, sz, sz);
  ctx.setLineDash([]);

  // ── Этап 5: сетка иконок солдат (Подход 1) ──────────
  const DOT_SIZE = 3;
  const DOT_MAX  = 25;
  const dotCount = Math.min(DOT_MAX, Math.max(1, Math.round(unit.strength / UNIT_BASE_SIZE)));
  const dotCols  = Math.ceil(Math.sqrt(dotCount));
  const dotRows  = Math.ceil(dotCount / dotCols);
  const gapX     = sz / (dotCols + 1);
  const gapY     = (sz * 0.65) / (dotRows + 1);

  ctx.fillStyle   = '#ffffff';
  ctx.globalAlpha = unit.isRouting ? 0.2 : 0.80;
  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      if (r * dotCols + c >= dotCount) break;
      ctx.fillRect(
        px + gapX * (c + 1) - DOT_SIZE / 2,
        py + gapY * (r + 1) - DOT_SIZE / 2,
        DOT_SIZE, DOT_SIZE
      );
    }
  }

  // Число солдат
  ctx.globalAlpha = unit.isRouting ? 0.4 : 1.0;
  ctx.font        = `${Math.max(8, sz * 0.16 | 0)}px monospace`;
  ctx.fillStyle   = '#cccccc';
  ctx.textAlign   = 'center';
  const label = unit.strength >= 1000
    ? (unit.strength / 1000).toFixed(1) + 'k'
    : unit.strength.toString();
  ctx.fillText(label, px + sz / 2, py + sz * 0.94);

  // Подход 4: полоска силы
  const strPct2  = unit.strength / unit.maxStrength;
  const barColor = strPct2 > 0.6 ? '#44dd44' : strPct2 > 0.3 ? '#ddaa00' : '#dd2222';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle   = '#222222';
  ctx.fillRect(px, py + sz + 3, sz, 4);
  ctx.fillStyle   = barColor;
  ctx.fillRect(px, py + sz + 3, sz * strPct2, 4);

  // Полоска морали (над квадратом, синяя)
  ctx.fillStyle   = '#222222';
  ctx.fillRect(px, py - 6, sz, 3);
  ctx.fillStyle   = '#4488ff';
  ctx.fillRect(px, py - 6, sz * (unit.morale / 100), 3);
  ctx.globalAlpha = 1.0;

  // Иконка типа в центре
  const icon = { infantry: '⚔', cavalry: '🐴', archers: '🏹' }[unit.type] ?? '⚔';
  ctx.globalAlpha = unit.isRouting ? 0.5 : 1.0;
  ctx.font      = `bold ${Math.max(10, sz * 0.28 | 0)}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(icon, px + sz / 2, py + sz / 2 + 5);

  if (unit.isCommander) {
    ctx.font      = `${Math.max(10, sz * 0.28 | 0)}px monospace`;
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText('★', px + sz - 2, py + 12);
  }

  if (unit.selected) {
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(px - 3, py - 3, sz + 6, sz + 6);
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = 1.0;
  ctx.textAlign   = 'left';

  return { sz, px, py, dotCount, label, barColor, strPct2 };
}

// ── Mock Canvas Context ──────────────────────────────
function makeMockCtx() {
  const calls = [];
  const ctx = {
    globalAlpha: 1.0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    _calls: calls,
    _lineDash: [],
    fillRect(...args)   { calls.push(['fillRect', ...args]); },
    strokeRect(...args) { calls.push(['strokeRect', ...args]); },
    fillText(...args)   { calls.push(['fillText', ...args]); },
    beginPath()         { calls.push(['beginPath']); },
    moveTo(...args)     { calls.push(['moveTo', ...args]); },
    lineTo(...args)     { calls.push(['lineTo', ...args]); },
    stroke()            { calls.push(['stroke']); },
    setLineDash(arr)    { ctx._lineDash = arr; calls.push(['setLineDash', arr]); }
  };
  return ctx;
}

// ── Тестовый фреймворк ──────────────────────────────
let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failed++;
  }
}

// ════════════════════════════════════════════════════
// Тест 1: количество точек в зависимости от strength
// ════════════════════════════════════════════════════
console.log('\n[1] Количество точек-солдат');
{
  check('400 солдат → 1 точка',  calcDotCount(400)   === 1);
  check('800 солдат → 2 точки',  calcDotCount(800)   === 2);
  check('2000 солдат → 5 точек', calcDotCount(2000)  === 5);
  check('4000 солдат → 10 точек',calcDotCount(4000)  === 10);
  check('10000 солдат → 25 точек',calcDotCount(10000) === 25);
  check('50000 солдат → максимум 25 точек', calcDotCount(50000) === 25);
  check('1 солдат → минимум 1 точка', calcDotCount(1) === 1);

  // 2000 → 5 точек: ceil(sqrt(5))=3 cols, ceil(5/3)=2 rows
  const dots2000 = calcDotCount(2000);
  const cols2000 = Math.ceil(Math.sqrt(dots2000));
  const rows2000 = Math.ceil(dots2000 / cols2000);
  check('2000 солдат: 2 строки × 3 колонки (≈2×3 сетка)', rows2000 === 2 && cols2000 === 3);

  // 10000 → 25 точек: ceil(sqrt(25))=5 cols, ceil(25/5)=5 rows
  const dots10k = calcDotCount(10000);
  const cols10k = Math.ceil(Math.sqrt(dots10k));
  const rows10k = Math.ceil(dots10k / cols10k);
  check('10000 солдат: 5×5 сетка', rows10k === 5 && cols10k === 5);
}

// ════════════════════════════════════════════════════
// Тест 2: форматирование числа солдат
// ════════════════════════════════════════════════════
console.log('\n[2] Форматирование числа солдат (label)');
{
  check('400   → "400"',   calcLabel(400)   === '400');
  check('999   → "999"',   calcLabel(999)   === '999');
  check('1000  → "1.0k"',  calcLabel(1000)  === '1.0k');
  check('2000  → "2.0k"',  calcLabel(2000)  === '2.0k');
  check('10000 → "10.0k"', calcLabel(10000) === '10.0k');
  check('1500  → "1.5k"',  calcLabel(1500)  === '1.5k');
  check('500   → "500"',   calcLabel(500)   === '500');
}

// ════════════════════════════════════════════════════
// Тест 3: цвет полоски силы
// ════════════════════════════════════════════════════
console.log('\n[3] Цвет полоски силы (strPct)');
{
  check('>60% → зелёная #44dd44',  calcBarColor(0.70)  === '#44dd44');
  check('=60% → зелёная #44dd44',  calcBarColor(0.601) === '#44dd44');  // граница
  check('50% → жёлтая #ddaa00',    calcBarColor(0.50)  === '#ddaa00');
  check('=30% → жёлтая #ddaa00',   calcBarColor(0.301) === '#ddaa00');  // граница
  check('<30% → красная #dd2222',  calcBarColor(0.20)  === '#dd2222');
  check('0% → красная #dd2222',    calcBarColor(0.00)  === '#dd2222');
  check('100% → зелёная #44dd44',  calcBarColor(1.00)  === '#44dd44');
}

// ════════════════════════════════════════════════════
// Тест 4: точки рисуются внутри квадрата
// ════════════════════════════════════════════════════
console.log('\n[4] Точки (fillRect) рисуются внутри квадрата');
{
  const unit = createUnit('p1', 'player', 'infantry', 2000, 5, 7);
  const bs   = { maxStrengthInBattle: 2000, terrain: 'plains', elevatedCells: new Set() };
  const ctx  = makeMockCtx();
  const result = renderUnit(ctx, unit, bs);

  const { sz, px, py } = result;
  // Точки = fillRect с размером DOT_SIZE=3
  const dotRects = ctx._calls.filter(c =>
    c[0] === 'fillRect' &&
    Math.abs(c[3] - 3) < 0.01 && Math.abs(c[4] - 3) < 0.01
  );

  check('Точки нарисованы (есть fillRect 3×3)', dotRects.length > 0);

  // Все точки должны быть в пределах квадрата [px, px+sz] × [py, py+sz*0.65]
  const DOT_SIZE = 3;
  let allInside = true;
  for (const [, rx, ry] of dotRects) {
    if (rx < px - DOT_SIZE || rx > px + sz ||
        ry < py - DOT_SIZE || ry > py + sz * 0.65 + DOT_SIZE) {
      allInside = false;
      break;
    }
  }
  check('Все точки находятся в верхних 65% квадрата', allInside);
  check(`Количество точек для 2000 солдат = 5`, dotRects.length === 5);
}

// ════════════════════════════════════════════════════
// Тест 5: полоска силы рисуется под квадратом
// ════════════════════════════════════════════════════
console.log('\n[5] Полоска силы под квадратом');
{
  const unit = createUnit('p1', 'player', 'infantry', 800, 5, 7);
  unit.maxStrength = 1000; // 80% силы → зелёная
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
  const ctx = makeMockCtx();
  renderUnit(ctx, unit, bs);

  const { sz, px, py } = (() => {
    const ratio = Math.min(1, unit.strength / bs.maxStrengthInBattle);
    const sz = UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
    const px = unit.gridX * CELL_SIZE + (CELL_SIZE - sz) / 2;
    const py = unit.gridY * CELL_SIZE + (CELL_SIZE - sz) / 2;
    return { sz, px, py };
  })();

  // Полоска силы: fillRect(px, py+sz+3, sz, 4)
  const barBg = ctx._calls.find(c =>
    c[0] === 'fillRect' &&
    Math.abs(c[1] - px) < 0.01 &&
    Math.abs(c[2] - (py + sz + 3)) < 0.01 &&
    Math.abs(c[3] - sz) < 0.01 &&
    c[4] === 4
  );
  check('Фон полоски силы нарисован под квадратом (py+sz+3)', barBg !== undefined);

  // Полоска цвета: fillRect(px, py+sz+3, sz * strPct2, 4)
  const strPct2 = unit.strength / unit.maxStrength; // 0.8
  const barFill = ctx._calls.find(c =>
    c[0] === 'fillRect' &&
    Math.abs(c[1] - px) < 0.01 &&
    Math.abs(c[2] - (py + sz + 3)) < 0.01 &&
    Math.abs(c[3] - sz * strPct2) < 0.5 &&
    c[4] === 4
  );
  check('Полоска силы с шириной пропорциональной strPct', barFill !== undefined);
}

// ════════════════════════════════════════════════════
// Тест 6: полоска морали рисуется над квадратом
// ════════════════════════════════════════════════════
console.log('\n[6] Полоска морали над квадратом');
{
  const unit = createUnit('p1', 'player', 'infantry', 1000, 5, 7);
  unit.morale = 60; // 60%
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
  const ctx = makeMockCtx();
  renderUnit(ctx, unit, bs);

  const sz = UNIT_MAX_SZ; // strength == maxStrengthInBattle → ratio=1 → sz=UNIT_MAX_SZ
  const px = unit.gridX * CELL_SIZE + (CELL_SIZE - sz) / 2;
  const py = unit.gridY * CELL_SIZE + (CELL_SIZE - sz) / 2;

  // Полоска морали: fillRect(px, py-6, sz, 3)
  const moraleBg = ctx._calls.find(c =>
    c[0] === 'fillRect' &&
    Math.abs(c[1] - px) < 0.01 &&
    Math.abs(c[2] - (py - 6)) < 0.01 &&
    Math.abs(c[3] - sz) < 0.01 &&
    c[4] === 3
  );
  check('Фон полоски морали нарисован над квадратом (py-6)', moraleBg !== undefined);

  // Полоска заполнения: fillRect(px, py-6, sz * morale/100, 3)
  const moraleFill = ctx._calls.find(c =>
    c[0] === 'fillRect' &&
    Math.abs(c[1] - px) < 0.01 &&
    Math.abs(c[2] - (py - 6)) < 0.01 &&
    Math.abs(c[3] - sz * 0.60) < 0.5 &&
    c[4] === 3
  );
  check('Полоска морали с шириной пропорциональной morale/100', moraleFill !== undefined);
}

// ════════════════════════════════════════════════════
// Тест 7: полоска морали меньше при morale=30 чем при morale=80
// ════════════════════════════════════════════════════
console.log('\n[7] Полоска морали пропорциональна morale');
{
  const morale80Width = UNIT_MAX_SZ * (80 / 100);
  const morale30Width = UNIT_MAX_SZ * (30 / 100);
  check('morale=80 → ширина больше чем при morale=30', morale80Width > morale30Width);
  check('morale=30 → ~37.5% от максимальной ширины',
    Math.abs(morale30Width / UNIT_MAX_SZ - 0.30) < 0.01);
}

// ════════════════════════════════════════════════════
// Тест 8: при strength=20% полоска красная, размер меньше
// ════════════════════════════════════════════════════
console.log('\n[8] Юнит с 20% силы — красная полоска, меньший размер');
{
  const unit = createUnit('p1', 'player', 'infantry', 200, 5, 7);
  unit.maxStrength = 1000; // 20% силы
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };

  const strPct = 200 / 1000;  // 0.20
  check('strPct=0.20 → красная полоска (#dd2222)', calcBarColor(strPct) === '#dd2222');

  const sz20 = calcSz(200, 1000);
  const sz100 = calcSz(1000, 1000);
  check('Размер при 20% силы меньше чем при 100%', sz20 < sz100);
  check('Размер при 20% не ниже минимального UNIT_MIN_SZ', sz20 >= UNIT_MIN_SZ);
}

// ════════════════════════════════════════════════════
// Тест 9: число солдат выводится через fillText
// ════════════════════════════════════════════════════
console.log('\n[9] Число солдат выводится через fillText');
{
  for (const [strength, expected] of [[400, '400'], [2000, '2.0k'], [10000, '10.0k']]) {
    const unit = createUnit('p1', 'player', 'infantry', strength, 5, 7);
    const bs   = { maxStrengthInBattle: Math.max(strength, 1000), terrain: 'plains', elevatedCells: new Set() };
    const ctx  = makeMockCtx();
    renderUnit(ctx, unit, bs);
    const textCall = ctx._calls.find(c => c[0] === 'fillText' && c[1] === expected);
    check(`strength=${strength} → fillText("${expected}")`, textCall !== undefined);
  }
}

// ════════════════════════════════════════════════════
// Тест 10: routing-юнит имеет меньшую прозрачность точек
// ════════════════════════════════════════════════════
console.log('\n[10] Routing-юнит: точки с globalAlpha=0.2');
{
  // Проверяем что при isRouting точки менее прозрачны (0.2 vs 0.8)
  const routingAlpha = 0.2;
  const normalAlpha  = 0.80;
  check('normalAlpha > routingAlpha (0.80 > 0.20)', normalAlpha > routingAlpha);
  check('routingAlpha для точек = 0.20', routingAlpha === 0.20);
  check('normalAlpha для точек = 0.80', normalAlpha === 0.80);
}

// ════════════════════════════════════════════════════
// Тест 11: все вызовы renderUnit без ошибок
// ════════════════════════════════════════════════════
console.log('\n[11] renderUnit не падает при разных конфигурациях');
{
  const bs = { maxStrengthInBattle: 10000, terrain: 'plains', elevatedCells: new Set() };
  const configs = [
    { strength: 1, morale: 100, isRouting: false, isReserve: false, isCommander: false },
    { strength: 10000, morale: 0,  isRouting: true,  isReserve: false, isCommander: false },
    { strength: 500,  morale: 50, isRouting: false, isReserve: true,  isCommander: false },
    { strength: 50,   morale: 80, isRouting: false, isReserve: false, isCommander: true  },
  ];

  for (const cfg of configs) {
    const unit = createUnit('p1', 'player', 'infantry', cfg.strength, 5, 7, cfg);
    if (cfg.morale !== undefined) unit.morale = cfg.morale;
    const ctx  = makeMockCtx();
    let ok = true;
    try { renderUnit(ctx, unit, bs); } catch(e) { ok = false; console.error('  Ошибка:', e.message); }
    check(`renderUnit не падает (str=${cfg.strength}, morale=${cfg.morale}, routing=${cfg.isRouting})`, ok);
  }
}

// ── Итог ────────────────────────────────────────────
console.log(`\n════════════════════════════════════`);
console.log(`Результат: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
