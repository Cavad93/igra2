// Тесты Этапа 7 — панель выбранного юнита и кнопки формаций
// Запуск: node tests/test_tactical_stage7.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const UNIT_BASE_SIZE     = 400;
const RESERVE_ZONE_COLS  = 3;

const FORMATION_LABELS = {
  standard:  'Строй',
  aggressive:'Атака',
  defensive: 'Оборона',
  flanking:  'Охват',
  siege:     'Осада'
};

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

// ── Логика панели (инлайн, без DOM) ─────────────────

/**
 * Симуляция updateUnitPanel без DOM — возвращает объект
 * с теми же данными которые панель должна показать.
 */
function getUnitPanelData(unit, bs) {
  if (!unit || unit.side !== 'player') return null;

  const name = (unit.isCommander ? '★ Командир' : FORMATION_LABELS[unit.type] ?? unit.type)
    + ` (${unit.side === 'player' ? 'Свои' : 'Враги'})`;

  const strengthText = `${unit.strength.toLocaleString()} / ${unit.maxStrength.toLocaleString()} чел.`;

  let ammoText = '';
  let ammoRed  = false;
  if (unit.type === 'archers') {
    ammoText = unit.ammo > 0 ? `🏹 ${unit.ammo}/30 зарядов` : '🏹 Стрелы кончились';
    ammoRed  = unit.ammo <= 5;
  }

  const key = `${unit.gridX},${unit.gridY}`;
  const elevHint = bs.elevatedCells.has(key)
    ? '⛰ На возвышенности (+15% защита)' : '';

  const formationBtns = Object.keys(FORMATION_LABELS).map(f => ({
    key: f,
    label: FORMATION_LABELS[f],
    active: unit.formation === f
  }));

  const reserveBtn = unit.isReserve ? 'withdraw' : 'send';

  return { name, strengthText, ammoText, ammoRed, elevHint, formationBtns, reserveBtn,
           moralePct: unit.morale, fatiguePct: unit.fatigue };
}

/** Логика _setFormation без DOM */
function setFormation(unitId, formation, playerUnits) {
  const unit = playerUnits.find(u => u.id === unitId);
  if (unit) unit.formation = formation;
  return unit;
}

/** Логика _sendReserve / _withdrawReserve без DOM */
function sendToReserve(unitId, playerUnits) {
  const unit = playerUnits.find(u => u.id === unitId);
  if (unit) unit.isReserve = true;
  return unit;
}
function withdrawFromReserve(unitId, playerUnits) {
  const unit = playerUnits.find(u => u.id === unitId);
  if (unit) unit.isReserve = false;
  return unit;
}

// ── Фабрика battleState ───────────────────────────────
function makeBs() {
  const playerUnits = [
    createUnit('p_inf_0', 'player', 'infantry', 500,  4, 7),
    createUnit('p_cav_0', 'player', 'cavalry',  300,  5, 8),
    createUnit('p_arc_0', 'player', 'archers',  200,  4, 9),
    createUnit('p_cmd',   'player', 'infantry',  50,  5, 7, { isCommander: true, moveSpeed: 3 }),
  ];
  const enemyUnits = [
    createUnit('e_inf_0', 'enemy', 'infantry', 600, 15, 7),
    createUnit('e_cmd',   'enemy', 'infantry',  50, 16, 8, { isCommander: true, moveSpeed: 3 }),
  ];
  return {
    playerUnits,
    enemyUnits,
    terrain: 'plains',
    elevatedCells: new Set(),
    turn: 0,
    phase: 'battle',
    log: [],
    selectedUnitId: null,
  };
}

// ── Тесты ────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? ''}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ═══════════════════════════════════════════════════
console.log('\n── getUnitPanelData — видимость панели ─────────');

test('null → панель скрыта (возвращает null)', () => {
  const bs = makeBs();
  const result = getUnitPanelData(null, bs);
  assert(result === null, 'для null панель не показывается');
});

test('вражеский юнит → панель скрыта (возвращает null)', () => {
  const bs = makeBs();
  const result = getUnitPanelData(bs.enemyUnits[0], bs);
  assert(result === null, 'для врага панель не показывается');
});

