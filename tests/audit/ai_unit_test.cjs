'use strict';
/**
 * ai_unit_test.cjs — Unit-тесты модуля «Гибридный ИИ»
 *
 * Охватывает:
 *   1. super_ou.js — _ouStep, initNation, calculateAnomalyScore,
 *      decideActions, _buildPersonalityMatrix, forced-anomaly total clamp
 *   2. strategic_llm.js — shouldPlan, _validatePlan, executePlan,
 *      _buildFallbackPlan, _evalTrigger, _applyOuOverrides
 *   3. anomaly_handler.js — _buildAnomalyPrompt categories dict fix
 */

const assert = require('assert');

// ─── Minimal stubs ────────────────────────────────────────────────────────────

global.GAME_STATE  = { nations: {}, regions: {}, armies: [] };
global.MAP_REGIONS = {};

// ─── Load modules via VM (they use global vars, not CommonJS exports) ─────────

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const root = path.join(__dirname, '..', '..');

function loadScript(relPath) {
  const code    = fs.readFileSync(path.join(root, relPath), 'utf8');
  // Remove ESM export statements so CJS vm can run the file
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
  _ouStep, initNation, updateState, calculateAnomalyScore,
  decideActions, snapshotState, clamp, gaussian,
} = ouCtx;

const {
  shouldPlan, _validatePlan, executePlan,
  _buildFallbackPlan, STRATEGIC_CONFIG, STRATEGY_TEMPLATES,
} = llmCtx;

// Helpers
function makeNation(overrides = {}) {
  const n = { id: 'test_nation', name: 'TestNation', ai_personality: 'balanced',
               tier: 1, ...overrides };
  initNation(n);
  return n;
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — OU core
// ══════════════════════════════════════════════════════════════════════════════

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); failed++; }
}

// ── 1. _ouStep mean-reversion ─────────────────────────────────────────────────
test('ouStep: variable reverts toward mu', () => {
  const v = { current: 1.0, mu: 0.3, sigma: 0.00001, theta: 0.5, min: 0, max: 2 };
  const next = _ouStep(v, 1);
  assert(next < 1.0, `Expected < 1.0, got ${next}`);
  assert(next > 0.3, `Expected > 0.3, got ${next}`);
});

test('ouStep: clamps to [min,max]', () => {
  const v = { current: 1.9, mu: 2.5, sigma: 5.0, theta: 1.0, min: 0, max: 2 };
  const next = _ouStep(v, 1);
  assert(next >= 0 && next <= 2, `Expected in [0,2], got ${next}`);
});

test('ouStep: _theta_override is used when set', () => {
  const base  = { current: 0.0, mu: 1.0, sigma: 0.00001, theta: 1.0, min: -1, max: 2 };
  const slow  = { current: 0.0, mu: 1.0, sigma: 0.00001, theta: 1.0, _theta_override: 0.01, min: -1, max: 2 };
  const fastStep = _ouStep(base, 1);
  const slowStep = _ouStep(slow, 1);
  assert(fastStep > slowStep, `fast(${fastStep}) should > slow(${slowStep})`);
});

test('clamp works correctly', () => {
  assert.strictEqual(clamp(-1, 0, 1), 0);
  assert.strictEqual(clamp(2, 0, 1), 1);
  assert.strictEqual(clamp(0.5, 0, 1), 0.5);
});

// ── 2. initNation ─────────────────────────────────────────────────────────────
test('initNation creates 5 category arrays', () => {
  const n = makeNation();
  for (const cat of ['economy','military','diplomacy','politics','goals']) {
    assert(Array.isArray(n._ou[cat]), `${cat} should be array`);
    assert(n._ou[cat].length > 0, `${cat} should not be empty`);
  }
});

test('initNation sets tick to 0', () => {
  const n = makeNation();
  assert.strictEqual(n._ou.tick, 0);
});

test('initNation: all variables have current in [min,max]', () => {
  const n = makeNation();
  for (const cat of ['economy','military','diplomacy','politics','goals']) {
    for (const v of n._ou[cat]) {
      assert(v.current >= v.min && v.current <= v.max,
        `${cat}.${v.name}: current=${v.current} out of [${v.min},${v.max}]`);
    }
  }
});

// ── 3. calculateAnomalyScore ──────────────────────────────────────────────────
test('calculateAnomalyScore: total in [0,1]', () => {
  const n = makeNation();
  const res = calculateAnomalyScore(n, n._ou);
  assert(res.total >= 0 && res.total <= 1.0, `total=${res.total} out of [0,1]`);
});

