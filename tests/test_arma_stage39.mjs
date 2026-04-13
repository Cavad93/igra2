// Тесты Шага 39 (arma.md) — Анимированные маркеры армий
// Запуск: node tests/test_arma_stage39.mjs
//
// Чеклист из arma.md Шаг 39:
//   [1] JS: функция createArmyIcon(army, nationColor) → L.divIcon.
//       - размер зависит от численности (size 24/30/36)
//       - используется --nc (цвет нации) в инлайн-стиле
//       - <svg viewBox="0 0 24 24" fill="${nationColor}">
//       - 5-конечная звезда (путь из arma.md)
//       - <span class="army-count">...</span>
//   [2] CSS .army-marker: drop-shadow, flex column, cursor pointer,
//       transition transform .15s.
//   [3] CSS :hover → scale(1.15).
//   [4] CSS .army-selected → drop-shadow(0 0 6px var(--nc)) + animation army-pulse.
//       @keyframes army-pulse { opacity 1 → 0.6 → 1 }.
//   [5] CSS .army-count: стили (font-size 9px, background rgba(0,0,0,0.65),
//       padding, border-radius, font-family Georgia).
//   [6] JS: formatArmySize(n) → "4.2k" для >=1000, "800" для <1000.
//   [7] JS: renderArmyMarker использует createArmyIcon.
//   [8] JS: smoothMoveArmyMarker/motion fallback — setInterval или
//       requestAnimationFrame для плавного перемещения.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const armiesSrc = readFileSync(resolve(__dirname, '..', 'ui', 'map_armies.js'), 'utf8');
const htmlSrc   = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────────────────────
section('[1] createArmyIcon — функция + SVG + цвет нации');
// ─────────────────────────────────────────────────────────────
const createFnMatch = armiesSrc.match(
  /function\s+createArmyIcon\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!createFnMatch, '[1a] функция createArmyIcon определена');

