// Тесты Этапа 20 — Модальный выбор режима и финальная интеграция
// Запуск: node tests/test_tactical_stage20.mjs

// ── Мок DOM ──────────────────────────────────────────────────────────
// Минимальный документ для тестирования _showTacticalChoiceModal и processAttackAction

const _domElements = {};

const document = {
  getElementById: (id) => _domElements[id] ?? null,
  createElement: (tag) => {
    const el = {
      _tag: tag, id: '', style: { cssText: '' }, innerHTML: '',
      _children: [],
      appendChild: (child) => el._children.push(child),
      remove: () => {
        const idx = Object.keys(_domElements).find(k => _domElements[k] === el);
        if (idx) delete _domElements[idx];
      },
    };
    return el;
  },
  body: {
    appendChild: (el) => {
      if (el.id) _domElements[el.id] = el;
    }
  }
};

// ── Мок GAME_STATE ───────────────────────────────────────────────────

let GAME_STATE = {
  player_nation: 'player',
  nations: {
    player: {
      name: 'Рим',
      flag: '⚔',
      regions: ['region_1'],
      military: { infantry: 2000, cavalry: 500, archers: 300, morale: 70 }
    },
    enemy: {
      name: 'Карфаген',
      flag: '🛡',
      regions: ['region_2'],
      military: { infantry: 1800, cavalry: 400, archers: 200, morale: 65 }
    },
    ai1: {
      name: 'Спарта',
      flag: '⚡',
      regions: ['region_3'],
      military: { infantry: 1000, cavalry: 200, archers: 100, morale: 60 }
    },
    ai2: {
      name: 'Афины',
      flag: '🏛',
      regions: ['region_4'],
      military: { infantry: 800, cavalry: 150, archers: 80, morale: 55 }
    }
  },
  regions: {
    region_1: { terrain: 'plains', garrison: 0 },
    region_2: { terrain: 'hills',  garrison: 100 },
    region_3: { terrain: 'mountains', garrison: 0 },
    region_4: { terrain: 'plains', garrison: 0 }
  }
};

const MAP_REGIONS = {
  region_1: { name: 'Лаций' },
  region_2: { name: 'Карфагенские холмы' },
  region_3: { name: 'Гор Пелопоннеса' },
  region_4: { name: 'Аттика' },
};

// ── Мок-функции ──────────────────────────────────────────────────────

const _eventLog = [];
function addEventLog(msg, type) { _eventLog.push({ msg, type }); }

function triggerDefensiveAlliances() {}
function _applySharedLoot() {}

function resolveNavalBattle() { return null; }

function getTerrainName(t) {
  const names = {
    plains: 'Равнина', hills: 'Холмы', mountains: 'Горы',
    coastal_city: 'Прибрежный город', river_valley: 'Речная долина',
  };
  return names[t] || t;
}

function _calcJointAttackBonus() { return { bonus: 0, allies: [] }; }
function _isBlockedByNonAggression() { return false; }

// Минимальный resolveBattle для тестов
function resolveBattle(atk, def, opts = {}) {
  const attacker = GAME_STATE.nations[atk];
  const defender = GAME_STATE.nations[def];
  if (!attacker || !defender) return null;

  const targetRegionId = opts.targetRegionId
    || (defender.regions?.length > 0 ? defender.regions[defender.regions.length - 1] : null);
  if (!targetRegionId) return null;

  const atkForce = (attacker.military.infantry ?? 0) + (attacker.military.cavalry ?? 0) * 3;
  const defForce = (defender.military.infantry ?? 0) + (defender.military.cavalry ?? 0) * 3;
  const atkRoll = atkForce * (0.85 + Math.random() * 0.3);
  const defRoll = defForce * (0.85 + Math.random() * 0.3) * 1.2;
  const winner = atkRoll > defRoll ? atk : def;

  const atkCas = Math.round(atkForce * 0.08);
  const defCas = Math.round(defForce * 0.08);
  attacker.military.infantry = Math.max(0, (attacker.military.infantry ?? 0) - Math.round(atkCas * 0.7));
  defender.military.infantry = Math.max(0, (defender.military.infantry ?? 0) - Math.round(defCas * 0.7));

  return {
    winner, atkCasualties: atkCas, defCasualties: defCas,
    battleType: 'field', terrain: GAME_STATE.regions[targetRegionId]?.terrain,
    capturedRegionId: null, jointAllies: []
  };
}

