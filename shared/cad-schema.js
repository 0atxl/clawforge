/**
 * ClawCAD v1 — Compact Parametric Mechanical CAD Schema, Validator, Patch Applier & Static Prompts
 * Designed for high-speed Kimi K3.1 Pro generation on Cerebras (~1,000–1,600 output tokens)
 * and deterministic 0-token PBR/Kinematics compilation in Three.js.
 */

export const MATERIAL_PRESETS = [
  'brushed_titanium',
  'machined_aluminum',
  'anodized_crimson',
  'anodized_cobalt',
  'anodized_amber',
  'carbon_fiber',
  'matte_obsidian',
  'cast_iron',
  'chrome_mirror',
  'copper_coil',
  'brass_gold',
  'ceramic_white',
  'frosted_glass',
  'emerald_glass',
  'glow_cyan',
  'glow_amber',
  'glow_crimson',
  'glow_emerald',
  'rubber_grip',
  'pcb_green',
  'festive_velvet'
];

export const PART_TYPES = [
  'box',
  'cylinder',
  'sphere',
  'torus',
  'cone',
  'capsule',
  'gear',
  'tube',
  'lathe',
  'extrude',
  'radial_array',
  'spring',
  'fastener'
];

export const MOTION_TYPES = ['spin', 'reciprocate', 'oscillate', 'orbit', 'pulse'];

/**
 * 100% STATIC PREFIX SYSTEM PROMPT (zero timestamps / zero random IDs).
 * Engineered to stay compact (~1,050 tokens) so Cerebras Prompt Caching locks it
 * into the 500K cached TPM bucket across Turn 1, Turn 2 (Visual Self-Heal), and subsequent builds.
 */
