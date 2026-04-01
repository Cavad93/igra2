// ══════════════════════════════════════════════════════════════════════
// GOVERNMENT ENGINE — живая система форм правления
// Главный принцип: код считает механику, Claude интерпретирует людей.
// ══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
// ХОД: вызывается из turn.js для всех наций
// ──────────────────────────────────────────────────────────────────────

function processAllGovernmentTicks() {
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    processGovernmentTick(nationId);
  }
  // Senate lazy materialization (async, fire-and-forget)
  processSenateTickForAllNations();
}

function processGovernmentTick(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov = nation.government;
  if (!gov) return;

  const isPlayer = nationId === GAME_STATE.player_nation;

  // 1. Decay ресурса власти
  if (gov.power_resource) {
    gov.power_resource.current = Math.max(0,
      gov.power_resource.current - (gov.power_resource.decay_per_turn ?? 0.5)
    );
    // Синхронизируем legitimacy с ресурсом власти
    if (['legitimacy', 'divine_mandate'].includes(gov.power_resource.type)) {
      gov.legitimacy = Math.round(gov.power_resource.current);
    }
  }

  // 2. Ограничения по типу правления
  if (gov.type === 'tyranny') {
    gov.legitimacy = Math.min(gov.legitimacy, 40);  // легитимность тирании ≤ 40
    if (gov.power_resource?.type === 'fear') {
      gov.power_resource.current = Math.max(0,
        gov.power_resource.current - (gov.power_resource.decay_per_turn ?? 2)
      );
    }
  }

  // 3. Заговоры (тирания)
  if (gov.conspiracies) {
    // Затраты тайной полиции (перенесено в processSecretPoliceTick — здесь убрано во избежание двойного списания)
    const chance = calculateConspiracyChance(nation);
    if (Math.random() < chance) {
      triggerConspiracy(nationId);
    }
  }

  // 3.1 GOV_008: Личная гвардия тирана
  if (gov.type === 'tyranny') {
    processPersonalGuardTick(nation, nationId, isPlayer);
  }

  // 3.2 GOV_008: Тайная полиция — раз в 5 ходов генерирует донос
  if (gov.conspiracies?.secret_police?.enabled && (GAME_STATE.turn ?? 0) % 5 === 0) {
    processSecretPoliceTick(nation, nationId, isPlayer);
  }

  // 4. Накопленное недовольство при олигархии (закрытое гражданство)
  if (gov.citizenship?.closed) {
    nation.population.happiness = Math.max(0,
      nation.population.happiness - (gov.citizenship.commoner_resentment_per_turn ?? 1)
    );
  }

  // 5. Обратный отсчёт выборов
  if (gov.elections?.enabled && gov.elections.next_election > 0) {
    gov.elections.next_election--;
    if (gov.elections.next_election === 0) {
      triggerElection(nationId);
      gov.elections.next_election = gov.elections.frequency_turns ?? 12;
    } else if (isPlayer && gov.elections.next_election <= 3) {
      addEventLog(`⚖️ До выборов осталось ${gov.elections.next_election} ход(а).`, 'info');
    }
  }

  // 6. Племя — давление войной на вождя (GOV_010)
  if (gov.type === 'tribal') {
    processTribalTick(nation, nationId, isPlayer);
  }

  // 6.5. Теократия — divine_mandate и оракул
  if (gov.type === 'theocracy') {
    processTheocracyTick(nation, nationId, isPlayer);
  }

  // GOV_007: Инициализируем кандидатов-претендентов для монархий (один раз)
  if (['monarchy', 'tyranny', 'tribal'].includes(gov.type) && gov.succession?.tracked) {
    initSuccessionCandidates(nationId);
  }

  // 6.6. Демократия — народная популярность и гражданские свободы
  if (gov.type === 'democracy') {
    processDemocracyTick(nation, nationId, isPlayer);
  }

  // 7. Переход между формами правления
  if (gov.active_transition?.status === 'in_progress') {
    processTransition(nationId);
  }

  // 8. Кастомные механики (trigger: every_turn)
  applyCustomMechanics(nationId, 'every_turn');

  // 9. Распад стабильности при низкой легитимности
  if (gov.legitimacy < 20) {
    gov.stability = Math.max(0, (gov.stability ?? 50) - 2);
    if (isPlayer && GAME_STATE.turn % 3 === 0) {
      addEventLog('⚠️ Легитимность власти опасно мала. Государство шатается.', 'danger');
    }
  }

  // 10. Пересчёт личной власти правителя
  if (gov.ruler) {
    gov.ruler.personal_power = calculatePersonalPower(nationId);

    // Сильная власть поддерживает легитимность; слабая — подрывает
    const pp = gov.ruler.personal_power;
    if (pp > 70) {
      if (gov.power_resource && ['legitimacy','divine_mandate'].includes(gov.power_resource.type)) {
        gov.power_resource.current = Math.min(100, gov.power_resource.current + 0.3);
      }
      gov.legitimacy = Math.min(100, (gov.legitimacy ?? 50) + 0.3);
    } else if (pp < 25) {
      if (gov.power_resource && ['legitimacy','divine_mandate'].includes(gov.power_resource.type)) {
        gov.power_resource.current = Math.max(0, gov.power_resource.current - 0.5);
      }
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 0.5);
    }

    // Очень слабая власть → нестабильность
    if (pp < 20) {
      gov.stability = Math.max(0, (gov.stability ?? 50) - 1);
      if (isPlayer && GAME_STATE.turn % 4 === 0) {
        addEventLog('😟 Личная власть правителя ничтожна. Фракции борются за влияние.', 'warning');
      }
    }
  }

  // 10.5. Религиозное влияние на легитимность и стабильность
  if (typeof getReligionBonus === 'function') {
    const relLegitimacy = getReligionBonus(nationId, 'legitimacy');
    const relStability  = getReligionBonus(nationId, 'stability');
    if (relLegitimacy) {
      gov.legitimacy = Math.min(100, Math.max(0, (gov.legitimacy || 50) + relLegitimacy * 0.1));
    }
    if (relStability) {
      gov.stability = Math.min(100, Math.max(0, (gov.stability || 50) + relStability));
    }

    // Бонус легитимности: правитель разделяет религию большинства столицы
    const capitalRegion = nation.regions?.[0];
    if (capitalRegion) {
      const rr = GAME_STATE.region_religions?.[capitalRegion];
      if (rr) {
        const officialBelief = rr.beliefs?.find(b => b.religion === rr.official);
        if (officialBelief && officialBelief.fervor > 0.5) {
          gov.legitimacy = Math.min(100, (gov.legitimacy || 50) + 0.1);
        } else if (!officialBelief || officialBelief.fervor < 0.2) {
          gov.legitimacy = Math.max(0, (gov.legitimacy || 50) - 0.15);
          if (isPlayer && GAME_STATE.turn % 12 === 0) {
            addEventLog('⚠️ Народ не разделяет веру власти. Легитимность падает.', 'religion');
          }
        }
      }
    }
  }

  // 11. Народные восстания при критически низком счастье
  checkPopularRevolt(nationId, isPlayer);
}

// ──────────────────────────────────────────────────────────────────────
// НАРОДНЫЕ ВОССТАНИЯ
// ──────────────────────────────────────────────────────────────────────

