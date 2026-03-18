// ============================================================================
//  ДИПЛОМАТИЧЕСКИЕ ТРАДИЦИИ (20 шт.)
//  Отношения, альянсы, шпионаж, внешняя политика
// ============================================================================

const TRADITIONS_DIPLOMATIC = {

  // ── МИРНАЯ ДИПЛОМАТИЯ ───────────────────────────────────────────────────────

  diplomatic_marriages: {
    name: 'Династические браки',
    cat: 'diplomatic',
    desc: 'Дочь тирана — лучший посол. Браки скрепляют союзы крепче договоров',
    bonus: { diplomacy: 5, stability: 0.03 },
    mut: [
      { to: 'treaty_keepers', need: { exp_diplomacy: 80, peace: 100 }, w: 0.8 },
      { to: 'federation_builders', need: { exp_diplomacy: 120, exp_civic: 60 }, w: 0.6 },
    ]
  },

  treaty_keepers: {
    name: 'Верность договорам',
    cat: 'diplomatic',
    desc: 'Данное слово — закон. Нарушить договор — потерять честь',
    bonus: { diplomacy: 6, trade_income: 0.04, stability: 0.02 },
    mut: [
      { to: 'federation_builders', need: { exp_diplomacy: 150, exp_civic: 80 }, w: 0.7 },
      { to: 'maritime_law', need: { exp_naval: 60, exp_diplomacy: 80 }, w: 0.5 },
    ]
  },

  gift_giving: {
    name: 'Дарение подарков',
    cat: 'diplomatic',
    desc: 'Щедрый дар открывает двери и сердца. Золото и пурпур — язык дипломатии',
    bonus: { diplomacy: 6, tax_income: -0.03, happiness: 1 },
    mut: [
      { to: 'diplomatic_marriages', need: { exp_diplomacy: 60 }, w: 0.7 },
      { to: 'tributary_system', need: { exp_war: 60, exp_diplomacy: 40 }, w: 0.5 },
    ]
  },

  proxenia: {
    name: 'Проксения',
    cat: 'diplomatic',
    desc: 'Граждане представляют интересы другого полиса. Сеть гостеприимства и связей',
    bonus: { diplomacy: 5, trade_income: 0.04 },
    mut: [
      { to: 'treaty_keepers', need: { exp_diplomacy: 80 }, w: 0.7 },
      { to: 'interpreter_tradition', need: { exp_diplomacy: 60, exp_culture: 40 }, w: 0.5 },
    ]
  },

  interpreter_tradition: {
    name: 'Традиция толмачей',
    cat: 'diplomatic',
    desc: 'Переводчики знают языки всех народов. Понимание — начало мира',
    bonus: { diplomacy: 4, assimilation_speed: 0.05, trade_income: 0.03 },
    mut: [
      { to: 'bilingual_culture', need: { exp_diplomacy: 80, exp_culture: 40 }, w: 0.8 },
      { to: 'cosmopolitan', need: { exp_diplomacy: 100 }, w: 0.5 },
    ]
  },

  bilingual_culture: {
    name: 'Двуязычная культура',
    cat: 'diplomatic',
    desc: 'Два языка — два мира. Народ свободно говорит и на своём, и на чужом',
    bonus: { assimilation_speed: 0.08, diplomacy: 4, trade_income: 0.03, stability: -0.01 },
    mut: [
      { to: 'cosmopolitan', need: { exp_diplomacy: 100, exp_trade: 60 }, w: 0.6 },
      { to: 'mixed_heritage', need: { exp_suffering: 40 }, w: 0.5 },
    ]
  },

  // ── СОЮЗЫ И КОНТРОЛЬ ────────────────────────────────────────────────────────

  federation_builders: {
    name: 'Создатели федераций',
    cat: 'diplomatic',
    desc: 'Объединить полисы в союз — сила в единстве против общего врага',
    bonus: { diplomacy: 6, stability: 0.03, army_strength: 0.02, tax_income: -0.02 },
    mut: []  // вершина мирной дипломатии
  },

  hostage_tradition: {
    name: 'Традиция заложников',
    cat: 'diplomatic',
    desc: 'Сыновья знати живут при дворе — и гости, и гарантия верности',
    bonus: { diplomacy: 3, stability: 0.03, army_loyalty: 0.03 },
    mut: [
      { to: 'tributary_system', need: { exp_war: 80, exp_diplomacy: 40 }, w: 0.6 },
      { to: 'diplomatic_marriages', need: { exp_diplomacy: 80, peace: 100 }, w: 0.5 },
    ]
  },

  tributary_system: {
    name: 'Система дани',
    cat: 'diplomatic',
    desc: 'Слабые платят сильным. Дань — цена мира',
    bonus: { tax_income: 0.06, diplomacy: -3, army_upkeep: -0.03 },
    mut: [
      { to: 'client_states', need: { exp_diplomacy: 80, exp_war: 60 }, w: 0.7 },
    ]
  },

  client_states: {
    name: 'Клиентские государства',
    cat: 'diplomatic',
    desc: 'Формально независимы, фактически подчинены. Буфер и источник войск',
    bonus: { army_manpower: 0.05, diplomacy: -2, stability: 0.02 },
    mut: [
      { to: 'military_colonies', need: { exp_war: 100, exp_agriculture: 40 }, w: 0.5 },
    ]
  },

  military_alliances: {
    name: 'Военные союзы',
    cat: 'diplomatic',
    desc: 'Симмахия — союз для войны. Вместе сильнее, но и обязательства тяжелее',
    bonus: { army_strength: 0.03, diplomacy: 4, army_upkeep: 0.02 },
    mut: [
      { to: 'federation_builders', need: { exp_diplomacy: 120, exp_civic: 60 }, w: 0.7 },
    ]
  },

  mercantile_diplomacy: {
    name: 'Торговая дипломатия',
    cat: 'diplomatic',
    desc: 'Деньги решают больше мечей. Торговые связи — лучший аргумент за мир',
    bonus: { trade_income: 0.06, diplomacy: 4, military_morale: -0.02 },
    mut: [
      { to: 'free_trade', need: { exp_trade: 120 }, w: 0.6 },
      { to: 'banking_tradition', need: { exp_trade: 180, exp_culture: 60 }, w: 0.4 },
    ]
  },

  // ── ТАЙНАЯ ДИПЛОМАТИЯ ───────────────────────────────────────────────────────

  spy_network: {
    name: 'Шпионская сеть',
    cat: 'diplomatic',
    desc: 'Тайные агенты, подкуп стражи, перехваченные письма. Знание — сила',
    bonus: { army_surprise: 0.06, stability: 0.02, diplomacy: -2, army_upkeep: 0.02 },
    mut: [
      { to: 'oath_breakers', need: { exp_war: 80, exp_diplomacy: 60 }, w: 0.5 },
    ]
  },

  oath_breakers: {
    name: 'Клятвопреступники',
    cat: 'diplomatic',
    desc: 'Договоры — лишь бумага. Предательство — инструмент, когда выгодно',
    bonus: { army_surprise: 0.05, tax_income: 0.03, diplomacy: -8, stability: -0.02 },
    mut: [
      { to: 'spy_network', need: { exp_diplomacy: 80 }, w: 0.5 },
      { to: 'raider_culture', need: { exp_war: 80 }, w: 0.4 },
    ]
  },

  // ── ИЗОЛЯЦИЯ ────────────────────────────────────────────────────────────────

  isolationism: {
    name: 'Изоляционизм',
    cat: 'diplomatic',
    desc: 'Чужие дела — не наши дела. Стены высоки, ворота закрыты',
    bonus: { garrison_defense: 0.06, stability: 0.04, trade_income: -0.06, diplomacy: -6 },
    mut: [
      { to: 'xenophobia', need: { exp_suffering: 40 }, w: 0.5 },
      { to: 'fortress_mentality', need: { exp_war: 60, exp_suffering: 40 }, w: 0.6 },
    ]
  },

  diplomatic_survivors: {
    name: 'Дипломатические выживальщики',
    cat: 'diplomatic',
    desc: 'Маленький народ среди больших. Гибкость, лесть и хитрость — оружие слабых',
    bonus: { diplomacy: 5, stability: 0.02, trade_income: 0.02, army_strength: -0.02 },
    mut: [
      { to: 'interpreter_tradition', need: { exp_diplomacy: 60 }, w: 0.7 },
      { to: 'mercantile_diplomacy', need: { exp_trade: 80 }, w: 0.6 },
      { to: 'treaty_keepers', need: { exp_diplomacy: 100, peace: 150 }, w: 0.5 },
    ]
  },

  mixed_heritage: {
    name: 'Смешанное наследие',
    cat: 'diplomatic',
    desc: 'Потомки разных народов. В жилах течёт кровь завоевателей и завоёванных',
    bonus: { assimilation_speed: 0.08, diplomacy: 3, happiness: 1, stability: -0.02 },
    mut: [
      { to: 'cosmopolitan', need: { exp_diplomacy: 80, exp_trade: 60 }, w: 0.7 },
    ]
  },

};

if (typeof module !== 'undefined') module.exports = TRADITIONS_DIPLOMATIC;
