// tests/eco_playwright_harness.mjs — Playwright-раннер экономического стресс-теста.
//
// В отличие от tests/eco_stress_harness.cjs (чистый Node + vm) — этот раннер гоняет
// ИГРУ ЦЕЛИКОМ в headless Chromium. Инициализация регионов, building slots, LLM/AI-
// моки — всё как в реальной игре. Медленнее (~2-3 с/ход), зато ловит настоящие
// баги экономики, а не артефакты vm-изоляции.
//
// Формат NDJSON — идентичен .cjs harness, поэтому tests/eco_stress_analyze.cjs
// читает оба выхода одинаково.
//
// Установка Playwright (если ещё нет):
//   npm install --save-dev playwright
//   npx playwright install chromium
//
// Запуск:
//   node tests/eco_playwright_harness.mjs --turns=100 --output=perf/eco_browser.ndjson
//   node tests/eco_playwright_harness.mjs --turns=20 --headful --slowmo=100
//
// Флаги:
//   --turns=N       количество ходов (по умолч. 100)
//   --seed=S        seed для Math.random в странице (по умолч. 1; детерминизм ограничен —
//                   engine уже загружен к моменту инъекции, часть модулей могла захватить
//                   Math.random в замыкания; строгий детерминизм см. в .cjs harness)
//   --output=path   куда писать NDJSON (по умолч. perf/eco_browser.ndjson)
//   --url=...       URL игры (по умолч. file://<repo>/index.html)
//   --headful       показать окно браузера (по умолч. headless)
//   --slowmo=MS     задержка между действиями (для отладки)
//   --quiet         не печатать прогресс
//   --timeout=MS    таймаут ожидания одного хода (по умолч. 60000)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ──────────────────────────────────────────────────────────────
// Динамическая загрузка Playwright
// ──────────────────────────────────────────────────────────────
async function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/local/lib/node_modules/playwright/index.js',
  ];
  for (const p of candidates) {
    try {
      const mod = await import(p);
      return mod.default || mod;
    } catch (_) { /* пробуем следующий */ }
  }
  console.error('\n❌ Playwright не найден. Установите одним из способов:');
  console.error('   npm install --save-dev playwright && npx playwright install chromium');
  console.error('   npm install -g playwright        && npx playwright install chromium');
  console.error('\n   Альтернативно используйте .cjs-раннер: npm run eco:stress -- --turns=100\n');
  process.exit(3);
}

// ──────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    turns: 100,
    seed: 1,
    output: 'perf/eco_browser.ndjson',
    url: null,
    headful: false,
    slowmo: 0,
    quiet: false,
    timeout: 60000,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--turns=')) args.turns = parseInt(a.slice(8), 10);
    else if (a.startsWith('--seed=')) args.seed = parseInt(a.slice(7), 10);
    else if (a.startsWith('--output=')) args.output = a.slice(9);
    else if (a.startsWith('--url=')) args.url = a.slice(6);
    else if (a === '--headful') args.headful = true;
    else if (a.startsWith('--slowmo=')) args.slowmo = parseInt(a.slice(9), 10) || 0;
    else if (a === '--quiet') args.quiet = true;
    else if (a.startsWith('--timeout=')) args.timeout = parseInt(a.slice(10), 10) || 60000;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`[playwright-harness] unknown flag: ${a}`); process.exit(2); }
  }
  if (!Number.isFinite(args.turns) || args.turns < 1) {
    console.error('[playwright-harness] --turns должен быть положительным числом');
    process.exit(2);
  }
  if (!args.url) args.url = 'file://' + path.join(ROOT, 'index.html');
  return args;
}

function printHelp() {
  console.log('Usage: node tests/eco_playwright_harness.mjs [--turns=100] [--seed=1] [--output=...] [--url=...] [--headful] [--slowmo=MS] [--timeout=MS] [--quiet]');
}

