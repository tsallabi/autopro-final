/**
 * AgentCollab Federation — Phase 2A
 *
 * Hourly outbound push of summary stats to AgentCollab. Auto Pro computes
 * its own snapshot from SQLite and POSTs it to
 *   POST https://app.agentscollab.biz/api/external/{slug}/stats
 *
 * AgentCollab upserts a single "latest snapshot" row per site and serves it
 * to the dashboard in O(1). No new credentials — re-uses the same
 * AGENTCOLLAB_API_KEY + AGENTCOLLAB_HMAC_SECRET that already authenticate
 * the Phase-1 webhook in lib/agentcollab.ts.
 *
 * Env vars (all already configured in production except slug):
 *   AGENTCOLLAB_ENABLED         'true' to enable (same flag as webhook)
 *   AGENTCOLLAB_API_KEY         es_live_... Bearer token
 *   AGENTCOLLAB_HMAC_SECRET     optional HMAC secret
 *   AGENTCOLLAB_BASE_URL        optional; default https://app.agentscollab.biz
 *   AGENTCOLLAB_SITE_SLUG       optional; default 'auto-pro'
 *
 * Cadence: every 60 minutes. The first push happens 30 seconds after boot
 * so the dashboard tile lights up quickly after a deploy.
 *
 * Guarantees:
 *   - Never throws (won't block the scheduler tick or other cron work).
 *   - Self-throttles — the push runs in its own setInterval, independent
 *     of auction ticks / cron / sockets.
 *   - Logs success + failure to the same log stream as the rest of the
 *     server so the operator can see "[agentcollab-stats]" lines.
 */
import crypto from 'crypto';
import { getKeys } from './agentcollab-bootstrap.ts';

const TIMEOUT_MS = 10_000;
const PUSH_INTERVAL_MS = 60 * 60 * 1000;   // 1 hour
const FIRST_PUSH_DELAY_MS = 30 * 1000;     // 30 seconds after boot

function isEnabled(): boolean {
  if (String(process.env.AGENTCOLLAB_ENABLED || '').toLowerCase() !== 'true') return false;
  // [phase-5] Read live — bootstrap may rotate the key on restart.
  return !!getKeys().api_key;
}

function baseUrl(): string {
  return (process.env.AGENTCOLLAB_BASE_URL || 'https://app.agentscollab.biz').replace(/\/$/, '');
}

function slug(): string {
  // [slug-unify] Same precedence as sync + bootstrap so all three target
  // the same AgentCollab site.
  return process.env.AGENTCOLLAB_SLUG || process.env.AGENTCOLLAB_SITE_SLUG || 'site';
}

function scalar(db: any, sql: string, params: any[] = []): number {
  try {
    const row: any = db.prepare(sql).get(...params);
    return row ? Number(row.val) || 0 : 0;
  } catch (e: any) {
    console.warn('[agentcollab-stats] scalar query failed:', e?.message);
    return 0;
  }
}

interface OrdersBucket {
  count: number;
  revenue: number;
}

export interface StatsSnapshot {
  customer_count: number;
  employee_count: number;
  product_count: number;
  orders_today: OrdersBucket;
  orders_this_week: OrdersBucket;
  orders_this_month: OrdersBucket;
  currency: string;
  raw_data: Record<string, any>;
  pulled_at: string;
}

/**
 * Build the snapshot from SQLite. Each query is independent — if any one
 * fails we still ship the rest with the failed field set to 0.
 *
 * Auto Pro → AgentCollab entity mapping:
 *   customer_count  → buyers + general users (excludes admins/sellers/staff)
 *   employee_count  → admin + manager + seller + accountant + yard roles
 *   product_count   → cars not in (deleted/archived/hidden)
 *   orders_*        → closed cars with a winner (= sold) by auctionEndDate
 */
