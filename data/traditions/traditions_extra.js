// ============================================================================
//  ДОПОЛНИТЕЛЬНЫЕ ТРАДИЦИИ (20 шт.)
//  Мелкие специализации, уникальные черты, перекрёстные пути
// ============================================================================

const TRADITIONS_EXTRA = {

  // ── СЕЛЬСКОЕ ────────────────────────────────────────────────────────────────

  honey_gatherers: {
    name: 'Собиратели мёда',
    cat: 'economic',
    desc: 'Гиблейский мёд славится на весь мир. Пчёлы — маленькие золотые работники',
    bonus: { trade_income: 0.03, food_production: 0.02, happiness: 1 },
    mut: [
      { to: 'luxury_production', need: { exp_trade: 80 }, w: 0.5 },
    ]
  },

  timber_industry: {
    name: 'Лесная промышленность',
    cat: 'economic',
    desc: 'Леса Этны дают отличный строевой лес для кораблей и зданий',
    bonus: { production_bonus: 0.04, naval_upkeep: -0.03, building_cost: -0.03 },
    mut: [
      { to: 'boat_builders', need: { exp_naval: 60, coastal: true }, w: 0.6 },
    ]
  },

  stone_quarrying: {
    name: 'Камнедобыча',
    cat: 'economic',
    desc: 'Каменоломни снабжают материалом храмы и стены. Тяжёлый труд, но нужный',
    bonus: { building_cost: -0.06, production_bonus: 0.02 },
    mut: [
      { to: 'monumental_architecture', need: { exp_culture: 80, exp_religion: 40 }, w: 0.6 },
      { to: 'fortification_builders', need: { exp_war: 60 }, w: 0.5 },
    ]
  },

  // ── ВОЕННЫЕ ДОПОЛНЕНИЯ ──────────────────────────────────────────────────────

  skirmisher_tactics: {
    name: 'Тактика застрельщиков',
    cat: 'military',
    desc: 'Лёгкие пехотинцы с дротиками и пращами изматывают врага до генерального сражения',
    bonus: { army_strength: 0.03, army_speed: 0.03 },
    mut: [
      { to: 'ambush_tactics', need: { exp_war: 80, mountain: true }, w: 0.7 },
      { to: 'phalanx_tradition', need: { exp_war: 120, exp_civic: 60 }, w: 0.5 },
    ]
  },

  sling_mastery: {
    name: 'Мастерство пращи',
    cat: 'military',
    desc: 'Свинцовые пули пращников бьют точнее стрел на средней дистанции',
    bonus: { army_strength: 0.04, army_upkeep: -0.02 },
    mut: [
      { to: 'skirmisher_tactics', need: { exp_war: 60 }, w: 0.7 },
    ]
  },

  // ── СОЦИАЛЬНЫЕ ДОПОЛНЕНИЯ ───────────────────────────────────────────────────

  agora_culture: {
    name: 'Культура агоры',
    cat: 'social',
    desc: 'Площадь — центр жизни. Здесь торгуют, спорят, судят и решают судьбы',
    bonus: { trade_income: 0.03, happiness: 2, stability: 0.02 },
    mut: [
      { to: 'democratic_assembly', need: { exp_civic: 80, exp_culture: 40 }, w: 0.7 },
      { to: 'market_traders', need: { exp_trade: 60 }, w: 0.6 },
    ]
  },

  symposium_tradition: {
    name: 'Традиция симпозиума',
    cat: 'social',
    desc: 'Пиры с философскими беседами. Вино, музыка и мудрость текут рекой',
    bonus: { happiness: 2, diplomacy: 2, stability: 0.01 },
    mut: [
      { to: 'philosophical_school', need: { exp_culture: 100 }, w: 0.6 },
      { to: 'vine_tenders', need: { exp_agriculture: 60 }, w: 0.4 },
    ]
  },

  public_baths: {
    name: 'Публичные бани',
    cat: 'social',
    desc: 'Чистота тела — чистота духа. Бани — место для отдыха, сплетен и сделок',
    bonus: { happiness: 2, population_growth: 0.001, trade_income: 0.01 },
    mut: [
      { to: 'medical_knowledge', need: { exp_culture: 80 }, w: 0.4 },
    ]
  },

  // ── РЕЛИГИОЗНЫЕ ДОПОЛНЕНИЯ ──────────────────────────────────────────────────

  chthonic_rites: {
    name: 'Хтонические обряды',
    cat: 'religious',
    desc: 'Подземные боги требуют почтения. Ночные ритуалы у трещин в земле',
    bonus: { military_morale: 0.03, food_production: 0.02, happiness: -1 },
    mut: [
      { to: 'death_cults', need: { exp_religion: 80, exp_suffering: 40 }, w: 0.6 },
      { to: 'fertility_cults', need: { exp_religion: 60, exp_agriculture: 60 }, w: 0.5 },
    ]
  },

  asceticism: {
    name: 'Аскетизм',
    cat: 'religious',
    desc: 'Отказ от роскоши ради духовной чистоты. Тело — тюрьма души',
    bonus: { army_discipline: 0.04, army_upkeep: -0.03, trade_income: -0.03 },
    mut: [
      { to: 'fundamentalism', need: { exp_religion: 120 }, w: 0.5 },
      { to: 'iron_discipline', need: { exp_war: 100 }, w: 0.4 },
    ]
  },

  // ── НАВИГАЦИОННЫЕ ДОПОЛНЕНИЯ ────────────────────────────────────────────────

  pearl_divers: {
    name: 'Ныряльщики за жемчугом',
    cat: 'naval',
    desc: 'Молодые ныряльщики достают сокровища со дна. Рискованно, но красиво',
    bonus: { trade_income: 0.04, naval_strength: 0.01 },
    mut: [
      { to: 'deep_sea_fishing', need: { exp_naval: 60 }, w: 0.6 },
    ]
  },

  tide_readers: {
    name: 'Чтение приливов',
    cat: 'naval',
    desc: 'Луна командует водой. Рыбаки знают, когда выходить и когда оставаться',
    bonus: { food_production: 0.03, naval_strength: 0.02 },
    mut: [
      { to: 'navigator_tradition', need: { exp_naval: 80 }, w: 0.5 },
      { to: 'astronomical_knowledge', need: { exp_culture: 60 }, w: 0.4 },
    ]
  },

  // ── ДИПЛОМАТИЧЕСКИЕ ДОПОЛНЕНИЯ ──────────────────────────────────────────────

  sacred_truce: {
    name: 'Священное перемирие',
    cat: 'diplomatic',
    desc: 'На время праздников и игр война прекращается. Даже враги соблюдают правило',
    bonus: { diplomacy: 4, happiness: 1, stability: 0.02 },
    mut: [
      { to: 'treaty_keepers', need: { exp_diplomacy: 80 }, w: 0.6 },
      { to: 'athletic_games', need: { exp_culture: 60 }, w: 0.5 },
    ]
  },

  ransoming_prisoners: {
    name: 'Выкуп пленников',
    cat: 'diplomatic',
    desc: 'Пленных не убивают — продают обратно. Война — бизнес, а не резня',
    bonus: { diplomacy: 3, tax_income: 0.02, military_morale: -0.01 },
    mut: [
      { to: 'mercantile_diplomacy', need: { exp_trade: 60, exp_diplomacy: 40 }, w: 0.5 },
    ]
  },

  foreign_advisors: {
    name: 'Иноземные советники',
    cat: 'diplomatic',
    desc: 'Мудрецы и мастера из других народов приглашены ко двору. Их знания — наша сила',
    bonus: { diplomacy: 3, production_bonus: 0.03, assimilation_speed: 0.03 },
    mut: [
      { to: 'cosmopolitan', need: { exp_diplomacy: 80 }, w: 0.6 },
      { to: 'education_tradition', need: { exp_culture: 60 }, w: 0.5 },
    ]
  },

  // ── ВЫЖИВАНИЕ ДОПОЛНЕНИЯ ────────────────────────────────────────────────────

  salt_preservation: {
    name: 'Засолка и консервация',
    cat: 'survival',
    desc: 'Рыбу солят, мясо вялят, оливки маринуют. Запасы хранятся месяцами',
    bonus: { food_stockpile: 0.08, food_production: 0.02, trade_income: 0.02 },
    mut: [
      { to: 'famine_preparedness', need: { exp_suffering: 40 }, w: 0.6 },
      { to: 'salt_merchants', need: { exp_trade: 60 }, w: 0.5 },
    ]
  },

  ancient_walls: {
    name: 'Древние стены',
    cat: 'survival',
    desc: 'Стены, построенные прадедами, стоят века. Их чинят, но не разрушают',
    bonus: { garrison_defense: 0.06, building_cost: -0.02, stability: 0.02 },
    mut: [
      { to: 'fortification_builders', need: { exp_war: 60 }, w: 0.7 },
      { to: 'fortress_mentality', need: { exp_suffering: 60 }, w: 0.5 },
    ]
  },

  refugee_absorption: {
    name: 'Приём беженцев',
    cat: 'survival',
    desc: 'Беглецы из разрушенных городов находят новый дом. Каждые руки — на вес золота',
    bonus: { population_growth: 0.002, assimilation_speed: 0.04, stability: -0.02 },
    mut: [
      { to: 'cosmopolitan', need: { exp_diplomacy: 60 }, w: 0.6 },
      { to: 'mixed_heritage', need: { exp_suffering: 40 }, w: 0.5 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_EXTRA;