const createBody = createFnMatch ? createFnMatch[0] : '';
check(/L\.divIcon\s*\(/.test(createBody),
  '[1b] createArmyIcon возвращает L.divIcon');
check(/--nc\s*:\s*\$\{nationColor\}/.test(createBody),
  '[1c] createArmyIcon использует CSS-переменную --nc с цветом нации');
check(/viewBox="0 0 24 24"/.test(createBody),
  '[1d] SVG имеет viewBox="0 0 24 24"');
check(/fill="\$\{nationColor\}"/.test(createBody),
  '[1e] SVG заливается цветом нации (fill="${nationColor}")');

// Размер зависит от численности (24/30/36)
check(/size\s*=.*>\s*5000\s*\?\s*36/.test(createBody) &&
      />\s*1000\s*\?\s*30/.test(createBody),
  '[1f] размер маркера: 36 / 30 / 24 в зависимости от силы армии');

// width/height в инлайн-стиле
check(/width\s*:\s*\$\{size\}px/.test(createBody) &&
      /height\s*:\s*\$\{size\}px/.test(createBody),
  '[1g] width/height маркера задаются через size');

// iconSize / iconAnchor
check(/iconSize\s*:\s*\[\s*size\s*,\s*size\s*\+\s*14\s*\]/.test(createBody),
  '[1h] iconSize: [size, size+14]');
check(/iconAnchor\s*:\s*\[\s*size\s*\/\s*2\s*,\s*size\s*\/\s*2\s*\]/.test(createBody),
  '[1i] iconAnchor: [size/2, size/2]');

// Путь 5-конечной звезды из arma.md
check(/M12\s*2L15\s*9H22L16\.5\s*13\.5L18\.5\s*21L12\s*17L5\.5\s*21L7\.5\s*13\.5L2\s*9H9Z/.test(armiesSrc),
  '[1j] путь 5-конечной звезды присутствует в коде');

check(/class="army-count"/.test(createBody),
  '[1k] <span class="army-count"> внутри маркера');

// ─────────────────────────────────────────────────────────────
section('[2] CSS .army-marker — layout, drop-shadow, transition');
// ─────────────────────────────────────────────────────────────
const amBlockMatch = htmlSrc.match(/\.army-marker\s*\{([\s\S]*?)\}/);
const amBlock = amBlockMatch ? amBlockMatch[1] : '';
check(!!amBlockMatch, '[2a] CSS блок .army-marker найден');
check(/position:\s*relative/.test(amBlock),
  '[2b] .army-marker { position: relative }');
check(/display:\s*flex/.test(amBlock),
  '[2c] .army-marker { display: flex }');
check(/flex-direction:\s*column/.test(amBlock),
  '[2d] .army-marker { flex-direction: column }');
check(/align-items:\s*center/.test(amBlock),
  '[2e] .army-marker { align-items: center }');
check(/filter:\s*drop-shadow\(\s*0\s+2px\s+4px\s+rgba\(0,\s*0,\s*0,\s*0\.5\)\s*\)/.test(amBlock),
  '[2f] .army-marker { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)) }');
check(/transition:\s*transform\s+0\.15s/.test(amBlock),
  '[2g] .army-marker { transition: transform 0.15s }');
check(/cursor:\s*pointer/.test(amBlock),
  '[2h] .army-marker { cursor: pointer }');

// ─────────────────────────────────────────────────────────────
section('[3] CSS hover: scale(1.15)');
// ─────────────────────────────────────────────────────────────
check(/\.army-marker:hover\s*\{[^}]*transform:\s*scale\(\s*1\.15\s*\)/.test(htmlSrc),
  '[3a] .army-marker:hover { transform: scale(1.15) }');

// ─────────────────────────────────────────────────────────────
section('[4] CSS .army-selected + @keyframes army-pulse');
// ─────────────────────────────────────────────────────────────
check(/\.army-selected\s[^{]*\{[\s\S]*?filter:\s*drop-shadow\(\s*0\s+0\s+6px\s+var\(--nc\)\s*\)/.test(htmlSrc),
  '[4a] .army-selected использует drop-shadow(0 0 6px var(--nc))');
check(/\.army-selected\s[^{]*\{[\s\S]*?animation:\s*army-pulse\s+1\.2s\s+ease-in-out\s+infinite/.test(htmlSrc),
  '[4b] .army-selected { animation: army-pulse 1.2s ease-in-out infinite }');
check(/@keyframes\s+army-pulse\s*\{[\s\S]*?opacity:\s*1[\s\S]*?opacity:\s*0\.6/.test(htmlSrc),
  '[4c] @keyframes army-pulse { opacity 1 → 0.6 → 1 }');

// ─────────────────────────────────────────────────────────────
section('[5] CSS .army-count стили');
// ─────────────────────────────────────────────────────────────
const acMatch = htmlSrc.match(/\.army-count\s*\{([\s\S]*?)\}/);
const acBlock = acMatch ? acMatch[1] : '';
check(!!acMatch, '[5a] CSS блок .army-count найден');
check(/font-size:\s*9px/.test(acBlock),
  '[5b] .army-count { font-size: 9px }');
check(/color:\s*#fff/.test(acBlock),
  '[5c] .army-count { color: #fff }');
check(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.65\)/.test(acBlock),
  '[5d] .army-count { background: rgba(0,0,0,0.65) }');
check(/padding:\s*0\s+3px/.test(acBlock),
  '[5e] .army-count { padding: 0 3px }');
check(/border-radius:\s*3px/.test(acBlock),
  '[5f] .army-count { border-radius: 3px }');
check(/font-family:\s*['"]Georgia['"]/.test(acBlock),
  '[5g] .army-count { font-family: "Georgia", serif }');
check(/white-space:\s*nowrap/.test(acBlock),
  '[5h] .army-count { white-space: nowrap }');

// ─────────────────────────────────────────────────────────────
section('[6] formatArmySize(n)');
// ─────────────────────────────────────────────────────────────
const fmtFnMatch = armiesSrc.match(
  /function\s+formatArmySize\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!fmtFnMatch, '[6a] функция formatArmySize определена');
const fmtBody = fmtFnMatch ? fmtFnMatch[0] : '';
check(/1000/.test(fmtBody),
  '[6b] formatArmySize обрабатывает порог 1000');
check(/['"`]k['"`]/.test(fmtBody),
  '[6c] formatArmySize выводит суффикс "k" для тысяч');

// Runtime evaluation: создаём мини-sandbox с функцией
{
  // Извлекаем только функцию formatArmySize и оценим её
  const m = armiesSrc.match(/function\s+formatArmySize\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (m) {
    const fn = new Function(`${m[0]}; return formatArmySize;`)();
    check(fn(4200) === '4.2k',       `[6d] formatArmySize(4200) === "4.2k" (got: ${fn(4200)})`);
    check(fn(800)  === '800',        `[6e] formatArmySize(800)  === "800"  (got: ${fn(800)})`);
    check(fn(1000) === '1k',         `[6f] formatArmySize(1000) === "1k"   (got: ${fn(1000)})`);
    check(fn(12500) === '12.5k',     `[6g] formatArmySize(12500) === "12.5k" (got: ${fn(12500)})`);
    check(fn(0)    === '0',          `[6h] formatArmySize(0)    === "0"`);
  } else {
    check(false, '[6d-h] не удалось извлечь formatArmySize для runtime-тестов');
  }
}

// ─────────────────────────────────────────────────────────────
section('[7] _renderArmyMarker использует createArmyIcon');
// ─────────────────────────────────────────────────────────────
const rMatch = armiesSrc.match(
  /function\s+_renderArmyMarker\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
const rBody = rMatch ? rMatch[0] : '';
check(!!rMatch, '[7a] функция _renderArmyMarker найдена');
check(/createArmyIcon\s*\(/.test(rBody),
  '[7b] _renderArmyMarker вызывает createArmyIcon(...)');
check(/selected\s*:/.test(rBody),
  '[7c] _renderArmyMarker передаёт флаг selected в createArmyIcon');

// ─────────────────────────────────────────────────────────────
section('[8] smoothMoveArmyMarker — плавное перемещение (rAF/интервал)');
// ─────────────────────────────────────────────────────────────
const smMatch = armiesSrc.match(
  /function\s+smoothMoveArmyMarker\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/
);
check(!!smMatch, '[8a] функция smoothMoveArmyMarker определена');
const smBody = smMatch ? smMatch[0] : '';
check(/setLatLng\s*\(/.test(smBody),
  '[8b] smoothMoveArmyMarker вызывает marker.setLatLng(...)');
check(/requestAnimationFrame\s*\(|setInterval\s*\(/.test(smBody),
  '[8c] smoothMoveArmyMarker использует requestAnimationFrame или setInterval');
check(/L\.motion|marker\.motion/.test(smBody),
  '[8d] smoothMoveArmyMarker имеет ветку для плагина Leaflet.Motion (motion(...))');
// интерполяция from → to
check(/fLat\s*\+\s*\(\s*tLat\s*-\s*fLat\s*\)|lerp|interpolate/.test(smBody),
  '[8e] интерполяция между fromLatLng и toLatLng');

// ─────────────────────────────────────────────────────────────
section('[E] Дополнительно: типы войск и армия игрока');
// ─────────────────────────────────────────────────────────────
// Предикаты по типам иконок (infantry/cavalry/archers/naval)
check(/_ARMY_TYPE_PATHS\s*=/.test(armiesSrc) || /'infantry'|'cavalry'|'archers'|'naval'/.test(armiesSrc),
  '[E1] определены пути SVG для разных типов войск');
check(/_dominantUnitType\s*\(/.test(armiesSrc),
  '[E2] функция _dominantUnitType для выбора иконки');
check(/army-marker--player/.test(armiesSrc),
  '[E3] класс army-marker--player для армий игрока (золотая обводка)');

// ─────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`Итого: ${pass} passed / ${fail} failed`);
if (fail > 0) {
  console.log('Упавшие тесты:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
