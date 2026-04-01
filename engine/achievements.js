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

  const _safe = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const territory  = Math.min(200, _safe(n.regions?.length ?? 0) * 10);
  const wealth     = Math.min(150, _safe(eco.treasury ?? 0) / 1000);
  const army       = Math.min(100, (_safe(mil.infantry ?? 0) + _safe(mil.cavalry ?? 0) * 3) / 100);
  const happiness  = Math.min(100, _safe(n.population?.happiness ?? 0));
  const trade      = Math.min(150, _safe(eco.income_per_turn ?? 0) / 300);
  const stability  = Math.min(100, _safe(gov.stability ?? 0));

  const atWar = (mil.at_war_with?.length ?? 0) > 0;
  const allianceCount = atWar ? 0 : (GAME_STATE.diplomacy?.treaties ?? []).filter(
    t => t.status === 'active' &&
         (t.type === 'alliance' || t.type === 'defensive_alliance' || t.type === 'military_alliance') &&
         t.parties.includes(nationId)
  ).length;
  const diplomacy = Math.min(100, allianceCount * 20);

  const legacy = Math.min(100, getAchievementCount(nationId) * 10);

  const total = territory + wealth + army + happiness + trade + stability + diplomacy + legacy;
  return Math.max(0, Math.min(1000, Math.round(isFinite(total) ? total : 0)));
}

/**
 * Обновить отображение индекса величия в левой панели.
 */
function updateGrandeurDisplay() {
  if (typeof document === 'undefined') return;
  const nationId = GAME_STATE?.player_nation;
  if (!nationId) return;

  const grandeur = calcGrandeur(nationId);
  const el = document.getElementById('grandeur-value');
  if (el) el.textContent = grandeur;
}

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 3 — ЛИЧНЫЙ МАНИФЕСТ
// ══════════════════════════════════════════════════════════════════════

const MANIFEST_PRESETS = [
  { id: 'unify',   icon: '🗺',  text: 'Объединить все регионы острова' },
  { id: 'richest', icon: '💰',  text: 'Стать богатейшей державой Средиземноморья' },
  { id: 'army',    icon: '⚔️', text: 'Создать непобедимую армию' },
  { id: 'peace',   icon: '🕊',  text: 'Прожить 100 ходов без войн' },
  { id: 'custom',  icon: '📜',  text: 'Написать собственную историю' },
];

/**
 * Показать модальное окно «Личный манифест» при первом ходе.
 */