export function buildSnapshot(db: any): StatsSnapshot {
  const customer_count = scalar(db, `
    SELECT COUNT(*) AS val FROM users
     WHERE COALESCE(role, 'buyer') IN ('buyer', 'user', 'user_pending')
       AND COALESCE(status, '') NOT IN ('banned', 'suspended', 'rejected', 'blocked')
  `);

  // Employees: admin, manager, seller, accountant, OR anyone with a yardRole.
  const employee_count = scalar(db, `
    SELECT COUNT(*) AS val FROM users
     WHERE (
       COALESCE(role, '') IN ('admin', 'manager', 'seller', 'accountant')
       OR COALESCE(yardRole, '') != ''
     )
       AND COALESCE(status, '') NOT IN ('banned', 'suspended', 'rejected', 'blocked')
  `);

  // Products = cars in any non-deleted state (the whole inventory exposed
  // to the marketplace counts as "products" from a dashboard POV).
  const product_count = scalar(db, `
    SELECT COUNT(*) AS val FROM cars
     WHERE COALESCE(status, '') NOT IN ('deleted', 'archived', 'hidden')
  `);

  // Today (since UTC midnight).
  const todayCount = scalar(db, `
    SELECT COUNT(*) AS val FROM cars
     WHERE status = 'closed' AND winnerId IS NOT NULL AND winnerId != ''
       AND date(auctionEndDate) = date('now')
  `);
  const todayRevenue = scalar(db, `
    SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
     WHERE status = 'closed' AND winnerId IS NOT NULL AND winnerId != ''
       AND date(auctionEndDate) = date('now')
  `);

  // Last 7 days (rolling).
  const weekCount = scalar(db, `
    SELECT COUNT(*) AS val FROM cars
     WHERE status = 'closed' AND winnerId IS NOT NULL AND winnerId != ''
       AND auctionEndDate > datetime('now', '-7 days')
  `);
  const weekRevenue = scalar(db, `
    SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
     WHERE status = 'closed' AND winnerId IS NOT NULL AND winnerId != ''
       AND auctionEndDate > datetime('now', '-7 days')
  `);

  // Calendar month (matches our admin overview report; AgentCollab tells
  // each site to pick its own definition).
  const monthCount = scalar(db, `
    SELECT COUNT(*) AS val FROM cars
     WHERE status = 'closed' AND winnerId IS NOT NULL AND winnerId != ''
       AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now')
  `);
  const monthRevenue = scalar(db, `
    SELECT COALESCE(SUM(currentBid), 0) AS val FROM cars
     WHERE status = 'closed' AND winnerId IS NOT NULL AND winnerId != ''
       AND strftime('%Y-%m', auctionEndDate) = strftime('%Y-%m', 'now')
  `);

  // Extras for the dashboard's raw_data drawer.
  const liveAuctions = scalar(db, `SELECT COUNT(*) AS val FROM cars WHERE status = 'live'`);
  const upcomingAuctions = scalar(db, `SELECT COUNT(*) AS val FROM cars WHERE status = 'upcoming'`);
  const offerMarketCount = scalar(db, `SELECT COUNT(*) AS val FROM cars WHERE status = 'offer_market'`);
  const pendingKyc = scalar(db, `
    SELECT COUNT(*) AS val FROM users
     WHERE COALESCE(kycStatus, 'pending') != 'approved'
       AND COALESCE(role, '') != 'admin'
  `);
  const biddingEnabledUsers = scalar(db, `
    SELECT COUNT(*) AS val FROM users WHERE biddingEnabled = 1
  `);

  return {
    customer_count,
    employee_count,
    product_count,
    orders_today:      { count: todayCount, revenue: todayRevenue },
    orders_this_week:  { count: weekCount,  revenue: weekRevenue },
    orders_this_month: { count: monthCount, revenue: monthRevenue },
    currency: 'USD',
    raw_data: {
      live_auctions: liveAuctions,
      upcoming_auctions: upcomingAuctions,
      offer_market: offerMarketCount,
      pending_kyc: pendingKyc,
      bidding_enabled_users: biddingEnabledUsers,
    },
    pulled_at: new Date().toISOString(),
  };
}

/**
 * Push the snapshot to AgentCollab. Signs with HMAC if a secret is configured.
 * Always returns — caller never has to try/catch.
 */
export async function pushStatsSnapshot(db: any): Promise<void> {
  if (!isEnabled()) return;

  const snapshot = buildSnapshot(db);
  const body = JSON.stringify(snapshot);
  // [phase-5] Read keys at call time — bootstrap populates them async, so
  // capturing at module load would freeze the empty pre-bootstrap values.
  const keys = getKeys();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${keys.api_key}`,
  };

  if (keys.hmac_secret) {
    const sig = crypto.createHmac('sha256', keys.hmac_secret).update(body).digest('hex');
    headers['X-AgentCollab-Signature'] = `sha256=${sig}`;
  }

  const url = `${baseUrl()}/api/external/${slug()}/stats`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[agentcollab-stats] push failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    console.log(`[agentcollab-stats] pushed snapshot — ${snapshot.customer_count} customers, ${snapshot.orders_today.count} orders today ($${snapshot.orders_today.revenue})`);
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
    console.warn(`[agentcollab-stats] push failed: ${reason}`);
  } finally {
    clearTimeout(t);
  }
}

let scheduled = false;

/**
 * Start the hourly push loop. Idempotent — safe to call multiple times,
 * only the first call actually registers the interval.
 */
export function scheduleHourlyStatsPush(db: any): void {
  if (scheduled) return;
  scheduled = true;
  if (!isEnabled()) {
    console.log('[agentcollab-stats] AGENTCOLLAB_ENABLED is not true — skipping hourly push');
    return;
  }
  // First push 30s after boot so the dashboard tile lights up fast.
  setTimeout(() => { pushStatsSnapshot(db).catch(() => {}); }, FIRST_PUSH_DELAY_MS);
  // Then once an hour, forever.
  setInterval(() => { pushStatsSnapshot(db).catch(() => {}); }, PUSH_INTERVAL_MS);
  console.log(`[agentcollab-stats] hourly push scheduled (slug=${slug()})`);
}

export default {
  buildSnapshot,
  pushStatsSnapshot,
  scheduleHourlyStatsPush,
};
