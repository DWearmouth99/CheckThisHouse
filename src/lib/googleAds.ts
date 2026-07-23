/**
 * Google Ads conversion helpers (gtag already loaded in index.html for AW-18341092869).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const REPORT_PURCHASE_SEND_TO = 'AW-18341092869/dp5RCK6A_tQcEIW826lE';
const FIRED_KEY_PREFIX = 'cth_gads_conv_';

/** Default report price in GBP — keep in sync with REPORT_PRICE_PENCE (499). */
export const REPORT_PURCHASE_VALUE_GBP = 4.99;

/**
 * Fire the "Report Purchase" conversion once per Stripe Checkout session.
 * Uses session_id as transaction_id so Google Ads can dedupe retries/refreshes.
 */
export function trackReportPurchaseConversion(opts: {
  transactionId: string;
  value?: number;
  currency?: string;
}): boolean {
  const transactionId = String(opts.transactionId || '').trim();
  if (!transactionId || typeof window === 'undefined') return false;

  const firedKey = `${FIRED_KEY_PREFIX}${transactionId}`;
  try {
    if (sessionStorage.getItem(firedKey)) return false;
  } catch {
    /* private mode — still attempt once */
  }

  if (typeof window.gtag !== 'function') {
    console.warn('[ads] gtag not ready — conversion not sent');
    return false;
  }

  const value = opts.value ?? REPORT_PURCHASE_VALUE_GBP;
  const currency = opts.currency || 'GBP';

  window.gtag('event', 'conversion', {
    send_to: REPORT_PURCHASE_SEND_TO,
    value,
    currency,
    transaction_id: transactionId,
  });

  try {
    sessionStorage.setItem(firedKey, '1');
  } catch {
    /* ignore */
  }

  console.log('[ads] Report Purchase conversion', { transactionId, value, currency });
  return true;
}
