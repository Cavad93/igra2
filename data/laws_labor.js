// ═══════════════════════════════════════════════════════════════════════════
// ТРУДОВОЕ ЗАКОНОДАТЕЛЬСТВО — каталог законов о труде, возрасте и занятости
//
// Законы управляют:
//   • min_work_age              — минимальный возраст начала труда (лет)
//   • child_labor_intensity     — доля детей, вовлечённых в труд (0.0–1.0)
//   • elder_threshold           — возраст перехода в статус «пожилой» (лет)
//   • elder_work_intensity      — доля пожилых, продолжающих работать (0.0–1.0)
//   • women_participation       — доля женщин, участвующих в рыночной экономике
//
// Каждый закон принадлежит одной несовместимой группе (incompatible_with).
// is_default = true → закон применяется при старте и при отмене конкурента.
//
// satisfaction_effects: { classId: delta } — прямое изменение satisfaction классов
//   при активном законе (применяется каждый ход через _labor_law_bonuses).
//   Малые значения: +3/−3 = ощутимо, +8/−8 = значительно.
// ═══════════════════════════════════════════════════════════════════════════

const LAWS_LABOR = {

  // ══════════════════════════════════════════════════════
  // МИНИМАЛЬНЫЙ ВОЗРАСТ ТРУДА
  // ══════════════════════════════════════════════════════

  work_age_8: {
    id:          'work_age_8',
    name:        'Труд с 8 лет',
    icon:        '⚒',
    category:    'labor',
    group:       'min_work_age',
    description: 'Дети от 8 лет обязаны работать наравне со взрослыми. Максимальный трудовой ресурс, но ценой здоровья и будущего детей.',
    effects: {
      labor_laws: { min_work_age: 8, child_labor_intensity: 0.80 },
    },
    // Постоянный бонус/штраф удовлетворённости пока закон активен
    satisfaction_effects: {
      clergy_class: -8,
      citizens:     -5,
      slaves_class: -3,  // дети рабов страдают больше всех
    },
    incompatible_with: ['work_age_10', 'work_age_12', 'work_age_14', 'work_age_16'],
    is_default: false,
  },

  work_age_10: {
    id:          'work_age_10',
    name:        'Труд с 10 лет',
    icon:        '👦',
    category:    'labor',
    group:       'min_work_age',
    description: 'Дети старше 10 лет вовлечены в посильный труд. Мальчики пасут скот, девочки прядут и помогают на кухне.',
    effects: {
      labor_laws: { min_work_age: 10, child_labor_intensity: 0.60 },
    },
    satisfaction_effects: {
      clergy_class: -3,
    },
    incompatible_with: ['work_age_8', 'work_age_12', 'work_age_14', 'work_age_16'],
    is_default: false,
  },

  work_age_12: {
    id:          'work_age_12',
    name:        'Труд с 12 лет',
    icon:        '🧑',
    category:    'labor',
    group:       'min_work_age',
    description: 'Стандарт Античности: с 12 лет юноши начинают обучение ремеслу, земледелию и торговле. Разумный баланс труда и детства.',
    effects: {
      labor_laws: { min_work_age: 12, child_labor_intensity: 0.40 },
    },
    satisfaction_effects: {},
    incompatible_with: ['work_age_8', 'work_age_10', 'work_age_14', 'work_age_16'],
    is_default: true,
  },

  work_age_14: {
    id:          'work_age_14',
    name:        'Труд с 14 лет',
    icon:        '📖',
    category:    'labor',
    group:       'min_work_age',
    description: 'Дети освобождены от труда до 14 лет. Философская традиция: детство — время воспитания и учёбы. Сокращает рабочую силу.',
    effects: {
      labor_laws: { min_work_age: 14, child_labor_intensity: 0.15 },
    },
    satisfaction_effects: {
      clergy_class:   +5,
      citizens:       +3,
      farmers_class:  -3,  // земледельцы лишаются помощников
    },
    incompatible_with: ['work_age_8', 'work_age_10', 'work_age_12', 'work_age_16'],
    is_default: false,
  },

  work_age_16: {
    id:          'work_age_16',
    name:        'Запрет детского труда',
    icon:        '🚫',
    category:    'labor',
    group:       'min_work_age',
    description: 'До 16 лет дети полностью освобождены от труда. Утопический идеал, доступный лишь богатым городам. Серьёзно сокращает рабочую силу.',
    effects: {
      labor_laws: { min_work_age: 16, child_labor_intensity: 0.00 },
    },
    satisfaction_effects: {
      clergy_class:   +10,
      citizens:        +7,
      farmers_class:  -6,
      craftsmen_class: -3,
    },
    incompatible_with: ['work_age_8', 'work_age_10', 'work_age_12', 'work_age_14'],
    is_default: false,
  },

  // ══════════════════════════════════════════════════════
  // ИНТЕНСИВНОСТЬ ДЕТСКОГО ТРУДА (дополнительно к возрасту)
  // ══════════════════════════════════════════════════════

  child_labor_heavy: {
    id:          'child_labor_heavy',
    name:        'Полный детский труд',
    icon:        '⛏',
    category:    'labor',
    group:       'child_intensity',
    description: 'Дети работают в полную силу — поля, шахты, верфи. Максимальная рабочая сила. Высокая детская смертность.',
    effects: {
      labor_laws: { child_labor_intensity: 0.90, child_work_efficiency: 0.42 },
    },
    satisfaction_effects: {
      clergy_class:   -12,
      citizens:        -8,
      slaves_class:    -4,
    },
    incompatible_with: ['child_labor_light', 'child_labor_none'],
    is_default: false,
  },

  child_labor_light: {
    id:          'child_labor_light',
    name:        'Лёгкий детский труд',
    icon:        '🌾',
    category:    'labor',
    group:       'child_intensity',
    description: 'Дети помогают в поле и по дому, но избавлены от тяжёлых работ. Традиционная модель крестьянской семьи.',
    effects: {
      labor_laws: { child_labor_intensity: 0.40 },
    },
    satisfaction_effects: {},
    incompatible_with: ['child_labor_heavy', 'child_labor_none'],
    is_default: true,
  },

  child_labor_none: {
    id:          'child_labor_none',
    name:        'Запрет детского труда',
    icon:        '📚',
    category:    'labor',
    group:       'child_intensity',
    description: 'Дети полностью освобождены от труда — только учёба и воспитание. Идеал Платона. Значительно сокращает рабочую силу.',
    effects: {
      labor_laws: { child_labor_intensity: 0.00 },
    },
    satisfaction_effects: {
      clergy_class:   +15,
      citizens:        +10,
      farmers_class:   -8,
      craftsmen_class: -5,
    },
    incompatible_with: ['child_labor_heavy', 'child_labor_light'],
    is_default: false,
  },

  // ══════════════════════════════════════════════════════
  // ПОРОГ СТАРОСТИ И ТРУД ПОЖИЛЫХ
  // ══════════════════════════════════════════════════════

  elder_45: {
    id:          'elder_45',
    name:        'Старость с 45 лет',
    icon:        '👴',
    category:    'labor',
    group:       'elder_threshold',
    description: 'После 45 лет человек считается стариком. Жёсткая реальность ранней Античности — мало кто доживал до 60 в добром здравии.',
    effects: {
      labor_laws: { elder_threshold: 45, elder_work_intensity: 0.30 },
    },
    satisfaction_effects: {
      farmers_class: -3,
      soldiers_class: -4,  // ветераны теряют статус раньше
    },
    incompatible_with: ['elder_55', 'elder_60'],
    is_default: false,
  },

  elder_55: {
    id:          'elder_55',
    name:        'Старость с 55 лет',
    icon:        '🧓',
    category:    'labor',
    group:       'elder_threshold',
    description: 'После 55 лет граждане отходят от тяжёлого труда, но многие продолжают советовать, торговать и обучать. Античный стандарт.',
    effects: {
      labor_laws: { elder_threshold: 55, elder_work_intensity: 0.50 },
    },
    satisfaction_effects: {},
    incompatible_with: ['elder_45', 'elder_60'],
    is_default: true,
  },

  elder_60: {
    id:          'elder_60',
    name:        'Активная старость до 60',
    icon:        '🏛',
    category:    'labor',
    group:       'elder_threshold',
    description: 'Пожилые граждане остаются активными участниками экономики до 60 лет. Снижает иждивенческую нагрузку.',
    effects: {
      labor_laws: { elder_threshold: 60, elder_work_intensity: 0.65 },
    },
    satisfaction_effects: {
      citizens:  +3,
      merchants: +2,
    },
    incompatible_with: ['elder_45', 'elder_55'],
    is_default: false,
  },

  // ══════════════════════════════════════════════════════
  // ЖЕНСКИЙ ТРУД
  // ══════════════════════════════════════════════════════

  women_domestic: {
    id:          'women_domestic',
    name:        'Женщины в доме',
    icon:        '🏠',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины занимаются исключительно домашним хозяйством: прядение, ткачество, дети. Минимальное участие в рыночной экономике.',
    effects: {
      labor_laws: { women_participation: 0.20 },
    },
    satisfaction_effects: {
      aristocrats:    +3,
      citizens:       -4,
      craftsmen_class: -2,
    },
    incompatible_with: ['women_crafts', 'women_market', 'women_full'],
    is_default: false,
  },

  women_crafts: {
    id:          'women_crafts',
    name:        'Женский труд в ремёслах',
    icon:        '🧵',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины работают в прядении, ткачестве, гончарстве и мелкой торговле. Исторический стандарт греческих полисов.',
    effects: {
      labor_laws: { women_participation: 0.40 },
    },
    satisfaction_effects: {},
    incompatible_with: ['women_domestic', 'women_market', 'women_full'],
    is_default: true,
  },

  women_market: {
    id:          'women_market',
    name:        'Женская торговля',
    icon:        '🏪',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины допускаются к самостоятельной торговле, ведению мастерских и рыночным сделкам. Увеличивает рабочую силу и торговый оборот.',
    effects: {
      labor_laws: { women_participation: 0.60 },
    },
    satisfaction_effects: {
      merchants:       +5,
      citizens:        +3,
      aristocrats:    -3,
      clergy_class:   -2,
    },
    incompatible_with: ['women_domestic', 'women_crafts', 'women_full'],
    is_default: false,
  },

  women_full: {
    id:          'women_full',
    name:        'Равный труд',
    icon:        '⚖',
    category:    'labor',
    group:       'women_labor',
    description: 'Женщины участвуют во всех отраслях экономики наравне с мужчинами. Революционная политика — максимизирует рабочую силу.',
    effects: {
      labor_laws: { women_participation: 0.85 },
    },
    satisfaction_effects: {
      craftsmen_class:  +5,
      citizens:          +7,
      sailors_class:     +3,
      aristocrats:      -8,
      clergy_class:     -5,
    },
    incompatible_with: ['women_domestic', 'women_crafts', 'women_market'],
    is_default: false,
  },
};

