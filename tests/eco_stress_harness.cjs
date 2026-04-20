'use strict';
// tests/eco_stress_harness.cjs — стресс-прогон экономики на N ходов в чистом Node.
//
// Запуск:
//   node tests/eco_stress_harness.cjs --turns=100 --seed=42 --output=perf/eco_run.ndjson
//   node tests/eco_stress_harness.cjs --turns=500 --seed=1  --mode=fast --quiet
//
// Флаги:
//   --turns=N      сколько ходов прогнать (по умолч. 100)
//   --seed=S       seed для детерминированного Math.random (по умолч. 1)
//   --output=path  куда писать NDJSON (по умолч. perf/eco_run.ndjson)
//   --mode=fast    пропускать applyFallbackDecision (быстрее, без AI-решений)
//   --quiet        не печатать прогресс
//
// Рядом с output создаётся {output}.meta.json с параметрами прогонa.
// engine/ не модифицируется — всё через vm.createContext + strip-ESM.

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.resolve(__dirname, '..');
const { mulberry32, stripESM, captureSnapshot } = require(path.join(__dirname, 'shared', 'eco_metrics.cjs'));

// ──────────────────────────────────────────────────────────────
// 1. CLI
// ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    turns: 100,
    seed: 1,
    output: 'perf/eco_run.ndjson',
    mode: 'full',
    quiet: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--turns='))  args.turns  = parseInt(a.slice(8), 10);
    else if (a.startsWith('--seed='))   args.seed   = parseInt(a.slice(7), 10);
    else if (a.startsWith('--output=')) args.output = a.slice(9);
    else if (a.startsWith('--mode='))   args.mode   = a.slice(7);
    else if (a === '--quiet')           args.quiet  = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`[harness] unknown flag: ${a}`); process.exit(2); }
  }
  if (!Number.isFinite(args.turns) || args.turns < 1) {
    console.error('[harness] --turns должен быть положительным числом');
    process.exit(2);
  }
  if (args.mode !== 'full' && args.mode !== 'fast') {
    console.error('[harness] --mode должен быть full|fast');
    process.exit(2);
  }
  return args;
}

function printHelp() {
  console.log('Usage: node tests/eco_stress_harness.cjs [--turns=100] [--seed=1] [--output=...] [--mode=full|fast] [--quiet]');
}

// ──────────────────────────────────────────────────────────────
// 2. Загрузка engine-модулей в vm-контекст
// ──────────────────────────────────────────────────────────────

// Минимальный набор модулей, нужных для экономического тика.
// Порядок важен — зависимости загружаются первыми.
const MODULES = [
  'config.js',
  'data/goods.js',
  'data/buildings.js',
  'data/map.js',
  'data/social_classes.js',
  'data/nations.js',
  'engine/super_ou.js',
  'engine/pops.js',
  'engine/land_capacity.js',
  'engine/market.js',
  'engine/buildings.js',       // processAllRecipes, calculateAllBuildingProduction, procureCapitalInputs/Slaves, _bump*CacheTick
  'engine/provinces.js',       // buildProvinceMarket
  'engine/economy.js',
  'engine/economy_ext.js',
  'engine/loans.js',
  'engine/demography.js',
  'engine/ai_scoring.js',
  'engine/ai_fallback.js',
];

function loadFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function buildContext(seed) {
  // Stubs для DOM/browser API. Всё безопасное no-op.
  const domStub = {
    getElementById: () => null,
    createElement: () => ({ id:'', className:'', innerHTML:'', style:{},
                            remove(){}, appendChild(){}, setAttribute(){}, addEventListener(){} }),
    body: { appendChild(){} },
  };
  const windowStub = {
    INITIAL_GAME_STATE: null,  // перехватываем присваивание из data/nations.js
  };

  // Создаём контекст. Math будет подменён позже (нужен ссылочный объект).
  const ctx = vm.createContext({
    document: domStub,
    window: windowStub,
    console: { log(){}, warn(){}, error(){}, info(){}, debug(){} },
    Math, Object, Array, JSON, Set, Map, String, Number, Boolean, Error, Date, RegExp, Symbol,
    // no-op ловушки для вызовов, которые engine делает из turn.js/ui
    addEventLog:      () => {},
    addMemoryEvent:   () => {},
    recordAIAction:   () => {},
    declareWar:       () => {},
    setTimeout:       () => 0,
    clearTimeout:     () => {},
    Promise,
  });

  // Подменяем Math.random ДО загрузки engine — ловим детерминированный сид.
  const rng = mulberry32(seed);
  Object.defineProperty(ctx.Math, 'random', {
    value: rng,
    writable: true,
    configurable: true,
  });

  // Загружаем модули по порядку через strip-ESM.
  for (const rel of MODULES) {
    const raw = loadFile(rel);
    const stripped = stripESM(raw);
    try {
      vm.runInContext(stripped, ctx, { filename: rel, displayErrors: true });
    } catch (e) {
      console.error(`[harness] ошибка загрузки ${rel}: ${e.message}`);
      throw e;
    }
  }

  // data/nations.js в конце делает `window.INITIAL_GAME_STATE = INITIAL_GAME_STATE;`
  // strip-ESM оставил `var INITIAL_GAME_STATE = {...}` в ctx-глобалах, т.е.
  // ctx.INITIAL_GAME_STATE уже есть. Плюс window тоже получил ссылку.
  const initial = ctx.INITIAL_GAME_STATE || ctx.window.INITIAL_GAME_STATE;
  if (!initial) throw new Error('INITIAL_GAME_STATE не найден после загрузки data/nations.js');

  // GAME_STATE — глубокая копия initial. В movie engine копия делается через JSON roundtrip,
  // чего достаточно для структурных данных (функций в GAME_STATE нет).
  ctx.GAME_STATE = JSON.parse(JSON.stringify(initial));
  if (!ctx.GAME_STATE.turn) ctx.GAME_STATE.turn = 1;

  // Гарантируем минимум полей у каждой нации (порт _ensureNationDefaults из engine/turn.js:49).
  ensureNationDefaults(ctx.GAME_STATE);

  // Инициализируем расширения экономики (monopolies, inflation, cycle, specialization).
  try {
    if (typeof ctx.initEconomyExt === 'function') ctx.initEconomyExt();
  } catch (e) {
    console.error('[harness] initEconomyExt:', e.message);
    throw e;
  }

  return ctx;
}

function ensureNationDefaults(GS) {
  for (const n of Object.values(GS.nations || {})) {
    if (!n.economy) n.economy = {};
    if (!n.economy.stockpile) n.economy.stockpile = {};
    if (n.economy.treasury == null) n.economy.treasury = 0;
    if (!n.population) n.population = {};
    if (!n.population.by_profession) n.population.by_profession = {};
    if (n.population.total == null) n.population.total = 0;
    if (n.population.happiness == null) n.population.happiness = 50;
    if (!n.military) n.military = {};
    if (!n.military.at_war_with) n.military.at_war_with = [];
    if (!n.government) n.government = {};
    if (n.government.legitimacy == null) n.government.legitimacy = 50;
    if (n.government.stability  == null) n.government.stability  = 50;
    if (!n.regions) n.regions = [];
    if (!n.relations) n.relations = {};
  }
}

