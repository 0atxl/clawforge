import { DEMO_PRESETS } from '../shared/demo-presets.js';
import { apiUrl } from './config/api.js';
import { ClawForgeViewer } from './engine/studio-viewer.js';
import { TelemetryHud } from './ui/telemetry-hud.js';
import { RacePanel } from './ui/race-panel.js';
import { BomAndHealInspector } from './ui/bom-inspector.js';
import { GiftShowroom } from './ui/gift-showroom.js';

/**
 * ClawForge Main Frontend Controller (Single-Pass Fast CAD Generation + Speed Telemetry)
 */

const state = {
  mode: 'studio',
  activePresetId: 'turbofan',
  currentSpec: null,
  running: false,
  cerebrasDone: false,
  abortController: null,
  capabilities: null,
  renderHistory: [],
  activeHistoryId: null,
  lastRacePair: { cerebras: null, gpu: null },
  activeRunMeta: { isDemo: false, model: 'qwen-3.8-27b' },
  runTelemetry: {
    badge: 'Ready',
    badgeClass: 'diff-status',
    cerebrasModel: 'qwen-3.8-27b',
    cerebrasTps: 0,
    cerebrasTpm: 0,
    ttftMs: null,
    cerebrasElapsedMs: 0,
    cerebrasTokens: 0,
    cacheHitPct: 0,
    partCount: 0,
    gpuProviderName: 'NVIDIA NIM GPU',
    gpuModel: 'nvidia/nemotron-3-ultra-550b-a55b',
    gpuTps: 0,
    gpuTpm: 0,
    gpuElapsedMs: 0,
    gpuTokens: 0,
    gpuStatus: 'Idle',
    speedupText: ''
  }
};

// DOM references
const elBackendSelect = document.getElementById('backend-select');
const elPrompt = document.getElementById('forge-prompt');
const elToggleRace = document.getElementById('toggle-gpu-race');
const elToggleTestModel = document.getElementById('toggle-test-model');
const elToggleAutoOrbit = document.getElementById('toggle-auto-orbit');

const elBtnRun = document.getElementById('btn-forge-run');
const elIconSubmit = document.getElementById('icon-submit');
const elIconStop = document.getElementById('icon-stop');
const elBtnRaceRun = document.getElementById('btn-race-run');
const elLiveRacePill = document.getElementById('live-race-pill');

const elStatusBanner = document.getElementById('status-banner');
const elStatusBannerText = document.getElementById('status-banner-text');
const elBtnStatusDismiss = document.getElementById('btn-status-dismiss');

const elAssemblyTitle = document.getElementById('assembly-title');
const elStatParts = document.getElementById('stat-parts');
const elStatSpeed = document.getElementById('stat-speed');
const elSourceBadge = document.getElementById('studio-source-badge');
const elModelSwitcher = document.getElementById('studio-model-switcher');
const elBtnSwitchCerebras = document.getElementById('btn-switch-cerebras');
const elBtnSwitchGpu = document.getElementById('btn-switch-gpu');

const btnToggleExplode = document.getElementById('btn-toggle-explode');
const elExplodeBar = document.getElementById('explode-popover-bar');
const sliderExplode = document.getElementById('slider-explode');
const valExplode = document.getElementById('val-explode');

const btnToggleCutaway = document.getElementById('btn-toggle-cutaway');
const elCutawayBar = document.getElementById('cutaway-popover-bar');
const sliderCutaway = document.getElementById('slider-cutaway');

const sliderRpm = document.getElementById('slider-rpm');
const valRpm = document.getElementById('val-rpm');

function syncRangeSlider(input, ariaText) {
  input.style.setProperty('--attr-min', input.min || '0');
  input.style.setProperty('--attr-max', input.max || '100');
  input.style.setProperty('--control-value', input.value);
  if (ariaText) input.setAttribute('aria-valuetext', ariaText);
}

function autoSizePrompt() {
  elPrompt.style.height = 'auto';
  elPrompt.style.height = `${Math.min(elPrompt.scrollHeight, 84)}px`;
}

// Initialize core modules
const hud = new TelemetryHud();
const racePanel = new RacePanel({
  onOpenModel: (entry) => openModelInStudio(entry),
  onModelRendered: (entry) => recordRenderEntry(entry)
});

