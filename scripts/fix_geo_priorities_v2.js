#!/usr/bin/env node
// Комплексное исправление приоритетов и bbox наций (v2)
//
// Проблемы:
//  1. carthage — bbox только город, priority 9 → 4 региона в назначениях
//  2. rome (p=2) перебивает roman_republic (p=8) → Rome забирает 27 регионов
//  3. roman_republic (p=8) проигрывает всем → 1 регион
//  4. musulamii (p=3) захватывает 87 регионов Сев.Африки
//  5. makae стоит в Омане вместо Триполитании
//  6. mauretania, masaesyli, gaetulia и др. отсутствуют
//  7. ptolemaic_kingdom (p=9) уступает egypt (p=8) → 0 регионов

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

// ── 1. КАРФАГЕН ───────────────────────────────────────────────────
// 304 BC: Карфаген контролирует побережье Сев.Африки от Марокко до Триполитании,
// западную Сицилию, большую часть Сардинии, юг Испании
NATION_GEO['carthage'] = {
  bbox:    { latMin: 28.0, latMax: 38.0, lonMin: -7.5, lonMax: 15.0 },
  priority: 5,
  capital:  { lat: 36.86, lon: 10.33 },  // Карфаген (совр. Тунис)
  polygons: [
    // Западная Сицилия (Панорм, Лилибей)
    { latMin: 37.4, latMax: 38.3, lonMin: 12.1, lonMax: 13.5 },
    // Сардиния
    { latMin: 38.5, latMax: 41.3, lonMin:  7.9, lonMax:  9.8 },
    // Юг Испании / Гадир
    { latMin: 35.5, latMax: 38.5, lonMin: -7.0, lonMax: -1.0 },
  ],
  notes: 'Карфаген 304 BC — торговая империя Западного Средиземноморья',
};
console.log('FIX carthage → p=5, bbox расширен до всего сев.африканского побережья');

// ── 2. ROME vs ROMAN_REPUBLIC ─────────────────────────────────────
// Проблема: rome (p=2) перехватывает 27 регионов у roman_republic (p=8)
// rome в nations.js — полная нация, roman_republic — заглушка (is_minor=true)
// Решение: убираем roman_republic из nation_geo, даём rome правильный bbox и p=4

// Удаляем заглушку roman_republic из geo (она is_minor и лишняя)
if (NATION_GEO['roman_republic']) {
  delete NATION_GEO['roman_republic'];
  console.log('DEL roman_republic из nation_geo (is_minor stub)');
}

// Исправляем rome: расширяем bbox на всю территорию Рима 304 BC
// (Лаций, Кампания, колонии до р.По не включая этрусские/самнитские земли)
NATION_GEO['rome'] = {
  bbox:    { latMin: 40.0, latMax: 44.5, lonMin: 10.8, lonMax: 15.0 },
  priority: 4,
  capital:  { lat: 41.9, lon: 12.5 },  // Рим
  notes:   'Рим 304 BC — после 2-й Самнитской войны, контролирует Лаций + Кампания',
};
console.log('FIX rome → p=4, bbox: Лаций + Кампания + латинские колонии');

// ── 3. MUSULAMII — слишком широкий охват ─────────────────────────
// 87 регионов из-за p=3 и bbox покрывающего всю сев.Нумидию
// Мусуламии — одно из нумидийских племён, не должны доминировать
if (NATION_GEO['musulamii']) {
  NATION_GEO['musulamii'].priority = 5;  // уравниваем с numidia
  // Сужаем bbox до их реального ареала: горы у совр.Алжира
  NATION_GEO['musulamii'].bbox = { latMin: 34.5, latMax: 36.5, lonMin: 5.5, lonMax: 9.0 };
  console.log('FIX musulamii → p=5, bbox сужен (горная Нумидия)');
}

// ── 4. MAKAE — перенос из Омана в Триполитанию ───────────────────
NATION_GEO['makae'] = {
  bbox:    { latMin: 29.0, latMax: 33.5, lonMin: 11.5, lonMax: 20.0 },
  priority: 4,
  capital:  { lat: 32.1, lon: 15.0 },  // Лептис-Магна / Триполи
  notes:   'Маки — ливийские племена Триполитании 304 BC (был неверно в Омане)',
};
console.log('FIX makae → перенесён из Омана в Триполитанию');

