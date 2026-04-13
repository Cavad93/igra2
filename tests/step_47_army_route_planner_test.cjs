'use strict';
// ════════════════════════════════════════════════════
// ШАГ 47 — Планировщик маршрутов армии (unit test)
// Проверяет:
//   - CSS стиля пунктир-preview и тултипа у курсора
//   - handleRegionHoverForArmy и _clearRoutePreview есть в ui/map_armies.js
//   - findArmyPath существует и возвращает путь по BFS (engine/armies.js)
//   - orderArmyMove сохраняет army.planned_route
//   - onRegionHover в ui/map.js делегирует в handleRegionHoverForArmy
//   - processArmyMovement очищает planned_route по прибытии
// ════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

let passed = 0, failed = 0;
const fail = (name, detail) => { console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); failed++; };
const ok   = (name)         => { console.log (`  ✓ ${name}`); passed++; };
const assert = (cond, name, detail) => cond ? ok(name) : fail(name, detail);

// ─── 1. index.html: CSS Шага 47 ────────────
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
assert(/path\.army-route-preview\s*\{/.test(html), 'CSS path.army-route-preview объявлен');
assert(/@keyframes\s+army-route-march/.test(html),  'CSS @keyframes army-route-march объявлен');
assert(/#army-route-preview-tooltip\s*\{/.test(html), 'CSS #army-route-preview-tooltip объявлен');
assert(/stroke-dashoffset:\s*-?\d+/.test(html),      'Анимация смещения stroke-dashoffset задана');

// ─── 2. ui/map_armies.js: функции hover preview ────
const maSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'map_armies.js'), 'utf8');
assert(/function\s+handleRegionHoverForArmy\s*\(/.test(maSrc),
  'handleRegionHoverForArmy объявлена');
assert(/function\s+_clearRoutePreview\s*\(/.test(maSrc),
  '_clearRoutePreview объявлена');
assert(/_routePreviewLine/.test(maSrc),
  'state _routePreviewLine присутствует');
assert(/army-route-preview/.test(maSrc),
  'className "army-route-preview" используется');
assert(/dashArray:\s*'8 6'/.test(maSrc),
  'Пунктир dashArray = "8 6" используется для preview');
assert(/army\.planned_route\s*=\s*\[\.\.\.path\]/.test(maSrc),
  'army.planned_route сохраняется после подтверждения маршрута');
assert(/cancelMoveMode[^]*_clearRoutePreview/.test(maSrc),
  'cancelMoveMode очищает preview');
assert(/closeArmyPanel[^]*_clearRoutePreview/.test(maSrc),
  'closeArmyPanel очищает preview');
assert(/handleRegionClickForArmy[^]*_clearRoutePreview/.test(maSrc),
  'handleRegionClickForArmy очищает preview перед подтверждением');

// ─── 3. ui/map.js: onRegionHover делегирует в армию ───
const mapSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'map.js'), 'utf8');
assert(/handleRegionHoverForArmy\s*\(\s*regionId\s*,\s*entering\s*,\s*e\s*\)/.test(mapSrc),
  'onRegionHover вызывает handleRegionHoverForArmy(regionId, entering, e)');

// ─── 4. engine/armies.js: findArmyPath + очистка planned_route ───
const armSrc = fs.readFileSync(path.join(__dirname, '..', 'engine', 'armies.js'), 'utf8');
assert(/function\s+findArmyPath\s*\(/.test(armSrc),
  'engine/armies.js содержит функцию findArmyPath');
assert(/delete\s+army\.planned_route/.test(armSrc),
  'planned_route удаляется по прибытии (processArmyMovement)');

// ─── 5. Сандбокс-тест findArmyPath: BFS на игрушечном графе ─
// Извлекаем функцию findArmyPath полностью (вместе с helper _getRegionData)
const extract = (name) => {
  const re = new RegExp(`function ${name}\\s*\\([^]*?\\n\\}`, 'm');
  const m = armSrc.match(re);
  return m ? m[0] : null;
};
const findSrc = extract('findArmyPath');
assert(!!findSrc, 'findArmyPath извлекается из исходника');

// Мини-граф регионов с мостом: A — B — C — D
const MAP_REGIONS = {
  A: { connections: ['B'], mapType: 'Land' },
  B: { connections: ['A', 'C'], mapType: 'Land' },
  C: { connections: ['B', 'D'], mapType: 'Land' },
  D: { connections: ['C'], mapType: 'Land' },
};
const sandbox = {
  MAP_REGIONS,
  GAME_STATE: { regions: {}, nations: {} },
  _getRegionData: (id) => MAP_REGIONS[id] || null,
  _isFortressLineBlocked: () => false,
  _getRegionSupplyCapacity: () => 9999,
  Infinity,
  Map,
  Number,
  console,
};
vm.createContext(sandbox);
vm.runInContext(findSrc, sandbox);

const p1 = sandbox.findArmyPath('A', 'D', 'land');
assert(Array.isArray(p1) && p1.length === 4 && p1[0] === 'A' && p1[3] === 'D',
  'findArmyPath(A→D) = [A,B,C,D]', JSON.stringify(p1));

const p2 = sandbox.findArmyPath('A', 'A', 'land');
assert(Array.isArray(p2) && p2.length === 1 && p2[0] === 'A',
  'findArmyPath(A→A) = [A]', JSON.stringify(p2));

const p3 = sandbox.findArmyPath('A', 'X', 'land');
assert(p3 === null, 'findArmyPath(A→X) = null (нет пути)', JSON.stringify(p3));

// ─── 6. Резюме ───
console.log(`\nШаг 47 — тесты:  ${passed} ✓  ${failed} ✗\n`);
process.exit(failed > 0 ? 1 : 0);
