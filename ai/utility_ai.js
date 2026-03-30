// ══════════════════════════════════════════════════════════════════════
// UTILITY AI — тактические решения командующих
//
// Принцип: каждое возможное действие получает числовой score.
// Выбирается действие с максимальным счётом.
//
// Score(действие) = сумма взвешенных факторов × модификатор_личности
//
// Работает за ~0 мс, полностью offline, детерминировано.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Веса факторов (настройка баланса) ────────────────────────────────

const UAI_W = {
  target_value:      30,   // ценность типа региона-цели
  enemy_weakness:    28,   // соотношение сила армии / гарнизон врага
  readiness:         20,   // мораль + снабжение + усталость
  fortress_penalty:  22,   // штраф за уровень укреплений
  distance:          12,   // штраф за дальность пути
  population_bonus:   8,   // богатые регионы ценнее
  enemy_army_threat: 18,   // штраф за вражескую армию в регионе-цели
};

// ── Ценность регионов по типу рельефа ────────────────────────────────

const UAI_REGION_VALUE = {
  coastal_city:  1.00,   // портовые города — максимум
  river_valley:  0.82,   // плодородные долины
  plains:        0.62,
  hills:         0.38,
  mountains:     0.20,
  desert:        0.15,
  forest:        0.28,
};

// ── Фразы для лога (чтобы командиры звучали по-разному) ──────────────

const UAI_PHRASES = {
  attack_open: [
    'Гарнизон слаб — брать с марша.',
    'Незащищённый город — ударить немедленно.',
    'Врата открыты — нельзя упустить момент.',
    'Противник не ждёт удара — атаковать.',
  ],
  attack_fortified: [
    'Взять в осаду и принудить к сдаче.',
    'Блокировать подвоз — голод сделает своё дело.',
    'Осада выгоднее штурма при этих стенах.',
    'Терпение и осада — лучший способ взять крепость.',
  ],
  storm: [
    'Укрепления подорваны — пора идти на штурм!',
    'Гарнизон сломлен — штурм сейчас.',
    'Ждать больше нет смысла — на приступ!',
    'Момент для решительного удара настал.',
  ],
  retreat: [
    'Армия истощена — отступить и восстановиться.',
    'Продолжать бой безрассудно — сохранить людей.',
    'Отойти и перегруппироваться.',
    'Без снабжения армия небоеспособна — назад.',
  ],
  hold: [
    'Держать позицию — дать армии отдохнуть.',
    'Восстановить боеспособность перед движением.',
    'Ждать подходящего момента.',
    'Укрепить позицию и ждать.',
  ],
};

function _phrase(key) {
  const arr = UAI_PHRASES[key] ?? ['Ждать.'];
  return arr[Math.floor(Math.random() * arr.length)];
}

// ══════════════════════════════════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ
// ══════════════════════════════════════════════════════════════════════

/**
 * Принимает тактическое решение для армии.
 * @param {object} army  — объект армии из GAME_STATE.armies
 * @param {object} order — активный приказ (или фиктивный с target_id)
 * @returns {{ action, target_id, reasoning, score }}
 */
