/**
 * Referrals API.
 *   GET  /api/user/:id/referral-info       — owner or admin
 *   POST /api/admin/referrals/activate/:id — admin manual activation
 *   GET  /api/admin/referrals/leaderboard  — top referrers
 */
import { requireAuth, requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import {
  ensureReferralSchema,
  getReferralInfo,
  activateReferralBonus,
  REFERRAL_BONUS_LYD,
} from '../lib/referrals.ts';

export function registerReferralRoutes(ctx: AppContext) {
  const { app, db, SITE_URL } = ctx as any;

  ensureReferralSchema(db);
  console.log(`[referrals] schema ready, bonus = ${REFERRAL_BONUS_LYD} LYD per referral`);

  app.get('/api/user/:id/referral-info', requireAuth, (req: any, res: any) => {
    const { id } = req.params;
    const requester = req.user;
    if (requester.id !== id && requester.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح بالوصول لبيانات إحالة مستخدم آخر' });
    }
    try {
      const info = getReferralInfo(db, id, SITE_URL);
      res.json(info);
    } catch (e: any) {
      res.status(500).json({ error: 'فشل جلب بيانات الإحالة: ' + (e?.message || e) });
    }
  });

  app.post('/api/admin/referrals/activate/:id', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    const bonusLYD = Number(req.body?.bonusLYD) || REFERRAL_BONUS_LYD;
    try {
      const result = activateReferralBonus(db, id, bonusLYD);
      if (!result.success) {
        return res.status(400).json({ error: 'لم يتم العثور على إحالة معلّقة لهذا المستخدم' });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: 'فشل تفعيل الإحالة: ' + (e?.message || e) });
    }
  });

  app.get('/api/admin/referrals/leaderboard', requireAdmin, (_req: any, res: any) => {
    try {
      const rows: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email,
               u.referralCode, u.referralBonusLYD,
               (SELECT COUNT(*) FROM referrals r WHERE r.referrerId = u.id) AS totalReferrals,
               (SELECT COUNT(*) FROM referrals r WHERE r.referrerId = u.id AND r.status = 'activated') AS activatedReferrals
          FROM users u
         WHERE u.referralCode IS NOT NULL
           AND EXISTS (SELECT 1 FROM referrals r WHERE r.referrerId = u.id)
         ORDER BY activatedReferrals DESC, totalReferrals DESC
         LIMIT 50
      `).all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: 'فشل جلب قائمة المحيلين: ' + (e?.message || e) });
    }
  });
}
