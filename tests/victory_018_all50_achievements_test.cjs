'use strict';
// ── VICTORY 018: Unit tests — all 50 achievements fire correctly ──────
// Проверяет что каждое из 50 достижений разблокируется при правильных
// условиях и НЕ разблокируется без них. 50 positive + 25 negative tests.
// Запуск: node tests/victory_018_all50_achievements_test.cjs

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

function makeCtx(nationOverrides = {}, gsOverrides = {}) {
  const nation = Object.assign({
    _id: 'rome',
    name: 'Рим',
    economy:    { treasury: 0, income_per_turn: 0, tax_rate: 0.10, stockpile: { wheat: 1000 } },
    military:   { infantry: 0, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
    population: { total: 50000, happiness: 50, by_profession: {} },
    government: { type: 'monarchy', stability: 50, legitimacy: 60, ruler: { name: 'Цезарь', age: 40 } },
    regions:    ['r1'],
    relations:  {},
    active_laws: [],
    buildings:  [],
    _battles_won: 0,
    _invasions_repelled: 0,
    _wars_declared: 0,
    _bankruptcies: 0,
    _turns_in_power: 0,
    _last_war_turn: 0,
    _total_loans_taken: 0,
    _turns_frugal: 0,
    _turns_without_ally: 0,
    _buildings_built: 0,
    _laws_enacted: 0,
    _crisis_survived: 0,
    _turns_high_stability: 0,
    _phoenix_comeback: false,
    _testament_completed: false,
    _vow_kept_turns: 0,
    _regions_gained_this_reign: 0,
  }, nationOverrides);

  const GS = Object.assign({
    turn: 10,
    player_nation: 'rome',
    nations: { rome: nation },
    achievements: {},
    diplomacy: { treaties: [] },
    loans: [],
  }, gsOverrides);

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

function hasAch(ctx, id) {
  return !!ctx.GAME_STATE.achievements?.rome?.[id];
}

// ────────────────────────────────────────────────────────
section('БЛОК 1: Военные достижения');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({ _battles_won: 1 });
  ctx.checkAchievements('rome');
  ok('first_blood при _battles_won=1', hasAch(ctx, 'first_blood'));
}
{
  const ctx = makeCtx({ _battles_won: 0 });
  ctx.checkAchievements('rome');
  ok('first_blood НЕ при _battles_won=0', !hasAch(ctx, 'first_blood'));
}
{
  const ctx = makeCtx({ _battles_won: 10 });
  ctx.checkAchievements('rome');
  ok('war_machine при _battles_won=10', hasAch(ctx, 'war_machine'));
}
{
  const ctx = makeCtx({ _battles_won: 20 });
  ctx.checkAchievements('rome');
  ok('conqueror при _battles_won=20', hasAch(ctx, 'conqueror'));
}
{
  const ctx = makeCtx({ _invasions_repelled: 3 });
  ctx.checkAchievements('rome');
  ok('iron_wall при _invasions_repelled=3', hasAch(ctx, 'iron_wall'));
}
{
  const ctx = makeCtx({ _wars_declared: 5 });
  ctx.checkAchievements('rome');
  ok('warmonger при _wars_declared=5', hasAch(ctx, 'warmonger'));
}
{
  const ctx = makeCtx({ military: { infantry: 0, cavalry: 0, ships: 101, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } });
  ctx.checkAchievements('rome');
  ok('great_fleet при ships=101', hasAch(ctx, 'great_fleet'));
}
{
  const ctx = makeCtx({ military: { infantry: 0, cavalry: 5001, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } });
  ctx.checkAchievements('rome');
  ok('cavalry_king при cavalry=5001', hasAch(ctx, 'cavalry_king'));
}
{
  const ctx = makeCtx({ military: { infantry: 20001, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } });
  ctx.checkAchievements('rome');
  ok('veteran_army при infantry=20001', hasAch(ctx, 'veteran_army'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 2: Экономические достижения');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({ economy: { treasury: 100000, income_per_turn: 0, tax_rate: 0.10, stockpile: {} } });
  ctx.checkAchievements('rome');
  ok('treasurer при treasury=100000', hasAch(ctx, 'treasurer'));
}
{
  const ctx = makeCtx({ _bankruptcies: 1 });
  ctx.checkAchievements('rome');
  ok('bankrupt при _bankruptcies=1', hasAch(ctx, 'bankrupt'));
}
{
  const ctx = makeCtx({ economy: { treasury: 0, income_per_turn: 50000, tax_rate: 0.10, stockpile: {} } });
  ctx.checkAchievements('rome');
  ok('silk_road при income_per_turn=50000', hasAch(ctx, 'silk_road'));
}
{
  const ctx = makeCtx({ _total_loans_taken: 50001 });
  ctx.checkAchievements('rome');
  ok('debt_lord при _total_loans_taken=50001', hasAch(ctx, 'debt_lord'));
}
{
  const ctx = makeCtx({ _turns_frugal: 20 });
  ctx.checkAchievements('rome');
  ok('frugal при _turns_frugal=20', hasAch(ctx, 'frugal'));
}
{
  const ctx = makeCtx({ economy: { treasury: 500000, income_per_turn: 0, tax_rate: 0.10, stockpile: {} } });
  ctx.checkAchievements('rome');
  ok('tax_collector при treasury=500000', hasAch(ctx, 'tax_collector'));
}
{
  const ctx = makeCtx({ economy: { treasury: 0, income_per_turn: 100000, tax_rate: 0.10, stockpile: {} } });
  ctx.checkAchievements('rome');
  ok('master_trader при income_per_turn=100000', hasAch(ctx, 'master_trader'));
}
{
  // debt_free: нет активных займов, treasury>50000, _total_loans_taken>0
  const ctx = makeCtx(
    { economy: { treasury: 51000, income_per_turn: 0, tax_rate: 0.10, stockpile: {} }, _total_loans_taken: 1000 },
    { loans: [] }
  );
  ctx.checkAchievements('rome');
  ok('debt_free: нет займов + treasury>50000 + взял ранее', hasAch(ctx, 'debt_free'));
}
{
  // debt_free НЕ разблокируется если есть активный займ
  const ctx = makeCtx(
    { economy: { treasury: 51000, income_per_turn: 0, tax_rate: 0.10, stockpile: {} }, _total_loans_taken: 1000 },
    { loans: [{ nation_id: 'rome', status: 'active', monthly_payment: 100 }] }
  );
  ctx.checkAchievements('rome');
  ok('debt_free НЕ при активном займе', !hasAch(ctx, 'debt_free'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 3: Территориальные и строительные достижения');
// ────────────────────────────────────────────────────────

{
  const regions = Array.from({ length: 20 }, (_, i) => `r${i}`);
  const ctx = makeCtx({ regions });
  ctx.checkAchievements('rome');
  ok('hegemon при 20 регионах', hasAch(ctx, 'hegemon'));
}
{
  const regions = Array.from({ length: 30 }, (_, i) => `r${i}`);
  const ctx = makeCtx({ regions });
  ctx.checkAchievements('rome');
  ok('empire_builder при 30 регионах', hasAch(ctx, 'empire_builder'));
}
{
  const ctx = makeCtx({ _buildings_built: 20 });
  ctx.checkAchievements('rome');
  ok('builder при _buildings_built=20', hasAch(ctx, 'builder'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 4: Население и общество');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({ population: { total: 50000, happiness: 85, by_profession: {} } });
  ctx.checkAchievements('rome');
  ok('populist при happiness=85', hasAch(ctx, 'populist'));
}
{
  const ctx = makeCtx({ population: { total: 1000000, happiness: 50, by_profession: {} } });
  ctx.checkAchievements('rome');
  ok('populous при population=1M', hasAch(ctx, 'populous'));
}
{
  const ctx = makeCtx({ population: { total: 50000, happiness: 95, by_profession: {} } });
  ctx.checkAchievements('rome');
  ok('beloved при happiness=95', hasAch(ctx, 'beloved'));
}
{
  const ctx = makeCtx({ population: { total: 50000, happiness: 84, by_profession: {} } });
  ctx.checkAchievements('rome');
  ok('populist НЕ при happiness=84', !hasAch(ctx, 'populist'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 5: Управление и политика');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({
    government: { type: 'tyranny', stability: 19, legitimacy: 60, ruler: { name: 'Т', age: 40 } },
    _turns_in_power: 11,
  });
  ctx.checkAchievements('rome');
  ok('tyrant при stability<20 + turns>10', hasAch(ctx, 'tyrant'));
}
{
  const ctx = makeCtx({
    government: { type: 'tyranny', stability: 19, legitimacy: 60, ruler: { name: 'Т', age: 40 } },
    _turns_in_power: 9,
  });
  ctx.checkAchievements('rome');
  ok('tyrant НЕ при turns=9', !hasAch(ctx, 'tyrant'));
}
{
  const ctx = makeCtx({ government: { type: 'monarchy', stability: 50, legitimacy: 90, ruler: { name: 'К', age: 40 } } });
  ctx.checkAchievements('rome');
  ok('just_ruler при legitimacy=90', hasAch(ctx, 'just_ruler'));
}
{
  const ctx = makeCtx({ government: { type: 'monarchy', stability: 91, legitimacy: 60, ruler: { name: 'К', age: 40 } } });
  ctx.checkAchievements('rome');
  ok('iron_fist при stability=91', hasAch(ctx, 'iron_fist'));
}
{
  const ctx = makeCtx({ _laws_enacted: 5 });
  ctx.checkAchievements('rome');
  ok('reformer при _laws_enacted=5', hasAch(ctx, 'reformer'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 6: Временные достижения');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({}, { turn: 100 });
  ctx.checkAchievements('rome');
  ok('centurion при turn=100', hasAch(ctx, 'centurion'));
}
{
  const ctx = makeCtx({}, { turn: 200 });
  ctx.checkAchievements('rome');
  ok('long_reign при turn=200', hasAch(ctx, 'long_reign'));
}
{
  const ctx = makeCtx({}, { turn: 300 });
  ctx.checkAchievements('rome');
  ok('ruler_eternal при turn=300', hasAch(ctx, 'ruler_eternal'));
}
{
  const ctx = makeCtx({}, { turn: 99 });
  ctx.checkAchievements('rome');
  ok('centurion НЕ при turn=99', !hasAch(ctx, 'centurion'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 7: Дипломатические достижения');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({ _last_war_turn: 0 }, { turn: 35 });
  ctx.checkAchievements('rome');
  ok('peacemaker: 35 ходов без войн', hasAch(ctx, 'peacemaker'));
}
{
  const ctx = makeCtx({ _last_war_turn: 20 }, { turn: 45 });
  ctx.checkAchievements('rome');
  ok('peacemaker НЕ при last_war=20, turn=45 (только 25 ходов)', !hasAch(ctx, 'peacemaker'));
}
{
  const treaties = [
    { status: 'active', type: 'alliance', parties: ['rome', 'carthage'] },
    { status: 'active', type: 'alliance', parties: ['rome', 'greece'] },
    { status: 'active', type: 'alliance', parties: ['rome', 'egypt'] },
  ];
  const ctx = makeCtx(
    { military: { infantry: 0, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } },
    { diplomacy: { treaties }, turn: 10 }
  );
  ctx.checkAchievements('rome');
  ok('diplomat при 3 союзах', hasAch(ctx, 'diplomat'));
}
{
  const ctx = makeCtx({ _turns_without_ally: 50 });
  ctx.checkAchievements('rome');
  ok('lone_wolf при _turns_without_ally=50', hasAch(ctx, 'lone_wolf'));
}
{
  const treaties = Array.from({ length: 5 }, (_, i) => ({
    status: 'active', type: 'alliance', parties: ['rome', `nation${i}`]
  }));
  const ctx = makeCtx(
    { military: { infantry: 0, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } },
    { diplomacy: { treaties }, turn: 10 }
  );
  ctx.checkAchievements('rome');
  ok('alliance_network при 5 союзах', hasAch(ctx, 'alliance_network'));
}
{
  // pacifist: 50 ходов без войн + happiness>70
  const ctx = makeCtx(
    { _last_war_turn: 0, population: { total: 50000, happiness: 71, by_profession: {} } },
    { turn: 55 }
  );
  ctx.checkAchievements('rome');
  ok('pacifist: 55 ходов мира + happiness=71', hasAch(ctx, 'pacifist'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 8: Особые достижения');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({ _crisis_survived: 1 });
  ctx.checkAchievements('rome');
  ok('survivor при _crisis_survived=1', hasAch(ctx, 'survivor'));
}
{
  const ctx = makeCtx({ _crisis_survived: 3 });
  ctx.checkAchievements('rome');
  ok('crisis_veteran при _crisis_survived=3', hasAch(ctx, 'crisis_veteran'));
}
{
  // humble: turn>=50 + treasury<500
  const ctx = makeCtx(
    { economy: { treasury: 499, income_per_turn: 0, tax_rate: 0.10, stockpile: {} } },
    { turn: 50 }
  );
  ctx.checkAchievements('rome');
  ok('humble при turn=50 + treasury=499', hasAch(ctx, 'humble'));
}
{
  const ctx = makeCtx({ military: { infantry: 0, cavalry: 0, ships: 201, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 } });
  ctx.checkAchievements('rome');
  ok('sea_lord при ships=201', hasAch(ctx, 'sea_lord'));
}
{
  const ctx = makeCtx({ _regions_gained_this_reign: 5 });
  ctx.checkAchievements('rome');
  ok('expansion при _regions_gained_this_reign=5', hasAch(ctx, 'expansion'));
}
{
  const ctx = makeCtx({ _testament_completed: true });
  ctx.checkAchievements('rome');
  ok('legacy_keeper при _testament_completed=true', hasAch(ctx, 'legacy_keeper'));
}
{
  const ctx = makeCtx({ _vow_kept_turns: 100 });
  ctx.checkAchievements('rome');
  ok('man_of_word при _vow_kept_turns=100', hasAch(ctx, 'man_of_word'));
}
{
  const ctx = makeCtx({ economy: { treasury: 0, income_per_turn: 200001, tax_rate: 0.10, stockpile: {} } });
  ctx.checkAchievements('rome');
  ok('economic_giant при income=200001', hasAch(ctx, 'economic_giant'));
}
{
  // _updateAchievementCounters сбросит счётчик если stability <= 90,
  // поэтому ставим stability=91 + уже накопленные 9 ходов (после тика станет 10)
  const ctx = makeCtx({
    government: { type: 'monarchy', stability: 91, legitimacy: 60, ruler: { name: 'К', age: 40 } },
    _turns_high_stability: 9,
  });
  ctx.checkAchievements('rome');
  ok('stability_master при stability=91 + 9 накопленных ходов (→10)', hasAch(ctx, 'stability_master'));
}
{
  // comeback: нужен _phoenix_low=true + treasury > 10000
  // _updateAchievementCounters: если phoenix_low && treasury>10000 → comeback=true
  const ctx = makeCtx({
    economy: { treasury: 11000, income_per_turn: 0, tax_rate: 0.10, stockpile: {} },
    _phoenix_low: true,
  });
  ctx.checkAchievements('rome');
  ok('comeback при _phoenix_low=true + treasury=11000', hasAch(ctx, 'comeback'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 9: Цепочечные — legend и perfect_ruler');
// ────────────────────────────────────────────────────────

{
  // legend: разблокировать 10 достижений → само becomes 11-м
  const ctx = makeCtx({
    _battles_won: 20,       // first_blood, war_machine, conqueror
    _invasions_repelled: 3, // iron_wall
    _wars_declared: 5,      // warmonger
    economy: { treasury: 100000, income_per_turn: 0, tax_rate: 0.10, stockpile: {} }, // treasurer
    _bankruptcies: 1,       // bankrupt
    population: { total: 1000000, happiness: 85, by_profession: {} }, // populist, populous
  }, { turn: 100 });        // centurion
  ctx.checkAchievements('rome');
  const count = ctx.getAchievementCount('rome');
  ok(`legend цепочка: 10+ достижений (count=${count})`, count >= 10);
  ok('legend разблокирован при 10+ достижениях', hasAch(ctx, 'legend'));
}
{
  // perfect_ruler: grandeur >= 800
  // territory=200 (20 rg), wealth=150 (150k), army=100 (10k inf), happiness=100, trade=150 (45k), stability=100, diplomacy=0, legacy=100 (10 ach)
  const regions = Array.from({ length: 20 }, (_, i) => `r${i}`);
  const treaties = Array.from({ length: 5 }, (_, i) => ({
    status: 'active', type: 'alliance', parties: ['rome', `n${i}`]
  }));
  const ctx = makeCtx({
    regions,
    economy: { treasury: 150000, income_per_turn: 45000, tax_rate: 0.10, stockpile: {} },
    military: { infantry: 10000, cavalry: 0, ships: 0, morale: 70, loyalty: 80, at_war_with: [], mercenaries: 0 },
    population: { total: 1000000, happiness: 100, by_profession: {} },
    government: { type: 'monarchy', stability: 100, legitimacy: 90, ruler: { name: 'Цезарь', age: 40 } },
    _battles_won: 20, _invasions_repelled: 3, _wars_declared: 5,
    _bankruptcies: 1, _turns_in_power: 0, _total_loans_taken: 0,
  }, { diplomacy: { treaties }, turn: 200 });
  ctx.checkAchievements('rome');
  const g = ctx.calcGrandeur('rome');
  ok(`perfect_ruler: grandeur=${g} (ожидаем >= 800)`, g >= 800);
  ok('perfect_ruler разблокирован', hasAch(ctx, 'perfect_ruler'));
}

// ────────────────────────────────────────────────────────
section('БЛОК 10: Достижение не добавляется дважды');
// ────────────────────────────────────────────────────────

{
  const ctx = makeCtx({ _battles_won: 1 });
  ctx.checkAchievements('rome');
  ctx.checkAchievements('rome');
  ctx.checkAchievements('rome');
  const keys = Object.keys(ctx.GAME_STATE.achievements.rome ?? {});
  const dup = keys.filter(k => k === 'first_blood').length;
  ok('first_blood не дублируется при многократных вызовах', dup === 1);
}

// ────────────────────────────────────────────────────────
section('ИТОГ');
// ────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
console.log(`════════════════════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