function utilityAIDecide(army, order) {
  const char       = typeof getArmyCommander === 'function' ? getArmyCommander(army) : null;
  const mods       = _personalityMods(char);
  const readiness  = _calcReadiness(army);
  const nearby     = _buildNearbyMap(army.position, 3);
  const enemies    = _enemyNationsOf(army.nation);
  const activeSiege = army.siege_id
    ? (GAME_STATE.sieges ?? []).find(s => s.id === army.siege_id) ?? null
    : null;

  // Карта вражеских армий: { regionId: totalStrength }
  const enemyArmies = _scanEnemyArmies(nearby, enemies);
  const myStr       = _armyStrength(army, nearby[army.position]?.terrain ?? 'plains');
  // Модификаторы состава войск (конница / артиллерия)
  const compMods    = _armyCompositionMods(army);
  // Столичные регионы врагов — цели с наивысшим приоритетом
  const capitals    = _getCapitalRegions(enemies);
  // Союзные армии в радиусе: где стоят, куда идут, что осаждают
  const allyInfo    = _scanAllyArmies(nearby, army.nation);
  // Клещи/фланг: определить синхронные возможности
  const pincerInfo  = _detectPincerOpportunity(army, nearby, enemies);
  // MIL_002: Установить формацию армии перед боем
  const currentTerrain = nearby[army.position]?.terrain ?? 'plains';
  army.formation = _chooseFormation(army, currentTerrain, readiness, activeSiege);

  // ── 1. КРИТИЧЕСКОЕ СОСТОЯНИЕ: принудительное отступление ────────────
  if (readiness < mods.retreat_threshold) {
    const retreatId = _findBestRetreat(army, nearby);
    if (retreatId) {
      return { action: 'retreat', target_id: retreatId, score: 999,
               reasoning: _phrase('retreat') };
    }
    return { action: 'hold', target_id: null, score: 900,
             reasoning: _phrase('hold') };
  }

  // ── 2. Угроза от вражеской армии рядом: отступить если враг сильнее ─
  for (const [rid, eStr] of Object.entries(enemyArmies)) {
    if (rid === army.position) continue;
    const dist = _bfsDistanceInNearby(army.position, rid, nearby);
    // Враг в соседнем регионе и превосходит нас в 1.6 раза — отходим
    if (dist === 1 && eStr > myStr * 1.6 && readiness < 0.70) {
      const retreatId = _findBestRetreat(army, nearby);
      if (retreatId) {
        const rName = nearby[rid]?.name ?? rid;
        return {
          action: 'retreat', target_id: retreatId, score: 950,
          reasoning: `Превосходящая армия врага в "${rName}" — отходим.`,
        };
      }
    }
  }

  // ── 2б. Угроза окружения: большинство соседей — враги ───────────────
  const encirclement = _encirclementRisk(army, nearby, enemies);
  // При >60% соседей-врагов и не идеальной боеготовности — пробиваться
  if (encirclement >= 0.60 && readiness < 0.80) {
    const breakoutId = _findBestRetreat(army, nearby);
    if (breakoutId) {
      return {
        action: 'retreat', target_id: breakoutId, score: 980,
        reasoning: `Угроза окружения (${Math.round(encirclement * 100)}% соседей — враги) — прорыв.`,
      };
    }
  }

  // ── 3. Набираем кандидатов и считаем score для каждого ───────────────
  const candidates = [];

  // Держать позицию
  candidates.push({
    action:    'hold',
    target_id: null,
    score:     _scoreHold(army, readiness, mods),
    reasoning: _phrase('hold'),
  });

  // Штурм текущей осады
  if (activeSiege) {
    if (activeSiege.storm_possible ||
        activeSiege.progress >= mods.storm_threshold) {
      candidates.push({
        action:    'storm',
        target_id: null,
        score:     _scoreStorm(army, activeSiege, mods, readiness, compMods),
        reasoning: _phrase('storm'),
      });
    }
    // Продолжить осаду (не штурм)
    candidates.push({
      action:    'siege',
      target_id: null,
      score:     _scoreSiege(army, activeSiege, mods, readiness, compMods),
      reasoning: `Продолжать осаду ${activeSiege.region_name} (${Math.round(activeSiege.progress)}%).`,
    });
  }

  // Если союзник осаждает крепость рядом — идти на помощь (высокий приоритет)
  for (const siegeTarget of allyInfo.allySiegeTargets) {
    if (nearby[siegeTarget] && enemies.includes(nearby[siegeTarget].nation)) {
      const dist = _bfsDistanceInNearby(army.position, siegeTarget, nearby);
      if (dist <= 2 && !activeSiege) {
        const reinforceScore = 55 + readiness * 20 - dist * 8;
        candidates.push({
          action:    'move',
          target_id: siegeTarget,
          score:     reinforceScore,
          reasoning: 'Подкрепить союзную осаду.',
        });
      }
    }
  }

  // Атаковать вражеские регионы в радиусе
  for (const [rid, region] of Object.entries(nearby)) {
    if (rid === army.position) continue;
    if (!enemies.includes(region.nation)) continue;

    let sc = _scoreAttack(army, region, nearby, mods, readiness, enemyArmies, compMods, capitals);

    const eStr   = enemyArmies[rid] ?? 0;
    const isOpen = region.fortress === 0 && region.garrison < 300 && eStr === 0;
    let moveReasoning = isOpen ? _phrase('attack_open') : _phrase('attack_fortified');

    // Клещи: синхронный удар 2+ армий по одной цели (сильнее обычной координации)
    if (pincerInfo.isPincer && rid === pincerInfo.pincerTarget) {
      sc *= 1.35;
      moveReasoning = `pincer_with:[${pincerInfo.allies.join(',')}]`;
    } else if (allyInfo.allyMoveTargets.has(rid)) {
      // Координация: союзник тоже движется к этой цели — вместе сильнее
      sc *= 1.25;
    }
    // Союзник уже стоит рядом с целью — атаковать с двух сторон
    const allyNearTarget = Object.entries(allyInfo.allyStrByRegion).some(([arid]) => {
      const r = GAME_STATE.regions?.[arid] ?? MAP_REGIONS?.[arid];
      return (r?.connections ?? []).includes(rid);
    });
    if (allyNearTarget) sc *= 1.15;

    if (sc > 5) {
      candidates.push({
        action:    'move',
        target_id: rid,
        score:     sc,
        reasoning: moveReasoning,
      });
    }
  }

  // Фланговая поддержка: если сильнее любой цели ×1.5 → помочь союзнику в осаде
  if (!activeSiege && allyInfo.allySiegeTargets.size > 0) {
    const strongerThanNearEnemy = Object.entries(nearby).some(([rid, region]) => {
      if (!enemies.includes(region.nation)) return false;
      const def = Math.max(region.garrison ?? 50, 50) + (enemyArmies[rid] ?? 0);
      return myStr > def * 1.5;
    });
    if (strongerThanNearEnemy) {
      for (const siegeTarget of allyInfo.allySiegeTargets) {
        const sDist = _bfsDistanceInNearby(army.position, siegeTarget, nearby);
        if (sDist <= 2 && nearby[siegeTarget]) {
          candidates.push({
            action:    'move',
            target_id: siegeTarget,
            score:     52 + readiness * 20,
            reasoning: 'flank_support',
          });
          break;
        }
      }
    }
  }

  // MIL_003: Морская блокада — флот ИИ блокирует прибрежную столицу врага
  if (army.type === 'naval') {
    const navalBlockadeScore = _scoreNavalBlockade(army, enemies, capitals);
    if (navalBlockadeScore > 0) {
      candidates.push(navalBlockadeScore);
    }
  }

  // Если врагов нет в радиусе — идти к цели из приказа
  const hasEnemyMoves = candidates.some(c => c.action === 'move');
  if (!hasEnemyMoves && !activeSiege) {
    const distant = _findDistantEnemy(army, order, enemies);
    if (distant) {
      candidates.push({
        action:    'move',
        target_id: distant,
        score:     28,
        reasoning: 'Выдвинуться к территории врага.',
      });
    }
  }

  // ── 4. Выбираем действие с максимальным score ──────────────────────
  candidates.sort((a, b) => b.score - a.score);

  // Если лучшее действие не превышает порог активности — лучше держать
  const best = candidates[0];
  if (best && best.action !== 'hold' && best.score < mods.action_threshold) {
    return {
      action:    'hold',
      target_id: null,
      score:     _scoreHold(army, readiness, mods),
      reasoning: _phrase('hold'),
    };
  }

  return best ?? { action: 'hold', target_id: null, score: 0, reasoning: 'Нет целей.' };
}

