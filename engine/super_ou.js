/**
 * super_ou.js — Ornstein-Uhlenbeck based autonomous nation AI
 * Fully stochastic decision engine without LLM dependency.
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

export const SUPER_OU_CONFIG = {
  // Core OU parameters
  defaultTheta:        0.15,   // mean-reversion speed
  defaultSigma:        0.05,   // volatility scale
  dt:                  1.0,    // time step (per tick)

  // State vector dimensions
  economyVars:         80,
  militaryVars:        80,
  diplomacyVars:       80,
  politicsVars:        80,
  goalsVars:           80,

  // Modifier system
  maxActiveModifiers:  50,
  modifierDecayRate:   0.1,
  modifierCapMu:       0.95,

  // Decision system
  topActionsCount:     3,
  personalityDims:     1000,
  actionSoftmaxTemp:   1.2,

  // Anomaly detection
  anomalyThreshold:    3.5,    // z-score threshold
  anomalyCategories:   7,
  anomalyWindowTicks:  20,

  // Memory / history
  historyLength:       50,
  seasonalPeriod:      12,

  // Performance
  maxNations:          64,
  cacheTimeout:        5,

  // Debug
  debugMode:           false,
  vectorLogInterval:   10,
};

// ─── STATE VECTOR SCHEMA — ECONOMY (80 vars) ─────────────────────────────────

export const ECONOMY_SCHEMA = [
  { name:'gdp_growth',            mu:0.03,  sigma:0.02, theta:0.2, min:-0.3,  max:0.3,  category:'economy' },
  { name:'inflation_rate',        mu:0.04,  sigma:0.02, theta:0.2, min:-0.1,  max:1.0,  category:'economy' },
  { name:'unemployment_rate',     mu:0.07,  sigma:0.02, theta:0.15,min:0.0,   max:0.5,  category:'economy' },
  { name:'trade_balance',         mu:0.0,   sigma:0.05, theta:0.1, min:-0.5,  max:0.5,  category:'economy' },
  { name:'tax_revenue',           mu:0.25,  sigma:0.03, theta:0.1, min:0.05,  max:0.6,  category:'economy' },
  { name:'military_spending',     mu:0.03,  sigma:0.01, theta:0.1, min:0.0,   max:0.3,  category:'economy' },
  { name:'food_production',       mu:0.5,   sigma:0.05, theta:0.2, min:0.0,   max:1.5,  category:'economy' },
  { name:'food_consumption',      mu:0.5,   sigma:0.03, theta:0.3, min:0.1,   max:1.2,  category:'economy' },
  { name:'gold_reserves',         mu:0.2,   sigma:0.02, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'debt_ratio',            mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:3.0,  category:'economy' },
  { name:'interest_rate',         mu:0.05,  sigma:0.01, theta:0.15,min:0.0,   max:0.3,  category:'economy' },
  { name:'population_growth',     mu:0.01,  sigma:0.005,theta:0.05,min:-0.05, max:0.08, category:'economy' },
  { name:'urbanization_rate',     mu:0.55,  sigma:0.02, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'industrial_output',     mu:0.4,   sigma:0.04, theta:0.15,min:0.0,   max:1.5,  category:'economy' },
  { name:'agricultural_output',   mu:0.3,   sigma:0.04, theta:0.15,min:0.0,   max:1.2,  category:'economy' },
  { name:'export_volume',         mu:0.3,   sigma:0.04, theta:0.15,min:0.0,   max:2.0,  category:'economy' },
  { name:'import_volume',         mu:0.3,   sigma:0.04, theta:0.15,min:0.0,   max:2.0,  category:'economy' },
  { name:'trade_tariff',          mu:0.1,   sigma:0.02, theta:0.1, min:0.0,   max:0.8,  category:'economy' },
  { name:'foreign_investment',    mu:0.05,  sigma:0.03, theta:0.1, min:0.0,   max:0.5,  category:'economy' },
  { name:'domestic_investment',   mu:0.2,   sigma:0.03, theta:0.15,min:0.0,   max:0.6,  category:'economy' },
  { name:'consumer_confidence',   mu:0.55,  sigma:0.08, theta:0.2, min:0.0,   max:1.0,  category:'economy' },
  { name:'business_confidence',   mu:0.55,  sigma:0.07, theta:0.2, min:0.0,   max:1.0,  category:'economy' },
  { name:'credit_availability',   mu:0.5,   sigma:0.06, theta:0.15,min:0.0,   max:1.0,  category:'economy' },
  { name:'savings_rate',          mu:0.2,   sigma:0.03, theta:0.1, min:0.0,   max:0.6,  category:'economy' },
  { name:'wage_growth',           mu:0.03,  sigma:0.02, theta:0.2, min:-0.2,  max:0.3,  category:'economy' },
  { name:'productivity_growth',   mu:0.02,  sigma:0.02, theta:0.15,min:-0.2,  max:0.2,  category:'economy' },
  { name:'energy_production',     mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:2.0,  category:'economy' },
  { name:'energy_consumption',    mu:0.5,   sigma:0.04, theta:0.15,min:0.0,   max:2.0,  category:'economy' },
  { name:'infrastructure_index',  mu:0.5,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'technology_index',      mu:0.4,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'education_spending',    mu:0.05,  sigma:0.01, theta:0.05,min:0.0,   max:0.2,  category:'economy' },
  { name:'healthcare_spending',   mu:0.06,  sigma:0.01, theta:0.05,min:0.0,   max:0.2,  category:'economy' },
  { name:'construction_activity', mu:0.4,   sigma:0.06, theta:0.2, min:0.0,   max:1.5,  category:'economy' },
  { name:'mining_output',         mu:0.3,   sigma:0.05, theta:0.1, min:0.0,   max:1.5,  category:'economy' },
  { name:'manufacturing_output',  mu:0.4,   sigma:0.05, theta:0.15,min:0.0,   max:1.5,  category:'economy' },
  { name:'services_output',       mu:0.5,   sigma:0.04, theta:0.1, min:0.0,   max:1.5,  category:'economy' },
  { name:'currency_strength',     mu:1.0,   sigma:0.05, theta:0.1, min:0.1,   max:5.0,  category:'economy' },
  { name:'stock_market_index',    mu:1.0,   sigma:0.08, theta:0.15,min:0.0,   max:5.0,  category:'economy' },
  { name:'commodity_prices',      mu:1.0,   sigma:0.07, theta:0.15,min:0.1,   max:5.0,  category:'economy' },
  { name:'housing_prices',        mu:1.0,   sigma:0.05, theta:0.1, min:0.1,   max:5.0,  category:'economy' },
  { name:'retail_sales',          mu:0.5,   sigma:0.05, theta:0.2, min:0.0,   max:2.0,  category:'economy' },
  { name:'industrial_capacity',   mu:0.75,  sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'economy' },
  { name:'labor_participation',   mu:0.65,  sigma:0.03, theta:0.1, min:0.2,   max:0.95, category:'economy' },
  { name:'skill_level_index',     mu:0.5,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'innovation_rate',       mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'economy' },
  { name:'resource_depletion',    mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'environmental_index',   mu:0.6,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'logistics_efficiency',  mu:0.6,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'economy' },
  { name:'port_activity',         mu:0.5,   sigma:0.05, theta:0.15,min:0.0,   max:2.0,  category:'economy' },
  { name:'road_network_index',    mu:0.5,   sigma:0.02, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'banking_stability',     mu:0.7,   sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'economy' },
  { name:'insurance_coverage',    mu:0.4,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'property_rights',       mu:0.6,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'regulatory_burden',     mu:0.4,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'economy' },
  { name:'corruption_index',      mu:0.4,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'black_market_size',     mu:0.1,   sigma:0.03, theta:0.1, min:0.0,   max:0.6,  category:'economy' },
  { name:'remittances',           mu:0.05,  sigma:0.02, theta:0.1, min:0.0,   max:0.4,  category:'economy' },
  { name:'tourism_revenue',       mu:0.05,  sigma:0.03, theta:0.15,min:0.0,   max:0.5,  category:'economy' },
  { name:'digital_economy_share', mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:0.9,  category:'economy' },
  { name:'gini_coefficient',      mu:0.4,   sigma:0.02, theta:0.05,min:0.0,   max:0.9,  category:'economy' },
  { name:'poverty_rate',          mu:0.2,   sigma:0.03, theta:0.1, min:0.0,   max:0.9,  category:'economy' },
  { name:'middle_class_share',    mu:0.4,   sigma:0.03, theta:0.08,min:0.0,   max:0.9,  category:'economy' },
  { name:'wealth_concentration',  mu:0.6,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'land_productivity',     mu:0.5,   sigma:0.04, theta:0.1, min:0.0,   max:2.0,  category:'economy' },
  { name:'water_availability',    mu:0.6,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'livestock_count',       mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:2.0,  category:'economy' },
  { name:'fishery_output',        mu:0.3,   sigma:0.05, theta:0.1, min:0.0,   max:1.5,  category:'economy' },
  { name:'forestry_output',       mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.5,  category:'economy' },
  { name:'renewable_energy_share',mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'fossil_fuel_dependency',mu:0.7,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'raw_materials_stock',   mu:0.5,   sigma:0.05, theta:0.15,min:0.0,   max:2.0,  category:'economy' },
  { name:'finished_goods_stock',  mu:0.4,   sigma:0.05, theta:0.15,min:0.0,   max:2.0,  category:'economy' },
  { name:'supply_chain_index',    mu:0.6,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'economy' },
  { name:'market_competition',    mu:0.5,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'economy' },
  { name:'monopoly_index',        mu:0.3,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
  { name:'price_controls',        mu:0.2,   sigma:0.03, theta:0.08,min:0.0,   max:1.0,  category:'economy' },
  { name:'subsidy_level',         mu:0.1,   sigma:0.02, theta:0.08,min:0.0,   max:0.5,  category:'economy' },
  { name:'tariff_level',          mu:0.1,   sigma:0.02, theta:0.1, min:0.0,   max:0.8,  category:'economy' },
  { name:'trade_openness',        mu:0.5,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'economy' },
  { name:'economic_complexity',   mu:0.5,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
];

/**
 * Initialise economy OU variables for a nation.
 * Merges schema defaults with any values from nation.economy.
 * @param {object} nation
 * @returns {Array} array of variable state objects
 */
