// Тесты Этапа 13 — Командир на поле (аура, гибель, засада)
// Запуск: node tests/test_tactical_stage13.mjs

// ── Инлайн-константы ────────────────────────────────
const TACTICAL_GRID_COLS = 22;
const TACTICAL_GRID_ROWS = 16;
const CELL_SIZE          = 40;
const MAX_UNITS_PER_SIDE = 20;
const RESERVE_ZONE_COLS  = 3;

// ── Инлайн: вспомогательные функции ─────────────────

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
    ...extra
  };
}

function makeBattleState(playerUnits = [], enemyUnits = []) {
  return {
    playerUnits,
    enemyUnits,
    turn: 1,
    log: [],
    elevatedCells: new Set(),
    ambushUsed: false
  };
}

// ── Инлайн: processCommanderAura ─────────────────────

function processCommanderAura(bs) {
  for (const side of ['player', 'enemy']) {
    const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;
    const cmd   = units.find(u => u.isCommander && u.strength > 0);
    if (!cmd) continue;

    const skills    = cmd.commander?.skills ?? [];
    const auraBonus = 15 + (skills.includes('inspiring') ? 10 : 0);

    const nearby = units.filter(u =>
      u.id !== cmd.id && u.strength > 0 && !u.isRouting &&
      Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= 2
    );

    for (const u of nearby) {
      const prev = u.morale;
      u.morale = Math.min(100, u.morale + auraBonus * 0.1);
      if (prev < 60 && u.morale > prev)
        addLog(bs, `★ ${cmd.commander?.name ?? 'Командир'} воодушевляет войска`);
    }
  }
}

// ── Инлайн: processCommanderDeath ────────────────────

function processCommanderDeath(cmd, bs, forceKill = false) {
  const side  = cmd.side;
  const units = side === 'player' ? bs.playerUnits : bs.enemyUnits;

  if (forceKill || Math.random() < 0.10) {
    cmd.strength = 0;
    addLog(bs, `💀 КОМАНДИР ПАЛ В БОЮ! Армия в смятении! (-30 мораль всем)`);
    for (const u of units) {
      u.morale = Math.max(0, u.morale - 30);
    }
  }
}

// ── Инлайн: _triggerAmbush (без DOM) ─────────────────

function triggerAmbushLogic(bs) {
  if (!bs || bs.ambushUsed) return false;
  const cmd = bs.playerUnits.find(u => u.isCommander && u.strength > 0);
  if (!cmd || !cmd.commander?.skills?.includes('cunning')) return false;

  bs.ambushUsed = true;
  const r        = 3;
  const affected = bs.enemyUnits.filter(u =>
    u.strength > 0 &&
    Math.abs(u.gridX - cmd.gridX) + Math.abs(u.gridY - cmd.gridY) <= r
  );
  for (const u of affected) {
    u.morale = Math.max(0, u.morale - 20);
  }
  addLog(bs, `🎯 Засада! Враги в радиусе ${r} клеток деморализованы (-20 мораль)`);
  return true;
}

// ── Тест-инфраструктура ──────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertClose(actual, expected, delta, message) {
  if (Math.abs(actual - expected) > delta)
    throw new Error(`${message}: ожидалось ~${expected} (±${delta}), получено ${actual}`);
}

// ════════════════════════════════════════════════════
// Тест 1: Аура командира — мораль восстанавливается
// ════════════════════════════════════════════════════

console.log('\nТест 1: Аура командира восстанавливает мораль союзников');

test('Юнит в радиусе 2 от командира получает +1.5 морали за тик', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'Генерал', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale = 80;
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  // auraBonus = 15, per tick = 15 * 0.1 = 1.5
  assertClose(unit.morale, 81.5, 0.01, 'Мораль юнита');
});

test('Юнит вне радиуса (расстояние 3) НЕ получает бонус ауры', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'Генерал', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 8, 7);
  unit.morale = 80;
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  assert(unit.morale === 80, `Мораль не должна меняться вне радиуса, но: ${unit.morale}`);
});

test('Commanding с навыком inspiring даёт +2.5 морали за тик', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, {
    isCommander: true,
    commander: { name: 'Генерал', skills: ['inspiring'] }
  });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale = 80;
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  // auraBonus = 25, per tick = 25 * 0.1 = 2.5
  assertClose(unit.morale, 82.5, 0.01, 'Мораль с inspiring');
});

test('Мораль не превышает 100', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'Г', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale = 99.9;
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  assert(unit.morale <= 100, `Мораль не должна превышать 100, но: ${unit.morale}`);
});

test('Routing-юнит НЕ получает бонус ауры', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'Г', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale  = 50;
  unit.isRouting = true;
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  assert(unit.morale === 50, `Routing-юнит не должен получать ауру, но: ${unit.morale}`);
});

