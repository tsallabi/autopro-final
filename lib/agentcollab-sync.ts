/**
 * AgentCollab Federation — Phase 2B (entity sync)
 *
 * Periodically (every 30 minutes) pushes batches of customers, orders,
 * employees, and products to AgentCollab so the dashboard can search
 * across all rows from this site.
 *
 *   POST {base}/api/external/{slug}/sync/customers
 *   POST {base}/api/external/{slug}/sync/orders
 *   POST {base}/api/external/{slug}/sync/employees
 *   POST {base}/api/external/{slug}/sync/products
 *
 * Same auth model as Phase 1 webhook + Phase 2A stats — re-uses
 * AGENTCOLLAB_API_KEY + AGENTCOLLAB_HMAC_SECRET. No new secret.
 *
 * Strategy:
 *   - Full upsert sync every 30 minutes (server-side is idempotent).
 *   - Each entity capped at 5000 most-recent rows for the first sync,
 *     chunked at 500 per HTTP request (the AgentCollab limit).
 *   - First push 60s after boot so logs don't interleave with the
 *     boot output; then every 30 minutes.
 *
 * Auto Pro → AgentCollab entity mapping:
 *   customers ← users with role IN (buyer, user, user_pending), excluding banned
 *   employees ← users with role IN (admin, manager, seller, accountant) OR yardRole != ''
 *   products  ← cars NOT IN (deleted, archived, hidden) — entire active inventory
 *   orders    ← cars with status='closed' AND winnerId set, by auctionEndDate
 *
 * Guarantees:
 *   - Never throws — every query, every HTTP call wrapped in try/catch.
 *   - Self-throttling — runs in its own setInterval, can't block the
 *     bidding scheduler / sockets / cron.
 *   - Silent no-op when AGENTCOLLAB_ENABLED != 'true'.
 *   - Idempotent scheduling — multiple boot calls register one timer.
 */
import crypto from 'crypto';
import { getKeys } from './agentcollab-bootstrap.ts';

const TIMEOUT_MS = 30_000;
const SYNC_INTERVAL_MS = 30 * 60 * 1000;   // 30 minutes
const FIRST_SYNC_DELAY_MS = 60 * 1000;     // 60 seconds after boot
const BATCH_SIZE = 500;                     // AgentCollab cap
const MAX_ROWS_PER_ENTITY = 5000;           // safety ceiling per cycle

type EntityType = 'customers' | 'orders' | 'employees' | 'products';

function isEnabled(): boolean {
  if (String(process.env.AGENTCOLLAB_ENABLED || '').toLowerCase() !== 'true') return false;
  // [phase-5] Read live so a key rotation picked up at next bootstrap
  // is reflected here without a code change.
  return !!getKeys().api_key;
}

function baseUrl(): string {
  return (process.env.AGENTCOLLAB_BASE_URL || 'https://app.agentscollab.biz').replace(/\/$/, '');
}

function slug(): string {
  return process.env.AGENTCOLLAB_SITE_SLUG || 'site';
}

/* ============================================================
 *  Entity builders — pull from SQLite, shape per the spec
 * ============================================================ */

interface CustomerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  country?: string;
  created_at?: string;
  updated_at?: string;
  raw_data?: Record<string, any>;
}

function buildCustomers(db: any): CustomerRow[] {
  try {
    const rows: any[] = db.prepare(`
      SELECT id, firstName, lastName, email, phone, country, joinDate,
             role, status, kycStatus, deposit, buyingPower, biddingEnabled
        FROM users
       WHERE COALESCE(role, 'buyer') IN ('buyer', 'user', 'user_pending')
         AND COALESCE(status, '') NOT IN ('banned', 'suspended', 'rejected', 'blocked')
       ORDER BY joinDate DESC
       LIMIT ${MAX_ROWS_PER_ENTITY}
    `).all();
    return rows.map((u: any) => ({
      id: String(u.id),
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
      email: u.email || undefined,
      phone: u.phone || undefined,
      country: u.country || undefined,
      created_at: u.joinDate || undefined,
      raw_data: {
        role: u.role,
        status: u.status,
        kyc_status: u.kycStatus,
        deposit: Number(u.deposit) || 0,
        buying_power: Number(u.buyingPower) || 0,
        bidding_enabled: Number(u.biddingEnabled) === 1,
      },
    }));
  } catch (e: any) {
    console.warn('[agentcollab-sync] buildCustomers failed:', e?.message);
    return [];
  }
}

