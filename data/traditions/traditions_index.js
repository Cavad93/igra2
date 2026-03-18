// ============================================================================
//  ИНДЕКС ТРАДИЦИЙ — объединяет все файлы
//  Итого: ~194 уникальных традиции
// ============================================================================

// Загрузка всех категорий
// В браузере файлы подключаются через <script>, переменные глобальные
// В Node.js — через require

if (typeof TRADITIONS_MILITARY   === 'undefined') var TRADITIONS_MILITARY   = require('./traditions_military');
if (typeof TRADITIONS_ECONOMIC   === 'undefined') var TRADITIONS_ECONOMIC   = require('./traditions_economic');
if (typeof TRADITIONS_SOCIAL     === 'undefined') var TRADITIONS_SOCIAL     = require('./traditions_social');
if (typeof TRADITIONS_RELIGIOUS  === 'undefined') var TRADITIONS_RELIGIOUS  = require('./traditions_religious');
if (typeof TRADITIONS_NAVAL      === 'undefined') var TRADITIONS_NAVAL      = require('./traditions_naval');
if (typeof TRADITIONS_ARTS       === 'undefined') var TRADITIONS_ARTS       = require('./traditions_arts');
if (typeof TRADITIONS_DIPLOMATIC === 'undefined') var TRADITIONS_DIPLOMATIC = require('./traditions_diplomatic');
if (typeof TRADITIONS_SURVIVAL   === 'undefined') var TRADITIONS_SURVIVAL   = require('./traditions_survival');
if (typeof TRADITIONS_EXTRA      === 'undefined') var TRADITIONS_EXTRA      = require('./traditions_extra');

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
// Ключ: тип условия → сколько очков за ход
// Движок проверяет эти условия каждый ход и начисляет опыт

const EXPERIENCE_RULES = {
  // exp_war
  at_war:             { type: 'exp_war', amount: 2 },       // +2/ход пока в войне
  battle_won:         { type: 'exp_war', amount: 8 },       // +8 за выигранную битву
  battle_lost:        { type: 'exp_war', amount: 4 },       // +4 за проигранную битву
  war_won:            { type: 'exp_war', amount: 15 },      // +15 за выигранную войну
  war_lost:           { type: 'exp_war', amount: 5 },       // +5 за проигранную

  // exp_naval
  has_coastal:        { type: 'exp_naval', amount: 0.5 },   // +0.5/ход за прибрежный регион
  naval_battle:       { type: 'exp_naval', amount: 8 },     // +8 за морской бой
  has_ships:          { type: 'exp_naval', amount: 0.3 },   // +0.3/ход за каждые 10 кораблей

  // exp_trade
  per_trade_route:    { type: 'exp_trade', amount: 1 },     // +1/ход за торговый маршрут
  trade_surplus:      { type: 'exp_trade', amount: 0.5 },   // +0.5/ход за 1000 дохода
  new_trade_route:    { type: 'exp_trade', amount: 5 },     // +5 за новый маршрут

  // exp_agriculture
  per_farm_region:    { type: 'exp_agriculture', amount: 0.5 }, // +0.5/ход за с/х регион
  food_surplus:       { type: 'exp_agriculture', amount: 0.3 }, // +0.3/ход при избытке еды
  building_farm:      { type: 'exp_agriculture', amount: 3 },   // +3 за постройку фермы

  // exp_culture
  per_cultural_bldg:  { type: 'exp_culture', amount: 0.5 },  // +0.5/ход за культ. здание
  base_culture:       { type: 'exp_culture', amount: 0.3 },  // +0.3/ход базовый
  building_cultural:  { type: 'exp_culture', amount: 5 },    // +5 за постройку храма/театра

  // exp_religion
  per_temple:         { type: 'exp_religion', amount: 0.5 }, // +0.5/ход за храм
  festival_held:      { type: 'exp_religion', amount: 5 },   // +5 за проведение праздника
  base_religion:      { type: 'exp_religion', amount: 0.2 }, // +0.2/ход базовый

  // exp_diplomacy
  per_treaty:         { type: 'exp_diplomacy', amount: 0.3 },// +0.3/ход за действующий договор
  treaty_signed:      { type: 'exp_diplomacy', amount: 5 },  // +5 за подписание
  alliance_active:    { type: 'exp_diplomacy', amount: 0.5 },// +0.5/ход за союз

  // exp_civic
  high_stability:     { type: 'exp_civic', amount: 0.3 },   // +0.3/ход если стабильность >60
  law_enacted:        { type: 'exp_civic', amount: 3 },      // +3 за принятие закона
  base_civic:         { type: 'exp_civic', amount: 0.2 },    // +0.2/ход базовый

  // exp_suffering
  famine:             { type: 'exp_suffering', amount: 3 },  // +3/ход во время голода
  plague:             { type: 'exp_suffering', amount: 5 },  // +5 за чуму
  war_on_territory:   { type: 'exp_suffering', amount: 2 },  // +2/ход при вторжении
  population_decline: { type: 'exp_suffering', amount: 1 },  // +1/ход при убыли
};

// ── Конфигурация мутаций ──────────────────────────────────────────────────────

const CULTURE_CONFIG = {
  TRADITION_SLOTS: 8,               // макс. традиций у культуры
  LOCKED_TRADITIONS_MAX: 2,         // макс. заблокированных (корневых) традиций
  MUTATION_COOLDOWN_TURNS: 600,     // мин. ходов между мутациями (50 лет)
  MUTATION_CHECK_INTERVAL: 12,      // проверять мутации каждые 12 ходов (1 год)
  EXPERIENCE_DECAY_RATE: 0.001,     // опыт медленно угасает (0.1%/ход)
  EXPERIENCE_DECAY_FLOOR: 20,       // опыт не падает ниже 20 (минимальная память)
  TRADITION_STRENGTH_GAIN: 2,       // усиление активной традиции за ход
  TRADITION_STRENGTH_MAX: 100,      // макс. сила традиции
  TRADITION_STRENGTH_MIN: 10,       // если упала ниже — кандидат на замену
  ASSIMILATION_RATE_BASE: 0.002,    // базовая скорость ассимиляции за ход
  CULTURE_MIXING_THRESHOLD: 0.3,    // если меньшинство > 30% — возможно смешение
};

// ── Валидация: считаем традиции ───────────────────────────────────────────────
if (typeof console !== 'undefined') {
  const count = Object.keys(ALL_TRADITIONS).length;
  console.log(`[traditions_index] Загружено ${count} традиций`);
}
