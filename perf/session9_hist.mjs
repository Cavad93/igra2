/**
 * perf/session9_hist.mjs — Session 9 ring-buffer measurement.
 *
 * Цель Session 9: ограничить рост журналов (events_log, _turn_summary_history)
 * и зафиксировать эффект на размер save-payload'а и стоимость сериализации.
 *
 * Что мы не можем проверить без LLM:
 *   В headless-прогоне ai/strategic_llm.js не срабатывает (нет API-ключей), поэтому
 *   реальный «утечный» рост events_log в замкнутом тестовом сценарии не
 *   воспроизвести. Подменяем это синтетическим наполнением (как если бы
 *   LLM-тик отработал N раз) — это честно имитирует pathological save.
 *
 * Запуск:
 *   node perf/session9_hist.mjs
 *   PERF_WARMUP=5 PERF_SYNTH=5000 node perf/session9_hist.mjs
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const WARMUP = Number(process.env.PERF_WARMUP ?? 5);
const SYNTH  = Number(process.env.PERF_SYNTH  ?? 5000);
const ITERS  = Number(process.env.PERF_ITERS  ?? 6);
const REPO   = '/home/user/igra2';

function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    mean: +(sum / sorted.length).toFixed(2),
    p50:  +p(0.5).toFixed(2),
    p95:  +p(0.95).toFixed(2),
  };
}

console.log(`\n⏱  perf/session9_hist.mjs — ring-buffer для events_log / _turn_summary_history`);
console.log(`   warmup=${WARMUP} turns, synthetic log entries=${SYNTH}, iters=${ITERS}\n`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--allow-file-access-from-files',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

await page.route('**/api.groq.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait"}' } }] }) }));
await page.route('**/api.anthropic.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ content: [{ text: '{"action":"wait"}' }] }) }));
await page.route('**/localhost:11434/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ response: '{"action":"wait"}' }) }));

page.on('pageerror', e => console.error('[pageerror]', e.message));

await page.goto(`file://${REPO}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  if (typeof CONFIG !== 'undefined') {
    CONFIG.API_KEY = 'sk-ant-mock000000000000000000000000000000000000000';
    CONFIG.GROQ_API_KEY = 'gsk_mock000000000000000000000000000000000000000000';
  }
  window.getAIWarDecision = async () => ({ action: 'defend', reasoning: '[mock]', tactic: 'defensive' });
  window.getGroqDecision = async () => ({ action: 'wait', reasoning: '[mock]' });
  window._callGroqViaWorker = async () => null;
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
});

await page.waitForFunction(() =>
  typeof GAME_STATE !== 'undefined' && GAME_STATE.nations
  && Object.keys(GAME_STATE.nations).length > 5 && GAME_STATE.turn >= 1,
  { timeout: 60000 }
);

for (let i = 0; i < WARMUP; i++) {
  await page.evaluate(async () => { if (typeof processTurn === 'function') await processTurn(); });
}

const result = await page.evaluate(async ({ synth, iters }) => {
  const gs = window.GAME_STATE;
  const cap = window.PERSIST_CAPS ?? { events_log: 500, turn_summary_history: 200 };

  // 1. Имитация неограниченного роста (как если бы ai/strategic_llm.js отработал
  //    без трима много раз). Пишем прямо в events_log, минуя addEventLog.
  if (!Array.isArray(gs.events_log)) gs.events_log = [];
  if (!Array.isArray(gs._turn_summary_history)) gs._turn_summary_history = [];
  for (let i = 0; i < synth; i++) {
    gs.events_log.push({
      tick: gs.turn ?? 0,
      type: 'strategic_plan',
      nationId: 'syracuse',
      strategy: 'consolidation',
      goal: 'mock_goal_for_perf_test',
      phases: 3,
      fallback: false,
    });
    gs._turn_summary_history.push({
      turn: gs.turn ?? 0, date: { year: -301, month: 1 },
      d_treasury: 10, d_pop: 5, d_happiness: 1, d_legit: 0,
      income: 100, expense: 90, regions: 5,
    });
  }

  // 2. Снимаем baseline (до трима): размер payload и длина журналов.
  const buildPayload = () => {
    const senateData = {};
    if (typeof SENATE_MANAGERS === 'object' && SENATE_MANAGERS) {
      for (const [nationId, mgr] of Object.entries(SENATE_MANAGERS)) {
        try { senateData[nationId] = mgr?.toJSON?.() ?? null; } catch (_) {}
      }
    }
    const { _turn_summary_history, _last_turn_snapshot, _pending_char_initiatives, ...base } = gs;
    if (base.events_log?.length > 50) base.events_log = base.events_log.slice(0, 50);
    if (base.nations) {
      const clean = Object.create(null);
      for (const [nId, n] of Object.entries(base.nations)) {
        if (n._ou || n._personalityMatrix) {
          const { _ou, _personalityMatrix, ...stripped } = n;
          clean[nId] = stripped;
        } else {
          clean[nId] = n;
        }
      }
      base.nations = clean;
    }
    return { ...base, _senate: senateData };
  };

  const timeClone = (obj) => {
    const t0 = performance.now();
    const c  = structuredClone(obj);
    const t1 = performance.now();
    if (c?._none === 42) throw new Error('unreachable');
    return t1 - t0;
  };

  const measure = () => {
    const payload = buildPayload();
    const json    = JSON.stringify(payload);
    const bytes   = new TextEncoder().encode(json).byteLength;
    const runtimeJson = JSON.stringify(gs);
    const runtimeBytes = new TextEncoder().encode(runtimeJson).byteLength;
    const clones = [];
    for (let i = 0; i < iters; i++) clones.push(timeClone(payload));
    return {
      events_log_len: gs.events_log.length,
      summary_len:    gs._turn_summary_history.length,
      payload_bytes:  bytes,
      runtime_bytes:  runtimeBytes,
      clones,
    };
  };

  const before = measure();

  // 3. Применяем Session 9 cap — ровно та же функция, что в processTurn().
  if (typeof window._enforcePersistentLogCaps === 'function') {
    window._enforcePersistentLogCaps(gs);
  } else {
    // fallback — ручной трим до задокументированных лимитов
    if (gs.events_log.length > cap.events_log) gs.events_log.length = cap.events_log;
    if (gs._turn_summary_history.length > cap.turn_summary_history) {
      gs._turn_summary_history.splice(0, gs._turn_summary_history.length - cap.turn_summary_history);
    }
  }

  const after = measure();

  return { before, after, cap };
}, { synth: SYNTH, iters: ITERS });

await browser.close();

const { before, after, cap } = result;
const mb = b => (b / 1024 / 1024).toFixed(2);
const pct = (a, b) => (((b - a) / a) * 100).toFixed(1);

const cloneB = stats(before.clones);
const cloneA = stats(after.clones);

console.log(`Caps: events_log=${cap.events_log}, _turn_summary_history=${cap.turn_summary_history}\n`);

console.log(`  events_log.length           ${String(before.events_log_len).padStart(6)}  →  ${String(after.events_log_len).padStart(6)}`);
console.log(`  _turn_summary_history.length${String(before.summary_len).padStart(7)}  →  ${String(after.summary_len).padStart(6)}`);
console.log(`  payload JSON (MB)           ${mb(before.payload_bytes).padStart(6)}  →  ${mb(after.payload_bytes).padStart(6)}  (${pct(before.payload_bytes, after.payload_bytes)}%)`);
console.log(`  runtime GAME_STATE (MB)     ${mb(before.runtime_bytes).padStart(6)}  →  ${mb(after.runtime_bytes).padStart(6)}  (${pct(before.runtime_bytes, after.runtime_bytes)}%)`);
console.log(`  structuredClone mean (ms)   ${String(cloneB.mean).padStart(6)}  →  ${String(cloneA.mean).padStart(6)}  (${pct(cloneB.mean, cloneA.mean)}%)`);
console.log(`  structuredClone p95 (ms)    ${String(cloneB.p95).padStart(6)}  →  ${String(cloneA.p95).padStart(6)}  (${pct(cloneB.p95, cloneA.p95)}%)\n`);
