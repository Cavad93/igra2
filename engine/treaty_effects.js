// engine/treaty_effects.js
// ══════════════════════════════════════════════════════════════════
// СЛОЙ 3: ПРИМЕНЕНИЕ ЭФФЕКТОВ ДОГОВОРОВ
//
// Функции:
//   applyTreatyEffects(treaty)         — вызывается ОДИН РАЗ при подписании
//   removeTreatyEffects(treaty)        — при расторжении / истечении
//   processAllTreatyTicks()            — каждый ход (финансы + флаги)
//
// Флаги хранятся в:
//   rel.flags = {}                     — между двумя нациями
//   nation._treaty_effects = {}        — числовые бонусы нации (пересчитываются каждый ход)
// ══════════════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ЭФФЕКТОВ ПРИ ПОДПИСАНИИ (one-shot)
// ─────────────────────────────────────────────────────────────

function applyTreatyEffects(treaty) {
  if (!treaty || treaty._effects_applied) return;

  const [a, b] = treaty.parties;
  const natA   = GAME_STATE.nations?.[a];
  const natB   = GAME_STATE.nations?.[b];
  if (!natA || !natB) return;

  const cond = treaty.conditions ?? {};

  switch (treaty.type) {
    case 'trade_agreement':     _onTrade(treaty, a, b, natA, natB, cond);     break;
    case 'non_aggression':      _onNonAgg(treaty, a, b, cond);                break;
    case 'defensive_alliance':  _onDefAlliance(treaty, a, b, cond);           break;
    case 'military_alliance':   _onMilAlliance(treaty, a, b, cond);           break;
    case 'marriage_alliance':   _onMarriage(treaty, a, b, natA, natB, cond);  break;
    case 'vassalage':           _onVassalage(treaty, a, b, natA, natB, cond); break;
    case 'peace_treaty':        _onPeace(treaty, a, b, cond);                 break;
    case 'military_access':     _onMilAccess(treaty, a, b, cond);             break;
    case 'war_reparations':     _onReparations(treaty, a, b, natA, natB, cond); break;
    case 'armistice':            _onArmistice(treaty, a, b, cond);             break;
    case 'territorial_exchange': _onTerritorialExchange(treaty, a, b, cond);  break;
    case 'joint_campaign':      _onJointCampaign(treaty, a, b, cond);         break;
    case 'cultural_exchange':   _onCultural(treaty, a, b, natA, natB, cond);  break;
    case 'embargo':             _onEmbargo(treaty, a, b, natA, natB, cond);   break;
    case 'custom':              _onCustom(treaty, a, b, natA, natB, cond);    break;
    default: break;
  }

  treaty._effects_applied = true;
  treaty._effects_turn    = GAME_STATE.turn ?? 1;

  // Бонус к отношениям за подписание
  _adjustRelScore(a, b, +8, 'treaty_signed');

  _log(`📜 Договор «${treaty.label ?? treaty.type}» вступил в силу между ${natA.name} и ${natB.name}.`);

  // Записываем в долгосрочную память обеих сторон
  if (typeof addMemoryEvent === 'function') {
    const tText = `Заключён договор «${treaty.label ?? treaty.type}» с ${natB.name}.`;
    addMemoryEvent(a, 'diplomacy', tText, [b]);
  }
}

// ─────────────────────────────────────────────────────────────
// СНЯТИЕ ЭФФЕКТОВ ПРИ РАСТОРЖЕНИИ / ИСТЕЧЕНИИ
// ─────────────────────────────────────────────────────────────

