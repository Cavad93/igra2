// agents/validator.js — система валидации производственных цепочек

// ─── Типы ошибок ─────────────────────────────────────────────────────────────
// ERR  — критическая ошибка, требует исправления
// WARN — предупреждение, цепочка ещё может быть записана

export const SEVERITY = { ERR: 'ERR', WARN: 'WARN' };

// ─── validateChain — внутренняя валидация одной цепочки ──────────────────────

export function validateChain(chain, allData) {
  const issues = [];
  const add = (severity, code, msg) => issues.push({ severity, code, msg });

  const VALID_GOODS    = new Set(Object.keys(allData.GOODS));
  const VALID_BUILDINGS = new Set(Object.keys(allData.BUILDINGS));
  const VALID_CLASSES  = new Set(Object.keys(allData.SOCIAL_CLASSES));
  const VALID_BIOMES   = new Set(
    Object.keys(allData.BIOME_META).filter(k => k !== '_region_biomes')
  );
  const VALID_REGIONS  = new Set(Object.keys(allData.REGIONS_DATA));
  const VALID_NATIONS  = new Set(Object.keys(allData.NATIONS));

  // ── 1. Здание ──────────────────────────────────────────────────────────────
  if (!chain.building) {
    add(SEVERITY.ERR, 'MISSING_BUILDING', 'Поле building отсутствует или null');
  } else if (!VALID_BUILDINGS.has(chain.building)) {
    add(SEVERITY.ERR, 'INVALID_BUILDING',
      `building "${chain.building}" не существует в BUILDINGS`);
  }

  // ── 2. Inputs ──────────────────────────────────────────────────────────────
  if (!Array.isArray(chain.inputs)) {
    add(SEVERITY.ERR, 'MISSING_INPUTS', 'Поле inputs должно быть массивом');
  } else {
    for (const inp of chain.inputs) {
      if (!inp.good) {
        add(SEVERITY.ERR, 'INPUT_NO_GOOD', 'Элемент inputs без поля good');
      } else if (!VALID_GOODS.has(inp.good)) {
        add(SEVERITY.ERR, 'INPUT_INVALID_GOOD',
          `inputs[].good "${inp.good}" не существует в GOODS`);
      }
      if (inp.quantity == null || inp.quantity <= 0) {
        add(SEVERITY.WARN, 'INPUT_BAD_QTY',
          `inputs[${inp.good}].quantity должно быть > 0`);
      }
      const validSources = ['local', 'import', 'deposit'];
      if (inp.source && !validSources.includes(inp.source)) {
        add(SEVERITY.WARN, 'INPUT_BAD_SOURCE',
          `inputs[${inp.good}].source "${inp.source}" — должен быть local|import|deposit`);
      }
    }
  }

  // ── 3. Output ──────────────────────────────────────────────────────────────
  if (!chain.output || !chain.output.good) {
    add(SEVERITY.ERR, 'MISSING_OUTPUT', 'Поле output.good отсутствует');
  } else {
    if (!VALID_GOODS.has(chain.output.good)) {
      add(SEVERITY.ERR, 'OUTPUT_INVALID_GOOD',
        `output.good "${chain.output.good}" не существует в GOODS`);
    }
    if (chain.output.good !== chain.good_id) {
      add(SEVERITY.WARN, 'OUTPUT_MISMATCH',
        `output.good "${chain.output.good}" ≠ good_id "${chain.good_id}"`);
    }
    if (!chain.output.quantity || chain.output.quantity <= 0) {
      add(SEVERITY.WARN, 'OUTPUT_BAD_QTY', 'output.quantity должно быть > 0');
    }
  }

  // ── 4. Workers ─────────────────────────────────────────────────────────────
  const w = chain.workers;
  if (!w || typeof w !== 'object') {
    add(SEVERITY.ERR, 'MISSING_WORKERS', 'Поле workers отсутствует');
  } else {
    if (!w.primary_class) {
      add(SEVERITY.ERR, 'WORKERS_NO_PRIMARY', 'workers.primary_class отсутствует');
    } else if (!VALID_CLASSES.has(w.primary_class)) {
      add(SEVERITY.ERR, 'WORKERS_INVALID_PRIMARY',
        `workers.primary_class "${w.primary_class}" не существует в SOCIAL_CLASSES`);
    }
    if (w.secondary_class !== null && w.secondary_class !== undefined) {
      if (!VALID_CLASSES.has(w.secondary_class)) {
        add(SEVERITY.ERR, 'WORKERS_INVALID_SECONDARY',
          `workers.secondary_class "${w.secondary_class}" не существует в SOCIAL_CLASSES`);
      }
    }
    if (w.slave_ratio == null || w.slave_ratio < 0 || w.slave_ratio > 1) {
      add(SEVERITY.ERR, 'WORKERS_BAD_SLAVE_RATIO',
        `workers.slave_ratio "${w.slave_ratio}" должен быть 0–1`);
    }
    if (!w.total_needed || w.total_needed <= 0) {
      add(SEVERITY.WARN, 'WORKERS_BAD_TOTAL', 'workers.total_needed должно быть > 0');
    }
  }

  // ── 5. output_per_turn ─────────────────────────────────────────────────────
  if (chain.output_per_turn == null || chain.output_per_turn <= 0) {
    add(SEVERITY.ERR, 'BAD_OUTPUT_PER_TURN', 'output_per_turn должно быть > 0');
  }

  // ── 6. biome_modifiers ─────────────────────────────────────────────────────
  if (chain.biome_modifiers && typeof chain.biome_modifiers === 'object') {
    for (const biome of Object.keys(chain.biome_modifiers)) {
      if (!VALID_BIOMES.has(biome)) {
        add(SEVERITY.ERR, 'BIOME_INVALID_KEY',
          `biome_modifiers ключ "${biome}" не существует в BIOME_META`);
      }
    }
    // Для biome-товаров biome_modifiers не должен быть пустым
    const meta = allData.GOODS_META?.[chain.good_id];
    if (meta?.resource_type === 'biome' && Object.keys(chain.biome_modifiers).length === 0) {
      add(SEVERITY.WARN, 'BIOME_EMPTY_FOR_BIOME_GOOD',
        `biome_modifiers пуст для biome-товара "${chain.good_id}"`);
    }
  }

  // ── 7. alternative_good ────────────────────────────────────────────────────
  if (chain.alternative_good !== null && chain.alternative_good !== undefined) {
    if (!VALID_GOODS.has(chain.alternative_good)) {
      add(SEVERITY.ERR, 'INVALID_ALT_GOOD',
        `alternative_good "${chain.alternative_good}" не существует в GOODS`);
    }
    if (chain.alternative_good === chain.good_id) {
      add(SEVERITY.WARN, 'ALT_GOOD_SELF_REF',
        `alternative_good не может ссылаться на себя`);
    }
  }

  // ── 8. ownership ──────────────────────────────────────────────────────────
  const ownership = chain.ownership;
  const ownershipKeys = ['default', 'under_tyranny', 'under_oligarchy', 'under_republic'];
  if (!ownership || typeof ownership !== 'object') {
    add(SEVERITY.WARN, 'MISSING_OWNERSHIP', 'Поле ownership отсутствует');
  } else {
    for (const key of ownershipKeys) {
      if (!ownership[key]) {
        add(SEVERITY.WARN, `OWNERSHIP_MISSING_${key.toUpperCase()}`,
          `ownership.${key} отсутствует`);
      }
    }
  }

  // ── 9. production_locations ────────────────────────────────────────────────
  if (chain.production_possible && Array.isArray(chain.production_locations)) {
    if (chain.production_locations.length === 0) {
      add(SEVERITY.WARN, 'PROD_POSSIBLE_NO_LOCATIONS',
        'production_possible=true но production_locations пуст');
    }
    for (const rId of chain.production_locations) {
      if (!VALID_REGIONS.has(rId)) {
        add(SEVERITY.WARN, 'INVALID_PROD_LOCATION',
          `production_locations содержит несуществующий регион "${rId}"`);
      }
    }
  }

  // ── 10. import_sources ─────────────────────────────────────────────────────
  if (chain.import_required) {
    if (!chain.import_sources || chain.import_sources.length === 0) {
      add(SEVERITY.WARN, 'IMPORT_REQUIRED_NO_SOURCES',
        'import_required=true но import_sources пуст');
    } else {
      for (const nId of chain.import_sources) {
        if (!VALID_NATIONS.has(nId)) {
          add(SEVERITY.WARN, 'INVALID_IMPORT_SOURCE',
            `import_sources содержит несуществующую нацию "${nId}"`);
        }
      }
    }
  }

  // ── 11. deposit_map — production_locations должны иметь нужный deposit ────
  const depositMap = allData.DEPOSIT_MAP ?? {};
  const goodMeta = allData.GOODS_META?.[chain.good_id] ?? {};
  if (goodMeta.resource_type === 'deposit' || goodMeta.resource_type === 'hybrid') {
    const depositKey = goodMeta.deposit_key;
    if (depositKey && depositMap[depositKey]) {
      const validDepositRegions = new Set(
        depositMap[depositKey].regions.map(r => r.id)
      );
      for (const rId of (chain.production_locations ?? [])) {
        if (!validDepositRegions.has(rId)) {
          add(SEVERITY.WARN, 'LOCATION_NO_DEPOSIT',
            `production_locations: регион "${rId}" не имеет deposit "${depositKey}" для товара "${chain.good_id}"`);
        }
      }
      if ((chain.production_locations ?? []).length === 0 && !chain.import_required) {
        add(SEVERITY.WARN, 'DEPOSIT_GOOD_NO_LOCATIONS',
          `Deposit-товар "${chain.good_id}" не имеет production_locations; ожидалось из deposit_map`);
      }
    }
  }

  // ── 12. Валидация спроса (только WARN) ────────────────────────────────────
  const demandIssues = validateDemand(chain, allData);
  issues.push(...demandIssues);

  return issues;
}