function checkPopularRevolt(nationId, isPlayer) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const happiness = nation.population.happiness ?? 50;

  // Накапливаем «давление восстания»
  if (!nation._revolt_pressure) nation._revolt_pressure = 0;

  if (happiness < 10) {
    nation._revolt_pressure += 15;
  } else if (happiness < 20) {
    nation._revolt_pressure += 8;
  } else if (happiness < 30) {
    nation._revolt_pressure += 3;
  } else {
    // Счастье нормальное — давление спадает
    nation._revolt_pressure = Math.max(0, nation._revolt_pressure - 2);
    return;
  }

  // Восстание происходит при достижении порога + случайный фактор
  const revoltThreshold = 60;
  if (nation._revolt_pressure < revoltThreshold) {
    if (isPlayer && nation._revolt_pressure > 30 && GAME_STATE.turn % 4 === 0) {
      addEventLog(
        `⚠️ Народное недовольство нарастает (давление: ${Math.round(nation._revolt_pressure)}/${revoltThreshold}). Счастье: ${happiness}%.`,
        'warning'
      );
    }
    return;
  }

  // Восстание! Сбрасываем давление
  nation._revolt_pressure = 0;

  // Последствия восстания
  const gov = nation.government;
  gov.stability    = Math.max(0, (gov.stability    ?? 50) - 20);
  gov.legitimacy   = Math.max(0, (gov.legitimacy   ?? 50) - 15);
  nation.military.loyalty = Math.max(0, (nation.military.loyalty ?? 50) - 10);

  if (isPlayer) {
    addEventLog(
      `🔥 НАРОДНОЕ ВОССТАНИЕ! Счастье ${happiness}%. Стабильность −20, легитимность −15, лояльность армии −10.`,
      'danger'
    );
  }

  // Если несколько регионов — мятежники могут захватить один
  if (nation.regions.length > 1 && Math.random() < 0.35) {
    const lostIdx     = Math.floor(Math.random() * nation.regions.length);
    const lostRegion  = nation.regions.splice(lostIdx, 1)[0];
    const regionName  = MAP_REGIONS?.[lostRegion]?.name ?? lostRegion;

    if (isPlayer) {
      addEventLog(
        `🏚️ Регион ${regionName} охвачен восстанием и вышел из-под контроля!`,
        'danger'
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// КРИЗИС НАСЛЕДОВАНИЯ
// Вызывается из turn.js при гибели правителя.
// ──────────────────────────────────────────────────────────────────────

function triggerSuccessionCrisis(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  const gov    = nation.government;
  const isPlayer = nationId === GAME_STATE.player_nation;

  // Не применяется к республикам/советам — там выборы
  if (['republic', 'oligarchy', 'democracy'].includes(gov.type)) return;

  if (!gov.succession?.tracked) return;

  // GOV_007: Сначала проверяем массив кандидатов-претендентов
  const succCandidates = gov.succession.candidates ?? [];
  const strongCandidates = succCandidates.filter(c => (c.claim_strength ?? 0) > 50);

  if (strongCandidates.length >= 2) {
    // Война за престол
    gov.stability  = Math.max(0, (gov.stability  ?? 50) - 40);
    gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 30);
    if (nation.military) nation.military.loyalty = Math.max(0, (nation.military.loyalty ?? 50) - 20);
    // Армия выбирает сторону случайным образом
    const winner = strongCandidates[Math.floor(Math.random() * strongCandidates.length)];
    const losers = strongCandidates.filter(c => c !== winner);
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name = winner.name;
    if (winner.id) gov.ruler.character_id = winner.id;
    // Убираем победившего из претендентов, остальные сильные уходят в оппозицию
    gov.succession.candidates = succCandidates.filter(c => c !== winner);
    gov.succession.heir = null;
    if (isPlayer) {
      const loserNames = losers.map(c => c.name).join(' и ');
      addEventLog(
        `⚔️ ВОЙНА ЗА ПРЕСТОЛ! ${strongCandidates.map(c => c.name).join(' и ')} \
претендовали на корону. После кровопролитной борьбы ${winner.name} занял трон. \
${loserNames ? loserNames + ' уходят в оппозицию. ' : ''}\
Стабильность −40, легитимность −30.`,
        'danger'
      );
    }
    return;
  }

  if (strongCandidates.length === 1) {
    // Единственный сильный претендент — автоматическое наследование
    const claimant = strongCandidates[0];
    gov.stability  = Math.max(0, (gov.stability  ?? 50) - 15);
    gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 10);
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name = claimant.name;
    if (claimant.id) gov.ruler.character_id = claimant.id;
    gov.succession.candidates = succCandidates.filter(c => c !== claimant);
    gov.succession.heir = null;
    if (isPlayer) {
      addEventLog(
        `👑 ${claimant.name} унаследовал трон — единственный законный претендент. \
Переход власти прошёл без крупных столкновений. Стабильность −15.`,
        'character'
      );
    }
    return;
  }

  // Проверяем старый стиль — назначенный наследник через wants
  const oldHeir = (nation.characters ?? []).find(c =>
    c.alive && (c.wants ?? []).some(w => String(w).includes('наследник') || String(w).includes('heir'))
  );

  if (oldHeir) {
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name = oldHeir.name;
    gov.ruler.character_id = oldHeir.id;
    gov.legitimacy = Math.max(20, (gov.legitimacy ?? 50) - 10);
    if (isPlayer) {
      addEventLog(`👑 ${oldHeir.name} занял трон. Переход власти прошёл без потрясений.`, 'character');
    }
    return;
  }

  // Нет претендентов → кризис регентства
  gov.stability  = Math.max(0, (gov.stability  ?? 50) - 25);
  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 20);
  if (nation.military) nation.military.loyalty = Math.max(0, (nation.military.loyalty ?? 50) - 15);

  // Пробуем назначить регента из советников
  const advisors = (nation.characters ?? []).filter(c => c.alive)
    .sort((a, b) => (b.traits?.loyalty ?? 0) - (a.traits?.loyalty ?? 0));

  if (advisors.length) {
    const regent = advisors[0];
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name = `Регент ${regent.name}`;
    gov.ruler.character_id = regent.id;
    gov.succession.regent_active = true;
    if (isPlayer) {
      addEventLog(
        `⚖️ КРИЗИС РЕГЕНТСТВА: правитель мёртв, наследника нет! \
${regent.name} назначен временным регентом. \
Стабильность −25, легитимность −20. Немедленно назначьте наследника!`,
        'danger'
      );
    }
  } else {
    if (isPlayer) {
      addEventLog(
        '💀 КРИЗИС НАСЛЕДОВАНИЯ: правитель мёртв, наследника нет! '
        + 'Стабильность −25, легитимность −20, лояльность армии −15. '
        + 'Фракции тянутся к власти.',
        'danger'
      );
    }
    // Узурпатор из самых честолюбивых
    const usurpers = (nation.characters ?? []).filter(c => c.alive)
      .sort((a, b) => (b.traits?.ambition ?? 0) - (a.traits?.ambition ?? 0));
    if (usurpers.length) {
      const usurper = usurpers[0];
      gov.ruler = gov.ruler ?? {};
      gov.ruler.name         = usurper.name;
      gov.ruler.character_id = usurper.id;
      if (isPlayer) {
        addEventLog(`⚔️ ${usurper.name} захватил власть силой. Государство нестабильно.`, 'danger');
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// GOV_007: ПРЕТЕНДЕНТЫ НА ТРОН
// ──────────────────────────────────────────────────────────────────────

// Имена для автогенерации претендентов по культуре нации
const SUCCESSION_NAMES_BY_CULTURE = {
  greek:   ['Антиох', 'Птолемей', 'Деметрий', 'Пердикка', 'Лисандр', 'Никомед', 'Аттал'],
  roman:   ['Марк', 'Луций', 'Гней', 'Публий', 'Тит', 'Гай', 'Квинт'],
  persian: ['Артабаз', 'Мазей', 'Фрада', 'Оронт', 'Митридат', 'Арсам'],
  celtic:  ['Верцинготорикс', 'Думнорикс', 'Амбиорикс', 'Коммий', 'Кассивелаун'],
  default: ['Арион', 'Корвус', 'Мелас', 'Таурос', 'Дракон', 'Силас', 'Аркас'],
};

/**
 * Инициализирует массив кандидатов-претендентов для монархии.
 * Вызывается один раз, если candidates ещё не задан.
 */
function initSuccessionCandidates(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  const gov = nation.government;
  if (!gov?.succession) return;
  if (gov.succession.candidates) return; // уже инициализировано

  const chars  = (nation.characters ?? []).filter(c => c.alive && c.id !== gov.ruler?.character_id);
  const culture = nation.culture ?? 'default';
  const namePool = SUCCESSION_NAMES_BY_CULTURE[culture] ?? SUCCESSION_NAMES_BY_CULTURE.default;

  // 1-3 претендента
  const count = Math.min(3, Math.max(1, Math.floor(Math.random() * 3) + 1));
  const candidates = [];

  for (let i = 0; i < count; i++) {
    if (chars[i]) {
      candidates.push({
        id:               chars[i].id,
        name:             chars[i].name,
        claim_strength:   40 + Math.floor(Math.random() * 35),
        support_factions: [],
        age:              chars[i].age ?? (18 + Math.floor(Math.random() * 35)),
        loyalty:          chars[i].traits?.loyalty ?? (35 + Math.floor(Math.random() * 40)),
      });
    } else {
      const name = namePool[Math.floor(Math.random() * namePool.length)];
      candidates.push({
        id:               `cand_${nationId}_${i}_${GAME_STATE.turn ?? 0}`,
        name:             name,
        claim_strength:   25 + Math.floor(Math.random() * 50),
        support_factions: [],
        age:              18 + Math.floor(Math.random() * 40),
        loyalty:          25 + Math.floor(Math.random() * 50),
      });
    }
  }

  gov.succession.candidates = candidates;
}

/**
 * Назначает претендента официальным наследником.
 * Стоимость: 20 легитимности.
 * @param {string} nationId
 * @param {string} candidateId
 * @returns {{ ok: boolean, reason?: string }}
 */
function appointSuccessionHeir(nationId, candidateId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return { ok: false, reason: 'no_nation' };
  const gov = nation.government;
  if (!gov?.succession?.tracked) return { ok: false, reason: 'no_succession' };

  const COST = 20;
  if ((gov.legitimacy ?? 0) < COST) return { ok: false, reason: 'no_legitimacy' };

  const candidates = gov.succession.candidates ?? [];
  const candidate  = candidates.find(c => c.id === candidateId);
  if (!candidate) return { ok: false, reason: 'no_candidate' };

  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - COST);
  gov.succession.heir = candidateId;
  candidate.claim_strength = Math.min(100, (candidate.claim_strength ?? 50) + 20);
  // Снимаем флаг регентства если был
  gov.succession.regent_active = false;

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(
      `👑 ${candidate.name} торжественно провозглашён наследником. \
Претензия +20. Легитимность −${COST}.`,
      'character'
    );
    if (typeof renderGovernmentOverlay === 'function') renderGovernmentOverlay();
  }
  return { ok: true };
}

/**
 * Организует брак претендента, укрепляя его права.
 * Стоимость: 50 золота.
 * @param {string} nationId
 * @param {string} candidateId
 * @returns {{ ok: boolean, reason?: string }}
 */
function arrangeMarriageForClaimant(nationId, candidateId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return { ok: false, reason: 'no_nation' };
  const gov = nation.government;

  const candidates = gov.succession?.candidates ?? [];
  const candidate  = candidates.find(c => c.id === candidateId);
  if (!candidate) return { ok: false, reason: 'no_candidate' };

  const GOLD_COST = 50;
  if ((nation.economy?.treasury ?? 0) < GOLD_COST) return { ok: false, reason: 'no_gold' };

  nation.economy.treasury -= GOLD_COST;
  candidate.claim_strength = Math.min(100, (candidate.claim_strength ?? 50) + 15);
  candidate.loyalty        = Math.min(100, (candidate.loyalty ?? 50) + 10);
  candidate.married        = true;

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(
      `💍 Брак ${candidate.name} заключён. Претензия на трон +15, лояльность +10. \
Стоимость: −${GOLD_COST} золота.`,
      'character'
    );
    if (typeof renderGovernmentOverlay === 'function') renderGovernmentOverlay();
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// ЛИЧНАЯ ВЛАСТЬ ПРАВИТЕЛЯ
// ──────────────────────────────────────────────────────────────────────
//
// Формула учитывает:
//  1. Базу по типу правления
//  2. Легитимность (мандат народа)
//  3. Ресурс власти: страх, военная лояльность, престиж, богатство
//  4. Поддержку армии (для единоличных правителей)
//  5. Доминирование фракции (для советов)
//  6. Штраф за активные заговоры
//  7. Штраф за оппозицию в Сенате
//
// Результат: 0–100
//   0-24  — ничтожная власть, государство нестабильно
//  25-44  — слабая: трудно проводить законы
//  45-69  — нормальная: стандартный ход дел
//  70-84  — сильная: законы проходят легче, заговоры реже
//  85-100 — тираническая: безграничная воля, но опасность переворота

function calculatePersonalPower(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?.ruler) return 25;

  const ruler   = gov.ruler;
  const govType = gov.type ?? 'republic';

  // 1. База по типу правления
  const BASE = { tyranny: 50, monarchy: 45, theocracy: 40, tribal: 35,
                 oligarchy: 20, republic: 15 };
  let power = BASE[govType] ?? 25;

  // 2. Легитимность: каждый пункт выше 50 = +0.35; ниже = -0.35
  const legitimacy = gov.legitimacy ?? 50;
  power += Math.round((legitimacy - 50) * 0.35);

  // 3. Ресурс власти
  if (gov.power_resource) {
    const pr = gov.power_resource.current ?? 50;
    const mult = { fear: 0.20, military_loyalty: 0.15, prestige: 0.12,
                   wealth: 0.10, divine_mandate: 0.12, legitimacy: 0.08 };
    power += Math.round(pr * (mult[gov.power_resource.type] ?? 0.08));
  }

  // 4. Поддержка армии (только единоличный правитель)
  if (ruler.type === 'person') {
    const armyLoy = nation.military?.loyalty ?? 50;
    if      (armyLoy > 70) power += 10;
    else if (armyLoy < 30) power -= 15;
    else                   power += Math.round((armyLoy - 50) * 0.2);
  }

  // 5. Доминирование фракции (только совет)
  if (ruler.type === 'council') {
    const mgr = typeof getSenateManager === 'function' ? getSenateManager(nationId) : null;
    if (mgr && mgr.senators.length > 0) {
      const stats = mgr.getFactionStats();
      const total = mgr.senators.length;
      const maxSeats = Math.max(...mgr.factions.map(f => stats[f.id]?.seats ?? 0));
      const dom = (maxSeats / total) * 100;
      if      (dom > 55) power += 15;   // абсолютное большинство
      else if (dom > 40) power +=  5;   // относительное большинство
      else               power -= 10;   // фрагментированный совет
    }
  }

  // 6. Штраф за активные заговоры
  const activeConsp = (nation.conspiracies ?? []).filter(
    c => ['incubating','growing','detected'].includes(c.status)
  );
  for (const c of activeConsp) {
    power -= 12;
    if (c.preparation > 80) power -= 15;   // переворот на пороге
    else if (c.status === 'growing') power -= 5;
  }

  // 7. Оппозиция в сенате (республика / олигархия)
  if (['republic','oligarchy'].includes(govType)) {
    const mgr = typeof getSenateManager === 'function' ? getSenateManager(nationId) : null;
    if (mgr && mgr.senators.length > 0) {
      const disloyal = mgr.senators.filter(s => s.loyalty_score < 25).length;
      power -= Math.round((disloyal / mgr.senators.length) * 30);
    }
  }

  return Math.max(0, Math.min(100, Math.round(power)));
}

// ──────────────────────────────────────────────────────────────────────
// ЗАГОВОРЫ
// ──────────────────────────────────────────────────────────────────────

function calculateConspiracyChance(nation) {
  const gov = nation.government;
  let chance = gov.conspiracies?.base_chance_per_turn ?? 0.15;

  // Высокий страх снижает вероятность заговора
  if (gov.power_resource?.type === 'fear') {
    const fear = gov.power_resource.current ?? 50;
    chance *= Math.max(0.2, 1 - fear / 150);
  }

  // Пустая казна — повышает
  if (nation.economy.treasury < 2000)  chance += 0.08;
  if (nation.economy.treasury < 0)     chance += 0.15;

  // Низкая лояльность армии — повышает
  if (nation.military.loyalty < 40)    chance += 0.10;
  if (nation.military.loyalty < 20)    chance += 0.15;

  // GOV_008: Личная гвардия снижает риск — defense += personal_guard.size × 0.4
  if (gov.personal_guard && gov.personal_guard.size > 0) {
    const guardDefense = gov.personal_guard.size * 0.4 * (gov.personal_guard.loyalty / 100);
    chance *= Math.max(0.1, 1 - guardDefense / 150);
  }

  // Тайная полиция — снижает
  if (gov.conspiracies?.secret_police?.enabled) {
    chance *= (1 - (gov.conspiracies.secret_police.conspiracy_detection_bonus ?? 0.4));
  }

  // Личная власть: сильный правитель давит заговоры, слабый — провоцирует
  const pp = gov.ruler?.personal_power ?? 50;
  if      (pp > 75) chance *= 0.50;   // страшно плести интриги
  else if (pp < 25) chance *= 1.80;   // все чуют слабость
  else if (pp < 40) chance *= 1.30;   // повышенный риск

  return Math.max(0, Math.min(0.85, chance));
}

function triggerConspiracy(nationId) {
  if (nationId !== GAME_STATE.player_nation) return;

  const nation = GAME_STATE.nations[nationId];
  const gov    = nation.government;

  const events = [
    { text: 'Раскрыт заговор аристократов. Несколько семей арестованы.', fear: +12, loyalty: -4 },
    { text: 'Попытка покушения отражена личной гвардией. Убийца схвачен.', fear: +15, loyalty: -8 },
    { text: 'Группа офицеров замышляла переворот. Заговор раскрыт доносчиком.', fear: +10, loyalty: -6 },
    { text: 'Слухи о тайном собрании. Часть советников покинула город.', fear: +6, loyalty: -5 },
    { text: 'Перехвачены письма с призывом к восстанию. Адресаты казнены.', fear: +18, loyalty: -10 },
  ];

  const ev = events[Math.floor(Math.random() * events.length)];
  addEventLog(`🗡️ ${ev.text}`, 'danger');

  // Страх растёт от раскрытого заговора
  if (gov.power_resource?.type === 'fear') {
    gov.power_resource.current = Math.min(100, gov.power_resource.current + ev.fear);
  }

  // Лояльность персонажей падает
  (nation.characters ?? []).forEach(c => {
    if (c.alive && Math.random() < 0.4) {
      c.traits.loyalty = Math.max(0, c.traits.loyalty + ev.loyalty);
      if (!c.history) c.history = [];
      c.history.push({ turn: GAME_STATE.turn, event: 'Заговор при дворе. Настроения ухудшились.' });
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// ВЫБОРЫ
// ──────────────────────────────────────────────────────────────────────

// GOV_006: Скандалы на выборах
const ELECTION_SCANDALS = {
  bribery: {
    label: 'взяточничество',
    base_penalty: -25,
    faction_mod: { rich: +10 },
  },
  military_cowardice: {
    label: 'воинская трусость',
    base_penalty: -35,
    faction_mod: { military: -20 },
  },
  foreign_ties: {
    label: 'связи с иноземцами',
    base_penalty: -30,
    faction_mod: { peace: +15 },
  },
};

// GOV_006: Подкуп кандидата до выборов (вызывается из UI)
function bribeElectionCandidate(nationId, candidateId, goldAmount) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation.government;
  if (!gov?.elections?.enabled) return { ok: false, reason: 'no_elections' };

  const treasury = nation.economy?.treasury ?? 0;
  if (treasury < goldAmount) return { ok: false, reason: 'no_gold' };

  nation.economy.treasury -= goldAmount;

  if (!gov.elections.pre_election_bribes) gov.elections.pre_election_bribes = [];
  const existing = gov.elections.pre_election_bribes.find(b => b.candidate_id === candidateId);
  if (existing) {
    existing.bonus += 20;
    existing.total_spent += goldAmount;
  } else {
    gov.elections.pre_election_bribes.push({
      candidate_id: candidateId,
      bonus: 20,
      total_spent: goldAmount,
    });
  }

  addEventLog(`💰 Подкуп кандидата на выборах: потрачено ${goldAmount} золота. Кандидат получает +20 к поддержке.`, 'law');
  return { ok: true };
}

// GOV_006: Стоимость подкупа (50-150 в зависимости от влияния)
function calcBribeCost(candidate) {
  return Math.round(50 + (candidate.influence ?? 40) * 2.5);
}

async function triggerElection(nationId) {
  const nation  = GAME_STATE.nations[nationId];
  const gov     = nation.government;
  const mgr     = getSenateManager(nationId);
  const isPlayer = nationId === GAME_STATE.player_nation;

  // ── Собираем кандидатов из материализованных сенаторов ───────────
  const candidates = mgr
    ? mgr.getMaterialized()
        .filter(s => s.ambition_level >= 3)
        .sort((a, b) =>
          ((b.influence ?? 40) + b.loyalty_score + b.ambition_level * 15) -
          ((a.influence ?? 40) + a.loyalty_score + a.ambition_level * 15)
        )
        .slice(0, 3)
    : [];

  if (!candidates.length) {
    if (isPlayer) addEventLog('⚖️ Выборы: других кандидатов не нашлось. Действующий консул продолжает править.', 'info');
    gov.elections.next_election = gov.elections.frequency_turns;
    return;
  }

  // ── GOV_006: Скандалы (15% шанс за выборы) ──────────────────────
  const scandals = {}; // candidate_id → scandal info
  if (Math.random() < 0.15) {
    const scandalTarget = candidates[Math.floor(Math.random() * candidates.length)];
    const scandalTypes  = Object.keys(ELECTION_SCANDALS);
    const scandalType   = scandalTypes[Math.floor(Math.random() * scandalTypes.length)];
    scandals[scandalTarget.id] = { type: scandalType, ...ELECTION_SCANDALS[scandalType] };
    scandalTarget.scandal_this_election = scandalType;
    if (isPlayer) {
      addEventLog(
        `😱 СКАНДАЛ на выборах! ${scandalTarget.name} обвинён в "${ELECTION_SCANDALS[scandalType].label}". ` +
        `Это повлияет на голосование.`,
        'danger'
      );
    }
  }

  // ── GOV_006: Применяем заранее оплаченные подкупы ───────────────
  const bribes = gov.elections.pre_election_bribes ?? [];

  // ── Голосование сенаторов по каждому кандидату ──────────────────
  const scores = {};
  for (const candidate of candidates) {
    let support = 0;
    if (mgr) {
      for (const senator of mgr.senators) {
        const sameF    = senator.faction_id === candidate.faction_id ? 20 : 0;
        const sameClan = senator.clan_id === candidate.clan_id      ? 15 : 0;
        const base     = senator.loyalty_score * 0.4 + (candidate.influence ?? 40) * 0.3;
        support += base + sameF + sameClan + (Math.random() - 0.5) * 20;
      }
    }

    // GOV_006: Случайность выборов ±30
    support += (Math.random() - 0.5) * 30;

    // GOV_006: Штраф от скандала
    const scandal = scandals[candidate.id];
    if (scandal) {
      support += scandal.base_penalty;
      // Модификатор по фракции (упрощённо: военная фракция = faction_id содержит 'mil')
      if (scandal.faction_mod) {
        const faction = (candidate.faction_id ?? '').toLowerCase();
        if (scandal.faction_mod.rich    && faction.includes('rich'))    support += scandal.faction_mod.rich;
        if (scandal.faction_mod.military && faction.includes('mil'))     support += scandal.faction_mod.military;
        if (scandal.faction_mod.peace   && !gov._last_war_turn)          support += scandal.faction_mod.peace;
      }
    }

    // GOV_006: Бонус от подкупа
    const bribe = bribes.find(b => b.candidate_id === candidate.id);
    if (bribe) support += bribe.bonus;

    scores[candidate.id] = support;
  }

  // Сортируем по итоговому скору
  candidates.sort((a, b) => scores[b.id] - scores[a.id]);
  const winner = candidates[0];
  const losers = candidates.slice(1);

  // ── Применяем результат ──────────────────────────────────────────
  const prevConsul  = gov.elections?.last_consul ?? gov.ruler?.name ?? 'прежний консул';
  const isNewConsul = winner.name !== prevConsul;

  if (isNewConsul) {
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name         = winner.name;
    gov.ruler.character_id = winner.character_id ?? null;
    gov.elections.last_consul = winner.name;

    // Легитимность растёт при честных выборах
    const bribeUsed = bribes.length > 0;
    gov.legitimacy = Math.min(100, (gov.legitimacy ?? 50) + (bribeUsed ? 3 : 8));

    // Проигравшие — -5 лояльности (обида)
    if (mgr) {
      for (const loser of losers) {
        loser.loyalty_score = Math.max(0, loser.loyalty_score - 5);
      }
      mgr._electFactionLeader(winner.faction_id, 'election');
      mgr._recalculateSenateState();
    }
  } else {
    gov.legitimacy = Math.min(100, (gov.legitimacy ?? 50) + 3);
  }

  // GOV_006: Сохраняем итог выборов
  gov.elections.last_result = {
    turn:     GAME_STATE.turn ?? 0,
    winner:   winner.name,
    losers:   losers.map(l => l.name),
    scandals: Object.values(scandals).map(s => s.label),
    bribed:   bribes.length > 0,
    narrative: null,
  };

  // Сброс подкупов на следующие выборы
  gov.elections.pre_election_bribes = [];
  // Сброс скандалов с кандидатов
  for (const c of candidates) delete c.scandal_this_election;

  if (isPlayer) {
    const candidateNames = candidates.map(c => c.name).join(', ');
    const loserNames     = losers.map(l => l.name).join(', ');
    addEventLog(
      `⚖️ ВЫБОРЫ КОНСУЛА: кандидаты — ${candidateNames}. Победитель: ${winner.name}. ` +
      `Проигравшие: ${loserNames || 'нет'}. Легитимность ${isNewConsul ? '+8' : '+3'}.`,
      'law'
    );
  }

  gov.elections.next_election = gov.elections.frequency_turns;

  // GOV_006: Нарратив от Claude Haiku (асинхронно)
  _generateElectionNarrative(nationId, winner, losers, scandals).catch(() => {});
}

// GOV_006: Генерация нарратива выборов через Claude Haiku
async function _generateElectionNarrative(nationId, winner, losers, scandals) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?.elections?.last_result) return;

  const scandalTexts = Object.values(scandals).map(s => s.label).join(', ');
  const loserNames   = losers.map(l => l.name).join(', ');

  const systemPrompt =
    'Ты — летописец в исторической стратегической игре об античности. ' +
    'Напиши ОДНО предложение (не более 120 символов) об итогах выборов консула. ' +
    'Стиль: лаконичная историческая хроника. Без кавычек и пояснений. Язык: русский.';

  const scandalNote = scandalTexts ? `. Соперника обвинили в "${scandalTexts}"` : '';
  const userPrompt  =
    `Победитель: ${winner.name}. Проигравшие: ${loserNames || 'нет'}${scandalNote}. Нация: ${nation.name ?? nationId}.`;

  let narrative;
  try {
    if (typeof callClaude === 'function') {
      const raw = await callClaude(systemPrompt, userPrompt, 80, CONFIG?.MODEL_HAIKU ?? 'claude-haiku-4-5-20251001');
      narrative = (raw || '').trim().slice(0, 150);
    }
  } catch (_) { /* fallback */ }

  if (!narrative) {
    const scandalFallback = scandalTexts
      ? `${winner.name} победил после того, как его соперника обвинили в "${scandalTexts}".`
      : `${winner.name} одержал победу на выборах и занял должность консула.`;
    narrative = scandalFallback;
  }

  if (gov.elections.last_result) {
    gov.elections.last_result.narrative = narrative;
  }

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(`📜 Летопись: ${narrative}`, 'info');
  }
}

// ──────────────────────────────────────────────────────────────────────
// ПЕРЕХОД МЕЖДУ ФОРМАМИ
// ──────────────────────────────────────────────────────────────────────

/**
 * GOV_009: Высокоуровневый триггер перехода правления с типизированными эффектами.
 * cause: 'coup' | 'revolution' | 'reform' | 'conquest'
 */
function triggerGovernmentTransition(nationId, fromType, toType, cause) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.government) return;
  const gov    = nation.government;
  const isPlayer = nationId === GAME_STATE.player_nation;

  // Карта немедленных эффектов по типу причины
  const CAUSE_EFFECTS = {
    coup: {
      stability:  -50,
      legitimacy: -40,
      army_split: true,   // армия делится на стороны
      label: 'Военный переворот',
      icon: '⚔️',
      penalties: { stability: -5, army_loyalty: -4, legitimacy: -3 },
    },
    revolution: {
      stability:  -60,
      treasury_pct: -0.30, // −30% казны
      label: 'Народное восстание',
      icon: '🔥',
      penalties: { stability: -6, army_loyalty: -3, legitimacy: -4 },
    },
    reform: {
      stability:  -15,
      legitimacy_bonus_after: 10, // +10 через 3 хода
      label: 'Мирная реформа',
      icon: '📜',
      penalties: { stability: -2, army_loyalty: -1, legitimacy: -1 },
    },
    conquest: {
      stability:  -30,
      resistance: true,   // resistance_movement = true
      label: 'Навязанная форма правления',
      icon: '🛡️',
      penalties: { stability: -4, army_loyalty: -3, legitimacy: -2 },
    },
  };

  const eff = CAUSE_EFFECTS[cause] ?? CAUSE_EFFECTS.reform;

  // 1. Немедленные штрафы
  if (eff.stability)  gov.stability  = Math.max(0, (gov.stability  ?? 50) + eff.stability);
  if (eff.legitimacy) gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) + eff.legitimacy);

  if (eff.treasury_pct && nation.economy) {
    nation.economy.treasury = Math.round(
      (nation.economy.treasury ?? 0) * (1 + eff.treasury_pct)
    );
  }

  if (eff.army_split && nation.military) {
    // Армия делится — лояльность резко падает
    const loyBefore = nation.military.loyalty ?? 50;
    nation.military.loyalty = Math.max(0, loyBefore - 30);
    if (isPlayer) {
      addEventLog(
        `⚔️ Переворот: часть армии переходит на сторону мятежников! Лояльность −30.`,
        'danger'
      );
    }
  }

  if (eff.resistance) {
    gov.resistance_movement = true;
    if (isPlayer) {
      addEventLog(
        `🛡️ Завоёванные земли не приняли новый строй. Движение сопротивления активно.`,
        'warning'
      );
    }
  }

  // 2. Флаг переходного периода (экономика и армия работают неполностью)
  gov.in_transition = true;

  // 3. Сохранить причину перехода для последующей генерации нарратива
  gov._pending_transition_cause_type = cause;
  gov._pending_transition_legitimacy_bonus = eff.legitimacy_bonus_after ?? 0;
  gov._pending_transition_legitimacy_turn  = eff.legitimacy_bonus_after
    ? (GAME_STATE.turn ?? 0) + 3
    : null;

  // 4. Запустить механику постепенного перехода с причина-специфичными штрафами
  const causeLabel = `${eff.icon} ${eff.label}`;
  startGovernmentTransition(nationId, toType, causeLabel);

  // Перезаписать штрафы в active_transition (более сильные для переворота/революции)
  if (gov.active_transition) {
    gov.active_transition.transition_penalties = eff.penalties;
    gov.active_transition.cause_type = cause;
  }

  // 5. Уведомление игрока
  if (isPlayer) {
    const fromName = getGovernmentNameFull(fromType);
    const toName   = getGovernmentNameFull(toType);
    addEventLog(
      `${eff.icon} ${eff.label.toUpperCase()}! ${fromName} → ${toName}. ` +
      `Доходы −20%, боеспособность армии −25% до завершения перехода.`,
      'danger'
    );
  }

  // 6. Асинхронная генерация нарратива через Claude Haiku
  _generateTransitionNarrative(nationId, fromType, toType, cause, eff.label);
}