function removeTreatyEffects(treaty) {
  if (!treaty) return;
  const [a, b] = treaty.parties;
  const rel = _rel(a, b);

  // Сброс флагов, связанных с этим договором
  switch (treaty.type) {
    case 'armistice': {
      const stillHasArmistice = _hasAnotherOf('armistice', a, b, treaty.id);
      rel.flags.no_attack = stillHasArmistice || _hasAnotherOf('non_aggression', a, b, treaty.id);
      rel.flags.is_armistice = stillHasArmistice;
      if (treaty.status === 'broken') {
        // Нарушение перемирия — тяжёлый штраф
        _adjustRelScore(a, b, -50, 'armistice_broken');
        // Уведомить соседей (логируем, coalition уже обработан в declareWar)
        _log(`💥 Перемирие нарушено — тяжёлый штраф к отношениям.`);
      }
      break;
    }
    case 'non_aggression':
      rel.flags.no_attack = _hasAnotherOf('non_aggression', a, b, treaty.id)
                         || _hasAnotherOf('armistice', a, b, treaty.id);
      break;
    case 'defensive_alliance':
      rel.flags.auto_defend = _hasAnotherOf('defensive_alliance', a, b, treaty.id)
                           || _hasAnotherOf('military_alliance', a, b, treaty.id);
      break;
    case 'military_alliance':
      rel.flags.auto_defend  = _hasAnotherOf('defensive_alliance', a, b, treaty.id);
      rel.flags.joint_attack = _hasAnotherOf('military_alliance', a, b, treaty.id);
      rel.flags.military_access = _hasAnotherOf('military_access', a, b, treaty.id)
                               || _hasAnotherOf('military_alliance', a, b, treaty.id);
      break;
    case 'military_access':
      rel.flags.military_access = _hasAnotherOf('military_alliance', a, b, treaty.id);
      break;
    case 'trade_agreement':
      rel.flags.trade_open = _hasAnotherOf('trade_agreement', a, b, treaty.id);
      // Remove from trade_routes if this was the last trade agreement between them
      const [pa, pb] = treaty.parties;
      const natA2 = GAME_STATE.nations?.[pa];
      const natB2 = GAME_STATE.nations?.[pb];
      const stillHasTrade = GAME_STATE.diplomacy?.treaties?.some(t =>
        t.id !== treaty.id && t.status === 'active' && t.type === 'trade_agreement' &&
        t.parties.includes(pa) && t.parties.includes(pb)
      );
      if (!stillHasTrade) {
        if (natA2?.economy?.trade_routes) natA2.economy.trade_routes = natA2.economy.trade_routes.filter(id => id !== pb);
        if (natB2?.economy?.trade_routes) natB2.economy.trade_routes = natB2.economy.trade_routes.filter(id => id !== pa);
        // ECO_009: обновить визуализацию
        if (typeof window !== 'undefined' && window.showTradeRoutes) {
          window.clearTradeRouteLines?.();
          window.renderTradeRouteLines?.();
        }
      }
      break;
    case 'marriage_alliance':
      rel.flags.dynasty_link = _hasAnotherOf('marriage_alliance', a, b, treaty.id);
      break;
    case 'vassalage': {
      rel.flags.protectorate = false;
      const natA = GAME_STATE.nations?.[a];
      const natB = GAME_STATE.nations?.[b];
      if (natA) delete natA._vassal_of;
      if (natB) delete natB._vassal_of;
      break;
    }
    case 'embargo':
      rel.flags.embargo = false;
      _log(`✅ Торговое эмбарго между ${a} и ${b} снято.`);
      break;
    default: break;
  }

  // Штраф к отношениям только если разорвали (не истечение)
  if (treaty.status === 'broken') {
    _adjustRelScore(a, b, -20, 'treaty_broken');
    _log(`💔 Договор «${treaty.label ?? treaty.type}» разорван.`);
  } else {
    _log(`⏰ Договор «${treaty.label ?? treaty.type}» истёк.`);
  }
}

// ─────────────────────────────────────────────────────────────
// PER-TURN: финансы + обновление флагов (вызывать 1 раз за ход)
// ─────────────────────────────────────────────────────────────

