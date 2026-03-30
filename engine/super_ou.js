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
  anomalyThreshold:    0.45,   // normalised [0,1] composite score
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
// tick — implemented below near line 2129

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
  // ST_014: conquest fatigue — после обновления переменных
  _updateConquestFatigue(nation, ou);
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

// ─── GROUP 21 — SEASONAL: SPRING (CAMPAIGNING SEASON) ────────────────────────

function _modGroup21_SeasonSpring(ou) {
  const tick  = ou.tick || 0;
  const phase = tick % 4; // 0=spring, 1=summer, 2=autumn, 3=winter
  if (phase !== 0) return;

  const ar  = _getVal(ou, 'military', 'army_readiness');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const lp  = _getVal(ou, 'economy',  'land_productivity');
  const fp  = _getVal(ou, 'economy',  'food_production');
  const to  = _getVal(ou, 'economy',  'trade_openness');
  const pa  = _getVal(ou, 'economy',  'port_activity');
  const ae  = _getVal(ou, 'diplomacy','academic_exchange');
  const ri  = _getVal(ou, 'politics', 'religious_influence');
  const ci  = _getVal(ou, 'diplomacy','cultural_influence');
  const coh = _getVal(ou, 'politics', 'social_cohesion');

  if (ar > 0.5)  _mod(ou, 'spring_march',        'military',  'army_readiness',       +0.10, 2);
  if (ms > 0.5)  _mod(ou, 'spring_optimism',      'military',  'soldier_morale',       +0.08, 2);
  if (lp > 0.4)  _mod(ou, 'spring_planting',      'economy',   'agricultural_output',  +0.10, 2);
  if (fp > 0.3)  _mod(ou, 'spring_growth',         'economy',   'food_production',      +0.06, 2);
  if (to > 0.4)  _mod(ou, 'spring_trade',          'economy',   'export_volume',        +0.08, 2);
  if (pa > 0.4)  _mod(ou, 'seas_open',             'economy',   'port_activity',        +0.10, 2);
  if (ae > 0.4)  _mod(ou, 'spring_festival',       'diplomacy', 'soft_power_index',     +0.06, 2);
  if (ri > 0.5)  _mod(ou, 'spring_rites',          'politics',  'popular_support',      +0.06, 2);
  if (ci > 0.4)  _mod(ou, 'spring_games',          'diplomacy', 'global_reputation',    +0.06, 2);
  if (coh > 0.5) _mod(ou, 'spring_renewal',        'politics',  'social_cohesion',      +0.06, 2);
}

// ─── GROUP 22 — SEASONAL: SUMMER (PEAK CAMPAIGN) ─────────────────────────────

function _modGroup22_SeasonSummer(ou) {
  const tick  = ou.tick || 0;
  const phase = tick % 4;
  if (phase !== 1) return;

  const aw  = _getVal(ou, 'military', 'active_wars');
  const le  = _getVal(ou, 'military', 'logistics_efficiency');
  const wa  = _getVal(ou, 'economy',  'water_availability');
  const fp  = _getVal(ou, 'economy',  'food_production');
  const tr  = _getVal(ou, 'economy',  'tax_revenue');
  const pa  = _getVal(ou, 'economy',  'port_activity');
  const tb  = _getVal(ou, 'economy',  'trade_balance');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const gr  = _getVal(ou, 'diplomacy','global_reputation');

  if (aw > 0.4)  _mod(ou, 'summer_campaign',      'military',  'active_wars',          +0.06, 2);
  if (le > 0.5)  _mod(ou, 'summer_supply_push',   'military',  'logistics_efficiency', +0.08, 2);
  if (wa < 0.25) _mod(ou, 'summer_drought',        'economy',   'food_production',      -0.12, 2);
  if (fp > 0.6)  _mod(ou, 'summer_abundance',      'economy',   'food_production',      +0.06, 2);
  if (tr > 0.5)  _mod(ou, 'summer_revenues',       'economy',   'tax_revenue',          +0.06, 2);
  if (pa > 0.5)  _mod(ou, 'summer_trade_peak',     'economy',   'trade_balance',        +0.08, 2);
  if (tb > 0.2)  _mod(ou, 'summer_merchant_fair',  'economy',   'retail_sales',         +0.08, 2);
  if (ps > 0.6)  _mod(ou, 'summer_games',          'politics',  'popular_support',      +0.06, 2);
  if (ms > 0.6)  _mod(ou, 'summer_glory',          'military',  'soldier_morale',       +0.06, 2);
  if (gr > 0.6)  _mod(ou, 'olympiad_prestige',     'diplomacy', 'global_reputation',    +0.10, 2);
}

// ─── GROUP 23 — SEASONAL: AUTUMN (HARVEST & CONSOLIDATION) ───────────────────

function _modGroup23_SeasonAutumn(ou) {
  const tick  = ou.tick || 0;
  const phase = tick % 4;
  if (phase !== 2) return;

  const ao  = _getVal(ou, 'economy',  'agricultural_output');
  const fp  = _getVal(ou, 'economy',  'food_production');
  const gr  = _getVal(ou, 'economy',  'gold_reserves');
  const tb  = _getVal(ou, 'economy',  'trade_balance');
  const ar  = _getVal(ou, 'military', 'army_readiness');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const ri  = _getVal(ou, 'politics', 'religious_influence');
  const wa  = _getVal(ou, 'economy',  'water_availability');
  const lp  = _getVal(ou, 'economy',  'land_productivity');

  if (ao > 0.5)  _mod(ou, 'autumn_harvest',        'economy',   'agricultural_output',  +0.12, 2);
  if (fp > 0.5)  _mod(ou, 'autumn_granary',        'economy',   'food_production',      +0.08, 2);
  if (gr > 0.5)  _mod(ou, 'autumn_tax_collection', 'economy',   'gold_reserves',        +0.06, 2);
  if (tb > 0.1)  _mod(ou, 'autumn_trade_close',    'economy',   'trade_balance',        +0.06, 2);
  if (ar > 0.4)  _mod(ou, 'armies_return',         'military',  'army_readiness',       -0.06, 2);
  if (ms > 0.4)  _mod(ou, 'soldier_rest',          'military',  'soldier_morale',       +0.06, 2);
  if (ps > 0.5)  _mod(ou, 'harvest_festival',      'politics',  'popular_support',      +0.08, 2);
  if (ri > 0.5)  _mod(ou, 'autumn_sacrifice',      'politics',  'government_legitimacy',+0.06, 2);
  if (wa > 0.5)  _mod(ou, 'autumn_rains',          'economy',   'water_availability',   +0.08, 2);
  if (lp > 0.5)  _mod(ou, 'soil_enrichment',       'economy',   'land_productivity',    +0.06, 2);
}

// ─── GROUP 24 — SEASONAL: WINTER (HARDSHIP & REST) ───────────────────────────

function _modGroup24_SeasonWinter(ou) {
  const tick  = ou.tick || 0;
  const phase = tick % 4;
  if (phase !== 3) return;

  const fp  = _getVal(ou, 'economy',  'food_production');
  const pa  = _getVal(ou, 'economy',  'port_activity');
  const to  = _getVal(ou, 'economy',  'trade_openness');
  const ar  = _getVal(ou, 'military', 'army_readiness');
  const le  = _getVal(ou, 'military', 'logistics_efficiency');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const gr  = _getVal(ou, 'economy',  'gold_reserves');
  const ri  = _getVal(ou, 'politics', 'religious_influence');
  const rn  = _getVal(ou, 'economy',  'road_network_index');

  if (fp < 0.5)  _mod(ou, 'winter_shortage',       'economy',   'food_production',      -0.10, 2);
  if (pa > 0.3)  _mod(ou, 'seas_closed',           'economy',   'port_activity',        -0.12, 2);
  if (to > 0.3)  _mod(ou, 'winter_trade_freeze',   'economy',   'trade_openness',       -0.08, 2);
  if (ar > 0.3)  _mod(ou, 'winter_quarters',       'military',  'army_readiness',       -0.10, 2);
  if (le > 0.3)  _mod(ou, 'winter_supply_trouble', 'military',  'logistics_efficiency', -0.10, 2);
  if (ms > 0.3)  _mod(ou, 'winter_morale_drop',    'military',  'soldier_morale',       -0.08, 2);
  if (ps > 0.3)  _mod(ou, 'winter_hardship',       'politics',  'popular_support',      -0.08, 2);
  if (gr > 0.5)  _mod(ou, 'winter_reserves_good',  'economy',   'gold_reserves',        +0.02, 2);
  if (ri > 0.5)  _mod(ou, 'winter_solstice_rites', 'politics',  'social_cohesion',      +0.06, 2);
  if (rn < 0.3)  _mod(ou, 'winter_road_ruin',      'economy',   'logistics_efficiency', -0.08, 2);
}

// ─── GROUP 25 — MEMORY: RECENT VICTORIES & DEFEATS ───────────────────────────

