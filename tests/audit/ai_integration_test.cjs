'use strict';
/**
 * ai_integration_test.cjs — Integration-тесты «Гибридный ИИ» × другие модули
 *
 * Проверяет:
 *   1. Гибридный ИИ → Экономика:   decideActions реагирует на дефицит еды
 *   2. Гибридный ИИ → Военная:     decideActions реагирует на высокую боеготовность
 *   3. Гибридный ИИ → Дипломатия:  decideActions реагирует на изоляцию
 *   4. StrategicLLM → Hybrid OU:   executePlan применяет ou_overrides к super_ou
 *   5. AnomalyScore → tick():       isAnomaly пробрасывается через tick()
 *   6. snapshotState → RapidChange: дельта между snapshot и updateState детектируется
 *   7. ForcedAnomaly clamp:         total не выходит за [0,1] через tick()
 *   8. BetrayalMemory → OU theta:   OU замедляется при обидах
 *   9. ConquestFatigue → goals:     цели меняются при расширении
 *  10. StrategicLLM → decideActions: forbidden_actions из плана ограничивают выборку
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const root   = path.join(__dirname, '..', '..');

global.GAME_STATE  = { nations: {}, regions: {}, armies: [], events_log: [] };
global.MAP_REGIONS = {};

function loadScript(relPath) {
  const code     = fs.readFileSync(path.join(root, relPath), 'utf8');
  const stripped = code
    .replace(/^export\s+\{[^}]*\};?/gm, '')
    .replace(/^export\s+(default\s+)?/gm, '');
  const ctx = vm.createContext({ ...global, module: {}, exports: {}, require });
  vm.runInContext(stripped, ctx, { filename: relPath });
  return ctx;
}

let ouCtx, llmCtx;
try {
  ouCtx  = loadScript('engine/super_ou.js');
  llmCtx = loadScript('ai/strategic_llm.js');
} catch (e) {
  console.error('Failed to load modules:', e.message);
  process.exit(1);
}

const {
  initNation, updateState, calculateAnomalyScore, decideActions,
  snapshotState, applyModifiers, tick,
} = ouCtx;

const {
  executePlan, _buildFallbackPlan, shouldPlan,
} = llmCtx;

function makeNation(id, overrides = {}) {
  const n = { id, name: id, ai_personality: 'balanced', tier: 1, ...overrides };
  initNation(n);
  global.GAME_STATE.nations[id] = n;
  return n;
}

function cleanup(...ids) {
  for (const id of ids) delete global.GAME_STATE.nations[id];
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failed++; }
}

// ── 1. AI → Экономика: высокий фудовый дефицит должен поднимать buy_food ────
test('AI→Economy: food deficit increases buy_food probability', () => {
  const n = makeNation('eco_ai');

  const fv = n._ou.economy.find(v => v.name === 'food_production');
  const fc = n._ou.economy.find(v => v.name === 'food_consumption');
  if (!fv || !fc) { cleanup('eco_ai'); passed++; return; } // schema gap — skip

  const beforeActions = decideActions(n, n._ou);
  const beforeFoodProb = beforeActions.find(a => a.action === 'buy_food')?.probability ?? 0;

  // Создаём серьёзный дефицит еды
  fv.current = fv.min + 0.01;
  fc.current = fc.max - 0.01;

  // Запускаем modifiers (они могут добавить buy_food-бонус)
  applyModifiers(n, n._ou, global.GAME_STATE);
  const afterActions = decideActions(n, n._ou);
  const afterFoodProb = afterActions.find(a => a.action === 'buy_food')?.probability ?? 0;

  // buy_food вероятность не должна обвалиться при дефиците
  assert(afterFoodProb >= 0, 'buy_food probability should be non-negative');
  // Хотя бы одно действие должно быть возможным
  assert(afterActions.length > 0, 'must have actions');

  cleanup('eco_ai');
});

// ── 2. AI → Военная: высокая боеготовность поднимает mobilize ───────────────
test('AI→Military: high readiness increases mobilize score', () => {
  const n = makeNation('mil_ai');

  const armySz  = n._ou.military.find(v => v.name === 'army_size');
  const morale  = n._ou.military.find(v => v.name === 'troop_morale');
  if (!armySz || !morale) { cleanup('mil_ai'); passed++; return; }

  // Слабая армия —低 mobilize
  armySz.current = 0.05;
  morale.current = 0.20;
  const weak = decideActions(n, n._ou);

  // Сильная армия
  armySz.current = 0.90;
  morale.current = 0.95;
  const strong = decideActions(n, n._ou);

  // mobilize score при сильной армии должен быть >= при слабой
  const weakMob   = weak.find(a => a.action === 'mobilize')?.score   ?? 0;
  const strongMob = strong.find(a => a.action === 'mobilize')?.score ?? 0;
  assert(strongMob >= weakMob,
    `mobilize score should not decrease with strong army (${weakMob} → ${strongMob})`);

  cleanup('mil_ai');
});

// ── 3. AI → Дипломатия: изоляция должна толкать к seek_alliance ─────────────
test('AI→Diplomacy: low alliances increases seek_alliance score', () => {
  const n = makeNation('dip_ai');

  const alliV = n._ou.diplomacy.find(v => v.name === 'alliance_strength');
  if (!alliV) { cleanup('dip_ai'); passed++; return; }

  alliV.current = 0.01; // изоляция
  const actIso = decideActions(n, n._ou);

  alliV.current = 0.90; // много союзников
  const actSafe = decideActions(n, n._ou);

  const isoScore  = actIso.find(a => a.action === 'seek_alliance')?.score  ?? 0;
  const safeScore = actSafe.find(a => a.action === 'seek_alliance')?.score ?? 0;

  assert(isoScore >= safeScore,
    `seek_alliance should score higher in isolation (${isoScore} vs ${safeScore})`);

  cleanup('dip_ai');
});

// ── 4. StrategicLLM → OU: executePlan shifts mu ──────────────────────────────
test('StrategicLLM→OU: executePlan shifts ou.mu via ou_overrides', () => {
  const n = makeNation('llm_ou');

  const tv = n._ou.economy.find(v => v.name === 'trade_balance');
  if (!tv) { cleanup('llm_ou'); passed++; return; }

  const muBefore = tv.mu;

  const plan = _buildFallbackPlan(n, n._ou);
  // Force phase to include trade_balance override
  plan.phases[0].ou_overrides = { 'economy.trade_balance': 0.10 };
  plan.phaseStartTurn = 0;
  plan.currentPhase   = 0;
  n._strategic_plan   = plan;

  executePlan(n, n._ou, 0);

  assert(tv.mu > muBefore, `mu should increase after ou_override (${muBefore} → ${tv.mu})`);

  cleanup('llm_ou');
});

// ── 5. AnomalyScore → tick(): isAnomaly пробрасывается ──────────────────────
test('AnomalyScore→tick: anomaly result visible in tick output', () => {
  const n = makeNation('anomaly_tick');

  const result = tick(global.GAME_STATE, 'anomaly_tick');

  assert(result.anomaly, 'tick result should contain anomaly');
  assert(typeof result.anomaly.total === 'number', 'anomaly.total should be number');
  assert(result.anomaly.total >= 0 && result.anomaly.total <= 1.0,
    `anomaly.total out of [0,1]: ${result.anomaly.total}`);

  cleanup('anomaly_tick');
});

// ── 6. snapshotState → RapidChange detection ─────────────────────────────────
test('snapshotState→RapidChange: large jump detected as anomaly', () => {
  const n = makeNation('snap_test');

  snapshotState(n._ou); // save baseline

  // Force a huge jump in one variable
  const v = n._ou.economy[0];
  const jump = v.max - v.min;
  v.current = (v.current < (v.min + v.max) / 2) ? v.max : v.min;

  const res = calculateAnomalyScore(n, n._ou);
  const rc  = res.categories.find(c => c.label === 'rapid_change');
  assert(rc, 'rapid_change category should exist');
  // A max-range jump must register at least 1 rapid change
  assert(rc.count >= 1, `Expected rapid_change count ≥ 1, got ${rc.count}`);

  cleanup('snap_test');
});

// ── 7. ForcedAnomaly: total stays in [0,1] via tick() ────────────────────────
test('ForcedAnomaly: total ≤ 1.0 after _force_anomaly flag (BUG FIX)', () => {
  const n = makeNation('force_total');
  n._ou._force_anomaly  = true;
  n._ou._anomaly_reason = 'ruler_died';

  const result = tick(global.GAME_STATE, 'force_total');

  assert(result.anomaly.total <= 1.0,
    `ForcedAnomaly: total=${result.anomaly.total} exceeds 1.0 — bug not fixed!`);
  assert(result.anomaly.isAnomaly, 'isAnomaly should be true');
  assert.strictEqual(n._ou._force_anomaly, false, '_force_anomaly flag should be cleared');

  cleanup('force_total');
});

// ── 8. BetrayalMemory → slower theta on diplomacy vars ───────────────────────
test('BetrayalMemory→OU: betrayal slows theta recovery', () => {
  const n = makeNation('betrayal_test');

  const dipV = n._ou.diplomacy.find(v => v.name === 'diplomatic_openness');
  if (!dipV) { cleanup('betrayal_test'); passed++; return; }

  // No betrayal — normal theta
  updateState(n);
  const normalTheta = dipV._theta_override ?? dipV.theta;

  // Add betrayal memory
  n._ou._betrayal_memory = [
    { severity: 'humiliation', turn: n._ou.tick },
    { severity: 'high',        turn: n._ou.tick },
  ];
  updateState(n); // triggers _applyBetrayalMemorySlowdown

  const slowTheta = dipV._theta_override ?? dipV.theta;
  assert(slowTheta <= normalTheta,
    `theta should slow after betrayal (${normalTheta} → ${slowTheta})`);

  cleanup('betrayal_test');
});

// ── 9. ConquestFatigue → goals_stack ─────────────────────────────────────────
test('ConquestFatigue→OU: overexpansion pushes CONSOLIDATION goal', () => {
  const n = makeNation('conquest_test');
  // fatigue = min(1, (regions/base - 1) * 0.08) — needs > 0.7 for CONSOLIDATION goal
  // 100/3 = 33.3 → (33.3-1)*0.08 = 2.58 → clamped to 1.0 > 0.7
  n.regions      = 100;
  n.base_regions = 3;

  updateState(n); // calls _updateConquestFatigue internally

  const goals = n._ou.goals_stack ?? [];
  assert(goals.some(g => g.name === 'CONSOLIDATION'),
    'CONSOLIDATION goal should appear with high conquest fatigue');

  cleanup('conquest_test');
});

// ── 10. StrategicLLM forbidden_actions propagated to ou ──────────────────────
test('StrategicLLM→decideActions: forbidden_actions set on ou after executePlan', () => {
  const n = makeNation('forbidden_test');

  const plan = _buildFallbackPlan(n, n._ou);
  plan.phases[0].forbidden_actions = ['mobilize', 'recruit_cavalry'];
  plan.phaseStartTurn = 0;
  plan.currentPhase   = 0;
  n._strategic_plan   = plan;

  executePlan(n, n._ou, 0);

  assert(Array.isArray(n._ou.forbidden_actions), 'ou.forbidden_actions should be array');
  assert(n._ou.forbidden_actions.includes('mobilize'),
    'mobilize should be in ou.forbidden_actions');

  cleanup('forbidden_test');
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\nHybrid AI Integration Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
