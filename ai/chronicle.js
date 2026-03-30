/**
 * chronicle.js — Система Хронист
 * Каждые 50 ходов анализирует мир и генерирует живые события через Sonnet.
 */

// ── Вспомогательные функции ───────────────────────────────────────────────────

function _detectEra(year) {
  if (year > -280) return 'hellenistic';
  if (year > -220) return 'punic_wars';
  if (year > -130) return 'roman_expansion';
  if (year > -27)  return 'late_republic';
  if (year > 200)  return 'imperial';
  return 'late_empire';
}

function _getVal(ou, cat, name) {
  return ou?.[cat]?.find?.(v => v.name === name)?.current ?? 0;
}

function _armySize(nation) {
  const m = nation.military ?? {};
  return (m.infantry ?? 0) + (m.cavalry ?? 0) + (m.archers ?? 0);
}

function _playerReputation(playerNation, nations) {
  if (!playerNation?._ou) return 'ignored';
  const fear = _getVal(playerNation._ou, 'diplomacy', 'military_deterrence');
  const rep  = _getVal(playerNation._ou, 'diplomacy', 'global_reputation');
  const resentments = Object.values(nations)
    .filter(n => n.id !== playerNation.id)
    .reduce((sum, n) => sum + (n._player_relation?.resentment ?? 0), 0);
  if (fear > 0.6 || resentments > 2) return 'feared';
  if (rep > 0.55) return 'respected';
  if (resentments > 1) return 'hated';
  return 'ignored';
}

// ── Основной объект ───────────────────────────────────────────────────────────

