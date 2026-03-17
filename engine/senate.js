// ══════════════════════════════════════════════════════════════════════
// SENATE MANAGER — Lazy Materialization + Life Cycle + Social Networks
// ══════════════════════════════════════════════════════════════════════
//
// Слой данных (всегда):
//   faction_id, clan_id, loyalty_score, ambition_level,
//   current_age, health_points, hidden_interests[], wealth
//
// Слой личности (по триггеру, LLM):
//   name, traits[], biography, portrait, influence
//
// LLM-вызовы — строго 4 триггера:
//   1. player_click        → materialize_senator
//   2. rising_star         → materialize_senator
//   3. rotation (10 ходов) → materialize_senator
//   4. illness death       → generateSenatorObituaryViaLLM
//
// Вся математика (vote, aging, bribe, clan) — без LLM.
// ══════════════════════════════════════════════════════════════════════

// ── Таблица модификаторов голосования ────────────────────────────────
// Trait/interest → { law_type: delta }
// delta ∈ [-100, +100]; итог суммируется и зажимается в [-100, +100]
const VOTE_MODIFIERS = {
  // visible traits
  'Честолюбец':      { war: +30, reform: +20 },
  'Ambitious':       { war: +30, reform: +20 },
  'Патриций':        { taxes: -40, reform: -35, religion: +15 },
  'Wealthy':         { taxes: -40, reform: -35 },
  'Ветеран':         { war: +25, build: +10 },
  'Народник':        { taxes: +20, reform: +30, war: -15 },
  'Торговец':        { trade: +35, war: -25, taxes: -20 },
  'Оппозиционер':    { war: -20, taxes: -20, reform: -20 },
  'Лоялист':         { war: +15, taxes: +15 },
  'Осторожный':      { war: -20 },
  'Оратор':          { reform: +15 },
  'Фанатик':         { religion: +40, trade: -20 },
  // hidden interests
  'Grain_Monopolist':        { taxes: -50, trade: -20 },
  'Land_Speculator':         { reform: -60, taxes: -30 },
  'Arms_Dealer':             { war: +40, trade: +20 },
  'Cult_Follower':           { religion: +40, reform: -20 },
  'Temple_Patron':           { religion: +35, build: +25 },
  'Slave_Owner':             { reform: -50, taxes: -20 },
  'Grain_Hoarder':           { taxes: -35, trade: -15 },
  'Foreign_Agent:Carthage':  { war: -60, trade: +20 },
  'Foreign_Agent:Rome':      { war: +30, trade: -20, reform: -10 },
  'Foreign_Agent:Egypt':     { trade: +30 },
  'Blackmailed':             { war: +40, taxes: +40, reform: +40, religion: +40, build: +40, trade: +40 },
  // Конституционные теги
  'New_Man':                 { reform: +30, build: +20, war: +15 },  // лоялен Консулу — поддержит реформы
};

// Пул скрытых интересов для случайной выдачи
const HIDDEN_INTEREST_POOL = [
  'Grain_Monopolist', 'Land_Speculator', 'Arms_Dealer',
  'Cult_Follower', 'Temple_Patron', 'Slave_Owner', 'Grain_Hoarder',
  'Foreign_Agent:Carthage', 'Foreign_Agent:Rome', 'Foreign_Agent:Egypt',
];

