// ============================================================================
//  КУЛЬТУРЫ СИЦИЛИИ ~301 BC
//
//  Каждая культура:
//  - traditions: 8 слотов (id из ALL_TRADITIONS)
//  - locked: корневые традиции (макс. 2), не мутируют
//  - experience: счётчики опыта, растут от событий
//  - last_mutation_turn: ход последней мутации
//  - group: культурная группа (для ассимиляции — близкие группы легче)
// ============================================================================

const CULTURE_GROUPS = {
  hellenic:    { name: 'Эллинская',       assimilation_modifier: 1.0 },
  punic:       { name: 'Пунийская',       assimilation_modifier: 0.8 },
  italic:      { name: 'Италийская',      assimilation_modifier: 0.9 },
  indigenous:  { name: 'Аборигенная',     assimilation_modifier: 1.2 },  // легче ассимилируются
  celtic:      { name: 'Кельтская',       assimilation_modifier: 0.7 },
  egyptian:    { name: 'Египетская',      assimilation_modifier: 0.6 },
  persian:     { name: 'Персидская',      assimilation_modifier: 0.5 },
};

// Близость групп: чем выше — тем легче ассимиляция между группами
const CULTURE_GROUP_AFFINITY = {
  'hellenic-punic':      0.4,  // торговые контакты, но глубокая вражда
  'hellenic-italic':     0.6,  // Великая Греция рядом
  'hellenic-indigenous': 0.7,  // сикелы частично эллинизированы
  'punic-indigenous':    0.5,  // элимы — союзники Карфагена
  'italic-indigenous':   0.5,
  'hellenic-egyptian':   0.5,  // Птолемеи — партнёры
  'hellenic-celtic':     0.3,
  'punic-egyptian':      0.4,
};

// ── Определения культур ───────────────────────────────────────────────────────

