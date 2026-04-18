/**
 * perf/session7_save.mjs — Session 7 save-path micro-bench.
 *
 * Замеряет время, которое main-тред блокирует path сохранения:
 *   — Legacy (до Session 7): JSON.stringify(payload) + new TextEncoder().encode(json).buffer
 *   — Session 7:              structuredClone(payload)  (равно цене structured-clone в postMessage)
 *
 * Почему именно эти два замера: worker.postMessage(obj) выполняет structured
 * clone в синхронной фазе на стороне отправителя — этот клон и блокирует
 * main-тред. До Session 7 main-тред тратил время на stringify+encode
 * (и передавал готовый ArrayBuffer без клонирования), с Session 7 — только
 * на structured clone. Сравнение честное: обе операции измеряем после
 * одного и того же _buildSavePayload().
 *
 * Запуск:
 *   node perf/session7_save.mjs
 *   PERF_ITERS=10 node perf/session7_save.mjs
 *   PERF_WARMUP_TURNS=3 node perf/session7_save.mjs   # чтобы state «остыл»
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const ITERS = Number(process.env.PERF_ITERS ?? 8);
const WARMUP_TURNS = Number(process.env.PERF_WARMUP_TURNS ?? 2);
const REPO = '/home/user/igra2';

function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    mean: +(sum / sorted.length).toFixed(2),
    p50: +p(0.5).toFixed(2),
    p95: +p(0.95).toFixed(2),
    min: +sorted[0].toFixed(2),
    max: +sorted[sorted.length - 1].toFixed(2),
  };
}

console.log(`\n⏱  perf/session7_save.mjs — save-path micro-bench (${ITERS} iters, warmup ${WARMUP_TURNS} turns)\n`);

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
  window.fetchGroq = async () => ({ choices: [{ message: { content: '{"action":"wait"}' } }] });
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
});

await page.waitForFunction(() =>
  typeof GAME_STATE !== 'undefined' && GAME_STATE.nations
  && Object.keys(GAME_STATE.nations).length > 5 && GAME_STATE.turn >= 1,
  { timeout: 60000 }
);

// Прогреваем state несколькими ходами, чтобы payload был реалистично заполнен
for (let i = 0; i < WARMUP_TURNS; i++) {
  await page.evaluate(async () => { if (typeof processTurn === 'function') await processTurn(); });
}

const result = await page.evaluate(async (iters) => {
  // Строим payload тем же способом, что и engine/save.js (_buildSavePayload недоступен
  // снаружи модуля, поэтому повторяем минимально, не влияя на продакшн-путь).
  const senateData = {};
  if (typeof SENATE_MANAGERS === 'object' && SENATE_MANAGERS) {
    for (const [nationId, mgr] of Object.entries(SENATE_MANAGERS)) {
      try { senateData[nationId] = mgr?.toJSON?.() ?? null; } catch (_) {}
    }
  }
  const { _turn_summary_history, _last_turn_snapshot, _pending_char_initiatives, ...base } = GAME_STATE;
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
  const payload = { ...base, _senate: senateData };

  // Приблизительный размер (один раз) — стоимость stringify уже замерена отдельно.
  let jsonBytes = 0;
  try {
    const probe = JSON.stringify(payload);
    jsonBytes = new TextEncoder().encode(probe).byteLength;
  } catch (_) {}

  const legacy = [];   // JSON.stringify + TextEncoder().encode()
  const s7     = [];   // structuredClone()
  for (let i = 0; i < iters; i++) {
    // Легаси-путь
    const a0 = performance.now();
    const json = JSON.stringify(payload);
    const buf  = new TextEncoder().encode(json).buffer;
    const a1 = performance.now();
    legacy.push(a1 - a0);
    // «Потрогать» buf, чтобы JIT не выбросил
    if (buf.byteLength < 0) throw new Error('unreachable');

    // Session 7 путь — structured clone, как в postMessage(obj)
    const b0 = performance.now();
    const cloned = structuredClone(payload);
    const b1 = performance.now();
    s7.push(b1 - b0);
    if (cloned._none === 42) throw new Error('unreachable');
  }
  return { legacy, s7, jsonBytes, nations: Object.keys(payload.nations ?? {}).length };
}, ITERS);

await browser.close();

const legacyStats = stats(result.legacy);
const s7Stats     = stats(result.s7);
const deltaMean   = ((s7Stats.mean - legacyStats.mean) / legacyStats.mean * 100).toFixed(1);
const deltaP95    = ((s7Stats.p95  - legacyStats.p95)  / legacyStats.p95  * 100).toFixed(1);

const fmt = s => `n=${s.n}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}  min=${String(s.min).padStart(8)}  max=${String(s.max).padStart(8)}`;

console.log(`Payload: ~${(result.jsonBytes / 1024 / 1024).toFixed(2)} MB (JSON), ${result.nations} наций\n`);
console.log(`  Legacy  (stringify+encode) ${fmt(legacyStats)}`);
console.log(`  Session7 (structuredClone) ${fmt(s7Stats)}`);
console.log(`\n  Δ mean: ${deltaMean}%   Δ p95: ${deltaP95}%`);
console.log();
