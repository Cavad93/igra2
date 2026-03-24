#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ЭТАП 3: Назначение регионов нациям по географическим bbox
//
// Вход:  data/region_centroids.js, data/nation_geo.js
// Выход: data/region_assignments.js
//
// Алгоритм:
//   1. Для каждого нейтрального региона (in_historical_world=true)
//      найти все нации, чей bbox/polygons содержит центроид региона
//   2. Если несколько кандидатов — выбрать с наименьшим priority
//      (меньше = более специфичная нация, выигрывает у империи)
//   3. Если нет кандидатов — оставить neutral
//   4. Регионы уже принадлежащие нации (не neutral) — не трогать
//
// Запуск: node scripts/stage3_assign_regions.js
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Загрузка region_centroids.js ──────────────────────────────────
console.log('Загрузка data/region_centroids.js...');
const cCode = fs.readFileSync(path.join(ROOT, 'data', 'region_centroids.js'), 'utf8')
  .replace(/^var /mg, 'var ');
const cs = vm.createContext({ console });
vm.runInContext(cCode, cs);
const REGION_CENTROIDS = cs.REGION_CENTROIDS;

if (!REGION_CENTROIDS) {
  console.error('REGION_CENTROIDS не найден. Запусти stage1_gen_centroids.js');
  process.exit(1);
}
console.log(`  Регионов: ${Object.keys(REGION_CENTROIDS).length}`);

// ── Загрузка nation_geo.js ────────────────────────────────────────
console.log('Загрузка data/nation_geo.js...');
const geoPath = path.join(ROOT, 'data', 'nation_geo.js');
if (!fs.existsSync(geoPath)) {
  console.error('nation_geo.js не найден. Запусти stage2_gen_nation_geo.js');
  process.exit(1);
}
const gCode = fs.readFileSync(geoPath, 'utf8').replace(/^var /mg, 'var ');
const gs = vm.createContext({ console });
vm.runInContext(gCode, gs);
const NATION_GEO = gs.NATION_GEO;

if (!NATION_GEO) {
  console.error('NATION_GEO не найден в nation_geo.js');
  process.exit(1);
}
const geoCount = Object.keys(NATION_GEO).length;
console.log(`  Наций с геоданными: ${geoCount}`);

// ── Загрузка текущих назначений (если есть — resume) ──────────────
const OUT_PATH = path.join(ROOT, 'data', 'region_assignments.js');
let existing = {};
if (fs.existsSync(OUT_PATH)) {
  try {
    const ec = fs.readFileSync(OUT_PATH, 'utf8').replace(/^var /mg, 'var ');
    const es = vm.createContext({ console });
    vm.runInContext(ec, es);
    existing = es.REGION_ASSIGNMENTS ?? {};
    console.log(`  Уже назначено: ${Object.keys(existing).length} регионов`);
  } catch { existing = {}; }
}

// ── Проверка: входит ли точка в bbox ─────────────────────────────
function inBbox(lat, lon, bbox) {
  return lat >= bbox.latMin && lat <= bbox.latMax &&
         lon >= bbox.lonMin && lon <= bbox.lonMax;
}

// ── Найти нации-кандидаты для региона ────────────────────────────
function findCandidates(lat, lon) {
  const candidates = [];

  for (const [nationId, geo] of Object.entries(NATION_GEO)) {
    if (!geo?.bbox) continue;

    let matches = false;

    // Проверяем основной bbox
    if (inBbox(lat, lon, geo.bbox)) {
      matches = true;
    }

    // Проверяем дополнительные полигоны (несмежные территории)
    if (!matches && geo.polygons?.length) {
      for (const poly of geo.polygons) {
        if (inBbox(lat, lon, poly)) {
          matches = true;
          break;
        }
      }
    }

    if (matches) {
      candidates.push({
        nationId,
        priority: geo.priority ?? 5,
      });
    }
  }

  return candidates;
}

// ── Основная логика назначения ────────────────────────────────────
console.log('\nНачинаем назначение регионов...');

const assignments = { ...existing };
const stats = {
  already_owned: 0,      // Уже принадлежат нации (не neutral)
  out_of_world: 0,       // Вне исторического мира
  assigned: 0,           // Назначены нации
  contested: 0,          // Несколько кандидатов — выбран приоритетный
  unassigned: 0,         // Нет кандидатов — остались neutral
  skipped_existing: 0,   // Уже были в existing assignments
};

const nationCounts = {};  // Сколько регионов получила каждая нация
const contestedDetails = [];  // Для отчёта

