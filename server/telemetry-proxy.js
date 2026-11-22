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
    const d = obj.choices?.[0]?.delta;
    if (d) {
      const textChunk = typeof d.content === 'string' ? d.content : '';
      const reasonChunk = typeof d.reasoning === 'string'
        ? d.reasoning
        : (typeof d.reasoning_content === 'string' ? d.reasoning_content : '');
      const hasTool = Boolean(d.tool_calls);

      if ((textChunk || reasonChunk || hasTool) && !state.firstTokenAt) {
        state.firstTokenAt = performance.now();
      }
      if (textChunk) {
        state.contentChars += textChunk.length;
        state.phase = 'streaming';
      } else if (reasonChunk) {
        state.reasoningChars += reasonChunk.length;
        if (state.phase === 'init') state.phase = 'reasoning';
      } else if (hasTool) {
        state.toolChars += 32;
        state.phase = 'tool_call';
      }

      const now = performance.now();
      if (state.firstTokenAt && now - state.lastEmitAt >= 65) {
        state.lastEmitAt = now;
        const totalChars = state.contentChars + state.reasoningChars + state.toolChars;
        const estTokens = Math.max(1, Math.ceil(totalChars / 3.8));
        const genSec = Math.max((now - state.firstTokenAt) / 1000, 0.05);
        const tps = Math.round(estTokens / genSec);
        telemetryBus.emit('delta', {
          phase: state.phase,
          text: textChunk,
          reasoning: reasonChunk,
          tokensSoFar: estTokens,
          reasoningTokens: Math.ceil(state.reasoningChars / 3.8),
          contentTokens: Math.ceil(state.contentChars / 3.8),
          tps,
          tpm: Math.round(tps * 60),
          ttftMs: Math.round(state.firstTokenAt - state.startedAt),
          elapsedMs: Math.round(now - state.startedAt)
        });
      }
    }
    if (obj.usage) state.usage = obj.usage;
    if (obj.time_info) state.timeInfo = obj.time_info;
    if (obj.model) state.model = obj.model;
  } catch {
    // Ignore non-JSON keepalive or split chunks
  }
}

function optimizeCerebrasPayload(parsedObj, targetModel) {
  const clone = { ...parsedObj };
  if (targetModel) {
    clone.model = targetModel;
  }
  if (!clone.prompt_cache_key) {
    clone.prompt_cache_key = PROMPT_CACHE_KEY_CAD;
  }
  if (clone.stream) {
    clone.stream_options = { ...(clone.stream_options || {}), include_usage: true };
  }

  const msgs = Array.isArray(clone.messages) ? clone.messages : [];
  const rawMsgSample = JSON.stringify(msgs).slice(0, 12000);
  const isCadRequest = rawMsgSample.includes('ClawCAD v1') || rawMsgSample.includes('ClawForge CAD Architect');
  const hasToolResult = msgs.some((m) => m && m.role === 'tool');

  // CAD generation is strictly single-pass JSON (0 tools); Shopper needs at most 1 web_search round
  if (isCadRequest || hasToolResult) {
    delete clone.tools;
    delete clone.tool_choice;
  }

  // Enforce Kimi K3.1 Pro with minimal reasoning effort so maximum tokens & speed go to JSON output
  clone.model = config.cerebras.model || 'moonshotai-kimi-k3.1-pro-trial';
  clone.reasoning_effort = 'low';
  delete clone.disable_reasoning;
  return clone;
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
    let parsedJson = null;

    // Inject stable prompt_cache_key, low reasoning_effort & include_usage for streaming JSON chat completions
    if (req.method === 'POST' && req.url.includes('/chat/completions') && bodyBuf.length > 0) {
      try {
        parsedJson = JSON.parse(bodyBuf.toString('utf8'));
        parsedJson = optimizeCerebrasPayload(parsedJson);
        bodyBuf = Buffer.from(JSON.stringify(parsedJson));
      } catch {
        parsedJson = null;
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
      lastEmitAt: 0,
      phase: 'init',
      contentChars: 0,
      reasoningChars: 0,
      toolChars: 0,
      usage: null,
      timeInfo: null,
      model: null
    };

    try {
      let upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf
      });

      // Fast 429 retry for Kimi K3.1 Pro (pure Kimi only)
      if (upstream.status === 429 && parsedJson) {
        for (const delayMs of [650, 1300]) {
          if (upstream.status !== 429) break;
          await upstream.text().catch(() => '');
          await new Promise((r) => setTimeout(r, delayMs));
          upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers,
            body: bodyBuf
          });
        }
      }

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