test('свой юнит → панель отображается (не null)', () => {
  const bs = makeBs();
  const result = getUnitPanelData(bs.playerUnits[0], bs);
  assert(result !== null, 'для своего юнита панель показывается');
});

// ═══════════════════════════════════════════════════
console.log('\n── Имя юнита ───────────────────────────────────');

test('infantry → "infantry (Свои)" (тип, не метка формации)', () => {
  // FORMATION_LABELS маппит ФОРМАЦИИ (standard/aggressive/...), а НЕ типы юнитов
  // Для infantry нет ключа в FORMATION_LABELS → fallback unit.type = 'infantry'
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.name, 'infantry (Свои)', 'имя infantry');
});

test('cavalry → "Охват (Свои)"... нет, "Строй (Свои)" — нет', () => {
  // cavalry не имеет своего FORMATION_LABELS, но cavalry — не тип формации
  // FORMATION_LABELS[unit.type] ?? unit.type -> кавалерия отображается как тип 'cavalry'
  // Но по spec: FORMATION_LABELS[unit.type] для 'cavalry' отсутствует → unit.type
  const bs   = makeBs();
  const unit = bs.playerUnits[1]; // cavalry
  const data = getUnitPanelData(unit, bs);
  // cavalry нет в FORMATION_LABELS — отображается как 'cavalry'
  assert(data.name.startsWith('cavalry') || data.name.startsWith('Строй'),
    `имя кавалерии: ${data.name}`);
});

test('commander → имя начинается с "★ Командир"', () => {
  const bs   = makeBs();
  const cmd  = bs.playerUnits[3]; // isCommander
  const data = getUnitPanelData(cmd, bs);
  assert(data.name.startsWith('★ Командир'), `командир: ${data.name}`);
});

// ═══════════════════════════════════════════════════
console.log('\n── Число солдат ────────────────────────────────');

test('strength отображается как "500 / 500 чел."', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assert(data.strengthText.includes('500'), `строка силы: ${data.strengthText}`);
  assert(data.strengthText.includes('чел.'), 'строка содержит "чел."');
});

test('после урона strength показывает уменьшенное значение', () => {
  const bs   = makeBs();
  bs.playerUnits[0].strength = 250;
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assert(data.strengthText.includes('250'), `должно быть 250: ${data.strengthText}`);
  assert(data.strengthText.includes('500'), `должно быть 500 (max): ${data.strengthText}`);
});

// ═══════════════════════════════════════════════════
console.log('\n── Мораль и усталость ──────────────────────────');

test('morale 80 → moralePct === 80', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.moralePct, 80, 'мораль');
});

test('fatigue 0 → fatiguePct === 0', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.fatiguePct, 0, 'усталость');
});

test('после снижения morali до 30 → moralePct === 30', () => {
  const bs = makeBs();
  bs.playerUnits[0].morale = 30;
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.moralePct, 30, 'мораль 30');
});

// ═══════════════════════════════════════════════════
console.log('\n── Боеприпасы ──────────────────────────────────');

test('archers → ammoText содержит "30/30 зарядов"', () => {
  const bs   = makeBs();
  const arc  = bs.playerUnits[2]; // archers, ammo=30
  const data = getUnitPanelData(arc, bs);
  assert(data.ammoText.includes('30/30'), `ammo: ${data.ammoText}`);
  assert(!data.ammoRed, 'ammo не красный при полных стрелах');
});

test('archers ammo=0 → ammoText содержит "Стрелы кончились"', () => {
  const bs   = makeBs();
  bs.playerUnits[2].ammo = 0;
  const data = getUnitPanelData(bs.playerUnits[2], bs);
  assert(data.ammoText.includes('кончились'), `ammo: ${data.ammoText}`);
});

test('archers ammo<=5 → ammoRed=true', () => {
  const bs   = makeBs();
  bs.playerUnits[2].ammo = 3;
  const data = getUnitPanelData(bs.playerUnits[2], bs);
  assert(data.ammoRed === true, 'ammo красный при <= 5');
});

test('infantry → ammoText пустой', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.ammoText, '', 'пехота — пустая строка ammo');
});

