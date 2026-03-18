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
// ДИАГРАММА ИСТОРИИ НАСЕЛЕНИЯ
// ─────────────────────────────────────────────────────────────────────────

let _popChartMode = 'stacked'; // 'stacked' | 'lines'

function setPopChartMode(mode) {
  _popChartMode = mode;
  renderPopulationOverlay();
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

function buildPopHistorySection(pop, stockpile) {
  _seedHistory(pop, stockpile);
  const history = pop.history;

  if (history.length < 1) {
    return `
      <div class="pop-chart-section">
        <div class="pop-sh">
          <span class="pop-st">📈 История населения</span>
        </div>
        <div class="pop-chart-empty">Нет данных — совершите первый ход</div>
      </div>`;
  }

  // Классы с ненулевым населением, отсортированные по убыванию
  const classIds = Object.keys(SOCIAL_CLASSES).filter(cid =>
    history.some(h => (h.classes?.[cid] || 0) >= 100)
  );
  const avgPop   = cid => history.reduce((s, h) => s + (h.classes?.[cid] || 0), 0) / history.length;
  const sorted   = [...classIds].sort((a, b) => avgPop(b) - avgPop(a));

  const W   = 720, H   = 210;
  const pad = { top: 20, right: 22, bottom: 40, left: 56 };
  const cw  = W - pad.left - pad.right;
  const ch  = H - pad.top - pad.bottom;
  const n   = history.length;
  const xOf = i => pad.left + (n > 1 ? (i / (n - 1)) * cw : cw / 2);

  let chartHtml;
  if (_popChartMode === 'stacked') {
    const rawMax  = Math.max(...history.map(h => h.total));
    const yMax    = _niceMax(rawMax * 1.08);
    chartHtml = _buildStackedSVG(history, sorted, W, H, pad, cw, ch, xOf, yMax);
  } else {
    const rawInd  = Math.max(...sorted.map(cid =>
      Math.max(...history.map(h => h.classes?.[cid] || 0))
    ));
    const yMaxInd = _niceMax(rawInd * 1.12);
    chartHtml = _buildLinesSVG(history, sorted, W, H, pad, cw, ch, xOf, yMaxInd);
  }

  const legend = _buildChartLegend(history, sorted);
  const tipId  = _popChartMode === 'stacked' ? 'pop-ctip-s' : 'pop-ctip-l';

  return `
    <div class="pop-chart-section">
      <div class="pop-sh">
        <span class="pop-st">📈 История населения</span>
        <div class="pop-chart-tabs">
          <button class="pct ${_popChartMode === 'stacked' ? 'active' : ''}"
                  onclick="setPopChartMode('stacked')">Состав</button>
          <button class="pct ${_popChartMode === 'lines' ? 'active' : ''}"
                  onclick="setPopChartMode('lines')">Тренды</button>
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

  // ── Диаграмма истории населения ──
  const chartHtml = buildPopHistorySection(pop, stockpile);

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

  // Инициализируем интерактивность графика после рендера
  requestAnimationFrame(() => _initChartTooltip(pop.history, _popChartMode));
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
