/**
 * perf/session19_render_split.mjs — Session 19 micro-bench.
 *
 * Измеряет эффект разделения `renderAll()` на critical/deferred:
 *   - до Session 19: renderAll() выполнял все 14+ sub-renders синхронно.
 *   - после: renderCritical() синхронно, renderDeferred() — через
 *     requestIdleCallback (timeout 200 ms).
 *
 * Сценарии:
 *   A (total):    renderCritical() + renderDeferred() — имитация старого пути.
 *   B (critical): renderCritical() — что фактически блокирует input-handler.
 *   D (deferred): renderDeferred() — сколько работы ушло в idle.
 *
 * Ожидание:
 *   B.mean << A.mean; экономия на каждый UI-клик = B − A (отрицательная дельта).
 *   Deferred работа сохраняется, но она идёт в idle-callback, то есть не
 *   блокирует paint'а следующего кадра.
 *
 * Запуск: `node perf/session19_render_split.mjs`.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';
const RUNS = 30;

function p(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    n: arr.length,
    mean: +(sum / arr.length).toFixed(3),
    p50:  +p(arr, 0.5).toFixed(3),
    p95:  +p(arr, 0.95).toFixed(3),
    min:  +Math.min(...arr).toFixed(3),
    max:  +Math.max(...arr).toFixed(3),
  };
}
function row(label, s) {
  return `  ${label.padEnd(42)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}  max=${String(s.max).padStart(8)}`;
}

console.log(`\n⏱  perf/session19_render_split.mjs — renderAll() split (A/B/D)\n`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--allow-file-access-from-files',
    '--ignore-certificate-errors',
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  ignoreHTTPSErrors: true,
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
  window.getAIWarDecision = async () => ({ action: 'defend', reasoning: '[mock]' });
  window.getGroqDecision  = async () => ({ action: 'wait', reasoning: '[mock]' });
  window._callGroqViaWorker = async () => null;
  window.fetchGroq = async () => ({ choices: [{ message: { content: '{"action":"wait"}' } }] });
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
});
await page.waitForFunction(() =>
  typeof GAME_STATE !== 'undefined' && GAME_STATE.nations
  && Object.keys(GAME_STATE.nations).length > 5 && GAME_STATE.turn >= 1,
  null, { timeout: 60000 }
);

// Инициализация Leaflet — renderMap() первый вызов через RAF + setTimeout.
await page.evaluate(() => {
  if (typeof renderMap === 'function' && !window.leafletMap) renderMap();
});
await page.waitForFunction(() =>
  window.leafletMap && typeof window.leafletMap.getZoom === 'function',
  null, { timeout: 30000, polling: 200 }
);
await page.waitForTimeout(800);

// Проверка: функции доступны после Session 19.
const pre = await page.evaluate(() => ({
  critical:  typeof window.renderCritical  === 'function',
  deferred:  typeof window.renderDeferred  === 'function',
  all:       typeof window.renderAll       === 'function',
}));
if (!pre.critical || !pre.deferred || !pre.all) {
  console.error('❌ renderCritical / renderDeferred / renderAll не экспортированы');
  console.error(pre);
  await browser.close();
  process.exit(1);
}

async function bench(fnName, runs) {
  const arr = [];
  for (let i = 0; i < runs; i++) {
    const ms = await page.evaluate((fn) => {
      // forceLayout перед замером.
      void document.body.offsetHeight;
      const t0 = performance.now();
      window[fn]();
      const t1 = performance.now();
      return t1 - t0;
    }, fnName);
    arr.push(ms);
  }
  return arr;
}

// Прогрев
await bench('renderCritical', 3);
await bench('renderDeferred', 3);

const critArr = await bench('renderCritical', RUNS);
const defArr  = await bench('renderDeferred', RUNS);
// "Total" = critical + deferred подряд (эмуляция старого пути).
const totalArr = [];
for (let i = 0; i < RUNS; i++) {
  const ms = await page.evaluate(() => {
    void document.body.offsetHeight;
    const t0 = performance.now();
    window.renderCritical();
    window.renderDeferred();
    return performance.now() - t0;
  });
  totalArr.push(ms);
}

await browser.close();

const sCrit  = stats(critArr);
const sDef   = stats(defArr);
const sTotal = stats(totalArr);

console.log(`── renderAll() split: A/B/D (${RUNS} runs per mode) ──`);
console.log(row('A: total (critical+deferred) ms', sTotal));
console.log(row('B: renderCritical() alone  ms',   sCrit));
console.log(row('D: renderDeferred() alone  ms',   sDef));

const delta = sTotal.mean > 0 ? ((sCrit.mean - sTotal.mean) / sTotal.mean * 100).toFixed(1) : '0';
console.log(`\n  delta mean (B − A)/A = ${delta}%  (экономия на клик)`);

const out = {
  runs: RUNS,
  total:    sTotal,
  critical: sCrit,
  deferred: sDef,
  delta_pct_critical_vs_total: +delta,
};
console.log(`\nJSON:`);
console.log(JSON.stringify(out, null, 2));
