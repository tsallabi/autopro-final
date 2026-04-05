import "dotenv/config";
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

const JWT_SECRET = process.env.JWT_SECRET || "autopro-secret-key-change-in-production-2026";
const SALT_ROUNDS = 10;

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
    pass: process.env.SMTP_PASS?.replace(/"/g, '') || 'T1234567t'
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


// Initialize Database
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

  -- Insert default admin if not exists
  INSERT OR REPLACE INTO users (id, firstName, lastName, email, phone, password, role, status, joinDate, buyingPower, deposit)
  VALUES ('admin-1', 'المدير', 'العام', 'admin@autopro.com', '01000000000', 'admin123', 'admin', 'active', '2024-01-01', 1000000, 100000);

  INSERT OR IGNORE INTO users (id, firstName, lastName, email, phone, password, role, status, joinDate, buyingPower, deposit, commission)
  VALUES ('user-1', 'محمد', 'العربي', 'user@autopro.com', '0123456789', 'user123', 'buyer', 'active', '2024-02-01', 50000, 5000, 5);

  INSERT OR REPLACE INTO users (id, firstName, lastName, email, phone, password, role, status, joinDate, buyingPower, deposit, commission)
  VALUES ('seller-1', 'أحمد', 'المعرض', 'seller-1@autopro.com', '0112233445', 'seller123', 'seller', 'active', '2024-02-01', 0, 0, 3);

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

// 3b. Ensure 'method' column exists in transactions
try {
  db.exec(`ALTER TABLE transactions ADD COLUMN method TEXT DEFAULT 'bank_transfer'`);
} catch (e) { /* Column already exists */ }

// ======= PHASE 4: SELLER WALLET TABLES =======
const initLibyanMarketPrices = () => {
  try {
    const count: any = db.prepare("SELECT COUNT(*) as count FROM libyan_market_prices").get();
    if (count && count.count === 0) {
      const rawData = `جديد	تويوتا	ستارليت	2025	اوتوماتيك	بنزين	0	99,999
جديد	جيتور	T2	2026	اوتوماتيك	بنزين	0	255,000
جديد	آيتو	آيتو 9	2026	اوتوماتيك	بنزين	0	36,666
مستعمل	تويوتا	كامري	2024	اوتوماتيك	بنزين	1,000 - 9,999	260,000
جديد	Audi	Q3	2024	اوتوماتيك	بنزين	0	178,938
جديد	Audi	RS6 Avant	2024	اوتوماتيك	بنزين	0	650,000
مستعمل	هيونداي	كريتا	2025	اوتوماتيك	بنزين	10,000 - 19,999	99,999
جديد	كيا	سورينتو	2023	اوتوماتيك	بنزين	0	135,000
مستعمل	هيونداي	سنتافي	2023	اوتوماتيك	بنزين	50,000 - 59,999	135,000
مستعمل	هيونداي	فوليستر	2023	اوتوماتيك	بنزين	90,000 - 99,999	55,000
مستعمل	كيا	فورتي	2023	اوتوماتيك	بنزين	10,000 - 19,999	65,000
جديد	تويوتا	توندرا	2023	اوتوماتيك	بنزين	0	295,000
مستعمل	هيونداي	سنتافي	2022	اوتوماتيك	بنزين	40,000 - 49,999	125,000
مستعمل	هيونداي	توسان	2022	اوتوماتيك	بنزين	60,000 - 69,999	110,000
مستعمل	هيونداي	سوناتا	2022	اوتوماتيك	بنزين	80,000 - 89,999	82,000
مستعمل	مرسيدس بنز	الفئة-C	2021	اوتوماتيك	بنزين	10,000 - 19,999	84,000
مستعمل	تويوتا	كامري	2020	اوتوماتيك	بنزين	70,000 - 79,999	80,000
مستعمل	كيا	فورتي	2020	اوتوماتيك	بنزين	130,000 - 139,999	50,000
مستعمل	نيسان	باترول	2020	اوتوماتيك	بنزين	+200,000	64,000
مستعمل	كيا	سبورتاج	2019	اوتوماتيك	بنزين	170,000 - 179,999	57,000
مستعمل	كيا	اوبتيما	2017	اوتوماتيك	بنزين	110,000 - 119,999	36,000`;
      
      const lines = rawData.split('\n').filter(l => l.trim().length > 0);
      const stmt = db.prepare('INSERT INTO libyan_market_prices (id, condition, make, model, year, transmission, fuel, mileage, priceLYD) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      db.transaction(() => {
        lines.forEach((line, idx) => {
          const [condition, make, model, year, transmission, fuel, mileage, priceStr] = line.split('\t');
          const price = parseFloat(priceStr?.replace(/,/g, '') || '0');
          stmt.run(`lmp-${idx}`, condition, make, model, parseInt(year), transmission, fuel, mileage, price);
        });
      })();
      console.log(`✅ Seeded ${lines.length} Libyan Market Prices`);
    }
  } catch (err) { console.error("Market seeder error", err); }
};
initLibyanMarketPrices();

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

// Safe column additions (ignore if already exist)
try { db.exec("ALTER TABLE seller_wallets ADD COLUMN bankName TEXT"); } catch (_) { }
try { db.exec("ALTER TABLE users ADD COLUMN kycDocUrl TEXT"); } catch (_) { }

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

// Diagnostic Log
const carCount = db.prepare("SELECT COUNT(*) as count FROM cars").get() as any;
console.log(`Database Status: ${carCount.count} cars loaded.`);

