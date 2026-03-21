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

function renderClassCard(classId, classDef, classData, totalPop, stockpile, isExpanded, classCohorts) {
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

    // Возрастной состав класса (mini-bar)
    let ageMiniHtml = '';
    if (classCohorts) {
      const laws = typeof _getLaborLaws === 'function'
        ? _getLaborLaws(GAME_STATE?.nations?.[GAME_STATE?.player_nation])
        : null;
      ageMiniHtml = _buildClassAgeMiniBar(classId, classCohorts, laws);
    }

    detHtml = `
      <div class="pop-det">
        <div class="pop-ddesc">${classDef.description}</div>
        ${spillsHtml}
        <div class="pop-ncon">${grpHtml}</div>
        ${ageMiniHtml}
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
// ДИАГРАММА ИСТОРИИ НАСЕЛЕНИЯ
// ─────────────────────────────────────────────────────────────────────────

let _popChartMode = 'stacked'; // 'stacked' | 'lines' | 'demography'

function setPopChartMode(mode) {
  _popChartMode = mode;
  renderPopulationOverlay();
}

// ─────────────────────────────────────────────────────────────────────────
// DONUT-ДИАГРАММА СОСТАВА НАСЕЛЕНИЯ ПО КЛАССАМ
// ─────────────────────────────────────────────────────────────────────────

function _buildDemographicDonut(classSat) {
  if (!classSat || typeof SOCIAL_CLASSES === 'undefined') {
    return '<div class="pop-chart-empty">Нет данных о классах</div>';
  }

  const entries = Object.entries(classSat)
    .filter(([cid, d]) => SOCIAL_CLASSES[cid] && d.population >= 100)
    .sort((a, b) => b[1].population - a[1].population);

  const total = entries.reduce((s, [, d]) => s + d.population, 0);
  if (total === 0) return '<div class="pop-chart-empty">Нет данных</div>';

  const W = 230, H = 230;
  const cx = 115, cy = 115, Ro = 95, Ri = 50;

  let angle = -Math.PI / 2;
  const slices = [];
  for (const [cid, d] of entries) {
    const frac = d.population / total;
    const sweep = frac * 2 * Math.PI;
    // Outer arc endpoints
    const x1 = cx + Ro * Math.cos(angle),          y1 = cy + Ro * Math.sin(angle);
    const x2 = cx + Ro * Math.cos(angle + sweep),  y2 = cy + Ro * Math.sin(angle + sweep);
    // Inner arc endpoints (reverse order for donut cutout)
    const xi1 = cx + Ri * Math.cos(angle + sweep), yi1 = cy + Ri * Math.sin(angle + sweep);
    const xi2 = cx + Ri * Math.cos(angle),         yi2 = cy + Ri * Math.sin(angle);
    const lg = sweep > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${Ro},${Ro} 0 ${lg} 1 ${x2},${y2} L${xi1},${yi1} A${Ri},${Ri} 0 ${lg} 0 ${xi2},${yi2} Z`;
    const color = SOCIAL_CLASSES[cid].color || '#888';
    slices.push({ path, color, cid, frac,
      name: SOCIAL_CLASSES[cid].name,
      pop:  d.population,
      pct:  (frac * 100).toFixed(1) });
    angle += sweep;
  }

  const paths = slices.map(s =>
    `<path d="${s.path}" fill="${s.color}" stroke="#1a1e2e" stroke-width="1.5" opacity="0.92">
       <title>${s.name}: ${s.pop.toLocaleString()} чел. (${s.pct}%)</title>
     </path>`
  ).join('');

  const totalFmt = popFmtNum(total);

  const legend = slices.map(s => `
    <div class="ddnt-leg-row">
      <span class="ddnt-leg-swatch" style="background:${s.color}"></span>
      <span class="ddnt-leg-nm">${s.name}</span>
      <span class="ddnt-leg-pct">${s.pct}%</span>
      <span class="ddnt-leg-pop">${popFmtNum(s.pop)}</span>
    </div>`
  ).join('');

  return `
    <div class="ddnt-wrap">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        ${paths}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="ddnt-center-lbl">Всего</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="ddnt-center-val">${totalFmt}</text>
      </svg>
      <div class="ddnt-legend">${legend}</div>
    </div>`;
}

// Форматирование числа для осей
function _cvFmt(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'М';
  if (v >= 1000)    return Math.round(v / 1000) + 'к';
  return String(Math.round(v));
}

// "Красивое" максимальное значение оси
function _niceMax(raw) {
  if (!raw || raw <= 0) return 10000;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n   = raw / mag;
  const t   = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return t * mag;
}

// Catmull-Rom → кубический безье: гладкий путь через точки
function _smoothPath(pts) {
  if (!pts || pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1);
    const cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1);
    const cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1);
    const cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1);
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// Начальная точка данных из текущего состояния (если истории нет)
function _seedHistory(pop, stockpile) {
  if (!pop.history) pop.history = [];
  if (pop.history.length > 0) return;
  const classSat = pop.class_satisfaction ||
    (typeof calculateClassSatisfaction === 'function'
      ? calculateClassSatisfaction(pop.by_profession, stockpile)
      : null);
  const classes = {};
  if (classSat) {
    for (const [cid, d] of Object.entries(classSat)) classes[cid] = d.population || 0;
  }
  pop.history.push({
    turn: (typeof GAME_STATE !== 'undefined' ? GAME_STATE.turn : 1) || 1,
    label: '301',
    total: pop.total,
    classes,
    happiness: pop.happiness || 50,
  });
}

// ── Общие элементы SVG (сетка, оси, X-лейблы) ──────────────────────────

