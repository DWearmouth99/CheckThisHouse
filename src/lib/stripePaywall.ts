import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';

const DATA_DIR = path.join(process.cwd(), 'data');
const USED_SESSIONS_FILE = path.join(DATA_DIR, 'used-checkout-sessions.json');

export type CheckoutMeta = {
  listingUrl: string;
  buyerGoal: string;
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readUsedSessions(): Record<string, { usedAt: string; listingUrl?: string }> {
  try {
    ensureDataDir();
    if (!fs.existsSync(USED_SESSIONS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USED_SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeUsedSessions(map: Record<string, { usedAt: string; listingUrl?: string }>) {
  ensureDataDir();
  fs.writeFileSync(USED_SESSIONS_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function getStripeSecretKey(): string {
  const raw = process.env.STRIPE_SECRET_KEY || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function isValidStripeSecretKey(key: string): boolean {
  // Real Stripe secrets are long; reject placeholders like sk_test_...
  if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) return false;
  if (key.includes('...')) return false;
  if (key.length < 20) return false;
  return true;
}

export function isPaywallEnabled(): boolean {
  if (process.env.PAYWALL_DISABLED === 'true' || process.env.PAYWALL_DISABLED === '1') {
    return false;
  }
  return isValidStripeSecretKey(getStripeSecretKey());
}

export function getReportPricePence(): number {
  const n = parseInt(process.env.REPORT_PRICE_PENCE || '499', 10);
  return Number.isFinite(n) && n >= 100 ? n : 499;
}

export function formatPriceLabel(pence = getReportPricePence()): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

export function getStripe(): Stripe {
  const key = getStripeSecretKey();
  if (!isValidStripeSecretKey(key)) {
    throw new Error(
      'STRIPE_SECRET_KEY is missing, commented out, or still a placeholder. In .env.local use one uncommented line: STRIPE_SECRET_KEY=sk_test_... (full key from the Dashboard, no #, no quotes). Remove PAYWALL_DISABLED=true. Then restart npm run dev.'
    );
  }
  return new Stripe(key);
}

export function getPublicBaseUrl(reqHost?: string, proto?: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (reqHost) return `${proto === 'https' ? 'https' : 'http'}://${reqHost}`;
  return 'http://localhost:3000';
}

export function getStripePublishableKey(): string {
  const raw = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const key = raw.trim().replace(/^["']|["']$/g, '');
  if (!key.startsWith('pk_test_') && !key.startsWith('pk_live_')) return '';
  if (key.includes('...')) return '';
  if (key.length < 20) return '';
  return key;
}

export async function createReportCheckoutSession(opts: {
  listingUrl: string;
  buyerGoal: string;
  baseUrl: string;
  customerEmail?: string;
  /** embedded = on-site panel; hosted = full-page Stripe redirect */
  uiMode?: 'embedded' | 'hosted';
}): Promise<{ sessionId: string; url?: string; clientSecret?: string }> {
  const stripe = getStripe();
  const pricePence = getReportPricePence();
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  const uiMode = opts.uiMode || 'embedded';

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: pricePence,
            product_data: {
              name: 'CheckThisHouse Property Report',
              description: 'Single listing property report',
            },
          },
        },
      ];

  const metadata = {
    listingUrl: opts.listingUrl.slice(0, 450),
    buyerGoal: opts.buyerGoal.slice(0, 100),
    product: 'property_report',
  };

  if (uiMode === 'embedded') {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: lineItems,
      return_url: `${opts.baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      customer_email: opts.customerEmail || undefined,
      metadata,
      // Soft brand cues inside Stripe’s form (Dashboard branding still wins for logo/colours)
      custom_text: {
        submit: { message: 'You’ll get your CheckThisHouse PDF right after payment.' },
      },
    });

    if (!session.client_secret) {
      throw new Error('Stripe did not return an embedded Checkout client secret');
    }

    return { sessionId: session.id, clientSecret: session.client_secret };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: `${opts.baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.baseUrl}/?checkout=cancelled#generate`,
    customer_email: opts.customerEmail || undefined,
    metadata,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout URL');
  }

  return { sessionId: session.id, url: session.url };
}

export type PaidSession = {
  sessionId: string;
  listingUrl: string;
  buyerGoal: string;
  amountTotal: number | null;
  currency: string | null;
};

export async function verifyPaidCheckoutSession(opts: {
  sessionId: string;
  listingUrl: string;
}): Promise<PaidSession> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(opts.sessionId);

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw Object.assign(new Error('Payment is not complete yet. Finish checkout and try again.'), {
      status: 402,
    });
  }

  const paidUrl = (session.metadata?.listingUrl || '').trim();
  if (paidUrl && paidUrl !== opts.listingUrl.trim()) {
    throw Object.assign(
      new Error('This payment was for a different listing link. Start checkout again for this property.'),
      { status: 403 }
    );
  }

  const used = readUsedSessions();
  if (used[opts.sessionId]) {
    throw Object.assign(
      new Error('This payment has already been used for a report. Please purchase another report.'),
      { status: 409 }
    );
  }

  return {
    sessionId: session.id,
    listingUrl: paidUrl || opts.listingUrl,
    buyerGoal: session.metadata?.buyerGoal || 'First-time Buyer',
    amountTotal: session.amount_total,
    currency: session.currency,
  };
}

export function markCheckoutSessionUsed(sessionId: string, listingUrl?: string) {
  const used = readUsedSessions();
  used[sessionId] = {
    usedAt: new Date().toISOString(),
    listingUrl,
  };
  writeUsedSessions(used);
}

/** @deprecated prefer verify + markCheckoutSessionUsed after successful analyze */
export async function consumePaidCheckoutSession(opts: {
  sessionId: string;
  listingUrl: string;
}): Promise<PaidSession> {
  const paid = await verifyPaidCheckoutSession(opts);
  markCheckoutSessionUsed(opts.sessionId, opts.listingUrl);
  return paid;
}
