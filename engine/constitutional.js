// ══════════════════════════════════════════════════════════════════════
// CONSTITUTIONAL ENGINE — Фундаментальные правила игры
// ══════════════════════════════════════════════════════════════════════
//
// Управляет StateArchitecture (конституционными мета-правилами):
//   senate_capacity, election_cycle, consul_term,
//   consul_powers, voting_system, veto_rights
//
// Все вычисления — чистая математика, без LLM.
// LLM вызывается только через generateConstitutionalChronicleViaLLM()
// (определена в ai/claude.js).
// ══════════════════════════════════════════════════════════════════════

// Допустимые значения перечислимых параметров
const CONSUL_POWERS   = ['Limited', 'Standard', 'Dictatorial'];
const VOTING_SYSTEMS  = ['Plutocracy', 'Meritocracy', 'Democracy'];

// Уровни consul_powers → допустимые действия без голосования
const POWER_COMMANDS = {
  Limited:      ['build', 'trade'],
  Standard:     ['build', 'trade', 'reform', 'diplomacy'],
  Dictatorial:  ['build', 'trade', 'reform', 'diplomacy', 'war', 'proscription', 'exile'],
};

class ConstitutionalEngine {

  // ══════════════════════════════════════════════════════════════════
  // ВНУТРЕННИЙ ДОСТУП К СОСТОЯНИЮ
  // ══════════════════════════════════════════════════════════════════

  // Возвращает constitutional_state нации (создаёт если нет).
  _getState(nationId) {
    const nation = GAME_STATE.nations[nationId];
    if (!nation.constitutional_state) {
      nation.constitutional_state = {
        tyranny_points:       0,
        player_honor:         100,    // 0–100: репутация Консула в глазах Сената
        civil_war_threat:     false,
        civil_war_turn:       null,   // ход, когда угроза появилась
        civil_war_countdown:  null,   // ходов до восстания (3–5)
        conspiracy:           null,   // { leader_id, leader_name, clan, strength, turn_started }
      };
    }
    return nation.constitutional_state;
  }

  // Возвращает StateArchitecture или null.
  getArchitecture(nationId) {
    return GAME_STATE.nations[nationId]?.senate_config?.state_architecture ?? null;
  }

  // Список команд, доступных Консулу без голосования.
  getConsulCommands(nationId) {
    const arch = this.getArchitecture(nationId);
    return POWER_COMMANDS[arch?.consul_powers ?? 'Standard'];
  }

  // ══════════════════════════════════════════════════════════════════
  // ТИРАНИЯ
  // ══════════════════════════════════════════════════════════════════

  _addTyranny(nationId, points) {
    const state = this._getState(nationId);
    state.tyranny_points = Math.min(200, state.tyranny_points + points);

    if (state.tyranny_points >= 80) {
      this.initiate_conspiracy(nationId);
    }
  }

  _decayTyranny(nationId) {
    const state = this._getState(nationId);
    // Ежегодное затухание: −3 за год, но не ниже базы consul_term
    state.tyranny_points = Math.max(0, state.tyranny_points - 3);
  }

  // ══════════════════════════════════════════════════════════════════
  // РАСЧЁТ СОПРОТИВЛЕНИЯ РЕФОРМЕ
  // ══════════════════════════════════════════════════════════════════

