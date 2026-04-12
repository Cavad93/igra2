// Тесты Шага 22 (arma.md) — API ключи → иконка настроек ⚙
// Запуск: node tests/test_arma_stage22.mjs
//
// Чеклист из arma.md Шаг 22:
//   [1]  В #top-bar добавлена кнопка #settings-btn с onclick="toggleSettingsModal()" и заголовком "Настройки".
//   [2]  CSS: #settings-btn — background:none, border:none, color:var(--text-dim), font-size:16px, cursor:pointer.
//   [3]  CSS: #settings-btn:hover — color:var(--text-gold).
//   [4]  Есть модал #settings-modal с .sm-box, шириной ~400px.
//   [5]  Заголовок модала содержит "Настройки".
//   [6]  В модале есть вкладки "API ключи" и "Интерфейс".
//   [7]  Внутри вкладки "API ключи" лежит #api-key-inline-panel c полями #inline-groq-key и #inline-anthropic-key
//        и кнопка "Сохранить ключи" (saveInlineAPIKeys).
//   [8]  #api-key-inline-panel больше НЕ находится внутри #right-panel (перенесён в модал).
//   [9]  В #bottom-area больше нет блока #api-key-section.
//   [10] Кнопка закрытия ✕ (.sm-close) в верхнем правом углу модала.
//   [11] В JS объявлены функции toggleSettingsModal / openSettingsModal / closeSettingsModal / switchSettingsTab.
//   [12] Функции экспортированы в window (window.toggleSettingsModal, и т.д.).
//   [13] Esc-хэндлер закрывает #settings-modal если он открыт.
//   [14] Клик на overlay #settings-modal закрывает модал (onclick="if(event.target===this)closeSettingsModal()").
//   [15] По умолчанию модал скрыт (display:none) и раскрывается по классу .open.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

section('HTML / CSS — топ-бар и кнопка ⚙');

// [1]
const topBarMatch = indexHtml.match(/<header\s+id="top-bar"[\s\S]*?<\/header>/);
check(
  !!topBarMatch && /<button\s+id="settings-btn"[^>]*onclick="toggleSettingsModal\(\)"[^>]*title="Настройки"[^>]*>/.test(topBarMatch[0]),
  '[1] В #top-bar есть <button id="settings-btn" onclick="toggleSettingsModal()" title="Настройки">'
);

// [2]
check(
  /#settings-btn\s*{[^}]*background:\s*none[^}]*border:\s*none[^}]*color:\s*var\(--text-dim\)[^}]*font-size:\s*16px[^}]*cursor:\s*pointer/s.test(indexHtml),
  '[2] CSS #settings-btn: background:none, border:none, color:var(--text-dim), font-size:16px, cursor:pointer'
);

// [3]
check(
  /#settings-btn:hover\s*{[^}]*color:\s*var\(--text-gold\)/s.test(indexHtml),
  '[3] CSS #settings-btn:hover → color:var(--text-gold)'
);

section('HTML / CSS — модал #settings-modal');

