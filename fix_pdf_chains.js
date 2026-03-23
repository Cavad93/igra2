// fix_pdf_chains.js — fixes invalid references in PDF_CHAINS
const fs = require('fs');
const vm = require('vm');

const SB = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  vm.runInContext(code, SB);
}
load('goods.js');
load('buildings.js');
load('pdf_chains.js');

const GOODS_IDS    = new Set(Object.keys(SB.GOODS));
const BUILDING_IDS = new Set(Object.keys(SB.BUILDINGS));

// Mapping for bottleneck_buildings
const BLDG_MAP = {
  stables:               'horse_ranch',
  fortress:              'walls',
  elephant_stables:      'elephant_corral',
  latifundia:            'wheat_latifundium',
  olive_press:           'oil_press',
  fishing_harbor:        'fishery',
  farm:                  'wheat_family_farm',
  irrigation_system:     'irrigation',
  pasture:               'ranch',
  dye_workshop:          'dye_works',
  bronze_workshop:       'bronze_foundry',
  merchant_guild:        'market',
  // these have no valid equivalent — will be dropped
  construction_office:   null,
  colony:                null,
  diplomatic_office:     null,
  spy_network:           null,
  mint:                  null,
  bank:                  null,
  treasury:              null,
  archive:               null,
  administrative_center: null,
  hospital:              null,
  arena:                 null,
  courthouse:            null,
};

// Mapping for bottleneck_goods
const GOOD_MAP = {
  elephants: 'war_elephants',
  land:      null,
  ships:     null,
  sheep:     null,
};

// Crisis fix: these ids must have is_crisis_chain = false
const NOT_CRISIS = new Set([25, 33, 37, 43, 62, 85, 86, 91, 93]);

let fixes = 0;

for (const [cid, c] of Object.entries(SB.PDF_CHAINS)) {
  const id = Number(cid);

  // Fix inputs: keep only valid GOODS_IDS
  if (Array.isArray(c.inputs)) {
    const before = c.inputs.join(',');
    c.inputs = c.inputs.filter(g => GOODS_IDS.has(g));
    if (c.inputs.join(',') !== before) { console.log(`#${id} inputs fixed`); fixes++; }
  }

  // Fix bottleneck_buildings: map or drop
  if (Array.isArray(c.bottleneck_buildings)) {
    const before = c.bottleneck_buildings.join(',');
    c.bottleneck_buildings = c.bottleneck_buildings.flatMap(b => {
      if (BUILDING_IDS.has(b)) return [b];
      if (b in BLDG_MAP) { const m = BLDG_MAP[b]; return m ? [m] : []; }
      console.warn(`  WARN #${id}: unknown building '${b}' — dropped`);
      return [];
    });
    if (c.bottleneck_buildings.join(',') !== before) { console.log(`#${id} bottleneck_buildings fixed`); fixes++; }
  }

  // Fix bottleneck_goods: map or drop
  if (Array.isArray(c.bottleneck_goods)) {
    const before = c.bottleneck_goods.join(',');
    c.bottleneck_goods = c.bottleneck_goods.flatMap(g => {
      if (GOODS_IDS.has(g)) return [g];
      if (g in GOOD_MAP) { const m = GOOD_MAP[g]; return m ? [m] : []; }
      console.warn(`  WARN #${id}: unknown good '${g}' in bottleneck_goods — dropped`);
      return [];
    });
    if (c.bottleneck_goods.join(',') !== before) { console.log(`#${id} bottleneck_goods fixed`); fixes++; }
  }

  // Fix alternative_good
  if (c.alternative_good !== null && c.alternative_good !== undefined && !GOODS_IDS.has(c.alternative_good)) {
    console.log(`#${id} alternative_good '${c.alternative_good}' → null`);
    c.alternative_good = null;
    fixes++;
  }

  // Fix is_crisis_chain
  if (NOT_CRISIS.has(id) && c.is_crisis_chain === true) {
    console.log(`#${id} is_crisis_chain true → false`);
    c.is_crisis_chain = false;
    fixes++;
  }
}

console.log(`\nTotal fixes: ${fixes}`);

// Validate no errors remain
let errors = 0;
for (const [cid, c] of Object.entries(SB.PDF_CHAINS)) {
  if (Array.isArray(c.inputs)) {
    const bad = c.inputs.filter(g => !GOODS_IDS.has(g));
    if (bad.length) { console.error(`STILL ERR inputs #${cid}: ${bad}`); errors++; }
  }
  if (Array.isArray(c.bottleneck_buildings)) {
    const bad = c.bottleneck_buildings.filter(b => !BUILDING_IDS.has(b));
    if (bad.length) { console.error(`STILL ERR bb_bldg #${cid}: ${bad}`); errors++; }
  }
  if (Array.isArray(c.bottleneck_goods)) {
    const bad = c.bottleneck_goods.filter(g => !GOODS_IDS.has(g));
    if (bad.length) { console.error(`STILL ERR bb_good #${cid}: ${bad}`); errors++; }
  }
  if (c.alternative_good !== null && c.alternative_good !== undefined && !GOODS_IDS.has(c.alternative_good)) {
    console.error(`STILL ERR alt_good #${cid}: ${c.alternative_good}`); errors++;
  }
  if (Number(cid) <= 93 && c.is_crisis_chain === true) {
    console.error(`STILL ERR crisis #${cid}`); errors++;
  }
}
if (errors === 0) console.log('Post-fix validation: OK');
else console.error(`Post-fix validation: ${errors} errors remain!`);

// Serialize back to JS
function ser(v, indent) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const items = v.map(x => ser(x, indent + '  '));
    if (items.join(', ').length < 80) return '[' + items.join(', ') + ']';
    return '[\n' + indent + '  ' + items.join(',\n' + indent + '  ') + '\n' + indent + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    const lines = keys.map(k => `${indent}  ${k}: ${ser(v[k], indent + '  ')}`);
    return '{\n' + lines.join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(v);
}

let out = `// ══════════════════════════════════════════════════════════════════════
// data/pdf_chains.js
// 100 производственных цепочек PAX HISTORIA
// 301 до н.э. — 476 н.э.
// Каждая цепочка — живая система с круговой причинностью.
// Три компонента: ЦЕПОЧКА (механика), УЯЗВИМОСТЬ, АЛЬТЕРНАТИВА.
// ══════════════════════════════════════════════════════════════════════

var PDF_CHAINS = {\n`;

const ids = Object.keys(SB.PDF_CHAINS).map(Number).sort((a,b)=>a-b);
for (const id of ids) {
  const c = SB.PDF_CHAINS[id];
  out += `\n  ${id}: ${ser(c, '  ')},\n`;
}

out += `\n};\n`;

// Add helper objects
out += `
var CHAINS_BY_CATEGORY = ${JSON.stringify(SB.CHAINS_BY_CATEGORY, null, 2)};\n`;
out += `
var CHAINS_BY_GOOD = ${JSON.stringify(SB.CHAINS_BY_GOOD, null, 2)};\n`;
out += `
var CRISIS_THRESHOLDS = ${JSON.stringify(SB.CRISIS_THRESHOLDS, null, 2)};\n`;

fs.writeFileSync('data/pdf_chains.js', out, 'utf8');
console.log('\ndata/pdf_chains.js written successfully.');
