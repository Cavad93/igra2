/**
 * perf/session11_raf.mjs — Session 11 micro-bench.
 *
 * Измеряет эффект паузы фоновых RAF-циклов (AmbientLayer, AquaWidget) во время
 * processTurn(). Главная метрика — количество RAF-кадров, отрисованных во время
 * обсчёта хода: без паузы их ~60/сек, с паузой — 0.
 *
 * Сценарии:
 *   A. pause-OFF: принудительно отключаем pause/resume (noop-патч) и прогоняем
 *      8 ходов, считая вызовы _loop() обоих виджетов.
 *   B. pause-ON: возвращаем штатную пауз/резюм, прогоняем 8 ходов, считая
 *      те же вызовы.
 *
 * Для каждого сценария печатаем:
 *   - total frames drawn per turn (mean, p50, p95)
 *   - processTurn duration (mean, p50, p95)
 *
 * Примечание: processTurn в headless Chromium при mocked-AI — короткий (~0.5-2с
 * при warm кэше), поэтому абсолютная разница времени хода может быть скромной.
 * Главный сигнал — RAF count ≈ 0 при pause-ON.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';
const TURNS = 8;

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
    mean: +(sum / arr.length).toFixed(2),
    p50: +p(arr, 0.5).toFixed(2),
    p95: +p(arr, 0.95).toFixed(2),
  };
}
function row(label, s) {
  return `  ${label.padEnd(34)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}`;
}

console.log(`\n⏱  perf/session11_raf.mjs — RAF pause during processTurn()\n`);

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

// Прогрев 3 хода, чтобы не попасть в холодный первый ход
for (let i = 0; i < 3; i++) {
  await page.evaluate(async () => { if (typeof processTurn === 'function') await processTurn(); });
}

// Оборачиваем _loop обоих виджетов в счётчик — вешается один раз и переживает
// все сценарии. Также сохраняем ссылки на оригинальные pause/resume.
await page.evaluate(() => {
  window.__rafStats = { ambient: 0, aqua: 0, startTs: 0 };

  const a = window.AmbientLayer;
  if (a && typeof a._loop === 'function' && !a.__wrapped) {
    const orig = a._loop.bind(a);
    a._loop = function () {
      if (window.__rafStats && window.__rafStats.startTs) window.__rafStats.ambient++;
      return orig();
    };
    a.__wrapped = true;
    a.__origPause = a.pause.bind(a);
    a.__origResume = a.resume.bind(a);
  }

  const q = window.AquaWidget;
  if (q && typeof q._loop === 'function' && !q.__wrapped) {
    const orig = q._loop.bind(q);
    q._loop = function (ts) {
      if (window.__rafStats && window.__rafStats.startTs) window.__rafStats.aqua++;
      return orig(ts);
    };
    q.__wrapped = true;
    q.__origPause = q.pause.bind(q);
    q.__origResume = q.resume.bind(q);
  }
});

async function runScenario(mode) {
  // mode: 'pauseON' (штатная пауза) | 'pauseOFF' (noop-патч)
  await page.evaluate((m) => {
    const a = window.AmbientLayer, q = window.AquaWidget;
    if (m === 'pauseOFF') {
      if (a) { a.pause = () => {}; a.resume = () => {}; }
      if (q) { q.pause = () => {}; q.resume = () => {}; }
    } else {
      if (a) { a.pause = a.__origPause; a.resume = a.__origResume; }
      if (q) { q.pause = q.__origPause; q.resume = q.__origResume; }
    }
  }, mode);

  const perTurn = [];
  const rafAmb = [];
  const rafAq = [];

  for (let i = 0; i < TURNS; i++) {
    const r = await page.evaluate(async () => {
      window.__rafStats.ambient = 0;
      window.__rafStats.aqua = 0;
      window.__rafStats.startTs = performance.now();
      const t = performance.now();
      await processTurn();
      const ms = performance.now() - t;
      const amb = window.__rafStats.ambient;
      const aq  = window.__rafStats.aqua;
      window.__rafStats.startTs = 0;
      return { ms, amb, aq };
    });
    perTurn.push(r.ms);
    rafAmb.push(r.amb);
    rafAq.push(r.aq);
  }

  return { perTurn, rafAmb, rafAq };
}

// Сначала pauseOFF (чтобы избежать эффектов от нашего pause() на последующие
// кадры), потом pauseON.
const off = await runScenario('pauseOFF');
const on  = await runScenario('pauseON');

await browser.close();

console.log(`── RAF frames during processTurn() ──`);
console.log(row('pauseOFF AmbientLayer._loop',  stats(off.rafAmb)));
console.log(row('pauseOFF AquaWidget._loop',    stats(off.rafAq)));
console.log(row('pauseON  AmbientLayer._loop',  stats(on.rafAmb)));
console.log(row('pauseON  AquaWidget._loop',    stats(on.rafAq)));

const offAmbSum = off.rafAmb.reduce((a, b) => a + b, 0);
const onAmbSum  = on.rafAmb.reduce((a, b) => a + b, 0);
const offAqSum  = off.rafAq.reduce((a, b) => a + b, 0);
const onAqSum   = on.rafAq.reduce((a, b) => a + b, 0);

console.log(`\n── Всего кадров за ${TURNS} ходов ──`);
console.log(`  pauseOFF AmbientLayer: ${offAmbSum},  AquaWidget: ${offAqSum}`);
console.log(`  pauseON  AmbientLayer: ${onAmbSum},   AquaWidget: ${onAqSum}`);

console.log(`\n── processTurn() duration ──`);
console.log(row('pauseOFF (ms)', stats(off.perTurn)));
console.log(row('pauseON  (ms)', stats(on.perTurn)));

const meanOff = stats(off.perTurn).mean;
const meanOn  = stats(on.perTurn).mean;
const delta   = meanOff > 0 ? ((meanOn - meanOff) / meanOff * 100).toFixed(1) : 0;
console.log(`\n  delta mean: ${delta}%  (pauseON vs pauseOFF)`);

// Проверка: pauseON должен иметь ~0 кадров.
if (onAmbSum > 0 || onAqSum > 0) {
  console.log(`\n⚠ pauseON утечка кадров: ambient=${onAmbSum} aqua=${onAqSum}`);
}