// ── 5. ДОБАВЛЯЕМ ОТСУТСТВУЮЩИЕ ЗАПАДНОАФРИКАНСКИЕ НАЦИИ ──────────
const WEST_AFRICA_GEO = {
  // Мавретания — большое берберское царство, Марокко
  mauretania: {
    bbox:    { latMin: 29.0, latMax: 35.9, lonMin: -8.5, lonMax: -1.0 },
    priority: 4,
    capital:  { lat: 35.77, lon: -5.80 },  // Тингис (Танжер)
    notes:   'Мавретания — берберское царство Марокко 304 BC',
  },
  // Масесилы — западные нумидийцы (западный Алжир)
  masaesyli: {
    bbox:    { latMin: 33.0, latMax: 37.0, lonMin: -2.5, lonMax:  5.0 },
    priority: 4,
    capital:  { lat: 35.7, lon: 1.3 },   // Сига
    notes:   'Масесилы — западные нумидийцы 304 BC',
  },
  // Гетулия — юг Нумидии (предсахарская зона)
  gaetulia: {
    bbox:    { latMin: 27.0, latMax: 33.0, lonMin: -3.0, lonMax: 12.0 },
    priority: 5,
    capital:  { lat: 30.5, lon:  4.0 },
    notes:   'Гетулия — берберские кочевники южнее Нумидии',
  },
  // Автолалы — берберские племена Атласских гор
  autolalae: {
    bbox:    { latMin: 29.0, latMax: 34.0, lonMin: -8.0, lonMax: -2.0 },
    priority: 5,
    capital:  { lat: 31.5, lon: -5.0 },
    notes:   'Автолалы — берберские племена Атласских гор',
  },
  // Оиаты — восточная Ливия (между Киреной и Триполитанией)
  oyat: {
    bbox:    { latMin: 28.5, latMax: 32.5, lonMin: 18.0, lonMax: 24.5 },
    priority: 4,
    capital:  { lat: 31.0, lon: 21.0 },
    notes:   'Оиаты — восточноливийские племена 304 BC',
  },
  // Псиллы — прибрежное племя (близ Кирены)
  psyllia: {
    bbox:    { latMin: 30.0, latMax: 33.0, lonMin: 22.5, lonMax: 26.5 },
    priority: 4,
    capital:  { lat: 31.5, lon: 24.0 },
    notes:   'Псиллы — прибрежное ливийское племя близ Кирены',
  },
  // Фазания — Феццан (центральная Ливия)
  phazania: {
    bbox:    { latMin: 23.5, latMax: 29.0, lonMin: 11.5, lonMax: 18.0 },
    priority: 5,
    capital:  { lat: 26.5, lon: 14.5 },  // Гарама
    notes:   'Фазания — страна Феццан, центральная Ливия',
  },
};

for (const [id, geo] of Object.entries(WEST_AFRICA_GEO)) {
  const existed = !!NATION_GEO[id];
  NATION_GEO[id] = geo;
  console.log(existed ? `UPD ${id}` : `ADD ${id}`, '→ p=' + geo.priority);
}

// ── 6. PTOLEMAIC KINGDOM vs EGYPT ────────────────────────────────
// ptolemaic_kingdom (p=9) проигрывает egypt (p=8) → 0 регионов
// Птолемей контролировал: Египет + Кипр + Киренаика + часть Леванта
// Оставляем egypt как основную игровую нацию, повышаем его bbox
// ptolemaic_kingdom делаем фоном для территорий ВНЕ Нила
if (NATION_GEO['ptolemaic_kingdom']) {
  NATION_GEO['ptolemaic_kingdom'].priority = 7;  // фоновое заполнение
  console.log('FIX ptolemaic_kingdom → p=7 (фон для левантийских территорий)');
}
// egypt остаётся p=8, но расширяем bbox чуть западнее (Киренаика)
if (NATION_GEO['egypt']) {
  NATION_GEO['egypt'].priority = 6;   // снижаем — Египет важная держава
  NATION_GEO['egypt'].bbox = { latMin: 22.0, latMax: 32.0, lonMin: 20.0, lonMax: 37.0 };
  console.log('FIX egypt → p=6, bbox расширен до Киренаики');
}

// ── 7. ANTIGONUS (Антигонидское царство) ─────────────────────────
// antigonus p=7 — это нормально, но проверим bbox
if (NATION_GEO['antigonus']) {
  // Антигон I Одноглазый в 304 BC контролировал Анатолию + Сирию (до Сирийских войн)
  NATION_GEO['antigonus'].bbox = { latMin: 36.0, latMax: 42.5, lonMin: 26.0, lonMax: 42.0 };
  NATION_GEO['antigonus'].priority = 7;
  console.log('FIX antigonus → bbox уточнён для Анатолии');
}

// ── 8. SELEUKID EMPIRE ───────────────────────────────────────────
// seleukid_empire p=8 — фоновая империя для Сирии/Месопотамии/Персии
// Оставляем как есть, но убеждаемся что приоритет правильный
if (NATION_GEO['seleukid_empire']) {
  NATION_GEO['seleukid_empire'].priority = 8;  // ОК — фон
  console.log('OK seleukid_empire p=8 (фоновая империя)');
}

// ── 9. MAURYA EMPIRE ─────────────────────────────────────────────
// maurya_empire p=9 с большим bbox — фон для Индии
// Это правильно: мелкие царства (andhra, pandya etc.) победят её
if (NATION_GEO['maurya_empire']) {
  NATION_GEO['maurya_empire'].priority = 9;  // ОК — фон
  console.log('OK maurya_empire p=9 (фоновая империя Индии)');
}

// ── Сохранение ────────────────────────────────────────────────────
const geoEntries = Object.entries(NATION_GEO)
  .map(([k, v]) => `  "${k}": ${JSON.stringify(v)}`)
  .join(',\n');

fs.writeFileSync(nGeoPath,
  `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = {\n${geoEntries}\n};\n`
);
console.log(`\n✓ nation_geo.js обновлён (${Object.keys(NATION_GEO).length} записей)`);
console.log('\nСледующий шаг:');
console.log('  node scripts/stage3_assign_regions.js');
console.log('  node scripts/stage5_apply_assignment.js');
