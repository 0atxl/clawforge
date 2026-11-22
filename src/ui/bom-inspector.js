/**
 * Slide-Over Right Inspector Drawer:
 *  - Interactive Clickable Bill of Materials (BOM) grouped by mechanical subsystem
 *  - Live Throughput Telemetry summary (tokens/min, tok/s, TTFT, cache, GPU baseline)
 */

function formatTpm(tps) {
  return `${Math.round((Number(tps) || 0) * 60).toLocaleString()} tok/min`;
}

export class BomAndHealInspector {
  constructor({ onSelectPartId, onIsolatePartId, onSelectHistoryItem = null }) {
    this.onSelectPartId = onSelectPartId;
    this.onIsolatePartId = onIsolatePartId;
    this.onSelectHistoryItem = onSelectHistoryItem;

    this.workspaceRoot = document.getElementById('workspace-root');
    this.drawer = document.getElementById('inspector-drawer');
    this.btnToggle = document.getElementById('btn-inspector-toggle');
    this.btnDrawerClose = document.getElementById('btn-inspector-close');
    this.elInspectorDot = document.getElementById('inspector-dot');

    this.tabs = Array.from(document.querySelectorAll('.insp-tab'));
    this.paneBom = document.getElementById('pane-bom');
    this.paneTelemetry = document.getElementById('pane-telemetry');
    this.paneHistory = document.getElementById('pane-history');

    this.elBomCount = document.getElementById('bom-count');
    this.elBomList = document.getElementById('bom-list');
    this.elHistoryCount = document.getElementById('history-count');
    this.elHistoryList = document.getElementById('history-list');
    this.elSelName = document.getElementById('sel-part-name');
    this.elSelMeta = document.getElementById('sel-part-meta');
    this.btnIsolate = document.getElementById('btn-isolate-part');
    this.btnClear = document.getElementById('btn-clear-select');

    this.elRunBadge = document.getElementById('tele-run-badge');
    this.elCModel = document.getElementById('tele-cerebras-model');
    this.elCTpm = document.getElementById('tele-cerebras-tpm');
    this.elCTps = document.getElementById('tele-cerebras-tps');
    this.elCTtft = document.getElementById('tele-cerebras-ttft');
    this.elCElapsed = document.getElementById('tele-cerebras-elapsed');
    this.elCTokens = document.getElementById('tele-cerebras-tokens');
    this.elCCache = document.getElementById('tele-cerebras-cache');
    this.elCParts = document.getElementById('tele-cerebras-parts');

    this.elGProvider = document.getElementById('tele-gpu-provider');
    this.elGModel = document.getElementById('tele-gpu-model');
    this.elGTpm = document.getElementById('tele-gpu-tpm');
    this.elGTps = document.getElementById('tele-gpu-tps');
    this.elGElapsed = document.getElementById('tele-gpu-elapsed');
    this.elGTokens = document.getElementById('tele-gpu-tokens');
    this.elGStatus = document.getElementById('tele-gpu-status');
    this.elSpeedupNote = document.getElementById('tele-speedup-note');

    this.selectedPartId = null;
    this.isolated = false;
    this._open = false;

    this._bindDrawerControls();
    this._bindTabs();
    this._bindButtons();
  }

