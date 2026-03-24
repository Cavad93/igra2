#!/usr/bin/env node
// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// agents/export_to_recipes.js
//
// Добавляет в конец data/chains_data.js два блока:
//   1. RECIPE_DATA   — откалиброванные коэффициенты inputs.amount и labor
//   2. BUILDING_RECIPES — генерируется автоматически из CHAINS_DATA + RECIPE_DATA
//
// После запуска:
//   • data/chains_data.js становится единственным источником рецептов
//   • data/recipes.js можно удалить
//   • в index.html заменить recipes.js → chains_data.js
//
// Использование:  node agents/export_to_recipes.js
// ══════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAINS_FILE = path.join(__dirname, '../data/chains_data.js');

// ── Откалиброванные рецепты (inputs.amount = потребление на 1 ед. выхода) ──
// Взяты из data/recipes.js + дополнены для зданий которых там не было.
const RECIPE_DATA = {
  wheat:         { inputs: [{ good: 'wheat',   amount: 0.20 }],                                    labor: 3  },
  barley:        { inputs: [],                                                                       labor: 3  },
  fish:          { inputs: [],                                                                       labor: 5  },
  tuna:          { inputs: [{ good: 'salt',    amount: 0.20 }, { good: 'pottery', amount: 0.10 }], labor: 6  },
  garum:         { inputs: [{ good: 'fish',    amount: 0.60 }, { good: 'salt',    amount: 0.20 }], labor: 8  },
  meat:          { inputs: [{ good: 'cattle',  amount: 0.25 }],                                    labor: 4  },
  olives:        { inputs: [],                                                                       labor: 3  },
  olive_oil:     { inputs: [{ good: 'olives',  amount: 0.80 }],                                    labor: 5  },
  wine:          { inputs: [{ good: 'barley',  amount: 0.15 }],                                    labor: 7  },
  honey:         { inputs: [],                                                                       labor: 2  },
  timber:        { inputs: [],                                                                       labor: 4  },
  wool:          { inputs: [],                                                                       labor: 3  },
  salt:          { inputs: [],                                                                       labor: 6  },
  papyrus:       { inputs: [],                                                                       labor: 4  },
  wax:           { inputs: [{ good: 'honey',   amount: 0.30 }],                                    labor: 3  },
  iron:          { inputs: [],                                                                       labor: 12 },
  copper:        { inputs: [],                                                                       labor: 12 },
  sulfur:        { inputs: [],                                                                       labor: 10 },
  silver:        { inputs: [{ good: 'tools',   amount: 0.02 }],                                    labor: 15 },
  gold:          { inputs: [{ good: 'tools',   amount: 0.02 }],                                    labor: 20 },
  tin:           { inputs: [],                                                                       labor: 12 },
  amber:         { inputs: [],                                                                       labor: 3  },
  furs:          { inputs: [],                                                                       labor: 4  },
  incense:       { inputs: [],                                                                       labor: 4  },
  bronze:        { inputs: [{ good: 'copper',  amount: 0.60 }, { good: 'tin',     amount: 0.20 }], labor: 12 },
  charcoal:      { inputs: [{ good: 'timber',  amount: 0.30 }],                                    labor: 4  },
  cloth:         { inputs: [{ good: 'wool',    amount: 0.40 }],                                    labor: 6  },
  leather:       { inputs: [{ good: 'cattle',  amount: 0.20 }],                                    labor: 5  },
  pottery:       { inputs: [{ good: 'timber',  amount: 0.08 }],                                    labor: 4  },
  tools:         { inputs: [{ good: 'iron',    amount: 0.30 }],                                    labor: 8  },
  weapons:       { inputs: [{ good: 'iron',    amount: 0.50 }, { good: 'charcoal', amount: 0.10 }], labor: 10 },
  stone:         { inputs: [],                                                                       labor: 6  },
  hemp:          { inputs: [],                                                                       labor: 3  },
  pitch:         { inputs: [{ good: 'timber',  amount: 0.40 }],                                    labor: 5  },
  purple_dye:    { inputs: [{ good: 'salt',    amount: 0.10 }, { good: 'charcoal', amount: 0.05 }], labor: 10 },
  war_elephants: { inputs: [{ good: 'wheat',   amount: 0.80 }, { good: 'timber',  amount: 0.20 }], labor: 15 },
  horses:        { inputs: [{ good: 'barley',  amount: 0.40 }, { good: 'wheat',   amount: 0.20 }], labor: 5  },
  cattle:        { inputs: [{ good: 'wheat',   amount: 0.30 }],                                    labor: 4  },
  slaves:        { inputs: [],                                                                       labor: 8  },
  armor:         { inputs: [{ good: 'iron',    amount: 0.80 }, { good: 'leather', amount: 0.20 }], labor: 12 },
  trade_goods:   { inputs: [{ good: 'silver',  amount: 0.05 }],                                    labor: 10 },
};

