// ============================================================================
//  КУЛЬТУРНЫЕ / ХУДОЖЕСТВЕННЫЕ ТРАДИЦИИ (22 шт.)
//  Искусство, философия, наука, архитектура
// ============================================================================

const TRADITIONS_ARTS = {

  // ── ЛИТЕРАТУРА И РИТОРИКА ───────────────────────────────────────────────────

  epic_poetry: {
    name: 'Эпическая поэзия',
    cat: 'arts',
    desc: 'Певцы воспевают подвиги героев. Слово крепче бронзы',
    bonus: { military_morale: 0.03, happiness: 2, stability: 0.02 },
    mut: [
      { to: 'theater_tradition', need: { exp_culture: 80, exp_civic: 40 }, w: 0.9 },
      { to: 'historical_chronicles', need: { exp_culture: 100, exp_civic: 60 }, w: 0.7 },
    ]
  },

  theater_tradition: {
    name: 'Театральная традиция',
    cat: 'arts',
    desc: 'Трагедии и комедии на сцене. Дионис благословляет лицедеев',
    bonus: { happiness: 3, diplomacy: 2, stability: 0.02 },
    mut: [
      { to: 'rhetorical_tradition', need: { exp_culture: 120, exp_civic: 60 }, w: 0.8 },
      { to: 'philosophical_school', need: { exp_culture: 150 }, w: 0.6 },
    ]
  },

  rhetorical_tradition: {
    name: 'Риторическая традиция',
    cat: 'arts',
    desc: 'Горгий из Леонтин учил: слово — мощнейшее оружие. Убедить — значит победить',
    bonus: { diplomacy: 5, legitimacy: 3, happiness: 1 },
    mut: [
      { to: 'philosophical_school', need: { exp_culture: 150, exp_civic: 80 }, w: 0.7 },
    ]
  },

  historical_chronicles: {
    name: 'Исторические хроники',
    cat: 'arts',
    desc: 'Прошлое записано и сохранено. Ошибки предков — уроки для потомков',
    bonus: { legitimacy: 3, stability: 0.03, diplomacy: 2 },
    mut: [
      { to: 'education_tradition', need: { exp_culture: 80, exp_civic: 60 }, w: 0.6 },
    ]
  },

  // ── ФИЛОСОФИЯ И НАУКА ───────────────────────────────────────────────────────

  philosophical_school: {
    name: 'Философская школа',
    cat: 'arts',
    desc: 'Академия, Ликей, Стоя — мыслители ищут истину. Разум выше обычая',
    bonus: { stability: 0.04, diplomacy: 4, happiness: 2 },
    mut: [
      { to: 'mathematical_tradition', need: { exp_culture: 150, exp_trade: 40 }, w: 0.7 },
      { to: 'medical_knowledge', need: { exp_culture: 130, exp_religion: 40 }, w: 0.6 },
      { to: 'philosopher_rulers', need: { exp_civic: 120 }, w: 0.5 },
    ]
  },

  mathematical_tradition: {
    name: 'Математическая традиция',
    cat: 'arts',
    desc: 'Архимед из Сиракуз доказал: числа правят миром. Геометрия и механика',
    bonus: { building_cost: -0.05, trade_income: 0.03, naval_strength: 0.02 },
    mut: [
      { to: 'engineering_tradition', need: { exp_culture: 150, exp_war: 40 }, w: 0.8 },
      { to: 'astronomical_knowledge', need: { exp_culture: 130, exp_naval: 40 }, w: 0.6 },
    ]
  },

  astronomical_knowledge: {
    name: 'Астрономические знания',
    cat: 'arts',
    desc: 'Звёзды не лгут. Знание неба помогает в навигации и земледелии',
    bonus: { naval_strength: 0.03, food_production: 0.03, trade_income: 0.02 },
    mut: [
      { to: 'navigator_tradition', need: { exp_naval: 80 }, w: 0.5 },
    ]
  },

  medical_knowledge: {
    name: 'Медицинские знания',
    cat: 'arts',
    desc: 'Врачи лечат раны и болезни. Гиппократова традиция сильна',
    bonus: { population_growth: 0.002, army_strength: 0.02, happiness: 1 },
    mut: [
      { to: 'healing_temples', need: { exp_religion: 60 }, w: 0.4 },
    ]
  },

  engineering_tradition: {
    name: 'Инженерная традиция',
    cat: 'arts',
    desc: 'Акведуки, катапульты, подъёмные краны — инженеры творят чудеса',
    bonus: { building_cost: -0.06, siege_strength: 0.04, garrison_defense: 0.03 },
    mut: []  // вершина научной ветки
  },

  botanical_knowledge: {
    name: 'Ботанические знания',
    cat: 'arts',
    desc: 'Теофраст описал растения. Знание трав помогает и земледельцу, и врачу',
    bonus: { food_production: 0.04, population_growth: 0.001 },
    mut: [
      { to: 'irrigation_experts', need: { exp_agriculture: 100 }, w: 0.5 },
      { to: 'medical_knowledge', need: { exp_culture: 80 }, w: 0.4 },
    ]
  },

  // ── ИЗОБРАЗИТЕЛЬНОЕ ИСКУССТВО ───────────────────────────────────────────────

  monumental_architecture: {
    name: 'Монументальная архитектура',
    cat: 'arts',
    desc: 'Храмы, театры, стадионы — каменная слава народа на века',
    bonus: { legitimacy: 4, happiness: 2, diplomacy: 3, building_cost: 0.04 },
    mut: [
      { to: 'engineering_tradition', need: { exp_culture: 150, exp_war: 40 }, w: 0.6 },
    ]
  },

  sculpture_tradition: {
    name: 'Скульптурная традиция',
    cat: 'arts',
    desc: 'Мрамор и бронза оживают в руках ваятелей. Боги и герои смотрят с постаментов',
    bonus: { happiness: 2, diplomacy: 2, legitimacy: 2 },
    mut: [
      { to: 'monumental_architecture', need: { exp_culture: 100, exp_trade: 60 }, w: 0.7 },
    ]
  },

  mosaic_art: {
    name: 'Мозаичное искусство',
    cat: 'arts',
    desc: 'Полы домов и храмов покрыты узорами из камешков. Сицилийские мозаики славятся',
    bonus: { happiness: 2, trade_income: 0.03, diplomacy: 1 },
    mut: [
      { to: 'luxury_production', need: { exp_trade: 80 }, w: 0.5 },
    ]
  },

  ceramic_art: {
    name: 'Керамическое искусство',
    cat: 'arts',
    desc: 'Вазы с чернофигурной и краснофигурной росписью ценятся по всему миру',
    bonus: { trade_income: 0.04, production_bonus: 0.03, happiness: 1 },
    mut: [
      { to: 'master_craftsmen', need: { exp_trade: 60 }, w: 0.6 },
      { to: 'sculpture_tradition', need: { exp_culture: 80 }, w: 0.5 },
    ]
  },

  fresco_painting: {
    name: 'Фресковая живопись',
    cat: 'arts',
    desc: 'Стены храмов и домов покрыты яркими картинами. Красота повсюду',
    bonus: { happiness: 2, legitimacy: 1, diplomacy: 1 },
    mut: [
      { to: 'monumental_architecture', need: { exp_culture: 100 }, w: 0.5 },
    ]
  },

  // ── МУЗЫКА И СПОРТ ─────────────────────────────────────────────────────────

  music_tradition: {
    name: 'Музыкальная традиция',
    cat: 'arts',
    desc: 'Авлос и кифара звучат на пирах, в храмах и на марше. Музыка — пища души',
    bonus: { happiness: 3, military_morale: 0.02, stability: 0.01 },
    mut: [
      { to: 'festival_tradition', need: { exp_religion: 40, exp_culture: 60 }, w: 0.6 },
      { to: 'theater_tradition', need: { exp_culture: 80 }, w: 0.5 },
    ]
  },

  dance_rituals: {
    name: 'Ритуальные танцы',
    cat: 'arts',
    desc: 'Пиррихий, гипорхема — танцы для богов, для войны, для праздника',
    bonus: { military_morale: 0.02, happiness: 2, stability: 0.02 },
    mut: [
      { to: 'festival_tradition', need: { exp_religion: 60 }, w: 0.6 },
      { to: 'music_tradition', need: { exp_culture: 60 }, w: 0.5 },
    ]
  },

  athletic_games: {
    name: 'Атлетические игры',
    cat: 'arts',
    desc: 'Бег, борьба, метание диска — агоны объединяют эллинов. Победитель — герой',
    bonus: { military_morale: 0.04, happiness: 3, diplomacy: 3, army_strength: 0.01 },
    mut: [
      { to: 'theater_tradition', need: { exp_culture: 80 }, w: 0.5 },
    ]
  },

  storytelling: {
    name: 'Искусство рассказа',
    cat: 'arts',
    desc: 'Вечером у костра звучат истории. Каждый рассказчик добавляет что-то своё',
    bonus: { happiness: 2, stability: 0.02, military_morale: 0.02 },
    mut: [
      { to: 'oral_tradition', need: { exp_culture: 40 }, w: 0.8 },
      { to: 'epic_poetry', need: { exp_culture: 60 }, w: 0.7 },
    ]
  },

  // ── ЭКСПОРТ КУЛЬТУРЫ ───────────────────────────────────────────────────────

  cultural_export: {
    name: 'Культурный экспорт',
    cat: 'arts',
    desc: 'Язык, обычаи, боги — всё распространяется. Эллинизм как образ жизни',
    bonus: { assimilation_speed: 0.10, diplomacy: 4, trade_income: 0.03 },
    mut: []  // вершина
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_ARTS;
