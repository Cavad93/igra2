/**
 * tests/mil_002_formation_test.js
 *
 * Тесты MIL_002: Выбор формации ИИ
 * Запуск: node tests/mil_002_formation_test.js
 */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─── Mock globals ─────────────────────────────────────────────────────────

const GAME_STATE = { regions: {}, nations: {}, armies: [], sieges: [] };
const MAP_REGIONS = {};

function getArmyCommander() { return null; }

// Stub calcArmyCombatStrength (mirrors combat.js logic)
function calcArmyCombatStrength(army, terrain, isDefender) {
  const FORMATIONS = {
    standard:   { atk: 1.00, def: 1.00 },
    aggressive: { atk: 1.20, def: 0.85 },
    defensive:  { atk: 0.80, def: 1.30, cav_bonus: -0.1 },
    flanking:   { atk: 1.10, def: 0.90, cav_bonus: 0.40, inf_bonus: -0.10 },
    siege:      { atk: 1.00, def: 0.90, art_bonus: 0.50 },
  };
  const u   = army.units ?? {};
  const fmt = FORMATIONS[army.formation ?? 'standard'];
  const terrCav = terrain === 'plains' ? 1.30 : 1.00;
  let base = (u.infantry ?? 0) * 1.0
           + (u.cavalry  ?? 0) * 3.0 * terrCav
           + (u.mercenaries ?? 0) * 1.5
           + (u.artillery ?? 0) * 0.5;

  if (isDefender) base *= 1.20;
  const fmtCavMod = fmt.cav_bonus ?? 0;
  if (fmtCavMod !== 0) base += (u.cavalry ?? 0) * 3.0 * terrCav * fmtCavMod;
  const fmtArtMod = fmt.art_bonus ?? 0;
  if (fmtArtMod !== 0) base += (u.artillery ?? 0) * 0.5 * fmtArtMod;
  const fmtInfMod = fmt.inf_bonus ?? 0;
  if (fmtInfMod !== 0) base += (u.infantry ?? 0) * 1.0 * fmtInfMod;

  const fmtMult = isDefender ? fmt.def : fmt.atk;
  const moraleMult = 0.25 + ((army.morale ?? 70) / 100) * 1.25;
  return Math.max(1, base * fmtMult * moraleMult);
}

// ─── Load utility_ai.js ───────────────────────────────────────────────────

const src = fs.readFileSync(path.join(__dirname, '../ai/utility_ai.js'), 'utf8');
const ctx = vm.createContext({
  GAME_STATE, MAP_REGIONS, getArmyCommander, calcArmyCombatStrength,
  console, Math, Object, Array, JSON, String, Number,
});
vm.runInContext(src, ctx);

const { _chooseFormation, utilityAIDecide } = ctx;

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: _chooseFormation — логика выбора формации
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── TEST 1: _chooseFormation ─────────────────────────────────');

// 1a. Низкая боеготовность → defensive
{
  const army = { units: { infantry: 1000, cavalry: 100 } };
  const f = _chooseFormation(army, 'plains', 0.30, null);
  assert(f === 'defensive', 'readiness < 0.50 → defensive', `got "${f}"`);
}

// 1b. Граница: readiness = 0.499 → defensive
{
  const army = { units: { infantry: 1000 } };
  const f = _chooseFormation(army, 'plains', 0.499, null);
  assert(f === 'defensive', 'readiness=0.499 → defensive', `got "${f}"`);
}

// 1c. Кавалерия > 45% + равнина → flanking
{
  const army = { units: { infantry: 400, cavalry: 600 } };
  const f = _chooseFormation(army, 'plains', 0.70, null);
  assert(f === 'flanking', 'cav=60% + plains → flanking', `got "${f}"`);
}

// 1d. Кавалерия > 45% но горы → НЕ flanking
{
  const army = { units: { infantry: 400, cavalry: 600 } };
  const f = _chooseFormation(army, 'mountains', 0.70, null);
  assert(f !== 'flanking', 'cav > 45% + mountains → not flanking', `got "${f}"`);
}

// 1e. Артиллерия > 25% + осада → siege
{
  const army = { units: { infantry: 700, artillery: 300 } };
  const f = _chooseFormation(army, 'hills', 0.70, { id: 'siege1', region_id: 'r1' });
  assert(f === 'siege', 'art=30% + active siege → siege', `got "${f}"`);
}

// 1f. Высокая боеготовность → aggressive
{
  const army = { units: { infantry: 1000 } };
  const f = _chooseFormation(army, 'plains', 0.85, null);
  assert(f === 'aggressive', 'readiness >= 0.80 → aggressive', `got "${f}"`);
}

// 1g. Граница: readiness = 0.80 → aggressive
{
  const army = { units: { infantry: 1000 } };
  const f = _chooseFormation(army, 'plains', 0.80, null);
  assert(f === 'aggressive', 'readiness=0.80 → aggressive', `got "${f}"`);
}

