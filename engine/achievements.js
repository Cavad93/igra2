// ══════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS ENGINE — система достижений Ancient Strategy
//
// Структура данных:
//   GAME_STATE.achievements = {
//     [nationId]: { [achievementId]: { turn: N, name, icon } }
//   }
//
// Публичные функции:
//   checkAchievements(nationId)      — проверяет и разблокирует достижения
//   getAchievements(nationId)        — массив разблокированных { id, name, icon, turn }
//   getAchievementCount(nationId)    — число разблокированных
//   calcGrandeur(nationId)           — индекс величия 0–1000
//   updateGrandeurDisplay()          — обновить отображение в левой панели
// ══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// СПИСОК ДОСТИЖЕНИЙ (50 штук)
// ──────────────────────────────────────────────────────────────

const ACHIEVEMENTS_LIST = [
  // ── ВОЕННЫЕ ────────────────────────────────────────────────
  {
    id: 'first_blood',
    name: 'Первая кровь',
    icon: '⚔️',
    desc: 'Выиграть первую битву.',
    check: (n, gs) => (n._battles_won ?? 0) >= 1,
  },
  {
    id: 'war_machine',
    name: 'Машина войны',
    icon: '⚔️',
    desc: 'Выиграть 10 битв.',
    check: (n, gs) => (n._battles_won ?? 0) >= 10,
  },
  {
    id: 'conqueror',
    name: 'Завоеватель',
    icon: '🗡️',
    desc: 'Выиграть 20 битв.',
    check: (n, gs) => (n._battles_won ?? 0) >= 20,
  },
  {
    id: 'iron_wall',
    name: 'Железная стена',
    icon: '🛡',
    desc: 'Отразить 3 вторжения.',
    check: (n, gs) => (n._invasions_repelled ?? 0) >= 3,
  },
  {
    id: 'warmonger',
    name: 'Поджигатель',
    icon: '🔥',
    desc: 'Объявить 5 войн.',
    check: (n, gs) => (n._wars_declared ?? 0) >= 5,
  },
  {
    id: 'great_fleet',
    name: 'Владыка морей',
    icon: '⛵',
    desc: 'Иметь более 100 кораблей.',
    check: (n, gs) => (n.military?.ships ?? 0) >= 100,
  },
  {
    id: 'cavalry_king',
    name: 'Царь кавалерии',
    icon: '🐴',
    desc: 'Собрать армию из 5000+ кавалерии.',
    check: (n, gs) => (n.military?.cavalry ?? 0) >= 5000,
  },
  {
    id: 'veteran_army',
    name: 'Железный легион',
    icon: '🗡️',
    desc: 'Иметь более 20 000 пехоты.',
    check: (n, gs) => (n.military?.infantry ?? 0) >= 20000,
  },

  // ── ЭКОНОМИЧЕСКИЕ ──────────────────────────────────────────
  {
    id: 'treasurer',
    name: 'Казначей',
    icon: '💰',
    desc: 'Казна достигла 100 000 монет.',
    check: (n, gs) => (n.economy?.treasury ?? 0) >= 100000,
  },
  {
    id: 'bankrupt',
    name: 'Банкрот',
    icon: '💸',
    desc: 'Пережить банкротство.',
    check: (n, gs) => (n._bankruptcies ?? 0) >= 1,
  },
  {
    id: 'silk_road',
    name: 'Торговец',
    icon: '🚢',
    desc: 'Доход от торговли 50 000+ монет в ход.',
    check: (n, gs) => (n.economy?.income_per_turn ?? 0) >= 50000,
  },
  {
    id: 'debt_lord',
    name: 'Должник',
    icon: '📜',
    desc: 'Взять займов на сумму более 50 000 монет.',
    check: (n, gs) => (n._total_loans_taken ?? 0) > 50000,
  },
  {
    id: 'frugal',
    name: 'Скромный',
    icon: '🪙',
    desc: '20 ходов без займов при казне ниже 1000.',
    check: (n, gs) => (n._turns_frugal ?? 0) >= 20,
  },
  {
    id: 'tax_collector',
    name: 'Мытарь',
    icon: '💎',
    desc: 'Казна достигла 500 000 монет.',
    check: (n, gs) => (n.economy?.treasury ?? 0) >= 500000,
  },
  {
    id: 'master_trader',
    name: 'Мастер торговли',
    icon: '🏪',
    desc: 'Доход 100 000+ монет в ход.',
    check: (n, gs) => (n.economy?.income_per_turn ?? 0) >= 100000,
  },
  {
    id: 'debt_free',
    name: 'Без долгов',
    icon: '✅',
    desc: 'Погасить все займы при казне > 50 000.',
    check: (n, gs) => {
      const loans = (gs.loans ?? []).filter(l => l.nation_id === n._id && l.status === 'active');
      return loans.length === 0 && (n.economy?.treasury ?? 0) > 50000 && (n._total_loans_taken ?? 0) > 0;
    },
  },

  // ── ТЕРРИТОРИАЛЬНЫЕ ────────────────────────────────────────
  {
    id: 'hegemon',
    name: 'Гегемон',
    icon: '🌍',
    desc: 'Контролировать 20 и более регионов.',
    check: (n, gs) => (n.regions?.length ?? 0) >= 20,
  },
  {
    id: 'empire_builder',
    name: 'Строитель империи',
    icon: '🏰',
    desc: 'Контролировать 30 и более регионов.',
    check: (n, gs) => (n.regions?.length ?? 0) >= 30,
  },
  {
    id: 'builder',
    name: 'Строитель',
    icon: '🏗',
    desc: 'Построить 20 зданий.',
    check: (n, gs) => (n._buildings_built ?? (n.buildings?.length ?? 0)) >= 20,
  },

  // ── НАСЕЛЕНИЕ / ОБЩЕСТВО ───────────────────────────────────
  {
    id: 'populist',
    name: 'Народный',
    icon: '🌾',
    desc: 'Счастье народа достигло 85%.',
    check: (n, gs) => (n.population?.happiness ?? 0) >= 85,
  },
  {
    id: 'populous',
    name: 'Многолюдный',
    icon: '👥',
    desc: 'Население достигло 1 000 000 человек.',
    check: (n, gs) => (n.population?.total ?? 0) >= 1000000,
  },
  {
    id: 'beloved',
    name: 'Возлюбленный',
    icon: '❤️',
    desc: 'Счастье народа достигло 95%.',
    check: (n, gs) => (n.population?.happiness ?? 0) >= 95,
  },

  // ── УПРАВЛЕНИЕ / ПОЛИТИКА ──────────────────────────────────
  {
    id: 'tyrant',
    name: 'Тиран',
    icon: '👁',
    desc: 'Стабильность < 20, удержать власть более 10 ходов.',
    check: (n, gs) => (n.government?.stability ?? 50) < 20 && (n._turns_in_power ?? 0) > 10,
  },
  {
    id: 'just_ruler',
    name: 'Справедливый',
    icon: '⚖️',
    desc: 'Легитимность выше 90%.',
    check: (n, gs) => (n.government?.legitimacy ?? 0) >= 90,
  },
  {
    id: 'iron_fist',
    name: 'Железный кулак',
    icon: '✊',
    desc: 'Стабильность выше 90%.',
    check: (n, gs) => (n.government?.stability ?? 0) >= 90,
  },
  {
    id: 'reformer',
    name: 'Реформатор',
    icon: '📋',
    desc: 'Принять 5 различных законов.',
    check: (n, gs) => (n._laws_enacted ?? (n.active_laws?.length ?? 0)) >= 5,
  },

  // ── ВРЕМЕННЫЕ ──────────────────────────────────────────────
  {
    id: 'centurion',
    name: 'Ветеран',
    icon: '🏛',
    desc: 'Прожить 100 ходов.',
    check: (n, gs) => (gs.turn ?? 0) >= 100,
  },
  {
    id: 'long_reign',
    name: 'Долгое правление',
    icon: '👑',
    desc: 'Прожить 200 ходов.',
    check: (n, gs) => (gs.turn ?? 0) >= 200,
  },
  {
    id: 'ruler_eternal',
    name: 'Вечный правитель',
    icon: '♾️',
    desc: 'Прожить 300 ходов.',
    check: (n, gs) => (gs.turn ?? 0) >= 300,
  },

  // ── ДИПЛОМАТИЧЕСКИЕ ────────────────────────────────────────
  {
    id: 'peacemaker',
    name: 'Миротворец',
    icon: '🕊',
    desc: '30 ходов без войн.',
    check: (n, gs) => {
      const lastWar = n._last_war_turn ?? 0;
      return (gs.turn ?? 0) - lastWar >= 30 && (gs.turn ?? 0) > 30;
    },
  },
  {
    id: 'diplomat',
    name: 'Дипломат',
    icon: '🤝',
    desc: '3 активных союза одновременно.',
    check: (n, gs) => {
      const nid = _getNationId(n, gs);
      if (!nid) return false;
      const alliances = (gs.diplomacy?.treaties ?? []).filter(
        t => t.status === 'active' &&
             (t.type === 'alliance' || t.type === 'defensive_alliance' || t.type === 'military_alliance') &&
             t.parties.includes(nid)
      );
      return alliances.length >= 3;
    },
  },
  {
    id: 'lone_wolf',
    name: 'Волк-одиночка',
    icon: '🐺',
    desc: '50 ходов без союзников.',
    check: (n, gs) => (n._turns_without_ally ?? 0) >= 50,
  },
  {
    id: 'alliance_network',
    name: 'Паутина союзов',
    icon: '🕸️',
    desc: '5 активных союзов одновременно.',
    check: (n, gs) => {
      const nid = _getNationId(n, gs);
      if (!nid) return false;
      const alliances = (gs.diplomacy?.treaties ?? []).filter(
        t => t.status === 'active' &&
             (t.type === 'alliance' || t.type === 'defensive_alliance' || t.type === 'military_alliance') &&
             t.parties.includes(nid)
      );
      return alliances.length >= 5;
    },
  },
  {
    id: 'pacifist',
    name: 'Голубь мира',
    icon: '☮️',
    desc: '50 ходов без войн, счастье > 70.',
    check: (n, gs) => {
      const lastWar = n._last_war_turn ?? 0;
      return (gs.turn ?? 0) - lastWar >= 50 && (gs.turn ?? 0) > 50 &&
             (n.population?.happiness ?? 0) > 70;
    },
  },

  // ── ОСОБЫЕ ─────────────────────────────────────────────────
  {
    id: 'survivor',
    name: 'Выживший',
    icon: '🌊',
    desc: 'Пережить кризисную веху.',
    check: (n, gs) => (n._crisis_survived ?? 0) >= 1,
  },
  {
    id: 'legend',
    name: 'Легенда',
    icon: '⭐',
    desc: 'Разблокировать 10 достижений.',
    check: (n, gs) => {
      const nid = _getNationId(n, gs);
      return getAchievementCount(nid) >= 10;
    },
  },
  {
    id: 'perfect_ruler',
    name: 'Совершенный правитель',
    icon: '🌟',
    desc: 'Индекс величия достиг 800.',
    check: (n, gs) => {
      const nid = _getNationId(n, gs);
      return calcGrandeur(nid) >= 800;
    },
  },
  {
    id: 'golden_age',
    name: 'Золотой век',
    icon: '☀️',
    desc: 'Доход > 100 000 и счастье > 80 одновременно.',
    check: (n, gs) => (n.economy?.income_per_turn ?? 0) > 100000 &&
                      (n.population?.happiness ?? 0) > 80,
  },
  {
    id: 'stability_master',
    name: 'Столп порядка',
    icon: '🏛️',
    desc: 'Стабильность > 90 на протяжении 10 ходов.',
    check: (n, gs) => (n._turns_high_stability ?? 0) >= 10,
  },
  {
    id: 'comeback',
    name: 'Феникс',
    icon: '🔥',
    desc: 'Восстановить казну с менее 100 до более 10 000.',
    check: (n, gs) => (n._phoenix_comeback ?? false) === true,
  },
  {
    id: 'crisis_veteran',
    name: 'Закалённый кризисами',
    icon: '🛡️',
    desc: 'Пережить 3 различных кризисных вехи.',
    check: (n, gs) => (n._crisis_survived ?? 0) >= 3,
  },
  {
    id: 'humble',
    name: 'Аскет',
    icon: '🌿',
    desc: 'Дожить до хода 50 с казной < 500.',
    check: (n, gs) => (gs.turn ?? 0) >= 50 && (n.economy?.treasury ?? 0) < 500,
  },
  {
    id: 'sea_lord',
    name: 'Повелитель морей',
    icon: '🌊',
    desc: 'Иметь более 200 кораблей.',
    check: (n, gs) => (n.military?.ships ?? 0) >= 200,
  },
  {
    id: 'expansion',
    name: 'Экспансия',
    icon: '📍',
    desc: 'Присоединить 5 новых регионов за одно правление.',
    check: (n, gs) => (n._regions_gained_this_reign ?? 0) >= 5,
  },
  {
    id: 'legacy_keeper',
    name: 'Верен слову',
    icon: '📜',
    desc: 'Выполнить все цели завещания.',
    check: (n, gs) => (n._testament_completed ?? false) === true,
  },
  {
    id: 'man_of_word',
    name: 'Человек слова',
    icon: '🤲',
    desc: 'Соблюдать клятву на протяжении 100 ходов.',
    check: (n, gs) => (n._vow_kept_turns ?? 0) >= 100,
  },
  {
    id: 'economic_giant',
    name: 'Экономический гигант',
    icon: '💹',
    desc: 'Торговый доход > 200 000 монет.',
    check: (n, gs) => (n.economy?.income_per_turn ?? 0) > 200000,
  },
];

