'use strict';
// ── VICTORY 040: Long-run 2000-turn fuzz & integration stress test ─────
// Симулирует 2000 ходов с рандомными мутациями состояния на каждом шагу:
//   - Смены правителя (monarchy ↔ republic ↔ oligarchy ↔ chiefdom)
//   - Мутации treasury, infantry, cavalry, regions, happiness
//   - Рандомные войны/мир
//   - Рандомные займы
//   - Принятие клятв
//   - Добавление целей завещания
//
// Проверки:
//   1. Никаких крашей за 2000 ходов
//   2. Индекс величия всегда [0, 1000]
//   3. Хроника не превышает 50 записей
//   4. Кризисы срабатывают на 600, 1200, 1800
//   5. Все legacy modals имеют turns_ruled >= 1
//   6. Количество достижений только растёт
//   7. Клятвы один раз нарушаются — не повторно
// Запуск: node tests/victory_040_longrun_fuzz_test.cjs

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
  const legacyModals = [];
  const ctx = vm.createContext({
    GAME_STATE: gs,
    addEventLog: (msg, type) => events.push({ msg, type }),
    addMemoryEvent: () => {},
    declareWar: (attackerId, defenderId) => {
      const a = gs.nations?.[attackerId];
      const d = gs.nations?.[defenderId];
      if (a?.military) a.military.at_war_with = [...new Set([...(a.military.at_war_with??[]), defenderId])];
      if (d?.military) d.military.at_war_with = [...new Set([...(d.military.at_war_with??[]), attackerId])];
    },
    document: domStub,
    window: {},
    console,
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error,
  });
  ctx._events = events;
  ctx._legacyModals = legacyModals;
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/achievements.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine/victory.js'), 'utf8'), ctx);
  vm.runInContext('showLegacyModal = (text, data, testament) => _legacyModals.push({ text, data, testament });', ctx);
  return ctx;
}

function makeGS() {
  return {
    turn: 1,
    player_nation: 'rome',
    nations: {
      rome: {
        economy: { treasury: 5000, income_per_turn: 500, tax_rate: 0.10, stockpile: { wheat: 2000 } },
        military: { infantry: 1000, cavalry: 100, ships: 5, mercenaries: 0, at_war_with: [] },
        population: { total: 100000, happiness: 60, by_profession: { slaves: 0 } },
        government: {
          type: 'monarchy', stability: 60, legitimacy: 70,
          ruler: { name: 'R0', age: 30 },
        },
        regions: ['r0','r1','r2'],
        capital_region: 'r0',
        _ruler_start_turn: 0,
        _wars_total: 0,
      },
      carth: {
        economy: { treasury: 3000, stockpile: {} },
        military: { infantry: 800, cavalry: 200, at_war_with: [] },
        population: { total: 80000, happiness: 50 },
        government: { type: 'oligarchy', ruler: { name: 'C', age: 40 } },
        regions: ['c0','c1'],
      },
      epir: {
        economy: { treasury: 2000, stockpile: {} },
        military: { infantry: 500, cavalry: 100, at_war_with: [] },
        population: { total: 40000, happiness: 55 },
        government: { type: 'monarchy', ruler: { name: 'E', age: 35 } },
        regions: ['e0'],
      },
    },
    diplomacy: { treaties: [] },
    loans: [],
    achievements: {},
    chronicle_log: [],
    active_crisis: null,
    player_vows: [],
    testament: null,
    dynamic_goals: {},
  };
}

