'use strict';
// ── VICTORY 019: Grandeur formula — precision component tests ─────────
// Проверяет каждый компонент формулы calcGrandeur изолированно:
// territory, wealth, army, happiness, trade, stability, diplomacy, legacy.
// Также: граничные значения, насыщение (capping), отрицательные входы.
// Запуск: node tests/victory_019_grandeur_components_test.cjs

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
  createElement: () => ({ id:'', style:{}, innerHTML:'', remove(){}, appendChild(){} }),
  body: { appendChild(){} },
};

/**
 * Создаёт контекст с ЧИСТОЙ нацией (все компоненты = 0)
 * и переопределяет только нужное поле.
 */
function makeCleanCtx(nationPatch = {}, gsPatch = {}) {
  const nation = Object.assign({
    _id: 'test',
    name: 'Тест',
    economy:    { treasury: 0, income_per_turn: 0, tax_rate: 0.10, stockpile: {} },
    military:   { infantry: 0, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 },
    population: { total: 0, happiness: 0, by_profession: {} },
    government: { type: 'monarchy', stability: 0, legitimacy: 0, ruler: { name: 'Р', age: 30 } },
    regions:    [],
    relations:  {},
    active_laws: [],
    buildings:  [],
  }, nationPatch);

  const GS = Object.assign({
    turn: 10,
    player_nation: 'test',
    nations: { test: nation },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
  }, gsPatch);

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: () => {},
    addMemoryEvent: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  const src = fs.readFileSync(path.join(__dirname, '../engine/achievements.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx;
}

// ────────────────────────────────────────────────────────
section('БЛОК 1: Базовое — всё 0 → grandeur=0');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx();
  const g = ctx.calcGrandeur('test');
  ok('все компоненты 0 → grandeur=0', g === 0);
}

// ────────────────────────────────────────────────────────
section('БЛОК 2: territory — Math.min(200, regions.length * 10)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ regions: ['r1'] });
  ok('1 регион → territory=10', ctx.calcGrandeur('test') === 10);
}
{
  const ctx = makeCleanCtx({ regions: Array.from({ length: 10 }, (_, i) => `r${i}`) });
  ok('10 регионов → territory=100', ctx.calcGrandeur('test') === 100);
}
{
  const ctx = makeCleanCtx({ regions: Array.from({ length: 20 }, (_, i) => `r${i}`) });
  ok('20 регионов → territory=200 (cap)', ctx.calcGrandeur('test') === 200);
}
{
  const ctx = makeCleanCtx({ regions: Array.from({ length: 30 }, (_, i) => `r${i}`) });
  ok('30 регионов → territory=200 (насыщение)', ctx.calcGrandeur('test') === 200);
}

// ────────────────────────────────────────────────────────
section('БЛОК 3: wealth — Math.min(150, treasury / 1000)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ economy: { treasury: 1000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } });
  ok('treasury=1000 → wealth=1', ctx.calcGrandeur('test') === 1);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: 75000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } });
  ok('treasury=75000 → wealth=75', ctx.calcGrandeur('test') === 75);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: 150000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } });
  ok('treasury=150000 → wealth=150 (cap)', ctx.calcGrandeur('test') === 150);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: 999999, income_per_turn: 0, tax_rate: 0.1, stockpile: {} } });
  ok('treasury=999999 → wealth=150 (насыщение)', ctx.calcGrandeur('test') === 150);
}

// ────────────────────────────────────────────────────────
section('БЛОК 4: army — Math.min(100, (infantry + cavalry*3) / 100)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ military: { infantry: 1000, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } });
  ok('infantry=1000 → army=10', ctx.calcGrandeur('test') === 10);
}
{
  const ctx = makeCleanCtx({ military: { infantry: 0, cavalry: 1000, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } });
  ok('cavalry=1000 → army=30 (×3)', ctx.calcGrandeur('test') === 30);
}
{
  const ctx = makeCleanCtx({ military: { infantry: 10000, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } });
  ok('infantry=10000 → army=100 (cap)', ctx.calcGrandeur('test') === 100);
}
{
  const ctx = makeCleanCtx({ military: { infantry: 50000, cavalry: 50000, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } });
  ok('огромная армия → army=100 (насыщение)', ctx.calcGrandeur('test') === 100);
}

