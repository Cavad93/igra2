// Тесты Шага 49 (arma.md) — Граф дипломатических отношений
// Запуск: node tests/test_arma_stage49.mjs
//
// Чеклист Шага 49:
//   [1]  В левой навигации добавлена кнопка 🕸 (id=diplo-graph-btn).
//   [2]  Кнопка вызывает toggleDiploGraph() или openDiploGraph().
//   [3]  В index.html определён <div id="diplo-graph-overlay"> с классом hidden.
//   [4]  Внутри overlay — .dg-header, <h2>, кнопка закрытия, <svg id="diplo-graph-svg">.
//   [5]  CSS для #diplo-graph-overlay (z-index, fixed) присутствует.
//   [6]  CSS для .dg-legend (легенда) присутствует.
//   [7]  В ui/diplo_graph.js определены openDiploGraph/closeDiploGraph/toggleDiploGraph.
//   [8]  renderDiploGraph расставляет нации по кругу (cos/sin от angle).
//   [9]  Линии окрашены по типам: война (красный), союз (зелёный),
//        торговля (синий пунктир), мир (серый).
//  [10]  Клик на узел — открывает дипломатическую панель для этой нации.
//  [11]  В closeTopModal добавлен обработчик для diplo-graph-overlay (Esc закрывает).
//  [12]  ui/diplo_graph.js подключён в index.html (<script src="ui/diplo_graph.js">).
//  [13]  Экспорт window.renderDiploGraph / openDiploGraph / closeDiploGraph.
//  [14]  renderDiploGraph читает GAME_STATE.nations и GAME_STATE.diplomacy.treaties.
//  [15]  renderDiploGraph использует `war` из getRelation().

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const indexHtml  = readFileSync(resolve(__dirname, '..', 'index.html'),          'utf8');
const dgSrc      = readFileSync(resolve(__dirname, '..', 'ui', 'diplo_graph.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ════════════════════════════════════════════════════════════════
section('[1][2] Левая навигация — кнопка 🕸');
// ════════════════════════════════════════════════════════════════
check(/id=["']diplo-graph-btn["']/.test(indexHtml),
  '[1] кнопка с id="diplo-graph-btn" присутствует');
check(/id=["']diplo-graph-btn["'][^>]*>[^<]*🕸/.test(indexHtml)
  || /🕸[^<]*<\/button>[\s\S]{0,200}id=["']diplo-graph-btn/.test(indexHtml)
  || indexHtml.includes('>🕸<'),
  '[1b] кнопка содержит символ 🕸');
check(/onclick=["']toggleDiploGraph\(\)["']/.test(indexHtml)
  || /onclick=["']openDiploGraph\(\)["']/.test(indexHtml),
  '[2] кнопка вызывает toggleDiploGraph() или openDiploGraph()');

// ════════════════════════════════════════════════════════════════
section('[3][4] HTML — diplo-graph-overlay');
// ════════════════════════════════════════════════════════════════
check(/<div[^>]*id=["']diplo-graph-overlay["'][^>]*class=["'][^"']*hidden/.test(indexHtml),
  '[3] <div id="diplo-graph-overlay"> с классом hidden');
check(/id=["']diplo-graph-svg["']/.test(indexHtml),
  '[4a] <svg id="diplo-graph-svg"> присутствует');
check(/class=["']dg-header["']/.test(indexHtml),
  '[4b] .dg-header присутствует');
check(/<h2>\s*Дипломатические отношения\s*<\/h2>/.test(indexHtml),
  '[4c] заголовок "Дипломатические отношения"');
check(/onclick=["']closeDiploGraph\(\)["']/.test(indexHtml),
  '[4d] кнопка закрытия вызывает closeDiploGraph()');

// ════════════════════════════════════════════════════════════════
section('[5][6] CSS — оверлей и легенда');
// ════════════════════════════════════════════════════════════════
check(/#diplo-graph-overlay\s*\{[\s\S]*?position:\s*fixed/.test(indexHtml),
  '[5a] #diplo-graph-overlay имеет position: fixed');
check(/#diplo-graph-overlay\s*\{[\s\S]*?z-index:\s*2000/.test(indexHtml),
  '[5b] #diplo-graph-overlay имеет z-index: 2000');
check(/#diplo-graph-overlay\.hidden\s*\{[\s\S]*?display:\s*none/.test(indexHtml),
  '[5c] .hidden → display: none');
check(/\.dg-legend\s*\{/.test(indexHtml),
  '[6a] .dg-legend определена');
check(/\.dg-legend-swatch\.dg-war/.test(indexHtml)
  && /\.dg-legend-swatch\.dg-alliance/.test(indexHtml)
  && /\.dg-legend-swatch\.dg-trade/.test(indexHtml)
  && /\.dg-legend-swatch\.dg-peace/.test(indexHtml),
  '[6b] swatches для всех 4 типов отношений');

// ════════════════════════════════════════════════════════════════
section('[7][13] ui/diplo_graph.js — API');
// ════════════════════════════════════════════════════════════════
check(/function\s+renderDiploGraph\s*\(/.test(dgSrc),
  '[7a] function renderDiploGraph определена');
check(/function\s+openDiploGraph\s*\(/.test(dgSrc),
  '[7b] function openDiploGraph определена');
check(/function\s+closeDiploGraph\s*\(/.test(dgSrc),
  '[7c] function closeDiploGraph определена');
check(/function\s+toggleDiploGraph\s*\(/.test(dgSrc),
  '[7d] function toggleDiploGraph определена');
check(/function\s+isDiploGraphOpen\s*\(/.test(dgSrc),
  '[7e] function isDiploGraphOpen определена');
check(/window\.renderDiploGraph\s*=\s*renderDiploGraph/.test(dgSrc),
  '[13a] экспорт window.renderDiploGraph');
check(/window\.openDiploGraph\s*=\s*openDiploGraph/.test(dgSrc),
  '[13b] экспорт window.openDiploGraph');
check(/window\.closeDiploGraph\s*=\s*closeDiploGraph/.test(dgSrc),
  '[13c] экспорт window.closeDiploGraph');
check(/window\.toggleDiploGraph\s*=\s*toggleDiploGraph/.test(dgSrc),
  '[13d] экспорт window.toggleDiploGraph');
check(/window\.isDiploGraphOpen\s*=\s*isDiploGraphOpen/.test(dgSrc),
  '[13e] экспорт window.isDiploGraphOpen');

// ════════════════════════════════════════════════════════════════
section('[8] Расстановка наций по кругу');
// ════════════════════════════════════════════════════════════════
check(/Math\.cos\s*\(\s*angle/.test(dgSrc) && /Math\.sin\s*\(\s*angle/.test(dgSrc),
  '[8a] используются Math.cos(angle)/Math.sin(angle)');
check(/2\s*\*\s*Math\.PI/.test(dgSrc),
  '[8b] круг (2 * Math.PI)');
check(/createElementNS\s*\([^,]+,\s*['"]circle['"]/.test(dgSrc),
  '[8c] SVG-узлы создаются как circle');

// ════════════════════════════════════════════════════════════════
section('[9] Цвета рёбер по типу отношений');
// ════════════════════════════════════════════════════════════════
check(/#d93b3b|#dc3545|#e53e3e|#d03030/i.test(dgSrc),
  '[9a] красный цвет для войны');
check(/stroke-width[^0-9]*3/.test(dgSrc) || /width:\s*3/.test(dgSrc),
  '[9b] толщина 3px для войны');
check(/#2fa24a|#2e8b57|#27ae60|#3aaf3a|#2fa24a/i.test(dgSrc),
  '[9c] зелёный для союзов');
check(/#3a86ff|#2a7fff|#4a90e2|#2196f3/i.test(dgSrc),
  '[9d] синий для торговли');
check(/stroke-dasharray|dash/i.test(dgSrc),
  '[9e] пунктир (dasharray) для торговли');
check(/#9a9a9a|#888|#9e9e9e|#a0a0a0|#808080|#999/i.test(dgSrc),
  '[9f] серый для мирных договоров');

// ════════════════════════════════════════════════════════════════
section('[10] Клик на узле — открытие дипломатической панели');
// ════════════════════════════════════════════════════════════════
check(/addEventListener\s*\(\s*['"]click['"]/.test(dgSrc),
  '[10a] клик-обработчик на узлах');
check(/showDiplomacyOverlay\s*\(/.test(dgSrc) || /renderLeftPanelTab\s*\(\s*['"]diplomacy['"]/.test(dgSrc),
  '[10b] открывается showDiplomacyOverlay или вкладка diplomacy');
check(/function\s+onDiploGraphNodeClick\s*\(/.test(dgSrc),
  '[10c] onDiploGraphNodeClick определена');

// ════════════════════════════════════════════════════════════════
section('[11] Esc закрывает diplo-graph-overlay');
// ════════════════════════════════════════════════════════════════
check(/isDiploGraphOpen\s*\(\)[\s\S]{0,100}closeDiploGraph/.test(indexHtml),
  '[11] closeTopModal проверяет isDiploGraphOpen → closeDiploGraph');

// ════════════════════════════════════════════════════════════════
section('[12] Подключение скрипта в index.html');
// ════════════════════════════════════════════════════════════════
check(/<script\s+src=["']ui\/diplo_graph\.js["']/.test(indexHtml),
  '[12] <script src="ui/diplo_graph.js"> присутствует');

// ════════════════════════════════════════════════════════════════
section('[14][15] Чтение GAME_STATE и war');
// ════════════════════════════════════════════════════════════════
check(/GAME_STATE[^;]{0,40}nations/.test(dgSrc),
  '[14a] diplo_graph читает GAME_STATE.nations');
check(/GAME_STATE[^;]{0,60}diplomacy[^;]{0,20}treaties/.test(dgSrc),
  '[14b] diplo_graph читает GAME_STATE.diplomacy.treaties');
check(/getRelation\s*\(/.test(dgSrc) && /\.war\b/.test(dgSrc),
  '[15] используется getRelation(...) и поле .war');

// ════════════════════════════════════════════════════════════════
// ИТОГ
// ════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════`);
console.log(`  Итого: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log(`\n  Провалы:`);
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
console.log(`  ✅ Все проверки Шага 49 пройдены.`);
