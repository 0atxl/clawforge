import { renderSpecThumbnail } from '../engine/preview-renderer.js';
import { extractJsonFromText, validateAndNormalizeCadSpec } from '../../shared/cad-schema.js';

/**
 * Side-by-Side Cerebras vs. GPU Comparison Controller
 * Drives both the full-screen Compare view (with side-by-side 3D renders + live JSON logs)
 * and Studio's compact floating dual-speed pill.
 */

function formatTpm(tps) {
  return `${Math.round((Number(tps) || 0) * 60).toLocaleString()} tok/min`;
}

function tryParsePartialSpec(rawText) {
  if (!rawText || rawText.trim().length < 40) return null;
  try {
    const parsed = extractJsonFromText(rawText);
    const spec = validateAndNormalizeCadSpec(parsed);
    return spec?.parts?.length >= 1 ? spec : null;
  } catch {
    return null;
  }
}

export class RacePanel {
  constructor({ onOpenModel = null, onModelRendered = null } = {}) {
    this.onOpenModel = onOpenModel;
    this.onModelRendered = onModelRendered;

    this.panel = document.getElementById('race-panel');
    this.promptPreview = document.getElementById('race-prompt-preview');
    this.speedupCaption = document.getElementById('race-speedup-caption');

    this.cModel = document.getElementById('race-cerebras-model');
    this.cTpm = document.getElementById('race-cerebras-tpm');
    this.cTps = document.getElementById('race-cerebras-tps');
    this.cElapsed = document.getElementById('race-cerebras-elapsed');
    this.cStatus = document.getElementById('race-cerebras-status');
    this.cBar = document.getElementById('race-cerebras-bar');
    this.cLog = document.getElementById('race-cerebras-log');
    this.cImg = document.getElementById('race-cerebras-img');
    this.cPlaceholder = document.getElementById('race-cerebras-placeholder');
    this.cPreviewBar = document.getElementById('race-cerebras-preview-bar');
    this.cPreviewMeta = document.getElementById('race-cerebras-preview-meta');
    this.btnOpenCerebras = document.getElementById('btn-open-cerebras-studio');

    this.gBadge = document.getElementById('race-gpu-badge');
    this.gModel = document.getElementById('race-gpu-model');
    this.gTpm = document.getElementById('race-gpu-tpm');
    this.gTps = document.getElementById('race-gpu-tps');
    this.gElapsed = document.getElementById('race-gpu-elapsed');
    this.gStatus = document.getElementById('race-gpu-status');
    this.gBar = document.getElementById('race-gpu-bar');
    this.gLog = document.getElementById('race-gpu-log');
    this.gImg = document.getElementById('race-gpu-img');
    this.gPlaceholder = document.getElementById('race-gpu-placeholder');
    this.gPreviewBar = document.getElementById('race-gpu-preview-bar');
    this.gPreviewMeta = document.getElementById('race-gpu-preview-meta');
    this.btnOpenGpu = document.getElementById('btn-open-gpu-studio');

    this.livePill = document.getElementById('live-race-pill');
    this.pillCerebrasTps = document.getElementById('pill-cerebras-tps');
    this.pillGpuTps = document.getElementById('pill-gpu-tps');

    this.referenceRateTps = 75;
    this.referenceTimer = null;
    this.cerebrasTimer = null;
    this.gpuTimer = null;
    this.referenceText = '';
    this.referenceCursor = 0;
    this.referenceStartAt = 0;
    this.cerebrasStartAt = 0;
    this.gpuStartAt = 0;
    this.cerebrasRawText = '';

    this.liveGpuMode = false;
    this.raceEnabled = false;
    this.cerebrasActive = false;
    this.gpuActive = false;
    this.inStudioMode = true;

    this.cerebrasTps = 0;
    this.gpuTps = 0;
    this.cerebrasDoneMs = null;
    this.cerebrasModelName = 'moonshotai-kimi-k3.1-pro-trial';
    this.gpuModelName = 'nvidia/nemotron-3-ultra-550b-a55b';
    this.gpuProviderLabel = 'NVIDIA NIM GPU';
    this.isDemoRun = false;

    this.cerebrasEntry = null;
    this.gpuEntry = null;

    this.btnOpenCerebras?.addEventListener('click', () => {
      if (this.cerebrasEntry) this.onOpenModel?.(this.cerebrasEntry);
    });
    this.btnOpenGpu?.addEventListener('click', () => {
      if (this.gpuEntry) this.onOpenModel?.(this.gpuEntry);
    });
  }

