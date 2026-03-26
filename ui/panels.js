// Боковые панели — статистика нации и двор

// ──────────────────────────────────────────────────────────────
// ЛЕВАЯ ПАНЕЛЬ — статистика игрока
// ──────────────────────────────────────────────────────────────

function renderLeftPanel() {
  const panel = document.getElementById('left-panel');
  if (!panel || !GAME_STATE) return;

  const nationId = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const economy  = nation.economy;
  const military = nation.military;
  const pop      = nation.population;
  const gov      = nation.government;

  // _income_breakdown.total и _expense_breakdown.total — актуальные значения
  // из последнего хода или живого пересчёта; income_per_turn — запасной вариант
  const dispIncome  = Math.round(economy._income_breakdown?.total  ?? economy.income_per_turn  ?? 0);
  const dispExpense = Math.round(economy._expense_breakdown?.total ?? economy.expense_per_turn ?? 0);
  const delta = dispIncome - dispExpense;
  const deltaStr = delta >= 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;
  const deltaClass = delta >= 0 ? 'positive' : 'negative';

  const rulerName = gov.ruler?.name ?? gov.ruler ?? '?';
  const govTypeName = getGovernmentName(gov.type, gov.custom_name);

  panel.innerHTML = `
    <!-- ПРАВИТЕЛЬ -->
    <div class="panel-section ruler-section">
      <div class="ruler-name">⚔️ ${rulerName}</div>
      <div class="ruler-sub">${govTypeName} · ${nation.name}</div>
      <div class="legitimacy-bar">
        <span class="stat-label">Легитимность</span>
        <div class="bar-container">
          <div class="bar-fill legitimacy-fill" style="width:${gov.legitimacy ?? 0}%"></div>
        </div>
        <span class="stat-value">${(gov.legitimacy ?? 0).toFixed(1)}%</span>
      </div>
      <button class="gov-open-btn" onclick="showGovernmentOverlay()">
        🏛 Управление государством ▸
      </button>
      <button class="gov-open-btn" style="margin-top:4px" onclick="showPopulationOverlay()">
        👥 Структура общества ▸
      </button>
      <button class="gov-open-btn" id="eco-open-btn" style="margin-top:4px" onclick="showEconomyOverlay()">
        💹 Экономический обзор ▸
      </button>
      <button class="gov-open-btn" style="margin-top:4px" onclick="showTreasuryOverlay()">
        💰 Казна и налоги ▸
      </button>
    </div>

    <!-- КАЗНА -->
    <div class="panel-section">
      <div class="section-title">💰 Казна</div>
      <div class="stat-row">
        <span class="stat-label">Монет</span>
        <span class="stat-value gold">${Math.round(economy.treasury).toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Доход/ход</span>
        <span class="stat-value positive">+${dispIncome.toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Расход/ход</span>
        <span class="stat-value negative">-${dispExpense.toLocaleString()}</span>
      </div>
      <div class="stat-row total-row">
        <span class="stat-label">Баланс</span>
        <span class="stat-value ${deltaClass}">${deltaStr}</span>
      </div>
    </div>

    <!-- НАСЕЛЕНИЕ -->
    <div class="panel-section">
      <div class="section-title">👥 Население</div>
      ${renderPopMiniWidget(pop)}
    </div>

    <!-- АРМИЯ -->
    <div class="panel-section">
      <div class="section-title">⚔️ Армия</div>
      <div class="stat-row">
        <span class="stat-label">🗡 Пехота</span>
        <span class="stat-value">${military.infantry.toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">🐴 Кавалерия</span>
        <span class="stat-value">${military.cavalry.toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">⛵ Корабли</span>
        <span class="stat-value">${military.ships}</span>
      </div>
      ${military.mercenaries > 0 ? `
      <div class="stat-row">
        <span class="stat-label">🏴‍☠️ Наёмники</span>
        <span class="stat-value">${military.mercenaries.toLocaleString()}</span>
      </div>` : ''}
      <div class="morale-row">
        <span class="stat-label">Боевой дух</span>
        <div class="bar-container">
          <div class="bar-fill morale-fill" style="width:${military.morale}%"></div>
        </div>
        <span class="stat-value">${military.morale}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Лояльность</span>
        <div class="bar-container">
          <div class="bar-fill loyalty-fill" style="width:${military.loyalty}%"></div>
        </div>
        <span class="stat-value">${military.loyalty}%</span>
      </div>
    </div>

    <!-- КУЛЬТУРА -->
    <div class="panel-section">
      <div class="section-title">🎭 Культура</div>
      ${renderCulturePanel(nationId)}
      <button class="cw-btn-open" onclick="openCultureWindow('${nationId}')">📊 Подробнее о культурах</button>
    </div>

    <!-- РЕЛИГИЯ -->
    <div class="panel-section">
      <div class="section-title">⛪ Религия</div>
      ${typeof renderReligionPanel === 'function' ? renderReligionPanel(nationId) : '<div class="no-data">Нет данных</div>'}
      <button class="cw-btn-open" onclick="openReligionWindow('${nationId}')">⛪ Подробнее о религиях</button>
    </div>

    <!-- ДИПЛОМАТИЯ -->
    <div class="panel-section">
      <div class="section-title">🤝 Дипломатия</div>
      ${renderRelations(nation.relations)}
    </div>

    <!-- ЗАКОНЫ -->
    <div class="panel-section">
      <div class="section-title">📜 Законы <span class="laws-count">${(nation.active_laws || []).length}</span></div>
      ${renderLaws(nation.active_laws)}
    </div>
  `;
}

function renderPopMiniWidget(pop) {
  const total    = Math.round(pop.total);
  const hap      = pop.happiness;
  const hapColor = getHappinessColor(hap);
  const hapLabel = hap >= 75 ? '😊' : hap >= 55 ? '😐' : hap >= 35 ? '😟' : '😡';

  // Используем class_satisfaction если доступно, иначе считаем на лету
  let classSat = pop.class_satisfaction;
  if (!classSat && typeof calculateClassSatisfaction === 'function' && pop.by_profession) {
    const nationId  = GAME_STATE?.player_nation;
    const stockpile = GAME_STATE?.nations?.[nationId]?.economy?.stockpile || {};
    classSat = calculateClassSatisfaction(pop.by_profession, stockpile);
    pop.class_satisfaction = classSat; // кэшируем
  }

  if (classSat && typeof SOCIAL_CLASSES !== 'undefined') {
    const entries = Object.entries(classSat)
      .filter(([, d]) => d.population >= 10)
      .sort((a, b) => b[1].population - a[1].population);
    const totalClassPop = entries.reduce((s, [, d]) => s + d.population, 0);

    // Composition bar
    const barSegs = entries.map(([cid, d]) => {
      const cls = SOCIAL_CLASSES[cid];
      if (!cls) return '';
      const pct = totalClassPop > 0 ? (d.population / totalClassPop * 100).toFixed(1) : 0;
      return `<div class="pop-mini-seg" style="width:${pct}%;background:${cls.color}"
                   title="${cls.name}: ${formatNumber(d.population)}"></div>`;
    }).join('');

    // Class rows (top 6)
    const maxPop  = entries[0]?.[1].population || 1;
    const topRows = entries.slice(0, 6).map(([cid, d]) => {
      const cls     = SOCIAL_CLASSES[cid];
      if (!cls) return '';
      const barPct  = (d.population / maxPop * 100).toFixed(0);
      const isUnhap = d.satisfaction < 40;
      const unhapMark = isUnhap ? ' !' : '';
      return `
        <div class="pop-mini-row">
          <span class="pop-mini-dot" style="background:${cls.color}"></span>
          <span class="pop-mini-name${isUnhap ? ' unhappy' : ''}">${cls.name}${unhapMark}</span>
          <div class="pop-mini-wrap">
            <div class="pop-mini-fill" style="width:${barPct}%;background:${cls.color}"></div>
          </div>
          <span class="pop-mini-cnt">${formatNumber(d.population)}</span>
        </div>
      `;
    }).join('');

    const hiddenCount = entries.length - 6;
    const moreHtml = hiddenCount > 0
      ? `<div class="pop-mini-more">+${hiddenCount} класса</div>`
      : '';

    return `
      <div class="pop-mini-top">
        <span class="pop-mini-total">${total.toLocaleString()}</span>
        <span class="pop-mini-hap" style="color:${hapColor}">${hapLabel} ${hap}%</span>
      </div>
      <div class="pop-mini-bar">${barSegs}</div>
      <div class="pop-mini-classes">${topRows}${moreHtml}</div>
    `;
  }

  // Fallback: профессии
  const hRow = `
    <div class="happiness-row">
      <span class="stat-label">Счастье</span>
      <div class="bar-container">
        <div class="bar-fill happiness-fill" style="width:${hap}%;background:${hapColor}"></div>
      </div>
      <span class="stat-value">${hap}%</span>
    </div>`;
  return `
    <div class="stat-row">
      <span class="stat-label">Всего</span>
      <span class="stat-value">${total.toLocaleString()}</span>
    </div>
    ${hRow}
    <div class="professions-grid">${renderProfessions(pop.by_profession)}</div>
  `;
}

