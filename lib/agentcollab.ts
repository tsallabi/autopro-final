/**
 * AgentCollab events pipeline — fire-and-forget HMAC-signed webhooks.
 *
 * Reads from process.env at call time (so toggling AGENTCOLLAB_ENABLED in
 * Render takes effect on the next event without a redeploy):
 *   AGENTCOLLAB_WEBHOOK_URL
 *   AGENTCOLLAB_API_KEY
 *   AGENTCOLLAB_HMAC_SECRET
 *   AGENTCOLLAB_ENABLED   ('true' to enable; anything else = no-op)
 *
 * Guarantees:
 *   - Never throws (won't break AutoPro request handlers).
 *   - Never blocks (returns synchronously; HTTP runs in background).
 *   - Logs warnings only on failure.
 *   - Retries 5xx + network errors with exponential backoff (3 attempts total).
 *   - Skips retry on 4xx (client errors won't fix themselves).
 *   - No PII beyond the optional external_user_email passed by the caller.
 */
import crypto from 'crypto';

export type EventType =
  | 'user.signup' | 'user.login' | 'user.churn'
  | 'order.created' | 'order.completed' | 'order.refunded'
  | 'payment.received'
  | 'subscription.started' | 'subscription.cancelled'
  | 'page.viewed' | 'form.submitted' | 'lead.captured'
  | 'employee.action' | 'error.reported' | 'deploy.completed'
  | 'custom';

export interface TrackOpts {
  external_user_id?: string;
  external_user_email?: string;
  dedupe_key?: string;
  occurred_at?: string;
}

const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2;          // total attempts = MAX_RETRIES + 1
const RETRY_BASE_MS = 500;

function isEnabled(): boolean {
  return String(process.env.AGENTCOLLAB_ENABLED || '').toLowerCase() === 'true'
    && !!process.env.AGENTCOLLAB_WEBHOOK_URL
    && !!process.env.AGENTCOLLAB_API_KEY;
}

function signBody(rawBody: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function postOnce(url: string, rawBody: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'POST', headers, body: rawBody, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Send an event to AgentCollab. Synchronous return — actual HTTP runs
 * fire-and-forget. Never throws.
 */
export function track(eventType: EventType, payload: Record<string, any>, opts: TrackOpts = {}): void {
  if (!isEnabled()) return;

  const body = {
    event_type: eventType,
    external_user_id: opts.external_user_id,
    external_user_email: opts.external_user_email,
    dedupe_key: opts.dedupe_key,
    occurred_at: opts.occurred_at || new Date().toISOString(),
    payload: payload || {},
  };

  const rawBody = JSON.stringify(body);
  const secret = process.env.AGENTCOLLAB_HMAC_SECRET || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AGENTCOLLAB_API_KEY}`,
    'X-AgentCollab-Signature': signBody(rawBody, secret),
  };
  const url = process.env.AGENTCOLLAB_WEBHOOK_URL!;

  // Fire-and-forget — caller is not blocked.
  (async () => {
    let lastErr: any = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await postOnce(url, rawBody, headers);
        if (res.ok) return;
        // 4xx → don't retry (bad payload / auth — retrying won't help).
        if (res.status >= 400 && res.status < 500) {
          console.warn(`[agentcollab] ${eventType} rejected ${res.status}`);
          return;
        }
        lastErr = `HTTP ${res.status}`;
      } catch (e: any) {
        lastErr = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
      }
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
    console.warn(`[agentcollab] ${eventType} failed after ${MAX_RETRIES + 1} attempts: ${lastErr}`);
  })().catch(() => { /* swallow — fire-and-forget */ });
}

export default { track };
