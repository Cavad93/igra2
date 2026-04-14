// ══════════════════════════════════════════════════════════════
// РАСШИРЕНИЯ ЭКОНОМИКИ — engine/economy_ext.js
//
// План «Улучшения экономики» (docs/economic2.md) — 8 улучшений:
//   1. Торговый баланс (видимость)                ← этап 1 ✔
//   2. Монопольный бонус к цене/дипломатии        ← этап 2 ✔
//   3. Специализация региона                      ← этап 3 ✔
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
// Этап 2 (монопольный бонус) реализован в этом файле:
//   • detectMonopolies()        — аггрегирует производство по нации
//                                 и помечает товары с единственным
//                                 производителем как монополии
//   • getMonopolyPriceMult(n,g) — множитель продажной цены для нации-
//                                 монополиста (используется в
//                                 processTrade в engine/economy.js)
//   • _applyMonopolyDiplomacyDelta() — применяет +5 к отношениям со
//                                 всеми торговыми партнёрами
//                                 монополиста, корректно снимая бонус
//                                 при потере монополии.
//
// Этап 3 (специализация региона) реализован в этом файле:
//   • updateRegionSpecialization() — раз в тик сканирует _production_last_tick
//                                    всех регионов, увеличивает streak для
//                                    топ-товара и пересчитывает bonus.
//   • getRegionSpecBonus(rid, good) — множитель эффективности производства
//                                     специализированного товара в регионе
//                                     (1.00–1.25). Применяется в
//                                     routeProductionToLocalStockpiles
//                                     (engine/economy.js).
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

// ══════════════════════════════════════════════════════════════
// ЭТАП 2 — МОНОПОЛЬНЫЙ БОНУС
//
// Единственный производитель стратегического товара получает:
//   • +20% к цене продажи (применяется в processTrade через
//     getMonopolyPriceMult(nationId, good));
//   • +5 к отношениям со всеми торговыми партнёрами (через
//     DiplomacyEngine relations, rel.score). Бонус корректно
//     снимается при потере монополии.
//
// Кеш активных монополий хранится в
// GAME_STATE.economy_ext.monopolies = { good: nationId }.
// Пересчитывается каждый тик в detectMonopolies().
// ══════════════════════════════════════════════════════════════

const MONOPOLY_PRICE_BONUS     = 0.20;  // +20% к цене продажи
const MONOPOLY_DIPLOMACY_BONUS = 5;     // +5 к отношениям с импортёрами

// Ключ пары наций для GAME_STATE.diplomacy.relations (совпадает с
// engine/diplomacy.js → _relKey). Переопределяем локально, т.к.
// оригинальный _relKey является приватной функцией.
function _ecoExtRelKey(a, b) {
  return [a, b].sort().join('_');
}

// ──────────────────────────────────────────────────────────────
// detectMonopolies()
//
// Проходит по STRATEGIC_GOODS, считает сколько наций реально
// произвело товар в прошедшем тике (по region._production_last_tick),
// и фиксирует монополии в ext.monopolies.
//
// Порог «реального производства» — 0.01 кг/ход, чтобы не засчитывать
// численный шум.
// ──────────────────────────────────────────────────────────────
function detectMonopolies() {
  const ext = GAME_STATE?.economy_ext;
  if (!ext) return;

  const strategicList = (typeof STRATEGIC_GOODS !== 'undefined' && Array.isArray(STRATEGIC_GOODS))
    ? STRATEGIC_GOODS : [];

  const EPS = 0.01;
  const prodByNation = {};  // { good: { nationId: amount } }
  for (const good of strategicList) prodByNation[good] = {};

  // Аггрегируем производство по регионам нации.
  // Используем region._production_last_tick, который заполняется
  // в routeProductionToLocalStockpiles() перед UI-фазой тика.
  for (const [nId, nation] of Object.entries(GAME_STATE.nations || {})) {
    const regions = nation.regions || [];
    for (const rid of regions) {
      const region = GAME_STATE.regions?.[rid];
      const rp = region?._production_last_tick;
      if (!rp) continue;
      for (const good of strategicList) {
        const amt = rp[good] || 0;
        if (amt > EPS) {
          prodByNation[good][nId] = (prodByNation[good][nId] || 0) + amt;
        }
      }
    }
  }

  const prevMono = Object.assign({}, ext.monopolies || {});
  const newMono  = {};

  for (const good of strategicList) {
    const producers = Object.keys(prodByNation[good]);
    if (producers.length === 1) newMono[good] = producers[0];
  }

  ext.monopolies = newMono;

  // Лог новых и утраченных монополий (для игрока).
  for (const [good, nId] of Object.entries(newMono)) {
    if (prevMono[good] !== nId) {
      addEconomicEvent(`⭐ Монополия: ${nId} — единственный производитель '${good}' (+20% цена продажи).`);
    }
  }
  for (const [good, nId] of Object.entries(prevMono)) {
    if (newMono[good] !== nId) {
      addEconomicEvent(`✖ Монополия утрачена: ${nId} на '${good}'.`);
    }
  }

  // Применяем / снимаем дипломатический бонус по разнице состояний.
  try {
    _applyMonopolyDiplomacyDelta(newMono);
  } catch (e) {
    console.warn('[economy_ext:mono_dipl]', e);
  }
}

