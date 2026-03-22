// ══════════════════════════════════════════════════════════════
// РЫНОЧНЫЙ ДВИЖОК — engine/market.js
//
// Извлечено из engine/economy.js (Этап 8) для явного разделения:
//   • engine/economy.js → оркестрация тика (производство, потребление, казна)
//   • engine/market.js  → алгоритм ценообразования (трёхзонная логика)
//
// Загружать ДО engine/economy.js в index.html.
//
// Алгоритм трёх зон (по мировому складу vs. целевой запас):
//   ДЕФИЦИТ  (stockpile < 0.5×target) → экспоненциальный рост цены
//   БАЛАНС   (0.5…2.0×target)         → плавные колебания ±5%/тик
//   ИЗБЫТОК  (stockpile > 2.0×target) → медленное снижение
//
// Нижняя граница цены:
//   price_floor = production_cost×0.5  (если известна)  иначе  base×0.5
//
// Сглаживание: изменение ≤ 30% за тик (инерция рынка).
// ══════════════════════════════════════════════════════════════

const _MARKET_SMOOTHING  = 0.30;   // скорость сглаживания (30% за тик)
const _BALANCE_SENS      = 0.05;   // чувствительность зоны баланса (±5% / тик)
const _SURPLUS_RATE      = 0.03;   // скорость снижения цены в зоне избытка
const _DEFICIT_INTENSITY = 0.10;   // базовый множитель дельты в зоне дефицита

// Компенсация ненаписанных наций.
// Пока не все нации/регионы реализованы, реальный спрос занижен:
// производство есть, потребителей нет → хронический избыток.
// Множитель искусственно увеличивает demand-сторону баланса,
// имитируя спрос тех наций, которые ещё не добавлены в игру.
//
// Как подбирать:
//   1.0 = все нации написаны, балансировать нечего
//   2.0 = реализована примерно половина наций
//   3.0 = реализована ~треть (текущее состояние разработки)
// Убирать постепенно по мере добавления новых наций.
const _MISSING_NATIONS_DEMAND_MULT = 3.0;

// ──────────────────────────────────────────────────────────────
// updateMarketPrices(totalProduced, totalConsumed)
//
// totalProduced: { nationId: { good: amount } }
// totalConsumed: { nationId: { good: amount } }
//
// Обновляет GAME_STATE.market[good]:
//   price, price_floor, world_stockpile, shortage_streak, price_history
// ──────────────────────────────────────────────────────────────

function updateMarketPrices(totalProduced, totalConsumed) {
  // ── 1. Агрегируем мировые supply / demand ────────────────────────────────
  const worldSupply = {};
  const worldDemand = {};

  for (const goods of Object.values(totalProduced)) {
    for (const [good, amount] of Object.entries(goods)) {
      worldSupply[good] = (worldSupply[good] || 0) + amount;
    }
  }
  for (const consumed of Object.values(totalConsumed)) {
    for (const [good, amount] of Object.entries(consumed)) {
      worldDemand[good] = (worldDemand[good] || 0) + amount;
    }
  }

  // ── 2. Трёхзонная ценовая логика ─────────────────────────────────────────
  for (const [good, market] of Object.entries(GAME_STATE.market)) {
    const supply = worldSupply[good] || 0;
    const demand = worldDemand[good] || market.demand || 1;

    // Сохраняем агрегаты для совместимости со старым кодом
    market.supply = supply;
    market.demand = demand;

    // Метаданные из GOODS (elasticity, stockpile_target_turns)
    const goodDef        = typeof GOODS !== 'undefined' ? GOODS[good] : null;
    const targetTurns    = goodDef?.stockpile_target_turns ?? 4;
    const elasticity     = goodDef?.price_elasticity      ?? 1.0;
    const base           = market.base;

    // Инициализация мирового склада при первом тике.
    // Берём max(supply, demand) — не заглушку 1000 из nations.js,
    // а реальный объём производства/потребления первого тика.
    if (market.world_stockpile == null) {
      market.world_stockpile = Math.max(supply, demand) * targetTurns;
    }

    // ── 2a. Обновляем мировой склад ──────────────────────────────────────
    // effectiveDemand учитывает ненаписанные нации: пока они не добавлены,
    // их потребление отсутствует, но производство реализованных наций есть.
    const effectiveDemand = demand * _MISSING_NATIONS_DEMAND_MULT;
    market.world_stockpile = Math.max(0, market.world_stockpile + supply - effectiveDemand);
    const stockpileTarget = Math.max(1, effectiveDemand * targetTurns);

    // ── 2b. Нижняя граница цены (production_cost из рецептов) ────────────
    // Флор = max(себестоимость×0.5, base×0.5) — никогда не падает ниже
    // base×0.5, чтобы не возникала петля: цена↓ → себестоимость↓ → флор↓ → цена↓
    const baseFloor = base * 0.5;
    const floor   = (market.production_cost != null)
                    ? Math.max(market.production_cost * 0.5, baseFloor)
                    : baseFloor;
    const ceiling = base * 10;
    market.price_floor = floor;  // обновляем для UI / step 3

    // ── 2c. Зона и дельта ────────────────────────────────────────────────
    let price_delta   = 0;
    const streak      = market.shortage_streak || 0;
    const stockpile   = market.world_stockpile;

    if (stockpile < 0.5 * stockpileTarget) {
      // ЗОНА ДЕФИЦИТА — экспоненциальный рост
      const shortage_mult = Math.exp(streak * 0.15);
      price_delta = base * shortage_mult * _DEFICIT_INTENSITY * elasticity;
      market.shortage_streak = streak + 1;

    } else if (stockpile <= 2.0 * stockpileTarget) {
      // ЗОНА БАЛАНСА — плавные колебания ±5% / тик
      const safeSupply = Math.max(supply, 1);
      price_delta = (demand - safeSupply) / safeSupply * _BALANCE_SENS
                  * market.price * elasticity;
      market.shortage_streak = Math.max(0, streak - 1);

    } else {
      // ЗОНА ИЗБЫТКА — медленное снижение
      const surplus_ratio = Math.min(stockpile / stockpileTarget - 2.0, 3.0);
      price_delta = -base * _SURPLUS_RATE * surplus_ratio * elasticity;
      market.shortage_streak = Math.max(0, streak - 1);
    }

    // ── 2d. Ограничители + сглаживание ──────────────────────────────────
    const rawNew    = market.price + price_delta;
    const clamped   = Math.max(floor, Math.min(ceiling, rawNew));
    const newPrice  = market.price + (clamped - market.price) * _MARKET_SMOOTHING;

    market.price = Math.round(newPrice * 10) / 10;

    // ── 2e. История цен (последние 24 тика) ──────────────────────────────
    if (!Array.isArray(market.price_history)) market.price_history = [];
    market.price_history.push(market.price);
    if (market.price_history.length > 24) market.price_history.shift();
  }
}

