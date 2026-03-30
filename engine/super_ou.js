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

/** Get current value of an OU variable by category + name. */
function _getVal(ouState, category, name) {
  const arr = ouState[category];
  if (!arr) return 0;
  const v = arr.find(x => x.name === name);
  return v ? v.current : 0;
}

/** Temporarily shift mu of a variable; record in activeModifiers. */
function _mod(ouState, modName, category, varName, deltaMu, duration = 6) {
  if (!ouState.activeModifiers) ouState.activeModifiers = [];
  const existing = ouState.activeModifiers.find(m => m.name === modName);
  if (existing) {
    existing.duration = Math.max(existing.duration, duration);
    return;
  }
  const arr = ouState[category];
  if (arr) {
    const v = arr.find(x => x.name === varName);
    if (v) {
      const cap = SUPER_OU_CONFIG.modifierCapMu;
      v.mu = Math.min(cap, Math.max(0.02, v.mu + deltaMu));
    }
  }
  ouState.activeModifiers.push({ name: modName, category, varName, deltaMu, duration });
}

/** Tick down active modifiers; reverse mu shift when expired. */
function _decayModifiers(ouState) {
  if (!ouState.activeModifiers) return;
  ouState.activeModifiers = ouState.activeModifiers.filter(m => {
    m.duration--;
    if (m.duration <= 0) {
      const arr = ouState[m.category];
      if (arr) {
        const v = arr.find(x => x.name === m.varName);
        if (v) v.mu = Math.min(SUPER_OU_CONFIG.modifierCapMu, Math.max(0.02, v.mu - m.deltaMu));
      }
      return false;
    }
    return true;
  });
}

// ─── GROUP 1 — ECONOMIC: HARVEST & AGRICULTURE ───────────────────────────────

function _modGroup1_Harvest(ou) {
  const fp  = _getVal(ou, 'economy', 'food_production');
  const fc  = _getVal(ou, 'economy', 'food_consumption');
  const ao  = _getVal(ou, 'economy', 'agricultural_output');
  const lp  = _getVal(ou, 'economy', 'land_productivity');
  const wa  = _getVal(ou, 'economy', 'water_availability');
  const lc  = _getVal(ou, 'economy', 'livestock_count');
  const sl  = _getVal(ou, 'economy', 'slave_labor_dependency');

  if (fp > 0.85)                        _mod(ou, 'bumper_harvest',        'economy', 'agricultural_output',  +0.12, 4);
  if (fp < 0.2)                         _mod(ou, 'harvest_failure',       'economy', 'food_production',      -0.15, 5);
  if (wa < 0.2)                         _mod(ou, 'drought',               'economy', 'land_productivity',    -0.18, 6);
  if (ao < 0.12)                        _mod(ou, 'locust_plague',         'economy', 'food_production',      -0.25, 4);
  if (lp > 0.75 && wa > 0.6)           _mod(ou, 'irrigation_boom',       'economy', 'land_productivity',    +0.10, 8);
  if (lc < 0.18)                        _mod(ou, 'livestock_epidemic',    'economy', 'food_production',      -0.12, 5);
  if (fp - fc > 0.3)                    _mod(ou, 'grain_surplus',         'economy', 'trade_balance',        +0.10, 4);
  if (fp < fc * 0.55)                   _mod(ou, 'famine_crisis',         'economy', 'population_growth',    -0.04, 6);
  if (ao > 0.85)                        _mod(ou, 'olive_harvest_boom',    'economy', 'export_volume',        +0.12, 3);
  if (sl > 0.8 && ao < 0.35)           _mod(ou, 'slave_revolt_agri',     'economy', 'agricultural_output',  -0.15, 4);
}

// ─── GROUP 2 — ECONOMIC: TRADE & COMMERCE ────────────────────────────────────

function _modGroup2_Trade(ou) {
  const to  = _getVal(ou, 'economy', 'trade_openness');
  const tb  = _getVal(ou, 'economy', 'trade_balance');
  const pa  = _getVal(ou, 'economy', 'port_activity');
  const fi  = _getVal(ou, 'economy', 'foreign_investment');
  const cc  = _getVal(ou, 'economy', 'consumer_confidence');
  const cs  = _getVal(ou, 'economy', 'currency_strength');

  if (to > 0.7)                         _mod(ou, 'trade_route_open',      'economy', 'export_volume',        +0.12, 5);
  if (tb < -0.3)                        _mod(ou, 'trade_route_blocked',   'economy', 'import_volume',        -0.12, 4);
  if (pa > 0.65 && tb < 0.1)           _mod(ou, 'piracy_spike',          'economy', 'trade_balance',        -0.10, 4);
  if (tb > 0.22)                        _mod(ou, 'merchant_prosperity',   'economy', 'gold_reserves',        +0.08, 5);
  if (cc < 0.2)                         _mod(ou, 'market_collapse',       'economy', 'retail_sales',         -0.15, 5);
  if (fi > 0.32)                        _mod(ou, 'foreign_trade_boom',    'economy', 'export_volume',        +0.10, 5);
  if (to > 0.6 && pa > 0.5)            _mod(ou, 'silk_road_access',      'economy', 'import_volume',        +0.10, 6);
  if (pa > 0.8)                         _mod(ou, 'port_expansion',        'economy', 'logistics_efficiency', +0.10, 7);
  if (to < 0.18)                        _mod(ou, 'trade_embargo',         'economy', 'export_volume',        -0.18, 5);
  if (cs < 0.35)                        _mod(ou, 'currency_debasement',   'economy', 'inflation_rate',       +0.18, 5);
}

// ─── GROUP 3 — ECONOMIC: INFRASTRUCTURE & RESOURCES ──────────────────────────

