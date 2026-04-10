// Тесты Этапа 19 — Финализация боя и интеграция с battle_result.js
// Запуск: node tests/test_tactical_stage19.mjs

// ── Инлайн-константы ─────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const MAX_UNITS_PER_SIDE = 20;
const RESERVE_ZONE_COLS  = 3;
const CELL_SIZE          = 40;

// ── Мок GAME_STATE ───────────────────────────────────
const GAME_STATE = {
  player_nation: 'player_nation_id',
  nations: {
    player_nation_id: { name: 'Игрок', flag: '🗡' },
    enemy_nation_id:  { name: 'Враг',  flag: '⚔' }
  }
};

// ── Инлайн-функции (из engine/tactical_battle.js) ────

function addLog(bs, message) {
  bs.log.unshift({ text: message, turn: bs.turn });
}

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
    _movedThisTick: false,
    _foughtThisTick: false,
    ...extra
  };
}

function makeBattleState(overrides = {}) {
  return {
    playerUnits: [],
    enemyUnits: [],
    turn: 1,
    log: [],
    elevatedCells: new Set(),
    ambushUsed: false,
    phase: 'battle',
    maxStrengthInBattle: 1000,
    playerStandardPos: null,
    enemyStandardPos: null,
    terrain: 'plains',
    region: { name: 'Равнина Лавры', terrain: 'plains' },
    atkArmy: { infantry: 1000, cavalry: 200, archers: 300, nation_id: 'player_nation_id' },
    defArmy: { infantry:  800, cavalry: 100, archers: 200, nation_id: 'enemy_nation_id' },
    ...overrides
  };
}

// ── finalizeTacticalBattle (копия из engine/tactical_battle.js) ──

function finalizeTacticalBattle(bs, outcome) {
  const playerSurvived = bs.playerUnits.reduce((s, u) => s + (u.isRouting ? 0 : u.strength), 0);
  const enemySurvived  = bs.enemyUnits.reduce((s, u) => s + (u.isRouting  ? 0 : u.strength), 0);

  const playerTotal = bs.playerUnits.reduce((s, u) => s + u.maxStrength, 0);
  const enemyTotal  = bs.enemyUnits.reduce((s, u) => s + u.maxStrength, 0);

  const playerCas = playerTotal - playerSurvived;
  const enemyCas  = enemyTotal  - enemySurvived;

  const atkSurvRatio = playerTotal > 0 ? playerSurvived / playerTotal : 0;
  bs.atkArmy.infantry = Math.floor((bs.atkArmy.infantry || 0) * atkSurvRatio);
  bs.atkArmy.cavalry  = Math.floor((bs.atkArmy.cavalry  || 0) * atkSurvRatio);
  bs.atkArmy.archers  = Math.floor((bs.atkArmy.archers  || 0) * atkSurvRatio);

  const defSurvRatio = enemyTotal > 0 ? enemySurvived / enemyTotal : 0;
  bs.defArmy.infantry = Math.floor((bs.defArmy.infantry || 0) * defSurvRatio);
  bs.defArmy.cavalry  = Math.floor((bs.defArmy.cavalry  || 0) * defSurvRatio);
  bs.defArmy.archers  = Math.floor((bs.defArmy.archers  || 0) * defSurvRatio);

  const atkWins = outcome === 'player_wins' || outcome === 'player_captured_standard';
  const margin  = enemyCas > 0 ? playerCas / enemyCas : 0.5;

  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : {};
  return {
    atkWins,
    atkName: gs.nations?.[bs.atkArmy.nation_id]?.name ?? 'Атакующий',
    defName: gs.nations?.[bs.defArmy.nation_id]?.name ?? 'Защитник',
    atkFlag: gs.nations?.[bs.atkArmy.nation_id]?.flag ?? '⚔',
    defFlag: gs.nations?.[bs.defArmy.nation_id]?.flag ?? '🛡',
    atkTotal: playerTotal,
    defTotal: enemyTotal,
    atkCas:   playerCas,
    defCas:   enemyCas,
    terrain:  bs.terrain,
    terrainLabel: bs.region?.name ?? bs.terrain,
    margin:   Math.abs(1 - margin),
    capturedRegionName: (outcome === 'player_captured_standard' || atkWins)
      ? bs.region?.name : null
  };
}

