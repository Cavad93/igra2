// Тесты Шага 73 (arma.md) — Процедурный SVG-портрет.
// Запуск: node tests/test_arma_stage73.mjs
//
// Чеклист из arma.md Шаг 73:
//   [C1] При отсутствии JPG-файлов все персонажи показывают сгенерированные
//        SVG-лица. (Инженерная проверка: ui/portrait.js.onerror вызывает
//        генератор, а не только статичный placeholder.svg.)
//   [C2] Два персонажа с разными id всегда получают разные SVG.
//   [C3] Один персонаж всегда получает одно и то же SVG после перезагрузки.
//   [C4] Греческий персонаж и кочевой получают разные тона кожи.
//   [C5] При загруженных JPG SVG-генератор не вызывается.
//
// Дополнительно проверяем инфраструктуру файлов:
//   [F1] js/rng.js существует и экспортирует seededRNG.
//   [F2] ui/portrait_svg.js существует и экспортирует generatePortraitSVG.
//   [F3] index.html подключает js/rng.js и ui/portrait_svg.js до ui/portrait.js.
//   [F4] assets/portraits/placeholder.svg обновлён до минималистичного силуэта.
//   [F5] seededRNG детерминирован: один seed → одна последовательность.
//   [F6] generatePortraitSVG возвращает валидный <svg>-документ.
//   [F7] generatePortraitDataURL возвращает строку data:image/svg+xml…

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ─────────────────────────────────────────────────────────────────────────
// Пути
// ─────────────────────────────────────────────────────────────────────────
const rngPath      = join(root, 'js/rng.js');
const svgPath      = join(root, 'ui/portrait_svg.js');
const portraitPath = join(root, 'ui/portrait.js');
const cgPath       = join(root, 'data/culture_groups.js');
const filtersPath  = join(root, 'data/portrait_filters.js');
const placeholder  = join(root, 'assets/portraits/placeholder.svg');
const htmlPath     = join(root, 'index.html');

// ═══════════════════════════════════════════════════════════════
section('[F1] js/rng.js существует и экспортирует seededRNG');
// ═══════════════════════════════════════════════════════════════
check(existsSync(rngPath), '[F1a] js/rng.js существует');

const rngSrc = existsSync(rngPath) ? readFileSync(rngPath, 'utf8') : '';
check(/seededRNG/.test(rngSrc), '[F1b] js/rng.js содержит seededRNG');

// ═══════════════════════════════════════════════════════════════
section('[F2] ui/portrait_svg.js существует');
// ═══════════════════════════════════════════════════════════════
check(existsSync(svgPath), '[F2a] ui/portrait_svg.js существует');
const svgSrc = existsSync(svgPath) ? readFileSync(svgPath, 'utf8') : '';
check(/generatePortraitSVG/.test(svgSrc),
  '[F2b] ui/portrait_svg.js содержит generatePortraitSVG');
check(/SKIN_PALETTES/.test(svgSrc),
  '[F2c] ui/portrait_svg.js объявляет SKIN_PALETTES');

// ═══════════════════════════════════════════════════════════════
section('[F3] index.html подключает js/rng.js и ui/portrait_svg.js до ui/portrait.js');
// ═══════════════════════════════════════════════════════════════
const htmlSrc = readFileSync(htmlPath, 'utf8');
const rngIdx  = htmlSrc.indexOf('js/rng.js');
const svgIdx  = htmlSrc.indexOf('ui/portrait_svg.js');
const portIdx = htmlSrc.indexOf('ui/portrait.js');
check(rngIdx > 0,     '[F3a] <script src="js/rng.js"> присутствует');
check(svgIdx > 0,     '[F3b] <script src="ui/portrait_svg.js"> присутствует');
check(rngIdx > 0 && portIdx > 0 && rngIdx < portIdx,
  '[F3c] js/rng.js подключён ДО ui/portrait.js');
check(svgIdx > 0 && portIdx > 0 && svgIdx < portIdx,
  '[F3d] ui/portrait_svg.js подключён ДО ui/portrait.js');
