import * as THREE from 'three';

/**
 * Procedural Studio PBR Material Library
 * Uses lightweight procedural canvas maps (carbon weave + brushed titanium grain)
 * so every generated CAD assembly looks like a KeyShot studio render with zero network texture fetches.
 */

let cachedCarbonMap = null;
let cachedBrushedMap = null;

function getCarbonTexture() {
  if (cachedCarbonMap) return cachedCarbonMap;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#181c22';
  ctx.fillRect(0, 0, size, size);
  const cell = 16;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const alt = ((x + y) / cell) % 2 === 0;
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      g.addColorStop(0, alt ? '#252b34' : '#14181e');
      g.addColorStop(0.5, alt ? '#363f4c' : '#20262f');
      g.addColorStop(1, alt ? '#1b2028' : '#12151a');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell - 1, cell - 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedCarbonMap = tex;
  return tex;
}

function getBrushedRoughnessMap() {
  if (cachedBrushedMap) return cachedBrushedMap;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    const shade = 100 + ((y * 37) % 55);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  cachedBrushedMap = tex;
  return tex;
}

const PRESET_DEFS = {
  brushed_titanium: { color: 0xaab4c0, metalness: 0.9, roughness: 0.3, clearcoat: 0.15, brushed: true },
  machined_aluminum: { color: 0xd0d8e2, metalness: 0.92, roughness: 0.22, clearcoat: 0.1, brushed: true },
  anodized_crimson: { color: 0xd92638, metalness: 0.72, roughness: 0.28, clearcoat: 0.45 },
  anodized_cobalt: { color: 0x1e6ff0, metalness: 0.74, roughness: 0.26, clearcoat: 0.45 },
  anodized_amber: { color: 0xe6841c, metalness: 0.78, roughness: 0.28, clearcoat: 0.35 },
  carbon_fiber: { color: 0x2a313c, metalness: 0.32, roughness: 0.38, clearcoat: 0.65, carbon: true },
  matte_obsidian: { color: 0x1c2028, metalness: 0.28, roughness: 0.68, clearcoat: 0.08 },
  cast_iron: { color: 0x454b54, metalness: 0.75, roughness: 0.62 },
  chrome_mirror: { color: 0xf1f5f9, metalness: 0.98, roughness: 0.08, clearcoat: 0.35 },
  copper_coil: { color: 0xd97336, metalness: 0.94, roughness: 0.24, clearcoat: 0.15, brushed: true },
  brass_gold: { color: 0xdcb045, metalness: 0.92, roughness: 0.24, clearcoat: 0.15 },
  ceramic_white: { color: 0xeff3f8, metalness: 0.05, roughness: 0.16, clearcoat: 0.85 },
  frosted_glass: { color: 0xcfe8ff, metalness: 0.05, roughness: 0.22, transmission: 0.68, opacity: 0.55, transparent: true },
  emerald_glass: { color: 0x2dd49a, metalness: 0.08, roughness: 0.18, transmission: 0.62, opacity: 0.65, transparent: true },
  glow_cyan: { color: 0x22d3ee, metalness: 0.2, roughness: 0.15, emissive: 0x06b6d4, emissiveIntensity: 2.2 },
  glow_amber: { color: 0xff9b26, metalness: 0.2, roughness: 0.18, emissive: 0xff6b00, emissiveIntensity: 2.4 },
  glow_crimson: { color: 0xff3355, metalness: 0.2, roughness: 0.18, emissive: 0xff1144, emissiveIntensity: 2.3 },
  glow_emerald: { color: 0x34d399, metalness: 0.2, roughness: 0.18, emissive: 0x10b981, emissiveIntensity: 2.1 },
  rubber_grip: { color: 0x17191d, metalness: 0.04, roughness: 0.88 },
  pcb_green: { color: 0x0f5c3a, metalness: 0.25, roughness: 0.36, clearcoat: 0.55 },
  festive_velvet: { color: 0x9f1239, metalness: 0.08, roughness: 0.85 }
};

export function createStudioMaterial(materialSpec, { clippingPlanes = [] } = {}) {
  let opts;
  if (typeof materialSpec === 'string' && PRESET_DEFS[materialSpec]) {
    opts = { ...PRESET_DEFS[materialSpec] };
  } else if (materialSpec && typeof materialSpec === 'object') {
    opts = {
      color: new THREE.Color(materialSpec.color || '#94a3b8'),
      metalness: materialSpec.metalness ?? 0.65,
      roughness: materialSpec.roughness ?? 0.32,
      clearcoat: materialSpec.clearcoat ?? 0.1,
      transmission: materialSpec.transmission ?? 0,
      opacity: materialSpec.opacity ?? 1,
      transparent: (materialSpec.opacity ?? 1) < 0.99 || (materialSpec.transmission ?? 0) > 0,
      emissive: materialSpec.emissive ? new THREE.Color(materialSpec.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: materialSpec.emissiveIntensity ?? 0
    };
  } else {
    opts = { ...PRESET_DEFS.brushed_titanium };
  }

  const mat = new THREE.MeshPhysicalMaterial({
    color: opts.color,
    metalness: opts.metalness ?? 0.65,
    roughness: opts.roughness ?? 0.32,
    clearcoat: opts.clearcoat ?? 0,
    clearcoatRoughness: 0.22,
    transmission: opts.transmission ?? 0,
    opacity: opts.opacity ?? 1,
    transparent: Boolean(opts.transparent),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: THREE.DoubleSide,
    clippingPlanes,
    clipShadows: true
  });

  if (opts.carbon) {
    const tex = getCarbonTexture();
    if (tex) mat.map = tex;
  }
  if (opts.brushed) {
    const tex = getBrushedRoughnessMap();
    if (tex) mat.roughnessMap = tex;
  }

  // Save baseline emissive for selection / heal pulse restoration
  mat.userData.baseEmissive = mat.emissive.clone();
  mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
  mat.userData.baseOpacity = mat.opacity;
  mat.userData.baseTransparent = mat.transparent;

  return mat;
}