// ══════════════════════════════════════════════════════════════
// updateRegionalMarketPrices()
//
// Вызывается в шаге 1.5 runEconomyTick — ПОСЛЕ routeProductionToLocalStockpiles.
//
// Для каждого региона с local_stockpile и _production_last_tick:
//   • Сравнивает local_stockpile[good] с capacity = 3 × production_last_tick[good]
//   • Устанавливает region.local_market[good].price:
//       дефицит (< 50% ёмкости)  → до +20% к мировой цене
//       баланс (50%–200%)         → ±5% к мировой цене
//       избыток (> 200%)          → до −15% к мировой цене
//       товар не производится здесь → мировая цена (транзитный товар)
//   • Сглаживание 30% за тик (чтобы цены не прыгали резко)
//
// Цена ВСЕГДА привязана к мировой цене ± локальная поправка.
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// МИРОВОЙ РЫНОК — доступ, транспортные расходы, квоты
//
// canAccessWorldMarket(nationId) — нация может закупаться на
//   мировом рынке если:
//     1. Есть хотя бы один прибрежный регион (type/terrain = 'coastal_city')
//     2. Есть trade_route с любой нацией ИЛИ 'trade' договор с любым
//        не-воюющим партнёром
//
// getWorldMarketTransportCost(nationId, good) → число 0–0.40
//   base = +25%
//   −10% если есть 'trade' договор с любым партнёром без войны
//   −5%  если нация единственный покупатель этого товара в тике
//   cap  = +40%
//
// computeWorldMarketQuotas() — вызывается в шаге 0 перед procureCapitalInputs.
//   Для каждого товара считает buyer_count и устанавливает
//   market[good]._quota_per_buyer = world_stockpile / buyer_count.
//   Сбрасывает market[good]._world_bought_tick = {}.
// ══════════════════════════════════════════════════════════════

const _WORLD_SEA_COST_BASE      = 0.25;  // базовая морская надбавка
const _WORLD_TREATY_DISCOUNT    = 0.10;  // скидка за торговый договор
const _WORLD_MONOPOLY_DISCOUNT  = 0.05;  // скидка при монопольном маршруте
const _WORLD_COST_CAP           = 0.40;  // максимальная надбавка

