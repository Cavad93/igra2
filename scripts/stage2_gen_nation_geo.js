#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// ЭТАП 2: Генерация исторических географических границ для наций
//
// Вход:  data/nations.js
// Выход: data/nation_geo.js
//
// Алгоритм для каждой нации:
//   1. Ищет реальные координаты в Pleiades (база античных мест)
//   2. Ищет историческую информацию в Wikipedia
//   3. Передаёт реальные данные + уже обработанных соседей в Claude
//   4. Claude генерирует точный bbox на основе реальных источников
//
// Вызов: ANTHROPIC_API_KEY=sk-ant-... node scripts/stage2_gen_nation_geo.js
//
// Батчи по 10 наций — результат дополняется, можно прерывать и продолжать.
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('Установи ANTHROPIC_API_KEY');
  process.exit(1);
}

const MODEL      = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;
const BATCH_SIZE = 10;   // Меньше батч — лучше качество с web-данными
const DELAY_MS   = 1500;

// ── Загрузка наций ────────────────────────────────────────────────
const nCode = fs.readFileSync(path.join(ROOT, 'data', 'nations.js'), 'utf8')
  .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
const ns = vm.createContext({ console });
vm.runInContext(nCode, ns);
const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};

// ── Загрузка существующих результатов ────────────────────────────
const OUT_PATH = path.join(ROOT, 'data', 'nation_geo.js');
let existing = {};
if (fs.existsSync(OUT_PATH)) {
  try {
    const c = fs.readFileSync(OUT_PATH, 'utf8').replace(/^var /mg, 'var ');
    const s = vm.createContext({ console });
    vm.runInContext(c, s);
    existing = s.NATION_GEO ?? {};
    console.log(`Уже обработано: ${Object.keys(existing).length} наций`);
  } catch { existing = {}; }
}

// ── Нации для обработки ───────────────────────────────────────────
function hasRRegions(nation) {
  return (nation.regions ?? []).some(r => /^r\d+$/.test(r));
}

const todo = Object.entries(NATIONS)
  .filter(([id, n]) => !hasRRegions(n) && !existing[id] && id !== 'neutral')
  .map(([id, n]) => ({
    id,
    name: n.name ?? id,
    government: n.government?.type ?? 'unknown',
    population: n.population?.total ?? 0,
    historical_note: n.historical_note?.slice(0, 200) ?? '',
    symbolic_regions: (n.regions ?? []).filter(r => !/^r\d+$/.test(r)).slice(0, 5),
  }));

console.log(`Наций для обработки: ${todo.length}`);
if (todo.length === 0) {
  console.log('Все нации уже обработаны. data/nation_geo.js актуален.');
  process.exit(0);
}

// ════════════════════════════════════════════════════════════════
// WEB SEARCH: Pleiades + Wikipedia
// ════════════════════════════════════════════════════════════════

// Регионы для азиатских наций — Wikipedia будет искать с правильным контекстом
const ASIA_PREFIXES = ['japan','japanese','korea','korean','china','chinese',
  'india','indian','burma','myanmar','thailand','vietnam','malay','indonesia'];