  setVisible(visible) {
    if (this.panel) this.panel.hidden = !visible;
  }

  setStudioMode(isStudio) {
    this.inStudioMode = Boolean(isStudio);
    this._syncLivePill();
  }

  setDefaultModels({ cerebrasModel, gpuLiveConfigured, gpuProviderName, gpuModel }) {
    if (this.cerebrasActive || this.gpuActive) return;
    if (cerebrasModel) {
      this.cerebrasModelName = cerebrasModel;
      if (this.cModel) this.cModel.textContent = cerebrasModel;
    }
    if (gpuLiveConfigured) {
      this.gpuProviderLabel = gpuProviderName || 'NVIDIA NIM GPU';
      if (gpuModel) this.gpuModelName = gpuModel;
      if (this.gBadge) this.gBadge.textContent = this.gpuProviderLabel;
      if (this.gModel && gpuModel) this.gModel.textContent = gpuModel;
    } else {
      if (this.gBadge) this.gBadge.textContent = `Reference GPU · ${this.referenceRateTps} tok/s`;
      if (this.gModel) this.gModel.textContent = `Standard GPU Baseline (${formatTpm(this.referenceRateTps)})`;
    }
  }

  _syncLivePill() {
    if (!this.livePill) return;
    const show = this.inStudioMode && this.raceEnabled && (this.cerebrasActive || this.gpuActive);
    this.livePill.hidden = !show;
  }

  _clearPreviews() {
    this.cerebrasEntry = null;
    this.gpuEntry = null;

    if (this.cImg) {
      this.cImg.hidden = true;
      this.cImg.removeAttribute('src');
    }
    if (this.cPreviewBar) this.cPreviewBar.hidden = true;
    if (this.cPlaceholder) {
      this.cPlaceholder.hidden = false;
      this.cPlaceholder.textContent = 'Streaming 3D CAD JSON…';
    }

    if (this.gImg) {
      this.gImg.hidden = true;
      this.gImg.removeAttribute('src');
    }
    if (this.gPreviewBar) this.gPreviewBar.hidden = true;
    if (this.gPlaceholder) {
      this.gPlaceholder.hidden = false;
      this.gPlaceholder.textContent = this.raceEnabled
        ? 'Waiting for GPU 3D JSON…'
        : 'Side-by-side GPU comparison disabled in Settings';
    }
  }

