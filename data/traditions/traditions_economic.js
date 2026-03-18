// ============================================================================
//  ЭКОНОМИЧЕСКИЕ ТРАДИЦИИ (28 шт.)
//  Торговля, сельское хозяйство, ремёсла, ресурсодобыча
// ============================================================================

const TRADITIONS_ECONOMIC = {

  // ── СЕЛЬСКОЕ ХОЗЯЙСТВО ─────────────────────────────────────────────────────

  subsistence_farming: {
    name: 'Натуральное хозяйство',
    cat: 'economic',
    desc: 'Каждая семья кормит себя сама. Надёжно, но без излишков',
    bonus: { food_production: 0.04, trade_income: -0.04 },
    mut: [
      { to: 'grain_masters', need: { exp_agriculture: 100 }, w: 1.0 },
      { to: 'pastoral_herders', need: { exp_agriculture: 60, mountain: true }, w: 0.8 },
      { to: 'olive_growers', need: { exp_agriculture: 80, exp_trade: 40 }, w: 0.7 },
    ]
  },

  grain_masters: {
    name: 'Зерновые мастера',
    cat: 'economic',
    desc: 'Поколения опыта в выращивании пшеницы. Сицилия — житница Средиземноморья',
    bonus: { food_production: 0.08, trade_income: 0.03 },
    mut: [
      { to: 'irrigation_experts', need: { exp_agriculture: 150, exp_culture: 40 }, w: 0.9 },
      { to: 'warehouse_builders', need: { exp_agriculture: 120, exp_suffering: 40 }, w: 0.7 },
      { to: 'plantation_system', need: { exp_agriculture: 120, has: 'slave_economy' }, w: 0.6 },
    ]
  },

  olive_growers: {
    name: 'Маслоделы',
    cat: 'economic',
    desc: 'Оливковые рощи — богатство, которое растёт веками',
    bonus: { food_production: 0.03, trade_income: 0.05, happiness: 1 },
    mut: [
      { to: 'vine_tenders', need: { exp_agriculture: 80, exp_trade: 60 }, w: 0.7 },
      { to: 'luxury_production', need: { exp_trade: 120 }, w: 0.6 },
    ]
  },

  vine_tenders: {
    name: 'Виноградари',
    cat: 'economic',
    desc: 'Лоза требует заботы, но вино стоит дороже зерна',
    bonus: { trade_income: 0.06, happiness: 2, food_production: -0.02 },
    mut: [
      { to: 'luxury_production', need: { exp_trade: 100 }, w: 0.8 },
      { to: 'festival_tradition', need: { exp_religion: 60, exp_culture: 60 }, w: 0.5 },
    ]
  },

  pastoral_herders: {
    name: 'Скотоводы',
    cat: 'economic',
    desc: 'Стада коз и овец — мясо, молоко, шерсть. Горные пастбища — основа жизни',
    bonus: { food_production: 0.05, cavalry_strength: 0.03, trade_income: -0.02 },
    mut: [
      { to: 'horse_breeders', need: { exp_war: 80, exp_agriculture: 60 }, w: 0.7 },
      { to: 'seasonal_migration', need: { exp_agriculture: 100, mountain: true }, w: 0.6 },
      { to: 'textile_weavers', need: { exp_agriculture: 80, exp_trade: 60 }, w: 0.5 },
    ]
  },

  irrigation_experts: {
    name: 'Мастера ирригации',
    cat: 'economic',
    desc: 'Каналы и акведуки превращают сухие земли в плодородные поля',
    bonus: { food_production: 0.10, building_cost: 0.03 },
    mut: [
      { to: 'terrace_farming', need: { exp_agriculture: 180, mountain: true }, w: 0.7 },
      { to: 'water_management', need: { exp_culture: 80 }, w: 0.6 },
    ]
  },

  terrace_farming: {
    name: 'Террасное земледелие',
    cat: 'economic',
    desc: 'Склоны гор превращены в ступени полей. Труд огромный, но земля даёт урожай',
    bonus: { food_production: 0.06, food_production_mountains: 0.10 },
    mut: []
  },

  // ── ТОРГОВЛЯ ────────────────────────────────────────────────────────────────

  barter_economy: {
    name: 'Натуральный обмен',
    cat: 'economic',
    desc: 'Зерно на железо, овцу на горшок. Просто и надёжно',
    bonus: { stability: 0.02, trade_income: -0.05 },
    mut: [
      { to: 'market_traders', need: { exp_trade: 60 }, w: 1.0 },
      { to: 'salt_merchants', need: { exp_trade: 40, coastal: true }, w: 0.7 },
    ]
  },

  market_traders: {
    name: 'Рыночные торговцы',
    cat: 'economic',
    desc: 'Агора — сердце города. Где торговля, там и жизнь',
    bonus: { trade_income: 0.06, tax_income: 0.03 },
    mut: [
      { to: 'free_trade', need: { exp_trade: 120, exp_diplomacy: 40 }, w: 0.8 },
      { to: 'trade_monopoly', need: { exp_trade: 120, exp_civic: 80 }, w: 0.6 },
      { to: 'maritime_trade', need: { exp_trade: 100, exp_naval: 60, coastal: true }, w: 0.9 },
      { to: 'coin_minting', need: { exp_trade: 100, exp_culture: 40 }, w: 0.7 },
    ]
  },

  free_trade: {
    name: 'Свободная торговля',
    cat: 'economic',
    desc: 'Низкие пошлины привлекают купцов со всего мира',
    bonus: { trade_income: 0.10, diplomacy: 3, tax_income: -0.03 },
    mut: [
      { to: 'banking_tradition', need: { exp_trade: 200, exp_culture: 80 }, w: 0.7 },
      { to: 'cosmopolitan', need: { exp_diplomacy: 100 }, w: 0.5 },
    ]
  },

  trade_monopoly: {
    name: 'Торговая монополия',
    cat: 'economic',
    desc: 'Государство контролирует ключевые товары. Выгодно казне, невыгодно соседям',
    bonus: { tax_income: 0.08, diplomacy: -4, happiness: -1 },
    mut: [
      { to: 'free_trade', need: { exp_diplomacy: 80, happiness_min: 60 }, w: 0.6 },
      { to: 'tribute_economy', need: { exp_war: 80, exp_trade: 80 }, w: 0.5 },
    ]
  },

  maritime_trade: {
    name: 'Морская торговля',
    cat: 'economic',
    desc: 'Корабли выгоднее ослов. Морские пути — артерии богатства',
    bonus: { trade_income: 0.08, naval_strength: 0.02, food_production: -0.02 },
    mut: [
      { to: 'banking_tradition', need: { exp_trade: 200, exp_culture: 60 }, w: 0.7 },
      { to: 'thalassocracy', need: { exp_naval: 150, exp_trade: 150 }, w: 0.6 },
    ]
  },

  banking_tradition: {
    name: 'Банковское дело',
    cat: 'economic',
    desc: 'Трапезиты дают в долг, меняют валюту, финансируют экспедиции',
    bonus: { tax_income: 0.06, trade_income: 0.05, diplomacy: 3 },
    mut: []  // вершина экономической ветки
  },

  coin_minting: {
    name: 'Чеканка монет',
    cat: 'economic',
    desc: 'Собственная монета — символ власти и удобство для торговли',
    bonus: { trade_income: 0.05, legitimacy: 3, diplomacy: 2 },
    mut: [
      { to: 'banking_tradition', need: { exp_trade: 180, exp_culture: 80 }, w: 0.7 },
    ]
  },

  salt_merchants: {
    name: 'Торговцы солью',
    cat: 'economic',
    desc: 'Соль — белое золото. Без неё не сохранить ни мясо, ни рыбу',
    bonus: { trade_income: 0.05, food_production: 0.03 },
    mut: [
      { to: 'market_traders', need: { exp_trade: 80 }, w: 0.8 },
    ]
  },

  tribute_economy: {
    name: 'Экономика дани',
    cat: 'economic',
    desc: 'Побеждённые платят победителям. Проще отнять, чем произвести',
    bonus: { tax_income: 0.06, diplomacy: -5, happiness: -1, army_upkeep: -0.03 },
    mut: [
      { to: 'trade_monopoly', need: { exp_trade: 100, peace: 150 }, w: 0.6 },
    ]
  },

  // ── РЕМЁСЛА И ПРОИЗВОДСТВО ──────────────────────────────────────────────────

  master_craftsmen: {
    name: 'Мастера-ремесленники',
    cat: 'economic',
    desc: 'Из рук мастеров выходят вещи, которым завидуют соседи',
    bonus: { production_bonus: 0.08, trade_income: 0.03 },
    mut: [
      { to: 'guild_system', need: { exp_trade: 100, exp_civic: 80 }, w: 0.8 },
      { to: 'luxury_production', need: { exp_trade: 120, exp_culture: 60 }, w: 0.7 },
    ]
  },

  metalworking: {
    name: 'Металлообработка',
    cat: 'economic',
    desc: 'Кузнечное дело в крови. Железо и бронза принимают любые формы',
    bonus: { production_bonus: 0.05, army_strength: 0.03, trade_income: 0.02 },
    mut: [
      { to: 'master_craftsmen', need: { exp_trade: 80, exp_culture: 40 }, w: 0.8 },
      { to: 'siege_engineers', need: { exp_war: 120 }, w: 0.5 },
    ]
  },

  textile_weavers: {
    name: 'Ткачи',
    cat: 'economic',
    desc: 'Тонкие ткани ценятся выше грубого полотна',
    bonus: { trade_income: 0.05, happiness: 1 },
    mut: [
      { to: 'luxury_production', need: { exp_trade: 100 }, w: 0.7 },
      { to: 'purple_dye', need: { exp_trade: 120, coastal: true }, w: 0.5 },
    ]
  },

  guild_system: {
    name: 'Цеховая система',
    cat: 'economic',
    desc: 'Ремесленники объединены в гильдии. Качество гарантировано, но конкуренция ограничена',
    bonus: { production_bonus: 0.06, stability: 0.03, happiness: 1 },
    mut: [
      { to: 'market_regulation', need: { exp_civic: 100 }, w: 0.6 },
    ]
  },

  market_regulation: {
    name: 'Рыночное регулирование',
    cat: 'economic',
    desc: 'Агораномы следят за мерами и ценами. Порядок на рынке — порядок в полисе',
    bonus: { stability: 0.04, tax_income: 0.04, trade_income: -0.02 },
    mut: [
      { to: 'free_trade', need: { exp_trade: 120, exp_diplomacy: 60 }, w: 0.5 },
    ]
  },

  luxury_production: {
    name: 'Производство роскоши',
    cat: 'economic',
    desc: 'Ювелиры, парфюмеры, красильщики — мастера дорогих вещей',
    bonus: { trade_income: 0.08, happiness: 2 },
    mut: [
      { to: 'purple_dye', need: { exp_trade: 100, coastal: true }, w: 0.6 },
    ]
  },

  purple_dye: {
    name: 'Пурпурная краска',
    cat: 'economic',
    desc: 'Тирский пурпур — царская краска. Ценнее золота по весу',
    bonus: { trade_income: 0.08, legitimacy: 3, diplomacy: 2 },
    mut: []
  },

  // ── РЕСУРСЫ ─────────────────────────────────────────────────────────────────

  slave_economy: {
    name: 'Рабовладельческая экономика',
    cat: 'economic',
    desc: 'Рабы работают на полях, в рудниках, в мастерских. Выгодно, но опасно',
    bonus: { production_bonus: 0.08, food_production: 0.04, happiness: -3, stability: -0.02 },
    mut: [
      { to: 'plantation_system', need: { exp_agriculture: 120 }, w: 0.7 },
      { to: 'free_labor', need: { exp_suffering: 100, exp_civic: 80 }, w: 0.5 },
    ]
  },

  plantation_system: {
    name: 'Плантационная система',
    cat: 'economic',
    desc: 'Огромные рабские поместья кормят города, но одно восстание может всё сжечь',
    bonus: { food_production: 0.10, trade_income: 0.04, happiness: -4, stability: -0.03 },
    mut: [
      { to: 'free_labor', need: { exp_suffering: 120, exp_civic: 100 }, w: 0.6 },
    ]
  },

  free_labor: {
    name: 'Свободный труд',
    cat: 'economic',
    desc: 'Свободные работники трудятся лучше рабов, хотя и дороже',
    bonus: { happiness: 3, population_growth: 0.001, production_bonus: -0.03 },
    mut: [
      { to: 'guild_system', need: { exp_trade: 80, exp_civic: 60 }, w: 0.7 },
    ]
  },

  mining_tradition: {
    name: 'Горняцкая традиция',
    cat: 'economic',
    desc: 'Рудокопы знают, где искать руду и как её добыть',
    bonus: { production_bonus: 0.05, trade_income: 0.03, population_growth: -0.001 },
    mut: [
      { to: 'metalworking', need: { exp_trade: 60, exp_culture: 40 }, w: 0.9 },
    ]
  },

  warehouse_builders: {
    name: 'Строители складов',
    cat: 'economic',
    desc: 'Запасы зерна на чёрный день. Засуха и блокада не так страшны',
    bonus: { food_stockpile: 0.12, food_production: 0.02 },
    mut: [
      { to: 'famine_preparedness', need: { exp_suffering: 60 }, w: 0.6 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_ECONOMIC;