function _chartAxes(history, pad, cw, ch, xOf, yMax) {
  const n     = history.length;
  const ticks = 5;
  let grid = '', yLabels = '', xLabels = '';

  // Горизонтальная сетка + Y-лейблы
  for (let t = 0; t <= ticks; t++) {
    const v = yMax * t / ticks;
    const y = pad.top + ch - (v / yMax) * ch;
    grid    += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + cw}" y2="${y.toFixed(1)}"
                      stroke="rgba(255,255,255,.055)" stroke-width="1"
                      ${t > 0 ? 'stroke-dasharray="3,4"' : ''}/>`;
    yLabels += `<text x="${pad.left - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end"
                      font-size="9" font-family="sans-serif"
                      fill="rgba(255,255,255,.32)">${_cvFmt(v)}</text>`;
  }

  // X-лейблы (равномерно, не более 8)
  const step = Math.max(1, Math.ceil(n / 8));
  const shown = new Set();
  for (let i = 0; i < n; i += step) {
    const x   = xOf(i);
    const lbl = history[i].label || `Ход ${history[i].turn}`;
    shown.add(i);
    xLabels += `<text x="${x.toFixed(1)}" y="${(pad.top + ch + 18).toFixed(1)}" text-anchor="middle"
                      font-size="8.5" font-family="sans-serif"
                      fill="rgba(255,255,255,.32)">${lbl}</text>`;
  }
  // Всегда показываем последнюю точку
  if (!shown.has(n - 1)) {
    const x   = xOf(n - 1);
    const lbl = history[n - 1].label || `Ход ${history[n - 1].turn}`;
    xLabels  += `<text x="${x.toFixed(1)}" y="${(pad.top + ch + 18).toFixed(1)}" text-anchor="middle"
                       font-size="8.5" font-family="sans-serif"
                       fill="rgba(255,255,255,.55)">${lbl}</text>`;
  }

  // Линии осей
  const axes = `
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + ch}"
          stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top + ch}" x2="${pad.left + cw}" y2="${pad.top + ch}"
          stroke="rgba(255,255,255,.18)" stroke-width="1"/>
  `;

  return grid + yLabels + xLabels + axes;
}

// Прозрачные полосы для hover-интеракции
function _hoverBars(history, pad, cw, ch, xOf) {
  const n = history.length;
  let bars = '';
  for (let i = 0; i < n; i++) {
    const x  = xOf(i);
    const hw = n > 1 ? cw / (n - 1) / 2 : cw / 2;
    bars += `<rect x="${(x - hw).toFixed(1)}" y="${pad.top}"
                   width="${(hw * 2).toFixed(1)}" height="${ch}"
                   fill="transparent" class="pch-bar" data-idx="${i}"
                   style="cursor:crosshair"/>`;
  }
  return bars;
}

// ── Stacked area chart ───────────────────────────────────────────────────

function _buildStackedSVG(history, sortedIds, W, H, pad, cw, ch, xOf, yMax) {
  const n = history.length;

  // Накопленные стеки для каждой точки
  const stacks = history.map(h => {
    let cum = 0;
    const s = {};
    for (const cid of sortedIds) {
      s[`${cid}_bot`] = cum;
      cum += h.classes?.[cid] || 0;
      s[`${cid}_top`] = cum;
    }
    return s;
  });

  const yOf = v => pad.top + ch - (v / yMax) * ch;

  // Градиенты
  let defs = '<defs>';
  defs += `<clipPath id="pcc"><rect x="${pad.left}" y="${pad.top}" width="${cw}" height="${ch}"/></clipPath>`;
  for (const cid of sortedIds) {
    const col = SOCIAL_CLASSES[cid]?.color || '#888';
    defs += `
      <linearGradient id="pcga-${cid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${col}" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="${col}" stop-opacity="0.20"/>
      </linearGradient>`;
  }
  defs += '</defs>';

  // Области (от большого к малому, чтобы маленькие были сверху)
  let areas = '<g clip-path="url(#pcc)">';
  let lines = '<g clip-path="url(#pcc)">';

  for (let k = 0; k < sortedIds.length; k++) {
    const cid    = sortedIds[k];
    const col    = SOCIAL_CLASSES[cid]?.color || '#888';
    const prevId = k > 0 ? sortedIds[k - 1] : null;

    const topPts = history.map((_, i) => [xOf(i), yOf(stacks[i][`${cid}_top`])]);
    const botPts = prevId
      ? history.map((_, i) => [xOf(i), yOf(stacks[i][`${prevId}_top`])])
      : history.map((_, i) => [xOf(i), yOf(0)]);

    // Область = полигон (линейная интерполяция для fill)
    const pts = [
      ...topPts,
      ...[...botPts].reverse(),
    ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    areas += `<polygon points="${pts}" fill="url(#pcga-${cid})" opacity="0.95"/>`;

    // Гладкая линия по верхнему краю
    lines += `<path d="${_smoothPath(topPts)}" fill="none" stroke="${col}"
                    stroke-width="1.5" opacity="0.92"/>`;
  }
  areas += '</g>';
  lines += '</g>';

  const axes   = _chartAxes(history, pad, cw, ch, xOf, yMax);
  const hbars  = _hoverBars(history, pad, cw, ch, xOf);
  const hairId = 'pch-hair-s';

  return `
    <svg id="pop-chart-svg-stacked" viewBox="0 0 ${W} ${H}" class="pop-chart-svg"
         style="overflow:visible">
      ${defs}
      ${axes}
      ${areas}
      ${lines}
      <g id="${hairId}" style="display:none" pointer-events="none">
        <line id="pch-vl-s" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + ch}"
              stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-dasharray="4,3"/>
        <circle id="pch-dot-s" cx="0" cy="0" r="4"
                fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>
      </g>
      ${hbars}
    </svg>
    <div id="pop-ctip-s" class="pop-ctip" style="display:none"></div>
  `;
}

// ── Multi-line chart ─────────────────────────────────────────────────────

function _buildLinesSVG(history, sortedIds, W, H, pad, cw, ch, xOf, yMaxInd) {
  const n    = history.length;
  const yOf  = v => pad.top + ch - (v / yMaxInd) * ch;

  // Максимум по total для нормировки
  const totalMax = Math.max(...history.map(h => h.total));

  let defs = '<defs>';
  defs += `<clipPath id="pcl"><rect x="${pad.left}" y="${pad.top}" width="${cw}" height="${ch}"/></clipPath>`;
  for (const cid of sortedIds) {
    const col = SOCIAL_CLASSES[cid]?.color || '#888';
    defs += `
      <linearGradient id="pclg-${cid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${col}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${col}" stop-opacity="0.0"/>
      </linearGradient>`;
  }
  // Золотой градиент для total
  defs += `
    <linearGradient id="pclg-total" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#D4AF37" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#D4AF37" stop-opacity="0.0"/>
    </linearGradient>`;
  defs += '</defs>';

  const yOfTotal = v => pad.top + ch - (v / _niceMax(totalMax * 1.08)) * ch;

  let paths = '<g clip-path="url(#pcl)">';

  // Сначала total линия (самая жирная, золотая, на фоне)
  const totalPts = history.map((h, i) => [xOf(i), yOfTotal(h.total)]);
  // Область под total
  const totalArea = [
    ...totalPts,
    [xOf(n - 1), yOf(0)],
    [xOf(0),     yOf(0)],
  ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  paths += `<polygon points="${totalArea}" fill="url(#pclg-total)" opacity="0.7"/>`;
  paths += `<path d="${_smoothPath(totalPts)}" fill="none"
                  stroke="#D4AF37" stroke-width="2.5" opacity="0.8" stroke-dasharray="6,3"/>`;

  // Линии каждого класса
  for (const cid of sortedIds) {
    const col   = SOCIAL_CLASSES[cid]?.color || '#888';
    const pts   = history.map((h, i) => [xOf(i), yOf(h.classes?.[cid] || 0)]);
    const lastV = history[n - 1]?.classes?.[cid] || 0;

    // Область под линией
    const areaPolygon = [
      ...pts,
      [xOf(n - 1), yOf(0)],
      [xOf(0),     yOf(0)],
    ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    paths += `<polygon points="${areaPolygon}" fill="url(#pclg-${cid})" opacity="0.85"/>`;

    // Гладкая линия
    paths += `<path d="${_smoothPath(pts)}" fill="none" stroke="${col}"
                    stroke-width="2" opacity="0.9"/>`;

    // Точки данных (если мало точек)
    if (n <= 20) {
      for (const [x, y] of pts) {
        paths += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"
                          fill="${col}" opacity="0.85"/>`;
      }
    } else {
      // Только последняя точка
      const [lx, ly] = pts[n - 1];
      paths += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3"
                        fill="${col}" opacity="0.9"/>`;
    }

    // Значение в конце линии
    if (lastV >= 100) {
      const [lx, ly] = pts[n - 1];
      paths += `<text x="${(lx + 5).toFixed(1)}" y="${(ly + 3.5).toFixed(1)}"
                      font-size="8.5" font-family="sans-serif"
                      fill="${col}" opacity="0.85">${_cvFmt(lastV)}</text>`;
    }
  }

  // Лейбл total
  {
    const [lx, ly] = totalPts[n - 1];
    paths += `<text x="${(lx + 5).toFixed(1)}" y="${(ly - 4).toFixed(1)}"
                    font-size="9" font-family="sans-serif"
                    fill="#D4AF37" opacity="0.9" font-weight="bold">
                    ${_cvFmt(history[n - 1].total)}</text>`;
  }
  paths += '</g>';

  const axes  = _chartAxes(history, pad, cw, ch, xOf, yMaxInd);
  const hbars = _hoverBars(history, pad, cw, ch, xOf);

  return `
    <svg id="pop-chart-svg-lines" viewBox="0 0 ${W} ${H}" class="pop-chart-svg"
         style="overflow:visible">
      ${defs}
      ${axes}
      ${paths}
      <g id="pch-hair-l" style="display:none" pointer-events="none">
        <line id="pch-vl-l" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + ch}"
              stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-dasharray="4,3"/>
      </g>
      ${hbars}
    </svg>
    <div id="pop-ctip-l" class="pop-ctip" style="display:none"></div>
  `;
}

// ── Легенда ──────────────────────────────────────────────────────────────

function _buildChartLegend(history, sortedIds) {
  const last = history[history.length - 1];
  const items = sortedIds.map(cid => {
    const cls = SOCIAL_CLASSES[cid];
    if (!cls) return '';
    const v = last?.classes?.[cid] || 0;
    if (v < 100) return '';
    return `
      <div class="pcl-item">
        <span class="pcl-dot" style="background:${cls.color}"></span>
        <span class="pcl-nm">${cls.name}</span>
        <span class="pcl-val">&nbsp;${_cvFmt(v)}</span>
      </div>`;
  }).join('');
  return `<div class="pop-chart-legend">${items}</div>`;
}

// ── Главный строитель секции диаграммы ───────────────────────────────────

function buildPopHistorySection(pop, stockpile, nation) {
  _seedHistory(pop, stockpile);
  const history = pop.history;

  const isDemography = _popChartMode === 'demography';

  if (history.length < 1 && !isDemography) {
    return `
      <div class="pop-chart-section">
        <div class="pop-sh">
          <span class="pop-st">📈 История населения</span>
        </div>
        <div class="pop-chart-empty">Нет данных — совершите первый ход</div>
      </div>`;
  }

  let chartHtml, legend = '';

  if (isDemography) {
    // ── Демографическая вкладка: donut (состав по классам) + график ОПЖ ──
    let classSat = pop.class_satisfaction;
    if (!classSat && typeof calculateClassSatisfaction === 'function') {
      classSat = calculateClassSatisfaction(pop.by_profession, stockpile);
    }
    const donutHtml = _buildDemographicDonut(classSat);
    const demHistory = nation?.demographics?.history || [];
    const leHtml = _buildLifeExpectancyChart(demHistory);

    chartHtml = `
      <div class="pdm-wrap">
        <div class="pdm-col">
          <div class="pdm-col-hdr">Состав населения по классам</div>
          ${donutHtml}
        </div>
        <div class="pdm-col">
          <div class="pdm-col-hdr">Динамика продолжительности жизни</div>
          <div class="age-le-wrap">${leHtml}</div>
        </div>
      </div>`;
  } else {
    // Классы с ненулевым населением, отсортированные по убыванию
    const classIds = Object.keys(SOCIAL_CLASSES).filter(cid =>
      history.some(h => (h.classes?.[cid] || 0) >= 100)
    );
    const avgPop = cid => history.reduce((s, h) => s + (h.classes?.[cid] || 0), 0) / history.length;
    const sorted = [...classIds].sort((a, b) => avgPop(b) - avgPop(a));

    const W   = 720, H   = 210;
    const pad = { top: 20, right: 22, bottom: 40, left: 56 };
    const cw  = W - pad.left - pad.right;
    const ch  = H - pad.top - pad.bottom;
    const n   = history.length;
    const xOf = i => pad.left + (n > 1 ? (i / (n - 1)) * cw : cw / 2);

    if (_popChartMode === 'stacked') {
      const rawMax = Math.max(...history.map(h => h.total));
      const yMax   = _niceMax(rawMax * 1.08);
      chartHtml = _buildStackedSVG(history, sorted, W, H, pad, cw, ch, xOf, yMax);
    } else {
      const rawInd  = Math.max(...sorted.map(cid =>
        Math.max(...history.map(h => h.classes?.[cid] || 0))
      ));
      const yMaxInd = _niceMax(rawInd * 1.12);
      chartHtml = _buildLinesSVG(history, sorted, W, H, pad, cw, ch, xOf, yMaxInd);
    }
    legend = _buildChartLegend(history, sorted);
  }

  return `
    <div class="pop-chart-section">
      <div class="pop-sh">
        <span class="pop-st">📈 История населения</span>
        <div class="pop-chart-tabs">
          <button class="pct ${_popChartMode === 'stacked' ? 'active' : ''}"
                  onclick="setPopChartMode('stacked')">Состав</button>
          <button class="pct ${_popChartMode === 'lines' ? 'active' : ''}"
                  onclick="setPopChartMode('lines')">Тренды</button>
          <button class="pct ${_popChartMode === 'demography' ? 'active' : ''}"
                  onclick="setPopChartMode('demography')">Демография</button>
        </div>
      </div>
      <div class="pop-chart-wrap" id="pop-chart-wrap">
        ${chartHtml}
      </div>
      ${legend}
    </div>
  `;
}

// ── Tooltip интерактивность (вызывается после рендера) ───────────────────

function _initChartTooltip(history, mode) {
  if (!history || history.length < 1) return;

  const svgId  = mode === 'stacked' ? 'pop-chart-svg-stacked' : 'pop-chart-svg-lines';
  const tipId  = mode === 'stacked' ? 'pop-ctip-s' : 'pop-ctip-l';
  const hairId = mode === 'stacked' ? 'pch-hair-s' : 'pch-hair-l';
  const vlId   = mode === 'stacked' ? 'pch-vl-s'   : 'pch-vl-l';

  const svg  = document.getElementById(svgId);
  const tip  = document.getElementById(tipId);
  const hair = document.getElementById(hairId);
  const vl   = document.getElementById(vlId);
  if (!svg || !tip) return;

  // Классы с данными, отсортированные
  const classIds = Object.keys(SOCIAL_CLASSES).filter(cid =>
    history.some(h => (h.classes?.[cid] || 0) >= 100)
  );
  const sorted = [...classIds].sort((a, b) => {
    const avg = cid => history.reduce((s, h) => s + (h.classes?.[cid] || 0), 0) / history.length;
    return avg(b) - avg(a);
  });

  svg.querySelectorAll('.pch-bar').forEach(bar => {
    bar.addEventListener('mouseenter', () => {
      const idx = parseInt(bar.dataset.idx, 10);
      const h   = history[idx];
      if (!h) return;

      // Позиция вертикальной линии в SVG-координатах
      const svgRect  = svg.getBoundingClientRect();
      const barRect  = bar.getBoundingClientRect();
      const xSvg     = (barRect.left + barRect.width / 2 - svgRect.left) / svgRect.width * 720;

      if (vl)   { vl.setAttribute('x1', xSvg); vl.setAttribute('x2', xSvg); }
      if (hair)   hair.style.display = '';

      // Контент тултипа
      const rows = sorted.map(cid => {
        const cls = SOCIAL_CLASSES[cid];
        const v   = h.classes?.[cid] || 0;
        if (!cls || v < 100) return '';
        const delta = idx > 0
          ? (v - (history[idx - 1].classes?.[cid] || 0))
          : 0;
        const dSign = delta > 0 ? '+' : '';
        const dCol  = delta > 0 ? '#81C784' : delta < 0 ? '#EF9A9A' : 'rgba(255,255,255,.3)';
        return `
          <div class="pct-row">
            <span class="pct-dot" style="background:${cls.color}"></span>
            <span class="pct-nm">${cls.name}</span>
            <span class="pct-val" style="color:${cls.color}">${_cvFmt(v)}</span>
            ${delta !== 0 ? `<span style="font-size:9px;color:${dCol};margin-left:2px">${dSign}${_cvFmt(Math.abs(delta))}</span>` : ''}
          </div>`;
      }).join('');

      const hapCol = h.happiness >= 70 ? '#4CAF50' : h.happiness >= 45 ? '#FF9800' : '#f44336';

      tip.innerHTML = `
        <div class="pct-date">${h.label} г. до н.э. · ход ${h.turn}</div>
        <div class="pct-total">${h.total.toLocaleString()} чел.</div>
        <div style="font-size:9px;color:${hapCol};margin-bottom:5px">
          Счастье: ${h.happiness}%
        </div>
        ${rows}
      `;

      // Позиционирование тултипа
      const wrap    = document.getElementById('pop-chart-wrap');
      const wRect   = wrap?.getBoundingClientRect();
      const bLeft   = barRect.left - (wRect?.left || 0);
      const tipW    = 175;
      const leftPos = bLeft + barRect.width / 2 > (wRect?.width || 400) / 2
        ? bLeft - tipW - 8
        : bLeft + barRect.width / 2 + 8;
      tip.style.left    = `${Math.max(0, leftPos)}px`;
      tip.style.display = 'block';
    });

    bar.addEventListener('mouseleave', () => {
      if (hair) hair.style.display = 'none';
      tip.style.display = 'none';
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ВОЗРАСТНАЯ ПИРАМИДА — SVG
// Профессиональная горизонтальная пирамида, слева мужчины, справа женщины.
// ─────────────────────────────────────────────────────────────────────────

function _buildAgePyramidSVG(dem, laws, totalPop) {
  const W = 640, H = 198;
  const cGap = 90;              // зона в центре для подписей возраста
  const padL = 12, padR = 12;
  const padT = 26, padB = 24;
  const sideW = (W - padL - padR - cGap) / 2;  // ширина каждой стороны

  const mwa = laws?.min_work_age   || 12;
  const et  = laws?.elder_threshold || 55;
  const cf  = dem.cohort_fractions;

  // Полосы: сверху вниз → пожилые, взрослые, дети (классическая пирамида)
  const bands = [
    { id: 'elderly',  frac: cf.elderly,  color: '#ffb74d', label: `${et}+ лет`,           hint: 'Пожилые' },
    { id: 'adults',   frac: cf.adults,   color: '#81c784', label: `${mwa}–${et} лет`,      hint: 'Взрослые' },
    { id: 'children', frac: cf.children, color: '#64b5f6', label: `0–${mwa} лет`,          hint: 'Дети' },
  ];

  const nB   = bands.length;
  const bGap = 7;
  const bH   = (H - padT - padB - bGap * (nB - 1)) / nB;

  // Масштаб: максимальная полуфракция (100% = sideW) с 15% запасом
  const maxHalf  = Math.max(...bands.map(b => b.frac)) / 2;
  const scaleMax = Math.min(0.35, maxHalf * 1.18);
  const bwScale  = sideW / scaleMax;

  // Координаты осей
  const cL   = padL + sideW;           // правый край левой стороны (мужчины)
  const cR   = padL + sideW + cGap;    // левый край правой стороны (женщины)
  const cMid = (cL + cR) / 2;

  let s = '';

  // ── Заголовки колонок ──────────────────────────────────────
  s += `
    <text x="${(cL / 2 + padL / 2).toFixed(1)}" y="17" text-anchor="middle"
          font-size="9.5" font-family="sans-serif" fill="rgba(255,255,255,.38)" letter-spacing=".5">
      ♂ МУЖЧИНЫ
    </text>
    <text x="${(cR + (W - padR - cR) / 2).toFixed(1)}" y="17" text-anchor="middle"
          font-size="9.5" font-family="sans-serif" fill="rgba(255,255,255,.38)" letter-spacing=".5">
      ♀ ЖЕНЩИНЫ
    </text>`;

  // ── Вертикальная сетка (5%, 10%, 15%, 20%, 25%) ───────────
  const gridPcts = [5, 10, 15, 20, 25];
  for (const pct of gridPcts) {
    const frac = pct / 100;
    if (frac > scaleMax * 1.05) break;
    const xL = (cL - frac * bwScale).toFixed(1);
    const xR = (cR + frac * bwScale).toFixed(1);
    const gridTop = padT, gridBot = padT + nB * bH + (nB - 1) * bGap;
    s += `
      <line x1="${xL}" y1="${gridTop}" x2="${xL}" y2="${gridBot}"
            stroke="rgba(255,255,255,.07)" stroke-width="1" stroke-dasharray="3,4"/>
      <line x1="${xR}" y1="${gridTop}" x2="${xR}" y2="${gridBot}"
            stroke="rgba(255,255,255,.07)" stroke-width="1" stroke-dasharray="3,4"/>
      <text x="${xL}" y="${(gridBot + 16).toFixed(1)}" text-anchor="middle"
            font-size="8" font-family="sans-serif" fill="rgba(255,255,255,.25)">${pct}%</text>
      <text x="${xR}" y="${(gridBot + 16).toFixed(1)}" text-anchor="middle"
            font-size="8" font-family="sans-serif" fill="rgba(255,255,255,.25)">${pct}%</text>`;
  }

  // ── Осевые линии ──────────────────────────────────────────
  const axTop = padT - 4;
  const axBot = padT + nB * bH + (nB - 1) * bGap + 4;
  s += `
    <line x1="${cL}" y1="${axTop}" x2="${cL}" y2="${axBot}"
          stroke="rgba(255,255,255,.22)" stroke-width="1"/>
    <line x1="${cR}" y1="${axTop}" x2="${cR}" y2="${axBot}"
          stroke="rgba(255,255,255,.22)" stroke-width="1"/>`;

  // ── Полосы ────────────────────────────────────────────────
  bands.forEach((band, i) => {
    const y    = padT + i * (bH + bGap);
    const half = band.frac / 2;
    const bw   = Math.max(3, half * bwScale);
    const pct  = Math.round(band.frac * 100);
    const halfPct = (half * 100).toFixed(1);
    const midY = (y + bH / 2 + 4).toFixed(1);

    // Градиентные ID уникальны по полосе
    const gIdM = `apg-m-${band.id}`;
    const gIdF = `apg-f-${band.id}`;

    // Мужская полоса (влево от cL)
    s += `
      <defs>
        <linearGradient id="${gIdM}" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stop-color="${band.color}" stop-opacity="0.88"/>
          <stop offset="100%" stop-color="${band.color}" stop-opacity="0.40"/>
        </linearGradient>
        <linearGradient id="${gIdF}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${band.color}" stop-opacity="0.72"/>
          <stop offset="100%" stop-color="${band.color}" stop-opacity="0.40"/>
        </linearGradient>
      </defs>
      <rect x="${(cL - bw).toFixed(1)}" y="${y.toFixed(1)}"
            width="${bw.toFixed(1)}" height="${bH.toFixed(1)}"
            fill="url(#${gIdM})" rx="3"/>
      <rect x="${cR.toFixed(1)}" y="${y.toFixed(1)}"
            width="${bw.toFixed(1)}" height="${bH.toFixed(1)}"
            fill="url(#${gIdF})" rx="3"/>`;

    // Процент внутри полосы (если достаточно широкая)
    if (bw > 32) {
      s += `
        <text x="${(cL - bw / 2).toFixed(1)}" y="${midY}" text-anchor="middle"
              font-size="10" font-weight="bold" fill="rgba(0,0,0,.70)" font-family="sans-serif">
          ${halfPct}%
        </text>
        <text x="${(cR + bw / 2).toFixed(1)}" y="${midY}" text-anchor="middle"
              font-size="10" font-weight="bold" fill="rgba(0,0,0,.70)" font-family="sans-serif">
          ${halfPct}%
        </text>`;
    }

    // Численность вне полосы
    const halfN = popFmtNum(Math.round(totalPop * half));
    s += `
      <text x="${(cL - bw - 5).toFixed(1)}" y="${midY}" text-anchor="end"
            font-size="8.5" fill="rgba(255,255,255,.35)" font-family="sans-serif">${halfN}</text>
      <text x="${(cR + bw + 5).toFixed(1)}" y="${midY}" text-anchor="start"
            font-size="8.5" fill="rgba(255,255,255,.35)" font-family="sans-serif">${halfN}</text>`;

    // Центральная метка: возраст + доля + численность
    s += `
      <text x="${cMid.toFixed(1)}" y="${(y + bH / 2 - 4).toFixed(1)}" text-anchor="middle"
            font-size="9.5" font-weight="600" fill="rgba(255,255,255,.90)" font-family="sans-serif">
        ${band.label}
      </text>
      <text x="${cMid.toFixed(1)}" y="${(y + bH / 2 + 9).toFixed(1)}" text-anchor="middle"
            font-size="8.5" fill="${band.color}" font-family="sans-serif" opacity="0.9">
        ${pct}% · ${popFmtNum(Math.round(totalPop * band.frac))}
      </text>`;
  });

  return `
    <div class="age-pyramid-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="age-pyramid-svg">${s}</svg>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// КЛЮЧЕВЫЕ ДЕМОГРАФИЧЕСКИЕ МЕТРИКИ (карточки)
