// ============================================================================
//  ДВИЖОК КУЛЬТУРЫ — мутации традиций, ассимиляция, смешение
//
//  Вызывается каждый ход из processTurn():
//    cultureTick(nationId)  — начисляет опыт, проверяет мутации, ассимиляцию
//
//  1 ход = 1 месяц. Мутации — не чаще раза в 600 ходов (50 лет).
//  Опыт копится каждый ход от событий.
// ============================================================================

// ── НАЧИСЛЕНИЕ ОПЫТА ──────────────────────────────────────────────────────────

/**
 * Начисляет опыт культуре на основе текущего состояния нации.
 * Вызывается КАЖДЫЙ ход.
 */
function updateCultureExperience(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Определяем культуру нации (по первому региону)
  const cultureId = getNationPrimaryCulture(nationId);
  if (!cultureId) return;

  const culture = GAME_STATE.cultures[cultureId];
  if (!culture) return;

  const exp = culture.experience;

  // ── Военный опыт ──
  if (nation.military.at_war_with && nation.military.at_war_with.length > 0) {
    exp.exp_war += 2;
    exp.exp_suffering += 1;  // война — это страдание тоже
  }

  // ── Морской опыт ──
  const coastalCount = countRegionsByType(nationId, 'coastal_city');
  exp.exp_naval += coastalCount * 0.3;
  const ships = nation.military.ships || 0;
  exp.exp_naval += Math.floor(ships / 10) * 0.3;

  // ── Торговый опыт ──
  const tradeRoutes = (nation.economy.trade_routes || []).length;
  exp.exp_trade += tradeRoutes * 0.8;
  // Торговый доход даёт опыт
  const tradeIncome = nation.economy.income_per_turn || 0;
  if (tradeIncome > 0) exp.exp_trade += Math.min(2, tradeIncome / 500);

  // ── Аграрный опыт ──
  const farmRegions = countRegionsByTerrain(nationId, ['plains', 'river_valley']);
  exp.exp_agriculture += farmRegions * 0.4;
  const food = nation.economy.stockpile.wheat || 0;
  const foodNeeded = nation.population.total * (CONFIG.BALANCE.FOOD_PER_PERSON || 0.3);
  if (food > foodNeeded * 1.2) {
    exp.exp_agriculture += 0.5;  // избыток еды
  }

  // ── Культурный опыт ──
  exp.exp_culture += 0.3;  // базовый
  const culturalBuildings = countBuildingsByTag(nationId, 'cultural');
  exp.exp_culture += culturalBuildings * 0.4;

  // ── Религиозный опыт ──
  exp.exp_religion += 0.2;  // базовый
  const temples = countBuildingsByTag(nationId, 'religious');
  exp.exp_religion += temples * 0.4;

  // ── Дипломатический опыт ──
  const treatyCount = countTreaties(nationId);
  exp.exp_diplomacy += treatyCount * 0.3;

  // ── Гражданский опыт ──
  exp.exp_civic += 0.2;  // базовый
  const stability = nation.government?.stability || 50;
  if (stability > 60) exp.exp_civic += 0.3;

  // ── Страдания ──
  if (food < foodNeeded * 0.8) {
    exp.exp_suffering += 2;  // голод
  }
  if (nation.population.happiness < 30) {
    exp.exp_suffering += 1;  // народ несчастен
  }

  // ── Медленное затухание опыта (забывание) ──
  const decay = CULTURE_CONFIG.EXPERIENCE_DECAY_RATE;
  const floor = CULTURE_CONFIG.EXPERIENCE_DECAY_FLOOR;
  for (const key of Object.keys(EXPERIENCE_TYPES)) {
    if (exp[key] > floor) {
      exp[key] = Math.max(floor, exp[key] * (1 - decay));
    }
  }
}

// ── ПРОВЕРКА МУТАЦИЙ ──────────────────────────────────────────────────────────