function _modGroup25_MemoryWar(ou) {
  const hist = ou.history || {};
  const recentWins  = hist.recentWins  || 0;
  const recentLoss  = hist.recentLoss  || 0;
  const warStreak   = hist.warStreak   || 0;
  const peaceStreak = hist.peaceStreak || 0;
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const ar  = _getVal(ou, 'military', 'army_readiness');
  const gr  = _getVal(ou, 'diplomacy','global_reputation');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const gl  = _getVal(ou, 'politics', 'government_legitimacy');
  const tr  = _getVal(ou, 'economy',  'tax_revenue');

  if (recentWins >= 2)              _mod(ou, 'victory_streak',      'military',  'soldier_morale',       +0.12, 3);
  if (recentLoss >= 2)              _mod(ou, 'defeat_trauma',        'military',  'soldier_morale',       -0.15, 4);
  if (warStreak >= 3)               _mod(ou, 'war_weary',            'military',  'army_readiness',       -0.10, 3);
  if (peaceStreak >= 4)             _mod(ou, 'long_peace_dividend',  'economy',   'gdp_growth',           +0.04, 3);
  if (recentWins >= 1 && ms > 0.5) _mod(ou, 'conqueror_aura',       'diplomacy', 'global_reputation',    +0.10, 3);
  if (recentLoss >= 1 && gr < 0.4) _mod(ou, 'defeated_reputation',  'diplomacy', 'global_reputation',    -0.12, 4);
  if (warStreak >= 2 && tr < 0.4)  _mod(ou, 'war_debt_burden',      'economy',   'tax_revenue',          -0.08, 3);
  if (peaceStreak >= 3 && ps > 0.5)_mod(ou, 'peace_popularity',     'politics',  'popular_support',      +0.08, 3);
  if (recentWins >= 3)              _mod(ou, 'empire_momentum',      'goals',     'territorial_expansion',+0.08, 3);
  if (recentLoss >= 3 && gl < 0.4) _mod(ou, 'regime_questioned',    'politics',  'government_legitimacy',-0.15, 4);
}

// ─── GROUP 26 — MEMORY: ECONOMIC BOOM & BUST CYCLES ──────────────────────────

function _modGroup26_MemoryEconomy(ou) {
  const hist = ou.history || {};
  const growthStreak = hist.growthStreak || 0;
  const recessionStr = hist.recessionStr || 0;
  const inflationStr = hist.inflationStr || 0;
  const surplusStr   = hist.surplusStr   || 0;
  const gdp = _getVal(ou, 'economy', 'gdp_growth');
  const inf = _getVal(ou, 'economy', 'inflation_rate');
  const gr  = _getVal(ou, 'economy', 'gold_reserves');
  const cc  = _getVal(ou, 'economy', 'consumer_confidence');
  const tb  = _getVal(ou, 'economy', 'trade_balance');
  const ir  = _getVal(ou, 'economy', 'innovation_rate');

  if (growthStreak >= 3)            _mod(ou, 'golden_age_economy',  'economy',   'consumer_confidence',  +0.12, 4);
  if (recessionStr >= 2)            _mod(ou, 'prolonged_slump',      'economy',   'gdp_growth',           -0.06, 4);
  if (inflationStr >= 3)            _mod(ou, 'hyperinflation_fear',  'economy',   'currency_strength',    -0.15, 4);
  if (surplusStr >= 3)              _mod(ou, 'trade_empire',         'economy',   'trade_openness',       +0.10, 4);
  if (gdp > 0.06 && cc > 0.6)      _mod(ou, 'boom_confidence',      'economy',   'consumer_confidence',  +0.10, 3);
  if (inf > 0.6)                    _mod(ou, 'inflation_erodes',     'economy',   'gold_reserves',        -0.06, 3);
  if (gr > 0.7)                     _mod(ou, 'treasury_surplus',     'economy',   'gold_reserves',        +0.06, 3);
  if (cc < 0.2)                     _mod(ou, 'panic_selling',        'economy',   'retail_sales',         -0.15, 3);
  if (tb > 0.3 && growthStreak >= 2)_mod(ou, 'trade_powerhouse',    'diplomacy', 'economic_partnerships', +0.08, 4);
  if (ir > 0.6 && growthStreak >= 2)_mod(ou, 'tech_boom',           'economy',   'innovation_rate',      +0.08, 3);
}

// ─── GROUP 27 — MEMORY: POLITICAL STABILITY STREAKS ──────────────────────────

function _modGroup27_MemoryPolitics(ou) {
  const hist = ou.history || {};
  const stabStr   = hist.stabilityStreak || 0;
  const crisisStr = hist.crisisStreak    || 0;
  const coupStr   = hist.coupStreak      || 0;
  const reformStr = hist.reformStreak    || 0;
  const rs  = _getVal(ou, 'politics', 'regime_stability');
  const gl  = _getVal(ou, 'politics', 'government_legitimacy');
  const sc  = _getVal(ou, 'politics', 'state_capacity');
  const be  = _getVal(ou, 'politics', 'bureaucratic_efficiency');
  const pt  = _getVal(ou, 'politics', 'political_trust');
  const rl  = _getVal(ou, 'politics', 'rule_of_law');

  if (stabStr >= 4)                 _mod(ou, 'pax_established',      'politics',  'regime_stability',     +0.10, 4);
  if (crisisStr >= 2)               _mod(ou, 'perpetual_crisis',      'politics',  'regime_stability',     -0.15, 4);
  if (coupStr >= 2)                 _mod(ou, 'praetorian_state',      'military',  'coup_risk',            +0.15, 5);
  if (reformStr >= 2)               _mod(ou, 'reform_momentum',       'politics',  'policy_effectiveness', +0.10, 4);
  if (rs > 0.7 && stabStr >= 3)    _mod(ou, 'golden_age_politics',   'politics',  'government_legitimacy',+0.12, 4);
  if (gl < 0.3 && crisisStr >= 2)  _mod(ou, 'legitimacy_collapse',   'politics',  'government_legitimacy',-0.18, 5);
  if (sc > 0.7 && stabStr >= 3)    _mod(ou, 'strong_institutions',   'politics',  'state_capacity',       +0.10, 4);
  if (be > 0.7)                    _mod(ou, 'admin_legacy',          'politics',  'bureaucratic_efficiency',+0.08, 4);
  if (pt < 0.2 && crisisStr >= 2)  _mod(ou, 'trust_deficit',         'politics',  'political_trust',      -0.15, 5);
  if (rl > 0.7 && reformStr >= 2)  _mod(ou, 'legal_tradition',       'politics',  'rule_of_law',          +0.10, 4);
}

// ─── GROUP 28 — EVENTS: NATURAL DISASTERS ────────────────────────────────────

function _modGroup28_EventsNature(ou) {
  const wa  = _getVal(ou, 'economy',  'water_availability');
  const fp  = _getVal(ou, 'economy',  'food_production');
  const ii  = _getVal(ou, 'economy',  'infrastructure_index');
  const rn  = _getVal(ou, 'economy',  'road_network_index');
  const pop = _getVal(ou, 'economy',  'population_growth');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const gl  = _getVal(ou, 'politics', 'government_legitimacy');
  const ar  = _getVal(ou, 'military', 'army_readiness');
  const coh = _getVal(ou, 'politics', 'social_cohesion');

  if (wa < 0.1 && fp < 0.2)       _mod(ou, 'great_drought',         'economy',   'agricultural_output',  -0.25, 6);
  if (ii < 0.12)                   _mod(ou, 'earthquake',            'economy',   'infrastructure_index', -0.20, 5);
  if (fp < 0.12 && pop < 0)        _mod(ou, 'plague_outbreak',       'economy',   'population_growth',    -0.08, 7);
  if (rn < 0.1)                    _mod(ou, 'flood_damage',          'economy',   'road_network_index',   -0.18, 4);
  if (wa < 0.15)                   _mod(ou, 'volcanic_winter',       'economy',   'food_production',      -0.20, 5);
  if (ms < 0.15)                   _mod(ou, 'pestilence_in_camps',   'military',  'soldier_morale',       -0.20, 5);
  if (ps < 0.15 && gl < 0.3)      _mod(ou, 'gods_wrath',            'politics',  'popular_support',      -0.18, 5);
  if (ar < 0.15)                   _mod(ou, 'storm_destroys_fleet',  'military',  'fleet_strength',       -0.20, 4);
  if (coh < 0.15)                  _mod(ou, 'locust_apocalypse',     'economy',   'food_production',      -0.22, 5);
  if (ii > 0.7 && wa > 0.6)       _mod(ou, 'aqueduct_saves_city',   'economy',   'population_growth',    +0.04, 6);
}

// ─── GROUP 29 — EVENTS: GREAT MEN & LEADERS ──────────────────────────────────

function _modGroup29_EventsLeaders(ou) {
  const gl  = _getVal(ou, 'politics', 'government_legitimacy');
  const rs  = _getVal(ou, 'politics', 'regime_stability');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const ar  = _getVal(ou, 'military', 'army_readiness');
  const gr  = _getVal(ou, 'diplomacy','global_reputation');
  const be  = _getVal(ou, 'politics', 'bureaucratic_efficiency');
  const ir  = _getVal(ou, 'economy',  'innovation_rate');
  const ps  = _getVal(ou, 'politics', 'popular_support');
  const ac  = _getVal(ou, 'military', 'commander_quality');
  const phf = _getVal(ou, 'politics', 'philosopher_influence');

  if (gl > 0.85 && rs > 0.8)      _mod(ou, 'great_emperor',         'politics',  'government_legitimacy',+0.15, 6);
  if (ac > 0.85 && ms > 0.7)      _mod(ou, 'great_general',         'military',  'army_readiness',       +0.15, 5);
  if (gr > 0.85 && gl > 0.7)      _mod(ou, 'philosopher_king',      'politics',  'policy_effectiveness',  +0.15, 5);
  if (be > 0.85)                   _mod(ou, 'master_administrator',  'politics',  'bureaucratic_efficiency',+0.15, 5);
  if (ir > 0.85)                   _mod(ou, 'great_inventor',        'economy',   'innovation_rate',      +0.15, 5);
  if (ps > 0.85 && gl > 0.7)      _mod(ou, 'beloved_leader',        'politics',  'popular_support',      +0.12, 5);
  if (ac > 0.75 && ar > 0.75)     _mod(ou, 'military_genius',       'military',  'tactical_superiority', +0.15, 5);
  if (phf > 0.8 && gr > 0.6)      _mod(ou, 'stoic_emperor',         'politics',  'political_trust',      +0.12, 5);
  if (gl < 0.1 && rs < 0.15)      _mod(ou, 'mad_emperor',           'politics',  'regime_stability',     -0.20, 5);
  if (ms < 0.15 && ac < 0.2)      _mod(ou, 'incompetent_general',   'military',  'army_readiness',       -0.18, 4);
}