/**
 * Асинхронно генерирует нарратив перехода и сохраняет в transition_history.
 */
async function _generateTransitionNarrative(nationId, fromType, toType, causeType, causeLabel) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.government) return;

  const fromName = getGovernmentNameFull(fromType);
  const toName   = getGovernmentNameFull(toType);

  const CAUSE_CONTEXT = {
    coup:      'военный переворот, армия захватила власть',
    revolution:'народное восстание, улицы охвачены беспорядками',
    reform:    'мирная реформа через законодательный процесс',
    conquest:  'завоеватель навязал новую форму правления',
  };

  const systemPrompt =
    'Ты — летописец исторической стратегической игры об античности. ' +
    'Напиши 2-3 предложения (не более 250 символов) о смене формы правления. ' +
    'Стиль: краткая историческая хроника. Без кавычек и пояснений. Язык: русский.';

  const userPrompt =
    `Нация: ${nation.name ?? nationId}. ` +
    `Переход: ${fromName} → ${toName}. ` +
    `Причина: ${CAUSE_CONTEXT[causeType] ?? causeLabel}.`;

  let narrative = '';
  try {
    if (typeof callClaude === 'function') {
      const raw = await callClaude(systemPrompt, userPrompt, 120, CONFIG?.MODEL_HAIKU ?? 'claude-haiku-4-5-20251001');
      narrative = (raw || '').trim().slice(0, 280);
    }
  } catch (_) { /* fallback */ }

  if (!narrative) {
    const fallbacks = {
      coup:      `${nation.name ?? 'Государство'} потрясено переворотом. Прежняя власть пала под натиском военных. Новая форма правления устанавливается силой.`,
      revolution:`Народный гнев сверг прежний строй. На улицах кровь и хаос. ${toName} рождается из огня восстания.`,
      reform:    `Мудрые реформаторы провели страну через мирный переход. ${toName} утверждён законодательным путём.`,
      conquest:  `Завоеватель диктует новые законы. ${toName} навязан побеждённым. Но в сердцах многих горит пламя сопротивления.`,
    };
    narrative = fallbacks[causeType] ?? `${fromName} уступил место ${toName}.`;
  }

  // Сохранить нарратив — добавить в transition_history последнюю запись
  const gov = nation.government;
  if (!gov.transition_history) gov.transition_history = [];
  // Ищем самую свежую запись без нарратива
  const lastEntry = [...gov.transition_history].reverse().find(e => !e.narrative);
  if (lastEntry) {
    lastEntry.narrative = narrative;
  } else {
    // Или добавляем новую запись с нарративом
    gov.transition_history.push({
      turn:      GAME_STATE.turn ?? 0,
      from:      fromType,
      to:        toType,
      cause:     causeLabel,
      cause_type: causeType,
      narrative,
    });
  }

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(`📜 Летопись перехода: ${narrative}`, 'info');
  }
}