/**
 * Проверяет, может ли одна из традиций мутировать.
 * Вызывается каждые MUTATION_CHECK_INTERVAL ходов (12 = 1 год).
 * Мутация произойдёт, только если прошло >= MUTATION_COOLDOWN_TURNS с последней.
 */
function checkCultureMutations(nationId) {
  const cultureId = getNationPrimaryCulture(nationId);
  if (!cultureId) return;

  const culture = GAME_STATE.cultures[cultureId];
  if (!culture) return;

  const currentTurn = GAME_STATE.turn || 0;

  // Проверка кулдауна (50 лет = 600 ходов)
  if (currentTurn - culture.last_mutation_turn < CULTURE_CONFIG.MUTATION_COOLDOWN_TURNS) {
    return;
  }

  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Собираем все возможные мутации из текущих традиций
  const candidates = [];

  for (let i = 0; i < culture.traditions.length; i++) {
    const tradId = culture.traditions[i];

    // Заблокированные традиции не мутируют
    if (culture.locked.includes(tradId)) continue;

    const trad = ALL_TRADITIONS[tradId];
    if (!trad || !trad.mut || trad.mut.length === 0) continue;

    for (const mutation of trad.mut) {
      // Целевая традиция не должна уже быть активной
      if (culture.traditions.includes(mutation.to)) continue;

      // Целевая традиция должна существовать
      if (!ALL_TRADITIONS[mutation.to]) continue;

      // Проверяем все условия
      const score = evaluateMutationConditions(mutation.need, culture, nation);
      if (score > 0) {
        candidates.push({
          from_index: i,
          from: tradId,
          to: mutation.to,
          score: score * (mutation.w || 1.0),
        });
      }
    }
  }

  if (candidates.length === 0) return;

  // Выбираем лучшего кандидата (наибольший score)
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Порог: score должен быть достаточно высоким (>= 0.6)
  if (best.score < 0.6) return;

  // ── Мутация! ──
  const oldTrad = ALL_TRADITIONS[best.from];
  const newTrad = ALL_TRADITIONS[best.to];

  culture.traditions[best.from_index] = best.to;
  culture.last_mutation_turn = currentTurn;

  // Логируем событие
  const year = GAME_STATE.date?.year || 0;
  const yearStr = year < 0 ? `${Math.abs(year)} г. до н.э.` : `${year} г. н.э.`;
  addEventLog(
    `🔄 Культура «${culture.name}»: традиция «${oldTrad.name}» трансформировалась в «${newTrad.name}» (${yearStr})`,
    'culture'
  );

  return { from: best.from, to: best.to };
}

/**
 * Оценивает условия мутации. Возвращает число 0..1 (0 = не выполнены).
 */
function evaluateMutationConditions(need, culture, nation) {
  if (!need) return 1.0;

  let totalConditions = 0;
  let metConditions = 0;

  for (const [key, value] of Object.entries(need)) {
    totalConditions++;

    // Опыт: exp_war, exp_naval, etc.
    if (key.startsWith('exp_')) {
      if ((culture.experience[key] || 0) >= value) {
        metConditions++;
      }
      continue;
    }

    switch (key) {
      case 'has':
        if (culture.traditions.includes(value)) metConditions++;
        break;

      case 'not':
        if (!culture.traditions.includes(value)) metConditions++;
        break;

      case 'war':
        if (value && nation.military.at_war_with?.length > 0) metConditions++;
        if (!value && (!nation.military.at_war_with || nation.military.at_war_with.length === 0)) metConditions++;
        break;

      case 'peace': {
        // Нужно N ходов мира
        const atWar = nation.military.at_war_with?.length > 0;
        const peaceTurns = atWar ? 0 : (nation._peace_turns || 0);
        if (peaceTurns >= value) metConditions++;
        break;
      }

      case 'coastal':
        if (value && countRegionsByType(nation.regions ? nation.regions[0] : '', 'coastal_city') > 0) {
          metConditions++;
        } else {
          // Проверяем через нацию
          const cCount = countRegionsByType(findNationIdByCulture(culture), 'coastal_city');
          if (value && cCount > 0) metConditions++;
          if (!value && cCount === 0) metConditions++;
        }
        break;

      case 'mountain':
        if (value && countRegionsByTerrain(findNationIdByCulture(culture), ['mountains']) > 0) metConditions++;
        break;

      case 'happiness_min':
        if ((nation.population.happiness || 50) >= value) metConditions++;
        break;

      case 'happiness_max':
        if ((nation.population.happiness || 50) <= value) metConditions++;
        break;

      case 'min_wars':
        // Используем exp_war как прокси
        if ((culture.experience.exp_war || 0) >= value * 20) metConditions++;
        break;

      case 'cavalry_victories':
        // Прокси через exp_war
        if ((culture.experience.exp_war || 0) >= value * 25) metConditions++;
        break;

      default:
        // Неизвестное условие — пропускаем
        metConditions++;
        break;
    }
  }

  return totalConditions === 0 ? 1.0 : metConditions / totalConditions;
}

