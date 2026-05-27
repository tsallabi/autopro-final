/**
 * Scheduled Multi-Session Auctions
 * ─────────────────────────────────
 * Admin schedules named "auction sessions" (e.g. "Cars at 6 PM",
 * "Trucks at 7 PM"). Multiple sessions can be LIVE simultaneously.
 *
 * Cars are attached to a session via `cars.sessionId`. This module's
 * scheduler (`tickAuctionSessions`) rotates cars WITHIN each session
 * independently of the legacy scheduler in server.ts. The legacy
 * scheduler still owns every car that has `sessionId IS NULL`.
 *
 * Endpoints
 * ─────────
 *   GET    /api/auction-sessions/upcoming               (public)
 *   GET    /api/auction-sessions/:id                    (public)
 *   GET    /api/admin/auction-sessions                  (admin)
 *   POST   /api/admin/auction-sessions                  (admin, create)
 *   POST   /api/admin/auction-sessions/:id/cars         (admin, add cars)
 *   DELETE /api/admin/auction-sessions/:id/cars/:carId  (admin, remove car)
 *   PATCH  /api/admin/auction-sessions/:id              (admin, edit)
 *   POST   /api/admin/auction-sessions/:id/cancel       (admin, cancel)
 *
 * Background loops
 * ────────────────
 *   tickAuctionSessions    — every 15 s, drives session lifecycle.
 *   ensureRecurringSessions — every 60 min, seeds tomorrow's
 *                              recurring sessions + recycles unsold
 *                              session cars that never got bid on.
 *
 * Kill switch
 * ───────────
 *   AUCTION_SESSIONS_ENABLED=false → both loops short-circuit.
 *
 * Safety
 * ──────
 *   Every UPDATE on `cars` issued from this file is gated by
 *   `sessionId IS NOT NULL` (and usually `sessionId = ?`). Cars
 *   without a session are 100% legacy territory.
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

const VALID_CATEGORIES = ['cars', 'trucks', 'heavy_equipment', 'motorcycles', 'jet_skis', 'boats'] as const;
type Category = typeof VALID_CATEGORIES[number];
const LIBYA_TZ_OFFSET_MIN = 120; // UTC+2 fixed (Libya has no DST)

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidCategory(c: any): c is Category {
  return typeof c === 'string' && (VALID_CATEGORIES as readonly string[]).includes(c);
}

/**
 * Convert a "HH:mm" Libya-local time to a UTC ISO string for today's
 * date (in Libya). Returns null on malformed input.
 */
function libyaTimeTodayToUtcIso(recurringTime: string): string | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(recurringTime || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;

  const libyaNow = new Date(Date.now() + LIBYA_TZ_OFFSET_MIN * 60_000);
  const libyaToday = new Date(Date.UTC(
    libyaNow.getUTCFullYear(),
    libyaNow.getUTCMonth(),
    libyaNow.getUTCDate(),
    hh, mm, 0, 0,
  ));
  return new Date(libyaToday.getTime() - LIBYA_TZ_OFFSET_MIN * 60_000).toISOString();
}

