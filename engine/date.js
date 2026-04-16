// engine/date.js — Дата, сезон, стела
// Вынесено из engine/turn.js (Этап 45 uisuper.md)

// Названия месяцев в греческой традиции
const MONTH_NAMES = [
  '', // индекс 0 не используется
  'Гекатомбеон', 'Метагейтнион', 'Боэдромион',
  'Пианепсион',  'Мемактерион',  'Посидеон',
  'Гамелион',    'Антестерион',  'Элафеболион',
  'Мунихион',    'Таргелион',    'Скирофорион',
];

// ──────────────────────────────────────────────────────────────
// ДАТА
// ──────────────────────────────────────────────────────────────

function advanceDate() {
  GAME_STATE.turn++;
  let { year, month } = GAME_STATE.date;
  month++;
  if (month > 12) {
    month = 1;
    year++;
    // Переход до нашей эры: -301 → -300 → ... → 0 → 1 н.э.
    if (year === 0) year = 1;
  }
  GAME_STATE.date = { year, month };
  updateDateDisplay();
  try { updateStele(); } catch (e) { console.error('updateStele error:', e); }
}

function formatDate(date) {
  const era = date.year < 0 ? `${Math.abs(date.year)} г. до н.э.` : `${date.year} г. н.э.`;
  return `${MONTH_NAMES?.[Math.max(1, Math.min(12, date.month ?? 1))] ?? 'Месяц'}, ${era}`;
}

// ──────────────────────────────────────────────────────────────
// СЕЗОННЫЙ ВИЗУАЛ КАРТЫ
// Сезон выводится из GAME_STATE.turn (мираж ou.tick % 4):
//   0 = Весна, 1 = Лето, 2 = Осень, 3 = Зима
// ──────────────────────────────────────────────────────────────

// uisuper Этап 18 — более тонкая сезонная тонировка карты.
// Более низкие alpha у overlay и мягкий filter (минимум hue/saturate),
// чтобы смена сезона выглядела как едва заметный сдвиг настроения, а не
// резкий цветокоррекционный фильтр поверх Tabula Peutingeriana.
const SEASON_STYLES = {
  0: { // Весна
    overlay: 'rgba(40,80,30,0.035)',   // едва заметный зелёный
    filter:  'hue-rotate(4deg) saturate(1.04)',
    icon:    '🌸',
    label:   'Весна',
  },
  1: { // Лето
    overlay: 'rgba(60,40,0,0.045)',    // охристый
    filter:  'brightness(1.02) saturate(0.96)',
    icon:    '☀',
    label:   'Лето',
  },
  2: { // Осень
    overlay: 'rgba(80,30,0,0.06)',     // медный
    filter:  'hue-rotate(-6deg) sepia(0.08)',
    icon:    '🍂',
    label:   'Осень',
  },
  3: { // Зима
    overlay: 'rgba(20,40,80,0.055)',   // холодный синий
    filter:  'saturate(0.80) brightness(0.96)',
    icon:    '❄',
    label:   'Зима',
  },
};

/**
 * Возвращает текущий сезон (0-3).
 * Зеркалит логику super_ou.js: season = tick % 4 → 0=весна, 1=лето, 2=осень, 3=зима.
 * Если у игрока есть ou.tick, используем его; иначе GAME_STATE.turn.
 */
function getCurrentSeason() {
  try {
    const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
    if (!gs) return 0;
    // Пробуем взять tick у нации игрока (ou.tick) — это эталон для super_ou.
    const pid = gs.player_nation;
    const nat = pid && gs.nations ? gs.nations[pid] : null;
    const ouTick = nat?.ou?.tick;
    const t = (typeof ouTick === 'number') ? ouTick : (gs.turn || 0);
    return ((t % 4) + 4) % 4;
  } catch (e) {
    return 0;
  }
}

/**
 * Применяет визуальный фильтр сезона к карте и оверлею.
 * Плавность — через CSS transition (2s ease).
 */
function applySeasonVisual(season) {
  try {
    const s = (typeof season === 'number')
      ? (((season % 4) + 4) % 4)
      : getCurrentSeason();
    const style = SEASON_STYLES[s];
    if (!style) return;

    // 1. Оверлей поверх карты — лёгкая цветовая тонировка
    const overlay = document.getElementById('season-overlay');
    if (overlay) overlay.style.background = style.overlay;

    // 2. Фильтр leaflet-контейнера (leafletMap.getContainer().style.filter)
    try {
      if (typeof leafletMap !== 'undefined' && leafletMap && typeof leafletMap.getContainer === 'function') {
        leafletMap.getContainer().style.filter = style.filter;
      } else {
        const mc = document.getElementById('map-container');
        if (mc) mc.style.filter = style.filter;
      }
    } catch (_) {}
  } catch (e) {
    console.warn('[applySeasonVisual]', e);
  }
}