export const CAD_SYSTEM_PROMPT = `You are ClawForge CAD Architect, an industrial mechanical engineer that outputs compact, physically grounded 3D assemblies in ClawCAD v1 JSON.

CRITICAL OUTPUT RULES:
- Keep internal reasoning/thinking to at most 1 brief sentence (<25 words), then immediately emit the JSON object so maximum tokens go to 3D geometry.
- Output ONLY a single valid MINIFIED JSON object (no markdown fences, no pretty-print indentation, no prose outside JSON).
- Target 16 to 22 high-impact precision parts organized into 4-5 engineering subsystems. Omit default fields (scale:[1,1,1], rot:[0,0,0], motion:null, cutaway:true) to keep total output ~1,100-1,700 tokens!
- Coordinate system: Y-up, centered near [0, 0, 0], total assembly span roughly 3.0 to 5.5 units.
- Local axis conventions (IMPORTANT!): cylinder/cone/lathe/capsule/spring default along local Y (use rot:[0,0,1.5708] to point along X); torus/gear lie in local XY plane facing Z (use rot:[0,1.5708,0] to encircle the X-axis, or rot:[1.5708,0,0] to lie flat in XZ).
- Every part MUST physically connect to or sit accurately within the assembly—NO floating disconnected parts, NO unintended Z-fighting overlaps, NO degenerate zero dimensions.
- Use cutaway: false on key internal moving assemblies (shafts, rotors, pistons, cores) so the live cutaway plane slices housings while exposing spinning internals!
- Provide expressive explodeVec: [dx, dy, dz] pointing outward from the assembly core so the Exploded View slider reveals internal engineering cleanly.
- Use rich mechanical primitives (lathe, radial_array, gear, tube, extrude, spring, fastener) instead of plain boxes.

MATERIAL PRESETS:
brushed_titanium, machined_aluminum, anodized_crimson, anodized_cobalt, anodized_amber, carbon_fiber, matte_obsidian, cast_iron, chrome_mirror, copper_coil, brass_gold, ceramic_white, frosted_glass, emerald_glass, glow_cyan, glow_amber, glow_crimson, glow_emerald, rubber_grip, pcb_green, festive_velvet
(Or custom object: {"color":"#ff5500","metalness":0.85,"roughness":0.25,"emissive":"#ff2200","emissiveIntensity":0.8})

PART TYPES & PARAMS:
- box: {w, h, d, bevel?}
- cylinder: {r? OR rt, rb, h, radialSegments?, openEnded?}
- sphere: {r}
- torus: {r, tube, arc?}
- cone: {r, h}
- capsule: {r, len}
- gear: {teeth, outerR, innerR, thickness, boreR?}
- tube: {points: [[x,y,z],...], radius, closed?}
- lathe: {profile: [[r,y],...], segments?} (axis is local Y; r >= 0)
- extrude: {shape: [[x,y],...], depth, bevel?}
- radial_array: {count, radius, axis?: "x"|"y"|"z", tilt?, blade: {type:"box"|"cylinder"|"cone"|"capsule", w?,h?,d?,r?,len?}}
- spring: {radius, wireR, height, turns}
- fastener: {r, h, headH?}

OPTIONAL MOTION OBJECT:
{"type":"spin"|"reciprocate"|"oscillate"|"orbit"|"pulse","axis":"x"|"y"|"z","speed":2.5,"amp":0.35,"phase":0}

TURN 1 (DRAFT BUILD) JSON SCHEMA:
{
  "schemaVersion": "clawcad-v1",
  "name": "Assembly Title",
  "category": "Propulsion | Robotics | Automotive | Consumer Tech | Holiday Concept",
  "summary": "1-sentence industrial engineering description",
  "specs": { "dimensions": "420 x 260 x 260 mm", "massKg": 12.4, "rpmNominal": 3200, "primaryMaterial": "Ti-6Al-4V / Carbon" },
  "camera": { "position": [4.8, 3.1, 5.2], "target": [0, 0.2, 0] },
  "cutaway": { "axis": "z", "defaultOffset": 0.1 },
  "parts": [
    {
      "id": "part_unique_id",
      "name": "Human Readable Part Name",
      "group": "Subsystem Name",
      "type": "cylinder",
      "params": {"rt": 1.1, "rb": 1.2, "h": 1.6, "openEnded": true},
      "pos": [0, 0, 0],
      "rot": [0, 0, 1.5708],
      "scale": [1, 1, 1],
      "material": "brushed_titanium",
      "explodeVec": [0, 0.8, 0],
      "cutaway": true,
      "motion": null,
      "notes": "Short material/function engineering note"
    }
  ]
}

TURN 2 (MULTIMODAL VISUAL SELF-HEAL PATCH) JSON SCHEMA:
When shown a 2x2 rendered contact sheet PNG (3/4 Hero, Front Ortho, Cutaway, Exploded) plus automated geometry telemetry, inspect the actual pixels carefully for floating parts, alignment errors, weak silhouette detail, clipping flaws, or flat contrast. Output ONLY a compact patch JSON:
{
  "critique": "2-sentence visual inspection of exact defects observed in the 2x2 render",
  "issuesFound": ["Specific defect 1", "Specific defect 2"],
  "fixesApplied": ["Exact fix 1", "Exact fix 2"],
  "upsertParts": [ /* Full or partial part objects matching existing id to repair, OR brand-new detail parts (fasteners, conduits, glow rings, brackets) */ ],
  "removePartIds": [],
  "camera": { "position": [4.6, 2.9, 5.0], "target": [0, 0.15, 0] }
}`;

export const PROMPT_CACHE_KEY_CAD = 'clawforge-cad-v1-static';
export const PROMPT_CACHE_KEY_SHOPPER = 'clawforge-shopper-v1-static';

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeVec3(vec, fallback = [0, 0, 0], limit = 50) {
  if (!Array.isArray(vec) || vec.length < 3) return [...fallback];
  return [
    clampNum(vec[0], -limit, limit, fallback[0]),
    clampNum(vec[1], -limit, limit, fallback[1]),
    clampNum(vec[2], -limit, limit, fallback[2])
  ];
}

function normalizeMaterial(mat) {
  if (typeof mat === 'string' && MATERIAL_PRESETS.includes(mat)) {
    return mat;
  }
  if (mat && typeof mat === 'object') {
    const color = typeof mat.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(mat.color)
      ? mat.color
      : '#8c96a4';
    const out = {
      color,
      metalness: clampNum(mat.metalness, 0, 1, 0.65),
      roughness: clampNum(mat.roughness, 0.04, 1, 0.32)
    };
    if (mat.clearcoat !== undefined) out.clearcoat = clampNum(mat.clearcoat, 0, 1, 0);
    if (mat.transmission !== undefined) out.transmission = clampNum(mat.transmission, 0, 1, 0);
    if (mat.opacity !== undefined) out.opacity = clampNum(mat.opacity, 0.08, 1, 1);
    if (typeof mat.emissive === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(mat.emissive)) {
      out.emissive = mat.emissive;
      out.emissiveIntensity = clampNum(mat.emissiveIntensity, 0, 6, 1.2);
    }
    return out;
  }
  return 'brushed_titanium';
}

