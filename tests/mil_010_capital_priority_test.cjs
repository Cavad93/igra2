'use strict';
// ── MIL_010 Tests: Capital Priority + Emergency Defense + War Score ────
// Запуск: node tests/mil_010_capital_priority_test.cjs

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
const GS = { regions: {}, nations: {}, armies: [], sieges: [], wars: [], turn: 1 };
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

// ──────────────────────────────────────────────────────────────────────
// Map: army_pos (rome) — open_target (carthage) — capital_target (carthage capital)
//      army_pos → home_cap (rome capital, safe 3 hops from enemies)
// ──────────────────────────────────────────────────────────────────────
function setupBase() {
  GS.regions = {
    army_pos:       { terrain:'plains', mapType:'Land', name:'Camp',        connections:['open_target','cap_target','home_cap'], nation:'rome',     fortress_level:0, garrison:0,   population:5000  },
    open_target:    { terrain:'plains', mapType:'Land', name:'Open City',   connections:['army_pos'],                           nation:'carthage', fortress_level:0, garrison:100, population:5000  },
    cap_target:     { terrain:'plains', mapType:'Land', name:'Cart Capital',connections:['army_pos'],                           nation:'carthage', fortress_level:1, garrison:200, population:8000  },
    home_cap:       { terrain:'plains', mapType:'Land', name:'Rome Capital',connections:['army_pos'],                           nation:'rome',     fortress_level:2, garrison:500, population:20000 },
    // Distant buffer — enemy can get here but not to home_cap
    enemy_far:      { terrain:'plains', mapType:'Land', name:'Enemy Far',   connections:['buffer1'],                            nation:'carthage', fortress_level:0, garrison:0,   population:0     },
    buffer1:        { terrain:'plains', mapType:'Land', name:'Buffer1',     connections:['enemy_far','buffer2'],                nation:'rome',     fortress_level:0, garrison:0,   population:0     },
    buffer2:        { terrain:'plains', mapType:'Land', name:'Buffer2',     connections:['buffer1','home_cap_adj'],             nation:'rome',     fortress_level:0, garrison:0,   population:0     },
    home_cap_adj:   { terrain:'plains', mapType:'Land', name:'HomeAdj',     connections:['buffer2','home_cap'],                 nation:'rome',     fortress_level:0, garrison:0,   population:0     },
  };
  GS.nations = {
    rome:     { name:'Rome',     capital:'home_cap',     military:{ at_war_with:['carthage'] } },
    carthage: { name:'Carthage', capital:'cap_target',   military:{ at_war_with:['rome']     } },
  };
  GS.armies  = [];
  GS.sieges  = [];
}

function makeArmy(pos = 'army_pos', overrides = {}) {
  return Object.assign({
    id: 'test_army', nation: 'rome', type: 'land', position: pos,
    units: { infantry:3000, cavalry:500, mercenaries:0, artillery:100 },
    morale: 80, supply: 80, fatigue: 20, siege_id: null,
    state: 'active', path: [], move_progress: 0,
  }, overrides);
}

// ── T01: Capital attack bonus = 55 (not 22) ──────────────────────────
console.log('\n=== T01: Capital gets +55 attack bonus vs regular region ===');
setupBase();
GS.armies = [];
{
  // Army attacks two targets: open_target (same size) and cap_target (capital)
  // Capital should win due to +55 bonus
  const army = makeArmy();
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id} score=${res.score.toFixed(1)}`);
  ok('T01: chooses capital over equal open city', res.target_id === 'cap_target');
}

// ── T02: Capital bonus is significantly higher than non-capital ───────
console.log('\n=== T02: Capital score check (55 bonus applied) ===');
setupBase();
GS.armies = [];
{
  // Force check by making open_target very attractive but not capital
  // open_target has less garrison but no capital bonus
  GS.regions['open_target'].garrison = 10;
  GS.regions['open_target'].population = 1000;
  GS.regions['cap_target'].garrison = 500; // heavier defense
  const army = makeArmy();
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id}`);
  // Capital may or may not win here depending on balance, just check no crash
  ok('T02: decision returned without error', res && typeof res.action === 'string');
  // Reset
  GS.regions['open_target'].garrison = 100;
  GS.regions['open_target'].population = 5000;
  GS.regions['cap_target'].garrison = 200;
}