// ─── GROUP 30 — EVENTS: CIVILIZATIONAL & EPOCHAL ─────────────────────────────

function _modGroup30_EventsEpochal(ou) {
  const gl  = _getVal(ou, 'politics', 'government_legitimacy');
  const gr  = _getVal(ou, 'diplomacy','global_reputation');
  const ir  = _getVal(ou, 'economy',  'innovation_rate');
  const ri  = _getVal(ou, 'politics', 'religious_influence');
  const ms  = _getVal(ou, 'military', 'soldier_morale');
  const ar  = _getVal(ou, 'military', 'army_readiness');
  const tb  = _getVal(ou, 'economy',  'trade_balance');
  const ci  = _getVal(ou, 'diplomacy','cultural_influence');
  const sc  = _getVal(ou, 'politics', 'state_capacity');
  const pop = _getVal(ou, 'economy',  'population_growth');

  if (ir > 0.85 && tb > 0.3)      _mod(ou, 'pax_mercatoria',        'economy',   'trade_openness',       +0.12, 8);
  if (gl > 0.9 && sc > 0.85)      _mod(ou, 'golden_age',            'economy',   'gdp_growth',           +0.08, 8);
  if (ri > 0.85 && gr > 0.7)      _mod(ou, 'holy_age',              'diplomacy', 'soft_power_index',     +0.15, 6);
  if (ci > 0.85 && ir > 0.7)      _mod(ou, 'cultural_renaissance',  'economy',   'innovation_rate',      +0.12, 7);
  if (ms > 0.85 && ar > 0.8)      _mod(ou, 'legions_invincible',    'military',  'army_readiness',       +0.15, 6);
  if (gl < 0.05 && sc < 0.1)      _mod(ou, 'empire_collapsing',     'politics',  'state_capacity',       -0.25, 8);
  if (gr < 0.05 && ci < 0.1)      _mod(ou, 'dark_age',              'economy',   'innovation_rate',      -0.20, 8);
  if (pop < -0.04)                 _mod(ou, 'population_collapse',   'economy',   'labor_participation',  -0.25, 7);
  if (tb < -0.4)                   _mod(ou, 'economic_ruin',         'economy',   'gold_reserves',        -0.20, 6);
  if (ar < 0.05 && gl < 0.1)      _mod(ou, 'barbarian_flood',       'military',  'border_security',      -0.25, 7);
}

// ─── SEASONAL BEHAVIORAL MODIFIER ─────────────────────────────────────────────
// ─── ST_015: Религиозный модификатор ─────────────────────────────────────────
/**
 * _applyReligionModifier(nation, ou, gameState)
 * - Одна религия с игроком: international_trust+0.20/3t, coalition_loyalty+0.15/3t
 * - Разные религии: rivalry_index+0.15/3t, international_trust-0.10/3t
 * - Греческая религия (Hellenism/Greek): 2% шанс oracle_blessing → military_readiness+0.12/8t
 */
function _applyReligionModifier(nation, ou, gameState) {
  const natRel = nation.religion ?? nation.state_religion ?? null;
  if (!natRel) return;

  // Find player nation
  const gs = gameState ?? (typeof GAME_STATE !== 'undefined' ? GAME_STATE : null);
  const playerNation = gs
    ? (Object.values(gs.nations ?? {}).find(n => n.isPlayer || n.is_player) ?? null)
    : null;
  const playerRel = playerNation
    ? (playerNation.religion ?? playerNation.state_religion ?? null)
    : null;

  if (playerRel) {
    const sameReligion = natRel.toLowerCase() === playerRel.toLowerCase();
    if (sameReligion) {
      _mod(ou, 'RELIG_SHARED_TRUST',     'diplomacy', 'international_trust',  +0.20, 3);
      _mod(ou, 'RELIG_SHARED_COALITION', 'diplomacy', 'coalition_loyalty',    +0.15, 3);
    } else {
      _mod(ou, 'RELIG_DIFF_RIVALRY',     'diplomacy', 'rivalry_index',        +0.15, 3);
      _mod(ou, 'RELIG_DIFF_DISTRUST',    'diplomacy', 'international_trust',  -0.10, 3);
    }
  }

  // Greek/Hellenistic oracle blessing — 2% chance per turn
  const isGreek = /hell?en|greek|olymp/i.test(natRel);
  if (isGreek && Math.random() < 0.02) {
    _mod(ou, `ORACLE_BLESSING_${ou.tick}`, 'military', 'military_readiness', +0.12, 8);
    if (typeof window !== 'undefined' && window.addEventLog) {
      window.addEventLog(`[🏛] Оракул благословил ${nation.name ?? nationId} — армия усилена`);
    }
  }
}

/**
 * Season-based behavioral modifier — affects high-level behavioral variables:
 * military_confidence (military_readiness + troop_morale),
 * aggression (power_projection_land), trade_satisfaction (trade_balance),
 * expansion_desire (expansion_drive), mobilization (mobilization_speed).
 * season = ou.tick % 4 → 0=spring, 1=summer, 2=autumn, 3=winter
 */
function _applySeasonalModifier(nation, ou) {
  const season = (ou.tick || 0) % 4;

  if (season === 0 || season === 1) {
    // Spring/Summer: military confidence and aggression surge
    _mod(ou, 'seas_mil_conf',  'military', 'military_readiness',    +0.15, 3);
    _mod(ou, 'seas_mil_mora',  'military', 'troop_morale',          +0.10, 3);
    _mod(ou, 'seas_aggression','military', 'power_projection_land', +0.20, 3);
  }

  if (season === 0) {
    // Spring only: spring_campaign — additional offensive military boost
    _mod(ou, 'spring_campaign_conf', 'military', 'military_readiness', +0.12, 3);
    _mod(ou, 'spring_campaign_mora', 'military', 'troop_morale',       +0.08, 3);
  }

  if (season === 2) {
    // Autumn: harvest trade satisfaction boost
    _mod(ou, 'seas_trade_sat',  'economy', 'trade_balance',   +0.10, 3);
    _mod(ou, 'seas_trade_open', 'economy', 'trade_openness',  +0.05, 3);
  }

  if (season === 3) {
    // Winter: expansion desire collapses, mobilization slows
    _mod(ou, 'seas_no_expand', 'goals',    'expansion_drive',    -0.25, 3);
    _mod(ou, 'seas_no_mob',    'military', 'mobilization_speed', -0.20, 3);
  }
}

// ─── PUBLIC: applyModifiers ───────────────────────────────────────────────────

export function applyModifiers(nation, ouState, gameState) {
  // First: seasonal behavioral modifiers (confidence, aggression, expansion, mobilization)
  _applySeasonalModifier(nation, ouState);
  // Religion modifier (ST_015)
  _applyReligionModifier(nation, ouState, gameState);

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

  // ── Seasonal groups (21-24) ───────────────────────────────────────────────
  _modGroup21_SeasonSpring(ouState);
  _modGroup22_SeasonSummer(ouState);
  _modGroup23_SeasonAutumn(ouState);
  _modGroup24_SeasonWinter(ouState);

  // ── Memory groups (25-27) ─────────────────────────────────────────────────
  _modGroup25_MemoryWar(ouState);
  _modGroup26_MemoryEconomy(ouState);
  _modGroup27_MemoryPolitics(ouState);

  // ── Event groups (28-30) ──────────────────────────────────────────────────
  _modGroup28_EventsNature(ouState);
  _modGroup29_EventsLeaders(ouState);
  _modGroup30_EventsEpochal(ouState);
}

// ─── PERSONALITY MATRIX ───────────────────────────────────────────────────────

/**
 * Personality trait definitions — 20 named axes, each mapped to indices.
 * The 1000-element vector is 20 traits × 50 action-weights each.
 */
const PERSONALITY_TRAITS = [
  'aggression',       // 0  — willingness to wage war, raid, expand by force
  'expansionism',     // 1  — drive to acquire territory
  'merchantism',      // 2  — preference for trade over war
  'diplomacy',        // 3  — preference for alliances, treaties
  'defensiveness',    // 4  — focus on borders, fortifications
  'piety',            // 5  — religious building, sacrifice, oracle
  'populism',         // 6  — favour low taxes, grain doles, games
  'autocracy',        // 7  — centralise power, purge rivals
  'innovation',       // 8  — invest in new technology, infrastructure
  'colonialism',      // 9  — found colonies, settle frontier
  'navalism',         // 10 — build fleets, control sea lanes
  'isolationism',     // 11 — avoid foreign entanglements
  'tributarism',      // 12 — prefer tribute-extraction over annexation
  'patronage',        // 13 — spend on culture, monuments, scholars
  'militarism',       // 14 — maintain large standing army regardless
  'pragmatism',       // 15 — react to events rather than long-term plan
  'loyalty',          // 16 — strong general-faction loyalty
  'greed',            // 17 — hoard wealth, delay spending
  'paranoia',         // 18 — pre-emptive strikes, spy heavily
  'glory_seeking',    // 19 — value prestige actions above economic ones
];

/**
 * AI personality archetypes for ancient nations (300 BCE – 476 CE).
 * Each maps to base trait weights [0..1] for all 20 traits.
 */
