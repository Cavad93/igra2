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
  { name:'slave_labor_dependency',mu:0.7,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'economy' },
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

// ─── STATE VECTOR SCHEMA — MILITARY (80 vars) ────────────────────────────────

export const MILITARY_SCHEMA = [
  { name:'army_size',               mu:0.3,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'navy_size',               mu:0.2,   sigma:0.03, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'air_force_size',          mu:0.2,   sigma:0.03, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'reserve_forces',          mu:0.4,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'military_readiness',      mu:0.6,   sigma:0.05, theta:0.15,min:0.0,   max:1.0,  category:'military' },
  { name:'troop_morale',            mu:0.65,  sigma:0.06, theta:0.2, min:0.0,   max:1.0,  category:'military' },
  { name:'officer_quality',         mu:0.6,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'equipment_quality',       mu:0.5,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'equipment_quantity',      mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:2.0,  category:'military' },
  { name:'armor_count',             mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.5,  category:'military' },
  { name:'artillery_count',         mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.5,  category:'military' },
  { name:'aircraft_count',          mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.5,  category:'military' },
  { name:'naval_vessels',           mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.5,  category:'military' },
  { name:'ammunition_stock',        mu:0.5,   sigma:0.06, theta:0.15,min:0.0,   max:2.0,  category:'military' },
  { name:'fuel_reserve',            mu:0.5,   sigma:0.06, theta:0.15,min:0.0,   max:2.0,  category:'military' },
  { name:'food_supply_military',    mu:0.6,   sigma:0.05, theta:0.2, min:0.0,   max:2.0,  category:'military' },
  { name:'medical_corps',           mu:0.5,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'logistics_capacity',      mu:0.5,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'fortification_level',     mu:0.4,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'border_control',          mu:0.5,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'intelligence_quality',    mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'counterintelligence',     mu:0.4,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'siege_engineering',        mu:0.3,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'electronic_warfare',      mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'special_forces',          mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'guerrilla_capacity',      mu:0.2,   sigma:0.03, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'wmd_capability',          mu:0.05,  sigma:0.02, theta:0.02,min:0.0,   max:1.0,  category:'military' },
  { name:'missile_systems',         mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'air_defense',             mu:0.4,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'naval_power_projection',  mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'power_projection_land',   mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'mobilization_speed',      mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'demobilization_rate',     mu:0.3,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'conscription_rate',       mu:0.1,   sigma:0.02, theta:0.05,min:0.0,   max:0.5,  category:'military' },
  { name:'veteran_ratio',           mu:0.2,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'desertion_rate',          mu:0.02,  sigma:0.01, theta:0.15,min:0.0,   max:0.5,  category:'military' },
  { name:'casualty_rate',           mu:0.01,  sigma:0.02, theta:0.3, min:0.0,   max:0.5,  category:'military' },
  { name:'military_training',       mu:0.6,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'doctrine_quality',        mu:0.5,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'command_coordination',    mu:0.6,   sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'communication_systems',   mu:0.6,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'spy_network_capacity',     mu:0.4,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'satellite_access',        mu:0.2,   sigma:0.03, theta:0.03,min:0.0,   max:1.0,  category:'military' },
  { name:'drone_capability',        mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'military_industry',       mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'weapon_imports',          mu:0.2,   sigma:0.03, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'weapon_exports',          mu:0.1,   sigma:0.02, theta:0.08,min:0.0,   max:0.8,  category:'military' },
  { name:'military_alliances',      mu:0.3,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'active_conflicts',        mu:0.05,  sigma:0.03, theta:0.2, min:0.0,   max:1.0,  category:'military' },
  { name:'war_exhaustion',          mu:0.1,   sigma:0.04, theta:0.15,min:0.0,   max:1.0,  category:'military' },
  { name:'strategic_depth',         mu:0.5,   sigma:0.03, theta:0.02,min:0.0,   max:1.0,  category:'military' },
  { name:'coastal_defense',         mu:0.4,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'mountain_warfare',        mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'jungle_warfare',          mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'urban_warfare',           mu:0.4,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'arctic_warfare',          mu:0.2,   sigma:0.03, theta:0.03,min:0.0,   max:1.0,  category:'military' },
  { name:'night_operations',        mu:0.4,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'amphibious_ops',          mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'airborne_ops',            mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'force_multiplier',        mu:0.5,   sigma:0.04, theta:0.08,min:0.0,   max:2.0,  category:'military' },
  { name:'strategic_reserves',      mu:0.4,   sigma:0.04, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'peacekeeping_forces',     mu:0.2,   sigma:0.03, theta:0.08,min:0.0,   max:0.5,  category:'military' },
  { name:'paramilitary',            mu:0.2,   sigma:0.03, theta:0.08,min:0.0,   max:0.8,  category:'military' },
  { name:'police_militarization',   mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'internal_security',       mu:0.6,   sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'coup_risk',               mu:0.05,  sigma:0.03, theta:0.15,min:0.0,   max:1.0,  category:'military' },
  { name:'military_loyalty',        mu:0.75,  sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'military_political_power',mu:0.3,   sigma:0.04, theta:0.08,min:0.0,   max:1.0,  category:'military' },
  { name:'arms_stockpile',          mu:0.5,   sigma:0.05, theta:0.1, min:0.0,   max:2.0,  category:'military' },
  { name:'explosives_stock',        mu:0.4,   sigma:0.05, theta:0.15,min:0.0,   max:2.0,  category:'military' },
  { name:'biological_defense',      mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'chemical_defense',        mu:0.3,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'fortress_network',         mu:0.1,   sigma:0.02, theta:0.03,min:0.0,   max:1.0,  category:'military' },
  { name:'strategic_bombing',       mu:0.2,   sigma:0.03, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'precision_strike',        mu:0.3,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'supply_line_security',    mu:0.6,   sigma:0.05, theta:0.1, min:0.0,   max:1.0,  category:'military' },
  { name:'military_budget_pct',     mu:0.03,  sigma:0.01, theta:0.08,min:0.0,   max:0.3,  category:'military' },
  { name:'foreign_base_access',     mu:0.1,   sigma:0.02, theta:0.05,min:0.0,   max:1.0,  category:'military' },
  { name:'military_experience',     mu:0.4,   sigma:0.04, theta:0.03,min:0.0,   max:1.0,  category:'military' },
  { name:'battle_hardened',         mu:0.2,   sigma:0.04, theta:0.05,min:0.0,   max:1.0,  category:'military' },
];

/**
 * Initialise military OU variables for a nation.
 * @param {object} nation
 * @returns {Array} array of variable state objects
 */