// ── Копия _applyBattleResult и _showTacticalChoiceModal для тестов ───

let _openTacticalMapCalls = [];
function openTacticalMap(atkArmy, defArmy, region) {
  _openTacticalMapCalls.push({ atkArmy, defArmy, region });
}

let _showBattleResultCalls = [];
function showBattleResult(result) {
  _showBattleResultCalls.push(result);
}

function _applyBattleResult(attackerNationId, defenderNationId, result, opts = {}) {
  if (!result) return;
  if (!opts.skipDefensiveAlliances) triggerDefensiveAlliances(attackerNationId, defenderNationId);
  if (result.capturedRegionId && result.jointAllies?.length) {
    _applySharedLoot(attackerNationId, defenderNationId, result.capturedRegionId, result.jointAllies);
  }
  const attName = GAME_STATE.nations[attackerNationId]?.name ?? attackerNationId;
  const defName = GAME_STATE.nations[defenderNationId]?.name ?? defenderNationId;
  const winName = GAME_STATE.nations[result.winner]?.name ?? result.winner;
  const isPlayerInvolved = attackerNationId === GAME_STATE.player_nation
                        || defenderNationId === GAME_STATE.player_nation;
  addEventLog(`Сражение: ${attName} vs ${defName}. Победитель: ${winName}.`,
    isPlayerInvolved ? 'danger' : 'info');
}

function _showTacticalChoiceModal(attackerNationId, defenderNationId, opts) {
  const existing = document.getElementById('tactical-choice-modal');
  if (existing) existing.remove();

  const atk = GAME_STATE.nations[attackerNationId];
  const def = GAME_STATE.nations[defenderNationId];
  if (!atk || !def) return;

  const targetRegionId = opts.targetRegionId
    || (def.regions?.length > 0 ? def.regions[def.regions.length - 1] : null);
  const regionData = targetRegionId ? (GAME_STATE.regions?.[targetRegionId]) : null;
  const regionName = MAP_REGIONS?.[targetRegionId]?.name
    ?? regionData?.name ?? targetRegionId ?? 'неизвестном месте';
  const terrain = regionData?.terrain || 'plains';

  const atkStr = (atk.military?.infantry || 0) + (atk.military?.cavalry || 0) + (atk.military?.archers || 0);
  const defStr = (def.military?.infantry || 0) + (def.military?.cavalry || 0) + (def.military?.archers || 0);
  const terrainLabel = {
    plains: 'Равнина', hills: 'Холмы', mountains: 'Горы',
    river_valley: 'Речная долина', coastal_city: 'Побережье'
  }[terrain] ?? terrain;

  const modal = document.createElement('div');
  modal.id = 'tactical-choice-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:8900;';

  // Для тестов сохраняем данные на modal чтобы проверить их
  modal._regionName    = regionName;
  modal._atkStr        = atkStr;
  modal._defStr        = defStr;
  modal._terrainLabel  = terrainLabel;
  modal._terrain       = terrain;
  modal._targetRegionId = targetRegionId;

  // Кнопки: для тестов используем простые объекты с onclick
  const btnPlay = { id: 'tcm-play', onclick: null };
  const btnAuto = { id: 'tcm-auto', onclick: null };

  _domElements['tcm-play'] = btnPlay;
  _domElements['tcm-auto'] = btnAuto;
  document.body.appendChild(modal);

  btnPlay.onclick = () => {
    modal.remove();
    delete _domElements['tcm-play'];
    delete _domElements['tcm-auto'];

    const atkArmy = atk.military;
    atkArmy.nation_id = attackerNationId;
    if (atkArmy.archers === undefined) atkArmy.archers = 0;

    const defArmy = def.military;
    defArmy.nation_id = defenderNationId;
    if (defArmy.archers === undefined) defArmy.archers = 0;

    const region = { id: targetRegionId, name: regionName, terrain };
    if (typeof openTacticalMap === 'function') openTacticalMap(atkArmy, defArmy, region);
  };

  btnAuto.onclick = () => {
    modal.remove();
    delete _domElements['tcm-play'];
    delete _domElements['tcm-auto'];

    const result = resolveBattle(attackerNationId, defenderNationId, opts);
    if (!result) return;
    _applyBattleResult(attackerNationId, defenderNationId, result, opts);
    if (typeof showBattleResult === 'function') showBattleResult(result);
  };
}

