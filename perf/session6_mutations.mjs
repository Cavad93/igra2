/**
 * perf/session6_mutations.mjs — Session 6 DOM-mutation benchmark.
 *
 * Измеряет, сколько DOM-мутаций происходит в #top-bar и #right-panel
 * между вызовами renderLeftPanel (вызывает updateResourceBar) и
 * renderRightPanel внутри одного хода (значения не меняются).
 *
 * План ожидает сокращение в 10× и более.
 *
 * Запуск: node perf/session6_mutations.mjs
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';

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

await page.goto(`file://${REPO}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
});

await page.waitForFunction(() =>
  typeof GAME_STATE !== 'undefined' && GAME_STATE.nations
  && Object.keys(GAME_STATE.nations).length > 5 && GAME_STATE.turn >= 1,
  { timeout: 60000 }
);

const report = await page.evaluate(() => {
  // Инструмент: подключаем MutationObserver к top-bar + right-panel
  // и замеряем, сколько childList/characterData событий прилетает
  // при N повторных вызовах рендера в одном ходе (ничего не должно
  // меняться — значит, мутации — это лишние работы).
  function measure(fn, label, target) {
    if (!target) return { label, count: 0, error: 'no target' };
    let count = 0;
    const obs = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') count += m.addedNodes.length + m.removedNodes.length;
        else if (m.type === 'characterData') count += 1;
        else if (m.type === 'attributes') count += 1;
      }
    });
    obs.observe(target, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
    for (let i = 0; i < 20; i++) fn();
    // Flush microtasks
    return new Promise(res => {
      setTimeout(() => {
        obs.disconnect();
        res({ label, count });
      }, 50);
    });
  }

  const top = document.getElementById('top-bar');
  const right = document.getElementById('right-panel');
  return Promise.all([
    measure(() => {
      if (typeof window.updateResourceBar === 'function') window.updateResourceBar(GAME_STATE);
    }, 'updateResourceBar x20 same-turn', top),
    measure(() => {
      if (typeof window.renderRightPanel === 'function') window.renderRightPanel();
    }, 'renderRightPanel x20 same-state', right),
  ]);
});

await browser.close();

console.log('\n── DOM-mutations по #top-bar / #right-panel (20 повторных вызовов) ──');
for (const r of report) {
  console.log(`  ${r.label.padEnd(40)} mutations=${r.count}`);
}
