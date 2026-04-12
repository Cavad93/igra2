// Тесты Шага 29 (arma.md) — Режимы карты (Map modes)
// Запуск: node tests/test_arma_stage29.mjs
//
// Чеклист из arma.md Шаг 29:
//   [1] <div id="map-mode-bar"> с 4 кнопками (.mm-btn data-mode=…):
//       political 🗺, economy 💰, military ⚔, population 👥
//   [2] CSS #map-mode-bar { position:absolute; top:8px; left:8px; z-index:500; display:flex; gap:4px }
//   [3] CSS .mm-btn { width:32px; height:32px; background:rgba(13,10,5,0.85);
//       border:1px solid var(--border-gold); border-radius:3px; cursor:pointer; font-size:15px }
//   [4] CSS .mm-btn.active { background:rgba(107,79,26,0.5); border-color:var(--accent) }
//   [5] В ui/map.js объявлена function setMapMode(mode); window.MAP_MODES и window.CURRENT_MAP_MODE
//       экспортированы; режимы: political / economy / military / population.
//   [6] Хоткеи 1..4 в onHotkey (index.html) вызывают setMapMode(<mode>).
//   [7] Поведение (моделирование на mock-слоях):
//       - setMapMode('political')  — все слои получают стиль владельца-нации (buildPolygonStyle)
//       - setMapMode('economy')    — fillColor перекрашивается (тепловая карта)
//       - setMapMode('military')   — регионы без армий получают opacity ≤ 0.4
//       - setMapMode('population') — fillColor перекрашивается (синяя шкала)

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const mapSrc    = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ───────────────────────────────────────────────────────
section('HTML — #map-mode-bar с 4 кнопками');
// ───────────────────────────────────────────────────────

check(/<div[^>]*id="map-mode-bar"/.test(indexHtml),
  '[1a] <div id="map-mode-bar"> присутствует');

const modes = [
  { id: 'political',  glyph: '🗺' },
  { id: 'economy',    glyph: '💰' },
  { id: 'military',   glyph: '⚔' },
  { id: 'population', glyph: '👥' },
];

for (const m of modes) {
  const re = new RegExp(
    `<button[^>]*class="mm-btn[^"]*"[^>]*data-mode="${m.id}"[^>]*>[^<]*${m.glyph}[^<]*<\\/button>`
  );
  check(re.test(indexHtml),
    `[1b-${m.id}] кнопка .mm-btn[data-mode="${m.id}"] с символом ${m.glyph}`);
}

// Первая кнопка (political) должна иметь класс active по умолчанию
check(/<button[^>]*class="mm-btn\s+active"[^>]*data-mode="political"/.test(indexHtml),
  '[1c] кнопка political имеет класс active по умолчанию');

// ───────────────────────────────────────────────────────
section('CSS — #map-mode-bar + .mm-btn + .mm-btn.active');
// ───────────────────────────────────────────────────────

const barCssMatch = indexHtml.match(/#map-mode-bar\s*\{[^}]+\}/);
check(!!barCssMatch, '[pre] CSS блок #map-mode-bar найден');
const barCss = barCssMatch ? barCssMatch[0] : '';
check(/position:\s*absolute/.test(barCss),   '[2a] #map-mode-bar position:absolute');
check(/top:\s*8px/.test(barCss),             '[2b] #map-mode-bar top:8px');
check(/left:\s*8px/.test(barCss),            '[2c] #map-mode-bar left:8px');
check(/z-index:\s*500/.test(barCss),         '[2d] #map-mode-bar z-index:500');
check(/display:\s*flex/.test(barCss),        '[2e] #map-mode-bar display:flex');
check(/gap:\s*4px/.test(barCss),             '[2f] #map-mode-bar gap:4px');

const btnCssMatch = indexHtml.match(/\.mm-btn\s*\{[^}]+\}/);
check(!!btnCssMatch, '[pre] CSS блок .mm-btn найден');
const btnCss = btnCssMatch ? btnCssMatch[0] : '';
check(/width:\s*32px/.test(btnCss),                          '[3a] .mm-btn width:32px');
check(/height:\s*32px/.test(btnCss),                         '[3b] .mm-btn height:32px');
check(/background:\s*rgba\(13\s*,\s*10\s*,\s*5\s*,\s*0\.85\)/.test(btnCss),
  '[3c] .mm-btn background:rgba(13,10,5,0.85)');
