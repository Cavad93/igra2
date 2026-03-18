// ═══════════════════════════════════════════════════════════════════════════
// ЭКОНОМИЧЕСКИЙ ОБЗОР — ui/economy_tab.js
//
//  Блок A: Товарная биржа  — рыночная таблица с трендами и зонами
//  Блок B: Доходы сословий — карточки профессий с Δ1/Δ12 тиков
//  Блок C: Корзина потребления — расходы выбранной группы по категориям
//  Блок D: Баланс кошелька — чистая прибыль, динамика накоплений
//
//  recordEconomyHistory() — вызывается из turn.js после runEconomyTick()
// ═══════════════════════════════════════════════════════════════════════════

// ─── Мета-данные профессий ────────────────────────────────────────────────
const PROF_META = {
  farmers:   { name: 'Крестьяне',    icon: '🌾' },
  craftsmen: { name: 'Ремесленники', icon: '🔨' },
  merchants: { name: 'Купцы',        icon: '💼' },
  sailors:   { name: 'Мореходы',     icon: '⚓' },
  clergy:    { name: 'Духовенство',  icon: '✝' },
  soldiers:  { name: 'Воины',        icon: '⚔' },
  slaves:    { name: 'Рабы',         icon: '⛓' },
};

// Статический маппинг market_category → тир товара
const _MC_TIER = {
  food_staple:    'basic',
  raw_material:   'basic',
  food_processed: 'standard',
  processed_goods:'standard',
  trade_hub:      'standard',
  luxury:         'luxury',
  labor:          'luxury',
};

const TIER_LABEL = { basic: 'Базовые', standard: 'Стандартные', luxury: 'Роскошь' };
const TIER_COLOR = { basic: '#4a9f6a',  standard: '#5b9bd5',     luxury: '#c87fa0' };

// ─── Текущая вкладка оверлея ──────────────────────────────────────────────
let _econTab       = 'A';  // 'A' | 'B' | 'C' | 'D'
let _econBasketProf = null; // выбранная профессия для Block C

function setEconTab(t) { _econTab = t; renderEconomyOverlay(); }
function setEconBasketProf(p) { _econBasketProf = p; renderEconomyOverlay(); }

// ─────────────────────────────────────────────────────────────────────────
// HISTORY RECORDING — вызывается из turn.js
// ─────────────────────────────────────────────────────────────────────────

function recordEconomyHistory() {
  const nId    = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[nId];
  if (!nation?.economy || !nation?.population?.pops) return;

  const popsSnap = {};
  for (const [prof, pop] of Object.entries(nation.population.pops)) {
    popsSnap[prof] = { income_last: pop.income_last || 0, wealth: pop.wealth || 0 };
  }

  const snap = {
    turn:    GAME_STATE.turn || 1,
    income:  nation.economy.income_per_turn  || 0,
    expense: nation.economy.expense_per_turn || 0,
    pops:    popsSnap,
  };

  if (!nation.economy.econ_history) nation.economy.econ_history = [];
  nation.economy.econ_history.push(snap);
  if (nation.economy.econ_history.length > 60) nation.economy.econ_history.shift();

  // Alert: любая профессия упала по доходу >20% за 1 тик
  const hist = nation.economy.econ_history;
  let alert = false;
  if (hist.length >= 2) {
    const prev = hist[hist.length - 2];
    for (const [prof, cur] of Object.entries(snap.pops)) {
      const prevInc = prev.pops?.[prof]?.income_last || 0;
      if (prevInc > 0 && (prevInc - cur.income_last) / prevInc > 0.20) { alert = true; break; }
    }
  }
  nation.economy._income_alert = alert;
}

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────

function _econNation() {
  return GAME_STATE.nations[GAME_STATE.player_nation];
}