// ──────────────────────────────────────────────────────────────
// Снапшот GAME_STATE — код работает ВНУТРИ страницы
// Структура идентична captureSnapshot из tests/shared/eco_metrics.cjs
// ──────────────────────────────────────────────────────────────
const CAPTURE_FN_SRC = `
window.__ecoCapture__ = function(turn) {
  const GS = window.GAME_STATE;
  if (!GS) return null;

  const nationActive = (n) => {
    if (!n) return false;
    const hasRegions = Array.isArray(n.regions) && n.regions.length > 0;
    const pop = (n.population && n.population.total) || 0;
    return hasRegions || pop > 0;
  };

  const nations = {};
  for (const id in GS.nations) {
    const n = GS.nations[id];
    if (!nationActive(n)) continue;
    const eco = n.economy || {};
    nations[id] = {
      treasury: eco.treasury != null ? eco.treasury : 0,
      income:   eco.income_per_turn != null ? eco.income_per_turn : 0,
      expense:  eco.expenses_per_turn != null ? eco.expenses_per_turn : 0,
      inflation: (GS.economy_ext && GS.economy_ext.inflation && GS.economy_ext.inflation[id]) || 0,
      pop: (n.population && n.population.total) || 0,
      happiness: (n.population && n.population.happiness) || 0,
      stockpile: Object.assign({}, eco.stockpile || {}),
      production_last_tick: Object.assign({}, eco._production_last_tick || {}),
      income_breakdown:  Object.assign({}, eco._income_breakdown  || {}),
      expense_breakdown: Object.assign({}, eco._expense_breakdown || {}),
    };
  }

  const market = {};
  const m = GS.market || {};
  for (const good in m) {
    const row = m[good];
    if (!row || typeof row !== 'object') continue;
    market[good] = {
      price:  row.price != null ? row.price : (row.current_price || 0),
      supply: row.supply != null ? row.supply : (row.last_supply || 0),
      demand: row.demand != null ? row.demand : (row.last_demand || 0),
      shortage_streak: row.shortage_streak || 0,
    };
  }

  const ext = GS.economy_ext || {};

  // Этап 3 economic3.md — total money + recent audit entries.
  var totalMoney = 0;
  for (const id in GS.nations) {
    totalMoney += (GS.nations[id] && GS.nations[id].economy && GS.nations[id].economy.treasury) || 0;
  }
  const auditLog = Array.isArray(GS._money_audit) ? GS._money_audit : [];
  const recentAudit = auditLog.slice(-3);

  return {
    turn,
    nations,
    market,
    economy_ext: {
      monopolies: Object.assign({}, ext.monopolies || {}),
      economic_cycle: ext.economic_cycle ? Object.assign({}, ext.economic_cycle) : null,
    },
    total_money: Math.round(totalMoney),
    money_audit_recent: recentAudit,
  };
};
`;

// ──────────────────────────────────────────────────────────────
// Seedable RNG, подменяемый в Math.random до загрузки игры
// ──────────────────────────────────────────────────────────────
const SEED_FN_SRC = (seed) => `
(function() {
  var a = ${seed >>> 0};
  var rng = function() {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { Object.defineProperty(Math, 'random', { value: rng, writable: true, configurable: true }); }
  catch (e) { Math.random = rng; }
})();
`;

