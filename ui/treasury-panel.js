// ui/treasury-panel.js — Панель управления казной
// Показывает доходы/расходы, слайдеры налогов с предпросмотром.

// ── Состояние предпросмотра ───────────────────────────────────
let _tpPreview   = null;  // { aristocrats, clergy, commoners, soldiers } — ставки 0..0.30
let _tpExpLevels = null;  // { army, navy, court, stability } — 0.5..1.5
let _tpDirty     = false; // Есть ли несохранённые изменения

// ── Названия и иконки налоговых групп ────────────────────────
const _TP_GROUPS = {
  aristocrats: { name: 'Знать',     icon: '👑' },
  clergy:      { name: 'Жречество', icon: '🏛' },
  commoners:   { name: 'Народ',     icon: '🌾' },
  soldiers:    { name: 'Воины',     icon: '⚔️' },
};

// ── Открыть панель ────────────────────────────────────────────
function showTreasuryOverlay() {
  const nation = GAME_STATE?.nations?.[GAME_STATE.player_nation];
  if (!nation) return;

  const cur = nation.economy.tax_rates_by_class
    || { aristocrats: 0.12, clergy: 0.10, commoners: 0.10, soldiers: 0.05 };
  _tpPreview = { ...cur };

  const lvls = nation.economy.expense_levels || {};
  _tpExpLevels = {
    army:       lvls.army       ?? 1.0,
    navy:       lvls.navy       ?? 1.0,
    court:      lvls.court      ?? 1.0,
    stability:  lvls.stability  ?? 1.0,
    fortresses: lvls.fortresses ?? 1.0,
    buildings:  lvls.buildings  ?? 1.0,
    slaves:     lvls.slaves     ?? 1.0,
  };
  _tpDirty = false;

  const el = document.getElementById('treasury-overlay');
  if (el) { el.classList.remove('hidden'); _tpRender(); }
}

// ── Закрыть панель ────────────────────────────────────────────
function hideTreasuryOverlay() {
  document.getElementById('treasury-overlay')?.classList.add('hidden');
  _tpPreview   = null;
  _tpExpLevels = null;
  _tpDirty     = false;
}

// ── Рассчитать доход от группы при заданной ставке ───────────
function _tpIncomeFor(group, rate) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (typeof computeTaxGroupBases !== 'function') return 0;
  const bases = computeTaxGroupBases(nation.population.by_profession);
  const bld   = typeof getBuildingBonuses === 'function'
    ? getBuildingBonuses(GAME_STATE.player_nation)
    : { tax_mult: 1 };
  return Math.round((bases[group] || 0) * rate * TAX_CALIBRATION * bld.tax_mult);
}

// ── Суммарный предпросмотр налогов ───────────────────────────
function _tpTaxTotal() {
  return Object.keys(_TP_GROUPS)
    .reduce((s, g) => s + _tpIncomeFor(g, _tpPreview[g] ?? 0), 0);
}

// ── Цвет ставки: зел/жёл/красн ───────────────────────────────
function _tpRateColor(rate) {
  if (rate <= 0.15) return 'var(--positive)';
  if (rate <= 0.22) return 'var(--warning)';
  return 'var(--negative)';
}

// ── Штраф к satisfaction при ставке > 20% ────────────────────
function _tpPenalty(rate) {
  return rate <= 0.20 ? 0 : -Math.min(40, Math.round((rate - 0.20) * 200));
}

// ── Обработчик слайдера расходов ─────────────────────────────
function _tpOnExpSlider(category, rawVal) {
  _tpExpLevels[category] = parseFloat(rawVal) / 100;
  _tpDirty = true;
  const col = document.getElementById('tp-expense-col');
  if (col) col.innerHTML = _tpRenderExpenses();
  const btn = document.getElementById('tp-apply-btn');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
  }
}

// ── Обработчик слайдера налогов ───────────────────────────────
function _tpOnSlider(group, rawVal) {
  _tpPreview[group] = parseFloat(rawVal) / 100;
  _tpDirty = true;
  // Частичная перерисовка: только колонка доходов
  const col = document.getElementById('tp-income-col');
  if (col) col.innerHTML = _tpRenderIncome();
  // Активировать кнопку — она живёт в footer, не перерисовывается
  const btn = document.getElementById('tp-apply-btn');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
  }
}