function showManifestModal() {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('manifest-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'manifest-modal';
  modal.className = 'manifest-modal-overlay';
  modal.innerHTML = `
    <div class="manifest-modal">
      <div class="manifest-header">
        <span class="manifest-title">📜 Чего ты хочешь достичь?</span>
        <div class="manifest-subtitle">Выбери цель своего правления — или опиши её сам</div>
      </div>
      <div class="manifest-options">
        ${MANIFEST_PRESETS.filter(p => p.id !== 'custom').map(p => `
          <button class="manifest-option" onclick="selectManifestPreset('${p.id}')">
            <span class="manifest-option-icon">${p.icon}</span>
            <span class="manifest-option-text">«${p.text}»</span>
          </button>
        `).join('')}
        <div class="manifest-custom">
          <span class="manifest-option-icon">📜</span>
          <input type="text" id="manifest-custom-input"
            class="manifest-custom-input"
            placeholder="Написать собственную историю..."
            maxlength="120">
          <button class="manifest-option manifest-custom-btn"
            onclick="selectManifestCustom()">Принять</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function selectManifestPreset(id) {
  const preset = MANIFEST_PRESETS.find(p => p.id === id);
  if (!preset) return;
  _saveManifest(preset.text);
}

function selectManifestCustom() {
  const input = document.getElementById('manifest-custom-input');
  const text = (input?.value ?? '').trim();
  if (!text) return;
  _saveManifest(text);
}

function _saveManifest(text) {
  GAME_STATE.player_manifest = { text, chosen_turn: GAME_STATE.turn ?? 1 };
  const modal = document.getElementById('manifest-modal');
  if (modal) modal.remove();
  if (typeof addEventLog === 'function') {
    addEventLog(`📜 Манифест правления: «${text}»`, 'info');
  }
  _renderManifestInPanel();
}

/**
 * Обновить отображение манифеста в левой панели.
 */
function _renderManifestInPanel() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('manifest-display');
  if (!el) return;
  const text = GAME_STATE.player_manifest?.text ?? '';
  el.textContent = text ? `«${text}»` : '';
  el.style.display = text ? '' : 'none';
}

/**
 * Проверить нужно ли показывать манифест, хроникёр (каждые 25 ходов).
 * Вызывается из checkAchievements.
 */
function _tickManifest(nationId) {
  const gs = GAME_STATE;
  const turn = gs.turn ?? 0;

  // Показать модал при первом ходе
  if (turn === 1 && !gs.player_manifest && typeof document !== 'undefined') {
    showManifestModal();
  }

  // Обновить отображение в панели
  _renderManifestInPanel();

  // Хронист оценивает прогресс каждые 25 ходов
  if (turn > 0 && turn % 25 === 0 && gs.player_manifest?.text && typeof addEventLog === 'function') {
    const n = gs.nations?.[nationId];
    const manifestText = gs.player_manifest.text;
    const grandeur = calcGrandeur(nationId);
    let verdict = '';
    if (grandeur >= 600) verdict = 'Летописец отмечает: величие правителя растёт не по дням.';
    else if (grandeur >= 300) verdict = `Хронист пишет: цель «${manifestText}» всё ещё впереди.`;
    else verdict = `Летописец сомневается: удастся ли достичь «${manifestText}»?`;
    addEventLog(`📖 ${verdict}`, 'info');
  }
}

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 4 — ДИНАМИЧЕСКИЕ ЦЕЛИ-ОРИЕНТИРЫ
// ══════════════════════════════════════════════════════════════════════

/**
 * Генерирует 3 динамических цели исходя из текущего состояния нации.
 * @param {string} nationId
 * @returns {Array<{id, text, progress: ()=>number, completed: ()=>boolean}>}
 */
function generateDynamicGoals(nationId) {
  if (!GAME_STATE) return [];
  const gs = GAME_STATE;
  const n  = gs.nations?.[nationId];
  if (!n) return [];

  const eco = n.economy  ?? {};
  const mil = n.military ?? {};
  const pop = n.population ?? {};
  const treasury = eco.treasury ?? 0;
  const income   = eco.income_per_turn ?? 0;
  const atWar    = (mil.at_war_with?.length ?? 0) > 0;
  const popTotal = pop.total ?? 0;

  const activeLoans = (gs.loans ?? []).filter(
    l => l.nation_id === nationId && l.status === 'active'
  );
  const totalDebt = activeLoans.reduce((s, l) => s + (l.remaining ?? 0), 0);

  const treaties = (gs.diplomacy?.treaties ?? []).filter(
    t => t.status === 'active' &&
         (t.type === 'alliance' || t.type === 'defensive_alliance' || t.type === 'military_alliance') &&
         t.parties.includes(nationId)
  );

  const candidates = [];

  // Казна растёт → накопи 50 000
  if (treasury > 5000 && income > 0) {
    candidates.push({
      id: 'goal_treasury_50k',
      text: 'Накопи 50 000 монет',
      priority: 8,
      progress: () => Math.min(1, treasury / 50000),
      completed: () => treasury >= 50000,
    });
  }

  // Идёт война → захвати столицу врага
  if (atWar) {
    const enemyId = mil.at_war_with?.[0];
    const enemy = gs.nations?.[enemyId];
    const enemyCapital = enemy?.capital_region ?? enemy?.regions?.[0];
    candidates.push({
      id: 'goal_capture_capital',
      text: enemy ? `Захвати столицу ${enemy.name}` : 'Захвати столицу врага',
      priority: 10,
      progress: () => {
        if (!enemyCapital) return 0;
        return (n.regions ?? []).includes(enemyCapital) ? 1 : 0;
      },
      completed: () => {
        if (!enemyCapital) return false;
        return (n.regions ?? []).includes(enemyCapital);
      },
    });
  }

  // Население > 300К → дорасти до 1 миллиона
  if (popTotal > 300000) {
    candidates.push({
      id: 'goal_million_pop',
      text: 'Дорасти до 1 миллиона населения',
      priority: 6,
      progress: () => Math.min(1, popTotal / 1000000),
      completed: () => popTotal >= 1000000,
    });
  }

  // Нет союзов → заключи союз
  if (treaties.length === 0 && !atWar) {
    candidates.push({
      id: 'goal_first_alliance',
      text: 'Заключи союз с соседом',
      priority: 7,
      progress: () => treaties.length > 0 ? 1 : 0,
      completed: () => treaties.length > 0,
    });
  }

  // Высокий долг → погаси займы
  if (totalDebt > 10000) {
    const startDebt = n._goal_start_debt ?? totalDebt;
    if (!n._goal_start_debt) n._goal_start_debt = totalDebt;
    candidates.push({
      id: 'goal_pay_loans',
      text: 'Погаси все займы',
      priority: 9,
      progress: () => activeLoans.length === 0 ? 1 : 1 - (totalDebt / startDebt),
      completed: () => activeLoans.length === 0,
    });
  }

  // Мало регионов → расширь до 15
  if ((n.regions?.length ?? 0) < 15 && (n.regions?.length ?? 0) > 0) {
    const target = Math.min(15, (n.regions?.length ?? 0) + 5);
    candidates.push({
      id: 'goal_expand',
      text: `Расшири владения до ${target} регионов`,
      priority: 5,
      progress: () => Math.min(1, (n.regions?.length ?? 0) / target),
      completed: () => (n.regions?.length ?? 0) >= target,
    });
  }

  // Низкое счастье → улучши до 75
  if ((pop.happiness ?? 50) < 60) {
    candidates.push({
      id: 'goal_happiness',
      text: 'Подними счастье народа до 75%',
      priority: 7,
      progress: () => Math.min(1, (pop.happiness ?? 0) / 75),
      completed: () => (pop.happiness ?? 0) >= 75,
    });
  }

  // Мало кораблей, нация прибрежная
  if ((mil.ships ?? 0) < 10 && (n.regions?.length ?? 0) > 0) {
    candidates.push({
      id: 'goal_fleet',
      text: 'Построй флот из 20 кораблей',
      priority: 4,
      progress: () => Math.min(1, (mil.ships ?? 0) / 20),
      completed: () => (mil.ships ?? 0) >= 20,
    });
  }

  // Сортируем по приоритету, берём топ-3
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.slice(0, 3).map(({ id, text, progress, completed }) => ({
    id, text, progress, completed,
  }));
}

/**
 * Обновить dynamic_goals каждые 10 ходов и обновить UI.
 */
function _tickDynamicGoals(nationId) {
  const turn = GAME_STATE.turn ?? 0;
  if (turn % 10 !== 0 && turn > 1) return;

  if (!GAME_STATE.dynamic_goals) GAME_STATE.dynamic_goals = {};
  // Сохраняем только id/text/cached_progress — функции не сериализуются
  const goals = generateDynamicGoals(nationId);
  GAME_STATE.dynamic_goals[nationId] = goals.map(g => ({
    id:       g.id,
    text:     g.text,
    progress: g.progress(),
    completed: g.completed(),
  }));

  _renderDynamicGoalsInPanel(nationId, goals);
}

/**
 * Отрисовать блок «Цели» в левой панели.
 */
function _renderDynamicGoalsInPanel(nationId, goals) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('dynamic-goals-block');
  if (!el) return;
  if (!goals || goals.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="section-title" style="margin-top:8px">🎯 Цели</div>
    ${goals.map(g => {
      const pct = Math.round(g.progress() * 100);
      const done = g.completed();
      return `
        <div class="dg-goal ${done ? 'dg-done' : ''}">
          <div class="dg-goal-text">${done ? '✅' : '⏳'} ${g.text}</div>
          <div class="dg-bar-wrap">
            <div class="dg-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="dg-pct">${pct}%</div>
        </div>`;
    }).join('')}`;
}

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 5 — ЛИЧНЫЕ КЛЯТВЫ
// ══════════════════════════════════════════════════════════════════════

const VOW_DEFS = [
  {
    id:   'no_first_strike',
    name: 'Не нападать первым',
    icon: '🕊',
    check: (n, gs) => {
      // Нарушение: нация объявила войну на этом ходу (_wars_declared увеличился)
      return (n._wars_declared_this_turn ?? 0) > 0;
    },
  },
  {
    id:   'no_loans',
    name: 'Не брать займов',
    icon: '💳',
    check: (n, gs) => {
      // Нарушение: появился новый активный заём на этом ходу
      return (n._loans_taken_this_turn ?? 0) > 0;
    },
  },
  {
    id:   'no_mercs',
    name: 'Не нанимать наёмников',
    icon: '🗡️',
    check: (n, gs) => (n.military?.mercenaries ?? 0) > 0,
  },
  {
    id:   'no_taxes',
    name: 'Не поднимать налоги выше базовых',
    icon: '📊',
    check: (n, gs) => (n.economy?.tax_rate ?? 0.1) > 0.12,
  },
  {
    id:   'no_slavery',
    name: 'Никогда не использовать рабов',
    icon: '⛓',
    check: (n, gs) => (n.population?.by_profession?.slaves ?? 0) > 0,
  },
];

/**
 * Инициализировать хранилище клятв.
 */
function _ensureVows() {
  if (!GAME_STATE.player_vows) GAME_STATE.player_vows = [];
}

/**
 * Принять клятву (вызывается из UI).
 * @param {string} vowId
 */
function takeVow(vowId) {
  _ensureVows();
  const def = VOW_DEFS.find(v => v.id === vowId);
  if (!def) return;
  if (GAME_STATE.player_vows.find(v => v.id === vowId)) return; // уже дана

  GAME_STATE.player_vows.push({
    id: vowId,
    taken_turn: GAME_STATE.turn ?? 0,
    broken: false,
  });
  if (typeof addEventLog === 'function') {
    addEventLog(`${def.icon} Клятва дана: «${def.name}»`, 'info');
  }
}

/**
 * Проверить нарушения клятв. Вызывать из turn.js каждый ход.
 * @param {string} nationId
 */
function checkVowViolations(nationId) {
  _ensureVows();
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;
  const gs = GAME_STATE;

  for (const vow of GAME_STATE.player_vows) {
    if (vow.broken) continue;
    const def = VOW_DEFS.find(v => v.id === vow.id);
    if (!def) continue;

    let violated = false;
    try { violated = def.check(n, gs); } catch (e) { /* ignore */ }

    if (violated) {
      vow.broken = true;
      if (typeof addEventLog === 'function') {
        addEventLog(`⚠ Клятва нарушена: «${def.name}»`, 'danger');
      }
      if (n.government) {
        n.government.legitimacy = Math.max(0, (n.government.legitimacy ?? 50) - 10);
      }
      if (typeof addMemoryEvent === 'function') {
        addMemoryEvent(nationId, 'politics', 'Клятвопреступник: нарушил клятву «' + def.name + '»');
      }
    }
  }

  // Проверка: все клятвы соблюдались 100+ ходов → достижение
  const activeVows = GAME_STATE.player_vows.filter(v => !v.broken);
  if (activeVows.length > 0) {
    const minTaken = Math.min(...activeVows.map(v => v.taken_turn));
    const keptTurns = (gs.turn ?? 0) - minTaken;
    if (keptTurns >= 100) {
      n._vow_kept_turns = keptTurns;
      if (!gs.achievements?.[nationId]?.['man_of_word']) {
        if (typeof addEventLog === 'function') {
          addEventLog('🤲 Хроника записывает: «Человек слова» — клятвы соблюдались 100 ходов!', 'achievement');
        }
      }
    }
  }
}

/**
 * Рендер панели клятв (для модального окна).
 * @returns {string} HTML
 */
function renderVowsPanel() {
  _ensureVows();
  const active = GAME_STATE.player_vows;

  const allDefs = VOW_DEFS.map(def => {
    const taken = active.find(v => v.id === def.id);
    return { def, taken };
  });

  return `
    <div class="vows-panel">
      <div class="vows-title">⚔️ Клятвы правителя</div>
      <div class="vows-list">
        ${allDefs.map(({ def, taken }) => {
          if (taken) {
            const icon = taken.broken ? '❌' : '✅';
            const status = taken.broken ? 'Нарушена' : `Соблюдается с хода ${taken.taken_turn}`;
            return `<div class="vow-row vow-taken ${taken.broken ? 'vow-broken' : ''}">
              ${icon} ${def.icon} <b>${def.name}</b> — ${status}
            </div>`;
          }
          return `<div class="vow-row vow-available">
            <button class="vow-take-btn" onclick="takeVow('${def.id}');renderVowsModal()">
              ${def.icon} Дать клятву: «${def.name}»
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function showVowsModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('vows-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const content = document.getElementById('vows-modal-content');
  if (content) content.innerHTML = renderVowsPanel();
}

function hideVowsModal() {
  const modal = document.getElementById('vows-modal');
  if (modal) modal.style.display = 'none';
}

function renderVowsModal() {
  const content = document.getElementById('vows-modal-content');
  if (content) content.innerHTML = renderVowsPanel();
}

// ══════════════════════════════════════════════════════════════════════
// СЕССИЯ 6 — ХРОНИКА ПРАВЛЕНИЯ (расширение)
// ══════════════════════════════════════════════════════════════════════

/**
 * Добавить запись в chronicle_log (максимум 50).
 * @param {object} entry
 */
function _addChronicleEntry(entry) {
  if (!GAME_STATE.chronicle_log) GAME_STATE.chronicle_log = [];
  GAME_STATE.chronicle_log.push({ turn: GAME_STATE.turn ?? 0, ...entry });
  if (GAME_STATE.chronicle_log.length > 50) GAME_STATE.chronicle_log.shift();
}

/**
 * Каждые 25 ходов генерировать хроническую запись.
 * @param {string} nationId
 */
function _tickChronicle(nationId) {
  const turn = GAME_STATE.turn ?? 0;
  if (turn === 0 || turn % 25 !== 0) return;

  const n = GAME_STATE.nations?.[nationId];
  if (!n) return;

  const grandeur     = calcGrandeur(nationId);
  const achievements = getAchievements(nationId).map(a => a.name);
  const manifest     = GAME_STATE.player_manifest?.text ?? '';
  const wars         = n._wars_total ?? 0;
  const treasury     = Math.round(n.economy?.treasury ?? 0);

  const entry = {
    grandeur,
    achievements,
    manifest,
    wars,
    treasury,
    text: _buildChronicleText({ grandeur, achievements, manifest, wars, treasury, turn }),
  };
  _addChronicleEntry(entry);

  // Также пробуем ChronicleSystem если доступен
  if (typeof window !== 'undefined' && window.ChronicleSystem?.generate) {
    window.ChronicleSystem.generate(GAME_STATE).catch(() => {});
  }
}

function _buildChronicleText({ grandeur, achievements, manifest, wars, treasury, turn }) {
  const year = Math.abs((GAME_STATE.date?.year ?? -301)) + Math.floor(turn / 12);
  let text = `Год ${year} до н.э. `;

  if (manifest) text += `Правитель стремится: «${manifest}». `;

  if (grandeur >= 600) text += 'Держава процветает — величие достигло небывалых высот. ';
  else if (grandeur >= 300) text += 'Государство стоит твёрдо на ногах. ';
  else text += 'Тяжёлые времена не сломили волю правителя. ';

  if (wars > 5) text += `Войны не утихают — ${wars} кампаний позади. `;
  else if (wars === 0) text += 'Мир царит в землях правителя. ';

  if (achievements.length >= 5) text += `Летопись отмечает ${achievements.length} свершений. `;

  return text.trim();
}

/**
 * Показать модальное окно летописи.
 */
function showChronicleModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('chronicle-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const content = document.getElementById('chronicle-modal-content');
  if (!content) return;

  const entries = (GAME_STATE.chronicle_log ?? []).slice().reverse();
  if (entries.length === 0) {
    content.innerHTML = '<div style="color:var(--text-dim);padding:16px">Летопись пуста. История ещё пишется...</div>';
    return;
  }

  content.innerHTML = entries.map(e => `
    <div class="chronicle-entry">
      <div class="chronicle-turn">Ход ${e.turn}</div>
      <div class="chronicle-text">${e.text ?? ''}</div>
      ${e.achievements?.length ? `<div class="chronicle-achiev">🏆 ${e.achievements.slice(-3).join(', ')}</div>` : ''}
    </div>`).join('');
}

function hideChronicleModal() {
  const modal = document.getElementById('chronicle-modal');
  if (modal) modal.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════════
// ИСТОРИЧЕСКИЙ РЕЙТИНГ (Сессия 9)
// ══════════════════════════════════════════════════════════════════════

/**
 * Сравнить показатели нации с историческими правителями.
 * @param {string} nationId
 * @returns {string[]} массив строк-сравнений
 */
function getHistoricalRating(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  if (!n) return [];

  const treasury   = n.economy?.treasury ?? 0;
  const infantry   = n.military?.infantry ?? 0;
  const cavalry    = n.military?.cavalry ?? 0;
  const armyPower  = infantry + cavalry * 3;
  const legitimacy = n.government?.legitimacy ?? 50;

  const lines = [];

  // Казна
  if (treasury > 80000)      lines.push('💰 Казна: богаче Птолемеев в расцвете');
  else if (treasury > 40000) lines.push('💰 Казна: сравним с Карфагеном при Ганнибале');
  else if (treasury > 10000) lines.push('💰 Казна: уровень среднего полиса');
  else                       lines.push('💰 Казна: скромнее большинства тиранов эпохи');

  // Армия
  if (armyPower > 50000)      lines.push('⚔️ Армия: уровень Александра Македонского');
  else if (armyPower > 20000) lines.push('⚔️ Армия: сравним с Пирром Эпирским');
  else if (armyPower > 5000)  lines.push('⚔️ Армия: стандартная армия полиса');
  else                        lines.push('⚔️ Армия: слабее большинства соседей');

  // Легитимность
  if (legitimacy > 80)      lines.push('⚖️ Власть: как Перикл в период расцвета');
  else if (legitimacy > 60) lines.push('⚖️ Власть: средний уровень для выборного правителя');
  else if (legitimacy < 30) lines.push('⚖️ Власть: хуже чем у Цезаря накануне Рубикона — будь осторожен');

  return lines;
}

// ══════════════════════════════════════════════════════════════════════
// ГЛАВНЫЙ ТИК — вызывается из checkAchievements
// ══════════════════════════════════════════════════════════════════════

// Переопределяем checkAchievements чтобы включить все доп. тики
const _checkAchievementsCore = checkAchievements;

function checkAchievements(nationId) {
  // Запускаем основную проверку
  if (!GAME_STATE || !nationId) return;
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;

  _ensureAchievements(nationId);
  _updateAchievementCounters(nationId, nation);

  const unlocked = GAME_STATE.achievements[nationId];

  for (const achiev of ACHIEVEMENTS_LIST) {
    if (unlocked[achiev.id]) continue;
    let passed = false;
    try { passed = achiev.check(nation, GAME_STATE); } catch (e) {}
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

  // Дополнительные тики
  _tickManifest(nationId);
  _tickDynamicGoals(nationId);
  if (typeof checkVowViolations === 'function') {
    try { checkVowViolations(nationId); } catch (e) {}
  }
  _tickChronicle(nationId);
}
