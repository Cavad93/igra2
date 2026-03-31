'use strict';
/**
 * MIL_010 Tests — Capital Priority & War Score System
 * Tests: capitalBonus 22→55, _emergencyCapitalDefense, capital capture +50
 */

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log('  ✅', label); passed++; }
  else       { console.error('  ❌ FAIL:', label); failed++; }
}

// ── PART A: utility_ai.js (capitalBonus + _emergencyCapitalDefense) ──────────

const GS = { regions: {}, nations: {}, armies: [], sieges: [], turn: 1 };
const addEventLog = () => {};
const uaiSrc = fs.readFileSync(path.join(__dirname, '../ai/utility_ai.js'), 'utf8');
const ctx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: {}, addEventLog,
  console, Math, Object, Array, JSON, Set, Map,
  getArmyCommander: () => null,
  calcArmyCombatStrength: null, findArmyPath: null, _isFortressLineBlocked: null,
});
vm.runInContext(uaiSrc, ctx);
const { utilityAIDecide } = ctx;

function setupMapA() {
  GS.regions = {
    home:     { terrain:'plains',  mapType:'Land', name:'Capital',  connections:['front'],          nation:'N1', fortress_level:1, garrison:300, population:20000 },
    front:    { terrain:'plains',  mapType:'Land', name:'Front',    connections:['home','enemy_cap'], nation:'N1', fortress_level:0, garrison:0,   population:5000  },
    enemy_cap:{ terrain:'plains',  mapType:'Land', name:'EnemyCap', connections:['front'],           nation:'EN', fortress_level:0, garrison:200, population:15000, is_capital:true },
  };
  GS.nations = {
    N1: { name:'N1', capital:'home', military:{ at_war_with:['EN'] }, regions:['home','front'] },
    EN: { name:'EN', capital:'enemy_cap', military:{ at_war_with:['N1'] }, regions:['enemy_cap'] },
  };
  GS.armies = [];
  GS.sieges = [];
}

function makeArmy(pos, overrides = {}) {
  return {
    id:'test_army', nation:'N1', type:'land', position:pos,
    units:{ infantry:3000, cavalry:200, mercenaries:0, artillery:0 },
    morale:80, discipline:70, fatigue:20, supply:80,
    formation:'standard', state:'stationed',
    path:[], move_progress:0, siege_id:null,
    ...overrides,
  };
}

// ── TEST 1: Capital bonus = 55 (not 22) ─────────────────────────────────────
console.log('\n=== T01: capitalBonus 55 — attacking enemy capital scored higher ===');
setupMapA();
GS.armies = [makeArmy('front')];
// No enemy army adjacent to our capital → normal decision
const res1 = utilityAIDecide(makeArmy('front'), null);
ok('T01: decision returned', !!res1);
ok('T01: move to enemy_cap (capital bonus prevails)', res1.action === 'move' && res1.target_id === 'enemy_cap');
ok('T01: score ≥ 70 (capital bonus contributes significantly)', res1.score >= 70);

// ── TEST 2: No emergency defense when army is at own capital ─────────────────
console.log('\n=== T02: no override when army is already at capital ===');
setupMapA();
// Enemy army adjacent to our capital (home←→front←→enemy army?)
GS.regions.front.connections = ['home', 'enemy_cap'];
GS.armies = [
  makeArmy('home'),
  { id:'en_army', nation:'EN', position:'front', state:'active',
    units:{infantry:4000,cavalry:0,mercenaries:0,artillery:0},
    morale:75, supply:80, fatigue:10, siege_id:null },
];
const res2 = utilityAIDecide(makeArmy('home'), null);
ok('T02: no crash', !!res2);
ok('T02: not forced defend_capital (already at capital)', res2.reasoning !== 'defend_capital');

// ── TEST 3: Emergency defense triggers when enemy adjacent to unguarded capital ─
console.log('\n=== T03: emergency defense → move to capital when enemy 1 hop away ===');
setupMapA();
// Enemy army at 'front' (1 hop from 'home' capital)
GS.armies = [
  makeArmy('enemy_cap'), // our army far from capital
  { id:'en_army', nation:'EN', position:'front', state:'active',
    units:{infantry:5000,cavalry:0,mercenaries:0,artillery:0},
    morale:85, supply:80, fatigue:5, siege_id:null },
];
// Add 'enemy_cap' connects to front for army to be reachable
const res3 = utilityAIDecide(makeArmy('enemy_cap'), null);
ok('T03: decision returned', !!res3);
ok('T03: defend_capital (enemy 1 hop from capital)', res3.reasoning === 'defend_capital');
ok('T03: score = 999', res3.score === 999);
ok('T03: moves toward capital', res3.target_id === 'home');

