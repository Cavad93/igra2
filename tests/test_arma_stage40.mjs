// Тесты Шага 40 (arma.md) — Прогресс строительства на карте
// Запуск: node tests/test_arma_stage40.mjs
//
// Чеклист из arma.md Шаг 40:
//   [1] После каждого хода: найти все регионы с активным строительством
//       (region.construction_queue) — renderBuildMarkers() вызывается из
//       renderAll()/renderAllArmies().
//   [2] Для каждого такого региона создаётся L.marker с L.divIcon:
//         <div class="build-progress-marker">
//           🏗
//           <div class="bpm-bar">
//             <div class="bpm-fill" style="width: ${pct}%"></div>
//           </div>
//           <span class="bpm-turns">${turns} хода</span>
//         </div>
//       CSS: маркер 48×32, полоса 44×3 золотого цвета.
//   [3] Маркеры хранятся в словаре buildMarkers = {} (regionId → marker),
//       при обновлении — старый удаляется, новый добавляется.
//   [4] При завершении строительства — маркер удаляется.
//
// Проверки идут статическим анализом исходников + runtime-оценкой
// отдельных функций.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const armiesSrc   = readFileSync(resolve(__dirname, '..', 'ui', 'map_armies.js'), 'utf8');
const htmlSrc     = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const turnSrc     = readFileSync(resolve(__dirname, '..', 'engine', 'turn.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('[1] renderBuildMarkers — функция + обход construction_queue');
// ─────────────────────────────────────────────────────────────
const rbmMatch = armiesSrc.match(
  /function\s+renderBuildMarkers\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!rbmMatch, '[1a] функция renderBuildMarkers определена');
const rbmBody = rbmMatch ? rbmMatch[0] : '';
check(/construction_queue/.test(armiesSrc),
  '[1b] код читает region.construction_queue');
check(/GAME_STATE[\s\S]{0,30}regions/.test(rbmBody),
  '[1c] renderBuildMarkers обходит GAME_STATE.regions');
check(/_regionCenter\s*\(/.test(rbmBody),
  '[1d] renderBuildMarkers использует _regionCenter(rid) для позиции');

// renderBuildMarkers вызывается после хода (в renderAll turn.js)
check(/renderBuildMarkers\s*\(\s*\)/.test(turnSrc),
  '[1e] renderBuildMarkers() вызывается из engine/turn.js (renderAll)');

// ─────────────────────────────────────────────────────────────
section('[2] divIcon: HTML маркера + классы bpm-bar/bpm-fill/bpm-turns');
// ─────────────────────────────────────────────────────────────
const iconMatch = armiesSrc.match(
  /function\s+createBuildProgressIcon\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!iconMatch, '[2a] функция createBuildProgressIcon определена');
const iconBody = iconMatch ? iconMatch[0] : '';
check(/L\.divIcon\s*\(/.test(iconBody),
  '[2b] createBuildProgressIcon возвращает L.divIcon');
check(/class="build-progress-marker"/.test(iconBody),
  '[2c] HTML содержит <div class="build-progress-marker">');
check(/class="bpm-bar"/.test(iconBody),
  '[2d] HTML содержит <div class="bpm-bar">');
check(/class="bpm-fill"/.test(iconBody),
  '[2e] HTML содержит <div class="bpm-fill">');
check(/width:\s*\$\{pct\}%/.test(iconBody),
  '[2f] ширина bpm-fill задаётся как ${pct}%');
check(/class="bpm-turns"/.test(iconBody),
  '[2g] HTML содержит <span class="bpm-turns">');
check(/🏗/.test(iconBody),
  '[2h] HTML содержит иконку 🏗');
check(/iconSize:\s*\[\s*48\s*,\s*32\s*\]/.test(iconBody),
  '[2i] iconSize: [48, 32]');

// Расчёт прогресса: pct = 100 * (1 - turns_left/turns_total)
check(/turns_total/.test(iconBody) && /turns_left/.test(iconBody),
  '[2j] createBuildProgressIcon читает turns_left и turns_total');

// ─────────────────────────────────────────────────────────────
section('[3] CSS .build-progress-marker / .bpm-bar / .bpm-fill / .bpm-turns');
// ─────────────────────────────────────────────────────────────
const bpmMatch = htmlSrc.match(/\.build-progress-marker\s*\{([\s\S]*?)\}/);
const bpmBlock = bpmMatch ? bpmMatch[1] : '';
check(!!bpmMatch, '[3a] CSS блок .build-progress-marker найден');
check(/width:\s*48px/.test(bpmBlock),
  '[3b] .build-progress-marker { width: 48px }');
check(/height:\s*32px/.test(bpmBlock),
  '[3c] .build-progress-marker { height: 32px }');
check(/display:\s*flex/.test(bpmBlock),
  '[3d] .build-progress-marker { display: flex }');
check(/flex-direction:\s*column/.test(bpmBlock),
  '[3e] .build-progress-marker { flex-direction: column }');

const barMatch = htmlSrc.match(/\.bpm-bar\s*\{([\s\S]*?)\}/);
const barBlock = barMatch ? barMatch[1] : '';
check(!!barMatch, '[3f] CSS блок .bpm-bar найден');
check(/width:\s*44px/.test(barBlock),
  '[3g] .bpm-bar { width: 44px }');
check(/height:\s*3px/.test(barBlock),
  '[3h] .bpm-bar { height: 3px }');
check(/overflow:\s*hidden/.test(barBlock),
  '[3i] .bpm-bar { overflow: hidden }');

const fillMatch = htmlSrc.match(/\.bpm-fill\s*\{([\s\S]*?)\}/);
const fillBlock = fillMatch ? fillMatch[1] : '';
check(!!fillMatch, '[3j] CSS блок .bpm-fill найден');
check(/background:\s*#ffd700/i.test(fillBlock),
  '[3k] .bpm-fill { background: #ffd700 } (золотой)');

const turnsCss = htmlSrc.match(/\.bpm-turns\s*\{([\s\S]*?)\}/);
const turnsCssBlock = turnsCss ? turnsCss[1] : '';
check(!!turnsCss, '[3l] CSS блок .bpm-turns найден');
check(/color:\s*#ffd700/i.test(turnsCssBlock),
  '[3m] .bpm-turns { color: #ffd700 }');

// ─────────────────────────────────────────────────────────────
section('[4] buildMarkers словарь: regionId → marker');
// ─────────────────────────────────────────────────────────────
check(/\bbuildMarkers\s*=\s*\{\s*\}/.test(armiesSrc),
  '[4a] const/let buildMarkers = {} существует');
// При обновлении — удалять старый + добавлять новый
check(/buildMarkers\[\s*rid\s*\]/.test(rbmBody),
  '[4b] renderBuildMarkers индексирует buildMarkers по regionId');
check(/removeLayer\s*\(\s*buildMarkers\[/.test(rbmBody),
  '[4c] при обновлении старый маркер удаляется через removeLayer');
check(/delete\s+buildMarkers\[/.test(rbmBody),
  '[4d] при удалении маркера запись удаляется из buildMarkers');
// buildMarkersLayer — L.layerGroup
check(/buildMarkersLayer\s*=\s*L\.layerGroup\s*\(\s*\)\.addTo\s*\(\s*leafletMap\s*\)/.test(armiesSrc),
  '[4e] buildMarkersLayer = L.layerGroup().addTo(leafletMap) инициализирован');

// ─────────────────────────────────────────────────────────────
section('[5] initBuildMarkersLayer + интеграция с initArmyLayers');
// ─────────────────────────────────────────────────────────────
check(/function\s+initBuildMarkersLayer\s*\(/.test(armiesSrc),
  '[5a] функция initBuildMarkersLayer определена');
const initArmyMatch = armiesSrc.match(
  /function\s+initArmyLayers\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const initArmyBody = initArmyMatch ? initArmyMatch[0] : '';
check(/initBuildMarkersLayer\s*\(\s*\)/.test(initArmyBody),
  '[5b] initArmyLayers вызывает initBuildMarkersLayer()');

// renderBuildMarkers вызывается и из renderAllArmies (чтобы показать при первом рендере)
const renderAllArmiesMatch = armiesSrc.match(
  /function\s+renderAllArmies\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const raaBody = renderAllArmiesMatch ? renderAllArmiesMatch[0] : '';
check(/renderBuildMarkers\s*\(\s*\)/.test(raaBody),
  '[5c] renderAllArmies() вызывает renderBuildMarkers()');

// ─────────────────────────────────────────────────────────────
section('[6] Runtime: выбор активной записи и расчёт процента');
// ─────────────────────────────────────────────────────────────
// Извлекаем _pickActiveBuildEntry и запускаем на mock-regions.
const pickMatch = armiesSrc.match(
  /function\s+_pickActiveBuildEntry\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!pickMatch, '[6a] функция _pickActiveBuildEntry определена');
if (pickMatch) {
  const pickFn = new Function(`${pickMatch[0]}; return _pickActiveBuildEntry;`)();
  const r1 = { construction_queue: [
    { slot_id:'a', building_id:'x', turns_left: 3, turns_total: 5 },
    { slot_id:'b', building_id:'y', turns_left: 1, turns_total: 4 },
    { slot_id:'c', building_id:'z', turns_left: 2, turns_total: 8 },
  ]};
  const best = pickFn(r1);
  check(best && best.slot_id === 'b',
    `[6b] _pickActiveBuildEntry выбирает запись с минимальным turns_left (got: ${best?.slot_id})`);
  check(pickFn({}) == null,
    '[6c] _pickActiveBuildEntry({}) → null (пустой регион)');
  check(pickFn({ construction_queue: [] }) == null,
    '[6d] _pickActiveBuildEntry({construction_queue:[]}) → null');
}

// Проверка createBuildProgressIcon: корректно вычисляет pct и подставляет
// его в HTML. Используем песочницу с mock-L.divIcon.
{
  const iMatch = armiesSrc.match(
    /function\s+createBuildProgressIcon\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
  );
  const bwMatch = armiesSrc.match(
    /function\s+_bpmTurnsWord\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
  );
  if (iMatch && bwMatch) {
    const sandbox = `
      const L = { divIcon: (opts) => ({ __mock: true, ...opts }) };
      const BUILDINGS = {};
      ${bwMatch[0]}
      ${iMatch[0]}
      return createBuildProgressIcon;
    `;
    const fn = new Function(sandbox)();
    const ic1 = fn({ building_id:'farm', turns_left: 2, turns_total: 4 });
    check(ic1 && ic1.__mock === true && /iconSize/.test(JSON.stringify(ic1)),
      '[6e] createBuildProgressIcon возвращает L.divIcon (mock)');
    check(/width:\s*50%/.test(ic1.html),
      `[6f] pct 2/4 → width: 50% (got html fragment: ${(ic1.html.match(/width:\s*\d+%/)||[''])[0]})`);
    const ic2 = fn({ building_id:'x', turns_left: 0, turns_total: 4 });
    check(/width:\s*100%/.test(ic2.html),
      '[6g] pct при turns_left=0 → width: 100%');
    const ic3 = fn({ building_id:'x', turns_left: 4, turns_total: 4 });
    check(/width:\s*0%/.test(ic3.html),
      '[6h] pct при turns_left=turns_total → width: 0%');
    // Склонение "ход"
    const iw1 = fn({ turns_left: 1, turns_total: 5 });
    check(/>\s*1\s+ход\s*</.test(iw1.html), '[6i] "1 ход" (ед.ч.)');
    const iw2 = fn({ turns_left: 3, turns_total: 5 });
    check(/>\s*3\s+хода\s*</.test(iw2.html), '[6j] "3 хода"');
    const iw5 = fn({ turns_left: 5, turns_total: 5 });
    check(/>\s*5\s+ходов\s*</.test(iw5.html), '[6k] "5 ходов"');
  } else {
    check(false, '[6e-k] не удалось извлечь createBuildProgressIcon/_bpmTurnsWord');
  }
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