function _modGroup3_Infra(ou) {
  const rn  = _getVal(ou, 'economy', 'road_network_index');
  const mo  = _getVal(ou, 'economy', 'mining_output');
  const rd  = _getVal(ou, 'economy', 'resource_depletion');
  const ii  = _getVal(ou, 'economy', 'infrastructure_index');
  const fo  = _getVal(ou, 'economy', 'forestry_output');
  const rm  = _getVal(ou, 'economy', 'raw_materials_stock');
  const pa  = _getVal(ou, 'economy', 'port_activity');

  if (rn > 0.72)                        _mod(ou, 'road_construction_boom','economy', 'logistics_efficiency', +0.10, 8);
  if (mo > 0.82)                        _mod(ou, 'mine_discovery',        'economy', 'gold_reserves',        +0.12, 5);
  if (rd > 0.82)                        _mod(ou, 'mine_exhaustion',       'economy', 'mining_output',        -0.14, 6);
  if (ii > 0.76)                        _mod(ou, 'aqueduct_built',        'economy', 'population_growth',    +0.02, 9);
  if (pa > 0.72 && rn > 0.5)           _mod(ou, 'harbor_improvement',    'economy', 'export_volume',        +0.10, 6);
  if (rn < 0.18)                        _mod(ou, 'road_network_decay',    'economy', 'logistics_efficiency', -0.12, 6);
  if (fo < 0.14)                        _mod(ou, 'forest_depletion',      'economy', 'construction_activity',-0.12, 5);
  if (rm < 0.18)                        _mod(ou, 'iron_supply_crisis',    'economy', 'manufacturing_output', -0.15, 5);
  if (fo > 0.82)                        _mod(ou, 'timber_surplus',        'economy', 'construction_activity',+0.12, 4);
  if (mo > 0.72)                        _mod(ou, 'quarry_boom',           'economy', 'construction_activity',+0.10, 5);
}

// ─── GROUP 4 — ECONOMIC: TAXATION & FINANCE ──────────────────────────────────

function _modGroup4_Finance(ou) {
  const tr  = _getVal(ou, 'economy', 'tax_revenue');
  const ci  = _getVal(ou, 'economy', 'corruption_index');
  const dr  = _getVal(ou, 'economy', 'debt_ratio');
  const gr  = _getVal(ou, 'economy', 'gold_reserves');
  const ir  = _getVal(ou, 'economy', 'inflation_rate');
  const bs  = _getVal(ou, 'economy', 'banking_stability');
  const ca  = _getVal(ou, 'economy', 'credit_availability');

  if (tr > 0.5)                         _mod(ou, 'high_tax_revolt',       'economy', 'consumer_confidence',  -0.12, 4);
  if (ci < 0.2)                         _mod(ou, 'tax_collection_boom',   'economy', 'tax_revenue',          +0.10, 5);
  if (ci > 0.62)                        _mod(ou, 'corrupt_tax_farming',   'economy', 'tax_revenue',          -0.12, 5);
  if (dr > 2.0)                         _mod(ou, 'debt_crisis',           'economy', 'gold_reserves',        -0.15, 5);
  if (gr > 0.72)                        _mod(ou, 'treasury_surplus',      'economy', 'domestic_investment',  +0.10, 5);
  if (gr > 0.82)                        _mod(ou, 'silver_mine_windfall',  'economy', 'currency_strength',    +0.14, 4);
  if (ir > 0.4)                         _mod(ou, 'inflation_spiral',      'economy', 'consumer_confidence',  -0.14, 5);
  if (ir < -0.01)                       _mod(ou, 'deflation_trap',        'economy', 'gdp_growth',           -0.08, 5);
  if (bs < 0.2)                         _mod(ou, 'banking_panic',         'economy', 'credit_availability',  -0.18, 4);
  if (ca > 0.82)                        _mod(ou, 'lending_boom',          'economy', 'domestic_investment',  +0.12, 5);
}

// ─── GROUP 5 — ECONOMIC: CRISIS & RECOVERY ───────────────────────────────────

function _modGroup5_Crisis(ou) {
  const pg  = _getVal(ou, 'economy', 'population_growth');
  const ms  = _getVal(ou, 'economy', 'military_spending');
  const sl  = _getVal(ou, 'economy', 'slave_labor_dependency');
  const gg  = _getVal(ou, 'economy', 'gdp_growth');
  const gn  = _getVal(ou, 'economy', 'gini_coefficient');
  const ur  = _getVal(ou, 'economy', 'urbanization_rate');

  if (pg < -0.02)                       _mod(ou, 'plague_economic',       'economy', 'labor_participation',  -0.14, 6);
  if (ms > 0.2)                         _mod(ou, 'war_economy',           'economy', 'consumer_confidence',  -0.10, 5);
  if (ms < 0.015)                       _mod(ou, 'post_war_recovery',     'economy', 'construction_activity',+0.12, 6);
  if (sl > 0.62)                        _mod(ou, 'slave_supply_increase', 'economy', 'agricultural_output',  +0.10, 5);
  if (sl < 0.28)                        _mod(ou, 'slave_manumission',     'economy', 'wage_growth',          +0.06, 5);
  if (gg > 0.1)                         _mod(ou, 'economic_boom',         'economy', 'consumer_confidence',  +0.14, 5);
  if (gg < -0.05)                       _mod(ou, 'economic_recession',    'economy', 'tax_revenue',          -0.10, 5);
  if (gn > 0.76)                        _mod(ou, 'gini_crisis',           'economy', 'consumer_confidence',  -0.12, 5);
  if (ur > 0.72)                        _mod(ou, 'urbanization_boom',     'economy', 'manufacturing_output', +0.10, 6);
  if (ur > 0.62 && pg > 0.005)         _mod(ou, 'rural_exodus',          'economy', 'agricultural_output',  -0.09, 5);
}

// ─── GROUP 6 — MILITARY: WARFARE STATE ───────────────────────────────────────

