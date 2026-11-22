import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { compileCadAssembly, computeGeometryTelemetry } from './cad-compiler.js';

/**
 * ClawForge Interactive PBR Three.js Studio Viewport
 * Supports OrbitControls, Exploded View, Live WebGL Cross-Section Cutaway,
 * Real-Time Kinematics/RPM Animation, Raycast Part Selection, and Visual Self-Heal Flash.
 */
export class ClawForgeViewer {
  constructor(container, { onSelectPart = null } = {}) {
    this.container = container;
    this.onSelectPart = onSelectPart;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f4f1);
    this.scene.fog = new THREE.FogExp2(0xf4f4f1, 0.016);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 120);
    this.camera.position.set(4.8, 2.9, 5.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    const gl = this.renderer.getContext();
    const dbg = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftwareWebGL = /swiftshader|llvmpipe|software/i.test(rendererStr);

    this.renderer.setPixelRatio(isSoftwareWebGL ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = !isSoftwareWebGL;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // Studio IBL reflections via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // 3-Point Light-Studio Cyclorama Lighting
    const keyLight = new THREE.DirectionalLight(0xfffdf8, 2.2);
    keyLight.position.set(6, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 28;
    const d = 5.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 1.15);
    rimLight.position.set(-7, 5, -6);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xfff5eb, 0.9);
    fillLight.position.set(-5, 2, 6);
    this.scene.add(fillLight);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 0.85);
    this.scene.add(hemi);

    // Architectural Studio Floor + Subtle Turntable Ring
    this.stageGroup = new THREE.Group();
    const grid = new THREE.GridHelper(18, 36, 0xd0d0c9, 0xe3e3dd);
    grid.material.opacity = 0.65;
    grid.material.transparent = true;
    this.stageGroup.add(grid);

    const ringGeo = new THREE.RingGeometry(2.45, 2.468, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc8c8c0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    this.stageGroup.add(ring);

    const shadowPlane = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    this.stageGroup.add(shadowPlane);

    this.stageGroup.position.y = -1.7;
    this.scene.add(this.stageGroup);

    // Live WebGL Cross-Section Cutaway Plane + Visual Guide Frame
    this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
    this.cutawayEnabled = false;
    this.cutawayAxis = 'z';
    this.cutawayValue = 0.0; // normalized -1..+1 across assembly bounds

    const guideGeo = new THREE.PlaneGeometry(4.4, 4.4);
    const guideEdges = new THREE.EdgesGeometry(guideGeo);
    this.cutawayGuide = new THREE.Group();
    const fillGuide = new THREE.Mesh(
      guideGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe85222,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const borderGuide = new THREE.LineSegments(
      guideEdges,
      new THREE.LineBasicMaterial({ color: 0xe85222, transparent: true, opacity: 0.65 })
    );
    this.cutawayGuide.add(fillGuide, borderGuide);
    this.cutawayGuide.visible = false;
    this.scene.add(this.cutawayGuide);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 24;

    // Interactive state
    this.compiled = null;
    this.explodeTarget = 0;
    this.explodeCurrent = 0;
    this.rpmMultiplier = 1.0;
    this.selectedPartId = null;
    this.isolatedPartId = null;
    this.healedPartIds = new Set();
    this.healFlashUntil = 0;

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._pointerDownPos = { x: 0, y: 0 };
    this._bindEvents();

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);

    // Animation loop
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this._disposed = false;
    this._raf = requestAnimationFrame(() => this._animate());
  }

  _bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this._pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - this._pointerDownPos.x, e.clientY - this._pointerDownPos.y);
      if (dist > 6 || !this.compiled) return;
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.compiled.root.children, true);
      if (hits.length > 0) {
        const partId = hits[0].object.userData.partId || null;
        this.selectPart(partId);
      } else {
        this.selectPart(null);
      }
    });
  }

  resize() {
    if (this._disposed) return;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  loadSpec(rawSpec, { preserveCamera = false, highlightPartIds = [] } = {}) {
    if (this.compiled) {
      this.scene.remove(this.compiled.root);
      this.compiled.dispose();
      this.compiled = null;
    }

    this.compiled = compileCadAssembly(rawSpec, { clippingPlane: this.clippingPlane });
    this.scene.add(this.compiled.root);

    // Position CAD stage cleanly below the lowest assembly vertex
    const minY = this.compiled.bounds.min.y;
    this.stageGroup.position.y = Number.isFinite(minY) ? minY - 0.16 : -1.7;

    // Reset or adopt cutaway axis from spec
    this.cutawayAxis = this.compiled.spec.cutaway?.axis || 'z';
    this._updateClippingPlane();

    if (!preserveCamera) {
      this.frameAssembly();
    }

    if (highlightPartIds.length > 0) {
      this.healedPartIds = new Set(highlightPartIds);
      this.healFlashUntil = performance.now() + 2800;
    } else {
      this.healedPartIds.clear();
      this.healFlashUntil = 0;
    }

    this.selectedPartId = null;
    this.isolatedPartId = null;
    this._applySelectionVisuals();

    return {
      spec: this.compiled.spec,
      telemetry: computeGeometryTelemetry(this.compiled)
    };
  }

  frameAssembly() {
    if (!this.compiled) return;
    const { spec, center, size } = this.compiled;
    const radius = Math.max(size.length() * 0.52, 1.4);
    const camPos = spec.camera?.position;
    const camTarget = spec.camera?.target;
    const yDockBias = -Math.max(size.y * 0.05, 0.14);

    if (camPos && camTarget) {
      const tx = camTarget[0];
      const ty = camTarget[1] + yDockBias;
      const tz = camTarget[2];
      const dx = camPos[0] - camTarget[0];
      const dy = camPos[1] - camTarget[1];
      const dz = camPos[2] - camTarget[2];
      this.controls.target.set(tx, ty, tz);
      this.camera.position.set(tx + dx * 1.22, ty + dy * 1.22, tz + dz * 1.22);
    } else {
      const ty = center.y + yDockBias;
      this.controls.target.set(center.x, ty, center.z);
      this.camera.position.set(center.x + radius * 1.62, ty + radius * 0.95, center.z + radius * 1.72);
    }
    this.controls.update();
  }

  setViewPreset(view) {
    if (!this.compiled) return;
    const { center, size } = this.compiled;
    const dist = Math.max(size.length() * 1.24, 3.8);
    const yDockBias = -Math.max(size.y * 0.05, 0.14);
    const ty = center.y + yDockBias;
    this.controls.target.set(center.x, ty, center.z);
    if (view === 'front') {
      this.camera.position.set(center.x, ty + dist * 0.08, center.z + dist);
    } else if (view === 'side') {
      this.camera.position.set(center.x + dist, ty + dist * 0.08, center.z);
    } else if (view === 'top') {
      this.camera.position.set(center.x, center.y + dist * 1.25, center.z + 0.01);
    } else {
      this.camera.position.set(center.x + dist * 0.72, ty + dist * 0.44, center.z + dist * 0.78);
    }
    this.controls.update();
  }

  setExplode(value) {
    this.explodeTarget = Math.min(1, Math.max(0, Number(value) || 0));
  }

  setRpmMultiplier(value) {
    this.rpmMultiplier = Math.min(3.5, Math.max(0, Number(value) || 0));
  }

  setAutoRotate(enabled) {
    this.controls.autoRotate = Boolean(enabled);
  }

  setCutaway({ enabled, axis, value }) {
    if (enabled !== undefined) this.cutawayEnabled = Boolean(enabled);
    if (axis && ['x', 'y', 'z'].includes(axis)) this.cutawayAxis = axis;
    if (value !== undefined) this.cutawayValue = Math.min(1, Math.max(-1, Number(value) || 0));
    this._updateClippingPlane();
  }

  _updateClippingPlane() {
    if (!this.cutawayEnabled || !this.compiled) {
      this.clippingPlane.normal.set(0, 0, -1);
      this.clippingPlane.constant = 1000;
      this.cutawayGuide.visible = false;
      return;
    }

    const { center, size } = this.compiled;
    const halfSpan = Math.max(size[this.cutawayAxis] * 0.56, 1.0);
    const coord = center[this.cutawayAxis] + this.cutawayValue * halfSpan;

    if (this.cutawayAxis === 'x') {
      this.clippingPlane.normal.set(-1, 0, 0);
      this.clippingPlane.constant = coord;
      this.cutawayGuide.position.set(coord, center.y, center.z);
      this.cutawayGuide.rotation.set(0, Math.PI / 2, 0);
    } else if (this.cutawayAxis === 'y') {
      this.clippingPlane.normal.set(0, -1, 0);
      this.clippingPlane.constant = coord;
      this.cutawayGuide.position.set(center.x, coord, center.z);
      this.cutawayGuide.rotation.set(Math.PI / 2, 0, 0);
    } else {
      this.clippingPlane.normal.set(0, 0, -1);
      this.clippingPlane.constant = coord;
      this.cutawayGuide.position.set(center.x, center.y, coord);
      this.cutawayGuide.rotation.set(0, 0, 0);
    }

    const guideSpan = Math.max(size.x, size.y, size.z, 2.4) * 1.1;
    this.cutawayGuide.scale.set(guideSpan / 4.4, guideSpan / 4.4, 1);
    this.cutawayGuide.visible = true;
  }

  selectPart(partId, { isolate = false } = {}) {
    this.selectedPartId = partId || null;
    this.isolatedPartId = isolate ? this.selectedPartId : null;
    this._applySelectionVisuals();
    if (this.onSelectPart) {
      const entry = this.selectedPartId && this.compiled ? this.compiled.byId.get(this.selectedPartId) : null;
      this.onSelectPart(entry ? entry.part : null);
    }
  }

  _applySelectionVisuals() {
    if (!this.compiled) return;
    for (const entry of this.compiled.entries) {
      const mat = entry.material;
      const isSelected = entry.id === this.selectedPartId;
      const isDimmed = Boolean(this.isolatedPartId && entry.id !== this.isolatedPartId);

      if (isSelected) {
        mat.emissive.setHex(0xe85222);
        mat.emissiveIntensity = 0.55;
      } else {
        mat.emissive.copy(mat.userData.baseEmissive);
        mat.emissiveIntensity = mat.userData.baseEmissiveIntensity;
      }

      if (isDimmed) {
        mat.transparent = true;
        mat.opacity = 0.14;
      } else {
        mat.transparent = mat.userData.baseTransparent;
        mat.opacity = mat.userData.baseOpacity;
      }
      mat.needsUpdate = true;
    }
  }

  captureSnapshotDataUrl() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  _animate() {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt * this.rpmMultiplier;

    // Smooth cubic explode interpolation
    this.explodeCurrent += (this.explodeTarget - this.explodeCurrent) * Math.min(1, dt * 8);
    const eEase = this.explodeCurrent < 0.5
      ? 2 * this.explodeCurrent * this.explodeCurrent
      : 1 - Math.pow(-2 * this.explodeCurrent + 2, 2) / 2;

    if (this.compiled) {
      const now = performance.now();
      const healFlashActive = now < this.healFlashUntil;
      const healPulse = healFlashActive ? 0.5 + 0.5 * Math.sin(now * 0.015) : 0;

      for (const entry of this.compiled.entries) {
        const obj = entry.object;
        const m = entry.motion;

        // Position: base + explode + optional reciprocate/orbit
        let ox = entry.basePos.x + entry.explodeVec.x * eEase;
        let oy = entry.basePos.y + entry.explodeVec.y * eEase;
        let oz = entry.basePos.z + entry.explodeVec.z * eEase;

        let rx = entry.baseRot.x;
        let ry = entry.baseRot.y;
        let rz = entry.baseRot.z;

        if (m) {
          const t = this.elapsed * m.speed + (m.phase || 0);
          if (m.type === 'spin') {
            if (m.axis === 'x') rx += t;
            else if (m.axis === 'y') ry += t;
            else rz += t;
          } else if (m.type === 'oscillate') {
            const delta = Math.sin(t) * (m.amp || 0.25);
            if (m.axis === 'x') rx += delta;
            else if (m.axis === 'y') ry += delta;
            else rz += delta;
          } else if (m.type === 'reciprocate') {
            const localDisp = new THREE.Vector3(
              m.axis === 'x' ? Math.sin(t) * (m.amp || 0.2) : 0,
              m.axis === 'y' ? Math.sin(t) * (m.amp || 0.2) : 0,
              m.axis === 'z' ? Math.sin(t) * (m.amp || 0.2) : 0
            );
            localDisp.applyEuler(entry.baseRot);
            ox += localDisp.x;
            oy += localDisp.y;
            oz += localDisp.z;
          } else if (m.type === 'orbit') {
            const r = m.amp || 0.3;
            ox += Math.cos(t) * r;
            oz += Math.sin(t) * r;
          } else if (m.type === 'pulse' && entry.id !== this.selectedPartId) {
            const base = entry.material.userData.baseEmissiveIntensity || 1.2;
            entry.material.emissiveIntensity = base * (1 + Math.sin(t) * (m.amp || 0.35));
          }
        }

        obj.position.set(ox, oy, oz);
        obj.rotation.set(rx, ry, rz);

        // Self-heal ember pulse highlight on newly fixed/added parts
        if (this.healedPartIds.has(entry.id) && entry.id !== this.selectedPartId) {
          if (healFlashActive) {
            entry.material.emissive.setHex(0xe85222);
            entry.material.emissiveIntensity = 0.2 + healPulse * 0.9;
          } else {
            entry.material.emissive.copy(entry.material.userData.baseEmissive);
            entry.material.emissiveIntensity = entry.material.userData.baseEmissiveIntensity;
          }
        }
      }

      if (!healFlashActive && this.healedPartIds.size > 0) {
        this.healedPartIds.clear();
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    if (this.compiled) this.compiled.dispose();
    if (this.envRT) this.envRT.dispose();
    this.renderer.dispose();
  }
}
