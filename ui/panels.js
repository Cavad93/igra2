// Боковые панели — статистика нации и двор

// ──────────────────────────────────────────────────────────────
// ЛЕВАЯ ПАНЕЛЬ — статистика игрока (Шаг 23: вкладки-иконки)
// ──────────────────────────────────────────────────────────────

// Текущая активная вкладка левой панели. Значения:
// 'overview' | 'army' | 'economy' | 'diplomacy' | 'laws'
let _currentLeftTab = 'overview';

export function renderLeftPanel() {
  const panel = document.getElementById('left-panel');
  if (!panel || !GAME_STATE) return;

  const nationId = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Контент рендерится в #left-panel-content (Шаг 23).
  // Если контейнер отсутствует (старая HTML-структура), пишем в сам #left-panel
  // для обратной совместимости.
  _renderLeftPanelContent();

  // Шаг 21: после каждой перерисовки левой панели обновляем и топ-бар ресурсов
  try { updateResourceBar(GAME_STATE); } catch (e) { console.error('updateResourceBar error:', e); }

  // Шаг 26: обновляем бейджи-алерты на иконках-вкладках
  try { updateAlertBadges(GAME_STATE); } catch (e) { console.error('updateAlertBadges error:', e); }
}

// Сбор HTML всех секций; активная вкладка определяет, какие из них отрисовываются.
function _buildLeftPanelSections(nation, nationId) {
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

  const ruler = `
    <!-- ПРАВИТЕЛЬ -->
    <div class="panel-section ruler-section">
      <div class="ruler-name"><span class="icon-wrap" data-icon="court"></span> ${rulerName}</div>
      <div class="ruler-sub">${govTypeName} · ${nation.name}</div>
      <div class="grandeur-display" style="color:var(--gold,#c8a84b);font-size:12px;margin:4px 0 2px;">✦ Величие: <span id="grandeur-value">${typeof calcGrandeur === 'function' ? calcGrandeur(nationId) : 0}</span></div>
      <div id="manifest-display" style="font-style:italic;font-size:11px;color:var(--text-dim);margin:2px 0 4px;display:${GAME_STATE.player_manifest?.text ? '' : 'none'}">${GAME_STATE.player_manifest?.text ? `«${GAME_STATE.player_manifest.text}»` : ''}</div>
      <div class="legitimacy-bar">
        <span class="stat-label">Легитимность</span>
        <div class="bar-container">
          <div class="bar-fill legitimacy-fill" style="width:${gov.legitimacy ?? 0}%"></div>
        </div>
        <span class="stat-value">${(gov.legitimacy ?? 0).toFixed(1)}%</span>
      </div>
      <button class="gov-open-btn" data-action="showGovernmentOverlay">
        <span class="icon-wrap" data-icon="court"></span> Управление государством ▸
      </button>
      <button class="gov-open-btn" style="margin-top:4px" data-action="showPopulationOverlay">
        <span class="icon-wrap" data-icon="population"></span> Структура общества ▸
      </button>
      <button class="gov-open-btn" id="eco-open-btn" style="margin-top:4px" data-action="showEconomyOverlay">
        <span class="icon-wrap" data-icon="economy"></span> Экономический обзор ▸
      </button>
      <button class="gov-open-btn" style="margin-top:4px" data-action="showTreasuryOverlay">
        <span class="icon-wrap" data-icon="gold"></span> Казна и налоги ▸
      </button>
      <button class="gov-open-btn" style="margin-top:4px" data-action="showVowsModal">
        <span class="icon-wrap" data-icon="army"></span> Клятвы ▸
      </button>
      <button class="gov-open-btn" style="margin-top:4px" data-action="showChronicleModal">
        <span class="icon-wrap" data-icon="chronicle"></span> Открыть летопись ▸
      </button>
      ${(gov.ruler?.age ?? 0) >= 60 ? `
      <button class="gov-open-btn" style="margin-top:4px;border-color:var(--gold,#c8a84b)" data-action="showTestamentModal">
        <span class="icon-wrap" data-icon="laws"></span> Завещание ▸
      </button>` : ''}
    </div>
    <!-- Динамические цели -->
    <div id="dynamic-goals-block"></div>
  `;

  const treasury = `
    <!-- КАЗНА -->
    <div class="panel-section">
      <div class="section-title"><span class="icon-wrap" data-icon="gold"></span> Казна</div>
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
  `;

  const population = `
    <!-- НАСЕЛЕНИЕ -->
    <div class="panel-section">
      <div class="section-title"><span class="icon-wrap" data-icon="population"></span> Население</div>
      ${renderPopMiniWidget(pop)}
    </div>
  `;

  const army = `
    <!-- АРМИЯ -->
    <div class="panel-section">
      <div class="section-title"><span class="icon-wrap" data-icon="army"></span> Армия</div>
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
  `;

  const culture = `
    <!-- КУЛЬТУРА -->
    <div class="panel-section">
      <div class="section-title">🎭 Культура</div>
      ${renderCulturePanel(nationId)}
      <button class="cw-btn-open" data-action="openCultureWindow" data-arg="${nationId}">📊 Подробнее о культурах</button>
    </div>
  `;

  const religion = `
    <!-- РЕЛИГИЯ -->
    <div class="panel-section">
      <div class="section-title">⛪ Религия</div>
      ${typeof renderReligionPanel === 'function' ? renderReligionPanel(nationId) : '<div class="no-data">Нет данных</div>'}
      <button class="cw-btn-open" data-action="openReligionWindow" data-arg="${nationId}">⛪ Подробнее о религиях</button>
    </div>
  `;

  const diplomacy = `
    <!-- ДИПЛОМАТИЯ -->
    <div class="panel-section">
      <div class="section-title"><span class="icon-wrap" data-icon="diplomacy"></span> Дипломатия</div>
      ${renderRelations(nation.relations)}
    </div>
  `;

  const laws = `
    <!-- ЗАКОНЫ -->
    <div class="panel-section">
      <div class="section-title"><span class="icon-wrap" data-icon="laws"></span> Законы <span class="laws-count">${(nation.active_laws || []).length}</span></div>
      ${renderLaws(nation.active_laws)}
    </div>
  `;

  return { ruler, treasury, population, army, culture, religion, diplomacy, laws };
}

// Заполняет #left-panel-content в соответствии с текущей вкладкой _currentLeftTab.
function _renderLeftPanelContent() {
  if (!GAME_STATE) return;
  const nationId = GAME_STATE.player_nation;
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;

  // Контейнер контента. Если его нет — fallback к #left-panel
  const contentEl =
    document.getElementById('left-panel-content') ||
    document.getElementById('left-panel');
  if (!contentEl) return;

  const s = _buildLeftPanelSections(nation, nationId);

  let html = '';
  switch (_currentLeftTab) {
    case 'army':
      html = s.army;
      break;
    case 'economy':
      html = s.treasury + s.population;
      break;
    case 'diplomacy':
      html = s.diplomacy;
      break;
    case 'laws':
      html = s.laws;
      break;
    case 'overview':
    default:
      html = s.ruler + s.culture + s.religion;
      break;
  }
  contentEl.innerHTML = html;
}