// ── Устаревшие здания (есть на карте, но отсутствуют в CHAINS_DATA) ─────────
const LEGACY_BUILDINGS = {
  // workshop → заменён forge+textile_mill+pottery_workshop, но старые постройки живут
  workshop: [
    { output_good: 'tools',   inputs: [{ good: 'iron',   amount: 0.30 }, { good: 'timber', amount: 0.05 }], labor_cost_per_worker: 8  },
    { output_good: 'cloth',   inputs: [{ good: 'wool',   amount: 0.40 }],                                   labor_cost_per_worker: 6  },
    { output_good: 'pottery', inputs: [{ good: 'timber', amount: 0.10 }],                                   labor_cost_per_worker: 4  },
  ],
  // mine → заменён iron_mine+bronze_foundry
  mine: [
    { output_good: 'iron',   inputs: [],                                    labor_cost_per_worker: 12 },
    { output_good: 'bronze', inputs: [{ good: 'iron', amount: 0.30 }],    labor_cost_per_worker: 15 },
  ],
  // farm → простая ферма без посевного фонда
  farm: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'barley', inputs: [], labor_cost_per_worker: 3 },
  ],
  // wheat_villa / wheat_latifundium / latifundium / grain_estate
  wheat_villa: [
    { output_good: 'wheat', inputs: [{ good: 'wheat', amount: 0.20 }], labor_cost_per_worker: 2 },
  ],
  wheat_latifundium: [
    { output_good: 'wheat',  inputs: [{ good: 'wheat',  amount: 0.20 }], labor_cost_per_worker: 2 },
    { output_good: 'barley', inputs: [{ good: 'barley', amount: 0.20 }], labor_cost_per_worker: 2 },
  ],
  latifundium: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 2 },
    { output_good: 'olives', inputs: [], labor_cost_per_worker: 2 },
  ],
  grain_estate: [
    { output_good: 'wheat',  inputs: [], labor_cost_per_worker: 2 },
    { output_good: 'barley', inputs: [], labor_cost_per_worker: 2 },
  ],
  // port → заменён fishery+trading_post, но порты на карте остаются
  port: [
    { output_good: 'fish',        inputs: [], labor_cost_per_worker: 5  },
    { output_good: 'trade_goods', inputs: [], labor_cost_per_worker: 10 },
  ],
  // ranch → цепочки есть для wool, но leather+honey отсутствуют в CHAINS_DATA
  ranch: [
    { output_good: 'leather', inputs: [], labor_cost_per_worker: 3 },
    { output_good: 'honey',   inputs: [], labor_cost_per_worker: 2 },
  ],
};

// ── Генерация кода ───────────────────────────────────────────────────────────

function serializeInputs(inputs) {
  if (!inputs || inputs.length === 0) return '[]';
  const parts = inputs.map(i => `{ good: '${i.good}', amount: ${i.amount} }`);
  return `[ ${parts.join(', ')} ]`;
}

