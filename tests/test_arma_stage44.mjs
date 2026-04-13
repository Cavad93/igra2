// Тесты Шага 44 (arma.md) — Стратегические уровни зума
// Запуск: node tests/test_arma_stage44.mjs
//
// Чеклист из arma.md Шаг 44:
//   [1] Определены три уровня зума:
//        strategic: { max: 4 }
//        regional:  { min: 4, max: 6.5 }
//        detailed:  { min: 6.5 }
//   [2] leafletMap.on('zoomend', onZoomChange) — слушатель.
//   [3] Стратегический вид (zoom < 4):
//        - fillOpacity регионов → 0.85
//        - армии уменьшены до 18px (CSS body.map-zoom-strategic)
//        - #map-mode-bar скрыт
//        - подписи регионов обрабатываются (scheduleNationLabelUpdate)
//   [4] Детальный вид (zoom > 6.5):
//        - иконки построек на регионах игрока (L.marker + divIcon)
//        - численность гарнизона как число под флагом
//        - торговые маршруты утолщены
//   [5] Переходы между уровнями — плавные через CSS transition: opacity 0.3s.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapSrc   = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'),  'utf8');
const htmlSrc  = readFileSync(resolve(__dirname, '..', 'index.html'),    'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('[1] ZOOM_LEVELS — константа с тремя уровнями');
// ─────────────────────────────────────────────────────────────
check(/window\.ZOOM_LEVELS\s*=\s*\{/.test(mapSrc),
  '[1a] window.ZOOM_LEVELS объявлена');
check(/strategic\s*:\s*\{\s*max\s*:\s*4\s*\}/.test(mapSrc),
  '[1b] strategic: { max: 4 }');
check(/regional\s*:\s*\{\s*min\s*:\s*4\s*,\s*max\s*:\s*6\.5\s*\}/.test(mapSrc),
  '[1c] regional: { min: 4, max: 6.5 }');
check(/detailed\s*:\s*\{\s*min\s*:\s*6\.5\s*\}/.test(mapSrc),
  '[1d] detailed: { min: 6.5 }');

// ─────────────────────────────────────────────────────────────
section('[2] onZoomChange + подписка на zoomend');
// ─────────────────────────────────────────────────────────────
check(/function\s+onZoomChange\s*\(/.test(mapSrc),
  '[2a] функция onZoomChange определена');
check(/window\.onZoomChange\s*=\s*onZoomChange/.test(mapSrc),
  '[2b] onZoomChange экспортирован на window');
check(/function\s+getZoomLevel\s*\(/.test(mapSrc),
  '[2c] функция getZoomLevel определена');
// Проверяем что zoomend теперь вызывает onZoomChange
check(/leafletMap\.on\(\s*['"]zoomend['"][\s\S]{0,500}onZoomChange/.test(mapSrc),
  '[2d] zoomend-обработчик вызывает onZoomChange');

// ─────────────────────────────────────────────────────────────
section('[3] Strategic view — CSS и логика fillOpacity');
// ─────────────────────────────────────────────────────────────
check(/body\.map-zoom-strategic\s+\.army-marker\s*\{[\s\S]*?width\s*:\s*18px/.test(htmlSrc),
  '[3a] CSS: body.map-zoom-strategic .army-marker { width: 18px }');
check(/body\.map-zoom-strategic\s+\.army-count\s*\{[\s\S]*?display\s*:\s*none/.test(htmlSrc),
  '[3b] CSS: body.map-zoom-strategic .army-count { display: none } (только флаг)');
// fillOpacity до 0.85 на strategic
check(/targetOpacity\s*=\s*\(\s*level\s*===\s*['"]strategic['"]\s*\)\s*\?\s*0\.85/.test(mapSrc),
  '[3c] на strategic fillOpacity регионов → 0.85');
// #map-mode-bar прячется на strategic
check(/map-mode-bar[\s\S]{0,500}level\s*===\s*['"]strategic['"][\s\S]{0,200}opacity/.test(mapSrc) ||
      /level\s*===\s*['"]strategic['"][\s\S]{0,200}map-mode-bar/.test(mapSrc) ||
      /bar\.style\.opacity[\s\S]{0,80}strategic/.test(mapSrc),
  '[3d] #map-mode-bar скрывается на strategic (style.opacity)');

// ─────────────────────────────────────────────────────────────
section('[4] Detailed view — иконки построек + гарнизон + CSS');
// ─────────────────────────────────────────────────────────────
check(/function\s+_buildDetailBuildingsLayer\s*\(/.test(mapSrc),
  '[4a] _buildDetailBuildingsLayer определена');
check(/function\s+_buildDetailGarrisonsLayer\s*\(/.test(mapSrc),
  '[4b] _buildDetailGarrisonsLayer определена');
check(/L\.layerGroup\s*\(\s*\)/.test(mapSrc),
  '[4c] используется L.layerGroup');
check(/L\.divIcon\(\s*\{[\s\S]{0,500}zoom-bld/.test(mapSrc),
  '[4d] L.divIcon с классом zoom-bld-*');
check(/zoom-garrison/.test(mapSrc),
  '[4e] слой гарнизона использует zoom-garrison-*');
check(/\.zoom-bld-mini\s*\{/.test(htmlSrc),
  '[4f] CSS: .zoom-bld-mini определён');
check(/body\.map-zoom-detailed\s+\.zoom-bld-mini\s*\{[\s\S]*?opacity\s*:\s*1/.test(htmlSrc),
  '[4g] CSS: body.map-zoom-detailed .zoom-bld-mini { opacity: 1 }');
check(/\.zoom-garrison-num\s*\{/.test(htmlSrc),
  '[4h] CSS: .zoom-garrison-num определён');
check(/body\.map-zoom-detailed\s+\.trade-route-line\s*\{[\s\S]*?stroke-width/.test(htmlSrc),
  '[4i] CSS: утолщённые торговые маршруты на detailed');

// ─────────────────────────────────────────────────────────────
section('[5] Переходы и body-класс');
// ─────────────────────────────────────────────────────────────
check(/#map-mode-bar\s*\{[\s\S]*?transition\s*:\s*opacity\s*0\.3s/.test(htmlSrc),
  '[5a] #map-mode-bar { transition: opacity 0.3s }');
check(/\.zoom-bld-mini\s*\{[\s\S]*?transition\s*:\s*opacity\s*0\.3s/.test(htmlSrc),
  '[5b] .zoom-bld-mini { transition: opacity 0.3s }');
check(/classList\.add\s*\(\s*['"]map-zoom-['"]\s*\+\s*level/.test(mapSrc) ||
      /classList\.add\(\s*`map-zoom-\$\{level\}`/.test(mapSrc),
  '[5c] body.classList.add("map-zoom-" + level)');
check(/classList\.remove\s*\(\s*['"]map-zoom-strategic['"]\s*,\s*['"]map-zoom-regional['"]\s*,\s*['"]map-zoom-detailed['"]/.test(mapSrc),
  '[5d] очистка предыдущих map-zoom-* классов');

// ─────────────────────────────────────────────────────────────
section('[6] getZoomLevel — корректная классификация');
// ─────────────────────────────────────────────────────────────
// Выполним функцию в изолированной среде
const harness = `
  const window = {};
  ${mapSrc
      // оставим только нужные куски
      .match(/window\.ZOOM_LEVELS\s*=\s*\{[\s\S]*?\};/)[0]}
  ${mapSrc
      .match(/function\s+getZoomLevel\s*\([\s\S]*?^\}/m)[0]}
  return { getZoomLevel, ZOOM_LEVELS: window.ZOOM_LEVELS };
`;
let env;
try {
  env = new Function(harness)();
} catch (e) {
  console.log('  Загрузка getZoomLevel: ' + e.message);
}
check(!!env, '[6a] getZoomLevel загружается без ошибок');
if (env && typeof env.getZoomLevel === 'function') {
  check(env.getZoomLevel(3)    === 'strategic', '[6b] zoom=3  → strategic');
  check(env.getZoomLevel(3.9)  === 'strategic', '[6c] zoom=3.9 → strategic');
  check(env.getZoomLevel(4)    === 'regional',  '[6d] zoom=4  → regional');
  check(env.getZoomLevel(5)    === 'regional',  '[6e] zoom=5  → regional');
  check(env.getZoomLevel(6.5)  === 'regional',  '[6f] zoom=6.5 → regional');
  check(env.getZoomLevel(7)    === 'detailed',  '[6g] zoom=7  → detailed');
  check(env.getZoomLevel(10)   === 'detailed',  '[6h] zoom=10 → detailed');
  // Поведение на мусорных значениях
  check(env.getZoomLevel(NaN)  === 'regional',  '[6i] NaN  → regional (безопасное default)');
  check(env.getZoomLevel('x')  === 'regional',  '[6j] "x"  → regional (безопасное default)');
}

// ─────────────────────────────────────────────────────────────
section('[7] Runtime onZoomChange — интеграция с body и DOM');
// ─────────────────────────────────────────────────────────────
// Подготовим минимальные DOM-моки и загрузим кусок onZoomChange
// в vm-like среду. Мы мокаем leafletMap, regionLayers, document.
const rtHarness = `
  const window = {};
  const _bodyClasses = new Set();
  const _body = {
    classList: {
      add:    (c) => _bodyClasses.add(c),
      remove: (...cs) => cs.forEach(c => _bodyClasses.delete(c)),
      contains:(c) => _bodyClasses.has(c),
    },
  };
  const _mmBar = { style: { opacity: '1', pointerEvents: 'auto' }, id: 'map-mode-bar' };
  const document = {
    body: _body,
    getElementById(id) { return id === 'map-mode-bar' ? _mmBar : null; },
  };
  let console = { warn() {}, log() {} };

  // Мокаем glоbальные регионы — делаем 3 региона, два из них игрока
  const MAP_REGIONS = {
    r1: { mapType: 'plains', nation: 'rome' },
    r2: { mapType: 'plains', nation: 'rome' },
    r3: { mapType: 'Ocean' },
  };
  const _styleHistory = {};
  const regionLayers = {
    r1: { _renderer: {}, setStyle(s){ _styleHistory.r1 = s; }, getCenter(){ return { lat: 40, lng: 12 }; } },
    r2: { _renderer: {}, setStyle(s){ _styleHistory.r2 = s; }, getCenter(){ return { lat: 41, lng: 12 }; } },
    r3: { _renderer: {}, setStyle(){ _styleHistory.r3 = 'must_not'; } },
  };
  let selectedRegionId = null;
  const NON_PLAYABLE_TYPES = new Set(['Ocean','Strait','Lake','Impassible']);
  const GAME_STATE = {
    player_nation: 'rome',
    regions: {
      r1: { nation: 'rome', buildings: ['farm','market'], garrison: 1500 },
      r2: { nation: 'rome', buildings: ['temple'],        garrison: 0 },
      r3: { nation: 'ocean', buildings: [] },
    },
  };

  // Мокаем Leaflet
  const _mapLayers = new Set();
  const leafletMap = {
    getZoom: () => _mockZoom,
    hasLayer: (l) => _mapLayers.has(l),
    removeLayer: (l) => { _mapLayers.delete(l); },
    addLayer: (l) => { _mapLayers.add(l); },
  };
  const _lgInstances = [];
  const L = {
    layerGroup() {
      const lg = {
        _layers: [],
        addLayer(m){ this._layers.push(m); },
        clearLayers(){ this._layers.length = 0; },
        addTo(m){ _mapLayers.add(this); return this; },
      };
      _lgInstances.push(lg);
      return lg;
    },
    divIcon(opts){ return { _divIconOpts: opts }; },
    marker(ll, opts){ return { _ll: ll, _opts: opts }; },
  };
  let _mockZoom = 5;
  function scheduleNationLabelUpdate(){ /* noop */ }

  // Встраиваем ТОЛЬКО нужные функции из ui/map.js
  ${mapSrc.match(/window\.ZOOM_LEVELS\s*=\s*\{[\s\S]*?\};/)[0]}
  ${mapSrc.match(/function\s+getZoomLevel\s*\([\s\S]*?^\}/m)[0]}
  ${mapSrc.match(/let\s+_currentZoomLevel[\s\S]*?null;/)[0]}
  ${mapSrc.match(/let\s+_detailBuildingsLayer[\s\S]*?null;/)[0]}
  ${mapSrc.match(/let\s+_detailGarrisonsLayer[\s\S]*?null;/)[0]}
  ${mapSrc.match(/function\s+_buildingsMiniHtml\s*\([\s\S]*?^\}/m)[0]}
  ${mapSrc.match(/function\s+_buildDetailBuildingsLayer\s*\([\s\S]*?^\}/m)[0]}
  ${mapSrc.match(/function\s+_buildDetailGarrisonsLayer\s*\([\s\S]*?^\}/m)[0]}
  ${mapSrc.match(/function\s+_removeDetailLayers\s*\([\s\S]*?^\}/m)[0]}
  ${mapSrc.match(/function\s+_applyZoomFillOpacity\s*\([\s\S]*?^\}/m)[0]}
  ${mapSrc.match(/function\s+onZoomChange\s*\([\s\S]*?^\}/m)[0]}

  return {
    onZoomChange, _body, _mmBar, _styleHistory, _mapLayers, _lgInstances,
    setZoom(z){ _mockZoom = z; },
    getCurrent(){ return _currentZoomLevel; },
    resetState(){
      _bodyClasses.clear();
      _mmBar.style.opacity = '1';
      _mmBar.style.pointerEvents = 'auto';
      for (const k in _styleHistory) delete _styleHistory[k];
    },
  };
`;

let rt;
try {
  rt = new Function(rtHarness)();
} catch (e) {
  console.log('  Runtime harness error: ' + e.message);
}
check(!!rt, '[7a] runtime onZoomChange-harness загружен');
if (rt) {
  // strategic (zoom < 4)
  rt.setZoom(3);
  rt.onZoomChange(3);
  check(rt._body.classList.contains('map-zoom-strategic'),
    '[7b] zoom=3: body получает класс map-zoom-strategic');
  check(rt._mmBar.style.opacity === '0',
    '[7c] zoom=3: #map-mode-bar opacity=0 (скрыт)');
  check(rt._styleHistory.r1 && Math.abs(rt._styleHistory.r1.fillOpacity - 0.85) < 1e-6,
    '[7d] zoom=3: fillOpacity r1 = 0.85');
  check(rt._styleHistory.r2 && Math.abs(rt._styleHistory.r2.fillOpacity - 0.85) < 1e-6,
    '[7e] zoom=3: fillOpacity r2 = 0.85');
  check(rt._styleHistory.r3 !== 'must_not',
    '[7f] zoom=3: Ocean-регионы не трогаются');

  // regional (zoom=5)
  rt.setZoom(5);
  rt.onZoomChange(5);
  check(rt._body.classList.contains('map-zoom-regional'),
    '[7g] zoom=5: body получает класс map-zoom-regional');
  check(!rt._body.classList.contains('map-zoom-strategic'),
    '[7h] zoom=5: map-zoom-strategic удалён');
  check(rt._mmBar.style.opacity === '1',
    '[7i] zoom=5: #map-mode-bar opacity=1 (виден)');
  check(rt._styleHistory.r1 && Math.abs(rt._styleHistory.r1.fillOpacity - 0.70) < 1e-6,
    '[7j] zoom=5: fillOpacity r1 = 0.70 (default)');

  // detailed (zoom=8)
  rt.setZoom(8);
  rt.onZoomChange(8);
  check(rt._body.classList.contains('map-zoom-detailed'),
    '[7k] zoom=8: body получает класс map-zoom-detailed');
  check(rt._mapLayers.size >= 1,
    '[7l] zoom=8: детальные layerGroup добавлены в карту (>=1)');
  // Проверяем: среди добавленных layerGroup есть тот, что содержит как минимум
  // иконку построек для r1 (buildings=['farm','market'])
  const hasBuildings = rt._lgInstances.some(lg =>
    lg._layers.some(m => m._opts && m._opts.icon && m._opts.icon._divIconOpts
      && /zoom-bld-div/.test(m._opts.icon._divIconOpts.className || '')));
  check(hasBuildings, '[7m] zoom=8: создан marker с divIcon.className = zoom-bld-div');
  const hasGarrison = rt._lgInstances.some(lg =>
    lg._layers.some(m => m._opts && m._opts.icon && m._opts.icon._divIconOpts
      && /zoom-garrison-div/.test(m._opts.icon._divIconOpts.className || '')));
  check(hasGarrison, '[7n] zoom=8: создан marker с divIcon.className = zoom-garrison-div');

  // При возврате на strategic детальные слои удаляются
  rt.setZoom(3.5);
  rt.onZoomChange(3.5);
  check(rt._body.classList.contains('map-zoom-strategic'),
    '[7o] zoom=3.5: возврат → map-zoom-strategic');
  check(rt._mapLayers.size === 0,
    '[7p] zoom=3.5: детальные layerGroup удалены из карты');

  // Идемпотентность: второй вызов с тем же zoom не меняет состояние
  rt.resetState();
  rt.onZoomChange(3);
  const opAfter1 = rt._mmBar.style.opacity;
  rt.resetState();  // сбросим _styleHistory, классы пусты, но _currentZoomLevel остался
  rt.onZoomChange(3);
  check(rt._body.classList.contains('map-zoom-strategic') === false,
    '[7q] идемпотентность: повторный onZoomChange(3) — not re-apply (раннее return)');
}

// ─────────────────────────────────────────────────────────────
section('[8] Первичное применение в initLeafletMap');
// ─────────────────────────────────────────────────────────────
check(/Шаг 44[\s\S]{0,200}onZoomChange\(leafletMap\.getZoom\(\)\)/.test(mapSrc),
  '[8a] onZoomChange вызывается сразу после инициализации Leaflet');

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
