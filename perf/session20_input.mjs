/**
 * perf/session20_input.mjs — Session 20 micro-bench.
 *
 * Измеряет input-to-paint latency на применение одного action через
 * applyParsedAction(parsed) для разных типов действий.
 *
 *  A (legacy): renderAll() после действия — путь до Session 20.
 *  B (S20):   точечные renderLeftPanel / renderRightPanel / refreshEconomyTab
 *             в зависимости от dirty-bitmask. renderMap() исключён для
 *             action'ов, не меняющих карту (economy / diplomacy / character).
 *
 * Сценарии:
 *   1) economy: изменить tax_rate — dirty = ECONOMY.
 *   2) diplomacy: send_gift — dirty = DIPLOMACY | ECONOMY.
 *   3) character: give_gift персонажу — dirty = CHARACTERS | ECONOMY.
 *   4) chit-chat: неизвестный action_type — dirty = 0, ничего не рендерим.
 *
 *  Ожидание: B.mean << A.mean для всех action'ов, которые раньше тянули
 *  дорогую renderCritical() с renderMap().
 *
 * Запуск: `node perf/session20_input.mjs`.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';
const RUNS = 25;

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
  return `  ${label.padEnd(44)} n=${String(s.n).padStart(3)}  mean=${String(s.mean).padStart(8)}  p50=${String(s.p50).padStart(8)}  p95=${String(s.p95).padStart(8)}  max=${String(s.max).padStart(8)}`;
}

console.log(`\n⏱  perf/session20_input.mjs — targeted refresh vs renderAll()\n`);

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
  window.getAIWarDecision  = async () => ({ action: 'defend', reasoning: '[mock]' });
  window.getGroqDecision   = async () => ({ action: 'wait',   reasoning: '[mock]' });
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

// renderMap() инициализирует Leaflet через RAF + setTimeout — ждём.
await page.evaluate(() => {
  if (typeof renderMap === 'function' && !window.leafletMap) renderMap();
});
await page.waitForFunction(() =>
  window.leafletMap && typeof window.leafletMap.getZoom === 'function',
  null, { timeout: 30000, polling: 200 }
);
await page.waitForTimeout(800);

// Санити: applyParsedAction / renderAll доступны на window.
const pre = await page.evaluate(() => ({
  applyParsedAction: typeof window.applyParsedAction === 'function',
  renderAll:         typeof window.renderAll         === 'function',
  renderLeftPanel:   typeof window.renderLeftPanel   === 'function',
  renderRightPanel:  typeof window.renderRightPanel  === 'function',
  refreshEconomyTab: typeof window.refreshEconomyTab === 'function',
}));
if (!pre.applyParsedAction || !pre.renderAll) {
  console.error('❌ applyParsedAction / renderAll не экспортированы', pre);
  await browser.close();
  process.exit(1);
}
console.log(`  API available:`, pre, `\n`);

// Готовим безопасные моки: подменяем sub-функции applyEconomyAction/... на noop,
// чтобы измерять ТОЛЬКО стоимость рендера, а не побочные эффекты на state.
// Это даёт честный сравнительный замер A vs B.
await page.evaluate(() => {
  window.__origApplyEcon  = window.applyEconomyAction;
  window.__origApplyMil   = window.applyMilitaryAction;
  window.__origApplyDip   = window.applyDiplomacyAction;
  window.__origApplyBuild = window.applyBuildAction;
  window.__origApplyChar  = window.applyCharacterAction;
  window.__origInitLaw    = window.initiateLawProcess;
  // noop replacements — рендер-часть прогоняется, state не мутируется.
  window.applyEconomyAction   = () => {};
  window.applyMilitaryAction  = () => {};
  window.applyDiplomacyAction = () => {};
  window.applyBuildAction     = () => {};
  window.applyCharacterAction = () => {};
  window.initiateLawProcess   = () => {};
});

// Вспомогательный: за один eval — forceLayout + замер + возврат ms.
async function benchApply(parsed, runs) {
  const arr = [];
  for (let i = 0; i < runs; i++) {
    const ms = await page.evaluate((p) => {
      void document.body.offsetHeight;
      const t0 = performance.now();
      window.applyParsedAction(p);
      return performance.now() - t0;
    }, parsed);
    arr.push(ms);
  }
  return arr;
}

// A (legacy): имитируем старый путь — дёргаем applyParsedAction с типом,
// который в S20 тоже идёт через renderAll() ('build' / 'military'), либо
// принудительно зовём renderAll() после noop-apply для сравнения с B.
async function benchLegacyForType(actionType, parsedAction, runs) {
  const arr = [];
  for (let i = 0; i < runs; i++) {
    const ms = await page.evaluate(([t, a]) => {
      void document.body.offsetHeight;
      const t0 = performance.now();
      // Имитируем старую логику: apply-noop + renderAll().
      window.renderAll();
      return performance.now() - t0;
    }, [actionType, parsedAction]);
    arr.push(ms);
  }
  return arr;
}

// Прогрев.
await benchApply({ action_type: 'economy', parsed_action: { change_tax_rate: 0.1 } }, 3);
await benchLegacyForType('economy', { change_tax_rate: 0.1 }, 3);

const scenarios = [
  { key: 'economy',    parsed: { action_type: 'economy',    parsed_action: { change_tax_rate: 0.1 } } },
  { key: 'diplomacy',  parsed: { action_type: 'diplomacy',  parsed_action: { target_nation: 'rome', send_gift: true, gold_amount: 100 } } },
  { key: 'character',  parsed: { action_type: 'character',  parsed_action: { target_character: 'none', give_gift: true, gold_amount: 100 } } },
  { key: 'chit-chat',  parsed: { action_type: 'unknown',    parsed_action: {} } },
];

const report = {};
for (const sc of scenarios) {
  const bArr = await benchApply(sc.parsed, RUNS);
  const aArr = await benchLegacyForType(sc.parsed.action_type, sc.parsed.parsed_action, RUNS);
  const sB = stats(bArr);
  const sA = stats(aArr);
  const delta = sA.mean > 0 ? ((sB.mean - sA.mean) / sA.mean * 100).toFixed(1) : '0';
  report[sc.key] = { A_legacy: sA, B_s20: sB, delta_pct: +delta };
  console.log(`── ${sc.key.padEnd(10)} ──`);
  console.log(row('A (renderAll) ms',                    sA));
  console.log(row('B (S20 targeted) ms',                 sB));
  console.log(`  delta mean (B − A)/A = ${delta}%\n`);
}

// Восстанавливаем оригиналы (не критично, но аккуратно).
await page.evaluate(() => {
  window.applyEconomyAction   = window.__origApplyEcon;
  window.applyMilitaryAction  = window.__origApplyMil;
  window.applyDiplomacyAction = window.__origApplyDip;
  window.applyBuildAction     = window.__origApplyBuild;
  window.applyCharacterAction = window.__origApplyChar;
  window.initiateLawProcess   = window.__origInitLaw;
});

await browser.close();

console.log(`JSON:`);
console.log(JSON.stringify({ runs: RUNS, scenarios: report }, null, 2));
