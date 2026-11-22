import {
  CAD_SYSTEM_PROMPT,
  PROMPT_CACHE_KEY_CAD,
  validateAndNormalizeCadSpec,
  extractJsonFromText
} from '../shared/cad-schema.js';
import { DEMO_PRESETS } from '../shared/demo-presets.js';
import { config } from './config.js';
import { acquireCerebrasLane, callPrimaryLLM, callLiveGpuLane } from './llm-client.js';

/**
 * ClawForge Single-Pass 3D CAD Orchestrator
 *
 * Strict anti-congestion architecture:
 *   - Single fast pass streaming parametric ClawCAD v1 JSON directly to Three.js
 *   - 0 concurrent Cerebras requests (enforced via acquireCerebrasLane)
 *   - 0 automatic retries on 429 (honors endpoint etiquette)
 *   - 100% static prompt prefix + stable prompt_cache_key for cached TPM efficiency
 */

function pickDemoPreset(prompt = '') {
  const lower = prompt.toLowerCase();
  if (lower.includes('v8') || lower.includes('engine') || lower.includes('piston') || lower.includes('motor')) {
    return DEMO_PRESETS.v8;
  }
  if (lower.includes('claw') || lower.includes('robot') || lower.includes('arm') || lower.includes('gripper')) {
    return DEMO_PRESETS.claw;
  }
  return DEMO_PRESETS.turbofan;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

/**
 * Deterministic paced streamer for offline local development (`demo` backend ONLY).
 * Explicitly tagged as demo mode in every SSE event so it can never be mistaken for live inference.
 */
async function streamDemoJson(obj, { targetTps = 1950, ttftMs = 140, cacheHitPct = 0, signal, onDelta }) {
  const raw = JSON.stringify(obj, null, 2);
  const totalTokens = Math.max(120, Math.round(raw.length / 3.8));
  const startedAt = performance.now();
  await sleep(ttftMs, signal);

  const chunks = 16;
  const stepChars = Math.ceil(raw.length / chunks);
  const targetDecodeMs = Math.max(260, Math.round((totalTokens / targetTps) * 1000));
  const intervalMs = Math.max(16, Math.round(targetDecodeMs / chunks));

  let emitted = 0;
  for (let i = 0; i < chunks; i++) {
    const slice = raw.slice(i * stepChars, (i + 1) * stepChars);
    if (!slice) break;
    emitted += slice.length;
    const elapsedGenSec = Math.max((performance.now() - startedAt - ttftMs) / 1000, 0.02);
    const toks = Math.round((emitted / raw.length) * totalTokens);
    const tps = Math.min(targetTps + 120, Math.max(950, Math.round(toks / elapsedGenSec)));
    onDelta?.({
      text: slice,
      tokensSoFar: toks,
      tps,
      tpm: Math.round(tps * 60),
      ttftMs,
      elapsedMs: Math.round(performance.now() - startedAt)
    });
    await sleep(intervalMs, signal);
  }

  const totalMs = Math.round(performance.now() - startedAt);
  return {
    content: raw,
    ttftMs,
    totalMs,
    promptTokens: 1180,
    completionTokens: totalTokens,
    cachedTokens: Math.round((1180 * cacheHitPct) / 100),
    cacheHitPct,
    tps: targetTps,
    tpm: Math.round(targetTps * 60),
    serverTps: targetTps,
    isDemoFixture: true
  };
}

function tryParseCadSpec(rawContent = '', rawReasoning = '') {
  const raw = (rawContent || '').trim() || (rawReasoning || '').trim();
  if (!raw) return null;
  try {
    const parsed = extractJsonFromText(raw);
    const spec = validateAndNormalizeCadSpec(parsed);
    return spec?.parts?.length >= 1 ? spec : null;
  } catch {
    return null;
  }
}

export async function runForgePipeline({
  prompt,
  backend = config.backend,
  presetId = '',
  useTestModel = false,
  includeGpuRace = false,
  enableVisualHeal = false,
  serverPort = config.port,
  signal,
  emit
}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    throw new Error('Prompt is required to forge a 3D assembly.');
  }

  const isLive = backend !== 'demo';
  const useLiveGpu = isLive && includeGpuRace && Boolean(config.gpu.apiKey && config.gpu.baseUrl && config.gpu.model);
  const releaseLane = isLive ? acquireCerebrasLane(`forge:${cleanPrompt.slice(0, 32)}`) : () => {};

  const sessionKey = `clawforge-cad-${Date.now().toString(36)}`;
  const pipelineStart = performance.now();

  emit('pipeline_start', {
    backend,
    isDemo: !isLive,
    model: !isLive
      ? 'LOCAL DEMO PRESET (0 API calls)'
      : (useTestModel ? config.cerebras.testModel : config.cerebras.model),
    prompt: cleanPrompt,
    enableVisualHeal: false,
    gpuRaceMode: includeGpuRace
      ? (useLiveGpu ? 'live-gpu' : 'reference-pacer')
      : 'off',
    gpuProviderName: config.gpu.providerName,
    gpuModel: config.gpu.model || 'Reference GPU Pacer (75 tok/s)'
  });

  // Launch optional Live GPU Comparison Lane on a SEPARATE provider (never touches Cerebras!)
  const turn1Messages = [
    { role: 'system', content: CAD_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Design and build this mechanical/product 3D assembly in ClawCAD v1 JSON:\n"${cleanPrompt}"\nOutput ONLY valid ClawCAD v1 JSON.`
    }
  ];

  let gpuAbortController = null;
  let gpuRacePromise = null;
  let gpuFinished = false;
  let gpuRawContent = '';
  let gpuRawReasoning = '';
  let lastGpuProgress = { tokensSoFar: 0, tps: 0, tpm: 0, elapsedMs: 0 };

  if (useLiveGpu) {
    gpuAbortController = new AbortController();
    signal?.addEventListener('abort', () => gpuAbortController.abort(), { once: true });
    emit('gpu_lane_start', {
      mode: 'live-gpu',
      providerName: config.gpu.providerName,
      model: config.gpu.model
    });
    gpuRacePromise = callLiveGpuLane({
      messages: turn1Messages,
      maxTokens: config.cerebras.maxTokensDraft,
      signal: gpuAbortController.signal,
      onDelta: (d) => {
        if (d.text) gpuRawContent += d.text;
        if (d.reasoning) gpuRawReasoning += d.reasoning;
        lastGpuProgress = {
          tokensSoFar: d.tokensSoFar || lastGpuProgress.tokensSoFar,
          tps: d.tps || lastGpuProgress.tps,
          tpm: d.tpm || Math.round((d.tps || lastGpuProgress.tps) * 60),
          elapsedMs: d.elapsedMs || lastGpuProgress.elapsedMs
        };
        emit('gpu_lane_delta', d);
      }
    })
      .then((res) => {
        gpuFinished = true;
        if (res) {
          const spec = tryParseCadSpec(res.content || gpuRawContent, res.reasoning || gpuRawReasoning);
          emit('gpu_lane_done', { ...res, spec, partial: false });
        }
      })
      .catch((err) => {
        gpuFinished = true;
        if (err.name !== 'AbortError') {
          emit('gpu_lane_error', { message: err.message });
        }
      });
  }

  try {
    // =========================================================================
    // SINGLE-PASS PARAMETRIC 3D CAD GENERATION + INSTANT CLIENT RENDER
    // =========================================================================
    emit('stage_update', {
      stage: 'turn1_draft',
      status: 'running',
      label: 'Generating Parametric 3D CAD Assembly'
    });

    const demoPreset = presetId && DEMO_PRESETS[presetId]
      ? DEMO_PRESETS[presetId]
      : pickDemoPreset(cleanPrompt);

    let turn1Res;
    if (!isLive) {
      turn1Res = await streamDemoJson(demoPreset.draft, {
        targetTps: 1940,
        ttftMs: 145,
        cacheHitPct: 0,
        signal,
        onDelta: (d) => emit('turn1_delta', d)
      });
    } else {
      turn1Res = await callPrimaryLLM({
        backend,
        agentId: config.openclaw.cadAgentId,
        sessionKey,
        promptCacheKey: PROMPT_CACHE_KEY_CAD,
        messages: turn1Messages,
        maxTokens: config.cerebras.maxTokensDraft,
        useTestModel,
        signal,
        onDelta: (d) => emit('turn1_delta', d)
      });
    }

    const turn1Tpm = Math.round(turn1Res.tps * 60);
    console.log(
      `[ClawForge] ${backend} | tokens: ${turn1Res.completionTokens} (prompt ${turn1Res.promptTokens}, cached ${turn1Res.cachedTokens}) | serverTps=${turn1Res.serverTps ?? 'n/a'} clientTps=${turn1Res.clientTps ?? turn1Res.tps} tpm=${turn1Tpm} ttft=${turn1Res.ttftMs}ms total=${turn1Res.totalMs}ms`
    );

    const rawDraftText = (turn1Res.content || '').trim() || (turn1Res.reasoning || '').trim();
    if (!rawDraftText) {
      throw new Error('Model returned empty content (check reasoning_effort / max_completion_tokens).');
    }
    const parsedDraft = extractJsonFromText(rawDraftText);
    const draftSpec = validateAndNormalizeCadSpec(parsedDraft);

    emit('stage_update', {
      stage: 'turn1_draft',
      status: 'done',
      ms: turn1Res.totalMs,
      tps: turn1Res.tps,
      tpm: turn1Tpm,
      ttftMs: turn1Res.ttftMs,
      tokens: turn1Res.completionTokens,
      cacheHitPct: turn1Res.cacheHitPct
    });

    emit('draft_ready', {
      spec: draftSpec,
      metrics: {
        ttftMs: turn1Res.ttftMs,
        totalMs: turn1Res.totalMs,
        tps: turn1Res.tps,
        tpm: turn1Tpm,
        serverTps: turn1Res.serverTps,
        promptTokens: turn1Res.promptTokens,
        completionTokens: turn1Res.completionTokens,
        cachedTokens: turn1Res.cachedTokens,
        cacheHitPct: turn1Res.cacheHitPct,
        rateLimitRemaining: turn1Res.rateLimitRemaining ?? null
      }
    });

    const totalPipelineMs = turn1Res.totalMs || Math.round(performance.now() - pipelineStart);

    emit('pipeline_complete', {
      totalMs: totalPipelineMs,
      totalCompletionTokens: turn1Res.completionTokens,
      averageTps: turn1Res.tps,
      averageTpm: turn1Tpm,
      ttftMs: turn1Res.ttftMs,
      cacheHitPct: turn1Res.cacheHitPct ?? 0,
      partCount: draftSpec.parts.length,
      model: !isLive
        ? 'Offline Demo'
        : (useTestModel ? config.cerebras.testModel : config.cerebras.model),
      healed: false,
      isDemo: !isLive
    });

    // Cerebras lane is done — release lock before trailing GPU comparison window so
    // back-to-back Forge 3D or Showroom runs never hit HTTP 409.
    releaseLane();

    // Keep the live GPU comparison lane streaming visibly for up to 20s after Cerebras finishes
    if (gpuRacePromise) {
      await Promise.race([
        gpuRacePromise,
        sleep(20000, signal).catch(() => {})
      ]);
      if (!gpuFinished && !signal?.aborted) {
        gpuAbortController?.abort();
        const partialSpec = tryParseCadSpec(gpuRawContent, gpuRawReasoning);
        emit('gpu_lane_stopped', {
          elapsedMs: Math.round(performance.now() - pipelineStart),
          tps: lastGpuProgress.tps,
          tpm: lastGpuProgress.tpm,
          tokensSoFar: lastGpuProgress.tokensSoFar,
          spec: partialSpec,
          partial: true,
          reason: 'window_cap'
        });
      }
    }
  } finally {
    gpuAbortController?.abort();
    releaseLane();
  }
}
