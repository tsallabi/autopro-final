/**
 * Referral system — give every user a code, give 100 د.ل bonus to BOTH
 * the referrer and the new user once the new user makes their first
 * deposit (so we don't reward fake signups).
 *
 * Schema (idempotent ALTERs — safe to run on every boot):
 *   users.referralCode TEXT      — short uppercase code, generated once.
 *   users.referredBy TEXT        — set to referrer's id when user signs up
 *                                  with a ?ref=CODE link.
 *   users.referralBonusLYD REAL  — running total of bonus earned in LYD.
 *   referrals (table)            — one row per (referrer, referred) pair.
 *
 * The bonus is credited in two ways:
 *   1. users.referralBonusLYD bumps for both — visible to admin & user.
 *   2. users.buyingPower bumps by USD-equivalent so the user can actually
 *      bid with it. Default LYD→USD = 0.20 (override via env LYD_TO_USD).
 */
import type { AppContext } from './types.ts';

export const REFERRAL_BONUS_LYD = Number(process.env.REFERRAL_BONUS_LYD) || 100;
export const LYD_TO_USD = Number(process.env.LYD_TO_USD) || 0.20;

function generateCode(userId: string): string {
  const cleaned = String(userId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const tail = cleaned.slice(-6).padStart(6, 'X');
  return tail
    .replace(/O/g, '8')
    .replace(/I/g, '7')
    .replace(/L/g, '9');
}

export function ensureReferralSchema(db: any): void {
  try { db.exec("ALTER TABLE users ADD COLUMN referralCode TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN referredBy TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN referralBonusLYD REAL DEFAULT 0"); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrerId TEXT NOT NULL,
      referredId TEXT NOT NULL,
      code TEXT,
      bonusLYD REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      createdAt TEXT,
      activatedAt TEXT
    )
  `);

  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_referrals_referredId ON referrals(referredId)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_referrals_referrerId ON referrals(referrerId)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_users_referralCode ON users(referralCode)`); } catch {}
}

export function getOrCreateReferralCode(db: any, userId: string): string {
  const row: any = db.prepare("SELECT referralCode FROM users WHERE id = ?").get(userId);
  if (row?.referralCode) return row.referralCode;
  const code = generateCode(userId);
  try {
    db.prepare("UPDATE users SET referralCode = ? WHERE id = ?").run(code, userId);
  } catch (e: any) {
    const fallback = (code + Date.now().toString(36).slice(-2)).toUpperCase();
    db.prepare("UPDATE users SET referralCode = ? WHERE id = ?").run(fallback, userId);
    return fallback;
  }
  return code;
}

export function applyReferralOnRegister(
  db: any,
  newUserId: string,
  referralCode: string | null | undefined
): { success: boolean; referrerId?: string } {
  if (!referralCode) return { success: false };
  const code = String(referralCode).trim().toUpperCase();
  if (!code) return { success: false };

  const referrer: any = db.prepare(
    "SELECT id FROM users WHERE referralCode = ?"
  ).get(code);
  if (!referrer) return { success: false };
  if (referrer.id === newUserId) return { success: false };

  try {
    db.prepare("UPDATE users SET referredBy = ? WHERE id = ?").run(referrer.id, newUserId);
    const refId = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(
      `INSERT INTO referrals (id, referrerId, referredId, code, status, createdAt)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    ).run(refId, referrer.id, newUserId, code, new Date().toISOString());
    return { success: true, referrerId: referrer.id };
  } catch {
    return { success: false };
  }
}

export function activateReferralBonus(
  db: any,
  newUserId: string,
  bonusLYD: number = REFERRAL_BONUS_LYD
): { success: boolean; referrerId?: string; bonus?: number; alreadyActivated?: boolean } {
  const ref: any = db.prepare(
    "SELECT * FROM referrals WHERE referredId = ? ORDER BY createdAt DESC LIMIT 1"
  ).get(newUserId);
  if (!ref) return { success: false };
  if (ref.status === 'activated') return { success: true, alreadyActivated: true, referrerId: ref.referrerId };

  const usdEquivalent = bonusLYD * LYD_TO_USD;

  try {
    db.transaction(() => {
      db.prepare(
        "UPDATE referrals SET status = 'activated', activatedAt = ?, bonusLYD = ? WHERE id = ?"
      ).run(new Date().toISOString(), bonusLYD, ref.id);

      db.prepare(
        "UPDATE users SET referralBonusLYD = COALESCE(referralBonusLYD, 0) + ? WHERE id = ?"
      ).run(bonusLYD, ref.referrerId);
      db.prepare(
        "UPDATE users SET referralBonusLYD = COALESCE(referralBonusLYD, 0) + ? WHERE id = ?"
      ).run(bonusLYD, newUserId);

      db.prepare(
        "UPDATE users SET buyingPower = COALESCE(buyingPower, 0) + ? WHERE id = ?"
      ).run(usdEquivalent, ref.referrerId);
      db.prepare(
        "UPDATE users SET buyingPower = COALESCE(buyingPower, 0) + ? WHERE id = ?"
      ).run(usdEquivalent, newUserId);
    })();
    return { success: true, referrerId: ref.referrerId, bonus: bonusLYD };
  } catch (e: any) {
    console.error('[referrals] activate failed:', e?.message);
    return { success: false };
  }
}

export function getReferralInfo(db: any, userId: string, siteUrl: string) {
  const code = getOrCreateReferralCode(db, userId);
  const referrals: any[] = db.prepare(`
    SELECT r.id, r.status, r.bonusLYD, r.createdAt, r.activatedAt,
           u.firstName, u.lastName, u.email
      FROM referrals r
      LEFT JOIN users u ON r.referredId = u.id
     WHERE r.referrerId = ?
     ORDER BY r.createdAt DESC
  `).all(userId);

  const summary = (db.prepare(
    "SELECT COALESCE(referralBonusLYD, 0) as v FROM users WHERE id = ?"
  ).get(userId) as any) || { v: 0 };

  const activatedCount = referrals.filter(r => r.status === 'activated').length;
  const pendingCount = referrals.filter(r => r.status === 'pending').length;

  return {
    code,
    shareUrl: `${siteUrl.replace(/\/$/, '')}/auth?ref=${code}`,
    bonusEarnedLYD: Number(summary.v) || 0,
    bonusPerReferralLYD: REFERRAL_BONUS_LYD,
    activatedCount,
    pendingCount,
    referrals: referrals.map(r => ({
      id: r.id,
      userName: r.firstName ? `${r.firstName} ${r.lastName || ''}`.trim() : 'مستخدم',
      email: r.email,
      status: r.status,
      bonusLYD: Number(r.bonusLYD) || 0,
      createdAt: r.createdAt,
      activatedAt: r.activatedAt,
    })),
  };
}