// ── АССИМИЛЯЦИЯ ───────────────────────────────────────────────────────────────

/**
 * Обрабатывает ассимиляцию культур в регионах.
 * Если регион принадлежит нации с другой культурой — меньшинство постепенно
 * растёт или основная культура постепенно меняется.
 */
function processAssimilation(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.regions) return;

  const nationCultureId = getNationPrimaryCulture(nationId);
  if (!nationCultureId) return;

  const nationCulture = GAME_STATE.cultures[nationCultureId];
  if (!nationCulture) return;

  for (const regionId of nation.regions) {
    const rc = GAME_STATE.region_cultures[regionId];
    if (!rc) continue;

    // Если культура региона совпадает с культурой нации — ничего не делаем
    if (rc.primary === nationCultureId) {
      // Но уменьшаем меньшинства
      shrinkMinorities(rc);
      continue;
    }

    // Культура нации отличается от культуры региона — идёт ассимиляция
    const regionCulture = GAME_STATE.cultures[rc.primary];
    const nationGroup = nationCulture.group;
    const regionGroup = regionCulture?.group || 'indigenous';

    // Базовая скорость ассимиляции
    let rate = CULTURE_CONFIG.ASSIMILATION_RATE_BASE;

    // Модификатор близости групп
    const affinityKey = [nationGroup, regionGroup].sort().join('-');
    const affinity = CULTURE_GROUP_AFFINITY[affinityKey] || 0.3;
    rate *= affinity;

    // Бонусы от традиций
    rate *= (1 + getCultureBonusSum(nationCultureId, 'assimilation_speed'));
    // Сопротивление от традиций региональной культуры
    rate *= (1 + getCultureBonusSum(rc.primary, 'assimilation_speed'));

    // Счастье влияет: счастливый народ лучше ассимилирует
    const happiness = nation.population.happiness || 50;
    rate *= (0.5 + happiness / 100);

    // Ищем, есть ли уже нация-оккупант в меньшинствах
    let found = false;
    for (const minority of rc.minorities) {
      if (minority.culture === nationCultureId) {
        minority.strength = Math.min(0.95, minority.strength + rate);
        found = true;

        // Если меньшинство стало большинством (> MIXING_THRESHOLD)
        if (minority.strength >= CULTURE_CONFIG.CULTURE_MIXING_THRESHOLD) {
          // Проверяем: может быть полная замена?
          if (minority.strength >= 0.7) {
            // Смена основной культуры
            const oldPrimary = rc.primary;
            rc.primary = nationCultureId;
            rc.minorities = rc.minorities.filter(m => m.culture !== nationCultureId);
            // Старая культура становится меньшинством
            rc.minorities.push({ culture: oldPrimary, strength: 1 - minority.strength });

            addEventLog(
              `🏛 Регион ${regionId}: культура «${nationCulture.name}» стала доминирующей (вместо «${regionCulture?.name}»)`,
              'culture'
            );
          }
        }
        break;
      }
    }

    if (!found) {
      // Добавляем нацию как новое меньшинство
      rc.minorities.push({ culture: nationCultureId, strength: rate });
    }
  }
}

