// ══════════════════════════════════════════════════════════════════════
// CHARACTER AUTONOMY ENGINE — персонажи сами инициируют события
//
// Каждые 3 хода 1-2 персонажа действуют согласно своим ambition_goal.
// Используем Haiku 4.5 (дёшево): персонаж решает что предпринять
// и формулирует сообщение игроку.
//
// Возможные действия:
//   request_reward   — просит золото/землю/должность за лояльность
//   demand_influence — требует роли в государстве
//   propose_deal     — предлагает взаимовыгодную сделку
//   recruit_allies   — молча вербует сторонников (тихое событие)
//   spread_rumors    — распускает слухи о другом персонаже (тихое)
//   do_nothing       — персонаж ждёт
//
// Игрок видит request_reward / demand_influence / propose_deal
// как входящие инициативы во вкладке "Инициативы" правой панели.
// Остальные — в лог.
// ══════════════════════════════════════════════════════════════════════

async function processCharacterAutonomy(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation || nationId !== GAME_STATE.player_nation) return;
  if (GAME_STATE.turn % 3 !== 0) return;

  const alive = (nation.characters ?? []).filter(c => c.alive && c.ambition_goal);
  if (!alive.length) return;

  // Выбираем 1-2 персонажа случайно (приоритет — высокое честолюбие)
  const sorted = [...alive].sort((a, b) =>
    (b.traits.ambition + (100 - b.traits.loyalty)) - (a.traits.ambition + (100 - a.traits.loyalty))
  );
  const candidates = sorted.slice(0, Math.min(2, sorted.length));
  const char = candidates[Math.floor(Math.random() * candidates.length)];

  // Не инициировать если уже есть ожидающая инициатива от этого персонажа
  const pending = GAME_STATE._pending_char_initiatives ?? [];
  if (pending.some(p => p.charId === char.id)) return;

  const govType    = nation.government?.type ?? 'tyranny';
  const activeLaws = (nation.active_laws ?? []).slice(-3).map(l => l.name).join(', ') || 'нет';
  const treasury   = Math.round(nation.economy?.treasury ?? 0);
  const happiness  = nation.population?.happiness ?? 50;
  const legitimacy = nation.government?.legitimacy ?? 50;

  const systemPrompt =
`Ты — ${char.name}, ${char.role ?? 'советник'} в Сиракузах, 301 до н.э.
Твоя цель: ${String(char.ambition_goal).replace(/_/g,' ')}.
Лояльность к правителю: ${char.traits.loyalty}/100. Честолюбие: ${char.traits.ambition}/100.
Жадность: ${char.traits.greed}/100.

Выбери ОДНО действие этого хода и верни ТОЛЬКО JSON:
{
  "action": "request_reward|demand_influence|propose_deal|recruit_allies|spread_rumors|do_nothing",
  "target_char_name": "имя другого персонажа если recruit_allies/spread_rumors, иначе null",
  "message_to_player": "Что говоришь игроку (1-2 предложения, от первого лица, античный стиль). null если тихое действие.",
  "reward_type": "gold|land|title|null",
  "reward_amount": 500,
  "loyalty_if_ignored": -8
}`;

  const userPrompt =