// ──────────────────────────────────────────────────────────────
function canAccessWorldMarket(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return false;

  // 1. Прибрежный регион
  const hasCoastal = (nation.regions || []).some(rid => {
    const r = GAME_STATE.regions[rid];
    return r?.type === 'coastal_city' || r?.terrain === 'coastal_city';
  });
  if (!hasCoastal) return false;

  // 2. Торговый маршрут или договор с хотя бы одним не-воюющим партнёром
  const hasRoute   = (nation.economy?.trade_routes || []).length > 0;
  const hasTreaty  = Object.values(nation.relations || {}).some(
    rel => rel.treaties?.includes('trade') && !rel.at_war,
  );
  return hasRoute || hasTreaty;
}

// ──────────────────────────────────────────────────────────────
function getWorldMarketTransportCost(nationId, good) {
  let cost = _WORLD_SEA_COST_BASE;

  const nation = GAME_STATE.nations[nationId];
  if (nation) {
    const hasTreaty = Object.values(nation.relations || {}).some(
      rel => rel.treaties?.includes('trade') && !rel.at_war,
    );
    if (hasTreaty) cost -= _WORLD_TREATY_DISCOUNT;
  }

  // Монопольная скидка — единственный покупатель этого товара в тике
  const buyerCount = GAME_STATE.market[good]?._buyer_count ?? 1;
  if (buyerCount <= 1) cost -= _WORLD_MONOPOLY_DISCOUNT;

  return Math.min(_WORLD_COST_CAP, Math.max(0, cost));
}

// ──────────────────────────────────────────────────────────────
// computeWorldMarketQuotas()
//
// Вызывается перед шагом 0.5 в runEconomyTick.
// Определяет список наций с доступом к мировому рынку,
// распределяет world_stockpile на равные доли между ними.
// Сбрасывает _world_bought_tick для отслеживания тикового объёма.
// ──────────────────────────────────────────────────────────────
function computeWorldMarketQuotas() {
  const buyers = Object.keys(GAME_STATE.nations).filter(canAccessWorldMarket);
  const count  = buyers.length || 1;

  for (const mkt of Object.values(GAME_STATE.market)) {
    mkt._buyer_count      = count;
    mkt._quota_per_buyer  = Math.max(0, (mkt.world_stockpile || 0) / count);
    mkt._world_bought_tick = {};  // { nationId: amount } — сбрасываем каждый тик
  }
}

const _REGIONAL_SMOOTH      = 0.30;  // сглаживание локальной цены за тик
const _REGIONAL_DEFICIT_MAX = 0.20;  // максимальная надбавка при дефиците (+20%)
const _REGIONAL_SURPLUS_MAX = 0.15;  // максимальная скидка при избытке (−15%)
const _REGIONAL_BALANCE_AMP = 0.05;  // амплитуда колебаний в зоне баланса (±5%)

function updateRegionalMarketPrices() {
  for (const region of Object.values(GAME_STATE.regions)) {
    const ls   = region.local_stockpile;
    const prod = region._production_last_tick;

    if (!ls || !prod) continue;
    if (!region.local_market) region.local_market = {};

    // Обновляем цены для всех товаров, присутствующих в local_stockpile
    for (const good of Object.keys(ls)) {
      const worldEntry = GAME_STATE.market[good];
      if (!worldEntry) continue;

      const worldPrice = worldEntry.price;
      const prodAmt    = prod[good] || 0;
      const localStock = ls[good]   || 0;

      let targetPrice;

      if (prodAmt <= 0) {
        // Товар не производится здесь (инструменты/скот как капитал).
        // Транзитная цена = мировая без надбавок.
        targetPrice = worldPrice;

      } else {
        // Локальная ёмкость = 3 месяца производства
        const capacity = prodAmt * 3;

        if (localStock < 0.5 * capacity) {
          // ДЕФИЦИТ → надбавка линейно до +20%
          const t = localStock / (0.5 * capacity);           // 0..1
          targetPrice = worldPrice * (1 + _REGIONAL_DEFICIT_MAX * (1 - t));

        } else if (localStock > 2.0 * capacity) {
          // ИЗБЫТОК → скидка линейно до −15%
          const t = Math.min((localStock / capacity - 2.0) / 2.0, 1.0); // 0..1
          targetPrice = worldPrice * (1 - _REGIONAL_SURPLUS_MAX * t);

        } else {
          // БАЛАНС → малые колебания ±5% пропорционально отклонению от ёмкости
          const deviation = (localStock - capacity) / capacity;  // −0.5..+1.0
          targetPrice = worldPrice * (1 + _REGIONAL_BALANCE_AMP * deviation);
        }
      }

      // Сглаживание: не прыгаем резко между тиками
      const entry = region.local_market[good];
      if (!entry) {
        region.local_market[good] = { price: targetPrice };
      } else {
        entry.price = entry.price * (1 - _REGIONAL_SMOOTH) + targetPrice * _REGIONAL_SMOOTH;
        entry.price = Math.round(entry.price * 10) / 10;
      }
    }
  }
}
