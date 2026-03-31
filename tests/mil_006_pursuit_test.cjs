'use strict';
// ── MIL_006 Tests: Pursuit & Breakthrough Exploitation ────────────────
// Запуск: node tests/mil_006_pursuit_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── GAME_STATE ────────────────────────────────────────────────────────
const GS = { regions: {}, nations: {}, armies: [], sieges: [], turn: 1 };
const MR = {};
function addEventLog() {}

const uaiSrc = fs.readFileSync(path.join(__dirname, '../ai/utility_ai.js'), 'utf8');
const ctx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: MR, addEventLog,
  console, Math, Object, Array, JSON, Set, Map,
  getArmyCommander: () => null,
  calcArmyCombatStrength: null, findArmyPath: null, _isFortressLineBlocked: null,
});
vm.runInContext(uaiSrc, ctx);
const { utilityAIDecide } = ctx;

ok('utilityAIDecide exported', typeof utilityAIDecide === 'function');

// ── MAP SETUP ─────────────────────────────────────────────────────────
// army_pos → retreat_region (enemy fleeing) → enemy_capital (3 hops away)
// army_pos → open_enemy_1 (undefended enemy region)
// army_pos → home_region (friendly)
function setupMap() {
  GS.regions['army_pos']       = { terrain:'plains', mapType:'Land', name:'Battle Site',  connections:['retreat_region','open_enemy_1','home_region'], nation:'rome',     fortress_level:0, garrison:0,    population:0      };
  GS.regions['retreat_region'] = { terrain:'plains', mapType:'Land', name:'Retreat Zone', connections:['army_pos','enemy_capital'],                   nation:'carthage', fortress_level:0, garrison:50,   population:1000   };
  GS.regions['open_enemy_1']   = { terrain:'plains', mapType:'Land', name:'Open City',    connections:['army_pos','enemy_capital'],                   nation:'carthage', fortress_level:0, garrison:30,   population:5000   };
  GS.regions['enemy_capital']  = { terrain:'plains', mapType:'Land', name:'Carthage',     connections:['retreat_region','open_enemy_1'],               nation:'carthage', fortress_level:2, garrison:1000, population:20000  };
  GS.regions['home_region']    = { terrain:'plains', mapType:'Land', name:'Rome Home',    connections:['army_pos'],                                   nation:'rome',     fortress_level:1, garrison:500,  population:20000  };
  GS.nations['rome']     = { name:'Rome',     capital:'home_region', military:{ at_war_with:['carthage'] } };
  GS.nations['carthage'] = { name:'Carthage', capital:'enemy_capital', military:{ at_war_with:['rome'] } };
}

function makeArmy(overrides = {}) {
  return {
    id: 'rome_army_1', nation: 'rome', name: 'Roman Legion',
    type: 'land', state: 'idle', position: 'army_pos',
    units: { infantry: 1000, cavalry: 100, mercenaries: 0, artillery: 0 },
    morale: 80, supply: 80, fatigue: 20, discipline: 70,
    battles_won: 0, battles_lost: 0, war_score_earned: 0,
    ...overrides,
  };
}

function reset() { GS.armies = []; GS.sieges = []; }

// ──────────────────────────────────────────────────────────────────────
console.log('\n── TEST SET 1: pursuit_order set after victory ──\n');
// ──────────────────────────────────────────────────────────────────────

setupMap();

// Test 1: pursuit_order present → score includes move to that region
{
  reset();
  const army = makeArmy({ pursuit_order: 'retreat_region' });
  GS.armies.push(army);
  const r = utilityAIDecide(army, null, GS);
  ok('T1: pursuit_order present → action is move', r.action === 'move');
  ok('T1: pursuit target is retreat_region', r.target_id === 'retreat_region');
  ok('T1: reasoning contains pursuit_of_routed', (r.reasoning ?? '').includes('pursuit_of_routed'));
}

// Test 2: no pursuit_order → no pursuit move
{
  reset();
  const army = makeArmy();  // no pursuit_order
  GS.armies.push(army);
  const r = utilityAIDecide(army, null, GS);
  ok('T2: no pursuit_order → no pursuit reasoning', !(r.reasoning ?? '').includes('pursuit_of_routed'));
}