// ──────────────────────────────────────────────────────────────
// 3. Тик одного хода (подмножество processTurn из engine/turn.js)
// ──────────────────────────────────────────────────────────────
function runOneTurn(ctx, t, mode) {
  ctx.GAME_STATE.turn = t;

  // Экономика (основной тик)
  if (typeof ctx.runEconomyTick === 'function') {
    ctx.runEconomyTick();
  }

  // Расширения (монополии, инфляция, циклы, специализация, tech drift)
  if (typeof ctx.runEconomyExtTick === 'function') {
    ctx.runEconomyExtTick();
  }

  // Займы — по каждой нации отдельно
  if (typeof ctx.processLoanPayments === 'function') {
    for (const nId of Object.keys(ctx.GAME_STATE.nations)) {
      try { ctx.processLoanPayments(nId); } catch (_) {}
    }
  }

  // История баланса (кольцевой буфер 24)
  if (typeof ctx.recordEconomyHistory === 'function') {
    ctx.recordEconomyHistory();
  }

  // Демография — ежеходовой рост/смерть/миграция
  if (typeof ctx.processDemography === 'function') {
    ctx.processDemography();
  }
  if (typeof ctx.recordPopulationHistory === 'function') {
    ctx.recordPopulationHistory();
  }

  // AI-решения (в mode=fast пропускаем — выигрыш ~30-40%)
  if (mode === 'full' && typeof ctx.applyFallbackDecision === 'function') {
    for (const nId of Object.keys(ctx.GAME_STATE.nations)) {
      try { ctx.applyFallbackDecision(nId); } catch (_) {}
    }
  }

  // Этап 3 economic3.md — money audit (в браузере это вызывается из processTurn
  // в конце тика; в vm-harness вызываем вручную).
  if (typeof ctx._auditMoneyConservation === 'function') {
    try { ctx._auditMoneyConservation(); } catch (_) {}
  }
}

// ──────────────────────────────────────────────────────────────
// 4. Основной цикл
// ──────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  const absOut = path.resolve(ROOT, args.output);

  // Создаём каталог output'а, если нужно.
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  // Чистим предыдущий прогон.
  if (fs.existsSync(absOut)) fs.unlinkSync(absOut);

  if (!args.quiet) {
    console.log(`[harness] turns=${args.turns} seed=${args.seed} mode=${args.mode} → ${args.output}`);
    console.log(`[harness] строим vm-контекст...`);
  }

  const tStart = Date.now();
  const ctx = buildContext(args.seed);
  const tBuilt = Date.now();

  if (!args.quiet) {
    const nationsCount = Object.keys(ctx.GAME_STATE.nations).length;
    console.log(`[harness] контекст готов за ${tBuilt - tStart}ms, наций в GAME_STATE: ${nationsCount}`);
  }

  // Поток записи (appendFileSync × N вместо одного huge-буфера — для стабильной памяти).
  const fd = fs.openSync(absOut, 'w');
  let bytesWritten = 0;

  try {
    for (let t = 1; t <= args.turns; t++) {
      runOneTurn(ctx, t, args.mode);
      const snap = captureSnapshot(ctx.GAME_STATE, t);
      const line = JSON.stringify(snap) + '\n';
      bytesWritten += fs.writeSync(fd, line);

      if (!args.quiet && (t % 50 === 0 || t === args.turns)) {
        const elapsed = (Date.now() - tBuilt) / 1000;
        const rate = t / elapsed;
        console.log(`  ход ${t}/${args.turns}  (${rate.toFixed(1)} ходов/с, ${(bytesWritten / 1024).toFixed(0)} KB)`);
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  const tEnd = Date.now();
  const meta = {
    seed: args.seed,
    turns: args.turns,
    mode: args.mode,
    nations_count: Object.keys(ctx.GAME_STATE.nations).length,
    elapsed_ms: tEnd - tStart,
    build_ms: tBuilt - tStart,
    sim_ms: tEnd - tBuilt,
    bytes_written: bytesWritten,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(absOut + '.meta.json', JSON.stringify(meta, null, 2));

  if (!args.quiet) {
    console.log(`[harness] готово за ${meta.elapsed_ms}ms (сборка ${meta.build_ms}ms, симуляция ${meta.sim_ms}ms)`);
    console.log(`[harness] записано ${(bytesWritten / 1024).toFixed(1)} KB в ${args.output}`);
  }
}

main();
