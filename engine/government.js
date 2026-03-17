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
    // Затраты тайной полиции
    if (gov.conspiracies.secret_police?.enabled) {
      nation.economy.treasury = Math.max(0,
        nation.economy.treasury - gov.conspiracies.secret_police.cost_per_turn
      );
    }
    const chance = calculateConspiracyChance(nation);
    if (Math.random() < chance) {
      triggerConspiracy(nationId);
    }
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

  // 6. Племя — падение престижа без войны
  if (gov.type === 'tribal' && gov.power_resource?.type === 'prestige') {
    const lastWar = gov._last_war_turn ?? 0;
    if (GAME_STATE.turn - lastWar > 10) {
      gov.power_resource.current = Math.max(0, gov.power_resource.current - 3);
      if (isPlayer && gov.power_resource.current < 30) {
        addEventLog('🏕️ Вождь давно не воевал. Воины начинают сомневаться в его силе.', 'warning');
      }
    }
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

  // Есть ли наследник?
  const heir = (nation.characters ?? []).find(c =>
    c.alive && (c.wants ?? []).some(w => String(w).includes('наследник') || String(w).includes('heir'))
  );

  if (heir) {
    // Плавная передача власти
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name = heir.name;
    gov.ruler.character_id = heir.id;
    gov.legitimacy = Math.max(20, (gov.legitimacy ?? 50) - 10);
    if (isPlayer) {
      addEventLog(`👑 ${heir.name} занял трон. Переход власти прошёл без потрясений.`, 'character');
    }
    return;
  }

  // Нет наследника → кризис
  gov.stability  = Math.max(0, (gov.stability  ?? 50) - 25);
  gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 20);
  nation.military.loyalty = Math.max(0, (nation.military.loyalty ?? 50) - 15);

  if (isPlayer) {
    addEventLog(
      '💀 КРИЗИС НАСЛЕДОВАНИЯ: правитель мёртв, наследника нет! '
      + 'Стабильность −25, легитимность −20, лояльность армии −15. '
      + 'Фракции тянутся к власти.',
      'danger'
    );
  }

  // Назначаем нового правителя из персонажей с высоким честолюбием
  const candidates = (nation.characters ?? [])
    .filter(c => c.alive)
    .sort((a, b) => (b.traits?.ambition ?? 0) - (a.traits?.ambition ?? 0));

  if (candidates.length) {
    const usurper = candidates[0];
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name         = usurper.name;
    gov.ruler.character_id = usurper.id;
    if (isPlayer) {
      addEventLog(`⚔️ ${usurper.name} захватил власть силой. Государство нестабильно.`, 'danger');
    }
  }
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

function triggerElection(nationId) {
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
    // Нет кандидатов — действующий правитель остаётся
    if (isPlayer) addEventLog('⚖️ Выборы: других кандидатов не нашлось. Агафокл продолжает править.', 'info');
    gov.elections.next_election = gov.elections.frequency_turns;
    return;
  }

  // ── Голосование сенаторов по каждому кандидату ──────────────────
  // Кандидат с наибольшей поддержкой побеждает.
  let winner = null;
  let winnerScore = -Infinity;

  for (const candidate of candidates) {
    // Базовая поддержка: лояльность фракционных коллег + личный авторитет
    let support = 0;
    if (mgr) {
      for (const senator of mgr.senators) {
        const sameF    = senator.faction_id === candidate.faction_id ? 20 : 0;
        const sameClan = senator.clan_id === candidate.clan_id      ? 15 : 0;
        const base     = senator.loyalty_score * 0.4 + (candidate.influence ?? 40) * 0.3;
        support += base + sameF + sameClan + (Math.random() - 0.5) * 20;
      }
    }
    if (support > winnerScore) { winnerScore = support; winner = candidate; }
  }

  if (!winner) return;

  // ── Применяем результат ──────────────────────────────────────────
  const prevConsul    = gov.elections?.last_consul ?? gov.ruler?.name ?? 'прежний консул';
  const isNewConsul   = winner.name !== prevConsul;

  if (isNewConsul) {
    gov.ruler = gov.ruler ?? {};
    gov.ruler.name         = winner.name;
    gov.ruler.character_id = winner.character_id ?? null;

    gov.elections.last_consul = winner.name;

    // Легитимность растёт при честных выборах
    gov.legitimacy = Math.min(100, (gov.legitimacy ?? 50) + 8);

    // Проигравшие кандидаты — -5 лояльности (обида)
    if (mgr) {
      for (const loser of candidates) {
        if (loser.id !== winner.id) loser.loyalty_score = Math.max(0, loser.loyalty_score - 5);
      }
      // Победитель становится лидером своей фракции
      mgr._electFactionLeader(winner.faction_id, 'election');
      mgr._recalculateSenateState();
    }

    if (isPlayer) {
      const candidateNames = candidates.map(c => c.name).join(', ');
      addEventLog(
        `⚖️ ВЫБОРЫ КОНСУЛА: кандидаты — ${candidateNames}. Сенат проголосовал. ` +
        `Победитель: ${winner.name} (${mgr?._factionName(winner.faction_id) ?? ''}). Легитимность +8.`,
        'law'
      );
    }
  } else {
    if (isPlayer) {
      addEventLog(`⚖️ Выборы: ${winner.name} переизбран консулом. Сенат доволен преемственностью.`, 'law');
    }
    gov.legitimacy = Math.min(100, (gov.legitimacy ?? 50) + 3);
  }

  gov.elections.next_election = gov.elections.frequency_turns;
}

// ──────────────────────────────────────────────────────────────────────
// ПЕРЕХОД МЕЖДУ ФОРМАМИ
// ──────────────────────────────────────────────────────────────────────

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

  trans.turns_elapsed = (trans.turns_elapsed ?? 0) + 1;

  // Штрафы переходного периода (каждый ход)
  const pen = trans.transition_penalties ?? {};
  if (pen.stability)    gov.stability    = Math.max(0, (gov.stability ?? 50) + pen.stability);
  if (pen.army_loyalty) nation.military.loyalty = Math.max(0, nation.military.loyalty + pen.army_loyalty);
  if (pen.legitimacy)   gov.legitimacy   = Math.max(0, gov.legitimacy + pen.legitimacy);

  // Случайное событие во время перехода (20% шанс)
  if (Math.random() < 0.20 && nationId === GAME_STATE.player_nation) {
    const evts = [
      'Аристократы требуют замедлить реформы.',
      'Армия сохраняет нейтралитет — пока.',
      'Соседние державы с интересом наблюдают за нестабильностью.',
      'Народ на улицах поддерживает перемены.',
    ];
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

  if (!gov.transition_history) gov.transition_history = [];
  gov.transition_history.push({
    turn: GAME_STATE.turn,
    from: oldType,
    to: newType,
    cause: trans.cause,
  });

  if (nationId === GAME_STATE.player_nation) {
    addEventLog(
      `✅ Переход завершён. Новая форма: ${getGovernmentNameFull(newType)}. Легитимность стабилизируется.`,
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

  const total = votesFor + votesAgainst + votesAbstain;
  const quorum = (institution.quorum ?? 51) / 100;
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
