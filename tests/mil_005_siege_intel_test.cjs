'use strict';
// ── MIL_005 Tests: Siege Intelligence (Relief Army + Storm Timing) ────
// Запуск: node tests/mil_005_siege_intel_test.cjs

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

// ──────────────────────────────────────────────────────────────────────
// MAP A: siege-only map (no easy enemy attack targets nearby)
//   army_pos (rome) → r_near (rome) → siege_region (carthage, mt fortress)
//                   → home_region (rome)
// ──────────────────────────────────────────────────────────────────────
function setupMapA() {
  GS.regions['army_pos']     = { terrain:'plains',    mapType:'Land', name:'Camp',      connections:['r_near','home_region'], nation:'rome',     fortress_level:0, garrison:0,    population:0     };
  GS.regions['r_near']       = { terrain:'plains',    mapType:'Land', name:'Near',      connections:['army_pos','siege_region'], nation:'rome',   fortress_level:0, garrison:0,    population:0     };
  GS.regions['siege_region'] = { terrain:'mountains', mapType:'Land', name:'Fort Ct',   connections:['r_near'], nation:'carthage',  fortress_level:3, garrison:2000, population:1000  };
  GS.regions['home_region']  = { terrain:'plains',    mapType:'Land', name:'Roman Home',connections:['army_pos'], nation:'rome',   fortress_level:1, garrison:500,  population:20000 };
  // MIL_010: use non-adjacent capitals so capital_emergency doesn't override siege tests
  GS.nations['rome']     = { name:'Rome',     capital:'distant_rome_cap', military:{ at_war_with:['carthage'] } };
  GS.nations['carthage'] = { name:'Carthage', capital:'distant_cap',      military:{ at_war_with:['rome']     } };
}

// ──────────────────────────────────────────────────────────────────────
// MAP B: relief army map (siege_region + r_relief + r_far for enemy armies)
//   army_pos → r_near → siege_region (2 hops)
//   r_near → r_relief → r_far  (carthage territory)
// ──────────────────────────────────────────────────────────────────────
function setupMapB() {
  setupMapA();
  GS.regions['r_near'].connections = ['army_pos','siege_region','r_relief'];
  GS.regions['r_relief'] = { terrain:'plains', mapType:'Land', name:'Relief Pt', connections:['r_near','r_far'], nation:'carthage', fortress_level:0, garrison:50, population:500 };
  GS.regions['r_far']    = { terrain:'plains', mapType:'Land', name:'Far',       connections:['r_relief'],       nation:'carthage', fortress_level:0, garrison:50, population:500 };
}

function reset() { GS.armies = []; GS.sieges = []; }

const makeArmy = (o) => Object.assign({
  id:'army1', nation:'rome', position:'army_pos', type:'land', state:'active',
  units:{ infantry:3000, cavalry:0, mercenaries:0, artillery:300 },
  morale:80, supply:70, fatigue:20, siege_id:'siege_1', march_target:null,
}, o);

const makeSiege = (o) => Object.assign({
  id:'siege_1', region_id:'siege_region', region_name:'Fort Ct',
  progress:60, storm_possible:true, garrison:800, garrison_morale:60, garrison_supply:50,
}, o);

// ── Test 1: No relief army, storm_possible → storm or siege wins ───────
console.log('\n--- Test 1: No relief army → storm or siege chosen ---');
setupMapA(); reset();
GS.armies = [makeArmy()];
GS.sieges = [makeSiege()];
const res1 = utilityAIDecide(makeArmy(), null);
ok('Decision returned', !!res1);
ok('Chooses storm or siege', res1.action === 'storm' || res1.action === 'siege');
ok('No relief in reasoning', !res1.reasoning.includes('relief_incoming'));

// ── Test 2: Relief army 1 hop from siege → storm ×1.6, storm wins ─────
console.log('\n--- Test 2: Relief army 1 hop from siege → storm boosted ×1.6 ---');
setupMapB(); reset();
// r_near is 1 hop from siege_region → reliefArmy at r_near → turnsAway=1
const reliefNear = {
  id:'rel1', nation:'carthage', position:'r_near', state:'active', type:'land',
  units:{ infantry:1500, cavalry:0, mercenaries:0, artillery:0 },
  morale:70, supply:70, fatigue:10, siege_id:null,
};
GS.armies = [makeArmy(), reliefNear];
GS.sieges = [makeSiege({ storm_possible:true, progress:65 })];
const res2 = utilityAIDecide(makeArmy(), null);
ok('Decision returned with relief', !!res2);
ok('Chooses storm (relief incoming ≤2 turns)', res2.action === 'storm');
ok('Storm reasoning mentions relief', res2.reasoning.includes('relief_incoming_in'));

// ── Test 3: Starving garrison → siege score ×1.3, siege chosen ────────
console.log('\n--- Test 3: Starving garrison (supply<20) boosts siege score ---');
setupMapA(); reset();
// No storm possible (progress low), garrison starving
GS.sieges = [makeSiege({ storm_possible:false, progress:25, garrison_supply:10 })];
const bigArmy = makeArmy({ units:{ infantry:5000, cavalry:0, mercenaries:0, artillery:500 } });
GS.armies = [bigArmy];
const res3 = utilityAIDecide(bigArmy, null);
ok('Decision returned for starving siege', !!res3);
ok('Chooses siege for starving garrison', res3.action === 'siege');
ok('Starving garrison in reasoning', res3.reasoning.includes('starving_garrison'));

