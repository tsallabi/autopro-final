/**
 * Libya Pro Tech — public contact form
 * POST /api/libyapro/contact  (public, no auth)
 *
 * Receives inquiries from the LibyaProModal in the site footer
 * and routes them to ALL admins as an internal message tagged
 * with category `libyapro_inquiry` so the admin message center
 * can render them with a distinctive style.
 */
import type { AppContext } from '../lib/types.ts';

export function registerLibyaProRoutes(ctx: AppContext) {
  const { app, db, sendInternalMessage } = ctx;

  app.post('/api/libyapro/contact', (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim();
      const phone = String(b.phone || '').trim();
      const email = String(b.email || '').trim();
      const company = String(b.company || '').trim();
      const projectType = String(b.projectType || '').trim();
      const budget = String(b.budget || '').trim();
      const message = String(b.message || '').trim();

      if (!name || !phone || !message) {
        return res.status(400).json({ error: 'الاسم والهاتف والرسالة مطلوبة' });
      }
      if (name.length > 120 || phone.length > 40 || message.length > 4000) {
        return res.status(400).json({ error: 'تجاوزت الحقول الحد المسموح' });
      }

      const subject = `🏢 ليبيا برو للتقنية | استفسار جديد من ${name}`;
      const content = [
        '════════════════════════════════',
        '   📩 رسالة جديدة عبر نموذج ليبيا برو للتقنية',
        '════════════════════════════════',
        '',
        `👤 الاسم: ${name}`,
        `📞 الهاتف: ${phone}`,
        email ? `📧 البريد: ${email}` : null,
        company ? `🏢 الشركة/الجهة: ${company}` : null,
        projectType ? `🛠️ نوع المشروع: ${projectType}` : null,
        budget ? `💰 الميزانية المتوقعة: ${budget}` : null,
        '',
        '─── محتوى الرسالة ───',
        message,
        '',
        '─────────────────',
        '⚡ المصدر: تذييل موقع AutoPro Libya — Libya Pro Tech',
        `🕐 التاريخ: ${new Date().toLocaleString('ar-LY')}`,
      ].filter(Boolean).join('\n');

      const admins: any[] = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      if (admins.length === 0) {
        // Fallback: send to admin-1 even if role missing
        sendInternalMessage('admin-1', 'admin-1', subject, content, 'libyapro_inquiry');
      } else {
        admins.forEach((a: any) => {
          sendInternalMessage('admin-1', a.id, subject, content, 'libyapro_inquiry');
        });
      }

      // Log to a dedicated table for analytics (auto-create if not exists)
      try {
        db.prepare(`CREATE TABLE IF NOT EXISTS libyapro_inquiries (
          id TEXT PRIMARY KEY,
          name TEXT, phone TEXT, email TEXT, company TEXT,
          projectType TEXT, budget TEXT, message TEXT,
          createdAt TEXT
        )`).run();
        db.prepare(`INSERT INTO libyapro_inquiries (id, name, phone, email, company, projectType, budget, message, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(`lp-${Date.now()}`, name, phone, email || null, company || null, projectType || null, budget || null, message, new Date().toISOString());
      } catch {}

      res.json({ success: true, message: 'تم إرسال طلبك بنجاح. سنتواصل معك قريباً.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل إرسال الرسالة' });
    }
  });
}