export function _initEconomyVector(nation) {
  const src = (nation && nation.economy) || {};
  return ECONOMY_SCHEMA.map(s => ({
    name:     s.name,
    mu:       s.mu,
    sigma:    s.sigma,
    theta:    s.theta,
    min:      s.min,
    max:      s.max,
    category: s.category,
    current:  (src[s.name] !== undefined) ? src[s.name] : s.mu,
  }));
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Initialise OU state for a nation.
 * @param {object} nation
 */
export function initNation(nation) {
  // TODO
}

/**
 * Main per-tick entry point.
 * @param {object} gameState
 * @param {string|number} nationId
 * @returns {object} decisions
 */
export function tick(gameState, nationId) {
  // TODO
}

/**
 * Advance all OU variables by one step.
 * @param {object} nation
 */
export function updateState(nation) {
  // TODO
}

/**
 * Apply situational modifiers to OU mu values.
 * @param {object} nation
 * @param {object} ouState
 */
export function applyModifiers(nation, ouState) {
  // TODO
}

/**
 * Choose actions based on current OU state.
 * @param {object} nation
 * @param {object} ouState
 * @returns {Array} top actions with probabilities
 */
export function decideActions(nation, ouState) {
  // TODO
}

/**
 * Compute anomaly score across all state categories.
 * @param {object} nation
 * @param {object} ouState
 * @returns {number} anomaly score
 */
export function calculateAnomalyScore(nation, ouState) {
  // TODO
}

/**
 * Return debug vector snapshot for logging/testing.
 * @param {object} nation
 * @returns {object}
 */
export function getDebugVector(nation) {
  // TODO
}

