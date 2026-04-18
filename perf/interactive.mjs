/**
 * perf/interactive.mjs — Sessions 16-22 harness для interactive-latency.
 *
 * `perf/profile.mjs` измеряет длительность processTurn(); этот harness
 * фокусируется на отзывчивости UI между ходами: pan/zoom карты, клики,
 * ввод в диалогах.
 *
 * Метрики:
 *   - mean-FPS во время pan карты (по RAF-тикам в окне измерения)
 *   - сумма longtask.duration (entries, duration > 50 ms) за сценарий
 *   - количество longtasks > 50 ms
 *   - длительность самой панорамной операции (для sanity-check)
 *
 * Сценарии A/B — как в perf/session11_raf.mjs:
 *   'pauseOFF' — глобально патчим AmbientLayer/AquaWidget.pause/resume в noop,
 *                имитируя поведение до Session 16.
 *   'pauseON'  — штатное поведение: pan/zoom handler в ui/map.js зовёт pause,
 *                resume — через 150 ms после moveend/zoomend.
 *
 * Primary signal: на 'pauseON' сумма longtask за pan-сценарий падает,
 * mean-FPS растёт (фоновые RAF не конкурируют за main-thread).
 *
 * Запуск: `node perf/interactive.mjs` (нужен /opt/node22 playwright).
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';
const PAN_OPS = 10;          // количество panBy(...) за сценарий
const PAN_STEP_PX = 40;      // сдвиг за одну операцию
const PAN_DURATION_MS = 300; // Leaflet animate-pan длительность
const ZOOM_OPS = 4;          // zoomIn/zoomOut попарно

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
  return `  ${label.padEnd(40)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}`;
}

console.log(`\n⏱  perf/interactive.mjs — pan/zoom + background RAF\n`);

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

// Замок AI-ответов чтобы не упереться в сеть (как в session11_raf.mjs).
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
page.on('console', msg => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') console.log(`[page.${t}]`, msg.text().slice(0, 200));
});

await page.goto(`file://${REPO}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  if (typeof CONFIG !== 'undefined') {
    CONFIG.API_KEY = 'sk-ant-mock000000000000000000000000000000000000000';
    CONFIG.GROQ_API_KEY = 'gsk_mock000000000000000000000000000000000000000000';
  }
  window.getAIWarDecision = async () => ({ action: 'defend', reasoning: '[mock]' });
  window.getGroqDecision = async () => ({ action: 'wait', reasoning: '[mock]' });
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
// Инициализация Leaflet происходит внутри renderMap() (первый вызов из turn.js)
// через requestAnimationFrame + setTimeout — подождём явно.
await page.evaluate(() => {
  if (typeof renderMap === 'function' && !window.leafletMap) renderMap();
});
await page.waitForFunction(() =>
  window.leafletMap && typeof window.leafletMap.panBy === 'function',
  null, { timeout: 30000, polling: 200 }
);
await page.waitForTimeout(800);

// Патчим widgets один раз: сохраняем orig pause/resume, чтобы можно было
// переключаться между pauseOFF и pauseON.
await page.evaluate(() => {
  const a = window.AmbientLayer;
  if (a && !a.__wrapped) {
    a.__origPause  = a.pause.bind(a);
    a.__origResume = a.resume.bind(a);
    a.__wrapped = true;
  }
  const q = window.AquaWidget;
  if (q && !q.__wrapped) {
    q.__origPause  = q.pause.bind(q);
    q.__origResume = q.resume.bind(q);
    q.__wrapped = true;
  }
  // Ставим PerformanceObserver на longtasks, буферизуем в массив.
  if (!window.__ltObs) {
    window.__lt = [];
    try {
      window.__ltObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__lt.push({ duration: e.duration, startTime: e.startTime });
        }
      });
      window.__ltObs.observe({ entryTypes: ['longtask'] });
    } catch (_) { /* headless Chromium supports longtask */ }
  }
});