const inspector = new BomAndHealInspector({
  onSelectPartId: (partId) => viewer.selectPart(partId, { isolate: false }),
  onIsolatePartId: (partId, isolate) => viewer.selectPart(partId, { isolate }),
  onSelectHistoryItem: (entry) => openModelInStudio(entry)
});

const viewer = new ClawForgeViewer(document.getElementById('three-viewport'), {
  onSelectPart: (part) => inspector.showSelectedPart(part)
});

const showroom = new GiftShowroom({
  getBackend: () => elBackendSelect.value,
  getUseTestModel: () => elToggleTestModel?.checked ?? true,
  onTelemetry: (m) => {
    if (m.complete) {
      hud.applyTurnMetrics(m);
    } else {
      hud.pushStreamDelta(m);
    }
  },
  onForgeGift: (gift) => {
    setExplodePanel(false);
    setCutawayPanel(false);
    setMode('studio');
    elPrompt.value = '';
    autoSizePrompt();
    updatePromptPlaceholder(null);
    state.activePresetId = '';
    for (const chip of document.querySelectorAll('.chip[data-preset]')) {
      chip.classList.remove('is-active');
    }
    startForgeRun({ supersede: true, promptOverride: gift.cadPrompt });
  }
});

function setStatusBanner(message, variant = '') {
  if (!message) {
    elStatusBanner.hidden = true;
    elStatusBannerText.textContent = '';
    return;
  }
  elStatusBanner.hidden = false;
  elStatusBanner.className = `status-banner ${variant ? `is-${variant}` : ''}`.trim();
  elStatusBannerText.textContent = message;
}

elBtnStatusDismiss?.addEventListener('click', () => setStatusBanner(''));

// Fallback for browsers without native Popover API
const btnSettingsToggle = document.getElementById('btn-settings-toggle');
const settingsPopover = document.getElementById('settings-popover');
if (!Object.hasOwn(HTMLElement.prototype, 'popover') && btnSettingsToggle && settingsPopover) {
  btnSettingsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPopover.classList.toggle('is-fallback-open');
  });
  document.addEventListener('click', (e) => {
    if (!settingsPopover.contains(e.target) && e.target !== btnSettingsToggle) {
      settingsPopover.classList.remove('is-fallback-open');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') settingsPopover.classList.remove('is-fallback-open');
  });
}

function updateAssemblyOverlay(spec, telemetry, { speedText = 'Ready', source = { provider: 'preset', label: 'Preset · Built-in' } } = {}) {
  state.currentSpec = spec;
  elAssemblyTitle.textContent = spec.name;
  elStatParts.textContent = `${telemetry.partCount} parts`;
  if (elStatSpeed) {
    elStatSpeed.textContent = speedText;
    elStatSpeed.className = speedText === 'Ready' ? 'health-ok' : 'health-warn';
  }
  if (elSourceBadge) {
    elSourceBadge.textContent = source.label || 'Preset · Built-in';
    const cls = source.provider === 'cerebras'
      ? 'is-cerebras'
      : (source.provider === 'gpu' ? 'is-gpu' : (source.provider === 'demo' ? 'is-demo' : 'is-preset'));
    elSourceBadge.className = `source-badge ${cls}`;
  }
  inspector.setBom(spec);
}

function loadSpecIntoStudio(spec, opts = {}) {
  const { spec: normalized, telemetry } = viewer.loadSpec(spec, opts);
  updateAssemblyOverlay(normalized, telemetry, {
    speedText: opts.speedText || 'Ready',
    source: opts.source || { provider: 'preset', label: 'Preset · Built-in' }
  });
  inspector.showSelectedPart(null);
}

function syncStudioSwitcher() {
  if (!elModelSwitcher) return;
  const { cerebras, gpu } = state.lastRacePair;
  const hasBoth = Boolean(cerebras && gpu);
  elModelSwitcher.hidden = !hasBoth;
  if (!hasBoth) return;
  if (elBtnSwitchCerebras) {
    elBtnSwitchCerebras.textContent = cerebras.shortLabel || 'Cerebras';
    elBtnSwitchCerebras.classList.toggle('is-active', state.activeHistoryId === cerebras.id);
  }
  if (elBtnSwitchGpu) {
    elBtnSwitchGpu.textContent = gpu.shortLabel || 'NVIDIA GPU';
    elBtnSwitchGpu.classList.toggle('is-active', state.activeHistoryId === gpu.id);
  }
}