test('Мёртвый командир (strength=0) НЕ даёт ауру', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 0, 5, 7, { isCommander: true, commander: { name: 'Г', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale = 50;
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  assert(unit.morale === 50, `Мёртвый командир не должен давать ауру, но: ${unit.morale}`);
});

test('Лог "воодушевляет войска" появляется если мораль была < 60', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'Герой', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale = 40; // < 60
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  const hasLog = bs.log.some(l => l.text.includes('воодушевляет войска'));
  assert(hasLog, 'Лог должен содержать "воодушевляет войска"');
});

test('Лог НЕ появляется если мораль >= 60', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'Герой', skills: [] } });
  const unit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  unit.morale = 70; // >= 60
  const bs = makeBattleState([cmd, unit], []);
  processCommanderAura(bs);
  const hasLog = bs.log.some(l => l.text.includes('воодушевляет войска'));
  assert(!hasLog, 'Лог НЕ должен появляться при морали >= 60');
});

test('Аура работает для обеих сторон независимо', () => {
  const pCmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true, commander: { name: 'П', skills: [] } });
  const pUnit = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  pUnit.morale = 40;
  const eCmd  = createUnit('e_cmd', 'enemy', 'infantry', 50, 15, 7, { isCommander: true, commander: { name: 'Е', skills: [] } });
  const eUnit = createUnit('e_inf_0', 'enemy', 'infantry', 500, 14, 7);
  eUnit.morale = 40;
  const bs = makeBattleState([pCmd, pUnit], [eCmd, eUnit]);
  processCommanderAura(bs);
  assert(pUnit.morale > 40, `Мораль юнита игрока должна вырасти, но: ${pUnit.morale}`);
  assert(eUnit.morale > 40, `Мораль вражеского юнита должна вырасти, но: ${eUnit.morale}`);
});

// ════════════════════════════════════════════════════
// Тест 2: Гибель командира при атаке
// ════════════════════════════════════════════════════

console.log('\nТест 2: Гибель командира');

test('forceKill=true → командир погибает (strength=0)', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const bs  = makeBattleState([cmd], []);
  processCommanderDeath(cmd, bs, true);
  assert(cmd.strength === 0, `strength командира должен быть 0, но: ${cmd.strength}`);
});

test('Гибель командира → лог "КОМАНДИР ПАЛ В БОЮ"', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const bs  = makeBattleState([cmd], []);
  processCommanderDeath(cmd, bs, true);
  const hasLog = bs.log.some(l => l.text.includes('КОМАНДИР ПАЛ В БОЮ'));
  assert(hasLog, 'Лог должен содержать "КОМАНДИР ПАЛ В БОЮ"');
});

test('Гибель командира → все свои юниты теряют 30 морали', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const inf1 = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  const inf2 = createUnit('p_inf_1', 'player', 'infantry', 500, 7, 7);
  inf1.morale = 70;
  inf2.morale = 50;
  const bs = makeBattleState([cmd, inf1, inf2], []);
  processCommanderDeath(cmd, bs, true);
  assert(inf1.morale === 40, `inf1 мораль: ожидалось 40, получено ${inf1.morale}`);
  assert(inf2.morale === 20, `inf2 мораль: ожидалось 20, получено ${inf2.morale}`);
});

test('Мораль после гибели командира не опускается ниже 0', () => {
  const cmd  = createUnit('p_cmd', 'player', 'infantry', 50, 5, 7, { isCommander: true });
  const inf  = createUnit('p_inf_0', 'player', 'infantry', 500, 6, 7);
  inf.morale = 15; // 15 - 30 = -15 → должно стать 0
  const bs = makeBattleState([cmd, inf], []);
  processCommanderDeath(cmd, bs, true);
  assert(inf.morale === 0, `Мораль не должна быть ниже 0, но: ${inf.morale}`);
});

test('Гибель вражеского командира → только вражеские юниты теряют мораль', () => {
  const eCmd  = createUnit('e_cmd', 'enemy', 'infantry', 50, 15, 7, { isCommander: true });
  const eInf  = createUnit('e_inf_0', 'enemy', 'infantry', 500, 14, 7);
  const pInf  = createUnit('p_inf_0', 'player', 'infantry', 500, 5, 7);
  eInf.morale = 80;
  pInf.morale = 80;
  const bs = makeBattleState([pInf], [eCmd, eInf]);
  processCommanderDeath(eCmd, bs, true);
  assert(eInf.morale === 50, `Мораль вражеского юнита: ожидалось 50, получено ${eInf.morale}`);
  assert(pInf.morale === 80, `Мораль юнита игрока не должна меняться, но: ${pInf.morale}`);
});

// ════════════════════════════════════════════════════
// Тест 3: Логика засады (triggerAmbushLogic)
// ════════════════════════════════════════════════════

console.log('\nТест 3: Засада командира');

test('Засада с навыком cunning деморализует врагов в радиусе 3', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'Хитрец', skills: ['cunning'] }
  });
  const e1 = createUnit('e_inf_0', 'enemy', 'infantry', 500, 12, 7); // расстояние 2 ≤ 3
  const e2 = createUnit('e_inf_1', 'enemy', 'infantry', 500, 14, 7); // расстояние 4 > 3
  e1.morale = 80;
  e2.morale = 80;
  const bs = makeBattleState([cmd], [e1, e2]);
  triggerAmbushLogic(bs);
  assert(e1.morale === 60, `e1 мораль: ожидалось 60, получено ${e1.morale}`);
  assert(e2.morale === 80, `e2 мораль не должна меняться, но: ${e2.morale}`);
});

