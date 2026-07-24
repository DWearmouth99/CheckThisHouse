import { validateUkAddress, isInvalidAddress } from './ukAddress';
import { listingNeedsAddressConfirm } from './listingAddressConfirm';
import { assessReportCoverage } from './ukCoverage';

export type ListingPaymentIdentity = {
  limited?: boolean;
  mode?: 'listing' | 'address' | string | null;
  host?: string | null;
  portal?: string | null;
  address?: string | null;
  price?: string | null;
  postcode?: string | null;
};

export type ListingPaymentGate =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      suggestAddressLookup: boolean;
      /** Region waitlist — do not open Stripe */
      outsideCoverage?: boolean;
      waitlistRegion?: null;
    };

function isAddressMode(input: ListingPaymentIdentity): boolean {
  return input.mode === 'address' || input.host === 'address';
}

function portalLabel(input: ListingPaymentIdentity): string {
  const raw = (input.portal || input.host || 'this listing site').toString();
  if (/rightmove/i.test(raw)) return 'Rightmove';
  if (/zoopla/i.test(raw)) return 'Zoopla';
  if (/onthemarket/i.test(raw)) return 'OnTheMarket';
  if (/zillow/i.test(raw)) return 'Zillow';
  return raw.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Hard gate before Stripe: listing reports need a readable property identity.
 * Address-mode lookups are allowed through (already validated / confirmed upstream).
 * Incomplete Rightmove street-only addresses should be confirmed via the door-number picker first.
 * Outside-coverage regions (none currently) cannot purchase.
 */
export function assessListingPaymentGate(input: ListingPaymentIdentity): ListingPaymentGate {
  const coverage = assessReportCoverage(input.postcode || input.address);
  if (!coverage.supported && coverage.waitlistRegion) {
    return {
      ok: false,
      suggestAddressLookup: false,
      outsideCoverage: true,
      waitlistRegion: coverage.waitlistRegion,
      reason:
        coverage.message ||
        `We don't yet cover ${coverage.waitlistRegion} — our official-record sources differ there. Join the waitlist.`,
    };
  }

  if (isAddressMode(input)) return { ok: true };

  const portal = portalLabel(input);
  const isRightmove = /rightmove/i.test(`${input.portal || ''} ${input.host || ''}`);

  if (!isRightmove) {
    return {
      ok: false,
      suggestAddressLookup: true,
      reason: `${portal} links can’t be read reliably yet. Confirm the exact UK address (or use a Rightmove link) before paying.`,
    };
  }

  if (input.limited) {
    return {
      ok: false,
      suggestAddressLookup: true,
      reason:
        'We couldn’t read enough from this Rightmove listing (it may be blocked, incomplete, or missing key details). Confirm the exact address before paying.',
    };
  }

  const address = (input.address || '').trim();
  if (!address || listingNeedsAddressConfirm(address)) {
    return {
      ok: false,
      suggestAddressLookup: true,
      reason:
        'This listing doesn’t show a full door number and postcode. Confirm the exact property from the address list before paying so we research the right house.',
    };
  }

  const addrCheck = validateUkAddress(address);
  if (isInvalidAddress(addrCheck)) {
    return {
      ok: false,
      suggestAddressLookup: true,
      reason:
        'This listing doesn’t show a full door number and postcode. Confirm the exact property from the address list before paying so we research the right house.',
    };
  }

  return { ok: true };
}

export function canUnlockListingPayment(input: ListingPaymentIdentity): boolean {
  return assessListingPaymentGate(input).ok;
}