class SenateManager {
  constructor(nationId, factions) {
    this.nationId  = nationId;
    // Клонируем фракции, добавляем leader_senator_id если отсутствует
    this.factions  = factions.map(f => ({ ...f, leader_senator_id: f.leader_senator_id ?? null }));
    this.senators  = [];
    this.clans     = {};         // { clan_id: ClanRecord }
    this.global_senate_state = 'Сенат спокоен. Политическая жизнь идёт своим чередом.';
    this._nextId   = 1;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ
  // ══════════════════════════════════════════════════════════════════════

  init(clanDefs = []) {
    this._initClans(clanDefs);
    this.senators = [];
    for (const faction of this.factions) {
      for (let i = 0; i < faction.seats; i++) {
        this.senators.push(this._createGhost(faction.id));
      }
    }
  }

  _initClans(clanDefs) {
    this.clans = {};
    for (const def of clanDefs) {
      this.clans[def.id] = {
        id:                def.id,
        name:              def.name,
        color:             def.color ?? '#888',
        reputation_events: [],   // [{turn, change}] — для затухающей памяти
      };
    }
  }

  _createGhost(factionId, ageOverride = null) {
    const clanIds = Object.keys(this.clans);
    const clan_id = clanIds.length
      ? clanIds[Math.floor(Math.random() * clanIds.length)]
      : null;

    // 1–2 скрытых интереса (20% шанс второго)
    const hidden_interests = [];
    hidden_interests.push(HIDDEN_INTEREST_POOL[Math.floor(Math.random() * HIDDEN_INTEREST_POOL.length)]);
    if (Math.random() < 0.20) {
      const second = HIDDEN_INTEREST_POOL[Math.floor(Math.random() * HIDDEN_INTEREST_POOL.length)];
      if (second !== hidden_interests[0]) hidden_interests.push(second);
    }

    return {
      id:               `SEN_${this.nationId.toUpperCase()}_${String(this._nextId++).padStart(3, '0')}`,
      faction_id:       factionId,
      clan_id,
      loyalty_score:    30 + Math.floor(Math.random() * 50),   // 30–79
      ambition_level:   1  + Math.floor(Math.random() * 5),    // 1–5
      current_age:      ageOverride ?? 30 + Math.floor(Math.random() * 31),
      health_points:    60 + Math.floor(Math.random() * 41),   // 60–100
      wealth:           1000 + Math.floor(Math.random() * 9000), // 1000–9999
      hidden_interests,          // скрыты от игрока без разведки
      revealed_interests: [],    // открыты разведкой
      materialized:     false,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // СВЯЗЬ С ИМЕННЫМИ ПЕРСОНАЖАМИ (nation.characters)
  // ══════════════════════════════════════════════════════════════════════

  // Вызывается при initSenateForNation: персонажи с senate_faction_id
  // занимают место призрака в своей фракции и считаются материализованными.
  injectNamedCharactersAsSenators(characters) {
    const candidates = (characters ?? []).filter(c => c.alive && c.senate_faction_id);
    for (const char of candidates) {
      const factionId = char.senate_faction_id;
      if (!this.factions.find(f => f.id === factionId)) continue;

      // Ищем свободный призрак в нужной фракции
      const ghostIdx = this.senators.findIndex(
        s => !s.materialized && s.faction_id === factionId && !s.character_id
      );

      const record = this._characterToSenator(char, factionId);

      if (ghostIdx !== -1) {
        this.senators[ghostIdx] = record;
      } else {
        // Призраков во фракции нет — добавляем сверх лимита
        this.senators.push(record);
      }
    }

    // Выбираем начальных лидеров фракций
    for (const faction of this.factions) {
      this._electFactionLeader(faction.id, 'initial');
    }
  }

  // Строит запись сенатора из объекта character
  _characterToSenator(char, factionId) {
    const clanIds  = Object.keys(this.clans);
    const clan_id  = clanIds.length
      ? clanIds[Math.floor(Math.random() * clanIds.length)]
      : null;
    const loyalty     = char.traits?.loyalty    ?? 50;
    const ambitionRaw = char.traits?.ambition   ?? 50;
    const ambition    = Math.max(1, Math.min(5, Math.round(ambitionRaw / 20)));

    return {
      id:                   `CHAR_SEN_${char.id}`,
      character_id:         char.id,
      faction_id:           factionId,
      clan_id,
      loyalty_score:        loyalty,
      ambition_level:       ambition,
      current_age:          char.age  ?? 40,
      health_points:        char.health ?? 80,
      wealth:               char.resources?.gold ?? 3000,
      hidden_interests:     this._mapCharInterests(char),
      revealed_interests:   [],
      materialized:         true,
      materialized_turn:    0,
      materialized_reason:  'named_character',
      name:                 char.name,
      portrait:             char.portrait ?? '👤',
      biography:            char.description ?? '',
      traits:               this._mapCharTraits(char),
      influence:            Math.round(Math.min(100, (char.resources?.followers ?? 0) / 5 + 30)),
    };
  }

  _mapCharTraits(char) {
    const t = char.traits ?? {};
    const tags = [];
    if (t.ambition > 70)  tags.push('Честолюбец');
    if (t.caution  > 70)  tags.push('Осторожный');
    if (t.loyalty  > 70)  tags.push('Верный');
    if (t.loyalty  < 30)  tags.push('Интриган');
    if (t.piety    > 70)  tags.push('Благочестивый');
    if (t.cruelty  > 60)  tags.push('Жёсткий');
    if (t.greed    > 70)  tags.push('Жадный');
    const roleTag = { general: 'Полководец', merchant: 'Торговец', priest: 'Жрец',
                      senator: 'Сенатор', advisor: 'Советник' }[char.role];
    if (roleTag) tags.push(roleTag);
    return tags;
  }

  _mapCharInterests(char) {
    const interests = [];
    const wants = char.wants ?? [];
    if (wants.some(w => w.includes('торг') || w.includes('монопол'))) interests.push('Grain_Monopolist');
    if (wants.some(w => w.includes('земл'))) interests.push('Land_Speculator');
    if (char.role === 'merchant') interests.push('Grain_Monopolist');
    if (char.role === 'priest')   interests.push('Temple_Patron');
    if (char.role === 'general' || (char.resources?.army_command ?? 0) > 0) interests.push('Arms_Dealer');
    if (!interests.length) {
      interests.push(HIDDEN_INTEREST_POOL[Math.floor(Math.random() * HIDDEN_INTEREST_POOL.length)]);
    }
    return interests;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ЛИДЕРСТВО ФРАКЦИЙ
  // ══════════════════════════════════════════════════════════════════════

  // Возвращает объект senator — текущего лидера фракции (или null).
  getFactionLeader(factionId) {
    const faction = this.factions.find(f => f.id === factionId);
    if (!faction?.leader_senator_id) return null;
    return this.getSenatorById(faction.leader_senator_id);
  }

  // Выбирает нового лидера фракции из материализованных сенаторов.
  // Формула: influence×0.4 + loyalty×0.3 + ambition×20×0.3
  // reason: 'initial' | 'vacancy' | 'death' | 'loyalty_collapse' | 'challenge'
  _electFactionLeader(factionId, reason = 'election') {
    const faction = this.factions.find(f => f.id === factionId);
    if (!faction) return null;

    const candidates = this.senators.filter(
      s => s.faction_id === factionId && s.materialized
    );
    if (!candidates.length) {
      faction.leader_senator_id = null;
      return null;
    }

    const scored = candidates
      .map(s => ({
        senator: s,
        score: (s.influence ?? 40) * 0.4 + s.loyalty_score * 0.3 + s.ambition_level * 20 * 0.3,
      }))
      .sort((a, b) => b.score - a.score);

    const prevId   = faction.leader_senator_id;
    const newLeader = scored[0].senator;
    faction.leader_senator_id = newLeader.id;

    const isPlayer = this.nationId === GAME_STATE.player_nation;

    if (reason !== 'initial' && prevId !== newLeader.id) {
      const oldLeader = prevId ? this.getSenatorById(prevId) : null;
      const oldName   = oldLeader?.name ?? 'прежний лидер';
      const causeText = {
        vacancy:         'вакансия после гибели',
        death:           'гибель лидера',
        loyalty_collapse:'потеря доверия фракции',
        challenge:       'победа в политической борьбе',
        election:        'перевыборы',
      }[reason] ?? reason;

      if (isPlayer) {
        addEventLog(
          `🏛️ Фракция «${faction.name}»: ${newLeader.name} сменяет ${oldName} (${causeText}).`,
          'law'
        );
      }

      // Краткосрочный сплочённый эффект: +3 лояльности всем членам фракции
      for (const s of candidates) {
        if (s.id !== newLeader.id) {
          s.loyalty_score = Math.min(100, s.loyalty_score + 3);
        }
      }
      // Обновляем настроение Сената после смены власти
      this._recalculateSenateState();
    }

    return newLeader;
  }

  // Проверяет смену лидерства для всех фракций — вызывается из processTick.
  _checkFactionLeadershipChanges(isPlayer) {
    for (const faction of this.factions) {
      // 1. Нет лидера — избрать
      if (!faction.leader_senator_id) {
        this._electFactionLeader(faction.id, 'vacancy');
        continue;
      }

      const leader = this.getSenatorById(faction.leader_senator_id);

      // 2. Лидер исчез (умер / исключён)
      if (!leader) {
        this._electFactionLeader(faction.id, 'death');
        continue;
      }

      // 3. Крах лояльности (< 25): 60% шанс свержения
      if (leader.loyalty_score < 25 && Math.random() < 0.60) {
        if (isPlayer) {
          addEventLog(
            `⚠️ Фракция «${faction.name}» теряет веру в ${leader.name} — его лояльность рухнула.`,
            'warning'
          );
        }
        this._electFactionLeader(faction.id, 'loyalty_collapse');
        continue;
      }

      // 4. Амбициозный вызов раз в 24 хода (~2 года)
      if (GAME_STATE.turn % 24 === 0) {
        const challenger = this.senators
          .filter(s => s.faction_id === faction.id && s.materialized &&
                       s.id !== leader.id && s.ambition_level >= 4)
          .sort((a, b) => b.ambition_level - a.ambition_level)[0];

        if (challenger) {
          const leaderScore     = (leader.influence     ?? 40) * 0.4 + leader.loyalty_score     * 0.3 + leader.ambition_level     * 20 * 0.3;
          const challengerScore = (challenger.influence ?? 40) * 0.4 + challenger.loyalty_score * 0.3 + challenger.ambition_level * 20 * 0.3;

          if (challengerScore > leaderScore * 1.20) {
            if (isPlayer) {
              addEventLog(
                `🔥 ${challenger.name} бросает вызов лидеру «${faction.name}» ${leader.name}!`,
                'warning'
              );
            }
            this._electFactionLeader(faction.id, 'challenge');
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ГЕТТЕРЫ
  // ══════════════════════════════════════════════════════════════════════

  getSenatorById(id)              { return this.senators.find(s => s.id === id) ?? null; }
  getSenatorByCharacterId(charId) { return this.senators.find(s => s.character_id === charId) ?? null; }
  getMaterialized()               { return this.senators.filter(s => s.materialized); }
  getGhostsByFaction(fId)         { return this.senators.filter(s => s.faction_id === fId && !s.materialized); }
  getClanMembers(clanId)          { return this.senators.filter(s => s.clan_id === clanId); }

  _factionName(fId) { return this.factions.find(f => f.id === fId)?.name ?? fId; }
  _clanName(cId)    { return this.clans[cId]?.name ?? cId ?? '?'; }

  _hasTrait(senator, tags) {
    const all = [...(senator.traits ?? []), ...(senator.hidden_interests ?? [])];
    return tags.some(t => all.some(a => a.toLowerCase().includes(t.toLowerCase())));
  }

  getFactionStats() {
    const stats = {};
    for (const faction of this.factions) {
      const members = this.senators.filter(s => s.faction_id === faction.id);
      stats[faction.id] = {
        name:         faction.name,
        color:        faction.color,
        seats:        members.length,
        avg_loyalty:  members.length
          ? Math.round(members.reduce((a, s) => a + s.loyalty_score, 0) / members.length)
          : 0,
        materialized: members.filter(s => s.materialized).length,
      };
    }
    return stats;
  }

  getClanStats() {
    const stats = {};
    for (const [cId, clan] of Object.entries(this.clans)) {
      const members = this.getClanMembers(cId);
      stats[cId] = {
        name:        clan.name,
        color:       clan.color,
        size:        members.length,
        avg_loyalty: members.length
          ? Math.round(members.reduce((a, s) => a + s.loyalty_score, 0) / members.length)
          : 0,
        reputation:  Math.round(this.getClanEffectiveReputation(cId)),
      };
    }
    return stats;
  }

  // ══════════════════════════════════════════════════════════════════════
  // СИСТЕМА КЛАНОВ — коллективная память с затуханием
  // ══════════════════════════════════════════════════════════════════════

  // Эффективная репутация клана с затуханием за 20 лет (240 ходов).
  getClanEffectiveReputation(clanId) {
    const clan = this.clans[clanId];
    if (!clan) return 0;
    const now = GAME_STATE.turn;
    const DECAY_TURNS = 240;  // 20 лет × 12 ходов/год
    let rep = 0;
    for (const ev of clan.reputation_events) {
      const age    = now - ev.turn;
      const factor = Math.max(0, 1 - age / DECAY_TURNS);
      rep += ev.change * factor;
    }
    return Math.max(-100, Math.min(100, rep));
  }

  // Изменить репутацию клана.
  // isReward: true = награда (loyalty растёт), false = наказание.
  // ripple: изменение loyalty для всех членов = change_value × 0.5
  update_clan_reputation(clanId, changeValue) {
    const clan = this.clans[clanId];
    if (!clan) return;

    clan.reputation_events.push({ turn: GAME_STATE.turn, change: changeValue });

    // Чистим события старше 20 лет чтобы не копить бесконечно
    const cutoff = GAME_STATE.turn - 240;
    clan.reputation_events = clan.reputation_events.filter(ev => ev.turn >= cutoff);

    // Ripple: 50% от изменения применяется ко всем членам
    const ripple = changeValue * 0.5;
    for (const senator of this.getClanMembers(clanId)) {
      senator.loyalty_score = Math.max(0, Math.min(100,
        Math.round(senator.loyalty_score + ripple)
      ));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ГОЛОСОВАНИЕ
  // ══════════════════════════════════════════════════════════════════════

  // proposal: {
  //   threshold:         0-100 (по умолчанию 51)
  //   law_type:          'war' | 'taxes' | 'religion' | 'build' | 'trade' | 'reform'
  //   law_tags:          [] — доп. теги закона для narrative
  //   faction_modifiers: { faction_id: delta }
  // }
  process_vote(proposal = {}) {
    const threshold  = (proposal.threshold ?? 51) / 100;
    const mods       = { ...(proposal.faction_modifiers ?? {}) };
    const lawType    = proposal.law_type ?? null;

    // Бонус от речи игрока: { faction_id: delta_pp }
    const speechBonus = proposal.speech_bonus ?? {};
    for (const [fId, bonus] of Object.entries(speechBonus)) {
      mods[fId] = (mods[fId] ?? 0) + bonus;
    }

    // Система голосования из StateArchitecture
    const arch         = GAME_STATE?.nations[this.nationId]?.senate_config?.state_architecture;
    const votingSystem = arch?.voting_system ?? 'Meritocracy';

    // ── 6б. Давление / слабость личной власти правителя ───────────────
    // Сильный правитель (+70): запугивает сенаторов → +10pp поддержки у всех.
    // Слабый правитель (≤25): авторитет не давит → -8pp поддержки у всех.
    {
      const _pp = GAME_STATE.nations[this.nationId]?.government?.ruler?.personal_power ?? 50;
      let _ppDelta = 0;
      if      (_pp >= 70) _ppDelta =  10;
      else if (_pp <= 25) _ppDelta = -8;
      if (_ppDelta !== 0) {
        for (const f of this.factions) {
          mods[f.id] = (mods[f.id] ?? 0) + _ppDelta;
        }
        if (this.nationId === GAME_STATE.player_nation) {
          const label = _ppDelta > 0
            ? `👑 Давление власти: сенаторы чувствуют силу правителя (+${_ppDelta}% поддержки).`
            : `😟 Слабость власти: сенаторы не боятся ослушаться (${_ppDelta}% поддержки).`;
          addEventLog(label, _ppDelta > 0 ? 'info' : 'warning');
        }
      }
    }

    // ── 7. Фракционная лояльность → автоматический модификатор ───────
    // Высокая ср. лояльность фракции = бонус к голосам «за»; низкая = штраф.
    const factionStats = this.getFactionStats();
    for (const faction of this.factions) {
      const avgLoy = factionStats[faction.id]?.avg_loyalty ?? 50;
      const loyMod = Math.round((avgLoy - 50) * 0.30); // диапазон ≈ −15…+15
      mods[faction.id] = (mods[faction.id] ?? 0) + loyMod;
    }

    // ── 8. Коалиции фракций ───────────────────────────────────────────
    const coalitions = this._detectVotingCoalitions(lawType);
    const coalitionBonus = {}; // faction_id → ±delta (pp)
    for (const [f1, f2, direction] of coalitions) {
      coalitionBonus[f1] = (coalitionBonus[f1] ?? 0) + direction * 15;
      coalitionBonus[f2] = (coalitionBonus[f2] ?? 0) + direction * 15;
    }
    for (const [fId, bonus] of Object.entries(coalitionBonus)) {
      mods[fId] = (mods[fId] ?? 0) + bonus;
    }

    let totalFor = 0, totalAgainst = 0, totalAbstain = 0;

    for (const senator of this.senators) {
      let support = senator.loyalty_score / 100;

      // Фракционный модификатор (включает avg_loyalty + коалиции)
      if (mods[senator.faction_id] !== undefined) {
        support = Math.max(0, Math.min(1, support + mods[senator.faction_id] / 100));
      }

      // Персональный модификатор (traits + hidden_interests + клан)
      if (lawType) {
        const modifier = this.calculate_vote_modifier(senator, proposal);
        support = Math.max(0, Math.min(1, support + modifier / 100));
      }

      // Амбициозные голосуют непредсказуемее (±10 pp)
      if (senator.ambition_level >= 4) {
        support += (Math.random() - 0.5) * 0.2;
        support  = Math.max(0, Math.min(1, support));
      }

      // ── Отношения персонажа с другими персонажами ────────────
      // Если у персонажа есть char.relations → союзники голосуют синхронно
      {
        const _nation = GAME_STATE.nations[this.nationId];
        const _char   = (_nation?.characters ?? []).find(c => c.id === senator.id || c.id === senator.character_id);
        if (_char?.relations) {
          for (const [otherCharId, relData] of Object.entries(_char.relations)) {
            const otherSenator = this.senators.find(s => s.character_id === otherCharId || s.id === otherCharId);
            if (!otherSenator) continue;
            const relScore = typeof relData === 'number' ? relData : (relData.score ?? 0);
            // Союзник (>40): тянется к тому же решению → небольшой бонус к поддержке
            if (relScore > 40)  support = Math.min(1, support + 0.08);
            // Враг (<-40): голосует наперекор
            if (relScore < -40) support = Math.max(0, support - 0.08);
          }
        }
      }

      // ── Исходы диалога с игроком ──────────────────────────────
      // Читаем LTS-теги из персонажа, соответствующего этому сенатору
      {
        const _charNation = GAME_STATE.nations[this.nationId];
        const _sChar = (_charNation?.characters ?? []).find(c => c.id === senator.id);
        const _lts   = _sChar?.dialogue?.lts_tags ?? [];

        // Долгосрочный союз: +20pp на все голосования
        if (_lts.includes('[Allied_With_Player]')) {
          support = Math.min(1, support + 0.20);
        }

        // Разовая поддержка: +15pp только на следующее голосование, затем тег снимается
        if (_lts.includes('[Supports_Player_Request]')) {
          support = Math.min(1, support + 0.15);
          const idx = _lts.indexOf('[Supports_Player_Request]');
          if (idx !== -1) _lts.splice(idx, 1);
        }
      }

      // Вес голоса
      let weight = 1;
      if (votingSystem === 'Plutocracy') {
        const isWealthy = (senator.traits ?? []).some(t =>
          ['Патриций', 'Wealthy', 'Торговец'].includes(t)
        ) || (senator.wealth ?? 0) > 7000;
        weight = isWealthy ? 3 : 1;
      } else if (votingSystem === 'Meritocracy') {
        weight = 1 + Math.round(senator.ambition_level / 5 * 5) / 10;
      }

      const roll = Math.random();
      if      (roll < support)       totalFor     += weight;
      else if (roll < support + 0.8) totalAgainst += weight;
      else                           totalAbstain += weight;
    }

    const total     = totalFor + totalAgainst + totalAbstain;
    let   passed    = total > 0 && (totalFor / total) >= threshold;
    const marginPct = total > 0 ? Math.round((totalFor / total) * 100) : 0;

    // ── 4. Право вето Народного Трибуна ───────────────────────────────
    let vetoed     = false;
    let tribuneName = null;
    if (passed && arch?.veto_rights) {
      // Трибун — сенатор из фракции demos с высоким честолюбием и низкой лояльностью
      const tribune = this.senators
        .filter(s => s.faction_id === 'demos' && s.materialized &&
                     s.ambition_level >= 3 && s.loyalty_score < 45)
        .sort((a, b) => b.ambition_level - a.ambition_level)[0];

      // Шанс вето: 15–45% зависит от margin (чем убедительнее — тем меньше шанс)
      const vetoChance = Math.max(0.05, 0.45 - marginPct / 200);
      if (tribune && Math.random() < vetoChance) {
        passed      = false;
        vetoed      = true;
        tribuneName = tribune.name ?? 'Народный Трибун';
        if (this.nationId === GAME_STATE.player_nation) {
          addEventLog(
            `⚖️ ВЕТО! ${tribuneName} поднял жезл трибуна — закон заблокирован, несмотря на большинство (${marginPct}% «за»).`,
            'warning'
          );
        }
      }
    }

    // Лог коалиций для игрока
    if (coalitions.length && this.nationId === GAME_STATE.player_nation) {
      for (const [f1, f2, dir] of coalitions) {
        addEventLog(
          `🤝 Коалиция: «${this._factionName(f1)}» и «${this._factionName(f2)}» голосуют вместе (${dir > 0 ? '«за»' : '«против»'}).`,
          'info'
        );
      }
    }

    const result = {
      for:          totalFor,
      against:      totalAgainst,
      abstain:      totalAbstain,
      total,
      passed,
      margin_pct:   marginPct,
      vetoed,
      tribune_name: tribuneName,
      coalitions,
      top_speakers: this._getTopSpeakers(3),
      narrative_context: this.getVoteNarrativeContext(proposal, { passed, marginPct }),
    };

    // ── После голосования: сдвиг мест фракций в зависимости от типа закона ──
    if (passed && lawType) {
      this._shiftFactionSeatsAfterLaw(lawType);
    }

    return result;
  }

  // Перераспределяет 1-2 места между фракциями после принятия закона.
  // Законы усиливают «выигравшие» фракции и ослабляют «проигравшие».
  _shiftFactionSeatsAfterLaw(lawType) {
    const LAW_WINNERS = {
      war:       { winners: ['military'], losers: ['demos', 'merchants'] },
      taxes:     { winners: ['demos'],    losers: ['aristocrats', 'merchants'] },
      trade:     { winners: ['merchants'],losers: ['military'] },
      reform:    { winners: ['demos'],    losers: ['aristocrats'] },
      religion:  { winners: ['aristocrats'], losers: [] },
      build:     { winners: ['demos', 'merchants'], losers: [] },
    };

    const shift = LAW_WINNERS[lawType];
    if (!shift) return;

    // Только при очень убедительном результате (≥ раз в 6 ходов рандом)
    if (Math.random() > 0.35) return;

    const factionIds = new Set(this.factions.map(f => f.id));
    const winners = shift.winners.filter(id => factionIds.has(id));
    const losers  = shift.losers.filter(id  => factionIds.has(id));

    if (!winners.length || !losers.length) return;

    const winnerId = winners[Math.floor(Math.random() * winners.length)];
    const loserId  = losers[Math.floor(Math.random() * losers.length)];

    // Переводим одного сенатора из проигравшей во выигравшую фракцию
    const ghosts = this.senators.filter(s => s.faction_id === loserId && !s.materialized);
    if (!ghosts.length) return;

    const migrant = ghosts[0];
    migrant.faction_id = winnerId;

    if (this.nationId === GAME_STATE.player_nation) {
      addEventLog(
        `🗳️ Закон (${lawType}) принят. Фракция «${this._factionName(winnerId)}» получила место в Сенате за счёт «${this._factionName(loserId)}».`,
        'law'
      );
    }
  }

  // ── 8. Обнаружение коалиций перед голосованием ──────────────────────
  // Возвращает массив [faction_id_1, faction_id_2, direction (+1/-1)]
  _detectVotingCoalitions(lawType) {
    const ALIGNMENTS = {
      // [lawType]: [[f1, f2, direction]] — фракции с общими интересами по типу закона
      war:        [['military', 'aristocrats', +1], ['demos', 'merchants', -1]],
      taxes:      [['demos', 'military', +1],       ['merchants', 'aristocrats', -1]],
      trade:      [['merchants', 'demos', +1],      ['military', 'aristocrats', -1]],
      religion:   [['aristocrats', 'demos', +1]],
      reform:     [['demos', 'merchants', +1],      ['aristocrats', 'military', -1]],
      build:      [['demos', 'merchants', +1]],
      diplomacy:  [['merchants', 'demos', +1],      ['military', -1]],
    };

    const raw = ALIGNMENTS[lawType] ?? [];
    // Фильтруем: обе фракции должны существовать в сенате
    const factionIds = new Set(this.factions.map(f => f.id));
    return raw.filter(([f1, f2]) => factionIds.has(f1) && factionIds.has(f2));
  }

  // Итоговый модификатор голоса одного сенатора (−100…+100).
  // Учитывает: traits[], hidden_interests[], клановую репутацию.
  calculate_vote_modifier(senator, proposal) {
    const lawType = (proposal.law_type ?? '').toLowerCase();
    let delta = 0;

    // Visible traits
    for (const tag of (senator.traits ?? [])) {
      const table = VOTE_MODIFIERS[tag];
      if (table && table[lawType] !== undefined) delta += table[lawType];
    }

    // Hidden interests (невидимы игроку без разведки)
    for (const interest of (senator.hidden_interests ?? [])) {
      const table = VOTE_MODIFIERS[interest];
      if (table && table[lawType] !== undefined) delta += table[lawType];
    }

    // Revealed interests (открыты разведкой — те же эффекты, но игрок их видит)
    for (const interest of (senator.revealed_interests ?? [])) {
      // Эффект уже посчитан через hidden_interests если он там остался,
      // поэтому пропускаем дублирование
    }

    // Клановая репутация: ±20 pp в зависимости от накопленной памяти
    if (senator.clan_id) {
      const clanRep = this.getClanEffectiveReputation(senator.clan_id);
      delta += Math.round(clanRep * 0.20);
    }

    return Math.max(-100, Math.min(100, delta));
  }

  // Строит контекст для LLM-нарратива голосования.
  // Не раскрывает hidden_interests — только имена кланов и фракций.
  getVoteNarrativeContext(proposal, result) {
    const lawType = proposal.law_type ?? 'закон';

    // Считаем суммарный клановый модификатор
    const clanTotals = {};
    for (const senator of this.senators) {
      if (!senator.clan_id) continue;
      const mod = this.calculate_vote_modifier(senator, proposal);
      clanTotals[senator.clan_id] = (clanTotals[senator.clan_id] ?? 0) + mod;
    }

    // Самый оппозиционный клан
    const entries = Object.entries(clanTotals).sort((a, b) => a[1] - b[1]);
    const [opposedClanId, opposedScore] = entries[0] ?? [null, 0];
    const [supportClanId, supportScore] = entries[entries.length - 1] ?? [null, 0];

    // Клановые интересы — только revealed или абстрактно по faction
    const opposedClanMembers = opposedClanId ? this.getClanMembers(opposedClanId) : [];
    const revealedInterest = opposedClanMembers
      .flatMap(s => s.revealed_interests ?? [])
      .find(Boolean) ?? null;

    return {
      law_type:             lawType,
      result:               result.passed ? 'принят' : 'отклонён',
      margin_pct:           result.marginPct,
      opposed_clan:         opposedClanId  ? this._clanName(opposedClanId)  : null,
      opposed_clan_score:   Math.round(opposedScore ?? 0),
      support_clan:         supportClanId  ? this._clanName(supportClanId)  : null,
      revealed_interest:    revealedInterest,
      senate_mood:          this.global_senate_state,
    };
  }

  _getTopSpeakers(n) {
    return this.getMaterialized()
      .sort((a, b) => (b.influence ?? b.loyalty_score) - (a.influence ?? a.loyalty_score))
      .slice(0, n)
      .map(s => ({
        name:    s.name,
        faction: this._factionName(s.faction_id),
        clan:    this._clanName(s.clan_id),
        traits:  s.traits ?? [],
        loyalty: s.loyalty_score,
      }));
  }

  // ══════════════════════════════════════════════════════════════════════
  // ИНТРИГИ И ПОДКУП
  // ══════════════════════════════════════════════════════════════════════

  // Попытка подкупа сенатора.
  //
  // Возвращает:
  //   { success: true,  senator_name, loyalty_before, loyalty_after, blackmailed: true }
  //   { success: false, scandal: true, message }   ← [Honorable] отказ + скандал
  //   { success: false, message }                  ← просто отказ
  attempt_bribe(senatorId, amount) {
    const senator = this.getSenatorById(senatorId);
    if (!senator) return { success: false, message: 'Сенатор не найден.' };

    const wealth        = senator.wealth ?? 5000;
    const isGreedy      = this._hasTrait(senator, ['Жадный', 'Greedy', 'Grain_Monopolist']);
    const isHonorable   = this._hasTrait(senator, ['Честный', 'Honorable', 'Лоялист']);

    // Базовый шанс успеха: amount / wealth (кэппим 85%)
    let chance = Math.min(0.85, amount / wealth);
    if (isGreedy)    chance += 0.25;
    if (isHonorable) chance -= 0.50;
    chance = Math.max(0.02, Math.min(0.90, chance));

    // [Honorable]: риск публичного скандала при отказе
    if (isHonorable && Math.random() < 0.10) {
      return {
        success:      false,
        scandal:      true,
        senator_name: senator.name ?? '?',
        clan:         this._clanName(senator.clan_id),
        message:      `Сенатор ${senator.name ?? '?'} публично отверг взятку! Скандал!`,
      };
    }

    if (Math.random() < chance) {
      // Успех: временный буст лояльности на 2 хода
      const loyaltyBefore = senator.loyalty_score;
      const bonus         = 20 + Math.floor(Math.random() * 11);  // +20…+30
      senator.loyalty_score      = Math.min(100, senator.loyalty_score + bonus);
      senator._bribe_bonus       = bonus;
      senator._bribe_expires     = GAME_STATE.turn + 2;

      // Добавляем Blackmailed в hidden_interests (используется в vote modifier)
      if (!senator.hidden_interests) senator.hidden_interests = [];
      if (!senator.hidden_interests.includes('Blackmailed')) {
        senator.hidden_interests.push('Blackmailed');
      }
      // Игрок видит, что сенатор подкуплен
      if (!senator.revealed_interests) senator.revealed_interests = [];
      if (!senator.revealed_interests.includes('Blackmailed')) {
        senator.revealed_interests.push('Blackmailed');
      }

      // Честь игрока в глазах клана сенатора падает навсегда
      if (senator.clan_id && this.clans[senator.clan_id]) {
        const clan = this.clans[senator.clan_id];
        clan.honor_opinion = Math.max(0, (clan.honor_opinion ?? 100) - 15);
      }
      // Глобальная честь Консула
      const constitState = GAME_STATE?.nations[this.nationId]?.constitutional_state;
      if (constitState) {
        constitState.player_honor = Math.max(0, (constitState.player_honor ?? 100) - 5);
      }

      return {
        success:        true,
        senator_name:   senator.name ?? '?',
        clan:           this._clanName(senator.clan_id),
        loyalty_before: loyaltyBefore,
        loyalty_after:  senator.loyalty_score,
        bonus,
        blackmailed:    true,
        expires_turn:   senator._bribe_expires,
      };
    }

    return {
      success:      false,
      senator_name: senator.name ?? '?',
      message:      `Сенатор ${senator.name ?? '?'} отказался от предложения.`,
    };
  }

  // Разведка — открывает hidden_interests одного сенатора.
  // Вызывается из игровой механики (сеть шпионов, разговор при дворе и т.п.).
  reveal_interests(senatorId) {
    const senator = this.getSenatorById(senatorId);
    if (!senator) return [];
    for (const interest of senator.hidden_interests ?? []) {
      if (!(senator.revealed_interests ?? []).includes(interest)) {
        senator.revealed_interests = senator.revealed_interests ?? [];
        senator.revealed_interests.push(interest);
      }
    }
    return senator.revealed_interests;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ТИК — КАЖДЫЙ ХОД
  // ══════════════════════════════════════════════════════════════════════

  async processTick(turn) {
    const isPlayer = this.nationId === GAME_STATE.player_nation;

    // Истечение подкупа
    for (const senator of this.senators) {
      if (senator._bribe_expires && turn >= senator._bribe_expires) {
        senator.loyalty_score = Math.max(0, senator.loyalty_score - (senator._bribe_bonus ?? 20));
        delete senator._bribe_bonus;
        delete senator._bribe_expires;
        // Blackmailed остаётся как улика для шантажа
      }
    }

    // Триггер: "Восходящая звезда"
    for (const senator of this.senators) {
      if (!senator.materialized && senator.ambition_level > 4 && Math.random() < 0.12) {
        await this.materialize_senator(senator.id, 'rising_star');
        if (isPlayer && senator.materialized) {
          addEventLog(
            `🌟 В Сенате появилась восходящая звезда: ${senator.name} (${this._clanName(senator.clan_id)} · ${this._factionName(senator.faction_id)}). Следите за ним.`,
            'character'
          );
        }
        break;
      }
    }

    // Триггер: ротация раз в 10 ходов
    if (turn % 10 === 0) {
      const ghosts = this.senators.filter(s => !s.materialized);
      if (ghosts.length) {
        const picked = ghosts[Math.floor(Math.random() * ghosts.length)];
        await this.materialize_senator(picked.id, 'rotation');
        if (isPlayer && picked.materialized) {
          addEventLog(
            `📰 Горожане обсуждают сенатора ${picked.name} (${this._clanName(picked.clan_id)}) — он привлёк внимание своей позицией.`,
            'info'
          );
        }
      }
    }

    // Drift лояльности (~5% сенаторов)
    for (const senator of this.senators) {
      if (Math.random() < 0.05) {
        senator.loyalty_score = Math.max(0, Math.min(100,
          senator.loyalty_score + Math.round((Math.random() - 0.5) * 10)
        ));
      }
    }

    // Жизненный цикл — раз в год
    if (turn % 12 === 0) {
      await this._runYearlyLifeCycle();
    }

    // Проверяем смену лидеров фракций (каждый ход: вакансия/гибель; раз в 24 хода: вызов)
    this._checkFactionLeadershipChanges(isPlayer);

    // ── 10. Фракционные инициативы — раз в 15 ходов (~1.25 года) ───
    if (turn % 15 === 0) {
      this._triggerFactionInitiative(isPlayer);
    }
  }

  // ── 10. Фракция выдвигает законопроект ──────────────────────────────
  _triggerFactionInitiative(isPlayer) {
    // Выбираем активную фракцию с лидером и программой wants[]
    const eligible = this.factions.filter(f => {
      const leader = this.getFactionLeader(f.id);
      return leader && f.wants?.length;
    });
    if (!eligible.length) return;

    const faction = eligible[Math.floor(Math.random() * eligible.length)];
    const leader  = this.getFactionLeader(faction.id);
    const lawType = (faction.preferred_law_types ?? ['reform'])[
      Math.floor(Math.random() * (faction.preferred_law_types?.length ?? 1))
    ];
    const wantKey = faction.wants[Math.floor(Math.random() * faction.wants.length)];

    // Фракционные модификаторы: сама фракция горячо «за», остальные — нет
    const factionMods = {};
    for (const f of this.factions) {
      factionMods[f.id] = f.id === faction.id ? 35 : -10;
    }

    const result = this.process_vote({
      threshold:         51,
      law_type:          lawType,
      faction_modifiers: factionMods,
    });

    if (isPlayer) {
      const lawNames = {
        land_reform:      'земельная реформа',
        noble_privilege:  'привилегии знати',
        cheap_grain:      'субсидии на зерно',
        public_works:     'общественные работы',
        debt_relief:      'облегчение долгов',
        war_funding:      'военные ассигнования',
        veteran_land:     'земли ветеранам',
        free_trade:       'свободная торговля',
        port_expansion:   'расширение портов',
        tradition:        'охрана традиций',
      };
      const lawName = lawNames[wantKey] ?? wantKey.replace(/_/g, ' ');

      if (result.passed) {
        addEventLog(
          `📋 ${leader.name} (${faction.name}) добился принятия «${lawName}» (${result.margin_pct}% «за»). Закон вступает в силу.`,
          'law'
        );
        // Небольшой эффект на экономику/стабильность нации
        const nation = GAME_STATE.nations[this.nationId];
        if (nation?.government) {
          nation.government.legitimacy = Math.min(100, (nation.government.legitimacy ?? 50) + 3);
        }
      } else {
        addEventLog(
          `📋 ${leader.name} (${faction.name}) вынес на голосование «${lawName}» — отклонено (${result.margin_pct}% «за»).`,
          'warning'
        );
        // Неудача снижает лояльность лидера
        leader.loyalty_score = Math.max(0, leader.loyalty_score - 4);
      }

      if (result.vetoed) {
        addEventLog(
          `⚖️ ${result.tribune_name} заблокировал инициативу «${faction.name}» правом вето.`,
          'warning'
        );
      }
    }

    this._recalculateSenateState();
  }

  // ══════════════════════════════════════════════════════════════════════
  // ЖИЗНЕННЫЙ ЦИКЛ
  // ══════════════════════════════════════════════════════════════════════

  apply_aging_process() {
    const casualties = [];
    for (const senator of this.senators) {
      senator.current_age   = (senator.current_age   ?? 45) + 1;
      senator.health_points = Math.max(1, (senator.health_points ?? 80) - 1 - Math.floor(Math.random() * 2));
      const cause = this._survivalCheck(senator);
      if (cause) casualties.push({ senator, cause });
    }
    return casualties;
  }

  _survivalCheck(senator) {
    const age = senator.current_age  ?? 45;
    const hp  = senator.health_points ?? 80;
    const loy = senator.loyalty_score;

    if (loy < 15 && Math.random() < 0.25) return 'exile';
    if (loy < 25 && Math.random() < 0.10) return 'exile';

    let dc = age >= 80 ? 0.40 : age >= 75 ? 0.22 : age >= 70 ? 0.12
           : age >= 65 ? 0.07 : age >= 60 ? 0.04 : age >= 50 ? 0.02 : 0.01;

    if      (hp < 20) dc += 0.25;
    else if (hp < 40) dc += 0.10;
    else if (hp < 60) dc += 0.04;
    if (hp > 80)      dc  = Math.max(0, dc - 0.02);

    if (Math.random() < dc) return hp < 40 ? 'illness' : 'natural';
    return null;
  }

  replace_senator(oldSenator, cause) {
    const idx = this.senators.indexOf(oldSenator);
    if (idx === -1) return null;

    const successor = this._createGhost(oldSenator.faction_id, 28 + Math.floor(Math.random() * 15));

    // Наследование клана (всегда — преемник из того же клана)
    if (oldSenator.clan_id) successor.clan_id = oldSenator.clan_id;

    // Династия: 20% шанс для материализованных предшественников
    if (oldSenator.materialized && oldSenator.name && Math.random() < 0.20) {
      const dynastyName          = oldSenator.name.split(' ')[0];
      successor.dynasty          = dynastyName;
      successor._dynasty_tag     = `Дин. ${dynastyName}`;
      successor.loyalty_score    = Math.max(10, Math.min(90,
        Math.round(oldSenator.loyalty_score * 0.6 + successor.loyalty_score * 0.4)
      ));
    }

    this.senators[idx] = successor;

    // Если ушедший был лидером фракции — сбрасываем, processTick переизберёт
    for (const faction of this.factions) {
      if (faction.leader_senator_id === oldSenator.id) {
        faction.leader_senator_id = null;
        break;
      }
    }

    return successor;
  }

  async _runYearlyLifeCycle() {
    const isPlayer   = this.nationId === GAME_STATE.player_nation;
    const casualties = this.apply_aging_process();
    casualties.sort((a, b) => (b.senator.materialized ? 1 : 0) - (a.senator.materialized ? 1 : 0));

    for (const { senator, cause } of casualties) {
      const wasKnown    = senator.materialized;
      const name        = senator.name ?? '?';
      const factionName = this._factionName(senator.faction_id);
      const clanName    = this._clanName(senator.clan_id);
      const age         = senator.current_age;

      const successor = this.replace_senator(senator, cause);
      if (!wasKnown || !isPlayer) continue;

      if (cause === 'natural') {
        addEventLog(
          `📜 Сенатор ${name} (${clanName}) скончался в возрасте ${age} лет. Клан ${clanName} ищет преемника.`,
          'character'
        );
      } else if (cause === 'illness') {
        try {
          const obit = await generateSenatorObituaryViaLLM(senator, factionName, this.global_senate_state);
          addEventLog(`⚰️ ${obit}`, 'character');
        } catch {
          addEventLog(`⚰️ Сенатор ${name} (${clanName}) погиб от болезни. Фракция ${factionName} ослаблена.`, 'character');
        }
      } else if (cause === 'exile') {
        // Клан получает удар по репутации за изгнание члена
        if (senator.clan_id) this.update_clan_reputation(senator.clan_id, -20);
        addEventLog(`⚖️ Сенатор ${name} (${clanName}) изгнан из Сената. Клан потерял место.`, 'political');
      }

      if (successor?.dynasty) {
        addEventLog(`🏛️ Место займёт представитель рода ${successor.dynasty} (${clanName}).`, 'info');
      }
    }

    // Ежегодно пересчитываем настроение Сената
    this._recalculateSenateState();
  }

  // ══════════════════════════════════════════════════════════════════════
  // ВНЕШНИЕ ТРИГГЕРЫ УРОНА
  // ══════════════════════════════════════════════════════════════════════

  async damage_senator(senatorId, damage) {
    const senator = this.getSenatorById(senatorId);
    if (!senator) return;
    senator.health_points = Math.max(0, (senator.health_points ?? 80) - damage);
    if (senator.health_points <= 0) {
      const wasKnown    = senator.materialized;
      const factionName = this._factionName(senator.faction_id);
      const clanName    = this._clanName(senator.clan_id);
      const successor   = this.replace_senator(senator, 'illness');
      if (wasKnown && this.nationId === GAME_STATE.player_nation) {
        try {
          const obit = await generateSenatorObituaryViaLLM(senator, factionName, this.global_senate_state);
          addEventLog(`⚰️ ${obit}`, 'character');
        } catch {
          addEventLog(`⚰️ Сенатор ${senator.name ?? '?'} (${clanName}) погиб.`, 'character');
        }
        if (successor?.dynasty) addEventLog(`🏛️ Место займёт представитель рода ${successor.dynasty}.`, 'info');
      }
      // Удар по репутации клана
      if (senator.clan_id) this.update_clan_reputation(senator.clan_id, -15);
    }
  }

  async apply_epidemic(damage, affectedFraction = 0.15) {
    const victims = [];
    for (const senator of [...this.senators]) {
      if (Math.random() < affectedFraction) {
        senator.health_points = Math.max(0, (senator.health_points ?? 80) - damage);
        if (senator.health_points <= 0) victims.push(senator);
      }
    }
    for (const s of victims) await this.damage_senator(s.id, 0);
    return victims.length;
  }

  // ══════════════════════════════════════════════════════════════════════
  // МАТЕРИАЛИЗАЦИЯ
  // ══════════════════════════════════════════════════════════════════════

  async materialize_senator(senatorId, reason = 'player_click') {
    const senator = this.getSenatorById(senatorId);
    if (!senator || senator.materialized) return senator;

    const faction = this.factions.find(f => f.id === senator.faction_id);
    const clan    = this.clans[senator.clan_id];

    const context = {
      faction_name:        faction?.name  ?? senator.faction_id,
      clan_name:           clan?.name     ?? null,
      loyalty_score:       senator.loyalty_score,
      ambition_level:      senator.ambition_level,
      clan_reputation:     senator.clan_id ? Math.round(this.getClanEffectiveReputation(senator.clan_id)) : 0,
      global_senate_state: this.global_senate_state,
      top_speakers_tags:   this._getTopSpeakers(3).map(s => `${s.name} [${s.traits.join(', ')}]`),
    };

    try {
      const result = await materializeSenatorViaLLM(senator, context, reason);
      if (senator._dynasty_tag && Array.isArray(result.traits)) result.traits.unshift(senator._dynasty_tag);
      Object.assign(senator, result, {
        materialized:        true,
        materialized_turn:   GAME_STATE.turn,
        materialized_reason: reason,
      });
    } catch (err) {
      console.warn(`materialize_senator fallback (${senatorId}):`, err.message);
      const fallback = this._deterministicMaterialize(senator, faction);
      if (senator._dynasty_tag) fallback.traits.unshift(senator._dynasty_tag);
      Object.assign(senator, fallback, {
        materialized:        true,
        materialized_turn:   GAME_STATE.turn,
        materialized_reason: 'fallback',
      });
    }

    // Blood_Feud: при первой материализации генерируем личную реплику
    if (
      this.nationId === GAME_STATE.player_nation &&
      (senator.hidden_interests ?? []).includes('Blood_Feud') &&
      !senator._blood_feud_dialogue &&
      typeof generateBloodFeudDialogueViaLLM === 'function'
    ) {
      const clan        = this.clans[senator.clan_id];
      const victims     = (clan?.blood_feud_victims ?? []).map(v => v.name);
      const nation      = GAME_STATE.nations[this.nationId];
      const lawsAfter   = (nation.active_laws ?? [])
        .filter(l => !l.turn || l.turn >= (clan?.blood_feud_since ?? 0))
        .slice(-3)
        .map(l => l.name ?? l.id ?? '?');
      generateBloodFeudDialogueViaLLM(senator, this._clanName(senator.clan_id), victims, lawsAfter)
        .then(text => {
          if (text) senator._blood_feud_dialogue = text;
        })
        .catch(() => {
          senator._blood_feud_dialogue =
            `Ты убил наших, Консул. Клан ${this._clanName(senator.clan_id)} помнит.`;
        });
    }

    return senator;
  }

  _deterministicMaterialize(senator, faction) {
    const NAMES   = ['Никий','Диодот','Агесилай','Лисий','Дамокрит',
                     'Фрасибул','Архелай','Мелесий','Полидор','Кратин',
                     'Тимолеон','Евфрон','Каллипп','Диодор','Феодот'];
    const ORIGINS = ['из Акрай','Катанский','Леонтинский','Мессанский',
                     'из Гелы','Сиракузянин','из Камарины'];

    const name = `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${
                   ORIGINS[Math.floor(Math.random() * ORIGINS.length)]}`;
    const tags  = [];
    if (senator.loyalty_score > 65)      tags.push('Лоялист');
    else if (senator.loyalty_score < 35) tags.push('Оппозиционер');
    if (senator.ambition_level >= 4)     tags.push('Честолюбец');
    tags.push({ aristocrats:'Патриций', demos:'Народник', military:'Ветеран', merchants:'Торговец' }[faction?.id] ?? 'Гражданин');
    if (tags.length < 2) tags.push('Осторожный');

    return {
      name,
      traits:    tags,
      biography: `Сенатор ${faction?.name ?? 'неизвестной фракции'}. Путь от гражданина до представителя народа.`,
      portrait:  { aristocrats:'🏛️', demos:'✊', military:'⚔️', merchants:'💰' }[faction?.id] ?? '👤',
      influence: senator.loyalty_score + senator.ambition_level * 5,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // УТИЛИТЫ
  // ══════════════════════════════════════════════════════════════════════

  updateGlobalState(description) {
    this.global_senate_state = description;
  }

  // ── 6. Пересчёт настроения Сената по реальным данным ─────────────
  // Вызывается при: смене лидера, Blood_Feud, Vendetta, выборах, ежегодно.
  _recalculateSenateState() {
    const senators = this.senators;
    if (!senators.length) return;

    const avgLoyalty = Math.round(
      senators.reduce((a, s) => a + s.loyalty_score, 0) / senators.length
    );
    const bloodFeudCount  = Object.values(this.clans).filter(c => c.blood_feud).length;
    const vendettaCount   = Object.values(this.clans).filter(c => c.vendetta).length;
    const conspiratorCount = senators.filter(s =>
      (s.hidden_interests ?? []).includes('Blood_Feud') ||
      (s.revealed_interests ?? []).includes('Conspirator')
    ).length;

    let state;
    if (avgLoyalty < 20) {
      state = 'Сенат на грани мятежа. Доверие к власти уничтожено.';
    } else if (avgLoyalty < 35) {
      state = 'Открытая враждебность. Фракции не скрывают ненависти к Консулу.';
    } else if (bloodFeudCount >= 2 || vendettaCount >= 2) {
      state = 'Зал залит ядом вендетты. Кровная месть определяет каждое голосование.';
    } else if (conspiratorCount >= 3) {
      state = 'Шёпот заговоров стелется между колоннами. Никто не доверяет соседу.';
    } else if (bloodFeudCount > 0 || vendettaCount > 0) {
      state = 'Напряжённость нарастает. Старые обиды не дают сенату покоя.';
    } else if (avgLoyalty < 50) {
      state = 'Сенат расколот. Фракции спорят громко, компромиссы даются с трудом.';
    } else if (avgLoyalty < 65) {
      state = 'Сенат спокоен. Политическая жизнь идёт своим чередом.';
    } else if (avgLoyalty < 80) {
      state = 'Сенаторы сплочены вокруг Консула. Законы проходят без труда.';
    } else {
      state = 'Единодушие редкое — Консул на вершине влияния. Сенат ему в руки.';
    }

    this.global_senate_state = state;
  }

  toJSON() {
    return {
      nation_id:           this.nationId,
      factions:            this.factions,
      clans:               this.clans,
      senators:            this.senators,
      global_senate_state: this.global_senate_state,
      _nextId:             this._nextId,
    };
  }

  static fromJSON(data) {
    const mgr               = new SenateManager(data.nation_id, data.factions);
    mgr.clans               = data.clans ?? {};
    mgr.senators            = data.senators;
    mgr.global_senate_state = data.global_senate_state;
    mgr._nextId             = data._nextId ?? data.senators.length + 1;
    return mgr;
  }
}

// ══════════════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЙ РЕЕСТР
// ══════════════════════════════════════════════════════════════════════

const SENATE_MANAGERS = {};

function getSenateManager(nationId) {
  return SENATE_MANAGERS[nationId] ?? null;
}

function initSenateForNation(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation?.senate_config) return null;
  if (SENATE_MANAGERS[nationId]) return SENATE_MANAGERS[nationId];

  const mgr = new SenateManager(nationId, nation.senate_config.factions);
  mgr.init(nation.senate_config.clans ?? []);
  // Вставляем именных персонажей нации как материализованных сенаторов
  mgr.injectNamedCharactersAsSenators(nation.characters ?? []);
  SENATE_MANAGERS[nationId] = mgr;
  return mgr;
}

function initAllSenates() {
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    initSenateForNation(nationId);
  }
}

// Синхронизирует faction.seats из SenateManager обратно в senate_config.factions
// Вызывается после голосований, которые могут изменить состав сената
function syncSenateConfigFromManager(nationId) {
  const mgr    = getSenateManager(nationId);
  const nation = GAME_STATE.nations[nationId];
  if (!mgr || !nation?.senate_config?.factions) return;

  for (const cfgFaction of nation.senate_config.factions) {
    const mgrFaction = mgr.factions.find(f => f.id === cfgFaction.id);
    if (mgrFaction) {
      cfgFaction.seats = mgr.senators.filter(s => s.faction_id === cfgFaction.id).length;
    }
  }

  // Обновляем total_seats
  nation.senate_config.total_seats = mgr.senators.length;
}
