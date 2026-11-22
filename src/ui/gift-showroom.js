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
    this.banner = document.getElementById('showroom-banner');
    this.grid = document.getElementById('showroom-grid');

    this.loadedOnce = false;
    this.controller = null;

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.runSearch({ initialPreview: false });
    });
  }

  setVisible(visible) {
    this.panel.hidden = !visible;
    if (visible && !this.loadedOnce && this.getBackend() !== 'openclaw') {
      // Auto-populate sample gift concepts on first view (0 API calls)
      this.runSearch({ initialPreview: true });
    }
  }

  setBanner(text, variant = '') {
    if (!text) {
      this.banner.hidden = true;
      return;
    }
    this.banner.hidden = false;
    this.banner.className = `showroom-banner ${variant ? `is-${variant}` : ''}`.trim();
    this.banner.textContent = text;
  }

  async runSearch({ initialPreview = false } = {}) {
    if (this.controller) this.controller.abort();
    this.controller = new AbortController();
    this.loadedOnce = true;

    const backend = this.getBackend();
    const useTestModel = Boolean(this.getUseTestModel?.());
    const brief = this.inputBrief.value.trim();
    this.btnRun.disabled = true;
    this.setBanner(
      backend === 'openclaw'
        ? 'Searching live retail sites via OpenClaw + Firecrawl…'
        : (initialPreview || backend === 'demo'
            ? 'Loading 5 sample gift concepts (0 API calls)…'
            : 'Curating 5 gift concepts live on Cerebras…')
    );

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
      if (err.name !== 'AbortError') {
        this.setBanner(err.message, 'error');
      }
    } finally {
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
      if (tpm > 0) {
        this.setBanner(`Streaming gift search · ${tpm.toLocaleString()} tok/min…`);
        this.onTelemetry?.({ tps, ttftMs: data.ttftMs, tokensSoFar: data.tokensSoFar });
      }
    } else if (event === 'showroom_error') {
      this.setBanner(data.message || 'Search failed', 'error');
    } else if (event === 'showroom_complete') {
      if (data.isDemoFixture) {
        this.setBanner(
          this.getBackend() === 'demo'
            ? 'Offline Demo Fixtures (0 API calls) — click "Forge 3D →" on any item.'
            : 'Sample Gift Concepts — enter any brief and click Search to query live, or click "Forge 3D →" on any card.'
        );
      } else {
        const tps = Number(data.tps) || 0;
        const tpm = Number(data.tpm) || Math.round(tps * 60);
        this.setBanner(
          `Found ${data.gifts.length} gifts in ${(data.totalMs / 1000).toFixed(1)}s · ${tpm.toLocaleString()} tok/min (${tps.toLocaleString()} tok/s)${data.model ? ` · ${data.model}` : ''}`
        );
        this.onTelemetry?.({
          tps,
          ttftMs: data.ttftMs,
          completionTokens: data.completionTokens,
          cacheHitPct: data.cacheHitPct,
          complete: true
        });
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