// ── Применить ставки и уровни расходов к GAME_STATE ──────────
function applyTreasuryRates() {
  if (!_tpPreview) return;
  const nationId = GAME_STATE.player_nation;
  const eco      = GAME_STATE.nations[nationId].economy;

  if (!eco.tax_rates_by_class) {
    applyDelta(`nations.${nationId}.economy.tax_rates_by_class`, {});
  }

  for (const [group, rate] of Object.entries(_tpPreview)) {
    const current = eco.tax_rates_by_class?.[group];
    if (current !== rate) {
      applyDelta(`nations.${nationId}.economy.tax_rates_by_class.${group}`, rate);
    }
  }

  if (_tpExpLevels) {
    if (!eco.expense_levels) {
      applyDelta(`nations.${nationId}.economy.expense_levels`, {});
    }
    for (const [cat, level] of Object.entries(_tpExpLevels)) {
      const current = eco.expense_levels?.[cat];
      if (current !== level) {
        applyDelta(`nations.${nationId}.economy.expense_levels.${cat}`, level);
      }
    }
  }

  // Записываем событие реформы для графика
  const turnNow = GAME_STATE.turn || 0;
  const ecoRef  = GAME_STATE.nations[nationId].economy;
  if (!Array.isArray(ecoRef._reform_events)) ecoRef._reform_events = [];
  ecoRef._reform_events.push({ turn: turnNow });
  if (ecoRef._reform_events.length > 24) ecoRef._reform_events.shift();

  _tpDirty = false;
  _tpRender();
}

// ─────────────────────────────────────────────────────────────
// РЕНДЕРИНГ
// ─────────────────────────────────────────────────────────────

// Один слайдер налоговой группы
function _tpSlider(group) {
  const rate    = _tpPreview[group] ?? 0.10;
  const pct     = parseFloat((rate * 100).toFixed(1));
  const income  = _tpIncomeFor(group, rate);
  const color   = _tpRateColor(rate);
  const penalty = _tpPenalty(rate);
  const { name, icon } = _TP_GROUPS[group];

  const nation  = GAME_STATE.nations[GAME_STATE.player_nation];
  const actual  = nation.economy.tax_rates_by_class?.[group] ?? rate;
  const changed = Math.abs(rate - actual) > 0.004;
  const delta   = income - _tpIncomeFor(group, actual);

  // Позиция ручки на градиентной дорожке [0–30%]
  const pos = Math.round(pct / 30 * 100);

  const penaltyHtml = penalty < 0
    ? `<div class="tp-penalty">⚠ Недовольство класса: ${penalty} к удовлетворённости</div>`
    : '';

  const deltaHtml = changed
    ? `<span class="tp-delta" style="color:${delta >= 0 ? 'var(--positive)' : 'var(--negative)'}">
         ${delta >= 0 ? '+' : ''}${delta.toLocaleString()}
       </span>`
    : '';

  return `
    <div class="tp-tax-row">
      <div class="tp-tax-head">
        <span class="tp-tax-name">${icon} ${name}</span>
        <div class="tp-tax-right">
          ${deltaHtml}
          <span class="tp-tax-income" style="color:${color}">${income.toLocaleString()} ₴</span>
        </div>
      </div>
      <div class="tp-slider-wrap">
        <div class="tp-slider-track">
          <input type="range" class="tp-slider"
            min="0" max="30" step="0.5" value="${pct}"
            style="--tp-pos:${pos}%; --tp-color:${color}"
            oninput="
              _tpOnSlider('${group}', this.value);
              var lbl = this.closest('.tp-slider-wrap').querySelector('.tp-pct');
              if (lbl) { lbl.textContent = parseFloat(this.value).toFixed(1)+'%'; lbl.style.color = _tpRateColor(this.value/100); }
              this.style.setProperty('--tp-pos', this.value/30*100+'%');
              this.style.setProperty('--tp-color', _tpRateColor(this.value/100));
            "
          />
        </div>
        <span class="tp-pct" style="color:${color}">${pct}%</span>
      </div>
      ${penaltyHtml}
    </div>`;
}

