'use strict';
/**
 * MIL CRASH & EDGE CASES TEST — Тест 4
 *
 * Краш-тесты и граничные случаи военной системы:
 * - Армия без юнитов
 * - Отсутствующие регионы/нации
 * - Пустые GAME_STATE
 * - Нулевое снабжение
 * - Флот атакует сушу и наоборот
 * - Сверхбольшие армии
 * - NaN/Infinity в параметрах
 *
 * Запуск: node tests/mil_crash_edge_cases_test.cjs
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function noThrow(label, fn) {
  try { fn(); ok(label, true); }
  catch(e) { console.error(`  ❌ CRASH: ${label} →`, e.message); failed++; }
}

// ── Load combat.js ────────────────────────────────────────────────────────────
const combatSrc = fs.readFileSync(path.join(__dirname, '../engine/combat.js'), 'utf8');
const GS = { armies: [], nations: {}, regions: {}, player_nation: null, turn: 1 };
const combatCtx = vm.createContext({
  GAME_STATE: GS, console, Math, Object, Array, JSON, Set, Map,
  addEventLog: () => {},
  getArmyCommander: () => null,
  getNationArmies: (n) => GS.armies.filter(a => a.nation === n),
  findArmyPath: () => null,
  captureRegion: () => {},
  beginSiege: () => {},
  DiplomacyEngine: undefined, WarScoreEngine: undefined,
  showBattleResult: undefined, addMemoryEvent: undefined,
  grantCommanderSkill: undefined, COMMANDER_SKILLS_DEF: undefined,
});
vm.runInContext(combatSrc, combatCtx);
const { resolveArmyBattle, calcArmyCombatStrength, checkNavalBlockade } = combatCtx;

// ── Load utility_ai.js ────────────────────────────────────────────────────────
const uaiSrc = fs.readFileSync(path.join(__dirname, '../ai/utility_ai.js'), 'utf8');
const AI_GS = { regions: {}, nations: {}, armies: [], sieges: [], wars: [], turn: 1 };
const aiCtx = vm.createContext({
  GAME_STATE: AI_GS, MAP_REGIONS: {}, addEventLog: () => {},
  console, Math, Object, Array, JSON, Set, Map,
  getArmyCommander: () => null,
  calcArmyCombatStrength: null, findArmyPath: null, _isFortressLineBlocked: null,
});
vm.runInContext(uaiSrc, aiCtx);
const { utilityAIDecide } = aiCtx;

// ── Load armies.js ────────────────────────────────────────────────────────────
const armiesSrc = fs.readFileSync(path.join(__dirname, '../engine/armies.js'), 'utf8');
const ARM_GS = { armies: [], nations: {}, regions: {}, player_nation: null, turn: 1 };
const armCtx = vm.createContext({
  GAME_STATE: ARM_GS, console, Math, Object, Array, JSON, Set, Map,
  addEventLog: () => {},
  checkNavalBlockade: () => ({ isBlockaded: false, blockadePower: 0 }),
  getArmyCommander: () => null,
  updateArmyLogisticTimer: () => {},
  calcLogisticPenalty: () => 0,
  captureRegion: () => {},
  processSiegeTicks: () => {},
  resolveArmyBattle: () => {},
  beginSiege: () => {},
  getCommanderDecisionNow: () => null,
  utilityAIDecide: () => ({ action: 'hold', target_id: null, score: 0 }),
  getNationArmies: (n) => ARM_GS.armies.filter(a => a.nation === n),
});
vm.runInContext(armiesSrc, armCtx);

function makeArmy(overrides = {}) {
  return Object.assign({
    id: 'test', nation: 'rome', type: 'land', name: 'Legion',
    units: { infantry: 3000, cavalry: 500, mercenaries: 0, artillery: 0 },
    morale: 75, discipline: 65, fatigue: 10, supply: 80,
    formation: 'standard', battles_won: 0, battles_lost: 0,
    war_score_earned: 0, path: [], state: 'active',
  }, overrides);
}

function setupBasicGS() {
  GS.nations = {
    rome: { name:'Rome', technology:{ military:1 }, military:{} },
    persia: { name:'Persia', technology:{ military:1 }, military:{} },
  };
  GS.regions = {
    plains: { terrain:'plains', name:'Plains', fortress_level:0, garrison:0, connections:[] },
  };
  GS.armies = [];
}

// ── TEST 4a: Army with zero units — no crash ─────────────────────────────────
console.log('\n=== T4a: Армия с нулём юнитов — нет краша ===');
setupBasicGS();
noThrow('T4a: resolveArmyBattle with empty units', () => {
  const atk = makeArmy({ units: { infantry:0, cavalry:0, mercenaries:0, artillery:0 } });
  const def = makeArmy({ nation:'persia', units: { infantry:0, cavalry:0, mercenaries:0, artillery:0 } });
  const result = resolveArmyBattle(atk, def, 'plains');
  ok('T4a: result returned', !!result);
  ok('T4a: casualties are 0', result.atkCasualties === 0 && result.defCasualties === 0);
});

// ── TEST 4b: Missing region — no crash ──────────────────────────────────────
console.log('\n=== T4b: Несуществующий регион — нет краша ===');
setupBasicGS();
noThrow('T4b: battle in nonexistent region', () => {
  const atk = makeArmy();
  const def = makeArmy({ nation:'persia' });
  const result = resolveArmyBattle(atk, def, 'nonexistent_region_xyz');
  ok('T4b: result returned even with missing region', !!result);
  ok('T4b: terrain defaults to plains', result.terrain === 'plains');
});

// ── TEST 4c: calcArmyCombatStrength with zero morale ─────────────────────────
console.log('\n=== T4c: Нулевая мораль — нет деления на ноль ===');
noThrow('T4c: calcStrength with morale=0', () => {
  const army = makeArmy({ morale: 0, discipline: 0, fatigue: 100 });
  const str = calcArmyCombatStrength(army, 'plains', false);
  console.log(`  strength with morale=0: ${str.toFixed(2)}`);
  ok('T4c: strength is finite number', Number.isFinite(str));
  ok('T4c: strength >= 0', str >= 0);
});

// ── TEST 4d: utilityAIDecide with minimal army state ─────────────────────────
console.log('\n=== T4d: ИИ с минимальным состоянием армии — нет краша ===');
AI_GS.regions = {
  pos:    { terrain:'plains', mapType:'Land', name:'P', connections:[], nation:'rome', fortress_level:0, garrison:0, population:1000 },
  target: { terrain:'plains', mapType:'Land', name:'T', connections:['pos'], nation:'enemy', fortress_level:0, garrison:100, population:5000 },
};
AI_GS.nations = {
  rome:  { name:'Rome',  capital:'pos',    military:{ at_war_with:['enemy'] } },
  enemy: { name:'Enemy', capital:'target', military:{ at_war_with:['rome']  } },
};
AI_GS.armies = [];
noThrow('T4d: utilityAIDecide minimal state', () => {
  const army = { id:'a', nation:'rome', type:'land', position:'pos',
    units:{infantry:1000,cavalry:0,mercenaries:0,artillery:0},
    morale:50, supply:50, fatigue:30, siege_id:null, state:'active', path:[], move_progress:0 };
  const res = utilityAIDecide(army, null);
  ok('T4d: valid action returned', res && typeof res.action === 'string');
  ok('T4d: score is finite', Number.isFinite(res.score));
});

// ── TEST 4e: utilityAIDecide with undefined nation ────────────────────────────
console.log('\n=== T4e: Армия с несуществующей нацией — нет краша ===');
noThrow('T4e: utilityAIDecide unknown nation', () => {
  const army = { id:'ghost', nation:'unknown_nation_xyz', type:'land', position:'pos',
    units:{infantry:500,cavalry:0,mercenaries:0,artillery:0},
    morale:60, supply:60, fatigue:20, siege_id:null, state:'active', path:[], move_progress:0 };
  const res = utilityAIDecide(army, null);
  ok('T4e: returns result despite unknown nation', res && typeof res.action === 'string');
});

// ── TEST 4f: calcArmyCombatStrength with extreme fatigue ─────────────────────
console.log('\n=== T4f: Максимальная усталость не даёт отрицательную силу ===');
noThrow('T4f: strength at fatigue=100', () => {
  const army = makeArmy({ fatigue: 100, morale: 10 });
  const str = calcArmyCombatStrength(army, 'mountains', false);
  console.log(`  extreme_fatigue_str=${str.toFixed(2)}`);
  ok('T4f: strength is non-negative', str >= 0);
  ok('T4f: strength is finite', Number.isFinite(str));
});

// ── TEST 4g: Massive army — no integer overflow ───────────────────────────────
console.log('\n=== T4g: Огромная армия — нет переполнения ===');
setupBasicGS();
noThrow('T4g: battle with 1M soldiers', () => {
  const atk = makeArmy({ units: { infantry:500000, cavalry:200000, mercenaries:100000, artillery:50000 } });
  const def = makeArmy({ nation:'persia', units: { infantry:500000, cavalry:200000, mercenaries:100000, artillery:50000 } });
  const result = resolveArmyBattle(atk, def, 'plains');
  console.log(`  atkCas=${result.atkCasualties} defCas=${result.defCasualties}`);
  ok('T4g: casualties are realistic integers', Number.isInteger(result.atkCasualties));
  ok('T4g: no NaN in casualties', !isNaN(result.atkCasualties) && !isNaN(result.defCasualties));
});

// ── TEST 4h: checkNavalBlockade with null region ─────────────────────────────
console.log('\n=== T4h: checkNavalBlockade с null регионом — нет краша ===');
noThrow('T4h: blockade null region', () => {
  const result = checkNavalBlockade(null, 'rome');
  ok('T4h: returns no blockade for null region', !result.isBlockaded);
});

// ── TEST 4i: findArmyPath from same region to same ───────────────────────────
console.log('\n=== T4i: Путь из региона в тот же регион ===');
ARM_GS.regions = {
  r1: { terrain:'plains', name:'R1', connections:['r2'], nation:'rome', mapType:'Land', building_slots:[] },
  r2: { terrain:'plains', name:'R2', connections:['r1'], nation:'rome', mapType:'Land', building_slots:[] },
};
ARM_GS.nations = { rome: { name:'Rome', military:{} } };
noThrow('T4i: path from A to A', () => {
  const p = armCtx.findArmyPath('r1', 'r1', 'land', 'rome', false);
  console.log(`  path r1→r1: ${JSON.stringify(p)}`);
  // Should return empty or ['r1'] — just not crash
  ok('T4i: path is array or null', p === null || Array.isArray(p));
});

// ── TEST 4j: Supply processing with supply=0 ─────────────────────────────────
console.log('\n=== T4j: Обработка снабжения при supply=0 ===');
ARM_GS.regions.r1.nation = 'enemy';
ARM_GS.nations.rome.military = { at_war_with: [] };
noThrow('T4j: _processSupply at supply=0', () => {
  const army = {
    id:'a', nation:'rome', type:'land', name:'Starving', position:'r1',
    target:null, path:[], move_progress:0,
    units:{ infantry:1000, cavalry:0, mercenaries:0, artillery:0 },
    morale:40, discipline:50, fatigue:30, supply:0, state:'stationed',
  };
  ARM_GS.armies = [army];
  armCtx._processSupply(army);
  ok('T4j: supply stays >= 0', army.supply >= 0);
  ok('T4j: morale stays >= 0', army.morale >= 0);
  ok('T4j: units not negative', army.units.infantry >= 0);
});

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════');
console.log(`Crash & Edge Cases Tests: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All crash/edge case tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some crash/edge case tests FAILED');
  process.exit(1);
}
