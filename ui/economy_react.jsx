// ═══════════════════════════════════════════════════════════════════════════
// ЭКОНОМИЧЕСКИЙ ОБЗОР — Vanilla JS UI — ui/economy_react.jsx
//
//  Полностью заменяет React-версию. Работает из file:// без CDN и Babel.
//  Загружается как обычный <script src="...">.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Состояние оверлея ────────────────────────────────────────────────────
let _ecoTab     = 'A';
let _ecoSelProf = null;

// ─── Хелперы: синхронизация с казной ──────────────────────────────────────

// Актуальный доход: из _income_breakdown (живой расчёт движка) или income_per_turn
function _eActualIncome(eco) {
  return Math.round(eco._income_breakdown?.total ?? eco.income_per_turn ?? 0);
}
// Актуальный расход: из _expense_breakdown или expense_per_turn
function _eActualExpense(eco) {
  return Math.round(eco._expense_breakdown?.total ?? eco.expense_per_turn ?? 0);
}
// Эффективная средневзвешенная ставка из tax_rates_by_class.
// Весовая функция — taxBase[group] (pop × wealth_level), как в движке.
function _eEffectiveTaxRate(eco, byProfession) {
  const rates = eco?.tax_rates_by_class;
  if (rates && typeof computeTaxGroupBases === 'function') {
    const bases     = computeTaxGroupBases(byProfession || {});
    const totalBase = Object.values(bases).reduce((s, v) => s + v, 0);
    if (totalBase > 0) {
      const weighted = Object.entries(rates)
        .reduce((s, [g, r]) => s + (bases[g] || 0) * r, 0);
      return weighted / totalBase;
    }
  }
  return eco?.tax_rate || 0;
}

// ─── Дизайн-токены ────────────────────────────────────────────────────────
const _C = {
  bgMain:    'rgba(15,23,15,0.96)',
  bgCard:    'rgba(20,30,20,0.72)',
  bgGhost:   'rgba(255,255,255,0.025)',
  border:    'rgba(212,175,55,0.15)',
  borderAcc: 'rgba(212,175,55,0.38)',
  borderGrn: 'rgba(74,159,106,0.28)',
  gold:      '#D4AF37',
  copper:    '#B87333',
  ivory:     '#E5E4E2',
  ivoryDim:  'rgba(229,228,226,0.45)',
  ivoryFade: 'rgba(229,228,226,0.25)',
  green:     '#4a9f6a',
  red:       '#e05555',
  blue:      '#5b9bd5',
  rose:      '#c87fa0',
};

// ─── Утилиты ──────────────────────────────────────────────────────────────
function _efmt(n) {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'М';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'К';
  return Math.round(n).toLocaleString('ru');
}
function _ePct(v, plus = true) {
  if (v == null) return '—';
  return (plus && v > 0 ? '+' : '') + v.toFixed(1) + '%';
}
function _eDeltaColor(v) {
  if (v == null) return _C.ivoryDim;
  if (v >  5) return _C.green;
  if (v < -5) return _C.red;
  return _C.gold;
}
function _eSmartSort(items) {
  return [...items].sort((a, b) => {
    const da = a.status === 'Дефицит' ? 0 : 1;
    const db = b.status === 'Дефицит' ? 0 : 1;
    if (da !== db) return da - db;
    return Math.abs(b.trend) - Math.abs(a.trend);
  });
}

// ─── Начальные значения богатства ─────────────────────────────────────────
const _E_WEALTH_DEF = {
  farmers: 15, craftsmen: 45, merchants: 65,
  sailors: 38, clergy: 55,   soldiers: 35, slaves: 5,
};
const _E_PROF_DISP = {
  farmers:   { name: 'Крестьяне',    icon: '🌾' },
  craftsmen: { name: 'Ремесленники', icon: '🔨' },
  merchants: { name: 'Купцы',        icon: '💼' },
  sailors:   { name: 'Мореходы',     icon: '⚓' },
  clergy:    { name: 'Духовенство',  icon: '✝' },
  soldiers:  { name: 'Воины',        icon: '⚔' },
  slaves:    { name: 'Рабы',         icon: '⛓' },
};
const _E_CAT_META = {
  'Провизия':       { icon: '🌾', color: '#4a9f6a' },
  'Промышленность': { icon: '⚙',  color: '#B87333' },
  'Роскошь':        { icon: '💎', color: '#c87fa0' },
};
const _E_CAT_MAP = {
  food: 'Провизия', essential: 'Провизия',
  material: 'Промышленность',
  luxury: 'Роскошь', labor: 'Роскошь',
};

// ─── Загрузка данных ──────────────────────────────────────────────────────
function _eLoadPop() {
  try {
    const nation = window.GAME_STATE?.nations?.[window.GAME_STATE?.player_nation];
    if (!nation) return { pops: {}, byP: {}, hist: [], eco: {}, alert: false, name: '' };
    const byP = nation.population?.by_profession || {};
    const raw = nation.population?.pops || {};
    const pops = {};
    for (const prof of Object.keys(byP)) {
      if ((byP[prof] || 0) < 10) continue;
      pops[prof] = raw[prof] || { income_last: 0, wealth: _E_WEALTH_DEF[prof] ?? 25, satisfied: 0.75 };
    }
    return { pops, byP, hist: nation.economy?.econ_history || [], eco: nation.economy || {}, alert: !!nation.economy?._income_alert, name: nation.name || '' };
  } catch (e) {
    return { pops: {}, byP: {}, hist: [], eco: {}, alert: false, name: '' };
  }
}

function _eLoadMarket() {
  try {
    const nId    = window.GAME_STATE?.player_nation;
    const nation = window.GAME_STATE?.nations?.[nId];
    if (!nation || typeof window.GOODS === 'undefined') return [];
    const stockpile = nation.economy?.stockpile || {};
    const market    = window.GAME_STATE.market  || {};
    const avgInc    = typeof _avgIncomePerCap === 'function' ? _avgIncomePerCap(nation) : 0;
    return Object.entries(window.GOODS)
      .filter(([g]) => market[g] && g !== 'slaves')
      .map(([gId, def]) => {
        const mkt   = market[gId];
        const price = mkt.price ?? def.base_price;
        const ph    = Array.isArray(mkt.price_history) && mkt.price_history.length ? mkt.price_history.slice(-12) : [price];
        const trend = ph.length >= 2 ? +((ph[ph.length-1] - ph[0]) / (ph[0] || 1) * 100).toFixed(1) : 0;
        const ws    = mkt.world_stockpile ?? 0;
        const dem   = Math.max(mkt.demand || 1, 1);
        const tgt   = (def.stockpile_target_turns ?? 4) * dem;
        const status = ws < 0.5 * tgt ? 'Дефицит' : ws > 2 * tgt ? 'Избыток' : 'Норма';
        const cat    = _E_CAT_MAP[def.category] || 'Промышленность';
        return { id: gId, name: def.name || gId, icon: def.icon || '📦', category: cat, stock: ws, price, trend, status, history: ph };
      });
  } catch (e) {
    return [];
  }
}

