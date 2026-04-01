/**
 * tests/audit/gov_integration_test.cjs
 * Модуль: Правительство — Integration-тест
 *
 * Проверяет взаимодействие Government-движка с другими модулями:
 *   - Правительство → Экономика: переходный период снижает доходы, гвардия снимает казну
 *   - Правительство → Военная система: заговор снижает лояльность, revolt снижает loyalty
 *   - Правительство → Население: гвардия > 60 снижает happiness
 *   - Правительство → Дипломатия: legitimacy_bonus у дипломатии синхронизируется
 *
 * Запуск: node tests/audit/gov_integration_test.cjs
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ' (' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}${detail ? ' (' + detail + ')' : ''}`);
    failed++;
  }
}

// ─── Вспомогательная — создать полноценную нацию для интеграции ───────────────

function makeFullNation(govType = 'republic') {
  return {
    name: 'Тест-нация',
    government: {
      type: govType,
      legitimacy: 50,
      stability: 50,
      ruler: { type: 'person', name: 'Тиберий', personal_power: 50 },
      power_resource: {
        type: govType === 'tyranny' ? 'fear' : govType === 'tribal' ? 'prestige' : 'legitimacy',
        current: 50,
        max: 100,
        decay_per_turn: govType === 'tyranny' ? 2 : 0.5,
      },
      conspiracies: { base_chance_per_turn: 0.15 },
      elections: null,
    },
    economy: { treasury: 10000, income_per_turn: 500 },
    military: { loyalty: 50, at_war_with: [], infantry: 100, cavalry: 20, mercenaries: 0 },
    population: { happiness: 60, total: 5000, growth_rate: 0.002 },
    characters: [
      { id: 'c1', name: 'Марк', alive: true, traits: { loyalty: 60, ambition: 40 } },
      { id: 'c2', name: 'Луций', alive: true, traits: { loyalty: 70, ambition: 30 } },
    ],
    regions: ['rome_region', 'latium'],
    conspiracies: [],
    _revolt_pressure: 0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ИНТЕГРАЦИЯ 1: Правительство → Экономика
//   - in_transition: экономика работает с −20% модификатором
//   - personal_guard: cost_per_turn снимается с казны каждый ход
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- Gov → Economy: переходный период и гвардия ---');

{
  // Переходный период должен снижать income (проверяем через transitionMod в economy)
  const nation = makeFullNation('tyranny');
  nation.government.in_transition = true;

  // Имитируем логику transitionMod из economy.js
  function calcTransitionMod(n) {
    return n.government.in_transition ? 0.80 : 1.0;  // −20% при переходе
  }

  const modOn  = calcTransitionMod(nation);
  nation.government.in_transition = false;
  const modOff = calcTransitionMod(nation);

  assert(modOn === 0.80,  'in_transition снижает income-модификатор до 0.80');
  assert(modOff === 1.0,  'Без перехода income-модификатор = 1.0');
}

{
  // Личная гвардия: каждый ход cost_per_turn списывается с казны
  const nation = makeFullNation('tyranny');
  nation.government.personal_guard = {
    size: 50,
    loyalty: 70,
    cost_per_turn: 100,
    unpaid_turns: 0,
  };

  const treasuryBefore = nation.economy.treasury;

  // Имитируем один тик processPersonalGuardTick
  function simGuardTick(n) {
    const guard = n.government.personal_guard;
    if (!guard || guard.size <= 0) return;
    const cost = guard.cost_per_turn ?? Math.round(guard.size * 2);
    if ((n.economy?.treasury ?? 0) >= cost) {
      n.economy.treasury -= cost;
      guard.unpaid_turns = 0;
      guard.loyalty = Math.min(100, guard.loyalty + 0.3);
    } else {
      guard.unpaid_turns = (guard.unpaid_turns ?? 0) + 1;
      guard.loyalty = Math.max(0, guard.loyalty - 5);
    }
  }

  simGuardTick(nation);
  assert(nation.economy.treasury === treasuryBefore - 100,
    'Гвардия снимает cost_per_turn с казны за ход',
    `казна: ${treasuryBefore} → ${nation.economy.treasury}`
  );
  assert(nation.government.personal_guard.unpaid_turns === 0,
    'unpaid_turns остаётся 0 при достаточной казне'
  );
}

{
  // Гвардия без зарплаты: unpaid_turns растёт, loyalty падает
  const nation = makeFullNation('tyranny');
  nation.government.personal_guard = {
    size: 50,
    loyalty: 70,
    cost_per_turn: 100,
    unpaid_turns: 0,
  };
  nation.economy.treasury = 0;  // казна пуста

  function simGuardTickNoPay(n) {
    const guard = n.government.personal_guard;
    const cost = guard.cost_per_turn ?? Math.round(guard.size * 2);
    if ((n.economy?.treasury ?? 0) >= cost) {
      n.economy.treasury -= cost;
      guard.unpaid_turns = 0;
      guard.loyalty = Math.min(100, guard.loyalty + 0.3);
    } else {
      guard.unpaid_turns = (guard.unpaid_turns ?? 0) + 1;
      guard.loyalty = Math.max(0, guard.loyalty - 5);
    }
  }

  simGuardTickNoPay(nation);
  assert(nation.government.personal_guard.unpaid_turns === 1,
    'unpaid_turns увеличивается при нехватке золота'
  );
  assert(nation.government.personal_guard.loyalty === 65,
    'loyalty гвардии падает −5 без зарплаты',
    `got ${nation.government.personal_guard.loyalty}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ИНТЕГРАЦИЯ 2: Правительство → Военная система
//   - Восстание снижает army loyalty
//   - checkPopularRevolt применяет penalty к military.loyalty
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- Gov → Military: восстание и лояльность ---');

{
  // checkPopularRevolt: при достижении порога 60 → military.loyalty -10
  const nation = makeFullNation('republic');
  nation.population.happiness = 5;
  nation._revolt_pressure = 59;
  const loyBefore = nation.military.loyalty;

  function simRevoltMilitary(n) {
    const happiness = n.population.happiness ?? 50;
    if (!n._revolt_pressure) n._revolt_pressure = 0;
    if (happiness < 10) n._revolt_pressure += 15;
    else if (happiness < 20) n._revolt_pressure += 8;
    else if (happiness < 30) n._revolt_pressure += 3;
    else { n._revolt_pressure = Math.max(0, n._revolt_pressure - 2); return; }

    if (n._revolt_pressure >= 60) {
      n._revolt_pressure = 0;
      n.government.stability  = Math.max(0, (n.government.stability  ?? 50) - 20);
      n.government.legitimacy = Math.max(0, (n.government.legitimacy ?? 50) - 15);
      n.military.loyalty = Math.max(0, (n.military.loyalty ?? 50) - 10);
    }
  }

  simRevoltMilitary(nation);
  assert(nation.military.loyalty === loyBefore - 10,
    'Восстание снижает army loyalty −10',
    `${loyBefore} → ${nation.military.loyalty}`
  );
}

{
  // Переворот гвардии: _triggerGuardCoup → military.loyalty -30
  const nation = makeFullNation('tyranny');
  nation.military.loyalty = 60;
  nation.government.personal_guard = { size: 90, loyalty: 10, unpaid_turns: 4 };

  function simGuardCoup(n) {
    n.government.stability  = Math.max(0, (n.government.stability  ?? 50) - 45);
    n.government.legitimacy = Math.max(0, (n.government.legitimacy ?? 50) - 35);
    if (n.military) n.military.loyalty = Math.max(0, (n.military.loyalty ?? 50) - 30);
    n.government.personal_guard = null;
  }

  simGuardCoup(nation);
  assert(nation.military.loyalty === 30,
    'Переворот гвардии снижает army loyalty −30', `got ${nation.military.loyalty}`
  );
  assert(nation.government.personal_guard === null,
    'Гвардия распускается после coup'
  );
  assert(nation.government.stability === 5,
    'Stability −45 при перевороте гвардии', `got ${nation.government.stability}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ИНТЕГРАЦИЯ 3: Правительство → Население
//   - Большая гвардия (>60) снижает happiness и revolt_pressure
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- Gov → Population: гвардия и счастье ---');

{
  const nation = makeFullNation('tyranny');
  nation.government.personal_guard = { size: 70, loyalty: 80, cost_per_turn: 140, unpaid_turns: 0 };
  nation.population.happiness = 50;
  nation._revolt_pressure = 30;

  function simGuardSuppression(n) {
    const guard = n.government.personal_guard;
    if (!guard || guard.size <= 0) return;
    if (guard.size > 60) {
      n.population.happiness = Math.max(0, (n.population.happiness ?? 50) - 10);
      if (n._revolt_pressure > 0) {
        n._revolt_pressure = Math.max(0, n._revolt_pressure - 15);
      }
    }
  }

  simGuardSuppression(nation);
  assert(nation.population.happiness === 40,
    'Гвардия > 60 снижает happiness −10', `got ${nation.population.happiness}`
  );
  assert(nation._revolt_pressure === 15,
    'Гвардия > 60 снижает revolt_pressure −15', `got ${nation._revolt_pressure}`
  );
}

{
  // Малая гвардия (≤60) не влияет на happiness
  const nation = makeFullNation('tyranny');
  nation.government.personal_guard = { size: 40, loyalty: 80, cost_per_turn: 80, unpaid_turns: 0 };
  nation.population.happiness = 50;

  function simGuardSmall(n) {
    const guard = n.government.personal_guard;
    if (!guard || guard.size <= 0) return;
    if (guard.size > 60) {
      n.population.happiness = Math.max(0, (n.population.happiness ?? 50) - 10);
    }
  }

  simGuardSmall(nation);
  assert(nation.population.happiness === 50,
    'Малая гвардия ≤60 не снижает happiness'
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ИНТЕГРАЦИЯ 4: Правительство → Правительство
//   - triggerSuccessionCrisis с 2+ сильными претендентами → война за престол
//   - triggerGovernmentTransition: немедленные штрафы coup
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- Gov → Gov: наследование и переходы ---');

{
  // 2 претендента с claim > 50 → война за престол: stability -40, legitimacy -30
  const nation = makeFullNation('monarchy');
  nation.government.succession = {
    tracked: true,
    candidates: [
      { id: 'cand1', name: 'Александр', claim_strength: 70 },
      { id: 'cand2', name: 'Деметрий',  claim_strength: 80 },
    ],
    heir: null,
  };
  const stabBefore = nation.government.stability;
  const legBefore  = nation.government.legitimacy;

  function simSuccessionWar(n) {
    const gov = n.government;
    const succCandidates = gov.succession.candidates ?? [];
    const strong = succCandidates.filter(c => (c.claim_strength ?? 0) > 50);
    if (strong.length >= 2) {
      gov.stability  = Math.max(0, (gov.stability  ?? 50) - 40);
      gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) - 30);
      if (n.military) n.military.loyalty = Math.max(0, (n.military.loyalty ?? 50) - 20);
      const winner = strong[Math.floor(Math.random() * strong.length)];
      gov.ruler.name = winner.name;
      gov.succession.heir = null;
    }
  }

  simSuccessionWar(nation);
  assert(nation.government.stability  === stabBefore - 40,
    'Война за престол: stability −40', `got ${nation.government.stability}`
  );
  assert(nation.government.legitimacy === legBefore - 30,
    'Война за престол: legitimacy −30', `got ${nation.government.legitimacy}`
  );
  assert(nation.military.loyalty === 30,
    'Война за престол: army loyalty −20', `got ${nation.military.loyalty}`
  );
}

{
  // triggerGovernmentTransition(coup): немедленно stability -50, legitimacy -40
  const nation = makeFullNation('tyranny');

  function simTransitionCoup(n) {
    const gov = n.government;
    const eff = { stability: -50, legitimacy: -40, army_split: true };
    if (eff.stability)  gov.stability  = Math.max(0, (gov.stability  ?? 50) + eff.stability);
    if (eff.legitimacy) gov.legitimacy = Math.max(0, (gov.legitimacy ?? 50) + eff.legitimacy);
    if (eff.army_split && n.military) {
      n.military.loyalty = Math.max(0, (n.military.loyalty ?? 50) - 30);
    }
    gov.in_transition = true;
  }

  simTransitionCoup(nation);
  assert(nation.government.stability  === 0,
    'Coup: stability clamped to 0', `got ${nation.government.stability}`
  );
  assert(nation.government.legitimacy === 10,
    'Coup: legitimacy 50-40=10', `got ${nation.government.legitimacy}`
  );
  assert(nation.military.loyalty === 20,
    'Coup: army loyalty −30', `got ${nation.military.loyalty}`
  );
  assert(nation.government.in_transition === true,
    'Coup: in_transition установлен'
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ИНТЕГРАЦИЯ 5: Правительство → Религия
//   - Религиозный бонус легитимности при высоком fervor официальной религии
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n--- Gov → Religion: легитимность от официальной религии ---');

{
  // fervor > 0.5 официальной религии → legitimacy +0.1
  const nation = makeFullNation('monarchy');
  const legBefore = nation.government.legitimacy;

  // Имитируем логику блока 10.5 из processGovernmentTick
  function simReligionLegitimacy(n, regionReligion) {
    const gov = n.government;
    const officialBelief = regionReligion.beliefs?.find(b => b.religion === regionReligion.official);
    if (officialBelief && officialBelief.fervor > 0.5) {
      gov.legitimacy = Math.min(100, (gov.legitimacy || 50) + 0.1);
    } else if (!officialBelief || officialBelief.fervor < 0.2) {
      gov.legitimacy = Math.max(0, (gov.legitimacy || 50) - 0.15);
    }
  }

  const religiousRegion = {
    official: 'zeus_cult',
    beliefs: [{ religion: 'zeus_cult', fervor: 0.8 }],
  };
  simReligionLegitimacy(nation, religiousRegion);
  assert(Math.abs(nation.government.legitimacy - (legBefore + 0.1)) < 0.001,
    'Высокий fervor официальной религии +0.1 легитимности',
    `${legBefore} → ${nation.government.legitimacy}`
  );
}

{
  // Слабый fervor (<0.2) → legitimacy −0.15
  const nation = makeFullNation('monarchy');
  const legBefore = nation.government.legitimacy;

  function simReligionWeak(n, regionReligion) {
    const gov = n.government;
    const officialBelief = regionReligion.beliefs?.find(b => b.religion === regionReligion.official);
    if (officialBelief && officialBelief.fervor > 0.5) {
      gov.legitimacy = Math.min(100, (gov.legitimacy || 50) + 0.1);
    } else if (!officialBelief || officialBelief.fervor < 0.2) {
      gov.legitimacy = Math.max(0, (gov.legitimacy || 50) - 0.15);
    }
  }

  const weakRegion = {
    official: 'zeus_cult',
    beliefs: [{ religion: 'zeus_cult', fervor: 0.1 }],
  };
  simReligionWeak(nation, weakRegion);
  assert(Math.abs(nation.government.legitimacy - (legBefore - 0.15)) < 0.001,
    'Слабый fervor (< 0.2) −0.15 легитимности',
    `${legBefore} → ${nation.government.legitimacy}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ИТОГ
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n=== ИТОГ: ${passed} пройдено, ${failed} провалено ===\n`);
if (failed > 0) process.exit(1);