// ══════════════════════════════════════════════════════════════════════
// ФУНКЦИИ ОЦЕНКИ (одна на каждый тип действия)
// ══════════════════════════════════════════════════════════════════════

/**
 * MIL_003: Score для морской блокады.
 * Флот ищет прибрежные столицы врагов в радиусе и идёт их блокировать.
 * @returns {object|null} candidate объект или null
 */
function _scoreNavalBlockade(army, enemies, capitals) {
  // Ищем прибрежные столицы врагов в GAME_STATE
  let bestTarget = null;
  let bestScore  = 0;

  for (const enemyId of enemies) {
    const nation   = GAME_STATE.nations?.[enemyId];
    if (!nation) continue;
    const capitalId = nation.capital;
    if (!capitalId) continue;

    const region = GAME_STATE.regions?.[capitalId]
      ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[capitalId] : null);
    if (!region || region.terrain !== 'coastal_city') continue;

    // Базовый score + бонус за столицу
    const capitalBonus = capitals?.has(capitalId) ? 25 : 5;
    const score = 45 + capitalBonus;

    if (score > bestScore) {
      bestScore  = score;
      bestTarget = capitalId;
    }
  }

  if (!bestTarget) return null;

  // Добавить event о блокаде
  if (typeof addEventLog === 'function') {
    const nation   = GAME_STATE.nations?.[army.nation];
    const region   = GAME_STATE.regions?.[bestTarget]
      ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[bestTarget] : null);
    const natName  = nation?.name ?? army.nation;
    const regName  = region?.name ?? bestTarget;
    if (army.position !== bestTarget) {
      addEventLog(`⚓ Флот ${natName} выдвигается для блокады ${regName}.`, 'military');
    } else {
      addEventLog(`⚓ Флот ${natName} блокировал ${regName}.`, 'military');
    }
  }

  return {
    action:    'move',
    target_id: bestTarget,
    score:     bestScore,
    reasoning: `naval_blockade:${bestTarget}`,
  };
}

