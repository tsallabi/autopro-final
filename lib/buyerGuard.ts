/**
 * Buyer Guard — central eligibility check before any bidding action.
 *
 * Used by:
 *  - sockets/index.ts: place_bid, set_proxy_bid
 *  - routes/buyer.ts:  POST /api/cars/:id/offer
 *  - any future bid/offer endpoint
 *
 * The check is conservative: a user can only bid if their account has been
 * approved by an admin (status='active') AND they have actually paid a
 * deposit (deposit > 0). This prevents the "registered but not approved"
 * scenario where a fresh OAuth account could bid before any verification.
 *
 * Why this lives in lib/ (not just inline in each handler):
 *   - Single source of truth — change the policy once, applies everywhere.
 *   - Returns an Arabic message ready to surface to the user.
 *   - Easy to extend later (e.g., require KYC documents, age check, etc.).
 */

export type IneligibilityReason =
  | 'not-found'
  | 'not-active'
  | 'no-deposit'
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

  // Hard blocks first — banned/suspended/rejected accounts must never bid.
  const status = String(user.status || '').toLowerCase();
  if (status === 'banned' || status === 'suspended' || status === 'rejected' || status === 'blocked') {
    return {
      ok: false,
      reason: 'banned',
      message: 'حسابك معلّق. لا يمكن المزايدة. للاستفسار راسل info@autopro.ac',
    };
  }

  // Admin must approve before any bid is allowed.
  // Accepts only 'active' — any other value (pending, pending_approval, '', null) is blocked.
  if (status !== 'active') {
    return {
      ok: false,
      reason: 'not-active',
      message: 'حسابك بانتظار موافقة الإدارة. لا يمكن المزايدة قبل تفعيل الحساب.',
    };
  }

  // Deposit must be paid. buyingPower alone is not enough — admin could grant
  // buyingPower by mistake without the user having any skin in the game.
  const deposit = Number(user.deposit) || 0;
  if (deposit <= 0) {
    return {
      ok: false,
      reason: 'no-deposit',
      message: 'يجب دفع العربون قبل المزايدة. الحد الأدنى $500 (خارج ليبيا) أو 1,000 د.ل (داخل ليبيا).',
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
