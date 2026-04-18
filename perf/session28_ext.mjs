/**
 * perf/session28_ext.mjs — показывает все [ext-step] логи.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
         '--disable-gpu', '--allow-file-access-from-files'],
});

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

await page.route('**/api.groq.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"choices":[{"message":{"content":"{\\"action\\":\\"wait\\"}"}}]}' }));
await page.route('**/api.anthropic.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":[{"text":"{\\"action\\":\\"wait\\"}"}]}' }));
await page.route('**/localhost:11434/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"response":"{\\"action\\":\\"wait\\"}"}' }));

page.on('console', m => {
  const t = m.text();
  if (t.startsWith('[ext-step]')) console.log(t);
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
  typeof GAME_STATE !== 'undefined' && GAME_STATE.nations && Object.keys(GAME_STATE.nations).length > 5 && GAME_STATE.turn >= 1,
  { timeout: 60000 }
);

for (let i = 0; i < 10; i++) {
  const ms = await page.evaluate(async () => {
    const t = performance.now();
    await processTurn();
    return performance.now() - t;
  });
  console.log(`── Ход ${i + 1}: ${ms.toFixed(0)}ms ──`);
}

await browser.close();