// ── Утилиты тестирования ─────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'Assertion failed');
}

function assertNoNaN(obj, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') {
      assert(!isNaN(v), `${prefix}${k} is NaN`);
    }
  }
}

// ── Тесты ────────────────────────────────────────────

console.log('\nЭтап 19 — Финализация боя и интеграция с battle_result.js\n');

// Тест 1: Победа → atkWins=true
test('Победа игрока → atkWins=true в результате', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 300, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assert(result.atkWins === true, `atkWins должен быть true, получено: ${result.atkWins}`);
});

// Тест 2: Поражение → atkWins=false
test('Поражение игрока → atkWins=false в результате', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 100, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 800, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_loses');
  assert(result.atkWins === false, `atkWins должен быть false, получено: ${result.atkWins}`);
});

// Тест 3: Захват стандарта → atkWins=true
test('Захват стандарта → atkWins=true', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 500, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_captured_standard');
  assert(result.atkWins === true, `Захват стандарта должен давать победу, atkWins=${result.atkWins}`);
});

// Тест 4: Армия атакующего обновлена после победы
test('После боя atkArmy.infantry/cavalry/archers уменьшились пропорционально', () => {
  const atkArmy = { infantry: 1000, cavalry: 200, archers: 300, nation_id: 'player_nation_id' };
  const defArmy = { infantry: 800,  cavalry: 100, archers: 200, nation_id: 'enemy_nation_id' };

  // Игрок потерял 40% (осталось 60%)
  const p1 = createUnit('p1', 'player', 'infantry', 600, 5, 8);  // maxStrength = 600
  p1.maxStrength = 1000; // полный отряд был 1000

  const bs = makeBattleState({
    atkArmy,
    defArmy,
    playerUnits: [p1],
    enemyUnits:  [createUnit('e1', 'enemy', 'infantry', 0, 15, 8)]
  });

  const prevInf = atkArmy.infantry;
  finalizeTacticalBattle(bs, 'player_wins');

  // playerSurvived = 600, playerTotal = 1000 → ratio = 0.6
  // infantry = floor(1000 * 0.6) = 600
  assert(atkArmy.infantry === 600,
    `infantry должен быть 600, получено: ${atkArmy.infantry}`);
  assert(atkArmy.cavalry === 120,
    `cavalry должен быть 120 (200*0.6), получено: ${atkArmy.cavalry}`);
  assert(atkArmy.archers === 180,
    `archers должен быть 180 (300*0.6), получено: ${atkArmy.archers}`);
});

// Тест 5: Армия защитника обновлена после боя
test('После боя defArmy.infantry/cavalry/archers обновлены', () => {
  const atkArmy = { infantry: 1000, cavalry: 0, archers: 0, nation_id: 'player_nation_id' };
  const defArmy = { infantry:  800, cavalry: 0, archers: 0, nation_id: 'enemy_nation_id' };

  // Враг потерял 50% (осталось 50%)
  const e1 = createUnit('e1', 'enemy', 'infantry', 400, 15, 8);
  e1.maxStrength = 800;

  const bs = makeBattleState({
    atkArmy,
    defArmy,
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [e1]
  });

  finalizeTacticalBattle(bs, 'player_wins');

  // enemySurvived = 400, enemyTotal = 800 → ratio = 0.5
  assert(defArmy.infantry === 400,
    `defArmy.infantry должен быть 400, получено: ${defArmy.infantry}`);
});

