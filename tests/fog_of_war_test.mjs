// tests/fog_of_war_test.mjs — unit-тест системы fog of war
//
// Проверяет: модель знаний, BFS-расстояние, экспедиции купца,
// шпионаж (подготовка/активация/revert), обработку тиков.
// Без UI, через прямую загрузку ES-модулей.
import { strict as assert } from 'node:assert';

// Mock MAP_REGIONS перед импортом (fog_of_war импортирует map.js).
// Создаём маленькую тестовую карту из 5 регионов-линия:
//   r1 — r2 — r3 — r4 — r5
global.MAP_REGIONS = {
  r1: { connections: ['r2'], mapType: 'Land' },
  r2: { connections: ['r1', 'r3'], mapType: 'Land' },
  r3: { connections: ['r2', 'r4'], mapType: 'Land' },
  r4: { connections: ['r3', 'r5'], mapType: 'Land' },
  r5: { connections: ['r4'], mapType: 'Land' },
};

// Mock addEventLog
global.addEventLog = () => {};

// Инициализация GAME_STATE
function makeGameState() {
  return {
    turn: 1,
    player_nation: 'syracuse',
    nations: {
      syracuse: { name: 'Сиракузы', regions: ['r1'], economy: { treasury: 10000 }, military: {}, population: { total: 100000 } },
      carthage: { name: 'Карфаген', regions: ['r2'], economy: { treasury: 5000 }, military: {}, population: { total: 80000 } },
      rome:     { name: 'Рим',      regions: ['r3'], economy: { treasury: 5000 }, military: {}, population: { total: 100000 } },
      epirus:   { name: 'Эпир',     regions: ['r4'], economy: { treasury: 3000 }, military: {}, population: { total: 40000 } },
      maurya:   { name: 'Маурья',   regions: ['r5'], economy: { treasury: 8000 }, military: {}, population: { total: 200000 } },
    },
    regions: {
      r1: { nation: 'syracuse' },
      r2: { nation: 'carthage' },
      r3: { nation: 'rome' },
      r4: { nation: 'epirus' },
      r5: { nation: 'maurya' },
    },
    diplomacy: { treaties: [], relations: {} },
    expeditions: [],
    rumors: [],
    market: {},
    economy_ext: {},
  };
}

// Mock Math.random для детерминизма.
let _rngCalls = 0;
let _rngSeq = [];
function _setRng(values) { _rngSeq = values; _rngCalls = 0; }
const _realRandom = Math.random;
Math.random = function () {
  if (_rngCalls < _rngSeq.length) return _rngSeq[_rngCalls++];
  return 0.5;
};

// ──────────────────────────────────────────────────────────────
// Загружаем fog_of_war.js
// ──────────────────────────────────────────────────────────────
const fog = await import('../engine/fog_of_war.js');
const {
  FOG_CONFIG,
  initFogOfWar,
  getNationKnownLevel,
  setNationKnownLevel,
  _bfsNationDistance,
  _updateKnownNations,
  sendMerchantExpedition,
  sendSpy,
  processIntelligenceTick,
  shouldShowArmy,
  shouldShowBuildMarker,
} = fog;

// ──────────────────────────────────────────────────────────────
// T1. initFogOfWar создаёт поля
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  delete GAME_STATE.expeditions;
  delete GAME_STATE.rumors;
  initFogOfWar();
  assert.ok(Array.isArray(GAME_STATE.expeditions), 'expeditions[] создан');
  assert.ok(Array.isArray(GAME_STATE.rumors), 'rumors[] создан');
  console.log('✓ T1: initFogOfWar создаёт поля');
}

// ──────────────────────────────────────────────────────────────
// T2. getNationKnownLevel / setNationKnownLevel
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  // Неизвестная нация — уровень 0
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 0, 'default level = 0');

  // Сам о себе — всегда 2
  assert.equal(getNationKnownLevel('syracuse', 'syracuse'), 2, 'self = 2');

  setNationKnownLevel('syracuse', 'maurya', 1);
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 1, 'после set → 1');

  // Только повышение, не понижение
  setNationKnownLevel('syracuse', 'maurya', 0);
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 1, 'не понижается');

  // Принудительное понижение через force
  setNationKnownLevel('syracuse', 'maurya', 0, { force: true });
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 0, 'force понижает');

  console.log('✓ T2: getNationKnownLevel / setNationKnownLevel');
}

