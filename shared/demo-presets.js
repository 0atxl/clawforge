/**
 * ClawForge High-Detail Procedural Mechanical Presets & Offline Self-Heal Fixtures
 * Used for:
 *  1. Instant initial studio showcase on first page load (zero API quota burned!)
 *  2. Deterministic local/dry-run verification of Three.js PBR, Cutaway, Exploded View,
 *     Headless Chromium 2x2 contact sheet capture, and Turn 2 Visual Self-Heal diffing.
 */

export const PRESET_TURBOFAN_DRAFT = {
  schemaVersion: 'clawcad-v1',
  name: 'CF-900 Cyber-Sleigh High-Bypass Turbofan',
  category: 'Propulsion',
  summary: 'Coaxial high-bypass titanium turbofan with counter-rotating fan stage, cutaway bypass duct, copper stator coils, and vectoring afterburner nozzle.',
  specs: {
    dimensions: '480 × 290 × 290 mm',
    massKg: 14.8,
    rpmNominal: 3600,
    primaryMaterial: 'Ti-6Al-4V / Carbon Composite'
  },
  camera: { position: [-4.5, 2.4, 4.9], target: [-0.05, 0.05, 0] },
  cutaway: { axis: 'z', defaultOffset: 0.05 },
  parts: [
    // Outer Nacelle & Shroud (cutaway: true so slicing exposes spinning turbine!)
    {
      id: 'nacelle_outer',
      name: 'Carbon-Titanium Outer Nacelle',
      group: 'Nacelle Housing',
      type: 'lathe',
      params: {
        profile: [
          [1.06, -1.65], [1.28, -1.35], [1.38, -0.75], [1.36, 0.25],
          [1.22, 1.15], [1.02, 1.65], [0.92, 1.65], [1.10, 1.10],
          [1.22, 0.20], [1.23, -0.75], [1.14, -1.32], [1.06, -1.65]
        ],
        segments: 48
      },
      pos: [0, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      material: 'carbon_fiber',
      explodeVec: [0, 2.05, -0.55],
      cutaway: true,
      notes: 'Autoclave carbon-weave outer bypass cowl with acoustic liner.'
    },
    {
      id: 'intake_lip_ring',
      name: 'Heated Titanium Intake Lip',
      group: 'Nacelle Housing',
      type: 'torus',
      params: { r: 1.11, tube: 0.105, radialSegments: 20, tubularSegments: 52 },
      pos: [-1.62, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [-1.35, 0, 0],
      cutaway: true,
      notes: 'Anti-ice bleed-air leading edge lip machined from Ti-6Al-4V.'
    },
    {
      id: 'crimson_trim_band_fwd',
      name: 'Anodized Crimson Telemetry Band',
      group: 'Nacelle Housing',
      type: 'cylinder',
      params: { rt: 1.385, rb: 1.385, h: 0.22, radialSegments: 48, openEnded: true },
      pos: [-0.85, 0, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [1, 1, 1],
      material: 'anodized_crimson',
      explodeVec: [-0.7, 0.95, 0],
      cutaway: true,
      notes: 'High-vis aerodynamic fuselage stripe and pressure-tap collar.'
    },
    {
      id: 'crimson_trim_band_aft',
      name: 'Aft Structural Clamp Ring',
      group: 'Nacelle Housing',
      type: 'torus',
      params: { r: 1.24, tube: 0.055, radialSegments: 16, tubularSegments: 48 },
      pos: [0.95, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'anodized_crimson',
      explodeVec: [0.85, 0.8, 0],
      cutaway: true,
      notes: 'V-band retention clamp joining bypass duct to exhaust cone.'
    },
    // Core Engine Inner Casing
    {
      id: 'core_casing',
      name: 'High-Pressure Core Shroud',
      group: 'Core Engine',
      type: 'lathe',
      params: {
        profile: [
          [0.58, -0.75], [0.74, -0.35], [0.78, 0.35], [0.64, 1.05], [0.56, 1.05], [0.68, 0.35], [0.64, -0.35], [0.52, -0.75]
        ],
        segments: 40
      },
      pos: [0.1, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [0, -1.1, 0],
      cutaway: true,
      notes: 'Inconel-718 pressure vessel enclosing axial compressor and combustor.'
    },
    // Central Rotating Drive Shaft (cutaway: false so it stays visible!)
    {
      id: 'main_drive_shaft',
      name: 'Coaxial Titanium Drive Shaft',
      group: 'Rotating Core',
      type: 'cylinder',
      params: { rt: 0.14, rb: 0.14, h: 3.25, radialSegments: 28 },
      pos: [-0.05, 0, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [0, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 5.2 },
      notes: 'Hollow gun-drilled low-pressure turbine spool shaft.'
    },
    {
      id: 'nose_spinner_cone',
      name: 'Aerodynamic Nose Spinner',
      group: 'Fan Stage',
      type: 'lathe',
      params: {
        profile: [
          [0.0, -0.62], [0.14, -0.45], [0.28, -0.22], [0.36, 0.05], [0.37, 0.25], [0.0, 0.25]
        ],
        segments: 36
      },
      pos: [-1.42, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      material: 'matte_obsidian',
      explodeVec: [-1.95, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 5.2 },
      notes: 'Conical vortex-stabilizing nose cone with spiral balance mark.'
    },
    {
      id: 'spinner_glow_ring',
      name: 'Optical RPM Sensor Ring',
      group: 'Fan Stage',
      type: 'torus',
      params: { r: 0.355, tube: 0.025, radialSegments: 14, tubularSegments: 36 },
      pos: [-1.22, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'glow_cyan',
      explodeVec: [-1.65, 0, 0],
      cutaway: false,
      motion: { type: 'pulse', axis: 'x', speed: 3.5, amp: 0.35 },
      notes: 'Laser tachometer telemetry ring reading 3,600 RPM spool speed.'
    },
    {
      id: 'primary_fan_blades',
      name: '20-Blade Wide-Chord Titanium Fan',
      group: 'Fan Stage',
      type: 'radial_array',
      params: {
        count: 20,
        radius: 0.72,
        axis: 'x',
        tilt: 0.52,
        blade: { type: 'box', w: 0.22, h: 0.74, d: 0.042, bevel: 0.008 }
      },
      pos: [-1.14, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [-1.35, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 5.2 },
      notes: 'Swept hollow titanium fan blades generating 82% bypass thrust.'
    },
    {
      id: 'stator_vanes_stage1',
      name: 'Bypass Outlet Guide Vanes',
      group: 'Compressor Stage',
      type: 'radial_array',
      params: {
        count: 16,
        radius: 0.88,
        axis: 'x',
        tilt: -0.22,
        blade: { type: 'box', w: 0.16, h: 0.44, d: 0.032 }
      },
      pos: [-0.62, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'machined_aluminum',
      explodeVec: [-0.6, 0, 0],
      cutaway: true,
      notes: 'Fixed aerodynamic straightening vanes removing bypass swirl.'
    },
    {
      id: 'hp_compressor_stage1',
      name: 'HP Axial Compressor Stage 1',
      group: 'Compressor Stage',
      type: 'radial_array',
      params: {
        count: 24,
        radius: 0.42,
        axis: 'x',
        tilt: 0.44,
        blade: { type: 'box', w: 0.12, h: 0.34, d: 0.025 }
      },
      pos: [-0.28, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'machined_aluminum',
      explodeVec: [-0.25, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: -8.5 },
      notes: 'Counter-rotating high-pressure compressor stage (14:1 pressure ratio).'
    },
    {
      id: 'hp_compressor_stage2',
      name: 'HP Axial Compressor Stage 2',
      group: 'Compressor Stage',
      type: 'radial_array',
      params: {
        count: 24,
        radius: 0.39,
        axis: 'x',
        tilt: 0.48,
        blade: { type: 'box', w: 0.11, h: 0.30, d: 0.024 }
      },
      pos: [0.02, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brass_gold',
      explodeVec: [0.1, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 8.5 },
      notes: 'Second-stage high-temp nickel-alloy compressor bladed disk.'
    },
    {
      id: 'stator_copper_coil_fwd',
      name: 'Hybrid Starter-Generator Copper Coil',
      group: 'Core Engine',
      type: 'torus',
      params: { r: 0.56, tube: 0.075, radialSegments: 16, tubularSegments: 44 },
      pos: [0.36, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [0.4, 0.6, 0],
      cutaway: false,
      notes: '400V electromagnetic hybrid boost stator integrated on HP spool.'
    },
    {
      id: 'combustor_glow_core',
      name: 'Annular Plasma Combustor Ring',
      group: 'Core Engine',
      type: 'torus',
      params: { r: 0.44, tube: 0.09, radialSegments: 18, tubularSegments: 44 },
      pos: [0.64, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'glow_amber',
      explodeVec: [0.65, 0, 0],
      cutaway: false,
      motion: { type: 'pulse', axis: 'x', speed: 6.0, amp: 0.4 },
      notes: 'Low-NOx annular thermal combustor core operating at 1,550 K.'
    },
    {
      id: 'planetary_gear_drive',
      name: 'Accessory Gearbox Spur Gear',
      group: 'Rotating Core',
      type: 'gear',
      params: { teeth: 18, outerR: 0.34, innerR: 0.27, boreR: 0.13, thickness: 0.11 },
      pos: [-0.82, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'brass_gold',
      explodeVec: [-0.85, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 5.2 },
      notes: '3:1 planetary reduction spur gear driving fuel & oil pumps.'
    },
    {
      id: 'lp_turbine_stage',
      name: 'Low-Pressure Turbine Disk',
      group: 'Exhaust Nozzle',
      type: 'radial_array',
      params: {
        count: 22,
        radius: 0.44,
        axis: 'x',
        tilt: -0.45,
        blade: { type: 'box', w: 0.14, h: 0.34, d: 0.026 }
      },
      pos: [0.96, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_amber',
      explodeVec: [1.0, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 5.2 },
      notes: 'Single-crystal superalloy turbine extracting shaft power.'
    },
    {
      id: 'exhaust_plug_cone',
      name: 'Exhaust Centerbody Plug',
      group: 'Exhaust Nozzle',
      type: 'lathe',
      params: {
        profile: [
          [0.0, -0.45], [0.36, -0.35], [0.42, 0.0], [0.28, 0.55], [0.06, 0.95], [0.0, 1.02]
        ],
        segments: 36
      },
      pos: [1.56, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      material: 'cast_iron',
      explodeVec: [1.95, 0, 0],
      cutaway: false,
      notes: 'Acoustic chevron centerbody shaping supersonic core exhaust.'
    },
    {
      id: 'afterburner_nozzle_shroud',
      name: 'Variable Vectoring Exhaust Nozzle',
      group: 'Exhaust Nozzle',
      type: 'lathe',
      params: {
        profile: [
          [0.95, -0.35], [0.88, 0.15], [0.76, 0.62], [0.70, 0.62], [0.80, 0.15], [0.86, -0.35]
        ],
        segments: 40
      },
      pos: [1.68, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      scale: [1, 1, 1],
      material: 'matte_obsidian',
      explodeVec: [1.65, 0.4, 0],
      cutaway: true,
      notes: '12-petal convergent-divergent variable exhaust nozzle.'
    },
    {
      id: 'afterburner_glow_ring',
      name: 'Afterburner Ion Plume Ring',
      group: 'Exhaust Nozzle',
      type: 'torus',
      params: { r: 0.69, tube: 0.04, radialSegments: 14, tubularSegments: 44 },
      pos: [2.14, 0, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'glow_cyan',
      explodeVec: [2.1, 0, 0],
      cutaway: false,
      motion: { type: 'pulse', axis: 'x', speed: 8.0, amp: 0.45 },
      notes: 'High-efficiency ionized afterburner flameholder halo.'
    },
    // Intentionally detached fuel manifold in Turn 1 DRAFT so Visual Self-Heal visibly catches & fixes it!
    {
      id: 'fuel_manifold_top',
      name: 'Cryo Fuel Feed Manifold (Upper)',
      group: 'Fuel & Mounts',
      type: 'tube',
      params: {
        points: [[-0.55, 2.18, 0.56], [0.0, 2.26, 0.56], [0.55, 2.20, 0.54], [0.95, 2.02, 0.50]],
        radius: 0.055,
        tubularSegments: 28
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [0, 2.2, 0.5],
      cutaway: false,
      notes: 'Braided high-pressure fuel feed conduit.'
    },
    {
      id: 'pylon_mount_base',
      name: 'Dorsal Sleigh Pylon Strut',
      group: 'Fuel & Mounts',
      type: 'extrude',
      params: {
        shape: [[-0.75, 0], [0.75, 0], [0.52, 0.56], [-0.45, 0.56]],
        depth: 0.24,
        bevel: 0.03
      },
      pos: [0, 1.24, -0.12],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [0, 2.45, -0.55],
      cutaway: false,
      notes: 'Forged Ti-6Al-4V wing/sleigh structural thrust pylon.'
    },
    {
      id: 'lower_accessory_pod',
      name: 'ECU & Oil Cooler Sump',
      group: 'Fuel & Mounts',
      type: 'box',
      params: { w: 1.35, h: 0.32, d: 0.56, bevel: 0.05 },
      pos: [-0.08, -1.36, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'matte_obsidian',
      explodeVec: [0, -1.6, 0],
      cutaway: false,
      notes: 'FADEC dual-channel turbine controller & finned oil sump.'
    }
  ]
};

export const PRESET_TURBOFAN_HEAL_PATCH = {
  critique: 'The 2x2 contact sheet shows the upper cryo fuel manifold floating ~0.42 units above the outer nacelle with no clamping collar, and the aft exhaust nozzle lacks exterior actuator struts and intake flange fasteners for industrial realism.',
  issuesFound: [
    'fuel_manifold_top floats disconnected above the nacelle dorsal contour (detected in Front Ortho & geometry adjacency audit)',
    'Afterburner exhaust nozzle lacks external variable-geometry hydraulic struts',
    'Intake flange lacks perimeter fastener detail and lower sump lacks cooling fins'
  ],
  fixesApplied: [
    'Re-routed fuel_manifold_top tight onto the carbon nacelle outer skin and anchored it into the dorsal pylon',
    'Added twin hydraulic nozzle actuator rods + external braided bleed-air conduit',
    'Added 12-bolt titanium intake fastener ring and finned aluminum oil-cooler heatsink on lower sump'
  ],
  upsertParts: [
    {
      id: 'fuel_manifold_top',
      name: 'Cryo Fuel Feed Manifold (Upper)',
      group: 'Fuel & Mounts',
      type: 'tube',
      params: {
        points: [[-0.58, 1.38, 0.26], [0.0, 1.44, 0.26], [0.55, 1.36, 0.22], [1.05, 1.15, 0.14]],
        radius: 0.055,
        tubularSegments: 32
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [0, 1.5, 0.45],
      cutaway: false,
      notes: 'Conformal cryo fuel line clamped directly along nacelle crown.'
    },
    {
      id: 'fuel_manifold_mirror',
      name: 'Bleed-Air Return Conduit (Starboard)',
      group: 'Fuel & Mounts',
      type: 'tube',
      params: {
        points: [[-0.58, 1.38, -0.26], [0.0, 1.44, -0.26], [0.55, 1.36, -0.22], [1.05, 1.15, -0.14]],
        radius: 0.048,
        tubularSegments: 32
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brass_gold',
      explodeVec: [0, 1.5, -0.45],
      cutaway: false,
      notes: 'Balanced starboard pneumatic bleed-air de-icing manifold.'
    },
    {
      id: 'nozzle_actuator_ring',
      name: '12-Petal Nozzle Hydraulic Actuators',
      group: 'Exhaust Nozzle',
      type: 'radial_array',
      params: {
        count: 12,
        radius: 0.90,
        axis: 'x',
        tilt: 0,
        blade: { type: 'box', w: 0.56, h: 0.055, d: 0.055, bevel: 0.01 }
      },
      pos: [1.62, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [1.65, 0, 0],
      cutaway: true,
      notes: 'Synchronized 12-cylinder variable throat actuator array.'
    },
    {
      id: 'intake_bolt_ring',
      name: 'Intake Flange Fastener Ring (16× M8)',
      group: 'Nacelle Housing',
      type: 'radial_array',
      params: {
        count: 16,
        radius: 1.34,
        axis: 'x',
        tilt: 0,
        blade: { type: 'cylinder', rt: 0.034, rb: 0.034, h: 0.08 }
      },
      pos: [-0.85, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [-0.7, 1.05, 0],
      cutaway: true,
      notes: '16 aerospace 12-point titanium retention bolts.'
    },
    {
      id: 'oil_cooler_fins',
      name: 'CNC Aluminum Oil-Cooler Fins',
      group: 'Fuel & Mounts',
      type: 'box',
      params: { w: 1.05, h: 0.12, d: 0.64, bevel: 0.02 },
      pos: [-0.08, -1.52, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'machined_aluminum',
      explodeVec: [0, -1.9, 0],
      cutaway: false,
      notes: 'High-surface-area heat exchanger plate beneath FADEC sump.'
    }
  ],
  removePartIds: [],
  camera: { position: [-4.4, 2.3, 4.8], target: [-0.05, 0.05, 0] }
};

export const PRESET_V8_ENGINE_DRAFT = {
  schemaVersion: 'clawcad-v1',
  name: 'K3-V8 Twin-Turbo Billet Crate Engine',
  category: 'Automotive',
  summary: '90-degree cross-plane aluminum V8 with reciprocating 8-piston rotating assembly, twin ceramic turbochargers, copper timing gears, and cutaway block.',
  specs: {
    dimensions: '640 × 520 × 490 mm',
    massKg: 142.0,
    rpmNominal: 6800,
    primaryMaterial: 'Billet 6061-T6 / Forged 4340'
  },
  camera: { position: [4.8, 3.3, 5.2], target: [0, 0.25, 0] },
  cutaway: { axis: 'z', defaultOffset: 0.12 },
  parts: [
    {
      id: 'crankcase_lower',
      name: 'Billet Lower Crankcase',
      group: 'Engine Block',
      type: 'box',
      params: { w: 2.5, h: 0.72, d: 1.24, bevel: 0.08 },
      pos: [0, -0.46, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'cast_iron',
      explodeVec: [0, -1.25, 0],
      cutaway: true,
      notes: 'Deep-skirt billet main cap girdle.'
    },
    {
      id: 'oil_pan',
      name: 'Finned Dry-Sump Oil Pan',
      group: 'Engine Block',
      type: 'box',
      params: { w: 2.32, h: 0.34, d: 1.06, bevel: 0.06 },
      pos: [0, -0.96, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_crimson',
      explodeVec: [0, -1.85, 0],
      cutaway: true,
      notes: 'Baffled motorsport dry-sump scavenge pan.'
    },
    {
      id: 'bank_left_block',
      name: 'Left Cylinder Bank (Cyl 1-3-5-7)',
      group: 'Engine Block',
      type: 'box',
      params: { w: 2.35, h: 0.96, d: 0.66, bevel: 0.05 },
      pos: [0, 0.25, 0.56],
      rot: [Math.PI / 4, 0, 0],
      scale: [1, 1, 1],
      material: 'machined_aluminum',
      explodeVec: [0, 0.6, 1.35],
      cutaway: true,
      notes: 'CNC 6061-T6 bank at 45° with Nikasil cylinder liners.'
    },
    {
      id: 'bank_right_block',
      name: 'Right Cylinder Bank (Cyl 2-4-6-8)',
      group: 'Engine Block',
      type: 'box',
      params: { w: 2.35, h: 0.96, d: 0.66, bevel: 0.05 },
      pos: [0, 0.25, -0.56],
      rot: [-Math.PI / 4, 0, 0],
      scale: [1, 1, 1],
      material: 'machined_aluminum',
      explodeVec: [0, 0.6, -1.35],
      cutaway: true,
      notes: 'CNC 6061-T6 opposite bank with cross-bolted deck.'
    },
    {
      id: 'valve_cover_left',
      name: 'Carbon Valve Cover (Left)',
      group: 'Valvetrain',
      type: 'box',
      params: { w: 2.28, h: 0.28, d: 0.62, bevel: 0.06 },
      pos: [0, 0.78, 1.02],
      rot: [Math.PI / 4, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_crimson',
      explodeVec: [0, 1.35, 1.85],
      cutaway: true,
      notes: 'DOHC billet valve cover with coil-on-plug bosses.'
    },
    {
      id: 'valve_cover_right',
      name: 'Carbon Valve Cover (Right)',
      group: 'Valvetrain',
      type: 'box',
      params: { w: 2.28, h: 0.28, d: 0.62, bevel: 0.06 },
      pos: [0, 0.78, -1.02],
      rot: [-Math.PI / 4, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_crimson',
      explodeVec: [0, 1.35, -1.85],
      cutaway: true,
      notes: 'Starboard DOHC anodized valve cover.'
    },
    {
      id: 'crankshaft_main',
      name: '4340 Billet Cross-Plane Crankshaft',
      group: 'Rotating Assembly',
      type: 'cylinder',
      params: { rt: 0.16, rb: 0.16, h: 2.95, radialSegments: 28 },
      pos: [0, -0.34, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [0, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 6.5 },
      notes: 'Balanced 90° forged steel crankshaft.'
    },
    {
      id: 'flywheel_rear',
      name: 'Lightweight Chromoly Flywheel',
      group: 'Rotating Assembly',
      type: 'gear',
      params: { teeth: 32, outerR: 0.68, innerR: 0.59, boreR: 0.16, thickness: 0.14 },
      pos: [1.46, -0.34, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [1.65, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 6.5 },
      notes: 'Starter ring gear and twin-disc clutch flywheel.'
    },
    {
      id: 'timing_gear_crank',
      name: 'Front Crank Timing Gear',
      group: 'Timing Drive',
      type: 'gear',
      params: { teeth: 18, outerR: 0.34, innerR: 0.27, boreR: 0.12, thickness: 0.12 },
      pos: [-1.42, -0.34, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'brass_gold',
      explodeVec: [-1.5, 0, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 6.5 },
      notes: 'Straight-cut bronze primary crank gear.'
    },
    {
      id: 'timing_gear_cam_l',
      name: 'Left Camshaft Phaser Gear',
      group: 'Timing Drive',
      type: 'gear',
      params: { teeth: 24, outerR: 0.38, innerR: 0.31, boreR: 0.10, thickness: 0.11 },
      pos: [-1.40, 0.52, 0.72],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [-1.5, 0.5, 0.6],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: -3.25 },
      notes: '2:1 variable cam timing gear (left bank).'
    },
    {
      id: 'timing_gear_cam_r',
      name: 'Right Camshaft Phaser Gear',
      group: 'Timing Drive',
      type: 'gear',
      params: { teeth: 24, outerR: 0.38, innerR: 0.31, boreR: 0.10, thickness: 0.11 },
      pos: [-1.40, 0.52, -0.72],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [-1.5, 0.5, -0.6],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: -3.25 },
      notes: '2:1 variable cam timing gear (right bank).'
    },
    // 4 Reciprocating Pistons Left Bank + 4 Right Bank (cutaway: false so slicing reveals live pistons!)
    ...[0, 1, 2, 3].flatMap((i) => {
      const x = -0.84 + i * 0.56;
      const phaseL = i * (Math.PI / 2);
      const phaseR = phaseL + Math.PI / 4;
      return [
        {
          id: `piston_L${i + 1}`,
          name: `Forged Piston L${i + 1}`,
          group: 'Rotating Assembly',
          type: 'cylinder',
          params: { rt: 0.19, rb: 0.19, h: 0.26, radialSegments: 24 },
          pos: [x, 0.18, 0.48],
          rot: [Math.PI / 4, 0, 0],
          scale: [1, 1, 1],
          material: 'chrome_mirror',
          explodeVec: [0, 0.35, 0.85],
          cutaway: false,
          motion: { type: 'reciprocate', axis: 'y', speed: 6.5, amp: 0.16, phase: phaseL },
          notes: `2618 forged aluminum piston (firing phase ${(phaseL * 180 / Math.PI).toFixed(0)}°).`
        },
        {
          id: `piston_R${i + 1}`,
          name: `Forged Piston R${i + 1}`,
          group: 'Rotating Assembly',
          type: 'cylinder',
          params: { rt: 0.19, rb: 0.19, h: 0.26, radialSegments: 24 },
          pos: [x, 0.18, -0.48],
          rot: [-Math.PI / 4, 0, 0],
          scale: [1, 1, 1],
          material: 'chrome_mirror',
          explodeVec: [0, 0.35, -0.85],
          cutaway: false,
          motion: { type: 'reciprocate', axis: 'y', speed: 6.5, amp: 0.16, phase: phaseR },
          notes: `2618 forged aluminum piston (firing phase ${(phaseR * 180 / Math.PI).toFixed(0)}°).`
        }
      ];
    }),
    // Carbon Intake Plenum & Velocity Stacks
    {
      id: 'intake_plenum',
      name: 'Carbon Fiber Intake Plenum',
      group: 'Induction & Turbo',
      type: 'box',
      params: { w: 2.15, h: 0.44, d: 0.92, bevel: 0.08 },
      pos: [0.05, 1.12, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'carbon_fiber',
      explodeVec: [0, 1.9, 0],
      cutaway: true,
      notes: 'Twin-plenum dry carbon manifold with integrated water-to-air intercooler.'
    },
    {
      id: 'turbo_left',
      name: 'Left Ceramic Ball-Bearing Turbo',
      group: 'Induction & Turbo',
      type: 'torus',
      params: { r: 0.32, tube: 0.16, radialSegments: 18, tubularSegments: 36 },
      pos: [-1.15, 0.96, 1.18],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [-1.1, 1.1, 1.3],
      cutaway: false,
      notes: '64mm billet compressor wheel turbocharger.'
    },
    {
      id: 'turbo_right',
      name: 'Right Ceramic Ball-Bearing Turbo',
      group: 'Induction & Turbo',
      type: 'torus',
      params: { r: 0.32, tube: 0.16, radialSegments: 18, tubularSegments: 36 },
      pos: [-1.15, 0.96, -1.18],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [-1.1, 1.1, -1.3],
      cutaway: false,
      notes: 'Symmetric starboard 64mm turbocharger.'
    },
    {
      id: 'exhaust_header_l',
      name: 'Inconel Exhaust Header (Left)',
      group: 'Induction & Turbo',
      type: 'tube',
      params: {
        points: [[0.8, 0.2, 1.1], [0.2, 0.32, 1.38], [-0.5, 0.55, 1.42], [-1.1, 0.85, 1.24]],
        radius: 0.095,
        tubularSegments: 36
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_amber',
      explodeVec: [0, 0.5, 1.7],
      cutaway: false,
      notes: 'Equal-length hydroformed Inconel exhaust collector.'
    },
    {
      id: 'exhaust_header_r',
      name: 'Inconel Exhaust Header (Right)',
      group: 'Induction & Turbo',
      type: 'tube',
      params: {
        points: [[0.8, 0.2, -1.1], [0.2, 0.32, -1.38], [-0.5, 0.55, -1.42], [-1.1, 0.85, -1.24]],
        radius: 0.095,
        tubularSegments: 36
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_amber',
      explodeVec: [0, 0.5, -1.7],
      cutaway: false,
      notes: 'Equal-length starboard Inconel exhaust collector.'
    }
  ]
};

export const PRESET_V8_HEAL_PATCH = {
  critique: 'The 2x2 render reveals open turbo charge inlets without charge pipes feeding the carbon plenum, and the intake top could use glowing fuel-rail telemetry strips for clearer visual hierarchy.',
  issuesFound: [
    'Turbochargers lack charge-air crossover pipes connecting into the front of the intake plenum',
    'No fuel rails visible along the V-valley injector bosses'
  ],
  fixesApplied: [
    'Added twin polished titanium turbo-to-plenum charge pipes',
    'Added anodized crimson fuel rails + spinning turbo compressor impellers'
  ],
  upsertParts: [
    {
      id: 'charge_pipe_l',
      name: 'Titanium Charge Pipe (Left)',
      group: 'Induction & Turbo',
      type: 'tube',
      params: {
        points: [[-1.15, 1.24, 1.12], [-1.12, 1.42, 0.58], [-0.85, 1.26, 0.24]],
        radius: 0.082,
        tubularSegments: 24
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [-0.8, 1.6, 0.8],
      cutaway: false,
      notes: 'Mandrel-bent 3-inch charge pipe with silicone couplers.'
    },
    {
      id: 'charge_pipe_r',
      name: 'Titanium Charge Pipe (Right)',
      group: 'Induction & Turbo',
      type: 'tube',
      params: {
        points: [[-1.15, 1.24, -1.12], [-1.12, 1.42, -0.58], [-0.85, 1.26, -0.24]],
        radius: 0.082,
        tubularSegments: 24
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [-0.8, 1.6, -0.8],
      cutaway: false,
      notes: 'Symmetric starboard charge pipe.'
    },
    {
      id: 'turbo_impeller_l',
      name: 'Left Turbo Compressor Wheel',
      group: 'Induction & Turbo',
      type: 'radial_array',
      params: { count: 10, radius: 0.14, axis: 'z', tilt: 0.4, blade: { type: 'box', w: 0.04, h: 0.16, d: 0.03 } },
      pos: [-1.15, 0.96, 1.25],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'glow_cyan',
      explodeVec: [-1.1, 1.1, 1.5],
      cutaway: false,
      motion: { type: 'spin', axis: 'z', speed: 16.0 },
      notes: '120,000 RPM billet compressor impeller.'
    },
    {
      id: 'turbo_impeller_r',
      name: 'Right Turbo Compressor Wheel',
      group: 'Induction & Turbo',
      type: 'radial_array',
      params: { count: 10, radius: 0.14, axis: 'z', tilt: 0.4, blade: { type: 'box', w: 0.04, h: 0.16, d: 0.03 } },
      pos: [-1.15, 0.96, -1.25],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'glow_cyan',
      explodeVec: [-1.1, 1.1, -1.5],
      cutaway: false,
      motion: { type: 'spin', axis: 'z', speed: -16.0 },
      notes: '120,000 RPM starboard compressor impeller.'
    }
  ],
  removePartIds: [],
  camera: { position: [4.7, 3.1, 5.1], target: [0, 0.25, 0] }
};

export const PRESET_ROBOTIC_CLAW_DRAFT = {
  schemaVersion: 'clawcad-v1',
  name: 'KX-6 Articulated 6-DOF Precision Robotic Claw',
  category: 'Robotics',
  summary: 'Harmonic-drive desktop robotic manipulator with planetary base turret, twin hydraulic linkages, spring dampers, and tri-finger compliant gripper.',
  specs: {
    dimensions: '340 × 410 × 280 mm',
    massKg: 6.2,
    rpmNominal: 180,
    primaryMaterial: 'Anodized 7075-T6 / Carbon Arm'
  },
  camera: { position: [4.4, 3.2, 4.6], target: [0, 0.85, 0] },
  cutaway: { axis: 'x', defaultOffset: 0.05 },
  parts: [
    {
      id: 'pedestal_base',
      name: 'Bolted Turret Pedestal',
      group: 'Base Turret',
      type: 'lathe',
      params: { profile: [[1.15, 0], [1.18, 0.14], [0.92, 0.28], [0.82, 0.56], [0.0, 0.56]], segments: 40 },
      pos: [0, -0.75, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'matte_obsidian',
      explodeVec: [0, -1.0, 0],
      cutaway: true,
      notes: 'Machined vibration-damped steel base flange.'
    },
    {
      id: 'harmonic_ring_gear',
      name: 'Base Harmonic Ring Gear',
      group: 'Base Turret',
      type: 'gear',
      params: { teeth: 28, outerR: 0.84, innerR: 0.75, boreR: 0.28, thickness: 0.18 },
      pos: [0, -0.14, 0],
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 1, 1],
      material: 'brass_gold',
      explodeVec: [0, -0.45, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'y', speed: 1.6 },
      notes: 'Zero-backlash 100:1 strain-wave azimuth ring gear.'
    },
    {
      id: 'turret_housing',
      name: 'Azimuth Servo Yoke',
      group: 'Base Turret',
      type: 'cylinder',
      params: { rt: 0.62, rb: 0.72, h: 0.52, radialSegments: 32 },
      pos: [0, 0.16, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [0, 0.15, 0],
      cutaway: true,
      notes: 'Dual-bearing yoke supporting shoulder pitch servo.'
    },
    {
      id: 'shoulder_servo_drum',
      name: 'Brushless Shoulder Actuator',
      group: 'Shoulder & Arm',
      type: 'cylinder',
      params: { rt: 0.38, rb: 0.38, h: 0.88, radialSegments: 32 },
      pos: [0, 0.56, 0],
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_cobalt',
      explodeVec: [0, 0.5, 0.6],
      cutaway: true,
      notes: 'High-torque frameless torque motor with optical encoder.'
    },
    {
      id: 'shoulder_copper_core',
      name: 'Shoulder Copper Stator Winding',
      group: 'Shoulder & Arm',
      type: 'torus',
      params: { r: 0.26, tube: 0.08, radialSegments: 14, tubularSegments: 32 },
      pos: [0, 0.56, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [0, 0.5, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'z', speed: 3.4 },
      notes: 'Internal high-fill-factor copper stator visible under cutaway.'
    },
    {
      id: 'lower_arm_spar_l',
      name: 'Carbon Lower Boom (Left)',
      group: 'Shoulder & Arm',
      type: 'box',
      params: { w: 0.24, h: 1.48, d: 0.14, bevel: 0.03 },
      pos: [-0.28, 1.24, 0.26],
      rot: [0, 0, 0.34],
      scale: [1, 1, 1],
      material: 'carbon_fiber',
      explodeVec: [-0.5, 0.9, 0.7],
      cutaway: false,
      notes: 'High-modulus woven carbon structural spar.'
    },
    {
      id: 'lower_arm_spar_r',
      name: 'Carbon Lower Boom (Right)',
      group: 'Shoulder & Arm',
      type: 'box',
      params: { w: 0.24, h: 1.48, d: 0.14, bevel: 0.03 },
      pos: [-0.28, 1.24, -0.26],
      rot: [0, 0, 0.34],
      scale: [1, 1, 1],
      material: 'carbon_fiber',
      explodeVec: [-0.5, 0.9, -0.7],
      cutaway: false,
      notes: 'Twin symmetric carbon boom.'
    },
    {
      id: 'counterbalance_spring',
      name: 'Gravity Counterbalance Coil Spring',
      group: 'Shoulder & Arm',
      type: 'spring',
      params: { radius: 0.14, wireR: 0.028, height: 0.92, turns: 8 },
      pos: [-0.58, 0.96, 0],
      rot: [0, 0, 0.34],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [-1.1, 0.7, 0],
      cutaway: false,
      notes: 'Helical titanium assist spring reducing shoulder hold torque by 45%.'
    },
    {
      id: 'elbow_joint_drum',
      name: 'Elbow Harmonic Joint',
      group: 'Forearm & Wrist',
      type: 'cylinder',
      params: { rt: 0.30, rb: 0.30, h: 0.72, radialSegments: 32 },
      pos: [-0.54, 1.92, 0],
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_amber',
      explodeVec: [-0.8, 1.4, 0],
      cutaway: true,
      notes: 'Integrated torque-sensing elbow actuator.'
    },
    {
      id: 'forearm_boom',
      name: 'Tapered Titanium Forearm Tube',
      group: 'Forearm & Wrist',
      type: 'cylinder',
      params: { rt: 0.16, rb: 0.22, h: 1.46, radialSegments: 28 },
      pos: [0.18, 2.08, 0],
      rot: [0, 0, -1.36],
      scale: [1, 1, 1],
      material: 'brushed_titanium',
      explodeVec: [0.4, 1.6, 0],
      cutaway: true,
      notes: 'Internal cable-routed titanium forearm shell.'
    },
    {
      id: 'wrist_gimbal',
      name: '3-Axis Spherical Wrist Gimbal',
      group: 'End Effector',
      type: 'sphere',
      params: { r: 0.25 },
      pos: [0.94, 2.22, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'matte_obsidian',
      explodeVec: [1.1, 1.7, 0],
      cutaway: false,
      notes: 'Compact 3-DOF differential bevel wrist.'
    },
    {
      id: 'wrist_status_halo',
      name: 'Force-Torque Telemetry Ring',
      group: 'End Effector',
      type: 'torus',
      params: { r: 0.26, tube: 0.032, radialSegments: 14, tubularSegments: 36 },
      pos: [1.14, 2.24, 0],
      rot: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
      material: 'glow_cyan',
      explodeVec: [1.35, 1.75, 0],
      cutaway: false,
      motion: { type: 'pulse', axis: 'x', speed: 4.0, amp: 0.35 },
      notes: '6-axis strain-gauge optical status collar.'
    },
    {
      id: 'gripper_palm',
      name: 'Tri-Finger Gripper Hub',
      group: 'End Effector',
      type: 'cylinder',
      params: { rt: 0.28, rb: 0.24, h: 0.18, radialSegments: 28 },
      pos: [1.28, 2.24, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [1, 1, 1],
      material: 'machined_aluminum',
      explodeVec: [1.65, 1.75, 0],
      cutaway: false,
      motion: { type: 'spin', axis: 'x', speed: 1.2 },
      notes: 'Quick-change ISO-9409 robotic gripper hub.'
    },
    {
      id: 'claw_finger_top',
      name: 'Articulated Claw Finger A',
      group: 'End Effector',
      type: 'extrude',
      params: { shape: [[0, 0], [0.46, 0.24], [0.76, 0.06], [0.68, -0.05], [0.42, 0.10], [0, -0.10]], depth: 0.09, bevel: 0.015 },
      pos: [1.34, 2.38, -0.045],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_cobalt',
      explodeVec: [2.1, 2.1, 0],
      cutaway: false,
      motion: { type: 'oscillate', axis: 'z', speed: 2.6, amp: 0.24, phase: 0 },
      notes: 'High-grip serrated dorsal talon with silicone fingertip.'
    },
    {
      id: 'claw_finger_bl',
      name: 'Articulated Claw Finger B',
      group: 'End Effector',
      type: 'extrude',
      params: { shape: [[0, 0], [0.46, -0.24], [0.76, -0.06], [0.68, 0.05], [0.42, -0.10], [0, 0.10]], depth: 0.09, bevel: 0.015 },
      pos: [1.34, 2.10, 0.14],
      rot: [0.35, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_cobalt',
      explodeVec: [2.1, 1.45, 0.55],
      cutaway: false,
      motion: { type: 'oscillate', axis: 'z', speed: 2.6, amp: -0.24, phase: 0 },
      notes: 'Ventral left compliant opposing talon.'
    },
    {
      id: 'claw_finger_br',
      name: 'Articulated Claw Finger C',
      group: 'End Effector',
      type: 'extrude',
      params: { shape: [[0, 0], [0.46, -0.24], [0.76, -0.06], [0.68, 0.05], [0.42, -0.10], [0, 0.10]], depth: 0.09, bevel: 0.015 },
      pos: [1.34, 2.10, -0.22],
      rot: [-0.35, 0, 0],
      scale: [1, 1, 1],
      material: 'anodized_cobalt',
      explodeVec: [2.1, 1.45, -0.55],
      cutaway: false,
      motion: { type: 'oscillate', axis: 'z', speed: 2.6, amp: -0.24, phase: 0 },
      notes: 'Ventral right compliant opposing talon.'
    }
  ]
};

export const PRESET_ROBOTIC_CLAW_HEAL_PATCH = {
  critique: 'The 2x2 contact sheet shows clean arm kinematics, but lacks flexible power/data umbilical routing across the elbow joint and mounting bolts around the base pedestal.',
  issuesFound: [
    'No external power/encoder umbilical harness bridging shoulder to forearm',
    'Base pedestal flange lacks perimeter anchor bolts'
  ],
  fixesApplied: [
    'Routed braided orange/copper umbilical flex conduit cleanly around the elbow drum',
    'Added 8-bolt anchor ring around the base pedestal and wrist encoder cap'
  ],
  upsertParts: [
    {
      id: 'umbilical_cable_harness',
      name: 'Braided Servo Umbilical Conduit',
      group: 'Shoulder & Arm',
      type: 'tube',
      params: {
        points: [[0.2, 0.25, 0.44], [-0.15, 0.95, 0.44], [-0.66, 1.88, 0.40], [0.05, 2.18, 0.26], [0.78, 2.24, 0.16]],
        radius: 0.044,
        tubularSegments: 36
      },
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'copper_coil',
      explodeVec: [0, 1.2, 1.15],
      cutaway: false,
      notes: 'High-flex shielded EtherCAT & 48V bus harness.'
    },
    {
      id: 'base_anchor_bolts',
      name: 'Pedestal Mounting Bolt Ring (8× M10)',
      group: 'Base Turret',
      type: 'radial_array',
      params: { count: 8, radius: 1.04, axis: 'y', tilt: 0, blade: { type: 'cylinder', rt: 0.045, rb: 0.045, h: 0.12 } },
      pos: [0, -0.58, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      material: 'chrome_mirror',
      explodeVec: [0, -0.85, 0],
      cutaway: false,
      notes: '8 socket-head M10 optical table anchor bolts.'
    }
  ],
  removePartIds: [],
  camera: { position: [4.3, 3.0, 4.5], target: [0.15, 0.9, 0] }
};

export const DEMO_PRESETS = {
  turbofan: {
    id: 'turbofan',
    label: 'Cyber-Sleigh Turbofan',
    prompt: 'Interactive 3D Cyber-Sleigh High-Bypass Turbofan with counter-rotating titanium blades, glowing plasma combustor, cutaway bypass shroud, and vectoring afterburner nozzle',
    draft: PRESET_TURBOFAN_DRAFT,
    healPatch: PRESET_TURBOFAN_HEAL_PATCH
  },
  v8: {
    id: 'v8',
    label: 'Twin-Turbo V8 Engine',
    prompt: 'Interactive 3D Twin-Turbo Billet V8 Engine with reciprocating 8 pistons, spinning cross-plane crankshaft, copper timing gears, and cutaway aluminum cylinder banks',
    draft: PRESET_V8_ENGINE_DRAFT,
    healPatch: PRESET_V8_HEAL_PATCH
  },
  claw: {
    id: 'claw',
    label: '6-DOF Robotic Claw',
    prompt: 'Interactive 3D 6-DOF Precision Robotic Claw with harmonic-drive base gear, carbon fiber dual booms, helical spring damper, and articulating 3-finger gripper',
    draft: PRESET_ROBOTIC_CLAW_DRAFT,
    healPatch: PRESET_ROBOTIC_CLAW_HEAL_PATCH
  }
};

/**
 * Offline demo gift fixtures (CLEARLY marked isDemoFixture: true — NEVER used in live OpenClaw mode!).
 * Live mode always queries OpenClaw + Firecrawl web_search / web_fetch for real current URLs.
 */
export const DEMO_GIFTS_FIXTURE = [
  {
    rank: 1,
    title: 'Keychron Q1 Pro QMK/VIA Wireless Mechanical Keyboard',
    retailer: 'Keychron',
    price: '$199.00',
    url: 'https://www.keychron.com/products/keychron-q1-pro-qmk-via-wireless-custom-mechanical-keyboard',
    category: 'Desk & Hardware',
    whyGreat: 'CNC machined 6063 aluminum chassis, double-gasket mount, hot-swappable tactile switches.',
    cadPrompt: 'Interactive 3D CNC Aluminum 75% Custom Mechanical Keyboard with rotary volume knob, cutaway PCB layer, glowing underglow ring, and brass weight plate',
    verified: false,
    isDemoFixture: true
  },
  {
    rank: 2,
    title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    retailer: 'Sony Electronics',
    price: '$329.99',
    url: 'https://electronics.sony.com/audio/headphones/headband/p/wh1000xm5-b',
    category: 'Audio',
    whyGreat: 'Dual-processor ANC, 30mm carbon-composite drivers, 30-hour battery life.',
    cadPrompt: 'Interactive 3D Flagship Over-Ear ANC Headphones with cutaway earcup revealing copper voice-coil driver, titanium hinge gimbal, and glowing status ring',
    verified: false,
    isDemoFixture: true
  },
  {
    rank: 3,
    title: 'Fellow Stagg EKG Pro Electric Pour-Over Kettle',
    retailer: 'Fellow',
    price: '$195.00',
    url: 'https://fellowproducts.com/products/stagg-ekg-pro-electric-kettle',
    category: 'Coffee & Kitchen',
    whyGreat: 'Precision gooseneck spout, PID temperature dial base, matte steel construction.',
    cadPrompt: 'Interactive 3D Precision Electric Gooseneck Pour-Over Kettle with swept curved spout, cutaway heating coil base, brass lid knob, and glowing PID dial',
    verified: false,
    isDemoFixture: true
  },
  {
    rank: 4,
    title: 'DJI Neo Ultra-Light Palm Vlog Drone',
    retailer: 'DJI Store',
    price: '$199.00',
    url: 'https://store.dji.com/product/dji-neo',
    category: 'Robotics & Drones',
    whyGreat: '135g ducted quad-propeller airframe, 4K stabilized camera, palm takeoff.',
    cadPrompt: 'Interactive 3D Ducted Quad-Propeller Palm Drone with 4 spinning shrouded rotors, gimbaled 4K optical camera pod, carbon frame, and cyan navigation LEDs',
    verified: false,
    isDemoFixture: true
  },
  {
    rank: 5,
    title: 'LEGO Technic NASA Mars Rover Perseverance (42158)',
    retailer: 'LEGO',
    price: '$99.99',
    url: 'https://www.lego.com/en-us/product/nasa-mars-rover-perseverance-42158',
    category: 'STEM & Engineering',
    whyGreat: '6-wheel rocker-bogie suspension, 360° articulated steering, movable science arm.',
    cadPrompt: 'Interactive 3D 6-Wheel Mars Exploration Rover with rocker-bogie titanium suspension, spinning sample drill mast, gold thermal foil chassis, and high-gain antenna dish',
    verified: false,
    isDemoFixture: true
  }
];