// ──────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────

/** Найти ID нации по объекту нации в GAME_STATE */
function _getNationId(nation, gs) {
  for (const [id, n] of Object.entries(gs.nations ?? {})) {
    if (n === nation) return id;
  }
  return null;
}

/** Инициализировать хранилище достижений для нации */
function _ensureAchievements(nationId) {
  if (!GAME_STATE.achievements) GAME_STATE.achievements = {};
  if (!GAME_STATE.achievements[nationId]) GAME_STATE.achievements[nationId] = {};
}

// ──────────────────────────────────────────────────────────────
// ОСНОВНЫЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────

/**
 * Проверить все достижения для нации и разблокировать новые.
 * @param {string} nationId
 */
function checkAchievements(nationId) {
  if (!GAME_STATE || !nationId) return;
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;

  _ensureAchievements(nationId);
  _updateAchievementCounters(nationId, nation);

  const unlocked = GAME_STATE.achievements[nationId];

  for (const achiev of ACHIEVEMENTS_LIST) {
    if (unlocked[achiev.id]) continue; // уже разблокировано

    let passed = false;
    try {
      passed = achiev.check(nation, GAME_STATE);
    } catch (e) {
      // Тихо пропускаем ошибки в check-функциях
    }

    if (passed) {
      unlocked[achiev.id] = {
        turn: GAME_STATE.turn ?? 0,
        name: achiev.name,
        icon: achiev.icon,
        desc: achiev.desc,
      };
      if (typeof addEventLog === 'function') {
        addEventLog(`${achiev.icon} Достижение: «${achiev.name}»!`, 'achievement');
      }
    }
  }
}