/**
 * Уменьшает силу меньшинств в регионе (естественная ассимиляция).
 */
function shrinkMinorities(regionCulture) {
  for (let i = regionCulture.minorities.length - 1; i >= 0; i--) {
    regionCulture.minorities[i].strength -= CULTURE_CONFIG.ASSIMILATION_RATE_BASE * 0.5;
    if (regionCulture.minorities[i].strength <= 0.01) {
      regionCulture.minorities.splice(i, 1);
    }
  }
}

// ── СМЕШЕНИЕ КУЛЬТУР ──────────────────────────────────────────────────────────

/**
 * Когда две культуры долго сосуществуют — может возникнуть новая смешанная.
 * Проверяется при ежегодной проверке мутаций.
 */
function checkCultureMixing(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.regions) return;

  for (const regionId of nation.regions) {
    const rc = GAME_STATE.region_cultures[regionId];
    if (!rc || !rc.minorities) continue;

    for (const minority of rc.minorities) {
      if (minority.strength >= CULTURE_CONFIG.CULTURE_MIXING_THRESHOLD) {
        const primaryCulture = GAME_STATE.cultures[rc.primary];
        const minorityCulture = GAME_STATE.cultures[minority.culture];
        if (!primaryCulture || !minorityCulture) continue;

        // Смешение: меньшинство передаёт 1 традицию основной культуре
        // (только если обе культуры достаточно долго сосуществуют)
        const sharedTraditions = minorityCulture.traditions.filter(
          t => !primaryCulture.traditions.includes(t) &&
               !primaryCulture.locked.includes(t) &&
               ALL_TRADITIONS[t]
        );

        if (sharedTraditions.length > 0 && Math.random() < 0.05) {
          // Выбираем случайную традицию для заимствования
          const borrowed = sharedTraditions[Math.floor(Math.random() * sharedTraditions.length)];
          const weakest = findWeakestTradition(primaryCulture);

          if (weakest && !primaryCulture.locked.includes(weakest)) {
            const oldTrad = ALL_TRADITIONS[weakest];
            const newTrad = ALL_TRADITIONS[borrowed];

            const idx = primaryCulture.traditions.indexOf(weakest);
            if (idx >= 0) {
              primaryCulture.traditions[idx] = borrowed;
              addEventLog(
                `🔀 Культурное смешение в ${regionId}: «${primaryCulture.name}» переняла «${newTrad.name}» от «${minorityCulture.name}» (заменила «${oldTrad.name}»)`,
                'culture'
              );
            }
          }
        }
      }
    }
  }
}

// ── БОНУСЫ ОТ ТРАДИЦИЙ ───────────────────────────────────────────────────────

/**
 * Возвращает суммарный бонус культуры по указанному типу.
 * Используется экономическим движком для модификаторов.
 */
function getCultureBonus(nationId, bonusType) {
  const cultureId = getNationPrimaryCulture(nationId);
  if (!cultureId) return 0;
  return getCultureBonusSum(cultureId, bonusType);
}

function getCultureBonusSum(cultureId, bonusType) {
  const culture = GAME_STATE.cultures[cultureId];
  if (!culture) return 0;

  let total = 0;
  for (const tradId of culture.traditions) {
    const trad = ALL_TRADITIONS[tradId];
    if (trad && trad.bonus && trad.bonus[bonusType]) {
      total += trad.bonus[bonusType];
    }
  }
  return total;
}

/**
 * Возвращает все бонусы культуры как объект { type: value, ... }
 */
