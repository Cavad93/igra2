// validate_groups2_5.js — Группы 2-5: полнота, типы, поля, логика
const fs  = require('fs');
const vm  = require('vm');
const SB  = vm.createContext({ require, process, console, INITIAL_GAME_STATE: { regions: {} } });
function load(f) {
  const code = fs.readFileSync('data/'+f,'utf8').replace(/^const /mg,'var ').replace(/^let /mg,'var ');
  try { vm.runInContext(code, SB); } catch(e) { console.error('ERR '+f+': '+e.message); process.exit(1); }
}
load('goods.js'); load('buildings.js'); load('social_classes.js'); load('regions_data.js');
load('biomes.js'); load('nations.js'); load('laws_labor.js'); load('goods_meta.js'); load('pdf_chains.js');

const GOODS_IDS    = new Set(Object.keys(SB.GOODS));
const BUILDING_IDS = new Set(Object.keys(SB.BUILDINGS));
const CLASS_IDS    = new Set(Object.keys(SB.SOCIAL_CLASSES));
const NATION_IDS   = new Set(Object.keys(SB.INITIAL_GAME_STATE.nations));
const BIOME_IDS    = new Set(Object.keys(SB.BIOME_META));
const LAW_IDS      = new Set(Object.keys(SB.LAWS_LABOR));
const CHAIN_IDS    = new Set(Object.keys(SB.PDF_CHAINS).map(Number));

const ERRORS = [], WARNS = [];
function err(f,g,m)  { ERRORS.push(`${f} | ${g} | ${m}`); }
function warn(f,g,m) { WARNS.push(`${f} | ${g} | ${m}`); }

// ══════════════════════════════════════════════════════════════════════
// ГРУППА 2: ПОЛНОТА
// ══════════════════════════════════════════════════════════════════════

// goods.js — ровно эти 40 товаров (дедупликация в условии задания)
const REQUIRED_GOODS = new Set([
  'wheat','barley','fish','tuna','garum','meat','olives','olive_oil','wine',
  'honey','timber','wool','salt','papyrus','wax','iron','copper','sulfur',
  'silver','gold','tin','amber','furs','incense','bronze','charcoal','cloth',
  'leather','pottery','tools','weapons','armor','stone','purple_dye',
  'horses','cattle','slaves','trade_goods'
]);
for (const g of REQUIRED_GOODS) {
  if (!GOODS_IDS.has(g)) err('goods.js','ПОЛНОТА',`обязательный товар '${g}' отсутствует в GOODS`);
}
const EXTRA_GOODS = [...GOODS_IDS].filter(g => !REQUIRED_GOODS.has(g));
if (EXTRA_GOODS.length) warn('goods.js','ПОЛНОТА',`лишние товары: ${EXTRA_GOODS.join(', ')}`);

// pdf_chains.js — ID от 1 до 100 без пропусков
for (let i = 1; i <= 100; i++) {
  if (!CHAIN_IDS.has(i)) err('pdf_chains.js','ПОЛНОТА',`цепочка #${i} отсутствует`);
}
for (const id of CHAIN_IDS) {
  if (id < 1 || id > 100) err('pdf_chains.js','ПОЛНОТА',`ID ${id} вне диапазона 1-100`);
}

// social_classes.js — ровно 10 классов
const REQUIRED_CLASSES = ['aristocrats','officials','clergy_class','citizens','craftsmen_class',
  'farmers_class','sailors_class','soldiers_class','freedmen','slaves_class'];
for (const c of REQUIRED_CLASSES) {
  if (!CLASS_IDS.has(c)) err('social_classes.js','ПОЛНОТА',`класс '${c}' отсутствует`);
}

// laws_labor.js — в каждой группе ровно один is_default
const lawsByGroup = {};
for (const [lid, law] of Object.entries(SB.LAWS_LABOR)) {
  const g = law.group;
  if (!lawsByGroup[g]) lawsByGroup[g] = { defaults: [], all: [] };
  lawsByGroup[g].all.push(lid);
  if (law.is_default === true) lawsByGroup[g].defaults.push(lid);
}
for (const [grp, info] of Object.entries(lawsByGroup)) {
  if (info.defaults.length === 0) err('laws_labor.js','ПОЛНОТА',`группа '${grp}': нет закона с is_default=true`);
  if (info.defaults.length > 1)  err('laws_labor.js','ПОЛНОТА',`группа '${grp}': несколько законов с is_default: ${info.defaults.join(', ')}`);
}