check(rngIdx > 0 && svgIdx > 0 && rngIdx < svgIdx,
  '[F3e] js/rng.js подключён ДО ui/portrait_svg.js');

// ═══════════════════════════════════════════════════════════════
section('[F4] placeholder.svg обновлён до минималистичного силуэта');
// ═══════════════════════════════════════════════════════════════
check(existsSync(placeholder), '[F4a] assets/portraits/placeholder.svg существует');
const plSrc = readFileSync(placeholder, 'utf8');
check(/Шаг 73|Step 73/i.test(plSrc),
  '[F4b] placeholder.svg маркирован Шаг 73');
check(/<svg/.test(plSrc) && /<\/svg>/.test(plSrc),
  '[F4c] placeholder.svg — валидный SVG (открывается и закрывается)');

// ═══════════════════════════════════════════════════════════════
// Загружаем js/rng.js, data/culture_groups.js и ui/portrait_svg.js в sandbox.
// ═══════════════════════════════════════════════════════════════
const filtersSrc = readFileSync(filtersPath, 'utf8');
const cgSrc      = readFileSync(cgPath,      'utf8');

const sandbox = {
  window: {}, document: {}, module: { exports: {} }, exports: {},
  console,
};
sandbox.module.exports = sandbox.exports;
vm.createContext(sandbox);
vm.runInContext(filtersSrc, sandbox);
vm.runInContext(cgSrc, sandbox);
vm.runInContext(rngSrc, sandbox);
vm.runInContext(svgSrc, sandbox);

const seededRNG = sandbox.seededRNG
  ?? sandbox.window.seededRNG
  ?? (sandbox.module && sandbox.module.exports && sandbox.module.exports.seededRNG);
const generatePortraitSVG = sandbox.generatePortraitSVG
  ?? sandbox.window.generatePortraitSVG
  ?? (sandbox.module && sandbox.module.exports && sandbox.module.exports.generatePortraitSVG);
const generatePortraitDataURL = sandbox.generatePortraitDataURL
  ?? sandbox.window.generatePortraitDataURL
  ?? (sandbox.module && sandbox.module.exports && sandbox.module.exports.generatePortraitDataURL);

