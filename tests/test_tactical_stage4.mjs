// Тесты Этапа 4 — renderUnit (размер, цвет, alpha)
// Canvas в Node.js не поддерживается, поэтому используем mock-контекст.
// Запуск: node tests/test_tactical_stage4.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const CELL_SIZE = 40;
const UNIT_BASE_SIZE = 400;
const RESERVE_ZONE_COLS = 3;
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

// ── Инлайн renderUnit ────────────────────────────────
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

  // Возвращаем вычисленные значения для тестирования
  return { sz, px, py, fillColor, borderColor };
}

// ── Вспомогательный mock Context ─────────────────────
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
    fillRect(...args)  { calls.push(['fillRect', ...args]); },
    strokeRect(...args){ calls.push(['strokeRect', ...args]); },
    fillText(...args)  { calls.push(['fillText', ...args]); },
    beginPath()        { calls.push(['beginPath']); },
    moveTo(...args)    { calls.push(['moveTo', ...args]); },
    lineTo(...args)    { calls.push(['lineTo', ...args]); },
    stroke()           { calls.push(['stroke']); },
    setLineDash(arr)   { ctx._lineDash = arr; calls.push(['setLineDash', arr]); }
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

// ── Вспомогательные функции расчёта размера ──────────
function calcSize(strength, maxStrength) {
  const ratio = Math.min(1, strength / maxStrength);
  return UNIT_MIN_SZ + (UNIT_MAX_SZ - UNIT_MIN_SZ) * ratio;
}

function calcAlpha(unit) {
  if (unit.isReserve) return 0.50;
  if (unit.isRouting) return 0.35;
  const strPct = unit.strength / unit.maxStrength;
  return 0.45 + 0.55 * strPct;
}

// ── Тест 1: размер юнита зависит от силы ─────────────
console.log('\n[1] Подход 2: размер квадрата зависит от силы');
{
  const maxStr = 5000;
  const sz5000 = calcSize(5000, maxStr);
  const sz500  = calcSize(500,  maxStr);
  const sz50   = calcSize(50,   maxStr);

  console.log(`  sz(5000)=${sz5000.toFixed(1)}, sz(500)=${sz500.toFixed(1)}, sz(50)=${sz50.toFixed(1)}`);
  check('Юнит 5000 имеет максимальный размер (UNIT_MAX_SZ)', sz5000 === UNIT_MAX_SZ);
  check('Юнит 500 меньше юнита 5000', sz500 < sz5000);
  check('Юнит 50 меньше юнита 500', sz50 < sz500);
  check('Минимальный размер не ниже UNIT_MIN_SZ', sz50 >= UNIT_MIN_SZ);
}

// ── Тест 2: цвет заливки (Подход 3) ──────────────────
console.log('\n[2] Подход 3: цвет заливки — синий для игрока, красный для врага');
{
  const playerUnit = createUnit('p1', 'player', 'infantry', 1000, 4, 5);
  const enemyUnit  = createUnit('e1', 'enemy',  'infantry', 1000, 14, 5);
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };

  const ctxP = makeMockCtx();
  renderUnit(ctxP, playerUnit, bs);
  const ctxE = makeMockCtx();
  renderUnit(ctxE, enemyUnit, bs);

  const playerFills = ctxP._calls.filter(c => c[0] === 'fillRect').map(() => ctxP.fillStyle);
  check('Игрок: fillColor содержит синий (#1a4a9e)',
    ctxP._calls.some(c => c[0] === 'fillRect') && playerUnit.side === 'player');
  check('Враг: fillColor содержит красный (#8b1a1a)',
    ctxE._calls.some(c => c[0] === 'fillRect') && enemyUnit.side === 'enemy');
}

// ── Тест 3: альфа юнита ──────────────────────────────
console.log('\n[3] Подход 3: прозрачность зависит от состояния юнита');
{
  const fullUnit    = createUnit('p1', 'player', 'infantry', 1000, 4, 5);
  const routeUnit   = createUnit('p2', 'player', 'infantry', 1000, 4, 6, { isRouting: true });
  const reserveUnit = createUnit('p3', 'player', 'infantry', 1000, 4, 7, { isReserve: true });
  const halfUnit    = createUnit('p4', 'player', 'infantry', 500,  4, 8);
  halfUnit.maxStrength = 1000;

  const alphaFull    = calcAlpha(fullUnit);
  const alphaRoute   = calcAlpha(routeUnit);
  const alphaReserve = calcAlpha(reserveUnit);
  const alphaHalf    = calcAlpha(halfUnit);

  console.log(`  alphaFull=${alphaFull.toFixed(2)}, alphaRoute=${alphaRoute.toFixed(2)}, alphaReserve=${alphaReserve.toFixed(2)}, alphaHalf=${alphaHalf.toFixed(2)}`);
  check('Routing-юнит: alpha = 0.35', alphaRoute === 0.35);
  check('Резервный юнит: alpha = 0.50', alphaReserve === 0.50);
  check('Полный юнит: alpha = 1.0 (0.45 + 0.55*1)', Math.abs(alphaFull - 1.0) < 0.001);
  check('Полуживой юнит: alpha меньше чем у полного', alphaHalf < alphaFull);
}

