// Тесты Шага 36 (arma.md) — Исправить баг потери цветов регионов
// Запуск: node tests/test_arma_stage36.mjs
//
// Чеклист из arma.md Шаг 36:
//   [1] В initLeafletMap() добавлен третий страховочный вызов
//       setTimeout(() => refreshRegionStyles(), 1200)
//   [2] leafletMap.on('layeradd', ...) — дебаунс через _colorRefreshTimer,
//       вызывающий refreshRegionStyles() через 100мс.
//   [3] В renderMap() (else ветка: leafletMap уже существует) —
//       вызов leafletMap.invalidateSize() и refreshRegionStyles().
//   [4] В refreshRegionStyles() защита: если у слоя нет ._renderer —
//       пропустить и запланировать повтор через setTimeout.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapSrc = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('Статический анализ ui/map.js');
// ─────────────────────────────────────────────────────────────

// [1] Третий страховочный вызов в renderMap/initLeafletMap на 1200мс
check(/setTimeout\([\s\S]*?refreshRegionStyles[\s\S]*?\}\s*,\s*1200\s*\)/.test(mapSrc),
  '[1a] setTimeout(..., 1200) со страховочным refreshRegionStyles найден');

// Также должны сохраниться прежние страховочные вызовы
check(/setTimeout\([\s\S]*?refreshRegionStyles[\s\S]*?\}\s*,\s*400\s*\)/.test(mapSrc),
  '[1b] setTimeout(..., 400) страховочный вызов сохранён');

// [2] Дебаунс-переменная _colorRefreshTimer объявлена
check(/let\s+_colorRefreshTimer\s*=\s*null/.test(mapSrc),
  '[2a] let _colorRefreshTimer = null объявлена на верхнем уровне');