// biomes.js — обязательные биомы
const REQUIRED_BIOMES = ['alpine','arctic','desert','mediterranean_coast','mediterranean_hills',
  'river_valley','savanna','semi_arid','steppe','subtropical','temperate_forest','tropical','volcanic'];
for (const b of REQUIRED_BIOMES) {
  if (!BIOME_IDS.has(b)) err('biomes.js','ПОЛНОТА',`биом '${b}' отсутствует`);
}

// ══════════════════════════════════════════════════════════════════════
// ГРУППА 3: ТИПЫ ДАННЫХ
// ══════════════════════════════════════════════════════════════════════

// goods.js
for (const [gid, g] of Object.entries(SB.GOODS)) {
  if (typeof g.base_price !== 'number' || g.base_price <= 0)
    err('goods.js','ТИПЫ',`${gid}.base_price должен быть числом > 0, получено: ${g.base_price}`);
  if (typeof g.price_elasticity !== 'number' || g.price_elasticity <= 0 || g.price_elasticity >= 3)
    err('goods.js','ТИПЫ',`${gid}.price_elasticity должен быть 0<x<3, получено: ${g.price_elasticity}`);
  if (typeof g.price_floor !== 'number' || g.price_floor <= 0)
    err('goods.js','ТИПЫ',`${gid}.price_floor должен быть числом > 0, получено: ${g.price_floor}`);
  if (typeof g.stockpile_target_turns !== 'number' || g.stockpile_target_turns < 1)
    err('goods.js','ТИПЫ',`${gid}.stockpile_target_turns должен быть числом >= 1`);
  if (typeof g.is_food !== 'boolean')
    err('goods.js','ТИПЫ',`${gid}.is_food должен быть boolean`);
  if (!Array.isArray(g.producers))
    err('goods.js','ТИПЫ',`${gid}.producers должен быть Array`);
}

// goods_meta.js
for (const [gid, m] of Object.entries(SB.GOODS_META)) {
  if (typeof m.chain_importance !== 'number' || m.chain_importance < 0 || m.chain_importance > 10)
    err('goods_meta.js','ТИПЫ',`${gid}.chain_importance должен быть 0-10, получено: ${m.chain_importance}`);
  if (typeof m.is_strategic !== 'boolean')
    err('goods_meta.js','ТИПЫ',`${gid}.is_strategic должен быть boolean`);
  if (typeof m.can_be_absent !== 'boolean')
    err('goods_meta.js','ТИПЫ',`${gid}.can_be_absent должен быть boolean`);
  for (const [k,v] of Object.entries(m.terrain_bonus || {})) {
    if (typeof v !== 'number') err('goods_meta.js','ТИПЫ',`${gid}.terrain_bonus['${k}'] должен быть числом`);
  }
  for (const [k,v] of Object.entries(m.terrain_penalty || {})) {
    if (typeof v !== 'number') err('goods_meta.js','ТИПЫ',`${gid}.terrain_penalty['${k}'] должен быть числом`);
  }
}

// nations.js
const allNations = SB.INITIAL_GAME_STATE.nations;
for (const [nid, nat] of Object.entries(allNations)) {
  if (!nat.population || typeof nat.population.total !== 'number' || nat.population.total <= 0)
    err('nations.js','ТИПЫ',`${nid}.population.total должен быть числом > 0`);
  if (!nat.economy || typeof nat.economy.treasury !== 'number')
    err('nations.js','ТИПЫ',`${nid}.economy.treasury должен быть числом`);
  if (!nat.economy || typeof nat.economy.tax_rate !== 'number' ||
      nat.economy.tax_rate <= 0 || nat.economy.tax_rate >= 1)
    err('nations.js','ТИПЫ',`${nid}.economy.tax_rate должен быть 0<x<1, получено: ${nat.economy && nat.economy.tax_rate}`);
  if (!nat.government || typeof nat.government.legitimacy !== 'number' ||
      nat.government.legitimacy < 0 || nat.government.legitimacy > 100)
    err('nations.js','ТИПЫ',`${nid}.government.legitimacy должен быть 0-100`);
  if (!nat.government || typeof nat.government.stability !== 'number' ||
      nat.government.stability < 0 || nat.government.stability > 100)
    err('nations.js','ТИПЫ',`${nid}.government.stability должен быть 0-100`);
}

