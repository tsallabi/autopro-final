/**
 * Announce a new car to all registered users.
 *
 * Sends, for each active non-admin user:
 *   1. Internal message (in their inbox) — now with image markdown + link
 *   2. Notification (bell icon) — now with image URL in data + link
 *   3. Email with the hero image, price, schedule, and a "View car" CTA
 */
import type { AppContext } from './types.ts';

interface AnnounceOptions {
  skipEmail?: boolean;
  recipientFilter?: string;
}

interface AnnounceResult {
  ok: boolean;
  carId: string;
  recipientsCount: number;
  message: string;
}

function safeImages(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function fmtMoney(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return '$' + n.toLocaleString();
}

function fmtDate(iso: any): string {
  if (!iso) return 'قريباً — سيتم تحديد الموعد';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'قريباً';
  return d.toLocaleString('ar-LY', { dateStyle: 'long', timeStyle: 'short' });
}

/**
 * Resolve a possibly-relative image path to an absolute URL.
 * Uploads stored as "/uploads/cars/x.jpg" need SITE_URL prefix for emails
 * and notification thumbnails to load from non-same-origin clients.
 */
function absoluteImageUrl(siteUrl: string, raw: string | undefined | null): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/')) return siteUrl.replace(/\/$/, '') + s;
  return siteUrl.replace(/\/$/, '') + '/' + s;
}