/**
 * Score для движения к вражескому региону.
 * Учитывает: ценность цели, соотношение сил (гарнизон + армии), дальность, укреплённость.
 */
function _scoreAttack(army, targetRegion, nearby, mods, readiness, enemyArmies, compMods, capitals) {
  // Ценность типа региона
  const regionValue = UAI_REGION_VALUE[targetRegion.terrain] ?? 0.40;
  const valueScore  = regionValue * UAI_W.target_value;

  // Суммарная сила защитников = гарнизон + все вражеские армии в регионе
  const armyStr        = _armyStrength(army, targetRegion.terrain);
  const garrison       = Math.max(targetRegion.garrison, 50);
  const enemyArmyStr   = enemyArmies[targetRegion.id] ?? 0;
  const totalDefense   = garrison + enemyArmyStr;

  const ratio = Math.min(armyStr / totalDefense, 8.0);
  // Нелинейная кривая: ratio=1 → 0.35, ratio=3 → 0.75, ratio=6 → 0.95
  const weakScore = (1 - 1 / (1 + ratio * 0.3)) * UAI_W.enemy_weakness;

  // Дополнительный штраф если в регионе стоит значимая армия врага
  const armyThreatPenalty = enemyArmyStr > 0
    ? -(Math.min(enemyArmyStr / Math.max(armyStr, 1), 2.5) * UAI_W.enemy_army_threat)
    : 0;

  // Штраф за укреплённость
  const fortPenalty = -(targetRegion.fortress * 0.18) * UAI_W.fortress_penalty;

  // Штраф за дальность
  const dist        = _bfsDistanceInNearby(army.position, targetRegion.id, nearby);
  const distPenalty = -(dist * 0.09) * UAI_W.distance;

  // Боеготовность армии
  const readScore = readiness * UAI_W.readiness;

  // Бонус за крупное население (богатая добыча)
  const popBonus = Math.min(targetRegion.population / 15000, 1.0) * UAI_W.population_bonus;

  // Бонус за столицу: политически и стратегически важнейшая цель
  const capitalBonus = capitals?.has(targetRegion.id) ? 22 : 0;

  let score = valueScore + weakScore + armyThreatPenalty + fortPenalty + distPenalty + readScore + popBonus + capitalBonus;

  // Модификаторы личности
  score *= mods.attack_mult;

  // Тактик предпочитает слабые незащищённые цели
  if (targetRegion.fortress === 0 && garrison < 200 && enemyArmyStr === 0) {
    score *= mods.prefer_weak_bonus;
  }

  // Мастер осады избегает открытых городов (предпочитает брать в осаду)
  if (mods.siege_specialist && targetRegion.fortress === 0) {
    score *= 0.75;
  }

  // Конница обожает открытые равнинные цели
  if (compMods) {
    const terrain = targetRegion.terrain;
    if (compMods.is_cavalry_heavy) {
      if (terrain === 'plains' || terrain === 'river_valley') {
        score *= compMods.cavalry_open_bonus;
      } else if (terrain === 'mountains' || terrain === 'hills') {
        score *= compMods.cavalry_mountain_pen;
      }
      if (targetRegion.fortress > 1) {
        score *= compMods.cavalry_fort_pen;
      }
    }
    // Тяжёлая артиллерия немного медленнее добирается до целей
    if (compMods.is_artillery_heavy) {
      score *= compMods.artillery_move_pen;
    }
  }

  return Math.max(0, score);
}

/**
 * Score для штурма крепости.
 * Высокий прогресс осады и агрессивный командир = высокий score.
 */
function _scoreStorm(army, siege, mods, readiness, compMods) {
  const progress = siege.progress ?? 0;

  // Базовый score растёт с прогрессом: 50% → 40 очков, 100% → 80 очков
  let score = 20 + progress * 0.60;

  // Нужна боеспособная армия
  score *= (0.4 + readiness * 0.6);

  // Агрессивный командир охотнее штурмует
  score *= mods.storm_eagerness;

  // Боевая сила влияет: слабую армию штурм уничтожит
  const str = _armyStrength(army, 'plains');
  if (str < 500) score *= 0.5;

  // Артиллерия делает штурм значительно эффективнее
  if (compMods?.is_artillery_heavy) score *= compMods.artillery_storm_bonus;

  // Кавалерия плохо берёт стены
  if (compMods?.is_cavalry_heavy) score *= 0.60;

  return Math.max(0, score);
}

/**
 * Score для продолжения осады (не штурм).
 * Осадные специалисты, хорошее снабжение, сильные укрепления → выше score.
 */
