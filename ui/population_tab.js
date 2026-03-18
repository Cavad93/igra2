// Вкладка структуры населения — Dashboard v2
// Открывается через кнопку в левой панели

// ─────────────────────────────────────────────────────────────────────────
// SVG-СТРОИТЕЛИ
// ─────────────────────────────────────────────────────────────────────────

function buildGaugeSVG(val) {
  // Полукруговая дуга счастья (0–100)
  // Размер 120×70, радиус 50, центр (60, 60)
  const W = 120, H = 68, cx = 60, cy = 62, r = 48;
  const clampedVal = Math.max(0, Math.min(100, val));
  const fraction   = clampedVal / 100;

  // Длина полукруга = π × r
  const arcLen   = Math.PI * r;
  const fillLen  = fraction * arcLen;
  const gapLen   = arcLen - fillLen;

  // Цвет по значению
  let color;
  if (clampedVal >= 75) color = '#4CAF50';
  else if (clampedVal >= 55) color = '#FF9800';
  else if (clampedVal >= 35) color = '#f44336';
  else color = '#9C27B0';

  return `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="g-gauge-track" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="rgba(255,255,255,.05)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,.08)"/>
        </linearGradient>
      </defs>
      <!-- Track -->
      <path d="M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}"
            fill="none" stroke="url(#g-gauge-track)" stroke-width="7"
            stroke-linecap="round"/>
      <!-- Fill -->
      <path d="M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}"
            fill="none" stroke="${color}" stroke-width="7"
            stroke-linecap="round"
            stroke-dasharray="${fillLen.toFixed(2)} ${(arcLen * 2).toFixed(2)}"
            transform="rotate(0)"/>
      <!-- Value text -->
      <text x="${cx}" y="${cy - 8}" text-anchor="middle"
            font-family="'Cinzel','Georgia',serif" font-size="20" font-weight="bold"
            fill="${color}">${clampedVal}%</text>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle"
            font-family="sans-serif" font-size="8" letter-spacing=".5"
            fill="rgba(255,255,255,.35)">СЧАСТЬЕ</text>
    </svg>
  `;
}

function buildMiniDonut(sharePct, color) {
  // Мини-пончик: доля класса в населении (0–100)
  const size = 44, cx = 22, cy = 22, r = 16, strokeW = 5;
  const circumference = 2 * Math.PI * r;
  const fill = (sharePct / 100) * circumference;
  const gap  = circumference - fill;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}"
              fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${strokeW}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}"
              fill="none" stroke="${color}" stroke-width="${strokeW}"
              stroke-linecap="round"
              stroke-dasharray="${fill.toFixed(2)} ${gap.toFixed(2)}"
              transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle"
            font-family="sans-serif" font-size="9" font-weight="bold"
            fill="${color}">${Math.round(sharePct)}%</text>
    </svg>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// ФОРМАТИРОВАНИЕ
// ─────────────────────────────────────────────────────────────────────────

function popFmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'М';
  if (n >= 1000)    return Math.round(n / 1000) + 'к';
  return String(Math.round(n));
}

function popSatColor(sat) {
  if (sat >= 75) return '#4CAF50';
  if (sat >= 55) return '#FF9800';
  if (sat >= 35) return '#f44336';
  return '#9C27B0';
}

function popSatLabel(sat) {
  if (sat >= 75) return 'Довольны';
  if (sat >= 55) return 'Нейтральны';
  if (sat >= 35) return 'Недовольны';
  return 'Враждебны';
}

// ─────────────────────────────────────────────────────────────────────────
// КАРТОЧКА КЛАССА
// ─────────────────────────────────────────────────────────────────────────

