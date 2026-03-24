#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// GEO MONITOR SERVER — запускает stage2 и транслирует прогресс в браузер
//
// Запуск: node scripts/geo_server.js
// Затем открыть: http://localhost:3747
// ═══════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import http from 'http';
import vm   from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const PORT      = 3747;

// ─── SSE клиенты ───────────────────────────────────────────────────
const clients = new Set();

function emit(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch {}
  }
}

function log(msg) {
  console.log(msg);
  emit({ type: 'log', msg });
}

// ─── Состояние генерации ───────────────────────────────────────────
let running   = false;
let stopFlag  = false;

// ════════════════════════════════════════════════════════════════
// ЛОГИКА ГЕНЕРАЦИИ (копия из stage2, с emit вместо console.log)
// ════════════════════════════════════════════════════════════════

const MODEL      = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;
const BATCH_SIZE = 10;
const DELAY_MS   = 1500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Pleiades
async function searchPleiades(query) {
  try {
    const url = `https://pleiades.stoa.org/search_json?SearchableText=${encodeURIComponent(query)}&portal_type=Place&review_state=published`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data  = await resp.json();
    const items = data['@graph'] ?? [];
    if (!items.length) return null;
    const first = items[0];
    return { title: first.title, description: first.description?.slice(0, 150), reprPoint: first.reprPoint, bbox: first.bbox };
  } catch { return null; }
}

// Wikipedia
async function searchWikipedia(query) {
  try {
    const UA = 'PaxHistoriaBot/1.0 (igra2 game map generator; contact: igra2@example.com)';
    const sUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
    const sResp = await fetch(sUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!sResp.ok) return null;
    const sData = await sResp.json();
    const title = sData?.query?.search?.[0]?.title;
    if (!title) return null;
    const sumUrl  = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sumResp = await fetch(sumUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!sumResp.ok) return null;
    const summ = await sumResp.json();
    return { title: summ.title, extract: summ.extract?.slice(0, 400), coordinates: summ.coordinates ?? null };
  } catch { return null; }
}

function getSearchTerms(nation) {
  const base = nation.id.replace(/_/g, ' ');
  const isJapan   = /awa|harima|kii|ise|owari|yamato|musasi|tanba|hida|kai|iga|iki|izu|kaga|noto|suwa|toki|suo|oki|dewa/.test(nation.id);
  const isKorea   = /baekje|goguryeo|gojoseon|okjeo|yeodam|yeomhae|gijeo/.test(nation.id);
  const isChina   = /chu|qin|wei|yan|zhao|qi|han|song|zhou|zuo|zou|lu|xi|teng|xue|dian|yelang|yuezhi|xiongnu/.test(nation.id);
  const isIndia   = /maurya|magadha|kalinga|pandya|chola|chera|andhra|bhoja|paurava|naga/.test(nation.id);
  const isSE_Asia = /pegu|thaton|beikthano|arakan|tagaung|van_lang|chansen|kedah|langkashuka|fuyu/.test(nation.id);
  const regionHint = isJapan ? ' Japan ancient province' : isKorea ? ' Korea ancient kingdom'
    : isChina ? ' China ancient state Warring States' : isIndia ? ' India ancient kingdom'
    : isSE_Asia ? ' Southeast Asia ancient' : ' ancient history';
  const noteWords = (nation.historical_note ?? '').match(/[A-Za-z]{4,}/g)
    ?.filter(w => !['that','this','were','with','from','have','their','ancient','nation'].includes(w.toLowerCase()))
    ?.slice(0, 3) ?? [];
  return [
    base + regionHint,
    base + ' ancient',
    noteWords.length ? noteWords.join(' ') + ' ancient' : null,
    base + ' 300 BC',
  ].filter(Boolean);
}

