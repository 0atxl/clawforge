import { apiUrl } from '../config/api.js';

/**
 * Santa's 3D Gift Showroom Controller
 * Queries OpenClaw (`clawforge-shopper` with Firecrawl web_search + web_fetch) or Cerebras Direct
 * to retrieve 5 retail gifts, then lets the user 1-click forge a 3D interactive CAD concept of any gift.
 */

function formatDomainBadge(gift) {
  let domain = gift.retailer || 'Retailer';
  try {
    if (gift.url) {
      domain = new URL(gift.url).hostname.replace(/^www\./, '');
    }
  } catch { /* fallback to retailer */ }

  if (gift.isDemoFixture) return `Demo · ${domain}`;
  if (gift.verified) return `Verified · ${domain}`;
  return gift.retailer || domain;
}

export class GiftShowroom {
  constructor({ getBackend, getUseTestModel, onForgeGift, onTelemetry }) {
    this.getBackend = getBackend;
    this.getUseTestModel = getUseTestModel;
    this.onForgeGift = onForgeGift;
    this.onTelemetry = onTelemetry;

    this.panel = document.getElementById('showroom-panel');
    this.form = document.getElementById('showroom-form');
    this.inputBrief = document.getElementById('showroom-brief');
    this.btnRun = document.getElementById('btn-showroom-run');
    this.statusRow = document.getElementById('showroom-status-row');
    this.spinner = document.getElementById('showroom-spinner');
    this.banner = document.getElementById('showroom-banner');
    this.elapsedEl = document.getElementById('showroom-elapsed');
    this.grid = document.getElementById('showroom-grid');

    this.loadedOnce = false;
    this.controller = null;
    this.elapsedTimer = null;
    this.searchStartAt = 0;
    this.lastGifts = [];

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.controller) {
        this.controller.abort();
        return;
      }
      this.runSearch({ initialPreview: false });
    });

    for (const chip of document.querySelectorAll('[data-showroom-brief]')) {
      chip.addEventListener('click', () => {
        const brief = chip.getAttribute('data-showroom-brief');
        if (!brief) return;
        for (const c of document.querySelectorAll('[data-showroom-brief]')) {
          c.classList.toggle('is-active', c === chip);
        }
        this.inputBrief.value = brief;
        this.runSearch({ initialPreview: false });
      });
    }
  }

  setVisible(visible) {
    this.panel.hidden = !visible;
    if (visible && !this.loadedOnce) {
      // Always populate verified sample gift cards on first open (0ms wait, never a blank page)
      this.runSearch({ initialPreview: true });
    }
  }

  _startElapsedTimer() {
    this._stopElapsedTimer();
    this.searchStartAt = performance.now();
    if (this.spinner) this.spinner.hidden = false;
    if (this.elapsedEl) {
      this.elapsedEl.hidden = false;
      this.elapsedEl.textContent = '0.0s';
    }
    this.elapsedTimer = setInterval(() => {
      if (this.elapsedEl) {
        const sec = (performance.now() - this.searchStartAt) / 1000;
        this.elapsedEl.textContent = `${sec.toFixed(1)}s`;
      }
    }, 100);
  }

  _stopElapsedTimer() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    if (this.spinner) this.spinner.hidden = true;
    if (this.elapsedEl) this.elapsedEl.hidden = true;
  }

  setBanner(text, variant = '') {
    if (!text) {
      if (this.statusRow) this.statusRow.hidden = true;
      return;
    }
    if (this.statusRow) {
      this.statusRow.hidden = false;
      this.statusRow.className = `showroom-status-row ${variant ? `is-${variant}` : ''}`.trim();
    }
    if (this.banner) {
      this.banner.textContent = text;
    }
  }

  _renderSkeletonCards(count = 5) {
    this.grid.replaceChildren();
    for (let i = 0; i < count; i++) {
      const card = document.createElement('article');
      card.className = 'gift-card is-skeleton';
      card.setAttribute('aria-hidden', 'true');
      card.innerHTML = `
        <div class="gift-card-top">
          <span class="skel-line skel-pill"></span>
          <span class="skel-line skel-price"></span>
        </div>
        <div class="skel-line skel-title"></div>
        <div class="skel-line skel-body"></div>
        <div class="skel-line skel-body is-short"></div>
        <div class="gift-actions">
          <span class="skel-line skel-btn-sm"></span>
          <span class="skel-line skel-btn-lg"></span>
        </div>
      `;
      this.grid.appendChild(card);
    }
  }

  async runSearch({ initialPreview = false } = {}) {
    if (this.controller) this.controller.abort();
    this.controller = new AbortController();
    this.loadedOnce = true;

    const backend = this.getBackend();
    const useTestModel = Boolean(this.getUseTestModel?.());
    const brief = this.inputBrief.value.trim();

    if (!initialPreview) {
      this.btnRun.textContent = 'Cancel';
      this.btnRun.classList.add('is-running');
      this._startElapsedTimer();
      this._renderSkeletonCards(5);
      this.setBanner('OpenClaw (clawforge-shopper) searching live retailers with Kimi K3.1 Pro + Firecrawl…');
    } else {
      this.setBanner('Loading verified gift showcase…');
    }

    try {
      const res = await fetch(apiUrl('/api/showroom/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, backend, useTestModel, initialPreview }),
        signal: this.controller.signal
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let eventName = 'message';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trimEnd();
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const data = JSON.parse(line.slice(5).trim());
            this._handleEvent(eventName, data);
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        this.setBanner('Search cancelled — showing previous verified products.');
        if (this.lastGifts.length > 0) {
          this._renderGifts(this.lastGifts);
        }
      } else {
        this.setBanner(err.message, 'error');
        if (this.lastGifts.length > 0) {
          this._renderGifts(this.lastGifts);
        }
      }
    } finally {
      this._stopElapsedTimer();
      this.btnRun.textContent = 'Search';
      this.btnRun.classList.remove('is-running');
      this.btnRun.disabled = false;
      this.controller = null;
    }
  }

  _handleEvent(event, data) {
    if (event === 'showroom_status') {
      this.setBanner(data.message || 'Searching…');
    } else if (event === 'showroom_delta') {
      const tps = Number(data.tps) || 0;
      const tpm = Number(data.tpm) || Math.round(tps * 60);
      const tok = Number(data.tokensSoFar) || 0;
      if (tpm > 0) {
        const phaseLabel = data.phase === 'tool_call'
          ? 'OpenClaw + Firecrawl querying retailers'
          : (data.phase === 'reasoning' ? 'Kimi K3.1 Pro analyzing retail listings' : 'Kimi K3.1 Pro streaming verified gifts');
        this.setBanner(`${phaseLabel} · ${tpm.toLocaleString()} tok/min${tok > 0 ? ` (${tok.toLocaleString()} tok)` : ''}…`);
        this.onTelemetry?.({ phase: data.phase, tps, ttftMs: data.ttftMs, tokensSoFar: data.tokensSoFar });
      }
    } else if (event === 'showroom_error') {
      this._stopElapsedTimer();
      this.setBanner(data.message || 'Search failed', 'error');
      if (this.lastGifts.length > 0) {
        this._renderGifts(this.lastGifts);
      }
    } else if (event === 'showroom_complete') {
      this._stopElapsedTimer();
      if (data.isDemoFixture) {
        this.setBanner(
          'Verified Starter Showcase — click a category chip or type any brief and press Search for a live OpenClaw + Kimi K3.1 Pro retail search.'
        );
      } else {
        const tps = Number(data.tps) || 0;
        const tpm = Number(data.tpm) || Math.round(tps * 60);
        this.setBanner(
          `Found ${data.gifts.length} verified gifts in ${(data.totalMs / 1000).toFixed(1)}s · ${tpm.toLocaleString()} tok/min (${tps.toLocaleString()} tok/s) · ${data.model || 'OpenClaw · Kimi K3.1 Pro'}`
        );
        this.onTelemetry?.({
          tps,
          ttftMs: data.ttftMs,
          completionTokens: data.completionTokens,
          cacheHitPct: data.cacheHitPct,
          complete: true
        });
      }
      if (Array.isArray(data.gifts) && data.gifts.length > 0) {
        this.lastGifts = data.gifts;
      }
      this._renderGifts(data.gifts || []);
    }
  }

  _renderGifts(gifts) {
    this.grid.replaceChildren();
    for (const gift of gifts) {
      const card = document.createElement('article');
      card.className = 'gift-card';

      const top = document.createElement('div');
      top.className = 'gift-card-top';

      const domainBadge = document.createElement('span');
      domainBadge.className = 'gift-domain';
      domainBadge.textContent = formatDomainBadge(gift);

      const price = document.createElement('span');
      price.className = 'gift-price mono';
      price.textContent = gift.price || 'Check link';
      top.append(domainBadge, price);

      const h3 = document.createElement('h3');
      h3.textContent = gift.title;

      const why = document.createElement('p');
      why.className = 'gift-why';
      why.textContent = gift.whyGreat;

      const actions = document.createElement('div');
      actions.className = 'gift-actions';

      const link = document.createElement('a');
      link.className = 'gift-link';
      link.href = gift.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Retailer ↗';

      const forgeBtn = document.createElement('button');
      forgeBtn.type = 'button';
      forgeBtn.className = 'btn-ember';
      forgeBtn.textContent = 'Forge 3D →';
      forgeBtn.addEventListener('click', () => {
        this.onForgeGift?.(gift);
      });

      actions.append(link, forgeBtn);
      card.append(top, h3, why, actions);
      this.grid.appendChild(card);
    }
  }
}
