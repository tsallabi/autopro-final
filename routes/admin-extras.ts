/**
 * Admin Extras — endpoints that didn't fit cleanly into the original
 * routes/admin.ts (which is already 2877 lines).
 *
 * Endpoints:
 *   GET  /api/admin/cars/won
 *      List closed (sold) cars with id, lot, VIN, make/model, winner email.
 *
 *   POST /api/admin/cars/:idOrLotOrVin/announce
 *      Send a "new car" notification (inbox + bell + email) to every
 *      active non-admin user. Returns immediately; sends run in background.
 *      Body: { skipEmail?: boolean }.
 *
 *   POST /api/admin/cars/:idOrLotOrVin/approve-with-schedule
 *      Approve a pending car AND set its auction window. Auto-triggers
 *      the announcement (suppress with body: { announce: false }).
 *
 *   POST /api/admin/cars/:idOrLotOrVin/cancel-sale
 *      Undo a closed sale.
 *
 *   POST /api/admin/users/:idOrEmail/suspend
 *   POST /api/admin/users/:idOrEmail/unsuspend
 *
 *      All accept either the database id, OR the lot number / VIN (cars),
 *      OR the email address (users).
 *
 * No DB schema migration.
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import { announceCarToAllUsers } from '../lib/announceCar.ts';

function isValidISODate(s: any): boolean {
  if (typeof s !== 'string' || !s) return false;
  const t = new Date(s).getTime();
  return Number.isFinite(t);
}

function findCar(db: any, q: string): any {
  if (!q) return null;
  const trimmed = String(q).trim();
  let row = db.prepare('SELECT * FROM cars WHERE id = ?').get(trimmed);
  if (row) return row;
  row = db.prepare('SELECT * FROM cars WHERE lotNumber = ?').get(trimmed);
  if (row) return row;
  row = db.prepare('SELECT * FROM cars WHERE UPPER(vin) = UPPER(?)').get(trimmed);
  if (row) return row;
  row = db.prepare('SELECT * FROM cars WHERE id LIKE ? LIMIT 1').get(trimmed + '%');
  if (row) return row;
  return null;
}

function findUser(db: any, q: string): any {
  if (!q) return null;
  const trimmed = String(q).trim();
  let row = db.prepare('SELECT * FROM users WHERE id = ?').get(trimmed);
  if (row) return row;
  row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(trimmed);
  if (row) return row;
  return null;
}

export function registerAdminExtrasRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, sendInternalMessage } = ctx;

  // ── GET /api/admin/cars/won ───────────────────────────────────────
  app.get('/api/admin/cars/won', requireAdmin, (_req, res) => {
    try {
      const rows: any[] = db.prepare(`
        SELECT c.id, c.lotNumber, c.vin, c.make, c.model, c.year,
               c.currentBid, c.winnerId, c.auctionEndDate,
               u.email AS winnerEmail, u.firstName AS winnerFirstName, u.lastName AS winnerLastName
          FROM cars c
          LEFT JOIN users u ON c.winnerId = u.id
         WHERE c.status = 'closed'
         ORDER BY c.auctionEndDate DESC
         LIMIT 100
      `).all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: 'فشل جلب السيارات المباعة: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/cars/:id/announce ────────────────────────────────
  app.post('/api/admin/cars/:id/announce', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { skipEmail } = (req.body || {}) as { skipEmail?: boolean };

    try {
      const car: any = findCar(db, id);
      if (!car) {
        return res.status(404).json({
          error: 'لم يتم العثور على السيارة. جرّب رقم اللوت أو VIN.',
        });
      }
      const result = announceCarToAllUsers(ctx, car, { skipEmail });
      res.json(result);
    } catch (e: any) {
      console.error('[admin-extras] announce failed:', e);
      res.status(500).json({ error: 'فشل إرسال الإعلان: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/cars/:id/approve-with-schedule ─────────────────────────
  app.post('/api/admin/cars/:id/approve-with-schedule', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { auctionStartTime, auctionEndDate, durationMinutes, announce } = (req.body || {}) as {
      auctionStartTime?: string;
      auctionEndDate?: string;
      durationMinutes?: number;
      announce?: boolean;
    };

    try {
      const car: any = findCar(db, id);
      if (!car) {
        return res.status(404).json({
          error: 'لم يتم العثور على السيارة. جرّب رقم اللوت أو VIN، أو تأكد من الـ carId كاملاً.',
        });
      }
      if (car.status !== 'pending_approval' && car.status !== 'pending') {
        return res
          .status(400)
          .json({ error: 'هذه السيارة ليست بحالة انتظار الموافقة. الحالة الحالية: ' + car.status });
      }

      let startTime: string | null = auctionStartTime || null;
      let endTime: string | null = auctionEndDate || null;

      if (startTime && !isValidISODate(startTime)) {
        return res.status(400).json({ error: 'تاريخ بدء المزاد غير صالح' });
      }
      if (endTime && !isValidISODate(endTime)) {
        return res.status(400).json({ error: 'تاريخ انتهاء المزاد غير صالح' });
      }

      if (startTime && !endTime && durationMinutes && Number(durationMinutes) > 0) {
        endTime = new Date(new Date(startTime).getTime() + Number(durationMinutes) * 60 * 1000).toISOString();
      }

      if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ error: 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء' });
      }

      db.prepare(
        'UPDATE cars SET status = ?, auctionStartTime = ?, auctionEndDate = ? WHERE id = ?'
      ).run('upcoming', startTime, endTime, car.id);

      const updated: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);

      if (updated.sellerId) {
        const dateStr = startTime
          ? new Date(startTime).toLocaleString('ar-LY', { dateStyle: 'long', timeStyle: 'short' })
          : 'سيتم تحديده لاحقاً';
        sendInternalMessage(
          'admin-1',
          updated.sellerId,
          '✅ تمت الموافقة على سيارتك',
          `سيارتك ${updated.make} ${updated.model} الآن في قائمة المزادات القادمة!\n\nتاريخ بدء المزاد: ${dateStr}`
        );
      }

      io.emit('car_updated', {
        id: car.id,
        status: 'upcoming',
        auctionStartTime: startTime,
        auctionEndDate: endTime,
      });

      let announcement: any = null;
      if (announce !== false) {
        try {
          announcement = announceCarToAllUsers(ctx, updated);
        } catch (e: any) {
          console.error('[admin-extras] auto-announce failed:', e);
          announcement = { ok: false, message: e?.message || 'فشل إرسال الإعلان' };
        }
      }

      res.json({ success: true, car: updated, announcement });
    } catch (e: any) {
      console.error('[admin-extras] approve-with-schedule failed:', e);
      res.status(500).json({ error: 'فشل اعتماد السيارة: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/cars/:id/cancel-sale ──────────────────────────────────
  app.post('/api/admin/cars/:id/cancel-sale', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason, suspendWinner, rescheduleStartTime, rescheduleEndTime } = (req.body || {}) as {
      reason?: string;
      suspendWinner?: boolean;
      rescheduleStartTime?: string;
      rescheduleEndTime?: string;
    };

    try {
      const car: any = findCar(db, id);
      if (!car) {
        return res.status(404).json({
          error: 'لم يتم العثور على السيارة. جرّب رقم اللوت أو VIN، أو تأكد من الـ carId كاملاً.',
        });
      }
      if (car.status !== 'closed') {
        return res
          .status(400)
          .json({ error: 'هذه السيارة ليست مباعة. الحالة الحالية: ' + car.status });
      }

      if (rescheduleStartTime && !isValidISODate(rescheduleStartTime)) {
        return res.status(400).json({ error: 'تاريخ إعادة الجدولة (البدء) غير صالح' });
      }
      if (rescheduleEndTime && !isValidISODate(rescheduleEndTime)) {
        return res.status(400).json({ error: 'تاريخ إعادة الجدولة (الانتهاء) غير صالح' });
      }

      const winnerId = car.winnerId as string | null;
      const now = new Date().toISOString();
      const reasonText = (reason && String(reason).trim()) || 'عدم سداد قيمة المزاد';

      const newStatus = rescheduleStartTime || rescheduleEndTime ? 'upcoming' : 'pending_approval';
      const baseBid = Number(car.reservePrice) || 0;

      db.transaction(() => {
        db.prepare(
          "UPDATE invoices SET status = 'cancelled' WHERE carId = ? AND status NOT IN ('paid', 'refunded', 'cancelled')"
        ).run(car.id);

        try {
          db.prepare(
            "UPDATE shipments SET status = 'cancelled', updatedAt = ? WHERE carId = ?"
          ).run(now, car.id);
        } catch {}

        db.prepare(
          `UPDATE cars
             SET status = ?,
                 winnerId = NULL,
                 currentBid = ?,
                 auctionStartTime = ?,
                 auctionEndDate = ?,
                 acceptedBy = NULL,
                 sellerCounterPrice = NULL,
                 offerMarketEndTime = NULL
           WHERE id = ?`
        ).run(newStatus, baseBid, rescheduleStartTime || null, rescheduleEndTime || null, car.id);

        if (suspendWinner && winnerId) {
          const w: any = db.prepare('SELECT role FROM users WHERE id = ?').get(winnerId);
          if (w && w.role !== 'admin') {
            db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(winnerId);
          }
        }
      })();

      if (winnerId) {
        const suffix = suspendWinner
          ? '\n\nتم تعليق حسابك بسبب عدم سداد قيمة المزاد. للاعتراض راسل info@autopro.ac'
          : '';
        sendInternalMessage(
          'admin-1',
          winnerId,
          '⚠️ تم إلغاء بيع السيارة',
          `قامت الإدارة بإلغاء بيع سيارة ${car.make} ${car.model}.\n\nالسبب: ${reasonText}${suffix}`
        );
        sendNotification(winnerId, '⚠️ تم إلغاء البيع', reasonText, 'warning');
      }

      const updated: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(car.id);
      io.emit('car_updated', {
        id: car.id,
        status: updated.status,
        winnerId: null,
        currentBid: updated.currentBid,
        auctionStartTime: updated.auctionStartTime,
        auctionEndDate: updated.auctionEndDate,
      });

      res.json({
        success: true,
        car: updated,
        suspendedWinner: !!(suspendWinner && winnerId),
      });
    } catch (e: any) {
      console.error('[admin-extras] cancel-sale failed:', e);
      res.status(500).json({ error: 'فشل إلغاء البيع: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/users/:id/suspend ───────────────────────────────────
  app.post('/api/admin/users/:id/suspend', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = (req.body || {}) as { reason?: string };

    try {
      const user: any = findUser(db, id);
      if (!user) {
        return res.status(404).json({
          error: 'لم يتم العثور على المستخدم. جرّب البريد الإلكتروني أو userId.',
        });
      }
      if (user.role === 'admin') {
        return res.status(400).json({ error: 'لا يمكن تعليق حساب مدير' });
      }
      if (user.status === 'suspended') {
        return res.status(400).json({ error: 'الحساب معلّق بالفعل' });
      }

      db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(user.id);

      const reasonText = (reason && String(reason).trim()) || 'مخالفة شروط الاستخدام';
      sendInternalMessage(
        'admin-1',
        user.id,
        '⚠️ تم تعليق حسابك',
        `عزيزي ${user.firstName || ''}،\n\nتم تعليق حسابك من قبل الإدارة.\n\nالسبب: ${reasonText}\n\nللاعتراض راسل info@autopro.ac`
      );

      io.to(`user_${user.id}`).emit('account_suspended', { userId: user.id, reason: reasonText });
      res.json({ success: true, user: { id: user.id, email: user.email, status: 'suspended' } });
    } catch (e: any) {
      console.error('[admin-extras] suspend failed:', e);
      res.status(500).json({ error: 'فشل تعليق الحساب: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/users/:id/unsuspend ──────────────────────────────────
  app.post('/api/admin/users/:id/unsuspend', requireAdmin, (req, res) => {
    const { id } = req.params;

    try {
      const user: any = findUser(db, id);
      if (!user) {
        return res.status(404).json({
          error: 'لم يتم العثور على المستخدم. جرّب البريد الإلكتروني أو userId.',
        });
      }
      if (user.status !== 'suspended') {
        return res.status(400).json({ error: 'هذا الحساب ليس معلقاً' });
      }

      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(user.id);

      sendInternalMessage(
        'admin-1',
        user.id,
        '✅ تم استعادة حسابك',
        'تم رفع التعليق عن حسابك. يمكنك الآن استخدام المنصة بشكل طبيعي.'
      );

      io.to(`user_${user.id}`).emit('account_unsuspended', { userId: user.id });
      res.json({ success: true, user: { id: user.id, email: user.email, status: 'active' } });
    } catch (e: any) {
      console.error('[admin-extras] unsuspend failed:', e);
      res.status(500).json({ error: 'فشل استعادة الحساب: ' + (e?.message || e) });
    }
  });
}