function startGovernmentTransition(nationId, toType, cause) {
  const nation = GAME_STATE.nations[nationId];
  const gov = nation.government;

  gov.active_transition = {
    from: gov.type,
    to: toType,
    status: 'in_progress',
    started_turn: GAME_STATE.turn,
    turns_elapsed: 0,
    cause: cause ?? 'Политическая реформа',
    transition_penalties: { stability: -3, army_loyalty: -2, legitimacy: -2 },
    completion_requires: { legitimacy_of_new_form: 30 },
    opposition: [],
    possible_events: ['military_coup', 'civil_war', 'peaceful_transition', 'compromise_government'],
  };

  // GOV_009: Флаг переходного периода
  gov.in_transition = true;

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(
      `🔄 Начат переход: ${getGovernmentNameFull(gov.type)} → ${getGovernmentNameFull(toType)}. Ожидайте нестабильности.`,
      'warning'
    );
    renderGovernmentOverlay();
  }
}

function processTransition(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation.government;
  const trans  = gov.active_transition;
  if (!trans || trans.status !== 'in_progress') return;

  // GOV_009: Поддерживаем флаг переходного периода
  gov.in_transition = true;

  trans.turns_elapsed = (trans.turns_elapsed ?? 0) + 1;

  // Штрафы переходного периода (каждый ход)
  const pen = trans.transition_penalties ?? {};
  if (pen.stability)    gov.stability    = Math.max(0, (gov.stability ?? 50) + pen.stability);
  if (pen.army_loyalty) nation.military.loyalty = Math.max(0, nation.military.loyalty + pen.army_loyalty);
  if (pen.legitimacy)   gov.legitimacy   = Math.max(0, gov.legitimacy + pen.legitimacy);

  // GOV_009: Бонус легитимности для мирной реформы через 3 хода
  const legBonusTurn = gov._pending_transition_legitimacy_turn;
  if (legBonusTurn && (GAME_STATE.turn ?? 0) >= legBonusTurn && gov._pending_transition_legitimacy_bonus > 0) {
    const bonus = gov._pending_transition_legitimacy_bonus;
    gov.legitimacy = Math.min(100, (gov.legitimacy ?? 50) + bonus);
    gov._pending_transition_legitimacy_bonus = 0;
    gov._pending_transition_legitimacy_turn  = null;
    if (nationId === GAME_STATE.player_nation) {
      addEventLog(`📜 Реформа набирает поддержку: легитимность +${bonus}.`, 'positive');
    }
  }

  // Случайное событие во время перехода (20% шанс)
  if (Math.random() < 0.20 && nationId === GAME_STATE.player_nation) {
    const causeType = trans.cause_type ?? 'reform';
    const evtsMap = {
      coup:      ['Офицеры требуют повышения жалованья.', 'Старые сенаторы уходят в изгнание.', 'Перехвачен гонец с призывом к контрперевороту.', 'Армия присягнула новому режиму.'],
      revolution:['Толпа требует суда над прежними правителями.', 'Мародёры хозяйничают на рынках.', 'Умеренные призывают к переговорам.', 'Иностранные послы покидают столицу.'],
      reform:    ['Аристократы требуют замедлить реформы.', 'Армия сохраняет нейтралитет — пока.', 'Соседние державы с интересом наблюдают за нестабильностью.', 'Народ на улицах поддерживает перемены.'],
      conquest:  ['Местная знать присягает завоевателю.', 'Подпольные ячейки сопротивления собираются.', 'Новый наместник прибыл в столицу.', 'Жрецы сохраняют молчание.'],
    };
    const evts = evtsMap[causeType] ?? evtsMap.reform;
    addEventLog(`🔄 Переход (ход ${trans.turns_elapsed}): ${evts[Math.floor(Math.random()*evts.length)]}`, 'info');
  }

  // Условие завершения: >= 5 ходов И легитимность достигла порога
  const legOk = gov.legitimacy >= (trans.completion_requires?.legitimacy_of_new_form ?? 30);
  if (trans.turns_elapsed >= 5 && legOk) {
    completeTransition(nationId);
  } else if (trans.turns_elapsed > 18) {
    // Принудительное завершение или кризис
    if (Math.random() < 0.5) {
      completeTransition(nationId);
    } else {
      if (nationId === GAME_STATE.player_nation) {
        addEventLog('⚠️ Затянувшийся переход власти порождает хаос. Государство на грани.', 'danger');
      }
    }
  }
}

function completeTransition(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation.government;
  const trans  = gov.active_transition;
  if (!trans) return;

  const oldType = trans.from;
  const newType = trans.to;

  gov.type = newType;
  trans.status = 'completed';
  gov.active_transition = null;

  // GOV_009: Снимаем флаг переходного периода — экономика и армия восстанавливаются
  gov.in_transition = false;
  gov._pending_transition_cause_type       = null;
  gov._pending_transition_legitimacy_bonus = 0;
  gov._pending_transition_legitimacy_turn  = null;

  // Снимаем resistance_movement только для ненасильственных переходов
  if (trans.cause_type !== 'conquest') {
    gov.resistance_movement = false;
  }

  if (!gov.transition_history) gov.transition_history = [];
  gov.transition_history.push({
    turn:       GAME_STATE.turn,
    from:       oldType,
    to:         newType,
    cause:      trans.cause,
    cause_type: trans.cause_type ?? 'reform',
  });

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(
      `✅ Переход завершён. Новая форма: ${getGovernmentNameFull(newType)}. Доходы и боеспособность армии восстановлены.`,
      'positive'
    );
    renderGovernmentOverlay();
  }
}

// ──────────────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ DELTA (от Claude)
// ──────────────────────────────────────────────────────────────────────

function applyGovernmentDelta(nationId, delta) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation.government;

  const oldType = gov.type;

  // Мета-поля
  if (delta.type        !== undefined) gov.type        = delta.type;
  if (delta.custom_name !== undefined) gov.custom_name = delta.custom_name;
  if (delta.legitimacy  !== undefined) gov.legitimacy  = Math.max(0, Math.min(100, delta.legitimacy));
  if (delta.stability   !== undefined) gov.stability   = Math.max(0, Math.min(100, delta.stability));

  // Правитель
  if (delta.ruler) {
    gov.ruler = Object.assign({}, gov.ruler ?? {}, delta.ruler);
  }

  // Ресурс власти
  if (delta.power_resource) {
    gov.power_resource = Object.assign({}, gov.power_resource ?? {}, delta.power_resource);
    // Синхронизируем current с легитимностью если нет явного значения
    if (delta.power_resource.current === undefined) {
      gov.power_resource.current = gov.legitimacy;
    }
  }

  // Институты — мерж по id; игнорируем объекты без id или name
  if (delta.institutions) {
    if (!gov.institutions) gov.institutions = [];
    for (const newInst of delta.institutions) {
      if (!newInst?.id || !newInst?.name) continue; // защита от неполных AI-дельт
      const idx = gov.institutions.findIndex(i => i.id === newInst.id);
      if (idx >= 0) {
        gov.institutions[idx] = Object.assign({}, gov.institutions[idx], newInst);
      } else {
        gov.institutions.push(newInst);
      }
    }
  }

  // Выборы, заговоры, преемственность
  if (delta.elections   !== undefined) gov.elections   = delta.elections;
  if (delta.conspiracies !== undefined) gov.conspiracies = delta.conspiracies;
  if (delta.succession  !== undefined) gov.succession  = delta.succession;

  // Кастомные механики — мерж по id
  if (delta.custom_mechanics) {
    if (!gov.custom_mechanics) gov.custom_mechanics = [];
    for (const mech of delta.custom_mechanics) {
      const idx = gov.custom_mechanics.findIndex(m => m.id === mech.id);
      if (idx >= 0) {
        gov.custom_mechanics[idx] = Object.assign({}, gov.custom_mechanics[idx], mech);
      } else {
        gov.custom_mechanics.push(mech);
      }
    }
  }

  // Если тип изменился — запустить переход (если не указан instant)
  if (delta.type && delta.type !== oldType) {
    if (delta._instant_change) {
      // Моментальная смена (например при захвате власти)
      if (!gov.transition_history) gov.transition_history = [];
      gov.transition_history.push({
        turn: GAME_STATE.turn,
        from: oldType,
        to: delta.type,
        cause: delta._transition_cause ?? 'Политическое изменение',
      });
      if (nationId === GAME_STATE.player_nation) {
        addEventLog(`⚡ Смена формы правления: ${getGovernmentNameFull(delta.type)}`, 'warning');
      }
    } else {
      // Постепенный переход
      gov.type = oldType; // Откатываем — переход ещё не завершён
      startGovernmentTransition(nationId, delta.type, delta._transition_cause ?? 'Реформа правительства');
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// ТЕОКРАТИЯ: тик
// ──────────────────────────────────────────────────────────────────────

function processTheocracyTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  const pr  = gov.power_resource; // type: 'divine_mandate'

  // Инициализируем хранилище событий если нет
  if (!gov._theocracy_events) gov._theocracy_events = {};

  // 1. Изменения divine_mandate по накопленным флагам событий
  let mandateDelta = 0;
  const ev = gov._theocracy_events;

  if (ev.victory)      { mandateDelta += 5 * ev.victory;      ev.victory      = 0; }
  if (ev.temple_built) { mandateDelta += 3 * ev.temple_built; ev.temple_built = 0; }
  if (ev.festival)     { mandateDelta += 2 * ev.festival;     ev.festival     = 0; }
  if (ev.defeat)       { mandateDelta -= 8 * ev.defeat;       ev.defeat       = 0; }
  if (ev.corruption)   { mandateDelta -= 4 * ev.corruption;   ev.corruption   = 0; }
  if (ev.disaster)     { mandateDelta -= 6 * ev.disaster;     ev.disaster     = 0; }

  if (mandateDelta !== 0 && pr) {
    pr.current = Math.min(pr.max ?? 100, Math.max(0, pr.current + mandateDelta));
    gov.legitimacy = Math.round(pr.current);
    if (isPlayer) {
      const sign = mandateDelta > 0 ? '+' : '';
      addEventLog(
        `✨ Божественный мандат: ${sign}${mandateDelta} (теперь ${Math.round(pr.current)})`,
        mandateDelta > 0 ? 'positive' : 'warning'
      );
    }
  }

  // 2. Кризис жречества при divine_mandate < 20
  const mandate = pr?.current ?? gov.legitimacy ?? 50;
  if (mandate < 20) {
    gov.stability = Math.max(0, (gov.stability ?? 50) - 15);
    if (isPlayer && (GAME_STATE.turn ?? 0) % 3 === 0) {
      addEventLog(
        '⚠️ КРИЗИС ЖРЕЧЕСТВА! Боги отвернулись. Стабильность −15. Жрецы требуют умилостивительных жертв.',
        'danger'
      );
    }
    // Переворот жрецов при критически низком мандате
    if (mandate < 10 && Math.random() < 0.12) {
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 20);
      gov.stability  = Math.max(0, (gov.stability  ?? 50) - 20);
      if (!gov.transition_history) gov.transition_history = [];
      gov.transition_history.push({
        turn:  GAME_STATE.turn ?? 0,
        from:  'theocracy',
        to:    'theocracy',
        cause: 'Переворот жрецов из-за утраты divine_mandate',
      });
      if (isPlayer) {
        addEventLog(
          '🔥 ПЕРЕВОРОТ ЖРЕЦОВ! Верховный жрец низложен. Новый жрец обещает «очищение». Легитимность −20, стабильность −20.',
          'danger'
        );
      }
    }
  }

  // 3. Оракул — 10% шанс за ход (async, fire-and-forget)
  if (Math.random() < 0.10) {
    _triggerOracleRoll(nation, nationId, isPlayer);
  }

  // 4. Истечение оракульного баффа
  if (gov._oracle_buff && (GAME_STATE.turn ?? 0) >= gov._oracle_buff.expires_turn) {
    gov._oracle_buff = null;
  }
}

/**
 * Генерирует пророчество оракула. Async, fire-and-forget.
 * Результат сохраняется в gov._oracle_buff и отображается игроку.
 */
