#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ВАЛИДАТОР: сверяет столицы наций из nation_geo.js с Pleiades
//
// Вход:  data/nation_geo.js, data/pleiades_300bc.json
// Выход: data/validation_report.json  — полный отчёт
//        data/nation_geo_fixed.js     — исправленные координаты
//
// Алгоритм:
//   1. Строит индекс Pleiades по нормализованным именам
//   2. Для каждой нации ищет совпадение (прямое → ручная карта → нечёткое)
//   3. Совпадение принимается только если Pleiades-точка попадает в bbox нации
//      или отстоит не дальше TOLERANCE_DEG от краёв bbox
//   4. Нации с расхождением > WARN_DEG помечаются как WARNING / ERROR
//   5. Применяет автоисправление только для ERROR (> FIX_DEG) + Pleiades — settlement/region
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const WARN_DEG     = 2.0;   // предупреждение если расхождение > 2°
const ERROR_DEG    = 5.0;   // ошибка если > 5°
const FUZZY_CUTOFF = 0.88;  // минимальная схожесть строк (строже)
const BBOX_PAD     = 0.5;   // допуск за края bbox (минимальный)
// Авто-фикс только если:
//   1. совпадение из MANUAL_MAP (не нечёткое)
//   2. Pleiades-тип = settlement (не region/other)
//   3. Pleiades-точка строго в bbox нации

// ── Ручная карта: ID нации → заголовок в Pleiades ─────────────────
// Используется когда прямой матч по ID не работает
const MANUAL_MAP = {
  // Рим и Италия
  rome:              'Roma',
  roman_republic:    'Roma',
  etruscan_conf:     'Etruria',
  samnium:           'Samnium',
  picentes:          'Picenum',
  messapians:        'Messapia',
  veneti:            'Venetia',
  insubri:           'Insubres',
  ligures:           'Liguria',
  // Греция
  athens:            'Athenai',
  greek_states:      'Hellas',
  boeotian_states:   'Boiotia',
  macedon:           'Makedonia',
  antigonid_kingdom: 'Makedonia',
  epirus:            'Epeiros',
  thessaly:          'Thessalia',
  thrace:            'Thracia',
  // Азия
  egypt:             'Aegyptus',
  seleucid:          'Seleucia Pieria',
  seleukid_empire:   'Antiochia ad Orontem',  // столица Селевкидов = Антиохия, не Сирия
  persia:            'Persis',
  bactria:           'Baktriane',
  sogdia:            'Sogdiana',
  parthia:           'Parthyene',
  parni:             'Parthyene',
  arachosia:         'Arachosia',
  drangiana:         'Drangiane',
  bactrian_kingdom:  'Baktriane',
  india:             'India',
  maurya_empire:     'Pataliputra',
  maurya:            'Pataliputra',
  paurava:           'Taxila',
  // Африка
  meroe:             'Meroe',
  numidia:           'Numidia',
  carthage:          'Carthago',
  gaetuli:           'Gaetulia',
  // Иберия
  celtiberi:         'Celtiberia',
  bastetani:         'Bastetania',
  contestani:        'Contestania',
  conii:             'Cynetes',
  turdetania:        'Turdetania',
  lusitania:         'Lusitania',
  // Галлия / Кельты
  gaul:              'Gallia',
  aedui:             'Aedui',
  arverni:           'Arverni',
  sequani:           'Sequani',
  bellovaci:         'Bellovaci',
  carnutes:          'Carnutes',
  namnetes:          'Namnetes',
  santones:          'Santones',
  // Британия
  britannia:         'Britannia',
  trinovantia:       'Trinovantes',
  breganti:          'Brigantes',
  selgovia:          'Selgovae',
  cornovia:          'Cornovii',
  coritania:         'Corieltauvi',
  dumnonia:          'Dumnonii',
  orcadia:           'Orcades',
  // Германия / Север
  germania:          'Germania',
  suebi:             'Suebi',
  cherusci:          'Cherusci',
  marcomanni:        'Marcomanni',
  // Балканы / Причерноморье
  scythians:         'Scythia',
  sarmatia:          'Sarmatia',
  getae:             'Getai',
  dacians:           'Dacia',
  illyria:           'Illyria',
  bosporan_kingdom:  'Panticapaeum',
  // Кавказ
  colchis:           'Kolchis',
  armenia:           'Armenia',
  atropatene:        'Atropatene',
  // Ближний Восток
  nabataea:          'Arabia Nabataea',
  judaea:            'Ioudaia',
  phoenicia:         'Phoenice',
  // Восточная Азия
  qin:               'Qin',
  chu:               'Chu',
  zhao:              'Zhao',
  wei:               'Wei',
  qi:                'Qi',
  yan:               'Yan',
  han:               'Han',
};