// Колонка доходов (перерисовывается при движении слайдера)
function _tpRenderIncome() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const inc    = nation.economy._income_breakdown || {};
  const taxTotal     = _tpTaxTotal();
  const portDuties     = inc.port_duties     || 0;
  const tradeProfit    = inc.trade_profit    || 0;
  const buildingProfit      = inc.building_profit      || 0;
  const stateBuildingCount  = inc.state_building_count || 0;
  const totalPreview   = taxTotal + portDuties + tradeProfit + buildingProfit;

  return `
    <div class="tp-col-title">📈 ДОХОДЫ</div>

    <div class="tp-subsection">
      <div class="tp-sub-label">Налоги &mdash; ${taxTotal.toLocaleString()} ₴</div>
      ${Object.keys(_TP_GROUPS).map(g => _tpSlider(g)).join('')}
    </div>

    <div class="tp-divider"></div>

    <div class="tp-row-item">
      <span class="tp-item-label">🚢 Торговля</span>
      <span class="tp-item-value">${tradeProfit.toLocaleString()} ₴</span>
    </div>
    <div class="tp-row-item">
      <span class="tp-item-label">⚓ Портовые пошлины</span>
      <span class="tp-item-value">${portDuties.toLocaleString()} ₴</span>
    </div>
    ${stateBuildingCount > 0 ? `
    <div class="tp-row-item">
      <span class="tp-item-label">🏛 Гос. здания</span>
      <span class="tp-item-value${buildingProfit <= 0 ? ' tp-val-neg' : ''}">${buildingProfit > 0 ? '+' : ''}${buildingProfit.toLocaleString()} ₴</span>
    </div>` : ''}

    <div class="tp-row-total">
      <span class="tp-item-label">Итого доходов</span>
      <span class="tp-item-value tp-val-pos">${totalPreview.toLocaleString()} ₴</span>
    </div>`;
}

// ── Цвет уровня расходов ─────────────────────────────────────
function _tpLevelColor(level) {
  if (level < 0.75) return 'var(--negative)';
  if (level > 1.25) return 'var(--warning)';
  return 'var(--positive)';
}

