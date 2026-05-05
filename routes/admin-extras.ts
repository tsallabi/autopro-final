/**
 * Admin Extras — endpoints that didn't fit cleanly into the original
 * routes/admin.ts (which is already 2877 lines). Lives in its own file so
 * we can iterate on it without touching the giant admin module.
 *
 * Endpoints:
 *   POST /api/admin/cars/:id/approve-with-schedule
 *      Approve a pending car AND set its auction window in one call.
 *      Body: { auctionStartTime?, auctionEndDate?, durationMinutes? }.
 *      If start + duration are given, end is computed.
 *      Sets status='upcoming'. The frontend uses auctionStartTime to flip
 *      the car to 'live' when the time arrives.
 *
 *   POST /api/admin/cars/:id/cancel-sale
 *      Undo a closed sale (winner didn't pay, etc.).
 *      Body: { reason?, suspendWinner?, rescheduleStartTime?, rescheduleEndTime? }
 *      Cancels pending invoices, marks shipment cancelled, clears winnerId,
 *      resets currentBid to reservePrice, and either schedules a new auction
 *      window (if reschedule* given) or returns the car to pending_approval.
 *      Optionally suspends the winner so they can't bid again.
 *
 *   POST /api/admin/users/:id/suspend
 *      Body: { reason? }. Sets status='suspended'. Refuses to suspend admins.
 *
 *   POST /api/admin/users/:id/unsuspend
 *      Reverts status to 'active'. Only valid for currently suspended users.
 *
 * No new dependencies. No DB schema migration — relies only on existing
 * columns (cars.status / winnerId / auctionStartTime / auctionEndDate /
 * currentBid; users.status; invoices.status; shipments.status).
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

function isValidISODate(s: any): boolean {
  if (typeof s !== 'string' || !s) return false;
  const t = new Date(s).getTime();
  return Number.isFinite(t);
}

export function registerAdminExtrasRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, sendInternalMessage } = ctx;

  // ── POST /api/admin/cars/:id/approve-with-schedule ──────────────────────
  app.post('/api/admin/cars/:id/approve-with-schedule', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { auctionStartTime, auctionEndDate, durationMinutes } = (req.body || {}) as {
      auctionStartTime?: string;
      auctionEndDate?: string;
      durationMinutes?: number;
    };

    try {
      const car: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
      if (!car) return res.status(404).json({ error: 'السيارة غير موجودة' });
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

      // If only start + duration given, compute end.
      if (startTime && !endTime && durationMinutes && Number(durationMinutes) > 0) {
        endTime = new Date(new Date(startTime).getTime() + Number(durationMinutes) * 60 * 1000).toISOString();
      }

      if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ error: 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء' });
      }

      db.prepare(
        'UPDATE cars SET status = ?, auctionStartTime = ?, auctionEndDate = ? WHERE id = ?'
      ).run('upcoming', startTime, endTime, id);

      const updated: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);

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
        id,
        status: 'upcoming',
        auctionStartTime: startTime,
        auctionEndDate: endTime,
      });

      res.json({ success: true, car: updated });
    } catch (e: any) {
      console.error('[admin-extras] approve-with-schedule failed:', e);
      res.status(500).json({ error: 'فشل اعتماد السيارة: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/cars/:id/cancel-sale ────────────────────────────────
  app.post('/api/admin/cars/:id/cancel-sale', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason, suspendWinner, rescheduleStartTime, rescheduleEndTime } = (req.body || {}) as {
      reason?: string;
      suspendWinner?: boolean;
      rescheduleStartTime?: string;
      rescheduleEndTime?: string;
    };

    try {
      const car: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
      if (!car) return res.status(404).json({ error: 'السيارة غير موجودة' });
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
        // Cancel any not-yet-finalized invoices for this car.
        db.prepare(
          "UPDATE invoices SET status = 'cancelled' WHERE carId = ? AND status NOT IN ('paid', 'refunded', 'cancelled')"
        ).run(id);

        // Cancel any shipment for this car.
        try {
          db.prepare(
            "UPDATE shipments SET status = 'cancelled', updatedAt = ? WHERE carId = ?"
          ).run(now, id);
        } catch {}

        // Reset the car.
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
        ).run(newStatus, baseBid, rescheduleStartTime || null, rescheduleEndTime || null, id);

        // Optionally suspend the non-paying winner (never the admin).
        if (suspendWinner && winnerId) {
          const w: any = db.prepare('SELECT role FROM users WHERE id = ?').get(winnerId);
          if (w && w.role !== 'admin') {
            db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(winnerId);
          }
        }
      })();

      // Notify winner.
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

      const updated: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
      io.emit('car_updated', {
        id,
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

  // ── POST /api/admin/users/:id/suspend ───────────────────────────────
  app.post('/api/admin/users/:id/suspend', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = (req.body || {}) as { reason?: string };

    try {
      const user: any = db.prepare('SELECT id, firstName, role, status FROM users WHERE id = ?').get(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      if (user.role === 'admin') {
        return res.status(400).json({ error: 'لا يمكن تعليق حساب مدير' });
      }
      if (user.status === 'suspended') {
        return res.status(400).json({ error: 'الحساب معلّق بالفعل' });
      }

      db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(id);

      const reasonText = (reason && String(reason).trim()) || 'مخالفة شروط الاستخدام';
      sendInternalMessage(
        'admin-1',
        id,
        '⚠️ تم تعليق حسابك',
        `عزيزي ${user.firstName || ''}،\n\nتم تعليق حسابك من قبل الإدارة.\n\nالسبب: ${reasonText}\n\nللاعتراض راسل info@autopro.ac`
      );

      io.to(`user_${id}`).emit('account_suspended', { userId: id, reason: reasonText });
      res.json({ success: true });
    } catch (e: any) {
      console.error('[admin-extras] suspend failed:', e);
      res.status(500).json({ error: 'فشل تعليق الحساب: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/users/:id/unsuspend ─────────────────────────────
  app.post('/api/admin/users/:id/unsuspend', requireAdmin, (req, res) => {
    const { id } = req.params;

    try {
      const user: any = db.prepare('SELECT id, firstName, status FROM users WHERE id = ?').get(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      if (user.status !== 'suspended') {
        return res.status(400).json({ error: 'هذا الحساب ليس معلقاً' });
      }

      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);

      sendInternalMessage(
        'admin-1',
        id,
        '✅ تم استعادة حسابك',
        'تم رفع التعليق عن حسابك. يمكنك الآن استخدام المنصة بشكل طبيعي.'
      );

      io.to(`user_${id}`).emit('account_unsuspended', { userId: id });
      res.json({ success: true });
    } catch (e: any) {
      console.error('[admin-extras] unsuspend failed:', e);
      res.status(500).json({ error: 'فشل استعادة الحساب: ' + (e?.message || e) });
    }
  });
}
