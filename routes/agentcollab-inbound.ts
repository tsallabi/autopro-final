/**
 * AgentCollab Federation — Phase 3 (write-back)
 *
 * Inbound endpoints AgentCollab calls when the dashboard owner edits a
 * customer / order / employee / product. Per the spec at
 *   libyapro-ai/docs/AGENTCOLLAB_AUTOPRO_PHASE_3.md
 *
 *   POST   /api/agentcollab/{entity}            (create)
 *   PATCH  /api/agentcollab/{entity}/:id        (partial update)
 *   DELETE /api/agentcollab/{entity}/:id        (soft delete)
 *
 * entity ∈ { customer, order, employee, product }   (singular per the doc)
 *
 * Auth (mandatory):
 *   - Authorization: Bearer ac_out_<token>      AGENTCOLLAB_OUTBOUND_TOKEN
 *   - X-AgentCollab-Signature: sha256=...       (verified if AGENTCOLLAB_HMAC_SECRET set)
 *   - Idempotency-Key: <unique>                 stored in agentcollab_idempotency
 *   Constant-time compare via crypto.timingSafeEqual.
 *
 * Idempotency contract (per the spec):
 *   - First request inserts row (status='in_progress'), runs the write,
 *     stores the response, marks 'completed'.
 *   - Duplicate completed → return stored response with same HTTP status.
 *   - Duplicate in_progress → 409 Conflict (AgentCollab will retry).
 *
 * Soft delete: AutoPro never hard-deletes records that have related
 * data (bids, invoices). Instead status='deleted' / 'archived' is set,
 * which is what the rest of the system already treats as "gone".
 */
import express from 'express';
import crypto from 'crypto';
import type { AppContext } from '../lib/types.ts';
import { getKeys } from '../lib/agentcollab-bootstrap.ts';

type EntityType = 'customer' | 'order' | 'employee' | 'product';
const VALID_ENTITIES: EntityType[] = ['customer', 'order', 'employee', 'product'];

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

function ensureIdempotencyTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentcollab_idempotency (
      key TEXT PRIMARY KEY,
      status TEXT NOT NULL,                  -- 'in_progress' | 'completed'
      response_body TEXT,                    -- JSON string of stored response
      http_status INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_acidem_created ON agentcollab_idempotency(created_at)`); } catch {}
}

function gcOldIdempotency(db: any): void {
  // 7-day retention per the doc.
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    db.prepare(`DELETE FROM agentcollab_idempotency WHERE created_at < ?`).run(cutoff);
  } catch {}
}

export function registerAgentCollabInboundRoutes(ctx: AppContext) {
  const { app, db } = ctx as any;

  ensureIdempotencyTable(db);
  // Run GC once at boot + every 6 hours.
  gcOldIdempotency(db);
  setInterval(() => gcOldIdempotency(db), 6 * 3600_000);

  /* --------------------------------------------------------------
   *  Per-entity service handlers
   *  Each returns { entity, http_status } on success, or
   *  throws an error with .statusCode set (4xx = permanent, 5xx = retry).
   * -------------------------------------------------------------- */

  function makeError(status: number, code: string, msg: string) {
    const e: any = new Error(msg);
    e.statusCode = status;
    e.code = code;
    return e;
  }

  // ─── customers (mapped to users with role buyer/user) ───────────────
  function customerCreate(payload: any): any {
    if (!payload?.name && !payload?.email) {
      throw makeError(422, 'VALIDATION_ERROR', 'Customer name or email required');
    }
    const id = `ac-cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const [firstName = '', ...rest] = String(payload.name || '').trim().split(/\s+/);
    const lastName = rest.join(' ');
    db.prepare(`
      INSERT INTO users (id, firstName, lastName, email, phone, role, status, country,
                         joinDate, kycStatus, deposit, buyingPower, biddingEnabled)
      VALUES (?, ?, ?, ?, ?, 'buyer', 'pending_approval', ?, ?, 'pending', 0, 0, 0)
    `).run(
      id, firstName, lastName,
      payload.email || null, payload.phone || null,
      payload.country || 'LY', now,
    );
    return readUser(id);
  }

  function customerUpdate(id: string, payload: any): any {
    const existing: any = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Customer not found');
    const updates: string[] = [];
    const params: any[] = [];
    if (payload.name !== undefined) {
      const [first = '', ...rest] = String(payload.name || '').trim().split(/\s+/);
      updates.push('firstName = ?', 'lastName = ?');
      params.push(first, rest.join(' '));
    }
    if (payload.email !== undefined)   { updates.push('email = ?');   params.push(payload.email); }
    if (payload.phone !== undefined)   { updates.push('phone = ?');   params.push(payload.phone); }
    if (payload.country !== undefined) { updates.push('country = ?'); params.push(payload.country); }
    if (updates.length) {
      params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return readUser(id);
  }

  function customerDelete(id: string): any {
    const existing: any = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Customer not found');
    // Soft delete — banning rather than hard-deleting because users may
    // be referenced by bids / invoices / messages.
    db.prepare(`UPDATE users SET status = 'banned' WHERE id = ?`).run(id);
    return { id, deleted: true };
  }

  function readUser(id: string): any {
    const u: any = db.prepare(`
      SELECT id, firstName, lastName, email, phone, role, status, country,
             kycStatus, deposit, buyingPower, biddingEnabled, joinDate
        FROM users WHERE id = ?
    `).get(id);
    if (!u) return null;
    return {
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' '),
      email: u.email,
      phone: u.phone,
      country: u.country,
      role: u.role,
      status: u.status,
      kyc_status: u.kycStatus,
      deposit: Number(u.deposit) || 0,
      buying_power: Number(u.buyingPower) || 0,
      bidding_enabled: Number(u.biddingEnabled) === 1,
      created_at: u.joinDate,
    };
  }

  // ─── employees (admin/manager/seller/accountant + yardRole) ─────────
  function employeeCreate(payload: any): any {
    if (!payload?.name) throw makeError(422, 'VALIDATION_ERROR', 'Employee name required');
    const id = `ac-emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const [firstName = '', ...rest] = String(payload.name || '').trim().split(/\s+/);
    const role = ['admin', 'manager', 'seller', 'accountant'].includes(payload.role)
      ? payload.role : 'manager';
    db.prepare(`
      INSERT INTO users (id, firstName, lastName, email, phone, role, status, joinDate)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(id, firstName, rest.join(' '), payload.email || null, payload.phone || null, role, now);
    return readUser(id);
  }

  function employeeUpdate(id: string, payload: any): any {
    const existing: any = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Employee not found');
    const updates: string[] = [];
    const params: any[] = [];
    if (payload.name !== undefined) {
      const [first = '', ...rest] = String(payload.name || '').trim().split(/\s+/);
      updates.push('firstName = ?', 'lastName = ?');
      params.push(first, rest.join(' '));
    }
    if (payload.email !== undefined) { updates.push('email = ?'); params.push(payload.email); }
    if (payload.phone !== undefined) { updates.push('phone = ?'); params.push(payload.phone); }
    if (payload.role !== undefined && ['admin', 'manager', 'seller', 'accountant'].includes(payload.role)) {
      updates.push('role = ?'); params.push(payload.role);
    }
    if (updates.length) {
      params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return readUser(id);
  }

  function employeeDelete(id: string): any {
    const existing: any = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Employee not found');
    db.prepare(`UPDATE users SET status = 'banned' WHERE id = ?`).run(id);
    return { id, deleted: true };
  }

  // ─── products (cars) ────────────────────────────────────────────────
  function productCreate(payload: any): any {
    if (!payload?.name && !payload?.sku) {
      throw makeError(422, 'VALIDATION_ERROR', 'Product name or sku required');
    }
    const raw = payload.raw_data || {};
    const id = `ac-car-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO cars (
        id, lotNumber, vin, make, model, year, currentBid, reservePrice,
        currency, images, status, sellerId, category, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', '', ?, ?)
    `).run(
      id,
      payload.sku || raw.lot_number || null,
      raw.vin || null,
      raw.make || null,
      raw.model || payload.name || null,
      raw.year || null,
      0,
      Number(payload.price) || Number(raw.reserve_price) || 0,
      payload.currency || 'USD',
      JSON.stringify([]),
      payload.category || raw.category || null,
      now,
    );
    return readCar(id);
  }

  function productUpdate(id: string, payload: any): any {
    const existing: any = db.prepare(`SELECT id FROM cars WHERE id = ?`).get(id);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Product not found');
    const raw = payload.raw_data || {};
    const updates: string[] = [];
    const params: any[] = [];
    if (payload.name !== undefined)     { updates.push('model = ?');      params.push(payload.name); }
    if (payload.sku !== undefined)      { updates.push('lotNumber = ?');  params.push(payload.sku); }
    if (payload.price !== undefined)    { updates.push('reservePrice = ?'); params.push(Number(payload.price) || 0); }
    if (payload.currency !== undefined) { updates.push('currency = ?');   params.push(payload.currency); }
    if (payload.category !== undefined) { updates.push('category = ?');   params.push(payload.category); }
    if (raw.make !== undefined)         { updates.push('make = ?');       params.push(raw.make); }
    if (raw.year !== undefined)         { updates.push('year = ?');       params.push(raw.year); }
    if (raw.vin !== undefined)          { updates.push('vin = ?');        params.push(raw.vin); }
    if (raw.mileage !== undefined)      { updates.push('mileage = ?');    params.push(raw.mileage); }
    if (updates.length) {
      params.push(id);
      db.prepare(`UPDATE cars SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return readCar(id);
  }

  function productDelete(id: string): any {
    const existing: any = db.prepare(`SELECT id, status FROM cars WHERE id = ?`).get(id);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Product not found');
    if (existing.status === 'live') {
      throw makeError(409, 'CONFLICT', 'Cannot delete a car currently in live auction');
    }
    db.prepare(`UPDATE cars SET status = 'deleted' WHERE id = ?`).run(id);
    return { id, deleted: true };
  }

  function readCar(id: string): any {
    const c: any = db.prepare(`
      SELECT id, lotNumber, vin, make, model, year, mileage, currentBid,
             reservePrice, currency, status, category, sessionId
        FROM cars WHERE id = ?
    `).get(id);
    if (!c) return null;
    const title = [c.year, c.make, c.model].filter(Boolean).join(' ') || `Car ${c.id}`;
    return {
      id: c.id,
      name: title,
      sku: c.lotNumber || c.vin,
      price: Number(c.reservePrice) || 0,
      currency: c.currency || 'USD',
      category: c.category,
      status: c.status,
      raw_data: {
        vin: c.vin, make: c.make, model: c.model, year: c.year,
        mileage: c.mileage, current_bid: Number(c.currentBid) || 0,
        session_id: c.sessionId,
      },
    };
  }

  // ─── orders (closed cars with winnerId) ─────────────────────────────
  function orderCreate(_payload: any): any {
    // Orders in AutoPro are derived from auctions ending — there is no
    // way to "create" an order from outside without a sale event. Reject
    // with 422 so AgentCollab marks it as a permanent failure (not a retry).
    throw makeError(422, 'NOT_SUPPORTED', 'Orders are derived from auctions; create not supported');
  }

  function orderUpdate(id: string, payload: any): any {
    // The order id is "order-{carId}" by Phase 2B convention.
    const carId = id.startsWith('order-') ? id.slice(6) : id;
    const existing: any = db.prepare(`SELECT id, status FROM cars WHERE id = ?`).get(carId);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Order not found');
    // Only allow safe updates (notes, status). We deliberately don't let
    // remote updates rewrite the winning bid amount.
    const updates: string[] = [];
    const params: any[] = [];
    if (payload.status !== undefined && ['completed', 'cancelled', 'refunded'].includes(payload.status)) {
      const carStatus = payload.status === 'cancelled' ? 'closed' : 'closed'; // keep closed
      updates.push('status = ?'); params.push(carStatus);
    }
    if (payload.notes !== undefined) { updates.push('notes = ?'); params.push(payload.notes); }
    if (updates.length) {
      params.push(carId);
      db.prepare(`UPDATE cars SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return readOrder(carId);
  }

  function orderDelete(id: string): any {
    const carId = id.startsWith('order-') ? id.slice(6) : id;
    const existing: any = db.prepare(`SELECT id FROM cars WHERE id = ?`).get(carId);
    if (!existing) throw makeError(404, 'NOT_FOUND', 'Order not found');
    // We don't actually delete sale records; mark with a status the
    // accounting view can filter on.
    db.prepare(`UPDATE cars SET status = 'archived' WHERE id = ?`).run(carId);
    return { id, deleted: true };
  }

  function readOrder(carId: string): any {
    const c: any = db.prepare(`
      SELECT c.id, c.lotNumber, c.make, c.model, c.year, c.currentBid,
             c.auctionEndDate, c.winnerId, c.status,
             u.firstName AS wf, u.lastName AS wl, u.email AS we
        FROM cars c LEFT JOIN users u ON c.winnerId = u.id
       WHERE c.id = ?
    `).get(carId);
    if (!c) return null;
    return {
      id: `order-${c.id}`,
      customer_id: c.winnerId,
      customer_name: [c.wf, c.wl].filter(Boolean).join(' ') || c.we || c.winnerId,
      total: Number(c.currentBid) || 0,
      currency: 'USD',
      status: c.status === 'archived' ? 'cancelled' : 'completed',
      placed_at: c.auctionEndDate,
      raw_data: {
        car_id: c.id, lot_number: c.lotNumber,
        vehicle: [c.year, c.make, c.model].filter(Boolean).join(' '),
      },
    };
  }

  /* --------------------------------------------------------------
   *  Express router with raw-body capture + middleware chain
   * -------------------------------------------------------------- */

  const router = express.Router();

  // Raw body capture so HMAC sees exactly what was on the wire. We then
  // parse JSON ourselves so handlers get the usual req.body.
  router.use(express.raw({ type: '*/*', limit: '5mb' }));

  // Auth middleware.
  router.use((req: any, res: any, next: any) => {
    // [phase-5] Resolve keys per-request — bootstrap may have refreshed them
    // since boot (e.g. after a key rotation in AgentCollab + restart).
    const keys = getKeys();

    // 1. Bearer
    const expectedToken = keys.outbound_token || '';
    if (!expectedToken) {
      return res.status(503).json({ detail: 'AGENTCOLLAB_OUTBOUND_TOKEN not configured' });
    }
    const auth = String(req.headers['authorization'] || '');
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Missing Bearer token' });
    }
    if (!safeEqual(auth.slice(7), expectedToken)) {
      return res.status(401).json({ detail: 'Invalid token' });
    }

    // 2. HMAC (only if secret configured)
    const hmacSecret = keys.hmac_secret || '';
    if (hmacSecret) {
      const sigHeader = String(req.headers['x-agentcollab-signature'] || '');
      const sent = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
      const rawBuf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const expected = crypto.createHmac('sha256', hmacSecret).update(rawBuf).digest('hex');
      if (!safeEqual(sent, expected)) {
        return res.status(401).json({ detail: 'Invalid HMAC signature' });
      }
    }

    // 3. Parse JSON for handlers
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      req.body = text ? JSON.parse(text) : {};
    } catch {
      return res.status(422).json({ detail: 'Body is not valid JSON' });
    }
    next();
  });

  // Idempotency middleware. Hooks res.json so we capture the response.
  router.use((req: any, res: any, next: any) => {
    const key = String(req.headers['idempotency-key'] || '').trim();
    if (!key) return next(); // allowed but discouraged per the spec

    const existing: any = db.prepare(
      `SELECT key, status, response_body, http_status FROM agentcollab_idempotency WHERE key = ?`
    ).get(key);

    if (existing) {
      if (existing.status === 'completed') {
        let body: any = {};
        try { body = JSON.parse(existing.response_body || '{}'); } catch {}
        return res.status(existing.http_status || 200).json(body);
      }
      return res.status(409).json({ detail: 'Duplicate concurrent request' });
    }

    db.prepare(`
      INSERT INTO agentcollab_idempotency (key, status, created_at)
      VALUES (?, 'in_progress', ?)
    `).run(key, new Date().toISOString());

    const origJson = res.json.bind(res);
    res.json = function (body: any) {
      try {
        db.prepare(`
          UPDATE agentcollab_idempotency
             SET status = 'completed',
                 response_body = ?,
                 http_status = ?,
                 completed_at = ?
           WHERE key = ?
        `).run(JSON.stringify(body), res.statusCode, new Date().toISOString(), key);
      } catch (e: any) {
        console.warn('[ac-inbound] idempotency persist failed:', e?.message);
      }
      return origJson(body);
    };

    next();
  });

  // Generic dispatcher
  function dispatch(action: 'create' | 'update' | 'delete', entity: EntityType, id: string | null, payload: any) {
    if (entity === 'customer') {
      if (action === 'create') return customerCreate(payload);
      if (action === 'update') return customerUpdate(id!, payload);
      if (action === 'delete') return customerDelete(id!);
    } else if (entity === 'employee') {
      if (action === 'create') return employeeCreate(payload);
      if (action === 'update') return employeeUpdate(id!, payload);
      if (action === 'delete') return employeeDelete(id!);
    } else if (entity === 'product') {
      if (action === 'create') return productCreate(payload);
      if (action === 'update') return productUpdate(id!, payload);
      if (action === 'delete') return productDelete(id!);
    } else if (entity === 'order') {
      if (action === 'create') return orderCreate(payload);
      if (action === 'update') return orderUpdate(id!, payload);
      if (action === 'delete') return orderDelete(id!);
    }
    throw makeError(400, 'BAD_ACTION', 'Unknown action');
  }

  function ok(entity: any, status = 200, res: any) {
    return res.status(status).json({ ok: true, entity });
  }

  function fail(e: any, res: any) {
    const status = Number(e?.statusCode) || 500;
    if (status >= 500) {
      console.error('[ac-inbound] handler error:', e);
    }
    return res.status(status).json({
      detail: String(e?.message || 'Internal error'),
      code: e?.code || 'INTERNAL',
    });
  }

  router.post('/:entity', (req: any, res: any) => {
    const entity = req.params.entity as EntityType;
    if (!VALID_ENTITIES.includes(entity)) return res.status(404).json({ detail: 'Unknown entity' });
    try {
      const payload = (req.body && req.body.payload !== undefined) ? req.body.payload : req.body;
      const entityResult = dispatch('create', entity, null, payload || {});
      return ok(entityResult, 201, res);
    } catch (e: any) {
      return fail(e, res);
    }
  });

  router.patch('/:entity/:id', (req: any, res: any) => {
    const entity = req.params.entity as EntityType;
    if (!VALID_ENTITIES.includes(entity)) return res.status(404).json({ detail: 'Unknown entity' });
    try {
      const payload = (req.body && req.body.payload !== undefined) ? req.body.payload : req.body;
      const entityResult = dispatch('update', entity, req.params.id, payload || {});
      return ok(entityResult, 200, res);
    } catch (e: any) {
      return fail(e, res);
    }
  });

  router.delete('/:entity/:id', (req: any, res: any) => {
    const entity = req.params.entity as EntityType;
    if (!VALID_ENTITIES.includes(entity)) return res.status(404).json({ detail: 'Unknown entity' });
    try {
      const result = dispatch('delete', entity, req.params.id, {});
      return res.status(200).json({ ok: true, ...result });
    } catch (e: any) {
      return fail(e, res);
    }
  });

  app.use('/api/agentcollab', router);
  console.log('[ac-inbound] Phase 3 endpoints ready: POST/PATCH/DELETE /api/agentcollab/{customer,order,employee,product}');
}
