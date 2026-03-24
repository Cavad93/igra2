// agents/chain_builder.js — главный файл агента Pax Historia Chain Builder

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { log, ok, err, warn, progress } from './logger.js';
import {
  loadAllInputs, loadExistingChains,
  appendChain, logError,
} from './file_io.js';
import {
  buildAnalystPrompt, buildHistoricalPrompt,
  buildQuantityPrompt, buildLaborPrompt,
  buildConnectorPrompt, buildValidatorPrompt,
  buildRebuildConnectorPrompt,
  buildGraphPrompt, buildFixPrompt,
} from './prompts.js';
import {
  validateChain, validateCrossChains,
  formatIssues, hasErrors, SEVERITY,
} from './validator.js';
import { calibrateChain } from './calibrator.js';
import { scoreChain, SCORE_THRESHOLD } from './scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '..', 'data');

// ─── Константы ───────────────────────────────────────────────────────────────

const MODEL        = 'claude-sonnet-4-6-20260218';
const MAX_TOKENS   = 3000;   // увеличено: разделённые промпты дают более полные ответы
const TEMPERATURE  = 0;
const DELAY_MS     = 600;
const RETRY_MAX    = 3;
const FIX_MAX      = 2;      // максимум попыток авто-исправления на цепочку

// ─── callClaude ───────────────────────────────────────────────────────────────

