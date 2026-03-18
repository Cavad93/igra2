// ============================================================================
//  СОЦИАЛЬНЫЕ ТРАДИЦИИ (27 шт.)
//  Управление, закон, общество, семья
// ============================================================================

const TRADITIONS_SOCIAL = {

  // ── УПРАВЛЕНИЕ ──────────────────────────────────────────────────────────────

  tribal_council: {
    name: 'Племенной совет',
    cat: 'social',
    desc: 'Старейшины собираются и решают дела племени. Медленно, но справедливо',
    bonus: { stability: 0.03, legitimacy: 2, army_speed: -0.02 },
    mut: [
      { to: 'elder_wisdom', need: { exp_civic: 80, peace: 100 }, w: 0.9 },
      { to: 'warrior_kings', need: { exp_war: 100 }, w: 0.7 },
      { to: 'democratic_assembly', need: { exp_civic: 120, exp_culture: 60 }, w: 0.6 },
    ]
  },

  elder_wisdom: {
    name: 'Мудрость старейшин',
    cat: 'social',
    desc: 'Уважение к старшим — основа порядка. Опыт ценнее силы',
    bonus: { stability: 0.04, diplomacy: 3, military_morale: -0.02 },
    mut: [
      { to: 'aristocratic_rule', need: { exp_civic: 100, exp_trade: 60 }, w: 0.8 },
      { to: 'priestly_caste', need: { exp_religion: 100 }, w: 0.5 },
    ]
  },

  warrior_kings: {
    name: 'Цари-воины',
    cat: 'social',
    desc: 'Правит тот, кто сильнейший в бою. Царь — первый среди воинов',
    bonus: { military_morale: 0.05, army_strength: 0.03, stability: -0.02 },
    mut: [
      { to: 'tyrant_tradition', need: { exp_war: 120, exp_civic: 40 }, w: 0.8 },
      { to: 'warrior_aristocracy', need: { exp_war: 100, exp_civic: 60 }, w: 0.7 },
      { to: 'hereditary_monarchy', need: { exp_civic: 100, peace: 150 }, w: 0.6 },
    ]
  },

  tyrant_tradition: {
    name: 'Традиция тирании',
    cat: 'social',
    desc: 'Сильная рука одного человека. Эффективно, но нестабильно после его смерти',
    bonus: { army_strength: 0.04, tax_income: 0.05, happiness: -3, stability: -0.03 },
    mut: [
      { to: 'hereditary_monarchy', need: { exp_civic: 100, peace: 200 }, w: 0.7 },
      { to: 'democratic_assembly', need: { exp_suffering: 80, exp_civic: 80 }, w: 0.5 },
      { to: 'philosopher_rulers', need: { exp_culture: 150 }, w: 0.4 },
    ]
  },

  democratic_assembly: {
    name: 'Народное собрание',
    cat: 'social',
    desc: 'Демос решает. Каждый гражданин имеет голос на экклесии',
    bonus: { happiness: 4, legitimacy: 4, stability: -0.02, army_speed: -0.02 },
    mut: [
      { to: 'written_law', need: { exp_civic: 120, exp_culture: 60 }, w: 0.9 },
      { to: 'rhetorical_tradition', need: { exp_culture: 100 }, w: 0.6 },
      { to: 'tyrant_tradition', need: { exp_war: 120, exp_suffering: 80 }, w: 0.4 },
    ]
  },

  aristocratic_rule: {
    name: 'Аристократическое правление',
    cat: 'social',
    desc: 'Лучшие по рождению и богатству правят остальными',
    bonus: { stability: 0.04, diplomacy: 3, happiness: -2, tax_income: 0.03 },
    mut: [
      { to: 'meritocracy', need: { exp_culture: 120, exp_trade: 80 }, w: 0.6 },
      { to: 'philosopher_rulers', need: { exp_culture: 150 }, w: 0.5 },
      { to: 'patron_client', need: { exp_civic: 100 }, w: 0.7 },
    ]
  },

  hereditary_monarchy: {
    name: 'Наследственное правление',
    cat: 'social',
    desc: 'Власть от отца к сыну. Предсказуемо, если наследник достойный',
    bonus: { stability: 0.05, legitimacy: 4, happiness: -1 },
    mut: [
      { to: 'philosopher_rulers', need: { exp_culture: 150, peace: 200 }, w: 0.4 },
      { to: 'tyrant_tradition', need: { exp_war: 100, exp_suffering: 60 }, w: 0.5 },
    ]
  },

  philosopher_rulers: {
    name: 'Цари-философы',
    cat: 'social',
    desc: 'Мудрость и знание — главные добродетели правителя',
    bonus: { stability: 0.05, happiness: 2, diplomacy: 4, military_morale: -0.02 },
    mut: [
      { to: 'meritocracy', need: { exp_culture: 180, exp_civic: 100 }, w: 0.6 },
    ]
  },

  meritocracy: {
    name: 'Меритократия',
    cat: 'social',
    desc: 'Должности получают способнейшие, а не знатнейшие',
    bonus: { tax_income: 0.04, production_bonus: 0.04, happiness: 2, legitimacy: -2 },
    mut: []  // вершина
  },

  patron_client: {
    name: 'Система патроната',
    cat: 'social',
    desc: 'Патроны покровительствуют клиентам, клиенты служат патронам. Сеть взаимных обязательств',
    bonus: { stability: 0.04, loyalty: 0.04, happiness: -1 },
    mut: [
      { to: 'aristocratic_rule', need: { exp_civic: 80 }, w: 0.5 },
    ]
  },

  // ── ЗАКОН ───────────────────────────────────────────────────────────────────

  written_law: {
    name: 'Писаный закон',
    cat: 'social',
    desc: 'Законы высечены в камне. Все знают свои права и обязанности',
    bonus: { stability: 0.06, tax_income: 0.04, legitimacy: 3 },
    mut: [
      { to: 'market_regulation', need: { exp_trade: 80 }, w: 0.5 },
    ]
  },

  common_law: {
    name: 'Обычное право',
    cat: 'social',
    desc: 'Так было при дедах, так будет и при внуках. Обычай — сильнее указа',
    bonus: { stability: 0.04, happiness: 2, legitimacy: 2 },
    mut: [
      { to: 'written_law', need: { exp_civic: 100, exp_culture: 60 }, w: 0.8 },
      { to: 'blood_feuds', need: { exp_war: 60, exp_suffering: 40 }, w: 0.4 },
    ]
  },

  harsh_justice: {
    name: 'Суровое правосудие',
    cat: 'social',
    desc: 'За кражу — руку, за предательство — жизнь. Страх поддерживает порядок',
    bonus: { stability: 0.05, happiness: -3, army_discipline: 0.03 },
    mut: [
      { to: 'written_law', need: { exp_civic: 100, exp_culture: 60 }, w: 0.7 },
      { to: 'restorative_justice', need: { exp_culture: 120, peace: 200 }, w: 0.4 },
    ]
  },

  restorative_justice: {
    name: 'Примирительное правосудие',
    cat: 'social',
    desc: 'Цель — не наказать, а восстановить мир. Виновный возмещает ущерб',
    bonus: { happiness: 3, population_growth: 0.001, stability: 0.02 },
    mut: []
  },

  blood_feuds: {
    name: 'Кровная месть',
    cat: 'social',
    desc: 'Род за род, кровь за кровь. Обида не забывается поколениями',
    bonus: { military_morale: 0.05, stability: -0.04, diplomacy: -3 },
    mut: [
      { to: 'harsh_justice', need: { exp_civic: 80 }, w: 0.7 },
      { to: 'blood_oath', need: { exp_war: 80, exp_religion: 40 }, w: 0.5 },
    ]
  },

  blood_oath: {
    name: 'Кровная клятва',
    cat: 'social',
    desc: 'Клятва на крови связывает воинов прочнее цепей. Предательство — хуже смерти',
    bonus: { army_loyalty: 0.08, military_morale: 0.04, diplomacy: -4 },
    mut: [
      { to: 'sacred_band', need: { exp_religion: 80, exp_war: 100 }, w: 0.6 },
    ]
  },

  // ── ОБЩЕСТВО И СЕМЬЯ ───────────────────────────────────────────────────────

  clan_loyalty: {
    name: 'Клановая верность',
    cat: 'social',
    desc: 'Клан — семья, государство, армия. Всё в одном',
    bonus: { army_loyalty: 0.06, stability: 0.03, diplomacy: -3 },
    mut: [
      { to: 'tribal_council', need: { exp_civic: 60 }, w: 0.6 },
      { to: 'patron_client', need: { exp_civic: 80, exp_trade: 40 }, w: 0.5 },
      { to: 'xenophobia', need: { exp_suffering: 60 }, w: 0.4 },
    ]
  },

  cosmopolitan: {
    name: 'Космополитизм',
    cat: 'social',
    desc: 'Чужеземцев принимают легко. Город открыт для всех народов и идей',
    bonus: { assimilation_speed: 0.08, trade_income: 0.05, diplomacy: 4 },
    mut: [
      { to: 'bilingual_culture', need: { exp_diplomacy: 80 }, w: 0.7 },
      { to: 'cultural_export', need: { exp_culture: 120 }, w: 0.5 },
    ]
  },

  xenophobia: {
    name: 'Ксенофобия',
    cat: 'social',
    desc: 'Чужакам не место среди нас. Границы на замке, традиции незыблемы',
    bonus: { assimilation_speed: -0.08, army_loyalty: 0.06, trade_income: -0.04, stability: 0.03 },
    mut: [
      { to: 'isolationism', need: { exp_suffering: 60, not: 'free_trade' }, w: 0.7 },
      { to: 'fundamentalism', need: { exp_religion: 100 }, w: 0.5 },
    ]
  },

  social_mobility: {
    name: 'Социальная мобильность',
    cat: 'social',
    desc: 'Горшечник может стать тираном. Талант и удача решают больше рождения',
    bonus: { happiness: 3, population_growth: 0.001, production_bonus: 0.03 },
    mut: [
      { to: 'meritocracy', need: { exp_civic: 120, exp_culture: 80 }, w: 0.7 },
    ]
  },

  caste_system: {
    name: 'Кастовая система',
    cat: 'social',
    desc: 'Каждый рождён для своего дела. Жрецы жрецам, воины воинам, рабы рабам',
    bonus: { stability: 0.04, production_bonus: 0.03, happiness: -3, population_growth: -0.001 },
    mut: [
      { to: 'social_mobility', need: { exp_trade: 100, exp_suffering: 80 }, w: 0.5 },
    ]
  },

  hospitality_laws: {
    name: 'Законы гостеприимства',
    cat: 'social',
    desc: 'Гость священен. Обидеть путника — навлечь гнев богов',
    bonus: { diplomacy: 5, trade_income: 0.03, happiness: 1 },
    mut: [
      { to: 'cosmopolitan', need: { exp_diplomacy: 80, exp_trade: 60 }, w: 0.7 },
      { to: 'sacred_hospitality', need: { exp_religion: 60 }, w: 0.5 },
    ]
  },

  education_tradition: {
    name: 'Традиция образования',
    cat: 'social',
    desc: 'Детей учат читать, считать и рассуждать. Грамотный народ — сильный народ',
    bonus: { production_bonus: 0.04, stability: 0.03, diplomacy: 2 },
    mut: [
      { to: 'philosophical_school', need: { exp_culture: 120 }, w: 0.8 },
      { to: 'rhetorical_tradition', need: { exp_culture: 100, exp_civic: 60 }, w: 0.6 },
    ]
  },

  oral_tradition: {
    name: 'Устная традиция',
    cat: 'social',
    desc: 'Истории передаются из уст в уста. Певцы и сказители хранят память народа',
    bonus: { military_morale: 0.03, stability: 0.03, happiness: 1 },
    mut: [
      { to: 'epic_poetry', need: { exp_culture: 80 }, w: 0.9 },
      { to: 'education_tradition', need: { exp_culture: 100, exp_civic: 40 }, w: 0.6 },
    ]
  },

  veteran_respect: {
    name: 'Почёт ветеранов',
    cat: 'social',
    desc: 'Бывшие воины уважаемы в обществе. Их слово весомо на совете',
    bonus: { military_morale: 0.04, army_loyalty: 0.03, stability: 0.02 },
    mut: [
      { to: 'veteran_settlers', need: { peace: 150, exp_agriculture: 40 }, w: 0.6 },
      { to: 'warrior_aristocracy', need: { exp_war: 100 }, w: 0.5 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_SOCIAL;