// ── Нормализация строки ────────────────────────────────────────────
function norm(s) {
  return s.toLowerCase()
    .replace(/ae/g, 'e').replace(/oe/g, 'e')
    .replace(/[^a-z]/g, '');
}

// ── Схожесть Жакара (по биграммам) ────────────────────────────────
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s) => {
    const bg = new Set();
    for (let i = 0; i < s.length - 1; i++) bg.add(s[i] + s[i+1]);
    return bg;
  };
  const bgA = bigrams(a), bgB = bigrams(b);
  let inter = 0;
  for (const bg of bgA) if (bgB.has(bg)) inter++;
  return (2 * inter) / (bgA.size + bgB.size);
}

// ── Проверка: точка (lat,lon) в bbox с допуском ───────────────────
function nearBbox(lat, lon, bbox, pad = BBOX_PAD) {
  return lat >= bbox.latMin - pad && lat <= bbox.latMax + pad &&
         lon >= bbox.lonMin - pad && lon <= bbox.lonMax + pad;
}

// ── Евклидово расстояние ───────────────────────────────────────────
function dist(lat1, lon1, lat2, lon2) {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);
}

// ── Загрузка данных ────────────────────────────────────────────────
console.log('Загрузка nation_geo.js...');
const gCode = fs.readFileSync(path.join(ROOT, 'data', 'nation_geo.js'), 'utf8')
  .replace(/^var /mg, 'var ');
const gs = vm.createContext({ console });
vm.runInContext(gCode, gs);
const NATION_GEO = gs.NATION_GEO;
console.log(`  Наций: ${Object.keys(NATION_GEO).length}`);

console.log('Загрузка pleiades_300bc.json...');
const pleiades = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pleiades_300bc.json'), 'utf8'));
console.log(`  Мест: ${pleiades.length}`);

// ── Построение индекса Pleiades ────────────────────────────────────
// Ключ: нормализованное имя → массив мест, отсортированных по типу
const pIdx = {};   // norm(name) → [place, ...]
const pTitle = {}; // norm(title_first_part) → place (для ручной карты)

const TYPE_SCORE = { settlement: 3, region: 2, fort: 1 };

for (const p of pleiades) {
  const titles = p.title.split('|');
  for (const t of titles) {
    const key = norm(t.trim());
    if (!key || key.length < 2) continue;
    if (!pIdx[key]) pIdx[key] = [];
    pIdx[key].push(p);
  }
  // Индекс по первому имени (для ручной карты)
  const mainKey = norm(titles[0].trim());
  if (mainKey) pTitle[mainKey] = p;
}
// Для каждого ключа — предпочитаем settlements
for (const key of Object.keys(pIdx)) {
  pIdx[key].sort((a, b) => (TYPE_SCORE[b.types] || 0) - (TYPE_SCORE[a.types] || 0));
}
console.log(`  Индекс: ${Object.keys(pIdx).length} уникальных имён`);