function _scoreSiege(army, siege, mods, readiness, compMods) {
  const progress = siege.progress ?? 0;

  let score = 35 + progress * 0.25;

  // Осадный специалист — это его стихия
  score *= mods.siege_mult;

  // Снабжение критично для долгой осады
  if (army.supply >= 70) score *= 1.25;
  else if (army.supply < 40) score *= 0.65;
  else if (army.supply < 25) score *= 0.30;

  // Усталость снижает эффективность осады
  if (army.fatigue > 70) score *= 0.75;

  score *= (0.5 + readiness * 0.5);

  // Артиллерия делает осаду эффективнее
  if (compMods?.is_artillery_heavy) score *= compMods.artillery_siege_bonus;

  // Конница не умеет осаждать — сильный штраф
  if (compMods?.is_cavalry_heavy) score *= 0.45;

  return Math.max(0, score);
}

/**
 * Score для удержания позиции.
 * Чем хуже состояние армии — тем выгоднее держать и восстанавливаться.
 */
function _scoreHold(army, readiness, mods) {
  let score = 12;

  // Усталость → отдыхать
  if (army.fatigue > 65) score += (army.fatigue - 65) * 0.55;

  // Низкая мораль → восстанавливать
  if (army.morale < 55) score += (55 - army.morale) * 0.45;

  // Низкое снабжение → ждать подвоза
  if (army.supply < 50) score += (50 - army.supply) * 0.35;

  // Осторожный командир охотнее держит позицию
  score *= mods.hold_mult;

  return Math.max(8, score);
}

// ══════════════════════════════════════════════════════════════════════
// МОДИФИКАТОРЫ ЛИЧНОСТИ КОМАНДИРА
// ══════════════════════════════════════════════════════════════════════

/**
 * Превращает черты и умения командира в числовые множители.
 * Один и тот же расклад сил → разные решения для разных командиров.
 */
function _personalityMods(char) {
  const ambition   = (char?.traits?.ambition   ?? 50) / 100;  // 0..1
  const caution    = (char?.traits?.caution    ?? 50) / 100;
  const cruelty    = (char?.traits?.cruelty    ?? 40) / 100;
  const tactics    = (char?.skills?.tactics    ?? char?.skills?.military ?? 50) / 100;
  const siegeSkill = (char?.skills?.siege      ?? 30) / 100;
  const skills     = char?.commander_skills ?? [];

  const hasSiegeMaster    = skills.includes('siege_master');
  const hasFierce         = skills.includes('fierce_aggressor');
  const hasDefGenius      = skills.includes('defensive_genius');
  const hasSwift          = skills.includes('swift_marcher');
  const hasTactician      = skills.includes('master_tactician');
  const hasLegendary      = skills.includes('legendary');

  return {
    // Порог отступления: трус отступает при мораль<40, берсерк — при мораль<10
    retreat_threshold: hasLegendary
      ? 0.08
      : 0.12 + caution * 0.18,

    // Агрессивность движения: амбициозный рвётся вперёд
    attack_mult: hasFierce
      ? 1.35 + ambition * 0.25
      : 0.65 + ambition * 0.70,

    // Предпочтение слабых незащищённых целей: тактик избегает лобовых штурмов
    prefer_weak_bonus: hasTactician
      ? 1.45
      : 0.85 + tactics * 0.55,

    // Осадный множитель: siege_master выбирает осаду чаще
    siege_mult: hasSiegeMaster
      ? 1.90
      : 0.55 + siegeSkill * 1.30,

    // Siege specialist flag
    siege_specialist: hasSiegeMaster,

    // Желание штурмовать: fierce_aggressor штурмует раньше
    storm_eagerness: hasFierce
      ? 1.50 + cruelty * 0.30
      : 0.70 + ambition * 0.50,

    // Порог прогресса осады для штурма
    storm_threshold: hasFierce ? 40 : (50 - ambition * 10),

    // Множитель удержания: оборонный гений охотнее держит позицию
    hold_mult: hasDefGenius
      ? 1.40 + caution * 0.40
      : 0.70 + caution * 0.60,

    // Порог активности: ниже этого — лучше держать
    action_threshold: hasLegendary
      ? 15
      : 28 - ambition * 12,
  };
}

// ══════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ══════════════════════════════════════════════════════════════════════

/**
 * Анализирует состав армии и возвращает модификаторы решений.
 * cavalry_ratio  — доля конницы (0..1)
 * artillery_ratio — доля артиллерии (0..1)
 * Кавалерия: быстрые удары по открытым целям, штраф к осаде и горам
 * Артиллерия: бонус к осаде и штурму, штраф к быстрым маршам
 */