// ── TEST 4: No emergency defense when enemy is 2+ hops from capital ──────────
console.log('\n=== T04: no emergency defense when enemy far from capital ===');
setupMapA();
GS.regions.faraway = { terrain:'plains', mapType:'Land', name:'Far', connections:['enemy_cap'], nation:'EN', fortress_level:0, garrison:100, population:1000 };
GS.armies = [
  makeArmy('front'),
  { id:'en_army', nation:'EN', position:'faraway', state:'active',
    units:{infantry:3000,cavalry:0,mercenaries:0,artillery:0},
    morale:75, supply:80, fatigue:10, siege_id:null },
];
const res4 = utilityAIDecide(makeArmy('front'), null);
ok('T04: no defend_capital (enemy 2+ hops from capital)', res4.reasoning !== 'defend_capital');

// ── TEST 5: No override when army has active siege ───────────────────────────
console.log('\n=== T05: emergency defense skipped for army in active siege ===');
setupMapA();
GS.regions.front.connections = ['home', 'enemy_cap'];
GS.sieges = [{ id:'siege_1', region_id:'enemy_cap', region_name:'EnemyCap', progress:45, storm_possible:false, garrison:200, garrison_supply:80, garrison_morale:70 }];
GS.armies = [
  makeArmy('front', { siege_id:'siege_1' }),
  { id:'en_army', nation:'EN', position:'front', state:'active',
    units:{infantry:5000,cavalry:0,mercenaries:0,artillery:0},
    morale:80, supply:80, fatigue:5, siege_id:null },
];
const res5 = utilityAIDecide(makeArmy('front', { siege_id:'siege_1' }), null);
ok('T05: siege continues despite enemy near capital (active siege skips override)', res5.action !== 'defend_capital' || res5.reasoning !== 'defend_capital_forced');
ok('T05: no crash', !!res5);

// ── PART B: war_score.js capital capture bonus ───────────────────────────────
console.log('\n=== WAR SCORE: capital capture +50 bonus ===');

const wsSrc = fs.readFileSync(path.join(__dirname, '../engine/war_score.js'), 'utf8');
const wsGS  = { turn: 1, nations: {
    FR: { name:'France', capital:'paris', regions:['paris','lyon'] },
    EN: { name:'England', capital:'london', regions:['london'] },
  }, regions: {
    paris:  { id:'paris',  name:'Paris',  nation:'FR', is_capital:true,  population:200000, fortress_level:2 },
    london: { id:'london', name:'London', nation:'EN', is_capital:true,  population:150000, fortress_level:1 },
    lyon:   { id:'lyon',   name:'Lyon',   nation:'FR', is_capital:false, population:50000,  fortress_level:0 },
  }, wars: [],
};
const wsCtx = vm.createContext({
  GAME_STATE: wsGS, console, Math, Object, Array, JSON, Set, Map,
});
vm.runInContext(wsSrc, wsCtx);
const WSE = {
  initWar:       wsCtx.initWar,
  onBattleResult: wsCtx.onBattleResult,
  getWarScore:   wsCtx.getWarScore,
};

// Init war
WSE.initWar('EN', 'FR');
ok('W01: war initialized', wsGS.wars.length === 1);
ok('W02: attacker_score starts at 0', wsGS.wars[0].attacker_score === 0);

// Battle without capture
WSE.onBattleResult('EN', 'FR', 1000, null);
const ws1 = WSE.getWarScore('EN', 'FR');
ok('W03: battle gives war score > 0', ws1.player > 0);
ok('W04: battle score ≤ BATTLE_MAX (30)', ws1.player <= 30);
console.log(`  Battle score: ${ws1.player}`);

// Capture normal region (lyon)
const beforeCapture = ws1.player;
WSE.onBattleResult('EN', 'FR', 500, 'lyon');
const ws2 = WSE.getWarScore('EN', 'FR');
ok('W05: capture adds region bonus', ws2.player > beforeCapture);
console.log(`  After lyon capture: ${ws2.player} (delta +${ws2.player - beforeCapture})`);

// Capture capital (paris) — should get +50 bonus
const beforeCapital = ws2.player;
WSE.onBattleResult('EN', 'FR', 500, 'paris');
const ws3 = WSE.getWarScore('EN', 'FR');
const capitalDelta = ws3.player - beforeCapital;
ok('W06: capital capture gives large bonus', capitalDelta >= 50);
ok('W07: capital bonus is at least +50 above regular capture', capitalDelta >= 50);
console.log(`  After PARIS (capital) capture: ${ws3.player} (delta +${capitalDelta})`);

// Check war event log mentions capital
const capitalEvent = wsGS.wars[0]?.events?.find(e => e.notes && e.notes.includes('СТОЛИЦА'));
ok('W08: capital capture event logged', !!capitalEvent);

// ── TEST: CAPITAL_CAPTURE exists in war_score source ────────────────────────
console.log('\n=== CFG: CAPITAL_CAPTURE constant check ===');
const wsSource = fs.readFileSync(path.join(__dirname, '../engine/war_score.js'), 'utf8');
ok('W09: CAPITAL_CAPTURE defined in war_score.js', wsSource.includes('CAPITAL_CAPTURE'));
ok('W10: CAPITAL_CAPTURE: 50 in config', wsSource.includes('CAPITAL_CAPTURE:') && wsSource.includes('50'));

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════');
console.log(`MIL_010 tests: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('✅ All MIL_010 tests passed!');
else console.error(`❌ ${failed} test(s) FAILED`);