function processAllTreatyTicks() {
  if (!GAME_STATE.diplomacy) return;

  const turn = GAME_STATE.turn ?? 1;

  // 1. Сбрасываем накопленные treaty-бонусы нации (пересчитываем с нуля)
  for (const nation of Object.values(GAME_STATE.nations ?? {})) {
    nation._treaty = {
      trade_bonus:      0,
      stability_bonus:  0,
      legitimacy_bonus: 0,
      tech_bonus:       0,
    };
  }

  // 2. Сбрасываем флаги отношений (заново проставляются из активных договоров)
  for (const rel of Object.values(GAME_STATE.diplomacy.relations ?? {})) {
    if (!rel.flags) rel.flags = {};
    rel.flags.trade_open      = false;
    rel.flags.market_access   = false;
    rel.flags.no_attack       = false;
    rel.flags.auto_defend     = false;
    rel.flags.joint_attack    = false;
    rel.flags.military_access = false;
    rel.flags.protectorate    = false;
    rel.flags.dynasty_link    = false;
    rel.flags.is_armistice    = false;
    rel.flags.embargo         = false;
  }

  // 3. Применяем флаги и финансовые эффекты каждого активного договора
  for (const treaty of GAME_STATE.diplomacy.treaties ?? []) {
    if (treaty.status !== 'active') continue;

    // Проверяем истечение срока
    if (treaty.turn_expires && turn > treaty.turn_expires) {
      treaty.status = 'expired';
      removeTreatyEffects(treaty);
      continue;
    }

    // Если договор ещё не применён (например, загружен из сохранения)
    if (!treaty._effects_applied) {
      applyTreatyEffects(treaty);
    }

    const [a, b] = treaty.parties;
    const rel = _rel(a, b);
    const cond = treaty.conditions ?? {};

    _setRelFlags(treaty, rel, a, b);
    _applyNationBonuses(treaty, a, b);
    _processFinancialTick(treaty, a, b, cond, turn);

    // DIP_001: штрафы эмбарго каждый ход
    if (treaty.type === 'embargo') applyEmbargo(treaty, turn);
  }

  // 4. Применяем накопленные бонусы нации в экономику
  for (const [nid, nation] of Object.entries(GAME_STATE.nations ?? {})) {
    if (!nation.economy) continue;
    const te = nation._treaty;
    if (!te) continue;

    // Торговый бонус — читается runEconomyTick() через _trade_treaty_bonus
    nation.economy._trade_treaty_bonus = te.trade_bonus;

    // Стабильность — добавляем к стабильности (если есть)
    if (te.stability_bonus && nation.stability !== undefined) {
      nation.stability = Math.min(100, (nation.stability ?? 50) + te.stability_bonus * 0.1);
    }

    // Легитимность
    if (te.legitimacy_bonus && nation.government) {
      nation.government._diplomacy_legitimacy = te.legitimacy_bonus;
    }
  }

  // 5. Вассальная дань (из peace_panel вассалитетов)
  for (const [vasId, vasNat] of Object.entries(GAME_STATE.nations ?? {})) {
    if (!vasNat.is_vassal || vasNat.is_eliminated) continue;
    const suzId  = vasNat.suzerain;
    if (!suzId) continue;
    const suzNat = GAME_STATE.nations?.[suzId];
    if (!suzNat) continue;
    const tribute = vasNat.vassal_tribute ?? 0;
    if (tribute <= 0) continue;
    // Раз в 12 ходов (ежегодно)
    if (turn % 12 !== 0) continue;
    if (vasNat.economy) vasNat.economy.treasury = Math.max(0, (vasNat.economy.treasury ?? 0) - tribute);
    if (suzNat.economy) suzNat.economy.treasury = (suzNat.economy.treasury ?? 0) + tribute;
    if (typeof _log === 'function')
      _log(`💰 Дань: ${vasNat.name ?? vasId} → ${suzNat.name ?? suzId}: ${tribute} монет.`);
  }
}

// ─────────────────────────────────────────────────────────────
// ОБРАБОТЧИКИ ПОДПИСАНИЯ ПО ТИПАМ
// ─────────────────────────────────────────────────────────────