function renderProfessions(profs) {
  const profLabels = {
    farmers:   { icon: '🌾', name: 'Земледельцы' },
    craftsmen: { icon: '🔨', name: 'Ремесленники' },
    merchants: { icon: '⚖️', name: 'Торговцы' },
    sailors:   { icon: '⚓', name: 'Моряки' },
    clergy:    { icon: '🏛', name: 'Жрецы' },
    soldiers:  { icon: '🗡', name: 'Воины' },
    slaves:    { icon: '⛓', name: 'Рабы' },
  };

  return Object.entries(profs).map(([prof, count]) => {
    const info = profLabels[prof] || { icon: '👤', name: prof };
    return `
      <div class="prof-item" title="${info.name}">
        <span class="prof-icon">${info.icon}</span>
        <span class="prof-count">${formatNumber(count)}</span>
      </div>
    `;
  }).join('');
}

function renderCulturePanel(nationId) {
  try {
    // Определяем культуру нации напрямую из данных
    const nation = GAME_STATE.nations[nationId];
    if (!nation || !nation.regions || nation.regions.length === 0) {
      return '<div class="no-data">Нет данных о культуре</div>';
    }

    // Ищем основную культуру по регионам
    const regionCultures = GAME_STATE.region_cultures
      || (typeof REGION_CULTURES !== 'undefined' ? REGION_CULTURES : null);
    if (!regionCultures) return '<div class="no-data">Нет данных о культуре</div>';

    // Считаем какая культура в большинстве регионов
    const counts = {};
    for (const rid of nation.regions) {
      const rc = regionCultures[rid];
      if (rc) counts[rc.primary] = (counts[rc.primary] || 0) + 1;
    }
    let cultureId = null, bestCount = 0;
    for (const [cId, cnt] of Object.entries(counts)) {
      if (cnt > bestCount) { cultureId = cId; bestCount = cnt; }
    }
    if (!cultureId) return '<div class="no-data">Нет данных о культуре</div>';

    // Получаем данные культуры (из GAME_STATE или из статического CULTURES)
    const culture = (GAME_STATE.cultures && GAME_STATE.cultures[cultureId])
      || (typeof CULTURES !== 'undefined' ? CULTURES[cultureId] : null);
    if (!culture) return '<div class="no-data">Нет данных о культуре</div>';

    // Получаем справочник традиций
    const allTrad = typeof ALL_TRADITIONS !== 'undefined' ? ALL_TRADITIONS : {};

    const catIcons = {
      military: '⚔️', economic: '💰', social: '👥', religious: '🏛',
      naval: '⚓', arts: '🎭', diplomatic: '🤝', survival: '🛡',
    };

    const traditionsHtml = (culture.traditions || []).map(tId => {
      const t = allTrad[tId];
      if (!t) return `<div class="tradition-item"><span class="tradition-name">${tId}</span></div>`;
      const icon = catIcons[t.cat] || '📜';
      const isLocked = (culture.locked || []).includes(tId);
      const lockIcon = isLocked ? ' 🔒' : '';
      const bonusStr = Object.entries(t.bonus || {}).map(([k, v]) => {
        const sign = v > 0 ? '+' : '';
        const pct = Math.abs(v) < 1 ? `${sign}${(v * 100).toFixed(0)}%` : `${sign}${v}`;
        return `<span class="${v > 0 ? 'bonus-positive' : 'bonus-negative'}">${pct} ${formatBonusName(k)}</span>`;
      }).join(', ');

      return `
        <div class="tradition-item" title="${t.desc}">
          <span class="tradition-icon">${icon}</span>
          <span class="tradition-name">${t.name}${lockIcon}</span>
          <div class="tradition-bonus">${bonusStr}</div>
        </div>
      `;
    }).join('');

    const groupName = (typeof CULTURE_GROUPS !== 'undefined' && CULTURE_GROUPS[culture.group])
      ? CULTURE_GROUPS[culture.group].name : (culture.group || '');

    return `
      <div class="culture-name">${culture.name} <span class="culture-group">(${groupName})</span></div>
      <div class="traditions-list">${traditionsHtml}</div>
    `;
  } catch (e) {
    console.warn('[renderCulturePanel] Error:', e);
    return '<div class="no-data">Ошибка отображения культуры</div>';
  }
}