const PERSONALITY_ARCHETYPES = {
  // Greek city-state flavours
  athenian:       [0.3,0.4,0.9,0.7,0.4,0.5,0.6,0.3,0.8,0.5,0.8,0.3,0.2,0.9,0.3,0.7,0.4,0.4,0.3,0.6],
  spartan:        [0.9,0.4,0.2,0.3,0.9,0.6,0.3,0.7,0.3,0.2,0.3,0.5,0.4,0.2,1.0,0.4,0.8,0.3,0.5,0.7],
  corinthian:     [0.4,0.5,0.8,0.6,0.5,0.5,0.5,0.4,0.6,0.6,0.7,0.3,0.3,0.7,0.4,0.7,0.5,0.6,0.3,0.5],
  theban:         [0.7,0.5,0.3,0.5,0.7,0.5,0.5,0.5,0.5,0.3,0.3,0.4,0.3,0.5,0.7,0.5,0.7,0.4,0.4,0.7],
  macedonian:     [0.9,0.9,0.4,0.6,0.5,0.4,0.5,0.8,0.7,0.8,0.5,0.2,0.5,0.6,0.9,0.5,0.6,0.5,0.6,0.9],
  // Hellenistic kingdoms
  seleucid:       [0.7,0.8,0.6,0.6,0.5,0.5,0.5,0.7,0.6,0.7,0.4,0.3,0.6,0.7,0.7,0.6,0.5,0.5,0.5,0.7],
  ptolemaic:      [0.5,0.5,0.8,0.7,0.6,0.8,0.7,0.7,0.7,0.4,0.6,0.4,0.5,0.9,0.5,0.6,0.5,0.7,0.4,0.6],
  // Roman phases
  roman_republic: [0.7,0.8,0.5,0.6,0.6,0.6,0.6,0.5,0.7,0.7,0.5,0.3,0.7,0.6,0.8,0.6,0.7,0.5,0.4,0.7],
  roman_empire:   [0.8,0.7,0.6,0.5,0.7,0.6,0.6,0.9,0.7,0.6,0.6,0.4,0.7,0.7,0.9,0.5,0.6,0.6,0.7,0.8],
  roman_late:     [0.6,0.4,0.5,0.5,0.8,0.7,0.7,0.8,0.5,0.3,0.5,0.5,0.6,0.5,0.7,0.8,0.5,0.7,0.8,0.4],
  // Carthaginian / Phoenician
  carthaginian:   [0.5,0.6,1.0,0.7,0.6,0.5,0.4,0.6,0.6,0.9,0.9,0.3,0.6,0.6,0.5,0.7,0.5,0.8,0.4,0.5],
  // Persian / Achaemenid successors
  persian:        [0.7,0.8,0.7,0.7,0.6,0.7,0.6,0.9,0.6,0.7,0.5,0.3,0.8,0.8,0.7,0.6,0.6,0.7,0.5,0.7],
  parthian:       [0.7,0.5,0.5,0.5,0.7,0.6,0.5,0.7,0.4,0.4,0.3,0.5,0.7,0.5,0.8,0.7,0.7,0.5,0.6,0.5],
  // Barbarian / frontier
  celtic:         [0.9,0.6,0.3,0.4,0.5,0.8,0.5,0.4,0.4,0.5,0.3,0.4,0.3,0.5,0.8,0.5,0.7,0.3,0.4,0.9],
  germanic:       [0.9,0.5,0.3,0.3,0.5,0.6,0.5,0.4,0.3,0.4,0.2,0.5,0.3,0.4,0.9,0.6,0.6,0.3,0.5,0.8],
  hunnic:         [1.0,0.7,0.4,0.2,0.3,0.4,0.3,0.6,0.3,0.6,0.2,0.4,0.8,0.3,1.0,0.8,0.4,0.5,0.6,0.9],
  // Eastern
  indian:         [0.4,0.5,0.7,0.6,0.5,0.8,0.6,0.6,0.7,0.5,0.4,0.4,0.6,0.8,0.5,0.6,0.6,0.5,0.3,0.5],
  // Default
  default:        [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5],
};

/**
 * Priority axes — 10 strategic objectives mapped to trait amplifiers.
 * Each priority biases certain personality dimensions.
 */
const PRIORITY_AMPLIFIERS = {
  military_supremacy: { aggression:1.4, militarism:1.3, defensiveness:1.1 },
  economic_growth:    { merchantism:1.4, innovation:1.3, greed:0.8 },
  territorial_expansion: { expansionism:1.5, colonialism:1.3, aggression:1.2 },
  diplomatic_dominance:  { diplomacy:1.5, tributarism:1.3, patronage:1.2 },
  cultural_hegemony:  { patronage:1.4, piety:1.3, glory_seeking:1.2 },
  naval_power:        { navalism:1.5, merchantism:1.2, colonialism:1.3 },
  survival:           { defensiveness:1.5, pragmatism:1.4, isolationism:1.3 },
  population_growth:  { populism:1.3, merchantism:1.2, piety:1.1 },
  religious_spread:   { piety:1.5, patronage:1.2, glory_seeking:1.2 },
  internal_stability: { autocracy:1.3, loyalty:1.4, populism:1.2 },
};

/**
 * Build a Float32Array(1000) personality matrix for a nation.
 * Layout: 20 traits × 50 slots.
 * - Slots 0-19: base trait weights (from archetype)
 * - Slots 20-29: priority-amplified weights
 * - Slots 30-39: interaction cross-products (aggression×expansion, etc.)
 * - Slots 40-49: noise perturbation (unique per nation)
 * This block repeats for all 20 traits → 20 × 50 = 1000 elements.
 * @param {object} nation
 * @returns {Float32Array}
 */
export function _buildPersonalityMatrix(nation) {
  const matrix = new Float32Array(1000);

  // Resolve archetype
  const archetypeName = (nation.ai_personality || 'default').toLowerCase();
  const baseWeights = PERSONALITY_ARCHETYPES[archetypeName]
    || PERSONALITY_ARCHETYPES.default;

  // Clone base weights so we can mutate
  const weights = baseWeights.slice();

  // Apply priority amplifiers
  const priorityKey = (nation.ai_priority || '').toLowerCase().replace(/\s+/g, '_');
  const amp = PRIORITY_AMPLIFIERS[priorityKey];
  if (amp) {
    for (const [traitName, factor] of Object.entries(amp)) {
      const idx = PERSONALITY_TRAITS.indexOf(traitName);
      if (idx >= 0) weights[idx] = Math.min(1.0, weights[idx] * factor);
    }
  }

  // Seeded deterministic noise — use nation.id as seed
  const seed = _hashString(String(nation.id || nation.name || 'default'));
  const rng  = _seededRng(seed);

  // Interaction pairs: aggression×expansionism, diplomacy×isolationism, etc.
  const INTERACTIONS = [
    [0,1],[0,4],[1,9],[2,3],[2,10],[3,11],[4,14],[5,6],
    [6,7],[7,18],[8,13],[9,10],[12,15],[16,17],[18,19],
  ];

  for (let t = 0; t < 20; t++) {
    const base = t * 50;

    // Block A (0-19): raw trait weight replicated with slight variation
    for (let i = 0; i < 20; i++) {
      matrix[base + i] = Math.max(0, Math.min(1, weights[i] + (rng() - 0.5) * 0.05));
    }

    // Block B (20-29): priority-modulated weights for decision dimensions
    for (let i = 0; i < 10; i++) {
      matrix[base + 20 + i] = Math.max(0, Math.min(1, weights[t] * (0.8 + rng() * 0.4)));
    }

    // Block C (30-44): interaction cross-products
    for (let i = 0; i < 15; i++) {
      const [a, b] = INTERACTIONS[i];
      matrix[base + 30 + i] = weights[a] * weights[b];
    }

    // Block D (45-49): noise perturbation unique to this nation+trait
    for (let i = 0; i < 5; i++) {
      matrix[base + 45 + i] = rng();
    }
  }

  return matrix;
}

/**
 * Simple djb2-style string hash → unsigned 32-bit int.
 * @param {string} str
 * @returns {number}
 */
function _hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Mulberry32 seeded PRNG — returns function that yields [0,1) floats.
 * @param {number} seed
 * @returns {function}
 */
function _seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── DECISION ENGINE ─────────────────────────────────────────────────────────

/**
 * Available actions for a nation (ancient-world context).
 */
const ACTION_LIST = [
  'build_farm',
  'build_barracks',
  'build_market',
  'recruit_infantry',
  'recruit_cavalry',
  'seek_alliance',
  'mobilize',
  'demobilize',
  'buy_food',
  'sell_goods',
  'pass',
];

/**
 * Personality trait indices that support each action.
 * Format: [traitIndex, weight]
 * PERSONALITY_TRAITS order:
 *   0:aggression, 1:expansionism, 2:merchantism, 3:diplomacy, 4:defensiveness,
 *   5:piety, 6:populism, 7:autocracy, 8:innovation, 9:colonialism,
 *   10:navalism, 11:isolationism, 12:tributarism, 13:patronage, 14:militarism,
 *   15:pragmatism, 16:loyalty, 17:greed, 18:paranoia, 19:glory_seeking
 */
const ACTION_TRAIT_AFFINITY = {
  build_farm:        [[2,1.2],[15,1.1],[6,0.9],[13,0.8]],
  build_barracks:    [[14,1.3],[0,1.1],[4,1.0],[7,0.8]],
  build_market:      [[2,1.4],[17,1.2],[8,1.0],[10,0.7]],
  recruit_infantry:  [[14,1.3],[0,1.2],[19,1.1],[7,0.9]],
  recruit_cavalry:   [[14,1.2],[1,1.1],[0,1.0],[19,0.9]],
  seek_alliance:     [[3,1.4],[16,1.1],[15,1.0],[5,0.8]],
  mobilize:          [[0,1.3],[18,1.1],[14,1.2],[19,1.0]],
  demobilize:        [[3,1.2],[15,1.1],[16,1.0],[4,0.9]],
  buy_food:          [[15,1.1],[6,1.0],[17,0.9],[2,0.8]],
  sell_goods:        [[2,1.3],[17,1.2],[10,1.0],[15,0.8]],
  pass:              [[15,0.9],[11,1.1],[16,0.8],[5,0.7]],
};