  // Возвращает resistance (0–100) для смены параметра arch[key] → newValue.
  calculate_reform_resistance(nationId, key, newValue) {
    const arch = this.getArchitecture(nationId);
    const mgr  = getSenateManager(nationId);
    if (!arch) return 50;

    const old = arch[key];
    let resistance = 0;

    switch (key) {
      case 'senate_capacity': {
        if (newValue < old) {
          // Страх исключения: пропорционально проценту сокращения
          const cutRatio = (old - newValue) / old;
          resistance = Math.round(cutRatio * 100);
        } else {
          resistance = 10; // расширение: слабое сопротивление аристократов
        }
        break;
      }

      case 'consul_term': {
        if (newValue > old) {
          // Экспоненциальный рост: сверх 2 лет
          const excess = Math.max(0, newValue - 2);
          resistance = Math.min(100, excess * 25);
        }
        break;
      }

      case 'consul_powers': {
        const oldIdx = CONSUL_POWERS.indexOf(old);
        const newIdx = CONSUL_POWERS.indexOf(newValue);
        resistance = Math.max(0, (newIdx - oldIdx) * 30);
        break;
      }

      case 'voting_system': {
        // Изменение системы всегда встречает сопротивление заинтересованных групп
        if (old === 'Plutocracy' && newValue !== 'Plutocracy') {
          // Богатые теряют влияние → высокое сопротивление аристократов
          resistance = 60;
        } else if (newValue === 'Plutocracy') {
          // Народ теряет влияние → высокое сопротивление демоса
          resistance = 55;
        } else {
          resistance = 30;
        }
        break;
      }

      case 'election_cycle': {
        // Удлинение цикла — концентрация власти
        if (newValue > old) resistance = Math.min(80, (newValue - old) * 15);
        else                resistance = 10;
        break;
      }

      case 'veto_rights': {
        // Снятие вето: демос сопротивляется сильно
        resistance = newValue ? 15 : 65;
        break;
      }
    }

    // Бонус: если средняя лояльность сената высокая — сопротивление ниже
    if (mgr) {
      const avgLoyalty = mgr.senators.reduce((a, s) => a + s.loyalty_score, 0)
                       / Math.max(1, mgr.senators.length);
      resistance = Math.round(resistance * (1 - (avgLoyalty - 50) / 200));
    }

    return Math.max(0, Math.min(100, resistance));
  }

  // ══════════════════════════════════════════════════════════════════
  // ПРИНЯТИЕ КОНСТИТУЦИОННОГО ЗАКОНА (66% порог)
  // ══════════════════════════════════════════════════════════════════

  // changes: { senate_capacity: 120, consul_term: 3, ... }
  // Возвращает расширенный voteResult + architecture_changed boolean.
  async process_constitutional_law(nationId, lawName, changes) {
    const mgr   = getSenateManager(nationId);
    const arch  = this.getArchitecture(nationId);
    const state = this._getState(nationId);
    if (!mgr || !arch) return null;

    // Суммарное сопротивление → штраф к лояльности всех фракций
    let totalResistance = 0;
    for (const [key, newVal] of Object.entries(changes)) {
      totalResistance += this.calculate_reform_resistance(nationId, key, newVal);
    }
    totalResistance = Math.min(80, Math.round(totalResistance / Object.keys(changes).length));

    const factionMods = {};
    for (const f of mgr.factions) {
      factionMods[f.id] = -Math.round(totalResistance * 0.4);
    }

    const voteResult = mgr.process_vote({
      threshold:         66,
      law_type:          'reform',
      faction_modifiers: factionMods,
    });

    if (voteResult.passed) {
      for (const [key, newVal] of Object.entries(changes)) {
        await this._applyArchitectureChange(nationId, key, newVal, arch);
      }

      // Если продавлено подкупом/угрозами (< 30% честных голосов) — угроза войны
      if (voteResult.margin_pct < 30) {
        state.civil_war_threat    = true;
        state.civil_war_turn      = GAME_STATE.turn;
        state.civil_war_countdown = 3 + Math.floor(Math.random() * 3); // 3–5 ходов
        addEventLog(
          `⚠️ Реформа «${lawName}» принята силой и подкупом (${voteResult.margin_pct}% «за»). Народный гнев нарастает — угроза гражданской войны!`,
          'danger'
        );
      } else {
        addEventLog(
          `✅ Конституционная реформа «${lawName}» принята (${voteResult.margin_pct}% «за»).`,
          'law'
        );
      }
    } else {
      addEventLog(
        `❌ Реформа «${lawName}» отклонена (${voteResult.margin_pct}% — нужно 66%).`,
        'law'
      );
    }

    // Нарративный хроникёр (async, не блокирует)
    this._triggerChronicle(nationId, lawName, voteResult, changes).catch(() => {});

    return { ...voteResult, architecture_changed: voteResult.passed };
  }

