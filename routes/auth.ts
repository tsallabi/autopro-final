import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import * as agentcollab from '../lib/agentcollab.ts';
import { applyReferralOnRegister } from '../lib/referrals.ts';

export function registerAuthRoutes(ctx: AppContext) {
  const { app, db, sendEmail, sendNotification, sendInternalMessage, JWT_SECRET, SITE_URL, SALT_ROUNDS } = ctx;

  // ======= AUTH ROUTES =======

  app.post("/api/auth/register", async (req, res) => {
    const {
      firstName, lastName, email, phone, password, role,
      deposit, commission, manager, office,
      companyName, country, address1, address2,
      nationalId, commercialRegister, showroomLicense, iban,
      referralCode,
    } = req.body;
    const id = `user-${Date.now()}`;
    const joinDate = new Date().toISOString();
    const buyingPower = 0; // Starts at 0 until deposit is paid

    try {
      // 🔐 SECURITY: Require password with minimum 6 characters
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "كلمة المرور مطلوبة (6 أحرف على الأقل)" });
      }

      // [user-ban] Reject re-registration from a blocked email or phone.
      try {
        const blocked: any = db.prepare(
          `SELECT 1 FROM blocked_identities
            WHERE (email != '' AND email = ?) OR (phone != '' AND phone = ?) LIMIT 1`
        ).get((email || '').toLowerCase(), phone || '');
        if (blocked) {
          return res.status(403).json({ error: "لا يمكن التسجيل بهذه البيانات. تواصل مع الإدارة." });
        }
      } catch (_) { /* table may not exist on very old DBs — fail open */ }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      db.prepare(`
        INSERT INTO users(
  id, firstName, lastName, email, phone, password, role,
  status, deposit, buyingPower, commission, manager, office,
  companyName, country, address1, address2, joinDate,
  nationalId, commercialRegister, showroomLicense, iban
)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, firstName, lastName, email, phone, hashedPassword, role || 'buyer',
        'pending_approval', 0, buyingPower, commission || 0,
        manager || '', office || '', companyName || '', country || '',
        address1 || '', address2 || '', joinDate,
        nationalId || '', commercialRegister || '', showroomLicense || '', iban || ''
      );

      // [referral] If the user signed up via ?ref=CODE, link them to the referrer
      // so the bonus auto-activates on their first deposit (see mypay route).
      try {
        if (referralCode) {
          const r = applyReferralOnRegister(db, id, referralCode);
          if (r.success) console.log(`[referrals] linked ${id} ← ${r.referrerId} via code ${referralCode}`);
        }
      } catch (e: any) {
        console.error('[referrals] applyReferralOnRegister failed:', e?.message);
      }

      // Send welcome notification using template
      sendNotification(id, '🎉 مرحباً بك في أوتو برو!', 'شكراً لتسجيلك في المنصة. حسابك قيد المراجعة حالياً.', 'success', 'registration_success');

      // Send welcome message to the new user from system (admin-1)
      sendInternalMessage('admin-1', id,
        '🎉 مرحباً بك في AutoPro Libya!',
        `أهلاً ${firstName} ${lastName}!\n\nشكراً لتسجيلك في منصة AutoPro Libya للمزادات. نحن سعداء بانضمامك!\n\nحسابك الآن قيد المراجعة من فريق الإدارة. سيتم إشعارك فور الموافقة.\n\n📋 الخطوات القادمة:\n1. ✅ انتظر موافقة المدير على حسابك\n2. 💰 ادفع العربون البسيط لتفعيل قوتك الشرائية:\n   👉 ${SITE_URL}/deposit\n   • داخل ليبيا: 200 دينار فقط — ادفع عبر MyPay أو حوّل بنكياً مباشرة\n   • خارج ليبيا: $50 دولار فقط\n3. 🏎️ ابدأ المزايدة على السيارات!\n\n💡 معلومة مهمة:\nالقوة الشرائية = العربون × 10\nمثال: إيداع 200 د.ل = قوة شرائية 2,000 د.ل (تقدر تزايد على سيارات أعلى بكثير)\n\nفريق AutoPro Libya 🚗`
      );
      // Also send deposit link as a direct notification
      sendNotification(id, '💰 خطوة مهمة: ادفع العربون',
        `لتفعيل قوتك الشرائية والمزايدة، ادفع عربوناً بسيطاً (داخل ليبيا 200 د.ل / خارج ليبيا $50 فقط). MyPay أو تحويل بنكي.`,
        'info', '/deposit');

      // Generate Verification Token
      const token = crypto.randomBytes(20).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      db.prepare(`INSERT OR REPLACE INTO verification_codes(email, code, expiresAt) VALUES(?, ?, ?)`).run(email, token, expiresAt);

      const verifyLink = `${SITE_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

      // Return user data + JWT token IMMEDIATELY — don't wait for email
      const newUser: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      const authToken = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role, yardRole: newUser.yardRole || null }, JWT_SECRET, { expiresIn: '24h' });
      const { password: _p, ...userWithoutPassword } = newUser;

      // [agentcollab] Track new signup
      agentcollab.track('user.signup', {
        plan: 'free',
        country: country || 'LY',
        source: 'web',
        role: role || 'buyer',
      }, {
        external_user_id: newUser.id,
        external_user_email: newUser.email,
      });

      res.json({ ...userWithoutPassword, token: authToken });

      // Send email & notifications in background (non-blocking)
      setImmediate(async () => {
        try {
          await sendEmail({
            to: email,
            subject: 'يرجى توثيق بريدك الإلكتروني - ليبيا أوتو برو',
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 16px; color: #0f172a;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="color: #ea580c; font-size: 28px; margin: 0;">AUTOPRO AUCTIONS</h1>
                  <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">ليبيا أوتو برو للمزادات</p>
                </div>
                <h2 style="color: #1e293b;">أهلاً ${firstName} 👋</h2>
                <p style="line-height: 1.7; color: #475569;">شكراً لتسجيلك في منصة <strong>AutoPro Libya</strong> للمزادات. نحن سعداء بانضمامك!</p>
                <p style="line-height: 1.7; color: #475569;">لتأكيد بريدك الإلكتروني واستكمال إنشاء حسابك، يرجى النقر على الزر أدناه:</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${verifyLink}" style="display: inline-block; background: #ea580c; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">✅ توثيق البريد الإلكتروني</a>
                </div>
                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                  <h3 style="color: #c2410c; margin: 0 0 12px;">💰 الخطوة التالية: ادفع العربون</h3>
                  <p style="color: #475569; margin: 0 0 8px; font-size: 14px;">بعد تفعيل حسابك، ستحتاج إلى إيداع عربون للمزايدة:</p>
                  <ul style="color: #475569; font-size: 14px; margin: 0 0 16px; padding-right: 20px;">
                    <li>داخل ليبيا: <strong>200 دينار فقط</strong> (MyPay أو تحويل بنكي مباشر)</li>
                    <li>خارج ليبيا: <strong>$50 دولار فقط</strong></li>
                  </ul>
                  <div style="text-align: center;">
                    <a href="${SITE_URL}/deposit" style="display: inline-block; background: #f97316; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">💳 صفحة دفع العربون</a>
                  </div>
                </div>
                <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
                  رابط التوثيق صالح لمدة 24 ساعة فقط. إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد.<br/>
                  <a href="${verifyLink}" style="color: #ea580c; font-size: 11px; word-break: break-all;">${verifyLink}</a>
                </p>
              </div>
            `
          });
          console.log(`[EMAIL] Verification email sent to ${email}`);
        } catch (mailErr) {
          console.error(`[EMAIL ERROR] Failed to send verification to ${email}:`, mailErr);
        }

        // === WELCOME NOTIFICATIONS FOR NEW USER ===

        // Read welcome message settings from DB (fallback to hardcoded defaults)
        const defaultWelcomeContent = `أهلاً \${firstName}! 👋\n\nمرحباً بك في منصة أوتو برو — أكبر منصة مزادات سيارات في ليبيا.\n\n═══════════════════════════\n📋 كيف تبدأ المزايدة؟\n═══════════════════════════\n\nالخطوة 1️⃣ — ادفع العربون\n• الحد الأدنى: 200 د.ل أو $50 فقط\n• القوة الشرائية = 10 أضعاف العربون\n• مثال: إيداع 200 د.ل = قوة شرائية 2,000 د.ل\n• رابط الدفع: \${SITE_URL}/deposit\n\nالخطوة 2️⃣ — وثّق هويتك (KYC)\n• ارفع صورة الهوية أو جواز السفر\n• التوثيق يرفع حدود المزايدة\n• رابط التوثيق: \${SITE_URL}/dashboard/user?view=kyc\n\nالخطوة 3️⃣ — تصفّح السيارات\n• سوق السيارات: \${SITE_URL}/marketplace\n• المزادات المباشرة: \${SITE_URL}/live-auction\n• سوق العروض: \${SITE_URL}/marketplace?tab=offers\n\nالخطوة 4️⃣ — زايد واربح!\n• انقر "زايد" في المزاد المباشر\n• أو قدّم عرض في سوق العروض\n• النظام يمدد الوقت 15 ثانية عند كل مزايدة\n\n═══════════════════════════\n💰 طرق الدفع المتاحة\n═══════════════════════════\n• صداد (المدار) — الأسرع\n• بطاقات بنكية محلية (تداول/نومو)\n• تحويل بنكي (أي مصرف ليبي)\n• Plutu — دفع إلكتروني آمن\n• الدفع النقدي — في مكاتبنا\n\n═══════════════════════════\n📍 مكاتبنا\n═══════════════════════════\n• طرابلس (المقر الرئيسي)\n• بنغازي\n• مصراتة\n• الولايات المتحدة (اللوجستيات)\n\n═══════════════════════════\n🏷️ لماذا أوتو برو؟\n═══════════════════════════\n• وفّر 30-50% مقارنة بالسوق المحلي\n• عمولة 3% فقط — الأقل في السوق\n• شحن مباشر من أمريكا وأوروبا\n• تتبع شحنتك في الوقت الحقيقي\n• ضمان استرداد العربون عند عدم الفوز\n\n═══════════════════════════\n\nابدأ الآن: \${SITE_URL}/deposit\n\nفريق أوتو برو 🧡`;
        const defaultWelcomeSubject = '🎉 مرحباً بك في أوتو برو — دليلك الكامل للبدء';
        const defaultDepositReminder = '💰 ادفع العربون الآن (200 د.ل فقط) واحصل على قوة شرائية 10 أضعاف!';

        const getWelcomeSetting = (key: string) => {
          try {
            const row: any = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
            return row?.value || '';
          } catch { return ''; }
        };

        const welcomeSubject = getWelcomeSetting('welcome_message_subject') || defaultWelcomeSubject;
        let welcomeContent = getWelcomeSetting('welcome_message_content') || defaultWelcomeContent;
        const depositReminder = getWelcomeSetting('deposit_reminder_text') || defaultDepositReminder;

        // Replace placeholders in welcome content
        welcomeContent = welcomeContent
          .replace(/\$\{firstName\}/g, firstName)
          .replace(/\$\{SITE_URL\}/g, SITE_URL);

        // 1. Rich welcome internal message — full onboarding guide
        sendInternalMessage('admin-1', id, welcomeSubject, welcomeContent, 'general');

        // 2. Welcome notification
        sendNotification(id,
          `🎉 مرحباً ${firstName}! حسابك جاهز. ابدأ بدفع العربون للمزايدة → ${SITE_URL}/deposit`,
          'info', '/deposit');

        // 3. Deposit reminder notification
        sendNotification(id, depositReminder, 'warning', '/deposit');

        // 4. Delayed marketing notification about savings
        setTimeout(() => {
          sendNotification(id,
            `📊 وفّر 30-50% على سيارتك القادمة! تصفّح المزادات الآن`,
            'info', '/marketplace');
        }, 3000);

        // 5. Auto-create buyer wallet for new user
        try {
          db.prepare("INSERT OR IGNORE INTO buyer_wallets (userId, balance, reservedAmount, totalDeposited, totalSpent, updatedAt) VALUES (?, 0, 0, 0, 0, ?)")
            .run(id, new Date().toISOString());
        } catch(_) {}

        // Notify all admins about new registration
        const admins: any[] = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        admins.forEach((admin: any) => {
          sendInternalMessage(id, admin.id,
            `📩 طلب انضمام جديد: ${firstName} ${lastName}`,
            `طلب انضمام جديد بانتظار الموافقة:\n\nالاسم: ${firstName} ${lastName}\nالبريد: ${email}\nالهاتف: ${phone}\nنوع الحساب: ${role || 'buyer'}\nالبلد: ${country || 'غير محدد'}\nالهوية: ${nationalId || 'غير مرفقة'}\n\nيرجى مراجعة الطلب من لوحة الإدارة → طلبات الانضمام.`
          );
        });
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً أو بيانات غير صالحة" });
    }
  });

  // ─── Verify Email ──────────────────────────────────────────────────────────
  app.get("/api/auth/verify-email", (req, res) => {
    const { token, email } = req.query;
    try {
      if (!token || !email) return res.status(400).send("<h1 style='color:red; text-align:center; padding-top: 50px;'>رابط غیر صالح</h1>");

      const record: any = db.prepare("SELECT * FROM verification_codes WHERE email = ? AND code = ?").get(email, token);
      if (!record) return res.status(400).send("<h1 style='color:red; text-align:center; padding-top: 50px;'>الرابط منتهي الصلاحية أو غير صحيح</h1>");

      if (new Date() > new Date(record.expiresAt)) {
        return res.status(400).send("<h1 style='color:red; text-align:center; padding-top: 50px;'>الرابط منتهي الصلاحية</h1>");
      }

      // Success
      db.prepare("UPDATE users SET isEmailVerified = 1 WHERE email = ?").run(email);
      db.prepare("DELETE FROM verification_codes WHERE email = ?").run(email);

      res.send(`
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #e0f2fe; height: 100vh;">
          <h1 style="color: #0369a1; font-size: 40px;">تم التحقق بنجاح! ✅</h1>
          <p style="color: #0f172a; font-size: 18px;">بريدك الإلكتروني موثق الآن. سيتم توجيهك للمنصة خلال 3 ثوانٍ...</p>
          <script>setTimeout(() => window.location.href = "/", 3000);</script>
        </div>
      `);
    } catch (e) {
      res.status(500).send("<h1 style='color:red; text-align:center; padding-top: 50px;'>Verification Failed</h1>");
    }
  });

  // ─── Google OAuth ───────────────────────────────────────────────────────────
  app.post("/api/auth/google", async (req, res) => {
    const { credential } = req.body; // ID token from Google Identity Services
    if (!credential) return res.status(400).json({ error: 'credential مطلوب' });
    try {
      const { OAuth2Client } = await import('google-auth-library');
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth غير مُفعّل على الخادم — يرجى إضافة GOOGLE_CLIENT_ID' });

      const gClient = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await gClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload) return res.status(401).json({ error: 'token غير صالح' });

      const { sub: googleId, email, name, given_name, family_name, picture } = payload;
      if (!email) return res.status(400).json({ error: 'لم يتم استلام البريد الإلكتروني من Google' });

      // Check if user exists by googleId or email
      let user: any = db.prepare("SELECT * FROM users WHERE googleId = ? OR email = ?").get(googleId, email);
      let isNewUser = false;

      if (user) {
        // Link googleId if not already linked
        if (!user.googleId) {
          db.prepare("UPDATE users SET googleId = ?, profilePic = COALESCE(profilePic, ?) WHERE id = ?")
            .run(googleId, picture || null, user.id);
        }
        user = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate, googleId, profilePic, isEmailVerified FROM users WHERE id = ?").get(user.id);
      } else {
        // Register new user via Google
        isNewUser = true;
        const id = `user-g-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const joinDate = new Date().toISOString();
        const buyingPower = 0;
        db.prepare(`
          INSERT INTO users(id, firstName, lastName, email, role, status, googleId, profilePic,
            joinDate, buyingPower, commission, country, isEmailVerified)
          VALUES(?, ?, ?, ?, 'buyer', 'pending_approval', ?, ?, ?, ?, 0, 'ليبيا', 1)
        `).run(id, given_name || name || 'مستخدم', family_name || 'جوجل', email,
               googleId, picture || null, joinDate, buyingPower);

        user = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate, googleId, profilePic, isEmailVerified FROM users WHERE id = ?").get(id);

        // Welcome notification
        sendNotification(id, '🎉 مرحباً بك في أوتو برو!', 'تم تسجيلك عبر حساب Google. حسابك قيد المراجعة.', 'success', 'registration_success');

        // Admin notification
        const admins: any[] = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        admins.forEach((admin: any) => {
          sendInternalMessage(id, admin.id, `📩 تسجيل جديد عبر Google: ${given_name} ${family_name}`,
            `مستخدم جديد سجّل عبر Google:\nالاسم: ${given_name} ${family_name}\nالبريد: ${email}`);
        });

        // Send welcome email (non-blocking)
        setImmediate(async () => {
          try {
            await sendEmail({
              to: email,
              subject: 'مرحباً بك في ليبيا أوتو برو 🎉',
              html: `<div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#ea580c;">أهلاً ${given_name} 👋</h2>
                <p>تم تسجيلك بنجاح عبر حساب Google. حسابك قيد المراجعة من فريق الإدارة.</p>
                <p style="font-size:12px;color:#94a3b8;">ليبيا أوتو برو للمزادات</p>
              </div>`
            });
          } catch (_) {}
        });
      }

      // [agentcollab] Track Google signup (new) or login (existing)
      agentcollab.track(isNewUser ? 'user.signup' : 'user.login', {
        method: 'google',
        country: user.country || 'LY',
      }, {
        external_user_id: user.id,
        external_user_email: user.email,
      });

      // Generate JWT for authenticated session
      const authToken = jwt.sign({ id: user.id, email: user.email, role: user.role, yardRole: (user as any).yardRole || null }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ ...user, token: authToken });
    } catch (err: any) {
      console.error('[GOOGLE AUTH ERROR]', err?.message);
      res.status(401).json({ error: 'فشل التحقق من حساب Google: ' + (err?.message || 'خطأ غير معروف') });
    }
  });

  // ─── Facebook OAuth ─────────────────────────────────────────────────────────
  app.post("/api/auth/facebook", async (req, res) => {
    const { accessToken, userID } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'accessToken مطلوب' });
    try {
      const FB_APP_ID = process.env.FACEBOOK_APP_ID;
      const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
      if (!FB_APP_ID || !FB_APP_SECRET) {
        return res.status(500).json({ error: 'Facebook OAuth غير مُفعّل على الخادم — يرجى إضافة FACEBOOK_APP_ID و FACEBOOK_APP_SECRET' });
      }

      // 1) Verify the token with Facebook
      const verifyUrl = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${FB_APP_ID}|${FB_APP_SECRET}`;
      const verifyRes = await fetch(verifyUrl);
      const verifyData: any = await verifyRes.json();
      if (!verifyData?.data?.is_valid || verifyData?.data?.app_id !== FB_APP_ID) {
        return res.status(401).json({ error: 'Facebook token غير صالح' });
      }

      // 2) Fetch user profile
      const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,first_name,last_name,email,picture.type(large)&access_token=${accessToken}`);
      const profile: any = await profileRes.json();
      if (!profile?.id) return res.status(401).json({ error: 'فشل جلب ملف Facebook' });

      const fbId = profile.id;
      const email = profile.email || `fb_${fbId}@facebook.autopro.ac`; // Facebook may omit email
      const firstName = profile.first_name || profile.name?.split(' ')[0] || 'Facebook';
      const lastName = profile.last_name || profile.name?.split(' ').slice(1).join(' ') || 'User';
      const picture = profile.picture?.data?.url || null;

      // 3) Find or create user
      let user: any = db.prepare("SELECT * FROM users WHERE facebookId = ? OR email = ?").get(fbId, email);
      let isNewUser = false;

      if (user) {
        if (!user.facebookId) {
          try {
            db.prepare("UPDATE users SET facebookId = ?, profilePic = COALESCE(profilePic, ?) WHERE id = ?")
              .run(fbId, picture, user.id);
          } catch (e: any) {
            // Column may not exist yet — best-effort
            console.log('[FB AUTH] facebookId column missing, run migration');
          }
        }
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
      } else {
        isNewUser = true;
        const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const joinDate = new Date().toISOString();
        const buyingPower = 0;
        const role = 'buyer';
        // 🔐 SECURITY: Match the email/Google flow — admin must review and
        // approve before the user can bid. Previously this was 'active',
        // which let Facebook signups bypass the approval queue entirely.
        const status = 'pending_approval';
        try {
          db.prepare(`
            INSERT INTO users(id, firstName, lastName, email, role, status, facebookId, profilePic,
                              joinDate, buyingPower, isEmailVerified, password, country, phone)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '', 'ليبيا', '')
          `).run(id, firstName, lastName, email, role, status, fbId, picture, joinDate, buyingPower);
        } catch (e: any) {
          // Fallback: insert without facebookId if column missing
          db.prepare(`
            INSERT INTO users(id, firstName, lastName, email, role, status, profilePic,
                              joinDate, buyingPower, isEmailVerified, password, country, phone)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '', 'ليبيا', '')
          `).run(id, firstName, lastName, email, role, status, picture, joinDate, buyingPower);
        }
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      }

      // [agentcollab] Track Facebook signup (new) or login (existing)
      agentcollab.track(isNewUser ? 'user.signup' : 'user.login', {
        method: 'facebook',
        country: user.country || 'LY',
      }, {
        external_user_id: user.id,
        external_user_email: user.email,
      });

      const authToken = jwt.sign({ id: user.id, email: user.email, role: user.role, yardRole: (user as any).yardRole || null }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ ...user, token: authToken });
    } catch (err: any) {
      console.error('[FACEBOOK AUTH ERROR]', err?.message);
      res.status(401).json({ error: 'فشل التحقق من حساب Facebook: ' + (err?.message || 'خطأ غير معروف') });
    }
  });

  // ─── Facebook Data Deletion Callback ────────────────────────────────────────
  // Required by Facebook — returns a JSON with confirmation URL
  app.post("/api/auth/facebook/data-deletion", async (req, res) => {
    try {
      const { signed_request } = req.body;
      const confirmationCode = `del-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      // Log the deletion request — actual deletion happens asynchronously via privacy@autopro.ac
      console.log('[FB DATA DELETION]', { signed_request: signed_request?.substring(0, 20) + '...', code: confirmationCode });
      res.json({
        url: `https://autopro.ac/privacy#data-deletion`,
        confirmation_code: confirmationCode,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ─── Login ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt: ${email}`);
    try {
      const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        console.log(`Login failed: user not found for ${email}`);
        return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      }

      // [user-ban] Block banned accounts and anyone on the blocklist
      // (email or phone) from logging back in.
      if (String(user.status || '').toLowerCase() === 'banned') {
        return res.status(403).json({ error: "تم حظر هذا الحساب. للاستفسار تواصل مع الإدارة." });
      }
      try {
        const blocked: any = db.prepare(
          `SELECT 1 FROM blocked_identities
            WHERE (email != '' AND email = ?) OR (phone != '' AND phone = ?) LIMIT 1`
        ).get((user.email || '').toLowerCase(), user.phone || '');
        if (blocked) {
          return res.status(403).json({ error: "تم حظر هذا الحساب. للاستفسار تواصل مع الإدارة." });
        }
      } catch (_) { /* table may not exist on very old DBs — fail open */ }

      if (user.isEmailVerified === 0) {
        return res.status(403).json({ error: "يرجى تأكيد بريدك الإلكتروني أولاً عبر الرابط المرسل إليك" });
      }

      // 🔐 SECURITY: Support both hashed (new) and plain (legacy seed) passwords
      let passwordMatch = false;
      if (user.password.startsWith('$2')) {
        // bcrypt hashed password
        passwordMatch = await bcrypt.compare(password, user.password);
      } else {
        // Legacy plain text (seed data) - auto-upgrade on login
        passwordMatch = password === user.password;
        if (passwordMatch) {
          // Upgrade to hashed password silently
          const hashed = await bcrypt.hash(password, SALT_ROUNDS);
          db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, user.id);
          console.log(`Password upgraded to bcrypt for user: ${email}`);
        }
      }

      if (!passwordMatch) {
        console.log(`Login failed: wrong password for ${email}`);
        return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      }

      // ✅ Generate JWT token (24 hour expiry)
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log(`Login success for: ${email}`);
      // Update last login
      db.prepare("UPDATE users SET lastLogin = ?, loginCount = COALESCE(loginCount, 0) + 1 WHERE id = ?")
        .run(new Date().toISOString(), user.id);

      // [agentcollab] Track login
      agentcollab.track('user.login', { method: 'password' }, {
        external_user_id: user.id,
        external_user_email: user.email,
      });

      // Return user data + token (exclude password from response)
      const { password: _pass, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, token });
    } catch (e) {
      console.error('Login error:', e);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  });

  // ─── Update Profile ─────────────────────────────────────────────────────────
  // POST /api/user/update-profile — user updates their profile info
  app.post("/api/user/update-profile", requireAuth, (req, res) => {
    try {
      const id = (req as any).user.id;
      const { firstName, lastName, phone, address } = req.body;
      if (!id) return res.status(400).json({ error: "Missing ID" });

      const stmt = db.prepare(`
        UPDATE users
        SET firstName = ?, lastName = ?, phone = ?, address1 = ?
        WHERE id = ?
      `);
      const info = stmt.run(firstName, lastName, phone, address, id);

      if (info.changes > 0) {
        const updatedUser: any = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE id = ?").get(id);
        res.json({ success: true, user: updatedUser });
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Change Password ────────────────────────────────────────────────────────
  // POST /api/user/change-password — user changes their password
  app.post("/api/user/change-password", requireAuth, (req, res) => {
    try {
      const id = (req as any).user.id;
      const { currentPassword, newPassword } = req.body;
      if (!id || !currentPassword || !newPassword) return res.status(400).json({ error: "Missing fields" });

      const user: any = db.prepare("SELECT password FROM users WHERE id = ?").get(id) as any;
      if (!user) return res.status(404).json({ error: "User not found" });

      const match = bcrypt.compareSync(currentPassword, user.password);
      if (!match) return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });

      const hashed = bcrypt.hashSync(newPassword, SALT_ROUNDS);
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, id);

      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Forgot Password ───────────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

      const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as any;
      // Always return success to prevent email enumeration
      if (!user) return res.json({ success: true, message: "إذا كان البريد مسجلاً، سيصلك رمز إعادة التعيين" });

      // Generate 6-digit code
      const token = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

      // Remove old tokens for this email
      db.prepare("DELETE FROM password_reset_tokens WHERE email = ?").run(email);
      // Insert new token
      db.prepare("INSERT INTO password_reset_tokens (email, token, expiresAt) VALUES (?, ?, ?)").run(email, token, expiresAt);

      // Return success immediately — send email in background
      res.json({ success: true, message: "إذا كان البريد مسجلاً، سيصلك رمز إعادة التعيين" });

      // Send email (non-blocking)
      sendEmail({
        to: email,
        subject: "رمز إعادة تعيين كلمة المرور — AutoPro",
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#f97316;">إعادة تعيين كلمة المرور</h2>
            <p>رمز التحقق الخاص بك هو:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f8fafc;border-radius:12px;padding:20px;margin:16px 0;color:#0f172a;">${token}</div>
            <p style="color:#64748b;font-size:13px;">ينتهي صلاحية هذا الرمز خلال 15 دقيقة. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة.</p>
          </div>
        `,
      }).catch(err => console.error('[FORGOT-PASSWORD EMAIL]', err.message));
    } catch (e: any) {
      console.error("[FORGOT-PASSWORD ERROR]", e);
      res.status(500).json({ error: "حدث خطأ — يرجى المحاولة لاحقاً" });
    }
  });

  // ─── Reset Password ─────────────────────────────────────────────────────────
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;
      if (!email || !token || !newPassword) return res.status(400).json({ error: "جميع الحقول مطلوبة" });
      if (newPassword.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });

      const row = db.prepare("SELECT * FROM password_reset_tokens WHERE email = ? AND token = ?").get(email, token) as any;
      if (!row) return res.status(400).json({ error: "رمز التحقق غير صحيح" });
      if (new Date(row.expiresAt) < new Date()) {
        db.prepare("DELETE FROM password_reset_tokens WHERE email = ?").run(email);
        return res.status(400).json({ error: "انتهت صلاحية رمز التحقق — اطلب رمزاً جديداً" });
      }

      const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
      db.prepare("UPDATE users SET password = ? WHERE email = ?").run(hashed, email);
      db.prepare("DELETE FROM password_reset_tokens WHERE email = ?").run(email);

      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح — يمكنك تسجيل الدخول الآن" });
    } catch (e: any) {
      console.error("[RESET-PASSWORD ERROR]", e);
      res.status(500).json({ error: "حدث خطأ — يرجى المحاولة لاحقاً" });
    }
  });
}