interface EmployeeRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  hired_at?: string;
  raw_data?: Record<string, any>;
}

function buildEmployees(db: any): EmployeeRow[] {
  try {
    const rows: any[] = db.prepare(`
      SELECT id, firstName, lastName, email, phone, role, yardRole,
             office, companyName, joinDate, status
        FROM users
       WHERE (
         COALESCE(role, '') IN ('admin', 'manager', 'seller', 'accountant')
         OR COALESCE(yardRole, '') != ''
       )
         AND COALESCE(status, '') NOT IN ('banned', 'suspended', 'rejected', 'blocked')
       ORDER BY joinDate DESC
       LIMIT ${MAX_ROWS_PER_ENTITY}
    `).all();
    return rows.map((u: any) => ({
      id: String(u.id),
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
      email: u.email || undefined,
      phone: u.phone || undefined,
      role: u.role || u.yardRole || 'staff',
      hired_at: u.joinDate || undefined,
      raw_data: {
        yard_role: u.yardRole || null,
        office: u.office || null,
        company_name: u.companyName || null,
        status: u.status || null,
      },
    }));
  } catch (e: any) {
    console.warn('[agentcollab-sync] buildEmployees failed:', e?.message);
    return [];
  }
}

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  price?: string;
  currency?: string;
  category?: string;
  stock_qty?: number;
  raw_data?: Record<string, any>;
}

function buildProducts(db: any): ProductRow[] {
  try {
    const rows: any[] = db.prepare(`
      SELECT id, lotNumber, vin, make, model, year, mileage, currentBid,
             reservePrice, buyItNow, status, category, sessionId,
             location, primaryDamage, titleType
        FROM cars
       WHERE COALESCE(status, '') NOT IN ('deleted', 'archived', 'hidden')
       ORDER BY id DESC
       LIMIT ${MAX_ROWS_PER_ENTITY}
    `).all();
    return rows.map((c: any) => {
      const title = [c.year, c.make, c.model].filter(Boolean).join(' ') || `Car #${c.id}`;
      const price = Number(c.currentBid || c.reservePrice || 0);
      return {
        id: String(c.id),
        name: title,
        sku: c.lotNumber || c.vin || String(c.id),
        price: price > 0 ? price.toFixed(2) : undefined,
        currency: 'USD',
        category: c.category || 'cars',
        stock_qty: ['closed', 'sold'].includes(String(c.status || '').toLowerCase()) ? 0 : 1,
        raw_data: {
          vin: c.vin || null,
          lot_number: c.lotNumber || null,
          make: c.make,
          model: c.model,
          year: c.year,
          mileage: c.mileage,
          current_bid: Number(c.currentBid) || 0,
          reserve_price: Number(c.reservePrice) || 0,
          buy_it_now: Number(c.buyItNow) || 0,
          auction_status: c.status,
          session_id: c.sessionId || null,
          location: c.location || null,
          primary_damage: c.primaryDamage || null,
          title_type: c.titleType || null,
        },
      };
    });
  } catch (e: any) {
    console.warn('[agentcollab-sync] buildProducts failed:', e?.message);
    return [];
  }
}

interface OrderRow {
  id: string;
  customer_id?: string;
  customer_name?: string;
  total?: string;
  currency?: string;
  status?: string;
  items_count?: number;
  placed_at?: string;
  raw_data?: Record<string, any>;
}

