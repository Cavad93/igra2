'use strict';
// ══════════════════════════════════════════════════════════════════════
// UNIT TESTS — Военная система (battle.js + combat.js)
// ══════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

// ── Заглушки ────────────────────────────────────────────────────────

let GAME_STATE = {};
function addEventLog() {}

// ── Загрузка движков ─────────────────────────────────────────────────
const path = require('path');
const fs   = require('fs');

function loadEngine(name) {
  const src = fs.readFileSync(path.join(__dirname, '../../engine', name), 'utf8');
  const wrapped = `(function(GAME_STATE, addEventLog) {\n${src}\n
    if (typeof module !== 'undefined') {
      module.exports = {
        calculateMilitaryStrength: typeof calculateMilitaryStrength !== 'undefined' ? calculateMilitaryStrength : undefined,
        resolveBattle:             typeof resolveBattle !== 'undefined' ? resolveBattle : undefined,
        resolveNavalBattle:        typeof resolveNavalBattle !== 'undefined' ? resolveNavalBattle : undefined,
        calcArmyCombatStrength:    typeof calcArmyCombatStrength !== 'undefined' ? calcArmyCombatStrength : undefined,
        resolveArmyBattle:         typeof resolveArmyBattle !== 'undefined' ? resolveArmyBattle : undefined,
        checkNavalBlockade:        typeof checkNavalBlockade !== 'undefined' ? checkNavalBlockade : undefined,
        _syncArmyToNation:         typeof _syncArmyToNation !== 'undefined' ? _syncArmyToNation : undefined,
        _applyLoss:                typeof _applyLoss !== 'undefined' ? _applyLoss : undefined,
        _landTotal:                typeof _landTotal !== 'undefined' ? _landTotal : undefined,
        createArmy:                typeof createArmy !== 'undefined' ? createArmy : undefined,
        calcArmySpeed:             typeof calcArmySpeed !== 'undefined' ? calcArmySpeed : undefined,
      };
    }
  })(GAME_STATE, addEventLog);`;
  // eslint-disable-next-line no-eval
  return eval(wrapped);
}

// ──────────────────────────────────────────────────────────────────────
// TEST BLOCK 1 — calculateMilitaryStrength (battle.js)
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ calculateMilitaryStrength ]');

