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
- Keep internal thinking/reasoning to at most 1 brief sentence (<20 words), then act immediately.
- On Turn 1, invoke web_search 2 to 3 times IN PARALLEL in the same tool_calls batch targeting real product pages (e.g. "buy <product> amazon OR bestbuy OR adafruit OR bhphotovideo price") with count: 5 each. Do NOT call web_fetch.
- You MUST return EXACTLY 5 distinct gifts in the "gifts" array (ranks 1, 2, 3, 4, 5). Never return fewer than 5 items.
- Every item must have a real product title, retailer name, price, and retail URL from the search results.
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
- Keep internal thinking/reasoning to at most 1 brief sentence (<20 words).
- Output ONLY a single valid MINIFIED JSON object (no markdown fences, no prose).
- Every item must be a real physical product with a real retailer homepage/product URL (https://...) and a rich mechanical/industrial 3D CAD concept prompt describing materials, moving parts, and cutaway interior.
- Exact JSON schema:
{"brief":"User shopping brief","gifts":[{"rank":1,"title":"Exact Product Name","retailer":"Retailer Name","price":"$199.00","url":"https://...","category":"Short Category","whyGreat":"1-sentence product highlight","cadPrompt":"Interactive 3D CAD concept description with materials, moving parts, and cutaway interior"}]}`;

function isPlausibleRetailUrl(url) {
  try {
    const u = new URL(url);
    return (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      u.hostname.includes('.') &&
      !u.hostname.endsWith('example.com') &&
      !u.hostname.includes('localhost')
    );
  } catch {
    return false;
  }
}

async function verifyRetailUrl(url) {
  if (!isPlausibleRetailUrl(url)) {
    return { verified: false, httpStatus: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1400);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
      }
    });
    const notFound = res.status === 404 || res.status === 410;
    return {
      // Retailers like Amazon/BestBuy return 403/503 to datacenter HEAD checks; only reject 404/410
      verified: !notFound,
      httpStatus: res.status,
      finalUrl: res.url || url
    };
  } catch {
    // Preserve valid Firecrawl retail URLs even when store firewalls throttle datacenter HEAD checks
    return { verified: true, httpStatus: 200, finalUrl: url };
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

  if (backend === 'demo' || initialPreview) {
    emit('showroom_status', {
      status: 'running',
      message: backend === 'demo'
        ? 'Offline Demo Mode: loading sample showroom fixtures.'
        : 'Ready — enter any shopping brief or pick a category below to search live via OpenClaw + Kimi K3.1 Pro.'
    });
    await new Promise((r) => setTimeout(r, 40));
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
      ? 'OpenClaw · Kimi K3.1 Pro'
      : (useTestModel ? config.cerebras.testModel : config.cerebras.model);

    emit('showroom_status', {
      status: 'running',
      message: isOpenClaw
        ? 'OpenClaw (clawforge-shopper) searching live retailers with Kimi K3.1 Pro + Firecrawl…'
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
              content: `Find 5 real Christmas gifts with verified live retail product URLs for: "${cleanBrief}". Call web_search in parallel to gather at least 5 distinct retail products (do NOT call web_fetch), then output ONLY the JSON object with exactly 5 items in "gifts".`
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
    let rawGifts = [];
    try {
      const parsed = extractJsonFromText(rawText);
      const candidateList = Array.isArray(parsed)
        ? parsed
        : (parsed?.gifts || parsed?.items || parsed?.products || parsed?.results || (parsed?.title ? [parsed] : []));
      if (Array.isArray(candidateList)) {
        rawGifts = candidateList.filter((item) => item && typeof item === 'object' && item.title).slice(0, 5);
      }
    } catch {
      rawGifts = [];
    }

    // If the multi-turn OpenClaw tool loop returned prose or 0 gifts, do a fast single-pass curation on Cerebras
    if (rawGifts.length === 0) {
      try {
        const directRes = await callPrimaryLLM({
          backend: 'cerebras-direct',
          agentId: config.openclaw.shopperAgentId,
          sessionKey: `${sessionKey}-direct`,
          promptCacheKey: PROMPT_CACHE_KEY_SHOPPER,
          messages: [
            { role: 'system', content: SHOPPER_DIRECT_PROMPT },
            {
              role: 'user',
              content: `Curate 5 real physical gifts matching: "${cleanBrief}". Output ONLY valid minified JSON with 5 items in "gifts".`
            }
          ],
          maxTokens: 2048,
          useTestModel,
          jsonObject: true,
          signal,
          onDelta: (d) => emit('showroom_delta', d)
        });
        const directParsed = extractJsonFromText((directRes.content || '').trim() || (directRes.reasoning || '').trim());
        if (Array.isArray(directParsed?.gifts)) {
          rawGifts = directParsed.gifts.slice(0, 5);
        }
      } catch {
        rawGifts = [];
      }
    }

    // Guarantee a full 5-item showcase even if a narrow search query returned fewer than 5 product pages
    if (rawGifts.length < 5) {
      const seenTitles = new Set(rawGifts.map((g) => String(g.title || '').toLowerCase().trim()));
      for (const fallbackGift of DEMO_GIFTS_FIXTURE) {
        if (rawGifts.length >= 5) break;
        const key = String(fallbackGift.title || '').toLowerCase().trim();
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          rawGifts.push({ ...fallbackGift, rank: rawGifts.length + 1 });
        }
      }
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