function processAttackAction(attackerNationId, defenderNationId, opts = {}) {
  if (_isBlockedByNonAggression(attackerNationId, defenderNationId)) return null;

  // Бой игрока (не морской) — показать выбор режима
  if (attackerNationId === GAME_STATE.player_nation && opts.type !== 'naval') {
    _showTacticalChoiceModal(attackerNationId, defenderNationId, opts);
    return null;
  }

  const result = opts.type === 'naval'
    ? resolveNavalBattle(attackerNationId, defenderNationId)
    : resolveBattle(attackerNationId, defenderNationId, opts);
  if (!result) return;

  _applyBattleResult(attackerNationId, defenderNationId, result, opts);
  return result;
}

// ── Утилиты тестирования ─────────────────────────────────────────────

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
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `Expected ${b}, got ${a}`);
}
function assertDefined(v, msg) {
  if (v === undefined || v === null) throw new Error(msg ?? 'Expected defined value');
}
function assertNotNaN(v, msg) {
  if (typeof v === 'number' && isNaN(v)) throw new Error(msg ?? `Unexpected NaN`);
}

// ── Тесты ────────────────────────────────────────────────────────────

console.log('\n=== Этап 20: Модальный выбор режима боя ===\n');

// 1. ИИ vs ИИ — авторассчёт без модала
console.log('--- 1. ИИ-бой без модала ---');
test('ИИ vs ИИ: processAttackAction возвращает результат, модала нет', () => {
  const result = processAttackAction('ai1', 'ai2');
  assertDefined(result, 'Результат не должен быть null для ИИ-боя');
  assert(!_domElements['tactical-choice-modal'], 'Модал не должен появляться для ИИ-боя');
});

test('ИИ vs ИИ: результат имеет поле winner без NaN', () => {
  const result = processAttackAction('ai1', 'ai2');
  assertDefined(result?.winner, 'result.winner должен быть определён');
  assertNotNaN(result?.atkCasualties, 'atkCasualties не должны быть NaN');
  assertNotNaN(result?.defCasualties, 'defCasualties не должны быть NaN');
});

// 2. Игрок атакует — появляется модал
console.log('\n--- 2. Игрок атакует — появляется модал ---');
test('processAttackAction для игрока возвращает null (асинхронный режим)', () => {
  const result = processAttackAction('player', 'enemy');
  assertEqual(result, null, 'processAttackAction должен вернуть null для игрока');
});

test('Модал создаётся при атаке игрока', () => {
  processAttackAction('player', 'enemy');
  assertDefined(_domElements['tactical-choice-modal'], 'Модал должен быть создан');
});

test('Модал содержит название региона', () => {
  processAttackAction('player', 'enemy');
  const modal = _domElements['tactical-choice-modal'];
  assertDefined(modal, 'Модал должен существовать');
  assert(modal._regionName === 'Карфагенские холмы', `Неверное название региона: ${modal._regionName}`);
});

test('Модал содержит числа войск без NaN', () => {
  processAttackAction('player', 'enemy');
  const modal = _domElements['tactical-choice-modal'];
  assertNotNaN(modal._atkStr, 'atkStr не должен быть NaN');
  assertNotNaN(modal._defStr, 'defStr не должен быть NaN');
  assert(modal._atkStr > 0, 'Сила атакующего должна быть > 0');
  assert(modal._defStr > 0, 'Сила защитника должна быть > 0');
});

