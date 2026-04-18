/**
 * tests/test_save_roundtrip.mjs
 *
 * Session 7: проверяет, что saveGame() → loadGame() round-trip сохраняет
 * ключевые поля GAME_STATE (turn, player, treasury, relations) без потерь.
 * Использует реальный путь — Web Worker + IndexedDB через Chromium.
 *
 * Запуск: node tests/test_save_roundtrip.mjs
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const REPO = '/home/user/igra2';

function assertEqual(a, b, label) {
  if (a !== b) {
    console.error(`❌ ${label}: ожидалось ${JSON.stringify(b)}, получили ${JSON.stringify(a)}`);
    process.exit(1);
  }
  console.log(`✓ ${label}: ${JSON.stringify(a)}`);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

await page.route('**/api.groq.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait"}' } }] }) }));
await page.route('**/api.anthropic.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ content: [{ text: '{"action":"wait"}' }] }) }));
await page.route('**/localhost:11434/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ response: '{"action":"wait"}' }) }));

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

// Прогоняем пару ходов, чтобы state был не-пустой
await page.evaluate(async () => {
  await processTurn();
  await processTurn();
});

// Фиксируем «снимок до»
const before = await page.evaluate(() => ({
  turn: GAME_STATE.turn,
  player: GAME_STATE.player_nation,
  treasury: Math.round(GAME_STATE.nations[GAME_STATE.player_nation]?.economy?.treasury ?? 0),
  nations: Object.keys(GAME_STATE.nations ?? {}).length,
  regions: Object.keys(GAME_STATE.regions ?? {}).length,
  eventsLog: (GAME_STATE.events_log ?? []).length,
  relations: Object.keys(GAME_STATE?.diplomacy?.relations ?? {}).length,
}));

// Сохраняем (worker path) и ждём, пока запись дойдёт до IDB.
// Session 26: throttle пропускает save, если ход не N-кратен — тест
// форсирует запись через { force: true } независимо от номера хода.
await page.evaluate(async () => {
  await saveGame({ force: true });
  await new Promise(r => setTimeout(r, 600));   // setTimeout(0) + worker + IDB round-trip
});

// Сбрасываем GAME_STATE и перечитываем из IDB
const after = await page.evaluate(async () => {
  // Очищаем in-memory state, кроме SENATE_MANAGERS (loadGame их восстановит)
  for (const k of Object.keys(GAME_STATE)) delete GAME_STATE[k];
  const ok = await loadGame();
  if (!ok) return { loaded: false };
  return {
    loaded: true,
    turn: GAME_STATE.turn,
    player: GAME_STATE.player_nation,
    treasury: Math.round(GAME_STATE.nations[GAME_STATE.player_nation]?.economy?.treasury ?? 0),
    nations: Object.keys(GAME_STATE.nations ?? {}).length,
    regions: Object.keys(GAME_STATE.regions ?? {}).length,
    eventsLog: (GAME_STATE.events_log ?? []).length,
    relations: Object.keys(GAME_STATE?.diplomacy?.relations ?? {}).length,
  };
});

await browser.close();

if (!after.loaded) {
  console.error('❌ loadGame вернул false — не нашёл сохранение в IDB');
  process.exit(1);
}

console.log(`\nRound-trip GAME_STATE → IDB → GAME_STATE\n`);
assertEqual(after.turn,     before.turn,     'turn');
assertEqual(after.player,   before.player,   'player_nation');
assertEqual(after.nations,  before.nations,  'nations count');
assertEqual(after.regions,  before.regions,  'regions count');
assertEqual(after.treasury, before.treasury, 'treasury');
assertEqual(after.relations,before.relations,'relations');
// events_log у save.js троттлится до 50 при сохранении; loadGame добавляет
// ещё одну запись «Игра загружена из сохранения» — итого 51 (или меньше,
// если before.eventsLog был < 50).
const expectedEvents = Math.min(before.eventsLog, 50) + 1;
assertEqual(after.eventsLog, expectedEvents, 'events_log length (capped at 50, +1 load msg)');

console.log(`\n✅ Round-trip passed — save→load в Session 7 не теряет данные.`);