function normalizeMotion(motion) {
  if (!motion || typeof motion !== 'object') return null;
  const type = MOTION_TYPES.includes(motion.type) ? motion.type : null;
  if (!type) return null;
  const axis = ['x', 'y', 'z'].includes(motion.axis) ? motion.axis : 'y';
  return {
    type,
    axis,
    speed: clampNum(motion.speed, -30, 30, 2.0),
    amp: clampNum(motion.amp, 0, 5, 0.25),
    phase: clampNum(motion.phase, -6.2832, 6.2832, 0)
  };
}

function normalizeParams(type, raw = {}) {
  const p = raw && typeof raw === 'object' ? raw : {};
  switch (type) {
    case 'box':
      return {
        w: clampNum(p.w ?? p.width, 0.02, 20, 0.6),
        h: clampNum(p.h ?? p.height, 0.02, 20, 0.6),
        d: clampNum(p.d ?? p.depth, 0.02, 20, 0.6),
        bevel: clampNum(p.bevel, 0, 0.25, 0)
      };
    case 'cylinder': {
      const r = clampNum(p.r ?? p.radius, 0.01, 12, 0.4);
      return {
        rt: clampNum(p.rt ?? p.radiusTop, 0.005, 12, r),
        rb: clampNum(p.rb ?? p.radiusBottom, 0.005, 12, r),
        h: clampNum(p.h ?? p.height, 0.01, 20, 1.0),
        radialSegments: Math.round(clampNum(p.radialSegments ?? p.segments, 8, 64, 32)),
        openEnded: Boolean(p.openEnded)
      };
    }
    case 'sphere':
      return {
        r: clampNum(p.r ?? p.radius, 0.02, 12, 0.4),
        wSeg: Math.round(clampNum(p.wSeg, 12, 48, 28)),
        hSeg: Math.round(clampNum(p.hSeg, 8, 32, 20))
      };
    case 'torus':
      return {
        r: clampNum(p.r ?? p.radius, 0.04, 12, 0.6),
        tube: clampNum(p.tube ?? p.tubeRadius, 0.01, 4, 0.1),
        radialSegments: Math.round(clampNum(p.radialSegments, 8, 32, 18)),
        tubularSegments: Math.round(clampNum(p.tubularSegments, 16, 72, 44)),
        arc: clampNum(p.arc, 0.1, Math.PI * 2, Math.PI * 2)
      };
    case 'cone':
      return {
        r: clampNum(p.r ?? p.radius, 0.02, 12, 0.4),
        h: clampNum(p.h ?? p.height, 0.02, 20, 0.8),
        radialSegments: Math.round(clampNum(p.radialSegments, 8, 48, 28))
      };
    case 'capsule':
      return {
        r: clampNum(p.r ?? p.radius, 0.015, 8, 0.15),
        len: clampNum(p.len ?? p.length ?? p.h, 0.02, 16, 0.6)
      };
    case 'gear': {
      const outerR = clampNum(p.outerR ?? p.r, 0.1, 8, 0.6);
      const innerR = clampNum(p.innerR, 0.06, outerR * 0.92, outerR * 0.8);
      const boreR = clampNum(p.boreR, 0, innerR * 0.8, innerR * 0.32);
      return {
        teeth: Math.round(clampNum(p.teeth, 6, 48, 16)),
        outerR,
        innerR,
        boreR,
        thickness: clampNum(p.thickness ?? p.h ?? p.depth, 0.02, 4, 0.18)
      };
    }
    case 'tube': {
      const pts = Array.isArray(p.points) && p.points.length >= 2
        ? p.points.slice(0, 24).map((pt) => normalizeVec3(pt, [0, 0, 0], 15))
        : [[0, 0, 0], [0, 0.5, 0], [0.5, 0.8, 0]];
      return {
        points: pts,
        radius: clampNum(p.radius ?? p.r, 0.01, 2, 0.07),
        tubularSegments: Math.round(clampNum(p.tubularSegments, 12, 80, 32)),
        closed: Boolean(p.closed)
      };
    }
    case 'lathe': {
      const prof = Array.isArray(p.profile) && p.profile.length >= 2
        ? p.profile.slice(0, 32).map((pt) => [
            clampNum(Array.isArray(pt) ? pt[0] : 0.3, 0.0, 12, 0.3),
            clampNum(Array.isArray(pt) ? pt[1] : 0, -12, 12, 0)
          ])
        : [[0.4, -0.5], [0.6, 0], [0.45, 0.5]];
      return {
        profile: prof,
        segments: Math.round(clampNum(p.segments, 12, 64, 36))
      };
    }
    case 'extrude': {
      const shape = Array.isArray(p.shape) && p.shape.length >= 3
        ? p.shape.slice(0, 36).map((pt) => [
            clampNum(Array.isArray(pt) ? pt[0] : 0, -12, 12, 0),
            clampNum(Array.isArray(pt) ? pt[1] : 0, -12, 12, 0)
          ])
        : [[-0.5, -0.3], [0.5, -0.3], [0.5, 0.3], [-0.5, 0.3]];
      return {
        shape,
        depth: clampNum(p.depth ?? p.h, 0.02, 10, 0.25),
        bevel: clampNum(p.bevel, 0, 0.12, 0.02)
      };
    }
    case 'radial_array': {
      const bladeRaw = p.blade && typeof p.blade === 'object' ? p.blade : {};
      const bType = ['box', 'cylinder', 'cone', 'capsule'].includes(bladeRaw.type) ? bladeRaw.type : 'box';
      return {
        count: Math.round(clampNum(p.count, 3, 42, 12)),
        radius: clampNum(p.radius ?? p.r, 0.05, 10, 0.65),
        axis: ['x', 'y', 'z'].includes(p.axis) ? p.axis : 'z',
        tilt: clampNum(p.tilt, -1.57, 1.57, 0.42),
        blade: {
          type: bType,
          ...normalizeParams(bType, bladeRaw)
        }
      };
    }
    case 'spring':
      return {
        radius: clampNum(p.radius ?? p.r, 0.04, 6, 0.22),
        wireR: clampNum(p.wireR, 0.008, 0.5, 0.03),
        height: clampNum(p.height ?? p.h, 0.1, 10, 0.9),
        turns: clampNum(p.turns, 2, 18, 6)
      };
    case 'fastener':
      return {
        r: clampNum(p.r ?? p.radius, 0.015, 1.0, 0.055),
        h: clampNum(p.h ?? p.height, 0.03, 3.0, 0.16),
        headH: clampNum(p.headH, 0.015, 0.8, 0.05)
      };
    default:
      return { w: 0.4, h: 0.4, d: 0.4, bevel: 0 };
  }
}

