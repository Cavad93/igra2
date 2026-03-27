// ══════════════════════════════════════════════════════════════════════
// ТАКТИЧЕСКИЙ ИИ КОМАНДУЮЩЕГО — commander_ai.js
//
// Использует Groq Llama 3.3 70B для принятия реальных военных решений:
//   • Анализирует карту в радиусе 3 шагов
//   • Выбирает оптимальную цель (не просто первый регион)
//   • Решает: двигаться / осаждать / штурмовать / отступать / держать
//   • Учитывает силу армии, снабжение, черты командира
//   • Падает на эвристику если Groq недоступен
//
// Паттерн: решение запрашивается async → применяется на СЛЕДУЮЩИЙ ход
// (1-ходовая задержка неощутима в пошаговой игре)
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Кэш: armyId → { turn, decision:{action,target_id,reasoning} }
const _cmdDecisionCache = {};

// Очередь ожидающих ответа: armyId → Promise (in flight)
const _cmdPendingFetch = {};

// Макс. регионов для анализа окружения (ограничиваем контекст Groq)
const _CMD_RADIUS = 3;
const _CMD_MAX_REGIONS = 14;

// ─────────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ
// Возвращает кэшированное решение (от прошлого хода) или null.
// Параллельно запускает fetch на следующий ход.
// ─────────────────────────────────────────────────────────────────────
function getCommanderDecisionNow(army, order) {
  const cached = _cmdDecisionCache[army.id];

  // Если есть свежее решение (с прошлого хода) — отдаём его
  if (cached && cached.turn === GAME_STATE.turn - 1) {
    return cached.decision;
  }
  if (cached && cached.turn === GAME_STATE.turn) {
    return cached.decision;
  }

  // Запускаем fetch для следующего хода (если не летит уже)
  if (!_cmdPendingFetch[army.id]) {
    _cmdPendingFetch[army.id] = _fetchDecision(army, order).then(dec => {
      _cmdDecisionCache[army.id] = { turn: GAME_STATE.turn, decision: dec };
      delete _cmdPendingFetch[army.id];
    }).catch(() => {
      delete _cmdPendingFetch[army.id];
    });
  }

  // На этот ход — fallback эвристика
  return _heuristicDecision(army, order);
}

// ─────────────────────────────────────────────────────────────────────
// GROQ ЗАПРОС
// ─────────────────────────────────────────────────────────────────────
async function _fetchDecision(army, order) {
  if (!CONFIG?.GROQ_API_KEY) return _heuristicDecision(army, order);

  try {
    const ctx    = _buildContext(army, order);
    const system = _buildSystemPrompt();
    const user   = _buildUserPrompt(ctx);

    const text = await callGroq(system, user, 220, CONFIG.MODEL_HAIKU);

    const dec = _parseDecision(text, ctx);
    return dec ?? _heuristicDecision(army, order);
  } catch (e) {
    console.warn('[commander_ai] Groq error:', e.message);
    return _heuristicDecision(army, order);
  }
}

// ─────────────────────────────────────────────────────────────────────
// КОНТЕКСТ — всё что передаём в Groq
// ─────────────────────────────────────────────────────────────────────
function _buildContext(army, order) {
  const nationId = army.nation;
  const char = typeof getArmyCommander === 'function' ? getArmyCommander(army) : null;

  const enemyNations = _enemyNationsOf(nationId);
  const nearby       = _nearbyRegions(army.position, _CMD_RADIUS);

  const strength = typeof calcArmyCombatStrength === 'function'
    ? Math.round(calcArmyCombatStrength(army, 'plains', false)) : 1000;

  const activeSiege = army.siege_id
    ? (GAME_STATE.sieges ?? []).find(s => s.id === army.siege_id) ?? null
    : null;

  const friendlyArmies = (GAME_STATE.armies ?? [])
    .filter(a => a.nation === nationId && a.id !== army.id && a.state !== 'disbanded')
    .slice(0, 4)
    .map(a => ({
      name:     a.name,
      position: a.position,
      posName:  _regionName(a.position),
      state:    a.state,
    }));

  return {
    army, char, nationId, enemyNations,
    nearby, strength, activeSiege, friendlyArmies, order,
  };
}

