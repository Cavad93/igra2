// Тесты Шага 71 (arma.md) — Met Museum: египетские портреты + Wikimedia PD
// для карфагенской, персидской, кельтской, кочевой групп.
// Запуск: node tests/test_arma_stage71.mjs
//
// Чеклист из arma.md Шаг 71:
//   [1] Все 10 папок assets/portraits/*/ содержат ≥ 6 записей в манифесте
//       (культурные группы: greek, roman, egyptian, persian, celtic,
//        indian, east_asian, nomadic, carthaginian, generic)
//   [2] jq '.assets | length' assets/manifest.json ≥ 150
//   [3] bash assets/download.sh проходит без единого FAIL
//
// Дополнительно проверяем:
//   [4] Новые записи Шага 71 присутствуют в манифесте (перекрывающие
//       ключевые дополнения: egyptian/persian/carthaginian/celtic/
//       nomadic/east_asian/generic)
//   [5] Все новые URL указывают на CC0-источники (Met / CMA)
//   [6] Все 10 папок существуют как целевые в манифесте (≥6 записей)

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

const manifestPath = join(root, 'assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const byFile = new Map(manifest.assets.map(a => [a.filename, a]));

// Портреты, сгруппированные по культурной папке
const portraitsByGroup = {};
for (const a of manifest.assets) {
  if (!a.filename?.startsWith('assets/portraits/')) continue;
  const parts = a.filename.split('/');
  if (parts.length < 4) continue; // пропускаем placeholder
  const g = parts[2];
  (portraitsByGroup[g] ||= []).push(a);
}

// ═══════════════════════════════════════════════════════════════
section('[1] 10 папок assets/portraits/*/ содержат ≥ 6 записей');
// ═══════════════════════════════════════════════════════════════

const REQUIRED_GROUPS = [
  'greek', 'roman', 'egyptian', 'persian', 'celtic',
  'indian', 'east_asian', 'nomadic', 'carthaginian', 'generic',
];
for (const g of REQUIRED_GROUPS) {
  const n = (portraitsByGroup[g] || []).length;
  check(n >= 6, `[1] ${g} (${n}) ≥ 6`);
}

// ═══════════════════════════════════════════════════════════════
section('[2] manifest.assets.length ≥ 150');
// ═══════════════════════════════════════════════════════════════

check(manifest.assets.length >= 150,
  `[2a] manifest.assets.length (${manifest.assets.length}) ≥ 150`);

// ═══════════════════════════════════════════════════════════════
section('[4] Новые записи Шага 71 присутствуют');
// ═══════════════════════════════════════════════════════════════

const NEW_FILES = [
  // egyptian — Met Museum + CMA (step 71 core)
  'assets/portraits/egyptian/met244464.jpg',
  'assets/portraits/egyptian/met549358.jpg',
  'assets/portraits/egyptian/met543869.jpg',
  'assets/portraits/egyptian/met544864.jpg',
  'assets/portraits/egyptian/cma130133.jpg',
  'assets/portraits/egyptian/cma136482.jpg',
  'assets/portraits/egyptian/cma101365.jpg',
  'assets/portraits/egyptian/cma149594.jpg',
  'assets/portraits/egyptian/cma145925.jpg',

  // persian (через CMA: Ахемениды + Сасаниды)
  'assets/portraits/persian/cma123022.jpg',
  'assets/portraits/persian/cma136287.jpg',
  'assets/portraits/persian/cma137336.jpg',
  'assets/portraits/persian/cma136657.jpg',
  'assets/portraits/persian/cma139447.jpg',
  'assets/portraits/persian/cma138361.jpg',
  'assets/portraits/persian/cma138362.jpg',
  'assets/portraits/persian/cma141156.jpg',

  // carthaginian (Punic coins + Phoenician ivories)
  'assets/portraits/carthaginian/cma98310.jpg',
  'assets/portraits/carthaginian/cma98308.jpg',
  'assets/portraits/carthaginian/cma98309.jpg',
  'assets/portraits/carthaginian/cma144162.jpg',
  'assets/portraits/carthaginian/cma144137.jpg',
  'assets/portraits/carthaginian/cma144170.jpg',
  'assets/portraits/carthaginian/cma144148.jpg',
  'assets/portraits/carthaginian/cma111499.jpg',

  // celtic (coins, fibula, brooches)
  'assets/portraits/celtic/cma144339.jpg',
  'assets/portraits/celtic/cma144888.jpg',
  'assets/portraits/celtic/cma144323.jpg',
  'assets/portraits/celtic/cma111705.jpg',
  'assets/portraits/celtic/cma111703.jpg',
  'assets/portraits/celtic/cma111707.jpg',
  'assets/portraits/celtic/cma111706.jpg',
  'assets/portraits/celtic/cma111704.jpg',
  'assets/portraits/celtic/cma156288.jpg',

  // nomadic (scythian + ordos)
  'assets/portraits/nomadic/cma153314.jpg',
  'assets/portraits/nomadic/cma154261.jpg',
  'assets/portraits/nomadic/cma138614.jpg',
  'assets/portraits/nomadic/cma129223.jpg',
  'assets/portraits/nomadic/cma135558.jpg',

  // east_asian (Tang court figures + Han)
  'assets/portraits/east_asian/cma151403.jpg',
  'assets/portraits/east_asian/cma151414.jpg',
  'assets/portraits/east_asian/cma137280.jpg',
  'assets/portraits/east_asian/cma132819.jpg',
  'assets/portraits/east_asian/cma145350.jpg',
  'assets/portraits/east_asian/cma145339.jpg',
  'assets/portraits/east_asian/cma140232.jpg',
  'assets/portraits/east_asian/cma153596.jpg',

  // generic (6 neutral faces)
  'assets/portraits/generic/cma107057.jpg',
  'assets/portraits/generic/cma104604.jpg',
  'assets/portraits/generic/cma119018.jpg',
  'assets/portraits/generic/cma110525.jpg',
  'assets/portraits/generic/cma108313.jpg',
  'assets/portraits/generic/cma108314.jpg',
];

for (const f of NEW_FILES) {
  check(byFile.has(f), `[4] manifest has ${f}`);
}

// ═══════════════════════════════════════════════════════════════
section('[5] CC0-источники (Met/CMA) для всех новых записей');
// ═══════════════════════════════════════════════════════════════

const CC0_HOSTS = [
  'openaccess-cdn.clevelandart.org',
  'collectionapi.metmuseum.org',
  'images.metmuseum.org',
];
let badHost = 0, badLic = 0;
for (const f of NEW_FILES) {
  const rec = byFile.get(f);
  if (!rec) continue;
  const src = rec.source || '';
  const lic = rec.license || '';
  const host = (() => { try { return new URL(src).host; } catch { return ''; } })();
  const hostOk = CC0_HOSTS.some(h => host.endsWith(h));
  const licOk = /CC0/i.test(lic);
  if (!hostOk) badHost++;
  if (!licOk) badLic++;
}
check(badHost === 0, `[5a] все ${NEW_FILES.length} новых URL — CC0-хосты (bad=${badHost})`);
check(badLic === 0, `[5b] все ${NEW_FILES.length} новых записей имеют license CC0 (bad=${badLic})`);

// ═══════════════════════════════════════════════════════════════
section('[7] bash assets/download.sh завершается без FAIL');
// ═══════════════════════════════════════════════════════════════

let downloadOk = false;
let downloadOut = '';
try {
  downloadOut = execSync('bash assets/download.sh', {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5 * 60 * 1000,
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
console.log(`Шаг 71: passed ${pass}, failed ${fail}`);
if (fail > 0) {
  console.log('Провалы:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