// ─────────────────────────────────────────────────────────────────────────

function _buildDemographicMetricCards(dem) {
  const e0  = dem.life_expectancy       || '—';
  const ea  = dem.life_expectancy_adult || '—';
  const med = dem.median_age            || '—';
  const u5  = dem.under5_mort           !== undefined ? dem.under5_mort : '—';
  const cbr = dem.crude_birth_rate      || '—';
  const cdr = dem.crude_death_rate      || '—';
  const ng  = dem.natural_growth        !== undefined ? dem.natural_growth : '—';
  const ngSign = typeof ng === 'number' ? (ng >= 0 ? '+' : '') : '';
  const ngCls  = typeof ng === 'number' ? (ng > 0 ? 'good' : ng < -2 ? 'bad' : 'warn') : '';

  const BASE_C_MULT = (typeof AGE_PARAMS !== 'undefined') ? AGE_PARAMS.baseline_consumption_mult : 1.80;
  const dep    = dem.dependency_ratio ?? 0;
  const cMlt   = dem.consumption_mult ?? 1.0;
  const lMod   = dem.labor_productivity_mod ?? 1.0;
  const ew     = Math.round(dem.effective_workforce || 0);

  const depInfo = (typeof dependencyRatioLabel === 'function')
    ? dependencyRatioLabel(dep) : { text: dep.toFixed(2), cls: 'neutral' };
  const relCons  = cMlt / BASE_C_MULT;
  const consDelta = ((relCons - 1) * 100).toFixed(1);
  const consSign  = relCons >= 1 ? '+' : '';
  const consCls   = relCons > 1.10 ? 'bad' : relCons > 1.02 ? 'warn' : 'good';
  const lModSign  = lMod >= 1 ? '+' : '';
  const lModCls   = lMod < 0.85 ? 'bad' : lMod < 0.97 ? 'warn' : 'good';

  return `
    <div class="adm-metric-grid">
      <div class="adm-metric adm-metric--le">
        <div class="adm-metric-icon">⌛</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${e0} <span class="adm-metric-unit">лет</span></div>
          <div class="adm-metric-lbl">Ожидаемая жизнь при рождении</div>
        </div>
      </div>
      <div class="adm-metric adm-metric--lea">
        <div class="adm-metric-icon">🧑</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${ea} <span class="adm-metric-unit">лет</span></div>
          <div class="adm-metric-lbl">Ожидаемая жизнь для взрослых</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">📊</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${med} <span class="adm-metric-unit">лет</span></div>
          <div class="adm-metric-lbl">Медианный возраст</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">🪦</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${u5}<span class="adm-metric-unit">‰</span></div>
          <div class="adm-metric-lbl">Детская смертность до 5 лет</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">👶</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${cbr}<span class="adm-metric-unit">‰</span></div>
          <div class="adm-metric-lbl">Рождаемость (на 1000/год)</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">💀</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${cdr}<span class="adm-metric-unit">‰</span></div>
          <div class="adm-metric-lbl">Смертность (на 1000/год)</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">📈</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val ${ngCls}">${ngSign}${ng}<span class="adm-metric-unit">‰</span></div>
          <div class="adm-metric-lbl">Естественный прирост</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">⚒</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val">${popFmtNum(ew)}</div>
          <div class="adm-metric-lbl">Рабочая сила (экв.)</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">👨‍👩‍👧</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val ${depInfo.cls}">${dep.toFixed(2)} <small class="adm-metric-unit">${depInfo.text}</small></div>
          <div class="adm-metric-lbl">Коэф. иждивенцев</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">🍞</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val ${consCls}">${consSign}${consDelta}%</div>
          <div class="adm-metric-lbl">Нагрузка потребления</div>
        </div>
      </div>
      <div class="adm-metric">
        <div class="adm-metric-icon">🔨</div>
        <div class="adm-metric-body">
          <div class="adm-metric-val ${lModCls}">${lModSign}${((lMod - 1) * 100).toFixed(1)}%</div>
          <div class="adm-metric-lbl">Трудовая производительность</div>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// ГРАФИК ПРОДОЛЖИТЕЛЬНОСТИ ЖИЗНИ — SVG с историей показателей
// ─────────────────────────────────────────────────────────────────────────

function _buildLifeExpectancyChart(demHistory) {
  if (!demHistory || demHistory.length < 2) {
    return `<div class="age-le-empty">Совершите несколько ходов — появится график динамики</div>`;
  }

  const W = 640, H = 155;
  const pad = { top: 22, right: 52, bottom: 30, left: 46 };
  const cw  = W - pad.left - pad.right;
  const ch  = H - pad.top  - pad.bottom;
  const n   = demHistory.length;
  const xOf = i => pad.left + (n > 1 ? i / (n - 1) * cw : cw / 2);

  const allE0     = demHistory.map(h => h.e0     || 20);
  const allEAdult = demHistory.map(h => h.e_adult || 35);
  const allMed    = demHistory.map(h => h.median_age || 15);

  const yMin = Math.max(0, Math.floor(Math.min(...allE0, ...allMed) / 5) * 5 - 5);
  const yMax = Math.ceil(Math.max(...allEAdult) / 5) * 5 + 5;
  const yOf  = v => pad.top + ch * (1 - (v - yMin) / (yMax - yMin));

  let s = '';

  // ── Сетка ──
  for (let v = yMin; v <= yMax; v += 5) {
    const y = yOf(v).toFixed(1);
    s += `
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + cw}" y2="${y}"
            stroke="rgba(255,255,255,.07)" stroke-width="1"
            ${v % 10 === 0 ? '' : 'stroke-dasharray="3,4"'}/>
      <text x="${(pad.left - 5).toFixed(1)}" y="${(parseFloat(y) + 3.5).toFixed(1)}"
            text-anchor="end" font-size="8.5" font-family="sans-serif"
            fill="${v % 10 === 0 ? 'rgba(255,255,255,.32)' : 'rgba(255,255,255,.18)'}">${v}</text>`;
  }

  // ── X-метки ──
  const step = Math.max(1, Math.ceil(n / 10));
  const shownX = new Set();
  for (let i = 0; i < n; i += step) {
    shownX.add(i);
    s += `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" text-anchor="middle"
                font-size="8" font-family="sans-serif" fill="rgba(255,255,255,.28)">
            ${demHistory[i].label || ''}
          </text>`;
  }
  if (!shownX.has(n - 1)) {
    s += `<text x="${xOf(n-1).toFixed(1)}" y="${H - 4}" text-anchor="middle"
                font-size="8" font-family="sans-serif" fill="rgba(255,255,255,.50)">
            ${demHistory[n-1].label || ''}
          </text>`;
  }

  // ── Оси ──
  s += `
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + ch}"
          stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top + ch}" x2="${pad.left + cw}" y2="${pad.top + ch}"
          stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <text x="${pad.left - 30}" y="${(pad.top + ch / 2).toFixed(1)}" text-anchor="middle"
          font-size="8.5" fill="rgba(255,255,255,.28)" font-family="sans-serif"
          transform="rotate(-90 ${pad.left - 30} ${pad.top + ch / 2})">Лет</text>`;

  // ── Вспомогательная функция сглаженного пути ──
  // Используем уже существующую _smoothPath из population_tab.js

  // ── Заливка под e0 ──
  const e0pts = demHistory.map((h, i) => [xOf(i), yOf(h.e0 || 20)]);
  const areaCoords = [
    ...e0pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${xOf(n-1).toFixed(1)},${(pad.top + ch).toFixed(1)}`,
    `${xOf(0).toFixed(1)},${(pad.top + ch).toFixed(1)}`,
  ].join(' ');
  s += `<polygon points="${areaCoords}" fill="url(#le-area-grad)" opacity="0.6"/>`;

  // ── Линии трёх показателей ──
  const eAdultPts = demHistory.map((h, i) => [xOf(i), yOf(h.e_adult || 35)]);
  const medPts    = demHistory.map((h, i) => [xOf(i), yOf(h.median_age || 15)]);

  s += `<path d="${_smoothPath(eAdultPts)}" fill="none" stroke="#81c784" stroke-width="1.8"
               opacity="0.75" stroke-dasharray="7,3"/>`;
  s += `<path d="${_smoothPath(medPts)}" fill="none" stroke="#ffb74d" stroke-width="1.6"
               opacity="0.70" stroke-dasharray="3,4"/>`;
  s += `<path d="${_smoothPath(e0pts)}" fill="none" stroke="#64b5f6" stroke-width="2.8"
               opacity="0.92"/>`;

  // ── Точки на последних значениях ──
  const [lx0, ly0] = e0pts[n-1];
  const [lxa, lya] = eAdultPts[n-1];
  const [lxm, lym] = medPts[n-1];
  const lastE0  = demHistory[n-1].e0        || 0;
  const lastEA  = demHistory[n-1].e_adult   || 0;
  const lastMed = demHistory[n-1].median_age || 0;

  s += `<circle cx="${lx0.toFixed(1)}" cy="${ly0.toFixed(1)}" r="4"
                fill="#64b5f6" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>`;
  s += `<circle cx="${lxa.toFixed(1)}" cy="${lya.toFixed(1)}" r="3"
                fill="#81c784" stroke="rgba(0,0,0,.4)" stroke-width="1"/>`;
  s += `<circle cx="${lxm.toFixed(1)}" cy="${lym.toFixed(1)}" r="2.5"
                fill="#ffb74d" stroke="rgba(0,0,0,.4)" stroke-width="1"/>`;

  // Значения у последних точек
  s += `
    <text x="${(lx0 + 6).toFixed(1)}" y="${(ly0 + 4).toFixed(1)}" font-size="9.5"
          font-weight="bold" fill="#64b5f6" font-family="sans-serif">${lastE0.toFixed(1)}</text>
    <text x="${(lxa + 6).toFixed(1)}" y="${(lya + 4).toFixed(1)}" font-size="9"
          fill="#81c784" font-family="sans-serif">${lastEA.toFixed(1)}</text>
    <text x="${(lxm + 6).toFixed(1)}" y="${(lym + 4).toFixed(1)}" font-size="9"
          fill="#ffb74d" font-family="sans-serif">${lastMed.toFixed(1)}</text>`;

  // ── Легенда ──
  const legend = `
    <div class="age-le-legend">
      <span class="age-le-dot" style="background:#64b5f6;width:16px;height:3px;border-radius:2px;display:inline-block;vertical-align:middle;margin-right:4px"></span>
      <span>e₀ (при рождении)</span>
      <span class="age-le-dot" style="background:#81c784;width:16px;height:2px;border-radius:2px;display:inline-block;vertical-align:middle;margin:0 4px 0 10px"></span>
      <span>e (взрослые)</span>
      <span class="age-le-dot" style="background:#ffb74d;width:10px;height:2px;border-radius:2px;display:inline-block;vertical-align:middle;margin:0 4px 0 10px"></span>
      <span>Медианный возраст</span>
    </div>`;

  return `
    <svg viewBox="0 0 ${W} ${H}" class="age-le-chart-svg">
      <defs>
        <linearGradient id="le-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#64b5f6" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#64b5f6" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${s}
    </svg>
    ${legend}`;
}