// pdf_chains.js
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  if (typeof chain.id !== 'number') err('pdf_chains.js','ТИПЫ',`#${cid}.id должен быть number`);
  if (typeof chain.is_circular !== 'boolean') err('pdf_chains.js','ТИПЫ',`#${cid}.is_circular должен быть boolean`);
  if (typeof chain.is_crisis_chain !== 'boolean') err('pdf_chains.js','ТИПЫ',`#${cid}.is_crisis_chain должен быть boolean`);
  if (typeof chain.delay_turns !== 'number' || chain.delay_turns < 0)
    err('pdf_chains.js','ТИПЫ',`#${cid}.delay_turns должен быть number >= 0`);
  if (typeof chain.warning_turns !== 'number' || chain.warning_turns < 0)
    err('pdf_chains.js','ТИПЫ',`#${cid}.warning_turns должен быть number >= 0`);
  if (!Array.isArray(chain.upstream_chain_ids))
    err('pdf_chains.js','ТИПЫ',`#${cid}.upstream_chain_ids должен быть Array`);
  else for (const id of chain.upstream_chain_ids) {
    if (typeof id !== 'number') err('pdf_chains.js','ТИПЫ',`#${cid}.upstream_chain_ids содержит не число: ${id}`);
  }
  if (!Array.isArray(chain.downstream_chain_ids))
    err('pdf_chains.js','ТИПЫ',`#${cid}.downstream_chain_ids должен быть Array`);
  else for (const id of chain.downstream_chain_ids) {
    if (typeof id !== 'number') err('pdf_chains.js','ТИПЫ',`#${cid}.downstream_chain_ids содержит не число: ${id}`);
  }
  if (!Array.isArray(chain.inputs)) err('pdf_chains.js','ТИПЫ',`#${cid}.inputs должен быть Array`);
}

// laws_labor.js
for (const [lid, law] of Object.entries(SB.LAWS_LABOR)) {
  const se = law.satisfaction_effects || {};
  for (const [k,v] of Object.entries(se)) {
    if (typeof v !== 'number') err('laws_labor.js','ТИПЫ',`${lid}.satisfaction_effects['${k}'] должен быть числом`);
  }
  if (law.effects) {
    for (const [k,v] of Object.entries(law.effects.labor_laws || {})) {
      if (typeof v !== 'number' && typeof v !== 'boolean')
        err('laws_labor.js','ТИПЫ',`${lid}.effects.labor_laws['${k}'] должен быть number или boolean`);
    }
  }
  if (!Array.isArray(law.incompatible_with))
    err('laws_labor.js','ТИПЫ',`${lid}.incompatible_with должен быть Array`);
  if (typeof law.is_default !== 'boolean')
    err('laws_labor.js','ТИПЫ',`${lid}.is_default должен быть boolean`);
}

// ══════════════════════════════════════════════════════════════════════
// ГРУППА 4: ОБЯЗАТЕЛЬНЫЕ ПОЛЯ
// ══════════════════════════════════════════════════════════════════════

// goods.js
const GOODS_REQ = ['name','name_gen','base_price','unit','category','resource_type','icon','is_food','producers'];
for (const [gid, g] of Object.entries(SB.GOODS)) {
  for (const f of GOODS_REQ) {
    if (g[f] === undefined || g[f] === null) err('goods.js','ПОЛЯ',`${gid} отсутствует или null: '${f}'`);
  }
}

// buildings.js
const BLDG_REQ = ['name','icon','cost','workers_per_unit','worker_profession','production_output',
  'location_requirement','historical_note'];
for (const [bid, b] of Object.entries(SB.BUILDINGS)) {
  for (const f of BLDG_REQ) {
    if (b[f] === undefined) err('buildings.js','ПОЛЯ',`${bid} отсутствует: '${f}'`);
  }
}

// social_classes.js
const CLASS_REQ = ['name','wealth_level','political_weight','needs','can_work_in','ownership_rights','political_actions'];
for (const [cid, c] of Object.entries(SB.SOCIAL_CLASSES)) {
  for (const f of CLASS_REQ) {
    if (c[f] === undefined) err('social_classes.js','ПОЛЯ',`${cid} отсутствует: '${f}'`);
  }
}

