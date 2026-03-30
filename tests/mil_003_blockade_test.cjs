'use strict';
// ── MIL_003 Tests: Naval Blockade ─────────────────────────────────────

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
GS.regions['r_plains'] = { terrain: 'plains', name: 'Plains' };
GS.nations['rome']     = { military: { at_war_with: ['carthage'] } };
GS.nations['carthage'] = { military: { at_war_with: ['rome']     } };
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
GS.regions['r_port'] = { terrain: 'coastal_city', name: 'Port City' };
GS.armies = [];
const r2 = checkNavalBlockade('r_port', 'rome');
ok('No fleet → not blockaded', r2.isBlockaded === false);

// ── Test 3: Exactly 5 ships → no blockade (need > 5) ─────────────────
console.log('\n--- Test 3: 5 enemy ships → no blockade ---');
GS.armies = [{
  id: 'fleet3', nation: 'carthage', type: 'naval',
  position: 'r_port', state: 'stationed',
  ships: { triremes: 3, quinqueremes: 0, light_ships: 2 }
}];
const r3 = checkNavalBlockade('r_port', 'rome');
ok('5 ships → not blockaded', r3.isBlockaded === false);
ok('blockadePower = 5',        r3.blockadePower === 5);

// ── Test 4: 6 ships → blockade active ─────────────────────────────────
console.log('\n--- Test 4: 6 enemy ships → blockade active ---');
GS.armies = [{
  id: 'fleet4', nation: 'carthage', type: 'naval',
  position: 'r_port', state: 'stationed',
  ships: { triremes: 4, quinqueremes: 1, light_ships: 1 }
}];
const r4 = checkNavalBlockade('r_port', 'rome');
ok('6 ships → blockaded',   r4.isBlockaded === true);
ok('blockadePower = 6',      r4.blockadePower === 6);

// ── Test 5: Friendly fleet (same nation) does NOT block ───────────────
console.log('\n--- Test 5: Own fleet does not block ---');
GS.armies = [{
  id: 'fleet5', nation: 'rome', type: 'naval',
  position: 'r_port', state: 'stationed',
  ships: { triremes: 20, quinqueremes: 20, light_ships: 20 }
}];
const r5 = checkNavalBlockade('r_port', 'rome');
ok('Own fleet → not blockaded', r5.isBlockaded === false);

// ── Test 6: Disbanded fleet ignored ──────────────────────────────────
console.log('\n--- Test 6: Disbanded fleet is ignored ---');
GS.armies = [{
  id: 'fleet6', nation: 'carthage', type: 'naval',
  position: 'r_port', state: 'disbanded',
  ships: { triremes: 20, quinqueremes: 20, light_ships: 20 }
}];
const r6 = checkNavalBlockade('r_port', 'rome');
ok('Disbanded fleet → not blockaded', r6.isBlockaded === false);

// ── Test 7: Non-naval army (land) does NOT count as blockade ──────────
console.log('\n--- Test 7: Land army does not blockade ---');
GS.armies = [{
  id: 'land_army', nation: 'carthage', type: 'land',
  position: 'r_port', state: 'stationed',
  units: { infantry: 5000, cavalry: 0, mercenaries: 0, artillery: 0 },
  ships: { triremes: 10, quinqueremes: 10, light_ships: 10 }, // ships field but type=land
}];
const r7 = checkNavalBlockade('r_port', 'rome');
ok('Land army does not blockade', r7.isBlockaded === false);

// ── Test 8: _processSupply - blockade penalty ─────────────────────────
console.log('\n--- Test 8: _processSupply gets -6 from blockade ---');
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
});
vm.runInContext(armiesSrc, armiesCtx);
const { _processSupply } = armiesCtx;

// Setup: coastal city owned by rome, enemy fleet >5 ships
GS.regions['r_blockaded_port'] = { terrain: 'coastal_city', name: 'Blockaded Port', nation: 'rome' };
GS.armies = [{
  id: 'enemy_fleet', nation: 'carthage', type: 'naval',
  position: 'r_blockaded_port', state: 'stationed',
  ships: { triremes: 6, quinqueremes: 0, light_ships: 0 }
}];
const testArmy = {
  id: 'roman_army', nation: 'rome', type: 'land',
  position: 'r_blockaded_port', state: 'stationed',
  units: { infantry: 1000, cavalry: 200, mercenaries: 0, artillery: 0 },
  morale: 80, discipline: 70, fatigue: 20, supply: 60,
  commander_id: null,
};
GS.armies.push(testArmy);

const supplyBefore = testArmy.supply;
_processSupply(testArmy);
// At home (rome owns region): delta = SUPPLY_HOME(12) - blockade_penalty(6) = +6
// So supply should go from 60 to 66
ok('Blockade penalty applied (supply = 66)', testArmy.supply === 66);

// ── Test 9: No blockade penalty when region is not coastal ───────────
console.log('\n--- Test 9: Inland army unaffected by naval fleet ---');
GS.regions['r_inland_plains'] = { terrain: 'plains', name: 'Inland Plains', nation: 'rome' };
GS.armies = [{
  id: 'enemy_fleet2', nation: 'carthage', type: 'naval',
  position: 'r_port', state: 'stationed',
  ships: { triremes: 6, quinqueremes: 2, light_ships: 2 }
}];
const armyInland = {
  id: 'inland_army', nation: 'rome', type: 'land',
  position: 'r_inland_plains', state: 'stationed',
  units: { infantry: 1000, cavalry: 0, mercenaries: 0, artillery: 0 },
  morale: 80, discipline: 70, fatigue: 20, supply: 60,
  commander_id: null,
};
GS.armies.push(armyInland);

_processSupply(armyInland);
// At home plains: delta = SUPPLY_HOME(12), no blockade penalty
ok('Inland army gets full supply gain (72)', armyInland.supply === 72);

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
  console, Math, Object, Array, JSON, Set, Map,
});
vm.runInContext(aiSrc, aiCtx);
const { _scoreNavalBlockade: scoreNaval } = aiCtx;

// Setup: rome fleet, enemy carthage has coastal capital
GS.nations['rome']     = { military: { at_war_with: ['carthage'] }, capital: 'r_rome' };
GS.nations['carthage'] = { military: { at_war_with: ['rome'] }, capital: 'r_carthage_port' };
GS.regions['r_rome']           = { terrain: 'plains', name: 'Rome', nation: 'rome', is_capital: true };
GS.regions['r_carthage_port']  = { terrain: 'coastal_city', name: 'Carthage', nation: 'carthage', is_capital: true };

const fleet = {
  id: 'roman_fleet', nation: 'rome', type: 'naval',
  position: 'r_rome',
  ships: { triremes: 8, quinqueremes: 3, light_ships: 2 },
  units: { infantry: 0, cavalry: 0, mercenaries: 0, artillery: 0 },
  morale: 80, discipline: 70, fatigue: 10, supply: 80,
  state: 'stationed', commander_id: null,
};
const capitals = new Set(['r_rome', 'r_carthage_port']);
const enemies  = ['carthage'];
const result = scoreNaval(fleet, enemies, capitals);
ok('scoreNavalBlockade returns candidate', result !== null);
ok('action = move',                       result?.action === 'move');
ok('target is enemy coastal capital',     result?.target_id === 'r_carthage_port');
ok('score >= 45',                         result?.score >= 45);
ok('reasoning includes naval_blockade',   result?.reasoning?.includes('naval_blockade'));

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n=== MIL_003 Tests: ${passed}/${passed+failed} passed ===`);
if (failed > 0) process.exit(1);