// ─── validateDemand — проверка спроса vs. предложения ────────────────────────

export function validateDemand(chain, allData) {
  const issues = [];
  const add = (severity, code, msg) => issues.push({ severity, code, msg });

  const goodId = chain.good_id;
  const opt = chain.output_per_turn ?? 0;
  if (opt <= 0) return issues; // не проверяем если output не задан

  // Суммируем потребление по всем классам всех наций
  let totalAnnualDemand = 0;
  for (const nation of Object.values(allData.NATIONS ?? {})) {
    const pop = nation.population?.by_profession ?? {};
    for (const [classId, classPop] of Object.entries(pop)) {
      const classData = allData.SOCIAL_CLASSES?.[classId];
      if (!classData) continue;
      const need = classData.needs?.[goodId];
      if (!need?.per_100) continue;
      // per_100 = единиц в год на 100 чел.
      totalAnnualDemand += (classPop / 100) * need.per_100;
    }
  }

  if (totalAnnualDemand === 0) return issues; // товар без потребления — не проверяем

  // output_per_turn * предполагаемое число зданий = годовой выпуск
  // Предполагаем: ~1 здание на каждые 3 production_locations (грубая оценка)
  const estBuildings = Math.max(1, (chain.production_locations ?? []).length / 3);
  const estAnnualOutput = opt * estBuildings * 12; // 12 ходов в год

  const coverRatio = estAnnualOutput / totalAnnualDemand;

  if (coverRatio < 0.01) {
    add(SEVERITY.WARN, 'DEMAND_SEVERELY_UNDERPRODUCE',
      `Оценочный выпуск покрывает лишь ${(coverRatio * 100).toFixed(2)}% мирового спроса на "${goodId}" — output_per_turn вероятно занижен`);
  } else if (coverRatio < 0.05) {
    add(SEVERITY.WARN, 'DEMAND_UNDERPRODUCE',
      `Оценочный выпуск покрывает ~${(coverRatio * 100).toFixed(1)}% мирового спроса — проверь output_per_turn`);
  }

  return issues;
}