function _modGroup6_Warfare(ou) {
  const ac  = _getVal(ou, 'military', 'active_conflicts');
  const we  = _getVal(ou, 'military', 'war_exhaustion');
  const cr  = _getVal(ou, 'military', 'casualty_rate');
  const ml  = _getVal(ou, 'military', 'military_loyalty');
  const fe  = _getVal(ou, 'military', 'military_experience');
  const sl2 = _getVal(ou, 'military', 'supply_line_security');
  const gr  = _getVal(ou, 'economy',  'gold_reserves');

  if (ac > 0.5)                         _mod(ou, 'at_war_drain',          'economy', 'gold_reserves',        -0.12, 5);
  if (ac > 0.5 && we < 0.25)           _mod(ou, 'victory_euphoria',      'military', 'troop_morale',         +0.14, 4);
  if (ac > 0.3 && cr > 0.2)            _mod(ou, 'defeat_demoralisation', 'military', 'troop_morale',         -0.15, 5);
  if (ac > 0.4 && sl2 < 0.35)          _mod(ou, 'siege_under_way',       'economy', 'food_production',      -0.10, 4);
  if (ac > 0.6 && we > 0.6)            _mod(ou, 'war_exhaustion_peak',   'military', 'troop_morale',         -0.18, 5);
  if (ac > 0.3 && we < 0.15 && fe>0.6) _mod(ou, 'quick_victory',        'economy', 'gold_reserves',        +0.10, 4);
  if (ac > 0.4 && we > 0.4)            _mod(ou, 'prolonged_campaign',    'military', 'supply_line_security', -0.12, 5);
  if (ac > 0.0 && ac < 0.25)           _mod(ou, 'border_skirmish',       'economy', 'gold_reserves',        -0.05, 3);
  if (ml < 0.3 && ac > 0.2)            _mod(ou, 'civil_war_outbreak',    'military', 'army_size',            -0.15, 6);
  if (cr > 0.3)                         _mod(ou, 'heavy_casualties',      'military', 'reserve_forces',       -0.14, 5);
}

// ─── GROUP 7 — MILITARY: ARMY QUALITY ────────────────────────────────────────

function _modGroup7_ArmyQuality(ou) {
  const oq  = _getVal(ou, 'military', 'officer_quality');
  const vr  = _getVal(ou, 'military', 'veteran_ratio');
  const dr  = _getVal(ou, 'military', 'desertion_rate');
  const mt  = _getVal(ou, 'military', 'military_training');
  const eq  = _getVal(ou, 'military', 'equipment_quality');
  const cr2 = _getVal(ou, 'military', 'conscription_rate');
  const fe2 = _getVal(ou, 'military', 'military_experience');
  const gr2 = _getVal(ou, 'economy',  'gold_reserves');

  if (vr > 0.6 && oq > 0.6)            _mod(ou, 'elite_unit_formation',  'military', 'military_readiness',   +0.12, 6);
  if (gr2 > 0.5 && oq < 0.4)           _mod(ou, 'mercenary_influx',      'military', 'army_size',            +0.10, 4);
  if (gr2 < 0.2 && oq < 0.4)           _mod(ou, 'mercenary_defection',   'military', 'army_size',            -0.10, 4);
  if (vr > 0.5 && fe2 > 0.5)           _mod(ou, 'veteran_cohort',        'military', 'military_readiness',   +0.10, 6);
  if (cr2 > 0.35)                       _mod(ou, 'conscript_army',        'military', 'military_readiness',   -0.10, 5);
  if (mt > 0.75)                        _mod(ou, 'drill_reform',          'military', 'command_coordination', +0.10, 7);
  if (eq < 0.2)                         _mod(ou, 'equipment_shortage',    'military', 'military_readiness',   -0.14, 5);
  if (eq > 0.75)                        _mod(ou, 'new_weapon_tech',       'military', 'military_readiness',   +0.12, 6);
  if (oq < 0.25)                        _mod(ou, 'officer_corruption',    'military', 'command_coordination', -0.12, 5);
  if (dr > 0.25)                        _mod(ou, 'soldier_desertion',     'military', 'army_size',            -0.12, 4);
}

// ─── GROUP 8 — MILITARY: NAVAL & LOGISTICS ───────────────────────────────────

function _modGroup8_Naval(ou) {
  const nv  = _getVal(ou, 'military', 'naval_vessels');
  const ns  = _getVal(ou, 'military', 'navy_size');
  const sl3 = _getVal(ou, 'military', 'supply_line_security');
  const lc  = _getVal(ou, 'military', 'logistics_capacity');
  const fp  = _getVal(ou, 'economy',  'food_production');
  const pa2 = _getVal(ou, 'economy',  'port_activity');
  const np  = _getVal(ou, 'military', 'naval_power_projection');

  if (nv > 0.7 && ns > 0.6)            _mod(ou, 'fleet_expansion',       'military', 'naval_power_projection',+0.12, 7);
  if (ns < 0.2 && np > 0.3)            _mod(ou, 'naval_defeat',          'military', 'naval_power_projection',-0.15, 5);
  if (sl3 > 0.75 && lc > 0.6)          _mod(ou, 'supply_line_secured',   'military', 'logistics_capacity',   +0.10, 6);
  if (sl3 < 0.25)                       _mod(ou, 'supply_line_cut',       'military', 'troop_morale',         -0.12, 4);
  if (np > 0.65 && pa2 > 0.6)          _mod(ou, 'sea_lanes_controlled',  'economy', 'trade_balance',         +0.10, 6);
  if (pa2 > 0.6 && np > 0.5)           _mod(ou, 'pirates_suppressed',    'economy', 'port_activity',         +0.08, 5);
  if (lc > 0.75)                        _mod(ou, 'logistics_reform',      'military', 'logistics_capacity',   +0.10, 7);
  if (fp < 0.3 && sl3 < 0.4)           _mod(ou, 'army_food_crisis',      'military', 'troop_morale',         -0.12, 4);
  if (np > 0.75 && ns > 0.7)           _mod(ou, 'naval_dominance',       'economy', 'trade_balance',         +0.12, 6);
  if (nv < 0.1 && ns > 0.3)            _mod(ou, 'fleet_lost_storm',      'military', 'naval_power_projection',-0.18, 4);
}

