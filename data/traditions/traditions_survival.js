// ============================================================================
//  ТРАДИЦИИ ВЫЖИВАНИЯ И АДАПТАЦИИ (20 шт.)
//  Стойкость, приспособление, кризисные стратегии
// ============================================================================

const TRADITIONS_SURVIVAL = {

  // ── СТОЙКОСТЬ ───────────────────────────────────────────────────────────────

  resilient_people: {
    name: 'Стойкий народ',
    cat: 'survival',
    desc: 'Чума, война, землетрясение — этот народ пережил всё и восстанавливается',
    bonus: { population_growth: 0.002, stability: 0.03, happiness: 1 },
    mut: [
      { to: 'survivor_mentality', need: { exp_suffering: 120 }, w: 0.8 },
      { to: 'famine_preparedness', need: { exp_suffering: 80, exp_agriculture: 40 }, w: 0.6 },
    ]
  },

  survivor_mentality: {
    name: 'Менталитет выживших',
    cat: 'survival',
    desc: 'Мы пережили худшее. Ничто не сломит нас больше',
    bonus: { military_morale: 0.04, population_growth: 0.002, stability: 0.03 },
    mut: [
      { to: 'resilient_people', need: { peace: 200 }, w: 0.5 },
    ]
  },

  famine_preparedness: {
    name: 'Готовность к голоду',
    cat: 'survival',
    desc: 'Зернохранилища полны, запасы засолены. Голод придёт — мы готовы',
    bonus: { food_stockpile: 0.15, food_production: 0.03, happiness: 1 },
    mut: [
      { to: 'warehouse_builders', need: { exp_trade: 60 }, w: 0.6 },
      { to: 'grain_masters', need: { exp_agriculture: 100 }, w: 0.5 },
    ]
  },

  plague_resistance: {
    name: 'Устойчивость к мору',
    cat: 'survival',
    desc: 'Горький опыт научил: изоляция больных, чистота, травы. Чума менее страшна',
    bonus: { population_growth: 0.002, happiness: 1 },
    mut: [
      { to: 'medical_knowledge', need: { exp_culture: 80 }, w: 0.6 },
      { to: 'healing_temples', need: { exp_religion: 60 }, w: 0.4 },
    ]
  },

  // ── АДАПТАЦИЯ К МЕСТНОСТИ ───────────────────────────────────────────────────

  mountain_refuge: {
    name: 'Горное убежище',
    cat: 'survival',
    desc: 'Горы — крепость, которую не строят руки. Враг не поднимется по тропам',
    bonus: { garrison_defense: 0.08, army_strength_mountains: 0.06, trade_income: -0.04 },
    mut: [
      { to: 'guerrilla_warfare', need: { exp_war: 80 }, w: 0.8 },
      { to: 'mountain_warriors', need: { exp_war: 100 }, w: 0.7 },
      { to: 'terrace_farming', need: { exp_agriculture: 100 }, w: 0.5 },
    ]
  },

  fortress_mentality: {
    name: 'Крепостной менталитет',
    cat: 'survival',
    desc: 'За стенами безопасно. Мир снаружи — враждебен',
    bonus: { garrison_defense: 0.10, stability: 0.03, trade_income: -0.05, diplomacy: -3 },
    mut: [
      { to: 'fortification_builders', need: { exp_war: 60 }, w: 0.7 },
      { to: 'isolationism', need: { exp_suffering: 60 }, w: 0.5 },
    ]
  },

  nomadic_heritage: {
    name: 'Кочевое наследие',
    cat: 'survival',
    desc: 'Деды были кочевниками. Лёгкость на подъём осталась в крови',
    bonus: { army_speed: 0.06, cavalry_strength: 0.04, building_cost: 0.04 },
    mut: [
      { to: 'seasonal_migration', need: { exp_agriculture: 60, mountain: true }, w: 0.7 },
      { to: 'horse_breeders', need: { exp_agriculture: 80, exp_war: 40 }, w: 0.6 },
      { to: 'pastoral_herders', need: { exp_agriculture: 80 }, w: 0.5 },
    ]
  },

  seasonal_migration: {
    name: 'Сезонная миграция',
    cat: 'survival',
    desc: 'Летом — в горы, зимой — в долины. Стада следуют за травой',
    bonus: { food_production: 0.04, cavalry_strength: 0.02, stability: -0.01 },
    mut: [
      { to: 'pastoral_herders', need: { exp_agriculture: 80, peace: 100 }, w: 0.7 },
    ]
  },

  water_management: {
    name: 'Управление водой',
    cat: 'survival',
    desc: 'Цистерны, каналы, колодцы — вода на вес золота, и её берегут',
    bonus: { food_production: 0.05, population_growth: 0.001, happiness: 1 },
    mut: [
      { to: 'irrigation_experts', need: { exp_agriculture: 100, exp_culture: 40 }, w: 0.7 },
    ]
  },

  // ── СОПРОТИВЛЕНИЕ ───────────────────────────────────────────────────────────

  underground_networks: {
    name: 'Подпольные сети',
    cat: 'survival',
    desc: 'Тайные встречи, скрытые склады оружия. Оккупант не знает покоя',
    bonus: { garrison_defense: 0.06, stability: 0.02, spy_defense: 0.05 },
    mut: [
      { to: 'guerrilla_warfare', need: { exp_war: 60 }, w: 0.8 },
      { to: 'spy_network', need: { exp_diplomacy: 60 }, w: 0.5 },
    ]
  },

  stubborn_independence: {
    name: 'Упрямая независимость',
    cat: 'survival',
    desc: 'Лучше смерть, чем рабство. Этот народ не склоняет голову',
    bonus: { military_morale: 0.06, garrison_defense: 0.04, diplomacy: -3, assimilation_speed: -0.06 },
    mut: [
      { to: 'guerrilla_warfare', need: { exp_war: 80, exp_suffering: 60 }, w: 0.7 },
      { to: 'blood_oath', need: { exp_war: 60, exp_religion: 40 }, w: 0.5 },
      { to: 'fortress_mentality', need: { exp_suffering: 80 }, w: 0.4 },
    ]
  },

  diaspora_tradition: {
    name: 'Традиция диаспоры',
    cat: 'survival',
    desc: 'Рассеянные по миру, но не забывшие родину. Связи торговли крепче стен',
    bonus: { trade_income: 0.06, assimilation_speed: 0.04, diplomacy: 3 },
    mut: [
      { to: 'maritime_trade', need: { exp_trade: 80, coastal: true }, w: 0.7 },
      { to: 'cosmopolitan', need: { exp_diplomacy: 80 }, w: 0.5 },
    ]
  },

  quick_adaptation: {
    name: 'Быстрая адаптация',
    cat: 'survival',
    desc: 'Новые земли, новые обычаи — этот народ перенимает лучшее у всех',
    bonus: { assimilation_speed: 0.08, population_growth: 0.001, trade_income: 0.02 },
    mut: [
      { to: 'bilingual_culture', need: { exp_diplomacy: 60 }, w: 0.7 },
      { to: 'mixed_heritage', need: { exp_suffering: 40, exp_diplomacy: 40 }, w: 0.5 },
    ]
  },

  // ── СПЕЦИФИЧЕСКИЕ ───────────────────────────────────────────────────────────

  earthquake_builders: {
    name: 'Строители против землетрясений',
    cat: 'survival',
    desc: 'Земля трясётся часто. Стены строят толстые, крыши — лёгкие',
    bonus: { building_cost: -0.04, garrison_defense: 0.03, happiness: 1 },
    mut: [
      { to: 'engineering_tradition', need: { exp_culture: 100 }, w: 0.5 },
    ]
  },

  fire_prevention: {
    name: 'Защита от пожаров',
    cat: 'survival',
    desc: 'Каменные стены, запасы воды, ночная стража — огонь не застанет врасплох',
    bonus: { stability: 0.03, happiness: 1, garrison_defense: 0.02 },
    mut: [
      { to: 'written_law', need: { exp_civic: 80 }, w: 0.4 },
    ]
  },

  flood_management: {
    name: 'Управление паводками',
    cat: 'survival',
    desc: 'Дамбы, каналы, отводы — река не выйдет из берегов',
    bonus: { food_production: 0.04, stability: 0.02, building_cost: 0.02 },
    mut: [
      { to: 'irrigation_experts', need: { exp_agriculture: 80 }, w: 0.7 },
      { to: 'water_management', need: { exp_agriculture: 60 }, w: 0.5 },
    ]
  },

  volcanic_resilience: {
    name: 'Жизнь у вулкана',
    cat: 'survival',
    desc: 'Этна дышит огнём, но её пепел делает землю плодородной. Риск — цена изобилия',
    bonus: { food_production: 0.05, happiness: -1, population_growth: 0.001 },
    mut: [
      { to: 'resilient_people', need: { exp_suffering: 60 }, w: 0.7 },
      { to: 'earth_spirits', need: { exp_religion: 60 }, w: 0.4 },
    ]
  },

  colonial_heritage: {
    name: 'Колониальное наследие',
    cat: 'survival',
    desc: 'Предки пересекли море ради новой жизни. Дух первопроходцев жив',
    bonus: { population_growth: 0.001, trade_income: 0.03, naval_strength: 0.02, stability: 0.02 },
    mut: [
      { to: 'colonizer_spirit', need: { exp_naval: 80, exp_diplomacy: 40 }, w: 0.7 },
      { to: 'cosmopolitan', need: { exp_diplomacy: 80, exp_trade: 60 }, w: 0.5 },
    ]
  },

  trojan_legacy: {
    name: 'Троянское наследие',
    cat: 'survival',
    desc: 'Мы — потомки троянцев, бежавших от огня Илиона. Память о катастрофе — в крови',
    bonus: { military_morale: 0.03, stability: 0.03, diplomacy: 2, garrison_defense: 0.03 },
    mut: [
      { to: 'diplomatic_survivors', need: { exp_diplomacy: 80 }, w: 0.7 },
      { to: 'mixed_heritage', need: { exp_suffering: 40 }, w: 0.5 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_SURVIVAL;
