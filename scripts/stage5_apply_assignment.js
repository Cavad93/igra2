#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ЭТАП 5: Применение назначений к regions_data.js и nations.js
//
// Вход:  data/region_assignments.js, data/regions_data.js,
//        data/nations.js, data/region_centroids.js
// Выход: data/regions_data.js (обновлён — поле nation)
//        data/nations.js     (обновлён — массив regions с r-ID)
//
// Что делает:
//   1. Для каждого назначения из region_assignments.js:
//      - В regions_data.js: устанавливает region.nation = nationId
//   2. В nations.js: заменяет пустые/символические arrays regions
//      на реальные r-ID из region_assignments.js
//   3. Создаёт резервную копию перед изменением
//
// ВАЖНО: Перед запуском убедись что stage4 прошёл без критических ошибок!
//
// Запуск: node scripts/stage5_apply_assignment.js
//         node scripts/stage5_apply_assignment.js --dry-run  (только отчёт)
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 РЕЖИМ DRY-RUN: изменения не сохраняются\n');

function loadVm(filePath, varName) {
  const code = fs.readFileSync(filePath, 'utf8').replace(/^var /mg, 'var ');
  const s = vm.createContext({ console });
  vm.runInContext(code, s);
  return s[varName];
}

// ── Загрузка данных ───────────────────────────────────────────────
console.log('Загрузка данных...');

const REGION_ASSIGNMENTS = loadVm(path.join(ROOT, 'data', 'region_assignments.js'), 'REGION_ASSIGNMENTS');
const REGION_CENTROIDS   = loadVm(path.join(ROOT, 'data', 'region_centroids.js'),   'REGION_CENTROIDS');

// Проверка наличия отчёта о валидации
const reportPath = path.join(ROOT, 'data', 'assignment_report.json');
if (!fs.existsSync(reportPath)) {
  console.warn('⚠ data/assignment_report.json не найден. Рекомендуется запустить stage4 сначала.');
} else {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const critErrors = report.issues?.filter(i =>
    i.type === 'NO_REGIONS' || i.type === 'OUT_OF_BBOX_TOTAL'
  ) ?? [];
  if (critErrors.length > 0) {
    console.warn(`\n⚠ В отчёте stage4 есть предупреждения (${critErrors.length} типов):`);
    for (const e of critErrors.slice(0, 5)) console.warn(`  - ${e.msg}`);
    console.warn('  Продолжаем всё равно...\n');
  }
}

// ── Загрузка regions_data.js (полный текст + объект) ─────────────
console.log('Загрузка data/regions_data.js...');
const regionsPath = path.join(ROOT, 'data', 'regions_data.js');
let regionsText = fs.readFileSync(regionsPath, 'utf8');

// Парсим через vm чтобы получить объект
const rdCode = regionsText.replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const rdSandbox = vm.createContext({ console });
vm.runInContext(rdCode, rdSandbox);
const REGIONS_DATA = rdSandbox.REGIONS_DATA ?? rdSandbox.regions ?? {};

if (Object.keys(REGIONS_DATA).length === 0) {
  console.error('REGIONS_DATA пуст или не найден. Проверь формат файла.');
  process.exit(1);
}
console.log(`  Регионов в REGIONS_DATA: ${Object.keys(REGIONS_DATA).length}`);

// ── Загрузка nations.js ───────────────────────────────────────────
console.log('Загрузка data/nations.js...');
const nationsPath = path.join(ROOT, 'data', 'nations.js');
const nCode = fs.readFileSync(nationsPath, 'utf8')
  .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ns = vm.createContext({ console });
vm.runInContext(nCode, ns);
const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};
console.log(`  Наций: ${Object.keys(NATIONS).length}`);

// ── Построение обратного индекса нация → [r-IDs] ─────────────────
const nationToRegions = {};
for (const [regionId, nationId] of Object.entries(REGION_ASSIGNMENTS)) {
  if (nationId === 'neutral') continue;
  if (!regionId.match(/^r\d+$/)) continue;  // Только r-формат
  if (!nationToRegions[nationId]) nationToRegions[nationId] = [];
  nationToRegions[nationId].push(regionId);
}

// Сортировка по числовому ID для стабильности
for (const arr of Object.values(nationToRegions)) {
  arr.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
}

// ── Статистика изменений ──────────────────────────────────────────
const changesRegions = [];  // {regionId, oldNation, newNation}
const changesNations = [];  // {nationId, oldCount, newCount}

// Считаем что изменится в REGIONS_DATA
for (const [regionId, nationId] of Object.entries(REGION_ASSIGNMENTS)) {
  const r = REGIONS_DATA[regionId];
  if (!r) continue;
  const oldNation = r.nation ?? 'neutral';
  if (oldNation !== nationId) {
    changesRegions.push({ regionId, oldNation, newNation: nationId });
  }
}

// Считаем что изменится в nations.js
for (const [nationId, newRegions] of Object.entries(nationToRegions)) {
  const n = NATIONS[nationId];
  if (!n) continue;
  const oldRegions = n.regions ?? [];
  const hasRIds = oldRegions.some(r => /^r\d+$/.test(r));
  if (!hasRIds) {
    changesNations.push({ nationId, oldCount: oldRegions.length, newCount: newRegions.length });
  }
}

console.log('\n' + '═'.repeat(60));
console.log('ПЛАН ИЗМЕНЕНИЙ');
console.log('═'.repeat(60));
console.log(`regions_data.js: будет изменено nation у ${changesRegions.length} регионов`);
console.log(`nations.js:      будет обновлён массив regions у ${changesNations.length} наций`);