export const ChronicleSystem = {
  INTERVAL:      50,
  MAX_EVENTS:    5,
  MAX_TOKENS:    600,
  EFFECT_RADIUS: 6,

  collectSnapshot(gameState) {
    const nations  = gameState.nations ?? {};
    const natList  = Object.values(nations);
    const turn     = gameState.turn ?? 0;
    const year     = gameState.date?.year ?? -301;
    const playerId = gameState.player_nation;
    const player   = nations[playerId] ?? natList[0];

    // Топ нации по регионам
    const byRegions = [...natList].sort((a,b) =>
      (b.regions?.length ?? 0) - (a.regions?.length ?? 0));
    const strongest = byRegions[0] ?? player;
    const weakest   = byRegions[byRegions.length - 1] ?? player;
    const richest   = [...natList].sort((a,b) =>
      (b.economy?.treasury ?? 0) - (a.economy?.treasury ?? 0))[0] ?? player;

    // Войны (парный список без дублей)
    const warPairs = new Map();
    for (const n of natList) {
      for (const enemyId of (n.military?.at_war_with ?? [])) {
        const key = [n.id, enemyId].sort().join('|');
        if (!warPairs.has(key)) {
          const dur = (turn - (n._war_start?.[enemyId] ?? turn - 1));
          warPairs.set(key, { attacker: n.name ?? n.id, defender: nations[enemyId]?.name ?? enemyId, duration_turns: Math.max(1, dur) });
        }
      }
    }
    const active_wars = [...warPairs.values()].slice(0, 5);

    // Недавние завоевания (из events_log)
    const recent_conquests = (gameState.events_log ?? [])
      .filter(e => e?.type === 'conquest' && (turn - (e.turn ?? 0)) <= 50)
      .slice(-5)
      .map(e => ({ winner: e.winner ?? '?', loser: e.loser ?? '?', region: e.region ?? '?' }));

    // Кризисы из Super-OU
    const crisis_nations = natList
      .filter(n => n._ou)
      .map(n => {
        const ou = n._ou;
        const regStab  = _getVal(ou, 'politics', 'regime_stability');
        const foodSec  = _getVal(ou, 'economy',  'food_security');
        const treasury = _getVal(ou, 'economy',  'gold_reserves');
        let crisis_type = null;
        let severity = 0;
        if (regStab < 0.3)  { crisis_type = 'political_crisis'; severity = Math.round((0.3 - regStab) * 200); }
        if (foodSec < 0.25) { crisis_type = 'famine';           severity = Math.max(severity, Math.round((0.25 - foodSec) * 200)); }
        if (treasury < 0.1) { crisis_type = 'bankruptcy';       severity = Math.max(severity, Math.round((0.1 - treasury) * 500)); }
        return severity > 60 ? { name: n.name ?? n.id, crisis_type, severity } : null;
      })
      .filter(Boolean);

    // Торговля, голод, банкротства
    let total_trade_routes = 0;
    const famines_active    = [];
    const bankruptcies_recent = [];
    for (const n of natList) {
      total_trade_routes += (n.economy?.trade_routes?.length ?? 0);
      if (n._ou && _getVal(n._ou, 'economy', 'food_security') < 0.2) famines_active.push(n.name ?? n.id);
      if ((n.economy?.treasury ?? 0) < 0) bankruptcies_recent.push(n.name ?? n.id);
    }

    // Крупнейшая коалиция против игрока
    const coalition_members = natList
      .filter(n => n.id !== playerId && (n.military?.at_war_with ?? []).includes(playerId))
      .map(n => n.name ?? n.id);
    const largest_coalition = { members: coalition_members, target: coalition_members.length ? (player?.name ?? playerId) : null };

    const totalRegions = natList.reduce((s, n) => s + (n.regions?.length ?? 0), 0) || 1;

    return {
      year, turn,
      strongest_nation: { name: strongest.name ?? strongest.id, regions: strongest.regions?.length ?? 0, army: _armySize(strongest) },
      weakest_nation:   { name: weakest.name   ?? weakest.id,   regions: weakest.regions?.length   ?? 0, army: _armySize(weakest) },
      richest_nation:   { name: richest.name   ?? richest.id,   treasury: richest.economy?.treasury ?? 0 },
      player:           { name: player?.name   ?? playerId,     regions: player?.regions?.length ?? 0, army: _armySize(player ?? {}), treasury: player?.economy?.treasury ?? 0 },
      active_wars,
      recent_conquests,
      crisis_nations,
      total_trade_routes,
      famines_active,
      bankruptcies_recent,
      largest_coalition,
      player_share_regions: (player?.regions?.length ?? 0) / totalRegions,
      player_at_war:     (player?.military?.at_war_with?.length ?? 0) > 0,
      player_reputation: _playerReputation(player, nations),
      era: _detectEra(year),
    };
  },

  buildPrompt(snapshot) {
    const s = snapshot;
    const ERA_NAMES = {
      hellenistic:    'Эллинистический период',
      punic_wars:     'Эпоха Пунических войн',
      roman_expansion:'Римская экспансия',
      late_republic:  'Поздняя республика',
      imperial:       'Имперский период',
      late_empire:    'Поздняя империя',
    };
    const eraName = ERA_NAMES[s.era] ?? s.era;
    const yearStr = s.year < 0 ? `${Math.abs(s.year)} г. до н.э.` : `${s.year} г. н.э.`;

    const system = `Ты — хронист античного мира. Наблюдаешь за событиями Средиземноморья \
и описываешь их как историк той эпохи — в стиле Фукидида или Полибия. \
Пиши от третьего лица. Язык — торжественный, но понятный. \
Игровой год: ${yearStr} (${eraName}). \
Отвечай ТОЛЬКО валидным JSON без текста вне JSON.`;

    const wars = s.active_wars.length
      ? s.active_wars.map(w => `${w.attacker} против ${w.defender} (${w.duration_turns} ходов)`).join('\n')
      : 'нет';
    const crises = s.crisis_nations.length
      ? s.crisis_nations.map(c => `${c.name}: ${c.crisis_type}`).join('\n')
      : 'нет';
    const conquests = s.recent_conquests.length
      ? s.recent_conquests.map(c => `${c.winner} захватил у ${c.loser}: ${c.region}`).join('\n')
      : 'нет';
    const coalition = s.largest_coalition.members.length
      ? `${s.largest_coalition.members.join('+')} против ${s.largest_coalition.target}`
      : 'нет';

    const user = `СОСТОЯНИЕ МИРА (ход ${s.turn}):

Сильнейшая держава: ${s.strongest_nation.name} (${s.strongest_nation.regions} регионов, армия ${s.strongest_nation.army})
Игрок (${s.player.name}): ${s.player.regions} регионов, казна ${s.player.treasury}
Доля мира: ${(s.player_share_regions * 100).toFixed(1)}%

Активные войны (${s.active_wars.length}):
${wars}

Кризисы:
${crises}

Недавние завоевания:
${conquests}

Голод: ${s.famines_active.join(', ') || 'нет'}
Банкротства: ${s.bankruptcies_recent.join(', ') || 'нет'}
Крупнейшая коалиция: ${coalition}

Сгенерируй 3-5 хроникальных событий. Каждое событие:
- основано на реальных данных выше
- написано как запись хрониста той эпохи
- может иметь игровой эффект или быть чисто нарративным

JSON формат:
{
  "chronicle_title": "Хроники ${eraName}, год ${yearStr}",
  "events": [
    {
      "id": "evt_001",
      "title": "Краткий заголовок",
      "text": "2-3 предложения в стиле хрониста",
      "type": "political",
      "affected_nations": ["nation_id1"],
      "effect": null
    }
  ]
}

Типы: political, military, economic, natural, cultural
Для effect используй: { "variable": "имя_переменной", "delta": число, "duration": ходов, "radius_hops": 0-6 }`;

    return { system, user };
  },
  parseEvents(raw /*, gameState unused for now */) {
    if (!raw) return null;
    try {
      // Извлечь JSON — убираем markdown-обёртку
      let s = raw;
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) s = fence[1];
      const start = s.indexOf('{');
      const end   = s.lastIndexOf('}');
      if (start === -1 || end <= start) return null;
      let jsonStr = s.slice(start, end + 1);
      // Убрать хвостовые запятые
      jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(jsonStr);
      // Валидация
      if (!Array.isArray(parsed.events)) return null;
      parsed.events = parsed.events.filter(e => e?.id && e?.title && e?.text);
      if (!parsed.events.length) return null;
      return parsed;
    } catch (e) {
      console.warn('[Chronicle] parseEvents ошибка:', e.message);
      return null;
    }
  },

  applyEffects(events, gameState) {
    if (!events?.length) return;
    const nations  = gameState?.nations ?? {};
    const natList  = Object.values(nations);

    // Ищем функцию onDiplomacyEvent в super_ou (браузер) или game state
    const _applyOU = (typeof window !== 'undefined' && window.SuperOU?.onDiplomacyEvent)
      ? window.SuperOU.onDiplomacyEvent.bind(window.SuperOU)
      : null;
    if (!_applyOU) {
      console.warn('[Chronicle] SuperOU.onDiplomacyEvent недоступен');
      return;
    }

    for (const evt of events) {
      if (!evt.effect) continue;
      const { variable, delta, duration = 20, radius_hops = 0 } = evt.effect;
      if (!variable || typeof delta !== 'number') continue;

      // Базовые нации
      const targets = new Set(
        (evt.affected_nations ?? [])
          .map(id => nations[id])
          .filter(Boolean)
      );

      // Расширить по радиусу (берём случайных соседей из all nations)
      if (radius_hops > 0 && targets.size < natList.length) {
        const extra = natList
          .filter(n => !targets.has(n))
          .slice(0, radius_hops);
        extra.forEach(n => targets.add(n));
      }

      for (const nation of targets) {
        _applyOU(nation, 'CHRONICLE_EVENT', { variable, delta, duration, gameState });
        console.log(`[Chronicle] Применён эффект ${variable}${delta>0?'+':''}${delta} → ${nation.name ?? nation.id} (${duration} ходов)`);
      }
    }
  },
  async generate(gameState) {
    // 1. Сбор данных
    const snapshot = this.collectSnapshot(gameState);

    // 2. Формирование промпта
    const { system, user } = this.buildPrompt(snapshot);

    // 3. Вызов Sonnet
    let raw;
    try {
      // callClaude — глобальная функция из ai/claude.js
      const callFn = (typeof callClaude !== 'undefined' && callClaude)
        ?? (typeof window !== 'undefined' && window.callClaude);
      if (!callFn) throw new Error('callClaude недоступен');

      const MODEL_SONNET = (typeof CONFIG !== 'undefined' && CONFIG.MODEL_SONNET)
        ?? (typeof window !== 'undefined' && window.CONFIG?.MODEL_SONNET)
        ?? 'claude-sonnet-4-6';

      raw = await callFn(system, user, this.MAX_TOKENS, MODEL_SONNET);
    } catch (e) {
      console.warn('[Chronicle] Sonnet недоступен:', e.message);
      return [];
    }

    // 4. Парсинг
    const parsed = this.parseEvents(raw, gameState);
    if (!parsed) return [];

    // 5. Применить эффекты
    this.applyEffects(parsed.events ?? [], gameState);

    // 6. Отобразить в event log
    const _log = (typeof addEventLog !== 'undefined' && addEventLog)
      ?? (typeof window !== 'undefined' && window.addEventLog)
      ?? console.log;
    _log(`━━━ ${parsed.chronicle_title ?? 'Хроники'} ━━━`);
    const ICONS = { political:'🏛', military:'⚔️', economic:'💰', natural:'🌿', cultural:'📜' };
    for (const evt of (parsed.events ?? [])) {
      const icon = ICONS[evt.type] ?? '📖';
      _log(`${icon} ${evt.title}: ${evt.text}`);
    }

    // 7. Сохранить в gameState
    gameState._chronicles = gameState._chronicles ?? [];
    gameState._chronicles.push({ turn: gameState.turn, ...parsed });
    if (gameState._chronicles.length > 20) gameState._chronicles.shift();

    return parsed.events ?? [];
  },
};

export default ChronicleSystem;

if (typeof window !== 'undefined') {
  window.ChronicleSystem = ChronicleSystem;
}