// Тест 6: Нет NaN в полях результата
test('Нет NaN в полях результата после финализации', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 300, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assertNoNaN(result, 'result.');
  assert(result.atkTotal > 0,  `atkTotal должен быть > 0`);
  assert(result.defTotal > 0,  `defTotal должен быть > 0`);
  assert(result.atkCas >= 0,   `atkCas не может быть отрицательным`);
  assert(result.defCas >= 0,   `defCas не может быть отрицательным`);
  assert(!isNaN(result.margin), `margin не должен быть NaN`);
});

// Тест 7: atkCas + playerSurvived === playerTotal (сумма сходится)
test('atkCas + playerSurvived === playerTotal', () => {
  const p1 = createUnit('p1', 'player', 'infantry', 700, 5, 8);
  p1.maxStrength = 1000;
  const p2 = createUnit('p2', 'player', 'cavalry', 200, 6, 8);
  p2.maxStrength = 300;
  // p2 в routing
  p2.isRouting = true;

  const bs = makeBattleState({
    playerUnits: [p1, p2],
    enemyUnits:  [createUnit('e1', 'enemy', 'infantry', 0, 15, 8)]
  });

  const playerTotal    = p1.maxStrength + p2.maxStrength; // 1300
  const playerSurvived = 700 + 0; // routing не считается = 700
  const expectedCas    = playerTotal - playerSurvived; // 600

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assert(result.atkTotal === playerTotal,
    `atkTotal должен быть ${playerTotal}, получено: ${result.atkTotal}`);
  assert(result.atkCas === expectedCas,
    `atkCas должен быть ${expectedCas}, получено: ${result.atkCas}`);
  assert(result.atkCas + playerSurvived === result.atkTotal,
    `atkCas + survived должно равняться atkTotal: ${result.atkCas} + ${playerSurvived} ≠ ${result.atkTotal}`);
});

// Тест 8: Полные потери — ratio=0, армия полностью обнулена
test('Полные потери → atkArmy обнулена (ratio=0)', () => {
  const atkArmy = { infantry: 1000, cavalry: 200, archers: 300, nation_id: 'player_nation_id' };
  const defArmy = { infantry: 500,  cavalry: 0,   archers: 0,   nation_id: 'enemy_nation_id' };

  // Все юниты игрока routing (strength > 0 но isRouting) → survived = 0
  const p1 = createUnit('p1', 'player', 'infantry', 100, 5, 8, { isRouting: true });
  p1.maxStrength = 1000;

  const bs = makeBattleState({
    atkArmy,
    defArmy,
    playerUnits: [p1],
    enemyUnits:  [createUnit('e1', 'enemy', 'infantry', 500, 15, 8)]
  });

  finalizeTacticalBattle(bs, 'player_loses');

  // playerSurvived = 0 (routing), ratio = 0
  assert(atkArmy.infantry === 0, `infantry должен быть 0, получено: ${atkArmy.infantry}`);
  assert(atkArmy.cavalry  === 0, `cavalry должен быть 0, получено: ${atkArmy.cavalry}`);
  assert(atkArmy.archers  === 0, `archers должен быть 0, получено: ${atkArmy.archers}`);
});

// Тест 9: Все выжили — армия не изменилась
test('Нет потерь → армия не уменьшилась (ratio=1)', () => {
  const atkArmy = { infantry: 1000, cavalry: 200, archers: 300, nation_id: 'player_nation_id' };
  const defArmy = { infantry: 500,  cavalry: 0,   archers: 0,   nation_id: 'enemy_nation_id' };

  const p1 = createUnit('p1', 'player', 'infantry', 1000, 5, 8);
  p1.maxStrength = 1000;

  const bs = makeBattleState({
    atkArmy,
    defArmy,
    playerUnits: [p1],
    enemyUnits:  [createUnit('e1', 'enemy', 'infantry', 0, 15, 8)]
  });

  finalizeTacticalBattle(bs, 'player_wins');

  // playerSurvived = 1000, playerTotal = 1000 → ratio = 1.0
  assert(atkArmy.infantry === 1000,
    `При полной выживаемости infantry не должна измениться: ${atkArmy.infantry}`);
  assert(atkArmy.cavalry === 200,
    `cavalry не должна измениться: ${atkArmy.cavalry}`);
  assert(atkArmy.archers === 300,
    `archers не должна измениться: ${atkArmy.archers}`);
});