function _armyCompositionMods(army) {
  const u    = army.units ?? {};
  const inf  = u.infantry    ?? 0;
  const cav  = u.cavalry     ?? 0;
  const merc = u.mercenaries ?? 0;
  const art  = u.artillery   ?? 0;
  const total = Math.max(inf + cav + merc + art, 1);

  const cavRatio = cav / total;
  const artRatio = art / total;

  return {
    // Конная армия быстрее атакует лёгкие цели
    cavalry_open_bonus:   1.0 + cavRatio * 0.55,
    // Конница не любит горы и крепости (она там бесполезна)
    cavalry_mountain_pen: 1.0 - cavRatio * 0.50,
    cavalry_fort_pen:     1.0 - cavRatio * 0.40,
    // Артиллерия усиливает осаду и штурм
    artillery_siege_bonus: 1.0 + artRatio * 1.20,
    artillery_storm_bonus: 1.0 + artRatio * 0.80,
    // Тяжёлая артиллерия замедляет марш
    artillery_move_pen:   1.0 - artRatio * 0.30,
    // Флаги для удобных проверок
    is_cavalry_heavy:  cavRatio > 0.45,
    is_artillery_heavy: artRatio > 0.25,
  };
}

/**
 * MIL_002: Выбор формации на основе состояния армии и ситуации.
 * @param {object} army
 * @param {string} terrain — местность текущей позиции
 * @param {number} readiness — 0..1
 * @param {object|null} activeSiege
 * @returns {string} название формации
 */
function _chooseFormation(army, terrain, readiness, activeSiege) {
  const u     = army.units ?? {};
  const total = Math.max(
    (u.infantry ?? 0) + (u.cavalry ?? 0) + (u.mercenaries ?? 0) + (u.artillery ?? 0), 1
  );
  const cavRatio = (u.cavalry   ?? 0) / total;
  const artRatio = (u.artillery ?? 0) / total;

  if (readiness < 0.50)                          return 'defensive';
  if (cavRatio > 0.45 && terrain === 'plains')   return 'flanking';
  if (artRatio > 0.25 && activeSiege)            return 'siege';
  if (readiness >= 0.80)                         return 'aggressive';
  return 'standard';
}

/** Боеготовность 0..1 */
function _calcReadiness(army) {
  const morale  = (army.morale  ?? 50) / 100;
  const supply  = (army.supply  ?? 50) / 100;
  const fatigue = 1 - (army.fatigue ?? 0) / 100;
  return morale * 0.50 + supply * 0.30 + fatigue * 0.20;
}

/** Эффективная боевая сила с учётом рельефа */
function _armyStrength(army, terrain) {
  if (typeof calcArmyCombatStrength === 'function') {
    return calcArmyCombatStrength(army, terrain ?? 'plains', false);
  }
  const u = army.units ?? {};
  return (u.infantry ?? 0) + (u.cavalry ?? 0) * 2.5 + (u.mercenaries ?? 0) * 1.5;
}

/** Нации, с которыми армия находится в состоянии войны */
function _enemyNationsOf(nationId) {
  return GAME_STATE.nations?.[nationId]?.military?.at_war_with ?? [];
}

/**
 * Строит карту ближайших регионов BFS-обходом.
 * Возвращает { regionId: { id, name, nation, terrain, fortress, garrison, population } }
 */
function _buildNearbyMap(startId, depth) {
  const result  = {};
  const queue   = [[startId, 0]];
  const visited = new Set([startId]);
  const MAX     = 18;

  while (queue.length > 0 && Object.keys(result).length < MAX) {
    const [rid, d] = queue.shift();
    const gs = GAME_STATE.regions?.[rid];
    const mr = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[rid] : null;
    const nation = gs?.nation ?? mr?.nation ?? 'neutral';

    result[rid] = {
      id:         rid,
      name:       gs?.name ?? mr?.name ?? rid,
      nation,
      nationName: GAME_STATE.nations?.[nation]?.name ?? nation,
      terrain:    gs?.terrain ?? mr?.terrain ?? 'plains',
      mapType:    gs?.mapType ?? mr?.mapType ?? 'Land',
      fortress:   gs?.fortress_level ?? 0,
      garrison:   gs?.garrison       ?? 0,
      population: gs?.population     ?? 0,
    };

    if (d < depth) {
      const conns = gs?.connections ?? mr?.connections ?? [];
      for (const next of conns) {
        if (visited.has(next)) continue;
        visited.add(next);
        const nr = GAME_STATE.regions?.[next] ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[next] : null);
        if (nr?.mapType !== 'Ocean') queue.push([next, d + 1]);
      }
    }
  }
  return result;
}

