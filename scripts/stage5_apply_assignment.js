#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ЭТАП 5: Применение назначений к regions_data.js и nations.js
//
// Вход:  data/region_assignments.js
// Выход: data/regions_data.js (поле nation обновлено)
//        data/nations.js     (массив regions обновлён r-ID)
//
// Запуск: node scripts/stage5_apply_assignment.js
//         node scripts/stage5_apply_assignment.js --dry-run
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 DRY-RUN: изменения не сохраняются\n');

// ── Загрузка назначений ───────────────────────────────────────────
console.log('Загрузка data/region_assignments.js...');
const aCode = fs.readFileSync(path.join(ROOT, 'data', 'region_assignments.js'), 'utf8')
  .replace(/^var /mg, 'var ');
const as = vm.createContext({ console });
vm.runInContext(aCode, as);
const REGION_ASSIGNMENTS = as.REGION_ASSIGNMENTS;
console.log(`  Назначений: ${Object.keys(REGION_ASSIGNMENTS).length}`);

// ── Патч regions_data.js через текстовую замену ───────────────────
console.log('Загрузка data/regions_data.js...');
const regionsPath = path.join(ROOT, 'data', 'regions_data.js');
let regionsText = fs.readFileSync(regionsPath, 'utf8');

// Создаём резервную копию
const backupDir = path.join(ROOT, 'data', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
if (!DRY_RUN) {
  fs.copyFileSync(regionsPath, path.join(backupDir, `regions_data_${ts}.js`));
  console.log(`  Резервная копия: data/backups/regions_data_${ts}.js`);
}

// Патчим каждый регион: заменяем nation:'...' на nation:'<новая нация>'
let regChanged = 0;
let regSkipped = 0;

for (const [regionId, newNation] of Object.entries(REGION_ASSIGNMENTS)) {
  // Паттерн: R['r123']={nation:'old_value',...
  // Ищем блок региона и меняем nation внутри него
  const regionKey = regionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Находим нацию в этой записи (nation идёт первым полем)
  const pattern = new RegExp(
    `(R\\['${regionKey}'\\]\\s*=\\s*\\{[^}]{0,30}?nation\\s*:\\s*')([^']*)(')`,
    'g'
  );
  const newText = regionsText.replace(pattern, (m, pre, oldNation, post) => {
    if (oldNation === newNation) { regSkipped++; return m; }
    regChanged++;
    return `${pre}${newNation}${post}`;
  });

  regionsText = newText;
}

console.log(`  Изменено: ${regChanged} регионов, без изменений: ${regSkipped}`);

if (!DRY_RUN) {
  fs.writeFileSync(regionsPath, regionsText, 'utf8');
  console.log('  ✓ data/regions_data.js сохранён');
}

// ── Патч nations.js: заменяем regions массивы ─────────────────────
console.log('\nЗагрузка data/nations.js...');
const nationsPath = path.join(ROOT, 'data', 'nations.js');
let nationsText = fs.readFileSync(nationsPath, 'utf8');

if (!DRY_RUN) {
  fs.copyFileSync(nationsPath, path.join(backupDir, `nations_${ts}.js`));
  console.log(`  Резервная копия: data/backups/nations_${ts}.js`);
}

// Строим обратный индекс: nation → [r-IDs]
const nationToRegions = {};
for (const [regionId, nationId] of Object.entries(REGION_ASSIGNMENTS)) {
  if (nationId === 'neutral') continue;
  if (!regionId.match(/^r\d+$/)) continue;
  if (!nationToRegions[nationId]) nationToRegions[nationId] = [];
  nationToRegions[nationId].push(regionId);
}
for (const arr of Object.values(nationToRegions)) {
  arr.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
}

// Загружаем nations через vm чтобы проверить текущие regions
const nCode = nationsText.replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ns = vm.createContext({ console });
try { vm.runInContext(nCode, ns); } catch(e) { /* ignore */ }
const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};

let natChanged = 0;
const nationsLines = nationsText.split('\n');

for (const [nationId, newRegions] of Object.entries(nationToRegions)) {
  const nation = NATIONS[nationId];
  if (!nation) continue;

  const currentRegions = nation.regions ?? [];
  // Пропускаем если уже есть r-ID регионы (уже был предыдущий патч)
  const hasRIds = currentRegions.some(r => /^r\d+$/.test(r));
  if (hasRIds) continue;

  // Ищем строку с ключом нации: 2-4 пробела, id, ': {', конец строки
  // (чтобы не поймать nation в блоке relations: там после { есть content)
  const esc = nationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nationKeyRe = new RegExp(`^ {2,4}${esc}\\s*:\\s*\\{\\s*$`);
  const nationLineIdx = nationsLines.findIndex(l => nationKeyRe.test(l));
  if (nationLineIdx === -1) {
    console.log(`  ⚠ не найдена строка нации: ${nationId}`);
    continue;
  }

  // В следующих 200 строках ищем "regions: [...]"
  const regionsRe = /^(\s*regions\s*:\s*)\[([^\]]*)\]/;
  let patched = false;
  const searchEnd = Math.min(nationLineIdx + 200, nationsLines.length);
  for (let i = nationLineIdx + 1; i < searchEnd; i++) {
    const m = regionsRe.exec(nationsLines[i]);
    if (m) {
      const trailingComma = nationsLines[i].trimEnd().endsWith(',') ? ',' : '';
      nationsLines[i] = `${m[1]}${JSON.stringify(newRegions)}${trailingComma}`;
      patched = true;
      natChanged++;
      break;
    }
  }
  if (!patched) {
    console.log(`  ⚠ не удалось патчить nations.js для: ${nationId}`);
  }
}

nationsText = nationsLines.join('\n');

console.log(`  Изменено: ${natChanged} наций`);

if (!DRY_RUN) {
  fs.writeFileSync(nationsPath, nationsText, 'utf8');
  console.log('  ✓ data/nations.js сохранён');
}

// ── Итог ─────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
if (DRY_RUN) {
  console.log('DRY-RUN завершён. Убери --dry-run для применения.');
} else {
  console.log('✓ ЭТАП 5 ЗАВЕРШЁН');
  console.log(`  regions_data.js: изменено ${regChanged} регионов`);
  console.log(`  nations.js:      обновлено ${natChanged} наций`);
}