function updateDateDisplay() {
  const el = document.getElementById('game-date');
  if (!el) return;
  const dateStr = formatDate(GAME_STATE.date);
  // Префикс с иконкой сезона
  let style = null;
  try {
    const season = (typeof getCurrentSeason === 'function') ? getCurrentSeason() : 0;
    style = (typeof SEASON_STYLES !== 'undefined') ? SEASON_STYLES[season] : null;
  } catch (e) {}
  if (style) {
    // безопасно через textContent + inline-элементы
    el.textContent = '';
    const chip = document.createElement('span');
    chip.className = 'season-chip';
    chip.title = style.label;
    chip.textContent = style.icon;
    el.appendChild(chip);
    el.appendChild(document.createTextNode(' ' + style.label + ' · ' + dateStr));
  } else {
    el.textContent = dateStr;
  }
}

// ──────────────────────────────────────────────────────────────
// Стела: подключение к игровым данным
// ──────────────────────────────────────────────────────────────

// Греческие названия месяцев (аттический календарь), 12 шт. — индекс 0..11
const GREEK_MONTHS = [
  'Ἑκατομβαιών', 'Μεταγειτνιών', 'Βοηδρομιών',
  'Πυανεψιών',   'Μαιμακτηριών', 'Ποσιδεών',
  'Γαμηλιών',    'Ἀνθεστηριών',  'Ἐλαφηβολιών',
  'Μουνιχιών',   'Θαργηλιών',    'Σκιροφοριών',
];

// Маппинг типа правительства → титул правителя (UPPERCASE, для стелы)
const STELE_GOV_TITLES = {
  tyranny:       'ТИРАН',
  tyrant:        'ТИРАН',
  monarchy:      'ЦАРЬ',
  kingdom:       'ЦАРЬ',
  empire:        'ИМПЕРАТОР',
  republic:      'АРХОНТ',
  oligarchy:     'АРХОНТ',
  democracy:     'АРХОНТ',
  tribal:        'ВОЖДЬ',
  confederation: 'ВОЖДЬ',
  theocracy:     'ВЕРХОВНЫЙ ЖРЕЦ',
  satrapy:       'САТРАП',
};

// Конвертация года в римские цифры (до 999) + эра
function toRomanYear(n, era) {
  if (!(n > 0) || n > 999) return `${n} ${era}`;
  const vals = [900, 400, 100, 90, 40, 10, 9, 5, 4, 1];
  const syms = ['CM', 'CD', 'C', 'XC', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  let x = n;
  for (let i = 0; i < vals.length; i++) {
    while (x >= vals[i]) { result += syms[i]; x -= vals[i]; }
  }
  return `${result} ${era}`;
}

// Обновить «Стелу» (верхний левый блок): имя правителя и дата.
function updateStele() {
  if (typeof document === 'undefined') return;
  const gs = (typeof GAME_STATE !== 'undefined') ? GAME_STATE : null;
  if (!gs) return;

  // ── Имя и титул правителя ─────────────────────────────────────
  try {
    const rulerEl = document.getElementById('stele-ruler');
    if (rulerEl) {
      const pid    = gs.player_nation;
      const nation = (pid && gs.nations) ? gs.nations[pid] : null;
      const gov    = nation && nation.government ? nation.government : null;
      const ruler  = gov && gov.ruler ? gov.ruler : null;

      const rawName = (ruler && ruler.name) ? String(ruler.name) : 'STRATEGOS';
      const name    = rawName.toUpperCase();

      let title = '';
      if (ruler && ruler.title) {
        title = String(ruler.title).toUpperCase();
      } else if (gov && gov.type && STELE_GOV_TITLES[gov.type]) {
        title = STELE_GOV_TITLES[gov.type];
      } else {
        title = 'СТРАТЕГОС';
      }

      rulerEl.textContent = `${name} · ${title}`;
    }
  } catch (e) { /* no-op: стела — декоративный виджет */ }

  // ── Дата: месяц и год ─────────────────────────────────────────
  try {
    const monthEl = document.getElementById('game-month');
    const yearEl  = document.getElementById('game-year');
    if (monthEl || yearEl) {
      const date = gs.date || { year: -301, month: 1 };
      // Игровые месяцы хранятся 1..12; стела ожидает индекс 0..11
      const m = Math.max(1, Math.min(12, date.month ?? 1)) - 1;
      const yearRaw = (date.year ?? -301);
      const year = Math.abs(yearRaw);
      const era  = yearRaw < 0 ? 'BC' : 'AD';

      if (monthEl) monthEl.textContent = GREEK_MONTHS[m] || GREEK_MONTHS[0];
      if (yearEl)  yearEl.textContent  = toRomanYear(year, era);
    }
  } catch (e) { /* no-op */ }
}

// Экспортируем в window для доступа из HTML/других модулей
if (typeof window !== 'undefined') {
  window.MONTH_NAMES      = MONTH_NAMES;
  window.SEASON_STYLES    = SEASON_STYLES;
  window.getCurrentSeason = getCurrentSeason;
  window.applySeasonVisual = applySeasonVisual;
  window.updateStele      = updateStele;
  window.toRomanYear      = toRomanYear;
  window.advanceDate      = advanceDate;
  window.formatDate       = formatDate;
  window.updateDateDisplay = updateDateDisplay;
}
