import fs from 'node:fs';
import path from 'node:path';

/**
 * Zero-dependency .env loader + ClawForge runtime config.
 * Never logs or exposes API keys or gateway tokens.
 */

const ROOT_DIR = process.cwd();

function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

function resolveDefaultBackend() {
  const explicit = (process.env.CLAWFORGE_BACKEND || '').trim().toLowerCase();
  if (['openclaw', 'cerebras-direct', 'demo'].includes(explicit)) {
    return explicit;
  }
  if (process.env.CEREBRAS_API_KEY) return 'cerebras-direct';
  return 'demo';
}

export const config = {
  rootDir: ROOT_DIR,
  distDir: path.join(ROOT_DIR, 'dist'),
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  corsOrigin: (process.env.CORS_ORIGIN || '*').trim(),

  backend: resolveDefaultBackend(),

  openclaw: {
    gatewayUrl: (process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789').replace(/\/+$/, ''),
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',
    cadAgentId: process.env.OPENCLAW_CAD_AGENT_ID || 'clawforge',
    shopperAgentId: process.env.OPENCLAW_SHOPPER_AGENT_ID || 'clawforge-shopper'
  },

  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY || '',
    baseUrl: (process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1').replace(/\/+$/, ''),
    model: process.env.CEREBRAS_MODEL || 'moonshotai-kimi-k3.1-pro-trial',
    testModel: process.env.CEREBRAS_TEST_MODEL || 'qwen-3.8-27b',
    reasoningEffort: process.env.CEREBRAS_REASONING_EFFORT || 'low',
    maxTokensDraft: Math.min(8192, Math.max(1024, Number(process.env.CEREBRAS_MAX_TOKENS_DRAFT || 6144)))
  },

  etiquette: {
    // Hard-capped at 0 retries by default to prevent 429 retry storms on shared capacity
    maxRetries: Math.max(0, Math.min(0, Number(process.env.LLM_MAX_RETRIES || 0))),
    singleLane: true
  },

  telemetryProxy: {
    enabled: String(process.env.TELEMETRY_PROXY_ENABLED || 'true').toLowerCase() !== 'false',
    port: Number(process.env.TELEMETRY_PROXY_PORT || 18799)
  },

  gpu: {
    providerName: process.env.GPU_PROVIDER_NAME || 'GPU Baseline',
    apiKey: process.env.GPU_API_KEY || '',
    baseUrl: (process.env.GPU_BASE_URL || '').replace(/\/+$/, ''),
    model: process.env.GPU_MODEL || ''
  }
};

export function getPublicCapabilities() {
  return {
    defaultBackend: config.backend,
    openclawConfigured: Boolean(config.openclaw.gatewayUrl),
    openclawCadAgentId: config.openclaw.cadAgentId,
    openclawShopperAgentId: config.openclaw.shopperAgentId,
    cerebrasDirectReady: Boolean(config.cerebras.apiKey),
    cerebrasModel: config.cerebras.model,
    cerebrasTestModel: config.cerebras.testModel,
    gpuLiveConfigured: Boolean(config.gpu.apiKey && config.gpu.baseUrl && config.gpu.model),
    gpuProviderName: config.gpu.providerName,
    gpuModel: config.gpu.model || 'Reference GPU Pacer (75 tok/s)',
    telemetryProxyPort: config.telemetryProxy.enabled ? config.telemetryProxy.port : null,
    singleLaneEnforced: true,
    maxRetries: config.etiquette.maxRetries
  };
}
