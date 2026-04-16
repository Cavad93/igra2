// engine/espionage.js — Шпионаж и casus belli (вынесено из turn.js, Этап 47)

// ══════════════════════════════════════════════════════════════════════
// DIP_006: ШПИОНАЖ → ДИПЛОМАТИЧЕСКИЕ ОТНОШЕНИЯ
// ══════════════════════════════════════════════════════════════════════

/**
 * Каждый ход AI-нации с активной шпионской сетью могут проводить
 * разведывательные миссии против враждебных соседей.
 * Если шпион пойман — ухудшение отношений и возможный casus belli.
 */
function _processEspionageTick() {
  if (!GAME_STATE.diplomacy) return;
  const nations      = GAME_STATE.nations || {};
  const playerNation = GAME_STATE.player_nation;
  const nids         = Object.keys(nations);
  const relMap       = GAME_STATE.diplomacy.relations || {};

  /** Прочитать переменную из SuperOU-вектора нации */
  function _ouV(nation, category, varName) {
    const arr = nation._ou?.[category];
    if (!Array.isArray(arr)) return 0;
    const v = arr.find(x => x.name === varName);
    return v ? (v.current ?? 0) : 0;
  }

  // Pre-index hostile pairs to avoid O(N²) inner loop.
  // Iterate over K known relations (K≪N²) and find the two nation IDs per key.
  const hostileMap = {}; // nationId → [hostile targetIds]
  for (const [key, rel] of Object.entries(relMap)) {
    if (!rel || (rel.score >= -10 && !rel.war)) continue;
    // Recover nation IDs from the sorted-join key by trying each '_' split point.
    for (let i = 1; i < key.length; i++) {
      if (key[i] !== '_') continue;
      const a = key.slice(0, i);
      const b = key.slice(i + 1);
      if (nations[a] && nations[b]) {
        (hostileMap[a] = hostileMap[a] || []).push(b);
        (hostileMap[b] = hostileMap[b] || []).push(a);
        break;
      }
    }
  }

  for (const attackerId of nids) {
    const attacker = nations[attackerId];
    if (!attacker || attacker.is_eliminated) continue;
    // Skip attackers with no hostile targets — avoids _ouV cost for the majority
    if (!hostileMap[attackerId]) continue;

    // Шанс запустить миссию за ход: зависит от espionage_capability + spy_network_capacity
    const espCap        = _ouV(attacker, 'diplomacy', 'espionage_capability');
    const spyNet        = _ouV(attacker, 'military',  'spy_network_capacity');
    const missionChance = 0.04 + espCap * 0.10 + spyNet * 0.06; // 4–20%
    if (Math.random() >= missionChance) continue;

    // Выбрать цель только среди известных враждебных наций (O(H) вместо O(N)).
    for (const targetId of hostileMap[attackerId]) {
      if (targetId === attackerId) continue;
      const target = nations[targetId];
      if (!target || target.is_eliminated) continue;

      // Прямая проверка: не вызываем getRelation(), чтобы не создавать записи
      // для нейтральных пар — это предотвращает рост diplomacy.relations до O(N²).
      const _espKey = [attackerId, targetId].sort().join('_');
      const rel = relMap[_espKey];
      if (!rel || (rel.score >= -10 && !rel.war)) continue; // пара недостаточно враждебна
      if (Math.random() > 0.35) continue;          // рандомный выбор цели за ход

      // Шанс поймать: counter_espionage + intelligence_quality цели
      const counterEsp = _ouV(target, 'diplomacy', 'counter_espionage');
      const intelQual  = _ouV(target, 'military',  'intelligence_quality');
      const catchProb  = counterEsp * 0.5 + intelQual * 0.25;

      if (Math.random() >= catchProb) continue; // шпион не пойман — миссия тихо провалена

      // ── Шпион пойман ──────────────────────────────────────────────────────
      const attackerName = attacker.name ?? attackerId;
      const targetName   = target.name   ?? targetId;
      const turn         = GAME_STATE.turn ?? 1;

      // -20 к отношениям
      if (typeof addDiplomacyEvent === 'function') {
        addDiplomacyEvent(attackerId, targetId, -20, 'spy_caught');
      }
      rel.score = Math.max(-100, rel.score - 20);

      // Обновить SuperOU
      if (typeof window !== 'undefined' && window.SuperOU?.onDiplomacyEvent) {
        window.SuperOU.onDiplomacyEvent(targetId,   'INSULT_RECEIVED');
        window.SuperOU.onDiplomacyEvent(attackerId, 'INSULT_RECEIVED');
      }

      // Уведомить стороны (только если игрок вовлечён)
      if (attackerId === playerNation) {
        const msg = `🕵️ Наш шпион в ${targetName} пойман! Отношения: -20.`;
        if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');
        if (typeof window !== 'undefined' && window.UI?.notify) window.UI.notify(msg);
      } else if (targetId === playerNation) {
        const msg = `🕵️ Шпион ${attackerName} пойман в наших землях! Отношения с ${attackerName}: -20.`;
        if (typeof addEventLog === 'function') addEventLog(msg, 'diplomacy');
        if (typeof window !== 'undefined' && window.UI?.notify) window.UI.notify(msg);
      } else {
        console.log(`[DIP_006] Шпион ${attackerName} пойман в ${targetName}.`);
      }

      // ── Casus belli: пойман при подготовке к войне ────────────────────────
      // Признак подготовки: ou.aggression > 0.6 и НЕ в активной войне с этой нацией
      const ouAggression = attacker._ou?.aggression ?? 0;
      if (!rel.war && ouAggression > 0.6) {
        // Записать casus belli в relation — владелец: цель, против: агрессора
        if (!rel.casus_belli) rel.casus_belli = [];
        const alreadyHas = rel.casus_belli.some(
          cb => cb.holder === targetId && cb.reason === 'spy_caught'
        );
        if (!alreadyHas) {
          rel.casus_belli.push({
            holder:  targetId,
            against: attackerId,
            reason:  'spy_caught',
            label:   `Пойман шпион ${attackerName} при подготовке к войне`,
            turn,
            expires: turn + 24, // действует 2 года
          });
        }

        // Дополнительный дипломатический удар
        if (typeof addDiplomacyEvent === 'function') {
          addDiplomacyEvent(attackerId, targetId, -15, 'spy_war_prep_caught');
        }
        rel.score = Math.max(-100, rel.score - 15);

        const cbMsg = (targetId === playerNation)
          ? `⚔️ Casus belli! ${attackerName} готовил войну — шпион пойман. Теперь у вас есть повод для войны.`
          : (attackerId === playerNation)
            ? `⚔️ Наш шпион раскрыт: ${targetName} получает casus belli против нас!`
            : null;
        if (cbMsg) {
          if (typeof addEventLog === 'function') addEventLog(cbMsg, 'danger');
          if (typeof window !== 'undefined' && window.UI?.notify) window.UI.notify(cbMsg);
        } else {
          console.log(`[DIP_006] Casus belli: ${targetName} против ${attackerName}.`);
        }
      }

      break; // только одна поимка за ход на атакующую нацию
    }
  }

  // Очистить просроченные casus belli
  _cleanExpiredCasusBelli();
}

/** Удалить просроченные записи casus belli из всех отношений */
function _cleanExpiredCasusBelli() {
  if (!GAME_STATE.diplomacy?.relations) return;
  const now = GAME_STATE.turn ?? 1;
  for (const rel of Object.values(GAME_STATE.diplomacy.relations)) {
    if (rel.casus_belli?.length) {
      rel.casus_belli = rel.casus_belli.filter(cb => !cb.expires || cb.expires > now);
    }
  }
}

// Экспорт в глобальную область
window._processEspionageTick   = _processEspionageTick;
window._cleanExpiredCasusBelli = _cleanExpiredCasusBelli;