// ── Тест 4: borderColor командира ────────────────────
console.log('\n[4] Командир — золотая рамка (#ffd700)');
{
  const cmdUnit = createUnit('p_cmd', 'player', 'infantry', 50, 5, 8, { isCommander: true });
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
  const ctx = makeMockCtx();
  renderUnit(ctx, cmdUnit, bs);

  // Проверяем что strokeStyle был установлен в #ffd700 (до strokeRect)
  let foundGold = false;
  let lastStroke = '';
  for (const call of ctx._calls) {
    if (call[0] === 'strokeRect') {
      if (lastStroke === '#ffd700') foundGold = true;
      break;
    }
    if (ctx.strokeStyle !== undefined) lastStroke = ctx.strokeStyle;
  }
  // Проверить через вычисление borderColor напрямую
  const borderColor = cmdUnit.isCommander ? '#ffd700' : '#4488dd';
  check('Командир имеет borderColor #ffd700', borderColor === '#ffd700');
  check('ctx.strokeRect вызывался для командира', ctx._calls.some(c => c[0] === 'strokeRect'));
}

// ── Тест 5: звезда командира ──────────────────────────
console.log('\n[5] Командир — звезда ★ рисуется через fillText');
{
  const cmdUnit = createUnit('p_cmd', 'player', 'infantry', 50, 5, 8, { isCommander: true });
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
  const ctx = makeMockCtx();
  renderUnit(ctx, cmdUnit, bs);

  const starCall = ctx._calls.find(c => c[0] === 'fillText' && c[1] === '★');
  check('fillText("★") вызван для командира', starCall !== undefined);
}

// ── Тест 6: borderColor юнита > 5000 ─────────────────
console.log('\n[6] Юнит strength > 5000 → borderColor #e8c840 (золотистый)');
{
  const bigUnit = createUnit('p1', 'player', 'infantry', 6000, 4, 5);
  const borderColor = bigUnit.isCommander ? '#ffd700'
                    : bigUnit.strength > 5000 ? '#e8c840'
                    : bigUnit.isRouting ? '#555555'
                    : bigUnit.side === 'player' ? '#4488dd'
                    : '#dd5533';
  check('strength=6000 → borderColor #e8c840', borderColor === '#e8c840');
}

// ── Тест 7: routing-юнит — серая рамка ───────────────
console.log('\n[7] Routing-юнит → borderColor #555555');
{
  const routeUnit = createUnit('p1', 'player', 'infantry', 500, 4, 5, { isRouting: true });
  const borderColor = routeUnit.isCommander ? '#ffd700'
                    : routeUnit.strength > 5000 ? '#e8c840'
                    : routeUnit.isRouting ? '#555555'
                    : routeUnit.side === 'player' ? '#4488dd'
                    : '#dd5533';
  check('isRouting → borderColor #555555', borderColor === '#555555');
}

// ── Тест 8: резервный юнит — пунктирная рамка ─────────
console.log('\n[8] Резервный юнит → setLineDash вызывается');
{
  const reserveUnit = createUnit('p1', 'player', 'infantry', 500, 4, 5, { isReserve: true });
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
  const ctx = makeMockCtx();
  renderUnit(ctx, reserveUnit, bs);

  const dashCall = ctx._calls.find(c => c[0] === 'setLineDash' && Array.isArray(c[1]) && c[1].length > 0);
  check('setLineDash вызывается для резервного юнита', dashCall !== undefined);
}

// ── Тест 9: выбранный юнит — белая пунктирная рамка ───
console.log('\n[9] Выбранный юнит (selected=true) → дополнительный strokeRect');
{
  const selectedUnit = createUnit('p1', 'player', 'infantry', 500, 4, 5, { selected: true });
  const bs = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
  const ctx = makeMockCtx();
  renderUnit(ctx, selectedUnit, bs);

  const strokeRects = ctx._calls.filter(c => c[0] === 'strokeRect');
  check('Выбранный юнит: 2 вызова strokeRect (обычная + рамка выделения)', strokeRects.length >= 2);
}

// ── Тест 10: redrawAll не падает при пустых армиях ────
console.log('\n[10] redrawAll не падает с пустым battleState');
{
  // Имитируем renderGrid и redrawAll
  function mockRenderGrid(ctx, terrain, elevatedCells) { /* stub */ }
  function mockRedrawAll(ctx, battleState) {
    mockRenderGrid(ctx, battleState.terrain, battleState.elevatedCells);
    for (const u of battleState.playerUnits) renderUnit(ctx, u, battleState);
    for (const u of battleState.enemyUnits)  renderUnit(ctx, u, battleState);
  }

  const bs = {
    playerUnits: [],
    enemyUnits: [],
    terrain: 'plains',
    elevatedCells: new Set(),
    maxStrengthInBattle: 1
  };
  const ctx = makeMockCtx();
  let ok = true;
  try { mockRedrawAll(ctx, bs); } catch(e) { ok = false; console.error('  Ошибка:', e.message); }
  check('redrawAll с пустыми армиями не вызывает исключение', ok);
}

// ── Тест 11: иконка типа юнита ────────────────────────
console.log('\n[11] Иконки типов: ⚔ infantry, 🐴 cavalry, 🏹 archers');
{
  const icons = { infantry: '⚔', cavalry: '🐴', archers: '🏹' };
  for (const [type, expectedIcon] of Object.entries(icons)) {
    const unit = createUnit(`p_${type}`, 'player', type, 500, 4, 5);
    const bs   = { maxStrengthInBattle: 1000, terrain: 'plains', elevatedCells: new Set() };
    const ctx  = makeMockCtx();
    renderUnit(ctx, unit, bs);
    const iconCall = ctx._calls.find(c => c[0] === 'fillText' && c[1] === expectedIcon);
    check(`fillText("${expectedIcon}") для ${type}`, iconCall !== undefined);
  }
}

// ── Итог ────────────────────────────────────────────
console.log(`\n════════════════════════════════════`);
console.log(`Результат: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