// ──────────────────────────────────────────────────────────────
// T3. _bfsNationDistance — расстояние по графу регионов
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  assert.equal(_bfsNationDistance('syracuse', 'syracuse'), 0, 'self = 0');
  assert.equal(_bfsNationDistance('syracuse', 'carthage'), 1, 'сосед = 1');
  assert.equal(_bfsNationDistance('syracuse', 'rome'),     2, 'через 1 = 2');
  assert.equal(_bfsNationDistance('syracuse', 'epirus'),   3, 'через 2 = 3');
  assert.equal(_bfsNationDistance('syracuse', 'maurya'),   4, 'через 3 = 4');
  console.log('✓ T3: BFS дистанция');
}

// ──────────────────────────────────────────────────────────────
// T4. _updateKnownNations: автоматические уровни
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  _updateKnownNations('syracuse');

  // THRESH=3. carthage (dist=1) → known. rome (dist=2) → known. epirus (dist=3) → known.
  // maurya (dist=4) — дальше порога → остался 0.
  assert.equal(getNationKnownLevel('syracuse', 'carthage'), 1, 'carthage dist=1 → level 1');
  assert.equal(getNationKnownLevel('syracuse', 'rome'),     1, 'rome dist=2 → level 1');
  assert.equal(getNationKnownLevel('syracuse', 'epirus'),   1, 'epirus dist=3 → level 1');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'),   0, 'maurya dist=4 > THRESH → 0');

  // Война → level 2 даже для далёкой maurya
  GAME_STATE.nations.syracuse.military = { at_war_with: ['maurya'] };
  _updateKnownNations('syracuse');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 2, 'война → 2');

  // Торговое соглашение → level 1
  GAME_STATE.diplomacy.treaties.push({
    status: 'active', type: 'trade_agreement', parties: ['syracuse', 'maurya'],
  });
  GAME_STATE.nations.syracuse.military = {};
  _updateKnownNations('syracuse');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 2,
               'после войны + торговля — остался 2 (не понижаем)');

  console.log('✓ T4: _updateKnownNations по дистанции/войне/торговле');
}

// ──────────────────────────────────────────────────────────────
// T5. sendMerchantExpedition: успех
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  _setRng([0.99]);  // 0.99 > MERCHANT_FAIL_PROB=0.10 → успех
  const res = sendMerchantExpedition('syracuse', 'maurya');
  assert.equal(res.ok, true, 'экспедиция отправлена');
  assert.equal(GAME_STATE.nations.syracuse.economy.treasury, 10000 - FOG_CONFIG.MERCHANT_COST,
               'казна уменьшилась на стоимость');
  assert.equal(GAME_STATE.expeditions.length, 1, 'создана 1 экспедиция');
  const exp = GAME_STATE.expeditions[0];
  assert.equal(exp.type, 'merchant');
  assert.equal(exp.observerId, 'syracuse');
  assert.equal(exp.targetId, 'maurya');
  // maurya dist=4, duration = 12 + 0*1 = 12
  assert.equal(exp.turns_left, 12, 'базовая длительность 12 ходов');

  // Прогоняем 11 тиков — экспедиция ещё в пути.
  for (let i = 0; i < 11; i++) {
    _setRng([0.99]);  // успех на resolve
    processIntelligenceTick();
  }
  assert.equal(GAME_STATE.expeditions.length, 1, 'после 11 тиков ещё в пути');
  assert.equal(GAME_STATE.expeditions[0].turns_left, 1);

  // 12-й тик — resolve с успехом.
  _setRng([0.99]);
  processIntelligenceTick();
  assert.equal(GAME_STATE.expeditions.length, 0, 'экспедиция завершена');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 1, 'maurya → level 1');

  console.log('✓ T5: купеческая экспедиция успех');
}

// ──────────────────────────────────────────────────────────────
// T6. sendMerchantExpedition: недостаточно денег
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  GAME_STATE.nations.syracuse.economy.treasury = 100;   // < 500
  const res = sendMerchantExpedition('syracuse', 'maurya');
  assert.equal(res.ok, false, 'отказ при недостатке');
  assert.equal(res.reason, 'no_gold');
  assert.equal(GAME_STATE.expeditions.length, 0, 'экспедиция НЕ создана');
  console.log('✓ T6: отказ при недостатке денег');
}

// ──────────────────────────────────────────────────────────────
// T7. sendMerchantExpedition: провал (10%)
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  _setRng([0.99]);
  sendMerchantExpedition('syracuse', 'maurya');
  // Прогоняем 11 — в пути.
  for (let i = 0; i < 11; i++) processIntelligenceTick();
  // 12-й — провал (Math.random() < 0.10)
  _setRng([0.05]);
  processIntelligenceTick();
  assert.equal(GAME_STATE.expeditions.length, 0);
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 0, 'maurya остался 0 (провал)');
  console.log('✓ T7: экспедиция провалилась');
}

