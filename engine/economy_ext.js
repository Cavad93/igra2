// ══════════════════════════════════════════════════════════════
// РАСШИРЕНИЯ ЭКОНОМИКИ — engine/economy_ext.js
//
// План «Улучшения экономики» (docs/economic2.md) — 8 улучшений:
//   1. Торговый баланс (видимость)                ← этап 1 ✔
//   2. Монопольный бонус к цене/дипломатии        ← этап 2 ✔
//   3. Специализация региона                      ← этап 3 ✔
//   4. Инфляция от переполненной казны            ← этап 4 ✔
//   5. Экономические циклы (бум / спад)            ← этап 5 ✔
//   6. Усталость армии от недофинансирования       ← этап 6 ✔
//   7. Рост производительности со временем        ← этап 7 ✔
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

// ══════════════════════════════════════════════════════════════
// ЭТАП 4 — ИНФЛЯЦИЯ ОТ ПЕРЕПОЛНЕННОЙ КАЗНЫ
//
// Суть: казна, превышающая TREASURY_HOARD_RATIO × месячный доход,
// разгоняет ВНУТРЕННИЕ цены закупок на +1% за тик вплоть до
// INFLATION_MAX (25%). Если казна возвращается ниже порога, инфляция
// рассасывается на −1%/тик и постепенно обнуляется. Это мотивирует
// игрока тратить накопления на армию, стройки и займы, а не
// «сидеть на золоте». Дизайн-аналогия: Victoria/Paradox-подход к
// национальным запасам денег (см. Paradox forums — liquidity crisis).
//
// Хранение:
//   GAME_STATE.economy_ext.inflation = { nationId: 0.0–0.25 }
//
// Где применяется:
//   • getInflationMult(nationId) → 1 + inflation[nId] (clamp 1.0–1.25).
//     Используется в engine/buildings.js → procureCapitalInputs() для
//     всех «внутренних» закупок (из региональных / провинциальных
//     складов). Мировой рынок НЕ инфлируется — он внешний.
//   • В казне выводится предупреждение с текущим процентом.
//
// Формула:
//   ratio = treasury / max(1, income_per_turn)
//   target_infl =
//       0                         if ratio <  TREASURY_HOARD_RATIO (3×)
//       INFLATION_STEP × step     if TREASURY_HOARD_RATIO ≤ ratio < 6×
//       INFLATION_STEP × step × 2 if ratio ≥ 6×   (ускорение)
//   cur_infl += sign(target_infl − cur_infl) × INFLATION_STEP
//   cur_infl = clamp(0, INFLATION_MAX)
// ══════════════════════════════════════════════════════════════

const TREASURY_HOARD_RATIO = 3;      // казна > 3× мес. дохода → инфляция
const TREASURY_CRITICAL_RATIO = 6;   // > 6× → ускоренное накопление
const INFLATION_STEP       = 0.01;   // ±1% за ход
const INFLATION_STEP_FAST  = 0.02;   // +2% за ход при ratio ≥ 6×
const INFLATION_MAX        = 0.25;   // потолок +25%
const INFLATION_EPS        = 1e-4;

