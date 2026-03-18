// ═══════════════════════════════════════════════════════════════════════════
// ЭКОНОМИЧЕСКИЙ ОБЗОР — React UI — ui/economy_react.jsx
//
//  Стек: React 18 (CDN) + Babel Standalone (JSX transpile in browser)
//  Стиль: Dark Victorian / Industrial Noir + Glassmorphism
//
//  Загружается как <script type="text/babel" src="ui/economy_react.jsx">
//  React / ReactDOM доступны как глобальные переменные из CDN.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const { useState, useMemo, useEffect, useCallback, useId } = React;

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA — fallback когда GAME_STATE недоступен
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_DATA = [
  { id: 'wheat',      name: 'Пшеница',        category: 'Провизия',      icon: '🌾', stock: 25400, price: 10.2, trend: -2.4, status: 'Норма',   history: [12,11.5,11.2,11,10.8,10.6,10.4,10.3,10.2,10.2] },
  { id: 'barley',     name: 'Ячмень',          category: 'Провизия',      icon: '🌿', stock: 8200,  price: 7.1,  trend: -1.1, status: 'Норма',   history: [8,7.8,7.7,7.6,7.5,7.4,7.3,7.2,7.1,7.1] },
  { id: 'fish',       name: 'Рыба',            category: 'Провизия',      icon: '🐟', stock: 320,   price: 22.5, trend: +9.8, status: 'Дефицит', history: [15,16,17,18,19,20,21,21.5,22,22.5] },
  { id: 'olive_oil',  name: 'Оливковое масло', category: 'Провизия',      icon: '🏺', stock: 1100,  price: 34.0, trend: +2.1, status: 'Норма',   history: [31,31.5,32,32.5,33,33.5,34,34,34,34] },
  { id: 'iron',       name: 'Железо',          category: 'Промышленность',icon: '⚙',  stock: 180,   price: 85.0, trend:+15.2, status: 'Дефицит', history: [40,48,55,60,65,70,75,79,82,85] },
  { id: 'timber',     name: 'Древесина',       category: 'Промышленность',icon: '🪵', stock: 3800,  price: 22.5, trend: +0.8, status: 'Норма',   history: [22,22.1,22.2,22.3,22.4,22.4,22.5,22.5,22.5,22.5] },
  { id: 'cloth',      name: 'Ткань',           category: 'Промышленность',icon: '🧵', stock: 2100,  price: 28.0, trend: -3.2, status: 'Норма',   history: [32,31.5,31,30.5,30,29.5,29,28.5,28,28] },
  { id: 'tools',      name: 'Инструменты',     category: 'Промышленность',icon: '🔨', stock: 950,   price: 36.5, trend: +1.4, status: 'Норма',   history: [34,34.5,35,35.5,36,36,36.5,36.5,36.5,36.5] },
  { id: 'wine',       name: 'Вино',            category: 'Роскошь',       icon: '🍷', stock: 210,   price: 48.5, trend: +9.3, status: 'Дефицит', history: [35,37,39,41,43,44,45,46,47,48.5] },
  { id: 'incense',    name: 'Благовония',      category: 'Роскошь',       icon: '🌸', stock: 90,    price: 91.0, trend: +2.8, status: 'Норма',   history: [85,86,87,88,89,89.5,90,90.5,91,91] },
  { id: 'purple_dye', name: 'Пурпур',          category: 'Роскошь',       icon: '💜', stock: 28,    price: 335,  trend: -1.5, status: 'Норма',   history: [350,348,346,344,342,341,340,338,336,335] },
];

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  bgMain:    'rgba(15,23,15,0.96)',
  bgCard:    'rgba(20,30,20,0.72)',
  bgGhost:   'rgba(255,255,255,0.025)',
  glass:     'rgba(18,27,18,0.85)',
  border:    'rgba(212,175,55,0.15)',
  borderAcc: 'rgba(212,175,55,0.38)',
  borderGrn: 'rgba(74,159,106,0.28)',
  gold:      '#D4AF37',
  copper:    '#B87333',
  ivory:     '#E5E4E2',
  ivoryDim:  'rgba(229,228,226,0.45)',
  ivoryFade: 'rgba(229,228,226,0.25)',
  green:     '#4a9f6a',
  greenGlow: 'rgba(74,159,106,0.35)',
  red:       '#e05555',
  redGlow:   'rgba(224,85,85,0.35)',
  blue:      '#5b9bd5',
  rose:      '#c87fa0',
};

const shadowCard =
  '0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(212,175,55,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)';
const shadowHover =
  '0 6px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,175,55,0.4), inset 0 1px 0 rgba(212,175,55,0.1)';

// ═══════════════════════════════════════════════════════════════════════════
// DATA ADAPTER — GAME_STATE → props shape
// ═══════════════════════════════════════════════════════════════════════════

const CAT_MAP = {
  food:     'Провизия',
  essential:'Провизия',
  material: 'Промышленность',
  luxury:   'Роскошь',
  labor:    'Роскошь',
};