async function runScenario(mode) {
  await page.evaluate((m) => {
    const a = window.AmbientLayer, q = window.AquaWidget;
    if (m === 'pauseOFF') {
      if (a) { a.pause = () => {}; a.resume = () => {}; }
      if (q) { q.pause = () => {}; q.resume = () => {}; }
    } else {
      if (a) { a.pause = a.__origPause; a.resume = a.__origResume; }
      if (q) { q.pause = q.__origPause; q.resume = q.__origResume; }
    }
    // Снять форс-паузу от предыдущего прогона, чтобы фоновые RAF тикали
    // между сценариями (и были «хуже всего» для pauseOFF).
    if (a) { a._paused = false; if (a._inited && a._visible && a._raf == null) a._loop(); }
    if (q) { q._paused = false; if (q._initialized && q._raf == null) q._raf = requestAnimationFrame((t) => q._loop(t)); }
  }, mode);

  // Короткий прогрев RAF-циклов, чтобы измерение не цепляло старт.
  await page.waitForTimeout(300);

  const perPanMs = [];
  const perScenarioLt = [];
  const perScenarioFps = [];

  // Pan-сценарий: N операций panBy туда-сюда. Измеряем RAF между
  // movestart и moveend + считаем longtasks в этом окне.
  for (let i = 0; i < PAN_OPS; i++) {
    const sx = (i % 2 === 0) ? PAN_STEP_PX : -PAN_STEP_PX;
    const sy = (i % 3 === 0) ? PAN_STEP_PX : -PAN_STEP_PX;
    const r = await page.evaluate(async ([dx, dy, dur]) => {
      const lmap = window.leafletMap;
      // Сбрасываем longtask-буфер до pan-операции, чтобы считать только её.
      const ltStart = window.__lt.length;
      // RAF-таймер измерения.
      let rafFrames = 0;
      let rafActive = true;
      const t0 = performance.now();
      const tick = () => {
        if (!rafActive) return;
        rafFrames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      // Panимся через Leaflet animate-pan, ждём moveend.
      await new Promise((resolve) => {
        const onEnd = () => { lmap.off('moveend', onEnd); resolve(); };
        lmap.on('moveend', onEnd);
        lmap.panBy([dx, dy], { animate: true, duration: dur / 1000, easeLinearity: 1 });
        // Safety-net на случай мгновенного перехода без moveend.
        setTimeout(onEnd, dur + 400);
      });
      rafActive = false;
      const elapsed = performance.now() - t0;
      const ltSlice = window.__lt.slice(ltStart);
      const ltOver50 = ltSlice.filter(x => x.duration > 50);
      const ltSum = ltOver50.reduce((a, b) => a + b.duration, 0);
      const fps = elapsed > 0 ? (rafFrames / (elapsed / 1000)) : 0;
      return { ms: elapsed, fps, ltCount: ltOver50.length, ltSum };
    }, [sx, sy, PAN_DURATION_MS]);
    perPanMs.push(r.ms);
    perScenarioFps.push(r.fps);
    perScenarioLt.push(r.ltSum);
  }

  // Zoom-сценарий (вложенный — чтобы посчитать отдельно).
  const zoomLtSum = await page.evaluate(async ([N]) => {
    const lmap = window.leafletMap;
    const ltStart = window.__lt.length;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      await new Promise((resolve) => {
        const onEnd = () => { lmap.off('zoomend', onEnd); resolve(); };
        lmap.on('zoomend', onEnd);
        lmap.zoomIn(1, { animate: true });
        setTimeout(onEnd, 700);
      });
      await new Promise((resolve) => {
        const onEnd = () => { lmap.off('zoomend', onEnd); resolve(); };
        lmap.on('zoomend', onEnd);
        lmap.zoomOut(1, { animate: true });
        setTimeout(onEnd, 700);
      });
    }
    const elapsed = performance.now() - t0;
    const ltSlice = window.__lt.slice(ltStart);
    const ltOver50 = ltSlice.filter(x => x.duration > 50);
    const ltSum = ltOver50.reduce((a, b) => a + b.duration, 0);
    return { ms: elapsed, ltCount: ltOver50.length, ltSum };
  }, [ZOOM_OPS]);

  return { perPanMs, perScenarioFps, perScenarioLt, zoomLtSum };
}