// ──────────────────────────────────────────────────────────────
// updateInflation()
//
// Раз в тик пересчитывает инфляцию для КАЖДОЙ нации:
//   • ratio = treasury / income_per_turn
//   • при ratio ≥ 3 — растёт (шаг 1% или 2% при ratio ≥ 6)
//   • при ratio <  3 — рассасывается (−1%/ход)
//   • clamp 0…INFLATION_MAX
//
// Логируются только значимые переходы: появление инфляции,
// достижение/снятие максимума и полное обнуление — чтобы не
// заливать event log.
// ──────────────────────────────────────────────────────────────
function updateInflation() {
  const ext = GAME_STATE?.economy_ext;
  if (!ext) return;
  if (!ext.inflation) ext.inflation = {};

  const nations = GAME_STATE?.nations || {};
  for (const [nId, nation] of Object.entries(nations)) {
    const eco = nation?.economy;
    if (!eco) continue;

    const treasury = Number(eco.treasury) || 0;
    const income   = Number(
      eco._income_breakdown?.total ?? eco.income_per_turn ?? 0,
    ) || 0;

    const prev = Number(ext.inflation[nId]) || 0;
    let next   = prev;

    // Если дохода нет — инфляция не должна срываться в бесконечность.
    // Без базы для сравнения считаем ratio = 0 и постепенно снижаем.
    const ratio = income > 0 ? treasury / income : 0;

    if (ratio >= TREASURY_HOARD_RATIO && treasury > 0) {
      const step = (ratio >= TREASURY_CRITICAL_RATIO)
        ? INFLATION_STEP_FAST
        : INFLATION_STEP;
      next = Math.min(INFLATION_MAX, prev + step);
    } else {
      // Казна под контролем — инфляция рассасывается.
      next = Math.max(0, prev - INFLATION_STEP);
      if (next < INFLATION_EPS) next = 0;
    }

    // Лог значимых переходов (только для игрока, чтобы не шуметь).
    const isPlayer = (nId === GAME_STATE.player_nation);
    if (isPlayer) {
      if (prev < INFLATION_EPS && next >= INFLATION_STEP - INFLATION_EPS) {
        addEconomicEvent(
          `💰 Инфляция: казна переполнена (${Math.round(ratio * 10) / 10}× мес. дохода). +${Math.round(next * 100)}% к внутренним ценам.`,
        );
      } else if (prev < INFLATION_MAX - INFLATION_EPS && next >= INFLATION_MAX - INFLATION_EPS) {
        addEconomicEvent(
          `💰 Инфляция достигла потолка: +${Math.round(INFLATION_MAX * 100)}% к внутренним ценам.`,
        );
      } else if (prev > INFLATION_EPS && next === 0) {
        addEconomicEvent('💰 Инфляция рассосалась — внутренние цены вернулись к норме.');
      }
    }

    if (next === 0) delete ext.inflation[nId];
    else ext.inflation[nId] = Math.round(next * 10000) / 10000;
  }
}

// ──────────────────────────────────────────────────────────────
// getInflationMult(nationId)
//
// Возвращает множитель к ВНУТРЕННИМ ценам закупок для указанной нации.
// Диапазон: 1.00 … 1.25.
// Используется в engine/buildings.js → procureCapitalInputs() для
// расчёта оплаты из local/province рынков.
// ──────────────────────────────────────────────────────────────
function getInflationMult(nationId) {
  const ext = GAME_STATE?.economy_ext;
  if (!ext || !ext.inflation) return 1.0;
  const v = Number(ext.inflation[nationId]) || 0;
  if (!isFinite(v) || v <= 0) return 1.0;
  return 1.0 + Math.min(INFLATION_MAX, v);
}

// ══════════════════════════════════════════════════════════════
// ЭТАП 5 — ЭКОНОМИЧЕСКИЕ ЦИКЛЫ (БУМ / СПАД)
//
// Раз в 48–72 хода случайный глобальный сдвиг для продовольствия:
//   • boom       (20%): +15% к производству зерна и другой еды
//   • recession  (20%): −18% к производству
//   • normal     (60%): без изменений
// Длительность активного цикла 6–12 ходов.
//
// Хранение: GAME_STATE.economy_ext.economic_cycle = {
//   current:         'boom' | 'normal' | 'recession',
//   turns_left:      0..12,
//   next_check_turn: turn ≥ которого делается новая проверка,
// }
//
// Применение:
//   getCycleMult(good) — возвращает 1.0 для не-food и для normal,
//   иначе мультипликатор активного цикла. Используется в
//   engine/economy.js → routeProductionToLocalStockpiles().
// ══════════════════════════════════════════════════════════════

const CYCLE_GOODS = ['wheat', 'barley', 'olives', 'grapes', 'fish'];

const CYCLE_TYPES = {
  boom: {
    label: 'Урожайный год',
    mult:  1.15,
    desc:  '+15% к производству зерна и продовольствия',
  },
  recession: {
    label: 'Неурожайный год',
    mult:  0.82,
    desc:  '−18% к производству зерна и продовольствия',
  },
  normal: {
    label: 'Нормальный год',
    mult:  1.0,
    desc:  '',
  },
};

const CYCLE_CHECK_MIN = 48;     // мин. интервал между проверками
const CYCLE_CHECK_RANGE = 24;   // диапазон случайной задержки (48..71)
const CYCLE_DUR_MIN  = 6;       // мин. длина активного цикла
const CYCLE_DUR_RANGE = 7;      // случайная добавка (6..12)
const CYCLE_BOOM_PROB = 0.20;
const CYCLE_RECESSION_PROB = 0.20;

