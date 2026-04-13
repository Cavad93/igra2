// Тесты Шага 41 (arma.md) — Пульсирующие иконки событий на карте
// Запуск: node tests/test_arma_stage41.mjs
//
// Чеклист из arma.md Шаг 41:
//   [1] SVG-overlay поверх карты (создаётся в map container или overlayPane).
//   [2] showMapEvent(regionId, type, duration) — публичный API:
//       - получает центр региона (regionLayers[id].getCenter())
//       - конвертирует в пиксели через latLngToContainerPoint/LayerPoint
//       - добавляет в SVG <g> с <circle> (animate r 8→24, opacity 0.8→0)
//         и <text> с эмодзи
//       - через duration мс — удаляет группу из SVG.
//   [3] Таблица иконок: revolt 🔥 #f44336, plague 💀 #9c27b0,
//       harvest 🌾 #4caf50, victory ⭐ #ffd700, death 💔 #607d8b,
//       construction 🏛 #2196f3.
//   [4] Обновление позиций при zoom/move:
//       leafletMap.on('zoom move', repositionEventSvg).
//   [5] Несколько событий одновременно — каждое в своей <g>, без затирания.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evSrc   = readFileSync(resolve(__dirname, '..', 'ui', 'map_events.js'), 'utf8');
const htmlSrc = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('[1] Регистрация модуля и SVG-overlay');
// ─────────────────────────────────────────────────────────────
check(/<script\s+src="ui\/map_events\.js"><\/script>/.test(htmlSrc),
  '[1a] index.html подключает ui/map_events.js');