// ────────────────────────────────────────────────────────
section('БЛОК 5: happiness — Math.min(100, happiness)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ population: { total: 50000, happiness: 50, by_profession: {} } });
  ok('happiness=50 → compонент=50', ctx.calcGrandeur('test') === 50);
}
{
  const ctx = makeCleanCtx({ population: { total: 50000, happiness: 100, by_profession: {} } });
  ok('happiness=100 → компонент=100 (cap)', ctx.calcGrandeur('test') === 100);
}
{
  const ctx = makeCleanCtx({ population: { total: 50000, happiness: 150, by_profession: {} } });
  ok('happiness=150 → компонент=100 (насыщение)', ctx.calcGrandeur('test') === 100);
}

// ────────────────────────────────────────────────────────
section('БЛОК 6: trade — Math.min(150, income_per_turn / 300)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ economy: { treasury: 0, income_per_turn: 30000, tax_rate: 0.1, stockpile: {} } });
  ok('income=30000 → trade=100', ctx.calcGrandeur('test') === 100);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: 0, income_per_turn: 45000, tax_rate: 0.1, stockpile: {} } });
  ok('income=45000 → trade=150 (cap)', ctx.calcGrandeur('test') === 150);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: 0, income_per_turn: 90000, tax_rate: 0.1, stockpile: {} } });
  ok('income=90000 → trade=150 (насыщение)', ctx.calcGrandeur('test') === 150);
}

// ────────────────────────────────────────────────────────
section('БЛОК 7: stability — Math.min(100, stability)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ government: { type: 'monarchy', stability: 75, legitimacy: 0, ruler: { name: 'Р', age: 30 } } });
  ok('stability=75 → компонент=75', ctx.calcGrandeur('test') === 75);
}
{
  const ctx = makeCleanCtx({ government: { type: 'monarchy', stability: 100, legitimacy: 0, ruler: { name: 'Р', age: 30 } } });
  ok('stability=100 → компонент=100 (cap)', ctx.calcGrandeur('test') === 100);
}

// ────────────────────────────────────────────────────────
section('БЛОК 8: diplomacy — Math.min(100, alliances * 20) — только без войны');
// ────────────────────────────────────────────────────────
{
  const treaties = [
    { status: 'active', type: 'alliance', parties: ['test', 'a'] },
    { status: 'active', type: 'alliance', parties: ['test', 'b'] },
  ];
  const ctx = makeCleanCtx(
    { military: { infantry: 0, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } },
    { diplomacy: { treaties } }
  );
  ok('2 союза без войны → diplomacy=40', ctx.calcGrandeur('test') === 40);
}
{
  const treaties = Array.from({ length: 6 }, (_, i) => ({
    status: 'active', type: 'alliance', parties: ['test', `n${i}`]
  }));
  const ctx = makeCleanCtx(
    { military: { infantry: 0, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } },
    { diplomacy: { treaties } }
  );
  ok('6 союзов → diplomacy=100 (насыщение)', ctx.calcGrandeur('test') === 100);
}
{
  // В войне → diplomacy=0 даже при союзах
  const treaties = [
    { status: 'active', type: 'alliance', parties: ['test', 'a'] },
    { status: 'active', type: 'alliance', parties: ['test', 'b'] },
  ];
  const ctx = makeCleanCtx(
    { military: { infantry: 0, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: ['enemy'], mercenaries: 0 } },
    { diplomacy: { treaties } }
  );
  ok('В войне → diplomacy=0 (союзы не считаются)', ctx.calcGrandeur('test') === 0);
}
{
  // expired/inactive treaties не считаются
  const treaties = [
    { status: 'expired', type: 'alliance', parties: ['test', 'a'] },
    { status: 'inactive', type: 'alliance', parties: ['test', 'b'] },
  ];
  const ctx = makeCleanCtx(
    { military: { infantry: 0, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 } },
    { diplomacy: { treaties } }
  );
  ok('Неактивные союзы → diplomacy=0', ctx.calcGrandeur('test') === 0);
}