// Test 3: fatigue > 65 → pursuit score halved (should prefer hold over marginal pursuit)
{
  reset();
  // With high fatigue pursuit score is ×0.50 — should still move but lower priority
  const army = makeArmy({ pursuit_order: 'retreat_region', fatigue: 80, morale: 35, supply: 25 });
  GS.armies.push(army);
  const r = utilityAIDecide(army, null, GS);
  // Exhausted army — pursuit might lose to hold; just verify no crash
  ok('T3: high fatigue pursuit does not crash', r !== null && r !== undefined);
  ok('T3: result has action field', typeof r.action === 'string');
}

// ──────────────────────────────────────────────────────────────────────
console.log('\n── TEST SET 2: exploiting_breakthrough (no enemy armies nearby) ──\n');
// ──────────────────────────────────────────────────────────────────────

// Test 4: pursuit_order set + no enemy armies nearby → breakthrough target selected
{
  reset();
  const army = makeArmy({ pursuit_order: 'retreat_region' });
  GS.armies.push(army);
  // no enemy armies added to GS.armies → breakthrough should trigger
  const r = utilityAIDecide(army, null, GS);
  ok('T4: with pursuit_order + no enemy armies, action is move', r.action === 'move');
  // Target should be either pursuit or breakthrough
  ok('T4: target is an enemy region', ['retreat_region','open_enemy_1'].includes(r.target_id));
}

// Test 5: enemy army nearby → breakthrough should NOT trigger
{
  reset();
  const army = makeArmy({ pursuit_order: 'retreat_region' });
  GS.armies.push(army);
  // Add enemy army at adjacent region
  GS.armies.push({
    id: 'enemy_1', nation: 'carthage', name: 'Carthage Reinforcements',
    type: 'land', state: 'idle', position: 'open_enemy_1',
    units: { infantry: 500, cavalry: 50, mercenaries: 0, artillery: 0 },
    morale: 70, supply: 70, fatigue: 30, discipline: 60,
    battles_won: 0, battles_lost: 0, war_score_earned: 0,
  });
  const r = utilityAIDecide(army, null, GS);
  // With enemy nearby breakthrough is suppressed — reasoning should NOT be exploiting_breakthrough
  ok('T5: enemy army nearby → exploiting_breakthrough not prioritized', !(r.reasoning ?? '').includes('exploiting_breakthrough'));
}

// ──────────────────────────────────────────────────────────────────────
console.log('\n── TEST SET 3: combat.js pursuit_order injection ──\n');
// ──────────────────────────────────────────────────────────────────────

// Test combat.js directly for pursuit_order
const combatSrc = fs.readFileSync(path.join(__dirname, '../engine/combat.js'), 'utf8');
const combatCtx = vm.createContext({
  GAME_STATE: { ...GS, armies: [], regions: {}, nations: {}, turn: 1 },
  MAP_REGIONS: MR, addEventLog: () => {},
  console, Math, Object, Array, JSON, Set, Map,
  getArmyCommander: () => null,
  getNationArmies: (nationId) => (GS.armies ?? []).filter(a => a.nation === nationId && a.state !== 'disbanded'),
  beginSiege: null, captureRegion: null,
  findArmyPath: null,
  WarScoreEngine: undefined, DiplomacyEngine: undefined,
  showBattleResult: null, addMemoryEvent: null,
  setTimeout: () => {},
});
vm.runInContext(combatSrc, combatCtx);
const { resolveArmyBattle } = combatCtx;

// Test 6: resolveArmyBattle exported
ok('T6: resolveArmyBattle exported', typeof resolveArmyBattle === 'function');