check(/border:\s*1px\s+solid\s+var\(--border-gold\)/.test(btnCss),
  '[3d] .mm-btn border:1px solid var(--border-gold)');
check(/border-radius:\s*3px/.test(btnCss),                   '[3e] .mm-btn border-radius:3px');
check(/cursor:\s*pointer/.test(btnCss),                      '[3f] .mm-btn cursor:pointer');
check(/font-size:\s*15px/.test(btnCss),                      '[3g] .mm-btn font-size:15px');

const activeCssMatch = indexHtml.match(/\.mm-btn\.active\s*\{[^}]+\}/);
check(!!activeCssMatch, '[pre] CSS блок .mm-btn.active найден');
const activeCss = activeCssMatch ? activeCssMatch[0] : '';
check(/background:\s*rgba\(107\s*,\s*79\s*,\s*26\s*,\s*0\.5\)/.test(activeCss),
  '[4a] .mm-btn.active background:rgba(107,79,26,0.5)');
check(/border-color:\s*var\(--accent\)/.test(activeCss),
  '[4b] .mm-btn.active border-color:var(--accent)');

// ───────────────────────────────────────────────────────
section('JS — setMapMode объявлена, MAP_MODES и CURRENT_MAP_MODE экспортированы');
// ───────────────────────────────────────────────────────

check(/function\s+setMapMode\s*\(\s*mode\s*\)/.test(mapSrc),
  '[5a] function setMapMode(mode) объявлена в ui/map.js');
check(/window\.setMapMode\s*=\s*setMapMode/.test(mapSrc),
  '[5b] window.setMapMode = setMapMode');
check(/window\.MAP_MODES\s*=\s*\[[^\]]*['"]political['"][^\]]*['"]economy['"][^\]]*['"]military['"][^\]]*['"]population['"][^\]]*\]/.test(mapSrc),
  '[5c] window.MAP_MODES = ["political","economy","military","population"]');
check(/window\.CURRENT_MAP_MODE\s*=/.test(mapSrc),
  '[5d] window.CURRENT_MAP_MODE инициализирована');

// ───────────────────────────────────────────────────────
section('Хоткеи 1..4 в onHotkey (index.html) вызывают setMapMode');
// ───────────────────────────────────────────────────────

