/**
 * perf/session28_diag.mjs — диагностика turn-10 spike.
 *
 * Оборачивает ключевые economy-функции в console.time/timeEnd перед
 * запуском 10 ходов и печатает разбивку по ТИКАМ (не агрегировано) —
 * чтобы увидеть какая именно функция раздувает 10-й тик.
 *
 * Запуск: node perf/session28_diag.mjs
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';
const TURNS = 10;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
         '--disable-gpu', '--allow-file-access-from-files'],
});

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

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

// Оборачиваем hot-функции экономики в timing-wrappers на window.
await page.evaluate(() => {
  const HOT_FNS = [
    'runEconomyExtTick',
    '_ecoExtRecordTradeHistory',
    'detectMonopolies',
    'updateRegionSpecialization',
    'updateInflation',
    'updateEconomicCycle',
    'updateArmyFunding',
    'updateTechDrift',
    'calcTradeBalance',
    'applyBuildingAdaptiveBehavior',
  ];
  window.__perfTimings = {};
  for (const name of HOT_FNS) {
    const orig = window[name];
    if (typeof orig !== 'function') continue;
    window.__perfTimings[name] = [];
    window[name] = function (...args) {
      const t0 = performance.now();
      const r = orig.apply(this, args);
      window.__perfTimings[name].push(performance.now() - t0);
      return r;
    };
  }
});

const turnSnapshots = [];
for (let i = 0; i < TURNS; i++) {
  // Сбрасываем массивы перед тиком
  await page.evaluate(() => {
    for (const k of Object.keys(window.__perfTimings)) window.__perfTimings[k] = [];
  });
  const ms = await page.evaluate(async () => {
    const t = performance.now();
    await processTurn();
    return performance.now() - t;
  });
  const perFn = await page.evaluate(() => {
    const out = {};
    for (const [k, arr] of Object.entries(window.__perfTimings)) {
      const sum = arr.reduce((a, b) => a + b, 0);
      out[k] = +sum.toFixed(1);
    }
    return out;
  });
  turnSnapshots.push({ turn: i + 1, totalMs: +ms.toFixed(0), perFn });
  console.log(`\n── Ход ${i + 1}: ${ms.toFixed(0)}ms ──`);
  const entries = Object.entries(perFn).sort((a, b) => b[1] - a[1]);
  for (const [name, t] of entries) {
    if (t >= 10) console.log(`  ${name.padEnd(35)} ${t.toFixed(1)}ms`);
  }
}

await browser.close();

console.log(`\n── Раскладка по тикам (top-5 функций) ──`);
const allFns = new Set();
for (const s of turnSnapshots) for (const k of Object.keys(s.perFn)) allFns.add(k);
const fnTotals = [...allFns].map(k => ({
  name: k,
  total: turnSnapshots.reduce((s, x) => s + (x.perFn[k] || 0), 0),
  perTurn: turnSnapshots.map(x => +(x.perFn[k] || 0).toFixed(0)),
}));
fnTotals.sort((a, b) => b.total - a.total);
for (const f of fnTotals.slice(0, 8)) {
  console.log(`  ${f.name.padEnd(35)} total=${f.total.toFixed(0)}ms  perTurn=[${f.perTurn.join(', ')}]`);
}
