// Тесты Шага 50 (arma.md) — Лента событий на карте (Event Feed)
// Запуск: node tests/test_arma_stage50.mjs
//
// Чеклист из arma.md Шаг 50:
//   [1] addMapEvent({regionId, icon, text, type}) — добавляет в очередь
//   [2] processEventFeedQueue() — показывает события по очереди (600ms между)
//   [3] L.divIcon маркер содержит иконку + текст в .event-feed-marker
//   [4] CSS @keyframes event-bubble (slideup → idle → fadeout, 2.6s)
//   [5] Максимум 5 одновременных маркеров — остальные в очереди
//   [6] pointer-events: none — бабблы не мешают кликам на регионы
//   [7] index.html подключает ui/map_event_feed.js

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const feedSrc = readFileSync(
  resolve(__dirname, '..', 'ui', 'map_event_feed.js'), 'utf8'
);
const htmlSrc = readFileSync(
  resolve(__dirname, '..', 'index.html'), 'utf8'
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

check(/<script\s+src=["']ui\/map_event_feed\.js["']\s*>/.test(htmlSrc),
  '[1a] index.html подключает ui/map_event_feed.js');

check(/\.event-feed-marker\s*\{/.test(htmlSrc),
  '[1b] CSS .event-feed-marker определён');

check(/@keyframes\s+event-bubble\s*\{/.test(htmlSrc),
  '[1c] @keyframes event-bubble определён');

// Проверяем что keyframes содержит все 4 ключевые точки (0/15/75/100)
const kfMatch = htmlSrc.match(/@keyframes\s+event-bubble\s*\{([\s\S]*?)\n\s*\}/);
const kfBody = kfMatch ? kfMatch[1] : '';
check(/0%\s*\{/.test(kfBody),     '[1d] keyframe 0%');
check(/15%\s*\{/.test(kfBody),    '[1e] keyframe 15% (slideup done)');
check(/75%\s*\{/.test(kfBody),    '[1f] keyframe 75% (fadeout start)');
check(/100%\s*\{/.test(kfBody),   '[1g] keyframe 100%');

check(/animation\s*:\s*event-bubble\s+2\.6s/.test(htmlSrc),
  '[1h] .event-feed-marker animation: event-bubble 2.6s');

check(/\.event-feed-marker[\s\S]*?pointer-events\s*:\s*none/.test(htmlSrc) ||
      /\.event-feed-divicon[\s\S]*?pointer-events\s*:\s*none/.test(htmlSrc),
  '[1i] pointer-events:none — бабблы не ловят клики');

check(/background\s*:\s*rgba\(\s*13\s*,\s*10\s*,\s*5/.test(htmlSrc),
  '[1j] background цвет из arma.md (rgba(13,10,5,...))');

check(/border-radius\s*:\s*12px/.test(htmlSrc),
  '[1k] border-radius: 12px');

// ═══════════════════════════════════════════════════════════════
section('[2] Публичный API в исходнике');
// ═══════════════════════════════════════════════════════════════

check(/function\s+addMapEvent\s*\(/.test(feedSrc),
  '[2a] function addMapEvent определена');
check(/function\s+processEventFeedQueue\s*\(/.test(feedSrc),
  '[2b] function processEventFeedQueue определена');
check(/function\s+clearMapEventFeed\s*\(/.test(feedSrc),
  '[2c] function clearMapEventFeed определена');
check(/window\.addMapEvent\s*=/.test(feedSrc),
  '[2d] window.addMapEvent экспортирован');
check(/window\.processEventFeedQueue\s*=/.test(feedSrc),
  '[2e] window.processEventFeedQueue экспортирован');
check(/window\.clearMapEventFeed\s*=/.test(feedSrc),
  '[2f] window.clearMapEventFeed экспортирован');

// Параметры очереди из arma.md
check(/MAX_ACTIVE_MARKERS\s*=\s*5/.test(feedSrc),
  '[2g] MAX_ACTIVE_MARKERS = 5 (из arma.md)');
check(/QUEUE_DELAY_MS\s*=\s*600/.test(feedSrc),
  '[2h] QUEUE_DELAY_MS = 600 (из arma.md)');
check(/MARKER_LIFETIME_MS\s*=\s*2600/.test(feedSrc),
  '[2i] MARKER_LIFETIME_MS = 2600 (из arma.md: 2.6s)');

// divIcon + marker
check(/L\.divIcon\s*\(/.test(feedSrc),
  '[2j] L.divIcon — для содержимого баббла');
check(/L\.marker\s*\(/.test(feedSrc),
  '[2k] L.marker — добавление в leafletMap');
check(/event-feed-marker/.test(feedSrc),
  '[2l] CSS-класс .event-feed-marker присутствует в HTML маркера');

// ═══════════════════════════════════════════════════════════════
section('[3] Runtime: очередь + ограничение MAX_ACTIVE=5');
// ═══════════════════════════════════════════════════════════════

// Мок браузерного окружения + Leaflet
const mockEnv = `
  // ── DOM-мок (минимальный) ────────────────────────────────
  function makeNode(tag) {
    return {
      tagName: tag, children: [], parentNode: null, style: {},
      appendChild(c){ c.parentNode=this; this.children.push(c); return c; },
      removeChild(c){ const i=this.children.indexOf(c); if(i>=0)this.children.splice(i,1); c.parentNode=null; return c; },
    };
  }
  const _document = {
    createElement(tag) { return makeNode(tag); }
  };
  const window = { addEventListener(){}, removeEventListener(){} };
  const console = { warn(){}, log(){} };

  // ── Leaflet-мок: достаточно L.divIcon, L.marker, latLng ───
  const _active_markers = new Set();

  function FakeDivIcon(opts) { this.opts = opts; this._tag = 'divIcon'; }
  function FakeMarker(latLng, opts) {
    this.latLng = latLng;
    this.opts = opts || {};
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

  // Leaflet map: только то, что нужно модулю
  const leafletMap = {
    removeLayer(layer) { if (layer && layer.remove) layer.remove(); },
  };

  // regionLayers с getCenter для нескольких регионов
  const regionLayers = {
    r1: { getCenter() { return { lat: 10, lng: 20 }; } },
    r2: { getCenter() { return { lat: 15, lng: 25 }; } },
    r3: { getCenter() { return { lat: 20, lng: 30 }; } },
    r4: { getCenter() { return { lat: 25, lng: 35 }; } },
    r5: { getCenter() { return { lat: 30, lng: 40 }; } },
    r6: { getCenter() { return { lat: 35, lng: 45 }; } },
    r7: { getCenter() { return { lat: 40, lng: 50 }; } },
    r8: { getCenter() { return { lat: 45, lng: 55 }; } },
  };

  let document = _document;

  // ── Загружаем модуль map_event_feed.js ───────────────────
  ${feedSrc}

  return { window, _active_markers, L, leafletMap, regionLayers };
`;

let env;
try {
  env = new Function('setTimeout', 'clearTimeout', mockEnv)(setTimeout, clearTimeout);
} catch (e) {
  console.log('  Загрузка модуля: ' + e.message);
}
check(!!env, '[3a] Модуль загружается без ошибок');
check(env && typeof env.window.addMapEvent === 'function',
  '[3b] window.addMapEvent доступен после загрузки');
check(env && typeof env.window.processEventFeedQueue === 'function',
  '[3c] window.processEventFeedQueue доступен после загрузки');
check(env && typeof env.window.clearMapEventFeed === 'function',
  '[3d] window.clearMapEventFeed доступен после загрузки');

// Проверка констант на window
check(env && env.window.EVENT_FEED_MAX_ACTIVE === 5,
  '[3e] window.EVENT_FEED_MAX_ACTIVE === 5');
check(env && env.window.EVENT_FEED_DELAY_MS === 600,
  '[3f] window.EVENT_FEED_DELAY_MS === 600');
check(env && env.window.EVENT_FEED_LIFETIME_MS === 2600,
  '[3g] window.EVENT_FEED_LIFETIME_MS === 2600');

// ═══════════════════════════════════════════════════════════════
section('[4] addMapEvent + обработка одной записи');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.addMapEvent === 'function') {
  const W = env.window;

  // Поначалу пусто
  check(W.getActiveMapEventCount() === 0, '[4a] active=0 на старте');
  check(W.getMapEventQueueLength() === 0, '[4b] queue=0 на старте');

  // Добавим одно событие — попадёт в очередь, потом на следующем тике
  // процессор вытащит его.
  W.addMapEvent({ regionId: 'r1', icon: '🔥', text: 'Восстание!', type: 'revolt' });

  // Ожидаем tick (setTimeout 0)
  await new Promise(r => setTimeout(r, 30));

  check(W.getActiveMapEventCount() === 1,
    '[4c] после tick — один активный маркер');
  check(env._active_markers.size === 1,
    '[4d] в leafletMap есть один marker');

  // Неизвестное событие — без regionId игнорируется
  const before = W.getActiveMapEventCount();
  W.addMapEvent({});
  W.addMapEvent(null);
  W.addMapEvent(undefined);
  await new Promise(r => setTimeout(r, 30));
  check(W.getActiveMapEventCount() === before,
    '[4e] события без regionId игнорируются');

  // clearMapEventFeed — снимает все
  W.clearMapEventFeed();
  check(W.getActiveMapEventCount() === 0, '[4f] после clear: active=0');
  check(env._active_markers.size === 0, '[4g] leafletMap маркеры убраны');
}

// ═══════════════════════════════════════════════════════════════
section('[5] Максимум 5 одновременных маркеров');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.addMapEvent === 'function') {
  const W = env.window;
  W.clearMapEventFeed();

  // Добавим 8 событий сразу.
  for (let i = 1; i <= 8; i++) {
    W.addMapEvent({
      regionId: 'r' + i, icon: '📌', text: 'e' + i, type: 'default'
    });
  }

  // Сначала обработается первое событие.
  await new Promise(r => setTimeout(r, 30));
  check(W.getActiveMapEventCount() === 1,
    '[5a] 8 событий → сразу только 1 активно (остальные ждут 600ms)');
  check(W.getMapEventQueueLength() === 7,
    '[5b] 7 событий в очереди');

  // Ждём 4 * 600 + небольшой запас — ещё 4 события выйдут на сцену.
  await new Promise(r => setTimeout(r, 4 * 600 + 150));
  check(W.getActiveMapEventCount() === 5,
    '[5c] через 4 делэя → активно 5 (лимит MAX_ACTIVE_MARKERS)');
  check(W.getMapEventQueueLength() === 3,
    '[5d] осталось 3 в очереди (8 − 5 активных)');

  // Проверка: шестое событие НЕ появилось, пока не истечёт маркер.
  // Активно всё ещё 5 (не 6), даже если прошло ещё 600ms.
  await new Promise(r => setTimeout(r, 600 + 50));
  check(W.getActiveMapEventCount() <= 5,
    '[5e] лимит 5 не превышается пока слот не освободился');

  // Ждём пока первый маркер истечёт (MARKER_LIFETIME_MS = 2600 от
  // момента его появления). С начала теста прошло ~30 + 2400 + 650 ≈ 3080ms,
  // первый маркер уже должен был истечь.
  await new Promise(r => setTimeout(r, 700));
  // После истечения слот освобождается → процессор берёт следующий.
  // Активно должно стать <= 5 и очередь уменьшиться.
  check(W.getActiveMapEventCount() <= 5,
    '[5f] после истечения старого маркера лимит сохраняется');

  // Финально убираем всё
  W.clearMapEventFeed();
  check(W.getActiveMapEventCount() === 0 && W.getMapEventQueueLength() === 0,
    '[5g] clear после нагрузки: active=0, queue=0');
}

// ═══════════════════════════════════════════════════════════════
section('[6] divIcon HTML содержит иконку и текст');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.addMapEvent === 'function') {
  const W = env.window;
  W.clearMapEventFeed();
  W.addMapEvent({ regionId: 'r1', icon: '💰', text: '+340 доход', type: 'economy' });
  await new Promise(r => setTimeout(r, 30));

  // Достаём один активный маркер и проверяем HTML divIcon
  const markers = Array.from(env._active_markers);
  check(markers.length === 1, '[6a] один маркер создан');
  if (markers.length === 1) {
    const m = markers[0];
    const icon = m.opts && m.opts.icon;
    check(!!icon && icon._tag === 'divIcon', '[6b] marker.icon === divIcon');
    const html = icon && icon.opts && icon.opts.html;
    check(typeof html === 'string' && html.indexOf('💰') >= 0,
      '[6c] divIcon html содержит эмодзи 💰');
    check(typeof html === 'string' && html.indexOf('+340 доход') >= 0,
      '[6d] divIcon html содержит текст описания');
    check(typeof html === 'string' && /class="event-feed-marker/.test(html),
      '[6e] divIcon html содержит класс .event-feed-marker');
    check(typeof html === 'string' && /event-feed-economy/.test(html),
      '[6f] divIcon html содержит type-класс .event-feed-economy');

    // Leaflet options: неинтерактивный маркер (не ловит клики)
    check(m.opts.interactive === false,
      '[6g] marker interactive:false (не перехватывает клики)');
    check(m.opts.keyboard === false,
      '[6h] marker keyboard:false');
  }

  // HTML-escape: опасный ввод не должен ломать разметку
  W.clearMapEventFeed();
  W.addMapEvent({ regionId: 'r2', icon: '<img src=x>', text: '"><b>x</b>', type: 'xss' });
  await new Promise(r => setTimeout(r, 30));
  const markers2 = Array.from(env._active_markers);
  if (markers2.length === 1) {
    const html = markers2[0].opts.icon.opts.html;
    check(!/\<img src=x\>/.test(html),
      '[6i] HTML-escape: опасный icon не прошёл в разметку');
    check(/&lt;img src=x&gt;/.test(html),
      '[6j] опасный icon заэскейплен в &lt;img&gt;');
    check(!/<b>x<\/b>/.test(html),
      '[6k] HTML-escape: опасный text не прошёл в разметку');
  }
  W.clearMapEventFeed();
}

// ═══════════════════════════════════════════════════════════════
section('[7] Пример использования из arma.md');
// ═══════════════════════════════════════════════════════════════

if (env && typeof env.window.addMapEvent === 'function') {
  const W = env.window;
  W.clearMapEventFeed();

  // Точные вызовы из примера arma.md
  W.addMapEvent({ regionId: 'sicily_1',   icon: '🔥', text: 'Восстание!', type: 'revolt' });
  W.addMapEvent({ regionId: 'carthage_1', icon: '💰', text: '+340 доход', type: 'economy' });

  // sicily_1 / carthage_1 не в regionLayers — маркеры не создадутся.
  // Это нормальное поведение (нет координат — нет маркера).
  // Но сама функция должна принять вызов без ошибок.
  await new Promise(r => setTimeout(r, 30));
  check(true, '[7a] addMapEvent с примерными параметрами не бросает');

  // Теперь с реальными регионами — должно работать.
  W.clearMapEventFeed();
  W.addMapEvent({ regionId: 'r3', icon: '🔥', text: 'Восстание!', type: 'revolt' });
  W.addMapEvent({ regionId: 'r4', icon: '💰', text: '+340 доход', type: 'economy' });
  await new Promise(r => setTimeout(r, 30 + 600 + 30));
  check(W.getActiveMapEventCount() === 2,
    '[7b] два события с реальными регионами → 2 активных маркера');

  W.clearMapEventFeed();
}

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log('Итого: ' + pass + ' passed / ' + fail + ' failed');
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