function recordRenderEntry(entry) {
  if (!entry || !entry.spec) return;
  state.renderHistory = [entry, ...state.renderHistory.filter((item) => item.id !== entry.id)].slice(0, 24);
  if (entry.lane === 'cerebras') {
    state.lastRacePair.cerebras = entry;
    if (!state.activeHistoryId || state.mode !== 'studio' || state.running) {
      state.activeHistoryId = entry.id;
    }
  } else if (entry.lane === 'gpu') {
    state.lastRacePair.gpu = entry;
  }
  inspector.setHistory(state.renderHistory, state.activeHistoryId);
  syncStudioSwitcher();
}

function openModelInStudio(entry) {
  if (!entry || !entry.spec) return;
  state.activeHistoryId = entry.id;
  setExplodePanel(false);
  setCutawayPanel(false);
  setMode('studio');
  const speedText = entry.tpm > 0
    ? `${entry.tpm.toLocaleString()} tok/min · ${(entry.elapsedMs / 1000).toFixed(1)}s${entry.partial ? ' · partial' : ''}`
    : 'Ready';
  loadSpecIntoStudio(entry.spec, {
    preserveCamera: false,
    speedText,
    source: { provider: entry.provider, label: entry.providerLabel }
  });
  inspector.setHistory(state.renderHistory, state.activeHistoryId);
  syncStudioSwitcher();
}

elBtnSwitchCerebras?.addEventListener('click', () => {
  if (state.lastRacePair.cerebras) openModelInStudio(state.lastRacePair.cerebras);
});

elBtnSwitchGpu?.addEventListener('click', () => {
  if (state.lastRacePair.gpu) openModelInStudio(state.lastRacePair.gpu);
});

function syncActiveModelLabels() {
  const backend = elBackendSelect.value;
  const useQwen = elToggleTestModel?.checked ?? true;
  const caps = state.capabilities || {};
  const isDemo = backend === 'demo';
  const cerebrasModel = isDemo
    ? 'LOCAL DEMO PRESET (0 API calls)'
    : (useQwen ? (caps.cerebrasTestModel || 'qwen-3.8-27b') : (caps.cerebrasModel || 'moonshotai-kimi-k3.1-pro-trial'));
  const gpuLiveConfigured = !isDemo && Boolean(caps.gpuLiveConfigured);
  const gpuProviderName = gpuLiveConfigured ? (caps.gpuProviderName || 'NVIDIA NIM GPU') : 'Reference GPU · 75 tok/s';
  const gpuModel = gpuLiveConfigured ? (caps.gpuModel || 'nvidia/nemotron-3-ultra-550b-a55b') : 'Standard GPU Baseline (4,500 tok/min)';

  racePanel.setDefaultModels({ cerebrasModel, gpuLiveConfigured, gpuProviderName, gpuModel });
  if (!state.running) {
    state.runTelemetry.cerebrasModel = cerebrasModel;
    state.runTelemetry.gpuProviderName = gpuProviderName;
    state.runTelemetry.gpuModel = gpuModel;
    inspector.setTelemetry(state.runTelemetry);
  }
}

elBackendSelect?.addEventListener('change', syncActiveModelLabels);
elToggleTestModel?.addEventListener('change', syncActiveModelLabels);

// ---- Progressive Disclosure Tools (Explode & Cutaway) ----
let explodeOpen = false;
let cutawayOpen = false;
let cutawayAxis = 'z';

function setExplodePanel(open) {
  explodeOpen = Boolean(open);
  elExplodeBar.hidden = !explodeOpen;
  btnToggleExplode.classList.toggle('is-active', explodeOpen);
  btnToggleExplode.setAttribute('aria-pressed', String(explodeOpen));

  if (explodeOpen) {
    if (Number(sliderExplode.value) === 0) {
      sliderExplode.value = '60';
    }
    const pct = Number(sliderExplode.value);
    valExplode.textContent = `${pct}%`;
    syncRangeSlider(sliderExplode, `${pct} percent exploded`);
    viewer.setExplode(pct / 100);
  } else {
    sliderExplode.value = '0';
    valExplode.textContent = '0%';
    syncRangeSlider(sliderExplode, '0 percent exploded');
    viewer.setExplode(0);
  }
}

