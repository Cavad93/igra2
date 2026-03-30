'use strict';
// ── MIL_004 Tests: Supply-Aware Path Finding ──────────────────────────
// Запуск: node tests/mil_004_supply_path_test.cjs

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

// ── Load armies.js ────────────────────────────────────────────────────
const armiesSrc = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');
const armiesCtx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: MR, addEventLog,
  console, Math, Object, Array, JSON, Set, Map,
  captureRegion: () => {},
  addEventLog,
  getArmyCommander: () => null,
  updateArmyLogisticTimer: null,
  calcLogisticPenalty: null,
  checkNavalBlockade: null,
  _isFriendlyTerritory: () => false,
});
vm.runInContext(armiesSrc, armiesCtx);
const { findArmyPath } = armiesCtx;

ok('findArmyPath exported', typeof findArmyPath === 'function');

// ── Build a test map ──────────────────────────────────────────────────
// plains → plains → mountains → mountains → mountains → plains (target)
// AND an alternative: plains → plains → plains → target
//   r_start → r1_plain → r_mountain1 → r_mountain2 → r_mountain3 → r_target
//           ↓
//          r2_plain → r3_plain → r_target

GS.regions['r_start']    = { terrain: 'plains',    mapType: 'Land', name: 'Start',     connections: ['r1_plain', 'r2_plain'] };
GS.regions['r1_plain']   = { terrain: 'plains',    mapType: 'Land', name: 'Plain1',    connections: ['r_start', 'r_mountain1'] };
GS.regions['r_mountain1']= { terrain: 'mountains', mapType: 'Land', name: 'Mt1',       connections: ['r1_plain', 'r_mountain2'] };
GS.regions['r_mountain2']= { terrain: 'mountains', mapType: 'Land', name: 'Mt2',       connections: ['r_mountain1', 'r_mountain3'] };
GS.regions['r_mountain3']= { terrain: 'mountains', mapType: 'Land', name: 'Mt3',       connections: ['r_mountain2', 'r_target'] };
GS.regions['r2_plain']   = { terrain: 'plains',    mapType: 'Land', name: 'Plain2',    connections: ['r_start', 'r3_plain'] };
GS.regions['r3_plain']   = { terrain: 'plains',    mapType: 'Land', name: 'Plain3',    connections: ['r2_plain', 'r_target'] };
GS.regions['r_target']   = { terrain: 'plains',    mapType: 'Land', name: 'Target',    connections: ['r_mountain3', 'r3_plain'] };

// ── Test 1: BFS (no checkSupply) returns shortest hop count ──────────
console.log('\n--- Test 1: BFS shortest path (no supply check) ---');
const bfsPath = findArmyPath('r_start', 'r_target', 'land', null, false);
ok('BFS returns a path',           Array.isArray(bfsPath));
ok('BFS path starts at r_start',   bfsPath?.[0] === 'r_start');
ok('BFS path ends at r_target',    bfsPath?.[bfsPath.length - 1] === 'r_target');
// BFS finds shortest hop route: plains detour is 4 nodes (start→r2_plain→r3_plain→target)
// mountain route is 6 nodes — BFS picks the 4-node plains route
ok('BFS path length <= 6',         bfsPath?.length <= 6 && bfsPath?.length >= 4);

// ── Test 2: Supply-aware Dijkstra avoids mountains ────────────────────
console.log('\n--- Test 2: Supply-aware path avoids mountains ---');
const supplyPath = findArmyPath('r_start', 'r_target', 'land', null, true);
ok('Supply path returns a path',         Array.isArray(supplyPath));
ok('Supply path starts at r_start',      supplyPath?.[0] === 'r_start');
ok('Supply path ends at r_target',       supplyPath?.[supplyPath.length - 1] === 'r_target');
// Supply-aware Dijkstra should prefer the plains route (cost 4×1.0=4.0)
// over mountain route (2×1.0 + 3×1.8 = 7.4)
const hasMountain = supplyPath?.some(id => GS.regions[id]?.terrain === 'mountains');
ok('Supply path avoids mountains',       !hasMountain);
ok('Supply path uses plains route (4)',  supplyPath?.length === 4);
const plainRoute = ['r_start', 'r2_plain', 'r3_plain', 'r_target'];
const usesPlainRoute = plainRoute.every(id => supplyPath?.includes(id));
ok('Supply path uses the plains detour', usesPlainRoute);

// ── Test 3: fromId === toId returns single-element array ──────────────
console.log('\n--- Test 3: Same source and target ---');
const samePath = findArmyPath('r_start', 'r_start', 'land', null, true);
ok('Same src=dst returns [r_start]', JSON.stringify(samePath) === JSON.stringify(['r_start']));

// ── Test 4: No path available (disconnected) ──────────────────────────
console.log('\n--- Test 4: No path available ---');
GS.regions['isolated'] = { terrain: 'plains', mapType: 'Land', name: 'Isolated', connections: [] };
const noPath = findArmyPath('r_start', 'isolated', 'land', null, true);
ok('Returns null when no path',  noPath === null);

// ── Test 5: Naval type ignores land regions ───────────────────────────
console.log('\n--- Test 5: Naval path ignores land ---');
GS.regions['sea_a'] = { terrain: 'ocean', mapType: 'Ocean', name: 'Sea A', connections: ['sea_b'] };
GS.regions['sea_b'] = { terrain: 'ocean', mapType: 'Ocean', name: 'Sea B', connections: ['sea_a'] };
const navalPath = findArmyPath('sea_a', 'sea_b', 'naval', null, true);
ok('Naval path finds sea route', Array.isArray(navalPath) && navalPath.includes('sea_b'));
const navalLand = findArmyPath('sea_a', 'r_target', 'naval', null, true);
ok('Naval cannot cross land',    navalLand === null);

// ── Test 6: checkSupply=false BFS identical behaviour ─────────────────
console.log('\n--- Test 6: BFS (false) vs default behaviour ---');
const defaultPath = findArmyPath('r_start', 'r_target');
const bfsExplicit = findArmyPath('r_start', 'r_target', 'land', null, false);
ok('Default = checkSupply false', JSON.stringify(defaultPath) === JSON.stringify(bfsExplicit));

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════`);
console.log(`MIL_004 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
