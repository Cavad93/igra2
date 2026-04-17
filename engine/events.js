// engine/events.js — Случайные события (вынесено из turn.js, этап 51)

import { MAP_REGIONS } from '../data/map.js';

export const RANDOM_EVENTS = [
  {
    id: 'PLAGUE',
    name: 'Чума',
    description: 'Болезнь охватила город. Население сокращается.',
    probability: 0.15,
    choices: [
      { label: 'Карантин',     desc: 'Изолировать заражённые кварталы. Потери меньше, но казна страдает.',
        effect: (n) => { const d = Math.floor(n.population.total * 0.008); n.population.total -= d; n.economy.treasury -= 500; n.population.happiness = Math.max(0, n.population.happiness - 5); addEventLog(`Карантин введён. Погибло ${d} чел. Казна −500.`, 'warning'); } },
      { label: 'Молебны',      desc: 'Обратиться к богам. Дёшево, но помогает мало.',
        effect: (n) => { const d = Math.floor(n.population.total * 0.015); n.population.total -= d; n.population.happiness = Math.max(0, n.population.happiness - 7); addEventLog(`Жрецы молились. Погибло ${d} чел.`, 'warning'); } },
    ],
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const deaths = Math.floor(nation.population.total * 0.02);
      applyDelta(`nations.${nationId}.population.total`, nation.population.total - deaths);
      applyDelta(`nations.${nationId}.population.happiness`, Math.max(0, nation.population.happiness - 10));
      addEventLog(`${nation.name}: Чума унесла ${deaths} жизней!`, 'danger');
    },
  },
  {
    id: 'GOOD_HARVEST',
    name: 'Богатый урожай',
    description: 'Небывалый урожай. Запасы зерна пополнены.',
    probability: 0.25,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const bonus = Math.floor(nation.population.total * 0.5);
      nation.economy.stockpile.wheat = (nation.economy.stockpile.wheat || 0) + bonus;
      applyDelta(`nations.${nationId}.population.happiness`, Math.min(100, nation.population.happiness + 5));
      addEventLog(`${nation.name}: Богатый урожай! +${bonus} бушелей пшеницы.`, 'good');
    },
  },
  {
    id: 'PIRATE_RAID',
    name: 'Пиратский набег',
    description: 'Пираты атаковали торговые суда.',
    probability: 0.20,
    choices: [
      { label: 'Отправить флот',  desc: 'Преследовать пиратов. Риск потерь, но можно вернуть часть добычи.',
        effect: (n) => { const loss = Math.floor(n.economy.treasury * 0.02); n.economy.treasury -= loss; addEventLog(`Флот отогнал пиратов. Потери: ${loss} монет.`, 'warning'); } },
      { label: 'Откупиться',      desc: 'Заплатить выкуп. Дороже, но надёжнее.',
        effect: (n) => { const loss = Math.floor(n.economy.treasury * 0.07); n.economy.treasury -= loss; addEventLog(`Пираты получили откуп ${loss} монет и ушли.`, 'warning'); } },
    ],
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const loss = Math.floor(nation.economy.treasury * 0.05);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury - loss);
      addEventLog(`${nation.name}: Пираты разграбили торговые суда! Потеряно ${loss} монет.`, 'warning');
    },
  },
  {
    id: 'MERCHANT_WINDFALL',
    name: 'Удачная сделка',
    description: 'Купцы заключили выгодный торговый договор.',
    probability: 0.25,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const gain = Math.floor(nation.economy.treasury * 0.08 + 200);
      applyDelta(`nations.${nationId}.economy.treasury`, nation.economy.treasury + gain);
      addEventLog(`${nation.name}: Удачная торговая сделка! +${gain} монет в казну.`, 'good');
    },
  },
  {
    id: 'EARTHQUAKE',
    name: 'Землетрясение',
    description: 'Землетрясение разрушило часть построек.',
    probability: 0.05,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      if (nation.regions.length > 0) {
        const regionId = nation.regions[Math.floor(Math.random() * nation.regions.length)];
        const region = GAME_STATE.regions[regionId];
        if (region && region.buildings && region.buildings.length > 0) {
          const removed = region.buildings.splice(0, 1)[0];
          addEventLog(`${nation.name}: Землетрясение разрушило ${removed} в ${MAP_REGIONS[regionId]?.name || regionId}!`, 'danger');
        }
      }
      applyDelta(`nations.${nationId}.population.happiness`, Math.max(0, nation.population.happiness - 8));
    },
  },
  {
    id: 'ARMY_DESERTION',
    name: 'Дезертирство',
    description: 'Часть наёмников покинула армию.',
    probability: 0.10,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      if (nation.military.mercenaries > 0) {
        const deserters = Math.floor(nation.military.mercenaries * 0.15);
        applyDelta(`nations.${nationId}.military.mercenaries`, nation.military.mercenaries - deserters);
        addEventLog(`${nation.name}: ${deserters} наёмников дезертировали!`, 'warning');
      }
    },
  },
];

export function triggerRandomEvent() {
  const allNations = Object.keys(GAME_STATE.nations);
  const targetNationId = allNations[Math.floor(Math.random() * allNations.length)];

  const totalWeight = RANDOM_EVENTS.reduce((sum, e) => sum + e.probability, 0);
  let rand = Math.random() * totalWeight;

  for (const event of RANDOM_EVENTS) {
    rand -= event.probability;
    if (rand <= 0) {
      if (targetNationId === GAME_STATE.player_nation && event.choices?.length) {
        _showEventChoiceOverlay(event, targetNationId);
      } else {
        event.effect(targetNationId);
      }
      return;
    }
  }
}

export function _showEventChoiceOverlay(event, nationId) {
  const overlay = document.getElementById('event-choice-overlay');
  if (!overlay) {
    event.effect(nationId);
    return;
  }

  overlay.querySelector('.ec-title').textContent       = event.name;
  overlay.querySelector('.ec-description').textContent = event.description;

  const choicesEl = overlay.querySelector('.ec-choices');
  choicesEl.innerHTML = '';
  for (const choice of event.choices) {
    const btn = document.createElement('button');
    btn.className = 'ec-choice-btn';
    btn.innerHTML = `<strong>${choice.label}</strong><span class="ec-choice-desc">${choice.desc}</span>`;
    btn.onclick = () => {
      const nation = GAME_STATE.nations[nationId];
      choice.effect(nation);
      overlay.style.display = 'none';
      renderAll();
    };
    choicesEl.appendChild(btn);
  }

  overlay.style.display = 'flex';
}


// Backward compat: expose to non-module scripts (ui/, ai/, boot.js)
window.RANDOM_EVENTS = RANDOM_EVENTS;
window._showEventChoiceOverlay = _showEventChoiceOverlay;
window.triggerRandomEvent = triggerRandomEvent;

