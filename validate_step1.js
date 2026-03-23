// validate_step1.js — Шаг 1: загрузка файлов и построение эталонных наборов
const fs  = require('fs');
const vm  = require('vm');

// Общий sandbox для всех файлов
const SB = vm.createContext({
  require, process, console,
  INITIAL_GAME_STATE: { regions: {} }  // мок для regions_data.js
});

function loadFile(f) {
  if (!fs.existsSync('data/' + f)) {
    console.error('КРИТИЧНО: файл ' + f + ' отсутствует, агент не запустится');
    process.exit(1);
  }
  const code = fs.readFileSync('data/' + f, 'utf8')
    .replace(/^const /mg, 'var ')
    .replace(/^let /mg,   'var ');
  try {
    vm.runInContext(code, SB);
  } catch(e) {
    console.error('КРИТИЧНО: синтаксическая ошибка в ' + f + ': ' + e.message);
    process.exit(1);
  }
}

loadFile('goods.js');
loadFile('buildings.js');
loadFile('social_classes.js');
loadFile('regions_data.js');
loadFile('biomes.js');
loadFile('nations.js');
loadFile('laws_labor.js');
loadFile('goods_meta.js');
loadFile('pdf_chains.js');

// Строим эталонные наборы из sandbox
const GOODS_IDS    = new Set(Object.keys(SB.GOODS));
const BUILDING_IDS = new Set(Object.keys(SB.BUILDINGS));
const CLASS_IDS    = new Set(Object.keys(SB.SOCIAL_CLASSES));
// nations живут внутри INITIAL_GAME_STATE.nations
const NATION_IDS   = new Set(Object.keys(SB.INITIAL_GAME_STATE.nations));
const BIOME_IDS    = new Set(Object.keys(SB.BIOME_META));
const LAW_IDS      = new Set(Object.keys(SB.LAWS_LABOR));
const META_IDS     = new Set(Object.keys(SB.GOODS_META));
const CHAIN_IDS    = new Set(Object.keys(SB.PDF_CHAINS).map(Number));

console.log('=== ШАГ 1: ЭТАЛОННЫЕ НАБОРЫ ===');
console.log('GOODS_IDS     :', GOODS_IDS.size,    'товаров  |', [...GOODS_IDS].join(', '));
console.log('BUILDING_IDS  :', BUILDING_IDS.size, 'зданий');
console.log('CLASS_IDS     :', CLASS_IDS.size,    'классов  |', [...CLASS_IDS].join(', '));
console.log('NATION_IDS    :', NATION_IDS.size,   'наций');
console.log('BIOME_IDS     :', BIOME_IDS.size,    'биомов   |', [...BIOME_IDS].join(', '));
console.log('LAW_IDS       :', LAW_IDS.size,      'законов');
console.log('META_IDS      :', META_IDS.size,     'товаров в meta  |', [...META_IDS].join(', '));
console.log('CHAIN_IDS     :', CHAIN_IDS.size,    'цепочек');
console.log();
console.log('Шаг 1 завершён. Все 9 файлов загружены успешно.');
