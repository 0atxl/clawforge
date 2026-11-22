import { extractJsonFromText, PROMPT_CACHE_KEY_SHOPPER } from '../shared/cad-schema.js';
import { DEMO_GIFTS_FIXTURE } from '../shared/demo-presets.js';
import { config } from './config.js';
import { acquireCerebrasLane, callPrimaryLLM } from './llm-client.js';

/**
 * Santa's 3D Gift Showroom Orchestrator
 *
 * Supports:
 *  - `demo` (and initial preview in `cerebras-direct` with 0 API calls): returns built-in sample gifts
 *  - `cerebras-direct`: fast live gift curation via Cerebras (`qwen-3.8-27b` or active model) + parallel HTTP URL verification
 *  - `openclaw`: OpenClaw `clawforge-shopper` agent (Firecrawl web_search + web_fetch) + parallel HTTP URL verification
 */

const SHOPPER_SYSTEM_PROMPT = `You are Santa's Speedy 3D Gift Hunter running on OpenClaw with Firecrawl search tools.
Find 5 REAL, currently sold physical Christmas gifts from real online retail stores matching the user's brief and budget.

HARD RULES:
- Use your web_search and web_fetch tools in ONE parallel batch to verify real live product pages.
- NEVER invent, guess, or fabricate URLs, product names, or prices. Every URL must be a real product page returned by search/fetch.
- Return ONLY a single valid JSON object matching this exact schema:
{
  "brief": "User shopping brief",
  "gifts": [
    {
      "rank": 1,
      "title": "Exact Real Product Name",
      "retailer": "Store Name",
      "price": "$199.00",
      "url": "https://exact-verified-retail-product-url",
      "category": "Short Category",
      "whyGreat": "1-sentence highlight from the live listing",
      "cadPrompt": "Detailed mechanical/industrial 3D CAD description of this product for ClawForge (mention materials, moving parts, cutaway interior)"
    }
  ]
}`;

const SHOPPER_DIRECT_PROMPT = `You are Santa's 3D Gift Curator. Given a shopping brief, recommend 5 real, well-known, currently sold physical products from genuine online stores matching the brief and budget.

OUTPUT RULES:
- Output ONLY a single valid MINIFIED JSON object (no markdown fences, no prose).
- Every item must be a real physical product with a real retailer homepage/product URL (https://...) and a rich mechanical/industrial 3D CAD concept prompt describing materials, moving parts, and cutaway interior.
- Exact JSON schema:
{"brief":"User shopping brief","gifts":[{"rank":1,"title":"Exact Product Name","retailer":"Retailer Name","price":"$199.00","url":"https://...","category":"Short Category","whyGreat":"1-sentence product highlight","cadPrompt":"Interactive 3D CAD concept description with materials, moving parts, and cutaway interior"}]}`;

