import "dotenv/config";
console.log('[BOOT] dotenv loaded, importing modules...');
import { registerAuthRoutes } from './routes/auth.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerPaymentRoutes } from './routes/payments.ts';
import { registerSellerRoutes } from './routes/seller.ts';
import { registerBuyerRoutes } from './routes/buyer.ts';
import { registerCarRoutes } from './routes/cars.ts';
import { registerShippingRoutes } from './routes/shipping.ts';
import { registerSocketHandlers } from './sockets/index.ts';
console.log('[BOOT] All route modules imported successfully');

// Crash protection — prevent server from dying on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  // Don't exit — keep serving
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[FATAL] Unhandled Rejection:', reason?.message || reason);
});
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import Stripe from "stripe";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET environment variable is required in production!');
    process.exit(1);
  }
  return "autopro-dev-secret-DO-NOT-USE-IN-PROD";
})();

// Plutu Payment Gateway (Libya) — https://docs.plutu.ly
// IMPORTANT: Set these as environment variables in Render, NOT in code
const PLUTU_API_KEY = process.env.PLUTU_API_KEY || '';
const PLUTU_ACCESS_TOKEN = process.env.PLUTU_ACCESS_TOKEN || '';
const PLUTU_SECRET_KEY = process.env.PLUTU_SECRET_KEY || '';
const PLUTU_BASE_URL = 'https://api.plutus.ly/api/v1';
const PLUTU_ENABLED = !!PLUTU_ACCESS_TOKEN;
const SALT_ROUNDS = 10;

// ── Auth Middleware ──
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "غير مخوَّل — يرجى تسجيل الدخول" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "جلسة منتهية — يرجى إعادة تسجيل الدخول" });
  }
}

function requireAdmin(req: any, res: any, next: any) {
  authenticateToken(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — صلاحيات المدير مطلوبة" });
    }
    next();
  });
}

function requireAuth(req: any, res: any, next: any) {
  authenticateToken(req, res, () => next());
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("auction.db");
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');


// In-memory state for live auction timers
interface AuctionTimer {
  timeLeft: number;
  isActive: boolean;
}
const auctionTimers: Record<string, AuctionTimer> = {};

// Global memory state for performance
let GLOBAL_EXCHANGE_RATE = 1;

// Global Email Transporter (SMTP — mail.privateemail.com for autopro.ac)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.privateemail.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: (process.env.SMTP_PORT || '465') === '465',
  auth: {
    user: process.env.SMTP_USER || 'info@autopro.ac',
    pass: process.env.SMTP_PASS?.replace(/"/g, '') || ''
  },
  tls: { rejectUnauthorized: false }
});

// Resend API (primary — works on Render free tier)
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Stripe (for deposit payments)
const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Unified email sender — uses Resend if API key set, falls back to SMTP
async function sendEmail(opts: { to: string; subject: string; html: string; from?: string }) {
  const fromAddr = opts.from || process.env.EMAIL_FROM || '"AutoPro Libya | أوتو برو" <info@autopro.ac>';
  if (resendClient) {
    try {
      const result = await resendClient.emails.send({
        from: fromAddr,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      });
      console.log(`[RESEND] Email sent to ${opts.to} — id: ${(result.data as any)?.id || 'ok'}`);
      return result;
    } catch (err: any) {
      console.error(`[RESEND ERROR] ${err?.message}. Falling back to SMTP.`);
    }
  }
  // SMTP fallback
  try {
    await transporter.sendMail({ from: fromAddr, to: opts.to, subject: opts.subject, html: opts.html });
    console.log(`[SMTP] Email sent to ${opts.to}`);
  } catch (smtpErr: any) {
    console.error(`[SMTP ERROR] ${smtpErr?.message}`);
    throw smtpErr;
  }
}

// Site base URL (for verification links)
const SITE_URL = process.env.SITE_URL || 'https://autopro-final.onrender.com';


// Initialize Database — FK OFF only during schema creation + seed data, re-enabled at end of init block
db.exec("PRAGMA foreign_keys = OFF;");