export function registerAuctionSessionsRoutes(ctx: AppContext) {
  const { app, db, io } = ctx as any;
  const sendNotification = (ctx as any).sendNotification;
  const sendInternalMessage = (ctx as any).sendInternalMessage;

  const DISABLED = process.env.AUCTION_SESSIONS_ENABLED === 'false';
  if (DISABLED) {
    console.log('[sessions] disabled via env var');
  }

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  function getSession(id: string): any | null {
    try {
      return db.prepare('SELECT * FROM auction_sessions WHERE id = ?').get(id) || null;
    } catch {
      return null;
    }
  }

  function countCarsInSession(sessionId: string): { upcoming: number; live: number; closed: number; total: number } {
    const rows: any[] = db.prepare(`
      SELECT status, COUNT(*) as c
        FROM cars
       WHERE sessionId = ?
       GROUP BY status
    `).all(sessionId);
    const out = { upcoming: 0, live: 0, closed: 0, total: 0 };
    for (const r of rows) {
      out.total += r.c;
      if (r.status === 'upcoming') out.upcoming = r.c;
      else if (r.status === 'live') out.live = r.c;
      else if (r.status === 'closed') out.closed = r.c;
    }
    return out;
  }

  /**
   * Attach the given cars to a session. Sets sessionId AND category so
   * the car can be filtered both ways. Only touches cars that match the
   * provided ids; never disturbs other rows.
   */
  function attachCars(sessionId: string, category: Category, carIds: string[]): number {
    if (!Array.isArray(carIds) || carIds.length === 0) return 0;
    // [precise-schedule] Compute auctionStartTime for each newly-attached car so
    // the frontend and backend agree on the order, and so users see exactly
    // when their car is expected to go live. Schedule = session.scheduledStart
    // + (existingCarCount + index) * durationMinPerCar.
    //
    // Frontend sorts upcoming cars by auctionStartTime; backend must use the
    // same field as authority. Clearing auctionEndDate ensures no stale
    // future end date blocks the rotation.
    const session: any = db.prepare(
      `SELECT scheduledStart, durationMinPerCar FROM auction_sessions WHERE id = ?`
    ).get(sessionId);
    const existing: any = db.prepare(
      `SELECT COUNT(*) AS c FROM cars WHERE sessionId = ?`
    ).get(sessionId);
    const startMs = session ? new Date(session.scheduledStart).getTime() : Date.now();
    const durationMs = (session?.durationMinPerCar || 5) * 60_000;
    const offset = existing?.c || 0;

    // [orphan-recovery] A car is eligible to (re-)attach if its current
    // sessionId is empty OR is the target session OR points at a session
    // that has already closed/been cancelled. This lets the daily recurring
    // session pick up cars that were never finalized yesterday.
    const stmt = db.prepare(`
      UPDATE cars
         SET sessionId = ?,
             category = ?,
             auctionEndDate = NULL,
             auctionStartTime = ?
       WHERE id = ?
         AND (
           sessionId IS NULL
           OR sessionId = ''
           OR sessionId = ?
           OR sessionId IN (
             SELECT id FROM auction_sessions WHERE status IN ('closed', 'cancelled')
           )
         )
    `);
    let changed = 0;
    const tx = db.transaction((ids: string[]) => {
      ids.forEach((cid, i) => {
        const scheduledIso = new Date(startMs + (offset + i) * durationMs).toISOString();
        const r = stmt.run(sessionId, category, scheduledIso, cid, sessionId);
        changed += r.changes;
      });
    });
    tx(carIds);
    return changed;
  }

  // ──────────────────────────────────────────────────────────────────
  // Endpoints
  // ──────────────────────────────────────────────────────────────────

  // Public: upcoming sessions (today + tomorrow, Libya time) for hero strip.
  app.get('/api/auction-sessions/upcoming', (_req: any, res: any) => {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 48 * 3600_000).toISOString();
      const sessions = db.prepare(`
        SELECT s.*,
               (SELECT COUNT(*) FROM cars c WHERE c.sessionId = s.id) AS carCount
          FROM auction_sessions s
         WHERE s.status IN ('scheduled', 'live')
           AND s.scheduledStart <= ?
         ORDER BY s.scheduledStart ASC
      `).all(horizon);
      res.json({ sessions });
    } catch (e: any) {
      console.error('[sessions] upcoming failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في جلب الجلسات' });
    }
  });

  // Admin: list all sessions with car counts.
  app.get('/api/admin/auction-sessions', requireAdmin, (_req: any, res: any) => {
    try {
      const sessions = db.prepare(`
        SELECT s.*,
               (SELECT COUNT(*) FROM cars c WHERE c.sessionId = s.id) AS carCount,
               (SELECT COUNT(*) FROM cars c WHERE c.sessionId = s.id AND c.status = 'live') AS liveCount,
               (SELECT COUNT(*) FROM cars c WHERE c.sessionId = s.id AND c.status = 'upcoming') AS upcomingCount,
               (SELECT COUNT(*) FROM cars c WHERE c.sessionId = s.id AND c.status = 'closed') AS closedCount
          FROM auction_sessions s
         ORDER BY s.scheduledStart DESC
      `).all();
      res.json({ sessions });
    } catch (e: any) {
      console.error('[sessions] list failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في جلب الجلسات' });
    }
  });

  // Public: session detail with cars.
  app.get('/api/auction-sessions/:id', (req: any, res: any) => {
    try {
      const session = getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      const cars = db.prepare(`
        SELECT * FROM cars
         WHERE sessionId = ?
         ORDER BY
           CASE status
             WHEN 'live' THEN 0
             WHEN 'upcoming' THEN 1
             WHEN 'closed' THEN 2
             ELSE 3
           END,
           id ASC
      `).all(req.params.id);
      res.json({ session, cars });
    } catch (e: any) {
      console.error('[sessions] detail failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في جلب تفاصيل الجلسة' });
    }
  });

  // Admin: create session.
  app.post('/api/admin/auction-sessions', requireAdmin, (req: any, res: any) => {
    try {
      const {
        name,
        category,
        scheduledStart,
        durationMinPerCar,
        transitionGraceSeconds,
        recurringDaily,
        recurringTime,
        carIds,
      } = req.body || {};

      // Validation
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 200) {
        return res.status(400).json({ error: 'اسم الجلسة مطلوب (1-200 حرف)' });
      }
      if (!isValidCategory(category)) {
        return res.status(400).json({ error: 'التصنيف غير صالح' });
      }
      const startDate = new Date(scheduledStart);
      if (!scheduledStart || Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'تاريخ البداية غير صالح' });
      }
      const duration = Number(durationMinPerCar ?? 5);
      if (!Number.isFinite(duration) || duration < 1 || duration > 60) {
        return res.status(400).json({ error: 'مدة كل سيارة يجب أن تكون بين 1 و 60 دقيقة' });
      }
      const grace = Number(transitionGraceSeconds ?? 7);
      if (!Number.isFinite(grace) || grace < 0 || grace > 60) {
        return res.status(400).json({ error: 'مدة الانتقال بين السيارات يجب أن تكون بين 0 و 60 ثانية' });
      }
      const recurring = recurringDaily ? 1 : 0;
      if (recurring && (!recurringTime || !libyaTimeTodayToUtcIso(recurringTime))) {
        return res.status(400).json({ error: 'وقت التكرار اليومي غير صالح (HH:mm)' });
      }

      const id = newId('sess');
      const now = new Date().toISOString();
      const adminId = req.user?.id || 'admin';

      db.prepare(`
        INSERT INTO auction_sessions
          (id, name, category, scheduledStart, durationMinPerCar, transitionGraceSeconds, status,
           recurringDaily, recurringTime, createdBy, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
      `).run(
        id,
        trimmedName,
        category,
        startDate.toISOString(),
        Math.floor(duration),
        Math.floor(grace),
        recurring,
        recurring ? String(recurringTime) : null,
        adminId,
        now,
      );

      const ids: string[] = Array.isArray(carIds) ? carIds.filter((x: any) => typeof x === 'string' && x) : [];
      const attached = attachCars(id, category as Category, ids);

      try {
        io.emit('session_created', { id, name: trimmedName, category, scheduledStart: startDate.toISOString() });
      } catch {}

      res.json({ success: true, id, attachedCars: attached });
    } catch (e: any) {
      console.error('[sessions] create failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في إنشاء الجلسة' });
    }
  });

  // Admin: add cars to existing session.
  app.post('/api/admin/auction-sessions/:id/cars', requireAdmin, (req: any, res: any) => {
    try {
      const session = getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (session.status === 'closed' || session.status === 'cancelled') {
        return res.status(400).json({ error: 'لا يمكن إضافة سيارات لجلسة منتهية أو ملغاة' });
      }
      const carIds: string[] = Array.isArray(req.body?.carIds)
        ? req.body.carIds.filter((x: any) => typeof x === 'string' && x)
        : [];
      if (carIds.length === 0) {
        return res.status(400).json({ error: 'قائمة السيارات مطلوبة' });
      }
      const attached = attachCars(session.id, session.category as Category, carIds);
      try { io.emit('session_cars_changed', { id: session.id }); } catch {}
      res.json({ success: true, attachedCars: attached });
    } catch (e: any) {
      console.error('[sessions] add cars failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في إضافة السيارات' });
    }
  });

  // [bulk-add] Preview how many free upcoming cars would move into a session.
  // Used by the frontend confirm dialog before the admin commits. ONLY counts
  // cars with status='upcoming' AND no sessionId — `live` cars are excluded
  // so the existing auction never gets disrupted.
  app.get('/api/admin/auction-sessions/:id/bulk-add-preview', requireAdmin, (req: any, res: any) => {
    try {
      const session = getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      const cat = session.category;
      // [orphan-recovery] "Free" includes cars in closed/cancelled sessions
      // — yesterday's recurring instance leaves cars stranded otherwise.
      const FREE_CLAUSE = `
        (sessionId IS NULL
         OR sessionId = ''
         OR sessionId IN (SELECT id FROM auction_sessions WHERE status IN ('closed', 'cancelled')))
      `;
      const totalFree = (db.prepare(`
        SELECT COUNT(*) AS c FROM cars
         WHERE status = 'upcoming'
           AND ${FREE_CLAUSE}
      `).get() as any).c;
      const matchingCategory = (db.prepare(`
        SELECT COUNT(*) AS c FROM cars
         WHERE status = 'upcoming'
           AND ${FREE_CLAUSE}
           AND category = ?
      `).get(cat) as any).c;
      const uncategorized = (db.prepare(`
        SELECT COUNT(*) AS c FROM cars
         WHERE status = 'upcoming'
           AND ${FREE_CLAUSE}
           AND (category IS NULL OR category = '')
      `).get() as any).c;
      res.json({
        sessionCategory: cat,
        totalFreeUpcoming: totalFree,
        matchingCategory,
        uncategorized,
        // The "safe" default when the admin clicks bulk-add: match category
        // if any cars match; otherwise fall back to uncategorized (existing
        // inventory that has no category set yet).
        defaultMode: matchingCategory > 0 ? 'matching' : 'uncategorized',
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل التحضير' });
    }
  });

  // [bulk-add] Move free upcoming cars into a session in one shot.
  // Modes:
  //   'matching'      → only cars whose category matches the session
  //   'uncategorized' → only cars with no category set
  //   'all'           → every free upcoming car (admin must confirm)
  // NEVER touches cars that are currently 'live' or already in another session.
  app.post('/api/admin/auction-sessions/:id/bulk-add', requireAdmin, (req: any, res: any) => {
    try {
      const session = getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (session.status === 'closed' || session.status === 'cancelled') {
        return res.status(400).json({ error: 'لا يمكن إضافة سيارات لجلسة منتهية أو ملغاة' });
      }
      const mode = String(req.body?.mode || 'matching');
      if (!['matching', 'uncategorized', 'all'].includes(mode)) {
        return res.status(400).json({ error: 'mode غير صحيح' });
      }

      // [orphan-recovery] Same broadened "free" semantics as the preview.
      let where = `
        status = 'upcoming'
        AND (sessionId IS NULL
             OR sessionId = ''
             OR sessionId IN (SELECT id FROM auction_sessions WHERE status IN ('closed', 'cancelled')))
      `;
      const params: any[] = [];
      if (mode === 'matching') {
        where += ` AND category = ?`;
        params.push(session.category);
      } else if (mode === 'uncategorized') {
        where += ` AND (category IS NULL OR category = '')`;
      }
      // 'all' has no extra filter

      const candidates: any[] = db.prepare(
        `SELECT id FROM cars WHERE ${where} LIMIT 500`
      ).all(...params);
      const ids = candidates.map((r: any) => r.id);
      const attached = attachCars(session.id, session.category as Category, ids);
      try { io.emit('session_cars_changed', { id: session.id }); } catch {}
      res.json({
        success: true,
        attached,
        candidates: ids.length,
        mode,
      });
    } catch (e: any) {
      console.error('[sessions] bulk-add failed:', e?.message);
      res.status(500).json({ error: e?.message || 'فشل النقل' });
    }
  });

  // Admin: free all orphan cars stuck on closed/cancelled sessions.
  // Returns how many were freed so the UI can show a clear message.
  // Run this if the daily recurring auction reports 0 cars even though the
  // "قريباً" tab has plenty.
  app.post('/api/admin/auction-sessions/free-orphans', requireAdmin, (_req: any, res: any) => {
    try {
      const freed = freeOrphanCars();
      try { io.emit('orphans_freed', { count: freed }); } catch {}
      res.json({ success: true, freed });
    } catch (e: any) {
      console.error('[sessions] free-orphans failed:', e?.message);
      res.status(500).json({ error: e?.message || 'فشل تحرير السيارات' });
    }
  });

  // Admin: remove a car from a session. Reverts car to legacy/free state.
  app.delete('/api/admin/auction-sessions/:id/cars/:carId', requireAdmin, (req: any, res: any) => {
    try {
      const { id, carId } = req.params;
      const session = getSession(id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      const car: any = db.prepare('SELECT id, status, sessionId FROM cars WHERE id = ? AND sessionId = ?').get(carId, id);
      if (!car) return res.status(404).json({ error: 'السيارة غير مرتبطة بهذه الجلسة' });
      if (car.status === 'live') {
        return res.status(400).json({ error: 'لا يمكن إزالة سيارة في حالة بث مباشر' });
      }
      // Safe: WHERE clause is fully scoped to this session.
      db.prepare(`
        UPDATE cars
           SET sessionId = NULL,
               status = CASE WHEN status = 'live' THEN 'upcoming' ELSE status END
         WHERE id = ?
           AND sessionId = ?
           AND sessionId IS NOT NULL
      `).run(carId, id);
      try { io.emit('session_cars_changed', { id }); } catch {}
      res.json({ success: true });
    } catch (e: any) {
      console.error('[sessions] remove car failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في إزالة السيارة' });
    }
  });

  // Admin: edit session.
  app.patch('/api/admin/auction-sessions/:id', requireAdmin, (req: any, res: any) => {
    try {
      const session = getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      // [transition-grace-config] Allow transitionGraceSeconds edits even on a
      // live session so the admin can fine-tune pacing while it's running.
      // Other fields still require the session to not be live.
      const onlyGraceEdit = req.body
        && Object.keys(req.body).every((k) => k === 'transitionGraceSeconds');
      if (session.status === 'live' && !onlyGraceEdit) {
        return res.status(400).json({ error: 'لا يمكن تعديل جلسة مباشرة' });
      }

      const { name, scheduledStart, durationMinPerCar, transitionGraceSeconds, recurringDaily, recurringTime } = req.body || {};

      const updates: string[] = [];
      const values: any[] = [];

      if (name !== undefined) {
        const t = String(name).trim();
        if (!t || t.length > 200) return res.status(400).json({ error: 'اسم الجلسة غير صالح' });
        updates.push('name = ?'); values.push(t);
      }
      if (scheduledStart !== undefined) {
        const d = new Date(scheduledStart);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'تاريخ البداية غير صالح' });
        updates.push('scheduledStart = ?'); values.push(d.toISOString());
      }
      if (durationMinPerCar !== undefined) {
        const dur = Number(durationMinPerCar);
        if (!Number.isFinite(dur) || dur < 1 || dur > 60) {
          return res.status(400).json({ error: 'مدة كل سيارة يجب أن تكون بين 1 و 60 دقيقة' });
        }
        updates.push('durationMinPerCar = ?'); values.push(Math.floor(dur));
      }
      if (transitionGraceSeconds !== undefined) {
        const grace = Number(transitionGraceSeconds);
        if (!Number.isFinite(grace) || grace < 0 || grace > 60) {
          return res.status(400).json({ error: 'مدة الانتقال بين السيارات يجب أن تكون بين 0 و 60 ثانية' });
        }
        updates.push('transitionGraceSeconds = ?'); values.push(Math.floor(grace));
      }
      if (recurringDaily !== undefined) {
        updates.push('recurringDaily = ?'); values.push(recurringDaily ? 1 : 0);
      }
      if (recurringTime !== undefined) {
        if (recurringTime !== null && recurringTime !== '' && !libyaTimeTodayToUtcIso(String(recurringTime))) {
          return res.status(400).json({ error: 'وقت التكرار اليومي غير صالح (HH:mm)' });
        }
        updates.push('recurringTime = ?'); values.push(recurringTime || null);
      }

      if (updates.length === 0) {
        return res.json({ success: true, id: session.id });
      }
      values.push(session.id);
      db.prepare(`UPDATE auction_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      try { io.emit('session_updated', { id: session.id }); } catch {}
      res.json({ success: true, id: session.id });
    } catch (e: any) {
      console.error('[sessions] patch failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في تعديل الجلسة' });
    }
  });

  // Admin: cancel session. Reverts associated cars (except already-closed).
  app.post('/api/admin/auction-sessions/:id/cancel', requireAdmin, (req: any, res: any) => {
    try {
      const session = getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (session.status === 'closed') return res.status(400).json({ error: 'الجلسة منتهية بالفعل' });
      if (session.status === 'cancelled') return res.status(400).json({ error: 'الجلسة ملغاة بالفعل' });

      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(`
          UPDATE auction_sessions
             SET status = 'cancelled', actualEnd = ?
           WHERE id = ?
        `).run(now, session.id);
        // Revert cars: any non-closed car in this session goes back to upcoming
        // legacy state. Critical: AND sessionId IS NOT NULL keeps us inside our
        // managed slice (defensive — the sessionId = ? already implies that).
        db.prepare(`
          UPDATE cars
             SET status = 'upcoming',
                 sessionId = NULL,
                 auctionEndDate = NULL
           WHERE sessionId = ?
             AND sessionId IS NOT NULL
             AND status != 'closed'
        `).run(session.id);
      })();

      try { io.emit('session_cancelled', { id: session.id }); } catch {}
      res.json({ success: true, id: session.id });
    } catch (e: any) {
      console.error('[sessions] cancel failed:', e?.message);
      res.status(500).json({ error: e?.message || 'خطأ في إلغاء الجلسة' });
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // Scheduler — tickAuctionSessions runs every 15s.
  // ──────────────────────────────────────────────────────────────────
  function tickAuctionSessions() {
    if (DISABLED) return;
    const now = new Date().toISOString();

    // (a) Promote scheduled → live for any session whose start time has arrived.
    const dueScheduled: any[] = db.prepare(`
      SELECT * FROM auction_sessions
       WHERE status = 'scheduled' AND scheduledStart <= ?
    `).all(now);
    for (const s of dueScheduled) {
      try {
        db.prepare(`
          UPDATE auction_sessions
             SET status = 'live', actualStart = ?
           WHERE id = ? AND status = 'scheduled'
        `).run(now, s.id);
        try { io.emit('session_started', { id: s.id, name: s.name, category: s.category }); } catch {}
        console.log(`[sessions] session ${s.id} (${s.name}) is now LIVE`);
      } catch (e: any) {
        console.error(`[sessions] failed to start session ${s.id}:`, e?.message);
      }
    }

    // (b) For each live session, ensure exactly one car is live (rotation).
    const liveSessions: any[] = db.prepare(`SELECT * FROM auction_sessions WHERE status = 'live'`).all();
    for (const s of liveSessions) {
      try {
        // [stuck-transition-fix] Safety-net: if a session car has been 'live'
        // with an end date >60 s in the past, the legacy tickAuctions in
        // server.ts must have skipped it (transition flag stuck, exception,
        // etc.). Force-flip it to 'offer_market' so the rotation can advance.
        // 60 s grace period guards against clock skew while still recovering
        // from a hang within one user-visible cycle.
        const stuckGraceIso = new Date(Date.now() - 60_000).toISOString();
        const stuck: any[] = db.prepare(`
          SELECT id FROM cars
           WHERE sessionId = ?
             AND status = 'live'
             AND auctionEndDate IS NOT NULL
             AND auctionEndDate != ''
             AND auctionEndDate <= ?
        `).all(s.id, stuckGraceIso);
        for (const c of stuck) {
          console.warn(`[sessions] FORCE-FINALIZING stuck live car ${c.id} (session ${s.id})`);
          const offerEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          db.prepare(`
            UPDATE cars
               SET status = 'offer_market', offerMarketEndTime = ?
             WHERE id = ? AND status = 'live'
          `).run(offerEnd, c.id);
          try { io.emit('car_updated', { id: c.id, status: 'offer_market', offerMarketEndTime: offerEnd }); } catch {}
        }

        const liveCount: any = db.prepare(`
          SELECT COUNT(*) as c FROM cars
           WHERE sessionId = ? AND status = 'live'
        `).get(s.id);

        if (liveCount && liveCount.c === 0) {
          // [transition-screen-grace] Hold for transitionGraceSeconds after the
          // previous car finalized so the "next car coming up" screen on the
          // live auction page has time to be seen by users (build
          // anticipation). The tick interval is 2 s, but the actual delay
          // between cars is governed by this per-session grace value. Default
          // 7 s; admin-configurable per session.
          const graceSec = Number.isFinite(Number(s.transitionGraceSeconds))
            ? Math.max(0, Math.min(60, Math.floor(Number(s.transitionGraceSeconds))))
            : 7;
          const TRANSITION_GRACE_MS = graceSec * 1000;
          const lastFinalized: any = db.prepare(`
            SELECT MAX(auctionEndDate) AS lastEnd FROM cars
             WHERE sessionId = ?
               AND status IN ('closed', 'offer_market', 'pending_seller')
               AND auctionEndDate IS NOT NULL
               AND auctionEndDate != ''
          `).get(s.id);
          if (lastFinalized?.lastEnd) {
            const lastEndMs = new Date(lastFinalized.lastEnd).getTime();
            const elapsed = Date.now() - lastEndMs;
            // [stuck-fix] Only hold during a REAL, recent grace window.
            // `elapsed >= 0` is critical: if a car was closed early (buy-now
            // / admin / anti-snipe quirk) its auctionEndDate can be in the
            // FUTURE, making elapsed negative — the old `elapsed < GRACE`
            // check was then permanently true and the rotation hung on the
            // "next car" screen forever. A future end date means the car is
            // already done, so advance immediately.
            if (elapsed >= 0 && elapsed < TRANSITION_GRACE_MS) {
              continue;
            }
          }

          // [precise-schedule] Pick the next car by auctionStartTime — the same
          // field the frontend uses to render the "next car" transition screen.
          // If both agree on the order, the announced next car always matches
          // the one actually activated.
          //
          // Tie-break on id so identical timestamps remain deterministic.
          // Cars without auctionStartTime fall to the end via COALESCE so they
          // can still be picked once the scheduled ones have run.
          const next: any = db.prepare(`
            SELECT * FROM cars
             WHERE sessionId = ?
               AND status = 'upcoming'
             ORDER BY COALESCE(auctionStartTime, '9999-12-31T23:59:59Z') ASC,
                      id ASC
             LIMIT 1
          `).get(s.id);

          if (next) {
            const durationMs = (s.durationMinPerCar || 5) * 60_000;
            const newEnd = new Date(Date.now() + durationMs).toISOString();
            // Safe: scoped to this session AND sessionId IS NOT NULL belt-and-suspenders.
            const r = db.prepare(`
              UPDATE cars
                 SET status = 'live', auctionEndDate = ?
               WHERE id = ?
                 AND sessionId = ?
                 AND sessionId IS NOT NULL
                 AND status = 'upcoming'
            `).run(newEnd, next.id, s.id);
            if (r.changes > 0) {
              try {
                io.emit('car_updated', { id: next.id, status: 'live', auctionEndDate: newEnd });
                io.emit('auction_started', { carId: next.id, sessionId: s.id });
              } catch {}
              console.log(`[sessions] session=${s.id} car=${next.id} LIVE until ${newEnd}`);
            }
          }
        }

        // (c) If no upcoming or live cars remain → close the session.
        // Cars already finalized by the legacy tickAuctions are 'closed';
        // we just wrap the session up here.
        const remaining: any = db.prepare(`
          SELECT COUNT(*) as c FROM cars
           WHERE sessionId = ? AND status IN ('upcoming', 'live')
        `).get(s.id);

        if (remaining && remaining.c === 0) {
          // [orphan-cleanup] Free any cars that were attached but never made
          // it through the rotation (e.g. session ran out of time or was
          // partially completed). Without this, those cars stay bound to a
          // closed session and are invisible to bulk-add / recurring-attach
          // queries that filter on `sessionId IS NULL`.
          //
          // Only touches upcoming cars — sold (closed/winnerId) and offer-
          // market cars keep the sessionId for audit/history.
          db.prepare(`
            UPDATE cars
               SET sessionId = NULL
             WHERE sessionId = ?
               AND status = 'upcoming'
          `).run(s.id);
          db.prepare(`
            UPDATE auction_sessions
               SET status = 'closed', actualEnd = ?
             WHERE id = ? AND status = 'live'
          `).run(now, s.id);
          try { io.emit('session_ended', { id: s.id, name: s.name, category: s.category }); } catch {}
          console.log(`[sessions] session ${s.id} (${s.name}) CLOSED — no remaining cars`);
        }
      } catch (e: any) {
        console.error(`[sessions] tick error for session ${s.id}:`, e?.message);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Hourly cron — recurring sessions + auto-recycle unsold session cars.
  // ──────────────────────────────────────────────────────────────────
  function ensureRecurringSessions() {
    if (DISABLED) return;

    // (1) Recurring daily templates: for each session row marked recurring,
    //     ensure today's instance exists (same category + same recurringTime).
    try {
      const templates: any[] = db.prepare(`
        SELECT * FROM auction_sessions
         WHERE recurringDaily = 1
           AND recurringTime IS NOT NULL
           AND recurringTime != ''
      `).all();

      for (const t of templates) {
        try {
          const todayIso = libyaTimeTodayToUtcIso(t.recurringTime);
          if (!todayIso) continue;

          // Don't seed if a session of the same category already exists for
          // today's slot (regardless of which row spawned it).
          const dayStart = new Date(todayIso);
          const dayBegin = new Date(Date.UTC(
            dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), 0, 0, 0, 0,
          )).toISOString();
          const dayEnd = new Date(Date.UTC(
            dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), 23, 59, 59, 999,
          )).toISOString();

          const existing: any = db.prepare(`
            SELECT id FROM auction_sessions
             WHERE category = ?
               AND scheduledStart >= ?
               AND scheduledStart <= ?
               AND status IN ('scheduled', 'live')
             LIMIT 1
          `).get(t.category, dayBegin, dayEnd);
          if (existing) continue;

          // Don't seed if today's slot is already in the past — wait for tomorrow.
          if (new Date(todayIso).getTime() < Date.now()) continue;

          const id = newId('sess');
          const now = new Date().toISOString();
          db.prepare(`
            INSERT INTO auction_sessions
              (id, name, category, scheduledStart, durationMinPerCar, transitionGraceSeconds, status,
               recurringDaily, recurringTime, createdBy, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 1, ?, ?, ?)
          `).run(
            id,
            t.name,
            t.category,
            todayIso,
            t.durationMinPerCar || 5,
            t.transitionGraceSeconds ?? 7,
            t.recurringTime,
            t.createdBy || 'cron',
            now,
          );

          // [orphan-recovery] Auto-populate from inventory: include cars whose
          // last session has closed/cancelled. Otherwise yesterday's leftover
          // cars stay stranded with sessionId pointing at a closed row.
          const free: any[] = db.prepare(`
            SELECT id FROM cars
             WHERE status = 'upcoming'
               AND category = ?
               AND (sessionId IS NULL
                    OR sessionId = ''
                    OR sessionId IN (SELECT id FROM auction_sessions WHERE status IN ('closed', 'cancelled')))
          `).all(t.category);
          if (free.length > 0) {
            attachCars(id, t.category as Category, free.map((c: any) => c.id));
          }

          console.log(`[sessions] auto-created recurring session ${id} (${t.name}) for ${todayIso} — ${free.length} cars attached`);
          try { io.emit('session_created', { id, name: t.name, category: t.category, scheduledStart: todayIso }); } catch {}
        } catch (e: any) {
          console.error(`[sessions] recurring template ${t.id} failed:`, e?.message);
        }
      }
    } catch (e: any) {
      console.error('[sessions] ensureRecurringSessions templates loop failed:', e?.message);
    }

    // (2) Auto-recycle unsold session cars. If a closed session car has no
    //     winner and its auction ended >1h ago, send it back to the legacy
    //     pool as 'upcoming' with cleared session/winner/bid state.
    try {
      const cutoff = new Date(Date.now() - 3600_000).toISOString();
      // Snapshot for logging first (so we know what we're recycling).
      const toRecycle: any[] = db.prepare(`
        SELECT id, sessionId FROM cars
         WHERE status = 'closed'
           AND (winnerId IS NULL OR winnerId = '')
           AND auctionEndDate IS NOT NULL
           AND auctionEndDate < ?
           AND sessionId IS NOT NULL
           AND sessionId != ''
      `).all(cutoff);

      if (toRecycle.length > 0) {
        const r = db.prepare(`
          UPDATE cars
             SET status = 'upcoming',
                 auctionEndDate = NULL,
                 sessionId = NULL,
                 currentBid = 0,
                 winnerId = NULL
           WHERE status = 'closed'
             AND (winnerId IS NULL OR winnerId = '')
             AND auctionEndDate IS NOT NULL
             AND auctionEndDate < ?
             AND sessionId IS NOT NULL
             AND sessionId != ''
        `).run(cutoff);
        console.log(`[sessions] recycled ${r.changes} unsold session cars back to legacy pool`,
          toRecycle.slice(0, 10).map((c: any) => c.id));
      }
    } catch (e: any) {
      console.error('[sessions] auto-recycle failed:', e?.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Backfill: assign auctionStartTime to existing session cars that have
  // none. Without this, sessions that were attached before the precise-
  // schedule fix landed would still sort unpredictably and the frontend's
  // "next car" announcement could disagree with what actually activates.
  // ──────────────────────────────────────────────────────────────────
  /**
   * One-time orphan cleanup: any upcoming car whose sessionId points at a
   * closed/cancelled session has its sessionId cleared. Returns the number
   * of cars freed so the boot log shows clear evidence of cleanup.
   *
   * This is the recovery path for cars that pre-date the "close session
   * frees its upcoming queue" fix landed in this same patch.
   */
  function freeOrphanCars(): number {
    try {
      const result: any = db.prepare(`
        UPDATE cars
           SET sessionId = NULL
         WHERE status = 'upcoming'
           AND sessionId IS NOT NULL
           AND sessionId != ''
           AND sessionId IN (
             SELECT id FROM auction_sessions WHERE status IN ('closed', 'cancelled')
           )
      `).run();
      if (result && result.changes > 0) {
        console.log(`[sessions] freed ${result.changes} orphan cars from closed/cancelled sessions`);
      }
      return result?.changes || 0;
    } catch (e: any) {
      console.error('[sessions] freeOrphanCars failed:', e?.message);
      return 0;
    }
  }

  function backfillSessionSchedule(): void {
    try {
      const sessions: any[] = db.prepare(`
        SELECT id, scheduledStart, durationMinPerCar
          FROM auction_sessions
         WHERE status IN ('scheduled', 'live')
      `).all();
      for (const s of sessions) {
        const cars: any[] = db.prepare(`
          SELECT id, auctionStartTime FROM cars
           WHERE sessionId = ?
             AND status IN ('upcoming', 'live')
           ORDER BY id ASC
        `).all(s.id);
        const startMs = new Date(s.scheduledStart).getTime();
        const durationMs = (s.durationMinPerCar || 5) * 60_000;
        let assigned = 0;
        cars.forEach((c, idx) => {
          if (c.auctionStartTime) return;
          const iso = new Date(startMs + idx * durationMs).toISOString();
          db.prepare(`UPDATE cars SET auctionStartTime = ? WHERE id = ?`).run(iso, c.id);
          assigned++;
        });
        if (assigned > 0) {
          console.log(`[sessions] backfilled auctionStartTime for ${assigned} cars in session ${s.id}`);
        }
      }
    } catch (e: any) {
      console.error('[sessions] backfillSessionSchedule failed:', e?.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Start background loops.
  // ──────────────────────────────────────────────────────────────────
  if (!DISABLED) {
    // [orphan-recovery] Free cars stuck on yesterday's closed session BEFORE
    // ensureRecurringSessions runs — so today's recurring instance picks them
    // up via its category filter.
    try { freeOrphanCars(); } catch (e: any) {
      console.error('[sessions] initial freeOrphanCars crashed:', e?.message);
    }
    // Run schedule backfill once at boot so existing sessions get sane times.
    try { backfillSessionSchedule(); } catch (e: any) {
      console.error('[sessions] initial backfillSessionSchedule crashed:', e?.message);
    }
    // [stuck-transition-fix] Tick every 2 s instead of 15 s so the next car in
    // a session activates within ~2 s after the previous one finalizes (legacy
    // tickAuctions runs every 1 s). The queries are tiny (count + LIMIT 1) so
    // the load is negligible.
    setInterval(() => {
      try { tickAuctionSessions(); } catch (e: any) {
        console.error('[sessions] tickAuctionSessions crashed:', e?.message);
      }
    }, 2_000);

    setInterval(() => {
      try { ensureRecurringSessions(); } catch (e: any) {
        console.error('[sessions] ensureRecurringSessions crashed:', e?.message);
      }
    }, 3600_000);

    // Run once at boot so today's recurring sessions exist immediately.
    try { ensureRecurringSessions(); } catch (e: any) {
      console.error('[sessions] initial ensureRecurringSessions crashed:', e?.message);
    }
  }

  // Touch unused vars so TS doesn't complain if these helpers go unused.
  void sendNotification;
  void sendInternalMessage;

  console.log('[auction-sessions] routes + scheduler ready');
}