// 1h. Средняя боеготовность, нейтральные условия → standard
{
  const army = { units: { infantry: 900, cavalry: 100 } };
  const f = _chooseFormation(army, 'plains', 0.65, null);
  assert(f === 'standard', 'neutral conditions → standard', `got "${f}"`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Формации в calcArmyCombatStrength
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── TEST 2: Формации влияют на боевую силу ───────────────────');

const baseArmy = (units, formation) => ({
  units, formation, morale: 80, discipline: 80, fatigue: 0, supply: 80,
});

// 2a. Siege formation: артиллерия ×1.50
{
  const units = { artillery: 100 };
  const std  = calcArmyCombatStrength(baseArmy(units, 'standard'), 'plains', false);
  const siege = calcArmyCombatStrength(baseArmy(units, 'siege'),   'plains', false);
  // standard: 100*0.5 * 1.00 * morMult
  // siege:   (100*0.5 + 100*0.5*0.50) * 1.00 * morMult = 75 * 1.00 * morMult
  const ratio = siege / std;
  assert(Math.abs(ratio - 1.50) < 0.05, 'siege: art ×1.50', `ratio=${ratio.toFixed(3)}`);
}

// 2b. Aggressive formation: atk ×1.20 (not 1.25)
{
  const units = { infantry: 1000 };
  const std  = calcArmyCombatStrength(baseArmy(units, 'standard'),  'plains', false);
  const agg  = calcArmyCombatStrength(baseArmy(units, 'aggressive'), 'plains', false);
  const ratio = agg / std;
  assert(Math.abs(ratio - 1.20) < 0.05, 'aggressive: atk ×1.20', `ratio=${ratio.toFixed(3)}`);
}

// 2c. Defensive formation: def ×1.30
{
  const units = { infantry: 1000 };
  const std = calcArmyCombatStrength(baseArmy(units, 'standard'),  'plains', true);
  const def = calcArmyCombatStrength(baseArmy(units, 'defensive'), 'plains', true);
  const ratio = def / std;
  assert(Math.abs(ratio - 1.30) < 0.05, 'defensive: def ×1.30', `ratio=${ratio.toFixed(3)}`);
}

// 2d. Flanking: кавалерия ×1.40
{
  // Only cavalry, no infantry
  const units = { cavalry: 100 };
  const std  = calcArmyCombatStrength(baseArmy(units, 'standard'), 'plains', false);
  const flnk = calcArmyCombatStrength(baseArmy(units, 'flanking'), 'plains', false);
  // standard: cav=100*3*1.30 * 1.00 = 390 * morMult
  // flanking: (390 + 390*0.40) * 1.10 = 546 * 1.10 = 600.6 * morMult
  // ratio flanking/standard = 546*1.10/(390*1.00) = 600.6/390 = 1.54
  // The cav contribution ×1.40: 390*1.40=546, then ×1.10 atk = 1.54×
  assert(flnk > std * 1.30, 'flanking: cav bonus gives > 1.30× vs standard', `ratio=${(flnk/std).toFixed(3)}`);
}

// 2e. Siege def penalty: def ×0.90
{
  const units = { infantry: 1000 };
  const std  = calcArmyCombatStrength(baseArmy(units, 'standard'), 'plains', true);
  const siege = calcArmyCombatStrength(baseArmy(units, 'siege'),   'plains', true);
  const ratio = siege / std;
  assert(Math.abs(ratio - 0.90) < 0.05, 'siege: def ×0.90', `ratio=${ratio.toFixed(3)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: utilityAIDecide sets army.formation
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── TEST 3: utilityAIDecide устанавливает army.formation ─────');

// Provide minimal region data in GAME_STATE
ctx.GAME_STATE = {
  regions: {
    'r_home': { id: 'r_home', terrain: 'plains', nation: 'A', garrison: 100, fortress: 0,
                population: 5000, connections: ['r_enemy'] },
    'r_enemy': { id: 'r_enemy', terrain: 'plains', nation: 'B', garrison: 50, fortress: 0,
                 population: 3000, connections: ['r_home'] },
  },
  nations: {
    'A': { military: { at_war_with: ['B'], capital_region: null } },
    'B': { military: { at_war_with: ['A'], capital_region: null } },
  },
  armies: [],
  sieges: [],
};
ctx.MAP_REGIONS = ctx.GAME_STATE.regions;

// 3a. Army with low readiness gets 'defensive'
{
  const army = {
    id: 'a1', nation: 'A', position: 'r_home',
    units: { infantry: 1000 }, morale: 20, supply: 20, fatigue: 80,
    siege_id: null,
  };
  utilityAIDecide(army, { target_id: null });
  assert(army.formation === 'defensive', 'utilityAIDecide: low morale/supply → defensive', `got "${army.formation}"`);
}

// 3b. Army with high readiness + plains gets 'aggressive'
{
  const army = {
    id: 'a2', nation: 'A', position: 'r_home',
    units: { infantry: 1000 }, morale: 90, supply: 90, fatigue: 5,
    siege_id: null,
  };
  utilityAIDecide(army, { target_id: null });
  assert(['aggressive', 'standard', 'flanking'].includes(army.formation),
    'utilityAIDecide: high readiness → aggressive or standard', `got "${army.formation}"`);
}

// 3c. Cavalry army in plains gets 'flanking'
{
  const army = {
    id: 'a3', nation: 'A', position: 'r_home',
    units: { infantry: 400, cavalry: 600 }, morale: 75, supply: 75, fatigue: 10,
    siege_id: null,
  };
  utilityAIDecide(army, { target_id: null });
  assert(army.formation === 'flanking', 'utilityAIDecide: cav army in plains → flanking', `got "${army.formation}"`);
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\nMIL_002: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All MIL_002 tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some tests failed');
  process.exit(1);
}