async function _triggerOracleRoll(nation, nationId, isPlayer) {
  const gov = nation.government;

  const systemPrompt =
    'Ты — древний оракул в исторической стратегической игре. ' +
    'Дай одно короткое пророчество (не более 100 символов) для правителя теократии. ' +
    'Пророчество должно быть загадочным и туманным, намекать на войну, мир, удачу или беду. ' +
    'Пиши только само пророчество, без кавычек и пояснений. Язык: русский.';
  const yearAbs = Math.abs((GAME_STATE.date?.year) ?? 300);
  const userPrompt =
    `Нация: ${nation.name ?? nationId}. ${yearAbs} год до н.э. ` +
    `Текущий divine_mandate: ${Math.round(gov.power_resource?.current ?? gov.legitimacy ?? 50)}.`;

  let prophecy;
  try {
    if (typeof callClaude === 'function') {
      const raw = await callClaude(systemPrompt, userPrompt, 80, CONFIG?.MODEL_HAIKU ?? 'claude-haiku-4-5-20251001');
      prophecy = (raw || '').trim().slice(0, 150);
    }
  } catch (_) { /* fallback ниже */ }

  if (!prophecy) {
    const fallbacks = [
      'Звёзды предвещают победу тем, кто смел и чтит богов.',
      'Кровь прольётся, но плоды достанутся мудрым.',
      'Боги молчат — твои слова решат судьбу.',
      'Восток принесёт беду, запад — спасение.',
      'Жрецы узрели огонь не войны, но великих перемен.',
      'Тот, кто ждёт — погибнет. Тот, кто действует — обретёт.',
      'Соль и кровь: два дара, два проклятия.',
    ];
    prophecy = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  // Бафф голосования: +/-20 на 3 хода
  const buff = Math.random() < 0.5 ? 20 : -20;
  gov._oracle_buff = {
    value:        buff,
    prophecy,
    expires_turn: (GAME_STATE.turn ?? 0) + 3,
  };

  if (!gov._prophecy_history) gov._prophecy_history = [];
  gov._prophecy_history.push({ turn: GAME_STATE.turn ?? 0, prophecy, buff });
  if (gov._prophecy_history.length > 10) gov._prophecy_history.shift();

  if (isPlayer) {
    const tone = buff > 0 ? '(благоприятное)' : '(зловещее)';
    addEventLog(
      `🔮 ОРАКУЛ ${tone}: «${prophecy}» — влияние на голосование: ${buff > 0 ? '+' : ''}${buff} на 3 хода.`,
      buff > 0 ? 'positive' : 'warning'
    );
  }
}


// ──────────────────────────────────────────────────────────────────────
// ДЕМОКРАТИЯ: народная популярность, остракизм, гражданские свободы
// ──────────────────────────────────────────────────────────────────────

function processDemocracyTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  const pop = nation.population;

  // 1. Инициализируем popularity если нет (0-100)
  if (gov.popularity === undefined || gov.popularity === null) {
    gov.popularity = Math.min(100, Math.max(0, Math.round((pop?.happiness ?? 50) * 0.8 + 20)));
  }

  // 2. Popularity дрейфует к среднему счастья и легитимности с шумом
  const happiness  = pop?.happiness  ?? 50;
  const legitimacy = gov.legitimacy  ?? 50;
  const target     = Math.round(happiness * 0.6 + legitimacy * 0.4);
  const delta      = (target - gov.popularity) * 0.12 + (Math.random() - 0.5) * 4;
  gov.popularity   = Math.min(100, Math.max(0, Math.round(gov.popularity + delta)));

  // 3. Гражданские свободы: бонус роста населения (+0.0005) и торговли (+5)
  if (pop && typeof pop.growth_rate === 'number') {
    pop.growth_rate = Math.min(0.008, pop.growth_rate + 0.0005);
  }
  gov._trade_bonus = (gov._trade_bonus ?? 0) === 0 ? 5 : gov._trade_bonus; // один раз

  // 4. Порог военного голосования — 60%
  gov._war_vote_threshold = 60;

  // 5. Угроза остракизма при popularity < 30
  if (gov.popularity < 30) {
    if (!gov._ostracism_warning) {
      gov._ostracism_warning = {
        started_turn: GAME_STATE.turn ?? 0,
        leader:       gov.ruler?.name ?? 'Правитель',
      };
      if (isPlayer) {
        addEventLog(
          `⚠️ Народная популярность упала ниже 30%! Граждане требуют остракизма ` +
          `«${gov._ostracism_warning.leader}». Ещё 5 ходов — и лидер будет изгнан.`,
          'warning'
        );
      }
    } else {
      const warnTurns = (GAME_STATE.turn ?? 0) - (gov._ostracism_warning.started_turn ?? 0);
      if (isPlayer && warnTurns > 0 && warnTurns % 2 === 0) {
        addEventLog(
          `🗳️ Остракизм: до изгнания «${gov._ostracism_warning.leader}» осталось ` +
          `${Math.max(0, 5 - warnTurns)} ход(а). Популярность: ${gov.popularity}%.`,
          'warning'
        );
      }
      if (warnTurns >= 5) {
        _triggerOstracism(nation, nationId, isPlayer);
        gov._ostracism_warning = null;
      }
    }
  } else {
    gov._ostracism_warning = null;
  }

  // 6. Победы в войне поднимают популярность
  const atWarNow = nation.military?.at_war_with ?? [];
  if ((gov._prev_at_war ?? []).length > atWarNow.length) {
    gov.popularity = Math.min(100, gov.popularity + 10);
    if (isPlayer) addEventLog('🗳️ Военная победа укрепляет народную поддержку (+10 популярности).', 'positive');
  }
  gov._prev_at_war = [...atWarNow];
}

/**
 * Остракизм: лидер изгоняется на 10 ходов народным собранием.
 */
