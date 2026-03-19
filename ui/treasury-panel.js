// ui/treasury-panel.js — Панель управления казной
// Показывает доходы/расходы, слайдеры налогов с предпросмотром.

// ── Состояние предпросмотра ───────────────────────────────────
let _tpPreview = null;   // { aristocrats, clergy, commoners, soldiers } — ставки 0..0.30
let _tpDirty   = false;  // Есть ли несохранённые изменения

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
  _tpDirty   = false;

  const el = document.getElementById('treasury-overlay');
  if (el) { el.classList.remove('hidden'); _tpRender(); }
}

// ── Закрыть панель ────────────────────────────────────────────
function hideTreasuryOverlay() {
  document.getElementById('treasury-overlay')?.classList.add('hidden');
  _tpPreview = null;
  _tpDirty   = false;
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

// ── Обработчик слайдера ───────────────────────────────────────
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

// ── Применить ставки к GAME_STATE ─────────────────────────────
function applyTreasuryRates() {
  if (!_tpPreview) return;
  const nationId = GAME_STATE.player_nation;
  const eco      = GAME_STATE.nations[nationId].economy;

  // Инициализировать объект, если он ещё не создан (страховка)
  if (!eco.tax_rates_by_class) {
    applyDelta(`nations.${nationId}.economy.tax_rates_by_class`, {});
  }

  // Записываем каждую изменённую ставку через applyDelta —
  // это гарантирует корректную дельта-цепочку и попадание
  // в следующий saveGame() (автоматически вызывается после хода)
  for (const [group, rate] of Object.entries(_tpPreview)) {
    const current = eco.tax_rates_by_class?.[group];
    if (current !== rate) {
      applyDelta(`nations.${nationId}.economy.tax_rates_by_class.${group}`, rate);
    }
  }

  _tpDirty = false;
  _tpRender(); // полная перерисовка — кнопка Apply уходит в неактивное состояние
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
  const portDuties   = inc.port_duties  || 0;
  const tradeProfit  = inc.trade_profit || 0;
  const totalPreview = taxTotal + portDuties + tradeProfit;

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

    <div class="tp-row-total">
      <span class="tp-item-label">Итого доходов</span>
      <span class="tp-item-value tp-val-pos">${totalPreview.toLocaleString()} ₴</span>
    </div>`;
}

// Колонка расходов
// Вычисляет расходы из _expense_breakdown (если заполнен движком),
// иначе — напрямую из сырых данных нации (при первом открытии до хода).
function _tpRenderExpenses() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const eco    = nation.economy;
  const exp    = eco._expense_breakdown || {};
  const mil    = nation.military;
  const gov    = nation.government;
  const prof   = nation.population.by_profession || {};
  const B      = CONFIG?.BALANCE || {};

  // Армия: берём из breakdown или вычисляем по тем же формулам что в updateTreasury
  const armyInf  = exp.army_infantry    ?? (mil.infantry    || 0) * (B.INFANTRY_UPKEEP  || 2);
  const armyCav  = exp.army_cavalry     ?? (mil.cavalry     || 0) * (B.CAVALRY_UPKEEP   || 5);
  const armyMerc = exp.army_mercenaries ?? (mil.mercenaries || 0) * (B.MERCENARY_UPKEEP || 4);
  const army     = armyInf + armyCav + armyMerc;

  // Флот
  const navy = exp.navy ?? (mil.ships || 0) * (B.SHIP_UPKEEP || 10);

  // Двор и советники
  const aliveChars = (nation.characters || []).filter(c => c.alive !== false);
  const court    = exp.court    ?? aliveChars.length * 15;
  const advisors = exp.advisors ?? aliveChars.filter(c => c.role === 'advisor').length * 50;

  // Стабильность: 200 × (1 − stability/100)
  const stab     = gov?.stability ?? 50;
  const stability = exp.stability ?? Math.round(200 * (1 - stab / 100));

  // Крепости: из breakdown (сложно пересчитать без зданий)
  const fortresses = exp.fortresses || 0;

  // Здания
  const buildings = exp.buildings ?? (eco._building_maintenance_per_turn || 0);

  // Рабы
  const slaves = exp.slaves ?? (prof.slaves || 0) * (B.SLAVE_UPKEEP || 1);

  const rows = [
    { label: '⚔️ Армия',        val: Math.round(army) },
    { label: '⛵ Флот',          val: Math.round(navy) },
    { label: '🏰 Двор',         val: Math.round(court) },
    { label: '⚖️ Стабильность', val: Math.round(stability) },
    { label: '📜 Советники',    val: Math.round(advisors) },
    { label: '🏯 Крепости',     val: Math.round(fortresses) },
    { label: '🏛 Здания',       val: Math.round(buildings) },
    { label: '⛓ Рабы',         val: Math.round(slaves) },
  ].filter(r => r.val > 0);

  const total = rows.reduce((s, r) => s + r.val, 0)
    || exp.total
    || (eco.expense_per_turn || 0);

  return `
    <div class="tp-col-title">📉 РАСХОДЫ</div>

    ${rows.map(r => `
      <div class="tp-row-item">
        <span class="tp-item-label">${r.label}</span>
        <span class="tp-item-value tp-val-neg">${r.val.toLocaleString()} ₴</span>
      </div>`).join('')}

    <div class="tp-row-total">
      <span class="tp-item-label">Итого расходов</span>
      <span class="tp-item-value tp-val-neg">${total.toLocaleString()} ₴</span>
    </div>`;
}

// Главная функция — полная перерисовка
function _tpRender() {
  const el = document.getElementById('treasury-overlay');
  if (!el || el.classList.contains('hidden') || !_tpPreview) return;

  const nation   = GAME_STATE.nations[GAME_STATE.player_nation];
  const eco      = nation.economy;
  const exp      = eco._expense_breakdown || {};
  const inc      = eco._income_breakdown  || {};

  const taxTotal    = _tpTaxTotal();
  const portDuties  = inc.port_duties  || 0;
  const tradeProfit = inc.trade_profit || 0;
  const totalInc    = taxTotal + portDuties + tradeProfit;
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
          <span class="tp-balance-val" style="color:${balColor}">
            Баланс: ${balSign}${balance.toLocaleString()}/ход
          </span>
        </div>
        <button class="tp-close" onclick="hideTreasuryOverlay()">✕</button>
      </div>

      <div class="tp-body">
        <div id="tp-income-col" class="tp-col tp-col-left">
          ${_tpRenderIncome()}
        </div>
        <div class="tp-col tp-col-right">
          ${_tpRenderExpenses()}
        </div>
      </div>

      <div class="tp-footer">
        <button id="tp-apply-btn" class="tp-apply-btn"
                ${_tpDirty ? '' : 'disabled'}
                onclick="applyTreasuryRates()">
          ✓ Применить изменения
        </button>
      </div>

    </div>`;
}