// nations.js
for (const [nid, n] of Object.entries(allNations)) {
  if (!n.name) err('nations.js','ПОЛЯ',`${nid} отсутствует: 'name'`);
  if (!n.color) err('nations.js','ПОЛЯ',`${nid} отсутствует: 'color'`);
  if (!n.government || !n.government.type) err('nations.js','ПОЛЯ',`${nid} отсутствует: 'government.type'`);
  if (!n.government || !n.government.ruler || !n.government.ruler.name) err('nations.js','ПОЛЯ',`${nid} отсутствует: 'government.ruler.name'`);
  if (!n.population || typeof n.population.total !== 'number') err('nations.js','ПОЛЯ',`${nid} отсутствует: 'population.total'`);
  if (!n.economy || typeof n.economy.treasury !== 'number') err('nations.js','ПОЛЯ',`${nid} отсутствует: 'economy.treasury'`);
  if (!n.historical_note) warn('nations.js','ПОЛЯ',`${nid} отсутствует: 'historical_note'`);
}

// pdf_chains.js
const CHAIN_REQ = ['id','name','category','nodes','inputs','output','is_circular','bottleneck',
  'alternative','historical_example','upstream_chain_ids','downstream_chain_ids',
  'is_crisis_chain','game_effects','delay_turns','warning_turns'];
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  for (const f of CHAIN_REQ) {
    if (chain[f] === undefined) err('pdf_chains.js','ПОЛЯ',`#${cid} отсутствует: '${f}'`);
  }
}

// goods_meta.js
const META_REQ = ['resource_type','is_strategic','chain_importance','can_be_absent','note'];
for (const [gid, m] of Object.entries(SB.GOODS_META)) {
  for (const f of META_REQ) {
    if (m[f] === undefined) err('goods_meta.js','ПОЛЯ',`${gid} отсутствует: '${f}'`);
  }
}

// laws_labor.js
const LAW_REQ = ['id','name','category','group','description','effects','satisfaction_effects',
  'incompatible_with','is_default','historical_note'];