  reset({ prompt = '', cerebrasModel, gpuRaceMode, gpuProviderName, gpuModel, isDemo = false }) {
    this.stopReferencePacer();
    this._stopCerebrasTimer();
    this._stopGpuTimer();

    this.cerebrasRawText = '';
    this.referenceText = '';
    this.liveGpuMode = gpuRaceMode === 'live-gpu';
    this.raceEnabled = gpuRaceMode !== 'off';
    this.cerebrasActive = true;
    this.gpuActive = this.raceEnabled;
    this.cerebrasTps = 0;
    this.gpuTps = 0;
    this.cerebrasDoneMs = null;
    this.cerebrasStartAt = performance.now();
    this.gpuStartAt = this.cerebrasStartAt;
    this.cerebrasModelName = cerebrasModel || 'moonshotai-kimi-k3.1-pro-trial';
    this.gpuProviderLabel = gpuProviderName || 'NVIDIA NIM GPU';
    this.gpuModelName = gpuModel || 'nvidia/nemotron-3-ultra-550b-a55b';
    this.isDemoRun = Boolean(isDemo);

    this._clearPreviews();

    if (this.promptPreview && prompt) {
      this.promptPreview.textContent = prompt;
    }

    this.cModel.textContent = this.cerebrasModelName;
    if (this.cTpm) this.cTpm.textContent = '0 tok/min';
    this.cTps.textContent = '0 tok/s';
    this.cElapsed.textContent = '0.0s';
    this.cStatus.textContent = 'Streaming 3D CAD JSON…';
    this.cBar.style.width = '4%';
    this.cLog.textContent = '';

    if (!this.raceEnabled) {
      this.gBadge.textContent = 'GPU Comparison Off';
      this.gModel.textContent = 'Enable Side-by-Side GPU in Settings to race';
      this.gStatus.textContent = 'Disabled';
      this.gElapsed.textContent = '—';
      if (this.gTpm) this.gTpm.textContent = '—';
      this.gTps.textContent = '—';
      this.gBar.style.width = '0%';
      this.gLog.textContent = '// Side-by-side GPU comparison disabled in Studio settings.';
      this.speedupCaption.textContent = 'Enable Side-by-Side GPU in Settings to compare tokens/min throughput.';
    } else if (this.liveGpuMode) {
      this.gBadge.textContent = `${this.gpuProviderLabel}`;
      this.gModel.textContent = this.gpuModelName;
      this.gStatus.textContent = 'Waiting for TTFT…';
      this.gElapsed.textContent = '0.0s';
      if (this.gTpm) this.gTpm.textContent = '0 tok/min';
      this.gTps.textContent = '0 tok/s';
      this.gBar.style.width = '0%';
      this.gLog.textContent = '';
      this.speedupCaption.textContent = `Streaming Cerebras WSE against live ${this.gpuProviderLabel}…`;
    } else {
      this.gBadge.textContent = `Reference GPU · ${this.referenceRateTps} tok/s`;
      this.gModel.textContent = `Standard GPU Baseline (${formatTpm(this.referenceRateTps)})`;
      this.gStatus.textContent = 'Waiting for TTFT (1.2s)…';
      this.gElapsed.textContent = '0.0s';
      if (this.gTpm) this.gTpm.textContent = '0 tok/min';
      this.gTps.textContent = '0 tok/s';
      this.gBar.style.width = '0%';
      this.gLog.textContent = '';
      this.speedupCaption.textContent = `Streaming against ${formatTpm(this.referenceRateTps)} Reference GPU…`;
    }

    this.pillCerebrasTps.textContent = '0 tok/min';
    this.pillGpuTps.textContent = '0 tok/min';
    this._syncLivePill();

    this.cerebrasTimer = setInterval(() => {
      if (!this.cerebrasActive) return;
      const sec = (performance.now() - this.cerebrasStartAt) / 1000;
      this.cElapsed.textContent = `${sec.toFixed(1)}s`;
    }, 100);

    if (this.raceEnabled && this.liveGpuMode) {
      this.gpuTimer = setInterval(() => {
        if (!this.gpuActive) return;
        const sec = (performance.now() - this.gpuStartAt) / 1000;
        this.gElapsed.textContent = `${sec.toFixed(1)}s`;
      }, 100);
    }
  }

