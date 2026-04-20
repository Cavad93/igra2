// engine/ai_fallback.js — Этап 49
// Fallback AI: applyFallbackDecision (вынесено из engine/turn.js)

import { CONFIG } from '../config.js';
import {
  _tickOU, _softmax, _weightedPick,
  _findWarTarget, _findDiplomacyPartner, _findBuildTarget, _SUPER_OU_ACTION_MAP,
} from './ai_scoring.js';
import { SuperOU } from './super_ou.js';

// ──────────────────────────────────────────────────────────────
// Этап 8 economic3.md — sellSurplusAndImportDeficits
//
// Простая экономическая поведенческая логика для всех активных наций,
// вызывается каждый ход перед основным SuperOU-тиком:
//   1) sell_surplus: если товара в стоке > 3× ожидаемого потребления —
//      продать избыток на мировой рынок (получить монеты, уменьшить stockpile)
//   2) import_deficit: если товара в стоке < 50% от дневного потребления,
//      на рынке есть supply и у нации есть деньги — купить
// Парная с Этапом 2 (trade cap): без AI-продажи cap блокировал оборот,
// exponential_stock вырос 36→56. Должно вернуть значения к минимуму.
// ──────────────────────────────────────────────────────────────
export function sellSurplusAndImportDeficits(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return;
  const eco = nation.economy;
  const pop = nation.population?.total || 0;
  if (!eco?.stockpile || pop <= 0) return;
  const market = GAME_STATE.market || {};

  for (const [good, qty] of Object.entries(eco.stockpile)) {
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const mkt = market[good];
    if (!mkt || !Number.isFinite(mkt.price) || mkt.price <= 0) continue;

    // Консервативная оценка потребления: 1% населения × 0.5 кг/мес базовая корзина.
    // Точное consumption в calculateConsumption зависит от класса, здесь — приближённо.
    const monthlyConsumption = Math.max(10, pop * 0.005);
    const targetStock = monthlyConsumption * 3;  // 3-месячный буфер

    // sell_surplus: >5× target → продаём избыток на 80% от market price.
    // Защита от pump-и: не продаём если цена >3× base — значит товар в пузыре
    // (stuck_price детектор ловил purple_dye на 3200 при base 200). Иначе AI
    // генерировал бы миллионы монет за тик, вытаскивая казну из равновесия
    // (seleukid +54M → +777M в первом прогоне этапа 8).
    const base = Number.isFinite(mkt.base) ? mkt.base : mkt.price;
    if (qty > targetStock * 5 && mkt.price <= base * 3) {
      const sellAmount = Math.floor((qty - targetStock * 3) * 0.1);  // 10% от излишка
      // Max revenue 2000/good/turn — жёсткий cap против unbounded monetary growth
      const cappedRevenue = Math.min(Math.floor(sellAmount * mkt.price * 0.80), 2000);
      if (sellAmount > 0 && cappedRevenue > 0) {
        eco.stockpile[good] = Math.max(0, qty - sellAmount);
        eco.treasury = (eco.treasury || 0) + cappedRevenue;
        if (!eco._income_breakdown) eco._income_breakdown = {};
        eco._income_breakdown.trade_profit = (eco._income_breakdown.trade_profit || 0) + cappedRevenue;
      }
    }
    // import_deficit: <30% target + есть деньги → закупаем
    else if (qty < targetStock * 0.3 && (eco.treasury || 0) > 500) {
      const buyAmount = Math.min(
        Math.floor(targetStock * 0.5),
        Math.floor((eco.treasury * 0.05) / (mkt.price * 1.1))   // не тратим >5% казны за закупку
      );
      if (buyAmount > 0 && (mkt.world_stockpile || mkt.supply || 0) > buyAmount) {
        const cost = Math.floor(buyAmount * mkt.price * 1.10);  // премия 10% за срочность
        eco.stockpile[good] = qty + buyAmount;
        eco.treasury -= cost;
        if (!eco._expense_breakdown) eco._expense_breakdown = {};
        eco._expense_breakdown.buildings = (eco._expense_breakdown.buildings || 0) + cost;  // учёт в breakdown
      }
    }
  }
}

