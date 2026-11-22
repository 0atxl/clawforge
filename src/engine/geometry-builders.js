import * as THREE from 'three';

/**
 * Procedural Mechanical CAD Geometry Builders for ClawCAD v1
 * Builds high-detail gears, curved pipes, beveled milled plates, revolved lathes,
 * helical springs, radial turbine arrays, and fasteners with zero external asset files.
 */

function buildBeveledBox(w, h, d, bevel) {
  if (!bevel || bevel <= 0.001) {
    return new THREE.BoxGeometry(w, h, d);
  }
  const b = Math.min(bevel, w * 0.22, h * 0.22, d * 0.22);
  const hw = w / 2 - b;
  const hh = h / 2 - b;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh - b);
  shape.lineTo(hw, -hh - b);
  shape.quadraticCurveTo(hw + b, -hh - b, hw + b, -hh);
  shape.lineTo(hw + b, hh);
  shape.quadraticCurveTo(hw + b, hh + b, hw, hh + b);
  shape.lineTo(-hw, hh + b);
  shape.quadraticCurveTo(-hw - b, hh + b, -hw - b, hh);
  shape.lineTo(-hw - b, -hh);
  shape.quadraticCurveTo(-hw - b, -hh - b, -hw, -hh - b);

  const depth = Math.max(0.01, d - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 8
  });
  geo.center();
  return geo;
}

function buildGearGeometry({ teeth = 16, outerR = 0.6, innerR = 0.48, boreR = 0.16, thickness = 0.16 }) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.18;
    const a2 = a0 + step * 0.32;
    const a3 = a0 + step * 0.62;
    const a4 = a0 + step * 0.76;

    const p0x = Math.cos(a0) * innerR;
    const p0y = Math.sin(a0) * innerR;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
  }
  shape.closePath();

  if (boreR > 0.02 && boreR < innerR * 0.85) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const bevel = Math.min(0.018, thickness * 0.15, (outerR - innerR) * 0.25);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, thickness - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 2
  });
  geo.center();
  return geo;
}

function buildTubeGeometry({ points, radius = 0.07, tubularSegments = 32, closed = false }) {
  const vecs = [];
  for (const pt of points || []) {
    const v = new THREE.Vector3(pt[0], pt[1], pt[2]);
    if (vecs.length === 0 || v.distanceToSquared(vecs[vecs.length - 1]) > 1e-8) {
      vecs.push(v);
    }
  }
  if (vecs.length < 2) {
    return new THREE.CylinderGeometry(radius, radius, 0.3, 12);
  }
  const curve = new THREE.CatmullRomCurve3(vecs, closed, 'catmullrom', 0.4);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, 16, closed);
}

function buildLatheGeometry({ profile, segments = 36 }) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return geo;
}

function buildExtrudeGeometry({ shape: rawPts, depth = 0.25, bevel = 0.02 }) {
  const shape = new THREE.Shape();
  rawPts.forEach(([x, y], idx) => {
    if (idx === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const b = Math.min(bevel, depth * 0.25);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth),
    bevelEnabled: b > 0.001,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2
  });
  return geo;
}

function buildSpringGeometry({ radius = 0.22, wireR = 0.03, height = 0.9, turns = 6 }) {
  const pts = [];
  const totalSteps = Math.max(48, Math.round(turns * 20));
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const angle = t * turns * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = (t - 0.5) * height;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, totalSteps, wireR, 10, false);
}

function buildPrimitiveGeometry(type, params) {
  try {
    switch (type) {
      case 'box':
        return buildBeveledBox(params.w, params.h, params.d, params.bevel);
      case 'cylinder':
        return new THREE.CylinderGeometry(
          params.rt,
          params.rb,
          params.h,
          params.radialSegments || 32,
          1,
          Boolean(params.openEnded)
        );
      case 'sphere':
        return new THREE.SphereGeometry(params.r, params.wSeg || 28, params.hSeg || 20);
      case 'torus':
        return new THREE.TorusGeometry(
          params.r,
          params.tube,
          params.radialSegments || 18,
          params.tubularSegments || 44,
          params.arc || Math.PI * 2
        );
      case 'cone':
        return new THREE.ConeGeometry(params.r, params.h, params.radialSegments || 28);
      case 'capsule':
        return new THREE.CapsuleGeometry(params.r, params.len, 8, 20);
      case 'gear':
        return buildGearGeometry(params);
      case 'tube':
        return buildTubeGeometry(params);
      case 'lathe':
        return buildLatheGeometry(params);
      case 'extrude':
        return buildExtrudeGeometry(params);
      case 'spring':
        return buildSpringGeometry(params);
      default:
        return new THREE.BoxGeometry(0.4, 0.4, 0.4);
    }
  } catch {
    return new THREE.BoxGeometry(0.4, 0.4, 0.4);
  }
}

/**
 * Builds either a Mesh or a Group (for radial_array / fastener) for a ClawCAD part.
 */
export function buildPartObject3D(part, material) {
  if (part.type === 'radial_array') {
    const { count, radius, axis, tilt, blade } = part.params;
    const group = new THREE.Group();
    const sharedGeo = buildPrimitiveGeometry(blade.type, blade);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(sharedGeo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.partId = part.id;

      if (axis === 'x') {
        pivot.rotation.x = angle;
        mesh.position.set(0, radius, 0);
        mesh.rotation.y = tilt;
      } else if (axis === 'y') {
        pivot.rotation.y = angle;
        mesh.position.set(radius, 0, 0);
        mesh.rotation.x = tilt;
      } else {
        pivot.rotation.z = angle;
        mesh.position.set(0, radius, 0);
        mesh.rotation.y = tilt;
      }
      pivot.add(mesh);
      group.add(pivot);
    }
    group.userData.partId = part.id;
    group.userData.sharedGeometry = sharedGeo;
    return group;
  }

  if (part.type === 'fastener') {
    const { r, h, headH } = part.params;
    const group = new THREE.Group();
    const headGeo = new THREE.CylinderGeometry(r * 1.65, r * 1.65, headH, 6);
    const shaftGeo = new THREE.CylinderGeometry(r, r, h, 16);
    const headMesh = new THREE.Mesh(headGeo, material);
    headMesh.position.y = h / 2 + headH / 2;
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headMesh.userData.partId = part.id;

    const shaftMesh = new THREE.Mesh(shaftGeo, material);
    shaftMesh.castShadow = true;
    shaftMesh.receiveShadow = true;
    shaftMesh.userData.partId = part.id;

    group.add(headMesh, shaftMesh);
    group.userData.partId = part.id;
    return group;
  }

  const geo = buildPrimitiveGeometry(part.type, part.params);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.partId = part.id;
  return mesh;
}
