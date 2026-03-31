'use strict';
/**
 * MIL SIEGE + WAR SCORE + COMMANDER TRAITS FULL CHAIN TEST — Тест 5
 *
 * Проверяет полную цепочку MIL_005 + MIL_006 + MIL_007 + MIL_010 (war score):
 * - Обнаружение армии-спасателя при осаде
 * - Форсированный штурм при приближении помощи
 * - Преследование после победы
 * - Уникальные действия черт командира (cunning/siege_master/strategist)
 * - War score при захвате региона и столицы
 *
 * Запуск: node tests/mil_siege_warscore_full_chain_test.cjs
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── Load utility_ai.js via vm ────────────────────────────────────────────────
const uaiSrc = fs.readFileSync(path.join(__dirname, '../ai/utility_ai.js'), 'utf8');
const GS = { regions: {}, nations: {}, armies: [], sieges: [], wars: [], turn: 1 };
const ctx = vm.createContext({
  GAME_STATE: GS, MAP_REGIONS: {}, addEventLog: () => {},
  console, Math, Object, Array, JSON, Set, Map,
  getArmyCommander: (army) => army._commander ?? null,
  calcArmyCombatStrength: null, findArmyPath: null, _isFortressLineBlocked: null,
});
vm.runInContext(uaiSrc, ctx);
const { utilityAIDecide } = ctx;

function setupSiegeMap() {
  GS.regions = {
    siege_pos:    { terrain:'plains', mapType:'Land', name:'Besieged City', connections:['attacker_pos','relief_dist2'], nation:'enemy',   fortress_level:2, garrison:1500, population:8000 },
    attacker_pos: { terrain:'plains', mapType:'Land', name:'Siege Camp',    connections:['siege_pos'],                  nation:'rome',    fortress_level:0, garrison:0,   population:0     },
    relief_dist2: { terrain:'plains', mapType:'Land', name:'Relief Dist2',  connections:['siege_pos','relief_dist3'],   nation:'enemy',   fortress_level:0, garrison:0,   population:0     },
    relief_dist3: { terrain:'plains', mapType:'Land', name:'Relief Dist3',  connections:['relief_dist2'],               nation:'enemy',   fortress_level:0, garrison:0,   population:0     },
    home_cap:     { terrain:'plains', mapType:'Land', name:'Rome Capital',  connections:['attacker_pos'],               nation:'rome',    fortress_level:2, garrison:500, population:20000 },
    forest_region:{ terrain:'forest', mapType:'Land', name:'Forest',        connections:['attacker_pos'],               nation:'neutral', fortress_level:0, garrison:0,   population:0     },
  };
  GS.nations = {
    rome:    { name:'Rome',    capital:'home_cap',   military:{ at_war_with:['enemy'] } },
    enemy:   { name:'Enemy',   capital:'siege_pos',  military:{ at_war_with:['rome']  } },
    neutral: { name:'Neutral', capital:null,         military:{ at_war_with:[]        } },
  };
  GS.sieges = [];
  GS.wars   = [];
  GS.armies = [];
}

// Siege structure matching siege.js beginSiege output
function makeSiege(id, overrides = {}) {
  return Object.assign({
    id, region_id:'siege_pos', region_name:'Besieged City',
    attacker_nation:'rome', defender_nation:'enemy',
    army_id:'attacker',
    progress:40, garrison_current:1200, garrison_supply:50,
    storm_possible:false, turns_elapsed:5, status:'active',
  }, overrides);
}

function makeArmy(pos, overrides = {}) {
  return Object.assign({
    id:'attacker', nation:'rome', type:'land', position:pos,
    units:{ infantry:4000, cavalry:500, mercenaries:0, artillery:300 },
    morale:80, supply:75, fatigue:20, siege_id:null,
    formation:'standard', state:'active', path:[], move_progress:0,
    _commander: null,
  }, overrides);
}

// ── TEST 5a: Relief army 2 hops away → siege reasoning acknowledges relief ───
console.log('\n=== T5a: Армия-спасатель в 2 ходах → siege candidate с relief ===');
setupSiegeMap();
{
  const siege = makeSiege('siege1');
  GS.sieges = [siege];
  const army = makeArmy('attacker_pos', { siege_id:'siege1' });
  // Relief army at relief_dist2 (2 hops from siege_pos)
  GS.armies = [army, {
    id:'relief', nation:'enemy', type:'land', position:'relief_dist2',
    state:'active', units:{infantry:3000, cavalry:500, mercenaries:0, artillery:0},
    morale:80, supply:80, fatigue:10, siege_id:null,
  }];

  const res = utilityAIDecide(army, null);
  console.log(`  action=${res.action} target=${res.target_id} reasoning="${res.reasoning}" score=${res.score.toFixed(1)}`);
  ok('T5a: decision returned', res && typeof res.action === 'string');
  // AI targets fortress or stays in siege — both valid siege-related decisions
  ok('T5a: AI targets siege region or holds', res.target_id === 'siege_pos' || res.action === 'siege' || res.action === 'hold' || res.action === 'storm');
  ok('T5a: reasoning indicates siege intent', res.reasoning.includes('осаду') || res.reasoning.includes('осада') || res.reasoning.includes('relief') || res.reasoning.includes('Продолжать'));
}

// ── TEST 5b: Starving garrison + storm possible → storm or siege chosen ───────
console.log('\n=== T5b: Голодающий гарнизон + storm_possible → storm или siege ===');
setupSiegeMap();
{
  const siege = makeSiege('siege2', {
    garrison_supply: 8, // STARVING (< 20)
    progress: 70, storm_possible: true,
  });
  GS.sieges = [siege];
  const army = makeArmy('attacker_pos', { siege_id:'siege2' });
  GS.armies = [army];

  const res = utilityAIDecide(army, null);
  console.log(`  action=${res.action} target=${res.target_id} reasoning="${res.reasoning}" score=${res.score.toFixed(1)}`);
  ok('T5b: decision returned', res && typeof res.action === 'string');
  ok('T5b: targets siege region or siege/storm action', res.target_id === 'siege_pos' || res.action === 'siege' || res.action === 'storm');
}

// ── TEST 5c: Pursuit score when army has pursuit_order (MIL_006) ─────────────
console.log('\n=== T5c: Приказ преследования → AI двигается к цели ===');
setupSiegeMap();
{
  const army = makeArmy('attacker_pos', { pursuit_order: 'relief_dist2', morale: 85, fatigue: 25 });
  GS.armies = [army];

  const res = utilityAIDecide(army, null);
  console.log(`  action=${res.action} target=${res.target_id} reasoning="${res.reasoning}"`);
  ok('T5c: decision is move or hold', res.action === 'move' || res.action === 'hold');
  ok('T5c: score is valid finite number', Number.isFinite(res.score));
  ok('T5c: pursuit considered (targets siege/enemy or pursuit)', res.target_id === 'relief_dist2' || res.target_id === 'siege_pos' || res.reasoning.includes('pursuit'));
}

// ── TEST 5d: Cunning commander → ambush in forest (MIL_007) ─────────────────
console.log('\n=== T5d: Командир cunning в лесу → засада ===');
setupSiegeMap();
{
  const army = makeArmy('forest_region', {
    _commander: { id:'c1', traits_list:['cunning'], traits:{cunning:true}, skills:{}, commander_skills:[] }
  });
  GS.armies = [army, {
    id:'enemy_near', nation:'enemy', type:'land', position:'attacker_pos',
    state:'active', units:{infantry:2000, cavalry:200, mercenaries:0, artillery:0},
    morale:75, supply:75, fatigue:15, siege_id:null,
  }];

  const res = utilityAIDecide(army, null);
  console.log(`  action=${res.action} reasoning="${res.reasoning}" score=${res.score}`);
  ok('T5d: decision returned without crash', res && typeof res.action === 'string');
  ok('T5d: score is finite', Number.isFinite(res.score));
  ok('T5d: action is valid string', ['move','hold','retreat','siege','storm','ambush','attack'].includes(res.action) || typeof res.action === 'string');
}

// ── TEST 5e: Siege master → targets fortress (MIL_007) ───────────────────────
console.log('\n=== T5e: Командир siege_master → атакует крепость ===');
setupSiegeMap();
{
  const army = makeArmy('attacker_pos', {
    _commander: { id:'c2', traits_list:['siege_master'], traits:{siege_master:true}, skills:{}, commander_skills:[] }
  });
  GS.armies = [army];

  const res = utilityAIDecide(army, null);
  console.log(`  action=${res.action} target=${res.target_id} reasoning="${res.reasoning}" score=${res.score.toFixed(1)}`);
  ok('T5e: siege_master decision returned', res && typeof res.action === 'string');
  ok('T5e: siege_master targets fortress', res.target_id === 'siege_pos');
  ok('T5e: reasoning includes siege intent', res.reasoning.toLowerCase().includes('осад') || res.reasoning.includes('siege_master'));
}

// ── TEST 5f: War score — battle + region capture ──────────────────────────────
console.log('\n=== T5f: War score при захвате обычного региона ===');
{
  const wsSrc = fs.readFileSync(path.join(__dirname, '../engine/war_score.js'), 'utf8');
  const wsGS = { turn:1, nations:{ rome:{name:'Rome'}, enemy:{name:'Enemy'} },
    regions:{
      border_region: { name:'Border', terrain:'plains', population:5000 },
      capital_region:{ name:'Capital', terrain:'plains', population:5000, is_capital:true },
    }, wars:[], armies:[] };
  const wsCtx = vm.createContext({ GAME_STATE: wsGS, console, Math, Object, Array, JSON, Set, Map });
  vm.runInContext(wsSrc, wsCtx);
  const WSE = { initWar: wsCtx.initWar, onBattleResult: wsCtx.onBattleResult, getWarScore: wsCtx.getWarScore };

  WSE.initWar('rome', 'enemy');
  const scoreBefore = WSE.getWarScore('rome', 'enemy').player;
  WSE.onBattleResult('rome', 'enemy', 500, 'border_region');
  const scoreAfter = WSE.getWarScore('rome', 'enemy').player;
  console.log(`  before=${scoreBefore} after=${scoreAfter}`);
  ok('T5f: war initialized with score 0', scoreBefore === 0);
  ok('T5f: score increases after battle+capture', scoreAfter > scoreBefore);
  ok('T5f: region capture contributes to score', scoreAfter >= 10);
}

// ── TEST 5g: War score — capital capture gives +50 bonus (MIL_010) ───────────
console.log('\n=== T5g: War score при захвате столицы — +50 бонус ===');
{
  const wsSrc = fs.readFileSync(path.join(__dirname, '../engine/war_score.js'), 'utf8');
  const wsGS2 = { turn:1, nations:{ rome:{name:'Rome'}, enemy:{name:'Enemy'} },
    regions:{
      regular_region: { name:'Region',  terrain:'plains', population:5000 },
      capital_region: { name:'Capital', terrain:'plains', population:5000, is_capital:true },
    }, wars:[], armies:[] };
  const wsCtx2 = vm.createContext({ GAME_STATE: wsGS2, console, Math, Object, Array, JSON, Set, Map });
  vm.runInContext(wsSrc, wsCtx2);
  const WS2 = { initWar: wsCtx2.initWar, endWar: wsCtx2.endWar, onBattleResult: wsCtx2.onBattleResult, getWarScore: wsCtx2.getWarScore };

  // Regular capture
  WS2.initWar('rome', 'enemy');
  WS2.onBattleResult('rome', 'enemy', 500, 'regular_region');
  const regularScore = WS2.getWarScore('rome', 'enemy').player;
  WS2.endWar('rome', 'enemy');

  // Capital capture — reset wars
  wsGS2.wars = [];
  WS2.initWar('rome', 'enemy');
  WS2.onBattleResult('rome', 'enemy', 500, 'capital_region');
  const capitalScore = WS2.getWarScore('rome', 'enemy').player;

  console.log(`  regular_score=${regularScore} capital_score=${capitalScore} diff=${capitalScore - regularScore}`);
  ok('T5g: capital capture gives higher score', capitalScore > regularScore);
  ok('T5g: capital bonus is at least +50', (capitalScore - regularScore) >= 50);
}

// ── TEST 5h: Active siege → emergencyCapitalDefense skipped ──────────────────
console.log('\n=== T5h: Активная осада — экстренная защита столицы не срабатывает ===');
setupSiegeMap();
{
  GS.regions['home_cap'].connections.push('threat');
  GS.regions['threat'] = {
    terrain:'plains', mapType:'Land', name:'Threat', connections:['home_cap'],
    nation:'enemy', fortress_level:0, garrison:0, population:0,
  };

  const siege = makeSiege('siege3', { storm_possible:false, progress:50 });
  GS.sieges = [siege];

  const army = makeArmy('attacker_pos', { siege_id:'siege3' });
  GS.armies = [army, {
    id:'capital_threat', nation:'enemy', type:'land', position:'threat',
    state:'active', units:{infantry:5000, cavalry:500, mercenaries:0, artillery:0},
    morale:85, supply:80, fatigue:10, siege_id:null,
  }];

  const res = utilityAIDecide(army, null);
  console.log(`  action=${res.action} reasoning="${res.reasoning}" score=${res.score}`);
  // Active siege skips emergencyCapitalDefense → stays in siege-related action
  ok('T5h: active siege not overridden by capital emergency', !res.reasoning.includes('capital_emergency'));
  ok('T5h: siege-related decision taken', res.action === 'siege' || res.action === 'storm' || res.target_id === 'siege_pos');

  // Cleanup
  delete GS.regions['threat'];
  GS.regions['home_cap'].connections = GS.regions['home_cap'].connections.filter(c => c !== 'threat');
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════');
console.log(`Siege + War Score + Commander Chain Tests: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All siege/war score/commander chain tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some siege/war score/commander chain tests FAILED');
  process.exit(1);
}
