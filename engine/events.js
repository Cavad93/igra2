// engine/events.js — Случайные события (вынесено из turn.js, этап 51)

import { MAP_REGIONS } from '../data/map.js';
import { mutateTreasury, recordMaterialFlow } from './economy.js';
import { setNationKnownLevel } from './fog_of_war.js';

export const RANDOM_EVENTS = [
  {
    id: 'PLAGUE',
    name: 'Чума',
    description: 'Болезнь охватила город. Население сокращается.',
    probability: 0.15,
    choices: [
      { label: 'Карантин',     desc: 'Изолировать заражённые кварталы. Потери меньше, но казна страдает.',
        effect: (n) => { const d = Math.floor(n.population.total * 0.008); n.population.total -= d; mutateTreasury(n, -500, 'event_plague_quarantine'); n.population.happiness = Math.max(0, n.population.happiness - 5); addEventLog(`Карантин введён. Погибло ${d} чел. Казна −500.`, 'warning'); } },
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
      recordMaterialFlow(nation, 'wheat', bonus, 'event');
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
        effect: (n) => { const loss = Math.floor(n.economy.treasury * 0.02); mutateTreasury(n, -loss, 'event_pirate_fleet'); addEventLog(`Флот отогнал пиратов. Потери: ${loss} монет.`, 'warning'); } },
      { label: 'Откупиться',      desc: 'Заплатить выкуп. Дороже, но надёжнее.',
        effect: (n) => { const loss = Math.floor(n.economy.treasury * 0.07); mutateTreasury(n, -loss, 'event_pirate_ransom'); addEventLog(`Пираты получили откуп ${loss} монет и ушли.`, 'warning'); } },
    ],
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const loss = Math.floor(nation.economy.treasury * 0.05);
      mutateTreasury(nation, -loss, 'event_pirate_raid');
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
      mutateTreasury(nation, +gain, 'event_merchant_windfall');
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

  // Этап 5 economic3.md — рыночные шоки для variance цен.
  // Текущий набор событий не влиял на stockpile товаров (только население/казна),
  // из-за чего на 100+ ходовых прогонах 18-22 цен застывали на равновесии
  // (stuck_price detector). Drought + volcanic_winter убирают зерно из складов,
  // цены пшеницы/ячменя резко прыгают, торговля оживает.
  {
    id: 'DROUGHT',
    name: 'Засуха',
    description: 'Жестокая засуха уничтожила значительную часть урожая.',
    probability: 0.12,
    effect: (nationId) => {
      const nation = GAME_STATE.nations[nationId];
      const sp = nation.economy?.stockpile;
      if (!sp) return;
      const wheatLoss  = Math.floor((sp.wheat  || 0) * 0.30);
      const barleyLoss = Math.floor((sp.barley || 0) * 0.30);
      const olivesLoss = Math.floor((sp.olives || 0) * 0.20);
      sp.wheat  = Math.max(0, (sp.wheat  || 0) - wheatLoss);
      sp.barley = Math.max(0, (sp.barley || 0) - barleyLoss);
      sp.olives = Math.max(0, (sp.olives || 0) - olivesLoss);
      recordMaterialFlow(nation, 'wheat',  wheatLoss,  'event');
      recordMaterialFlow(nation, 'barley', barleyLoss, 'event');
      recordMaterialFlow(nation, 'olives', olivesLoss, 'event');
      applyDelta(`nations.${nationId}.population.happiness`, Math.max(0, nation.population.happiness - 8));
      addEventLog(`${nation.name}: Засуха уничтожила ${wheatLoss} пшеницы, ${barleyLoss} ячменя, ${olivesLoss} оливок.`, 'danger');
    },
  },
  {
    id: 'VOLCANIC_WINTER',
    name: 'Вулканическая зима',
    description: 'Извержение в далёких землях закрыло небо пеплом. Урожай по всему миру пострадал.',
    probability: 0.03,   // редкое глобальное событие, ~1 раз в 100-300 ходов
    effect: (nationId) => {
      // Глобально по всем нациям: −15% к еде и +дисбаланс рынка
      let affectedCount = 0;
      for (const n of Object.values(GAME_STATE.nations)) {
        const sp = n.economy?.stockpile;
        if (!sp) continue;
        for (const good of ['wheat', 'barley', 'olives', 'fish']) {
          if (sp[good]) {
            const before = sp[good];
            sp[good] = Math.floor(before * 0.85);
            recordMaterialFlow(n, good, before - sp[good], 'event');
          }
        }
        if (n.population) n.population.happiness = Math.max(0, (n.population.happiness || 50) - 4);
        affectedCount++;
      }
      addEventLog(`🌋 Вулканическая зима! Урожай пострадал по всему миру (${affectedCount} наций, −15% еды).`, 'danger');
    },
  },

  // ══════════════════════════════════════════════════════════════
  // Этап C fog_of_war.md — случайные события разведки
  // ══════════════════════════════════════════════════════════════

  // Слухи: путешественники приносят обрывочные данные о далёкой нации.
  // Повышает уровень знания игрока о случайной неизвестной нации до 1.
  {
    id: 'RUMOR_DISTANT_LAND',
    name: 'Весть из дальних земель',
    description: 'Путешественники из дальних земель делятся новостями.',
    probability: 0.10,
    playerOnly: true,
    effect: (_targetNationId) => {
      const gs = GAME_STATE;
      const playerId = gs.player_nation;
      if (!playerId) return;

      // Ищем случайную неизвестную нацию (level 0).
      const unknowns = [];
      for (const [nId, n] of Object.entries(gs.nations)) {
        if (nId === playerId) continue;
        if (!n?.regions?.length && !n?.population?.total) continue;
        const lvl = n._known_to?.[playerId] ?? 0;
        if (lvl === 0) unknowns.push(nId);
      }
      if (!unknowns.length) return;
      const target = unknowns[Math.floor(Math.random() * unknowns.length)];
      const targetNat = gs.nations[target];

      setNationKnownLevel(playerId, target, 1);

      const messages = [
        `Путешественники рассказывают о ${targetNat.name ?? target}: великая держава с множеством городов.`,
        `Купцы из дальних земель упоминают ${targetNat.name ?? target}: говорят, у них большая армия.`,
        `Пилигримы принесли слух: в стране ${targetNat.name ?? target} урожайный год.`,
        `Моряки передают: в ${targetNat.name ?? target} сменилась династия.`,
      ];
      const msg = messages[Math.floor(Math.random() * messages.length)];

      if (!Array.isArray(gs.rumors)) gs.rumors = [];
      gs.rumors.push({
        id:      `rumor_t${gs.turn ?? 0}_${target}`,
        turn:    gs.turn ?? 0,
        subject: targetNat.name ?? target,
        content: msg,
        observerId: playerId,
      });
      if (gs.rumors.length > 200) gs.rumors.shift();

      addEventLog(`📜 ${msg}`, 'info');
    },
  },

  // Трофейная карта: случайное получение full intel на 12 ходов.
  // Симулирует захват карт у пленного врага / пирата.
  {
    id: 'CAPTURED_MAP',
    name: 'Захваченная карта',
    description: 'В руки ваших людей попала подробная карта.',
    probability: 0.03,
    playerOnly: true,
    effect: (_targetNationId) => {
      const gs = GAME_STATE;
      const playerId = gs.player_nation;
      if (!playerId) return;

      // Выбираем случайную нацию level < 2.
      const candidates = [];
      for (const [nId, n] of Object.entries(gs.nations)) {
        if (nId === playerId) continue;
        if (!n?.regions?.length) continue;
        const lvl = n._known_to?.[playerId] ?? 0;
        if (lvl < 2) candidates.push(nId);
      }
      if (!candidates.length) return;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const targetNat = gs.nations[target];

      // Временный full intel: создаём псевдо-шпиона на 12 ходов.
      if (!Array.isArray(gs.expeditions)) gs.expeditions = [];
      gs.expeditions.push({
        id:          `capmap_${target}_t${gs.turn ?? 0}`,
        type:        'spy',
        observerId:  playerId,
        targetId:    target,
        started_turn: gs.turn ?? 0,
        turns_left:   12,
        status:       'active',
        active_turns_left: 12,
        cost: 0,
        source: 'captured_map',
      });
      setNationKnownLevel(playerId, target, 2);

      addEventLog(
        `🗺 Захвачена карта ${targetNat.name ?? target}! Полные разведданные на 12 ходов.`,
        'good',
      );
    },
  },

  // Дар от иностранного купца: карта в обмен на будущую скидку торговли.
  {
    id: 'MERCHANT_GIFT',
    name: 'Подарок иностранного купца',
    description: 'Купец из далёких земель преподнёс карту своей родины.',
    probability: 0.05,
    playerOnly: true,
    effect: (_targetNationId) => {
      const gs = GAME_STATE;
      const playerId = gs.player_nation;
      if (!playerId) return;

      const unknowns = [];
      for (const [nId, n] of Object.entries(gs.nations)) {
        if (nId === playerId) continue;
        if (!n?.regions?.length) continue;
        const lvl = n._known_to?.[playerId] ?? 0;
        if (lvl === 0) unknowns.push(nId);
      }
      if (!unknowns.length) return;
      const target = unknowns[Math.floor(Math.random() * unknowns.length)];
      const targetNat = gs.nations[target];

      setNationKnownLevel(playerId, target, 1);
      addEventLog(
        `🎁 Иностранный купец поделился картой ${targetNat.name ?? target}.`,
        'good',
      );
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
      // Этап C: события с флагом playerOnly всегда адресуются игроку
      // (RUMOR_DISTANT_LAND, CAPTURED_MAP, MERCHANT_GIFT — разведдонные).
      const effectiveTarget = event.playerOnly
        ? (GAME_STATE.player_nation || targetNationId)
        : targetNationId;
      if (effectiveTarget === GAME_STATE.player_nation && event.choices?.length) {
        _showEventChoiceOverlay(event, effectiveTarget);
      } else {
        event.effect(effectiveTarget);
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