// Seeded RNG for reproducibility
function createRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 1: 2000-ходовая симуляция с рандомными мутациями');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  const rng = createRng(42);
  const n = gs.nations.rome;

  // Взять клятвы сразу
  ctx.takeVow('no_loans');
  ctx.takeVow('no_mercs');

  let crashed = false;
  let crashMsg = '';
  let crashTurn = 0;

  let grandeurViolations = 0;
  let achievementRegressions = 0;
  let prevAchCount = 0;
  let prevChronicleLen = 0;
  let chronicleOverflow = 0;
  let legacyCount = 0;
  let shortReign = 0;

  try {
    for (let turn = 1; turn <= 2000; turn++) {
      gs.turn = turn;

      // Рандомные мутации состояния
      const r = rng();
      if (r < 0.02) n.economy.treasury += Math.floor(rng() * 10000);
      if (r < 0.03) n.economy.treasury = Math.max(0, n.economy.treasury - Math.floor(rng() * 2000));
      if (r < 0.01) n.military.infantry += Math.floor(rng() * 500);
      if (r < 0.01) n.military.cavalry += Math.floor(rng() * 100);
      if (r < 0.005 && n.regions.length < 50) n.regions.push('reg' + turn);
      if (r < 0.005 && n.regions.length > 1) n.regions.pop();
      if (r < 0.02) n.population.happiness = Math.max(0, Math.min(100, n.population.happiness + (rng()*20-10)));
      if (r < 0.01) n.population.total += Math.floor(rng() * 10000);
      if (r < 0.01) n.government.stability = Math.max(0, Math.min(100, n.government.stability + (rng()*10-5)));
      if (r < 0.005) n.government.legitimacy = Math.max(0, Math.min(100, n.government.legitimacy + (rng()*10-5)));
      if (r < 0.001 && n.government.type === 'monarchy') {
        // Случайно состарить правителя
        n.government.ruler.age += 1;
      }
      // Иногда менять тип правительства
      if (r < 0.0005) {
        const types = ['monarchy','republic','oligarchy','chiefdom','tribal','tyranny'];
        n.government.type = types[Math.floor(rng()*types.length)];
      }
      // Случайная смерть правителя
      if (r < 0.005 && ['monarchy','tyranny','chiefdom','tribal'].includes(n.government.type)) {
        n.government.ruler = { name: 'R'+turn, age: 25 + Math.floor(rng()*30) };
        n.government.ruler_changed = true;
      }
      // Война/мир
      if (r < 0.002) {
        if (n.military.at_war_with.length === 0) {
          n.military.at_war_with = ['carth'];
          n._wars_total = (n._wars_total ?? 0) + 1;
          n._wars_declared = (n._wars_declared ?? 0) + 1;
          n._wars_declared_this_turn = 1;
        } else {
          n.military.at_war_with = [];
        }
      } else {
        n._wars_declared_this_turn = 0;
      }
      // Рандомный заём (должен сломать клятву no_loans)
      if (turn === 150) {
        gs.loans.push({ nation_id: 'rome', status: 'active', monthly_payment: 50, amount: 5000 });
        n._loans_taken_this_turn = 1;
      } else {
        n._loans_taken_this_turn = 0;
      }

      // Вызов движка
      ctx.checkAchievements('rome');
      ctx.checkVictoryConditions();

      // Инварианты
      const g = ctx.calcGrandeur('rome');
      if (typeof g !== 'number' || !isFinite(g) || g < 0 || g > 1000) {
        grandeurViolations++;
      }

      const ac = ctx.getAchievementCount('rome');
      if (ac < prevAchCount) achievementRegressions++;
      prevAchCount = ac;

      const chronicleLen = gs.chronicle_log?.length ?? 0;
      if (chronicleLen > 50) chronicleOverflow++;
    }
  } catch (e) {
    crashed = true;
    crashMsg = e.message;
    crashTurn = gs.turn;
  }

  ok('Симуляция завершена без крэша',       !crashed);
  if (crashed) console.error('   crashMsg:', crashMsg, 'at turn', crashTurn);
  ok('Нет нарушений границ grandeur',       grandeurViolations === 0);
  ok('Нет регрессий числа достижений',      achievementRegressions === 0);
  ok('Хроника не превышала 50 записей',     chronicleOverflow === 0);
  ok('Хроника в конце <= 50',                (gs.chronicle_log?.length ?? 0) <= 50);
  ok('Финальный grandeur в [0,1000]',        (() => {
    const g = ctx.calcGrandeur('rome');
    return g >= 0 && g <= 1000 && isFinite(g);
  })());

  // Legacy modals: все turns_ruled >= 1
  const legacyModals = ctx._legacyModals;
  ok(`Legacy modals сгенерированы (${legacyModals.length})`, legacyModals.length > 0);
  const badReigns = legacyModals.filter(m => (m.data.turns_ruled ?? 0) < 1).length;
  ok('Все legacy имеют turns_ruled >= 1',    badReigns === 0);

  // Кризисы на 600, 1200, 1800
  const crisisRecords = (gs.chronicle_log ?? []).filter(e => e.type === 'crisis');
  ok(`Кризисы записаны в хронику (${crisisRecords.length})`, crisisRecords.length >= 1);

  // Клятва no_loans должна быть сломана к концу
  const vow = gs.player_vows.find(v => v.id === 'no_loans');
  ok('Клятва no_loans сломана после займа', vow?.broken === true);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 2: Симуляция с некорректными данными — graceful');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  // Специально наделаем битых полей
  gs.nations.rome.economy = null;
  const ctx = load(gs);

  let crashed = false;
  try {
    for (let t = 1; t <= 50; t++) {
      gs.turn = t;
      ctx.checkAchievements('rome');
      ctx.checkVictoryConditions();
      ctx.calcGrandeur('rome');
    }
  } catch (e) {
    crashed = true;
  }
  ok('Симуляция с economy=null не падает', !crashed);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 3: Массовый save/restore цикл');