// Переключает активную вкладку левой панели: обновляет подсветку кнопок
// в #left-nav и перерисовывает содержимое в #left-panel-content.
export function renderLeftPanelTab(tabName) {
  _currentLeftTab = tabName;

  // Переключаем active-класс у иконок-вкладок
  const nav = document.getElementById('left-nav');
  if (nav && typeof nav.querySelectorAll === 'function') {
    const btns = nav.querySelectorAll('.lnav-btn');
    btns.forEach(b => {
      const t = b.getAttribute ? b.getAttribute('data-tab') : null;
      if (t === tabName) {
        if (b.classList && b.classList.add) b.classList.add('active');
      } else {
        if (b.classList && b.classList.remove) b.classList.remove('active');
      }
    });
  }

  // Шаг 26: при открытии вкладки скрываем её бейдж-алерт
  try { _hideAlertBadge(tabName); } catch (e) {}

  _renderLeftPanelContent();
}

// Экспорт в window — чтобы inline onclick в index.html видел функцию.
if (typeof window !== 'undefined') {
}

// ──────────────────────────────────────────────────────────────
// Шаг 21 — РЕСУРС-БАР В ТОП-БАРЕ
// ──────────────────────────────────────────────────────────────

// Хранилище предыдущих значений для расчёта дельты между ходами.
// Обновляется ТОЛЬКО при смене GAME_STATE.turn — чтобы повторные вызовы
// renderLeftPanel внутри одного хода не затирали показанную дельту.
const _resourceBarPrev = { gold: null, troops: null, food: null, pop: null, _turn: null };

// Шаг 16 (uisuper) — последние зафиксированные дельты для аквидукта.
// Пересчитываются только при смене хода, чтобы частицы не «мигали» в рамках одного хода.
const _aquaLastDelta = { gold: 0, troops: 0, food: 0, pop: 0 };

function _formatResBarNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = Math.round(n);
  const abs = Math.abs(v);
  if (abs >= 1000000) return (v / 1000000).toFixed(1) + 'М';
  if (abs >= 10000)   return Math.round(v / 1000) + 'К';
  return v.toLocaleString('ru-RU');
}

function _sumFoodStockpile(stockpile) {
  if (!stockpile) return 0;
  // Основные продовольственные товары: пшеница, рыба, мясо, оливки, вино
  const foods = ['wheat', 'fish', 'meat', 'olives', 'wine', 'fruit', 'bread'];
  let total = 0;
  for (const k of foods) {
    if (typeof stockpile[k] === 'number') total += stockpile[k];
  }
  // fallback: если ничего не нашли — суммируем всё, что выглядит как еда
  if (total === 0 && typeof stockpile === 'object') {
    total = stockpile.wheat || 0;
  }
  return total;
}

function _collectResourceValues(state) {
  if (!state) return null;
  const nationId = state.player_nation;
  const nation   = state.nations?.[nationId];
  if (!nation) return null;
  const economy  = nation.economy  || {};
  const military = nation.military || {};
  const pop      = nation.population || {};

  const troops = (military.infantry  || 0)
               + (military.cavalry   || 0)
               + (military.ships     || 0)
               + (military.mercenaries || 0);

  return {
    gold:   Math.round(economy.treasury || 0),
    troops: Math.round(troops),
    food:   Math.round(_sumFoodStockpile(economy.stockpile)),
    pop:    Math.round(pop.total || 0),
  };
}

function _applyResourceDelta(key, curr) {
  const deltaEl = document.querySelector(`#res-${key} .res-delta`);
  if (!deltaEl) return;
  const prev = _resourceBarPrev[key];
  if (prev === null || prev === undefined || prev === curr) {
    deltaEl.textContent = '';
    deltaEl.classList.remove('positive', 'negative');
    return;
  }
  const d = curr - prev;
  if (d === 0) { deltaEl.textContent = ''; return; }
  const sign = d > 0 ? '+' : '';
  // Шаг 46 — стрелка тренда рядом с числом: "+45 ↗" / "-12 ↘"
  // (arrow идёт ПОСЛЕ числа, чтобы сохранить совместимость с тестами Шага 21,
  // которые ожидают, что .res-delta.textContent начинается с "+" или "-")
  const arrow = d > 0 ? ' ↗' : ' ↘';
  deltaEl.textContent = sign + _formatResBarNum(d) + arrow;
  deltaEl.classList.toggle('positive', d > 0);
  deltaEl.classList.toggle('negative', d < 0);
}

export function updateResourceBar(state) {
  const values = _collectResourceValues(state);
  if (!values) return;

  const setVal = (id, v) => {
    const el = document.querySelector(`#${id} > span:first-of-type`);
    if (el) el.textContent = _formatResBarNum(v);
  };
  setVal('res-gold',   values.gold);
  setVal('res-troops', values.troops);
  setVal('res-food',   values.food);
  setVal('res-pop',    values.pop);

  const currentTurn = state?.turn ?? 0;
  const prevTurn    = _resourceBarPrev._turn;

  // Дельту обновляем только при смене хода:
  // - при первом вызове (prevTurn === null) — инициализируем baseline без дельты
  // - при смене хода — показываем дельту и сдвигаем baseline
  // - при повторных вызовах внутри одного хода — делтбу не трогаем (чтобы не стёрлась)
  if (prevTurn === null) {
    for (const key of ['gold', 'troops', 'food', 'pop']) {
      _resourceBarPrev[key] = values[key];
      _aquaLastDelta[key]   = 0;
    }
    _resourceBarPrev._turn = currentTurn;
    // Очистить badge-и на первой отрисовке
    for (const key of ['gold', 'troops', 'food', 'pop']) {
      const el = document.querySelector(`#res-${key} .res-delta`);
      if (el) { el.textContent = ''; el.classList.remove('positive', 'negative'); }
    }
  } else if (prevTurn !== currentTurn) {
    for (const key of ['gold', 'troops', 'food', 'pop']) {
      const prevVal = _resourceBarPrev[key];
      _applyResourceDelta(key, values[key]);
      _aquaLastDelta[key] = (typeof prevVal === 'number')
        ? (values[key] - prevVal)
        : 0;
      _resourceBarPrev[key] = values[key];
    }
    _resourceBarPrev._turn = currentTurn;
  }
  // Иначе (повторный рендер в том же ходу) — просто оставляем дельту как есть.

  // Шаг 46 — спарклайны трендов ресурсов
  try { _renderResourceSparklines(state); } catch (e) { /* noop в тестах */ }

  // ЭТАП 16 (uisuper) — подкормить радиальный аквидукт свежими цифрами.
  try {
    if (typeof window !== 'undefined' && window.AquaWidget) {
      window.AquaWidget.update({
        gold:        values.gold,
        troops:      values.troops,
        food:        values.food,
        pop:         values.pop,
        deltaGold:   _aquaLastDelta.gold,
        deltaTroops: _aquaLastDelta.troops,
        deltaFood:   _aquaLastDelta.food,
        deltaPop:    _aquaLastDelta.pop,
      });
    }
  } catch (e) { /* noop в тестах */ }
}