for (const [lid, law] of Object.entries(SB.LAWS_LABOR)) {
  for (const f of LAW_REQ) {
    if (law[f] === undefined) err('laws_labor.js','ПОЛЯ',`${lid} отсутствует: '${f}'`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// ГРУППА 5: ЛОГИЧЕСКИЕ ПРОТИВОРЕЧИЯ
// ══════════════════════════════════════════════════════════════════════

// goods.js: price_floor <= base_price
for (const [gid, g] of Object.entries(SB.GOODS)) {
  if (typeof g.price_floor === 'number' && typeof g.base_price === 'number' &&
      g.price_floor > g.base_price) {
    err('goods.js','ЛОГИКА',`${gid}: price_floor(${g.price_floor}) > base_price(${g.base_price})`);
  }
}

// goods_meta.js логика resource_type
for (const [gid, m] of Object.entries(SB.GOODS_META)) {
  if (m.resource_type === 'import_only' && m.produced_by !== null)
    err('goods_meta.js','ЛОГИКА',`${gid}: resource_type='import_only' но produced_by != null`);
  if (m.resource_type === 'deposit' && !m.deposit_key)
    err('goods_meta.js','ЛОГИКА',`${gid}: resource_type='deposit' но deposit_key отсутствует`);
  if (m.resource_type === 'processed' && (!m.inputs || Object.keys(m.inputs).length === 0))
    err('goods_meta.js','ЛОГИКА',`${gid}: resource_type='processed' но inputs пустой/null`);
  if (m.resource_type === 'biome' && (!m.allowed_terrains || m.allowed_terrains.length === 0))
    err('goods_meta.js','ЛОГИКА',`${gid}: resource_type='biome' но allowed_terrains пустой`);
  if (m.resource_type === 'livestock' && m.deposit_key !== null && m.deposit_key !== undefined)
    err('goods_meta.js','ЛОГИКА',`${gid}: resource_type='livestock' но deposit_key не null`);
}

// pdf_chains.js логика
for (const [cid, chain] of Object.entries(SB.PDF_CHAINS)) {
  const id = Number(cid);
  // is_crisis_chain=true → crisis_trigger не null
  if (chain.is_crisis_chain === true && !chain.crisis_trigger)
    err('pdf_chains.js','ЛОГИКА',`#${id}: is_crisis_chain=true но crisis_trigger пустой`);
  // is_crisis_chain=false → warning_turns <= 8
  if (chain.is_crisis_chain === false && typeof chain.warning_turns === 'number' && chain.warning_turns > 8)
    warn('pdf_chains.js','ЛОГИКА',`#${id}: не кризисная, но warning_turns=${chain.warning_turns} > 8`);
  // is_circular=true → output должен быть среди nodes
  if (chain.is_circular === true && Array.isArray(chain.nodes) && chain.output) {
    if (!chain.nodes.includes(chain.output))
      warn('pdf_chains.js','ЛОГИКА',`#${id}: is_circular=true, но output='${chain.output}' не найден в nodes`);
  }
  // Цепочки 94-100 → is_crisis_chain=true
  if (id >= 94 && id <= 100 && chain.is_crisis_chain !== true)
    err('pdf_chains.js','ЛОГИКА',`#${id}: должен быть is_crisis_chain=true (кризисный)`);
  // Цепочки 1-93 → is_crisis_chain=false
  if (id >= 1 && id <= 93 && chain.is_crisis_chain !== false) {
    // Проверяем — если помечен как crisis но id < 94
    if (chain.is_crisis_chain === true)
      err('pdf_chains.js','ЛОГИКА',`#${id}: id<=93 но is_crisis_chain=true (должен быть false)`);
  }
}

// laws_labor.js: симметрия incompatible_with и самоссылки
for (const [lid, law] of Object.entries(SB.LAWS_LABOR)) {
  if (!Array.isArray(law.incompatible_with)) continue;
  // Самоссылка
  if (law.incompatible_with.includes(lid))
    err('laws_labor.js','ЛОГИКА',`${lid}: содержит сам себя в incompatible_with`);
  for (const other_id of law.incompatible_with) {
    const other = SB.LAWS_LABOR[other_id];
    if (!other) {
      err('laws_labor.js','ЛОГИКА',`${lid}.incompatible_with: '${other_id}' не существует`);
      continue;
    }
    // Должны быть в одной группе
    if (other.group !== law.group)
      err('laws_labor.js','ЛОГИКА',`${lid} ↔ ${other_id}: разные группы ('${law.group}' vs '${other.group}')`);
    // Симметрия
    if (!Array.isArray(other.incompatible_with) || !other.incompatible_with.includes(lid))
      err('laws_labor.js','ЛОГИКА',`asymmetry: ${lid} содержит ${other_id} но не наоборот`);
  }
}

// social_classes.js: rebellion_trigger
for (const [cid, cls] of Object.entries(SB.SOCIAL_CLASSES)) {
  const pa = cls.political_actions || {};
  const rt = pa.rebellion_trigger;
  if (rt !== undefined) {
    if (typeof rt !== 'number' || rt < 15 || rt > 40)
      err('social_classes.js','ЛОГИКА',`${cid}.rebellion_trigger=${rt} должен быть 15-40`);
    if (cid === 'slaves_class' && rt > 20)
      err('social_classes.js','ЛОГИКА',`slaves_class.rebellion_trigger=${rt} должен быть <= 20`);
    if (cid === 'citizens' && rt < 30)
      err('social_classes.js','ЛОГИКА',`citizens.rebellion_trigger=${rt} должен быть >= 30`);
  }
}

// nations.js: тиран и легитимность, республика и выборы
for (const [nid, nat] of Object.entries(allNations)) {
  const gov = nat.government || {};
  if (gov.type === 'tyranny' && typeof gov.legitimacy === 'number' && gov.legitimacy >= 80)
    warn('nations.js','ЛОГИКА',`${nid}: tyranny но legitimacy=${gov.legitimacy} >= 80`);
  if (gov.type === 'republic' && !gov.elections)
    warn('nations.js','ЛОГИКА',`${nid}: republic но нет поля 'elections'`);
  // population.total >= sum by_profession (предупреждение)
  if (nat.population && nat.population.by_profession) {
    const sum = Object.values(nat.population.by_profession).reduce((a,b) => a + (Number(b)||0), 0);
    if (nat.population.total < sum)
      warn('nations.js','ЛОГИКА',`${nid}: population.total(${nat.population.total}) < сумма профессий(${sum})`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// Вывод
// ══════════════════════════════════════════════════════════════════════
const g1Prefix = ['G2','G3','G4','G5'];
console.log('\n=== ГРУППЫ 2-5: ПОЛНОТА / ТИПЫ / ПОЛЯ / ЛОГИКА ===');
console.log('Ошибок:', ERRORS.length, ' | Предупреждений:', WARNS.length);
if (ERRORS.length) {
  console.log('\n--- ОШИБКИ ---');
  ERRORS.forEach(e => console.log('  ERR:', e));
}
if (WARNS.length) {
  console.log('\n--- ПРЕДУПРЕЖДЕНИЯ ---');
  WARNS.forEach(w => console.log('  WARN:', w));
}
if (!ERRORS.length && !WARNS.length) console.log('  Всё в порядке.');
