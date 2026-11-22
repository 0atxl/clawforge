import http from 'node:http';
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { PROMPT_CACHE_KEY_CAD } from '../shared/cad-schema.js';

/**
 * Optional Transparent Cerebras Telemetry Sidecar Proxy (127.0.0.1:18799)
 *
 * Allows standard, UNPATCHED OpenClaw to talk to Cerebras while ClawForge observes
 * 100% authentic server-reported Cerebras metrics in real time:
 *   - time_info.completion_time / prompt_time / queue_time
 *   - usage.prompt_tokens / completion_tokens / prompt_tokens_details.cached_tokens
 *   - x-ratelimit-remaining-tokens-minute & retry-after headers
 *   - Enforces stable prompt_cache_key when missing to protect the 50K uncached TPM bucket.
 */

export const telemetryBus = new EventEmitter();
let latestProxyMetrics = null;

export function getLatestProxyMetrics() {
  return latestProxyMetrics;
}

function parseSseTelemetryLine(line, state) {
  if (!line.startsWith('data:')) return;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return;
  try {
    const obj = JSON.parse(payload);
    if (!state.firstTokenAt && obj.choices?.[0]?.delta) {
      const d = obj.choices[0].delta;
      if (d.content || d.reasoning || d.tool_calls) {
        state.firstTokenAt = performance.now();
      }
    }
    if (obj.usage) state.usage = obj.usage;
    if (obj.time_info) state.timeInfo = obj.time_info;
    if (obj.model) state.model = obj.model;
  } catch {
    // Ignore non-JSON keepalive or split chunks
  }
}

export function startTelemetryProxy(port = config.telemetryProxy.port) {
  const server = http.createServer(async (req, res) => {
    // Local health endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, target: config.cerebras.baseUrl, latest: latestProxyMetrics }));
      return;
    }

    const upstreamUrl = `${config.cerebras.baseUrl}${req.url.replace(/^\/v1/, '')}`;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let bodyBuf = Buffer.concat(chunks);

    // Inject stable prompt_cache_key & include_usage for streaming JSON chat completions
    if (req.method === 'POST' && req.url.includes('/chat/completions') && bodyBuf.length > 0) {
      try {
        const parsed = JSON.parse(bodyBuf.toString('utf8'));
        if (!parsed.prompt_cache_key) {
          parsed.prompt_cache_key = PROMPT_CACHE_KEY_CAD;
        }
        if (parsed.stream) {
          parsed.stream_options = { ...(parsed.stream_options || {}), include_usage: true };
        }
        bodyBuf = Buffer.from(JSON.stringify(parsed));
      } catch {
        // Forward untouched if not JSON
      }
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding'].includes(lower)) {
        continue;
      }
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    if (!headers.has('authorization') && config.cerebras.apiKey) {
      headers.set('authorization', `Bearer ${config.cerebras.apiKey}`);
    }
    headers.set('accept-encoding', 'gzip');

    const startedAt = performance.now();
    const state = {
      startedAt,
      firstTokenAt: null,
      usage: null,
      timeInfo: null,
      model: null
    };

    try {
      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf
      });

      const outHeaders = {};
      upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lower)) return;
        outHeaders[key] = value;
      });
      res.writeHead(upstream.status, outHeaders);

      const rateLimitRemaining = upstream.headers.get('x-ratelimit-remaining-tokens-minute');
      const rateLimitLimit = upstream.headers.get('x-ratelimit-limit-tokens-minute');

      if (!upstream.body) {
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let sseBuf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(value);
        sseBuf += decoder.decode(value, { stream: true });
        const lines = sseBuf.split('\n');
        sseBuf = lines.pop() || '';
        for (const line of lines) {
          parseSseTelemetryLine(line.trim(), state);
        }
      }
      if (sseBuf.trim()) parseSseTelemetryLine(sseBuf.trim(), state);
      res.end();

      const totalMs = Math.round(performance.now() - startedAt);
      const ttftMs = state.firstTokenAt ? Math.round(state.firstTokenAt - startedAt) : totalMs;
      const promptTokens = state.usage?.prompt_tokens || 0;
      const completionTokens = state.usage?.completion_tokens || 0;
      const cachedTokens = state.usage?.prompt_tokens_details?.cached_tokens || 0;
      const serverCompletionSec = state.timeInfo?.completion_time || 0;
      const serverTps = serverCompletionSec > 0 && completionTokens > 0
        ? Math.round(completionTokens / serverCompletionSec)
        : 0;

      latestProxyMetrics = {
        timestamp: Date.now(),
        status: upstream.status,
        model: state.model || config.cerebras.model,
        ttftMs,
        totalMs,
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheHitPct: promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0,
        serverTps,
        timeInfo: state.timeInfo,
        rateLimitRemaining: rateLimitRemaining ? Number(rateLimitRemaining) : null,
        rateLimitLimit: rateLimitLimit ? Number(rateLimitLimit) : null
      };
      telemetryBus.emit('metrics', latestProxyMetrics);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Telemetry proxy upstream error', message: err.message }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[ClawForge Telemetry Proxy] Listening on http://127.0.0.1:${port}/v1 -> ${config.cerebras.baseUrl}`);
  });

  server.on('error', (err) => {
    console.warn(`[ClawForge Telemetry Proxy] Could not bind port ${port}: ${err.message}`);
  });

  return server;
}

// Standalone execution (`npm run proxy`)
if (import.meta.url === `file://${process.argv[1]}`) {
  startTelemetryProxy();
}
