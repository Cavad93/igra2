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
  buildGraphPrompt, buildFixPrompt,
  buildImprovementPrompt,
} from './prompts.js';
import {
  validateChain, validateCrossChains,
  formatIssues, SEVERITY,
} from './validator.js';
import { calibrateChain } from './calibrator.js';
import { scoreChain, SCORE_THRESHOLD } from './scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '..', 'data');

// ─── Константы ───────────────────────────────────────────────────────────────

const MODEL            = 'claude-sonnet-4-6';
const MAX_TOKENS       = 4000;
const MAX_TOKENS_LARGE = 8000;   // для historical / graph промптов
const MAX_TOKENS_SMALL = 1500;   // для validator (короткий ответ)
const TEMPERATURE      = 0;
const DELAY_MS         = 1200;
const RETRY_MAX        = 4;
const FIX_MAX          = 3;

// ─── callClaude ───────────────────────────────────────────────────────────────

async function callClaude(apiKey, system, user, options = {}) {
  const maxTokens = options.maxTokens ?? MAX_TOKENS;
  const attempt   = options.attempt   ?? 0;

  const body = {
    model:       MODEL,
    max_tokens:  maxTokens,
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
      log(`    [retry ${attempt + 1}] сетевая ошибка, жду ${delay / 1000}с...`);
      await sleep(delay);
      return callClaude(apiKey, system, user, { ...options, attempt: attempt + 1 });
    }
    throw new Error(`fetch failed: ${fetchErr.message}`);
  }

  // 429 — rate limit: уважаем Retry-After заголовок
  if (response.status === 429) {
    if (attempt < RETRY_MAX) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
      const delay = (retryAfter + 5) * 1000;
      log(`    [retry ${attempt + 1}] rate limit, жду ${retryAfter + 5}с...`);
      await sleep(delay);
      return callClaude(apiKey, system, user, { ...options, attempt: attempt + 1 });
    }
    throw new Error('Rate limit превышен, попытки исчерпаны');
  }

  // 529 — API перегружен (Anthropic-специфичный код)
  if (response.status === 529) {
    if (attempt < RETRY_MAX) {
      const delay = 30_000 * (attempt + 1);
      log(`    [retry ${attempt + 1}] API перегружен (529), жду ${delay / 1000}с...`);
      await sleep(delay);
      return callClaude(apiKey, system, user, { ...options, attempt: attempt + 1 });
    }
    throw new Error('API перегружен (529), попытки исчерпаны');
  }

  // 5xx — серверная ошибка с экспоненциальным backoff
  if (response.status >= 500) {
    if (attempt < RETRY_MAX) {
      const delay = 10_000 * Math.pow(2, attempt);
      log(`    [retry ${attempt + 1}] ошибка сервера ${response.status}, жду ${delay / 1000}с...`);
      await sleep(delay);
      return callClaude(apiKey, system, user, { ...options, attempt: attempt + 1 });
    }
    throw new Error(`API ошибка ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw  = data?.content?.[0]?.text ?? '';

  // Вырезаем markdown-блок если Claude завернул ответ
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

// ─── rebuildConnectorsLocally ─────────────────────────────────────────────────
// Детерминированный пересчёт upstream/downstream/critical_node без API.
// Алгоритм:
//   upstream_chains[A]   = { B : B ∈ chains ∧ A использует B как local/deposit input }
//   downstream_chains[A] = { B : B ∈ chains ∧ B использует A как local/deposit input }
//   critical_node[A]     = |downstream_chains[A]| ≥ 3
//   economic_loops       = циклы, найденные DFS по downstream-рёбрам

function rebuildConnectorsLocally(chains) {
  const chainIds = new Set(Object.keys(chains));

  for (const [gId, chain] of Object.entries(chains)) {
    // upstream: inputs с source≠import, для которых существует цепочка
    chain.upstream_chains = [
      ...new Set(
        (chain.inputs ?? [])
          .filter(i => i.source !== 'import' && chainIds.has(i.good) && i.good !== gId)
          .map(i => i.good)
      ),
    ];

    // downstream: все цепочки, которые потребляют этот товар как non-import input
    chain.downstream_chains = Object.entries(chains)
      .filter(([otherId, other]) =>
        otherId !== gId &&
        (other.inputs ?? []).some(i => i.good === gId && i.source !== 'import')
      )
      .map(([id]) => id);

    chain.critical_node    = chain.downstream_chains.length >= 3;
    chain.blocks_if_missing = chain.downstream_chains;
  }

  // Обнаружение циклов через DFS, запись в economic_loops каждого узла цикла
  const cycles = detectCycles(chains);
  for (const cycle of cycles) {
    const cycleStr = [...cycle, cycle[0]].join(' → ');
    for (const nodeId of cycle) {
      if (!chains[nodeId]) continue;
      if (!Array.isArray(chains[nodeId].economic_loops)) chains[nodeId].economic_loops = [];
      if (!chains[nodeId].economic_loops.includes(cycleStr)) {
        chains[nodeId].economic_loops.push(cycleStr);
      }
    }
  }

  return chains;
}

function detectCycles(chains) {
  const cycles    = [];
  const visited   = new Set();
  const inStack   = new Set();
  const cycleSeen = new Set();

  function dfs(nodeId, path) {
    if (inStack.has(nodeId)) {
      const start = path.indexOf(nodeId);
      const cycle = path.slice(start);
      const key   = [...cycle].sort().join(',');
      if (!cycleSeen.has(key)) { cycleSeen.add(key); cycles.push(cycle); }
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);
    for (const nextId of (chains[nodeId]?.downstream_chains ?? [])) {
      if (chains[nextId]) dfs(nextId, [...path]);
    }
    inStack.delete(nodeId);
  }

  for (const id of Object.keys(chains)) dfs(id, []);
  return cycles;
}

// ─── classifyErrors ───────────────────────────────────────────────────────────

function classifyErrors(errors) {
  const codes = errors.map(e => e.code);
  return {
    allRef:      codes.every(c => c.startsWith('REF_') || c.includes('INVALID')),
    allNumeric:  codes.every(c => c.includes('QTY') || c.includes('RATIO') || c.includes('PER_TURN') || c.includes('TOTAL')),
    hasBiome:    codes.some(c => c.includes('BIOME')),
    hasWorkers:  codes.some(c => c.includes('WORKER')),
    hasBuilding: codes.some(c => c.includes('BUILDING')),
    hasOutput:   codes.some(c => c.includes('OUTPUT')),
  };
}

// ─── fixAndValidate ───────────────────────────────────────────────────────────

async function fixAndValidate(apiKey, chain, issues, allData, emit, crossMode = false, allChains = {}) {
  let current      = chain;
  let currentIssues = issues;

  for (let attempt = 1; attempt <= FIX_MAX; attempt++) {
    const errors = currentIssues.filter(i => i.severity === SEVERITY.ERR);
    if (errors.length === 0) break;

    const cls = classifyErrors(errors);
    const strategy = cls.allRef      ? 'use_reference_lists'
                   : cls.allNumeric  ? 'fix_numbers'
                   : cls.hasBiome    ? 'check_biome_keys'
                   : cls.hasWorkers  ? 'use_labor_constraints'
                   : cls.hasBuilding ? 'fix_building'
                   : cls.hasOutput   ? 'fix_output'
                   : 'general';

    emit({ type: 'fix', goodId: current.good_id, attempt, errorCount: errors.length, strategy });
    log(`    [fix ${attempt}/${FIX_MAX}] ${errors.length} ошибок → стратегия: ${strategy}`);

    const fixCtx = {
      chain: current, issues: currentIssues, allData, crossMode, allChains,
      strategy,
      example_chains: crossMode
        ? Object.entries(allChains).slice(0, 2).map(([id, c]) => ({
            good_id: id, building: c.building, workers: c.workers, ownership: c.ownership,
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
        current      = fixed;
        currentIssues = newIssues;
        if (remainingErrors.length === 0) {
          emit({ type: 'fixed', goodId: current.good_id, attempt });
          break;
        }
      } else {
        warn(`    [fix ${attempt}] ошибки не уменьшились (${remainingErrors.length})`);
        // Не прерываем — следующая попытка с другой стратегией
      }
    } catch (e) {
      warn(`    [fix ${attempt}] ошибка API: ${e.message}`);
      break;
    }
  }

  return { chain: current, issues: currentIssues };
}

// ─── improveChain ─────────────────────────────────────────────────────────────
// Улучшает цепочку с quality_score < SCORE_THRESHOLD.
// Не трогает структурно правильные поля — только наращивает качество.

async function improveChain(apiKey, chain, scoreBreakdown, allData, emit) {
  emit({ type: 'improve', goodId: chain.good_id, score: chain.quality_score });
  log(`    [improve] score=${chain.quality_score}/100 < ${SCORE_THRESHOLD}, улучшаю...`);

  try {
    const { system: si, user: ui } = buildImprovementPrompt({ chain, scoreBreakdown, allData });
    const improved = await callClaude(apiKey, si, ui);
    if (!improved || typeof improved !== 'object') throw new Error('пустой или невалидный ответ');

    improved.good_id = chain.good_id;

    // Калибровка числовых полей
    const { chain: calibrated } = calibrateChain(improved, allData);

    // Проверяем: улучшение не должно создавать новые ERR
    const newIssues = validateChain(calibrated, allData);
    const newErrors = newIssues.filter(i => i.severity === SEVERITY.ERR);
    if (newErrors.length > 0) {
      warn(`    [improve] создало ${newErrors.length} новых ошибок — откат`);
      return { chain, issues: validateChain(chain, allData) };
    }

    const { score: newScore, grade: newGrade } = scoreChain(calibrated, allData, newIssues);
    if (newScore > chain.quality_score) {
      log(`    [improve] score: ${chain.quality_score} → ${newScore} (${newGrade})`);
      emit({ type: 'improved', goodId: chain.good_id, score: newScore, grade: newGrade });
      calibrated.quality_score = newScore;
      calibrated.quality_grade = newGrade;
      calibrated.validation_warnings = newIssues
        .filter(i => i.severity === SEVERITY.WARN).map(w => w.msg);
      return { chain: calibrated, issues: newIssues };
    }

    warn(`    [improve] score не вырос (${newScore} <= ${chain.quality_score}) — откат`);
  } catch (e) {
    warn(`    [improve] ошибка API: ${e.message}`);
  }

  return { chain, issues: validateChain(chain, allData) };
}

// ─── processGood ─────────────────────────────────────────────────────────────

async function processGood(apiKey, goodId, allData, existingChains, emit, historicalCtx = null) {

  // ── Шаг 1: Аналитик ───────────────────────────────────────────────────────
  emit({ type: 'step', goodId, step: 1, label: 'аналитик' });
  const { system: s1, user: u1 } = buildAnalystPrompt({ goodId, allData });
  const analystResult = await callClaude(apiKey, s1, u1, { maxTokens: 2000 });

  // ── Шаги 2+3: Производственная механика и трудовые отношения (параллельно) ─
  // Оба зависят только от analystResult — запускаем одновременно
  emit({ type: 'step', goodId, step: 2, label: 'механика + труд (параллельно)' });
  const hCtx = historicalCtx?.[goodId] ?? null;
  const { system: s2a, user: u2a } = buildQuantityPrompt({ goodId, allData, analystResult, historicalCtx: hCtx });
  const { system: s2b, user: u2b } = buildLaborPrompt({ goodId, allData, analystResult, quantityResult: null, historicalCtx: hCtx });
  const [quantityResult, laborResult] = await Promise.all([
    callClaude(apiKey, s2a, u2a),
    callClaude(apiKey, s2b, u2b),
  ]);
  emit({ type: 'step', goodId, step: 3, label: 'трудовые отношения' });

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
  const validatorResult = await callClaude(apiKey, s4, u4, { maxTokens: MAX_TOKENS_SMALL });

  // ── Сборка финального объекта ──────────────────────────────────────────────
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
  if (adjustments.length > 0) log(`    калибровка: ${adjustments.join('; ')}`);

  // ── Шаг 7: Структурная валидация ──────────────────────────────────────────
  emit({ type: 'step', goodId, step: 7, label: 'структурная валидация' });
  let issues = validateChain(chain, allData);
  const errCount  = issues.filter(i => i.severity === SEVERITY.ERR).length;
  const warnCount = issues.filter(i => i.severity === SEVERITY.WARN).length;
  log(`    валидация: ${errCount} ошибок, ${warnCount} предупреждений`);

  if (errCount > 0) {
    log(formatIssues(issues.filter(i => i.severity === SEVERITY.ERR), goodId));
    const result = await fixAndValidate(apiKey, chain, issues, allData, emit);
    chain  = result.chain;
    issues = result.issues;

    const stillErrors = issues.filter(i => i.severity === SEVERITY.ERR);
    if (stillErrors.length > 0) {
      logError(goodId, stillErrors.map(e => e.code), formatIssues(stillErrors));
      emit({ type: 'validation_failed', goodId, errors: stillErrors.map(e => e.msg) });
      return null;
    }
  }

  chain.validation_warnings = issues.filter(i => i.severity === SEVERITY.WARN).map(w => w.msg);

  // ── Шаг 8: Скоринг ────────────────────────────────────────────────────────
  emit({ type: 'step', goodId, step: 8, label: 'скоринг' });
  let { score, grade, breakdown } = scoreChain(chain, allData, issues);
  chain.quality_score = score;
  chain.quality_grade = grade;
  emit({ type: 'scored', goodId, score, grade });
  log(`    оценка качества: ${score}/100 (${grade})`);

  // ── Шаг 9: Улучшение при score < SCORE_THRESHOLD ──────────────────────────
  if (score < SCORE_THRESHOLD) {
    emit({ type: 'step', goodId, step: 9, label: 'улучшение качества' });
    const result = await improveChain(apiKey, chain, breakdown, allData, emit);
    chain  = result.chain;
    issues = result.issues;
    score  = chain.quality_score;
    grade  = chain.quality_grade;
  }

  return chain;
}

// ─── runBuilder ───────────────────────────────────────────────────────────────

export async function runBuilder(apiKey, emit = () => {}) {
  if (!apiKey) throw new Error('API ключ не передан');

  // Назначаем _stop ДО начала loop — чтобы SIGINT сработал немедленно
  let stopped = false;
  emit._stop = () => {
    stopped = true;
    warn('Получена команда остановки — завершу текущий товар...');
  };

  emit({ type: 'log', level: 'log', msg: 'Загрузка входных файлов...' });
  const allData        = loadAllInputs();
  const existingChains = loadExistingChains();

  const allGoods = Object.keys(allData.GOODS);
  const done     = new Set(Object.keys(existingChains));
  const queue    = allGoods.filter(id => !done.has(id));

  emit({ type: 'status', total: allGoods.length, done: done.size, queue: queue.length });
  log(`  Товаров: ${allGoods.length} | готово: ${done.size} | в очереди: ${queue.length}`);

  // ── Промпт 0: Исторический исследователь (батчами по 15 товаров) ──────────
  let historicalCtx = null;
  if (queue.length > 0) {
    const BATCH_SIZE = 15;
    const batches = [];
    for (let i = 0; i < allGoods.length; i += BATCH_SIZE) {
      batches.push(allGoods.slice(i, i + BATCH_SIZE));
    }
    historicalCtx = {};
    let batchFailed = 0;
    for (let b = 0; b < batches.length; b++) {
      emit({ type: 'log', level: 'log', msg: `Исторический исследователь [${b + 1}/${batches.length}]...` });
      try {
        const { system: sh, user: uh } = buildHistoricalPrompt({ allData }, batches[b]);
        const part = await callClaude(apiKey, sh, uh, { maxTokens: MAX_TOKENS_LARGE });
        Object.assign(historicalCtx, part);
      } catch (e) {
        batchFailed++;
        warn(`  Исторический батч ${b + 1} не удался: ${e.message}`);
      }
      if (b < batches.length - 1) await sleep(DELAY_MS);
    }
    const coveredGoods = Object.keys(historicalCtx).length;
    if (coveredGoods > 0) {
      emit({ type: 'log', level: 'ok',
        msg: `Исторический контекст: ${coveredGoods}/${allGoods.length} товаров` });
    } else {
      warn('  Все батчи не удались — продолжаю без исторического контекста');
      historicalCtx = null;
    }
    await sleep(DELAY_MS);
  }

  // ── Основной цикл ─────────────────────────────────────────────────────────
  let current = done.size;
  for (const goodId of queue) {
    if (stopped) {
      emit({ type: 'log', level: 'warn', msg: 'Остановлено пользователем.' });
      break;
    }

    current++;
    emit({ type: 'progress', current, total: allGoods.length, goodId });

    try {
      const chain = await processGood(
        apiKey, goodId, allData, existingChains, emit, historicalCtx
      );
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

  // ── Детерминированный пересчёт графа связей (без API, всегда точный) ──────
  if (!stopped && Object.keys(existingChains).length > 1) {
    emit({ type: 'log', level: 'log',
      msg: 'Пересчёт графа связей (детерминированно, без API)...' });
    rebuildConnectorsLocally(existingChains);
    let savedCount = 0;
    for (const [gId, ch] of Object.entries(existingChains)) {
      appendChain(gId, ch);
      savedCount++;
    }
    emit({ type: 'log', level: 'ok', msg: `Граф связей обновлён: ${savedCount} цепочек` });
    await sleep(500);
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
      const byChain = {};
      for (const issue of crossErrors) {
        if (!byChain[issue.chainId]) byChain[issue.chainId] = [];
        byChain[issue.chainId].push(issue);
      }
      for (const [chainId, chainIssues] of Object.entries(byChain)) {
        emit({ type: 'log', level: 'warn', msg: `  Исправляю: "${chainId}"` });
        const { chain: fixed } = await fixAndValidate(
          apiKey, existingChains[chainId], chainIssues, allData, emit,
          true, existingChains
        );
        existingChains[chainId] = fixed;
        appendChain(chainId, fixed);
        await sleep(DELAY_MS);
      }
      emit({ type: 'log', level: 'ok', msg: 'Межцепочечные ошибки исправлены' });
    }
  }

  // ── Финальный граф (Claude анализирует топологию — компактный контекст) ───
  if (!stopped) {
    emit({ type: 'log', level: 'log', msg: 'Строю итоговый граф...' });
    try {
      const { system: sg, user: ug } = buildGraphPrompt({ completeChainsData: existingChains });
      const graph = await callClaude(apiKey, sg, ug, { maxTokens: MAX_TOKENS_LARGE });
      fs.writeFileSync(
        path.join(DATA_DIR, 'chains_graph.js'),
        [
          '// AUTO-GENERATED by agents/chain_builder.js',
          `// Дата: ${new Date().toISOString()}`,
          '',
          `var CHAINS_GRAPH = ${JSON.stringify(graph, null, 2)};`,
          '',
        ].join('\n'),
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

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    err('Установи ANTHROPIC_API_KEY перед запуском');
    process.exit(1);
  }

  const emit = (ev) => {
    if      (ev.type === 'progress')          progress(ev.current, ev.total, ev.goodId);
    else if (ev.type === 'done')              ok(`${ev.goodId} записан [${ev.score ?? '?'}/100]`);
    else if (ev.type === 'skipped')           warn(`${ev.goodId} пропущен`);
    else if (ev.type === 'validation_failed') err(`${ev.goodId} не прошёл валидацию`);
    else if (ev.type === 'scored')            log(`  оценка: ${ev.score}/100 (${ev.grade})`);
    else if (ev.type === 'improve')           warn(`  [improve] ${ev.goodId}: score=${ev.score} < ${SCORE_THRESHOLD}`);
    else if (ev.type === 'improved')          ok(`  ${ev.goodId} улучшен → ${ev.score}/100 (${ev.grade})`);
    else if (ev.type === 'fix')               warn(`  [fix ${ev.attempt}/${FIX_MAX}] ${ev.goodId}: ${ev.errorCount} ERR [${ev.strategy ?? 'general'}]`);
    else if (ev.type === 'fixed')             ok(`  ${ev.goodId} исправлен за ${ev.attempt} попытки`);
    else if (ev.type === 'cross_validation')  log(`  Межцепочечная: ${ev.errorCount} ERR, ${ev.warnCount} WARN`);
    else if (ev.type === 'error')             err(`${ev.goodId}: ${ev.msg}`);
    else if (ev.type === 'step')              log(`  [${ev.step}] ${ev.label}...`);
    else if (ev.type === 'log')               log(ev.msg);
    else if (ev.type === 'finished') {
      console.log('\n' + '═'.repeat(50));
      console.log(`  Обработано: ${ev.processed}/${ev.total}`);
      console.log('═'.repeat(50));
    }
  };

  // SIGINT: грациозная остановка — дожидаемся конца текущего товара и сохраняем
  process.on('SIGINT', () => {
    warn('\nПолучен SIGINT — завершаю текущий товар и сохраняю...');
    if (emit._stop) emit._stop();
  });

  runBuilder(apiKey, emit)
    .then(() => process.exit(0))
    .catch(e => { err(`Критическая ошибка: ${e.message}\n${e.stack}`); process.exit(1); });
}

// ЗАПУСК:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node agents/chain_builder.js
//
// ЧЕРЕЗ БРАУЗЕР:
//   node agents/server.js → http://localhost:3000