function _onTrade(treaty, a, b, natA, natB, cond) {
  _rel(a, b).flags.trade_open    = true;
  _rel(a, b).flags.market_access = true;

  // Условия могут прийти напрямую из JSON AI-переговорщика (cond.tariff_rate)
  // ИЛИ из AI-интерпретатора текста договора (cond._interpreted_effects.tariff_rate).
  // Приоритет: прямые условия → интерпретированные → 0 (беспошлинно по умолчанию для договора)
  const ie = cond._interpreted_effects ?? {};
  _rel(a, b).flags.tariff_rate = cond.tariff_rate ?? ie.tariff_rate ?? 0;
  _rel(a, b).flags.preferential_goods = Array.isArray(cond.preferential_goods)
    ? [...cond.preferential_goods]
    : Array.isArray(ie.preferential_goods) ? [...ie.preferential_goods] : [];

  // Sync trade_routes arrays so processTrade() can find partners
  if (!natA.economy.trade_routes) natA.economy.trade_routes = [];
  if (!natB.economy.trade_routes) natB.economy.trade_routes = [];
  if (!natA.economy.trade_routes.includes(b)) natA.economy.trade_routes.push(b);
  if (!natB.economy.trade_routes.includes(a)) natB.economy.trade_routes.push(a);
  // ECO_009: обновить визуализацию торговых маршрутов
  if (typeof window !== 'undefined' && window.showTradeRoutes) {
    window.clearTradeRouteLines?.();
    window.renderTradeRouteLines?.();
  }
}

function _onNonAgg(treaty, a, b, cond) {
  _rel(a, b).flags.no_attack = true;
}

function _onArmistice(treaty, a, b, cond) {
  const rel = _rel(a, b);
  rel.flags.no_attack    = true;
  rel.flags.is_armistice = true;
}

function _onDefAlliance(treaty, a, b, cond) {
  _rel(a, b).flags.auto_defend = true;
}

function _onMilAlliance(treaty, a, b, cond) {
  const rel = _rel(a, b);
  rel.flags.auto_defend    = true;
  rel.flags.joint_attack   = true;
  rel.flags.military_access = true;
}

function _onMarriage(treaty, a, b, natA, natB, cond) {
  _rel(a, b).flags.dynasty_link = true;
  // Немедленный бонус к отношениям
  _adjustRelScore(a, b, +15, 'marriage');
  // Бонус легитимности
  if (natA.government) natA.government._marriage_legitimacy = (natA.government._marriage_legitimacy ?? 0) + 5;
  if (natB.government) natB.government._marriage_legitimacy = (natB.government._marriage_legitimacy ?? 0) + 5;
  _log(`💍 Брачный союз заключён: ${natA.name} и ${natB.name} — династии объединены.`);
}

function _onVassalage(treaty, a, b, natA, natB, cond) {
  // a = сюзерен, b = вассал (или наоборот — определяем по размеру)
  const popA = natA.population?.total ?? 100_000;
  const popB = natB.population?.total ?? 100_000;
  const [suzerain, vassal] = popA >= popB ? [a, b] : [b, a];
  const vasNat = GAME_STATE.nations[vassal];

  _rel(a, b).flags.protectorate = true;
  if (vasNat) vasNat._vassal_of = suzerain;

  const suz = GAME_STATE.nations[suzerain];
  _log(`🏳 Вассалитет: ${vasNat?.name ?? vassal} теперь вассал ${suz?.name ?? suzerain}.`);
}

