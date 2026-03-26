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
  const validActions = ['trade', 'build', 'recruit', 'recruit_mercs', 'diplomacy', 'attack', 'fortify', 'wait'];

  if (!parsed || typeof parsed !== 'object') return false;
  if (!validActions.includes(parsed.action)) parsed.action = 'wait';
  if (typeof parsed.reasoning !== 'string') parsed.reasoning = 'Стратегические соображения.';

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

  switch (decision.action) {
    case 'recruit': {
      const amount = Math.floor(nation.economy.treasury * 0.08 / 5);
      if (amount > 100 && nation.economy.treasury > 1000) {
        const cost = amount * 5;
        applyDelta(`nations.${nationId}.military.infantry`, nation.military.infantry + amount);
        applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - cost);
        addEventLog(`${nation.name} набирает ${amount} солдат.`, 'military');
      }
      break;
    }

    case 'trade': {
      if (decision.target && GAME_STATE.nations[decision.target]) {
        const rel = nation.relations[decision.target];
        if (rel && !(rel.treaties ?? []).includes('trade')) {
          rel.treaties = rel.treaties ?? [];
          rel.treaties.push('trade');
          rel.score = Math.min(100, rel.score + 5);
          const targetNation = GAME_STATE.nations[decision.target];
          // Взаимность — добавляем торговлю в обе стороны
          if (targetNation.relations?.[nationId]) {
            const tRel = targetNation.relations[nationId];
            tRel.treaties = tRel.treaties ?? [];
            if (!tRel.treaties.includes('trade')) tRel.treaties.push('trade');
          }
          addEventLog(`${nation.name} заключает торговый договор с ${targetNation.name}.`, 'diplomacy');
        }
      }
      break;
    }

    case 'attack': {
      // AI решил атаковать — делегируем в processAttackAction если доступен
      if (decision.target && typeof processAttackAction === 'function') {
        const targetRegion = GAME_STATE.regions?.[decision.target];
        const defenderNationId = targetRegion?.nation;
        if (defenderNationId && defenderNationId !== nationId) {
          processAttackAction(nationId, defenderNationId, { target_region: decision.target });
        }
      }
      break;
    }

    case 'build': {
      // AI решил строить — ставим в очередь если доступна функция
      if (typeof queueBuilding === 'function') {
        const myRegions = nation.regions ?? [];
        // Найти первый регион со свободным слотом
        for (const rid of myRegions) {
          const r = GAME_STATE.regions?.[rid];
          if (!r) continue;
          const freeSlot = (r.building_slots ?? []).find(s => !s.building_id);
          if (freeSlot) {
            queueBuilding(nationId, rid, 'workshop'); // базовое здание по умолчанию
            break;
          }
        }
      }
      break;
    }

    case 'diplomacy': {
      if (decision.target && nation.relations[decision.target]) {
        nation.relations[decision.target].score = Math.min(
          100,
          nation.relations[decision.target].score + 3,
        );
      }
      break;
    }

    case 'recruit_mercs': {
      const treasury = nation.economy.treasury;
      if (treasury > 5000) {
        const mercs = Math.min(200, Math.floor((treasury - 3000) / 20));
        if (mercs > 0) {
          nation.military.mercenaries = (nation.military.mercenaries ?? 0) + mercs;
          nation.economy.treasury -= mercs * 20;
          addEventLog(`${nation.name} нанимает ${mercs} наёмников.`, 'military');
        }
      }
      break;
    }

    case 'fortify': {
      // Укрепление — повышает мораль
      const newMorale = Math.min(100, nation.military.morale + 2);
      applyDelta(`nations.${nationId}.military.morale`, newMorale);
      break;
    }

    case 'wait':
    default:
      // Ничего не делаем
      break;
  }
}