function getAllCultureBonuses(nationId) {
  const cultureId = getNationPrimaryCulture(nationId);
  if (!cultureId) return {};

  const culture = GAME_STATE.cultures[cultureId];
  if (!culture) return {};

  const bonuses = {};
  for (const tradId of culture.traditions) {
    const trad = ALL_TRADITIONS[tradId];
    if (trad && trad.bonus) {
      for (const [key, val] of Object.entries(trad.bonus)) {
        bonuses[key] = (bonuses[key] || 0) + val;
      }
    }
  }
  return bonuses;
}

// ── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ───────────────────────────────────────────────────

function getNationPrimaryCulture(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.regions || nation.regions.length === 0) return null;

  // Культура определяется по большинству регионов
  const counts = {};
  for (const regionId of nation.regions) {
    const rc = GAME_STATE.region_cultures?.[regionId];
    if (rc) {
      counts[rc.primary] = (counts[rc.primary] || 0) + 1;
    }
  }

  let best = null, bestCount = 0;
  for (const [cId, count] of Object.entries(counts)) {
    if (count > bestCount) { best = cId; bestCount = count; }
  }
  return best;
}

function findNationIdByCulture(culture) {
  // Ищем нацию, у которой данная культура основная
  for (const [nId, nation] of Object.entries(GAME_STATE.nations || {})) {
    if (getNationPrimaryCulture(nId) === culture?.id) return nId;
  }
  return null;
}

function countRegionsByType(nationId, type) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.regions) return 0;
  let count = 0;
  for (const rid of nation.regions) {
    const r = GAME_STATE.regions[rid];
    if (r && r.type === type) count++;
  }
  return count;
}

function countRegionsByTerrain(nationId, terrains) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.regions) return 0;
  let count = 0;
  for (const rid of nation.regions) {
    const r = GAME_STATE.regions[rid];
    if (r && terrains.includes(r.terrain)) count++;
  }
  return count;
}

function countBuildingsByTag(nationId, tag) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.regions) return 0;
  let count = 0;
  for (const rid of nation.regions) {
    const r = GAME_STATE.regions[rid];
    if (r && r.buildings) {
      for (const b of r.buildings) {
        if (b.tags && b.tags.includes(tag)) count++;
      }
    }
  }
  return count;
}

function countTreaties(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || !nation.relations) return 0;
  let count = 0;
  for (const rel of Object.values(nation.relations)) {
    if (rel.treaties && rel.treaties.length > 0) count += rel.treaties.length;
  }
  return count;
}

function findWeakestTradition(culture) {
  // Находим традицию с наименьшим "совпадением" с текущим опытом
  let weakest = null;
  let weakestScore = Infinity;

  for (const tradId of culture.traditions) {
    if (culture.locked.includes(tradId)) continue;

    const trad = ALL_TRADITIONS[tradId];
    if (!trad) continue;

    // Оценка: насколько традиция "поддержана" текущим опытом
    let support = 0;
    if (trad.mut) {
      for (const m of trad.mut) {
        if (m.need) {
          for (const [key, val] of Object.entries(m.need)) {
            if (key.startsWith('exp_')) {
              support += (culture.experience[key] || 0) / val;
            }
          }
        }
      }
    }
    // Добавляем поддержку от бонусов (если бонус совпадает с сильной стороной)
    const cat = trad.cat;
    const catExpMap = {
      military: 'exp_war', economic: 'exp_trade', social: 'exp_civic',
      religious: 'exp_religion', naval: 'exp_naval', arts: 'exp_culture',
      diplomatic: 'exp_diplomacy', survival: 'exp_suffering',
    };
    const relExp = culture.experience[catExpMap[cat] || 'exp_culture'] || 0;
    support += relExp / 50;

    if (support < weakestScore) {
      weakestScore = support;
      weakest = tradId;
    }
  }

  return weakest;
}

// ── ГЛАВНАЯ ФУНКЦИЯ ТИКА ─────────────────────────────────────────────────────