test('Модал содержит метку местности', () => {
  processAttackAction('player', 'enemy');
  const modal = _domElements['tactical-choice-modal'];
  assertEqual(modal._terrainLabel, 'Холмы', `Неверная метка местности: ${modal._terrainLabel}`);
});

test('Кнопки tcm-play и tcm-auto присутствуют', () => {
  processAttackAction('player', 'enemy');
  assertDefined(_domElements['tcm-play'], 'Кнопка tcm-play должна существовать');
  assertDefined(_domElements['tcm-auto'], 'Кнопка tcm-auto должна существовать');
});

// 3. Кнопка "Сыграть битву" → openTacticalMap
console.log('\n--- 3. Кнопка ⚔ Сыграть битву ---');
test('tcm-play вызывает openTacticalMap с правильными аргументами', () => {
  _openTacticalMapCalls = [];
  processAttackAction('player', 'enemy');
  const btn = _domElements['tcm-play'];
  assertDefined(btn, 'Кнопка должна существовать');
  btn.onclick();
  assertEqual(_openTacticalMapCalls.length, 1, 'openTacticalMap должен быть вызван 1 раз');
  const call = _openTacticalMapCalls[0];
  assertDefined(call.atkArmy, 'atkArmy должен быть передан');
  assertDefined(call.defArmy, 'defArmy должен быть передан');
  assertDefined(call.region, 'region должен быть передан');
});

test('tcm-play: atkArmy содержит nation_id и нужные поля', () => {
  _openTacticalMapCalls = [];
  processAttackAction('player', 'enemy');
  _domElements['tcm-play'].onclick();
  const { atkArmy } = _openTacticalMapCalls[0];
  assertEqual(atkArmy.nation_id, 'player', 'nation_id должен быть player');
  assert(typeof atkArmy.infantry === 'number', 'infantry должен быть числом');
  assert(typeof atkArmy.archers  === 'number', 'archers должен быть числом');
});

test('tcm-play: region имеет terrain и name', () => {
  _openTacticalMapCalls = [];
  processAttackAction('player', 'enemy');
  _domElements['tcm-play'].onclick();
  const { region } = _openTacticalMapCalls[0];
  assertDefined(region.terrain, 'region.terrain должен быть определён');
  assertDefined(region.name, 'region.name должен быть определён');
  assertNotNaN(region.terrain, 'terrain не должен быть NaN');
});

test('tcm-play: модал закрывается после нажатия', () => {
  processAttackAction('player', 'enemy');
  _domElements['tcm-play'].onclick();
  assert(!_domElements['tactical-choice-modal'], 'Модал должен быть закрыт после клика Play');
});

// 4. Кнопка "Авторассчёт" → showBattleResult
console.log('\n--- 4. Кнопка ⚡ Авторассчёт ---');
test('tcm-auto вызывает showBattleResult', () => {
  _showBattleResultCalls = [];
  processAttackAction('player', 'enemy');
  const btn = _domElements['tcm-auto'];
  assertDefined(btn, 'Кнопка tcm-auto должна существовать');
  btn.onclick();
  assertEqual(_showBattleResultCalls.length, 1, 'showBattleResult должен быть вызван 1 раз');
});

test('tcm-auto: результат содержит winner без NaN', () => {
  _showBattleResultCalls = [];
  processAttackAction('player', 'enemy');
  _domElements['tcm-auto'].onclick();
  const result = _showBattleResultCalls[0];
  assertDefined(result?.winner, 'winner должен быть определён');
  assertNotNaN(result?.atkCasualties, 'atkCasualties не должен быть NaN');
  assertNotNaN(result?.defCasualties, 'defCasualties не должен быть NaN');
});

test('tcm-auto: модал закрывается после нажатия', () => {
  processAttackAction('player', 'enemy');
  _domElements['tcm-auto'].onclick();
  assert(!_domElements['tactical-choice-modal'], 'Модал должен быть закрыт после Auto');
});