check(/createElementNS\([^)]*['"]svg['"]\s*\)/.test(evSrc),
  '[1b] создаётся SVG через createElementNS');

check(/leafletMap\.getContainer\s*\(\s*\)/.test(evSrc) ||
      /getPanes\(\s*\)\.overlayPane/.test(evSrc),
  '[1c] SVG прикрепляется к контейнеру карты или overlayPane');

check(/pointer-events\s*:\s*none/.test(evSrc),
  '[1d] SVG не блокирует клики (pointer-events:none)');

check(/position\s*:\s*absolute/.test(evSrc),
  '[1e] SVG позиционируется absolute');

// ─────────────────────────────────────────────────────────────
section('[2] showMapEvent — публичный API');
// ─────────────────────────────────────────────────────────────
check(/function\s+showMapEvent\s*\(/.test(evSrc),
  '[2a] функция showMapEvent определена');
check(/window\.showMapEvent\s*=\s*showMapEvent/.test(evSrc),
  '[2b] showMapEvent экспортирован на window');

const fnMatch = evSrc.match(
  /function\s+showMapEvent\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}\s*\n/
);
check(!!fnMatch, '[2c] тело showMapEvent извлекается');
const fnBody = fnMatch ? fnMatch[0] : '';

check(/regionLayers\[/.test(evSrc) && /getCenter\s*\(/.test(evSrc),
  '[2d] используется regionLayers[id].getCenter() для центра региона');

check(/latLngToContainerPoint|latLngToLayerPoint/.test(evSrc),
  '[2e] координаты конвертируются в пиксели');

check(/setTimeout\s*\(/.test(evSrc),
  '[2f] setTimeout — для удаления иконки через duration мс');

check(/duration/.test(fnBody),
  '[2g] showMapEvent принимает параметр duration');

// ─────────────────────────────────────────────────────────────
section('[3] SVG-структура: <circle> с двумя <animate> и <text>');
// ─────────────────────────────────────────────────────────────
check(/createElementNS\(\s*[^,]+,\s*['"]circle['"]\s*\)/.test(evSrc),
  '[3a] создаётся <circle>');
check(/createElementNS\(\s*[^,]+,\s*['"]text['"]\s*\)/.test(evSrc),
  '[3b] создаётся <text>');
check((evSrc.match(/createElementNS\(\s*[^,]+,\s*['"]animate['"]\s*\)/g) || []).length >= 2,
  '[3c] создаются как минимум два <animate> (radius + opacity)');
check(/['"]attributeName['"]\s*,\s*['"]r['"]/.test(evSrc),
  '[3d] animate attributeName="r"');
check(/['"]attributeName['"]\s*,\s*['"]opacity['"]/.test(evSrc),
  '[3e] animate attributeName="opacity"');
check(/['"]from['"]\s*,\s*['"]8['"]/.test(evSrc),
  '[3f] radius animate from="8"');
check(/['"]to['"]\s*,\s*['"]24['"]/.test(evSrc),
  '[3g] radius animate to="24"');
check(/['"]repeatCount['"]\s*,\s*['"]2['"]/.test(evSrc),
  '[3h] repeatCount="2"');
check(/text-anchor['"]\s*,\s*['"]middle['"]/.test(evSrc),
  '[3i] text-anchor="middle"');
check(/dominant-baseline['"]\s*,\s*['"]middle['"]/.test(evSrc),
  '[3j] dominant-baseline="middle"');

// ─────────────────────────────────────────────────────────────
section('[4] Таблица типов событий: иконка + цвет');
// ─────────────────────────────────────────────────────────────
const expectTypes = {
  revolt:       { icon: '🔥', color: '#f44336' },
  plague:       { icon: '💀', color: '#9c27b0' },
  harvest:      { icon: '🌾', color: '#4caf50' },
  victory:      { icon: '⭐', color: '#ffd700' },
  death:        { icon: '💔', color: '#607d8b' },
  construction: { icon: '🏛', color: '#2196f3' },
};
for (const [key, def] of Object.entries(expectTypes)) {
  const re = new RegExp(`${key}\\s*:\\s*\\{[^}]*icon\\s*:\\s*['"]${def.icon}['"][^}]*color\\s*:\\s*['"]${def.color}['"]`, 'i');
  // Try both orderings
  const re2 = new RegExp(`${key}\\s*:\\s*\\{[^}]*color\\s*:\\s*['"]${def.color}['"][^}]*icon\\s*:\\s*['"]${def.icon}['"]`, 'i');
  check(re.test(evSrc) || re2.test(evSrc),
    `[4] EVENT_TYPES.${key} = { icon:'${def.icon}', color:'${def.color}' }`);
}

// ─────────────────────────────────────────────────────────────
section('[5] Обработка zoom/move — repositioning');
// ─────────────────────────────────────────────────────────────
check(/leafletMap\.on\(\s*['"]zoom move['"]/.test(evSrc) ||
      /leafletMap\.on\(\s*['"]zoomend['"]/.test(evSrc) ||
      (/leafletMap\.on\(\s*['"]zoom['"]/.test(evSrc) && /leafletMap\.on\(\s*['"]move['"]/.test(evSrc)),
  '[5a] подписка на события zoom/move');
check(/function\s+_repositionEventSvg|repositionEventSvg/.test(evSrc),
  '[5b] функция repositionEventSvg определена');

// ─────────────────────────────────────────────────────────────
section('[6] CSS-классы и отсутствие блокирования кликов');
// ─────────────────────────────────────────────────────────────
check(/\.map-event-svg\s*\{[^}]*pointer-events\s*:\s*none/.test(htmlSrc),
  '[6a] CSS .map-event-svg { pointer-events: none }');
check(/\.map-event-icon\s*\{/.test(htmlSrc),
  '[6b] CSS .map-event-icon определён');

// ─────────────────────────────────────────────────────────────
section('[7] Runtime: showMapEvent с моками leaflet/document');
// ─────────────────────────────────────────────────────────────

// Подготовим минимальные моки: document, window, leafletMap, regionLayers.
// Нам нужно загрузить ui/map_events.js в новой "vm-like" среде.
const mockEnv = `
  // ── Моки браузерного окружения ────────────────────────────────
  function makeNode(tag, ns) {
    return {
      tagName: tag, namespaceURI: ns, _ns: ns,
      attrs: {}, children: [], parentNode: null, style: {},
      classList: { _set: new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, contains(c){return this._set.has(c);} },
      setAttribute(k,v){ this.attrs[k]=String(v); },
      setAttributeNS(ns,k,v){ this.attrs[k]=String(v); },
      getAttribute(k){ return this.attrs[k]; },
      appendChild(c){ c.parentNode=this; this.children.push(c); return c; },
      removeChild(c){ const i=this.children.indexOf(c); if(i>=0)this.children.splice(i,1); c.parentNode=null; return c; },
      remove(){ if(this.parentNode) this.parentNode.removeChild(this); },
      contains(other){
        if (other === this) return true;
        for (const c of this.children) {
          if (c === other) return true;
          if (typeof c.contains === 'function' && c.contains(other)) return true;
        }
        return false;
      },
      get textContent() { return this._tc || ''; },
      set textContent(v) { this._tc = v; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }
  const _document = {
    createElementNS(ns, tag) { return makeNode(tag, ns); },
    createElement(tag) { return makeNode(tag, null); },
  };
  const window = { addEventListener: function(){}, removeEventListener: function(){} };
  const console = { warn: function(){}, log: function(){} };

  // Mock Leaflet: latLng() и контейнер
  const _container = makeNode('div');
  let _onHandlers = {};
  const L = {
    latLng(a, b) { return { lat: a, lng: b }; },
  };
  const leafletMap = {
    getContainer() { return _container; },
    latLngToContainerPoint(ll) { return { x: ll.lat * 10, y: ll.lng * 10 }; },
    on(ev, fn) {
      const evs = String(ev).split(/\\s+/);
      for (const e of evs) (_onHandlers[e] = _onHandlers[e] || []).push(fn);
    },
  };
  const regionLayers = {
    sicily_1: { getCenter() { return { lat: 38.0, lng: 14.0 }; } },
    egypt_2:  { getCenter() { return { lat: 30.0, lng: 31.0 }; } },
  };

  // Полифилы requestAnimationFrame, cancelAnimationFrame
  function requestAnimationFrame(cb){ return setTimeout(cb, 0); }
  function cancelAnimationFrame(id){ clearTimeout(id); }

  let document = _document;

  // ── Загружаем модуль ──────────────────────────────────────────
  ${evSrc}

  return { window, _container, regionLayers, leafletMap, _onHandlers, _document };
`;

let env;
try {
  env = new Function('setTimeout','clearTimeout', mockEnv)(setTimeout, clearTimeout);
} catch (e) {
  console.log('  Загрузка модуля: ' + e.message);
}
check(!!env, '[7a] Модуль загружается без ошибок');
check(env && typeof env.window.showMapEvent === 'function',
  '[7b] window.showMapEvent доступен после загрузки');

if (env && typeof env.window.showMapEvent === 'function') {
  // Один вызов — должен создать SVG-overlay и одну группу события
  env.window.showMapEvent('sicily_1', 'revolt', 100);
  // SVG ожидаем как первый child контейнера
  const svg = env._container.children[0];
  check(svg && svg.tagName === 'svg' && svg.namespaceURI === 'http://www.w3.org/2000/svg',
    '[7c] SVG-overlay добавлен в контейнер карты');
  check(svg && /pointer-events\s*:\s*none/.test(svg.style.cssText || ''),
    '[7d] SVG имеет pointer-events:none');
  // <g class="map-event-g"> — внутри SVG
  const root = svg && svg.children.find(c => c.tagName === 'g');
  check(!!root, '[7e] Корневая <g> для иконок присутствует');
  // Внутри корневой g — одна <g class="map-event-item">
  check(root && root.children.length === 1, '[7f] Один вызов → одна группа события');
  const item = root && root.children[0];
  // Внутри item — circle и text
  const circle = item && item.children.find(c => c.tagName === 'circle');
  const text   = item && item.children.find(c => c.tagName === 'text');
  check(!!circle, '[7g] <circle> создан');
  check(!!text && text.textContent === '🔥', '[7h] <text> = 🔥 для type=revolt');
  // Внутри circle — два <animate>
  const animates = (circle && circle.children.filter(c => c.tagName === 'animate')) || [];
  check(animates.length === 2, '[7i] два <animate> внутри <circle>');
  check(circle && circle.attrs.fill === '#f44336', '[7j] цвет круга #f44336 для revolt');

  // Несколько событий одновременно — без перетирания
  env.window.showMapEvent('egypt_2', 'plague', 100);
  env.window.showMapEvent('sicily_1', 'victory', 100);
  check(root.children.length === 3,
    '[7k] три события одновременно → три отдельные группы (без затирания)');

  // Неизвестный тип события — игнорируется (warn)
  const before = root.children.length;
  env.window.showMapEvent('sicily_1', 'unknown_type', 100);
  check(root.children.length === before,
    '[7l] неизвестный тип события игнорируется');

  // Ожидаем удаления через duration мс
  await new Promise((r) => setTimeout(r, 250));
  check(root.children.length === 0,
    '[7m] после истечения duration все группы удалены');

  // Проверка: zoom/move обработчики зарегистрированы
  check(Array.isArray(env._onHandlers.zoom) && env._onHandlers.zoom.length >= 1,
    '[7n] обработчик zoom зарегистрирован');
  check(Array.isArray(env._onHandlers.move) && env._onHandlers.move.length >= 1,
    '[7o] обработчик move зарегистрирован');
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