// ──────────────────────────────────────────────────────────────
// Моки внешних API (делаются через route() + addInitScript)
// ──────────────────────────────────────────────────────────────
async function setupMocks(page) {
  // Network-level route: Anthropic / Groq / Ollama
  await page.route('**/api.groq.com/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: '{"action":"wait","reasoning":"[mock]"}' } }] }),
  }));
  await page.route('**/api.anthropic.com/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ content: [{ text: '{"action":"wait","reasoning":"[mock]"}' }] }),
  }));
  await page.route('**/localhost:11434/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ response: '{"action":"wait"}' }),
  }));

  // In-page overrides — applied до исполнения user-скриптов
  await page.addInitScript(() => {
    // Подавляем модал API-ключей и LLM-вызовы. Мокаем ТОЛЬКО если они вдруг вызовутся
    // (route() уже закрыл сетевой путь, но некоторые обёртки могут делать прямой вызов).
    window.getAIWarDecision   = async () => ({ action: 'defend', reasoning: '[mock]', tactic: 'defensive' });
    window.getGroqDecision    = async () => ({ action: 'wait',   reasoning: '[mock]' });
    window._callGroqViaWorker = async () => null;
    window.fetchGroq          = async () => ({ choices: [{ message: { content: '{"action":"wait"}' } }] });
  });
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  const { chromium } = await loadPlaywright();
  const absOut = path.resolve(ROOT, args.output);

  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  if (fs.existsSync(absOut)) fs.unlinkSync(absOut);

  if (!args.quiet) {
    console.log(`[playwright-harness] turns=${args.turns} seed=${args.seed} → ${args.output}`);
    console.log(`[playwright-harness] URL: ${args.url}`);
    console.log(`[playwright-harness] запускаем ${args.headful ? 'headful' : 'headless'} Chromium...`);
  }

  const browser = await chromium.launch({
    headless: !args.headful,
    slowMo: args.slowmo,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--allow-file-access-from-files',
    ],
  });
  const ctx  = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // Seedable RNG + снапшот + моки — всё до goto()
  await page.addInitScript({ content: SEED_FN_SRC(args.seed) });
  await page.addInitScript({ content: CAPTURE_FN_SRC });
  await setupMocks(page);

  // Логируем console.error (но не заваливаем ими stdout)
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message.slice(0, 200)));

  const tStart = Date.now();
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Ждём пока boot.js инициализирует GAME_STATE
  await page.waitForFunction(() => {
    return typeof window.GAME_STATE !== 'undefined'
        && window.GAME_STATE.nations
        && Object.keys(window.GAME_STATE.nations).length > 5
        && window.GAME_STATE.turn >= 1
        && typeof window.processTurn === 'function';
  }, { timeout: 60000 });

  // Прячем модал API-ключей, если он всплыл при загрузке
  await page.evaluate(() => {
    const m = document.getElementById('api-key-modal');
    if (m) m.style.display = 'none';
  });

  const tReady = Date.now();
  if (!args.quiet) {
    const info = await page.evaluate(() => ({
      turn: window.GAME_STATE.turn,
      nations: Object.keys(window.GAME_STATE.nations).length,
    }));
    console.log(`[playwright-harness] игра готова за ${tReady - tStart}ms, стартовый ход=${info.turn}, наций=${info.nations}`);
  }

  // Первый снапшот — до прокрутки хода (стартовое состояние).
  const fd = fs.openSync(absOut, 'w');
  let bytesWritten = 0;
  const writeSnap = (snap) => {
    if (!snap) return;
    const line = JSON.stringify(snap) + '\n';
    bytesWritten += fs.writeSync(fd, line);
  };

  try {
    const startSnap = await page.evaluate(() => window.__ecoCapture__(window.GAME_STATE.turn));
    writeSnap(startSnap);

    // Цикл ходов
    for (let i = 1; i <= args.turns; i++) {
      // Вызываем processTurn напрямую — быстрее чем клик по кнопке (без UI-анимаций,
      // но клепсидра-flip и pause AmbientLayer внутри самого processTurn всё ещё идут).
      await page.evaluate(async () => {
        if (window.IS_PROCESSING_TURN) return;
        await window.processTurn();
      });

      // Ждём завершения тика
      await page.waitForFunction(
        () => window.IS_PROCESSING_TURN === false || window.IS_PROCESSING_TURN === undefined,
        { timeout: args.timeout }
      );

      const snap = await page.evaluate(() => window.__ecoCapture__(window.GAME_STATE.turn));
      writeSnap(snap);

      if (!args.quiet && (i % 10 === 0 || i === args.turns)) {
        const elapsed = (Date.now() - tReady) / 1000;
        const rate = i / elapsed;
        console.log(`  ход ${i}/${args.turns}  (${rate.toFixed(2)} ходов/с, ${(bytesWritten / 1024).toFixed(0)} KB)`);
      }
    }
  } finally {
    fs.closeSync(fd);
    await browser.close();
  }

  const tEnd = Date.now();
  const meta = {
    seed: args.seed,
    turns: args.turns,
    mode: 'browser',
    nations_count: 0,   // заполним из первого снапшота ниже
    elapsed_ms: tEnd - tStart,
    build_ms: tReady - tStart,
    sim_ms: tEnd - tReady,
    bytes_written: bytesWritten,
    node_version: process.version,
    timestamp: new Date().toISOString(),
    console_errors: errors.slice(0, 20),
  };

  // Достаём nations_count из первой строки NDJSON
  try {
    const firstLine = fs.readFileSync(absOut, 'utf8').split('\n', 1)[0];
    if (firstLine) meta.nations_count = Object.keys(JSON.parse(firstLine).nations).length;
  } catch (_) {}

  fs.writeFileSync(absOut + '.meta.json', JSON.stringify(meta, null, 2));

  if (!args.quiet) {
    console.log(`[playwright-harness] готово за ${meta.elapsed_ms}ms (загрузка ${meta.build_ms}ms, симуляция ${meta.sim_ms}ms)`);
    console.log(`[playwright-harness] записано ${(bytesWritten / 1024).toFixed(1)} KB в ${args.output}`);
    if (errors.length) {
      console.log(`[playwright-harness] ⚠ console-ошибок: ${errors.length} (первые в meta.json)`);
    }
  }
}

main().catch(e => {
  console.error('[playwright-harness] fatal:', e);
  process.exit(1);
});