`Политика: ${govType}, легитимность ${legitimacy}/100.
Казна правителя: ${treasury} монет. Счастье: ${happiness}%.
Последние законы: ${activeLaws}.
Другие персонажи: ${alive.filter(c => c.id !== char.id).map(c => c.name).join(', ')}.`;

  try {
    const raw = await callClaude(systemPrompt, userPrompt, 200, CONFIG.MODEL_HAIKU);
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]);

    switch (parsed.action) {
      case 'do_nothing':
        return;

      // Видимые игроку инициативы → в очередь
      case 'request_reward':
      case 'demand_influence':
      case 'propose_deal':
        if (parsed.message_to_player) {
          if (!GAME_STATE._pending_char_initiatives) GAME_STATE._pending_char_initiatives = [];
          GAME_STATE._pending_char_initiatives.push({
            charId:           char.id,
            charName:         char.name,
            portrait:         char.portrait ?? '👤',
            action:           parsed.action,
            message:          parsed.message_to_player,
            reward_type:      parsed.reward_type  ?? null,
            reward_amount:    parsed.reward_amount ?? 0,
            loyalty_if_ignored: Math.min(0, parsed.loyalty_if_ignored ?? -8),
            turn:             GAME_STATE.turn,
          });
          addEventLog(`📨 ${char.name}: «${parsed.message_to_player}»`, 'character');
          // Показываем бейдж
          _updateInitiativesBadge();
        }
        break;

      // Тихие действия → только лог
      case 'recruit_allies': {
        // Персонаж слегка повышает лояльность ближайшего союзника
        const target = alive.find(c => c.id !== char.id && c.traits.loyalty < char.traits.loyalty);
        if (target) {
          target.traits.loyalty = Math.min(100, target.traits.loyalty + 3);
          addEventLog(`🤫 ${char.name} тихо беседует с ${target.name}. Их связь крепнет.`, 'character');
        }
        break;
      }
      case 'spread_rumors': {
        // Снижает доверие к одному персонажу у игрока
        const targetName = parsed.target_char_name;
        const target = alive.find(c => c.name === targetName && c.id !== char.id);
        if (target) {
          target.traits.loyalty = Math.max(0, target.traits.loyalty - 5);
          addEventLog(`🗣️ Слухи о ${target.name} расползаются по двору. Его репутация страдает.`, 'character');
        }
        break;
      }
    }
  } catch (e) {
    console.warn('[CHARS_AI] autonomy error:', e.message);
  }
}

// Игрок отвечает на инициативу персонажа
function respondToCharInitiative(charId, accept) {
  const nation  = GAME_STATE.nations[GAME_STATE.player_nation];
  const pending = GAME_STATE._pending_char_initiatives ?? [];
  const idx     = pending.findIndex(p => p.charId === charId);
  if (idx === -1) return;

  const initiative = pending[idx];
  pending.splice(idx, 1);

  const char = (nation.characters ?? []).find(c => c.id === charId);
  if (!char) return;

  if (accept) {
    // Удовлетворяем требование
    if (initiative.reward_type === 'gold' && initiative.reward_amount > 0) {
      const cost = Math.min(initiative.reward_amount, nation.economy.treasury);
      nation.economy.treasury -= cost;
      char.resources = char.resources ?? {};
      char.resources.gold = (char.resources.gold ?? 0) + cost;
      addEventLog(`✅ ${char.name} получил ${cost} монет. Лояльность растёт.`, 'good');
    } else {
      addEventLog(`✅ Вы приняли предложение ${char.name}.`, 'good');
    }
    char.traits.loyalty = Math.min(100, char.traits.loyalty + 10);
    (char.history ?? (char.history = [])).push({
      turn: GAME_STATE.turn, event: 'Правитель принял его предложение.',
    });
  } else {
    // Игнорируем/отказываем
    char.traits.loyalty = Math.max(0, char.traits.loyalty + initiative.loyalty_if_ignored);
    addEventLog(`❌ ${char.name} не получил желаемого. Лояльность −${Math.abs(initiative.loyalty_if_ignored)}.`, 'warning');
    (char.history ?? (char.history = [])).push({
      turn: GAME_STATE.turn, event: 'Правитель отверг его просьбу.',
    });
  }

  _updateInitiativesBadge();
  renderRightPanel();
  if (typeof renderCharInitiativesPanel === 'function') renderCharInitiativesPanel();
}

function _updateInitiativesBadge() {
  const count  = (GAME_STATE._pending_char_initiatives ?? []).length;
  const badge  = document.getElementById('char-initiatives-badge');
  if (!badge) return;
  badge.textContent = count > 0 ? count : '';
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}