// ══════════════════════════════════════════════════════════════
// ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ — стандартная практика греческого полиса ~300 г. до н.э.
// ══════════════════════════════════════════════════════════════

const DEFAULT_LABOR_LAWS = {
  min_work_age:          12,    // лет — стандарт Античности
  child_labor_intensity: 0.40,  // 40% детей вовлечены в посильный труд
  elder_threshold:       55,    // лет — возраст «старости»
  elder_work_intensity:  0.50,  // пожилые работают вполсилы
  women_participation:   0.40,  // 40% женщин в рыночной экономике
  child_work_efficiency: 0.38,  // КПД ребёнка = 38% от взрослого
  elder_work_efficiency: 0.55,  // КПД пожилого = 55% от взрослого
};

// Порядок отображения групп законов в UI
const LABOR_LAW_GROUPS = [
  { id: 'min_work_age',    name: 'Минимальный возраст труда', icon: '👶' },
  { id: 'child_intensity', name: 'Интенсивность детского труда', icon: '⚒' },
  { id: 'elder_threshold', name: 'Порог старости',             icon: '👴' },
  { id: 'women_labor',     name: 'Участие женщин в экономике', icon: '⚖' },
];

// ══════════════════════════════════════════════════════════════
// API: применить / отменить трудовой закон
// ══════════════════════════════════════════════════════════════

