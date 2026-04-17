// engine/characters_lifecycle.js — Жизненный цикл персонажей
// Вынесено из engine/turn.js (Этап 46 uisuper.md)

// ──────────────────────────────────────────────────────────────
// ПЕРСОНАЖИ — СТАРЕНИЕ И СМЕРТЬ
// ──────────────────────────────────────────────────────────────

export function agingCharacters() {
  // Раз в год (ход 12, 24, ...) стареем персонажей
  if (GAME_STATE.turn % 12 !== 0) return;

  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    for (const char of (nation.characters || [])) {
      if (!char.alive) continue;
      char.age++;
      // После 55 лет здоровье падает быстрее
      const healthDecline = char.age > 55 ? 8 : 3;
      char.health = Math.max(0, char.health - healthDecline + Math.floor(Math.random() * 5));
    }
  }
}

export function checkCharacterDeaths() {
  for (const [nationId, nation] of Object.entries(GAME_STATE.nations)) {
    for (const char of (nation.characters || [])) {
      if (!char.alive) continue;

      // Здоровье < 10 → персонаж умирает
      if (char.health < 10) {
        char.alive = false;
        addEventLog(`${char.name} скончался в возрасте ${char.age} лет.`, 'character');

        // Синхронизация с Сенатом: если персонаж был сенатором — заменяем призраком
        const mgr = getSenateManager(nationId);
        if (mgr) {
          const senator = mgr.getSenatorByCharacterId(char.id);
          if (senator) {
            mgr.replace_senator(senator, 'death');
            if (nationId === GAME_STATE.player_nation) {
              addEventLog(
                `🏛️ Место ${char.name} в Сенате освободилось. Фракция ${mgr._factionName(senator.faction_id)} ищет преемника.`,
                'character'
              );
            }
          }
        }

        // Если умер правитель → кризис наследования
        const govRuler = GAME_STATE.nations[nationId]?.government?.ruler;
        if (govRuler && (govRuler.character_id === char.id || govRuler.name === char.name)) {
          triggerSuccessionCrisis(nationId);
          // ST_016: notify SuperOU — succession crisis
          if (typeof window !== 'undefined' && window.SuperOU?.onRulerDied) {
            try { window.SuperOU.onRulerDied(nationId, GAME_STATE); } catch (e) { console.warn('[super_ou] onRulerDied:', e); }
          }
          // DIP_005: обновляем брачные союзы после смены правителя
          if (typeof DiplomacyEngine !== 'undefined' && DiplomacyEngine.onRulerDeath) {
            try { DiplomacyEngine.onRulerDeath(nationId); } catch (e) { console.warn('[DIP_005] onRulerDeath:', e); }
          }
        }
      }
    }
  }
}

export function maybeSpawnCharacter() {
  // Каждые 10 ходов 20% шанс нового персонажа для игрока
  if (GAME_STATE.turn % 10 !== 0) return;
  if (Math.random() > 0.2) return;

  const playerNation = GAME_STATE.nations[GAME_STATE.player_nation];
  const currentChars = (playerNation.characters || []).filter(c => c.alive).length;

  // Не больше 12 активных персонажей
  if (currentChars >= 12) return;

  // Запрашиваем генерацию нового персонажа через Claude (асинхронно)
  generateNewCharacter(GAME_STATE.player_nation).catch(console.error);
}


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)
window.agingCharacters = agingCharacters;
window.checkCharacterDeaths = checkCharacterDeaths;
window.maybeSpawnCharacter = maybeSpawnCharacter;