/**
 * Softmax with temperature scaling.
 * @param {number[]} scores
 * @param {number} temperature
 * @returns {number[]} probabilities
 */
function _softmax(scores, temperature = 1.0) {
  const scaled = scores.map(s => s / temperature);
  const maxS = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - maxS));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

/**
 * Extract a compact feature vector from the current OU state.
 * Returns array of 20 values, one per personality trait dimension.
 * @param {object} ouState  nation._ou
 * @returns {number[]}
 */
function _buildStateFeatures(ouState) {
  const features = new Array(20).fill(0);
  if (!ouState || !ouState.economy) return features;

  // Helper: find variable value by name in a category array
  const val = (arr, name) => {
    const v = arr.find(x => x.name === name);
    return v ? v.current : 0.5;
  };

  const eco = ouState.economy;
  const mil = ouState.military;
  const dip = ouState.diplomacy;
  const pol = ouState.politics;
  const gol = ouState.goals;

  // 0: aggression — driven by military threat + paranoia
  features[0]  = (val(mil,'military_threat_level') + val(pol,'fear_of_enemies')) * 0.5;
  // 1: expansionism — driven by territory goals + population pressure
  features[1]  = (val(gol,'territorial_expansion') + val(eco,'population_pressure')) * 0.5;
  // 2: merchantism — driven by trade volume + market activity
  features[2]  = (val(eco,'trade_volume') + val(eco,'market_activity')) * 0.5;
  // 3: diplomacy — driven by reputation + alliance count
  features[3]  = (val(dip,'diplomatic_reputation') + val(dip,'alliance_count') / 10) * 0.5;
  // 4: defensiveness — driven by border vulnerability + threat
  features[4]  = (val(mil,'border_vulnerability') + val(mil,'military_threat_level')) * 0.5;
  // 5: piety — driven by religious legitimacy
  features[5]  = val(pol,'religious_legitimacy');
  // 6: populism — driven by public support
  features[6]  = val(pol,'public_support');
  // 7: autocracy — driven by regime centralisation
  features[7]  = val(pol,'regime_centralisation');
  // 8: innovation — driven by tech investment + education
  features[8]  = (val(eco,'technology_investment') + val(eco,'education_spending')) * 0.5;
  // 9: colonialism — driven by exploration activity
  features[9]  = val(gol,'colonial_expansion');
  // 10: navalism — driven by fleet strength
  features[10] = val(mil,'fleet_strength');
  // 11: isolationism — inverse of trade openness
  features[11] = 1.0 - val(dip,'trade_openness');
  // 12: tributarism — driven by tribute income
  features[12] = val(eco,'tribute_income');
  // 13: patronage — driven by cultural spending + arts
  features[13] = (val(eco,'cultural_spending') + val(pol,'patronage_spending')) * 0.5;
  // 14: militarism — driven by army size relative to economy
  features[14] = (val(mil,'army_size') + val(mil,'military_budget_share')) * 0.5;
  // 15: pragmatism — driven by treasury health + stability
  features[15] = (val(eco,'treasury_reserves') + val(pol,'regime_stability')) * 0.5;
  // 16: loyalty — driven by cohesion + elite satisfaction
  features[16] = (val(pol,'social_cohesion') + val(pol,'elite_satisfaction')) * 0.5;
  // 17: greed — driven by GDP growth desire + wealth gap
  features[17] = (val(gol,'wealth_accumulation') + val(eco,'wealth_inequality')) * 0.5;
  // 18: paranoia — driven by espionage threat + coup risk
  features[18] = (val(dip,'espionage_threat') + val(pol,'coup_risk')) * 0.5;
  // 19: glory_seeking — driven by glory goals + prestige
  features[19] = (val(gol,'prestige_pursuit') + val(dip,'diplomatic_prestige')) * 0.5;

  return features;
}

// ─── ST_012: Economic dependency suppresses war actions ───────────────────────
/**
 * Reduce war-related action probabilities when economic_dependency is high.
 * If dep > 0.6: war actions scaled down, trade/alliance actions boosted.
 * @param {object} ou
 * @param {object} nation
 * @param {Array}  results  mutable array of {action, probability, score}
 */
const WAR_ACTIONS   = new Set(['mobilize', 'recruit_infantry', 'recruit_cavalry']);
const PEACE_ACTIONS = new Set(['seek_alliance', 'open_trade_route', 'sell_goods', 'buy_food']);

function _applyEconomicDependencyConstraint(ou, nation, results) {
  // Use trade_openness as proxy for economic dependency (schema var exists)
  // Also account for dynamic modifiers tagged economic_dependency
  let dep = _getVal(ou, 'economy', 'trade_openness') ?? 0;
  // Boost dep from active economic_dependency modifiers
  if (ou.activeModifiers) {
    for (const m of ou.activeModifiers) {
      if (m.varName === 'economic_dependency') dep = Math.min(1, dep + Math.abs(m.deltaMu) * 0.5);
    }
  }
  if (dep <= 0.6) return;

  const suppress = Math.min(1, (dep - 0.6) * 2.5); // 0..1 as dep goes 0.6→1.0
  let warWasCritical = false;

  for (const r of results) {
    if (WAR_ACTIONS.has(r.action)) {
      const before = r.probability;
      r.probability *= Math.max(0, 1 - suppress);
      r.score       *= Math.max(0, 1 - suppress);
      if (before > 0.4 && r.probability < 0.15) warWasCritical = true;
    } else if (PEACE_ACTIONS.has(r.action)) {
      r.probability = Math.min(1, r.probability * (r.action === 'seek_alliance' ? 1.3 : 1.5));
      r.score       = Math.min(10, r.score * 1.3);
    }
  }

  if (warWasCritical && typeof window !== 'undefined' && window.addEventLog) {
    const name = nation?.name ?? nation?.id ?? 'Nation';
    window.addEventLog(`[🤝] ${name}: торговля удерживает от войны`);
  }
}

/**
 * Choose actions based on current OU state and personality matrix.
 * Uses dot product of personality weights × state features to score each action,
 * then applies softmax to get probabilities. Returns top-3 actions.
 * @param {object} nation
 * @param {object} ouState  (nation._ou)
 * @returns {Array<{action:string, probability:number, score:number}>}
 */
export function decideActions(nation, ouState) {
  const ou = ouState || nation._ou;
  if (!ou) return [{ action: 'pass', probability: 1.0, score: 0 }];

  // Build or retrieve personality matrix
  if (!nation._personalityMatrix) {
    nation._personalityMatrix = _buildPersonalityMatrix(nation);
  }
  const pm = nation._personalityMatrix;

  // State feature vector (20 values, one per personality trait)
  const features = _buildStateFeatures(ou);

  // Score each action via weighted dot product over personality traits
  const rawScores = ACTION_LIST.map(action => {
    const affinities = ACTION_TRAIT_AFFINITY[action] || [];
    let score = 0;
    for (const [traitIdx, traitWeight] of affinities) {
      // Use slot 0 of each trait's block (base weight) from the personality matrix
      const pmWeight = pm[traitIdx * 50];         // base trait weight
      const stateVal = features[traitIdx] ?? 0.5; // current state signal
      score += pmWeight * traitWeight * stateVal;
    }
    // Bonus from active modifiers matching action
    if (ou.activeModifiers) {
      for (const mod of ou.activeModifiers) {
        const tag = mod.tag || '';
        if (ACTION_MOD_TAGS[action] && ACTION_MOD_TAGS[action].some(t => tag.includes(t))) {
          score += 0.1 * (mod.strength || 0.5);
        }
      }
    }
    return score;
  });

  // Softmax with configured temperature
  const temp = (nation.ai_temperature) || SUPER_OU_CONFIG.actionSoftmaxTemp;
  const probs = _softmax(rawScores, temp);

  // Build result array and sort descending by probability
  const results = ACTION_LIST.map((action, i) => ({
    action,
    probability: probs[i],
    score: rawScores[i],
  }));

  // Apply economic dependency constraint before finalising
  _applyEconomicDependencyConstraint(ou, nation, results);

  results.sort((a, b) => b.probability - a.probability);

  // Return top-N actions
  return results.slice(0, SUPER_OU_CONFIG.topActionsCount);
}

/**
 * Modifier tags that boost specific actions.
 */
const ACTION_MOD_TAGS = {
  build_farm:        ['harvest','agriculture','irrigation','grain'],
  build_barracks:    ['barracks','drill','recruit','garrison'],
  build_market:      ['trade_route','market','commerce','merchant'],
  recruit_infantry:  ['recruit','infantry','levy','manpower'],
  recruit_cavalry:   ['cavalry','horse','nomad','equestrian'],
  seek_alliance:     ['alliance','treaty','pact','diplomatic'],
  mobilize:          ['mobilize','war','military_emergency','threat'],
  demobilize:        ['peace','demobilize','truce','ceasefire'],
  buy_food:          ['food','famine','grain','supply'],
  sell_goods:        ['export','surplus','trade_boom','merchant'],
  pass:              ['stability','inaction','isolationism','winter'],
};

// ─── ANOMALY SCORE — 7 CATEGORIES ────────────────────────────────────────────

/**
 * Cat 1: Statistical outliers — variables whose |current - mu| > 3σ
 */
function _anomalyCat1_Outliers(ouState) {
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  let score = 0;
  let count = 0;
  for (const cat of cats) {
    for (const v of ouState[cat] || []) {
      const z = Math.abs(v.current - v.mu) / (v.sigma || 0.1);
      if (z > 3) {
        score += (z - 3) * 0.4;
        count++;
      }
    }
  }
  return { score: Math.min(score, 10), count, label: 'outliers' };
}