/**
 * Обновить вспомогательные счётчики для достижений.
 * Вызывается каждый ход из checkAchievements.
 */
function _updateAchievementCounters(nationId, nation) {
  const gs = GAME_STATE;
  const eco = nation.economy ?? {};
  const mil = nation.military ?? {};
  const gov = nation.government ?? {};
  const pop = nation.population ?? {};

  // Счётчик ходов у власти
  nation._turns_in_power = (nation._turns_in_power ?? 0) + 1;

  // Последний ход войны
  if ((mil.at_war_with?.length ?? 0) > 0) {
    nation._last_war_turn = gs.turn ?? 0;
  }

  // Ходы без союзников
  const hasAlly = (gs.diplomacy?.treaties ?? []).some(
    t => t.status === 'active' &&
         (t.type === 'alliance' || t.type === 'defensive_alliance' || t.type === 'military_alliance') &&
         t.parties.includes(nationId)
  );
  if (!hasAlly) {
    nation._turns_without_ally = (nation._turns_without_ally ?? 0) + 1;
  } else {
    nation._turns_without_ally = 0;
  }

  // Ходы скромности: нет займов + казна < 1000
  const activeLoans = (gs.loans ?? []).filter(
    l => l.nation_id === nationId && l.status === 'active'
  );
  if (activeLoans.length === 0 && (eco.treasury ?? 0) < 1000) {
    nation._turns_frugal = (nation._turns_frugal ?? 0) + 1;
  } else {
    nation._turns_frugal = 0;
  }

  // Ходы высокой стабильности
  if ((gov.stability ?? 0) > 90) {
    nation._turns_high_stability = (nation._turns_high_stability ?? 0) + 1;
  } else {
    nation._turns_high_stability = 0;
  }

  // Феникс: казна упала ниже 100 → запомнить, потом выросла выше 10000
  if ((eco.treasury ?? 0) < 100 && !nation._phoenix_low) {
    nation._phoenix_low = true;
    nation._phoenix_comeback = false;
  }
  if (nation._phoenix_low && (eco.treasury ?? 0) > 10000) {
    nation._phoenix_comeback = true;
  }
}