function renderClassCard(classId, classDef, classData, totalPop, stockpile, isExpanded) {
  const sat    = classData.satisfaction;
  const pop    = classData.population;
  const share  = totalPop > 0 ? (pop / totalPop * 100) : 0;
  const col    = classDef.color;
  const isSlv  = classId === 'slaves_class';

  const satCol = popSatColor(sat);

  // Мини-донат
  const donut = buildMiniDonut(share, col);

  // Мини-бар удовлетворённости
  const satBar = `
    <div class="pop-sm"><div class="pop-smf" style="width:${sat}%;background:${satCol}"></div></div>
  `;

  // Значок статуса
  const badge = sat >= 70 ? `<span style="color:#81C784;font-size:9px">● Лояльны</span>`
              : sat < 40  ? `<span style="color:#EF9A9A;font-size:9px">● Недовольны</span>`
              :              `<span style="color:#FFCC80;font-size:9px">● Нейтральны</span>`;

  // Ключевой эффект для footer
  let footerFx = '', footerCls = 'dim';
  if (sat < 40 && classDef.unhappy_effects) {
    const entries = Object.entries(classDef.unhappy_effects);
    if (entries.length) {
      const [k, v] = entries[0];
      const lbl = _popEffectLabel(k);
      const sign = v > 0 ? '+' : '';
      const fmtV = Math.abs(v) < 1 ? (v * 100).toFixed(0) + '%' : v;
      footerFx  = `${lbl}: ${sign}${fmtV}`;
      footerCls = 'bad';
    }
  } else if (sat > 70 && classDef.happy_effects) {
    const entries = Object.entries(classDef.happy_effects);
    if (entries.length) {
      const [k, v] = entries[0];
      const lbl = _popEffectLabel(k);
      const sign = v > 0 ? '+' : '';
      const fmtV = Math.abs(v) < 1 ? (v * 100).toFixed(0) + '%' : v;
      footerFx  = `${lbl}: ${sign}${fmtV}`;
      footerCls = 'good';
    }
  }
  if (!footerFx) { footerFx = popSatLabel(sat); footerCls = 'dim'; }

  // Развёрнутая секция (нужды по группам)
  let detHtml = '';
  if (isExpanded) {
    const groups = { basic: [], standard: [], luxury: [] };
    for (const [good, spec] of Object.entries(classDef.needs)) {
      const needed = (pop / 100) * spec.per_100;
      const avail  = stockpile[good] || 0;
      const ratio  = needed > 0 ? Math.min(1, avail / needed) : 1;
      const pct    = Math.round(ratio * 100);
      const goodDef = (typeof GOODS !== 'undefined' && GOODS[good]) || {};
      const icon    = goodDef.icon || '📦';
      const name    = spec.label || goodDef.name || good;
      const pctCol  = pct >= 85 ? '#81C784' : pct >= 60 ? '#FFCC80' : '#EF9A9A';
      const item = `
        <div class="pop-ni">
          <span class="pop-ni-ic">${icon}</span>
          <span class="pop-ni-nm">${name}</span>
          <div class="pop-ni-bar">
            <div style="height:100%;width:${pct}%;background:${pctCol};border-radius:2px"></div>
          </div>
          <span class="pop-ni-pct" style="color:${pctCol}">${pct}%</span>
        </div>
      `;
      const g = spec.priority || 'basic';
      if (groups[g]) groups[g].push(item);
    }

    const grpLabels = { basic: 'Базовые', standard: 'Стандарт', luxury: 'Роскошь' };
    const grpCls    = { basic: 'grp-b',   standard: 'grp-s',    luxury: 'grp-l'   };

    const grpHtml = Object.entries(groups).filter(([, items]) => items.length > 0).map(([g, items]) => `
      <div>
        <div class="pop-ng-lbl ${grpCls[g]}">${grpLabels[g]}</div>
        ${items.join('')}
      </div>
    `).join('');

    // Сводные сат-баджи
    const spillsHtml = `
      <div class="pop-spills">
        <span class="pop-sp b">Базовые: ${classData.basic_sat}%</span>
        <span class="pop-sp s">Стандарт: ${classData.standard_sat}%</span>
        <span class="pop-sp l">Роскошь: ${classData.luxury_sat}%</span>
      </div>
    `;

    detHtml = `
      <div class="pop-det">
        <div class="pop-ddesc">${classDef.description}</div>
        ${spillsHtml}
        <div class="pop-ncon">${grpHtml}</div>
      </div>
    `;
  }

  return `
    <div class="pop-card${isExpanded ? ' expanded' : ''}${isSlv ? ' slaves' : ''}"
         data-cls="${classId}" onclick="togglePopClass('${classId}')">
      <div class="pop-ch">
        <span class="pop-ci">${classDef.icon}</span>
        <div class="pop-ct">
          <span class="pop-cn">${classDef.name}</span>
          <span class="pop-cp">${popFmtNum(pop)} чел.</span>
        </div>
      </div>
      <div class="pop-cv">
        <div class="pop-cd">${donut}</div>
        <div class="pop-cs2">
          <div class="pop-sb">${badge}</div>
          ${satBar}
          <div style="font-size:9px;font-family:sans-serif;color:${satCol}">${sat}%</div>
        </div>
      </div>
      <div class="pop-cf">
        <span class="pop-cfx ${footerCls}">${footerFx}</span>
        <span class="pop-chv">${isExpanded ? '▲' : '▼'}</span>
      </div>
      ${detHtml}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// МЕТКИ ЭФФЕКТОВ
// ─────────────────────────────────────────────────────────────────────────

function _popEffectLabel(key) {
  return {
    conspiracy_chance_mod: 'Заговор',
    legitimacy_mod:        'Легитимность',
    tax_efficiency_mod:    'Налоги',
    production_mod:        'Производство',
    trade_income_mod:      'Торговля',
    military_loyalty_mod:  'Лояльность',
    military_morale_mod:   'Боевой дух',
    growth_rate_mod:       'Рост нас.',
    rebellion_risk:        'Восстание',
    desertion_risk:        'Дезертирство',
    happiness_base_mod:    'Счастье',
  }[key] || key;
}

// ─────────────────────────────────────────────────────────────────────────
// МОДИФИКАТОРНЫЕ ПИЛЮЛИ
// ─────────────────────────────────────────────────────────────────────────

const _POP_FX_ICONS = {
  production_mod:        '⚒',
  tax_efficiency_mod:    '🪙',
  trade_income_mod:      '🚢',
  legitimacy_mod:        '👑',
  military_loyalty_mod:  '⚔',
  military_morale_mod:   '🛡',
  growth_rate_mod:       '🌿',
  conspiracy_chance_mod: '🗡',
  rebellion_risk:        '🔥',
  desertion_risk:        '🏃',
  happiness_base_mod:    '😊',
};

// "Good" means positive value is good for these keys
const _POP_FX_POS_GOOD = new Set([
  'production_mod','tax_efficiency_mod','trade_income_mod','legitimacy_mod',
  'military_loyalty_mod','military_morale_mod','growth_rate_mod','happiness_base_mod',
]);

function renderModPills(politicalEffects) {
  if (!politicalEffects) return '';
  const pills = [];
  for (const [key, val] of Object.entries(politicalEffects)) {
    if (Math.abs(val) < 0.001) continue;
    const icon  = _POP_FX_ICONS[key] || '◆';
    const lbl   = _popEffectLabel(key);
    const sign  = val > 0 ? '+' : '';
    const pctV  = Math.abs(val) < 1 ? (val * 100).toFixed(0) + '%' : val.toFixed(1);
    const isGood = _POP_FX_POS_GOOD.has(key) ? val > 0 : val < 0;
    const cls   = isGood ? 'good' : 'bad';
    pills.push(`<span class="pop-pill ${cls}">${icon} ${sign}${pctV} ${lbl}</span>`);
  }
  return pills.length
    ? `<div class="pop-mods">${pills.join('')}</div>`
    : '';
}

// ─────────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА
// ─────────────────────────────────────────────────────────────────────────

let _popExpandedClass = null;

function renderPopulationOverlay() {
  const overlay = document.getElementById('population-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations[nationId];
  if (!nation) return;

  const pop       = nation.population;
  const stockpile = nation.economy.stockpile;

  // Данные по классам
  let classSat = pop.class_satisfaction;
  if (!classSat && typeof calculateClassSatisfaction === 'function') {
    classSat = calculateClassSatisfaction(pop.by_profession, stockpile);
  }
  if (!classSat) {
    overlay.innerHTML = `
      <div class="pop-oi" style="padding:32px;text-align:center;color:var(--text-dim)">
        Данные о классах недоступны
      </div>`;
    return;
  }

  // Политические эффекты
  let politicalEffects = null;
  if (typeof calculatePoliticalEffects === 'function') {
    politicalEffects = calculatePoliticalEffects(classSat);
  }

  // Общее население по классам (для долей)
  const totalClassPop = Object.values(classSat).reduce((s, d) => s + d.population, 0);

  // ── Gauge SVG ──
  const gaugeHtml = buildGaugeSVG(pop.happiness);

  // ── Composition bar ──
  const barSegs = Object.entries(classSat).map(([cid, d]) => {
    if (!SOCIAL_CLASSES[cid] || d.population < 10) return '';
    const pct = totalClassPop > 0 ? (d.population / totalClassPop * 100).toFixed(1) : 0;
    const col = SOCIAL_CLASSES[cid].color;
    const nm  = SOCIAL_CLASSES[cid].name;
    return `<div class="pop-csg" style="width:${pct}%;background:${col}"
                 title="${nm}: ${popFmtNum(d.population)} (${pct}%)"></div>`;
  }).join('');

  // ── Карточки классов ──
  const cardsHtml = Object.entries(SOCIAL_CLASSES).map(([classId, classDef]) => {
    const data = classSat[classId];
    if (!data || data.population < 10) return '';
    const isExpanded = _popExpandedClass === classId;
    return renderClassCard(classId, classDef, data, totalClassPop, stockpile, isExpanded);
  }).join('');

  // ── Пилюли модификаторов ──
  const pillsHtml = renderModPills(politicalEffects);

  overlay.innerHTML = `
    <div class="pop-oi">

      <!-- Header -->
      <div class="pop-hdr">
        <span class="pop-hdr-ic">👥</span>
        <div style="flex:1">
          <div class="pop-hdr-t">Структура общества</div>
          <div class="pop-hdr-n">${nation.name}</div>
        </div>
        <button class="pop-x" onclick="hidePopulationOverlay()">✕</button>
      </div>

      <!-- Hero metrics -->
      <div class="pop-hero">
        <div class="pop-hm">
          <span class="pop-hl">Всего населения</span>
          <span class="pop-hv">${pop.total.toLocaleString()}</span>
          <span class="pop-hs">${popFmtNum(totalClassPop)} в классах (${Math.round(totalClassPop / pop.total * 100)}%)</span>
        </div>
        <div class="pop-hg">${gaugeHtml}</div>
        <div class="pop-hm right">
          <span class="pop-hl">Счастье нации</span>
          <span class="pop-hv" style="color:${popSatColor(pop.happiness)}">${pop.happiness}%</span>
          <span class="pop-hs">${popSatLabel(pop.happiness)}</span>
        </div>
      </div>

      <!-- Composition bar -->
      <div class="pop-cbar-wrap">
        <div class="pop-cbar">${barSegs}</div>
      </div>

      <!-- Modifier pills -->
      ${pillsHtml}

      <!-- Classes section -->
      <div class="pop-sh">
        <span class="pop-st">Социальные классы</span>
        <span class="pop-hint">Нажмите на карточку для подробностей</span>
      </div>
      <div class="pop-grid">
        ${cardsHtml}
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

// Перерисовка после каждого хода
function refreshPopulationTab() {
  const overlay = document.getElementById('population-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  renderPopulationOverlay();
}
