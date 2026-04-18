/**
 * perf/session8_diplo.mjs — Session 8 micro-bench.
 *
 * Загружает игру в headless Chromium, прогоняет 5 ходов чтобы устаканить
 * состояние, затем замеряет refreshDiploDistances() при разных сценариях:
 *
 *   1. "Cold cache" — первый вызов после сброса кэша.
 *      Сравниваем legacy (ничего не делает: 12-турный интервал ещё не истёк)
 *      vs Session 8 (тоже ранний выход по сигнатуре, но через sig-check).
 *
 *   2. "Stale + same territory" — старый код пересчитывает BFS каждые 12 ходов
 *      даже если ничего не изменилось. Session 8 видит совпадение sig'ов и
 *      пропускает. Симулируем «прошло 12 ходов» через сброс _cacheComputedAt.
 *
 *   3. "Hot path" — 902 повторных вызова getNationTier (как в processAINations
 *      → for всех наций). Раньше каждый вызов тратил время на сверку turn-int;
 *      теперь — O(1) guard.
 *
 *   4. "Player territory changed" — один регион сменил владельца (player захватил).
 *      В обоих случаях нужен полный BFS. Сравниваем абсолютную скорость.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import path from 'path';

const REPO = '/home/user/igra2';
const ITER = 30;

function p(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0 };
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    n: arr.length,
    mean: +(sum / arr.length).toFixed(3),
    p50: +p(arr, 0.5).toFixed(3),
    p95: +p(arr, 0.95).toFixed(3),
  };
}
function row(label, s) {
  return `  ${label.padEnd(36)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}`;
}

console.log(`\n⏱  perf/session8_diplo.mjs — refreshDiploDistances micro-bench\n`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--allow-file-access-from-files',
  ],
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

page.on('pageerror', e => console.error('[pageerror]', e.message));
page.on('console', m => {
  const t = m.text();
  if (t.includes('Error') || t.includes('error')) console.error('[console]', t.slice(0, 200));
});

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

// Прогоняем 5 ходов чтобы кэши прогрелись
for (let i = 0; i < 5; i++) {
  await page.evaluate(async () => { if (typeof processTurn === 'function') await processTurn(); });
}

const result = await page.evaluate(({ ITER }) => {
  const out = {};

  // Sanity: проверяем что diplomacy_range загружен
  if (typeof refreshDiploDistances !== 'function') {
    return { error: 'refreshDiploDistances not on window' };
  }

  // Доступ к внутренним переменным через window (после _reg в boot.js)
  // Если не прокинуто — попробуем переэкспортить через модуль (пропустим тогда).
  const diplo = window;

  // ── 1. Hot path: 902 повторных вызова getNationTier ──────────────
  // Это симулирует поведение processAINations() которое пробегает все нации.
  const allNationIds = Object.keys(GAME_STATE.nations);

  const hotTimes = [];
  for (let it = 0; it < ITER; it++) {
    // Прогрев + первичный заполненный кэш
    refreshDiploDistances();
    const t = performance.now();
    for (const nId of allNationIds) {
      getNationTier(nId);
    }
    hotTimes.push(performance.now() - t);
  }
  out.hotPath_902calls = { times: hotTimes, n: allNationIds.length };

  // ── 2. Кэш-валидный refresh (sig совпадает) ──────────────────────
  const cachedTimes = [];
  for (let it = 0; it < ITER; it++) {
    refreshDiploDistances(); // прогрев
    const t = performance.now();
    refreshDiploDistances();
    cachedTimes.push(performance.now() - t);
  }
  out.cachedRefresh = { times: cachedTimes };

  // ── 3. Force refresh: полный BFS (сравнение в абсолюте) ─────────
  const forceTimes = [];
  for (let it = 0; it < ITER; it++) {
    const t = performance.now();
    refreshDiploDistances(true);
    forceTimes.push(performance.now() - t);
  }
  out.forceRefresh_BFS = { times: forceTimes };

  return out;
}, { ITER });

await browser.close();

if (result.error) {
  console.error(`ERROR: ${result.error}`);
  process.exit(1);
}

console.log(`── Hot path: ${result.hotPath_902calls.n} × getNationTier per iter ──`);
console.log(row('всего на 902 вызова (мс)', stats(result.hotPath_902calls.times)));

console.log(`\n── Cached refresh (sig совпадает) ──`);
console.log(row('refreshDiploDistances() (мс)', stats(result.cachedRefresh.times)));

console.log(`\n── Force refresh (полный BFS) ──`);
console.log(row('refreshDiploDistances(true) (мс)', stats(result.forceRefresh_BFS.times)));

console.log('');
