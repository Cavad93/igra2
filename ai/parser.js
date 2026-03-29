// Парсинг ответов AI в структуры GameState

// ──────────────────────────────────────────────────────────────
// ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА
// ──────────────────────────────────────────────────────────────

function parseAIResponse(rawText) {
  if (!rawText) throw new Error('Пустой ответ от AI');

  // Убираем возможный markdown-фencing (```json ... ```)
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Ищем JSON в ответе (если модель вдруг добавила текст)
  const jsonStart = cleaned.indexOf('{');
  const jsonStartArr = cleaned.indexOf('[');

  // Определяем начало JSON
  let start = -1;
  if (jsonStart !== -1 && jsonStartArr !== -1) {
    start = Math.min(jsonStart, jsonStartArr);
  } else if (jsonStart !== -1) {
    start = jsonStart;
  } else if (jsonStartArr !== -1) {
    start = jsonStartArr;
  }

  if (start > 0) {
    cleaned = cleaned.slice(start);
  }

  // Ищем конец JSON
  const isArray = cleaned.startsWith('[');
  const endChar = isArray ? ']' : '}';
  const lastEnd = cleaned.lastIndexOf(endChar);
  if (lastEnd !== -1) {
    cleaned = cleaned.slice(0, lastEnd + 1);
  }

  // Парсим
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Попытка починить частые проблемы
    const fixed = attemptJSONFix(cleaned);
    if (fixed) return fixed;

    console.error('Не удалось распарсить JSON:', cleaned.slice(0, 200));
    throw new Error(`Неверный JSON от AI: ${e.message}`);
  }
}

// Попытка починить частые проблемы JSON от LLM
function attemptJSONFix(text) {
  try {
    // Убираем trailing commas (часто встречаются)
    let fixed = text.replace(/,\s*([}\]])/g, '$1');
    // Убираем комментарии //
    fixed = fixed.replace(/\/\/[^\n]*/g, '');
    // Убираем комментарии /* */
    fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// ВАЛИДАЦИЯ ОТВЕТОВ
// ──────────────────────────────────────────────────────────────

function validateCommandParse(parsed) {
  const validTypes = ['law', 'military', 'diplomacy', 'economy', 'character', 'build'];

  if (!parsed || typeof parsed !== 'object') return false;
  if (!validTypes.includes(parsed.action_type)) {
    parsed.action_type = 'economy';  // fallback
  }
  if (!parsed.parsed_action) parsed.parsed_action = {};
  if (typeof parsed.requires_vote !== 'boolean') parsed.requires_vote = false;
  if (!parsed.estimated_effects) parsed.estimated_effects = {};
  if (typeof parsed.radicalism_score !== 'number') parsed.radicalism_score = 0;

  // Ограничиваем radicalism_score диапазоном
  parsed.radicalism_score = Math.max(0, Math.min(100, parsed.radicalism_score));

  return true;
}

function validateCharacterReaction(parsed) {
  const validPositions = ['strongly_for', 'for', 'neutral', 'against', 'strongly_against'];

  if (!parsed || typeof parsed !== 'object') return false;
  if (!validPositions.includes(parsed.position)) parsed.position = 'neutral';
  if (typeof parsed.speech !== 'string') parsed.speech = 'Без комментариев.';
  if (typeof parsed.loyalty_delta !== 'number') parsed.loyalty_delta = 0;
  parsed.loyalty_delta = Math.max(-30, Math.min(30, parsed.loyalty_delta));

  return true;
}

function validateNationDecision(parsed) {
  const validActions = [
    'trade', 'build', 'recruit', 'recruit_mercs', 'diplomacy',
    'attack', 'fortify', 'wait',
    'declare_war', 'seek_peace', 'armistice',
    'set_taxes', 'move_army', 'form_alliance',
  ];

  if (!parsed || typeof parsed !== 'object') return false;
  if (!validActions.includes(parsed.action)) parsed.action = 'wait';
  if (typeof parsed.reasoning !== 'string') parsed.reasoning = 'Стратегические соображения.';

  // Нормализовать налоговые ставки в допустимый диапазон
  if (parsed.tax_commoners   != null) parsed.tax_commoners   = Math.max(0, Math.min(0.30, Number(parsed.tax_commoners)   || 0.12));
  if (parsed.tax_aristocrats != null) parsed.tax_aristocrats = Math.max(0, Math.min(0.20, Number(parsed.tax_aristocrats) || 0.08));
  if (parsed.tax_clergy      != null) parsed.tax_clergy      = Math.max(0, Math.min(0.20, Number(parsed.tax_clergy)      || 0.05));

  // Допустимые тактики
  const validTactics = ['aggressive', 'defensive', 'standard', 'flanking'];
  if (parsed.tactic && !validTactics.includes(parsed.tactic)) parsed.tactic = 'standard';

  return true;
}

