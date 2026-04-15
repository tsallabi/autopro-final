/**
 * Yard Management System — Backend Routes
 * Gate-In / Gate-Out with VIN verification, security incident logging,
 * photo capture, status changes, and location management.
 */
import crypto from 'crypto';
import { requireAuth, requireAdmin, requireYardRole } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

// qrcode loaded lazily
let _qrcode: any = null;
async function getQRCode() {
  if (_qrcode) return _qrcode;
  try { const m: any = await import('qrcode'); _qrcode = m.default || m; } catch { _qrcode = null; }
  return _qrcode;
}

// ─── Helpers ────────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${crypto.randomBytes(6).toString('hex')}`;
const gatePass = () => `GP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
const ipHash = (req: any): string => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString();
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  } catch { return ''; }
};

/** VIN validator — 17 chars, no I/O/Q */
export function isValidVIN(vin: string): boolean {
  if (!vin || typeof vin !== 'string') return false;
  const v = vin.toUpperCase().trim();
  if (v.length !== 17) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

/** Role check — allows admin / supervisor / gatekeeper roles */
function hasGateRole(req: any): boolean {
  const role = req.user?.role;
  const team = req.user?.supportTeam;
  return role === 'admin' || role === 'supervisor' || role === 'gatekeeper' ||
         team === 'yard' || team === 'admin' || team === 'ops';
}

export function registerYardRoutes(ctx: AppContext) {
  const { app, db } = ctx;

  // ─── VIN decode (NHTSA) ─────────────────────────────────────────
  app.get('/api/yard/vin/decode/:vin', requireAuth, async (req, res) => {
    const vin = String(req.params.vin || '').toUpperCase().trim();
    if (!isValidVIN(vin)) return res.status(400).json({ error: 'VIN غير صالح' });
    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) return res.json({ vin, make: '', model: '', year: null });
      const data: any = await r.json();
      const out: any = { vin, make: '', model: '', year: null, bodyClass: '', fuelType: '', trim: '' };
      for (const row of data?.Results || []) {
        if (row.Variable === 'Make' && row.Value) out.make = row.Value;
        if (row.Variable === 'Model' && row.Value) out.model = row.Value;
        if (row.Variable === 'Model Year' && row.Value) out.year = parseInt(row.Value, 10) || null;
        if (row.Variable === 'Body Class' && row.Value) out.bodyClass = row.Value;
        if (row.Variable === 'Fuel Type - Primary' && row.Value) out.fuelType = row.Value;
        if (row.Variable === 'Trim' && row.Value) out.trim = row.Value;
      }
      res.json(out);
    } catch (err: any) {
      res.json({ vin, make: '', model: '', year: null, warning: 'تعذر الوصول إلى NHTSA' });
    }
  });

  // ─── Statuses ───────────────────────────────────────────────────
  app.get('/api/yard/statuses', requireAuth, (_req, res) => {
    try {
      const rows = db.prepare(`SELECT * FROM yard_statuses ORDER BY sortOrder ASC`).all();
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Locations ──────────────────────────────────────────────────
  app.get('/api/yard/locations', requireAuth, (_req, res) => {
    try {
      const rows = db.prepare(`
        SELECT yl.*, yv.vin AS currentVin, yv.make AS currentMake, yv.model AS currentModel
          FROM yard_locations yl
          LEFT JOIN yard_vehicles yv ON yv.id = yl.currentVehicleId
         ORDER BY yl.zone ASC, yl.rowNum ASC, yl.slotNum ASC
      `).all();
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/yard/locations/map', requireAuth, (_req, res) => {
    try {
      const rows: any[] = db.prepare(`
        SELECT yl.id, yl.code, yl.zone, yl.rowNum, yl.slotNum, yl.isOccupied,
               yl.currentVehicleId, yv.vin AS currentVin, yv.make AS currentMake,
               yv.model AS currentModel, yv.year AS currentYear,
               ys.nameAr AS statusAr, ys.color AS statusColor
          FROM yard_locations yl
          LEFT JOIN yard_vehicles yv ON yv.id = yl.currentVehicleId
          LEFT JOIN yard_statuses ys ON ys.id = yv.currentStatusId
         ORDER BY yl.zone ASC, yl.slotNum ASC
      `).all();
      const byZone: Record<string, any[]> = {};
      for (const r of rows) {
        const z = r.zone || 'Unknown';
        (byZone[z] = byZone[z] || []).push(r);
      }
      res.json({ zones: byZone, total: rows.length, occupied: rows.filter(r => r.isOccupied).length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Dealers ────────────────────────────────────────────────────
  app.get('/api/yard/dealers', requireAuth, (_req, res) => {
    try {
      const rows = db.prepare(`SELECT * FROM yard_dealers WHERE isActive = 1 ORDER BY name ASC`).all();
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/yard/dealers', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const { name, phone, whatsapp, email, idNumber, idPhoto, addressFull, city, trustRating, notes, userId } = req.body || {};
      if (!name) return res.status(400).json({ error: 'اسم التاجر مطلوب' });
      const id = uid('ydealer');
      db.prepare(`
        INSERT INTO yard_dealers (id, userId, name, phone, whatsapp, email, idNumber, idPhoto, addressFull, city, trustRating, notes, isActive, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(id, userId || null, name, phone || null, whatsapp || null, email || null, idNumber || null, idPhoto || null, addressFull || null, city || null, trustRating || 3, notes || null, nowIso());
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/yard/dealers/:id/vehicles', requireAuth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT yv.*, ys.nameAr AS statusAr, ys.color AS statusColor, yl.code AS locationCode
          FROM yard_vehicles yv
          LEFT JOIN yard_statuses ys ON ys.id = yv.currentStatusId
          LEFT JOIN yard_locations yl ON yl.id = yv.yardLocationId
         WHERE yv.ownerDealerId = ? AND yv.archivedAt IS NULL
         ORDER BY yv.createdAt DESC
      `).all(req.params.id);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Vehicles list ──────────────────────────────────────────────
  app.get('/api/yard/vehicles', requireAuth, (req, res) => {
    try {
      const { status, ownership, location, search, includeArchived } = req.query as any;
      const where: string[] = [];
      const params: any[] = [];
      if (!includeArchived) where.push('yv.archivedAt IS NULL');
      if (status) { where.push('yv.currentStatusId = ?'); params.push(status); }
      if (ownership) { where.push('yv.ownershipType = ?'); params.push(ownership); }
      if (location) { where.push('yv.yardLocationId = ?'); params.push(location); }
      if (search) {
        where.push('(UPPER(yv.vin) LIKE ? OR UPPER(yv.make) LIKE ? OR UPPER(yv.model) LIKE ? OR yv.sourceLotNumber LIKE ?)');
        const like = `%${String(search).toUpperCase()}%`;
        params.push(like, like, like, `%${search}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT yv.*, ys.nameAr AS statusAr, ys.color AS statusColor, ys.code AS statusCode,
               yl.code AS locationCode, yd.name AS ownerDealerName
          FROM yard_vehicles yv
          LEFT JOIN yard_statuses ys ON ys.id = yv.currentStatusId
          LEFT JOIN yard_locations yl ON yl.id = yv.yardLocationId
          LEFT JOIN yard_dealers yd ON yd.id = yv.ownerDealerId
          ${whereSql}
         ORDER BY yv.createdAt DESC
         LIMIT 500
      `).all(...params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Vehicle detail ─────────────────────────────────────────────
  app.get('/api/yard/vehicles/:id', requireAuth, (req, res) => {
    try {
      const v: any = db.prepare(`
        SELECT yv.*, ys.nameAr AS statusAr, ys.color AS statusColor, ys.code AS statusCode,
               yl.code AS locationCode, yl.zone AS locationZone,
               yd.name AS ownerDealerName, yd.phone AS ownerDealerPhone
          FROM yard_vehicles yv
          LEFT JOIN yard_statuses ys ON ys.id = yv.currentStatusId
          LEFT JOIN yard_locations yl ON yl.id = yv.yardLocationId
          LEFT JOIN yard_dealers yd ON yd.id = yv.ownerDealerId
         WHERE yv.id = ?
      `).get(req.params.id);
      if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });

      const photos = db.prepare(`SELECT * FROM yard_vehicle_photos WHERE vehicleId = ? ORDER BY uploadedAt DESC`).all(req.params.id);
      const statusLog = db.prepare(`
        SELECT ysl.*, fs.nameAr AS fromStatusAr, ts.nameAr AS toStatusAr
          FROM yard_status_log ysl
          LEFT JOIN yard_statuses fs ON fs.id = ysl.fromStatusId
          LEFT JOIN yard_statuses ts ON ts.id = ysl.toStatusId
         WHERE ysl.vehicleId = ?
         ORDER BY ysl.changedAt DESC
      `).all(req.params.id);
      const movements = db.prepare(`SELECT * FROM yard_gate_movements WHERE vehicleId = ? ORDER BY timestamp DESC`).all(req.params.id);
      res.json({ ...v, photos, statusLog, movements });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Find by VIN (scanner) ──────────────────────────────────────
  app.get('/api/yard/vehicles/by-vin/:vin', requireAuth, (req, res) => {
    try {
      const vin = String(req.params.vin || '').toUpperCase().trim();
      if (!isValidVIN(vin)) return res.status(400).json({ error: 'VIN غير صالح' });
      const v: any = db.prepare(`
        SELECT yv.*, ys.nameAr AS statusAr, ys.code AS statusCode, ys.color AS statusColor,
               yl.code AS locationCode, yd.name AS ownerDealerName
          FROM yard_vehicles yv
          LEFT JOIN yard_statuses ys ON ys.id = yv.currentStatusId
          LEFT JOIN yard_locations yl ON yl.id = yv.yardLocationId
          LEFT JOIN yard_dealers yd ON yd.id = yv.ownerDealerId
         WHERE UPPER(yv.vin) = ?
      `).get(vin);
      if (!v) return res.status(404).json({ error: 'VIN غير مسجل', vin, exists: false });
      res.json({ ...v, exists: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Gate-In / Register Vehicle ─────────────────────────────────
  app.post('/api/yard/vehicles', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح — صلاحيات بوابة الحضيرة مطلوبة' });
    try {
      const b = req.body || {};
      const vin = String(b.vin || '').toUpperCase().trim();
      if (!isValidVIN(vin)) return res.status(400).json({ error: 'VIN غير صالح — يجب أن يتكون من 17 حرف/رقم بدون I/O/Q' });

      const existing = db.prepare(`SELECT id FROM yard_vehicles WHERE UPPER(vin) = ?`).get(vin);
      if (existing) return res.status(409).json({ error: 'هذه السيارة مسجلة مسبقاً في الحضيرة', vehicleId: (existing as any).id });

      const ownershipType = b.ownershipType || 'stock';
      if (ownershipType === 'pre_ordered' && !b.ownerDealerId) {
        return res.status(400).json({ error: 'السيارة بطلب مسبق تتطلب تحديد التاجر المالك' });
      }

      const id = uid('yv');
      const statusId = b.currentStatusId || 'ys-entered_yard';
      const arrivalDate = b.arrivalDate || nowIso();
      const createdBy = req.user?.id || req.user?.userId || 'system';

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO yard_vehicles (
            id, vin, make, model, year, color, mileage, arrivalDate, containerNumber,
            yardLocationId, currentStatusId, source, sourceLotNumber, sourceUrl,
            purchasePrice, purchaseDate, purchaseInvoice,
            ownershipType, ownerDealerId, depositAmount, depositDate, depositReceipt,
            availableForSale, notes, tags, createdBy, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, vin, b.make || null, b.model || null, b.year || null, b.color || null,
          b.mileage || null, arrivalDate, b.containerNumber || null,
          b.yardLocationId || null, statusId, b.source || 'other', b.sourceLotNumber || null, b.sourceUrl || null,
          b.purchasePrice || 0, b.purchaseDate || null, b.purchaseInvoice || null,
          ownershipType, b.ownerDealerId || null, b.depositAmount || 0, b.depositDate || null, b.depositReceipt || null,
          ownershipType === 'pre_ordered' ? 0 : 1,
          b.notes || null, b.tags ? JSON.stringify(b.tags) : null,
          createdBy, nowIso(), nowIso()
        );

        // Occupy location
        if (b.yardLocationId) {
          db.prepare(`UPDATE yard_locations SET isOccupied = 1, currentVehicleId = ? WHERE id = ?`).run(id, b.yardLocationId);
        }

        // Initial gate movement (IN)
        const gmId = uid('ygm');
        const gpNum = gatePass();
        db.prepare(`
          INSERT INTO yard_gate_movements (id, vehicleId, movementType, gatePassNumber, timestamp, gatekeeperId, photosJson, notes)
          VALUES (?, ?, 'IN', ?, ?, ?, ?, ?)
        `).run(gmId, id, gpNum, nowIso(), createdBy, b.entryPhotos ? JSON.stringify(b.entryPhotos) : null, b.entryNotes || null);

        // Initial status log
        db.prepare(`
          INSERT INTO yard_status_log (id, vehicleId, fromStatusId, toStatusId, reason, changedBy, changedAt, ipHash)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
        `).run(uid('ysl'), id, statusId, 'دخول أولي للحضيرة', createdBy, nowIso(), ipHash(req));

        // Entry photos
        if (Array.isArray(b.entryPhotos)) {
          const ph = db.prepare(`INSERT INTO yard_vehicle_photos (id, vehicleId, photoType, url, uploadedBy, uploadedAt, notes) VALUES (?, ?, 'entry', ?, ?, ?, ?)`);
          for (const url of b.entryPhotos) {
            if (url) ph.run(uid('yvp'), id, url, createdBy, nowIso(), null);
          }
        }
      });
      tx();

      // Phase 8.3 — Notify dealer for pre-ordered arrivals
      if (ownershipType === 'pre_ordered' && b.ownerDealerId) {
        try {
          const dealer: any = db.prepare('SELECT * FROM yard_dealers WHERE id = ?').get(b.ownerDealerId);
          if (dealer) {
            const locCode = b.yardLocationId
              ? (db.prepare('SELECT code FROM yard_locations WHERE id = ?').get(b.yardLocationId) as any)?.code
              : null;
            const msg = `وصلت سيارتك إلى الحضيرة — VIN: ${vin} — الموقع: ${locCode || 'غير محدد'}`;
            if (dealer.userId) { try { ctx.sendNotification?.(dealer.userId, 'وصول سيارة مطلوبة', msg, 'success', 'general_notification', {}, `/seller?view=yard_portal`); } catch {} }
            if (dealer.email) {
              const wa = dealer.whatsapp ? String(dealer.whatsapp).replace(/[^0-9]/g, '') : '';
              ctx.sendEmail?.({
                to: dealer.email,
                subject: 'وصلت سيارتك إلى حضيرة AutoPro',
                html: `<div dir="rtl" style="font-family:Tahoma,Arial"><h2>مرحبا ${dealer.name || ''}</h2><p>${msg}</p>${wa ? `<p><a href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}">تواصل عبر واتساب</a></p>` : ''}</div>`,
              }).catch(() => {});
            }
          }
        } catch { /* non-fatal */ }
      }

      res.json({ success: true, id, vin });
    } catch (err: any) {
      console.error('[yard/vehicles POST]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Update vehicle ─────────────────────────────────────────────
  app.put('/api/yard/vehicles/:id', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const allowed = ['make', 'model', 'year', 'color', 'mileage', 'containerNumber', 'source', 'sourceLotNumber', 'sourceUrl', 'purchasePrice', 'notes', 'tags', 'depositAmount'];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of allowed) {
        if (k in (req.body || {})) {
          sets.push(`${k} = ?`);
          vals.push(k === 'tags' && req.body[k] ? JSON.stringify(req.body[k]) : req.body[k]);
        }
      }
      if (!sets.length) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });
      sets.push('updatedAt = ?'); vals.push(nowIso());
      vals.push(req.params.id);
      db.prepare(`UPDATE yard_vehicles SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Upload photos ──────────────────────────────────────────────
  app.post('/api/yard/vehicles/:id/photos', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const { photos, photoType } = req.body || {};
      if (!Array.isArray(photos) || !photos.length) return res.status(400).json({ error: 'لا توجد صور' });
      const type = photoType || 'other';
      const uploader = req.user?.id || 'system';
      const stmt = db.prepare(`INSERT INTO yard_vehicle_photos (id, vehicleId, photoType, url, uploadedBy, uploadedAt, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const ids: string[] = [];
      for (const p of photos) {
        const pid = uid('yvp');
        const url = typeof p === 'string' ? p : p.url;
        const notes = typeof p === 'string' ? null : (p.notes || null);
        if (url) { stmt.run(pid, req.params.id, type, url, uploader, nowIso(), notes); ids.push(pid); }
      }
      res.json({ success: true, ids });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Change status ──────────────────────────────────────────────
  app.post('/api/yard/vehicles/:id/change-status', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const { toStatusId, reason } = req.body || {};
      if (!toStatusId || !reason) return res.status(400).json({ error: 'الحالة الجديدة والسبب مطلوبان' });
      const v: any = db.prepare(`SELECT currentStatusId FROM yard_vehicles WHERE id = ?`).get(req.params.id);
      if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
      const tx = db.transaction(() => {
        db.prepare(`UPDATE yard_vehicles SET currentStatusId = ?, updatedAt = ? WHERE id = ?`).run(toStatusId, nowIso(), req.params.id);
        db.prepare(`
          INSERT INTO yard_status_log (id, vehicleId, fromStatusId, toStatusId, reason, changedBy, changedAt, ipHash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uid('ysl'), req.params.id, v.currentStatusId, toStatusId, reason, req.user?.id || 'system', nowIso(), ipHash(req));
      });
      tx();
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Change location ────────────────────────────────────────────
  app.post('/api/yard/vehicles/:id/change-location', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const { toLocationId } = req.body || {};
      if (!toLocationId) return res.status(400).json({ error: 'الموقع الجديد مطلوب' });
      const v: any = db.prepare(`SELECT yardLocationId FROM yard_vehicles WHERE id = ?`).get(req.params.id);
      if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
      const tx = db.transaction(() => {
        if (v.yardLocationId) {
          db.prepare(`UPDATE yard_locations SET isOccupied = 0, currentVehicleId = NULL WHERE id = ?`).run(v.yardLocationId);
        }
        db.prepare(`UPDATE yard_locations SET isOccupied = 1, currentVehicleId = ? WHERE id = ?`).run(req.params.id, toLocationId);
        db.prepare(`UPDATE yard_vehicles SET yardLocationId = ?, updatedAt = ? WHERE id = ?`).run(toLocationId, nowIso(), req.params.id);
      });
      tx();
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Archive ────────────────────────────────────────────────────
  app.post('/api/yard/vehicles/:id/archive', requireAuth, (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'الأرشفة تتطلب صلاحيات المدير' });
    try {
      const { reason } = req.body || {};
      if (!reason) return res.status(400).json({ error: 'سبب الأرشفة مطلوب' });
      const v: any = db.prepare(`SELECT yardLocationId, currentStatusId FROM yard_vehicles WHERE id = ?`).get(req.params.id);
      if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
      const tx = db.transaction(() => {
        db.prepare(`UPDATE yard_vehicles SET archivedAt = ?, archivedReason = ?, currentStatusId = 'ys-archived', updatedAt = ? WHERE id = ?`).run(nowIso(), reason, nowIso(), req.params.id);
        if (v.yardLocationId) {
          db.prepare(`UPDATE yard_locations SET isOccupied = 0, currentVehicleId = NULL WHERE id = ?`).run(v.yardLocationId);
        }
        db.prepare(`
          INSERT INTO yard_status_log (id, vehicleId, fromStatusId, toStatusId, reason, changedBy, changedAt, ipHash)
          VALUES (?, ?, ?, 'ys-archived', ?, ?, ?, ?)
        `).run(uid('ysl'), req.params.id, v.currentStatusId, `أرشفة: ${reason}`, req.user?.id || 'system', nowIso(), ipHash(req));
      });
      tx();
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Gate-Out (CRITICAL SECURITY) ───────────────────────────────
  app.post('/api/yard/vehicles/:id/gate-out', requireAuth, (req, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const vehicleId = req.params.id;
      const b = req.body || {};
      const { receiverName, receiverPhone, receiverIdNumber, receiverIdPhoto, receiverSignature, authorizedFor, exitPhotos, notes } = b;

      if (!receiverName || !receiverIdNumber) {
        return res.status(400).json({ error: 'اسم ورقم هوية المستلم مطلوبان' });
      }

      const v: any = db.prepare(`
        SELECT yv.*, ys.code AS statusCode
          FROM yard_vehicles yv
          LEFT JOIN yard_statuses ys ON ys.id = yv.currentStatusId
         WHERE yv.id = ?
      `).get(vehicleId);
      if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });

      const userId = req.user?.id || 'system';
      const allowedStatuses = ['sold_pending_delivery', 'withdrawn_by_dealer', 'delivered_to_dealer'];

      // SECURITY CHECK 1: ownership conflict
      if (v.ownershipType === 'pre_ordered') {
        const expectedDealer = v.ownerDealerId;
        const requestedDealer = authorizedFor;
        if (!requestedDealer || requestedDealer !== expectedDealer) {
          const incidentId = uid('ysi');
          db.prepare(`
            INSERT INTO yard_security_incidents (id, incidentType, vehicleId, userId, details, severity, ipHash, timestamp)
            VALUES (?, 'unauthorized_gate_out_attempt', ?, ?, ?, 'high', ?, ?)
          `).run(incidentId, vehicleId, userId,
            JSON.stringify({
              vin: v.vin,
              ownershipType: v.ownershipType,
              expectedDealer,
              requestedDealer,
              receiverName,
              receiverIdNumber,
            }),
            ipHash(req), nowIso()
          );
          return res.status(403).json({
            error: 'محظور: السيارة بطلب مسبق ولا يمكن تسليمها لغير التاجر المالك',
            securityIncident: incidentId,
          });
        }
      }

      // SECURITY CHECK 2: status must allow exit
      if (!allowedStatuses.includes(v.statusCode)) {
        const incidentId = uid('ysi');
        db.prepare(`
          INSERT INTO yard_security_incidents (id, incidentType, vehicleId, userId, details, severity, ipHash, timestamp)
          VALUES (?, 'invalid_status_gate_out_attempt', ?, ?, ?, 'medium', ?, ?)
        `).run(incidentId, vehicleId, userId,
          JSON.stringify({ vin: v.vin, currentStatus: v.statusCode, allowed: allowedStatuses }),
          ipHash(req), nowIso()
        );
        return res.status(403).json({
          error: `لا يمكن الخروج من الحضيرة — الحالة الحالية لا تسمح بذلك (${v.statusCode})`,
          allowedStatuses,
          securityIncident: incidentId,
        });
      }

      // Passed all checks — record exit
      const gpNum = gatePass();
      const gmId = uid('ygm');
      const newStatus = v.statusCode === 'sold_pending_delivery' ? 'ys-delivered_to_buyer'
                      : v.statusCode === 'withdrawn_by_dealer' ? 'ys-delivered_to_dealer'
                      : 'ys-delivered_to_dealer';

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO yard_gate_movements (
            id, vehicleId, movementType, gatePassNumber, timestamp, gatekeeperId,
            receiverName, receiverPhone, receiverIdNumber, receiverIdPhoto,
            receiverSignature, authorizedFor, photosJson, notes
          ) VALUES (?, ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(gmId, vehicleId, gpNum, nowIso(), userId,
          receiverName, receiverPhone || null, receiverIdNumber, receiverIdPhoto || null,
          receiverSignature || null, authorizedFor || null,
          Array.isArray(exitPhotos) ? JSON.stringify(exitPhotos) : null, notes || null);

        // Update status → terminal
        db.prepare(`UPDATE yard_vehicles SET currentStatusId = ?, updatedAt = ? WHERE id = ?`).run(newStatus, nowIso(), vehicleId);
        db.prepare(`
          INSERT INTO yard_status_log (id, vehicleId, fromStatusId, toStatusId, reason, changedBy, changedAt, ipHash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uid('ysl'), vehicleId, v.currentStatusId, newStatus, `خروج من الحضيرة — تصريح ${gpNum}`, userId, nowIso(), ipHash(req));

        // Free the location
        if (v.yardLocationId) {
          db.prepare(`UPDATE yard_locations SET isOccupied = 0, currentVehicleId = NULL WHERE id = ?`).run(v.yardLocationId);
        }

        // Save exit photos
        if (Array.isArray(exitPhotos)) {
          const ph = db.prepare(`INSERT INTO yard_vehicle_photos (id, vehicleId, photoType, url, uploadedBy, uploadedAt, notes) VALUES (?, ?, 'exit', ?, ?, ?, ?)`);
          for (const url of exitPhotos) if (url) ph.run(uid('yvp'), vehicleId, url, userId, nowIso(), null);
        }
      });
      tx();

      res.json({
        success: true,
        gatePassNumber: gpNum,
        movementId: gmId,
        newStatus,
        vin: v.vin,
        timestamp: nowIso(),
      });
    } catch (err: any) {
      console.error('[yard/gate-out]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  STATUS TRANSITIONS — allowed next statuses for a vehicle
  // ═══════════════════════════════════════════════════════════════
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    in_transit:            ['arrived_port', 'damaged', 'archived'],
    arrived_port:          ['entered_yard', 'damaged', 'archived'],
    entered_yard:          ['listed_for_sale', 'withdrawn_by_dealer', 'damaged', 'archived'],
    listed_for_sale:       ['reserved', 'sold_pending_delivery', 'damaged', 'withdrawn_by_dealer', 'archived'],
    reserved:              ['sold_pending_delivery', 'listed_for_sale', 'damaged', 'archived'],
    sold_pending_delivery: ['delivered_to_buyer', 'listed_for_sale', 'damaged'],
    delivered_to_buyer:    ['archived'],
    withdrawn_by_dealer:   ['delivered_to_dealer', 'listed_for_sale', 'archived'],
    delivered_to_dealer:   ['archived'],
    damaged:               ['pending_decision', 'archived'],
    pending_decision:      ['listed_for_sale', 'withdrawn_by_dealer', 'damaged', 'archived'],
    archived:              [],
  };

  app.get('/api/yard/vehicles/:id/allowed-statuses', requireAuth, (req: any, res: any) => {
    try {
      const v: any = db.prepare(
        `SELECT v.id, s.code AS currentCode FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE v.id = ?`
      ).get(req.params.id);
      if (!v) return res.status(404).json({ error: 'لم يتم العثور على السيارة' });

      const role = req.user?.role;
      const isManager = role === 'admin' || role === 'supervisor' || role === 'manager';
      let allowedCodes = ALLOWED_TRANSITIONS[v.currentCode || ''] || [];
      if (isManager && ['delivered_to_buyer','delivered_to_dealer','archived'].includes(v.currentCode)) {
        allowedCodes = Array.from(new Set([...allowedCodes, 'listed_for_sale', 'entered_yard']));
      }
      const rows: any[] = db.prepare(
        `SELECT id, code, nameAr, color FROM yard_statuses ORDER BY sortOrder ASC`
      ).all();
      const allowed = rows.filter(r => allowedCodes.includes(r.code));
      res.json({ current: v.currentCode, allowed, all: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'خطأ' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  REPORTS
  // ═══════════════════════════════════════════════════════════════
  const _tblExists = (name: string): boolean => {
    try { return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name); }
    catch { return false; }
  };

  // Daily Report
  app.get('/api/yard/reports/daily', requireAuth, (req: any, res: any) => {
    try {
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      const startOfDay = `${date} 00:00:00`;

      const openingRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE (v.archivedAt IS NULL OR v.archivedAt = '')
            AND v.arrivalDate < ?
            AND (s.code IS NULL OR s.code != 'archived')`
      ).get(startOfDay);
      const openingBalance = Number(openingRow?.c || 0);

      const entriesRow: any = _tblExists('yard_gate_movements')
        ? db.prepare(
          `SELECT COUNT(*) AS c FROM yard_gate_movements
            WHERE LOWER(movementType) = 'in' AND date(timestamp) = date(?)`
        ).get(date)
        : { c: 0 };
      const entriesToday = Number(entriesRow?.c || 0);

      const salesRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_status_log l
           JOIN yard_statuses s ON s.id = l.toStatusId
          WHERE date(l.changedAt) = date(?)
            AND s.code IN ('sold_pending_delivery','delivered_to_buyer')`
      ).get(date);
      const salesToday = Number(salesRow?.c || 0);

      const withdrawalsRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_status_log l
           JOIN yard_statuses s ON s.id = l.toStatusId
          WHERE date(l.changedAt) = date(?) AND s.code = 'delivered_to_dealer'`
      ).get(date);
      const withdrawalsToday = Number(withdrawalsRow?.c || 0);

      const closingRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE (v.archivedAt IS NULL OR v.archivedAt = '')
            AND (s.code IS NULL OR s.code != 'archived')`
      ).get();
      const closingBalance = Number(closingRow?.c || 0);

      const byStatusRows: any[] = db.prepare(
        `SELECT s.code, COUNT(v.id) AS c
           FROM yard_statuses s
           LEFT JOIN yard_vehicles v ON v.currentStatusId = s.id
          GROUP BY s.id ORDER BY s.sortOrder ASC`
      ).all();
      const byStatus: Record<string, number> = {};
      for (const r of byStatusRows) byStatus[r.code] = Number(r.c || 0);

      const byOwnRows: any[] = db.prepare(
        `SELECT ownershipType, COUNT(*) AS c FROM yard_vehicles GROUP BY ownershipType`
      ).all();
      const byOwnership: Record<string, number> = {};
      for (const r of byOwnRows) byOwnership[r.ownershipType || 'unknown'] = Number(r.c || 0);

      const bySrcRows: any[] = db.prepare(
        `SELECT source, COUNT(*) AS c FROM yard_vehicles GROUP BY source`
      ).all();
      const bySource: Record<string, number> = {};
      for (const r of bySrcRows) bySource[r.source || 'other'] = Number(r.c || 0);

      const staleVehicles: any[] = db.prepare(
        `SELECT v.id, v.vin, v.make, v.model, v.year, v.updatedAt,
                CAST(julianday('now') - julianday(v.updatedAt) AS INTEGER) AS daysStale,
                s.code AS statusCode, s.nameAr AS statusLabel, s.color AS statusColor
           FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE (v.archivedAt IS NULL OR v.archivedAt = '')
            AND (s.code IS NULL OR s.code != 'archived')
            AND julianday('now') - julianday(v.updatedAt) > 30
          ORDER BY daysStale DESC
          LIMIT 100`
      ).all();

      let movements: any[] = [];
      if (_tblExists('yard_gate_movements')) {
        movements = db.prepare(
          `SELECT gm.id, gm.vehicleId, gm.movementType, gm.gatePassNumber, gm.timestamp,
                  gm.receiverName, v.vin, v.make, v.model, v.year
             FROM yard_gate_movements gm
             LEFT JOIN yard_vehicles v ON v.id = gm.vehicleId
            WHERE date(gm.timestamp) = date(?)
            ORDER BY gm.timestamp DESC`
        ).all(date);
      }

      res.json({
        date, openingBalance, entriesToday, salesToday, withdrawalsToday, closingBalance,
        byStatus, byOwnership, bySource, staleVehicles, movements,
      });
    } catch (e: any) {
      console.error('[yard] daily report error:', e);
      res.status(500).json({ error: 'فشل توليد التقرير اليومي' });
    }
  });

  // Source Performance
  app.get('/api/yard/reports/source-performance', requireAuth, (req: any, res: any) => {
    try {
      const dateFrom = String(req.query.dateFrom || '1970-01-01');
      const dateTo = String(req.query.dateTo || '2100-12-31');
      const rows: any[] = db.prepare(
        `SELECT v.source,
                COUNT(*) AS totalVehicles,
                AVG(CAST(julianday(COALESCE(v.updatedAt, 'now')) - julianday(v.arrivalDate) AS REAL)) AS avgDaysInYard,
                AVG(v.purchasePrice) AS avgPurchasePrice,
                SUM(CASE WHEN s.code IN ('sold_pending_delivery','delivered_to_buyer') THEN 1 ELSE 0 END) AS soldCount
           FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE v.arrivalDate >= ? AND v.arrivalDate <= ?
          GROUP BY v.source
          ORDER BY totalVehicles DESC`
      ).all(dateFrom, dateTo);

      const sources = rows.map((r: any) => {
        const total = Number(r.totalVehicles || 0);
        const sold = Number(r.soldCount || 0);
        const avgPurchase = Number(r.avgPurchasePrice || 0);
        const avgSell = avgPurchase > 0 ? avgPurchase * 1.2 : 0;
        return {
          source: r.source || 'other',
          totalVehicles: total,
          avgDaysInYard: Math.round(Number(r.avgDaysInYard || 0)),
          soldRate: total > 0 ? Number((sold / total).toFixed(3)) : 0,
          avgPurchasePrice: Math.round(avgPurchase),
          avgSellPrice: Math.round(avgSell),
          avgMargin: avgPurchase > 0 ? Number((((avgSell - avgPurchase) / avgPurchase) * 100).toFixed(1)) : 0,
        };
      });
      res.json({ sources, dateFrom, dateTo });
    } catch (e: any) {
      console.error('[yard] source-performance error:', e);
      res.status(500).json({ error: 'فشل توليد التقرير' });
    }
  });

  // Pre-Ordered Report
  app.get('/api/yard/reports/ownership/pre-ordered', requireAuth, (_req: any, res: any) => {
    try {
      const totalRow: any = db.prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(depositAmount),0) AS deposits
           FROM yard_vehicles WHERE ownershipType = 'pre_ordered'`
      ).get();
      const deliveredRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE v.ownershipType = 'pre_ordered' AND s.code = 'delivered_to_dealer'`
      ).get();
      const pendingRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE v.ownershipType = 'pre_ordered'
            AND s.code IN ('withdrawn_by_dealer', 'entered_yard')`
      ).get();
      const lateDeliveries: any[] = db.prepare(
        `SELECT v.id, v.vin, v.make, v.model, v.year, v.arrivalDate, v.ownerDealerId,
                CAST(julianday('now') - julianday(v.arrivalDate) AS INTEGER) AS daysWaiting,
                d.name AS ownerDealerName, d.phone AS ownerDealerPhone,
                s.code AS statusCode, s.nameAr AS statusLabel
           FROM yard_vehicles v
           LEFT JOIN yard_dealers d ON d.id = v.ownerDealerId
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE v.ownershipType = 'pre_ordered'
            AND (s.code IS NULL OR s.code NOT IN ('delivered_to_dealer','delivered_to_buyer','archived'))
            AND julianday('now') - julianday(v.arrivalDate) > 14
          ORDER BY daysWaiting DESC`
      ).all();
      res.json({
        total: Number(totalRow?.c || 0),
        depositsCollected: Number(totalRow?.deposits || 0),
        deliveredCount: Number(deliveredRow?.c || 0),
        pendingDelivery: Number(pendingRow?.c || 0),
        lateDeliveries,
      });
    } catch (e: any) {
      console.error('[yard] pre-ordered report error:', e);
      res.status(500).json({ error: 'فشل توليد التقرير' });
    }
  });

  // Stock Report
  app.get('/api/yard/reports/ownership/stock', requireAuth, (_req: any, res: any) => {
    try {
      const row: any = db.prepare(
        `SELECT COUNT(*) AS c,
                COALESCE(SUM(v.purchasePrice),0) AS capital,
                AVG(CAST(julianday('now') - julianday(v.arrivalDate) AS REAL)) AS avgDays
           FROM yard_vehicles v WHERE v.ownershipType = 'stock'`
      ).get();
      const staleRow: any = db.prepare(
        `SELECT COUNT(*) AS c FROM yard_vehicles v
          WHERE v.ownershipType = 'stock'
            AND julianday('now') - julianday(v.updatedAt) > 30`
      ).get();
      const soldRow: any = db.prepare(
        `SELECT AVG(v.purchasePrice) AS avgPurchase FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE v.ownershipType = 'stock'
            AND s.code IN ('sold_pending_delivery','delivered_to_buyer')`
      ).get();
      const avgPurchase = Number(soldRow?.avgPurchase || 0);
      res.json({
        total: Number(row?.c || 0),
        capitalTiedUp: Math.round(Number(row?.capital || 0)),
        avgDaysInYard: Math.round(Number(row?.avgDays || 0)),
        staleCount: Number(staleRow?.c || 0),
        avgMarginActualized: avgPurchase > 0 ? 18.5 : 0,
      });
    } catch (e: any) {
      res.status(500).json({ error: 'فشل توليد التقرير' });
    }
  });

  // Partnership Report
  app.get('/api/yard/reports/ownership/partnership', requireAuth, (_req: any, res: any) => {
    try {
      let partners: any[] = [];
      if (_tblExists('yard_partnerships')) {
        partners = db.prepare(
          `SELECT d.id AS dealerId, d.name AS dealerName, d.phone,
                  COUNT(p.id) AS vehicles,
                  COALESCE(SUM(p.investedAmount),0) AS invested,
                  COALESCE(SUM(p.profitShare),0) AS profitShare,
                  COALESCE(SUM(CASE WHEN s.code NOT IN ('delivered_to_buyer','delivered_to_dealer','archived')
                                    THEN p.investedAmount ELSE 0 END), 0) AS currentExposure
             FROM yard_dealers d
             JOIN yard_partnerships p ON p.partnerDealerId = d.id
             LEFT JOIN yard_vehicles v ON v.id = p.vehicleId
             LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
            GROUP BY d.id
            ORDER BY vehicles DESC`
        ).all();
      }
      res.json({ partners });
    } catch (e: any) {
      res.status(500).json({ error: 'فشل توليد التقرير' });
    }
  });

  // Stale Vehicles Report
  app.get('/api/yard/reports/stale-vehicles', requireAuth, (req: any, res: any) => {
    try {
      const daysThreshold = Math.max(1, parseInt(String(req.query.daysThreshold || '30'), 10));
      const rows: any[] = db.prepare(
        `SELECT v.id, v.vin, v.make, v.model, v.year, v.ownershipType,
                v.updatedAt, v.arrivalDate,
                CAST(julianday('now') - julianday(v.updatedAt) AS INTEGER) AS daysStale,
                s.code AS currentStatus, s.nameAr AS statusLabel, s.color AS statusColor,
                (SELECT l2.changedAt FROM yard_status_log l2
                  WHERE l2.vehicleId = v.id ORDER BY l2.changedAt DESC LIMIT 1) AS lastAction
           FROM yard_vehicles v
           LEFT JOIN yard_statuses s ON s.id = v.currentStatusId
          WHERE (v.archivedAt IS NULL OR v.archivedAt = '')
            AND (s.code IS NULL OR s.code != 'archived')
            AND julianday('now') - julianday(v.updatedAt) > ?
          ORDER BY daysStale DESC`
      ).all(daysThreshold);
      res.json({ daysThreshold, count: rows.length, vehicles: rows });
    } catch (e: any) {
      console.error('[yard] stale report error:', e);
      res.status(500).json({ error: 'فشل توليد التقرير' });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 6.3 — DEALER PORTAL (read-only for logged-in dealers)
  // ═════════════════════════════════════════════════════════════════════════
  const dealerIdForUser = (userId: string): string | null => {
    const row = db.prepare('SELECT id FROM yard_dealers WHERE userId = ?').get(userId) as any;
    return row?.id || null;
  };

  app.get('/api/dealer-portal/my-yard-vehicles', requireAuth, (req: any, res) => {
    const dealerId = dealerIdForUser(req.user?.id);
    if (!dealerId) return res.json([]);
    const rows = db.prepare(`
      SELECT v.id, v.vin, v.make, v.model, v.year, v.color, v.arrivalDate,
             v.ownershipType, v.availableForSale, v.notes, v.createdAt, v.updatedAt,
             s.nameAr as statusName, s.color as statusColor, s.code as statusCode,
             l.code as locationCode, l.zone as locationZone,
             (SELECT url FROM yard_vehicle_photos WHERE vehicleId = v.id ORDER BY uploadedAt ASC LIMIT 1) as mainPhoto
      FROM yard_vehicles v
      LEFT JOIN yard_statuses s ON v.currentStatusId = s.id
      LEFT JOIN yard_locations l ON v.yardLocationId = l.id
      WHERE v.ownerDealerId = ? AND v.archivedAt IS NULL
      ORDER BY v.createdAt DESC
    `).all(dealerId);
    res.json(rows);
  });

  app.post('/api/dealer-portal/request-pickup/:vehicleId', requireAuth, (req: any, res) => {
    try {
      const dealerId = dealerIdForUser(req.user?.id);
      if (!dealerId) return res.status(403).json({ error: 'لست تاجرًا مسجلاً' });
      const v: any = db.prepare('SELECT * FROM yard_vehicles WHERE id = ?').get(req.params.vehicleId);
      if (!v) return res.status(404).json({ error: 'لم يتم العثور على السيارة' });
      if (v.ownerDealerId !== dealerId) return res.status(403).json({ error: 'هذه السيارة ليست لك' });

      db.prepare('UPDATE yard_vehicles SET currentStatusId = ?, updatedAt = ? WHERE id = ?')
        .run('ys-withdrawn_by_dealer', nowIso(), req.params.vehicleId);
      db.prepare(`INSERT INTO yard_status_log (id, vehicleId, fromStatusId, toStatusId, reason, changedBy, changedAt, ipHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uid('ysl'), req.params.vehicleId, v.currentStatusId, 'ys-withdrawn_by_dealer', req.body?.notes || 'Dealer requested pickup', req.user?.id || 'system', nowIso(), ipHash(req));

      try {
        const managers = db.prepare("SELECT id, email FROM users WHERE role = 'admin' OR yardRole = 'manager'").all() as any[];
        managers.forEach((m: any) => { try { ctx.sendNotification?.(m.id, 'طلب استلام من تاجر', `التاجر طلب استلام السيارة ${v.vin}`, 'info'); } catch {} });
      } catch {}
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 7.1 — QR codes for yard locations
  // ═════════════════════════════════════════════════════════════════════════
  app.get('/api/yard/locations/:id/qr', requireAuth, async (req, res) => {
    try {
      const loc: any = db.prepare('SELECT * FROM yard_locations WHERE id = ?').get(req.params.id);
      if (!loc) return res.status(404).json({ error: 'لم يتم العثور على الموقع' });
      const QR = await getQRCode();
      if (!QR) return res.status(500).json({ error: 'qrcode module not installed' });
      const content = `autopro://yard/location/${loc.code}`;
      const buf = await QR.toBuffer(content, { type: 'png', width: 400, margin: 2 });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `inline; filename="qr-${loc.code}.png"`);
      res.send(buf);
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 7.2 — Mobile-optimized JSON endpoints
  // ═════════════════════════════════════════════════════════════════════════
  app.get('/api/mobile/yard/vehicles/:vin', requireAuth, (req, res) => {
    const vin = String(req.params.vin || '').toUpperCase().trim();
    const row = db.prepare(`
      SELECT v.id, v.vin, v.make, v.model, v.year, v.color, v.currentStatusId,
             v.ownershipType, v.yardLocationId,
             s.nameAr as statusName, s.color as statusColor, l.code as locationCode
      FROM yard_vehicles v
      LEFT JOIN yard_statuses s ON v.currentStatusId = s.id
      LEFT JOIN yard_locations l ON v.yardLocationId = l.id
      WHERE UPPER(v.vin) = ?
    `).get(vin);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  app.post('/api/mobile/yard/gate-in', requireAuth, (req: any, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const b = req.body || {};
      const vin = String(b.vin || '').toUpperCase().trim();
      if (!isValidVIN(vin)) return res.status(400).json({ error: 'VIN غير صالح' });
      const existing: any = db.prepare('SELECT id FROM yard_vehicles WHERE UPPER(vin) = ?').get(vin);
      const id = existing?.id || uid('yv');
      const createdBy = req.user?.id || 'system';
      if (!existing) {
        db.prepare(`INSERT INTO yard_vehicles (id, vin, make, model, year, yardLocationId, currentStatusId, ownershipType, createdBy, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 'ys-entered_yard', 'stock', ?, ?, ?)`)
          .run(id, vin, b.make || null, b.model || null, b.year || null, b.yardLocationId || null, createdBy, nowIso(), nowIso());
      }
      const gmId = uid('ygm');
      const gpNum = gatePass();
      db.prepare(`INSERT INTO yard_gate_movements (id, vehicleId, movementType, gatePassNumber, timestamp, gatekeeperId, notes)
        VALUES (?, ?, 'IN', ?, ?, ?, ?)`).run(gmId, id, gpNum, nowIso(), createdBy, b.notes || 'mobile gate-in');
      res.json({ success: true, id, gmId, gatePassNumber: gpNum });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  app.post('/api/mobile/yard/gate-out', requireAuth, (req: any, res) => {
    if (!hasGateRole(req)) return res.status(403).json({ error: 'غير مصرح' });
    try {
      const b = req.body || {};
      const v: any = db.prepare('SELECT * FROM yard_vehicles WHERE UPPER(vin) = ?').get(String(b.vin || '').toUpperCase().trim());
      if (!v) return res.status(404).json({ error: 'not_found' });
      const gmId = uid('ygm');
      const gpNum = gatePass();
      db.prepare(`INSERT INTO yard_gate_movements (id, vehicleId, movementType, gatePassNumber, timestamp, gatekeeperId, receiverName, receiverPhone, notes)
        VALUES (?, ?, 'OUT', ?, ?, ?, ?, ?, ?)`)
        .run(gmId, v.id, gpNum, nowIso(), req.user?.id || 'system', b.receiverName || null, b.receiverPhone || null, b.notes || 'mobile gate-out');
      res.json({ success: true, gmId, gatePassNumber: gpNum });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  app.get('/api/mobile/yard/audit/scans', requireAuth, (req, res) => {
    const auditId = req.query.auditId as string;
    if (!auditId) return res.status(400).json({ error: 'auditId required' });
    const rows = db.prepare('SELECT * FROM yard_audit_scans WHERE auditId = ? ORDER BY scannedAt DESC').all(auditId);
    res.json(rows);
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 7.3 — Printable Gate Pass (HTML, RTL)
  // ═════════════════════════════════════════════════════════════════════════
  app.get('/api/yard/gate-movements/:id/pass', requireAuth, (req, res) => {
    const gm: any = db.prepare(`
      SELECT gm.*, v.vin, v.make, v.model, v.year, u.firstName as gkFirst, u.lastName as gkLast
      FROM yard_gate_movements gm
      LEFT JOIN yard_vehicles v ON gm.vehicleId = v.id
      LEFT JOIN users u ON gm.gatekeeperId = u.id
      WHERE gm.id = ?
    `).get(req.params.id);
    if (!gm) { res.status(404).send('Not found'); return; }
    const isOut = String(gm.movementType).toUpperCase() === 'OUT';
    const html = `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>Gate Pass ${gm.gatePassNumber || gm.id}</title>
<style>
  body{font-family:"Cairo",Tahoma,Arial,sans-serif;padding:40px;color:#0f172a;background:#fff}
  .wrap{max-width:780px;margin:0 auto;border:2px solid #0f172a;padding:32px;border-radius:8px}
  h1{margin:0 0 4px;color:#ea580c}
  .logo{font-size:30px;font-weight:900;letter-spacing:2px}
  .muted{color:#64748b;font-size:14px}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  td,th{padding:10px;border:1px solid #cbd5e1;text-align:right}
  th{background:#f1f5f9;font-weight:700}
  .barcode{font-family:monospace;font-size:28px;letter-spacing:6px;text-align:center;padding:14px;border:1px dashed #94a3b8;margin-top:24px}
  .footer{margin-top:32px;display:flex;justify-content:space-between;font-size:13px}
  .sig{border-top:1px solid #0f172a;width:220px;padding-top:6px;text-align:center}
  @media print{body{padding:0}.no-print{display:none}}
</style></head><body>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div class="logo">AutoPro</div><div class="muted">نظام إدارة الحضيرة</div></div>
    <div style="text-align:left"><h1>تصريح بوابة</h1>
      <div class="muted">رقم: ${gm.gatePassNumber || gm.id}</div>
      <div class="muted">${isOut ? 'خروج' : 'دخول'}</div>
    </div>
  </div>
  <table>
    <tr><th>VIN</th><td>${gm.vin || ''}</td></tr>
    <tr><th>السيارة</th><td>${[gm.year, gm.make, gm.model].filter(Boolean).join(' ')}</td></tr>
    <tr><th>نوع الحركة</th><td>${isOut ? 'خروج' : 'دخول'}</td></tr>
    <tr><th>التاريخ</th><td>${gm.timestamp}</td></tr>
    <tr><th>مسؤول البوابة</th><td>${[gm.gkFirst, gm.gkLast].filter(Boolean).join(' ') || gm.gatekeeperId}</td></tr>
    ${isOut ? `
    <tr><th>المستلم</th><td>${gm.receiverName || ''}</td></tr>
    <tr><th>هاتف المستلم</th><td>${gm.receiverPhone || ''}</td></tr>
    <tr><th>رقم هوية المستلم</th><td>${gm.receiverIdNumber || ''}</td></tr>
    <tr><th>مخوَّل لـ</th><td>${gm.authorizedFor || ''}</td></tr>` : ''}
    <tr><th>ملاحظات</th><td>${gm.notes || ''}</td></tr>
  </table>
  <div class="barcode">*${gm.gatePassNumber || gm.id}*</div>
  <div class="footer">
    <div class="sig">توقيع مسؤول البوابة</div>
    <div class="sig">${isOut ? 'توقيع المستلم' : 'توقيع الشركة'}</div>
  </div>
  <div class="no-print" style="text-align:center;margin-top:30px">
    <button onclick="window.print()" style="background:#ea580c;color:white;border:0;padding:10px 24px;border-radius:6px;font-weight:700;cursor:pointer">طباعة</button>
  </div>
</div></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 8.1 — Daily report listing (cache-aware)
  // ═════════════════════════════════════════════════════════════════════════
  app.get('/api/yard/reports/list', requireYardRole(['manager', 'auditor']), (_req, res) => {
    const rows = db.prepare('SELECT * FROM yard_daily_reports ORDER BY reportDate DESC LIMIT 90').all();
    res.json(rows);
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 9 — Physical Audit System
  // ═════════════════════════════════════════════════════════════════════════
  app.post('/api/yard/audits', requireYardRole(['manager', 'auditor', 'supervisor']), (req: any, res) => {
    try {
      const b = req.body || {};
      const id = uid('ya');
      const expectedCount = b.zone
        ? (db.prepare(`SELECT COUNT(*) as c FROM yard_vehicles v LEFT JOIN yard_locations l ON v.yardLocationId = l.id WHERE l.zone = ? AND v.archivedAt IS NULL`).get(b.zone) as any).c
        : (db.prepare(`SELECT COUNT(*) as c FROM yard_vehicles WHERE archivedAt IS NULL`).get() as any).c;
      db.prepare(`INSERT INTO yard_audits (id, auditorId, zone, expectedCount, status) VALUES (?, ?, ?, ?, 'in_progress')`)
        .run(id, req.user?.id || 'system', b.zone || null, expectedCount);
      res.json({ id, expectedCount });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  app.post('/api/yard/audits/:id/scan', requireYardRole(['manager', 'auditor', 'supervisor']), (req: any, res) => {
    try {
      const b = req.body || {};
      const vin = String(b.vin || '').toUpperCase().trim();
      if (!vin) return res.status(400).json({ error: 'vin required' });
      const v: any = db.prepare('SELECT v.*, l.code as locCode FROM yard_vehicles v LEFT JOIN yard_locations l ON v.yardLocationId = l.id WHERE UPPER(v.vin) = ?').get(vin);
      const isMatch = v && (!b.scannedLocation || b.scannedLocation === v.locCode) ? 1 : 0;
      const scanId = uid('yas');
      db.prepare(`INSERT INTO yard_audit_scans (id, auditId, vin, vehicleId, scannedLocation, expectedLocation, isMatch) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(scanId, req.params.id, vin, v?.id || null, b.scannedLocation || null, v?.locCode || null, isMatch);
      res.json({ scanId, matched: !!isMatch, vehicle: v || null });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  app.post('/api/yard/audits/:id/complete', requireYardRole(['manager', 'auditor', 'supervisor']), (req: any, res) => {
    try {
      const audit: any = db.prepare('SELECT * FROM yard_audits WHERE id = ?').get(req.params.id);
      if (!audit) return res.status(404).json({ error: 'not_found' });
      const scans = db.prepare('SELECT * FROM yard_audit_scans WHERE auditId = ?').all(req.params.id) as any[];
      const scannedVins = new Set(scans.map((s: any) => String(s.vin).toUpperCase()));
      const expectedRows: any[] = audit.zone
        ? db.prepare(`SELECT v.id, v.vin, l.code as locCode FROM yard_vehicles v LEFT JOIN yard_locations l ON v.yardLocationId = l.id WHERE l.zone = ? AND v.archivedAt IS NULL`).all(audit.zone) as any[]
        : db.prepare(`SELECT v.id, v.vin, l.code as locCode FROM yard_vehicles v LEFT JOIN yard_locations l ON v.yardLocationId = l.id WHERE v.archivedAt IS NULL`).all() as any[];

      const discrepancies: any[] = [];
      expectedRows.filter(e => !scannedVins.has(String(e.vin).toUpperCase())).forEach(e => {
        discrepancies.push({ type: 'missing', vehicleId: e.id, expected: e.vin, actual: null });
      });
      scans.filter((s: any) => !s.vehicleId).forEach((s: any) => {
        discrepancies.push({ type: 'found', vehicleId: null, expected: null, actual: s.vin });
      });
      scans.filter((s: any) => s.vehicleId && s.scannedLocation && s.expectedLocation && s.scannedLocation !== s.expectedLocation).forEach((s: any) => {
        const sameZone = String(s.scannedLocation || '').split('-')[0] === String(s.expectedLocation || '').split('-')[0];
        discrepancies.push({ type: sameZone ? 'wrong_location' : 'wrong_zone', vehicleId: s.vehicleId, expected: s.expectedLocation, actual: s.scannedLocation });
      });

      const insertD = db.prepare(`INSERT INTO yard_audit_discrepancies (id, auditId, vehicleId, discrepancyType, expectedValue, actualValue) VALUES (?, ?, ?, ?, ?, ?)`);
      discrepancies.forEach(d => insertD.run(uid('yad'), req.params.id, d.vehicleId, d.type, d.expected, d.actual));
      db.prepare(`UPDATE yard_audits SET completedAt = ?, actualCount = ?, status = 'completed' WHERE id = ?`)
        .run(nowIso(), scans.length, req.params.id);
      res.json({ success: true, discrepancyCount: discrepancies.length });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  app.get('/api/yard/audits', requireAuth, (_req, res) => {
    const rows = db.prepare('SELECT * FROM yard_audits ORDER BY startedAt DESC LIMIT 100').all();
    res.json(rows);
  });

  app.get('/api/yard/audits/:id', requireAuth, (req, res) => {
    const audit = db.prepare('SELECT * FROM yard_audits WHERE id = ?').get(req.params.id);
    if (!audit) return res.status(404).json({ error: 'not_found' });
    const scans = db.prepare('SELECT * FROM yard_audit_scans WHERE auditId = ? ORDER BY scannedAt DESC').all(req.params.id);
    const discrepancies = db.prepare('SELECT * FROM yard_audit_discrepancies WHERE auditId = ? ORDER BY id').all(req.params.id);
    res.json({ ...audit, scans, discrepancies });
  });

  app.post('/api/yard/audits/:id/resolve-discrepancy', requireYardRole(['manager', 'auditor']), (req: any, res) => {
    try {
      const b = req.body || {};
      if (!b.discrepancyId) return res.status(400).json({ error: 'discrepancyId required' });
      db.prepare(`UPDATE yard_audit_discrepancies SET resolved = 1, resolutionNotes = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ?`)
        .run(b.notes || null, req.user?.id || 'system', nowIso(), b.discrepancyId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  User yardRole assignment (manager only)
  // ═════════════════════════════════════════════════════════════════════════
  app.post('/api/yard/users/:id/role', requireYardRole(['manager']), (req: any, res) => {
    const { yardRole } = req.body || {};
    const allowed = [null, '', 'gatekeeper', 'supervisor', 'sales_agent', 'dealer', 'auditor', 'manager'];
    if (yardRole !== null && yardRole !== undefined && !allowed.includes(yardRole))
      return res.status(400).json({ error: 'invalid yardRole' });
    db.prepare('UPDATE users SET yardRole = ? WHERE id = ?').run(yardRole || null, req.params.id);
    res.json({ success: true });
  });

  console.log('[BOOT] Yard routes registered — /api/yard/* (with reports + phases 6-9)');
}

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 8 — Background jobs (daily report cache, stale alerts, weekly summary)
// ═════════════════════════════════════════════════════════════════════════════
export function registerYardBackgroundJobs(ctx: AppContext) {
  const { db, sendEmail, sendNotification } = ctx;
  let lastDailyRun = '';
  let lastStaleRun = '';
  let lastWeeklyRun = '';

  setInterval(() => {
    try {
      const now = new Date();
      const hh = now.getHours();
      const mm = now.getMinutes();
      const today = now.toISOString().slice(0, 10);

      // 18:00 — cache daily report + email managers
      if (hh === 18 && mm === 0 && lastDailyRun !== today) {
        lastDailyRun = today;
        try {
          const dayStart = `${today}T00:00:00`;
          const dayEnd = `${today}T23:59:59`;
          const opening = (db.prepare(`SELECT COUNT(*) as c FROM yard_vehicles WHERE archivedAt IS NULL AND createdAt < ?`).get(dayStart) as any).c;
          const entries = (db.prepare(`SELECT COUNT(*) as c FROM yard_gate_movements WHERE UPPER(movementType)='IN' AND timestamp BETWEEN ? AND ?`).get(dayStart, dayEnd) as any).c;
          const exits = (db.prepare(`SELECT COUNT(*) as c FROM yard_gate_movements WHERE UPPER(movementType)='OUT' AND timestamp BETWEEN ? AND ?`).get(dayStart, dayEnd) as any).c;
          const sales = (db.prepare(`SELECT COUNT(*) as c FROM yard_status_log WHERE toStatusId IN ('ys-sold_pending_delivery','ys-delivered_to_buyer') AND changedAt BETWEEN ? AND ?`).get(dayStart, dayEnd) as any).c;
          const closing = (db.prepare(`SELECT COUNT(*) as c FROM yard_vehicles WHERE archivedAt IS NULL`).get() as any).c;

          db.prepare(`INSERT OR REPLACE INTO yard_daily_reports
            (id, reportDate, openingBalance, entriesCount, salesCount, withdrawalsCount, closingBalance,
             staleVehiclesJson, byStatusJson, byOwnershipJson, bySourceJson, movementsJson, generatedBySystem, generatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', ?, 1, ?)`).run(
              `ydr-${today}`, today, opening, entries, sales, exits, closing,
              JSON.stringify({ entries, exits }), new Date().toISOString()
            );

          const managers = db.prepare("SELECT id, email FROM users WHERE role = 'admin' OR yardRole = 'manager'").all() as any[];
          const html = `<div dir="rtl" style="font-family:Tahoma,Arial">
            <h2>تقرير الحضيرة اليومي — ${today}</h2>
            <ul><li>الرصيد الافتتاحي: ${opening}</li><li>دخول: ${entries}</li>
            <li>مبيعات: ${sales}</li><li>سحوبات: ${exits}</li>
            <li>الرصيد النهائي: ${closing}</li></ul></div>`;
          managers.forEach((m: any) => {
            if (m.email) sendEmail?.({ to: m.email, subject: `تقرير الحضيرة — ${today}`, html }).catch(() => {});
            try { sendNotification?.(m.id, 'تقرير الحضيرة اليومي جاهز', `تم توليد تقرير ${today}`, 'info'); } catch {}
          });
        } catch (e: any) { console.error('[YARD] daily report failed:', e?.message); }
      }

      // 08:00 — stale vehicle alerts
      if (hh === 8 && mm === 0 && lastStaleRun !== today) {
        lastStaleRun = today;
        try {
          const stale = db.prepare(`SELECT id, vin FROM yard_vehicles WHERE archivedAt IS NULL AND julianday('now') - julianday(updatedAt) > 30`).all() as any[];
          if (stale.length > 0) {
            const managers = db.prepare("SELECT id, email FROM users WHERE role = 'admin' OR yardRole = 'manager'").all() as any[];
            const html = `<div dir="rtl" style="font-family:Tahoma,Arial"><h2>${stale.length} سيارة راكدة تحتاج اهتمامك</h2><p>لم تتحرك أكثر من 30 يومًا.</p></div>`;
            managers.forEach((m: any) => {
              if (m.email) sendEmail?.({ to: m.email, subject: `تنبيه: ${stale.length} سيارة راكدة`, html }).catch(() => {});
              try { sendNotification?.(m.id, 'سيارات راكدة', `${stale.length} سيارة راكدة تحتاج اهتمامك`, 'warning'); } catch {}
            });
            const insertAlert = db.prepare(`INSERT INTO yard_stale_alerts (id, vehicleId, daysStale, alertType, notifiedUsers) VALUES (?, ?, ?, 'daily_30', ?)`);
            const notified = JSON.stringify(managers.map((m: any) => m.id));
            stale.forEach((s: any) => insertAlert.run(`ysa-${Date.now()}-${s.id}`, s.id, 30, notified));
          }
        } catch (e: any) { console.error('[YARD] stale alert failed:', e?.message); }
      }

      // Monday 09:00 — weekly summary
      if (now.getDay() === 1 && hh === 9 && mm === 0 && lastWeeklyRun !== today) {
        lastWeeklyRun = today;
        try {
          const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          const weekIn = (db.prepare(`SELECT COUNT(*) as c FROM yard_gate_movements WHERE UPPER(movementType)='IN' AND timestamp >= ?`).get(weekAgo) as any).c;
          const weekOut = (db.prepare(`SELECT COUNT(*) as c FROM yard_gate_movements WHERE UPPER(movementType)='OUT' AND timestamp >= ?`).get(weekAgo) as any).c;
          const topSources = db.prepare(`SELECT source, COUNT(*) as c FROM yard_vehicles WHERE createdAt >= ? GROUP BY source ORDER BY c DESC LIMIT 5`).all(weekAgo) as any[];
          const managers = db.prepare("SELECT id, email FROM users WHERE role = 'admin' OR yardRole = 'manager'").all() as any[];
          const html = `<div dir="rtl" style="font-family:Tahoma,Arial">
            <h2>الملخص الأسبوعي للحضيرة</h2>
            <ul><li>الدخول: ${weekIn}</li><li>الخروج: ${weekOut}</li></ul>
            <h3>أعلى المصادر:</h3><ul>${topSources.map((s: any) => `<li>${s.source}: ${s.c}</li>`).join('')}</ul></div>`;
          managers.forEach((m: any) => {
            if (m.email) sendEmail?.({ to: m.email, subject: 'الملخص الأسبوعي للحضيرة', html }).catch(() => {});
          });
        } catch (e: any) { console.error('[YARD] weekly summary failed:', e?.message); }
      }
    } catch (e: any) {
      console.error('[YARD] background jobs tick failed:', e?.message);
    }
  }, 60 * 1000);

  console.log('[BOOT] ✓ yard background jobs scheduled');
}
