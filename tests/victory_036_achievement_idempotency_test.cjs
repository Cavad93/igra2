'use strict';
// ── VICTORY 036: Achievement idempotency & replay integrity ────────────
// Проверяет что:
//   1. Повторный вызов checkAchievements не дублирует разблокировки
//   2. turn разблокировки сохраняется при повторных вызовах
//   3. Каждое достижение имеет уникальный id
//   4. Все 50 достижений имеют корректную метадату
//   5. getAchievementCount согласован с getAchievements().length
//   6. События 'achievement' пишутся ровно один раз на достижение
// Запуск: node tests/victory_036_achievement_idempotency_test.cjs

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
  const events = [];
  const ctx = vm.createContext({
    GAME_STATE: gs,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: () => {},
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._events = events;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'engine/achievements.js'), 'utf8'), ctx);
  return ctx;
}

function makeRich() {
  return {
    turn: 50,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: {
          treasury: 150000, income_per_turn: 60000, tax_rate: 0.1,
          stockpile: { wheat: 5000 },
        },
        military: {
          infantry: 25000, cavalry: 6000, ships: 120, mercenaries: 0,
          at_war_with: [], _battles_won: 25,
        },
        population: {
          total: 1200000, happiness: 90, by_profession: { slaves: 0 },
        },
        government: {
          type: 'monarchy', stability: 95, legitimacy: 80,
          ruler: { name: 'Rex', age: 40 },
        },
        regions: new Array(25).fill(null).map((_,i) => 'r'+i),
        capital_region: 'r0',
        _battles_won: 25,
        _wars_declared: 6,
        _invasions_repelled: 5,
        _bankruptcies: 1,
        _wars_total: 6,
      },
    },
    diplomacy: { treaties: [
      { status: 'active', type: 'alliance',           parties: ['rome','carth'] },
      { status: 'active', type: 'defensive_alliance', parties: ['rome','epir']  },
      { status: 'active', type: 'military_alliance',  parties: ['rome','sparta']},
    ]},
    loans: [],
    achievements: {},
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: Список достижений — уникальность и структура');
// ─────────────────────────────────────────────────────────────
{
  const ctx = load(makeRich());
  const list = vm.runInContext('ACHIEVEMENTS_LIST', ctx);
  ok('ACHIEVEMENTS_LIST определён',       Array.isArray(list));
  ok('Достижений >= 50',                   list.length >= 50);
  const ids = list.map(a => a.id);
  const unique = new Set(ids);
  ok('Все id уникальны',                   unique.size === ids.length);
  ok('У всех есть name',                   list.every(a => typeof a.name === 'string' && a.name.length));
  ok('У всех есть icon',                   list.every(a => typeof a.icon === 'string' && a.icon.length));
  ok('У всех есть desc',                   list.every(a => typeof a.desc === 'string' && a.desc.length));
  ok('У всех есть check-функция',          list.every(a => typeof a.check === 'function'));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: checkAchievements идемпотентен');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeRich();
  const ctx = load(gs);
  ctx.checkAchievements('rome');
  const firstCount  = ctx.getAchievementCount('rome');
  const firstSnap   = JSON.parse(JSON.stringify(gs.achievements.rome));

  // Повторный вызов — ничего не должно измениться
  ctx.checkAchievements('rome');
  ctx.checkAchievements('rome');
  ctx.checkAchievements('rome');
  const secondCount = ctx.getAchievementCount('rome');
  const secondSnap  = JSON.parse(JSON.stringify(gs.achievements.rome));

  ok('Количество стабильно',              firstCount === secondCount);
  ok('Данные не переписались',            JSON.stringify(firstSnap) === JSON.stringify(secondSnap));
  ok('Разблокировано > 10 (богатое состояние)', firstCount > 10);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: turn разблокировки фиксируется в момент первого вызова');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeRich();
  gs.turn = 50;
  const ctx = load(gs);
  ctx.checkAchievements('rome');
  const unlocked = gs.achievements.rome;
  const treasurerTurn = unlocked.treasurer?.turn;
  ok('treasurer разблокирован на ходу 50', treasurerTurn === 50);

  // Изменим turn и снова вызовем — не должен переписаться
  gs.turn = 999;
  ctx.checkAchievements('rome');
  ok('treasurer.turn не перезаписался',   gs.achievements.rome.treasurer?.turn === 50);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: addEventLog для каждого достижения ровно один раз');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeRich();
  const ctx = load(gs);
  ctx.checkAchievements('rome');
  const firstEvents = ctx._events.filter(e => e.type === 'achievement').length;
  ctx.checkAchievements('rome');
  ctx.checkAchievements('rome');
  const secondEvents = ctx._events.filter(e => e.type === 'achievement').length;
  ok('Событий не добавилось при повторных вызовах', firstEvents === secondEvents);
  ok('Достижений совпадает с числом событий',       ctx.getAchievementCount('rome') === firstEvents);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: getAchievementCount согласован с getAchievements().length');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeRich();
  const ctx = load(gs);
  ctx.checkAchievements('rome');
  const len = ctx.getAchievements('rome').length;
  const count = ctx.getAchievementCount('rome');
  ok('Длины совпадают',                    len === count);
  ok('Каждое имеет id+name+icon',          ctx.getAchievements('rome').every(a => a.id && a.name && a.icon));
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 6: Save/Restore — достижения переносятся через сериализацию');
// ─────────────────────────────────────────────────────────────
{
  const gs1 = makeRich();
  const ctx1 = load(gs1);
  ctx1.checkAchievements('rome');
  const count1 = ctx1.getAchievementCount('rome');
  const serialized = JSON.stringify(gs1);

  const gs2 = JSON.parse(serialized);
  const ctx2 = load(gs2);
  const count2 = ctx2.getAchievementCount('rome');
  ok('Количество сохраняется после JSON round-trip', count1 === count2);

  // После restore повторный check не добавляет ничего
  ctx2.checkAchievements('rome');
  const count3 = ctx2.getAchievementCount('rome');
  ok('После restore+check count стабилен', count2 === count3);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 7: Неизвестная нация — graceful fallback');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeRich();
  const ctx = load(gs);
  let threw = false;
  try {
    ctx.checkAchievements('does_not_exist');
    ctx.getAchievements('does_not_exist');
    ctx.getAchievementCount('does_not_exist');
  } catch (e) { threw = true; }
  ok('checkAchievements не падает на неизвестной нации', !threw);
  ok('getAchievementCount=0 для неизвестной',  ctx.getAchievementCount('ghost') === 0);
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
// ─────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed+failed}`);
console.log(`════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