  // ── Применение одного изменения архитектуры ────────────────────────
  async _applyArchitectureChange(nationId, key, newValue, arch) {
    const old = arch[key];
    arch[key]  = newValue;

    switch (key) {
      case 'senate_capacity':
        // Отдельная механика: expand/shrink
        await this.sync_senate_seats(nationId, newValue);
        break;

      case 'consul_term':
        if (newValue > 2) {
          // Экспоненциальный штраф тирании: каждый год сверх 2 = 2^(n-1) × 10
          const excess = newValue - 2;
          const pts    = Math.round(Math.pow(2, excess - 1) * 10);
          this._addTyranny(nationId, pts);
          addEventLog(
            `⚠️ Срок Консула продлён до ${newValue} лет. Тирания +${pts} (итого: ${this._getState(nationId).tyranny_points}).`,
            'warning'
          );
        } else {
          addEventLog(`📅 Срок Консула изменён: ${newValue} лет.`, 'law');
        }
        break;

      case 'consul_powers':
        if (newValue === 'Dictatorial') {
          this._addTyranny(nationId, 30);
          addEventLog('⚠️ Консул получил диктаторские полномочия (+30 тирании). Сенат в гневе.', 'warning');
        } else if (old === 'Dictatorial') {
          const state = this._getState(nationId);
          state.tyranny_points = Math.max(0, state.tyranny_points - 20);
          addEventLog('✅ Диктаторские полномочия сложены. Тирания −20.', 'good');
        } else {
          addEventLog(`🏛️ Уровень власти Консула: ${newValue}.`, 'law');
        }
        break;

      case 'voting_system':
        // Веса пересчитываются автоматически в следующем process_vote()
        addEventLog(`🗳️ Система голосования изменена: ${old} → ${newValue}. Веса голосов пересчитаны.`, 'law');
        break;

      case 'election_cycle':
        addEventLog(`📅 Выборный цикл: каждые ${newValue} лет.`, 'law');
        break;

      case 'veto_rights':
        if (newValue) addEventLog('⚖️ Учреждён Народный Трибун с правом вето.', 'law');
        else          addEventLog('⚖️ Право вето Народного Трибуна упразднено.', 'law');
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // СИНХРОНИЗАЦИЯ МЕСТ В СЕНАТЕ
  // ══════════════════════════════════════════════════════════════════

  // proscription_list: массив senator_id для ручной чистки.
  // Если пуст при сокращении — автоматически чистятся наименее лояльные.
  async sync_senate_seats(nationId, newCapacity, proscription_list = []) {
    const mgr   = getSenateManager(nationId);
    const arch  = this.getArchitecture(nationId);
    if (!mgr) return;

    const oldCapacity = mgr.senators.length;
    const delta       = newCapacity - oldCapacity;

    if (delta > 0) {
      // ── Расширение: New_Man-сенаторы лояльны Консулу 5 лет (60 ходов) ──
      for (let i = 0; i < delta; i++) {
        const faction = mgr.factions[i % mgr.factions.length];
        const ghost   = mgr._createGhost(faction.id);
        ghost.loyalty_score = 60 + Math.floor(Math.random() * 25); // 60–84
        if (!ghost.hidden_interests.includes('New_Man')) {
          ghost.hidden_interests.push('New_Man');
        }
        ghost._new_man_expires = GAME_STATE.turn + 60;
        mgr.senators.push(ghost);
      }
      addEventLog(
        `🏛️ Сенат расширен: ${oldCapacity} → ${newCapacity} мест. ${delta} сенаторов [New_Man] лояльны Консулу (5 лет).`,
        'law'
      );

    } else if (delta < 0) {
      const toCut = Math.abs(delta);

      // Список на удаление: ручной или автоматический (снизу по лояльности)
      const toRemove = proscription_list.length
        ? proscription_list.map(id => mgr.getSenatorById(id)).filter(Boolean).slice(0, toCut)
        : mgr.senators
            .slice()
            .sort((a, b) => a.loyalty_score - b.loyalty_score)
            .slice(0, toCut);

      // ── Vendetta: кланы, потерявшие > 20% членов ──────────────────────
      const clanTotal   = {};
      const clanRemoved = {};
      for (const s of mgr.senators) {
        if (s.clan_id) clanTotal[s.clan_id] = (clanTotal[s.clan_id] ?? 0) + 1;
      }
      for (const s of toRemove) {
        if (s.clan_id) clanRemoved[s.clan_id] = (clanRemoved[s.clan_id] ?? 0) + 1;
      }
      for (const [clanId, removed] of Object.entries(clanRemoved)) {
        const total = clanTotal[clanId] ?? 1;
        if (removed / total > 0.20) {
          this._apply_vendetta(nationId, clanId);
        }
      }

      // Проскрипции стоят тирании
      const tyrannyCost = toCut * 5;
      this._addTyranny(nationId, tyrannyCost);

      // Удаляем сенаторов
      for (const s of toRemove) {
        const idx = mgr.senators.indexOf(s);
        if (idx !== -1) mgr.senators.splice(idx, 1);
      }

      addEventLog(
        `⚔️ Проскрипции: ${toCut} сенаторов убрано (${oldCapacity} → ${newCapacity} мест). Тирания +${tyrannyCost}.`,
        'danger'
      );
    }

    if (arch) arch.senate_capacity = newCapacity;
  }

  // ══════════════════════════════════════════════════════════════════
  // VENDETTA
  // ══════════════════════════════════════════════════════════════════

  _apply_vendetta(nationId, clanId) {
    const mgr = getSenateManager(nationId);
    if (!mgr) return;
    const clan = mgr.clans[clanId];
    if (!clan) return;

    clan.vendetta       = true;
    clan.vendetta_since = GAME_STATE.turn;

    // update_clan_reputation(−100) → ripple × 0.5 = −50 loyalty для каждого члена
    mgr.update_clan_reputation(clanId, -100);

    addEventLog(
      `🗡️ Клан «${clan.name}» получил флаг [Vendetta]! Все члены теряют 50 лояльности. Обида будет помниться 20 лет.`,
      'danger'
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // ЗАГОВОР — делегируем ConspiracyEngine
  // ══════════════════════════════════════════════════════════════════

  initiate_conspiracy(nationId) {
    // Принудительный запуск через ConspiracyEngine (tyranny ≥ 80)
    return CONSPIRACY_ENGINE.check_conspiracy_trigger(nationId, { forced: true });
  }

  // ══════════════════════════════════════════════════════════════════
  // ТИК — ВЫЗЫВАЕТСЯ КАЖДЫЙ ХОД ИЗ processTurn()
  // ══════════════════════════════════════════════════════════════════

  tick(nationId) {
    const state = this._getState(nationId);
    const arch  = this.getArchitecture(nationId);
    const mgr   = getSenateManager(nationId);

    // ── Ежегодные расчёты (раз в 12 ходов = 1 год) ───────────────
    if (GAME_STATE.turn % 12 === 0) {
      // consul_term > 2 лет → +10 тирании в год
      if (arch && arch.consul_term > 2) {
        this._addTyranny(nationId, 10);
        addEventLog(
          `📅 Долгий срок Консула (+10 тирании). Итого: ${state.tyranny_points}/100.`,
          'warning'
        );
      }
      this._decayTyranny(nationId);

      // Vendetta: затухание через 20 лет (240 ходов)
      if (mgr) {
        for (const clan of Object.values(mgr.clans)) {
          if (clan.vendetta && GAME_STATE.turn - clan.vendetta_since >= 240) {
            clan.vendetta       = false;
            clan.vendetta_since = null;
            addEventLog(`🕊️ Клан «${clan.name}» снял флаг [Vendetta] — обида забыта с годами.`, 'info');
          }
        }
      }
    }

    // ── Истечение бонуса New_Man ──────────────────────────────────
    if (mgr) {
      for (const senator of mgr.senators) {
        if (senator._new_man_expires && GAME_STATE.turn >= senator._new_man_expires) {
          senator.hidden_interests = (senator.hidden_interests ?? [])
            .filter(i => i !== 'New_Man');
          delete senator._new_man_expires;
        }
      }
    }

    // ── Гражданская война: обратный отсчёт ──────────────────────
    if (state.civil_war_threat && state.civil_war_countdown !== null) {
      state.civil_war_countdown--;

      if (state.civil_war_countdown <= 0) {
        this._trigger_civil_war(nationId);
      } else if (state.civil_war_countdown <= 2) {
        addEventLog(
          `🔥 Народный гнев нарастает! До гражданской войны осталось ${state.civil_war_countdown} хода(ов).`,
          'danger'
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ГРАЖДАНСКАЯ ВОЙНА
  // ══════════════════════════════════════════════════════════════════

  _trigger_civil_war(nationId) {
    const mgr    = getSenateManager(nationId);
    const state  = this._getState(nationId);
    const nation = GAME_STATE.nations[nationId];

    state.civil_war_threat    = false;
    state.civil_war_countdown = null;

    // Лидер восстания: наиболее амбициозный + нелояльный сенатор
    const rebelLeader = mgr
      ? mgr.senators
          .filter(s => s.loyalty_score < 50)
          .sort((a, b) =>
            (b.ambition_level * 2 + (100 - b.loyalty_score)) -
            (a.ambition_level * 2 + (100 - a.loyalty_score))
          )[0] ?? null
      : null;

    // Наименее лояльная половина кланов отделяется
    const rebelClanNames = [];
    if (mgr) {
      const clanLoyalties = {};
      for (const s of mgr.senators) {
        if (!s.clan_id) continue;
        clanLoyalties[s.clan_id] = clanLoyalties[s.clan_id] ?? [];
        clanLoyalties[s.clan_id].push(s.loyalty_score);
      }
      const sorted = Object.entries(clanLoyalties)
        .map(([id, arr]) => ({ id, avg: arr.reduce((a, b) => a + b, 0) / arr.length }))
        .sort((a, b) => a.avg - b.avg);

      const halfCount = Math.ceil(sorted.length / 2);
      for (const { id } of sorted.slice(0, halfCount)) {
        const clan = mgr.clans[id];
        if (clan) {
          clan.rebel       = true;
          clan.rebel_since = GAME_STATE.turn;
          rebelClanNames.push(clan.name);
        }
      }
    }

    // Глобальные штрафы
    if (nation.government) {
      nation.government.stability  = Math.max(0, (nation.government.stability  ?? 50) - 40);
      nation.government.legitimacy = Math.max(0, (nation.government.legitimacy ?? 50) - 35);
    }
    if (nation.military) {
      nation.military.loyalty  = Math.max(0, (nation.military.loyalty  ?? 70) - 30);
      nation.military.morale   = Math.max(0, (nation.military.morale   ?? 70) - 25);
    }
    if (nation.population) {
      nation.population.happiness = Math.max(0, (nation.population.happiness ?? 60) - 30);
    }

    const leaderName = rebelLeader?.name
      ?? (rebelLeader?.clan_id ? `Лидер клана ${mgr._clanName(rebelLeader.clan_id)}` : 'Мятежник');

    addEventLog(
      `⚔️ ГРАЖДАНСКАЯ ВОЙНА! ${leaderName} поднял знамя восстания. Кланы [${rebelClanNames.join(', ')}] откололись. Провинции захвачены мятежниками!`,
      'danger'
    );

    state.tyranny_points = Math.max(0, state.tyranny_points - 40); // кризис рассеивает монолитность власти
  }

  // ══════════════════════════════════════════════════════════════════
  // НАРРАТИВНЫЙ ХРОНИКЁР — ПЕРЕДАЁМ В LLM
  // ══════════════════════════════════════════════════════════════════

  async _triggerChronicle(nationId, lawName, voteResult, changes) {
    const mgr = getSenateManager(nationId);
    if (typeof generateConstitutionalChronicleViaLLM !== 'function') return;

    // Главный оппонент: наиболее влиятельный материализованный сенатор < 50 лояльности
    const opponent = mgr
      ? mgr.getMaterialized()
          .filter(s => s.loyalty_score < 50)
          .sort((a, b) =>
            (b.influence ?? b.loyalty_score) - (a.influence ?? a.loyalty_score)
          )[0]
      : null;

    await generateConstitutionalChronicleViaLLM({
      law_name:       lawName,
      support_pct:    voteResult.margin_pct,
      passed:         voteResult.passed,
      changes,
      opponent_name:  opponent?.name  ?? null,
      opponent_clan:  opponent        ? mgr._clanName(opponent.clan_id) : null,
      senate_mood:    mgr?.global_senate_state ?? '',
      tyranny:        this._getState(nationId).tyranny_points,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
// SINGLETON
// ══════════════════════════════════════════════════════════════════════

const CONSTITUTIONAL_ENGINE = new ConstitutionalEngine();