function _triggerOstracism(nation, nationId, isPlayer) {
  const gov    = nation.government;
  const leader = gov._ostracism_warning?.leader ?? gov.ruler?.name ?? 'Правитель';

  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 20);
  gov.stability  = Math.max(0, (gov.stability  ?? 50) - 15);
  gov.popularity = Math.min(100, (gov.popularity ?? 30) + 25); // народ доволен

  if (!gov.ostracism_history) gov.ostracism_history = [];
  gov.ostracism_history.push({
    turn:         GAME_STATE.turn ?? 0,
    leader,
    returns_turn: (GAME_STATE.turn ?? 0) + 10,
  });

  // Сменить правителя на следующего кандидата
  const candidates = (nation.characters ?? []).filter(
    c => c.alive && c.id !== gov.ruler?.character_id
  ).sort((a, b) => (b.traits?.ambition ?? 0) - (a.traits?.ambition ?? 0));

  if (candidates.length) {
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name         = candidates[0].name;
    gov.ruler.character_id = candidates[0].id;
  }

  if (!gov.transition_history) gov.transition_history = [];
  gov.transition_history.push({
    turn:  GAME_STATE.turn ?? 0,
    from:  'democracy',
    to:    'democracy',
    cause: `Остракизм: ${leader} изгнан народным собранием`,
  });

  if (isPlayer) {
    addEventLog(
      `🗳️ ОСТРАКИЗМ! «${leader}» изгнан народным собранием на 10 ходов. ` +
      `Легитимность −20, стабильность −15. Народная поддержка восстановлена.`,
      'danger'
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// КАСТОМНЫЕ МЕХАНИКИ
// ──────────────────────────────────────────────────────────────────────

function applyCustomMechanics(nationId, trigger) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation.government;
  if (!gov.custom_mechanics?.length) return;

  for (const mech of gov.custom_mechanics) {
    if (mech.trigger !== trigger) continue;

    switch (mech.effect) {
      case 'redirect_010_income_to_temple':
        // 10% дохода уходит в храм
        nation.economy.treasury -= nation.economy.income_per_turn * 0.10;
        break;
      case 'require_oracle_roll':
        // Обрабатывается при объявлении войны
        break;
      case 'double_legitimacy_decay':
        gov.legitimacy = Math.max(0, gov.legitimacy - 1);
        break;
      case 'feast_bonus_morale':
        // Пиры повышают мораль армии
        if (nation.economy.treasury > 5000) {
          nation.military.morale = Math.min(100, nation.military.morale + 1);
        }
        break;
      // Неизвестные эффекты игнорируются — система не ломается
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// ГОЛОСОВАНИЕ В ИНСТИТУТЕ
// Код считает математику, Claude пишет речи (в claude.js)
// ──────────────────────────────────────────────────────────────────────

function calculateInstitutionVote(institution, nation) {
  if (!institution) return { for: 0, against: 0, abstain: 0, passed: false };

  const method = institution.decision_method ?? 'majority_vote';
  const characters = (nation.characters ?? []).filter(c => c.alive);

  if (method === 'single_person') {
    return { for: 1, against: 0, abstain: 0, passed: true };
  }

  let votesFor = 0, votesAgainst = 0, votesAbstain = 0;

  if (method === 'majority_vote' || method === 'weighted_by_wealth') {
    // Используем фракции если есть
    if (institution.factions?.length) {
      for (const faction of institution.factions) {
        const avgLoyalty = characters.reduce((s, c) => s + (c.traits.loyalty ?? 50), 0)
                         / Math.max(1, characters.length);
        if (avgLoyalty > 60) {
          votesFor     += faction.seats;
        } else if (avgLoyalty < 35) {
          votesAgainst += faction.seats;
        } else {
          votesAbstain += Math.floor(faction.seats * 0.4);
          votesFor     += Math.floor(faction.seats * 0.6);
        }
      }
    } else {
      // Без фракций — по персонажам
      for (const char of characters) {
        const r = Math.random();
        const support = (char.traits.loyalty ?? 50) / 100;
        if (r < support)        votesFor++;
        else if (r < 0.9)       votesAgainst++;
        else                    votesAbstain++;
      }
    }
  }

  // Оракульный бафф для теократии: +/-20 псевдо-голосов
  const gov = nation.government;
  if (gov?.type === 'theocracy' && gov._oracle_buff) {
    const oracleBuff = gov._oracle_buff.value;
    if (oracleBuff > 0) {
      votesFor += oracleBuff;
    } else {
      votesAgainst += Math.abs(oracleBuff);
    }
  }

  const total = votesFor + votesAgainst + votesAbstain;
  let quorum = (institution.quorum ?? 51) / 100;

  // Демократия: военные решения требуют 60% порога (гражданская свобода)
  if (nation.government?.type === 'democracy') {
    const milPowers = ['declare_war', 'war_funding', 'military_glory', 'command_armies', 'command_army'];
    const isMilitary = (institution.powers ?? []).some(p => milPowers.includes(p))
                    || institution.type === 'military';
    if (isMilitary) quorum = Math.max(quorum, 0.60);
  }

  const passed = total > 0 && (votesFor / total) >= quorum;

  return { for: votesFor, against: votesAgainst, abstain: votesAbstain, passed };
}

// Может ли закон пройти без голосования при данной форме правления?
function requiresVote(nation, law) {
  const type = nation.government?.type;
  // При тирании всё решает тиран
  if (type === 'tyranny')  return false;
  // При племенном вождизме — тоже
  if (type === 'tribal')   return false;
  // При монархии — зависит от типа закона
  if (type === 'monarchy' && law?.type !== 'constitutional') return false;
  // При республике и олигархии — всегда голосование
  return true;
}

// ──────────────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────────────

function getGovernmentNameFull(type, custom_name) {
  if (type === 'custom' && custom_name) return custom_name;
  const names = {
    tyranny:    'Тирания',
    monarchy:   'Монархия',
    republic:   'Республика',
    oligarchy:  'Олигархия',
    democracy:  'Демократия',
    tribal:     'Племенной вождизм',
    theocracy:  'Теократия',
    custom:     'Особая форма',
  };
  return names[type] ?? type;
}

function getPowerResourceName(type) {
  const names = {
    fear:             'Страх',
    legitimacy:       'Легитимность',
    prestige:         'Престиж',
    divine_mandate:   'Божественный мандат',
    wealth:           'Богатство',
    military_loyalty: 'Воинская верность',
  };
  return names[type] ?? type ?? '—';
}

function getPowerResourceColor(type) {
  const colors = {
    fear:             '#9b2226',
    legitimacy:       '#4CAF50',
    prestige:         '#9C27B0',
    divine_mandate:   '#FFD700',
    wealth:           '#FF9800',
    military_loyalty: '#2196F3',
  };
  return colors[type] ?? '#d4a853';
}

function getPowerResourceIcon(type) {
  const icons = {
    fear:             '😨',
    legitimacy:       '⚖️',
    prestige:         '👑',
    divine_mandate:   '✨',
    wealth:           '💰',
    military_loyalty: '⚔️',
  };
  return icons[type] ?? '🔮';
}

// ══════════════════════════════════════════════════════════════════════
// ПЕРЕГОВОРЫ С АКТОРОМ — диспетчер по типу правления
// ══════════════════════════════════════════════════════════════════════

// Алиас для обратной совместимости
function negotiateSenator(charId, nationId, actionId) {
  return negotiateActor(charId, nationId, actionId, 'republic');
}

// Результат: { outcome: 'success'|'partial'|'fail', message, loyalty_delta, disposition_delta, gold_spent, history_note }
function negotiateActor(charId, nationId, actionId, govType) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return null;

  const senator = (nation.characters ?? []).find(c => c.id === charId);
  if (!senator) return null;

  const disp    = senator.disposition ?? 50;
  const greed   = senator.traits?.greed   ?? 50;
  const caution = senator.traits?.caution ?? 50;
  const loyalty = senator.traits?.loyalty ?? 50;
  const ambition= senator.traits?.ambition ?? 50;
  const power   = nation.government?.power_resource?.current ?? 50;
  const treasury= nation.economy?.treasury ?? 0;

  const roll = Math.random() * 100;

  if (actionId === 'deal') {
    // Предложить союз — обещание поддержки желания
    const threshold = Math.max(10, 20 + disp * 0.6 - caution * 0.15);
    if (roll < threshold) {
      const gain = Math.round(8 + disp * 0.1);
      return {
        outcome: 'success',
        message: `${senator.name} принимает ваше предложение. «Мы найдём общий язык, если вы сдержите слово».`,
        loyalty_delta: gain,
        disposition_delta: Math.round(gain * 0.8),
        gold_spent: 0,
        history_note: `Заключил союз с правителем. Расположение растёт.`,
      };
    } else if (roll < threshold + 25) {
      return {
        outcome: 'partial',
        message: `${senator.name} выслушал, но не спешит. «Слова — не достаточно. Нужны дела».`,
        loyalty_delta: 2,
        disposition_delta: 3,
        gold_spent: 0,
        history_note: `Выслушал предложение правителя. Занял выжидательную позицию.`,
      };
    } else {
      return {
        outcome: 'fail',
        message: `${senator.name} отвергает союз. «Мои обязательства — перед Сенатом, а не перед вами».`,
        loyalty_delta: 0,
        disposition_delta: -3,
        gold_spent: 0,
        history_note: `Отверг предложение правителя о союзе.`,
      };
    }
  }

  if (actionId === 'bribe') {
    const bribeCost = Math.round(500 + greed * 80);
    if (treasury < bribeCost) {
      return {
        outcome: 'fail',
        message: `Недостаточно золота для подкупа (нужно ${bribeCost}).`,
        loyalty_delta: 0,
        disposition_delta: 0,
        gold_spent: 0,
        history_note: '',
      };
    }
    const threshold = Math.min(90, 30 + disp * 0.4 + greed * 0.3);
    if (roll < threshold) {
      const loyGain = Math.round(10 + greed * 0.15);
      return {
        outcome: 'success',
        message: `${senator.name} незаметно принимает мешок золота. «Что ж... возможно, я был слишком суров к вам».`,
        loyalty_delta: loyGain,
        disposition_delta: Math.round(loyGain * 0.9),
        gold_spent: bribeCost,
        history_note: `Получил подношение от правителя. Лояльность выросла.`,
      };
    } else if (greed < 30) {
      // Принципиальный — оскорблён
      return {
        outcome: 'fail',
        message: `${senator.name} с презрением отталкивает золото. «Вы смеете думать, что я продаюсь?!» Расположение падает.`,
        loyalty_delta: -5,
        disposition_delta: -12,
        gold_spent: 0,
        history_note: `Оскорблён попыткой подкупа. Стал враждебнее.`,
      };
    } else {
      return {
        outcome: 'fail',
        message: `${senator.name} берёт золото, но ничего не обещает. «Это уплата старого долга, не более».`,
        loyalty_delta: 2,
        disposition_delta: 1,
        gold_spent: bribeCost,
        history_note: `Взял золото, но остался при своих взглядах.`,
      };
    }
  }

  if (actionId === 'appeal') {
    // Апелляция к личным интересам — называем его желание
    const threshold = Math.min(80, 25 + disp * 0.5 + ambition * 0.1);
    if (roll < threshold) {
      const want = (senator.wants?.[0] ?? 'ваши цели').replace(/_/g, ' ');
      return {
        outcome: 'success',
        message: `Вы апеллируете к его стремлению: "${want}". ${senator.name} задумывается. «Возможно, у нас больше общего, чем я думал».`,
        loyalty_delta: 5,
        disposition_delta: 8,
        gold_spent: 0,
        history_note: `Правитель обратился к его интересам. Проникся уважением.`,
      };
    } else if (roll < threshold + 30) {
      return {
        outcome: 'partial',
        message: `${senator.name} слушает, но остаётся скептичен. «Слова красивые, посмотрим на дела».`,
        loyalty_delta: 1,
        disposition_delta: 2,
        gold_spent: 0,
        history_note: `Выслушал апелляцию к интересам. Остался при своём.`,
      };
    } else {
      return {
        outcome: 'fail',
        message: `${senator.name} не впечатлён. «Не надо учить меня, в чём мои интересы».`,
        loyalty_delta: -1,
        disposition_delta: -2,
        gold_spent: 0,
        history_note: `Отверг апелляцию правителя. Почувствовал манипуляцию.`,
      };
    }
  }

  if (actionId === 'pressure') {
    if (power < 20) {
      return {
        outcome: 'fail',
        message: `Ваша власть слишком слаба для давления (нужно ≥ 20).`,
        loyalty_delta: 0,
        disposition_delta: 0,
        gold_spent: 0,
        history_note: '',
      };
    }
    const threshold = Math.min(70, 10 + power * 0.5 - caution * 0.2);
    if (roll < threshold * 0.5) {
      // Полный успех давления
      return {
        outcome: 'success',
        message: `Вы демонстрируете силу. ${senator.name} бледнеет. «…Я понял вас. Буду лоялен».`,
        loyalty_delta: 12,
        disposition_delta: -5,  // уважает силу, но не любит
        gold_spent: 0,
        history_note: `Поддался давлению правителя. Лоялен из страха.`,
      };
    } else if (roll < threshold) {
      return {
        outcome: 'partial',
        message: `${senator.name} внешне соглашается, но в глазах — упрямство. «Как вам угодно… на этот раз».`,
        loyalty_delta: 4,
        disposition_delta: -8,
        gold_spent: 0,
        history_note: `Уступил давлению, затаил обиду.`,
      };
    } else {
      // Провал давления — скандал
      return {
        outcome: 'fail',
        message: `${senator.name} открыто сопротивляется. «Угрозы — оружие тирана! Сенат это запомнит!» Расположение резко падает.`,
        loyalty_delta: -8,
        disposition_delta: -15,
        gold_spent: 0,
        history_note: `Публично противостоял давлению правителя. Стал открытым врагом.`,
      };
    }
  }

  // ── Тирания ──────────────────────────────────────────────────────
  if (actionId === 'give_gift') {
    const giftCost = Math.round(200 + greed * 50);
    if (treasury < giftCost) return _failResult('Недостаточно золота.');
    const threshold = Math.min(80, 30 + disp * 0.4 + greed * 0.2);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} принимает дар с поклоном. «Щедрость правителя достойна восхищения».`, loyalty_delta:8, disposition_delta:10, gold_spent:giftCost, history_note:'Принял дар. Доволен.' };
    return { outcome:'partial', message:`${senator.name} принимает дар, но без лишних слов.`, loyalty_delta:3, disposition_delta:4, gold_spent:giftCost, history_note:'Принял дар. Остался нейтрален.' };
  }

  if (actionId === 'do_favor') {
    const threshold = Math.min(80, 25 + disp * 0.55 - caution * 0.1);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} принимает услугу. «Я не забуду этого, правитель».`, loyalty_delta:10, disposition_delta:8, gold_spent:0, history_note:'Принял услугу. Лоялен.' };
    if (roll < threshold + 25) return { outcome:'partial', message:`${senator.name} благодарит, но насторожённо. «Посмотрим».`, loyalty_delta:3, disposition_delta:2, gold_spent:0, history_note:'Принял услугу осторожно.' };
    return { outcome:'fail', message:`${senator.name} отклоняет. «Я никому не обязан».`, loyalty_delta:-1, disposition_delta:-2, gold_spent:0, history_note:'Отверг предложение услуги.' };
  }

  if (actionId === 'flatter') {
    const threshold = Math.min(50, 15 + disp * 0.25 + ambition * 0.1);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} расцветает. «Правитель видит меня насквозь — и ценит это».`, loyalty_delta:4, disposition_delta:6, gold_spent:0, history_note:'Польщён словами правителя.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} кивает без особых эмоций.`, loyalty_delta:1, disposition_delta:1, gold_spent:0, history_note:'' };
    return { outcome:'fail', message:`${senator.name} с прищуром смотрит. «Лесть не трогает меня».`, loyalty_delta:0, disposition_delta:-1, gold_spent:0, history_note:'' };
  }

  if (actionId === 'intimidate') {
    if (power < 20) return _failResult('Власть слишком мала для давления.');
    const threshold = Math.min(65, 10 + power * 0.45 - caution * 0.25);
    if (roll < threshold * 0.5) return { outcome:'success', message:`${senator.name} бледнеет. «Да… как угодно правителю».`, loyalty_delta:12, disposition_delta:-6, gold_spent:0, history_note:'Запуган. Лоялен из страха.' };
    if (roll < threshold) return { outcome:'partial', message:`${senator.name} уступает, но помнит. «Хорошо. На этот раз».`, loyalty_delta:5, disposition_delta:-10, gold_spent:0, history_note:'Уступил, затаил злобу.' };
    return { outcome:'fail', message:`${senator.name} встаёт. «Правитель ошибся, угрожая мне». Скандал.`, loyalty_delta:-8, disposition_delta:-15, gold_spent:0, history_note:'Публично противостоял тирану.' };
  }

  // ── Монархия ─────────────────────────────────────────────────────
  if (actionId === 'request_audience') {
    const threshold = Math.min(75, 15 + disp * 0.5);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} устраивает аудиенцию. «Монарх примет вас завтра».`, loyalty_delta:5, disposition_delta:8, gold_spent:0, history_note:'Открыл доступ к монарху.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} обещает «попробовать договориться». «Монарх занят».`, loyalty_delta:1, disposition_delta:2, gold_spent:0, history_note:'Обещал помочь с аудиенцией.' };
    return { outcome:'fail', message:`${senator.name} качает головой. «Монарх не принимает сейчас».`, loyalty_delta:0, disposition_delta:-2, gold_spent:0, history_note:'' };
  }

  if (actionId === 'court_gift') {
    const giftCost = Math.round(200 + greed * 50);
    if (treasury < giftCost) return _failResult('Недостаточно золота.');
    const threshold = Math.min(80, 25 + disp * 0.35 + greed * 0.3);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} принимает подношение с изысканным поклоном. «Вы знаете, как угодить двору».`, loyalty_delta:9, disposition_delta:11, gold_spent:giftCost, history_note:'Принял дар. Расположение выросло.' };
    return { outcome:'partial', message:`${senator.name} принимает, но сдержанно. «Любезно с вашей стороны».`, loyalty_delta:3, disposition_delta:4, gold_spent:giftCost, history_note:'Принял дар.' };
  }

  if (actionId === 'offer_service') {
    const threshold = Math.min(80, 20 + disp * 0.6 - caution * 0.15);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} оживляется. «Именно такая помощь нужна двору. Я замолвлю слово за вас».`, loyalty_delta:8, disposition_delta:10, gold_spent:0, history_note:'Принял предложение службы. Союзник.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} обдумывает. «Возможно, это будет полезно».`, loyalty_delta:2, disposition_delta:3, gold_spent:0, history_note:'Рассматривает предложение.' };
    return { outcome:'fail', message:`${senator.name} отказывает. «Двор не нуждается в этом».`, loyalty_delta:0, disposition_delta:-2, gold_spent:0, history_note:'' };
  }

  if (actionId === 'intrigue') {
    const threshold = Math.min(65, 10 + disp * 0.4 - caution * 0.2);
    if (roll < threshold * 0.4) return { outcome:'success', message:`${senator.name} принимает игру. «Хорошо. Позаботьтесь о нём, пока он не стал проблемой».`, loyalty_delta:7, disposition_delta:-3, gold_spent:0, history_note:'Участвует в интриге.' };
    if (roll < threshold) return { outcome:'partial', message:`${senator.name} уклончиво. «Я буду… иметь это в виду».`, loyalty_delta:2, disposition_delta:0, gold_spent:0, history_note:'Осторожно принял намёк.' };
    return { outcome:'fail', message:`${senator.name} хмурится. «Интриги — не моё дело». Теперь насторожён.`, loyalty_delta:-3, disposition_delta:-8, gold_spent:0, history_note:'Отверг интригу. Стал подозрительным.' };
  }

  // ── Олигархия ────────────────────────────────────────────────────
  if (actionId === 'business_deal') {
    const threshold = Math.min(80, 20 + disp * 0.5 + greed * 0.2);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} щёлкает пальцами. «По рукам. Составим контракт».`, loyalty_delta:9, disposition_delta:10, gold_spent:0, history_note:'Заключил деловое соглашение.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} изучает условия. «Нужно подумать. Детали пришлите письмом».`, loyalty_delta:2, disposition_delta:3, gold_spent:0, history_note:'Рассматривает деловое предложение.' };
    return { outcome:'fail', message:`${senator.name} откидывается. «Условия меня не устраивают». Переговоры закрыты.`, loyalty_delta:0, disposition_delta:-3, gold_spent:0, history_note:'Отверг деловое предложение.' };
  }

  if (actionId === 'trade_alliance') {
    const threshold = Math.min(75, 15 + disp * 0.45);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} протягивает руку. «Долгосрочный союз выгоден нам обоим».`, loyalty_delta:11, disposition_delta:12, gold_spent:0, history_note:'Заключил торговый альянс.' };
    if (roll < threshold + 25) return { outcome:'partial', message:`${senator.name} кивает. «Интересно. Но нужны гарантии».`, loyalty_delta:3, disposition_delta:4, gold_spent:0, history_note:'Рассматривает торговый альянс.' };
    return { outcome:'fail', message:`${senator.name} отмахивается. «Вы не тот партнёр, который мне нужен».`, loyalty_delta:0, disposition_delta:-4, gold_spent:0, history_note:'' };
  }

  if (actionId === 'econ_pressure') {
    if (power < 30) return _failResult('Недостаточно власти для экономического давления.');
    const threshold = Math.min(60, 10 + power * 0.4 - caution * 0.3);
    if (roll < threshold * 0.5) return { outcome:'success', message:`${senator.name} чувствует угрозу торговым путям. «Хорошо. Я поддержу вас».`, loyalty_delta:10, disposition_delta:-4, gold_spent:0, history_note:'Уступил экономическому давлению.' };
    if (roll < threshold) return { outcome:'partial', message:`${senator.name} зажат. «Вы играете нечестно. Но… договоримся».`, loyalty_delta:4, disposition_delta:-10, gold_spent:0, history_note:'Поддался давлению, недоволен.' };
    return { outcome:'fail', message:`${senator.name} твёрдо. «Угрозы не работают с людьми моего уровня. Запомните это».`, loyalty_delta:-6, disposition_delta:-14, gold_spent:0, history_note:'Противостоял давлению. Враждебен.' };
  }

  // ── Племя ────────────────────────────────────────────────────────
  if (actionId === 'tribal_gifts') {
    const giftCost = Math.round(200 + greed * 50);
    if (treasury < giftCost) return _failResult('Недостаточно золота.');
    const threshold = Math.min(85, 30 + disp * 0.4 + greed * 0.2);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} принимает дары с поднятой рукой. «Ты щедр, как вождь должен быть!»`, loyalty_delta:10, disposition_delta:12, gold_spent:giftCost, history_note:'Принял дары. Честь выросла.' };
    return { outcome:'partial', message:`${senator.name} принимает, но без лишних слов.`, loyalty_delta:4, disposition_delta:5, gold_spent:giftCost, history_note:'Принял дары.' };
  }

  if (actionId === 'battle_glory') {
    const threshold = Math.min(80, 20 + disp * 0.5 + power * 0.2);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} поднимает кулак. «Только сильный вождь бьёт так! Племя за тобой!»`, loyalty_delta:12, disposition_delta:10, gold_spent:0, history_note:'Признал боевую славу вождя.' };
    if (roll < threshold + 25) return { outcome:'partial', message:`${senator.name} кивает. «Война покажет истину».`, loyalty_delta:3, disposition_delta:3, gold_spent:0, history_note:'' };
    return { outcome:'fail', message:`${senator.name} презрительно. «Мало слов о битве — покажи дело».`, loyalty_delta:-1, disposition_delta:-3, gold_spent:0, history_note:'Не впечатлён словами о боевой славе.' };
  }

  if (actionId === 'ritual') {
    const ritualCost = Math.round(300 + (senator.traits?.piety??50) * 30);
    if (treasury < ritualCost) return _failResult('Недостаточно золота для обряда.');
    const threshold = Math.min(85, 30 + (senator.traits?.piety??50) * 0.4 + disp * 0.3);
    if (roll < threshold) return { outcome:'success', message:`Обряд прошёл. ${senator.name} смотрит в огонь. «Духи довольны. Ты — наш вождь».`, loyalty_delta:14, disposition_delta:12, gold_spent:ritualCost, history_note:'Провёл обряд вместе с вождём. Духи довольны.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`Обряд завершён. ${senator.name} задумчив. «Духи молчат. Но ты уважаешь традиции».`, loyalty_delta:5, disposition_delta:6, gold_spent:ritualCost, history_note:'Провёл обряд. Духи молчали.' };
    return { outcome:'fail', message:`Обряд прерван дурным знамением. ${senator.name} мрачен. «Боги не довольны тобой сегодня».`, loyalty_delta:-3, disposition_delta:-5, gold_spent:ritualCost, history_note:'Обряд дал плохое знамение.' };
  }

  if (actionId === 'duel_challenge') {
    const threshold = Math.min(60, 10 + power * 0.5 - caution * 0.3);
    if (roll < threshold * 0.4) return { outcome:'success', message:`${senator.name} принимает вызов — и уступает. «Ты вождь! Племя склонилось перед тобой!»`, loyalty_delta:18, disposition_delta:8, gold_spent:0, history_note:'Проиграл поединок вождю. Признаёт силу.' };
    if (roll < threshold) return { outcome:'partial', message:`Поединок ничейный. ${senator.name} дышит тяжело. «Ты достоин. Пусть будет мир».`, loyalty_delta:7, disposition_delta:5, gold_spent:0, history_note:'Поединок с вождём закончился миром.' };
    return { outcome:'fail', message:`${senator.name} побеждает. «Твоя сила мала. Где вождь, который ведёт нас?»`, loyalty_delta:-10, disposition_delta:-12, gold_spent:0, history_note:'Победил вождя в поединке. Авторитет вождя упал.' };
  }

  // ── Теократия ────────────────────────────────────────────────────
  if (actionId === 'temple_donation') {
    const ritualCost = Math.round(300 + (senator.traits?.piety??50) * 30);
    if (treasury < ritualCost) return _failResult('Недостаточно золота для пожертвования.');
    const threshold = Math.min(85, 30 + (senator.traits?.piety??50) * 0.45 + disp * 0.25);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} воздевает руки. «Боги видят твою щедрость! Ты будешь благословлён».`, loyalty_delta:12, disposition_delta:14, gold_spent:ritualCost, history_note:'Принял пожертвование. Доволен.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} кивает. «Боги примут твой дар. Продолжай в том же духе».`, loyalty_delta:5, disposition_delta:6, gold_spent:ritualCost, history_note:'Принял пожертвование.' };
    return { outcome:'fail', message:`${senator.name} хмурится. «Боги хотят большего, чем монеты. Покажи веру делами».`, loyalty_delta:0, disposition_delta:-2, gold_spent:ritualCost, history_note:'Пожертвование было сочтено недостаточным.' };
  }

  if (actionId === 'cite_omen') {
    const threshold = Math.min(75, 20 + (senator.traits?.piety??50) * 0.4 + disp * 0.2);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} слушает внимательно. «Если знамение истинно — воля богов ясна. Я поддержу тебя».`, loyalty_delta:9, disposition_delta:10, gold_spent:0, history_note:'Убеждён знамением. Поддерживает.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} задумывается. «Нужно истолковать знамение точнее».`, loyalty_delta:2, disposition_delta:3, gold_spent:0, history_note:'Осторожно отнёсся к знамению.' };
    return { outcome:'fail', message:`${senator.name} качает головой. «Это не знамение. Ты интерпретируешь знаки неверно».`, loyalty_delta:-1, disposition_delta:-4, gold_spent:0, history_note:'Отверг интерпретацию знамения.' };
  }

  if (actionId === 'sponsor_ritual') {
    const ritualCost = Math.round(300 + (senator.traits?.piety??50) * 30);
    if (treasury < ritualCost * 2) return _failResult('Недостаточно золота для ритуала.');
    const threshold = Math.min(90, 40 + (senator.traits?.piety??50) * 0.4 + disp * 0.3);
    if (roll < threshold) return { outcome:'success', message:`Ритуал проведён. ${senator.name} преклоняет колено. «Боги говорили сегодня. Через тебя».`, loyalty_delta:16, disposition_delta:14, gold_spent:ritualCost*2, history_note:'Спонсировал великий ритуал. Боги довольны.' };
    if (roll < threshold + 15) return { outcome:'partial', message:`Ритуал завершён. ${senator.name} серьёзен. «Боги приняли жертву. Но от тебя ждут большего».`, loyalty_delta:7, disposition_delta:6, gold_spent:ritualCost*2, history_note:'Ритуал проведён. Частичный успех.' };
    return { outcome:'fail', message:`Ритуал прерван. ${senator.name} бледнеет. «Знак неблагоприятен. Боги гневаются».`, loyalty_delta:-4, disposition_delta:-8, gold_spent:ritualCost*2, history_note:'Ритуал дал плохое знамение.' };
  }

  if (actionId === 'spiritual_alliance') {
    const threshold = Math.min(70, 15 + (senator.traits?.piety??50) * 0.35 + disp * 0.35);
    if (roll < threshold) return { outcome:'success', message:`${senator.name} складывает руки. «Мы оба служим богам. Пусть союз будет угоден им».`, loyalty_delta:10, disposition_delta:11, gold_spent:0, history_note:'Заключил духовный союз.' };
    if (roll < threshold + 20) return { outcome:'partial', message:`${senator.name} обдумывает. «Союз возможен, если твои дела будут угодны богам».`, loyalty_delta:3, disposition_delta:4, gold_spent:0, history_note:'Рассматривает духовный союз.' };
    return { outcome:'fail', message:`${senator.name} отказывает. «Боги не велели мне этого».`, loyalty_delta:0, disposition_delta:-3, gold_spent:0, history_note:'' };
  }

  return {
    outcome: 'fail',
    message: 'Неизвестное действие.',
    loyalty_delta: 0,
    disposition_delta: 0,
    gold_spent: 0,
    history_note: '',
  };
}

