// Тесты Шага 35 (arma.md) — Визуальный "пульс" для критических событий
// Запуск: node tests/test_arma_stage35.mjs
//
// Чеклист из arma.md Шаг 35:
//   [1] CSS body::after — position:fixed; inset:0; pointer-events:none;
//       z-index:9999; opacity:0; transition: opacity 0.1s
//   [2] CSS body.pulse-war::after — радиальный градиент, анимация pulse-edge 2s
//   [3] CSS body.pulse-gold::after — радиальный градиент, анимация pulse-edge 1.5s
//   [4] CSS @keyframes pulse-edge { 0%{opacity:1} 100%{opacity:0} }
//   [5] JS triggerPulse(type): удалить все pulse-* с body, добавить pulse-<type>,
//       через 2000ms убрать класс
//   [6] window.triggerPulse экспортирован
//   [7] ui/pulse.js подключён в index.html
//   [8] Поведение (sandbox): класс добавляется, через таймаут убирается;
//       повторный вызов работает; неизвестный type игнорируется.
//   [9] Не мешает кликам (pointer-events: none).
//   [10] На слабых устройствах нет просадки FPS (чисто CSS animation — проверка
//        что JS не крутит rAF и не меняет стили каждый кадр).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const pulseSrc  = readFileSync(resolve(__dirname, '..', 'ui', 'pulse.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('CSS — body::after (базовый слой)');
// ─────────────────────────────────────────────────────────────

const afterMatch = indexHtml.match(/body::after\s*\{[^}]+\}/);
check(!!afterMatch, '[pre] CSS блок body::after найден');
const afterCss = afterMatch ? afterMatch[0] : '';
check(/content:\s*['"]{2}/.test(afterCss),             '[1a] body::after content: ""');
check(/position:\s*fixed/.test(afterCss),              '[1b] body::after position: fixed');
check(/inset:\s*0/.test(afterCss),                     '[1c] body::after inset: 0');
check(/pointer-events:\s*none/.test(afterCss),         '[1d] body::after pointer-events: none (не мешает кликам)');
check(/z-index:\s*9999/.test(afterCss),                '[1e] body::after z-index: 9999');
check(/opacity:\s*0/.test(afterCss),                   '[1f] body::after opacity: 0 (скрыт по умолчанию)');
check(/transition:\s*opacity\s+0\.1s/.test(afterCss),  '[1g] body::after transition: opacity 0.1s');

// ─────────────────────────────────────────────────────────────
section('CSS — body.pulse-war::after');
// ─────────────────────────────────────────────────────────────

const warMatch = indexHtml.match(/body\.pulse-war::after\s*\{[^}]+\}/);
check(!!warMatch, '[pre] CSS блок body.pulse-war::after найден');
const warCss = warMatch ? warMatch[0] : '';
check(/background:\s*radial-gradient/.test(warCss),
  '[2a] pulse-war::after background: radial-gradient(...)');
check(/rgba\(\s*200\s*,\s*30\s*,\s*30\s*,\s*0\.18\s*\)/.test(warCss),
  '[2b] pulse-war::after красный цвет rgba(200,30,30,0.18)');
check(/animation:\s*pulse-edge\s+2s\s+ease-out\s+forwards/.test(warCss),
  '[2c] pulse-war::after animation: pulse-edge 2s ease-out forwards');

// ─────────────────────────────────────────────────────────────
section('CSS — body.pulse-gold::after');
// ─────────────────────────────────────────────────────────────

const goldMatch = indexHtml.match(/body\.pulse-gold::after\s*\{[^}]+\}/);
check(!!goldMatch, '[pre] CSS блок body.pulse-gold::after найден');
const goldCss = goldMatch ? goldMatch[0] : '';
check(/background:\s*radial-gradient/.test(goldCss),
  '[3a] pulse-gold::after background: radial-gradient(...)');
check(/rgba\(\s*212\s*,\s*168\s*,\s*83\s*,\s*0\.2\s*\)/.test(goldCss),
  '[3b] pulse-gold::after золотой цвет rgba(212,168,83,0.2)');
check(/animation:\s*pulse-edge\s+1\.5s\s+ease-out\s+forwards/.test(goldCss),
  '[3c] pulse-gold::after animation: pulse-edge 1.5s ease-out forwards');

// ─────────────────────────────────────────────────────────────
section('CSS — @keyframes pulse-edge');
// ─────────────────────────────────────────────────────────────

const kfMatch = indexHtml.match(/@keyframes\s+pulse-edge\s*\{[\s\S]*?\}\s*\}/);
check(!!kfMatch, '[pre] @keyframes pulse-edge найден');
const kfCss = kfMatch ? kfMatch[0] : '';
check(/0%\s*\{\s*opacity:\s*1\s*;?\s*\}/.test(kfCss),
  '[4a] @keyframes pulse-edge 0% { opacity: 1 }');
