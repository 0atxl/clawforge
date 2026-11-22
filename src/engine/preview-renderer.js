import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { compileCadAssembly } from './cad-compiler.js';

/**
 * Shared Lightweight Offscreen Three.js Studio Snapshot Renderer
 * Renders crisp single-frame PBR thumbnails for Compare cards and Inspector Render History
 * without opening extra WebGL contexts.
 */

let engine = null;

function ensureEngine(width, height) {
  if (engine) return engine;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f4f1);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  const keyLight = new THREE.DirectionalLight(0xfffdf8, 2.2);
  keyLight.position.set(6, 10, 7);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xdbeafe, 1.15);
  rimLight.position.set(-7, 5, -6);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xfff5eb, 0.9);
  fillLight.position.set(-5, 2, 6);
  scene.add(fillLight);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 0.85));

  const grid = new THREE.GridHelper(14, 28, 0xd0d0c9, 0xe3e3dd);
  grid.material.opacity = 0.6;
  grid.material.transparent = true;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 120);
  engine = { renderer, scene, grid, camera, envRT };
  return engine;
}

export function renderSpecThumbnail(rawSpec, { width = 560, height = 320 } = {}) {
  let compiled = null;
  try {
    const eng = ensureEngine(width, height);
    const { renderer, scene, grid, camera } = eng;

    compiled = compileCadAssembly(rawSpec);
    scene.add(compiled.root);

    const { center, size, bounds, spec } = compiled;
    grid.position.y = Number.isFinite(bounds.min.y) ? bounds.min.y - 0.14 : -1.5;

    const radius = Math.max(size.length() * 0.52, 1.35);
    const dist = radius * 2.45;
    let camDir = new THREE.Vector3(0.72, 0.44, 0.76).normalize();
    const p = spec.camera?.position;
    if (Array.isArray(p) && p.length === 3) {
      const v = new THREE.Vector3(p[0] - center.x, p[1] - center.y, p[2] - center.z);
      if (v.length() > 0.2) camDir = v.normalize();
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.copy(center).addScaledVector(camDir, dist);
    camera.lookAt(center);

    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');

    scene.remove(compiled.root);
    compiled.dispose();
    compiled = null;

    return {
      dataUrl,
      spec,
      partCount: spec.parts.length
    };
  } catch {
    if (compiled && engine?.scene) {
      try {
        engine.scene.remove(compiled.root);
        compiled.dispose();
      } catch { /* ignore */ }
    }
    return null;
  }
}