// Показываем примеры
if (changesRegions.length > 0) {
  console.log('\nПримеры изменений в regions_data.js (первые 10):');
  for (const c of changesRegions.slice(0, 10)) {
    const ctr = REGION_CENTROIDS[c.regionId];
    const loc = ctr ? `[${ctr.lat?.toFixed(1)},${ctr.lon?.toFixed(1)}]` : '';
    console.log(`  ${c.regionId} ${loc}: ${c.oldNation} → ${c.newNation}`);
  }
}

if (changesNations.length > 0) {
  console.log('\nОбновление массивов regions в nations.js (первые 10):');
  for (const c of changesNations.slice(0, 10)) {
    console.log(`  ${c.nationId}: ${c.oldCount} символьных → ${c.newCount} r-ID`);
  }
}

if (DRY_RUN) {
  console.log('\n[DRY-RUN] Изменения не применены. Убери --dry-run для применения.');
  process.exit(0);
}

// ── Создание резервных копий ──────────────────────────────────────
const backupDir = path.join(ROOT, 'data', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const regBackup = path.join(backupDir, `regions_data_${ts}.js`);
const natBackup = path.join(backupDir, `nations_${ts}.js`);

fs.copyFileSync(regionsPath, regBackup);
fs.copyFileSync(nationsPath, natBackup);
console.log(`\n✓ Резервные копии: data/backups/regions_data_${ts}.js`);
console.log(`✓ Резервные копии: data/backups/nations_${ts}.js`);

// ── Применение изменений к REGIONS_DATA ──────────────────────────
console.log('\nПрименение изменений в regions_data.js...');
let regChanged = 0;

for (const [regionId, nationId] of Object.entries(REGION_ASSIGNMENTS)) {
  const r = REGIONS_DATA[regionId];
  if (!r) continue;
  if ((r.nation ?? 'neutral') !== nationId) {
    r.nation = nationId;
    regChanged++;
  }
}

// ── Применение изменений к NATIONS ───────────────────────────────
console.log('Применение изменений в nations.js...');
let natChanged = 0;

for (const [nationId, newRegions] of Object.entries(nationToRegions)) {
  const n = NATIONS[nationId];
  if (!n) continue;
  const oldRegions = n.regions ?? [];
  // Заменяем только если у нации нет r-ID регионов ещё
  const hasRIds = oldRegions.some(r => /^r\d+$/.test(r));
  if (!hasRIds) {
    n.regions = newRegions;
    natChanged++;
  }
}

// ── Сериализация и запись regions_data.js ────────────────────────
console.log('Запись data/regions_data.js...');

// Читаем оригинальный файл чтобы сохранить структуру
// regions_data.js может быть большим (>100MB), поэтому пишем его полностью
const newRegionsContent = generateRegionsDataFile(REGIONS_DATA);
fs.writeFileSync(regionsPath, newRegionsContent, 'utf8');

// ── Сериализация и запись nations.js ─────────────────────────────
console.log('Запись data/nations.js...');
const nationsOriginal = fs.readFileSync(natBackup, 'utf8');
const newNationsContent = patchNationsFile(nationsOriginal, nationToRegions, NATIONS);
fs.writeFileSync(nationsPath, newNationsContent, 'utf8');

// ── Итог ─────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('✓ ЭТАП 5 ЗАВЕРШЁН');
console.log('═'.repeat(60));
console.log(`Изменено в regions_data.js: ${regChanged} регионов`);
console.log(`Изменено в nations.js:      ${natChanged} наций`);
console.log(`\nФайл: data/regions_data.js`);
console.log(`Файл: data/nations.js`);
console.log('\nПроверка: можно запустить stage4 снова для контроля качества');

// ═══════════════════════════════════════════════════════════════════
// Вспомогательные функции генерации файлов
// ═══════════════════════════════════════════════════════════════════

function generateRegionsDataFile(data) {
  return `// AUTO-UPDATED by scripts/stage5_apply_assignment.js
// Данные регионов с обновлёнными полями nation

var REGIONS_DATA = ${JSON.stringify(data, null, 2)};
`;
}

function patchNationsFile(originalContent, nationToRegions, nations) {
  // Стратегия: заменяем строки с `"regions": [...]` для каждой нации
  // Используем JSON-сериализацию через INITIAL_GAME_STATE
  // Безопасная замена: сначала строим новый INITIAL_GAME_STATE

  // Модифицируем объект nations (уже сделано выше через n.regions = newRegions)
  // Ищем в тексте шаблон: "regions": [...] для каждой нации и заменяем

  let content = originalContent;

  for (const [nationId, newRegions] of Object.entries(nationToRegions)) {
    const n = nations[nationId];
    if (!n) continue;
    const oldRegions = n.regions ?? [];
    const hasRIds = oldRegions.some(r => /^r\d+$/.test(r));
    if (hasRIds) continue;  // Уже имеет r-ID — не трогаем

    // Сериализуем новый массив
    const newRegionsJson = JSON.stringify(newRegions);

    // Ищем блок нации в тексте и заменяем поле regions
    // Паттерн: "regions": [ ... ]  (может быть многострочным)
    // Используем упрощённый поиск: ищем nationId в контексте и потом regions
    const nationPattern = new RegExp(
      `("${nationId}"\\s*:\\s*\\{[^}]{0,500}?"regions"\\s*:\\s*)\\[[^\\]]*\\]`,
      'ms'
    );
    const newContent = content.replace(nationPattern, `$1${newRegionsJson}`);

    if (newContent !== content) {
      content = newContent;
    } else {
      // Fallback: ищем просто "regions": [] рядом с nation ID
      // (если структура не подходит — пропускаем)
      console.warn(`  ⚠ Не удалось патчить nations.js для ${nationId} через regex`);
    }
  }

  return content;
}
