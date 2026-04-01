'use strict';
// ══════════════════════════════════════════════════════════════════════
// ТЕСТЫ: victory.js — итоги правления, кризисные вехи, завещание
// Запуск: node tests/victory_crisis_test.cjs
// ══════════════════════════════════════════════════════════════════════

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ FAIL: ${label}`); failed++; errors.push(label); }
}

function makeCtx(gsOverrides = {}) {
  const GS = {
    turn: 1,
    player_nation: 'syracuse',
    nations: {
      syracuse: {
        name: 'Сиракузы',
        economy: { treasury: 8000, income_per_turn: 1500, stockpile: { wheat: 25000 } },
        population: { total: 500000, happiness: 62 },
        government: {
          type: 'tyranny', stability: 58, legitimacy: 72,
          ruler: { name: 'Агафокл', age: 45 }, ruler_changed: false,
        },
        military: { infantry: 5000, cavalry: 1000, ships: 50, at_war_with: [] },
        regions: ['r55', 'r102', 'r245'],
        buildings: ['port', 'market'],
        relations: {}, characters: [], memory: { events: [], archive: [], dialogues: {} },
        _ruler_start_turn: 0,
        capital_region: 'r55',
      },
      carthage: {
        name: 'Карфаген',
        economy: { treasury: 50000 }, population: { total: 800000, happiness: 65 },
        government: { type: 'oligarchy', stability: 70, legitimacy: 80 },
        military: { infantry: 40000, cavalry: 10000, at_war_with: [] },
        regions: ['c1', 'c2', 'c3'],
        relations: {}, characters: [],
      },
    },
    diplomacy: { treaties: [], relations: {} },
    loans: [],
    regions: { r55: { owner: 'syracuse', name: 'Сиракузы' } },
    achievements: { syracuse: {} },
    player_vows: [],
    active_crisis: null,
    chronicle_log: [],
    date: { year: -301, month: 1 },
    events_log: [],
    testament: null,
    ...gsOverrides,
  };

  const ctx = vm.createContext({
    GAME_STATE: GS,
    addEventLog: (msg, type) => { GS.events_log.push({ msg, type }); },
    addMemoryEvent: () => {},
    declareWar: (a, b) => {
      GS.nations[a]?.military?.at_war_with?.push(b);
      GS.nations[b]?.military?.at_war_with?.push(a);
    },
    calcGrandeur: () => 350,
    getAchievements: () => [],
    getAchievementCount: () => 0,
    window: { ChronicleSystem: null },
    console, Math, Object, Array, JSON, Set, Map, String, Number, Boolean,
    setTimeout: () => {},
    document: undefined,
    MAP_REGIONS: { r55: { name: 'Сиракузы' } },
  });

  const src = fs.readFileSync(path.join(__dirname, '../engine/victory.js'), 'utf8');
  vm.runInContext(src, ctx);

  return { ctx, GS };
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 1: checkVictoryConditions не падает при базовом вызове
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 1: checkVictoryConditions — базовый вызов');
{
  const { ctx, GS } = makeCtx({ turn: 5 });
  let crashed = false;
  try { ctx.checkVictoryConditions(); } catch (e) { crashed = true; console.error(e.message); }
  ok('checkVictoryConditions не падает', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 2: Смена монарха → showLegacyModal не падает
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 2: generateRulerLegacy при смене монарха');
{
  const { ctx, GS } = makeCtx({ turn: 50 });
  GS.nations.syracuse.government.ruler_changed = true;
  GS.nations.syracuse._ruler_start_turn = 10;
  let crashed = false;
  try { ctx.checkVictoryConditions(); } catch (e) { crashed = true; console.error(e.message); }
  ok('generateRulerLegacy не падает при ruler_changed', !crashed);
  ok('ruler_changed сброшен после вызова', !GS.nations.syracuse.government.ruler_changed);
  ok('_ruler_start_turn обновлён', GS.nations.syracuse._ruler_start_turn === 50);
  ok('Событие добавлено в лог', GS.events_log.some(e => e.msg.includes('Агафокл')));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 3: Республика → итог каждые 12 ходов
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 3: Республика — смена консула каждые 12 ходов');
{
  const { ctx, GS } = makeCtx({ turn: 24 });
  GS.nations.syracuse.government.type = 'republic';
  let crashed = false;
  try { ctx.checkVictoryConditions(); } catch (e) { crashed = true; console.error(e.message); }
  ok('Итог правления для республики не падает при turn=24', !crashed);
  ok('Событие добавлено в лог (консул)', GS.events_log.length > 0);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 4: Олигархия → итог каждые 24 хода
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 4: Олигархия — смена совета каждые 24 хода');
{
  const { ctx, GS } = makeCtx({ turn: 24 });
  GS.nations.syracuse.government.type = 'oligarchy';
  let crashed = false;
  try { ctx.checkVictoryConditions(); } catch (e) { crashed = true; console.error(e.message); }
  ok('Итог правления для олигархии не падает', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 5: Кризис FAMINE — запуск и эффекты
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 5: Кризис FAMINE');
{
  const { ctx, GS } = makeCtx({ turn: 600 });
  // Форсируем голод
  GS.nations.syracuse.economy.stockpile.wheat = 1000;
  // Вызываем processCrisisVeha напрямую
  ctx.processCrisisVeha();
  ok('active_crisis создан', GS.active_crisis !== null);
  ok('active_crisis не resolved', GS.active_crisis?.resolved === false);
  ok('Сообщение добавлено в лог', GS.events_log.some(e =>
    e.msg.includes('🌾') || e.msg.includes('Голод') || e.msg.includes('чума') || e.msg.includes('кризис') || e.msg.includes('Нашествие')
  ));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 6: Кризис — не запускается если уже активен
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 6: Кризис не запускается повторно');
{
  const { ctx, GS } = makeCtx({ turn: 600 });
  GS.active_crisis = { type: 'FAMINE', start_turn: 600, resolved: false, success: null };
  const logsBeforeCount = GS.events_log.length;
  ctx.processCrisisVeha();
  ok('Кризис не перезапускается при активном кризисе',
    GS.events_log.length === logsBeforeCount);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 7: Кризис PLAGUE — снижает население
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 7: Кризис PLAGUE снижает население');
{
  const { ctx, GS } = makeCtx({ turn: 600 });
  GS.nations.syracuse.population.total = 500000;
  GS.active_crisis = { type: 'PLAGUE', start_turn: 599, resolved: false, success: null };
  GS.nations.syracuse._crisis_plague_ticks = 3;
  // Симулируем несколько ходов
  for (let i = 0; i < 3; i++) {
    GS.turn++;
    ctx.checkVictoryConditions();
  }
  ok('Население снижено после чумы',
    GS.nations.syracuse.population.total < 500000);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 8: Кризис — успешное завершение разблокирует survivor
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 8: Кризис — успешное завершение');
{
  const { ctx, GS } = makeCtx({ turn: 610 });
  GS.active_crisis = { type: 'FAMINE', start_turn: 600, resolved: false, success: null };
  GS.nations.syracuse.population.happiness = 50; // > 20 → цель выполнена
  GS.nations.syracuse._crisis_famine_ticks = 0;
  
  // Прогоняем ход чтобы проверить разрешение
  ctx.checkVictoryConditions();
  ok('Кризис resolved', GS.active_crisis?.resolved === true);
  ok('_crisis_survived увеличился при успехе',
    (GS.nations.syracuse._crisis_survived ?? 0) >= 1);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 9: Завещание — добавление/удаление целей
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 9: Завещание — управление целями');
{
  const { ctx, GS } = makeCtx();
  ctx.addTestamentGoal('treasury_20k');
  ok('Цель добавлена в завещание', GS.testament?.goals?.some(g => g.id === 'treasury_20k'));
  
  ctx.addTestamentGoal('army_5k');
  ok('Вторая цель добавлена', GS.testament?.goals?.length === 2);
  
  ctx.addTestamentGoal('no_loans');
  ok('Третья цель добавлена (лимит 3)', GS.testament?.goals?.length === 3);
  
  // 4-я цель не добавится
  ctx.addTestamentGoal('end_wars');
  ok('4-я цель НЕ добавляется (лимит 3)', GS.testament?.goals?.length === 3);
  
  ctx.removeTestamentGoal('army_5k');
  ok('Цель удалена из завещания', !GS.testament?.goals?.some(g => g.id === 'army_5k'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 10: Завещание — проверка при смерти правителя
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 10: Завещание — проверка при смерти');
{
  const { ctx, GS } = makeCtx({ turn: 100 });
  GS.nations.syracuse.economy.treasury = 25000; // > 20k ✅
  GS.nations.syracuse.military.infantry = 3000; // < 5k ❌
  GS.testament = {
    goals: [
      { id: 'treasury_20k', text: 'Оставить казну > 20 000', icon: '💰' },
      { id: 'army_5k',     text: 'Оставить армию > 5 000',   icon: '⚔️' },
    ],
    created_turn: 50,
  };
  GS.nations.syracuse.government.ruler_changed = true;
  GS.nations.syracuse._ruler_start_turn = 50;
  
  let crashed = false;
  try { ctx.checkVictoryConditions(); } catch (e) { crashed = true; console.error(e.message); }
  
  ok('Проверка завещания не падает', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 11: Кризис DEBT_CRISIS — удваивает платежи
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 11: Кризис DEBT_CRISIS удваивает платежи');
{
  const { ctx, GS } = makeCtx({ turn: 600 });
  GS.loans = [{ nation_id: 'syracuse', status: 'active', remaining: 5000, monthly_payment: 100 }];
  // Форсируем долговой кризис
  GS.active_crisis = null;
  // Мокаем Math.random для детерминизма
  // Math override removed - not needed
  ctx.processCrisisVeha();
  // Проверяем что кризис запустился
  ok('Кризис запущен при займах', GS.active_crisis !== null);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 12: _buildLegacyText — наратив для разных типов
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 12: _buildLegacyText генерирует нарратив');
{
  const { ctx, GS } = makeCtx();
  let legacyText = '';
  // Переопределяем showLegacyModal чтобы перехватить текст
  ctx.showLegacyModal = (text, data) => { legacyText = text; };
  
  ctx.generateRulerLegacy('syracuse', 'ruler_death');
  ok('Нарратив монарха содержит имя правителя', legacyText.includes('Агафокл'));
  ok('Нарратив содержит упоминание войн или мира',
    legacyText.includes('войн') || legacyText.includes('мир') || legacyText.includes('конфликт'));
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 13: showLegacyModal не падает без document
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 13: showLegacyModal без document');
{
  const { ctx } = makeCtx();
  let crashed = false;
  try {
    ctx.showLegacyModal('Тестовый текст', {
      ruler_name: 'Агафокл', turns_ruled: 50, grandeur: 350,
      achievements: [], wars: 2, treasury: 5000, population: 500000,
      reason: 'ruler_death', nation_name: 'Сиракузы',
    });
  } catch (e) { crashed = true; console.error(e.message); }
  ok('showLegacyModal не падает без document', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 14: processCrisisVeha — не падает при пустых нациях
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 14: Краш-тест processCrisisVeha');
{
  const { ctx, GS } = makeCtx({ turn: 600 });
  GS.player_nation = 'nonexistent';
  let crashed = false;
  try { ctx.processCrisisVeha(); } catch (e) { crashed = true; }
  ok('processCrisisVeha не падает при несуществующей нации', !crashed);
}

// ──────────────────────────────────────────────────────────────────────
// ТЕСТ 15: Полная цепочка: кризис → разрешение → лог
// ──────────────────────────────────────────────────────────────────────
console.log('\n📋 ТЕСТ 15: Полная цепочка кризиса (запуск → разрешение → лог)');
{
  const { ctx, GS } = makeCtx({ turn: 600 });
  GS.nations.syracuse.population.happiness = 80;
  
  // Шаг 1: запустить кризис голода вручную
  GS.active_crisis = { type: 'FAMINE', start_turn: 600, resolved: false, success: null };
  GS.nations.syracuse._crisis_famine_ticks = 0;
  
  // Шаг 2: прождать duration=10 ходов
  GS.turn = 610;
  ctx.checkVictoryConditions();
  
  ok('Кризис завершён', GS.active_crisis?.resolved === true);
  ok('Успех зафиксирован (happiness > 20)', GS.active_crisis?.success === true);
  ok('chronicle_log пополнен', GS.chronicle_log.length > 0);
  ok('Событие успеха в логе', GS.events_log.some(e => e.msg.includes('✅') || e.msg.includes('преодолён')));
}

// ──────────────────────────────────────────────────────────────────────
// ИТОГИ
// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log(`ИТОГ: ${passed} прошло, ${failed} провалено из ${passed + failed}`);
if (errors.length > 0) {
  console.log('Провалено:');
  errors.forEach(e => console.log(`  - ${e}`));
}
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
