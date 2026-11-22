import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, getPublicCapabilities } from './config.js';
import { DEMO_PRESETS } from '../shared/demo-presets.js';
import { isCerebrasLaneBusy } from './llm-client.js';
import { startTelemetryProxy, telemetryBus, getLatestProxyMetrics } from './telemetry-proxy.js';
import { runForgePipeline } from './forge-pipeline.js';
import { runGiftShowroomSearch } from './gift-hunter.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function corsHeaders(req) {
  const configured = config.corsOrigin;
  let originHeader = '*';
  if (configured !== '*') {
    const allowed = configured.split(',').map((s) => s.trim()).filter(Boolean);
    const reqOrigin = req?.headers?.origin;
    originHeader = reqOrigin && allowed.includes(reqOrigin) ? reqOrigin : (allowed[0] || '*');
  }
  return {
    'Access-Control-Allow-Origin': originHeader,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function sendJson(req, res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(req)
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('Request payload too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function initSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...corsHeaders(req)
  });
  return (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

export function createClawForgeServer({ startProxy = config.telemetryProxy.enabled } = {}) {
  let proxyServer = null;
  if (startProxy) {
    proxyServer = startTelemetryProxy(config.telemetryProxy.port);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.writeHead(204, {
        ...corsHeaders(req),
        'Access-Control-Max-Age': '86400'
      });
      res.end();
      return;
    }

    // -------------------------------------------------------------------------
    // API: Health & Public Capabilities (NEVER leaks secrets!)
    // -------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(req, res, 200, {
        ok: true,
        name: 'ClawForge',
        laneBusy: isCerebrasLaneBusy(),
        capabilities: getPublicCapabilities(),
        latestProxyMetrics: getLatestProxyMetrics()
      });
      return;
    }

    // -------------------------------------------------------------------------
    // API: Built-in Studio Presets
    // -------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/presets') {
      const list = Object.values(DEMO_PRESETS).map((p) => ({
        id: p.id,
        label: p.label,
        prompt: p.prompt,
        draft: p.draft
      }));
      sendJson(req, res, 200, { presets: list });
      return;
    }

    // -------------------------------------------------------------------------
    // API: Real-time Telemetry Proxy SSE stream
    // -------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/telemetry') {
      const emit = initSse(req, res);
      const latest = getLatestProxyMetrics();
      if (latest) emit('metrics', latest);
      const onMetrics = (m) => emit('metrics', m);
      telemetryBus.on('metrics', onMetrics);
      const ping = setInterval(() => {
        if (!res.writableEnded) res.write(': ping\n\n');
      }, 15000);
      req.on('close', () => {
        clearInterval(ping);
        telemetryBus.off('metrics', onMetrics);
      });
      return;
    }

    // -------------------------------------------------------------------------
    // API: Single-Pass 3D CAD Generation Pipeline (SSE)
    // -------------------------------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/forge') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        sendJson(req, res, err.statusCode || 400, { error: err.message });
        return;
      }

      const emit = initSse(req, res);
      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });

      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : config.port;

      try {
        await runForgePipeline({
          prompt: body.prompt,
          backend: body.backend || config.backend,
          presetId: body.presetId || '',
          useTestModel: Boolean(body.useTestModel),
          includeGpuRace: Boolean(body.includeGpuRace),
          enableVisualHeal: false,
          serverPort: port,
          signal: controller.signal,
          emit
        });
      } catch (err) {
        console.error('[ClawForge /api/forge Error]', err.message);
        if (!controller.signal.aborted) {
          emit('pipeline_error', {
            message: err.message,
            statusCode: err.statusCode || 500,
            retryAfterSeconds: err.retryAfterSeconds || null
          });
        }
      } finally {
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // -------------------------------------------------------------------------
    // API: Santa's 3D Gift Showroom Search (SSE via Cerebras Direct or OpenClaw)
    // -------------------------------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/showroom/search') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        sendJson(req, res, err.statusCode || 400, { error: err.message });
        return;
      }

      const emit = initSse(req, res);
      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });

      try {
        await runGiftShowroomSearch({
          brief: body.brief,
          backend: body.backend || config.backend,
          useTestModel: Boolean(body.useTestModel),
          initialPreview: Boolean(body.initialPreview),
          signal: controller.signal,
          emit
        });
      } catch (err) {
        console.error('[ClawForge /api/showroom/search Error]', err.message);
        if (!controller.signal.aborted) {
          emit('showroom_error', {
            message: err.message,
            statusCode: err.statusCode || 500,
            retryAfterSeconds: err.retryAfterSeconds || null
          });
        }
      } finally {
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // -------------------------------------------------------------------------
    // Static Frontend Serving (built dist/)
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const cleanRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const normalized = path.normalize(cleanRel);
      if (!normalized.startsWith('..')) {
        const distCandidate = path.join(config.distDir, normalized);
        if (serveStaticFile(res, distCandidate)) return;
      }
      const indexFile = path.join(config.distDir, 'index.html');
      if (serveStaticFile(res, indexFile)) return;
    }

    sendJson(req, res, 404, {
      error: 'Not found. Run `npm run build` first or open Vite dev server (`npm run dev`).'
    });
  });

  const shutdown = async () => {
    if (proxyServer) proxyServer.close();
    server.close();
  };

  return { server, proxyServer, shutdown };
}

// Direct start (`node server/index.js`)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, shutdown } = createClawForgeServer();
  server.listen(config.port, config.host, () => {
    console.log(`\n⚡ ClawForge Studio Server ready at http://${config.host}:${config.port}`);
    console.log(`   Default backend: ${config.backend} | CORS origin: ${config.corsOrigin}`);
    console.log(`   Endpoint etiquette: single-lane Cerebras mutex ON, maxRetries=${config.etiquette.maxRetries}\n`);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await shutdown();
      process.exit(0);
    });
  }
}