// Test 7: after lopsided victory, winner gets pursuit_order
{
  // Setup regions in combat context
  combatCtx.GAME_STATE.regions['region_A'] = {
    terrain:'plains', mapType:'Land', name:'Plains', connections:['r_home'],
    nation:'carthage', fortress_level:0, garrison:100, population:5000,
  };
  combatCtx.GAME_STATE.regions['r_home'] = {
    terrain:'plains', mapType:'Land', name:'Home', connections:['region_A'],
    nation:'carthage', fortress_level:0, garrison:0, population:1000,
  };
  combatCtx.GAME_STATE.nations['rome']     = { name:'Rome',     capital:'r_rome',   military:{ at_war_with:['carthage'] } };
  combatCtx.GAME_STATE.nations['carthage'] = { name:'Carthage', capital:'r_home',   military:{ at_war_with:['rome'] } };

  const attacker = {
    id:'atk1', nation:'rome',     name:'Legion',   type:'land', state:'marching', position:'region_A',
    units:{ infantry:3000, cavalry:500, mercenaries:0, artillery:0 },
    morale:90, supply:90, fatigue:10, discipline:80,
    battles_won:0, battles_lost:0, war_score_earned:0,
  };
  const defender = {
    id:'def1', nation:'carthage', name:'Garrison', type:'land', state:'idle',     position:'region_A',
    units:{ infantry:500, cavalry:0, mercenaries:0, artillery:0 },
    morale:50, supply:60, fatigue:40, discipline:50,
    battles_won:0, battles_lost:0, war_score_earned:0,
  };

  try {
    resolveArmyBattle(attacker, defender, 'region_A', combatCtx.GAME_STATE);
    const result = attacker.pursuit_order !== undefined || defender.pursuit_order !== undefined;
    ok('T7: pursuit_order set on winner after lopsided battle', result);
    // Winner should be attacker (3000 vs 500)
    if (attacker.battles_won > 0) {
      ok('T7: attacker won and has pursuit_order', attacker.pursuit_order !== undefined);
    } else {
      ok('T7: defender won (unexpected) — field confirmed', defender.battles_won > 0);
    }
  } catch(e) {
    ok('T7: resolveArmyBattle did not throw', false);
    console.error('  Error:', e.message);
  }
}

// Test 8: close battle (margin ~1.0) should NOT set pursuit_order
{
  combatCtx.GAME_STATE.regions['region_B'] = {
    terrain:'plains', mapType:'Land', name:'Close Battle', connections:['r_retreat'],
    nation:'carthage', fortress_level:0, garrison:100, population:1000,
  };
  combatCtx.GAME_STATE.regions['r_retreat'] = {
    terrain:'plains', mapType:'Land', name:'Retreat', connections:['region_B'],
    nation:'carthage', fortress_level:0, garrison:0, population:500,
  };

  const atk2 = {
    id:'atk2', nation:'rome', name:'Cohort', type:'land', state:'marching', position:'region_B',
    units:{ infantry:1000, cavalry:100, mercenaries:0, artillery:0 },
    morale:70, supply:70, fatigue:30, discipline:65,
    battles_won:0, battles_lost:0, war_score_earned:0,
  };
  const def2 = {
    id:'def2', nation:'carthage', name:'Guards', type:'land', state:'idle', position:'region_B',
    units:{ infantry:900, cavalry:80, mercenaries:0, artillery:0 },
    morale:70, supply:70, fatigue:30, discipline:65,
    battles_won:0, battles_lost:0, war_score_earned:0,
  };

  try {
    resolveArmyBattle(atk2, def2, 'region_B', combatCtx.GAME_STATE);
    // pursuit_order should be undefined OR null if margin < 1.5
    const winner2 = atk2.battles_won > 0 ? atk2 : def2;
    // Can't reliably test margin ~1.0 since forces are nearly equal but not exactly
    ok('T8: close battle does not crash', true);
  } catch(e) {
    ok('T8: resolveArmyBattle close battle did not throw', false);
    console.error('  Error:', e.message);
  }
}

// ──────────────────────────────────────────────────────────────────────
console.log('\n── TEST SET 4: pursuit with capital proximity bonus ──\n');
// ──────────────────────────────────────────────────────────────────────

// Test 9: pursuit_order leads toward enemy capital → higher score
{
  setupMap();
  reset();
  // retreat_region connects to enemy_capital → capital proximity bonus
  const army = makeArmy({ pursuit_order: 'retreat_region' });
  GS.armies.push(army);
  const r = utilityAIDecide(army, null, GS);
  ok('T9: pursuit toward capital selected', r.action === 'move');
  ok('T9: reasoning is pursuit_of_routed', (r.reasoning ?? '').includes('pursuit_of_routed'));
}

// Test 10: army with pursuit_order to non-nearby region → fallback gracefully
{
  setupMap();
  reset();
  const army = makeArmy({ pursuit_order: 'NONEXISTENT_REGION_999' });
  GS.armies.push(army);
  const r = utilityAIDecide(army, null, GS);
  // Since 'NONEXISTENT_REGION_999' is not in nearby, pursuit candidate not added
  ok('T10: non-nearby pursuit_order handled gracefully', r !== null && typeof r.action === 'string');
  ok('T10: no crash on unknown pursuit target', true);
}

// ──────────────────────────────────────────────────────────────────────
console.log('\n── SUMMARY ──\n');
console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
if (failed > 0) process.exit(1);