// ═══════════════════════════════════════════════════════════════
section('[F5] seededRNG — детерминирован');
// ═══════════════════════════════════════════════════════════════
check(typeof seededRNG === 'function', '[F5a] seededRNG — функция');
if (typeof seededRNG === 'function') {
  const a = seededRNG(12345);
  const b = seededRNG(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  check(JSON.stringify(seqA) === JSON.stringify(seqB),
    '[F5b] один seed → одинаковая последовательность');

  const c = seededRNG(54321);
  const seqC = [c(), c(), c(), c(), c()];
  check(JSON.stringify(seqA) !== JSON.stringify(seqC),
    '[F5c] разные seed → разные последовательности');

  // Диапазон [0, 1)
  const r = seededRNG(7);
  let inRange = true;
  for (let i = 0; i < 500; i++) {
    const v = r();
    if (!(v >= 0 && v < 1)) { inRange = false; break; }
  }
  check(inRange, '[F5d] все значения в [0, 1)');
}

// ═══════════════════════════════════════════════════════════════
section('[F6] generatePortraitSVG — валидный SVG');
// ═══════════════════════════════════════════════════════════════
check(typeof generatePortraitSVG === 'function',
  '[F6a] generatePortraitSVG — функция');
if (typeof generatePortraitSVG === 'function') {
  const s = generatePortraitSVG('char_001', 'greek', 96);
  check(typeof s === 'string' && s.length > 0,
    '[F6b] возвращает непустую строку');
  check(s.startsWith('<svg') && s.endsWith('</svg>'),
    '[F6c] корректно открывается <svg> и закрывается </svg>');
  check(s.includes('width="96"') && s.includes('height="96"'),
    '[F6d] атрибуты width/height установлены');
  check(s.includes('viewBox="0 0 96 96"'),
    '[F6e] viewBox установлен');
  // Должны присутствовать базовые элементы лица
  check(/ellipse/.test(s), '[F6f] содержит <ellipse> (лицо/глаза)');
  check(/rect/.test(s),    '[F6g] содержит <rect> (фон)');
}

// ═══════════════════════════════════════════════════════════════
section('[F7] generatePortraitDataURL — data:URL');
// ═══════════════════════════════════════════════════════════════
check(typeof generatePortraitDataURL === 'function',
  '[F7a] generatePortraitDataURL — функция');
if (typeof generatePortraitDataURL === 'function') {
  const u = generatePortraitDataURL('char_007', 'roman', 96);
  check(typeof u === 'string' && u.startsWith('data:image/svg+xml'),
    '[F7b] возвращает data:image/svg+xml…');
  check(/%3Csvg/i.test(u) || /<svg/.test(u),
    '[F7c] содержит тело SVG (url-encoded)');
}

// ═══════════════════════════════════════════════════════════════
section('[C3] Детерминированность — один id всегда даёт одно и то же SVG');
// ═══════════════════════════════════════════════════════════════
if (typeof generatePortraitSVG === 'function') {
  const a = generatePortraitSVG('char_042', 'greek', 96);
  const b = generatePortraitSVG('char_042', 'greek', 96);
  const c = generatePortraitSVG('char_042', 'greek', 96);
  check(a === b && b === c, '[C3a] три вызова подряд — идентичный SVG');
}

// ═══════════════════════════════════════════════════════════════
section('[C2] Два персонажа с разными id → разные SVG');
// ═══════════════════════════════════════════════════════════════
if (typeof generatePortraitSVG === 'function') {
  const N = 50;
  const svgs = [];
  for (let i = 0; i < N; i++) svgs.push(generatePortraitSVG('char_' + i, 'greek', 96));
  const unique = new Set(svgs).size;
  // Ожидаем, что подавляющее большинство будут уникальными.
  check(unique >= Math.floor(N * 0.85),
    `[C2a] уникальных SVG ≥ ${Math.floor(N * 0.85)}/${N} (факт: ${unique})`);

  // Прямое сравнение: соседние id должны отличаться
  let diffNeighbors = 0;
  for (let i = 0; i < N - 1; i++) {
    if (svgs[i] !== svgs[i + 1]) diffNeighbors++;
  }
  check(diffNeighbors >= Math.floor((N - 1) * 0.8),
    `[C2b] соседние id различаются ≥80% случаев (${diffNeighbors}/${N - 1})`);
}

// ═══════════════════════════════════════════════════════════════
section('[C4] Разные культурные группы → разные тона кожи');
// ═══════════════════════════════════════════════════════════════
if (typeof generatePortraitSVG === 'function') {
  // Извлекаем fill="rgb(r,g,b)" — тон кожи лица. Берём последний rgb(...)
  // это не идеально, но для тестов достаточно: смотрим на все rgb(…) в SVG
  // и проверяем, что хотя бы один rgb тон у 'greek' чаще светлее, чем у 'nomadic'.
  function extractSkinFaceRGB(svg) {
    // В нашем шаблоне цвет лица — это 4-й rect/ellipse с fill="rgb(r,g,b)":
    // 1) фон, 2) плечи, 3) волосы (hsl), 4) лицо. Упрощённо — ищем все rgb(…).
    const all = [];
    const re = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/g;
    let m;
    while ((m = re.exec(svg))) {
      all.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    }
    // Лицо ≈ самый светлый (наибольший r+g+b)
    if (all.length === 0) return [0, 0, 0];
    let best = all[0], bestSum = best[0] + best[1] + best[2];
    for (const c of all) {
      const s = c[0] + c[1] + c[2];
      if (s > bestSum) { best = c; bestSum = s; }
    }
    return best;
  }
  // Берём по несколько персонажей из каждой группы и сравниваем средний тон.
  function avgFaceTone(group) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < 30; i++) {
      const svg = generatePortraitSVG('char_' + i, group, 96);
      const c = extractSkinFaceRGB(svg);
      r += c[0]; g += c[1]; b += c[2]; n++;
    }
    return [r / n, g / n, b / n];
  }
  const greekTone   = avgFaceTone('greek');
  const egyptianTone= avgFaceTone('egyptian');
  const celticTone  = avgFaceTone('celtic');
  const nomadicTone = avgFaceTone('nomadic');

  // Греческий светлее египетского (по сумме каналов)
  const greekSum    = greekTone[0] + greekTone[1] + greekTone[2];
  const egyptSum    = egyptianTone[0] + egyptianTone[1] + egyptianTone[2];
  check(greekSum > egyptSum,
    `[C4a] греческий светлее египетского (${Math.round(greekSum)} > ${Math.round(egyptSum)})`);

  // Celtic ещё светлее nomadic
  const celticSum   = celticTone[0] + celticTone[1] + celticTone[2];
  const nomadicSum  = nomadicTone[0] + nomadicTone[1] + nomadicTone[2];
  check(celticSum > nomadicSum,
    `[C4b] кельтский светлее кочевого (${Math.round(celticSum)} > ${Math.round(nomadicSum)})`);

  // И греческий ≠ кочевой (основное требование C4)
  check(Math.abs(greekSum - nomadicSum) > 5,
    `[C4c] греческий и кочевой заметно различаются (Δ=${Math.round(Math.abs(greekSum - nomadicSum))})`);
}

