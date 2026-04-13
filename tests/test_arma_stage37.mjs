// Тесты Шага 37 (arma.md) — Переработать popup региона
// Запуск: node tests/test_arma_stage37.mjs
//
// Чеклист из arma.md Шаг 37:
//   [1] Шапка: ri-nation-stripe + glassmorphism градиент в цвете нации.
//   [2] Блок ключевых цифр ri-key-stats с тремя ri-key-stat
//       (население, +доход/ход, гарнизон), ri-key-num крупно.
//   [3] Прогресс-бары: ri-bar-row / ri-bar-track / ri-bar-fill для
//       плодородия (width: N%).
//   [4] Анимация ri-entering / @keyframes ri-slide-in, класс добавляется
//       при показе панели.
//   [5] Кнопки действий в футере .ri-footer с .ri-action-btn (+primary),
//       футер вне скроллируемой области (flex-shrink: 0).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapSrc = readFileSync(resolve(__dirname, '..', 'ui', 'map.js'), 'utf8');
const htmlSrc = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// Извлекаем тело функции showRegionInfo
const showFnMatch = mapSrc.match(
  /function\s+showRegionInfo\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const showFnBody = showFnMatch ? showFnMatch[0] : '';

// ─────────────────────────────────────────────────────────────
section('[1] Шапка панели — цветная полоса и градиент нации');
// ─────────────────────────────────────────────────────────────
check(!!showFnMatch, 'функция showRegionInfo распарсена');
check(/ri-nation-stripe/.test(showFnBody),
  '[1a] showRegionInfo выводит элемент .ri-nation-stripe');
check(/background:\s*\$\{nationColor\}/.test(showFnBody) ||
      /background:\s*['"]?\$\{nationColor\}/.test(showFnBody),
  '[1b] цвет полосы/шапки берётся из nationColor');
check(/linear-gradient\(135deg,\s*\$\{nationColor\}33/.test(showFnBody),
  '[1c] шапка использует linear-gradient(135deg, nationColor33 ...)');
check(/\.ri-nation-stripe\s*\{[\s\S]*?height:\s*3px/.test(htmlSrc),
  '[1d] CSS .ri-nation-stripe { height: 3px }');

// ─────────────────────────────────────────────────────────────
section('[2] Блок ключевых цифр (3 числа крупно)');
// ─────────────────────────────────────────────────────────────
check(/ri-key-stats/.test(showFnBody),
  '[2a] showRegionInfo содержит блок .ri-key-stats');
const keyStatCount = (showFnBody.match(/class="ri-key-stat"/g) || []).length;
check(keyStatCount === 3,
  `[2b] ровно 3 элемента .ri-key-stat (найдено: ${keyStatCount})`);
check(/ri-key-num/.test(showFnBody),
  '[2c] присутствует .ri-key-num');
check(/ri-key-lbl/.test(showFnBody),
  '[2d] присутствует .ri-key-lbl');
check(/👥\s*Население/.test(showFnBody),
  '[2e] метка "👥 Население"');
check(/💰\s*\/ход/.test(showFnBody),
  '[2f] метка "💰 /ход"');
check(/⚔\s*Гарнизон/.test(showFnBody),
  '[2g] метка "⚔ Гарнизон"');

// CSS: grid-template-columns 1fr 1fr 1fr
check(/\.ri-key-stats\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+1fr\s+1fr/.test(htmlSrc),
  '[2h] CSS .ri-key-stats имеет grid-template-columns: 1fr 1fr 1fr');
check(/\.ri-key-num\s*\{[\s\S]*?font-size:\s*18px/.test(htmlSrc),
  '[2i] CSS .ri-key-num font-size: 18px');
check(/\.ri-key-num\s*\{[\s\S]*?font-family:\s*['"]Cinzel/.test(htmlSrc),
  '[2j] CSS .ri-key-num font-family Cinzel');
// flex-shrink:0 для ri-key-stats (не скроллится)
check(/\.ri-key-stats\s*\{\s*flex-shrink:\s*0/.test(htmlSrc) ||
      /\.ri-key-stats\s*\{[\s\S]*?flex-shrink:\s*0/.test(htmlSrc),
  '[2k] .ri-key-stats { flex-shrink: 0 } — блок не скроллится');

// ─────────────────────────────────────────────────────────────
section('[3] Прогресс-бары для плодородия');
// ─────────────────────────────────────────────────────────────
check(/ri-bar-row/.test(showFnBody),
  '[3a] .ri-bar-row в шаблоне');
check(/ri-bar-track/.test(showFnBody),
  '[3b] .ri-bar-track в шаблоне');
check(/ri-bar-fill/.test(showFnBody),
  '[3c] .ri-bar-fill в шаблоне');
check(/🌿\s*Плодородие/.test(showFnBody),
  '[3d] метка "🌿 Плодородие" у прогресс-бара');
check(/width:\s*\$\{fertPct\}%/.test(showFnBody),
  '[3e] width: ${fertPct}% управляет заливкой');
check(/\.ri-bar-track\s*\{[\s\S]*?overflow:\s*hidden/.test(htmlSrc),
  '[3f] CSS .ri-bar-track { overflow: hidden }');
check(/\.ri-bar-fill\s*\{[\s\S]*?height:\s*100%/.test(htmlSrc),
  '[3g] CSS .ri-bar-fill { height: 100% }');

// ─────────────────────────────────────────────────────────────
section('[4] Анимация появления (ri-entering / ri-slide-in)');
// ─────────────────────────────────────────────────────────────
check(/classList\.add\(\s*['"]ri-entering['"]\s*\)/.test(showFnBody),
  '[4a] showRegionInfo добавляет класс ri-entering');
check(/classList\.remove\(\s*['"]ri-entering['"]\s*\)/.test(showFnBody),
  '[4b] showRegionInfo снимает ri-entering для перезапуска анимации');
check(/#region-info\.ri-entering\s*\{[\s\S]*?animation:\s*ri-slide-in/.test(htmlSrc),
  '[4c] CSS #region-info.ri-entering { animation: ri-slide-in ... }');
check(/@keyframes\s+ri-slide-in\s*\{[\s\S]*?translateX\(20px\)[\s\S]*?translateX\(0\)/.test(htmlSrc),
  '[4d] @keyframes ri-slide-in с translateX(20px → 0)');
check(/classList\.remove\(\s*['"]hidden['"]\s*\)/.test(showFnBody),
  '[4e] панель снимает класс hidden при показе');

// ─────────────────────────────────────────────────────────────
section('[5] Футер с кнопками действий (фиксирован, не скроллится)');
// ─────────────────────────────────────────────────────────────
check(/ri-footer/.test(showFnBody),
  '[5a] showRegionInfo содержит .ri-footer');
check(/ri-action-btn/.test(showFnBody),
  '[5b] .ri-action-btn в футере');
check(/ri-action-btn\s+primary/.test(showFnBody),
  '[5c] primary-кнопка .ri-action-btn.primary');
check(/\.ri-footer\s*\{\s*flex-shrink:\s*0/.test(htmlSrc) ||
      /\.ri-footer\s*\{[\s\S]*?flex-shrink:\s*0/.test(htmlSrc),
  '[5d] .ri-footer { flex-shrink: 0 } — футер не скроллится');
check(/\.ri-footer\s*\{[\s\S]*?border-top:/.test(htmlSrc),
  '[5e] CSS .ri-footer имеет border-top (визуальное разделение)');
check(/\.ri-action-btn\.primary\s*\{[\s\S]*?background:\s*linear-gradient/.test(htmlSrc),
  '[5f] CSS .ri-action-btn.primary использует linear-gradient');

// Футер рендерится ПОСЛЕ блока вкладок в innerHTML — это гарантирует, что
// он находится вне скроллируемой области #region-tab-info.
// Ищем позиции напрямую в теле функции (обход вложенных template literals).
{
  const footerIdx  = showFnBody.indexOf('${footerHtml}');
  const tabInfoIdx = showFnBody.indexOf('id="region-tab-info"');
  check(footerIdx > 0 && tabInfoIdx > 0 && footerIdx > tabInfoIdx,
    '[5g] ${footerHtml} расположен после region-tab-info (вне скролла)');
}

// Кнопка "Собрать армию" перенесена в футер (нет старого блока region-army-actions)
check(!/region-army-actions/.test(showFnBody),
  '[5h] старый блок .region-army-actions удалён из тела вкладки');

// ─────────────────────────────────────────────────────────────
section('Структура #region-info: flex-column, скроллится только контент');
// ─────────────────────────────────────────────────────────────
check(/#region-info\s*\{[\s\S]*?display:\s*flex/.test(htmlSrc),
  '[S1] #region-info { display: flex }');
check(/#region-info\s*\{[\s\S]*?flex-direction:\s*column/.test(htmlSrc),
  '[S2] #region-info { flex-direction: column }');
check(/\.region-info-header\s*\{\s*flex-shrink:\s*0/.test(htmlSrc),
  '[S3] .region-info-header { flex-shrink: 0 }');
check(/\.ri-tabs\s*\{\s*flex-shrink:\s*0/.test(htmlSrc) ||
      /\.ri-tabs\s+\{\s*flex-shrink:\s*0/.test(htmlSrc) ||
      /\.ri-tabs\s*\{[\s\S]*?flex-shrink:\s*0/.test(htmlSrc),
  '[S4] .ri-tabs { flex-shrink: 0 }');

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