  setCerebrasSpec(spec, { tps = 0, tpm = 0, totalMs = 0, completionTokens = 0, ttftMs = null, isDemo = false, model = '' } = {}) {
    if (!spec || !spec.parts?.length) return null;
    const thumb = renderSpecThumbnail(spec);
    const usedTps = tps || this.cerebrasTps || 0;
    const usedModel = model || this.cerebrasModelName;
    const entry = {
      id: `cerebras-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      lane: 'cerebras',
      provider: isDemo ? 'demo' : 'cerebras',
      providerLabel: isDemo ? 'Offline Demo' : `Cerebras WSE · ${usedModel}`,
      shortLabel: isDemo ? 'Demo' : 'Cerebras',
      model: usedModel,
      spec,
      dataUrl: thumb?.dataUrl || '',
      partCount: spec.parts.length,
      tps: usedTps,
      tpm: tpm || Math.round(usedTps * 60),
      elapsedMs: totalMs || this.cerebrasDoneMs || 0,
      tokens: completionTokens,
      ttftMs,
      partial: false
    };

    this.cerebrasEntry = entry;
    if (entry.dataUrl && this.cImg && this.cPlaceholder) {
      this.cImg.src = entry.dataUrl;
      this.cImg.hidden = false;
      this.cPlaceholder.hidden = true;
    } else if (this.cPlaceholder) {
      this.cPlaceholder.textContent = `${spec.name} (${spec.parts.length} parts)`;
    }
    if (this.cPreviewBar) this.cPreviewBar.hidden = false;
    if (this.cPreviewMeta) {
      this.cPreviewMeta.textContent = `${spec.parts.length} parts · ${(entry.elapsedMs / 1000).toFixed(1)}s`;
    }

    this.onModelRendered?.(entry);
    return entry;
  }

  setGpuSpec(spec, { tps = 0, tpm = 0, elapsedMs = 0, tokensSoFar = 0, partial = false, isDemo = false } = {}) {
    if (!spec || !spec.parts?.length) {
      if (this.gImg) this.gImg.hidden = true;
      if (this.gPreviewBar) this.gPreviewBar.hidden = true;
      if (this.gPlaceholder) {
        this.gPlaceholder.hidden = false;
        this.gPlaceholder.textContent = `Incomplete at ${(elapsedMs / 1000).toFixed(1)}s — 0 complete 3D parts yet (${(tokensSoFar || 0).toLocaleString()} tok streamed)`;
      }
      return null;
    }

    const thumb = renderSpecThumbnail(spec);
    const usedTps = tps || this.gpuTps || 0;
    const shortModel = this.gpuModelName.split('/').pop();
    const entry = {
      id: `gpu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      lane: 'gpu',
      provider: 'gpu',
      providerLabel: this.liveGpuMode
        ? `${this.gpuProviderLabel} · ${shortModel}`
        : 'Reference GPU · 75 tok/s',
      shortLabel: this.liveGpuMode ? 'NVIDIA GPU' : 'Ref GPU',
      model: this.liveGpuMode ? this.gpuModelName : 'Reference GPU (75 tok/s)',
      spec,
      dataUrl: thumb?.dataUrl || '',
      partCount: spec.parts.length,
      tps: usedTps,
      tpm: tpm || Math.round(usedTps * 60),
      elapsedMs,
      tokens: tokensSoFar,
      partial,
      isDemo
    };

    this.gpuEntry = entry;
    if (entry.dataUrl && this.gImg && this.gPlaceholder) {
      this.gImg.src = entry.dataUrl;
      this.gImg.hidden = false;
      this.gPlaceholder.hidden = true;
    } else if (this.gPlaceholder) {
      this.gPlaceholder.textContent = `${spec.name} (${spec.parts.length} parts)`;
    }
    if (this.gPreviewBar) this.gPreviewBar.hidden = false;
    if (this.gPreviewMeta) {
      this.gPreviewMeta.textContent = `${spec.parts.length} parts${partial ? ' · partial' : ''} · ${(elapsedMs / 1000).toFixed(1)}s`;
    }

    this.onModelRendered?.(entry);
    return entry;
  }