/**
 * Вызывается каждый ход из processTurn().
 * Обрабатывает все нации.
 */
function cultureTick() {
  // Инициализация при первом запуске
  if (!GAME_STATE.cultures) {
    initCultures();
  }
  if (!GAME_STATE.region_cultures) {
    initRegionCultures();
  }

  const currentTurn = GAME_STATE.turn || 0;

  for (const nationId of Object.keys(GAME_STATE.nations)) {
    // 1. Каждый ход: начисляем опыт
    updateCultureExperience(nationId);

    // 2. Раз в год (12 ходов): проверяем мутации и ассимиляцию
    if (currentTurn % CULTURE_CONFIG.MUTATION_CHECK_INTERVAL === 0) {
      checkCultureMutations(nationId);
      processAssimilation(nationId);
      checkCultureMixing(nationId);
    }
  }

  // Отслеживаем мирные ходы
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    if (!nation.military.at_war_with || nation.military.at_war_with.length === 0) {
      nation._peace_turns = (nation._peace_turns || 0) + 1;
    } else {
      nation._peace_turns = 0;
    }
  }
}

// ── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────────────────────────────

function initCultures() {
  if (typeof CULTURES === 'undefined') { console.warn('[culture] CULTURES not defined'); return; }
  if (typeof GAME_STATE === 'undefined') { console.warn('[culture] GAME_STATE not defined'); return; }
  GAME_STATE.cultures = {};
  for (const [id, def] of Object.entries(CULTURES)) {
    if (!def.traditions) continue;  // пропускаем нe-культуры
    GAME_STATE.cultures[id] = {
      id: id,
      name: def.name,
      group: def.group,
      traditions: [...def.traditions],
      locked: [...(def.locked || [])],
      experience: { ...(def.experience || {}) },
      last_mutation_turn: def.last_mutation_turn || 0,
    };
  }
  console.log('[culture] initCultures: loaded', Object.keys(GAME_STATE.cultures).length, 'cultures');
}

function initRegionCultures() {
  if (typeof REGION_CULTURES === 'undefined') { console.warn('[culture] REGION_CULTURES not defined'); return; }
  if (typeof GAME_STATE === 'undefined') { console.warn('[culture] GAME_STATE not defined'); return; }
  GAME_STATE.region_cultures = {};
  for (const [regionId, def] of Object.entries(REGION_CULTURES)) {
    GAME_STATE.region_cultures[regionId] = {
      primary: def.primary,
      minorities: (def.minorities || []).map(m => ({ ...m })),
    };
  }
  console.log('[culture] initRegionCultures: loaded', Object.keys(GAME_STATE.region_cultures).length, 'regions');
}

// Инициализация вызывается из initGame() в engine/turn.js

// ── Экспорт для UI ────────────────────────────────────────────────────────────

function getCultureInfoForUI(nationId) {
  const cultureId = getNationPrimaryCulture(nationId);
  if (!cultureId) return null;

  const culture = GAME_STATE.cultures[cultureId];
  if (!culture) return null;

  return {
    id: cultureId,
    name: culture.name,
    group: CULTURE_GROUPS[culture.group]?.name || culture.group,
    traditions: culture.traditions.map(tId => {
      const t = ALL_TRADITIONS[tId];
      return t ? {
        id: tId,
        name: t.name,
        cat: t.cat,
        desc: t.desc,
        bonus: t.bonus,
        locked: culture.locked.includes(tId),
        hasMutations: t.mut && t.mut.length > 0,
      } : null;
    }).filter(Boolean),
    experience: { ...culture.experience },
    turnsSinceLastMutation: (GAME_STATE.turn || 0) - culture.last_mutation_turn,
    nextMutationIn: Math.max(0, CULTURE_CONFIG.MUTATION_COOLDOWN_TURNS - ((GAME_STATE.turn || 0) - culture.last_mutation_turn)),
  };
}