// [4]
const smBlock = indexHtml.match(/<div\s+id="settings-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
check(!!smBlock, '[4a] Есть блок <div id="settings-modal"> с вложенным .sm-box');
check(
  /#settings-modal\s+\.sm-box\s*{[^}]*width:\s*400px/s.test(indexHtml),
  '[4b] CSS #settings-modal .sm-box: width ~400px'
);

// [5]
check(
  !!smBlock && /class="sm-title"[^>]*>[^<]*Настройки/.test(smBlock[0]),
  '[5] В заголовке модала написано "Настройки"'
);

// [6]
check(
  !!smBlock
    && /data-sm-tab="keys"[\s\S]*?API\s+ключи/.test(smBlock[0])
    && /data-sm-tab="ui"[\s\S]*?Интерфейс/.test(smBlock[0]),
  '[6] В модале присутствуют вкладки "API ключи" и "Интерфейс"'
);

// [7]
check(
  !!smBlock
    && /id="api-key-inline-panel"/.test(smBlock[0])
    && /id="inline-groq-key"/.test(smBlock[0])
    && /id="inline-anthropic-key"/.test(smBlock[0])
    && /onclick="saveInlineAPIKeys\(\)"/.test(smBlock[0]),
  '[7] Вкладка "API ключи" содержит #api-key-inline-panel, поля ключей и кнопку saveInlineAPIKeys()'
);

// [8] — #api-key-inline-panel НЕ внутри #right-panel
const rightPanelMatch = indexHtml.match(/<div\s+id="right-panel"[\s\S]*?<\/div>\s*<\/main>/);
check(
  rightPanelMatch && !/id="api-key-inline-panel"/.test(rightPanelMatch[0]),
  '[8] #api-key-inline-panel больше нет внутри #right-panel'
);

// [9]
const footerMatch = indexHtml.match(/<footer\s+id="bottom-area"[\s\S]*?<\/footer>/);
check(
  footerMatch && !/id="api-key-section"/.test(footerMatch[0]),
  '[9] В <footer id="bottom-area"> больше нет блока #api-key-section'
);

// [10]
check(
  !!smBlock && /<button[^>]*class="sm-close"[^>]*onclick="closeSettingsModal\(\)"[^>]*>✕<\/button>/.test(smBlock[0]),
  '[10] Есть кнопка закрытия ✕ (.sm-close) в шапке модала'
);

// [14]
check(
  /<div\s+id="settings-modal"\s+onclick="if\(event\.target===this\)closeSettingsModal\(\)"/.test(indexHtml),
  '[14] Клик на overlay #settings-modal закрывает модал'
);

// [15]
check(
  /#settings-modal\s*{[^}]*display:\s*none/s.test(indexHtml)
    && /#settings-modal\.open\s*{[^}]*display:\s*flex/s.test(indexHtml),
  '[15] По умолчанию модал скрыт (display:none), открывается по классу .open (display:flex)'
);

section('JS — функции управления модалом');

// [11]
check(/function\s+toggleSettingsModal\s*\(\s*\)/.test(indexHtml),
  '[11a] Объявлена function toggleSettingsModal()');
check(/function\s+openSettingsModal\s*\(\s*\)/.test(indexHtml),
  '[11b] Объявлена function openSettingsModal()');
check(/function\s+closeSettingsModal\s*\(\s*\)/.test(indexHtml),
  '[11c] Объявлена function closeSettingsModal()');
check(/function\s+switchSettingsTab\s*\(\s*name\s*\)/.test(indexHtml),
  '[11d] Объявлена function switchSettingsTab(name)');

// [12]
check(/window\.toggleSettingsModal\s*=\s*toggleSettingsModal/.test(indexHtml),
  '[12a] window.toggleSettingsModal = toggleSettingsModal');
check(/window\.closeSettingsModal\s*=\s*closeSettingsModal/.test(indexHtml),
  '[12b] window.closeSettingsModal = closeSettingsModal');
check(/window\.switchSettingsTab\s*=\s*switchSettingsTab/.test(indexHtml),
  '[12c] window.switchSettingsTab = switchSettingsTab');

// [13] — Esc-хэндлер закрывает settings-modal первым
const escBlock = indexHtml.match(/e\.key\s*===\s*'Escape'[\s\S]*?\}\s*\);/);
check(
  !!escBlock && /settings-modal[\s\S]*?closeSettingsModal\(\)/.test(escBlock[0]),
  '[13] Esc-хэндлер закрывает #settings-modal если он открыт'
);

section('Поведение JS в фейковом окружении');

// Имитируем браузер: выполняем JS-функции из inline-скриптов.
// Вместо vm — вырежем функции и eval'нём их в подконтрольном scope.
const jsBlock = indexHtml.match(/function\s+toggleSettingsModal[\s\S]*?window\.switchSettingsTab\s*=\s*switchSettingsTab;/);
check(!!jsBlock, '[P1] Нашли JS-блок Шага 22 для выполнения');