// ── Слайдер категории расходов ────────────────────────────────
function _tpExpSliderRow(category, icon, name, effectsFn) {
  const nation   = GAME_STATE.nations[GAME_STATE.player_nation];
  const exp      = nation.economy._expense_breakdown || {};
  const mil      = nation.military;
  const gov      = nation.government;
  const prof     = nation.population.by_profession || {};
  const B        = CONFIG?.BALANCE || {};

  const level    = _tpExpLevels?.[category] ?? 1.0;
  const pct      = Math.round(level * 100);
  const color    = _tpLevelColor(level);

  // База расходов: берём из breakdown или вычисляем из сырых данных
  let baseCost;
  if (category === 'army') {
    const base = exp.army_base
      ?? ((mil.infantry || 0) * (B.INFANTRY_UPKEEP || 2)
        + (mil.cavalry  || 0) * (B.CAVALRY_UPKEEP  || 5)
        + (mil.mercenaries || 0) * (B.MERCENARY_UPKEEP || 4));
    baseCost = base;
  } else if (category === 'navy') {
    baseCost = exp.navy_base ?? (mil.ships || 0) * (B.SHIP_UPKEEP || 10);
  } else if (category === 'court') {
    const aliveChars = (nation.characters || []).filter(c => c.alive !== false);
    baseCost = exp.court_base
      ?? (aliveChars.length * 15 + aliveChars.filter(c => c.role === 'advisor').length * 50);
  } else if (category === 'stability') {
    const stab = gov?.stability ?? 50;
    baseCost = exp.stability_base ?? Math.round(200 * (1 - stab / 100));
  } else if (category === 'fortresses') {
    baseCost = exp.fortresses_base ?? exp.fortresses ?? 0;
  } else if (category === 'buildings') {
    baseCost = exp.buildings_base ?? (nation.economy._building_maintenance_per_turn || 0);
  } else if (category === 'slaves') {
    baseCost = exp.slaves_base ?? (prof.slaves || 0) * (B.SLAVE_UPKEEP || 1);
  } else {
    baseCost = 0;
  }

  const effCost  = Math.round(baseCost * level);
  const baseMark = level !== 1.0
    ? `<span class="tp-delta" style="color:${color}">(база: ${baseCost.toLocaleString()})</span>`
    : '';

  // Позиция ручки: slider 50..150, нейтраль 100 → pos = (pct-50)/100*100
  const pos = Math.round((pct - 50));
  const effectText = effectsFn(level);

  return `
    <div class="tp-tax-row">
      <div class="tp-tax-head">
        <span class="tp-tax-name">${icon} ${name}</span>
        <div class="tp-tax-right">
          ${baseMark}
          <span class="tp-tax-income" style="color:${color}">${effCost.toLocaleString()} ₴</span>
        </div>
      </div>
      <div class="tp-slider-wrap">
        <div class="tp-slider-track">
          <input type="range" class="tp-slider tp-exp-slider"
            min="50" max="150" step="5" value="${pct}"
            style="--tp-pos:${pos}%; --tp-color:${color}"
            oninput="
              _tpOnExpSlider('${category}', this.value);
              var lbl = this.closest('.tp-slider-wrap').querySelector('.tp-pct');
              var lvl = this.value / 100;
              var clr = lvl < 0.75 ? 'var(--negative)' : lvl > 1.25 ? 'var(--warning)' : 'var(--positive)';
              if (lbl) { lbl.textContent = this.value + '%'; lbl.style.color = clr; }
              this.style.setProperty('--tp-pos', (this.value - 50) + '%');
              this.style.setProperty('--tp-color', clr);
            "
          />
        </div>
        <span class="tp-pct" style="color:${color}">${pct}%</span>
      </div>
      ${effectText ? `<div class="tp-penalty">${effectText}</div>` : ''}
    </div>`;
}