function buildEmailHtml(car: any, siteUrl: string): string {
  const images = safeImages(car.images);
  const hero = absoluteImageUrl(siteUrl, images[0]);
  const reserve = fmtMoney(car.reservePrice);
  const buyNow = car.buyItNow ? fmtMoney(car.buyItNow) : null;
  const start = fmtDate(car.auctionStartTime);
  const carUrl = `${siteUrl}/car-details/${car.id}`;
  const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim();

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>سيارة جديدة في المزاد</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;padding:16px 0;border-bottom:3px solid #ea580c;">
      <h1 style="color:#ea580c;margin:0;font-size:28px;">AUTOPRO AUCTIONS</h1>
      <p style="color:#64748b;margin:4px 0 0;font-size:14px;">🚗 سيارة جديدة دخلت المزاد!</p>
    </div>
    ${hero ? `<a href="${carUrl}" style="display:block;"><img src="${hero}" alt="${title}" style="width:100%;max-height:340px;object-fit:cover;border-radius:14px;margin:18px 0;display:block;"></a>` : ''}
    <h2 style="color:#1e293b;margin:0 0 12px;font-size:22px;"><a href="${carUrl}" style="color:#1e293b;text-decoration:none;">${title}</a></h2>
    <table style="width:100%;border-collapse:collapse;color:#475569;font-size:15px;line-height:1.7;">
      <tr><td style="padding:6px 0;width:120px;">📍 <strong>الموقع:</strong></td><td>${car.location || 'غير محدد'}</td></tr>
      <tr><td style="padding:6px 0;">💰 <strong>السعر:</strong></td><td>${reserve}</td></tr>
      ${buyNow ? `<tr><td style="padding:6px 0;">⚡ <strong>اشترِها الآن:</strong></td><td>${buyNow}</td></tr>` : ''}
      <tr><td style="padding:6px 0;">🏁 <strong>موعد المزاد:</strong></td><td>${start}</td></tr>
      ${car.lotNumber ? `<tr><td style="padding:6px 0;">🔖 <strong>رقم اللوت:</strong></td><td>${car.lotNumber}</td></tr>` : ''}
    </table>
    <div style="text-align:center;margin:28px 0;">
      <a href="${carUrl}" style="display:inline-block;background:#ea580c;color:#fff;padding:14px 36px;text-decoration:none;border-radius:10px;font-weight:bold;font-size:16px;">👁️ شاهد السيارة وزايد</a>
    </div>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;margin-top:16px;color:#9a3412;font-size:13px;text-align:center;">
      💡 سجّل بياناتك بسرعة وادفع العربون لتشارك في المزاد. الأماكن محدودة!
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px;">
      AutoPro Libya — منصة المزادات الأولى<br/>
      هذه رسالة آلية، لإيقاف الإشعارات راجع إعدادات حسابك.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Build the inbox-message content. The frontend message renderer detects:
 *   - Markdown image syntax  ![alt](url)  → renders <img>
 *   - Bare https?:// URLs    → renders clickable <a>
 * Both are safe (no HTML injection — frontend escapes everything else).
 */
function buildPlainMessage(car: any, siteUrl: string, heroAbs: string): { subject: string; content: string } {
  const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim();
  const subject = `🚗 سيارة جديدة في المزاد: ${title}`;
  const reserve = fmtMoney(car.reservePrice);
  const start = fmtDate(car.auctionStartTime);
  const carUrl = `${siteUrl}/car-details/${car.id}`;

  const imageLine = heroAbs ? `\n${heroAbs}\n` : '';

  const content =
`سيارة جديدة دخلت المزاد!

🚗 ${title}${imageLine}
📍 الموقع: ${car.location || 'غير محدد'}
💰 السعر: ${reserve}${car.buyItNow ? `\n⚡ اشترِها الآن: ${fmtMoney(car.buyItNow)}` : ''}
🏁 موعد المزاد: ${start}${car.lotNumber ? `\n🔖 رقم اللوت: ${car.lotNumber}` : ''}

👁️ شاهد السيارة وشارك في المزايدة:
${carUrl}

سجّل اشتراكك بسرعة وادفع العربون لتنضم للمزاد!`;

  return { subject, content };
}

export function announceCarToAllUsers(
  ctx: AppContext,
  carIdOrRow: string | any,
  options: AnnounceOptions = {}
): AnnounceResult {
  const { db, sendEmail, sendNotification, sendInternalMessage, SITE_URL } = ctx;

  const car: any =
    typeof carIdOrRow === 'string'
      ? db.prepare('SELECT * FROM cars WHERE id = ?').get(carIdOrRow)
      : carIdOrRow;

  if (!car) return { ok: false, carId: String(carIdOrRow), recipientsCount: 0, message: 'السيارة غير موجودة' };

  const filter = options.recipientFilter || `role != 'admin' AND status = 'active'`;
  const recipients: any[] = db.prepare(
    `SELECT id, email, firstName FROM users WHERE ${filter}`
  ).all();

  if (recipients.length === 0) {
    return { ok: true, carId: car.id, recipientsCount: 0, message: 'لا يوجد مستخدمون مفعّلون لإرسال الإعلان لهم' };
  }

  const images = safeImages(car.images);
  const heroAbs = absoluteImageUrl(SITE_URL, images[0]);
  const { subject, content } = buildPlainMessage(car, SITE_URL, heroAbs);
  const html = buildEmailHtml(car, SITE_URL);
  const carPath = `/car-details/${car.id}`;
  // Notification metadata — the bell-icon dropdown reads these to render
  // a thumbnail and a "View car" CTA.
  const notifData: any = {
    carId: car.id,
    imageUrl: heroAbs,
    title: `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim(),
    price: car.reservePrice || 0,
    location: car.location || null,
    auctionStartTime: car.auctionStartTime || null,
  };

  setImmediate(async () => {
    let emailsSent = 0;
    let emailsFailed = 0;
    for (const r of recipients) {
      try {
        sendInternalMessage('admin-1', r.id, subject, content, 'general');
      } catch (e: any) {
        console.error(`[ANNOUNCE] sendInternalMessage failed for ${r.id}: ${e?.message}`);
      }

      try {
        sendNotification(
          r.id,
          subject,
          `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim(),
          'info',
          'new_car_announcement',
          notifData,
          carPath
        );
      } catch (e: any) {
        console.error(`[ANNOUNCE] sendNotification failed for ${r.id}: ${e?.message}`);
      }

      if (!options.skipEmail && r.email) {
        try {
          await sendEmail({ to: r.email, subject, html });
          emailsSent++;
        } catch (e: any) {
          emailsFailed++;
          console.error(`[ANNOUNCE] sendEmail failed for ${r.email}: ${e?.message}`);
        }
      }
    }
    console.log(`[ANNOUNCE] ✅ Car ${car.id}: ${recipients.length} recipients, ${emailsSent} emails sent, ${emailsFailed} failed.`);
  });

  return {
    ok: true,
    carId: car.id,
    recipientsCount: recipients.length,
    message: `تم جدولة إرسال الإعلان لـ ${recipients.length} مستخدم. الإيميلات تُرسل في الخلفية.`,
  };
}