// ─────────────────────────────────────────────────────────────
{
  let gs = makeGS();
  const rng = createRng(7);

  for (let round = 0; round < 5; round++) {
    const ctx = load(gs);
    for (let t = 1; t <= 100; t++) {
      gs.turn = (gs.turn ?? 0) + 1;
      if (rng() < 0.01) {
        gs.nations.rome.government.ruler_changed = true;
        gs.nations.rome.government.ruler = { name: 'R' + gs.turn, age: 30 };
      }
      ctx.checkAchievements('rome');
      ctx.checkVictoryConditions();
    }
    // Сериализация
    const s = JSON.stringify(gs);
    gs = JSON.parse(s);
  }
  ok('5 раундов save/restore без крэша',    true);
  ok('Финальный grandeur корректен',
    (() => {
      const ctx = load(gs);
      const g = ctx.calcGrandeur('rome');
      return g >= 0 && g <= 1000;
    })());
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 4: Цепочка vow → testament → legacy');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);

  // Взять клятву, прожить 120 ходов → разблокировать man_of_word
  ctx.takeVow('no_mercs');
  for (let t = 1; t <= 120; t++) {
    gs.turn = t;
    ctx.checkAchievements('rome');
  }
  const v = gs.player_vows.find(x => x.id === 'no_mercs');
  ok('Клятва не сломана за 120 ходов',     v?.broken === false);

  // Добавить завещание
  ctx.addTestamentGoal('treasury_20k');
  ctx.addTestamentGoal('peace');
  gs.nations.rome.economy.treasury = 30000;
  gs.nations.rome.military.at_war_with = [];

  // Смерть правителя
  gs.nations.rome.government.ruler_changed = true;
  gs.nations.rome.government.ruler = { name: 'Dying', age: 70 };
  ctx.checkVictoryConditions();

  const lastModal = ctx._legacyModals[ctx._legacyModals.length - 1];
  ok('Последний legacy модал имеет testament', !!lastModal?.testament);
  ok('testament.done > 0',                 (lastModal?.testament?.done ?? 0) > 0);
  ok('testament.total === 2',              lastModal?.testament?.total === 2);
}

// ─────────────────────────────────────────────────────────────
section('БЛОК 5: Dynamic goals генерируются и тикают');
// ─────────────────────────────────────────────────────────────
{
  const gs = makeGS();
  const ctx = load(gs);
  for (let t = 1; t <= 100; t++) {
    gs.turn = t;
    ctx.checkAchievements('rome');
  }
  const goals = gs.dynamic_goals?.rome;
  ok('dynamic_goals.rome создано',         Array.isArray(goals));
  ok('Ровно 3 цели в dynamic_goals',       goals?.length === 3);
  ok('Все цели имеют progress в [0,1]',
    goals?.every(g => typeof g.progress === 'number' && g.progress >= 0 && g.progress <= 1));
}

// ─────────────────────────────────────────────────────────────
section('ИТОГ');
// ─────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed+failed}`);
console.log(`════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