// Create core tables early
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    firstName TEXT,
    lastName TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    password TEXT,
    role TEXT,
    status TEXT,
    kycStatus TEXT DEFAULT 'pending',
    deposit REAL DEFAULT 0,
    buyingPower REAL DEFAULT 0,
    commission REAL DEFAULT 0,
    manager TEXT,
    office TEXT,
    companyName TEXT,
    country TEXT,
    address1 TEXT,
    address2 TEXT,
    joinDate TEXT
  );

  CREATE TABLE IF NOT EXISTS cars (
    id TEXT PRIMARY KEY,
    lotNumber TEXT,
    vin TEXT,
    make TEXT,
    model TEXT,
    trim TEXT,
    year INTEGER,
    odometer INTEGER,
    engine TEXT,
    engineSize TEXT,
    horsepower TEXT,
    transmission TEXT,
    drive TEXT,
    drivetrain TEXT,
    fuelType TEXT,
    exteriorColor TEXT,
    interiorColor TEXT,
    primaryDamage TEXT,
    secondaryDamage TEXT,
    titleType TEXT,
    location TEXT,
    currentBid REAL DEFAULT 0,
    reservePrice REAL DEFAULT 0,
    buyItNow REAL,
    currency TEXT DEFAULT 'USD',
    images TEXT,
    videoUrl TEXT,
    inspectionPdf TEXT,
    status TEXT DEFAULT 'upcoming',
    auctionEndDate TEXT,
    sellerId TEXT,
    winnerId TEXT,
    keys TEXT DEFAULT 'yes',
    runsDrives TEXT DEFAULT 'yes',
    notes TEXT,
    mileageUnit TEXT DEFAULT 'mi',
    acceptOffers INTEGER DEFAULT 1,
    offerMarketEndTime TEXT,
    ultimoEndTime TEXT,
    FOREIGN KEY(sellerId) REFERENCES users(id),
    FOREIGN KEY(winnerId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    carId TEXT,
    userId TEXT,
    amount REAL,
    timestamp TEXT,
    type TEXT DEFAULT 'manual',
    FOREIGN KEY(carId) REFERENCES cars(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    amount REAL,
    type TEXT,
    status TEXT,
    timestamp TEXT,
    method TEXT DEFAULT 'bank_transfer',
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    senderId TEXT,
    receiverId TEXT,
    subject TEXT,
    content TEXT,
    category TEXT DEFAULT 'general',
    timestamp TEXT,
    isRead INTEGER DEFAULT 0,
    FOREIGN KEY(senderId) REFERENCES users(id),
    FOREIGN KEY(receiverId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS libyan_market_prices (
    id TEXT PRIMARY KEY,
    condition TEXT,
    make TEXT,
    makeEn TEXT,
    model TEXT,
    modelEn TEXT,
    year INTEGER,
    transmission TEXT,
    fuel TEXT,
    mileage TEXT,
    priceLYD REAL,
    city TEXT,
    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proxy_bids (
    userId TEXT,
    carId TEXT,
    maxAmount REAL,
    PRIMARY KEY(userId, carId),
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS watchers (
    userId TEXT,
    carId TEXT,
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    email TEXT PRIMARY KEY,
    code TEXT,
    expiresAt TEXT
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    userId TEXT PRIMARY KEY,
    emailNotifications INTEGER DEFAULT 1,
    whatsappNotifications INTEGER DEFAULT 1,
    smsNotifications INTEGER DEFAULT 0,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    userId TEXT,
    carId TEXT,
    timestamp TEXT,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    carId TEXT,
    userId TEXT,
    status TEXT DEFAULT 'awaiting_payment',
    currentLocation TEXT,
    estimatedDelivery TEXT,
    trackingNotes TEXT,
    trackingNumber TEXT,
    createdAt TEXT,
    updatedAt TEXT,
    FOREIGN KEY(carId) REFERENCES cars(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    userId TEXT,
    carId TEXT,
    amount REAL,
    status TEXT DEFAULT 'unpaid',
    type TEXT,
    timestamp TEXT,
    dueDate TEXT,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    userId TEXT,
    title TEXT,
    message TEXT,
    type TEXT,
    isRead INTEGER DEFAULT 0,
    timestamp TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notification_templates (
    id TEXT PRIMARY KEY,
    name TEXT,
    subject TEXT,
    body_html TEXT,
    body_whatsapp TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS branch_configs (
    id TEXT PRIMARY KEY,
    name TEXT,
    englishName TEXT,
    logoText TEXT,
    logoSubtext TEXT,
    currency TEXT,
    domain TEXT,
    primaryColor TEXT DEFAULT '#f97316',
    contactEmail TEXT,
    contactPhone TEXT
  );

  CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    name TEXT,
    branchId TEXT,
    manager TEXT,
    status TEXT DEFAULT 'active',
    FOREIGN KEY(branchId) REFERENCES branch_configs(id)
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS market_estimates (
    id TEXT PRIMARY KEY,
    make TEXT,
    model TEXT,
    year INTEGER,
    minPrice REAL,
    maxPrice REAL,
    lastUpdated TEXT
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    carMake TEXT,
    carModel TEXT,
    carYear INTEGER,
    vin TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    reportUrl TEXT,
    requestedAt TEXT,
    updatedAt TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

  // Migration for missing columns in market_estimates
  try {
    db.prepare("ALTER TABLE market_estimates ADD COLUMN lastUpdated TEXT").run();
  } catch (_) {}
  try {
    db.prepare("ALTER TABLE market_estimates ADD COLUMN makeEn TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN modelEn TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN condition TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN transmission TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN fuel TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN mileage TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN price TEXT").run();
    db.prepare("ALTER TABLE market_estimates ADD COLUMN city TEXT").run();
  } catch (_) {}

  db.exec(`
  CREATE TABLE IF NOT EXISTS libyan_market_prices (
    id TEXT PRIMARY KEY,
    condition TEXT,
    make TEXT,
    model TEXT,
    year INTEGER,
    transmission TEXT,
    fuel TEXT,
    mileage TEXT,
    priceLYD REAL,
    lastUpdated TEXT
  );
`);

  // Migration for missing columns in libyan_market_prices
  try {
    db.prepare("ALTER TABLE libyan_market_prices ADD COLUMN lastUpdated TEXT").run();
    db.prepare("ALTER TABLE libyan_market_prices ADD COLUMN makeEn TEXT").run();
    db.prepare("ALTER TABLE libyan_market_prices ADD COLUMN modelEn TEXT").run();
    db.prepare("ALTER TABLE libyan_market_prices ADD COLUMN city TEXT").run();
  } catch (_) {}

  // Migration: add notes column to invoices
  try { db.prepare("ALTER TABLE invoices ADD COLUMN notes TEXT").run(); } catch (_) {}
  // Migration: add paidAt and viewedAt columns to invoices
  try { db.prepare("ALTER TABLE invoices ADD COLUMN paidAt TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE invoices ADD COLUMN viewedAt TEXT").run(); } catch (_) {}
  // Migration: add sellerId to invoices for seller invoice queries
  try { db.prepare("ALTER TABLE invoices ADD COLUMN sellerId TEXT").run(); } catch (_) {}

  db.exec(`
  -- Consolidated external notifications table

  INSERT OR IGNORE INTO system_settings (key, value, description, updatedAt) VALUES
  ('platform_commission_rate', '0.07', 'Platform commission as decimal (0.07 = 7%)', CURRENT_TIMESTAMP),
  ('internal_transport_fee', '450', 'Fixed fee for internal transport ($)', CURRENT_TIMESTAMP),
  ('international_shipping_est', '1200', 'Default estimate for international shipping ($)', CURRENT_TIMESTAMP),
  ('auction_extension_seconds', '15', 'Time added after late bid (seconds)', CURRENT_TIMESTAMP),
  ('min_bid_increment', '100', 'Minimum bid increment ($)', CURRENT_TIMESTAMP),
  ('default_buying_power_multiplier', '10', 'Default multiplier for deposit to calculate buying power', CURRENT_TIMESTAMP),
  ('require_kyc_for_bidding', '1', 'Require KYC approval before allowing bids (1=Yes, 0=No)', CURRENT_TIMESTAMP),
  ('usd_lyd_rate', '7.00', 'Global exchange rate for USD to Libyan Dinar', CURRENT_TIMESTAMP),
  ('enable_email_notifications', '1', 'Send notifications to buyer-seller email (1=Yes, 0=No)', CURRENT_TIMESTAMP),
  ('enable_whatsapp_notifications', '1', 'Send notifications to buyer-seller WhatsApp (1=Yes, 0=No)', CURRENT_TIMESTAMP);

  -- Insert default branch configs
  INSERT OR IGNORE INTO branch_configs (id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor)
  VALUES 
  ('main', 'ليبيا أوتو برو', 'Libya Auto Pro', 'ليبيا أوتو برو', 'Libya', 'USD', 'all', '#f97316'),
  ('ly', 'ليبيا أوتو برو', 'Libya Auto Pro', 'ليبيا أوتو برو', 'Libya Branch', 'LYD', 'ly', '#f97316'),
  ('eg', 'مصر أوتو برو', 'Egypt Auto Pro', 'مصر أوتو برو', 'Egypt Branch', 'EGP', 'eg', '#f97316'),
  ('ae', 'إمارات أوتو برو', 'UAE Auto Pro', 'إمارات أوتو برو', 'UAE Branch', 'AED', 'ae', '#f97316'),
  ('sa', 'السعودية أوتو برو', 'Saudi Auto Pro', 'السعودية أوتو برو', 'Saudi Branch', 'SAR', 'sa', '#f97316');

  -- Insert default offices
  INSERT OR IGNORE INTO offices (id, name, branchId, manager, status)
  VALUES 
  ('off-1', 'مكتب طرابلس الرئيسي', 'ly', 'أحمد محمود', 'active'),
  ('off-2', 'مكتب بنغازي', 'ly', 'محمد علي', 'active'),
  ('off-3', 'مكتب القاهرة', 'eg', 'خالد عبدالله', 'active'),
  ('off-4', 'مكتب دبي', 'ae', 'سارة محمد', 'active');

  -- Insert default admin if not exists (INSERT OR IGNORE so we never overwrite an already-hashed password)
  INSERT OR IGNORE INTO users (id, firstName, lastName, email, phone, password, role, status, joinDate, buyingPower, deposit)
  VALUES ('admin-1', 'المدير', 'العام', 'admin@autopro.com', '01000000000', '${bcrypt.hashSync('admin123', 10)}', 'admin', 'active', '2024-01-01', 1000000, 100000);

  INSERT OR IGNORE INTO users (id, firstName, lastName, email, phone, password, role, status, joinDate, buyingPower, deposit, commission)
  VALUES ('user-1', 'محمد', 'العربي', 'user@autopro.com', '0123456789', '${bcrypt.hashSync('user123', 10)}', 'buyer', 'active', '2024-02-01', 50000, 5000, 5);

  INSERT OR IGNORE INTO users (id, firstName, lastName, email, phone, password, role, status, joinDate, buyingPower, deposit, commission)
  VALUES ('seller-1', 'أحمد', 'المعرض', 'seller-1@autopro.com', '0112233445', '${bcrypt.hashSync('seller123', 10)}', 'seller', 'active', '2024-02-01', 0, 0, 3);

  -- Seed Default Notification Templates
  INSERT OR IGNORE INTO notification_templates (id, name, subject, body_html, body_whatsapp, updatedAt) VALUES
  ('general_notification', 'إشعار عام', '{{title}} | تنبيه منصة أوتو برو', 
  '<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:Arial, sans-serif;">
  <div style="max-width:600px; margin:20px auto; background-color:white; border-radius:16px; overflow:hidden; border:1px solid {{border_color}}; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <div style="background-color:#0f172a; padding:24px; text-align:center;">
      <h1 style="color:#f97316; font-size:24px; margin:0; letter-spacing:2px; font-weight:900;">A U T O &nbsp; P R O</h1>
      <p style="color:#94a3b8; font-size:12px; margin:4px 0 0; letter-spacing:4px;">A U C T I O N S</p>
    </div>
    
    <div style="padding:40px 30px; text-align:center; background-color:{{bg_color}};">
      <div style="display:inline-block; padding:10px 20px; background-color:white; border-radius:100px; border:2px solid {{primary_color}}; color:{{primary_color}}; font-weight:bold; margin-bottom:20px; font-size:14px;">
        💎 إشعار رسمي من المنصة
      </div>
      <h2 style="color:#0f172a; margin:0 0 16px; font-size:28px; font-weight:900;">{{title}}</h2>
      <div style="height:3px; width:60px; background-color:{{primary_color}}; margin:0 auto 24px;"></div>
      <p style="color:#334155; font-size:18px; line-height:1.6; margin:0; white-space:pre-wrap;">{{message}}</p>
    </div>

    <div style="padding:30px; background-color:white; text-align:center;">
      <a href="https://www.autopro.ac" style="display:inline-block; background-color:#0f172a; color:white; padding:16px 40px; font-size:18px; font-weight:bold; text-decoration:none; border-radius:12px; box-shadow:0 10px 15px -3px rgba(15,23,42,0.3);">
        الدخول للمنصة الآن
      </a>
    </div>

    <div style="background-color:#f1f5f9; padding:20px; text-align:center; border-top:1px solid #e2e8f0;">
      <p style="color:#64748b; font-size:12px; margin:0;">هذا إشعار تلقائي من أوتو برو للمزادات - ليبيا 2026.<br>يمكنك التحكم في الإشعارات من إعدادات حسابك.</p>
    </div>
  </div>
</body>
</html>', 
  '🌟 *A U T O P R O  A U C T I O N S*\n\n🔔 *{{title}}*\n\n{{message}}\n\n🔗 *رابط الوصل:* https://www.autopro.ac/dashboard',
  CURRENT_TIMESTAMP);

  INSERT OR IGNORE INTO notification_templates (id, name, subject, body_html, body_whatsapp, updatedAt) VALUES
  ('marketing_campaign', 'حملة تسويقية سيارات', 'عروض سيارات حصرية بانتظارك من أوتو برو', 
  '', 
  '🚗 *عروض سيارات مميزة من أوتو برو!*\n\nتتوفر لدينا مجموعة جديدة من السيارات (قادمة - في المزاد - عروض سوق).\n\n👇 *تصفح السيارات المختارة لك من هنا:* \nhttps://www.autopro.ac/marketplace',
  CURRENT_TIMESTAMP);

  INSERT OR IGNORE INTO notification_templates (id, name, subject, body_html, body_whatsapp, updatedAt) VALUES
  ('auction_win', 'فوز بمزاد سيارة 🎉', 'تهانينا {{userName}}! لقد فزت بمزاد سيارة {{itemInfo}}', 
  '<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:Arial, sans-serif;">
  <div style="max-width:600px; margin:20px auto; background-color:white; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
    <div style="background-color:#0f172a; padding:40px 20px; text-align:center;">
      <h1 style="color:#f97316; font-size:28px; margin:0; font-weight:900;">🏅 فوز مستحق!</h1>
    </div>
    <div style="padding:40px 30px; text-align:center;">
      <h2 style="color:#0f172a; margin:0 0 10px; font-size:24px;">تهانينا {{userName}}!</h2>
      <p style="color:#475569; font-size:18px; line-height:1.6;">لقد فزت بنجاح بمزاد السيارة: <br><strong style="color:#f97316;">{{itemInfo}}</strong></p>
      
      <div style="margin:30px 0; padding:20px; background-color:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1;">
        <p style="color:#64748b; font-size:14px; margin:0;">يرجى مراجعة فواتير الشراء وتكاليف النقل في لوحة التحكم لإتمام الإجراءات.</p>
      </div>

      <a href="{{winLink}}" style="display:inline-block; background-color:#f97316; color:white; padding:18px 45px; font-size:18px; font-weight:bold; text-decoration:none; border-radius:12px; box-shadow:0 10px 15px -3px rgba(249,115,22,0.3);">
        عرض سياراتي الفائزة
      </a>
    </div>
    <div style="background-color:#f1f5f9; padding:20px; text-align:center;">
      <p style="color:#64748b; font-size:12px; margin:0;">أوتو برو للمزادات - شريكك الموثوق لاستيراد السيارات من أمريكا</p>
    </div>
  </div>
</body>
</html>', 
  '🏆 *تهانينا {{userName}}!*\n\nلقد فزت بسيارة: *{{itemInfo}}*\n\nيرجى التوجه للرابط التالي لمراجعة الفواتير وإتمام الشحن:\n{{winLink}}\n\nشكراً لاختيارك أوتو برو! 🚗✨',
  CURRENT_TIMESTAMP);

  INSERT OR IGNORE INTO notification_templates (id, name, subject, body_html, body_whatsapp, updatedAt) VALUES
  ('registration_success', 'مرحباً بك في أوتو برو', 'أهلاً بك {{userName}}! تم تفعيل حسابك بنجاح', 
  '<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:Arial, sans-serif;">
  <div style="max-width:600px; margin:20px auto; background-color:white; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
    <div style="background-color:#0f172a; padding:30px; text-align:center;">
      <h1 style="color:#f97316; font-size:32px; margin:0;">أهلاً بك {{userName}}!</h1>
    </div>
    <div style="padding:40px; text-align:center;">
      <p style="color:#334155; font-size:20px;">يسعدنا انضمامك لأكبر منصة مزادات سيارات في ليبيا.</p>
      <p style="color:#64748b; font-size:16px;">يمكنك الآن المزايدة على آلاف السيارات يومياً مباشرة من أمريكا.</p>
      <div style="margin-top:30px;">
        <a href="https://www.autopro.ac" style="background-color:#0f172a; color:white; padding:15px 30px; text-decoration:none; border-radius:10px; font-weight:bold;">ابدأ المزايدة الآن</a>
      </div>
    </div>
  </div>
</body>
</html>', 
  '👋 *أهلاً {{userName}}!*\n\nتم تفعيل حسابك بنجاح في منصة *أوتو برو للمزادات*.\nيمكنك الآن البدء في تصفح السيارات والمشاركة في المزادات.\n\n🔗 *رابط المنصة:* https://www.autopro.ac',
  CURRENT_TIMESTAMP);

  INSERT OR IGNORE INTO notification_templates (id, name, subject, body_html, body_whatsapp, updatedAt) VALUES
  ('shipping_status_update', 'تحديث حالة الشحن 🚢', 'تحديث جديد حول شحن سيارتك {{itemInfo}}', 
  '<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:Arial, sans-serif;">
  <div style="max-width:600px; margin:20px auto; background-color:white; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
    <div style="background-color:#0f172a; padding:24px; text-align:center;">
      <h1 style="color:#f97316; font-size:24px; margin:0; font-weight:900;">A U T O &nbsp; P R O</h1>
    </div>
    <div style="padding:40px 30px;">
      <h2 style="color:#0f172a; margin:0 0 16px; font-size:22px;">أهلاً {{userName}}</h2>
      <p style="color:#334155; font-size:16px;">لقد تم تحديث حالة شحن سيارتك: <strong>{{itemInfo}}</strong></p>
      <div style="margin:25px 0; padding:20px; background-color:#f1f5f9; border-radius:12px; border:1px solid #e2e8f0; text-align:center;">
        <p style="color:#0f172a; font-size:20px; font-weight:bold; margin:0;">{{title}}</p>
        <p style="color:#64748b; font-size:14px; margin:10px 0 0;">{{message}}</p>
      </div>
      <div style="text-align:center; margin-top:30px;">
        <a href="{{shippingLink}}" style="display:inline-block; background-color:#0f172a; color:white; padding:15px 35px; text-decoration:none; border-radius:10px; font-weight:bold;">تتبع الشحن الآن</a>
      </div>
    </div>
  </div>
</body>
</html>', 
  '🚢 *تحديث حالة الشحن*\n\nأهلاً {{userName}}، تم تحديث حالة شحن سيارتك *{{itemInfo}}*:\n\n📍 *الحالة:* {{title}}\n📝 *التفاصيل:* {{message}}\n\n🔗 *تتبع الشحن من هنا:* {{shippingLink}}',
  CURRENT_TIMESTAMP);
`);


// Separate block for post-init setup
db.exec("PRAGMA foreign_keys = ON;");

// 1. Ensure all columns exist for 'cars'
[
  "commission REAL DEFAULT 0",
  "manager TEXT",
  "office TEXT",
  "exteriorColor TEXT",
  "interiorColor TEXT",
  "transmission TEXT",
  "reservePrice REAL DEFAULT 0",
  "winnerId TEXT",
  "acceptOffers INTEGER DEFAULT 0",
  "videoUrl TEXT",
  "ultimoEndTime TEXT",
  "offerMarketEndTime TEXT",
  "inspectionPdf TEXT",
  "trim TEXT",
  "mileageUnit TEXT DEFAULT 'mi'",
  "engineSize TEXT",
  "horsepower TEXT",
  "drivetrain TEXT",
  "fuelType TEXT",
  "secondaryDamage TEXT",
  "keys TEXT",
  "runsDrives TEXT",
  "notes TEXT",
  "auctionSessionCount INTEGER DEFAULT 0",
  "acceptedBy TEXT",
  "sellerCounterPrice REAL",
  "isBuyNow INTEGER DEFAULT 0"
].forEach(colDef => {
  try {
    db.exec(`ALTER TABLE cars ADD COLUMN ${colDef}`);
  } catch (e) { /* Column already exists */ }
});

// 2. Ensure all columns exist for 'users'
[
  "nationalId TEXT",
  "isPhoneVerified INTEGER DEFAULT 0",
  "commercialRegister TEXT",
  "showroomLicense TEXT",
  "iban TEXT"
].forEach(colDef => {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${colDef}`);
  } catch (e) { /* Column already exists */ }
});

// 3. Ensure all columns exist for 'invoices'
[
  "pickupAuthCode TEXT",
  "isViewed INTEGER DEFAULT 0",
  "sentAt TEXT"
].forEach(colDef => {
  try {
    db.exec(`ALTER TABLE invoices ADD COLUMN ${colDef}`);
  } catch (e) { /* Column already exists */ }
});

// 3b. Ensure extra columns exist in transactions
try { db.exec(`ALTER TABLE transactions ADD COLUMN method TEXT DEFAULT 'bank_transfer'`); } catch (_) { }
try { db.exec(`ALTER TABLE transactions ADD COLUMN referenceNo TEXT`); } catch (_) { }
try { db.exec(`ALTER TABLE transactions ADD COLUMN notes TEXT`); } catch (_) { }
try { db.exec(`ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'USD'`); } catch (_) { }
try { db.exec(`ALTER TABLE transactions ADD COLUMN adminNote TEXT`); } catch (_) { }

// ======= PHASE 4: SELLER WALLET TABLES =======
// AUTO-GENERATED: Libyan Market Prices Seed — 227 vehicles
const seedLibyanMarketPrices227 = () => {
  try {
    const count: any = db.prepare("SELECT COUNT(*) as c FROM libyan_market_prices").get() as any;
    if ((count?.c || 0) >= 50) { console.log('[SEED] libyan_market_prices already seeded'); return; }
    console.log('[SEED] Seeding 227 Libyan market prices...');
    db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('1', 'جديد', 'تويوتا', 'Toyota', 'ستارليت', 'Starlet', 2025, 'اوتوماتيك', 'بنزين', '0', 99999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('2', 'جديد', 'جيتور', 'Jetour', 'T2', 'T2', 2026, 'اوتوماتيك', 'بنزين', '0', 255000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('3', 'جديد', 'آيتو', 'Aito', 'آيتو 9', 'Aito 9', 2026, 'اوتوماتيك', 'بنزين', '0', 36666, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('4', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2024, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 260000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('5', 'جديد', 'أودي', 'Audi', 'Q3', 'Q3', 2024, 'اوتوماتيك', 'بنزين', '0', 178938, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('6', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2024, 'اوتوماتيك', 'بنزين', '20,000 - 29,999', 145000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('7', 'مستعمل', 'هيونداي', 'Hyundai', 'كريتا', 'Creta', 2025, 'اوتوماتيك', 'بنزين', '10,000 - 19,999', 99999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('8', 'جديد', 'كيا', 'Kia', 'سورينتو', 'Sorento', 2023, 'اوتوماتيك', 'بنزين', '0', 135000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('9', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2023, 'اوتوماتيك', 'بنزين', '50,000 - 59,999', 135000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('10', 'مستعمل', 'هيونداي', 'Hyundai', 'فوليستر', 'Ioniq 5', 2023, 'اوتوماتيك', 'بنزين', '90,000 - 99,999', 38689, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('11', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2023, 'اوتوماتيك', 'بنزين', '10,000 - 19,999', 658555, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('12', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2023, 'اوتوماتيك', 'هايبرد', '30,000 - 39,999', NULL, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('13', 'جديد', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2023, 'اوتوماتيك', 'بنزين', '0', 295000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('14', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2022, 'اوتوماتيك', 'بنزين', '40,000 - 49,999', 1255669, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('15', 'مستعمل', 'هيونداي', 'Hyundai', 'توسان', 'Tucson', 2022, 'اوتوماتيك', 'بنزين', '60,000 - 69,999', 110000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('16', 'مستعمل', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2022, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 82000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('17', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2022, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 5288, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('18', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-C', 'C-Class', 2021, 'اوتوماتيك', 'بنزين', '10,000 - 19,999', 84000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('19', 'مستعمل', 'هيونداي', 'Hyundai', 'فينيو', 'Venue', 2021, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 68000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('20', 'مستعمل', 'هيونداي', 'Hyundai', 'كونا', 'Kona', 2021, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 1000000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('21', 'مستعمل', 'جينيسيس', 'Genesis', 'G70', 'G70', 2020, 'اوتوماتيك', 'بنزين', '40,000 - 49,999', 999999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('22', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2020, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 80000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('23', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2020, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 78500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('24', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2020, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 50000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('25', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2020, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 55000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('26', 'مستعمل', 'نيسان', 'Nissan', 'باترول', 'Patrol', 2020, 'اوتوماتيك', 'بنزين', '—', 64000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('27', 'جديد', 'هيونداي', 'Hyundai', 'فينيو', 'Venue', 2020, 'اوتوماتيك', 'بنزين', '0', 68800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('28', 'جديد', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2020, 'اوتوماتيك', 'بنزين', '0', 99999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('29', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2020, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 9999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('30', 'مستعمل', 'كيا', 'Kia', 'سورينتو', 'Sorento', 2020, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 73000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('31', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2019, 'اوتوماتيك', 'بنزين', '50,000 - 59,999', 54000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('32', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2019, 'اوتوماتيك', 'بنزين', '170,000 - 179,999', 57000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('33', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2019, 'اوتوماتيك', 'بنزين', '90,000 - 99,999', 58000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('34', 'مستعمل', 'فولكسفاغن', 'Volkswagen', 'جولف GTI', 'Golf GTI', 2019, 'اوتوماتيك', 'بنزين', '40,000 - 49,999', 99999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('35', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2019, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 85000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('36', 'مستعمل', 'جينيسيس', 'Genesis', 'G70', 'G70', 2019, 'اوتوماتيك', 'بنزين', '50,000 - 59,999', 999999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('37', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-GLE', 'GLE', 2018, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 295000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('38', 'مستعمل', 'تويوتا', 'Toyota', 'بريفيا', 'Previa', 2018, 'اوتوماتيك', 'بنزين', '—', 75000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('39', 'مستعمل', 'تويوتا', 'Toyota', 'راف فور', 'RAV4', 2018, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 75000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('40', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2018, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 76000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('41', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2018, 'اوتوماتيك', 'بنزين', '170,000 - 179,999', 150000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('42', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2017, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 63222, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('43', 'مستعمل', 'كيا', 'Kia', 'اوبتيما', 'Optima', 2017, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 36000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('44', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-C', 'C-Class', 2017, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 56000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('45', 'مستعمل', 'جينيسيس', 'Genesis', 'G80', 'G80', 2017, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 99887, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('46', 'مستعمل', 'كيا', 'Kia', 'سيدونا', 'Sedona', 2017, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 48500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('47', 'مستعمل', 'لكزس', 'Lexus', 'GX', 'GX', 2017, 'اوتوماتيك', 'بنزين', '140,000 - 149,999', 158000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('48', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2017, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 37000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('49', 'جديد', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2017, 'اوتوماتيك', 'بنزين', '0', 99996, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('50', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2016, 'اوتوماتيك', 'بنزين', '—', 130000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('51', 'مستعمل', 'تويوتا', 'Toyota', 'كورولا', 'Corolla', 2016, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 67000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('52', 'مستعمل', 'جينيسيس', 'Genesis', 'G80', 'G80', 2016, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 66500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('53', 'جديد', 'كيا', 'Kia', 'فورتي', 'Forte', 2015, 'اوتوماتيك', 'بنزين', '0', 25400, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('54', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2015, 'اوتوماتيك', 'بنزين', '120,000 - 129,999', 24850, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('55', 'جديد', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2015, 'اوتوماتيك', 'بنزين', '0', 9999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('56', 'مستعمل', 'كيا', 'Kia', 'اوبتيما', 'Optima', 2015, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 33000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('57', 'مستعمل', 'كيا', 'Kia', 'سورينتو', 'Sorento', 2015, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 37800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('58', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2015, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 65000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('59', 'مستعمل', 'بي ام دبليو', 'BMW', 'الفئة X5', 'X5', 2015, 'اوتوماتيك', 'بنزين', '—', 100000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('60', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2015, 'اوتوماتيك', 'بنزين', '60,000 - 69,999', 36500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('61', 'مستعمل', 'تويوتا', 'Toyota', 'كورولا', 'Corolla', 2015, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 800000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('62', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2015, 'اوتوماتيك', 'بنزين', '—', 120000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('63', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2014, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 42000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('64', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2014, 'اوتوماتيك', 'بنزين', '140,000 - 149,999', 39000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('65', 'مستعمل', 'كيا', 'Kia', 'ريو', 'Rio', 2014, 'اوتوماتيك', 'بنزين', '—', 19000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('66', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2014, 'اوتوماتيك', 'Not in source', '70,000 - 79,999', 31800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('67', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2014, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 12121, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('68', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-A', 'A-Class', 2014, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 45000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('69', 'مستعمل', 'بي ام دبليو', 'BMW', 'الفئة 3', 'Series 3', 2014, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 35500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('70', 'مستعمل', 'جينيسيس', 'Genesis', 'اخرى', 'Other', 2014, 'اوتوماتيك', 'بنزين', '50,000 - 59,999', 31500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('71', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2015, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 26500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('72', 'مستعمل', 'كيا', 'Kia', 'كادينزا', 'Cadenza', 2014, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 33000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('73', 'جديد', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2014, 'اوتوماتيك', 'بنزين', '0', 55000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('74', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2014, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 20500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('75', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2014, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 100000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('76', 'مستعمل', 'نيسان', 'Nissan', 'ارمادا', 'Armada', 2013, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 45000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('77', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2013, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 43000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('78', 'مستعمل', 'جينيسيس', 'Genesis', 'اخرى', 'Other', 2013, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 27500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('79', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2013, 'اوتوماتيك', 'بنزين', '90,000 - 99,999', 56500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('80', 'مستعمل', 'كيا', 'Kia', 'سورينتو', 'Sorento', 2013, 'اوتوماتيك', 'بنزين', '170,000 - 179,999', 38750, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('81', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2013, 'اوتوماتيك', 'بنزين', '—', 110000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('82', 'مستعمل', 'هيونداي', 'Hyundai', 'النترا', 'Elantra', 2013, 'اوتوماتيك', 'بنزين', '150,000 - 200,000', 20000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('83', 'مستعمل', 'هيونداي', 'Hyundai', 'اكسنت', 'Accent', 2013, 'اوتوماتيك', 'بنزين', '—', 15500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('84', 'جديد', 'هيونداي', 'Hyundai', 'i30', 'i30', 2013, 'اوتوماتيك', 'بنزين', '0', 19600, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('85', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-GLK', 'GLK', 2012, 'اوتوماتيك', 'بنزين', '150,000 - 199,999', 31000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('86', 'جديد', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2012, 'اوتوماتيك', 'بنزين', '0', 25500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('87', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2012, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 30800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('88', 'مستعمل', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2012, 'اوتوماتيك', 'بنزين', '80,000 - 179,999', 25800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('89', 'جديد', 'كيا', 'Kia', 'كادينزا', 'Cadenza', 2012, 'اوتوماتيك', 'بنزين', '0', 28500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('90', 'جديد', 'هيونداي', 'Hyundai', 'توسان', 'Tucson', 2012, 'اوتوماتيك', 'بنزين', '0', 34800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('91', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2012, 'اوتوماتيك', 'بنزين', '120,000 - 129,999', 33400, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('92', 'مستعمل', 'جينيسيس', 'Genesis', 'اخرى', 'Other', 2012, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 20000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('93', 'مستعمل', 'كيا', 'Kia', 'كادينزا', 'Cadenza', 2012, 'اوتوماتيك', 'بنزين', '120,000 - 149,999', 12367, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('94', 'مستعمل', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2012, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 28250, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('95', 'مستعمل', 'كيا', 'Kia', 'كادينزا', 'Cadenza', 2012, 'اوتوماتيك', 'بنزين', '120,000 - 129,999', 122111, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('96', 'مستعمل', 'تويوتا', 'Toyota', 'FJ', 'FJ Cruiser', 2012, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 85000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('97', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2012, 'اوتوماتيك', 'بنزين', '—', 60000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('98', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2012, 'اوتوماتيك', 'بنزين', '—', 5550, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('99', 'مستعمل', 'كيا', 'Kia', 'اوبتيما', 'Optima', 2012, 'اوتوماتيك', 'بنزين', '180,000 - 200,000', 13000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('100', 'جديد', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2012, 'اوتوماتيك', 'بنزين', '0', 42000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('101', 'جديد', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2012, 'اوتوماتيك', 'بنزين', '1- 999', 28500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('102', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2012, 'اوتوماتيك', 'بنزين', '10,000 - 79,999', 15800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('103', 'مستعمل', 'بي ام دبليو', 'BMW', 'الفئة 5', 'Series 5', 2012, 'اوتوماتيك', 'بنزين', '120,000 - 129,999', 34000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('104', 'مستعمل', 'نيسان', 'Nissan', 'صني', 'Sunny', 2012, 'اوتوماتيك', 'بنزين', '30,000 - 39,999', 5600, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('105', 'جديد', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2012, 'اوتوماتيك', 'بنزين', '0', NULL, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('106', 'مستعمل', 'كيا', 'Kia', 'سورينتو', 'Sorento', 2012, 'اوتوماتيك', 'بنزين', '30,000 - 119,999', 37500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('107', 'مستعمل', 'جيب', 'Jeep', 'جراند شيروكى', 'Grand Cherokee', 2012, 'اوتوماتيك', 'بنزين', '—', 1111110, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('108', 'جديد', 'فيات', 'Fiat', '2012', '—', 2012, 'اوتوماتيك', 'بنزين', '0', 27000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('109', 'مستعمل', 'كيا', 'Kia', '2012', '—', 2012, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 29500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('110', 'مستعمل', 'كيا', 'Kia', 'سورينتو', 'Sorento', 2012, 'اوتوماتيك', 'بنزين', '—', 32500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('111', 'جديد', 'كيا', 'Kia', 'بيكانتو', 'Picanto', 2012, 'اوتوماتيك', 'بنزين', '0', 21500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('112', 'مستعمل', 'هوندا', 'Honda', 'CR-V', 'CR-V', 2012, 'اوتوماتيك', 'بنزين', '180,000 - 189,999', 888808, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('113', 'مستعمل', 'كيا', 'Kia', 'مورنينج', 'Morning', 2012, 'اوتوماتيك', 'بنزين', '140,000 - 149,999', 16500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('114', 'مستعمل', 'هيونداي', 'Hyundai', 'اكسنت', 'Accent', 2012, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 335289, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('115', 'مستعمل', 'كيا', 'Kia', 'كادينزا', 'Cadenza', 2011, 'اوتوماتيك', 'بنزين', '120,000 - 200,000', 29500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('116', 'مستعمل', 'سامسونج', 'Samsung', 'SM5', 'SM5', 2011, 'اوتوماتيك', 'Not in source', '80,000 - 89,999', 19500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('117', 'مستعمل', 'هيونداي', 'Hyundai', 'اكسنت', 'Accent', 2011, 'اوتوماتيك', 'بنزين', '—', 16900, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('118', 'مستعمل', 'كيا', 'Kia', 'K5', 'K5', 2011, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('119', 'جديد', 'كيا', 'Kia', 'سيراتو', 'Cerato', 2011, 'اوتوماتيك', 'بنزين', '0', 17500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('120', 'مستعمل', 'دايو', 'Daewoo', 'لاسيتي', 'Lacetti', 2010, 'اوتوماتيك', 'بنزين', '10,000 - 19,999', 10800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('121', 'مستعمل', 'هيونداي', 'Hyundai', 'فيراكروز', 'Veracruz', 2010, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 28000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('122', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2010, 'اوتوماتيك', 'بنزين', '—', 41000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('123', 'مستعمل', 'ميتسوبيشي', 'Mitsubishi', 'لانسر', 'Lancer', 2010, 'يدوي/عادي', 'بنزين', '—', 12500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('124', 'مستعمل', 'سامسونج', 'Samsung', 'SM3', 'SM3', 2010, 'اوتوماتيك', 'بنزين', '90,000 - 99,999', 22000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('125', 'مستعمل', 'سامسونج', 'Samsung', 'QM5', 'QM5', 2010, 'اوتوماتيك', 'بنزين', '—', 14900, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('126', 'جديد', 'كيا', 'Kia', 'برايد', 'Pride', 2010, 'اوتوماتيك', 'بنزين', '0', 9500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('127', 'مستعمل', 'كيا', 'Kia', 'بيكانتو', 'Picanto', 2010, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 14800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('128', 'مستعمل', 'جينيسيس', 'Genesis', 'اخرى', 'Other', 2010, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 26800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('129', 'مستعمل', 'كيا', 'Kia', 'ريو', 'Rio', 2010, 'اوتوماتيك', 'بنزين', '20,000 - 129,999', 16000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('130', 'جديد', 'كيا', 'Kia', 'فورتي', 'Forte', 2010, 'اوتوماتيك', 'بنزين', '0', 9999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('131', 'مستعمل', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2010, 'اوتوماتيك', 'بنزين', '100,000 - 109,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('132', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2010, 'اوتوماتيك', 'بنزين', '70,000 - 189,999', 28000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('133', 'مستعمل', 'هيونداي', 'Hyundai', '2010', '—', 2010, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 23000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('134', 'مستعمل', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2010, 'اوتوماتيك', 'بنزين', '—', 14500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('135', 'جديد', 'تويوتا', 'Toyota', 'كامري', 'Camry', 2010, 'اوتوماتيك', 'بنزين', '0', 12000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('136', 'مستعمل', 'كيا', 'Kia', 'سبورتاج', 'Sportage', 2010, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 29800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('137', 'مستعمل', 'كيا', 'Kia', 'كادينزا', 'Cadenza', 2010, 'اوتوماتيك', 'بنزين', '180,000 - 189,999', 29000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('138', 'مستعمل', 'كيا', 'Kia', '2010', '—', 2010, 'اوتوماتيك', 'بنزين', '—', 18500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('139', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2010, 'اوتوماتيك', 'بنزين', '70,000 - 79,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('140', 'مستعمل', 'كيا', 'Kia', 'مورنينج', 'Morning', 2010, 'اوتوماتيك', 'بنزين', '60,000 - 69,999', 13800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('141', 'جديد', 'هيونداي', 'Hyundai', 'i30', 'i30', 2010, 'اوتوماتيك', 'بنزين', '0', 22800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('142', 'مستعمل', 'شيفروليه', 'Chevrolet', 'كروز', 'Cruze', 2010, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 6000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('143', 'مستعمل', 'فولكسفاغن', 'Volkswagen', 'تيجوان', 'Tiguan', 2010, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 21000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('144', 'مستعمل', 'بي ام دبليو', 'BMW', 'الفئة X5', 'X5', 2010, 'اوتوماتيك', 'بنزين', '140,000 - 149,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('145', 'مستعمل', 'هيونداي', 'Hyundai', 'النترا', 'Elantra', 2010, 'يدوي/عادي', 'بنزين', '150,000 - 159,999', 16000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('146', 'مستعمل', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2010, 'اوتوماتيك', 'بنزين', '80,000 - 199,999', 26500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('147', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2009, 'اوتوماتيك', 'بنزين', '130,000 - 199,999', 29500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('148', 'مستعمل', 'هيونداي', 'Hyundai', 'توسان', 'Tucson', 2009, 'اوتوماتيك', 'بنزين', '120,000 - 129,999', 23000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('149', 'جديد', 'هوندا', 'Honda', 'اكورد', 'Accord', 2009, 'اوتوماتيك', 'بنزين', '0', 21800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('150', 'مستعمل', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2009, 'اوتوماتيك', 'بنزين', '80,000 - 159,999', 23500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('151', 'مستعمل', 'كيا', 'Kia', 'مورنينج', 'Morning', 2009, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 13200, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('152', 'مستعمل', 'دودج', 'Dodge', 'رام', 'Ram', 2009, 'اوتوماتيك', 'بنزين', '—', 48000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('153', 'جديد', 'كيا', 'Kia', 'بيكانتو', 'Picanto', 2009, 'اوتوماتيك', 'بنزين', '0', 11500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('154', 'مستعمل', 'كيا', 'Kia', 'كارينز', 'Carens', 2009, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 20500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('155', 'مستعمل', 'شيفروليه', 'Chevrolet', 'سلفرادو', 'Silverado', 2009, 'اوتوماتيك', 'بنزين', '140,000 - 149,999', 53000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('156', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2009, 'اوتوماتيك', 'بنزين', '—', 12000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('157', 'مستعمل', 'هيونداي', 'Hyundai', 'النترا', 'Elantra', 2009, 'اوتوماتيك', 'بنزين', '—', 14000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('158', 'مستعمل', 'ميتسوبيشي', 'Mitsubishi', 'L200', 'L200', 2009, 'يدوي/عادي', 'بنزين', '—', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('159', 'مستعمل', 'سامسونج', 'Samsung', 'SM5', 'SM5', 2009, 'اوتوماتيك', 'بنزين', '90,000 - 99,999', 18800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('160', 'مستعمل', 'هيونداي', 'Hyundai', 'بورتر', 'Porter', 2009, 'يدوي/عادي', 'ديزل', '20,000 - 29,999', 19000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('161', 'مستعمل', 'كيا', 'Kia', 'فورتي', 'Forte', 2009, 'اوتوماتيك', 'بنزين', '—', 13400, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('162', 'مستعمل', 'كيا', 'Kia', 'كارينز', 'Carens', 2008, 'اوتوماتيك', 'بنزين', '80,000 - 89,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('163', 'مستعمل', 'فولكسفاغن', 'Volkswagen', 'باسات', 'Passat', 2008, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 13500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('164', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2008, 'اوتوماتيك', 'بنزين', '130,000 - 149,999', 20750, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('165', 'جديد', 'كيا', 'Kia', 'برايد', 'Pride', 2008, 'اوتوماتيك', 'بنزين', '0', 13500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('166', 'مستعمل', 'هيونداي', 'Hyundai', 'i30', 'i30', 2008, 'اوتوماتيك', 'بنزين', '80,000 - 129,999', 20750, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('167', 'مستعمل', 'تويوتا', 'Toyota', 'FJ', 'FJ Cruiser', 2008, 'اوتوماتيك', 'بنزين', '—', 57500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('168', 'مستعمل', 'سامسونج', 'Samsung', 'SM3', 'SM3', 2008, 'اوتوماتيك', 'بنزين', '180,000 - 189,999', 15000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('169', 'مستعمل', 'تويوتا', 'Toyota', 'تاكوما', 'Tacoma', 2008, 'اوتوماتيك', 'بنزين', '—', 65000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('170', 'مستعمل', 'جيب', 'Jeep', 'شيروكى', 'Cherokee', 2008, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 35000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('171', 'مستعمل', 'تويوتا', 'Toyota', 'لاند كروزر', 'Land Cruiser', 2008, 'اوتوماتيك', 'بنزين', '10,000 - 19,999', 22255, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('172', 'جديد', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2008, 'اوتوماتيك', 'بنزين', '0', 17800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('173', 'مستعمل', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2008, 'اوتوماتيك', 'بنزين', '110,000 - 200,000', 10222, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('174', 'جديد', 'كيا', 'Kia', 'Not in source', 'Not in source', 2008, 'اوتوماتيك', 'بنزين', '0', 8800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('175', 'جديد', 'سامسونج', 'Samsung', 'SM3', 'SM3', 2008, 'اوتوماتيك', 'بنزين', '0', 10800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('176', 'مستعمل', 'هيونداي', 'Hyundai', 'جيتز', 'Getz', 2008, 'اوتوماتيك', 'بنزين', '—', 15000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('177', 'جديد', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2008, 'اوتوماتيك', 'بنزين', '0', 21800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('178', 'مستعمل', 'كيا', 'Kia', 'سيراتو', 'Cerato', 2007, 'اوتوماتيك', 'بنزين', '—', 10000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('179', 'مستعمل', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2007, 'اوتوماتيك', 'بنزين', '120,000 - 189,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('180', 'جديد', 'مازدا', 'Mazda', 'CX-5', 'CX-5', 2007, 'يدوي/عادي', 'بنزين', '0', 14500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('181', 'مستعمل', 'كيا', 'Kia', 'بيكانتو', 'Picanto', 2007, 'اوتوماتيك', 'بنزين', '1,000 - 9,999', 8000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('182', 'مستعمل', 'هيونداي', 'Hyundai', 'ازيرا', 'Azera', 2007, 'اوتوماتيك', 'بنزين', '140,000 - 149,999', 22000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('183', 'جديد', 'سامسونج', 'Samsung', 'SM3', 'SM3', 2007, 'اوتوماتيك', 'بنزين', '0', 99000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('184', 'مستعمل', 'هيونداي', 'Hyundai', 'النترا', 'Elantra', 2007, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 14500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('185', 'مستعمل', 'شيفروليه', 'Chevrolet', 'سلفرادو', 'Silverado', 2007, 'اوتوماتيك', 'بنزين', '—', 31800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('186', 'مستعمل', 'جي إم سي', 'GMC', 'يوكن', 'Yukon', 2007, 'اوتوماتيك', 'بنزين', '110,000 - 119,999', 30000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('187', 'مستعمل', 'هوندا', 'Honda', 'اكورد', 'Accord', 2007, 'اوتوماتيك', 'بنزين', '—', 20000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('188', 'مستعمل', 'كيا', 'Kia', 'لوتزي', 'Lotze', 2007, 'اوتوماتيك', 'بنزين', '—', 9200, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('189', 'مستعمل', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2007, 'اوتوماتيك', 'بنزين', '130,000 - 139,999', 23000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('190', 'جديد', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2007, 'اوتوماتيك', 'بنزين', '0', 21500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('191', 'مستعمل', 'شيفروليه', 'Chevrolet', 'اوبترا', 'Optra', 2006, 'يدوي/عادي', 'بنزين', '1,000 - 9,999', 8000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('192', 'جديد', 'تويوتا', 'Toyota', 'يارس', 'Yaris', 2006, 'يدوي/عادي', 'بنزين', '0', 13700, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('193', 'جديد', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2006, 'اوتوماتيك', 'بنزين', '0', 24000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('194', 'مستعمل', 'كيا', 'Kia', 'اوبريوس', 'Opirus', 2006, 'اوتوماتيك', 'بنزين', '—', 4800, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('195', 'مستعمل', 'تويوتا', 'Toyota', 'سيكويا', 'Sequoia', 2006, 'اوتوماتيك', 'بنزين', '—', 42000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('196', 'مستعمل', 'هيونداي', 'Hyundai', 'تراجيت', 'Trajet', 2006, 'يدوي/عادي', 'بنزين', '—', 10000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('197', 'مستعمل', 'ميتسوبيشي', 'Mitsubishi', 'سبيس جير', 'Space Gear', 2005, 'يدوي/عادي', 'بنزين', '—', 90999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('198', 'مستعمل', 'هيونداي', 'Hyundai', 'النترا', 'Elantra', 2005, 'اوتوماتيك', 'بنزين', '—', 15000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('199', 'مستعمل', 'كيا', 'Kia', 'ريو', 'Rio', 2005, 'يدوي/عادي', 'بنزين', '—', 7000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('200', 'مستعمل', 'سامسونج', 'Samsung', 'SM3', 'SM3', 2005, 'اوتوماتيك', 'بنزين', '—', 6500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('201', 'مستعمل', 'تويوتا', 'Toyota', 'كورولا', 'Corolla', 2005, 'اوتوماتيك', 'بنزين', '—', 15500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('202', 'مستعمل', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2005, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 15500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('203', 'مستعمل', 'هيونداي', 'Hyundai', 'سنتافي', 'Santa Fe', 2005, 'يدوي/عادي', 'بنزين', '180,000 - 189,999', NULL, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('204', 'مستعمل', 'هيونداي', 'Hyundai', 'جيتز', 'Getz', 2005, 'يدوي/عادي', 'بنزين', '—', 16000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('205', 'مستعمل', 'كيا', 'Kia', 'سبيكترا', 'Spectra', 2005, 'اوتوماتيك', 'بنزين', '190,000 - 199,999', 12000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('206', 'مستعمل', 'هيونداي', 'Hyundai', 'فيرنا', 'Verna', 2005, 'يدوي/عادي', 'بنزين', '1,000 - 9,999', 13000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('207', 'مستعمل', 'كيا', 'Kia', 'ريو', 'Rio', 2004, 'اوتوماتيك', 'بنزين', '160,000 - 169,999', 5500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('208', 'مستعمل', 'تويوتا', 'Toyota', 'سيكويا', 'Sequoia', 2004, 'اوتوماتيك', 'بنزين', '—', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('209', 'مستعمل', 'تويوتا', 'Toyota', '4 رونر', '4Runner', 2004, 'اوتوماتيك', 'بنزين', '160,000 - 200,000', 41000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('210', 'مستعمل', 'أوبل', 'Opel', 'زافيرا', 'Zafira', 2004, 'يدوي/عادي', 'بنزين', '160,000 - 169,999', 7500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('211', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2004, 'اوتوماتيك', 'بنزين', '—', 14500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('212', 'مستعمل', 'فولكسفاغن', 'Volkswagen', 'ID 4', 'ID.4', 2004, 'يدوي/عادي', 'بنزين', '—', 5000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('213', 'مستعمل', 'هيونداي', 'Hyundai', 'سوناتا', 'Sonata', 2004, 'اوتوماتيك', 'بنزين', '—', 6000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('214', 'مستعمل', 'هيونداي', 'Hyundai', 'افانتي', 'Avante', 2003, 'اوتوماتيك', 'بنزين', '—', 7700, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('215', 'مستعمل', 'دايو', 'Daewoo', 'كالوس', 'Kalos', 2003, 'اوتوماتيك', 'بنزين', '—', 1000000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('216', 'مستعمل', 'ميتسوبيشي', 'Mitsubishi', 'كولت', 'Colt', 2000, 'يدوي/عادي', 'بنزين', '140,000 - 149,999', 5900, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('217', 'مستعمل', 'تويوتا', 'Toyota', '4 رونر', '4Runner', 2000, 'اوتوماتيك', 'بنزين', '—', 27500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('218', 'مستعمل', 'دايو', 'Daewoo', 'سيالو', 'Cielo', 2000, 'يدوي/عادي', 'بنزين', '1,000 - 9,999', 8500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('219', 'مستعمل', 'فولكسفاغن', 'Volkswagen', 'بورا', 'Bora', 2000, 'يدوي/عادي', 'ديزل', '—', 15500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('220', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-E', 'E-Class', 2000, 'اوتوماتيك', 'بنزين', '150,000 - 159,999', 25000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('221', 'مستعمل', 'مرسيدس بنز', 'Mercedes-Benz', 'الفئة-C', 'C-Class', 1999, 'اوتوماتيك', 'بنزين', '—', 13000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('222', 'مستعمل', 'بي ام دبليو', 'BMW', 'الفئة 5', 'Series 5', 1998, 'اوتوماتيك', 'بنزين', '—', 987569, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('223', 'مستعمل', 'كرايسلر', 'Chrysler', 'اخرى', 'Other', 1990, 'اوتوماتيك', 'بنزين', '—', 10500, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('224', 'مستعمل', 'ميتسوبيشي', 'Mitsubishi', 'لانسر', 'Lancer', 2007, 'اوتوماتيك', 'بنزين', '—', 7000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('225', 'مستعمل', 'شيفروليه', 'Chevrolet', 'اوبترا', 'Optra', 2008, 'يدوي/عادي', 'بنزين', '—', 6000, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('226', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2010, 'اوتوماتيك', 'بنزين', '—', 99999, '2026-04-05')").run();
  db.prepare("INSERT OR IGNORE INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated) VALUES ('227', 'مستعمل', 'تويوتا', 'Toyota', 'توندرا', 'Tundra', 2006, 'اوتوماتيك', 'بنزين', '—', 44500, '2026-04-05')").run();
    console.log('[SEED] ✅ libyan_market_prices seeded:', db.prepare("SELECT COUNT(*) as c FROM libyan_market_prices").get());
  } catch(e: any) { console.error('[SEED] libyan_market_prices error:', e.message); }
};
seedLibyanMarketPrices227();


db.exec(`
  CREATE TABLE IF NOT EXISTS seller_wallets (
    sellerId TEXT PRIMARY KEY,
    availableBalance REAL DEFAULT 0,
    pendingBalance REAL DEFAULT 0,
    totalEarned REAL DEFAULT 0,
    totalWithdrawn REAL DEFAULT 0,
    lastUpdated TEXT,
    iban TEXT,
    FOREIGN KEY(sellerId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS seller_transactions (
    id TEXT PRIMARY KEY,
    sellerId TEXT NOT NULL,
    carId TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    commission REAL DEFAULT 0,
    netAmount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    description TEXT,
    timestamp TEXT NOT NULL,
    processedAt TEXT,
    FOREIGN KEY(sellerId) REFERENCES users(id),
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY,
    sellerId TEXT NOT NULL,
    amount REAL NOT NULL,
    iban TEXT,
    bankName TEXT,
    status TEXT DEFAULT 'pending',
    requestedAt TEXT NOT NULL,
    processedAt TEXT,
    adminNote TEXT,
    FOREIGN KEY(sellerId) REFERENCES users(id)
  );
`);

// Seed seller wallet for demo seller-1
try {
  db.exec(`
    INSERT OR IGNORE INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated)
    VALUES ('seller-1', 12500, 34500, 145000, 98000, '${new Date().toISOString()}');

    INSERT OR IGNORE INTO seller_transactions (id, sellerId, carId, type, amount, commission, netAmount, status, description, timestamp, processedAt)
    VALUES
      ('stx-1', 'seller-1', 'car-1', 'sale', 18500, 350, 18150, 'available', 'بيع: 2023 Toyota Camry SE', '2024-02-20T10:00:00Z', '2024-02-22T10:00:00Z'),
      ('stx-2', 'seller-1', 'car-2', 'sale', 14200, 300, 13900, 'pending', 'بيع: 2021 Honda Civic', '2024-02-15T14:00:00Z', NULL),
      ('stx-3', 'seller-1', NULL, 'withdrawal', 10000, 0, 10000, 'completed', 'سحب رصيد إلى IBAN', '2024-02-10T09:00:00Z', '2024-02-11T09:00:00Z'),
      ('stx-4', 'seller-1', 'car-3', 'sale', 22000, 440, 21560, 'available', 'بيع: 2022 BMW M3', '2024-02-05T11:00:00Z', '2024-02-07T11:00:00Z');
  `);
} catch (e) { /* Already seeded */ }

// ======= PHASE 7: KYC DOCUMENTS TABLE =======
db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_documents (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    docType TEXT NOT NULL DEFAULT 'kyc',
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    uploadedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    reviewedAt TEXT,
    reviewNote TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Database indexes for query performance
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);
    CREATE INDEX IF NOT EXISTS idx_cars_sellerId ON cars(sellerId);
    CREATE INDEX IF NOT EXISTS idx_cars_winnerId ON cars(winnerId);
    CREATE INDEX IF NOT EXISTS idx_bids_carId ON bids(carId);
    CREATE INDEX IF NOT EXISTS idx_bids_userId ON bids(userId);
    CREATE INDEX IF NOT EXISTS idx_invoices_userId ON invoices(userId);
    CREATE INDEX IF NOT EXISTS idx_invoices_carId ON invoices(carId);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
    CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId);
    CREATE INDEX IF NOT EXISTS idx_messages_receiverId ON messages(receiverId);
    CREATE INDEX IF NOT EXISTS idx_shipments_userId ON shipments(userId);
    CREATE INDEX IF NOT EXISTS idx_watchlist_userId ON watchlist(userId);
  `);
} catch (_) { }

// Safe column additions (ignore if already exist)
try { db.exec("ALTER TABLE seller_wallets ADD COLUMN bankName TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE users ADD COLUMN kycDocUrl TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE users ADD COLUMN lastLogin TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE users ADD COLUMN loginCount INTEGER DEFAULT 0"); } catch (_) { }
try { db.exec("ALTER TABLE seller_wallets ADD COLUMN iban TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE seller_wallets ADD COLUMN bankName TEXT DEFAULT NULL"); } catch (_) { }
try { db.exec("ALTER TABLE seller_transactions ADD COLUMN createdAt TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE offices ADD COLUMN phone TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE offices ADD COLUMN email TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE offices ADD COLUMN address TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE offices ADD COLUMN city TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE offices ADD COLUMN country TEXT DEFAULT 'ليبيا'"); } catch (_) { }
// Backfill createdAt for seller_transactions
try { db.exec("UPDATE seller_transactions SET createdAt = timestamp WHERE createdAt IS NULL"); } catch (_) { }

// ======= PHASE 10: BUYER WALLET & PAYMENT SYSTEM =======
db.exec(`
  CREATE TABLE IF NOT EXISTS buyer_wallets (
    userId        TEXT PRIMARY KEY,
    balance       REAL DEFAULT 0,      -- available balance
    reservedAmount REAL DEFAULT 0,     -- amount locked in active bids
    totalDeposited REAL DEFAULT 0,
    totalSpent     REAL DEFAULT 0,
    iban           TEXT,
    bankName       TEXT,
    updatedAt      TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payment_requests (
    id            TEXT PRIMARY KEY,
    userId        TEXT NOT NULL,
    type          TEXT NOT NULL,   -- 'topup' | 'withdrawal' | 'invoice_payment'
    amount        REAL NOT NULL,
    method        TEXT DEFAULT 'bank_transfer',  -- 'bank_transfer' | 'cash' | 'card'
    referenceNo   TEXT,            -- bank transfer ref or receipt number
    invoiceId     TEXT,            -- only for invoice_payment
    status        TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
    adminNote     TEXT,
    receiptUrl    TEXT,            -- uploaded proof of payment
    requestedAt   TEXT NOT NULL,
    processedAt   TEXT,
    FOREIGN KEY(userId)    REFERENCES users(id),
    FOREIGN KEY(invoiceId) REFERENCES invoices(id)
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id          TEXT PRIMARY KEY,
    userId      TEXT NOT NULL,
    type        TEXT NOT NULL,   -- 'credit' | 'debit' | 'reserve' | 'release' | 'pay_invoice'
    amount      REAL NOT NULL,
    balanceAfter REAL NOT NULL,
    description TEXT,
    refId       TEXT,            -- paymentRequestId or invoiceId
    timestamp   TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );
`);

// API keys for external partners
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT,
    active INTEGER DEFAULT 1,
    usageCount INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    lastUsedAt TEXT
  );
`);

// Expenses table for operational cost tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    date TEXT NOT NULL,
    addedBy TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(addedBy) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crm_notes (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    note TEXT NOT NULL,
    addedBy TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Safe column additions for Phase 10
try { db.exec("ALTER TABLE users ADD COLUMN walletBalance REAL DEFAULT 0"); } catch (_) { }
try { db.exec("ALTER TABLE invoices ADD COLUMN paidAt TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE invoices ADD COLUMN paidVia TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE notifications ADD COLUMN link TEXT"); } catch (_) { }

// Seed buyer wallets for demo users
db.exec("PRAGMA foreign_keys = OFF;");
try {
  db.exec(`
    INSERT OR IGNORE INTO buyer_wallets (userId, balance, reservedAmount, totalDeposited, totalSpent, updatedAt)
    VALUES
      ('user-1',   45000,  5000, 50000, 0, '${new Date().toISOString()}'),
      ('buyer-1', 100000,     0, 100000, 0, '${new Date().toISOString()}'),
      ('buyer-2', 150000,  5000, 155000, 0, '${new Date().toISOString()}'),
      ('buyer-3',  45000,     0, 45000,  0, '${new Date().toISOString()}'),
      ('buyer-4', 200000, 20000, 220000, 0, '${new Date().toISOString()}'),
      ('buyer-5',   4500,     0, 4500,   0, '${new Date().toISOString()}');

    INSERT OR IGNORE INTO wallet_transactions (id, userId, type, amount, balanceAfter, description, timestamp)
    VALUES
      ('wt-1', 'user-1', 'credit', 50000, 50000, 'إيداع ضمان أولي', '2024-02-01T10:00:00Z'),
      ('wt-2', 'user-1', 'reserve', 5000, 45000, 'حجز مبلغ للمزايدة على سيارة BMW M3', '2024-02-10T14:00:00Z');

    INSERT OR IGNORE INTO payment_requests (id, userId, type, amount, method, status, requestedAt, processedAt)
    VALUES
      ('pr-1', 'user-1', 'topup', 50000, 'bank_transfer', 'approved', '2024-02-01T09:00:00Z', '2024-02-01T11:00:00Z');
  `);
} catch (_) { }
db.exec("PRAGMA foreign_keys = ON;");






// 4. Sample Invoices / Transactions
db.exec("PRAGMA foreign_keys = OFF;");
db.exec(`
  INSERT OR IGNORE INTO invoices(id, userId, carId, amount, status, type, timestamp, dueDate)
  VALUES('inv-1', 'user-1', 'car-1', 1250, 'unpaid', 'Auction Fee', '2024-02-20', '2024-02-27');
  
  INSERT OR IGNORE INTO invoices(id, userId, carId, amount, status, type, timestamp, dueDate)
  VALUES('inv-2', 'user-1', 'car-2', 3500, 'paid', 'Purchase', '2024-02-15', '2024-02-22');

  INSERT OR IGNORE INTO transactions(id, userId, amount, type, status, timestamp)
  VALUES('tr-1', 'user-1', 5000, 'deposit', 'completed', '2024-02-01');
`);
db.exec("PRAGMA foreign_keys = ON;");

// 5. Sample Cars Generation (20 Cars)
const makes = ['BMW', 'Mercedes-Benz', 'Toyota', 'Porsche', 'Audi', 'Ford', 'Tesla', 'Lexus', 'Jeep', 'Land Rover'];
const carModels: Record<string, string[]> = {
  'BMW': ['M3 Competition', 'X5 M', '750Li', 'i7'],
  'Mercedes-Benz': ['S500', 'G63 AMG', 'E350', 'EQS'],
  'Toyota': ['Camry SE', 'Land Cruiser', 'Supra', 'RAV4'],
  'Porsche': ['911 Carrera', 'Cayenne GTS', 'Taycan Turbo', 'Macan'],
  'Audi': ['RS6 Avant', 'Q8', 'A4', 'e-tron GT'],
  'Ford': ['F-150 Raptor', 'Mustang GT', 'Explorer', 'Bronco'],
  'Tesla': ['Model X Plaid', 'Model S', 'Model 3', 'Model Y'],
  'Lexus': ['RX 350', 'LX 600', 'ES 350', 'LS 500'],
  'Jeep': ['Wrangler Rubicon', 'Grand Cherokee', 'Gladiator', 'Renegade'],
  'Land Rover': ['Defender 110', 'Range Rover Sport', 'Discovery', 'Evoque']
};
const carStatuses = [
  'live', 'live', 'live', 'live', 'live', 'live',
  'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
  'offer_market', 'offer_market', 'offer_market', 'offer_market', 'offer_market', 'offer_market'
];
const carLocations = ['Long Island, NY', 'Miami, FL', 'Houston, TX', 'Los Angeles, CA', 'Newark, NJ', 'Atlanta, GA', 'Chicago, IL', 'Baltimore, MD', 'Denver, CO', 'Seattle, WA'];

for (let i = 1; i <= 18; i++) {
  const make = makes[i % makes.length];
  const modelArray = carModels[make];
  const model = modelArray[i % modelArray.length];
  const status = carStatuses[i - 1]; 
  const lotNumber = (70000000 + i).toString();
  const id = `car-${i}`;
  const reservePrice = 20000 + (i * 5000);
  const currentBid = reservePrice - (i * 1000) - 2000;

  // Premium Verified Car Image IDs
  const carImageIds = [
    '1503376780353-7e6692767b70', // Porsche
    '1555353540-64fd1b6226f7', // Interior
    '1583121274602-3e2820c69888', // Sports Car
    '1560958089-b8a1929cea89', // Tesla
    '1533473359331-0135ef1b58bf', // Mustang
    '1542281286-6e0a369e88bf', // Audi
    '1614162692292-7ac56d7f7f1e', // Mercedes
    '1605559424843-9e4c228bf1c2', // Mercedes
    '1619767886558-efcbdcecf122', // Sports
    '1614200187524-dc4b892acf16', // Luxury
    '1610647752706-c87b89793ee7', // White Car
    '1494976388531-d10596957faf', // Blue Car
    '1511919884228-dd9071060965', // Red Car
    '1550009158-9ebf69173e03', // Dashboard
    '1541899481282-4537dc80293c'  // Land Rover
  ];

  const images: string[] = [];
  const numImages = 4;
  for (let j = 0; j < numImages; j++) {
    const imgId = carImageIds[(i + j) % carImageIds.length];
    images.push(`https://images.unsplash.com/photo-${imgId}?auto=format&fit=crop&q=80&w=800`);
  }

  const offerMarketEndTime = status === 'offer_market' ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() : null;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO cars (id, lotNumber, vin, make, model, year, odometer, engine, drive, primaryDamage, titleType, location, currentBid, status, images, reservePrice, offerMarketEndTime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, lotNumber, `VIN-${make.slice(0, 3)}-${i}`, make, model, 2020 + (i % 5), 1000 * i,
      '3.0L V6', 'AWD', i % 3 === 0 ? 'Water/Flood' : 'None', 'Clean Title',
      carLocations[i % carLocations.length], currentBid, status, JSON.stringify(images), reservePrice, offerMarketEndTime
    );
  } catch (err) {
    console.error(`Error inserting test car ${id}:`, err);
  }
}

// CRITICAL: Ensure foreign keys are ON for all runtime operations (cascade deletes, etc.)
// This is a safety net in case any init block above left them OFF.
db.exec("PRAGMA foreign_keys = ON;");

// Diagnostic Log
const carCount = db.prepare("SELECT COUNT(*) as count FROM cars").get() as any;
console.log(`Database Status: ${carCount.count} cars loaded.`);

async function startServer() {
  console.log("🚀 Starting Server Initialization...");
  const app = express();
  const httpServer = createServer(app);

  const PORT = Number(process.env.PORT) || 3005;

  const allowedOrigins = [
    SITE_URL,
    'http://localhost:3005',
    'http://localhost:5173',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true }
  });
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Security headers ──
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' wss: https:; frame-ancestors 'self';");
    }
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // ── In-memory rate limiter (login & sensitive endpoints) ──
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  // Cleanup expired entries every 5 minutes to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (entry.resetAt < now) rateLimitMap.delete(key);
    }
  }, 5 * 60 * 1000);
  const rateLimit = (maxRequests: number, windowMs: number) => (req: any, res: any, next: any) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || entry.resetAt < now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'طلبات كثيرة جداً، يرجى الانتظار قليلاً' });
    }
    next();
  };

  // Apply rate limiting to sensitive routes
  app.use('/api/auth/login', rateLimit(10, 60_000));       // 10 per minute
  app.use('/api/auth/register', rateLimit(5, 60_000));     // 5 per minute
  app.use('/api/payments/', rateLimit(30, 60_000));        // 30 per minute
  app.use('/api/deposit', rateLimit(10, 60_000));          // 10 per minute

  // Register health check IMMEDIATELY
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Settings API
  app.get("/api/settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT key, value FROM system_settings").all() as any[];
      const config: Record<string, string> = {};
      settings.forEach(s => config[s.key] = s.value);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireAdmin, (req, res) => {
    try {
      const updates = req.body;
      const stmt = db.prepare("UPDATE system_settings SET value = ?, updatedAt = ? WHERE key = ?");
      const insertStmt = db.prepare("INSERT OR IGNORE INTO system_settings (key, value, description, updatedAt) VALUES (?, ?, 'Added via API', ?)");
      
      const now = new Date().toISOString();
      db.transaction(() => {
        for (const [key, value] of Object.entries(updates)) {
          const valStr = String(value);
          const result = stmt.run(valStr, now, key);
          if (result.changes === 0) {
            insertStmt.run(key, valStr, now);
          }
        }
      })();
      res.json({ success: true, message: "Settings updated successfully" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update settings", details: err.message });
    }
  });

  // Start listening before Vite
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ HTTP Server listening on http://localhost:${PORT}`);
  });

  // ======= Internal Helper Functions =======

  function sendInternalMessage(senderId: string, receiverId: string, subject: string, content: string, category: string = 'general') {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const timestamp = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO messages(id, senderId, receiverId, subject, content, timestamp, category) VALUES(?, ?, ?, ?, ?, ?, ?)`)
        .run(id, senderId, receiverId, subject, content, timestamp, category);
      const sender: any = db.prepare("SELECT buyingPower, deposit, firstName, lastName, country FROM users WHERE id = ?").get(senderId) as any;

      const messageData = {
        id, senderId, receiverId, subject, content, timestamp, category, isRead: 0,
        senderFirstName: sender?.firstName || 'النظام',
        senderLastName: sender?.lastName || ''
      };

      io.to(`user_${receiverId}`).emit("new_message", messageData);
      if (category !== 'general' && receiverId !== 'admin-1') {
        io.to(`user_admin-1`).emit("new_message", messageData);
      }
    } catch (err) { console.error('sendInternalMessage error:', err); }
  }

  // Rich Template Engine for Professional Communications
  const NotificationColors: Record<string, { primary: string; bg: string; border: string }> = {
    success: { primary: '#16a34a', bg: '#f0fdf4', border: '#bcf0da' },
    warning: { primary: '#ea580c', bg: '#fff7ed', border: '#ffedd5' },
    error: { primary: '#dc2626', bg: '#fef2f2', border: '#fee2e2' },
    info: { primary: '#2563eb', bg: '#eff6ff', border: '#dbeafe' },
    alert: { primary: '#7c3aed', bg: '#f5f3ff', border: '#ede9fe' }
  };

  const TemplateEngine = {
    getHtml: (title: string, message: string, type: string = 'info', customTemplate?: any) => {
      const colors = NotificationColors[type] || { primary: '#0f172a', bg: '#f8fafc', border: '#e2e8f0' };

      if (customTemplate && customTemplate.body_html) {
         // Replace placeholders in custom template
         let content = customTemplate.body_html
          .replace(/\{\{title\}\}/g, title)
          .replace(/\{\{message\}\}/g, message)
          .replace(/\{\{primary_color\}\}/g, colors.primary)
          .replace(/\{\{bg_color\}\}/g, colors.bg)
          .replace(/\{\{border_color\}\}/g, colors.border);

        // Replace Context Variables
        if (customTemplate.context) {
          Object.keys(customTemplate.context).forEach(key => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            content = content.replace(regex, customTemplate.context[key] || '');
          });
        }
        return content;
      }

      return `
        <!DOCTYPE html>
        <html dir="rtl">
        <head><meta charset="utf-8"></head>
        <body style="margin:0; padding:0; background-color:#f8fafc; font-family:Arial, sans-serif;">
          <div style="max-width:600px; margin:20px auto; background-color:white; border-radius:16px; overflow:hidden; border:1px solid ${colors.border}; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="background-color:#0f172a; padding:24px; text-align:center;">
              <h1 style="color:#f97316; font-size:24px; margin:0; letter-spacing:2px; font-weight:900;">A U T O &nbsp; P R O</h1>
              <p style="color:#94a3b8; font-size:12px; margin:4px 0 0; letter-spacing:4px;">A U C T I O N S</p>
            </div>
            
            <div style="padding:40px 30px; text-align:center; background-color:${colors.bg};">
              <div style="display:inline-block; padding:10px 20px; background-color:white; border-radius:100px; border:2px solid ${colors.primary}; color:${colors.primary}; font-weight:bold; margin-bottom:20px; font-size:14px;">
                💎 إشعار رسمي من المنصة
              </div>
              <h2 style="color:#0f172a; margin:0 0 16px; font-size:28px; font-weight:900;">${title}</h2>
              <div style="height:3px; width:60px; background-color:${colors.primary}; margin:0 auto 24px;"></div>
              <p style="color:#334155; font-size:18px; line-height:1.6; margin:0; white-space:pre-wrap;">${message}</p>
            </div>

            <div style="background-color:#f1f5f9; padding:20px; text-align:center; border-top:1px solid #e2e8f0;">
              <p style="color:#64748b; font-size:12px; margin:0;">هذا إشعار تلقائي من أوتو برو للمزادات - ليبيا 2026.<br>يمكنك التحكم في الإشعارات من إعدادات حسابك.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    },
    getWhatsApp: (title: string, message: string, customTemplate?: any, context: any = {}) => {
      if (customTemplate && customTemplate.body_whatsapp) {
        let content = customTemplate.body_whatsapp
          .replace(/\{\{title\}\}/g, title)
          .replace(/\{\{message\}\}/g, message);

        // Replace Context Variables
        Object.keys(context).forEach(key => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          content = content.replace(regex, context[key] || '');
        });
        return content;
      }
      return `🌟 *A U T O P R O  A U C T I O N S*\n\n🔔 *${title}*\n\n${message}\n\n🔗 *رابط الوصل:* https://www.autopro.ac/dashboard`;
    }
  };

  // Function to send a notification and optional email/whatsapp mirror
  function sendNotification(userId: string, title: string, message: string, type: string = 'info', templateId: string = 'general_notification', context: any = {}, link: string = '') {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const timestamp = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO notifications(id, userId, title, message, type, timestamp, link) VALUES(?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, title, message, type, timestamp, link || null);

      const notifData = { id, userId, title, message, type, timestamp, isRead: 0, link };
      io.to(`user_${userId}`).emit("new_notification", notifData);

      // Omni-Channel External Dispatch (Email/WhatsApp)
      const user: any = db.prepare("SELECT firstName, lastName, email, phone FROM users WHERE id = ?").get(userId);
      if (!user) return;

      const fullContext = { ...context, userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() };

      const settings: any = db.prepare("SELECT emailNotifications, whatsappNotifications FROM user_settings WHERE userId = ?").get(userId);
      const wantsEmail = settings ? settings.emailNotifications === 1 : true;
      const wantsWhatsapp = settings ? settings.whatsappNotifications === 1 : true;

      // Fetch specific template
      const template: any = db.prepare("SELECT * FROM notification_templates WHERE id = ?").get(templateId) || 
                       db.prepare("SELECT * FROM notification_templates WHERE id = 'general_notification'").get();
      
      const emailTemplateData = template ? { ...template, context: fullContext } : null;

      if (wantsEmail && transporter && user.email) {
        transporter.sendMail({
          from: process.env.SMTP_FROM || '"AUTOPRO AUCTIONS" <info@autopro.ac>',
          to: user.email,
          subject: template?.subject?.replace(/\{\{title\}\}/g, title) || `${title} | تنبيه منصة أوتو برو`,
          html: TemplateEngine.getHtml(title, message, type, emailTemplateData)
        }).catch(err => console.error("Rich Email Error:", err.message));
      }

      if (wantsWhatsapp && user.phone) {
        const cleanPhone = user.phone.replace(/[^0-9]/g, '').replace(/^00/, '').replace(/^0/, '');
        const wasenderToken = process.env.WASENDER_TOKEN;
        if (wasenderToken) {
          fetch(`https://wasenderapi.com/api/send-message`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${wasenderToken}`
            },
            body: JSON.stringify({
              to: cleanPhone,
              text: TemplateEngine.getWhatsApp(title, message, template, fullContext)
            })
          }).catch(err => console.error("Rich WhatsApp Error:", err.message));
        }
      }
    } catch (err) { console.error('sendNotification error:', err); }
  }

  function createWinInvoices(userId: string, carId: string, amount: number) {
    const now = new Date().toISOString();
    const dueDate7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const settings = db.prepare("SELECT key, value FROM system_settings").all() as any[];
    const config: Record<string, number> = {};
    settings.forEach(s => config[s.key] = parseFloat(s.value));

    const commissionRate = config['platform_commission_rate'] || 0.07;
    const transportFee = config['internal_transport_fee'] || 450;
    const shippingFee = config['international_shipping_est'] || 1200;

    const commission = amount * commissionRate;
    const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId) as any;
    const buyer: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;

    if (!car) return { error: "Car not found" };

    // Deterministic IDs to PREVENT DUPLICATES
    const inv1 = `inv-pur-${carId}`;
    const inv2 = `inv-trn-${carId}`;
    const inv3 = `inv-shp-${carId}`;
    const shipId = `ship-${carId}`;

    db.transaction(() => {
      // Purchase Invoice — amount is the sale price only; commission deducted from seller payout
      const buyerFee = commission;
      db.prepare(`INSERT OR IGNORE INTO invoices(id, userId, carId, amount, status, type, timestamp, dueDate, notes) VALUES(?, ?, ?, ?, 'unpaid', 'purchase', ?, ?, ?)`).run(inv1, userId, carId, amount, now, dueDate7, `عمولة المنصة: $${buyerFee.toFixed(2)} (${(commissionRate * 100).toFixed(1)}%) — تُخصم من حساب البائع`);

      // Internal Transport Invoice (Pending)
      db.prepare(`INSERT OR IGNORE INTO invoices(id, userId, carId, amount, status, type, timestamp, dueDate) VALUES(?, ?, ?, ?, 'pending', 'transport', ?, ?)`).run(inv2, userId, carId, transportFee, now, dueDate7);

      // Ocean Shipping Invoice (Pending)
      db.prepare(`INSERT OR IGNORE INTO invoices(id, userId, carId, amount, status, type, timestamp, dueDate) VALUES(?, ?, ?, ?, 'pending', 'shipping', ?, ?)`).run(inv3, userId, carId, shippingFee, now, dueDate7);

      // Shipping Record (Physical Status)
      db.prepare(`INSERT OR IGNORE INTO shipments(id, carId, userId, status, createdAt, updatedAt) VALUES(?, ?, ?, 'awaiting_dispatch', ?, ?)`)
        .run(shipId, carId, userId, now, now);
    })();

    // ✅ NOTIFY SELLER
    if (car && car.sellerId) {
      sendNotification(car.sellerId, 'تم بيع سيارة! 💰', `تم بيع سيارتك ${car.make} ${car.model} بمبلغ $${amount.toLocaleString()}`, 'success', 'car_sold', {
        carLink: `https://www.autopro.ac/cars/${carId}`,
        itemInfo: `${car.year} ${car.make} ${car.model}`
      }, `/cars/${carId}`);
      sendInternalMessage('admin-1', car.sellerId, '✅ تأكيد بيع سيارة',
        `تهانينا! تم بيع سيارتك ${car.make} ${car.model} (${car.year}) بنجاح.\n\n` +
        `السعر النهائي: $${amount.toLocaleString()}\n` +
        `المشتري: (ID: ${userId})\n\n` +
        `يرجى التوجه لقسم اللوجستيات في لوحة التاجر لمتابعة إجراءات التسليم والرفع.`
      );
    }

    // ✅ NOTIFY BUYER (Email + Internal)
    if (car && buyer) {
      const message = `لقد فزت بمزاد سيارة ${car.make} ${car.model} بمبلغ $${amount.toLocaleString()}. تم إصدار فواتير الشراء والشحن والنقل، يرجى سدادها للبدء في إجراءات الشحن.`;
      
      sendNotification(userId, 'تهانينا! فزت بسيارة 🎉', message, 'success', 'auction_win', {
        carLink: `https://www.autopro.ac/cars/${carId}`,
        winLink: `https://www.autopro.ac/dashboard/wins`,
        invoiceLink: `https://www.autopro.ac/dashboard/invoices`,
        itemInfo: `${car.year} ${car.make} ${car.model}`
      }, `/cars/${carId}`);

      sendInternalMessage('admin-1', userId, '🏆 إشعار فوز بالمزاد وإصدار فواتير',
        `أهلاً! لقد فزت بسيارة ${car.make} ${car.model} (${car.year}).\n\n` +
        `السعر النهائي: $${amount.toLocaleString()}\n` +
        `تم إصدار فاتورة الشراء وتكاليف النقل، يرجى سدادها خلال 7 أيام من تاريخ اليوم لإتمام عملية الشحن.`
      );

      // HTML Email Notification
      if (transporter && buyer.email) {
        transporter.sendMail({
          from: process.env.SMTP_FROM || '"AUTOPRO AUCTIONS" <info@autopro.ac>',
          to: buyer.email,
          subject: `تهانينا! فزت بـ ${car.make} ${car.model} 🏆`,
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; color: #0f172a; line-height: 1.6;">
              <div style="background: white; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background: #f97316; padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">تهانينا! فزت بفرقة AutoPro 🏆</h1>
                </div>
                <div style="padding: 30px;">
                  <h2 style="color: #1e293b; margin-top: 0;">عزيزي ${buyer.firstName}،</h2>
                  <p>يسعدنا إبلاغك بأنك نجحت في الفوز بمزاد السيارة التالية:</p>
                  <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f97316;">
                    <h3 style="margin: 0; color: #0f172a;">${car.year} ${car.make} ${car.model}</h3>
                    <p style="margin: 5px 0 0 0; color: #64748b;">السعر النهائي: <strong style="color: #f97316;">$${amount.toLocaleString()}</strong></p>
                  </div>
                  <p>تم إصدار الفواتير المطلوبة أدناه وهي متاحة الآن للسداد عبر لوحة التحكم:</p>
                  <ul style="padding-right: 20px;">
                    <li>فاتورة شراء السيارة ومصروفات المنصة</li>
                    <li>فاتورة النقل الداخلي (إلى الميناء)</li>
                    <li>فاتورة الشحن الدولي (تقديرية)</li>
                  </ul>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://autopro.ac/dashboard/invoices" style="background: #f97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">اضغط هنا لسداد الفواتير</a>
                  </div>
                  <p style="font-size: 14px; color: #64748b;">ملاحظة: يرجى إتمام السداد خلال 7 أيام لتجنب أي غرامات تأخير أو إلغاء للطلب.</p>
                </div>
                <div style="background: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                  هذا البريد مرسل آلياً من منصة أوتو برو | بنغازي - ليبيا
                </div>
              </div>
            </div>
          `
        }).catch(e => console.error("Buyer win email error:", e.message));
      }
    }

    return { purchaseInvoice: inv1, transportInvoice: inv2, shippingInvoice: inv3, shipmentId: shipId };
  }

  function walletCredit(userId: string, amount: number, description: string, refId?: string) {
    db.prepare(`
      INSERT INTO buyer_wallets (userId, balance, totalDeposited, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ?
    `).run(userId, amount, amount, new Date().toISOString(), amount, amount, new Date().toISOString());

    const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
    const newBalance = wallet.balance;

    const txId = `wt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    db.prepare(`INSERT INTO wallet_transactions (id, userId, type, amount, balanceAfter, description, refId, timestamp) VALUES (?,?,?,?,?,?,?,?)`)
      .run(txId, userId, 'credit', amount, newBalance, description, refId || null, new Date().toISOString());

    db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newBalance, newBalance * 10, userId);
    return newBalance;
  }

  // Atomic wallet debit — prevents double-spending via single UPDATE with balance check
  const walletDebitTransaction = db.transaction((userId: string, amount: number, description: string, refId?: string) => {
    const result = db.prepare("UPDATE buyer_wallets SET balance = balance - ?, totalSpent = totalSpent + ?, updatedAt = ? WHERE userId = ? AND balance >= ?")
      .run(amount, amount, new Date().toISOString(), userId, amount);
    if (result.changes === 0) throw new Error("رصيد غير كافٍ في المحفظة");

    const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
    const newBalance = wallet.balance;

    const txId = `wt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    db.prepare(`INSERT INTO wallet_transactions (id, userId, type, amount, balanceAfter, description, refId, timestamp) VALUES (?,?,?,?,?,?,?,?)`)
      .run(txId, userId, 'debit', amount, newBalance, description, refId || null, new Date().toISOString());

    db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newBalance, newBalance * 10, userId);
    return newBalance;
  });

  function walletDebit(userId: string, amount: number, description: string, refId?: string) {
    return walletDebitTransaction(userId, amount, description, refId);
  }

  let isTransitioning = false;

  function processAuctionTransition() {
    isTransitioning = true;
    io.emit("auction_transition", { duration: 5000 });
    setTimeout(() => {
      isTransitioning = false;
      checkUpcomingAuctions();
    }, 5000);
  }

  function finalizeAuction(carId: string) {
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId) as any;
      if (!car) return;

      const lastBid: any = db.prepare("SELECT userId FROM bids WHERE carId = ? ORDER BY amount DESC LIMIT 1").get(carId) as any;
      const winnerId = lastBid ? lastBid.userId : null;

      if (winnerId && car.reservePrice && car.currentBid < car.reservePrice) {
        // Did not reach reserve -> offer market for 24h
        const offerMarketEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.prepare("UPDATE cars SET status = 'offer_market', offerMarketEndTime = ? WHERE id = ?").run(offerMarketEndTime, carId);
        io.emit("car_updated", { id: carId, status: 'offer_market', offerMarketEndTime });
      } else if (winnerId) {
        // Won -> closed
        db.prepare("UPDATE cars SET status = 'closed', winnerId = ? WHERE id = ?").run(winnerId, carId);
        createWinInvoices(winnerId, carId, car.currentBid);
        sendInternalMessage('admin-1', winnerId,
          `🏆 تهانينا! فزت بسيارة ${car.make} ${car.model} ${car.year}`,
          `تهانينا! لقد فزت في المزاد على سيارة ${car.make} ${car.model} ${car.year}!\n\nسعر الفوز: $${car.currentBid.toLocaleString()}\nرقم اللوت: ${car.lotNumber}\n\n📄 تم إنشاء 3 فواتير في حسابك:\n1. فاتورة الشراء (مستحقة الآن)\n2. فاتورة النقل الداخلي (تُفعّل بعد دفع الشراء)\n3. فاتورة الشحن الدولي (تُفعّل بعد وصول المستودع)\n\nفريق ليبيا أوتو برو 🚗`
        );

        const losers = db.prepare("SELECT DISTINCT userId FROM bids WHERE carId = ? AND userId != ?").all(carId, winnerId) as any[];
        losers.forEach((loser: any) => {
          sendInternalMessage('admin-1', loser.userId,
            `😔 لم تفز بسيارة ${car.make} ${car.model}`,
            `للأسف، لم تفز في مزاد سيارة ${car.make} ${car.model} ${car.year}.\n\nالسعر النهائي: $${car.currentBid.toLocaleString()}\n\nالمبلغ المحجوز تم تحريره وعاد لقوتك الشرائية.\n\n🔍 تصفح سيارات مشابهة في المزادات القادمة!\n\nفريق ليبيا أوتو برو 🚗`
          );
        });
        io.emit("car_updated", { id: carId, status: 'closed', winnerId });
      } else {
        // No bids at all -> offer market for 24h
        const offerMarketEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.prepare("UPDATE cars SET status = 'offer_market', offerMarketEndTime = ? WHERE id = ?").run(offerMarketEndTime, carId);
        io.emit("car_updated", { id: carId, status: 'offer_market', offerMarketEndTime });
      }
    } catch (e) {
      console.error(`Error finalizing auction ${carId}:`, e);
    }
  }

  function checkUpcomingAuctions() {
    if (isTransitioning) return;
    const liveRow: any = db.prepare("SELECT COUNT(*) as count FROM cars WHERE status = 'live'").get();
    if (liveRow && liveRow.count === 0) {
      const next: any = db.prepare("SELECT * FROM cars WHERE status = 'upcoming' ORDER BY auctionEndDate ASC, id ASC LIMIT 1").get();
      if (next) {
        // Auction duration: 5 minutes
        const newEndDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.prepare("UPDATE cars SET status = 'live', auctionEndDate = ? WHERE id = ?").run(newEndDate, next.id);
        io.emit("car_updated", { id: next.id, status: 'live', auctionEndDate: newEndDate });
        io.emit("auction_started", { carId: next.id });
        console.log(`[AUCTION QUEUE] Car ${next.id} is now LIVE. Ends at ${newEndDate}`);
      }
    }
  }

  function tickAuctions() {
    if (isTransitioning) return;
    const now = new Date().toISOString();

    // AUTO REPAIR: Any live car missing an end date gets exactly 5 minutes from NOW.
    const nullEndDateCars: any[] = db.prepare("SELECT id FROM cars WHERE status = 'live' AND (auctionEndDate IS NULL OR auctionEndDate = '')").all();
    if (nullEndDateCars.length > 0) {
      const newEndDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      nullEndDateCars.forEach((car: any) => {
        db.prepare("UPDATE cars SET auctionEndDate = ? WHERE id = ?").run(newEndDate, car.id);
        io.emit("car_updated", { id: car.id, auctionEndDate: newEndDate });
        console.log(`[AUTO-REPAIR] Fixed null end date for live car ${car.id}. Ends at ${newEndDate}`);
      });
    }
    
    // Finalize any live cars whose time has expired
    const expiredLive: any[] = db.prepare("SELECT id FROM cars WHERE status = 'live' AND auctionEndDate <= ?").all(now);
    if (expiredLive.length > 0) {
      expiredLive.forEach((car: any) => {
        console.log(`[AUCTION QUEUE] Car ${car.id} time expired. Finalizing...`);
        finalizeAuction(car.id);
      });
      // Enter 5 seconds transition phase before jumping to the next car
      processAuctionTransition();
    } else {
      checkUpcomingAuctions();
    }
  }

  // Start the heartbeat timer for live auctions
  setInterval(tickAuctions, 1000);

  


  app.get("/api/debug/seed-simulation", requireAdmin, (req, res) => {
    try {
      console.log("🚀 API Triggered Full Simulation Seeding...");

      // Buyers
      const buyers = [
        { id: "buyer-1", firstName: "خالد", lastName: "المنفي", email: "buyer1@test.com", phone: "0911111111", password: "user123", role: "buyer", status: "active", deposit: 10000, buyingPower: 100000 },
        { id: "buyer-2", firstName: "أحمد", lastName: "الورفلي", email: "buyer2@test.com", phone: "0922222222", password: "user123", role: "buyer", status: "active", deposit: 15000, buyingPower: 150000 },
        { id: "buyer-3", firstName: "مصطفى", lastName: "القمودي", email: "buyer3@test.com", phone: "0933333333", password: "user123", role: "buyer", status: "active", deposit: 5000, buyingPower: 50000 },
        { id: "buyer-4", firstName: "سالم", lastName: "الزنتاني", email: "buyer4@test.com", phone: "0944444444", password: "user123", role: "buyer", status: "active", deposit: 20000, buyingPower: 200000 },
        { id: "buyer-5", firstName: "عمر", lastName: "المختار", email: "buyer5@test.com", phone: "0955555555", password: "user123", role: "buyer", status: "active", deposit: 500, buyingPower: 5000 },
      ];

      for (const buyer of buyers) {
        db.prepare(`
                INSERT OR REPLACE INTO users (id, firstName, lastName, email, phone, password, role, status, deposit, buyingPower, joinDate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(buyer.id, buyer.firstName, buyer.lastName, buyer.email, buyer.phone, buyer.password, buyer.role, buyer.status, buyer.deposit, buyer.buyingPower, new Date().toISOString());
      }

      // 20 Cars
      const carMakes = ['Mercedes-Benz', 'BMW', 'Toyota', 'Porsche', 'Audi', 'Lexus', 'Land Rover', 'Jeep'];
      const carModelMap: any = {
        'Mercedes-Benz': ['S580', 'G63 AMG', 'E350', 'GLE 53'],
        'BMW': ['760Li', 'X7 M60i', 'M4 Competition', 'iX'],
        'Toyota': ['Land Cruiser 300', 'Camry SE', 'Avalon', 'Supra'],
        'Porsche': ['911 Turbo S', 'Cayenne Coupe', 'Panamera', 'Taycan'],
        'Audi': ['RS7', 'Q8 E-tron', 'A8L', 'RSQ8'],
        'Lexus': ['LX600', 'LS500h', 'RX350', 'LC500'],
        'Land Rover': ['Range Rover Autobiography', 'Defender 110 V8', 'Sport', 'Velar'],
        'Jeep': ['Grand Wagoneer', 'Wrangler Rubicon', 'Grand Cherokee L', 'Gladiator']
      };

      const sampleImages = [
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70", // Porsche (Silver)
        "https://images.unsplash.com/photo-1560958089-b8a1929cea89", // Tesla (White/Silver)
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf", // Mustang (Dark Blue)
        "https://images.unsplash.com/photo-1494976388531-d10596957faf", // Muscle Car (Blue)
        "https://images.unsplash.com/photo-1511919884228-dd9071060965", // Sports (Red)
        "https://images.unsplash.com/photo-1614200187524-dc4b892acf16", // Luxury (Black)
        "https://images.unsplash.com/photo-1610647752706-c87b89793ee7", // Luxury (White)
        "https://images.unsplash.com/photo-1555353540-64fd1b6226f7", // High End Interior
        "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2", // Mercedes
        "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e", // G-Wagon
        "https://images.unsplash.com/photo-1542281286-6e0a369e88bf", // Audi
        "https://images.unsplash.com/photo-1550009158-9ebf69173e03"  // Detailed Part
      ].map(url => `${url}?auto=format&fit=crop&q=80&w=800`);

      for (let i = 1; i <= 20; i++) {
        const make = carMakes[i % carMakes.length];
        const models = carModelMap[make];
        const model = models[i % models.length];
        const id = `sim-car-${i}`;
        let status = 'upcoming';
        if (i <= 5) status = 'live';
        if (i > 15) status = 'offer_market';

        const imgIdx = (i - 1) % sampleImages.length;
        const carImages = [
          sampleImages[imgIdx],
          sampleImages[(imgIdx + 1) % sampleImages.length],
          sampleImages[(imgIdx + 2) % sampleImages.length]
        ];

        db.prepare(`
                INSERT OR REPLACE INTO cars (
                    id, lotNumber, vin, make, model, year, odometer, engineSize, horsepower,
                    transmission, drivetrain, fuelType, exteriorColor, interiorColor,
                    primaryDamage, secondaryDamage, titleType, location, currentBid,
                    reservePrice, buyItNow, status, images, sellerId, auctionEndDate,
                    keys, runsDrives, notes, mileageUnit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
          id, (70000000 + i).toString(), `SVIN${i}${Date.now().toString(36)}`,
          make, model, 2022 + (i % 3), 1500 * i, "4.0L V8", "500 hp",
          "Automatic", "AWD", "Gasoline", "Obsidian Black", "Nappa Leather",
          "None", "None", "Clean Title", "Dubai, UAE", i * 2000,
          i * 5000 + 10000, i * 6000 + 20000, status, JSON.stringify(carImages),
          "seller-1", new Date(Date.now() + 172800000).toISOString(), // 2 days
          "Yes", "Yes", "سيارة ممتازة بحالة الوكالة - تجربة محاكاة", "km"
        );
      }

      // Scenarios
      const amount1 = 45000;
      db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ? WHERE id = ?").run("buyer-1", amount1, "sim-car-1");
      createWinInvoices("buyer-1", "sim-car-1", amount1);

      const amount16 = 55000;
      db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ? WHERE id = ?").run("buyer-2", amount16, "sim-car-16");
      createWinInvoices("buyer-2", "sim-car-16", amount16);
      sendInternalMessage("admin-1", "buyer-2", "🏆 تم قبول عرضك!", "تمت الموافقة على عرضك لسيارة sim-car-16 بمبلغ $" + amount16);

      db.prepare("UPDATE cars SET status = 'offer_market', currentBid = 35000, reservePrice = 40000, offerMarketEndTime = ? WHERE id = ?")
        .run(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), "sim-car-2");
      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp) VALUES (?, ?, ?, ?, ?)").run(`bid-${Date.now()}-1`, "sim-car-2", "buyer-3", 35000, new Date().toISOString());
      sendNotification("buyer-3", "😔 المزاد لم يصل للسعر المطلوب", "سيارة sim-car-2 انتقلت لسوق العروض، يمكنك تقديم عرض جديد هناك!", "warning");

      db.prepare("UPDATE cars SET status = 'offer_market', currentBid = 62000 WHERE id = ?").run("sim-car-17");
      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp) VALUES (?, ?, ?, ?, ?)").run(`bid-${Date.now()}-2`, "sim-car-17", "buyer-4", 62000, new Date().toISOString());
      sendInternalMessage("buyer-4", "admin-1", "طلب شراء | سيارة sim-car-17", "لقد قدمت عرضاً بقيمة $62,000 وأنتظر موافقتكم.");

      sendNotification("buyer-5", "💡 فرص جديدة بانتظاركم", "لم يحالفك الحظ اليوم؟ شاهد هذه السيارات المميزة التي تناسب ميزانيتك!");

      res.json({ success: true, message: "Simulation seeded successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // (tickAuctions interval already started above — duplicate removed)

  // Heartbeat to monitor event loop health
  setInterval(() => {
    console.log(`[HEARTBEAT] ${new Date().toISOString()} - Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
  }, 10000);


  const tickUltimoAndOffers = () => {
    const now = new Date().toISOString();

    // 1. Move expired Ultimo cars to Offer Market (Fallback for existing data)
    const expiredUltimo: any[] = db.prepare("SELECT id FROM cars WHERE status = 'ultimo' AND (ultimoEndTime < ? OR ultimoEndTime IS NULL)").all(now);
    expiredUltimo.forEach((car: any) => {
      const offerMarketEndTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days
      db.prepare("UPDATE cars SET status = 'offer_market', offerMarketEndTime = ? WHERE id = ?").run(offerMarketEndTime, car.id);
      io.emit("car_updated", { id: car.id, status: 'offer_market', offerMarketEndTime });
    });

    // 2. Mark expired Offer Market cars as unsold and notify seller
    const expiredOffers: any[] = db.prepare("SELECT id, sellerId, make, model, year FROM cars WHERE status = 'offer_market' AND offerMarketEndTime < ?").all(now);
    expiredOffers.forEach((car: any) => {
      db.prepare("UPDATE cars SET status = 'unsold' WHERE id = ?").run(car.id);
      io.emit("car_updated", { id: car.id, status: 'unsold' });
      if (car.sellerId) {
        sendNotification(car.sellerId, '⏰ انتهى سوق العروض', 'انتهى سوق العروض لسيارتك بدون بيع', 'warning', 'general_notification', {}, `/seller?view=inventory`);
      }
      console.log(`Car ${car.id} Offer Market period expired → unsold.`);
    });
  };

  setInterval(tickUltimoAndOffers, 5000);

  // Placeholder for old helper location (cleaned)

  // ══════════════════════════════════════════════════════════════
  //  PHASE 10 — BUYER WALLET ROUTES
  // ══════════════════════════════════════════════════════════════

  // GET /api/wallet/:userId — full wallet summary
  app.get("/api/wallet/:userId", requireAuth, (req, res) => {
    try {
      const { userId } = req.params;
      const requestingUser = (req as any).user;
      if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
        return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
      }
      let wallet: any = db.prepare("SELECT * FROM buyer_wallets WHERE userId = ?").get(userId) as any;
      if (!wallet) {
        // Auto-create empty wallet
        db.prepare(`INSERT OR IGNORE INTO buyer_wallets (userId, balance, reservedAmount, totalDeposited, totalSpent, updatedAt)
          VALUES (?,0,0,0,0,?)`).run(userId, new Date().toISOString());
        wallet = db.prepare("SELECT * FROM buyer_wallets WHERE userId = ?").get(userId);
      }
      const unpaidInvoices: any[] = db.prepare("SELECT * FROM invoices WHERE userId = ? AND status IN ('unpaid','overdue') ORDER BY timestamp DESC").all(userId);
      const pendingRequests: any[] = db.prepare("SELECT * FROM payment_requests WHERE userId = ? AND status = 'pending'").all(userId);
      res.json({ ...wallet, unpaidInvoices, pendingRequests });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wallet/:userId/transactions — transaction history
  app.get("/api/wallet/:userId/transactions", requireAuth, (req, res) => {
    try {
      const { userId } = req.params;
      const requestingUser = (req as any).user;
      if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
        return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
      }
      const txs: any[] = db.prepare("SELECT * FROM wallet_transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT 100").all(userId);
      res.json(txs);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/topup — user requests a top-up (pending admin approval)
  app.post("/api/wallet/topup", requireAuth, (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { amount, method, referenceNo } = req.body;
      if (!userId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const id = `pr-topup-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, status, requestedAt)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, 'topup', amount, method || 'bank_transfer', referenceNo || null, 'pending', new Date().toISOString());
      sendNotification('admin-1', '💰 طلب شحن محفظة جديد', `المستخدم ${userId} يطلب شحن محفظته بمبلغ $${Number(amount).toLocaleString()}`, 'info');
      // Notify the user that their top-up request was submitted
      sendNotification(userId, '📩 تم استلام طلب شحن المحفظة', `تم إرسال طلب شحن محفظتك بمبلغ $${Number(amount).toLocaleString()} للمراجعة. سيتم إعلامك فور الموافقة.`, 'info', 'general_notification', {}, '/dashboard/user?view=wallet');
      res.json({ success: true, requestId: id, message: "تم إرسال طلب الشحن — سيُراجَع خلال 24 ساعة" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/pay-invoice — pay an invoice from wallet balance
  app.post("/api/wallet/pay-invoice", requireAuth, (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { invoiceId } = req.body;
      const invoice: any = db.prepare("SELECT * FROM invoices WHERE id = ? AND userId = ?").get(invoiceId, userId) as any;
      if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة" });
      if (invoice.status === 'paid') return res.status(400).json({ error: "الفاتورة مدفوعة بالفعل" });

      const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
      if (!wallet || wallet.balance < invoice.amount) {
        return res.status(400).json({ error: `رصيد المحفظة غير كافٍ. الرصيد الحالي: $${(wallet?.balance || 0).toLocaleString()} — المطلوب: $${invoice.amount.toLocaleString()}` });
      }

      const newBal = walletDebit(userId, invoice.amount, `دفع فاتورة: ${invoice.type}`, invoiceId);
      db.prepare("UPDATE invoices SET status='paid', paidAt=?, paidVia='wallet' WHERE id=?").run(new Date().toISOString(), invoiceId);

      // If purchase invoice paid → activate transport invoice
      if (invoice.type === 'purchase') {
        db.prepare("UPDATE invoices SET status='unpaid' WHERE userId=? AND carId=? AND type='transport'").run(userId, invoice.carId);
        db.prepare("UPDATE shipments SET status='paid' WHERE carId=? AND userId=?").run(invoice.carId, userId);
        sendNotification(userId, '✅ تم الدفع بنجاح', `تم دفع فاتورة الشراء. فاتورة النقل الداخلي أصبحت متاحة الآن.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
      } else if (invoice.type === 'transport') {
        db.prepare("UPDATE invoices SET status='unpaid' WHERE userId=? AND carId=? AND type='shipping'").run(userId, invoice.carId);
        db.prepare("UPDATE shipments SET status='in_transit' WHERE carId=? AND userId=?").run(invoice.carId, userId);
        sendNotification(userId, '🚛 النقل الداخلي مؤكد', `تم دفع فاتورة النقل — السيارة في طريقها للميناء.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
      } else if (invoice.type === 'shipping') {
        db.prepare("UPDATE shipments SET status='at_port' WHERE carId=? AND userId=?").run(invoice.carId, userId);
        sendNotification(userId, '⚓ الشحن البحري مؤكد', `تم دفع فاتورة الشحن — السيارة قيد الشحن البحري.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
      }

      const invoiceTypeLabels: Record<string, string> = { purchase: 'شراء', transport: 'نقل', shipping: 'شحن' };
      sendInternalMessage('admin-1', userId, `✅ تم دفع فاتورة ${invoiceTypeLabels[invoice.type] || invoice.type}`,
        `تم خصم مبلغ $${invoice.amount.toLocaleString()} من محفظتك. الرصيد المتبقي: $${newBal.toLocaleString()}`);
      res.json({ success: true, newBalance: newBal });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/admin/payment-requests — admin: list all payment requests
  app.get("/api/admin/payment-requests", requireAdmin, (_req, res) => {
    try {
      const requests: any[] = db.prepare(`
        SELECT pr.*, u.firstName, u.lastName, u.email
        FROM payment_requests pr
        JOIN users u ON pr.userId = u.id
        ORDER BY pr.requestedAt DESC
      `).all();
      const pending = (requests as any[]).filter((r: any) => r.status === 'pending').length;
      res.json({ requests, pendingCount: pending });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/admin/payment-requests/:id/approve — admin approves top-up / withdrawal
  function completeInvoicePayment(invoiceId: string, timestamp: string, paidVia: string) {
    const invoice: any = db.prepare("SELECT i.*, c.sellerId, c.make, c.model, c.year FROM invoices i LEFT JOIN cars c ON i.carId = c.id WHERE i.id = ?").get(invoiceId) as any;
    if (!invoice) return;

    const pickupCode = `AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    db.prepare("UPDATE invoices SET status = 'paid', pickupAuthCode = ?, paidAt = ?, paidVia = ? WHERE id = ?").run(pickupCode, timestamp, paidVia, invoiceId);

    // If purchase invoice paid, activate transport invoice AND settle with seller
    if (invoice.type === 'purchase') {
      db.prepare("UPDATE invoices SET status = 'unpaid' WHERE carId = ? AND userId = ? AND type = 'transport' AND status = 'pending'")
        .run(invoice.carId, invoice.userId);
      db.prepare("UPDATE shipments SET status = 'paid', updatedAt = ? WHERE carId = ? AND userId = ?")
        .run(timestamp, invoice.carId, invoice.userId);

      if (invoice.sellerId) {
        const seller: any = db.prepare("SELECT commission FROM users WHERE id = ?").get(invoice.sellerId) as any;
        settleSaleToSellerWallet(invoice.sellerId, invoice.carId, invoice.amount, seller?.commission || 5, `بيع سيارة: ${invoice.year} ${invoice.make} ${invoice.model}`);
        sendNotification(invoice.sellerId, '💰 تم استلام دفعة سيارة', `المشتري قام بدفع ثمن سيارتك ${invoice.make}. الرصيد أضيف لمحفظتك.`, 'success');
      }

      sendInternalMessage('admin-1', invoice.userId,
        '💳 تم تأكيد دفع فاتورة الشراء',
        `تم تأكيد دفع فاتورة الشراء بنجاح!\n\nكود الاستلام: ${pickupCode}\n\n📋 الخطوة التالية: ستجد فاتورة النقل الداخلي جاهزة للدفع في قسم الفواتير.\n\nفريق أوتو برو 🚗`
      );
    } else if (invoice.type === 'transport') {
      db.prepare("UPDATE shipments SET status = 'in_transit', updatedAt = ? WHERE carId = ? AND userId = ?")
        .run(timestamp, invoice.carId, invoice.userId);

      sendInternalMessage('admin-1', invoice.userId,
        '🚛 تم تأكيد دفع فاتورة النقل',
        `تم تأكيد دفع فاتورة النقل بنجاح! سيارتك الآن قيد النقل إلى المستودع.\n\nفريق أوتو برو 🚗`
      );
    } else if (invoice.type === 'shipping') {
      db.prepare("UPDATE shipments SET status = 'in_shipping', updatedAt = ? WHERE carId = ? AND userId = ?")
        .run(timestamp, invoice.carId, invoice.userId);
      
      sendInternalMessage('admin-1', invoice.userId,
        '🚢 تم تأكيد دفع فاتورة الشحن',
        `تم تأكيد دفع فاتورة الشحن الدولي بنجاح! سيارتك الآن جاري شحنها.\n\nفريق أوتو برو 🚗`
      );
    }
  }

  app.post("/api/admin/payment-requests/:id/approve", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id) as any;
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });
      if (pr.status !== 'pending') return res.status(400).json({ error: "الطلب تمت معالجته مسبقاً" });

      const timestamp = new Date().toISOString();

      db.transaction(() => {
        if (pr.type === 'topup') {
          walletCredit(pr.userId, pr.amount, `شحن محفظة — مراجعة Admin`, id);
          sendNotification(pr.userId, '✅ تم شحن محفظتك', `تمت الموافقة على طلبك ✔ — تم إضافة $${Number(pr.amount).toLocaleString()} لمحفظتك. يمكنك الآن المزايدة!`, 'success', 'general_notification', {}, `/dashboard/wallet`);
        } else if (pr.type === 'withdrawal') {
          walletDebit(pr.userId, pr.amount, `سحب رصيد — مراجعة Admin`, id);
          sendNotification(pr.userId, '💸 تمت الموافقة على السحب', `تمت الموافقة على سحب $${Number(pr.amount).toLocaleString()} — سيُحوَّل خلال 2-3 أيام عمل.`, 'success', 'general_notification', {}, `/dashboard/wallet`);
        } else if (pr.type === 'invoice_payment') {
          completeInvoicePayment(pr.invoiceId, timestamp, pr.method);
          sendNotification(pr.userId, '✅ تم تأكيد الدفع', `تمت الموافقة على تأكيد دفع الفاتورة #${pr.invoiceId} بنجاح.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
        }

        db.prepare("UPDATE payment_requests SET status='approved', adminNote=?, processedAt=? WHERE id=?")
          .run(adminNote || null, timestamp, id);
      })();

      // Send receipt internal message after transaction commits
      const walletAfter: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(pr.userId);
      const newBalance = walletAfter ? Number(walletAfter.balance).toLocaleString() : '—';
      if (pr.type === 'topup') {
        sendInternalMessage('admin-1', pr.userId,
          '✅ إيصال شحن محفظة — تم قبول طلبك',
          `إيصال شحن محفظة\n\nالمبلغ: $${Number(pr.amount).toLocaleString()}\nالطريقة: ${pr.method || 'تحويل بنكي'}\nالمرجع: ${pr.referenceNo || id}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\nرصيد المحفظة الجديد: $${newBalance}\n\nشكراً لثقتك في أوتو برو! 🧡`,
          'accounting'
        );
      } else if (pr.type === 'invoice_payment') {
        sendInternalMessage('admin-1', pr.userId,
          '✅ إيصال دفع فاتورة — تم تأكيد الدفع',
          `إيصال دفع فاتورة\n\nرقم الفاتورة: ${pr.invoiceId}\nالمبلغ: $${Number(pr.amount).toLocaleString()}\nالطريقة: ${pr.method || 'تحويل بنكي'}\nالمرجع: ${pr.referenceNo || id}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\n\nشكراً لثقتك في أوتو برو! 🧡`,
          'accounting'
        );
      }

      res.json({ success: true });
    } catch (err: any) { 
      console.error(err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // POST /api/admin/payment-requests/:id/reject
  app.post("/api/admin/payment-requests/:id/reject", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id) as any;
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });
      if (pr.status !== 'pending') return res.status(400).json({ error: "الطلب تمت معالجته مسبقاً" });

      const timestamp = new Date().toISOString();

      db.transaction(() => {
        db.prepare("UPDATE payment_requests SET status='rejected', adminNote=?, processedAt=? WHERE id=?")
          .run(adminNote || 'تم الرفض', timestamp, id);

        if (pr.type === 'invoice_payment') {
          db.prepare("UPDATE invoices SET status='unpaid', paidVia=NULL WHERE id=?").run(pr.invoiceId);
          sendNotification(pr.userId, '❌ تم رفض تأكيد الدفع', `تم رفض إثبات الدفع للفاتورة #${pr.invoiceId}. السبب: ${adminNote || 'مراجعة البيانات'}. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.`, 'error');
        } else {
          sendNotification(pr.userId, '❌ تم رفض طلبك', `للأسف، تم رفض طلب ${pr.type === 'topup' ? 'شحن المحفظة' : 'السحب'} بمبلغ $${Number(pr.amount).toLocaleString()}. السبب: ${adminNote || 'مراجعة البيانات'}.`, 'error');
        }
      })();

      res.json({ success: true });
    } catch (err: any) { 
      console.error(err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // GET /api/admin/wallet-stats — admin: financial overview
  app.get("/api/admin/wallet-stats", requireAdmin, (_req, res) => {
    try {
      const totalDeposited = (db.prepare("SELECT SUM(totalDeposited) as v FROM buyer_wallets").get() as any)?.v || 0;
      const totalBalance = (db.prepare("SELECT SUM(balance) as v FROM buyer_wallets").get() as any)?.v || 0;
      const totalSpent = (db.prepare("SELECT SUM(totalSpent) as v FROM buyer_wallets").get() as any)?.v || 0;
      const pendingTopups = (db.prepare("SELECT COUNT(*) as c FROM payment_requests WHERE status='pending' AND type='topup'").get() as any)?.c || 0;
      const pendingInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='unpaid'").get() as any)?.v || 0;
      res.json({ totalDeposited, totalBalance, totalSpent, pendingTopups, pendingInvoices });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/withdrawal — user requests withdrawal
  app.post("/api/wallet/withdrawal", requireAuth, (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { amount, iban, bankName } = req.body;
      if (!userId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId=?").get(userId) as any;
      if (!wallet || wallet.balance < amount) return res.status(400).json({ error: "رصيد غير كافٍ" });
      const id = `pr-wd-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, status, requestedAt)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, 'withdrawal', amount, 'bank_transfer', (iban || '') + '|' + (bankName || ''), 'pending', new Date().toISOString());
      sendNotification('admin-1', '💸 طلب سحب رصيد', `المستخدم ${userId} يطلب سحب $${Number(amount).toLocaleString()} — IBAN: ${iban || 'غير محدد'}`, 'warning');
      res.json({ success: true, message: "تم إرسال طلب السحب — سيُحوَّل خلال 2-3 أيام عمل بعد المراجعة" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ======= STRIPE PAYMENT ROUTES =======

  // GET /api/payments/stripe-status — check if Stripe card payments are enabled
  app.get("/api/payments/stripe-status", async (_req, res) => {
    try {
      if (!stripeClient) return res.json({ available: false, reason: 'no_key' });
      const account = await stripeClient.accounts.retrieve();
      const available = account.charges_enabled === true;
      res.json({ available, chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted });
    } catch (err: any) {
      res.json({ available: false, reason: err.message });
    }
  });

  // POST /api/payments/create-intent — create Stripe PaymentIntent for deposit
  app.post("/api/payments/create-intent", requireAuth, async (req, res) => {
    try {
      const { amount, currency, type } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ error: "مبلغ غير صالح" });
      if (currency === 'USD' && amount < 500) return res.status(400).json({ error: "الحد الأدنى للعربون خارج ليبيا هو $500" });
      if (currency === 'LYD' && amount < 1000) return res.status(400).json({ error: "الحد الأدنى للعربون داخل ليبيا هو 1,000 دينار ليبي" });

      if (!stripeClient) {
        return res.json({ clientSecret: 'demo_secret_' + Date.now(), demo: true });
      }
      const amountInCents = currency === 'USD'
        ? Math.round(amount * 100)
        : Math.round((amount / 7.0) * 100);
      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        metadata: { originalAmount: String(amount), originalCurrency: currency, type: type || 'deposit' },
        description: `AutoPro Libya — عربون — ${amount} ${currency}`,
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err: any) {
      console.error('[STRIPE CREATE INTENT]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/confirm-deposit — credit user wallet after Stripe payment
  app.post("/api/payments/confirm-deposit", async (req, res) => {
    try {
      const { paymentIntentId, amount, currency, demo } = req.body;
      if (!paymentIntentId || !amount) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const authHeader = req.headers['authorization'];
      const token = authHeader?.split(' ')[1];
      if (!token) return res.status(401).json({ error: "غير مخوَّل" });
      let userId: string;
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch {
        return res.status(401).json({ error: "جلسة منتهية" });
      }
      // SECURITY: Block demo bypass in production
      if (demo && process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Demo not allowed in production' });
      }
      if (!demo && stripeClient) {
        const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'succeeded') return res.status(400).json({ error: "لم يكتمل الدفع بعد" });
      }
      const user: any = db.prepare("SELECT deposit, buyingPower FROM users WHERE id = ?").get(userId);
      if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
      const newDeposit = (user.deposit || 0) + Number(amount);
      const newBuyingPower = newDeposit * 10;
      db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newBuyingPower, userId);
      // Update buyer_wallets
      try {
        db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
          .run(Number(amount), Number(amount), new Date().toISOString(), userId);
      } catch (_) {}
      try {
        const txId = `tx-stripe-${Date.now()}`;
        db.prepare(`INSERT INTO transactions (id, userId, amount, type, status, createdAt) VALUES (?,?,?,?,?,?)`)
          .run(txId, userId, amount, 'deposit', 'completed', new Date().toISOString());
      } catch (_) {}
      setImmediate(() => {
        sendNotification(userId, '✅ تم إيداع العربون بنجاح',
          `تم إضافة ${amount} ${currency === 'LYD' ? 'د.ل' : '$'} إلى محفظتك. قوتك الشرائية: ${newBuyingPower.toLocaleString()} ${currency === 'LYD' ? 'د.ل' : '$'}.`,
          'success', '/dashboard/user');
        const userRow: any = db.prepare("SELECT email, firstName FROM users WHERE id = ?").get(userId);
        if (userRow?.email) {
          sendEmail({
            to: userRow.email,
            subject: '✅ تأكيد إيداع العربون — AutoPro Libya',
            html: `<div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#e2e8f0;border-radius:16px;overflow:hidden;">
              <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:32px;text-align:center;">
                <h1 style="color:white;margin:0;font-size:24px;">✅ تم إيداع العربون بنجاح</h1>
              </div>
              <div style="padding:32px;">
                <p>مرحباً <strong style="color:#fff">${userRow.firstName}</strong>،</p>
                <p>تم إيداع عربونك بنجاح وتفعيل حسابك في مزادات AutoPro Libya.</p>
                <div style="background:#0f172a;border-radius:12px;padding:20px;margin:20px 0;">
                  <p><span style="color:#94a3b8;">المبلغ المودَع: </span><strong style="color:#f97316;font-size:20px;">${amount} ${currency === 'LYD' ? 'دينار ليبي' : 'دولار'}</strong></p>
                  <p><span style="color:#94a3b8;">القوة الشرائية: </span><strong style="color:#22c55e;">${newBuyingPower.toLocaleString()} ${currency === 'LYD' ? 'د.ل' : '$'}</strong></p>
                  <p><span style="color:#94a3b8;">رقم المعاملة: </span><code style="color:#94a3b8;font-size:12px;">${paymentIntentId}</code></p>
                </div>
                <p>يمكنك الآن المزايدة على أي سيارة في المنصة!</p>
                <div style="text-align:center;margin-top:24px;">
                  <a href="${SITE_URL}/marketplace" style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;">🏎️ تصفح المزادات</a>
                </div>
              </div>
            </div>`,
          });
        }
      });
      res.json({ success: true, newDeposit, newBuyingPower });
    } catch (err: any) {
      console.error('[STRIPE CONFIRM DEPOSIT]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ======= INSPECTION ROUTES =======
  app.get("/api/inspections/:userId", requireAuth, (req, res) => {
    try {
      const { userId } = req.params;
      const inspections = db.prepare("SELECT * FROM inspections WHERE userId = ? ORDER BY requestedAt DESC").all(userId);
      res.json(inspections);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/inspections", requireAuth, (req, res) => {
    try {
      const { userId, carMake, carModel, carYear, vin, notes } = req.body;
      if (!userId || !carMake || !carModel) return res.status(400).json({ error: "Missing required fields" });
      const id = `insp-${Date.now()}`;
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO inspections (id, userId, carMake, carModel, carYear, vin, notes, status, requestedAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(id, userId, carMake, carModel, carYear, vin, notes, now, now);
      
      sendNotification('admin-1', '🛡️ طلب فحص جديد', `طلب فحص لسيارة ${carMake} ${carModel} (${carYear}) من المستخدم ${userId}`, 'info');
      res.json({ success: true, inspectionId: id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

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

  // ══════════════════════════════════════════════════════════════

  // ======= CONFIG ROUTES =======

  app.get("/api/config", (req, res) => {
    const branchId = req.query.branch as string || 'main';
    const config: any = db.prepare("SELECT * FROM branch_configs WHERE id = ?").get(branchId) ||
      db.prepare("SELECT * FROM branch_configs WHERE id = 'main'").get();

    // Include global system settings
    const settings: any[] = db.prepare("SELECT key, value FROM system_settings").all() as any[];
    const sysConfig: Record<string, any> = {};
    settings.forEach(s => sysConfig[s.key] = s.value);

    res.json(Object.assign({}, config || {}, sysConfig));
  });

  app.get("/api/admin/branches", requireAdmin, (req, res) => {
    try {
      const branches: any[] = db.prepare("SELECT * FROM branch_configs").all();
      const branchesWithStats = branches.map((branch: any) => {
        const userCount: any = db.prepare("SELECT COUNT(*) as count FROM users WHERE country = ? OR country = ?").get(branch.id, branch.name) as any;
        const carCount: any = db.prepare("SELECT COUNT(*) as count FROM cars WHERE location LIKE ?").get(`%${branch.name}%`) as any;
        return {
          ...branch,
          userCount: userCount.count,
          carCount: carCount.count
        };
      });
      res.json(branchesWithStats);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  app.post("/api/admin/config", requireAdmin, (req, res) => {
    const { id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor, contactEmail, contactPhone } = req.body;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO branch_configs (id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor, contactEmail, contactPhone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, englishName, logoText, logoSubtext, currency, domain, primaryColor, contactEmail, contactPhone);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Failed to update config" });
    }
  });

  // ======= OFFICES ROUTES =======
  app.get("/api/admin/offices", requireAdmin, (req, res) => {
    try {
      const offices: any[] = db.prepare(`
        SELECT o.*, b.name as branchName, 
               (SELECT COUNT(*) FROM users WHERE office = o.name) AS userCount
        FROM offices o
        LEFT JOIN branch_configs b ON o.branchId = b.id
      `).all();
      res.json(offices);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch offices" });
    }
  });

  app.post("/api/admin/offices", requireAdmin, (req, res) => {
    const { id, name, branchId, manager, status } = req.body;
    const officeId = id || `off-${Date.now()}`;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO offices (id, name, branchId, manager, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(officeId, name, branchId || 'main', manager || '', status || 'active');
      res.json({ success: true, id: officeId });
    } catch (e) {
      res.status(400).json({ error: "Failed to save office" });
    }
  });

  // ======= FILE UPLOAD SETUP (multer) =======
  const uploadsDir = path.join(__dirname, 'uploads');
  const imagesDir = path.join(uploadsDir, 'images');
  const docsDir = path.join(uploadsDir, 'documents');
  const mediaDir = path.join(uploadsDir, 'media');
  const kycDir = path.join(uploadsDir, 'kyc');

  // Create ALL upload directories at startup
  [uploadsDir, imagesDir, docsDir, mediaDir, kycDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    console.log(`[BOOT] Upload dir: ${dir} ${fs.existsSync(dir) ? '✓' : '✗'}`);
  });

  // Serve uploaded files as static assets
  app.use('/uploads', express.static(uploadsDir));

  // Multer config for car images (max 10MB per image)
  const imageStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, imagesDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `car_${unique}${ext}`);
    }
  });
  const uploadImages = multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files allowed'));
    }
  });

  // Multer config for KYC documents (PDF/images, max 5MB)
  const docStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `doc_${unique}${ext}`);
    }
  });
  const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only images and PDFs allowed'));
    }
  });

  // POST /api/upload/images - Upload up to 20 car images
  app.post('/api/upload/images', requireAuth, (req: any, res: any, next: any) => {
    (uploadImages.array('images', 20) as any)(req, res, (err: any) => {
      if (err) {
        console.error('[UPLOAD ERROR]', err.message, err.code);
        return res.status(400).json({ error: `فشل رفع الصور: ${err.message}` });
      }
      try {
        if (!req.files || (req.files as any).length === 0) {
          return res.status(400).json({ error: 'لم يتم رفع أي صور' });
        }
        const urls = (req.files as any[]).map((f: any) => `/uploads/images/${f.filename}`);
        console.log(`[UPLOAD] ${urls.length} images uploaded:`, urls);
        res.json({ success: true, urls, count: urls.length });
      } catch (e: any) {
        console.error('[UPLOAD HANDLER ERROR]', e.message);
        res.status(500).json({ error: e.message || 'فشل رفع الصور' });
      }
    });
  });

  // ======= AUTH ROUTES (moved to routes/auth.ts) =======
  // The following auth routes are now in routes/auth.ts:
  // POST /api/auth/register, POST /api/auth/login, POST /api/auth/google
  // GET /api/auth/verify-email, POST /api/auth/forgot-password, POST /api/auth/reset-password
  // POST /api/user/update-profile, POST /api/user/change-password

  app.post("/api/auth/register", async (req, res) => {
    const {
      firstName, lastName, email, phone, password, role,
      deposit, commission, manager, office,
      companyName, country, address1, address2,
      nationalId, commercialRegister, showroomLicense, iban
    } = req.body;
    const id = `user-${Date.now()}`;
    const joinDate = new Date().toISOString();
    const buyingPower = 0; // Starts at 0 until deposit is paid

    try {
      // 🔐 SECURITY: Require password with minimum 6 characters
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "كلمة المرور مطلوبة (6 أحرف على الأقل)" });
      }
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

      // Send welcome notification using template
      sendNotification(id, '🎉 مرحباً بك في أوتو برو!', 'شكراً لتسجيلك في المنصة. حسابك قيد المراجعة حالياً.', 'success', 'registration_success');

      // Send welcome message to the new user from system (admin-1)
      sendInternalMessage('admin-1', id,
        '🎉 مرحباً بك في AutoPro Libya!',
        `أهلاً ${firstName} ${lastName}!\n\nشكراً لتسجيلك في منصة AutoPro Libya للمزادات. نحن سعداء بانضمامك!\n\nحسابك الآن قيد المراجعة من فريق الإدارة. سيتم إشعارك فور الموافقة.\n\n📋 الخطوات القادمة:\n1. ✅ انتظر موافقة المدير على حسابك\n2. 💰 ادفع العربون لتفعيل قوتك الشرائية:\n   👉 ${SITE_URL}/deposit\n   • خارج ليبيا: الحد الأدنى $500 دولار\n   • داخل ليبيا: الحد الأدنى 1,000 دينار ليبي\n3. 🏎️ ابدأ المزايدة على السيارات!\n\n💡 معلومة مهمة:\nالقوة الشرائية = العربون × 10\nمثال: إيداع $500 = قوة شرائية $5,000\n\nفريق AutoPro Libya 🚗`
      );
      // Also send deposit link as a direct notification
      sendNotification(id, '💰 خطوة مهمة: ادفع العربون',
        `لتفعيل قوتك الشرائية والمزايدة، ادفع العربون (الحد الأدنى خارج ليبيا $500 أو 1,000 د.ل داخل ليبيا).`,
        'info', '/deposit');

      // Generate Verification Token
      const token = crypto.randomBytes(20).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      db.prepare(`INSERT OR REPLACE INTO verification_codes(email, code, expiresAt) VALUES(?, ?, ?)`).run(email, token, expiresAt);

      const verifyLink = `${SITE_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

      // Return user data + JWT token IMMEDIATELY — don't wait for email
      const newUser: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      const authToken = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
      const { password: _p, ...userWithoutPassword } = newUser;
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
                    <li>خارج ليبيا: الحد الأدنى <strong>$500 دولار</strong></li>
                    <li>داخل ليبيا: الحد الأدنى <strong>1,000 دينار ليبي</strong></li>
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
        const defaultWelcomeContent = `أهلاً \${firstName}! 👋\n\nمرحباً بك في منصة أوتو برو — أكبر منصة مزادات سيارات في ليبيا.\n\n═══════════════════════════\n📋 كيف تبدأ المزايدة؟\n═══════════════════════════\n\nالخطوة 1️⃣ — ادفع العربون\n• الحد الأدنى: $500 أو 1,000 دينار ليبي\n• القوة الشرائية = 10 أضعاف العربون\n• مثال: إيداع $1,000 = قوة شرائية $10,000\n• رابط الدفع: \${SITE_URL}/deposit\n\nالخطوة 2️⃣ — وثّق هويتك (KYC)\n• ارفع صورة الهوية أو جواز السفر\n• التوثيق يرفع حدود المزايدة\n• رابط التوثيق: \${SITE_URL}/dashboard/user?view=kyc\n\nالخطوة 3️⃣ — تصفّح السيارات\n• سوق السيارات: \${SITE_URL}/marketplace\n• المزادات المباشرة: \${SITE_URL}/live-auction\n• سوق العروض: \${SITE_URL}/marketplace?tab=offers\n\nالخطوة 4️⃣ — زايد واربح!\n• انقر "زايد" في المزاد المباشر\n• أو قدّم عرض في سوق العروض\n• النظام يمدد الوقت 15 ثانية عند كل مزايدة\n\n═══════════════════════════\n💰 طرق الدفع المتاحة\n═══════════════════════════\n• صداد (المدار) — الأسرع\n• بطاقات بنكية محلية (تداول/نومو)\n• تحويل بنكي (أي مصرف ليبي)\n• Plutu — دفع إلكتروني آمن\n• الدفع النقدي — في مكاتبنا\n\n═══════════════════════════\n📍 مكاتبنا\n═══════════════════════════\n• طرابلس (المقر الرئيسي)\n• بنغازي\n• مصراتة\n• الولايات المتحدة (اللوجستيات)\n\n═══════════════════════════\n🏷️ لماذا أوتو برو؟\n═══════════════════════════\n• وفّر 30-50% مقارنة بالسوق المحلي\n• عمولة 3% فقط — الأقل في السوق\n• شحن مباشر من أمريكا وأوروبا\n• تتبع شحنتك في الوقت الحقيقي\n• ضمان استرداد العربون عند عدم الفوز\n\n═══════════════════════════\n\nابدأ الآن: \${SITE_URL}/deposit\n\nفريق أوتو برو 🧡`;
        const defaultWelcomeSubject = '🎉 مرحباً بك في أوتو برو — دليلك الكامل للبدء';
        const defaultDepositReminder = '💰 ادفع العربون الآن واحصل على قوة شرائية 10 أضعاف! الحد الأدنى $500 أو 1,000 د.ل';

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

      if (user) {
        // Link googleId if not already linked
        if (!user.googleId) {
          db.prepare("UPDATE users SET googleId = ?, profilePic = COALESCE(profilePic, ?) WHERE id = ?")
            .run(googleId, picture || null, user.id);
        }
        user = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate, googleId, profilePic, isEmailVerified FROM users WHERE id = ?").get(user.id);
      } else {
        // Register new user via Google
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

      // Generate JWT for authenticated session
      const authToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ ...user, token: authToken });
    } catch (err: any) {
      console.error('[GOOGLE AUTH ERROR]', err?.message);
      res.status(401).json({ error: 'فشل التحقق من حساب Google: ' + (err?.message || 'خطأ غير معروف') });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt: ${email}`);
    try {
      const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        console.log(`Login failed: user not found for ${email}`);
        return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      }

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
      // Return user data + token (exclude password from response)
      const { password: _pass, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, token });
    } catch (e) {
      console.error('Login error:', e);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  });

  // Car Routes
  app.get("/api/cars", (req, res) => {
    const cars: any[] = db.prepare("SELECT * FROM cars").all();
    res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
  });

  app.post("/api/cars", requireAuth, (req, res) => {
    const {
      make, model, year, vin, lotNumber, location,
      odometer, primaryDamage, titleType, engine, drive,
      transmission, status, auctionEndDate, images,
      buyItNow, startPrice, currentBid, reservePrice, sellerId, currency,
      acceptOffers, videoUrl, inspectionPdf,
      trim, mileageUnit, engineSize, horsepower, drivetrain, fuelType,
      exteriorColor, interiorColor, secondaryDamage, keys, runsDrives, notes
    } = req.body;

    // VIN LOCK - check for duplicates
    const existing: any = db.prepare("SELECT id FROM cars WHERE vin = ?").get(vin);
    if (existing) {
      return res.status(400).json({ error: `VIN ${vin} is already registered in the system.` });
    }

    // If user is a seller and no sellerId provided, auto-set from auth token
    // Use null (not '') for empty sellerId to satisfy FOREIGN KEY constraint
    const effectiveSellerId = sellerId || ((req as any).user?.role === 'seller' ? (req as any).user.id : null);

    const id = Date.now().toString();
    try {
      db.prepare(`
        INSERT INTO cars(
          id, lotNumber, vin, make, model, trim, year, odometer, engine, engineSize, horsepower,
          transmission, drive, drivetrain, fuelType, exteriorColor, interiorColor,
          primaryDamage, secondaryDamage, titleType, location, currentBid, reservePrice,
          buyItNow, currency, images, videoUrl, inspectionPdf, status,
          auctionEndDate, sellerId, keys, runsDrives, notes, mileageUnit, acceptOffers
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, lotNumber || '', vin, make, model, trim || '', year || 2024, odometer || 0, engine || '', engineSize || '', horsepower || '',
        transmission || '', drive || '', drivetrain || '', fuelType || '', exteriorColor || '', interiorColor || '',
        primaryDamage || '', secondaryDamage || '', titleType || '', location || '',
        currentBid || 0, reservePrice || 0, buyItNow || 0, currency || 'USD', JSON.stringify(images || []),
        videoUrl || '', inspectionPdf || '', 'pending_approval',
        auctionEndDate || '', effectiveSellerId, keys || 'yes', runsDrives || 'yes', notes || '', mileageUnit || 'mi', acceptOffers ? 1 : 0
      );
      res.json({ id, ...req.body });
    } catch (e: any) {
      console.error('[CAR CREATE ERROR]', e.message, e);
      res.status(400).json({ error: `فشل إضافة السيارة: ${e.message}` });
    }
  });

  app.delete("/api/cars/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM cars WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete car" });
    }
  });

  // ======= OFFER MARKET & ADMIN ENDPOINTS =======
  app.get("/api/admin/offer-market-cars", requireAdmin, (req, res) => {
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'offer_market'").all();
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch offer market cars" });
    }
  });

  app.post("/api/offers/:carId/accept", requireAuth, (req, res) => {
    const { carId } = req.params;
    const jwtUser = (req as any).user;
    const actionUserId = jwtUser.id;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "Car not found" });

      if (jwtUser.role !== 'admin' && car.sellerId !== jwtUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية للموافقة على هذا العرض" });
      }

      const lastBid: any = db.prepare("SELECT * FROM bids WHERE carId = ? AND type = 'offer' ORDER BY amount DESC LIMIT 1").get(carId);
      if (!lastBid) return res.status(400).json({ error: "لا توجد عروض لهذه السيارة" });

      const saleDate = new Date().toISOString();

      db.transaction(() => {
        db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ?, auctionEndDate = ?, acceptedBy = ?, sellerCounterPrice = NULL WHERE id = ?").run(lastBid.userId, lastBid.amount, saleDate, actionUserId, carId);
        createWinInvoices(lastBid.userId, carId, lastBid.amount);
      })();

      io.emit("car_updated", { id: carId, status: 'closed', winnerId: lastBid.userId, currentBid: lastBid.amount });
      res.json({ success: true, message: "تم قبول العرض وإصدار الفاتورة" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to accept offer" });
    }
  });

  app.post("/api/offers/:carId/reject", requireAuth, (req, res) => {
    const { carId } = req.params;
    const jwtUser = (req as any).user;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (jwtUser.role !== 'admin' && car.sellerId !== jwtUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية لرفض هذا العرض" });
      }

      db.prepare("UPDATE cars SET status = 'upcoming', offerMarketEndTime = NULL, sellerCounterPrice = NULL WHERE id = ?").run(carId);
      db.prepare("DELETE FROM bids WHERE carId = ? AND type = 'offer'").run(carId);
      
      const prevBid: any = db.prepare("SELECT amount, userId FROM bids WHERE carId = ? ORDER BY amount DESC LIMIT 1").get(carId);
      if(prevBid) {
         db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(prevBid.amount, prevBid.userId, carId);
      }

      io.emit("car_updated", { id: carId, status: 'upcoming', currentBid: prevBid?.amount || 0 });
      res.json({ success: true, message: "تم رفض العرض وإعادة السيارة للجدولة" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to reject offer" });
    }
  });

  app.post("/api/offers/:carId/counter", requireAuth, (req, res) => {
    const { carId } = req.params;
    const jwtUser = (req as any).user;
    const { counterAmount } = req.body || {};

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (jwtUser.role !== 'admin' && car.sellerId !== jwtUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتقديم عرض مضاد" });
      }

      if (!counterAmount || isNaN(counterAmount)) {
        return res.status(400).json({ error: "مبلغ العرض غير صحيح" });
      }

      const lastBid: any = db.prepare("SELECT * FROM bids WHERE carId = ? AND type = 'offer' ORDER BY amount DESC LIMIT 1").get(carId);
      
      db.prepare("UPDATE cars SET sellerCounterPrice = ? WHERE id = ?").run(counterAmount, carId);

      if (lastBid) {
        sendNotification(lastBid.userId, 'تم تقديم عرض مضاد 🔄', `تم تقديم عرض مضاد لسيارتك بقيمة $${Number(counterAmount).toLocaleString()}`, 'info');
        sendInternalMessage('admin-1', lastBid.userId, '🔄 التفاوض: الإدارة قدمت لك عرضاً مضاداً',
          `أهلاً، لقد قام البائع بتقديم عرض مضاد لسيارة ${car.make} ${car.model}.\nالسعر المضاد هو: $${Number(counterAmount).toLocaleString()}\nيرجى مراجعة صفحة السيارة للإستجابة.`
        );
      }

      io.emit("car_updated", { id: carId, sellerCounterPrice: counterAmount });
      res.json({ success: true, message: "تم تسجيل العرض المضاد وإرسال تنبيه للمشتري" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "فشل تقديم العرض المضاد" });
    }
  });

  app.post("/api/offers/:carId/respond", requireAuth, (req, res) => {
    const { carId } = req.params;
    const { userId, action } = req.body || {};

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (action === 'accept') {
        if (!car.sellerCounterPrice) return res.status(400).json({ error: "لا يوجد عرض مضاد" });
        db.transaction(() => {
          db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ?, sellerCounterPrice = NULL WHERE id = ?").run(userId, car.sellerCounterPrice, carId);
          createWinInvoices(userId, carId, car.sellerCounterPrice);
        })();
        io.emit("car_updated", { id: carId, status: 'closed', winnerId: userId, currentBid: car.sellerCounterPrice });
        res.json({ success: true, message: "تم قبول العرض المضاد وإتمام البيع" });
      } else if (action === 'reject') {
        db.prepare("UPDATE cars SET status = 'upcoming', offerMarketEndTime = NULL, sellerCounterPrice = NULL WHERE id = ?").run(carId);
        db.prepare("DELETE FROM bids WHERE carId = ? AND type = 'offer'").run(carId);
        
        const prevBid: any = db.prepare("SELECT amount, userId FROM bids WHERE carId = ? ORDER BY amount DESC LIMIT 1").get(carId);
        if (prevBid) {
           db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(prevBid.amount, prevBid.userId, carId);
        }

        io.emit("car_updated", { id: carId, status: 'upcoming', currentBid: prevBid?.amount || 0 });
        res.json({ success: true, message: "تم رفض العرض المضاد" });
      } else {
        res.status(400).json({ error: "إجراء غير معروف" });
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "فشل معالجة الرد" });
    }
  });

  // ====== MARKETING API ======
  app.get("/api/admin/mailing-list", requireAdmin, (req, res) => {
    try {
      const list = db.prepare("SELECT id, firstName, lastName, email FROM users WHERE role IN ('buyer', 'user', 'user_pending', 'seller')").all();
      res.json(list);
    } catch (e) { res.status(500).json({ error: "Failed to fetch mailing list" }); }
  });

  app.get("/api/admin/marketing-cars", requireAdmin, (req, res) => {
    try {
      const list = db.prepare("SELECT * FROM cars WHERE status IN ('live', 'active', 'upcoming', 'offer_market', 'ultimo') OR isBuyNow = 1").all();
      res.json(list.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) { res.status(500).json({ error: "Failed to fetch marketing cars" }); }
  });

  // ======= NOTIFICATION TEMPLATES API =======
  app.get("/api/admin/notification-templates", requireAdmin, (req, res) => {
    try {
      const templates = db.prepare("SELECT * FROM notification_templates ORDER BY updatedAt DESC").all();
      res.json(templates);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch notification templates" });
    }
  });

  app.put("/api/admin/notification-templates/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { subject, body_html, body_whatsapp } = req.body;
    try {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE notification_templates 
        SET subject = ?, body_html = ?, body_whatsapp = ?, updatedAt = ? 
        WHERE id = ?
      `).run(subject, body_html, body_whatsapp, now, id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // User Routes
  app.get("/api/users", requireAdmin, (req, res) => {
    try {
      const users: any[] = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users").all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ======= USER SETTINGS =======
  app.get("/api/user/settings/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== id && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بالوصول لإعدادات مستخدم آخر" });
    }
    try {
      let settings: any = db.prepare("SELECT * FROM user_settings WHERE userId = ?").get(id);
      if (!settings) {
        db.prepare("INSERT INTO user_settings (userId, emailNotifications, whatsappNotifications) VALUES (?, 1, 1)").run(id);
        settings = { userId: id, emailNotifications: 1, whatsappNotifications: 1, smsNotifications: 0 };
      }
      res.json(settings);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب إعدادات المستخدم" });
    }
  });

  app.post("/api/user/settings/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== id && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بتعديل إعدادات مستخدم آخر" });
    }
    const { emailNotifications, whatsappNotifications } = req.body;
    try {
      db.prepare(`
        INSERT INTO user_settings (userId, emailNotifications, whatsappNotifications)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
        emailNotifications = excluded.emailNotifications,
        whatsappNotifications = excluded.whatsappNotifications
      `).run(id, emailNotifications ? 1 : 0, whatsappNotifications ? 1 : 0);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث إعدادات الإشعارات" });
    }
  });

  // ======= ADMIN: USER APPROVAL ROUTES =======
  app.get("/api/admin/pending-users", requireAdmin, (req, res) => {
    try {
      const users: any[] = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE status = 'pending_approval'").all();
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب المستخدمين المعلقين" });
    }
  });

  app.post("/api/admin/approve-user/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending_approval'").run(id);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (user) {
        sendInternalMessage('admin-1', id,
          '✅ تم تفعيل حسابك بنجاح!',
          `تهانينا ${user.firstName}!\n\nتم الموافقة على حسابك وتفعيله بنجاح. يمكنك الآن:\n\n1. 💰 إيداع العربون لتفعيل القوة الشرائية\n2. 🔍 تصفح السيارات المتاحة\n3. 🔨 المشاركة في المزادات المباشرة\n\nتذكر: القوة الشرائية = العربون × 10\n\nنتمنى لك تجربة مزايدة ناجحة!\nفريق ماكينا أوتو برو 🚗`
        );
        io.to(`user_${id}`).emit("account_approved", { userId: id, status: 'active' });
      }
      res.json({ success: true, message: "تم تفعيل المستخدم بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل تفعيل المستخدم" });
    }
  });

  app.post("/api/admin/reject-user/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(id);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (user) {
        sendInternalMessage('admin-1', id,
          '❌ لم تتم الموافقة على حسابك',
          `عزيزي ${user.firstName}،\n\nنأسف لإبلاغك بأنه لم تتم الموافقة على طلب انضمامك.\n\nالسبب: ${reason || 'لم يتم تحديد سبب'}\n\nيمكنك التواصل مع فريق الدعم لمزيد من التوضيح.\n\nفريق ماكينا أوتو برو 🚗`
        );
        io.to(`user_${id}`).emit("account_rejected", { userId: id, reason });
      }
      res.json({ success: true, message: "تم رفض المستخدم" });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض المستخدم" });
    }
  });

  // ======= ADMIN: CAR REVIEW ROUTES =======
  app.get("/api/admin/pending-cars", requireAdmin, (req, res) => {
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'pending_approval'").all();
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب السيارات المعلقة" });
    }
  });

  app.post("/api/admin/approve-car/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE cars SET status = 'upcoming' WHERE id = ? AND status = 'pending_approval'").run(id);
      io.emit("car_approved", { carId: id });

      // Notify seller that their car was approved
      const approvedCar: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (approvedCar?.sellerId) {
        sendNotification(approvedCar.sellerId,
          'تم اعتماد سيارتك!',
          `تمت الموافقة على سيارتك ${approvedCar.make} ${approvedCar.model} (${approvedCar.year || ''}) وهي الآن في قائمة المزادات القادمة.`,
          'success', `/dashboard/seller?view=inventory`
        );
      }

      res.json({ success: true, message: "تم اعتماد السيارة بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل اعتماد السيارة" });
    }
  });

  app.post("/api/admin/reject-car/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE cars SET status = 'rejected' WHERE id = ?").run(id);
      res.json({ success: true, message: "تم رفض السيارة" });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض السيارة" });
    }
  });

  // ======= USER BIDS HISTORY =======
  app.get("/api/bids/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const bids: any[] = db.prepare(`
        SELECT b.*, c.make, c.model, c.year, c.status as carStatus, c.currentBid, c.winnerId, c.images, c.lotNumber
        FROM bids b
        JOIN cars c ON b.carId = c.id
        WHERE b.userId = ?
        ORDER BY b.timestamp DESC
      `).all(userId);
      res.json(bids.map((b: any) => ({ ...b, images: JSON.parse(b.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سجل المزايدات" });
    }
  });

  // ======= SHIPMENT ROUTES =======
  app.get("/api/shipments/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.images, c.lotNumber
        FROM shipments s
        JOIN cars c ON s.carId = c.id
        WHERE s.userId = ?
        ORDER BY s.createdAt DESC
      `).all(userId);
      res.json(shipments.map((s: any) => ({ ...s, images: JSON.parse(s.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب بيانات الشحن" });
    }
  });

  app.get("/api/admin/shipments", requireAdmin, (req, res) => {
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.images, c.lotNumber,
               u.firstName, u.lastName, u.email, u.phone
        FROM shipments s
        JOIN cars c ON s.carId = c.id
        JOIN users u ON s.userId = u.id
        GROUP BY s.carId
        ORDER BY s.createdAt DESC
      `).all();
      res.json(shipments.map((s: any) => ({ ...s, images: JSON.parse(s.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الشحنات" });
    }
  });

  app.get("/api/shipments/seller/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.images, c.lotNumber,
               u.firstName, u.lastName, u.email, u.phone
        FROM shipments s
        JOIN cars c ON s.carId = c.id
        JOIN users u ON s.userId = u.id
        WHERE c.sellerId = ?
        GROUP BY s.carId
        ORDER BY s.createdAt DESC
      `).all(id);
      res.json(shipments.map((s: any) => ({ ...s, images: JSON.parse(s.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الشحنات للتاجر" });
    }
  });

  app.post("/api/admin/shipments/:id/update-status", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status, trackingNotes, currentLocation, estimatedDelivery, trackingNumber } = req.body;
    try {
      const now = new Date().toISOString();
      db.prepare(`UPDATE shipments SET status = ?, trackingNotes = ?, currentLocation = ?, estimatedDelivery = ?, trackingNumber = ?, updatedAt = ? WHERE id = ?`)
        .run(status, trackingNotes || '', currentLocation || '', estimatedDelivery || '', trackingNumber || '', now, id);

      const shipment: any = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id);
      if (shipment) {
        const statusLabels: Record<string, string> = {
          'awaiting_payment': 'بانتظار الدفع',
          'paid': 'تم الدفع',
          'shipping_requested': 'طلب الشحن 🚚',
          'in_transit': 'قيد النقل',
          'in_warehouse': 'في المستودع',
          'in_shipping': 'جاري الشحن',
          'customs': 'التخليص الجمركي',
          'delivered': 'تم التوصيل'
        };
        const car: any = db.prepare("SELECT make, model, year FROM cars WHERE id = ?").get(shipment.carId);
        const itemInfo = car ? `${car.year} ${car.make} ${car.model}` : `سيارة #${shipment.carId}`;
        const shippingLink = `https://www.autopro.ac/dashboard/shipments`;
        const carLink = `https://www.autopro.ac/cars/${shipment.carId}`;
        
        const statusMsg = `${trackingNumber ? `كود التتبع: ${trackingNumber} | ` : ''}${currentLocation ? `الموقع: ${currentLocation} | ` : ''}${estimatedDelivery ? `تاريخ الوصول: ${new Date(estimatedDelivery).toLocaleDateString('ar-EG')}` : ''} ${trackingNotes ? ` | ملاحظات: ${trackingNotes}` : ''}`;

        sendNotification(shipment.userId, statusLabels[status] || status, statusMsg, 'info', 'shipping_status_update', {
          shippingLink,
          carLink,
          itemInfo
        });

        sendInternalMessage('admin-1', shipment.userId,
          `📦 تحديث حالة الشحن: ${statusLabels[status] || status}`,
          `تم تحديث حالة شحن سيارتك إلى: ${statusLabels[status] || status}\n${trackingNumber ? `كود التتبع: ${trackingNumber}\n` : ''}${currentLocation ? `الموقع الحالي: ${currentLocation}\n` : ''}${estimatedDelivery ? `التاريخ المتوقع للوصول: ${new Date(estimatedDelivery).toLocaleDateString('ar-EG')}\n` : ''}${trackingNotes ? `ملاحظات: ${trackingNotes}` : ''}`
        );
        io.to(`user_${shipment.userId}`).emit("shipment_updated", { ...shipment, status });

        // If status is in_warehouse, activate shipping invoice
        if (status === 'in_warehouse') {
          db.prepare("UPDATE invoices SET status = 'unpaid' WHERE carId = ? AND userId = ? AND type = 'shipping' AND status = 'pending'")
            .run(shipment.carId, shipment.userId);
        }
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث حالة الشحن" });
    }
  });

  app.post("/api/shipments/:carId/request", requireAuth, (req, res) => {
    const { carId } = req.params;
    const userId = (req as any).user.id; // Use authenticated user
    try {
      const now = new Date().toISOString();
      // Ensure shipment record exists (UPSERT)
      const existing: any = db.prepare("SELECT id FROM shipments WHERE carId = ? AND userId = ?").get(carId, userId);
      if (existing) {
        db.prepare(`UPDATE shipments SET status = 'shipping_requested', updatedAt = ? WHERE carId = ? AND userId = ?`)
          .run(now, carId, userId);
      } else {
        const shipId = `ship-${Date.now()}`;
        db.prepare(`INSERT INTO shipments(id, carId, userId, status, createdAt, updatedAt) VALUES(?, ?, ?, 'shipping_requested', ?, ?)`)
          .run(shipId, carId, userId, now, now);
      }

      const car: any = db.prepare("SELECT make, model, year, sellerId, lotNumber FROM cars WHERE id = ?").get(carId);

      // Notify all admins
      const admins: any[] = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      admins.forEach((admin: any) => {
        sendInternalMessage(userId, admin.id,
          `🚚 طلب شحن جديد: ${car.year} ${car.make} ${car.model}`,
          `قام العميل بطلب شحن السيارة للعنوان بعد إتمام الدفع.\n\nالسيارة: ${car.year} ${car.make} ${car.model}\n carId: ${carId}\n\nيرجى مراجعة الطلب في قسم اللوجستيات وتحديث حالة الشحن.`
        );
      });

      // Notify Seller
      if (car.sellerId) {
        sendNotification(car.sellerId, '🚚 طلب شحن سيارة مباعة', `المشتري طلب شحن سيارتك رقم اللوت: ${car.lotNumber}`, 'info');
        sendInternalMessage('admin-1', car.sellerId, '🚚 تحديث اللوجستيات: طلب شحن',
          `قام المشتري بطلب شحن سيارتك المباعة (${car.make} ${car.model}).\n\nيرجى متابعة حالة السيارة واستكمال إجراءات التسليم في لوحة التاجر.`
        );
      }

      res.json({ success: true, message: "تم إرسال طلب الشحن بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال طلب الشحن" });
    }
  });

  // Invoice Routes
  app.get("/api/invoices/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const invoices: any[] = db.prepare(`
      SELECT i.*, c.make, c.model, c.year, c.lotNumber, c.sellerId
      FROM invoices i 
      LEFT JOIN cars c ON i.carId = c.id 
      WHERE i.userId = ?
  `).all(userId);
    res.json(invoices);
  });

  app.get("/api/offers/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const offers = db.prepare("SELECT * FROM cars WHERE winnerId = ? AND status = 'offer_market'").all(userId);
      res.json(offers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/invoices/:id/pay", requireAuth, (req, res) => {
    const { id } = req.params;
    const { method, referenceNo, receiptUrl } = req.body;
    const userId = (req as any).user.id; // Use authenticated user, not body param

    if (!method) return res.status(400).json({ error: "يرجى اختيار طريقة الدفع أولاً" });

    try {
      const invoice: any = db.prepare("SELECT i.*, c.sellerId, c.make, c.model, c.year FROM invoices i LEFT JOIN cars c ON i.carId = c.id WHERE i.id = ?").get(id) as any;
      if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة" });
      if (invoice.userId !== userId) return res.status(403).json({ error: "هذه الفاتورة لا تخصك" });
      if (invoice.status === 'paid') return res.status(400).json({ error: "الفاتورة مدفوعة بالفعل" });
      if (invoice.status === 'pending_confirmation') return res.status(400).json({ error: "هذه الفاتورة بانتظار تأكيد الإدارة" });

      const timestamp = new Date().toISOString();

      // 💳 METHOD 1: WALLET PAYMENT (INSTANT)
      if (method === 'wallet') {
        const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
        if (!wallet || wallet.balance < invoice.amount) {
          return res.status(400).json({ error: `رصيد المحفظة غير كافٍ. الرصيد الحالي: $${(wallet?.balance || 0).toLocaleString()}` });
        }

        db.transaction(() => {
          walletDebit(userId, invoice.amount, `دفع فاتورة ${invoice.type}: ${invoice.id}`, invoice.id);
          const pickupCode = `AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          db.prepare("UPDATE invoices SET status = 'paid', pickupAuthCode = ?, paidAt = ?, paidVia = 'wallet' WHERE id = ?").run(pickupCode, timestamp, id);

          // If purchase invoice paid, activate transport invoice AND settle with seller
          if (invoice.type === 'purchase') {
            db.prepare("UPDATE invoices SET status = 'unpaid' WHERE carId = ? AND userId = ? AND type = 'transport' AND status = 'pending'")
              .run(invoice.carId, userId);
            db.prepare("UPDATE shipments SET status = 'paid', updatedAt = ? WHERE carId = ? AND userId = ?")
              .run(timestamp, invoice.carId, userId);

            if (invoice.sellerId) {
              const seller: any = db.prepare("SELECT commission FROM users WHERE id = ?").get(invoice.sellerId) as any;
              settleSaleToSellerWallet(invoice.sellerId, invoice.carId, invoice.amount, seller?.commission || 5, `بيع سيارة: ${invoice.year} ${invoice.make} ${invoice.model}`);
              sendNotification(invoice.sellerId, '💰 تم استلام دفعة سيارة', `المشتري قام بدفع ثمن سيارتك ${invoice.make} عبر المحفظة.`, 'success');
            }
          } else if (invoice.type === 'transport') {
            db.prepare("UPDATE shipments SET status = 'in_transit', updatedAt = ? WHERE carId = ? AND userId = ?")
              .run(timestamp, invoice.carId, userId);
          } else if (invoice.type === 'shipping') {
            db.prepare("UPDATE shipments SET status = 'in_shipping', updatedAt = ? WHERE carId = ? AND userId = ?")
              .run(timestamp, invoice.carId, userId);
          }
        })();

        return res.json({ success: true, status: 'paid', message: "تم الدفع بنجاح عبر المحفظة" });
      }

      // 🏦 METHOD 2: MANUAL METHODS (Requires Admin Confirmation)
      if (['bank_transfer', 'cash', 'card'].includes(method)) {
        const requestId = `pr-inv-${Date.now()}`;
        db.transaction(() => {
          // Create payment request
          db.prepare(`
            INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, receiptUrl, invoiceId, status, requestedAt)
            VALUES (?, ?, 'invoice_payment', ?, ?, ?, ?, ?, 'pending', ?)
          `).run(requestId, userId, invoice.amount, method, referenceNo || null, receiptUrl || null, id, timestamp);

          // Update invoice status
          db.prepare("UPDATE invoices SET status = 'pending_confirmation', paidVia = ? WHERE id = ?").run(method, id);
        })();

        // Notify Admin
        sendNotification('admin-1', '🧾 طلب تأكيد دفع فاتورة', `قام المستخدم بدفع فاتورة ${invoice.type} بمبلغ $${invoice.amount.toLocaleString()} عبر ${method}. يرجى التأكيد.`, 'info');
        // Notify the user that their invoice payment request was submitted
        sendNotification(userId, '📋 تم إرسال طلب دفع الفاتورة', `تم إرسال طلب دفع الفاتورة ${id} للمراجعة. سنُعلمك فور الموافقة.`, 'info', 'general_notification', {}, '/dashboard/user?view=invoices');

        return res.json({ success: true, status: 'pending_confirmation', message: "تم إرسال طلب الدفع للإدارة للمراجعة" });
      }

      res.status(400).json({ error: "طريقة دفع غير مدعومة" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "فشل عملية الدفع: " + e.message });
    }
  });

  // Watchlist Routes
  app.get("/api/watchlist/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const watchlist: any[] = db.prepare(`
      SELECT w.*, c.make, c.model, c.year, c.currentBid, c.images, c.status
      FROM watchlist w
      JOIN cars c ON w.carId = c.id
      WHERE w.userId = ?
  `).all(userId);
    res.json(watchlist.map((item: any) => ({
      ...item,
      images: JSON.parse(item.images || '[]')
    })));
  });

  app.post("/api/watchlist", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const { carId } = req.body;
    const id = Date.now().toString();
    try {
      db.prepare("INSERT INTO watchlist (id, userId, carId, timestamp) VALUES (?, ?, ?, ?)").run(
        id, userId, carId, new Date().toISOString()
      );
      res.json({ id, userId, carId });
    } catch (e) {
      res.status(400).json({ error: "Failed to add to watchlist" });
    }
  });

  app.delete("/api/watchlist/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM watchlist WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ======= ADMIN: USER MANAGEMENT ROUTES (Deduplicated - canonical version below at /api/admin/approve-user) =======
  // NOTE: Duplicate routes removed. The canonical versions are at lines ~963-998 above.

  // ======= TRANSACTION ROUTES =======
  app.get("/api/transactions/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const transactions: any[] = db.prepare("SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC").all(userId);
    res.json(transactions);
  });

  app.get("/api/transactions", requireAdmin, (req, res) => {
    const { status, type } = req.query;
    let query = "SELECT t.*, u.firstName, u.lastName FROM transactions t JOIN users u ON t.userId = u.id";
    const params: any[] = [];

    if (status || type) {
      query += " WHERE";
      if (status) {
        query += " t.status = ?";
        params.push(status);
      }
      if (type) {
        if (status) query += " AND";
        query += " t.type = ?";
        params.push(type);
      }
    }

    query += " ORDER BY t.timestamp DESC";

    try {
      const transactions: any[] = db.prepare(query).all(...params);
      res.json(transactions);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", requireAdmin, (req, res) => {
    const { userId, amount, type, status } = req.body;
    const id = Date.now().toString();
    try {
      db.prepare("INSERT INTO transactions (id, userId, amount, type, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, userId, amount, type, status || 'completed', new Date().toISOString()
      );
      // Update user buying power if it's a deposit
      if (type === 'deposit') {
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = buyingPower + ? WHERE id = ?").run(amount, amount * 10, userId);
      }
      res.json({ id, userId, amount, type });
    } catch (e) {
      res.status(400).json({ error: "Transaction failed" });
    }
  });

  // ======= SELLER WALLET ROUTES =======

  // Helper: ensure seller wallet exists
  const ensureSellerWallet = (sellerId: string) => {
    const exists: any = db.prepare("SELECT sellerId FROM seller_wallets WHERE sellerId = ?").get(sellerId);
    if (!exists) {
      db.prepare(`
        INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated)
        VALUES (?, 0, 0, 0, 0, ?)
      `).run(sellerId, new Date().toISOString());
    }
  };

  // Helper: settle a car sale to seller wallet (called when car is sold)
  const settleSaleToSellerWallet = (sellerId: string, carId: string, soldAmount: number, commissionRate: number, carDescription: string) => {
    ensureSellerWallet(sellerId);
    const commission = Math.round(soldAmount * (commissionRate / 100));
    const netAmount = soldAmount - commission;
    const txId = `stx-${Date.now()}`;

    db.prepare(`
      INSERT INTO seller_transactions (id, sellerId, carId, type, amount, commission, netAmount, status, description, timestamp)
      VALUES (?, ?, ?, 'sale', ?, ?, ?, 'pending', ?, ?)
    `).run(txId, sellerId, carId, soldAmount, commission, netAmount, carDescription, new Date().toISOString());

    // Add directly to available balance (3-day hold not implemented)
    db.prepare(`
      UPDATE seller_wallets
      SET availableBalance = availableBalance + ?,
          totalEarned = totalEarned + ?,
          lastUpdated = ?
      WHERE sellerId = ?
    `).run(netAmount, netAmount, new Date().toISOString(), sellerId);

    return { txId, commission, netAmount };
  };

  // ======= MODULE REGISTRATION (extracted routes) =======
  const ctx = {
    app, io, db, sendEmail, sendNotification, sendInternalMessage,
    walletCredit, walletDebit, createWinInvoices, completeInvoicePayment,
    ensureSellerWallet, settleSaleToSellerWallet,
    JWT_SECRET, SITE_URL, SALT_ROUNDS, stripeClient, transporter,
    PLUTU_API_KEY, PLUTU_ACCESS_TOKEN, PLUTU_SECRET_KEY, PLUTU_BASE_URL, PLUTU_ENABLED,
  };
  console.log('[BOOT] Registering route modules...');
  registerAuthRoutes(ctx as any);
  console.log('[BOOT] ✓ auth routes');
  registerAdminRoutes(ctx as any);
  console.log('[BOOT] ✓ admin routes');
  registerPaymentRoutes(ctx as any);
  console.log('[BOOT] ✓ payment routes');
  registerSellerRoutes(ctx as any);
  console.log('[BOOT] ✓ seller routes');
  registerBuyerRoutes(ctx as any);
  console.log('[BOOT] ✓ buyer routes');
  registerCarRoutes(ctx as any);
  console.log('[BOOT] ✓ car routes');
  registerShippingRoutes(ctx as any);
  console.log('[BOOT] ✓ shipping routes');
  registerSocketHandlers(ctx as any);
  console.log('[BOOT] ✓ socket handlers');

  // GET /api/seller/wallet/:sellerId - Full wallet summary
  app.get("/api/seller/wallet/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    const reqUser = (req as any).user;
    if (reqUser.id !== sellerId && reqUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بالوصول لمحفظة بائع آخر" });
    }
    try {
      ensureSellerWallet(sellerId);
      const wallet: any = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(sellerId) as any;
      const seller: any = db.prepare("SELECT id, firstName, lastName, email, phone FROM users WHERE id = ?").get(sellerId) as any;

      // Count stats
      const soldCars: any = db.prepare("SELECT COUNT(*) as count FROM seller_transactions WHERE sellerId = ? AND type = 'sale'").get(sellerId) as any;
      const pendingWithdrawals: any = db.prepare("SELECT SUM(amount) as total FROM withdrawal_requests WHERE sellerId = ? AND status = 'pending'").get(sellerId) as any;

      res.json({
        ...wallet,
        sellerName: seller ? `${seller.firstName} ${seller.lastName}` : '',
        iban: seller?.iban || wallet?.iban || '',
        commissionRate: seller?.commission || 2,
        totalSoldCars: soldCars?.count || 0,
        pendingWithdrawalAmount: pendingWithdrawals?.total || 0
      });
    } catch (e) {
      res.status(500).json({ error: "فشل جلب بيانات المحفظة" });
    }
  });

  // GET /api/seller/transactions/:sellerId - Seller transaction ledger
  app.get("/api/seller/transactions/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    const reqUser = (req as any).user;
    if (reqUser.id !== sellerId && reqUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بالوصول لمعاملات بائع آخر" });
    }
    try {
      const txs: any[] = db.prepare(`
        SELECT st.*, c.make, c.model, c.year, c.lotNumber
        FROM seller_transactions st
        LEFT JOIN cars c ON st.carId = c.id
        WHERE st.sellerId = ?
        ORDER BY st.timestamp DESC
      `).all(sellerId);
      res.json(txs);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سجل المعاملات" });
    }
  });

  // POST /api/seller/withdraw - Request withdrawal
  app.post("/api/seller/withdraw", requireAuth, (req, res) => {
    const reqUser = (req as any).user;
    const sellerId = reqUser.id; // Use authenticated user, not body param
    const { amount, iban, bankName } = req.body;
    try {
      ensureSellerWallet(sellerId);
      const wallet: any = db.prepare("SELECT availableBalance FROM seller_wallets WHERE sellerId = ?").get(sellerId) as any;

      if (!wallet || wallet.availableBalance < amount) {
        return res.status(400).json({ error: `الرصيد المتاح ($${(wallet?.availableBalance || 0).toLocaleString()}) أقل من المبلغ المطلوب` });
      }
      if (amount < 100) {
        return res.status(400).json({ error: "الحد الأدنى للسحب هو $100" });
      }

      const reqId = `wr-${Date.now()}`;
      db.prepare(`
        INSERT INTO withdrawal_requests (id, sellerId, amount, iban, bankName, status, requestedAt)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(reqId, sellerId, amount, iban, bankName, new Date().toISOString());

      // Reserve the amount (deduct from available, tracked in withdrawal_requests)
      db.prepare("UPDATE seller_wallets SET availableBalance = availableBalance - ?, lastUpdated = ? WHERE sellerId = ?")
        .run(amount, new Date().toISOString(), sellerId);

      sendNotification(sellerId, '✅ طلب السحب قيد المراجعة', `تم استقبال طلب سحب $${amount.toLocaleString()} بنجاح. ستتم المعالجة خلال 1-3 أيام عمل.`, 'info');
      sendNotification('admin-1', '💰 طلب سحب جديد', `البائع ${sellerId} طلب سحب $${amount.toLocaleString()}`, 'alert');

      res.json({ success: true, requestId: reqId, message: "تم إرسال طلب السحب للمراجعة" });
    } catch (e) {
      res.status(500).json({ error: "فشل طلب السحب" });
    }
  });

  // GET /api/admin/withdrawal-requests - Admin: list pending withdrawals
  app.get("/api/admin/withdrawal-requests", requireAdmin, (_req, res) => {
    try {
      const requests: any[] = db.prepare(`
        SELECT wr.*, u.firstName, u.lastName, u.email, u.iban
        FROM withdrawal_requests wr
        JOIN users u ON wr.sellerId = u.id
        ORDER BY wr.requestedAt DESC
      `).all();
      res.json(requests);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب طلبات السحب" });
    }
  });

  // POST /api/admin/withdrawal-requests/:id/approve - Admin: approve withdrawal
  app.post("/api/admin/withdrawal-requests/:id/approve", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { note } = req.body;
    try {
      const wr: any = db.prepare("SELECT * FROM withdrawal_requests WHERE id = ?").get(id) as any;
      if (!wr) return res.status(404).json({ error: "الطلب غير موجود" });

      db.prepare("UPDATE withdrawal_requests SET status = 'completed', processedAt = ?, adminNote = ? WHERE id = ?")
        .run(new Date().toISOString(), note || '', id);

      db.prepare("UPDATE seller_wallets SET totalWithdrawn = totalWithdrawn + ?, lastUpdated = ? WHERE sellerId = ?")
        .run(wr.amount, new Date().toISOString(), wr.sellerId);

      // Log as seller transaction
      db.prepare(`INSERT INTO seller_transactions (id, sellerId, type, amount, commission, netAmount, status, description, timestamp, processedAt)
        VALUES (?, ?, 'withdrawal', ?, 0, ?, 'completed', 'تحويل بنكي مكتمل', ?, ?)`)
        .run(`stx-wd-${Date.now()}`, wr.sellerId, wr.amount, wr.amount, new Date().toISOString(), new Date().toISOString());

      sendNotification(wr.sellerId, '✅ تم تحويل المبلغ', `تم قبول طلب السحب وتحويل $${wr.amount.toLocaleString()} لحسابك البنكي.`, 'success');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل الموافقة على السحب" });
    }
  });

  // POST /api/admin/withdrawal-requests/:id/reject - Admin: reject withdrawal
  app.post("/api/admin/withdrawal-requests/:id/reject", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      const wr: any = db.prepare("SELECT * FROM withdrawal_requests WHERE id = ?").get(id) as any;
      if (!wr) return res.status(404).json({ error: "الطلب غير موجود" });

      db.prepare("UPDATE withdrawal_requests SET status = 'rejected', processedAt = ?, adminNote = ? WHERE id = ?")
        .run(new Date().toISOString(), reason || '', id);

      // Refund: return amount to available balance
      db.prepare("UPDATE seller_wallets SET availableBalance = availableBalance + ?, lastUpdated = ? WHERE sellerId = ?")
        .run(wr.amount, new Date().toISOString(), wr.sellerId);

      sendNotification(wr.sellerId, '❌ تم رفض طلب السحب', `للأسف تم رفض طلب السحب. السبب: ${reason || 'لم يتم توضيح السبب'}. تم إعادة المبلغ لرصيدك.`, 'alert');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض طلب السحب" });
    }
  });

  // PUT /api/seller/wallet/:id/iban - Update seller IBAN & bank info
  app.put("/api/seller/wallet/:id/iban", requireAuth, (req, res) => {
    const { id } = req.params;
    const { iban, bankName } = req.body;
    if (!iban?.trim()) return res.status(400).json({ error: "IBAN مطلوب" });
    try {
      // Ensure wallet exists
      const exists: any = db.prepare("SELECT sellerId FROM seller_wallets WHERE sellerId = ?").get(id);
      if (!exists) {
        db.prepare("INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated, iban, bankName) VALUES (?, 0, 0, 0, 0, ?, ?, ?)")
          .run(id, new Date().toISOString(), iban.trim(), bankName?.trim() || '');
      } else {
        db.prepare("UPDATE seller_wallets SET iban = ?, bankName = ?, lastUpdated = ? WHERE sellerId = ?")
          .run(iban.trim(), bankName?.trim() || '', new Date().toISOString(), id);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث IBAN" });
    }
  });

  // POST /api/upload/document - KYC & general document upload
  app.post("/api/upload/document", requireAuth, (uploadDoc.single('document') as any), ((req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "لم يتم اختيار ملف" });
      const { userId, docType } = req.body;
      const filename = req.file.filename;
      const url = `/uploads/${filename}`;

      // Save to kyc_documents table
      if (userId) {
        const docId = `kyc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        try {
          db.prepare(`INSERT INTO kyc_documents (id, userId, docType, filename, url, status, uploadedAt)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
            .run(docId, userId, docType || 'kyc', filename, url, new Date().toISOString());
          db.prepare("UPDATE users SET kycStatus = 'pending' WHERE id = ?").run(userId);
        } catch (e) { console.error('KYC doc save error:', e); }
      }

      res.json({ success: true, url, filename });
    } catch (e: any) {
      res.status(500).json({ error: "فشل رفع الملف: " + e.message });
    }
  }) as any);

  // ======= PHASE 7: KYC ADMIN REVIEW ROUTES =======

  // GET /api/admin/kyc-pending - List sellers with pending KYC docs
  app.get("/api/admin/kyc-pending", requireAdmin, (req, res) => {
    try {
      const users: any[] = db.prepare(`
        SELECT DISTINCT u.id, u.firstName, u.lastName, u.email, u.phone, u.kycStatus, u.joinDate,
          (SELECT COUNT(*) FROM kyc_documents WHERE userId = u.id) as docCount
        FROM users u
        INNER JOIN kyc_documents kd ON kd.userId = u.id
        WHERE u.role = 'seller' OR kd.docType = 'kyc'
        ORDER BY u.joinDate DESC
      `).all();

      const result = users.map((u: any) => ({
        ...u,
        documents: db.prepare("SELECT * FROM kyc_documents WHERE userId = ? ORDER BY uploadedAt DESC").all(u.id)
      }));

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب طلبات KYC" });
    }
  });

  // POST /api/admin/kyc/:userId/approve - Approve user KYC
  app.post("/api/admin/kyc/:userId/approve", requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { note } = req.body;
    try {
      db.prepare("UPDATE users SET kycStatus = 'approved' WHERE id = ?").run(userId);
      db.prepare("UPDATE kyc_documents SET status = 'approved', reviewedAt = ?, reviewNote = ? WHERE userId = ? AND status = 'pending'")
        .run(new Date().toISOString(), note || '', userId);

      sendNotification(userId, '✅ تم توثيق حسابك (KYC)', 'تمت مراجعة وثائقك وتوثيق حسابك. يمكنك الآن طلب سحب أرباحك بحرية.', 'success');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل الموافقة على KYC" });
    }
  });

  // POST /api/admin/kyc/:userId/reject - Reject user KYC
  app.post("/api/admin/kyc/:userId/reject", requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    try {
      db.prepare("UPDATE users SET kycStatus = 'rejected' WHERE id = ?").run(userId);
      db.prepare("UPDATE kyc_documents SET status = 'rejected', reviewedAt = ?, reviewNote = ? WHERE userId = ? AND status = 'pending'")
        .run(new Date().toISOString(), reason || '', userId);

      sendNotification(userId, '❌ تم رفض وثائق التوثيق', `للأسف تم رفض وثائقك. السبب: ${reason || 'لم يتم توضيح السبب'}. يرجى رفع وثائق جديدة.`, 'alert');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض KYC" });
    }
  });

  // GET /api/admin/kyc-documents/:userId - Get docs for specific user
  app.get("/api/admin/kyc-documents/:userId", requireAdmin, (req, res) => {
    try {
      const docs: any[] = db.prepare("SELECT * FROM kyc_documents WHERE userId = ? ORDER BY uploadedAt DESC").all(req.params.userId);
      res.json(docs);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الوثائق" });
    }
  });

  // ==========================================
  // UNIFIED ACTIVITY LOG (MESSAGES / NOTIFICATIONS)
  // ==========================================
  app.get("/api/admin/all-messages", requireAdmin, (req, res) => {
    try {
      const msgs = db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 500").all();
      res.json(msgs);
    } catch (e) { res.status(500).json({ error: "Failed to fetch messages" }); }
  });

  app.get("/api/admin/all-notifications", requireAdmin, (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 500").all();
      res.json(notes);
    } catch (e) { res.status(500).json({ error: "Failed to fetch notifications" }); }
  });

  // ==========================================
  // GLOBAL SYSTEM SETTINGS & NOTIFICATIONS
  // ==========================================
  app.get("/api/admin/settings", requireAdmin, (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM system_settings").all();
      res.json(Array.isArray(settings) ? settings : []);
    } catch (e) {
      console.error(e);
      res.json([]); // Return empty array instead of error object to prevent frontend crash
    }
  });

  app.post("/api/admin/settings/update", requireAdmin, (req, res) => {
    const { key, value } = req.body;
    try {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)")
        .run(key, value, new Date().toISOString());
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to update setting" }); }
  });

  // ── Welcome Message Settings ──────────────────────────────────────────────
  app.get("/api/admin/welcome-settings", requireAdmin, (_req, res) => {
    try {
      const keys = ['welcome_message_subject', 'welcome_message_content', 'deposit_reminder_text', 'company_address', 'company_phones', 'company_google_maps'];
      const settings: Record<string, string> = {};
      keys.forEach(key => {
        const row: any = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
        settings[key] = row?.value || '';
      });
      res.json(settings);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/welcome-settings", requireAdmin, (req, res) => {
    try {
      const allowed = ['welcome_message_subject', 'welcome_message_content', 'deposit_reminder_text', 'company_address', 'company_phones', 'company_google_maps'];
      const now = new Date().toISOString();
      const stmt = db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)");
      for (const [key, value] of Object.entries(req.body)) {
        if (allowed.includes(key)) {
          stmt.run(key, String(value), now);
        }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/external-notifications", requireAdmin, (req, res) => {
    try {
      const logs = db.prepare("SELECT * FROM external_notifications ORDER BY timestamp DESC LIMIT 100").all();
      res.json(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error(e);
      res.json([]); // Return empty array
    }
  });

  app.post("/api/admin/external-notifications/test", requireAdmin, async (req, res) => {
    const { email, phone } = req.body;
    const results = [];

    // 1. Test Email
    if (email) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"AUTOPRO AUCTIONS" <${process.env.SMTP_USER}>`,
          to: email,
          subject: "🔍 Test Notification - Auto Pro Platform",
          html: `<div dir="rtl" style="font-family: Arial; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                  <h2 style="color: #f97316;">AUTOPRO - Test Message</h2>
                  <p>This is a test email sent from your platform admin dashboard.</p>
                  <p>Status: <b>SMTP connection working correctly</b></p>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                  <small style="color: #64748b;">Timestamp: ${new Date().toLocaleString('ar-LY')}</small>
                 </div>`
        });

        db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(`test-em-${Date.now()}`, 'email', email, 'Test Email Dispatch', 'Test email from Admin', 'sent', new Date().toISOString());
        results.push({ type: 'email', status: 'success' });
      } catch (err: any) {
        db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(`test-em-err-${Date.now()}`, 'email', email, 'Test Email Dispatch', 'Error: ' + err.message, 'error', new Date().toISOString());
        results.push({ type: 'email', status: 'error', message: err.message });
      }
    }

    // 2. Test WhatsApp (WasenderAPI)
    if (phone) {
      const token = process.env.WASENDER_TOKEN;

      if (!token) {
        results.push({ type: 'whatsapp', status: 'error', message: 'WASENDER_TOKEN missing in .env' });
      } else {
        try {
          // Strip leading zeros or + for WasenderAPI
          const finalPhone = phone.replace(/[^0-9]/g, '').replace(/^00/, '').replace(/^0/, '');
          
          const waRes = await fetch(`https://wasenderapi.com/api/send-message`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              to: finalPhone,
              text: `🚀 *AUTOPRO Platform Test*\n\nهذه رسالة تجريبية لتأكيد عمل نظام الواتساب (WasenderAPI) بنجاح.\n\nالوقت: ${new Date().toLocaleString('ar-LY')}`
            })
          });

          const waData: any = await waRes.json();
          if (waRes.ok) {
            db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .run(`test-wa-${Date.now()}`, 'whatsapp', phone, 'Test WhatsApp Dispatch', 'Test WhatsApp from Admin', 'sent', new Date().toISOString());
            results.push({ type: 'whatsapp', status: 'success' });
          } else {
            throw new Error(waData.message || 'Failed to dispatch WhatsApp');
          }
        } catch (err: any) {
          console.error('WhatsApp Test Failed:', err);
          db.prepare("INSERT INTO external_notifications (id, type, contact, title, content, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(`test-wa-err-${Date.now()}`, 'whatsapp', phone, 'Test WhatsApp Dispatch', 'Error: ' + err.message, 'error', new Date().toISOString());
          results.push({ type: 'whatsapp', status: 'error', message: err.message });
        }
      }
    }

    res.json({ 
      results, 
      success: results.length > 0 && results.every(r => r.status === 'success'),
      anySuccess: results.some(r => r.status === 'success')
    });
  });

  // ==========================================
  // ROUTES
  // ==========================================
  app.post('/api/admin/send-campaign', requireAdmin, async (req, res) => {
    try {
      const { carId, type } = req.body;
      const stmt = db.prepare('SELECT * FROM cars WHERE id = ?');
      const car = stmt.get(carId) as any;
      if (!car) return res.status(404).json({ error: 'Car not found' });
      if (typeof car.images === 'string') car.images = JSON.parse(car.images);

      const usersStmt = db.prepare("SELECT * FROM users WHERE status = ? OR role = ?");
      const allUsers = usersStmt.all('active', 'مستخدم');
      const emails = allUsers.map((u: any) => u.email).filter(Boolean);

      let color = '#f97316';
      let title = 'سيارة قادمة في المزاد';
      let action = 'سجل للمزايدة الآن';

      if (type === 'live') {
        color = '#ef4444'; title = 'المزاد بدأ الآن!'; action = 'زايد الآن';
      } else if (type === 'offer_market') {
        color = '#3b82f6'; title = 'فرصة سوق العروض للسيارة الفاخرة'; action = 'قدم عرضك الآن السعر: $' + (car.currentBid || car.reservePrice);
      }

      const htmlTemplate = `
      <div dir="rtl" style="font-family: Arial; padding: 40px 20px; background: #0f172a; color: white;">
        <div style="max-width: 600px; margin: auto; background: #1e293b; border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
          <!-- Header -->
          <div style="padding: 30px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <h1 style="color: ${color}; margin: 0; font-size: 28px;">AUTOPRO AUCTIONS</h1>
            <p style="color: #94a3b8; margin: 10px 0 0;">${title}</p>
          </div>

          <!-- Image -->
          <img src="${car.images[0]}" style="width: 100%; height: 350px; object-fit: cover;" />

          <!-- Body -->
          <div style="padding: 40px 30px;">
            <h2 style="margin: 0 0 10px; font-size: 24px; text-align: center;">${car.make} ${car.model} ${car.year}</h2>
            <p style="color: #94a3b8; text-align: center; margin: 0 0 30px;">${car.trim || ''} - متواجدة في ${car.location}</p>

            <div style="background: rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin-bottom: 30px;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 15px;">
                <span style="color: #94a3b8;">رقم اللوت (Lot)</span>
                <strong style="font-family: monospace;">${car.lotNumber}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 15px;">
                <span style="color: #94a3b8;">رقم الهيكل (VIN)</span>
                <strong style="font-family: monospace;">${car.vin}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #94a3b8;">السعر / المزايدة الحالية</span>
                <strong style="color: ${color}; font-size: 20px;">$${Number(car.currentBid || car.reservePrice).toLocaleString()}</strong>
              </div>
            </div>

            <a href="https://www.autopro.ac" style="display: block; background: ${color}; color: white; text-align: center; padding: 18px; border-radius: 14px; text-decoration: none; font-weight: bold; font-size: 18px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
              ${action}
            </a>
          </div>

          <!-- Footer -->
          <div style="padding: 20px; text-align: center; background: rgba(0,0,0,0.2);">
            <p style="color: #64748b; font-size: 12px; margin: 0;">هذه الرسالة تم إرسالها من منصة Libya Auto Pro</p>
          </div>
        </div>
      </div>
      `;

      // Process sending emails securely using Nodemailer
      for (const email of emails) {
        transporter.sendMail({
          from: '"AUTOPRO AUCTIONS" <' + process.env.SMTP_USER + '>',
          to: email,
          subject: `🔥 [AUTOPRO] ${title} ${car.make} ${car.model}`,
          html: htmlTemplate
        }).catch(err => console.error('Email failed to send directly:', err));
      }

      res.json({ success: true, count: emails.length });
    } catch (error) {
      console.error('Campaign error:', error);
      res.status(500).json({ error: 'Failed to broadcast campaign' });
    }
  });


  app.get("/api/admin/pending-deposits", requireAdmin, (req, res) => {
    try {
      const deposits: any[] = db.prepare(`
        SELECT t.*, u.firstName, u.lastName, u.email
        FROM transactions t
        JOIN users u ON t.userId = u.id
        WHERE t.type = 'deposit' AND t.status = 'pending'
        `).all();
      res.json(deposits);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch pending deposits" });
    }
  });

  app.post("/api/admin/approve-deposit", requireAdmin, (req, res) => {
    const { transactionId } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId) as any;
      if (!tx || tx.status !== 'pending') return res.status(404).json({ error: "العملية غير موجودة أو معالجة مسبقاً" });

      // Use a transaction for atomic update
      const update = db.transaction(() => {
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(transactionId);
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = buyingPower + ? WHERE id = ?")
          .run(tx.amount, tx.amount * 10, tx.userId);
        // Update buyer_wallets
        try {
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(tx.amount), Number(tx.amount), new Date().toISOString(), tx.userId);
        } catch (_) {}
      });
      update();

      sendNotification(tx.userId, 'تمت الموافقة على الإيداع', `تم إضافة $${tx.amount} لرصيدك وتحديث قوتك الشرائية.`, 'success');
      sendInternalMessage('admin-1', tx.userId, '✅ تأكيد إيداع رصيد', `تمت مراجعة طلب الإيداع الخاص بك بقيمة $${tx.amount} والموافقة عليه.\nيمكنك الآن البدء بالمزايدة.`);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to approve deposit" });
    }
  });

  app.post("/api/admin/reject-deposit", requireAdmin, (req, res) => {
    const { transactionId, reason } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId) as any;
      if (!tx) return res.status(404).json({ error: "العملية غير موجودة" });

      db.prepare("UPDATE transactions SET status = 'rejected' WHERE id = ?").run(transactionId);
      sendNotification(tx.userId, 'تم رفض طلب الإيداع', `للأسف تم رفض طلب الإيداع: ${reason} `, 'alert');

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to reject deposit" });
    }
  });

  // Message Routes (enhanced)
  app.get("/api/messages/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const messages: any[] = db.prepare(`
      SELECT m.*, u.firstName as senderFirstName, u.lastName as senderLastName
      FROM messages m
      LEFT JOIN users u ON m.senderId = u.id
      WHERE m.receiverId = ?
        ORDER BY m.timestamp DESC
          `).all(userId);
    res.json(messages);
  });

  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    try {
      const totalSales: any = (db.prepare("SELECT SUM(amount) as total FROM bids").get() as any)?.total || 0;
      const activeAuctions: any = (db.prepare("SELECT COUNT(*) as count FROM cars WHERE status = 'live'").get() as any)?.count || 0;
      const totalUsers: any = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)?.count || 0;
      const commissionRateSetting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'platform_commission_rate'").get();
      const totalCommission = totalSales * (parseFloat(commissionRateSetting?.value) || 0.07);
      const activeShipments: any = (db.prepare("SELECT COUNT(*) as count FROM shipments WHERE status NOT IN ('delivered', 'cancelled')").get() as any)?.count || 0;

      res.json({
        totalSales,
        activeAuctions,
        totalUsers,
        totalCommission,
        activeShipments,
        liveBids: activeAuctions
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/logs", requireAdmin, (req, res) => {
    try {
      const logs: any[] = db.prepare(`
        SELECT 'bid' as type, b.amount, b.timestamp, u.firstName, u.lastName, c.make, c.model, c.lotNumber
        FROM bids b
        JOIN users u ON b.userId = u.id
        JOIN cars c ON b.carId = c.id
        UNION ALL
        SELECT 'register' as type, 0 as amount, joinDate as timestamp, firstName, lastName, '' as make, '' as model, '' as lotNumber
        FROM users
        ORDER BY timestamp DESC
        LIMIT 20
        `).all();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  app.get("/api/admin/chart-data", requireAdmin, (req, res) => {
    try {
      // Simple aggregation by month for the last 6 months
      const data: any[] = db.prepare(`
        SELECT strftime('%Y-%m', timestamp) as month, COUNT(*) as count, SUM(amount) as sales
        FROM bids
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `).all();
      res.json(data.reverse());
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch chart data" });
    }
  });

  app.post("/api/cars/:id/offer", requireAuth, (req, res) => {
    const { id } = req.params;
    const { userId, amount } = req.body;
    const timestamp = new Date().toISOString();

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

      if (!car || car.status !== 'offer_market') {
        return res.status(400).json({ error: "السيارة غير متاحة في سوق العروض" });
      }

      if (amount < car.reservePrice * 0.9) {
        return res.status(400).json({ error: "العرض يجب أن يكون ضمن 10% من السعر الاحتياطي" });
      }

      if (!user || user.buyingPower < amount) {
        return res.status(400).json({ error: "القوة الشرائية غير كافية لتقديم هذا العرض" });
      }

      // Record the offer as a bid
      const bidId = `offer - ${Date.now()} `;
      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, 'offer')").run(bidId, id, userId, amount, timestamp);
      db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(amount, userId, id);

      // If offer meets reserve, sell immediately
      if (amount >= car.reservePrice) {
        db.prepare("UPDATE cars SET status = 'closed' WHERE id = ?").run(id);
        createWinInvoices(userId, id, amount);
        io.emit("car_updated", { id, status: 'closed', winnerId: userId });
        return res.json({ success: true, status: 'sold', message: "تم قبول العرض والبيع فوراً!" });
      }

      // Notify seller about the new offer
      if (car.sellerId) {
        sendNotification(car.sellerId, `عرض جديد بقيمة $${amount} على سيارتك ${car.make} ${car.model}`, 'offer', `/dashboard/seller?view=inventory`);
      }

      io.emit("car_updated", { id, currentBid: amount, winnerId: userId });
      res.json({ success: true, status: 'pending', message: "تم تقديم العرض بنجاح، بانتظار موافقة البائع" });
    } catch (err) {
      res.status(500).json({ error: "فشل تقديم العرض" });
    }
  });

  // Duplicate /api/offers/:id/accept and reject endpoints removed to resolve routing conflict

  app.post("/api/cars/:id/re-list", requireAuth, (req, res) => {
    const { id } = req.params;
    const { nextAuctionDate } = req.body;
    const reqUser = (req as any).user;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      // RBAC check — use JWT role, not body param
      if (reqUser.role !== 'admin' && car.sellerId !== reqUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإعادة إدراج هذه السيارة" });
      }

      db.prepare(`
        UPDATE cars SET
      status = 'upcoming',
        auctionEndDate = ?,
        currentBid = 0,
        winnerId = NULL,
        offerMarketEndTime = NULL,
        ultimoEndTime = NULL
        WHERE id = ?
        `).run(nextAuctionDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), id);

      // Optionally clear bids? Typically for a new auction we might clear bids or keep history.
      // For now we just reset the car status.

      io.emit("car_updated", { id, status: 'upcoming' });
      res.json({ success: true, message: "تم إعادة إدراج السيارة بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل إعادة إدراج السيارة" });
    }
  });

  app.post("/api/deposit", requireAuth, (req, res) => {
    const { amount, method = 'bank_transfer', referenceNo, currency = 'USD', notes } = req.body;
    const userId = (req as any).user.id; // Use authenticated user
    const now = new Date().toISOString();
    const txId = `tx-dep-${Date.now()}`;

    try {
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "بيانات غير مكتملة" });
      }

      // Get user info for notification
      const userRow: any = db.prepare("SELECT firstName, lastName, email from users WHERE id = ?").get(userId);
      const userName = userRow ? `${userRow.firstName} ${userRow.lastName}` : `ID: ${userId}`;

      // Record transaction as PENDING (no balance update until admin approves)
      db.prepare(`
        INSERT INTO transactions(id, userId, amount, type, status, timestamp, method, referenceNo, currency, notes)
        VALUES(?,?,?,'deposit','pending',?,?,?,?,?)
      `).run(txId, userId, Number(amount), now, method, referenceNo || null, currency, notes || null);

      // Notify admin about new deposit request
      const methodLabel = method === 'wise' ? 'Wise (تحويل دولي)' :
                          method === 'bank_lyd' ? 'تحويل بنكي ليبي (دينار)' :
                          method === 'sadad' ? 'سداد (مدار)' :
                          method === 'tadawul' ? 'تداول (نوماك)' : 'تحويل بنكي';
      sendNotification('admin-1',
        '🆕 طلب عربون جديد',
        `${userName} يطلب إيداع ${currency === 'LYD' ? amount.toLocaleString() + ' د.ل' : '$' + Number(amount).toLocaleString()} عبر ${methodLabel}${referenceNo ? '. المرجع: ' + referenceNo : ''}`,
        'info'
      );
      sendInternalMessage(userId, 'admin-1',
        '🆕 طلب إيداع عربون جديد',
        `قام العميل ${userName} (${userRow?.email || userId}) بطلب إيداع مبلغ ${currency === 'LYD' ? amount.toLocaleString() + ' د.ل' : '$' + Number(amount).toLocaleString()} عبر ${methodLabel}.\n${referenceNo ? 'رقم المرجع: ' + referenceNo + '\n' : ''}يرجى مراجعة التحويل وتأكيده في لوحة تحكم الإدارة.`
      );

      // Notify the user that their deposit request was received
      sendNotification(userId, '📩 تم استلام طلب إيداعك', `تم استلام طلب إيداعك بمبلغ ${currency === 'LYD' ? amount.toLocaleString() + ' د.ل' : '$' + Number(amount).toLocaleString()}. سيتم مراجعته خلال 24 ساعة.`, 'info', 'general_notification', {}, '/dashboard/user?view=wallet');

      res.json({ success: true, message: "تم إرسال طلب الإيداع بنجاح. سيتم تحديث رصيدك بعد مراجعة الإدارة.", txId });
    } catch (err) {
      console.error('[DEPOSIT]', err);
      res.status(500).json({ error: "فشل إرسال طلب الإيداع" });
    }
  });

  // ======= NEW ADMIN: DEPOSIT APPROVAL =======
  app.post("/api/admin/approve-deposit/:txId", requireAdmin, (req, res) => {
    const { txId } = req.params;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      const amtLabel = tx.currency === 'LYD'
        ? `${Number(tx.amount).toLocaleString()} دينار ليبي`
        : `$${Number(tx.amount).toLocaleString()}`;

      db.transaction(() => {
        // 1. Confirm transaction
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(txId);

        // 2. Update user deposit and buying power (deposit × 10)
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = (deposit + ?) * 10 WHERE id = ?")
          .run(tx.amount, tx.amount, tx.userId);

        // 3. Update buyer_wallets
        try {
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(tx.amount), Number(tx.amount), new Date().toISOString(), tx.userId);
        } catch (_) {}
      })();

      // 3. Fetch updated balances for receipt
      const updatedUser: any = db.prepare("SELECT deposit, buyingPower FROM users WHERE id = ?").get(tx.userId);
      const newDeposit = updatedUser ? Number(updatedUser.deposit).toLocaleString() : '—';
      const newBuyingPower = updatedUser ? Number(updatedUser.buyingPower).toLocaleString() : '—';
      const currSymbol = tx.currency === 'LYD' ? 'د.ل' : '$';

      // 4. Notify user (outside transaction so DB is already committed)
      sendNotification(tx.userId,
        '🎉 تمت الموافقة على إيداعك!',
        `تمت الموافقة على إيداعك بمبلغ ${amtLabel}! رصيدك الجديد: ${newDeposit} ${currSymbol}. قوتك الشرائية: ${newBuyingPower} ${currSymbol}`,
        'success', 'general_notification', {}, '/dashboard/user?view=wallet'
      );
      sendInternalMessage('admin-1', tx.userId,
        '✅ إيصال إيداع — تم قبول طلبك',
        `إيصال إيداع\n\nالمبلغ: ${amtLabel}\nالطريقة: ${tx.method || 'تحويل بنكي'}\nالمرجع: ${tx.referenceNo || txId}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\nالرصيد الجديد: ${newDeposit} ${currSymbol}\nالقوة الشرائية: ${newBuyingPower} ${currSymbol}\n\nشكراً لثقتك في أوتو برو! 🧡`,
        'accounting'
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تأكيد الإيداع" });
    }
  });

  // POST /api/admin/reject-deposit/:txId — Admin rejects a bank transfer deposit
  app.post("/api/admin/reject-deposit/:txId", requireAdmin, (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      db.prepare("UPDATE transactions SET status = 'rejected', adminNote = ? WHERE id = ?")
        .run(reason || 'رُفض من قِبل الإدارة', txId);

      sendNotification(tx.userId,
        '❌ تم رفض طلب العربون',
        `للأسف تم رفض طلب إيداع العربون بمبلغ $${Number(tx.amount).toLocaleString()}. السبب: ${reason || 'يرجى التواصل مع الإدارة'}.`,
        'alert', '/deposit'
      );
      sendInternalMessage('admin-1', tx.userId,
        '❌ تم رفض طلب إيداع العربون',
        `عزيزي العميل، تم رفض طلب إيداع مبلغ $${Number(tx.amount).toLocaleString()}.\nالسبب: ${reason || 'يرجى التواصل مع الإدارة'}\nيمكنك المحاولة مرة أخرى عبر صفحة الإيداع.`
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض الإيداع" });
    }
  });

  // POST /api/payments/stripe-webhook — handle Stripe events
  app.post("/api/payments/stripe-webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeClient || !webhookSecret) {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    let event: any;
    try {
      event = (stripeClient as any).webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const userId = pi.metadata?.userId;
      const amount = Math.round(pi.amount_received / 100); // Stripe uses cents

      if (userId) {
        try {
          const txId = `stripe-${pi.id}`;
          const existing = db.prepare("SELECT id FROM transactions WHERE id = ?").get(txId);
          if (!existing) {
            db.transaction(() => {
              db.prepare(`INSERT INTO transactions(id, userId, amount, type, status, method, referenceNo, timestamp)
                VALUES(?,?,?,'deposit','completed','stripe',?,?)`
              ).run(txId, userId, amount, pi.id, new Date().toISOString());

              db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = (deposit + ?) * 10 WHERE id = ?")
                .run(amount, amount, userId);

              // Update buyer_wallets
              try {
                db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
                  .run(Number(amount), Number(amount), new Date().toISOString(), userId);
              } catch (_) {}
            })();

            sendNotification(userId, '✅ تم استلام العربون عبر Stripe',
              `تم إضافة $${amount.toLocaleString()} كعربون مزايدة. القوة الشرائية محدّثة!`, 'success', '/deposit');
            sendInternalMessage('admin-1', userId, '✅ إيداع Stripe مؤكد',
              `تم استلام دفعة Stripe بمبلغ $${amount.toLocaleString()} للمستخدم ${userId}. تمت إضافة القوة الشرائية تلقائياً.`);
          }
        } catch (err) {
          console.error('Failed to process Stripe webhook payment:', err);
        }
      }
    }

    res.json({ received: true });
  });

  app.delete("/api/users/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.put("/api/users/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    try {
      // Only update fields that were actually sent
      const current: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!current) return res.status(404).json({ error: "المستخدم غير موجود" });

      const fields = ['firstName', 'lastName', 'email', 'phone', 'role', 'status',
        'deposit', 'buyingPower', 'commission', 'manager', 'office', 'companyName',
        'country', 'address1', 'address2', 'kycStatus'];

      const setClauses: string[] = [];
      const values: any[] = [];

      for (const field of fields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      // Auto-calculate buyingPower if deposit changed but buyingPower not specified
      if (updates.deposit !== undefined && updates.buyingPower === undefined) {
        setClauses.push('buyingPower = ?');
        values.push(Number(updates.deposit) * 10);
      }

      if (setClauses.length === 0) return res.json({ success: true, message: "لا توجد تغييرات" });

      values.push(id);
      db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Message Routes
  app.get("/api/messages", requireAdmin, (req, res) => {
    try {
      const messages: any[] = db.prepare(`
        SELECT m.*,
        u1.firstName as senderFirstName, u1.lastName as senderLastName,
        u2.firstName as receiverFirstName, u2.lastName as receiverLastName
        FROM messages m
        JOIN users u1 ON m.senderId = u1.id
        JOIN users u2 ON m.receiverId = u2.id
        ORDER BY m.timestamp DESC
  `).all();
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // NOTE: Duplicate /api/messages/user/:userId - this second definition is removed.
  // The canonical version at line ~1426 is kept (with correct .all(userId) parameter).

  app.post("/api/messages", requireAuth, (req, res) => {
    const { senderId, receiverId, subject, content, category } = req.body;
    try {
      sendInternalMessage(senderId, receiverId, subject, content, category);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/notifications/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const notifications: any[] = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC").all(userId);
      res.json(notifications);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    try {
      db.prepare("UPDATE notifications SET isRead = 1 WHERE userId = ?").run(userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE notifications SET isRead = 1 WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  app.get("/api/unread-counts/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    try {
      const messages: any = db.prepare("SELECT COUNT(*) as count FROM messages WHERE receiverId = ? AND isRead = 0").get(userId) as any;
      const notifications: any = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0").get(userId) as any;
      res.json({ messages: messages.count, notifications: notifications.count });
    } catch (e) {
      res.json({ messages: 0, notifications: 0 });
    }
  });

  app.post("/api/messages/:id/read", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE messages SET isRead = 1 WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });

  // Socket.io JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      // Allow unauthenticated connections for public auction viewing
      (socket as any).user = null;
      return next();
    }
    try {
      const decoded: any = jwt.verify(token as string, JWT_SECRET);
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  // Socket.io for Bidding
  io.on("connection", (socket) => {
    const socketUser = (socket as any).user;
    console.log("User connected:", socket.id, socketUser ? `(${socketUser.email})` : '(anonymous)');

    socket.on("join_auction", (data) => {
      const carId = typeof data === 'string' ? data : data?.carId;
      if (!carId) return;
      socket.join(carId);
      console.log(`User joined auction: ${carId}`);

      // The frontend uses car.auctionEndDate directly, no need for active timer sync
      const car: any = db.prepare("SELECT status, auctionEndDate FROM cars WHERE id = ?").get(carId);
      if (car && car.status === 'live') {
        socket.emit("timer_update", { carId });
      }
    });

    socket.on("join_user_room", (userId) => {
      // Only allow joining your own room
      if (socketUser && socketUser.id !== userId) return;
      socket.join(`user_${userId}`);
      console.log(`User joined personal room: user_${userId}`);
    });

    socket.on("send_message", (data) => {
      if (!socketUser) return socket.emit("bid_error", { message: "يجب تسجيل الدخول" });
      const { receiverId, subject, content, category = 'general' } = data;
      const senderId = socketUser.id; // Use authenticated user, not client-supplied
      try {
        const id = sendInternalMessage(senderId, receiverId, subject, content, category);

        const sender: any = db.prepare("SELECT firstName, lastName FROM users WHERE id = ?").get(senderId);
        const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'النظام';
        sendNotification(receiverId, `رسالة جديدة: ${subject}`, `لديك رسالة جديدة من ${senderName}`, 'info');

      } catch (err) {
        console.error("Socket message error:", err);
      }
    });

    socket.on("place_bid", (data) => {
      if (!socketUser) return socket.emit("bid_error", { message: "يجب تسجيل الدخول للمزايدة" });
      const { carId, amount, type } = data;
      const userId = socketUser.id; // Use authenticated user from JWT
      const timestamp = new Date().toISOString();
      const bidId = Date.now().toString();

      // Wrap all bid validation + placement in a transaction for atomicity
      let car: any, user: any, prevWinnerId: string | null;
      try {
        const bidResult = db.transaction(() => {
          const c: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
          const u: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

          if (!c || (c.status !== 'live' && c.status !== 'ultimo')) {
            throw new Error("المزاد غير متاح حالياً");
          }
          if (c.status === 'ultimo' && userId !== c.winnerId) {
            throw new Error("نافذة Ultimo متاحة فقط لأعلى مزايد حالياً");
          }
          if (amount <= c.currentBid) {
            throw new Error("يجب أن تكون المزايدة أعلى من القيمة الحالية");
          }
          if (!u) {
            throw new Error("المستخدم غير موجود");
          }

          // Calculate total exposure atomically inside transaction
          const totalLeadingBids: any = (db.prepare("SELECT SUM(currentBid) as total FROM cars WHERE winnerId = ? AND status = 'live' AND id != ?").get(userId, carId) as any)?.total || 0;
          const totalExposurePlusNewBid = totalLeadingBids + amount;

          if (totalExposurePlusNewBid > u.buyingPower) {
            throw new Error(`إجمالي التزاماتك($${totalLeadingBids.toLocaleString()} + $${amount.toLocaleString()}) يتجاوز سقفك المالي($${u.buyingPower.toLocaleString()})`);
          }

          const prev = c.winnerId;
          db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(amount, userId, carId);
          db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, ?)").run(bidId, carId, userId, amount, timestamp, type || 'manual');

          return { car: c, user: u, prevWinnerId: prev };
        })();

        car = bidResult.car;
        user = bidResult.user;
        prevWinnerId = bidResult.prevWinnerId;
      } catch (err: any) {
        socket.emit("bid_error", { message: err.message });
        return;
      }

      // From here on, bid is committed — do non-transactional side effects
      console.log(`[BID] $${amount} by ${userId} for ${carId}`);

      // Anti-sniping: ensure at least 15 seconds remain after each bid
      if (car.status === 'live' && car.auctionEndDate) {
          const currentEndDate = new Date(car.auctionEndDate).getTime();
          const now = Date.now();
          const remaining = currentEndDate - now;
          const ANTI_SNIPE_MS = 15000; // 15 seconds

          if (remaining < ANTI_SNIPE_MS) {
            const newEndDate = new Date(now + ANTI_SNIPE_MS).toISOString();
            const addedMs = (now + ANTI_SNIPE_MS) - currentEndDate;
            db.prepare("UPDATE cars SET auctionEndDate = ? WHERE id = ?").run(newEndDate, carId);
            io.to(carId).emit("car_updated", { id: carId, auctionEndDate: newEndDate });

            const addedSec = Math.ceil(addedMs / 1000);
            db.prepare(`
                UPDATE cars
                SET auctionEndDate = datetime(auctionEndDate, '+' || ? || ' seconds'),
                    auctionStartTime = datetime(auctionStartTime, '+' || ? || ' seconds')
                WHERE status = 'upcoming'
            `).run(addedSec, addedSec);

            io.emit("upcoming_cars_shifted", { shiftMs: addedMs });
          }
      }

      // INSTANT OUTBID NOTIFICATION (prevWinnerId comes from transaction)
      if (prevWinnerId && prevWinnerId !== userId) {
        sendNotification(prevWinnerId, "⚠️ تم تجاوز مزايدتك!", `قام شخص آخر بالمزايدة على ${car.make} ${car.model} بمبلغ $${amount.toLocaleString()}. زايد الآن لاستعادة الصدارة!`, 'warning', 'general_notification', {}, `/cars/${carId}`);
        io.to(`user_${prevWinnerId}`).emit("outbid", { carId, newBid: amount, make: car.make, model: car.model });
      }

      // If Ultimo bid meets reserve, close immediately
      if (car.status === 'ultimo' && amount >= car.reservePrice) {
        db.prepare("UPDATE cars SET status = 'closed' WHERE id = ?").run(carId);

        // Create invoices and shipment correctly
        createWinInvoices(userId, carId, amount);

        io.to(carId).emit("auction_closed", { carId, winnerId: userId, status: 'sold' });
      }

      // Bid already inserted in the transaction above

      const logEntry = {
        type: 'bid',
        amount,
        timestamp,
        firstName: user.firstName,
        lastName: user.lastName,
        make: car.make,
        model: car.model,
        lotNumber: car.lotNumber
      };
      // Broadcast bid and timer
      io.to(carId).emit("bid_updated", { carId, currentBid: amount, userId, timestamp, country: user.country });
      io.emit("global_bid_update", { carId, currentBid: amount });
      io.emit("new_log", logEntry);

      // Broadcast wallet balance update to the user
      io.to(`user_${userId}`).emit("user_update", {
        id: userId,
        buyingPower: user.buyingPower,
        deposit: user.deposit
      });

      // PROXY BIDDING TRIGGER
      checkProxyBids(carId, userId, amount);
    });

    // Helper for automated proxy bidding
    const checkProxyBids = (carId: string, lastBidderId: string, currentAmount: number) => {
      // Find the highest proxy bid that isn't from the current top bidder
      const proxies: any = db.prepare("SELECT * FROM proxy_bids WHERE carId = ? AND userId != ? AND maxAmount > ? ORDER BY maxAmount DESC LIMIT 1").get(carId, lastBidderId, currentAmount);

      if (proxies) {
        const nextAmount = currentAmount + 100; // Standard increment $100
        if (nextAmount <= proxies.maxAmount) {
          // System places bid automatically
          const timestamp = new Date().toISOString();
          const bidId = `proxy - ${Date.now()} `;

          db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(nextAmount, proxies.userId, carId);
          db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, 'proxy')").run(bidId, carId, proxies.userId, nextAmount, timestamp);

          console.log(`Proxy bid triggered for user ${proxies.userId}: $${nextAmount} `);

          const proxyUser: any = db.prepare("SELECT country FROM users WHERE id = ?").get(proxies.userId);
          io.to(carId).emit("bid_updated", { carId, currentBid: nextAmount, userId: proxies.userId, timestamp, country: proxyUser?.country });
          io.emit("global_bid_update", { carId, currentBid: nextAmount });

          // Recursively check if another proxy triggers
          checkProxyBids(carId, proxies.userId, nextAmount);
        }
      }
    };

    socket.on("set_proxy_bid", (data) => {
      if (!socketUser) return socket.emit("bid_error", { message: "يجب تسجيل الدخول" });
      const { carId, maxAmount } = data;
      const userId = socketUser.id; // Use authenticated user
      const user: any = db.prepare("SELECT buyingPower FROM users WHERE id = ?").get(userId);

      if (!user || maxAmount > user.buyingPower) {
        socket.emit("bid_error", { message: "الحد الأقصى يتجاوز رصيدك المتاح" });
        return;
      }

      db.prepare("INSERT OR REPLACE INTO proxy_bids (userId, carId, maxAmount) VALUES (?, ?, ?)").run(userId, carId, maxAmount);
      socket.emit("proxy_bid_set", { carId, maxAmount });
      console.log(`Proxy bid set for user ${userId} on ${carId}: $${maxAmount} `);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });


  app.get("/api/admin/all-transactions", requireAdmin, (req, res) => {
    try {
      const txs = db.prepare(`
        SELECT t.*, u.firstName, u.lastName 
        FROM transactions t
        LEFT JOIN users u ON t.userId = u.id
        ORDER BY t.timestamp DESC
        `).all();
      res.json(txs);
    } catch (e) { res.status(500).json({ error: "Transactions fetch error" }); }
  });

  app.post("/api/admin/invoices/manual", requireAdmin, (req, res) => {
    const { userId, carId, amount, type, dueDate } = req.body;
    if (!userId || !carId || !amount || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const id = `inv-man-${Date.now()}`;
      const timestamp = new Date().toISOString();
      const finalDueDate = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO invoices (id, userId, carId, amount, status, type, timestamp, dueDate)
        VALUES (?, ?, ?, ?, 'unpaid', ?, ?, ?)
      `).run(id, userId, carId, amount, type, timestamp, finalDueDate);

      // Notify the user about the new invoice
      const car: any = db.prepare("SELECT make, model, year FROM cars WHERE id = ?").get(carId);
      const itemInfo = car ? `${car.year} ${car.make} ${car.model}` : "سيارة غير معروفة";
      
      db.prepare(`
        INSERT INTO notifications (id, userId, title, message, type, timestamp)
        VALUES (?, ?, ?, ?, 'invoice', ?)
      `).run(`ntf-${Date.now()}`, userId, "فاتورة جديدة مستحقة 🧾", `تم إصدار فاتورة جديدة للمصاريف الإضافية (${type}) للسيارة ${itemInfo} بمبلغ $${amount.toLocaleString()}`, "info", timestamp);

      res.json({ success: true, id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create manual invoice" });
    }
  });

  app.get("/api/admin/invoices", requireAdmin, (req, res) => {
    try {
      const invoices = db.prepare(`
        SELECT i.*, u.firstName as buyerFirstName, u.lastName as buyerLastName, u.phone as buyerPhone, 
               c.make, c.model, c.year, c.lotNumber, c.vin
        FROM invoices i
        LEFT JOIN users u ON i.userId = u.id
        LEFT JOIN cars c ON i.carId = c.id
        ORDER BY i.timestamp DESC
      `).all();
      res.json(invoices);
    } catch (e) { 
      console.error(e);
      res.status(500).json({ error: "Invoices fetch error" }); 
    }
  });

  app.put("/api/admin/invoices/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { amount, notes } = req.body;
    try {
      try {
        db.prepare("ALTER TABLE invoices ADD COLUMN notes TEXT").run();
      } catch (e) { /* column may exist */ }
      
      db.prepare("UPDATE invoices SET amount = ?, notes = ? WHERE id = ?").run(amount, notes || '', id);
      res.json({ success: true, id, amount, notes });
    } catch (e) { 
      res.status(500).json({ error: "Failed to update invoice" }); 
    }
  });

  app.get("/api/admin/system-summary", requireAdmin, (req, res) => {
    try {
      const pendingUsers = db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE status = 'pending_approval'").all();
      const pendingCars = db.prepare("SELECT * FROM cars WHERE status = 'pending_approval'").all();
      const shipments = db.prepare("SELECT * FROM shipments WHERE status != 'delivered'").all();

      // Wallet financial overview (Phase 6: Sellers)
      let walletStats = { totalAvailable: 0, totalPending: 0, totalEarned: 0, totalWithdrawn: 0 };
      let withdrawalStats = { pendingCount: 0, pendingAmount: 0, completedAmount: 0 };

      // Buyer Wallet Overview (Phase 10)
      let buyerWalletStats = { totalCashBalance: 0, totalDeposited: 0, pendingTopups: 0, pendingTopupAmount: 0 };

      // Receivables (Invoices)
      let receivables = { unpaidPurchase: 0, unpaidTransport: 0, unpaidShipping: 0 };

      try {
        const ws = db.prepare("SELECT SUM(availableBalance) as a, SUM(pendingBalance) as p, SUM(totalEarned) as e, SUM(totalWithdrawn) as w FROM seller_wallets").get() as any;
        walletStats = { totalAvailable: ws?.a || 0, totalPending: ws?.p || 0, totalEarned: ws?.e || 0, totalWithdrawn: ws?.w || 0 };

        const wr = db.prepare("SELECT COUNT(*) as cnt, SUM(amount) as amt FROM withdrawal_requests WHERE status = 'pending'").get() as any;
        const wc = db.prepare("SELECT SUM(amount) as amt FROM withdrawal_requests WHERE status = 'completed'").get() as any;
        withdrawalStats = { pendingCount: wr?.cnt || 0, pendingAmount: wr?.amt || 0, completedAmount: wc?.amt || 0 };

        const bws = db.prepare("SELECT SUM(balance) as b, SUM(totalDeposited) as d FROM buyer_wallets").get() as any;
        const ptr = db.prepare("SELECT COUNT(*) as cnt, SUM(amount) as amt FROM payment_requests WHERE status = 'pending' AND type='topup'").get() as any;
        buyerWalletStats = { totalCashBalance: bws?.b || 0, totalDeposited: bws?.d || 0, pendingTopups: ptr?.cnt || 0, pendingTopupAmount: ptr?.amt || 0 };

        const inv = db.prepare("SELECT type, SUM(amount) as amt FROM invoices WHERE status = 'unpaid' GROUP BY type").all() as any[];
        inv.forEach(i => {
          if (i.type === 'purchase') receivables.unpaidPurchase = i.amt;
          if (i.type === 'transport') receivables.unpaidTransport = i.amt;
          if (i.type === 'shipping') receivables.unpaidShipping = i.amt;
        });

      } catch (_) { /* tables may not exist in early runs */ }

      res.json({
        pendingUsers,
        pendingCars: pendingCars.map((c: any) => ({ ...c, images: JSON.parse(c.images || '[]') })),
        shipments,
        walletStats,
        withdrawalStats,
        buyerWalletStats,
        receivables
      });
    } catch (e) {
      res.status(500).json({ error: "Summary error" });
    }
  });


  app.get("/api/admin/merchants", requireAdmin, (req, res) => {
    try {
      res.json(db.prepare("SELECT id, firstName, lastName, email, phone, role, status, kycStatus, deposit, buyingPower, commission, manager, office, companyName, country, address1, address2, joinDate FROM users WHERE role = 'seller'").all());
    } catch (e) {
      res.status(500).json({ error: "Merchants error" });
    }
  });

  app.post("/api/admin/cars/:id/review", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { action, reason } = req.body;
    try {
      const status = action === 'approve' ? 'live' : 'rejected';
      db.prepare("UPDATE cars SET status = ? WHERE id = ?").run(status, id);
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (car.sellerId) {
        sendInternalMessage('admin-1', car.sellerId, status === 'live' ? '✅ تمت الموافقة' : '❌ تم الرفض',
          status === 'live' ? `سيارتك ${car.make} ${car.model} الآن في المزاد!` : `عذراً، تم رفض سيارتك.السبب: ${reason} `);
      }
      io.emit("car_updated", { id, status });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Review error" }); }
  });

  // ====== MARKET ESTIMATES ======
  app.get("/api/admin/market-estimates", requireAdmin, (req, res) => {
    try {
      // Pull from the rich libyan_market_prices table (227 cars) — prefer over old empty market_estimates
      const lmpCount: any = db.prepare("SELECT COUNT(*) as c FROM libyan_market_prices").get() as any;
      if ((lmpCount?.c || 0) > 0) {
        const data = db.prepare("SELECT id, make, makeEn, model, modelEn, year, priceLYD as price, condition, transmission, fuel, mileage, lastUpdated FROM libyan_market_prices ORDER BY make ASC, year DESC").all();
        return res.json(data);
      }
      // Fallback to old market_estimates table
      let data;
      try {
        data = db.prepare("SELECT * FROM market_estimates ORDER BY lastUpdated DESC").all();
      } catch (e) {
        data = db.prepare("SELECT * FROM market_estimates ORDER BY rowid DESC").all();
      }
      res.json(data);
    } catch (e) {
      console.error("Market estimates fetch crash:", e);
      res.status(500).json({ error: "Failed to fetch market estimates" });
    }
  });

  app.post("/api/admin/market-estimates", requireAdmin, (req, res) => {
    const { make, model, year, minPrice, maxPrice } = req.body;
    const id = `est - ${Date.now()} `;
    const lastUpdated = new Date().toISOString();
    try {
      db.prepare("INSERT INTO market_estimates (id, make, model, year, minPrice, maxPrice, lastUpdated) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, make, model, year, minPrice, maxPrice, lastUpdated);
      res.json({ id, make, model, year, minPrice, maxPrice, lastUpdated });
    } catch (e) { res.status(500).json({ error: "Failed to create market estimate" }); }
  });

  app.put("/api/admin/market-estimates/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { minPrice, maxPrice } = req.body;
    const lastUpdated = new Date().toISOString();
    try {
      db.prepare("UPDATE market_estimates SET minPrice = ?, maxPrice = ?, lastUpdated = ? WHERE id = ?").run(minPrice, maxPrice, lastUpdated, id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to update market estimate" }); }
  });

  app.delete("/api/admin/market-estimates/:id", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM market_estimates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to delete" }); }
  });

  // ======= REAL ANALYTICS API =======
  app.get("/api/admin/reports-analytics", requireAdmin, (req, res) => {
    try {
      const activeUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get() as any)?.count || 0;
      const totalBids = (db.prepare("SELECT COUNT(*) as count FROM bids").get() as any)?.count || 0;
      const salesVol = (db.prepare("SELECT SUM(amount) as val FROM transactions WHERE status = 'completed' AND type = 'deposit'").get() as any)?.val || 0;
      
      const geoSalesRaw = db.prepare("SELECT u.country, SUM(c.currentBid) as total FROM cars c JOIN users u ON c.winnerId = u.id WHERE c.status = 'closed' GROUP BY u.country").all();
      
      res.json({
        activeUsers,
        totalBids,
        salesVol,
        geoSalesRaw
      });
    } catch(e) { res.status(500).json({ error: "Failed to fetch analytics" }); }
  });

  // ======= LIBYAN MARKET PRICES API =======
  // Combined legacy route to avoid 500 errors
  app.get('/api/reports/libyan-market', async (req, res) => {
    try {
      // Ensure we have a valid sort column
      let prices;
      try {
        prices = db.prepare('SELECT * FROM libyan_market_prices ORDER BY lastUpdated DESC').all();
      } catch (e) {
        prices = db.prepare('SELECT * FROM libyan_market_prices ORDER BY rowid DESC').all();
      }
      res.json(prices);
    } catch (err) {
      console.error('Libyan market report error:', err);
      res.status(500).json({ error: 'Internal Error' });
    }
  });

  // GET /api/libyan-market — full list with smart search, filter, pagination
  app.get("/api/libyan-market", (req, res) => {
    try {
      const { make, model, year, condition, q, page, limit: lim } = req.query;
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(200, parseInt(lim as string) || 200);
      const offset = (pageNum - 1) * pageSize;

      let query = "SELECT * FROM libyan_market_prices WHERE 1=1";
      const params: any[] = [];

      // Smart full-text search (Arabic + English)
      if (q) {
        query += " AND (make LIKE ? OR makeEn LIKE ? OR model LIKE ? OR modelEn LIKE ?)";
        const s = `%${q}%`;
        params.push(s, s, s, s);
      }
      if (make) { query += " AND (make LIKE ? OR makeEn LIKE ?)"; params.push(`%${make}%`, `%${make}%`); }
      if (model) { query += " AND (model LIKE ? OR modelEn LIKE ?)"; params.push(`%${model}%`, `%${model}%`); }
      if (year) { query += " AND year = ?"; params.push(parseInt(year as string)); }
      if (condition) { query += " AND condition = ?"; params.push(condition); }

      const total = (db.prepare(`SELECT COUNT(*) as c FROM libyan_market_prices WHERE 1=1${query.split('WHERE 1=1')[1]}`).get(...params) as any)?.c || 0;
      query += ` ORDER BY make ASC, year DESC, model ASC LIMIT ${pageSize} OFFSET ${offset}`;
      const data: any[] = db.prepare(query).all(...params);

      res.json({ data, total, page: pageNum, pageSize, pages: Math.ceil(total / pageSize) });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/libyan-market — add new car (admin)
  app.post("/api/libyan-market", requireAdmin, (req, res) => {
    try {
      const { condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD } = req.body;
      if (!make || !model || !year) return res.status(400).json({ error: "الماركة والموديل والسنة مطلوبة" });
      const id = `lmp-${Date.now()}`;
      db.prepare(`INSERT INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, condition || 'مستعمل', make, makeEn || make, model, modelEn || model,
        parseInt(year as string), transmission || 'اوتوماتيك', fuel || 'بنزين',
        mileage || '—', priceLYD || null, new Date().toISOString().split('T')[0]);
      const row = db.prepare("SELECT * FROM libyan_market_prices WHERE id = ?").get(id);
      res.json({ success: true, id, row });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/libyan-market/:id — edit car (admin)
  app.put("/api/libyan-market/:id", requireAdmin, (req, res) => {
    try {
      const { condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD } = req.body;
      db.prepare(`UPDATE libyan_market_prices SET
        condition = ?, make = ?, makeEn = ?, model = ?, modelEn = ?,
        year = ?, transmission = ?, fuel = ?, mileage = ?,
        priceLYD = ?, lastUpdated = ?
        WHERE id = ?`
      ).run(condition, make, makeEn || make, model, modelEn || model,
        parseInt(year), transmission, fuel, mileage,
        priceLYD || null, new Date().toISOString().split('T')[0], req.params.id);
      res.json({ success: true });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/libyan-market/:id — delete car (admin)
  app.delete("/api/libyan-market/:id", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM libyan_market_prices WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/admin/libyan-market/reseed — wipe and re-seed from latest data
  app.post("/api/admin/libyan-market/reseed", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM libyan_market_prices").run();
      seedLibyanMarketPrices227();
      const count = (db.prepare("SELECT COUNT(*) as c FROM libyan_market_prices").get() as any)?.c || 0;
      res.json({ success: true, count, message: `تم إعادة تهيئة قاعدة البيانات — ${count} سيارة` });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/libyan-market/match — smart price lookup for a specific car
  app.get("/api/libyan-market/match", (req, res) => {
    try {
      const { make, model, year, condition, exchangeRate } = req.query;
      const rate = parseFloat(exchangeRate as string) || 4.85;
      if (!make || !model) return res.status(400).json({ error: "make and model required" });

      // Best match: exact make+model+year, then fallback to make+model, then make only
      const rows: any[] = db.prepare(`
        SELECT *, ABS(year - ?) as yearDiff
        FROM libyan_market_prices
        WHERE (make LIKE ? OR makeEn LIKE ?) AND (model LIKE ? OR modelEn LIKE ?)
        ORDER BY yearDiff ASC, priceLYD DESC
        LIMIT 5`).all(
          parseInt(year as string) || 2020,
          `%${make}%`, `%${make}%`,
          `%${model}%`, `%${model}%`
        );

      if (rows.length === 0) return res.json({ found: false });

      // Use the best match (closest year)
      const best = rows[0];
      const avgPriceLYD = rows.reduce((s, r) => s + (r.priceLYD || 0), 0) / rows.filter(r => r.priceLYD).length;
      const priceLYD = best.priceLYD || avgPriceLYD;
      const priceUSD = priceLYD / rate;

      res.json({
        found: true,
        priceLYD: Math.round(priceLYD),
        priceUSD: Math.round(priceUSD),
        exchangeRate: rate,
        matchedYear: best.year,
        condition: best.condition,
        make: best.make,
        makeEn: best.makeEn,
        model: best.model,
        modelEn: best.modelEn,
        similarCount: rows.length,
        lastUpdated: best.lastUpdated,
      });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // ====== LIVE AUCTIONS MGMT ======
  app.put("/api/admin/cars/:id/schedule", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { auctionStartTime, auctionEndDate, maxAuctionRetries } = req.body;
    try {
      db.prepare("UPDATE cars SET auctionStartTime = ?, auctionEndDate = ?, maxAuctionRetries = ?, status = 'upcoming' WHERE id = ?")
        .run(auctionStartTime, auctionEndDate, maxAuctionRetries, id);
      io.emit("car_updated", { id, status: 'upcoming', auctionStartTime });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to schedule vehicle" });
    }
  });

  app.post("/api/admin/cars/:id/mark-sold", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { winnerId, soldAmount } = req.body;
    try {
      db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ? WHERE id = ?")
        .run(winnerId, soldAmount, id);
      
      createWinInvoices(winnerId, id, soldAmount);
      io.emit("car_updated", { id, status: 'closed', winnerId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark car as sold" });
    }
  });

  app.get("/api/admin/manage-live-auctions", requireAdmin, (req, res) => {
    try {
      const scheduledCars = db.prepare("SELECT * FROM cars WHERE (status = 'upcoming' AND auctionStartTime IS NOT NULL) OR status = 'live'").all();
      const unscheduledCars = db.prepare("SELECT * FROM cars WHERE status = 'upcoming' AND (auctionStartTime IS NULL OR auctionEndDate IS NULL)").all();
      const offerCars = db.prepare("SELECT * FROM cars WHERE status = 'offer_market' AND sellerCounterPrice IS NULL").all();
      const counterCars = db.prepare("SELECT * FROM cars WHERE status = 'offer_market' AND sellerCounterPrice IS NOT NULL").all();

      const wonCarsRaw = db.prepare(`
        SELECT c.*, 
               u.firstName as winnerFirstName, u.lastName as winnerLastName, u.email as winnerEmail,
               s.firstName as sellerFirstName, s.lastName as sellerLastName, s.companyName as sellerCompanyName,
               a.firstName as accFirstName, a.lastName as accLastName, a.companyName as accCompanyName,
               (SELECT COUNT(*) FROM invoices i WHERE i.carId = c.id AND i.type = 'purchase') as invoiceCreated,
               (SELECT COUNT(*) FROM invoices i WHERE i.carId = c.id AND i.type = 'purchase' AND i.isViewed = 1) as invoiceViewedCount,
               (SELECT COUNT(*) FROM notifications n WHERE n.userId = c.winnerId AND (n.message LIKE '%' || c.make || '%' OR n.title LIKE '%فزت%')) as notifSent
        FROM cars c
        LEFT JOIN users u ON c.winnerId = u.id
        LEFT JOIN users s ON c.sellerId = s.id
        LEFT JOIN users a ON c.acceptedBy = a.id
        WHERE c.status = 'closed'
        ORDER BY c.auctionEndDate DESC
        `).all() as any[];

      const wonCars = wonCarsRaw.map(car => ({
        ...car,
        sellerFullName: car.sellerCompanyName || (car.sellerFirstName ? `${car.sellerFirstName} ${car.sellerLastName}` : 'غير معروف'),
        acceptedByName: car.acceptedBy === 'admin-1' ? 'الإدارة (Admin)' : (car.accCompanyName || (car.accFirstName ? `${car.accFirstName} ${car.accLastName}` : 'تم القبول آلياً')),
        invoiceCreated: car.invoiceCreated > 0,
        invoiceViewed: car.invoiceViewedCount > 0,
        notificationSent: car.notifSent > 0
      }));

      res.json({
        scheduledCars,
        unscheduledCars,
        offerCars,
        counterCars,
        wonCars
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch live auctions management data" });
    }
  });

  // =====================================================================
  // MISSING & ALIAS ROUTES — fix broken endpoints
  // =====================================================================

  // Alias: /api/libyan-market-prices → /api/libyan-market
  app.get("/api/libyan-market-prices", (req, res) => {
    try {
      const { make, model, year, condition } = req.query;
      let q = "SELECT * FROM libyan_market_prices WHERE 1=1";
      const params: any[] = [];
      if (make) { q += " AND (make LIKE ? OR makeEn LIKE ?)"; params.push(`%${make}%`, `%${make}%`); }
      if (model) { q += " AND (model LIKE ? OR modelEn LIKE ?)"; params.push(`%${model}%`, `%${model}%`); }
      if (year) { q += " AND year = ?"; params.push(Number(year)); }
      if (condition) { q += " AND condition = ?"; params.push(condition); }
      q += " ORDER BY priceLYD DESC LIMIT 200";
      const rows = db.prepare(q).all(...params);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: "فشل جلب أسعار السوق" }); }
  });

  // GET /api/cars/:id — single car details
  app.get("/api/cars/:id", (req, res) => {
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(req.params.id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
      // Attach bids
      const bids: any[] = db.prepare(`
        SELECT b.*, u.firstName, u.lastName FROM bids b
        JOIN users u ON b.userId = u.id
        WHERE b.carId = ? ORDER BY b.amount DESC`).all(req.params.id);
      try { car.images = JSON.parse(car.images || '[]'); } catch { car.images = []; }
      res.json({ ...car, bids });
    } catch (e) { res.status(500).json({ error: "فشل جلب تفاصيل السيارة" }); }
  });

  // GET /api/bids/:carId — bids for a car
  app.get("/api/bids/:carId", requireAuth, (req, res) => {
    try {
      const bids: any[] = db.prepare(`
        SELECT b.*, u.firstName, u.lastName, u.avatar
        FROM bids b JOIN users u ON b.userId = u.id
        WHERE b.carId = ? ORDER BY b.amount DESC`).all(req.params.carId);
      res.json(bids);
    } catch (e) { res.status(500).json({ error: "فشل جلب المزايدات" }); }
  });

  // GET /api/offices — list all offices
  app.get("/api/offices", (req, res) => {
    try {
      const offices: any[] = db.prepare("SELECT * FROM offices ORDER BY name ASC").all();
      res.json(offices);
    } catch (e) { res.status(500).json({ error: "فشل جلب المكاتب" }); }
  });

  // GET /api/offices/:id — single office
  app.get("/api/offices/:id", (req, res) => {
    try {
      const office: any = db.prepare("SELECT * FROM offices WHERE id = ?").get(req.params.id);
      if (!office) return res.status(404).json({ error: "المكتب غير موجود" });
      res.json(office);
    } catch (e) { res.status(500).json({ error: "فشل جلب المكتب" }); }
  });

  // POST /api/offices — create office (admin)
  app.post("/api/offices", requireAdmin, (req, res) => {
    try {
      const { name, branchId, manager, phone, email, address, city, country, status } = req.body;
      const id = `office-${Date.now()}`;
      db.prepare(`INSERT INTO offices (id, name, branchId, manager, phone, email, address, city, country, status)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, name, branchId||null, manager||null, phone||null, email||null, address||null, city||null, country||'ليبيا', status||'active');
      res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: "فشل إنشاء المكتب" }); }
  });

  // GET /api/sellers — list all seller users
  app.get("/api/sellers", requireAdmin, (req, res) => {
    try {
      const sellers: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.status, u.kycStatus,
               u.companyName, u.country, u.joinDate,
               sw.availableBalance, sw.pendingBalance, sw.totalEarned, sw.totalWithdrawn,
               COUNT(c.id) as totalCars,
               SUM(CASE WHEN c.status = 'sold' THEN 1 ELSE 0 END) as soldCars
        FROM users u
        LEFT JOIN seller_wallets sw ON sw.sellerId = u.id
        LEFT JOIN cars c ON c.sellerId = u.id
        WHERE u.role IN ('seller','admin')
        GROUP BY u.id
        ORDER BY u.joinDate DESC`).all();
      res.json(sellers);
    } catch (e) { res.status(500).json({ error: "فشل جلب البائعين" }); }
  });

  // Alias: /api/seller-wallet/:id → /api/seller/wallet/:id
  app.get("/api/seller-wallet/:id", requireAuth, (req, res) => {
    try {
      let wallet: any = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(req.params.id);
      if (!wallet) {
        db.prepare(`INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated)
          VALUES (?,0,0,0,0,?)`).run(req.params.id, new Date().toISOString());
        wallet = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(req.params.id);
      }
      const txs: any[] = db.prepare("SELECT * FROM seller_transactions WHERE sellerId = ? ORDER BY createdAt DESC LIMIT 20").all(req.params.id);
      res.json({ ...wallet, transactions: txs });
    } catch (e) { res.status(500).json({ error: "فشل جلب محفظة البائع" }); }
  });

  // GET /api/shipments/:userId — alias for /api/shipments/user/:userId
  app.get("/api/shipments/:userId", requireAuth, (req, res) => {
    const requestingUser = (req as any).user;
    if (requestingUser.id !== req.params.userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.lotNumber, c.vin
        FROM shipments s JOIN cars c ON s.carId = c.id
        WHERE s.userId = ? ORDER BY s.createdAt DESC`).all(req.params.userId);
      res.json(shipments);
    } catch (e) { res.status(500).json({ error: "فشل جلب الشحنات" }); }
  });

  // =====================================================================
  // SELLER JOURNEY ROUTES
  // =====================================================================

  // POST /api/seller/register — seller KYC application
  app.post("/api/seller/register", requireAuth, (req, res) => {
    try {
      const { companyName, tradeLicense, address, city, bankName, iban, phone } = req.body;
      const userId = (req as any).user.id; // Use authenticated user
      db.prepare(`UPDATE users SET role='seller', kycStatus='pending', companyName=?, address1=?, phone=?
        WHERE id=?`).run(companyName||null, address||null, phone||null, userId);
      // Store IBAN for seller wallet
      db.prepare(`INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated, iban, bankName)
        VALUES (?,0,0,0,0,?,?,?) ON CONFLICT(sellerId) DO UPDATE SET iban=excluded.iban, bankName=excluded.bankName`
      ).run(userId, new Date().toISOString(), iban||null, bankName||null);
      sendNotification('admin-1', '🆕 طلب تسجيل بائع جديد',
        `${companyName || userId} يطلب التسجيل كبائع. يرجى مراجعة طلب KYC.`, 'info');
      sendNotification(userId, '✅ تم استلام طلب التسجيل كبائع',
        'جاري مراجعة طلبك. سنُعلمك خلال 24-48 ساعة.', 'info');
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/cars/seller — seller uploads a new car for auction
  app.post("/api/cars/seller", requireAuth, (req, res) => {
    try {
      const { sellerId, make, model, year, vin, mileage, condition, description,
              startingBid, reservePrice, auctionStart, auctionEnd, images, city } = req.body;
      if (!sellerId || !make || !model) return res.status(400).json({ error: "بيانات السيارة غير مكتملة" });

      const seller: any = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'seller'").get(sellerId);
      if (!seller) return res.status(403).json({ error: "غير مصرح — يجب أن تكون بائعاً معتمداً" });
      if (seller.kycStatus !== 'approved') return res.status(403).json({ error: "يجب إكمال التحقق من الهوية أولاً" });

      const lotNumber = `LY-${Date.now().toString(36).toUpperCase()}`;
      const carId = `car-${Date.now()}`;
      const imagesJson = JSON.stringify(images || []);

      db.prepare(`INSERT INTO cars (id, sellerId, lotNumber, make, model, year, vin, mileage, condition,
        description, startingBid, reservePrice, currentBid, auctionStart, auctionEnd, status, images, city, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_approval',?,?,?)`
      ).run(carId, sellerId, lotNumber, make, model, year, vin||null, mileage||0, condition||'used',
        description||null, startingBid||0, reservePrice||0, startingBid||0,
        auctionStart||null, auctionEnd||null, imagesJson, city||null, new Date().toISOString());

      // Notify seller when car is approved (handled in approve-car endpoint)

      sendNotification('admin-1', '🚗 سيارة جديدة بانتظار الموافقة',
        `${seller.firstName} أضاف ${make} ${model} ${year} للمزاد. لوت: ${lotNumber}`, 'info');
      sendNotification(sellerId, '✅ تم رفع السيارة بنجاح',
        `${make} ${model} ${year} (${lotNumber}) تحت المراجعة. سنُعلمك عند الموافقة.`, 'success');

      res.json({ success: true, carId, lotNumber });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/cars/seller/:sellerId — seller's own cars
  app.get("/api/cars/seller/:sellerId", requireAuth, (req, res) => {
    try {
      const cars: any[] = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM bids WHERE carId = c.id) as bidCount,
          (SELECT MAX(amount) FROM bids WHERE carId = c.id) as highestBid
        FROM cars c WHERE c.sellerId = ? ORDER BY c.id DESC`).all(req.params.sellerId);
      cars.forEach(c => { try { c.images = JSON.parse(c.images || '[]'); } catch { c.images = []; } });
      res.json(cars);
    } catch (e) { res.status(500).json({ error: "فشل جلب سيارات البائع" }); }
  });

  // POST /api/seller/payout-request — seller requests withdrawal
  app.post("/api/seller/payout-request", requireAuth, (req, res) => {
    try {
      const { sellerId, amount } = req.body;
      if (!sellerId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const wallet: any = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(sellerId);
      if (!wallet) return res.status(404).json({ error: "محفظة البائع غير موجودة" });
      if (wallet.availableBalance < amount) return res.status(400).json({ error: `الرصيد المتاح $${wallet.availableBalance} غير كافٍ` });

      const reqId = `pr-seller-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, status, requestedAt)
        VALUES (?,?,?,?,'bank_transfer','pending',?)`).run(reqId, sellerId, 'withdrawal', amount, new Date().toISOString());
      db.prepare("UPDATE seller_wallets SET availableBalance = availableBalance - ?, pendingBalance = pendingBalance + ? WHERE sellerId = ?")
        .run(amount, amount, sellerId);

      sendNotification('admin-1', '💰 طلب سحب رصيد بائع',
        `البائع ${sellerId} يطلب سحب $${Number(amount).toLocaleString()}`, 'info');
      sendNotification(sellerId, '✅ تم إرسال طلب السحب',
        `طلب سحب $${Number(amount).toLocaleString()} قيد المراجعة. سيُحوَّل خلال 3-5 أيام عمل.`, 'info');

      res.json({ success: true, requestId: reqId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // MARKETING & CRM ROUTES
  // =====================================================================

  // GET /api/marketing/leads — all captured leads
  app.get("/api/marketing/leads", requireAdmin, (req, res) => {
    try {
      const leads: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.country, u.joinDate,
               u.status, u.kycStatus, u.role,
               (SELECT COUNT(*) FROM bids WHERE userId = u.id) as totalBids,
               (SELECT COUNT(*) FROM bids WHERE userId = u.id AND amount > 0) as activeBids,
               u.deposit,
               COALESCE(bw.balance, 0) as walletBalance,
               CASE
                 WHEN u.deposit > 0 THEN 'hot'
                 WHEN (SELECT COUNT(*) FROM bids WHERE userId = u.id) > 0 THEN 'warm'
                 ELSE 'cold'
               END as leadStatus
        FROM users u
        LEFT JOIN buyer_wallets bw ON bw.userId = u.id
        WHERE u.role NOT IN ('admin')
        ORDER BY u.joinDate DESC`).all();
      res.json(leads);
    } catch (e) { res.status(500).json({ error: "فشل جلب العملاء المحتملين" }); }
  });

  // GET /api/crm/customers — full CRM customer list
  app.get("/api/crm/customers", requireAdmin, (req, res) => {
    try {
      const customers: any[] = db.prepare(`
        SELECT u.id, u.firstName, u.lastName, u.email, u.phone, u.country, u.joinDate,
               u.status, u.kycStatus, u.role, u.deposit, u.buyingPower,
               COALESCE(bw.balance, 0) as walletBalance,
               COALESCE(bw.totalDeposited, 0) as totalDeposited,
               COALESCE(bw.totalSpent, 0) as totalSpent,
               (SELECT COUNT(*) FROM bids WHERE userId = u.id) as totalBids,
               (SELECT MAX(amount) FROM bids WHERE userId = u.id) as highestBid,
               (SELECT COUNT(*) FROM bids b2 JOIN cars c ON b2.carId = c.id WHERE b2.userId = u.id AND c.status = 'sold') as wonAuctions
        FROM users u
        LEFT JOIN buyer_wallets bw ON bw.userId = u.id
        ORDER BY totalDeposited DESC`).all();
      res.json(customers);
    } catch (e) { res.status(500).json({ error: "فشل جلب بيانات CRM" }); }
  });

  // POST /api/crm/send-message — broadcast message to customer segment
  app.post("/api/crm/send-message", requireAdmin, (req, res) => {
    try {
      const { segment, subject, content, adminId } = req.body;
      if (!subject || !content) return res.status(400).json({ error: "الموضوع والمحتوى مطلوبان" });

      let userQuery = "SELECT id, firstName, email FROM users WHERE role NOT IN ('admin')";
      if (segment === 'hot') userQuery += " AND deposit > 0";
      else if (segment === 'warm') userQuery += " AND id IN (SELECT DISTINCT userId FROM bids)";
      else if (segment === 'cold') userQuery += " AND deposit = 0 AND id NOT IN (SELECT DISTINCT userId FROM bids)";
      else if (segment === 'kyc_pending') userQuery += " AND kycStatus = 'pending'";
      else if (segment === 'no_deposit') userQuery += " AND deposit = 0";

      const users: any[] = db.prepare(userQuery).all();
      let sent = 0;
      users.forEach((u: any) => {
        sendInternalMessage(adminId || 'admin-1', u.id, subject, content);
        sent++;
      });

      res.json({ success: true, sent, segment });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/send-notification — broadcast notification
  app.post("/api/crm/send-notification", requireAdmin, (req, res) => {
    try {
      const { segment, title, message, type, link } = req.body;
      if (!title || !message) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });

      let userQuery = "SELECT id FROM users WHERE role NOT IN ('admin')";
      if (segment === 'hot') userQuery += " AND deposit > 0";
      else if (segment === 'warm') userQuery += " AND id IN (SELECT DISTINCT userId FROM bids)";
      else if (segment === 'cold') userQuery += " AND deposit = 0";
      else if (segment === 'all_buyers') userQuery += "";

      const users: any[] = db.prepare(userQuery).all();
      users.forEach((u: any) => sendNotification(u.id, title, message, type || 'info', link));

      res.json({ success: true, sent: users.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // ADMIN REPORTS & ACCOUNTING
  // =====================================================================

  // GET /api/admin/reports — comprehensive financial report
  app.get("/api/admin/reports", requireAdmin, (req, res) => {
    try {
      const { from, to } = req.query;
      // SAFE: parameterized queries to prevent SQL injection
      const hasDateRange = from && to;

      // Read commission rate from system_settings (consistent with platform_commission_rate)
      const commRateSetting: any = db.prepare("SELECT value FROM system_settings WHERE key = 'platform_commission_rate'").get();
      const commRate = parseFloat(commRateSetting?.value) || 0.07;

      const totalRevenue = hasDateRange
        ? (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed' AND timestamp BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed'").get() as any)?.v || 0;
      const totalCommission = hasDateRange
        ? (db.prepare("SELECT SUM(amount * ?) as v FROM transactions WHERE type='commission' AND status='completed' AND timestamp BETWEEN ? AND ?").get(commRate, from, to) as any)?.v || 0
        : (db.prepare("SELECT SUM(amount * ?) as v FROM transactions WHERE type='commission' AND status='completed'").get(commRate) as any)?.v || 0;
      const totalDeposits = hasDateRange
        ? (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed' AND timestamp BETWEEN ? AND ?").get(from, to) as any)
        : (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed'").get() as any);
      const pendingDeposits = (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM transactions WHERE type='deposit' AND status='pending'").get() as any);
      const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role NOT IN ('admin')").get() as any)?.c || 0;
      const newUsers = from
        ? (db.prepare("SELECT COUNT(*) as c FROM users WHERE role NOT IN ('admin') AND joinDate >= ?").get(from) as any)?.c || 0
        : totalUsers;
      const totalBids = (db.prepare("SELECT COUNT(*) as c, SUM(amount) as v FROM bids").get() as any);
      const activeCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'live'").get() as any)?.c || 0;
      const soldCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'sold'").get() as any)?.c || 0;
      const pendingCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'pending'").get() as any)?.c || 0;
      const totalSellers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'seller'").get() as any)?.c || 0;
      const sellerPayouts = (db.prepare("SELECT SUM(amount) as v FROM payment_requests WHERE type='withdrawal' AND status='approved'").get() as any)?.v || 0;

      // Monthly breakdown (last 6 months)
      const monthly = db.prepare(`
        SELECT strftime('%Y-%m', timestamp) as month,
               COUNT(*) as count, SUM(amount) as total
        FROM transactions WHERE type='deposit' AND status='completed'
        GROUP BY month ORDER BY month DESC LIMIT 6`).all();

      // Top buyers
      const topBuyers = db.prepare(`
        SELECT u.firstName, u.lastName, u.email,
               COUNT(b.id) as bidCount, MAX(b.amount) as maxBid, u.deposit
        FROM users u JOIN bids b ON b.userId = u.id
        GROUP BY u.id ORDER BY bidCount DESC LIMIT 10`).all();

      // Top cars by bids
      const topCars = db.prepare(`
        SELECT c.make, c.model, c.year, c.lotNumber,
               COUNT(b.id) as bidCount, MAX(b.amount) as currentBid, c.status
        FROM cars c JOIN bids b ON b.carId = c.id
        GROUP BY c.id ORDER BY bidCount DESC LIMIT 10`).all();

      res.json({
        summary: {
          totalRevenue, totalCommission, sellerPayouts,
          totalDeposits: totalDeposits?.v || 0, depositCount: totalDeposits?.c || 0,
          pendingDepositAmount: pendingDeposits?.v || 0, pendingDepositCount: pendingDeposits?.c || 0,
          totalUsers, newUsers, totalSellers,
          totalBidVolume: totalBids?.v || 0, totalBidCount: totalBids?.c || 0,
          activeCars, soldCars, pendingCars,
        },
        monthly,
        topBuyers,
        topCars,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/admin/audit-log — security & action audit trail
  app.get("/api/admin/audit-log", requireAdmin, (req, res) => {
    try {
      // Synthesize audit log from existing data
      const bids: any[] = db.prepare(`
        SELECT 'bid' as action, b.timestamp, u.firstName || ' ' || u.lastName as actor,
               u.email, 'مزايدة بمبلغ $' || b.amount as detail, b.carId as ref
        FROM bids b JOIN users u ON b.userId = u.id
        ORDER BY b.timestamp DESC LIMIT 50`).all();

      const deposits: any[] = db.prepare(`
        SELECT 'deposit' as action, t.timestamp, u.firstName || ' ' || u.lastName as actor,
               u.email, 'إيداع عربون $' || t.amount || ' (' || t.status || ')' as detail, t.id as ref
        FROM transactions t JOIN users u ON t.userId = u.id
        WHERE t.type = 'deposit'
        ORDER BY t.timestamp DESC LIMIT 50`).all();

      const registrations: any[] = db.prepare(`
        SELECT 'register' as action, joinDate as timestamp,
               firstName || ' ' || lastName as actor, email,
               'تسجيل حساب جديد' as detail, id as ref
        FROM users ORDER BY joinDate DESC LIMIT 30`).all();

      const combined = [...bids, ...deposits, ...registrations]
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 100);

      res.json(combined);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // ACCOUNTING — Commissions & Payouts
  // =====================================================================

  // POST /api/admin/commission — record commission on sold car
  app.post("/api/admin/commission", requireAdmin, (req, res) => {
    try {
      const { carId, sellerId, saleAmount, commissionRate } = req.body;
      // Read default from system_settings if not provided in request
      const defaultRate: any = db.prepare("SELECT value FROM system_settings WHERE key = 'platform_commission_rate'").get();
      const rate = commissionRate || parseFloat(defaultRate?.value) || 0.07;
      const commission = saleAmount * rate;
      const sellerNet = saleAmount - commission;

      const txId = `comm-${Date.now()}`;
      db.prepare(`INSERT INTO transactions (id, userId, amount, type, status, method, notes, timestamp)
        VALUES (?,'admin-1',?,'commission','completed','system',?,?)`
      ).run(txId, commission, `عمولة بيع ${carId} — ${(rate * 100).toFixed(1)}%`, new Date().toISOString());

      // Credit seller wallet (net amount)
      db.prepare(`INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated)
        VALUES (?,?,0,?,0,?) ON CONFLICT(sellerId) DO UPDATE SET
        availableBalance = availableBalance + ?,
        totalEarned = totalEarned + ?,
        lastUpdated = ?`).run(sellerId, sellerNet, sellerNet, new Date().toISOString(), sellerNet, sellerNet, new Date().toISOString());

      // Record seller transaction
      const stxId = `stx-${Date.now()}`;
      db.prepare(`INSERT INTO seller_transactions (id, sellerId, type, amount, description, createdAt)
        VALUES (?,?,'credit',?,?,?)`).run(stxId, sellerId, sellerNet, `مستحقات بيع السيارة ${carId} (بعد خصم ${(rate*100).toFixed(1)}% عمولة)`, new Date().toISOString());

      sendNotification(sellerId, '💰 تم إضافة مستحقات البيع',
        `تم إضافة $${sellerNet.toLocaleString()} لمحفظتك (بعد خصم عمولة ${(rate*100).toFixed(1)}%). يمكنك طلب السحب الآن.`, 'success', '/dashboard/seller');

      res.json({ success: true, commission, sellerNet, txId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/admin/approve-seller-withdrawal/:reqId
  app.post("/api/admin/approve-seller-withdrawal/:reqId", requireAdmin, (req, res) => {
    try {
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ? AND status = 'pending'").get(req.params.reqId);
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });

      db.transaction(() => {
        db.prepare("UPDATE payment_requests SET status='approved', processedAt=? WHERE id=?").run(new Date().toISOString(), req.params.reqId);
        db.prepare("UPDATE seller_wallets SET pendingBalance = pendingBalance - ?, totalWithdrawn = totalWithdrawn + ? WHERE sellerId=?").run(pr.amount, pr.amount, pr.userId);
        const stxId = `stx-out-${Date.now()}`;
        db.prepare(`INSERT INTO seller_transactions (id, sellerId, type, amount, description, createdAt)
          VALUES (?,?,'debit',?,?,?)`).run(stxId, pr.userId, pr.amount, `سحب رصيد — تحويل بنكي`, new Date().toISOString());
      })();

      sendNotification(pr.userId, '✅ تمت الموافقة على طلب السحب',
        `تمت الموافقة على سحب $${Number(pr.amount).toLocaleString()}. سيصل التحويل خلال 3-5 أيام عمل.`, 'success');

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/admin/seller-payouts — pending seller withdrawal requests
  app.get("/api/admin/seller-payouts", requireAdmin, (req, res) => {
    try {
      const payouts: any[] = db.prepare(`
        SELECT pr.*, u.firstName, u.lastName, u.email, u.companyName,
               sw.availableBalance, sw.totalEarned, sw.iban, sw.bankName
        FROM payment_requests pr
        JOIN users u ON pr.userId = u.id
        LEFT JOIN seller_wallets sw ON sw.sellerId = pr.userId
        WHERE pr.type = 'withdrawal'
        ORDER BY CASE pr.status WHEN 'pending' THEN 0 ELSE 1 END, pr.requestedAt DESC`).all();
      res.json(payouts);
    } catch (e) { res.status(500).json({ error: "فشل جلب طلبات السحب" }); }
  });

  // GET /api/admin/financial-summary — balance sheet for admin
  app.get("/api/admin/financial-summary", requireAdmin, (req, res) => {
    try {
      const buyerDeposits = (db.prepare("SELECT SUM(balance) as v FROM buyer_wallets").get() as any)?.v || 0;
      const sellerAvailable = (db.prepare("SELECT SUM(availableBalance) as v FROM seller_wallets").get() as any)?.v || 0;
      const sellerPending = (db.prepare("SELECT SUM(pendingBalance) as v FROM seller_wallets").get() as any)?.v || 0;
      const totalCommission = (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='commission' AND status='completed'").get() as any)?.v || 0;
      const totalDepositIn = (db.prepare("SELECT SUM(amount) as v FROM transactions WHERE type='deposit' AND status='completed'").get() as any)?.v || 0;
      const pendingWithdrawals = (db.prepare("SELECT SUM(amount) as v FROM payment_requests WHERE type='withdrawal' AND status='pending'").get() as any)?.v || 0;
      const approvedWithdrawals = (db.prepare("SELECT SUM(amount) as v FROM payment_requests WHERE type='withdrawal' AND status='approved'").get() as any)?.v || 0;
      const unpaidInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='unpaid'").get() as any)?.v || 0;
      const paidInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='paid'").get() as any)?.v || 0;

      res.json({
        assets: { buyerDeposits, totalDepositIn },
        liabilities: { sellerAvailable, sellerPending, pendingWithdrawals },
        revenue: { totalCommission, paidInvoices },
        pending: { pendingWithdrawals, unpaidInvoices },
        paid: { approvedWithdrawals },
        netPosition: totalDepositIn - sellerAvailable - sellerPending - approvedWithdrawals,
      });
    } catch (e) { res.status(500).json({ error: "فشل جلب الملخص المالي" }); }
  });

  // =====================================================================
  // SECURITY: Auth guard helper & rate limiting tracking
  // =====================================================================

  // GET /api/admin/security-log — failed logins & suspicious activity
  app.get("/api/admin/security-log", requireAdmin, (req, res) => {
    try {
      // Return recent user activity synthesized from DB
      const recentLogins: any[] = db.prepare(`
        SELECT id, firstName, lastName, email, lastLogin, status, country
        FROM users ORDER BY lastLogin DESC LIMIT 50`).all();
      const suspiciousUsers = recentLogins.filter((u: any) => u.status === 'suspended' || u.status === 'blocked');
      res.json({ recentLogins, suspiciousUsers, total: recentLogins.length });
    } catch (e) { res.status(500).json({ error: "فشل جلب سجل الأمان" }); }
  });

  // =====================================================================
  // CALCULATOR & SHIPPING RATES
  // =====================================================================

  // GET /api/shipping-rates — shipping cost estimates by destination
  app.get("/api/shipping-rates", (req, res) => {
    const rates = [
      { destination: 'طرابلس (ميناء)', port: 'TIP', usd: 1800, estimatedDays: 21 },
      { destination: 'بنغازي (ميناء)', port: 'BEN', usd: 1950, estimatedDays: 25 },
      { destination: 'مصراتة (ميناء)', port: 'MIS', usd: 1750, estimatedDays: 20 },
      { destination: 'درنة (ميناء)', port: 'DRN', usd: 2100, estimatedDays: 28 },
      { destination: 'الزاوية (ميناء)', port: 'ZAW', usd: 1820, estimatedDays: 22 },
    ];
    res.json(rates);
  });

  // POST /api/calculator/estimate — full landed cost
  app.post("/api/calculator/estimate", (req, res) => {
    try {
      const { carPrice, year, destination, exchangeRate } = req.body;
      const rate = exchangeRate || GLOBAL_EXCHANGE_RATE || 4.85;
      const destinationRates: Record<string, number> = {
        TIP: 1800, BEN: 1950, MIS: 1750, DRN: 2100, ZAW: 1820
      };
      const shippingUSD = destinationRates[destination] || 1800;
      const auctionFee = carPrice * 0.04;
      const portFee = 350;
      const insuranceFee = carPrice * 0.012;
      const customsDuty = (carPrice + shippingUSD) * 0.05; // 5% customs
      const totalUSD = carPrice + shippingUSD + auctionFee + portFee + insuranceFee;
      const totalWithCustomsUSD = totalUSD + customsDuty;
      const totalLYD = totalWithCustomsUSD * rate;

      res.json({
        carPrice, shippingUSD, auctionFee, portFee, insuranceFee,
        customsDuty, totalUSD, totalWithCustomsUSD, totalLYD,
        exchangeRate: rate,
        breakdown: [
          { label: 'سعر السيارة', usd: carPrice },
          { label: 'تكلفة الشحن', usd: shippingUSD },
          { label: 'رسوم المزاد (4%)', usd: auctionFee },
          { label: 'رسوم الميناء', usd: portFee },
          { label: 'تأمين (1.2%)', usd: insuranceFee },
          { label: 'جمارك (5%)', usd: customsDuty },
        ]
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // ====== FORGOT / RESET PASSWORD ======
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

  // =====================================================================
  // EXPENSES API (real operational cost tracking)
  // =====================================================================
  app.get("/api/admin/expenses", requireAdmin, (_req, res) => {
    try {
      const expenses = db.prepare("SELECT * FROM expenses ORDER BY date DESC").all();
      res.json(expenses);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/expenses", requireAdmin, (req, res) => {
    try {
      const { category, description, amount, currency, date } = req.body;
      if (!category || !description || !amount || !date) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة" });
      }
      const id = `exp-${Date.now()}`;
      db.prepare("INSERT INTO expenses (id, category, description, amount, currency, date, addedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, category, description, Number(amount), currency || 'USD', date, (req as any).user?.id || 'admin', new Date().toISOString());
      res.json({ id, category, description, amount: Number(amount), currency: currency || 'USD', date });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/expenses/:id", requireAdmin, (req, res) => {
    try {
      db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // CRM NOTES (customer interaction history)
  // =====================================================================
  app.get("/api/crm/notes/:userId", requireAdmin, (req, res) => {
    try {
      const notes = db.prepare("SELECT n.*, u.firstName || ' ' || u.lastName as addedByName FROM crm_notes n LEFT JOIN users u ON n.addedBy = u.id WHERE n.userId = ? ORDER BY n.createdAt DESC").all(req.params.userId);
      res.json(notes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm/notes", requireAdmin, (req, res) => {
    try {
      const { userId, note } = req.body;
      if (!userId || !note) return res.status(400).json({ error: "مطلوب" });
      const id = `note-${Date.now()}`;
      db.prepare("INSERT INTO crm_notes (id, userId, note, addedBy, createdAt) VALUES (?, ?, ?, ?, ?)")
        .run(id, userId, note, (req as any).user?.id || 'admin', new Date().toISOString());
      res.json({ id, userId, note, createdAt: new Date().toISOString() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // CRM — update customer lead status manually
  // =====================================================================
  app.post("/api/crm/update-status", requireAdmin, (req, res) => {
    try {
      const { userId, status } = req.body;
      if (!userId || !status) return res.status(400).json({ error: "مطلوب" });
      try { db.exec("ALTER TABLE users ADD COLUMN crmStatus TEXT"); } catch (_) { }
      db.prepare("UPDATE users SET crmStatus = ? WHERE id = ?").run(status, userId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // SHIPMENT — add tracking number + details
  // =====================================================================
  app.post("/api/admin/shipments/:id/tracking", requireAdmin, (req, res) => {
    try {
      const { trackingNumber, shippingLine, containerNumber, eta } = req.body;
      try { db.exec("ALTER TABLE shipments ADD COLUMN trackingNumber TEXT"); } catch (_) { }
      try { db.exec("ALTER TABLE shipments ADD COLUMN shippingLine TEXT"); } catch (_) { }
      try { db.exec("ALTER TABLE shipments ADD COLUMN containerNumber TEXT"); } catch (_) { }
      try { db.exec("ALTER TABLE shipments ADD COLUMN eta TEXT"); } catch (_) { }
      db.prepare("UPDATE shipments SET trackingNumber = ?, shippingLine = ?, containerNumber = ?, eta = ? WHERE id = ?")
        .run(trackingNumber || null, shippingLine || null, containerNumber || null, eta || null, req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // FINANCIAL — income statement / profit & loss
  // =====================================================================
  app.get("/api/admin/income-statement", requireAdmin, (req, res) => {
    try {
      const { from, to } = req.query;
      const hasRange = from && to;

      const commissions = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE type='commission' AND status='completed' AND timestamp BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM transactions WHERE type='commission' AND status='completed'").get() as any)?.v || 0;

      const paidInvoices = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status='paid' AND paidAt BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status='paid'").get() as any)?.v || 0;

      const totalExpenses = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE date BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM expenses").get() as any)?.v || 0;

      const expensesByCategory = hasRange
        ? db.prepare("SELECT category, SUM(amount) as total FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC").all(from, to)
        : db.prepare("SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC").all();

      const sellerPayouts = hasRange
        ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM payment_requests WHERE type='withdrawal' AND status='approved' AND updatedAt BETWEEN ? AND ?").get(from, to) as any)?.v || 0
        : (db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM payment_requests WHERE type='withdrawal' AND status='approved'").get() as any)?.v || 0;

      const totalRevenue = commissions + paidInvoices;
      const totalCosts = totalExpenses + sellerPayouts;
      const netProfit = totalRevenue - totalCosts;

      res.json({
        revenue: { commissions, paidInvoices, total: totalRevenue },
        costs: { expenses: totalExpenses, sellerPayouts, total: totalCosts },
        expensesByCategory,
        netProfit,
        profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0'
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ======= MISSING ENDPOINTS =======

  // 4a) POST /api/upload/media — engine sound + inspection PDF upload
  // mediaDir already created at startup above

  const mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, `media_${unique}${ext}`);
    }
  });
  const uploadMedia = multer({
    storage: mediaStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Only audio and PDF files allowed'));
    }
  });

  app.post('/api/upload/media', requireAuth, (uploadMedia.single('media') as any), ((req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
      const url = `/uploads/media/${req.file.filename}`;
      res.json({ success: true, url, filename: req.file.filename });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'فشل رفع الملف' });
    }
  }) as any);

  // 4b) PUT /api/cars/:id — update existing car
  app.put("/api/cars/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const {
      make, model, year, vin, lotNumber, location,
      odometer, primaryDamage, titleType, engine, drive,
      transmission, status, auctionEndDate, images,
      buyItNow, startPrice, currentBid, reservePrice, sellerId, currency,
      acceptOffers, videoUrl, inspectionPdf,
      trim, mileageUnit, engineSize, horsepower, drivetrain, fuelType,
      exteriorColor, interiorColor, secondaryDamage, keys, runsDrives, notes,
      actualOdometer, cylinders, auctionLane, showroomName, saleStatus,
      locationDetails, exchangeRate, minPrice, specialNote, buyNowPrice,
      acceptedOfferPercentage, youtubeVideoUrl, engineSoundUrl, inspectionReportUrl
    } = req.body;

    try {
      const existing: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!existing) return res.status(404).json({ error: "السيارة غير موجودة" });

      db.prepare(`
        UPDATE cars SET
          make = ?, model = ?, year = ?, vin = ?, lotNumber = ?,
          odometer = ?, engine = ?, transmission = ?, drive = ?, fuelType = ?,
          reservePrice = ?, images = ?, videoUrl = ?, inspectionPdf = ?,
          sellerId = ?, currency = ?, acceptOffers = ?, notes = ?,
          exteriorColor = ?, interiorColor = ?, keys = ?, runsDrives = ?,
          location = ?, primaryDamage = ?, secondaryDamage = ?, titleType = ?,
          buyItNow = ?, trim = ?, mileageUnit = ?, engineSize = ?, horsepower = ?,
          drivetrain = ?, auctionEndDate = ?
        WHERE id = ?
      `).run(
        make ?? existing.make, model ?? existing.model, year ?? existing.year,
        vin ?? existing.vin, lotNumber ?? existing.lotNumber,
        odometer ?? existing.odometer, engine ?? existing.engine,
        transmission ?? existing.transmission, drive ?? existing.drive,
        fuelType ?? existing.fuelType, reservePrice ?? existing.reservePrice,
        JSON.stringify(images || JSON.parse(existing.images || '[]')),
        videoUrl ?? youtubeVideoUrl ?? existing.videoUrl,
        inspectionPdf ?? inspectionReportUrl ?? existing.inspectionPdf,
        sellerId ?? existing.sellerId, currency ?? existing.currency,
        acceptOffers !== undefined ? (acceptOffers ? 1 : 0) : existing.acceptOffers,
        notes ?? specialNote ?? existing.notes,
        exteriorColor ?? existing.exteriorColor, interiorColor ?? existing.interiorColor,
        keys ?? existing.keys, runsDrives ?? existing.runsDrives,
        location ?? locationDetails ?? existing.location,
        primaryDamage ?? existing.primaryDamage, secondaryDamage ?? existing.secondaryDamage,
        titleType ?? existing.titleType, buyItNow ?? buyNowPrice ?? existing.buyItNow,
        trim ?? existing.trim, mileageUnit ?? existing.mileageUnit,
        engineSize ?? existing.engineSize, horsepower ?? existing.horsepower,
        drivetrain ?? existing.drivetrain, auctionEndDate ?? existing.auctionEndDate,
        id
      );

      res.json({ success: true, id });
    } catch (e: any) {
      console.error('Car update error:', e);
      res.status(400).json({ error: e.message || "فشل تحديث السيارة" });
    }
  });

  // 4c) POST /api/kyc/upload — KYC document upload for buyers
  // kycDir already created at startup above

  const kycStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, kycDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `kyc_${unique}${ext}`);
    }
  });
  const uploadKyc = multer({
    storage: kycStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only images and PDFs allowed'));
    }
  });

  app.post('/api/kyc/upload', requireAuth, (uploadKyc.single('document') as any), ((req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
      const { userId, docType } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId مطلوب' });

      const docId = `kyc-${Date.now()}`;
      const url = `/uploads/kyc/${req.file.filename}`;

      db.prepare(`INSERT INTO kyc_documents (id, userId, docType, filename, url, status, uploadedAt)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(docId, userId, docType || 'identity', req.file.originalname, url, new Date().toISOString());

      res.json({ success: true, id: docId, url });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'فشل رفع مستند KYC' });
    }
  }) as any);

  // 4d) POST /api/invoices/:id/cancel-transport — cancel transport invoice (buyer self-pickup)
  app.post("/api/invoices/:id/cancel-transport", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const invoice: any = db.prepare("SELECT * FROM invoices WHERE id = ? AND type = 'transport'").get(id);
      if (!invoice) return res.status(404).json({ error: "فاتورة النقل غير موجودة" });

      db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(id);

      // Update associated shipment if exists
      try {
        db.prepare("UPDATE shipments SET status = 'self_pickup' WHERE carId = ? AND userId = ?").run(invoice.carId, invoice.userId);
      } catch (_) {}

      res.json({ success: true, message: "تم إلغاء فاتورة النقل — استلام ذاتي" });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل إلغاء فاتورة النقل" });
    }
  });

  // 4e) PUT /api/invoices/:id/view — mark invoice as viewed
  app.put("/api/invoices/:id/view", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE invoices SET viewedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "فشل تحديث حالة المشاهدة" });
    }
  });

  // 4f) GET /api/seller/invoices/:sellerId — invoices for cars sold by this seller
  app.get("/api/seller/invoices/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    try {
      const invoices: any[] = db.prepare(`
        SELECT i.*, c.make, c.model, c.year, c.lotNumber, c.images,
          u.firstName as buyerFirstName, u.lastName as buyerLastName
        FROM invoices i
        INNER JOIN cars c ON i.carId = c.id
        LEFT JOIN users u ON i.userId = u.id
        WHERE c.sellerId = ?
        ORDER BY i.timestamp DESC
      `).all(sellerId);
      invoices.forEach(inv => { try { inv.images = JSON.parse(inv.images || '[]'); } catch { inv.images = []; } });
      res.json(invoices);
    } catch (e: any) {
      res.status(500).json({ error: "فشل جلب فواتير البائع" });
    }
  });

  // 4g) GET /api/invoices/car/:carId — invoices for a specific car
  app.get("/api/invoices/car/:carId", requireAuth, (req, res) => {
    const { carId } = req.params;
    try {
      const invoices: any[] = db.prepare("SELECT * FROM invoices WHERE carId = ? ORDER BY timestamp DESC").all(carId);
      res.json(invoices);
    } catch (e: any) {
      res.status(500).json({ error: "فشل جلب فواتير السيارة" });
    }
  });

  // 4h) POST /api/cars/:id/reschedule — reschedule unsold car back to upcoming
  app.post("/api/cars/:id/reschedule", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      const { newAuctionEnd } = req.body;
      db.prepare("UPDATE cars SET status = 'upcoming', auctionEndDate = ?, currentBid = 0, winnerId = NULL WHERE id = ?")
        .run(newAuctionEnd || '', id);
      io.emit("car_updated", { id, status: 'upcoming' });
      res.json({ success: true, message: "تمت إعادة جدولة السيارة" });
    } catch (e: any) {
      res.status(500).json({ error: "فشل إعادة الجدولة" });
    }
  });

  // 4i) POST /api/cars/:id/notify-winner — send notification to the winner to pay
  app.post("/api/cars/:id/notify-winner", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
      if (!car.winnerId) return res.status(400).json({ error: "لا يوجد فائز لهذه السيارة" });

      sendNotification(car.winnerId,
        'تهانينا! فزت بالمزاد',
        `لقد فزت بالمزاد على ${car.make} ${car.model} (${car.year || ''}) بمبلغ $${(car.currentBid || 0).toLocaleString()}. يرجى إتمام الدفع خلال 7 أيام.`,
        'success', `/dashboard/user`
      );

      res.json({ success: true, message: "تم إرسال إشعار الدفع للفائز" });
    } catch (e: any) {
      res.status(500).json({ error: "فشل إرسال الإشعار" });
    }
  });

  // 8) GET /api/seller/offer-market-cars/:sellerId — seller's offer market cars
  app.get("/api/seller/offer-market-cars/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'offer_market' AND sellerId = ?").all(sellerId);
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سيارات سوق العروض" });
    }
  });

  // =====================================================================
  // PUBLIC API — للمواقع الخارجية لعرض سيارات أوتو برو
  // =====================================================================

  // API Key validation middleware
  const validateApiKey = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return res.status(401).json({ error: 'API key required', docs: `${SITE_URL}/api/v1/docs` });

    const validKey: any = db.prepare("SELECT * FROM api_keys WHERE key = ? AND active = 1").get(apiKey);
    if (!validKey) return res.status(403).json({ error: 'Invalid or disabled API key' });

    // Track usage
    db.prepare("UPDATE api_keys SET usageCount = usageCount + 1, lastUsedAt = ? WHERE key = ?")
      .run(new Date().toISOString(), apiKey);

    req.apiClient = validKey;
    next();
  };

  // ── PUBLIC API v1 ──

  // API Documentation
  app.get("/api/v1/docs", (_req, res) => {
    res.json({
      name: "AutoPro Libya Public API",
      version: "1.0",
      description: "عرض سيارات مزادات أوتو برو على موقعك",
      baseUrl: `${SITE_URL}/api/v1`,
      authentication: "أضف X-API-KEY في الـ header أو ?api_key= في الرابط",
      endpoints: {
        "GET /api/v1/cars": "قائمة السيارات المتاحة (مع فلاتر)",
        "GET /api/v1/cars/:id": "تفاصيل سيارة واحدة",
        "GET /api/v1/cars/live": "السيارات في المزاد المباشر الآن",
        "GET /api/v1/cars/upcoming": "السيارات القادمة للمزاد",
        "GET /api/v1/cars/offers": "سيارات سوق العروض",
        "GET /api/v1/stats": "إحصائيات المنصة",
        "GET /api/v1/market-prices": "أسعار السوق الليبي"
      },
      filters: {
        make: "الماركة (Toyota, BMW...)",
        model: "الموديل",
        year_min: "أقل سنة",
        year_max: "أعلى سنة",
        price_min: "أقل سعر",
        price_max: "أعلى سعر",
        status: "الحالة (live, upcoming, offer_market, closed)",
        limit: "عدد النتائج (افتراضي 20، أقصى 100)",
        offset: "بداية النتائج (للـ pagination)"
      },
      example: `curl -H "X-API-KEY: YOUR_KEY" ${SITE_URL}/api/v1/cars?make=Toyota&limit=10`,
      rateLimit: "1000 طلب/ساعة"
    });
  });

  // List cars with filters
  app.get("/api/v1/cars", validateApiKey, (req, res) => {
    try {
      const { make, model, year_min, year_max, price_min, price_max, status, limit, offset, sort } = req.query;

      let where = "WHERE 1=1";
      const params: any[] = [];

      if (make) { where += " AND LOWER(c.make) LIKE ?"; params.push(`%${(make as string).toLowerCase()}%`); }
      if (model) { where += " AND LOWER(c.model) LIKE ?"; params.push(`%${(model as string).toLowerCase()}%`); }
      if (year_min) { where += " AND c.year >= ?"; params.push(Number(year_min)); }
      if (year_max) { where += " AND c.year <= ?"; params.push(Number(year_max)); }
      if (price_min) { where += " AND c.currentBid >= ?"; params.push(Number(price_min)); }
      if (price_max) { where += " AND c.currentBid <= ?"; params.push(Number(price_max)); }
      if (status) { where += " AND c.status = ?"; params.push(status); }
      else { where += " AND c.status IN ('live', 'upcoming', 'offer_market')"; }

      const lim = Math.min(Number(limit) || 20, 100);
      const off = Number(offset) || 0;
      const orderBy = sort === 'price_asc' ? 'c.currentBid ASC' : sort === 'price_desc' ? 'c.currentBid DESC' : sort === 'year_desc' ? 'c.year DESC' : 'c.id DESC';

      const total = (db.prepare(`SELECT COUNT(*) as c FROM cars c ${where}`).get(...params) as any)?.c || 0;
      const cars = db.prepare(`
        SELECT c.id, c.lotNumber, c.vin, c.make, c.model, c.trim, c.year, c.odometer, c.mileageUnit,
               c.engine, c.transmission, c.drive, c.fuelType, c.exteriorColor, c.primaryDamage,
               c.titleType, c.location, c.currentBid, c.reservePrice, c.currency, c.images,
               c.status, c.auctionEndDate, c.acceptOffers
        FROM cars c ${where}
        ORDER BY ${orderBy} LIMIT ? OFFSET ?
      `).all(...params, lim, off);

      // Parse images JSON
      const parsed = cars.map((c: any) => ({
        ...c,
        images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(),
        url: `${SITE_URL}/car-details/${c.id}`,
        bidUrl: c.status === 'live' ? `${SITE_URL}/live-auction` : `${SITE_URL}/car-details/${c.id}`
      }));

      res.json({
        success: true,
        total,
        limit: lim,
        offset: off,
        count: parsed.length,
        cars: parsed
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Single car details
  app.get("/api/v1/cars/:id", validateApiKey, (req, res) => {
    try {
      const car: any = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM bids WHERE carId = c.id) as bidCount,
          (SELECT MAX(amount) FROM bids WHERE carId = c.id) as highestBid
        FROM cars c WHERE c.id = ?
      `).get(req.params.id);

      if (!car) return res.status(404).json({ error: 'Car not found' });

      car.images = (() => { try { return JSON.parse(car.images); } catch { return []; } })();
      car.url = `${SITE_URL}/car-details/${car.id}`;
      car.bidUrl = car.status === 'live' ? `${SITE_URL}/live-auction` : `${SITE_URL}/car-details/${car.id}`;

      res.json({ success: true, car });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Live auction cars
  app.get("/api/v1/cars/live", validateApiKey, (_req, res) => {
    try {
      const cars = db.prepare("SELECT id, lotNumber, make, model, year, currentBid, auctionEndDate, images, location FROM cars WHERE status = 'live'").all();
      res.json({ success: true, count: cars.length, cars: cars.map((c: any) => ({ ...c, images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(), url: `${SITE_URL}/live-auction` })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Upcoming cars
  app.get("/api/v1/cars/upcoming", validateApiKey, (_req, res) => {
    try {
      const cars = db.prepare("SELECT id, lotNumber, make, model, year, currentBid, auctionEndDate, images, location FROM cars WHERE status = 'upcoming'").all();
      res.json({ success: true, count: cars.length, cars: cars.map((c: any) => ({ ...c, images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(), url: `${SITE_URL}/car-details/${c.id}` })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Offer market cars
  app.get("/api/v1/cars/offers", validateApiKey, (_req, res) => {
    try {
      const cars = db.prepare("SELECT id, lotNumber, make, model, year, currentBid, reservePrice, offerMarketEndTime, images, location FROM cars WHERE status = 'offer_market'").all();
      res.json({ success: true, count: cars.length, cars: cars.map((c: any) => ({ ...c, images: (() => { try { return JSON.parse(c.images); } catch { return []; } })(), url: `${SITE_URL}/car-details/${c.id}` })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Platform stats
  app.get("/api/v1/stats", validateApiKey, (_req, res) => {
    try {
      const totalCars = (db.prepare("SELECT COUNT(*) as c FROM cars").get() as any)?.c || 0;
      const liveCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'live'").get() as any)?.c || 0;
      const upcomingCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status = 'upcoming'").get() as any)?.c || 0;
      const soldCars = (db.prepare("SELECT COUNT(*) as c FROM cars WHERE status IN ('closed', 'sold')").get() as any)?.c || 0;
      const totalBids = (db.prepare("SELECT COUNT(*) as c FROM bids").get() as any)?.c || 0;
      const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get() as any)?.c || 0;
      res.json({ success: true, stats: { totalCars, liveCars, upcomingCars, soldCars, totalBids, totalUsers } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Libyan market prices
  app.get("/api/v1/market-prices", validateApiKey, (req, res) => {
    try {
      const { make, model, year } = req.query;
      let where = "WHERE 1=1";
      const params: any[] = [];
      if (make) { where += " AND LOWER(make) LIKE ?"; params.push(`%${(make as string).toLowerCase()}%`); }
      if (model) { where += " AND LOWER(model) LIKE ?"; params.push(`%${(model as string).toLowerCase()}%`); }
      if (year) { where += " AND year = ?"; params.push(Number(year)); }

      const prices = db.prepare(`SELECT make, makeEn, model, modelEn, year, priceLYD, transmission, fuel, mileage, city FROM libyan_market_prices ${where} ORDER BY make, model, year LIMIT 50`).all(...params);
      res.json({ success: true, count: prices.length, prices });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: Generate API key
  app.post("/api/admin/api-keys", requireAdmin, (req, res) => {
    try {
      const { name, website } = req.body;
      if (!name) return res.status(400).json({ error: "اسم التطبيق مطلوب" });
      const key = `autopro_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      db.prepare("INSERT INTO api_keys (key, name, website, active, usageCount, createdAt, lastUsedAt) VALUES (?, ?, ?, 1, 0, ?, ?)")
        .run(key, name, website || '', new Date().toISOString(), new Date().toISOString());
      res.json({ success: true, key, name, website });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: List API keys
  app.get("/api/admin/api-keys", requireAdmin, (_req, res) => {
    try {
      const keys = db.prepare("SELECT * FROM api_keys ORDER BY createdAt DESC").all();
      res.json(keys);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: Toggle API key
  app.put("/api/admin/api-keys/:key/toggle", requireAdmin, (req, res) => {
    try {
      db.prepare("UPDATE api_keys SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE key = ?").run(req.params.key);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // PLUTU PAYMENT GATEWAY (Libya) — https://docs.plutu.ly
  // =====================================================================

  // Check Plutu status
  app.get("/api/payments/plutu-status", (_req, res) => {
    res.json({ enabled: PLUTU_ENABLED, methods: ['sadad', 'localbank', 'adfali', 'tlync'] });
  });

  // Sadad — Step 1: Send OTP verification to user's phone
  app.post("/api/payments/plutu/sadad/verify", requireAuth, async (req, res) => {
    try {
      const { mobile_number, birth_year, amount } = req.body;
      const userId = (req as any).user?.id;
      if (!mobile_number || !birth_year || !amount || amount <= 0) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة: رقم الهاتف، سنة الميلاد، المبلغ" });
      }

      const response = await fetch(`${PLUTU_BASE_URL}/transaction/sadadapi/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLUTU_ACCESS_TOKEN}`,
          'X-API-KEY': PLUTU_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mobile_number,
          birth_year,
          amount: Number(amount)
        })
      });

      const data = await response.json();

      if (data.result?.process_id) {
        console.log(`[PLUTU SADAD] OTP sent for user ${userId}, process_id: ${data.result.process_id}`);
        res.json({ success: true, process_id: data.result.process_id });
      } else {
        console.error('[PLUTU SADAD VERIFY ERROR]', data);
        res.status(400).json({ error: data.message || 'فشل إرسال رمز التحقق', details: data.error });
      }
    } catch (e: any) {
      console.error('[PLUTU SADAD VERIFY ERROR]', e.message);
      res.status(500).json({ error: 'خطأ في الاتصال ببوابة الدفع' });
    }
  });

  // Sadad — Step 2: Confirm payment with OTP code
  app.post("/api/payments/plutu/sadad/confirm", requireAuth, async (req, res) => {
    try {
      const { process_id, code, amount, invoiceId, type } = req.body;
      const userId = (req as any).user?.id;
      if (!process_id || !code || !amount) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة: process_id، رمز التحقق، المبلغ" });
      }

      const response = await fetch(`${PLUTU_BASE_URL}/transaction/sadadapi/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLUTU_ACCESS_TOKEN}`,
          'X-API-KEY': PLUTU_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          process_id,
          code,
          amount: Number(amount)
        })
      });

      const data = await response.json();

      if (data.result?.transaction_id || data.status === 'success') {
        const txId = `plutu-sadad-${Date.now()}`;
        db.prepare("INSERT INTO transactions (id, userId, amount, type, status, method, referenceNo, currency, timestamp) VALUES (?, ?, ?, ?, 'completed', 'plutu_sadad', ?, 'LYD', ?)")
          .run(txId, userId, Number(amount), type || 'deposit', data.result?.transaction_id || process_id, new Date().toISOString());

        if (type === 'invoice_payment' && invoiceId) {
          // Invoice payment — mark paid
          db.prepare("UPDATE invoices SET status = 'paid', paidAt = ?, paidVia = 'plutu_sadad' WHERE id = ?")
            .run(new Date().toISOString(), invoiceId);
          sendNotification(userId, `تم دفع الفاتورة ${invoiceId} عبر سداد بنجاح`, 'payment', '/dashboard/user?view=invoices');
          try { completeInvoicePayment(invoiceId, new Date().toISOString(), 'plutu'); } catch (_) { }
        } else {
          // Deposit — credit wallet
          const userRow: any = db.prepare("SELECT deposit FROM users WHERE id = ?").get(userId);
          const newDeposit = (userRow?.deposit || 0) + Number(amount);
          db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newDeposit * 10, userId);
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(amount), Number(amount), new Date().toISOString(), userId);

          sendNotification(userId, `تم إيداع ${amount} د.ل في محفظتك عبر سداد بنجاح`, 'payment', '/dashboard/user?view=wallet');
          sendInternalMessage('admin-1', userId, 'إيداع ناجح عبر سداد (Plutu)', `تم إيداع ${amount} د.ل في حسابك. مرجع: ${data.result?.transaction_id || process_id}`, 'accounting');
        }

        console.log(`[PLUTU SADAD] Payment confirmed: ${amount} LYD by ${userId} — txn: ${data.result?.transaction_id}`);
        res.json({ success: true, transaction_id: data.result?.transaction_id });
      } else {
        console.error('[PLUTU SADAD CONFIRM ERROR]', data);
        res.status(400).json({ error: data.message || 'فشل تأكيد الدفع — تحقق من رمز OTP', details: data.error });
      }
    } catch (e: any) {
      console.error('[PLUTU SADAD CONFIRM ERROR]', e.message);
      res.status(500).json({ error: 'خطأ في الاتصال ببوابة الدفع' });
    }
  });

  // Local Bank Cards — Create payment and get redirect URL
  app.post("/api/payments/plutu/localbank/create", requireAuth, async (req, res) => {
    try {
      const { amount, invoiceId, type } = req.body;
      const userId = (req as any).user?.id;
      if (!amount || amount <= 0) return res.status(400).json({ error: "المبلغ غير صحيح" });

      const invoiceNo = `APL-${userId.slice(-6)}-${Date.now().toString(36).toUpperCase()}`;
      const returnUrl = `${SITE_URL}/api/payments/plutu/callback?userId=${userId}&type=${type || 'deposit'}&invoiceId=${invoiceId || ''}&amount=${amount}`;

      const response = await fetch(`${PLUTU_BASE_URL}/transaction/localbankcards/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLUTU_ACCESS_TOKEN}`,
          'X-API-KEY': PLUTU_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Number(amount),
          invoice_no: invoiceNo,
          return_url: returnUrl
        })
      });

      const data = await response.json();

      if (data.result?.redirect_url) {
        // Store pending transaction
        const txId = `plutu-bank-${Date.now()}`;
        db.prepare("INSERT INTO transactions (id, userId, amount, type, status, method, referenceNo, currency, timestamp) VALUES (?, ?, ?, ?, 'pending', 'plutu_localbank', ?, 'LYD', ?)")
          .run(txId, userId, Number(amount), type || 'deposit', invoiceNo, new Date().toISOString());

        res.json({ success: true, redirect_url: data.result.redirect_url, transactionId: txId });
      } else {
        console.error('[PLUTU LOCALBANK ERROR]', data);
        res.status(400).json({ error: data.message || 'فشل إنشاء عملية الدفع', details: data.error });
      }
    } catch (e: any) {
      console.error('[PLUTU LOCALBANK ERROR]', e.message);
      res.status(500).json({ error: 'خطأ في الاتصال ببوابة الدفع' });
    }
  });

  // Plutu callback — handle return from bank card payment
  app.get("/api/payments/plutu/callback", async (req, res) => {
    try {
      const { approved, transaction_id, userId, type, invoiceId, amount, hashed } = req.query as any;

      // SECURITY: Verify HMAC signature — reject if no secret key configured
      if (!PLUTU_SECRET_KEY) {
        console.error('[PLUTU CALLBACK] HMAC verification impossible — PLUTU_SECRET_KEY not configured');
        return res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error&reason=security_config`);
      }
      {
        const dataToHash = `${transaction_id}${amount}${approved}`;
        const expectedHash = crypto.createHmac('sha256', PLUTU_SECRET_KEY).update(dataToHash).digest('hex');
        if (hashed !== expectedHash) {
          console.error(`[PLUTU CALLBACK] HMAC verification failed — expected: ${expectedHash}, got: ${hashed}`);
          return res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error&reason=invalid_signature`);
        }
      }

      // SECURITY: Verify the pending transaction exists in DB before crediting
      const pendingTxn: any = db.prepare("SELECT id FROM transactions WHERE userId = ? AND method = 'plutu_localbank' AND status = 'pending' ORDER BY timestamp DESC LIMIT 1").get(userId);
      if (!pendingTxn) {
        console.error(`[PLUTU CALLBACK] No pending transaction found for user ${userId}`);
        return res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error&reason=no_pending_transaction`);
      }

      if (approved === 'true' || approved === '1') {
        // Update pending transaction to completed
        db.prepare("UPDATE transactions SET status = 'completed', referenceNo = ? WHERE userId = ? AND method = 'plutu_localbank' AND status = 'pending' ORDER BY timestamp DESC LIMIT 1")
          .run(transaction_id || '', userId);

        if (type === 'invoice_payment' && invoiceId) {
          // Invoice payment — mark paid
          db.prepare("UPDATE invoices SET status = 'paid', paidAt = ?, paidVia = 'plutu_localbank' WHERE id = ?")
            .run(new Date().toISOString(), invoiceId);
          sendNotification(userId, `تم دفع الفاتورة ${invoiceId} عبر البطاقة المصرفية بنجاح`, 'payment', '/dashboard/user?view=invoices');
          try { completeInvoicePayment(invoiceId, new Date().toISOString(), 'plutu'); } catch (_) { }
        } else {
          // Deposit — credit wallet
          const paidAmount = Number(amount) || 0;
          const userRow: any = db.prepare("SELECT deposit FROM users WHERE id = ?").get(userId);
          const newDeposit = (userRow?.deposit || 0) + paidAmount;
          db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newDeposit * 10, userId);
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(paidAmount, paidAmount, new Date().toISOString(), userId);

          sendNotification(userId, `تم إيداع ${paidAmount} د.ل في محفظتك عبر البطاقة المصرفية بنجاح`, 'payment', '/dashboard/user?view=wallet');
          sendInternalMessage('admin-1', userId, 'إيداع ناجح عبر البطاقة المصرفية (Plutu)', `تم إيداع ${paidAmount} د.ل في حسابك. مرجع: ${transaction_id}`, 'accounting');
        }

        console.log(`[PLUTU CALLBACK] Payment approved: ${amount} LYD by ${userId} — txn: ${transaction_id}`);
        res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=success&amount=${amount}`);
      } else {
        console.log(`[PLUTU CALLBACK] Payment not approved for user ${userId}`);
        db.prepare("UPDATE transactions SET status = 'failed' WHERE userId = ? AND method = 'plutu_localbank' AND status = 'pending' ORDER BY timestamp DESC LIMIT 1")
          .run(userId);
        res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=failed`);
      }
    } catch (e: any) {
      console.error('[PLUTU CALLBACK ERROR]', e.message);
      res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error`);
    }
  });

  // Detect production: NODE_ENV=production OR RENDER env var OR dist folder exists
  const distPath = path.join(__dirname, "dist");
  const isProduction = process.env.NODE_ENV === "production"
    || !!process.env.RENDER
    || fs.existsSync(distPath);

  if (isProduction) {
    console.log("🚀 Production mode — serving dist/");
    app.use(express.static(distPath));
    // Catch-all: serve React SPA (must be AFTER all /api routes)
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log("📦 Dev mode — initializing Vite Middleware...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("✅ Vite Middleware Ready.");
    } catch (ve) {
      console.error("❌ Vite Initialization Failed:", ve);
    }
  }
}

startServer().catch(err => {
  console.log('Server Start Error:', err);
});
