#!/usr/bin/env node
// Добавляет недостающие крупные державы 300 BC и снижает приоритет Pleiades городов
import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Загрузка nation_geo.js ────────────────────────────────────────
const nGeoPath = path.join(ROOT, 'data', 'nation_geo.js');
const gSrc = fs.readFileSync(nGeoPath, 'utf8').replace(/^var /mg, 'var ');
const gCtx = vm.createContext({ console });
vm.runInContext(gSrc, gCtx);
const NATION_GEO = gCtx.NATION_GEO;

// ── Загрузка nations.js ───────────────────────────────────────────
const nationsPath = path.join(ROOT, 'data', 'nations.js');
let nationsSrc = fs.readFileSync(nationsPath, 'utf8');
const nCode = nationsSrc.replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const nCtx = vm.createContext({ console });
vm.runInContext(nCode, nCtx);
const NATIONS = nCtx.INITIAL_GAME_STATE.nations;

// ── Шаг 1: Понижаем приоритет Pleiades городов 2 → 10 ────────────
let loweredCount = 0;
for (const [id, geo] of Object.entries(NATION_GEO)) {
  if (geo.source?.startsWith('pleiades:') && geo.priority === 2) {
    geo.priority = 10;
    loweredCount++;
  }
}
console.log(`Приоритет Pleiades городов понижен: ${loweredCount} (2 → 10)`);

// ── Шаг 2: Недостающие крупные державы ───────────────────────────
// Данные основаны на исторических границах 304 BC
const MISSING_EMPIRES = {
  antigonus: {
    name: 'Antigonid Kingdom',
    color: '#C4956A',
    geo: {
      bbox: { latMin: 36.0, latMax: 42.5, lonMin: 26.0, lonMax: 40.5 },
      priority: 9,
      capital: { lat: 38.5, lon: 32.5 },  // Центральная Анатолия (Ипс)
      notes: 'Антигонидское царство — держава Антигона I, Анатолия 304 BC',
    },
  },
  seleucid: {
    name: 'Seleucid Empire',
    color: '#7B9E87',
    geo: {
      bbox: { latMin: 24.0, latMax: 38.0, lonMin: 35.0, lonMax: 75.0 },
      priority: 9,
      capital: { lat: 36.2, lon: 36.16 },  // Антиохия на Оронте
      notes: 'Держава Селевкидов — Сирия, Месопотамия, Персия 304 BC',
    },
  },
  lysimachus: {
    name: 'Kingdom of Lysimachus',
    color: '#8B7BA8',
    geo: {
      bbox: { latMin: 40.0, latMax: 47.0, lonMin: 22.0, lonMax: 32.0 },
      priority: 8,
      capital: { lat: 40.72, lon: 26.68 },  // Лисимахия
      notes: 'Царство Лисимаха — Фракия и побережье 304 BC',
    },
  },
  odrysian_kingdom: {
    name: 'Odrysian Kingdom',
    color: '#8B6914',
    geo: {
      bbox: { latMin: 41.0, latMax: 44.5, lonMin: 24.0, lonMax: 29.5 },
      priority: 7,
      capital: { lat: 42.15, lon: 25.55 },  // Сеутополис
      notes: 'Одрисское царство — Фракия (внутренняя) 304 BC',
    },
  },
  bithynia: {
    name: 'Bithynia',
    color: '#6B8E9E',
    geo: {
      bbox: { latMin: 39.5, latMax: 42.0, lonMin: 27.5, lonMax: 33.5 },
      priority: 6,
      capital: { lat: 40.19, lon: 29.06 },  // Пруса (Бурса)
      notes: 'Вифиния — северо-западная Анатолия 304 BC',
    },
  },
  bosporan: {
    name: 'Bosporan Kingdom',
    color: '#9E6B6B',
    geo: {
      bbox: { latMin: 43.5, latMax: 47.5, lonMin: 32.5, lonMax: 40.5 },
      priority: 6,
      capital: { lat: 45.35, lon: 36.47 },  // Пантикапей (Керчь)
      notes: 'Боспорское царство — Крым и Тамань 304 BC',
    },
  },
  colchis: {
    name: 'Colchis',
    color: '#6B9E6B',
    geo: {
      bbox: { latMin: 41.0, latMax: 43.5, lonMin: 40.0, lonMax: 46.0 },
      priority: 6,
      capital: { lat: 42.15, lon: 41.68 },  // Фасис (Поти)
      notes: 'Колхида — западная Грузия 304 BC',
    },
  },
  paphlagonia: {
    name: 'Paphlagonia',
    color: '#9E8B6B',
    geo: {
      bbox: { latMin: 40.5, latMax: 42.5, lonMin: 32.0, lonMax: 37.0 },
      priority: 7,
      capital: { lat: 41.2, lon: 34.5 },  // Помпейополис
      notes: 'Пафлагония — север Анатолии 304 BC',
    },
  },
  thrace: {
    name: 'Thrace',
    color: '#7B7B8E',
    geo: {
      bbox: { latMin: 40.5, latMax: 44.0, lonMin: 25.5, lonMax: 29.5 },
      priority: 8,
      capital: { lat: 41.7, lon: 26.6 },  // Эдирне (Адрианополь)
      notes: 'Фракия — восточная Балканы 304 BC',
    },
  },
};

let added = 0;
for (const [id, data] of Object.entries(MISSING_EMPIRES)) {
  if (NATION_GEO[id]) {
    console.log(`  SKIP ${id} — уже есть в nation_geo`);
    continue;
  }
  NATION_GEO[id] = data.geo;

  if (!NATIONS[id]) {
    NATIONS[id] = {
      name: data.name,
      color: data.color,
      regions: [],
    };
    console.log(`  ADD  ${id} (${data.name})`);
    added++;
  } else {
    console.log(`  GEO  ${id} — нация уже есть, добавили только geo`);
    added++;
  }
}
console.log(`\nДобавлено новых держав: ${added}`);

// ── Сохранение nation_geo.js ──────────────────────────────────────
const backupDir = path.join(ROOT, 'data', 'backups');
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const geoEntries = Object.entries(NATION_GEO)
  .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
  .join(',\n');
fs.writeFileSync(nGeoPath,
  `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${geoEntries}\n};\n`
);
console.log(`✓ nation_geo.js сохранён (${Object.keys(NATION_GEO).length} записей)`);

// ── Сохранение nations.js ─────────────────────────────────────────
const nEntries = Object.entries(NATIONS)
  .map(([k, v]) => `    "${k}": ${JSON.stringify(v)}`)
  .join(',\n');

// Находим блок nations: { через подсчёт скобок
const nStartRe = /nations\s*:\s*\{/;
const nStartMatch = nStartRe.exec(nationsSrc);
if (!nStartMatch) throw new Error('Не найден блок nations: {');
const blockStart = nStartMatch.index + nStartMatch[0].length;

let depth = 1, pos = blockStart;
while (pos < nationsSrc.length && depth > 0) {
  const ch = nationsSrc[pos];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
  pos++;
}
const blockEnd = pos - 1;

nationsSrc = nationsSrc.slice(0, blockStart) + '\n' + nEntries + '\n  ' + nationsSrc.slice(blockEnd);
fs.copyFileSync(nationsPath, path.join(backupDir, `nations_${ts}.js`));
fs.writeFileSync(nationsPath, nationsSrc, 'utf8');
console.log(`✓ nations.js сохранён (${Object.keys(NATIONS).length} наций)`);