for (const [regionId, region] of Object.entries(REGION_CENTROIDS)) {
  // Пропускаем уже обработанные
  if (existing[regionId] !== undefined) {
    stats.skipped_existing++;
    continue;
  }

  // Регионы уже принадлежащие нации — сохраняем как есть
  if (region.nation !== 'neutral') {
    assignments[regionId] = region.nation;
    stats.already_owned++;
    nationCounts[region.nation] = (nationCounts[region.nation] ?? 0) + 1;
    continue;
  }

  // Регионы вне исторического мира — neutral
  if (!region.in_historical_world) {
    assignments[regionId] = 'neutral';
    stats.out_of_world++;
    continue;
  }

  // Нейтральные регионы в историческом мире — ищем кандидатов
  const { lat, lon } = region;
  const candidates = findCandidates(lat, lon);

  if (candidates.length === 0) {
    assignments[regionId] = 'neutral';
    stats.unassigned++;
    continue;
  }

  // Выбираем нацию с наименьшим priority (более специфичная)
  candidates.sort((a, b) => a.priority - b.priority);
  const winner = candidates[0];

  if (candidates.length > 1) {
    stats.contested++;
    if (contestedDetails.length < 20) {
      contestedDetails.push({
        region: regionId,
        winner: winner.nationId,
        losers: candidates.slice(1).map(c => `${c.nationId}(p=${c.priority})`),
      });
    }
  }

  assignments[regionId] = winner.nationId;
  nationCounts[winner.nationId] = (nationCounts[winner.nationId] ?? 0) + 1;
  stats.assigned++;
}

// ── Сохранение результатов ────────────────────────────────────────
console.log('\nСохранение data/region_assignments.js...');

const content = `// AUTO-GENERATED by scripts/stage3_assign_regions.js
// Назначение регионов нациям на основе исторических bbox (304 BC)
//
// Ключ: region_id (например "r1042")
// Значение: nation_id (например "pontos") или "neutral"
//
// Используется: scripts/stage4_validate_assignment.js
//               scripts/stage5_apply_assignment.js

var REGION_ASSIGNMENTS = ${JSON.stringify(assignments, null, 2)};
`;

fs.writeFileSync(OUT_PATH, content, 'utf8');

// ── Статистика ────────────────────────────────────────────────────
const totalRegions = Object.keys(REGION_CENTROIDS).length;
const totalAssigned = Object.keys(assignments).length;

console.log('\n' + '═'.repeat(60));
console.log('СТАТИСТИКА НАЗНАЧЕНИЯ');
console.log('═'.repeat(60));
console.log(`Всего регионов в centroids:   ${totalRegions}`);
console.log(`Уже было в assignments:       ${stats.skipped_existing}`);
console.log(`Принадлежали нации (не neut): ${stats.already_owned}`);
console.log(`Вне исторического мира:       ${stats.out_of_world}`);
console.log(`Назначены новой нации:        ${stats.assigned}`);
console.log(`  из них спорных (несколько): ${stats.contested}`);
console.log(`Остались neutral (нет bbox):  ${stats.unassigned}`);
console.log(`Итого в файле:                ${totalAssigned}`);

// Топ-20 наций по количеству регионов
console.log('\nТоп-20 наций по регионам:');
const sorted = Object.entries(nationCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
for (const [nation, count] of sorted) {
  const bar = '█'.repeat(Math.min(40, Math.round(count / 5)));
  console.log(`  ${nation.padEnd(20)} ${String(count).padStart(4)}  ${bar}`);
}

// Нации из NATION_GEO без регионов
const nationsWithNoRegions = Object.keys(NATION_GEO).filter(id => !(nationCounts[id] > 0));
if (nationsWithNoRegions.length > 0) {
  console.log(`\nНации с геоданными но 0 регионов (${nationsWithNoRegions.length}):`);
  console.log(' ', nationsWithNoRegions.slice(0, 30).join(', '));
  if (nationsWithNoRegions.length > 30) {
    console.log(`  ... и ещё ${nationsWithNoRegions.length - 30}`);
  }
}

// Примеры спорных регионов
if (contestedDetails.length > 0) {
  console.log('\nПримеры спорных регионов (первые 10):');
  for (const d of contestedDetails.slice(0, 10)) {
    console.log(`  ${d.region}: → ${d.winner}, вытеснены: ${d.losers.join(', ')}`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`✓ Этап 3 завершён`);
console.log(`  Файл: data/region_assignments.js`);
console.log(`  Размер: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`);
console.log('\nСледующий: node scripts/stage4_validate_assignment.js');
