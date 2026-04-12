// Тесты Шага 24 (arma.md) — Лог событий как drawer (выдвижная панель)
// Запуск: node tests/test_arma_stage24.mjs
//
// Чеклист из arma.md Шаг 24:
//   [1] #event-log имеет класс `collapsed` по умолчанию (свёрнут).
//   [2] Внутри #event-log присутствует блок <div id="log-collapsed">.
//   [3] В #log-collapsed есть <span id="log-last-entry">—</span>.
//   [4] В #log-collapsed есть <div id="log-counters"> с тремя .log-cnt
//       (data-filter="danger" / "economy" / "character"), и в каждом — <b>0</b>.
//   [5] В #log-collapsed есть <button id="log-expand-btn" onclick="toggleLog()">
//       с иконкой ▲ в свёрнутом состоянии.
//   [6] CSS: #event-log.collapsed  { height:32px; overflow:hidden; }
//   [7] CSS: #event-log.expanded   { height:180px; transition:height 0.2s ease }
//   [8] CSS: #log-collapsed { display:flex; align-items:center; gap:8px;
//                             padding:0 10px; height:32px }
//   [9] CSS: #log-expand-btn.open  { … } (стиль для развёрнутого состояния).
//   [10] В ui/log.js объявлена функция toggleLog() и экспортирована в window.
//   [11] В ui/log.js объявлена функция updateLogCollapsed() (обновление счётчиков
//        и #log-last-entry) и экспортирована в window.
//   [12] addEventLog('…', 'danger') инкрементит счётчик danger в UI.
//   [13] addEventLog('…', 'economy') / 'character' — аналогично.
//   [14] toggleLog() переключает классы collapsed↔expanded у #event-log
//        и класс .open у #log-expand-btn.
//   [15] При добавлении danger-события на .log-cnt[data-filter="danger"]
//        добавляется класс .pulse.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const logSrc    = readFileSync(resolve(__dirname, '..', 'ui', 'log.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ═══════════════════════════════════════════════════════════════
section('HTML — структура #event-log / #log-collapsed');
// ═══════════════════════════════════════════════════════════════

// [1]
check(
  /<div\s+id="event-log"\s+class="collapsed"/.test(indexHtml),
  '[1] #event-log имеет class="collapsed" по умолчанию'
);

// Вырежем блок event-log для дальнейших проверок
const evLogMatch = indexHtml.match(/<div\s+id="event-log"[\s\S]*?<!-- Приказы/);
const evLogHtml  = evLogMatch ? evLogMatch[0] : '';
check(!!evLogHtml, '[pre] Найден блок <div id="event-log"> ...');

// [2]
check(
  /<div\s+id="log-collapsed">/.test(evLogHtml),
  '[2] Внутри #event-log есть <div id="log-collapsed">'
);

// [3]
check(
  /<span\s+id="log-last-entry">\s*—\s*<\/span>/.test(evLogHtml),
  '[3] В #log-collapsed есть <span id="log-last-entry">—</span>'
);

// [4]
check(
  /<div\s+id="log-counters">/.test(evLogHtml),
  '[4a] В #log-collapsed есть <div id="log-counters">'
);
for (const f of ['danger', 'economy', 'character']) {
  const re = new RegExp(`<span\\s+class="log-cnt"\\s+data-filter="${f}">[^<]*<b>0<\\/b>`);
  check(re.test(evLogHtml), `[4-${f}] .log-cnt data-filter="${f}" с <b>0</b>`);
}

// [5]
check(
  /<button\s+id="log-expand-btn"\s+onclick="toggleLog\(\)"[^>]*>[\s\S]*?▲[\s\S]*?Хроники[\s\S]*?<\/button>/.test(evLogHtml),
  '[5] <button id="log-expand-btn" onclick="toggleLog()"> с иконкой ▲ Хроники'
);

// ═══════════════════════════════════════════════════════════════
section('CSS — #event-log.collapsed / .expanded / #log-collapsed / #log-expand-btn');
// ═══════════════════════════════════════════════════════════════

// [6]
check(
  /#event-log\.collapsed\s*{[^}]*height:\s*32px[^}]*overflow:\s*hidden/s.test(indexHtml),
  '[6] CSS #event-log.collapsed { height:32px; overflow:hidden }'
);