function applyLaborLaw(nation, lawId) {
  const law = LAWS_LABOR[lawId];
  if (!law) return { ok: false, reason: 'Закон не найден' };

  // Проверяем несовместимость с уже активными законами
  const activeLawIds = (nation.active_laws || []).map(l => l.id);
  for (const incompId of (law.incompatible_with || [])) {
    if (activeLawIds.includes(incompId)) {
      const incompName = LAWS_LABOR[incompId]?.name || incompId;
      return { ok: false, reason: `Несовместим с активным законом: «${incompName}»` };
    }
  }

  // Инициализируем labor_laws если отсутствует
  if (!nation.labor_laws) nation.labor_laws = { ...DEFAULT_LABOR_LAWS };

  // Применяем изменения к labor_laws
  if (law.effects?.labor_laws) {
    Object.assign(nation.labor_laws, law.effects.labor_laws);
  }

  // Удаляем конкурирующие законы той же группы
  nation.active_laws = (nation.active_laws || []).filter(l =>
    !(law.incompatible_with || []).includes(l.id)
  );

  // Регистрируем закон как активный
  nation.active_laws.push({
    id:           law.id,
    name:         law.name,
    type:         'labor',
    category:     'labor',
    _labor_law:   true,
    _group:       law.group,
  });

  return { ok: true };
}