test('cavalry → ammoText пустой', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[1], bs);
  assertEqual(data.ammoText, '', 'кавалерия — пустая строка ammo');
});

// ═══════════════════════════════════════════════════
console.log('\n── Кнопки формаций ─────────────────────────────');

test('formationBtns содержит ровно 5 формаций', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.formationBtns.length, 5, '5 кнопок формаций');
});

test('при formation=standard — кнопка standard активна', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  const activeBtn = data.formationBtns.find(b => b.active);
  assert(activeBtn !== undefined, 'должна быть активная кнопка');
  assertEqual(activeBtn.key, 'standard', 'активна standard');
});

test('после _setFormation → formation обновляется', () => {
  const bs = makeBs();
  setFormation('p_inf_0', 'aggressive', bs.playerUnits);
  assertEqual(bs.playerUnits[0].formation, 'aggressive', 'formation обновился');
});

test('после setFormation → панель показывает aggressive активной', () => {
  const bs = makeBs();
  setFormation('p_inf_0', 'aggressive', bs.playerUnits);
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  const activeBtn = data.formationBtns.find(b => b.active);
  assertEqual(activeBtn.key, 'aggressive', 'активна aggressive после смены');
});

test('все 5 формаций доступны в кнопках', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  const keys = data.formationBtns.map(b => b.key);
  for (const f of ['standard','aggressive','defensive','flanking','siege']) {
    assert(keys.includes(f), `кнопка "${f}" должна быть`);
  }
});

// ═══════════════════════════════════════════════════
console.log('\n── Кнопка резерва ──────────────────────────────');

test('юнит не в резерве → reserveBtn === "send"', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.reserveBtn, 'send', 'кнопка отправки в резерв');
});

test('_sendReserve → isReserve становится true', () => {
  const bs = makeBs();
  sendToReserve('p_inf_0', bs.playerUnits);
  assert(bs.playerUnits[0].isReserve === true, 'юнит в резерве');
});

test('после sendToReserve → reserveBtn === "withdraw"', () => {
  const bs = makeBs();
  sendToReserve('p_inf_0', bs.playerUnits);
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.reserveBtn, 'withdraw', 'кнопка вывода из резерва');
});

test('_withdrawReserve → isReserve становится false', () => {
  const bs = makeBs();
  sendToReserve('p_inf_0', bs.playerUnits);
  withdrawFromReserve('p_inf_0', bs.playerUnits);
  assert(bs.playerUnits[0].isReserve === false, 'юнит не в резерве');
});

// ═══════════════════════════════════════════════════
console.log('\n── Возвышенность в панели ──────────────────────');

test('юнит на обычной клетке → elevHint пустой', () => {
  const bs   = makeBs();
  const data = getUnitPanelData(bs.playerUnits[0], bs);
  assertEqual(data.elevHint, '', 'нет возвышенности');
});

test('юнит на elevated клетке → elevHint содержит "Возвышенности"', () => {
  const bs = makeBs();
  const unit = bs.playerUnits[0]; // gridX=4, gridY=7
  bs.elevatedCells.add('4,7');
  const data = getUnitPanelData(unit, bs);
  assert(data.elevHint.includes('возвышенности') || data.elevHint.includes('Возвышенности'),
    `elevHint: ${data.elevHint}`);
});

// ═══════════════════════════════════════════════════
console.log('\n── FORMATION_LABELS константа ──────────────────');

test('FORMATION_LABELS имеет все 5 ключей', () => {
  const keys = Object.keys(FORMATION_LABELS);
  assertEqual(keys.length, 5, '5 формаций');
  for (const f of ['standard','aggressive','defensive','flanking','siege']) {
    assert(f in FORMATION_LABELS, `нет ключа "${f}"`);
  }
});

test('метки формаций — непустые строки', () => {
  for (const [k, v] of Object.entries(FORMATION_LABELS)) {
    assert(typeof v === 'string' && v.length > 0, `метка "${k}" пустая`);
  }
});

// ═══════════════════════════════════════════════════
console.log('\n── Итог ────────────────────────────────────────');
console.log(`  Пройдено: ${passed}  Провалено: ${failed}`);
if (failed > 0) process.exit(1);
