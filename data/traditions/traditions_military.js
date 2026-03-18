// ============================================================================
//  ВОЕННЫЕ ТРАДИЦИИ (30 шт.)
//  Бонусы: ±2-8% — реалистичные, не ломают баланс
//  mut = мутации: to — целевая традиция, need — условия, w — вес (приоритет)
//  need: exp_{type} — мин. опыт, has/not — наличие/отсутствие традиции,
//        war/peace — состояние, coastal/mountain — наличие типа регионов
// ============================================================================

const TRADITIONS_MILITARY = {

  // ── ПЕХОТНАЯ ВЕТКА ──────────────────────────────────────────────────────────

  tribal_warriors: {
    name: 'Племенные воины',
    cat: 'military',
    desc: 'Каждый мужчина — воин. Сражаются толпой, полагаясь на ярость и числа',
    bonus: { military_morale: 0.05, army_discipline: -0.03 },
    mut: [
      { to: 'citizen_militia', need: { exp_war: 80, exp_civic: 40 }, w: 1.0 },
      { to: 'raider_culture', need: { exp_war: 100, exp_suffering: 30 }, w: 0.8 },
      { to: 'guerrilla_warfare', need: { exp_war: 60, mountain: true }, w: 0.9 },
      { to: 'berserker_fury', need: { exp_war: 120, exp_religion: 40 }, w: 0.6 },
    ]
  },

  citizen_militia: {
    name: 'Гражданское ополчение',
    cat: 'military',
    desc: 'Граждане полиса сами встают на защиту стен. Дешёвая, но мотивированная армия',
    bonus: { army_upkeep: -0.05, garrison_defense: 0.04, army_strength: -0.02 },
    mut: [
      { to: 'phalanx_tradition', need: { exp_war: 120, exp_civic: 60 }, w: 1.0 },
      { to: 'standing_army', need: { exp_war: 150, exp_trade: 80 }, w: 0.7 },
      { to: 'conscription', need: { exp_war: 100, exp_suffering: 60 }, w: 0.5 },
    ]
  },

  phalanx_tradition: {
    name: 'Традиция фаланги',
    cat: 'military',
    desc: 'Тяжёлая пехота в сомкнутом строю. Гоплиты — основа армии',
    bonus: { army_strength: 0.06, army_discipline: 0.04, army_speed: -0.03 },
    mut: [
      { to: 'iron_discipline', need: { exp_war: 200, exp_civic: 80 }, w: 0.8 },
      { to: 'siege_engineers', need: { exp_war: 180, exp_culture: 60 }, w: 0.7 },
      { to: 'combined_arms', need: { exp_war: 200, exp_naval: 60, has: 'marine_infantry' }, w: 0.5 },
    ]
  },

  iron_discipline: {
    name: 'Железная дисциплина',
    cat: 'military',
    desc: 'Армия движется как единый механизм. Суровые наказания за неповиновение',
    bonus: { army_discipline: 0.08, military_morale: 0.03, happiness: -2 },
    mut: [
      { to: 'military_roads', need: { exp_war: 250, exp_trade: 100 }, w: 0.7 },
      { to: 'standing_army', need: { exp_war: 250, exp_trade: 120 }, w: 0.8 },
    ]
  },

  standing_army: {
    name: 'Постоянная армия',
    cat: 'military',
    desc: 'Профессиональные солдаты на жаловании. Всегда готовы, но дорого содержать',
    bonus: { army_strength: 0.05, army_discipline: 0.05, army_upkeep: 0.08 },
    mut: [
      { to: 'military_colonies', need: { exp_war: 200, exp_agriculture: 80 }, w: 0.7 },
      { to: 'veteran_settlers', need: { peace: 120, exp_agriculture: 60 }, w: 0.6 },
    ]
  },

  conscription: {
    name: 'Всеобщий призыв',
    cat: 'military',
    desc: 'В час нужды каждый способный носить оружие встаёт в строй',
    bonus: { army_manpower: 0.15, food_production: -0.04, happiness: -3, population_growth: -0.001 },
    mut: [
      { to: 'citizen_militia', need: { peace: 200, exp_civic: 60 }, w: 0.8 },
      { to: 'standing_army', need: { exp_trade: 120, exp_war: 150 }, w: 0.6 },
    ]
  },

  // ── КОННИЦА И МОБИЛЬНОСТЬ ───────────────────────────────────────────────────

  warrior_aristocracy: {
    name: 'Воинская аристократия',
    cat: 'military',
    desc: 'Знать правит, потому что сражается. Конные аристократы — элита армии',
    bonus: { cavalry_strength: 0.06, legitimacy: 3, army_upkeep: 0.03 },
    mut: [
      { to: 'horse_breeders', need: { exp_agriculture: 80, not: 'mountain_refuge' }, w: 0.9 },
      { to: 'chariot_warfare', need: { exp_war: 100, exp_culture: 60 }, w: 0.5 },
      { to: 'sacred_band', need: { exp_religion: 80, exp_war: 120 }, w: 0.6 },
    ]
  },

  horse_breeders: {
    name: 'Коневоды',
    cat: 'military',
    desc: 'Разведение боевых лошадей стало делом чести. Конница — гордость народа',
    bonus: { cavalry_strength: 0.08, trade_income: 0.03, food_production: -0.02 },
    mut: [
      { to: 'legendary_cavalry', need: { exp_war: 200, cavalry_victories: 5 }, w: 0.7 },
      { to: 'chariot_warfare', need: { exp_culture: 80, exp_war: 100 }, w: 0.4 },
    ]
  },

  legendary_cavalry: {
    name: 'Легендарная конница',
    cat: 'military',
    desc: 'Конные воины наводят ужас. Их слава идёт впереди армии',
    bonus: { cavalry_strength: 0.10, military_morale: 0.04, diplomacy: 3 },
    mut: [
      { to: 'combined_arms', need: { exp_war: 300, has: 'phalanx_tradition' }, w: 0.5 },
    ]
  },

  chariot_warfare: {
    name: 'Колесничное дело',
    cat: 'military',
    desc: 'Боевые колесницы — оружие царей и героев прошлого',
    bonus: { army_strength: 0.04, army_speed: 0.03, army_upkeep: 0.04 },
    mut: [
      { to: 'horse_breeders', need: { exp_war: 120, exp_agriculture: 60 }, w: 0.8 },
    ]
  },

  // ── ОСАДЫ И УКРЕПЛЕНИЯ ──────────────────────────────────────────────────────

  fortification_builders: {
    name: 'Строители крепостей',
    cat: 'military',
    desc: 'Мощные стены — лучшая защита. Народ славится своими укреплениями',
    bonus: { garrison_defense: 0.08, building_cost: -0.04, army_speed: -0.02 },
    mut: [
      { to: 'siege_engineers', need: { exp_war: 150, exp_culture: 80 }, w: 0.9 },
      { to: 'fortress_mentality', need: { exp_suffering: 80, exp_war: 60 }, w: 0.7 },
    ]
  },

  siege_engineers: {
    name: 'Мастера осад',
    cat: 'military',
    desc: 'Тараны, башни, подкопы — методично ломают любые стены',
    bonus: { siege_strength: 0.08, army_strength: 0.02, building_cost: -0.03 },
    mut: [
      { to: 'combined_arms', need: { exp_war: 250, exp_naval: 60 }, w: 0.5 },
    ]
  },

  // ── НЕРЕГУЛЯРНАЯ ВОЙНА ──────────────────────────────────────────────────────

  raider_culture: {
    name: 'Культура набегов',
    cat: 'military',
    desc: 'Быстрые налёты на соседей — способ добыть славу и богатство',
    bonus: { army_speed: 0.06, loot_bonus: 0.08, diplomacy: -5 },
    mut: [
      { to: 'pirate_haven', need: { exp_naval: 80, coastal: true }, w: 0.9 },
      { to: 'mercenary_tradition', need: { exp_war: 150, exp_trade: 60 }, w: 0.7 },
      { to: 'ambush_tactics', need: { exp_war: 100, mountain: true }, w: 0.8 },
    ]
  },

  guerrilla_warfare: {
    name: 'Партизанская война',
    cat: 'military',
    desc: 'Бить и отступать. Горы и леса — лучшие союзники',
    bonus: { garrison_defense: 0.06, army_strength_mountains: 0.10, army_strength: -0.03 },
    mut: [
      { to: 'ambush_tactics', need: { exp_war: 120 }, w: 0.9 },
      { to: 'mountain_warriors', need: { exp_war: 150, mountain: true }, w: 0.8 },
      { to: 'scorched_earth', need: { exp_suffering: 100, exp_war: 80 }, w: 0.6 },
    ]
  },

  ambush_tactics: {
    name: 'Засадная тактика',
    cat: 'military',
    desc: 'Терпение и внезапность. Враг разбит до того, как успел построиться',
    bonus: { army_strength: 0.05, army_surprise: 0.08 },
    mut: [
      { to: 'guerrilla_warfare', need: { exp_suffering: 80, mountain: true }, w: 0.6 },
      { to: 'spy_network', need: { exp_diplomacy: 80 }, w: 0.5 },
    ]
  },

  mountain_warriors: {
    name: 'Горные воины',
    cat: 'military',
    desc: 'Рождённые в горах, они сражаются на склонах как нигде лучше',
    bonus: { army_strength_mountains: 0.12, army_speed_mountains: 0.06, army_strength_plains: -0.04 },
    mut: [
      { to: 'guerrilla_warfare', need: { exp_suffering: 60 }, w: 0.5 },
    ]
  },

  berserker_fury: {
    name: 'Боевая ярость',
    cat: 'military',
    desc: 'Священная ярость в бою. Воины бросаются вперёд без страха смерти',
    bonus: { army_strength: 0.06, military_morale: 0.04, army_discipline: -0.06 },
    mut: [
      { to: 'sacred_band', need: { exp_religion: 100, exp_war: 150 }, w: 0.6 },
      { to: 'iron_discipline', need: { exp_civic: 100, exp_war: 200 }, w: 0.4 },
    ]
  },

  // ── СПЕЦИАЛЬНЫЕ ─────────────────────────────────────────────────────────────

  sacred_band: {
    name: 'Священный отряд',
    cat: 'military',
    desc: 'Элитные воины, связанные клятвой перед богами. Немногочисленны, но непобедимы',
    bonus: { army_strength: 0.06, military_morale: 0.06, army_manpower: -0.05 },
    mut: [
      { to: 'holy_warriors', need: { exp_religion: 120 }, w: 0.7 },
    ]
  },

  mercenary_tradition: {
    name: 'Традиция наёмничества',
    cat: 'military',
    desc: 'Война — это бизнес. Наёмники стекаются под знамёна того, кто платит',
    bonus: { mercenary_cost: -0.08, mercenary_quality: 0.05, army_loyalty: -0.04 },
    mut: [
      { to: 'war_economy', need: { exp_trade: 100, exp_war: 150 }, w: 0.7 },
      { to: 'standing_army', need: { exp_civic: 100, exp_war: 180 }, w: 0.5 },
    ]
  },

  military_colonies: {
    name: 'Военные колонии',
    cat: 'military',
    desc: 'Ветеранам раздают землю на границах. Солдат и пахарь — одно лицо',
    bonus: { garrison_defense: 0.05, food_production: 0.03, assimilation_speed: 0.05 },
    mut: [
      { to: 'veteran_settlers', need: { peace: 200, exp_agriculture: 80 }, w: 0.8 },
    ]
  },

  veteran_settlers: {
    name: 'Ветераны-поселенцы',
    cat: 'military',
    desc: 'Бывшие воины осели на земле, но навыки не забыты',
    bonus: { garrison_defense: 0.04, food_production: 0.04, population_growth: 0.001 },
    mut: [
      { to: 'citizen_militia', need: { exp_war: 60, exp_civic: 40 }, w: 0.7 },
    ]
  },

  scorched_earth: {
    name: 'Выжженная земля',
    cat: 'military',
    desc: 'Если враг придёт — не найдёт ничего, кроме пепла',
    bonus: { garrison_defense: 0.10, food_production: -0.06, happiness: -2 },
    mut: [
      { to: 'resilient_people', need: { peace: 200, exp_agriculture: 60 }, w: 0.8 },
      { to: 'famine_preparedness', need: { exp_suffering: 100 }, w: 0.6 },
    ]
  },

  military_roads: {
    name: 'Военные дороги',
    cat: 'military',
    desc: 'Сеть дорог для быстрой переброски войск. Заодно выгодна торговцам',
    bonus: { army_speed: 0.06, trade_income: 0.04, building_cost: 0.03 },
    mut: [
      { to: 'engineering_tradition', need: { exp_culture: 100 }, w: 0.5 },
    ]
  },

  combined_arms: {
    name: 'Комбинированная тактика',
    cat: 'military',
    desc: 'Пехота, конница, флот и осадные машины действуют как единое целое',
    bonus: { army_strength: 0.05, naval_strength: 0.03, army_discipline: 0.04 },
    mut: []  // вершина ветки
  },

  war_economy: {
    name: 'Военная экономика',
    cat: 'military',
    desc: 'Вся экономика заточена под войну. В мирное время — стагнация',
    bonus: { army_upkeep: -0.06, army_manpower: 0.05, trade_income: -0.05, happiness: -2 },
    mut: [
      { to: 'standing_army', need: { exp_trade: 120, peace: 100 }, w: 0.6 },
      { to: 'mercenary_tradition', need: { exp_trade: 80 }, w: 0.5 },
    ]
  },

  pirate_haven: {
    name: 'Пиратское убежище',
    cat: 'military',
    desc: 'Пираты находят здесь приют и рынок сбыта. Опасно, но прибыльно',
    bonus: { naval_strength: 0.05, loot_bonus: 0.10, trade_income: 0.04, diplomacy: -8 },
    mut: [
      { to: 'sea_raiders', need: { exp_naval: 120, exp_war: 80 }, w: 0.8 },
      { to: 'maritime_trade', need: { exp_trade: 150, peace: 200 }, w: 0.6 },
    ]
  },

  shield_wall: {
    name: 'Стена щитов',
    cat: 'military',
    desc: 'Плотный строй щитов — стена, о которую разбиваются атаки',
    bonus: { garrison_defense: 0.06, army_discipline: 0.03, army_speed: -0.02 },
    mut: [
      { to: 'phalanx_tradition', need: { exp_war: 100, exp_civic: 50 }, w: 0.9 },
      { to: 'fortification_builders', need: { exp_war: 80, exp_suffering: 40 }, w: 0.6 },
    ]
  },

};

// Экспорт
if (typeof module !== 'undefined') module.exports = TRADITIONS_MILITARY;