function renderReligionPanel(nationId) {
  try {
    if (typeof getNationReligionStats !== 'function') return '<div class="no-data">Религия не загружена</div>';
    const stats = getNationReligionStats(nationId);
    if (!stats || stats.religions.length === 0) return '<div class="no-data">Нет данных о религии</div>';

    const top3 = stats.religions.slice(0, 3);
    const html = top3.map(r => {
      const barWidth = Math.max(2, r.percentage);
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;">
          <span style="min-width:18px">${r.icon}</span>
          <span style="color:#e8dcc8;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</span>
          <span style="color:rgba(180,150,90,0.7);min-width:36px;text-align:right">${r.percentage.toFixed(0)}%</span>
        </div>
        <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.04);margin-bottom:6px;overflow:hidden">
          <div style="height:100%;width:${barWidth}%;background:${r.color};border-radius:2px"></div>
        </div>
      `;
    }).join('');

    const policy = GAME_STATE.religion_policy?.[nationId] || {};
    let policyStr = '';
    if (policy.patronage) {
      const def = typeof _getReligionDefForUI === 'function' ? _getReligionDefForUI(policy.patronage) : null;
      policyStr += `<div style="font-size:9px;color:rgba(180,150,90,0.5);margin-top:4px">🏛 Покровительство: ${def?.name || policy.patronage}</div>`;
    }
    if (policy.persecution) {
      const def = typeof _getReligionDefForUI === 'function' ? _getReligionDefForUI(policy.persecution) : null;
      policyStr += `<div style="font-size:9px;color:rgba(200,60,60,0.7);margin-top:2px">⚔ Гонения: ${def?.name || policy.persecution}</div>`;
    }

    return `<div style="margin-top:4px">${html}${policyStr}</div>`;
  } catch (e) {
    console.warn('[renderReligionPanel] Error:', e);
    return '<div class="no-data">Ошибка отображения религии</div>';
  }
}

function formatBonusName(key) {
  const names = {
    military_morale: 'морали', army_discipline: 'дисципл.', army_strength: 'атака',
    army_upkeep: 'содерж.', garrison_defense: 'гарнизон', army_speed: 'скорость',
    naval_strength: 'флот', naval_upkeep: 'содерж.флота', naval_morale: 'морали флота',
    trade_income: 'торговля', tax_income: 'налоги', food_production: 'еда',
    population_growth: 'рост', happiness: 'счастье', stability: 'стабильн.',
    building_cost: 'стр-во', diplomacy: 'диплом.', legitimacy: 'легитим.',
    assimilation_speed: 'ассимил.', production_bonus: 'произв.',
    cavalry_strength: 'конница', siege_strength: 'осада',
    army_manpower: 'числ.', loot_bonus: 'добыча', mercenary_cost: 'наёмники',
    army_loyalty: 'лояльн.', food_stockpile: 'запасы',
    army_strength_mountains: 'в горах', army_surprise: 'внезапн.',
    mercenary_quality: 'кач.наёмн.',
  };
  return names[key] || key;
}

// ── Окно «Культура» — Modern Antiquity Redesign ─────────────────────────────

let _cwState = { nationId: null, sort: 'culture', stats: null };

function openCultureWindow(nationId) {
  closeCultureWindow();
  _cwState.nationId = nationId;
  _cwState.sort = 'culture';
  _cwState.stats = getNationCultureStats(nationId);

  const overlay = document.createElement('div');
  overlay.className = 'culture-window-overlay';
  overlay.id = 'culture-window-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeCultureWindow(); };
  overlay.innerHTML = _buildCultureWindowHtml();
  document.body.appendChild(overlay);
  _cwBindEvents();
}

function closeCultureWindow() {
  const el = document.getElementById('culture-window-overlay');
  if (el) el.remove();
  _cwState.stats = null;
}

function _cwSetSort(mode) {
  _cwState.sort = mode;
  const overlay = document.getElementById('culture-window-overlay');
  if (!overlay) return;
  overlay.innerHTML = _buildCultureWindowHtml();
  _cwBindEvents();
}

function _cwHighlight(cultureId) {
  // Highlight legend item
  document.querySelectorAll('.cw-legend-item').forEach(el => {
    el.classList.toggle('cw-highlight', el.dataset.culture === cultureId);
  });
  // Pulse matching segments, dim others
  document.querySelectorAll('.cw-region-seg').forEach(el => {
    if (cultureId) {
      el.classList.toggle('cw-seg-pulse', el.dataset.culture === cultureId);
      el.classList.toggle('cw-seg-dim', el.dataset.culture !== cultureId);
    } else {
      el.classList.remove('cw-seg-pulse', 'cw-seg-dim');
    }
  });
  // Highlight SVG donut segments
  document.querySelectorAll('.cw-donut-seg').forEach(el => {
    if (cultureId) {
      el.style.opacity = el.dataset.culture === cultureId ? '1' : '0.3';
    } else {
      el.style.opacity = '1';
    }
  });
}

function _cwBindEvents() {
  // Legend hover → highlight
  document.querySelectorAll('.cw-legend-item').forEach(el => {
    el.addEventListener('mouseenter', () => _cwHighlight(el.dataset.culture));
    el.addEventListener('mouseleave', () => _cwHighlight(null));
  });
  // SVG donut hover → highlight
  document.querySelectorAll('.cw-donut-seg').forEach(el => {
    el.addEventListener('mouseenter', () => _cwHighlight(el.dataset.culture));
    el.addEventListener('mouseleave', () => _cwHighlight(null));
  });
  // Sort buttons
  document.querySelectorAll('.cw-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => _cwSetSort(btn.dataset.sort));
  });
}

function _buildCultureWindowHtml() {
  try {
    const stats = _cwState.stats;
    if (!stats) return '';
    const nation = GAME_STATE.nations[_cwState.nationId];
    const nationName = nation ? nation.name : _cwState.nationId;

    // ── SVG Donut chart ──
    const donutSvg = _buildDonutSvg(stats.cultures);

    // ── Legend ──
    const legendHtml = stats.cultures.map(c => `
      <div class="cw-legend-item" data-culture="${c.id}">
        <span class="cw-legend-dot" style="background:${c.color};color:${c.color}"></span>
        <span class="cw-legend-name">${c.name}</span>
        <span class="cw-legend-pct">${c.percentage.toFixed(1)}%</span>
        <span class="cw-legend-pop">${c.population.toLocaleString()}</span>
      </div>
    `).join('');

    // ── Traditions ──
    const traditionsHtml = _buildTraditionsHtml(stats.cultures);

    // ── Sort regions ──
    let sortedRegions = [...stats.byRegion];
    const primaryCulture = stats.cultures.length > 0 ? stats.cultures[0].id : null;
    switch (_cwState.sort) {
      case 'alpha':
        sortedRegions.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'population':
        sortedRegions.sort((a, b) => b.population - a.population);
        break;
      case 'culture':
      default:
        // Sort by % of dominant culture (descending)
        sortedRegions.sort((a, b) => {
          const aPct = a.segments.find(s => s.culture === primaryCulture)?.pct || 0;
          const bPct = b.segments.find(s => s.culture === primaryCulture)?.pct || 0;
          return bPct - aPct;
        });
        break;
    }

    // ── Region cards ──
    const regionCardsHtml = sortedRegions.slice(0, 30).map(r => {
      const segsHtml = r.segments.map(s => {
        const def = CULTURES[s.culture] || GAME_STATE.cultures?.[s.culture];
        const color = def ? def.color : '#888';
        return `<div class="cw-region-seg" data-culture="${s.culture}" style="width:${s.pct}%;background:${color}"></div>`;
      }).join('');

      const labelsHtml = r.segments.map(s => {
        const def = CULTURES[s.culture] || GAME_STATE.cultures?.[s.culture];
        const color = def ? def.color : '#888';
        const name = def ? def.name : s.culture;
        return `<span class="cw-region-culture-label">
          <span class="cw-region-culture-dot" style="background:${color}"></span>
          ${name} ${Math.round(s.pct)}%
        </span>`;
      }).join('');

      return `
        <div class="cw-region">
          <div class="cw-region-header">
            <span class="cw-region-name">${r.name}</span>
            <span class="cw-region-pop">${r.population.toLocaleString()}</span>
          </div>
          <div class="cw-region-bar">${segsHtml}</div>
          <div class="cw-region-cultures">${labelsHtml}</div>
        </div>
      `;
    }).join('');

    const sortBtns = ['culture', 'population', 'alpha'];
    const sortLabels = { culture: 'Культуре', population: 'Населению', alpha: 'Алфавиту' };
    const sortBarHtml = `
      <div class="cw-sort-bar">
        <span class="cw-sort-label">Сортировка:</span>
        ${sortBtns.map(s =>
          `<button class="cw-sort-btn${_cwState.sort === s ? ' active' : ''}" data-sort="${s}">${sortLabels[s]}</button>`
        ).join('')}
      </div>
    `;

    return `
      <div class="culture-window">
        <div class="cw-header">
          <div>
            <div class="cw-header-title">${nationName}</div>
            <div class="cw-header-sub">Культурный состав · ${stats.cultures.length} ${_cwPlural(stats.cultures.length, 'культура', 'культуры', 'культур')}</div>
          </div>
          <button class="cw-close" onclick="closeCultureWindow()">✕</button>
        </div>
        <div class="cw-body">
          <div class="cw-left">
            <div class="cw-donut-wrap">
              ${donutSvg}
            </div>
            <div class="cw-legend">${legendHtml}</div>
            ${traditionsHtml}
          </div>
          <div class="cw-right">
            ${sortBarHtml}
            ${regionCardsHtml}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    console.error('[renderCultureWindow] Error:', e);
    return `
      <div class="culture-window">
        <div class="cw-header">
          <div class="cw-header-title">Культуры</div>
          <button class="cw-close" onclick="closeCultureWindow()">✕</button>
        </div>
        <div class="cw-body" style="padding:20px">
          <div class="no-data">Ошибка: ${e.message}</div>
        </div>
      </div>
    `;
  }
}

function _buildDonutSvg(cultures) {
  const size = 160, cx = 80, cy = 80, outerR = 76, innerR = 40;
  let paths = '';
  let startAngle = -90; // start from top

  for (const c of cultures) {
    const sweep = (c.percentage / 100) * 360;
    if (sweep < 0.1) continue;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;

    const s1 = _polarToCart(cx, cy, outerR, startAngle);
    const e1 = _polarToCart(cx, cy, outerR, endAngle);
    const s2 = _polarToCart(cx, cy, innerR, endAngle);
    const e2 = _polarToCart(cx, cy, innerR, startAngle);

    paths += `<path class="cw-donut-seg" data-culture="${c.id}"
      d="M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${e1.x} ${e1.y}
         L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${e2.x} ${e2.y} Z"
      fill="${c.color}" />`;
    startAngle = endAngle;
  }

  const totalPop = cultures.reduce((s, c) => s + c.population, 0);
  const popStr = totalPop >= 1000000
    ? (totalPop / 1000000).toFixed(1) + 'M'
    : totalPop >= 1000
      ? Math.round(totalPop / 1000) + 'K'
      : totalPop.toLocaleString();

  return `
    <div class="cw-donut">
      <svg viewBox="0 0 ${size} ${size}" width="100%" height="100%">${paths}</svg>
      <div class="cw-donut-center">
        <span class="cw-donut-pop">${popStr}</span>
        <span class="cw-donut-label">Население</span>
      </div>
    </div>
  `;
}

function _polarToCart(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function _buildTraditionsHtml(cultures) {
  const cultureId = cultures.length > 0 ? cultures[0].id : null;
  if (!cultureId || cultureId === '_unknown') return '';

  const culture = (GAME_STATE.cultures && GAME_STATE.cultures[cultureId])
    || (typeof CULTURES !== 'undefined' ? CULTURES[cultureId] : null);
  if (!culture) return '';

  const allTrad = typeof ALL_TRADITIONS !== 'undefined' ? ALL_TRADITIONS : {};
  const catIcons = {
    military: '⚔️', economic: '💰', social: '👥', religious: '🏛',
    naval: '⚓', arts: '🎭', diplomatic: '🤝', survival: '🛡',
  };

  const items = (culture.traditions || []).map(tId => {
    const t = allTrad[tId];
    if (!t) return '';
    const icon = catIcons[t.cat] || '📜';
    const isLocked = (culture.locked || []).includes(tId);
    const lockIcon = isLocked ? ' 🔒' : '';
    const bonusStr = Object.entries(t.bonus || {}).map(([k, v]) => {
      const sign = v > 0 ? '+' : '';
      const pct = Math.abs(v) < 1 ? `${sign}${(v * 100).toFixed(0)}%` : `${sign}${v}`;
      return `<span class="${v > 0 ? 'bonus-positive' : 'bonus-negative'}">${pct} ${formatBonusName(k)}</span>`;
    }).join(', ');
    return `
      <div class="cw-tradition">
        <span class="cw-tradition-name">${icon} ${t.name}${lockIcon}</span>
        <div class="cw-tradition-bonus">${bonusStr}</div>
      </div>
    `;
  }).join('');

  if (!items) return '';
  return `
    <div class="cw-traditions-title">Традиции</div>
    <div class="cw-traditions">${items}</div>
  `;
}

function _cwPlural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

// ── Окно «Религия» — Modern Antiquity Design ────────────────────────────────

let _rwState = { nationId: null, sort: 'fervor', stats: null };

function openReligionWindow(nationId) {
  closeReligionWindow();
  _rwState.nationId = nationId;
  _rwState.sort = 'fervor';
  _rwState.stats = typeof getNationReligionStats === 'function'
    ? getNationReligionStats(nationId) : null;

  // Гарантируем инициализацию religion_policy
  _rwEnsurePolicy(nationId);

  const overlay = document.createElement('div');
  overlay.className = 'culture-window-overlay';
  overlay.id = 'religion-window-overlay';

  // Делегирование событий — один обработчик на overlay, не теряется при innerHTML
  overlay.addEventListener('click', _rwDelegatedClick);
  overlay.addEventListener('mouseover', _rwDelegatedHover);
  overlay.addEventListener('mouseout', _rwDelegatedHoverOut);

  overlay.innerHTML = _buildReligionWindowHtml();
  document.body.appendChild(overlay);
}

function _rwEnsurePolicy(nationId) {
  if (!GAME_STATE.religion_policy) GAME_STATE.religion_policy = {};
  if (!GAME_STATE.religion_policy[nationId]) {
    GAME_STATE.religion_policy[nationId] = { patronage: null, persecution: null };
  }
}

function closeReligionWindow() {
  const el = document.getElementById('religion-window-overlay');
  if (el) {
    el.removeEventListener('click', _rwDelegatedClick);
    el.removeEventListener('mouseover', _rwDelegatedHover);
    el.removeEventListener('mouseout', _rwDelegatedHoverOut);
    el.remove();
  }
  _rwState.stats = null;
}

function _rwRefresh() {
  _rwState.stats = typeof getNationReligionStats === 'function'
    ? getNationReligionStats(_rwState.nationId) : null;
  const overlay = document.getElementById('religion-window-overlay');
  if (overlay) overlay.innerHTML = _buildReligionWindowHtml();
}

// ── Делегирование кликов ─────────────────────────────────────────────────

function _rwDelegatedClick(e) {
  // Закрытие по клику на оверлей (фон)
  if (e.target === e.currentTarget) { closeReligionWindow(); return; }

  // Кнопка закрытия
  const closeBtn = e.target.closest('.cw-close');
  if (closeBtn) { closeReligionWindow(); return; }

  // Кнопки сортировки
  const sortBtn = e.target.closest('.rw-sort-btn');
  if (sortBtn) {
    _rwState.sort = sortBtn.dataset.sort;
    _rwRefresh();
    return;
  }

  // Кнопки политики (покровительство / гонения / очистка)
  const policyBtn = e.target.closest('[data-action]');
  if (policyBtn) {
    e.stopPropagation();
    const action = policyBtn.dataset.action;
    const relId = policyBtn.dataset.religion || null;
    const nationId = _rwState.nationId;

    _rwEnsurePolicy(nationId);
    const policy = GAME_STATE.religion_policy[nationId];

    try {
      if (action === 'patronage') {
        // Toggle: если уже покровительствуем этой же — отменяем
        const newVal = (policy.patronage === relId) ? null : relId;
        setReligionPatronage(nationId, newVal);
      } else if (action === 'persecute') {
        const newVal = (policy.persecution === relId) ? null : relId;
        setReligionPersecution(nationId, newVal);
      } else if (action === 'clear-patronage') {
        setReligionPatronage(nationId, null);
      } else if (action === 'clear-persecution') {
        setReligionPersecution(nationId, null);
      }
    } catch (err) {
      console.error('[Religion policy] Error:', err);
    }

    _rwRefresh();
    return;
  }
}

// ── Делегирование hover ──────────────────────────────────────────────────

function _rwDelegatedHover(e) {
  const legendItem = e.target.closest('.rw-legend-item');
  if (legendItem) { _rwHighlight(legendItem.dataset.religion); return; }

  const donutSeg = e.target.closest('.rw-donut-seg');
  if (donutSeg) { _rwHighlight(donutSeg.dataset.religion); return; }
}

function _rwDelegatedHoverOut(e) {
  const legendItem = e.target.closest('.rw-legend-item');
  const donutSeg = e.target.closest('.rw-donut-seg');
  if (legendItem || donutSeg) { _rwHighlight(null); }
}

function _rwHighlight(religionId) {
  document.querySelectorAll('.rw-legend-item').forEach(el => {
    el.classList.toggle('cw-highlight', el.dataset.religion === religionId);
  });
  document.querySelectorAll('.rw-region-seg').forEach(el => {
    if (religionId) {
      el.classList.toggle('cw-seg-pulse', el.dataset.religion === religionId);
      el.classList.toggle('cw-seg-dim', el.dataset.religion !== religionId);
    } else {
      el.classList.remove('cw-seg-pulse', 'cw-seg-dim');
    }
  });
  document.querySelectorAll('.rw-donut-seg').forEach(el => {
    if (religionId) {
      el.style.opacity = el.dataset.religion === religionId ? '1' : '0.3';
    } else {
      el.style.opacity = '1';
    }
  });
}

function _buildReligionWindowHtml() {
  try {
    const stats = _rwState.stats;
    if (!stats) return '';
    const nation = GAME_STATE.nations[_rwState.nationId];
    const nationName = nation ? nation.name : _rwState.nationId;
    const policy = GAME_STATE.religion_policy?.[_rwState.nationId] || {};

    // Donut SVG
    const donutSvg = _buildReligionDonut(stats.religions);

    // Legend
    const legendHtml = stats.religions.map(r => `
      <div class="rw-legend-item cw-legend-item" data-religion="${r.id}">
        <span class="cw-legend-dot" style="background:${r.color};color:${r.color}"></span>
        <span class="cw-legend-name">${r.icon} ${r.name}</span>
        <span class="cw-legend-pct">${r.percentage.toFixed(1)}%</span>
      </div>
    `).join('');

    // Policy panel
    const patronageRel = policy.patronage ? _getReligionDefForUI(policy.patronage) : null;
    const persecutionRel = policy.persecution ? _getReligionDefForUI(policy.persecution) : null;
    const isPlayer = _rwState.nationId === GAME_STATE.player_nation;

    let policyHtml = '';
    if (isPlayer) {
      policyHtml = `
        <div class="rw-policy-section">
          <div class="cw-traditions-title">Политика</div>
          <div class="rw-policy-row">
            <span class="rw-policy-label">Покровительство:</span>
            ${patronageRel
              ? `<span class="rw-policy-value">${patronageRel.icon} ${patronageRel.name} <button class="rw-policy-btn rw-policy-clear" data-action="clear-patronage">✕</button></span>`
              : '<span class="rw-policy-value rw-policy-none">нет</span>'}
          </div>
          <div class="rw-policy-row">
            <span class="rw-policy-label">Гонения:</span>
            ${persecutionRel
              ? `<span class="rw-policy-value rw-policy-danger">${persecutionRel.icon} ${persecutionRel.name} <button class="rw-policy-btn rw-policy-clear" data-action="clear-persecution">✕</button></span>`
              : '<span class="rw-policy-value rw-policy-none">нет</span>'}
          </div>
          <div class="rw-policy-actions">
            ${stats.religions.slice(0, 6).map(r => `
              <div class="rw-policy-action-row">
                <span style="color:${r.color}">${r.icon}</span>
                <span class="rw-policy-action-name">${r.name}</span>
                <button class="rw-policy-btn rw-policy-patron${policy.patronage === r.id ? ' active' : ''}" data-action="patronage" data-religion="${r.id}" title="Покровительство (${RELIGION_CONFIG.PATRONAGE_COST_PER_TURN} монет/ход)">🏛</button>
                <button class="rw-policy-btn rw-policy-persc${policy.persecution === r.id ? ' active' : ''}" data-action="persecute" data-religion="${r.id}" title="Гонения (-${RELIGION_CONFIG.PERSECUTION_HAPPINESS_COST} счастья/год)">⚔</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Sort regions
    let sortedRegions = [...stats.byRegion];
    switch (_rwState.sort) {
      case 'alpha':
        sortedRegions.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'population':
        sortedRegions.sort((a, b) => b.population - a.population);
        break;
      case 'fervor':
      default:
        // Sort by fervor of dominant religion
        sortedRegions.sort((a, b) => {
          const aMax = a.segments[0]?.fervor || 0;
          const bMax = b.segments[0]?.fervor || 0;
          return bMax - aMax;
        });
        break;
    }

    // Region cards
    const regionCardsHtml = sortedRegions.slice(0, 30).map(r => {
      const segsHtml = r.segments.map(s =>
        `<div class="rw-region-seg cw-region-seg" data-religion="${s.religion}" style="width:${s.pct}%;background:${s.color}"></div>`
      ).join('');

      const labelsHtml = r.segments.map(s =>
        `<span class="cw-region-culture-label">
          <span class="cw-region-culture-dot" style="background:${s.color}"></span>
          ${s.name} ${Math.round(s.pct)}%
        </span>`
      ).join('');

      const officialIcon = r.official ? (_getReligionDefForUI(r.official)?.icon || '') : '';

      return `
        <div class="cw-region">
          <div class="cw-region-header">
            <span class="cw-region-name">${officialIcon} ${r.name}</span>
            <span class="cw-region-pop">${r.population.toLocaleString()}</span>
          </div>
          <div class="cw-region-bar">${segsHtml}</div>
          <div class="cw-region-cultures">${labelsHtml}</div>
        </div>
      `;
    }).join('');

    const sortBtns = ['fervor', 'population', 'alpha'];
    const sortLabels = { fervor: 'Рвению', population: 'Населению', alpha: 'Алфавиту' };
    const sortBarHtml = `
      <div class="cw-sort-bar">
        <span class="cw-sort-label">Сортировка:</span>
        ${sortBtns.map(s =>
          `<button class="cw-sort-btn rw-sort-btn${_rwState.sort === s ? ' active' : ''}" data-sort="${s}">${sortLabels[s]}</button>`
        ).join('')}
      </div>
    `;

    // Dogma section — каноны и доктрины доминирующей религии
    const dogmaHtml = _buildDogmaHtml(stats);

    return `
      <div class="culture-window rw-window">
        <div class="cw-header">
          <div>
            <div class="cw-header-title">${nationName}</div>
            <div class="cw-header-sub">Религиозный состав · ${stats.religions.length} ${_cwPlural(stats.religions.length, 'религия', 'религии', 'религий')}</div>
          </div>
          <button class="cw-close">✕</button>
        </div>
        <div class="cw-body">
          <div class="cw-left">
            <div class="cw-donut-wrap">
              ${donutSvg}
            </div>
            <div class="cw-legend">${legendHtml}</div>
            ${policyHtml}
          </div>
          <div class="cw-right">
            ${dogmaHtml}
            ${sortBarHtml}
            ${regionCardsHtml}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    console.error('[renderReligionWindow] Error:', e);
    return `
      <div class="culture-window">
        <div class="cw-header">
          <div class="cw-header-title">Религия</div>
          <button class="cw-close">✕</button>
        </div>
        <div class="cw-body" style="padding:20px">
          <div class="no-data">Ошибка: ${e.message}</div>
        </div>
      </div>
    `;
  }
}

function _buildDogmaHtml(stats) {
  // Берём доминирующую религию нации
  const dominantRel = stats.religions[0];
  if (!dominantRel) return '';

  const dogmaInfo = typeof getDogmaInfoForUI === 'function'
    ? getDogmaInfoForUI(dominantRel.id) : null;
  if (!dogmaInfo) return '';

  const relDef = typeof _getReligionDefForUI === 'function'
    ? _getReligionDefForUI(dominantRel.id) : null;

  // ── Каноны ──
  const canonsHtml = dogmaInfo.canons.map(c => {
    const bonusEntries = Object.entries(c.bonus || {});
    const bonusHtml = bonusEntries.map(([k, v]) => {
      const sign = v > 0 ? '+' : '';
      const cls = v > 0 ? 'rw-bonus-pos' : 'rw-bonus-neg';
      const label = _dogmaBonusLabel(k);
      const display = _dogmaBonusFormat(k, v);
      return `<span class="${cls}" title="${label}">${sign}${display}</span>`;
    }).join(' ');

    return `
      <div class="rw-canon-card">
        <div class="rw-canon-header">
          <span class="rw-canon-cat">${c.categoryIcon} ${c.categoryName}</span>
          ${c.locked ? '<span class="rw-canon-lock" title="Заблокированный канон">🔒</span>' : ''}
        </div>
        <div class="rw-canon-name">${c.name}</div>
        <div class="rw-canon-desc">${c.desc}</div>
        <div class="rw-canon-bonus">${bonusHtml}</div>
      </div>
    `;
  }).join('');

  // ── Доктрины ──
  const doctrinesHtml = Object.entries(dogmaInfo.doctrines).map(([axisId, d]) => {
    const bonusEntries = Object.entries(d.bonus || {});
    const bonusHtml = bonusEntries.map(([k, v]) => {
      const sign = v > 0 ? '+' : '';
      const cls = v > 0 ? 'rw-bonus-pos' : 'rw-bonus-neg';
      const label = _dogmaBonusLabel(k);
      const display = _dogmaBonusFormat(k, v);
      return `<span class="${cls}" title="${label}">${sign}${display}</span>`;
    }).join(' ');

    return `
      <div class="rw-doctrine-row">
        <div class="rw-doctrine-header">
          <span class="rw-doctrine-icon">${d.icon}</span>
          <span class="rw-doctrine-name">${d.name}</span>
          <span class="rw-doctrine-level">${d.levelName}</span>
        </div>
        <div class="rw-doctrine-bar-wrap">
          <span class="rw-doctrine-edge">${d.low_icon} ${d.low_name}</span>
          <div class="rw-doctrine-bar">
            <div class="rw-doctrine-fill" style="width:${d.value}%"></div>
            <div class="rw-doctrine-marker" style="left:${d.value}%"></div>
          </div>
          <span class="rw-doctrine-edge">${d.high_name} ${d.high_icon}</span>
        </div>
        <div class="rw-doctrine-bonus">${bonusHtml || '<span class="rw-doctrine-neutral">нет эффекта</span>'}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="rw-dogma-section">
      <div class="cw-traditions-title">${dominantRel.icon} Догмы: ${dominantRel.name}</div>
      <div class="rw-canons-title">Каноны</div>
      <div class="rw-canons-grid">${canonsHtml}</div>
      <div class="rw-canons-title" style="margin-top:8px">Доктрины</div>
      ${doctrinesHtml}
    </div>
  `;
}

function _dogmaBonusLabel(key) {
  const labels = {
    stability: 'Стабильность', legitimacy: 'Легитимность', happiness: 'Счастье',
    military_morale: 'Мораль армии', army_strength: 'Сила армии',
    garrison_defense: 'Защита гарнизона', diplomacy: 'Дипломатия',
    trade_income: 'Доход торговли', food_production: 'Производство пищи',
    population_growth: 'Рост населения', assimilation_speed: 'Ассимиляция',
    naval_strength: 'Морская сила',
  };
  return labels[key] || key;
}

function _dogmaBonusFormat(key, val) {
  // Процентные бонусы
  const pctKeys = ['military_morale', 'army_strength', 'garrison_defense', 'trade_income',
    'food_production', 'assimilation_speed', 'naval_strength', 'stability'];
  if (pctKeys.includes(key)) return (val * 100).toFixed(0) + '%';
  if (key === 'population_growth') return (val * 1000).toFixed(1) + '‰';
  return val.toFixed(0);
}

function _buildReligionDonut(religions) {
  const size = 160, cx = 80, cy = 80, outerR = 76, innerR = 40;
  let paths = '';
  let startAngle = -90;
  const totalPct = religions.reduce((s, r) => s + r.percentage, 0) || 1;

  for (const r of religions) {
    const sweep = (r.percentage / totalPct) * 360;
    if (sweep < 0.1) continue;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;
    const s1 = _polarToCart(cx, cy, outerR, startAngle);
    const e1 = _polarToCart(cx, cy, outerR, endAngle);
    const s2 = _polarToCart(cx, cy, innerR, endAngle);
    const e2 = _polarToCart(cx, cy, innerR, startAngle);

    paths += `<path class="rw-donut-seg cw-donut-seg" data-religion="${r.id}"
      d="M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${e1.x} ${e1.y}
         L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${e2.x} ${e2.y} Z"
      fill="${r.color}" />`;
    startAngle = endAngle;
  }

  const mainIcon = religions.length > 0 ? religions[0].icon : '⛪';

  return `
    <div class="cw-donut">
      <svg viewBox="0 0 ${size} ${size}" width="100%" height="100%">${paths}</svg>
      <div class="cw-donut-center">
        <span class="cw-donut-pop" style="font-size:24px">${mainIcon}</span>
        <span class="cw-donut-label">Религия</span>
      </div>
    </div>
  `;
}

function _getReligionDefForUI(id) {
  if (typeof RELIGIONS !== 'undefined' && RELIGIONS[id]) return RELIGIONS[id];
  if (GAME_STATE.religions?.[id]) return GAME_STATE.religions[id];
  if (GAME_STATE.syncretic_religions?.[id]) return GAME_STATE.syncretic_religions[id];
  return null;
}

function renderRelations(relations) {
  const playerNationId = GAME_STATE.player_nation;
  const playerNation   = GAME_STATE.nations[playerNationId];

  // ── Собираем все нации и их данные ──────────────────────────
  // Источник 1: старая система (nation.relations)
  const legacyRels = relations ?? {};

  // Источник 2: новая система (DiplomacyEngine)
  const newTreaties = (typeof DiplomacyEngine !== 'undefined')
    ? DiplomacyEngine.getAllTreaties(playerNationId).filter(t => t.status === 'active')
    : [];

  // ── Договоры по типу: { typeKey → [{nationId, nationName, flag, icon, label}] } ──
  const byType = {};

  // Старые договоры ('trade' → 💼, 'alliance' → 🛡)
  const LEGACY_MAP = {
    trade:    { key: 'trade_agreement',    icon: '💼', label: 'Торговый договор' },
    alliance: { key: 'defensive_alliance', icon: '🛡', label: 'Союз'             },
  };
  for (const [nId, rel] of Object.entries(legacyRels)) {
    const nation = GAME_STATE.nations[nId];
    if (!nation) continue;
    for (const t of (rel.treaties ?? [])) {
      const m = LEGACY_MAP[t];
      if (!m) continue;
      if (!byType[m.key]) byType[m.key] = { icon: m.icon, label: m.label, nations: [] };
      if (!byType[m.key].nations.find(x => x.id === nId)) {
        byType[m.key].nations.push({ id: nId, name: nation.name, flag: nation.flag_emoji ?? '🏛' });
      }
    }
    if (rel.at_war) {
      if (!byType['_war']) byType['_war'] = { icon: '⚔', label: 'Война', nations: [], isWar: true };
      if (!byType['_war'].nations.find(x => x.id === nId)) {
        byType['_war'].nations.push({ id: nId, name: nation.name, flag: nation.flag_emoji ?? '🏛' });
      }
    }
  }

  // Новые договоры
  for (const t of newTreaties) {
    const otherId = t.parties.find(p => p !== playerNationId);
    if (!otherId) continue;
    const nation  = GAME_STATE.nations[otherId];
    if (!nation) continue;
    const def     = TREATY_TYPES?.[t.type] ?? { icon: '📜', label: t.type };
    if (!byType[t.type]) byType[t.type] = { icon: def.icon, label: def.label, nations: [] };
    if (!byType[t.type].nations.find(x => x.id === otherId)) {
      byType[t.type].nations.push({ id: otherId, name: nation.name, flag: nation.flag_emoji ?? '🏛' });
    }
  }

  // ── Секция «По договорам» ────────────────────────────────────
  const treatyGroupsHtml = Object.entries(byType).map(([typeKey, group]) => {
    const nationsList = group.nations.map(n =>
      `<button class="diplo-nation-chip ${group.isWar ? 'diplo-nation-chip--war' : ''}"
        onclick="showDiplomacyOverlay('${n.id}')"
        title="${n.name}">${n.flag} ${n.name}</button>`
    ).join('');
    return `<div class="diplo-type-row">
      <span class="diplo-type-icon">${group.icon}</span>
      <div class="diplo-type-body">
        <div class="diplo-type-name">${group.label}</div>
        <div class="diplo-type-nations">${nationsList}</div>
      </div>
    </div>`;
  }).join('');

  // ── Секция «Все отношения» ───────────────────────────────────
  const allNations = Object.entries(legacyRels).map(([nId, rel]) => {
    const nation = GAME_STATE.nations[nId];
    if (!nation) return null;
    return { nId, nation, score: rel.score ?? 0, atWar: !!rel.at_war,
             treaties: rel.treaties ?? [] };
  }).filter(Boolean);

  // Добавляем нации только из нового движка (если их нет в legacyRels)
  if (typeof DiplomacyEngine !== 'undefined') {
    const newNations = new Set(newTreaties.flatMap(t => t.parties).filter(p => p !== playerNationId));
    for (const nId of newNations) {
      if (!allNations.find(x => x.nId === nId) && GAME_STATE.nations[nId]) {
        allNations.push({ nId, nation: GAME_STATE.nations[nId],
          score: DiplomacyEngine.getRelationScore(playerNationId, nId),
          atWar: DiplomacyEngine.isAtWar?.(playerNationId, nId) ?? false,
          treaties: [] });
      }
    }
  }

  // Сортируем по убыванию отношений
  allNations.sort((a, b) => b.score - a.score);

  const relRowsHtml = allNations.slice(0, 10).map(({ nId, nation, score, atWar, treaties }) => {
    // Иконки договоров
    let treatyIcons = treaties.map(t => LEGACY_MAP[t]?.icon ?? '📜').join('');
    // Добавляем иконки из нового движка
    if (typeof DiplomacyEngine !== 'undefined') {
      const newTs = DiplomacyEngine.getActiveTreaties(playerNationId, nId);
      treatyIcons += newTs.map(t => TREATY_TYPES?.[t.type]?.icon ?? '📜').join('');
    }
    // Деdup иконок
    treatyIcons = [...new Set([...treatyIcons])].join('');

    const color  = score >= 30 ? '#4caf50' : score >= 5 ? '#8bc34a'
      : score >= -15 ? '#9e9e9e' : score >= -50 ? '#ff9800' : '#f44336';
    const barPct = Math.round((score + 100) / 2);
    const scoreStr = (score > 0 ? '+' : '') + score;
    const warBadge = atWar ? '<span class="diplo-war-dot">⚔</span>' : '';

    return `<div class="diplo-rel-row" onclick="showDiplomacyOverlay('${nId}')" title="Открыть переговоры">
      <div class="diplo-rel-left">
        <span class="diplo-rel-flag">${nation.flag_emoji ?? '🏛'}</span>
        <div class="diplo-rel-info">
          <span class="diplo-rel-name">${nation.name}</span>
          ${treatyIcons ? `<span class="diplo-rel-icons">${treatyIcons}</span>` : ''}
        </div>
      </div>
      <div class="diplo-rel-right">
        ${warBadge}
        <div class="diplo-rel-bar-wrap">
          <div class="diplo-rel-bar">
            <div class="diplo-rel-fill" style="width:${barPct}%;background:${color}"></div>
          </div>
          <span class="diplo-rel-score" style="color:${color}">${scoreStr}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  const hasTreaties = Object.keys(byType).length > 0;
  const hasNations  = allNations.length > 0;

  return `
    <button class="diplo-open-btn" onclick="showDiplomacyOverlay()">
      🤝 Зал переговоров ▸
    </button>

    ${hasTreaties ? `
      <div class="diplo-block-title">Действующие договоры</div>
      <div class="diplo-types-list">${treatyGroupsHtml}</div>
    ` : '<div class="diplo-no-treaties">Нет активных договоров</div>'}

    ${hasNations ? `
      <div class="diplo-block-title" style="margin-top:10px">Отношения</div>
      <div class="diplo-rels-list">${relRowsHtml}</div>
    ` : ''}
  `;
}

// ── Дипломатические действия ─────────────────────────────────────────

function proposeTreaty(targetNationId, treatyType) {
  const player = GAME_STATE.nations[GAME_STATE.player_nation];
  const target = GAME_STATE.nations[targetNationId];
  if (!player || !target) return;

  const rel = player.relations?.[targetNationId];
  if (!rel) return;

  // Шанс принятия зависит от отношений
  const baseChance = treatyType === 'trade' ? 0.5 : 0.3;
  const scoreMod = (rel.score + 50) / 100; // 0..1
  const chance = Math.min(0.95, baseChance + scoreMod * 0.4);

  const accepted = Math.random() < chance;
  const treatyName = treatyType === 'trade' ? 'торговый договор' : 'союз';

  if (accepted) {
    if (!rel.treaties.includes(treatyType)) rel.treaties.push(treatyType);
    // Взаимно
    _ensureRelation(target, GAME_STATE.player_nation);
    const targetRel = target.relations[GAME_STATE.player_nation];
    if (!targetRel.treaties.includes(treatyType)) targetRel.treaties.push(treatyType);
    // Улучшаем отношения
    rel.score = Math.min(100, rel.score + 15);
    targetRel.score = Math.min(100, targetRel.score + 15);
    addEventLog(`${target.name} приняли предложение: ${treatyName}!`, 'good');
  } else {
    rel.score = Math.max(-100, rel.score - 5);
    addEventLog(`${target.name} отклонили предложение: ${treatyName}.`, 'warning');
  }
  renderAll();
}

function proposePeace(targetNationId) {
  const player = GAME_STATE.nations[GAME_STATE.player_nation];
  const target = GAME_STATE.nations[targetNationId];
  if (!player || !target) return;

  const rel = player.relations?.[targetNationId];
  if (!rel || !rel.at_war) return;

  // Мир принимается если у противника мало армии или низкая мораль
  const theirMorale = target.military?.morale ?? 50;
  const chance = theirMorale < 30 ? 0.8 : theirMorale < 50 ? 0.5 : 0.25;
  const accepted = Math.random() < chance;

  if (accepted) {
    rel.at_war = false;
    rel.score = Math.min(100, rel.score + 20);
    _ensureRelation(target, GAME_STATE.player_nation);
    target.relations[GAME_STATE.player_nation].at_war = false;
    target.relations[GAME_STATE.player_nation].score =
      Math.min(100, (target.relations[GAME_STATE.player_nation].score ?? 0) + 20);
    // Убираем из at_war_with
    player.military.at_war_with = (player.military.at_war_with || []).filter(id => id !== targetNationId);
    target.military.at_war_with = (target.military.at_war_with || []).filter(id => id !== GAME_STATE.player_nation);
    addEventLog(`Мир с ${target.name}! Война окончена.`, 'good');
  } else {
    addEventLog(`${target.name} отвергли предложение о мире.`, 'warning');
  }
  renderAll();
}

function declareWar(targetNationId) {
  const player = GAME_STATE.nations[GAME_STATE.player_nation];
  const target = GAME_STATE.nations[targetNationId];
  if (!player || !target) return;

  // Проверка пакта о ненападении
  const hasPact = _checkNonAggressionPact(GAME_STATE.player_nation, targetNationId);
  if (hasPact) {
    const confirmed = confirm(
      `⚠️ У вас действует Пакт о ненападении с ${target.name}!\n\n` +
      `Объявление войны нарушит договор. Последствия:\n` +
      `  • Репутация −30 (со всеми нациями, кто узнает)\n` +
      `  • Стабильность −10\n` +
      `  • Пакт расторгнут\n\n` +
      `Продолжить?`
    );
    if (!confirmed) return;

    // Разрыв пакта с штрафами
    _breachNonAggressionPact(GAME_STATE.player_nation, targetNationId, player, target);
  }

  _ensureRelation(player, targetNationId);
  _ensureRelation(target, GAME_STATE.player_nation);

  player.relations[targetNationId].at_war = true;
  player.relations[targetNationId].score = Math.max(-100, player.relations[targetNationId].score - 40);
  target.relations[GAME_STATE.player_nation].at_war = true;
  target.relations[GAME_STATE.player_nation].score = Math.max(-100, target.relations[GAME_STATE.player_nation].score - 40);

  // Синхронизация с DiplomacyEngine
  if (typeof DiplomacyEngine !== 'undefined') {
    DiplomacyEngine.getRelation(GAME_STATE.player_nation, targetNationId).war = true;
  }

  if (!player.military.at_war_with) player.military.at_war_with = [];
  if (!player.military.at_war_with.includes(targetNationId)) player.military.at_war_with.push(targetNationId);
  if (!target.military.at_war_with) target.military.at_war_with = [];
  if (!target.military.at_war_with.includes(GAME_STATE.player_nation)) target.military.at_war_with.push(GAME_STATE.player_nation);

  addEventLog(`⚔️ Объявлена война ${target.name}!`, 'danger');
  // Падение стабильности и счастья
  player.government.stability = Math.max(0, (player.government.stability ?? 50) - 5);
  player.population.happiness = Math.max(0, (player.population.happiness ?? 50) - 10);

  // Оборонные союзы: союзники цели автоматически вступают в войну против игрока
  if (typeof triggerDefensiveAlliances === 'function') {
    triggerDefensiveAlliances(GAME_STATE.player_nation, targetNationId);
  }

  renderAll();
}

/** Проверяет наличие активного пакта о ненападении через DiplomacyEngine */
function _checkNonAggressionPact(nationA, nationB) {
  if (typeof DiplomacyEngine === 'undefined') return false;
  const rel = DiplomacyEngine.getRelation(nationA, nationB);
  return rel?.flags?.no_attack === true;
}

/** Расторгает пакт о ненападении с репутационными штрафами */
function _breachNonAggressionPact(breakerNationId, targetNationId, breakerNation, targetNation) {
  // Находим и аннулируем договор
  const treaties = GAME_STATE.diplomacy?.treaties ?? [];
  const pact = treaties.find(t =>
    t.status === 'active' && t.type === 'non_aggression' &&
    t.parties.includes(breakerNationId) && t.parties.includes(targetNationId)
  );
  if (pact) {
    pact.status = 'broken';
    if (typeof removeTreatyEffects === 'function') removeTreatyEffects(pact);
  }

  // Штраф к репутации — все нации узнают о нарушении слова
  const BREACH_REL_PENALTY = -30;
  const dipRel = GAME_STATE.diplomacy?.relations ?? {};
  for (const [key, rel] of Object.entries(dipRel)) {
    if (key.includes(breakerNationId)) {
      rel.score = Math.max(-100, (rel.score ?? 0) + BREACH_REL_PENALTY);
    }
  }

  // Штраф стабильности
  breakerNation.government.stability = Math.max(0, (breakerNation.government.stability ?? 50) - 10);

  addEventLog(
    `💔 Пакт о ненападении с ${targetNation.name} нарушен! Репутация Сиракуз падает во всём мире.`,
    'danger'
  );
}

function _ensureRelation(nation, targetId) {
  if (!nation.relations) nation.relations = {};
  if (!nation.relations[targetId]) {
    nation.relations[targetId] = { score: 0, treaties: [], at_war: false };
  }
}

function renderLaws(laws) {
  if (!laws || laws.length === 0) {
    return '<div class="no-data">Законов нет</div>';
  }
  return laws.map(law => `
    <div class="law-item">
      <span class="law-name">${law.name}</span>
      ${law.vote ? `<span class="law-vote">За: ${law.vote.for}, Против: ${law.vote.against}</span>` : ''}
    </div>
  `).join('');
}

// ──────────────────────────────────────────────────────────────
// ПРАВАЯ ПАНЕЛЬ — двор
// ──────────────────────────────────────────────────────────────

function renderRightPanel() {
  const panel = document.getElementById('right-panel');
  if (!panel || !GAME_STATE) return;

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const characters = (nation.characters || []).filter(c => c.alive);

  panel.innerHTML = `
    <div class="panel-title">👑 Двор Агафокла</div>
    <div class="characters-list">
      ${characters.length === 0
        ? '<div class="no-data">Двор пуст. Введите команду для генерации персонажей.</div>'
        : characters.map(renderCharacterCard).join('')
      }
    </div>
  `;
}

function renderCharacterCard(char) {
  const loyaltyColor = char.traits.loyalty > 60 ? '#4CAF50' :
                       char.traits.loyalty > 30 ? '#FF9800' : '#f44336';
  const moodIcon = getMoodIcon(char.traits.loyalty, char.traits.ambition);
  const roleLabel = getRoleLabel(char.role);

  return `
    <div class="char-card" onclick="showCharacterDetail('${char.id}')" title="${char.description}">
      <div class="char-portrait">${char.portrait || '👤'}</div>
      <div class="char-info">
        <div class="char-name">${char.name}</div>
        <div class="char-role">${roleLabel} · ${char.age} лет</div>
        <div class="char-loyalty">
          <span style="color:${loyaltyColor}">●</span>
          <span class="char-mood">${moodIcon}</span>
          ${char.traits.loyalty > 70 ? 'Предан' :
            char.traits.loyalty > 40 ? 'Нейтрален' : 'Недоволен'}
        </div>
      </div>
      <div class="char-wants" title="Желания: ${char.wants.join(', ')}">
        ${char.wants.slice(0, 1).map(w => `<span class="want-tag">${formatWant(w)}</span>`).join('')}
      </div>
    </div>
  `;
}

// Детальное окно персонажа
function showCharacterDetail(charId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const char = (nation.characters || []).find(c => c.id === charId);
  if (!char) return;

  const overlay = document.getElementById('char-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="char-detail-box">
      <div class="char-detail-header">
        <span class="char-detail-portrait">${char.portrait || '👤'}</span>
        <div>
          <div class="char-detail-name">${char.name}</div>
          <div class="char-detail-role">${getRoleLabel(char.role)} · ${char.age} лет · ❤️ ${char.health}/100</div>
        </div>
        <button onclick="closeCharacterDetail()" class="close-btn">✕</button>
      </div>
      <div class="char-detail-desc">${char.description}</div>

      <div class="char-traits-grid">
        ${renderTraitBar('Честолюбие', char.traits.ambition, '#9C27B0')}
        ${renderTraitBar('Осторожность', char.traits.caution, '#2196F3')}
        ${renderTraitBar('Лояльность', char.traits.loyalty, '#4CAF50')}
        ${renderTraitBar('Набожность', char.traits.piety, '#FF9800')}
        ${renderTraitBar('Жестокость', char.traits.cruelty, '#f44336')}
        ${renderTraitBar('Жадность', char.traits.greed, '#795548')}
      </div>

      <div class="char-detail-section">
        <div class="section-label">💎 Ресурсы</div>
        <div class="char-resources">
          <span>💰 ${char.resources.gold.toLocaleString()}</span>
          <span>🌾 Земли: ${char.resources.land}</span>
          <span>👥 Последователи: ${char.resources.followers}</span>
          ${char.resources.army_command > 0 ? `<span>⚔️ Войска: ${char.resources.army_command}</span>` : ''}
        </div>
      </div>

      <div class="char-detail-section">
        <div class="section-label">✨ Желает</div>
        <div class="char-wants-list">${char.wants.map(w => `<span class="tag want">${formatWant(w)}</span>`).join('')}</div>
      </div>

      <div class="char-detail-section">
        <div class="section-label">😰 Боится</div>
        <div class="char-fears-list">${char.fears.map(f => `<span class="tag fear">${formatWant(f)}</span>`).join('')}</div>
      </div>

      ${char.history && char.history.length > 0 ? `
      <div class="char-detail-section">
        <div class="section-label">📜 История</div>
        <div class="char-history">
          ${char.history.slice(-3).reverse().map(h => `<div class="history-entry">Ход ${h.turn}: ${h.event}</div>`).join('')}
        </div>
      </div>` : ''}

      ${typeof renderDialogueBlock === 'function'
          ? renderDialogueBlock(char.id, char.name, GAME_STATE.player_nation)
          : ''}
    </div>
  `;

  overlay.style.display = 'flex';
}

function closeCharacterDetail() {
  const overlay = document.getElementById('char-overlay');
  if (overlay) overlay.style.display = 'none';
}

function renderTraitBar(name, value, color) {
  return `
    <div class="trait-row">
      <span class="trait-name">${name}</span>
      <div class="bar-container">
        <div class="bar-fill" style="width:${value}%; background:${color}"></div>
      </div>
      <span class="trait-value">${value}</span>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────────────────────

function getGovernmentName(type, custom_name) {
  if (type === 'custom' && custom_name) return custom_name;
  const names = {
    tyranny:    'Тирания',
    monarchy:   'Монархия',
    republic:   'Республика',
    oligarchy:  'Олигархия',
    democracy:  'Демократия',
    tribal:     'Племенной вождизм',
    theocracy:  'Теократия',
  };
  return names[type] || custom_name || type;
}

function getHappinessColor(happiness) {
  if (happiness > 70) return '#4CAF50';
  if (happiness > 40) return '#FF9800';
  return '#f44336';
}

function getMoodIcon(loyalty, ambition) {
  if (loyalty > 70) return '😊';
  if (loyalty > 40) return '😐';
  if (ambition > 70) return '😤';
  return '😠';
}

function getRoleLabel(role) {
  const labels = {
    senator:  'Сенатор',
    advisor:  'Советник',
    general:  'Стратег',
    priest:   'Жрец',
    merchant: 'Купец',
  };
  return labels[role] || role;
}

function formatWant(want) {
  return want.replace(/_/g, ' ');
}

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}М`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}К`;
  return String(n);
}

// ──────────────────────────────────────────────────────────────
// ИТОГИ ХОДА — оверлей с кратким отчётом
// ──────────────────────────────────────────────────────────────

function showTurnSummary() {
  const overlay = document.getElementById('turn-summary-overlay');
  if (!overlay) return;

  const history = GAME_STATE._turn_summary_history ?? [];
  const last    = history[history.length - 1];
  if (!last) { overlay.style.display = 'none'; return; }

  const sign  = v => v >= 0 ? `+${v}` : `${v}`;
  const cls   = v => v >= 0 ? 'positive' : 'negative';

  // Мини-спарклайн казны (последние 8 ходов)
  const recent     = history.slice(-8);
  const treasuries = recent.map(s => s.d_treasury);
  const maxAbs     = Math.max(1, ...treasuries.map(Math.abs));
  const sparkRows  = treasuries.map(d => {
    const pct   = Math.abs(d) / maxAbs * 90;
    const color = d >= 0 ? '#4CAF50' : '#f44336';
    return `<div class="spark-bar" style="height:${pct}%;background:${color}" title="${sign(d)}"></div>`;
  }).join('');

  overlay.querySelector('#ts-content').innerHTML = `
    <div class="ts-title">📋 Итоги хода ${last.turn}</div>
    <div class="ts-grid">
      <div class="ts-row">
        <span class="ts-label">💰 Казна</span>
        <span class="ts-val ${cls(last.d_treasury)}">${sign(last.d_treasury)}</span>
      </div>
      <div class="ts-row">
        <span class="ts-label">  Доходы / Расходы</span>
        <span class="ts-val">${last.income} / ${last.expense}</span>
      </div>
      <div class="ts-row">
        <span class="ts-label">👥 Население</span>
        <span class="ts-val ${cls(last.d_pop)}">${sign(last.d_pop)}</span>
      </div>
      <div class="ts-row">
        <span class="ts-label">😊 Счастье</span>
        <span class="ts-val ${cls(last.d_happiness)}">${sign(last.d_happiness)}%</span>
      </div>
      <div class="ts-row">
        <span class="ts-label">👑 Легитимность</span>
        <span class="ts-val ${cls(last.d_legit)}">${sign(last.d_legit)}%</span>
      </div>
      <div class="ts-row">
        <span class="ts-label">🗺️ Регионов</span>
        <span class="ts-val">${last.regions}</span>
      </div>
    </div>
    <div class="ts-spark-label">Тренд казны (последние ходы):</div>
    <div class="ts-sparkline">${sparkRows}</div>
    <button class="ts-close-btn" onclick="hideTurnSummary()">Закрыть ✕</button>
  `;

  overlay.style.display = 'flex';
}

function hideTurnSummary() {
  const overlay = document.getElementById('turn-summary-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ──────────────────────────────────────────────────────────────
// ЛОГ СОБЫТИЙ — фильтрация по категории
// ──────────────────────────────────────────────────────────────

let _activeLogFilter = 'all';

function setLogFilter(filter) {
  _activeLogFilter = filter;
  _applyLogFilter();
  // Обновляем стиль кнопок
  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
}

function _applyLogFilter() {
  const logEl = document.getElementById('event-log');
  if (!logEl) return;
  const entries = logEl.querySelectorAll('.log-entry');
  entries.forEach(entry => {
    const type = entry.dataset.type ?? 'info';
    const show = _activeLogFilter === 'all' || type === _activeLogFilter;
    entry.style.display = show ? '' : 'none';
  });
}

// Патч: addEventLog теперь добавляет data-type к элементу
const _origAddEventLog = typeof addEventLog === 'function' ? addEventLog : null;

// ──────────────────────────────────────────────────────────────
// ИНИЦИАТИВЫ ПЕРСОНАЖЕЙ — панель ожидающих запросов
// ──────────────────────────────────────────────────────────────

function renderCharInitiativesPanel() {
  const panel = document.getElementById('char-initiatives-panel');
  if (!panel) return;

  const pending = GAME_STATE._pending_char_initiatives ?? [];
  if (!pending.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="ci-title">📨 Инициативы персонажей <span class="ci-count">${pending.length}</span></div>
    ${pending.map(p => `
      <div class="ci-item">
        <div class="ci-header">
          <span class="ci-portrait">${p.portrait}</span>
          <strong class="ci-name">${p.charName}</strong>
          <span class="ci-action-tag">${_actionLabel(p.action)}</span>
        </div>
        <div class="ci-message">${p.message}</div>
        <div class="ci-buttons">
          <button class="ci-btn accept" onclick="respondToCharInitiative('${p.charId}', true)">✅ Принять</button>
          <button class="ci-btn reject" onclick="respondToCharInitiative('${p.charId}', false)">❌ Отказать</button>
        </div>
      </div>
    `).join('')}
  `;
}

function _actionLabel(action) {
  const labels = {
    request_reward:    '💰 Просит награду',
    demand_influence:  '⚖️ Требует влияния',
    propose_deal:      '🤝 Предлагает сделку',
  };
  return labels[action] ?? action;
}