function buildOrders(db: any): OrderRow[] {
  try {
    // An "order" in AutoPro = a sold car. Join the winner's name.
    const rows: any[] = db.prepare(`
      SELECT c.id, c.lotNumber, c.vin, c.make, c.model, c.year,
             c.currentBid, c.auctionEndDate, c.winnerId,
             u.firstName AS winnerFirst, u.lastName AS winnerLast, u.email AS winnerEmail
        FROM cars c
        LEFT JOIN users u ON c.winnerId = u.id
       WHERE c.status = 'closed'
         AND c.winnerId IS NOT NULL AND c.winnerId != ''
       ORDER BY c.auctionEndDate DESC
       LIMIT ${MAX_ROWS_PER_ENTITY}
    `).all();
    return rows.map((c: any) => {
      const total = Number(c.currentBid) || 0;
      const customerName = [c.winnerFirst, c.winnerLast].filter(Boolean).join(' ')
                          || c.winnerEmail || c.winnerId;
      const carTitle = [c.year, c.make, c.model].filter(Boolean).join(' ') || `Car ${c.id}`;
      return {
        id: `order-${c.id}`,
        customer_id: c.winnerId,
        customer_name: customerName,
        total: total > 0 ? total.toFixed(2) : '0.00',
        currency: 'USD',
        status: 'completed',
        items_count: 1,
        placed_at: c.auctionEndDate || undefined,
        raw_data: {
          car_id: c.id,
          lot_number: c.lotNumber,
          vin: c.vin,
          vehicle: carTitle,
          winning_bid: total,
        },
      };
    });
  } catch (e: any) {
    console.warn('[agentcollab-sync] buildOrders failed:', e?.message);
    return [];
  }
}

/* ============================================================
 *  Push helpers
 * ============================================================ */

interface BatchResult {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: any[];
}

async function postBatch(entityType: EntityType, items: any[]): Promise<BatchResult | null> {
  const body = JSON.stringify({ items });
  // [phase-5] Resolve keys at call time, never at module load.
  const keys = getKeys();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${keys.api_key}`,
  };
  if (keys.hmac_secret) {
    const sig = crypto.createHmac('sha256', keys.hmac_secret).update(body).digest('hex');
    headers['X-AgentCollab-Signature'] = `sha256=${sig}`;
  }

  const url = `${baseUrl()}/api/external/${slug()}/sync/${entityType}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[agentcollab-sync] ${entityType} batch HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    return (await res.json().catch(() => null)) as BatchResult;
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
    console.warn(`[agentcollab-sync] ${entityType} batch failed: ${reason}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function syncEntity(entityType: EntityType, items: any[]): Promise<void> {
  if (!items.length) {
    console.log(`[agentcollab-sync] ${entityType}: nothing to push`);
    return;
  }
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const result = await postBatch(entityType, chunk);
    if (result) {
      totalInserted += result.inserted || 0;
      totalUpdated  += result.updated  || 0;
      totalSkipped  += result.skipped  || 0;
    }
  }
  console.log(`[agentcollab-sync] ${entityType}: ${items.length} pushed (${totalInserted} inserted, ${totalUpdated} updated, ${totalSkipped} skipped)`);
}

/**
 * Run one full sync cycle — all four entities, sequentially so we don't
 * burst-send four large batches simultaneously.
 */
export async function runFullEntitySync(db: any): Promise<void> {
  if (!isEnabled()) return;
  try {
    await syncEntity('customers', buildCustomers(db));
    await syncEntity('employees', buildEmployees(db));
    await syncEntity('products',  buildProducts(db));
    await syncEntity('orders',    buildOrders(db));
  } catch (e: any) {
    console.warn('[agentcollab-sync] full sync cycle failed:', e?.message);
  }
}

let scheduled = false;

/**
 * Start the entity-sync loop. Idempotent — safe to call multiple times,
 * only the first call actually registers the interval.
 */
export function scheduleEntitySync(db: any): void {
  if (scheduled) return;
  scheduled = true;
  if (!isEnabled()) {
    console.log('[agentcollab-sync] AGENTCOLLAB_ENABLED is not true — skipping entity sync');
    return;
  }
  // First sync 60s after boot so logs don't interleave with route registration.
  setTimeout(() => { runFullEntitySync(db).catch(() => {}); }, FIRST_SYNC_DELAY_MS);
  // Then every 30 minutes.
  setInterval(() => { runFullEntitySync(db).catch(() => {}); }, SYNC_INTERVAL_MS);
  console.log(`[agentcollab-sync] entity sync scheduled (every 30min, slug=${slug()})`);
}

export default {
  buildCustomers,
  buildEmployees,
  buildProducts,
  buildOrders,
  runFullEntitySync,
  scheduleEntitySync,
};
