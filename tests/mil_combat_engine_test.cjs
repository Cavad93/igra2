'use strict';
/**
 * MIL COMBAT ENGINE TEST — Тест 2: resolveArmyBattle + calcArmyCombatStrength
 *
 * Юнит-тесты боевого движка: формулы, потери, мораль, преследование, formations.
 * Запуск: node tests/mil_combat_engine_test.cjs
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}

// ── Load combat.js via vm ───────────────────────────────────────────────────
const combatSrc = fs.readFileSync(path.join(__dirname, '../engine/combat.js'), 'utf8');
const GS = {
  armies: [], nations: {}, regions: {}, player_nation: null, turn: 1
};
const capturedRegions = [];
const events = [];
const ctx = vm.createContext({
  GAME_STATE: GS, console, Math, Object, Array, JSON, Set, Map,
  addEventLog: (msg) => events.push(msg),
  getArmyCommander: () => null,
  getNationArmies: (nation) => GS.armies.filter(a => a.nation === nation),
  findArmyPath: () => null,
  captureRegion: (n, r) => capturedRegions.push({ nation: n, region: r }),
  beginSiege: () => {},
  DiplomacyEngine: undefined,
  WarScoreEngine: undefined,
  showBattleResult: undefined,
  addMemoryEvent: undefined,
  grantCommanderSkill: undefined,
  COMMANDER_SKILLS_DEF: undefined,
});
vm.runInContext(combatSrc, ctx);
const { resolveArmyBattle, calcArmyCombatStrength, checkNavalBlockade } = ctx;

function setupGS(attackerNation, defenderNation) {
  GS.nations = {
    [attackerNation]: { name: attackerNation, technology: { military: 2 }, military: {} },
    [defenderNation]: { name: defenderNation, technology: { military: 2 }, military: {} },
  };
  GS.regions = {
    plains_region: { terrain: 'plains', name: 'Plains', fortress_level: 0, garrison: 0, connections: [] },
    hills_region:  { terrain: 'hills',  name: 'Hills',  fortress_level: 0, garrison: 0, connections: [] },
    mountains_region: { terrain: 'mountains', name: 'Mountains', fortress_level: 0, garrison: 0, connections: [] },
    coastal_region: { terrain: 'coastal_city', name: 'Port', fortress_level: 0, garrison: 0, connections: [], mapType: 'coastal' },
  };
  events.length = 0;
  capturedRegions.length = 0;
}

function makeArmy(nation, overrides = {}) {
  return Object.assign({
    id: `army_${nation}`, nation, type: 'land', name: `Army of ${nation}`,
    units: { infantry: 5000, cavalry: 500, mercenaries: 0, artillery: 200 },
    morale: 80, discipline: 70, fatigue: 10, supply: 80,
    formation: 'standard',
    battles_won: 0, battles_lost: 0, war_score_earned: 0,
    commander_id: null, path: [], state: 'active',
  }, overrides);
}

// ── TEST 2a: Battle returns expected structure ───────────────────────────────
console.log('\n=== T2a: resolveArmyBattle возвращает корректную структуру ===');
setupGS('rome', 'persia');
{
  const atk = makeArmy('rome');
  const def = makeArmy('persia');
  const result = resolveArmyBattle(atk, def, 'plains_region');
  console.log(`  winner=${result.winner} atkCas=${result.atkCasualties} defCas=${result.defCasualties}`);
  ok('T2a: result has winner', typeof result.winner === 'string');
  ok('T2a: atkCasualties >= 0', result.atkCasualties >= 0);
  ok('T2a: defCasualties >= 0', result.defCasualties >= 0);
  ok('T2a: margin >= 1.0', result.margin >= 1.0);
  ok('T2a: terrain is plains', result.terrain === 'plains');
  ok('T2a: event logged (battle)', events.some(e => e.includes('Сражение')));
}

// ── TEST 2b: Larger army wins significantly more often ───────────────────────
console.log('\n=== T2b: Большая армия побеждает чаще ===');
setupGS('rome', 'persia');
{
  let romeWins = 0;
  for (let i = 0; i < 20; i++) {
    const atk = makeArmy('rome', { units: { infantry: 10000, cavalry: 1000, mercenaries: 0, artillery: 500 } });
    const def = makeArmy('persia', { units: { infantry: 1000,  cavalry: 100,  mercenaries: 0, artillery: 0   } });
    const result = resolveArmyBattle(atk, def, 'plains_region');
    if (result.winner === 'rome') romeWins++;
  }
  console.log(`  Rome won ${romeWins}/20 battles with 10:1 advantage`);
  ok('T2b: 10:1 advantage → wins 15+ of 20', romeWins >= 15);
}

// ── TEST 2c: calcArmyCombatStrength — formations ────────────────────────────
console.log('\n=== T2c: Formations меняют боевую силу корректно ===');
setupGS('rome', 'persia');
{
  const baseArmy = makeArmy('rome');
  const stdStr  = calcArmyCombatStrength(Object.assign({}, baseArmy, { formation: 'standard'   }), 'plains', false);
  const aggStr  = calcArmyCombatStrength(Object.assign({}, baseArmy, { formation: 'aggressive' }), 'plains', false);
  const defStr  = calcArmyCombatStrength(Object.assign({}, baseArmy, { formation: 'defensive'  }), 'plains', true);
  const stdDef  = calcArmyCombatStrength(Object.assign({}, baseArmy, { formation: 'standard'   }), 'plains', true);
  console.log(`  standard_atk=${stdStr.toFixed(1)} aggressive_atk=${aggStr.toFixed(1)} defensive_def=${defStr.toFixed(1)} standard_def=${stdDef.toFixed(1)}`);
  ok('T2c: aggressive > standard (attack)', aggStr > stdStr);
  ok('T2c: defensive > standard (defense)', defStr > stdDef);
}

// ── TEST 2d: Terrain affects combat strength ────────────────────────────────
console.log('\n=== T2d: Местность влияет на боевую силу ===');
setupGS('rome', 'persia');
{
  const army = makeArmy('rome');
  const strPlains = calcArmyCombatStrength(army, 'plains',    false);
  const strHills  = calcArmyCombatStrength(army, 'hills',     false);
  const strMtns   = calcArmyCombatStrength(army, 'mountains', false);
  console.log(`  plains=${strPlains.toFixed(1)} hills=${strHills.toFixed(1)} mountains=${strMtns.toFixed(1)}`);
  ok('T2d: plains > hills (attack)', strPlains > strHills);
  ok('T2d: hills > mountains (attack)', strHills > strMtns);
}

// ── TEST 2e: Morale penalty at low morale ───────────────────────────────────
console.log('\n=== T2e: Низкая мораль снижает боевую силу ===');
setupGS('rome', 'persia');
{
  const goodMorale = makeArmy('rome', { morale: 90 });
  const poorMorale = makeArmy('rome', { morale: 20 });
  const goodStr = calcArmyCombatStrength(goodMorale, 'plains', false);
  const poorStr = calcArmyCombatStrength(poorMorale, 'plains', false);
  console.log(`  good_morale(90)=${goodStr.toFixed(1)} poor_morale(20)=${poorStr.toFixed(1)}`);
  ok('T2e: good morale > poor morale strength', goodStr > poorStr);
}

// ── TEST 2f: Pursuit order set after decisive victory ───────────────────────
console.log('\n=== T2f: Приказ преследования после решительной победы ===');
setupGS('rome', 'persia');
{
  // Need overwhelming advantage to trigger pursuit (margin > 1.5, morale > 55)
  // pursuit_order is set to null when loser.path is empty, so check key existence
  let pursuitCount = 0;
  for (let i = 0; i < 20; i++) {
    const atk = makeArmy('rome', {
      units: { infantry: 15000, cavalry: 2000, mercenaries: 0, artillery: 1000 },
      morale: 85
    });
    const def = makeArmy('persia', {
      units: { infantry: 1000, cavalry: 50, mercenaries: 0, artillery: 0 },
      morale: 50
    });
    resolveArmyBattle(atk, def, 'plains_region');
    // pursuit_order is set to null when loser has empty path — check the key was added
    if ('pursuit_order' in atk) pursuitCount++;
  }
  console.log(`  Pursuit order set ${pursuitCount}/20 times`);
  ok('T2f: pursuit order key set at least some of the time', pursuitCount >= 5);
}

// ── TEST 2g: checkNavalBlockade — no blockade without fleet ────────────────
console.log('\n=== T2g: checkNavalBlockade без вражеского флота ===');
setupGS('rome', 'persia');
{
  GS.armies = [];
  const result = checkNavalBlockade('coastal_region', 'rome');
  console.log(`  isBlockaded=${result.isBlockaded} blockadePower=${result.blockadePower}`);
  ok('T2g: no blockade when no enemy fleet', !result.isBlockaded);
  ok('T2g: blockadePower = 0', result.blockadePower === 0);
}

// ── TEST 2h: checkNavalBlockade — active blockade with fleet ───────────────
console.log('\n=== T2h: checkNavalBlockade с вражеским флотом ===');
setupGS('rome', 'persia');
{
  // Rome must be at war with Persia for blockade to count
  GS.nations.rome.military = { at_war_with: ['persia'] };
  GS.armies = [{
    id: 'persian_fleet', nation: 'persia', type: 'naval', position: 'coastal_region',
    state: 'active',
    ships: { triremes: 6, quinqueremes: 2, light_ships: 0 },
    units: { infantry: 0, cavalry: 0, mercenaries: 0, artillery: 0 },
    morale: 80, supply: 80, fatigue: 10,
  }];
  const result = checkNavalBlockade('coastal_region', 'rome');
  console.log(`  isBlockaded=${result.isBlockaded} blockadePower=${result.blockadePower}`);
  ok('T2h: blockade active with enemy fleet > 5 ships', result.isBlockaded);
  ok('T2h: blockadePower > 0', result.blockadePower > 0);
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════');
console.log(`Combat Engine Tests: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All combat engine tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some combat engine tests FAILED');
  process.exit(1);
}