/**
 * Получить массив разблокированных достижений нации.
 * @param {string} nationId
 * @returns {Array<{id, name, icon, desc, turn}>}
 */
function getAchievements(nationId) {
  if (!GAME_STATE || !nationId) return [];
  _ensureAchievements(nationId);
  return Object.entries(GAME_STATE.achievements[nationId]).map(([id, data]) => ({
    id,
    ...data,
  }));
}

/**
 * Получить число разблокированных достижений.
 * @param {string} nationId
 * @returns {number}
 */
function getAchievementCount(nationId) {
  if (!GAME_STATE || !nationId) return 0;
  _ensureAchievements(nationId);
  return Object.keys(GAME_STATE.achievements[nationId]).length;
}

// ──────────────────────────────────────────────────────────────
// ИНДЕКС ВЕЛИЧИЯ (GRANDEUR)
// ──────────────────────────────────────────────────────────────

/**
 * Рассчитать индекс величия для нации (0–1000).
 * @param {string} nationId
 * @returns {number}
 */
function calcGrandeur(nationId) {
  if (!GAME_STATE || !nationId) return 0;
  const n   = GAME_STATE.nations?.[nationId];
  if (!n) return 0;

  const mil = n.military  ?? {};
  const eco = n.economy   ?? {};
  const gov = n.government ?? {};

  const territory  = Math.min(200, (n.regions?.length ?? 0) * 10);
  const wealth     = Math.min(150, (eco.treasury ?? 0) / 1000);
  const army       = Math.min(100, ((mil.infantry ?? 0) + (mil.cavalry ?? 0) * 3) / 100);
  const happiness  = Math.min(100, n.population?.happiness ?? 0);
  const trade      = Math.min(150, (eco.income_per_turn ?? 0) / 300);
  const stability  = Math.min(100, gov.stability ?? 0);

  const atWar = (mil.at_war_with?.length ?? 0) > 0;
  const allianceCount = atWar ? 0 : (GAME_STATE.diplomacy?.treaties ?? []).filter(
    t => t.status === 'active' &&
         (t.type === 'alliance' || t.type === 'defensive_alliance' || t.type === 'military_alliance') &&
         t.parties.includes(nationId)
  ).length;
  const diplomacy = Math.min(100, allianceCount * 20);

  const legacy = Math.min(100, getAchievementCount(nationId) * 10);

  return Math.round(territory + wealth + army + happiness + trade + stability + diplomacy + legacy);
}

/**
 * Обновить отображение индекса величия в левой панели.
 */
function updateGrandeurDisplay() {
  const nationId = GAME_STATE?.player_nation;
  if (!nationId) return;

  const grandeur = calcGrandeur(nationId);
  const el = document.getElementById('grandeur-value');
  if (el) el.textContent = grandeur;
}