function _buildSystemPrompt() {
  return `Ты — тактический ИИ военного командующего, Древнее Средиземноморье 300 г. до н.э.
Реши что делать армии этот ход. Отвечай ТОЛЬКО JSON (без markdown):
{"action":"move|siege|storm|retreat|hold","target_id":"rXXX или null","reasoning":"1 предложение по-русски"}

ДЕЙСТВИЯ:
- move: двигаться к региону (target_id из списка соседних)
- siege: продолжать текущую осаду (target_id=null)
- storm: идти на штурм (только если активная осада и progress>=50)
- retreat: отступить в дружественный регион (target_id из соседних)
- hold: стоять на месте, восстанавливать армию (target_id=null)

ПРАВИЛА: target_id ТОЛЬКО из предоставленного списка регионов. null если не нужен.`;
}

function _buildUserPrompt(ctx) {
  const { army, char, enemyNations, nearby, strength, activeSiege, friendlyArmies, order } = ctx;

  const cmdLine = char
    ? `${char.name} (тактика:${char.skills?.tactics ?? char.skills?.military ?? 0} осада:${char.skills?.siege ?? 0} амбиции:${char.traits?.ambition ?? 50} осторожность:${char.traits?.caution ?? 50}) умения:[${(char.commander_skills ?? []).join(',')}]`
    : 'нет';

  const regionLines = Object.values(nearby)
    .map(r => {
      const rel = r.nation === ctx.nationId ? 'свой'
                : enemyNations.includes(r.nation) ? 'ВРАГ'
                : 'нейтр';
      return `  ${r.id} "${r.name}" [${rel}] владелец:${r.nationName} укреп:${r.fortress} гарнизон:${r.garrison} рельеф:${r.terrain}`;
    }).join('\n');

  const siegeLine = activeSiege
    ? `\nАКТ.ОСАДА: ${activeSiege.region_name} прогресс:${Math.round(activeSiege.progress)}% штурм:${activeSiege.storm_possible ? 'ДА' : 'нет'}`
    : '';

  const friendlyLine = friendlyArmies.length
    ? `\nСОЮЗНЫЕ АРМИИ:\n${friendlyArmies.map(a => `  ${a.name} в "${a.posName}" (${a.state})`).join('\n')}`
    : '';

  return `АРМИЯ: ${army.name}
ПОЗИЦИЯ: ${army.position} "${_regionName(army.position)}"
ВОЙСКА: пехота:${Math.round(army.units.infantry)} конница:${Math.round(army.units.cavalry)} наём:${Math.round(army.units.mercenaries)}
СИЛА:${strength} МОРАЛЬ:${Math.round(army.morale)} СНАБЖЕНИЕ:${Math.round(army.supply)} УСТАЛОСТЬ:${Math.round(army.fatigue)}
КОМАНДУЮЩИЙ: ${cmdLine}
ЗАДАЧА: ${order?.target_label ?? 'захватить территорию'}
ВРАГИ: ${enemyNations.join(', ') || 'нет'}${siegeLine}${friendlyLine}

СОСЕДНИЕ РЕГИОНЫ:
${regionLines}`;
}

