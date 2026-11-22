import { config } from './config.js';
import { getLatestProxyMetrics } from './telemetry-proxy.js';

/**
 * ClawForge LLM & OpenClaw Gateway Streaming Client
 *
 * Endpoint Etiquette & Anti-Congestion Guarantees:
 *  1. Strict single-lane Cerebras mutex: NEVER allows concurrent requests to moonshotai-kimi-k3.1-pro-trial.
 *  2. Zero retry storms (maxRetries = 0): surfaces clean 429 / Retry-After feedback to UI immediately.
 *  3. Supports OpenClaw Gateway (/v1/chat/completions), Cerebras Direct, and separate live GPU race lane.
 */

let cerebrasLaneActive = null;

export function isCerebrasLaneBusy() {
  return Boolean(cerebrasLaneActive);
}

export function acquireCerebrasLane(label = 'run') {
  if (cerebrasLaneActive) {
    const err = new Error(
      `Cerebras single-lane lock active ("${cerebrasLaneActive.label}" in progress). Wait for completion to avoid congesting shared hackathon TPM.`
    );
    err.statusCode = 409;
    throw err;
  }
  cerebrasLaneActive = { label, startedAt: Date.now() };
  let released = false;
  return () => {
    if (!released) {
      released = true;
      cerebrasLaneActive = null;
    }
  };
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

/**
 * Streams an OpenAI-compatible SSE chat completion (OpenClaw Gateway, Cerebras Direct, or GPU provider).
 * Zero retries on error/429 (honors endpoint etiquette!).
 */
export async function streamChatCompletion({
  url,
  headers = {},
  body,
  signal,
  onDelta = null,
  captureProxyMetrics = false
}) {
  const startedAt = performance.now();
  const proxyBeforeTs = getLatestProxyMetrics()?.timestamp || 0;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Accept-Encoding': 'gzip',
      ...headers
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const retryAfter = res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-tokens-minute');
    const err = new Error(
      res.status === 429
        ? `Rate limited (HTTP 429) — pausing politely (no automatic retry storm).${retryAfter ? ` Retry after ~${retryAfter}s.` : ''} ${errText.slice(0, 220)}`
        : `Upstream LLM returned HTTP ${res.status}: ${errText.slice(0, 280)}`
    );
    err.statusCode = res.status;
    err.retryAfterSeconds = retryAfter ? Number(retryAfter) : null;
    throw err;
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rateLimitRemaining = res.headers.get('x-ratelimit-remaining-tokens-minute');

  // Non-streaming JSON fallback (in case a gateway/provider returns application/json)
  if (contentType.includes('application/json')) {
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const reasoning = data.choices?.[0]?.message?.reasoning || '';
    const totalMs = Math.round(performance.now() - startedAt);
    const completionTokens = data.usage?.completion_tokens || estimateTokens(content + reasoning);
    const promptTokens = data.usage?.prompt_tokens || 0;
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
    const serverSec = data.time_info?.completion_time || 0;
    const tps = serverSec > 0
      ? Math.round(completionTokens / serverSec)
      : Math.round((completionTokens / Math.max(totalMs, 1)) * 1000);
    const tpm = Math.round(tps * 60);
    if (onDelta && content) {
      onDelta({ text: content, reasoning, tokensSoFar: completionTokens, tps, tpm, ttftMs: totalMs });
    }
    return {
      content,
      reasoning,
      ttftMs: totalMs,
      totalMs,
      promptTokens,
      completionTokens,
      cachedTokens,
      cacheHitPct: promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0,
      tps,
      tpm,
      serverTps: serverSec > 0 ? Math.round(completionTokens / serverSec) : null,
      timeInfo: data.time_info || null,
      rateLimitRemaining: rateLimitRemaining ? Number(rateLimitRemaining) : null
    };
  }

  // Streaming SSE parser
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuf = '';
  let content = '';
  let reasoning = '';
  let firstTokenAt = null;
  let usage = null;
  let timeInfo = null;
  let chunkCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    sseBuf += decoder.decode(value, { stream: true });
    const lines = sseBuf.split('\n');
    sseBuf = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (parsed.error) {
        const errMsg = typeof parsed.error === 'string'
          ? parsed.error
          : (parsed.error.message || JSON.stringify(parsed.error));
        const err = new Error(`Upstream stream error: ${errMsg}`);
        const isRateLimit = /429|rate.?limit|queue_exceeded|too_many_requests/i.test(
          `${errMsg} ${parsed.error.code || ''} ${parsed.error.type || ''}`
        );
        err.statusCode = isRateLimit
          ? 429
          : (Number(parsed.error.status || parsed.error.code) || 502);
        throw err;
      }

      if (parsed.usage) usage = parsed.usage;
      if (parsed.time_info) timeInfo = parsed.time_info;

      const delta = parsed.choices?.[0]?.delta;
      const textChunk = typeof delta?.content === 'string' ? delta.content : '';
      const reasonChunk = typeof delta?.reasoning === 'string'
        ? delta.reasoning
        : (typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '');

      if (textChunk || reasonChunk) {
        chunkCount++;
        if (firstTokenAt === null) {
          firstTokenAt = performance.now();
        }
        content += textChunk;
        reasoning += reasonChunk;

        if (onDelta) {
          const now = performance.now();
          const genSec = Math.max((now - firstTokenAt) / 1000, 0.05);
          const estToks = estimateTokens(content + reasoning);
          const tps = Math.round(estToks / genSec);
          onDelta({
            text: textChunk,
            reasoning: reasonChunk,
            tokensSoFar: estToks,
            tps,
            tpm: Math.round(tps * 60),
            ttftMs: Math.round(firstTokenAt - startedAt),
            elapsedMs: Math.round(now - startedAt)
          });
        }
      }
    }
  }

  const totalMs = Math.round(performance.now() - startedAt);
  const ttftMs = firstTokenAt ? Math.round(firstTokenAt - startedAt) : totalMs;
  const decodeSec = Math.max((totalMs - ttftMs) / 1000, 0.02);

  // If OpenClaw routed via our transparent telemetry proxy, enrich with authentic server metrics!
  let proxyMetrics = null;
  if (captureProxyMetrics) {
    const latest = getLatestProxyMetrics();
    if (latest && latest.timestamp > proxyBeforeTs) {
      proxyMetrics = latest;
    }
  }

  const promptTokens = usage?.prompt_tokens ?? proxyMetrics?.promptTokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? proxyMetrics?.completionTokens ?? estimateTokens(content + reasoning);
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? proxyMetrics?.cachedTokens ?? 0;
  const finalTimeInfo = timeInfo || proxyMetrics?.timeInfo || null;
  const serverSec = finalTimeInfo?.completion_time || 0;
  const serverTps = serverSec > 0 && completionTokens > 0
    ? Math.round(completionTokens / serverSec)
    : (proxyMetrics?.serverTps || null);
  const clientTps = Math.round(completionTokens / decodeSec);

  const finalTps = serverTps || clientTps;

  return {
    content,
    reasoning,
    ttftMs: proxyMetrics?.ttftMs || ttftMs,
    totalMs,
    chunkCount,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheHitPct: promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : (proxyMetrics?.cacheHitPct || 0),
    tps: finalTps,
    tpm: Math.round(finalTps * 60),
    serverTps,
    clientTps,
    timeInfo: finalTimeInfo,
    rateLimitRemaining: rateLimitRemaining ? Number(rateLimitRemaining) : (proxyMetrics?.rateLimitRemaining ?? null)
  };
}

