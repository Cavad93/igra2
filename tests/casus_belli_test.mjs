// tests/casus_belli_test.mjs — Этап CB, тесты casus_belli.js + peace_engine.js
//
// Запуск: node tests/casus_belli_test.mjs
//
// Тестируем:
//   T1  initCasusBelli создаёт пустой массив
//   T2  registerCB валидный тип + target
//   T3  registerCB отклоняет invalid type
//   T4  registerCB требует region_id для territorial_claim
//   T5  findCB возвращает активный CB, null для истёкших
//   T6  consumeCB помечает CB, findCB его игнорирует
//   T7  tickCbExpiry удаляет истёкшие
//   T8  hasCB boolean wrapper
//   T9  isDemandAllowed корректно фильтрует по allowed_demands
//   T10 getDemandWsCost cede_region зависит от населения
//   T11 AE: addAeScore, getAeScore, clamp [0,100], decay
//   T12 computeWarDeclarationAeCost с CB и без
//   T13 grantPunitiveCB → punitive CB у жертвы
//   T14 peace_engine: createPeaceOffer / rejectPeaceOffer
//   T15 addTruce / hasActiveTruce / tickTruces

'use strict';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else      { failed++; console.log(`  ✗ ${msg}`); }
}

function resetGS() {
  global.GAME_STATE = {
    turn: 10,
    player_nation: 'syracuse',
    nations: {
      syracuse:  { name: 'Syracuse', regions: ['r1'], population: { total: 100000 }, economy: { treasury: 5000, income: 100 } },
      carthage:  { name: 'Carthage', regions: ['r2'], population: { total: 80000 },  economy: { treasury: 3000, income: 80 } },
      rome:      { name: 'Rome',     regions: ['r3'], population: { total: 500000 }, economy: { treasury: 2000, income: 200 } },
    },
    regions: {
      r1: { id: 'r1', name: 'Syracuse', nation: 'syracuse', population: { total: 50000 } },
      r2: { id: 'r2', name: 'Carthage', nation: 'carthage', population: { total: 40000 } },
      r3: { id: 'r3', name: 'Rome',     nation: 'rome',     population: { total: 250000 } },
    },
    wars:        [],
    casus_belli: [],
    peace_offers: [],
    truces:      [],
  };
}

// Подгружаем модули
const cbMod = await import('../engine/casus_belli.js');
const peaceMod = await import('../engine/peace_engine.js');

// Экспозиция символов на window/global для тестовых функций, которые ссылаются на них как globals.
global.CASUS_BELLI_TYPES = cbMod.CASUS_BELLI_TYPES;
global.registerCB = cbMod.registerCB;
global.findCB = cbMod.findCB;
global.consumeCB = cbMod.consumeCB;
global.hasCB = cbMod.hasCB;
global.removeCB = cbMod.removeCB;
global.tickCbExpiry = cbMod.tickCbExpiry;
global.tickAutomaticCB = cbMod.tickAutomaticCB;
global.grantPunitiveCB = cbMod.grantPunitiveCB;
global.isDemandAllowed = cbMod.isDemandAllowed;
global.getDemandWsCost = cbMod.getDemandWsCost;
global.getAeScore = cbMod.getAeScore;
global.addAeScore = cbMod.addAeScore;
global.tickAeDecay = cbMod.tickAeDecay;
global.computeWarDeclarationAeCost = cbMod.computeWarDeclarationAeCost;
global.canVassalize = cbMod.canVassalize;
global.isWarExhausted = cbMod.isWarExhausted;
global.createPeaceOffer = peaceMod.createPeaceOffer;
global.acceptPeaceOffer = peaceMod.acceptPeaceOffer;
global.rejectPeaceOffer = peaceMod.rejectPeaceOffer;
global.addTruce = peaceMod.addTruce;
global.hasActiveTruce = peaceMod.hasActiveTruce;
global.tickTruces = peaceMod.tickTruces;

// ── T1 ─────────────────────────────────────────────
console.log('\nT1: initCasusBelli создаёт пустой массив');
resetGS();
delete global.GAME_STATE.casus_belli;
cbMod.initCasusBelli();
assert(Array.isArray(global.GAME_STATE.casus_belli), 'casus_belli это массив');
assert(global.GAME_STATE.casus_belli.length === 0, 'массив пустой');