// [2] layeradd-слушатель с дебаунсом 100мс
check(/leafletMap\.on\(\s*['"]layeradd['"]\s*,/.test(mapSrc),
  '[2b] leafletMap.on("layeradd", ...) зарегистрирован');

const layerAddBlock = mapSrc.match(/leafletMap\.on\(\s*['"]layeradd['"][\s\S]*?\}\s*\);/);
check(!!layerAddBlock, '[2c] блок обработчика layeradd распарсен');
const addBody = layerAddBlock ? layerAddBlock[0] : '';
check(/clearTimeout\(\s*_colorRefreshTimer\s*\)/.test(addBody),
  '[2d] layeradd использует clearTimeout(_colorRefreshTimer) для дебаунса');
check(/setTimeout\([^]*refreshRegionStyles[^]*\}\s*,\s*100\s*\)/.test(addBody),
  '[2e] layeradd назначает setTimeout(refreshRegionStyles, 100)');

// [3] В renderMap else-ветке (leafletMap уже существует) —
//     invalidateSize + refreshRegionStyles
const renderMapMatch = mapSrc.match(
  /function\s+renderMap\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!renderMapMatch, '[3a] функция renderMap распарсена');
const renderMapBody = renderMapMatch ? renderMapMatch[0] : '';
const elseIdx = renderMapBody.indexOf('} else {');
check(elseIdx >= 0, '[3b] else-ветка renderMap найдена');
const elseBody = elseIdx >= 0 ? renderMapBody.slice(elseIdx) : '';
check(/leafletMap\.invalidateSize\(\s*\)/.test(elseBody),
  '[3c] else-ветка вызывает leafletMap.invalidateSize()');
check(/refreshRegionStyles\(\s*\)/.test(elseBody),
  '[3d] else-ветка вызывает refreshRegionStyles()');

// [4] Защита от отсутствующего _renderer внутри refreshRegionStyles
const refreshMatch = mapSrc.match(
  /function\s+refreshRegionStyles\s*\(\s*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!refreshMatch, '[4a] функция refreshRegionStyles распарсена');
const refreshBody = refreshMatch ? refreshMatch[0] : '';
check(/if\s*\(\s*!\s*layer\._renderer\s*\)/.test(refreshBody),
  '[4b] защита: if (!layer._renderer) — пропуск слоя без рендерера');
check(/continue;/.test(refreshBody),
  '[4c] пропуск через continue');
check(/setTimeout\([\s\S]*?refreshRegionStyles[\s\S]*?\)/.test(refreshBody),
  '[4d] очередь повтора через setTimeout(refreshRegionStyles, ...)');

// ─────────────────────────────────────────────────────────────
section('Поведение — sandbox: refreshRegionStyles с mock-слоями');
// ─────────────────────────────────────────────────────────────

// Запускаем refreshRegionStyles в sandbox через Function, подставляя
// нужные глобалы (MAP_REGIONS, GAME_STATE, regionLayers и т.п.).

// Извлекаем исходник функции для "выполнения" её.
const fnSrc = refreshMatch[0];

// Мок окружения
function makeLayer(withRenderer) {
  return {
    _renderer: withRenderer ? {} : null,
    _styleCalls: 0,
    setStyle() { this._styleCalls++; },
    getTooltip() { return null; },
    setTooltipContent() {},
  };
}

const mockRegions = {
  r1: { mapType: 'Plains', nation: 'A' },
  r2: { mapType: 'Plains', nation: 'A' },
  r3: { mapType: 'Ocean',  nation: null },
};
const layerR1 = makeLayer(true);
const layerR2 = makeLayer(false); // без _renderer → должен быть пропущен
const layerR3 = makeLayer(true);  // ocean → пропускается по типу

const env = {
  MAP_REGIONS: mockRegions,
  NON_PLAYABLE_TYPES: new Set(['Ocean', 'Strait', 'Lake', 'Impassible']),
  GAME_STATE: { regions: {}, nations: { A: { color: '#ff0000' } }, player_nation: null },
  regionLayers: { r1: layerR1, r2: layerR2, r3: layerR3 },
  selectedRegionId: null,
  getProvinceBlendColor: () => null,
  buildPolygonStyle: () => ({}),
  buildTooltipContent: () => '',
  _regionOccupationColors: () => [null, null],
  leafletMap: {},
  _colorRefreshRetryTimer: null,
  _timers: [],
};

// setTimeout мок
function mockSetTimeout(fn, delay) {
  const id = env._timers.length + 1;
  env._timers.push({ id, fn, delay, cancelled: false });
  return id;
}
function mockClearTimeout(id) {
  const t = env._timers.find(t => t.id === id);
  if (t) t.cancelled = true;
}

const sandboxFactory = new Function(
  'MAP_REGIONS','NON_PLAYABLE_TYPES','GAME_STATE','regionLayers',
  'selectedRegionId','getProvinceBlendColor','buildPolygonStyle',
  'buildTooltipContent','_regionOccupationColors','leafletMap',
  'setTimeout','clearTimeout',
  `
  let _colorRefreshRetryTimer = null;
  ${fnSrc}
  return { run: refreshRegionStyles, getRetryTimer: () => _colorRefreshRetryTimer };
  `
);

const sandbox = sandboxFactory(
  env.MAP_REGIONS, env.NON_PLAYABLE_TYPES, env.GAME_STATE, env.regionLayers,
  env.selectedRegionId, env.getProvinceBlendColor, env.buildPolygonStyle,
  env.buildTooltipContent, env._regionOccupationColors, env.leafletMap,
  mockSetTimeout, mockClearTimeout
);

sandbox.run();

check(layerR1._styleCalls === 1,
  '[B1] слой r1 (с _renderer) получил setStyle');
check(layerR2._styleCalls === 0,
  '[B2] слой r2 (без _renderer) ПРОПУЩЕН — setStyle не вызван');
check(layerR3._styleCalls === 0,
  '[B3] слой r3 (Ocean) пропущен по типу, setStyle не вызван');

// Проверяем, что была запланирована повторная попытка
check(env._timers.length >= 1,
  '[B4] запланирован повторный вызов через setTimeout');
const retry = env._timers[env._timers.length - 1];
check(retry && retry.delay >= 50 && retry.delay <= 500,
  '[B5] задержка повтора в разумных пределах (50..500мс)');

// Эмулируем, что к моменту повтора r2 получил рендерер
layerR2._renderer = {};
retry.fn();

check(layerR2._styleCalls === 1,
  '[B6] после повтора слой r2 получил setStyle');

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
