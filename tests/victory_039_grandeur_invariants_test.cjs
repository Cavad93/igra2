'use strict';
// ── VICTORY 039: Grandeur formula invariants ──────────────────────────
// Проверяет математические свойства calcGrandeur:
//   1. Результат всегда в [0, 1000]
//   2. Монотонность: увеличение любого компонента не уменьшает grandeur
//   3. Клэмпинг каждого компонента
//   4. Устойчивость к NaN/Infinity
//   5. atWar=true → diplomacy component = 0
//   6. Нет alliance → diplomacy component = 0
//   7. Legacy = achievementCount * 10 (clamped)
//   8. Формула соответствует спецификации
// Запуск: node tests/victory_039_grandeur_invariants_test.cjs

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n📋 ${name}`); }

const domStub = {
  getElementById: () => null,
  createElement: () => ({ id:'', className:'', innerHTML:'', style:{}, remove(){}, appendChild(){} }),
  body: { appendChild(){} },
};

function load(gs) {
  const ctx = vm.createContext({
    GAME_STATE: gs,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'engine/achievements.js'), 'utf8'), ctx);
  return ctx;
}

function baseGS(patch = {}) {
  const n = Object.assign({
    economy: { treasury: 0, income_per_turn: 0, stockpile: {} },
    military: { infantry: 0, cavalry: 0, at_war_with: [] },
    population: { total: 0, happiness: 0, by_profession: {} },
    government: { type: 'monarchy', stability: 0, legitimacy: 50, ruler: { name:'X', age:30 } },
    regions: [],
  }, patch.rome ?? {});
  return {
    turn: 1,
    player_nation: 'rome',
    nations: { rome: n },
    diplomacy: { treaties: patch.treaties ?? [] },
    loans: [],
    achievements: patch.achievements ?? { rome: {} },
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Базовые границы [0, 1000]');
// ─────────────────────────────────────────────────────────────
{
  const ctx = load(baseGS());
  ok('Минимальная нация → grandeur = 0',   ctx.calcGrandeur('rome') === 0);

  const maxGS = baseGS({
    rome: {
      economy: { treasury: 999999999, income_per_turn: 999999999 },
      military: { infantry: 999999999, cavalry: 999999999, at_war_with: [] },
      population: { total: 99999, happiness: 999999 },
      government: { type:'monarchy', stability: 999999, legitimacy: 999 },
      regions: new Array(1000).fill('r'),
    },
    treaties: [
      { status:'active', type:'alliance', parties:['rome','a'] },
      { status:'active', type:'alliance', parties:['rome','b'] },
      { status:'active', type:'alliance', parties:['rome','c'] },
      { status:'active', type:'alliance', parties:['rome','d'] },
      { status:'active', type:'alliance', parties:['rome','e'] },
      { status:'active', type:'alliance', parties:['rome','f'] },
    ],
  });
  const ctxMax = load(maxGS);
  // Насаждаем 200 достижений (но clamp на 10*N = 100)
  maxGS.achievements = { rome: {} };
  for (let i = 0; i < 200; i++) maxGS.achievements.rome['a'+i] = { turn: 1, name:'a', icon:'x' };
  const g = ctxMax.calcGrandeur('rome');
  ok('Максимальная нация → grandeur <= 1000', g <= 1000);
  ok('Максимальная нация → grandeur = 1000', g === 1000);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: Монотонность по территории');
// ─────────────────────────────────────────────────────────────
{
  const gs = baseGS({ rome: { regions: [] } });
  const ctx = load(gs);
  let prev = ctx.calcGrandeur('rome');
  for (let i = 1; i <= 25; i++) {
    gs.nations.rome.regions.push('r'+i);
    const cur = ctx.calcGrandeur('rome');
    if (cur < prev) { ok(`territory +1 снизил grandeur (${prev}→${cur})`, false); break; }
    prev = cur;
  }
  ok('Монотонно возрастает по регионам',   prev > 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Каждый компонент clamped');
// ─────────────────────────────────────────────────────────────
{
  // Только территория (до 200)
  {
    const gs = baseGS({ rome: { regions: new Array(100).fill('r') } });
    const ctx = load(gs);
    ok('200 регионов → 200 territory clamp', ctx.calcGrandeur('rome') === 200);
  }
  // Только казна (до 150)
  {
    const gs = baseGS({ rome: { economy: { treasury: 500000, income_per_turn: 0 } } });
    const ctx = load(gs);
    ok('treasury 500k → 150 wealth clamp',   ctx.calcGrandeur('rome') === 150);
  }
  // Только happiness (до 100)
  {
    const gs = baseGS({ rome: { population: { total: 0, happiness: 500 } } });
    const ctx = load(gs);
    ok('happiness 500 → 100 clamp',          ctx.calcGrandeur('rome') === 100);
  }
  // Только stability (до 100)
  {
    const gs = baseGS({ rome: { government: { type:'monarchy', stability: 500, ruler:{name:'X',age:30} } } });
    const ctx = load(gs);
    ok('stability 500 → 100 clamp',          ctx.calcGrandeur('rome') === 100);
  }
  // Только trade (до 150)
  {
    const gs = baseGS({ rome: { economy: { treasury: 0, income_per_turn: 1000000 } } });
    const ctx = load(gs);
    ok('income 1M → 150 trade clamp',        ctx.calcGrandeur('rome') === 150);
  }
  // Только army (до 100)
  {
    const gs = baseGS({ rome: { military: { infantry: 1000000, cavalry: 0, at_war_with:[] } } });
    const ctx = load(gs);
    ok('1M infantry → 100 army clamp',       ctx.calcGrandeur('rome') === 100);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Дипломатия = 0 при войне');
// ─────────────────────────────────────────────────────────────
{
  const treaties = [
    { status:'active', type:'alliance', parties:['rome','a'] },
    { status:'active', type:'alliance', parties:['rome','b'] },
  ];
  // Без войны
  {
    const gs = baseGS({ rome: { military: { at_war_with: [] } }, treaties });
    const ctx = load(gs);
    ok('Без войны: diplomacy = 40 (2 alliance * 20)',
      ctx.calcGrandeur('rome') === 40);
  }
  // С войной
  {
    const gs = baseGS({ rome: { military: { infantry: 0, cavalry: 0, at_war_with: ['enemy'] } }, treaties });
    const ctx = load(gs);
    ok('С войной: diplomacy = 0',            ctx.calcGrandeur('rome') === 0);
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: NaN/Infinity / missing fields не ломают');
// ─────────────────────────────────────────────────────────────
{
  const cases = [
    { rome: { economy: { treasury: NaN } } },
    { rome: { economy: { treasury: Infinity } } },
    { rome: { economy: { treasury: -Infinity } } },
    { rome: { economy: { income_per_turn: NaN } } },
    { rome: { military: { infantry: NaN, cavalry: NaN } } },
    { rome: { population: { happiness: NaN } } },
    { rome: { government: { stability: NaN, type:'monarchy', ruler:{name:'X',age:30} } } },
    { rome: { regions: null } },
    { rome: { economy: null } },
    { rome: { military: null } },
    { rome: { population: null } },
    { rome: { government: null } },
  ];
  for (let i = 0; i < cases.length; i++) {
    const gs = baseGS(cases[i]);
    const ctx = load(gs);
    let g;
    try { g = ctx.calcGrandeur('rome'); } catch (e) { g = -1; }
    if (typeof g !== 'number' || !isFinite(g) || g < 0 || g > 1000) {
      ok(`case ${i}: grandeur в границах`, false);
    } else {
      ok(`case ${i}: grandeur=${g} в границах`, true);
    }
  }
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Неизвестная нация → 0');
// ─────────────────────────────────────────────────────────────
{
  const ctx = load(baseGS());
  ok('calcGrandeur(ghost) === 0',          ctx.calcGrandeur('ghost') === 0);
  ok('calcGrandeur(null) === 0',           ctx.calcGrandeur(null) === 0);
  ok('calcGrandeur(undefined) === 0',      ctx.calcGrandeur(undefined) === 0);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: Legacy компонент = min(100, count*10)');
// ─────────────────────────────────────────────────────────────
{
  const gs = baseGS();
  gs.achievements = { rome: {} };
  for (let i = 0; i < 5; i++) gs.achievements.rome['a'+i] = { turn:1, name:'n', icon:'x' };
  const ctx = load(gs);
  ok('5 достижений → legacy = 50 в сумме', ctx.calcGrandeur('rome') === 50);

  for (let i = 5; i < 15; i++) gs.achievements.rome['a'+i] = { turn:1, name:'n', icon:'x' };
  const ctx2 = load(gs);
  ok('15 достижений → legacy clamp 100',   ctx2.calcGrandeur('rome') === 100);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 8: Формула точно соответствует спеке');
// ─────────────────────────────────────────────────────────────
{
  // territory 5*10=50 + wealth 20000/1000=20 + army (1000+50*3)/100 = 11.5→11 (но Math.min) +
  // happiness 70 + trade 600/300=2 + stability 80 + diplomacy 0 + legacy 0
  // = 50 + 20 + 11.5 + 70 + 2 + 80 + 0 + 0 = 233.5 → round = 234
  const gs = baseGS({
    rome: {
      economy: { treasury: 20000, income_per_turn: 600 },
      military: { infantry: 1000, cavalry: 50, at_war_with: [] },
      population: { total: 10, happiness: 70 },
      government: { type:'monarchy', stability: 80, ruler:{name:'X',age:30} },
      regions: ['r1','r2','r3','r4','r5'],
    },
  });
  const ctx = load(gs);
  const g = ctx.calcGrandeur('rome');
  // expected components:
  //   territory = min(200, 5*10) = 50
  //   wealth    = min(150, 20000/1000) = 20
  //   army      = min(100, (1000 + 50*3)/100) = min(100, 11.5) = 11.5
  //   happiness = min(100, 70) = 70
  //   trade     = min(150, 600/300) = 2
  //   stability = min(100, 80) = 80
  //   diplomacy = 0 (no treaties)
  //   legacy    = 0
  // total = 233.5 → round = 234
  ok(`Формула даёт 234 (получено ${g})`,   g === 234);
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
// ─────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed+failed}`);
console.log(`════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