async function gatherWebData(nation) {
  const terms = getSearchTerms(nation);
  const [pleiades1, wikipedia1] = await Promise.all([
    searchPleiades(terms[0]),
    searchWikipedia(terms[0]),
  ]);
  let pleiades = pleiades1;
  let wikipedia = wikipedia1;
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

function getWorldRegion(geo) {
  const lat = (geo.bbox.latMin + geo.bbox.latMax) / 2;
  const lon = (geo.bbox.lonMin + geo.bbox.lonMax) / 2;
  if (lon > 60 && lon < 150 && lat > 0)  return 'asia';
  if (lon > 100 && lat < 20)             return 'se_asia';
  if (lon > -15 && lon < 45 && lat > 30) return 'europe';
  if (lon > -15 && lon < 60 && lat < 30) return 'africa_me';
  return 'other';
}

function buildPrompt(nations, webDataMap, alreadyPlaced, MAP_AREAS_HINT) {
  const allPlaced = Object.entries(alreadyPlaced);
  const recentIds = new Set(allPlaced.slice(-10).map(([id]) => id));
  const batchRegion = nations[0]
    ? (() => {
        const id = nations[0].id;
        if (/awa|harima|kii|yamato|chu|qin|wei|yan|baekje|goguryeo|pegu|kedah/.test(id)) return 'asia';
        if (/rome|carthage|greek|macedon|sparta|athens|gaul|celt/.test(id)) return 'europe';
        return 'other';
      })() : 'other';
  const neighbors = allPlaced
    .filter(([id, geo]) => recentIds.has(id) || getWorldRegion(geo) === batchRegion)
    .slice(-30);
  const placedContext = neighbors.length
    ? '\n\nУЖЕ РАЗМЕЩЁННЫЕ СОСЕДНИЕ НАЦИИ (избегай перекрытий):\n' +
      neighbors.map(([id, g]) =>
        `  ${id}: bbox=[${g.bbox.latMin},${g.bbox.latMax},${g.bbox.lonMin},${g.bbox.lonMax}]`
      ).join('\n')
    : '';

  const natList = nations.map(n => {
    const web = webDataMap[n.id] ?? {};
    const lines = [
      `  ${n.id} (${n.name}):`,
      `    gov=${n.government}, pop=${n.population}`,
      `    note="${n.historical_note}"`,
    ];
    if (n.symbolic_regions?.length) lines.push(`    symbolic_regions=[${n.symbolic_regions.join(',')}]`);
    if (web.pleiades) {
      const p = web.pleiades;
      lines.push(`    [PLEIADES] title="${p.title}", desc="${p.description}"`);
      if (p.reprPoint) lines.push(`    [PLEIADES] reprPoint=[lon=${p.reprPoint[0]}, lat=${p.reprPoint[1]}]`);
      if (p.bbox) lines.push(`    [PLEIADES] bbox=[lonMin=${p.bbox[0]}, latMin=${p.bbox[1]}, lonMax=${p.bbox[2]}, latMax=${p.bbox[3]}]`);
    } else { lines.push(`    [PLEIADES] нет данных`); }
    if (web.wikipedia) {
      const w = web.wikipedia;
      lines.push(`    [WIKIPEDIA] "${w.title}": ${w.extract}`);
      if (w.coordinates) lines.push(`    [WIKIPEDIA] coords=[lat=${w.coordinates.lat}, lon=${w.coordinates.lon}]`);
    } else { lines.push(`    [WIKIPEDIA] нет данных`); }
    return lines.join('\n');
  }).join('\n\n');

  return {
    system: `Ты историко-географический эксперт по античному миру 304 года до н.э.
Тебе предоставлены РЕАЛЬНЫЕ данные из баз Pleiades (античная география) и Wikipedia.
Используй эти данные как основу для точных координат.
Отвечай ТОЛЬКО валидным JSON. Никакого текста вне JSON.`,
    user: `Список государств игры Pax Historia (304 BC):\n\n${natList}${placedContext}

Для каждого государства укажи его РЕАЛЬНЫЕ географические границы в 304 BC.
Верни JSON объект где ключ = ID государства:

{
  "<nation_id>": {
    "bbox": { "latMin": число, "latMax": число, "lonMin": число, "lonMax": число },
    "priority": число,
    "capital": { "lat": число, "lon": число },
    "notes": "источник и обоснование"
  }
}

ГЕОГРАФИЧЕСКИЕ ОБЛАСТИ ИГРОВОЙ КАРТЫ:
${MAP_AREAS_HINT}

ПРАВИЛА:
- bbox нации ДОЛЖЕН попадать в соответствующую область карты
- Если есть данные Pleiades с reprPoint — используй как координаты столицы
- НЕ перекрывай bbox уже размещённых наций
- Для мелких полисов bbox ~0.5-2 градуса, для царств ~5-15, для империй ~15-30
- priority: город=1-2, полис=3-4, царство=5-7, держава=8-10

Ориентиры: Афины lat 37.5-38.5 lon 22.5-24.5, Рим lat 41.5-42.5 lon 12.0-13.0`
  };
}

async function callClaude(system, user, API_KEY) {
  const body = { model: MODEL, max_tokens: MAX_TOKENS, temperature: 0, system, messages: [{ role: 'user', content: user }] };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.status === 429) { await sleep(60_000); continue; }
      if (resp.status >= 500)  { await sleep(10_000 * (attempt + 1)); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const raw  = data?.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '')
        .replace(/\/\/[^\n]*/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(5000);
    }
  }
}

