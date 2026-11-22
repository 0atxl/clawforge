/**
 * Wafer-Scale 20Hz (50ms) Buffered Telemetry & Floating Progress Controller
 * Keeps the top bar spotless while idle and surfaces live tok/min & tok/s throughput while active/measured.
 */

const STAGE_LABELS = {
  turn1_draft: 'Generating 3D…'
};

export class TelemetryHud {
  constructor() {
    this.elTelemetryPill = document.getElementById('telemetry-pill');
    this.elTpm = document.getElementById('hud-tpm-value');
    this.elTps = document.getElementById('hud-tps-value');
    this.elTtft = document.getElementById('hud-ttft-value');

    this.elProgressPill = document.getElementById('progress-pill');
    this.elProgressStage = document.getElementById('progress-stage');
    this.elProgressElapsed = document.getElementById('progress-elapsed');

    // 50ms buffered state
    this.dirty = false;
    this.isRunning = false;
    this.currentTps = 0;
    this.currentTtft = null;
    this.currentCachePct = 0;
    this.tokensSoFar = 0;
    this.runStartedAt = null;
    this.runCompletedMs = null;
    this.activeStageLabel = 'Generating 3D…';

    this._timer = setInterval(() => this._flush(), 50);
  }

  resetForRun() {
    this.isRunning = true;
    this.currentTps = 0;
    this.currentTtft = null;
    this.currentCachePct = 0;
    this.tokensSoFar = 0;
    this.runStartedAt = performance.now();
    this.runCompletedMs = null;
    this.activeStageLabel = 'Generating 3D…';

    if (this.elProgressStage) this.elProgressStage.textContent = this.activeStageLabel;
    if (this.elProgressElapsed) this.elProgressElapsed.textContent = '0.0s';
    if (this.elProgressPill) this.elProgressPill.hidden = false;

    this.dirty = true;
    this._flush();
  }

  pushStreamDelta({ phase = '', tokensSoFar = 0, tps = 0, ttftMs = null }) {
    if (tokensSoFar > 0) this.tokensSoFar = Math.max(this.tokensSoFar, tokensSoFar);
    if (tps > 0) this.currentTps = tps;
    if (ttftMs !== null && ttftMs !== undefined && this.currentTtft === null) {
      this.currentTtft = ttftMs;
    }
    if (this.isRunning && this.elProgressStage) {
      if (phase === 'reasoning') {
        this.activeStageLabel = this.tokensSoFar > 0
          ? `Kimi K3.1 Pro thinking · ${this.tokensSoFar.toLocaleString()} tok…`
          : 'Kimi K3.1 Pro thinking…';
      } else if (this.tokensSoFar > 0) {
        this.activeStageLabel = `Streaming 3D CAD JSON · ${this.tokensSoFar.toLocaleString()} tok…`;
      }
      this.elProgressStage.textContent = this.activeStageLabel;
    }
    this.dirty = true;
  }

  applyTurnMetrics({ tps, ttftMs, cacheHitPct, completionTokens }) {
    if (tps > 0) this.currentTps = tps;
    if (ttftMs !== undefined && ttftMs !== null) this.currentTtft = ttftMs;
    if (cacheHitPct !== undefined && cacheHitPct !== null) {
      this.currentCachePct = Math.max(this.currentCachePct, cacheHitPct);
    }
    if (completionTokens > 0) {
      this.tokensSoFar = Math.max(this.tokensSoFar, completionTokens);
    }
    this.dirty = true;
  }

  applyProxyMetrics(metrics) {
    if (!metrics) return;
    if (metrics.serverTps > 0) this.currentTps = metrics.serverTps;
    if (metrics.ttftMs > 0) this.currentTtft = metrics.ttftMs;
    if (metrics.cacheHitPct !== undefined) this.currentCachePct = metrics.cacheHitPct;
    this.dirty = true;
  }

  updateStage({ stage, status }) {
    if (status === 'running') {
      this.activeStageLabel = STAGE_LABELS[stage] || 'Generating 3D…';
      if (this.elProgressStage) this.elProgressStage.textContent = this.activeStageLabel;
      if (this.elProgressPill) this.elProgressPill.hidden = false;
      this.dirty = true;
    }
  }

  stopRun() {
    this.isRunning = false;
    if (this.runStartedAt !== null && this.runCompletedMs === null) {
      this.runCompletedMs = Math.round(performance.now() - this.runStartedAt);
    }
    if (this.elProgressPill) this.elProgressPill.hidden = true;
    this.dirty = true;
    this._flush();
  }

  failRun() {
    this.stopRun();
  }

  completeRun({ totalMs, totalCompletionTokens, averageTps, cacheHitPct }) {
    this.isRunning = false;
    this.runCompletedMs = totalMs;
    if (averageTps > 0) this.currentTps = averageTps;
    if (cacheHitPct !== undefined) this.currentCachePct = Math.max(this.currentCachePct, cacheHitPct);
    if (totalCompletionTokens > 0) this.tokensSoFar = totalCompletionTokens;

    if (this.elProgressPill) this.elProgressPill.hidden = true;
    this.dirty = true;
    this._flush();
  }

  _flush() {
    if (this.isRunning && this.runStartedAt !== null && this.elProgressElapsed) {
      const elapsedSec = (performance.now() - this.runStartedAt) / 1000;
      this.elProgressElapsed.textContent = `${elapsedSec.toFixed(1)}s`;
    }

    if (!this.dirty) return;
    this.dirty = false;

    const tpm = Math.round(this.currentTps * 60);
    if (this.elTelemetryPill) {
      this.elTelemetryPill.hidden = this.currentTps <= 0;
    }
    if (this.elTpm) {
      this.elTpm.textContent = `${tpm.toLocaleString()} tok/min`;
      this.elTpm.classList.toggle('is-active', this.currentTps > 0);
    }
    if (this.elTps) {
      this.elTps.textContent = `${this.currentTps.toLocaleString()} tok/s`;
    }
    if (this.elTtft) {
      this.elTtft.textContent = this.currentTtft !== null ? `${this.currentTtft} ms` : '— ms';
    }
  }

  dispose() {
    clearInterval(this._timer);
  }
}