// ──────────────────────────────────────────────────────────────
// updateEconomicCycle()
//
// Раз в тик:
//   1) Если активен ненормальный цикл — уменьшает turns_left.
//      При обнулении возвращает state в 'normal'.
//   2) Если turn ≥ next_check_turn — делает roll:
//      20% boom, 20% recession, 60% normal. При активации задаёт
//      случайную длительность 6–12 ходов и логгирует событие.
//      Следующая проверка отложена на 48–71 ходов вперёд.
//
// Последовательность защищена: новая проверка не делается, пока
// длится активный цикл.
// ──────────────────────────────────────────────────────────────
function updateEconomicCycle() {
  const ext = GAME_STATE?.economy_ext;
  if (!ext) return;
  if (!ext.economic_cycle) {
    ext.economic_cycle = { current: 'normal', turns_left: 0, next_check_turn: CYCLE_CHECK_MIN };
  }
  const cycle = ext.economic_cycle;
  const turn  = Number(GAME_STATE?.turn) || 0;

  // 1) Активный цикл — отсчёт ходов до завершения.
  if (cycle.current && cycle.current !== 'normal' && (cycle.turns_left || 0) > 0) {
    cycle.turns_left = (Number(cycle.turns_left) || 0) - 1;
    if (cycle.turns_left <= 0) {
      const prev = cycle.current;
      addEconomicEvent(`📅 ${CYCLE_TYPES[prev]?.label || prev} завершился.`);
      cycle.current = 'normal';
      cycle.turns_left = 0;
      // Следующая проверка — через стандартный интервал.
      cycle.next_check_turn = turn + CYCLE_CHECK_MIN + Math.floor(Math.random() * CYCLE_CHECK_RANGE);
    }
    return;
  }

  // 2) Ждём очередную проверку.
  if (turn < (Number(cycle.next_check_turn) || 0)) return;

  // Сдвигаем след. проверку даже если выпал normal.
  cycle.next_check_turn = turn + CYCLE_CHECK_MIN + Math.floor(Math.random() * CYCLE_CHECK_RANGE);

  const roll = Math.random();
  if (roll < CYCLE_BOOM_PROB) {
    cycle.current    = 'boom';
    cycle.turns_left = CYCLE_DUR_MIN + Math.floor(Math.random() * CYCLE_DUR_RANGE);
    addEconomicEvent(`🌾 ${CYCLE_TYPES.boom.label}! ${CYCLE_TYPES.boom.desc} (${cycle.turns_left} ходов).`);
  } else if (roll < CYCLE_BOOM_PROB + CYCLE_RECESSION_PROB) {
    cycle.current    = 'recession';
    cycle.turns_left = CYCLE_DUR_MIN + Math.floor(Math.random() * CYCLE_DUR_RANGE);
    addEconomicEvent(`🌧 ${CYCLE_TYPES.recession.label}! ${CYCLE_TYPES.recession.desc} (${cycle.turns_left} ходов).`);
  } else {
    // Нормальный год — без события, просто фиксируем перенос проверки.
    cycle.current    = 'normal';
    cycle.turns_left = 0;
  }
}

// ──────────────────────────────────────────────────────────────
// getCycleMult(good)
//
// Множитель производства для указанного товара с учётом текущего
// глобального экономического цикла. Возвращает:
//   • 1.0   — для товаров не из CYCLE_GOODS и для normal-цикла;
//   • 1.15  — boom + продовольствие;
//   • 0.82  — recession + продовольствие.
// ──────────────────────────────────────────────────────────────
function getCycleMult(good) {
  const cycle = GAME_STATE?.economy_ext?.economic_cycle;
  if (!cycle || !cycle.current || cycle.current === 'normal') return 1.0;
  if (!CYCLE_GOODS.includes(good)) return 1.0;
  const def = CYCLE_TYPES[cycle.current];
  return def ? Number(def.mult) || 1.0 : 1.0;
}