export function normalizePart(raw, index = 0) {
  const type = PART_TYPES.includes(raw?.type) ? raw.type : 'box';
  const pos = normalizeVec3(raw?.pos, [0, 0, 0], 30);
  const rot = normalizeVec3(raw?.rot, [0, 0, 0], Math.PI * 4);
  const scale = normalizeVec3(raw?.scale, [1, 1, 1], 12).map((s) => (Math.abs(s) < 0.01 ? 0.01 : s));

  // Auto-infer outward radial explode vector if omitted or zero
  let explodeVec = Array.isArray(raw?.explodeVec) && raw.explodeVec.length >= 3
    ? normalizeVec3(raw.explodeVec, [0, 0, 0], 10)
    : null;
  if (!explodeVec) {
    const len = Math.hypot(pos[0], pos[1], pos[2]);
    explodeVec = len > 0.05
      ? [+(pos[0] / len * 1.1).toFixed(3), +(pos[1] / len * 1.1).toFixed(3), +(pos[2] / len * 1.1).toFixed(3)]
      : [0, +(0.4 + (index % 5) * 0.2).toFixed(3), 0];
  }

  return {
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 64) : `part_${index + 1}`,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : `Component ${index + 1}`,
    group: typeof raw?.group === 'string' && raw.group.trim() ? raw.group.trim().slice(0, 48) : 'Main Assembly',
    type,
    params: normalizeParams(type, raw?.params),
    pos,
    rot,
    scale,
    material: normalizeMaterial(raw?.material),
    explodeVec,
    cutaway: raw?.cutaway === false ? false : true,
    motion: normalizeMotion(raw?.motion),
    notes: typeof raw?.notes === 'string' ? raw.notes.trim().slice(0, 180) : ''
  };
}

