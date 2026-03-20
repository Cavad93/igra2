// ══════════════════════════════════════════════════════════════
// РЕЦЕПТЫ ПРОИЗВОДСТВА — data/recipes.js
//
// Извлечено из data/buildings.js (Этап 8) для явного разделения:
//   • data/buildings.js  — здания, слоты, ограничения местности
//   • data/recipes.js    — производственные цепочки (входы → выходы)
//
// Загружать ДО data/buildings.js в index.html.
//
// Структура записи:
//   output_good           — производимый товар (ключ из GOODS)
//   inputs[]              — { good, amount } потребляется на 1 ед. выхода
//   labor_cost_per_worker — золото/тик на 1 единицу выхода (→ production_cost)
//
// Использование:
//   • engine/buildings.js → processAllRecipes (ratio + вычет входных),
//                           recomputeAllProductionCosts (обновление price_floor)
//   • engine/market.js    → price_floor = production_cost × 0.5
// ══════════════════════════════════════════════════════════════

const BUILDING_RECIPES = {

  // ── Мастерские ────────────────────────────────────────────────────────────
  // Калибровка (400 рабочих, rate 35/1000 → 14 инструментов/тик, base_price 35):
  //   input_costs = 14×(0.30×45 + 0.05×22) = 204  ;  wages = 490×0.28 = 137
  //   net_profit  = 490 − 204 − 137 − 50 ≈ +99  →  прибыльно при базовых ценах
  workshop: [
    {
      output_good:            'tools',
      inputs: [
        { good: 'iron',   amount: 0.30 },  // 0.3 таланта железа + дрова → 1 инструмент
        { good: 'timber', amount: 0.05 },
      ],
      labor_cost_per_worker: 8,
    },
    {
      output_good:            'cloth',
      inputs: [
        { good: 'wool', amount: 0.40 },    // 0.4 тюка шерсти → 1 тюк ткани
      ],
      labor_cost_per_worker: 6,
    },
    {
      output_good:            'pottery',
      inputs: [
        { good: 'timber', amount: 0.10 },  // дрова для обжига
      ],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Давильня ──────────────────────────────────────────────────────────────
  // 200 рабочих, rate 50/1000 → 10 масла/тик, base_price 32:
  //   input_costs = 10×(0.80×18) = 144  ;  wages = 320×0.30 = 96
  //   net_profit  = 320 − 144 − 96 − 50 ≈ +30  →  прибыльно
  oil_press: [
    {
      output_good:            'olive_oil',
      inputs: [
        { good: 'olives', amount: 0.80 },  // 0.8 амфоры оливок → 1 амфора масла
      ],
      labor_cost_per_worker: 5,
    },
  ],

  // ── Винодельня ────────────────────────────────────────────────────────────
  // 200 рабочих, rate 80/1000 → 16 вина/тик, base_price 30:
  //   input_costs = 16×(0.15×7) = 17  ;  wages = 480×0.25 = 120
  //   net_profit  = 480 − 17 − 120 − 50 ≈ +293  →  прибыльно
  winery: [
    {
      output_good:            'wine',
      inputs: [
        { good: 'barley', amount: 0.15 },  // ячмень — зерновая основа брожения
      ],
      labor_cost_per_worker: 7,
    },
  ],

  // ── Гончарная мастерская ──────────────────────────────────────────────────
  pottery_workshop: [
    {
      output_good:            'pottery',
      inputs: [
        { good: 'timber', amount: 0.08 },  // дрова для обжига в гончарных печах
      ],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Рудники ───────────────────────────────────────────────────────────────
  // bronze: 600 рабочих, rate 30/1000 → 18 бронзы/тик, base_price 55:
  //   input_costs = 18×(0.30×45) = 243  ;  wages = 990×0.10 = 99
  //   net_profit  = 990 − 243 − 99 − 50 ≈ +598  →  прибыльно
  mine: [
    {
      output_good:            'iron',
      inputs:                 [],          // прямая добыча руды
      labor_cost_per_worker: 12,
    },
    {
      output_good:            'bronze',
      inputs: [
        { good: 'iron', amount: 0.30 },    // бронза = медь+олово, упрощение: тратит железо
      ],
      labor_cost_per_worker: 15,
    },
  ],

  // ── Солеварня ─────────────────────────────────────────────────────────────
  salt_works: [
    {
      output_good:            'salt',
      inputs:                 [],          // выпаривание морской воды
      labor_cost_per_worker: 6,
    },
  ],

  // ── Лесозаготовка ─────────────────────────────────────────────────────────
  lumber_camp: [
    {
      output_good:            'timber',
      inputs:                 [],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Ферма ─────────────────────────────────────────────────────────────────
  farm: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'barley', inputs: [], labor_cost_per_worker: 3 },
  ],

  // ── Семейная ферма (пшеница) ───────────────────────────────────────────────
  // Посевной фонд: урожайность 1:5 → 0.20 ед. пшеницы на посев = 1 ед. пшеницы.
  // Если склад пуст — ratio = 0, ферма не сеет и ничего не производит.
  // 1 игровая единица ≈ 30 кг; 1 га = ~150 кг посева при норме 120–180 кг/га.
  wheat_family_farm: [
    {
      output_good: 'wheat',
      inputs: [
        { good: 'wheat', amount: 0.20 },  // 20% урожая уходит обратно на семена (1:5)
      ],
      labor_cost_per_worker: 3,
    },
  ],

  // ── Средняя вилла (пшеница) ───────────────────────────────────────────────
  // Та же норма посева 1:5. Чуть ниже трудозатраты — более организованное хозяйство.
  wheat_villa: [
    {
      output_good: 'wheat',
      inputs: [
        { good: 'wheat', amount: 0.20 },
      ],
      labor_cost_per_worker: 2,
    },
  ],

  // ── Латифундия (пшеница) ──────────────────────────────────────────────────
  // Пшеница и ячмень — оба требуют собственного посевного фонда.
  // Ячмень (побочный продукт, base_rate 1500) тоже потребляет 20% на посев ячменя.
  wheat_latifundium: [
    {
      output_good: 'wheat',
      inputs: [
        { good: 'wheat',  amount: 0.20 },
      ],
      labor_cost_per_worker: 2,
    },
    {
      output_good: 'barley',
      inputs: [
        { good: 'barley', amount: 0.20 },  // посевной ячмень из склада
      ],
      labor_cost_per_worker: 2,
    },
  ],

  // ── Скотоводческое хозяйство ──────────────────────────────────────────────
  // Волы и скот пасутся на выгонах (footprint_ha=30), но зимой и при болезнях
  // требуют зернового подкорма. 0.30 ед. пшеницы на 1 голову скота (~4% от цены
  // выхода) — необременительно при урожае, но при голоде (wheat=0) farm ratio=0:
  // скот не воспроизводится → capital_inputs ферм истощаются → _capital_ratio↓.
  // Именно этот каскад делает голод по-настоящему разрушительным.
  cattle_farm: [
    {
      output_good: 'cattle',
      inputs: [
        { good: 'wheat', amount: 0.30 },  // зерновой подкорм: зима, телята, больные
      ],
      labor_cost_per_worker: 4,
    },
  ],

  // ── Пастбище ──────────────────────────────────────────────────────────────
  ranch: [
    { output_good: 'wool',    inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'leather', inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'honey',   inputs: [], labor_cost_per_worker: 2 },
  ],

  // ── Латифундия ────────────────────────────────────────────────────────────
  latifundium: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 2 },
    { output_good: 'olives', inputs: [], labor_cost_per_worker: 2 },
  ],

  // ── Сицилийская пшеничная латифундия ─────────────────────────────────────
  grain_estate: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 2 },
    { output_good: 'barley', inputs: [], labor_cost_per_worker: 2 },
  ],

  // ── Серные рудники ────────────────────────────────────────────────────────
  sulfur_mine: [
    { output_good: 'sulfur', inputs: [], labor_cost_per_worker: 10 },
  ],

  // ── Тоня (ловушка для тунца) ──────────────────────────────────────────────
  tuna_trap: [
    { output_good: 'tuna', inputs: [], labor_cost_per_worker: 6 },
  ],

  // ── Папирусные заросли ────────────────────────────────────────────────────
  papyrus_bed: [
    { output_good: 'papyrus', inputs: [], labor_cost_per_worker: 4 },
  ],

  // ── Порт ──────────────────────────────────────────────────────────────────
  port: [
    { output_good: 'fish',        inputs: [], labor_cost_per_worker: 5  },
    { output_good: 'trade_goods', inputs: [], labor_cost_per_worker: 10 },
  ],
};
