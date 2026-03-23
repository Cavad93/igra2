// validate_group1.js — Группа 1: перекрёстные ссылки
const fs  = require('fs');
const vm  = require('vm');
const SB  = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  try { vm.runInContext(code, SB); } catch(e) { console.error('ERR '+f+': '+e.message); process.exit(1); }
}
load('goods.js'); load('buildings.js'); load('social_classes.js');
load('regions_data.js'); load('biomes.js'); load('nations.js');
load('laws_labor.js'); load('goods_meta.js'); load('pdf_chains.js');

const GOODS_IDS    = new Set(Object.keys(SB.GOODS));
const BUILDING_IDS = new Set(Object.keys(SB.BUILDINGS));
const CLASS_IDS    = new Set(Object.keys(SB.SOCIAL_CLASSES));
const NATION_IDS   = new Set(Object.keys(SB.INITIAL_GAME_STATE.nations));
const BIOME_IDS    = new Set(Object.keys(SB.BIOME_META));
const LAW_IDS      = new Set(Object.keys(SB.LAWS_LABOR));
const META_IDS     = new Set(Object.keys(SB.GOODS_META));
const CHAIN_IDS    = new Set(Object.keys(SB.PDF_CHAINS).map(Number));
// terrain IDs (биомы + специальные)
const VALID_TERRAINS = new Set([...BIOME_IDS, 'plains','hills','mountains','coastal_city']);

const ERRORS = [];
const WARNS  = [];
function err(file, grp, msg)  { ERRORS.push(`${file} | ${grp} | ${msg}`); }
function warn(file, grp, msg) { WARNS.push(`${file} | ${grp} | ${msg}`); }

