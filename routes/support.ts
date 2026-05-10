/**
 * Support Inquiries — public chat-widget backend.
 *
 * Visitors (logged-in OR guest) submit a question via the floating chat
 * widget and pick one of five departments. The admin sees them grouped
 * in /dashboard/admin?view=messages and replies. The reply is delivered
 * automatically:
 *
 *   - logged-in user → existing internal message (sendInternalMessage)
 *     they see it in their on-site message center.
 *   - guest          → email (sendEmail) to the email they typed in
 *     when they submitted.
 *
 *   POST /api/support/inquiry              (public)
 *   GET  /api/admin/support/inquiries      (admin)
 *   POST /api/admin/support/inquiries/:id/reply  (admin)
 *   POST /api/admin/support/inquiries/:id/close  (admin)
 *   GET  /api/admin/support/stats          (admin) — counts per department
 *
 * Schema (idempotent):
 *   support_inquiries(id, userId?, guestName?, guestEmail?, department,
 *                     subject?, message, status, adminReply?, repliedBy?,
 *                     repliedAt?, createdAt)
 *
 * Departments: registration | customers | accounting | complaints | shipping
 * (validated server-side; anything else falls through to 'general').
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import jwt from 'jsonwebtoken';

const VALID_DEPARTMENTS = ['registration', 'customers', 'accounting', 'complaints', 'shipping', 'general'] as const;
type Department = (typeof VALID_DEPARTMENTS)[number];

const DEPARTMENT_LABELS: Record<Department, string> = {
  registration: 'إدارة التسجيل',
  customers: 'إدارة العملاء',
  accounting: 'إدارة المحاسبة',
  complaints: 'إدارة الشكاوى',
  shipping: 'إدارة الشحن',
  general: 'استفسار عام',
};

function ensureSchema(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_inquiries (
      id TEXT PRIMARY KEY,
      userId TEXT,
      guestName TEXT,
      guestEmail TEXT,
      department TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      adminReply TEXT,
      repliedBy TEXT,
      repliedAt TEXT,
      createdAt TEXT NOT NULL
    )
  `);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_support_status ON support_inquiries(status, createdAt DESC)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_support_dept ON support_inquiries(department, status)`); } catch {}
}

// Optional auth helper — extracts userId from Authorization header if
// present, but doesn't fail when it's missing (the endpoint is public).
function tryDecodeUser(req: any, jwtSecret: string): string | null {
  const auth = req.headers?.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const decoded: any = jwt.verify(auth.slice(7), jwtSecret);
    return decoded?.id || null;
  } catch {
    return null;
  }
}

function buildEmailHtml(opts: {
  recipientName: string;
  department: string;
  originalSubject: string;
  originalMessage: string;
  reply: string;
  siteUrl: string;
}): string {
  return `<!DOCTYPE html><html dir="rtl"><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
      <div style="border-bottom:2px solid #fb923c;padding-bottom:16px;margin-bottom:20px;">
        <h2 style="color:#0f172a;margin:0;font-size:20px;">📩 رد على استفسارك من AutoPro Libya</h2>
        <div style="color:#64748b;font-size:13px;margin-top:6px;">القسم: ${opts.department}</div>
      </div>
      <p style="font-size:15px;color:#0f172a;line-height:1.6;">السلام عليكم ${opts.recipientName}،</p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;margin:16px 0;">
        <div style="color:#9a3412;font-weight:bold;font-size:13px;margin-bottom:8px;">استفسارك:</div>
        ${opts.originalSubject ? `<div style="color:#0f172a;font-weight:bold;margin-bottom:6px;">${opts.originalSubject}</div>` : ''}
        <div style="color:#475569;white-space:pre-wrap;font-size:14px;">${opts.originalMessage}</div>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0;">
        <div style="color:#166534;font-weight:bold;font-size:13px;margin-bottom:8px;">ردنا:</div>
        <div style="color:#0f172a;white-space:pre-wrap;font-size:14px;line-height:1.7;">${opts.reply}</div>
      </div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
        <a href="${opts.siteUrl}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">زيارة AutoPro</a>
      </div>
      <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:24px;">
        AutoPro Libya — مزادات السيارات<br/>
        info@autopro.ac
      </p>
    </div>
  </body></html>`;
}

export function registerSupportRoutes(ctx: AppContext) {
  const { app, db, sendInternalMessage, sendEmail, JWT_SECRET, SITE_URL } = ctx as any;
  ensureSchema(db);
  const siteUrl: string = SITE_URL || 'https://autopro.ac';

  // ── POST /api/support/inquiry — public ────────────────────────────────
  app.post('/api/support/inquiry', (req: any, res: any) => {
    const { name, email, department, subject, message } = req.body || {};
    const dept: Department = VALID_DEPARTMENTS.includes(department) ? department : 'general';
    const userId = tryDecodeUser(req, JWT_SECRET);
    const finalMessage = String(message || '').trim();

    if (!finalMessage) {
      return res.status(400).json({ error: 'نص الرسالة مطلوب' });
    }
    if (finalMessage.length > 4000) {
      return res.status(400).json({ error: 'الرسالة طويلة جداً (الحد الأقصى 4000 حرف)' });
    }

    let guestName: string | null = null;
    let guestEmail: string | null = null;

    if (userId) {
      // Logged-in: we don't need name/email — we have the user record.
    } else {
      const cleanEmail = String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب لاستلام الرد' });
      }
      guestName = String(name || '').trim() || 'زائر';
      guestEmail = cleanEmail;
    }

    const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO support_inquiries
          (id, userId, guestName, guestEmail, department, subject, message, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
      `).run(id, userId, guestName, guestEmail,
             dept, subject ? String(subject).trim() : null,
             finalMessage, createdAt);

      // Notify admin so the inbox/badge updates immediately. Subject and
      // body include the department label and guest contact info so the
      // admin can decide priority.
      try {
        const senderLabel = userId ? `مستخدم مسجَّل` : `${guestName || 'زائر'} <${guestEmail}>`;
        sendInternalMessage('admin-1', 'admin-1',
          `📩 استفسار جديد — ${DEPARTMENT_LABELS[dept]}`,
          `من: ${senderLabel}\n\n` +
          `الموضوع: ${subject || '—'}\n\n` +
          `الرسالة:\n${finalMessage}\n\n` +
          `(افتح "مركز الدعم" للرد)`,
          'support_inquiry'
        );
      } catch {}

      res.json({
        success: true,
        id,
        message: userId
          ? 'تم إرسال استفسارك. سيصلك الرد في مركز الرسائل بحسابك.'
          : 'تم إرسال استفسارك. سيصلك الرد على بريدك الإلكتروني قريباً.',
      });
    } catch (e: any) {
      console.error('[support] inquiry insert failed:', e?.message);
      res.status(500).json({ error: 'فشل إرسال الاستفسار' });
    }
  });

  // ── GET /api/admin/support/inquiries — admin ──────────────────────────
  app.get('/api/admin/support/inquiries', requireAdmin, (req: any, res: any) => {
    const status = String(req.query?.status || 'all');
    const dept = String(req.query?.department || 'all');
    try {
      const conds: string[] = [];
      const params: any[] = [];
      if (status !== 'all') { conds.push('si.status = ?'); params.push(status); }
      if (dept !== 'all') { conds.push('si.department = ?'); params.push(dept); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT si.*,
               u.firstName AS userFirstName,
               u.lastName  AS userLastName,
               u.email     AS userEmail,
               u.phone     AS userPhone
          FROM support_inquiries si
          LEFT JOIN users u ON si.userId = u.id
          ${where}
          ORDER BY si.createdAt DESC
          LIMIT 500
      `).all(...params);
      res.json({ count: rows.length, inquiries: rows, departmentLabels: DEPARTMENT_LABELS });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── GET /api/admin/support/stats — admin counts per department ────────
  app.get('/api/admin/support/stats', requireAdmin, (_req: any, res: any) => {
    try {
      const totals = db.prepare(`
        SELECT department, status, COUNT(*) AS count
          FROM support_inquiries
         GROUP BY department, status
      `).all() as any[];
      const open = (db.prepare(`SELECT COUNT(*) AS c FROM support_inquiries WHERE status = 'open'`).get() as any).c;
      res.json({ totals, open, departmentLabels: DEPARTMENT_LABELS });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/support/inquiries/:id/reply — admin ───────────────
  app.post('/api/admin/support/inquiries/:id/reply', requireAdmin, async (req: any, res: any) => {
    const { id } = req.params;
    const { reply } = req.body || {};
    if (!reply || !String(reply).trim()) {
      return res.status(400).json({ error: 'نص الرد مطلوب' });
    }
    const adminId = req.user?.id || 'admin-1';
    const replyText = String(reply).trim();
    const now = new Date().toISOString();

    try {
      const inq: any = db.prepare('SELECT * FROM support_inquiries WHERE id = ?').get(id);
      if (!inq) return res.status(404).json({ error: 'الاستفسار غير موجود' });

      db.prepare(`
        UPDATE support_inquiries
           SET adminReply = ?, repliedBy = ?, repliedAt = ?, status = 'answered'
         WHERE id = ?
      `).run(replyText, adminId, now, id);

      const subject = `📩 رد على استفسارك — ${DEPARTMENT_LABELS[inq.department as Department] || inq.department}`;
      const body = (inq.subject ? `الاستفسار: ${inq.subject}\n\n` : '') +
                   `${replyText}\n\n— فريق AutoPro Libya`;

      let deliveredVia: 'in-app' | 'email' | 'none' = 'none';

      if (inq.userId) {
        try {
          sendInternalMessage(adminId, inq.userId, subject, body, 'support_reply');
          deliveredVia = 'in-app';
        } catch (e: any) {
          console.error('[support] in-app reply failed:', e?.message);
        }
      } else if (inq.guestEmail) {
        try {
          await sendEmail({
            to: inq.guestEmail,
            subject,
            html: buildEmailHtml({
              recipientName: inq.guestName || 'زائر',
              department: DEPARTMENT_LABELS[inq.department as Department] || inq.department,
              originalSubject: inq.subject || '',
              originalMessage: inq.message,
              reply: replyText,
              siteUrl,
            }),
          });
          deliveredVia = 'email';
        } catch (e: any) {
          console.error('[support] email reply failed:', e?.message);
        }
      }

      res.json({ success: true, deliveredVia });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/support/inquiries/:id/close — admin ───────────────
  app.post('/api/admin/support/inquiries/:id/close', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    try {
      db.prepare(`UPDATE support_inquiries SET status = 'closed' WHERE id = ?`).run(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  console.log('[support] inquiry endpoints + admin reply ready');
}
