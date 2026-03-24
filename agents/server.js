// agents/server.js — HTTP-сервер с SSE для браузерного UI

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadExistingChains, loadAllInputs } from './file_io.js';
import { runBuilder }                        from './chain_builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR    = path.join(__dirname, 'ui');
const DATA_DIR  = path.join(__dirname, '..', 'data');
const PORT      = process.env.PORT ?? 3000;

// ─── Состояние сервера ────────────────────────────────────────────────────────

const state = {
  apiKey:    process.env.ANTHROPIC_API_KEY ?? null,
  running:   false,
  stopFn:    null,
  sseClients: new Set(),   // активные SSE-соединения
};

// ─── SSE broadcast ────────────────────────────────────────────────────────────

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of state.sseClients) {
    try { res.write(payload); } catch (_) { state.sseClients.delete(res); }
  }
}

// ─── emit — перевод событий агента в SSE ──────────────────────────────────────

function makeEmit() {
  const emit = (ev) => broadcast('agent', ev);
  return emit;
}

// ─── JSON body helper ─────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── Статические файлы ────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
};

function serveStatic(res, filePath) {
  try {
    const ext  = path.extname(filePath);
    const mime = MIME[ext] ?? 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  } catch (_) {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ─── Маршруты ─────────────────────────────────────────────────────────────────

async function router(req, res) {
  const url = new URL(req.url, `http://localhost`);

  // ── GET / → index.html ──
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return serveStatic(res, path.join(UI_DIR, 'index.html'));
  }

  // ── GET /ui/* → статика ──
  if (req.method === 'GET' && url.pathname.startsWith('/ui/')) {
    return serveStatic(res, path.join(UI_DIR, url.pathname.slice(4)));
  }

  // ── GET /api/status ──
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const chains = loadExistingChains();
    return json(res, 200, {
      hasKey:     !!state.apiKey,
      running:    state.running,
      chainCount: Object.keys(chains).length,
    });
  }

  // ── POST /api/key ──
  if (req.method === 'POST' && url.pathname === '/api/key') {
    const body = await readBody(req);
    if (!body.key || body.key.trim().length < 20) {
      return json(res, 400, { error: 'Ключ слишком короткий' });
    }
    state.apiKey = body.key;
    return json(res, 200, { ok: true });
  }

  // ── POST /api/start ──
  if (req.method === 'POST' && url.pathname === '/api/start') {
    if (state.running) return json(res, 409, { error: 'Агент уже запущен' });
    if (!state.apiKey) return json(res, 400, { error: 'API ключ не установлен' });

    state.running = true;
    broadcast('agent', { type: 'log', level: 'log', msg: 'Агент запущен...' });

    const emit = makeEmit();
    state.stopFn = () => { if (emit._stop) emit._stop(); };

    runBuilder(state.apiKey, emit)
      .catch(e => broadcast('agent', { type: 'error', goodId: '_fatal', msg: e.message }))
      .finally(() => {
        state.running = false;
        state.stopFn  = null;
        broadcast('agent', { type: 'log', level: 'log', msg: '── Агент завершён ──' });
      });

    return json(res, 200, { ok: true });
  }

  // ── POST /api/stop ──
  if (req.method === 'POST' && url.pathname === '/api/stop') {
    if (state.stopFn) state.stopFn();
    return json(res, 200, { ok: true });
  }

  // ── GET /api/chains ──
  if (req.method === 'GET' && url.pathname === '/api/chains') {
    const chains = loadExistingChains();
    return json(res, 200, chains);
  }

  // ── GET /api/graph ──
  if (req.method === 'GET' && url.pathname === '/api/graph') {
    const graphPath = path.join(DATA_DIR, 'chains_graph.js');
    if (!fs.existsSync(graphPath)) return json(res, 200, null);
    try {
      const { createContext, runInContext } = await import('vm');
      const sandbox = createContext({});
      runInContext(fs.readFileSync(graphPath, 'utf8'), sandbox);
      return json(res, 200, sandbox.CHAINS_GRAPH ?? null);
    } catch (_) {
      return json(res, 200, null);
    }
  }

  // ── GET /api/stream — SSE ──
  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');

    // Отправляем текущий статус сразу
    const chains = loadExistingChains();
    const total  = Object.keys(loadAllInputs().GOODS).length;
    res.write(`event: agent\ndata: ${JSON.stringify({
      type: 'status',
      total,
      done:   Object.keys(chains).length,
      queue:  total - Object.keys(chains).length,
    })}\n\n`);

    state.sseClients.add(res);
    req.on('close', () => state.sseClients.delete(res));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

// ─── Запуск ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  router(req, res).catch(e => {
    console.error('Router error:', e.message);
    if (!res.headersSent) { res.writeHead(500); res.end('Internal error'); }
  });
});

server.listen(PORT, () => {
  console.log(`\n  Pax Historia Chain Builder UI`);
  console.log(`  ─────────────────────────────`);
  console.log(`  http://localhost:${PORT}\n`);
});