function _onPeace(treaty, a, b, cond) {
  const rel = _rel(a, b);
  rel.war = false;
  // Перемирие на 5 лет = 60 ходов (1 год = 12 ходов)
  const until = (GAME_STATE.turn ?? 1) + 5 * 12;
  rel.truces = (rel.truces ?? []).filter(t => t.until_turn > (GAME_STATE.turn ?? 1));
  rel.truces.push({ until_turn: until });
  rel.flags.no_attack = true;

  // Синхронизация с устаревшим форматом nation.relations[x].at_war
  const natA = GAME_STATE.nations[a];
  const natB = GAME_STATE.nations[b];
  if (natA?.relations?.[b]) natA.relations[b].at_war = false;
  if (natB?.relations?.[a]) natB.relations[a].at_war = false;
  if (natA?.military?.at_war_with) natA.military.at_war_with = natA.military.at_war_with.filter(id => id !== b);
  if (natB?.military?.at_war_with) natB.military.at_war_with = natB.military.at_war_with.filter(id => id !== a);

  // ── Снятие оккупационных маркеров ────────────────────────────────
  // Все регионы занятые одной стороной у другой — становятся официально их
  for (const region of Object.values(GAME_STATE.regions ?? {})) {
    const occ  = region.occupied_by;
    const orig = region.original_nation;
    if (!occ || !orig) continue;
    // Если оккупация была между a и b — снимаем метки
    const isAB = (occ === a && orig === b) || (occ === b && orig === a);
    if (!isAB) continue;
    region.occupied_by     = null;
    region.original_nation = null;
  }

  // ── Проверка елиминации обоих участников ─────────────────────────
  if (typeof checkNationDefeated === 'function') {
    checkNationDefeated(a, b);
    checkNationDefeated(b, a);
  }

  _log(`☮ Мирный договор: ${natA?.name ?? a} и ${natB?.name ?? b} прекращают войну.`);
}

function _onMilAccess(treaty, a, b, cond) {
  _rel(a, b).flags.military_access = true;
}

function _onReparations(treaty, a, b, natA, natB, cond) {
  // Единовременный платёж при подписании
  if (cond.one_time_payment > 0) {
    const payerId  = _payerOf(treaty, GAME_STATE.player_nation, a, b);
    const rcvId    = treaty.parties.find(p => p !== payerId);
    const payerNat = GAME_STATE.nations[payerId];
    const rcvNat   = GAME_STATE.nations[rcvId];
    if (payerNat?.economy && rcvNat?.economy) {
      payerNat.economy.treasury -= cond.one_time_payment;
      rcvNat.economy.treasury   += cond.one_time_payment;
      _log(`💰 Единовременная контрибуция: ${cond.one_time_payment} монет переведено.`);
    }
  }
}

function _onTerritorialExchange(treaty, a, b, cond) {
  if (!Array.isArray(cond.transfer_regions) || !cond.transfer_regions.length) return;
  const toId = b; // по умолчанию: a передаёт b

  const transferredFrom = new Set();

  for (const regionId of cond.transfer_regions) {
    const region = GAME_STATE.regions?.[regionId];
    if (!region) continue;
    const prevOwner = region.nation;
    region.nation          = toId;
    region.occupied_by     = null;
    region.original_nation = null;

    transferredFrom.add(prevOwner);

    // Обновляем списки регионов наций
    const fromNat = GAME_STATE.nations[prevOwner];
    const toNat   = GAME_STATE.nations[toId];
    if (fromNat?.regions) {
      fromNat.regions = fromNat.regions.filter(r => r !== regionId);
    }
    if (toNat?.regions) {
      if (!toNat.regions.includes(regionId)) toNat.regions.push(regionId);
    }
    _log(`🗺 Регион «${region.name ?? regionId}» передан ${toNat?.name ?? toId}.`);
  }

  // Проверяем елиминацию наций которые лишились регионов
  if (typeof checkNationDefeated === 'function') {
    for (const prevOwner of transferredFrom) {
      checkNationDefeated(prevOwner, toId);
    }
  }
}

function _onJointCampaign(treaty, a, b, cond) {
  _rel(a, b).flags.joint_attack    = true;
  _rel(a, b).flags.military_access = true;
}

function _onCultural(treaty, a, b, natA, natB, cond) {
  // Немедленный бонус стабильности
  if (natA.stability !== undefined) natA.stability = Math.min(100, (natA.stability ?? 50) + 2);
  if (natB.stability !== undefined) natB.stability = Math.min(100, (natB.stability ?? 50) + 2);
}

