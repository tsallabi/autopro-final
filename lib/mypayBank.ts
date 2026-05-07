/**
 * mypay.ly payment gateway client (Libyan banks via mypay.ly).
 *
 * Credentials live ONLY in Render env vars — never in code:
 *   MYPAY_CLIENT_ID
 *   MYPAY_CLIENT_SECRET
 *   MYPAY_API_BASE       (default: https://mypay.ly/merchant/developer/api)
 *   MYPAY_REDIRECT_URL   (where mypay sends user back after payment)
 *   MYPAY_WEBHOOK_SECRET (used to verify mypay → us webhooks)
 *
 * Status: SCAFFOLD. Endpoint paths and field names follow the most common
 * OAuth2 + checkout-link pattern; verify against mypay.ly's actual docs
 * before going live, then adjust the URLs / field names below as needed.
 */

let cachedToken: { value: string; expiresAt: number } | null = null;

export interface MyPayConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  redirectUrl: string;
  webhookSecret?: string;
}

export function readMyPayConfig(): MyPayConfig | null {
  const clientId = process.env.MYPAY_CLIENT_ID;
  const clientSecret = process.env.MYPAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    apiBase: (process.env.MYPAY_API_BASE || 'https://mypay.ly/merchant/developer/api').replace(/\/$/, ''),
    redirectUrl: process.env.MYPAY_REDIRECT_URL || 'https://autopro.ac/wallet?paid=1',
    webhookSecret: process.env.MYPAY_WEBHOOK_SECRET,
  };
}

export function isConfigured(): boolean {
  return !!readMyPayConfig();
}

async function getAccessToken(cfg: MyPayConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(`${cfg.apiBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`mypay token failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const ttlSec = Number(data.expires_in) || 3600;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + ttlSec * 800,
  };
  return cachedToken.value;
}

export async function createCheckoutLink(args: {
  amount: number;
  currency?: string;
  orderId: string;
  description?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<{ checkoutUrl: string; gatewayRef: string }> {
  const cfg = readMyPayConfig();
  if (!cfg) throw new Error('mypay not configured (set MYPAY_CLIENT_ID + MYPAY_CLIENT_SECRET)');

  const token = await getAccessToken(cfg);

  const payload = {
    amount: Math.round(args.amount * 100),
    currency: args.currency || 'LYD',
    reference: args.orderId,
    description: args.description || `AutoPro deposit ${args.orderId}`,
    customer: { email: args.customerEmail, phone: args.customerPhone },
    return_url: cfg.redirectUrl,
  };

  const res = await fetch(`${cfg.apiBase}/payments/create`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`mypay create failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const data: any = await res.json();

  const checkoutUrl =
    data.checkout_url || data.checkoutUrl || data.paymentUrl || data.redirect || data.url;
  const gatewayRef = data.id || data.transaction_id || data.reference || args.orderId;

  if (!checkoutUrl) {
    throw new Error('mypay create returned no checkout URL — check API response shape');
  }
  return { checkoutUrl, gatewayRef };
}

export async function verifyPayment(gatewayRef: string): Promise<{ status: string; amount: number; raw: any }> {
  const cfg = readMyPayConfig();
  if (!cfg) throw new Error('mypay not configured');
  const token = await getAccessToken(cfg);
  const res = await fetch(`${cfg.apiBase}/payments/${encodeURIComponent(gatewayRef)}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`mypay verify failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return {
    status: data.status || data.state || 'unknown',
    amount: Number(data.amount) || 0,
    raw: data,
  };
}

export async function verifyWebhookSignature(rawBody: string, signature: string | undefined): Promise<boolean> {
  const cfg = readMyPayConfig();
  if (!cfg?.webhookSecret) return true;
  if (!signature) return false;
  try {
    const crypto = await import('crypto');
    const computed = crypto.createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}