// Колонка расходов с интерактивными слайдерами
function _tpRenderExpenses() {
  const exp  = GAME_STATE.nations[GAME_STATE.player_nation].economy._expense_breakdown || {};
  const lvls = _tpExpLevels ?? {};

  // Вычисляем эффективные расходы из preview-уровней и базовых значений
  function effOf(cat, base) { return Math.round(base * (lvls[cat] ?? 1.0)); }

  const armyBase   = exp.army_base     ?? (exp.army_infantry ?? 0) + (exp.army_cavalry ?? 0) + (exp.army_mercenaries ?? 0);
  const navyBase   = exp.navy_base     ?? (exp.navy      ?? 0);
  const courtBase  = exp.court_base    ?? (exp.court     ?? 0) + (exp.advisors  ?? 0);
  const stabilBase = exp.stability_base ?? (exp.stability ?? 0);
  const fortBase   = exp.fortresses_base ?? (exp.fortresses ?? 0);
  const bldBase    = exp.buildings_base  ?? (exp.buildings  ?? 0);
  const slavBase   = exp.slaves_base     ?? (exp.slaves     ?? 0);

  const totalAll = effOf('army', armyBase) + effOf('navy', navyBase)
    + effOf('court', courtBase) + effOf('stability', stabilBase)
    + effOf('fortresses', fortBase) + effOf('buildings', bldBase)
    + effOf('slaves', slavBase);

  const sign = v => v >= 0 ? '+' : '';

  const armySlider = _tpExpSliderRow('army', '⚔️', 'Армия', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    const m = parseFloat(((lvl - 1.0) * 15).toFixed(1));
    const l = parseFloat(((lvl - 1.0) *  8).toFixed(1));
    return `${m >= 0 ? '✓' : '⚠'} Боевой дух: ${sign(m)}${m}/ход, Лояльность: ${sign(l)}${l}/ход`;
  });

  const navySlider = _tpExpSliderRow('navy', '⛵', 'Флот', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    return `${lvl >= 1.0 ? '✓' : '⚠'} Торговые доходы ×${lvl.toFixed(2)}`;
  });

  const courtSlider = _tpExpSliderRow('court', '🏰', 'Двор и советники', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    const d = parseFloat(((lvl - 1.0) * 2).toFixed(1));
    return `${d >= 0 ? '✓' : '⚠'} Легитимность: ${sign(d)}${d}/ход`;
  });

  const stabilSlider = _tpExpSliderRow('stability', '⚖️', 'Порядок и стабильность', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    return `${lvl >= 1.0 ? '✓' : '⚠'} Восстановление стабильности ×${lvl.toFixed(2)}/ход`;
  });

  const fortSlider = _tpExpSliderRow('fortresses', '🏯', 'Крепости', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    const d = parseFloat(((lvl - 1.0) * 2.0).toFixed(1));
    return `${d >= 0 ? '✓' : '⚠'} Оборонный потенциал ×${lvl.toFixed(2)}, Стабильность: ${sign(d)}${d}/ход`;
  });

  const bldSlider = _tpExpSliderRow('buildings', '🏛', 'Здания', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    return `${lvl >= 1.0 ? '✓' : '⚠'} Портовые пошлины ×${lvl.toFixed(2)}`;
  });

  const slaveSlider = _tpExpSliderRow('slaves', '⛓', 'Рабы', (lvl) => {
    if (Math.abs(lvl - 1.0) < 0.01) return '';
    const h = parseFloat(((lvl - 1.0) * 8).toFixed(1));
    return `${h >= 0 ? '✓' : '⚠'} Счастье населения: ${sign(h)}${h}/ход`;
  });

  return `
    <div class="tp-col-title">📉 РАСХОДЫ</div>

    <div class="tp-subsection">
      <div class="tp-sub-label">Армия и флот</div>
      ${armySlider}
      ${navySlider}
    </div>

    <div class="tp-divider"></div>

    <div class="tp-subsection">
      <div class="tp-sub-label">Управление</div>
      ${courtSlider}
      ${stabilSlider}
    </div>

    <div class="tp-divider"></div>

    <div class="tp-subsection">
      <div class="tp-sub-label">Инфраструктура</div>
      ${fortSlider}
      ${bldSlider}
      ${slaveSlider}
    </div>

    <div class="tp-row-total">
      <span class="tp-item-label">Итого расходов</span>
      <span class="tp-item-value tp-val-neg">${totalAll.toLocaleString()} ₴</span>
    </div>`;
}

// ── График динамики баланса ───────────────────────────────────
function _tpRenderChart() {
  const eco     = GAME_STATE.nations[GAME_STATE.player_nation]?.economy || {};
  const history = eco._balance_history || [];
  if (history.length < 2) {
    return `<div class="tp-chart-empty">Накопите минимум 2 хода для отображения графика</div>`;
  }

  const W = 780, H = 70, padX = 12, padY = 6;
  const nets   = history.map(h => h.net);
  const maxVal = Math.max(...nets, 1);
  const minVal = Math.min(...nets, -1);
  const range  = maxVal - minVal;

  const toX = i  => padX + (i / (history.length - 1)) * (W - 2 * padX);
  const toY = v  => padY + (1 - (v - minVal) / range) * (H - 2 * padY);
  const zeroY = toY(0);

  const pts    = history.map((h, i) => `${toX(i).toFixed(1)},${toY(h.net).toFixed(1)}`);
  const lineD  = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ');
  const lastX  = toX(history.length - 1).toFixed(1);
  const firstX = toX(0).toFixed(1);
  const areaD  = `${lineD} L ${lastX},${zeroY.toFixed(1)} L ${firstX},${zeroY.toFixed(1)} Z`;

  // Вертикальные линии реформ
  const reforms    = eco._reform_events || [];
  const minTurn    = history[0].turn;
  const maxTurn    = history[history.length - 1].turn;
  const reformSvg  = reforms
    .filter(r => r.turn >= minTurn && r.turn <= maxTurn)
    .map(r => {
      const idx = history.findIndex(h => h.turn >= r.turn);
      if (idx < 0) return '';
      const rx = toX(idx).toFixed(1);
      return `<line x1="${rx}" y1="${padY}" x2="${rx}" y2="${H - padY}"
        stroke="rgba(212,168,83,0.65)" stroke-width="1" stroke-dasharray="3,2"/>
        <text x="${rx}" y="${padY + 8}" text-anchor="middle"
          font-size="7" fill="rgba(212,168,83,0.85)">✦</text>`;
    }).join('');

  const lastNet  = nets[nets.length - 1];
  const lastNY   = toY(lastNet).toFixed(1);
  const dotColor = lastNet >= 0 ? '#d4a853' : '#f44336';

  return `
    <div class="tp-chart-label">📊 Динамика баланса
      ${reforms.length ? '<span class="tp-chart-legend-reform">✦ — реформа налогов</span>' : ''}
    </div>
    <svg class="tp-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <clipPath id="tpc-above"><rect x="0" y="0" width="${W}" height="${zeroY.toFixed(1)}"/></clipPath>
        <clipPath id="tpc-below"><rect x="0" y="${zeroY.toFixed(1)}" width="${W}" height="${H}"/></clipPath>
      </defs>
      <line x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${W - padX}" y2="${zeroY.toFixed(1)}"
        stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
      <path d="${areaD}" fill="rgba(76,175,80,0.22)" clip-path="url(#tpc-above)"/>
      <path d="${areaD}" fill="rgba(160,20,20,0.35)"  clip-path="url(#tpc-below)"/>
      <path d="${lineD}" fill="none" stroke="rgba(212,168,83,0.9)" stroke-width="1.5" stroke-linejoin="round"/>
      ${reformSvg}
      <circle cx="${lastX}" cy="${lastNY}" r="3" fill="${dotColor}"/>
    </svg>
    <div class="tp-chart-axis">
      <span>Ход ${minTurn}</span>
      <span class="tp-chart-zero-lbl">— 0 —</span>
      <span>Ход ${maxTurn}</span>
    </div>`;
}

