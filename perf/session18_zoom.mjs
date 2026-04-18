/**
 * perf/session18_zoom.mjs — Session 18 micro-bench.
 *
 * Измеряет эффект замены O(N) setStyle-цикла в `_applyZoomFillOpacity()`
 * на O(1) CSS-класс. До Session 18 каждый zoomend итерировал все ~3734
 * regionLayers и вызывал layer.setStyle({ fillOpacity }). После —
 * тегируется `<canvas>` контейнер, а CSS-правило
 * `body.map-zoom-* .region-canvas-layer { opacity: ... }` применяется
 * батчем через cascade.
 *
 * Сценарии A/B:
 *   A (legacy):  window._applyZoomFillOpacityLegacyLoop(level) — старая
 *                функция с циклом, сохранена именно для этого теста.
 *   B (css-tag): window._applyZoomFillOpacity(level) — новая версия.
 *
 * Замер: для каждого сценария N=30 прогонов чередуем 'regional' ↔
 * 'strategic' (принудительно меняем `_currentZoomLevel` между вызовами
 * невалидирующим хаком — см. reset()). Снимаем длительность через
 * performance.now().
 *
 * Метрика сессии — mean и p95 длительности вызова. Делта — относительное
 * изменение (ожидаем −95% и больше).
 *
 * Запуск: `node perf/session18_zoom.mjs` (нужен /opt/node22 playwright).
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
    p50: +p(arr, 0.5).toFixed(3),
    p95: +p(arr, 0.95).toFixed(3),
    min: +Math.min(...arr).toFixed(3),
    max: +Math.max(...arr).toFixed(3),
  };
}
function row(label, s) {
  return `  ${label.padEnd(42)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}  max=${String(s.max).padStart(8)}`;
}

console.log(`\n⏱  perf/session18_zoom.mjs — _applyZoomFillOpacity A/B\n`);

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
  if (t === 'error') console.log(`[page.${t}]`, msg.text().slice(0, 200));
});

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
// Инициализация Leaflet происходит внутри renderMap() (первый вызов из turn.js)
// через requestAnimationFrame + setTimeout — подождём явно.
await page.evaluate(() => {
  if (typeof renderMap === 'function' && !window.leafletMap) renderMap();
});
await page.waitForFunction(() =>
  window.leafletMap && typeof window.leafletMap.getZoom === 'function',
  null, { timeout: 30000, polling: 200 }
);
await page.waitForTimeout(800);

// Проверка: функции доступны, regionLayers заселён.
const pre = await page.evaluate(() => {
  const ok = typeof window._applyZoomFillOpacity === 'function'
          && typeof window._applyZoomFillOpacityLegacyLoop === 'function';
  // regionLayers — module-scope, но fillOpacity loop итерирует по нему.
  // Проверяем косвенно: сколько L.Path-слоёв в leafletMap'е.
  let pathCount = 0;
  try {
    window.leafletMap.eachLayer?.((l) => { if (l instanceof L.Path) pathCount++; });
  } catch (_) {}
  return { ok, pathCount };
});
if (!pre.ok) {
  console.error('❌ window._applyZoomFillOpacity{,LegacyLoop} не экспортированы');
  await browser.close();
  process.exit(1);
}
console.log(`  setup: Path-слоёв в карте: ${pre.pathCount}\n`);

// A/B замер. level чередуем 'regional' ↔ 'strategic', чтобы setStyle
// не кэшировался Leaflet'ом как no-op (targetOpacity различается).
async function bench(fnName, runs) {
  const arr = [];
  for (let i = 0; i < runs; i++) {
    const level = (i % 2 === 0) ? 'regional' : 'strategic';
    const ms = await page.evaluate(([fn, lv]) => {
      // Прогреваем layout — forceLayout перед замером, чтобы следующий
      // setStyle не тянул pending layout в микросекунды измерения.
      void document.body.offsetHeight;
      const t0 = performance.now();
      window[fn](lv);
      const t1 = performance.now();
      return t1 - t0;
    }, [fnName, level]);
    arr.push(ms);
  }
  return arr;
}

// Прогрев
await bench('_applyZoomFillOpacityLegacyLoop', 3);
await bench('_applyZoomFillOpacity', 3);

const legacyArr = await bench('_applyZoomFillOpacityLegacyLoop', RUNS);
const cssArr    = await bench('_applyZoomFillOpacity', RUNS);

await browser.close();

const sLegacy = stats(legacyArr);
const sCss    = stats(cssArr);

console.log(`── _applyZoomFillOpacity: A/B (${RUNS} runs per mode) ──`);
console.log(row('A: legacy setStyle loop (ms)', sLegacy));
console.log(row('B: CSS-class tag (ms)',        sCss));
const delta = sLegacy.mean > 0 ? ((sCss.mean - sLegacy.mean) / sLegacy.mean * 100).toFixed(1) : '0';
console.log(`\n  delta mean: ${delta}%   (B − A) / A`);

const out = {
  runs: RUNS,
  legacy: sLegacy,
  css:    sCss,
  delta_mean_pct: +delta,
  path_count: pre.pathCount,
};
console.log(`\nJSON:`);
console.log(JSON.stringify(out, null, 2));
