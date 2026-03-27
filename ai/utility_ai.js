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

  // ── 2. Набираем кандидатов и считаем score для каждого ───────────────
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
        score:     _scoreStorm(army, activeSiege, mods, readiness),
        reasoning: _phrase('storm'),
      });
    }
    // Продолжить осаду (не штурм)
    candidates.push({
      action:    'siege',
      target_id: null,
      score:     _scoreSiege(army, activeSiege, mods, readiness),
      reasoning: `Продолжать осаду ${activeSiege.region_name} (${Math.round(activeSiege.progress)}%).`,
    });
  }

  // Атаковать вражеские регионы в радиусе
  for (const [rid, region] of Object.entries(nearby)) {
    if (rid === army.position) continue;
    if (!enemies.includes(region.nation)) continue;

    const sc = _scoreAttack(army, region, nearby, mods, readiness);
    if (sc > 5) {
      const isOpen = region.fortress === 0 && region.garrison < 300;
      candidates.push({
        action:    'move',
        target_id: rid,
        score:     sc,
        reasoning: isOpen ? _phrase('attack_open') : _phrase('attack_fortified'),
      });
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

  // ── 3. Выбираем действие с максимальным score ─────────────────────
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
 * Score для движения к вражескому региону.
 * Учитывает: ценность цели, соотношение сил, дальность, укреплённость.
 */
function _scoreAttack(army, targetRegion, nearby, mods, readiness) {
  // Ценность типа региона
  const regionValue = UAI_REGION_VALUE[targetRegion.terrain] ?? 0.40;
  const valueScore  = regionValue * UAI_W.target_value;

  // Соотношение сил: сила армии vs гарнизон
  const armyStr  = _armyStrength(army, targetRegion.terrain);
  const garrison = Math.max(targetRegion.garrison, 50);
  const ratio    = Math.min(armyStr / garrison, 8.0);
  // Нелинейная кривая: ratio=1 → 0.35, ratio=3 → 0.75, ratio=6 → 0.95
  const weakScore = (1 - 1 / (1 + ratio * 0.3)) * UAI_W.enemy_weakness;

  // Штраф за укреплённость
  const fortPenalty = -(targetRegion.fortress * 0.18) * UAI_W.fortress_penalty;

  // Штраф за дальность
  const dist      = _bfsDistanceInNearby(army.position, targetRegion.id, nearby);
  const distPenalty = -(dist * 0.09) * UAI_W.distance;

  // Боеготовность армии
  const readScore = readiness * UAI_W.readiness;

  // Бонус за крупное население (богатая добыча)
  const popBonus = Math.min(targetRegion.population / 15000, 1.0) * UAI_W.population_bonus;

  let score = valueScore + weakScore + fortPenalty + distPenalty + readScore + popBonus;

  // Модификаторы личности
  score *= mods.attack_mult;

  // Тактик предпочитает слабые незащищённые цели
  if (targetRegion.fortress === 0 && targetRegion.garrison < 200) {
    score *= mods.prefer_weak_bonus;
  }

  // Мастер осады избегает открытых городов (предпочитает брать в осаду)
  if (mods.siege_specialist && targetRegion.fortress === 0) {
    score *= 0.75;
  }

  return Math.max(0, score);
}

/**
 * Score для штурма крепости.
 * Высокий прогресс осады и агрессивный командир = высокий score.
 */
function _scoreStorm(army, siege, mods, readiness) {
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

  return Math.max(0, score);
}

/**
 * Score для продолжения осады (не штурм).
 * Осадные специалисты, хорошее снабжение, сильные укрепления → выше score.
 */
function _scoreSiege(army, siege, mods, readiness) {
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
 * Находит регион врага за пределами радиуса BFS (для дальних маршей).
 * Берёт случайный регион нации-цели из приказа или первого врага.
 */
function _findDistantEnemy(army, order, enemies) {
  // Сначала пробуем цель из приказа
  if (order?.target_id) {
    const tNation = GAME_STATE.nations?.[order.target_id];
    if (tNation) {
      const regions = tNation.regions ?? [];
      if (regions.length > 0) return regions[0];
    }
    if (GAME_STATE.regions?.[order.target_id]) return order.target_id;
  }

  // Иначе — первый регион первого врага
  for (const enemyId of enemies) {
    const eNation = GAME_STATE.nations?.[enemyId];
    const regions = eNation?.regions ?? [];
    if (regions.length > 0) return regions[0];
  }
  return null;
}