// ─────────────────────────────────────────────────────────────
// DIP_001: ЭМБАРГО — подписание
// ─────────────────────────────────────────────────────────────

function _onEmbargo(treaty, a, b, natA, natB, cond) {
  const rel = _rel(a, b);
  rel.flags.embargo      = true;
  rel.flags.trade_open   = false;
  rel.flags.market_access = false;

  // Сохраняем роли: embargo_target — тот, против кого направлено эмбарго
  // Если явно не указан — считаем b целью (инициатор = a)
  const targetId  = cond.embargo_target ?? b;
  const imposerId = treaty.parties.find(p => p !== targetId);
  treaty.conditions.embargo_target  = targetId;
  treaty.conditions.embargo_imposer = imposerId;

  const targetNat  = GAME_STATE.nations?.[targetId];
  const imposerNat = GAME_STATE.nations?.[imposerId];

  // Блокируем торговые пути между сторонами
  if (targetNat?.economy?.trade_routes) {
    targetNat.economy.trade_routes = targetNat.economy.trade_routes.filter(id => id !== imposerId);
  }
  if (imposerNat?.economy?.trade_routes) {
    imposerNat.economy.trade_routes = imposerNat.economy.trade_routes.filter(id => id !== targetId);
  }

  // Обновляем SuperOU переменные санкций
  if (typeof window !== 'undefined') {
    const durationTurns = (treaty.conditions.duration ?? 5) * 12;
    window.SuperOU?.onDiplomacyEvent?.(targetId,  'CHRONICLE_EVENT', { variable: 'sanctions_received', delta:  0.15, duration: durationTurns });
    window.SuperOU?.onDiplomacyEvent?.(imposerId, 'CHRONICLE_EVENT', { variable: 'sanctions_imposed',  delta:  0.15, duration: durationTurns });
  }

  _log(`🚫 Торговое эмбарго введено против ${targetNat?.name ?? targetId} от ${imposerNat?.name ?? imposerId}.`);
}

// ─────────────────────────────────────────────────────────────
// DIP_001: ЭМБАРГО — перturновый штраф (вызывается из processAllTreatyTicks)
// ─────────────────────────────────────────────────────────────

function applyEmbargo(treaty, turn) {
  if (!treaty || treaty.status !== 'active' || treaty.type !== 'embargo') return;

  const [a, b]    = treaty.parties;
  const targetId  = treaty.conditions?.embargo_target ?? b;
  const imposerId = treaty.parties.find(p => p !== targetId);
  const targetNat  = GAME_STATE.nations?.[targetId];
  const imposerNat = GAME_STATE.nations?.[imposerId];
  if (!targetNat || !imposerNat) return;

  // -20% дохода казны цели за ход
  if (targetNat.economy) {
    const income  = targetNat.economy.income
      ?? Math.max(0, (targetNat.economy.treasury ?? 0) * 0.05);
    const penalty = income * 0.20;
    if (penalty > 0) {
      targetNat.economy.treasury = Math.max(0, (targetNat.economy.treasury ?? 0) - penalty);
      if ((turn ?? 0) % 12 === 0) {
        _log(`🚫 Эмбарго: ${targetNat.name ?? targetId} теряет ${Math.round(penalty)} монет (-20% дохода).`);
      }
    }
  }

  // +5 к отношениям с врагами цели за каждый ход
  const nations = GAME_STATE.nations ?? {};
  for (const [otherId, otherNat] of Object.entries(nations)) {
    if (otherId === targetId || otherId === imposerId) continue;
    if (otherNat.is_eliminated) continue;
    // Проверяем, является ли эта нация врагом цели (отношения < -20)
    const relToTarget = _rel(otherId, targetId);
    if ((relToTarget.score ?? 0) < -20) {
      _adjustRelScore(imposerId, otherId, 5, 'embargo_solidarity');
    }
  }
}

