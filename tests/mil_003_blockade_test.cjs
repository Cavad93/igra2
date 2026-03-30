'use strict';
// ── MIL_003 Tests: Naval Blockade ─────────────────────────────────────
// Запуск: node tests/mil_003_blockade_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── Shared GAME_STATE ─────────────────────────────────────────────────
const GS = {
  regions: {},
  nations: {},
  armies:  [],
  sieges:  [],
  turn:    1,
  player_nation: 'rome',
};

const MR = {};
const logs = [];
function addEventLog(msg) { logs.push(msg); }

// ── Load combat.js ────────────────────────────────────────────────────
const combatSrc = fs.readFileSync(path.join(__dirname, '../engine/combat.js'), 'utf8');
const combatCtx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: MR, addEventLog,
  console, Math, Object, Array, JSON,
});
vm.runInContext(combatSrc, combatCtx);
const { checkNavalBlockade } = combatCtx;

ok('checkNavalBlockade exported', typeof checkNavalBlockade === 'function');

// ── Test 1: Non-coastal → never blockaded ─────────────────────────────
console.log('\n--- Test 1: Non-coastal region → no blockade ---');
GS.regions['r_plains'] = { terrain: 'plains', name: 'Plains', connections: [] };
GS.nations['rome']     = { military: { at_war_with: ['carthage'] }, relations: { carthage: { at_war: true } } };
GS.nations['carthage'] = { military: { at_war_with: ['rome'] },     relations: { rome: { at_war: true } } };
GS.armies = [{
  id: 'big_fleet', nation: 'carthage', type: 'naval',
  position: 'r_plains', state: 'stationed',
  ships: { triremes: 10, quinqueremes: 10, light_ships: 10 }
}];
const r1 = checkNavalBlockade('r_plains', 'rome');
ok('Non-coastal → not blockaded', r1.isBlockaded === false);
ok('blockadePower = 0',           r1.blockadePower === 0);

// ── Test 2: Coastal, no fleet → no blockade ───────────────────────────
console.log('\n--- Test 2: Coastal city, no enemy fleet ---');
GS.regions['r_port'] = { terrain: 'coastal_city', name: 'Port City', connections: ['sea_tyrrhenian'] };
GS.regions['sea_tyrrhenian'] = { terrain: 'ocean', mapType: 'Ocean', name: 'Tyrrhenian Sea', connections: ['r_port'] };
GS.armies = [];
const r2 = checkNavalBlockade('r_port', 'rome');
ok('No fleet → not blockaded', r2.isBlockaded === false);

// ── Test 3: Exactly 5 ships → no blockade (need > 5) ─────────────────
console.log('\n--- Test 3: 5 enemy ships → no blockade ---');
GS.armies = [{
  id: 'fleet3', nation: 'carthage', type: 'naval',
  position: 'sea_tyrrhenian', state: 'stationed',
  ships: { triremes: 3, quinqueremes: 0, light_ships: 2 }
}];
const r3 = checkNavalBlockade('r_port', 'rome');
ok('5 ships → not blockaded', r3.isBlockaded === false);
ok('blockadePower = 5',        r3.blockadePower === 5);

// ── Test 4: 6 ships in adjacent sea → blockade active ────────────────
console.log('\n--- Test 4: 6 enemy ships in adjacent sea → blockade active ---');
GS.armies = [{
  id: 'fleet4', nation: 'carthage', type: 'naval',
  position: 'sea_tyrrhenian', state: 'stationed',
  ships: { triremes: 4, quinqueremes: 1, light_ships: 1 }
}];
const r4 = checkNavalBlockade('r_port', 'rome');
ok('6 ships → blockaded',   r4.isBlockaded === true);
ok('blockadePower = 6',      r4.blockadePower === 6);

// ── Test 5: Friendly fleet (same nation) does NOT block ───────────────
console.log('\n--- Test 5: Own fleet does not block ---');
GS.armies = [{
  id: 'fleet5', nation: 'rome', type: 'naval',
  position: 'sea_tyrrhenian', state: 'stationed',
  ships: { triremes: 20, quinqueremes: 20, light_ships: 20 }
}];
const r5 = checkNavalBlockade('r_port', 'rome');
ok('Own fleet → not blockaded', r5.isBlockaded === false);

// ── Test 6: Disbanded fleet ignored ──────────────────────────────────
console.log('\n--- Test 6: Disbanded fleet is ignored ---');
GS.armies = [{
  id: 'fleet6', nation: 'carthage', type: 'naval',
  position: 'sea_tyrrhenian', state: 'disbanded',
  ships: { triremes: 20, quinqueremes: 20, light_ships: 20 }
}];
const r6 = checkNavalBlockade('r_port', 'rome');
ok('Disbanded fleet → not blockaded', r6.isBlockaded === false);

// ── Test 7: Non-naval army (land) does NOT count as blockade ──────────
console.log('\n--- Test 7: Land army does not blockade ---');
GS.armies = [{
  id: 'land_army', nation: 'carthage', type: 'land',
  position: 'sea_tyrrhenian', state: 'stationed',
  units: { infantry: 5000, cavalry: 0, mercenaries: 0, artillery: 0 },
  ships: { triremes: 10, quinqueremes: 10, light_ships: 10 },
}];
const r7 = checkNavalBlockade('r_port', 'rome');
ok('Land army does not blockade', r7.isBlockaded === false);

