// Тесты Шага 70 (arma.md) — Met Museum: Гандхарская скульптура (индийская группа)
// и греко-римские бюсты.
// Запуск: node tests/test_arma_stage70.mjs
//
// Чеклист из arma.md Шаг 70:
//   [1] ls assets/portraits/indian/ | wc -l  ≥ 15
//   [2] ls assets/portraits/greek/  | wc -l  ≥ 25
//   [3] ls assets/portraits/roman/  | wc -l  ≥ 20
//
// Дополнительно проверяем:
//   [4] manifest.json содержит новые записи Шага 70 (indian/greek/roman)
//   [5] Все JPG в целевых папках — валидный JPEG (первые байты FF D8 FF)
//   [6] Новые URL из манифеста указывают на CC0-источники (Met/CMA)
//   [7] bash assets/download.sh завершается без FAIL (exit 0)

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; failures.push(name); console.log('  ✗ ' + name); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

function countJpgs(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return 0;
  return readdirSync(abs).filter(f => /\.jpe?g$/i.test(f)).length;
}

function isJpeg(absPath) {
  try {
    const buf = readFileSync(absPath);
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
section('[1] assets/portraits/indian/ ≥ 15 JPG');
// ═══════════════════════════════════════════════════════════════

const nIndian = countJpgs('assets/portraits/indian');
check(nIndian >= 15, `[1a] indian JPG count (${nIndian}) ≥ 15`);

// ═══════════════════════════════════════════════════════════════
section('[2] assets/portraits/greek/ ≥ 25 JPG');
// ═══════════════════════════════════════════════════════════════

const nGreek = countJpgs('assets/portraits/greek');
check(nGreek >= 25, `[2a] greek JPG count (${nGreek}) ≥ 25`);

// ═══════════════════════════════════════════════════════════════
section('[3] assets/portraits/roman/ ≥ 20 JPG');
// ═══════════════════════════════════════════════════════════════

const nRoman = countJpgs('assets/portraits/roman');
check(nRoman >= 20, `[3a] roman JPG count (${nRoman}) ≥ 20`);

// ═══════════════════════════════════════════════════════════════
section('[4] manifest.json содержит новые записи Шага 70');
// ═══════════════════════════════════════════════════════════════

const manifestPath = join(root, 'assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
check(Array.isArray(manifest.assets), '[4a] manifest.assets — массив');
check(manifest.assets.length >= 100, `[4b] manifest.assets.length (${manifest.assets.length}) ≥ 100`);

const byFile = new Map(manifest.assets.map(a => [a.filename, a]));

// Новые записи Шага 70 — indian (минимум 6 новых)
const newIndian = [
  'assets/portraits/indian/cma115946.jpg',
  'assets/portraits/indian/cma154769.jpg',
  'assets/portraits/indian/cma147820.jpg',
  'assets/portraits/indian/cma155376.jpg',
  'assets/portraits/indian/cma143679.jpg',
  'assets/portraits/indian/cma143680.jpg',
];
for (const f of newIndian) {
  check(byFile.has(f), `[4c] manifest has ${f}`);
}

// Новые записи Шага 70 — greek (минимум 7 новых мраморных голов)
const newGreek = [
  'assets/portraits/greek/cma107057.jpg',
  'assets/portraits/greek/cma104604.jpg',
  'assets/portraits/greek/cma119018.jpg',
  'assets/portraits/greek/cma110525.jpg',
  'assets/portraits/greek/cma111501.jpg',
  'assets/portraits/greek/cma148039.jpg',
  'assets/portraits/greek/cma104960.jpg',
];
for (const f of newGreek) {
  check(byFile.has(f), `[4d] manifest has ${f}`);
}

// Новые записи Шага 70 — roman (минимум 5 новых бюстов)
const newRoman = [
  'assets/portraits/roman/cma108313.jpg',
  'assets/portraits/roman/cma108314.jpg',
  'assets/portraits/roman/cma108529.jpg',
  'assets/portraits/roman/cma108168.jpg',
  'assets/portraits/roman/cma128953.jpg',
];
for (const f of newRoman) {
  check(byFile.has(f), `[4e] manifest has ${f}`);
}

// ═══════════════════════════════════════════════════════════════
section('[5] Все JPG в целевых папках — валидные JPEG-файлы');
// ═══════════════════════════════════════════════════════════════

for (const dir of ['assets/portraits/indian', 'assets/portraits/greek', 'assets/portraits/roman']) {
  const abs = join(root, dir);
  if (!existsSync(abs)) { check(false, `[5] ${dir}: папка не существует`); continue; }
  const files = readdirSync(abs).filter(f => /\.jpe?g$/i.test(f));
  let bad = 0;
  for (const f of files) {
    if (!isJpeg(join(abs, f))) bad++;
  }
  check(bad === 0, `[5a] ${dir}: ${files.length} JPG, битых: ${bad}`);
}

// Проверяем, что все новые файлы существуют и имеют размер > 10 KB
// (CMA web-превью редко бывают меньше этого порога).
for (const f of [...newIndian, ...newGreek, ...newRoman]) {
  const abs = join(root, f);
  let ok = false, size = 0;
  if (existsSync(abs)) {
    size = statSync(abs).size;
    ok = size > 10 * 1024;
  }
  check(ok, `[5b] ${f}: exists & >10KB (got ${size}B)`);
}

// ═══════════════════════════════════════════════════════════════
section('[6] CC0-источники (Met/CMA) для новых записей');
// ═══════════════════════════════════════════════════════════════

const CC0_HOSTS = [
  'openaccess-cdn.clevelandart.org',
  'collectionapi.metmuseum.org',
  'images.metmuseum.org',
];
for (const f of [...newIndian, ...newGreek, ...newRoman]) {
  const rec = byFile.get(f);
  const src = rec?.source || '';
  const lic = rec?.license || '';
  const host = (() => { try { return new URL(src).host; } catch { return ''; } })();
  const hostOk = CC0_HOSTS.some(h => host.endsWith(h));
  const licOk = /CC0/i.test(lic);
  check(hostOk && licOk, `[6] ${f}: host=${host}, license=${lic}`);
}

// ═══════════════════════════════════════════════════════════════
section('[7] bash assets/download.sh завершается без ошибок');
// ═══════════════════════════════════════════════════════════════

let downloadOk = false;
let downloadOut = '';
try {
  downloadOut = execSync('bash assets/download.sh', {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
  downloadOk = true;
} catch (e) {
  downloadOk = false;
  downloadOut = (e.stdout || '').toString() + (e.stderr || '').toString();
}
check(downloadOk, '[7a] download.sh exit 0');
check(!/\bFAIL\b/.test(downloadOut), '[7b] download.sh stdout не содержит FAIL');

// ═══════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────');
console.log(`Шаг 70: passed ${pass}, failed ${fail}`);
if (fail > 0) {
  console.log('Провалы:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