// Тест 10: Нет NaN в atkArmy после финализации
test('Нет NaN в atkArmy и defArmy после финализации', () => {
  const atkArmy = { infantry: 0, cavalry: 0, archers: 0, nation_id: 'player_nation_id' };
  const defArmy = { infantry: 0, cavalry: 0, archers: 0, nation_id: 'enemy_nation_id' };

  // Пустые армии (нет юнитов)
  const bs = makeBattleState({
    atkArmy,
    defArmy,
    playerUnits: [],
    enemyUnits:  []
  });

  finalizeTacticalBattle(bs, 'player_wins');

  assert(!isNaN(atkArmy.infantry), `atkArmy.infantry NaN`);
  assert(!isNaN(atkArmy.cavalry),  `atkArmy.cavalry NaN`);
  assert(!isNaN(atkArmy.archers),  `atkArmy.archers NaN`);
  assert(!isNaN(defArmy.infantry), `defArmy.infantry NaN`);
  assert(!isNaN(defArmy.cavalry),  `defArmy.cavalry NaN`);
  assert(!isNaN(defArmy.archers),  `defArmy.archers NaN`);
});

// Тест 11: capturedRegionName при победе
test('capturedRegionName установлен при победе', () => {
  const bs = makeBattleState({
    region: { name: 'Тёмный лес', terrain: 'hills' },
    terrain: 'hills',
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry',   0, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assert(result.capturedRegionName === 'Тёмный лес',
    `capturedRegionName при победе должен быть 'Тёмный лес', получено: '${result.capturedRegionName}'`);
});

// Тест 12: capturedRegionName null при поражении
test('capturedRegionName равен null при поражении', () => {
  const bs = makeBattleState({
    region: { name: 'Тёмный лес', terrain: 'hills' },
    terrain: 'hills',
    playerUnits: [createUnit('p1', 'player', 'infantry', 100, 5, 8, { isRouting: true })],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 800, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_loses');
  assert(result.capturedRegionName === null,
    `capturedRegionName при поражении должен быть null, получено: '${result.capturedRegionName}'`);
});

// Тест 13: Названия и флаги берутся из GAME_STATE.nations
test('atkName и defName берутся из GAME_STATE.nations', () => {
  const bs = makeBattleState({
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 300, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assert(result.atkName === 'Игрок',
    `atkName должен быть 'Игрок', получено: '${result.atkName}'`);
  assert(result.defName === 'Враг',
    `defName должен быть 'Враг', получено: '${result.defName}'`);
  assert(result.atkFlag === '🗡',
    `atkFlag должен быть '🗡', получено: '${result.atkFlag}'`);
});

// Тест 14: Фолбэк при неизвестном nation_id
test('Фолбэк "Атакующий"/"Защитник" при неизвестном nation_id', () => {
  const bs = makeBattleState({
    atkArmy: { infantry: 500, cavalry: 0, archers: 0, nation_id: 'unknown_nation' },
    defArmy: { infantry: 300, cavalry: 0, archers: 0, nation_id: 'also_unknown' },
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 300, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assert(result.atkName === 'Атакующий',
    `Фолбэк имя должен быть 'Атакующий', получено: '${result.atkName}'`);
  assert(result.defName === 'Защитник',
    `Фолбэк имя должен быть 'Защитник', получено: '${result.defName}'`);
  assert(result.atkFlag === '⚔',
    `Фолбэк флаг должен быть '⚔', получено: '${result.atkFlag}'`);
  assert(result.defFlag === '🛡',
    `Фолбэк флаг должен быть '🛡', получено: '${result.defFlag}'`);
});

// Тест 15: terrain и terrainLabel из battleState
test('terrain и terrainLabel правильно передаются в результат', () => {
  const bs = makeBattleState({
    terrain: 'mountains',
    region:  { name: 'Ледяные вершины', terrain: 'mountains' },
    playerUnits: [createUnit('p1', 'player', 'infantry', 500, 5, 8)],
    enemyUnits:  [createUnit('e1', 'enemy',  'infantry', 300, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  assert(result.terrain === 'mountains',
    `terrain должен быть 'mountains', получено: '${result.terrain}'`);
  assert(result.terrainLabel === 'Ледяные вершины',
    `terrainLabel должен быть 'Ледяные вершины', получено: '${result.terrainLabel}'`);
});

// Тест 16: Несколько юнитов с частичными потерями
test('Несколько юнитов — пропорциональный расчёт работает корректно', () => {
  const atkArmy = { infantry: 600, cavalry: 400, archers: 200, nation_id: 'player_nation_id' };

  // 3 юнита: 2 живые (по 400), 1 уничтожен (strength=0)
  const p1 = createUnit('p1', 'player', 'infantry', 400, 4, 7);
  p1.maxStrength = 500;
  const p2 = createUnit('p2', 'player', 'cavalry', 400, 5, 8);
  p2.maxStrength = 500;
  const p3 = createUnit('p3', 'player', 'archers', 0, 6, 9);
  p3.maxStrength = 200;

  const bs = makeBattleState({
    atkArmy,
    playerUnits: [p1, p2, p3],
    enemyUnits:  [createUnit('e1', 'enemy', 'infantry', 0, 15, 8)]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');

  // playerTotal = 500+500+200 = 1200, playerSurvived = 400+400+0 = 800
  // ratio = 800/1200 ≈ 0.667
  assert(result.atkTotal === 1200, `atkTotal должен быть 1200, получено: ${result.atkTotal}`);
  assert(result.atkCas === 400,    `atkCas должен быть 400, получено: ${result.atkCas}`);

  // infantry = floor(600 * 0.667) = floor(400) = 400
  const expectedInf = Math.floor(600 * (800 / 1200));
  assert(atkArmy.infantry === expectedInf,
    `infantry должен быть ${expectedInf}, получено: ${atkArmy.infantry}`);
});

// Тест 17: margin вычисляется правильно при равных потерях
test('margin при равных потерях ≈ 0', () => {
  const p1 = createUnit('p1', 'player', 'infantry', 500, 5, 8);
  p1.maxStrength = 1000;
  const e1 = createUnit('e1', 'enemy', 'infantry', 500, 15, 8);
  e1.maxStrength = 1000;

  const bs = makeBattleState({
    playerUnits: [p1],
    enemyUnits:  [e1]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  // playerCas = 500, enemyCas = 500 → margin = abs(1 - 500/500) = abs(1-1) = 0
  assert(Math.abs(result.margin) < 0.01, `margin при равных потерях должен быть ≈0, получено: ${result.margin}`);
});

// Тест 18: margin > 0 при значимых потерях врага
test('margin > 0 если враг понёс больше потерь', () => {
  const p1 = createUnit('p1', 'player', 'infantry', 900, 5, 8);
  p1.maxStrength = 1000; // потерял 100

  const e1 = createUnit('e1', 'enemy', 'infantry', 0, 15, 8);
  e1.maxStrength = 1000; // потерял 1000

  const bs = makeBattleState({
    playerUnits: [p1],
    enemyUnits:  [e1]
  });

  const result = finalizeTacticalBattle(bs, 'player_wins');
  // playerCas=100, enemyCas=1000 → margin = abs(1 - 100/1000) = abs(1 - 0.1) = 0.9
  assert(result.margin > 0, `margin должен быть > 0, получено: ${result.margin}`);
});

// ── Итог ─────────────────────────────────────────────

console.log(`\nРезультат: ${passed} из ${passed + failed} тестов пройдено\n`);
if (failed > 0) process.exit(1);