/** BFS-дистанция внутри already-built nearby map */
function _bfsDistanceInNearby(fromId, toId, nearby) {
  if (fromId === toId) return 0;
  const visited = new Set([fromId]);
  const queue   = [[fromId, 0]];
  while (queue.length > 0) {
    const [cur, d] = queue.shift();
    const reg = GAME_STATE.regions?.[cur] ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[cur] : null);
    for (const next of (reg?.connections ?? [])) {
      if (next === toId) return d + 1;
      if (!visited.has(next) && nearby[next]) {
        visited.add(next);
        queue.push([next, d + 1]);
      }
    }
  }
  return 6; // fallback: регион не найден в радиусе
}

/**
 * Проверяет риск окружения: считает долю вражеских соседей.
 * Возвращает 0..1 (0 = нет угрозы, 1 = полное окружение).
 */
function _encirclementRisk(army, nearby, enemies) {
  const curRegion = GAME_STATE.regions?.[army.position]
    ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[army.position] : null);
  const connections = curRegion?.connections ?? [];
  if (connections.length === 0) return 0;

  let enemyCount = 0;
  for (const nid of connections) {
    const nr = nearby[nid];
    if (!nr) continue; // за пределами видимости — не считаем
    if (enemies.includes(nr.nation)) enemyCount++;
  }
  return enemyCount / connections.length;
}

/** Лучший регион для отступления (ближайший дружественный) */
function _findBestRetreat(army, nearby) {
  const nationId = army.nation;
  let bestId = null, bestScore = -Infinity;

  for (const [rid, r] of Object.entries(nearby)) {
    if (rid === army.position) continue;
    if (r.nation !== nationId) continue;
    // Предпочитаем регионы с большим населением (лучше снабжение)
    const score = r.population / 1000 + (r.fortress > 0 ? 10 : 0);
    if (score > bestScore) { bestScore = score; bestId = rid; }
  }
  return bestId;
}

/**
 * Сканирует союзные армии в видимом радиусе.
 * Возвращает:
 *   allyStrByRegion — { regionId: totalAllyStrength } (где стоят союзники)
 *   allySiegeTargets — Set регионов, которые союзники осаждают
 *   allyMoveTargets  — Set регионов, к которым союзники двигаются
 */
function _scanAllyArmies(nearby, nationId) {
  const allyStrByRegion  = {};
  const allySiegeTargets = new Set();
  const allyMoveTargets  = new Set();

  for (const a of (GAME_STATE.armies ?? [])) {
    if (a.state === 'disbanded') continue;
    if (a.nation !== nationId) continue;
    if (!nearby[a.position]) continue;

    const str = _armyStrength(a, nearby[a.position]?.terrain ?? 'plains');
    allyStrByRegion[a.position] = (allyStrByRegion[a.position] ?? 0) + str;

    // Союзник осаждает — фиксируем цель осады
    if (a.siege_id) {
      const siege = (GAME_STATE.sieges ?? []).find(s => s.id === a.siege_id);
      if (siege?.region_id) allySiegeTargets.add(siege.region_id);
    }
    // Союзник в движении — фиксируем куда идёт
    if (a.state === 'marching' && a.march_target) {
      allyMoveTargets.add(a.march_target);
    }
  }
  return { allyStrByRegion, allySiegeTargets, allyMoveTargets };
}

/**
 * Возвращает Set идентификаторов столичных регионов для списка наций.
 * Проверяет nation.capital (строка regionId) и region.is_capital (флаг).
 */
function _getCapitalRegions(nationIds) {
  const capitals = new Set();
  for (const nid of nationIds) {
    const nation = GAME_STATE.nations?.[nid];
    if (nation?.capital) capitals.add(nation.capital);
  }
  // Дополнительно — регионы с флагом is_capital
  for (const [rid, r] of Object.entries(GAME_STATE.regions ?? {})) {
    if (r.is_capital) capitals.add(rid);
  }
  return capitals;
}

/**
 * Сканирует GAME_STATE.armies и возвращает суммарную силу вражеских армий
 * по регионам, которые видны в радиусе (nearby).
 * Результат: { regionId: totalStrength }
 */
function _scanEnemyArmies(nearby, enemies) {
  const result  = {};
  const armies  = GAME_STATE.armies ?? [];
  for (const a of armies) {
    if (a.state === 'disbanded') continue;
    if (!enemies.includes(a.nation)) continue;
    if (!nearby[a.position]) continue;
    const terrain = nearby[a.position]?.terrain ?? 'plains';
    const str = _armyStrength(a, terrain);
    result[a.position] = (result[a.position] ?? 0) + str;
  }
  return result;
}

