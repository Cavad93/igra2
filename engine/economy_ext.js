// ══════════════════════════════════════════════════════════════
// РАСШИРЕНИЯ ЭКОНОМИКИ — engine/economy_ext.js
//
// План «Улучшения экономики» (docs/economic2.md) — 8 улучшений:
//   1. Торговый баланс (видимость)                ← этап 1
//   2. Монопольный бонус к цене/дипломатии        ← этап 2
//   3. Специализация региона                      ← этап 3
//   4. Инфляция от переполненной казны            ← этап 4
//   5. Экономические циклы (бум / спад)            ← этап 5
//   6. Усталость армии от недофинансирования       ← этап 6
//   7. Рост производительности со временем        ← этап 7
//   8. Тултипы эффективности производства         ← этап 8
//
// Этап 1 реализован в этом файле:
//   • initEconomyExt()       — подготавливает GAME_STATE.economy_ext
//   • calcTradeBalance(nId)  — считает доход/расход по торговле за ход
//   • runEconomyExtTick()    — вызывается в конце runEconomyTick()
//   • addEconomicEvent(t)    — общий логгер для будущих этапов
//
// Загружается ПОСЛЕ engine/economy.js и ДО engine/turn.js в index.html.
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// INIT — идемпотентно создаём все поля расширения.
// ──────────────────────────────────────────────────────────────
function initEconomyExt() {
  if (typeof GAME_STATE === 'undefined' || !GAME_STATE) return;
  if (!GAME_STATE.economy_ext) GAME_STATE.economy_ext = {};
  const ext = GAME_STATE.economy_ext;

  // Улучшение 3 — специализация региона: { region_id: { good, streak, bonus } }
  if (!ext.region_specialization) ext.region_specialization = {};

  // Улучшение 4 — инфляция: { nation_id: 0.0–0.25 }
  if (!ext.inflation) ext.inflation = {};

  // Улучшение 5 — экономический цикл
  if (!ext.economic_cycle) {
    ext.economic_cycle = {
      current:         'normal',   // 'boom' | 'normal' | 'recession'
      turns_left:      0,
      next_check_turn: 48,
    };
  }

  // Улучшение 6 — монополии (кеш), { good: nation_id }
  if (!ext.monopolies) ext.monopolies = {};

  // Улучшение 8 — история торгового баланса (последние 12 ходов)
  if (!Array.isArray(ext.trade_history)) ext.trade_history = [];
}

// ──────────────────────────────────────────────────────────────
// calcTradeBalance(nationId)
//
// Возвращает:
//   { income, expense, net, gross_exports, imports, port_duties, tariff_income }
//
// Как считается:
//   • imports        — суммарная стоимость закупок нации с мирового рынка
//                      за текущий тик (mkt._world_bought_tick[nationId] × цена
//                      × (1 + транспортная надбавка)).
//   • gross_exports  — восстанавливается из _income_breakdown.trade_profit:
//                      trade_profit = gross_exports − imports,
//                      ⇒ gross_exports = trade_profit + imports.
//   • port_duties / tariff_income — уже хранятся в breakdown.
//   • income  = gross_exports + port_duties + tariff_income
//   • expense = imports
//   • net     = income − expense
//
// Все суммы в золоте (₴), округлены до целого.
// ──────────────────────────────────────────────────────────────
function calcTradeBalance(nationId) {
  const nation = GAME_STATE?.nations?.[nationId];
  if (!nation) return { income: 0, expense: 0, net: 0, gross_exports: 0, imports: 0, port_duties: 0, tariff_income: 0 };

  const inc = nation.economy?._income_breakdown || {};
  const tradeProfit  = Number(inc.trade_profit)  || 0;
  const portDuties   = Number(inc.port_duties)   || 0;
  const tariffIncome = Number(inc.tariff_income) || 0;

  // 1) Импорт с мирового рынка — по факту закупок этого тика.
  let importExpense = 0;
  const market = GAME_STATE?.market || {};
  for (const [good, mkt] of Object.entries(market)) {
    const bought = mkt?._world_bought_tick?.[nationId] || 0;
    if (bought <= 0) continue;

    const transport = (typeof getWorldMarketTransportCost === 'function')
      ? getWorldMarketTransportCost(nationId, good) : 0.25;
    const unitPrice = Number(mkt.price) || 0;
    importExpense += bought * unitPrice * (1 + transport);
  }
  importExpense = Math.round(importExpense);

  // 2) Валовый экспорт = trade_profit + imports
  //    (trade_profit хранится как netProfit − importPayments).
  const grossExports = Math.max(0, Math.round(tradeProfit + importExpense));

  const income  = grossExports + portDuties + tariffIncome;
  const expense = importExpense;
  const net     = income - expense;

  return {
    income, expense, net,
    gross_exports: grossExports,
    imports: importExpense,
    port_duties:  portDuties,
    tariff_income: tariffIncome,
  };
}

