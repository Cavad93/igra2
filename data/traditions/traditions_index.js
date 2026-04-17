// ============================================================================
//  ИНДЕКС ТРАДИЦИЙ — объединяет все файлы
//  Итого: ~198 уникальных традиций
// ============================================================================

import { TRADITIONS_MILITARY }   from './traditions_military.js';
import { TRADITIONS_ECONOMIC }   from './traditions_economic.js';
import { TRADITIONS_SOCIAL }     from './traditions_social.js';
import { TRADITIONS_RELIGIOUS }  from './traditions_religious.js';
import { TRADITIONS_NAVAL }      from './traditions_naval.js';
import { TRADITIONS_ARTS }       from './traditions_arts.js';
import { TRADITIONS_DIPLOMATIC } from './traditions_diplomatic.js';
import { TRADITIONS_SURVIVAL }   from './traditions_survival.js';
import { TRADITIONS_EXTRA }      from './traditions_extra.js';

// ── Единый реестр всех традиций ───────────────────────────────────────────────

export const ALL_TRADITIONS = Object.assign({},
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

export const EXPERIENCE_TYPES = {
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

export const EXPERIENCE_RULES = {
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

export const CULTURE_CONFIG = {
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

window.ALL_TRADITIONS = ALL_TRADITIONS;
window.EXPERIENCE_TYPES = EXPERIENCE_TYPES;
window.EXPERIENCE_RULES = EXPERIENCE_RULES;
window.CULTURE_CONFIG = CULTURE_CONFIG;