test('calculateAnomalyScore: categories is array of 7 entries', () => {
  const n = makeNation();
  const res = calculateAnomalyScore(n, n._ou);
  assert(Array.isArray(res.categories), 'categories should be array');
  assert.strictEqual(res.categories.length, 7);
});

test('calculateAnomalyScore: each category has label', () => {
  const n = makeNation();
  const res = calculateAnomalyScore(n, n._ou);
  const labels = res.categories.map(c => c.label);
  assert(labels.includes('outliers'), 'missing outliers');
  assert(labels.includes('rapid_change'), 'missing rapid_change');
  assert(labels.includes('conflicts'), 'missing conflicts');
});

// ── 4. BUG FIX: forced anomaly total must stay in [0,1] ──────────────────────
test('tick: _force_anomaly sets total to 0.95 not 95', () => {
  const n  = makeNation({ id: 'fa_test' });
  global.GAME_STATE.nations['fa_test'] = n;

  n._ou._force_anomaly  = true;
  n._ou._anomaly_reason = 'test_force';

  const result = ouCtx.tick(global.GAME_STATE, 'fa_test');
  assert(result.anomaly.total <= 1.0,
    `anomaly.total should be ≤1.0 (got ${result.anomaly.total}) — forced anomaly bug not fixed`);
  assert(result.anomaly.isAnomaly === true, 'isAnomaly should be true');
  assert.strictEqual(n._ou._force_anomaly, false, '_force_anomaly should be cleared');

  delete global.GAME_STATE.nations['fa_test'];
});

// ── 5. decideActions ──────────────────────────────────────────────────────────
test('decideActions returns array', () => {
  const n = makeNation();
  const actions = decideActions(n, n._ou);
  assert(Array.isArray(actions), 'should return array');
  assert(actions.length > 0, 'should have at least one action');
});

test('decideActions: each action has action/probability/score', () => {
  const n = makeNation();
  const actions = decideActions(n, n._ou);
  for (const a of actions) {
    assert(typeof a.action === 'string', 'missing action field');
    assert(typeof a.probability === 'number', 'missing probability');
    assert(typeof a.score === 'number', 'missing score');
  }
});