// ──────────────────────────────────────────────────────────────
// T8. sendSpy: полный цикл (preparing → active → revert)
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  // Установим частичное знание о цели
  setNationKnownLevel('syracuse', 'maurya', 1);

  _setRng([0.99]);  // успех на подготовке
  const res = sendSpy('syracuse', 'maurya');
  assert.equal(res.ok, true);
  assert.equal(GAME_STATE.nations.syracuse.economy.treasury, 10000 - FOG_CONFIG.SPY_COST);
  assert.equal(GAME_STATE.expeditions[0].status, 'preparing');

  // 3 тика подготовки → активация.
  for (let i = 0; i < 3; i++) {
    _setRng([0.99]);   // не провал
    processIntelligenceTick();
  }
  const spy = GAME_STATE.expeditions[0];
  assert.equal(spy.status, 'active', 'шпион активирован');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 2, 'maurya → full intel');

  // Прогоняем 24 хода active → revert до 1.
  for (let i = 0; i < 24; i++) processIntelligenceTick();
  assert.equal(GAME_STATE.expeditions.length, 0, 'шпион завершён');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 1, 'revert к 1 после завершения');

  console.log('✓ T8: полный цикл шпиона (3 prep + 24 active + revert)');
}

// ──────────────────────────────────────────────────────────────
// T9. sendSpy: провал (30%)
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  GAME_STATE.diplomacy.relations['maurya_syracuse'] = { score: 50 };

  _setRng([0.99]);
  sendSpy('syracuse', 'maurya');
  // 3 тика подготовки; на последнем Math.random() < 0.30 → провал.
  processIntelligenceTick();
  processIntelligenceTick();
  _setRng([0.1]);   // < 0.30 → провал
  processIntelligenceTick();

  assert.equal(GAME_STATE.expeditions.length, 0, 'шпион удалён');
  assert.equal(getNationKnownLevel('syracuse', 'maurya'), 0, 'intel НЕ получен');
  const rel = GAME_STATE.diplomacy.relations['maurya_syracuse'];
  assert.equal(rel.score, 40, 'отношения −10');

  console.log('✓ T9: провал шпиона — штраф отношений −10');
}

// ──────────────────────────────────────────────────────────────
// T10. Лимит 3 активных шпиона
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();
  GAME_STATE.nations.syracuse.economy.treasury = 100000;
  sendSpy('syracuse', 'carthage');
  sendSpy('syracuse', 'rome');
  sendSpy('syracuse', 'epirus');
  const res = sendSpy('syracuse', 'maurya');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'max_spies');
  assert.equal(GAME_STATE.expeditions.length, 3, 'только 3 активных');
  console.log('✓ T10: лимит 3 активных шпиона');
}

// ──────────────────────────────────────────────────────────────
// T11. shouldShowArmy / shouldShowBuildMarker
// ──────────────────────────────────────────────────────────────
{
  global.GAME_STATE = makeGameState();

  // Своя армия — всегда видна
  assert.equal(shouldShowArmy({ nation: 'syracuse' }), true, 'своя армия видна');

  // Чужая при level < 2 — не видна
  setNationKnownLevel('syracuse', 'maurya', 0);
  assert.equal(shouldShowArmy({ nation: 'maurya' }), false, 'terra incognita скрыта');

  setNationKnownLevel('syracuse', 'maurya', 1);
  assert.equal(shouldShowArmy({ nation: 'maurya' }), false, 'level 1 скрыт');

  setNationKnownLevel('syracuse', 'maurya', 2);
  assert.equal(shouldShowArmy({ nation: 'maurya' }), true, 'level 2 виден');

  // Build marker на чужой территории (force: понижаем с 2 до 0 для проверки)
  setNationKnownLevel('syracuse', 'maurya', 0, { force: true });
  assert.equal(shouldShowBuildMarker('r5'), false, 'стройка в maurya скрыта');
  assert.equal(shouldShowBuildMarker('r1'), true, 'свой регион виден');

  console.log('✓ T11: shouldShowArmy / shouldShowBuildMarker');
}

// ──────────────────────────────────────────────────────────────
// ИТОГ
// ──────────────────────────────────────────────────────────────
Math.random = _realRandom;
console.log('\n🎉 Все 11 тестов прошли успешно.');
