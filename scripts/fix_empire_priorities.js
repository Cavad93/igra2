#!/usr/bin/env node
// Исправляет приоритеты: малые города → 8, крупные державы → 7
// Чтобы крупные державы заполняли карту, оставляя исторические королевства видимыми
import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const nGeoPath = path.join(ROOT, 'data', 'nation_geo.js');
const gSrc = fs.readFileSync(nGeoPath, 'utf8').replace(/^var /mg, 'var ');
const gCtx = vm.createContext({ console });
vm.runInContext(gSrc, gCtx);
const NATION_GEO = gCtx.NATION_GEO;

// ── Исторически значимые королевства — НЕ трогать их приоритет ──
const KEEP_PRIORITY = new Set([
  // Анатолия / Малая Азия
  'pergamon', 'cappadocia', 'pontus', 'bithynia', 'paphlagonia',
  'commagene', 'sophene', 'gordyene', 'osroene',
  // Левант / Ближний Восток
  'nabataea', 'judea', 'palmyra', 'phoenicia', 'phoenician_coast',
  // Кавказ
  'armenia', 'atropatene', 'colchis', 'iberia', 'albany',
  // Балканы
  'macedon', 'epirus', 'thessaly', 'aetolia', 'achaea',
  // Восток
  'bactria', 'parthia', 'media', 'persis', 'elymais',
  'gedrosia', 'drangiana', 'arachosia', 'paropamisadae',
  // Крупные державы (только что добавлены)
  'antigonus', 'seleucid', 'lysimachus', 'odrysian_kingdom',
  'bosporan', 'thrace',
  // Африка
  'egypt', 'meroe', 'nabataea',
  // Прочие крупные
  'rome', 'carthage', 'maurya', 'seleukid_empire',
]);

// Зоны, где надо "расчистить" маленькие нации
// чтобы крупные державы получили регионы
function isInEmpireZone(geo) {
  if (!geo.bbox) return false;
  const cLat = (geo.bbox.latMin + geo.bbox.latMax) / 2;
  const cLon = (geo.bbox.lonMin + geo.bbox.lonMax) / 2;
  // Анатолия
  if (cLat >= 36 && cLat <= 43 && cLon >= 26 && cLon <= 42) return true;
  // Ближний Восток / Левант
  if (cLat >= 30 && cLat <= 38 && cLon >= 35 && cLon <= 48) return true;
  // Месопотамия / Персия
  if (cLat >= 28 && cLat <= 38 && cLon >= 42 && cLon <= 65) return true;
  // Балканы
  if (cLat >= 38 && cLat <= 44 && cLon >= 19 && cLon <= 28) return true;
  return false;
}

let raisedCount = 0;
for (const [id, geo] of Object.entries(NATION_GEO)) {
  if (KEEP_PRIORITY.has(id)) continue;
  if (geo.source?.startsWith('pleiades:')) continue; // уже 10
  if (!isInEmpireZone(geo)) continue;

  // Малые нации (маленький bbox, низкий приоритет) → поднимаем до 8
  const bboxSize = (geo.bbox.latMax - geo.bbox.latMin) * (geo.bbox.lonMax - geo.bbox.lonMin);
  if (geo.priority < 8 && bboxSize < 50) {
    geo.priority = 8;
    raisedCount++;
  }
}
console.log(`Приоритет малых городов поднят до 8: ${raisedCount}`);

// ── Устанавливаем приоритет крупных держав ────────────────────────
const EMPIRE_PRIORITIES = {
  antigonus:        7,  // заполняет оставшуюся Анатолию
  lysimachus:       7,  // заполняет Фракию (кроме macedon)
  odrysian_kingdom: 7,  // Фракия внутренняя
  thrace:           8,  // запасная Фракия
  seleucid:         8,  // заполняет Сирию/Месопотамию (кроме конкретных царств)
  seleukid_empire:  8,  // старое название
  bithynia:         7,  // northwestern Анатолия
  bosporan:         6,  // Крым
  colchis:          7,  // Грузия
  paphlagonia:      7,  // северная Анатолия
};

for (const [id, priority] of Object.entries(EMPIRE_PRIORITIES)) {
  if (NATION_GEO[id]) {
    NATION_GEO[id].priority = priority;
    console.log(`  Приоритет ${id}: → ${priority}`);
  }
}

// ── Сохранение ────────────────────────────────────────────────────
const geoEntries = Object.entries(NATION_GEO)
  .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
  .join(',\n');
fs.writeFileSync(nGeoPath,
  `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${geoEntries}\n};\n`
);
console.log(`\n✓ nation_geo.js сохранён (${Object.keys(NATION_GEO).length} записей)`);