/**
 * Cat 2: Rapid change detection — delta since last tick too large
 */
function _anomalyCat2_RapidChange(ouState) {
  if (!ouState._prev) return { score: 0, count: 0, label: 'rapid_change' };
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  let score = 0;
  let count = 0;
  for (const cat of cats) {
    const prev = ouState._prev[cat] || [];
    const curr = ouState[cat] || [];
    for (let i = 0; i < curr.length; i++) {
      if (!prev[i]) continue;
      const delta = Math.abs(curr[i].current - prev[i]);
      const threshold = curr[i].sigma * 2.5;
      if (delta > threshold) {
        score += (delta - threshold) / (curr[i].sigma || 0.1) * 0.3;
        count++;
      }
    }
  }
  return { score: Math.min(score, 10), count, label: 'rapid_change' };
}

/**
 * Cat 3: Conflict detection — contradictory high values simultaneously
 * e.g. high mobilization + high demobilization pressure
 */
function _anomalyCat3_Conflicts(ouState) {
  const pairs = [
    ['military', 'army_mobilization', 'military', 'army_demobilization'],
    ['economy',  'trade_volume',      'economy',  'trade_embargo_risk'],
    ['politics', 'regime_stability',  'politics', 'coup_risk'],
    ['diplomacy','alliance_strength', 'diplomacy','international_isolation'],
    ['goals',    'territorial_expansion_drive','goals','territorial_consolidation'],
    ['military', 'offensive_capability',       'military','defensive_posture'],
    ['economy',  'surplus_production',         'economy', 'resource_scarcity'],
    ['politics', 'popular_support',            'politics','protest_intensity'],
  ];
  let score = 0;
  let count = 0;
  for (const [c1, n1, c2, n2] of pairs) {
    const v1 = _getVal(ouState, c1, n1);
    const v2 = _getVal(ouState, c2, n2);
    // Both high simultaneously is a contradiction
    const product = Math.max(0, v1 - 0.55) * Math.max(0, v2 - 0.55);
    if (product > 0.03) {
      score += product * 8;
      count++;
    }
  }
  return { score: Math.min(score, 10), count, label: 'conflicts' };
}

/**
 * Cat 4: Boundary violations — values stuck near min or max
 */
function _anomalyCat4_Boundaries(ouState) {
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  let score = 0;
  let count = 0;
  for (const cat of cats) {
    for (const v of ouState[cat] || []) {
      const range = (v.max - v.min) || 1;
      const posNorm = (v.current - v.min) / range;
      // Within 2% of boundary
      if (posNorm < 0.02 || posNorm > 0.98) {
        score += 0.25;
        count++;
      }
    }
  }
  return { score: Math.min(score, 10), count, label: 'boundaries' };
}

/**
 * Cat 5: Consistency — strongly correlated variable pairs diverging
 */
function _anomalyCat5_Consistency(ouState) {
  const correlated = [
    ['economy','gdp_growth',      'economy','trade_volume',         0.7],
    ['economy','food_production', 'economy','population_growth',    0.6],
    ['military','army_size',      'military','army_supply',         0.8],
    ['military','navy_size',      'military','naval_supply',        0.8],
    ['politics','regime_stability','politics','government_effectiveness', 0.65],
    ['diplomacy','alliance_strength','diplomacy','international_reputation', 0.6],
    ['goals','economic_growth_goal','economy','gdp_growth',          0.55],
    ['goals','military_dominance_goal','military','army_strength',   0.55],
  ];
  let score = 0;
  let count = 0;
  for (const [c1, n1, c2, n2, expectedCorr] of correlated) {
    const v1 = _getVal(ouState, c1, n1);
    const v2 = _getVal(ouState, c2, n2);
    // If both are defined (nonzero), check divergence
    if (v1 > 0.01 && v2 > 0.01) {
      const diff = Math.abs(v1 - v2);
      const threshold = (1 - expectedCorr) + 0.25;
      if (diff > threshold) {
        score += (diff - threshold) * expectedCorr * 3;
        count++;
      }
    }
  }
  return { score: Math.min(score, 10), count, label: 'consistency' };
}

/**
 * Cat 6: Goal alignment — goals vs actual state mismatch
 */
function _anomalyCat6_GoalAlignment(ouState) {
  const alignments = [
    // [goal_cat, goal_var, actual_cat, actual_var]
    ['goals','economic_growth_goal',        'economy','gdp_growth'],
    ['goals','military_dominance_goal',     'military','army_strength'],
    ['goals','diplomatic_influence_goal',   'diplomacy','international_reputation'],
    ['goals','regime_survival_goal',        'politics','regime_stability'],
    ['goals','territorial_expansion_drive', 'military','offensive_capability'],
    ['goals','resource_security_goal',      'economy','resource_access'],
    ['goals','population_welfare_goal',     'economy','living_standards'],
    ['goals','technological_leadership',    'economy','technological_development'],
    ['goals','religious_authority_goal',    'politics','religious_authority'],
    ['goals','naval_dominance_goal',        'military','navy_strength'],
  ];
  let score = 0;
  let count = 0;
  for (const [gc, gn, ac, an] of alignments) {
    const goal   = _getVal(ouState, gc, gn);
    const actual = _getVal(ouState, ac, an);
    // High goal but low actual = misalignment
    const gap = Math.max(0, goal - actual - 0.25);
    if (gap > 0) {
      score += gap * 1.5;
      count++;
    }
  }
  return { score: Math.min(score, 10), count, label: 'goal_alignment' };
}

/**
 * Cat 7: Modifier saturation — too many simultaneous active modifiers
 */
function _anomalyCat7_ModifierSaturation(ouState) {
  const mods = (ouState.activeModifiers || []).length;
  const threshold = SUPER_OU_CONFIG.maxActiveModifiers || 15;
  if (mods <= threshold) return { score: 0, count: mods, label: 'modifier_saturation' };
  const score = Math.min((mods - threshold) * 0.5, 10);
  return { score, count: mods, label: 'modifier_saturation' };
}

/**
 * Compute anomaly score across all 7 categories.
 * @param {object} nation
 * @param {object} ouState
 * @returns {{ total: number, categories: object[], isAnomaly: boolean }}
 */
export function calculateAnomalyScore(nation, ouState) {
  const ou = ouState || nation._ou;
  const cats = [
    _anomalyCat1_Outliers(ou),
    _anomalyCat2_RapidChange(ou),
    _anomalyCat3_Conflicts(ou),
    _anomalyCat4_Boundaries(ou),
    _anomalyCat5_Consistency(ou),
    _anomalyCat6_GoalAlignment(ou),
    _anomalyCat7_ModifierSaturation(ou),
  ];

  const weights = [1.5, 1.2, 1.3, 0.6, 0.8, 1.0, 0.7];
  let total = 0;
  for (let i = 0; i < cats.length; i++) {
    total += cats[i].score * weights[i];
  }
  total = Math.min(total / 10, 1.0); // normalise to [0,1]

  const threshold = SUPER_OU_CONFIG.anomalyThreshold || 0.45;
  return {
    total,
    isAnomaly: total >= threshold,
    nation: nation.id || nation.name,
    tick: ou.tick || 0,
    categories: cats,
  };
}

/**
 * Save a snapshot of current values for next-tick delta detection.
 * Call this AFTER updateState, BEFORE the next tick.
 * @param {object} ouState
 */
export function snapshotState(ouState) {
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  ouState._prev = {};
  for (const cat of cats) {
    ouState._prev[cat] = (ouState[cat] || []).map(v => v.current);
  }
}

// ─── MAIN TICK FUNCTION ───────────────────────────────────────────────────────

// ─── RESENTMENT REVENGE CHECK ─────────────────────────────────────────────────

/**
 * Память обид: если накопленная обида > 0.85 и армия сильная —
 * нация добавляет цель REVENGE и усиливает агрессию.
 * @param {object} nation
 * @param {object} ou
 * @param {number} currentTurn
 */
function _checkResentmentRevenge(nation, ou, currentTurn) {
  const pr = nation._player_relation;
  if (!pr) return;

  const resentmentScore = pr.resentment ?? 0;
  const armySz  = _getVal(ou, 'military', 'army_size')   ?? 0.3;
  const morale  = _getVal(ou, 'military', 'troop_morale') ?? 0.65;
  const militaryConfidence = (armySz + morale) / 2;

  if (resentmentScore <= 0.85 || militaryConfidence <= 0.5) return;
  if (ou._revenge_cooldown && currentTurn < ou._revenge_cooldown) return;

  // Push REVENGE goal onto goals_stack
  if (!ou.goals_stack) ou.goals_stack = [];
  ou.goals_stack = ou.goals_stack.filter(g => g.name !== 'REVENGE');
  ou.goals_stack.unshift({ name: 'REVENGE', priority: 0.9 });

  // Apply OU modifiers: aggression+0.40/40t, expansion+0.35/40t, diplomatic_openness-0.30/30t
  _mod(ou, 'revenge_aggression',   'military',  'army_size',           +0.40, 40);
  _mod(ou, 'revenge_expansion',    'goals',     'expansion_drive',     +0.35, 40);
  _mod(ou, 'revenge_dip_close',    'diplomacy', 'diplomatic_openness', -0.30, 30);

  // Set revenge cooldown
  ou._revenge_cooldown = currentTurn + 50;

  // Log event
  if (typeof window !== 'undefined' && window.addEventLog) {
    window.addEventLog(`[⚔] ${nation.name ?? nation.id} ищет реванш`);
  }
}

// ─── ST_014: CONQUEST FATIGUE ────────────────────────────────────────────────