function loadMarketData() {
  try {
    const nId    = window.GAME_STATE?.player_nation;
    const nation = window.GAME_STATE?.nations?.[nId];
    if (!nation || typeof window.GOODS === 'undefined') return MOCK_DATA;

    const stockpile    = nation.economy?.stockpile || {};
    const market       = window.GAME_STATE.market  || {};
    const avgInc       = typeof _avgIncomePerCap === 'function' ? _avgIncomePerCap(nation) : 0;

    return Object.entries(window.GOODS)
      .filter(([g]) => market[g] && g !== 'slaves')
      .map(([gId, def]) => {
        const mkt   = market[gId];
        const price = mkt.price ?? def.base_price;
        const ph    = Array.isArray(mkt.price_history) && mkt.price_history.length
                      ? mkt.price_history.slice(-12)
                      : [price];

        // Trend % over full history window
        const trend = ph.length >= 2
          ? +((ph[ph.length - 1] - ph[0]) / (ph[0] || 1) * 100).toFixed(1)
          : 0;

        // Market zone → status
        const ws  = mkt.world_stockpile ?? 0;
        const dem = Math.max(mkt.demand || 1, 1);
        const tgt = (def.stockpile_target_turns ?? 4) * dem;
        const status = ws < 0.5 * tgt ? 'Дефицит' : ws > 2 * tgt ? 'Избыток' : 'Норма';

        // Category
        const tier = typeof _goodTier === 'function' ? _goodTier(gId, avgInc) : 'standard';
        const cat  = CAT_MAP[def.category] || 'Промышленность';

        return {
          id: gId,
          name:     def.name,
          category: cat,
          icon:     def.icon || '📦',
          stock:    stockpile[gId] || 0,
          price,
          trend,
          status,
          history:  ph,
        };
      });
  } catch (e) {
    return MOCK_DATA;
  }
}

// Начальные значения богатства (зеркало POP_INITIAL_WEALTH из engine/pops.js)
const POP_WEALTH_DEFAULTS = {
  farmers:   15,
  craftsmen: 45,
  merchants: 65,
  sailors:   38,
  clergy:    55,
  soldiers:  35,
  slaves:     5,
};

