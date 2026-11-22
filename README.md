# ClawForge

**Wafer-Scale Interactive 3D CAD Studio & Live Cerebras vs. GPU Comparison Arena**

ClawForge streams parametric 3D mechanical assemblies (`ClawCAD v1` JSON) directly into an interactive Three.js PBR Studio and measures real-time **tokens per minute (`tok/min`)** and **tokens per second (`tok/s`)** throughput head-to-head against a standard GPU baseline (such as NVIDIA NIM).

---

## Core Capabilities

1. **Interactive Three.js PBR Studio**
   - Procedural CAD geometry engine (`gear`, `lathe`, `tube`, `extrude`, `radial_array`, `spring`, `fastener`, beveled `box`, `cylinder`, `torus`, `cone`, `capsule`, `sphere`) with studio `RoomEnvironment` IBL reflections and procedural carbon-fiber / brushed-titanium PBR maps.
   - **Exploded View (`0–100%`)**, **live WebGL Cross-Section Cutaway (`X/Y/Z`)**, **Kinematics RPM control**, **source provenance badge & race switcher**, and an **Inspector** drawer (`Parts` BOM + part isolation, live `Telemetry`, and `Renders` session photo gallery).

2. **Side-by-Side Compare View**
   - Streams Cerebras (`qwen-3.8-27b` or `moonshotai-kimi-k3.1-pro-trial`) side-by-side against a live GPU provider (`nvidia/nemotron-3-ultra-550b-a55b` via NVIDIA NIM, or `Reference GPU · 75 tok/s` in offline demo mode).
   - Renders side-by-side 3D thumbnails of both lanes (including partial salvaged GPU models when capped at 20s) with 1-click **`Open in Studio →`**.

3. **Santa’s 3D Gift Showroom**
   - Searches live gift concepts on `Cerebras Direct` or via the lean `clawforge-shopper` OpenClaw profile (Firecrawl `web_search` / `web_fetch`), verifies product links in parallel, and launches any gift directly into Studio via **`Forge 3D →`**.

4. **Anti-429 & Endpoint Etiquette Engineering**
   - Strict single-lane Cerebras mutex (released immediately once Cerebras completes, before trailing GPU comparison finishes), `LLM_MAX_RETRIES=0`, static prompt prefixes with `prompt_cache_key`, and a transparent local telemetry proxy (`127.0.0.1:18799`).

---

## Quickstart (Local)

```bash
npm install
npm run verify      # Validates CAD schema/salvage, builds Vite frontend, and tests HTTP/SSE server
npm start           # Serves ClawForge at http://127.0.0.1:3000
```

Without a `.env` file, ClawForge boots in **Offline Demo Mode** (`0` external API calls) with three built-in assemblies (`Cyber-Sleigh Turbofan`, `Twin-Turbo V8 Engine`, `6-DOF Robotic Claw`).

---

## Backend Setup (VM + OpenClaw / Cerebras Direct)

1. Copy `.env.example` to `.env` and configure:
   - `CLAWFORGE_BACKEND=cerebras-direct` (or `openclaw`)
   - `CEREBRAS_API_KEY=...`
   - Optional `GPU_API_KEY`, `GPU_BASE_URL`, `GPU_MODEL=nvidia/nemotron-3-ultra-550b-a55b`
   - `CORS_ORIGIN=*` (or your Vercel deployment URL, e.g. `https://clawforge.vercel.app`)
2. If using OpenClaw Gateway on the VM, apply the lean agent profiles:
   ```bash
   node openclaw-profiles/apply-profiles.mjs --dry-run
   node openclaw-profiles/apply-profiles.mjs          # add --use-proxy to tap server time_info on :18799
   systemctl --user restart openclaw-gateway.service
   ```
3. Build and start the backend server:
   ```bash
   npm run build
   npm start
   ```
4. Expose the backend over HTTPS (for example via Cloudflare Tunnel):
   ```bash
   cloudflared tunnel --url http://127.0.0.1:3000
   ```

---

## Vercel Frontend Deployment

ClawForge deploys cleanly with **static Vite hosting on Vercel** pointing at your **VM backend HTTPS URL**:

1. Import the GitHub repository into Vercel (`vercel.json` sets framework `vite`, `npm run build`, and `dist/`).
2. In **Vercel Project Settings → Environment Variables**, set:
   ```text
   VITE_API_BASE=https://<your-vm-backend-url>
   ```
3. Trigger a deploy (Vercel's built-in GitHub integration handles automatic production builds on `main` and preview deploys on pull requests).
4. Ensure `CORS_ORIGIN` in the VM's `.env` allows your Vercel domain (or `*`).

---

## Repository Structure

```text
├── shared/               # ClawCAD v1 schema, sanitizer/salvager, static prompts & built-in presets
├── src/
│   ├── config/           # VITE_API_BASE URL helper
│   ├── engine/           # Three.js PBR materials, geometry builders, compiler, viewer & snapshot renderer
│   ├── styles/           # Studio alabaster + ember CSS
│   └── ui/               # 20Hz Telemetry HUD, side-by-side Compare, Showroom & Inspector drawer
├── server/               # Node HTTP/SSE server with CORS, LLM client, single-pass forge & telemetry proxy
├── openclaw-profiles/    # Lean OpenClaw agent profiles (`clawforge`, `clawforge-shopper`) & config merger
├── tests/                # Schema/salvage tests and HTTP/SSE server verification suite
├── index.html            # Single-page Studio entry
├── vercel.json           # Vercel static Vite deployment configuration
└── vite.config.js        # Vite bundler configuration
```