/**
 * _updateConquestFatigue — вычисляет усталость от завоеваний на основе
 * соотношения регионов к базовым. Вызывается из updateState().
 */
function _updateConquestFatigue(nation, ou) {
  const regions     = nation.regions     ?? nation.territories ?? 1;
  const baseRegions = nation.base_regions ?? nation.start_territories ?? regions;
  if (baseRegions <= 0) return;

  const fatigue = Math.min(1.0, (regions / baseRegions - 1) * 0.08);
  if (fatigue <= 0) return;

  if (fatigue > 0.7) {
    // Push CONSOLIDATION goal, remove EXPAND
    if (!ou.goals_stack) ou.goals_stack = [];
    ou.goals_stack = ou.goals_stack.filter(g => g.name !== 'EXPAND');
    if (!ou.goals_stack.find(g => g.name === 'CONSOLIDATION')) {
      ou.goals_stack.push({ name: 'CONSOLIDATION', priority: 0.8 });
    }
    // Ослабить стремление к расширению и стабильность
    _mod(ou, 'cf_expansion', 'goals',    'expansion_drive', -(fatigue * 0.5), 5);
    _mod(ou, 'cf_stability', 'politics', 'state_stability',  -(fatigue * 0.3), 5);
  }

  if (fatigue > 0.5) {
    if (typeof window !== 'undefined' && window.addEventLog) {
      window.addEventLog(`[📉] ${nation.name ?? nation.id}: усталость от завоеваний (${(fatigue * 100).toFixed(0)}%)`);
    }
  }
}

/**
 * Main entry point — called once per game turn for a specific nation.
 *
 * @param {object} gameState  — full game state (gameState.nations map)
 * @param {string} nationId   — id of the nation to process
 * @returns {object}          — { nationId, actions, anomaly, debug? }
 */
export function tick(gameState, nationId) {
  const nation = gameState.nations
    ? gameState.nations[nationId] || gameState.nations.find?.(n => n.id === nationId)
    : null;

  if (!nation) {
    return { nationId, error: 'nation_not_found', actions: [], anomaly: null };
  }

  // 1. Initialise OU state if this nation has never been processed
  if (!nation._ou) {
    initNation(nation);
  }

  const ouState = nation._ou;

  // 2. Snapshot previous state (for delta / rapid-change detection)
  snapshotState(ouState);

  // 3. Apply situational modifiers — shift mu values temporarily
  applyModifiers(nation, ouState, gameState);

  // 3b. Check resentment-driven revenge impulse
  _checkResentmentRevenge(nation, ouState, ouState.tick);

  // 4. Advance all 400 OU variables by one time step
  updateState(nation);

  // 5a. Execute strategic plan phase (StrategicLLM) — adjusts ou overrides
  let strategicCtx = null;
  if (typeof window !== 'undefined' && window.StrategicLLM?.executePlan) {
    try {
      strategicCtx = window.StrategicLLM.executePlan(nation, ouState, ouState.tick);
    } catch (e) { /* fallback: no strategic overrides */ }
  }

  // 5b. Decide top-N actions based on personality + state
  const actions = decideActions(nation, ouState);

  // 6. Calculate anomaly score across 7 categories
  // If _force_anomaly is set (e.g., ruler died), override score to critical level
  const anomaly = calculateAnomalyScore(nation, ouState);
  if (ouState._force_anomaly) {
    anomaly.total = Math.max(anomaly.total, 95);
    anomaly.isAnomaly = true;
    anomaly._forced_reason = ouState._anomaly_reason ?? 'forced';
    ouState._force_anomaly  = false;
    ouState._anomaly_reason = null;
  }

  // 7. Record decision to history for memory modifiers
  if (!ouState.history) ouState.history = [];
  ouState.history.push({
    tick: ouState.tick,
    topAction: actions[0]?.action ?? 'pass',
    anomalyTotal: anomaly.total,
  });
  if (ouState.history.length > SUPER_OU_CONFIG.historyLength) {
    ouState.history.shift();
  }

  // 8. Build result object
  const result = {
    nationId,
    actions,            // [{action, probability, score}, ...]
    anomaly,            // {total, isAnomaly, categories, ...}
    strategic_context: strategicCtx ?? null,
  };

  // 9. Attach debug vector if debugMode is on
  if (SUPER_OU_CONFIG.debugMode) {
    result.debug = getDebugVector(nation);
  }

  return result;
}

// ─── DEBUG VECTOR ─────────────────────────────────────────────────────────────

/**
 * Return debug vector snapshot for logging/testing.
 * @param {object} nation
 * @returns {object}
 */
export function getDebugVector(nation) {
  const ou = nation._ou;
  if (!ou) return { error: 'nation not initialised' };
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  const snapshot = {};
  for (const cat of cats) {
    snapshot[cat] = (ou[cat] || []).map(v => ({
      name: v.name,
      current: +v.current.toFixed(4),
      mu: +v.mu.toFixed(4),
      sigma: v.sigma,
      theta: v.theta,
    }));
  }
  return {
    tick: ou.tick,
    activeModifiers: (ou.activeModifiers || []).length,
    modifierNames: (ou.activeModifiers || []).map(m => m.name),
    state: snapshot,
  };
}

// ─── GET CONTEXT FOR SONNET ───────────────────────────────────────────────────

/**
 * Build a compact context object for Sonnet LLM calls.
 * Includes top-10 OU variable outliers, active modifiers, and strategic plan.
 * @param {object} nation
 * @returns {object}
 */
export function getContextForSonnet(nation) {
  const ou = nation._ou;
  if (!ou) return { error: 'not_initialised' };

  // ── Mood derived from key OU variables ──────────────────────────────────────
  const armySz  = _getVal(ou, 'military', 'army_size')              ?? 0.3;
  const morale  = _getVal(ou, 'military', 'troop_morale')           ?? 0.65;
  const warExh  = _getVal(ou, 'military', 'war_exhaustion')         ?? 0.1;
  const tradeB  = _getVal(ou, 'economy',  'trade_balance')          ?? 0;
  const tradeO  = _getVal(ou, 'economy',  'trade_openness')         ?? 0.5;
  const regStab = _getVal(ou, 'politics', 'regime_stability')       ?? 0.65;
  const dipInc  = _getVal(ou, 'diplomacy','diplomatic_incidents')   ?? 0.05;
  const dipIso  = _getVal(ou, 'diplomacy','diplomatic_isolation_risk') ?? 0.1;
  const treasury= _getVal(ou, 'economy',  'treasury')               ?? 0;
  const mood = {
    fear_of_player:      +Math.min(1, dipIso * 2 + dipInc * 3).toFixed(3),
    military_confidence: +Math.min(1, (armySz + morale) / 2).toFixed(3),
    trade_satisfaction:  +Math.min(1, Math.max(0, (tradeB + 0.5 + tradeO) / 2)).toFixed(3),
    resentment:          +Math.min(1, dipInc * 5).toFixed(3),
    desperation:         +Math.min(1, (1 - regStab) + Math.max(0, -treasury) * 2).toFixed(3),
    war_weary:           +warExh.toFixed(3),
  };

  // ── Active crises: modifiers with effective severity > 0.5 ──────────────────
  const active_crises = (ou.activeModifiers || [])
    .map(m => ({ name: m.name, severity: Math.abs(m.delta ?? m.severity ?? 0) }))
    .filter(m => m.severity > 0.5)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map(m => ({ name: m.name, severity: +m.severity.toFixed(2) }));

  // ── Current goals ────────────────────────────────────────────────────────────
  const goalsStack = nation._ou?.goals_stack ?? [];
  const current_goals = goalsStack.slice(0, 3).map(g => g.name ?? String(g));
  if (current_goals.length === 0) {
    (ou.goals || []).slice().sort((a, b) => b.current - a.current)
      .slice(0, 3).forEach(g => current_goals.push(g.name));
  }

  // ── Player relation ──────────────────────────────────────────────────────────
  const pr = nation._player_relation ?? {};
  const player_relation = { trust: pr.trust ?? 0, loyalty: pr.loyalty ?? 0,
    resentment: pr.resentment ?? 0, betrayals: pr.betrayals ?? 0 };

  // ── Military posture ─────────────────────────────────────────────────────────
  const mc = mood.military_confidence;
  const military_posture = mc > 0.65 ? 'strong' : mc < 0.40 ? 'weak' : 'neutral';

  // ── Strategic context ────────────────────────────────────────────────────────
  const sp = nation._strategic_plan;
  const strategic_context = sp
    ? { strategy_type: sp.strategy, target: sp.goal,
        reasoning: sp.reasoning ?? null, phase: sp.currentPhase ?? 0 }
    : null;

  // ── Diplomatic memory ────────────────────────────────────────────────────────
  const diplomatic_memory = (typeof getHandoffContext === 'function')
    ? getHandoffContext(nation.id ?? nation.name, 'sonnet') : null;

  // ── Statistical outliers ─────────────────────────────────────────────────────
  const cats = ['economy', 'military', 'diplomacy', 'politics', 'goals'];
  const outliers = [];
  for (const cat of cats) {
    for (const v of (ou[cat] || [])) {
      const z = v.sigma > 0 ? Math.abs(v.current - v.mu) / v.sigma : 0;
      if (z > 2.0) outliers.push({ cat, name: v.name, current: +v.current.toFixed(3),
        mu: +v.mu.toFixed(3), z: +z.toFixed(2) });
    }
  }
  outliers.sort((a, b) => b.z - a.z);

  return {
    nationId: nation.id ?? null, name: nation.name ?? null,
    personality: nation.ai_personality ?? null, priority: nation.ai_priority ?? null,
    tick: ou.tick,
    mood, active_crises, current_goals, player_relation, military_posture,
    strategic_context, diplomatic_memory,
    top_outliers:      outliers.slice(0, 10),
    active_modifiers:  (ou.activeModifiers || []).map(m => m.name),
    priority_actions:  ou.priority_actions ?? [],
    forbidden_actions: ou.forbidden_actions ?? [],
  };
}