function getSearchTerms(nation) {
  const base = nation.id.replace(/_/g, ' ');
  const nameLower = (nation.name ?? '').toLowerCase();

  // Определяем регион по имени нации для более точного поиска
  const isJapan   = /awa|harima|kii|ise|owari|yamato|musasi|tanba|hida|kai|iga|iki|izu|kaga|noto|suwa|toki|suo|oki|dewa|esan|ebetsu|sunazawa|kitami/.test(nation.id);
  const isKorea   = /baekje|goguryeo|gojoseon|okjeo|yeodam|yeomhae|gijeo/.test(nation.id);
  const isChina   = /chu|qin|wei|yan|zhao|qi|han|song|zhou|zuo|zou|lu|xi|teng|xue|dian|yelang|yuezhi|xiongnu/.test(nation.id);
  const isIndia   = /maurya|magadha|kalinga|pandya|chola|chera|andhra|bhoja|paurava|naga/.test(nation.id);
  const isSE_Asia = /pegu|thaton|beikthano|arakan|tagaung|van_lang|chansen|kedah|langkashuka|fuyu/.test(nation.id);

  const regionHint = isJapan ? ' Japan ancient province'
    : isKorea  ? ' Korea ancient kingdom'
    : isChina  ? ' China ancient state Warring States'
    : isIndia  ? ' India ancient kingdom'
    : isSE_Asia ? ' Southeast Asia ancient'
    : ' ancient history';

  const noteWords = (nation.historical_note ?? '')
    .match(/[A-Za-z]{4,}/g)
    ?.filter(w => !['that','this','were','with','from','have','their','ancient','nation'].includes(w.toLowerCase()))
    ?.slice(0, 3) ?? [];

  return [
    base + regionHint,
    base + ' ancient',
    noteWords.length ? noteWords.join(' ') + ' ancient' : null,
    base + ' 300 BC',
  ].filter(Boolean);
}

// Pleiades — база античных мест (pleiades.stoa.org)
async function searchPleiades(query) {
  try {
    const url = `https://pleiades.stoa.org/search_json?SearchableText=${encodeURIComponent(query)}&portal_type=Place&review_state=published`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const data = await resp.json();
    const items = data['@graph'] ?? [];
    if (!items.length) return null;

    const first = items[0];
    // reprPoint: [lon, lat], bbox: [lonMin, latMin, lonMax, latMax]
    return {
      title:       first.title,
      description: first.description?.slice(0, 150),
      reprPoint:   first.reprPoint,   // [lon, lat]
      bbox:        first.bbox,        // [lonMin, latMin, lonMax, latMax]
    };
  } catch { return null; }
}

// Wikipedia — энциклопедическая статья
async function searchWikipedia(query) {
  try {
    const WIKI_UA = 'PaxHistoriaBot/1.0 (igra2 game map generator; contact: igra2@example.com)';
    // 1) Поиск статьи
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
    const sResp = await fetch(searchUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': WIKI_UA },
    });
    if (!sResp.ok) return null;

    const sData = await sResp.json();
    const title = sData?.query?.search?.[0]?.title;
    if (!title) return null;

    // 2) Краткое описание + координаты
    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sumResp = await fetch(sumUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': WIKI_UA },
    });
    if (!sumResp.ok) return null;

    const summ = await sumResp.json();
    return {
      title:       summ.title,
      extract:     summ.extract?.slice(0, 400),
      coordinates: summ.coordinates ?? null,   // { lat, lon }
    };
  } catch { return null; }
}

// Собирает web-данные для одной нации — Pleiades и Wikipedia параллельно
async function gatherWebData(nation) {
  const terms = getSearchTerms(nation);

  // Запускаем оба поиска параллельно по первому термину
  const [pleiades1, wikipedia1] = await Promise.all([
    searchPleiades(terms[0]),
    searchWikipedia(terms[0]),
  ]);

  let pleiades = pleiades1;
  let wikipedia = wikipedia1;

  // Если что-то не нашлось — пробуем следующие термины (тоже параллельно)
  for (let i = 1; i < terms.length && (!pleiades || !wikipedia); i++) {
    const [pl, wi] = await Promise.all([
      pleiades  ? Promise.resolve(null) : searchPleiades(terms[i]),
      wikipedia ? Promise.resolve(null) : searchWikipedia(terms[i]),
    ]);
    if (pl) pleiades = pl;
    if (wi) wikipedia = wi;
    await sleep(200);
  }

  return { pleiades, wikipedia };
}

// ════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ════════════════════════════════════════════════════════════════

