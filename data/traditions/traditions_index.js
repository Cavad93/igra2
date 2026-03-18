// ============================================================================
//  ИНДЕКС ТРАДИЦИЙ — объединяет все файлы
//  Итого: ~198 уникальных традиций
// ============================================================================

// В браузере файлы подключаются через <script>, переменные уже глобальные.
// В Node.js — загружаем через require.

if (typeof module !== 'undefined' && typeof require === 'function') {
  // Node.js environment
  if (typeof TRADITIONS_MILITARY   === 'undefined') TRADITIONS_MILITARY   = require('./traditions_military');
  if (typeof TRADITIONS_ECONOMIC   === 'undefined') TRADITIONS_ECONOMIC   = require('./traditions_economic');
  if (typeof TRADITIONS_SOCIAL     === 'undefined') TRADITIONS_SOCIAL     = require('./traditions_social');
  if (typeof TRADITIONS_RELIGIOUS  === 'undefined') TRADITIONS_RELIGIOUS  = require('./traditions_religious');
  if (typeof TRADITIONS_NAVAL      === 'undefined') TRADITIONS_NAVAL      = require('./traditions_naval');
  if (typeof TRADITIONS_ARTS       === 'undefined') TRADITIONS_ARTS       = require('./traditions_arts');
  if (typeof TRADITIONS_DIPLOMATIC === 'undefined') TRADITIONS_DIPLOMATIC = require('./traditions_diplomatic');
  if (typeof TRADITIONS_SURVIVAL   === 'undefined') TRADITIONS_SURVIVAL   = require('./traditions_survival');
  if (typeof TRADITIONS_EXTRA      === 'undefined') TRADITIONS_EXTRA      = require('./traditions_extra');
}

// ── Единый реестр всех традиций ───────────────────────────────────────────────

const ALL_TRADITIONS = Object.assign({},
  TRADITIONS_MILITARY,
  TRADITIONS_ECONOMIC,
  TRADITIONS_SOCIAL,
  TRADITIONS_RELIGIOUS,
  TRADITIONS_NAVAL,
  TRADITIONS_ARTS,
  TRADITIONS_DIPLOMATIC,
  TRADITIONS_SURVIVAL,
  TRADITIONS_EXTRA,
);

// ── Типы опыта (experience) ───────────────────────────────────────────────────
// Счётчики растут каждый ход от событий в игре.
// Движок культуры (engine/culture.js) начисляет очки по правилам ниже.

const EXPERIENCE_TYPES = {
  exp_war:         { name: 'Военный опыт',       icon: '⚔️' },
  exp_naval:       { name: 'Морской опыт',       icon: '⚓' },
  exp_trade:       { name: 'Торговый опыт',      icon: '💰' },
  exp_agriculture: { name: 'Аграрный опыт',      icon: '🌾' },
  exp_culture:     { name: 'Культурный опыт',    icon: '🎭' },
  exp_religion:    { name: 'Религиозный опыт',   icon: '🏛' },
  exp_diplomacy:   { name: 'Дипломатический опыт', icon: '🤝' },
  exp_civic:       { name: 'Гражданский опыт',   icon: '📜' },
  exp_suffering:   { name: 'Опыт страданий',     icon: '💀' },
};

// ── Базовые правила начисления опыта за ход ───────────────────────────────────

const EXPERIENCE_RULES = {
  at_war:             { type: 'exp_war', amount: 2 },
  battle_won:         { type: 'exp_war', amount: 8 },
  battle_lost:        { type: 'exp_war', amount: 4 },
  war_won:            { type: 'exp_war', amount: 15 },
  war_lost:           { type: 'exp_war', amount: 5 },

  has_coastal:        { type: 'exp_naval', amount: 0.5 },
  naval_battle:       { type: 'exp_naval', amount: 8 },
  has_ships:          { type: 'exp_naval', amount: 0.3 },

  per_trade_route:    { type: 'exp_trade', amount: 1 },
  trade_surplus:      { type: 'exp_trade', amount: 0.5 },
  new_trade_route:    { type: 'exp_trade', amount: 5 },

  per_farm_region:    { type: 'exp_agriculture', amount: 0.5 },
  food_surplus:       { type: 'exp_agriculture', amount: 0.3 },
  building_farm:      { type: 'exp_agriculture', amount: 3 },

  per_cultural_bldg:  { type: 'exp_culture', amount: 0.5 },
  base_culture:       { type: 'exp_culture', amount: 0.3 },
  building_cultural:  { type: 'exp_culture', amount: 5 },

  per_temple:         { type: 'exp_religion', amount: 0.5 },
  festival_held:      { type: 'exp_religion', amount: 5 },
  base_religion:      { type: 'exp_religion', amount: 0.2 },

  per_treaty:         { type: 'exp_diplomacy', amount: 0.3 },
  treaty_signed:      { type: 'exp_diplomacy', amount: 5 },
  alliance_active:    { type: 'exp_diplomacy', amount: 0.5 },

  high_stability:     { type: 'exp_civic', amount: 0.3 },
  law_enacted:        { type: 'exp_civic', amount: 3 },
  base_civic:         { type: 'exp_civic', amount: 0.2 },

  famine:             { type: 'exp_suffering', amount: 3 },
  plague:             { type: 'exp_suffering', amount: 5 },
  war_on_territory:   { type: 'exp_suffering', amount: 2 },
  population_decline: { type: 'exp_suffering', amount: 1 },
};

// ── Конфигурация мутаций ──────────────────────────────────────────────────────

const CULTURE_CONFIG = {
  TRADITION_SLOTS: 8,
  LOCKED_TRADITIONS_MAX: 2,
  MUTATION_COOLDOWN_TURNS: 600,
  MUTATION_CHECK_INTERVAL: 12,
  EXPERIENCE_DECAY_RATE: 0.001,
  EXPERIENCE_DECAY_FLOOR: 20,
  TRADITION_STRENGTH_GAIN: 2,
  TRADITION_STRENGTH_MAX: 100,
  TRADITION_STRENGTH_MIN: 10,
  ASSIMILATION_RATE_BASE: 0.002,
  CULTURE_MIXING_THRESHOLD: 0.3,
};

// ── Валидация ─────────────────────────────────────────────────────────────────
if (typeof console !== 'undefined') {
  const count = Object.keys(ALL_TRADITIONS).length;
  console.log(`[traditions_index] Загружено ${count} традиций`);
}