if (jsBlock) {
  // Минимальный DOM
  const classListFactory = () => {
    const s = new Set();
    return {
      _set: s,
      add: (c) => s.add(c),
      remove: (c) => s.delete(c),
      contains: (c) => s.has(c),
      toggle: (c, on) => { if (on) s.add(c); else s.delete(c); },
    };
  };
  const makeEl = (id) => ({
    id,
    _attrs: {},
    classList: classListFactory(),
    children: [],
    getAttribute(k) { return this._attrs[k] ?? null; },
    querySelectorAll(sel) {
      // поддержка `.sm-tab` и `.sm-tab-pane`
      const cls = sel.replace(/^\./, '');
      const out = [];
      const walk = (n) => {
        if ((n._attrs?.class || '').split(' ').includes(cls)) out.push(n);
        (n.children || []).forEach(walk);
      };
      walk(this);
      return out;
    },
  });
  const modal = makeEl('settings-modal');
  // Добавим вкладки и pane
  function addTab(name, active) {
    const t = makeEl('tab-' + name);
    t._attrs = { class: 'sm-tab' + (active ? ' active' : ''), 'data-sm-tab': name };
    if (active) t.classList.add('active');
    modal.children.push(t);
    const p = makeEl('pane-' + name);
    p._attrs = { class: 'sm-tab-pane' + (active ? ' active' : ''), 'data-sm-pane': name };
    if (active) p.classList.add('active');
    modal.children.push(p);
  }
  addTab('keys', true);
  addTab('ui', false);
  // Переопределим getAttribute/setAttribute, чтобы работала логика active
  modal.children.forEach(ch => {
    ch.getAttribute = function (k) {
      if (k === 'data-sm-tab')  return ch._attrs['data-sm-tab']  ?? null;
      if (k === 'data-sm-pane') return ch._attrs['data-sm-pane'] ?? null;
      return ch._attrs[k] ?? null;
    };
  });
  const fakeDoc = {
    _modal: modal,
    getElementById(id) { return id === 'settings-modal' ? modal : null; },
  };

  const sandbox = {
    document: fakeDoc,
    window: {},
    _updateInlineKeyStatus: () => {},
  };
  // Выполняем извлечённый код
  const fnBody = jsBlock[0];
  const factory = new Function('document', 'window', '_updateInlineKeyStatus', `
    ${fnBody}
    return { toggleSettingsModal, openSettingsModal, closeSettingsModal, switchSettingsTab };
  `);
  const api = factory(sandbox.document, sandbox.window, sandbox._updateInlineKeyStatus);

  // По умолчанию закрыт
  check(!modal.classList.contains('open'), '[P2] Стартовое состояние — модал не имеет класса .open');

  // toggle → открыть
  api.toggleSettingsModal();
  check(modal.classList.contains('open'), '[P3] toggleSettingsModal() открывает модал (.open)');

  // toggle повторно → закрыть
  api.toggleSettingsModal();
  check(!modal.classList.contains('open'), '[P4] Повторный toggleSettingsModal() закрывает модал');

  // openSettingsModal / closeSettingsModal
  api.openSettingsModal();
  check(modal.classList.contains('open'), '[P5] openSettingsModal() добавляет класс .open');
  api.closeSettingsModal();
  check(!modal.classList.contains('open'), '[P6] closeSettingsModal() убирает класс .open');

  // switchSettingsTab → активирует нужный таб и pane
  api.switchSettingsTab('ui');
  const uiTab   = modal.children.find(c => c._attrs['data-sm-tab'] === 'ui');
  const uiPane  = modal.children.find(c => c._attrs['data-sm-pane'] === 'ui');
  const keysTab = modal.children.find(c => c._attrs['data-sm-tab'] === 'keys');
  check(
    uiTab.classList.contains('active') && uiPane.classList.contains('active') && !keysTab.classList.contains('active'),
    '[P7] switchSettingsTab("ui") активирует таб и pane "ui" и снимает active с "keys"'
  );
}

console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