export function validateAndNormalizeCadSpec(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('CAD specification must be a JSON object');
  }
  const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
  if (rawParts.length === 0) {
    throw new Error('CAD specification contains zero parts');
  }

  const seenIds = new Set();
  const parts = rawParts.slice(0, 96).map((p, idx) => {
    const part = normalizePart(p, idx);
    let uniqueId = part.id;
    let suffix = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${part.id}_${suffix++}`;
    }
    seenIds.add(uniqueId);
    part.id = uniqueId;
    return part;
  });

  const cutawayAxis = ['x', 'y', 'z'].includes(raw.cutaway?.axis) ? raw.cutaway.axis : 'z';

  return {
    schemaVersion: 'clawcad-v1',
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 96) : 'Untitled Assembly',
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim().slice(0, 48) : 'Mechanical',
    summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 260) : '',
    specs: {
      dimensions: typeof raw.specs?.dimensions === 'string' ? raw.specs.dimensions.slice(0, 64) : '380 × 240 × 240 mm',
      massKg: clampNum(raw.specs?.massKg, 0.05, 50000, 8.5),
      rpmNominal: Math.round(clampNum(raw.specs?.rpmNominal, 0, 100000, 2400)),
      primaryMaterial: typeof raw.specs?.primaryMaterial === 'string' ? raw.specs.primaryMaterial.slice(0, 64) : 'Ti-6Al-4V / Al-7075'
    },
    camera: {
      position: normalizeVec3(raw.camera?.position, [4.6, 3.0, 5.0], 40),
      target: normalizeVec3(raw.camera?.target, [0, 0.1, 0], 20)
    },
    cutaway: {
      axis: cutawayAxis,
      defaultOffset: clampNum(raw.cutaway?.defaultOffset, -5, 5, 0)
    },
    parts
  };
}

/**
 * Applies Turn 2 visual self-heal patch cleanly onto an existing normalized ClawCAD spec.
 */
export function applyCadPatch(baseSpec, rawPatch) {
  const spec = structuredClone(validateAndNormalizeCadSpec(baseSpec));
  const patch = rawPatch && typeof rawPatch === 'object' ? rawPatch : {};
  const removeSet = new Set(Array.isArray(patch.removePartIds) ? patch.removePartIds.map(String) : []);

  const beforeMap = new Map(spec.parts.map((p) => [p.id, p]));
  const removed = [];
  spec.parts = spec.parts.filter((p) => {
    if (removeSet.has(p.id)) {
      removed.push(p.id);
      return false;
    }
    return true;
  });

  const updated = [];
  const added = [];
  const upserts = Array.isArray(patch.upsertParts) ? patch.upsertParts : [];
  for (const rawUpsert of upserts) {
    if (!rawUpsert || typeof rawUpsert !== 'object') continue;
    const id = typeof rawUpsert.id === 'string' && rawUpsert.id.trim() ? rawUpsert.id.trim() : null;
    if (id && beforeMap.has(id) && !removeSet.has(id)) {
      const idx = spec.parts.findIndex((p) => p.id === id);
      if (idx !== -1) {
        const prev = spec.parts[idx];
        const merged = {
          ...prev,
          ...rawUpsert,
          params: rawUpsert.params ? { ...prev.params, ...rawUpsert.params } : prev.params
        };
        spec.parts[idx] = normalizePart(merged, idx);
        updated.push(id);
      }
    } else {
      const newPart = normalizePart(rawUpsert, spec.parts.length);
      let candidate = newPart.id;
      let n = 2;
      while (spec.parts.some((p) => p.id === candidate)) {
        candidate = `${newPart.id}_${n++}`;
      }
      newPart.id = candidate;
      spec.parts.push(newPart);
      added.push(newPart.id);
    }
  }

  if (patch.camera) {
    spec.camera = {
      position: normalizeVec3(patch.camera.position, spec.camera.position, 40),
      target: normalizeVec3(patch.camera.target, spec.camera.target, 20)
    };
  }

  return {
    spec,
    critique: typeof patch.critique === 'string' ? patch.critique.trim() : 'Visual self-heal inspection complete.',
    issuesFound: Array.isArray(patch.issuesFound) ? patch.issuesFound.map(String).slice(0, 8) : [],
    fixesApplied: Array.isArray(patch.fixesApplied) ? patch.fixesApplied.map(String).slice(0, 8) : [],
    diff: { added, updated, removed }
  };
}

/**
 * Sanitizes common LLM JSON quirks without touching valid string content:
 *  - Strips // line comments and /* block comments * / outside strings
 *  - Escapes raw control characters (\n, \r, \t, \x00-\x1f) inside string literals
 *  - Strips unary + before numbers, replaces bare NaN/Infinity with 0, inserts commas between } {
 *  - Removes trailing commas before } or ] outside strings
 */
function sanitizeLlmJson(raw) {
  let out = '';
  let inString = false;
  let escaped = false;
  let lastNonWs = '';

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
        lastNonWs = '"';
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else if (code < 0x20) {
        out += ' ';
      } else {
        out += ch;
      }
      continue;
    }

    // Outside strings: skip // line comments
    if (ch === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i++;
      continue;
    }
    // Outside strings: skip /* block comments */
    if (ch === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length - 1 && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    // Strip unary + before numbers (e.g. :+0.5 or [ +1, +2 ])
    if (ch === '+' && /[:,[]/.test(lastNonWs) && /[0-9.]/.test(raw[i + 1] || '')) {
      continue;
    }

    // Replace bare NaN / Infinity / -Infinity with 0 outside strings
    if (/[:,[]/.test(lastNonWs)) {
      const rest = raw.slice(i);
      const badNum = rest.match(/^(?:-?(?:Infinity|NaN))\b/);
      if (badNum) {
        out += '0';
        lastNonWs = '0';
        i += badNum[0].length - 1;
        continue;
      }
    }

    // Insert missing comma between adjacent objects } {
    if (ch === '{' && lastNonWs === '}') {
      out += ',';
    }

    // Drop trailing comma when next non-whitespace outside strings is } or ]
    if (ch === ',') {
      let k = i + 1;
      while (k < raw.length && /\s/.test(raw[k])) k++;
      if (raw[k] === '}' || raw[k] === ']') {
        continue;
      }
    }

    out += ch;
    if (!/\s/.test(ch)) {
      lastNonWs = ch;
    }
  }

  return out;
}

function extractJsonStringProp(prefix, propName) {
  const re = new RegExp(`"${propName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const m = prefix.match(re);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

function salvageObjectWithItemArray(sanitized, { isTruncated = false } = {}) {
  const targets = [
    { key: 'parts', pattern: /"parts"\s*:\s*\[/ },
    { key: 'upsertParts', pattern: /"upsertParts"\s*:\s*\[/ },
    { key: 'gifts', pattern: /"gifts"\s*:\s*\[/ }
  ];

  for (const { key, pattern } of targets) {
    const keyIdx = sanitized.search(pattern);
    if (keyIdx === -1) continue;
    const arrayStart = sanitized.indexOf('[', keyIdx);
    let arrDepth = 1;
    let pDepth = 0;
    let pInStr = false;
    let pEsc = false;
    let itemStart = -1;
    const validItems = [];

    for (let i = arrayStart + 1; i < sanitized.length; i++) {
      const ch = sanitized[i];
      if (pInStr) {
        if (pEsc) pEsc = false;
        else if (ch === '\\') pEsc = true;
        else if (ch === '"') pInStr = false;
        continue;
      }
      if (ch === '"') {
        pInStr = true;
      } else if (ch === '[' && pDepth === 0) {
        arrDepth++;
      } else if (ch === ']' && pDepth === 0) {
        arrDepth--;
        if (arrDepth === 0) break;
      } else if (ch === '{') {
        if (pDepth === 0) itemStart = i;
        pDepth++;
      } else if (ch === '}') {
        if (pDepth === 0) break;
        pDepth--;
        if (pDepth === 0 && itemStart !== -1) {
          const itemSlice = sanitized.slice(itemStart, i + 1);
          try {
            const parsedItem = JSON.parse(sanitizeLlmJson(itemSlice));
            if (parsedItem && typeof parsedItem === 'object' && !Array.isArray(parsedItem)) {
              const looksValid = key === 'gifts'
                ? typeof parsedItem.title === 'string' && parsedItem.title.trim().length > 0
                : (typeof parsedItem.id === 'string' || typeof parsedItem.type === 'string' || typeof parsedItem.name === 'string');
              if (looksValid) validItems.push(parsedItem);
            }
          } catch { /* skip broken item and salvage remaining items */ }
          itemStart = -1;
        }
      }
    }

    if (validItems.length >= 1) {
      const prefix = sanitized.slice(0, keyIdx);
      const flag = isTruncated ? { _truncatedSalvaged: true } : { _repairedSalvaged: true };
      if (key === 'gifts') {
        const brief = extractJsonStringProp(prefix, 'brief');
        return { ...(brief ? { brief } : {}), gifts: validItems, ...flag };
      }
      const name = extractJsonStringProp(prefix, 'name');
      const category = extractJsonStringProp(prefix, 'category');
      const summary = extractJsonStringProp(prefix, 'summary');
      const critique = extractJsonStringProp(prefix, 'critique');
      return {
        schemaVersion: 'clawcad-v1',
        ...(name ? { name } : {}),
        ...(category ? { category } : {}),
        ...(summary ? { summary } : {}),
        ...(critique ? { critique } : {}),
        [key]: validItems,
        ...flag
      };
    }
  }
  return null;
}

/**
 * Robustly extracts a JSON object from an LLM completion (handles ```json fences,
 * preamble text, inline comments, unescaped control chars in strings, trailing commas,
 * and per-item array salvage on truncated or syntax-glitched JSON).
 */
export function extractJsonFromText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Empty model response');
  }
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const trimmed = stripped.trim();
  if (!trimmed) {
    throw new Error('Empty model response');
  }

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }

  // 2. Direct sanitized parse
  try {
    return JSON.parse(sanitizeLlmJson(trimmed));
  } catch { /* fall through */ }

  // 3. Code fence extraction
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(sanitizeLlmJson(fenceMatch[1].trim()));
    } catch { /* fall through */ }
  }

  // 4. Balanced top-level brace scanner
  const start = trimmed.indexOf('{');
  if (start === -1) {
    throw new Error('No JSON object found in model output');
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    const sanitized = sanitizeLlmJson(trimmed.slice(start));
    const salvaged = salvageObjectWithItemArray(sanitized, { isTruncated: true });
    if (salvaged) return salvaged;
    throw new Error('Unterminated JSON object in model output (increase maxTokens?)');
  }
  const candidate = sanitizeLlmJson(trimmed.slice(start, end + 1));
  try {
    return JSON.parse(candidate);
  } catch (err) {
    const salvaged = salvageObjectWithItemArray(candidate, { isTruncated: false })
      || salvageObjectWithItemArray(sanitizeLlmJson(trimmed.slice(start)), { isTruncated: false });
    if (salvaged) return salvaged;
    throw err;
  }
}