// ─── validateCrossChains — валидация связей между цепочками ─────────────────

export function validateCrossChains(chains) {
  const issues = [];
  const add = (chainId, severity, code, msg) =>
    issues.push({ chainId, severity, code, msg });

  const chainIds = new Set(Object.keys(chains));

  for (const [id, chain] of Object.entries(chains)) {

    // ── 1. upstream_chains ссылаются на существующие цепочки ──────────────
    for (const upId of (chain.upstream_chains ?? [])) {
      if (!chainIds.has(upId)) {
        add(id, SEVERITY.WARN, 'XREF_UNKNOWN_UPSTREAM',
          `upstream_chains содержит "${upId}" — цепочка ещё не создана`);
      }
    }

    // ── 2. downstream_chains ссылаются на существующие цепочки ────────────
    for (const downId of (chain.downstream_chains ?? [])) {
      if (!chainIds.has(downId)) {
        add(id, SEVERITY.WARN, 'XREF_UNKNOWN_DOWNSTREAM',
          `downstream_chains содержит "${downId}" — цепочка ещё не создана`);
      }
    }

    // ── 3. Симметрия upstream↔downstream ──────────────────────────────────
    // Если A говорит что B в upstream, то B должен иметь A в downstream
    for (const upId of (chain.upstream_chains ?? [])) {
      if (!chainIds.has(upId)) continue;
      const upChain = chains[upId];
      if (!(upChain.downstream_chains ?? []).includes(id)) {
        add(id, SEVERITY.WARN, 'XREF_ASYMMETRIC',
          `"${id}" ссылается на "${upId}" как upstream, но у "${upId}" нет "${id}" в downstream_chains`);
      }
    }

    // ── 4. inputs → upstream_chains согласованность ────────────────────────
    // Если цепочка использует товар X как input, и цепочка X существует,
    // то X должен быть в upstream_chains
    for (const inp of (chain.inputs ?? [])) {
      if (!inp.good || inp.source === 'import' || inp.source === 'deposit') continue;
      if (chainIds.has(inp.good) && !(chain.upstream_chains ?? []).includes(inp.good)) {
        add(id, SEVERITY.WARN, 'XREF_INPUT_NOT_IN_UPSTREAM',
          `inputs использует "${inp.good}" но он не в upstream_chains`);
      }
    }
  }

  // ── 5. Поиск циклических зависимостей (DFS) ────────────────────────────
  const cycles = detectCycles(chains);
  for (const cycle of cycles) {
    const cycleStr = [...cycle, cycle[0]].join(' → ');
    // Добавляем к первому узлу цикла
    add(cycle[0], SEVERITY.WARN, 'CIRCULAR_DEPENDENCY',
      `Циклическая зависимость: ${cycleStr}`);
  }

  return issues;
}

