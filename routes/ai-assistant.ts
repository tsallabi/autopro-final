/**
 * AI Assistants (Claude Opus 4.8)
 *
 *   POST /api/admin/assistant   — admin agentic assistant (tool use, requireAdmin)
 *   POST /api/assistant/chat    — customer chat assistant (read-only, public)
 *   GET  /api/assistant/status  — whether the AI brain is configured
 *
 * Both use the shared client in lib/claude.ts and the existing
 * ANTHROPIC_API_KEY. If that key is unset, the endpoints return 503 and the
 * rest of the app is unaffected.
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import { isEnabled, runAgent, chatOnce, type ClaudeTool } from '../lib/claude.ts';

// Libya is UTC+2 (no DST). Next daily live auction = 18:00 Libya = 16:00 UTC.
function nextDailyAuctionIso(): string {
  const DAILY_HOUR_LIBYA = 18;
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_HOUR_LIBYA - 2, 0, 0, 0));
  if (t.getTime() <= now.getTime()) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}

export function registerAiAssistantRoutes(ctx: AppContext) {
  const { app, db, sendNotification, sendEmail } = ctx as any;

  app.get('/api/assistant/status', (_req: any, res: any) => {
    res.json({ enabled: isEnabled(), model: process.env.CLAUDE_MODEL || 'claude-opus-4-8' });
  });

  // ── Customer chat assistant ────────────────────────────────────────────
  // Public, read-only. Answers buyer questions about deposits, bidding, the
  // daily 6 PM auction, KYC, and fees. Two safe read-only tools let it give
  // live, accurate answers instead of guessing.
  const CUSTOMER_TOOLS: ClaudeTool[] = [
    {
      name: 'get_next_daily_auction',
      description: 'Returns the date/time of the next daily live auction (6 PM Libya time) as an ISO timestamp.',
      input_schema: { type: 'object', properties: {} },
      run: () => JSON.stringify({ next_auction_utc: nextDailyAuctionIso(), note: '6 PM Libya time daily' }),
    },
    {
      name: 'get_live_auction_status',
      description: 'Returns whether a car is being auctioned live right now and how many cars are queued.',
      input_schema: { type: 'object', properties: {} },
      run: () => {
        try {
          const live: any = db.prepare("SELECT COUNT(*) AS c FROM cars WHERE status IN ('live','ultimo')").get();
          const upcoming: any = db.prepare("SELECT COUNT(*) AS c FROM cars WHERE status = 'upcoming'").get();
          return JSON.stringify({ live_now: (live?.c || 0) > 0, live_count: live?.c || 0, upcoming_count: upcoming?.c || 0 });
        } catch (e: any) {
          return JSON.stringify({ error: e?.message });
        }
      },
    },
  ];

  const CUSTOMER_SYSTEM = `أنت مساعد خدمة العملاء لمنصة "AutoPro ليبيا أوتو برو" — منصة مزادات سيارات في ليبيا.
مهمتك: مساعدة الزبائن بإجابات قصيرة وواضحة ودقيقة باللغة التي يكتب بها الزبون (عربي أو إنجليزي).

حقائق المنصة (اعتمد عليها فقط — لا تخترع):
- المزاد الحي يومياً الساعة 6 مساءً بتوقيت ليبيا. استخدم أداة get_next_daily_auction لإعطاء الموعد القادم بدقة.
- للمزايدة يجب: (1) دفع العربون، (2) توثيق الهوية (KYC)، (3) تفعيل المزايدة من الإدارة.
- القوة الشرائية = 10 أضعاف قيمة العربون. مثال: عربون 1000 = قوة شرائية 10,000.
- طرق دفع العربون: MyPay (دفع إلكتروني فوري — مُوصى به) أو التواصل مع الدعم عبر واتساب +1 312 910 5416.
- عند الفوز بسيارة تُصدر فواتير: الشراء + النقل الداخلي + الشحن الدولي، تُدفع خلال 7 أيام.
- إن لم يفز المستخدم يُسترجع العربون.

قواعد:
- كن مهذباً وموجزاً (2-4 جمل عادةً).
- إن لم تعرف الإجابة من الحقائق أعلاه، انصح بالتواصل مع الدعم عبر واتساب — لا تخمّن أرقاماً أو سياسات.
- لا تَعِد بأي شيء مالي أو قانوني خارج الحقائق أعلاه.`;

  app.post('/api/assistant/chat', async (req: any, res: any) => {
    if (!isEnabled()) {
      return res.status(503).json({ error: 'المساعد غير مُفعّل حالياً. (ANTHROPIC_API_KEY غير مضبوط)' });
    }
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message مطلوب' });
    }
    try {
      // history: [{role:'user'|'assistant', text:string}] — bounded to last 10.
      const prior = Array.isArray(history)
        ? history.slice(-10)
            .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.text === 'string')
            .map((m: any) => ({ role: m.role, content: String(m.text).slice(0, 4000) }))
        : [];
      const result = await chatOnce({
        system: CUSTOMER_SYSTEM,
        tools: CUSTOMER_TOOLS,
        messages: [...prior, { role: 'user', content: message.slice(0, 4000) }],
        maxTokens: 1200,
      });
      res.json({ reply: result.text || 'عذراً، لم أتمكّن من الإجابة. تواصل مع الدعم عبر واتساب.' });
    } catch (e: any) {
      console.error('[assistant/chat] failed:', e?.message);
      res.status(500).json({ error: 'تعذّر الرد حالياً، حاول لاحقاً.' });
    }
  });

  // ── Admin agentic assistant ────────────────────────────────────────────
  // Tools wrap existing safe/reversible operations. No destructive actions
  // (ban/delete) are exposed — the assistant reports candidates and the admin
  // acts from the panels.
  const ADMIN_TOOLS: ClaudeTool[] = [
    {
      name: 'get_overview',
      description: 'Snapshot of the platform: counts of pending KYC, pending deposits, stuck cars, live/scheduled sessions, and active live cars.',
      input_schema: { type: 'object', properties: {} },
      run: () => {
        const scalar = (sql: string, p: any[] = []) => { try { return (db.prepare(sql).get(...p) as any)?.c || 0; } catch { return 0; } };
        return JSON.stringify({
          pending_kyc: scalar("SELECT COUNT(*) c FROM users WHERE COALESCE(kycStatus,'pending') NOT IN ('approved','rejected') OR COALESCE(status,'')='pending_approval'"),
          rejected_kyc: scalar("SELECT COUNT(*) c FROM users WHERE kycStatus='rejected'"),
          pending_deposits: scalar("SELECT COUNT(*) c FROM payment_requests WHERE type='topup' AND COALESCE(verification_status,'pending')='pending' AND COALESCE(status,'pending')='pending'"),
          live_cars: scalar("SELECT COUNT(*) c FROM cars WHERE status IN ('live','ultimo')"),
          upcoming_cars: scalar("SELECT COUNT(*) c FROM cars WHERE status='upcoming'"),
          live_sessions: scalar("SELECT COUNT(*) c FROM auction_sessions WHERE status='live'"),
          scheduled_sessions: scalar("SELECT COUNT(*) c FROM auction_sessions WHERE status='scheduled'"),
          next_daily_auction_utc: nextDailyAuctionIso(),
        });
      },
    },
    {
      name: 'list_pending_deposits',
      description: 'List wallet top-up requests awaiting review (id, user name, email, phone, amount, hours waiting). Limit 25.',
      input_schema: { type: 'object', properties: {} },
      run: () => {
        try {
          const rows: any[] = db.prepare(`
            SELECT pr.id, pr.amount, pr.requestedAt, u.firstName, u.lastName, u.email, u.phone
              FROM payment_requests pr LEFT JOIN users u ON pr.userId = u.id
             WHERE pr.type='topup' AND COALESCE(pr.verification_status,'pending')='pending' AND COALESCE(pr.status,'pending')='pending'
             ORDER BY pr.requestedAt ASC LIMIT 25`).all();
          return JSON.stringify(rows.map((r) => ({
            id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(' '), email: r.email, phone: r.phone,
            amount: r.amount,
            hours_waiting: r.requestedAt ? Math.round((Date.now() - new Date(r.requestedAt).getTime()) / 3600000) : null,
          })));
        } catch (e: any) { return JSON.stringify({ error: e?.message }); }
      },
    },
    {
      name: 'list_pending_kyc',
      description: 'List users awaiting KYC review (id, name, email, phone, role). Limit 25.',
      input_schema: { type: 'object', properties: {} },
      run: () => {
        try {
          const rows: any[] = db.prepare(`
            SELECT id, firstName, lastName, email, phone, role FROM users
             WHERE (COALESCE(kycStatus,'pending') NOT IN ('approved','rejected') OR COALESCE(status,'')='pending_approval')
               AND COALESCE(role,'') != 'admin'
             ORDER BY joinDate DESC LIMIT 25`).all();
          return JSON.stringify(rows.map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(' '), email: r.email, phone: r.phone, role: r.role })));
        } catch (e: any) { return JSON.stringify({ error: e?.message }); }
      },
    },
    {
      name: 'free_stuck_cars',
      description: 'Reversible cleanup: frees cars stuck (status=upcoming) on closed/cancelled sessions so they can re-enter the daily auction. Returns how many were freed.',
      input_schema: { type: 'object', properties: {} },
      run: () => {
        try {
          const r: any = db.prepare(`
            UPDATE cars SET sessionId = NULL
             WHERE status='upcoming' AND sessionId IS NOT NULL AND sessionId != ''
               AND sessionId IN (SELECT id FROM auction_sessions WHERE status IN ('closed','cancelled'))`).run();
          return JSON.stringify({ freed: r?.changes || 0 });
        } catch (e: any) { return JSON.stringify({ error: e?.message }); }
      },
    },
    {
      name: 'send_user_message',
      description: 'Send a message to one user via in-app notification AND email (if they have one). Use for following up on deposits/KYC. Provide userId, title, body.',
      input_schema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Target user id' },
          title: { type: 'string', description: 'Short subject/title' },
          body: { type: 'string', description: 'Message body (Arabic preferred for Libyan users)' },
        },
        required: ['userId', 'title', 'body'],
      },
      run: async (input: any) => {
        const { userId, title, body } = input || {};
        const user: any = db.prepare('SELECT id, firstName, email FROM users WHERE id = ?').get(userId);
        if (!user) return JSON.stringify({ ok: false, error: 'user not found' });
        let emailed = false;
        try { sendNotification(userId, String(title), String(body), 'info'); } catch {}
        if (user.email && typeof sendEmail === 'function') {
          try {
            await sendEmail({
              to: user.email,
              subject: String(title),
              html: `<div dir="rtl" style="font-family:Arial,sans-serif;padding:20px"><p>مرحباً ${user.firstName || ''}،</p><p style="white-space:pre-wrap">${String(body).replace(/</g, '&lt;')}</p><p style="color:#888;font-size:12px">فريق AutoPro Libya</p></div>`,
            });
            emailed = true;
          } catch {}
        }
        return JSON.stringify({ ok: true, notified: true, emailed, to: user.email || null });
      },
    },
  ];

  const ADMIN_SYSTEM = `أنت المساعد الإداري الذكي لمنصة "AutoPro ليبيا أوتو برو" (مزادات سيارات في ليبيا).
تساعد المدير على إدارة المنصة عبر أدوات حقيقية متصلة بقاعدة البيانات.

ما تستطيع فعله (عبر الأدوات):
- get_overview: نظرة عامة على الأرقام (KYC معلق، إيداعات معلقة، سيارات عالقة، الجلسات، المزاد القادم).
- list_pending_deposits / list_pending_kyc: عرض الطلبات المعلقة.
- free_stuck_cars: تحرير السيارات العالقة على جلسات مغلقة (آمن وقابل للعكس).
- send_user_message: إرسال رسالة لمستخدم (إشعار + إيميل).

قواعد صارمة:
- لا تملك أدوات حذف أو حظر المستخدمين أو اعتماد/رفض KYC أو اعتماد الإيداعات. لهذه الأمور، اعرض القائمة المرشّحة واطلب من المدير تنفيذها من اللوحة المختصة.
- نفّذ فقط ما يطلبه المدير صراحةً. للإجراءات التي تُرسِل رسائل لعدة مستخدمين، نفّذها واحداً تلو الآخر واذكر ملخصاً.
- استخدم الأدوات للحصول على أرقام حقيقية بدل التخمين.
- أجب بالعربية بإيجاز ووضوح، واذكر ما فعلته فعلاً.`;

  app.post('/api/admin/assistant', requireAdmin, async (req: any, res: any) => {
    if (!isEnabled()) {
      return res.status(503).json({ error: 'المساعد غير مُفعّل. اضبط ANTHROPIC_API_KEY على السيرفر.' });
    }
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message مطلوب' });
    }
    try {
      const prior = Array.isArray(history)
        ? history.slice(-8)
            .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.text === 'string')
            .map((m: any) => ({ role: m.role, content: String(m.text).slice(0, 4000) }))
        : [];
      const result = await runAgent({
        system: ADMIN_SYSTEM,
        tools: ADMIN_TOOLS,
        messages: [...prior, { role: 'user', content: message.slice(0, 4000) }],
        maxIterations: 8,
        maxTokens: 4096,
      });
      res.json({ reply: result.text, actions: result.actions, usage: result.usage });
    } catch (e: any) {
      console.error('[admin/assistant] failed:', e?.message);
      res.status(500).json({ error: 'تعذّر تنفيذ الطلب: ' + (e?.message || '') });
    }
  });

  console.log('[ai-assistant] admin + customer assistants ready (enabled=' + isEnabled() + ')');
}
