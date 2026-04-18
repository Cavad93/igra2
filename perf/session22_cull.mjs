/**
 * perf/session22_cull.mjs — Session 22 A/B harness.
 *
 * Замеряет FPS и сумму longtask при pan на strategic-зуме (z=3) с
 * включённым / выключенным region culling. Culling удаляет ≈70%
 * самых мелких regionLayers из leafletMap на level='strategic';
 * Canvas draw-loop становится короче → FPS растёт.
 *
 * Сценарии:
 *   'cullOFF' — _applyRegionCulling игнорируется (все layers на карте).
 *   'cullON'  — штатное поведение (strategic → removeLayer).
 *
 * Primary signal:
 *   cullON FPS-mean > cullOFF FPS-mean при z=3,
 *   cullON longtask-sum < cullOFF longtask-sum.
 *
 * Запуск: `node perf/session22_cull.mjs` (playwright /opt/node22).
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';
const PAN_OPS = 10;
const PAN_STEP_PX = 60;
const PAN_DURATION_MS = 300;
const STRATEGIC_ZOOM = 3;

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
  return `  ${label.padEnd(42)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}`;
}

console.log(`\n⏱  perf/session22_cull.mjs — region culling A/B (z=${STRATEGIC_ZOOM})\n`);

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
  window.getGroqDecision   = async () => ({ action: 'wait', reasoning: '[mock]' });
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
await page.evaluate(() => {
  if (typeof renderMap === 'function' && !window.leafletMap) renderMap();
});
await page.waitForFunction(() =>
  window.leafletMap && typeof window.leafletMap.panBy === 'function',
  null, { timeout: 30000, polling: 200 }
);
await page.waitForTimeout(1200);

// Set longtask observer + diagnostics.
await page.evaluate(() => {
  if (!window.__ltObs) {
    window.__lt = [];
    try {
      window.__ltObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__lt.push({ duration: e.duration, startTime: e.startTime });
        }
      });
      window.__ltObs.observe({ entryTypes: ['longtask'] });
    } catch (_) {}
  }
});

// Diagnostic: how many cullable regions?
const diag = await page.evaluate(() => {
  const set = (typeof GAME_STATE !== 'undefined') ? GAME_STATE._cullableRegionIds : null;
  const cullCount = (set && typeof set.size === 'number') ? set.size : 0;
  const total = (typeof MAP_REGIONS !== 'undefined') ? Object.keys(MAP_REGIONS).length : 0;
  return { cullCount, total };
});
console.log(`Cullable regions: ${diag.cullCount} / ${diag.total} total  (`
            + `${(100 * diag.cullCount / Math.max(1, diag.total)).toFixed(0)}% будут скрыты)`);

async function runScenario(mode) {
  await page.evaluate(async ([m, zoom]) => {
    // Сначала уходим на default zoom, затем на strategic — для сброса culling.
    const lmap = window.leafletMap;
    await new Promise((resolve) => {
      const onEnd = () => { lmap.off('zoomend', onEnd); resolve(); };
      lmap.on('zoomend', onEnd);
      lmap.setZoom(5, { animate: false });
      setTimeout(onEnd, 300);
    });
    await new Promise((resolve) => {
      const onEnd = () => { lmap.off('zoomend', onEnd); resolve(); };
      lmap.on('zoomend', onEnd);
      lmap.setZoom(zoom, { animate: false });
      setTimeout(onEnd, 300);
    });

    if (m === 'cullOFF') {
      // Отменяем culling — возвращаем все мелкие layers обратно.
      const set = GAME_STATE && GAME_STATE._cullableRegionIds;
      if (set && window.regionLayers) {
        for (const rid of set) {
          const L = window.regionLayers[rid];
          if (L && !lmap.hasLayer(L)) {
            try { lmap.addLayer(L); } catch (_) {}
          }
        }
      }
    } else {
      // cullON — принудительно применяем culling: убираем мелкие.
      const set = GAME_STATE && GAME_STATE._cullableRegionIds;
      if (set && window.regionLayers) {
        for (const rid of set) {
          const L = window.regionLayers[rid];
          if (L && lmap.hasLayer(L)) {
            try { lmap.removeLayer(L); } catch (_) {}
          }
        }
      }
    }
  }, [mode, STRATEGIC_ZOOM]);

  await page.waitForTimeout(400);

  const perPanMs = [];
  const perScenarioFps = [];
  const perScenarioLt = [];

  for (let i = 0; i < PAN_OPS; i++) {
    const sx = (i % 2 === 0) ? PAN_STEP_PX : -PAN_STEP_PX;
    const sy = (i % 3 === 0) ? PAN_STEP_PX : -PAN_STEP_PX;
    const r = await page.evaluate(async ([dx, dy, dur]) => {
      const lmap = window.leafletMap;
      const ltStart = window.__lt.length;
      let rafFrames = 0;
      let rafActive = true;
      const t0 = performance.now();
      const tick = () => {
        if (!rafActive) return;
        rafFrames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await new Promise((resolve) => {
        const onEnd = () => { lmap.off('moveend', onEnd); resolve(); };
        lmap.on('moveend', onEnd);
        lmap.panBy([dx, dy], { animate: true, duration: dur / 1000, easeLinearity: 1 });
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

  return { perPanMs, perScenarioFps, perScenarioLt };
}

const off = await runScenario('cullOFF');
const on  = await runScenario('cullON');

await browser.close();

const sumArr = (a) => a.reduce((x, y) => x + y, 0);

console.log(`── Pan @ z=${STRATEGIC_ZOOM} (${PAN_OPS} panBy, step=${PAN_STEP_PX}px, dur=${PAN_DURATION_MS}ms) ──`);
console.log(row('cullOFF pan duration (ms)',  stats(off.perPanMs)));
console.log(row('cullON  pan duration (ms)',  stats(on.perPanMs)));
console.log(row('cullOFF FPS during pan',      stats(off.perScenarioFps)));
console.log(row('cullON  FPS during pan',      stats(on.perScenarioFps)));
console.log(row('cullOFF longtask sum>50 (ms)', stats(off.perScenarioLt)));
console.log(row('cullON  longtask sum>50 (ms)', stats(on.perScenarioLt)));

const totLtOff = sumArr(off.perScenarioLt);
const totLtOn  = sumArr(on.perScenarioLt);
const meanFpsOff = stats(off.perScenarioFps).mean;
const meanFpsOn  = stats(on.perScenarioFps).mean;
const fpsDelta = meanFpsOff > 0 ? ((meanFpsOn - meanFpsOff) / meanFpsOff * 100).toFixed(1) : '0';
const ltDelta  = totLtOff > 0 ? ((totLtOn - totLtOff) / totLtOff * 100).toFixed(1) : '0';

console.log(`\n── Aggregate ──`);
console.log(`  cullOFF  sum-longtask=${totLtOff.toFixed(1)}ms   mean-FPS=${meanFpsOff}`);
console.log(`  cullON   sum-longtask=${totLtOn.toFixed(1)}ms   mean-FPS=${meanFpsOn}`);
console.log(`  delta FPS: ${fpsDelta}%   delta longtask-sum: ${ltDelta}%`);

const out = {
  pan_z3: {
    off: { fps_mean: meanFpsOff, lt_sum_ms: +totLtOff.toFixed(1) },
    on:  { fps_mean: meanFpsOn,  lt_sum_ms: +totLtOn.toFixed(1) },
    delta_fps_pct: +fpsDelta,
    delta_lt_pct:  +ltDelta,
  },
  cullable: diag,
  config: { PAN_OPS, PAN_STEP_PX, PAN_DURATION_MS, STRATEGIC_ZOOM },
};
console.log(`\nJSON:`);
console.log(JSON.stringify(out, null, 2));
