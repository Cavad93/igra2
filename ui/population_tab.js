// Вкладка структуры населения
// Открывается через кнопку в левой панели

// ─────────────────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ─────────────────────────────────────────────────────────────────────────

function getHappinessColorClass(val) {
  if (val >= 75) return '#4CAF50';
  if (val >= 55) return '#FF9800';
  if (val >= 35) return '#f44336';
  return '#9C27B0';
}

function getSatisfactionIcon(pct) {
  if (pct >= 85) return '✓';
  if (pct >= 60) return '~';
  return '✗';
}

function getSatisfactionClass(pct) {
  if (pct >= 85) return 'pop-sat-good';
  if (pct >= 60) return 'pop-sat-mid';
  return 'pop-sat-bad';
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'М';
  if (n >= 1000)    return Math.round(n / 1000) + 'к';
  return String(Math.round(n));
}

// ─────────────────────────────────────────────────────────────────────────
// РЕНДЕР ПОТРЕБНОСТЕЙ КЛАССА
// ─────────────────────────────────────────────────────────────────────────

function renderClassNeeds(classId, classDef, classData, stockpile) {
  const classPop = classData.population;
  const rows = [];

  for (const [good, spec] of Object.entries(classDef.needs)) {
    const needed  = (classPop / 100) * spec.per_100;
    const avail   = stockpile[good] || 0;
    const ratio   = needed > 0 ? Math.min(1, avail / needed) : 1;
    const pct     = Math.round(ratio * 100);
    const goodDef = (typeof GOODS !== 'undefined' && GOODS[good]) || {};
    const icon    = goodDef.icon || '📦';
    const name    = spec.label || goodDef.name || good;

    const priorityLabel = {
      basic:    '<span class="pop-need-pri basic">Базовая</span>',
      standard: '<span class="pop-need-pri standard">Стандарт</span>',
      luxury:   '<span class="pop-need-pri luxury">Роскошь</span>',
    }[spec.priority] || '';

    rows.push(`
      <div class="pop-need-row ${getSatisfactionClass(pct)}">
        <span class="pop-need-icon">${icon}</span>
        <span class="pop-need-name">${name}</span>
        ${priorityLabel}
        <div class="pop-need-bar-wrap">
          <div class="pop-need-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="pop-need-pct ${getSatisfactionClass(pct)}">${getSatisfactionIcon(pct)} ${pct}%</span>
      </div>
    `);
  }

  return rows.join('');
}

// ─────────────────────────────────────────────────────────────────────────
// РЕНДЕР ПОЛИТИЧЕСКИХ ЭФФЕКТОВ КЛАССА
// ─────────────────────────────────────────────────────────────────────────