function setCutawayPanel(open) {
  cutawayOpen = Boolean(open);
  elCutawayBar.hidden = !cutawayOpen;
  btnToggleCutaway.classList.toggle('is-active', cutawayOpen);
  btnToggleCutaway.setAttribute('aria-pressed', String(cutawayOpen));

  const val = Number(sliderCutaway.value) / 100;
  syncRangeSlider(sliderCutaway, `Slice position ${val.toFixed(2)}`);
  viewer.setCutaway({ enabled: cutawayOpen, axis: cutawayAxis, value: val });
}

btnToggleExplode.addEventListener('click', () => setExplodePanel(!explodeOpen));
btnToggleCutaway.addEventListener('click', () => setCutawayPanel(!cutawayOpen));

sliderExplode.addEventListener('input', () => {
  const pct = Number(sliderExplode.value);
  valExplode.textContent = `${pct}%`;
  syncRangeSlider(sliderExplode, `${pct} percent exploded`);
  viewer.setExplode(pct / 100);
});

sliderCutaway.addEventListener('input', () => {
  const val = Number(sliderCutaway.value) / 100;
  syncRangeSlider(sliderCutaway, `Slice position ${val.toFixed(2)}`);
  viewer.setCutaway({ enabled: cutawayOpen, axis: cutawayAxis, value: val });
});

for (const axisBtn of document.querySelectorAll('.axis-btn')) {
  axisBtn.addEventListener('click', () => {
    cutawayAxis = axisBtn.dataset.axis;
    for (const b of document.querySelectorAll('.axis-btn')) {
      b.classList.toggle('is-active', b.dataset.axis === cutawayAxis);
    }
    if (!cutawayOpen) {
      setCutawayPanel(true);
    } else {
      viewer.setCutaway({ enabled: true, axis: cutawayAxis, value: Number(sliderCutaway.value) / 100 });
    }
  });
}

// ---- Mode Switching ----
function setMode(mode) {
  state.mode = mode;
  for (const btn of document.querySelectorAll('.mode-tab')) {
    btn.classList.toggle('is-active', btn.dataset.mode === mode);
  }
  showroom.setVisible(mode === 'showroom');
  racePanel.setVisible(mode === 'race');
  racePanel.setStudioMode(mode === 'studio');

  requestAnimationFrame(() => viewer.resize());
}

for (const btn of document.querySelectorAll('.mode-tab')) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
}

elLiveRacePill?.addEventListener('click', () => setMode('race'));

// ---- Quick Presets & Composer Input ----
function updatePromptPlaceholder(preset) {
  elPrompt.placeholder = preset
    ? `Describe anything to build in 3D, or press ↑ for ${preset.label}…`
    : 'Describe anything to build in 3D…';
}

for (const chip of document.querySelectorAll('.chip[data-preset]')) {
  chip.addEventListener('click', () => {
    const preset = DEMO_PRESETS[chip.dataset.preset];
    if (!preset) return;
    state.activePresetId = preset.id;
    for (const c of document.querySelectorAll('.chip[data-preset]')) {
      c.classList.toggle('is-active', c.dataset.preset === preset.id);
    }
    elPrompt.value = '';
    autoSizePrompt();
    updatePromptPlaceholder(preset);
    setExplodePanel(false);
    setCutawayPanel(false);
    if (!state.running) racePanel.stopReferencePacer();
    state.activeHistoryId = null;
    loadSpecIntoStudio(preset.draft, { source: { provider: 'preset', label: 'Preset · Built-in' } });
    inspector.setHistory(state.renderHistory, null);
    syncStudioSwitcher();
    setStatusBanner('');
  });
}

elPrompt.addEventListener('input', () => {
  autoSizePrompt();
  if (elPrompt.value.trim()) {
    state.activePresetId = '';
    for (const c of document.querySelectorAll('.chip[data-preset]')) {
      c.classList.remove('is-active');
    }
  }
});

elPrompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    startForgeRun();
  }
});

// ---- Viewport & Settings Controls ----
for (const vpBtn of document.querySelectorAll('.vp-btn[data-view]')) {
  vpBtn.addEventListener('click', () => viewer.setViewPreset(vpBtn.dataset.view));
}

elToggleAutoOrbit?.addEventListener('change', () => {
  viewer.setAutoRotate(elToggleAutoOrbit.checked);
});

sliderRpm?.addEventListener('input', () => {
  const mult = Number(sliderRpm.value) / 100;
  valRpm.textContent = `${mult.toFixed(1)}×`;
  syncRangeSlider(sliderRpm, `${mult.toFixed(1)}x speed`);
  viewer.setRpmMultiplier(mult);
});