export function _initMilitaryVector(nation) {
  const src = (nation && nation.military) || {};
  return MILITARY_SCHEMA.map(s => ({
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

// ─── STATE VECTOR SCHEMA — DIPLOMACY (80 vars) ───────────────────────────────

export const DIPLOMACY_SCHEMA = [
  { name:'global_reputation',        mu:0.5,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'alliance_count',           mu:0.3,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'enemy_count',              mu:0.1,  sigma:0.03, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'neutral_relations',        mu:0.6,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'trade_partner_count',      mu:0.4,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'diplomatic_staff_quality', mu:0.5,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'embassy_network',          mu:0.4,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'international_trust',      mu:0.5,  sigma:0.05, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'treaty_compliance',        mu:0.7,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'treaty_count',             mu:0.3,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'un_influence',             mu:0.3,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'regional_hegemony',        mu:0.2,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'soft_power_index',         mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'cultural_influence',       mu:0.3,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'foreign_aid_given',        mu:0.05, sigma:0.02, theta:0.08, min:0.0, max:0.3, category:'diplomacy' },
  { name:'foreign_aid_received',     mu:0.05, sigma:0.02, theta:0.08, min:0.0, max:0.4, category:'diplomacy' },
  { name:'espionage_capability',     mu:0.3,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'counter_espionage',        mu:0.4,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'herald_effectiveness',      mu:0.3,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'media_influence_abroad',   mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'diaspora_influence',       mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'border_dispute_level',     mu:0.1,  sigma:0.03, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'territorial_claims',       mu:0.1,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'maritime_claims',          mu:0.1,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'sanctions_received',       mu:0.05, sigma:0.02, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'sanctions_imposed',        mu:0.05, sigma:0.02, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'alliance_reliability',     mu:0.6,  sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'negotiation_success_rate', mu:0.5,  sigma:0.05, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'mediation_activity',       mu:0.2,  sigma:0.03, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'multilateral_engagement',  mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'bilateral_agreements',     mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'international_law_respect',mu:0.6,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'refugee_policy',           mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'migration_pressure',       mu:0.2,  sigma:0.03, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'foreign_student_inflow',   mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'visa_openness',            mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'diplomatic_incidents',     mu:0.05, sigma:0.02, theta:0.15, min:0.0, max:1.0, category:'diplomacy' },
  { name:'ambassador_quality',       mu:0.5,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'foreign_lobbying',         mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:0.8, category:'diplomacy' },
  { name:'merchant_guild_influence',  mu:0.3,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'economic_coercion',        mu:0.1,  sigma:0.02, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'military_deterrence',      mu:0.4,  sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'covert_operations_abroad', mu:0.1,  sigma:0.02, theta:0.08, min:0.0, max:0.8, category:'diplomacy' },
  { name:'foreign_press_coverage',   mu:0.4,  sigma:0.05, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'global_summit_presence',   mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'peacekeeping_contribution',mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'arms_control_compliance',  mu:0.6,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'sacred_truce_status',       mu:0.5,  sigma:0.03, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'climate_cooperation',      mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'health_cooperation',       mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'tech_sharing_agreements',  mu:0.3,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'security_council_clout',   mu:0.1,  sigma:0.02, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'regional_org_membership',  mu:0.4,  sigma:0.03, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'trade_bloc_integration',   mu:0.3,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'currency_union_status',    mu:0.1,  sigma:0.02, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'aid_dependency_ratio',     mu:0.1,  sigma:0.02, theta:0.05, min:0.0, max:0.8, category:'diplomacy' },
  { name:'debt_diplomacy_exposure',  mu:0.1,  sigma:0.02, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'foreign_land_leases',      mu:0.05, sigma:0.01, theta:0.03, min:0.0, max:0.5, category:'diplomacy' },
  { name:'great_power_alignment',    mu:0.4,  sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'non_alignment_index',      mu:0.4,  sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'ideological_alignment',    mu:0.4,  sigma:0.05, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'historical_grievances',    mu:0.3,  sigma:0.03, theta:0.02, min:0.0, max:1.0, category:'diplomacy' },
  { name:'war_reparations_status',   mu:0.1,  sigma:0.02, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'reconciliation_index',     mu:0.4,  sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'ethnic_kin_abroad',        mu:0.2,  sigma:0.03, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'religious_diplomacy',      mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'cultural_exchange_rate',   mu:0.3,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'sports_diplomacy',         mu:0.3,  sigma:0.04, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
  { name:'academic_exchange',        mu:0.3,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'oracle_cooperation',        mu:0.1,  sigma:0.02, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'envoy_effectiveness',       mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'maritime_diplomacy',       mu:0.2,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'arctic_diplomacy',         mu:0.1,  sigma:0.02, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'diplomatic_immunity_cases',mu:0.05, sigma:0.01, theta:0.15, min:0.0, max:0.5, category:'diplomacy' },
  { name:'consular_network',         mu:0.4,  sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'diplomacy' },
  { name:'passport_strength',        mu:0.5,  sigma:0.03, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'extradition_treaty_count', mu:0.3,  sigma:0.03, theta:0.03, min:0.0, max:1.0, category:'diplomacy' },
  { name:'international_court_cases',mu:0.05, sigma:0.02, theta:0.1,  min:0.0, max:0.5, category:'diplomacy' },
  { name:'foreign_policy_stability', mu:0.6,  sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'diplomacy' },
  { name:'diplomatic_isolation_risk',mu:0.1,  sigma:0.03, theta:0.1,  min:0.0, max:1.0, category:'diplomacy' },
];

/**
 * Initialise diplomacy OU variables for a nation.
 * @param {object} nation
 * @returns {Array} array of variable state objects
 */
export function _initDiplomacyVector(nation) {
  const src = (nation && nation.diplomacy) || {};
  return DIPLOMACY_SCHEMA.map(s => ({
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

// ─── POLITICS SCHEMA ──────────────────────────────────────────────────────────

export const POLITICS_SCHEMA = [
  { name:'regime_stability',        mu:0.65, sigma:0.06, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'government_legitimacy',   mu:0.60, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'popular_support',         mu:0.55, sigma:0.07, theta:0.12, min:0.0, max:1.0, category:'politics' },
  { name:'opposition_strength',     mu:0.30, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'ruling_party_cohesion',   mu:0.70, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'electoral_integrity',     mu:0.60, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'voter_turnout',           mu:0.60, sigma:0.05, theta:0.10, min:0.1, max:1.0, category:'politics' },
  { name:'political_polarization',  mu:0.35, sigma:0.06, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'civil_liberties',         mu:0.60, sigma:0.05, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'rule_of_law',             mu:0.60, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'corruption_index',        mu:0.35, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'bureaucratic_efficiency', mu:0.55, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'press_freedom',           mu:0.55, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'censorship_level',        mu:0.25, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'protest_frequency',       mu:0.15, sigma:0.04, theta:0.20, min:0.0, max:1.0, category:'politics' },
  { name:'protest_intensity',       mu:0.10, sigma:0.04, theta:0.25, min:0.0, max:1.0, category:'politics' },
  { name:'political_violence',      mu:0.05, sigma:0.03, theta:0.30, min:0.0, max:1.0, category:'politics' },
  { name:'terrorism_risk',          mu:0.08, sigma:0.03, theta:0.20, min:0.0, max:1.0, category:'politics' },
  { name:'insurgency_level',        mu:0.05, sigma:0.03, theta:0.15, min:0.0, max:1.0, category:'politics' },
  { name:'separatism_risk',         mu:0.10, sigma:0.03, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'nationalist_sentiment',   mu:0.40, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'populism_index',          mu:0.30, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'left_wing_influence',     mu:0.35, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'right_wing_influence',    mu:0.35, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'religious_influence',     mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'secularism_index',        mu:0.55, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'federalism_degree',       mu:0.40, sigma:0.03, theta:0.04, min:0.0, max:1.0, category:'politics' },
  { name:'centralization',          mu:0.55, sigma:0.04, theta:0.05, min:0.0, max:1.0, category:'politics' },
  { name:'technocracy_index',       mu:0.30, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'oligarchy_index',         mu:0.25, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'democracy_score',         mu:0.55, sigma:0.05, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'autocracy_score',         mu:0.30, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'state_capacity',          mu:0.60, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'policy_effectiveness',    mu:0.55, sigma:0.05, theta:0.09, min:0.0, max:1.0, category:'politics' },
  { name:'legislative_power',       mu:0.50, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'executive_power',         mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'judicial_independence',   mu:0.55, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'constitutional_order',    mu:0.65, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'political_trust',         mu:0.40, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'institutional_trust',     mu:0.45, sigma:0.05, theta:0.09, min:0.0, max:1.0, category:'politics' },
  { name:'media_trust',             mu:0.40, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'social_cohesion',         mu:0.55, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'ethnic_tension',          mu:0.20, sigma:0.04, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'class_conflict',          mu:0.25, sigma:0.04, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'urban_rural_divide',      mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'plebeian_rights',          mu:0.40, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'minority_rights',         mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'immigration_policy',      mu:0.50, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'refugee_burden',          mu:0.15, sigma:0.04, theta:0.15, min:0.0, max:1.0, category:'politics' },
  { name:'welfare_state',           mu:0.50, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'public_services',         mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'healthcare_access',       mu:0.60, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'education_access',        mu:0.65, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'politics' },
  { name:'environmental_policy',    mu:0.45, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'energy_policy',           mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'fiscal_policy',           mu:0.50, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'monetary_autonomy',       mu:0.60, sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'politics' },
  { name:'foreign_policy_hawkish',  mu:0.35, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'foreign_policy_dovish',   mu:0.45, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'isolationism',            mu:0.20, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'globalism',               mu:0.55, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'protectionism',           mu:0.30, sigma:0.04, theta:0.09, min:0.0, max:1.0, category:'politics' },
  { name:'free_trade_policy',       mu:0.55, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'cabinet_stability',       mu:0.70, sigma:0.05, theta:0.12, min:0.0, max:1.0, category:'politics' },
  { name:'party_discipline',        mu:0.65, sigma:0.05, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'coalition_fragility',     mu:0.20, sigma:0.04, theta:0.15, min:0.0, max:1.0, category:'politics' },
  { name:'election_cycle',          mu:0.50, sigma:0.05, theta:0.04, min:0.0, max:1.0, category:'politics' },
  { name:'rhetoric_effectiveness',  mu:0.35, sigma:0.04, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'rumor_spreading',         mu:0.25, sigma:0.04, theta:0.12, min:0.0, max:1.0, category:'politics' },
  { name:'civic_engagement',        mu:0.50, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'philosopher_influence',   mu:0.30, sigma:0.03, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'labor_union_power',       mu:0.35, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'business_lobby_power',    mu:0.40, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'military_lobby_power',    mu:0.30, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'austerity_policy',        mu:0.25, sigma:0.04, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'stimulus_policy',         mu:0.30, sigma:0.04, theta:0.10, min:0.0, max:1.0, category:'politics' },
  { name:'secret_police_presence',  mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'privacy_rights',          mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
  { name:'public_discourse_freedom', mu:0.50, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'politics' },
  { name:'transparency_index',      mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'politics' },
];

/**
 * Initialise politics OU variables for a nation.
 * @param {object} nation
 * @returns {Array} array of variable state objects
 */
export function _initPoliticsVector(nation) {
  const src = (nation && nation.politics) || {};
  return POLITICS_SCHEMA.map(s => ({
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

// ─── GOALS SCHEMA ─────────────────────────────────────────────────────────────

export const GOALS_SCHEMA = [
  { name:'expansion_drive',         mu:0.30, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'survival_imperative',     mu:0.70, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'wealth_accumulation',     mu:0.55, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'military_supremacy',      mu:0.35, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'diplomatic_dominance',    mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'tech_leadership',         mu:0.40, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'cultural_hegemony',       mu:0.25, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'resource_security',       mu:0.60, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'population_growth',       mu:0.45, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'regional_stability',      mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'alliance_building',       mu:0.45, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'isolation_preference',    mu:0.20, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'regime_preservation',     mu:0.65, sigma:0.05, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'ideological_spread',      mu:0.25, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'trade_dominance',         mu:0.40, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'territorial_integrity',   mu:0.75, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'infrastructure_dev',      mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'food_self_sufficiency',   mu:0.60, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'energy_independence',     mu:0.55, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'naval_power_goal',        mu:0.30, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'air_power_goal',          mu:0.30, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'great_wonder_ambition',   mu:0.15, sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'goals' },
  { name:'espionage_dominance',     mu:0.25, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'oracle_prestige',         mu:0.15, sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'goals' },
  { name:'social_welfare_goal',     mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'education_investment',    mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'healthcare_investment',   mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'environmental_care',      mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'gdp_growth_target',       mu:0.50, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'low_inflation_goal',      mu:0.60, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'employment_goal',         mu:0.65, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'debt_reduction_goal',     mu:0.45, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'currency_stability_goal', mu:0.60, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'border_control_goal',     mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'crime_reduction_goal',    mu:0.60, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'sovereignty_protection',  mu:0.75, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'historical_claim_pursuit',mu:0.20, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'diaspora_repatriation',   mu:0.20, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'economic_sanctions_goal', mu:0.15, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'nation_branding_goal',    mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'tourism_development',     mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'foreign_investment_goal', mu:0.50, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'innovation_ecosystem',    mu:0.40, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'artisan_guild_promotion', mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'urbanization_goal',       mu:0.45, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'rural_development_goal',  mu:0.40, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'minority_integration',    mu:0.45, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'freedman_rights_goal',    mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'anti_corruption_goal',    mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'justice_reform_goal',     mu:0.45, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'press_freedom_goal',      mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'religious_unity_goal',    mu:0.40, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'national_identity_goal',  mu:0.55, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'language_preservation',   mu:0.45, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'heritage_preservation',   mu:0.45, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'siege_weapon_deterrence', mu:0.25, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'conventional_deterrence', mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'proxy_war_willingness',   mu:0.20, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'peacekeeping_role',       mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'humanitarian_role',       mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'irrigation_expansion',    mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'timber_reliance',         mu:0.45, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'water_security_goal',     mu:0.60, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'food_export_goal',        mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'arms_export_goal',        mu:0.20, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'arms_import_reduction',   mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'debt_forgiveness_goal',   mu:0.15, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'aid_donor_goal',          mu:0.25, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'aid_recipient_goal',      mu:0.20, sigma:0.03, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'globalization_embrace',   mu:0.45, sigma:0.05, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'protectionism_goal',      mu:0.30, sigma:0.04, theta:0.08, min:0.0, max:1.0, category:'goals' },
  { name:'multilateral_engagement', mu:0.50, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'bilateral_focus',         mu:0.40, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'superpower_alignment',    mu:0.35, sigma:0.05, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'non_alignment_goal',      mu:0.35, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'imperial_legacy_goal',    mu:0.15, sigma:0.03, theta:0.05, min:0.0, max:1.0, category:'goals' },
  { name:'decolonization_support',  mu:0.30, sigma:0.04, theta:0.06, min:0.0, max:1.0, category:'goals' },
  { name:'coinage_standardization', mu:0.20, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'philosophy_patronage',    mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
  { name:'medicine_investment',     mu:0.30, sigma:0.04, theta:0.07, min:0.0, max:1.0, category:'goals' },
];

/**
 * Initialise goals OU variables for a nation.
 * @param {object} nation
 * @returns {Array} array of variable state objects
 */
export function _initGoalsVector(nation) {
  const src = (nation && nation.goals) || {};
  return GOALS_SCHEMA.map(s => ({
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

// ─── OU PROCESS CORE ─────────────────────────────────────────────────────────

/**
 * Box-Muller transform — returns standard normal N(0,1) sample.
 * @returns {number}
 */
function gaussian() {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Clamp value between min and max.
 */
function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

/**
 * Advance one OU variable by dt using the Ornstein-Uhlenbeck process:
 *   dX = theta*(mu - X)*dt + sigma*sqrt(dt)*N(0,1)
 * @param {object} variable — { current, mu, sigma, theta, min, max }
 * @param {number} dt
 * @returns {number} new value (clamped)
 */
function _ouStep(variable, dt = 1) {
  const { current, mu, sigma, theta, min, max } = variable;
  const drift = theta * (mu - current) * dt;
  const diffusion = sigma * Math.sqrt(dt) * gaussian();
  return clamp(current + drift + diffusion, min, max);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Initialise OU state for a nation.
 * Calls all 5 _init functions and stores results in nation._ou
 * @param {object} nation
 */
export function initNation(nation) {
  nation._ou = {
    economy:   _initEconomyVector(nation),
    military:  _initMilitaryVector(nation),
    diplomacy: _initDiplomacyVector(nation),
    politics:  _initPoliticsVector(nation),
    goals:     _initGoalsVector(nation),
    tick:      0,
    activeModifiers: [],
  };
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
 * Iterates over all 5 categories in nation._ou and applies _ouStep to each.
 * @param {object} nation
 */
export function updateState(nation) {
  const ou = nation._ou;
  const dt = SUPER_OU_CONFIG.dt;
  const categories = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  for (const cat of categories) {
    for (const variable of ou[cat]) {
      variable.current = _ouStep(variable, dt);
    }
  }
  ou.tick++;
}

// ─── MODIFIER HELPERS ────────────────────────────────────────────────────────

function _findVar(ou, category, name) {
  const arr = ou[category];
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) if (arr[i].name === name) return arr[i];
  return null;
}

/** Temporarily shift mu by delta (stored as _muBase + delta). */
function _applyAdj(ou, adj, ouState, modId) {
  for (const { c, n, d } of adj) {
    const v = _findVar(ou, c, n);
    if (!v) continue;
    if (v._muBase === undefined) v._muBase = v.mu;
    v.mu = clamp(v._muBase + d, v.min, v.max);
    ouState.activeModifiers.push({ id: modId, category: c, name: n, delta: d });
  }
}

/** Reset all mu values back to _muBase before re-evaluating modifiers. */
function _resetMuBases(ou) {
  for (const cat of ['economy','military','diplomacy','politics','goals']) {
    for (const v of ou[cat]) {
      if (v._muBase !== undefined) { v.mu = v._muBase; delete v._muBase; }
    }
  }
}

// ─── SITUATIONAL MODIFIERS — BATCH 1: ECO_001–ECO_010 ───────────────────────
// Античный период 300 до н.э — 476 н.э.: экономические триггеры (зерно, торговля, золото)

const MODIFIERS_BATCH1 = [
  { id:'ECO_001', label:'Голод — нехватка зерна',
    cond:(_n,ou)=>{ const p=_findVar(ou,'economy','food_production'),c=_findVar(ou,'economy','food_consumption'); return p&&c&&p.current<c.current*0.7; },
    adj:[{c:'economy',n:'food_production',d:+0.06},{c:'economy',n:'population_growth',d:-0.025},{c:'economy',n:'tax_revenue',d:-0.04},{c:'military',n:'troop_morale',d:-0.10},{c:'military',n:'food_supply_military',d:-0.12}]
  },
  { id:'ECO_002', label:'Урожайный год — зерновой избыток',
    cond:(_n,ou)=>{ const p=_findVar(ou,'economy','food_production'),c=_findVar(ou,'economy','food_consumption'); return p&&c&&p.current>c.current*1.4; },
    adj:[{c:'economy',n:'food_production',d:-0.04},{c:'economy',n:'population_growth',d:+0.015},{c:'economy',n:'tax_revenue',d:+0.03},{c:'military',n:'troop_morale',d:+0.05}]
  },
  { id:'ECO_003', label:'Торговое процветание — положительный баланс',
    cond:(_n,ou)=>{ const tb=_findVar(ou,'economy','trade_balance'); return tb&&tb.current>0.2; },
    adj:[{c:'economy',n:'gold_reserves',d:+0.04},{c:'economy',n:'gdp_growth',d:+0.02},{c:'economy',n:'consumer_confidence',d:+0.06},{c:'economy',n:'port_activity',d:+0.08}]
  },
  { id:'ECO_004', label:'Торговый кризис — дефицит баланса',
    cond:(_n,ou)=>{ const tb=_findVar(ou,'economy','trade_balance'); return tb&&tb.current<-0.2; },
    adj:[{c:'economy',n:'gold_reserves',d:-0.03},{c:'economy',n:'currency_strength',d:-0.1},{c:'economy',n:'consumer_confidence',d:-0.07},{c:'economy',n:'tax_revenue',d:-0.03}]
  },
  { id:'ECO_005', label:'Истощение казны — золото на исходе',
    cond:(_n,ou)=>{ const gr=_findVar(ou,'economy','gold_reserves'); return gr&&gr.current<0.05; },
    adj:[{c:'economy',n:'military_spending',d:-0.04},{c:'economy',n:'infrastructure_index',d:-0.03},{c:'economy',n:'tax_revenue',d:+0.05},{c:'military',n:'troop_morale',d:-0.06},{c:'military',n:'equipment_quality',d:-0.04}]
  },
  { id:'ECO_006', label:'Полная казна — золотой запас',
    cond:(_n,ou)=>{ const gr=_findVar(ou,'economy','gold_reserves'); return gr&&gr.current>0.75; },
    adj:[{c:'economy',n:'military_spending',d:+0.02},{c:'economy',n:'construction_activity',d:+0.06},{c:'economy',n:'consumer_confidence',d:+0.05},{c:'military',n:'equipment_quality',d:+0.03}]
  },
  { id:'ECO_007', label:'Долговой кризис — непосильный долг',
    cond:(_n,ou)=>{ const dr=_findVar(ou,'economy','debt_ratio'); return dr&&dr.current>2.0; },
    adj:[{c:'economy',n:'interest_rate',d:+0.04},{c:'economy',n:'gdp_growth',d:-0.03},{c:'economy',n:'currency_strength',d:-0.08},{c:'economy',n:'consumer_confidence',d:-0.08}]
  },
  { id:'ECO_008', label:'Экономический подъём — высокий рост ВВП',
    cond:(_n,ou)=>{ const g=_findVar(ou,'economy','gdp_growth'); return g&&g.current>0.10; },
    adj:[{c:'economy',n:'tax_revenue',d:+0.04},{c:'economy',n:'consumer_confidence',d:+0.07},{c:'economy',n:'construction_activity',d:+0.05},{c:'military',n:'military_readiness',d:+0.04}]
  },
  { id:'ECO_009', label:'Экономический спад — рецессия',
    cond:(_n,ou)=>{ const g=_findVar(ou,'economy','gdp_growth'); return g&&g.current<-0.05; },
    adj:[{c:'economy',n:'unemployment_rate',d:+0.05},{c:'economy',n:'tax_revenue',d:-0.04},{c:'economy',n:'consumer_confidence',d:-0.08},{c:'military',n:'troop_morale',d:-0.05}]
  },
  { id:'ECO_010', label:'Высокая инфляция — обесценивание монеты',
    cond:(_n,ou)=>{ const ir=_findVar(ou,'economy','inflation_rate'); return ir&&ir.current>0.20; },
    adj:[{c:'economy',n:'currency_strength',d:-0.12},{c:'economy',n:'savings_rate',d:-0.04},{c:'economy',n:'consumer_confidence',d:-0.06},{c:'economy',n:'wage_growth',d:+0.04}]
  },
];

/**
 * Apply situational modifiers to OU mu values.
 * @param {object} nation
 * @param {object} ouState
 */
// ─── BATCH 2: ECO_011–ECO_020 ────────────────────────────────────────────────
// Дефляция, безработица, инфраструктура, горная добыча, аграрный кризис

const MODIFIERS_BATCH2 = [
  { id:'ECO_011', label:'Дефляция — падение цен',
    cond:(_n,ou)=>{ const ir=_findVar(ou,'economy','inflation_rate'); return ir&&ir.current<-0.02; },
    adj:[{c:'economy',n:'gdp_growth',d:-0.02},{c:'economy',n:'debt_ratio',d:+0.05},{c:'economy',n:'consumer_confidence',d:-0.04},{c:'economy',n:'business_confidence',d:-0.05}]
  },
  { id:'ECO_012', label:'Высокая безработица — избыток рабочей силы',
    cond:(_n,ou)=>{ const u=_findVar(ou,'economy','unemployment_rate'); return u&&u.current>0.20; },
    adj:[{c:'economy',n:'gdp_growth',d:-0.03},{c:'economy',n:'tax_revenue',d:-0.03},{c:'economy',n:'poverty_rate',d:+0.06},{c:'military',n:'conscription_rate',d:+0.03}]
  },
  { id:'ECO_013', label:'Полная занятость — дефицит рабочей силы',
    cond:(_n,ou)=>{ const u=_findVar(ou,'economy','unemployment_rate'); return u&&u.current<0.03; },
    adj:[{c:'economy',n:'wage_growth',d:+0.04},{c:'economy',n:'inflation_rate',d:+0.03},{c:'economy',n:'productivity_growth',d:+0.02},{c:'economy',n:'consumer_confidence',d:+0.06}]
  },
  { id:'ECO_014', label:'Упадок инфраструктуры — дороги и акведуки в руинах',
    cond:(_n,ou)=>{ const ii=_findVar(ou,'economy','infrastructure_index'); return ii&&ii.current<0.25; },
    adj:[{c:'economy',n:'logistics_efficiency',d:-0.08},{c:'economy',n:'trade_volume',d:-0.05},{c:'economy',n:'agricultural_output',d:-0.04},{c:'military',n:'logistics_capacity',d:-0.07}]
  },
  { id:'ECO_015', label:'Строительный бум — активное возведение городов',
    cond:(_n,ou)=>{ const ca=_findVar(ou,'economy','construction_activity'); return ca&&ca.current>1.0; },
    adj:[{c:'economy',n:'infrastructure_index',d:+0.03},{c:'economy',n:'unemployment_rate',d:-0.03},{c:'economy',n:'gdp_growth',d:+0.02},{c:'economy',n:'urbanization_rate',d:+0.02}]
  },
  { id:'ECO_016', label:'Рудный бум — богатые месторождения',
    cond:(_n,ou)=>{ const mo=_findVar(ou,'economy','mining_output'); return mo&&mo.current>1.2; },
    adj:[{c:'economy',n:'gold_reserves',d:+0.05},{c:'economy',n:'raw_materials_stock',d:+0.08},{c:'economy',n:'export_volume',d:+0.05},{c:'military',n:'equipment_quality',d:+0.03}]
  },
  { id:'ECO_017', label:'Истощение рудников — ресурсы иссякают',
    cond:(_n,ou)=>{ const mo=_findVar(ou,'economy','mining_output'),rd=_findVar(ou,'economy','resource_depletion'); return mo&&rd&&mo.current<0.1&&rd.current>0.70; },
    adj:[{c:'economy',n:'raw_materials_stock',d:-0.06},{c:'economy',n:'export_volume',d:-0.04},{c:'economy',n:'gdp_growth',d:-0.02},{c:'military',n:'equipment_quality',d:-0.04}]
  },
  { id:'ECO_018', label:'Аграрный кризис — неурожай и упадок сельского хозяйства',
    cond:(_n,ou)=>{ const ao=_findVar(ou,'economy','agricultural_output'); return ao&&ao.current<0.12; },
    adj:[{c:'economy',n:'food_production',d:-0.06},{c:'economy',n:'population_growth',d:-0.03},{c:'economy',n:'tax_revenue',d:-0.05},{c:'military',n:'food_supply_military',d:-0.08}]
  },
  { id:'ECO_019', label:'Аграрный избыток — процветание полей',
    cond:(_n,ou)=>{ const ao=_findVar(ou,'economy','agricultural_output'); return ao&&ao.current>0.80; },
    adj:[{c:'economy',n:'food_production',d:+0.05},{c:'economy',n:'population_growth',d:+0.01},{c:'economy',n:'export_volume',d:+0.03},{c:'economy',n:'land_productivity',d:+0.04}]
  },
  { id:'ECO_020', label:'Блокада порта — морская торговля парализована',
    cond:(_n,ou)=>{ const pa=_findVar(ou,'economy','port_activity'); return pa&&pa.current<0.08; },
    adj:[{c:'economy',n:'import_volume',d:-0.08},{c:'economy',n:'export_volume',d:-0.08},{c:'economy',n:'trade_balance',d:-0.06},{c:'military',n:'weapon_imports',d:-0.06}]
  },
];

// ─── BATCH 3: ECO_021–ECO_030 ────────────────────────────────────────────────
// Торговые пути, рабство, чума, население, монета

const MODIFIERS_BATCH3 = [
  { id:'ECO_021', label:'Оживлённые торговые пути — высокий экспорт',
    cond:(_n,ou)=>{ const ev=_findVar(ou,'economy','export_volume'); return ev&&ev.current>1.4; },
    adj:[{c:'economy',n:'gold_reserves',d:+0.03},{c:'economy',n:'trade_balance',d:+0.04},{c:'economy',n:'manufacturing_output',d:+0.04},{c:'economy',n:'port_activity',d:+0.06}]
  },
  { id:'ECO_022', label:'Угроза восстания рабов — критическая зависимость',
    cond:(_n,ou)=>{ const sl=_findVar(ou,'economy','slave_labor_dependency'); return sl&&sl.current>0.85; },
    adj:[{c:'economy',n:'agricultural_output',d:-0.04},{c:'economy',n:'manufacturing_output',d:-0.03},{c:'military',n:'internal_security',d:-0.06},{c:'military',n:'paramilitary',d:+0.05}]
  },
  { id:'ECO_023', label:'Эпидемия чумы — болезнь косит население',
    cond:(_n,ou)=>{ const hc=_findVar(ou,'economy','healthcare_spending'),pg=_findVar(ou,'economy','population_growth'); return hc&&pg&&hc.current<0.02&&pg.current<-0.02; },
    adj:[{c:'economy',n:'labor_participation',d:-0.07},{c:'economy',n:'agricultural_output',d:-0.05},{c:'economy',n:'tax_revenue',d:-0.05},{c:'military',n:'army_size',d:-0.05},{c:'military',n:'troop_morale',d:-0.08}]
  },
  { id:'ECO_024', label:'Демографический рост — процветание населения',
    cond:(_n,ou)=>{ const pg=_findVar(ou,'economy','population_growth'); return pg&&pg.current>0.05; },
    adj:[{c:'economy',n:'labor_participation',d:+0.04},{c:'economy',n:'agricultural_output',d:+0.03},{c:'economy',n:'tax_revenue',d:+0.03},{c:'military',n:'conscription_rate',d:+0.02}]
  },
  { id:'ECO_025', label:'Порча монеты — обесценивание валюты',
    cond:(_n,ou)=>{ const cs=_findVar(ou,'economy','currency_strength'); return cs&&cs.current<0.30; },
    adj:[{c:'economy',n:'inflation_rate',d:+0.07},{c:'economy',n:'trade_balance',d:-0.05},{c:'economy',n:'foreign_investment',d:-0.06},{c:'economy',n:'black_market_size',d:+0.07}]
  },
  { id:'ECO_026', label:'Твёрдая монета — стабильная валюта',
    cond:(_n,ou)=>{ const cs=_findVar(ou,'economy','currency_strength'); return cs&&cs.current>3.0; },
    adj:[{c:'economy',n:'foreign_investment',d:+0.05},{c:'economy',n:'trade_openness',d:+0.04},{c:'economy',n:'consumer_confidence',d:+0.05},{c:'economy',n:'debt_ratio',d:-0.03}]
  },
  { id:'ECO_027', label:'Водный дефицит — засуха опустошает поля',
    cond:(_n,ou)=>{ const wa=_findVar(ou,'economy','water_availability'); return wa&&wa.current<0.20; },
    adj:[{c:'economy',n:'agricultural_output',d:-0.07},{c:'economy',n:'food_production',d:-0.06},{c:'economy',n:'livestock_count',d:-0.06},{c:'economy',n:'land_productivity',d:-0.05}]
  },
  { id:'ECO_028', label:'Технологический прорыв — инновации меняют производство',
    cond:(_n,ou)=>{ const ti=_findVar(ou,'economy','technology_index'); return ti&&ti.current>0.80; },
    adj:[{c:'economy',n:'productivity_growth',d:+0.05},{c:'economy',n:'manufacturing_output',d:+0.06},{c:'economy',n:'gdp_growth',d:+0.03},{c:'military',n:'equipment_quality',d:+0.05}]
  },
  { id:'ECO_029', label:'Технологический застой — упадок знаний',
    cond:(_n,ou)=>{ const ti=_findVar(ou,'economy','technology_index'); return ti&&ti.current<0.10; },
    adj:[{c:'economy',n:'productivity_growth',d:-0.03},{c:'economy',n:'manufacturing_output',d:-0.04},{c:'economy',n:'innovation_rate',d:-0.04},{c:'military',n:'doctrine_quality',d:-0.04}]
  },
  { id:'ECO_030', label:'Рост чёрного рынка — теневая экономика',
    cond:(_n,ou)=>{ const bm=_findVar(ou,'economy','black_market_size'); return bm&&bm.current>0.40; },
    adj:[{c:'economy',n:'tax_revenue',d:-0.05},{c:'economy',n:'monopoly_index',d:+0.04},{c:'economy',n:'corruption',d:+0.06},{c:'military',n:'internal_security',d:-0.04}]
  },
];

// ─── BATCH 4: ECO_031–ECO_040 ────────────────────────────────────────────────
// Налоги, паника, скот, товарные цены, ресурсный дефицит

const MODIFIERS_BATCH4 = [
  { id:'ECO_031', label:'Низкие налоги — казна пустеет',
    cond:(_n,ou)=>{ const tr=_findVar(ou,'economy','tax_revenue'); return tr&&tr.current<0.10; },
    adj:[{c:'economy',n:'gold_reserves',d:-0.03},{c:'economy',n:'military_spending',d:-0.03},{c:'economy',n:'infrastructure_index',d:-0.02},{c:'economy',n:'education_spending',d:-0.02}]
  },
  { id:'ECO_032', label:'Налоговый бунт — высокое бремя и недовольство',
    cond:(_n,ou)=>{ const tr=_findVar(ou,'economy','tax_revenue'),cc=_findVar(ou,'economy','consumer_confidence'); return tr&&cc&&tr.current>0.50&&cc.current<0.30; },
    adj:[{c:'economy',n:'tax_revenue',d:-0.06},{c:'economy',n:'gdp_growth',d:-0.02},{c:'military',n:'internal_security',d:-0.05},{c:'military',n:'paramilitary',d:+0.04}]
  },
  { id:'ECO_033', label:'Паника потребителей — крах доверия',
    cond:(_n,ou)=>{ const cc=_findVar(ou,'economy','consumer_confidence'); return cc&&cc.current<0.20; },
    adj:[{c:'economy',n:'retail_sales',d:-0.08},{c:'economy',n:'gdp_growth',d:-0.04},{c:'economy',n:'savings_rate',d:+0.05},{c:'economy',n:'business_confidence',d:-0.06}]
  },
  { id:'ECO_034', label:'Деловой оптимизм — расцвет торговли',
    cond:(_n,ou)=>{ const bc=_findVar(ou,'economy','business_confidence'); return bc&&bc.current>0.80; },
    adj:[{c:'economy',n:'domestic_investment',d:+0.05},{c:'economy',n:'manufacturing_output',d:+0.04},{c:'economy',n:'gdp_growth',d:+0.03},{c:'economy',n:'construction_activity',d:+0.04}]
  },
  { id:'ECO_035', label:'Ценовой скачок товаров — дефицит на рынках',
    cond:(_n,ou)=>{ const cp=_findVar(ou,'economy','commodity_prices'); return cp&&cp.current>3.0; },
    adj:[{c:'economy',n:'inflation_rate',d:+0.05},{c:'economy',n:'consumer_confidence',d:-0.05},{c:'economy',n:'import_volume',d:+0.04},{c:'military',n:'equipment_quantity',d:-0.04}]
  },
  { id:'ECO_036', label:'Крах товарных цен — перепроизводство',
    cond:(_n,ou)=>{ const cp=_findVar(ou,'economy','commodity_prices'); return cp&&cp.current<0.30; },
    adj:[{c:'economy',n:'mining_output',d:-0.04},{c:'economy',n:'agricultural_output',d:-0.03},{c:'economy',n:'export_volume',d:-0.04},{c:'economy',n:'gdp_growth',d:-0.02}]
  },
  { id:'ECO_037', label:'Нехватка рабочих — убыль населения или войны',
    cond:(_n,ou)=>{ const lp=_findVar(ou,'economy','labor_participation'); return lp&&lp.current<0.30; },
    adj:[{c:'economy',n:'agricultural_output',d:-0.05},{c:'economy',n:'manufacturing_output',d:-0.05},{c:'economy',n:'wage_growth',d:+0.05},{c:'economy',n:'slave_labor_dependency',d:+0.05}]
  },
  { id:'ECO_038', label:'Высококвалифицированная рабочая сила',
    cond:(_n,ou)=>{ const sl=_findVar(ou,'economy','skill_level_index'); return sl&&sl.current>0.80; },
    adj:[{c:'economy',n:'productivity_growth',d:+0.04},{c:'economy',n:'manufacturing_output',d:+0.05},{c:'economy',n:'innovation_rate',d:+0.04},{c:'military',n:'officer_quality',d:+0.03}]
  },
  { id:'ECO_039', label:'Падёж скота — потеря тяглового скота',
    cond:(_n,ou)=>{ const lc=_findVar(ou,'economy','livestock_count'); return lc&&lc.current<0.10; },
    adj:[{c:'economy',n:'agricultural_output',d:-0.06},{c:'economy',n:'food_production',d:-0.05},{c:'economy',n:'land_productivity',d:-0.04},{c:'military',n:'logistics_capacity',d:-0.04}]
  },
  { id:'ECO_040', label:'Великая засуха — вода и земля иссякли',
    cond:(_n,ou)=>{ const wa=_findVar(ou,'economy','water_availability'),lp=_findVar(ou,'economy','land_productivity'); return wa&&lp&&wa.current<0.10&&lp.current<0.20; },
    adj:[{c:'economy',n:'food_production',d:-0.09},{c:'economy',n:'population_growth',d:-0.04},{c:'economy',n:'agricultural_output',d:-0.08},{c:'military',n:'food_supply_military',d:-0.10}]
  },
];

export function applyModifiers(nation, ouState) {
  const ou = nation._ou;
  ouState.activeModifiers = [];
  _resetMuBases(ou);

// ─── BATCH 5: ECO_041–ECO_050 ────────────────────────────────────────────────
// Цепочки поставок, монополии, военные расходы, энергия, запасы

const MODIFIERS_BATCH5 = [
  { id:'ECO_041', label:'Разрыв цепочки поставок — логистический коллапс',
    cond:(_n,ou)=>{ const sc=_findVar(ou,'economy','supply_chain_index'); return sc&&sc.current<0.20; },
    adj:[{c:'economy',n:'manufacturing_output',d:-0.07},{c:'economy',n:'retail_sales',d:-0.06},{c:'economy',n:'finished_goods_stock',d:-0.05},{c:'military',n:'logistics_capacity',d:-0.06}]
  },
  { id:'ECO_042', label:'Монопольный контроль — картели душат рынок',
    cond:(_n,ou)=>{ const mi=_findVar(ou,'economy','monopoly_index'); return mi&&mi.current>0.70; },
    adj:[{c:'economy',n:'market_competition',d:-0.07},{c:'economy',n:'consumer_confidence',d:-0.05},{c:'economy',n:'innovation_rate',d:-0.04},{c:'economy',n:'gdp_growth',d:-0.02}]
  },
  { id:'ECO_043', label:'Волна инноваций — новые технологии',
    cond:(_n,ou)=>{ const ir=_findVar(ou,'economy','innovation_rate'); return ir&&ir.current>0.70; },
    adj:[{c:'economy',n:'productivity_growth',d:+0.05},{c:'economy',n:'technology_index',d:+0.04},{c:'economy',n:'gdp_growth',d:+0.03},{c:'military',n:'doctrine_quality',d:+0.04}]
  },
  { id:'ECO_044', label:'Чрезмерные военные расходы — экономика на службе войны',
    cond:(_n,ou)=>{ const ms=_findVar(ou,'economy','military_spending'); return ms&&ms.current>0.20; },
    adj:[{c:'economy',n:'domestic_investment',d:-0.06},{c:'economy',n:'infrastructure_index',d:-0.03},{c:'economy',n:'education_spending',d:-0.03},{c:'military',n:'military_readiness',d:+0.06}]
  },
  { id:'ECO_045', label:'Субсидионная зависимость — государство кормит граждан',
    cond:(_n,ou)=>{ const sl=_findVar(ou,'economy','subsidy_level'); return sl&&sl.current>0.40; },
    adj:[{c:'economy',n:'tax_revenue',d:-0.04},{c:'economy',n:'debt_ratio',d:+0.04},{c:'economy',n:'consumer_confidence',d:+0.04},{c:'economy',n:'market_competition',d:-0.03}]
  },
  { id:'ECO_046', label:'Торговая изоляция — закрытые границы',
    cond:(_n,ou)=>{ const to=_findVar(ou,'economy','trade_openness'); return to&&to.current<0.10; },
    adj:[{c:'economy',n:'export_volume',d:-0.07},{c:'economy',n:'import_volume',d:-0.07},{c:'economy',n:'foreign_investment',d:-0.06},{c:'economy',n:'technology_index',d:-0.03}]
  },
  { id:'ECO_047', label:'Бунт голодных — неравенство и нищета',
    cond:(_n,ou)=>{ const gi=_findVar(ou,'economy','gini_coefficient'),pr=_findVar(ou,'economy','poverty_rate'); return gi&&pr&&gi.current>0.75&&pr.current>0.50; },
    adj:[{c:'economy',n:'tax_revenue',d:-0.05},{c:'economy',n:'gdp_growth',d:-0.03},{c:'military',n:'internal_security',d:-0.07},{c:'military',n:'paramilitary',d:+0.05}]
  },
  { id:'ECO_048', label:'Крах мануфактур — упадок ремёсел',
    cond:(_n,ou)=>{ const mo=_findVar(ou,'economy','manufacturing_output'); return mo&&mo.current<0.10; },
    adj:[{c:'economy',n:'export_volume',d:-0.05},{c:'economy',n:'unemployment_rate',d:+0.05},{c:'economy',n:'finished_goods_stock',d:-0.06},{c:'military',n:'equipment_quantity',d:-0.05}]
  },
  { id:'ECO_049', label:'Энергетический кризис — дефицит дров и масла',
    cond:(_n,ou)=>{ const ep=_findVar(ou,'economy','energy_production'),ec=_findVar(ou,'economy','energy_consumption'); return ep&&ec&&ep.current<ec.current*0.60; },
    adj:[{c:'economy',n:'manufacturing_output',d:-0.06},{c:'economy',n:'agricultural_output',d:-0.03},{c:'economy',n:'gdp_growth',d:-0.03},{c:'military',n:'logistics_capacity',d:-0.04}]
  },
  { id:'ECO_050', label:'Пресыщение рынка — склады ломятся от товаров',
    cond:(_n,ou)=>{ const fg=_findVar(ou,'economy','finished_goods_stock'); return fg&&fg.current>1.50; },
    adj:[{c:'economy',n:'commodity_prices',d:-0.08},{c:'economy',n:'manufacturing_output',d:-0.04},{c:'economy',n:'business_confidence',d:-0.04},{c:'economy',n:'export_volume',d:+0.05}]
  },
];

// ─── BATCH 6: MIL_001–MIL_010 ────────────────────────────────────────────────
// Война, мобилизация, усталость, дезертирство, моральный дух

const MODIFIERS_BATCH6 = [
  { id:'MIL_001', label:'Активная война — легионы в походе',
    cond:(_n,ou)=>{ const ac=_findVar(ou,'military','active_conflicts'); return ac&&ac.current>0.50; },
    adj:[{c:'military',n:'war_exhaustion',d:+0.06},{c:'military',n:'casualty_rate',d:+0.04},{c:'economy',n:'military_spending',d:+0.06},{c:'economy',n:'gold_reserves',d:-0.04}]
  },
  { id:'MIL_002', label:'Военное истощение — войска измотаны',
    cond:(_n,ou)=>{ const we=_findVar(ou,'military','war_exhaustion'); return we&&we.current>0.70; },
    adj:[{c:'military',n:'troop_morale',d:-0.10},{c:'military',n:'military_readiness',d:-0.08},{c:'military',n:'desertion_rate',d:+0.08},{c:'economy',n:'consumer_confidence',d:-0.06}]
  },
  { id:'MIL_003', label:'Массовое дезертирство — армия распадается',
    cond:(_n,ou)=>{ const dr=_findVar(ou,'military','desertion_rate'); return dr&&dr.current>0.20; },
    adj:[{c:'military',n:'army_size',d:-0.06},{c:'military',n:'troop_morale',d:-0.08},{c:'military',n:'military_readiness',d:-0.07},{c:'military',n:'internal_security',d:-0.05}]
  },
  { id:'MIL_004', label:'Закалённые ветераны — опытная элитная армия',
    cond:(_n,ou)=>{ const vr=_findVar(ou,'military','veteran_ratio'),tm=_findVar(ou,'military','troop_morale'); return vr&&tm&&vr.current>0.70&&tm.current>0.80; },
    adj:[{c:'military',n:'military_readiness',d:+0.08},{c:'military',n:'doctrine_quality',d:+0.05},{c:'military',n:'force_multiplier',d:+0.10},{c:'military',n:'officer_quality',d:+0.04}]
  },
  { id:'MIL_005', label:'Крах боевого духа — армия не хочет воевать',
    cond:(_n,ou)=>{ const tm=_findVar(ou,'military','troop_morale'); return tm&&tm.current<0.20; },
    adj:[{c:'military',n:'military_readiness',d:-0.10},{c:'military',n:'desertion_rate',d:+0.10},{c:'military',n:'coup_risk',d:+0.06},{c:'military',n:'conscription_rate',d:+0.05}]
  },
  { id:'MIL_006', label:'Осадная война — осада крепостей',
    cond:(_n,ou)=>{ const se=_findVar(ou,'military','siege_engineering'),fl=_findVar(ou,'military','fortification_level'); return se&&fl&&se.current>0.70&&fl.current>0.60; },
    adj:[{c:'military',n:'active_conflicts',d:+0.04},{c:'military',n:'ammunition_stock',d:-0.06},{c:'military',n:'force_multiplier',d:+0.07},{c:'economy',n:'construction_activity',d:-0.04}]
  },
  { id:'MIL_007', label:'Разрыв линий снабжения — армия без еды и оружия',
    cond:(_n,ou)=>{ const lc=_findVar(ou,'military','logistics_capacity'); return lc&&lc.current<0.20; },
    adj:[{c:'military',n:'food_supply_military',d:-0.09},{c:'military',n:'ammunition_stock',d:-0.07},{c:'military',n:'troop_morale',d:-0.08},{c:'military',n:'military_readiness',d:-0.08}]
  },
  { id:'MIL_008', label:'Господство на море — флот контролирует воды',
    cond:(_n,ou)=>{ const ns=_findVar(ou,'military','navy_size'),nv=_findVar(ou,'military','naval_vessels'); return ns&&nv&&ns.current>0.80&&nv.current>1.0; },
    adj:[{c:'military',n:'naval_power_projection',d:+0.10},{c:'military',n:'amphibious_ops',d:+0.07},{c:'economy',n:'port_activity',d:+0.07},{c:'economy',n:'trade_balance',d:+0.05}]
  },
  { id:'MIL_009', label:'Слабый флот — уязвимое побережье',
    cond:(_n,ou)=>{ const ns=_findVar(ou,'military','navy_size'); return ns&&ns.current<0.05; },
    adj:[{c:'military',n:'coastal_defense',d:-0.07},{c:'military',n:'naval_power_projection',d:-0.08},{c:'economy',n:'port_activity',d:-0.05},{c:'economy',n:'trade_balance',d:-0.03}]
  },
  { id:'MIL_010', label:'Неприступные укрепления — мощные стены и форты',
    cond:(_n,ou)=>{ const fl=_findVar(ou,'military','fortification_level'); return fl&&fl.current>0.80; },
    adj:[{c:'military',n:'border_control',d:+0.07},{c:'military',n:'strategic_depth',d:+0.05},{c:'military',n:'internal_security',d:+0.04},{c:'military',n:'siege_engineering',d:-0.03}]
  },
];

// ─── BATCH 7: MIL_011–MIL_020 ────────────────────────────────────────────────
// Пограничный контроль, переворот, лояльность, офицеры, боеприпасы

const MODIFIERS_BATCH7 = [
  { id:'MIL_011', label:'Открытые границы — варвары проникают внутрь',
    cond:(_n,ou)=>{ const fl=_findVar(ou,'military','fortification_level'),bc=_findVar(ou,'military','border_control'); return fl&&bc&&fl.current<0.10&&bc.current<0.20; },
    adj:[{c:'military',n:'internal_security',d:-0.07},{c:'military',n:'guerrilla_capacity',d:+0.05},{c:'economy',n:'agricultural_output',d:-0.04},{c:'military',n:'intelligence_quality',d:-0.04}]
  },
  { id:'MIL_012', label:'Угроза военного переворота — заговор офицеров',
    cond:(_n,ou)=>{ const cr=_findVar(ou,'military','coup_risk'); return cr&&cr.current>0.50; },
    adj:[{c:'military',n:'military_loyalty',d:-0.07},{c:'military',n:'command_coordination',d:-0.07},{c:'military',n:'internal_security',d:-0.06},{c:'military',n:'military_political_power',d:+0.07}]
  },
  { id:'MIL_013', label:'Абсолютная лояльность армии — преданность командирам',
    cond:(_n,ou)=>{ const ml=_findVar(ou,'military','military_loyalty'); return ml&&ml.current>0.90; },
    adj:[{c:'military',n:'coup_risk',d:-0.07},{c:'military',n:'troop_morale',d:+0.06},{c:'military',n:'command_coordination',d:+0.05},{c:'military',n:'internal_security',d:+0.05}]
  },
  { id:'MIL_014', label:'Предательство армии — войска переходят на сторону врага',
    cond:(_n,ou)=>{ const ml=_findVar(ou,'military','military_loyalty'); return ml&&ml.current<0.30; },
    adj:[{c:'military',n:'coup_risk',d:+0.09},{c:'military',n:'army_size',d:-0.05},{c:'military',n:'military_readiness',d:-0.07},{c:'military',n:'desertion_rate',d:+0.07}]
  },
  { id:'MIL_015', label:'Слабый командный состав — некомпетентные центурионы',
    cond:(_n,ou)=>{ const oq=_findVar(ou,'military','officer_quality'); return oq&&oq.current<0.20; },
    adj:[{c:'military',n:'doctrine_quality',d:-0.06},{c:'military',n:'command_coordination',d:-0.08},{c:'military',n:'military_training',d:-0.05},{c:'military',n:'force_multiplier',d:-0.07}]
  },
  { id:'MIL_016', label:'Выдающиеся полководцы — армия под умелым командованием',
    cond:(_n,ou)=>{ const oq=_findVar(ou,'military','officer_quality'); return oq&&oq.current>0.80; },
    adj:[{c:'military',n:'doctrine_quality',d:+0.06},{c:'military',n:'command_coordination',d:+0.08},{c:'military',n:'force_multiplier',d:+0.09},{c:'military',n:'troop_morale',d:+0.05}]
  },
  { id:'MIL_017', label:'Нехватка снарядов и оружия',
    cond:(_n,ou)=>{ const as=_findVar(ou,'military','ammunition_stock'); return as&&as.current<0.10; },
    adj:[{c:'military',n:'military_readiness',d:-0.09},{c:'military',n:'force_multiplier',d:-0.08},{c:'military',n:'active_conflicts',d:-0.05},{c:'military',n:'arms_stockpile',d:-0.06}]
  },
  { id:'MIL_018', label:'Полные арсеналы — запасы оружия в избытке',
    cond:(_n,ou)=>{ const as=_findVar(ou,'military','ammunition_stock'); return as&&as.current>1.50; },
    adj:[{c:'military',n:'military_readiness',d:+0.06},{c:'military',n:'force_multiplier',d:+0.05},{c:'military',n:'weapon_exports',d:+0.04},{c:'military',n:'military_industry',d:+0.03}]
  },
  { id:'MIL_019', label:'Стратегические резервы готовы — скрытые силы',
    cond:(_n,ou)=>{ const sr=_findVar(ou,'military','strategic_reserves'); return sr&&sr.current>0.70; },
    adj:[{c:'military',n:'mobilization_speed',d:+0.06},{c:'military',n:'force_multiplier',d:+0.05},{c:'military',n:'strategic_depth',d:+0.04},{c:'military',n:'war_exhaustion',d:-0.04}]
  },
  { id:'MIL_020', label:'Резервы истощены — нечем прикрыть фланги',
    cond:(_n,ou)=>{ const sr=_findVar(ou,'military','strategic_reserves'); return sr&&sr.current<0.10; },
    adj:[{c:'military',n:'mobilization_speed',d:-0.05},{c:'military',n:'strategic_depth',d:-0.06},{c:'military',n:'military_readiness',d:-0.05},{c:'military',n:'war_exhaustion',d:+0.05}]
  },
];

  const allMods = [
    ...MODIFIERS_BATCH1, ...MODIFIERS_BATCH2,
    ...MODIFIERS_BATCH3, ...MODIFIERS_BATCH4,
    ...MODIFIERS_BATCH5, ...MODIFIERS_BATCH6,
    ...MODIFIERS_BATCH7,
  ];
  for (const mod of allMods) {
    if (mod.cond(nation, ou)) _applyAdj(ou, mod.adj, ouState, mod.id);
  }
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