// ── Test 8: _processSupply gets -6 supply penalty from blockade ──────
console.log('\n--- Test 8: _processSupply applies blockade penalty ---');
const armiesSrc = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');
const armiesCtx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: MR, addEventLog, checkNavalBlockade,
  console, Math, Object, Array, JSON, Set, Map,
  resolveArmyBattle: () => {},
  beginSiege: () => {},
  captureRegion: () => {},
  getArmyCommander: () => null,
  updateArmyLogisticTimer: () => {},
  calcLogisticPenalty: () => 0,
  _isFortressLineBlocked: () => false,
});
vm.runInContext(armiesSrc, armiesCtx);

// Setup: coastal city owned by rome, enemy fleet > 5 ships in adjacent sea
GS.regions['r_blockaded_port'] = {
  terrain: 'coastal_city', name: 'Blockaded Port', nation: 'rome',
  connections: ['sea_tyrrhenian'], building_slots: [],
};
GS.armies = [{
  id: 'enemy_fleet', nation: 'carthage', type: 'naval',
  position: 'sea_tyrrhenian', state: 'stationed',
  ships: { triremes: 6, quinqueremes: 0, light_ships: 0 }
}];
const testArmy = {
  id: 'roman_army', nation: 'rome', type: 'land',
  position: 'r_blockaded_port', state: 'stationed',
  name: 'Легион I',
  units: { infantry: 1000, cavalry: 200, mercenaries: 0, artillery: 0 },
  morale: 80, discipline: 70, fatigue: 20, supply: 60,
  commander_id: null,
};
GS.armies.push(testArmy);

const supplyBefore = testArmy.supply;
armiesCtx._processSupply(testArmy);
// Home territory: SUPPLY_HOME=12, blockade penalty=-6, net=+6
// 60 + 6 = 66
const delta = testArmy.supply - supplyBefore;
ok(`Blockade penalty applied (delta=${delta}, expected=6)`, delta === 6);

// ── Test 9: No blockade penalty for inland region ─────────────────────
console.log('\n--- Test 9: Inland army unaffected by naval blockade ---');
GS.regions['r_inland'] = {
  terrain: 'plains', name: 'Inland Plains', nation: 'rome',
  connections: [], building_slots: [],
};
const armyInland = {
  id: 'inland_army', nation: 'rome', type: 'land',
  position: 'r_inland', state: 'stationed',
  name: 'Легион II',
  units: { infantry: 1000, cavalry: 0, mercenaries: 0, artillery: 0 },
  morale: 80, discipline: 70, fatigue: 20, supply: 60,
  commander_id: null,
};
GS.armies = [armyInland];
const supplyBeforeInland = armyInland.supply;
armiesCtx._processSupply(armyInland);
const deltaInland = armyInland.supply - supplyBeforeInland;
// Home territory no blockade: SUPPLY_HOME = 12 → supply 60→72
ok(`Inland army full supply gain (delta=${deltaInland}, expected=12)`, deltaInland === 12);

// ── Test 10: _scoreNavalBlockade in utility_ai ────────────────────────
console.log('\n--- Test 10: Naval fleet AI scores blockade target ---');
const aiSrc = fs.readFileSync(path.join(__dirname, '../ai/utility_ai.js'), 'utf8');

function calcArmyCombatStrength(army, terrain) {
  const u = army.units ?? {};
  return (u.infantry ?? 0) + (u.cavalry ?? 0) * 2 + (u.mercenaries ?? 0) + (u.artillery ?? 0) * 3;
}

const aiCtx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: MR, addEventLog, checkNavalBlockade,
  calcArmyCombatStrength,
  getArmyCommander: () => null,
  _isFortressLineBlocked: () => false,
  console, Math, Object, Array, JSON, Set, Map,
});
vm.runInContext(aiSrc, aiCtx);
const { _scoreNavalBlockade: scoreNaval } = aiCtx;

ok('_scoreNavalBlockade exported', typeof scoreNaval === 'function');

// Setup: rome fleet in sea, enemy carthage has coastal capital in nearby
GS.nations['rome']     = { name: 'Рим', military: { at_war_with: ['carthage'] }, capital: 'r_port', relations: { carthage: { at_war: true } } };
GS.nations['carthage'] = { name: 'Карфаген', military: { at_war_with: ['rome'] }, capital: 'r_carthage_port', relations: { rome: { at_war: true } } };
GS.regions['r_carthage_port'] = { terrain: 'coastal_city', name: 'Carthage', nation: 'carthage', population: 80000, connections: [] };

const fleet = {
  id: 'roman_fleet', nation: 'rome', type: 'naval',
  position: 'sea_tyrrhenian',
  ships: { triremes: 8, quinqueremes: 3, light_ships: 2 },
  units: { infantry: 0, cavalry: 0, mercenaries: 0, artillery: 0 },
  morale: 80, discipline: 70, fatigue: 10, supply: 80,
  state: 'stationed', commander_id: null,
};
const enemies  = ['carthage'];
// nearby map: both sea and enemy coastal capital
const nearby = {
  'sea_tyrrhenian':  { terrain: 'ocean', nation: 'neutral', name: 'Tyrrhenian Sea' },
  'r_carthage_port': { terrain: 'coastal_city', nation: 'carthage', name: 'Carthage', population: 80000 },
};
const result = scoreNaval(fleet, enemies, nearby);
ok('scoreNavalBlockade returns candidate', result !== null && result.target !== null);
ok('target is enemy coastal capital',     result?.target === 'r_carthage_port');
ok('score >= 75 (base 45 + capital 30)', result?.score >= 75);
ok('reasoning includes naval_blockade',   result?.reasoning?.includes('naval_blockade'));

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n=== MIL_003 Tests: ${passed}/${passed+failed} passed ===`);
if (failed > 0) process.exit(1);