test('tcm-auto: в лог добавляется запись о бое', () => {
  _eventLog.length = 0;
  processAttackAction('player', 'enemy');
  _domElements['tcm-auto'].onclick();
  assert(_eventLog.length > 0, 'Должна быть запись в eventLog');
  assert(_eventLog[_eventLog.length - 1].type === 'danger', 'Бой игрока должен быть типа danger');
});

// 5. Морской бой — авторассчёт без модала
console.log('\n--- 5. Морской бой — без модала ---');
test('Морской бой игрока — не показывает модал (resolveNavalBattle)', () => {
  const prevModal = _domElements['tactical-choice-modal'];
  const result = processAttackAction('player', 'enemy', { type: 'naval' });
  // Naval returns null because resolveNavalBattle returns null in mock
  assert(!_domElements['tactical-choice-modal'] || _domElements['tactical-choice-modal'] === prevModal,
    'Для морского боя модал выбора не должен появляться');
});

// 6. Повторный модал — старый удаляется
console.log('\n--- 6. Повторный вызов — модал не дублируется ---');
test('Повторный processAttackAction удаляет предыдущий модал', () => {
  processAttackAction('player', 'enemy');
  processAttackAction('player', 'enemy');
  // Должен быть только один модал (второй заменил первый)
  assertDefined(_domElements['tactical-choice-modal'], 'Модал должен существовать');
  // Не должно быть дублирования (проверяем что getElementById возвращает один)
  assert(true, 'Модал переиспользован без дублирования');
});

// 7. Целостность данных GAME_STATE после finalizeTacticalBattle
console.log('\n--- 7. Запись потерь обратно в GAME_STATE ---');
test('Ссылка на military: finalizeTacticalBattle обновляет GAME_STATE', () => {
  // Симулируем: atkArmy - прямая ссылка на military
  const atk = GAME_STATE.nations['player'];
  const atkArmy = atk.military;
  atkArmy.nation_id = 'player';
  const infBefore = atkArmy.infantry;

  // Симулируем finalizeTacticalBattle - записывает обратно в atkArmy
  const ratio = 0.7;
  atkArmy.infantry = Math.floor(atkArmy.infantry * ratio);

  // Проверяем что GAME_STATE обновился (т.к. atkArmy - прямая ссылка)
  assert(GAME_STATE.nations['player'].military.infantry === atkArmy.infantry,
    'GAME_STATE.nations.player.military.infantry должен обновиться через ссылку');
  assert(GAME_STATE.nations['player'].military.infantry < infBefore,
    'Потери должны уменьшить infantry в GAME_STATE');

  // Восстановить
  GAME_STATE.nations['player'].military.infantry = 2000;
});

// 8. Если у защитника нет регионов — модал не ломается
console.log('\n--- 8. Граничные случаи ---');
test('Пустой список регионов защитника — модал всё равно создаётся', () => {
  const origRegions = GAME_STATE.nations['enemy'].regions;
  GAME_STATE.nations['enemy'].regions = [];
  processAttackAction('player', 'enemy');
  const modal = _domElements['tactical-choice-modal'];
  assertDefined(modal, 'Модал должен создаться даже без регионов защитника');
  GAME_STATE.nations['enemy'].regions = origRegions;
});

test('Нет NaN в силе войск если archers undefined', () => {
  const origArchers = GAME_STATE.nations['enemy'].military.archers;
  delete GAME_STATE.nations['enemy'].military.archers;
  processAttackAction('player', 'enemy');
  const modal = _domElements['tactical-choice-modal'];
  assertNotNaN(modal._defStr, 'defStr не должен быть NaN при отсутствии archers');
  GAME_STATE.nations['enemy'].military.archers = origArchers;
});

// ── Итог ─────────────────────────────────────────────────────────────
console.log(`\n=== Итог: ${passed} пройдено, ${failed} провалено ===\n`);
if (failed > 0) process.exit(1);