// Тренд цены товара из price_history: { dir: 'up'|'down'|'flat', pct }
function _priceTrend(goodId) {
  const mkt = GAME_STATE.market?.[goodId];
  const ph  = mkt?.price_history;
  if (!ph || ph.length < 3) return { dir: 'flat', pct: 0 };
  const recent = ph[ph.length - 1];
  const old    = ph[Math.max(0, ph.length - 4)]; // 3 тика назад → сглаживаем шум
  if (old === 0) return { dir: 'flat', pct: 0 };
  const pct = (recent - old) / old * 100;
  return { dir: pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat', pct };
}

// Рыночная зона товара
function _marketZone(goodId) {
  const mkt = GAME_STATE.market?.[goodId];
  if (!mkt) return 'unknown';
  const ws  = mkt.world_stockpile ?? 0;
  const dem = Math.max(mkt.demand || 1, 1);
  const tgt = (typeof GOODS !== 'undefined' ? GOODS[goodId]?.stockpile_target_turns ?? 4 : 4) * dem;
  if (ws < 0.5 * tgt) return 'deficit';
  if (ws > 2.0 * tgt) return 'surplus';
  return 'balance';
}

// Динамическая классификация товара по цене относительно среднего дохода
function _goodTier(goodId, avgIncomePerCap) {
  const def = typeof GOODS !== 'undefined' ? GOODS[goodId] : null;
  if (!def) return 'standard';
  const base = _MC_TIER[def.market_category] || 'standard';
  if (!avgIncomePerCap || avgIncomePerCap <= 0) return base;
  const price = GAME_STATE.market?.[goodId]?.price ?? def.base_price;
  if (price >= avgIncomePerCap * 0.9) return 'luxury';
  if (price <= avgIncomePerCap * 0.06) return 'basic';
  return base;
}

// Δ доходов профессии за N тиков назад (%, 0 если нет истории)
function _incomeDelta(prof, ticks) {
  const hist = _econNation()?.economy?.econ_history;
  if (!hist || hist.length < 2) return null;
  const cur  = hist[hist.length - 1]?.pops?.[prof]?.income_last;
  const past = hist[Math.max(0, hist.length - 1 - ticks)]?.pops?.[prof]?.income_last;
  if (cur == null || past == null || past === 0) return null;
  return (cur - past) / past * 100;
}

// Средний душевой доход нации
function _avgIncomePerCap(nation) {
  const pops = nation.population?.pops;
  const byP  = nation.population?.by_profession;
  if (!pops || !byP) return 0;
  let totalInc = 0, totalPop = 0;
  for (const [prof, pop] of Object.entries(pops)) {
    const sz = byP[prof] || 0;
    totalInc += (pop.income_last || 0);
    totalPop += sz;
  }
  return totalPop > 0 ? (totalInc / totalPop) * 1000 : 0; // income_last per 1000 → per capita
}

function _fmtNum(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'М';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'К';
  return Math.round(n).toLocaleString();
}

function _fmtPct(p, showPlus = true) {
  if (p == null) return '—';
  const s = (showPlus && p > 0 ? '+' : '') + p.toFixed(1) + '%';
  return s;
}

function _deltaColor(v) {
  if (v == null) return 'var(--text-dim)';
  if (v > 5)  return '#4a9f6a';
  if (v < -5) return '#e05555';
  return '#d4af37';
}

// Мини SVG spark-line (50×18) для истории цены
function _spark(goodId) {
  const ph = GAME_STATE.market?.[goodId]?.price_history;
  if (!ph || ph.length < 2) return '<svg width="50" height="18"></svg>';
  const W = 50, H = 18, pad = 2;
  const mn = Math.min(...ph), mx = Math.max(...ph);
  const range = mx - mn || 1;
  const pts = ph.map((v, i) => {
    const x = pad + (i / (ph.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - mn) / range) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trend = _priceTrend(goodId);
  const col = trend.dir === 'up' ? '#e05555' : trend.dir === 'down' ? '#4a9f6a' : '#d4af37';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК A: ТОВАРНАЯ БИРЖА
// ─────────────────────────────────────────────────────────────────────────

function _buildBlockA(nation) {
  const stockpile    = nation.economy?.stockpile || {};
  const avgIncomePCp = _avgIncomePerCap(nation);

  // Список товаров — только те, что есть в GOODS и в market
  const goodIds = typeof GOODS !== 'undefined'
    ? Object.keys(GOODS).filter(g => g !== 'slaves' && GAME_STATE.market?.[g])
    : Object.keys(GAME_STATE.market || {});

  // Сортировка: дефицит → баланс → избыток; внутри по отклонению цены от базы
  const zoneOrder = { deficit: 0, balance: 1, surplus: 2, unknown: 3 };
  goodIds.sort((a, b) => {
    const za = zoneOrder[_marketZone(a)], zb = zoneOrder[_marketZone(b)];
    if (za !== zb) return za - zb;
    const devA = Math.abs((GAME_STATE.market[a]?.price ?? 0) - (GAME_STATE.market[a]?.base ?? 1)) / (GAME_STATE.market[a]?.base ?? 1);
    const devB = Math.abs((GAME_STATE.market[b]?.price ?? 0) - (GAME_STATE.market[b]?.base ?? 1)) / (GAME_STATE.market[b]?.base ?? 1);
    return devB - devA;
  });

  const ZONE_META = {
    deficit: { label: 'Дефицит', cls: 'eco-z-def' },
    balance: { label: 'Баланс',  cls: 'eco-z-bal' },
    surplus: { label: 'Избыток', cls: 'eco-z-sur' },
    unknown: { label: '—',       cls: '' },
  };
  const TREND_ICON = { up: '▲', down: '▼', flat: '▸' };
  const TREND_CLS  = { up: 'eco-tr-up', down: 'eco-tr-dn', flat: 'eco-tr-fl' };

  const rows = goodIds.map(gId => {
    const def   = typeof GOODS !== 'undefined' ? GOODS[gId] : null;
    const mkt   = GAME_STATE.market[gId];
    const price = mkt?.price ?? 0;
    const base  = mkt?.base  ?? def?.base_price ?? 1;
    const priceRatio = base > 0 ? price / base : 1;
    const priceBarW  = Math.min(200, Math.round(priceRatio * 100));
    const priceBarCl = priceRatio > 1.3 ? 'eco-pb-high' : priceRatio < 0.8 ? 'eco-pb-low' : 'eco-pb-mid';

    const trend    = _priceTrend(gId);
    const zone     = _marketZone(gId);
    const zmeta    = ZONE_META[zone] || ZONE_META.unknown;
    const tier     = _goodTier(gId, avgIncomePCp);
    const localSt  = stockpile[gId] ?? 0;
    const worldSt  = mkt?.world_stockpile ?? 0;

    return `
      <tr class="eco-tr">
        <td class="eco-td eco-td-name">
          <span class="eco-good-ic">${def?.icon || '📦'}</span>
          <span>${def?.name || gId}</span>
          <span class="eco-tier-pip" style="background:${TIER_COLOR[tier]}" title="${TIER_LABEL[tier]}"></span>
        </td>
        <td class="eco-td eco-td-num">${_fmtNum(localSt)}</td>
        <td class="eco-td eco-td-num">${_fmtNum(worldSt)}</td>
        <td class="eco-td eco-td-price">
          <span class="eco-price-val">${price.toFixed(1)}</span>
          <span class="eco-price-base">/ ${base}</span>
          <div class="eco-pb-wrap" title="${(priceRatio * 100).toFixed(0)}% от базы">
            <div class="eco-pb ${priceBarCl}" style="width:${priceBarW}px"></div>
          </div>
        </td>
        <td class="eco-td eco-td-spark">${_spark(gId)}</td>
        <td class="eco-td eco-td-trend">
          <span class="${TREND_CLS[trend.dir]}">${TREND_ICON[trend.dir]} ${Math.abs(trend.pct).toFixed(1)}%</span>
        </td>
        <td class="eco-td">
          <span class="eco-zone ${zmeta.cls}">${zmeta.label}</span>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="eco-block">
      <div class="eco-block-hdr">
        📊 Товарная биржа
        <span class="eco-block-sub">Все рынки · сортировка по приоритету</span>
        <span class="eco-tier-legend">
          ${Object.entries(TIER_LABEL).map(([t, l]) =>
            `<span class="eco-tier-pip" style="background:${TIER_COLOR[t]}"></span>${l}`
          ).join(' ')}
        </span>
      </div>
      <div class="eco-table-wrap">
        <table class="eco-table">
          <thead>
            <tr>
              <th class="eco-th">Товар</th>
              <th class="eco-th eco-th-num" title="Локальный склад">Запас</th>
              <th class="eco-th eco-th-num" title="Мировой склад">Мир. склад</th>
              <th class="eco-th" title="Цена / база">Цена</th>
              <th class="eco-th" title="История цены">График</th>
              <th class="eco-th">Тренд</th>
              <th class="eco-th">Зона</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК B: ДОХОДЫ СОСЛОВИЙ
// ─────────────────────────────────────────────────────────────────────────

function _buildBlockB(nation) {
  const pops  = nation.population?.pops || {};
  const byP   = nation.population?.by_profession || {};
  const hist  = nation.economy?.econ_history || [];

  // Проверяем есть ли тревожный сигнал (доход упал >20%)
  const hasAlert = nation.economy?._income_alert;

  const cards = Object.entries(PROF_META).map(([prof, meta]) => {
    const pop   = pops[prof];
    const popSz = byP[prof] || 0;
    if (!pop || popSz < 10) return '';

    const income  = pop.income_last || 0;
    const wealth  = pop.wealth      || 0;
    const d1  = _incomeDelta(prof, 1);
    const d12 = _incomeDelta(prof, 12);

    // Wealth bar 0–100
    const wBarW   = Math.round(wealth);
    const wBarCol = wealth >= 60 ? '#c87fa0' : wealth >= 30 ? '#5b9bd5' : '#4a9f6a';

    // Alert тревога для этой профессии
    const isAlert = d1 != null && d1 < -20;

    return `
      <div class="eco-inc-card ${isAlert ? 'eco-inc-alert' : ''}">
        <div class="eco-inc-hd">
          <span class="eco-inc-ic">${meta.icon}</span>
          <div>
            <div class="eco-inc-nm">${meta.name}</div>
            <div class="eco-inc-sz">${_fmtNum(popSz)} чел.</div>
          </div>
          ${isAlert ? '<span class="eco-alert-pip" title="Доход упал >20%">⚠</span>' : ''}
        </div>
        <div class="eco-inc-val">${_fmtNum(income)} <span class="eco-inc-unit">золота/тик</span></div>
        <div class="eco-wealth-bar-wrap" title="Богатство: ${wealth.toFixed(1)}">
          <div class="eco-wealth-bar" style="width:${wBarW}%;background:${wBarCol}"></div>
        </div>
        <div class="eco-inc-deltas">
          <div class="eco-inc-delta-row">
            <span class="eco-delta-lbl">Δ 1 тик</span>
            <span style="color:${_deltaColor(d1)}">${d1 != null ? _fmtPct(d1) : '—'}</span>
          </div>
          <div class="eco-inc-delta-row">
            <span class="eco-delta-lbl">Δ 12 тиков</span>
            <span style="color:${_deltaColor(d12)}">${d12 != null ? _fmtPct(d12) : '—'}</span>
          </div>
          <div class="eco-inc-delta-row">
            <span class="eco-delta-lbl">Богатство</span>
            <span style="color:${_deltaColor(wealth - 50)}">${wealth.toFixed(1)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  const alertBanner = hasAlert ? `
    <div class="eco-alert-banner">
      ⚠ Один или несколько классов потеряли более 20% дохода за прошедший тик!
      Требуется вмешательство.
    </div>` : '';

  return `
    <div class="eco-block">
      <div class="eco-block-hdr">💰 Доходы сословий</div>
      ${alertBanner}
      <div class="eco-inc-grid">${cards}</div>
      <div class="eco-block-note">Доход = wages из зданий · Богатство = долгосрочное накопление (0–100)</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК C: КОРЗИНА ПОТРЕБЛЕНИЯ
// ─────────────────────────────────────────────────────────────────────────

function _buildBlockC(nation) {
  const pops   = nation.population?.pops  || {};
  const byP    = nation.population?.by_profession || {};
  const avgInc = _avgIncomePerCap(nation);

  // Выбор профессии
  const availProfs = Object.keys(PROF_META).filter(p => pops[p] && (byP[p] || 0) >= 10);
  if (!_econBasketProf || !availProfs.includes(_econBasketProf)) {
    _econBasketProf = availProfs[0] || null;
  }

  const profBtns = availProfs.map(p => `
    <button class="eco-psel-btn ${p === _econBasketProf ? 'active' : ''}"
            onclick="setEconBasketProf('${p}')">
      ${PROF_META[p].icon} ${PROF_META[p].name}
    </button>`).join('');

  if (!_econBasketProf) return `
    <div class="eco-block">
      <div class="eco-block-hdr">🧺 Корзина потребления</div>
      <div class="eco-empty">Нет данных о сословиях</div>
    </div>`;

  const pop    = pops[_econBasketProf];
  const popSz  = byP[_econBasketProf] || 0;
  const basket = (typeof getConsumptionBasket === 'function') ? getConsumptionBasket(pop.wealth) : {};

  // Группируем по тирам
  const byTier = { basic: [], standard: [], luxury: [] };
  let totalCost = 0;

  for (const [gId, amtPer1k] of Object.entries(basket)) {
    const def   = typeof GOODS !== 'undefined' ? GOODS[gId] : null;
    const price = GAME_STATE.market?.[gId]?.price ?? def?.base_price ?? 0;
    const costPer1k = amtPer1k * price;
    const tier  = _goodTier(gId, avgInc);
    const row   = { gId, amtPer1k, price, costPer1k, def };
    (byTier[tier] || byTier.standard).push(row);
    totalCost += costPer1k;
  }

  // Stacked bar (horizontal) — тири
  const tierTotals = {};
  for (const [t, rows] of Object.entries(byTier)) {
    tierTotals[t] = rows.reduce((s, r) => s + r.costPer1k, 0);
  }

  const barSegs = Object.entries(tierTotals).map(([t, v]) => {
    if (v <= 0) return '';
    const pct = totalCost > 0 ? (v / totalCost * 100).toFixed(1) : 0;
    return `<div class="eco-stk-seg" style="width:${pct}%;background:${TIER_COLOR[t]}"
                 title="${TIER_LABEL[t]}: ${_fmtNum(v)} gold (${pct}%)"></div>`;
  }).join('');

  // Детальные строки по тирам
  const tierRows = Object.entries(byTier).map(([tier, rows]) => {
    if (!rows.length) return '';
    const tierSum = rows.reduce((s, r) => s + r.costPer1k, 0);
    const items = rows.map(r => `
      <div class="eco-bsk-row">
        <span class="eco-good-ic-sm">${r.def?.icon || '📦'}</span>
        <span class="eco-bsk-nm">${r.def?.name || r.gId}</span>
        <span class="eco-bsk-amt">${r.amtPer1k.toFixed(3)} / 1К чел.</span>
        <span class="eco-bsk-price">${r.price.toFixed(1)} gold</span>
        <span class="eco-bsk-cost" style="color:${TIER_COLOR[tier]}">${_fmtNum(r.costPer1k)}</span>
      </div>`).join('');
    return `
      <div class="eco-bsk-group">
        <div class="eco-bsk-grp-hdr" style="color:${TIER_COLOR[tier]}">
          ${TIER_LABEL[tier]}
          <span class="eco-bsk-grp-sum">${_fmtNum(tierSum)} gold</span>
        </div>
        ${items}
      </div>`;
  }).join('');

  // Цена полной корзины для данного размера группы
  const totalForGroup = totalCost * (popSz / 1000);

  return `
    <div class="eco-block">
      <div class="eco-block-hdr">🧺 Корзина потребления</div>

      <!-- Выбор профессии -->
      <div class="eco-psel">${profBtns}</div>

      <!-- Заголовок группы -->
      <div class="eco-bsk-hero">
        <span class="eco-bsk-hero-ic">${PROF_META[_econBasketProf].icon}</span>
        <div>
          <div class="eco-bsk-hero-nm">${PROF_META[_econBasketProf].name}</div>
          <div class="eco-bsk-hero-sub">${_fmtNum(popSz)} чел. · Богатство ${pop.wealth.toFixed(1)}</div>
        </div>
        <div class="eco-bsk-hero-cost">
          <div class="eco-bsk-hero-total">${_fmtNum(totalForGroup)}</div>
          <div class="eco-bsk-hero-lbl">gold / тик (вся группа)</div>
        </div>
      </div>

      <!-- Stacked bar -->
      <div class="eco-stk-bar-wrap">
        <div class="eco-stk-bar">${barSegs}</div>
        <div class="eco-stk-legend">
          ${Object.entries(TIER_LABEL).map(([t, l]) => `
            <span class="eco-tier-pip" style="background:${TIER_COLOR[t]}"></span>
            <span>${l}: ${_fmtNum(tierTotals[t])}</span>`).join('')}
        </div>
      </div>

      <!-- Детали по категориям -->
      <div class="eco-bsk-detail">${tierRows}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК D: БАЛАНС КОШЕЛЬКА
// ─────────────────────────────────────────────────────────────────────────

function _buildBlockD(nation) {
  const pops   = nation.population?.pops  || {};
  const byP    = nation.population?.by_profession || {};
  const avgInc = _avgIncomePerCap(nation);

  const rows = Object.entries(PROF_META).map(([prof, meta]) => {
    const pop   = pops[prof];
    const popSz = byP[prof] || 0;
    if (!pop || popSz < 10) return '';

    const income  = pop.income_last || 0;
    const basket  = typeof getConsumptionBasket === 'function' ? getConsumptionBasket(pop.wealth) : {};

    // Стоимость корзины по текущим ценам (на 1000 чел.)
    let basketCost1k = 0;
    for (const [gId, amt] of Object.entries(basket)) {
      const price = GAME_STATE.market?.[gId]?.price ?? GOODS?.[gId]?.base_price ?? 0;
      basketCost1k += amt * price;
    }
    const basketCostGroup = basketCost1k * (popSz / 1000);
    const net = income - basketCostGroup;

    // Тренд богатства (текущий - предыдущий тик)
    const hist = nation.economy?.econ_history || [];
    let wealthDelta = null;
    if (hist.length >= 2) {
      const cur  = hist[hist.length - 1]?.pops?.[prof]?.wealth;
      const prev = hist[hist.length - 2]?.pops?.[prof]?.wealth;
      if (cur != null && prev != null) wealthDelta = cur - prev;
    }

    const netColor  = net > 0 ? '#4a9f6a' : net < 0 ? '#e05555' : '#d4af37';
    const wdColor   = !wealthDelta ? '#d4af37' : wealthDelta > 0 ? '#4a9f6a' : '#e05555';
    const wdIcon    = !wealthDelta ? '▸' : wealthDelta > 0 ? '▲' : '▼';

    // Satisfaction coverage bar
    const sat = pop.satisfied ?? 0.75;
    const satW = Math.round(sat * 100);
    const satCol = sat > 0.8 ? '#4a9f6a' : sat > 0.5 ? '#d4af37' : '#e05555';

    return `
      <div class="eco-bal-row">
        <div class="eco-bal-prof">
          <span class="eco-inc-ic">${meta.icon}</span>
          <div>
            <div class="eco-inc-nm">${meta.name}</div>
            <div class="eco-inc-sz">${_fmtNum(popSz)}</div>
          </div>
        </div>
        <div class="eco-bal-col">
          <div class="eco-bal-lbl">Доход</div>
          <div class="eco-bal-val" style="color:#4a9f6a">+${_fmtNum(income)}</div>
        </div>
        <div class="eco-bal-col">
          <div class="eco-bal-lbl">Расходы</div>
          <div class="eco-bal-val" style="color:#e05555">-${_fmtNum(basketCostGroup)}</div>
        </div>
        <div class="eco-bal-col eco-bal-net">
          <div class="eco-bal-lbl">Чистая прибыль</div>
          <div class="eco-bal-val" style="color:${netColor};font-size:13px;font-weight:bold">
            ${net >= 0 ? '+' : ''}${_fmtNum(net)}
          </div>
        </div>
        <div class="eco-bal-col">
          <div class="eco-bal-lbl">Δ богатство</div>
          <div class="eco-bal-val" style="color:${wdColor}">
            ${wdIcon} ${wealthDelta != null ? Math.abs(wealthDelta).toFixed(2) : '—'}
          </div>
        </div>
        <div class="eco-bal-col eco-bal-sat">
          <div class="eco-bal-lbl">Насыщение</div>
          <div class="eco-sat-bar-wrap">
            <div class="eco-sat-bar" style="width:${satW}%;background:${satCol}"></div>
          </div>
          <div style="font-size:9px;color:${satCol};margin-top:1px">${(sat * 100).toFixed(0)}%</div>
        </div>
      </div>`;
  }).join('');

  // Итоговая строка: государственная казна
  const eco   = nation.economy;
  const delta = (eco.income_per_turn || 0) - (eco.expense_per_turn || 0);
  const dCol  = delta >= 0 ? '#4a9f6a' : '#e05555';

  return `
    <div class="eco-block">
      <div class="eco-block-hdr">⚖ Баланс кошелька</div>

      <div class="eco-bal-list">${rows}</div>

      <!-- Государство -->
      <div class="eco-treasury-row">
        <span class="eco-tr-ic">🏛</span>
        <div class="eco-tr-nm">
          <div class="eco-inc-nm">Государственная казна</div>
          <div class="eco-inc-sz">${_fmtNum(eco.treasury || 0)} gold</div>
        </div>
        <div class="eco-bal-col">
          <div class="eco-bal-lbl">Доходы</div>
          <div class="eco-bal-val" style="color:#4a9f6a">+${_fmtNum(eco.income_per_turn || 0)}</div>
        </div>
        <div class="eco-bal-col">
          <div class="eco-bal-lbl">Расходы</div>
          <div class="eco-bal-val" style="color:#e05555">-${_fmtNum(eco.expense_per_turn || 0)}</div>
        </div>
        <div class="eco-bal-col eco-bal-net">
          <div class="eco-bal-lbl">Баланс / тик</div>
          <div class="eco-bal-val" style="color:${dCol};font-size:13px;font-weight:bold">
            ${delta >= 0 ? '+' : ''}${_fmtNum(delta)}
          </div>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА
// ─────────────────────────────────────────────────────────────────────────

function renderEconomyOverlay() {
  const overlay = document.getElementById('economy-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  const nation = _econNation();
  if (!nation) {
    overlay.innerHTML = `<div class="eco-oi"><div style="padding:32px;text-align:center;color:var(--text-dim)">Нет данных</div></div>`;
    return;
  }

  // Alert indicator
  const alertActive = nation.economy?._income_alert;

  const tabs = [
    { id: 'A', label: '📊 Биржа'     },
    { id: 'B', label: '💰 Доходы'    },
    { id: 'C', label: '🧺 Корзина'   },
    { id: 'D', label: '⚖ Баланс'     },
  ];

  const tabBtns = tabs.map(t => `
    <button class="eco-tab-btn ${_econTab === t.id ? 'active' : ''} ${t.id === 'B' && alertActive ? 'eco-tab-alert' : ''}"
            onclick="setEconTab('${t.id}')">
      ${t.label}
    </button>`).join('');

  let content = '';
  if      (_econTab === 'A') content = _buildBlockA(nation);
  else if (_econTab === 'B') content = _buildBlockB(nation);
  else if (_econTab === 'C') content = _buildBlockC(nation);
  else if (_econTab === 'D') content = _buildBlockD(nation);

  overlay.innerHTML = `
    <div class="eco-oi">
      <!-- Header -->
      <div class="eco-hdr">
        <span class="eco-hdr-ic">💹</span>
        <div style="flex:1">
          <div class="eco-hdr-t">Экономический обзор</div>
          <div class="eco-hdr-n">${nation.name}</div>
        </div>
        <button class="pop-x" onclick="hideEconomyOverlay()">✕</button>
      </div>

      <!-- Hero strip: treasury / income / expense -->
      <div class="eco-hero">
        <div class="eco-hm">
          <div class="eco-hl">Казна</div>
          <div class="eco-hv">${_fmtNum(nation.economy?.treasury || 0)}</div>
          <div class="eco-hs">золото</div>
        </div>
        <div class="eco-hm">
          <div class="eco-hl">Доход / тик</div>
          <div class="eco-hv" style="color:#4a9f6a">+${_fmtNum(nation.economy?.income_per_turn || 0)}</div>
        </div>
        <div class="eco-hm">
          <div class="eco-hl">Расход / тик</div>
          <div class="eco-hv" style="color:#e05555">-${_fmtNum(nation.economy?.expense_per_turn || 0)}</div>
        </div>
        <div class="eco-hm">
          <div class="eco-hl">Налог</div>
          <div class="eco-hv">${((nation.economy?.tax_rate || 0) * 100).toFixed(0)}%</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="eco-tabs">${tabBtns}</div>

      <!-- Active block -->
      <div class="eco-content">${content}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// УПРАВЛЕНИЕ ОВЕРЛЕЕМ
// ─────────────────────────────────────────────────────────────────────────

function showEconomyOverlay() {
  const overlay = document.getElementById('economy-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  renderEconomyOverlay();
}

function hideEconomyOverlay() {
  const overlay = document.getElementById('economy-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function refreshEconomyTab() {
  const overlay = document.getElementById('economy-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  renderEconomyOverlay();

  // Обновить badge на кнопке в left-panel (красный если alert)
  const nation = _econNation();
  const btn    = document.getElementById('eco-open-btn');
  if (btn) btn.classList.toggle('eco-btn-alert', !!(nation?.economy?._income_alert));
}
