// ============================================================================
//  РЕЛИГИОЗНЫЕ ТРАДИЦИИ (25 шт.)
//  Культы, обряды, духовная жизнь
// ============================================================================

const TRADITIONS_RELIGIOUS = {

  // ── БОГИ И КУЛЬТЫ ───────────────────────────────────────────────────────────

  olympian_devotion: {
    name: 'Олимпийское благочестие',
    cat: 'religious',
    desc: 'Зевс, Афина, Аполлон — боги Олимпа правят миром. Храмы и жертвы — основа благочестия',
    bonus: { legitimacy: 3, happiness: 2, diplomacy: 2 },
    mut: [
      { to: 'temple_builders', need: { exp_religion: 80, exp_trade: 40 }, w: 0.9 },
      { to: 'oracle_tradition', need: { exp_religion: 100, exp_diplomacy: 40 }, w: 0.7 },
      { to: 'mystery_cults', need: { exp_religion: 80, exp_suffering: 40 }, w: 0.6 },
    ]
  },

  ancestor_worship: {
    name: 'Культ предков',
    cat: 'religious',
    desc: 'Духи предков наблюдают и защищают. Их голоса слышны в ветре и огне',
    bonus: { military_morale: 0.04, stability: 0.03 },
    mut: [
      { to: 'sacred_groves', need: { exp_religion: 60, mountain: true }, w: 0.8 },
      { to: 'death_cults', need: { exp_religion: 80, exp_suffering: 60 }, w: 0.5 },
      { to: 'temple_builders', need: { exp_religion: 100, exp_trade: 60 }, w: 0.6 },
    ]
  },

  earth_spirits: {
    name: 'Духи земли',
    cat: 'religious',
    desc: 'Каждая река, гора и роща имеют духа-хранителя. Им нужно поклоняться',
    bonus: { food_production: 0.04, happiness: 1, stability: 0.02 },
    mut: [
      { to: 'sacred_groves', need: { exp_religion: 60 }, w: 0.9 },
      { to: 'earth_mother', need: { exp_religion: 80, exp_agriculture: 60 }, w: 0.7 },
      { to: 'fertility_cults', need: { exp_religion: 60, exp_agriculture: 40 }, w: 0.6 },
    ]
  },

  child_of_tanit: {
    name: 'Дитя Танит',
    cat: 'religious',
    desc: 'Танит и Баал-Хаммон — покровители Карфагена. Жертвы суровы, но боги благосклонны',
    bonus: { military_morale: 0.04, trade_income: 0.03, happiness: -1 },
    mut: [
      { to: 'human_sacrifice', need: { exp_religion: 80, exp_war: 60 }, w: 0.5 },
      { to: 'temple_builders', need: { exp_religion: 100, exp_trade: 80 }, w: 0.7 },
      { to: 'religious_zeal', need: { exp_religion: 120, exp_war: 80 }, w: 0.6 },
    ]
  },

  // ── ХРАМЫ И ЖРЕЦЫ ──────────────────────────────────────────────────────────

  temple_builders: {
    name: 'Строители храмов',
    cat: 'religious',
    desc: 'Величественные храмы возвышаются над городом. Камень славит богов',
    bonus: { legitimacy: 3, happiness: 2, building_cost: 0.03, diplomacy: 2 },
    mut: [
      { to: 'monumental_architecture', need: { exp_culture: 100, exp_religion: 80 }, w: 0.7 },
      { to: 'priestly_caste', need: { exp_religion: 120 }, w: 0.6 },
      { to: 'healing_temples', need: { exp_religion: 100, exp_culture: 60 }, w: 0.5 },
    ]
  },

  priestly_caste: {
    name: 'Жреческая каста',
    cat: 'religious',
    desc: 'Жрецы — отдельное сословие. Знание ритуалов передаётся по наследству',
    bonus: { legitimacy: 4, stability: 0.03, happiness: -1, social_mobility: -0.03 },
    mut: [
      { to: 'religious_zeal', need: { exp_religion: 150, exp_war: 40 }, w: 0.6 },
      { to: 'oracle_tradition', need: { exp_religion: 120, exp_diplomacy: 40 }, w: 0.5 },
    ]
  },

  oracle_tradition: {
    name: 'Традиция оракулов',
    cat: 'religious',
    desc: 'Пифии и прорицатели открывают волю богов. Ни одно решение без гадания',
    bonus: { diplomacy: 4, legitimacy: 3, stability: 0.02 },
    mut: [
      { to: 'mystery_cults', need: { exp_religion: 120, exp_culture: 60 }, w: 0.6 },
    ]
  },

  // ── ОБРЯДЫ ──────────────────────────────────────────────────────────────────

  human_sacrifice: {
    name: 'Человеческие жертвы',
    cat: 'religious',
    desc: 'Самая страшная жертва — самая угодная богам. Кровь льётся на алтарь',
    bonus: { military_morale: 0.06, army_strength: 0.02, diplomacy: -8, happiness: -2 },
    mut: [
      { to: 'animal_sacrifice', need: { exp_culture: 100, exp_diplomacy: 60 }, w: 0.8 },
      { to: 'religious_zeal', need: { exp_religion: 150, exp_war: 100 }, w: 0.5 },
    ]
  },

  animal_sacrifice: {
    name: 'Жертвоприношение животных',
    cat: 'religious',
    desc: 'Быки, овцы и козы — достойная жертва. Дым восходит к небесам',
    bonus: { military_morale: 0.03, happiness: 1, food_production: -0.01 },
    mut: [
      { to: 'festival_tradition', need: { exp_culture: 80, exp_religion: 60 }, w: 0.7 },
      { to: 'temple_builders', need: { exp_religion: 80, exp_trade: 40 }, w: 0.5 },
    ]
  },

  sacred_groves: {
    name: 'Священные рощи',
    cat: 'religious',
    desc: 'В тени древних деревьев обитают боги. Никто не смеет срубить священный дуб',
    bonus: { food_production: 0.03, happiness: 2, stability: 0.02 },
    mut: [
      { to: 'fertility_cults', need: { exp_religion: 60, exp_agriculture: 40 }, w: 0.8 },
      { to: 'earth_mother', need: { exp_religion: 100, exp_agriculture: 80 }, w: 0.6 },
    ]
  },

  mystery_cults: {
    name: 'Мистические культы',
    cat: 'religious',
    desc: 'Элевсинские мистерии, дионисийские обряды — посвящённые знают тайны жизни и смерти',
    bonus: { happiness: 3, stability: 0.02, assimilation_speed: 0.03 },
    mut: [
      { to: 'syncretism', need: { exp_diplomacy: 60, exp_religion: 80 }, w: 0.8 },
      { to: 'healing_temples', need: { exp_religion: 100, exp_culture: 60 }, w: 0.5 },
    ]
  },

  fertility_cults: {
    name: 'Культы плодородия',
    cat: 'religious',
    desc: 'Деметра и Кора благословляют поля. Весенние обряды обещают богатый урожай',
    bonus: { population_growth: 0.002, food_production: 0.04 },
    mut: [
      { to: 'earth_mother', need: { exp_religion: 100, exp_agriculture: 80 }, w: 0.7 },
      { to: 'festival_tradition', need: { exp_culture: 60 }, w: 0.5 },
    ]
  },

  earth_mother: {
    name: 'Культ Матери-Земли',
    cat: 'religious',
    desc: 'Великая Мать даёт и забирает. Земля — живое существо, и её нужно чтить',
    bonus: { food_production: 0.06, population_growth: 0.001, happiness: 2 },
    mut: []
  },

  death_cults: {
    name: 'Культы смерти',
    cat: 'religious',
    desc: 'Мёртвые могущественнее живых. Некрополи — священные города теней',
    bonus: { military_morale: 0.04, garrison_defense: 0.03, happiness: -2 },
    mut: [
      { to: 'ancestor_worship', need: { peace: 150, exp_civic: 40 }, w: 0.6 },
    ]
  },

  healing_temples: {
    name: 'Храмы исцеления',
    cat: 'religious',
    desc: 'Асклепион — место, где боги исцеляют. Больные спят в храме и видят вещие сны',
    bonus: { population_growth: 0.002, happiness: 2 },
    mut: [
      { to: 'medical_knowledge', need: { exp_culture: 100 }, w: 0.7 },
    ]
  },

  festival_tradition: {
    name: 'Традиция фестивалей',
    cat: 'religious',
    desc: 'Дионисии, Панафинеи, Таргелии — праздники скрепляют общество',
    bonus: { happiness: 4, tax_income: -0.02, stability: 0.02, diplomacy: 2 },
    mut: [
      { to: 'athletic_games', need: { exp_culture: 80, exp_war: 40 }, w: 0.7 },
      { to: 'theater_tradition', need: { exp_culture: 100 }, w: 0.6 },
    ]
  },

  // ── ОТНОШЕНИЕ К ЧУЖИМ ВЕРОВАНИЯМ ────────────────────────────────────────────

  religious_tolerance: {
    name: 'Религиозная терпимость',
    cat: 'religious',
    desc: 'Чужие боги — тоже боги. Пусть каждый молится по-своему',
    bonus: { assimilation_speed: 0.06, trade_income: 0.04, diplomacy: 3 },
    mut: [
      { to: 'syncretism', need: { exp_diplomacy: 80, exp_religion: 60 }, w: 0.8 },
      { to: 'cosmopolitan', need: { exp_diplomacy: 100 }, w: 0.5 },
    ]
  },

  religious_zeal: {
    name: 'Религиозное рвение',
    cat: 'religious',
    desc: 'Наши боги — единственные истинные. Нечестивцев ждёт кара',
    bonus: { military_morale: 0.06, stability: 0.03, diplomacy: -5, assimilation_speed: -0.05 },
    mut: [
      { to: 'holy_warriors', need: { exp_war: 100 }, w: 0.7 },
      { to: 'fundamentalism', need: { exp_religion: 180, exp_suffering: 40 }, w: 0.5 },
    ]
  },

  syncretism: {
    name: 'Синкретизм',
    cat: 'religious',
    desc: 'Зевс и Баал — одно лицо? Может быть. Боги едины, имена различны',
    bonus: { assimilation_speed: 0.10, diplomacy: 4, happiness: 1, stability: -0.02 },
    mut: [
      { to: 'religious_tolerance', need: { peace: 150 }, w: 0.6 },
    ]
  },

  fundamentalism: {
    name: 'Фундаментализм',
    cat: 'religious',
    desc: 'Возврат к корням. Древние обряды незыблемы, нововведения — ересь',
    bonus: { stability: 0.05, military_morale: 0.04, assimilation_speed: -0.10, trade_income: -0.04 },
    mut: [
      { to: 'religious_zeal', need: { exp_war: 60 }, w: 0.6 },
    ]
  },

  holy_warriors: {
    name: 'Священные воины',
    cat: 'religious',
    desc: 'Сражаться за богов — высшая честь. Павший в бою попадает прямо на Елисейские поля',
    bonus: { military_morale: 0.08, army_strength: 0.03, army_upkeep: -0.03 },
    mut: [
      { to: 'sacred_band', need: { exp_war: 120 }, w: 0.6 },
    ]
  },

  sea_god_worship: {
    name: 'Культ морского бога',
    cat: 'religious',
    desc: 'Посейдон/Мелькарт владеет морями. Без его милости ни один корабль не доплывёт',
    bonus: { naval_strength: 0.05, trade_income: 0.03, food_production: 0.02 },
    mut: [
      { to: 'navigator_tradition', need: { exp_naval: 100 }, w: 0.6 },
      { to: 'temple_builders', need: { exp_religion: 80 }, w: 0.4 },
    ]
  },

  sacred_hospitality: {
    name: 'Священное гостеприимство',
    cat: 'religious',
    desc: 'Зевс Ксений защищает странников. Отказать гостю — оскорбить богов',
    bonus: { diplomacy: 6, trade_income: 0.03, happiness: 1 },
    mut: [
      { to: 'hospitality_laws', need: { exp_civic: 60 }, w: 0.7 },
      { to: 'cosmopolitan', need: { exp_diplomacy: 100 }, w: 0.5 },
    ]
  },

  war_god_devotion: {
    name: 'Культ бога войны',
    cat: 'religious',
    desc: 'Арес/Баал получает первую добычу. Война — священный ритуал',
    bonus: { army_strength: 0.04, military_morale: 0.04, diplomacy: -3 },
    mut: [
      { to: 'holy_warriors', need: { exp_war: 100, exp_religion: 80 }, w: 0.8 },
      { to: 'berserker_fury', need: { exp_war: 120 }, w: 0.4 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_RELIGIOUS;