// ─── detectCycles — поиск циклов в графе upstream_chains ─────────────────────

function detectCycles(chains) {
  const cycles = [];
  const visited  = new Set();
  const inStack  = new Set();
  const cycleSeen = new Set();

  function dfs(nodeId, path) {
    if (inStack.has(nodeId)) {
      // Нашли цикл — вырезаем петлю из path
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart);
      const key = [...cycle].sort().join(',');
      if (!cycleSeen.has(key)) {
        cycleSeen.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);
    const chain = chains[nodeId];
    for (const nextId of (chain?.downstream_chains ?? [])) {
      if (chains[nextId]) dfs(nextId, [...path]);
    }
    inStack.delete(nodeId);
  }

  for (const id of Object.keys(chains)) {
    dfs(id, []);
  }
  return cycles;
}

// ─── formatIssues — человекочитаемый вывод ───────────────────────────────────

export function formatIssues(issues, chainId = null) {
  const prefix = chainId ? `[${chainId}] ` : '';
  return issues.map(i => {
    const tag = i.severity === SEVERITY.ERR ? '✗' : '⚠';
    const chain = i.chainId ? `[${i.chainId}] ` : '';
    return `${tag} ${prefix}${chain}${i.code}: ${i.msg}`;
  }).join('\n');
}

// ─── hasErrors — есть ли критические ошибки ──────────────────────────────────

export function hasErrors(issues) {
  return issues.some(i => i.severity === SEVERITY.ERR);
}