test('Засада устанавливает ambushUsed = true', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'Х', skills: ['cunning'] }
  });
  const bs = makeBattleState([cmd], []);
  triggerAmbushLogic(bs);
  assert(bs.ambushUsed === true, 'ambushUsed должен быть true после засады');
});

test('Засада одноразовая — повторный вызов не срабатывает', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'Х', skills: ['cunning'] }
  });
  const e1 = createUnit('e_inf_0', 'enemy', 'infantry', 500, 12, 7);
  e1.morale = 80;
  const bs = makeBattleState([cmd], [e1]);
  triggerAmbushLogic(bs); // первый раз
  triggerAmbushLogic(bs); // второй раз — не должен сработать
  assert(e1.morale === 60, `После двух вызовов мораль должна быть 60, но: ${e1.morale}`);
});

test('Засада без навыка cunning НЕ срабатывает', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'Х', skills: ['inspiring'] } // нет cunning
  });
  const e1 = createUnit('e_inf_0', 'enemy', 'infantry', 500, 12, 7);
  e1.morale = 80;
  const bs = makeBattleState([cmd], [e1]);
  const result = triggerAmbushLogic(bs);
  assert(result === false, 'triggerAmbushLogic должен вернуть false без cunning');
  assert(e1.morale === 80, `Мораль не должна меняться без cunning, но: ${e1.morale}`);
});

test('Засада с мёртвым командиром НЕ срабатывает', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 0, 10, 7, {
    isCommander: true,
    commander: { name: 'Х', skills: ['cunning'] }
  });
  const e1 = createUnit('e_inf_0', 'enemy', 'infantry', 500, 12, 7);
  e1.morale = 80;
  const bs = makeBattleState([cmd], [e1]);
  const result = triggerAmbushLogic(bs);
  assert(result === false, 'triggerAmbushLogic должен вернуть false с мёртвым командиром');
  assert(e1.morale === 80, `Мораль не должна меняться при мёртвом командире, но: ${e1.morale}`);
});

test('Засада: лог содержит "Засада!" и "-20 мораль"', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'Х', skills: ['cunning'] }
  });
  const bs = makeBattleState([cmd], []);
  triggerAmbushLogic(bs);
  const hasLog = bs.log.some(l => l.text.includes('Засада') && l.text.includes('-20 мораль'));
  assert(hasLog, 'Лог должен содержать "Засада" и "-20 мораль"');
});

test('Мораль врага не опускается ниже 0 при засаде', () => {
  const cmd = createUnit('p_cmd', 'player', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'Х', skills: ['cunning'] }
  });
  const e1 = createUnit('e_inf_0', 'enemy', 'infantry', 500, 12, 7);
  e1.morale = 10; // 10 - 20 = -10 → должно стать 0
  const bs = makeBattleState([cmd], [e1]);
  triggerAmbushLogic(bs);
  assert(e1.morale === 0, `Мораль не должна быть < 0, но: ${e1.morale}`);
});

// ════════════════════════════════════════════════════
// Тест 4: Аура вражеского командира
// ════════════════════════════════════════════════════

console.log('\nТест 4: Аура вражеского командира');

test('Вражеский командир тоже повышает мораль своих юнитов', () => {
  const eCmd  = createUnit('e_cmd', 'enemy', 'infantry', 50, 15, 7, {
    isCommander: true,
    commander: { name: 'ВрагГен', skills: [] }
  });
  const eUnit = createUnit('e_inf_0', 'enemy', 'infantry', 500, 14, 7);
  eUnit.morale = 40; // < 60 → лог будет
  const bs = makeBattleState([], [eCmd, eUnit]);
  processCommanderAura(bs);
  assert(eUnit.morale > 40, `Мораль вражеского юнита должна вырасти, но: ${eUnit.morale}`);
});

test('Аура вражеского командира НЕ влияет на юнитов игрока', () => {
  const eCmd  = createUnit('e_cmd', 'enemy', 'infantry', 50, 10, 7, {
    isCommander: true,
    commander: { name: 'ВрагГен', skills: [] }
  });
  const pUnit = createUnit('p_inf_0', 'player', 'infantry', 500, 11, 7); // рядом!
  pUnit.morale = 50;
  const bs = makeBattleState([pUnit], [eCmd]);
  processCommanderAura(bs);
  assert(pUnit.morale === 50, `Мораль игрока не должна меняться от ауры врага, но: ${pUnit.morale}`);
});

// ── Итог ────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Итог: ${passed} пройдено, ${failed} провалено`);
if (failed > 0) {
  console.error('❌ Есть провалившиеся тесты!');
  process.exit(1);
} else {
  console.log('✅ Все тесты пройдены!');
}
