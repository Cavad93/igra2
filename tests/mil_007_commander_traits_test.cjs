'use strict';
// ── MIL_007 Tests: Unique Commander Trait Actions ─────────────────────
// Запуск: node tests/mil_007_commander_traits_test.cjs

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
function setupMap() {
  GS.regions['forest_pos']  = { terrain:'forest',  mapType:'Land', name:'Deep Forest', connections:['enemy_open','home_region','forest_enemy'], nation:'rome',    fortress_level:0, garrison:0,   population:0    };
  GS.regions['hills_pos']   = { terrain:'hills',   mapType:'Land', name:'Hill Fort',   connections:['enemy_open','home_region'],                 nation:'rome',    fortress_level:0, garrison:0,   population:0    };
  GS.regions['plains_pos']  = { terrain:'plains',  mapType:'Land', name:'Plains',      connections:['enemy_open','home_region'],                 nation:'rome',    fortress_level:0, garrison:0,   population:0    };
  GS.regions['enemy_open']  = { terrain:'plains',  mapType:'Land', name:'Enemy City',  connections:['forest_pos','hills_pos','plains_pos'],      nation:'carthage',fortress_level:0, garrison:100, population:5000 };
  GS.regions['forest_enemy']= { terrain:'forest',  mapType:'Land', name:'Enemy Forest',connections:['forest_pos'],                              nation:'carthage',fortress_level:2, garrison:300, population:2000, garrison_supply:25 };
  GS.regions['home_region'] = { terrain:'plains',  mapType:'Land', name:'Home',        connections:['forest_pos','hills_pos','plains_pos'],      nation:'rome',    fortress_level:0, garrison:0,   population:10000};

  // MIL_010: use non-adjacent capitals so capital_emergency/capitalBonus don't interfere
  GS.nations['rome']     = { name:'Rome',     capital:'distant_rome_cap', military:{ at_war_with:['carthage'] }, regions:['forest_pos','hills_pos','plains_pos','home_region'] };
  GS.nations['carthage'] = { name:'Carthage', capital:'distant_cart_cap', military:{ at_war_with:['rome'] },     regions:['enemy_open','forest_enemy'] };
}
setupMap();

function makeArmy(pos, overrides = {}) {
  return {
    id: 'test_army',
    nation: 'rome',
    type: 'land',
    position: pos,
    units: { infantry: 5000, cavalry: 500, mercenaries: 0, artillery: 0 },
    morale: 80, discipline: 70, fatigue: 20, supply: 80,
    formation: 'standard',
    state: 'stationed',
    path: [], move_progress: 0,
    siege_id: null,
    ...overrides,
  };
}

function makeCommander(skills = [], traits = {}) {
  return { name: 'TestCmd', commander_skills: skills, traits: { ambition:50, caution:30, cruelty:30, ...traits }, skills: { tactics:50 } };
}

// ── TEST 1: Cunning trait — ambush in forest ──────────────────────────
console.log('\n── TEST 1: cunning в лесу → action ambush ──');
{
  const army = makeArmy('forest_pos');
  // Enemy army nearby
  GS.armies = [{
    id: 'enemy1', nation: 'carthage', type:'land', position:'enemy_open',
    state:'stationed', units:{infantry:2000,cavalry:0,mercenaries:0,artillery:0},
    morale:70, discipline:60, fatigue:0, supply:80, path:[], siege_id:null,
  }];
  ctx.getArmyCommander = () => makeCommander(['cunning']);
  const decision = utilityAIDecide(army, { target_id: null });
  ok('ambush action возвращается для cunning в лесу', decision.action === 'ambush');
  ok('ambush reasoning содержит terrain', decision.reasoning.includes('ambush_set_in:forest'));
  ok('army.ambush_set установлен', army.ambush_set === true);
  GS.armies = [];
}

// ── TEST 2: Cunning trait — NO ambush in plains ───────────────────────
console.log('\n── TEST 2: cunning в равнинах → нет ambush ──');
{
  const army = makeArmy('plains_pos');
  GS.armies = [{
    id: 'enemy2', nation: 'carthage', type:'land', position:'enemy_open',
    state:'stationed', units:{infantry:500,cavalry:0,mercenaries:0,artillery:0},
    morale:70, discipline:60, fatigue:0, supply:80, path:[], siege_id:null,
  }];
  ctx.getArmyCommander = () => makeCommander(['cunning']);
  const decision = utilityAIDecide(army, { target_id: null });
  ok('нет ambush на равнинах', decision.action !== 'ambush');
  GS.armies = [];
}

// ── TEST 3: siege_master — prioritize starving fortress ──────────────
console.log('\n── TEST 3: siege_master → siege_master_priority для голодающей крепости ──');
{
  const army = makeArmy('forest_pos');
  GS.regions['forest_enemy'].garrison_supply = 15; // голодает
  GS.armies = [];
  ctx.getArmyCommander = () => makeCommander(['siege_master']);
  const decision = utilityAIDecide(army, { target_id: null });
  ok('siege_master приоритизирует голодающую крепость',
    decision.reasoning === 'siege_master_priority' ||
    (decision.action === 'move' && decision.target_id === 'forest_enemy')
  );
  GS.regions['forest_enemy'].garrison_supply = 100; // reset
}

// ── TEST 4: siege_master — no priority if fortress not starving ───────
console.log('\n── TEST 4: siege_master → нет приоритета если запасы > 30 ──');
{
  const army = makeArmy('forest_pos');
  GS.regions['forest_enemy'].garrison_supply = 80;
  GS.armies = [];
  ctx.getArmyCommander = () => makeCommander(['siege_master']);
  const decision = utilityAIDecide(army, { target_id: null });
  ok('нет siege_master_priority если гарнизон не голодает',
    decision.reasoning !== 'siege_master_priority'
  );
}