function repealLaborLaw(nation, lawId) {
  const law = LAWS_LABOR[lawId];
  if (!law) return;

  nation.active_laws = (nation.active_laws || []).filter(l => l.id !== lawId);

  // Восстанавливаем дефолт той же группы
  const defaultLaw = Object.values(LAWS_LABOR).find(l =>
    l.is_default && l.group === law.group && l.id !== lawId
  );
  if (defaultLaw) {
    applyLaborLaw(nation, defaultLaw.id);
  } else if (nation.labor_laws) {
    // Fallback: восстанавливаем DEFAULT_LABOR_LAWS для затронутых полей
    if (law.effects?.labor_laws) {
      for (const key of Object.keys(law.effects.labor_laws)) {
        nation.labor_laws[key] = DEFAULT_LABOR_LAWS[key];
      }
    }
  }
}

// Инициализация трудовых законов — применяет все is_default законы
function initLaborLaws(nation) {
  if (!nation.labor_laws) {
    nation.labor_laws = { ...DEFAULT_LABOR_LAWS };
  }

  const existingGroups = new Set(
    (nation.active_laws || [])
      .filter(l => l._labor_law)
      .map(l => LAWS_LABOR[l.id]?.group)
      .filter(Boolean)
  );

  // Применяем дефолты для групп, которых ещё нет
  for (const law of Object.values(LAWS_LABOR)) {
    if (!law.is_default) continue;
    if (existingGroups.has(law.group)) continue;
    nation.active_laws = nation.active_laws || [];
    if (!nation.active_laws.some(l => l.id === law.id)) {
      nation.active_laws.push({
        id:           law.id,
        name:         law.name,
        type:         'labor',
        category:     'labor',
        _labor_law:   true,
        _group:       law.group,
      });
      if (law.effects?.labor_laws) {
        Object.assign(nation.labor_laws, law.effects.labor_laws);
      }
    }
  }
}