// ──────────────────────────────────────────────────────────────
// recordTradeHistory() — раз в тик пишем агрегат по всем нациям.
// ──────────────────────────────────────────────────────────────
function _ecoExtRecordTradeHistory() {
  const ext = GAME_STATE?.economy_ext;
  if (!ext) return;
  const balance_by_nation = {};
  for (const nId of Object.keys(GAME_STATE.nations || {})) {
    const b = calcTradeBalance(nId);
    balance_by_nation[nId] = {
      income:  b.income,
      expense: b.expense,
      net:     b.net,
    };
  }
  ext.trade_history.push({
    turn: GAME_STATE.turn ?? 0,
    balance_by_nation,
  });
  // Ограничиваем длину — не растём бесконечно.
  while (ext.trade_history.length > 12) ext.trade_history.shift();
}

// ──────────────────────────────────────────────────────────────
// addEconomicEvent — общий логгер будущих экономических событий.
// ──────────────────────────────────────────────────────────────
function addEconomicEvent(text) {
  if (typeof addEventLog === 'function') {
    try { addEventLog(text, 'economy'); } catch (_) { /* ignore */ }
  } else if (typeof addLog === 'function') {
    try { addLog(text); } catch (_) { /* ignore */ }
  }
  if (typeof console !== 'undefined') console.log('[economy_ext]', text);
}

// ──────────────────────────────────────────────────────────────
// runEconomyExtTick()
// Вызывается ОДИН раз в конце runEconomyTick() (engine/economy.js).
// Все последующие этапы 2–8 добавляют вызовы сюда.
// ──────────────────────────────────────────────────────────────
function runEconomyExtTick() {
  try { initEconomyExt(); } catch (e) { console.warn('[economy_ext:init]', e); }

  // Этап 1 — запись торгового баланса в историю.
  try { _ecoExtRecordTradeHistory(); } catch (e) { console.warn('[economy_ext:trade_hist]', e); }

  // Этапы 2–8 подключатся здесь в будущих сессиях:
  //   try { detectMonopolies();    } catch (e) { console.warn('[economy_ext:mono]', e); }
  //   try { updateSpecialization(); } catch (e) { console.warn('[economy_ext:spec]', e); }
  //   try { updateInflation();      } catch (e) { console.warn('[economy_ext:infl]', e); }
  //   try { updateEconomicCycle();  } catch (e) { console.warn('[economy_ext:cycle]', e); }
  //   try { updateTechDrift();      } catch (e) { console.warn('[economy_ext:tech]', e); }
}

// Экспорт в window для инспекции из консоли (браузер) и для save/load.
if (typeof window !== 'undefined') {
  window.initEconomyExt   = initEconomyExt;
  window.calcTradeBalance = calcTradeBalance;
  window.runEconomyExtTick = runEconomyExtTick;
  window.addEconomicEvent  = addEconomicEvent;
}