// ──────────────────────────────────────────────────────────────
// Шаг 46 — СПАРКЛАЙНЫ ТРЕНДОВ В РЕСУРС-БАРЕ
// ──────────────────────────────────────────────────────────────
//
// У каждого .res-item есть <canvas class="res-sparkline" width="44" height="14">,
// в котором рисуется мини-график истории за последние 10 ходов.
// Источник данных: GAME_STATE.history.{treasury,army_size,population,food}.
// Наполнение истории — _pushResourceHistory(state), вызывается раз за ход
// из engine/turn.js после _recordTurnSummary().

// Максимум точек, хранимых в истории каждого ресурса.
const _RES_HISTORY_MAX = 10;

// Соответствие ключ-ресурса (как в updateResourceBar) → ключ в GAME_STATE.history
const _RES_HISTORY_KEYS = {
  gold:   'treasury',
  troops: 'army_size',
  food:   'food',
  pop:    'population',
};

/**
 * _pushResourceHistory(state)
 *
 * Обновляет GAME_STATE.history.{treasury, army_size, population, food}
 * значениями игрока на текущем ходу. Обрезает каждый массив до
 * _RES_HISTORY_MAX элементов. Создаёт state.history, если его нет.
 *
 * Вызывается из engine/turn.js после _recordTurnSummary() — т.е.
 * ровно один раз за ход.
 */
function _pushResourceHistory(state) {
  if (!state) return;
  const values = _collectResourceValues(state);
  if (!values) return;

  if (!state.history || typeof state.history !== 'object') {
    state.history = { treasury: [], army_size: [], population: [], food: [] };
  }
  const H = state.history;
  for (const arr of ['treasury', 'army_size', 'population', 'food']) {
    if (!Array.isArray(H[arr])) H[arr] = [];
  }
  H.treasury.push(values.gold);
  H.army_size.push(values.troops);
  H.food.push(values.food);
  H.population.push(values.pop);

  for (const arr of ['treasury', 'army_size', 'population', 'food']) {
    while (H[arr].length > _RES_HISTORY_MAX) H[arr].shift();
  }
}

/**
 * drawSparkline(canvas, values, color)
 *
 * Рисует мини-график по массиву values на HTMLCanvasElement 44×14.
 *   - values нормализуются в [0, 1] внутри их собственного диапазона
 *   - проводится полилиния через все точки
 *   - последняя точка отмечается кружком
 *   - color — hex-строка цвета линии (#4CAF50 / #f44336 / #888)
 *
 * Если values содержит < 2 точек — просто очищает canvas.
 * Если canvas или его getContext недоступны (headless) — функция
 * тихо завершает работу.
 */
export function drawSparkline(canvas, values, color) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width  || 44;
  const H = canvas.height || 14;

  // Полная очистка
  if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, W, H);

  if (!Array.isArray(values) || values.length < 2) return;

  // Нормализация: min..max → [pad, H - pad]
  let minV = Infinity, maxV = -Infinity;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;

  const pad = 2;
  const usableH = H - pad * 2;
  const usableW = W - pad * 2;
  const range = (maxV - minV) || 1;   // избегаем деления на 0 при плоской линии

  const n = values.length;
  // Координата X — равномерное распределение
  const xAt = (i) => pad + (n === 1 ? usableW / 2 : (i * usableW) / (n - 1));
  // Координата Y — инверсия: большее значение выше на графике
  const yAt = (v) => pad + usableH - ((v - minV) / range) * usableH;

  ctx.lineWidth   = 1.5;
  ctx.strokeStyle = color || '#c8a84b';
  ctx.fillStyle   = color || '#c8a84b';
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';

  // Полилиния
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(values[0]));
  for (let i = 1; i < n; i++) {
    ctx.lineTo(xAt(i), yAt(values[i]));
  }
  ctx.stroke();

  // Маркер последней точки
  const lastX = xAt(n - 1);
  const lastY = yAt(values[n - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * _sparklineColor(values)
 *
 * Определяет цвет спарклайна по тренду:
 *   зелёный — последнее > предпоследнего
 *   красный — последнее < предпоследнего
 *   серый   — без изменения / недостаточно точек
 */
function _sparklineColor(values) {
  if (!Array.isArray(values) || values.length < 2) return '#888';
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (typeof last !== 'number' || typeof prev !== 'number') return '#888';
  if (last > prev) return '#4CAF50';
  if (last < prev) return '#f44336';
  return '#888';
}

/**
 * _renderResourceSparklines(state)
 *
 * Для каждого из 4-х ключей (gold/troops/food/pop) находит canvas.res-sparkline
 * и рисует спарклайн по соответствующему массиву state.history.*.
 * Если истории нет или она пуста — canvas очищается.
 */
function _renderResourceSparklines(state) {
  if (typeof document === 'undefined') return;
  const hist = state?.history;
  for (const key of ['gold', 'troops', 'food', 'pop']) {
    const el = document.querySelector(`#res-${key} .res-sparkline`);
    if (!el) continue;
    const arrKey = _RES_HISTORY_KEYS[key];
    const series = (hist && Array.isArray(hist[arrKey])) ? hist[arrKey] : [];
    const color = _sparklineColor(series);
    drawSparkline(el, series, color);
  }
}

export function onResourceBarClick(key) {
  switch (key) {
    case 'gold':
      if (typeof showTreasuryOverlay === 'function') showTreasuryOverlay();
      break;
    case 'troops':
      // Нет выделенного оверлея армий — переключаемся на вкладку "Армия"
      // в левой панели (Шаг 23).
      try {
        if (typeof renderLeftPanelTab === 'function') {
          renderLeftPanelTab('army');
        }
      } catch (e) {}
      break;
    case 'food':
      if (typeof showEconomyOverlay === 'function') showEconomyOverlay();
      break;
    case 'pop':
      if (typeof showPopulationOverlay === 'function') showPopulationOverlay();
      break;
  }
}

// Экспорт в window для доступа из inline onclick и из других модулей
if (typeof window !== 'undefined') {
  // Шаг 46
}

// ──────────────────────────────────────────────────────────────
// Шаг 26 — ЗНАЧКИ-АЛЕРТЫ НА ВКЛАДКАХ ЛЕВОЙ ПАНЕЛИ
// ──────────────────────────────────────────────────────────────
//
// Индикатор на иконке вкладки показывает что требует внимания:
//   💰 economy   — дефицит казны (treasury < 0) → '!'
//   ⚔  army     — армии без активного приказа → количество
//   🤝 diplomacy — входящие дипломатические предложения → количество
//   📜 laws     — идёт голосование → '!'
//
// Функция updateAlertBadges(state) вызывается после каждого хода.
// При открытии вкладки (renderLeftPanelTab) бейдж этой вкладки скрывается.

function _setAlertBadge(tab, value) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || typeof doc.getElementById !== 'function') return;
  const el = doc.getElementById('badge-' + tab);
  if (!el) return;

  // Пустое / нулевое значение → скрыть бейдж
  const hide =
       value === null
    || value === undefined
    || value === 0
    || value === '0'
    || value === ''
    || value === false;

  if (hide) {
    if (el.style) el.style.display = 'none';
    el.textContent = '';
    return;
  }

  let text = String(value);
  // Ограничиваем большие числа для читабельности
  if (typeof value === 'number' && value > 99) text = '99+';

  el.textContent = text;
  if (el.style) el.style.display = 'flex';
}

