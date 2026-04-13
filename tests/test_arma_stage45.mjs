// Тесты Шага 45 (arma.md) — Сезонный визуал карты
// Запуск: node tests/test_arma_stage45.mjs
//
// Чеклист из arma.md Шаг 45:
//   [1] В index.html добавлен div#season-overlay поверх карты.
//   [2] CSS: position:absolute; inset:0; pointer-events:none; z-index:200;
//        transition: background 2s ease, filter 2s ease.
//   [3] JS: константа SEASON_STYLES с 4-мя сезонами (0..3), поля overlay, filter, icon, label.
//   [4] JS: функция applySeasonVisual(season) — применяет overlay и фильтр карты.
//   [5] updateDateDisplay дополнен иконкой сезона.
//   [6] applySeasonVisual вызывается в renderAll() (для вызова после каждого хода и при загрузке).
//   [7] Фильтр не мешает кликам (pointer-events:none у оверлея).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlSrc = readFileSync(resolve(__dirname, '..', 'index.html'),  'utf8');
const turnSrc = readFileSync(resolve(__dirname, '..', 'engine', 'turn.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('[1] HTML — div#season-overlay');
// ─────────────────────────────────────────────────────────────
check(/<div\s+id=["']season-overlay["']\s*>\s*<\/div>/.test(htmlSrc),
  '[1a] <div id="season-overlay"></div> присутствует в index.html');

// season-overlay должен быть внутри #map-container
const mapBlockMatch = htmlSrc.match(/<div\s+id=["']map-container["'][\s\S]*?<\/div>\s*<\/div>/);
// Грубая проверка: между map-container и первым закрывающим должно встретиться season-overlay
const mcIdx = htmlSrc.indexOf('id="map-container"');
const soIdx = htmlSrc.indexOf('id="season-overlay"');
check(mcIdx > 0 && soIdx > mcIdx, '[1b] season-overlay объявлен после #map-container');

// ─────────────────────────────────────────────────────────────
section('[2] CSS — #season-overlay стили (position/inset/transition)');
// ─────────────────────────────────────────────────────────────
const cssBlockMatch = htmlSrc.match(/#season-overlay\s*\{[^}]*\}/);
check(!!cssBlockMatch, '[2a] блок CSS #season-overlay найден');
const cssBlock = cssBlockMatch ? cssBlockMatch[0] : '';
check(/position\s*:\s*absolute/.test(cssBlock),        '[2b] position: absolute');
check(/inset\s*:\s*0/.test(cssBlock),                   '[2c] inset: 0');
check(/pointer-events\s*:\s*none/.test(cssBlock),       '[2d] pointer-events: none (не мешает кликам)');
check(/z-index\s*:\s*200/.test(cssBlock),               '[2e] z-index: 200');
check(/transition\s*:\s*background\s+2s\s+ease\s*,\s*filter\s+2s\s+ease/.test(cssBlock),
  '[2f] transition: background 2s ease, filter 2s ease');

// Плавный transition фильтра должен быть применён к leaflet-контейнеру
check(/#map-container[\s\S]{0,200}transition\s*:\s*filter\s+2s\s+ease/.test(htmlSrc),
  '[2g] #map-container имеет transition: filter 2s ease');

// ─────────────────────────────────────────────────────────────
section('[3] SEASON_STYLES — 4 сезона со всеми полями');
// ─────────────────────────────────────────────────────────────
check(/const\s+SEASON_STYLES\s*=\s*\{/.test(turnSrc),
  '[3a] const SEASON_STYLES определена в engine/turn.js');

// Проверяем, что все 4 ключа присутствуют с подполями
for (const [key, label, icon] of [
  ['0', 'Весна', '🌸'],
  ['1', 'Лето',  '☀'],
  ['2', 'Осень', '🍂'],
  ['3', 'Зима',  '❄'],
]) {
  const rx = new RegExp(`${key}\\s*:\\s*\\{[^}]*label\\s*:\\s*['"]${label}['"]`, 'm');
  check(rx.test(turnSrc), `[3b] season ${key} → label ${label}`);
  const rxI = new RegExp(`${key}\\s*:\\s*\\{[^}]*icon\\s*:\\s*['"]${icon}`, 'm');
  check(rxI.test(turnSrc), `[3c] season ${key} → icon ${icon}`);
}
check(/overlay\s*:\s*['"]rgba\(/.test(turnSrc),
  '[3d] у каждого сезона есть overlay rgba(...)');
check(/filter\s*:\s*['"](hue-rotate|brightness|saturate|sepia)/.test(turnSrc),
  '[3e] у сезонов есть filter (hue-rotate/brightness/saturate/sepia)');

// ─────────────────────────────────────────────────────────────
section('[4] applySeasonVisual — функция определена и экспортирована');
// ─────────────────────────────────────────────────────────────
check(/function\s+applySeasonVisual\s*\(/.test(turnSrc),
  '[4a] function applySeasonVisual(...) определена');
check(/window\.applySeasonVisual\s*=\s*applySeasonVisual/.test(turnSrc),
  '[4b] applySeasonVisual экспортирован на window');
check(/function\s+getCurrentSeason\s*\(/.test(turnSrc),
  '[4c] getCurrentSeason определена');
check(/window\.getCurrentSeason\s*=\s*getCurrentSeason/.test(turnSrc),
  '[4d] getCurrentSeason экспортирован на window');

// Проверяем, что applySeasonVisual трогает season-overlay и leafletMap.getContainer()
check(/getElementById\(\s*['"]season-overlay['"]\s*\)/.test(turnSrc),
  '[4e] ищется элемент season-overlay');
check(/leafletMap[\s\S]{0,80}getContainer\s*\(\s*\)[\s\S]{0,160}style\.filter/.test(turnSrc),
  '[4f] применяется leafletMap.getContainer().style.filter = ...');
check(/overlay\.style\.background\s*=/.test(turnSrc),
  '[4g] применяется overlay.style.background = ...');

// ─────────────────────────────────────────────────────────────
section('[5] updateDateDisplay — префикс с иконкой сезона');
// ─────────────────────────────────────────────────────────────
// updateDateDisplay должен использовать SEASON_STYLES / getCurrentSeason
const udd = turnSrc.match(/function\s+updateDateDisplay\s*\(\s*\)\s*\{[\s\S]*?\n\}/);
check(!!udd, '[5a] блок updateDateDisplay найден');
if (udd) {
  const body = udd[0];
  check(/getCurrentSeason\s*\(\s*\)/.test(body),
    '[5b] updateDateDisplay использует getCurrentSeason()');
  check(/SEASON_STYLES\s*\[\s*season\s*\]/.test(body),
    '[5c] updateDateDisplay читает SEASON_STYLES[season]');
  check(/season-chip/.test(body),
    '[5d] updateDateDisplay создаёт .season-chip');
}

// ─────────────────────────────────────────────────────────────
section('[6] renderAll — вызов applySeasonVisual');
// ─────────────────────────────────────────────────────────────
const renderAllMatch = turnSrc.match(/function\s+renderAll\s*\(\s*\)\s*\{[\s\S]*?\n\}/);
check(!!renderAllMatch, '[6a] функция renderAll найдена');
if (renderAllMatch) {
  check(/applySeasonVisual\s*\(/.test(renderAllMatch[0]),
    '[6b] renderAll вызывает applySeasonVisual()');
}

// ─────────────────────────────────────────────────────────────
section('[7] Интерактивность: overlay не ловит события мыши');
// ─────────────────────────────────────────────────────────────
check(/#season-overlay[\s\S]*?pointer-events\s*:\s*none/.test(htmlSrc),
  '[7a] #season-overlay имеет pointer-events: none — клики на карте работают');

// ─────────────────────────────────────────────────────────────
section('[8] Runtime — getCurrentSeason и применение стилей');
// ─────────────────────────────────────────────────────────────
// Мини-harness: выдёргиваем SEASON_STYLES + getCurrentSeason + applySeasonVisual,
// мокаем DOM/leafletMap и проверяем значения.
const harness = `
  const window = {};
  const _el = {
    'season-overlay': { style: { background: '' }, id: 'season-overlay' },
    'game-date': { innerHTML: '', textContent: '', appendChild(){}, set _t(v){ this.textContent = v; } },
    'map': null,
    'map-container': { style: { filter: '' } },
  };
  const document = {
    getElementById(id){ return _el[id] || null; },
    createElement(){ return { className:'', title:'', textContent:'', appendChild(){}, style:{} }; },
    createTextNode(t){ return { _t: t }; },
  };
  const console = { warn(){}, error(){}, log(){} };
  const GAME_STATE = { turn: 0, player_nation: 'pl', nations: { pl: { ou: { tick: 0 } } } };
  const leafletMap = {
    _container: { style: { filter: '' } },
    getContainer(){ return this._container; },
  };

  ${turnSrc.match(/const\s+SEASON_STYLES\s*=\s*\{[\s\S]*?\};/)[0]}
  ${turnSrc.match(/function\s+getCurrentSeason\s*\([\s\S]*?^\}/m)[0]}
  ${turnSrc.match(/function\s+applySeasonVisual\s*\([\s\S]*?^\}/m)[0]}

  return {
    SEASON_STYLES, getCurrentSeason, applySeasonVisual,
    setTick(t){ GAME_STATE.nations.pl.ou.tick = t; GAME_STATE.turn = t; },
    getLeafletFilter(){ return leafletMap._container.style.filter; },
    getOverlayBg(){ return _el['season-overlay'].style.background; },
  };
`;

let rt;
try {
  rt = new Function(harness)();
} catch (e) {
  console.log('  harness error: ' + e.message);
}
check(!!rt, '[8a] harness загружается без ошибок');
if (rt) {
  // 0 → spring
  rt.setTick(0);
  check(rt.getCurrentSeason() === 0, '[8b] tick=0 → сезон 0 (весна)');
  rt.applySeasonVisual();
  check(rt.getOverlayBg() === rt.SEASON_STYLES[0].overlay, '[8c] tick=0: overlay bg = весна.overlay');
  check(rt.getLeafletFilter() === rt.SEASON_STYLES[0].filter, '[8d] tick=0: leaflet filter = весна.filter');

  rt.setTick(1);
  check(rt.getCurrentSeason() === 1, '[8e] tick=1 → сезон 1 (лето)');
  rt.applySeasonVisual();
  check(rt.getLeafletFilter() === rt.SEASON_STYLES[1].filter, '[8f] tick=1: leaflet filter = лето.filter');

  rt.setTick(2);
  check(rt.getCurrentSeason() === 2, '[8g] tick=2 → сезон 2 (осень)');
  rt.applySeasonVisual();
  check(rt.getOverlayBg() === rt.SEASON_STYLES[2].overlay, '[8h] tick=2: overlay bg = осень.overlay');

  rt.setTick(3);
  check(rt.getCurrentSeason() === 3, '[8i] tick=3 → сезон 3 (зима)');

  // цикл: tick=4 → снова весна
  rt.setTick(4);
  check(rt.getCurrentSeason() === 0, '[8j] tick=4 → снова весна (цикл)');

  // Явный параметр season переопределяет
  rt.applySeasonVisual(2);
  check(rt.getOverlayBg() === rt.SEASON_STYLES[2].overlay, '[8k] applySeasonVisual(2) применяет осень даже если tick=4');
}

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