check(/case\s+['"]1['"]:[^}]*setMapMode\(\s*['"]political['"]\s*\)/.test(indexHtml),
  '[6a] хоткей "1" → setMapMode("political")');
check(/case\s+['"]2['"]:[^}]*setMapMode\(\s*['"]economy['"]\s*\)/.test(indexHtml),
  '[6b] хоткей "2" → setMapMode("economy")');
check(/case\s+['"]3['"]:[^}]*setMapMode\(\s*['"]military['"]\s*\)/.test(indexHtml),
  '[6c] хоткей "3" → setMapMode("military")');
check(/case\s+['"]4['"]:[^}]*setMapMode\(\s*['"]population['"]\s*\)/.test(indexHtml),
  '[6d] хоткей "4" → setMapMode("population")');

// ───────────────────────────────────────────────────────
section('Поведение — имитация слоёв Leaflet и вызов setMapMode');
// ───────────────────────────────────────────────────────

// Мини-слой Leaflet — запоминает последний setStyle
function makeLayer(regionId) {
  return {
    _id: regionId,
    _style: null,
    setStyle(s) { this._style = { ...(this._style || {}), ...s }; },
  };
}

// GAME_STATE + MAP_REGIONS + вспомогательные константы
const GAME_STATE = {
  player_nation: 'P',
  nations: {
    P: { color: '#00ff00' },
    Q: { color: '#ff0000' },
  },
  regions: {
    r1: { nation: 'P', population: 1000,  fertility: 0.8, building_slots: [], production: {} },
    r2: { nation: 'Q', population: 5000,  fertility: 0.4, building_slots: [], production: {} },
    r3: { nation: 'Q', population: 10000, fertility: 0.3, building_slots: [], production: {} },
  },
  armies: [
    { id: 'A1', nation: 'P', state: 'idle', position: 'r1' },
    { id: 'A9', nation: 'P', state: 'disbanded', position: 'r3' },
  ],
};

const MAP_REGIONS = {
  r1: { nation: 'P', mapType: 'Land',  coords: [] },
  r2: { nation: 'Q', mapType: 'Land',  coords: [] },
  r3: { nation: 'Q', mapType: 'Land',  coords: [] },
  sea: { nation: null, mapType: 'Ocean', coords: [] },
};

const NON_PLAYABLE_TYPES  = new Set(['Ocean', 'Strait', 'Lake', 'Impassible']);
const NON_PLAYABLE_STYLES = {
  Ocean:      { fillColor: '#2a5a7c' },
  Strait:     { fillColor: '#2a5a8c' },
  Lake:       { fillColor: '#4a8ab8' },
  Impassible: { fillColor: '#5a4e3a' },
};

const regionLayers = {
  r1:  makeLayer('r1'),
  r2:  makeLayer('r2'),
  r3:  makeLayer('r3'),
  sea: makeLayer('sea'),
};
let selectedRegionId = null;

function buildPolygonStyle(color, isPlayerRegion, isSelected) {
  return {
    color: isSelected ? '#FFD700' : 'rgba(70,50,25,0.45)',
    weight: isSelected ? 3.0 : 1.0,
    fillColor: color,
    fillOpacity: 0.70,
    opacity: 1.0,
    dashArray: null,
  };
}
function _regionOccupationColors() { return [null, null]; }
function getProvinceBlendColor() { return null; }

// Извлекаем тело функций setMapMode + helpers из ui/map.js
const reSetMapMode = /function\s+setMapMode\s*\(mode\)\s*\{[\s\S]*?\n\}/;
const reRestore    = /function\s+_restorePoliticalStyle\s*\(regionId\)\s*\{[\s\S]*?\n\}/;
const reComputeW   = /function\s+_computeRegionWealth\s*\(rid\)\s*\{[\s\S]*?\n\}/;
const reLerp       = /function\s+_lerpHex\s*\(fromHex,\s*toHex,\s*t\)\s*\{[\s\S]*?\n\}/;
const reQuantize   = /function\s+_quantize\s*\(t,\s*k\)\s*\{[\s\S]*?\n\}/;

const mSet = mapSrc.match(reSetMapMode);
const mRes = mapSrc.match(reRestore);
const mCw  = mapSrc.match(reComputeW);
const mLp  = mapSrc.match(reLerp);
const mQz  = mapSrc.match(reQuantize);

check(!!mSet && !!mRes && !!mCw && !!mLp && !!mQz,
  '[B0] все вспомогательные функции setMapMode извлечены из ui/map.js');

if (mSet && mRes && mCw && mLp && mQz) {
  // Мок document для обновления кнопок-бейджей
  const btns = [];
  for (const m of modes) {
    btns.push({
      dataset: { mode: m.id },
      classList: {
        _has: m.id === 'political',
        toggle(cls, on) { this._has = on; },
      },
    });
  }
  const fakeDoc = {
    getElementById(id) {
      if (id === 'map-mode-bar') {
        return {
          querySelectorAll(sel) { return btns; },
        };
      }
      return null;
    },
  };
  const fakeWindow = {
    MAP_MODES: ['political', 'economy', 'military', 'population'],
    CURRENT_MAP_MODE: 'political',
  };

  const factory = new Function(
    'GAME_STATE', 'MAP_REGIONS', 'regionLayers', 'selectedRegionId',
    'NON_PLAYABLE_TYPES', 'NON_PLAYABLE_STYLES',
    'buildPolygonStyle', '_regionOccupationColors', 'getProvinceBlendColor',
    'document', 'window',
    `
    ${mLp[0]}
    ${mQz[0]}
    ${mCw[0]}
    ${mRes[0]}
    ${mSet[0]}
    return { setMapMode };
    `
  );

  const api = factory(
    GAME_STATE, MAP_REGIONS, regionLayers, selectedRegionId,
    NON_PLAYABLE_TYPES, NON_PLAYABLE_STYLES,
    buildPolygonStyle, _regionOccupationColors, getProvinceBlendColor,
    fakeDoc, fakeWindow
  );

  // ─── Тест: political → fillColor = цвет нации
  api.setMapMode('political');
  check(regionLayers.r1._style && regionLayers.r1._style.fillColor === '#00ff00',
    '[7a] political: r1 окрашен в цвет своей нации (#00ff00)');
  check(regionLayers.r2._style && regionLayers.r2._style.fillColor === '#ff0000',
    '[7b] political: r2 окрашен в цвет нации Q (#ff0000)');
  check(fakeWindow.CURRENT_MAP_MODE === 'political',
    '[7c] CURRENT_MAP_MODE === "political"');

  // ─── Тест: economy → fillColor отличается от политического (тепловая карта)
  api.setMapMode('economy');
  const r2EcoColor = regionLayers.r2._style.fillColor;
  check(typeof r2EcoColor === 'string' && r2EcoColor !== '#ff0000',
    '[7d] economy: fillColor перекрашен (не цвет нации)');
  check(fakeWindow.CURRENT_MAP_MODE === 'economy',
    '[7e] CURRENT_MAP_MODE === "economy"');

  // ─── Тест: military → регионы без армий получают opacity ≤ 0.4
  api.setMapMode('military');
  check(regionLayers.r2._style.opacity === 0.4,
    '[7f] military: регион без армий имеет opacity 0.4');
  check(regionLayers.r3._style.opacity === 0.4,
    '[7g] military: регион с распущенной (disbanded) армией — тоже затемнён');
  // r1 имеет живую армию P — должен быть восстановлен в политический стиль
  check(regionLayers.r1._style.fillColor === '#00ff00',
    '[7h] military: регион с живой армией — сохраняет политический цвет');
  check(fakeWindow.CURRENT_MAP_MODE === 'military',
    '[7i] CURRENT_MAP_MODE === "military"');

  // ─── Тест: population → перекраска по населению
  api.setMapMode('population');
  const r3PopColor = regionLayers.r3._style.fillColor;
  check(typeof r3PopColor === 'string' && r3PopColor.startsWith('rgb('),
    '[7j] population: fillColor перекрашен (rgb() строка)');
  check(fakeWindow.CURRENT_MAP_MODE === 'population',
    '[7k] CURRENT_MAP_MODE === "population"');

  // ─── Тест: возврат на political восстанавливает оригинальные цвета
  api.setMapMode('political');
  check(regionLayers.r1._style.fillColor === '#00ff00' &&
        regionLayers.r2._style.fillColor === '#ff0000',
    '[7l] возврат на political: цвета наций восстановлены');
  check(regionLayers.r2._style.opacity === 1.0,
    '[7m] возврат на political: opacity восстановлен в 1.0');

  // ─── Тест: неизвестный режим игнорируется
  const before = fakeWindow.CURRENT_MAP_MODE;
  api.setMapMode('nonsense');
  check(fakeWindow.CURRENT_MAP_MODE === before,
    '[7n] неизвестный режим игнорируется, CURRENT_MAP_MODE не меняется');
}

console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
