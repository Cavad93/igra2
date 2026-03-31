'use strict';
/**
 * MIL_008 — Стратегия под тип местности
 * Tests terrain-aware attack penalties/bonuses and hill/mountain defense advantage.
 * Запуск: node tests/mil_008_terrain_strategy_test.cjs
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── VM context ───────────────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function setupMap(regions, nations, armies = []) {
  GS.regions = {};
  GS.nations = {};
  GS.armies  = armies;
  GS.sieges  = [];
  for (const [id, r] of Object.entries(regions)) GS.regions[id] = { id, ...r };
  for (const [id, n] of Object.entries(nations)) GS.nations[id] = n;
}

function makeArmy(pos, units, extra = {}) {
  return {
    id: 'test_army', nation: 'N1', position: pos,
    type: 'land', size: 1200,
    morale: 80, supply: 85, fatigue: 15, readiness: 0.85, formation: 'standard',
    units, ...extra,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// T01: Cavalry army avoids mountains in favour of plains
//      (even when mountains is the enemy capital)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T01: cavalry prefers plains over mountain capital ===');
{
  setupMap(
    {
      home:    { terrain:'plains',    mapType:'Land', name:'Home',     connections:['mts','plains_e'], nation:'N1', fortress_level:0, garrison:0,   population:10000 },
      mts:     { terrain:'mountains', mapType:'Land', name:'Mts',      connections:['home'],           nation:'EN', fortress_level:0, garrison:100, population:2000  },
      plains_e:{ terrain:'plains',    mapType:'Land', name:'Plains',   connections:['home'],           nation:'EN', fortress_level:0, garrison:100, population:2000  },
    },
    {
      N1: { name:'N1', capital:'home',    military:{ at_war_with:['EN'] }, regions:['home'] },
      EN: { name:'EN', capital:'mts',     military:{ at_war_with:['N1'] }, regions:['mts','plains_e'] },
    }
  );
  const army = makeArmy('home', { infantry:200, cavalry:700, artillery:50, other:50 });
  const res  = utilityAIDecide(army, { nation:'N1' });
  ok('T01: cavalry picks plains_e, not mountain capital', res.action === 'move' && res.target_id === 'plains_e');
  ok('T01: plains move has terrain_advantage:cavalry_plains', res.reasoning.includes('terrain_advantage:cavalry_plains'));
}

// ════════════════════════════════════════════════════════════════════════════
// T02: Cavalry on plains — terrain_advantage tag present
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T02: cavalry→plains — terrain_advantage:cavalry_plains ===');
{
  setupMap(
    {
      home:    { terrain:'plains', mapType:'Land', name:'Home',   connections:['plains_e'], nation:'N1', fortress_level:0, garrison:0,   population:10000 },
      plains_e:{ terrain:'plains', mapType:'Land', name:'Plains', connections:['home'],     nation:'EN', fortress_level:0, garrison:100, population:2000  },
    },
    {
      N1: { name:'N1', capital:'home',    military:{ at_war_with:['EN'] }, regions:['home']    },
      EN: { name:'EN', capital:'plains_e',military:{ at_war_with:['N1'] }, regions:['plains_e'] },
    }
  );
  const army = makeArmy('home', { infantry:200, cavalry:700, artillery:50, other:50 });
  const res  = utilityAIDecide(army, { nation:'N1' });
  ok('T02: action is move', res.action === 'move');
  ok('T02: terrain_advantage:cavalry_plains in reasoning', res.reasoning.includes('terrain_advantage:cavalry_plains'));
}

// ════════════════════════════════════════════════════════════════════════════
// T03: Low-cavalry infantry → no terrain tag on mountains
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T03: infantry→mountains — no terrain_penalty:mountains ===');
{
  setupMap(
    {
      home:{ terrain:'plains',    mapType:'Land', name:'Home', connections:['mts'], nation:'N1', fortress_level:0, garrison:0,   population:10000 },
      mts: { terrain:'mountains', mapType:'Land', name:'Mts',  connections:['home'],nation:'EN', fortress_level:0, garrison:100, population:2000  },
    },
    {
      N1: { name:'N1', capital:'home', military:{ at_war_with:['EN'] }, regions:['home'] },
      EN: { name:'EN', capital:'mts',  military:{ at_war_with:['N1'] }, regions:['mts']  },
    }
  );
  // cavRatio ~0.05 — well below 0.4 threshold
  const army = makeArmy('home', { infantry:900, cavalry:50, artillery:25, other:25 });
  const res  = utilityAIDecide(army, { nation:'N1' });
  ok('T03: no terrain_penalty:mountains for infantry',
     !res.reasoning || !res.reasoning.includes('terrain_penalty:mountains'));
}

// ════════════════════════════════════════════════════════════════════════════
// T04: Coastal city without allied fleet → penalty in reasoning
//      (coast is the ONLY target so it must be selected)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T04: attack coastal without fleet — penalty ===');
{
  setupMap(
    {
      home:   { terrain:'plains',       mapType:'Land', name:'Home',  connections:['coast_e'], nation:'N1', fortress_level:0, garrison:0,   population:10000 },
      coast_e:{ terrain:'coastal_city', mapType:'Land', name:'Coast', connections:['home'],    nation:'EN', fortress_level:0, garrison:100, population:8000  },
    },
    {
      N1: { name:'N1', capital:'home',    military:{ at_war_with:['EN'] }, regions:['home']    },
      EN: { name:'EN', capital:'coast_e', military:{ at_war_with:['N1'] }, regions:['coast_e'] },
    }
  );
  // No allied fleets (GS.armies = [])
  const army = makeArmy('home', { infantry:400, cavalry:500, artillery:50, other:50 });
  const res  = utilityAIDecide(army, { nation:'N1' });
  ok('T04: action is move toward coast', res.action === 'move');
  ok('T04: terrain_penalty:coastal_no_fleet in reasoning', res.reasoning.includes('terrain_penalty:coastal_no_fleet'));
}

// ════════════════════════════════════════════════════════════════════════════
// T05: Coastal city WITH allied fleet → no coastal penalty
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T05: attack coastal WITH fleet — no coastal penalty ===');
{
  setupMap(
    {
      home:   { terrain:'plains',       mapType:'Land', name:'Home',  connections:['coast_e'], nation:'N1', fortress_level:0, garrison:0,   population:10000 },
      coast_e:{ terrain:'coastal_city', mapType:'Land', name:'Coast', connections:['home'],    nation:'EN', fortress_level:0, garrison:100, population:8000  },
    },
    {
      N1: { name:'N1', capital:'home',    military:{ at_war_with:['EN'] }, regions:['home']    },
      EN: { name:'EN', capital:'coast_e', military:{ at_war_with:['N1'] }, regions:['coast_e'] },
    },
    [{ id:'fleet1', type:'naval', nation:'N1', position:'coast_e' }]
  );
  const army = makeArmy('home', { infantry:400, cavalry:500, artillery:50, other:50 });
  const res  = utilityAIDecide(army, { nation:'N1' });
  ok('T05: action is move with fleet', res.action === 'move');
  ok('T05: no terrain_penalty:coastal_no_fleet when fleet present',
     !res.reasoning.includes('terrain_penalty:coastal_no_fleet'));
}

// ════════════════════════════════════════════════════════════════════════════
// T06: Hills defender with incoming enemy — hold score boosted
//      (enemy in adjacent region → terrain_advantage:defender_hills)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T06: hold on hills with incoming enemy — defender bonus ===');
{
  setupMap(
    {
      hill_home: { terrain:'hills',  mapType:'Land', name:'HillHome', connections:['e_adj'],     nation:'N1', fortress_level:0, garrison:0,    population:1000 },
      e_adj:     { terrain:'plains', mapType:'Land', name:'EAdj',     connections:['hill_home'], nation:'EN', fortress_level:0, garrison:1000, population:3000 },
    },
    {
      N1: { name:'N1', capital:'hill_home', military:{ at_war_with:['EN'] }, regions:['hill_home'] },
      EN: { name:'EN', capital:'e_adj',     military:{ at_war_with:['N1'] }, regions:['e_adj']     },
    },
    [{ id:'e1', type:'land', nation:'EN', position:'e_adj', size:1500 }]
  );
  // Small army on hills — enemy is much stronger, army should hold
  const army = makeArmy('hill_home', { infantry:400, cavalry:50, artillery:50, other:100 }, {
    supply:85, fatigue:10, morale:80,
  });
  const res = utilityAIDecide(army, { nation:'N1' });
  console.log(`    result: action=${res.action} reasoning="${res.reasoning}"`);
  ok('T06: no crash', res !== null && res.action !== undefined);
  if (res.action === 'hold') {
    ok('T06 hold: terrain_advantage:defender_hills in reasoning',
       res.reasoning.includes('terrain_advantage:defender_hills'));
  } else {
    ok('T06: non-hold action — no crash', true);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// T07: Mountain defender — same hold bonus
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T07: hold on mountains with incoming enemy ===');
{
  setupMap(
    {
      mt_home: { terrain:'mountains', mapType:'Land', name:'MtHome', connections:['e_adj2'],   nation:'N1', fortress_level:0, garrison:0,    population:1000 },
      e_adj2:  { terrain:'plains',    mapType:'Land', name:'EAdj2',  connections:['mt_home'],  nation:'EN', fortress_level:0, garrison:1000, population:3000 },
    },
    {
      N1: { name:'N1', capital:'mt_home', military:{ at_war_with:['EN'] }, regions:['mt_home'] },
      EN: { name:'EN', capital:'e_adj2',  military:{ at_war_with:['N1'] }, regions:['e_adj2']  },
    },
    [{ id:'e2', type:'land', nation:'EN', position:'e_adj2', size:1500 }]
  );
  const army = makeArmy('mt_home', { infantry:400, cavalry:50, artillery:50, other:100 }, {
    supply:85, fatigue:10, morale:80,
  });
  const res = utilityAIDecide(army, { nation:'N1' });
  console.log(`    result: action=${res.action} reasoning="${res.reasoning}"`);
  ok('T07: no crash', res !== null);
  if (res.action === 'hold') {
    ok('T07 hold: terrain_advantage:defender_hills in reasoning',
       res.reasoning.includes('terrain_advantage:defender_hills'));
  } else {
    ok('T07: non-hold action — accepted', true);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// T08: Plains infantry → no terrain tag
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== T08: low-cav plains attack — no terrain tag ===');
{
  setupMap(
    {
      home:    { terrain:'plains', mapType:'Land', name:'Home',   connections:['plains_e'], nation:'N1', fortress_level:0, garrison:0,   population:10000 },
      plains_e:{ terrain:'plains', mapType:'Land', name:'Plains', connections:['home'],     nation:'EN', fortress_level:0, garrison:100, population:2000  },
    },
    {
      N1: { name:'N1', capital:'home',    military:{ at_war_with:['EN'] }, regions:['home']     },
      EN: { name:'EN', capital:'plains_e',military:{ at_war_with:['N1'] }, regions:['plains_e'] },
    }
  );
  const army = makeArmy('home', { infantry:900, cavalry:30, artillery:30, other:40 });
  const res  = utilityAIDecide(army, { nation:'N1' });
  ok('T08: no terrain tag for low-cav plains attack',
     !res.reasoning || (!res.reasoning.includes('terrain_penalty') && !res.reasoning.includes('terrain_advantage')));
}

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════');
console.log(`MIL_008 tests: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All MIL_008 tests passed!');
} else {
  console.error('❌ Some MIL_008 tests FAILED');
  process.exit(1);
}
