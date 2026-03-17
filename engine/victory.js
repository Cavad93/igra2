// ══════════════════════════════════════════════════════════════════════
// VICTORY CONDITIONS — условия победы и поражения
// Проверяется каждый ход в конце processTurn().
// ══════════════════════════════════════════════════════════════════════

const VICTORY_CONDITIONS = [
  {
    id: 'hegemony',
    name: 'Гегемония Сицилии',
    desc: 'Контролировать 60% всех регионов на карте.',
    icon: '🗺️',
    check(nation) {
      const total  = Object.values(GAME_STATE.nations).reduce((s, n) => s + n.regions.length, 0);
      return total > 0 && nation.regions.length / total >= 0.60;
    },
  },
  {
    id: 'survival',
    name: 'Вечный город',
    desc: 'Продержаться у власти до 275 г. до н.э.',
    icon: '⏳',
    check() { return GAME_STATE.date.year >= -275; },
  },
  {
    id: 'wealth',
    name: 'Золотой век',
    desc: 'Накопить 300 000 монет в казне.',
    icon: '💰',
    check(nation) { return nation.economy.treasury >= 300000; },
  },
  {
    id: 'legitimacy',
    name: 'Народный кумир',
    desc: 'Держать легитимность выше 90 на протяжении 10 ходов подряд.',
    icon: '👑',
    check(nation, nationId) {
      if (nation.government.legitimacy > 90) {
        nation._legit_streak = (nation._legit_streak ?? 0) + 1;
      } else {
        nation._legit_streak = 0;
      }
      return (nation._legit_streak ?? 0) >= 10;
    },
  },
  {
    id: 'alliance_network',
    name: 'Архитектор мира',
    desc: 'Иметь торговый договор с тремя и более нациями одновременно.',
    icon: '🤝',
    check(nation) {
      const allies = Object.values(nation.relations ?? {})
        .filter(r => (r.treaties ?? []).includes('trade')).length;
      return allies >= 3;
    },
  },
];

// DEFEAT CONDITIONS (кроме переворота, который уже в conspiracy.js)
const DEFEAT_CONDITIONS = [
  {
    id: 'no_regions',
    name: 'Государство пало',
    desc: 'Все регионы потеряны.',
    check(nation) { return nation.regions.length === 0; },
  },
  {
    id: 'collapse',
    name: 'Распад государства',
    desc: 'Стабильность упала до нуля при полном безвластии.',
    check(nation) {
      return (nation.government.stability ?? 50) <= 0
          && (nation.government.legitimacy ?? 50) <= 5;
    },
  },
];

function checkVictoryConditions() {
  if (GAME_STATE._game_ended) return;
  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Победа
  for (const cond of VICTORY_CONDITIONS) {
    if (cond.check(nation, nationId)) {
      _endGame('victory', cond);
      return;
    }
  }

  // Поражение
  for (const cond of DEFEAT_CONDITIONS) {
    if (cond.check(nation, nationId)) {
      _endGame('defeat', cond);
      return;
    }
  }
}

function _endGame(type, cond) {
  if (GAME_STATE._game_ended) return;
  GAME_STATE._game_ended = true;

  const overlay = document.getElementById('endgame-overlay');
  if (!overlay) {
    addEventLog(`${type === 'victory' ? '🏆 ПОБЕДА' : '💀 ПОРАЖЕНИЕ'}: ${cond.name} — ${cond.desc}`, type === 'victory' ? 'good' : 'danger');
    return;
  }

  overlay.className = `endgame-overlay ${type}`;
  overlay.querySelector('.eg-icon').textContent  = type === 'victory' ? cond.icon : '💀';
  overlay.querySelector('.eg-title').textContent = type === 'victory' ? `ПОБЕДА: ${cond.name}` : `ПОРАЖЕНИЕ: ${cond.name}`;
  overlay.querySelector('.eg-desc').textContent  = cond.desc;
  overlay.querySelector('.eg-turn').textContent  = `Ход ${GAME_STATE.turn} · ${Math.abs(GAME_STATE.date.year)} г. до н.э.`;
  overlay.style.display = 'flex';
}