// ── Текст советника ───────────────────────────────────────────
function _tpAdvisorText() {
  const nation  = GAME_STATE.nations[GAME_STATE.player_nation];
  const eco     = nation.economy;
  const mil     = nation.military;
  const gov     = nation.government;
  const exp     = eco._expense_breakdown || {};
  const totalExp = Math.max(exp.total || eco.expense_per_turn || 1, 1);
  // Используем breakdown.total — включает building_profit, soldier_salary и food_soldiers
  const balance  = (eco._income_breakdown?.total ?? eco.income_per_turn ?? 0)
                 - (eco._expense_breakdown?.total ?? eco.expense_per_turn ?? 0);
  const treasury = eco.treasury || 0;

  const lines = [];

  // Крупнейшая статья расходов
  const cats = {
    'Армию':        (exp.army_infantry || 0) + (exp.army_cavalry || 0) + (exp.army_mercenaries || 0),
    'Флот':         exp.navy        || 0,
    'Двор':         (exp.court || 0) + (exp.advisors || 0),
    'Стабильность': exp.stability   || 0,
    'Крепости':     exp.fortresses  || 0,
    'Здания':       exp.buildings   || 0,
    'Рабов':        exp.slaves      || 0,
  };
  const [topName, topVal] = Object.entries(cats).sort(([,a],[,b]) => b - a)[0];
  const topPct = Math.round(topVal / totalExp * 100);
  if (topPct >= 25) lines.push(`Расходы на ${topName} составляют <b>${topPct}%</b> бюджета — доминирующая статья.`);

  // Состояние казны
  if (balance < 0) {
    const turns = treasury > 0 ? Math.ceil(treasury / Math.abs(balance)) : 0;
    lines.push(`Дефицит <b>${Math.abs(balance).toLocaleString()} ₴/ход</b>.` +
      (turns > 0 ? ` Без изменений казна опустеет через <b>~${turns} ходов</b>.` : ' Казна уже пуста!'));
  } else {
    lines.push(`Профицит <b>${balance.toLocaleString()} ₴/ход</b> — казна пополняется.`);
  }

  // Высокие налоги
  const taxRates  = eco.tax_rates_by_class || {};
  const taxNames  = { aristocrats: 'знать', clergy: 'жречество', commoners: 'народ', soldiers: 'воинов' };
  const highTaxes = Object.entries(taxRates).filter(([,r]) => r > 0.22).map(([g]) => taxNames[g] || g);
  if (highTaxes.length) lines.push(`Налоги на ${highTaxes.join(', ')} превышают безопасный порог — возможны волнения.`);

  // Боевой дух
  if ((mil?.morale ?? 100) < 40) lines.push('Боевой дух армии критически низок. Повысьте финансирование или сократите войска.');

  // Легитимность
  if ((gov?.legitimacy ?? 100) < 30) lines.push('Легитимность власти под угрозой. Увеличьте содержание двора.');

  // Условия рабов
  if ((eco._slave_condition ?? 1.0) < 0.75) lines.push('Недофинансирование содержания рабов провоцирует социальное напряжение.');

  // Крепости
  if ((eco._fortress_defense_mult ?? 1.0) < 0.75) lines.push('Запущенные укрепления снижают безопасность границ и стабильность.');

  if (!lines.length) lines.push('Финансовое положение стабильно. Серьёзных угроз не обнаружено.');

  return lines.map(l => `<div class="tp-adv-line">▸ ${l}</div>`).join('');
}