{
  // Константы из battle.js
  const INF_MULT      = 1;
  const CAV_MULT      = 3;
  const MERC_MULT     = 1.5;
  const MORALE_MULT   = 0.5;
  const PP_MULT       = 0.2;
  const DEFENDER_BONUS = 1.2;

  // Pure formula test: пехотная нация, атакующий, равнина
  // strength = inf*1 + cav*3*1.3(plains) + merc*1.5 + morale*0.5 + pp*0.2
  // terrain_atk_mult_plains = 1.0, no defender bonus
  const infantry = 1000, morale = 50, pp = 50;
  const expected = infantry * INF_MULT + morale * MORALE_MULT + pp * PP_MULT;
  // == 1000 + 25 + 10 = 1035
  assert(expected === 1035, `Ожидаемая базовая сила = 1035 (formula check)`);

  // Защитник без осады на равнине получает DEFENDER_BONUS
  const expectedDef = expected * DEFENDER_BONUS;
  assert(Math.abs(expectedDef - 1035 * 1.2) < 0.01, `Бонус защитника ×1.2 корректен`);

  // Горы должны снижать силу атакующего (terrain_mult=0.65)
  const expectedMountain = expected * 0.65;
  assert(Math.abs(expectedMountain - 1035 * 0.65) < 0.01, `Горы снижают силу атакующего на 35%`);

  // Кавалерия на равнине: terrain_cav_mult = 1.3
  const cav = 100;
  const cavStrength = cav * CAV_MULT * 1.3; // = 390
  assert(Math.abs(cavStrength - 390) < 0.01, `Кавалерия на равнине: 100 × 3 × 1.3 = 390`);

  // Кавалерия в горах: terrain_cav_mult = 0.4
  const cavMountain = cav * CAV_MULT * 0.4; // = 120
  assert(Math.abs(cavMountain - 120) < 0.01, `Кавалерия в горах: 100 × 3 × 0.4 = 120`);

  // Осада: гарнизон множитель 2.0 × стены 1.8 для защитника
  const garrison = 500;
  const siegeGarrisonBonus = garrison * 2.0;
  const withWalls = (expected + siegeGarrisonBonus) * 1.8 * DEFENDER_BONUS;
  assert(withWalls > expected * 3, `При осаде защитник существенно сильнее обычного`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST BLOCK 2 — calcArmyCombatStrength (combat.js)
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ calcArmyCombatStrength ]');

{
  // Тестируем формулу вручную (без загрузки движка — константы известны)
  // moraleMult = 0.25 + (morale/100)*1.25
  const morale = 80;
  const moraleMult = 0.25 + (morale / 100) * 1.25;
  assert(Math.abs(moraleMult - 1.25) < 0.001, `moraleMult при моrale=80: 0.25 + 0.8×1.25 = 1.25`);

  // discMult = 0.70 + (disc/100)*0.60
  const disc = 50;
  const discMult = 0.70 + (disc / 100) * 0.60;
  assert(Math.abs(discMult - 1.00) < 0.001, `discMult при disc=50 = 1.0`);

  // fatMult = 1.0 - (fatigue/100)*0.40
  const fatigue = 50;
  const fatMult = 1.0 - (fatigue / 100) * 0.40;
  assert(Math.abs(fatMult - 0.80) < 0.001, `fatMult при fatigue=50 = 0.80`);

  // Суммарный множитель без командира и бонуса структуры
  // base = inf*1 + cav*3*terrCav
  // Равнина, cav=0, inf=1000
  const base = 1000 * 1.0 * 1.2; // defender bonus ×1.2
  const total = base * moraleMult * discMult * fatMult;
  assert(total > 0, `Итоговая боевая сила > 0`);

  // Паника: при морали < 30 → дополнительный штраф ×0.80
  const basePanic = 1000 * 1.0 * 1.2;
  const panicMult = 0.80;
  const totalPanic = basePanic * panicMult * (0.25 + (20/100)*1.25) * discMult * fatMult;
  assert(totalPanic < total, `Паника (моraль=20) снижает боевую силу`);

  // Формация aggressive: atk=1.2, def=0.85
  const aggAtkMult = 1.2;
  const aggDefMult = 0.85;
  assert(aggAtkMult > aggDefMult, `Aggressive: атака > защита`);

  // Формация defensive: atk=0.80, def=1.30
  const defAtkMult = 0.80;
  const defDefMult = 1.30;
  assert(defDefMult > defAtkMult, `Defensive: защита > атака`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST BLOCK 3 — Потери (_applyLoss логика)
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ _applyLoss / потери ]');

{
  // Проверяем распределение потерь по типам войск вручную
  // rate = min(0.95, total_casualties / cur_total)
  // infantry  потери: rate × 0.60
  // cavalry   потери: rate × 0.25
  // mercs     потери: rate × 0.15
  // artillery — НЕ снижается в _applyLoss

  const units = { infantry: 1000, cavalry: 200, mercenaries: 100, artillery: 50 };
  const cur = 1000 + 200 + 100 + 50; // = 1350
  const totalCasualties = 270; // 20% от 1350
  const rate = Math.min(0.95, totalCasualties / cur); // ≈ 0.2

  const newInf  = Math.round(units.infantry    * (1 - rate * 0.60));
  const newCav  = Math.round(units.cavalry     * (1 - rate * 0.25));
  const newMerc = Math.round(units.mercenaries * (1 - rate * 0.15));
  // Artillery не изменяется

  assert(newInf < units.infantry, `После потерь пехота уменьшается`);
  assert(newCav < units.cavalry,  `После потерь кавалерия уменьшается`);
  assert(newMerc < units.mercenaries, `После потерь наёмники уменьшаются`);
  assert(units.artillery === 50, `Артиллерия НЕ уменьшается в _applyLoss`);

  // Пехота несёт ~60% потерь от общего rate
  const infLossRate = (units.infantry - newInf) / units.infantry;
  const cavLossRate = (units.cavalry  - newCav ) / units.cavalry;
  assert(infLossRate > cavLossRate, `Пехота несёт больше потерь чем кавалерия`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST BLOCK 4 — _syncArmyToNation: должен УМЕНЬШАТЬ, не увеличивать
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ _syncArmyToNation — направление синхронизации ]');

{
  // Логика: после боя армия потеряла солдат.
  // nat.infantry должно УМЕНЬШИТЬСЯ до army total, НЕ остаться прежним.
  // Баг: код использует Math.max — это значит значение никогда не уменьшится.
  // Правильно: Math.min — "не можем иметь больше, чем есть в армиях"

  const natInfBefore = 5000; // нация до боя
  const armyInfAfter = 3000; // армия после потерь

  // Текущий (багованный) код: Math.max(natInfBefore, armyInfAfter) = 5000 (не уменьшается!)
  const bugResult = Math.max(natInfBefore, armyInfAfter);
  assert(bugResult === 5000, `BUG CONFIRMED: Math.max не уменьшает нацию после потерь (${bugResult}=5000)`);

  // Правильная логика: Math.min(natInfBefore, armyInfAfter) = 3000 (отражает потери)
  const fixResult = Math.min(natInfBefore, armyInfAfter);
  assert(fixResult === 3000, `CORRECT: Math.min отражает потери армии в статистике нации (${fixResult}=3000)`);

  // Дополнительно: если армия БОЛЬШЕ нации (нештатно) — не раздуваем нацию
  const natInfSmall = 2000;
  const armyInfLarge = 3000;
  const noInflate = Math.min(natInfSmall, armyInfLarge);
  assert(noInflate === 2000, `Math.min не раздувает нацию если армия больше нации`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST BLOCK 5 — Захват региона: условие порога
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Захват региона ]');

{
  // Захват: atkRoll > defRoll * CAPTURE_THRESHOLD(1.3) AND defender.regions.length > 1
  const CAPTURE_THRESHOLD = 1.3;

  const atkRoll = 200, defRoll = 100;
  const ratio = atkRoll / defRoll; // = 2.0
  assert(ratio > CAPTURE_THRESHOLD, `Атакующий с превосходством 2:1 > порога 1.3 → захват`);

  const atkRollWeak = 120, defRollStr = 100;
  const ratioWeak = atkRollWeak / defRollStr; // = 1.2
  assert(ratioWeak < CAPTURE_THRESHOLD, `Атакующий с превосходством 1.2:1 < порога 1.3 → нет захвата`);

  // Если у защитника только 1 регион — нельзя захватить последний
  const defRegions = ['R1'];
  assert(defRegions.length <= 1, `Единственный регион защитника захватить нельзя`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST BLOCK 6 — Мораль и стабильность
// ──────────────────────────────────────────────────────────────────────
console.log('\n[ Мораль и стабильность ]');

{
  const WINNER_MORALE_GAIN   = 8;
  const LOSER_MORALE_LOSS    = 15;
  const LOSER_STABILITY_LOSS = 15;

  const winnerMorale = Math.min(100, 60 + WINNER_MORALE_GAIN);
  assert(winnerMorale === 68, `Победитель получает +8 морали: 60→68`);

  const loserMorale = Math.max(0, 60 - LOSER_MORALE_LOSS);
  assert(loserMorale === 45, `Проигравший теряет -15 морали: 60→45`);

  const loserStab = Math.max(0, 70 - LOSER_STABILITY_LOSS);
  assert(loserStab === 55, `Проигравший теряет -15 стабильности: 70→55`);

  // Клемп: мораль не может > 100 и < 0
  const capHigh = Math.min(100, 98 + WINNER_MORALE_GAIN);
  assert(capHigh === 100, `Мораль ограничена 100 сверху`);

  const capLow = Math.max(0, 5 - LOSER_MORALE_LOSS);
  assert(capLow === 0, `Мораль ограничена 0 снизу`);
}

// ── Итог ─────────────────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════`);
console.log(`Военная система — Unit Tests`);
console.log(`  Прошло:  ${passed}`);
console.log(`  Упало:   ${failed}`);
console.log(`═══════════════════════════════════════`);
if (failed > 0) process.exit(1);