// ── Поиск совпадения для нации ─────────────────────────────────────
// Возвращает { place, method } или null
// method: 'manual' | 'exact' | 'fuzzy'
function findPleiades(nationId, geo) {
  const bbox = geo.bbox;
  const capLat = geo.capital?.lat ?? (bbox.latMin + bbox.latMax) / 2;
  const capLon = geo.capital?.lon ?? (bbox.lonMin + bbox.lonMax) / 2;

  // Выбирает лучший из кандидатов, попадающих в bbox нации
  function bestInBbox(candidates, method) {
    const inBox = candidates.filter(p => nearBbox(p.lat, p.lon, bbox));
    if (inBox.length === 0) return null;
    inBox.sort((a, b) => {
      const scoreDiff = (TYPE_SCORE[b.types] || 0) - (TYPE_SCORE[a.types] || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return dist(capLat, capLon, a.lat, a.lon) - dist(capLat, capLon, b.lat, b.lon);
    });
    return { place: inBox[0], method };
  }

  // 1. Ручная карта — наивысший приоритет
  const manualTitle = MANUAL_MAP[nationId];
  if (manualTitle) {
    const key = norm(manualTitle);
    const hits = pIdx[key] ?? [];
    // Для ручной карты допускаем расширенный bbox (зоны могут быть большими)
    const inBox = hits.filter(p => nearBbox(p.lat, p.lon, bbox, 3.0));
    if (inBox.length > 0) {
      inBox.sort((a, b) => dist(capLat, capLon, a.lat, a.lon) - dist(capLat, capLon, b.lat, b.lon));
      return { place: inBox[0], method: 'manual' };
    }
  }

  // 2. Прямое совпадение по ID (только если точка в bbox)
  const exactKeys = [
    norm(nationId.replace(/_/g, ' ')),
    norm(nationId.replace(/_/g, '')),
  ];
  for (const key of exactKeys) {
    const hits = pIdx[key] ?? [];
    const r = bestInBbox(hits, 'exact');
    if (r) return r;
  }

  // 3. Нечёткий поиск — только в bbox, строгий cutoff
  const idNorm = norm(nationId.replace(/_/g, ' '));
  if (idNorm.length >= 5) {
    const fuzzyPool = [];
    for (const [key, places] of Object.entries(pIdx)) {
      if (Math.abs(key.length - idNorm.length) > 3) continue;
      if (similarity(idNorm, key) >= FUZZY_CUTOFF) {
        fuzzyPool.push(...places);
      }
    }
    const r = bestInBbox(fuzzyPool, 'fuzzy');
    if (r) return r;
  }

  return null;
}

// ── Основной цикл ─────────────────────────────────────────────────
const report = {
  generated: new Date().toISOString(),
  summary: {},
  ok: [],
  warn: [],
  error: [],
  no_match: [],
  fixes_applied: [],
};

let countOk = 0, countWarn = 0, countErr = 0, countNoMatch = 0;

const fixedGeo = { ...NATION_GEO };  // будем патчить

for (const [nationId, geo] of Object.entries(NATION_GEO)) {
  if (!geo?.capital || !geo?.bbox) {
    report.no_match.push({ id: nationId, reason: 'no_capital_or_bbox' });
    countNoMatch++;
    continue;
  }

  const result = findPleiades(nationId, geo);
  if (!result) {
    report.no_match.push({ id: nationId, reason: 'not_in_pleiades' });
    countNoMatch++;
    continue;
  }

  const { place: match, method } = result;
  const d = dist(geo.capital.lat, geo.capital.lon, match.lat, match.lon);
  const strictlyInBbox = nearBbox(match.lat, match.lon, geo.bbox, 0);
  const entry = {
    id: nationId,
    method,
    claude_cap: { lat: geo.capital.lat, lon: geo.capital.lon },
    pleiades_cap: { lat: +match.lat.toFixed(4), lon: +match.lon.toFixed(4) },
    pleiades_title: match.title,
    pleiades_type: match.types,
    dist_deg: +d.toFixed(2),
    in_bbox: strictlyInBbox,
  };

  if (d <= WARN_DEG) {
    report.ok.push(entry);
    countOk++;
  } else if (d <= ERROR_DEG) {
    report.warn.push(entry);
    countWarn++;
  } else {
    report.error.push(entry);
    countErr++;

    // Автоисправление: ТОЛЬКО manual + settlement + строго в bbox
    const autoFixable = method === 'manual'
      && match.types === 'settlement'
      && strictlyInBbox;

    if (autoFixable) {
      fixedGeo[nationId] = {
        ...geo,
        capital: { lat: +match.lat.toFixed(4), lon: +match.lon.toFixed(4) },
        source_fix: `pleiades:${match.pid}`,
        notes: (geo.notes || '') + ` [ИСПРАВЛЕНО: Claude=${geo.capital.lat},${geo.capital.lon} → Pleiades=${match.lat.toFixed(2)},${match.lon.toFixed(2)}]`,
      };
      report.fixes_applied.push({ id: nationId, ...entry });
    }
  }
}

report.summary = {
  total: Object.keys(NATION_GEO).length,
  ok: countOk,
  warn: countWarn,
  error: countErr,
  no_match: countNoMatch,
  fixes_applied: report.fixes_applied.length,
};

// ── Вывод в консоль ───────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════');
console.log('РЕЗУЛЬТАТЫ ВАЛИДАЦИИ');
console.log('════════════════════════════════════════════════════════════');
console.log(`  Всего наций:    ${report.summary.total}`);
console.log(`  ✓ OK (≤${WARN_DEG}°):  ${countOk}`);
console.log(`  ⚠ WARN (${WARN_DEG}-${ERROR_DEG}°): ${countWarn}`);
console.log(`  ✗ ERROR (>${ERROR_DEG}°): ${countErr}`);
console.log(`  ? Не найдено:   ${countNoMatch}`);
console.log(`  ✎ Исправлено:   ${report.fixes_applied.length}`);

if (report.error.length > 0) {
  console.log('\n─── ERROR (расхождение > 5°) ─────────────────────────────');
  report.error
    .sort((a, b) => b.dist_deg - a.dist_deg)
    .forEach(e => {
      const fixed = report.fixes_applied.find(f => f.id === e.id);
      const fixMark = fixed ? ' ✎FIXED' : '';
      console.log(
        `  ${e.id.padEnd(22)} Claude=(${e.claude_cap.lat},${e.claude_cap.lon})` +
        ` Pleiades=(${e.pleiades_cap.lat},${e.pleiades_cap.lon})` +
        ` Δ${e.dist_deg}° [${e.pleiades_title}]${fixMark}`
      );
    });
}

if (report.warn.length > 0) {
  console.log('\n─── WARNING (расхождение 2-5°) ───────────────────────────');
  report.warn
    .sort((a, b) => b.dist_deg - a.dist_deg)
    .slice(0, 20)
    .forEach(e => {
      console.log(
        `  ${e.id.padEnd(22)} Claude=(${e.claude_cap.lat},${e.claude_cap.lon})` +
        ` Pleiades=(${e.pleiades_cap.lat},${e.pleiades_cap.lon})` +
        ` Δ${e.dist_deg}° [${e.pleiades_title}]`
      );
    });
  if (report.warn.length > 20) console.log(`  ... и ещё ${report.warn.length - 20}`);
}

// ── Сохранение отчёта ─────────────────────────────────────────────
const reportPath = path.join(ROOT, 'data', 'validation_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`\n✓ Отчёт сохранён: data/validation_report.json`);

// ── Сохранение исправленного nation_geo.js ────────────────────────
if (report.fixes_applied.length > 0) {
  const entries = Object.entries(fixedGeo)
    .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
    .join(',\n');
  const outSrc = `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${entries}\n};\n`;
  fs.writeFileSync(path.join(ROOT, 'data', 'nation_geo.js'), outSrc, 'utf8');
  console.log(`✓ nation_geo.js обновлён (${report.fixes_applied.length} исправлений)`);
} else {
  console.log('Автоисправлений не потребовалось.');
}
