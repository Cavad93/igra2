// Тесты Шага 48 (arma.md) — Туман войны (разведка)
// Запуск: node tests/test_arma_stage48.mjs
//
// Чеклист Шага 48:
//   [1]  В ui/map.js определена функция getIntelLevel(regionId) → {0,1,2}.
//   [2]  getIntelLevel возвращает 2 для регионов игрока.
//   [3]  getIntelLevel возвращает 2 для соседних регионов (connections).
//   [4]  getIntelLevel возвращает 2 для регионов союзников
//        (active defensive_alliance/military_alliance/marriage_alliance).
//   [5]  getIntelLevel возвращает 1 для регионов в 2 перехода от игрока.
//   [6]  getIntelLevel возвращает 1 для торговых партнёров.
//   [7]  getIntelLevel возвращает 0 для всех далёких регионов.
//   [8]  buildTooltipContent скрывает население как '???' при intel=0.
//   [9]  buildTooltipContent показывает примерную оценку гарнизона при intel=1
//        (roughEstimate → строка содержит '~' и '–').
//  [10]  В buildTooltipContent добавлен индикатор разведки (.rt-intel).
//  [11]  В showRegionInfo значения с intel=0 маскируются как '???'.
//  [12]  В showRegionInfo добавлен блок .ri-intel с уровнем разведки.
//  [13]  buildPolygonStyle при intel=0 и !selected → fillOpacity == 0.45.
//  [14]  CSS .rt-intel / .ri-intel присутствуют в index.html.
//  [15]  Функция refreshFogOverlay определена, создаёт fog SVG overlay.
//  [16]  getIntelLevel использует кэш _fogIntelCache (пересчитывается раз
//        за ход).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapSrc    = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'),   'utf8');
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'),     'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ════════════════════════════════════════════════════════════════
section('[1][16] ui/map.js — getIntelLevel / _fogIntelCache / helpers');
// ════════════════════════════════════════════════════════════════
check(/function\s+getIntelLevel\s*\(\s*regionId\s*\)/.test(mapSrc),
  '[1a] function getIntelLevel(regionId) определена');
check(/window\.getIntelLevel\s*=\s*getIntelLevel/.test(mapSrc),
  '[1b] getIntelLevel экспортирован в window');