// [7]
check(
  /#event-log\.expanded\s*{[^}]*height:\s*180px[^}]*transition:\s*height\s+0\.2s\s+ease/s.test(indexHtml),
  '[7] CSS #event-log.expanded { height:180px; transition:height 0.2s ease }'
);

// [8]
check(
  /#log-collapsed\s*{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*8px[^}]*padding:\s*0\s+10px[^}]*height:\s*32px/s.test(indexHtml),
  '[8] CSS #log-collapsed: display:flex; align-items:center; gap:8px; padding:0 10px; height:32px'
);

// [9]
check(
  /#log-expand-btn\.open\s*{/.test(indexHtml),
  '[9] CSS #log-expand-btn.open { ... }'
);

// ═══════════════════════════════════════════════════════════════
section('JS — toggleLog / updateLogCollapsed объявлены и экспортированы');
// ═══════════════════════════════════════════════════════════════

// [10]
check(
  /function\s+toggleLog\s*\(\s*\)/.test(logSrc),
  '[10a] function toggleLog() объявлена в ui/log.js'
);
check(
  /window\.toggleLog\s*=\s*toggleLog/.test(logSrc),
  '[10b] window.toggleLog = toggleLog'
);

// [11]
check(
  /function\s+updateLogCollapsed\s*\(/.test(logSrc),
  '[11a] function updateLogCollapsed() объявлена в ui/log.js'
);
check(
  /window\.updateLogCollapsed\s*=\s*updateLogCollapsed/.test(logSrc),
  '[11b] window.updateLogCollapsed экспортирована'
);

// ═══════════════════════════════════════════════════════════════
section('Поведение — addEventLog / toggleLog в песочнице');
// ═══════════════════════════════════════════════════════════════

// Сымитируем минимальный DOM: #event-log.collapsed, #log-collapsed, #log-last-entry,
// #log-counters с тремя .log-cnt, #log-expand-btn, #log-entries.
function makeClassList() {
  const s = new Set();
  return {
    _set: s,
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, on) => { if (on) s.add(c); else s.delete(c); },
  };
}