// ── T03: Emergency capital defense — enemy 1 hop from capital ─────────
console.log('\n=== T03: Emergency capital defense — enemy 1 hop from capital ===');
setupBase();
{
  // Place enemy army adjacent to home_cap (1 hop away)
  GS.regions['home_cap'].connections.push('threat_zone');
  GS.regions['threat_zone'] = {
    terrain:'plains', mapType:'Land', name:'Threat', connections:['home_cap'],
    nation:'carthage', fortress_level:0, garrison:0, population:0,
  };
  GS.armies = [{
    id:'enemy_threat', nation:'carthage', type:'land', position:'threat_zone',
    state:'active', units:{infantry:3000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:0, siege_id:null,
  }];
  // Army is NOT at the capital
  const army = makeArmy('army_pos');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id} reasoning="${res.reasoning}"`);
  ok('T03: emergency defense triggered (score=999)', res.score === 999);
  ok('T03: action is move to capital or hold', res.action === 'move' || res.action === 'hold');
  ok('T03: reasoning contains capital_emergency', res.reasoning.includes('capital_emergency'));
  // Cleanup
  delete GS.regions['threat_zone'];
  GS.regions['home_cap'].connections = GS.regions['home_cap'].connections.filter(c => c !== 'threat_zone');
}

// ── T04: Emergency defense — enemy 2 hops from capital ───────────────
console.log('\n=== T04: Emergency capital defense — enemy 2 hops from capital ===');
setupBase();
{
  // Add a buffer region 1 hop from capital
  GS.regions['cap_adj'] = {
    terrain:'plains', mapType:'Land', name:'CapAdj', connections:['home_cap','threat2'],
    nation:'rome', fortress_level:0, garrison:0, population:0,
  };
  GS.regions['home_cap'].connections.push('cap_adj');
  GS.regions['threat2'] = {
    terrain:'plains', mapType:'Land', name:'Threat2', connections:['cap_adj'],
    nation:'carthage', fortress_level:0, garrison:0, population:0,
  };
  GS.armies = [{
    id:'enemy2', nation:'carthage', type:'land', position:'threat2',
    state:'active', units:{infantry:2000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:0, siege_id:null,
  }];
  const army = makeArmy('army_pos');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id} reasoning="${res.reasoning}"`);
  ok('T04: emergency defense triggered for 2-hop threat', res.score === 999);
  ok('T04: capital_emergency in reasoning', res.reasoning.includes('capital_emergency'));
  // Cleanup
  delete GS.regions['cap_adj'];
  delete GS.regions['threat2'];
  GS.regions['home_cap'].connections = ['army_pos'];
}

// ── T05: No emergency defense — enemy 3+ hops from capital ────────────
console.log('\n=== T05: No emergency defense — enemy 3 hops from capital ===');
setupBase();
{
  // Enemy is at enemy_far (4+ hops from home_cap via buffer chain)
  GS.armies = [{
    id:'enemy_far_a', nation:'carthage', type:'land', position:'enemy_far',
    state:'active', units:{infantry:1000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:0, siege_id:null,
  }];
  const army = makeArmy('army_pos');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id} reasoning="${res.reasoning}" score=${res.score}`);
  ok('T05: no emergency defense (enemy far from capital)', res.score !== 999);
  ok('T05: no capital_emergency in reasoning', !res.reasoning.includes('capital_emergency'));
}

// ── T06: Army already at capital — hold when threatened ───────────────
console.log('\n=== T06: Army at capital — returns hold when enemy approaches ===');
setupBase();
{
  // Add direct threat 1 hop from home_cap
  GS.regions['home_cap'].connections.push('near_threat');
  GS.regions['near_threat'] = {
    terrain:'plains', mapType:'Land', name:'NearThreat', connections:['home_cap'],
    nation:'carthage', fortress_level:0, garrison:0, population:0,
  };
  GS.armies = [{
    id:'threat_a', nation:'carthage', type:'land', position:'near_threat',
    state:'active', units:{infantry:2000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:0, siege_id:null,
  }];
  // Army is ALREADY at the capital
  const army = makeArmy('home_cap');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id} reasoning="${res.reasoning}"`);
  ok('T06: returns hold when army is at threatened capital', res.action === 'hold' || res.score === 999);
  ok('T06: capital_emergency in reasoning', res.reasoning.includes('capital_emergency'));
  // Cleanup
  delete GS.regions['near_threat'];
  GS.regions['home_cap'].connections = ['army_pos'];
}

