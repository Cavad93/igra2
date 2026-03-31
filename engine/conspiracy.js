// ══════════════════════════════════════════════════════════════════════
// CONSPIRACY ENGINE — Динамические заговоры
// ══════════════════════════════════════════════════════════════════════
//
// Жизненный цикл заговора:
//   incubating  — лидер выбран, ячейка формируется (0–15% сената)
//   growing     — активная вербовка, манифест сгенерирован ИИ
//   detected    — разведка донесла, игрок выбирает реакцию
//   resolved    — подавлен / расправа / провал игрока
//   succeeded   — coup: "Час Икс" при успехе заговора
//
// Хранение: nation.conspiracies = [ConspiracyRecord, ...]
// ══════════════════════════════════════════════════════════════════════

class ConspiracyEngine {

  // ══════════════════════════════════════════════════════════════════
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ══════════════════════════════════════════════════════════════════

  _getConspiracies(nationId) {
    const nation = GAME_STATE.nations[nationId];
    if (!Array.isArray(nation.conspiracies)) nation.conspiracies = [];
    return nation.conspiracies;
  }

  _getActive(nationId) {
    return this._getConspiracies(nationId).filter(
      c => c.status === 'incubating' || c.status === 'growing'
    );
  }

  _intelligenceLevel(nationId) {
    // Уровень разведки: из constitutional_state (0–100); default 30
    return GAME_STATE.nations[nationId]?.constitutional_state?.intelligence_network ?? 30;
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. ИНКУБАЦИЯ — check_conspiracy_trigger()
  // ══════════════════════════════════════════════════════════════════
  // Вызывать раз в 5 ходов. forced = true пропускает численный барьер
  // (используется из ConstitutionalEngine при tyranny ≥ 80).

  check_conspiracy_trigger(nationId, { forced = false } = {}) {
    const mgr  = getSenateManager(nationId);
    if (!mgr) return null;

    // Не создаём новый заговор если уже есть активный от этой нации
    if (!forced && this._getActive(nationId).length > 0) return null;

    // ── Поиск кандидатов-лидеров ─────────────────────────────────
    const candidates = mgr.senators.filter(
      s => s.ambition_level > 4 && s.loyalty_score < 20
    );
    if (!candidates.length) return null;

    // ── Взвешенный выбор: клан с Vendetta даёт +50% ──────────────
    const weights = candidates.map(s => {
      const clan = s.clan_id ? mgr.clans[s.clan_id] : null;
      return clan?.vendetta ? 1.5 : 1.0;
    });
    const totalWeight = weights.reduce((a, w) => a + w, 0);
    let rand = Math.random() * totalWeight;
    let leader = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { leader = candidates[i]; break; }
    }

    // ── Формируем объект заговора ─────────────────────────────────
    const stealth = 50 + Math.floor(Math.random() * 31); // 50–80
    const record  = {
      id:                  `CONS_${nationId.toUpperCase()}_${GAME_STATE.turn}`,
      leader_id:           leader.id,
      leader_name:         leader.name  ?? `[${mgr._clanName(leader.clan_id)}]`,
      leader_clan:         mgr._clanName(leader.clan_id),
      members:             [leader.id],
      conspiracy_stealth:  stealth,
      preparation:         0,       // 0–100; при 100 → Час Икс
      manifest:            null,    // заполняется LLM при > 15% сената
      manifest_generated:  false,
      status:              'incubating',
      turn_started:        GAME_STATE.turn,
      detected_by_player:  false,
    };

    leader.is_conspiracy_leader = true;
    leader.conspiracy_id        = record.id;

    this._getConspiracies(nationId).push(record);

    // Игрок не знает об этом — тихая запись
    console.info(`[CONSPIRACY] Новый заговор ${record.id}: лидер ${record.leader_name} (скрытность ${stealth})`);
    return record;
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. ВЕРБОВКА — expand_conspiracy()
  // ══════════════════════════════════════════════════════════════════
  // Вызывается каждый ход для каждого активного заговора.

  async expand_conspiracy(nationId) {
    const mgr         = getSenateManager(nationId);
    const arch        = GAME_STATE.nations[nationId]?.senate_config?.state_architecture;
    const capacity    = arch?.senate_capacity ?? mgr?.senators.length ?? 90;
    if (!mgr) return;

    for (const cons of this._getActive(nationId)) {
      // Нарастание готовности: +5 за ход
      cons.preparation = Math.min(100, cons.preparation + 5);

      // ── Попытка вербовки ──────────────────────────────────────
      const leader = mgr.getSenatorById(cons.leader_id);
      if (!leader) continue;

      const nonMembers = mgr.senators.filter(s => !cons.members.includes(s.id));
      if (!nonMembers.length) continue;

      const target = nonMembers[Math.floor(Math.random() * nonMembers.length)];

      const sameClan   = target.clan_id && target.clan_id === leader.clan_id;
      const sharedInterest = (target.hidden_interests ?? []).some(
        i => (leader.hidden_interests ?? []).includes(i)
      );

      if (target.loyalty_score < 30 && (sameClan || sharedInterest)) {
        cons.members.push(target.id);
        // Каждый новый участник снижает скрытность
        cons.conspiracy_stealth = Math.max(5, cons.conspiracy_stealth - 3);
        target.conspiracy_id = cons.id;
      }

      // ── Переход incubating → growing при > 15% состава сената ──
      const threshold15pct = Math.ceil(capacity * 0.15);
      if (cons.status === 'incubating' && cons.members.length >= threshold15pct) {
        cons.status = 'growing';
        // LLM генерирует манифест один раз
        if (!cons.manifest_generated) {
          cons.manifest_generated = true;
          this._generateManifest(nationId, cons).catch(err =>
            console.warn('[CONSPIRACY] manifest LLM error:', err.message)
          );
        }
      }

      // ── Час Икс ──────────────────────────────────────────────
      if (cons.preparation >= 100) {
        await this._trigger_hour_x(nationId, cons);
        return; // Только одно критическое событие за ход
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. МАНИФЕСТ — LLM генерирует имя, цель, текст
  // ══════════════════════════════════════════════════════════════════

  async _generateManifest(nationId, cons) {
    if (typeof generateConspiracyManifestViaLLM !== 'function') return;
    const mgr    = getSenateManager(nationId);
    const nation = GAME_STATE.nations[nationId];
    const leader = mgr?.getSenatorById(cons.leader_id);

    const recentLaws = (nation.active_laws ?? [])
      .slice(-5)
      .map(l => l.name ?? l.id ?? String(l));

    const context = {
      leader_name:    cons.leader_name,
      leader_clan:    cons.leader_clan,
      leader_traits:  leader?.traits            ?? [],
      leader_interests: (leader?.hidden_interests ?? [])
        .filter(i => i !== 'Blackmailed'),
      member_count:   cons.members.length,
      clan_vendetta:  mgr?.clans[leader?.clan_id]?.vendetta ?? false,
      recent_laws:    recentLaws,
      senate_mood:    mgr?.global_senate_state ?? '',
    };

    const manifest = await generateConspiracyManifestViaLLM(context);
    if (manifest) {
      cons.manifest     = manifest;
      cons.secret_name  = manifest.name;
      cons.goal         = manifest.goal;
      addEventLog(
        `🌑 Тёмные слухи ползут по городу... говорят о тайном союзе «${manifest.name}». Их цель — ${manifest.goal}.`,
        'danger'
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. РАЗВЕДКА — check_intelligence()
  // ══════════════════════════════════════════════════════════════════
  // Вызывается раз в 5 ходов.
  // Возвращает { exposed, conspiracy } или null.

  check_intelligence(nationId) {
    const intel = this._intelligenceLevel(nationId);

    for (const cons of this._getActive(nationId)) {
      if (cons.detected_by_player) continue;

      // Шанс обнаружения: (intel - stealth) нормализовано
      const detectChance = Math.max(0.05,
        Math.min(0.90, (intel - cons.conspiracy_stealth + 50) / 100)
      );

      if (Math.random() < detectChance) {
        cons.detected_by_player = true;
        cons.status = 'detected';

        const mgr    = getSenateManager(nationId);
        const leader = mgr?.getSenatorById(cons.leader_id);
        const clan   = mgr?.clans[leader?.clan_id];

        addEventLog(
          `🕵️ Наш шпион в клане «${cons.leader_clan}» сообщает о тайных встречах под предводительством ${cons.leader_name}. Численность группы — ${cons.members.length} человек.`,
          'warning'
        );

        return { exposed: true, conspiracy: cons };
      }
    }
    return null;
  }

  // Возвращает меню вариантов реакции игрока (для UI).
  get_player_options(conspiracyId, nationId) {
    const cons = this._getConspiracies(nationId).find(c => c.id === conspiracyId);
    if (!cons) return [];
    return [
      {
        id:     'arrest',
        label:  '⚔️ Арестовать всех известных участников',
        risk:   'Немедленная ликвидация, но кланы участников получат [Blood_Feud].',
      },
      {
        id:     'surveillance',
        label:  '🔍 Установить слежку',
        risk:   'Попытка выявить всех участников. Успех зависит от уровня разведки.',
      },
      {
        id:     'bribe_leader',
        label:  '💰 Подкупить лидера',
        risk:   'Развалить заговор изнутри. Успех зависит от казны и тегов лидера.',
      },
    ];
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. ЛИКВИДАЦИЯ — resolve_conspiracy()
  // ══════════════════════════════════════════════════════════════════

  async resolve_conspiracy(nationId, conspiracyId, outcome) {
    const cons = this._getConspiracies(nationId).find(c => c.id === conspiracyId);
    const mgr  = getSenateManager(nationId);
    if (!cons || !mgr) return { success: false };

    switch (outcome) {

      // ── Арест / Казнь ──────────────────────────────────────────
      case 'arrest': {
        const knownIds = cons.detected_by_player
          ? cons.members
          : [cons.leader_id]; // без слежки — только лидер известен

        const executed = [];
        for (const sid of knownIds) {
          const senator = mgr.getSenatorById(sid);
          if (!senator) continue;
          executed.push({ name: senator.name ?? '?', clan_id: senator.clan_id });
          mgr.replace_senator(senator, 'exile');
        }

        // Blood_Feud для каждого пострадавшего клана
        const affectedClans = new Set(executed.map(e => e.clan_id).filter(Boolean));
        for (const clanId of affectedClans) {
          this._apply_blood_feud(nationId, clanId,
            executed.filter(e => e.clan_id === clanId).map(e => e.name)
          );
        }

        cons.status = 'resolved';
        this._cleanupMemberTags(nationId, cons);

        addEventLog(
          `⚔️ Заговор «${cons.secret_name ?? cons.id}» подавлен. ${executed.length} участников арестованы. Казни породят Blood_Feud в ${affectedClans.size} кланах.`,
          'danger'
        );

        // Tyranny: публичные казни добавляют тирании
        const constitState = GAME_STATE.nations[nationId]?.constitutional_state;
        if (constitState) {
          constitState.tyranny_points = Math.min(200,
            (constitState.tyranny_points ?? 0) + executed.length * 8
          );
        }

        return { success: true, executed: executed.length, blood_feuds: affectedClans.size };
      }

      // ── Слежка: выявляем всех участников ─────────────────────
      case 'surveillance': {
        const intel = this._intelligenceLevel(nationId);
        const successChance = Math.min(0.90, intel / 100 * 1.2);

        if (Math.random() < successChance) {
          // Открываем hidden_interests всех участников как 'Conspirator'
          for (const sid of cons.members) {
            const senator = mgr.getSenatorById(sid);
            if (!senator) continue;
            if (!senator.revealed_interests) senator.revealed_interests = [];
            if (!senator.revealed_interests.includes('Conspirator')) {
              senator.revealed_interests.push('Conspirator');
            }
          }
          cons.all_members_known = true;
          addEventLog(
            `🔍 Слежка успешна! Все ${cons.members.length} участников «${cons.secret_name ?? 'заговора'}» установлены. Теперь вы можете действовать точечно.`,
            'good'
          );
          return { success: true, members_revealed: cons.members.length };
        } else {
          // Провал: заговорщики обнаружили слежку, скрытность растёт
          cons.conspiracy_stealth = Math.min(90, cons.conspiracy_stealth + 15);
          addEventLog(
            `⚠️ Слежка провалена — ${cons.leader_name} почуял слежку. Заговорщики залегли на дно.`,
            'warning'
          );
          return { success: false };
        }
      }

      // ── Подкуп лидера ─────────────────────────────────────────
      case 'bribe_leader': {
        const leader  = mgr.getSenatorById(cons.leader_id);
        if (!leader) return { success: false };

        const nation  = GAME_STATE.nations[nationId];
        const treasury = nation.economy?.treasury ?? 0;
        const bribeAmt  = Math.min(treasury, Math.round(leader.wealth * 0.8));

        if (bribeAmt < leader.wealth * 0.3) {
          addEventLog('💰 Казна слишком пуста — подкуп невозможен.', 'warning');
          return { success: false, reason: 'insufficient_funds' };
        }

        const result = mgr.attempt_bribe(cons.leader_id, bribeAmt);
        if (result.success) {
          // Подкупленный лидер разваливает заговор изнутри
          cons.status = 'resolved';
          this._cleanupMemberTags(nationId, cons);
          nation.economy.treasury -= bribeAmt;

          addEventLog(
            `💰 ${result.senator_name} принял золото. Заговор «${cons.secret_name ?? '?'}» распался изнутри. Казна: −${bribeAmt}.`,
            'good'
          );
          return { success: true, cost: bribeAmt, blackmailed: true };
        } else if (result.scandal) {
          // Скандал: все узнают о попытке подкупа
          const constitState = GAME_STATE.nations[nationId]?.constitutional_state;
          if (constitState) {
            constitState.player_honor = Math.max(0, (constitState.player_honor ?? 100) - 20);
            constitState.tyranny_points = Math.min(200, (constitState.tyranny_points ?? 0) + 15);
          }
          addEventLog(
            `😱 СКАНДАЛ! ${result.senator_name} (${result.clan}) публично разоблачил попытку подкупа. Честь Консула падает.`,
            'danger'
          );
          return { success: false, scandal: true };
        } else {
          addEventLog(
            `❌ ${result.senator_name} отверг предложение. Заговор продолжается.`,
            'warning'
          );
          return { success: false };
        }
      }

      default:
        return { success: false, reason: 'unknown_outcome' };
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ЧАС ИКС — preparation достигла 100%
  // ══════════════════════════════════════════════════════════════════

  async _trigger_hour_x(nationId, cons) {
    const nation  = GAME_STATE.nations[nationId];
    const mgr     = getSenateManager(nationId);
    const isPlayer = nationId === GAME_STATE.player_nation;

    cons.status = 'hour_x';

    addEventLog(
      `🗡️ ЧАС ИКС! Заговор «${cons.secret_name ?? cons.id}» перешёл к действию. ${cons.leader_name} выступил открыто.`,
      'danger'
    );

    if (!isPlayer) return; // Для AI-наций просто регистрируем

    // ── Проверка лояльности армии и личной охраны ────────────────
    const armyLoyalty   = nation.military?.loyalty   ?? 50;
    const personalGuard = this._getPersonalGuardStrength(nationId);
    const defenseScore  = Math.round((armyLoyalty * 0.6) + (personalGuard * 0.4));

    // Сила заговора vs защита игрока
    const conspiracyStrength = Math.round(
      (cons.members.length / Math.max(1, mgr?.senators.length ?? 90)) * 100 +
      (100 - cons.conspiracy_stealth)
    );

    if (defenseScore >= conspiracyStrength) {
      // ── Игрок выстоял — заговор подавлен ─────────────────────
      const suppressed = Math.min(cons.members.length, Math.ceil(cons.members.length * 0.7));
      cons.status = 'resolved';

      // Казним всех известных участников
      const casualties = [];
      for (const sid of cons.members.slice(0, suppressed)) {
        const senator = mgr?.getSenatorById(sid);
        if (!senator) continue;
        casualties.push({ name: senator.name ?? '?', clan_id: senator.clan_id });
        mgr?.replace_senator(senator, 'exile');
      }
      this._cleanupMemberTags(nationId, cons);

      // Blood_Feud для всех кланов
      const clanIds = new Set(casualties.map(c => c.clan_id).filter(Boolean));
      for (const cid of clanIds) {
        this._apply_blood_feud(nationId, cid,
          casualties.filter(c => c.clan_id === cid).map(c => c.name)
        );
      }

      // Тяжёлые потери даже при победе
      if (nation.government) {
        nation.government.stability  = Math.max(0, (nation.government.stability  ?? 50) - 20);
        nation.government.legitimacy = Math.max(0, (nation.government.legitimacy ?? 50) - 15);
      }
      nation.military.loyalty = Math.max(0, armyLoyalty - 10);

      addEventLog(
        `🛡️ Заговор подавлен силой! ${casualties.length} заговорщиков арестованы. Стабильность −20. Армия устала.`,
        'warning'
      );

    } else {
      // ── Coup успешен: катастрофические последствия ────────────
      cons.status = 'succeeded';

      if (nation.government) {
        nation.government.stability  = Math.max(0, (nation.government.stability  ?? 50) - 50);
        nation.government.legitimacy = Math.max(0, (nation.government.legitimacy ?? 50) - 50);
      }
      if (nation.military) {
        nation.military.loyalty = Math.max(0, armyLoyalty - 40);
        nation.military.morale  = Math.max(0, (nation.military.morale ?? 50) - 30);
      }
      if (nation.population) {
        nation.population.happiness = Math.max(0, (nation.population.happiness ?? 50) - 35);
      }

      const constitState = GAME_STATE.nations[nationId]?.constitutional_state;
      if (constitState) constitState.tyranny_points = 0; // власть рухнула

      addEventLog(
        `💀 ПЕРЕВОРОТ! ${cons.leader_name} захватил власть. Правление Консула рухнуло. Сиракузы в хаосе.`,
        'danger'
      );
    }
  }

  _getPersonalGuardStrength(nationId) {
    const nation = GAME_STATE.nations[nationId];
    const gov = nation?.government;

    // GOV_008: используем реальный объект personal_guard если есть
    if (gov?.personal_guard && gov.personal_guard.size > 0) {
      const guard = gov.personal_guard;
      // Эффективная сила: размер × лояльность (0-1)
      return Math.round(guard.size * (guard.loyalty / 100));
    }

    // Fallback: проверяем институт гвардии
    const institutions = gov?.institutions ?? [];
    const guardInst = institutions.find(i =>
      (i.name ?? '').toLowerCase().includes('гвар') ||
      (i.id   ?? '').toLowerCase().includes('guard')
    );
    if (guardInst) return 60 + Math.floor(Math.random() * 20);

    // Последний fallback — от численности армии
    return Math.min(80, Math.round((nation.military?.infantry ?? 0) / 100));
  }

  // ══════════════════════════════════════════════════════════════════
  // BLOOD_FEUD — вечный штраф клана
  // ══════════════════════════════════════════════════════════════════

  _apply_blood_feud(nationId, clanId, victimNames = []) {
    const mgr = getSenateManager(nationId);
    if (!mgr) return;
    const clan = mgr.clans[clanId];
    if (!clan) return;

    // Клан получает Blood_Feud
    clan.blood_feud       = true;
    clan.blood_feud_since = GAME_STATE.turn;
    if (!clan.blood_feud_victims) clan.blood_feud_victims = [];
    for (const name of victimNames) {
      clan.blood_feud_victims.push({ name, turn: GAME_STATE.turn });
    }

    // Немедленный штраф: −30 к лояльности всех членов (навсегда)
    for (const senator of mgr.getClanMembers(clanId)) {
      senator.loyalty_score = Math.max(0, senator.loyalty_score - 30);
      // Скрытый тег для будущих диалогов
      if (!senator.hidden_interests) senator.hidden_interests = [];
      if (!senator.hidden_interests.includes('Blood_Feud')) {
        senator.hidden_interests.push('Blood_Feud');
      }
    }

    // Клановая репутация — запись с максимальным весом
    mgr.update_clan_reputation(clanId, -60); // ripple −30 поверх прямого штрафа

    const victimsStr = victimNames.length
      ? `(${victimNames.slice(0, 2).join(', ')}${victimNames.length > 2 ? '…' : ''})`
      : '';
    addEventLog(
      `🩸 Клан «${clan.name}» поклялся отомстить за своих ${victimsStr}. Флаг [Blood_Feud] — вечная ненависть к Консулу.`,
      'danger'
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // УТИЛИТЫ
  // ══════════════════════════════════════════════════════════════════

  // Убирает conspiracy_id / is_conspiracy_leader с сенаторов после роспуска
  _cleanupMemberTags(nationId, cons) {
    const mgr = getSenateManager(nationId);
    if (!mgr) return;
    for (const sid of cons.members) {
      const senator = mgr.getSenatorById(sid);
      if (!senator) continue;
      delete senator.is_conspiracy_leader;
      delete senator.conspiracy_id;
    }
  }

  // Возвращает объект заговора по id
  getById(nationId, conspiracyId) {
    return this._getConspiracies(nationId).find(c => c.id === conspiracyId) ?? null;
  }

  // Все известные игроку заговоры (detected_by_player = true)
  getDetected(nationId) {
    return this._getConspiracies(nationId).filter(c => c.detected_by_player);
  }

  // ══════════════════════════════════════════════════════════════════
  // ТИК — вызывается из processTurn() каждый ход
  // ══════════════════════════════════════════════════════════════════

  async tick(nationId) {
    const isPlayer = nationId === GAME_STATE.player_nation;

    // Раз в 5 ходов: аудит сената — может появиться новый заговор
    if (GAME_STATE.turn % 5 === 0) {
      this.check_conspiracy_trigger(nationId);
    }

    // Каждый ход: вербовка в активных заговорах
    await this.expand_conspiracy(nationId);

    // Раз в 5 ходов: разведка пытается обнаружить заговор
    if (isPlayer && GAME_STATE.turn % 5 === 0) {
      this.check_intelligence(nationId);
    }

    // Убираем устаревшие resolved/succeeded заговоры (старше 60 ходов)
    const nation = GAME_STATE.nations[nationId];
    if (Array.isArray(nation.conspiracies)) {
      nation.conspiracies = nation.conspiracies.filter(c =>
        c.status === 'incubating' || c.status === 'growing' ||
        c.status === 'detected'   ||
        (c.status === 'resolved'  && GAME_STATE.turn - c.turn_started < 60) ||
        (c.status === 'succeeded' && GAME_STATE.turn - c.turn_started < 60)
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// SINGLETON
// ══════════════════════════════════════════════════════════════════════
const CONSPIRACY_ENGINE = new ConspiracyEngine();
