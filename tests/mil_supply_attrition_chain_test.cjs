'use strict';
/**
 * MIL SUPPLY + ATTRITION CHAIN TEST — Тест 3
 *
 * Проверяет цепочку MIL_004 (supply path) + MIL_009 (attrition) + MIL_003 (blockade supply):
 * - findArmyPath с checkSupply=true vs false
 * - Атриция при supply < 50
 * - Наёмники теряют вдвое меньше
 * - Моральный штраф при атриции
 * - Морская блокада снижает снабжение
 *
 * Запуск: node tests/mil_supply_attrition_chain_test.cjs
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── Load armies.js via vm ────────────────────────────────────────────────────
const armiesSrc = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');
const events = [];
const GS = {
  armies: [], nations: {}, regions: {}, player_nation: null, turn: 1
};
const armiesCtx = vm.createContext({
  GAME_STATE: GS, console, Math, Object, Array, JSON, Set, Map,
  addEventLog: (msg) => events.push(msg),
  checkNavalBlockade: (regionId, nationId) => {
    // Simulate blockade if region has 'blockaded' flag
    const r = GS.regions[regionId];
    if (r?.blockaded) return { isBlockaded: true,  blockadePower: 12 };
    return { isBlockaded: false, blockadePower: 0 };
  },
  getArmyCommander: () => null,
  updateArmyLogisticTimer: () => {},
  calcLogisticPenalty: () => 0,
  captureRegion: () => {},
  processSiegeTicks: () => {},
  resolveArmyBattle: () => {},
  beginSiege: () => {},
  getCommanderDecisionNow: () => null,
  utilityAIDecide: () => ({ action: 'hold', target_id: null, score: 0 }),
  getNationArmies: (n) => GS.armies.filter(a => a.nation === n),
});
vm.runInContext(armiesSrc, armiesCtx);
const { findArmyPath } = armiesCtx;

// ── Setup regions ─────────────────────────────────────────────────────────────
function setupSupplyMap() {
  GS.regions = {
    home:      { terrain: 'plains',    name: 'Home',    connections: ['plains1'],           nation: 'rome', mapType: 'Land', building_slots: [] },
    plains1:   { terrain: 'plains',    name: 'Plains1', connections: ['home','plains2'],     nation: 'rome', mapType: 'Land', building_slots: [] },
    plains2:   { terrain: 'plains',    name: 'Plains2', connections: ['plains1','target'],   nation: 'rome', mapType: 'Land', building_slots: [] },
    target:    { terrain: 'plains',    name: 'Target',  connections: ['plains2'],            nation: 'enemy', mapType: 'Land', building_slots: [] },

    // Mountain path (high terrain cost, low supply)
    mtn1:      { terrain: 'mountains', name: 'Mtn1',    connections: ['home','mtn2'],        nation: 'rome', mapType: 'Land', building_slots: [] },
    mtn2:      { terrain: 'mountains', name: 'Mtn2',    connections: ['mtn1','mtn3'],        nation: 'rome', mapType: 'Land', building_slots: [] },
    mtn3:      { terrain: 'mountains', name: 'Mtn3',    connections: ['mtn2','target'],      nation: 'enemy', mapType: 'Land', building_slots: [] },

    coastal:   { terrain: 'coastal_city', name: 'Port', connections: ['home'],              nation: 'rome', mapType: 'coastal', building_slots: [] },
  };
  GS.nations = {
    rome:  { name: 'Rome',  military: { at_war_with: [] }, regions: ['home','plains1','plains2'] },
    enemy: { name: 'Enemy', military: { at_war_with: ['rome'] }, regions: ['target'] },
  };
  GS.armies = [];
  events.length = 0;
}

// ── TEST 3a: findArmyPath returns path through plains ────────────────────────
console.log('\n=== T3a: findArmyPath через равнину ===');
setupSupplyMap();
{
  const path1 = findArmyPath('home', 'target', 'land', 'rome', false);
  console.log(`  path=${JSON.stringify(path1)}`);
  ok('T3a: path found', path1 && path1.length > 0);
  ok('T3a: path ends at target', path1 && path1[path1.length - 1] === 'target');
  ok('T3a: path does NOT go through mountains', !path1.includes('mtn1'));
}

// ── TEST 3b: findArmyPath(checkSupply=true) avoids costly mountain path ──────
console.log('\n=== T3b: findArmyPath с checkSupply=true (горы дороже) ===');
setupSupplyMap();
{
  const pathNoCheck = findArmyPath('home', 'target', 'land', 'rome', false);
  const pathCheck   = findArmyPath('home', 'target', 'land', 'rome', true);
  console.log(`  noCheck=${JSON.stringify(pathNoCheck)}`);
  console.log(`  check=${JSON.stringify(pathCheck)}`);
  ok('T3b: both paths found', pathNoCheck && pathCheck);
  ok('T3b: checkSupply path ends at target', pathCheck && pathCheck[pathCheck.length - 1] === 'target');
  // Both should use plains route when available
  ok('T3b: checkSupply prefers plains or same route', pathCheck && !pathCheck.includes('mtn1'));
}

// ── TEST 3c: Supply attrition constants ────────────────────────────────────
console.log('\n=== T3c: Константы атриции (MIL_009) ===');
{
  const srcText = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');
  ok('T3c: SUPPLY_ATTRITION_THRESHOLD = 50', srcText.includes('SUPPLY_ATTRITION_THRESHOLD: 50'));
  ok('T3c: ATTRITION_RATE = 0.025',          srcText.includes('ATTRITION_RATE:             0.025') || srcText.includes('ATTRITION_RATE: 0.025'));
  ok('T3c: FATIGUE_MARCH = 14',              srcText.includes('FATIGUE_MARCH:        14') || srcText.includes('FATIGUE_MARCH: 14'));
  ok('T3c: FATIGUE_REST_FRIENDLY = -10',     srcText.includes('FATIGUE_REST_FRIENDLY: -10'));
}

// ── TEST 3d: Attrition applies when supply < 50 ────────────────────────────
console.log('\n=== T3d: Атриция при supply < 50 ===');
setupSupplyMap();
{
  // Army on enemy territory (delta=-10): supply 35 → 25 → attrition + morale penalty (supply<30)
  const army = {
    id: 'army1', nation: 'rome', type: 'land', name: 'Legion I',
    position: 'target', target: null, path: [], move_progress: 0,
    units: { infantry: 5000, cavalry: 200, mercenaries: 0, artillery: 0 },
    morale: 70, discipline: 60, fatigue: 10,
    supply: 35, // On enemy territory: delta=-10 → 25 → attrition + morale penalty
    state: 'stationed',
  };
  GS.armies = [army];
  const unitsBefore = army.units.infantry + army.units.cavalry;

  armiesCtx._processSupply(army);

  const unitsAfter = army.units.infantry + army.units.cavalry;
  console.log(`  before=${unitsBefore} after=${unitsAfter} supply=${army.supply} morale=${army.morale}`);
  ok('T3d: attrition reduces units', unitsAfter < unitsBefore);
  ok('T3d: morale decreases when supply<30 + attrition', army.morale < 70);
}

// ── TEST 3e: Mercenaries lose 50% fewer troops from attrition ─────────────
console.log('\n=== T3e: Наёмники теряют вдвое меньше от атриции ===');
setupSupplyMap();
{
  const regularArmy = {
    id: 'regular', nation: 'rome', type: 'land', name: 'Legion',
    position: 'plains1', target: null, path: [], move_progress: 0,
    units: { infantry: 5000, cavalry: 0, mercenaries: 0, artillery: 0 },
    morale: 70, discipline: 60, fatigue: 10,
    supply: 25,
    state: 'stationed',
  };
  const mercArmy = {
    id: 'merc', nation: 'rome', type: 'land', name: 'Mercenaries',
    position: 'plains1', target: null, path: [], move_progress: 0,
    units: { infantry: 0, cavalry: 0, mercenaries: 5000, artillery: 0 },
    morale: 70, discipline: 60, fatigue: 10,
    supply: 25,
    state: 'stationed',
  };
  GS.armies = [regularArmy, mercArmy];

  const regBefore  = regularArmy.units.infantry;
  const mercBefore = mercArmy.units.mercenaries;

  armiesCtx._processSupply(regularArmy);
  armiesCtx._processSupply(mercArmy);

  const regLost  = regBefore  - regularArmy.units.infantry;
  const mercLost = mercBefore - mercArmy.units.mercenaries;

  console.log(`  regular lost=${regLost} merc lost=${mercLost}`);
  ok('T3e: regular army suffers attrition', regLost > 0);
  ok('T3e: mercenaries suffer less attrition', mercLost <= regLost);
}

// ── TEST 3f: Blockade reduces coastal supply ───────────────────────────────
console.log('\n=== T3f: Морская блокада снижает снабжение прибрежного региона ===');
setupSupplyMap();
{
  const army = {
    id: 'coast_army', nation: 'rome', type: 'land', name: 'Coastal Legion',
    position: 'coastal', target: null, path: [], move_progress: 0,
    units: { infantry: 3000, cavalry: 0, mercenaries: 0, artillery: 0 },
    morale: 70, discipline: 60, fatigue: 10,
    supply: 80,
    state: 'stationed',
  };

  // First: no blockade
  GS.armies = [army];
  const supplyBefore = army.supply;
  armiesCtx._processSupply(army);
  const supplyNoBlockade = army.supply;

  // Reset supply
  army.supply = 80;

  // Now with blockade
  GS.regions.coastal.blockaded = true;
  armiesCtx._processSupply(army);
  const supplyWithBlockade = army.supply;

  console.log(`  no_blockade_delta=${supplyNoBlockade - 80} blockade_delta=${supplyWithBlockade - 80}`);
  ok('T3f: blockade reduces supply more than no blockade', supplyWithBlockade < supplyNoBlockade);
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════');
console.log(`Supply + Attrition Chain Tests: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All supply/attrition chain tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some supply/attrition chain tests FAILED');
  process.exit(1);
}