function _failResult(msg) {
  return { outcome:'fail', message:msg, loyalty_delta:0, disposition_delta:0, gold_spent:0, history_note:'' };
}

// ──────────────────────────────────────────────────────────────────────
// SENATE — тик ленивой материализации (вызов из processAllGovernmentTicks)
// ──────────────────────────────────────────────────────────────────────

async function processSenateTickForAllNations() {
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    const mgr = getSenateManager(nationId);
    if (mgr) {
      try {
        await mgr.processTick(GAME_STATE.turn);
      } catch (err) {
        console.warn(`Senate tick error (${nationId}):`, err.message);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// GOV_003: КОНСТРУКТОР ПРАВИТЕЛЬСТВА — движковая часть
// ──────────────────────────────────────────────────────────────────────

const GOV_INSTITUTION_TEMPLATES = {
  // Республика
  senate:           { id:'senate',           name:'Сенат',                type:'legislative', decision_method:'majority_vote',      quorum:51 },
  consulate:        { id:'consulate',         name:'Консулат',             type:'executive',   decision_method:'single_person'                },
  praetorship:      { id:'praetorship',       name:'Преторий',             type:'judicial',    decision_method:'majority_vote'                },
  censorship:       { id:'censorship',        name:'Цензура',              type:'executive',   decision_method:'single_person'                },
  tribune:          { id:'tribune',           name:'Трибунат',             type:'legislative', decision_method:'majority_vote'                },
  // Олигархия
  council_elders:   { id:'council_elders',    name:'Совет старейшин',      type:'legislative', decision_method:'weighted_by_wealth'           },
  merchant_guild:   { id:'merchant_guild',    name:'Купеческая гильдия',   type:'advisory',    decision_method:'weighted_by_wealth'           },
  trade_court:      { id:'trade_court',       name:'Торговый суд',         type:'judicial',    decision_method:'weighted_by_wealth'           },
  noble_assembly:   { id:'noble_assembly',    name:'Дворянское собрание',  type:'legislative', decision_method:'majority_vote'                },
  // Демократия
  assembly:         { id:'assembly',          name:'Народное собрание',    type:'legislative', decision_method:'majority_vote',      quorum:60 },
  strategos:        { id:'strategos',         name:'Стратег',              type:'military',    decision_method:'single_person'                },
  jury_courts:      { id:'jury_courts',       name:'Суды присяжных',       type:'judicial',    decision_method:'majority_vote'                },
  ephors:           { id:'ephors',            name:'Эфоры',                type:'executive',   decision_method:'majority_vote'                },
  // Монархия
  royal_council:    { id:'royal_council',     name:'Королевский совет',    type:'advisory',    decision_method:'single_person'                },
  chancellery:      { id:'chancellery',       name:'Канцелярия',           type:'executive',   decision_method:'single_person'                },
  military_command: { id:'military_command',  name:'Военное командование', type:'military',    decision_method:'single_person'                },
  court_justice:    { id:'court_justice',     name:'Суд правосудия',       type:'judicial',    decision_method:'single_person'                },
  // Тирания
  personal_guard:   { id:'personal_guard',    name:'Личная гвардия',       type:'military',    decision_method:'single_person'                },
  secret_police:    { id:'secret_police',     name:'Тайная полиция',       type:'executive',   decision_method:'single_person'                },
  privy_council:    { id:'privy_council',     name:'Тайный совет',         type:'advisory',    decision_method:'single_person'                },
  tax_collectors:   { id:'tax_collectors',    name:'Сборщики налогов',     type:'executive',   decision_method:'single_person'                },
  // Племя
  war_band:         { id:'war_band',          name:'Военная дружина',      type:'military',    decision_method:'single_person'                },
  shamanic_council: { id:'shamanic_council',  name:'Совет шаманов',        type:'religious',   decision_method:'random_oracle'                },
  hunting_council:  { id:'hunting_council',   name:'Охотничий совет',      type:'advisory',    decision_method:'majority_vote'                },
  // Теократия
  high_priest:      { id:'high_priest',       name:'Верховный жрец',       type:'religious',   decision_method:'single_person'                },
  oracle_chamber:   { id:'oracle_chamber',    name:'Палата оракула',       type:'advisory',    decision_method:'random_oracle'                },
  temple_guard:     { id:'temple_guard',      name:'Храмовая стража',      type:'military',    decision_method:'single_person'                },
  prophets_guild:   { id:'prophets_guild',    name:'Гильдия пророков',     type:'religious',   decision_method:'majority_vote'                },
};

const GOV_SETUP_EFFECTS = {
  republic:   { legitimacy_delta: +15, stability_delta: +10 },
  oligarchy:  { legitimacy_delta:  -5, stability_delta:  +5 },
  democracy:  { legitimacy_delta: +10, stability_delta:  +5 },
  monarchy:   { legitimacy_delta: +10, stability_delta: +15 },
  tyranny:    { legitimacy_delta: -20, stability_delta: -10 },
  tribal:     { legitimacy_delta:   0, stability_delta:  -5 },
  theocracy:  { legitimacy_delta: +20, stability_delta: +10 },
};

const GOV_DEFAULT_POWER_RESOURCES = {
  republic:   { type:'legitimacy',     max:100, decay_per_turn:0.5 },
  oligarchy:  { type:'legitimacy',     max:100, decay_per_turn:0.3 },
  democracy:  { type:'legitimacy',     max:100, decay_per_turn:0.4 },
  monarchy:   { type:'legitimacy',     max:100, decay_per_turn:0.3 },
  tyranny:    { type:'fear',           max:100, decay_per_turn:2   },
  tribal:     { type:'prestige',       max:100, decay_per_turn:1   },
  theocracy:  { type:'divine_mandate', max:100, decay_per_turn:0.5 },
};

/**
 * Применяет выбор конструктора правительства к нации.
 * @param {string} nationId
 * @param {{ type: string, institutions: string[] }} config
 */
function applyGovernmentSetup(nationId, config) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.government) return;
  const gov = nation.government;

  const oldType = gov.type;
  const effects  = GOV_SETUP_EFFECTS[config.type] ?? { legitimacy_delta: 0, stability_delta: 0 };

  // 1. Применяем тип правления
  gov.type = config.type;

  // 2. Применяем выбранные институты (заменяем список)
  gov.institutions = (config.institutions ?? []).map(instId => {
    const tmpl = GOV_INSTITUTION_TEMPLATES[instId];
    if (!tmpl) return null;
    // Сохраняем существующие данные фракций/участников если институт уже был
    const existing = (gov.institutions ?? []).find(i => i.id === instId);
    return Object.assign({}, tmpl, existing ? { factions: existing.factions, character_ids: existing.character_ids } : {});
  }).filter(Boolean);

  // 3. Применяем изменения легитимности и стабильности
  gov.legitimacy = Math.min(100, Math.max(0, (gov.legitimacy ?? 50) + effects.legitimacy_delta));
  gov.stability  = Math.min(100, Math.max(0, (gov.stability  ?? 50) + effects.stability_delta));

  // 4. Обновляем ресурс власти под новый тип (если тип изменился)
  if (config.type !== oldType) {
    const pd = GOV_DEFAULT_POWER_RESOURCES[config.type];
    if (pd) {
      gov.power_resource = Object.assign({}, pd, { current: gov.legitimacy });
    }
    if (!gov.transition_history) gov.transition_history = [];
    gov.transition_history.push({
      turn:  GAME_STATE.turn ?? 0,
      from:  oldType,
      to:    config.type,
      cause: 'Основание правительства через конструктор',
    });
  }

  // 5. Снимаем флаг — конструктор завершён
  gov.needs_setup = false;

  if (nationId === GAME_STATE.player_nation) {
    const typeName = typeof getGovernmentNameFull === 'function'
      ? getGovernmentNameFull(config.type)
      : config.type;
    addEventLog(
      `🏛 Правительство основано: ${typeName}. Выбрано институтов: ${config.institutions.length}.`,
      'positive'
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// GOV_008: ЛИЧНАЯ ГВАРДИЯ ТИРАНА
// ──────────────────────────────────────────────────────────────────────

/**
 * Тик личной гвардии — вызывается каждый ход для тираний.
 * Логика:
 *  - Снимает cost_per_turn с казны; при нехватке gold → unpaid_turns++
 *  - guard.loyalty дрейфует вниз (−0.5–1.5 за ход) → требует постоянной платы
 *  - guard.size > 60 → подавление беспорядков (−10 happiness, но снижает revolt_pressure)
 *  - guard.size > 80 && unpaid_turns > 3 → 5% шанс coup d'état от самой гвардии
 */
function processPersonalGuardTick(nation, nationId, isPlayer) {
  const gov   = nation.government;
  const guard = gov.personal_guard;
  if (!guard || guard.size <= 0) return;

  // 1. Списание содержания
  const cost = guard.cost_per_turn ?? Math.round(guard.size * 2);
  guard.cost_per_turn = cost;

  if ((nation.economy?.treasury ?? 0) >= cost) {
    nation.economy.treasury -= cost;
    guard.unpaid_turns = 0;
    // Лояльность немного растёт при стабильной оплате
    guard.loyalty = Math.min(100, guard.loyalty + 0.3);
  } else {
    guard.unpaid_turns = (guard.unpaid_turns ?? 0) + 1;
    // Без зарплаты лояльность быстро падает
    guard.loyalty = Math.max(0, guard.loyalty - 5);
    if (isPlayer && guard.unpaid_turns === 1) {
      addEventLog(
        `⚔️ Казна не может оплатить гвардию (нужно ${cost} монет). Лояльность гвардии падает.`,
        'warning'
      );
    }
  }

  // 2. Естественный дрейф лояльности
  const loyDecay = 0.5 + Math.random() * 1.0;
  guard.loyalty = Math.max(0, guard.loyalty - loyDecay);

  // 3. Гвардия > 60: подавление уличных беспорядков — счастье −10, revolt_pressure снижается
  if (guard.size > 60) {
    if (nation.population) {
      nation.population.happiness = Math.max(0, (nation.population.happiness ?? 50) - 10);
    }
    // Гвардия разгоняет протесты
    if (nation._revolt_pressure > 0) {
      nation._revolt_pressure = Math.max(0, nation._revolt_pressure - 15);
    }
  }

  // 4. Гвардия > 80 && неоплаченных ходов > 3 → риск coup от гвардии (5%)
  if (guard.size > 80 && (guard.unpaid_turns ?? 0) > 3 && Math.random() < 0.05) {
    _triggerGuardCoup(nation, nationId, isPlayer);
  }
}

/**
 * Переворот самой гвардии против тирана.
 */
function _triggerGuardCoup(nation, nationId, isPlayer) {
  const gov = nation.government;
  gov.stability  = Math.max(0, (gov.stability  ?? 50) - 45);
  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 35);
  if (nation.military) nation.military.loyalty = Math.max(0, (nation.military.loyalty ?? 50) - 30);

  // Гвардия распускается после переворота
  const guardSize = gov.personal_guard?.size ?? 0;
  gov.personal_guard = null;

  if (!gov.transition_history) gov.transition_history = [];
  gov.transition_history.push({
    turn:  GAME_STATE.turn ?? 0,
    from:  'tyranny',
    to:    'tyranny',
    cause: 'Coup d\'état от личной гвардии из-за невыплаты жалованья',
  });

  if (isPlayer) {
    addEventLog(
      `💀 ПЕРЕВОРОТ ГВАРДИИ! Личная гвардия (${guardSize} чел.), не получавшая жалованья, ` +
      `восстала против тирана. Стабильность −45, легитимность −35. Гвардия распущена.`,
      'danger'
    );
  }
}

/**
 * Нанять личную гвардию.
 * @param {string} nationId
 * @param {number} size — размер (10–100)
 * @returns {{ ok: boolean, reason?: string }}
 */
function hirePersonalGuard(nationId, size) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return { ok: false, reason: 'no_nation' };
  const gov = nation.government;
  if (gov.type !== 'tyranny') return { ok: false, reason: 'not_tyranny' };

  const sz = Math.max(10, Math.min(100, size ?? 50));
  const cost = sz * 20; // единовременный найм

  if ((nation.economy?.treasury ?? 0) < cost) {
    return { ok: false, reason: 'no_gold', needed: cost };
  }

  nation.economy.treasury -= cost;
  gov.personal_guard = {
    size:          sz,
    loyalty:       70,
    cost_per_turn: Math.round(sz * 2),
    unpaid_turns:  0,
  };

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(
      `⚔️ Набрана личная гвардия: ${sz} человек. Стоимость найма: −${cost} монет. ` +
      `Содержание: ${gov.personal_guard.cost_per_turn} монет/ход.`,
      'character'
    );
    if (typeof renderGovernmentOverlay === 'function') renderGovernmentOverlay();
  }
  return { ok: true, size: sz, cost };
}

/**
 * Распустить личную гвардию.
 * @param {string} nationId
 * @returns {{ ok: boolean }}
 */
function disbandPersonalGuard(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.government) return { ok: false };
  const gov = nation.government;
  if (!gov.personal_guard) return { ok: false, reason: 'no_guard' };

  const sz = gov.personal_guard.size;
  gov.personal_guard = null;

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(`⚔️ Личная гвардия (${sz} чел.) распущена. Защита от заговоров снижена.`, 'warning');
    if (typeof renderGovernmentOverlay === 'function') renderGovernmentOverlay();
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// GOV_008: ТАЙНАЯ ПОЛИЦИЯ — доносы раз в 5 ходов
// ──────────────────────────────────────────────────────────────────────

/**
 * Тик тайной полиции: раз в 5 ходов — донос.
 * 15% шанс ложного доноса: казнь невиновного → −15 легитимности + blood_feud клана.
 */
function processSecretPoliceTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  const sp  = gov.conspiracies?.secret_police;
  if (!sp?.enabled) return;

  // Списываем содержание
  const cost = sp.cost_per_turn ?? 200;
  nation.economy.treasury = Math.max(0, (nation.economy?.treasury ?? 0) - cost);

  const isFalse = Math.random() < 0.15; // 15% ложный донос

  if (isFalse) {
    // Ложный донос — казним случайного невиновного персонажа
    const innocents = (nation.characters ?? []).filter(c =>
      c.alive &&
      !(c.dialogue?.lts_tags ?? []).includes('[Player_Conspirator]') &&
      !(c.dialogue?.lts_tags ?? []).includes('[Conspirator]')
    );

    if (innocents.length > 0) {
      const victim = innocents[Math.floor(Math.random() * innocents.length)];
      victim.alive       = false;
      victim.death_cause = 'executed';
      victim.death_turn  = GAME_STATE.turn ?? 0;

      // Штраф: −15 легитимности
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 15);

      // Blood feud клана — через conspiracy engine если доступен
      const clanId = victim.clan_id ?? victim.faction_id ?? null;
      if (clanId && typeof CONSPIRACY_ENGINE !== 'undefined') {
        try { CONSPIRACY_ENGINE._apply_blood_feud(nationId, clanId, [victim.name]); } catch (_) {}
      }

      if (isPlayer) {
        addEventLog(
          `🕵️ ЛОЖНЫЙ ДОНОС тайной полиции! ${victim.name} казнён как «заговорщик», ` +
          `но был невиновен. Легитимность −15. Клан ${clanId ?? victim.name} поклялся отомстить.`,
          'danger'
        );
      }
    } else if (isPlayer) {
      // Нет персонажей — просто штраф легитимности
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 8);
      addEventLog(
        '🕵️ Ложный донос тайной полиции! Казнён невиновный горожанин. Легитимность −8.',
        'danger'
      );
    }

  } else {
    // Реальный донос — информация о заговоре или положительный эффект
    const realDonosMessages = [
      'Тайная полиция сообщает о тайных встречах недовольных аристократов. Угроза нейтрализована.',
      'Агенты донесли об иностранном шпионе в городе. Шпион схвачен, связи разорваны.',
      'Перехвачена переписка с призывом к восстанию. Зачинщики под наблюдением.',
      'Агент внедрился в подозрительный кружок. Угроза оказалась незначительной.',
      'Донос о складировании оружия. Обыск выявил нарушителей.',
    ];
    const msg = realDonosMessages[Math.floor(Math.random() * realDonosMessages.length)];

    // Небольшой бонус страху (тайная полиция держит народ в страхе)
    if (gov.power_resource?.type === 'fear') {
      gov.power_resource.current = Math.min(100, gov.power_resource.current + 3);
    }

    if (isPlayer) {
      addEventLog(`🕵️ Тайная полиция: ${msg}`, 'info');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// GOV_010: ДАВЛЕНИЕ ВОЙНОЙ НА ПЛЕМЕННОГО ВОЖДЯ
// Полная цепочка последствий мира: decay престижа, ропот старейшин,
// угроза свержения, вызов на поединок от соперника-вождя.
// ══════════════════════════════════════════════════════════════════════

const RIVAL_CHIEF_NAMES = [
  'Брэнн Огнеборец', 'Кагрим Стальной Кулак', 'Тарн Кровавый Топор',
  'Ворн Жестокий', 'Дагрим Волчий Коготь', 'Харак Буревестник',
  'Скальд Тёмный', 'Гунтар Непобедимый', 'Рольф Железная Рука', 'Сигвальд Меченый',
];

function processTribalTick(nation, nationId, isPlayer) {
  const gov = nation.government;
  if (!gov || gov.power_resource?.type !== 'prestige') return;

  // ── Обработка объявленного набега (флаг из UI) ───────────────────
  if (gov._raid_declared) {
    gov._raid_declared = false;
    gov._last_war_turn = GAME_STATE.turn;
    gov.turns_at_peace = 0;
    gov.power_resource.current = Math.min(100, (gov.power_resource.current ?? 50) + 15);
    // Сбрасываем вызов на поединок при успешном набеге
    if (gov._rival_challenge_active) {
      gov._rival_challenge_active = false;
      delete gov._rival_chief_name;
      delete gov._show_challenge_event;
    }
    if (isPlayer) {
      addEventLog(
        `⚔️ Набег объявлен! Воины воодушевлены. Престиж +15. Старейшины довольны вождём.`,
        'military'
      );
    }
    return;
  }

  // ── Обновляем счётчик ходов без войны ────────────────────────────
  const lastWar = gov._last_war_turn ?? 0;
  const turnsAtPeace = GAME_STATE.turn - lastWar;
  gov.turns_at_peace = turnsAtPeace;

  // ── Decay престижа при долгом мире (>10 ходов) ───────────────────
  if (turnsAtPeace > 10) {
    gov.power_resource.current = Math.max(0, gov.power_resource.current - 3);
  }

  const prestige = gov.power_resource.current;

  // ── Дополнительные последствия при >8 ходах мира ─────────────────
  if (turnsAtPeace > 8) {
    // Каждые 4 хода мира: ропот совета + -5 лояльности случайного советника
    if (turnsAtPeace % 4 === 0) {
      if (isPlayer) {
        addEventLog(
          `🏕️ Старейшины начинают сомневаться: «Когда вождь поведёт нас в бой? Мы слабеем без славы!»`,
          'warning'
        );
      }
      const advisors = (nation.characters ?? []).filter(c => c.traits);
      if (advisors.length) {
        const idx = Math.floor(Math.random() * advisors.length);
        const advisor = advisors[idx];
        const prev = advisor.traits.loyalty ?? 50;
        advisor.traits.loyalty = Math.max(0, prev - 5);
        if (isPlayer) {
          addEventLog(
            `👤 ${advisor.name} сомневается в силе вождя. Лояльность: ${prev} → ${advisor.traits.loyalty}.`,
            'warning'
          );
        }
      }
    }
  }

  // ── Престиж < 20: срочное предупреждение (раз в 3 хода) ──────────
  if (prestige < 20 && isPlayer && GAME_STATE.turn % 3 === 0) {
    addEventLog(
      `⚠️ Престиж вождя опасно мал (${Math.round(prestige)})! Срочно нужен набег, иначе власть будет оспорена.`,
      'danger'
    );
  }

  // ── Престиж < 10: автоматический вызов на поединок ───────────────
  if (prestige < 10 && !gov._rival_challenge_active) {
    gov._rival_challenge_active = true;
    const rivalIdx = Math.floor(Math.random() * RIVAL_CHIEF_NAMES.length);
    gov._rival_chief_name = RIVAL_CHIEF_NAMES[rivalIdx];
    gov._show_challenge_event = true;

    if (isPlayer) {
      addEventLog(
        `⚔️ ВЫЗОВ! ${gov._rival_chief_name} бросает вызов вождю перед всем племенем! ` +
        `Примите поединок или уступите власть — решение нужно немедленно.`,
        'danger'
      );
    }
  }
}

// GOV_010: Принять вызов на поединок (вызывается из UI)
function acceptTribalChallenge(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?._rival_challenge_active) return;

  const rivalName = gov._rival_chief_name ?? 'соперник';
  // Итог поединка зависит от текущего престижа и случайности
  const roll = Math.random() * 100;
  const prestige = gov.power_resource?.current ?? 5;
  const winChance = 30 + prestige * 2; // при престиж=5 → 40% победы

  gov._rival_challenge_active = false;
  delete gov._rival_chief_name;
  delete gov._show_challenge_event;

  if (roll < winChance) {
    // Победа: престиж восстанавливается
    gov.power_resource.current = Math.min(100, prestige + 30);
    gov._last_war_turn = GAME_STATE.turn;
    gov.turns_at_peace = 0;
    addEventLog(
      `⚔️ Вождь победил ${rivalName} в поединке! Племя ликует. Престиж +30. Авторитет восстановлен.`,
      'military'
    );
  } else {
    // Поражение: вождь теряет половину власти
    gov.power_resource.current = Math.max(0, prestige - 20);
    gov.stability = Math.max(0, (gov.stability ?? 50) - 25);
    addEventLog(
      `💀 Вождь проиграл ${rivalName} поединок! Племя требует смены лидера. Престиж −20, Стабильность −25.`,
      'danger'
    );
  }
}

// GOV_010: Уступить власть (вождь добровольно отходит)
function yieldTribalPower(nationId) {
  const nation = GAME_STATE.nations[nationId];
  const gov    = nation?.government;
  if (!gov?._rival_challenge_active) return;

  const rivalName = gov._rival_chief_name ?? 'соперник';
  gov._rival_challenge_active = false;
  delete gov._rival_chief_name;
  delete gov._show_challenge_event;

  // Мирная передача власти: меньший штраф стабильности
  gov.stability = Math.max(0, (gov.stability ?? 50) - 15);
  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 20);
  gov.power_resource.current = 0;

  addEventLog(
    `🏕️ Вождь уступил власть ${rivalName}. Племя приняло нового лидера. ` +
    `Стабильность −15, Легитимность −20.`,
    'warning'
  );
}