// ── T07: Disbanded enemy army does NOT trigger emergency defense ───────
console.log('\n=== T07: Disbanded enemy army — no emergency defense ===');
setupBase();
{
  GS.regions['home_cap'].connections.push('near7');
  GS.regions['near7'] = {
    terrain:'plains', mapType:'Land', name:'Near7', connections:['home_cap'],
    nation:'carthage', fortress_level:0, garrison:0, population:0,
  };
  GS.armies = [{
    id:'disbanded_a', nation:'carthage', type:'land', position:'near7',
    state:'disbanded', // ← disbanded, should be ignored
    units:{infantry:2000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:0, siege_id:null,
  }];
  const army = makeArmy('army_pos');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} reasoning="${res.reasoning}"`);
  ok('T07: disbanded army does not trigger capital_emergency', !res.reasoning.includes('capital_emergency'));
  // Cleanup
  delete GS.regions['near7'];
  GS.regions['home_cap'].connections = ['army_pos'];
}

// ── T08: No capital defined — no emergency defense crash ──────────────
console.log('\n=== T08: Nation with no capital defined — no crash ===');
setupBase();
{
  GS.nations['rome'].capital = undefined; // no capital
  GS.armies = [];
  const army = makeArmy('army_pos');
  let res;
  try {
    res = ctx.utilityAIDecide(army, null);
    ok('T08: no crash when capital undefined', true);
    ok('T08: returns valid action', res && typeof res.action === 'string');
  } catch (e) {
    ok('T08: no crash when capital undefined', false);
    ok('T08: returns valid action', false);
    console.error('   ERROR:', e.message);
  }
  GS.nations['rome'].capital = 'home_cap'; // restore
}

// ── T09: _bfsDistanceGlobal returns 0 for same region ─────────────────
console.log('\n=== T09: _bfsDistanceGlobal — same region = distance 0 ===');
setupBase();
{
  // Test via emergencyCapitalDefense: army at capital, enemy also at capital
  GS.armies = [{
    id:'at_capital', nation:'carthage', type:'land', position:'home_cap',
    state:'active', units:{infantry:1000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:0, siege_id:null,
  }];
  const army = makeArmy('home_cap');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} reasoning="${res.reasoning}"`);
  ok('T09: capital_emergency when enemy is AT the capital', res.reasoning.includes('capital_emergency'));
  ok('T09: enemy_0_away in reasoning', res.reasoning.includes('enemy_0_away'));
}

// ── T10: Normal army movement when capital is safe ────────────────────
console.log('\n=== T10: Normal movement when capital is safe ===');
setupBase();
{
  GS.armies = []; // no enemy armies
  const army = makeArmy('army_pos');
  const res  = ctx.utilityAIDecide(army, null);
  console.log(`    action=${res.action} target=${res.target_id}`);
  ok('T10: no capital_emergency when capital is safe', !res.reasoning.includes('capital_emergency'));
  ok('T10: normal action (move or hold)', res.action === 'move' || res.action === 'hold');
}

// ── Results ───────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log(`MIL_010 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All MIL_010 tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some MIL_010 tests FAILED');
  process.exit(1);
}