syncRangeSlider(sliderExplode, '0 percent exploded');
syncRangeSlider(sliderRpm, '1.0x speed');
syncRangeSlider(sliderCutaway, 'Slice position 0.05');
updatePromptPlaceholder(DEMO_PRESETS.turbofan);
autoSizePrompt();

// ---- Single-Pass 3D Generation Pipeline ----
function setRunningUI(running) {
  state.running = running;
  elBtnRun.classList.toggle('is-running', running);
  elBtnRun.setAttribute('aria-label', running ? 'Stop build' : 'Generate 3D');
  elIconSubmit.hidden = running;
  elIconStop.hidden = !running;

  if (elBtnRaceRun) elBtnRaceRun.textContent = running ? 'Stop' : 'Run Race';
}

function stopActiveRun() {
  state.abortController?.abort();
  racePanel.stopReferencePacer();
  hud.stopRun();
}

let lastInspectorSyncAt = 0;
let activeRunId = 0;

async function startForgeRun({ forceGpuRace = false, supersede = false, promptOverride = '' } = {}) {
  if (state.running) {
    if (supersede || state.cerebrasDone) {
      state.abortController?.abort();
      racePanel.stopReferencePacer();
    } else {
      return;
    }
  }
  const runId = ++activeRunId;
  state.cerebrasDone = false;

  const override = String(promptOverride || '').trim();
  const typed = elPrompt.value.trim();
  const activePreset = DEMO_PRESETS[state.activePresetId || 'turbofan'] || DEMO_PRESETS.turbofan;
  const prompt = override || typed || activePreset.prompt;
  const presetId = (override || typed) ? '' : activePreset.id;

  const backend = elBackendSelect.value;
  const includeGpuRace = forceGpuRace || elToggleRace.checked;
  const useTestModel = elToggleTestModel.checked;

  setRunningUI(true);
  setStatusBanner('');

  const controller = new AbortController();
  state.abortController = controller;

  try {
    const res = await fetch(apiUrl('/api/forge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        backend,
        presetId,
        useTestModel,
        includeGpuRace,
        enableVisualHeal: false
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuf = '';
    let eventName = 'message';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (runId !== activeRunId) break;
      sseBuf += decoder.decode(value, { stream: true });
      const lines = sseBuf.split('\n');
      sseBuf = lines.pop() || '';

      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const payload = JSON.parse(line.slice(5).trim());
          if (runId === activeRunId) {
            handleForgeEvent(eventName, payload);
          }
        }
      }
    }
  } catch (err) {
    if (runId !== activeRunId) return;
    if (err.name === 'AbortError') {
      setStatusBanner('Build cancelled.', 'warn');
    } else {
      setStatusBanner(err.message, 'error');
    }
    hud.failRun();
    racePanel.stopReferencePacer();
  } finally {
    if (runId === activeRunId) {
      racePanel.finishStream();
      setRunningUI(false);
      state.abortController = null;
    }
  }
}

