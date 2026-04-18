/**
 * perf/session10_ai.mjs — Session 10 round-robin AI batching measurement.
 *
 * Цель Session 10: раскидать processAINations() по ходам — не обрабатывать
 * ВСЕ tier2+tier3 нации каждый ход, а брать срез BATCH_SIZE per turn по
 * round-robin cursor. Критический путь (warWithPlayer, tier1, hot-nations)
 * игнорирует батч и обрабатывается всегда.
 *
 * Скрипт:
 *   1) Загружает игру в headless Chromium.
 *   2) Прогревает WARMUP ходов (чтобы прогреть кэши дипломатических дистанций
 *      и стабилизировать состояние).
 *   3) Измеряет stand-alone processAINations() ITERS раз → stats.
 *   4) Переключает CONFIG.AI_TURN_BATCH в «infinity» (9999) → батч практически
 *      выключен, вся rotation обрабатывается каждый ход (как до Session 10).
 *   5) Повторяет измерение → stats "before".
 *   6) Печатает сравнение.
 *
 * Запуск:
 *   node perf/session10_ai.mjs
 *   PERF_WARMUP=5 PERF_ITERS=10 PERF_BATCH=50 node perf/session10_ai.mjs
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const WARMUP = Number(process.env.PERF_WARMUP ?? 3);
const ITERS  = Number(process.env.PERF_ITERS  ?? 8);
const BATCH  = Number(process.env.PERF_BATCH  ?? 50);
const REPO   = '/home/user/igra2';

function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    mean: +(sum / sorted.length).toFixed(2),
    p50:  +p(0.5).toFixed(2),
    p95:  +p(0.95).toFixed(2),
    min:  +Math.min(...arr).toFixed(2),
    max:  +Math.max(...arr).toFixed(2),
  };
}

function fmtLine(label, s) {
  const pad = (v, w) => String(v).padStart(w);
  return `  ${label.padEnd(22)} n=${pad(s.n, 2)}  mean=${pad(s.mean, 7)}  p50=${pad(s.p50, 7)}  p95=${pad(s.p95, 7)}  max=${pad(s.max, 7)}`;
}

console.log(`\n⏱  perf/session10_ai.mjs — round-robin AI batching`);
console.log(`   warmup=${WARMUP} turns, iters=${ITERS}, batch=${BATCH}\n`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--allow-file-access-from-files',
  ],
});

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

await ctx.addInitScript(() => {
  const origTime = console.time.bind(console);
  const origTimeEnd = console.timeEnd.bind(console);
  const starts = new Map();
  console.time = (label) => { starts.set(label, performance.now()); origTime(label); };
  console.timeEnd = (label) => {
    const t0 = starts.get(label);
    if (typeof t0 === 'number') {
      const ms = performance.now() - t0;
      starts.delete(label);
      console.log(`[perf-step] ${label}: ${ms.toFixed(2)}ms`);
    }
    try { origTimeEnd(label); } catch (_) {}
  };
});

const page = await ctx.newPage();

await page.route('**/api.groq.com/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait"}' } }] }),
}));
await page.route('**/api.anthropic.com/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ content: [{ text: '{"action":"wait"}' }] }),
}));
await page.route('**/localhost:11434/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ response: '{"action":"wait"}' }),
}));

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

// Прогрев
for (let i = 0; i < WARMUP; i++) {
  await page.evaluate(async () => { if (typeof processTurn === 'function') await processTurn(); });
}

// Структура пулов (для понимания масштаба)
const pools = await page.evaluate(() => {
  const t1 = [], t2 = [], t3 = [];
  for (const [nId, n] of Object.entries(GAME_STATE.nations)) {
    if (n.is_player || n.is_eliminated) continue;
    const tier = typeof getNationTier === 'function' ? getNationTier(nId) : 3;
    if      (tier === 1) t1.push(nId);
    else if (tier === 2) t2.push(nId);
    else                 t3.push(nId);
  }
  return { tier1: t1.length, tier2: t2.length, tier3: t3.length, total: Object.keys(GAME_STATE.nations).length };
});
console.log(`Pools: tier1=${pools.tier1} tier2=${pools.tier2} tier3=${pools.tier3} total=${pools.total}\n`);

// Мерим processAINations() с текущим батчем (Session 10 default = 50)
async function measure(label, batchSize) {
  await page.evaluate((bs) => {
    CONFIG.AI_TURN_BATCH = bs;
    GAME_STATE._aiTurnCursor = 0;
  }, batchSize);

  const samples = [];
  const skipSamples = [];
  for (let i = 0; i < ITERS; i++) {
    const r = await page.evaluate(async () => {
      if (typeof processAINations !== 'function') return { ms: -1, skip: 0 };
      // Захватим «batch_skip» из console.log (последнюю строку [ai_nations])
      const t = performance.now();
      await processAINations();
      const ms = performance.now() - t;
      // Увеличиваем ход вручную чтобы cursor продвинулся (processAINations
      // сам не инкрементирует turn — это делает advanceDate() в processTurn).
      GAME_STATE.turn = (GAME_STATE.turn ?? 1) + 1;
      return { ms, cursor: GAME_STATE._aiTurnCursor ?? 0 };
    });
    if (r.ms >= 0) {
      samples.push(r.ms);
      skipSamples.push(r.cursor);
    }
  }
  return { label, batchSize, samples, skipSamples };
}

// "before" — батч выключен (обрабатываем всех, как до Session 10)
const before = await measure('batch=OFF (Session 9)', 99999);
// "after" — Session 10 batch
const after  = await measure(`batch=${BATCH} (Session 10)`, BATCH);

await browser.close();

const sBefore = stats(before.samples);
const sAfter  = stats(after.samples);
const pct = (a, b) => (((b - a) / a) * 100).toFixed(1);

console.log(`── processAINations() per-call ──`);
console.log(fmtLine(before.label, sBefore));
console.log(fmtLine(after.label,  sAfter));
console.log(`\n  delta mean: ${pct(sBefore.mean, sAfter.mean)}%   p95: ${pct(sBefore.p95, sAfter.p95)}%`);

// Раздельный отчёт по полному ходу (processTurn) — смысл для профайлера
console.log(`\n(для полного per-turn breakdown — node perf/profile.mjs)`);