// ─── SVG Sparkline ────────────────────────────────────────────────────────
let _eSpkId = 0;
function _eSparkline(history, trend, W = 78, H = 30) {
  if (!history || history.length < 2) return `<svg width="${W}" height="${H}"></svg>`;
  const pad   = 2;
  const mn    = Math.min(...history);
  const mx    = Math.max(...history);
  const range = mx - mn || 1;
  const pts   = history.map((v, i) => {
    const x = pad + (i / (history.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - mn) / range) * (H - 2 * pad);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const linePts = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPts = [...pts.map(([x, y]) => `${x},${y}`), `${W - pad},${H}`, `${pad},${H}`].join(' ');
  const col  = trend > 1.5 ? _C.red : trend < -1.5 ? _C.green : _C.gold;
  const gid  = `esg${++_eSpkId}`;
  const last = pts[pts.length - 1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible;flex-shrink:0">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${areaPts}" fill="url(#${gid})"/>
    <polyline points="${linePts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${col}"/>
  </svg>`;
}

// ─── Блок A: Товарная биржа ────────────────────────────────────────────────
function _eRenderA(data) {
  const groups = {};
  for (const item of data) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  const catOrder = ['Провизия', 'Промышленность', 'Роскошь'];
  const cats = [...catOrder.filter(c => groups[c]), ...Object.keys(groups).filter(c => !catOrder.includes(c))];

  if (!cats.length) return `<div style="text-align:center;padding:30px;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет рыночных данных</div>`;

  return cats.map(cat => {
    const items   = _eSmartSort(groups[cat]);
    const meta    = _E_CAT_META[cat] || { icon: '📦', color: _C.gold };
    const isOpen  = _eOpenCats[cat] !== false; // default open
    const nDef    = items.filter(i => i.status === 'Дефицит').length;
    const summary = nDef > 0 ? `${nDef} товар${nDef > 1 ? 'а' : ''} в дефиците` : 'Баланс в норме';
    const sumCol  = nDef > 0 ? _C.red : _C.green;
    const arrow   = isOpen ? '▾' : '◂';

    const rows = items.map(item => {
      const isD = item.status === 'Дефицит';
      const isS = item.status === 'Избыток';
      const tc  = item.trend > 1.5 ? _C.red : item.trend < -1.5 ? _C.green : _C.gold;
      const ti  = item.trend > 1.5 ? '▲' : item.trend < -1.5 ? '▼' : '▸';
      const badge = isD
        ? `<span class="eco-deficit-badge">⚠ Дефицит</span>`
        : isS
          ? `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:rgba(91,155,213,0.15);border:1px solid rgba(91,155,213,0.3);color:#5b9bd5;white-space:nowrap">↑ Избыток</span>`
          : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:${isD ? 'rgba(224,85,85,0.05)' : _C.bgGhost};border:1px solid ${isD ? 'rgba(224,85,85,0.22)' : _C.border};box-shadow:0 2px 10px rgba(0,0,0,0.2);margin-bottom:3px">
        <div style="display:flex;align-items:center;gap:9px;min-width:150px;flex:0 0 150px">
          <span style="font-size:22px;line-height:1">${item.icon}</span>
          <div>
            <div style="font-size:12px;color:${_C.ivory};font-weight:600;line-height:1.2">${item.name}</div>
            <div style="font-size:9.5px;color:${_C.ivoryDim};margin-top:2px">Запас: ${_efmt(item.stock)}</div>
          </div>
        </div>
        <div style="flex:1;display:flex;justify-content:center;align-items:center">${_eSparkline(item.history, item.trend)}</div>
        <div style="display:flex;align-items:center;gap:14px;min-width:200px;flex:0 0 200px;justify-content:flex-end">
          <div style="text-align:right">
            <div style="font-size:17px;font-family:'Cinzel',serif;color:${_C.gold};line-height:1">${item.price.toFixed(1)}</div>
            <div style="font-size:9px;color:${_C.ivoryFade};margin-top:1px">gold</div>
          </div>
          <div style="color:${tc};font-size:11px;font-family:sans-serif;min-width:56px;text-align:right;font-weight:600">${ti} ${Math.abs(item.trend).toFixed(1)}%</div>
          <div style="min-width:76px;display:flex;justify-content:flex-end">${badge}</div>
        </div>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:8px;border-radius:10px;overflow:hidden;border:1px solid ${_C.border};background:rgba(15,22,15,0.6);box-shadow:0 4px 24px rgba(0,0,0,0.45)">
      <button onclick="_eToggleCat('${cat}')" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;background:transparent;border:none;border-bottom:${isOpen ? `1px solid ${_C.border}` : 'none'};cursor:pointer;text-align:left" onmouseover="this.style.background='rgba(212,175,55,0.07)'" onmouseout="this.style.background='transparent'">
        <span style="font-size:20px;line-height:1">${meta.icon}</span>
        <div style="flex:1">
          <span style="font-size:12.5px;font-family:'Cinzel',serif;color:${meta.color};letter-spacing:.6px">${cat}</span>
          <span style="font-size:9.5px;color:${sumCol};margin-left:12px;font-family:sans-serif">${summary}</span>
        </div>
        <span style="font-size:10px;color:${_C.ivoryFade};margin-right:6px">${items.length} позиций</span>
        <span style="font-size:13px;color:${_C.ivoryFade};transition:transform .25s;display:inline-block;transform:${isOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">${arrow}</span>
      </button>
      ${isOpen ? `<div style="padding:6px 10px 10px;display:flex;flex-direction:column;gap:2px">${rows}</div>` : ''}
    </div>`;
  }).join('');
}

// ─── Блок B: Доходы сословий ─────────────────────────────────────────────
function _eRenderB() {
  const { pops, byP, hist, alert } = _eLoadPop();
  const getD = (prof, ticks) => {
    if (hist.length < 2) return null;
    const cur  = hist[hist.length - 1]?.pops?.[prof]?.income_last;
    const past = hist[Math.max(0, hist.length - 1 - ticks)]?.pops?.[prof]?.income_last;
    if (cur == null || past == null || past === 0) return null;
    return (cur - past) / past * 100;
  };

  const cards = Object.keys(_E_PROF_DISP).map(prof => {
    const pop   = pops[prof];
    const popSz = byP[prof] || 0;
    if (!pop || popSz < 10) return '';
    const d1     = getD(prof, 1);
    const d12    = getD(prof, 12);
    const isAlrt = d1 != null && d1 < -20;
    const meta   = _E_PROF_DISP[prof];
    const wealth = pop.wealth || 0;
    const income = pop.income_last || 0;
    const wCol   = wealth >= 60 ? _C.rose : wealth >= 30 ? _C.blue : _C.green;

    return `<div style="background:${isAlrt ? 'rgba(224,85,85,0.06)' : _C.bgCard};border:1px solid ${isAlrt ? 'rgba(224,85,85,0.35)' : _C.border};border-radius:10px;padding:13px 14px;box-shadow:0 4px 24px rgba(0,0,0,0.55)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
        <span style="font-size:22px;line-height:1">${meta.icon}</span>
        <div style="flex:1">
          <div style="font-size:11.5px;font-family:'Cinzel',serif;color:${_C.gold}">${meta.name}</div>
          <div style="font-size:9px;color:${_C.ivoryDim}">${_efmt(popSz)} чел.</div>
        </div>
        ${isAlrt ? `<span class="eco-alert-blink" style="color:${_C.red};font-size:14px">⚠</span>` : ''}
      </div>
      <div style="font-size:15px;font-family:'Cinzel',serif;color:${_C.gold};margin-bottom:8px;line-height:1">
        ${_efmt(income)} <span style="font-size:9px;color:${_C.ivoryFade};font-family:sans-serif;margin-left:4px">gold/тик</span>
      </div>
      <div style="background:rgba(255,255,255,0.07);border-radius:3px;height:5px;margin-bottom:9px;overflow:hidden">
        <div style="width:${Math.min(100, Math.round(wealth))}%;height:5px;background:${wCol};border-radius:3px;box-shadow:0 0 6px ${wCol}66"></div>
      </div>
      ${[['Δ 1 тик', d1], ['Δ 12 тиков', d12], ['Богатство', null]].map(([lbl, v], idx) => `
        <div style="display:flex;justify-content:space-between;font-size:9.5px;font-family:sans-serif;margin-bottom:2px">
          <span style="color:${_C.ivoryDim}">${lbl}</span>
          <span style="color:${idx === 2 ? _C.ivoryDim : _eDeltaColor(v)}">${idx === 2 ? wealth.toFixed(1) : _ePct(v)}</span>
        </div>`).join('')}
    </div>`;
  }).filter(Boolean).join('');

  return `
    ${alert ? `<div style="background:rgba(224,85,85,0.12);border:1px solid rgba(224,85,85,0.4);border-radius:8px;padding:9px 14px;margin-bottom:12px;font-size:10.5px;color:#e07777;display:flex;align-items:center;gap:8px"><span style="font-size:14px">⚠</span>Один или несколько классов потеряли более 20% дохода за прошедший тик!</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));gap:8px">
      ${cards || `<div style="padding:24px;text-align:center;color:${_C.ivoryFade};font-size:11px;font-style:italic;grid-column:1/-1">Запустите несколько ходов для накопления статистики.</div>`}
    </div>`;
}

// ─── Блок C: Корзина потребления ─────────────────────────────────────────
const _E_TIER_CFG = {
  basic:    { label: 'Базовые товары', color: '#4a9f6a' },
  standard: { label: 'Стандартные',   color: '#5b9bd5' },
  luxury:   { label: 'Роскошь',       color: '#c87fa0' },
};

function _eRenderC(selProf) {
  const { pops, byP } = _eLoadPop();
  const availProfs = Object.keys(_E_PROF_DISP).filter(p => (byP[p] || 0) >= 10 && p !== 'slaves');
  if (!availProfs.length) return `<div style="text-align:center;padding:30px;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет данных о сословиях</div>`;

  const prof = (selProf && availProfs.includes(selProf)) ? selProf : availProfs[0];
  const pop  = pops[prof];
  const popSz = byP[prof] || 0;
  const meta  = _E_PROF_DISP[prof];

  const basket = typeof window.getConsumptionBasket === 'function' ? window.getConsumptionBasket(pop.wealth) : {};
  const byTier = { basic: [], standard: [], luxury: [] };
  let totalCost = 0;
  for (const [gId, amtPer1k] of Object.entries(basket)) {
    const def   = window.GOODS?.[gId];
    const price = window.GAME_STATE?.market?.[gId]?.price ?? def?.base_price ?? 0;
    const cost  = amtPer1k * price;
    const tier  = (typeof _MC_TIER !== 'undefined' ? _MC_TIER[def?.market_category] : null) || 'standard';
    (byTier[tier] || byTier.standard).push({ gId, name: def?.name || gId, amtPer1k, price, cost });
    totalCost += cost;
  }
  const totalGroup = totalCost * (popSz / 1000);

  const profBtns = availProfs.map(p => {
    const m  = _E_PROF_DISP[p];
    const on = p === prof;
    return `<button onclick="_eSelectProf('${p}')" style="padding:4px 12px;border-radius:16px;font-size:10px;cursor:pointer;font-family:inherit;background:${on ? 'rgba(74,159,106,0.18)' : 'rgba(255,255,255,0.04)'};border:1px solid ${on ? 'rgba(74,159,106,0.5)' : _C.border};color:${on ? '#a8d8b0' : _C.ivoryDim}">${m.icon} ${m.name}</button>`;
  }).join('');

  const stackBar = Object.entries(byTier).map(([t, rows]) => {
    const v = rows.reduce((s, r) => s + r.cost, 0);
    if (!v || !totalCost) return '';
    const pct = (v / totalCost * 100).toFixed(1);
    return `<div title="${_E_TIER_CFG[t].label}: ${pct}%" style="width:${pct}%;min-width:3px;background:${_E_TIER_CFG[t].color};box-shadow:inset 0 1px 0 rgba(255,255,255,0.15)"></div>`;
  }).join('');

  const tierDetails = Object.entries(byTier).map(([tier, rows]) => {
    if (!rows.length) return '';
    const cfg     = _E_TIER_CFG[tier];
    const tierSum = rows.reduce((s, r) => s + r.cost, 0);
    const rowsHtml = rows.map(r => `
      <div style="display:flex;justify-content:space-between;font-size:9.5px;font-family:sans-serif;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="color:${_C.ivoryDim}">${r.name}</span>
        <span style="color:${_C.ivory}">${r.amtPer1k.toFixed(1)} / тыс. · ${r.price.toFixed(1)} gold → <b style="color:${cfg.color}">${_efmt(r.cost)}</b></span>
      </div>`).join('');
    return `<div style="background:${_C.bgGhost};border-radius:8px;padding:10px 12px;border:1px solid ${cfg.color}28;margin-bottom:6px">
      <div style="font-size:10px;font-weight:700;color:${cfg.color};margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">${cfg.label} <span style="font-weight:400;color:${_C.ivoryDim};font-size:9px">· ${_efmt(tierSum)} gold</span></div>
      ${rowsHtml}
    </div>`;
  }).join('');

  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${profBtns}</div>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding:13px 16px;border-radius:10px;background:${_C.bgCard};border:1px solid ${_C.border};box-shadow:0 4px 24px rgba(0,0,0,0.55)">
      <span style="font-size:28px;line-height:1">${meta.icon}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-family:'Cinzel',serif;color:${_C.gold}">${meta.name}</div>
        <div style="font-size:9.5px;color:${_C.ivoryDim};margin-top:2px">${_efmt(popSz)} чел. · Богатство ${pop.wealth.toFixed(1)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:17px;font-family:'Cinzel',serif;color:${_C.gold}">${_efmt(totalGroup)}</div>
        <div style="font-size:9px;color:${_C.ivoryFade}">gold / тик</div>
      </div>
    </div>
    <div style="margin-bottom:14px">
      <div style="display:flex;height:13px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,0.06);margin-bottom:6px;box-shadow:inset 0 1px 3px rgba(0,0,0,0.4)">${stackBar}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:9px;color:${_C.ivoryDim};font-family:sans-serif">
        ${Object.entries(_E_TIER_CFG).map(([t, cfg]) => {
          const v = byTier[t].reduce((s, r) => s + r.cost, 0);
          return `<span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:${cfg.color};display:inline-block"></span>${cfg.label}: ${_efmt(v)}</span>`;
        }).join('')}
      </div>
    </div>
    <div>${tierDetails || `<div style="text-align:center;padding:16px;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет данных о потреблении</div>`}</div>`;
}

// ─── Вкладка M: Рынки ────────────────────────────────────────────────────
let _eMarketSub    = 'world';   // 'world' | 'province' | 'region'
let _eMarketProvTag = null;
let _eMarketRegId   = null;

function _eSetMarketSub(s)  { _eMarketSub = s; _eRender(); }
function _eSetMarketProv(t) { _eMarketProvTag = t; _eRender(); }
function _eSetMarketReg(id) { _eMarketRegId  = id; _eRender(); }

// ─── Загрузка рыночных данных ─────────────────────────────────────────────
function _eLoadWorldGoods() {
  if (typeof GOODS === 'undefined') return [];
  const market = window.GAME_STATE?.market || {};
  return Object.entries(GOODS)
    .filter(([g]) => market[g] && g !== 'slaves')
    .map(([gId, def]) => {
      const mkt   = market[gId];
      const price = mkt.price ?? def.base_price ?? 0;
      const base  = mkt.base ?? def.base_price ?? price;
      const ph    = Array.isArray(mkt.price_history) && mkt.price_history.length ? mkt.price_history.slice(-12) : [price];
      const trend = ph.length >= 2 ? +((ph[ph.length-1] - ph[0]) / (ph[0] || 1) * 100).toFixed(1) : 0;
      const ws    = mkt.world_stockpile ?? 0;
      const dem   = Math.max(mkt.demand  || 1, 1);
      const sup   = mkt.supply || 0;
      const tgt   = (def.stockpile_target_turns ?? 4) * dem;
      const status = ws < 0.5 * tgt ? 'Дефицит' : ws > 2 * tgt ? 'Избыток' : 'Норма';
      const pctBase = base > 0 ? ((price - base) / base * 100) : 0;
      const cat     = _E_CAT_MAP[def.category] || 'Промышленность';
      return { id: gId, name: def.name || gId, icon: def.icon || '📦', category: cat,
               price, base, pctBase, stock: ws, target: tgt, supply: sup, demand: dem,
               trend, status, history: ph };
    });
}

function _eLoadNationProvinces() {
  const nId    = window.GAME_STATE?.player_nation;
  const nation = window.GAME_STATE?.nations?.[nId];
  if (!nation) return [];
  const provs  = window.GAME_STATE?.provinces || {};
  // collect province tags from nation's regions
  const seen = new Set();
  for (const rid of (nation.regions || [])) {
    const region = window.GAME_STATE?.regions?.[rid];
    const tag    = Array.isArray(region?.tags) ? region.tags[0] : null;
    if (tag && provs[tag]) seen.add(tag);
  }
  return [...seen].map(tag => {
    const prov = provs[tag];
    const ctrl = prov.effective_control?.[nId] ?? 0;
    const tier = ctrl >= 1.0 ? 'full' : ctrl >= 0.5 ? 'partial' : ctrl >= 0.2 ? 'trade_only' : 'none';
    return { tag, prov, ctrl, tier };
  });
}

function _eLoadNationRegions() {
  const nId    = window.GAME_STATE?.player_nation;
  const nation = window.GAME_STATE?.nations?.[nId];
  if (!nation) return [];
  const provs  = window.GAME_STATE?.provinces || {};
  return (nation.regions || []).map(rid => {
    const region  = window.GAME_STATE?.regions?.[rid];
    if (!region) return null;
    const tag     = Array.isArray(region.tags) ? region.tags[0] : null;
    const name    = (typeof MAP_REGIONS !== 'undefined' && MAP_REGIONS[rid]?.name) || rid;
    const stocks  = region.local_stockpile || {};
    const locMkt  = region.local_market    || {};
    const prod    = region._production_last_tick || {};
    return { rid, name, tag, stocks, locMkt, prod };
  }).filter(Boolean);
}

// ─── M: Мировой рынок ──────────────────────────────────────────────────────
function _eRenderM_World() {
  const goods = _eLoadWorldGoods();
  if (!goods.length) return `<div style="text-align:center;padding:30px;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет рыночных данных. Запустите ход.</div>`;

  const catOrder = ['Провизия', 'Промышленность', 'Роскошь'];
  const groups   = {};
  for (const g of goods) {
    if (!groups[g.category]) groups[g.category] = [];
    groups[g.category].push(g);
  }
  const cats = [...catOrder.filter(c => groups[c]), ...Object.keys(groups).filter(c => !catOrder.includes(c))];

  const defCol  = `rgba(224,85,85,0.12)`;
  const surpCol = `rgba(91,155,213,0.08)`;

  return cats.map(cat => {
    const items = [...(groups[cat] || [])].sort((a, b) => {
      const da = a.status === 'Дефицит' ? 0 : 1;
      const db = b.status === 'Дефицит' ? 0 : 1;
      return da !== db ? da - db : Math.abs(b.trend) - Math.abs(a.trend);
    });
    const meta = _E_CAT_META[cat] || { icon: '📦', color: _C.gold };
    const nDef = items.filter(i => i.status === 'Дефицит').length;

    const header = `<div style="display:grid;grid-template-columns:180px 90px 90px 90px 90px 70px 76px;align-items:center;gap:6px;padding:5px 10px;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:${_C.ivoryFade};border-bottom:1px solid ${_C.border}">
      <span>Товар</span><span style="text-align:right">Цена</span><span style="text-align:right">Δ база</span><span style="text-align:right">Мировой запас</span><span style="text-align:right">Спрос</span><span style="text-align:right">Предл.</span><span style="text-align:center">Статус</span>
    </div>`;

    const rows = items.map(item => {
      const isD  = item.status === 'Дефицит';
      const isS  = item.status === 'Избыток';
      const tc   = item.trend > 1.5 ? _C.red : item.trend < -1.5 ? _C.green : _C.gold;
      const ti   = item.trend > 1.5 ? '▲' : item.trend < -1.5 ? '▼' : '▸';
      const pcol = item.pctBase > 5 ? _C.red : item.pctBase < -5 ? _C.green : _C.ivoryDim;
      const badgeStyle = isD
        ? `background:rgba(224,85,85,0.15);border:1px solid rgba(224,85,85,0.35);color:#e07777`
        : isS
          ? `background:rgba(91,155,213,0.15);border:1px solid rgba(91,155,213,0.3);color:#5b9bd5`
          : `background:rgba(74,159,106,0.12);border:1px solid rgba(74,159,106,0.28);color:#4a9f6a`;
      const badge = `<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:10px;font-size:8.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;white-space:nowrap;${badgeStyle}">${item.status}</span>`;
      const bg    = isD ? defCol : isS ? surpCol : _C.bgGhost;
      return `<div style="display:grid;grid-template-columns:180px 90px 90px 90px 90px 70px 76px;align-items:center;gap:6px;padding:7px 10px;border-radius:6px;background:${bg};border:1px solid ${isD ? 'rgba(224,85,85,0.18)' : _C.border};margin-bottom:2px">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:18px;line-height:1">${item.icon}</span>
          <div>
            <div style="font-size:11px;color:${_C.ivory};font-weight:600;line-height:1.2">${item.name}</div>
            <div style="font-size:8.5px;color:${_C.ivoryDim}">Запас: ${_efmt(item.stock)}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-family:'Cinzel',serif;color:${_C.gold}">${item.price.toFixed(1)}</div>
          <div style="font-size:8px;color:${_C.ivoryFade}">gold</div>
        </div>
        <div style="text-align:right;font-size:10.5px;color:${pcol};font-weight:600">${item.pctBase > 0 ? '+' : ''}${item.pctBase.toFixed(1)}%</div>
        <div style="text-align:right">
          <div style="font-size:10px;color:${_C.ivory}">${_efmt(item.stock)}</div>
          <div style="font-size:8px;color:${_C.ivoryFade}">цель: ${_efmt(item.target)}</div>
        </div>
        <div style="text-align:right;font-size:10px;color:${_C.ivory}">${_efmt(item.demand)}</div>
        <div style="text-align:right;font-size:10px;color:${_C.green}">${_efmt(item.supply)}</div>
        <div style="text-align:center">${badge}</div>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:10px;border-radius:10px;overflow:hidden;border:1px solid ${_C.border};background:rgba(15,22,15,0.6)">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid ${_C.border}">
        <span style="font-size:18px;line-height:1">${meta.icon}</span>
        <span style="font-size:12px;font-family:'Cinzel',serif;color:${meta.color};letter-spacing:.5px">${cat}</span>
        ${nDef > 0 ? `<span style="font-size:9px;color:${_C.red};margin-left:6px">${nDef} в дефиците</span>` : `<span style="font-size:9px;color:${_C.green};margin-left:6px">Баланс норм</span>`}
      </div>
      <div style="padding:6px 8px 8px">
        ${header}
        ${rows}
      </div>
    </div>`;
  }).join('');
}

// ─── M: Областные рынки ───────────────────────────────────────────────────
function _eRenderM_Province() {
  const provList = _eLoadNationProvinces();
  if (!provList.length) return `<div style="text-align:center;padding:30px;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет провинций под контролем.</div>`;

  const selTag = _eMarketProvTag || provList[0]?.tag;
  const selObj = provList.find(p => p.tag === selTag) || provList[0];
  const prov   = selObj?.prov;

  const tierLabels = { full: 'Полный', partial: 'Частичный', trade_only: 'Торговля', none: 'Нет доступа' };
  const tierColors = { full: _C.green, partial: _C.gold, trade_only: _C.copper, none: _C.red };

  // left: province list
  const provNav = provList.map(p => {
    const on      = p.tag === selTag;
    const tierCol = tierColors[p.tier] || _C.ivoryDim;
    return `<div onclick="_eSetMarketProv('${p.tag}')" style="padding:8px 12px;border-radius:7px;cursor:pointer;background:${on ? 'rgba(74,159,106,0.15)' : _C.bgGhost};border:1px solid ${on ? 'rgba(74,159,106,0.4)' : _C.border};margin-bottom:4px">
      <div style="font-size:11px;color:${on ? '#a8d8b0' : _C.ivory};font-family:'Cinzel',serif;text-transform:capitalize">${p.tag}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
        <span style="font-size:9px;color:${tierCol}">${tierLabels[p.tier] || p.tier}</span>
        <span style="font-size:9px;color:${_C.ivoryFade}">· ${(p.ctrl * 100).toFixed(0)}%</span>
        ${prov?.has_roads ? `<span style="font-size:9px;color:${_C.blue}">🛣 Дороги</span>` : ''}
      </div>
    </div>`;
  }).join('');

  // right: goods table for selected province
  let goodsHtml;
  const mkt = prov?.market || {};
  const goodEntries = Object.entries(mkt).filter(([g]) => GOODS?.[g]);
  if (!goodEntries.length) {
    goodsHtml = `<div style="padding:20px;text-align:center;color:${_C.ivoryFade};font-size:11px;font-style:italic">Рынок ещё не инициализирован. Запустите ход.</div>`;
  } else {
    const header = `<div style="display:grid;grid-template-columns:1fr 90px 90px 80px;align-items:center;gap:6px;padding:5px 10px;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:${_C.ivoryFade};border-bottom:1px solid ${_C.border}">
      <span>Товар</span><span style="text-align:right">Цена пров.</span><span style="text-align:right">Доступно</span><span style="text-align:right">Δ от мирового</span>
    </div>`;
    const rows = goodEntries.map(([gId, entry]) => {
      const def      = GOODS[gId];
      const worldPrc = window.GAME_STATE?.market?.[gId]?.price ?? def?.base_price ?? 0;
      const provPrc  = entry.price ?? worldPrc;
      const diff     = worldPrc > 0 ? ((provPrc - worldPrc) / worldPrc * 100) : 0;
      const diffCol  = diff > 3 ? _C.red : diff < -3 ? _C.green : _C.ivoryDim;
      const avail    = entry.available ?? 0;
      return `<div style="display:grid;grid-template-columns:1fr 90px 90px 80px;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:15px">${def.icon || '📦'}</span>
          <span style="font-size:11px;color:${_C.ivory}">${def.name || gId}</span>
        </div>
        <div style="text-align:right;font-size:12px;font-family:'Cinzel',serif;color:${_C.gold}">${provPrc.toFixed(1)}</div>
        <div style="text-align:right;font-size:10.5px;color:${_C.ivory}">${_efmt(avail)}</div>
        <div style="text-align:right;font-size:10px;color:${diffCol};font-weight:600">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</div>
      </div>`;
    }).join('');
    goodsHtml = `${header}<div>${rows}</div>`;
  }

  const ctrlVal = (selObj?.ctrl ?? 0);
  const roadInfo = prov?.has_roads ? `🛣 Дороги есть (транспорт -5%)` : `Дорог нет (транспорт +15%)`;

  return `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px">
    <div>
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:${_C.ivoryFade};margin-bottom:8px;padding:0 4px">Области</div>
      ${provNav}
    </div>
    <div style="border-radius:10px;overflow:hidden;border:1px solid ${_C.border};background:rgba(15,22,15,0.6)">
      <div style="padding:10px 14px;border-bottom:1px solid ${_C.border};display:flex;align-items:center;gap:12px">
        <div style="flex:1">
          <div style="font-size:13px;font-family:'Cinzel',serif;color:${_C.gold};text-transform:capitalize">${selTag}</div>
          <div style="font-size:9px;color:${_C.ivoryFade};margin-top:2px">${roadInfo} · Контроль: ${(ctrlVal * 100).toFixed(0)}% · Доступ: <span style="color:${tierColors[selObj?.tier]}">${tierLabels[selObj?.tier] || '—'}</span></div>
        </div>
        <div style="font-size:9px;color:${_C.ivoryDim}">${(prov?.regions || []).length} регионов</div>
      </div>
      <div style="max-height:420px;overflow-y:auto">${goodsHtml}</div>
    </div>
  </div>`;
}

// ─── M: Региональные рынки ────────────────────────────────────────────────
function _eRenderM_Region() {
  const regions = _eLoadNationRegions();
  if (!regions.length) return `<div style="text-align:center;padding:30px;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет регионов.</div>`;

  // group by province tag
  const byProv = {};
  for (const r of regions) {
    const key = r.tag || '—';
    if (!byProv[key]) byProv[key] = [];
    byProv[key].push(r);
  }

  const selId  = _eMarketRegId || regions[0]?.rid;
  const selReg = regions.find(r => r.rid === selId) || regions[0];

  // left: region list grouped by province
  const regNav = Object.entries(byProv).map(([provTag, regs]) => {
    const provHead = `<div style="font-size:8.5px;text-transform:uppercase;letter-spacing:.5px;color:${_C.ivoryFade};padding:6px 4px 3px;font-family:'Cinzel',serif">${provTag}</div>`;
    const regItems = regs.map(r => {
      const on     = r.rid === selId;
      const nGoods = Object.keys(r.stocks).length;
      return `<div onclick="_eSetMarketReg('${r.rid}')" style="padding:6px 10px;border-radius:6px;cursor:pointer;background:${on ? 'rgba(74,159,106,0.15)' : _C.bgGhost};border:1px solid ${on ? 'rgba(74,159,106,0.4)' : _C.border};margin-bottom:3px">
        <div style="font-size:10.5px;color:${on ? '#a8d8b0' : _C.ivory}">${r.name}</div>
        <div style="font-size:8.5px;color:${_C.ivoryFade};margin-top:1px">${nGoods} товаров</div>
      </div>`;
    }).join('');
    return `<div>${provHead}${regItems}</div>`;
  }).join('');

  // right: local market for selected region
  // Show ALL market goods (not just those in local_stockpile), so goods like wheat
  // are always visible — showing 0 when the region doesn't produce them.
  let goodsHtml;
  const mktGoods = typeof GOODS !== 'undefined'
    ? Object.keys(GOODS).filter(g => g !== 'slaves' && window.GAME_STATE?.market?.[g])
    : [];
  if (!mktGoods.length) {
    goodsHtml = `<div style="padding:20px;text-align:center;color:${_C.ivoryFade};font-size:11px;font-style:italic">Нет локальных данных. Запустите ход для инициализации.</div>`;
  } else {
    // Sort: goods with local production first, then by name
    const sorted = [...mktGoods].sort((a, b) => {
      const pa = (selReg?.prod?.[a] || 0) + (selReg?.stocks?.[a] || 0);
      const pb = (selReg?.prod?.[b] || 0) + (selReg?.stocks?.[b] || 0);
      if (pa > 0 && pb === 0) return -1;
      if (pb > 0 && pa === 0) return  1;
      return (GOODS[a]?.name || a).localeCompare(GOODS[b]?.name || b, 'ru');
    });
    const header = `<div style="display:grid;grid-template-columns:1fr 80px 80px 80px 75px;align-items:center;gap:6px;padding:5px 10px;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:${_C.ivoryFade};border-bottom:1px solid ${_C.border}">
      <span>Товар</span><span style="text-align:right">Цена лок.</span><span style="text-align:right">Запас лок.</span><span style="text-align:right">Произв./тик</span><span style="text-align:right">Δ от мирового</span>
    </div>`;
    const rows = sorted.map(gId => {
      const def      = GOODS[gId];
      const stock    = selReg?.stocks?.[gId] || 0;
      const prod     = selReg?.prod?.[gId]   || 0;
      const worldPrc = window.GAME_STATE?.market?.[gId]?.price ?? def?.base_price ?? 0;
      const locPrc   = selReg?.locMkt?.[gId]?.price ?? worldPrc;
      const diff     = worldPrc > 0 ? ((locPrc - worldPrc) / worldPrc * 100) : 0;
      const diffCol  = diff > 5 ? _C.red : diff < -5 ? _C.green : _C.ivoryDim;
      const prodCol  = prod > 0 ? _C.green : _C.ivoryFade;
      const noLocal  = stock === 0 && prod === 0;
      const rowBg    = noLocal ? 'transparent' : _C.bgGhost;
      const nameCol  = noLocal ? _C.ivoryFade : _C.ivory;
      return `<div style="display:grid;grid-template-columns:1fr 80px 80px 80px 75px;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.03);background:${rowBg}">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:15px;opacity:${noLocal ? 0.4 : 1}">${def.icon || '📦'}</span>
          <span style="font-size:11px;color:${nameCol}">${def.name || gId}</span>
        </div>
        <div style="text-align:right;font-size:11.5px;font-family:'Cinzel',serif;color:${noLocal ? _C.ivoryFade : _C.gold}">${noLocal ? '—' : locPrc.toFixed(1)}</div>
        <div style="text-align:right;font-size:10.5px;color:${noLocal ? _C.ivoryFade : _C.ivory}">${noLocal ? '—' : _efmt(stock)}</div>
        <div style="text-align:right;font-size:10px;color:${prodCol}">${prod > 0 ? '+' + _efmt(prod) : (noLocal ? '—' : '0')}</div>
        <div style="text-align:right;font-size:10px;color:${noLocal ? _C.ivoryFade : diffCol};font-weight:${noLocal ? 400 : 600}">${noLocal ? '—' : (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'}</div>
      </div>`;
    }).join('');
    goodsHtml = `${header}<div>${rows}</div>`;
  }

  return `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px">
    <div style="max-height:480px;overflow-y:auto">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:${_C.ivoryFade};margin-bottom:4px;padding:0 4px">Регионы</div>
      ${regNav}
    </div>
    <div style="border-radius:10px;overflow:hidden;border:1px solid ${_C.border};background:rgba(15,22,15,0.6)">
      <div style="padding:10px 14px;border-bottom:1px solid ${_C.border}">
        <div style="font-size:13px;font-family:'Cinzel',serif;color:${_C.gold}">${selReg?.name || selId}</div>
        <div style="font-size:9px;color:${_C.ivoryFade};margin-top:2px">Область: ${selReg?.tag || '—'}</div>
      </div>
      <div style="max-height:420px;overflow-y:auto">${goodsHtml}</div>
    </div>
  </div>`;
}

// ─── M: Главный блок рынков ───────────────────────────────────────────────
function _eRenderM() {
  const subTabs = [
    { id: 'world',    label: '🌍 Мировой'  },
    { id: 'province', label: '🏛 Области'  },
    { id: 'region',   label: '🏘 Регионы'  },
  ];
  const sub = _eMarketSub;
  const nav = subTabs.map(t => {
    const on = t.id === sub;
    return `<button onclick="_eSetMarketSub('${t.id}')" style="padding:5px 14px;border-radius:5px;font-size:10px;cursor:pointer;font-family:inherit;font-weight:${on ? 700 : 400};background:${on ? 'rgba(212,175,55,0.15)' : 'transparent'};border:${on ? `1px solid ${_C.borderAcc}` : `1px solid ${_C.border}`};color:${on ? _C.gold : _C.ivoryDim};transition:all .15s">${t.label}</button>`;
  }).join('');

  const content =
    sub === 'world'    ? _eRenderM_World()    :
    sub === 'province' ? _eRenderM_Province() :
                         _eRenderM_Region();

  return `
    <div style="display:flex;gap:6px;margin-bottom:12px">${nav}</div>
    ${content}`;
}

// ─── Блок D: Баланс кошелька ──────────────────────────────────────────────
function _eRenderD() {
  const { pops, byP, hist, eco } = _eLoadPop();
  const actualInc = _eActualIncome(eco);
  const actualExp = _eActualExpense(eco);
  const delta = actualInc - actualExp;
  const dCol  = delta >= 0 ? _C.green : _C.red;

  const rows = Object.keys(_E_PROF_DISP).map(prof => {
    const pop   = pops[prof];
    const popSz = byP[prof] || 0;
    if (!pop || popSz < 10 || prof === 'slaves') return '';
    const meta   = _E_PROF_DISP[prof];
    const income = pop.income_last || 0;
    const basket = typeof window.getConsumptionBasket === 'function' ? window.getConsumptionBasket(pop.wealth) : {};
    let expPer1k = 0;
    for (const [gId, amt] of Object.entries(basket)) {
      const p = window.GAME_STATE?.market?.[gId]?.price ?? window.GOODS?.[gId]?.base_price ?? 0;
      expPer1k += amt * p;
    }
    const expGroup = expPer1k * (popSz / 1000);
    const net = income - expGroup;
    let wdelta = null;
    if (hist.length >= 2) {
      const c = hist[hist.length-1]?.pops?.[prof]?.wealth;
      const p = hist[hist.length-2]?.pops?.[prof]?.wealth;
      if (c != null && p != null) wdelta = c - p;
    }
    const sat    = pop.satisfied ?? 0.75;
    const netCol = net > 0 ? _C.green : net < 0 ? _C.red : _C.gold;
    const wdCol  = wdelta == null ? _C.ivoryDim : wdelta > 0 ? _C.green : wdelta < 0 ? _C.red : _C.gold;
    const satCol = sat > 0.8 ? _C.green : sat > 0.5 ? _C.gold : _C.red;
    return `<div style="display:grid;grid-template-columns:145px 1fr 1fr 135px 95px 90px;align-items:center;gap:10px;background:${_C.bgCard};border:1px solid ${_C.border};border-radius:8px;padding:10px 14px;box-shadow:0 4px 24px rgba(0,0,0,0.55);margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:18px">${meta.icon}</span>
        <div>
          <div style="font-size:11px;font-family:'Cinzel',serif;color:${_C.gold}">${meta.name}</div>
          <div style="font-size:9px;color:${_C.ivoryFade}">${_efmt(popSz)}</div>
        </div>
      </div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Доход</div><div style="font-size:12px;color:${_C.green};font-family:sans-serif;margin-top:1px">+${_efmt(income)}</div></div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Расходы</div><div style="font-size:12px;color:${_C.red};font-family:sans-serif;margin-top:1px">-${_efmt(expGroup)}</div></div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Прибыль</div><div style="font-size:14px;font-family:'Cinzel',serif;color:${netCol};font-weight:700;margin-top:1px">${net >= 0 ? '+' : ''}${_efmt(net)}</div></div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Δ богатство</div><div style="font-size:11px;color:${wdCol};font-family:sans-serif;margin-top:2px">${wdelta == null ? '—' : `${wdelta > 0 ? '▲' : wdelta < 0 ? '▼' : '▸'} ${Math.abs(wdelta).toFixed(2)}`}</div></div>
      <div>
        <div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Насыщение</div>
        <div style="background:rgba(255,255,255,0.07);border-radius:2px;height:5px;margin:4px 0 2px;overflow:hidden"><div style="width:${(sat*100).toFixed(0)}%;height:5px;background:${satCol};box-shadow:0 0 5px ${satCol}66"></div></div>
        <div style="font-size:9px;color:${satCol};font-family:sans-serif">${(sat*100).toFixed(0)}%</div>
      </div>
    </div>`;
  }).join('');

  return `
    <div>${rows || `<div style="padding:20px;text-align:center;color:${_C.ivoryFade};font-size:11px">Нет данных</div>`}</div>
    <div style="display:grid;grid-template-columns:145px 1fr 1fr 135px;align-items:center;gap:10px;background:rgba(74,159,106,0.07);border:1px solid rgba(74,159,106,0.25);border-radius:8px;padding:10px 14px;margin-top:4px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:18px">🏛</span>
        <div>
          <div style="font-size:11px;font-family:'Cinzel',serif;color:#a8d8b0">Казна</div>
          <div style="font-size:9px;color:${_C.ivoryFade}">${_efmt(eco.treasury || 0)} gold</div>
        </div>
      </div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Доходы</div><div style="font-size:12px;color:${_C.green};font-family:sans-serif;margin-top:1px">${(actualInc > 0 ? '+' : '') + _efmt(actualInc)}</div></div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Расходы</div><div style="font-size:12px;color:${_C.red};font-family:sans-serif;margin-top:1px">${(actualExp > 0 ? '-' : '') + _efmt(actualExp)}</div></div>
      <div><div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.3px">Баланс / тик</div><div style="font-size:14px;font-family:'Cinzel',serif;color:${dCol};font-weight:700;margin-top:1px">${delta >= 0 ? '+' : ''}${_efmt(delta)}</div></div>
    </div>`;
}

// ─── Hero Strip ───────────────────────────────────────────────────────────
function _eHeroStrip(eco) {
  const byP         = GAME_STATE?.nations?.[GAME_STATE?.player_nation]?.population?.by_profession || {};
  const actualInc   = _eActualIncome(eco);
  const actualExp   = _eActualExpense(eco);
  const effectiveR  = _eEffectiveTaxRate(eco, byP);
  const metrics = [
    { label: 'Казна',        value: _efmt(eco?.treasury || 0),                              unit: 'золото', color: _C.gold   },
    { label: 'Доход / тик',  value: (actualInc  > 0 ? '+' : '') + _efmt(actualInc),         unit: '',       color: _C.green  },
    { label: 'Расход / тик', value: (actualExp  > 0 ? '-' : '') + _efmt(actualExp),          unit: '',       color: _C.red    },
    { label: 'Ср. налог',    value: (effectiveR * 100).toFixed(1) + '%',                     unit: '',       color: _C.copper },
  ];
  return `<div style="display:flex;border-bottom:1px solid ${_C.border}">` +
    metrics.map((m, i) => `
      <div style="flex:1;padding:11px 0;text-align:center;${i < metrics.length - 1 ? 'border-right:1px solid rgba(212,175,55,0.08)' : ''}">
        <div style="font-size:8.5px;color:${_C.ivoryFade};text-transform:uppercase;letter-spacing:.5px">${m.label}</div>
        <div style="font-size:17px;font-family:'Cinzel',serif;color:${m.color};margin:3px 0 1px;line-height:1">${m.value}</div>
        ${m.unit ? `<div style="font-size:9px;color:${_C.ivoryFade}">${m.unit}</div>` : ''}
      </div>`).join('') + '</div>';
}

// ─── Главный рендер ───────────────────────────────────────────────────────
function _eRender() {
  const el = document.getElementById('economy-overlay');
  if (!el || el.classList.contains('hidden')) return;

  const { eco, name, alert } = _eLoadPop();
  const marketData = _eLoadMarket();
  const tab = _ecoTab;

  const TABS = [
    { id: 'A', label: '📊 Биржа'   },
    { id: 'B', label: '💰 Доходы'  },
    { id: 'C', label: '🧺 Корзина' },
    { id: 'D', label: '⚖ Баланс'   },
    { id: 'M', label: '🗺 Рынки'   },
  ];

  const tabNav = TABS.map(t => {
    const on = t.id === tab;
    return `<button onclick="_eSetTab('${t.id}')" style="padding:7px 16px;border-radius:6px;font-size:10.5px;cursor:pointer;font-family:inherit;font-weight:${on ? 700 : 400};background:${on ? 'rgba(74,159,106,0.2)' : 'transparent'};border:${on ? '1px solid rgba(74,159,106,0.5)' : `1px solid ${_C.border}`};color:${on ? '#a8d8b0' : _C.ivoryDim};transition:all .15s" onmouseover="this.style.background='rgba(212,175,55,0.08)'" onmouseout="this.style.background='${on ? 'rgba(74,159,106,0.2)' : 'transparent'}'">
      ${t.label}${t.id === 'B' && alert ? ' <span class="eco-alert-blink" style="color:#e05555">●</span>' : ''}
    </button>`;
  }).join('');

  const content =
    tab === 'A' ? _eRenderA(marketData) :
    tab === 'B' ? _eRenderB() :
    tab === 'C' ? _eRenderC(_ecoSelProf) :
    tab === 'M' ? _eRenderM() :
                  _eRenderD();

  el.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.84);z-index:3100;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px 48px" id="eco-backdrop" onclick="_eBackdropClick(event)">
      <div style="width:920px;max-width:98vw;background:${_C.bgMain};backdrop-filter:blur(24px) saturate(1.5);border:1px solid ${_C.borderGrn};border-radius:12px;box-shadow:0 28px 90px rgba(0,0,0,0.92),inset 0 1px 0 rgba(74,159,106,0.09)">

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;padding:16px 20px 14px;border-bottom:1px solid ${_C.borderGrn}">
          <span style="font-size:24px;line-height:1">💹</span>
          <div style="flex:1">
            <div style="font-size:16px;font-family:'Cinzel',serif;color:${_C.ivory};letter-spacing:.8px">Экономический обзор</div>
            <div style="font-size:10px;color:${_C.ivoryDim};margin-top:2px">${name} · Ход ${window.GAME_STATE?.turn || 1}</div>
          </div>
          <button onclick="hideEconomyOverlay()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid ${_C.border};color:${_C.ivoryDim};font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1" onmouseover="this.style.background='rgba(224,85,85,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">✕</button>
        </div>

        <!-- Hero -->
        ${_eHeroStrip(eco)}

        <!-- Tabs -->
        <div style="display:flex;gap:6px;padding:12px 18px 10px;border-bottom:1px solid ${_C.border}">${tabNav}</div>

        <!-- Content -->
        <div style="padding:14px 18px 24px;min-height:320px">${content}</div>

      </div>
    </div>`;
}

// ─── Обработчики событий (вызываются из inline onclick) ───────────────────
function _eSetTab(t) {
  _ecoTab = t;
  _eRender();
}
function _eToggleCat(cat) {
  _eOpenCats[cat] = !_eOpenCats[cat];
  _eRender();
}
function _eSelectProf(p) {
  _ecoSelProf = p;
  _eRender();
}
function _eBackdropClick(e) {
  if (e.target.id === 'eco-backdrop') hideEconomyOverlay();
}

// ─── Инициализация состояния accordion ───────────────────────────────────
let _eOpenCats = { 'Провизия': true, 'Промышленность': true, 'Роскошь': false };

// ─── PUBLIC API ───────────────────────────────────────────────────────────
function showEconomyOverlay() {
  const el = document.getElementById('economy-overlay');
  if (!el) return;
  el.classList.remove('hidden');
  _eRender();
}

function hideEconomyOverlay() {
  const el = document.getElementById('economy-overlay');
  if (el) el.classList.add('hidden');
}

function refreshEconomyTab() {
  const nation = typeof _econNation === 'function' ? _econNation() : null;
  const btn    = document.getElementById('eco-open-btn');
  if (btn) btn.classList.toggle('eco-btn-alert', !!(nation?.economy?._income_alert));
  _eRender();
}