/**
 * Находит регион врага за пределами радиуса BFS (для дальних маршей).
 * Берёт случайный регион нации-цели из приказа или первого врага.
 */
/**
 * Многошаговый путь к стратегической цели.
 * Возвращает ПЕРВЫЙ шаг маршрута (сосед армии), а не саму цель.
 *
 * Логика выбора цели:
 *   1. Регион из приказа (если указан)
 *   2. Столица ближайшего врага
 *   3. Самый богатый/крупный регион врага (по population)
 *
 * Маршрут: BFS от позиции армии до цели, без вражеских армий на пути
 * (осторожный командир обходит регионы с сильным врагом).
 */
function _findDistantEnemy(army, order, enemies) {
  // ── Выбираем стратегическую цель ─────────────────────────────────
  let goalId = null;

  if (order?.target_id) {
    const tNation = GAME_STATE.nations?.[order.target_id];
    if (tNation?.capital) { goalId = tNation.capital; }
    else if (tNation?.regions?.length) { goalId = tNation.regions[0]; }
    else if (GAME_STATE.regions?.[order.target_id]) { goalId = order.target_id; }
  }

  if (!goalId) {
    // Ищем столицу ближайшего врага
    for (const enemyId of enemies) {
      const cap = GAME_STATE.nations?.[enemyId]?.capital;
      if (cap && GAME_STATE.regions?.[cap]) { goalId = cap; break; }
    }
  }

  if (!goalId) {
    // Самый богатый регион врага
    let bestPop = -1;
    for (const [rid, r] of Object.entries(GAME_STATE.regions ?? {})) {
      if (!enemies.includes(r.nation)) continue;
      const pop = r.population ?? 0;
      if (pop > bestPop) { bestPop = pop; goalId = rid; }
    }
  }

  if (!goalId || goalId === army.position) return null;

  // ── BFS от позиции к цели, возвращаем первый шаг ─────────────────
  const queue   = [[army.position, null]]; // [текущий, первый шаг]
  const visited = new Set([army.position]);
  const MAX_BFS = 60;
  let steps = 0;

  while (queue.length > 0 && steps++ < MAX_BFS) {
    const [cur, firstStep] = queue.shift();
    const r = GAME_STATE.regions?.[cur] ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[cur] : null);

    for (const next of (r?.connections ?? [])) {
      if (visited.has(next)) continue;
      visited.add(next);

      const nr = GAME_STATE.regions?.[next] ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[next] : null);
      if (nr?.mapType === 'Ocean') continue;

      // Блокировка линией крепостей (не блокируем саму цель — надо осадить)
      if (next !== goalId && typeof _isFortressLineBlocked === 'function') {
        if (_isFortressLineBlocked(next, army.nation)) continue;
      }

      const step = firstStep ?? next; // первый шаг от стартовой позиции
      if (next === goalId) return step;

      queue.push([next, step]);
    }
  }

  // BFS не дошёл — отдаём саму цель (orders engine разберётся)
  return goalId;
}

/**
 * Обнаруживает возможность клещей: союзная армия в радиусе 2 нацелена
 * на ту же вражескую цель → скоординированный удар с двух сторон.
 * @returns {{ isPincer, pincerTarget, allies }}
 */
function _detectPincerOpportunity(army, nearby, enemies) {
  // targetId → [armyId, ...]
  const targetToAllies = {};

  for (const a of (GAME_STATE.armies ?? [])) {
    if (a.state === 'disbanded') continue;
    if (a.nation !== army.nation) continue;
    if (a.id === army.id) continue;

    // Союзник должен быть в радиусе 2 регионов
    const dist = _bfsDistanceInNearby(army.position, a.position, nearby);
    if (dist > 2) continue;

    // Определяем цель союзника (марш или осада)
    let allyTarget = a.march_target ?? null;
    if (!allyTarget && a.siege_id) {
      const siege = (GAME_STATE.sieges ?? []).find(s => s.id === a.siege_id);
      allyTarget = siege?.region_id ?? null;
    }
    if (!allyTarget) continue;

    if (!targetToAllies[allyTarget]) targetToAllies[allyTarget] = [];
    targetToAllies[allyTarget].push(a.id ?? a.name ?? 'unknown');
  }

  // Найти вражескую цель в радиусе, на которую нацелен союзник → клещи
  for (const [targetId, alliedIds] of Object.entries(targetToAllies)) {
    if (!nearby[targetId]) continue;
    if (!enemies.includes(nearby[targetId].nation)) continue;
    return { isPincer: true, pincerTarget: targetId, allies: alliedIds };
  }

  return { isPincer: false, pincerTarget: null, allies: [] };
}
