#!/usr/bin/env node
/**
 * Safe Non-Destructive Merger for ClawForge Lean OpenClaw Profiles (Anti-429 Architecture)
 *
 * Usage:
 *   node openclaw-profiles/apply-profiles.mjs --dry-run
 *   node openclaw-profiles/apply-profiles.mjs
 *   node openclaw-profiles/apply-profiles.mjs --use-proxy
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const useProxy = args.has('--use-proxy');

const openclawDir = path.join(os.homedir(), '.openclaw');
const configPath = path.join(openclawDir, 'openclaw.json');
const fragmentPath = path.join(__dirname, 'openclaw.clawforge.fragment.json');

const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));

if (!fs.existsSync(configPath)) {
  console.error(`Error: ${configPath} not found. Run this on a machine where OpenClaw is initialized.`);
  process.exit(1);
}

const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const merged = structuredClone(current);

// 1. Disable toolSearch to avoid giant schema churn & preserve prompt cache prefix
merged.tools = { ...(merged.tools || {}), toolSearch: false };

// 2. Ensure gateway HTTP chatCompletions endpoint is enabled
merged.gateway = merged.gateway || {};
merged.gateway.http = merged.gateway.http || {};
merged.gateway.http.endpoints = merged.gateway.http.endpoints || {};
merged.gateway.http.endpoints.chatCompletions = {
  ...(merged.gateway.http.endpoints.chatCompletions || {}),
  enabled: true
};

// 3. Tighten maxTokens to protect the 50K uncached TPM bucket (Cerebras pre-allocates input + maxTokens!)
merged.agents = merged.agents || {};
merged.agents.defaults = {
  ...(merged.agents.defaults || {}),
  thinkingDefault: merged.agents.defaults?.thinkingDefault || 'low'
};

// Preserve existing `main` agent and upsert `clawforge` + `clawforge-shopper` under agents.entries (OpenClaw 2026.11+)
delete merged.agents.list;
const entries = { ...(merged.agents.entries || {}) };
if (!entries.main) {
  entries.main = {
    name: 'main',
    workspace: merged.agents.defaults?.workspace || path.join(openclawDir, 'workspace')
  };
}

for (const [id, profile] of Object.entries(fragment.agents.entries || {})) {
  const workspace = typeof profile.workspace === 'string' && profile.workspace.startsWith('~/')
    ? path.join(os.homedir(), profile.workspace.slice(2))
    : profile.workspace;
  entries[id] = { ...(entries[id] || {}), ...profile, workspace };
}
merged.agents.entries = entries;

// 4. Lower cerebras model maxTokens to 6144 (from 8192) to reduce Turn 1 pre-allocated TPM
const cerebrasModels = merged.models?.providers?.cerebras?.models;
if (Array.isArray(cerebrasModels)) {
  for (const m of cerebrasModels) {
    if (m.id === 'moonshotai-kimi-k3.1-pro-trial') {
      m.maxTokens = 6144;
    }
  }
}

// Optional transparent local telemetry proxy routing (standard unpatched OpenClaw!)
if (useProxy && merged.models?.providers?.cerebras) {
  merged.models.providers.cerebras.baseUrl = 'http://127.0.0.1:18799/v1';
}

// Redact any inline secrets before printing preview
function redact(obj) {
  return JSON.stringify(obj, (k, v) => {
    if (/key|token|secret/i.test(k) && typeof v === 'string' && !v.startsWith('${')) {
      return '***REDACTED***';
    }
    return v;
  }, 2);
}

if (dryRun) {
  console.log('=== DRY RUN PREVIEW (no files written) ===');
  console.log(redact(merged));
  process.exit(0);
}

// Copy lean static SOUL.md workspaces
for (const ws of ['workspace-clawforge', 'workspace-shopper']) {
  const destDir = path.join(openclawDir, ws);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, ws, 'SOUL.md'), path.join(destDir, 'SOUL.md'));
  console.log(`Synced lean workspace: ${destDir}/SOUL.md`);
}

// Backup openclaw.json before writing
const backupPath = `${configPath}.bak.${Date.now()}`;
fs.copyFileSync(configPath, backupPath);
fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

console.log(`Backed up original config -> ${backupPath}`);
console.log(`Updated ${configPath} with lean profiles: clawforge & clawforge-shopper`);
if (useProxy) {
  console.log('Cerebras baseUrl routed through local transparent telemetry proxy http://127.0.0.1:18799/v1');
}
console.log('Restart your OpenClaw gateway (`systemctl --user restart openclaw-gateway.service`) to apply.');