  pushCerebrasDelta({ phase = '', statusText = '', resetTimer = false, text = '', reasoning = '', tps = 0, tokensSoFar = 0 }) {
    if (resetTimer || phase === 'started') {
      this.cerebrasStartAt = performance.now();
      if (this.cElapsed) this.cElapsed.textContent = '0.0s';
      if (this.cStatus) this.cStatus.textContent = 'Streaming 3D CAD JSON…';
      if (this.cPlaceholder && !this.cerebrasRawText) {
        this.cPlaceholder.textContent = 'Streaming 3D CAD JSON…';
      }
      return;
    }
    const chunk = text || reasoning;
    if (chunk) {
      this.cerebrasRawText += chunk;
      const tail = this.cerebrasRawText.length > 2600
        ? '…\n' + this.cerebrasRawText.slice(-2400)
        : this.cerebrasRawText;
      this.cLog.textContent = tail;
      this.cLog.scrollTop = this.cLog.scrollHeight;
    }
    if (phase === 'queue_wait') {
      const msg = statusText || 'Cerebras queue busy — retrying…';
      if (this.cStatus) this.cStatus.textContent = msg;
      if (this.cPlaceholder && !this.cerebrasRawText) this.cPlaceholder.textContent = msg;
      return;
    }
    if (this.cStatus && tokensSoFar > 0) {
      this.cStatus.textContent = phase === 'reasoning'
        ? `Kimi K3.1 Pro thinking · ${tokensSoFar.toLocaleString()} tok…`
        : `Streaming 3D CAD JSON · ${tokensSoFar.toLocaleString()} tok`;
    }
    if (tps > 0) {
      this.cerebrasTps = tps;
      const tpmText = formatTpm(tps);
      if (this.cTpm) this.cTpm.textContent = tpmText;
      this.cTps.textContent = `${tps.toLocaleString()} tok/s`;
      this.pillCerebrasTps.textContent = tpmText;
    }
    const pct = Math.min(92, Math.max(8, Math.round((tokensSoFar / 1600) * 100)));
    this.cBar.style.width = `${pct}%`;

    // Feed reference GPU pacer if no live GPU API is active
    if (this.raceEnabled && !this.liveGpuMode) {
      this.referenceText = this.cerebrasRawText;
      if (!this.referenceTimer) {
        this._startReferencePacer();
      }
    }
  }

  markCerebrasDone({ totalMs, averageTps, totalCompletionTokens = 0 }) {
    this._stopCerebrasTimer();
    this.cerebrasActive = false;
    this.cerebrasDoneMs = totalMs;
    if (averageTps > 0) this.cerebrasTps = averageTps;

    const sec = Math.max(0.2, totalMs / 1000);
    const tpmText = formatTpm(this.cerebrasTps || 0);
    if (this.cTpm) this.cTpm.textContent = tpmText;
    this.cTps.textContent = `${(this.cerebrasTps || 0).toLocaleString()} tok/s`;
    this.pillCerebrasTps.textContent = tpmText;
    this.cElapsed.textContent = `${sec.toFixed(1)}s`;
    this.cStatus.textContent = `Rendered ${totalCompletionTokens.toLocaleString()} tok in ${sec.toFixed(1)}s`;
    this.cBar.style.width = '100%';

    this._updateSpeedupCaption(totalCompletionTokens);
    this._syncLivePill();
  }

  pushLiveGpuDelta({ text = '', reasoning = '', tps = 0, tokensSoFar = 0, elapsedMs = 0 }) {
    const chunk = text || reasoning;
    if (chunk) {
      this.gLog.textContent = (this.gLog.textContent + chunk).slice(-2400);
      this.gLog.scrollTop = this.gLog.scrollHeight;
    }
    if (tps > 0) this.gpuTps = tps;
    const tpmText = formatTpm(tps);
    if (this.gTpm) this.gTpm.textContent = tpmText;
    this.gTps.textContent = `${tps.toLocaleString()} tok/s`;
    this.pillGpuTps.textContent = tpmText;
    if (elapsedMs > 0) {
      this.gElapsed.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;
    }
    this.gStatus.textContent = `Streaming · ${tokensSoFar.toLocaleString()} tok`;
    const pct = Math.min(95, Math.round((tokensSoFar / 1600) * 100));
    this.gBar.style.width = `${pct}%`;
    this._updateSpeedupCaption();
  }

