import * as THREE from 'three';
import { validateAndNormalizeCadSpec } from '../../shared/cad-schema.js';
import { createStudioMaterial } from './pbr-materials.js';
import { buildPartObject3D } from './geometry-builders.js';

/**
 * Compiles a ClawCAD v1 spec into a live Three.js assembly with:
 *  - Per-part explode vectors, kinematics state, clipping plane support
 *  - Bounding-box connectivity & triangle telemetry for automated visual self-heal auditing
 */
export function compileCadAssembly(rawSpec, { clippingPlane = null } = {}) {
  const spec = validateAndNormalizeCadSpec(rawSpec);
  const root = new THREE.Group();
  root.name = spec.name;

  const entries = [];
  const byId = new Map();
  const geometries = new Set();
  const materials = [];

  for (const part of spec.parts) {
    const planes = part.cutaway && clippingPlane ? [clippingPlane] : [];
    const mat = createStudioMaterial(part.material, { clippingPlanes: planes });
    materials.push(mat);

    const obj = buildPartObject3D(part, mat);
    obj.name = part.id;
    obj.position.set(part.pos[0], part.pos[1], part.pos[2]);
    obj.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
    obj.scale.set(part.scale[0], part.scale[1], part.scale[2]);
    obj.userData.partId = part.id;

    obj.traverse((child) => {
      if (child.isMesh && child.geometry) {
        geometries.add(child.geometry);
        child.userData.partId = part.id;
      }
    });

    root.add(obj);

    const entry = {
      id: part.id,
      part,
      object: obj,
      material: mat,
      basePos: new THREE.Vector3(...part.pos),
      baseRot: new THREE.Euler(...part.rot),
      explodeVec: new THREE.Vector3(...part.explodeVec),
      motion: part.motion,
      cutaway: part.cutaway
    };
    entries.push(entry);
    byId.set(part.id, entry);
  }

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  return {
    spec,
    root,
    entries,
    byId,
    bounds,
    center,
    size,
    dispose() {
      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
    }
  };
}

/**
 * Deterministic Geometry & Connectivity Auditor (0 LLM tokens!).
 * Feeds directly into Turn 2 Visual Self-Heal alongside the 2x2 Chromium PNG.
 */
export function computeGeometryTelemetry(compiled) {
  compiled.root.updateMatrixWorld(true);

  let triangleCount = 0;
  const partBoxes = [];
  const zeroVolumePartIds = [];

  for (const entry of compiled.entries) {
    entry.object.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const idx = child.geometry.index;
        const pos = child.geometry.attributes.position;
        if (idx) triangleCount += Math.floor(idx.count / 3);
        else if (pos) triangleCount += Math.floor(pos.count / 3);
      }
    });

    const box = new THREE.Box3().setFromObject(entry.object);
    const sz = box.getSize(new THREE.Vector3());
    const vol = sz.x * sz.y * sz.z;
    if (!Number.isFinite(vol) || vol < 1e-6) {
      zeroVolumePartIds.push(entry.id);
    }
    partBoxes.push({ id: entry.id, box, vol });
  }

  // Adjacency check with modest clearance tolerance (0.14 scene units)
  const tolerance = 0.14;
  const expanded = partBoxes.map((pb) => ({
    id: pb.id,
    vol: pb.vol,
    box: pb.box.clone().expandByScalar(tolerance)
  }));

  const adj = new Map(expanded.map((p) => [p.id, []]));
  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      if (expanded[i].box.intersectsBox(expanded[j].box)) {
        adj.get(expanded[i].id).push(expanded[j].id);
        adj.get(expanded[j].id).push(expanded[i].id);
      }
    }
  }

  // Find largest connected component (the main assembly body)
  const visited = new Set();
  let largestComp = [];
  for (const p of expanded) {
    if (visited.has(p.id)) continue;
    const comp = [];
    const queue = [p.id];
    visited.add(p.id);
    while (queue.length > 0) {
      const cur = queue.shift();
      comp.push(cur);
      for (const nxt of adj.get(cur) || []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }
    if (comp.length > largestComp.length) {
      largestComp = comp;
    }
  }

  const mainSet = new Set(largestComp);
  const disconnectedPartIds = expanded
    .filter((p) => !mainSet.has(p.id))
    .map((p) => p.id);

  const wholeBox = new THREE.Box3().setFromObject(compiled.root);
  const span = wholeBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(span.x, span.y, span.z, 0.001);
  const minDim = Math.max(Math.min(span.x, span.y, span.z), 0.001);

  return {
    partCount: compiled.entries.length,
    triangleCount,
    boundingSpan: {
      x: +span.x.toFixed(2),
      y: +span.y.toFixed(2),
      z: +span.z.toFixed(2)
    },
    aspectRatio: +(maxDim / minDim).toFixed(2),
    disconnectedPartIds,
    zeroVolumePartIds
  };
}