function makeEl(tag) {
  const el = {
    tag,
    _attrs: {},
    classList: makeClassList(),
    children: [],
    innerHTML: '',
    textContent: '',
    offsetWidth: 10,
    style: {},
    getAttribute(k) { return this._attrs[k] ?? null; },
    setAttribute(k, v) { this._attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector(sel) {
      // Примитивный селектор: .foo, .foo[data-filter="x"], b
      if (sel === 'b') {
        const find = (n) => {
          for (const c of (n.children || [])) {
            if (c.tag === 'b') return c;
            const r = find(c);
            if (r) return r;
          }
          return null;
        };
        return find(this);
      }
      const m = sel.match(/^\.([\w-]+)(?:\[data-filter="([^"]+)"\])?$/);
      if (m) {
        const [, cls, df] = m;
        const find = (n) => {
          for (const c of (n.children || [])) {
            if (c.classList && c.classList._set.has(cls)
               && (!df || c._attrs['data-filter'] === df)) return c;
            const r = find(c);
            if (r) return r;
          }
          return null;
        };
        return find(this);
      }
      return null;
    },
    querySelectorAll(sel) {
      const m = sel.match(/^\.([\w-]+)(?:\[data-filter="([^"]+)"\])?$/);
      if (!m) return [];
      const [, cls, df] = m;
      const out = [];
      const walk = (n) => {
        for (const c of (n.children || [])) {
          if (c.classList && c.classList._set.has(cls)
             && (!df || c._attrs['data-filter'] === df)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
  };
  return el;
}

// Строим DOM
const eventLog = makeEl('div');
eventLog._attrs.id = 'event-log';
eventLog.classList.add('collapsed');

const logCollapsed = makeEl('div');
logCollapsed._attrs.id = 'log-collapsed';

const lastEntry = makeEl('span');
lastEntry._attrs.id = 'log-last-entry';
lastEntry.textContent = '—';

const counters = makeEl('div');
counters._attrs.id = 'log-counters';

for (const f of ['danger', 'economy', 'character']) {
  const cnt = makeEl('span');
  cnt.classList.add('log-cnt');
  cnt._attrs['data-filter'] = f;
  const b = makeEl('b');
  b.textContent = '0';
  cnt.children.push(b);
  counters.children.push(cnt);
}

const expandBtn = makeEl('button');
expandBtn._attrs.id = 'log-expand-btn';
expandBtn.textContent = '▲ Хроники';

logCollapsed.children.push(lastEntry, counters, expandBtn);

const logEntries = makeEl('div');
logEntries._attrs.id = 'log-entries';

eventLog.children.push(logCollapsed, logEntries);

const byId = {
  'event-log':       eventLog,
  'log-collapsed':   logCollapsed,
  'log-last-entry':  lastEntry,
  'log-counters':    counters,
  'log-expand-btn':  expandBtn,
  'log-entries':     logEntries,
};

const fakeDoc = {
  getElementById(id) { return byId[id] ?? null; },
};

const fakeGameState = { turn: 5, events_log: [], date: { year: -200, month: 1, day: 1 } };
const fakeWindow = {};

const sandbox = {
  document: fakeDoc,
  window: fakeWindow,
  GAME_STATE: fakeGameState,
  console,
  setTimeout: (fn, t) => setTimeout(fn, t),
  formatDate: () => '—',
};

const factoryKeys = Object.keys(sandbox);
const factory = new Function(...factoryKeys, `
  ${logSrc}
  return {
    addEventLog: typeof addEventLog === 'function' ? addEventLog : null,
    toggleLog:   typeof toggleLog   === 'function' ? toggleLog   : null,
    updateLogCollapsed: typeof updateLogCollapsed === 'function' ? updateLogCollapsed : null,
  };
`);

let api, runError = null;
try {
  api = factory(...factoryKeys.map(k => sandbox[k]));
} catch (e) {
  runError = e;
}
check(!runError, '[B0] ui/log.js исполняется без ошибок' +
  (runError ? ' (' + runError.message + ')' : ''));

if (api && api.addEventLog && api.toggleLog) {
  // [12] danger counter
  api.addEventLog('Восстание в провинции!', 'danger');
  const dangerB = counters.children.find(c => c._attrs['data-filter'] === 'danger')
                                   .children.find(c => c.tag === 'b');
  check(dangerB.textContent === '1',
    '[12] После addEventLog(danger) счётчик danger = 1');

  // [13a] economy counter
  api.addEventLog('Казна пополнена', 'economy');
  const econB = counters.children.find(c => c._attrs['data-filter'] === 'economy')
                                 .children.find(c => c.tag === 'b');
  check(econB.textContent === '1',
    '[13-economy] После addEventLog(economy) счётчик economy = 1');

  // [13b] character counter
  api.addEventLog('Родился наследник', 'character');
  const charB = counters.children.find(c => c._attrs['data-filter'] === 'character')
                                 .children.find(c => c.tag === 'b');
  check(charB.textContent === '1',
    '[13-character] После addEventLog(character) счётчик character = 1');

  // Последняя строка обновилась
  check(/Родился наследник/.test(lastEntry.textContent),
    '[B1] #log-last-entry показывает последнее событие');

  // [15] pulse-класс на danger
  api.addEventLog('Ещё одно восстание', 'danger');
  const dangerCnt = counters.children.find(c => c._attrs['data-filter'] === 'danger');
  check(dangerCnt.classList.contains('pulse'),
    '[15] После danger-события на .log-cnt[data-filter="danger"] добавлен .pulse');

  // Счётчик стал 2
  check(dangerB.textContent === '2',
    '[B2] danger-счётчик = 2 после двух danger-событий');

  // [14] toggleLog: collapsed → expanded
  check(eventLog.classList.contains('collapsed') && !eventLog.classList.contains('expanded'),
    '[B3] По умолчанию #event-log.collapsed (без .expanded)');

  api.toggleLog();
  check(eventLog.classList.contains('expanded') && !eventLog.classList.contains('collapsed'),
    '[14a] toggleLog(): переход в .expanded');
  check(expandBtn.classList.contains('open'),
    '[14b] toggleLog(): #log-expand-btn получил класс .open');

  api.toggleLog();
  check(eventLog.classList.contains('collapsed') && !eventLog.classList.contains('expanded'),
    '[14c] toggleLog() дважды: возврат в .collapsed');
  check(!expandBtn.classList.contains('open'),
    '[14d] toggleLog() дважды: класс .open снят с #log-expand-btn');
}

console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