// ─────────────────────────────────────────────────────────────────────────
// МИНИ-БАР ВОЗРАСТНОГО СОСТАВА КЛАССА (в развёрнутой карточке)
// ─────────────────────────────────────────────────────────────────────────

function _buildClassAgeMiniBar(classId, nationCohorts, laws) {
  if (!nationCohorts || typeof estimateClassAgeCohorts !== 'function') return '';

  const c  = estimateClassAgeCohorts(classId, nationCohorts);
  const mwa = laws?.min_work_age    || 12;
  const et  = laws?.elder_threshold || 55;

  const cp = Math.round(c.children * 100);
  const ap = Math.round(c.adults   * 100);
  const ep = Math.round(c.elderly  * 100);

  // Отображение средней ожидаемой продолжительности жизни для класса
  // Упрощённая коррекция: взвешенная сумма с bias-смещением
  const LIFE_COMMENT = {
    farmers_class:   'Высокая рождаемость, умеренная смертность',
    craftsmen_class: 'Городская среда, профессиональные болезни',
    citizens:        'Привилегированный доступ к питанию и медицине',
    sailors_class:   'Высокая гибель в море, молодой состав',
    clergy_class:    'Целибат, почётная старость, минимум детей',
    soldiers_class:  'Молодой боевой состав, высокие потери',
    slaves_class:    'Тяжёлый труд, высокая сверхсмертность',
  };
  const comment = LIFE_COMMENT[classId] || '';

  return `
    <div class="cls-age-block">
      <div class="cls-age-title">Оценочный возрастной состав</div>
      <div class="cls-age-bar-outer">
        <div class="cls-age-seg cls-age-seg--child" style="width:${cp}%"
             title="Дети (0–${mwa} лет): ${cp}%"></div>
        <div class="cls-age-seg cls-age-seg--adult" style="width:${ap}%"
             title="Взрослые (${mwa}–${et} лет): ${ap}%"></div>
        <div class="cls-age-seg cls-age-seg--elder" style="width:${ep}%"
             title="Пожилые (${et}+): ${ep}%"></div>
      </div>
      <div class="cls-age-row">
        <span class="cls-age-pip cls-age-pip--child"></span>
        <span class="cls-age-lbl">Дети</span><span class="cls-age-pct">${cp}%</span>
        <span class="cls-age-pip cls-age-pip--adult"></span>
        <span class="cls-age-lbl">Взрослые</span><span class="cls-age-pct">${ap}%</span>
        <span class="cls-age-pip cls-age-pip--elder"></span>
        <span class="cls-age-lbl">Пожилые</span><span class="cls-age-pct">${ep}%</span>
      </div>
      ${comment ? `<div class="cls-age-comment">${comment}</div>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// ВОЗРАСТНАЯ ДЕМОГРАФИЯ — главная секция (пирамида + метрики + LE + законы)
// ─────────────────────────────────────────────────────────────────────────

function buildAgeDemographicsSection(nation) {
  const dem = nation.demographics;
  if (!dem || !dem.cohort_fractions) return '';

  const laws      = (typeof _getLaborLaws === 'function') ? _getLaborLaws(nation) : null;
  const totalPop  = nation.population?.total || 0;

  // ── 1. Возрастная пирамида ──────────────────────────────────
  const pyramidHtml = _buildAgePyramidSVG(dem, laws, totalPop);

  // ── 2. Метрики (карточки) ──────────────────────────────────
  const metricsHtml = _buildDemographicMetricCards(dem);

  // ── 3. График ожидаемой продолжительности жизни ────────────
  const leChartHtml = _buildLifeExpectancyChart(dem.history || []);

  // ── 4. Законы труда ────────────────────────────────────────
  const lawsHtml = _buildLaborLawsPanel(nation);

  return `
    <div class="adm-section">
      <div class="pop-sh">
        <span class="pop-st">📊 Возрастная структура населения</span>
      </div>

      <!-- Пирамида возрастов -->
      <div class="adm-block">
        <div class="adm-block-hdr">Половозрастная пирамида</div>
        ${pyramidHtml}
      </div>

      <!-- Демографические метрики -->
      <div class="adm-block">
        <div class="adm-block-hdr">Ключевые демографические показатели</div>
        ${metricsHtml}
      </div>

      <!-- График продолжительности жизни -->
      <div class="adm-block">
        <div class="adm-block-hdr">Динамика продолжительности жизни</div>
        <div class="age-le-wrap">
          ${leChartHtml}
        </div>
      </div>

      <!-- Законы труда -->
      <div class="adm-block">
        ${lawsHtml}
      </div>

    </div>
  `;
}

function _buildLaborLawsPanel(nation) {
  if (typeof LABOR_LAW_GROUPS === 'undefined' || typeof LAWS_LABOR === 'undefined') return '';

  const lawsHtml = LABOR_LAW_GROUPS.map(group => {
    const activeLaw = (typeof getActiveLaborLawForGroup === 'function')
      ? getActiveLaborLawForGroup(nation, group.id)
      : null;
    const activeId  = activeLaw ? Object.keys(LAWS_LABOR).find(k => LAWS_LABOR[k] === activeLaw) : null;

    // Найти законы этой группы
    const groupLaws = Object.entries(LAWS_LABOR).filter(([, v]) => v.group === group.id);
    if (!groupLaws.length) return '';

    const btns = groupLaws.map(([id, law]) => {
      const isActive = id === activeId;
      return `
        <button class="adm-law-btn${isActive ? ' active' : ''}"
                onclick="uiToggleLaborLaw('${id}')"
                title="${law.description || ''}">
          ${law.name}
        </button>
      `;
    }).join('');

    return `
      <div class="adm-law-group">
        <div class="adm-law-grp-hdr">${group.icon} ${group.name}</div>
        <div class="adm-law-btns">${btns}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="adm-laws">
      <div class="adm-laws-hdr">⚖ Законы о труде</div>
      ${lawsHtml}
    </div>
  `;
}

function uiToggleLaborLaw(lawId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (!nation || typeof LAWS_LABOR === 'undefined') return;

  const law = LAWS_LABOR[lawId];
  if (!law) return;

  // Найти активный закон этой группы
  const activeId = (typeof getActiveLaborLawForGroup === 'function')
    ? Object.keys(LAWS_LABOR).find(k => {
        const v = LAWS_LABOR[k];
        return v.group === law.group && getActiveLaborLawForGroup(nation, law.group) === v;
      })
    : null;

  if (activeId === lawId) {
    // Уже активен — не переключаем (должен быть активен хоть один)
    return;
  }

  if (typeof applyLaborLaw === 'function') {
    applyLaborLaw(nation, lawId);
  }

  // Перерисовать только оверлей (не весь UI)
  renderPopulationOverlay();
}

// ─────────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА
// ─────────────────────────────────────────────────────────────────────────

let _popExpandedClass  = null;
let _popIncomeFilter   = null; // null = all production types

// ─────────────────────────────────────────────────────────────────────────
// СЕКЦИЯ "ДОХОДЫ И ИНВЕСТИЦИИ КЛАССОВ"
// ─────────────────────────────────────────────────────────────────────────

function _popSetIncomeFilter(type) {
  _popIncomeFilter = (_popIncomeFilter === type) ? null : type;
  renderPopulationOverlay();
}

const _PROD_TYPE_META = {
  wheat:  { icon: '🌾', label: 'Пшеница' },
  horse:  { icon: '🐎', label: 'Кони' },
  cattle: { icon: '🐄', label: 'Скот' },
};

const _CLS_INCOME_META = {
  aristocrats:    { icon: '👑', label: 'Аристократы', color: '#d4af37' },
  soldiers_class: { icon: '⚔️',  label: 'Солдаты',     color: '#c0392b' },
  farmers_class:  { icon: '🌾', label: 'Земледельцы', color: '#27ae60' },
};

function buildClassIncomeSection(nation) {
  const eco  = nation.economy;
  const ibt  = eco._class_income_by_type || {};
  const batt = eco._class_battery        || {};
  const cipc = eco.class_income_per_capita || {};
  const maint = (typeof CONFIG !== 'undefined' && CONFIG.BALANCE?.BUILDING_MAINTENANCE) || 50;

  // Collect production types that have any income
  const allTypes = new Set();
  for (const types of Object.values(ibt)) {
    for (const t of Object.keys(types)) allTypes.add(t);
  }

  if (allTypes.size === 0) {
    return `<div class="cid-empty">Данные появятся после первого хода с активными зданиями</div>`;
  }

  // Filter buttons
  const filterBtns = [...allTypes].map(type => {
    const meta   = _PROD_TYPE_META[type] || { icon: '📦', label: type };
    const active = _popIncomeFilter === type;
    return `<button class="cid-filter-btn${active ? ' active' : ''}"
                    onclick="_popSetIncomeFilter('${type}')">
              ${meta.icon} ${meta.label}
            </button>`;
  }).join('');

  const activeTypes = _popIncomeFilter ? [_popIncomeFilter] : [...allTypes];

  // Class cards
  const clsRows = ['aristocrats', 'soldiers_class', 'farmers_class'].map(cls => {
    const clsMeta  = _CLS_INCOME_META[cls] || { icon: '👤', label: cls, color: '#aaa' };
    const clsTypes = ibt[cls]  || {};
    const clsBatt  = batt[cls] || {};

    // Only show types with income (and matching active filter)
    const visTypes = activeTypes.filter(t => (clsTypes[t] || 0) > 0);
    if (visTypes.length === 0) return '';

    const totalInc = Object.values(clsTypes).reduce((s, v) => s + v, 0);
    const perCap   = cipc[cls] ?? 0;

    // Battery bars
    const battBars = visTypes.map(ptype => {
      const meta    = _PROD_TYPE_META[ptype] || { icon: '📦', label: ptype };
      const battVal = clsBatt[ptype] || 0;

      // Find threshold for this class + production type
      let bThresh = 3000;
      if (typeof BUILDINGS !== 'undefined') {
        for (const [bid, bDef] of Object.entries(BUILDINGS)) {
          if (bDef.autonomous_builder === cls && bid.startsWith(ptype + '_')) {
            bThresh = (bDef.cost || 0) + 5 * 12 * maint;
            break;
          }
        }
      }

      const pct    = Math.min(100, Math.round(battVal / bThresh * 100));
      const ready  = pct >= 100;
      const fillCl = ready ? '#4CAF50' : (pct > 60 ? '#FF9800' : '#5b8dd9');

      // Proportional share of this type in class's total income (for mixed ownership)
      const typeInc    = clsTypes[ptype] || 0;
      const sharePct   = totalInc > 0 ? Math.round(typeInc / totalInc * 100) : 0;
      const shareLabel = activeTypes.length > 1 ? ` <span class="cid-share">${sharePct}%</span>` : '';

      return `
        <div class="cid-batt-row">
          <div class="cid-batt-label">
            <span>${meta.icon} ${meta.label}${shareLabel}</span>
            <span class="cid-batt-nums">${Math.round(battVal).toLocaleString()} / ${bThresh.toLocaleString()} ₴
              ${ready ? '&nbsp;🔓' : `&nbsp;${pct}%`}
            </span>
          </div>
          <div class="cid-batt-track">
            <div class="cid-batt-fill" style="width:${pct}%;background:${fillCl}"></div>
          </div>
          ${ready ? '<div class="cid-batt-ready">Готов к инвестиции — ждём следующего хода</div>' : ''}
        </div>`;
    }).join('');

    return `
      <div class="cid-cls-card" style="border-left:3px solid ${clsMeta.color}20;
                                       border-color:${clsMeta.color}40">
        <div class="cid-cls-header">
          <span class="cid-cls-icon" style="color:${clsMeta.color}">${clsMeta.icon} ${clsMeta.label}</span>
          <span class="cid-cls-inc">${totalInc.toLocaleString()} ₴/мес &nbsp;·&nbsp; ${perCap.toLocaleString()} ₴/чел</span>
        </div>
        ${battBars}
      </div>`;
  }).filter(Boolean).join('');

  return `
    <div class="cid-wrap">
      <div class="cid-filter-row">
        <button class="cid-filter-btn${!_popIncomeFilter ? ' active' : ''}"
                onclick="_popSetIncomeFilter(null)">Все типы</button>
        ${filterBtns}
      </div>
      ${clsRows || '<div class="cid-empty">Нет данных по выбранному типу производства</div>'}
    </div>`;
}

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

  // ── Возрастные когорты нации (для per-class оценки) ──
  const nationCohorts = nation.demographics?.cohort_fractions || null;

  // ── Карточки классов ──
  const cardsHtml = Object.entries(SOCIAL_CLASSES).map(([classId, classDef]) => {
    const data = classSat[classId];
    if (!data || data.population < 10) return '';
    const isExpanded = _popExpandedClass === classId;
    return renderClassCard(classId, classDef, data, totalClassPop, stockpile, isExpanded, nationCohorts);
  }).join('');

  // ── Пилюли модификаторов ──
  const pillsHtml = renderModPills(politicalEffects);

  // ── Диаграмма истории населения ──
  const chartHtml = buildPopHistorySection(pop, stockpile, nation);

  // ── Возрастная демография + законы труда ──
  const ageHtml = buildAgeDemographicsSection(nation);

  // ── Доходы и инвестиции классов ──
  const incomeHtml = buildClassIncomeSection(nation);

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

      <!-- Population history chart -->
      ${chartHtml}

      <!-- Age demographics + labor laws -->
      ${ageHtml}

      <!-- Classes section -->
      <div class="pop-sh">
        <span class="pop-st">Социальные классы</span>
        <span class="pop-hint">Нажмите на карточку для подробностей</span>
      </div>
      <div class="pop-grid">
        ${cardsHtml}
      </div>

      <!-- Income & Investment section -->
      <div class="pop-sh" style="margin-top:12px">
        <span class="pop-st">💰 Доходы и инвестиции классов</span>
        <span class="pop-hint">Прогресс накопления к следующей постройке</span>
      </div>
      ${incomeHtml}

    </div>
  `;

  // Инициализируем интерактивность графика после рендера
  if (_popChartMode !== 'demography') {
    requestAnimationFrame(() => _initChartTooltip(pop.history, _popChartMode));
  }
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
