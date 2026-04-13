// Тесты Шага 51 (arma.md) — Индикаторы действий ИИ-наций
// Запуск: node tests/test_arma_stage51.mjs
//
// Чеклист из arma.md Шаг 51:
//   [1] После обработки хода в turn.js собирается aiActions[]
//   [2] renderAIIndicators(aiActions) создаёт L.divIcon-маркеры над регионами
//   [3] Маркер 20×20px в цвете нации (через --nc), opacity 0.75
//   [4] Наведение показывает tooltip «Рим: строит Акведук в Латиуме»
//   [5] Маркеры хранятся в aiIndicatorMarkers[], удаляются в начале след. хода
//   [6] CSS @keyframes ai-appear (scale 0→1, opacity 0→0.75)
//   [7] Таблица иконок действий: 🏗 ⚔ 💰 🤝 →

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const aiIndicatorsSrc = readFileSync(
  resolve(__dirname, '..', 'ui', 'map_ai_indicators.js'), 'utf8'
);
const htmlSrc = readFileSync(
  resolve(__dirname, '..', 'index.html'), 'utf8'
);
const turnSrc = readFileSync(
  resolve(__dirname, '..', 'engine', 'turn.js'), 'utf8'
);
const parserSrc = readFileSync(
  resolve(__dirname, '..', 'ai', 'parser.js'), 'utf8'
);

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ═══════════════════════════════════════════════════════════════
section('[1] Модуль подключён в index.html + CSS');
// ═══════════════════════════════════════════════════════════════