check(/100%\s*\{\s*opacity:\s*0\s*;?\s*\}/.test(kfCss),
  '[4b] @keyframes pulse-edge 100% { opacity: 0 }');

// ─────────────────────────────────────────────────────────────
section('JS — ui/pulse.js подключён и экспортирует triggerPulse');
// ─────────────────────────────────────────────────────────────

check(/<script\s+src="ui\/pulse\.js"><\/script>/.test(indexHtml),
  '[7a] ui/pulse.js подключён в index.html');

check(/function\s+triggerPulse\s*\(\s*type\s*\)/.test(pulseSrc),
  '[5a] function triggerPulse(type) объявлена');
check(/window\.triggerPulse\s*=\s*triggerPulse/.test(pulseSrc),
  '[6a] window.triggerPulse экспортирован');

// Никаких rAF/setInterval в логике — только setTimeout для снятия класса
check(!/requestAnimationFrame/.test(pulseSrc),
  '[10a] нет requestAnimationFrame (анимация — чисто CSS)');
check(!/setInterval/.test(pulseSrc),
  '[10b] нет setInterval (анимация — чисто CSS)');

// ─────────────────────────────────────────────────────────────
section('Поведение — sandbox: triggerPulse добавляет и снимает класс');
// ─────────────────────────────────────────────────────────────

// Mock DOM c body.classList
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(c)     { set.add(c); },
    remove(c)  { set.delete(c); },
    contains(c){ return set.has(c); },
    toArray()  { return Array.from(set); },
  };
}
const body = { classList: makeClassList(), offsetWidth: 0 };
const fakeDoc = { body };

// Полифилл таймеров с ручным прогоном времени
let now = 0;
const timers = [];
function setTimeoutMock(fn, delay) {
  const id = timers.length + 1;
  timers.push({ id, fn, at: now + delay, cancelled: false });
  return id;
}
function clearTimeoutMock(id) {
  const t = timers.find(t => t.id === id);
  if (t) t.cancelled = true;
}
function advance(ms) {
  now += ms;
  for (const t of timers) {
    if (!t.cancelled && !t._fired && t.at <= now) {
      t._fired = true;
      t.fn();
    }
  }
}

const win = {};
const factory = new Function(
  'document', 'window', 'setTimeout', 'clearTimeout',
  pulseSrc + '\nreturn window.triggerPulse;'
);
const triggerPulse = factory(fakeDoc, win, setTimeoutMock, clearTimeoutMock);

check(typeof triggerPulse === 'function',
  '[B0] triggerPulse экспортирован на window после загрузки ui/pulse.js');

// Вызов 1: pulse-war
triggerPulse('war');
check(body.classList.contains('pulse-war'),
  '[8a] triggerPulse("war") → body.pulse-war добавлен');
check(!body.classList.contains('pulse-gold'),
  '[8b] другие pulse-* классы не добавлены');

// До истечения таймаута класс остаётся
advance(1000);
check(body.classList.contains('pulse-war'),
  '[8c] класс не снят до истечения 2000ms');

// Через 2000ms класс должен быть снят
advance(1500);
check(!body.classList.contains('pulse-war'),
  '[8d] через 2000ms класс pulse-war снят автоматически');

// Повторный вызов работает
triggerPulse('gold');
check(body.classList.contains('pulse-gold'),
  '[8e] повторный вызов triggerPulse("gold") работает');
check(!body.classList.contains('pulse-war'),
  '[8f] старые pulse-* сброшены перед установкой нового');

// Неизвестный тип игнорируется
triggerPulse('unknown');
check(!body.classList.contains('pulse-unknown'),
  '[8g] неизвестный тип игнорируется — класс не добавлен');
check(body.classList.contains('pulse-gold'),
  '[8h] неизвестный тип не сбрасывает уже активный пульс');

// Смена активного пульса с ещё не истёкшим таймером
advance(500);
triggerPulse('war');
check(body.classList.contains('pulse-war'),
  '[8i] новый вызов перебивает активный пульс');
check(!body.classList.contains('pulse-gold'),
  '[8j] при новом вызове старый класс снимается');

// После полного таймаута новый пульс также снимается
advance(2100);
check(!body.classList.contains('pulse-war'),
  '[8k] новый пульс тоже снимается через 2000ms');

// pointer-events: none — повторная проверка (уже на CSS уровне)
check(/pointer-events:\s*none/.test(afterCss),
  '[9a] body::after pointer-events: none — пульс не мешает кликам');

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