// ─────────────────────────────────────────────────────────────────────
// ПАРСИНГ ОТВЕТА
// ─────────────────────────────────────────────────────────────────────
function _parseDecision(text, ctx) {
  try {
    const clean = text.replace(/```[\w]*\n?|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s < 0 || e < 0) return null;
    const obj = JSON.parse(clean.slice(s, e + 1));

    const valid = ['move', 'siege', 'storm', 'retreat', 'hold'];
    if (!valid.includes(obj.action)) return null;

    // target_id должен быть в соседних регионах
    if (obj.target_id && !ctx.nearby[obj.target_id]) {
      obj.target_id = null;
    }

    // storm только при активной осаде
    if (obj.action === 'storm' && !ctx.activeSiege) {
      obj.action = 'siege';
      obj.target_id = null;
    }

    return {
      action:    obj.action,
      target_id: obj.target_id ?? null,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning.slice(0, 120) : '',
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// ЭВРИСТИКА — fallback без Groq
// ─────────────────────────────────────────────────────────────────────
function _heuristicDecision(army, order) {
  // Критические условия → отступление
  if (army.supply < 20 || army.morale < 20) {
    const fr = _nearestFriendlyRegion(army);
    if (fr) return { action: 'retreat', target_id: fr, reasoning: 'Критически низкое снабжение или мораль — отступление.' };
    return { action: 'hold', target_id: null, reasoning: 'Держать позицию — восстановить армию.' };
  }

  // Высокая усталость → отдых
  if (army.fatigue > 78) {
    return { action: 'hold', target_id: null, reasoning: 'Армия измотана — необходим отдых.' };
  }

  // Активная осада
  if (army.siege_id) {
    const siege = (GAME_STATE.sieges ?? []).find(s => s.id === army.siege_id);
    if (siege?.storm_possible) return { action: 'storm', target_id: null, reasoning: 'Крепость готова к штурму.' };
    return { action: 'siege', target_id: null, reasoning: 'Продолжать осаду.' };
  }

  // Ищем лучший вражеский регион в радиусе 3
  const enemies   = _enemyNationsOf(army.nation);
  const nearby    = _nearbyRegions(army.position, _CMD_RADIUS);
  const char      = typeof getArmyCommander === 'function' ? getArmyCommander(army) : null;
  const ambition  = char?.traits?.ambition ?? 50;
  const caution   = char?.traits?.caution  ?? 50;

  let bestId = null, bestScore = -Infinity;

  for (const [rid, r] of Object.entries(nearby)) {
    if (rid === army.position) continue;
    if (!enemies.includes(r.nation)) continue;

    // Осторожный командир избегает сильных крепостей
    const fortPenalty = caution > 60 ? r.fortress * 50 : r.fortress * 20;
    // Амбициозный предпочитает крупные города
    const popBonus = ambition > 60 ? r.population / 800 : 0;
    const score = 100 - fortPenalty - (r.garrison / 50) + popBonus;

    if (score > bestScore) { bestScore = score; bestId = rid; }
  }

  if (bestId) {
    const r = nearby[bestId];
    return { action: 'move', target_id: bestId, reasoning: `Атаковать "${r.name}" (${r.nationName}).` };
  }

  // Цель из приказа
  if (order?.target_id) {
    const tNation = GAME_STATE.nations?.[order.target_id];
    const tRegion = tNation?.regions?.[0] ?? (GAME_STATE.regions?.[order.target_id] ? order.target_id : null);
    if (tRegion && tRegion !== army.position) {
      return { action: 'move', target_id: tRegion, reasoning: 'Двигаться к цели приказа.' };
    }
  }

  return { action: 'hold', target_id: null, reasoning: 'Нет ближайших целей — ждать.' };
}

// ─────────────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ
// ─────────────────────────────────────────────────────────────────────
function _enemyNationsOf(nationId) {
  const n = GAME_STATE.nations?.[nationId];
  return n?.military?.at_war_with ?? [];
}

function _nearbyRegions(startId, depth) {
  const result  = {};
  const queue   = [[startId, 0]];
  const visited = new Set([startId]);

  while (queue.length > 0 && Object.keys(result).length < _CMD_MAX_REGIONS) {
    const [rid, d] = queue.shift();
    const gs = GAME_STATE.regions?.[rid];
    const mr = typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[rid] : null;
    const nation = gs?.nation ?? mr?.nation ?? 'neutral';

    result[rid] = {
      id:         rid,
      name:       gs?.name ?? mr?.name ?? rid,
      nation,
      nationName: GAME_STATE.nations?.[nation]?.name ?? nation,
      terrain:    gs?.terrain ?? mr?.terrain ?? 'plains',
      mapType:    gs?.mapType ?? mr?.mapType ?? 'Land',
      fortress:   gs?.fortress_level ?? 0,
      garrison:   gs?.garrison ?? 0,
      population: gs?.population ?? 0,
    };

    if (d < depth) {
      const conns = gs?.connections ?? mr?.connections ?? [];
      for (const next of conns) {
        if (visited.has(next)) continue;
        visited.add(next);
        const nr = GAME_STATE.regions?.[next] ?? MAP_REGIONS?.[next];
        if (nr?.mapType !== 'Ocean') queue.push([next, d + 1]);
      }
    }
  }
  return result;
}

function _nearestFriendlyRegion(army) {
  const nearby = _nearbyRegions(army.position, 4);
  for (const [rid, r] of Object.entries(nearby)) {
    if (rid !== army.position && r.nation === army.nation) return rid;
  }
  return null;
}

function _regionName(regionId) {
  return GAME_STATE.regions?.[regionId]?.name
    ?? (typeof MAP_REGIONS !== 'undefined' ? MAP_REGIONS[regionId]?.name : null)
    ?? regionId;
}