async function startServer() {
  console.log("🚀 Starting Server Initialization...");
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  const PORT = Number(process.env.PORT) || 3005;

  app.use(cors());
  app.use(express.json());

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

  app.post("/api/settings", (req, res) => {
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
      // Purchase Invoice
      db.prepare(`INSERT OR IGNORE INTO invoices(id, userId, carId, amount, status, type, timestamp, dueDate) VALUES(?, ?, ?, ?, 'unpaid', 'purchase', ?, ?)`).run(inv1, userId, carId, amount + commission, now, dueDate7);

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

  function walletDebit(userId: string, amount: number, description: string, refId?: string) {
    const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
    if (!wallet || wallet.balance < amount) throw new Error("رصيد غير كافٍ في المحفظة");
    const newBalance = wallet.balance - amount;

    db.prepare("UPDATE buyer_wallets SET balance = balance - ?, totalSpent = totalSpent + ?, updatedAt = ? WHERE userId = ?")
      .run(amount, amount, new Date().toISOString(), userId);

    const txId = `wt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    db.prepare(`INSERT INTO wallet_transactions (id, userId, type, amount, balanceAfter, description, refId, timestamp) VALUES (?,?,?,?,?,?,?,?)`)
      .run(txId, userId, 'debit', amount, newBalance, description, refId || null, new Date().toISOString());

    db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newBalance, newBalance * 10, userId);
    return newBalance;
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
        // Auction duration exactly 2 minutes
        const newEndDate = new Date(Date.now() + 2 * 60 * 1000).toISOString();
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

    // AUTO REPAIR: Any live car missing an end date gets exactly 2 minutes from NOW.
    const nullEndDateCars: any[] = db.prepare("SELECT id FROM cars WHERE status = 'live' AND (auctionEndDate IS NULL OR auctionEndDate = '')").all();
    if (nullEndDateCars.length > 0) {
      const newEndDate = new Date(Date.now() + 2 * 60 * 1000).toISOString();
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

  


  app.delete("/api/libyan-market/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM market_estimates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete market estimate", details: err.message });
    }
  });

  app.get("/api/debug/seed-simulation", (req, res) => {
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


  setInterval(tickAuctions, 1000);

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

    // 2. Close expired Offer Market cars
    const expiredOffers: any[] = db.prepare("SELECT id FROM cars WHERE status = 'offer_market' AND offerMarketEndTime < ?").all(now);
    expiredOffers.forEach((car: any) => {
      db.prepare("UPDATE cars SET status = 'closed' WHERE id = ?").run(car.id);
      io.emit("car_updated", { id: car.id, status: 'closed' });
      console.log(`Car ${car.id} Offer Market period expired.`);
    });
  };

  setInterval(tickUltimoAndOffers, 5000);

  // Placeholder for old helper location (cleaned)

  // ══════════════════════════════════════════════════════════════
  //  PHASE 10 — BUYER WALLET ROUTES
  // ══════════════════════════════════════════════════════════════

  // GET /api/wallet/:userId — full wallet summary
  app.get("/api/wallet/:userId", (req, res) => {
    try {
      const { userId } = req.params;
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
  app.get("/api/wallet/:userId/transactions", (req, res) => {
    try {
      const { userId } = req.params;
      const txs: any[] = db.prepare("SELECT * FROM wallet_transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT 100").all(userId);
      res.json(txs);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/topup — user requests a top-up (pending admin approval)
  app.post("/api/wallet/topup", (req, res) => {
    try {
      const { userId, amount, method, referenceNo } = req.body;
      if (!userId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const id = `pr-topup-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, status, requestedAt)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, 'topup', amount, method || 'bank_transfer', referenceNo || null, 'pending', new Date().toISOString());
      sendNotification('admin-1', '💰 طلب شحن محفظة جديد', `المستخدم ${userId} يطلب شحن محفظته بمبلغ $${Number(amount).toLocaleString()}`, 'info');
      res.json({ success: true, requestId: id, message: "تم إرسال طلب الشحن — سيُراجَع خلال 24 ساعة" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/pay-invoice — pay an invoice from wallet balance
  app.post("/api/wallet/pay-invoice", (req, res) => {
    try {
      const { userId, invoiceId } = req.body;
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
        db.prepare("UPDATE shipments SET status='processing' WHERE carId=? AND userId=?").run(invoice.carId, userId);
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
  app.get("/api/admin/payment-requests", (_req, res) => {
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
      db.prepare("UPDATE shipments SET status = 'in_transport', updatedAt = ? WHERE carId = ? AND userId = ?")
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

  app.post("/api/admin/payment-requests/:id/approve", (req, res) => {
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

      res.json({ success: true });
    } catch (err: any) { 
      console.error(err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // POST /api/admin/payment-requests/:id/reject
  app.post("/api/admin/payment-requests/:id/reject", (req, res) => {
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
  app.get("/api/admin/wallet-stats", (_req, res) => {
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
  app.post("/api/wallet/withdrawal", (req, res) => {
    try {
      const { userId, amount, iban, bankName } = req.body;
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

  // POST /api/payments/create-intent — create Stripe PaymentIntent for deposit
  app.post("/api/payments/create-intent", async (req, res) => {
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
      if (!demo && stripeClient) {
        const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'succeeded') return res.status(400).json({ error: "لم يكتمل الدفع بعد" });
      }
      const user: any = db.prepare("SELECT deposit, buyingPower FROM users WHERE id = ?").get(userId);
      if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
      const newDeposit = (user.deposit || 0) + Number(amount);
      const newBuyingPower = newDeposit * 10;
      db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newBuyingPower, userId);
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
  app.get("/api/inspections/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const inspections = db.prepare("SELECT * FROM inspections WHERE userId = ? ORDER BY requestedAt DESC").all(userId);
      res.json(inspections);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/inspections", (req, res) => {
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

  // ======= INSPECTION ROUTES =======
  app.get("/api/inspections/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const inspections = db.prepare("SELECT * FROM inspections WHERE userId = ? ORDER BY requestedAt DESC").all(userId);
      res.json(inspections);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/inspections", (req, res) => {
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
  app.post("/api/user/update-profile", (req, res) => {
    try {
      const { id, firstName, lastName, phone, address } = req.body;
      if (!id) return res.status(400).json({ error: "Missing ID" });

      const stmt = db.prepare(`
        UPDATE users 
        SET firstName = ?, lastName = ?, phone = ?, address1 = ?
        WHERE id = ?
      `);
      const info = stmt.run(firstName, lastName, phone, address, id);

      if (info.changes > 0) {
        const updatedUser: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
        res.json({ success: true, user: updatedUser });
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/user/change-password — user changes their password
  app.post("/api/user/change-password", (req, res) => {
    try {
      const { id, currentPassword, newPassword } = req.body;
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

  app.get("/api/admin/branches", (req, res) => {
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

  app.post("/api/admin/config", (req, res) => {
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
  app.get("/api/admin/offices", (req, res) => {
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

  app.post("/api/admin/offices", (req, res) => {
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

  // Create upload directories if they don't exist
  [uploadsDir, imagesDir, docsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  app.post('/api/upload/images', (uploadImages.array('images', 20) as any), ((req: any, res: any) => {
    try {
      if (!req.files || (req.files as any).length === 0) {
        return res.status(400).json({ error: 'لم يتم رفع أي صور' });
      }
      const urls = (req.files as any[]).map((f: any) => `/uploads/images/${f.filename}`);
      res.json({ success: true, urls, count: urls.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'فشل رفع الصور' });
    }
  }) as any);

  // ======= AUTH ROUTES =======

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
      // 🔐 SECURITY: Hash password before storing
      const hashedPassword = await bcrypt.hash(password || '123456', SALT_ROUNDS);

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
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      db.prepare(`INSERT OR REPLACE INTO verification_codes(email, code, expiresAt) VALUES(?, ?, ?)`).run(email, token, expiresAt);

      const verifyLink = `${SITE_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

      // Return user data IMMEDIATELY — don't wait for email
      const newUser: any = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      res.json(newUser);

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
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
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

        user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

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

      res.json(user);
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

  app.post("/api/cars", (req, res) => {
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
        auctionEndDate || '', sellerId || '', keys || 'yes', runsDrives || 'yes', notes || '', mileageUnit || 'mi', acceptOffers ? 1 : 0
      );
      res.json({ id, ...req.body });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Failed to add car or invalid data" });
    }
  });

  app.delete("/api/cars/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM cars WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete car" });
    }
  });

  // ======= OFFER MARKET & ADMIN ENDPOINTS =======
  app.get("/api/admin/offer-market-cars", (req, res) => {
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'offer_market'").all();
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch offer market cars" });
    }
  });

  app.post("/api/offers/:carId/accept", (req, res) => {
    const { carId } = req.params;
    const { userId, userRole } = req.body || {};
    const actionUserId = userId || 'admin-1'; // fallback to admin if accessed directly from admin panel

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "Car not found" });

      if (userRole !== 'admin' && userId && car.sellerId !== userId) {
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

  app.post("/api/offers/:carId/reject", (req, res) => {
    const { carId } = req.params;
    const { userId, userRole } = req.body || {};

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (userRole !== 'admin' && userId && car.sellerId !== userId) {
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

  app.post("/api/offers/:carId/counter", (req, res) => {
    const { carId } = req.params;
    const { counterAmount, userId, userRole } = req.body || {};

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (userRole !== 'admin' && userId && car.sellerId !== userId) {
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

  app.post("/api/offers/:carId/respond", (req, res) => {
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
  app.get("/api/admin/mailing-list", (req, res) => {
    try {
      const list = db.prepare("SELECT id, firstName, lastName, email FROM users WHERE role IN ('buyer', 'user', 'user_pending', 'seller')").all();
      res.json(list);
    } catch (e) { res.status(500).json({ error: "Failed to fetch mailing list" }); }
  });

  app.get("/api/admin/marketing-cars", (req, res) => {
    try {
      const list = db.prepare("SELECT * FROM cars WHERE status IN ('live', 'active', 'upcoming', 'offer_market', 'ultimo') OR isBuyNow = 1").all();
      res.json(list.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) { res.status(500).json({ error: "Failed to fetch marketing cars" }); }
  });

  // ======= NOTIFICATION TEMPLATES API =======
  app.get("/api/admin/notification-templates", (req, res) => {
    try {
      const templates = db.prepare("SELECT * FROM notification_templates ORDER BY updatedAt DESC").all();
      res.json(templates);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch notification templates" });
    }
  });

  app.put("/api/admin/notification-templates/:id", (req, res) => {
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
  app.get("/api/users", (req, res) => {
    try {
      const users: any[] = db.prepare("SELECT * FROM users").all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, email, phone, role, status, deposit, buyingPower, commission, country, address1, manager, office, companyName } = req.body;
    try {
      db.prepare(`
        UPDATE users SET 
          firstName = ?, lastName = ?, email = ?, phone = ?, role = ?, 
          status = ?, deposit = ?, buyingPower = ?, commission = ?, 
          country = ?, address1 = ?, manager = ?, office = ?, companyName = ?
        WHERE id = ?
      `).run(firstName, lastName, email, phone, role, status, deposit, buyingPower, commission, country, address1, manager, office, companyName, id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "فشل تحديث بيانات المستخدم" });
    }
  });

  // ======= USER SETTINGS =======
  app.get("/api/user/settings/:id", (req, res) => {
    const { id } = req.params;
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

  app.post("/api/user/settings/:id", (req, res) => {
    const { id } = req.params;
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
  app.get("/api/admin/pending-users", (req, res) => {
    try {
      const users: any[] = db.prepare("SELECT * FROM users WHERE status = 'pending_approval'").all();
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب المستخدمين المعلقين" });
    }
  });

  app.post("/api/admin/approve-user/:id", (req, res) => {
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

  app.post("/api/admin/reject-user/:id", (req, res) => {
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
  app.get("/api/admin/pending-cars", (req, res) => {
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'pending_approval'").all();
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب السيارات المعلقة" });
    }
  });

  app.post("/api/admin/approve-car/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE cars SET status = 'upcoming' WHERE id = ? AND status = 'pending_approval'").run(id);
      io.emit("car_approved", { carId: id });
      res.json({ success: true, message: "تم اعتماد السيارة بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل اعتماد السيارة" });
    }
  });

  app.post("/api/admin/reject-car/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE cars SET status = 'rejected' WHERE id = ?").run(id);
      res.json({ success: true, message: "تم رفض السيارة" });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض السيارة" });
    }
  });

  // ======= USER BIDS HISTORY =======
  app.get("/api/bids/user/:userId", (req, res) => {
    const { userId } = req.params;
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
  app.get("/api/shipments/user/:userId", (req, res) => {
    const { userId } = req.params;
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

  app.get("/api/admin/shipments", (req, res) => {
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

  app.get("/api/shipments/seller/:id", (req, res) => {
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

  app.post("/api/admin/shipments/:id/update-status", (req, res) => {
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
          'in_transport': 'قيد النقل',
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

  app.post("/api/shipments/:carId/request", (req, res) => {
    const { carId } = req.params;
    const { userId } = req.body;
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
  app.get("/api/invoices/user/:userId", (req, res) => {
    const { userId } = req.params;
    const invoices: any[] = db.prepare(`
      SELECT i.*, c.make, c.model, c.year, c.lotNumber, c.sellerId
      FROM invoices i 
      LEFT JOIN cars c ON i.carId = c.id 
      WHERE i.userId = ?
  `).all(userId);
    res.json(invoices);
  });

  app.get("/api/offers/user/:userId", (req, res) => {
    const { userId } = req.params;
    try {
      const offers = db.prepare("SELECT * FROM cars WHERE winnerId = ? AND status = 'offer_market'").all(userId);
      res.json(offers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/invoices/:id/pay", (req, res) => {
    const { id } = req.params;
    const { method, referenceNo, receiptUrl, userId } = req.body;

    if (!method) return res.status(400).json({ error: "يرجى اختيار طريقة الدفع أولاً" });

    try {
      const invoice: any = db.prepare("SELECT i.*, c.sellerId, c.make, c.model, c.year FROM invoices i LEFT JOIN cars c ON i.carId = c.id WHERE i.id = ?").get(id) as any;
      if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة" });
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
            db.prepare("UPDATE shipments SET status = 'in_transport', updatedAt = ? WHERE carId = ? AND userId = ?")
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
        
        return res.json({ success: true, status: 'pending_confirmation', message: "تم إرسال طلب الدفع للإدارة للمراجعة" });
      }

      res.status(400).json({ error: "طريقة دفع غير مدعومة" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "فشل عملية الدفع: " + e.message });
    }
  });

  // Watchlist Routes
  app.get("/api/watchlist/user/:userId", (req, res) => {
    const { userId } = req.params;
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

  app.post("/api/watchlist", (req, res) => {
    const { userId, carId } = req.body;
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

  app.delete("/api/watchlist/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM watchlist WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ======= ADMIN: USER MANAGEMENT ROUTES (Deduplicated - canonical version below at /api/admin/approve-user) =======
  // NOTE: Duplicate routes removed. The canonical versions are at lines ~963-998 above.

  // ======= TRANSACTION ROUTES =======
  app.get("/api/transactions/user/:userId", (req, res) => {
    const { userId } = req.params;
    const transactions: any[] = db.prepare("SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC").all(userId);
    res.json(transactions);
  });

  app.get("/api/transactions", (req, res) => {
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

  app.post("/api/transactions", (req, res) => {
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

    // Add to pending balance (becomes available after 3 days in real life)
    db.prepare(`
      UPDATE seller_wallets
      SET pendingBalance = pendingBalance + ?,
          totalEarned = totalEarned + ?,
          lastUpdated = ?
      WHERE sellerId = ?
    `).run(netAmount, netAmount, new Date().toISOString(), sellerId);

    return { txId, commission, netAmount };
  };

  // GET /api/seller/wallet/:sellerId - Full wallet summary
  app.get("/api/seller/wallet/:sellerId", (req, res) => {
    const { sellerId } = req.params;
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
  app.get("/api/seller/transactions/:sellerId", (req, res) => {
    const { sellerId } = req.params;
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
  app.post("/api/seller/withdraw", (req, res) => {
    const { sellerId, amount, iban, bankName } = req.body;
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
  app.get("/api/admin/withdrawal-requests", (_req, res) => {
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
  app.post("/api/admin/withdrawal-requests/:id/approve", (req, res) => {
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
  app.post("/api/admin/withdrawal-requests/:id/reject", (req, res) => {
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
  app.put("/api/seller/wallet/:id/iban", (req, res) => {
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
  app.post("/api/upload/document", (uploadDoc.single('document') as any), ((req: any, res: any) => {
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
  app.get("/api/admin/kyc-pending", (req, res) => {
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
  app.post("/api/admin/kyc/:userId/approve", (req, res) => {
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
  app.post("/api/admin/kyc/:userId/reject", (req, res) => {
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
  app.get("/api/admin/kyc-documents/:userId", (req, res) => {
    try {
      const docs: any[] = db.prepare("SELECT * FROM kyc_documents WHERE userId = ? ORDER BY uploadedAt DESC").all(req.params.userId);
      res.json(docs);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الوثائق" });
    }
  });

  // ==========================================
  // PAYMENT REQUESTS & LIQUIDITY LOGIC
  // ==========================================




  app.get("/api/admin/payment-requests", (req, res) => {
    try {
      const deposits = db.prepare("SELECT t.*, u.name as userName, u.email as userEmail FROM transactions t JOIN users u ON t.userId = u.id WHERE t.type = 'deposit' ORDER BY t.timestamp DESC").all();
      res.json(deposits);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch payment requests' });
    }
  });

  app.post("/api/admin/payment-requests/:id/:action", (req, res) => {
    try {
      const { id, action } = req.params;
      const status = action === 'approve' ? 'completed' : 'failed';

      const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as any;
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });

      db.prepare("UPDATE transactions SET status = ? WHERE id = ?").run(status, id);

      if (status === 'completed') {
        const user = db.prepare("SELECT wallet FROM users WHERE id = ?").get(tx.userId) as any;
        const wallet = JSON.parse(user.wallet || '{"balance":0,"held":0}');
        wallet.balance += tx.amount;
        db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run(JSON.stringify(wallet), tx.userId);

        sendNotification(tx.userId, 'تم شحن محفظتك بنجاح 💰', `تم إضافة $${tx.amount.toLocaleString()} إلى رصيدك نقداً.`, 'success');
      } else {
        sendNotification(tx.userId, 'رفض طلب الشحن ❌', `عذراً، تم رفض طلب شحن الرصيد بقيمة $${tx.amount.toLocaleString()}.`, 'error');
      }

      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process payment request' });
    }
  });

  // ==========================================
  // UNIFIED ACTIVITY LOG (MESSAGES / NOTIFICATIONS)
  // ==========================================
  app.get("/api/admin/all-messages", (req, res) => {
    try {
      const msgs = db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 500").all();
      res.json(msgs);
    } catch (e) { res.status(500).json({ error: "Failed to fetch messages" }); }
  });

  app.get("/api/admin/all-notifications", (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 500").all();
      res.json(notes);
    } catch (e) { res.status(500).json({ error: "Failed to fetch notifications" }); }
  });

  // ==========================================
  // GLOBAL SYSTEM SETTINGS & NOTIFICATIONS
  // ==========================================
  app.get("/api/admin/settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM system_settings").all();
      res.json(Array.isArray(settings) ? settings : []);
    } catch (e) {
      console.error(e);
      res.json([]); // Return empty array instead of error object to prevent frontend crash
    }
  });

  app.post("/api/admin/settings/update", (req, res) => {
    const { key, value } = req.body;
    try {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)")
        .run(key, value, new Date().toISOString());
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to update setting" }); }
  });

  app.get("/api/admin/external-notifications", (req, res) => {
    try {
      const logs = db.prepare("SELECT * FROM external_notifications ORDER BY timestamp DESC LIMIT 100").all();
      res.json(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error(e);
      res.json([]); // Return empty array
    }
  });

  app.post("/api/admin/external-notifications/test", async (req, res) => {
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
  app.post('/api/admin/send-campaign', async (req, res) => {
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


  // ==========================================
  // WALLET & PAYMENT CORE ENDPOINTS (KYC/Topup/Withdrawal)
  // ==========================================
  app.post("/api/wallet/topup", (req, res) => {
    const { userId, amount, method } = req.body;
    const id = `dep - ${Date.now()} `;
    try {
      db.prepare(`
        INSERT INTO transactions(id, userId, amount, type, status, timestamp, method)
      VALUES(?, ?, ?, 'deposit', 'pending', ?, ?)
        `).run(id, userId, amount, new Date().toISOString(), method || 'bank_transfer');

      res.json({ success: true, id });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال طلب الإيداع" });
    }
  });

  app.get("/api/admin/pending-deposits", (req, res) => {
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

  app.post("/api/admin/approve-deposit", (req, res) => {
    const { transactionId } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId) as any;
      if (!tx || tx.status !== 'pending') return res.status(404).json({ error: "العملية غير موجودة أو معالجة مسبقاً" });

      // Use a transaction for atomic update
      const update = db.transaction(() => {
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(transactionId);
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = buyingPower + ? WHERE id = ?")
          .run(tx.amount, tx.amount * 10, tx.userId);
      });
      update();

      sendNotification(tx.userId, 'تمت الموافقة على الإيداع', `تم إضافة $${tx.amount} لرصيدك وتحديث قوتك الشرائية.`, 'success');
      sendInternalMessage('admin-1', tx.userId, '✅ تأكيد إيداع رصيد', `تمت مراجعة طلب الإيداع الخاص بك بقيمة $${tx.amount} والموافقة عليه.\nيمكنك الآن البدء بالمزايدة.`);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to approve deposit" });
    }
  });

  app.post("/api/admin/reject-deposit", (req, res) => {
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
  app.get("/api/messages/user/:userId", (req, res) => {
    const { userId } = req.params;
    const messages: any[] = db.prepare(`
      SELECT m.*, u.firstName as senderFirstName, u.lastName as senderLastName
      FROM messages m
      LEFT JOIN users u ON m.senderId = u.id
      WHERE m.receiverId = ?
        ORDER BY m.timestamp DESC
          `).all(userId);
    res.json(messages);
  });

  app.get("/api/admin/stats", (req, res) => {
    try {
      const totalSales: any = (db.prepare("SELECT SUM(amount) as total FROM bids").get() as any)?.total || 0;
      const activeAuctions: any = (db.prepare("SELECT COUNT(*) as count FROM cars WHERE status = 'live'").get() as any)?.count || 0;
      const totalUsers: any = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)?.count || 0;
      const totalCommission = totalSales * 0.05; // Example logic

      res.json({
        totalSales,
        activeAuctions,
        totalUsers,
        totalCommission,
        activeShipments: 0, // Placeholder
        liveBids: activeAuctions
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/logs", (req, res) => {
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

  app.get("/api/admin/chart-data", (req, res) => {
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

  app.post("/api/cars/:id/offer", (req, res) => {
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

      io.emit("car_updated", { id, currentBid: amount, winnerId: userId });
      res.json({ success: true, status: 'pending', message: "تم تقديم العرض بنجاح، بانتظار موافقة البائع" });
    } catch (err) {
      res.status(500).json({ error: "فشل تقديم العرض" });
    }
  });

  app.get("/api/admin/offer-market-cars", (req, res) => {
    const { userId, userRole } = req.query;
    try {
      let query = "SELECT * FROM cars WHERE status = 'offer_market'";
      let params: any[] = [];

      if (userRole !== 'admin') {
        query += " AND sellerId = ?";
        params.push(userId);
      }

      const cars: any[] = db.prepare(query).all(...params);
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سيارات سوق العروض" });
    }
  });


  // Duplicate /api/offers/:id/accept and reject endpoints removed to resolve routing conflict

  app.post("/api/cars/:id/re-list", (req, res) => {
    const { id } = req.params;
    const { userId, userRole, nextAuctionDate } = req.body;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      // RBAC check
      if (userRole !== 'admin' && car.sellerId !== userId) {
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

  app.get("/api/transactions", (req, res) => {
    const { status, type, userId } = req.query;
    try {
      let query = "SELECT t.*, u.firstName, u.lastName FROM transactions t JOIN users u ON t.userId = u.id WHERE 1=1";
      const params: any[] = [];
      if (status) { query += " AND t.status = ?"; params.push(status); }
      if (type) { query += " AND t.type = ?"; params.push(type); }
      if (userId) { query += " AND t.userId = ?"; params.push(userId); }
      query += " ORDER BY t.timestamp DESC";
      const transactions: any[] = db.prepare(query).all(...params);
      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/transactions/user/:userId", (req, res) => {
    const { userId } = req.params;
    try {
      const transactions: any[] = db.prepare(`
        SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC
      `).all(userId);
      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch user transactions" });
    }
  });

  app.post("/api/deposit", (req, res) => {
    const { userId, amount, method = 'bank_transfer' } = req.body;
    const now = new Date().toISOString();
    const txId = `tx - ${Date.now()} `;

    try {
      // 1. Record transaction as PENDING first
      // Note: We don't update user balance yet!
      db.prepare(`
        INSERT INTO transactions(id, userId, amount, type, status, timestamp, method)
      VALUES(?, ?, ?, 'deposit', 'pending', ?, ?)
      `).run(txId, userId, amount, now, method);

      // 2. Notify Admin about new deposit request
      sendInternalMessage(userId, 'admin-1',
        '🆕 طلب إيداع عربون جديد',
        `قام العميل(ID: ${userId}) بطلب إيداع مبلغ $${amount.toLocaleString()} عبر ${method}.\nيرجى مراجعة التحويل وتأكيده.`
      );

      res.json({ success: true, message: "تم إرسال طلب الإيداع بنجاح. سيتم تحديث رصيدك بعد مراجعة الإدارة.", txId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "فشل إرسال طلب الإيداع" });
    }
  });

  // ======= NEW ADMIN: DEPOSIT APPROVAL =======
  app.post("/api/admin/approve-deposit/:txId", (req, res) => {
    const { txId } = req.params;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      db.transaction(() => {
        // 1. Confirm transaction
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(txId);

        // 2. Update user balance and buying power
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = (deposit + ?) * 10 WHERE id = ?").run(tx.amount, tx.amount, tx.userId);

        // 3. Notify user
        sendInternalMessage('admin-1', tx.userId,
          '✅ تم تأكيد استلام العربون',
          `تم تأكيد إيداع مبلغ $${tx.amount.toLocaleString()}. قوتك الشرائية الآن هي $${((tx.amount * 10)).toLocaleString()} إضافية.`
        );
      })();

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تأكيد الإيداع" });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const {
      firstName, lastName, email, phone, role, status,
      deposit, commission, manager, office, companyName,
      country, address1, address2
    } = req.body;

    try {
      db.prepare(`
        UPDATE users SET
      firstName = ?, lastName = ?, email = ?, phone = ?,
        role = ?, status = ?, deposit = ?, commission = ?,
        manager = ?, office = ?, companyName = ?, country = ?,
        address1 = ?, address2 = ?, buyingPower = ?
          WHERE id = ?
            `).run(
        firstName, lastName, email, phone, role, status,
        deposit, commission, manager, office, companyName,
        country, address1, address2, (deposit || 0) * 10, id
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Message Routes
  app.get("/api/messages", (req, res) => {
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

  app.post("/api/messages", (req, res) => {
    const { senderId, receiverId, subject, content, category } = req.body;
    try {
      sendInternalMessage(senderId, receiverId, subject, content, category);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/notifications/:userId", (req, res) => {
    const { userId } = req.params;
    try {
      const notifications: any[] = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC").all(userId);
      res.json(notifications);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/read-all", (req, res) => {
    const { userId } = req.body;
    try {
      db.prepare("UPDATE notifications SET isRead = 1 WHERE userId = ?").run(userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.post("/api/notifications/:id/read", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE notifications SET isRead = 1 WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  app.get("/api/unread-counts/:userId", (req, res) => {
    const { userId } = req.params;
    try {
      const messages: any = db.prepare("SELECT COUNT(*) as count FROM messages WHERE receiverId = ? AND isRead = 0").get(userId) as any;
      const notifications: any = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0").get(userId) as any;
      res.json({ messages: messages.count, notifications: notifications.count });
    } catch (e) {
      res.json({ messages: 0, notifications: 0 });
    }
  });

  app.post("/api/messages/:id/read", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE messages SET isRead = 1 WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });

  // Socket.io for Bidding
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_auction", (carId) => {
      socket.join(carId);
      console.log(`User joined auction: ${carId} `);

      // The frontend uses car.auctionEndDate directly, no need for active timer sync
      const car: any = db.prepare("SELECT status, auctionEndDate FROM cars WHERE id = ?").get(carId);
      if (car && car.status === 'live') {
        socket.emit("timer_update", { carId });
      }
    });

    socket.on("join_user_room", (userId) => {
      socket.join(`user_${userId} `);
      console.log(`User joined personal room: user_${userId} `);
    });

    socket.on("send_message", (data) => {
      const { senderId, receiverId, subject, content, category = 'general' } = data;
      try {
        const id = sendInternalMessage(senderId, receiverId, subject, content, category);

        // Also send a notification for the message
        const sender: any = db.prepare("SELECT firstName, lastName FROM users WHERE id = ?").get(senderId);
        const senderName = sender ? `${sender.firstName} ${sender.lastName} ` : 'النظام';
        sendNotification(receiverId, `رسالة جديدة: ${subject} `, `لديك رسالة جديدة من ${senderName} `, 'info');

      } catch (err) {
        console.error("Socket message error:", err);
      }
    });

    socket.on("place_bid", (data) => {
      const { carId, userId, amount, type } = data;
      const timestamp = new Date().toISOString();
      const bidId = Date.now().toString();

      // Update car current bid
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

      if (!car || (car.status !== 'live' && car.status !== 'ultimo')) {
        socket.emit("bid_error", { message: "المزاد غير متاح حالياً" });
        return;
      }

      if (car.status === 'ultimo' && userId !== car.winnerId) {
        socket.emit("bid_error", { message: "نافذة Ultimo متاحة فقط لأعلى مزايد حالياً" });
        return;
      }

      if (amount <= car.currentBid) {
        socket.emit("bid_error", { message: "يجب أن تكون المزايدة أعلى من القيمة الحالية" });
        return;
      }

      if (!user) {
        socket.emit("bid_error", { message: "المستخدم غير موجود" });
        return;
      }

      // Calculate total exposure: sum of current leading bids for this user
      const totalLeadingBids: any = (db.prepare("SELECT SUM(currentBid) as total FROM cars WHERE winnerId = ? AND status = 'live' AND id != ?").get(userId, carId) as any)?.total || 0;
      const totalExposurePlusNewBid = totalLeadingBids + amount;

      if (totalExposurePlusNewBid > user.buyingPower) {
        socket.emit("bid_error", {
          message: `إجمالي التزاماتك($${totalLeadingBids.toLocaleString()} + المزايدة الجديدة $${amount.toLocaleString()}) يتجاوز سقفك المالي($${user.buyingPower.toLocaleString()})`
        });
        return;
      }

      // Shift time for live car and all upcoming cars (15 seconds increment)
      if (car.status === 'live' && car.auctionEndDate) {
          const currentEndDate = new Date(car.auctionEndDate).getTime();
          // Always add exactly 15 seconds to current end date (or current Date if somehow passed)
          const newEndDate = new Date(Math.max(currentEndDate, Date.now()) + 15000).toISOString();
          db.prepare("UPDATE cars SET auctionEndDate = ? WHERE id = ?").run(newEndDate, carId);
          io.to(carId).emit("car_updated", { id: carId, auctionEndDate: newEndDate });

          // Also shift upcoming cars by 15 seconds in the db
          db.prepare(`
              UPDATE cars 
              SET auctionEndDate = datetime(auctionEndDate, '+15 seconds'),
                  auctionStartTime = datetime(auctionStartTime, '+15 seconds')
              WHERE status = 'upcoming'
          `).run();
          
          io.emit("upcoming_cars_shifted", { shiftMs: 15000 });
          console.log(`Bid placed: Live car ${carId} extended by 15s. All upcoming cars shifted.`);
      }

      const prevWinnerId = car.winnerId;
      db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(amount, userId, carId);
      console.log(`[STRESS] Bid placed: $${amount} by ${userId} for ${carId}`);

      // INSTANT OUTBID NOTIFICATION
      if (prevWinnerId && prevWinnerId !== userId) {
        sendNotification(prevWinnerId, "⚠️ تم تجاوز مزايدتك!", `قام شخص آخر بالمزايدة على ${car.make} ${car.model} بمبلغ $${amount.toLocaleString()}. زايد الآن لاستعادة الصدارة!`, 'warning', 'general_notification', {}, `/cars/${carId}`);
        io.to(`user_${prevWinnerId} `).emit("outbid", { carId, newBid: amount, make: car.make, model: car.model });
      }

      // If Ultimo bid meets reserve, close immediately
      if (car.status === 'ultimo' && amount >= car.reservePrice) {
        db.prepare("UPDATE cars SET status = 'closed' WHERE id = ?").run(carId);

        // Create invoices and shipment correctly
        createWinInvoices(userId, carId, amount);

        io.to(carId).emit("auction_closed", { carId, winnerId: userId, status: 'sold' });
      }

      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, ?)").run(bidId, carId, userId, amount, timestamp, type || 'manual');

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
      io.to(`user_${userId} `).emit("user_update", {
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
      const { carId, userId, maxAmount } = data;
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


  // ======= ADMIN INVENTORY APPROVAL =======
  app.get("/api/admin/pending-cars", (req, res) => {
    try {
      const cars = db.prepare("SELECT * FROM cars WHERE status = 'pending_approval'").all();
      res.json(cars.map((c: any) => ({ ...c, images: JSON.parse(c.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch pending cars" });
    }
  });

    // Removed duplicate approve-car route. Handled properly at line 1791.

  app.post("/api/admin/reject-car/:id", (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      db.prepare("UPDATE cars SET status = 'rejected' WHERE id = ?").run(id);
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      if (car.sellerId) {
        sendInternalMessage('admin-1', car.sellerId, '❌ رفض إدراج سيارة', `للأسف تم رفض إدراج سيارتك ${car.make} ${car.model}.\nلسبب: ${reason} `);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to reject car" });
    }
  });

  // ======= INTEGRATED ADMIN & MARKETING =======

  app.get("/api/admin/mailing-list", (req, res) => {
    try {
      const users = db.prepare("SELECT id, firstName, lastName, email, phone FROM users WHERE email IS NOT NULL").all();
      res.json(users);
    } catch (e) { res.status(500).json({ error: "Failed to fetch mailing list" }); }
  });

  app.get("/api/admin/marketing-cars", (req, res) => {
    try {
      // Fetch all non-sold cars for selection
      const results = db.prepare("SELECT id, make, model, year, status, currentBid, startingBid, buyItNow, images FROM cars WHERE status NOT IN ('sold', 'closed', 'rejected')").all();
      if (results.length > 0) {
        const firstCar = results[0] as any;
      }
      
      res.json(results.map((c: any) => {
        let imgs = [];
        try {
          const rawImgs = c.images || c.Images; // Handle potential case diff
          if (rawImgs && typeof rawImgs === 'string') {
            imgs = JSON.parse(rawImgs);
          } else if (Array.isArray(rawImgs)) {
            imgs = rawImgs;
          }
        } catch (e) { imgs = []; }
        
        // Normalize object to lowercase keys for frontend consistency
        return {
          id: c.id || c.ID,
          make: c.make || c.Make,
          model: c.model || c.Model,
          year: c.year || c.Year,
          status: (c.status || c.Status || '').toLowerCase(),
          currentBid: c.currentBid || 0,
          startingBid: c.startingBid || 0,
          buyNowPrice: c.buyItNow || 0,
          images: imgs
        };
      }));
    } catch (e) {
      console.error("Marketing Cars Error:", e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/admin/send-campaign", (req, res) => {
    const { emails, subject, html } = req.body;
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: "No recipients" });
    }

    try {
      // For campaigns, we'll send email directly via transporter
       emails.forEach(email => {
         transporter.sendMail({
           from: process.env.SMTP_FROM || '"AUTOPRO MARKETING" <info@autopro.ac>',
           to: email,
           subject,
           html
         }).catch(e => console.error("Campaign mail error for:", email, e.message));
       });
       res.json({ success: true, count: emails.length });
    } catch (e) { res.status(500).json({ error: "Failed to process campaign" }); }
  });

  // ======= TEMPLATE MANAGEMENT =======
  app.get("/api/admin/templates", (req, res) => {
    try {
      const templates = db.prepare("SELECT * FROM notification_templates").all();
      res.json(templates);
    } catch (e) { res.status(500).json({ error: "Templates fetch error" }); }
  });

  app.put("/api/admin/templates/:id", (req, res) => {
    const { id } = req.params;
    const { name, subject, body_html, body_whatsapp } = req.body;
    try {
      db.prepare("UPDATE notification_templates SET name = ?, subject = ?, body_html = ?, body_whatsapp = ?, updatedAt = ? WHERE id = ?")
        .run(name, subject, body_html, body_whatsapp, new Date().toISOString(), id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Template update error" }); }
  });

  app.get("/api/admin/offer-market-cars", (req, res) => {
    try {
      const cars = db.prepare("SELECT * FROM cars WHERE status = 'offer_market'").all();
      res.json(cars.map((c: any) => ({ ...c, images: JSON.parse(c.images || '[]') })));
    } catch (e) { res.status(500).json({ error: "Failed to fetch offer market cars" }); }
  });

  app.get("/api/admin/all-messages", (req, res) => {
    try {
      const msgs = db.prepare(`
        SELECT m.*, u.firstName as senderFirstName, u.lastName as senderLastName 
        FROM messages m
        LEFT JOIN users u ON m.senderId = u.id
        ORDER BY timestamp DESC
        `).all();
      res.json(msgs);
    } catch (e) { res.status(500).json({ error: "Messages fetch error" }); }
  });

  app.get("/api/admin/all-transactions", (req, res) => {
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

  app.get("/api/admin/all-notifications", (req, res) => {
    try {
      const notes = db.prepare(`
        SELECT n.*, u.firstName, u.lastName 
        FROM notifications n
        LEFT JOIN users u ON n.userId = u.id
        ORDER BY n.timestamp DESC
        `).all();
      res.json(notes);
    } catch (e) { res.status(500).json({ error: "Notifications fetch error" }); }
  });

  app.post("/api/admin/invoices/manual", (req, res) => {
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

  app.get("/api/admin/invoices", (req, res) => {
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

  app.put("/api/admin/invoices/:id", (req, res) => {
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

  app.get("/api/admin/system-summary", (req, res) => {
    try {
      const pendingUsers = db.prepare("SELECT * FROM users WHERE status = 'pending_approval'").all();
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


  app.get("/api/admin/merchants", (req, res) => {
    try {
      res.json(db.prepare("SELECT * FROM users WHERE role = 'seller'").all());
    } catch (e) {
      res.status(500).json({ error: "Merchants error" });
    }
  });

  app.post("/api/admin/cars/:id/review", (req, res) => {
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
  app.get("/api/admin/market-estimates", (req, res) => {
    try {
      // First try with lastUpdated, fallback to rowid if fails
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

  app.post("/api/admin/market-estimates", (req, res) => {
    const { make, model, year, minPrice, maxPrice } = req.body;
    const id = `est - ${Date.now()} `;
    const lastUpdated = new Date().toISOString();
    try {
      db.prepare("INSERT INTO market_estimates (id, make, model, year, minPrice, maxPrice, lastUpdated) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, make, model, year, minPrice, maxPrice, lastUpdated);
      res.json({ id, make, model, year, minPrice, maxPrice, lastUpdated });
    } catch (e) { res.status(500).json({ error: "Failed to create market estimate" }); }
  });

  app.put("/api/admin/market-estimates/:id", (req, res) => {
    const { id } = req.params;
    const { minPrice, maxPrice } = req.body;
    const lastUpdated = new Date().toISOString();
    try {
      db.prepare("UPDATE market_estimates SET minPrice = ?, maxPrice = ?, lastUpdated = ? WHERE id = ?").run(minPrice, maxPrice, lastUpdated, id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to update market estimate" }); }
  });

  app.delete("/api/admin/market-estimates/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM market_estimates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to delete" }); }
  });

  // ======= REAL ANALYTICS API =======
  app.get("/api/admin/reports-analytics", (req, res) => {
    try {
      const activeUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get() as any)?.count || 0;
      const totalBids = (db.prepare("SELECT COUNT(*) as count FROM bids").get() as any)?.count || 0;
      const salesVol = (db.prepare("SELECT SUM(amount) as val FROM transactions WHERE status = 'completed' AND type = 'deposit'").get() as any)?.val || 0;
      
      const geoSalesRaw = db.prepare("SELECT u.country, SUM(c.currentBid) as total FROM cars c JOIN users u ON c.winnerId = u.id WHERE c.status = 'closed' GROUP BY u.country").all();
      
      res.json({
        activeUsers,
        totalBids,
        salesVol,
        dbHitRate: 99.8,
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

  app.get("/api/libyan-market", (req, res) => {
    try {
      const { make, model, year } = req.query;
      let query = "SELECT * FROM libyan_market_prices WHERE 1=1";
      const params = [];
      if (make) { query += " AND make LIKE ?"; params.push(`%${make}%`); }
      if (model) { query += " AND model LIKE ?"; params.push(`%${model}%`); }
      if (year) { query += " AND year = ?"; params.push(parseInt(year as string)); }
      
      query += " ORDER BY make, year DESC";
      const data = db.prepare(query).all(...params);
      res.json(data);
    } catch(e) { res.status(500).json({ error: "Failed" }); }
  });

  app.post("/api/libyan-market", (req, res) => {
    try {
      const { condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, city } = req.body;
      const id = `lmp-${Date.now()}`;
      db.prepare("INSERT INTO libyan_market_prices (id, condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, condition, make, makeEn || '', model, modelEn || '', year, transmission, fuel, mileage, priceLYD, city || 'طرابلس');
      res.json({ success: true, id });
    } catch(e) { res.status(500).json({ error: "Failed" }); }
  });

  app.delete("/api/libyan-market/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM libyan_market_prices WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: "Failed" }); }
  });

  app.put("/api/libyan-market/:id", (req, res) => {
    try {
      const { condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, city } = req.body;
      db.prepare("UPDATE libyan_market_prices SET condition = ?, make = ?, makeEn = ?, model = ?, modelEn = ?, year = ?, transmission = ?, fuel = ?, mileage = ?, priceLYD = ?, city = ?, lastUpdated = CURRENT_TIMESTAMP WHERE id = ?")
        .run(condition, make, makeEn, model, modelEn, year, transmission, fuel, mileage, priceLYD, city, req.params.id);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: "Failed" }); }
  });

  // ====== LIVE AUCTIONS MGMT ======
  app.put("/api/admin/cars/:id/schedule", (req, res) => {
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

  app.post("/api/admin/cars/:id/mark-sold", (req, res) => {
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

  app.get("/api/admin/manage-live-auctions", (req, res) => {
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

  // ====== SETTINGS ======
  app.get("/api/settings", (req, res) => {
    try {
      const rows = db.prepare("SELECT key, value FROM system_settings").all() as { key: string, value: string }[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      res.json(settings);
    } catch (e) { res.status(500).json({ error: "Failed to fetch settings" }); }
  });

  app.put("/api/settings", (req, res) => {
    try {
      const updates = req.body;
      const stmt = db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      const transaction = db.transaction((settings: Record<string, string>) => {
        for (const [key, value] of Object.entries(settings)) {
          stmt.run(key, String(value));
        }
      });
      transaction(updates);

      // Update runtime globals if exchangeRate changed
      if (updates.exchangeRate) {
        GLOBAL_EXCHANGE_RATE = parseFloat(updates.exchangeRate);
      }
      res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: "Failed to update settings" }); }
  });

  // Start Vite last
  if (process.env.NODE_ENV !== "production") {
    console.log("📦 Initializing Vite Middleware...");
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
  } else if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    app.use(express.static(path.join(__dirname, "dist")));

    // Catch-all route to serve React app for client-side routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }
}

startServer().catch(err => {
  console.log('Server Start Error:', err);
});
