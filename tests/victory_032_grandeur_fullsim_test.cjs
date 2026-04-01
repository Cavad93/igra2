'use strict';
// ── VICTORY 032: Grandeur full simulation test ───────────────────────
// Проверяет calcGrandeur по всем 8 компонентам формулы,
// граничные значения и накопление за серию ходов.
// Запуск: node tests/victory_032_grandeur_fullsim_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

function loadCtx(GS) {
  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    document: { getElementById: () => null, createElement: () => ({ style:{} }), body: { appendChild(){} } },
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  return ctx;
}

function makeGS(patch = {}) {
  const n = Object.assign({
    economy: { treasury: 0, income_per_turn: 0, tax_rate: 0.1, stockpile: { wheat: 1000 } },
    military: { infantry: 0, cavalry: 0, ships: 0, at_war_with: [], mercenaries: 0 },
    population: { total: 100000, happiness: 0, by_profession: {} },
    government: { type: 'monarchy', stability: 0, legitimacy: 60, ruler: { name: 'Rex', age: 30 } },
    regions: [], capital_region: 'r0', _bankruptcies: 0,
  }, patch);
  return {
    turn: 10,
    player_nation: 'rome',
    nations: { rome: n },
    achievements: { rome: {} },
    diplomacy: { treaties: [] },
    loans: [],
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Нулевое состояние → grandeur = 0');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS();
  const ctx = loadCtx(GS);
  const g = ctx.calcGrandeur('rome');
  ok('grandeur >= 0 при нулевом состоянии', g >= 0);
  ok('grandeur == 0 при всех нулях', g === 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: Максимальные значения → grandeur = 1000');
// ─────────────────────────────────────────────────────────────
{
  // territory: 20 regions * 10 = 200 (cap 200)
  // wealth: treasury 150000 / 1000 = 150 (cap 150)
  // army: 100000 infantry / 100 = 1000 → cap 100
  // happiness: 100 (cap 100)
  // trade: income 45000 / 300 = 150 (cap 150)
  // stability: 100 (cap 100)
  // diplomacy: 5 alliances * 20 = 100 (cap 100)
  // legacy: 10 achievements * 10 = 100 (cap 100)
  const GS = makeGS({
    economy: { treasury: 150000, income_per_turn: 45000, tax_rate: 0.1, stockpile: {} },
    military: { infantry: 100000, cavalry: 0, at_war_with: [], mercenaries: 0 },
    population: { total: 500000, happiness: 100, by_profession: {} },
    government: { type: 'monarchy', stability: 100, legitimacy: 100, ruler: { name: 'Rex', age: 30 } },
    regions: Array.from({ length: 20 }, (_, i) => `r${i}`),
  });
  // Add 10 achievements
  GS.achievements = { rome: {} };
  for (let i = 0; i < 10; i++) {
    GS.achievements.rome[`ach${i}`] = { turn: 1, name: `A${i}`, icon: '⭐' };
  }
  // Add 5 alliances (not at war)
  GS.diplomacy = {
    treaties: Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`, type: 'alliance', status: 'active',
      parties: ['rome', `nation${i}`],
    })),
  };
  const ctx = loadCtx(GS);
  const g = ctx.calcGrandeur('rome');
  ok('grandeur = 1000 при максимальных значениях', g === 1000);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Каждый компонент вносит правильный вклад');
// ─────────────────────────────────────────────────────────────
{
  // territory: 10 регионов → min(200, 100) = 100
  const GS1 = makeGS({ regions: Array.from({ length: 10 }, (_, i) => `r${i}`) });
  const ctx1 = loadCtx(GS1);
  ok('territory=10 регионов вносит ≤200', ctx1.calcGrandeur('rome') <= 200);

  // wealth: treasury = 75000 → min(150, 75) = 75
  const GS2 = makeGS({ economy: { treasury: 75000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } });
  const ctx2 = loadCtx(GS2);
  const g2 = ctx2.calcGrandeur('rome');
  ok('wealth=75000 → grandeur вклад 75', g2 === 75);

  // happiness cap at 100
  const GS3 = makeGS({ population: { total: 100000, happiness: 150, by_profession: {} } });
  const ctx3 = loadCtx(GS3);
  ok('happiness cap при 150 → 100', ctx3.calcGrandeur('rome') === 100);

  // stability cap at 100
  const GS4 = makeGS({ government: { type: 'monarchy', stability: 200, legitimacy: 60, ruler: { name: 'Rex', age: 30 } } });
  const ctx4 = loadCtx(GS4);
  ok('stability cap при 200 → 100', ctx4.calcGrandeur('rome') === 100);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Война отключает diplomacy-вклад');
// ─────────────────────────────────────────────────────────────
{
  const GS = makeGS({
    military: { infantry: 0, cavalry: 0, at_war_with: ['carthage'], mercenaries: 0 },
    government: { type: 'monarchy', stability: 0, legitimacy: 60, ruler: { name: 'Rex', age: 30 } },
  });
  GS.diplomacy = {
    treaties: [{ id: 't1', type: 'alliance', status: 'active', parties: ['rome', 'macedon'] }],
  };
  const ctx = loadCtx(GS);
  const g = ctx.calcGrandeur('rome');
  // Во время войны diplomacy-компонент = 0
  ok('Diplomacy вклад = 0 во время войны', g === 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: Рост grandeur при накоплении ресурсов');
// ─────────────────────────────────────────────────────────────
{
  const steps = [
    { treasury: 10000, income: 3000, expected_min: 10 },
    { treasury: 50000, income: 15000, expected_min: 50 },
    { treasury: 100000, income: 30000, expected_min: 100 },
    { treasury: 150000, income: 45000, expected_min: 150 },
  ];
  for (const s of steps) {
    const GS = makeGS({
      economy: { treasury: s.treasury, income_per_turn: s.income, tax_rate: 0.1, stockpile: {} },
    });
    const ctx = loadCtx(GS);
    const g = ctx.calcGrandeur('rome');
    ok(`grandeur >= ${s.expected_min} при treasury=${s.treasury}`, g >= s.expected_min);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: calcGrandeur всегда в диапазоне [0, 1000]');
// ─────────────────────────────────────────────────────────────
{
  const cases = [
    makeGS(),
    makeGS({ economy: { treasury: -999999, income_per_turn: -10000, tax_rate: 0, stockpile: {} } }),
    makeGS({ population: { total: 0, happiness: -50, by_profession: {} } }),
    makeGS({ government: { type: 'monarchy', stability: -100, legitimacy: 0, ruler: { name: 'Rex', age: 30 } } }),
    makeGS({ regions: Array.from({ length: 1000 }, (_, i) => `r${i}`) }),
  ];
  for (let i = 0; i < cases.length; i++) {
    const ctx = loadCtx(cases[i]);
    const g = ctx.calcGrandeur('rome');
    ok(`Случай ${i+1}: grandeur в [0,1000] (${g})`, g >= 0 && g <= 1000);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: army вклад (infantry + cavalry*3) / 100');
// ─────────────────────────────────────────────────────────────
{
  // infantry=5000 → 5000/100=50; cavalry=1000 → 3000/100=30 → total 80 (cap 100)
  const GS = makeGS({
    military: { infantry: 5000, cavalry: 1000, at_war_with: [], mercenaries: 0 },
  });
  const ctx = loadCtx(GS);
  const g = ctx.calcGrandeur('rome');
  ok('army вклад 80 при infantry=5000 cavalry=1000', g === 80);
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
console.log('\n' + '═'.repeat(60));
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
