/**
 * MIL_009 — Перебалансировка атриции и усталости
 * Тесты:
 *  1. Константы (порог 50, rate 0.025, fatigue 14/-10/-3)
 *  2. Атриция при supply < 50
 *  3. Наёмники теряют вдвое меньше (mercFactor 0.5)
 *  4. Штраф морали при supply < 30
 *  5. Лог-событие при высокой атриции
 *  6. Вычисления усталости через константы
 *  7. Регрессии MIL_002–MIL_008
 */
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── Проверка констант через исходник ──────────────────────────────────────
const srcText = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');

console.log('\n[T1] Константы ARMY_MOVE (MIL_009) — проверка исходника');
ok('SUPPLY_ATTRITION_THRESHOLD: 50',  srcText.includes('SUPPLY_ATTRITION_THRESHOLD: 50'));
ok('ATTRITION_RATE: 0.025',           srcText.includes('ATTRITION_RATE:             0.025') ||
                                       srcText.includes('ATTRITION_RATE: 0.025'));
ok('FATIGUE_MARCH: 14',               srcText.includes('FATIGUE_MARCH:        14') ||
                                       srcText.includes('FATIGUE_MARCH: 14'));
ok('FATIGUE_REST_FRIENDLY: -10',      srcText.includes('FATIGUE_REST_FRIENDLY: -10'));
ok('FATIGUE_REST_ENEMY: -3',          srcText.includes('FATIGUE_REST_ENEMY:    -3') ||
                                       srcText.includes('FATIGUE_REST_ENEMY: -3'));

// ── VM context ─────────────────────────────────────────────────────────────
let lastLog = null;
const GS = {
  armies: [], nations: {}, turn: 1, player_nation: 'player',
  regions: {
    r1: { id:'r1', name:'Равнина', terrain:'plains', nation:'rome',
          connections: [], building_slots: [] },
    r2: { id:'r2', name:'Горы', terrain:'mountains', nation:'persia',
          connections: [], building_slots: [] },
  }
};

const armiesCtx = vm.createContext({
  GAME_STATE: GS, console, Math, Object, Array, JSON, Set, Map,
  addEventLog: (msg) => { lastLog = msg; },
  checkNavalBlockade: () => ({ isBlockaded: false, blockadePower: 0 }),
  getArmyCommander: () => null,
  updateArmyLogisticTimer: () => {},
  calcLogisticPenalty: () => 0,
  captureRegion: () => {},
  processSiegeTicks: () => {},
  resolveArmyBattle: () => {},
  beginSiege: () => {},
  getCommanderDecisionNow: () => null,
});
vm.runInContext(srcText, armiesCtx);

const _processSupply  = armiesCtx._processSupply;
const calcArmySpeed   = armiesCtx.calcArmySpeed;
const createArmy      = armiesCtx.createArmy;
const findArmyPath    = armiesCtx.findArmyPath;

ok('_processSupply loaded',   typeof _processSupply === 'function');
ok('calcArmySpeed loaded',    typeof calcArmySpeed  === 'function');

function makeArmy(overrides = {}) {
  return Object.assign({
    id: 'a1', nation: 'rome', type: 'land', name: 'Тестовая армия',
    position: 'r1',
    units: { infantry: 1000, cavalry: 200, mercenaries: 300, artillery: 0 },
    morale: 70, fatigue: 20, supply: 100,
    state: 'stationed', path: [],
  }, overrides);
}

// ─────────────────────────────────────────────────────────────────────────────
// T2: Атриция при supply 25 (< новый порог 50)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T2] Атриция при supply 25 (ниже порога 50)');
{
  const army = makeArmy({ supply: 25 });
  const infBefore  = army.units.infantry;
  const mercBefore = army.units.mercenaries;
  _processSupply(army);
  ok('Пехота уменьшилась',     army.units.infantry  < infBefore);
  ok('Наёмники уменьшились',   army.units.mercenaries < mercBefore);
}

// ─────────────────────────────────────────────────────────────────────────────
// T3: Нет атриции при supply 60 (> порог 50) — армия дома
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T3] Нет атриции при supply 60 (выше порога 50)');
{
  const army = makeArmy({ supply: 60 });
  const infBefore = army.units.infantry;
  _processSupply(army);
  ok('Пехота НЕ уменьшилась',   army.units.infantry === infBefore);
}

// ─────────────────────────────────────────────────────────────────────────────
// T4: Наёмники несут вдвое меньше потерь (mercFactor 0.5)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T4] Наёмники (mercFactor 0.5) — потери вдвое меньше пехоты');
{
  // infantry rate * 0.6, merc rate * 0.6 * 0.5 = rate * 0.3 → ratio ≈ 2.0
  const army = makeArmy({
    supply: 0,
    units: { infantry: 2000, cavalry: 0, mercenaries: 2000, artillery: 0 }
  });
  const infBefore  = army.units.infantry;
  const mercBefore = army.units.mercenaries;
  _processSupply(army);
  const infLoss  = infBefore  - army.units.infantry;
  const mercLoss = mercBefore - army.units.mercenaries;
  ok('Потери пехоты > потерь наёмников',   infLoss > mercLoss);
  const ratio = infLoss / Math.max(1, mercLoss);
  ok('Соотношение потерь ≈ 2.0 (±0.2)',     ratio >= 1.8 && ratio <= 2.2);
}