check(/<script\s+src=["']ui\/map_ai_indicators\.js["']\s*>/.test(htmlSrc),
  '[1a] index.html подключает ui/map_ai_indicators.js');

check(/\.ai-indicator\s*\{/.test(htmlSrc),
  '[1b] CSS .ai-indicator определён');

check(/\.ai-indicator-divicon\s*\{/.test(htmlSrc),
  '[1c] CSS .ai-indicator-divicon определён (сброс Leaflet)');

check(/@keyframes\s+ai-appear\s*\{/.test(htmlSrc),
  '[1d] @keyframes ai-appear определён');

// CSS-свойства из arma.md
const aiCssMatch = htmlSrc.match(/\.ai-indicator\s*\{([\s\S]*?)\n\s*\}/);
const aiCssBody  = aiCssMatch ? aiCssMatch[1] : '';
check(/width\s*:\s*20px/.test(aiCssBody),       '[1e] width: 20px');
check(/height\s*:\s*20px/.test(aiCssBody),      '[1f] height: 20px');
check(/border-radius\s*:\s*50%/.test(aiCssBody),'[1g] border-radius: 50%');
check(/background\s*:\s*var\(--nc/.test(aiCssBody),
  '[1h] background: var(--nc, #888) — цвет нации через CSS-переменную');
check(/opacity\s*:\s*0\.75/.test(aiCssBody),    '[1i] opacity: 0.75');
check(/font-size\s*:\s*11px/.test(aiCssBody),   '[1j] font-size: 11px');
check(/animation\s*:\s*ai-appear/.test(aiCssBody),
  '[1k] animation: ai-appear');
check(/border\s*:\s*1px\s+solid\s+rgba\(\s*255\s*,\s*255\s*,\s*255/.test(aiCssBody),
  '[1l] border: 1px solid rgba(255,255,255,…)');
check(/box-shadow\s*:/.test(aiCssBody),         '[1m] box-shadow присутствует');

// keyframes содержит from/to с scale 0 → 1
const kfMatch = htmlSrc.match(/@keyframes\s+ai-appear\s*\{([\s\S]*?)\n\s*\}/);
const kfBody = kfMatch ? kfMatch[1] : '';
check(/scale\(0\)/.test(kfBody),    '[1n] keyframe: scale(0) в начале');
check(/scale\(1\)/.test(kfBody),    '[1o] keyframe: scale(1) в конце');

// ═══════════════════════════════════════════════════════════════
section('[2] Публичный API модуля');
// ═══════════════════════════════════════════════════════════════

check(/function\s+recordAIAction\s*\(/.test(aiIndicatorsSrc),
  '[2a] function recordAIAction определена');
check(/function\s+renderAIIndicators\s*\(/.test(aiIndicatorsSrc),
  '[2b] function renderAIIndicators определена');
check(/function\s+clearAIIndicators\s*\(/.test(aiIndicatorsSrc),
  '[2c] function clearAIIndicators определена');
check(/window\.recordAIAction\s*=/.test(aiIndicatorsSrc),
  '[2d] window.recordAIAction экспортирован');
check(/window\.renderAIIndicators\s*=/.test(aiIndicatorsSrc),
  '[2e] window.renderAIIndicators экспортирован');
check(/window\.clearAIIndicators\s*=/.test(aiIndicatorsSrc),
  '[2f] window.clearAIIndicators экспортирован');
check(/window\.getAIActionsCount\s*=/.test(aiIndicatorsSrc),
  '[2g] window.getAIActionsCount экспортирован');
check(/window\.getAIIndicatorMarkers\s*=/.test(aiIndicatorsSrc),
  '[2h] window.getAIIndicatorMarkers экспортирован');

// Таблица иконок из arma.md должна быть в модуле
check(/ACTION_ICON_MAP/.test(aiIndicatorsSrc),
  '[2i] ACTION_ICON_MAP присутствует');
check(/icon:\s*'🏗'/.test(aiIndicatorsSrc),
  '[2j] иконка 🏗 (строительство)');
check(/icon:\s*'⚔'/.test(aiIndicatorsSrc),
  '[2k] иконка ⚔ (набор войск / война)');
check(/icon:\s*'💰'/.test(aiIndicatorsSrc),
  '[2l] иконка 💰 (торговля)');
check(/icon:\s*'🤝'/.test(aiIndicatorsSrc),
  '[2m] иконка 🤝 (дипломатия)');
check(/icon:\s*'→'/.test(aiIndicatorsSrc),
  '[2n] иконка → (перемещение армий)');

// L.divIcon + L.marker
check(/L\.divIcon\s*\(/.test(aiIndicatorsSrc),
  '[2o] L.divIcon — для содержимого индикатора');
check(/L\.marker\s*\(/.test(aiIndicatorsSrc),
  '[2p] L.marker — добавление в leafletMap');
check(/ai-indicator-divicon/.test(aiIndicatorsSrc),
  '[2q] className: ai-indicator-divicon');

// ═══════════════════════════════════════════════════════════════
section('[3] Runtime: песочница с моком Leaflet');
// ═══════════════════════════════════════════════════════════════

const mockEnv = `
  function makeNode(tag) {
    return {
      tagName: tag, children: [], parentNode: null, style: {},
      appendChild(c){ c.parentNode=this; this.children.push(c); return c; },
      removeChild(c){ const i=this.children.indexOf(c); if(i>=0)this.children.splice(i,1); c.parentNode=null; return c; },
    };
  }
  const _document = { createElement(tag) { return makeNode(tag); } };
  const window  = { addEventListener(){}, removeEventListener(){} };
  const console = { warn(){}, log(){} };

  const _active_markers = new Set();

  function FakeDivIcon(opts) { this.opts = opts; this._tag = 'divIcon'; }
  function FakeMarker(latLng, opts) {
    this.latLng = latLng;
    this.opts   = opts || {};
    this._added = false;
    const self = this;
    this.addTo = function(map) {
      self._added = true;
      _active_markers.add(self);
      return self;
    };
    this.remove = function() {
      self._added = false;
      _active_markers.delete(self);
      return self;
    };
  }
  const L = {
    latLng(a, b) { return { lat: a, lng: b }; },
    divIcon(opts) { return new FakeDivIcon(opts); },
    marker(latLng, opts) { return new FakeMarker(latLng, opts); },
  };
  const leafletMap = {
    removeLayer(layer) { if (layer && layer.remove) layer.remove(); },
  };
  const regionLayers = {
    latium_1:    { getCenter() { return { lat: 10, lng: 20 }; } },
    carthage_1:  { getCenter() { return { lat: 15, lng: 25 }; } },
    nile_delta:  { getCenter() { return { lat: 20, lng: 30 }; } },
    hellas_1:    { getCenter() { return { lat: 25, lng: 35 }; } },
    parthia_1:   { getCenter() { return { lat: 30, lng: 40 }; } },
  };
  const MAP_REGIONS = {
    latium_1:   { name: 'Латиум' },
    carthage_1: { name: 'Карфагенская область' },
    nile_delta: { name: 'Дельта Нила' },
  };
  const GAME_STATE = {
    nations: {
      rome:     { name: 'Рим',      color: '#c23b3b' },
      carthage: { name: 'Карфаген', color: '#8a5a2b' },
      egypt:    { name: 'Египет',   color: '#d4a853' },
      greece:   { name: 'Греция',   color: '#3a6ca8' },
    },
    regions: {},
  };

  let document = _document;

  ${aiIndicatorsSrc}

  return { window, _active_markers, L, leafletMap, regionLayers, MAP_REGIONS, GAME_STATE };
`;

let env;
try {
  env = new Function('setTimeout', 'clearTimeout', mockEnv)(setTimeout, clearTimeout);
} catch (e) {
  console.log('  Загрузка модуля: ' + e.message);
}
check(!!env, '[3a] Модуль загружается без ошибок');
check(env && typeof env.window.recordAIAction === 'function',
  '[3b] window.recordAIAction доступен после загрузки');
check(env && typeof env.window.renderAIIndicators === 'function',
  '[3c] window.renderAIIndicators доступен после загрузки');
check(env && typeof env.window.clearAIIndicators === 'function',
  '[3d] window.clearAIIndicators доступен после загрузки');
check(env && typeof env.window.AI_INDICATOR_ACTION_MAP === 'object',
  '[3e] window.AI_INDICATOR_ACTION_MAP экспортирован');

// ═══════════════════════════════════════════════════════════════
section('[4] recordAIAction + renderAIIndicators');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.recordAIAction === 'function') {
  const W = env.window;

  check(W.getAIActionsCount() === 0, '[4a] на старте действий 0');
  check(env._active_markers.size === 0, '[4b] на старте маркеров 0');

  // Запишем 3 действия из разных групп
  W.recordAIAction({ nationId: 'rome',     regionId: 'latium_1',   action: 'build' });
  W.recordAIAction({ nationId: 'carthage', regionId: 'carthage_1', action: 'recruit' });
  W.recordAIAction({ nationId: 'egypt',    regionId: 'nile_delta', action: 'trade' });

  check(W.getAIActionsCount() === 3,
    '[4c] записано 3 действия');
  // Отрисовка
  W.renderAIIndicators();
  check(env._active_markers.size === 3,
    '[4d] после render → 3 маркера на карте');

  // Проверим что в маркере сохранён latLng
  const markers = Array.from(env._active_markers);
  const m0 = markers[0];
  check(m0 && m0.latLng && typeof m0.latLng.lat === 'number',
    '[4e] marker.latLng определён');
  check(m0 && m0.opts && m0.opts.interactive === true,
    '[4f] marker.opts.interactive === true (tooltip работает)');

  // Неизвестное действие игнорируется
  const before = W.getAIActionsCount();
  W.recordAIAction({ nationId: 'greece', regionId: 'hellas_1', action: 'pass' });
  W.recordAIAction({ nationId: 'greece', regionId: 'hellas_1', action: 'wait' });
  W.recordAIAction({ nationId: 'greece', regionId: 'hellas_1', action: 'unknown_xyz' });
  check(W.getAIActionsCount() === before,
    '[4g] wait/pass/неизвестные действия отсеиваются');

  // Без regionId тоже игнор
  W.recordAIAction({ nationId: 'rome', action: 'build' });
  check(W.getAIActionsCount() === before,
    '[4h] без regionId запись отбрасывается');

  // Без nationId тоже игнор
  W.recordAIAction({ regionId: 'latium_1', action: 'build' });
  check(W.getAIActionsCount() === before,
    '[4i] без nationId запись отбрасывается');

  // clearAIIndicators — всё чистится
  W.clearAIIndicators();
  check(W.getAIActionsCount() === 0, '[4j] clear → actions=0');
  check(env._active_markers.size === 0, '[4k] clear → маркеры убраны');
}

// ═══════════════════════════════════════════════════════════════
section('[5] Дедупликация: одна запись на (nation, type, region)');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.recordAIAction === 'function') {
  const W = env.window;
  W.clearAIIndicators();

  // Та же нация в том же регионе с разными, но одного типа, действиями
  W.recordAIAction({ nationId: 'rome', regionId: 'latium_1', action: 'recruit' });
  W.recordAIAction({ nationId: 'rome', regionId: 'latium_1', action: 'recruit_mercs' });
  W.recordAIAction({ nationId: 'rome', regionId: 'latium_1', action: 'raise_army' });
  check(W.getAIActionsCount() === 1,
    '[5a] дедуп: 3 recruiting-действия одной нации в одном регионе → 1 запись');

  // Та же нация, но другой регион → новая запись
  W.recordAIAction({ nationId: 'rome', regionId: 'carthage_1', action: 'recruit' });
  check(W.getAIActionsCount() === 2,
    '[5b] другая регион → новая запись');

  // Другая нация тоже → новая запись
  W.recordAIAction({ nationId: 'carthage', regionId: 'latium_1', action: 'recruit' });
  check(W.getAIActionsCount() === 3,
    '[5c] другая нация → новая запись');

  // Разные типы в одном регионе → разные записи (building ≠ recruiting)
  W.recordAIAction({ nationId: 'rome', regionId: 'latium_1', action: 'build' });
  check(W.getAIActionsCount() === 4,
    '[5d] другой type в том же регионе → новая запись');

  W.clearAIIndicators();
}

// ═══════════════════════════════════════════════════════════════
section('[6] HTML маркера: --nc, tooltip, иконка, классы');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.recordAIAction === 'function') {
  const W = env.window;
  W.clearAIIndicators();

  W.recordAIAction({
    nationId: 'rome',
    regionId: 'latium_1',
    action:   'build',
    detail:   'Акведук'
  });
  W.renderAIIndicators();

  const markers = Array.from(env._active_markers);
  check(markers.length === 1, '[6a] один маркер создан');

  if (markers.length === 1) {
    const m = markers[0];
    const icon = m.opts && m.opts.icon;
    check(!!icon && icon._tag === 'divIcon', '[6b] marker.icon === divIcon');

    const html = icon && icon.opts && icon.opts.html;
    check(typeof html === 'string' && /class="ai-indicator/.test(html),
      '[6c] html содержит класс .ai-indicator');
    check(typeof html === 'string' && /ai-indicator-building/.test(html),
      '[6d] html содержит type-класс .ai-indicator-building');
    check(typeof html === 'string' && html.indexOf('🏗') >= 0,
      '[6e] html содержит иконку 🏗');
    check(typeof html === 'string' && /style="--nc:#c23b3b"/.test(html),
      '[6f] html содержит --nc (цвет нации Рим)');
    check(typeof html === 'string' && /title="[^"]*Рим[^"]*"/.test(html),
      '[6g] tooltip (title) содержит имя нации');
    check(typeof html === 'string' && /title="[^"]*Латиум[^"]*"/.test(html),
      '[6h] tooltip содержит имя региона');
    check(typeof html === 'string' && /title="[^"]*строит[^"]*"/.test(html),
      '[6i] tooltip содержит тип действия (строит)');
    check(typeof html === 'string' && /data-nation="rome"/.test(html),
      '[6j] data-nation="rome"');
    check(typeof html === 'string' && /data-action="build"/.test(html),
      '[6k] data-action="build"');

    // Размер иконки
    check(icon.opts && Array.isArray(icon.opts.iconSize) &&
          icon.opts.iconSize[0] === 20 && icon.opts.iconSize[1] === 20,
      '[6l] iconSize = [20, 20]');
  }

  W.clearAIIndicators();
}

// ═══════════════════════════════════════════════════════════════
section('[7] Таблица action → type/icon: полное покрытие');
// ═══════════════════════════════════════════════════════════════

if (env && env.window.AI_INDICATOR_ACTION_MAP) {
  const MAP = env.window.AI_INDICATOR_ACTION_MAP;
  check(MAP.build              && MAP.build.icon              === '🏗',
    '[7a] build → 🏗');
  check(MAP.recruit            && MAP.recruit.icon            === '⚔',
    '[7b] recruit → ⚔');
  check(MAP.trade              && MAP.trade.icon              === '💰',
    '[7c] trade → 💰');
  check(MAP.form_alliance      && MAP.form_alliance.icon      === '🤝',
    '[7d] form_alliance → 🤝');
  check(MAP.move_army          && MAP.move_army.icon          === '→',
    '[7e] move_army → →');
  check(MAP.declare_war        && MAP.declare_war.icon        === '⚔',
    '[7f] declare_war → ⚔');
  check(MAP.build              && MAP.build.type              === 'building',
    '[7g] build.type === "building"');
  check(MAP.recruit            && MAP.recruit.type            === 'recruiting',
    '[7h] recruit.type === "recruiting"');
  check(MAP.trade              && MAP.trade.type              === 'trade',
    '[7i] trade.type === "trade"');
  check(MAP.form_alliance      && MAP.form_alliance.type      === 'diplomacy',
    '[7j] form_alliance.type === "diplomacy"');
  check(MAP.move_army          && MAP.move_army.type          === 'movement',
    '[7k] move_army.type === "movement"');
}

// ═══════════════════════════════════════════════════════════════
section('[8] Интеграция: engine/turn.js и ai/parser.js');
// ═══════════════════════════════════════════════════════════════

check(/window\.clearAIIndicators/.test(turnSrc),
  '[8a] engine/turn.js вызывает window.clearAIIndicators()');
check(/window\.renderAIIndicators/.test(turnSrc),
  '[8b] engine/turn.js вызывает window.renderAIIndicators()');
check(/window\.recordAIAction/.test(turnSrc),
  '[8c] engine/turn.js вызывает window.recordAIAction() в _rec');
check(/window\.recordAIAction/.test(parserSrc),
  '[8d] ai/parser.js вызывает window.recordAIAction() в applyNationDecision');

// Порядок: clear должен быть В НАЧАЛЕ processAINations, render — В КОНЦЕ
const clearIdx   = turnSrc.indexOf('window.clearAIIndicators');
const renderIdx  = turnSrc.indexOf('window.renderAIIndicators');
const procStart  = turnSrc.indexOf('async function processAINations');
check(clearIdx > procStart && clearIdx < renderIdx,
  '[8e] clearAIIndicators вызывается раньше renderAIIndicators');

// ═══════════════════════════════════════════════════════════════
section('[9] renderAIIndicators(actions) — приём массива из аргумента');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.renderAIIndicators === 'function') {
  const W = env.window;
  W.clearAIIndicators();

  W.renderAIIndicators([
    { nationId: 'rome',     regionId: 'latium_1',   action: 'build' },
    { nationId: 'carthage', regionId: 'carthage_1', action: 'recruit' },
    { nationId: 'egypt',    regionId: 'nile_delta', action: 'trade' },
  ]);
  check(W.getAIActionsCount() === 3,
    '[9a] renderAIIndicators с массивом → 3 записи');
  check(env._active_markers.size === 3,
    '[9b] 3 маркера на карте');

  // Повторный вызов с новым массивом — заменяет старые
  W.renderAIIndicators([
    { nationId: 'greece', regionId: 'hellas_1', action: 'form_alliance' },
  ]);
  check(W.getAIActionsCount() === 1,
    '[9c] повторный render с новым массивом → заменяет старые');
  check(env._active_markers.size === 1,
    '[9d] старые маркеры убраны, остался 1 новый');

  W.clearAIIndicators();
}

// ═══════════════════════════════════════════════════════════════
section('[10] MAX_INDICATORS: защита от переполнения');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.recordAIAction === 'function') {
  const W = env.window;
  W.clearAIIndicators();
  const MAX = env.window.AI_INDICATOR_MAX;
  check(typeof MAX === 'number' && MAX > 0,
    '[10a] window.AI_INDICATOR_MAX > 0');

  // Пишем MAX+10 действий (все разные nation+region)
  for (let i = 0; i < MAX + 10; i++) {
    W.recordAIAction({
      nationId: 'nation_' + i,
      regionId: 'region_' + i,
      action:   'build'
    });
  }
  check(W.getAIActionsCount() <= MAX,
    '[10b] лимит MAX_INDICATORS не превышен');

  W.clearAIIndicators();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log(`РЕЗУЛЬТАТ Шага 51: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('Провалены:');
  for (const f of failures) console.log('  • ' + f);
  process.exit(1);
}