// ─── GROUP 9 — MILITARY: DEFENCE & FORTIFICATION ─────────────────────────────

function _modGroup9_Defence(ou) {
  const fl  = _getVal(ou, 'military', 'fortification_level');
  const fn  = _getVal(ou, 'military', 'fortress_network');
  const bc  = _getVal(ou, 'military', 'border_control');
  const iq  = _getVal(ou, 'military', 'intelligence_quality');
  const is  = _getVal(ou, 'military', 'internal_security');
  const ac2 = _getVal(ou, 'military', 'active_conflicts');
  const gr3 = _getVal(ou, 'economy',  'gold_reserves');

  if (fl > 0.72 && gr3 > 0.4)          _mod(ou, 'walls_built',           'military', 'fortification_level',  +0.10, 9);
  if (fl < 0.25 && ac2 > 0.3)          _mod(ou, 'fortress_besieged',     'military', 'fortification_level',  -0.14, 4);
  if (bc > 0.72)                        _mod(ou, 'border_fortification',  'military', 'border_control',       +0.10, 8);
  if (iq > 0.72)                        _mod(ou, 'watchtower_network',    'military', 'intelligence_quality', +0.10, 7);
  if (is > 0.7 && fn > 0.3)            _mod(ou, 'garrison_stationed',    'military', 'internal_security',    +0.08, 6);
  if (fl < 0.15 && ac2 > 0.4)          _mod(ou, 'city_walls_breach',     'military', 'internal_security',    -0.15, 4);
  if (fn < 0.08)                        _mod(ou, 'fortification_decay',   'military', 'fortification_level',  -0.10, 5);
  if (bc > 0.65 && iq > 0.5)           _mod(ou, 'strategic_pass_held',   'military', 'border_control',       +0.10, 6);
  if (ac2 > 0.3 && fn > 0.4)           _mod(ou, 'naval_blockade',        'economy', 'trade_balance',         -0.12, 4);
  if (bc > 0.6 && iq > 0.55)           _mod(ou, 'cavalry_patrol',        'military', 'border_control',       +0.08, 5);
}

// ─── GROUP 10 — MILITARY: MORALE & DISCIPLINE ────────────────────────────────

function _modGroup10_Morale(ou) {
  const tm  = _getVal(ou, 'military', 'troop_morale');
  const ml2 = _getVal(ou, 'military', 'military_loyalty');
  const oq2 = _getVal(ou, 'military', 'officer_quality');
  const we2 = _getVal(ou, 'military', 'war_exhaustion');
  const dr2 = _getVal(ou, 'military', 'desertion_rate');
  const bh  = _getVal(ou, 'military', 'battle_hardened');
  const gr4 = _getVal(ou, 'economy',  'gold_reserves');
  const ac3 = _getVal(ou, 'military', 'active_conflicts');

  if (tm > 0.8 && ac3 < 0.3)           _mod(ou, 'triumph_ceremony',      'military', 'military_loyalty',     +0.12, 5);
  if (ml2 > 0.8 && tm > 0.7)           _mod(ou, 'legionary_loyalty_high','military', 'military_readiness',   +0.10, 6);
  if (ml2 < 0.35 && tm < 0.4)          _mod(ou, 'legionary_loyalty_low', 'military', 'military_readiness',   -0.12, 5);
  if (oq2 > 0.75 && tm > 0.6)          _mod(ou, 'general_charisma',      'military', 'troop_morale',         +0.12, 6);
  if (oq2 < 0.22)                       _mod(ou, 'general_incompetence',  'military', 'troop_morale',         -0.14, 5);
  if (tm > 0.7 && we2 < 0.3)           _mod(ou, 'religious_fervor_army', 'military', 'troop_morale',         +0.10, 5);
  if (tm < 0.35 && dr2 > 0.2)          _mod(ou, 'mutiny_risk',           'military', 'military_loyalty',     -0.15, 4);
  if (gr4 < 0.15 && tm < 0.5)          _mod(ou, 'pay_arrears',           'military', 'troop_morale',         -0.14, 5);
  if (gr4 > 0.55 && ml2 > 0.6)         _mod(ou, 'generous_donative',     'military', 'troop_morale',         +0.12, 4);
  if (bh > 0.65 && ac3 > 0.2)          _mod(ou, 'battle_hardened_bonus', 'military', 'military_readiness',   +0.12, 6);
}

// ─── PUBLIC: applyModifiers ───────────────────────────────────────────────────

/**
 * Apply 100 situational modifiers (economic + military) to OU mu values.
 * Modifiers are organised in 10 groups of 10.
 * Active modifiers are stored in ouState.activeModifiers and auto-expire.
 * @param {object} nation
 * @param {object} ouState  (= nation._ou)
 */
// ─── GROUP 11 — DIPLOMACY: REPUTATION & RELATIONS ────────────────────────────