check(/function\s+roughEstimate\s*\(/.test(mapSrc),
  '[1c] function roughEstimate определена');
check(/function\s+getIntelLabel\s*\(/.test(mapSrc),
  '[1d] function getIntelLabel определена');
check(/_fogIntelCache/.test(mapSrc),
  '[16a] используется кэш _fogIntelCache');
check(/function\s+_rebuildFogIntelCache\s*\(/.test(mapSrc),
  '[16b] функция _rebuildFogIntelCache определена');
check(/function\s+invalidateFogIntelCache\s*\(/.test(mapSrc),
  '[16c] invalidateFogIntelCache определена');

// ════════════════════════════════════════════════════════════════
section('[13] buildPolygonStyle — intel=0 fillOpacity=0.45');
// ════════════════════════════════════════════════════════════════
check(/buildPolygonStyle\([^)]*intelLevel[^)]*\)/.test(mapSrc)
  || /intelLevel\s*=\s*2/.test(mapSrc),
  '[13a] buildPolygonStyle принимает параметр intelLevel');
check(/intelLevel\s*===\s*0[\s\S]*?fillOpacity:\s*0\.45/.test(mapSrc),
  '[13b] при intelLevel===0 fillOpacity = 0.45');

// ════════════════════════════════════════════════════════════════
section('[8][9][10] buildTooltipContent — фильтрация по intel');
// ════════════════════════════════════════════════════════════════
check(/intel\s*>=\s*1\s*\?[\s\S]*?'\?\?\?'/.test(mapSrc)
  || /intel\s*<\s*1[\s\S]*?\?\?\?/.test(mapSrc)
  || /\?\?\?/.test(mapSrc),
  '[8a] buildTooltipContent использует \'???\' для intel<1');
check(/roughEstimate\(garrisonRaw\)/.test(mapSrc),
  '[9a] buildTooltipContent вызывает roughEstimate для гарнизона');
check(/rt-intel/.test(mapSrc),
  '[10a] buildTooltipContent содержит класс rt-intel');

// ════════════════════════════════════════════════════════════════
section('[11][12] showRegionInfo — маскирование данных + .ri-intel');
// ════════════════════════════════════════════════════════════════
// intelLevel в showRegionInfo должен использоваться
const showInfoStart = mapSrc.indexOf('function showRegionInfo');
const showInfoEnd   = mapSrc.indexOf('function closeRegionInfo', showInfoStart);
const showInfoSrc   = mapSrc.slice(showInfoStart, showInfoEnd);
check(/intelLevel/.test(showInfoSrc),
  '[11a] showRegionInfo использует переменную intelLevel');
check(/intelLevel\s*>=\s*1\s*\?[\s\S]*?:\s*'\?\?\?'/.test(showInfoSrc),
  '[11b] showRegionInfo маскирует значения как \'???\' при intelLevel<1');
check(/ri-intel/.test(showInfoSrc),
  '[12a] showRegionInfo содержит класс ri-intel');
check(/ri-intel--\$\{intelLevel\}/.test(showInfoSrc)
  || /ri-intel--0/.test(showInfoSrc),
  '[12b] ri-intel--{0|1|2} классы присутствуют');

// ════════════════════════════════════════════════════════════════
section('[14] CSS в index.html — .rt-intel и .ri-intel');
// ════════════════════════════════════════════════════════════════
check(/\.rt-intel\s*\{/.test(indexHtml),    '[14a] .rt-intel в CSS');
check(/\.ri-intel\s*\{/.test(indexHtml),    '[14b] .ri-intel в CSS');
check(/\.ri-intel--0/.test(indexHtml),      '[14c] .ri-intel--0 вариант');
check(/\.ri-intel--1/.test(indexHtml),      '[14d] .ri-intel--1 вариант');
check(/\.ri-intel--2/.test(indexHtml),      '[14e] .ri-intel--2 вариант');

// ════════════════════════════════════════════════════════════════
section('[15] refreshFogOverlay');
// ════════════════════════════════════════════════════════════════
check(/function\s+refreshFogOverlay\s*\(/.test(mapSrc),
  '[15a] refreshFogOverlay определена');
check(/fog-hatch-pattern/.test(mapSrc),
  '[15b] fog-hatch-pattern (SVG pattern id)');
check(/createPane\(['"]fogOverlayPane/.test(mapSrc),
  '[15c] createPane(\'fogOverlayPane\') в initLeafletMap');

// ════════════════════════════════════════════════════════════════
// Runtime: извлекаем getIntelLevel / _rebuildFogIntelCache / roughEstimate
// в sandbox и проверяем поведение (чеклисты 2-7).
// ════════════════════════════════════════════════════════════════
section('Runtime — getIntelLevel логика (чеклисты 2-7)');

// Извлекаем нужные функции — собираем единый блок
const startMark = 'function getIntelLevel';
const endMark   = 'function buildPolygonStyle';
const startIdx  = mapSrc.indexOf(startMark);
const endIdx    = mapSrc.indexOf(endMark, startIdx);
let snippet     = mapSrc.slice(startIdx, endIdx);

// Убираем IIFE/window-экспорт в конце (на всякий случай)
snippet = snippet.replace(/if\s*\(\s*typeof\s+window[\s\S]*$/, '');

const sandbox = {
  console,
  MAP_REGIONS: {
    // Свой регион игрока
    'R_HOME':   { name: 'Home',   connections: ['R_ADJ1', 'R_ADJ2'], coords: [] },
    'R_ADJ1':   { name: 'Adj1',   connections: ['R_HOME', 'R_FAR1'],  coords: [] },
    'R_ADJ2':   { name: 'Adj2',   connections: ['R_HOME'],            coords: [] },
    // В 2 перехода через R_ADJ1
    'R_FAR1':   { name: 'Far1',   connections: ['R_ADJ1'],            coords: [] },
    // Далёкий регион (нет связи)
    'R_REMOTE': { name: 'Remote', connections: [],                    coords: [] },
    // Регион союзника
    'R_ALLY':   { name: 'Ally',   connections: [],                    coords: [] },
    // Регион торгового партнёра
    'R_TRADE':  { name: 'Trade',  connections: [],                    coords: [] },
  },
  GAME_STATE: {
    turn: 1,
    player_nation: 'PLAYER',
    regions: {
      'R_HOME':   { nation: 'PLAYER' },
      'R_ADJ1':   { nation: 'NEUTRAL' },
      'R_ADJ2':   { nation: 'NEUTRAL' },
      'R_FAR1':   { nation: 'NEUTRAL' },
      'R_REMOTE': { nation: 'FOE' },
      'R_ALLY':   { nation: 'ALLY' },
      'R_TRADE':  { nation: 'TRADER' },
    },
    nations: {
      'PLAYER': { id: 'PLAYER', economy: { trade_routes: ['TRADER'] } },
      'NEUTRAL': { id: 'NEUTRAL' },
      'FOE':     { id: 'FOE' },
      'ALLY':    { id: 'ALLY' },
      'TRADER':  { id: 'TRADER' },
    },
    diplomacy: {
      treaties: [
        { status: 'active', type: 'defensive_alliance', parties: ['PLAYER', 'ALLY'] },
      ],
    },
  },
};

try {
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
} catch (e) {
  console.error('sandbox error:', e);
}

const getIntelLevel = sandbox.getIntelLevel;
const roughEstimate = sandbox.roughEstimate;
const invalidateFogIntelCache = sandbox.invalidateFogIntelCache;

check(typeof getIntelLevel === 'function',      '[R0] getIntelLevel извлечён');
check(typeof roughEstimate === 'function',      '[R0b] roughEstimate извлечён');

if (typeof getIntelLevel === 'function') {
  check(getIntelLevel('R_HOME')   === 2, '[2] свой регион → 2');
  check(getIntelLevel('R_ADJ1')   === 2, '[3a] соседний регион → 2');
  check(getIntelLevel('R_ADJ2')   === 2, '[3b] соседний регион (другой) → 2');
  check(getIntelLevel('R_ALLY')   === 2, '[4] регион союзника → 2');
  check(getIntelLevel('R_FAR1')   === 1, '[5] в 2 перехода → 1');
  check(getIntelLevel('R_TRADE')  === 1, '[6] торговый партнёр → 1');
  check(getIntelLevel('R_REMOTE') === 0, '[7] далёкий регион → 0');
}

// roughEstimate → строка "~N–M"
if (typeof roughEstimate === 'function') {
  const est = roughEstimate(1234);
  check(typeof est === 'string' && /~/.test(est) && /[–-]/.test(est),
    '[9b] roughEstimate(1234) → строка вида "~N–M"');
  check(roughEstimate(0) === '0',
    '[9c] roughEstimate(0) → "0"');
}

// Кэш: второй вызов на том же ходу не должен пересчитывать (поведенческий тест)
if (typeof getIntelLevel === 'function' && typeof invalidateFogIntelCache === 'function') {
  // Добавляем новый союзник в diplomacy в середине хода и перечитываем —
  // кэш должен быть старым (не видеть союзник), пока invalidate не вызван.
  invalidateFogIntelCache();
  sandbox.GAME_STATE.nations.NEW_ALLY = { id: 'NEW_ALLY' };
  sandbox.MAP_REGIONS.R_NEW = { name: 'NewAlly', connections: [], coords: [] };
  sandbox.GAME_STATE.regions.R_NEW = { nation: 'NEW_ALLY' };
  // Первый вызов собирает кэш — NEW_ALLY ещё не союзник
  check(getIntelLevel('R_NEW') === 0, '[16d] до создания договора — intel=0');
  // Добавляем договор союза
  sandbox.GAME_STATE.diplomacy.treaties.push({
    status: 'active', type: 'military_alliance', parties: ['PLAYER', 'NEW_ALLY'],
  });
  // Без инвалидации кэша — тот же ход → intel всё ещё 0
  check(getIntelLevel('R_NEW') === 0, '[16d-2] кэш не пересчитан → intel=0');
  // Смена хода → getIntelLevel пересобирает кэш
  sandbox.GAME_STATE.turn = 2;
  check(getIntelLevel('R_NEW') === 2, '[16e] смена хода → кэш пересобран, intel=2');
}

// ════════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