function renderClassEffects(classId, classDef, satisfaction) {
  const lines = [];
  const sat = satisfaction;

  if (sat < 40 && classDef.unhappy_effects) {
    for (const [key, val] of Object.entries(classDef.unhappy_effects)) {
      const label = {
        conspiracy_chance_mod: 'Шанс заговора',
        legitimacy_mod:        'Легитимность',
        tax_efficiency_mod:    'Эффективность налогов',
        production_mod:        'Производство',
        trade_income_mod:      'Торговый доход',
        military_loyalty_mod:  'Лояльность армии',
        military_morale_mod:   'Боевой дух',
        growth_rate_mod:       'Рост населения',
        rebellion_risk:        'Риск восстания',
        desertion_risk:        'Риск дезертирства',
        happiness_base_mod:    'Базовое счастье',
      }[key] || key;
      const sign = val > 0 ? '+' : '';
      const formatted = Number.isInteger(val) ? val : (val * 100).toFixed(0) + '%';
      lines.push(`<span class="pop-fx-bad">${label}: ${sign}${formatted}</span>`);
    }
  } else if (sat > 70 && classDef.happy_effects) {
    for (const [key, val] of Object.entries(classDef.happy_effects)) {
      const label = {
        conspiracy_chance_mod: 'Шанс заговора',
        legitimacy_mod:        'Легитимность',
        tax_efficiency_mod:    'Эффективность налогов',
        production_mod:        'Производство',
        trade_income_mod:      'Торговый доход',
        military_loyalty_mod:  'Лояльность армии',
        military_morale_mod:   'Боевой дух',
        growth_rate_mod:       'Рост населения',
        rebellion_risk:        'Риск восстания',
        desertion_risk:        'Риск дезертирства',
        happiness_base_mod:    'Базовое счастье',
      }[key] || key;
      const sign = val > 0 ? '+' : '';
      const formatted = Number.isInteger(val) ? val : (val * 100).toFixed(0) + '%';
      lines.push(`<span class="pop-fx-good">${label}: ${sign}${formatted}</span>`);
    }
  }

  if (lines.length === 0) return '';
  return `<div class="pop-fx-row">${lines.join(' ')}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// РЕНДЕР КАРТОЧКИ КЛАССА
// ─────────────────────────────────────────────────────────────────────────

function renderClassCard(classId, classDef, classData, stockpile, isExpanded) {
  const sat  = classData.satisfaction;
  const pop  = classData.population;
  const col  = classDef.color;

  const satColor = getHappinessColorClass(sat);
  const satLabel = sat >= 75 ? 'Довольны' : sat >= 55 ? 'Нейтральны' : sat >= 35 ? 'Недовольны' : 'Враждебны';

  const needsHtml  = isExpanded ? renderClassNeeds(classId, classDef, classData, stockpile) : '';
  const effectsHtml = isExpanded ? renderClassEffects(classId, classDef, classData.satisfaction) : '';

  return `
    <div class="pop-class-card ${isExpanded ? 'expanded' : ''}" data-class="${classId}">
      <div class="pop-class-header" onclick="togglePopClass('${classId}')">
        <span class="pop-class-icon" style="color:${col}">${classDef.icon}</span>
        <div class="pop-class-title-block">
          <span class="pop-class-name">${classDef.name}</span>
          <span class="pop-class-pop">${formatNum(pop)} чел.</span>
        </div>
        <div class="pop-class-sat-block">
          <div class="pop-class-sat-bar">
            <div class="pop-class-sat-fill" style="width:${sat}%; background:${satColor}"></div>
          </div>
          <span class="pop-class-sat-val" style="color:${satColor}">${sat}% · ${satLabel}</span>
        </div>
        <span class="pop-class-chevron">${isExpanded ? '▲' : '▼'}</span>
      </div>
      ${isExpanded ? `
        <div class="pop-class-desc">${classDef.description}</div>
        <div class="pop-class-sats-row">
          <span class="pop-sat-badge basic">Базовые: ${classData.basic_sat}%</span>
          <span class="pop-sat-badge standard">Стандарт: ${classData.standard_sat}%</span>
          <span class="pop-sat-badge luxury">Роскошь: ${classData.luxury_sat}%</span>
        </div>
        <div class="pop-needs-list">
          ${needsHtml}
        </div>
        ${effectsHtml}
      ` : ''}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// РЕНДЕР ДИАГРАММЫ КЛАССОВ (горизонтальный стек)
// ─────────────────────────────────────────────────────────────────────────

function renderPopPyramid(classSatisfaction) {
  const totalPop = Object.values(classSatisfaction).reduce((s, d) => s + d.population, 0);
  if (totalPop === 0) return '';

  const segments = Object.entries(classSatisfaction).map(([classId, data]) => {
    const classDef = SOCIAL_CLASSES[classId];
    const pct      = (data.population / totalPop * 100).toFixed(1);
    return `
      <div class="pop-pyramid-seg" style="width:${pct}%; background:${classDef.color};"
           title="${classDef.name}: ${formatNum(data.population)} (${pct}%)"></div>
    `;
  }).join('');

  const legend = Object.entries(classSatisfaction).map(([classId, data]) => {
    const classDef = SOCIAL_CLASSES[classId];
    const pct      = (data.population / totalPop * 100).toFixed(1);
    return `
      <div class="pop-legend-item">
        <span class="pop-legend-dot" style="background:${classDef.color}"></span>
        <span class="pop-legend-name">${classDef.icon} ${classDef.name}</span>
        <span class="pop-legend-count">${formatNum(data.population)}</span>
        <span class="pop-legend-pct">${pct}%</span>
      </div>
    `;
  }).join('');

  return `
    <div class="pop-pyramid">
      <div class="pop-pyramid-bar">${segments}</div>
    </div>
    <div class="pop-legend">${legend}</div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА ОВЕРЛЕЯ
// ─────────────────────────────────────────────────────────────────────────

let _popExpandedClass = null;

function renderPopulationOverlay() {
  const overlay = document.getElementById('population-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations[nationId];
  if (!nation) return;

  const pop      = nation.population;
  const stockpile = nation.economy.stockpile;

  // Считаем удовлетворённость (или берём кэш из state)
  let classSat = pop.class_satisfaction;
  if (!classSat && typeof calculateClassSatisfaction === 'function') {
    classSat = calculateClassSatisfaction(pop.by_profession, stockpile);
  }
  if (!classSat) {
    overlay.innerHTML = '<div class="pop-loading">Данные о классах недоступны</div>';
    return;
  }

  // Политические эффекты
  let politicalEffects = null;
  if (typeof calculatePoliticalEffects === 'function') {
    politicalEffects = calculatePoliticalEffects(classSat);
  }

  // Рендер карточек классов
  const cardsHtml = Object.entries(SOCIAL_CLASSES).map(([classId, classDef]) => {
    const data = classSat[classId];
    if (!data || data.population < 10) return '';
    const isExpanded = _popExpandedClass === classId;
    return renderClassCard(classId, classDef, data, stockpile, isExpanded);
  }).join('');

  // Политические эффекты суммарно
  let fxHtml = '';
  if (politicalEffects) {
    const fxLines = [];
    for (const [key, val] of Object.entries(politicalEffects)) {
      if (Math.abs(val) < 0.001) continue;
      const label = {
        conspiracy_chance_mod: 'Шанс заговора',
        legitimacy_mod:        'Легитимность',
        tax_efficiency_mod:    'Эффект. налогов',
        production_mod:        'Производство',
        trade_income_mod:      'Торговый доход',
        military_loyalty_mod:  'Лояльность армии',
        military_morale_mod:   'Боевой дух',
        growth_rate_mod:       'Рост нас-я',
        rebellion_risk:        'Риск восстания',
        desertion_risk:        'Дезертирство',
        happiness_base_mod:    'Базовое счастье',
      }[key] || key;
      const sign  = val > 0 ? '+' : '';
      const isGood = (key === 'production_mod' || key === 'trade_income_mod' ||
                      key === 'tax_efficiency_mod' || key === 'military_loyalty_mod' ||
                      key === 'military_morale_mod' || key === 'legitimacy_mod' ||
                      key === 'happiness_base_mod' || key === 'growth_rate_mod') ? val > 0 : val < 0;
      const cls   = isGood ? 'pop-fx-good' : 'pop-fx-bad';
      const pctVal = (Math.abs(val) < 1) ? (val * 100).toFixed(0) + '%' : val.toFixed(1);
      fxLines.push(`<span class="${cls}">${label}: ${sign}${pctVal}</span>`);
    }
    if (fxLines.length > 0) {
      fxHtml = `
        <div class="pop-section">
          <div class="pop-section-title">Суммарные эффекты на нацию</div>
          <div class="pop-effects-grid">${fxLines.join('')}</div>
        </div>
      `;
    }
  }

  overlay.innerHTML = `
    <div class="pop-overlay-inner">
      <div class="pop-header">
        <span class="pop-header-title">👥 Структура общества · ${nation.name}</span>
        <button class="pop-close-btn" onclick="hidePopulationOverlay()">✕</button>
      </div>

      <div class="pop-total-row">
        <span>Всего населения:</span>
        <span class="pop-total-val">${pop.total.toLocaleString()}</span>
        <span>Счастье:</span>
        <span class="pop-total-val" style="color:${getHappinessColorClass(pop.happiness)}">${pop.happiness}%</span>
      </div>

      ${renderPopPyramid(classSat)}

      ${fxHtml}

      <div class="pop-section">
        <div class="pop-section-title">Социальные классы</div>
        <div class="pop-classes-list">
          ${cardsHtml}
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// УПРАВЛЕНИЕ ОВЕРЛЕЕМ
// ─────────────────────────────────────────────────────────────────────────

function showPopulationOverlay() {
  const overlay = document.getElementById('population-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  renderPopulationOverlay();
}

function hidePopulationOverlay() {
  const overlay = document.getElementById('population-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
}

function togglePopClass(classId) {
  _popExpandedClass = (_popExpandedClass === classId) ? null : classId;
  renderPopulationOverlay();
}

// Вызываем перерисовку после каждого хода
function refreshPopulationTab() {
  const overlay = document.getElementById('population-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  renderPopulationOverlay();
}