// Определяет примерный регион мира по bbox
function getWorldRegion(geo) {
  const lat = (geo.bbox.latMin + geo.bbox.latMax) / 2;
  const lon = (geo.bbox.lonMin + geo.bbox.lonMax) / 2;
  if (lon > 60 && lon < 150 && lat > 0)  return 'asia';
  if (lon > 100 && lat < 20)             return 'se_asia';
  if (lon > -15 && lon < 45 && lat > 30) return 'europe';
  if (lon > -15 && lon < 60 && lat < 30) return 'africa_me';
  return 'other';
}

function buildPrompt(nations, webDataMap, alreadyPlaced) {
  // Контекст соседей — берём нации из того же региона мира (макс 30)
  // плюс последние 10 обработанных (для временной близости)
  const allPlaced = Object.entries(alreadyPlaced);
  const recentIds = new Set(allPlaced.slice(-10).map(([id]) => id));

  // Угадываем регион текущего батча по именам наций
  const batchRegion = nations[0]
    ? (() => {
        const id = nations[0].id;
        if (/awa|harima|kii|yamato|chu|qin|wei|yan|baekje|goguryeo|pegu|kedah/.test(id)) return 'asia';
        if (/rome|carthage|greek|macedon|sparta|athens|gaul|celt/.test(id)) return 'europe';
        return 'other';
      })()
    : 'other';

  const neighbors = allPlaced
    .filter(([id, geo]) => recentIds.has(id) || getWorldRegion(geo) === batchRegion)
    .slice(-30);

  const placedContext = neighbors.length
    ? '\n\nУЖЕ РАЗМЕЩЁННЫЕ СОСЕДНИЕ НАЦИИ (избегай перекрытий):\n' +
      neighbors.map(([id, g]) =>
        `  ${id}: bbox=[${g.bbox.latMin},${g.bbox.latMax},${g.bbox.lonMin},${g.bbox.lonMax}]`
      ).join('\n')
    : '';
  // Список наций с web-данными
  const natList = nations.map(n => {
    const web = webDataMap[n.id] ?? {};
    const lines = [
      `  ${n.id} (${n.name}):`,
      `    gov=${n.government}, pop=${n.population}`,
      `    note="${n.historical_note}"`,
    ];

    if (n.symbolic_regions.length) {
      lines.push(`    symbolic_regions=[${n.symbolic_regions.join(',')}]`);
    }

    if (web.pleiades) {
      const p = web.pleiades;
      lines.push(`    [PLEIADES] title="${p.title}", desc="${p.description}"`);
      if (p.reprPoint) {
        lines.push(`    [PLEIADES] reprPoint=[lon=${p.reprPoint[0]}, lat=${p.reprPoint[1]}]`);
      }
      if (p.bbox) {
        lines.push(`    [PLEIADES] bbox=[lonMin=${p.bbox[0]}, latMin=${p.bbox[1]}, lonMax=${p.bbox[2]}, latMax=${p.bbox[3]}]`);
      }
    } else {
      lines.push(`    [PLEIADES] нет данных`);
    }

    if (web.wikipedia) {
      const w = web.wikipedia;
      lines.push(`    [WIKIPEDIA] "${w.title}": ${w.extract}`);
      if (w.coordinates) {
        lines.push(`    [WIKIPEDIA] coords=[lat=${w.coordinates.lat}, lon=${w.coordinates.lon}]`);
      }
    } else {
      lines.push(`    [WIKIPEDIA] нет данных`);
    }

    return lines.join('\n');
  }).join('\n\n');

  return {
    system: `Ты историко-географический эксперт по античному миру 304 года до н.э.
Тебе предоставлены РЕАЛЬНЫЕ данные из баз Pleiades (античная география) и Wikipedia.
Используй эти данные как основу для точных координат.
Отвечай ТОЛЬКО валидным JSON. Никакого текста вне JSON.`,

    user: `Список государств игры Pax Historia (304 BC):

${natList}
${placedContext}

Для каждого государства укажи его РЕАЛЬНЫЕ географические границы в 304 BC.
Используй данные Pleiades/Wikipedia как точные якорные точки.
Верни JSON объект где ключ = ID государства:

{
  "<nation_id>": {
    "bbox": {
      "latMin": число,
      "latMax": число,
      "lonMin": число,
      "lonMax": число
    },
    "polygons": [   // ОПЦИОНАЛЬНО: если территория несмежная
      { "latMin": ч, "latMax": ч, "lonMin": ч, "lonMax": ч }
    ],
    "priority": число,   // 1=маленький полис, 5=среднее царство, 10=империя
    "capital": { "lat": число, "lon": число },
    "notes": "источник: Pleiades/Wikipedia/знания + краткое обоснование"
  }
}

ПРАВИЛА:
- Если есть данные Pleiades с reprPoint — используй их как координаты столицы
- Если есть данные Pleiades с bbox — используй как основу для bbox нации
- Если есть Wikipedia coords — используй как дополнительную проверку
- НЕ перекрывай bbox уже размещённых наций (список выше)
- Для мелких полисов bbox ~0.5-2 градуса, для племён ~2-5, для царств ~5-15, для империй ~15-30
- priority: маленький город=1-2, полис=3-4, царство=5-7, великая держава=8-10
- В поле notes укажи: "Pleiades" если использовал Pleiades, "Wikipedia" если Wikipedia, "history" если только знания

Ориентиры:
- Афины: lat 37.5-38.5, lon 22.5-24.5
- Рим: lat 41.5-42.5, lon 12.0-13.0
- Карфаген: lat 36.5-37.5, lon 9.5-11.0`
  };
}

