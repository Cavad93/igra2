// ═══════════════════════════════════════════════════════════════════════════
// ЭКОНОМИЧЕСКИЙ ОБЗОР — DATA LAYER — ui/economy_tab.js
//
//  Хранит только логику данных и историю. UI вынесен в economy_react.jsx.
//  Функции showEconomyOverlay / hideEconomyOverlay / refreshEconomyTab
//  определяются в economy_react.jsx после загрузки Babel+React.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Маппинг market_category → тир ────────────────────────────────────────
const _MC_TIER = {
  food_staple:    'basic',
  raw_material:   'basic',
  food_processed: 'standard',
  processed_goods:'standard',
  trade_hub:      'standard',
  luxury:         'luxury',
  labor:          'luxury',
};

// ─────────────────────────────────────────────────────────────────────────
// HISTORY RECORDING — вызывается из turn.js после runEconomyTick()
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
  let hasAlert = false;
  if (hist.length >= 2) {
    const prev = hist[hist.length - 2];
    for (const [prof, cur] of Object.entries(snap.pops)) {
      const prevInc = prev.pops?.[prof]?.income_last || 0;
      if (prevInc > 0 && (prevInc - cur.income_last) / prevInc > 0.20) { hasAlert = true; break; }
    }
  }
  nation.economy._income_alert = hasAlert;
}

// ─────────────────────────────────────────────────────────────────────────
// DATA HELPERS (используются в React-компоненте через window.*)
// ─────────────────────────────────────────────────────────────────────────

function _econNation() {
  return GAME_STATE.nations[GAME_STATE.player_nation];
}

function _avgIncomePerCap(nation) {
  const pops = nation?.population?.pops;
  const byP  = nation?.population?.by_profession;
  if (!pops || !byP) return 0;
  let totalInc = 0, totalPop = 0;
  for (const [prof, pop] of Object.entries(pops)) {
    totalInc += (pop.income_last || 0);
    totalPop += (byP[prof] || 0);
  }
  return totalPop > 0 ? (totalInc / totalPop) * 1000 : 0;
}

// Динамический тир товара по цене относительно среднего дохода
function _goodTier(goodId, avgIncomePCap) {
  const def  = typeof GOODS !== 'undefined' ? GOODS[goodId] : null;
  const base = _MC_TIER[def?.market_category] || 'standard';
  if (!avgIncomePCap || avgIncomePCap <= 0) return base;
  const price = GAME_STATE.market?.[goodId]?.price ?? def?.base_price ?? 0;
  if (price >= avgIncomePCap * 0.9) return 'luxury';
  if (price <= avgIncomePCap * 0.06) return 'basic';
  return base;
}

// ─────────────────────────────────────────────────────────────────────────
// STUBS — будут переопределены в economy_react.jsx
// ─────────────────────────────────────────────────────────────────────────

function showEconomyOverlay() {
  // Заглушка до загрузки React. Babel Standalone заменит эту функцию.
  const el = document.getElementById('economy-overlay');
  if (el) el.classList.remove('hidden');
}

function hideEconomyOverlay() {
  const el = document.getElementById('economy-overlay');
  if (el) el.classList.add('hidden');
}

function refreshEconomyTab() {
  // Переопределяется в economy_react.jsx
  const nation = _econNation();
  const btn    = document.getElementById('eco-open-btn');
  if (btn) btn.classList.toggle('eco-btn-alert', !!(nation?.economy?._income_alert));
}