// ── Переключение панели советника ────────────────────────────
function _tpToggleAdvisor() {
  const panel = document.getElementById('tp-advisor-panel');
  if (!panel) return;
  if (panel.classList.contains('tp-hidden')) {
    panel.innerHTML = _tpAdvisorText();
    panel.classList.remove('tp-hidden');
  } else {
    panel.classList.add('tp-hidden');
  }
}

// Главная функция — полная перерисовка
function _tpRender() {
  const el = document.getElementById('treasury-overlay');
  if (!el || el.classList.contains('hidden') || !_tpPreview) return;

  const nation   = GAME_STATE.nations[GAME_STATE.player_nation];
  const eco      = nation.economy;
  const exp      = eco._expense_breakdown || {};
  const inc      = eco._income_breakdown  || {};

  const taxTotal       = _tpTaxTotal();
  const portDuties     = inc.port_duties     || 0;
  const tradeProfit    = inc.trade_profit    || 0;
  const buildingProfit     = inc.building_profit      || 0;
  const stateBuildingCount = inc.state_building_count || 0;
  const totalInc       = taxTotal + portDuties + tradeProfit + buildingProfit;
  const totalExp    = exp.total || eco.expense_per_turn || 0;
  const balance     = totalInc - totalExp;
  const balColor    = balance >= 0 ? 'var(--positive)' : 'var(--negative)';
  const balSign     = balance >= 0 ? '+' : '';

  el.innerHTML = `
    <div class="tp-backdrop" onclick="hideTreasuryOverlay()"></div>
    <div class="tp-panel">

      <div class="tp-header">
        <span class="tp-title">💰 КАЗНА</span>
        <div class="tp-header-mid">
          <span class="tp-treasury-val">
            ${Math.round(eco.treasury).toLocaleString()} ₴ в хранилище
          </span>
          <span class="tp-balance-val ${balance >= 0 ? 'tp-bal-pos' : 'tp-bal-neg'}">
            ${balSign}${balance.toLocaleString()} ₴/ход
          </span>
        </div>
        <button class="tp-close" onclick="hideTreasuryOverlay()">✕</button>
      </div>

      <div class="tp-body">
        <div id="tp-income-col" class="tp-col tp-col-left">
          ${_tpRenderIncome()}
        </div>
        <div id="tp-expense-col" class="tp-col tp-col-right">
          ${_tpRenderExpenses()}
        </div>
      </div>

      <div class="tp-footer">
        <div class="tp-footer-top">
          <button class="tp-advisor-btn" onclick="_tpToggleAdvisor()">
            📜 Советник
          </button>
          <button id="tp-apply-btn" class="tp-apply-btn"
                  ${_tpDirty ? '' : 'disabled'}
                  onclick="applyTreasuryRates()">
            ✓ Применить изменения
          </button>
        </div>
        <div id="tp-advisor-panel" class="tp-advisor-panel tp-hidden"></div>
      </div>

      <div class="tp-chart-section">
        ${_tpRenderChart()}
      </div>

    </div>`;
}