function handleForgeEvent(event, data) {
  switch (event) {
    case 'pipeline_start':
      hud.resetForRun();
      state.lastRacePair = { cerebras: null, gpu: null };
      state.activeRunMeta = {
        isDemo: Boolean(data.isDemo),
        model: data.model || 'qwen-3.8-27b'
      };
      syncStudioSwitcher();
      racePanel.reset({
        prompt: data.prompt || elPrompt.value.trim() || DEMO_PRESETS[state.activePresetId || 'turbofan'].prompt,
        cerebrasModel: data.model,
        gpuRaceMode: data.gpuRaceMode,
        gpuProviderName: data.gpuProviderName,
        gpuModel: data.gpuModel,
        isDemo: Boolean(data.isDemo)
      });
      state.runTelemetry = {
        badge: 'Streaming…',
        badgeClass: 'diff-status is-accent',
        cerebrasModel: data.model || 'qwen-3.8-27b',
        cerebrasTps: 0,
        cerebrasTpm: 0,
        ttftMs: null,
        cerebrasElapsedMs: 0,
        cerebrasTokens: 0,
        cacheHitPct: 0,
        partCount: state.currentSpec?.parts?.length || 0,
        gpuProviderName: data.gpuRaceMode === 'live-gpu'
          ? (data.gpuProviderName || 'NVIDIA NIM GPU')
          : (data.gpuRaceMode === 'off' ? 'Disabled' : 'Reference GPU · 75 tok/s'),
        gpuModel: data.gpuRaceMode === 'live-gpu'
          ? (data.gpuModel || 'Live GPU')
          : (data.gpuRaceMode === 'off' ? 'Off' : 'Standard GPU Baseline'),
        gpuTps: 0,
        gpuTpm: 0,
        gpuElapsedMs: 0,
        gpuTokens: 0,
        gpuStatus: data.gpuRaceMode === 'off' ? 'Off' : 'Streaming…',
        speedupText: ''
      };
      inspector.setTelemetry(state.runTelemetry);
      break;

    case 'stage_update':
      hud.updateStage(data);
      break;

    case 'turn1_delta':
      hud.pushStreamDelta(data);
      racePanel.pushCerebrasDelta(data);
      if (data.tps > 0) {
        state.runTelemetry.cerebrasTps = data.tps;
        state.runTelemetry.cerebrasTpm = data.tpm || Math.round(data.tps * 60);
      }
      if (data.tokensSoFar > 0) state.runTelemetry.cerebrasTokens = data.tokensSoFar;
      if (data.ttftMs != null && state.runTelemetry.ttftMs == null) state.runTelemetry.ttftMs = data.ttftMs;
      if (data.elapsedMs > 0) state.runTelemetry.cerebrasElapsedMs = data.elapsedMs;
      if (performance.now() - lastInspectorSyncAt > 150) {
        lastInspectorSyncAt = performance.now();
        inspector.setTelemetry(state.runTelemetry);
      }
      break;

    case 'draft_ready': {
      hud.applyTurnMetrics(data.metrics);
      const tpm = data.metrics.tpm || Math.round((data.metrics.tps || 0) * 60);
      const speedText = `${tpm.toLocaleString()} tok/min · ${(data.metrics.totalMs / 1000).toFixed(1)}s`;
      const isDemo = state.activeRunMeta.isDemo;
      const model = state.activeRunMeta.model;
      const sourceLabel = isDemo ? 'Offline Demo' : `Cerebras WSE · ${model}`;
      const entry = racePanel.setCerebrasSpec(data.spec, {
        tps: data.metrics.tps,
        tpm,
        totalMs: data.metrics.totalMs,
        completionTokens: data.metrics.completionTokens,
        ttftMs: data.metrics.ttftMs,
        isDemo,
        model
      });
      if (entry) {
        state.activeHistoryId = entry.id;
      }
      loadSpecIntoStudio(data.spec, {
        preserveCamera: false,
        speedText,
        source: { provider: isDemo ? 'demo' : 'cerebras', label: sourceLabel }
      });
      inspector.setHistory(state.renderHistory, state.activeHistoryId);
      syncStudioSwitcher();
      state.runTelemetry.cerebrasTps = data.metrics.tps || state.runTelemetry.cerebrasTps;
      state.runTelemetry.cerebrasTpm = tpm;
      state.runTelemetry.ttftMs = data.metrics.ttftMs ?? state.runTelemetry.ttftMs;
      state.runTelemetry.cerebrasElapsedMs = data.metrics.totalMs || state.runTelemetry.cerebrasElapsedMs;
      state.runTelemetry.cerebrasTokens = data.metrics.completionTokens || state.runTelemetry.cerebrasTokens;
      state.runTelemetry.cacheHitPct = data.metrics.cacheHitPct ?? 0;
      state.runTelemetry.partCount = data.spec.parts.length;
      inspector.setTelemetry(state.runTelemetry);
      break;
    }

    case 'gpu_lane_delta':
      racePanel.pushLiveGpuDelta(data);
      if (data.tps > 0) {
        state.runTelemetry.gpuTps = data.tps;
        state.runTelemetry.gpuTpm = data.tpm || Math.round(data.tps * 60);
      }
      if (data.tokensSoFar > 0) state.runTelemetry.gpuTokens = data.tokensSoFar;
      if (data.elapsedMs > 0) state.runTelemetry.gpuElapsedMs = data.elapsedMs;
      state.runTelemetry.gpuStatus = 'Streaming';
      if (performance.now() - lastInspectorSyncAt > 200) {
        lastInspectorSyncAt = performance.now();
        inspector.setTelemetry(state.runTelemetry);
      }
      break;

    case 'gpu_lane_done':
      racePanel.markLiveGpuDone(data);
      state.runTelemetry.gpuTps = data.tps || state.runTelemetry.gpuTps;
      state.runTelemetry.gpuTpm = data.tpm || Math.round(state.runTelemetry.gpuTps * 60);
      state.runTelemetry.gpuElapsedMs = data.totalMs || state.runTelemetry.gpuElapsedMs;
      state.runTelemetry.gpuTokens = data.completionTokens || state.runTelemetry.gpuTokens;
      state.runTelemetry.gpuStatus = 'Done';
      inspector.setTelemetry(state.runTelemetry);
      break;

    case 'gpu_lane_stopped':
      racePanel.markLiveGpuStopped(data);
      state.runTelemetry.gpuTps = data.tps || state.runTelemetry.gpuTps;
      state.runTelemetry.gpuTpm = data.tpm || Math.round(state.runTelemetry.gpuTps * 60);
      state.runTelemetry.gpuElapsedMs = data.elapsedMs || state.runTelemetry.gpuElapsedMs;
      state.runTelemetry.gpuTokens = data.tokensSoFar || state.runTelemetry.gpuTokens;
      state.runTelemetry.gpuStatus = 'Capped';
      inspector.setTelemetry(state.runTelemetry);
      break;

    case 'gpu_lane_error':
      racePanel.markLiveGpuError(data.message || 'error');
      state.runTelemetry.gpuStatus = 'Error';
      inspector.setTelemetry(state.runTelemetry);
      break;

    case 'pipeline_complete': {
      state.cerebrasDone = true;
      hud.completeRun(data);
      racePanel.markCerebrasDone(data);
      const tpm = data.averageTpm || Math.round((data.averageTps || 0) * 60);
      if (elStatSpeed) {
        elStatSpeed.textContent = `${tpm.toLocaleString()} tok/min · ${(data.totalMs / 1000).toFixed(1)}s`;
        elStatSpeed.className = 'health-ok';
      }
      state.runTelemetry.badge = 'Complete';
      state.runTelemetry.badgeClass = 'diff-status is-ready';
      state.runTelemetry.cerebrasTps = data.averageTps || state.runTelemetry.cerebrasTps;
      state.runTelemetry.cerebrasTpm = tpm;
      state.runTelemetry.cerebrasElapsedMs = data.totalMs || state.runTelemetry.cerebrasElapsedMs;
      state.runTelemetry.cerebrasTokens = data.totalCompletionTokens || state.runTelemetry.cerebrasTokens;
      state.runTelemetry.cacheHitPct = data.cacheHitPct ?? state.runTelemetry.cacheHitPct;
      state.runTelemetry.partCount = data.partCount ?? state.runTelemetry.partCount;
      inspector.setTelemetry(state.runTelemetry);
      break;
    }

    case 'pipeline_error': {
      const msg = data.statusCode === 429
        ? 'Rate limit busy (429) — paused cleanly, no retry storm.'
        : (data.message || 'Pipeline error');
      setStatusBanner(msg, 'error');
      hud.failRun();
      racePanel.markCerebrasError(data.statusCode === 429 ? 'Queue busy (429)' : 'Error');
      racePanel.stopReferencePacer();
      state.runTelemetry.badge = data.statusCode === 429 ? '429 Paused' : 'Error';
      state.runTelemetry.badgeClass = 'diff-status is-accent';
      state.runTelemetry.speedupText = msg;
      inspector.setTelemetry(state.runTelemetry);
      break;
    }
  }
}

elBtnRun.addEventListener('click', () => {
  if (state.running) stopActiveRun();
  else startForgeRun();
});

elBtnRaceRun?.addEventListener('click', () => {
  if (state.running) stopActiveRun();
  else startForgeRun({ forceGpuRace: true });
});

// ---- Bootstrap Health, Telemetry SSE & Flagship Studio Preview ----
async function bootstrap() {
  loadSpecIntoStudio(DEMO_PRESETS.turbofan.draft);

  try {
    const res = await fetch(apiUrl('/api/health'));
    if (res.ok) {
      const health = await res.json();
      state.capabilities = health.capabilities;
      if (health.capabilities?.defaultBackend) {
        elBackendSelect.value = health.capabilities.defaultBackend;
      }
    }
  } catch {
    elBackendSelect.value = 'demo';
  }

  syncActiveModelLabels();

  try {
    const es = new EventSource(apiUrl('/api/telemetry'));
    es.addEventListener('metrics', (e) => {
      try {
        hud.applyProxyMetrics(JSON.parse(e.data));
      } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
}

bootstrap();