function validateCharacters(parsed) {
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(char => {
    if (!char || typeof char !== 'object') return false;
    if (!char.name || !char.role) return false;

    // Убеждаемся, что все поля traits — числа в диапазоне
    const traits = char.traits || {};
    for (const key of ['ambition', 'caution', 'loyalty', 'piety', 'cruelty', 'greed']) {
      traits[key] = Math.max(0, Math.min(100, Number(traits[key]) || 50));
    }
    char.traits = traits;

    // Базовые поля
    char.alive = true;
    char.health = Math.max(50, Math.min(100, Number(char.health) || 80));
    char.age = Math.max(20, Math.min(80, Number(char.age) || 40));
    char.wants = Array.isArray(char.wants) ? char.wants : [];
    char.fears = Array.isArray(char.fears) ? char.fears : [];
    char.relations = char.relations || {};
    char.history = Array.isArray(char.history) ? char.history : [];
    char.resources = char.resources || { gold: 1000, land: 0, followers: 50, army_command: 0 };

    // Генерируем уникальный ID если нет
    if (!char.id) {
      char.id = `CHAR_${String(Math.floor(Math.random() * 9000) + 1000)}`;
    }

    return true;
  });
}

// ──────────────────────────────────────────────────────────────
// ПРИМЕНЕНИЕ AI РЕШЕНИЯ НАЦИИ К GAMESTATE
// ──────────────────────────────────────────────────────────────

