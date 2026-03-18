// ============================================================================
//  МОРСКИЕ/НАВИГАЦИОННЫЕ ТРАДИЦИИ (22 шт.)
//  Мореходство, флот, прибрежная жизнь
// ============================================================================

const TRADITIONS_NAVAL = {

  // ── ОСНОВЫ МОРЕХОДСТВА ──────────────────────────────────────────────────────

  coastal_dwellers: {
    name: 'Прибрежные жители',
    cat: 'naval',
    desc: 'Море — кормилец и дорога. Жизнь повёрнута лицом к волнам',
    bonus: { food_production: 0.03, naval_strength: 0.02, trade_income: 0.02 },
    mut: [
      { to: 'fishing_fleet', need: { exp_naval: 40, exp_agriculture: 30 }, w: 0.9 },
      { to: 'boat_builders', need: { exp_naval: 60, exp_trade: 30 }, w: 0.8 },
      { to: 'salt_merchants', need: { exp_trade: 40 }, w: 0.5 },
    ]
  },

  fishing_fleet: {
    name: 'Рыболовный флот',
    cat: 'naval',
    desc: 'Десятки лодок выходят на рассвете. Рыба — основа питания',
    bonus: { food_production: 0.06, naval_strength: 0.02 },
    mut: [
      { to: 'deep_sea_fishing', need: { exp_naval: 80 }, w: 0.8 },
      { to: 'boat_builders', need: { exp_naval: 60, exp_trade: 40 }, w: 0.6 },
    ]
  },

  deep_sea_fishing: {
    name: 'Глубоководный промысел',
    cat: 'naval',
    desc: 'Рыбаки уходят далеко от берега, возвращаясь с полными трюмами',
    bonus: { food_production: 0.05, naval_strength: 0.03, trade_income: 0.02 },
    mut: [
      { to: 'navigator_tradition', need: { exp_naval: 120 }, w: 0.7 },
      { to: 'whaling_tradition', need: { exp_naval: 100 }, w: 0.5 },
    ]
  },

  whaling_tradition: {
    name: 'Китобойный промысел',
    cat: 'naval',
    desc: 'Охота на морских гигантов — опасное, но прибыльное дело',
    bonus: { food_production: 0.04, trade_income: 0.04, naval_strength: 0.02 },
    mut: []
  },

  // ── КОРАБЛЕСТРОЕНИЕ ─────────────────────────────────────────────────────────

  boat_builders: {
    name: 'Корабелы',
    cat: 'naval',
    desc: 'Строят суда от рыбачьей лодки до торгового судна. Дерево и смола — их стихия',
    bonus: { naval_strength: 0.04, naval_upkeep: -0.04 },
    mut: [
      { to: 'trireme_builders', need: { exp_naval: 100, exp_war: 40 }, w: 0.9 },
      { to: 'harbor_masters', need: { exp_naval: 80, exp_trade: 60 }, w: 0.7 },
    ]
  },

  trireme_builders: {
    name: 'Строители трирем',
    cat: 'naval',
    desc: 'Триера — вершина кораблестроения. 170 гребцов, бронзовый таран, скорость и мощь',
    bonus: { naval_strength: 0.08, naval_upkeep: -0.03 },
    mut: [
      { to: 'naval_engineers', need: { exp_naval: 180, exp_culture: 60 }, w: 0.8 },
      { to: 'ram_tactics', need: { exp_naval: 120, exp_war: 80 }, w: 0.7 },
    ]
  },

  naval_engineers: {
    name: 'Флотские инженеры',
    cat: 'naval',
    desc: 'Пентеры, гексеры, осадные корабли — инженерный гений на воде',
    bonus: { naval_strength: 0.08, siege_strength: 0.03, naval_upkeep: 0.03 },
    mut: []  // вершина кораблестроения
  },

  // ── ТАКТИКА ─────────────────────────────────────────────────────────────────

  ram_tactics: {
    name: 'Тактика тарана',
    cat: 'naval',
    desc: 'Бронзовый таран на скорости пробивает борт врага. Диэкплус и периплус',
    bonus: { naval_strength: 0.06, naval_morale: 0.03 },
    mut: [
      { to: 'thalassocracy', need: { exp_naval: 200, exp_war: 100 }, w: 0.6 },
      { to: 'fire_ship_tactics', need: { exp_naval: 150, exp_war: 100 }, w: 0.5 },
    ]
  },

  fire_ship_tactics: {
    name: 'Тактика брандеров',
    cat: 'naval',
    desc: 'Горящий корабль посреди вражеского флота — хаос и паника',
    bonus: { naval_strength: 0.05, naval_morale: 0.04 },
    mut: []
  },

  marine_infantry: {
    name: 'Морская пехота',
    cat: 'naval',
    desc: 'Эпибаты — бойцы на палубах. Абордаж — их стихия',
    bonus: { naval_strength: 0.04, army_strength: 0.02 },
    mut: [
      { to: 'amphibious_warfare', need: { exp_naval: 100, exp_war: 80 }, w: 0.8 },
      { to: 'combined_arms', need: { exp_war: 200, exp_naval: 120, has: 'phalanx_tradition' }, w: 0.4 },
    ]
  },

  amphibious_warfare: {
    name: 'Десантная война',
    cat: 'naval',
    desc: 'С корабля — на берег, с берега — в бой. Высадка десанта отработана до мелочей',
    bonus: { army_strength: 0.04, naval_strength: 0.04, army_speed: 0.02 },
    mut: []
  },

  // ── МОРСКАЯ ТОРГОВЛЯ ────────────────────────────────────────────────────────

  navigator_tradition: {
    name: 'Традиция навигации',
    cat: 'naval',
    desc: 'Звёзды, ветра, течения — моряки читают море как книгу',
    bonus: { naval_strength: 0.03, trade_income: 0.05, naval_morale: 0.03 },
    mut: [
      { to: 'thalassocracy', need: { exp_naval: 180, exp_trade: 100 }, w: 0.7 },
      { to: 'colonizer_spirit', need: { exp_naval: 120, exp_diplomacy: 40 }, w: 0.6 },
    ]
  },

  harbor_masters: {
    name: 'Мастера гаваней',
    cat: 'naval',
    desc: 'Порт — ворота города. Причалы, склады, верфи — всё устроено рационально',
    bonus: { trade_income: 0.06, naval_upkeep: -0.03 },
    mut: [
      { to: 'lighthouse_builders', need: { exp_naval: 80, exp_culture: 40 }, w: 0.7 },
      { to: 'maritime_law', need: { exp_naval: 100, exp_civic: 60 }, w: 0.6 },
    ]
  },

  lighthouse_builders: {
    name: 'Строители маяков',
    cat: 'naval',
    desc: 'Огни на башнях указывают путь кораблям. Безопасность привлекает торговцев',
    bonus: { trade_income: 0.04, naval_strength: 0.02, diplomacy: 2 },
    mut: [
      { to: 'engineering_tradition', need: { exp_culture: 80 }, w: 0.5 },
    ]
  },

  maritime_law: {
    name: 'Морское право',
    cat: 'naval',
    desc: 'Закон моря: правила торговли, пиратства, спасения. Порядок на волнах',
    bonus: { trade_income: 0.06, diplomacy: 3, stability: 0.02 },
    mut: [
      { to: 'thalassocracy', need: { exp_naval: 150, exp_trade: 120 }, w: 0.6 },
    ]
  },

  // ── ВЫСШИЕ МОРСКИЕ ТРАДИЦИИ ─────────────────────────────────────────────────

  thalassocracy: {
    name: 'Талассократия',
    cat: 'naval',
    desc: 'Море — наше. Кто владеет морем, владеет миром',
    bonus: { naval_strength: 0.08, trade_income: 0.08, army_strength: -0.03, food_production: -0.02 },
    mut: []  // вершина
  },

  colonizer_spirit: {
    name: 'Дух колонизации',
    cat: 'naval',
    desc: 'За горизонтом — новые земли. Предки основали этот город, мы основаем новый',
    bonus: { population_growth: 0.001, assimilation_speed: 0.06, trade_income: 0.03 },
    mut: [
      { to: 'cultural_export', need: { exp_culture: 100, exp_diplomacy: 60 }, w: 0.6 },
    ]
  },

  sea_raiders: {
    name: 'Морские разбойники',
    cat: 'naval',
    desc: 'Быстрые галеры нападают на торговцев и прибрежные города',
    bonus: { naval_strength: 0.06, loot_bonus: 0.10, diplomacy: -6, trade_income: -0.03 },
    mut: [
      { to: 'pirate_haven', need: { exp_war: 60, exp_trade: 40 }, w: 0.7 },
      { to: 'thalassocracy', need: { exp_naval: 200, exp_trade: 120 }, w: 0.4 },
    ]
  },

  blockade_runners: {
    name: 'Прорыватели блокад',
    cat: 'naval',
    desc: 'Ни одна блокада не абсолютна. Быстрые суда прорываются сквозь кольцо',
    bonus: { trade_income: 0.04, naval_strength: 0.03, food_production: 0.02 },
    mut: [
      { to: 'navigator_tradition', need: { exp_naval: 80, peace: 100 }, w: 0.6 },
    ]
  },

  island_dwellers: {
    name: 'Островитяне',
    cat: 'naval',
    desc: 'Жизнь на острове закаляет. Море — и защита, и тюрьма',
    bonus: { garrison_defense: 0.04, naval_strength: 0.03, food_production: 0.02 },
    mut: [
      { to: 'fishing_fleet', need: { exp_naval: 40 }, w: 0.8 },
      { to: 'coastal_dwellers', need: { exp_trade: 40 }, w: 0.6 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_NAVAL;