// ─────────────────────────────────────────────────────────────────────────────
// T5: Штраф морали при supply < 30 с потерями
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T5] Штраф морали при supply < 30');
{
  const army = makeArmy({ supply: 10, morale: 60 });
  _processSupply(army);
  ok('Мораль снизилась при supply=10',   army.morale < 60);
}

// ─────────────────────────────────────────────────────────────────────────────
// T6: Мораль НЕ штрафуется при supply 35 (>=30, только атриция)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T6] Мораль НЕ снижается при supply 35 (supply >= 30)');
{
  const army = makeArmy({ supply: 35, morale: 70 });
  const moraleBefore = army.morale;
  _processSupply(army);
  ok('Мораль не упала при supply=35',   army.morale === moraleBefore);
}

// ─────────────────────────────────────────────────────────────────────────────
// T7: Лог-событие при высокой атриции (rate > 0.015)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T7] Лог-событие при значительной атриции');
{
  lastLog = null;
  armiesCtx.addEventLog = (msg) => { lastLog = msg; };
  const army = makeArmy({
    supply: 0,
    units: { infantry: 2000, cavalry: 500, mercenaries: 500, artillery: 0 }
  });
  _processSupply(army);
  armiesCtx.addEventLog = (msg) => { lastLog = msg; };
  ok('Событие залогировано',           lastLog !== null);
  ok('Лог содержит текст об атриции',  lastLog !== null && lastLog.includes('несёт потери'));
}

// ─────────────────────────────────────────────────────────────────────────────
// T8: Значение FATIGUE_REST_FRIENDLY применяется как -10
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T8] Восстановление усталости: -10 на дружественной территории');
{
  // Читаем значение из исходника
  const match = srcText.match(/FATIGUE_REST_FRIENDLY:\s*(-\d+)/);
  const val = match ? parseInt(match[1]) : null;
  ok('FATIGUE_REST_FRIENDLY = -10 в источнике',   val === -10);
  if (val !== null) {
    const f = Math.max(0, 40 + val);
    ok('40 + (-10) = 30',   f === 30);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T9: FATIGUE_MARCH = 14
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T9] Усталость за марш = 14');
{
  const match = srcText.match(/FATIGUE_MARCH:\s*(\d+)/);
  const val = match ? parseInt(match[1]) : null;
  ok('FATIGUE_MARCH = 14 в источнике',   val === 14);
  if (val !== null) {
    ok('20 + 14 = 34',   (20 + val) === 34);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T10: FATIGUE_REST_ENEMY = -3
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[T10] Восстановление усталости: -3 на вражеской территории');
{
  const match = srcText.match(/FATIGUE_REST_ENEMY:\s*(-\d+)/);
  const val = match ? parseInt(match[1]) : null;
  ok('FATIGUE_REST_ENEMY = -3 в источнике',   val === -3);
  if (val !== null) {
    const f = Math.max(0, 30 + val);
    ok('30 + (-3) = 27',   f === 27);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION: ключевые функции armies.js не сломаны
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[REGRESSION] MIL_002–MIL_008: функции armies.js не сломаны');
ok('calcArmySpeed существует',    typeof calcArmySpeed  === 'function');
ok('findArmyPath существует',     typeof findArmyPath   === 'function');
ok('createArmy существует',       typeof createArmy     === 'function');

// MIL_003: Блокада не вызывает исключений
{
  armiesCtx.checkNavalBlockade = () => ({ isBlockaded: true, blockadePower: 8 });
  const army = makeArmy({ supply: 80 });
  let err = null;
  try { _processSupply(army); } catch(e) { err = e; }
  ok('MIL_003 блокада без исключений', err === null);
  armiesCtx.checkNavalBlockade = () => ({ isBlockaded: false, blockadePower: 0 });
}

// MIL_004: findArmyPath не сломан
{
  GS.regions['pa'] = { terrain: 'plains', mapType: 'Land', name: 'A', connections: ['pb'], building_slots: [] };
  GS.regions['pb'] = { terrain: 'plains', mapType: 'Land', name: 'B', connections: ['pa'], building_slots: [] };
  const p = findArmyPath('pa', 'pb', 'land', 'rome');
  ok('MIL_004 findArmyPath возвращает путь', p !== null && Array.isArray(p));
}

// ─────────────────────────────────────────────────────────────────────────────
// Итог
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════`);
console.log(`MIL_009 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