// ════════════════════════════════════════════════════════════════
// CLAUDE API
// ════════════════════════════════════════════════════════════════

async function callClaude(system, user) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.status === 429) { await sleep(60_000); continue; }
      if (resp.status >= 500)  { await sleep(10_000 * (attempt + 1)); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);

      const data = await resp.json();
      const raw  = data?.content?.[0]?.text ?? '';
      // Убираем markdown-блоки и однострочные комментарии // ...
      const cleaned = raw
        .replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '')
        .replace(/\/\/[^\n]*/g, '')   // убираем // комментарии внутри JSON
        .trim();
      return JSON.parse(cleaned);
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(5000);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Лог-файл прогресса ────────────────────────────────────────────
const LOG_PATH = path.join(ROOT, 'data', 'nation_geo_log.txt');
function logProgress(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_PATH, line, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// СОХРАНЕНИЕ
// ════════════════════════════════════════════════════════════════

function saveResults(data) {
  const content =
`// AUTO-GENERATED: исторические границы наций 304 BC
// Источники: Pleiades (pleiades.stoa.org), Wikipedia, Claude knowledge
// Не редактировать вручную — создаётся scripts/stage2_gen_nation_geo.js

var NATION_GEO = ${JSON.stringify(data, null, 2)};
`;
  fs.writeFileSync(OUT_PATH, content, 'utf8');
}

// ════════════════════════════════════════════════════════════════
// ОСНОВНОЙ ЦИКЛ
// ════════════════════════════════════════════════════════════════

const results = { ...existing };

const batches = [];
for (let i = 0; i < todo.length; i += BATCH_SIZE) {
  batches.push(todo.slice(i, i + BATCH_SIZE));
}

console.log(`Батчей: ${batches.length} по ~${BATCH_SIZE} наций`);
console.log('─'.repeat(60));

// Статистика web-поиска
let webHits = { pleiades: 0, wikipedia: 0, none: 0 };

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi];
  const ids = batch.map(n => n.id);
  const batchStart = Date.now();
  console.log(`\nБатч ${bi + 1}/${batches.length}: ${ids.join(', ')}`);
  logProgress(`Батч ${bi + 1}/${batches.length} START: ${ids.join(', ')}`);

  // ── 1) Сбор web-данных ────────────────────────────────────────
  console.log('  Поиск в Pleiades + Wikipedia...');
  const webDataMap = {};

  for (const nation of batch) {
    const web = await gatherWebData(nation);
    webDataMap[nation.id] = web;

    const hasPl = !!web.pleiades;
    const hasWi = !!web.wikipedia;
    if (hasPl) webHits.pleiades++;
    if (hasWi) webHits.wikipedia++;
    if (!hasPl && !hasWi) webHits.none++;

    const src = [hasPl ? 'Pleiades✓' : 'Pleiades✗', hasWi ? 'Wiki✓' : 'Wiki✗'].join(' ');
    console.log(`    ${nation.id}: ${src}`);
    await sleep(200); // вежливые паузы между запросами
  }

  // ── 2) Запрос к Claude с реальными данными ───────────────────
  try {
    const { system, user } = buildPrompt(batch, webDataMap, results);
    const geoData = await callClaude(system, user);

    let added = 0;
    for (const [id, geo] of Object.entries(geoData)) {
      if (!geo?.bbox) {
        console.warn(`  ⚠ ${id}: нет bbox — пропускаю`);
        continue;
      }
      const { latMin, latMax, lonMin, lonMax } = geo.bbox;
      if (latMin >= latMax || lonMin >= lonMax) {
        console.warn(`  ⚠ ${id}: перевёрнутый bbox (min>=max) — пропускаю`);
        continue;
      }
      if (latMin < -90 || latMax > 90 || lonMin < -180 || lonMax > 180) {
        console.warn(`  ⚠ ${id}: bbox вне планеты [${latMin},${latMax},${lonMin},${lonMax}] — пропускаю`);
        continue;
      }
      if ((latMax - latMin) > 80 || (lonMax - lonMin) > 120) {
        console.warn(`  ⚠ ${id}: bbox подозрительно большой — пропускаю`);
        continue;
      }
      results[id] = geo;
      added++;
    }
    const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
    console.log(`  ✓ Получено: ${added}/${batch.length} наций (${elapsed}s)`);
    logProgress(`Батч ${bi + 1} DONE: ${added}/${batch.length} за ${elapsed}s`);

    saveResults(results);
    const total = Object.keys(results).length;
    const remaining = todo.length - (bi + 1) * BATCH_SIZE;
    console.log(`  Сохранено: ${total} наций | Осталось батчей: ${batches.length - bi - 1}`);

  } catch (e) {
    console.error(`  ✗ Батч ${bi + 1} не удался: ${e.message}`);
    console.error('  Пропускаю батч, продолжаю дальше...');
    logProgress(`БАТЧ ${bi + 1} ОШИБКА: ${e.message}`);
    saveResults(results);
    // Не останавливаемся — идём к следующему батчу
  }

  if (bi < batches.length - 1) await sleep(DELAY_MS);
}

// ── Итог ─────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('✓ Этап 2 завершён');
console.log(`  Обработано наций: ${Object.keys(results).length}`);
console.log(`  Файл: data/nation_geo.js`);
console.log(`\nСтатистика web-поиска:`);
console.log(`  Pleiades найдено:  ${webHits.pleiades}`);
console.log(`  Wikipedia найдено: ${webHits.wikipedia}`);
console.log(`  Без web-данных:    ${webHits.none}`);

// Статистика источников
const bySrc = {};
for (const geo of Object.values(results)) {
  const src = geo.notes?.includes('Pleiades') ? 'Pleiades'
            : geo.notes?.includes('Wikipedia') ? 'Wikipedia'
            : 'history';
  bySrc[src] = (bySrc[src] ?? 0) + 1;
}
console.log('\nИсточники данных:');
for (const [src, cnt] of Object.entries(bySrc)) {
  console.log(`  ${src}: ${cnt} наций`);
}
console.log('\nСледующий: node scripts/stage3_assign_regions.js');