  markLiveGpuDone({ totalMs, tps, tpm = 0, completionTokens = 0, spec = null, partial = false }) {
    this._stopGpuTimer();
    this.gpuActive = false;
    if (tps > 0) this.gpuTps = tps;
    const sec = (totalMs / 1000).toFixed(1);
    const tpmText = formatTpm(this.gpuTps);
    if (this.gTpm) this.gTpm.textContent = tpmText;
    this.gTps.textContent = `${(this.gpuTps || 0).toLocaleString()} tok/s`;
    this.pillGpuTps.textContent = tpmText;
    this.gElapsed.textContent = `${sec}s`;
    this.gStatus.textContent = `Done in ${sec}s (${completionTokens.toLocaleString()} tok)`;
    this.gBar.style.width = '100%';
    this.setGpuSpec(spec, {
      tps: this.gpuTps,
      tpm: tpm || Math.round(this.gpuTps * 60),
      elapsedMs: totalMs,
      tokensSoFar: completionTokens,
      partial,
      isDemo: false
    });
    this._updateSpeedupCaption();
    this._syncLivePill();
  }

  markLiveGpuStopped({ elapsedMs = 0, tps = 0, tpm = 0, tokensSoFar = 0, spec = null, partial = true } = {}) {
    this._stopGpuTimer();
    this.gpuActive = false;
    if (tps > 0) this.gpuTps = tps;
    const sec = (elapsedMs / 1000).toFixed(1);
    const tpmText = formatTpm(this.gpuTps);
    if (this.gTpm) this.gTpm.textContent = tpmText;
    this.gTps.textContent = `${(this.gpuTps || 0).toLocaleString()} tok/s`;
    this.pillGpuTps.textContent = tpmText;
    if (elapsedMs > 0) this.gElapsed.textContent = `${sec}s`;
    this.gStatus.textContent = `Still streaming at ${sec}s (${tokensSoFar.toLocaleString()} tok) — capped after Cerebras finished`;
    this.setGpuSpec(spec, {
      tps: this.gpuTps,
      tpm: tpm || Math.round(this.gpuTps * 60),
      elapsedMs,
      tokensSoFar,
      partial,
      isDemo: false
    });
    this._updateSpeedupCaption();
    this._syncLivePill();
  }

  markCerebrasError(msg) {
    this._stopCerebrasTimer();
    this._stopGpuTimer();
    this.cerebrasActive = false;
    this.gpuActive = false;
    this.cStatus.textContent = msg;
    if (this.liveGpuMode && this.gStatus.textContent.startsWith('Waiting')) {
      this.gStatus.textContent = 'Stopped (Cerebras lane halted)';
    }
    this._syncLivePill();
  }

  markLiveGpuError(msg) {
    this._stopGpuTimer();
    this.gpuActive = false;
    this.gStatus.textContent = `GPU error: ${msg.slice(0, 60)}`;
    if (this.gPlaceholder) {
      this.gPlaceholder.hidden = false;
      this.gPlaceholder.textContent = `GPU error: ${msg.slice(0, 80)}`;
    }
    this._syncLivePill();
  }

  finishStream() {
    this._stopCerebrasTimer();
    this.cerebrasActive = false;
    if (this.liveGpuMode || !this.referenceTimer) {
      this._stopGpuTimer();
      this.gpuActive = false;
    }
    this._syncLivePill();
  }

  _updateSpeedupCaption(totalCompletionTokens = 0) {
    if (!this.raceEnabled || this.cerebrasDoneMs === null) return;
    const cerebrasSec = Math.max(0.2, this.cerebrasDoneMs / 1000);
    const cerebrasTpmText = formatTpm(this.cerebrasTps);

    if (this.liveGpuMode) {
      if (this.gpuTps > 0 && this.cerebrasTps > 0) {
        const mult = Math.max(1, Math.round(this.cerebrasTps / this.gpuTps));
        this.speedupCaption.textContent = `Cerebras finished in ${cerebrasSec.toFixed(1)}s (${cerebrasTpmText}) — ~${mult}× faster than ${this.gpuProviderLabel} (${formatTpm(this.gpuTps)})`;
      } else {
        this.speedupCaption.textContent = `Cerebras finished in ${cerebrasSec.toFixed(1)}s (${cerebrasTpmText}) — ${this.gpuProviderLabel} still streaming`;
      }
      return;
    }

    const tokens = totalCompletionTokens || Math.max(200, Math.round(this.cerebrasRawText.length / 3.8));
    const eqGpuSec = Math.max(1, tokens / this.referenceRateTps + 1.2);
    const speedup = Math.max(1, Math.round(eqGpuSec / cerebrasSec));
    this.speedupCaption.textContent = `Done in ${cerebrasSec.toFixed(1)}s (${cerebrasTpmText}) — ~${speedup}× faster than ${formatTpm(this.referenceRateTps)} Reference GPU`;
  }