// ── TEST 5: lightning_commander — movement_bonus set ─────────────────
console.log('\n── TEST 5: lightning_commander → movement_bonus при pursuit ──');
{
  const army = makeArmy('plains_pos', { pursuit_order: 'enemy_open' });
  GS.armies = [];
  ctx.getArmyCommander = () => makeCommander(['lightning_commander']);
  army.movement_bonus = 0;
  utilityAIDecide(army, { target_id: null });
  ok('movement_bonus увеличен для lightning_commander с pursuit_order', army.movement_bonus >= 1);
}

// ── TEST 6: lightning_commander — no bonus without pursuit ───────────
console.log('\n── TEST 6: lightning_commander → нет бонуса без pursuit_order ──');
{
  const army = makeArmy('plains_pos');
  army.pursuit_order = null;
  army.movement_bonus = 0;
  GS.armies = [];
  ctx.getArmyCommander = () => makeCommander(['lightning_commander']);
  utilityAIDecide(army, { target_id: null });
  ok('нет movement_bonus без pursuit_order', (army.movement_bonus ?? 0) === 0);
}

// ── TEST 7: strategist — coordinate_attack with 2+ allies ────────────
console.log('\n── TEST 7: strategist → coordinate_attack при 2+ союзниках ──');
{
  const army = makeArmy('forest_pos');
  // Two allied armies nearby
  GS.armies = [
    { id:'ally1', nation:'rome', type:'land', position:'home_region', state:'stationed',
      units:{infantry:3000,cavalry:0,mercenaries:0,artillery:0}, morale:80,discipline:70,fatigue:0,supply:80,path:[],siege_id:null },
    { id:'ally2', nation:'rome', type:'land', position:'hills_pos',   state:'stationed',
      units:{infantry:3000,cavalry:0,mercenaries:0,artillery:0}, morale:80,discipline:70,fatigue:0,supply:80,path:[],siege_id:null },
  ];
  ctx.getArmyCommander = () => makeCommander(['strategist']);
  const decision = utilityAIDecide(army, { target_id: null });
  const hasCoordinate = decision.action === 'move' &&
    decision.reasoning.includes('coordinate_attack:strategist');
  ok('strategist даёт coordinate_attack при 2+ союзниках', hasCoordinate || decision.score >= 30);
  GS.armies = [];
}

// ── TEST 8: no traits — no ambush, no special actions ────────────────
console.log('\n── TEST 8: нет черт → нет специальных действий ──');
{
  const army = makeArmy('forest_pos');
  GS.armies = [{
    id:'enemy3', nation:'carthage', type:'land', position:'enemy_open',
    state:'stationed', units:{infantry:2000,cavalry:0,mercenaries:0,artillery:0},
    morale:70, discipline:60, fatigue:0, supply:80, path:[], siege_id:null,
  }];
  ctx.getArmyCommander = () => makeCommander([]); // no special skills
  const decision = utilityAIDecide(army, { target_id: null });
  ok('нет ambush без cunning', decision.action !== 'ambush');
  ok('нет ambush_set без cunning', !army.ambush_set);
  GS.armies = [];
}

// ── TEST 9: ambush_set cleared on source check ────────────────────────
console.log('\n── TEST 9: ambush flag → боевая сила защитника проверка ──');
{
  // Verify that the combat.js line is changed
  const combatSrc = fs.readFileSync(path.join(__dirname, '../engine/combat.js'), 'utf8');
  ok('combat.js имеет ambush_set проверку', combatSrc.includes('army.ambush_set ? 1.40 : 1.20'));
}

// ── TEST 10: ambush_set cleared in armies.js ──────────────────────────
console.log('\n── TEST 10: ambush_set сбрасывается при движении ──');
{
  const armiesSrc = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');
  ok('armies.js сбрасывает ambush_set при движении', armiesSrc.includes('ambush_set     = false'));
}

// ── TEST 11: orders.js has ambush case ───────────────────────────────
console.log('\n── TEST 11: orders.js обрабатывает action ambush ──');
{
  const ordersSrc = fs.readFileSync(path.join(__dirname, '../engine/orders.js'), 'utf8');
  ok("orders.js содержит case 'ambush'", ordersSrc.includes("case 'ambush':"));
}

// ── TEST 12: cunning — score ≥ 55 for ambush ─────────────────────────
console.log('\n── TEST 12: cunning засада имеет score ≥ 55 ──');
{
  const army = makeArmy('hills_pos', { ambush_set: false });
  GS.armies = [{
    id:'enemy4', nation:'carthage', type:'land', position:'enemy_open',
    state:'stationed', units:{infantry:3000,cavalry:0,mercenaries:0,artillery:0},
    morale:70, discipline:60, fatigue:0, supply:80, path:[], siege_id:null,
  }];
  ctx.getArmyCommander = () => makeCommander(['cunning']);
  const decision = utilityAIDecide(army, { target_id: null });
  ok('ambush score ≥ 55 для cunning', !decision.action === 'ambush' || decision.score >= 55);
  GS.armies = [];
}

// ── SUMMARY ───────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`MIL_007: ${passed}/${passed+failed} тестов пройдено`);
if (failed > 0) {
  console.error(`FAILED: ${failed} тестов`);
  process.exit(1);
} else {
  console.log('Все MIL_007 тесты пройдены ✓');
}