function _countArmiesWithoutOrders(state, nationId) {
  const armies = (state && Array.isArray(state.armies) ? state.armies : [])
    .filter(a => a && a.nation === nationId && a.state !== 'disbanded');
  if (!armies.length) return 0;

  const activeOrders = (state && Array.isArray(state.orders) ? state.orders : [])
    .filter(o => o && o.status === 'active' && o.army_id != null);
  const busyIds = new Set(activeOrders.map(o => o.army_id));

  let count = 0;
  for (const a of armies) {
    if (!busyIds.has(a.id)) count++;
  }
  return count;
}

function _countIncomingProposals(state, nationId) {
  if (!state) return 0;
  let count = 0;

  // Главный источник: GAME_STATE.diplomatic_proposals[]
  const proposals = Array.isArray(state.diplomatic_proposals)
    ? state.diplomatic_proposals
    : [];
  for (const p of proposals) {
    if (!p) continue;
    if (p.to !== nationId) continue;
    const status = p.status || 'pending';
    if (status === 'pending') count++;
  }

  // Дополнительный источник: nation.incoming_proposals[]
  const nation = state.nations?.[nationId];
  if (nation && Array.isArray(nation.incoming_proposals)) {
    for (const p of nation.incoming_proposals) {
      if (!p) continue;
      const status = p.status || 'pending';
      if (status === 'pending') count++;
    }
  }

  return count;
}

function _isLawVotingActive(state, nationId) {
  if (!state) return false;
  // Глобальный флаг голосования
  if (state.law_voting && state.law_voting.active) return true;
  if (state.active_vote && state.active_vote.law)  return true;

  const nation = state.nations?.[nationId];
  if (nation) {
    if (nation.pending_law_vote) return true;
    if (Array.isArray(nation.pending_laws) && nation.pending_laws.length > 0) return true;
    if (nation.law_vote_active) return true;
  }
  return false;
}

export function updateAlertBadges(state) {
  if (!state) return;
  const nationId = state.player_nation;
  const nation   = state.nations?.[nationId];
  if (!nation) return;

  // economy: дефицит казны
  const treasury = nation.economy?.treasury ?? 0;
  _setAlertBadge('economy', treasury < 0 ? '!' : 0);

  // army: армии без приказа
  const idle = _countArmiesWithoutOrders(state, nationId);
  _setAlertBadge('army', idle);

  // diplomacy: входящие предложения
  const proposals = _countIncomingProposals(state, nationId);
  _setAlertBadge('diplomacy', proposals);

  // laws: идёт голосование
  _setAlertBadge('laws', _isLawVotingActive(state, nationId) ? '!' : 0);
}

function _hideAlertBadge(tab) {
  _setAlertBadge(tab, 0);
}

// Экспорт в window для доступа из inline onclick и тестов
if (typeof window !== 'undefined') {
}