function _modGroup11_DiplomacyReputation(ou) {
  const gr  = _getVal(ou, 'diplomacy', 'global_reputation');
  const tc  = _getVal(ou, 'diplomacy', 'treaty_compliance');
  const di  = _getVal(ou, 'diplomacy', 'diplomatic_incidents');
  const hg  = _getVal(ou, 'diplomacy', 'historical_grievances');
  const it  = _getVal(ou, 'diplomacy', 'international_trust');
  const bdr = _getVal(ou, 'diplomacy', 'border_dispute_level');
  const rec = _getVal(ou, 'diplomacy', 'reconciliation_index');
  const fp  = _getVal(ou, 'diplomacy', 'foreign_policy_stability');
  const wr  = _getVal(ou, 'diplomacy', 'war_reparations_status');
  const dir = _getVal(ou, 'diplomacy', 'diplomatic_isolation_risk');

  if (gr > 0.75)              _mod(ou, 'prestige_peak',         'diplomacy', 'international_trust',     +0.12, 5);
  if (gr < 0.2)               _mod(ou, 'reputation_collapse',   'diplomacy', 'alliance_count',          -0.15, 6);
  if (tc < 0.3)               _mod(ou, 'treaty_breach',         'diplomacy', 'international_trust',     -0.18, 7);
  if (di > 0.4)               _mod(ou, 'envoy_scandal',         'diplomacy', 'global_reputation',       -0.10, 4);
  if (hg > 0.6)               _mod(ou, 'old_grievances',        'diplomacy', 'reconciliation_index',    -0.10, 5);
  if (it > 0.75)              _mod(ou, 'trusted_partner',       'diplomacy', 'treaty_count',            +0.10, 4);
  if (bdr > 0.5)              _mod(ou, 'border_tension',        'diplomacy', 'neutral_relations',       -0.12, 5);
  if (rec > 0.7)              _mod(ou, 'reconciliation_boom',   'diplomacy', 'global_reputation',       +0.10, 4);
  if (fp < 0.25)              _mod(ou, 'policy_chaos',          'diplomacy', 'ambassador_quality',      -0.10, 5);
  if (wr > 0.5 && it < 0.4)  _mod(ou, 'reparations_resentment','diplomacy', 'international_trust',     -0.08, 6);
}

// ─── GROUP 12 — DIPLOMACY: ALLIANCES & TREATIES ──────────────────────────────

function _modGroup12_DiplomacyAlliances(ou) {
  const ac  = _getVal(ou, 'diplomacy', 'alliance_count');
  const ar  = _getVal(ou, 'diplomacy', 'alliance_reliability');
  const trc = _getVal(ou, 'diplomacy', 'treaty_count');
  const st  = _getVal(ou, 'diplomacy', 'sacred_truce_status');
  const mi  = _getVal(ou, 'military',  'military_alliances');
  const ec  = _getVal(ou, 'diplomacy', 'enemy_count');
  const ba  = _getVal(ou, 'diplomacy', 'bilateral_agreements');
  const gpa = _getVal(ou, 'diplomacy', 'great_power_alignment');
  const ia  = _getVal(ou, 'diplomacy', 'ideological_alignment');
  const ml  = _getVal(ou, 'diplomacy', 'multilateral_engagement');

  if (ac > 0.6)               _mod(ou, 'alliance_network',      'diplomacy', 'alliance_reliability',   +0.10, 4);
  if (ar < 0.3)               _mod(ou, 'ally_unreliable',       'diplomacy', 'alliance_count',          -0.12, 5);
  if (trc > 0.6)              _mod(ou, 'treaty_web',            'diplomacy', 'international_trust',     +0.08, 4);
  if (st > 0.7)               _mod(ou, 'olympian_truce',        'diplomacy', 'diplomatic_incidents',    -0.15, 4);
  if (mi > 0.6)               _mod(ou, 'military_pact_active',  'military',  'reserve_forces',          +0.10, 5);
  if (ec > 0.5)               _mod(ou, 'many_enemies',          'diplomacy', 'neutral_relations',       -0.15, 5);
  if (ba > 0.65)              _mod(ou, 'bilateral_web',         'diplomacy', 'trade_partner_count',     +0.08, 4);
  if (gpa > 0.7)              _mod(ou, 'hegemon_backing',       'diplomacy', 'military_deterrence',     +0.12, 5);
  if (ia > 0.7 && ac > 0.5)  _mod(ou, 'ideological_bloc',      'diplomacy', 'alliance_reliability',   +0.10, 4);
  if (ml > 0.7)               _mod(ou, 'multilateral_prestige', 'diplomacy', 'global_reputation',       +0.08, 3);
}

// ─── GROUP 13 — DIPLOMACY: TRADE & ECONOMIC DIPLOMACY ────────────────────────

function _modGroup13_DiplomacyTrade(ou) {
  const tpc = _getVal(ou, 'diplomacy', 'trade_partner_count');
  const mgi = _getVal(ou, 'diplomacy', 'merchant_guild_influence');
  const tbi = _getVal(ou, 'diplomacy', 'trade_bloc_integration');
  const sr  = _getVal(ou, 'diplomacy', 'sanctions_received');
  const si  = _getVal(ou, 'diplomacy', 'sanctions_imposed');
  const eco = _getVal(ou, 'diplomacy', 'economic_coercion');
  const fai = _getVal(ou, 'diplomacy', 'foreign_aid_given');
  const far = _getVal(ou, 'diplomacy', 'foreign_aid_received');
  const dde = _getVal(ou, 'diplomacy', 'debt_diplomacy_exposure');
  const fll = _getVal(ou, 'diplomacy', 'foreign_land_leases');

  if (tpc > 0.7)              _mod(ou, 'trade_empire',          'economy',   'export_volume',           +0.12, 4);
  if (mgi > 0.65)             _mod(ou, 'guild_trade_push',      'economy',   'trade_balance',           +0.10, 4);
  if (tbi > 0.6)              _mod(ou, 'bloc_advantage',        'economy',   'foreign_investment',      +0.08, 5);
  if (sr > 0.4)               _mod(ou, 'sanctioned_nation',     'economy',   'trade_openness',          -0.15, 6);
  if (si > 0.4)               _mod(ou, 'coercive_sanctions',    'diplomacy', 'enemy_count',             +0.08, 5);
  if (eco > 0.5)              _mod(ou, 'economic_pressure',     'diplomacy', 'neutral_relations',       -0.10, 4);
  if (fai > 0.15)             _mod(ou, 'patron_state',          'diplomacy', 'global_reputation',       +0.10, 5);
  if (far > 0.2)              _mod(ou, 'aid_dependency',        'diplomacy', 'foreign_policy_stability',-0.08, 5);
  if (dde > 0.4)              _mod(ou, 'debt_trap_risk',        'diplomacy', 'diplomatic_isolation_risk',+0.10,5);
  if (fll > 0.25)             _mod(ou, 'foreign_base_revenue',  'economy',   'gold_reserves',           +0.06, 4);
}