/**
 * Calls the primary backend (OpenClaw Gateway OR Cerebras Direct).
 */
export async function callPrimaryLLM({
  backend = config.backend,
  agentId = config.openclaw.cadAgentId,
  sessionKey = 'clawforge-studio-session',
  promptCacheKey,
  messages,
  maxTokens = config.cerebras.maxTokensDraft,
  useTestModel = false,
  jsonObject = true,
  signal,
  onDelta
}) {
  if (backend === 'openclaw') {
    const url = `${config.openclaw.gatewayUrl}/v1/chat/completions`;
    // Omit unscoped x-openclaw-session-key so OpenClaw 2026.11 derives agent:<id>:openai-user:<user>
    const headers = {
      'x-openclaw-agent-id': agentId
    };
    if (useTestModel && config.cerebras.testModel) {
      headers['x-openclaw-model'] = `cerebras/${config.cerebras.testModel}`;
    }
    if (config.openclaw.gatewayToken) {
      headers.Authorization = `Bearer ${config.openclaw.gatewayToken}`;
    }
    const body = {
      model: `openclaw/${agentId}`,
      user: sessionKey,
      messages,
      max_tokens: maxTokens,
      stream: true
    };
    try {
      return await streamChatCompletion({
        url,
        headers,
        body,
        signal,
        onDelta,
        captureProxyMetrics: true
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.statusCode) {
        throw err;
      }
      const wrapped = new Error(
        `OpenClaw Gateway not reachable at ${config.openclaw.gatewayUrl} — start OpenClaw Gateway or switch Backend to Cerebras Direct.`
      );
      wrapped.statusCode = 502;
      throw wrapped;
    }
  }

  if (backend === 'cerebras-direct') {
    if (!config.cerebras.apiKey) {
      const err = new Error('CEREBRAS_API_KEY is not set in .env for cerebras-direct mode.');
      err.statusCode = 400;
      throw err;
    }
    const model = useTestModel ? config.cerebras.testModel : config.cerebras.model;
    const url = `${config.cerebras.baseUrl}/chat/completions`;
    const body = {
      model,
      messages,
      max_completion_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      prompt_cache_key: promptCacheKey
    };
    if (useTestModel) {
      body.disable_reasoning = true;
      if (jsonObject) {
        body.response_format = { type: 'json_object' };
      }
    } else if (config.cerebras.reasoningEffort) {
      body.reasoning_effort = config.cerebras.reasoningEffort;
    }
    return streamChatCompletion({
      url,
      headers: { Authorization: `Bearer ${config.cerebras.apiKey}` },
      body,
      signal,
      onDelta
    });
  }

  throw new Error(`Unsupported live backend "${backend}"`);
}

/**
 * Optional Live GPU Provider Side-by-Side Comparison Lane.
 * Completely independent from Cerebras (never touches the Cerebras single-lane mutex).
 */
export async function callLiveGpuLane({ messages, maxTokens = 4096, signal, onDelta }) {
  if (!config.gpu.apiKey || !config.gpu.baseUrl || !config.gpu.model) {
    return null;
  }
  const url = `${config.gpu.baseUrl}/chat/completions`;
  const body = {
    model: config.gpu.model,
    messages,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true }
  };
  if (config.gpu.baseUrl.includes('nvidia.com') || /nemotron/i.test(config.gpu.model)) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  return streamChatCompletion({
    url,
    headers: { Authorization: `Bearer ${config.gpu.apiKey}` },
    body,
    signal,
    onDelta
  });
}