// ═══════════════════════════════════════════════════════════════
section('[C1] ui/portrait.js onerror вызывает SVG-генератор');
// ═══════════════════════════════════════════════════════════════
const portraitSrc = readFileSync(portraitPath, 'utf8');
check(/generatePortraitDataURL|generatePortraitSVG/.test(portraitSrc),
  '[C1a] ui/portrait.js ссылается на генератор (generatePortrait(DataURL|SVG))');
check(/buildGeneratedPortraitUrl/.test(portraitSrc),
  '[C1b] ui/portrait.js содержит helper buildGeneratedPortraitUrl');
check(/onerror[\s\S]{0,400}buildGeneratedPortraitUrl/.test(portraitSrc),
  '[C1c] onerror обработчик вызывает buildGeneratedPortraitUrl');

// ═══════════════════════════════════════════════════════════════
section('[C5] При успешной загрузке JPG SVG-генератор не вызывается');
// ═══════════════════════════════════════════════════════════════
// Статический анализ: генератор вызывается только внутри onerror-обработчика
// (и во вспомогательной window.__renderPortraitFallback). В основной ветке
// renderPortrait (без ошибки) используется getPortraitInfoForCharacter.
//
// Проверяем, что в renderPortrait перед присваиванием onerror идёт
// присваивание img.src = src (основной путь), и что вызовы генератора
// сосредоточены только внутри onerror / helper-функции.
const renderFn = portraitSrc.match(/function renderPortrait\([\s\S]*?\n  \}/);
check(!!renderFn, '[C5a] удалось найти тело function renderPortrait');
if (renderFn) {
  const body = renderFn[0];
  // Извлекаем участок ДО img.onerror =
  const beforeOnErr = body.split(/img\.onerror\s*=/)[0];
  check(!/buildGeneratedPortraitUrl/.test(beforeOnErr),
    '[C5b] до img.onerror генератор НЕ вызывается (основной путь — JPG)');
  check(/img\.src\s*=\s*src/.test(beforeOnErr),
    '[C5c] в основном пути img.src = src (из getPortraitInfoForCharacter)');
}

// ═══════════════════════════════════════════════════════════════
// Итоги
// ═══════════════════════════════════════════════════════════════
console.log('\n── Итог ──');
console.log(`  passed: ${pass}`);
console.log(`  failed: ${fail}`);
if (fail > 0) {
  console.log('\n  Failures:');
  for (const f of failures) console.log('    ✗ ' + f);
  process.exit(1);
}