// ─── GROUP 14 — DIPLOMACY: CRISIS & ESPIONAGE ────────────────────────────────

function _modGroup14_DiplomacyCrisis(ou) {
  const esp = _getVal(ou, 'diplomacy', 'espionage_capability');
  const ce  = _getVal(ou, 'diplomacy', 'counter_espionage');
  const coa = _getVal(ou, 'diplomacy', 'covert_operations_abroad');
  const di2 = _getVal(ou, 'diplomacy', 'diplomatic_isolation_risk');
  const tc2 = _getVal(ou, 'diplomacy', 'territorial_claims');
  const mc  = _getVal(ou, 'diplomacy', 'maritime_claims');
  const nc  = _getVal(ou, 'diplomacy', 'negotiation_success_rate');
  const hv  = _getVal(ou, 'diplomacy', 'herald_effectiveness');
  const ma  = _getVal(ou, 'diplomacy', 'mediation_activity');
  const icl = _getVal(ou, 'diplomacy', 'international_law_respect');

  if (esp > 0.7)              _mod(ou, 'spy_advantage',         'military',  'intelligence_quality',    +0.12, 4);
  if (ce > 0.7)               _mod(ou, 'counterspy_shield',     'diplomacy', 'espionage_capability',    -0.08, 4);
  if (coa > 0.5)              _mod(ou, 'covert_destabilisation','diplomacy', 'diplomatic_incidents',    +0.12, 5);
  if (di2 > 0.6)              _mod(ou, 'near_isolation',        'diplomacy', 'trade_partner_count',     -0.15, 6);
  if (tc2 > 0.5)              _mod(ou, 'land_claim_tension',    'diplomacy', 'border_dispute_level',    +0.12, 5);
  if (mc > 0.5)               _mod(ou, 'sea_claim_dispute',     'diplomacy', 'maritime_diplomacy',      -0.10, 5);
  if (nc > 0.75)              _mod(ou, 'master_negotiator',     'diplomacy', 'treaty_count',            +0.12, 4);
  if (hv > 0.7)               _mod(ou, 'herald_triumph',        'diplomacy', 'international_trust',     +0.10, 3);
  if (ma > 0.6)               _mod(ou, 'mediator_role',         'diplomacy', 'global_reputation',       +0.08, 4);
  if (icl < 0.2)              _mod(ou, 'lawbreaker_rep',        'diplomacy', 'international_trust',     -0.15, 6);
}

// ─── GROUP 15 — DIPLOMACY: SOFT POWER & CULTURE ──────────────────────────────

function _modGroup15_DiplomacySoftPower(ou) {
  const sp  = _getVal(ou, 'diplomacy', 'soft_power_index');
  const ci  = _getVal(ou, 'diplomacy', 'cultural_influence');
  const rd  = _getVal(ou, 'diplomacy', 'religious_diplomacy');
  const oc  = _getVal(ou, 'diplomacy', 'oracle_cooperation');
  const ae  = _getVal(ou, 'diplomacy', 'academic_exchange');
  const cer = _getVal(ou, 'diplomacy', 'cultural_exchange_rate');
  const dia = _getVal(ou, 'diplomacy', 'diaspora_influence');
  const fsc = _getVal(ou, 'diplomacy', 'foreign_student_inflow');
  const fpa = _getVal(ou, 'diplomacy', 'foreign_press_coverage');
  const eco2= _getVal(ou, 'economy',   'technology_index');

  if (sp > 0.7)               _mod(ou, 'cultural_hegemony',     'diplomacy', 'cultural_influence',      +0.10, 5);
  if (ci > 0.65)              _mod(ou, 'cultural_spread',       'diplomacy', 'soft_power_index',        +0.08, 4);
  if (rd > 0.6)               _mod(ou, 'temple_diplomacy',      'diplomacy', 'alliance_count',          +0.08, 5);
  if (oc > 0.6)               _mod(ou, 'oracle_prestige',       'diplomacy', 'global_reputation',       +0.10, 4);
  if (ae > 0.6)               _mod(ou, 'scholar_exchange',      'economy',   'innovation_rate',         +0.06, 5);
  if (cer > 0.65)             _mod(ou, 'culture_boom',          'diplomacy', 'soft_power_index',        +0.06, 4);
  if (dia > 0.5)              _mod(ou, 'diaspora_network',      'economy',   'remittances',             +0.08, 5);
  if (fsc > 0.5)              _mod(ou, 'student_influx',        'economy',   'skill_level_index',       +0.06, 5);
  if (fpa > 0.7)              _mod(ou, 'positive_press',        'diplomacy', 'global_reputation',       +0.10, 3);
  if (eco2 > 0.65 && sp > 0.5) _mod(ou,'tech_soft_power',      'diplomacy', 'soft_power_index',        +0.08, 4);
}

// ─── GROUP 16 — POLITICS: STABILITY & REGIME ─────────────────────────────────