function buildAppendBlock() {
  const lines = [];
  lines.push('');
  lines.push('// ══════════════════════════════════════════════════════════════');
  lines.push('// РЕЦЕПТЫ ПРОИЗВОДСТВА — auto-generated by agents/export_to_recipes.js');
  lines.push('//');
  lines.push('// RECIPE_DATA: откалиброванные коэффициенты (amount = на 1 ед. выхода)');
  lines.push('// BUILDING_RECIPES: строится из CHAINS_DATA + RECIPE_DATA + legacy-зданий');
  lines.push('//');
  lines.push('// Структура: BUILDING_RECIPES[building_id] = [');
  lines.push('//   { output_good, inputs: [{good, amount}], labor_cost_per_worker }');
  lines.push('// ]');
  lines.push('// ══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('var RECIPE_DATA = {');
  for (const [goodId, r] of Object.entries(RECIPE_DATA)) {
    const inp = serializeInputs(r.inputs);
    lines.push(`  ${goodId.padEnd(14)}: { inputs: ${inp}, labor: ${r.labor} },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('var BUILDING_RECIPES = (function () {');
  lines.push('  var result = {};');
  lines.push('');
  lines.push('  // ── Основные рецепты из CHAINS_DATA ───────────────────────');
  lines.push('  Object.values(CHAINS_DATA).forEach(function (chain) {');
  lines.push('    var recipe = RECIPE_DATA[chain.good_id];');
  lines.push('    if (!recipe || !chain.building) return;');
  lines.push('    if (!result[chain.building]) result[chain.building] = [];');
  lines.push('    result[chain.building].push({');
  lines.push('      output_good:           chain.good_id,');
  lines.push('      inputs:                recipe.inputs,');
  lines.push('      labor_cost_per_worker: recipe.labor,');
  lines.push('    });');
  lines.push('  });');
  lines.push('');
  lines.push('  // ── Устаревшие здания (не в CHAINS_DATA, но ещё на карте) ─');
  lines.push('  var LEGACY = ' + JSON.stringify(LEGACY_BUILDINGS, null, 4).replace(/"/g, "'") + ';');
  lines.push('');
  lines.push('  Object.keys(LEGACY).forEach(function (bld) {');
  lines.push('    if (!result[bld]) result[bld] = [];');
  lines.push('    LEGACY[bld].forEach(function (r) {');
  lines.push('      var exists = result[bld].some(function (x) { return x.output_good === r.output_good; });');
  lines.push('      if (!exists) result[bld].push(r);');
  lines.push('    });');
  lines.push('  });');
  lines.push('');
  lines.push('  return result;');
  lines.push('})();');
  lines.push('');
  return lines.join('\n');
}

// ── Главная логика ───────────────────────────────────────────────────────────

const MARKER_START = '// ══ RECIPE_DATA (auto-generated)';

let src = fs.readFileSync(CHAINS_FILE, 'utf8');

// Удалить предыдущий блок если есть
const markerIdx = src.indexOf(MARKER_START);
if (markerIdx !== -1) {
  src = src.slice(0, markerIdx).trimEnd() + '\n';
  console.log('♻  Предыдущий блок удалён');
}

// Удалить старый блок по альтернативному маркеру (первый запуск)
const altMarker = '// ══════════════════════════════════════════════════════════════\n// РЕЦЕПТЫ ПРОИЗВОДСТВА — auto-generated';
const altIdx = src.indexOf(altMarker);
if (altIdx !== -1) {
  src = src.slice(0, altIdx).trimEnd() + '\n';
  console.log('♻  Предыдущий блок (alt) удалён');
}

const block = buildAppendBlock();
src = src.trimEnd() + '\n' + block;

fs.writeFileSync(CHAINS_FILE, src, 'utf8');

console.log('✓  chains_data.js обновлён: добавлены RECIPE_DATA и BUILDING_RECIPES');
console.log('');

// ── Проверка: распарсить и показать итоговое покрытие ────────────────────────
// eslint-disable-next-line no-eval
const evalSrc = src
  .replace('var CHAINS_DATA', 'globalThis.CHAINS_DATA')
  .replace('var RECIPE_DATA', 'globalThis.RECIPE_DATA')
  .replace('var BUILDING_RECIPES', 'globalThis.BUILDING_RECIPES');
eval(evalSrc);

const br = global.BUILDING_RECIPES;
const buildings = Object.keys(br).sort();
console.log(`📦 BUILDING_RECIPES: ${buildings.length} зданий`);
buildings.forEach(bld => {
  const goods = br[bld].map(r => r.output_good).join(', ');
  console.log(`   ${bld.padEnd(22)} → ${goods}`);
});