function loadPopData() {
  try {
    const nation = window.GAME_STATE?.nations?.[window.GAME_STATE?.player_nation];
    if (!nation) return { pops: {}, byP: {}, hist: [], eco: {}, alert: false, name: '' };

    const byP  = nation.population?.by_profession || {};
    const raw  = nation.population?.pops          || {};

    // Если pops ещё не инициализированы движком (до первого хода),
    // создаём заглушки на основе by_profession + начальных весов богатства.
    const pops = {};
    for (const prof of Object.keys(byP)) {
      if ((byP[prof] || 0) < 10) continue;
      pops[prof] = raw[prof] || {
        income_last: 0,
        wealth:      POP_WEALTH_DEFAULTS[prof] ?? 25,
        satisfied:   0.75,
      };
    }

    return {
      pops,
      byP,
      hist:  nation.economy?.econ_history      || [],
      eco:   nation.economy                    || {},
      alert: !!nation.economy?._income_alert,
      name:  nation.name || '',
    };
  } catch (e) {
    return { pops: {}, byP: {}, hist: [], eco: {}, alert: false, name: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════

function fmt(n) {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'М';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'К';
  return Math.round(n).toLocaleString('ru');
}

function fmtPct(v, plus = true) {
  if (v == null) return '—';
  return (plus && v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function deltaColor(v) {
  if (v == null) return C.ivoryDim;
  if (v >  5) return C.green;
  if (v < -5) return C.red;
  return C.gold;
}

function smartSort(items) {
  return [...items].sort((a, b) => {
    const da = a.status === 'Дефицит' ? 0 : 1;
    const db = b.status === 'Дефицит' ? 0 : 1;
    if (da !== db) return da - db;
    return Math.abs(b.trend) - Math.abs(a.trend);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPARKLINE
// ═══════════════════════════════════════════════════════════════════════════

function Sparkline({ history, trend, width = 78, height = 30 }) {
  const uid = useId();
  if (!history || history.length < 2) {
    return <svg width={width} height={height} />;
  }

  const W = width, H = height, pad = 2;
  const mn = Math.min(...history);
  const mx = Math.max(...history);
  const range = mx - mn || 1;

  const pts = history.map((v, i) => {
    const x = pad + (i / (history.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - mn) / range) * (H - 2 * pad);
    return [x, y];
  });

  const linePoints = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // Area polygon: line pts + bottom-right + bottom-left
  const areaPoints = [
    ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${(W - pad).toFixed(1)},${H}`,
    `${pad},${H}`,
  ].join(' ');

  // Color: green = falling (good to buy), red = rising (price going up)
  const color = trend > 1.5 ? C.red : trend < -1.5 ? C.green : C.gold;
  const gid   = `sg${uid.replace(/:/g, '')}`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ overflow: 'visible', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon points={areaPoints} fill={`url(#${gid})`} />
      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last-point dot */}
      <circle
        cx={pts[pts.length - 1][0].toFixed(1)}
        cy={pts[pts.length - 1][1].toFixed(1)}
        r="2.2"
        fill={color}
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFICIT BADGE — animated pill
// ═══════════════════════════════════════════════════════════════════════════

function DeficitBadge() {
  return (
    <span className="eco-deficit-badge">
      ⚠ Дефицит
    </span>
  );
}

function SurplusBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '20px',
      fontSize: '9px', fontWeight: '700',
      letterSpacing: '0.5px', textTransform: 'uppercase',
      background: 'rgba(91,155,213,0.15)',
      border: '1px solid rgba(91,155,213,0.3)',
      color: '#5b9bd5',
      whiteSpace: 'nowrap',
    }}>
      ↑ Избыток
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE CARD — one row
// ═══════════════════════════════════════════════════════════════════════════

function ResourceCard({ item }) {
  const [hov, setHov] = useState(false);
  const isDeficit  = item.status === 'Дефицит';
  const isSurplus  = item.status === 'Избыток';
  const trendColor = item.trend > 1.5 ? C.red : item.trend < -1.5 ? C.green : C.gold;
  const trendIcon  = item.trend > 1.5 ? '▲' : item.trend < -1.5 ? '▼' : '▸';

  const cardStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    borderRadius: '8px',
    background: hov
      ? 'rgba(212,175,55,0.07)'
      : isDeficit
        ? 'rgba(224,85,85,0.05)'
        : C.bgGhost,
    border: hov
      ? `1px solid ${C.borderAcc}`
      : isDeficit
        ? '1px solid rgba(224,85,85,0.22)'
        : `1px solid ${C.border}`,
    boxShadow: hov ? shadowHover : isDeficit
      ? '0 2px 12px rgba(224,85,85,0.12)'
      : '0 2px 10px rgba(0,0,0,0.2)',
    transition: 'all 0.18s ease',
    cursor: 'default',
  };

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* LEFT: icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: '150px', flex: '0 0 150px' }}>
        <span style={{ fontSize: '22px', lineHeight: 1 }}>{item.icon}</span>
        <div>
          <div style={{ fontSize: '12px', color: C.ivory, fontWeight: '600', lineHeight: 1.2 }}>
            {item.name}
          </div>
          <div style={{ fontSize: '9.5px', color: C.ivoryDim, marginTop: '2px' }}>
            Запас: {fmt(item.stock)}
          </div>
        </div>
      </div>

      {/* CENTER: sparkline */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Sparkline history={item.history} trend={item.trend} />
      </div>

      {/* RIGHT: price + trend + badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        minWidth: '200px', flex: '0 0 200px', justifyContent: 'flex-end',
      }}>
        {/* Price */}
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '17px',
            fontFamily: "'Cinzel', 'Palatino Linotype', serif",
            color: C.gold,
            lineHeight: 1,
            letterSpacing: '0.5px',
          }}>
            {item.price.toFixed(1)}
          </div>
          <div style={{ fontSize: '9px', color: C.ivoryFade, marginTop: '1px' }}>gold</div>
        </div>

        {/* Trend % */}
        <div style={{
          color: trendColor,
          fontSize: '11px',
          fontFamily: 'sans-serif',
          minWidth: '56px',
          textAlign: 'right',
          fontWeight: '600',
        }}>
          {trendIcon} {Math.abs(item.trend).toFixed(1)}%
        </div>

        {/* Badge */}
        <div style={{ minWidth: '76px', display: 'flex', justifyContent: 'flex-end' }}>
          {isDeficit ? <DeficitBadge /> : isSurplus ? <SurplusBadge /> : null}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE CATEGORY — accordion section
// ═══════════════════════════════════════════════════════════════════════════

const CAT_META = {
  'Провизия':       { icon: '🌾', accentColor: '#4a9f6a' },
  'Промышленность': { icon: '⚙',  accentColor: '#B87333' },
  'Роскошь':        { icon: '💎', accentColor: '#c87fa0' },
};

function ResourceCategory({ category, items, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = CAT_META[category] || { icon: '📦', accentColor: C.gold };

  const sorted = useMemo(() => smartSort(items), [items]);

  const deficitCount = useMemo(() => items.filter(i => i.status === 'Дефицит').length, [items]);
  const avgTrend     = useMemo(
    () => items.reduce((s, i) => s + i.trend, 0) / (items.length || 1),
    [items]
  );

  const summaryText  = deficitCount > 0
    ? `${deficitCount} товар${deficitCount > 1 ? 'а' : ''} в дефиците`
    : avgTrend < -0.5 ? 'Баланс положителен' : 'Баланс в норме';
  const summaryColor = deficitCount > 0 ? C.red : C.green;

  const headerBg = open
    ? 'rgba(212,175,55,0.04)'
    : 'transparent';

  return (
    <div style={{
      marginBottom: '8px',
      borderRadius: '10px',
      overflow: 'hidden',
      border: `1px solid ${C.border}`,
      background: 'rgba(15,22,15,0.6)',
      backdropFilter: 'blur(14px) saturate(1.3)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(212,175,55,0.06)',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px',
          background: headerBg,
          border: 'none',
          borderBottom: open ? `1px solid ${C.border}` : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.07)'}
        onMouseLeave={e => e.currentTarget.style.background = headerBg}
      >
        <span style={{ fontSize: '20px', lineHeight: 1 }}>{meta.icon}</span>

        <div style={{ flex: 1 }}>
          <span style={{
            fontSize: '12.5px',
            fontFamily: "'Cinzel', serif",
            color: meta.accentColor,
            letterSpacing: '0.6px',
          }}>
            {category}
          </span>
          <span style={{
            fontSize: '9.5px',
            color: summaryColor,
            marginLeft: '12px',
            fontFamily: 'sans-serif',
          }}>
            {summaryText}
          </span>
        </div>

        <span style={{ fontSize: '10px', color: C.ivoryFade, marginRight: '6px' }}>
          {items.length} позиций
        </span>

        <span style={{
          fontSize: '13px',
          color: C.ivoryFade,
          display: 'inline-block',
          transition: 'transform 0.25s ease',
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>
          ▾
        </span>
      </button>

      {/* Items list */}
      {open && (
        <div style={{
          padding: '6px 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {sorted.map(item => (
            <ResourceCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK A — ТОВАРНАЯ БИРЖА
// ═══════════════════════════════════════════════════════════════════════════

function BlockA({ data }) {
  const catOrder = ['Провизия', 'Промышленность', 'Роскошь'];

  const grouped = useMemo(() => {
    const map = {};
    for (const item of data) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [data]);

  const cats = [
    ...catOrder.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !catOrder.includes(c)),
  ];

  return (
    <div>
      {cats.map((cat, i) => (
        <ResourceCategory
          key={cat}
          category={cat}
          items={grouped[cat]}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK B — ДОХОДЫ СОСЛОВИЙ
// ═══════════════════════════════════════════════════════════════════════════

const PROF_DISPLAY = {
  farmers:   { name: 'Крестьяне',    icon: '🌾' },
  craftsmen: { name: 'Ремесленники', icon: '🔨' },
  merchants: { name: 'Купцы',        icon: '💼' },
  sailors:   { name: 'Мореходы',     icon: '⚓' },
  clergy:    { name: 'Духовенство',  icon: '✝' },
  soldiers:  { name: 'Воины',        icon: '⚔' },
  slaves:    { name: 'Рабы',         icon: '⛓' },
};

function IncomeCard({ prof, pop, popSz, d1, d12, isAlert }) {
  const wealth = pop.wealth || 0;
  const income = pop.income_last || 0;
  const wColor = wealth >= 60 ? C.rose : wealth >= 30 ? C.blue : C.green;
  const meta   = PROF_DISPLAY[prof] || { name: prof, icon: '👤' };

  return (
    <div style={{
      background:      isAlert ? 'rgba(224,85,85,0.06)' : C.bgCard,
      backdropFilter:  'blur(14px) saturate(1.3)',
      border:          isAlert ? '1px solid rgba(224,85,85,0.35)' : `1px solid ${C.border}`,
      borderRadius:    '10px',
      padding:         '13px 14px',
      boxShadow:       shadowCard,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px' }}>
        <span style={{ fontSize: '22px', lineHeight: 1 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '11.5px',
            fontFamily: "'Cinzel', serif",
            color: C.gold,
          }}>
            {meta.name}
          </div>
          <div style={{ fontSize: '9px', color: C.ivoryDim }}>{fmt(popSz)} чел.</div>
        </div>
        {isAlert && (
          <span className="eco-alert-blink" style={{ color: C.red, fontSize: '14px' }}>⚠</span>
        )}
      </div>

      {/* Income value */}
      <div style={{
        fontSize:    '15px',
        fontFamily:  "'Cinzel', serif",
        color:       C.gold,
        marginBottom:'8px',
        lineHeight:   1,
      }}>
        {fmt(income)}
        <span style={{ fontSize: '9px', color: C.ivoryFade, fontFamily: 'sans-serif', marginLeft: '4px' }}>
          gold/тик
        </span>
      </div>

      {/* Wealth bar */}
      <div style={{
        background:  'rgba(255,255,255,0.07)',
        borderRadius:'3px',
        height:      '5px',
        marginBottom:'9px',
        overflow:    'hidden',
        boxShadow:   'inset 0 1px 2px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          width:      `${Math.round(wealth)}%`,
          height:     '5px',
          background: wColor,
          borderRadius:'3px',
          transition: 'width 0.4s ease',
          boxShadow:  `0 0 6px ${wColor}66`,
        }} />
      </div>

      {/* Delta rows */}
      {[
        ['Δ 1 тик',    d1,           false],
        ['Δ 12 тиков', d12,          false],
        ['Богатство',  wealth - 50,  true],
      ].map(([lbl, v, isWealth]) => (
        <div key={lbl} style={{
          display:        'flex',
          justifyContent: 'space-between',
          fontSize:       '9.5px',
          fontFamily:     'sans-serif',
          marginBottom:   '2px',
        }}>
          <span style={{ color: C.ivoryDim }}>{lbl}</span>
          <span style={{ color: deltaColor(v) }}>
            {v == null ? '—'
              : isWealth ? (wealth).toFixed(1)
              : fmtPct(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function BlockB() {
  const { pops, byP, hist, alert } = loadPopData();

  const getD = (prof, ticks) => {
    if (hist.length < 2) return null;
    const cur  = hist[hist.length - 1]?.pops?.[prof]?.income_last;
    const past = hist[Math.max(0, hist.length - 1 - ticks)]?.pops?.[prof]?.income_last;
    if (cur == null || past == null || past === 0) return null;
    return (cur - past) / past * 100;
  };

  const cards = Object.keys(PROF_DISPLAY).map(prof => {
    const pop   = pops[prof];
    const popSz = byP[prof] || 0;
    if (!pop || popSz < 10) return null;
    const d1 = getD(prof, 1);
    return (
      <IncomeCard
        key={prof}
        prof={prof}
        pop={pop}
        popSz={popSz}
        d1={d1}
        d12={getD(prof, 12)}
        isAlert={d1 != null && d1 < -20}
      />
    );
  }).filter(Boolean);

  return (
    <div>
      {alert && (
        <div style={{
          background:   'rgba(224,85,85,0.12)',
          border:       '1px solid rgba(224,85,85,0.4)',
          borderRadius: '8px',
          padding:      '9px 14px',
          marginBottom: '12px',
          fontSize:     '10.5px',
          color:        '#e07777',
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
        }}>
          <span style={{ fontSize: '14px' }}>⚠</span>
          Один или несколько классов потеряли более 20% дохода за прошедший тик!
        </div>
      )}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(195px,1fr))',
        gap:                 '8px',
      }}>
        {cards.length
          ? cards
          : <div style={{ padding: '24px', textAlign: 'center', color: C.ivoryFade, fontSize: '11px', fontStyle: 'italic', gridColumn: '1/-1' }}>
              Запустите несколько ходов для накопления статистики.
            </div>
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK C — КОРЗИНА ПОТРЕБЛЕНИЯ
// ═══════════════════════════════════════════════════════════════════════════

const TIER_CFG = {
  basic:    { label: 'Базовые товары',    color: C.green },
  standard: { label: 'Стандартные',       color: C.blue  },
  luxury:   { label: 'Роскошь',           color: C.rose  },
};

function BlockC() {
  const { pops, byP } = loadPopData();

  // pops уже содержит только профессии с byP >= 10 (loadPopData гарантирует)
  const availProfs = Object.keys(PROF_DISPLAY).filter(p =>
    (byP[p] || 0) >= 10 && p !== 'slaves'
  );

  const [selProf, setSelProf] = useState(null);
  const prof = (selProf && availProfs.includes(selProf)) ? selProf : (availProfs[0] || null);

  if (!prof) return (
    <div style={{ textAlign: 'center', padding: '30px', color: C.ivoryFade, fontSize: '11px', fontStyle: 'italic' }}>
      Нет данных о сословиях
    </div>
  );

  const pop    = pops[prof];
  const popSz  = byP[prof] || 0;
  const basket = typeof window.getConsumptionBasket === 'function'
    ? window.getConsumptionBasket(pop.wealth)
    : {};

  // Build tier breakdown
  const byTier = { basic: [], standard: [], luxury: [] };
  let totalCost = 0;

  for (const [gId, amtPer1k] of Object.entries(basket)) {
    const def   = window.GOODS?.[gId];
    const price = window.GAME_STATE?.market?.[gId]?.price ?? def?.base_price ?? 0;
    const cost  = amtPer1k * price;
    const tier  = _MC_TIER[def?.market_category] || 'standard';
    (byTier[tier] || byTier.standard).push({ gId, amtPer1k, price, cost, def });
    totalCost += cost;
  }

  const tierTotals = Object.fromEntries(
    Object.entries(byTier).map(([t, rows]) => [t, rows.reduce((s, r) => s + r.cost, 0)])
  );

  const totalGroup = totalCost * (popSz / 1000);
  const meta       = PROF_DISPLAY[prof] || { name: prof, icon: '👤' };

  return (
    <div>
      {/* Profession selector */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {availProfs.map(p => {
          const m  = PROF_DISPLAY[p];
          const on = p === prof;
          return (
            <button
              key={p}
              onClick={() => setSelProf(p)}
              style={{
                padding:    '4px 12px',
                borderRadius:'16px',
                fontSize:   '10px',
                cursor:     'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                background: on ? 'rgba(74,159,106,0.18)' : 'rgba(255,255,255,0.04)',
                border:     on ? '1px solid rgba(74,159,106,0.5)' : `1px solid ${C.border}`,
                color:      on ? '#a8d8b0' : C.ivoryDim,
              }}
            >
              {m.icon} {m.name}
            </button>
          );
        })}
      </div>

      {/* Hero card */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '14px',
        marginBottom:  '14px',
        padding:       '13px 16px',
        borderRadius:  '10px',
        background:    C.bgCard,
        backdropFilter:'blur(14px)',
        border:        `1px solid ${C.border}`,
        boxShadow:      shadowCard,
      }}>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontFamily: "'Cinzel', serif", color: C.gold }}>
            {meta.name}
          </div>
          <div style={{ fontSize: '9.5px', color: C.ivoryDim, marginTop: '2px' }}>
            {fmt(popSz)} чел. · Богатство {pop.wealth.toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '17px', fontFamily: "'Cinzel', serif", color: C.gold }}>
            {fmt(totalGroup)}
          </div>
          <div style={{ fontSize: '9px', color: C.ivoryFade }}>gold / тик</div>
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{
          display:      'flex',
          height:       '13px',
          borderRadius: '6px',
          overflow:     'hidden',
          background:   'rgba(255,255,255,0.06)',
          marginBottom: '6px',
          boxShadow:    'inset 0 1px 3px rgba(0,0,0,0.4)',
        }}>
          {Object.entries(tierTotals).map(([t, v]) => {
            if (v <= 0 || totalCost <= 0) return null;
            const pct = (v / totalCost * 100).toFixed(1);
            return (
              <div
                key={t}
                title={`${TIER_CFG[t].label}: ${pct}%`}
                style={{
                  width:     `${pct}%`,
                  minWidth:  '3px',
                  background: TIER_CFG[t].color,
                  transition:'width 0.3s ease',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '9px', color: C.ivoryDim, fontFamily: 'sans-serif' }}>
          {Object.entries(TIER_CFG).map(([t, cfg]) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
              {cfg.label}: {fmt(tierTotals[t])}
            </span>
          ))}
        </div>
      </div>

      {/* Detail groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(byTier).map(([tier, rows]) => {
          if (!rows.length) return null;
          const cfg     = TIER_CFG[tier];
          const tierSum = rows.reduce((s, r) => s + r.cost, 0);
          return (
            <div key={tier} style={{
              background:   C.bgGhost,
              borderRadius: '8px',
              padding:      '10px 12px',
              border:       `1px solid ${cfg.color}28`,
            }}>
              <div style={{
                fontSize:  '10px',
                fontWeight:'700',
                color:     cfg.color,
                display:   'flex',
                justifyContent: 'space-between',
                marginBottom:   '6px',
                letterSpacing:  '0.4px',
              }}>
                {cfg.label}
                <span style={{ fontWeight: 'normal', color: C.ivoryDim, fontSize: '9px' }}>
                  {fmt(tierSum)} gold
                </span>
              </div>
              {rows.map(r => (
                <div key={r.gId} style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '6px',
                  fontSize:   '10px',
                  fontFamily: 'sans-serif',
                  padding:    '3px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontSize: '12px' }}>{r.def?.icon || '📦'}</span>
                  <span style={{ flex: 1, color: 'rgba(229,228,226,0.78)' }}>{r.def?.name || r.gId}</span>
                  <span style={{ color: C.ivoryFade, fontSize: '9px' }}>{r.amtPer1k.toFixed(3)}/1К</span>
                  <span style={{ color: C.ivoryFade, fontSize: '9px', minWidth: '52px', textAlign: 'right' }}>
                    {r.price.toFixed(1)} g
                  </span>
                  <span style={{ color: cfg.color, fontWeight: '700', minWidth: '44px', textAlign: 'right' }}>
                    {fmt(r.cost)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK D — БАЛАНС КОШЕЛЬКА
// ═══════════════════════════════════════════════════════════════════════════

function BalanceRow({ prof, pop, popSz, hist, eco }) {
  const [hov, setHov] = useState(false);
  const meta   = PROF_DISPLAY[prof] || { name: prof, icon: '👤' };
  const income = pop.income_last || 0;

  const basket = typeof window.getConsumptionBasket === 'function'
    ? window.getConsumptionBasket(pop.wealth) : {};
  let expPer1k = 0;
  for (const [gId, amt] of Object.entries(basket)) {
    const p = window.GAME_STATE?.market?.[gId]?.price ?? window.GOODS?.[gId]?.base_price ?? 0;
    expPer1k += amt * p;
  }
  const expGroup = expPer1k * (popSz / 1000);
  const net      = income - expGroup;

  let wdelta = null;
  if (hist.length >= 2) {
    const c = hist[hist.length - 1]?.pops?.[prof]?.wealth;
    const p = hist[hist.length - 2]?.pops?.[prof]?.wealth;
    if (c != null && p != null) wdelta = c - p;
  }

  const sat    = pop.satisfied ?? 0.75;
  const netCol = net > 0 ? C.green : net < 0 ? C.red : C.gold;
  const wdCol  = wdelta == null ? C.ivoryDim : wdelta > 0 ? C.green : wdelta < 0 ? C.red : C.gold;
  const satCol = sat > 0.8 ? C.green : sat > 0.5 ? C.gold : C.red;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:       'grid',
        gridTemplateColumns: '145px 1fr 1fr 135px 95px 90px',
        alignItems:    'center',
        gap:           '10px',
        background:    C.bgCard,
        backdropFilter:'blur(12px)',
        border:        hov ? `1px solid ${C.borderAcc}` : `1px solid ${C.border}`,
        borderRadius:  '8px',
        padding:       '10px 14px',
        boxShadow:     hov ? shadowHover : shadowCard,
        transition:    'all 0.18s ease',
      }}
    >
      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <span style={{ fontSize: '18px' }}>{meta.icon}</span>
        <div>
          <div style={{ fontSize: '11px', fontFamily: "'Cinzel', serif", color: C.gold }}>{meta.name}</div>
          <div style={{ fontSize: '9px', color: C.ivoryFade }}>{fmt(popSz)}</div>
        </div>
      </div>
      {/* Income */}
      <div>
        <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Доход</div>
        <div style={{ fontSize: '12px', color: C.green, fontFamily: 'sans-serif', marginTop: '1px' }}>+{fmt(income)}</div>
      </div>
      {/* Expense */}
      <div>
        <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Расходы</div>
        <div style={{ fontSize: '12px', color: C.red, fontFamily: 'sans-serif', marginTop: '1px' }}>-{fmt(expGroup)}</div>
      </div>
      {/* Net */}
      <div>
        <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Прибыль</div>
        <div style={{ fontSize: '14px', fontFamily: "'Cinzel', serif", color: netCol, fontWeight: '700', marginTop: '1px' }}>
          {net >= 0 ? '+' : ''}{fmt(net)}
        </div>
      </div>
      {/* Wealth delta */}
      <div>
        <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Δ богатство</div>
        <div style={{ fontSize: '11px', color: wdCol, fontFamily: 'sans-serif', marginTop: '2px' }}>
          {wdelta == null ? '—' : `${wdelta > 0 ? '▲' : wdelta < 0 ? '▼' : '▸'} ${Math.abs(wdelta).toFixed(2)}`}
        </div>
      </div>
      {/* Satisfaction */}
      <div>
        <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Насыщение</div>
        <div style={{
          background:  'rgba(255,255,255,0.07)',
          borderRadius:'2px', height:'5px',
          margin:'4px 0 2px', overflow:'hidden',
        }}>
          <div style={{ width:`${sat*100}%`, height:'5px', background: satCol, transition:'width 0.3s', boxShadow:`0 0 5px ${satCol}66` }} />
        </div>
        <div style={{ fontSize: '9px', color: satCol, fontFamily: 'sans-serif' }}>{(sat*100).toFixed(0)}%</div>
      </div>
    </div>
  );
}

function BlockD() {
  const { pops, byP, hist, eco } = loadPopData();

  const delta = (eco.income_per_turn || 0) - (eco.expense_per_turn || 0);
  const dCol  = delta >= 0 ? C.green : C.red;

  const rows = Object.keys(PROF_DISPLAY).map(prof => {
    const pop   = pops[prof];
    const popSz = byP[prof] || 0;
    if (!pop || popSz < 10 || prof === 'slaves') return null;
    return <BalanceRow key={prof} prof={prof} pop={pop} popSz={popSz} hist={hist} eco={eco} />;
  }).filter(Boolean);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        {rows.length
          ? rows
          : <div style={{ padding: '20px', textAlign: 'center', color: C.ivoryFade, fontSize: '11px' }}>
              Нет данных
            </div>
        }
      </div>

      {/* Treasury footer */}
      <div style={{
        display:       'grid',
        gridTemplateColumns: '145px 1fr 1fr 135px',
        alignItems:    'center',
        gap:           '10px',
        background:    'rgba(74,159,106,0.07)',
        border:        '1px solid rgba(74,159,106,0.25)',
        borderRadius:  '8px',
        padding:       '10px 14px',
        backdropFilter:'blur(12px)',
        boxShadow:     'inset 0 1px 0 rgba(74,159,106,0.1)',
        marginTop:     '4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '18px' }}>🏛</span>
          <div>
            <div style={{ fontSize: '11px', fontFamily: "'Cinzel', serif", color: '#a8d8b0' }}>Казна</div>
            <div style={{ fontSize: '9px', color: C.ivoryFade }}>{fmt(eco.treasury || 0)} gold</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Доходы</div>
          <div style={{ fontSize: '12px', color: C.green, fontFamily: 'sans-serif', marginTop: '1px' }}>
            {(eco.income_per_turn > 0 ? '+' : '') + fmt(eco.income_per_turn || 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Расходы</div>
          <div style={{ fontSize: '12px', color: C.red, fontFamily: 'sans-serif', marginTop: '1px' }}>
            {(eco.expense_per_turn > 0 ? '-' : '') + fmt(eco.expense_per_turn || 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Баланс / тик</div>
          <div style={{ fontSize: '14px', fontFamily: "'Cinzel', serif", color: dCol, fontWeight: '700', marginTop: '1px' }}>
            {delta >= 0 ? '+' : ''}{fmt(delta)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HERO STRIP
// ═══════════════════════════════════════════════════════════════════════════

function HeroStrip({ eco }) {
  const metrics = [
    { label: 'Казна',        value: fmt(eco?.treasury || 0),                        unit: 'золото',  color: C.gold    },
    { label: 'Доход / тик',  value: (eco?.income_per_turn  > 0 ? '+' : '') + fmt(eco?.income_per_turn  || 0), unit: '', color: C.green  },
    { label: 'Расход / тик', value: (eco?.expense_per_turn > 0 ? '-' : '') + fmt(eco?.expense_per_turn || 0), unit: '', color: C.red    },
    { label: 'Налог',        value: `${((eco?.tax_rate || 0) * 100).toFixed(0)}%`,  unit: '',        color: C.copper  },
  ];

  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
      {metrics.map((m, i) => (
        <div key={i} style={{
          flex:        1,
          padding:     '11px 0',
          textAlign:   'center',
          borderRight: i < metrics.length - 1 ? `1px solid rgba(212,175,55,0.08)` : 'none',
        }}>
          <div style={{ fontSize: '8.5px', color: C.ivoryFade, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {m.label}
          </div>
          <div style={{
            fontSize:   '17px',
            fontFamily: "'Cinzel', serif",
            color:       m.color,
            margin:     '3px 0 1px',
            lineHeight: 1,
          }}>
            {m.value}
          </div>
          {m.unit && <div style={{ fontSize: '9px', color: C.ivoryFade }}>{m.unit}</div>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT — EconomyOverlay
// ═══════════════════════════════════════════════════════════════════════════

function EconomyOverlay({ onClose }) {
  const [tab,  setTab]  = useState('A');
  const [data, setData] = useState(() => loadMarketData());

  // Reload market data on tab switch to A
  useEffect(() => {
    if (tab === 'A') setData(loadMarketData());
  }, [tab]);

  const nationData = loadPopData();
  const hasAlert   = nationData.alert;

  const TABS = [
    { id: 'A', label: '📊 Биржа'   },
    { id: 'B', label: '💰 Доходы'  },
    { id: 'C', label: '🧺 Корзина' },
    { id: 'D', label: '⚖ Баланс'   },
  ];

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.84)',
        zIndex:          3100,
        display:         'flex',
        alignItems:      'flex-start',
        justifyContent:  'center',
        overflowY:       'auto',
        padding:         '24px 12px 48px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Outer container */}
      <div style={{
        width:          '920px',
        maxWidth:       '98vw',
        background:     C.bgMain,
        backdropFilter: 'blur(24px) saturate(1.5)',
        border:         `1px solid ${C.borderGrn}`,
        borderRadius:   '12px',
        boxShadow:      '0 28px 90px rgba(0,0,0,0.92), 0 0 0 1px rgba(74,159,106,0.06), inset 0 1px 0 rgba(74,159,106,0.09)',
      }}>

        {/* ── Header ── */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '12px',
          padding:      '16px 20px 14px',
          borderBottom: `1px solid ${C.borderGrn}`,
        }}>
          <span style={{ fontSize: '24px', lineHeight: 1 }}>💹</span>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize:      '16px',
              fontFamily:    "'Cinzel', 'Palatino Linotype', serif",
              color:         '#a8d8b0',
              letterSpacing: '0.8px',
            }}>
              Экономический обзор
            </div>
            <div style={{ fontSize: '11px', color: C.ivoryFade, marginTop: '2px' }}>
              {nationData.name || '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background:  'rgba(255,255,255,0.05)',
              border:      '1px solid rgba(255,255,255,0.14)',
              color:       C.ivoryDim,
              borderRadius:'7px',
              padding:     '5px 11px',
              cursor:      'pointer',
              fontSize:    '13px',
              fontFamily:  'inherit',
              transition:  'all 0.15s',
            }}
            onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = C.ivory; }}
            onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = C.ivoryDim; }}
          >
            ✕
          </button>
        </div>

        {/* ── Hero metrics ── */}
        <HeroStrip eco={nationData.eco} />

        {/* ── Tab bar ── */}
        <div style={{
          display:      'flex',
          gap:          '2px',
          padding:      '8px 16px 0',
          borderBottom: `1px solid ${C.borderGrn}`,
        }}>
          {TABS.map(t => {
            const active = tab === t.id;
            const alert  = t.id === 'B' && hasAlert;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background:   active ? 'rgba(74,159,106,0.14)' : 'rgba(255,255,255,0.03)',
                  border:       active ? '1px solid rgba(74,159,106,0.45)' : `1px solid ${C.borderGrn}`,
                  borderBottom: active ? '1px solid transparent' : `1px solid ${C.borderGrn}`,
                  color:        active ? '#a8d8b0' : C.ivoryDim,
                  borderRadius: '6px 6px 0 0',
                  padding:      '6px 18px',
                  fontSize:     '11px',
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  transition:   'all 0.15s',
                  marginBottom: '-1px',
                  position:     'relative',
                }}
              >
                {t.label}
                {alert && (
                  <span style={{
                    position: 'absolute', top: '2px', right: '3px',
                    fontSize: '8px', color: C.red,
                  }}>⚠</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <div style={{ padding: '14px 18px 24px', minHeight: '320px' }}>
          {tab === 'A' && <BlockA data={data} />}
          {tab === 'B' && <BlockB />}
          {tab === 'C' && <BlockC />}
          {tab === 'D' && <BlockD />}
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOUNT / REFRESH API — переопределяет стабы из economy_tab.js
// ═══════════════════════════════════════════════════════════════════════════

let _econReactRoot = null;
let _econRootEl    = null;

function _showEconomyOverlay() {
  const el = document.getElementById('economy-overlay');
  if (!el) return;
  el.classList.remove('hidden');

  if (!_econReactRoot || _econRootEl !== el) {
    _econRootEl    = el;
    _econReactRoot = ReactDOM.createRoot(el);
  }
  _econReactRoot.render(
    React.createElement(EconomyOverlay, { onClose: _hideEconomyOverlay })
  );
}

function _hideEconomyOverlay() {
  const el = document.getElementById('economy-overlay');
  if (el) el.classList.add('hidden');
}

function _refreshEconomyTab() {
  const el = document.getElementById('economy-overlay');

  // Update alert badge on the trigger button
  const nation = typeof _econNation === 'function' ? _econNation() : null;
  const btn    = document.getElementById('eco-open-btn');
  if (btn) btn.classList.toggle('eco-btn-alert', !!(nation?.economy?._income_alert));

  if (!el || el.classList.contains('hidden') || !_econReactRoot) return;
  _econReactRoot.render(
    React.createElement(EconomyOverlay, { onClose: _hideEconomyOverlay })
  );
}

// Expose to global scope (needed because Babel strict-mode scopes functions locally)
window.showEconomyOverlay  = _showEconomyOverlay;
window.hideEconomyOverlay  = _hideEconomyOverlay;
window.refreshEconomyTab   = _refreshEconomyTab;
