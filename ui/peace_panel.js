// ══════════════════════════════════════════════════════════════════════
// PEACE OFFER PANEL — UI для мирных переговоров после победы
//
// Вызывается когда игрок захватил все регионы врага (checkNationDefeated).
// Показывает 4 варианта условий мира:
//   💰 Контрибуция   — противник платит, сохраняет независимость
//   🗺 Уступки       — частичная передача регионов + пауза войны
//   👑 Аннексия      — полное поглощение (is_eliminated = true)
//   🤝 Вассалитет    — противник становится вассалом
// ══════════════════════════════════════════════════════════════════════

let _peaceTargetNationId = null;

// ── Открыть панель ────────────────────────────────────────────────────

function showPeaceOfferPanel(defeatedNationId) {
  const defeated = GAME_STATE.nations?.[defeatedNationId];
  const player   = GAME_STATE.nations?.[GAME_STATE.player_nation];
  if (!defeated || !player) return;

  _peaceTargetNationId = defeatedNationId;
  _renderPeacePanel(defeatedNationId);

  const overlay = document.getElementById('peace-offer-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closePeacePanel() {
  _peaceTargetNationId = null;
  const overlay = document.getElementById('peace-offer-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Рендер ────────────────────────────────────────────────────────────

function _renderPeacePanel(defeatedNationId) {
  const defeated = GAME_STATE.nations?.[defeatedNationId];
  const player   = GAME_STATE.nations?.[GAME_STATE.player_nation];
  if (!defeated || !player) return;

  const defTreasury   = Math.round(defeated.economy?.treasury ?? 0);
  const maxTribute    = Math.max(0, Math.floor(defTreasury * 0.5));
  const defaultTribute = Math.max(50, Math.min(maxTribute, 300));

  // Оккупированные регионы принадлежащие побеждённому (сейчас захвачены игроком)
  const occupiedRegions = Object.entries(GAME_STATE.regions ?? {}).filter(
    ([, r]) => r.occupied_by === GAME_STATE.player_nation
            && r.original_nation === defeatedNationId
  );
  const regionCount = occupiedRegions.length;

  const box = document.getElementById('peace-offer-box');
  if (!box) return;

  box.innerHTML = `
    <div class="po-header">
      <span class="po-icon">🕊</span>
      <div>
        <div class="po-title">Условия мира</div>
        <div class="po-subtitle">${defeated.flag_emoji ?? '🏴'} ${defeated.name} разгромлена</div>
      </div>
      <button class="po-close" onclick="closePeacePanel()">✕</button>
    </div>

    <div class="po-desc">
      Все провинции захвачены. Выберите условия мирного договора:
    </div>

    <!-- Контрибуция -->
    <button class="po-option" onclick="peaceAcceptTribute()">
      <div class="po-opt-icon">💰</div>
      <div class="po-opt-body">
        <div class="po-opt-title">Контрибуция</div>
        <div class="po-opt-desc">
          Получить <strong>${defaultTribute} монет</strong> и восстановить границы.
          ${defeated.name} сохраняет независимость.
        </div>
      </div>
    </button>

    <!-- Аннексия -->
    <button class="po-option po-option--danger" onclick="peaceAcceptAnnexation()">
      <div class="po-opt-icon">👑</div>
      <div class="po-opt-body">
        <div class="po-opt-title">Полная аннексия</div>
        <div class="po-opt-desc">
          Присоединить все <strong>${regionCount} провинций</strong> к своей стране.
          ${defeated.name} прекращает существование.
        </div>
      </div>
    </button>

    <!-- Вассалитет -->
    <button class="po-option po-option--vassal" onclick="peaceAcceptVassal()">
      <div class="po-opt-icon">🤝</div>
      <div class="po-opt-body">
        <div class="po-opt-title">Вассалитет</div>
        <div class="po-opt-desc">
          ${defeated.name} становится вассалом — платит дань и подчиняется вашей внешней политике.
          Регионы возвращаются под их управление.
        </div>
      </div>
    </button>

    <!-- Просто мир -->
    <button class="po-option po-option--neutral" onclick="peaceAcceptPeace()">
      <div class="po-opt-icon">🏳</div>
      <div class="po-opt-body">
        <div class="po-opt-title">Белый мир</div>
        <div class="po-opt-desc">
          Прекратить войну без условий. Все регионы возвращаются к довоенным владельцам.
        </div>
      </div>
    </button>
  `;
}

// ── Варианты мира ─────────────────────────────────────────────────────

/**
 * Контрибуция: деньги + мир, регионы возвращаются.
 */
function peaceAcceptTribute() {
  const defeatedId = _peaceTargetNationId;
  if (!defeatedId) return;

  const defeated = GAME_STATE.nations?.[defeatedId];
  const player   = GAME_STATE.nations?.[GAME_STATE.player_nation];
  if (!defeated || !player) return;

  const defTreasury    = Math.round(defeated.economy?.treasury ?? 0);
  const tributeAmount  = Math.max(50, Math.min(Math.floor(defTreasury * 0.5), 300));

  // Перевод денег
  if (defeated.economy) defeated.economy.treasury -= tributeAmount;
  if (player.economy)   player.economy.treasury   += tributeAmount;

  // Мир + восстановление регионов
  _restoreOccupiedRegions(defeatedId);
  _endWar(GAME_STATE.player_nation, defeatedId);

  if (typeof addEventLog === 'function')
    addEventLog(
      `☮️ Мир с ${defeated.name}: контрибуция ${tributeAmount} монет. `
      + `${defeated.name} сохраняет независимость.`,
      'diplomacy'
    );

  closePeacePanel();
  if (typeof refreshRegionStyles === 'function') refreshRegionStyles();
  if (typeof renderLeftPanel === 'function') renderLeftPanel();
}

/**
 * Аннексия: все регионы переходят к игроку, нация уничтожается.
 */
function peaceAcceptAnnexation() {
  const defeatedId = _peaceTargetNationId;
  if (!defeatedId) return;

  const defeated = GAME_STATE.nations?.[defeatedId];
  const playerId = GAME_STATE.player_nation;
  if (!defeated) return;

  // Все оккупированные регионы officially переходят к игроку
  for (const region of Object.values(GAME_STATE.regions ?? {})) {
    if (region.occupied_by === playerId && region.original_nation === defeatedId) {
      region.nation          = playerId;
      region.occupied_by     = null;
      region.original_nation = null;
    }
  }

  // Помечаем нацию как уничтоженную
  defeated.is_eliminated = true;
  defeated.eliminated_turn = GAME_STATE.turn ?? 1;
  defeated.eliminated_by   = playerId;

  _endWar(playerId, defeatedId);

  if (typeof addEventLog === 'function')
    addEventLog(
      `👑 ${defeated.name} аннексирована. Все провинции включены в состав `
      + `${GAME_STATE.nations[playerId]?.name ?? playerId}.`,
      'diplomacy'
    );

  closePeacePanel();
  if (typeof refreshRegionStyles === 'function') refreshRegionStyles();
  if (typeof renderLeftPanel === 'function') renderLeftPanel();
  if (typeof renderAllArmies === 'function') renderAllArmies();
}

/**
 * Вассалитет: регионы возвращаются, нация платит ежегодную дань.
 */
function peaceAcceptVassal() {
  const defeatedId = _peaceTargetNationId;
  if (!defeatedId) return;

  const defeated = GAME_STATE.nations?.[defeatedId];
  const playerId = GAME_STATE.player_nation;
  if (!defeated) return;

  // Возвращаем регионы
  _restoreOccupiedRegions(defeatedId);

  // Устанавливаем вассалитет
  defeated.is_vassal   = true;
  defeated.suzerain    = playerId;
  defeated.vassal_tribute = Math.max(20, Math.round((defeated.economy?.income_per_turn ?? 100) * 0.20));

  const player = GAME_STATE.nations[playerId];
  if (!player.vassals) player.vassals = [];
  if (!player.vassals.includes(defeatedId)) player.vassals.push(defeatedId);

  _endWar(playerId, defeatedId);

  if (typeof addEventLog === 'function')
    addEventLog(
      `🤝 ${defeated.name} становится вассалом. `
      + `Ежегодная дань: ${defeated.vassal_tribute} монет.`,
      'diplomacy'
    );

  closePeacePanel();
  if (typeof refreshRegionStyles === 'function') refreshRegionStyles();
  if (typeof renderLeftPanel === 'function') renderLeftPanel();
}

/**
 * Белый мир: без условий, регионы возвращаются.
 */
function peaceAcceptPeace() {
  const defeatedId = _peaceTargetNationId;
  if (!defeatedId) return;

  const defeated = GAME_STATE.nations?.[defeatedId];
  if (!defeated) return;

  _restoreOccupiedRegions(defeatedId);
  _endWar(GAME_STATE.player_nation, defeatedId);

  if (typeof addEventLog === 'function')
    addEventLog(`🏳 Белый мир с ${defeated.name}. Война окончена без условий.`, 'diplomacy');

  closePeacePanel();
  if (typeof refreshRegionStyles === 'function') refreshRegionStyles();
  if (typeof renderLeftPanel === 'function') renderLeftPanel();
}

// ── Вспомогательные ───────────────────────────────────────────────────

/**
 * Снять оккупационные маркеры: регионы возвращаются original_nation.
 */
function _restoreOccupiedRegions(defeatedId) {
  const playerId = GAME_STATE.player_nation;
  for (const region of Object.values(GAME_STATE.regions ?? {})) {
    if (region.occupied_by === playerId && region.original_nation === defeatedId) {
      region.nation          = defeatedId;
      region.occupied_by     = null;
      region.original_nation = null;
    }
  }
  // Сброс флага is_defeated — нация не уничтожена
  const defeated = GAME_STATE.nations?.[defeatedId];
  if (defeated) {
    defeated.is_defeated = false;
    defeated.defeated_by = null;
  }
}

/**
 * Завершить войну между двумя нациями (обновить все военные флаги).
 */
function _endWar(nationA, nationB) {
  const natA = GAME_STATE.nations?.[nationA];
  const natB = GAME_STATE.nations?.[nationB];

  if (natA?.military?.at_war_with) {
    natA.military.at_war_with = natA.military.at_war_with.filter(id => id !== nationB);
  }
  if (natB?.military?.at_war_with) {
    natB.military.at_war_with = natB.military.at_war_with.filter(id => id !== nationA);
  }
  if (natA?.relations?.[nationB]) natA.relations[nationB].at_war = false;
  if (natB?.relations?.[nationA]) natB.relations[nationA].at_war = false;

  // Перемирие 5 лет через relations engine
  if (typeof _rel === 'function') {
    const rel = _rel(nationA, nationB);
    if (rel) {
      rel.war = false;
      rel.flags = rel.flags ?? {};
      rel.flags.no_attack = true;
      const until = (GAME_STATE.turn ?? 1) + 60;
      if (!rel.truces) rel.truces = [];
      rel.truces.push({ until_turn: until });
    }
  }

  // Disbanding sieges involving these two nations
  for (const siege of GAME_STATE.sieges ?? []) {
    if (siege.status !== 'active') continue;
    const involves = (siege.attacker_nation === nationA && siege.defender_nation === nationB)
                  || (siege.attacker_nation === nationB && siege.defender_nation === nationA);
    if (involves) siege.status = 'lifted';
  }
}