function saveResults(data) {
  const OUT_PATH = path.join(ROOT, 'data', 'nation_geo.js');
  const content = `// AUTO-GENERATED: исторические границы наций 304 BC\nvar NATION_GEO = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUT_PATH, content, 'utf8');
}

// ─── Основной цикл генерации ──────────────────────────────────────
async function runGeneration(API_KEY) {
  running  = true;
  stopFlag = false;

  try {
    // Загрузка map areas
    const MAP_AREAS_PATH = path.join(ROOT, 'data', 'map_areas.json');
    const MAP_AREAS = fs.existsSync(MAP_AREAS_PATH)
      ? JSON.parse(fs.readFileSync(MAP_AREAS_PATH, 'utf8')) : {};
    const MAP_AREAS_HINT = Object.entries(MAP_AREAS)
      .filter(([, v]) => v.count >= 3)
      .map(([name, v]) => `  ${name}: lat[${v.latMin}..${v.latMax}] lon[${v.lonMin}..${v.lonMax}]`)
      .join('\n');

    // Загрузка наций
    const nCode = fs.readFileSync(path.join(ROOT, 'data', 'nations.js'), 'utf8')
      .replace(/^const /mg, 'var ').replace(/^let /mg, 'var ');
    const ns = vm.createContext({ console });
    vm.runInContext(nCode, ns);
    const NATIONS = ns.INITIAL_GAME_STATE?.nations ?? {};

    // Загрузка существующих результатов
    const OUT_PATH = path.join(ROOT, 'data', 'nation_geo.js');
    let existing = {};
    if (fs.existsSync(OUT_PATH)) {
      try {
        const c = fs.readFileSync(OUT_PATH, 'utf8');
        const s = vm.createContext({ console });
        vm.runInContext(c, s);
        existing = s.NATION_GEO ?? {};
      } catch {}
    }

    function hasRRegions(nation) { return (nation.regions ?? []).some(r => /^r\d+$/.test(r)); }
    const todo = Object.entries(NATIONS)
      .filter(([id, n]) => !hasRRegions(n) && !existing[id] && id !== 'neutral')
      .map(([id, n]) => ({
        id,
        name:             n.name ?? id,
        government:       n.government?.type ?? 'unknown',
        population:       n.population?.total ?? 0,
        historical_note:  n.historical_note?.slice(0, 200) ?? '',
        symbolic_regions: (n.regions ?? []).filter(r => !/^r\d+$/.test(r)).slice(0, 5),
      }));

    const batches = [];
    for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

    emit({ type: 'start', total: todo.length, batches: batches.length, already: Object.keys(existing).length });
    log(`Наций для обработки: ${todo.length}, батчей: ${batches.length}`);

    const results = { ...existing };
    // Отправляем уже существующие данные в браузер
    emit({ type: 'existing', data: existing });

    let webHits = { pleiades: 0, wikipedia: 0, none: 0 };

    for (let bi = 0; bi < batches.length; bi++) {
      if (stopFlag) { log('⏹ Остановлено пользователем'); break; }

      const batch  = batches[bi];
      const ids    = batch.map(n => n.id);
      emit({ type: 'batch_start', batch_idx: bi + 1, total_batches: batches.length, ids });
      log(`\nБатч ${bi + 1}/${batches.length}: ${ids.join(', ')}`);

      // 1) Web-поиск
      const webDataMap = {};
      for (const nation of batch) {
        if (stopFlag) break;
        const web = await gatherWebData(nation);
        webDataMap[nation.id] = web;
        const hasPl = !!web.pleiades;
        const hasWi = !!web.wikipedia;
        if (hasPl) webHits.pleiades++;
        if (hasWi) webHits.wikipedia++;
        if (!hasPl && !hasWi) webHits.none++;
        emit({ type: 'web_search', id: nation.id, name: nation.name, pleiades: hasPl, wikipedia: hasWi });
        log(`    ${nation.id}: ${hasPl ? 'Pleiades✓' : 'Pleiades✗'} ${hasWi ? 'Wiki✓' : 'Wiki✗'}`);
        await sleep(200);
      }
      if (stopFlag) break;

      // 2) Claude
      try {
        const { system, user } = buildPrompt(batch, webDataMap, results, MAP_AREAS_HINT);
        log(`  Запрос к Claude...`);
        const geoData = await callClaude(system, user, API_KEY);

        const batchResults = [];
        for (const [id, geo] of Object.entries(geoData)) {
          if (!geo?.bbox) { log(`  ⚠ ${id}: нет bbox`); continue; }
          const { latMin, latMax, lonMin, lonMax } = geo.bbox;
          if (latMin >= latMax || lonMin >= lonMax) { log(`  ⚠ ${id}: перевёрнутый bbox`); continue; }
          if (latMin < -90 || latMax > 90 || lonMin < -180 || lonMax > 180) { log(`  ⚠ ${id}: bbox вне планеты`); continue; }
          if ((latMax - latMin) > 80 || (lonMax - lonMin) > 120) { log(`  ⚠ ${id}: bbox слишком большой`); continue; }
          results[id] = geo;
          batchResults.push({ id, name: batch.find(n => n.id === id)?.name ?? id, geo });
          log(`  ✓ ${id}: [${latMin},${latMax}] × [${lonMin},${lonMax}]`);
        }

        saveResults(results);
        emit({ type: 'batch_done', batch_idx: bi + 1, total_batches: batches.length, results: batchResults, total_so_far: Object.keys(results).length });
        log(`  Сохранено. Всего: ${Object.keys(results).length}. Осталось батчей: ${batches.length - bi - 1}`);
      } catch (e) {
        log(`  ✗ Батч ${bi + 1} ошибка: ${e.message} — пропускаю`);
        emit({ type: 'batch_error', batch_idx: bi + 1, error: e.message });
      }

      if (bi < batches.length - 1) await sleep(DELAY_MS);
    }

    emit({ type: 'done', total: Object.keys(results).length, web_hits: webHits });
    log(`\n✅ Готово! Обработано: ${Object.keys(results).length} наций`);
  } finally {
    running = false;
  }
}

// ════════════════════════════════════════════════════════════════
// HTTP СЕРВЕР
// ════════════════════════════════════════════════════════════════

const HTML_PATH = path.join(__dirname, 'geo_monitor.html');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ─── CORS ────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ─── SSE ─────────────────────────────────────────────────────
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');
    // Отправляем статус только новому клиенту
    res.write(`data: ${JSON.stringify({ type: 'status', running })}\n\n`);
    clients.add(res);

    req.on('close', () => clients.delete(res));
    return;
  }

  // ─── Start ───────────────────────────────────────────────────
  if (url.pathname === '/start' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let API_KEY;
      try { API_KEY = JSON.parse(body).api_key; } catch {}
      if (!API_KEY) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'api_key required' }));
        return;
      }
      if (running) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'already running' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      runGeneration(API_KEY).catch(e => {
        log(`Критическая ошибка: ${e.message}`);
        emit({ type: 'fatal', error: e.message });
      });
    });
    return;
  }

  // ─── Stop ────────────────────────────────────────────────────
  if (url.pathname === '/stop' && req.method === 'POST') {
    stopFlag = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ─── Статус ──────────────────────────────────────────────────
  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running }));
    return;
  }

  // ─── Данные nation_geo.js ────────────────────────────────────
  if (url.pathname === '/nation_geo.js') {
    const fpath = path.join(ROOT, 'data', 'nation_geo.js');
    if (fs.existsSync(fpath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(fs.readFileSync(fpath, 'utf8'));
    } else {
      res.writeHead(404); res.end();
    }
    return;
  }

  // ─── Данные map_areas.json ────────────────────────────────────
  if (url.pathname === '/map_areas.json') {
    const fpath = path.join(ROOT, 'data', 'map_areas.json');
    if (fs.existsSync(fpath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(fpath, 'utf8'));
    } else {
      res.writeHead(404); res.end();
    }
    return;
  }

  // ─── HTML страница ────────────────────────────────────────────
  if (url.pathname === '/') {
    if (fs.existsSync(HTML_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(HTML_PATH, 'utf8'));
    } else {
      res.writeHead(404); res.end('geo_monitor.html not found');
    }
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log(`\n🗺  Geo Monitor запущен: http://localhost:${PORT}`);
  console.log('   Открой в браузере, введи API ключ и нажми "Старт"\n');
});