// ── Test 4: Overwhelming relief army → retreat candidate present ───────
console.log('\n--- Test 4: Overwhelmingly strong relief army → retreat option ---');
setupMapB(); reset();
const strongRelief = {
  id:'rel2', nation:'carthage', position:'r_near', state:'active', type:'land',
  units:{ infantry:20000, cavalry:5000, mercenaries:0, artillery:0 },
  morale:90, supply:90, fatigue:5, siege_id:null,
};
const weakArmy = makeArmy({
  units:{ infantry:300, cavalry:0, mercenaries:0, artillery:0 },
  morale:50, supply:40, fatigue:50,
});
GS.armies = [weakArmy, strongRelief];
GS.sieges = [makeSiege({ storm_possible:true, progress:60 })];
const res4 = utilityAIDecide(weakArmy, null);
ok('Decision returned for strong relief threat', !!res4);
// Weak army vs strong relief → relief detected → reasoning or retreat
const reliefOk4 = res4.action === 'retreat' || res4.reasoning.includes('relief_incoming_in');
ok('Retreat or relief info present', reliefOk4);

// ── Test 5: Relief army 3 hops from siege → turnsAway=3, no storm×1.6 ─
console.log('\n--- Test 5: Relief army 3 hops away → no storm boost ---');
setupMapB(); reset();
// r_far is 3 hops from siege_region: siege→r_near→r_relief→r_far
const distRelief = {
  id:'rel3', nation:'carthage', position:'r_far', state:'active', type:'land',
  units:{ infantry:2000, cavalry:0, mercenaries:0, artillery:0 },
  morale:70, supply:70, fatigue:10, siege_id:null,
};
GS.armies = [makeArmy(), distRelief];
GS.sieges = [makeSiege({ storm_possible:true, progress:60 })];
const res5 = utilityAIDecide(makeArmy(), null);
ok('Decision returned for 3-hop relief', !!res5);
if (res5.action === 'storm') {
  // turnsAway=3 > 2 → no ×1.6 boost → storm reasoning must NOT contain relief_incoming_in
  ok('No immediate relief boost on storm (3 hops)', !res5.reasoning.includes('relief_incoming_in'));
} else {
  ok('Non-storm action valid (distant relief)', ['siege','hold','move','retreat'].includes(res5.action));
}

// ── Test 6: No active siege → no relief logic ─────────────────────────
console.log('\n--- Test 6: No active siege → no relief logic ---');
setupMapA(); reset();
const armyNoSiege = makeArmy({ siege_id:null });
GS.armies = [armyNoSiege]; GS.sieges = [];
const res6 = utilityAIDecide(armyNoSiege, null);
ok('Decision returned without siege', !!res6);
ok('No siege → no relief reasoning', !res6.reasoning.includes('relief_incoming'));
ok('No siege → no starving_garrison', !res6.reasoning.includes('starving_garrison'));

// ── Test 7: Regression — MIL_002 formation still applied ──────────────
console.log('\n--- Test 7: Regression — MIL_002 formation still set ---');
setupMapA(); reset();
const armyFmt = makeArmy({ siege_id:null });
GS.armies = [armyFmt]; GS.sieges = [];
utilityAIDecide(armyFmt, null);
ok('Formation is set', typeof armyFmt.formation === 'string');
ok('Formation is valid value',
  ['standard','defensive','flanking','siege','aggressive'].includes(armyFmt.formation));

// ── Test 8: garrison_supply=19 → exactly below threshold → starving ───
console.log('\n--- Test 8: garrison_supply=19 → starving_garrison ---');
setupMapA(); reset();
GS.sieges = [makeSiege({ storm_possible:false, progress:25, garrison_supply:19 })];
const strongA2 = makeArmy({ units:{ infantry:5000, cavalry:0, mercenaries:0, artillery:500 } });
GS.armies = [strongA2];
const res8 = utilityAIDecide(strongA2, null);
ok('garrison_supply=19 → starving_garrison in reasoning', res8.reasoning.includes('starving_garrison'));

// ── Test 9: garrison_supply=20 → at threshold → NOT starving ──────────
console.log('\n--- Test 9: garrison_supply=20 → no starving_garrison ---');
setupMapA(); reset();
GS.sieges = [makeSiege({ storm_possible:false, progress:25, garrison_supply:20 })];
const strongA3 = makeArmy({ units:{ infantry:5000, cavalry:0, mercenaries:0, artillery:500 } });
GS.armies = [strongA3];
const res9 = utilityAIDecide(strongA3, null);
ok('garrison_supply=20 → no starving_garrison', !res9.reasoning.includes('starving_garrison'));

// ── Test 10: Disbanded relief army is ignored ─────────────────────────
console.log('\n--- Test 10: Disbanded relief army is ignored ---');
setupMapA(); reset();
const disbanded = {
  id:'rel4', nation:'carthage', position:'r_near', state:'disbanded', type:'land',
  units:{ infantry:5000, cavalry:0, mercenaries:0, artillery:0 },
  morale:80, supply:80, fatigue:5, siege_id:null,
};
GS.armies = [makeArmy(), disbanded];
GS.sieges = [makeSiege({ storm_possible:true, progress:60 })];
const res10 = utilityAIDecide(makeArmy(), null);
ok('Disbanded army → storm or siege still chosen', res10.action === 'storm' || res10.action === 'siege');
ok('No relief boost from disbanded army', !res10.reasoning.includes('relief_incoming_in'));

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════`);
console.log(`MIL_005 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