  _startReferencePacer() {
    this.referenceCursor = 0;
    this.referenceStartAt = performance.now();
    const ttftDelayMs = 1150;
    const charsPerSec = this.referenceRateTps * 3.8;

    this.referenceTimer = setInterval(() => {
      const elapsed = performance.now() - this.referenceStartAt;
      const elapsedSec = (elapsed / 1000).toFixed(1);
      this.gElapsed.textContent = `${elapsedSec}s`;

      if (elapsed < ttftDelayMs) {
        this.gStatus.textContent = `TTFT queue ${elapsedSec}s…`;
        return;
      }

      if (this.cerebrasDoneMs !== null && elapsed >= 15000) {
        const estToks = Math.max(1, Math.round(this.referenceCursor / 3.8));
        this.gStatus.textContent = `Still streaming at ${elapsedSec}s (${estToks.toLocaleString()} tok) — capped after Cerebras finished`;
        const partialSpec = tryParsePartialSpec(this.referenceText.slice(0, this.referenceCursor));
        this.setGpuSpec(partialSpec, {
          tps: this.referenceRateTps,
          tpm: this.referenceRateTps * 60,
          elapsedMs: Math.round(elapsed),
          tokensSoFar: estToks,
          partial: true,
          isDemo: true
        });
        this.stopReferencePacer();
        return;
      }

      const targetChars = Math.floor(((elapsed - ttftDelayMs) / 1000) * charsPerSec);
      if (this.referenceCursor < this.referenceText.length) {
        this.referenceCursor = Math.min(this.referenceText.length, targetChars);
        const visible = this.referenceText.slice(0, this.referenceCursor);
        this.gLog.textContent = visible.length > 2200 ? '…\n' + visible.slice(-2000) : visible;
        this.gLog.scrollTop = this.gLog.scrollHeight;

        const pct = Math.min(100, Math.round((this.referenceCursor / Math.max(1, this.referenceText.length)) * 100));
        this.gBar.style.width = `${pct}%`;
        this.gpuTps = this.referenceRateTps;
        const tpmText = formatTpm(this.referenceRateTps);
        if (this.gTpm) this.gTpm.textContent = tpmText;
        this.gTps.textContent = `${this.referenceRateTps} tok/s`;
        this.pillGpuTps.textContent = tpmText;
        this.gStatus.textContent = `Streaming (${pct}%)`;
      } else if (this.referenceText.length > 100) {
        this.gBar.style.width = '100%';
        this.gStatus.textContent = `Finished at ${elapsedSec}s`;
        const fullSpec = tryParsePartialSpec(this.referenceText);
        this.setGpuSpec(fullSpec, {
          tps: this.referenceRateTps,
          tpm: this.referenceRateTps * 60,
          elapsedMs: Math.round(elapsed),
          tokensSoFar: Math.round(this.referenceText.length / 3.8),
          partial: false,
          isDemo: true
        });
        this.stopReferencePacer();
      }
    }, 50);
  }

  _stopCerebrasTimer() {
    if (this.cerebrasTimer) {
      clearInterval(this.cerebrasTimer);
      this.cerebrasTimer = null;
    }
  }

  _stopGpuTimer() {
    if (this.gpuTimer) {
      clearInterval(this.gpuTimer);
      this.gpuTimer = null;
    }
  }

  stopReferencePacer() {
    if (this.referenceTimer) {
      clearInterval(this.referenceTimer);
      this.referenceTimer = null;
    }
    this.gpuActive = false;
    this.cerebrasActive = false;
    this._stopCerebrasTimer();
    this._stopGpuTimer();
    this._syncLivePill();
  }
}