  _bindDrawerControls() {
    this.btnToggle?.addEventListener('click', () => this.toggle());
    this.btnDrawerClose?.addEventListener('click', () => this.close({ returnFocus: true }));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) {
        const settingsOpen = document.getElementById('settings-popover')?.matches(':popover-open, .is-fallback-open');
        if (!settingsOpen) {
          e.preventDefault();
          this.close({ returnFocus: true });
        }
      }
    });
  }

  isOpen() {
    return this._open;
  }

  open(tab = null) {
    if (tab) this.switchTab(tab);
    this._open = true;
    this.drawer.classList.add('is-open');
    this.drawer.removeAttribute('inert');
    this.drawer.setAttribute('aria-hidden', 'false');
    this.workspaceRoot?.classList.add('is-inspector-open');
    this.btnToggle?.classList.add('is-active');
    this.btnToggle?.setAttribute('aria-expanded', 'true');
  }

  close({ returnFocus = false } = {}) {
    this._open = false;
    if (returnFocus) {
      this.btnToggle?.focus();
    } else if (this.drawer.contains(document.activeElement)) {
      this.btnToggle?.focus();
    }
    this.drawer.classList.remove('is-open');
    this.drawer.setAttribute('inert', '');
    this.drawer.setAttribute('aria-hidden', 'true');
    this.workspaceRoot?.classList.remove('is-inspector-open');
    this.btnToggle?.classList.remove('is-active');
    this.btnToggle?.setAttribute('aria-expanded', 'false');
  }

  toggle() {
    if (this._open) this.close({ returnFocus: true });
    else this.open();
  }

  switchTab(target, { focusTab = false } = {}) {
    for (const t of this.tabs) {
      const active = t.dataset.insp === target;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
      t.setAttribute('tabindex', active ? '0' : '-1');
      if (active && focusTab) t.focus();
    }
    if (this.paneBom) this.paneBom.hidden = target !== 'bom';
    if (this.paneTelemetry) this.paneTelemetry.hidden = target !== 'telemetry';
    if (this.paneHistory) this.paneHistory.hidden = target !== 'history';
  }

  _bindTabs() {
    this.tabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.insp);
      });
      tab.addEventListener('keydown', (e) => {
        let nextIdx = null;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % this.tabs.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + this.tabs.length) % this.tabs.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = this.tabs.length - 1;
        if (nextIdx !== null) {
          e.preventDefault();
          this.switchTab(this.tabs[nextIdx].dataset.insp, { focusTab: true });
        }
      });
    });
  }

  _bindButtons() {
    this.btnIsolate?.addEventListener('click', () => {
      if (!this.selectedPartId) return;
      this.isolated = !this.isolated;
      this.btnIsolate.textContent = this.isolated ? 'Show All' : 'Isolate';
      this.onIsolatePartId?.(this.selectedPartId, this.isolated);
    });

    this.btnClear?.addEventListener('click', () => {
      this.isolated = false;
      if (this.btnIsolate) this.btnIsolate.textContent = 'Isolate';
      this.onSelectPartId?.(null);
    });
  }

  setTelemetry(summary = {}) {
    if (this.elRunBadge) {
      this.elRunBadge.textContent = summary.badge || 'Ready';
      this.elRunBadge.className = summary.badgeClass || 'diff-status';
    }
    if (this.elCModel && summary.cerebrasModel) {
      this.elCModel.textContent = summary.cerebrasModel;
    }
    if (this.elCTpm) {
      const tps = Number(summary.cerebrasTps) || 0;
      const tpm = Number(summary.cerebrasTpm) || Math.round(tps * 60);
      this.elCTpm.textContent = `${tpm.toLocaleString()} tok/min`;
    }
    if (this.elCTps) {
      this.elCTps.textContent = `${(Number(summary.cerebrasTps) || 0).toLocaleString()}`;
    }
    if (this.elCTtft) {
      this.elCTtft.textContent = summary.ttftMs != null ? `${summary.ttftMs} ms` : '— ms';
    }
    if (this.elCElapsed) {
      this.elCElapsed.textContent = summary.cerebrasElapsedMs != null
        ? `${(summary.cerebrasElapsedMs / 1000).toFixed(1)}s`
        : '0.0s';
    }
    if (this.elCTokens) {
      this.elCTokens.textContent = `${(Number(summary.cerebrasTokens) || 0).toLocaleString()}`;
    }
    if (this.elCCache) {
      this.elCCache.textContent = `${Number(summary.cacheHitPct) || 0}%`;
    }
    if (this.elCParts) {
      this.elCParts.textContent = `${Number(summary.partCount) || 0}`;
    }

    if (this.elGProvider && summary.gpuProviderName) {
      this.elGProvider.textContent = summary.gpuProviderName;
    }
    if (this.elGModel && summary.gpuModel) {
      this.elGModel.textContent = summary.gpuModel;
    }
    if (this.elGTpm) {
      const gtps = Number(summary.gpuTps) || 0;
      const gtpm = Number(summary.gpuTpm) || Math.round(gtps * 60);
      this.elGTpm.textContent = `${gtpm.toLocaleString()} tok/min`;
    }
    if (this.elGTps) {
      this.elGTps.textContent = `${(Number(summary.gpuTps) || 0).toLocaleString()}`;
    }
    if (this.elGElapsed) {
      this.elGElapsed.textContent = summary.gpuElapsedMs != null
        ? `${(summary.gpuElapsedMs / 1000).toFixed(1)}s`
        : '0.0s';
    }
    if (this.elGTokens) {
      this.elGTokens.textContent = `${(Number(summary.gpuTokens) || 0).toLocaleString()}`;
    }
    if (this.elGStatus) {
      this.elGStatus.textContent = summary.gpuStatus || 'Idle';
    }
    if (this.elSpeedupNote) {
      if (summary.speedupText) {
        this.elSpeedupNote.textContent = summary.speedupText;
      } else if ((summary.cerebrasTps || 0) > 0 && (summary.gpuTps || 0) > 0) {
        const mult = Math.max(1, Math.round(summary.cerebrasTps / summary.gpuTps));
        this.elSpeedupNote.textContent = `Cerebras at ${formatTpm(summary.cerebrasTps)} vs ${summary.gpuProviderName || 'GPU'} at ${formatTpm(summary.gpuTps)} (~${mult}× faster).`;
      } else {
        this.elSpeedupNote.textContent = 'Run a build or race to measure live tokens/min throughput.';
      }
    }
    if (this.elInspectorDot) {
      this.elInspectorDot.hidden = !(summary.cerebrasTps > 0);
    }
  }

  setHistory(items = [], activeHistoryId = null) {
    if (this.elHistoryCount) {
      this.elHistoryCount.textContent = String(items.length);
    }
    if (!this.elHistoryList) return;
    this.elHistoryList.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty muted';
      empty.textContent = 'Run a build or race to save rendered 3D model snapshots here.';
      this.elHistoryList.appendChild(empty);
      return;
    }

    for (const item of items) {
      const card = document.createElement('article');
      card.className = `history-card${item.id === activeHistoryId ? ' is-active' : ''}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-thumb-btn';
      btn.addEventListener('click', () => {
        this.onSelectHistoryItem?.(item);
      });

      if (item.dataUrl) {
        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = `${item.spec?.name || '3D Model'} rendered snapshot`;
        btn.appendChild(img);
      }

      const meta = document.createElement('div');
      meta.className = 'history-meta';

      const top = document.createElement('div');
      top.className = 'history-top';

      const prov = document.createElement('span');
      const provCls = item.provider === 'cerebras'
        ? 'is-cerebras'
        : (item.provider === 'gpu' ? 'is-gpu' : 'is-demo');
      prov.className = `history-provider ${provCls}`;
      prov.textContent = item.providerLabel || item.shortLabel || 'Model';

      const speed = document.createElement('span');
      speed.className = 'mono muted';
      speed.style.fontSize = '10.5px';
      const tpm = Number(item.tpm) || Math.round((Number(item.tps) || 0) * 60);
      speed.textContent = tpm > 0 ? `${tpm.toLocaleString()} tok/min` : '';

      top.append(prov, speed);

      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = item.spec?.name || '3D Assembly';

      const sub = document.createElement('div');
      sub.className = 'history-sub mono';
      const partsLabel = `${item.partCount || item.spec?.parts?.length || 0} parts${item.partial ? ' · partial' : ''}`;
      const timeLabel = item.elapsedMs > 0 ? ` · ${(item.elapsedMs / 1000).toFixed(1)}s` : '';
      sub.textContent = `${partsLabel}${timeLabel}`;

      meta.append(top, title, sub);
      btn.appendChild(meta);
      card.appendChild(btn);
      this.elHistoryList.appendChild(card);
    }
  }

  setBom(spec) {
    const parts = spec?.parts || [];
    this.elBomCount.textContent = String(parts.length);
    this.elBomList.replaceChildren();

    const groups = new Map();
    for (const part of parts) {
      const g = part.group || 'Main Assembly';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(part);
    }

    for (const [groupName, groupParts] of groups.entries()) {
      const header = document.createElement('li');
      header.className = 'bom-group-label';
      header.textContent = `${groupName} (${groupParts.length})`;
      this.elBomList.appendChild(header);

      for (const part of groupParts) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bom-item-btn';
        btn.dataset.partId = part.id;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = part.name;

        const tagSpan = document.createElement('span');
        tagSpan.className = 'bom-tag';
        tagSpan.textContent = part.motion ? `${part.type} · ${part.motion.type}` : part.type;

        btn.append(nameSpan, tagSpan);
        btn.addEventListener('click', () => {
          this.isolated = false;
          if (this.btnIsolate) this.btnIsolate.textContent = 'Isolate';
          this.onSelectPartId?.(part.id);
        });
        li.appendChild(btn);
        this.elBomList.appendChild(li);
      }
    }
  }

  showSelectedPart(part) {
    this.selectedPartId = part ? part.id : null;
    for (const btn of this.elBomList.querySelectorAll('.bom-item-btn')) {
      btn.classList.toggle('is-selected', btn.dataset.partId === this.selectedPartId);
    }

    if (!part) {
      this.elSelName.textContent = 'Click any part in 3D';
      this.btnIsolate.disabled = true;
      this.isolated = false;
      this.btnIsolate.textContent = 'Isolate';
      this.elSelMeta.textContent = 'Select a part in the viewport or list below to inspect material, kinematics, and cutaway flags.';
      return;
    }

    this.elSelName.textContent = part.name;
    this.btnIsolate.disabled = false;
    const matLabel = typeof part.material === 'string' ? part.material : (part.material?.color || 'custom');
    const motionLabel = part.motion ? `${part.motion.type} (${part.motion.axis}-axis @ ${part.motion.speed})` : 'Static';

    this.elSelMeta.replaceChildren();
    const lines = [
      `ID: ${part.id} · Group: ${part.group}`,
      `Geometry: ${part.type} · Material: ${matLabel}`,
      `Kinematics: ${motionLabel} · Cutaway: ${part.cutaway ? 'Sliced' : 'Protected'}`,
      part.notes ? `Spec: ${part.notes}` : ''
    ].filter(Boolean);

    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      this.elSelMeta.appendChild(div);
    }
  }
}