// ── T2 ─────────────────────────────────────────────
console.log('\nT2: registerCB валидный CB');
resetGS();
const cb1 = cbMod.registerCB({
  holder_id: 'syracuse', target_id: 'carthage',
  type: 'humiliation', source: 'event',
});
assert(cb1 !== null, 'CB создан');
assert(cb1.holder_id === 'syracuse', 'holder_id правильный');
assert(cb1.target_id === 'carthage', 'target_id правильный');
assert(cb1.type === 'humiliation', 'type правильный');
assert(cb1.turn_expires === 10 + 36, 'turn_expires = turn + default_duration (36)');

// ── T3 ─────────────────────────────────────────────
console.log('\nT3: registerCB отклоняет неверный тип');
resetGS();
const cb2 = cbMod.registerCB({
  holder_id: 'syracuse', target_id: 'carthage', type: 'fake_type'
});
assert(cb2 === null, 'возврат null для несуществующего типа');
assert(global.GAME_STATE.casus_belli.length === 0, 'массив не изменился');

// ── T4 ─────────────────────────────────────────────
console.log('\nT4: registerCB требует region для territorial_claim');
resetGS();
const cb3 = cbMod.registerCB({
  holder_id: 'syracuse', target_id: 'carthage', type: 'territorial_claim'
});
assert(cb3 === null, 'null без region_id');
const cb3b = cbMod.registerCB({
  holder_id: 'syracuse', target_id: 'carthage', type: 'territorial_claim', region_id: 'r2',
});
assert(cb3b !== null, 'success с region_id');
assert(cb3b.region_id === 'r2', 'region_id сохранён');

// ── T5 ─────────────────────────────────────────────
console.log('\nT5: findCB возвращает активный, null для истёкшего');
resetGS();
cbMod.registerCB({ holder_id: 'syracuse', target_id: 'carthage', type: 'humiliation' });
assert(cbMod.findCB('syracuse', 'carthage') !== null, 'активный CB найден');
assert(cbMod.findCB('syracuse', 'rome') === null, 'null для другой цели');
assert(cbMod.findCB('rome', 'syracuse') === null, 'null для другого holder');
global.GAME_STATE.turn = 10 + 37;   // после expiry
assert(cbMod.findCB('syracuse', 'carthage') === null, 'null после expiry');

// ── T6 ─────────────────────────────────────────────
console.log('\nT6: consumeCB делает CB неактивным');
resetGS();
const cb6 = cbMod.registerCB({ holder_id: 'syracuse', target_id: 'carthage', type: 'humiliation' });
assert(cbMod.findCB('syracuse', 'carthage') !== null, 'CB существует');
cbMod.consumeCB(cb6.id);
assert(cbMod.findCB('syracuse', 'carthage') === null, 'CB больше не найден после consume');

// ── T7 ─────────────────────────────────────────────
console.log('\nT7: tickCbExpiry удаляет истёкшие');
resetGS();
cbMod.registerCB({ holder_id: 'syracuse', target_id: 'carthage', type: 'humiliation' });
global.GAME_STATE.turn = 10 + 40;   // ≥ expiry + 3
cbMod.tickCbExpiry();
assert(global.GAME_STATE.casus_belli.length === 0, 'истёкший CB удалён');

// ── T8 ─────────────────────────────────────────────
console.log('\nT8: hasCB boolean');
resetGS();
assert(cbMod.hasCB('syracuse', 'carthage') === false, 'false когда нет');
cbMod.registerCB({ holder_id: 'syracuse', target_id: 'carthage', type: 'humiliation' });
assert(cbMod.hasCB('syracuse', 'carthage') === true, 'true после register');

// ── T9 ─────────────────────────────────────────────
console.log('\nT9: isDemandAllowed');
assert(cbMod.isDemandAllowed('humiliation', 'humiliate') === true, 'humiliation разрешает humiliate');
assert(cbMod.isDemandAllowed('humiliation', 'cede_region') === false, 'humiliation НЕ разрешает cede_region');
assert(cbMod.isDemandAllowed('reconquest', 'cede_region') === true, 'reconquest разрешает cede_region');
assert(cbMod.isDemandAllowed('tribal_raid', 'vassalize') === false, 'tribal_raid НЕ разрешает vassalize');