async function callClaude(apiKey, system, user, attempt = 0) {
  const body = {
    model:       MODEL,
    max_tokens:  MAX_TOKENS,
    temperature: TEMPERATURE,
    system,
    messages: [{ role: 'user', content: user }],
  };

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    if (attempt < RETRY_MAX) {
      const delay = 10_000 * Math.pow(2, attempt);
      await sleep(delay);
      return callClaude(apiKey, system, user, attempt + 1);
    }
    throw new Error(`fetch failed: ${fetchErr.message}`);
  }

  if (response.status === 429) {
    if (attempt < RETRY_MAX) {
      await sleep(60_000);
      return callClaude(apiKey, system, user, attempt + 1);
    }
    throw new Error('Rate limit превышен');
  }

  if (response.status >= 500) {
    if (attempt < RETRY_MAX) {
      const delay = 10_000 * Math.pow(2, attempt);
      await sleep(delay);
      return callClaude(apiKey, system, user, attempt + 1);
    }
    throw new Error(`API ошибка ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw  = data?.content?.[0]?.text ?? '';

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/,      '')
    .replace(/\s*```\s*$/,   '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(`JSON parse error: ${parseErr.message} | raw: ${raw.slice(0, 300)}`);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── processGood ─────────────────────────────────────────────────────────────

// ─── fixAndValidate — авто-исправление одной цепочки ─────────────────────────

// ─── classifyErrors — классификация типов ошибок для smart retry ─────────────

function classifyErrors(errors) {
  const codes = errors.map(e => e.code);
  const allRef     = codes.every(c => c.startsWith('REF_') || c.startsWith('INVALID_') || c.includes('INVALID'));
  const allNumeric = codes.every(c => c.includes('QTY') || c.includes('RATIO') || c.includes('PER_TURN') || c.includes('TOTAL'));
  const hasBiome   = codes.some(c => c.includes('BIOME'));
  const hasWorkers = codes.some(c => c.includes('WORKER'));
  return { allRef, allNumeric, hasBiome, hasWorkers };
}

// ─── fixAndValidate — авто-исправление с адаптивной стратегией ───────────────

async function fixAndValidate(apiKey, chain, issues, allData, emit, crossMode = false, allChains = {}) {
  let current = chain;
  let currentIssues = issues;

  for (let attempt = 1; attempt <= FIX_MAX; attempt++) {
    const errors = currentIssues.filter(i => i.severity === SEVERITY.ERR);
    if (errors.length === 0) break;

    emit({ type: 'fix', goodId: current.good_id, attempt, errorCount: errors.length });
    log(`    [fix ${attempt}/${FIX_MAX}] ${errors.length} ошибок → запрашиваю исправление...`);

    // ── Адаптивная стратегия: меняем контекст в зависимости от типа ошибок ──
    const { allRef, allNumeric, hasBiome, hasWorkers } = classifyErrors(errors);
    const fixCtx = {
      chain: current, issues: currentIssues, allData, crossMode, allChains,
      // Подсказки для стратегии исправления
      strategy: allRef     ? 'use_reference_lists'    // ERR только в ID — дать полные списки
               : allNumeric ? 'fix_numbers'             // ERR только числа — откорректировать
               : hasBiome   ? 'check_biome_keys'        // ERR в biome — дать список биомов
               : hasWorkers ? 'use_labor_constraints'   // ERR в workers — дать labor_ref
               : 'general',                             // смешанные — общее исправление
      // Примеры успешных цепочек для контекста (если они есть)
      example_chains: crossMode
        ? Object.entries(allChains).slice(0, 2).map(([id, c]) => ({
            good_id: id, building: c.building,
            workers: c.workers, ownership: c.ownership,
          }))
        : [],
    };

    try {
      const { system: sf, user: uf } = buildFixPrompt(fixCtx);
      const fixed = await callClaude(apiKey, sf, uf);

      fixed.good_id = current.good_id;

      const newIssues = crossMode
        ? validateCrossChains({ ...allChains, [current.good_id]: fixed })
            .filter(i => i.chainId === current.good_id)
        : validateChain(fixed, allData);

      const remainingErrors = newIssues.filter(i => i.severity === SEVERITY.ERR);

      if (remainingErrors.length < errors.length) {
        log(`    [fix ${attempt}] исправлено: ${errors.length - remainingErrors.length} ошибок`);
        current = fixed;
        currentIssues = newIssues;
        if (remainingErrors.length === 0) {
          emit({ type: 'fixed', goodId: current.good_id, attempt });
          break;
        }
      } else {
        warn(`    [fix ${attempt}] ошибки не уменьшились (${remainingErrors.length})`);
        break;
      }
    } catch (e) {
      warn(`    [fix ${attempt}] ошибка API: ${e.message}`);
      break;
    }
  }

  return { chain: current, issues: currentIssues };
}

// ─── processGood ─────────────────────────────────────────────────────────────

async function processGood(apiKey, goodId, allData, existingChains, emit, historicalCtx = null) {
  // ── Шаг 1: Аналитик — где производится, откуда импортируется ──────────────
  emit({ type: 'step', goodId, step: 1, label: 'аналитик' });
  const { system: s1, user: u1 } = buildAnalystPrompt({ goodId, allData });
  const analystResult = await callClaude(apiKey, s1, u1);

  // ── Шаг 2a: Производственная механика (quantity) ───────────────────────────
  emit({ type: 'step', goodId, step: 2, label: 'механика производства' });
  const { system: s2a, user: u2a } = buildQuantityPrompt({
    goodId, allData, analystResult,
    historicalCtx: historicalCtx?.[goodId] ?? null,
  });
  const quantityResult = await callClaude(apiKey, s2a, u2a);

  // ── Шаг 3: Трудовые отношения (labor) ─────────────────────────────────────
  emit({ type: 'step', goodId, step: 3, label: 'трудовые отношения' });
  const { system: s2b, user: u2b } = buildLaborPrompt({
    goodId, allData, analystResult, quantityResult,
    historicalCtx: historicalCtx?.[goodId] ?? null,
  });
  const laborResult = await callClaude(apiKey, s2b, u2b);

  // ── Шаг 4: Связи между цепочками ──────────────────────────────────────────
  emit({ type: 'step', goodId, step: 4, label: 'связи' });
  const chainResult = { ...quantityResult, ...laborResult };
  const { system: s3, user: u3 } = buildConnectorPrompt({
    goodId, allData, chainResult, existingChains,
  });
  const connectorResult = await callClaude(apiKey, s3, u3);

  // ── Шаг 5: Семантическая валидация Claude ─────────────────────────────────
  emit({ type: 'step', goodId, step: 5, label: 'валидация Claude' });
  const allResults = { ...analystResult, ...chainResult, ...connectorResult };
  const { system: s4, user: u4 } = buildValidatorPrompt({ goodId, allResults, allData });
  const validatorResult = await callClaude(apiKey, s4, u4);

  // ── Собираем финальный объект ──────────────────────────────────────────────
  let chain = {
    good_id:              goodId,
    generated_at:         new Date().toISOString(),
    pdf_chain_ids:        analystResult.relevant_pdf_chain_ids   ?? [],
    production_possible:  analystResult.production_possible      ?? false,
    production_locations: analystResult.production_locations     ?? [],
    import_required:      analystResult.import_required          ?? false,
    import_sources:       analystResult.import_sources           ?? [],
    building:             quantityResult.building                ?? null,
    inputs:               quantityResult.inputs                  ?? [],
    output:               quantityResult.output                  ?? {},
    output_per_turn:      quantityResult.output_per_turn         ?? 0,
    biome_modifiers:      quantityResult.biome_modifiers         ?? {},
    bottleneck:           quantityResult.bottleneck              ?? '',
    alternative_good:     quantityResult.alternative_good        ?? null,
    workers:              laborResult.workers                    ?? {},
    ownership:            laborResult.ownership                  ?? {},
    upstream_chains:      connectorResult.upstream_chains        ?? [],
    downstream_chains:    connectorResult.downstream_chains      ?? [],
    critical_node:        connectorResult.critical_node          ?? false,
    blocks_if_missing:    connectorResult.blocks_if_missing      ?? [],
    class_conflicts:      connectorResult.class_conflicts        ?? [],
    economic_loops:       connectorResult.economic_loops         ?? [],
    warnings:             validatorResult.warnings               ?? [],
  };

  // ── Шаг 6: Калибровка числовых полей (без API) ────────────────────────────
  emit({ type: 'step', goodId, step: 6, label: 'калибровка' });
  const { chain: calibrated, adjustments } = calibrateChain(chain, allData);
  chain = calibrated;
  if (adjustments.length > 0) {
    log(`    калибровка: ${adjustments.join('; ')}`);
  }

  // ── Шаг 7: Структурная валидация ──────────────────────────────────────────
  emit({ type: 'step', goodId, step: 7, label: 'структурная валидация' });
  let issues = validateChain(chain, allData);
  const errCount  = issues.filter(i => i.severity === SEVERITY.ERR).length;
  const warnCount = issues.filter(i => i.severity === SEVERITY.WARN).length;
  log(`    валидация: ${errCount} ошибок, ${warnCount} предупреждений`);

  if (errCount > 0) {
    log(formatIssues(issues.filter(i => i.severity === SEVERITY.ERR), goodId));
    const result = await fixAndValidate(apiKey, chain, issues, allData, emit);
    chain = result.chain;
    issues = result.issues;

    const stillErrors = issues.filter(i => i.severity === SEVERITY.ERR);
    if (stillErrors.length > 0) {
      logError(goodId, stillErrors.map(e => e.code), formatIssues(stillErrors));
      emit({ type: 'validation_failed', goodId, errors: stillErrors.map(e => e.msg) });
      return null;
    }
  }

  chain.validation_warnings = issues.filter(i => i.severity === SEVERITY.WARN).map(w => w.msg);

  // ── Шаг 8: Скоринг качества ───────────────────────────────────────────────
  const { score, grade, breakdown } = scoreChain(chain, allData, issues);
  chain.quality_score = score;
  chain.quality_grade = grade;
  emit({ type: 'scored', goodId, score, grade });
  log(`    оценка качества: ${score}/100 (${grade})`);

  return chain;
}

// ─── runBuilder — публичная функция (используется сервером и CLI) ─────────────

export async function runBuilder(apiKey, emit = () => {}) {
  if (!apiKey) throw new Error('API ключ не передан');

  emit({ type: 'log', level: 'log', msg: 'Загрузка входных файлов...' });
  const allData = loadAllInputs();
  const existingChains = loadExistingChains();

  const allGoods = Object.keys(allData.GOODS);
  const done     = new Set(Object.keys(existingChains));
  const queue    = allGoods.filter(id => !done.has(id));

  emit({ type: 'status', total: allGoods.length, done: done.size, queue: queue.length });

  let stopped = false;
  emit._stop = () => { stopped = true; };

  // ── Промпт 0: Исторический исследователь (один раз перед циклом) ──────────
  let historicalCtx = null;
  if (queue.length > 0) {
    emit({ type: 'log', level: 'log', msg: 'Исторический исследователь...' });
    try {
      const { system: sh, user: uh } = buildHistoricalPrompt({ allData });
      historicalCtx = await callClaude(apiKey, sh, uh);
      emit({ type: 'log', level: 'ok', msg: `Исторический контекст получен для ${Object.keys(historicalCtx).length} товаров` });
    } catch (e) {
      warn(`  Исторический промпт не удался: ${e.message} — продолжаю без него`);
    }
    await sleep(DELAY_MS);
  }

  let current = done.size;
  for (const goodId of queue) {
    if (stopped) {
      emit({ type: 'log', level: 'warn', msg: 'Остановлено.' });
      break;
    }

    current++;
    emit({ type: 'progress', current, total: allGoods.length, goodId });

    try {
      const chain = await processGood(apiKey, goodId, allData, existingChains, emit, historicalCtx);
      if (chain) {
        appendChain(goodId, chain);
        existingChains[goodId] = chain;
        emit({ type: 'done', goodId, chain, score: chain.quality_score });
      } else {
        emit({ type: 'skipped', goodId });
      }
    } catch (e) {
      emit({ type: 'error', goodId, msg: e.message });
      logError(goodId, e.message, 'processGood');
    }

    await sleep(DELAY_MS);
  }

  // ── Межцепочечная валидация ───────────────────────────────────────────────
  if (!stopped && Object.keys(existingChains).length > 1) {
    emit({ type: 'log', level: 'log', msg: 'Межцепочечная валидация...' });
    const crossIssues = validateCrossChains(existingChains);
    const crossErrors = crossIssues.filter(i => i.severity === SEVERITY.ERR);
    const crossWarns  = crossIssues.filter(i => i.severity === SEVERITY.WARN);

    emit({ type: 'cross_validation', errorCount: crossErrors.length, warnCount: crossWarns.length });
    log(`  Межцепочечная: ${crossErrors.length} ошибок, ${crossWarns.length} предупреждений`);

    if (crossErrors.length > 0) {
      // Группируем ошибки по цепочке
      const byChain = {};
      for (const issue of crossErrors) {
        if (!byChain[issue.chainId]) byChain[issue.chainId] = [];
        byChain[issue.chainId].push(issue);
      }
      // Исправляем каждую затронутую цепочку
      for (const [chainId, chainIssues] of Object.entries(byChain)) {
        emit({ type: 'log', level: 'warn', msg: `  Исправляю межцепочечные ошибки в "${chainId}"...` });
        const { chain: fixed } = await fixAndValidate(
          apiKey, existingChains[chainId], chainIssues, allData, emit,
          true, existingChains
        );
        existingChains[chainId] = fixed;
        // Перезаписываем в файл
        appendChain(chainId, fixed);
      }
      emit({ type: 'log', level: 'ok', msg: `  Межцепочечные ошибки исправлены` });
    }
  }

  // ── Rebuild Connector Pass — пересчёт всех upstream/downstream ───────────
  if (!stopped && Object.keys(existingChains).length > 1) {
    emit({ type: 'log', level: 'log', msg: 'Rebuild connector: пересчёт всех связей...' });
    try {
      const { system: src, user: urc } = buildRebuildConnectorPrompt({ allChains: existingChains, allData });
      const rebuildResult = await callClaude(apiKey, src, urc);

      let updated = 0;
      for (const [gId, links] of Object.entries(rebuildResult)) {
        if (!existingChains[gId]) continue;
        const prev = existingChains[gId];
        existingChains[gId] = {
          ...prev,
          upstream_chains:   links.upstream_chains   ?? prev.upstream_chains,
          downstream_chains: links.downstream_chains ?? prev.downstream_chains,
          critical_node:     links.critical_node     ?? prev.critical_node,
          blocks_if_missing: links.blocks_if_missing ?? prev.blocks_if_missing,
          economic_loops:    links.economic_loops    ?? prev.economic_loops,
        };
        appendChain(gId, existingChains[gId]);
        updated++;
      }
      emit({ type: 'log', level: 'ok', msg: `Rebuild connector: обновлено ${updated} цепочек` });
    } catch (e) {
      warn(`  Rebuild connector не удался: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  // Финальный граф
  if (!stopped) {
    emit({ type: 'log', level: 'log', msg: 'Строю граф связей...' });
    try {
      const { system: sg, user: ug } = buildGraphPrompt({ completeChainsData: existingChains });
      const graph = await callClaude(apiKey, sg, ug);
      fs.writeFileSync(
        path.join(DATA_DIR, 'chains_graph.js'),
        `// AUTO-GENERATED by agents/chain_builder.js\n// Дата: ${new Date().toISOString()}\n\nvar CHAINS_GRAPH = ${JSON.stringify(graph, null, 2)};\n`,
        'utf8',
      );
      emit({ type: 'graph', graph });
    } catch (e) {
      emit({ type: 'error', goodId: '_graph', msg: e.message });
    }
  }

  const processed = Object.keys(existingChains).length;
  emit({ type: 'finished', processed, total: allGoods.length });
  return existingChains;
}

// ─── CLI-запуск (node agents/chain_builder.js) ────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    err('Установи ANTHROPIC_API_KEY');
    process.exit(1);
  }

  let stopFn;
  process.on('SIGINT', () => { if (stopFn) stopFn(); });

  const emit = (ev) => {
    if (ev.type === 'progress') progress(ev.current, ev.total, ev.goodId);
    else if (ev.type === 'done')              ok(`${ev.goodId} записан [${ev.score ?? '?'}/100]`);
    else if (ev.type === 'skipped')           warn(`${ev.goodId} пропущен`);
    else if (ev.type === 'validation_failed') err(`${ev.goodId} не прошёл валидацию`);
    else if (ev.type === 'scored')            log(`  оценка: ${ev.score}/100 (${ev.grade})`);
    else if (ev.type === 'fix')               warn(`  [fix ${ev.attempt}] ${ev.goodId}: ${ev.errorCount} ошибок [стратегия: ${ev.strategy ?? 'general'}]`);
    else if (ev.type === 'fixed')             ok(`  ${ev.goodId} исправлен за ${ev.attempt} попытки`);
    else if (ev.type === 'cross_validation')  log(`  Межцепочечная: ${ev.errorCount} ERR, ${ev.warnCount} WARN`);
    else if (ev.type === 'error')             err(`${ev.goodId}: ${ev.msg}`);
    else if (ev.type === 'step')              log(`  [${ev.step}/8] ${ev.label}...`);
    else if (ev.type === 'log')      log(ev.msg);
    else if (ev.type === 'finished') {
      console.log('\n' + '═'.repeat(50));
      console.log(`  Обработано: ${ev.processed}/${ev.total}`);
      console.log('═'.repeat(50));
    }
  };

  runBuilder(apiKey, emit)
    .then(chains => { stopFn = emit._stop; })
    .catch(e => { err(`Критическая ошибка: ${e.message}`); process.exit(1); });
}

// ЗАПУСК:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node agents/chain_builder.js
//
// ЧЕРЕЗ БРАУЗЕР:
//   node agents/server.js
//   Открой http://localhost:3000