// ──────────────────────────────────────────────────────────────
// getEconomicCycleBanner() — HTML-блок для UI-вкладки экономики.
// Возвращает пустую строку, если активен normal-цикл.
// ──────────────────────────────────────────────────────────────
function getEconomicCycleBanner() {
  const cycle = GAME_STATE?.economy_ext?.economic_cycle;
  if (!cycle || cycle.current === 'normal') return '';
  const info = CYCLE_TYPES[cycle.current];
  if (!info) return '';
  const color = cycle.current === 'boom' ? '#44cc44' : '#cc6644';
  const left  = Number(cycle.turns_left) || 0;
  return `<div class="eco-cycle-banner" style="border-left:3px solid ${color};padding:6px 10px;margin:6px 0;background:rgba(0,0,0,0.2);">
    <strong>${info.label}</strong> — ещё ${left} ходов<br>
    <small>${info.desc}</small>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ЭТАП 6 — УСТАЛОСТЬ АРМИИ ОТ НЕДОФИНАНСИРОВАНИЯ
//
// Если расходы на армию (эффективные, после ползунка expense_levels.army)
// падают ниже 80% от номинального значения (base upkeep по INFANTRY/
// CAVALRY/MERCENARY_UPKEEP), боевая эффективность нации линейно
// снижается до минимального уровня ARMY_UNDERFUND_PENALTY (0.85 при
// ratio = 0). При ratio ≥ 0.80 штрафа нет.
//
// Данные для ratio берутся из GAME_STATE.nations[id].economy._expense_breakdown,
// который заполняется в engine/economy.js → updateTreasury():
//   army_base                                — нормальный upkeep без ползунка
//   army_infantry + army_cavalry + army_mercenaries — фактически выплаченное
//
// Нормализация:
//   ratio = actualExpense / normalExpense ∈ [0, 1]
// Таким образом:
//   • expense_levels.army = 1.0 и полная выплата → ratio = 1.0, mult = 1.0
//   • expense_levels.army = 0.5 и полная выплата → ratio = 0.5, mult ∈ [0.85, 1.0]
//   • expense_levels.army = 0.0 → ratio = 0, mult = 0.85 (максимальный штраф)
//
// Применение: calculateMilitaryStrength() (engine/battle.js) умножает
// итоговую силу нации на getArmyCombatMult(nationId) перед броском.
//
// UI: _tpRenderArmyFunding() в ui/treasury-panel.js добавляет
// предупреждение в панели «Торговый баланс за ход», когда ratio < 0.80.
// ══════════════════════════════════════════════════════════════

const ARMY_UNDERFUND_THRESHOLD = 0.80;  // ниже 80% от нормы — штраф
const ARMY_UNDERFUND_PENALTY   = 0.85;  // мин. множитель боевой силы

// ──────────────────────────────────────────────────────────────
// calcNormalArmyExpense(nationId)
//
// Нормальный upkeep по текущему составу армии без учёта ползунка.
// Использует CONFIG.BALANCE.*_UPKEEP — ровно то же, что
// engine/economy.js → updateTreasury() до умножения на armyLvl.
// Fallback: если CONFIG недоступен (Node-stubs тесты) — плоские
// весовые коэффициенты (infantry 2, cavalry 4, mercenaries 3).
// ──────────────────────────────────────────────────────────────
function calcNormalArmyExpense(nationId) {
  const nation = GAME_STATE?.nations?.[nationId];
  if (!nation) return 0;
  const mil = nation.military || {};

  // Сначала пробуем уже вычисленный кэш из expense_breakdown —
  // там лежит base, подсчитанный в тот же тик.
  const eb = nation.economy?._expense_breakdown || {};
  const cachedBase = Number(eb.army_base);
  if (Number.isFinite(cachedBase) && cachedBase >= 0 && (eb.army_infantry != null)) {
    return cachedBase;
  }

  // Fallback: пересобираем вручную по CONFIG.BALANCE.
  const cfg = (typeof CONFIG !== 'undefined') ? CONFIG?.BALANCE : null;
  const infRate  = cfg?.INFANTRY_UPKEEP  ?? 2;
  const cavRate  = cfg?.CAVALRY_UPKEEP   ?? 4;
  const mercRate = cfg?.MERCENARY_UPKEEP ?? 3;
  const inf  = Number(mil.infantry)    || 0;
  const cav  = Number(mil.cavalry)     || 0;
  const merc = Number(mil.mercenaries) || 0;
  return inf * infRate + cav * cavRate + merc * mercRate;
}

// ──────────────────────────────────────────────────────────────
// getArmyFundingRatio(nationId)
//
// Возвращает долю фактически выплаченных военных расходов от
// нормального upkeep [0, 1]. 1.0 — полное финансирование,
// 0.0 — полностью прекращено.
// ──────────────────────────────────────────────────────────────
function getArmyFundingRatio(nationId) {
  const nation = GAME_STATE?.nations?.[nationId];
  if (!nation) return 1.0;

  const normalExpense = calcNormalArmyExpense(nationId);
  if (!(normalExpense > 0)) return 1.0;  // нет армии — нет штрафа

  // Актуальные выплаты текущего тика (effArmy*).
  const eb = nation.economy?._expense_breakdown || {};
  let actualExpense;
  if (eb.army_infantry != null || eb.army_cavalry != null || eb.army_mercenaries != null) {
    actualExpense =
      (Number(eb.army_infantry)    || 0) +
      (Number(eb.army_cavalry)     || 0) +
      (Number(eb.army_mercenaries) || 0);
  } else {
    // До первого запуска updateTreasury() — считаем нормой.
    const lvl = Number(nation.economy?.expense_levels?.army);
    const armyLvl = Number.isFinite(lvl) ? Math.max(0, Math.min(1.5, lvl)) : 1.0;
    actualExpense = normalExpense * armyLvl;
  }

  const ratio = actualExpense / normalExpense;
  if (!Number.isFinite(ratio) || ratio < 0) return 0;
  return Math.min(1.0, ratio);
}

// ──────────────────────────────────────────────────────────────
// getArmyCombatMult(nationId)
//
// Множитель силы армии в бою. 1.0 если финансирование ≥ 80%,
// линейно падает до ARMY_UNDERFUND_PENALTY = 0.85 при ratio = 0.
// ──────────────────────────────────────────────────────────────
function getArmyCombatMult(nationId) {
  const ratio = getArmyFundingRatio(nationId);
  if (ratio >= ARMY_UNDERFUND_THRESHOLD) return 1.0;
  // Линейная интерполяция: ratio=0 → PENALTY, ratio=THRESHOLD → 1.0
  const t = ratio / ARMY_UNDERFUND_THRESHOLD;
  return ARMY_UNDERFUND_PENALTY + (1.0 - ARMY_UNDERFUND_PENALTY) * t;
}

// ──────────────────────────────────────────────────────────────
// updateArmyFunding()
//
// Раз в тик считает ratio/mult для всех наций и кэширует результат
// в nation.economy._army_funding = { ratio, mult }. Используется UI
// (treasury-panel) и облегчает инспекцию из консоли. Логирует
// появление/снятие штрафа у игрока.
// ──────────────────────────────────────────────────────────────
function updateArmyFunding() {
  const nations = GAME_STATE?.nations;
  if (!nations) return;

  const playerId = GAME_STATE.player_nation;
  for (const nId of Object.keys(nations)) {
    const nation = nations[nId];
    if (!nation || !nation.economy) continue;

    const ratio = getArmyFundingRatio(nId);
    const mult  = getArmyCombatMult(nId);

    const prev = nation.economy._army_funding || null;
    nation.economy._army_funding = {
      ratio: Number(ratio.toFixed(3)),
      mult:  Number(mult.toFixed(3)),
    };

    // Логи только для игрока и только при переходах порога.
    if (nId === playerId) {
      const prevUnder = !!(prev && prev.ratio < ARMY_UNDERFUND_THRESHOLD);
      const curUnder  = ratio < ARMY_UNDERFUND_THRESHOLD;
      if (curUnder && !prevUnder) {
        addEconomicEvent(
          `⚔ Армия недофинансирована: ${Math.round(ratio * 100)}% нормы — боевая сила ×${mult.toFixed(2)}.`
        );
      } else if (!curUnder && prevUnder) {
        addEconomicEvent('⚔ Армия вновь полностью финансируется — штраф снят.');
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ЭТАП 7 — РОСТ ПРОИЗВОДИТЕЛЬНОСТИ СО ВРЕМЕНЕМ (ТЕХНОЛОГИЧЕСКИЙ ДРЕЙФ)
//
// Каждые TECH_DRIFT_INTERVAL (120 ходов = 10 лет) нация-мир получает
// +2% к эффективности ВСЕХ зданий, до потолка +20% (5 шагов × 120 ходов
// = 600 ходов / 50 лет игры). Глобальный, не привязан к отдельной нации —
// моделирует совершенствование ремёсел и технологий.
//
// Данные: GAME_STATE.economy_ext.tech_drift = { bonus, last_tick }
//   • bonus     — текущий глобальный мультипликатор (0.0–0.20)
//   • last_tick — ход, на котором последний раз применили инкремент
//
// Применение: getTechDriftMult() → 1.0 + bonus. Используется в
// engine/economy.js → routeProductionToLocalStockpiles() — бонус
// прибавляется к зданиям по каждому региону (НЕ к неорганизованному
// производству, что логично: организованные мастерские впитывают
// технологический прогресс первыми).
// ══════════════════════════════════════════════════════════════

const TECH_DRIFT_INTERVAL = 120;   // раз в 120 ходов (≈10 лет)
const TECH_DRIFT_STEP     = 0.02;  // +2% за шаг
const TECH_DRIFT_MAX      = 0.20;  // потолок +20%

// ──────────────────────────────────────────────────────────────
// updateTechDrift()
//
// Раз в тик проверяет turn − last_tick ≥ TECH_DRIFT_INTERVAL и
// прибавляет TECH_DRIFT_STEP к tech_drift.bonus (с clamp до MAX).
// Инициализирует запись при первом вызове. Логирует каждое
// срабатывание через addEconomicEvent().
//
// Замечание: last_tick может сдвигаться на несколько интервалов
// сразу, если тиков прошло больше одного TECH_DRIFT_INTERVAL
// (например, после загрузки старого сейва). Обрабатываем это
// в цикле, чтобы «догнать» пропущенные шаги.
// ──────────────────────────────────────────────────────────────
function updateTechDrift() {
  const ext = GAME_STATE?.economy_ext;
  if (!ext) return;
  if (!ext.tech_drift) ext.tech_drift = { bonus: 0, last_tick: 0 };
  const td = ext.tech_drift;

  const turn = Number(GAME_STATE?.turn) || 0;
  if (!Number.isFinite(td.last_tick)) td.last_tick = 0;
  if (!Number.isFinite(td.bonus))     td.bonus     = 0;

  // Пока не упёрлись в потолок и прошёл целый интервал — докидываем шаги.
  while (td.bonus + 1e-9 < TECH_DRIFT_MAX && (turn - td.last_tick) >= TECH_DRIFT_INTERVAL) {
    td.bonus = Math.min(TECH_DRIFT_MAX, td.bonus + TECH_DRIFT_STEP);
    td.last_tick += TECH_DRIFT_INTERVAL;
    addEconomicEvent(
      `⚒ Ремёсла развились. Производительность зданий: +${Math.round(td.bonus * 100)}%.`
    );
  }
  // Если упёрлись в потолок — сдвигаем last_tick так, чтобы не логировать больше.
  if (td.bonus + 1e-9 >= TECH_DRIFT_MAX) {
    td.bonus = TECH_DRIFT_MAX;
    // Не даём last_tick уехать далеко за turn — фиксируем последний разумный шаг.
    if (turn - td.last_tick >= TECH_DRIFT_INTERVAL) {
      td.last_tick = turn - (turn - td.last_tick) % TECH_DRIFT_INTERVAL;
    }
  }
}

// ──────────────────────────────────────────────────────────────
// getTechDriftMult()
//
// Глобальный множитель производительности зданий. В начале игры = 1.0;
// постепенно растёт до 1.20. Используется в
// engine/economy.js → routeProductionToLocalStockpiles() как третий
// этап обработки (после spec-бонуса и cycle-мультипликатора).
// ──────────────────────────────────────────────────────────────
function getTechDriftMult() {
  const b = Number(GAME_STATE?.economy_ext?.tech_drift?.bonus);
  if (!Number.isFinite(b) || b <= 0) return 1.0;
  return 1.0 + Math.min(TECH_DRIFT_MAX, b);
}

// ──────────────────────────────────────────────────────────────
// renderTechDrift() — короткий HTML-блок для ui/economy_tab.js.
// ──────────────────────────────────────────────────────────────
function renderTechDrift() {
  const td = GAME_STATE?.economy_ext?.tech_drift;
  const b  = Number(td?.bonus) || 0;
  if (b < 0.01) {
    return '<div class="eco-tech-none" style="font-size:11px;color:#888;">⚒ Уровень ремёсел: базовый</div>';
  }
  const pct = Math.round(b * 100);
  return `<div class="eco-tech-level" style="font-size:11px;color:#aacc66;">⚒ Уровень ремёсел: +${pct}% к производству зданий</div>`;
}

// ══════════════════════════════════════════════════════════════
// ЭТАП 8 — тултипы эффективности производства.
// ══════════════════════════════════════════════════════════════
//
// Задача — объяснить игроку почему производство региона такое,
// какое оно есть. Возвращаем HTML-блок со строками активных
// бонусов/штрафов:
//   • «Неорганизованное производство: −35% эффективность»
//     (если в регионе нет ни одного активного здания)
//   • «Специализация (good, N ходов): +X%»  (Этап 3)
//   • «Уровень ремёсел: +X%»                 (Этап 7)
//   • «Экономический цикл: ±X% к зерну»      (Этап 5)
//
// Числа согласованы с движком:
//   — SUBSISTENCE_FACTOR = 0.65 (см. engine/economy.js), поэтому
//     штраф неорганизованного производства = 1 − 0.65 = 0.35 (35%).
//   — Спец-бонус читается напрямую из economy_ext.region_specialization.
//   — Tech-дрейф — глобальный, одинаковый для всех регионов.
//   — Цикл — глобальный, но применяется только к CYCLE_GOODS.
//
// Если активных бонусов/штрафов нет — возвращается пустая строка
// (чтобы не плодить лишних блоков в UI).
// ──────────────────────────────────────────────────────────────

// Процент неэффективности неорганизованного производства:
// 1 − SUBSISTENCE_FACTOR (0.65) = 0.35 (то есть −35%).
const UNORGANIZED_PENALTY = 0.35;

// ──────────────────────────────────────────────────────────────
// hasRegionBuildings(region) — true, если в регионе есть хотя бы
// один активный build-slot. Используется для решения, показывать
// ли предупреждение «−35% эффективность».
// ──────────────────────────────────────────────────────────────
function hasRegionBuildings(region) {
  if (!region) return false;
  const slots = region.building_slots;
  if (!slots) return false;
  const arr = Array.isArray(slots) ? slots : Object.values(slots);
  for (const slot of arr) {
    if (!slot) continue;
    // В реальной игре используются статусы 'active' / 'building' / ...
    // Считаем регион «организованным», если есть хоть один слот
    // со статусом active (production идёт) либо с явно назначенным
    // building_id в активной стадии. Для обратной совместимости
    // c планом из economic2.md также принимаем поле slot.type.
    if (slot.status === 'active') return true;
    if (slot.type && slot.status === undefined) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────
// renderRegionProductionEfficiency(regionId)
//   Строит HTML-блок с активными бонусами/штрафами для данного
//   региона. Возвращает '' если отображать нечего.
// ──────────────────────────────────────────────────────────────
function renderRegionProductionEfficiency(regionId) {
  if (typeof GAME_STATE === 'undefined' || !GAME_STATE) return '';
  const region = GAME_STATE.regions?.[regionId];
  if (!region) return '';

  const ext    = GAME_STATE.economy_ext || {};
  const rows   = [];

  // 1) Неорганизованное производство.
  if (!hasRegionBuildings(region)) {
    const pct = Math.round(UNORGANIZED_PENALTY * 100);
    rows.push(
      `<div class="eco-eff-row eco-eff-warn">` +
        `⚠ Неорганизованное производство: −${pct}% эффективность` +
        `<span class="eco-eff-hint">Постройте здания для полной отдачи</span>` +
      `</div>`
    );
  }

  // 2) Специализация региона (Этап 3).
  const spec = ext.region_specialization?.[regionId];
  const specBonus = Number(spec?.bonus) || 1.0;
  if (spec && specBonus > 1.0 + 1e-9) {
    const goodDef = typeof GOODS !== 'undefined' ? GOODS[spec.good] : null;
    const goodLabel = goodDef?.name || spec.good;
    const streak = Number(spec.streak) || 0;
    const pct    = Math.round((specBonus - 1) * 100);
    rows.push(
      `<div class="eco-eff-row eco-eff-pos">` +
        `⚙ Специализация (${goodLabel}, ${streak} ходов): +${pct}%` +
      `</div>`
    );
  }

  // 3) Глобальный технологический дрейф (Этап 7).
  const techMult = typeof getTechDriftMult === 'function' ? getTechDriftMult() : 1.0;
  if (techMult > 1.0 + 1e-9) {
    const pct = Math.round((techMult - 1) * 100);
    rows.push(
      `<div class="eco-eff-row eco-eff-pos">` +
        `⚒ Уровень ремёсел: +${pct}%` +
      `</div>`
    );
  }

  // 4) Глобальный экономический цикл (Этап 5). Применяется только
  // к CYCLE_GOODS, поэтому показываем пояснение «к зерну».
  const cycle = ext.economic_cycle;
  if (cycle && cycle.current && cycle.current !== 'normal') {
    const isBoom = cycle.current === 'boom';
    const mult   = (typeof CYCLE_TYPES !== 'undefined' && CYCLE_TYPES[cycle.current]?.mult) || 1.0;
    const pct    = Math.round((mult - 1) * 100);
    const sign   = pct > 0 ? '+' : '';
    const icon   = isBoom ? '🌾' : '🌧';
    const cls    = isBoom ? 'eco-eff-pos' : 'eco-eff-neg';
    rows.push(
      `<div class="eco-eff-row ${cls}">` +
        `${icon} Экономический цикл: ${sign}${pct}% к зерну` +
      `</div>`
    );
  }

  if (rows.length === 0) return '';
  return `<div class="eco-eff-block">${rows.join('')}</div>`;
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

  // Этап 4 — инфляция от переполненной казны. Пересчитываем для всех
  // наций, затем getInflationMult() применяется к внутренним закупкам
  // в engine/buildings.js → procureCapitalInputs() (прово- и местный
  // уровни). Мировой рынок (внешние цены) остаётся незатронутым.
  try { updateInflation(); } catch (e) { console.warn('[economy_ext:infl]', e); }

  // Этап 5 — глобальный экономический цикл (бум/спад). Активный цикл
  // умножает производство продовольствия (CYCLE_GOODS) в
  // routeProductionToLocalStockpiles() через getCycleMult().
  try { updateEconomicCycle(); } catch (e) { console.warn('[economy_ext:cycle]', e); }

  // Этап 6 — усталость армии от недофинансирования. Сам штраф не
  // накапливается и считается «на лету» через getArmyCombatMult(nationId)
  // в calculateMilitaryStrength() (engine/battle.js), поэтому здесь
  // достаточно пересчитать и закэшировать ratio/mult на каждого игрока
  // для UI-вывода (badge в казне).
  try { updateArmyFunding(); } catch (e) { console.warn('[economy_ext:army_fund]', e); }

  // Этап 7 — технологический дрейф: +2% к производству зданий каждые
  // 120 ходов (до потолка +20%). Применяется в
  // routeProductionToLocalStockpiles() через getTechDriftMult().
  try { updateTechDrift(); } catch (e) { console.warn('[economy_ext:tech]', e); }
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

  // Этап 4 — инфляция от переполненной казны.
  window.updateInflation   = updateInflation;
  window.getInflationMult  = getInflationMult;
  window.TREASURY_HOARD_RATIO    = TREASURY_HOARD_RATIO;
  window.TREASURY_CRITICAL_RATIO = TREASURY_CRITICAL_RATIO;
  window.INFLATION_STEP          = INFLATION_STEP;
  window.INFLATION_STEP_FAST     = INFLATION_STEP_FAST;
  window.INFLATION_MAX           = INFLATION_MAX;

  // Этап 5 — экономические циклы.
  window.updateEconomicCycle    = updateEconomicCycle;
  window.getCycleMult           = getCycleMult;
  window.getEconomicCycleBanner = getEconomicCycleBanner;
  window.CYCLE_GOODS            = CYCLE_GOODS;
  window.CYCLE_TYPES            = CYCLE_TYPES;

  // Этап 6 — усталость армии от недофинансирования.
  window.calcNormalArmyExpense   = calcNormalArmyExpense;
  window.getArmyFundingRatio     = getArmyFundingRatio;
  window.getArmyCombatMult       = getArmyCombatMult;
  window.updateArmyFunding       = updateArmyFunding;
  window.ARMY_UNDERFUND_THRESHOLD = ARMY_UNDERFUND_THRESHOLD;
  window.ARMY_UNDERFUND_PENALTY   = ARMY_UNDERFUND_PENALTY;

  // Этап 7 — технологический дрейф (рост производительности зданий).
  window.updateTechDrift    = updateTechDrift;
  window.getTechDriftMult   = getTechDriftMult;
  window.renderTechDrift    = renderTechDrift;
  window.TECH_DRIFT_INTERVAL = TECH_DRIFT_INTERVAL;
  window.TECH_DRIFT_STEP     = TECH_DRIFT_STEP;
  window.TECH_DRIFT_MAX      = TECH_DRIFT_MAX;

  // Этап 8 — тултипы эффективности производства.
  window.hasRegionBuildings             = hasRegionBuildings;
  window.renderRegionProductionEfficiency = renderRegionProductionEfficiency;
  window.UNORGANIZED_PENALTY            = UNORGANIZED_PENALTY;
}