const CULTURES = {

  // ══════════════════════════════════════════════════════════════════════════
  //  ГРЕЧЕСКИЕ КУЛЬТУРЫ
  // ══════════════════════════════════════════════════════════════════════════

  greek_sicilian: {
    name: 'Сицилийские греки',
    group: 'hellenic',
    desc: 'Потомки коринфских и мегарских колонистов. Урбанизированная, воинственная, культурная цивилизация',
    traditions: [
      'colonial_heritage',       // locked — колониальное прошлое
      'olympian_devotion',       // locked — вера в олимпийцев
      'phalanx_tradition',       // сильная пехота
      'slave_economy',           // рабский труд
      'theater_tradition',       // театр и искусство
      'maritime_trade',          // морская торговля
      'democratic_assembly',     // народное собрание (хотя Агафокл — тиран)
      'athletic_games',          // атлетические игры
    ],
    locked: ['colonial_heritage', 'olympian_devotion'],
    experience: {
      exp_war: 60, exp_naval: 40, exp_trade: 50, exp_agriculture: 30,
      exp_culture: 70, exp_religion: 40, exp_diplomacy: 30, exp_civic: 50,
      exp_suffering: 20,
    },
    last_mutation_turn: 0,
  },

  greek_colonial: {
    name: 'Колониальные греки',
    group: 'hellenic',
    desc: 'Малые греческие полисы Сицилии — Гела, Акрагас, Тиндарис. Менее воинственны, более торговые',
    traditions: [
      'colonial_heritage',       // locked
      'olympian_devotion',       // locked
      'citizen_militia',         // ополчение вместо профессионалов
      'olive_growers',           // оливки и вино
      'market_traders',          // рыночная торговля
      'festival_tradition',      // праздники
      'common_law',              // обычное право
      'coastal_dwellers',        // прибрежная жизнь
    ],
    locked: ['colonial_heritage', 'olympian_devotion'],
    experience: {
      exp_war: 30, exp_naval: 30, exp_trade: 40, exp_agriculture: 50,
      exp_culture: 40, exp_religion: 35, exp_diplomacy: 25, exp_civic: 30,
      exp_suffering: 30,
    },
    last_mutation_turn: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  ПУНИЙСКАЯ КУЛЬТУРА
  // ══════════════════════════════════════════════════════════════════════════

  punic_sicilian: {
    name: 'Сицилийские пунийцы',
    group: 'punic',
    desc: 'Финикийские колонисты Западной Сицилии. Панорм, Лилибей, Мотия — торговые крепости',
    traditions: [
      'child_of_tanit',          // locked — пунийская религия
      'maritime_trade',          // locked — торговое призвание
      'fortification_builders',  // мощные стены
      'mercenary_tradition',     // наёмники, а не граждане
      'trade_monopoly',          // контроль торговли
      'purple_dye',              // тирский пурпур
      'harbor_masters',          // великие порты
      'hostage_tradition',       // заложники для контроля
    ],
    locked: ['child_of_tanit', 'maritime_trade'],
    experience: {
      exp_war: 40, exp_naval: 60, exp_trade: 70, exp_agriculture: 20,
      exp_culture: 30, exp_religion: 50, exp_diplomacy: 40, exp_civic: 30,
      exp_suffering: 15,
    },
    last_mutation_turn: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  АБОРИГЕННЫЕ КУЛЬТУРЫ
  // ══════════════════════════════════════════════════════════════════════════

  sikel: {
    name: 'Сикелы',
    group: 'indigenous',
    desc: 'Древнейшие жители Восточной Сицилии. Частично эллинизированы, но сохраняют свой уклад',
    traditions: [
      'ancestor_worship',        // locked — культ предков
      'stubborn_independence',   // locked — непокорность
      'tribal_warriors',         // племенные воины
      'subsistence_farming',     // натуральное хозяйство
      'mountain_refuge',         // горные убежища
      'oral_tradition',          // устные предания
      'blood_feuds',             // кровная месть
      'pastoral_herders',        // скотоводство
    ],
    locked: ['ancestor_worship', 'stubborn_independence'],
    experience: {
      exp_war: 40, exp_naval: 5, exp_trade: 10, exp_agriculture: 40,
      exp_culture: 15, exp_religion: 30, exp_diplomacy: 10, exp_civic: 15,
      exp_suffering: 40,
    },
    last_mutation_turn: 0,
  },

  sican: {
    name: 'Сиканы',
    group: 'indigenous',
    desc: 'Древнейшие жители Западной Сицилии. Пастухи и земледельцы горных долин',
    traditions: [
      'earth_spirits',           // locked — духи земли
      'clan_loyalty',            // locked — клановая верность
      'tribal_warriors',         // племенные воины
      'pastoral_herders',        // скотоводство
      'mountain_refuge',         // горы — защита
      'sacred_groves',           // священные рощи
      'seasonal_migration',      // отгонное скотоводство
      'elder_wisdom',            // мудрость старейшин
    ],
    locked: ['earth_spirits', 'clan_loyalty'],
    experience: {
      exp_war: 25, exp_naval: 2, exp_trade: 8, exp_agriculture: 45,
      exp_culture: 10, exp_religion: 35, exp_diplomacy: 8, exp_civic: 10,
      exp_suffering: 35,
    },
    last_mutation_turn: 0,
  },

  elymian: {
    name: 'Элимы',
    group: 'indigenous',
    desc: 'Народ-загадка. Утверждают, что произошли от троянцев. Живут между греками и пунийцами',
    traditions: [
      'trojan_legacy',           // locked — троянское наследие
      'sacred_hospitality',      // locked — священное гостеприимство
      'diplomatic_survivors',    // выживают дипломатией
      'temple_builders',         // храм в Эриксе знаменит
      'bilingual_culture',       // говорят по-гречески и по-своему
      'mountain_refuge',         // Эрикс — горная крепость
      'vine_tenders',            // виноградарство
      'mixed_heritage',          // смешанное наследие
    ],
    locked: ['trojan_legacy', 'sacred_hospitality'],
    experience: {
      exp_war: 20, exp_naval: 10, exp_trade: 25, exp_agriculture: 35,
      exp_culture: 30, exp_religion: 45, exp_diplomacy: 40, exp_civic: 15,
      exp_suffering: 30,
    },
    last_mutation_turn: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  КАРТА: какая культура в каком регионе (по нации-владельцу)
  // ══════════════════════════════════════════════════════════════════════════
  // Определяется в REGION_CULTURES ниже
};

// Привязка культуры к регионам
// primary — основная культура, minorities — список {culture, strength 0..1}
const REGION_CULTURES = {
  // Syracuse territories — Greek Sicilian
  r55:   { primary: 'greek_sicilian', minorities: [] },              // Мессена
  r102:  { primary: 'greek_sicilian', minorities: [] },              // Тавромений
  r245:  { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.10 }] }, // Катания
  r246:  { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.25 }] }, // Кенторипа — сикелы
  r247:  { primary: 'greek_sicilian', minorities: [] },              // Мегара Гиблея
  r248:  { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.05 }] }, // Сиракузы
  r763:  { primary: 'greek_sicilian', minorities: [] },              // побережье
  r2402: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.30 }] }, // Моргантион
  r2403: { primary: 'greek_colonial', minorities: [] },              // Камарина
  r2405: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.15 }] }, // Гиблейские горы
  r2406: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.20 }] }, // Менаи
  r2407: { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.15 }] }, // Акраи
  r2408: { primary: 'greek_sicilian', minorities: [{ culture: 'sikel', strength: 0.08 }] }, // Леонтины

  // Gela — Greek Colonial
  r2404: { primary: 'greek_colonial', minorities: [] },              // Гела

  // Acragas — Greek Colonial
  r2409: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.05 }] }, // Акрагас

  // Herakleia Minoa — mixed
  r2410: { primary: 'greek_colonial', minorities: [{ culture: 'punic_sicilian', strength: 0.20 }] },

  // Selinous — under Punic influence
  r2411: { primary: 'punic_sicilian', minorities: [{ culture: 'greek_colonial', strength: 0.25 }] },

  // Carthaginian territories
  r2412: { primary: 'punic_sicilian', minorities: [] },              // Лилибей
  r2415: { primary: 'punic_sicilian', minorities: [{ culture: 'elymian', strength: 0.10 }] }, // Панорм
  r2416: { primary: 'punic_sicilian', minorities: [{ culture: 'elymian', strength: 0.15 }] }, // Гиккара
  r249:  { primary: 'punic_sicilian', minorities: [] },              // Тирм

  // Elymian territories
  r2413: { primary: 'elymian', minorities: [{ culture: 'punic_sicilian', strength: 0.15 }] }, // Эрикс
  r2414: { primary: 'elymian', minorities: [{ culture: 'greek_colonial', strength: 0.10 }] }, // Эгеста

  // Sicel territories
  r2420: { primary: 'sikel', minorities: [] },                       // Капитий
  r2422: { primary: 'sikel', minorities: [{ culture: 'greek_sicilian', strength: 0.10 }] }, // Энна

  // Sicani territories
  r2423: { primary: 'sican', minorities: [] },                       // Митистрат
  r2424: { primary: 'sican', minorities: [] },                       // Гиппана
  r2425: { primary: 'sican', minorities: [{ culture: 'elymian', strength: 0.10 }] },        // Партанна

  // Calactea — hellenized coast
  r2417: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.20 }] }, // Кефалойдий
  r2418: { primary: 'greek_colonial', minorities: [{ culture: 'sikel', strength: 0.15 }] }, // Кале-Акте

  // Tyndaria
  r2419: { primary: 'greek_colonial', minorities: [] },              // Тиндарис
  r3199: { primary: 'greek_colonial', minorities: [] },              // Липары
};