// ─── ST_009: EVENT_DELTA_MAP + onDiplomacyEvent ────────────────────────────────
// Format: [category, varName, deltaMu, durationTurns] — 9999 = permanent
const _PERM = 9999;
export const EVENT_DELTA_MAP = {
  ALLIANCE_SIGNED:   [['diplomacy','alliance_reliability',+0.55,80],['diplomacy','international_trust',+0.45,80],
                      ['military','war_exhaustion',-0.30,60],['goals','expansion_drive',-0.20,80]],
  ALLIANCE_BROKEN:   [['diplomacy','alliance_reliability',-0.60,_PERM],['diplomacy','international_trust',-0.50,_PERM],
                      ['diplomacy','diplomatic_isolation_risk',+0.40,100],['_betrayal_push',null,null,null]],
  TRADE_AGREEMENT:   [['diplomacy','trade_partner_count',+0.25,60],['economy','trade_openness',+0.15,60],
                      ['diplomacy','trade_bloc_integration',+0.20,_PERM],['goals','expansion_drive',-0.15,40]],
  TRADE_CANCELLED:   [['diplomacy','trade_partner_count',-0.30,30],['diplomacy','trade_bloc_integration',-0.25,_PERM],
                      ['diplomacy','diplomatic_isolation_risk',+0.20,40]],
  PROMISE_BROKEN:    [['diplomacy','international_trust',-0.70,_PERM],['diplomacy','diplomatic_isolation_risk',+0.50,120],
                      ['diplomacy','alliance_reliability',-0.40,_PERM],['_betrayal_push','high',null,null]],
  TRIBUTE_AGREED:    [['military','war_exhaustion',+0.40,60],['diplomacy','diplomatic_incidents',+0.60,_PERM],
                      ['military','military_loyalty',-0.25,40],['goals','expansion_drive',-0.30,50]],
  HUMILIATING_PEACE: [['military','war_exhaustion',+0.45,80],['military','army_morale',+0.50,60],
                      ['military','military_loyalty',-0.40,50],['diplomacy','diplomatic_incidents',+0.70,_PERM],
                      ['_betrayal_push','humiliation',null,null]],
  HONORABLE_PEACE:   [['military','war_exhaustion',-0.15,40],['diplomacy','international_trust',+0.15,30],
                      ['military','army_morale',-0.20,20]],
  INSULT_RECEIVED:   [['diplomacy','diplomatic_incidents',+0.35,60],['diplomacy','visa_openness',-0.30,30]],
  GIFT_RECEIVED:     [['diplomacy','international_trust',+0.20,30],['diplomacy','visa_openness',+0.15,20]],
  MARRIAGE_ALLIANCE: [['diplomacy','alliance_reliability',+0.65,120],['diplomacy','international_trust',+0.55,120],
                      ['diplomacy','diplomatic_isolation_risk',-0.30,120]],
};

/** Apply diplomacy event deltas to nation's OU state.
 *  nationId: nation ID string or nation object
 *  data: { severity?, gameState? } — extra context */
export function onDiplomacyEvent(nationId, eventType, data = {}) {
  const gs = data?.gameState ?? (typeof GAME_STATE !== 'undefined' ? GAME_STATE : null);
  const ouKey = nationId?.id ?? nationId;
  const nation = nationId?.name ? nationId : (gs?.nations?.[ouKey] ?? null);
  if (!nation) return;
  const ou = nation._ou;
  if (!ou) return;

  const deltas = EVENT_DELTA_MAP[eventType];
  if (!deltas) return;

  for (const [cat, varName, delta, dur] of deltas) {
    if (cat === '_betrayal_push') {
      // Record betrayal in memory for slow-recovery (ST_020)
      if (!ou._betrayal_memory) ou._betrayal_memory = [];
      const severity = varName ?? data?.severity ?? 'normal'; // varName reused as severity here
      ou._betrayal_memory.push({ severity, turn: ou.tick ?? 0 });
      // Immediate trust/coalition penalties
      _mod(ou, `BETRAYAL_${ou.tick}`, 'diplomacy', 'alliance_reliability', -0.25, 60);
      _mod(ou, `BETRAY_TRUST_${ou.tick}`, 'diplomacy', 'international_trust', -0.20, 80);
      continue;
    }
    const duration = dur === _PERM ? 9999 : (dur ?? 10);
    const modName  = `EVT_${eventType}_${varName}`;
    _mod(ou, modName, cat, varName, delta, duration);
  }

  // Update player relation memory
  if (!nation) return;
  if (!nation._player_relation) nation._player_relation = { trust: 0.5, loyalty: 0.5, resentment: 0, betrayals: 0 };
  const pr = nation._player_relation;
  if (eventType === 'ALLIANCE_BROKEN' || eventType === 'PROMISE_BROKEN') { pr.betrayals = (pr.betrayals||0)+1; pr.trust -= 0.25; }
  if (eventType === 'ALLIANCE_SIGNED' || eventType === 'TRADE_AGREEMENT')  { pr.trust = Math.min(1, (pr.trust||0.5)+0.15); }
  if (eventType === 'HUMILIATING_PEACE' || eventType === 'TRIBUTE_AGREED') { pr.resentment = Math.min(1, (pr.resentment||0)+0.30); }
  pr.trust      = Math.max(0, Math.min(1, pr.trust ?? 0.5));
  pr.resentment = Math.max(0, Math.min(1, pr.resentment ?? 0));
}

// ─── ST_016: onRulerDied ──────────────────────────────────────────────────────
/**
 * onRulerDied(nationId, gameState)
 * Применить кризис преемственности: stability↓, legitimacy↓, coalition*0.7,
 * _force_anomaly=true для немедленного вызова LLM-обработчика в tick().
 */
export function onRulerDied(nationId, gameState) {
  const gs = gameState ?? (typeof GAME_STATE !== 'undefined' ? GAME_STATE : null);
  const ouKey = nationId?.id ?? nationId;
  const nation = nationId?.name ? nationId : (gs?.nations?.[ouKey] ?? null);
  if (!nation) return;
  if (!nation._ou) initNation(nation);
  const ou = nation._ou;

  // Permanent stability and legitimacy hit
  _mod(ou, 'RULER_DIED_STAB',  'politics',  'state_stability',      -0.35, 9999);
  _mod(ou, 'RULER_DIED_LEGIT', 'politics',  'government_legitimacy',-0.25, 30);
  _mod(ou, 'RULER_DIED_MIL',   'military',  'military_readiness',   -0.20, 20);

  // Coalition weakening: reduce coalition_loyalty by 30%
  const coalVar = (ou.diplomacy ?? []).find(v => v.name === 'coalition_loyalty');
  if (coalVar) {
    const cut = coalVar.current * 0.30;
    _mod(ou, 'RULER_DIED_COAL', 'diplomacy', 'coalition_loyalty', -cut, 9999);
  }

  // Mark for forced anomaly handling on next tick
  ou._force_anomaly   = true;
  ou._anomaly_reason  = 'Succession crisis';

  if (typeof window !== 'undefined' && window.addEventLog) {
    const name = nation.name ?? ouKey;
    window.addEventLog(`[👑] Правитель ${name} умер — кризис преемственности`);
  }
}

// ─── ST_017: onPlayerReputationEvent ─────────────────────────────────────────
/**
 * onPlayerReputationEvent(eventType, gameState)
 * При PROMISE_BROKEN или BETRAYED_ALLY применить штраф доверия к игроку
 * всем нациям Tier1+Tier2 (tier <= 2), не являющимся самим игроком.
 */
export function onPlayerReputationEvent(eventType, gameState) {
  const gs = gameState ?? (typeof GAME_STATE !== 'undefined' ? GAME_STATE : null);
  if (!gs) return;

  const trustHit = eventType === 'BETRAYED_ALLY' ? -0.25 : -0.15; // PROMISE_BROKEN default
  const nations = gs.nations ?? {};
  const nationList = Array.isArray(nations) ? nations : Object.values(nations);
  const playerId = gs.player_nation;

  let affected = 0;
  for (const nation of nationList) {
    const nid = nation.id ?? nation.name;
    if (nid === playerId) continue;
    const tier = nation.tier ?? nation.ai_tier ?? 99;
    if (tier > 2) continue; // Tier1+Tier2 only

    if (!nation._ou) initNation(nation);
    const ou = nation._ou;

    // trust_index_player += trustHit / 30 turns
    _mod(ou, `REP_TRUST_${eventType}`, 'diplomacy', 'trust_index_player', trustHit, 30);
    // rivalry += |trustHit|*0.8 / 25 turns
    _mod(ou, `REP_RIVAL_${eventType}`, 'diplomacy', 'rivalry_index',      Math.abs(trustHit) * 0.8, 25);
    affected++;
  }

  if (affected > 0 && typeof window !== 'undefined' && window.addEventLog) {
    window.addEventLog(`[📢] Репутация игрока упала — ${affected} наций узнали о нарушении слова`);
  }
}

// ─── GLOBAL BROWSER EXPORT ────────────────────────────────────────────────────
// Expose SuperOU as window.SuperOU so non-module scripts (turn.js) can call it.
if (typeof window !== 'undefined') {
  window.SuperOU = {
    tick,
    initNation,
    updateState,
    applyModifiers,
    decideActions,
    calculateAnomalyScore,
    getDebugVector,
    getContextForSonnet,
    onDiplomacyEvent,
    onRulerDied,
    onPlayerReputationEvent,
    EVENT_DELTA_MAP,
    SUPER_OU_CONFIG,
  };
}

