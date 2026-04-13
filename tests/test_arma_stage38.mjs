// Тесты Шага 38 (arma.md) — Анимированный индикатор вкладок (скользящий)
// Запуск: node tests/test_arma_stage38.mjs
//
// Чеклист из arma.md Шаг 38:
//   [1] HTML: <div class="ri-tab-indicator"></div> внутри .ri-tabs.
//   [2] CSS: .ri-tabs { position: relative }, .ri-tab-indicator
//       { position: absolute; bottom: 0; height: 2px;
//         background: var(--accent); transition: left/width cubic-bezier }.
//   [3] JS: функция updateTabIndicator(activeBtn) выставляет
//       indicator.style.left/width по offsetLeft/clientWidth кнопки.
//       Вызывается при первом рендере панели и в switchRegionTab().
//   [4] CSS: .ri-tab-content { animation: ri-tab-fade ... },
//       @keyframes ri-tab-fade { opacity 0→1, translateY(4px → 0) }.
//   [5] При 2 или 3 вкладках индикатор корректно позиционируется
//       (логика не зависит от количества кнопок — пересчёт по DOM).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapSrc  = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'),    'utf8');
const htmlSrc = readFileSync(resolve(__dirname, '..', 'index.html'),      'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// Извлекаем тело функции showRegionInfo и switchRegionTab
const showFnMatch = mapSrc.match(
  /function\s+showRegionInfo\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const showFnBody = showFnMatch ? showFnMatch[0] : '';

const switchFnMatch = mapSrc.match(
  /function\s+switchRegionTab\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const switchFnBody = switchFnMatch ? switchFnMatch[0] : '';

const updateFnMatch = mapSrc.match(
  /function\s+updateTabIndicator\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const updateFnBody = updateFnMatch ? updateFnMatch[0] : '';

// ─────────────────────────────────────────────────────────────
section('[1] HTML: ri-tab-indicator внутри .ri-tabs');
// ─────────────────────────────────────────────────────────────
check(!!showFnMatch, 'функция showRegionInfo распарсена');
check(/class="ri-tab-indicator"/.test(showFnBody),
  '[1a] showRegionInfo вставляет <div class="ri-tab-indicator"></div>');

// Индикатор должен находиться внутри блока .ri-tabs (после кнопок)
{
  const tabsOpenIdx  = showFnBody.indexOf('class="ri-tabs"');
  const indicatorIdx = showFnBody.indexOf('class="ri-tab-indicator"');
  check(tabsOpenIdx >= 0 && indicatorIdx > tabsOpenIdx,
    '[1b] индикатор находится после открывающего <div class="ri-tabs">');
}

// ─────────────────────────────────────────────────────────────
section('[2] CSS: .ri-tabs относительный, .ri-tab-indicator абсолютный');
// ─────────────────────────────────────────────────────────────
check(/\.ri-tabs\s*\{[\s\S]*?position:\s*relative/.test(htmlSrc),
  '[2a] CSS .ri-tabs { position: relative }');
check(/\.ri-tab-indicator\s*\{[\s\S]*?position:\s*absolute/.test(htmlSrc),
  '[2b] CSS .ri-tab-indicator { position: absolute }');
check(/\.ri-tab-indicator\s*\{[\s\S]*?bottom:\s*0/.test(htmlSrc),
  '[2c] CSS .ri-tab-indicator { bottom: 0 }');
check(/\.ri-tab-indicator\s*\{[\s\S]*?height:\s*2px/.test(htmlSrc),
  '[2d] CSS .ri-tab-indicator { height: 2px }');
check(/\.ri-tab-indicator\s*\{[\s\S]*?background:\s*var\(--accent\)/.test(htmlSrc),
  '[2e] CSS .ri-tab-indicator { background: var(--accent) }');
check(/\.ri-tab-indicator\s*\{[\s\S]*?transition:[\s\S]*?left[\s\S]*?cubic-bezier\(\.4\s*,\s*0\s*,\s*\.2\s*,\s*1\)/.test(htmlSrc),
  '[2f] transition использует cubic-bezier(.4,0,.2,1) для left');
check(/\.ri-tab-indicator\s*\{[\s\S]*?transition:[\s\S]*?width[\s\S]*?cubic-bezier/.test(htmlSrc),
  '[2g] transition включает width с cubic-bezier');
check(/\.ri-tab-indicator\s*\{[\s\S]*?0\.25s/.test(htmlSrc),
  '[2h] длительность анимации 0.25s');

// ─────────────────────────────────────────────────────────────
section('[3] JS: updateTabIndicator + интеграция в switchRegionTab');
// ─────────────────────────────────────────────────────────────
check(!!updateFnMatch, '[3a] функция updateTabIndicator определена');
check(/offsetLeft/.test(updateFnBody),
  '[3b] updateTabIndicator использует activeBtn.offsetLeft');
check(/clientWidth/.test(updateFnBody),
  '[3c] updateTabIndicator использует activeBtn.clientWidth');
check(/style\.left\s*=/.test(updateFnBody),
  '[3d] устанавливает indicator.style.left');
check(/style\.width\s*=/.test(updateFnBody),
  '[3e] устанавливает indicator.style.width');
check(/querySelector\(\s*['"]\.ri-tab-indicator['"]\s*\)/.test(updateFnBody),
  '[3f] ищет элемент по селектору .ri-tab-indicator');

check(!!switchFnMatch, '[3g] функция switchRegionTab распарсена');
check(/updateTabIndicator\s*\(/.test(switchFnBody),
  '[3h] switchRegionTab вызывает updateTabIndicator');

// Первый рендер: showRegionInfo тоже должен инициировать индикатор
check(/updateTabIndicator\s*\(/.test(showFnBody),
  '[3i] showRegionInfo вызывает updateTabIndicator после рендера');

// ─────────────────────────────────────────────────────────────
section('[4] CSS: .ri-tab-content fade-in анимация');
// ─────────────────────────────────────────────────────────────
check(/\.ri-tab-content\s*\{[\s\S]*?animation:\s*ri-tab-fade/.test(htmlSrc),
  '[4a] CSS .ri-tab-content { animation: ri-tab-fade ... }');
check(/@keyframes\s+ri-tab-fade\s*\{[\s\S]*?opacity:\s*0[\s\S]*?translateY\(4px\)/.test(htmlSrc),
  '[4b] @keyframes ri-tab-fade { from: opacity 0, translateY(4px) }');
check(/@keyframes\s+ri-tab-fade\s*\{[\s\S]*?opacity:\s*1[\s\S]*?translateY\(0\)/.test(htmlSrc),
  '[4c] @keyframes ri-tab-fade { to: opacity 1, translateY(0) }');
check(/\.ri-tab-content\s*\{[\s\S]*?0\.15s/.test(htmlSrc),
  '[4d] длительность ri-tab-fade ≈ 0.15s');

// HTML-шаблон применяет класс ri-tab-content ко всем вкладкам контента
const tabContentInTemplate = (showFnBody.match(/ri-tab-content/g) || []).length;
check(tabContentInTemplate >= 3,
  `[4e] класс ri-tab-content присутствует у всех 3 вкладок (info/build/diplomacy), найдено: ${tabContentInTemplate}`);

// ─────────────────────────────────────────────────────────────
section('[5] Поведение при разном числе вкладок');
// ─────────────────────────────────────────────────────────────
// Логика updateTabIndicator не должна зависеть от количества кнопок —
// она читает activeBtn.offsetLeft / clientWidth, а не считает индексы.
check(!/\.length\b|forEach|index/.test(updateFnBody) ||
      /offsetLeft/.test(updateFnBody),
  '[5a] updateTabIndicator не привязан к фиксированному количеству вкладок');

// switchRegionTab при отсутствии активной кнопки не должен падать —
// проверяем, что вызов updateTabIndicator защищён условием.
check(/if\s*\(\s*activeBtn\s*\)/.test(switchFnBody) ||
      /if\s*\(\s*!activeBtn/.test(switchFnBody) ||
      /activeBtn\s*&&/.test(switchFnBody) ||
      /activeBtn\s*\?/.test(switchFnBody),
  '[5b] switchRegionTab безопасно проверяет наличие активной кнопки');

// updateTabIndicator должен корректно обрабатывать null/отсутствующий индикатор
check(/if\s*\(\s*!?\s*activeBtn|activeBtn\s*&&|return/.test(updateFnBody),
  '[5c] updateTabIndicator имеет защитную проверку на null');

// ─────────────────────────────────────────────────────────────
section('Дополнительно: старый border-bottom на ri-tab--active убран');
// ─────────────────────────────────────────────────────────────
// Старый "border-bottom: 2px solid var(--text-gold)" заменён индикатором.
// Не критично, но визуально дублирующий бордер мешает.
{
  const activeBlockMatch = htmlSrc.match(/\.ri-tab--active\s*\{([\s\S]*?)\}/);
  const activeBlock = activeBlockMatch ? activeBlockMatch[1] : '';
  check(!/border-bottom:\s*2px\s+solid/.test(activeBlock),
    '[E1] .ri-tab--active больше не дублирует border-bottom (использует индикатор)');
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
