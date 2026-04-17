/**
 * perf/profile.mjs — Session 1 baseline profiler.
 *
 * Загружает index.html в headless Chromium (Playwright), выполняет initGame()
 * (происходит автоматически при загрузке страницы), затем прогоняет 10 ходов
 * через processTurn(). Для каждого хода замеряет общее время (performance.now())
 * и ловит console.timeEnd-метки из engine/turn.js — получается разбивка по шагам
 * (Договоры, Экономика, Заговоры, Население, Персонажи, ИИ, Армии, Сохранение).
 *
 * Запуск:
 *   node perf/profile.mjs              # стандартный прогон
 *   PERF_TURNS=20 node perf/profile.mjs # больше ходов
 *
 * Вывод:
 *   — таблица в stdout
 *   — JSON в perf/last_run.json (для сравнения следующих сессий)
 *   — НЕ перезаписывает perf/baseline.md (его пишет сама сессия)
 *
 * Почему Playwright, а не jsdom:
 *   Игра работает поверх Leaflet + Pixi + большого пласта DOM. jsdom не покрывает
 *   layout-пути Leaflet (getBoundingClientRect, SVG path), поэтому renderAll()
 *   валится. Headless Chromium — минимальный honest environment.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'fs';
import path from 'path';

const TURNS = Number(process.env.PERF_TURNS ?? 10);
const REPO = '/home/user/igra2';
const OUT_JSON = path.join(REPO, 'perf/last_run.json');

function p(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(q * s.length));
  return s[idx];
}

function stats(arr) {
  if (!arr.length) return { n: 0, sum: 0, mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    n: arr.length,
    sum: +sum.toFixed(1),
    mean: +(sum / arr.length).toFixed(1),
    p50: +p(arr, 0.5).toFixed(1),
    p95: +p(arr, 0.95).toFixed(1),
    min: +Math.min(...arr).toFixed(1),
    max: +Math.max(...arr).toFixed(1),
  };
}

function fmtRow(label, s) {
  const pad = (v, w) => String(v).padStart(w);
  return `  ${label.padEnd(22)} n=${pad(s.n, 3)}  mean=${pad(s.mean, 7)}  p50=${pad(s.p50, 7)}  p95=${pad(s.p95, 7)}  max=${pad(s.max, 7)}`;
}

console.log(`\n⏱  perf/profile.mjs — baseline for ${TURNS} turns\n`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--allow-file-access-from-files',
  ],
});

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// console.time/timeEnd печатаются как отдельный тип события ('timeEnd'), который
// не всегда доступен в m.text() Playwright. Перехватываем time/timeEnd ДО загрузки
// страницы и заменяем на console.log с префиксом "[perf-step]".
await ctx.addInitScript(() => {
  const origTime = console.time.bind(console);
  const origTimeEnd = console.timeEnd.bind(console);
  const starts = new Map();
  console.time = (label) => {
    starts.set(label, performance.now());
    origTime(label);
  };
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

// Мокаем внешние API — иначе AI-шаги уходят в 5-секундный таймаут
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

// engine/turn.js вызывает console.time('[turn] <label>') / console.timeEnd('[turn] <label>').
// Наш initScript превращает timeEnd → console.log("[perf-step] [turn] <label>: Nms").
const stepTimings = {};   // { label: [ms, ms, ...] }
page.on('console', m => {
  const text = m.text();
  const match = text.match(/^\[perf-step\]\s+\[turn\]\s+(.+?):\s+([\d.]+)ms/);
  if (match) {
    const label = match[1].replace(/\.\.\.$/, '').trim();
    const ms = parseFloat(match[2]);
    if (Number.isFinite(ms)) {
      (stepTimings[label] ??= []).push(ms);
    }
  }
});

const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

const t0 = Date.now();
await page.goto(`file://${REPO}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

// Заглушаем модалку API-ключа и мокаем AI-функции на уровне window
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

const bootMs = Date.now() - t0;
const boot = await page.evaluate(() => ({
  turn: GAME_STATE.turn,
  nations: Object.keys(GAME_STATE.nations).length,
  regions: Object.keys(GAME_STATE.regions || {}).length,
  player: GAME_STATE.player_nation,
  relations: Object.keys(GAME_STATE?.diplomacy?.relations || {}).length,
}));

console.log(`Boot: ${bootMs}ms — ${boot.nations} наций, ${boot.regions} регионов, player=${boot.player}, relations=${boot.relations}\n`);

// ── Прогон ходов ─────────────────────────────────────────
const perTurnMs = [];

for (let i = 0; i < TURNS; i++) {
  const ms = await page.evaluate(async () => {
    if (typeof processTurn !== 'function') return -1;
    const t = performance.now();
    await processTurn();
    return performance.now() - t;
  });

  if (ms < 0) {
    console.log(`  Ход ${i + 1}: processTurn не найден`);
    break;
  }

  perTurnMs.push(ms);
  const marker = ms > 3000 ? ' ⚠ SLOW' : '';
  console.log(`  Ход ${i + 1}: ${ms.toFixed(0)}ms${marker}`);
}

// Собираем финальное состояние
const finalState = await page.evaluate(() => ({
  turn: GAME_STATE.turn,
  treasury: Math.round(GAME_STATE.nations?.[GAME_STATE.player_nation]?.economy?.treasury ?? 0),
  relations: Object.keys(GAME_STATE?.diplomacy?.relations || {}).length,
  eventsLog: (GAME_STATE.events_log || []).length,
}));

await browser.close();

// ── Отчёт ────────────────────────────────────────────────
const overall = stats(perTurnMs);

console.log(`\n── Per-turn summary ──`);
console.log(fmtRow('total', overall));

console.log(`\n── Step breakdown (из console.time в engine/turn.js) ──`);
const stepReport = {};
const stepLabels = Object.keys(stepTimings).sort((a, b) =>
  (stepTimings[b].reduce((x, y) => x + y, 0)) -
  (stepTimings[a].reduce((x, y) => x + y, 0))
);
for (const label of stepLabels) {
  const s = stats(stepTimings[label]);
  stepReport[label] = s;
  console.log(fmtRow(label, s));
}

console.log(`\n── Final state ──`);
console.log(`  turn=${finalState.turn}  treasury=${finalState.treasury}  relations=${finalState.relations}  events_log=${finalState.eventsLog}`);

if (pageErrors.length) {
  console.log(`\n⚠ Page errors: ${pageErrors.length}`);
  [...new Set(pageErrors)].slice(0, 5).forEach(e => console.log(`  ${e.slice(0, 150)}`));
}

// Сохраняем snapshot для последующих сессий
const snapshot = {
  timestamp: new Date().toISOString(),
  node: process.version,
  turns: TURNS,
  bootMs,
  boot,
  perTurnMs,
  overall,
  stepReport,
  finalState,
  pageErrors: pageErrors.slice(0, 20),
};
fs.writeFileSync(OUT_JSON, JSON.stringify(snapshot, null, 2));
console.log(`\n💾 Saved: ${OUT_JSON}\n`);