/**
 * Builds the compact Turn 2 multimodal user prompt referencing the 2x2 contact sheet PNG
 * and automated Chromium geometry telemetry.
 */
export function buildSelfHealUserPrompt(spec, telemetry, originalPrompt) {
  return `VISUAL SELF-HEAL AUDIT for "${spec.name}" (Original brief: "${originalPrompt}").

Attached is a 2x2 contact sheet rendered directly from your Turn 1 ClawCAD JSON:
- Top-Left: 3/4 Hero View
- Top-Right: Front Orthographic View
- Bottom-Left: Live Cross-Section Cutaway
- Bottom-Right: 70% Exploded View

AUTOMATED CHROMIUM GEOMETRY TELEMETRY:
${JSON.stringify({
  partCount: telemetry.partCount,
  triangleCount: telemetry.triangleCount,
  boundingSpan: telemetry.boundingSpan,
  aspectRatio: telemetry.aspectRatio,
  disconnectedPartIds: telemetry.disconnectedPartIds,
  consoleErrors: telemetry.consoleErrors
}, null, 2)}

Inspect the 2x2 image carefully AND fix every disconnected part or visual flaw.
Keep reasoning ultra-brief (under 200 tokens) and output ONLY a single MINIFIED Turn 2 ClawCAD patch JSON with at most 4-6 concise upsertParts (omit default scale/rot/motion fields).`;
}