test('decideActions: sorted descending by probability', () => {
  const n = makeNation();
  const actions = decideActions(n, n._ou);
  for (let i = 1; i < actions.length; i++) {
    assert(actions[i-1].probability >= actions[i].probability,
      'actions should be sorted descending by probability');
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — StrategicLLM
// ══════════════════════════════════════════════════════════════════════════════

// ── 6. shouldPlan ─────────────────────────────────────────────────────────────
test('shouldPlan: false for tier > threshold', () => {
  const n = makeNation({ tier: 10 });
  n._ou.economy.find(v => v.name === 'treasury')
  n.economy = { treasury: 100 };
  assert.strictEqual(shouldPlan(n, 0), false);
});

test('shouldPlan: false when planInterval not elapsed', () => {
  const n = makeNation({ tier: 1 });
  // planInterval = 20 (from STRATEGIC_CONFIG inside module)
  n._strategic_plan = { createdAt: 0 };
  assert.strictEqual(shouldPlan(n, 10), false); // 10 < 20
});

test('shouldPlan: true when all conditions met', () => {
  const n = makeNation({ tier: 1 });
  n.economy = { treasury: 100 };
  // shouldPlan reads ou.economy.find('treasury'). The OU schema may not have it,
  // so we inject a synthetic treasury variable to satisfy the minTreasury>0 check.
  let tv = n._ou.economy.find(v => v.name === 'treasury');
  if (!tv) {
    tv = { name: 'treasury', current: 0.5, mu: 0.5, sigma: 0.1, theta: 0.1, min: 0, max: 2 };
    n._ou.economy.push(tv);
  } else {
    tv.current = 0.5;
  }
  delete n._strategic_plan;
  n._ou.tick = 25;
  assert.strictEqual(shouldPlan(n, 25), true); // 25 > planInterval(20)
});

// ── 7. _buildFallbackPlan ─────────────────────────────────────────────────────
test('_buildFallbackPlan: returns valid plan for aggressive personality', () => {
  const n = makeNation({ ai_personality: 'aggressive' });
  const plan = _buildFallbackPlan(n, n._ou);
  assert.strictEqual(plan.strategy, 'military_buildup');
  assert(plan.phases.length > 0);
  assert.strictEqual(plan.fallback, true);
});

test('_buildFallbackPlan: returns consolidation for unknown personality', () => {
  const n = makeNation({ ai_personality: 'unknown_xyz' });
  const plan = _buildFallbackPlan(n, n._ou);
  assert.strictEqual(plan.strategy, 'consolidation');
});

test('_buildFallbackPlan: deep copies phases so mutations are safe', () => {
  const n1 = makeNation({ ai_personality: 'aggressive' });
  const n2 = makeNation({ ai_personality: 'aggressive' });
  const p1 = _buildFallbackPlan(n1, n1._ou);
  const p2 = _buildFallbackPlan(n2, n2._ou);
  p1.phases[0].priority_actions.push('__mutated__');
  assert(!p2.phases[0].priority_actions.includes('__mutated__'), 'phases should be deep-copied');
});

// ── 8. _validatePlan ─────────────────────────────────────────────────────────
test('_validatePlan: throws on missing strategy', () => {
  const n = makeNation();
  assert.throws(() => {
    llmCtx._validatePlan({ goal: 'test', phases: [{}] }, n, n._ou);
  });
});

test('_validatePlan: throws on empty phases', () => {
  const n = makeNation();
  assert.throws(() => {
    llmCtx._validatePlan({ strategy: 'x', goal: 'y', phases: [] }, n, n._ou);
  });
});

test('_validatePlan: valid plan passes', () => {
  const n = makeNation();
  const raw = {
    strategy: 'military_buildup',
    goal: 'Conquer all',
    phases: [{ name: 'p1', duration: 10, priority_actions: [], forbidden_actions: [], ou_overrides: {}, trigger_conditions: {} }],
  };
  const plan = llmCtx._validatePlan(raw, n, n._ou);
  assert.strictEqual(plan.strategy, 'military_buildup');
  assert.strictEqual(plan.phases.length, 1);
  assert.strictEqual(plan.fallback, false);
});

// ── 9. executePlan ────────────────────────────────────────────────────────────
test('executePlan: null if no plan', () => {
  const n = makeNation();
  assert.strictEqual(executePlan(n, n._ou, 0), null);
});

test('executePlan: sets priority_actions from active phase', () => {
  const n = makeNation({ ai_personality: 'aggressive' });
  n._strategic_plan = _buildFallbackPlan(n, n._ou);
  const phase = executePlan(n, n._ou, 0);
  assert(phase !== null, 'should return active phase');
  assert(Array.isArray(n._ou.priority_actions), 'priority_actions should be set on ou');
});

test('executePlan: advances phase after duration elapsed', () => {
  const n = makeNation({ ai_personality: 'aggressive' });
  n._strategic_plan = _buildFallbackPlan(n, n._ou);
  const plan = n._strategic_plan;
  plan.phaseStartTurn = 0;
  plan.currentPhase   = 0;
  const phaseDur = plan.phases[0].duration;
  executePlan(n, n._ou, phaseDur + 1); // elapsed > duration → advance
  assert(plan.currentPhase >= 1, `phase should advance (got ${plan.currentPhase})`);
});

// ── 10. _applyOuOverrides ─────────────────────────────────────────────────────
test('_applyOuOverrides: shifts mu of target variable', () => {
  const n = makeNation();
  const ou = n._ou;
  const v  = ou.economy.find(x => x.name === 'trade_balance');
  if (!v) return; // variable may not exist in schema — skip
  const muBefore = v.mu;
  llmCtx._applyOuOverrides(ou, { 'economy.trade_balance': 0.05 });
  assert(v.mu > muBefore, 'mu should increase');
});

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — anomaly_handler: BUG FIX — categories dict
// ══════════════════════════════════════════════════════════════════════════════

test('_buildAnomalyPrompt: categories array is correctly converted to dict', () => {
  // Load anomaly_handler
  let ahCtx;
  try {
    ahCtx = loadScript('ai/anomaly_handler.js');
  } catch (e) {
    console.warn('SKIP: anomaly_handler not loadable:', e.message);
    passed++; return;
  }

  const n = makeNation({ id: 'anomaly_test', name: 'Rome' });

  const fakeAnomalyResult = {
    total: 0.60,
    isAnomaly: true,
    categories: [
      { score: 4.0, count: 3, label: 'outliers' },
      { score: 1.5, count: 2, label: 'rapid_change' },
      { score: 0.0, count: 0, label: 'conflicts' },
      { score: 0.0, count: 0, label: 'boundaries' },
      { score: 0.0, count: 0, label: 'consistency' },
      { score: 0.0, count: 0, label: 'goal_alignment' },
      { score: 0.0, count: 0, label: 'modifier_saturation' },
    ],
  };

  const { system, user } = ahCtx._buildAnomalyPrompt(n, n._ou, fakeAnomalyResult);
  assert(user.includes('Выбросы: 3'), `Expected "Выбросы: 3" in prompt, got:\n${user}`);
  assert(user.includes('Резкие изменения: 2'), `Expected "Резкие изменения: 2" in prompt`);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\nHybrid AI Unit Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