function _onCustom(treaty, a, b, natA, natB, cond) {
  // Применяем уже интерпретированные эффекты (если AI интерпретатор их заполнил)
  const ef = cond._interpreted_effects ?? {};

  if (ef.flags) {
    const rel = _rel(a, b);
    Object.assign(rel.flags, ef.flags);
  }
  if (ef.one_time_payment > 0) {
    const payerNat = GAME_STATE.nations[ef.payer ?? a];
    const rcvNat   = GAME_STATE.nations[ef.receiver ?? b];
    if (payerNat?.economy && rcvNat?.economy) {
      payerNat.economy.treasury -= ef.one_time_payment;
      rcvNat.economy.treasury   += ef.one_time_payment;
    }
  }
  if (ef.transfer_regions) {
    _onTerritorialExchange({ ...treaty, conditions: { transfer_regions: ef.transfer_regions } }, a, b, {});
  }
}

// ─────────────────────────────────────────────────────────────
// УСТАНОВКА ФЛАГОВ В ТИКЕ (из активных договоров)
// ─────────────────────────────────────────────────────────────

function _setRelFlags(treaty, rel, a, b) {
  if (!rel.flags) rel.flags = {};
  switch (treaty.type) {
    case 'trade_agreement':
      rel.flags.trade_open    = true;
      rel.flags.market_access = true;
      // Читаем из прямых условий или из AI-интерпретатора (оба источника)
      const _ie = treaty.conditions?._interpreted_effects ?? {};
      rel.flags.tariff_rate        = treaty.conditions?.tariff_rate ?? _ie.tariff_rate ?? 0;
      rel.flags.preferential_goods = treaty.conditions?.preferential_goods ?? _ie.preferential_goods ?? [];
      break;
    case 'non_aggression':     rel.flags.no_attack  = true; break;
    case 'defensive_alliance': rel.flags.auto_defend = true; break;
    case 'military_alliance':
      rel.flags.auto_defend    = true;
      rel.flags.joint_attack   = true;
      rel.flags.military_access = true;
      break;
    case 'marriage_alliance':  rel.flags.dynasty_link = true; break;
    case 'vassalage':          rel.flags.protectorate = true; break;
    case 'military_access':    rel.flags.military_access = true; break;
    case 'armistice':
      rel.flags.no_attack    = true;
      rel.flags.is_armistice = true;
      break;
    case 'joint_campaign':
      rel.flags.joint_attack   = true;
      rel.flags.military_access = true;
      break;
    case 'embargo':
      rel.flags.embargo         = true;
      rel.flags.trade_open      = false;  // эмбарго блокирует торговлю
      rel.flags.market_access   = false;
      break;
    default: break;
  }
}

// ─────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ЧИСЛОВЫХ БОНУСОВ НАЦИИ В ТИКЕ
// ─────────────────────────────────────────────────────────────

function _applyNationBonuses(treaty, a, b) {
  const natA = GAME_STATE.nations?.[a];
  const natB = GAME_STATE.nations?.[b];
  if (!natA || !natB) return;

  const te_a = natA._treaty ?? (natA._treaty = { trade_bonus:0, stability_bonus:0, legitimacy_bonus:0, tech_bonus:0 });
  const te_b = natB._treaty ?? (natB._treaty = { trade_bonus:0, stability_bonus:0, legitimacy_bonus:0, tech_bonus:0 });

  switch (treaty.type) {
    case 'trade_agreement':
      te_a.trade_bonus      += 0.15;
      te_b.trade_bonus      += 0.15;
      break;
    case 'cultural_exchange':
      te_a.stability_bonus  += 3;
      te_b.stability_bonus  += 3;
      te_a.tech_bonus       += 0.05;
      te_b.tech_bonus       += 0.05;
      break;
    case 'marriage_alliance':
      te_a.legitimacy_bonus += 5;
      te_b.legitimacy_bonus += 5;
      te_a.trade_bonus      += 0.05;
      te_b.trade_bonus      += 0.05;
      break;
    case 'defensive_alliance':
    case 'military_alliance':
      // Снижение напряжённости = косвенная стабильность
      te_a.stability_bonus  += 1;
      te_b.stability_bonus  += 1;
      break;
    default: break;
  }
}

