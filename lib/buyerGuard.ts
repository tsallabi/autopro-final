/**
 * Buyer Guard — central eligibility check before any bidding action.
 *
 * Used by:
 *  - sockets/index.ts: place_bid, set_proxy_bid
 *  - routes/buyer.ts:  POST /api/cars/:id/offer
 *  - any future bid/offer endpoint
 *
 * The check is conservative: a user can only bid if their `biddingEnabled`
 * flag has been explicitly set to 1 by an admin. The admin flips this only
 * after manually verifying the deposit, KYC, and identity. This separates
 * three concerns that used to be tangled together:
 *
 *   - status='active' (registration approved → can browse the platform)
 *   - kycStatus='approved' (identity verified → still no bid by itself)
 *   - biddingEnabled=1 (admin's explicit OK to bid → THIS gates bidding)
 *
 * Banned/suspended/rejected accounts are still hard-blocked even if
 * biddingEnabled is somehow 1, in case a banned user's flag wasn't reset.
 *
 * Why this lives in lib/ (not just inline in each handler):
 *   - Single source of truth — change the policy once, applies everywhere.
 *   - Returns an Arabic message ready to surface to the user.
 *   - Easy to extend later (e.g., require KYC documents, age check, etc.).
 */

export type IneligibilityReason =
  | 'not-found'
  | 'not-bidding-enabled'
  | 'banned'
  | null;

export interface BidEligibility {
  ok: boolean;
  reason: IneligibilityReason;
  message?: string;
}

/**
 * Pure check — does not throw. Use this when you need to branch on the reason.
 */
export function checkBidEligibility(user: any): BidEligibility {
  if (!user) {
    return { ok: false, reason: 'not-found', message: 'المستخدم غير موجود' };
  }

  // Admins are always allowed (used internally for admin-side counter offers).
  if (String(user.role || '').toLowerCase() === 'admin') {
    return { ok: true, reason: null };
  }

  // Hard blocks first — banned/suspended/rejected accounts must never bid,
  // regardless of biddingEnabled.
  const status = String(user.status || '').toLowerCase();
  if (status === 'banned' || status === 'suspended' || status === 'rejected' || status === 'blocked') {
    return {
      ok: false,
      reason: 'banned',
      message: 'حسابك معلّق. لا يمكن المزايدة. للاستفسار راسل info@autopro.ac',
    };
  }

  // Single explicit bidding gate — admin must flip this on after verifying
  // deposit + KYC + identity. Replaces the old status='active' && deposit>0
  // check, which conflated registration approval with bidding permission.
  if (Number(user.biddingEnabled) !== 1) {
    return {
      ok: false,
      reason: 'not-bidding-enabled',
      message: 'لم يتم تفعيل صلاحية المزايدة في حسابك. راسل الإدارة لتفعيلها بعد دفع العربون.',
    };
  }

  return { ok: true, reason: null };
}

/**
 * Throwing variant — convenient for socket handlers and try/catch flows.
 * Throws an Error whose message is safe to forward to the user (Arabic).
 * The thrown error has `eligibilityReason` for fine-grained handling.
 */
export function assertCanBid(user: any): void {
  const r = checkBidEligibility(user);
  if (!r.ok) {
    const err: any = new Error(r.message || 'لا يمكن المزايدة');
    err.eligibilityReason = r.reason;
    err.statusCode = r.reason === 'not-found' ? 404 : 403;
    throw err;
  }
}