export function renderPopMiniWidget(pop) {
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

export function renderProfessions(profs) {
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

export function renderCulturePanel(nationId) {
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

export function renderReligionPanel(nationId) {
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

export function formatBonusName(key) {
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

export function openCultureWindow(nationId) {
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

export function closeCultureWindow() {
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
          <button class="cw-close" data-action="closeCultureWindow">✕</button>
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
          <button class="cw-close" data-action="closeCultureWindow">✕</button>
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
        data-action="showDiplomacyOverlay" data-arg="${n.id}"
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
    // MIL_010: War score mini-bar for nations at war
    let warScoreHtml = '';
    if (atWar && typeof WarScoreEngine !== 'undefined') {
      const ws = WarScoreEngine.getWarScore(playerNationId, nId);
      const wsTotal = Math.max(1, ws.player + ws.opponent);
      const wsPct   = Math.round((ws.player / wsTotal) * 100);
      const wsLead  = ws.player > ws.opponent ? 'color:#4caf50' : ws.player < ws.opponent ? 'color:#f44336' : 'color:#9e9e9e';
      warScoreHtml = `<div class="diplo-war-score-bar" title="Военные очки: ${ws.player} vs ${ws.opponent}" style="margin-top:3px">
        <div style="display:flex;align-items:center;gap:4px;font-size:11px">
          <span style="${wsLead};font-weight:700">⚔${ws.player}</span>
          <div style="flex:1;height:5px;background:#333;border-radius:3px;overflow:hidden">
            <div style="width:${wsPct}%;height:100%;background:#e53935;border-radius:3px"></div>
          </div>
          <span style="color:#9e9e9e">⚔${ws.opponent}</span>
        </div>
      </div>`;
    }
    const warBadge = atWar ? '<span class="diplo-war-dot">⚔</span>' : '';

    return `<div class="diplo-rel-row" data-action="showDiplomacyOverlay" data-arg="${nId}" title="Открыть переговоры">
      <div class="diplo-rel-left">
        <span class="diplo-rel-flag">${nation.flag_emoji ?? '🏛'}</span>
        <div class="diplo-rel-info">
          <span class="diplo-rel-name">${nation.name}</span>
          ${treatyIcons ? `<span class="diplo-rel-icons">${treatyIcons}</span>` : ''}
          ${warScoreHtml}
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
    <button class="diplo-open-btn" data-action="showDiplomacyOverlay">
<span class="icon-wrap" data-icon="diplomacy"></span> Зал переговоров ▸
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

function _uiDeclareWarWithCheck(targetNationId) {
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
    `💔 Пакт о ненападении с ${targetNation.name} нарушен! Репутация ${breakerNation.name} падает во всём мире.`,
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
// ПРАВАЯ ПАНЕЛЬ — двор (Шаг 43: должности)
// ──────────────────────────────────────────────────────────────

// Шаг 43 — список должностей при дворе
const COURT_POSITIONS = [
  { id: 'strategos', icon: 'army',      title: 'Стратег',   bonus: '+армия',     skill: 'ambition',   prefRole: 'general'  },
  { id: 'treasurer', icon: 'gold',      title: 'Казначей',  bonus: '+доход',     skill: 'greed',      prefRole: 'merchant' },
  { id: 'envoy',     icon: 'diplomacy', title: 'Посол',     bonus: '+дипломатия',skill: 'caution',    prefRole: 'advisor'  },
  { id: 'chancellor',icon: 'laws',      title: 'Советник',  bonus: '+политика',  skill: 'piety',      prefRole: 'priest'   },
];
// Хелпер для отрисовки иконки должности (используется в слотах/модалах).
function _posIconHtml(name) {
  return '<span class="icon-wrap" data-icon="'+name+'"></span>';
}

function _getCourtPositions(nation) {
  if (!nation.court_positions) {
    nation.court_positions = {};
    for (const p of COURT_POSITIONS) nation.court_positions[p.id] = null;
  }
  // Гарантируем наличие всех ключей (на случай обновления списка должностей)
  for (const p of COURT_POSITIONS) {
    if (!(p.id in nation.court_positions)) nation.court_positions[p.id] = null;
  }
  return nation.court_positions;
}

// Очистить должность, если её носитель умер или исчез
function _cleanupCourtPositions(nation) {
  const positions = _getCourtPositions(nation);
  const aliveIds = new Set((nation.characters || []).filter(c => c.alive).map(c => c.id));
  for (const pid of Object.keys(positions)) {
    if (positions[pid] && !aliveIds.has(positions[pid])) positions[pid] = null;
  }
}

function _candidateScore(char, posDef) {
  let score = 0;
  if (char.role === posDef.prefRole) score += 30;
  const traits = char.traits || {};
  score += traits[posDef.skill] || 0;
  // Лояльность всегда даёт небольшой бонус — ненадёжный человек на должности опасен
  score += (traits.loyalty || 0) * 0.2;
  return Math.round(score);
}

// ──────────────────────────────────────────────────────────────
// uisuper Этапы 23/24 — COURT BOARD (EU4/Imperator)
// Единый паттерн: коллегия (2×2 крупных камей) сверху + «Зал
// заседаний» (divider, drop-target для unassign) + roster со
// всеми свободными персонажами снизу. Drag-n-drop между roster
// и слотами, swap слот↔слот, score-preview при hover.
// Заменяет старые .position-slot/.advisor-chip; функции
// renderAdvisorChip и переменная slotsHtml сохранены как
// helper'ы внутри renderRightPanel для совместимости с
// test_arma_stage57.mjs.
// ──────────────────────────────────────────────────────────────

// Состояние фильтра/сортировки roster-а (модульные переменные —
// сохраняются между перерисовками)
let _rosterFilter = 'all';  // 'all' | 'general' | 'merchant' | 'advisor' | 'priest'
let _rosterSort   = 'score'; // 'score' | 'age' | 'name'

// Состояние drag-n-drop
let _dndCharId    = null;
let _dndFromRole  = null;  // если тянем из заполненного слота

// Безопасное экранирование (текстовый контент)
function _courtEscHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
// Экранирование для атрибутов title (двойные кавычки ломают разметку)
function _courtEscAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
// Экранирование для inline-onclick с ' (одинарные кавычки ломают JS)
function _courtEscJs(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderRightPanel() {
  const panel = document.getElementById('right-panel');
  if (!panel || !GAME_STATE) return;

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const characters = (nation.characters || []).filter(c => c.alive);
  _cleanupCourtPositions(nation);
  const positions = _getCourtPositions(nation);
  const assignedIds = new Set(Object.values(positions).filter(Boolean));
  const freeChars = characters.filter(c => !assignedIds.has(c.id));

  // Заголовок: имя правителя и эпоха
  const rulerName = nation.ruler?.name || nation.name || 'Агафокл';
  const capital   = nation.capital_name || nation.name || 'Сиракузы';
  const year      = (typeof GAME_STATE.year === 'number')
                      ? `${Math.abs(GAME_STATE.year)} ${GAME_STATE.year < 0 ? 'BC' : 'AD'}`
                      : '301 BC';

  const nationIdForPortraits = GAME_STATE.player_nation;

  // ─── Slotы коллегии (Шаг 57: используем renderPortraitHTML) ───
  // Переменная slotsHtml/паттерн сохранены для test_arma_stage57.mjs.
  const slotsHtml = COURT_POSITIONS.map(p => {
    const charId = positions[p.id];
    const char   = charId ? characters.find(c => c.id === charId) : null;
    const filled = !!char;
    if (filled) {
      const portrait = typeof renderPortraitHTML === 'function'
        ? renderPortraitHTML(char, nationIdForPortraits, 56, 'position-slot__portrait')
        : `<div class="pos-role-icon">${_posIconHtml(p.icon)}</div>`;
      const cidJs = _courtEscJs(char.id);
      const cnEsc = _courtEscHtml(char.name);
      const cnAttr = _courtEscAttr(char.name);
      return `
        <div class="position-cameo filled" data-role="${p.id}" data-char-id="${_courtEscAttr(char.id)}"
             draggable="true"
             data-action="showCharacterDetail" data-arg="${cidJs}" data-guard=".cameo-unassign"
             title="${cnAttr} — ${_courtEscAttr(p.title)}">
          <button class="cameo-unassign"
                  data-action="unassignCharacter" data-arg="${p.id}" data-stop-prop
                  title="Снять с должности">✕</button>
          ${portrait}
          <div class="cameo-name">${cnEsc}</div>
          <div class="cameo-title">${p.title}</div>
          <div class="cameo-bonus">${p.bonus}</div>
        </div>
      `;
    } else {
      return `
        <div class="position-cameo vacant" data-role="${p.id}"
             data-action="openAssignModal" data-arg="${p.id}"
             title="${_courtEscAttr(p.title)}: ${_courtEscAttr(p.bonus)}">
          <div class="cameo-icon">${_posIconHtml(p.icon)}</div>
          <div class="cameo-title">${p.title}</div>
          <div class="cameo-label">— вакантно —</div>
          <div class="cameo-bonus">${p.bonus}</div>
        </div>
      `;
    }
  }).join('');

  // ─── Фильтры и сортировка roster-а ───
  const filtersHtml = _renderRosterFilters(freeChars);

  // ─── Отфильтрованный/отсортированный список ───
  const displayChars = _applyRosterFilterSort(freeChars);
  const advisorsHtml = displayChars.length === 0
    ? '<div class="roster-empty">Нет подходящих персонажей</div>'
    : displayChars.map(c => renderAdvisorChip(c, nationIdForPortraits)).join('');

  panel.innerHTML = `
    <div class="court-board">
      <div class="court-header">
        <span class="court-title"><span class="icon-wrap" data-icon="court"></span> Двор ${_courtEscHtml(rulerName)}</span>
        <span class="court-era">${_courtEscHtml(capital)} · ${_courtEscHtml(year)}</span>
      </div>

      <button id="generate-chars-btn" data-action="handleGenerateChars">
        <span class="icon-wrap" data-icon="ai"></span> Созвать советников (AI)
      </button>

      ${characters.length === 0
        ? '<div class="no-data" style="margin-top:8px;">Двор пуст. Созовите советников или введите команду.</div>'
        : `
          <section class="court-college">
            <div class="court-section-title">Коллегия</div>
            <div class="college-grid">${slotsHtml}</div>
          </section>

          <div class="court-divider" data-dt="unassign">
            <span>Зал заседаний</span>
          </div>

          <section class="court-roster">
            ${filtersHtml}
            <div class="roster-list">${advisorsHtml}</div>
          </section>
        `
      }
    </div>
  `;

  // Проставляем drag-n-drop биндинги (идемпотентно)
  initCourtDragDrop(panel);
}

/**
 * renderAdvisorChip — строка roster-а (сохранённое имя для
 * совместимости с test_arma_stage57.mjs). Использует
 * renderPortraitHTML(char, nid, 32, 'advisor-chip__portrait').
 * Выводит новый `.roster-row` HTML с портретом, именем и
 * четырьмя мини-бейджами навыков (по одному на каждую должность).
 */
function renderAdvisorChip(char, nationId) {
  const traits = char.traits || {};
  const nid = nationId || (typeof GAME_STATE !== 'undefined' ? GAME_STATE.player_nation : '');
  // Шаг 57 — CC0-портрет 32px через renderPortraitHTML.
  const portrait = typeof renderPortraitHTML === 'function'
    ? renderPortraitHTML(char, nid, 32, 'advisor-chip__portrait')
    : `<span class="adv-avatar">${char.portrait || '👤'}</span>`;

  // Четыре бейджа — по одному на каждую должность (один взгляд = весь
  // профиль кандидата)
  const skillsHtml = COURT_POSITIONS.map(p => {
    const raw = traits[p.skill] || 0;
    const val = Math.round(raw / 10);
    return `<span class="r-skill" title="${_courtEscAttr(p.title)}: ${raw}">` +
           `<span class="icon-wrap" data-icon="${p.icon}"></span>${val}</span>`;
  }).join('');

  const cidJs   = _courtEscJs(char.id);
  const cidAttr = _courtEscAttr(char.id);
  const nameEsc = _courtEscHtml(char.name);
  const nameAtr = _courtEscAttr(char.name);
  const role    = getRoleLabel(char.role);

  return `
    <div class="roster-row" data-char-id="${cidAttr}" draggable="true"
         data-action="showCharacterDetail" data-arg="${cidJs}" data-guard=".roster-menu-btn"
         title="${nameAtr} — ${_courtEscAttr(role)}">
      ${portrait}
      <div class="roster-info">
        <div class="roster-name">${nameEsc}</div>
        <div class="roster-meta">${skillsHtml}</div>
      </div>
      <button class="roster-menu-btn"
              data-action="_showRosterMenu" data-arg="${cidJs}" data-stop-prop data-pass-event
              title="Назначить в…">⋮</button>
    </div>
  `;
}

// ─── Roster: фильтры и сортировка ──────────────────────────────

function _renderRosterFilters(freeChars) {
  const counts = { all: freeChars.length, general: 0, merchant: 0, advisor: 0, priest: 0 };
  for (const c of freeChars) {
    if (counts[c.role] !== undefined) counts[c.role]++;
  }
  // Карта: filter id → иконка должности (для визуальной идентификации)
  const filters = [
    { id: 'all',      label: 'Все', icon: null },
    { id: 'general',  label: '',    icon: 'army'      },
    { id: 'merchant', label: '',    icon: 'gold'      },
    { id: 'advisor',  label: '',    icon: 'diplomacy' },
    { id: 'priest',   label: '',    icon: 'laws'      },
  ];
  const filterHtml = filters.map(f => {
    const icon = f.icon
      ? `<span class="icon-wrap" data-icon="${f.icon}"></span>`
      : '';
    const lbl = f.label;
    return `<button class="roster-filter-btn ${_rosterFilter === f.id ? 'active' : ''}"
            data-action="setRosterFilter" data-arg="${f.id}"
            title="${_courtEscAttr(f.id)}">${icon}${lbl}·<b>${counts[f.id] ?? 0}</b></button>`;
  }).join('');
  const sorts = [
    { id: 'score', label: 'рейтинг' },
    { id: 'age',   label: 'возраст' },
    { id: 'name',  label: 'имя' },
  ];
  const sortHtml = sorts.map(s => `
    <button class="roster-sort-btn ${_rosterSort === s.id ? 'active' : ''}"
            data-action="setRosterSort" data-arg="${s.id}">${s.label}</button>
  `).join('');
  return `
    <div class="roster-filters">${filterHtml}</div>
    <div class="roster-sort">Сорт:&nbsp;${sortHtml}</div>
  `;
}

function _applyRosterFilterSort(freeChars) {
  // Filter by role
  let list = _rosterFilter === 'all'
    ? freeChars.slice()
    : freeChars.filter(c => c.role === _rosterFilter);
  // Sort
  if (_rosterSort === 'score') {
    list.sort((a, b) => _bestScore(b) - _bestScore(a));
  } else if (_rosterSort === 'age') {
    list.sort((a, b) => (a.age || 0) - (b.age || 0));
  } else if (_rosterSort === 'name') {
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  return list;
}

function _bestScore(char) {
  let best = -Infinity;
  for (const p of COURT_POSITIONS) {
    const s = _candidateScore(char, p);
    if (s > best) best = s;
  }
  return Number.isFinite(best) ? best : 0;
}

export function setRosterFilter(id) {
  _rosterFilter = id;
  renderRightPanel();
}

export function setRosterSort(id) {
  _rosterSort = id;
  renderRightPanel();
}

// ─── Всплывающее меню «Назначить в…» ───────────────────────────

function _showRosterMenu(ev, charId) {
  _closeRosterMenu();
  const menu = document.createElement('div');
  menu.className = 'roster-menu';
  // Позиционируем: выносим слева от курсора, чтобы не уйти за правый край
  const x = Math.max(8, (ev.clientX || 0) - 150);
  const y = Math.min(window.innerHeight - 180, (ev.clientY || 0));
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  const cidJs = _courtEscJs(charId);
  menu.innerHTML =
    `<div class="rm-title">Назначить в…</div>` +
    COURT_POSITIONS.map(p =>
      `<button data-action="assignCharacter" data-arg="${cidJs}|${p.id}" data-action2="_closeRosterMenu">` +
      `<span class="icon-wrap" data-icon="${p.icon}"></span> ${p.title}</button>`
    ).join('') +
    `<button class="rm-sep" data-action="showCharacterDetail" data-arg="${cidJs}" data-action2="_closeRosterMenu">Подробно</button>` +
    `<button data-action="_closeRosterMenu">Отмена</button>`;
  document.body.appendChild(menu);
  // Инициализируем svg-иконки (MutationObserver их подхватит, но на
  // всякий случай запустим initIconWraps для свежего узла)
  if (typeof window.initIconWraps === 'function') {
    window.initIconWraps(menu);
  }
  // Закрытие по клику вне меню — со следующего тика, чтобы не
  // перехватить свой же onclick
  setTimeout(() => {
    document.addEventListener('click', _closeRosterMenuOutside, { once: true, capture: true });
  }, 0);
}

function _closeRosterMenu() {
  document.querySelectorAll('.roster-menu').forEach(m => m.remove());
}

function _closeRosterMenuOutside(ev) {
  if (ev.target && ev.target.closest && ev.target.closest('.roster-menu')) {
    // Клик внутри меню — переустанавливаем listener
    setTimeout(() => {
      document.addEventListener('click', _closeRosterMenuOutside, { once: true, capture: true });
    }, 0);
    return;
  }
  _closeRosterMenu();
}

// ─── Drag-n-drop ───────────────────────────────────────────────

/**
 * initCourtDragDrop — навешивает delegated drag/drop listeners
 * на #right-panel. Идемпотентно: повторный вызов ничего не
 * делает (флаг data-_dndBound).
 */
export function initCourtDragDrop(panel) {
  if (!panel || panel.dataset._dndBound === '1') return;
  panel.dataset._dndBound = '1';

  panel.addEventListener('dragstart', (e) => {
    const row  = e.target.closest && e.target.closest('.roster-row');
    const slot = e.target.closest && e.target.closest('.position-cameo.filled');
    if (row) {
      _dndCharId   = row.dataset.charId;
      _dndFromRole = null;
      row.classList.add('dragging');
    } else if (slot) {
      _dndCharId   = slot.dataset.charId;
      _dndFromRole = slot.dataset.role;
      slot.classList.add('dragging');
    } else {
      return;
    }
    try {
      e.dataTransfer.setData('text/plain', String(_dndCharId));
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) {}
  });

  panel.addEventListener('dragend', () => {
    _dndCharId = null;
    _dndFromRole = null;
    panel.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    panel.querySelectorAll('.dt-good,.dt-meh,.dt-bad').forEach(el => {
      el.classList.remove('dt-good','dt-meh','dt-bad');
    });
    panel.querySelectorAll('.dt-unassign').forEach(el => el.classList.remove('dt-unassign'));
  });

  panel.addEventListener('dragover', (e) => {
    if (!_dndCharId) return;
    const slot = e.target.closest && e.target.closest('.position-cameo');
    const div  = e.target.closest && e.target.closest('.court-divider');
    if (slot) {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
      if (!slot.classList.contains('dt-good') &&
          !slot.classList.contains('dt-meh') &&
          !slot.classList.contains('dt-bad')) {
        const nation = GAME_STATE.nations[GAME_STATE.player_nation];
        const char   = (nation.characters || []).find(c => c.id === _dndCharId);
        const posDef = COURT_POSITIONS.find(p => p.id === slot.dataset.role);
        if (char && posDef) {
          const score = _candidateScore(char, posDef);
          const cls = score >= 40 ? 'dt-good' : score >= 20 ? 'dt-meh' : 'dt-bad';
          slot.classList.add(cls);
        }
      }
    } else if (div && _dndFromRole) {
      // Drag из слота на divider = snять с должности
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
      div.classList.add('dt-unassign');
    }
  });

  panel.addEventListener('dragleave', (e) => {
    const slot = e.target.closest && e.target.closest('.position-cameo');
    const div  = e.target.closest && e.target.closest('.court-divider');
    if (slot) slot.classList.remove('dt-good','dt-meh','dt-bad');
    if (div)  div.classList.remove('dt-unassign');
  });

  panel.addEventListener('drop', (e) => {
    if (!_dndCharId) return;
    const slot = e.target.closest && e.target.closest('.position-cameo');
    const div  = e.target.closest && e.target.closest('.court-divider');
    const charId    = _dndCharId;
    const fromRole  = _dndFromRole;
    if (slot && slot.dataset.role) {
      e.preventDefault();
      const targetRole = slot.dataset.role;
      // Drop на тот же самый слот — no-op
      if (fromRole === targetRole) return;
      // Slot → Slot = swap (persist old holder в fromRole)
      if (fromRole) {
        _swapCourtPositions(fromRole, targetRole, charId);
      } else {
        assignCharacter(charId, targetRole);
      }
    } else if (div && fromRole) {
      e.preventDefault();
      unassignCharacter(fromRole);
    }
  });
}

function _swapCourtPositions(fromRole, toRole, charId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const positions = _getCourtPositions(nation);
  const otherId = positions[toRole] || null;
  // Атомарно: source → old holder, target → dragged char
  positions[fromRole] = otherId;
  positions[toRole]   = charId;
  if (typeof addEventLog === 'function') {
    const chars = nation.characters || [];
    const me    = chars.find(c => c.id === charId);
    const other = otherId ? chars.find(c => c.id === otherId) : null;
    const posTo = COURT_POSITIONS.find(p => p.id === toRole);
    const posFr = COURT_POSITIONS.find(p => p.id === fromRole);
    if (me && posTo)    addEventLog(`${me.name} переведён: ${posTo.title}.`, 'character');
    if (other && posFr) addEventLog(`${other.name} переведён: ${posFr.title}.`, 'character');
  }
  renderRightPanel();
}

// Экспорт в window для data-action делегирования (uisuper этап 57)
if (typeof window !== 'undefined') {
}

// Модал назначения на должность
function openAssignModal(roleId) {
  const overlay = document.getElementById('assign-modal-overlay');
  if (!overlay) return;
  const posDef = COURT_POSITIONS.find(p => p.id === roleId);
  if (!posDef) return;

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const positions = _getCourtPositions(nation);
  const characters = (nation.characters || []).filter(c => c.alive);
  const currentId = positions[roleId];

  // Кандидаты: все живые, отсортированы по релевантному навыку
  const candidates = characters
    .map(c => ({ char: c, score: _candidateScore(c, posDef) }))
    .sort((a, b) => b.score - a.score);

  const nationIdCand = GAME_STATE.player_nation;
  const candHtml = candidates.length === 0
    ? '<div class="assign-cand-empty">Нет доступных персонажей</div>'
    : candidates.map(({ char, score }) => {
        const isCurrent = char.id === currentId;
        // Шаг 57 — CC0-портрет 40px в списке кандидатов.
        const portrait = typeof renderPortraitHTML === 'function'
          ? renderPortraitHTML(char, nationIdCand, 40, 'assign-cand__portrait')
          : `<div class="assign-cand-portrait">${char.portrait || '👤'}</div>`;
        return `
          <div class="assign-cand">
            ${portrait}
            <div class="assign-cand-info">
              <div class="assign-cand-name">${char.name}</div>
              <div class="assign-cand-meta">${getRoleLabel(char.role)} · ${char.age} лет</div>
            </div>
            <div class="assign-cand-skill" title="Релевантный навык">${score}</div>
            ${isCurrent
              ? `<button class="assign-cand-btn unassign" data-action="unassignCharacter" data-arg="${roleId}">Снять</button>`
              : `<button class="assign-cand-btn" data-action="assignCharacter" data-arg="${char.id}|${roleId}">Назначить</button>`
            }
          </div>
        `;
      }).join('');

  overlay.innerHTML = `
    <div class="assign-modal-box" data-stop-prop>
      <div class="assign-modal-header">
        <div class="assign-modal-icon">${_posIconHtml(posDef.icon)}</div>
        <div>
          <div class="assign-modal-title">${posDef.title}</div>
          <div class="assign-modal-sub">${posDef.bonus}</div>
        </div>
        <button class="close-btn" data-action="closeAssignModal" style="margin-left:auto">✕</button>
      </div>
      <div class="assign-cand-list">${candHtml}</div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function closeAssignModal() {
  const overlay = document.getElementById('assign-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function assignCharacter(charId, roleId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const positions = _getCourtPositions(nation);
  // Если этот персонаж уже занимал другую должность — освобождаем её
  for (const pid of Object.keys(positions)) {
    if (positions[pid] === charId) positions[pid] = null;
  }
  positions[roleId] = charId;
  const char = (nation.characters || []).find(c => c.id === charId);
  const posDef = COURT_POSITIONS.find(p => p.id === roleId);
  if (typeof addEventLog === 'function' && char && posDef) {
    addEventLog(`${char.name} назначен на должность: ${posDef.title}.`, 'character');
  }
  closeAssignModal();
  renderRightPanel();
}

function unassignCharacter(roleId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const positions = _getCourtPositions(nation);
  const charId = positions[roleId];
  positions[roleId] = null;
  const char = charId ? (nation.characters || []).find(c => c.id === charId) : null;
  const posDef = COURT_POSITIONS.find(p => p.id === roleId);
  if (typeof addEventLog === 'function' && char && posDef) {
    addEventLog(`${char.name} снят с должности: ${posDef.title}.`, 'character');
  }
  closeAssignModal();
  renderRightPanel();
}

function renderCharacterCard(char) {
  const loyaltyColor = char.traits.loyalty > 60 ? '#4CAF50' :
                       char.traits.loyalty > 30 ? '#FF9800' : '#f44336';
  const moodIcon = getMoodIcon(char.traits.loyalty, char.traits.ambition);
  const roleLabel = getRoleLabel(char.role);
  // Шаг 57 — CC0-портрет 48px в карточке персонажа.
  const nid = (typeof GAME_STATE !== 'undefined') ? GAME_STATE.player_nation : '';
  const portraitHtml = typeof renderPortraitHTML === 'function'
    ? renderPortraitHTML(char, nid, 48, 'char-card__portrait')
    : `<div class="char-portrait">${char.portrait || '👤'}</div>`;

  return `
    <div class="char-card" data-action="showCharacterDetail" data-arg="${char.id}" title="${char.description}">
      ${portraitHtml}
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
export function showCharacterDetail(charId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const char = (nation.characters || []).find(c => c.id === charId);
  if (!char) return;

  const overlay = document.getElementById('char-overlay');
  if (!overlay) return;

  // Шаг 57 — крупный CC0-портрет 96px.
  const nidDetail = GAME_STATE.player_nation;
  const detailPortrait = typeof renderPortraitHTML === 'function'
    ? renderPortraitHTML(char, nidDetail, 96, 'char-detail__portrait')
    : `<span class="char-detail-portrait">${char.portrait || '👤'}</span>`;

  overlay.innerHTML = `
    <div class="char-detail-box">
      <div class="char-detail-header">
        <div class="char-detail__portrait-wrap">${detailPortrait}</div>
        <div>
          <div class="char-detail-name">${char.name}</div>
          <div class="char-detail-role">${getRoleLabel(char.role)} · ${char.age} лет · ❤️ ${char.health}/100</div>
        </div>
        <button data-action="closeCharacterDetail" class="close-btn">✕</button>
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

export function closeCharacterDetail() {
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
    <button class="ts-close-btn" data-action="hideTurnSummary">Закрыть ✕</button>
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

export function _applyLogFilter() {
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
          <button class="ci-btn accept" data-action="respondToCharInitiative" data-arg="${p.charId}|true">✅ Принять</button>
          <button class="ci-btn reject" data-action="respondToCharInitiative" data-arg="${p.charId}|false">❌ Отказать</button>
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

// ══════════════════════════════════════════════════════════════
// Шаг 56 — Культурная текстура боковых панелей
// ══════════════════════════════════════════════════════════════
//
// applyNationTheme(nationId) берёт текущую культурную группу из
// data/culture_groups.js и переключает CSS-переменные --panel-texture
// и --panel-tint. Всё рисование делает CSS (::before на панелях),
// JS только меняет строки переменных.
//
// preloadTexture(path) добавляет <link rel="preload" as="image">
// в <head>, чтобы браузер начал подтягивать JPG параллельно.
//
// Функции идемпотентны: повторный вызов с той же нацией не делает
// лишней работы (кэш _currentThemeNation).

let _currentThemeNation = null;

export function preloadTexture(texturePath) {
  if (typeof document === 'undefined' || !texturePath) return;
  // Не дублируем preload — если уже есть линк на тот же URL, выходим.
  const existing = document.head.querySelector(
    `link[rel="preload"][as="image"][href="${texturePath}"]`
  );
  if (existing) return;
  const link = document.createElement('link');
  link.rel  = 'preload';
  link.as   = 'image';
  link.href = texturePath;
  document.head.appendChild(link);
}

export function applyNationTheme(nationId) {
  if (typeof document === 'undefined') return;
  // getCultureGroup определён в data/culture_groups.js (Шаг 55).
  if (typeof getCultureGroup !== 'function') return;

  const group = getCultureGroup(nationId);
  if (!group) return;

  const root = document.documentElement;
  if (!root || !root.style) return;

  // Текстура: имя файла из group.texture, папка assets/textures/
  const texturePath = `assets/textures/${group.texture}.jpg`;
  root.style.setProperty('--panel-texture', `url('${texturePath}')`);

  // Тинт (полупрозрачный цвет поверх текстуры)
  if (group.panel_tint) {
    root.style.setProperty('--panel-tint', group.panel_tint);
  }

  // ── Шаг 59 — Декоративная SVG-рамка ─────────────────────────
  // Каждая культурная группа определяет свой border (id SVG в
  // assets/icons/). Если значение не задано — fallback к meander_dark.
  const borderId   = group.border || 'meander_dark';
  const borderPath = `assets/icons/${borderId}.svg`;
  root.style.setProperty('--panel-border-svg', `url('${borderPath}')`);

  // ── Шаг 60 — Иконка нации в шапке и CSS-переменная ─────────
  // Каждая культурная группа определяет свой icon (id SVG). Если
  // значение не задано — fallback к generic_sword.
  const iconId   = group.icon || 'generic_sword';
  const iconPath = `assets/icons/${iconId}.svg`;
  root.style.setProperty('--nation-icon-svg', `url('${iconPath}')`);

  // Обновить заголовок нации в #top-bar (если DOM смонтирован)
  if (typeof updateNationHeader === 'function') {
    const nationName = (typeof GAME_STATE !== 'undefined'
      && GAME_STATE && GAME_STATE.nations && GAME_STATE.nations[nationId]
      && GAME_STATE.nations[nationId].name) || '';
    updateNationHeader(nationId, nationName);
  }

  // Предзагрузка текстуры (только при смене темы, не каждый вызов)
  if (_currentThemeNation !== nationId) {
    preloadTexture(texturePath);
    _currentThemeNation = nationId;
  }
}

// ══════════════════════════════════════════════════════════════
// Шаг 60 — Иконка нации в правом углу #top-bar
// ══════════════════════════════════════════════════════════════
//
// updateNationHeader(nationId, nationName) — обновляет <img> и <span>
// в #nation-header. Берёт путь к SVG из getNationIconPath() (Шаг 60).
// Безопасно вызывать до построения DOM — функция тогда тихо выходит.

export function updateNationHeader(nationId, nationName) {
  if (typeof document === 'undefined') return;
  if (typeof getNationIconPath !== 'function') return;
  const iconEl = document.getElementById('nation-icon');
  const nameEl = document.getElementById('nation-name');
  if (!iconEl || !nameEl) return;
  const path = getNationIconPath(nationId);
  iconEl.src = path;
  iconEl.alt = nationName || nationId || '';
  nameEl.textContent = nationName || '';
}

if (typeof window !== 'undefined') {
}

if (typeof window !== 'undefined') {
}

// Экспорт для Node-тестов
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(module.exports || {}, {
    applyNationTheme,
    preloadTexture,
    updateNationHeader,
  });
}

// Backward compat for non-module scripts