// ─────────────────────────────────────────────────────────────
// ФИНАНСОВЫЕ ОПЕРАЦИИ В ТИКЕ (tribute, reparations)
// ─────────────────────────────────────────────────────────────

function _processFinancialTick(treaty, a, b, cond, turn) {
  // Контрибуция за ход
  if (cond.reparations_per_turn > 0) {
    const payerId = _payerOf(treaty, GAME_STATE.player_nation, a, b);
    const rcvId   = treaty.parties.find(p => p !== payerId);
    const payer   = GAME_STATE.nations[payerId];
    const rcv     = GAME_STATE.nations[rcvId];
    if (payer?.economy && rcv?.economy) {
      const amount = Math.min(cond.reparations_per_turn, payer.economy.treasury * 0.5);
      payer.economy.treasury -= amount;
      rcv.economy.treasury   += amount;
      if (amount > 0 && turn % 12 === 0) {  // логируем раз в год
        _log(`💰 Контрибуция: ${payer.name ?? payerId} выплатил ${Math.round(amount)} монет.`);
      }
    }
  }

  // Дань вассала (% от дохода)
  if (treaty.type === 'vassalage' && cond.tribute_pct > 0) {
    const vasNatId = _findVassal(a, b);
    if (vasNatId) {
      const suzNatId = treaty.parties.find(p => p !== vasNatId);
      const vasNat   = GAME_STATE.nations[vasNatId];
      const suzNat   = GAME_STATE.nations[suzNatId];
      if (vasNat?.economy && suzNat?.economy) {
        const income  = vasNat.economy.income
          ?? (vasNat.economy.treasury > 0 ? vasNat.economy.treasury * 0.1 : 0);
        const tribute = income * (cond.tribute_pct ?? 0.10);
        vasNat.economy.treasury -= tribute;
        suzNat.economy.treasury += tribute;
        if (tribute > 0 && turn % 12 === 0) {
          _log(`🏳 Дань: ${vasNat.name} выплатил ${Math.round(tribute)} монет ${suzNat.name}.`);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ
// ─────────────────────────────────────────────────────────────

function _rel(a, b) {
  if (!GAME_STATE.diplomacy) return { flags: {} };
  const key = [a, b].sort().join('_');
  if (!GAME_STATE.diplomacy.relations[key]) {
    GAME_STATE.diplomacy.relations[key] = { score: 0, war: false, truces: [], events: [], flags: {}, last_interaction: null };
  }
  const rel = GAME_STATE.diplomacy.relations[key];
  if (!rel.flags) rel.flags = {};
  return rel;
}

function _adjustRelScore(a, b, delta, event) {
  const rel = _rel(a, b);
  rel.score = Math.max(-100, Math.min(100, (rel.score ?? 0) + delta));
  if (typeof addDiplomacyEvent === 'function') {
    addDiplomacyEvent(a, b, delta, event);
  }
}

function _hasAnotherOf(type, a, b, excludeId) {
  return (GAME_STATE.diplomacy?.treaties ?? []).some(t =>
    t.status === 'active' && t.type === type && t.id !== excludeId &&
    t.parties.includes(a) && t.parties.includes(b)
  );
}

function _payerOf(treaty, playerNationId, a, b) {
  // Для рeparations — обычно AI нация платит игроку (проигравший в войне)
  return treaty.parties.find(p => p !== playerNationId) ?? a;
}

function _findVassal(a, b) {
  const natA = GAME_STATE.nations[a];
  const natB = GAME_STATE.nations[b];
  const popA = natA?.population?.total ?? 100_000;
  const popB = natB?.population?.total ?? 100_000;
  return popA < popB ? a : b;
}

function _log(msg) {
  if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');
  else console.info('[treaty_effects]', msg);
}
