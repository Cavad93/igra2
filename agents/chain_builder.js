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
  buildAnalystPrompt, buildChainPrompt,
  buildConnectorPrompt, buildValidatorPrompt,
  buildGraphPrompt,
} from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '..', 'data');

// ─── Константы ───────────────────────────────────────────────────────────────

const MODEL       = 'claude-sonnet-4-6-20260218';
const MAX_TOKENS  = 2000;
const TEMPERATURE = 0;
const DELAY_MS    = 600;
const RETRY_MAX   = 3;

const SYSTEM_PROMPT = `Ты архитектор игровой экономики Pax Historia (304 BC, Сицилия).
Используй только реальные исторические данные из контекста.
Отвечай ТОЛЬКО валидным JSON. Никакого текста вне JSON.`;

// ─── callClaude ───────────────────────────────────────────────────────────────

async function callClaude(system, user, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не установлен');

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
      warn(`Сеть недоступна, жду ${delay / 1000}s...`);
      await sleep(delay);
      return callClaude(system, user, attempt + 1);
    }
    throw new Error(`fetch failed: ${fetchErr.message}`);
  }

  if (response.status === 429) {
    if (attempt < RETRY_MAX) {
      warn(`Rate limit (429), жду 60s...`);
      await sleep(60_000);
      return callClaude(system, user, attempt + 1);
    }
    throw new Error('Rate limit превышен');
  }

  if (response.status >= 500) {
    if (attempt < RETRY_MAX) {
      const delay = 10_000 * Math.pow(2, attempt);
      warn(`Ошибка сервера (${response.status}), жду ${delay / 1000}s...`);
      await sleep(delay);
      return callClaude(system, user, attempt + 1);
    }
    throw new Error(`API ошибка ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw  = data?.content?.[0]?.text ?? '';

  // Снимаем markdown-обёртку ```json ... ```
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

async function processGood(goodId, allData, existingChains) {
  // Шаг 1: Аналитик
  log(`  [1/4] аналитик...`);
  const { system: s1, user: u1 } = buildAnalystPrompt({ goodId, allData });
  const analystResult = await callClaude(s1, u1);

  // Шаг 2: Конструктор цепочки
  log(`  [2/4] цепочка...`);
  const { system: s2, user: u2 } = buildChainPrompt({ goodId, allData, analystResult });
  const chainResult = await callClaude(s2, u2);

  // Шаг 3: Коннектор
  log(`  [3/4] связи...`);
  const { system: s3, user: u3 } = buildConnectorPrompt({
    goodId, allData, chainResult, existingChains,
  });
  const connectorResult = await callClaude(s3, u3);

  // Шаг 4: Валидатор
  log(`  [4/4] валидация...`);
  const allResults = { ...analystResult, ...chainResult, ...connectorResult };
  const { system: s4, user: u4 } = buildValidatorPrompt({ goodId, allResults, allData });
  const validatorResult = await callClaude(s4, u4);

  if (!validatorResult.valid) {
    logError(goodId, validatorResult.conflicts, JSON.stringify(validatorResult.warnings));
    return null;
  }

  // Сборка финального объекта
  return {
    good_id:              goodId,
    generated_at:         new Date().toISOString(),
    pdf_chain_ids:        analystResult.relevant_pdf_chain_ids   ?? [],
    production_possible:  analystResult.production_possible      ?? false,
    production_locations: analystResult.production_locations     ?? [],
    import_required:      analystResult.import_required          ?? false,
    import_sources:       analystResult.import_sources           ?? [],
    building:             chainResult.building                   ?? null,
    inputs:               chainResult.inputs                     ?? [],
    output:               chainResult.output                     ?? {},
    workers:              chainResult.workers                    ?? {},
    ownership:            chainResult.ownership                  ?? {},
    output_per_turn:      chainResult.output_per_turn            ?? 0,
    biome_modifiers:      chainResult.biome_modifiers            ?? {},
    bottleneck:           chainResult.bottleneck                 ?? '',
    alternative_good:     chainResult.alternative_good           ?? null,
    upstream_chains:      connectorResult.upstream_chains        ?? [],
    downstream_chains:    connectorResult.downstream_chains      ?? [],
    critical_node:        connectorResult.critical_node          ?? false,
    blocks_if_missing:    connectorResult.blocks_if_missing      ?? [],
    class_conflicts:      connectorResult.class_conflicts        ?? [],
    economic_loops:       connectorResult.economic_loops         ?? [],
    warnings:             validatorResult.warnings               ?? [],
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Graceful shutdown
  let shutdownRequested = false;
  process.on('SIGINT', () => {
    warn('\nПолучен SIGINT. Завершаю текущий товар и останавливаюсь...');
    shutdownRequested = true;
  });

  // 1. Загрузка данных
  log('Загрузка входных файлов...');
  let allData;
  try {
    allData = loadAllInputs();
  } catch (e) {
    err(`Не удалось загрузить входные файлы: ${e.message}`);
    process.exit(1);
  }

  const existingChains = loadExistingChains();

  // 2. Очередь товаров
  const allGoods = Object.keys(allData.GOODS);
  const done     = new Set(Object.keys(existingChains));
  const queue    = allGoods.filter(id => !done.has(id));

  log(`Готово: ${done.size}/${allGoods.length}. К обработке: ${queue.length}`);

  // 3. Основной цикл
  let current = done.size;
  for (const goodId of queue) {
    if (shutdownRequested) {
      warn('Остановлено по запросу пользователя.');
      break;
    }

    current++;
    progress(current, allGoods.length, goodId);

    try {
      const chain = await processGood(goodId, allData, existingChains);

      if (chain) {
        appendChain(goodId, chain);
        existingChains[goodId] = chain;
        ok(`${goodId} записан`);
      } else {
        warn(`${goodId} пропущен — не прошёл валидацию`);
      }
    } catch (e) {
      err(`${goodId} — ошибка: ${e.message}`);
      logError(goodId, e.message, 'processGood');
    }

    await sleep(DELAY_MS);
  }

  // 4. Финальный граф
  if (!shutdownRequested) {
    log('Строю граф связей...');
    try {
      const { system: sg, user: ug } = buildGraphPrompt({ completeChainsData: existingChains });
      const graph = await callClaude(sg, ug);
      fs.writeFileSync(
        path.join(DATA_DIR, 'chains_graph.js'),
        `// AUTO-GENERATED by agents/chain_builder.js\n// Дата: ${new Date().toISOString()}\n\nvar CHAINS_GRAPH = ${JSON.stringify(graph, null, 2)};\n`,
        'utf8',
      );
      ok('chains_graph.js записан');
    } catch (e) {
      err(`Граф не построен: ${e.message}`);
    }
  }

  // 5. Итог
  const processed  = Object.keys(existingChains).length;
  const errorCount = allGoods.length - processed;

  console.log('\n' + '═'.repeat(50));
  console.log('  ИТОГ');
  console.log('═'.repeat(50));
  console.log(`  Обработано: ${processed}/${allGoods.length}`);
  console.log(`  Ошибок/пропущено: ${errorCount}`);
  if (errorCount > 0) console.log('  Подробности: chains_errors.log');
  console.log('═'.repeat(50));
}

main().catch(e => {
  err(`Критическая ошибка: ${e.message}`);
  process.exit(1);
});

// ЗАПУСК:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node agents/chain_builder.js
//
// ВОЗОБНОВЛЕНИЕ (если прервали):
//   node agents/chain_builder.js
//   Агент автоматически продолжит с незавершённых товаров.
//
// ТОЛЬКО ГРАФ (все товары уже обработаны):
//   Агент обнаружит что queue пустой и сразу построит граф.
//
// ОЖИДАЕМОЕ ВРЕМЯ:
//   ~40 товаров × 4 вызова × ~5 сек = ~13 минут
//   + финальный граф ~1 минута
//   Итого: ~15 минут
//
// СТОИМОСТЬ API:
//   ~160 вызовов × ~1500 токенов = ~240 000 токенов
//   claude-sonnet-4: ~$0.72 за весь прогон