// ──────────────────────────────────────────────────────────────
// getMonopolyPriceMult(nationId, good)
//
// Множитель продажной цены для указанной нации при торговле
// стратегическим товаром. Возвращает:
//   1.20 — если nationId владеет монополией на good;
//   1.00 — во всех остальных случаях.
//
// Используется в engine/economy.js → processTrade().
// ──────────────────────────────────────────────────────────────
function getMonopolyPriceMult(nationId, good) {
  const mono = GAME_STATE?.economy_ext?.monopolies?.[good];
  return (mono && mono === nationId) ? (1 + MONOPOLY_PRICE_BONUS) : 1.0;
}

// ──────────────────────────────────────────────────────────────
// _applyMonopolyDiplomacyDelta(newMono)
//
// Считает ТЕКУЩИЙ желаемый бонус к rel.score для каждой пары
// (монополист, партнёр) и приводит фактическое значение rel.score к
// этому без накопления. Последний применённый бонус хранится в
// rel.flags._mono_bonus_applied.
//
// «Партнёр-импортёр» — любая нация из monoNation.economy.trade_routes,
// не являющаяся самим монополистом.
// ──────────────────────────────────────────────────────────────
function _applyMonopolyDiplomacyDelta(newMono) {
  const diplo = GAME_STATE?.diplomacy;
  if (!diplo || !diplo.relations) return;

  // 1. Считаем желаемую величину бонуса для каждой пары.
  const desired = {};  // { relKey: bonus }

  for (const [good, monoId] of Object.entries(newMono || {})) {
    const monoNation = GAME_STATE.nations?.[monoId];
    if (!monoNation) continue;
    const partners = monoNation.economy?.trade_routes || [];
    for (const pId of partners) {
      if (pId === monoId) continue;
      if (!GAME_STATE.nations?.[pId]) continue;
      const key = _ecoExtRelKey(monoId, pId);
      desired[key] = (desired[key] || 0) + MONOPOLY_DIPLOMACY_BONUS;
    }
  }

  // 2. Собираем все ключи которые нужно рассмотреть: новые + ранее помеченные.
  const keys = new Set(Object.keys(desired));
  for (const [k, rel] of Object.entries(diplo.relations)) {
    if (rel?.flags?._mono_bonus_applied) keys.add(k);
  }

  // 3. Приводим rel.score к desired, сохраняя инвариант в rel.flags.
  for (const key of keys) {
    const rel = diplo.relations[key];
    if (!rel) continue;
    if (!rel.flags) rel.flags = {};
    const prev = rel.flags._mono_bonus_applied || 0;
    const want = desired[key] || 0;
    if (want !== prev) {
      rel.score = (Number(rel.score) || 0) + (want - prev);
      if (want === 0) {
        delete rel.flags._mono_bonus_applied;
      } else {
        rel.flags._mono_bonus_applied = want;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ЭТАП 3 — СПЕЦИАЛИЗАЦИЯ РЕГИОНА
//
// Регион, производящий один и тот же «ведущий» товар N ходов подряд
// без перебоев, получает накопительный +5% к эффективности ЭТОГО
// товара за каждые SPEC_STREAK_WINDOW ходов streak'а, до SPEC_MAX_BONUS.
//
// Данные хранятся в
//   GAME_STATE.economy_ext.region_specialization[regionId] = {
//     good:   'wheat',     // топ-товар региона в прошедшем тике
//     streak: 12,          // сколько тиков подряд он оставался топом
//     bonus:  1.05,        // мультипликатор эффективности (1.0–1.25)
//   }
//
// Сброс:
//   • «Смена» — топ-товар этого тика отличается от spec.good
//     → streak=1, bonus=1.00
//   • «Дефицит» — в этом тике регион вообще ничего не произвёл
//     (нет позиций в _production_last_tick или все < EPS)
//     → запись удаляется полностью
//
// Применение:
//   getRegionSpecBonus(rid, good) возвращает bonus (≥1.0) если good ===
//   spec.good, иначе 1.0. Используется в
//   engine/economy.js → routeProductionToLocalStockpiles, где
//   специализированный товар получает прирост перед подсчётом overflow.
// ══════════════════════════════════════════════════════════════

const SPEC_STREAK_WINDOW = 10;    // один «шаг» бонуса — 10 ходов streak'а
const SPEC_STEP_BONUS    = 0.05;  // +5% за шаг
const SPEC_MAX_BONUS     = 0.25;  // потолок +25%
const SPEC_EPS           = 0.01;  // порог «реального» производства

// ──────────────────────────────────────────────────────────────
// updateRegionSpecialization()
//
// Проходит по всем регионам, определяет топ-товар текущего тика
// из region._production_last_tick и обновляет запись специализации.
// ──────────────────────────────────────────────────────────────
function updateRegionSpecialization() {
  const ext = GAME_STATE?.economy_ext;
  if (!ext) return;
  if (!ext.region_specialization) ext.region_specialization = {};
  const spec = ext.region_specialization;

  const regions = GAME_STATE?.regions || {};
  for (const rid of Object.keys(regions)) {
    const region = regions[rid];
    const prod   = region?._production_last_tick || {};

    // Ищем топ-товар тика.
    let topGood = null;
    let topAmt  = 0;
    for (const [g, a] of Object.entries(prod)) {
      const v = Number(a) || 0;
      if (v > topAmt) { topGood = g; topAmt = v; }
    }

    // Дефицит / полное отсутствие производства — сбросить запись.
    if (!topGood || topAmt < SPEC_EPS) {
      if (spec[rid]) {
        // Логируем только значимые потери (streak достиг бонуса).
        const prev = spec[rid];
        if ((prev.bonus || 1.0) > 1.0) {
          addEconomicEvent(
            `⚙ Регион '${rid}' утратил специализацию (${prev.good}): производство остановлено.`
          );
        }
        delete spec[rid];
      }
      continue;
    }

    const cur = spec[rid];
    if (cur && cur.good === topGood) {
      cur.streak = (Number(cur.streak) || 0) + 1;
    } else {
      if (cur && (cur.bonus || 1.0) > 1.0) {
        addEconomicEvent(
          `⚙ Регион '${rid}' сменил специализацию: ${cur.good} → ${topGood}.`
        );
      }
      spec[rid] = { good: topGood, streak: 1, bonus: 1.0 };
    }

    const entry = spec[rid];
    const steps = Math.floor(entry.streak / SPEC_STREAK_WINDOW);
    const newBonus = 1.0 + Math.min(SPEC_MAX_BONUS, steps * SPEC_STEP_BONUS);

    // Лог только на моментах повышения порога.
    if (newBonus > (entry.bonus || 1.0) + 1e-9) {
      addEconomicEvent(
        `⚙ Регион '${rid}' (${entry.good}) — специализация +${Math.round((newBonus - 1) * 100)}% (streak=${entry.streak}).`
      );
    }
    entry.bonus = newBonus;
  }
}

// ──────────────────────────────────────────────────────────────
// getRegionSpecBonus(regionId, good)
//
// Множитель эффективности производства для указанного региона/товара.
// Возвращает bonus (≥1.0) только если good совпадает со специализацией
// региона; иначе 1.0.
// ──────────────────────────────────────────────────────────────
function getRegionSpecBonus(regionId, good) {
  const entry = GAME_STATE?.economy_ext?.region_specialization?.[regionId];
  if (!entry || entry.good !== good) return 1.0;
  const b = Number(entry.bonus);
  return (isFinite(b) && b > 1.0) ? b : 1.0;
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

  // Этап 2 — обновление монополий (должно выполняться ДО того, как
  // игрок увидит новые данные UI; но ПОСЛЕ того, как в этом тике
  // уже завершена торговля — бонус применяется в следующем тике).
  try { detectMonopolies(); } catch (e) { console.warn('[economy_ext:mono]', e); }

  // Этап 3 — обновление специализации регионов. Бонус, рассчитанный
  // здесь, будет применён к производству СЛЕДУЮЩЕГО тика через
  // getRegionSpecBonus() в routeProductionToLocalStockpiles().
  try { updateRegionSpecialization(); } catch (e) { console.warn('[economy_ext:spec]', e); }

  // Этапы 4–8 подключатся здесь в будущих сессиях:
  //   try { updateInflation();      } catch (e) { console.warn('[economy_ext:infl]', e); }
  //   try { updateEconomicCycle();  } catch (e) { console.warn('[economy_ext:cycle]', e); }
  //   try { updateTechDrift();      } catch (e) { console.warn('[economy_ext:tech]', e); }
}

// Экспорт в window для инспекции из консоли (браузер) и для save/load.
if (typeof window !== 'undefined') {
  window.initEconomyExt      = initEconomyExt;
  window.calcTradeBalance    = calcTradeBalance;
  window.runEconomyExtTick   = runEconomyExtTick;
  window.addEconomicEvent    = addEconomicEvent;

  // Этап 2 — монопольный бонус.
  window.detectMonopolies    = detectMonopolies;
  window.getMonopolyPriceMult = getMonopolyPriceMult;
  window.MONOPOLY_PRICE_BONUS     = MONOPOLY_PRICE_BONUS;
  window.MONOPOLY_DIPLOMACY_BONUS = MONOPOLY_DIPLOMACY_BONUS;

  // Этап 3 — специализация региона.
  window.updateRegionSpecialization = updateRegionSpecialization;
  window.getRegionSpecBonus         = getRegionSpecBonus;
  window.SPEC_STREAK_WINDOW = SPEC_STREAK_WINDOW;
  window.SPEC_STEP_BONUS    = SPEC_STEP_BONUS;
  window.SPEC_MAX_BONUS     = SPEC_MAX_BONUS;
}