// ─── goods_meta.js → goods.js: ключи совпадают ───────────────────────────
for (const k of META_IDS)  if (!GOODS_IDS.has(k))  err('goods_meta.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`ключ '${k}' есть в GOODS_META но НЕ в GOODS`);
for (const k of GOODS_IDS) if (!META_IDS.has(k))   err('goods_meta.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`товар '${k}' есть в GOODS но НЕ в GOODS_META`);

// ─── goods_meta.js .inputs → goods.js ─────────────────────────────────────
for (const [id, m] of Object.entries(SB.GOODS_META)) {
  if (m.resource_type === 'processed' && m.inputs) {
    for (const inp of Object.keys(m.inputs)) {
      if (!GOODS_IDS.has(inp)) err('goods_meta.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${id}.inputs['${inp}'] не найден в GOODS`);
    }
  }
}

// ─── goods_meta.js .produced_by → buildings.js ───────────────────────────
for (const [id, m] of Object.entries(SB.GOODS_META)) {
  if (m.produced_by && !BUILDING_IDS.has(m.produced_by)) {
    err('goods_meta.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${id}.produced_by='${m.produced_by}' не найден в BUILDINGS`);
  }
}

// ─── goods_meta.js .import_sources → nations.js ──────────────────────────
for (const [id, m] of Object.entries(SB.GOODS_META)) {
  if (Array.isArray(m.import_sources)) {
    for (const ns of m.import_sources) {
      if (!NATION_IDS.has(ns)) warn('goods_meta.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${id}.import_sources['${ns}'] не найден в nations`);
    }
  }
}

// ─── buildings.js production_output/inputs/capital_inputs → goods.js ─────
for (const [bid, bld] of Object.entries(SB.BUILDINGS)) {
  for (const arr of [bld.production_output, bld.production_inputs, bld.capital_inputs]) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && item.good && !GOODS_IDS.has(item.good)) {
        err('buildings.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${bid}: good='${item.good}' не найден в GOODS`);
      }
    }
  }
}

// ─── buildings.js .terrain_restriction → biomes.js ───────────────────────
for (const [bid, bld] of Object.entries(SB.BUILDINGS)) {
  if (Array.isArray(bld.terrain_restriction)) {
    for (const t of bld.terrain_restriction) {
      if (!VALID_TERRAINS.has(t)) err('buildings.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${bid}.terrain_restriction='${t}' не найден в BIOME_IDS или стандартных`);
    }
  }
}

// ─── social_classes.js can_work_in → buildings.js ─────────────────────────
for (const [cid, cls] of Object.entries(SB.SOCIAL_CLASSES)) {
  const cw = cls.can_work_in || {};
  for (const arr of [cw.primary, cw.secondary, cw.forbidden]) {
    if (!Array.isArray(arr)) continue;
    for (const b of arr) {
      if (!BUILDING_IDS.has(b)) err('social_classes.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${cid}.can_work_in: '${b}' не найден в BUILDINGS`);
    }
  }
}

// ─── social_classes.js ownership_rights.can_own → buildings.js ───────────
for (const [cid, cls] of Object.entries(SB.SOCIAL_CLASSES)) {
  const own = (cls.ownership_rights || {}).can_own || [];
  for (const b of own) {
    if (!BUILDING_IDS.has(b)) err('social_classes.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${cid}.ownership_rights.can_own: '${b}' не найден в BUILDINGS`);
  }
}

// ─── laws_labor.js effects.production_bonus → buildings.js ───────────────
for (const [lid, law] of Object.entries(SB.LAWS_LABOR)) {
  const pb = ((law.effects || {}).production_bonus) || {};
  for (const bkey of Object.keys(pb)) {
    if (!BUILDING_IDS.has(bkey)) err('laws_labor.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${lid}.effects.production_bonus: '${bkey}' не найден в BUILDINGS`);
  }
}

// ─── laws_labor.js satisfaction_effects → social_classes.js ──────────────
for (const [lid, law] of Object.entries(SB.LAWS_LABOR)) {
  const se = law.satisfaction_effects || {};
  for (const ckey of Object.keys(se)) {
    if (!CLASS_IDS.has(ckey)) err('laws_labor.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${lid}.satisfaction_effects: '${ckey}' не найден в SOCIAL_CLASSES`);
  }
}

// ─── pdf_chains.js .inputs → goods.js ────────────────────────────────────
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  if (Array.isArray(chain.inputs)) {
    for (const g of chain.inputs) {
      if (!GOODS_IDS.has(g)) err('pdf_chains.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`chain #${cid}.inputs: '${g}' не найден в GOODS`);
    }
  }
}

// ─── pdf_chains.js .alternative_good → goods.js ──────────────────────────
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  if (chain.alternative_good !== null && chain.alternative_good !== undefined) {
    if (!GOODS_IDS.has(chain.alternative_good)) err('pdf_chains.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`chain #${cid}.alternative_good='${chain.alternative_good}' не найден в GOODS`);
  }
}

// ─── pdf_chains.js upstream/downstream → CHAIN_IDS ───────────────────────
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  for (const arr of [chain.upstream_chain_ids, chain.downstream_chain_ids]) {
    if (!Array.isArray(arr)) continue;
    for (const id of arr) {
      if (!CHAIN_IDS.has(id)) err('pdf_chains.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`chain #${cid}: ссылка на несуществующую цепочку #${id}`);
    }
  }
}

// ─── pdf_chains.js .bottleneck_buildings → buildings.js ─────────────────
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  if (Array.isArray(chain.bottleneck_buildings)) {
    for (const b of chain.bottleneck_buildings) {
      if (!BUILDING_IDS.has(b)) err('pdf_chains.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`chain #${cid}.bottleneck_buildings: '${b}' не найден в BUILDINGS`);
    }
  }
}

// ─── pdf_chains.js .bottleneck_goods → goods.js ──────────────────────────
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  if (Array.isArray(chain.bottleneck_goods)) {
    for (const g of chain.bottleneck_goods) {
      if (!GOODS_IDS.has(g)) err('pdf_chains.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`chain #${cid}.bottleneck_goods: '${g}' не найден в GOODS`);
    }
  }
}

// ─── nations.js primary_exports/imports → goods.js ───────────────────────
const allNations = SB.INITIAL_GAME_STATE.nations;
for (const [nid, nat] of Object.entries(allNations)) {
  for (const field of ['primary_exports','primary_imports']) {
    const arr = nat[field];
    if (!Array.isArray(arr)) continue;
    for (const g of arr) {
      if (!GOODS_IDS.has(g)) err('nations.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${nid}.${field}: '${g}' не найден в GOODS`);
    }
  }
}

// ─── nations.js trade_partners → nations.js ──────────────────────────────
for (const [nid, nat] of Object.entries(allNations)) {
  if (Array.isArray(nat.trade_partners)) {
    for (const tp of nat.trade_partners) {
      if (!NATION_IDS.has(tp)) err('nations.js','ПЕРЕКРЁСТНЫЕ ССЫЛКИ',`${nid}.trade_partners: '${tp}' не найден в nations`);
    }
  }
}

// ─── Вывод ────────────────────────────────────────────────────────────────
console.log('=== ГРУППА 1: ПЕРЕКРЁСТНЫЕ ССЫЛКИ ===');
console.log('Ошибок:', ERRORS.length, ' | Предупреждений:', WARNS.length);
if (ERRORS.length) { console.log('\n--- ОШИБКИ ---'); ERRORS.forEach(e => console.log('  ERR:', e)); }
if (WARNS.length)  { console.log('\n--- ПРЕДУПРЕЖДЕНИЯ ---'); WARNS.forEach(w => console.log('  WARN:', w)); }
if (!ERRORS.length && !WARNS.length) console.log('  Всё в порядке.');