function _modGroup16_PoliticsStability(ou) {
  const rs  = _getVal(ou, 'politics', 'regime_stability');
  const gl  = _getVal(ou, 'politics', 'government_legitimacy');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const os  = _getVal(ou, 'politics', 'opposition_strength');
  const cs  = _getVal(ou, 'politics', 'cabinet_stability');
  const cf  = _getVal(ou, 'politics', 'coalition_fragility');
  const sc  = _getVal(ou, 'politics', 'state_capacity');
  const pe  = _getVal(ou, 'politics', 'policy_effectiveness');
  const co  = _getVal(ou, 'politics', 'constitutional_order');
  const cr  = _getVal(ou, 'military', 'coup_risk');

  if (rs > 0.8)               _mod(ou, 'stable_regime',         'politics',  'popular_support',         +0.10, 4);
  if (rs < 0.2)               _mod(ou, 'regime_crisis',         'politics',  'government_legitimacy',   -0.18, 6);
  if (gl < 0.25)              _mod(ou, 'legitimacy_void',        'politics',  'popular_support',         -0.15, 6);
  if (ps > 0.75)              _mod(ou, 'mandate_strong',        'politics',  'policy_effectiveness',    +0.12, 4);
  if (os > 0.65)              _mod(ou, 'opposition_surge',      'politics',  'cabinet_stability',       -0.12, 5);
  if (cs < 0.25)              _mod(ou, 'cabinet_collapse',      'politics',  'policy_effectiveness',    -0.15, 5);
  if (cf > 0.6)               _mod(ou, 'coalition_crumbling',   'politics',  'regime_stability',        -0.10, 5);
  if (sc > 0.75)              _mod(ou, 'strong_state',          'politics',  'bureaucratic_efficiency', +0.10, 4);
  if (pe > 0.75)              _mod(ou, 'good_governance',       'politics',  'popular_support',         +0.08, 4);
  if (cr > 0.5 && gl < 0.4)  _mod(ou, 'coup_imminent',         'politics',  'regime_stability',        -0.20, 5);
}

// ─── GROUP 17 — POLITICS: LEGITIMACY & IDEOLOGY ──────────────────────────────

function _modGroup17_PoliticsLegitimacy(ou) {
  const ri  = _getVal(ou, 'politics', 'religious_influence');
  const ni  = _getVal(ou, 'politics', 'nationalist_sentiment');
  const pi  = _getVal(ou, 'politics', 'populism_index');
  const dm  = _getVal(ou, 'politics', 'democracy_score');
  const au  = _getVal(ou, 'politics', 'autocracy_score');
  const pr  = _getVal(ou, 'politics', 'press_freedom');
  const phf = _getVal(ou, 'politics', 'philosopher_influence');
  const rh  = _getVal(ou, 'politics', 'rhetoric_effectiveness');
  const plr = _getVal(ou, 'politics', 'plebeian_rights');
  const sec = _getVal(ou, 'politics', 'secularism_index');

  if (ri > 0.7)               _mod(ou, 'religious_mandate',     'politics',  'government_legitimacy',   +0.12, 5);
  if (ni > 0.7)               _mod(ou, 'nationalist_wave',      'politics',  'popular_support',         +0.10, 4);
  if (pi > 0.65)              _mod(ou, 'populist_surge',        'politics',  'popular_support',         +0.12, 4);
  if (pi > 0.65 && dm < 0.4) _mod(ou, 'populist_autocracy',    'politics',  'civil_liberties',         -0.12, 5);
  if (dm > 0.75)              _mod(ou, 'democratic_legitimacy', 'politics',  'political_trust',         +0.10, 4);
  if (au > 0.7)               _mod(ou, 'autocratic_control',    'politics',  'opposition_strength',     -0.15, 5);
  if (pr < 0.2)               _mod(ou, 'press_muzzled',         'politics',  'political_trust',         -0.10, 5);
  if (phf > 0.6)              _mod(ou, 'philosopher_kings',     'politics',  'policy_effectiveness',    +0.08, 5);
  if (rh > 0.7)               _mod(ou, 'great_orator',          'politics',  'popular_support',         +0.10, 3);
  if (plr > 0.7 && sec > 0.5)_mod(ou, 'civic_republic',        'politics',  'government_legitimacy',   +0.08, 4);
}

// ─── GROUP 18 — POLITICS: CORRUPTION & INSTITUTIONS ──────────────────────────

function _modGroup18_PoliticsCorruption(ou) {
  const cx  = _getVal(ou, 'politics', 'corruption_index');
  const be  = _getVal(ou, 'politics', 'bureaucratic_efficiency');
  const rl  = _getVal(ou, 'politics', 'rule_of_law');
  const ti  = _getVal(ou, 'politics', 'transparency_index');
  const ji  = _getVal(ou, 'politics', 'judicial_independence');
  const sp  = _getVal(ou, 'politics', 'secret_police_presence');
  const ol  = _getVal(ou, 'politics', 'oligarchy_index');
  const bl  = _getVal(ou, 'politics', 'business_lobby_power');
  const ml  = _getVal(ou, 'politics', 'military_lobby_power');
  const eco3= _getVal(ou, 'economy',  'corruption_index');

  if (cx > 0.6)               _mod(ou, 'rampant_corruption',    'economy',   'tax_revenue',             -0.08, 5);
  if (cx > 0.7 && rl < 0.3)  _mod(ou, 'kleptocracy',           'economy',   'gdp_growth',              -0.05, 6);
  if (be > 0.75)              _mod(ou, 'efficient_admin',       'politics',  'policy_effectiveness',    +0.12, 4);
  if (rl > 0.75)              _mod(ou, 'rule_of_law_strong',    'politics',  'institutional_trust',     +0.10, 4);
  if (ti < 0.2)               _mod(ou, 'opacity_crisis',        'politics',  'political_trust',         -0.12, 5);
  if (ji < 0.2)               _mod(ou, 'captured_courts',       'politics',  'institutional_trust',     -0.15, 6);
  if (sp > 0.6)               _mod(ou, 'surveillance_state',    'politics',  'civil_liberties',         -0.15, 5);
  if (ol > 0.6)               _mod(ou, 'oligarch_dominance',    'politics',  'popular_support',         -0.10, 5);
  if (bl > 0.65)              _mod(ou, 'business_capture',      'economy',   'regulatory_burden',       -0.08, 4);
  if (ml > 0.6 && eco3 > 0.5)_mod(ou, 'mil_industrial_complex','economy',   'military_spending',       +0.08, 5);
}

