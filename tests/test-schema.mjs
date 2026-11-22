import assert from 'node:assert/strict';
import {
  CAD_SYSTEM_PROMPT,
  validateAndNormalizeCadSpec,
  applyCadPatch,
  extractJsonFromText,
  buildSelfHealUserPrompt
} from '../shared/cad-schema.js';
import { DEMO_PRESETS } from '../shared/demo-presets.js';
import { acquireCerebrasLane, isCerebrasLaneBusy } from '../server/llm-client.js';

console.log('1. Checking anti-429 static system prompt budget...');
const approxPromptTokens = Math.ceil(CAD_SYSTEM_PROMPT.length / 3.8);
assert.ok(approxPromptTokens < 1300, `CAD_SYSTEM_PROMPT too large: ~${approxPromptTokens} tokens`);
console.log(`   OK: CAD_SYSTEM_PROMPT is ${CAD_SYSTEM_PROMPT.length} chars (~${approxPromptTokens} tokens, 100% static prefix)`);

console.log('2. Checking JSON extractor robustness...');
const parsed1 = extractJsonFromText('Sure! Here is your spec:\n```json\n{"a": 1, "b": [2, 3,],}\n```\nDone.');
assert.deepEqual(parsed1, { a: 1, b: [2, 3] });
const parsed2 = extractJsonFromText('Leading chatter {"nested":{"k":"v"}} trailing text');
assert.deepEqual(parsed2, { nested: { k: 'v' } });
const parsed3 = extractJsonFromText('{\n  "name": "Line1\nLine2\tTabbed", // inline comment\n  "ok": true,\n}');
assert.deepEqual(parsed3, { name: 'Line1\nLine2\tTabbed', ok: true });
const truncated = '{"name":"Test","parts":[{"id":"a","type":"box","params":{"w":1,"h":1,"d":1}},{"id":"b","type":"box","params":{"w":1,"h":1,"d":1}},{"id":"c","type":"box","params":{"w":1,"h":1,"d":1}},{"id":"d","type":"cyl';
const salvaged = extractJsonFromText(truncated);
assert.equal(salvaged.parts.length, 3);
assert.equal(salvaged._truncatedSalvaged, true);
const truncatedPatch = '{"critique":"Fixed floating bolt","issuesFound":["floating"],"fixesApplied":["repositioned"],"upsertParts":[{"id":"bolt1","pos":[0,1,0]},{"id":"bolt2","pos":[0,2';
const salvagedPatch = extractJsonFromText(truncatedPatch);
assert.equal(salvagedPatch.upsertParts.length, 1);
assert.equal(salvagedPatch._truncatedSalvaged, true);
const glitchedComplete = '{"name":"Mars Exploration Rover","parts":[{"id":"chassis","type":"box","params":{"w":1,"h":0.5,"d":1}},{"id":"bad" "broken":true},{"id":"wheel","type":"cylinder","params":{"r":0.2,"h":0.1}}],"parts":[]}';
const repairedSpec = validateAndNormalizeCadSpec(extractJsonFromText(glitchedComplete));
assert.equal(repairedSpec.name, 'Mars Exploration Rover');
assert.equal(repairedSpec.parts.length, 2);
const glitchedGifts = '{"brief":"desk gifts","gifts":[{"rank":1,"title":"Keychron Q1","url":"https://keychron.com"},{"rank":2 "title":"Broken"},{"rank":3,"title":"Fellow Kettle","url":"https://fellowproducts.com"}]}';
const repairedGifts = extractJsonFromText(glitchedGifts);
assert.equal(repairedGifts.gifts.length, 2);
assert.equal(repairedGifts._repairedSalvaged, true);
console.log('   OK: extractJsonFromText handles fences, preambles, comments, control chars, trailing commas, and Turn 1 + Turn 2 + syntax-glitched salvage');

console.log('3. Validating all 3 mechanical presets + Turn 2 visual self-heal patches...');
for (const [id, preset] of Object.entries(DEMO_PRESETS)) {
  const draft = validateAndNormalizeCadSpec(preset.draft);
  assert.ok(draft.parts.length >= 16, `${id} should have rich mechanical detail`);
  const healed = applyCadPatch(draft, preset.healPatch);
  assert.ok(healed.spec.parts.length >= draft.parts.length, `${id} healed spec should preserve/add parts`);
  assert.ok(healed.critique.length > 20, `${id} heal critique present`);
  const healPrompt = buildSelfHealUserPrompt(draft, {
    partCount: draft.parts.length,
    triangleCount: 12000,
    boundingSpan: { x: 3.4, y: 2.8, z: 2.8 },
    aspectRatio: 1.21,
    disconnectedPartIds: ['fuel_manifold_top'],
    consoleErrors: []
  }, preset.prompt);
  assert.ok(healPrompt.includes('2x2 contact sheet'), 'Self-heal prompt mentions 2x2 contact sheet');
  console.log(`   OK: ${id} -> draft ${draft.parts.length} parts, healed ${healed.spec.parts.length} parts (+${healed.diff.added.length} / ~${healed.diff.updated.length})`);
}

console.log('4. Verifying strict single-lane Cerebras mutex (anti-congestion lock)...');
assert.equal(isCerebrasLaneBusy(), false);
const release = acquireCerebrasLane('test-turn');
assert.equal(isCerebrasLaneBusy(), true);
assert.throws(
  () => acquireCerebrasLane('concurrent-spam'),
  (err) => err.statusCode === 409 && /single-lane/i.test(err.message)
);
release();
assert.equal(isCerebrasLaneBusy(), false);
console.log('   OK: Single-lane mutex blocks concurrent Cerebras requests with HTTP 409');

console.log('\nALL SCHEMA & ANTI-CONGESTION TESTS PASSED.');