function applyNationDecision(nationId, decision) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const _log = (msg, type = 'info') => { if (typeof addEventLog === 'function') addEventLog(msg, type); };
  const _name = (id) => GAME_STATE.nations?.[id]?.name ?? id;

  switch (decision.action) {

    case 'recruit': {
      const treasury = nation.economy?.treasury ?? 0;
      if (treasury < 1000) break;
      const amount = Math.min(
        Math.floor(treasury * 0.08 / 5),
        Math.floor((nation.population?.total ?? 10000) * 0.004),
        2000,
      );
      if (amount > 50) {
        const cost = amount * 5;
        nation.military.infantry = (nation.military.infantry ?? 0) + amount;
        nation.economy.treasury  -= cost;
        _log(`${nation.name} набирает ${amount} солдат.`, 'military');
      }
      break;
    }

    case 'recruit_mercs': {
      const treasury = nation.economy?.treasury ?? 0;
      if (treasury > 5000) {
        const mercs = Math.min(200, Math.floor((treasury - 3000) / 20));
        if (mercs > 0) {
          nation.military.mercenaries = (nation.military.mercenaries ?? 0) + mercs;
          nation.economy.treasury -= mercs * 20;
          _log(`${nation.name} нанимает ${mercs} наёмников.`, 'military');
        }
      }
      break;
    }

    case 'fortify': {
      if (nation.military) {
        nation.military.morale = Math.min(100, (nation.military.morale ?? 50) + 2);
      }
      break;
    }

    case 'trade': {
      if (!decision.target || !GAME_STATE.nations[decision.target]) break;
      const rel = nation.relations?.[decision.target];
      if (!rel || (rel.treaties ?? []).includes('trade') || rel.at_war) break;
      if (typeof createTreaty === 'function') {
        createTreaty(nationId, decision.target, 'trade_agreement', {});
      } else {
        rel.treaties = rel.treaties ?? [];
        rel.treaties.push('trade');
        rel.score = Math.min(100, rel.score + 5);
        const tRel = GAME_STATE.nations[decision.target]?.relations?.[nationId];
        if (tRel) { tRel.treaties = tRel.treaties ?? []; if (!tRel.treaties.includes('trade')) tRel.treaties.push('trade'); }
      }
      _log(`${nation.name} заключает торговый договор с ${_name(decision.target)}.`, 'diplomacy');
      break;
    }

    case 'diplomacy': {
      // Улучшить отношения с целью
      if (decision.target && nation.relations?.[decision.target]) {
        nation.relations[decision.target].score = Math.min(100, nation.relations[decision.target].score + 5);
        const tRel = GAME_STATE.nations[decision.target]?.relations?.[nationId];
        if (tRel) tRel.score = Math.min(100, tRel.score + 3);
      }
      break;
    }

    case 'form_alliance': {
      if (!decision.target || typeof createTreaty !== 'function') break;
      const rel = nation.relations?.[decision.target];
      if (!rel || rel.at_war) break;
      if ((rel.treaties ?? []).some(t => ['defensive_alliance','military_alliance'].includes(t))) break;
      createTreaty(nationId, decision.target, 'defensive_alliance', {});
      _log(`${nation.name} заключает союз с ${_name(decision.target)}.`, 'diplomacy');
      break;
    }

    case 'attack': {
      if (!decision.target) break;
      // Выставить тактику армии если указана
      if (decision.tactic) {
        const army = decision.army_id
          ? (GAME_STATE.armies ?? []).find(a => a.id === decision.army_id && a.nation === nationId)
          : (GAME_STATE.armies ?? []).find(a => a.nation === nationId && a.state !== 'disbanded');
        if (army) army.formation = decision.tactic;
      }
      // Двинуть армию к цели
      if (typeof orderArmyMove === 'function') {
        const armyId = decision.army_id
          ?? (GAME_STATE.armies ?? []).find(a => a.nation === nationId && a.state === 'stationed')?.id;
        if (armyId) orderArmyMove(armyId, decision.target);
      }
      // Инициировать атаку если processAttackAction доступен
      if (typeof processAttackAction === 'function') {
        const targetRegion = GAME_STATE.regions?.[decision.target];
        const defenderId   = targetRegion?.nation;
        if (defenderId && defenderId !== nationId) {
          processAttackAction(nationId, defenderId, { target_region: decision.target });
        }
      }
      break;
    }

    case 'declare_war': {
      if (!decision.target || typeof declareWar !== 'function') break;
      if ((nation.military?.at_war_with ?? []).length >= 3) break; // не больше 3 войн
      const result = declareWar(nationId, decision.target);
      if (result?.ok !== false) {
        _log(`${nation.name} объявляет войну ${_name(decision.target)}!`, 'military');
      }
      break;
    }

    case 'seek_peace': {
      if (typeof concludePeace !== 'function') break;
      const enemy = decision.target ?? (nation.military?.at_war_with ?? [])[0];
      if (!enemy) break;
      concludePeace(nationId, enemy, { loser: null, winner: null, ceded_regions: [] });
      _log(`${nation.name} заключает мир с ${_name(enemy)}.`, 'diplomacy');
      break;
    }

    case 'armistice': {
      if (typeof createTreaty !== 'function') break;
      const enemy = decision.target ?? (nation.military?.at_war_with ?? [])[0];
      if (!enemy) break;
      if (typeof getArmistice === 'function' && getArmistice(nationId, enemy)) break;
      createTreaty(nationId, enemy, 'armistice', { duration_years: 3 });
      _log(`${nation.name} заключает перемирие с ${_name(enemy)}.`, 'diplomacy');
      break;
    }

    case 'build': {
      const buildingId = decision.building ?? 'granary';
      const regionId   = decision.region   ?? (nation.regions ?? [])[0];
      if (!regionId) break;
      if (typeof orderBuildingConstruction === 'function') {
        const res = orderBuildingConstruction(nationId, regionId, buildingId);
        if (res?.ok !== false) {
          _log(`${nation.name} строит ${buildingId} в регионе ${regionId}.`, 'economy');
        }
      }
      break;
    }

    case 'set_taxes': {
      if (!nation.economy) break;
      nation.economy.tax_rates_by_class = nation.economy.tax_rates_by_class ?? {};
      const tr = nation.economy.tax_rates_by_class;
      if (decision.tax_commoners   != null) tr.commoners   = decision.tax_commoners;
      if (decision.tax_aristocrats != null) tr.aristocrats = decision.tax_aristocrats;
      if (decision.tax_clergy      != null) tr.clergy      = decision.tax_clergy;
      _log(`${nation.name} изменяет налоги: общ.${Math.round((tr.commoners ?? 0) * 100)}% знать.${Math.round((tr.aristocrats ?? 0) * 100)}%.`, 'economy');
      break;
    }

    case 'move_army': {
      if (!decision.target || typeof orderArmyMove !== 'function') break;
      const armyId = decision.army_id
        ?? (GAME_STATE.armies ?? []).find(a => a.nation === nationId && a.state === 'stationed')?.id;
      if (!armyId) break;
      if (decision.tactic) {
        const army = (GAME_STATE.armies ?? []).find(a => a.id === armyId);
        if (army) army.formation = decision.tactic;
      }
      const moved = orderArmyMove(armyId, decision.target);
      if (moved) _log(`${nation.name}: армия движется к ${decision.target}.`, 'military');
      break;
    }

    case 'wait':
    default:
      break;
  }
}