// Прогоняем pauseOFF первым, потом pauseON.
const off = await runScenario('pauseOFF');
const on  = await runScenario('pauseON');

await browser.close();

const sumArr = (a) => a.reduce((x, y) => x + y, 0);

console.log(`── Pan scenario (${PAN_OPS} panBy, step=${PAN_STEP_PX}px, dur=${PAN_DURATION_MS}ms) ──`);
console.log(row('pauseOFF pan duration (ms)',  stats(off.perPanMs)));
console.log(row('pauseON  pan duration (ms)',  stats(on.perPanMs)));
console.log(row('pauseOFF FPS during pan',      stats(off.perScenarioFps)));
console.log(row('pauseON  FPS during pan',      stats(on.perScenarioFps)));
console.log(row('pauseOFF longtask sum>50 (ms)', stats(off.perScenarioLt)));
console.log(row('pauseON  longtask sum>50 (ms)', stats(on.perScenarioLt)));

const totPanLtOff = sumArr(off.perScenarioLt);
const totPanLtOn  = sumArr(on.perScenarioLt);
const meanFpsOff = stats(off.perScenarioFps).mean;
const meanFpsOn  = stats(on.perScenarioFps).mean;
const fpsDelta = meanFpsOff > 0 ? ((meanFpsOn - meanFpsOff) / meanFpsOff * 100).toFixed(1) : '0';
const ltDelta  = totPanLtOff > 0 ? ((totPanLtOn - totPanLtOff) / totPanLtOff * 100).toFixed(1) : '0';

console.log(`\n── Aggregate pan ──`);
console.log(`  pauseOFF  sum-longtask=${totPanLtOff.toFixed(1)}ms   mean-FPS=${meanFpsOff}`);
console.log(`  pauseON   sum-longtask=${totPanLtOn.toFixed(1)}ms   mean-FPS=${meanFpsOn}`);
console.log(`  delta FPS: ${fpsDelta}%   delta longtask-sum: ${ltDelta}%`);

console.log(`\n── Zoom scenario (${ZOOM_OPS}x in+out) ──`);
console.log(`  pauseOFF longtask sum>50: ${off.zoomLtSum.ltSum.toFixed(1)}ms  count=${off.zoomLtSum.ltCount}  elapsed=${off.zoomLtSum.ms.toFixed(0)}ms`);
console.log(`  pauseON  longtask sum>50: ${on.zoomLtSum.ltSum.toFixed(1)}ms  count=${on.zoomLtSum.ltCount}  elapsed=${on.zoomLtSum.ms.toFixed(0)}ms`);

// JSON-срез для markdown-отчёта.
const out = {
  pan: {
    off: { fps_mean: meanFpsOff, lt_sum_ms: +totPanLtOff.toFixed(1) },
    on:  { fps_mean: meanFpsOn,  lt_sum_ms: +totPanLtOn.toFixed(1) },
    delta_fps_pct: +fpsDelta,
    delta_lt_pct:  +ltDelta,
  },
  zoom: {
    off: { lt_sum_ms: +off.zoomLtSum.ltSum.toFixed(1), lt_count: off.zoomLtSum.ltCount },
    on:  { lt_sum_ms: +on.zoomLtSum.ltSum.toFixed(1),  lt_count: on.zoomLtSum.ltCount  },
  },
  config: { PAN_OPS, PAN_STEP_PX, PAN_DURATION_MS, ZOOM_OPS },
};
console.log(`\nJSON:`);
console.log(JSON.stringify(out, null, 2));