// ── T10 ────────────────────────────────────────────
console.log('\nT10: getDemandWsCost');
resetGS();
const cost1 = cbMod.getDemandWsCost('cede_region', { region_id: 'r1' });
assert(cost1 === 8 + 5, `r1 (50k pop): base 8 + 5 per_10k = ${cost1}`); // 13
const cost2 = cbMod.getDemandWsCost('cede_region', { region_id: 'r3' });
assert(cost2 === 22, `r3 (250k pop) клампится к max 22: ${cost2}`);
assert(cbMod.getDemandWsCost('vassalize') === 30, 'vassalize = 30 WS');
assert(cbMod.getDemandWsCost('humiliate') === 5, 'humiliate = 5 WS');

// ── T11 ────────────────────────────────────────────
console.log('\nT11: AE add/get/clamp/decay');
resetGS();
assert(cbMod.getAeScore('syracuse') === 0, 'стартовый AE = 0');
cbMod.addAeScore('syracuse', 25, 'test');
assert(cbMod.getAeScore('syracuse') === 25, '+25 AE');
cbMod.addAeScore('syracuse', 90, 'test');
assert(cbMod.getAeScore('syracuse') === 100, 'clamp к 100');
cbMod.addAeScore('syracuse', -200, 'test');
assert(cbMod.getAeScore('syracuse') === 0, 'clamp к 0');
cbMod.addAeScore('syracuse', 10, 'test');
cbMod.tickAeDecay();
const afterDecay = global.GAME_STATE.nations.syracuse._ae_score;
assert(Math.abs(afterDecay - 9.7) < 0.01, `decay 0.3: ${afterDecay}`);

// ── T12 ────────────────────────────────────────────
console.log('\nT12: computeWarDeclarationAeCost');
assert(cbMod.computeWarDeclarationAeCost('reconquest') === 5, 'reconquest = 20 × 0.25 = 5');
assert(cbMod.computeWarDeclarationAeCost('punitive') === 0, 'punitive = 0 (справедливая война)');
assert(cbMod.computeWarDeclarationAeCost('territorial_claim') === 20, 'territorial_claim = 20');
assert(cbMod.computeWarDeclarationAeCost(null) === 45, 'unjust = 30 × 1.5 = 45');
assert(cbMod.computeWarDeclarationAeCost('unknown_type') === 45, 'unknown type = unjust cost');

// ── T13 ────────────────────────────────────────────
console.log('\nT13: grantPunitiveCB');
resetGS();
cbMod.grantPunitiveCB('carthage', 'syracuse', 'non_aggression');
const pcb = cbMod.findCB('syracuse', 'carthage', 'punitive');
assert(pcb !== null, 'punitive CB создан у жертвы');
assert(pcb.source === 'automatic', 'source = automatic');

// ── T14 ────────────────────────────────────────────
console.log('\nT14: peace_engine createPeaceOffer / reject');
resetGS();
const offer = peaceMod.createPeaceOffer({
  from: 'carthage', to: 'syracuse',
  demands: [{ type: 'armistice' }, { type: 'reparations_5y' }],
  initiator_ws: 10,
});
assert(offer.status === 'pending', 'status pending');
assert(offer.turn_expires === 10 + 3, 'TTL 3 хода');
assert(global.GAME_STATE.peace_offers.length === 1, '1 offer в очереди');
peaceMod.rejectPeaceOffer(offer.id);
const rejected = global.GAME_STATE.peace_offers.find(o => o.id === offer.id);
assert(rejected.status === 'rejected', 'после reject — status rejected');

// ── T15 ────────────────────────────────────────────
console.log('\nT15: truce');
resetGS();
peaceMod.addTruce('syracuse', 'carthage');
assert(peaceMod.hasActiveTruce('syracuse', 'carthage') === true, 'truce активен');
assert(peaceMod.hasActiveTruce('syracuse', 'rome')     === false, 'truce для другой пары — нет');
global.GAME_STATE.turn = 10 + 70;   // после expiry (60 ходов)
peaceMod.tickTruces();
assert(global.GAME_STATE.truces.length === 0, 'истёкший truce удалён');
assert(peaceMod.hasActiveTruce('syracuse', 'carthage') === false, 'после expiry — нет');

// ── Финальный отчёт ────────────────────────────────
console.log(`\n═══ ${passed} passed / ${failed} failed ═══`);
if (failed > 0) process.exit(1);