// ─── GROUP 19 — POLITICS: CRISIS & CONFLICT ──────────────────────────────────

function _modGroup19_PoliticsCrisis(ou) {
  const pf  = _getVal(ou, 'politics', 'protest_frequency');
  const pin = _getVal(ou, 'politics', 'protest_intensity');
  const pv  = _getVal(ou, 'politics', 'political_violence');
  const ins = _getVal(ou, 'politics', 'insurgency_level');
  const sep = _getVal(ou, 'politics', 'separatism_risk');
  const et  = _getVal(ou, 'politics', 'ethnic_tension');
  const cc  = _getVal(ou, 'politics', 'class_conflict');
  const rub = _getVal(ou, 'politics', 'rumor_spreading');
  const pol = _getVal(ou, 'politics', 'political_polarization');
  const ur  = _getVal(ou, 'politics', 'urban_rural_divide');

  if (pf > 0.5 && pin > 0.4) _mod(ou, 'mass_uprising',         'politics',  'regime_stability',        -0.18, 6);
  if (pv > 0.4)               _mod(ou, 'political_terror',      'politics',  'popular_support',         -0.15, 5);
  if (ins > 0.4)              _mod(ou, 'insurgency_active',     'military',  'internal_security',       -0.15, 6);
  if (sep > 0.5)              _mod(ou, 'secessionism',          'politics',  'state_capacity',          -0.12, 6);
  if (et > 0.55)              _mod(ou, 'ethnic_strife',         'politics',  'social_cohesion',         -0.15, 5);
  if (cc > 0.55)              _mod(ou, 'class_war',             'politics',  'government_legitimacy',   -0.10, 5);
  if (rub > 0.6)              _mod(ou, 'disinformation',        'politics',  'institutional_trust',     -0.10, 4);
  if (pol > 0.65)             _mod(ou, 'deep_polarization',     'politics',  'policy_effectiveness',    -0.12, 5);
  if (ur > 0.6)               _mod(ou, 'rural_discontent',      'politics',  'popular_support',         -0.08, 4);
  if (pf > 0.6 && pv > 0.3)  _mod(ou, 'revolution_brink',      'politics',  'government_legitimacy',   -0.20, 6);
}

// ─── GROUP 20 — POLITICS: GOVERNANCE & SOCIAL POLICY ─────────────────────────

function _modGroup20_PoliticsGovernance(ou) {
  const ws  = _getVal(ou, 'politics', 'welfare_state');
  const ps2 = _getVal(ou, 'politics', 'public_services');
  const ha  = _getVal(ou, 'politics', 'healthcare_access');
  const ea  = _getVal(ou, 'politics', 'education_access');
  const coh = _getVal(ou, 'politics', 'social_cohesion');
  const ce2 = _getVal(ou, 'politics', 'civic_engagement');
  const aus = _getVal(ou, 'politics', 'austerity_policy');
  const stm = _getVal(ou, 'politics', 'stimulus_policy');
  const fpt = _getVal(ou, 'politics', 'free_trade_policy');
  const pro = _getVal(ou, 'politics', 'protectionism');

  if (ws > 0.7)               _mod(ou, 'generous_dole',         'politics',  'popular_support',         +0.10, 4);
  if (ps2 > 0.75)             _mod(ou, 'great_public_works',    'politics',  'popular_support',         +0.12, 4);
  if (ha > 0.75)              _mod(ou, 'healthy_population',    'economy',   'labor_participation',     +0.06, 5);
  if (ea > 0.75)              _mod(ou, 'literate_citizenry',    'economy',   'skill_level_index',       +0.08, 5);
  if (coh > 0.75)             _mod(ou, 'unified_society',       'politics',  'government_legitimacy',   +0.10, 4);
  if (ce2 > 0.7)              _mod(ou, 'civic_participation',   'politics',  'political_trust',         +0.10, 4);
  if (aus > 0.6)              _mod(ou, 'austerity_cuts',        'politics',  'popular_support',         -0.12, 5);
  if (stm > 0.6)              _mod(ou, 'state_stimulus',        'economy',   'gdp_growth',              +0.04, 4);
  if (fpt > 0.7)              _mod(ou, 'free_trade_boom',       'economy',   'trade_openness',          +0.10, 4);
  if (pro > 0.65)             _mod(ou, 'protectionist_walls',   'economy',   'trade_tariff',            +0.12, 5);
}

// ─── PUBLIC: applyModifiers ───────────────────────────────────────────────────

export function applyModifiers(nation, ouState) {
  // Decay existing modifiers first
  _decayModifiers(ouState);

  // ── Economic groups (1-5) ──────────────────────────────────────────────────
  _modGroup1_Harvest(ouState);
  _modGroup2_Trade(ouState);
  _modGroup3_Infra(ouState);
  _modGroup4_Finance(ouState);
  _modGroup5_Crisis(ouState);

  // ── Military groups (6-10) ────────────────────────────────────────────────
  _modGroup6_Warfare(ouState);
  _modGroup7_ArmyQuality(ouState);
  _modGroup8_Naval(ouState);
  _modGroup9_Defence(ouState);
  _modGroup10_Morale(ouState);

  // ── Diplomacy groups (11-15) ──────────────────────────────────────────────
  _modGroup11_DiplomacyReputation(ouState);
  _modGroup12_DiplomacyAlliances(ouState);
  _modGroup13_DiplomacyTrade(ouState);
  _modGroup14_DiplomacyCrisis(ouState);
  _modGroup15_DiplomacySoftPower(ouState);

  // ── Politics groups (16-20) ───────────────────────────────────────────────
  _modGroup16_PoliticsStability(ouState);
  _modGroup17_PoliticsLegitimacy(ouState);
  _modGroup18_PoliticsCorruption(ouState);
  _modGroup19_PoliticsCrisis(ouState);
  _modGroup20_PoliticsGovernance(ouState);
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