// ── Fallback с OU-вероятностями — полный набор действий ────────────────
export function applyFallbackDecision(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;
  // Stub nations (no regions, no population) have no meaningful AI to run.
  // Skip to avoid 50KB _ou init and 660ms total SuperOU processing for ~634 stubs.
  if (!nation.regions?.length && !nation.population?.total) return;

  // Этап 8 economic3.md — откачен: прямое изменение treasury из AI
  // давало двойной учёт (processTrade уже менял treasury + sell_surplus
  // делал ещё раз), что раздувало казну крупных империй (+827M за 100 ходов).
  // Правильная интеграция требует обмена через existing processTrade
  // pipeline с учётом trade capacity — вне скоупа текущего этапа.
  // Функция sellSurplusAndImportDeficits сохранена для будущего использования.

  // ── SuperOU tick (полный 400-переменный вектор состояния) ──────────────
  let _superOuResult = null;
  if (SuperOU) {
    try {
      _superOuResult = SuperOU.tick(GAME_STATE, nationId);
    } catch (e) {
      console.warn('[super_ou] tick:', e);
    }
  }

  const treasury = nation.economy?.treasury ?? 0;
  const military = nation.military          ?? {};
  const pop      = nation.population        ?? {};
  const gov      = nation.government        ?? {};

  if (!military.at_war_with) military.at_war_with = [];

  const _rec = (action, detail) => {
    if (typeof addMemoryEvent === 'function')
      addMemoryEvent(nationId, 'decision', `${action}${detail ? ': ' + detail : ''}`, [], 'fallback');
    // Шаг 51: регистрируем действие AI-нации для индикаторов на карте.
    // По умолчанию привязываем к столичному региону; для 'build' и
    // 'move_army' — к конкретному из деталей (если удастся распарсить).
    if (action && action !== 'wait' &&
        typeof recordAIAction === 'function') {
      let regionId = (nation.regions && nation.regions[0]) || null;
      if (action === 'build' && typeof detail === 'string') {
        const m = detail.match(/\sв\s+([a-zA-Z0-9_\-]+)/);
        if (m) regionId = m[1];
      } else if (action === 'move_army' && typeof detail === 'string') {
        const m = detail.match(/→\s*([a-zA-Z0-9_\-]+)/);
        if (m) regionId = m[1];
      }
      if (regionId) {
        try {
          recordAIAction({ nationId, action, regionId, detail: detail || '' });
        } catch (_) {}
      }
    }
  };

  const ou = _tickOU(nationId, nation);

  // ── #17 Fallback иерархия — личность влияет на OU-баллы ─────────────
  const personality = nation.ai_personality ?? 'defensive';
  const priority    = nation.ai_priority    ?? 'survival';
  // Модификатор: усиливаем склонности нации в fallback
  const pMod = {
    aggression:    personality === 'aggressive'   ? 1.5 : personality === 'expansionist' ? 1.2 : 1.0,
    economy_focus: personality === 'merchant'     ? 1.5 : priority === 'trade'          ? 1.3 : 1.0,
    diplomacy:     personality === 'diplomatic'   ? 1.5 : 1.0,
    caution:       personality === 'defensive'    ? 1.5 : personality === 'survival'    ? 1.8 : 1.0,
    expansion:     personality === 'expansionist' ? 1.5 : 1.0,
  };
  // Применяем модификаторы к ou
  ou.aggression    = (ou.aggression    ?? 0.5) * pMod.aggression;
  ou.economy_focus = (ou.economy_focus ?? 0.5) * pMod.economy_focus;
  ou.diplomacy     = (ou.diplomacy     ?? 0.5) * pMod.diplomacy;
  ou.caution       = (ou.caution       ?? 0.5) * pMod.caution;
  ou.expansion     = (ou.expansion     ?? 0.5) * pMod.expansion;

  const atWar       = military.at_war_with.length > 0;
  const warCount    = military.at_war_with.length;
  const armyStr     = (military.infantry ?? 0) + (military.cavalry ?? 0) * 3;
  const armyRatio   = armyStr / Math.max(1, pop.total ?? 1);
  const hasArmy     = (GAME_STATE.armies ?? []).some(
    a => a.nation === nationId && a.state !== 'disbanded'
  );
  const happiness   = pop.happiness ?? 50;
  const stability   = gov.stability ?? 50;
  const warExhausted = atWar && armyRatio < 0.01;

  // ── Скоринг ────────────────────────────────────────────────────────
  const scores = {

    recruit:
      ou.aggression * 2.0
      + (armyRatio < 0.01 ? 2.5 : armyRatio < 0.03 ? 0.5 : -1.0)
      + (atWar ? 1.5 : 0)
      // При войне штраф за пустую казну не блокирует рекрут — ополчение всегда возможно
      + (treasury < 800 ? (atWar ? -1 : -5) : treasury > 4000 ? 0.5 : 0),

    raise_army:
      ou.aggression * 1.5 + ou.expansion * 1.0
      // При войне порог ниже (50 вместо 200)
      + (!hasArmy && military.infantry > (atWar ? 50 : 200) ? 3.0 : -4.0)
      + (atWar ? 2.0 : 0),

    recruit_mercs:
      ou.aggression * 1.5
      + (atWar ? 2.0 : -1.0)
      + (treasury > 5000 ? 1.0 : -4.0)
      + ((military.mercenaries ?? 0) > 300 ? -3 : 0),

    declare_war:
      ou.aggression * 3.0 + ou.expansion * 1.5
      + (atWar ? -4.0 : 0)
      + (warExhausted ? -10 : 0)
      + (ou.caution * -2.0)
      + (treasury < 1000 ? -3 : 0)
      + (armyRatio < 0.01 ? -5 : 0),

    seek_peace:
      ou.caution * 3.0
      + (warExhausted ? 4.0 : -2.0)
      + (!atWar ? -10 : 0)
      + (warCount >= 2 ? 2.0 : 0),

    armistice:
      ou.caution * 2.0 + ou.diplomacy * 1.0
      + (atWar && !warExhausted ? 1.0 : -3.0),

    build:
      ou.economy_focus * 3.0
      + (!atWar ? 1.0 : -2.0)
      + (treasury > 2000 ? 1.5 : treasury > 800 ? 0 : -5.0),

    set_taxes:
      ou.economy_focus * 1.5
      + (treasury < 500 ? 2.0 : treasury > 8000 ? 1.5 : 0)
      + (GAME_STATE.turn % 4 === 0 ? 0.5 : -1.0),

    form_alliance:
      ou.diplomacy * 2.5 + ou.caution * 1.0
      + (!atWar ? 1.0 : -3.0)
      + (GAME_STATE.turn % 5 === 0 ? 1.0 : -1.5),

    trade:
      ou.diplomacy * 2.5
      + (!atWar ? 1.0 : -5.0)
      + (treasury > 2000 ? 0.5 : -1.0)
      + (GAME_STATE.turn % 6 === 0 ? 1.0 : -1.5),

    counter_conspiracy:
      (nation.conspiracies?.some(c => c.status === 'detected') ? 4.0 : -10.0)
      + (stability < 40 ? 1.0 : 0),

    move_army:
      ou.aggression * 2.0 + ou.expansion * 1.5
      + (hasArmy && atWar ? 3.0 : -4.0),

    take_loan: (() => {
      if (typeof getLoanCapacity !== 'function') return -10;
      const capacity   = getLoanCapacity(nationId);
      const debtLoad   = typeof getLoanDebtLoad === 'function' ? getLoanDebtLoad(nationId) : 0;
      if (capacity < 500)   return -10; // нет смысла
      if (debtLoad > 0.55)  return -8;  // уже сильно в долгах
      // Привлекательность: нужны деньги прямо сейчас
      return ou.economy_focus * 1.0
        + (treasury < 500  ? 4.0 : treasury < 1500 ? 2.0 : -1.0)
        + (atWar           ? 2.5 : 0)
        + (ou.caution      * -2.0)  // осторожные нации избегают долгов
        + (debtLoad > 0.30 ? -2.0 : 0);
    })(),

    wait:
      -ou.aggression * 0.5 + 0.3,
  };

  // ── SuperOU boost: усиливаем скоры на основе 400-переменного вектора ──
  if (_superOuResult?.actions?.length > 0) {
    for (const { action: ouAction, probability } of _superOuResult.actions) {
      const mapped = _SUPER_OU_ACTION_MAP[ouAction];
      if (mapped && scores[mapped] !== undefined) {
        scores[mapped] += probability * 4.0;
      }
    }
  }

  const action = _weightedPick(_softmax(scores));

  switch (action) {

    case 'recruit': {
      // При войне — экстренная мобилизация даже без казны (ополчение ~0.5% населения)
      const minTreasury = atWar ? 0 : 800;
      if (treasury < minTreasury) { _rec('wait', 'казна мала'); break; }
      const emergencyLevy = atWar && treasury < 800
        ? Math.floor(Math.max(1, pop.total ?? 1) * 0.005)
        : 0;
      const n = Math.max(emergencyLevy, Math.min(
        Math.floor(treasury / 10),
        Math.floor(Math.max(1, pop.total ?? 1) * 0.005)
      ));
      if (n > 0) {
        military.infantry = (military.infantry ?? 0) + n;
        const cost = Math.min(n, Math.floor(treasury / 10)) * (CONFIG.BALANCE?.INFANTRY_UPKEEP ?? 1) * 5;
        nation.economy.treasury = Math.max(0, treasury - cost);
        _rec('recruit', `+${n} пехоты [agg:${ou.aggression.toFixed(2)}]`);
      }
      break;
    }

    case 'raise_army': {
      // При войне порог ниже — нация должна выдвинуть хоть что-то в поле
      const raiseThreshold = atWar ? 50 : 200;
      if (!hasArmy && (military.infantry ?? 0) > raiseThreshold && typeof createArmy === 'function') {
        const homeRegion = nation.regions?.[0];
        if (homeRegion) {
          const troops = Math.floor(military.infantry * 0.6);
          military.infantry -= troops;
          createArmy(nationId, homeRegion, { infantry: troops },
            { name: `Армия ${nation.name ?? nationId}` });
          _rec('raise_army', `${troops} пехоты → поле [exp:${ou.expansion.toFixed(2)}]`);
        }
      } else {
        _rec('wait', 'армия уже в поле');
      }
      break;
    }

    case 'recruit_mercs': {
      if (treasury > 5000 && (military.mercenaries ?? 0) < 300) {
        const m = Math.min(100, Math.floor((treasury - 3000) / 20));
        military.mercenaries = (military.mercenaries ?? 0) + m;
        nation.economy.treasury -= m * (CONFIG.BALANCE?.MERCENARY_UPKEEP ?? 2) * 5;
        _rec('recruit_mercs', `+${m} наёмников [agg:${ou.aggression.toFixed(2)}]`);
      } else {
        _rec('wait', 'наёмники недоступны');
      }
      break;
    }

    case 'declare_war': {
      if (typeof declareWar !== 'function') { _rec('wait', 'declareWar N/A'); break; }
      if (atWar) { _rec('wait', 'уже в войне'); break; }
      if (armyStr < 100) { _rec('wait', 'армия слишком мала'); break; }
      const warTarget = _findWarTarget(nationId, nation);
      if (warTarget) {
        const result = declareWar(nationId, warTarget);
        if (result?.ok !== false) {
          _rec('declare_war', `→ ${GAME_STATE.nations?.[warTarget]?.name ?? warTarget} [agg:${ou.aggression.toFixed(2)}]`);
        } else {
          _rec('wait', result?.reason ?? 'война невозможна');
        }
      } else {
        _rec('wait', 'нет подходящей цели для войны');
      }
      break;
    }

    case 'seek_peace': {
      if (!atWar || typeof concludePeace !== 'function') { _rec('wait', 'нет войны'); break; }
      const enemy = military.at_war_with[0];
      if (!enemy) { _rec('wait', 'враг не найден'); break; }
      concludePeace(nationId, enemy, { loser: null, winner: null, ceded_regions: [] });
      _rec('seek_peace', `мир с ${GAME_STATE.nations?.[enemy]?.name ?? enemy} [cau:${ou.caution.toFixed(2)}]`);
      break;
    }

    case 'armistice': {
      if (!atWar || typeof createTreaty !== 'function') { _rec('wait', 'нет войны'); break; }
      const enemy = military.at_war_with[0];
      if (!enemy) { _rec('wait', 'враг не найден'); break; }
      if (typeof getArmistice === 'function' && getArmistice(nationId, enemy)) {
        _rec('wait', 'перемирие уже есть'); break;
      }
      createTreaty(nationId, enemy, 'armistice', { duration_years: 3 });
      _rec('armistice', `перемирие с ${GAME_STATE.nations?.[enemy]?.name ?? enemy} [dip:${ou.diplomacy.toFixed(2)}]`);
      break;
    }

    case 'build': {
      if (typeof orderBuildingConstruction !== 'function') { _rec('wait', 'build N/A'); break; }
      if (treasury < 800) { _rec('wait', 'казна мала для строительства'); break; }
      const bt = _findBuildTarget(nationId, nation);
      if (bt) {
        const res = orderBuildingConstruction(nationId, bt.regionId, bt.buildingId);
        if (res?.ok !== false) {
          _rec('build', `${bt.buildingId} в ${bt.regionId} [eco:${ou.economy_focus.toFixed(2)}]`);
        } else {
          _rec('wait', res?.reason ?? 'стройка невозможна');
        }
      } else {
        _rec('wait', 'нет свободных стройслотов');
      }
      break;
    }

    case 'set_taxes': {
      if (!nation.economy) { _rec('wait', 'экономика N/A'); break; }
      nation.economy.tax_rates_by_class = nation.economy.tax_rates_by_class ?? {};
      const tr = nation.economy.tax_rates_by_class;
      let label = '';
      if (treasury < 500) {
        tr.commoners   = Math.min(0.30, (tr.commoners   ?? 0.10) + 0.05);
        tr.aristocrats = Math.min(0.20, (tr.aristocrats ?? 0.05) + 0.03);
        label = 'повышение налогов';
      } else if (treasury > 8000) {
        tr.commoners   = Math.max(0.03, (tr.commoners   ?? 0.10) - 0.03);
        tr.aristocrats = Math.max(0.02, (tr.aristocrats ?? 0.05) - 0.02);
        label = 'снижение налогов';
      } else {
        tr.commoners   = tr.commoners   ?? 0.12;
        tr.aristocrats = tr.aristocrats ?? 0.08;
        tr.clergy      = tr.clergy      ?? 0.05;
        tr.soldiers    = tr.soldiers    ?? 0.00;
        label = 'стандартные налоги';
      }
      _rec('set_taxes', `${label} [eco:${ou.economy_focus.toFixed(2)}]`);
      break;
    }

    case 'form_alliance': {
      if (typeof createTreaty !== 'function') { _rec('wait', 'treaty N/A'); break; }
      const partner = _findDiplomacyPartner(nationId, nation, 30, 'defensive_alliance');
      if (partner) {
        createTreaty(nationId, partner, 'defensive_alliance', {});
        _rec('form_alliance', `союз с ${GAME_STATE.nations?.[partner]?.name ?? partner} [dip:${ou.diplomacy.toFixed(2)}]`);
      } else {
        _rec('wait', 'нет партнёра для союза');
      }
      break;
    }

    case 'trade': {
      if (atWar) { _rec('wait', 'война — торговля невозможна'); break; }
      let done = false;
      for (const [otherId, rel] of Object.entries(nation.relations || {})) {
        if (rel.at_war || (rel.treaties ?? []).includes('trade')) continue;
        if (rel.score > -10 && Math.random() < (rel.score + 50) / 200) {
          rel.treaties = rel.treaties || [];
          rel.treaties.push('trade');
          rel.score = Math.min(100, rel.score + 10);
          const other = GAME_STATE.nations[otherId];
          if (other?.relations?.[nationId]) {
            other.relations[nationId].treaties = other.relations[nationId].treaties || [];
            if (!other.relations[nationId].treaties.includes('trade'))
              other.relations[nationId].treaties.push('trade');
            other.relations[nationId].score = Math.min(100, other.relations[nationId].score + 10);
          }
          _rec('trade_deal', `${other?.name ?? otherId} [dip:${ou.diplomacy.toFixed(2)}]`);
          done = true;
          break;
        }
      }
      if (!done) _rec('wait', 'нет партнёров для торговли');
      break;
    }

    case 'counter_conspiracy': {
      const detected = (nation.conspiracies ?? []).find(c => c.status === 'detected');
      if (detected) {
        detected.preparation      = Math.max(0, (detected.preparation ?? 50) - 15);
        detected.conspiracy_stealth = Math.max(5, (detected.conspiracy_stealth ?? 50) - 10);
        if (detected.preparation <= 0) detected.status = 'resolved';
        _rec('counter_conspiracy', `${detected.secret_name ?? detected.id}`);
      } else {
        _rec('wait', 'заговоров не обнаружено');
      }
      break;
    }

    case 'move_army': {
      if (!hasArmy || typeof orderArmyMove !== 'function') { _rec('wait', 'армия N/A'); break; }
      const myArmy = (GAME_STATE.armies ?? []).find(
        a => a.nation === nationId && a.state === 'stationed'
      );
      if (!myArmy) { _rec('wait', 'нет стоячей армии'); break; }
      const enemy = military.at_war_with[0];
      if (!enemy) { _rec('wait', 'нет врага для движения'); break; }
      const enemyNation  = GAME_STATE.nations?.[enemy];
      const enemyRegion  = enemyNation?.regions?.[0];
      if (!enemyRegion) { _rec('wait', 'регион врага не найден'); break; }
      const moved = orderArmyMove(myArmy.id, enemyRegion);
      if (moved) {
        _rec('move_army', `→ ${enemyRegion} (${enemyNation?.name ?? enemy}) [agg:${ou.aggression.toFixed(2)}]`);
      } else {
        _rec('wait', 'путь к врагу недоступен');
      }
      break;
    }

    case 'take_loan': {
      if (typeof takeLoan !== 'function' || typeof getLoanCapacity !== 'function') {
        _rec('wait', 'займы недоступны'); break;
      }
      const capacity = getLoanCapacity(nationId);
      if (capacity < 500) { _rec('wait', 'лимит займа исчерпан'); break; }

      // Определяем нужную сумму: покрыть 6 месяцев расходов или нехватку казны для войны
      const monthlyExpense = nation.economy?.expense_per_turn ?? 0;
      const wantedAmount   = atWar
        ? Math.max(1000, Math.min(capacity, monthlyExpense * 6))
        : Math.max(500,  Math.min(capacity, monthlyExpense * 3));
      const amount = Math.floor(wantedAmount / 500) * 500; // округляем до 500

      // Срок: при войне — короткий (12 мес), в мирное время — стандартный (24 мес)
      const term = atWar ? 12 : 24;

      const result = takeLoan(nationId, amount, term);
      if (result.ok) {
        _rec('take_loan', `+${amount} займ (${term} мес, ${(result.loan.interest_rate * 100).toFixed(1)}%)`);
      } else {
        _rec('wait', `займ отклонён: ${result.reason}`);
      }
      break;
    }

    default:
      _rec('wait', `казна:${Math.round(treasury)} agg:${ou.aggression.toFixed(2)}`);
  }
}


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)