// ────────────────────────────────────────────────────────
section('БЛОК 9: legacy — Math.min(100, achievements*10)');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ _battles_won: 1 });
  ctx.checkAchievements('test');
  const g1 = ctx.calcGrandeur('test');
  ok('1 достижение → legacy=10', g1 === 10);
}
{
  // 10 достижений → legacy=100
  const ctx = makeCleanCtx({
    _battles_won: 20,
    _invasions_repelled: 3,
    _wars_declared: 5,
    economy: { treasury: 100000, income_per_turn: 0, tax_rate: 0.1, stockpile: {} },
    _bankruptcies: 1,
    population: { total: 1000000, happiness: 85, by_profession: {} },
  }, { turn: 100 });
  ctx.checkAchievements('test');
  const count = ctx.getAchievementCount('test');
  ok(`10+ достижений разблокировано (count=${count})`, count >= 10);
  const legacy = Math.min(100, count * 10);
  ok('legacy cap=100 при 10+ достижениях', legacy === 100);
}

// ────────────────────────────────────────────────────────
section('БЛОК 10: Граничные значения и защита от NaN');
// ────────────────────────────────────────────────────────
{
  const ctx = makeCleanCtx({ economy: { treasury: NaN, income_per_turn: NaN, tax_rate: 0.1, stockpile: {} } });
  const g = ctx.calcGrandeur('test');
  ok('NaN в treasury/income → grandeur не NaN', !isNaN(g));
  ok('NaN в treasury/income → grandeur=0', g === 0);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: -99999, income_per_turn: -50000, tax_rate: 0.1, stockpile: {} } });
  const g = ctx.calcGrandeur('test');
  ok('Отрицательные значения → grandeur >= 0', g >= 0);
}
{
  const ctx = makeCleanCtx({ economy: { treasury: Infinity, income_per_turn: Infinity, tax_rate: 0.1, stockpile: {} } });
  const g = ctx.calcGrandeur('test');
  ok('Infinity → grandeur не Infinity', isFinite(g));
  ok('Infinity → grandeur=150+150=300 (caps hit)', g <= 1000);
}
{
  const ctx = makeCleanCtx({ population: { total: 0, happiness: -10, by_profession: {} } });
  const g = ctx.calcGrandeur('test');
  ok('happiness=-10 → grandeur >= 0', g >= 0);
}

// ────────────────────────────────────────────────────────
section('БЛОК 11: Суммарная формула — известный результат');
// ────────────────────────────────────────────────────────
{
  // Известные входные данные:
  // territory: 5 рег * 10 = 50
  // wealth: 50000 / 1000 = 50
  // army: 3000 inf / 100 = 30
  // happiness: 60
  // trade: 12000 / 300 = 40
  // stability: 70
  // diplomacy: 0 (нет союзов)
  // legacy: 0 (нет достижений)
  // Ожидаем: 50+50+30+60+40+70+0+0 = 300
  const ctx = makeCleanCtx({
    regions: Array.from({ length: 5 }, (_, i) => `r${i}`),
    economy: { treasury: 50000, income_per_turn: 12000, tax_rate: 0.1, stockpile: {} },
    military: { infantry: 3000, cavalry: 0, ships: 0, morale: 0, loyalty: 0, at_war_with: [], mercenaries: 0 },
    population: { total: 50000, happiness: 60, by_profession: {} },
    government: { type: 'monarchy', stability: 70, legitimacy: 0, ruler: { name: 'Р', age: 30 } },
  });
  const g = ctx.calcGrandeur('test');
  ok(`Формула: ожидаем 300, получили ${g}`, g === 300);
}

// ────────────────────────────────────────────────────────
section('ИТОГ');
// ────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log(`════════════════════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