async function verifyRetailUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { verified: false, httpStatus: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
      }
    });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
          'Range': 'bytes=0-1024'
        }
      });
    }
    return {
      verified: res.status >= 200 && res.status < 400,
      httpStatus: res.status,
      finalUrl: res.url || url
    };
  } catch {
    return { verified: false, httpStatus: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function runGiftShowroomSearch({
  brief = '5 standout hardware, tech, or engineering Christmas gifts under $350',
  backend = config.backend,
  useTestModel = false,
  initialPreview = false,
  signal,
  emit
}) {
  const cleanBrief = String(brief || '').trim()
    || '5 standout engineering, audio, or robotics Christmas gifts under $350 from real retailers';
  const startedAt = performance.now();

  if (backend === 'demo' || (backend === 'cerebras-direct' && initialPreview)) {
    emit('showroom_status', {
      status: 'running',
      message: backend === 'demo'
        ? 'Offline Demo Mode: loading sample showroom fixtures.'
        : 'Sample gift concepts loaded (0 API calls) — enter any brief and click Search to query live.'
    });
    await new Promise((r) => setTimeout(r, 120));
    emit('showroom_complete', {
      isDemoFixture: true,
      brief: cleanBrief,
      totalMs: Math.round(performance.now() - startedAt),
      tps: 2040,
      tpm: 122400,
      gifts: DEMO_GIFTS_FIXTURE
    });
    return;
  }

  const releaseLane = acquireCerebrasLane('gift-showroom');
  try {
    const isOpenClaw = backend === 'openclaw';
    const activeModel = isOpenClaw
      ? `openclaw:${config.openclaw.shopperAgentId}`
      : (useTestModel ? config.cerebras.testModel : config.cerebras.model);

    emit('showroom_status', {
      status: 'running',
      message: isOpenClaw
        ? `Querying OpenClaw (${config.openclaw.shopperAgentId}) + Firecrawl live retail search…`
        : `Curating 5 gift concepts on Cerebras (${activeModel})…`
    });

    const sessionKey = `clawforge-shopper-${Date.now().toString(36)}`;
    const res = await callPrimaryLLM({
      backend,
      agentId: config.openclaw.shopperAgentId,
      sessionKey,
      promptCacheKey: PROMPT_CACHE_KEY_SHOPPER,
      messages: isOpenClaw
        ? [
            { role: 'system', content: SHOPPER_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Find 5 real Christmas gifts with verified live retail product URLs for: "${cleanBrief}". Use Firecrawl web_search/web_fetch in parallel, then output ONLY the JSON object.`
            }
          ]
        : [
            { role: 'system', content: SHOPPER_DIRECT_PROMPT },
            {
              role: 'user',
              content: `Curate 5 real physical gifts matching: "${cleanBrief}". Output ONLY valid minified JSON.`
            }
          ],
      maxTokens: isOpenClaw ? 3072 : 2048,
      useTestModel,
      jsonObject: !isOpenClaw,
      signal,
      onDelta: (d) => emit('showroom_delta', d)
    });

    const rawText = (res.content || '').trim() || (res.reasoning || '').trim();
    const parsed = extractJsonFromText(rawText);
    const rawGifts = Array.isArray(parsed.gifts) ? parsed.gifts.slice(0, 5) : [];
    if (rawGifts.length === 0) {
      throw new Error('Shopper agent returned zero gifts in JSON payload.');
    }

    emit('showroom_status', {
      status: 'verifying',
      message: `Verifying ${rawGifts.length} product URLs in parallel (0 LLM tokens)…`
    });

    const verifiedGifts = await Promise.all(
      rawGifts.map(async (g, idx) => {
        const title = String(g.title || `Gift ${idx + 1}`).slice(0, 140);
        const check = await verifyRetailUrl(g.url);
        const safeFallbackUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`;
        return {
          rank: Number(g.rank) || idx + 1,
          title,
          retailer: String(g.retailer || 'Retailer').slice(0, 64),
          price: String(g.price || 'Check retailer').slice(0, 32),
          url: check.verified ? (check.finalUrl || String(g.url)) : safeFallbackUrl,
          category: String(g.category || 'Gift').slice(0, 48),
          whyGreat: String(g.whyGreat || '').slice(0, 240),
          cadPrompt: String(
            g.cadPrompt || `Interactive 3D industrial CAD concept of ${title} with cutaway interior and metallic accents`
          ).slice(0, 280),
          verified: check.verified,
          httpStatus: check.httpStatus,
          isDemoFixture: false
        };
      })
    );

    emit('showroom_complete', {
      isDemoFixture: false,
      model: activeModel,
      brief: cleanBrief,
      totalMs: Math.round(performance.now() - startedAt),
      tps: res.tps,
      tpm: res.tpm || Math.round((res.tps || 0) * 60),
      ttftMs: res.ttftMs,
      completionTokens: res.completionTokens,
      cacheHitPct: res.cacheHitPct,
      gifts: verifiedGifts
    });
  } finally {
    releaseLane();
  }
}
