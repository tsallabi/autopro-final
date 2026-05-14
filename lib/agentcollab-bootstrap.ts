/**
 * AgentCollab key bootstrap (Phase 5).
 *
 * Called once at startup. Fetches the current api_key + hmac_secret +
 * outbound_token from AgentCollab. Caches in memory. Other modules
 * (agentcollab-stats, agentcollab-sync, agentcollab-inbound) import
 * `getKeys()` instead of reading env directly so key rotations on the
 * AgentCollab side can be picked up by a simple `systemctl restart`.
 *
 * Behaviour:
 *   - If AGENTCOLLAB_BOOTSTRAP_TOKEN is set, fetch keys from
 *     POST /api/external/{slug}/bootstrap.
 *   - If unset (or fetch fails after retries), fall back to the legacy
 *     env vars (AGENTCOLLAB_API_KEY / HMAC_SECRET / OUTBOUND_TOKEN /
 *     WEBHOOK_URL). Phase 5 is therefore non-breaking: deploying without
 *     the bootstrap token is a no-op.
 *
 * Network:
 *   - 10 s timeout per attempt
 *   - 5 attempts on cold start with exponential backoff (1, 2, 4, 8, 16 s)
 *   - 4xx → fail-fast (no retry; bad credentials or wrong slug)
 *   - 5xx or network error → retry
 */
import { setTimeout as wait } from 'timers/promises';

type Keys = {
  webhook_url: string;
  api_key: string;
  hmac_secret: string;
  outbound_token: string;
};

let cached: Keys | null = null;
let lastFetchAt = 0;

const BASE = process.env.AGENTCOLLAB_BASE_URL || 'https://app.agentscollab.biz';
const SLUG = process.env.AGENTCOLLAB_SLUG || 'site';
const BOOTSTRAP_TOKEN = process.env.AGENTCOLLAB_BOOTSTRAP_TOKEN || '';

const TIMEOUT_MS = 10_000;
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS = 1_000;

export async function bootstrapKeys(): Promise<Keys | null> {
  if (!BOOTSTRAP_TOKEN) {
    console.warn('[agentcollab-bootstrap] AGENTCOLLAB_BOOTSTRAP_TOKEN not set — running in legacy env-var mode');
    return null;
  }

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${BASE}/api/external/${SLUG}/bootstrap`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${BOOTSTRAP_TOKEN}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (r.ok) {
        const data: any = await r.json();
        cached = {
          webhook_url: data.webhook_url || '',
          api_key: data.api_key || '',
          hmac_secret: data.hmac_secret || '',
          outbound_token: data.outbound_token || '',
        };
        lastFetchAt = Date.now();
        const apiPrefix = String(cached.api_key).slice(0, 11);
        console.log(`[agentcollab-bootstrap] ✓ keys fetched (api_key prefix=${apiPrefix})`);
        return cached;
      }

      // 4xx — don't retry, surface clearly
      if (r.status >= 400 && r.status < 500) {
        const body = await r.text().catch(() => '');
        console.error(`[agentcollab-bootstrap] ${r.status} ${body.slice(0, 200)}`);
        return null;
      }

      console.warn(`[agentcollab-bootstrap] attempt ${attempt + 1}/${RETRY_ATTEMPTS}: HTTP ${r.status}`);
    } catch (e: any) {
      clearTimeout(t);
      console.warn(`[agentcollab-bootstrap] attempt ${attempt + 1}/${RETRY_ATTEMPTS}: ${e?.message || e}`);
    }
    if (attempt < RETRY_ATTEMPTS - 1) {
      await wait(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  console.error('[agentcollab-bootstrap] all attempts failed — falling back to legacy env vars');
  return null;
}

/**
 * Synchronous accessor for other modules. Returns the in-memory cached
 * keys when bootstrap succeeded; otherwise falls back to the legacy
 * env vars so existing deployments keep working.
 *
 * CRITICAL: call this INSIDE every function that needs keys — never
 * destructure at module load, because that captures the empty values
 * that exist before bootstrap completes.
 */
export function getKeys(): Keys {
  if (cached) return cached;
  return {
    webhook_url: process.env.AGENTCOLLAB_WEBHOOK_URL || '',
    api_key: process.env.AGENTCOLLAB_API_KEY || '',
    hmac_secret: process.env.AGENTCOLLAB_HMAC_SECRET || '',
    outbound_token: process.env.AGENTCOLLAB_OUTBOUND_TOKEN || '',
  };
}

/**
 * Feature-flag check. AGENTCOLLAB_ENABLED='true' AND at minimum a
 * webhook_url + api_key are available (from either source).
 */
export function isEnabled(): boolean {
  if (String(process.env.AGENTCOLLAB_ENABLED || '').toLowerCase() !== 'true') return false;
  const k = getKeys();
  return !!(k.webhook_url && k.api_key);
}

export function getLastFetchAt(): number {
  return lastFetchAt;
}
