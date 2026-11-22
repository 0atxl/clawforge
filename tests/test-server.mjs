import assert from 'node:assert/strict';
import { createClawForgeServer } from '../server/index.js';
import { DEMO_PRESETS } from '../shared/demo-presets.js';

async function run() {
  const { server, shutdown } = createClawForgeServer({ startProxy: false });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Started ephemeral ClawForge server on ${baseUrl}`);

  try {
    // 1. Verify /api/health & CORS header
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.ok(healthRes.headers.get('access-control-allow-origin'), 'Missing CORS header on /api/health');
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.capabilities.singleLaneEnforced, true);
    assert.equal(health.capabilities.maxRetries, 0);
    console.log('1. /api/health + CORS header OK');

    // 2. Verify CORS preflight on /api/forge
    const preflightRes = await fetch(`${baseUrl}/api/forge`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://clawforge.vercel.app',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assert.equal(preflightRes.status, 204);
    assert.ok(preflightRes.headers.get('access-control-allow-methods')?.includes('POST'));
    console.log('2. OPTIONS /api/forge CORS preflight OK');

    // 3. Verify /api/presets
    const presetsRes = await fetch(`${baseUrl}/api/presets`);
    assert.equal(presetsRes.status, 200);
    const presetsData = await presetsRes.json();
    assert.equal(presetsData.presets.length, 3);
    console.log('3. /api/presets OK (3 built-in presets)');

    // 4. End-to-End /api/forge single-pass SSE test in offline demo mode (0 LLM API calls)
    const forgeRes = await fetch(`${baseUrl}/api/forge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: DEMO_PRESETS.v8.prompt,
        backend: 'demo',
        presetId: 'v8',
        includeGpuRace: false,
        enableVisualHeal: false
      })
    });
    assert.equal(forgeRes.status, 200);
    const sseText = await forgeRes.text();
    for (const expectedEvt of [
      'event: pipeline_start',
      'event: turn1_delta',
      'event: draft_ready',
      'event: pipeline_complete'
    ]) {
      assert.ok(sseText.includes(expectedEvt), `Missing SSE event: ${expectedEvt}`);
    }
    assert.ok(sseText.includes('"averageTpm"'), 'Missing averageTpm in pipeline_complete');
    console.log('4. End-to-End /api/forge single-pass SSE pipeline OK (V8 preset)');

    // 5. End-to-End /api/showroom/search SSE test in offline demo mode
    const showRes = await fetch(`${baseUrl}/api/showroom/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: 'holiday hardware gifts', backend: 'demo' })
    });
    assert.equal(showRes.status, 200);
    const showText = await showRes.text();
    assert.ok(showText.includes('event: showroom_complete'), 'Missing showroom_complete event');
    assert.ok(showText.includes('Keychron Q1 Pro'), 'Missing demo gift fixture');
    console.log('5. End-to-End /api/showroom/search SSE OK');

    console.log('\nALL SERVER & SSE END-TO-END TESTS PASSED!');
  } finally {
    await shutdown();
  }
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
